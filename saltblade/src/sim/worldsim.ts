// The world beyond the player's sight: patrols march between towns, traders
// travel with hired guards, bandits and beasts roam their lands, slavers
// hunt the lonely. Far from the player they move abstractly and settle their
// fights by numbers; near the player they come alive.
import { S } from './ctx';
import { Squad, SquadKind } from './squad';
import { makePerson, makeAnimal } from './spawn';
import { Char, Role } from './char';
import { RNG } from '../core/rng';
import { REGIONS } from '../world/regions';
import { FACTION } from '../content/factions';
import { SETTLEMENT } from '../content/layout';
import { ANIMAL } from '../content/animals';
import { strengthOf } from './combat';
import { makeShop } from './shops';
import { Grid } from './inventory';
import { anchors } from './sim';
import { tickShops } from './shops';
import { kill, knockOut } from './health';
import { WORLD } from '../world/consts';

const rng = new RNG(4242);
let t = 0;
let shopT = 0;

interface Spec { key: string; faction: string; kind: SquadKind; role: Role; n: [number, number]; weight: number; regions?: string[]; from?: string[]; to?: string[]; species?: string; loadout?: string; lead?: string; }

const SPECS: Spec[] = [
  { key: 'concord_patrol', faction: 'concord', kind: 'patrol', role: 'patrol', n: [4, 6], weight: 3, from: ['aurum', 'harrowmarket', 'stonegate', 'saltmere'], to: ['aurum', 'harrowmarket', 'stonegate', 'saltmere', 'chainfield', 'squatters', 'lowtide'] },
  { key: 'ember_patrol', faction: 'ember', kind: 'patrol', role: 'patrol', n: [4, 7], weight: 3, from: ['cinderhold', 'brightwater', 'pyreswatch'], to: ['cinderhold', 'brightwater', 'pyreswatch', 'crossroad', 'squatters'] },
  { key: 'karuk_band', faction: 'karuk', kind: 'patrol', role: 'patrol', n: [3, 6], weight: 2, from: ['hornspire', 'redmesa'], to: ['hornspire', 'redmesa', 'brightwater', 'crossroad', 'humminghollow'] },
  { key: 'watch_patrol', faction: 'drifters', kind: 'patrol', role: 'patrol', n: [3, 4], weight: 1.5, from: ['crossroad'], to: ['squatters', 'dustwell', 'crossroad'] },
  { key: 'caravan', faction: 'drifters', kind: 'caravan', role: 'caravan', n: [1, 2], weight: 3, from: ['crossroad', 'harrowmarket', 'dustwell', 'squatters', 'mudwater', 'lanternrest', 'aurum', 'saltmere', 'stonegate'], to: ['crossroad', 'harrowmarket', 'dustwell', 'squatters', 'mudwater', 'lanternrest', 'aurum', 'saltmere', 'stonegate', 'lowtide'] },
  { key: 'delver_trip', faction: 'delvers', kind: 'wanderers', role: 'hunter', n: [2, 4], weight: 1.2, from: ['lanternrest', 'glassfall'], to: ['lanternrest', 'glassfall', 'rustward', 'harrowmarket'] },
  { key: 'slavers', faction: 'chainhouse', kind: 'slavers', role: 'slaver', n: [3, 6], weight: 2, regions: ['salt', 'flats', 'vale'] },
  { key: 'reavers', faction: 'reavers', kind: 'raid', role: 'bandit', n: [4, 9], weight: 3, regions: ['flats', 'salt', 'highlands'] },
  { key: 'starvelings', faction: 'starvelings', kind: 'raid', role: 'bandit', n: [5, 12], weight: 3, regions: ['flats', 'salt', 'ember', 'vale', 'ash'] },
  { key: 'scorched', faction: 'scorched', kind: 'raid', role: 'bandit', n: [4, 7], weight: 1.5, regions: ['mire', 'thrumwood'] },
  { key: 'mawkin', faction: 'mawkin', kind: 'raid', role: 'bandit', n: [5, 10], weight: 2, regions: ['ash', 'bonesea'] },
  { key: 'mist', faction: 'mistcrawlers', kind: 'raid', role: 'bandit', n: [4, 9], weight: 1.5, regions: ['coast'] },
  { key: 'blackcomb', faction: 'blackcomb', kind: 'raid', role: 'bandit', n: [4, 8], weight: 1, regions: ['thrumwood'] },
  { key: 'unchained', faction: 'unchained', kind: 'wanderers', role: 'bandit', n: [3, 6], weight: 0.8, regions: ['salt', 'mire', 'ash'] },
  { key: 'pilgrims', faction: 'ember', kind: 'wanderers', role: 'resident', n: [2, 5], weight: 1, regions: ['ember', 'flats'] },
  { key: 'wanderer', faction: 'drifters', kind: 'wanderers', role: 'wanderer', n: [1, 3], weight: 2, regions: ['flats', 'salt', 'vale', 'highlands', 'bonesea', 'mire', 'coast'] },
  { key: 'wardens', faction: 'wardens', kind: 'raid', role: 'construct', n: [2, 4], weight: 1.5, regions: ['rust', 'glass'] },
];

/** Beasts per region come from the region's fauna table. */
function beastSpecs(): Spec[] {
  const out: Spec[] = [];
  for (const r of REGIONS) for (const [sp, w] of r.fauna) {
    if (!ANIMAL[sp]) continue;
    const a = ANIMAL[sp];
    out.push({ key: 'beast_' + sp + '_' + r.key, faction: 'fauna', kind: 'herd', role: 'animal', n: a.pack, weight: w * 0.9, regions: [r.key], species: sp });
  }
  return out;
}
const BEASTS = beastSpecs();
const TARGET = 70;

function roadRoute(a: string, b: string): number[] | null {
  for (const r of S.T.roads) {
    if (r.a === a && r.b === b) return sample(r.pts, false);
    if (r.a === b && r.b === a) return sample(r.pts, true);
  }
  return null;
}
function sample(pts: number[], reverse: boolean) {
  const n = pts.length / 2, out: number[] = [];
  for (let k = 0; k < n; k += 6) { const i = reverse ? n - 1 - k : k; out.push(pts[i * 2], pts[i * 2 + 1]); }
  const last = reverse ? 0 : n - 1;
  out.push(pts[last * 2], pts[last * 2 + 1]);
  return out;
}
function siteOf(key: string) { return S.T.sites.find((s) => s.key === key); }

/** A walk of a few random points inside a region, starting at (x, z). */
function regionRoute(reg: string, x: number, z: number): number[] {
  const out: number[] = [];
  let px = x, pz = z;
  for (let i = 0; i < 6; i++) {
    for (let tries = 0; tries < 20; tries++) {
      const a = rng.range(0, 6.28), d = rng.range(300, 900);
      const nx = px + Math.sin(a) * d, nz = pz + Math.cos(a) * d;
      if (nx < 400 || nz < 400 || nx > WORLD - 400 || nz > WORLD - 400) continue;
      if (S.T.regionAt(nx, nz).key !== reg || S.T.heightAt(nx, nz) < 0.3) continue;
      if (S.T.siteAt(nx, nz, 60)?.kind === 'town') continue;
      out.push(nx, nz); px = nx; pz = nz;
      break;
    }
  }
  return out;
}

function farFromPlayer(x: number, z: number, d = 650) {
  for (const a of anchors) if (Math.hypot(a.x - x, a.z - z) < d) return false;
  return true;
}

function randomPointIn(reg: string): [number, number] | null {
  for (let i = 0; i < 60; i++) {
    const x = rng.range(500, WORLD - 500), z = rng.range(500, WORLD - 500);
    if (S.T.regionAt(x, z).key !== reg) continue;
    if (S.T.heightAt(x, z) < 0.4 || S.T.slopeAt(x, z) > 0.5) continue;
    if (S.T.siteAt(x, z, 120)) continue;
    if (!farFromPlayer(x, z)) continue;
    return [x, z];
  }
  return null;
}

function spawn(spec: Spec): Squad | null {
  const W = S.W;
  let x = 0, z = 0;
  let route: number[] | null = null;
  let dest = 0;
  if (spec.from) {
    const fromKey = rng.pick(spec.from), toKey = rng.pick(spec.to!.filter((k) => k !== fromKey));
    const a = siteOf(fromKey), b = siteOf(toKey);
    if (!a || !b) return null;
    route = roadRoute(fromKey, toKey);
    if (!route) {
      const c = S.nav.coarsePath(a.x, a.z, b.x, b.z);
      if (!c) return null;
      route = [];
      for (let i = 0; i < c.length; i += 10) route.push(c[i], c[i + 1]);
      route.push(b.x, b.z);
    }
    x = a.x; z = a.z; dest = b.id;
    if (!farFromPlayer(x, z, 300) && S.W.populated.has(a.id)) { /* leaving a town the player is in is fine */ }
  } else {
    const reg = rng.pick(spec.regions!);
    const p = randomPointIn(reg);
    if (!p) return null;
    [x, z] = p;
    route = regionRoute(reg, x, z);
  }
  const sq = new Squad();
  sq.faction = spec.faction;
  sq.kind = spec.kind;
  sq.name = spec.species ? ANIMAL[spec.species].plural : FACTION[spec.faction].short;
  sq.x = x; sq.z = z;
  sq.route = route;
  sq.ri = 0;
  sq.born = S.clock.t;
  sq.ttl = S.clock.t + 86400 * rng.range(1.5, 3);
  sq.task = dest ? { k: 'travel', to: dest, x: 0, z: 0, then: 'despawn' } : { k: 'wander', cx: x, cz: z, r: 900 };
  sq.flags.spec = spec.key;
  W.addSquad(sq);
  const n = rng.int(spec.n[0], spec.n[1]);
  for (let i = 0; i < n; i++) {
    const c: Char = spec.species ? makeAnimal(W, spec.species, rng, 1 + REGIONS[S.T.regionIdAt(x, z)].danger * 0.07) : makePerson(W, { faction: spec.faction, role: spec.role }, rng);
    W.moveToSquad(c, sq);
    const spot = S.nav.nearestOpen(x + rng.range(-4, 4), z + rng.range(-4, 4), 10) ?? [x, z];
    c.x = spot[0]; c.z = spot[1]; c.y = S.T.heightAt(c.x, c.z);
    c.homeX = c.x; c.homeZ = c.z;
    if (spec.species) c.faction = 'fauna';
  }
  // caravans bring guards and a travelling shop
  if (spec.kind === 'caravan') {
    for (let i = 0; i < rng.int(2, 4); i++) {
      const g = makePerson(W, { faction: 'ironcoin', role: 'merc' }, rng);
      g.faction = 'drifters';
      W.moveToSquad(g, sq);
      g.x = x + rng.range(-3, 3); g.z = z + rng.range(-3, 3); g.y = S.T.heightAt(g.x, g.z);
    }
    const trader = S.W.char(sq.members[0])!;
    const box = W.addObj({ id: 0, kind: 'crate', def: 'caravan', x: -1e5, z: -1e5, y: 0, rot: 0, owner: 'drifters', site: 0, parent: 0, hidden: true, inv: new Grid(12, 10) });
    trader.shop = String(box.id);
    trader.title = 'Travelling Trader';
    makeShop(W, box.id, rng.pick(['general', 'travel', 'weapons', 'armour', 'construction']), 'drifters', 0, trader.id, 0.5, `${trader.name}'s Caravan`);
    const beast = makeAnimal(W, 'shellback', rng);
    beast.faction = 'fauna';
    beast.mem.livestock = 'drifters';
    W.moveToSquad(beast, sq);
    beast.x = x - 3; beast.z = z; beast.y = S.T.heightAt(beast.x, beast.z);
  }
  return sq;
}

function roamingCount() {
  let n = 0;
  for (const s of S.W.squads.values()) if (s.flags.spec) n++;
  return n;
}

function despawn(sq: Squad) {
  for (const id of sq.members) {
    const c = S.W.char(id);
    if (!c) continue;
    if (c.shop) S.W.shops.delete(+c.shop);
    S.W.chars.delete(id);
  }
  S.W.squads.delete(sq.id);
}

/** Advances an off-screen squad along its route. */
function moveAbstract(sq: Squad, dt: number) {
  if (!sq.route || sq.ri >= sq.route.length / 2) return true;
  let d = (sq.kind === 'raid' || sq.kind === 'herd' || sq.kind === 'bounty' ? 2.2 : 1.8) * dt;
  while (d > 0 && sq.ri < sq.route.length / 2) {
    const tx = sq.route[sq.ri * 2], tz = sq.route[sq.ri * 2 + 1];
    const l = Math.hypot(tx - sq.x, tz - sq.z);
    if (l <= d) { sq.x = tx; sq.z = tz; sq.ri++; d -= l; }
    else { sq.x += ((tx - sq.x) / l) * d; sq.z += ((tz - sq.z) / l) * d; d = 0; }
  }
  let i = 0;
  for (const id of sq.members) {
    const c = S.W.char(id);
    if (!c || !c.alive || c.status !== 'up') continue;
    const a = i * 2.4;
    c.x = sq.x + Math.cos(a) * (i ? 1.5 + i * 0.3 : 0); c.z = sq.z + Math.sin(a) * (i ? 1.5 + i * 0.3 : 0);
    c.y = S.T.heightAt(c.x, c.z);
    i++;
  }
  return sq.ri >= sq.route.length / 2;
}

/** Off-screen battles are settled by strength. */
function abstractFights() {
  const list = [...S.W.squads.values()].filter((s) => s.flags.spec && !s.active && s.members.length);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (Math.abs(a.x - b.x) > 60 || Math.abs(a.z - b.z) > 60) continue;
    const fa = a.faction === 'fauna', fb = b.faction === 'fauna';
    if (fa && fb) continue;
    if (!fa && !fb && !S.W.rel.hostile(a.faction, b.faction)) continue;
    if (fa || fb) {
      const beast = S.W.char((fa ? a : b).members[0]);
      if (!beast?.animal || ANIMAL[beast.animal].diet === 'grazer') continue;
    }
    const ca = a.members.map((id) => S.W.char(id)!).filter((c) => c && c.up);
    const cb = b.members.map((id) => S.W.char(id)!).filter((c) => c && c.up);
    if (!ca.length || !cb.length) continue;
    const sa = strengthOf(ca) * rng.range(0.7, 1.3), sb = strengthOf(cb) * rng.range(0.7, 1.3);
    const [win, lose] = sa > sb ? [ca, cb] : [cb, ca];
    for (const c of lose) { if (rng.chance(0.5)) kill(c); else knockOut(c); }
    for (const c of win) if (rng.chance(0.3)) c.body.hp[1] -= c.body.max[1] * 0.4;
    // news travels only about people, and only from places you know
    const where = S.T.nearestSite(a.x, a.z);
    if (!fa && !fb && where && S.W.discovered.has(where.id)) S.W.say(`Word on the road: ${FACTION[win[0].faction]?.short ?? 'someone'} beat ${FACTION[lose[0].faction]?.short ?? 'someone'} in a fight near ${where.name}.`, 'info', S.clock.t);
  }
}

/** Hired swords from the Iron Coin join for a few days. */
export function hireMercs(pid: number, n: number, days: number) {
  const p = S.W.char(pid);
  const sq = p ? S.W.squadOf(p) : null;
  if (!p || !sq) return;
  for (let i = 0; i < n; i++) {
    const c = makePerson(S.W, { faction: 'ironcoin', role: 'merc' }, rng);
    c.faction = 'player'; c.role = 'player';
    c.mem.contractUntil = S.clock.t + days * 86400;
    c.title = 'Hired Sword';
    S.W.moveToSquad(c, sq);
    const spot = S.nav.nearestOpen(p.x + rng.range(-3, 3), p.z + rng.range(-3, 3), 8) ?? [p.x, p.z];
    c.x = spot[0]; c.z = spot[1]; c.y = S.T.heightAt(c.x, c.z);
    c.order = { k: 'follow', id: p.id };
  }
  S.fx.notice(`${n} Iron Coin mercenaries join you for ${days} days.`, 'good');
}

function contracts() {
  for (const c of S.W.playerChars()) {
    if (!c.mem.contractUntil || S.clock.t < c.mem.contractUntil) continue;
    c.mem.contractUntil = 0;
    const sq = new Squad();
    sq.faction = 'ironcoin'; sq.kind = 'wanderers'; sq.name = 'Iron Coin';
    S.W.addSquad(sq);
    c.faction = 'ironcoin'; c.role = 'merc'; c.order = null; c.jobs = [];
    S.W.moveToSquad(c, sq);
    S.fx.notice(`${c.name}'s contract has ended. They leave.`, 'info');
  }
}

/** Called every step from the game loop. */
export function tickWorld(dt: number) {
  t -= dt;
  shopT -= dt;
  if (shopT <= 0) { shopT = 30; tickShops(); }
  if (t > 0) return;
  const step = 2;
  t = step;
  const W = S.W;
  // squads mark themselves active if any member is
  for (const sq of W.squads.values()) {
    if (sq.faction === 'player') continue;
    sq.active = sq.members.some((id) => S.W.char(id)?.active);
    if (!sq.flags.spec) continue;
    if (!sq.active) {
      const done = moveAbstract(sq, step);
      const members = sq.members.map((id) => S.W.char(id)).filter(Boolean) as Char[];
      const alive = members.filter((c) => c.alive);
      if ((done && sq.task.k === 'travel') || S.clock.t > sq.ttl || !alive.length) {
        if (farFromPlayer(sq.x, sq.z, 700)) despawn(sq);
      } else if (done && sq.task.k === 'wander') {
        const reg = S.T.regionAt(sq.x, sq.z).key;
        sq.route = regionRoute(reg, sq.x, sq.z);
        sq.ri = 0;
      }
    } else if (sq.route && sq.ri >= sq.route.length / 2 && sq.task.k === 'wander') {
      sq.route = regionRoute(S.T.regionAt(sq.x, sq.z).key, sq.x, sq.z);
      sq.ri = 0;
    }
  }
  // keep the world populated
  const n = roamingCount();
  if (n < TARGET) {
    for (let k = 0; k < Math.min(4, TARGET - n); k++) {
      const all = [...SPECS, ...BEASTS];
      const spec = rng.weighted(all.map((s) => [s, s.weight] as const));
      if ((W.flags.quiet?.[spec.faction] ?? 0) > S.clock.t && rng.chance(0.7)) continue; // leaderless, they keep to home
      spawn(spec);
    }
  }
  if (rng.chance(0.2)) abstractFights();
  contracts();
  // the dead are cleaned away in time
  if (rng.chance(0.1)) {
    for (const c of W.chars.values()) {
      if (c.status !== 'dead' || c.faction === 'player' || c.active) continue;
      if (!c.mem.diedAt) c.mem.diedAt = S.clock.t;
      else if (S.clock.t - c.mem.diedAt > 86400 * 2) W.removeChar(c);
    }
  }
  void SETTLEMENT;
}
