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
import { ITEM } from '../content/items';
import { SETTLEMENT } from '../content/layout';
import { ANIMAL } from '../content/animals';
import { strengthOf } from './combat';
import { makeShop } from './shops';
import { Grid, type Item } from './inventory';
import { anchors } from './sim';
import { tickShops } from './shops';
import { kill, knockOut } from './health';
import { WORLD } from '../world/consts';
import { HOUR } from './clock';
import { LOADOUTS, loadoutFor } from '../content/loadouts';
import { SK } from './skills';
import { clamp } from '../core/math';
import { OBJECTIVES } from '../content/objectives';

const rng = new RNG((Date.now() ^ 4242) >>> 0); // a different world story each game
let t = 0;
let shopT = 0;

export interface Spec { key: string; faction: string; kind: SquadKind; role: Role; n: [number, number]; weight: number; regions?: string[]; from?: string[]; to?: string[]; species?: string; loadout?: string; lead?: string; }

export const SPECS: Spec[] = [
  { key: 'concord_patrol', faction: 'concord', kind: 'patrol', role: 'patrol', n: [4, 6], weight: 3, from: ['aurum', 'harrowmarket', 'stonegate', 'saltmere'], to: ['aurum', 'harrowmarket', 'stonegate', 'saltmere', 'chainfield', 'squatters', 'lowtide', 'brinewick'] },
  { key: 'ember_patrol', faction: 'ember', kind: 'patrol', role: 'patrol', n: [4, 7], weight: 3, from: ['cinderhold', 'brightwater', 'pyreswatch', 'tithefield'], to: ['cinderhold', 'brightwater', 'pyreswatch', 'crossroad', 'squatters', 'tithefield', 'rivet'] },
  { key: 'karuk_band', faction: 'karuk', kind: 'patrol', role: 'patrol', n: [3, 6], weight: 2, from: ['hornspire', 'redmesa', 'cragfold'], to: ['hornspire', 'redmesa', 'brightwater', 'crossroad', 'humminghollow', 'cragfold'] },
  { key: 'watch_patrol', faction: 'drifters', kind: 'patrol', role: 'patrol', n: [3, 4], weight: 1.5, from: ['crossroad'], to: ['squatters', 'dustwell', 'crossroad'] },
  { key: 'caravan', faction: 'drifters', kind: 'caravan', role: 'caravan', n: [1, 2], weight: 3, from: ['crossroad', 'harrowmarket', 'dustwell', 'squatters', 'mudwater', 'lanternrest', 'aurum', 'saltmere', 'stonegate', 'hardcoin', 'ribshade', 'rivet', 'brinewick', 'deepleaf'], to: ['crossroad', 'harrowmarket', 'dustwell', 'squatters', 'mudwater', 'lanternrest', 'aurum', 'saltmere', 'stonegate', 'lowtide', 'hardcoin', 'ribshade', 'rivet', 'brinewick', 'deepleaf'] },
  { key: 'delver_trip', faction: 'delvers', kind: 'wanderers', role: 'hunter', n: [2, 4], weight: 1.2, from: ['lanternrest', 'glassfall'], to: ['lanternrest', 'glassfall', 'rustward', 'harrowmarket', 'relayfour', 'ribshade'] },
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
  { key: 'sentinels', faction: 'machines', kind: 'raid', role: 'construct', n: [2, 3], weight: 1.6, regions: ['rust', 'glass', 'ash', 'bonesea'] },
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
export const BEASTS = beastSpecs();
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

/**
 * Sends a squad of a kind into the world: on its roads or in its lands, or (`at`) from a given place along a given route,
 * at most `cap` strong, its people no higher than `level` and dressed from `loadout` (see fitAgainst).
 */
export function spawn(spec: Spec, at?: { x: number; z: number; route: number[]; cap?: number; level?: number; loadout?: string }): Squad | null {
  const W = S.W;
  let x = 0, z = 0;
  let route: number[] | null = null;
  let dest = 0;
  if (at) {
    x = at.x; z = at.z; route = at.route;
  } else if (spec.from) {
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
  sq.task = dest ? { k: 'travel', to: dest, x: 0, z: 0, then: 'despawn' }
    : at ? { k: 'travel', to: 0, x: route[route.length - 2], z: route[route.length - 1], then: 'despawn' }
    : { k: 'wander', cx: x, cz: z, r: 900 };
  sq.flags.spec = spec.key;
  W.addSquad(sq);
  const n = Math.min(rng.int(spec.n[0], spec.n[1]), at?.cap ?? 99);
  const loadout = at?.loadout;
  for (let i = 0; i < n; i++) {
    const level = at?.level === undefined || spec.species ? undefined : levelUnder(loadout ?? loadoutFor(spec.faction, spec.role), at.level);
    const c: Char = spec.species ? makeAnimal(W, spec.species, rng, 1 + REGIONS[S.T.regionIdAt(x, z)].danger * 0.07) : makePerson(W, { faction: spec.faction, role: spec.role, level, loadout }, rng);
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

// ---------------------------------------------------------------- a fair fight
// A new band's first days are hard enough without the worst of the waste
// coming for it. Whoever means it harm comes fitted to it: in numbers and at
// a level it can beat if it fights well (the Reavers working the roads by the
// towns are the gang's new blood then, light on gear and on the red stuff),
// and a little harder every day after.

/** For how many days the roads go easy on a new band. */
export const EARLY_DAYS = 3;

/** The player's people as a fighting force. */
export interface Band {
  /** how many there are to fight */
  n: number;
  /** their strength, as squads weigh each other up (see strengthOf) */
  power: number;
  /** how practised they are: their fighting skills, on the scale of a fighter's level */
  level: number;
}

export function playerBand(): Band {
  let n = 0, power = 0, people = 0, skill = 0;
  for (const c of S.W.playerChars()) {
    if (!c.alive || c.cage || c.carriedBy) continue;
    n++;
    power += kitPower(c);
    if (c.animal) continue;
    people++;
    skill += (c.sk[SK.melee_atk] + c.sk[SK.melee_def] + c.sk[SK.toughness] + c.sk[SK.strength] + c.sk[SK.dexterity]) / 5;
  }
  return { n, power, level: people ? skill / people : 0 };
}

/**
 * Someone's strength in the best weapon and body armour they carry, worn or packed: stripping off for
 * the road does not make the roads any kinder.
 */
function kitPower(c: Char): number {
  let best = c.power();
  if (c.animal) return best;
  let weapon = c.eq.weapon;
  const packs = [c.inv.items, c.eq.back?.inv?.items ?? []];
  const weigh = (w: Item | null, b: Item | null) => { const p = c.power(w, b); if (p > best) { best = p; return true; } return false; };
  // the best weapon, in the coat they wear; then the best coat, with that weapon
  if (c.eq.weapon2 && ITEM[c.eq.weapon2.id]?.cat === 'weapon' && weigh(c.eq.weapon2, c.eq.body)) weapon = c.eq.weapon2;
  for (const items of packs) for (const it of items) if (ITEM[it.id]?.cat === 'weapon' && weigh(it, c.eq.body)) weapon = it;
  for (const items of packs) for (const it of items) if (ITEM[it.id]?.cat === 'body') weigh(weapon, it);
  return best;
}

/**
 * What a band that means harm brings against the player's: how many at most, how high their people's
 * levels go, what they wear (undefined: as they come), the strength they may add up to between them
 * (see threat), and how far over it one of them alone may go.
 */
export interface Fit { n: number; level?: number; loadout?: string; budget: number; slack: number }

/** What a people's fighters carry while the roads are easy, where it differs from their own. */
const EARLY_GEAR: Record<string, string> = { reavers: 'reavers_young' };

export function fitAgainst(band: Band, faction: string, day: number, r: RNG = rng): Fit {
  const later = Math.max(0, day - EARLY_DAYS);
  // early on they come at about the band's own level, from 8 for a beginner to 14 for old hands; then two levels harder a day
  const level = clamp(8 + (band.level - 4) * 0.4, 8, 14) + later * 2;
  // the young ones give way to the gang's regulars over the days after
  const young = r.chance(1 - later / 4);
  return {
    // two or three, as many as the band and one more (and fewer if they would be too strong: see trimTo); then one more every other day
    n: Math.min(band.n + (later ? 2 : 1), 3 + Math.floor(later / 2)),
    level: level < 40 ? level : undefined,
    loadout: young ? EARLY_GEAR[faction] : undefined,
    budget: Math.max(30, band.power * Math.min(4, 1.5 + later * 0.2)),
    slack: later ? 2 : 1.25,
  };
}

/** A level for one of a people's fighters dressed from `loadout`: as they come, but no higher than `max`. */
export function levelUnder(loadout: string, max: number, r: RNG = rng) {
  const L = LOADOUTS[loadout]?.level ?? [10, 10];
  return Math.min(r.range(L[0], L[1]), max);
}

/** How much of a fight someone is, to fit a band: their strength, and for a beast its hide (a beast's rating leaves out how much beating it takes). */
export const threat = (c: Char) => c.power() * (c.animal ? Math.max(1, ANIMAL[c.animal].hp) : 1);

/**
 * Cuts a band down to a fit: no more than its number (the last to join go home first), then trimmed to
 * its budget (see trimTo). False if even one of them alone is too much.
 */
export function cutToFit(sq: Squad, fit: Fit): boolean {
  while (sq.members.length > Math.max(1, fit.n)) {
    const c = S.W.char(sq.members[sq.members.length - 1]);
    if (!c) { sq.members.pop(); continue; }
    S.W.removeChar(c);
  }
  return trimTo(sq, fit);
}

const specOf = (key: string) => SPECS.find((s) => s.key === key) ?? BEASTS.find((s) => s.key === key);

/** Where a squad is: its leader's spot while in play, its own mark while on the road off-screen. */
function whereIs(sq: Squad): { x: number; z: number } {
  const L = sq.active ? S.W.char(sq.leader) : undefined;
  return L ?? sq;
}

/** How near the nearest of the player's people (on their feet or not, free) is to a point. */
function playerDist(x: number, z: number): number {
  let d = Infinity;
  for (const c of S.W.playerChars()) if (c.alive && !c.animal && !c.cage) d = Math.min(d, Math.hypot(c.x - x, c.z - z));
  return d;
}

/**
 * The first days: a band that means harm and comes within 700 m of the player's people (born there,
 * or roaming in) is cut to what they can stand up to, as passers-by are (see fitAgainst: three at
 * most on a new band's first days), while it is still out of sight. One too much for them even alone
 * goes elsewhere. Each band is weighed once.
 */
function fitEarly(sq: Squad) {
  if (sq.flags.fitted || S.clock.day > EARLY_DAYS) return;
  const spec = specOf(sq.flags.spec);
  if (!spec || !hostileKind(spec) || sq.flags.passer) { sq.flags.fitted = 1; return; }
  const at = whereIs(sq);
  if (playerDist(at.x, at.z) > 700) return;
  sq.flags.fitted = 1;
  // (its own draw for the gear, so the world's dice roll as they would have)
  if (!cutToFit(sq, fitAgainst(playerBand(), spec.faction, S.clock.day, new RNG(sq.id))) && !sq.active) despawn(sq);
}

/**
 * The nearest band within `r` that means the player's people harm and that they could beat: no more
 * of them, and no stronger between them, than the roads would send against the band today (see
 * fitAgainst). People first (they carry something worth looting after); beasts only when no such
 * band is about, and never those on the wing, which no one on foot can bring to a fight. For the
 * goal tracker's "Win a fight".
 */
export function beatableNear(r = 900): { x: number; z: number; n: number; name: string; d: number } | null {
  const band = playerBand();
  if (!band.n) return null;
  let best: { x: number; z: number; n: number; name: string; d: number; beast: boolean } | null = null;
  for (const sq of S.W.squads.values()) {
    if (sq.faction === 'player' || !sq.flags.spec) continue;
    const spec = specOf(sq.flags.spec);
    if (!spec || !hostileKind(spec)) continue;
    const up = sq.members.map((id) => S.W.char(id)).filter((c): c is Char => !!c && c.up);
    if (!up.length) continue;
    const beast = !!spec.species;
    if (beast && WINGED.has(ANIMAL[spec.species!].shape)) continue;
    const d = playerDist(up[0].x, up[0].z);
    if (d > r || (best && (beast ? !best.beast || d >= best.d : !best.beast && d >= best.d))) continue;
    const fit = fitAgainst(band, sq.faction === 'fauna' ? spec.faction : sq.faction, S.clock.day, new RNG(sq.id));
    if (up.length > Math.max(1, fit.n) || up.reduce((n, c) => n + threat(c), 0) > fit.budget * fit.slack) continue;
    best = { x: up[0].x, z: up[0].z, n: up.length, name: sq.name, d, beast };
  }
  return best;
}
const WINGED = new Set(['bat', 'fly']);

/** Sends home whoever a new squad has over its fit's budget, the last to join first. False if even one of them alone is too much. */
export function trimTo(sq: Squad, fit: Fit): boolean {
  const members = sq.members.map((id) => S.W.char(id)).filter((c): c is Char => !!c);
  let total = 0;
  for (const c of members) total += threat(c);
  while (members.length > 1 && total > fit.budget) {
    const c = members.pop()!;
    total -= threat(c);
    S.W.removeChar(c);
  }
  return total <= fit.budget * fit.slack;
}

// ---------------------------------------------------------------- passers-by
// The world comes to the player, as it does round the Hub: every few hours
// somebody crosses their path (the region's own bandits, beasts, slavers and
// wanderers, or a trader with guards) from beyond sight, past the player's
// people and on. What happens then is up to them, and to you.

/** The player's next goal is to win a fight (see content/objectives): the road may as well bring one. */
export function wantsFight(): boolean {
  const st = S.W.flags.objectives as { set?: string; done?: Record<string, number> } | undefined;
  const set = st?.set ? OBJECTIVES[st.set] : undefined;
  if (!set || !st?.done || typeof st.done !== 'object') return false;
  return set.goals.find((g) => st.done![g.key] === undefined)?.when.k === 'win';
}

/** Squads that mean harm to whoever they meet. */
const hostileKind = (spec: Spec) => spec.kind === 'raid' || spec.kind === 'slavers' || (!!spec.species && ANIMAL[spec.species].diet !== 'grazer');

/** Who might come by in a region, by weight (only the harmless while `gentle`). */
function passerSpecs(reg: string, gentle: boolean): [Spec, number][] {
  const out: [Spec, number][] = [];
  for (const s of SPECS) if (s.regions?.includes(reg) && !(gentle && hostileKind(s))) out.push([s, s.weight]);
  for (const b of BEASTS) {
    if (!b.regions?.includes(reg)) continue;
    const grazer = ANIMAL[b.species!].diet === 'grazer';
    if (gentle && !grazer) continue;
    out.push([b, b.weight * (grazer ? 0.4 : 0.5)]);
  }
  out.push([SPECS.find((s) => s.key === 'caravan')!, 2.5]);
  if (!out.some(([s]) => s.key === 'wanderer')) out.push([SPECS.find((s) => s.key === 'wanderer')!, 1.5]);
  return out;
}

function tickPassers() {
  const W = S.W;
  if (W.flags.nextPasser === undefined) { W.flags.nextPasser = S.clock.t + rng.range(0.8, 1.6) * HOUR; W.flags.passersFrom = S.clock.t; }
  // keep those on the way aimed at wherever the player's people have got to
  for (const sq of W.squads.values()) {
    if (!sq.flags.passer || !sq.active || sq.ri !== 0 || !sq.route) continue;
    const p = W.char(sq.flags.passer);
    if (!p || !p.up) continue;
    const tx = p.x + (sq.flags.passOff?.[0] ?? 0), tz = p.z + (sq.flags.passOff?.[1] ?? 0);
    if (Math.hypot(tx - sq.route[0], tz - sq.route[1]) < 25) continue;
    sq.route[0] = tx; sq.route[1] = tz;
    const L = W.char(sq.leader);
    if (L && L.hasGoal && !L.brain.enemy) L.hasGoal = false; // set off again for the new spot
  }
  if (S.clock.t < W.flags.nextPasser) return;
  // not now: look again within the hour
  W.flags.nextPasser = S.clock.t + rng.range(0.4, 0.7) * HOUR;
  // (sleepers get visitors too)
  const lead = W.playerChars().find((c) => c.alive && !c.animal && !c.cage && !c.carriedBy);
  if (!lead) return;
  if (S.T.siteAt(lead.x, lead.z, 60)?.kind === 'town') return; // towns are busy enough
  // company already on the way (grazing herds don't count: they are everywhere, and slow; nor does a band
  // beaten where it lay, which is going nowhere and would otherwise keep the roads empty for days)
  for (const s of W.squads.values()) {
    if (!s.flags.spec || s.faction === 'player') continue;
    if (s.kind === 'herd') { const a = W.char(s.members[0]); if (!a?.animal || ANIMAL[a.animal].diet === 'grazer') continue; }
    if (!s.members.some((id) => W.char(id)?.up)) continue;
    // (a squad in play is where its leader is: its own mark is only kept up while he is on the road, not off on some task)
    const L = s.active ? W.char(s.leader) : undefined;
    if (Math.hypot((L?.x ?? s.x) - lead.x, (L?.z ?? s.z) - lead.z) < 350) return;
  }
  // the first half day brings only the harmless: traders, wanderers, grazing beasts; unless the band is out
  // to win a fight (its next goal), when the road brings one it can win more often than not (see fitAgainst)
  const fightWanted = wantsFight();
  const gentle = S.clock.t - (W.flags.passersFrom ?? 0) < 12 * HOUR && !fightWanted;
  // (the same kind twice running is less likely: the waste has more than one story)
  let pool = passerSpecs(S.T.regionAt(lead.x, lead.z).key, gentle);
  if (fightWanted && rng.chance(0.7) && pool.some(([sp]) => hostileKind(sp))) pool = pool.filter(([sp]) => hostileKind(sp));
  const spec = rng.weighted(pool.map(([sp, w]) => [sp, sp.key === W.flags.lastPasser ? w * 0.25 : w] as [Spec, number]));
  for (let i = 0; i < 16; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(540, 680);
    const sx = lead.x + Math.sin(a) * d, sz = lead.z + Math.cos(a) * d;
    if (sx < 300 || sz < 300 || sx > WORLD - 300 || sz > WORLD - 300) continue;
    if (S.T.heightAt(sx, sz) < 0.4 || S.T.slopeAt(sx, sz) > 0.5 || S.T.siteAt(sx, sz, 80)) continue;
    const open = S.nav.nearestOpen(sx, sz, 10);
    if (!open) continue;
    // past the player's people (close enough to be seen, closer for those who mean harm) and on the same way
    const dx = (lead.x - sx) / d, dz = (lead.z - sz) / d;
    const side = rng.range(hostileKind(spec) ? 5 : 14, hostileKind(spec) ? 22 : 40) * (rng.chance(0.5) ? 1 : -1);
    const off: [number, number] = [-dz * side, dx * side];
    const mx = lead.x + off[0], mz = lead.z + off[1];
    // those who mean harm come in numbers, and at levels, the band can stand up to (see fitAgainst)
    const fit = hostileKind(spec) ? fitAgainst(playerBand(), spec.faction, S.clock.day) : undefined;
    const sq = spawn(spec, { x: open[0], z: open[1], route: [mx, mz, mx + dx * 800, mz + dz * 800], cap: fit?.n, level: fit?.level, loadout: fit?.loadout });
    // (too much for them even alone: someone else comes by instead, within the hour)
    if (sq && fit && !trimTo(sq, fit)) { despawn(sq); return; }
    if (sq) { sq.flags.passer = lead.id; sq.flags.passOff = off; W.flags.lastPasser = spec.key; W.flags.nextPasser = S.clock.t + rng.range(1.5, 3.5) * HOUR; }
    return;
  }
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
    fitEarly(sq);
    if (!S.W.squads.has(sq.id)) continue;
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
  tickPassers();
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
