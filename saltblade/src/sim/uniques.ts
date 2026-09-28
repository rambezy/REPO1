// Named people of the waste (content/uniques): placed in their settlement
// when it first fills with people, each with a past, a price and a
// condition before they will follow you.
import { S } from './ctx';
import { World } from './world';
import { Char } from './char';
import { makePerson } from './spawn';
import { Squad } from './squad';
import { RNG, hash3 } from '../core/rng';
import { UNIQUES, UniqueChar } from '../content/uniques';
import { RACE } from '../content/races';
import type { TownInfo } from '../world/towns';
import { SK } from './skills';
import { findFreeCage } from './ai';
import { strengthOf } from './combat';
import { totalBounty } from './crime';

export const UNIQUE_BY_KEY: Record<string, UniqueChar> = Object.fromEntries(UNIQUES.map((u) => [u.key, u]));

function factionFor(u: UniqueChar, town: string): string {
  if (u.where === 'camp') return town;
  if (u.where === 'cage') return RACE[u.race]?.robotic ? 'hollows' : u.loadout === 'unchained' ? 'unchained' : 'drifters';
  // they belong to the town only if they are its own people; otherwise they are drifters passing through
  return u.loadout.split('_')[0] === town ? town : 'drifters';
}

/** Places the named people who live in a town (called as it is populated). */
export function placeUniques(W: World, info: TownInfo) {
  const site = info.site;
  const placed: string[] = W.flags.uniques ?? (W.flags.uniques = []);
  for (const u of UNIQUES) {
    if (u.settlement !== site.settlement || placed.includes(u.key)) continue;
    placed.push(u.key);
    const rng = new RNG(hash3(site.seed, u.key.length * 131, 17));
    const fac = factionFor(u, site.faction ?? 'drifters');
    const c = makePerson(W, { faction: fac, role: u.where === 'cage' ? 'prisoner' : 'recruit', race: u.race, female: u.female, level: u.level, loadout: u.loadout, name: u.name }, rng);
    c.look = { ...c.look, ...(u.look ?? {}) };
    for (const [k, v] of Object.entries(u.skills ?? {})) c.sk[SK[k as keyof typeof SK]] = v as number;
    c.body.rescale(c.look.race, c.sk[SK.toughness]);
    c.name = u.name;
    c.title = u.title;
    c.unique = u.key;
    c.dialogue = 'unique';
    c.price = u.price;
    c.mem.backstory = u.story;
    c.site = site.id;
    let home = fac === site.faction ? [...W.squads.values()].find((q) => q.site === site.id && q.faction === fac && q.kind === 'town') : undefined;
    if (!home) { home = new Squad(); home.faction = fac; home.kind = 'town'; home.name = u.name; home.site = site.id; W.addSquad(home); }
    W.moveToSquad(c, home);
    let x = site.x, z = site.z, dir = rng.range(0, Math.PI * 2);
    if (u.where === 'bar') {
      const seats = info.bars.flatMap((b) => b.seats).filter(([, , , id]) => !W.objs.get(id)?.user);
      if (seats.length) {
        const [sx, sz, sr, id] = rng.pick(seats);
        x = sx; z = sz; dir = sr;
        const stool = W.objs.get(id);
        if (stool) { stool.user = c.id; c.mem.seat = id; c.mem.using = id; c.mem.sit = true; }
      }
    } else if (u.where === 'gate' && info.gates.length) {
      const g = info.gates[0];
      x = g.x + (site.x - g.x) * 0.08; z = g.z + (site.z - g.z) * 0.08;
      dir = Math.atan2(g.x - site.x, g.z - site.z);
    } else if (u.where === 'cage') {
      let cage = findFreeCage(site.id, site.x, site.z);
      if (!cage) {
        // make room: someone else is moved on
        cage = [...W.objs.values()].find((o) => o.kind === 'cage' && o.site === site.id) ?? null;
        const other = cage?.occupant ? W.char(cage.occupant) : undefined;
        if (other) W.removeChar(other);
        if (cage) cage.occupant = 0;
      }
      if (cage) {
        cage.occupant = c.id;
        c.cage = cage.id;
        x = cage.x; z = cage.z;
        c.mem.prisonerOf = site.faction;
      } else c.shackled = true;
    } else {
      const a = rng.range(0, Math.PI * 2), d = rng.range(3, Math.max(5, info.plazaR * 0.7));
      x = site.x + Math.sin(a) * d; z = site.z + Math.cos(a) * d;
    }
    const spot = u.where === 'cage' || u.where === 'bar' ? [x, z] : S.nav.nearestOpen(x, z, 8) ?? [x, z];
    c.x = spot[0]; c.z = spot[1]; c.y = S.T.heightAt(c.x, c.z);
    c.homeX = c.x; c.homeZ = c.z; c.dir = dir; c.homeDir = dir;
  }
  if (site.settlement === 'chainfield') placeAma(W, info);
}

/** Tunde's sister Ama, still cutting riceweed in the east paddy at Chainfield. */
function placeAma(W: World, info: TownInfo) {
  if (W.flags.amaPlaced || !info.jobs.length) return;
  W.flags.amaPlaced = true;
  const site = info.site;
  const town = [...W.squads.values()].find((q) => q.site === site.id && q.kind === 'town' && q.faction === site.faction);
  if (!town) return;
  const job = info.jobs.reduce((a, b) => (b.x > a.x ? b : a)); // the east paddy
  const c = makePerson(W, { faction: site.faction ?? 'chainhouse', role: 'slave', race: 'duneborn', female: true, level: 14, name: 'Ama' }, new RNG(hash3(site.seed, 7171, 3)));
  c.name = 'Ama';
  c.title = 'Slave';
  c.mem.enslavedBy = site.faction;
  c.mem.sister = 'tunde_runaway';
  c.mem.backstory = 'Ama was sold to Chainfield with her younger brother Tunde. He ran west through the reeds in their tenth year. She stayed, and cut riceweed, and did not stop believing he would come back.';
  c.site = site.id;
  W.moveToSquad(c, town);
  const spot = S.nav.nearestOpen(job.x + 1.5, job.z, 6) ?? [job.x, job.z];
  c.x = spot[0]; c.z = spot[1]; c.y = S.T.heightAt(c.x, c.z);
  c.homeX = c.x; c.homeZ = c.z; c.homeDir = c.dir = job.dir;
}

/** Whether a named person's condition for joining is met. */
export function uniqueReady(u: UniqueChar, p: Char, n: Char): boolean {
  const mine = S.W.playerChars().filter((c) => c.alive);
  switch (u.needs ?? 'none') {
    case 'freed': return !n.cage && !n.shackled;
    case 'no_bounty': return mine.every((c) => totalBounty(c) === 0);
    case 'has_hollow': return mine.some((c) => RACE[c.look.race]?.race === 'hollow');
    case 'has_karuk': return mine.some((c) => RACE[c.look.race]?.race === 'karuk');
    case 'strong_squad': return strengthOf(mine.filter((c) => Math.hypot(c.x - p.x, c.z - p.z) < 60)) >= 380;
    case 'rich': return S.W.money >= Math.max(15000, u.price * 2);
    default: return true;
  }
}
