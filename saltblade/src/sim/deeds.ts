// Deeds: things worth remembering, noted in the journal when they happen.
// There is no main quest in the waste; these are the stories people tell.
import { S } from './ctx';
import type { World } from './world';
import { Char } from './char';
import { SKILLS, SK } from './skills';
import { playerBase } from './base';
import { totalBounty } from './crime';

export interface Deed { key: string; name: string; desc: string; check: (W: World, mine: Char[]) => boolean; }

const fighting = ['melee_atk', 'melee_def', 'katanas', 'sabres', 'hackers', 'heavy', 'blunt', 'polearms', 'unarmed', 'crossbows'] as const;
const count = (W: World, k: string) => (W.flags[k] as number | undefined) ?? 0;

export const DEEDS: Deed[] = [
  { key: 'first_blood', name: 'First Blood', desc: 'Knock someone out in a fight.', check: (W, m) => m.some((c) => c.stats.kos > 0) },
  { key: 'first_kill', name: 'No Going Back', desc: 'Kill someone.', check: (W, m) => m.some((c) => c.stats.kills > 0) },
  { key: 'company', name: 'Company', desc: 'Have two people travelling together.', check: (W, m) => m.filter((c) => c.alive && !c.animal).length >= 2 },
  { key: 'band', name: 'A Band of Five', desc: 'Lead five people.', check: (W, m) => m.filter((c) => c.alive && !c.animal).length >= 5 },
  { key: 'faction', name: 'A Faction of Your Own', desc: 'Lead twelve people.', check: (W, m) => m.filter((c) => c.alive && !c.animal).length >= 12 },
  { key: 'beast', name: 'Faithful Beast', desc: 'Own an animal.', check: (W, m) => m.some((c) => c.alive && !!c.animal) },
  { key: 'purse', name: 'A Heavy Purse', desc: 'Hold 20,000 chits.', check: (W) => W.money >= 20000 },
  { key: 'magnate', name: 'Magnate', desc: 'Hold 100,000 chits.', check: (W) => W.money >= 100000 },
  { key: 'homeowner', name: 'A Roof in Town', desc: 'Buy a house in a town.', check: (W) => [...W.objs.values()].some((o) => o.kind === 'building' && o.owner === 'player' && !!o.site) },
  { key: 'founder', name: 'Founder', desc: 'Build a base of your own in the wilds.', check: () => !!playerBase() },
  { key: 'fortress', name: 'Fortress', desc: 'Raise walls around a base of forty or more pieces.', check: (W) => { const b = playerBase(); return !!b && b.n >= 40 && [...W.objs.values()].some((o) => o.owner === 'player' && o.kind === 'wall'); } },
  { key: 'defender', name: 'Hold the Line', desc: 'Beat off a raid on your base.', check: (W) => count(W, 'raidsRepelled') >= 1 },
  { key: 'scholar', name: 'Scholar', desc: 'Finish five research topics.', check: (W) => W.research.done.size >= 5 },
  { key: 'reader', name: 'Well Read', desc: 'Have one of your people read ten books.', check: (W, m) => m.some((c) => (c.mem.read?.length ?? 0) >= 10) },
  { key: 'hunter', name: 'Bounty Hunter', desc: 'Collect a bounty.', check: (W) => count(W, 'bounties') >= 1 },
  { key: 'hunter5', name: 'The Law of the Road', desc: 'Collect five bounties.', check: (W) => count(W, 'bounties') >= 5 },
  { key: 'explorer', name: 'Wayfarer', desc: 'Find twelve towns.', check: (W) => S.T.sites.filter((s) => s.kind === 'town' && W.discovered.has(s.id)).length >= 12 },
  { key: 'cartographer', name: 'Every Road', desc: 'Find every town in the waste.', check: (W) => S.T.sites.filter((s) => s.kind === 'town').every((s) => W.discovered.has(s.id)) },
  { key: 'free', name: 'Unchained', desc: 'Escape from slavery.', check: (W) => !!W.flags.escaped },
  { key: 'liberator', name: 'Liberator', desc: 'Free five slaves.', check: (W) => count(W, 'freed') >= 5 },
  { key: 'survivor', name: 'Thirty Days', desc: 'Survive thirty days.', check: () => S.clock.day >= 31 },
  { key: 'year', name: 'A Long Walk', desc: 'Survive a hundred days.', check: () => S.clock.day >= 101 },
  { key: 'veteran', name: 'Veteran', desc: 'Raise a fighting skill to 50.', check: (W, m) => m.some((c) => fighting.some((s) => c.sk[SK[s]] >= 50)) },
  { key: 'master', name: 'Master', desc: 'Raise any skill to 80.', check: (W, m) => m.some((c) => SKILLS.some((s) => c.sk[SK[s]] >= 80)) },
  { key: 'iron_limb', name: 'Iron Limb', desc: 'Fit a prosthetic.', check: (W) => count(W, 'prosthetics') >= 1 },
  { key: 'pit', name: 'Champion of the Pit', desc: 'Beat the Champion of the Pit at Hornspire.', check: (W) => (W.flags.pitWins ?? -1) >= 2 },
  { key: 'kingslayer', name: 'Kingslayer', desc: 'Bring down the leader of a faction.', check: (W) => count(W, 'leadersKilled') >= 1 },
  { key: 'most_wanted', name: 'Most Wanted', desc: 'Carry a price of 10,000 chits on one head.', check: (W, m) => m.some((c) => totalBounty(c) >= 10000) },
];

let t = 0;
export function tickDeeds(dt: number) {
  t -= dt;
  if (t > 0) return;
  t = 3;
  const W = S.W;
  const done: Record<string, number> = W.flags.deeds ?? (W.flags.deeds = {});
  const mine = W.playerChars();
  // what is already true when a game begins (a band of four, a homestead) is noted quietly
  const quiet = !W.flags.deedsBegun;
  W.flags.deedsBegun = true;
  for (const d of DEEDS) {
    if (done[d.key] !== undefined) continue;
    let ok = false;
    try { ok = d.check(W, mine); } catch { ok = false; }
    if (!ok) continue;
    done[d.key] = S.clock.t;
    if (quiet) continue;
    W.say(`Deed: ${d.name}. ${d.desc}`, 'story', S.clock.t);
    S.fx.notice(`Deed: ${d.name}`, 'good');
  }
}
