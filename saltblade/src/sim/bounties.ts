// The bounty board: named outlaws with prices on their heads, posted by the
// lawful powers. Bring one to a guard of the faction that posted it, alive
// for the full reward or dead for most of it.
import { S } from './ctx';
import { Char } from './char';
import { RNG, hash3 } from '../core/rng';
import { personName } from '../content/names';
import { findFreeCage } from './ai';
import { dropCarried } from './health';
import { FACTION } from '../content/factions';

export interface Bounty {
  key: string;
  name: string;
  title: string;
  faction: string; // the outlaw's own faction
  poster: string; // who pays
  reward: number;
  site: number; // where they hold out
  race: string;
  charId: number; // once they exist
  status: 'open' | 'claimed' | 'dead';
}

const OUTLAWS: Record<string, { title: string[]; reward: [number, number]; race: string[] }> = {
  camp_reavers: { title: ['Reaver Boss', 'the Toll-Taker', 'Road Captain', 'the Dust King'], reward: [1500, 4000], race: ['duneborn', 'valefolk', 'karuk'] },
  camp_scorched: { title: ['Leaf Baron', 'Field Master', 'the Grower'], reward: [2500, 5000], race: ['valefolk', 'duneborn'] },
  camp_mawkin: { title: ['Pit Chief', 'the Gnawer', 'Bone Mother'], reward: [3000, 6000], race: ['valefolk', 'duneborn'] },
  camp_starvelings: { title: ['Hunger Chief', 'the Hollow-Bellied'], reward: [600, 1500], race: ['valefolk', 'duneborn'] },
};

/** Posts bounties for the leaders of outlaw camps (called for a new world). */
export function postBounties() {
  const W = S.W;
  W.bountyBoard = [];
  for (const site of S.T.sites) {
    const spec = OUTLAWS[site.kind] ?? (site.kind === 'town' && site.faction === 'reavers' ? { title: ['Reaver Lord'], reward: [8000, 12000] as [number, number], race: ['karuk', 'duneborn'] } : null);
    if (!spec) continue;
    const rng = new RNG(hash3(site.seed, 991, 4));
    if (site.kind !== 'town' && !rng.chance(0.7)) continue;
    // the nearest lawful town posts it
    const town = S.T.nearestSite(site.x, site.z, (s) => s.kind === 'town' && !!s.faction && !!FACTION[s.faction].lawful && s.faction !== 'chainhouse');
    if (!town) continue;
    const race = rng.pick(spec.race);
    const female = rng.chance(0.3);
    W.bountyBoard.push({
      key: 'b' + site.id, name: personName(race, female, rng), title: rng.pick(spec.title),
      faction: site.faction ?? (site.kind === 'camp_reavers' ? 'reavers' : site.kind === 'camp_scorched' ? 'scorched' : site.kind === 'camp_mawkin' ? 'mawkin' : 'starvelings'),
      poster: town.faction!, reward: Math.round(rng.range(spec.reward[0], spec.reward[1]) / 50) * 50, site: site.id, race, charId: 0, status: 'open',
    });
  }
}

/** The bounty on a site's leader, if there is one still open. */
export function bountyAt(siteId: number): Bounty | undefined {
  return S.W.bountyBoard.find((b) => b.site === siteId && b.status === 'open' && !b.charId);
}

/** Makes a freshly spawned leader into the wanted outlaw. */
export function markWanted(c: Char, b: Bounty) {
  c.name = b.name;
  c.title = b.title;
  c.mem.bounty = b.key;
  c.bounty[b.poster] = b.reward;
  b.charId = c.id;
}

export function bountyOf(c: Char | undefined): Bounty | undefined {
  if (!c?.mem.bounty) return undefined;
  return S.W.bountyBoard.find((b) => b.key === c.mem.bounty && b.status === 'open');
}

/** What a guard of a faction would pay for the body you are carrying, or 0. */
export function claimValue(p: Char, faction: string): number {
  const t = S.W.char(p.carrying);
  const b = bountyOf(t);
  if (!b || !t) return 0;
  if (b.poster !== faction && S.W.rel.get(b.poster, faction) < 60) return 0;
  return t.status === 'dead' ? Math.round(b.reward * 0.6) : b.reward;
}

/** Hands the carried outlaw over: the reward, a cage for the living, a grave for the dead. */
export function claimBounty(p: Char, faction: string): number {
  const t = S.W.char(p.carrying);
  const b = bountyOf(t);
  const pay = claimValue(p, faction);
  if (!t || !b || !pay) return 0;
  dropCarried(p);
  b.status = t.status === 'dead' ? 'dead' : 'claimed';
  S.W.money += pay;
  S.W.rel.add('player', faction, 6);
  if (t.status !== 'dead') {
    const cage = findFreeCage(0, p.x, p.z);
    if (cage && Math.hypot(cage.x - p.x, cage.z - p.z) < 150) {
      cage.occupant = t.id; t.cage = cage.id; t.x = cage.x; t.z = cage.z;
      t.mem.jailUntil = S.clock.t + 86400 * 30;
    } else S.W.removeChar(t);
  } else S.W.removeChar(t);
  delete t.mem.bounty;
  S.W.say(`${p.name} collected ${pay} chits for ${b.name}, ${b.title}.`, 'good', S.clock.t);
  S.fx.notice(`Bounty collected: ${pay} chits.`, 'good');
  S.fx.sound('coin', p.x, p.z);
  return pay;
}

/** Open bounties a faction's people will tell you about. */
export function bountiesFor(faction: string): Bounty[] {
  return S.W.bountyBoard.filter((b) => b.status === 'open' && (b.poster === faction || S.W.rel.get(b.poster, faction) >= 60));
}
