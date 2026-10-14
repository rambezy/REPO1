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
import { strengthOf, hostile } from './combat';
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
import type { Site } from '../world/terrain';
import type { Path } from '../world/nav';

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
 * at most `cap` strong, its people no higher than `level` and dressed from `loadout` (see fitAgainst), on the
 * world's dice or `r`.
 */
export function spawn(spec: Spec, at?: { x: number; z: number; route: number[]; cap?: number; level?: number; loadout?: string }, r: RNG = rng): Squad | null {
  const W = S.W;
  let x = 0, z = 0;
  let route: number[] | null = null;
  let dest = 0;
  if (at) {
    x = at.x; z = at.z; route = at.route;
  } else if (spec.from) {
    const fromKey = r.pick(spec.from), toKey = r.pick(spec.to!.filter((k) => k !== fromKey));
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
    const reg = r.pick(spec.regions!);
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
  sq.ttl = S.clock.t + 86400 * r.range(1.5, 3);
  sq.task = dest ? { k: 'travel', to: dest, x: 0, z: 0, then: 'despawn' }
    : at ? { k: 'travel', to: 0, x: route[route.length - 2], z: route[route.length - 1], then: 'despawn' }
    : { k: 'wander', cx: x, cz: z, r: 900 };
  sq.flags.spec = spec.key;
  W.addSquad(sq);
  const n = Math.min(r.int(spec.n[0], spec.n[1]), at?.cap ?? 99);
  const loadout = at?.loadout;
  for (let i = 0; i < n; i++) {
    const level = at?.level === undefined || spec.species ? undefined : levelUnder(loadout ?? loadoutFor(spec.faction, spec.role), at.level, r);
    const c: Char = spec.species ? makeAnimal(W, spec.species, r, 1 + REGIONS[S.T.regionIdAt(x, z)].danger * 0.07) : makePerson(W, { faction: spec.faction, role: spec.role, level, loadout }, r);
    W.moveToSquad(c, sq);
    const spot = S.nav.nearestOpen(x + r.range(-4, 4), z + r.range(-4, 4), 10) ?? [x, z];
    c.x = spot[0]; c.z = spot[1]; c.y = S.T.heightAt(c.x, c.z);
    c.homeX = c.x; c.homeZ = c.z;
    if (spec.species) c.faction = 'fauna';
  }
  // caravans bring guards and a travelling shop
  if (spec.kind === 'caravan') {
    for (let i = 0; i < r.int(2, 4); i++) {
      const g = makePerson(W, { faction: 'ironcoin', role: 'merc' }, r);
      g.faction = 'drifters';
      W.moveToSquad(g, sq);
      g.x = x + r.range(-3, 3); g.z = z + r.range(-3, 3); g.y = S.T.heightAt(g.x, g.z);
    }
    const trader = S.W.char(sq.members[0])!;
    const box = W.addObj({ id: 0, kind: 'crate', def: 'caravan', x: -1e5, z: -1e5, y: 0, rot: 0, owner: 'drifters', site: 0, parent: 0, hidden: true, inv: new Grid(12, 10) });
    trader.shop = String(box.id);
    trader.title = 'Travelling Trader';
    makeShop(W, box.id, r.pick(['general', 'travel', 'weapons', 'armour', 'construction']), 'drifters', 0, trader.id, 0.5, `${trader.name}'s Caravan`);
    const beast = makeAnimal(W, 'shellback', r);
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
  return nearestOfMine(x, z)?.d ?? Infinity;
}
/** The nearest of the player's people (on their feet or not, free) to a point, and how far. */
function nearestOfMine(x: number, z: number): { c: Char; d: number } | null {
  let best: { c: Char; d: number } | null = null;
  for (const c of S.W.playerChars()) {
    if (!c.alive || c.animal || c.cage) continue;
    const d = Math.hypot(c.x - x, c.z - z);
    if (!best || d < best.d) best = { c, d };
  }
  return best;
}
/** On the move and heading for someone, give or take fifty degrees. */
function headingFor(a: Char, b: Char): boolean {
  const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
  return a.speed > 0.3 && (Math.sin(a.dir) * dx + Math.cos(a.dir) * dz) / d > 0.64;
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

/** Why "Win a fight" names a band: on your people now, near, coming this way, slower than your people, or only the safest fight about. */
export type Aim = 'on' | 'near' | 'coming' | 'slower' | 'safest';
/** A band "Win a fight" names: where, how many, who, how far, why, and whether it is a fight your people could win. */
export interface Named { x: number; z: number; n: number; name: string; d: number; why: Aim; fits: boolean; one?: string }

/** Whether a band is no more of them, and no stronger between them, than the roads would send against yours today (see fitAgainst). */
function fits(band: Band, sq: Squad, up: Char[]): boolean {
  const fit = fitAgainst(band, sq.faction, S.clock.day, new RNG(sq.id));
  return up.length <= Math.max(1, fit.n) && up.reduce((n, c) => n + threat(c), 0) <= fit.budget * fit.slack;
}

/**
 * A fight already on the player's people: the band of whoever is at one of them now, on the wing or
 * not, a fight they could win or not. A pack already attacking is the fight (and nothing more is sent
 * meanwhile: see tickOffer); the law come to arrest them is not.
 */
function fightOn(band: Band): Named | null {
  const W = S.W;
  let best: Named | null = null;
  for (const c of W.playerChars()) {
    if (!c.alive || c.cage) continue;
    W.hash.near(c.x, c.z, 40, (o) => {
      if (o.faction === 'player' || !o.up || o.brain.enemy !== c.id) return;
      if (!(o.animal ? ANIMAL[o.animal].diet !== 'grazer' : W.rel.hostile('player', o.faction))) return;
      const sq = W.squadOf(o);
      const d = Math.hypot(o.x - c.x, o.z - c.z);
      if (!sq || sq.faction === 'player' || (best && d >= best.d)) return;
      const up = sq.members.map((id) => W.char(id)).filter((m): m is Char => !!m && m.up);
      best = { x: o.x, z: o.z, n: up.length, name: sq.name, d, why: 'on', fits: !!sq.flags.offer || fits(band, sq, up), one: loneBeast(sq, up) };
    });
  }
  return best;
}

/**
 * A band that means the player's people harm and that they could beat: no more of them, and no
 * stronger between them, than the roads would send against the band today (see fitAgainst). Never
 * those on the wing, which no one on foot can bring to a fight. In order: one within `r`; one coming
 * this way; one within `far` that moves more slowly than your people, whom an attack order runs down
 * (see ai's outrun); and failing all those, the safest fight within `far`, which may be a chase.
 * Within each, people first (they carry something worth looting after), then the nearest. Before all
 * of those, a fight already on them (see fightOn). For the goal tracker's "Win a fight"; with `meat`,
 * for "Hunt something to eat", only the lame beast the road brings for it (see sendHunt).
 */
export function beatableNear(r = 300, far = 900, meat = false): Named | null {
  const band = playerBand();
  if (!band.n) return null;
  const on = fightOn(band);
  if (on) return on;
  // how fast your people can run, the slowest of them
  let pace = Infinity;
  for (const c of S.W.playerChars()) if (c.alive && c.up && !c.cage && !c.carriedBy) pace = Math.min(pace, c.moveSpeed('run'));
  const AIMS: Aim[] = ['near', 'coming', 'slower', 'safest'];
  let best: { x: number; z: number; n: number; name: string; d: number; why: Aim; rank: number; beast: boolean; risk: number; one?: string } | null = null;
  for (const sq of S.W.squads.values()) {
    if (sq.faction === 'player' || !sq.flags.spec) continue;
    const spec = specOf(sq.flags.spec);
    if (!spec || !hostileKind(spec)) continue;
    const up = sq.members.map((id) => S.W.char(id)).filter((c): c is Char => !!c && c.up);
    if (!up.length) continue;
    const beast = !!spec.species;
    if (beast && WINGED.has(ANIMAL[spec.species!].shape)) continue;
    // (for the hunt, only the beast the road brought for it, lame: a starving hunter is no match for one in its prime)
    if (meat && !sq.flags.prey) continue;
    const near = nearestOfMine(up[0].x, up[0].z);
    if (!near || near.d > far) continue;
    // (a band of bandits who only want tribute, and whose people you have no quarrel with, is no fight to go looking for)
    if (!hostile(up[0], near.c)) continue;
    const d = near.d;
    // (a fight on offer waits for them a short walk off, where it can be got at: as good as near; see sendOffer)
    const why: Aim = d <= r || sq.flags.offer ? 'near' : headingFor(up[0], near.c) ? 'coming' : Math.max(...up.map((c) => c.speed)) < pace * 0.85 ? 'slower' : 'safest';
    const rank = AIMS.indexOf(why);
    if (best && rank > best.rank) continue;
    const fit = fitAgainst(band, sq.faction === 'fauna' ? spec.faction : sq.faction, S.clock.day, new RNG(sq.id));
    const total = up.reduce((n, c) => n + threat(c), 0);
    // (an offer was fitted to the band when it was sent: see sendOffer)
    if (!sq.flags.offer && (up.length > Math.max(1, fit.n) || total > fit.budget * fit.slack)) continue;
    const risk = total / Math.max(1, band.power);
    // (the same reason: people before beasts, then the nearest; only the safest fight is chosen by how safe it is)
    if (best && rank === best.rank && (why === 'safest' ? risk >= best.risk : beast ? !best.beast || d >= best.d : !best.beast && d >= best.d)) continue;
    best = { x: up[0].x, z: up[0].z, n: up.length, name: sq.name, d, why, rank, beast, risk, one: loneBeast(sq, up) };
  }
  return best && { x: best.x, z: best.z, n: best.n, name: best.name, d: best.d, why: best.why, fits: true, one: best.one };
}
const WINGED = new Set(['bat', 'fly']);
/** A beast alone, by its own name ("lame" if the hunt brought it: see sendHunt). */
function loneBeast(sq: Squad, up: Char[]): string | undefined {
  const a = up.length === 1 && up[0].animal ? ANIMAL[up[0].animal] : undefined;
  return a && `${sq.flags.prey ? 'lame' : 'lone'} ${a.name}`;
}
/** A beast with meat on it, as the hunt wants. */
const meaty = (species: string) => ANIMAL[species].loot.some(([id, , hi]) => id === 'raw_meat' && hi > 0);

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

/**
 * The fight the start's goals want next, if any: "Win a fight" ('win'), or "Hunt something to eat"
 * ('hunt'), once it is the first goal still to do. A "Reach" goal before it does not hold it back (the
 * fight can be met on the way there), nor a wound to bandage with nobody of theirs hurt (a fight is where
 * wounds come from). The one rule for the road's offer (see tickOffer) and for who passes by (tickPassers).
 */
export function fightWanted(): 'win' | 'hunt' | null {
  const st = S.W.flags.objectives as { set?: string; done?: Record<string, number>; finished?: number } | undefined;
  const set = st?.set ? OBJECTIVES[st.set] : undefined;
  if (!set || !st?.done || typeof st.done !== 'object' || st.finished) return null;
  for (const g of set.goals) {
    if (st.done[g.key] !== undefined) continue;
    if (g.when.k === 'win' || g.when.k === 'hunt') return g.when.k;
    if (g.when.k === 'reach') continue;
    if (g.when.k === 'bandage' && !S.W.playerChars().some((c) => c.alive && c.body.needsAid())) continue;
    return null;
  }
  return null;
}

/** The player's next goal is to win a fight: the road may as well bring one, unless it already has (an offer stands: see tickOffer). */
export function wantsFight(): boolean {
  return fightWanted() === 'win' && !S.W.flags.fightOffer;
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
  // beaten where it lay, which is going nowhere and would otherwise keep the roads empty for days; nor, for
  // a band out to win a fight, traders and patrols, which pass Crossroad's roads all day)
  const fightWanted = wantsFight();
  for (const s of W.squads.values()) {
    if (!s.flags.spec || s.faction === 'player') continue;
    if (fightWanted) { const sp = specOf(s.flags.spec); if (sp && !hostileKind(sp)) continue; }
    if (s.kind === 'herd') { const a = W.char(s.members[0]); if (!a?.animal || ANIMAL[a.animal].diet === 'grazer') continue; }
    if (!s.members.some((id) => W.char(id)?.up)) continue;
    // (a squad in play is where its leader is: its own mark is only kept up while he is on the road, not off on some task)
    const L = s.active ? W.char(s.leader) : undefined;
    if (Math.hypot((L?.x ?? s.x) - lead.x, (L?.z ?? s.z) - lead.z) < 350) return;
  }
  // the first half day brings only the harmless: traders, wanderers, grazing beasts; unless the band is out
  // to win a fight (its next goal), when the road brings one it can win more often than not (see fitAgainst)
  const gentle = S.clock.t - (W.flags.passersFrom ?? 0) < 12 * HOUR && !fightWanted;
  // (the same kind twice running is less likely: the waste has more than one story)
  let pool = passerSpecs(S.T.regionAt(lead.x, lead.z).key, gentle);
  // (one that means them harm: not bandits who only want tribute and have no quarrel with them)
  const harm = (sp: Spec) => hostileKind(sp) && (!!sp.species || W.rel.hostile('player', sp.faction));
  if (fightWanted && pool.some(([sp]) => harm(sp))) pool = pool.filter(([sp]) => harm(sp));
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

// ---------------------------------------------------------------- a fight on offer
// "Win a fight" is the first goals' promise. While it is open and nothing the
// band could beat is about, the road brings one: a few of the region's own
// bandits (or, where there are none, its beasts), no more of them than of
// yours and weaker between them, waiting a short walk off and out of sight:
// by the way the band is walking, if it is on the march; else by a road the
// way its goals send it, or out of the nearest town. The tracker names them.
// One offer at a time, and none while a fight is already on them; one left
// behind, or fought and fled with nobody down, is given up, and the next waits
// nearer where the band is. "Hunt something to eat" is offered the same way: a
// lone beast with meat on it, lame, as a starving hunter can bring down.

/** Game seconds before the first offer (nothing to be named meanwhile), and before the next: after one gone unfought (beaten by somebody else, or left behind), or a try that found no spot or nobody. */
const OFFER_FIRST = 20 * 60, OFFER_RETRY = 10 * 60;
/** How far off an offer waits (metres from the lead), and how far behind them it may fall before it is given up. */
const OFFER_NEAR = 220, OFFER_FAR = 480, OFFER_LOST = 700;
/** Game seconds an offer that was fought and fled, with nobody down, is waited on before another takes its place. */
const OFFER_FLED = 10 * 60;
/** How near an offer may wait to something of the player's own outside the towns (their claim). */
const OFFER_CLAIM = 100;
/** The people who walk the roads in twos and threes, a first fight's worth. */
const FIRST_FOES = ['reavers', 'starvelings'];

/** Where the goals send the band next, if it is not there yet: the nearest of the places an open "Reach" goal names. */
function headedFor(lead: Char): Site | null {
  const st = S.W.flags.objectives as { set?: string; done?: Record<string, number> } | undefined;
  const set = st?.set ? OBJECTIVES[st.set] : undefined;
  const when = set?.goals.find((g) => g.when.k === 'reach' && st!.done?.[g.key] === undefined)?.when;
  if (!when || when.k !== 'reach') return null;
  const keys = Array.isArray(when.site) ? when.site : [when.site];
  let best: Site | null = null, bd = Infinity;
  for (const s of S.T.sites) {
    const named = keys.includes(s.key) || (!!s.settlement && keys.includes(s.settlement)) || (keys.includes('town') && s.kind === 'town' && !!s.faction && !S.W.rel.hostile('player', s.faction));
    const d = Math.hypot(s.x - lead.x, s.z - lead.z);
    if (named && d < bd) { bd = d; best = s; }
  }
  return best && bd > best.r + 150 ? best : null;
}

/** The point `d` metres on along what is left of a path walked from (x, z), and the way it runs there; null if less is left. */
function alongPath(p: Path, x: number, z: number, d: number): [number, number, number, number] | null {
  let px = x, pz = z, left = d;
  const on = (pts: number[], from: number): [number, number, number, number] | null => {
    for (let i = from; i < pts.length / 2; i++) {
      const nx = pts[i * 2], nz = pts[i * 2 + 1], l = Math.hypot(nx - px, nz - pz);
      if (l > 0 && l >= left) return [px + ((nx - px) * left) / l, pz + ((nz - pz) * left) / l, (nx - px) / l, (nz - pz) / l];
      left -= l; px = nx; pz = nz;
    }
    return null;
  };
  return on(p.pts, p.idx) ?? on(p.coarse, p.cidx);
}

/**
 * Where an offer waits, a short walk from the lead, outside any town or camp and out of sight of all
 * of yours: on the march, on the way they are walking, where they will walk into it;
 * else a road point ahead of them if their goals send them somewhere (open ground that way if no
 * road is), or any road near, or open ground any way.
 */
function offerSpot(lead: Char): [number, number] | null {
  const toward = headedFor(lead);
  const mine = S.W.playerChars().filter((c) => c.alive);
  // (never among the buildings of a claim of theirs, left to itself while they are out)
  const claim = [...S.W.objs.values()].filter((o) => o.owner === 'player' && o.kind !== 'pile' && S.T.siteAt(o.x, o.z, 0)?.kind !== 'town');
  const clear = (x: number, z: number) => x > 400 && z > 400 && x < WORLD - 400 && z < WORLD - 400 && S.T.heightAt(x, z) >= 0.4 && S.T.slopeAt(x, z) <= 0.5
    && !S.T.siteAt(x, z, 70) && mine.every((c) => Math.hypot(c.x - x, c.z - z) > OFFER_NEAR - 20) && claim.every((o) => Math.hypot(o.x - x, o.z - z) > OFFER_CLAIM);
  const path = lead.path && !lead.path.done && !lead.path.failed ? lead.path : null;
  // (on the way itself, to be met face to face: from the side, a band that only wants a word never catches a band on the run)
  for (let i = 0; path && i < 8; i++) {
    const at = alongPath(path, lead.x, lead.z, rng.range(OFFER_NEAR + 60, OFFER_FAR));
    if (!at) continue;
    const off = rng.range(1, 5) * (rng.chance(0.5) ? 1 : -1);
    const x = at[0] - at[3] * off, z = at[1] + at[2] * off;
    const open = clear(x, z) ? S.nav.nearestOpen(x, z, 12) : null;
    if (open) return open;
  }
  // (ahead is ahead: within an angle of the way; among those, the dice choose, so the road is not always the same)
  const ahead = (x: number, z: number, d: number) => (toward ? ((x - lead.x) * (toward.x - lead.x) + (z - lead.z) * (toward.z - lead.z)) / (d * (Math.hypot(toward.x - lead.x, toward.z - lead.z) || 1)) : 1);
  let best: [number, number] | null = null, bs = -Infinity, any: [number, number] | null = null;
  for (const r of S.T.roads) {
    for (let i = 0; i < r.pts.length; i += 8) {
      const x = r.pts[i], z = r.pts[i + 1], d = Math.hypot(x - lead.x, z - lead.z);
      if (d < OFFER_NEAR || d > OFFER_FAR || !clear(x, z)) continue;
      any ??= [x, z];
      const a = ahead(x, z, d);
      if (a < 0.6) continue;
      const s = a + rng.range(0, 0.6);
      if (s > bs) { bs = s; best = [x, z]; }
    }
  }
  if (best) return S.nav.nearestOpen(best[0], best[1], 12);
  for (let i = 0; i < 24; i++) {
    const a = toward && i < 16 ? Math.atan2(toward.x - lead.x, toward.z - lead.z) + rng.range(-0.8, 0.8) : rng.range(0, Math.PI * 2);
    const d = rng.range(OFFER_NEAR + 40, OFFER_FAR - 60);
    const x = lead.x + Math.sin(a) * d, z = lead.z + Math.cos(a) * d;
    if (!clear(x, z)) continue;
    const open = S.nav.nearestOpen(x, z, 12);
    if (open && S.nav.coarsePath(lead.x, lead.z, open[0], open[1])) return open;
  }
  return any && S.nav.nearestOpen(any[0], any[1], 12);
}

/**
 * An offer is weaker between them than the band they wait for, by this much: a first fight is one to
 * win. More so for one alone, with nobody to pull them out of it if they go down.
 */
const OFFER_EDGE = 0.8, OFFER_EDGE_ALONE = 0.55;
/** How much of their health a lone hunter's Starveling has left: hunger has worn them thin. */
const LONE_WORN = 0.9;
/** Strength in a fight, as threat has it but by how quick the blows come too: a knife cuts three times to a club's two. */
export const quickThreat = (c: Char) => threat(c) * (c.animal ? 1 : 1.25 / c.attackTime());

/**
 * Sends a band to wait at a spot, one the player's people should beat: of the people of the spot's
 * region (`reg`) who walk the roads and mean them harm (they carry something worth looting), else its
 * beasts that hunt and go on foot. No more of them than of yours (and no more than the roads would
 * send: see fitAgainst), a step below your people's level (three for one alone: with blows as heavy as they
 * land now, an even fight is a coin toss), lower still if the dice keep turning up more than that, and
 * weaker between them than your band (OFFER_EDGE). Null if the dice (the world's, or `r`) find nobody that will do.
 */
export function sendOffer(at: [number, number], reg = S.T.regionAt(at[0], at[1]).key, r: RNG = rng, hunt = false): Squad | null {
  if (hunt) return sendHunt(at, reg, r);
  const band = playerBand();
  let people = SPECS.filter((s) => FIRST_FOES.includes(s.key) && s.regions?.includes(reg) && S.W.rel.hostile('player', s.faction));
  // (one alone meets the hungriest, where there are any: a Reaver's sabre is more than a first fight for one)
  if (band.n === 1 && people.some((s) => s.key === 'starvelings')) people = people.filter((s) => s.key === 'starvelings');
  const beasts = BEASTS.filter((s) => s.regions?.includes(reg) && ANIMAL[s.species!].diet !== 'grazer' && !WINGED.has(ANIMAL[s.species!].shape));
  // (weighed the same way on both sides: by blows as well as by weight)
  const ours = S.W.playerChars().filter((c) => c.alive && !c.cage && !c.carriedBy).reduce((n, c) => n + quickThreat(c), 0);
  const budget = ours * (band.n > 1 ? OFFER_EDGE : OFFER_EDGE_ALONE);
  for (const pool of [people, beasts]) {
    // (a few goes at it: who turns up, and with what in hand, is the dice's; each go a little greener than the last)
    let green = 0;
    for (let tries = 0; tries < 10 && pool.length; tries++, green += 0.5) {
      const spec = r.weighted(pool.map((s) => [s, s.weight] as const));
      const fit = fitAgainst(band, spec.faction, S.clock.day, r);
      const level = Math.max(1, Math.min(fit.level ?? 40, Math.max(3, band.level - (band.n > 1 ? 1 : 3))) - green);
      const sq = spawn(spec, { x: at[0], z: at[1], route: [at[0], at[1]], cap: Math.min(fit.n, Math.max(1, band.n)), level, loadout: fit.loadout }, r);
      if (!sq) continue;
      // (Starvelings are what their name says: hungry enough to fight badly, as anyone starving does)
      // (and one alone meets one worn thin by it besides)
      if (spec.faction === 'starvelings') for (const id of sq.members) {
        const m = S.W.char(id);
        if (!m) continue;
        m.hunger = 40;
        if (band.n === 1) for (let l = 0; l < 7; l++) if (m.body.has(l)) m.body.hp[l] = Math.min(m.body.hp[l], m.body.max[l] * LONE_WORN);
      }
      // no more than the roads would send, and weaker between them than yours (the last to join go home first)
      const members = () => sq.members.map((id) => S.W.char(id)).filter((c): c is Char => !!c);
      let total = members().reduce((n, c) => n + quickThreat(c), 0);
      while (sq.members.length > 1 && total > budget) { const c = members().pop()!; total -= quickThreat(c); S.W.removeChar(c); }
      if (total > budget || !trimTo(sq, { ...fit, slack: 1 })) { despawn(sq); continue; }
      return waitHere(sq);
    }
  }
  return null;
}

/** An offer waits where it is, until somebody comes (see tickOffer for when it is given up). */
function waitHere(sq: Squad): Squad {
  sq.task = { k: 'hold' };
  sq.route = null;
  sq.ttl = S.clock.t + 86400;
  sq.flags.fitted = 1;
  sq.flags.offer = 1;
  S.W.flags.fightOffer = sq.id;
  return sq;
}

/**
 * How much a hunt's beast has left of its fight and of its health, hungry and hurt a while: for a hunter
 * with a weapon in hand, and for one with bare hands (who can hardly hurt a beast at all), and bare hands
 * against a shell, where there is nothing else about.
 */
const LAME = 0.2, LAME_BARE = 0.15, LAME_SHELL = 0.1;
/** A beast with a shell bare hands hardly mark (its armour against blunt blows). */
const shelled = (species: string) => ANIMAL[species].armour[1] > 0.15;
/**
 * "Hunt something to eat": one beast that hunts on foot and has meat on it, of the spot's region (`reg`), the
 * least dangerous kind about, and lame (LAME). For bare hands, one without a shell, from the spot's region or
 * the hunter's own (a beast strays), where there is one. No beast is a fair fight for a one-armed starveling
 * or a runaway, as the road's weighing goes (see sendOffer); this one is, and the balance test holds it to
 * that. Null where nothing of the kind lives.
 */
function sendHunt(at: [number, number], reg: string, r: RNG): Squad | null {
  const hunters = S.W.playerChars().filter((c) => c.alive && c.up && !c.animal && !c.cage);
  const armed = hunters.some((c) => !!c.eq.weapon);
  const of = (key: string) => BEASTS.filter((s) => s.regions?.includes(key) && ['predator', 'scavenger'].includes(ANIMAL[s.species!].diet) && !WINGED.has(ANIMAL[s.species!].shape) && meaty(s.species!));
  let pool = of(reg);
  if (!armed) {
    const home = hunters[0] ? S.T.regionAt(hunters[0].x, hunters[0].z).key : reg;
    const soft = [...pool, ...of(home)].filter((s) => !shelled(s.species!));
    if (soft.length) pool = soft;
  }
  if (!pool.length) return null;
  const spec = pool.reduce((a, b) => (ANIMAL[b.species!].power < ANIMAL[a.species!].power ? b : a));
  const sq = spawn(spec, { x: at[0], z: at[1], route: [at[0], at[1]], cap: 1 }, r);
  const b = sq && S.W.char(sq.members[0]);
  if (!sq || !b) { if (sq) despawn(sq); return null; }
  // (lame by its kind's own measure, wherever it is found: a hunt is sized to the hunter, not to how hard the land is)
  const lame = armed ? LAME : shelled(spec.species!) ? LAME_SHELL : LAME_BARE;
  for (const [k, v] of Object.entries(ANIMAL[spec.species!].skills)) if (k !== 'toughness') b.sk[SK[k as keyof typeof SK]] = Math.max(1, v * lame);
  for (let l = 0; l < 7; l++) b.body.hp[l] = b.body.max[l] * lame;
  if (!b.inv.count('raw_meat')) b.inv.add('raw_meat', 1);
  sq.flags.prey = 1;
  return waitHere(sq);
}

/**
 * While the goals want a fight next (see fightWanted): an offer when nothing else will do, given up once it is
 * far behind the band, or fought and fled with none of them down. (Run by tickWorld.)
 */
export function tickOffer() {
  const W = S.W;
  const want = fightWanted();
  const prev = W.flags.fightOffer ? W.squads.get(W.flags.fightOffer) : undefined;
  if (!want) {
    // won (or the goals have gone elsewhere): no more offered, and a band still about is only a band now
    if (prev) { delete prev.flags.offer; delete prev.flags.prey; }
    delete W.flags.fightOffer;
    delete W.flags.offerAt;
    return;
  }
  const lead = W.playerChars().find((c) => c.alive && c.up && !c.animal && !c.cage && !c.carriedBy && !c.shackled);
  if (!lead) return;
  if (W.flags.fightOffer) {
    const ms = prev ? prev.members.map((id) => W.char(id)).filter((c): c is Char => !!c) : [];
    const standing = ms.some((c) => c.up);
    let again = OFFER_RETRY;
    // still on offer, or in the fight
    if (standing && (ms.some((c) => c.active) || playerDist(prev!.x, prev!.z) < OFFER_LOST)) {
      // fought, and fled with none of them down: another in their place in a while, once they are out of sight
      const fled = ms.every((c) => c.up) && ms.some((c) => W.char(c.lastHitBy)?.faction === 'player') && !ms.some((c) => c.brain.enemy);
      if (!fled) { delete prev!.flags.fledAt; return; }
      prev!.flags.fledAt ??= S.clock.t;
      if (S.clock.t - prev!.flags.fledAt < OFFER_FLED || ms.some((c) => playerDist(c.x, c.z) < 60)) return;
      again = 0;
    }
    // beaten by somebody else (beaten by yours, the goal is done), left behind, or fled: another soon, nearer where the band is now
    if (standing) despawn(prev!);
    delete W.flags.fightOffer;
    W.flags.offerAt = S.clock.t + again;
  }
  if (W.flags.offerAt === undefined) W.flags.offerAt = S.clock.t + OFFER_FIRST;
  if (S.clock.t < W.flags.offerAt) return;
  // a fight on them, or one they could beat near or on its way to them: that will do (one farther off and
  // standing about, or running, may be where they cannot get at it)
  const named = beatableNear(300, 900, want === 'hunt');
  if (named && (named.why === 'on' || named.why === 'near' || named.why === 'coming')) return;
  // one of theirs down or bleeding: not until they are up and patched
  if (W.playerChars().some((c) => c.alive && !c.animal && (c.status === 'ko' || c.body.bleeding() > 0.05))) return;
  const spot = offerSpot(lead);
  if (spot) sendOffer(spot, S.T.regionAt(spot[0], spot[1]).key, rng, want === 'hunt');
  W.flags.offerAt = S.clock.t + OFFER_RETRY;
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
  tickOffer();
  // keep the world populated
  const n = roamingCount();
  if (n < TARGET) {
    for (let k = 0; k < Math.min(4, TARGET - n); k++) {
      const all = [...SPECS, ...BEASTS];
      const spec = rng.weighted(all.map((s) => [s, s.weight] as const));
      if ((W.flags.quiet?.[spec.faction] ?? 0) > S.clock.t && rng.chance(0.7)) continue; // leaderless, they keep to home
      // weighed as it is born: one that comes into being near the player's people on the first days is cut to
      // fit there and then, not a world-tick later (with all of its number, for a moment, within sight)
      const sq = spawn(spec);
      if (sq) fitEarly(sq);
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
