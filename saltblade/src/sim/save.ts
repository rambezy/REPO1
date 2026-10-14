// Saving and loading. The land is rebuilt from its seed on load, and so is
// everything the seed puts on it (ore, towns, ruins and what lies in them): a
// save holds only what has changed of that since the game began, with all
// that lives on the land (people, squads, shops, standing, research). It is
// gzip-compressed away from the game's own thread where the browser allows,
// and kept in IndexedDB (localStorage fallback).
import { S } from './ctx';
import { World } from './world';
import { Char, EQUIP_SLOTS } from './char';
import { Squad } from './squad';
import { Body } from './body';
import { Grid, Item, newUid, peekUid, setNextUid } from './inventory';
import { WObj } from './objects';
import { Shop } from './shops';
import { NSK } from './skills';
import type { TownInfo } from '../world/towns';
import { buildSeedWorld } from '../world/seedworld';
import { TOWN_PLANS } from '../content/buildings';
import { ITEM } from '../content/items';
import { RACE } from '../content/races';
import { ANIMAL } from '../content/animals';
import { FACTION } from '../content/factions';
import { TECH } from '../content/buildables';

/**
 * 5: told against the base (what the land's seed made): a save holds the
 * things that changed and the ids of those gone, not the rest; and what every
 * character, body and item is unless told otherwise is left out (see unpack).
 * 4: what each character's mind is busy with (see BRAIN_KEEP).
 */
export const SAVE_VERSION = 5;
/**
 * The shape of the land: which towns and landmarks the generator lays out.
 * The land is rebuilt from its seed on load, so a save only fits the shape
 * it was made in. Raise this whenever settlements, landmarks or roads change.
 * (Not for what is built in them, another chest in a house, say: a save told
 * against the base names the base it was told against, and is refused when
 * this version builds another, while a whole save still loads. See takeBase,
 * misfit and WHOLE_SLOTS.)
 */
export const WORLD_SHAPE = 2;

const round = (v: number, k = 100) => Math.round(v * k) / k;

/**
 * What a mind holds that should outlive a save: the task in hand (a captive
 * on the way to a cage, a patient, a body to rob), work half done (a load
 * being hauled, a harvest or ore being carried to storage, a wreck being
 * stripped, a machine being rewritten, a lock being picked), the post kept,
 * the bed slept in, and a band's leader walking up to talk or to search you.
 * The rest (who to fight, where to wander) is worked out again in a moment.
 */
const BRAIN_KEEP = [
  'bed', 'task', 'haul', 'post', 'reaped', 'dug', 'hauling', 'tending', 'tendT', 'mineT',
  'salvId', 'salvT', 'hackId', 'hackT', 'lockT', 'aidT', 'finish', 'talkTo', 'talkT', 'inspect', 'alarm', 'alarmT',
];

function brainToJSON(b: any): any {
  let o: any;
  for (const k of BRAIN_KEEP) {
    const v = b?.[k];
    if (v !== undefined && v !== null && v !== false) (o ??= {})[k] = v;
  }
  return o;
}

/** The fields of a character as a save writes them, in order, each with what is written for it (see also sameChar). */
type CharField = [key: string, get: (c: Char) => unknown];
const CHAR_FIELDS: CharField[] = [
  ['id', (c) => c.id], ['name', (c) => c.name], ['title', (c) => c.title], ['animal', (c) => c.animal], ['look', (c) => c.look], ['faction', (c) => c.faction],
  ['squad', (c) => c.squad], ['role', (c) => c.role], ['rank', (c) => c.rank], ['unique', (c) => c.unique],
  ['x', (c) => round(c.x)], ['z', (c) => round(c.z)], ['dir', (c) => round(c.dir)], ['site', (c) => c.site], ['homeX', (c) => round(c.homeX)], ['homeZ', (c) => round(c.homeZ)], ['homeDir', (c) => round(c.homeDir)],
  ['body', (c) => c.body.serialize()], ['hunger', (c) => round(c.hunger)], ['mood', (c) => c.mood],
  ['sk', (c) => rounded(c.sk)],
  ['inv', (c) => c.inv.serialize()], ['eq', (c) => eqJSON(c.eq)],
  ['money', (c) => c.money], ['status', (c) => c.status], ['playDead', (c) => c.playDead], ['carrying', (c) => c.carrying], ['carriedBy', (c) => c.carriedBy],
  ['bed', (c) => c.bed], ['cage', (c) => c.cage], ['shackled', (c) => c.shackled], ['sleeping', (c) => c.sleeping],
  ['combatMode', (c) => c.combatMode], ['move', (c) => c.move], ['order', (c) => c.order], ['jobs', (c) => c.jobs], ['bounty', (c) => c.bounty], ['mem', (c) => c.mem],
  ['recruitable', (c) => c.recruitable], ['price', (c) => c.price], ['shop', (c) => c.shop], ['dialogue', (c) => c.dialogue], ['stats', (c) => c.stats],
];
/** A character written out in full, every field (a save leaves out the plain ones: see packChar). */
function charToJSON(c: Char): any {
  const o: any = {};
  for (const [k, get] of CHAR_FIELDS) o[k] = get(c);
  const brain = brainToJSON(c.brain);
  if (brain) o.brain = brain;
  return o;
}
function rounded(a: Float32Array) {
  const o = new Array<number>(a.length);
  for (let i = 0; i < a.length; i++) o[i] = round(a[i]);
  return o;
}
function eqJSON(eq: Char['eq']) {
  const o: any = {};
  for (const k in eq) { const v = eq[k as keyof Char['eq']]; o[k] = v ? itemJSON(v) : null; }
  return o;
}
function itemJSON(it: Item): any { return { ...it, inv: it.inv ? it.inv.serialize() : undefined }; }
function itemFrom(o: any): Item { const it: Item = { ...o, inv: o.inv ? Grid.from(o.inv) : undefined }; setNextUid(it.uid + 1); return it; }

function charFrom(o: any): Char {
  const c = new Char(o.look);
  Object.assign(c, {
    id: o.id, name: o.name, title: o.title, animal: o.animal, faction: o.faction, squad: o.squad, role: o.role, rank: o.rank, unique: o.unique,
    x: o.x, z: o.z, dir: o.dir, site: o.site, homeX: o.homeX, homeZ: o.homeZ, homeDir: o.homeDir, hunger: o.hunger, mood: o.mood,
    money: o.money, status: o.status, playDead: o.playDead, carrying: o.carrying, carriedBy: o.carriedBy, bed: o.bed, cage: o.cage, shackled: o.shackled, sleeping: o.sleeping,
    combatMode: o.combatMode, move: o.move, order: o.order, jobs: o.jobs ?? [], bounty: o.bounty ?? {}, mem: o.mem ?? {}, recruitable: o.recruitable, price: o.price, shop: o.shop, dialogue: o.dialogue, stats: o.stats ?? c.stats,
  });
  c.body = Body.from(o.body);
  c.sk.set(o.sk);
  c.inv = Grid.from(o.inv);
  // (gear of a kind this version does not know is left behind, as it is in packs)
  for (const k of Object.keys(c.eq) as (keyof Char['eq'])[]) c.eq[k] = o.eq?.[k] && own(ITEM, o.eq[k].id) ? itemFrom(o.eq[k]) : null;
  c.brain = o.brain ? JSON.parse(JSON.stringify(o.brain)) : {};
  c.y = S.T.heightAt(c.x, c.z);
  c.dirty = true;
  return c;
}

function objToJSON(o: WObj): any {
  const { view, ...rest } = o as any;
  return { ...rest, inv: o.inv ? o.inv.serialize() : undefined };
}
function objFrom(o: any): WObj {
  return { ...o, inv: o.inv ? Grid.from(o.inv) : undefined };
}

function townToJSON(t: TownInfo): any {
  return {
    site: t.site.id, plan: Object.keys(TOWN_PLANS).find((k) => TOWN_PLANS[k] === t.plan), style: t.style, buildings: t.buildings.map((b) => b.id), gates: t.gates, posts: t.posts, patrol: t.patrol,
    beds: t.beds, shops: t.shops.map((s) => ({ kind: s.kind, building: s.building.id, counter: s.counter.id, spot: s.spot })),
    bars: t.bars.map((b) => ({ building: b.building.id, counter: b.counter.id, spot: b.spot, seats: b.seats })), cages: t.cages, fields: t.fields.map((f) => f.id), jobs: t.jobs, plazaR: t.plazaR,
  };
}
function townFrom(o: any, W: World): TownInfo | null {
  const site = S.T.sites.find((s) => s.id === o.site);
  if (!site) return null;
  const obj = (id: number) => W.objs.get(id)!;
  return {
    site, plan: TOWN_PLANS[o.plan], style: o.style, buildings: o.buildings.map(obj).filter(Boolean), gates: o.gates, posts: o.posts, patrol: o.patrol, beds: o.beds,
    shops: o.shops.map((s: any) => ({ kind: s.kind, building: obj(s.building), counter: obj(s.counter), spot: s.spot })).filter((s: any) => s.building && s.counter),
    bars: o.bars.map((b: any) => ({ building: obj(b.building), counter: obj(b.counter), spot: b.spot, seats: b.seats })).filter((b: any) => b.building && b.counter),
    cages: o.cages, fields: o.fields.map(obj).filter(Boolean), jobs: o.jobs, plazaR: o.plazaR,
  };
}

// ---------------------------------------------------------------- the plain values a save leaves out
/** What every character is unless its record says otherwise. A save leaves these out; unpack puts them back. */
const CHAR_PLAIN: Record<string, unknown> = {
  title: '', animal: null, faction: 'drifters', squad: 0, role: 'resident', rank: 0, unique: '', dir: 0, site: 0, homeX: 0, homeZ: 0, homeDir: 0,
  hunger: 240, mood: 0, money: 0, status: 'up', playDead: false, carrying: 0, carriedBy: 0, bed: 0, cage: 0, shackled: false, sleeping: false,
  combatMode: 'aggressive', move: 'run', order: null, jobs: [], bounty: {}, mem: {}, recruitable: false, price: 0, shop: '', dialogue: '',
};
const STATS = ['kills', 'kos', 'downed', 'dist', 'days'];
const PACK_W = 6, PACK_H = 8; // (a character's own pack, as Char makes it)
const ZEROS = [0, 0, 0, 0, 0, 0, 0];
const NO_LIMBS = [null, null, null, null, null, null, null];
/** A squad as Squad makes it: Squad.from starts from one, so what matches it can be left out. */
const SQUAD_PLAIN = JSON.parse(JSON.stringify(new Squad().serialize()));

const PLAIN = new Map(Object.entries(CHAR_PLAIN));
/**
 * What of a character changes all the time, even far from yours (a caravan's
 * people move with it, everyone grows hungry, and whoever is in play notes
 * every moment whether they moved): written afresh by every save (see
 * moving). The rest, its settled part, changes seldom and is kept.
 */
const MOVING = new Set(['x', 'z', 'dir', 'hunger', 'mem']);
/** A character's settled part as a save writes it: its whole record (charToJSON), less what moves and what every character is unless told otherwise. */
function packChar(full: any): any {
  const o: any = {};
  for (const k in full) {
    if (MOVING.has(k)) continue;
    const v = full[k], p = PLAIN.get(k);
    if (p === undefined || !(v === p || same(v, p))) o[k] = v;
  }
  o.body = packBody(full.body);
  const eq: any = {};
  let worn = false;
  for (const k in full.eq) if (full.eq[k]) { eq[k] = packItem(full.eq[k]); worn = true; }
  if (worn) o.eq = eq; else delete o.eq;
  const inv = full.inv;
  if (inv.w === PACK_W && inv.h === PACK_H && !inv.items.length) delete o.inv; else o.inv = packGrid(inv);
  const st = full.stats;
  if (rec(st) && Object.getPrototypeOf(st) === Object.prototype) {
    const s: any = {};
    let any = false;
    for (const k of Object.keys(st)) if (!(STATS.includes(k) && st[k] === 0)) { s[k] = st[k]; any = true; }
    if (any) o.stats = s; else delete o.stats;
  }
  return o;
}
/** A body less what a whole one has: hp at its most, no bleeding, no dressings, nothing lost, splinted or fitted, blood full. */
function packBody(b: any): any {
  const o: any = {};
  for (const k of Object.keys(b)) {
    const v = b[k];
    switch (k) {
      case 'hp': if (same(v, b.max)) continue; break;
      case 'bleed': case 'treated': if (same(v, ZEROS)) continue; break;
      case 'lost': case 'splint': case 'koT': if (v === 0) continue; break;
      case 'prost': if (same(v, NO_LIMBS)) continue; break;
      case 'bloodMax': if (v === 100) continue; break;
      case 'blood': if (v === b.bloodMax && Number.isFinite(v)) continue; break;
      case 'robotic': if (v === false) continue; break;
    }
    o[k] = v;
  }
  return o;
}
/** An item less a stack of one, the common grade and a place at the corner. */
function packItem(i: any): any {
  const o: any = {};
  for (const k of Object.keys(i)) {
    const v = i[k];
    if (k === 'inv') { if (v) o.inv = packGrid(v); continue; }
    if (k === 'q' ? v === 2 : k === 'n' ? v === 1 : (k === 'x' || k === 'y') && v === 0) continue;
    o[k] = v;
  }
  return o;
}
function packGrid(g: any): any { return { w: g.w, h: g.h, items: g.items.map(packItem) }; }
function squadRecord(s: Squad): any {
  const full: any = s.serialize(), o: any = { id: full.id, members: full.members };
  for (const k of Object.keys(full)) if (!own(o, k) && !(own(SQUAD_PLAIN, k) && same(full[k], SQUAD_PLAIN[k]))) o[k] = full[k];
  return o;
}
/** A thing as a save writes it. */
function objRecord(o: WObj): any {
  const r = objToJSON(o);
  if (r.inv) r.inv = packGrid(r.inv);
  return r;
}

const rec = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
/**
 * Puts back, in place, what a save of this version leaves out (CHAR_PLAIN, a
 * whole body, a stack of one...). Only what is missing is filled in: anything
 * there is left as it is, and anything not understood too, for damage() to
 * judge. Doing it twice changes nothing.
 */
function unpack(d: any) {
  for (const c of Array.isArray(d.chars) ? d.chars : []) unpackChar(c);
  for (const o of Array.isArray(d.objs) ? d.objs : []) if (rec(o)) unpackGrid(o.inv, 0);
}
function unpackChar(c: any) {
  if (!rec(c)) return;
  for (const k of Object.keys(CHAR_PLAIN)) if (!own(c, k)) { const v = CHAR_PLAIN[k]; c[k] = Array.isArray(v) ? [] : rec(v) ? {} : v; }
  if (!own(c, 'eq')) c.eq = {};
  if (rec(c.eq)) for (const k of EQUIP_SLOTS) if (!own(c.eq, k)) c.eq[k] = null; // (empty slots are left out)
  if (!own(c, 'inv')) c.inv = { w: PACK_W, h: PACK_H, items: [] };
  if (!own(c, 'stats')) c.stats = {};
  if (rec(c.stats)) for (const k of STATS) if (!own(c.stats, k)) c.stats[k] = 0;
  if (rec(c.eq)) for (const k of Object.keys(c.eq)) unpackItem(c.eq[k], 0);
  unpackGrid(c.inv, 0);
  const b = c.body;
  if (rec(b) && Array.isArray(b.max)) {
    if (!own(b, 'hp')) b.hp = b.max.slice();
    for (const k of ['bleed', 'treated']) if (!own(b, k)) b[k] = ZEROS.slice();
    for (const k of ['lost', 'splint', 'koT']) if (!own(b, k)) b[k] = 0;
    if (!own(b, 'prost')) b.prost = NO_LIMBS.slice();
    if (!own(b, 'bloodMax')) b.bloodMax = 100;
    if (!own(b, 'blood')) b.blood = b.bloodMax;
    if (!own(b, 'robotic')) b.robotic = false;
  }
}
function unpackItem(i: any, depth: number) {
  if (!rec(i)) return;
  if (!own(i, 'q')) i.q = 2;
  if (!own(i, 'n')) i.n = 1;
  if (!own(i, 'x')) i.x = 0;
  if (!own(i, 'y')) i.y = 0;
  unpackGrid(i.inv, depth + 1);
}
function unpackGrid(g: any, depth: number) {
  // (packs in packs go four deep at most: deeper is no save of ours, and damage() says so)
  if (!rec(g) || !Array.isArray(g.items) || depth > 4) return;
  for (const i of g.items) unpackItem(i, depth);
}

// ---------------------------------------------------------------- telling what changed
/** What JSON.stringify leaves out of an object (and writes as null in a list). */
const skipped = (v: unknown) => v === undefined || typeof v === 'function' || typeof v === 'symbol';
/** A value JSON writes as it is: the same as another only when === (and nothing an object inherits is one). */
const prim = (v: unknown) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' || v === null;
/** How many keys a value read from JSON has. */
function keyCount(b: any) {
  let n = 0;
  for (const k in b) if (Object.prototype.hasOwnProperty.call(b, k)) n++;
  return n;
}
/**
 * Where a record sits in a save, which says how its fields are written: as
 * any object is (AS_VALUE); as an item (Grid.serialize, itemJSON: its own pack
 * as its Grid writes it, and not at all when empty); or as a thing (objToJSON:
 * the same, and never its view).
 */
const AS_VALUE = 0, AS_ITEM = 1, AS_THING = 2;
/**
 * Whether a value, as JSON.stringify would write it, is the given value read
 * back from JSON, the order of keys aside. What it cannot be sure of (a class
 * instance, a map, a typed array, anything with its own toJSON) counts as
 * changed. So it can call a thing changed that is not, but never the same when
 * it is not: whatever a save leaves out, the base has exactly.
 */
function same(a: any, b: any): boolean {
  switch (typeof a) {
    case 'number': return Number.isFinite(a) ? a === b : b === null;
    case 'string': case 'boolean': return a === b;
    case 'object': break;
    default: return false;
  }
  if (a === null) return b === null;
  if (b === null || typeof b !== 'object' || typeof a.toJSON === 'function') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!(skipped(a[i]) ? b[i] === null : same(a[i], b[i]))) return false;
    return true;
  }
  const p = Object.getPrototypeOf(a);
  if ((p !== Object.prototype && p !== null) || Array.isArray(b)) return false;
  return sameFields(a, b);
}
/** Every field of a, as JSON writes it, is the same in b, and b has no others. */
function sameFields(a: any, b: any): boolean {
  let n = 0;
  // (for..in also meets keys a inherits, which JSON leaves out: b never has them, so they count as changed)
  for (const k in a) {
    const v = a[k], w = b[k];
    if (v === w && prim(v)) { n++; continue; }
    if (skipped(v)) continue;
    n++;
    if (!Object.prototype.hasOwnProperty.call(b, k) || !same(v, w)) return false;
  }
  return n === keyCount(b);
}

/**
 * A record read from JSON, laid out for quick comparison: its keys in order
 * and their values, compiled likewise (lists stay lists, the rest as it is).
 * The base's things are kept so: each save compares every one of them.
 */
class Fields { constructor(readonly keys: string[], readonly vals: unknown[]) {} }
/** Lists of keys, one of each (thousands of things share a few dozen): less to read through on every save. */
const KEYS = new Map<string, string[]>();
function compile(j: any): any {
  if (Array.isArray(j)) return j.map(compile);
  if (j !== null && typeof j === 'object') {
    const own = Object.keys(j), name = own.join('\u0000');
    let keys = KEYS.get(name);
    if (!keys) { keys = own; if (KEYS.size < 4096) KEYS.set(name, keys); }
    return new Fields(keys, keys.map((k) => compile(j[k])));
  }
  return j;
}
/** same(), against a compiled value. */
function sameC(a: any, c: any): boolean {
  switch (typeof a) {
    case 'number': return Number.isFinite(a) ? a === c : c === null;
    case 'string': case 'boolean': return a === c;
    case 'object': break;
    default: return false;
  }
  if (a === null) return c === null;
  if (c === null || typeof c !== 'object' || typeof a.toJSON === 'function') return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(c) || a.length !== c.length) return false;
    for (let i = 0; i < a.length; i++) if (!(skipped(a[i]) ? c[i] === null : sameC(a[i], c[i]))) return false;
    return true;
  }
  const p = Object.getPrototypeOf(a);
  if ((p !== Object.prototype && p !== null) || !(c instanceof Fields)) return false;
  return sameFieldsC(a, c, AS_VALUE);
}
/**
 * sameFields(), against a compiled record: in order, field by field, as a
 * thing left as it was has them; in any other order, key by key.
 */
function sameFieldsC(a: any, c: Fields, level: number): boolean {
  const keys = c.keys, vals = c.vals;
  let i = 0;
  for (const k in a) {
    const v = a[k];
    if (level !== AS_VALUE && k === 'inv') {
      if (!v) continue;
      if (keys[i] !== k) return sameFieldsAnyOrder(a, c, level);
      if (!(v instanceof Grid) || !sameGridC(v, vals[i])) return false;
      i++;
      continue;
    }
    if ((level === AS_THING && k === 'view') || skipped(v)) continue;
    if (keys[i] !== k) return sameFieldsAnyOrder(a, c, level);
    const w = vals[i++];
    if (!(v === w && prim(v)) && !sameC(v, w)) return false;
  }
  return i === keys.length;
}
function sameFieldsAnyOrder(a: any, c: Fields, level: number): boolean {
  let n = 0;
  for (const k in a) {
    const v = a[k];
    if (level !== AS_VALUE && k === 'inv') {
      if (!v) continue;
      n++;
      const at = c.keys.indexOf(k);
      if (at < 0 || !(v instanceof Grid) || !sameGridC(v, c.vals[at])) return false;
      continue;
    }
    if ((level === AS_THING && k === 'view') || skipped(v)) continue;
    n++;
    const at = c.keys.indexOf(k);
    if (at < 0 || !sameC(v, c.vals[at])) return false;
  }
  return n === c.keys.length;
}
function sameGridC(g: Grid, c: any): boolean {
  if (!(c instanceof Fields) || c.keys.length !== 3) return false;
  const w = c.keys.indexOf('w'), h = c.keys.indexOf('h'), at = c.keys.indexOf('items');
  if (w < 0 || h < 0 || at < 0 || !sameC(g.w, c.vals[w]) || !sameC(g.h, c.vals[h])) return false;
  const a = g.items, b = c.vals[at];
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) { const x = a[i], y = b[i]; if (!rec(x) || !(y instanceof Fields) || !sameFieldsC(x, y, AS_ITEM)) return false; }
  return true;
}
/** Whether a thing, as a save would write it, is the base's copy of it. */
const sameObj = (o: WObj, c: unknown) => c instanceof Fields && sameFieldsC(o, c, AS_THING);

// ---------------------------------------------------------------- characters, kept between saves
/**
 * Each character as last written: the text a save takes of its settled part
 * (plain values left out), and its whole record as charToJSON wrote it at the
 * same moment, compiled when first needed, to tell whether anything has
 * changed since. Most of the world's people are far from yours and keep to
 * their towns: a save takes their text as it stands and writes afresh only
 * those who changed, so it is quick enough not to hold up the game. What is
 * kept is always checked before it is used, so it can be kept at any time:
 * between frames after a load, a new game or a save (keepWarm) as well as by
 * a save.
 */
interface Kept { json: string; full: string; snap?: Fields | null }
const kept = new WeakMap<Char, Kept>();
/** Keeps c as it stands now. */
function keep(c: Char): Kept {
  const full = charToJSON(c);
  const k: Kept = { json: JSON.stringify(packChar(full)), full: JSON.stringify(full) };
  kept.set(c, k);
  return k;
}
const FIELD_KEYS = CHAR_FIELDS.map(([k]) => k);
const at = (k: string) => FIELD_KEYS.indexOf(k);
/** Body.serialize's fields, in its order. */
const BODY_KEYS = ['hp', 'max', 'bleed', 'treated', 'lost', 'splint', 'prost', 'blood', 'bloodMax', 'koT', 'robotic', 'pv'];
/**
 * A kept whole record, compiled; null when it is not laid out as sameChar
 * reads it (a field written as nothing, say), and then never taken as
 * unchanged.
 */
function readKept(k: Kept): Fields | null {
  const f = compile(JSON.parse(k.full));
  const n = FIELD_KEYS.length;
  if (!(f instanceof Fields) || !(f.keys.length === n || (f.keys.length === n + 1 && f.keys[n] === 'brain'))) return null;
  for (let i = 0; i < n; i++) if (f.keys[i] !== FIELD_KEYS[i]) return null;
  const b = f.vals[I_BODY];
  if (!(b instanceof Fields) || b.keys.length !== BODY_KEYS.length || b.keys.some((x, i) => x !== BODY_KEYS[i])) return null;
  return f;
}
/** A plain value as it was, or anything else as sameC finds it. */
const sameV = (a: unknown, b: unknown) => (a === b && prim(a)) || sameC(a, b);
/** A list of numbers (a typed one, say) as JSON writes it: the same as v. */
function sameNums(a: ArrayLike<number>, v: unknown, rounding: boolean): boolean {
  if (!Array.isArray(v) || v.length !== a.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = rounding ? round(a[i]) : a[i];
    if (x !== v[i] && !(!Number.isFinite(x) && v[i] === null)) return false;
  }
  return true;
}
/** A body as Body.serialize writes it (BODY_KEYS, in order: readKept saw to it). */
function sameBody(b: Body, f: unknown): boolean {
  if (!(f instanceof Fields)) return false;
  const v = f.vals;
  return sameNums(b.hp, v[0], false) && sameNums(b.max, v[1], false) && sameNums(b.bleed, v[2], false) && sameNums(b.treated, v[3], false)
    && sameV(b.lost, v[4]) && sameV(b.splint, v[5]) && sameV(b.prost, v[6]) && sameV(b.blood, v[7]) && sameV(b.bloodMax, v[8]) && sameV(b.koT, v[9]) && sameV(b.robotic, v[10]) && v[11] === 1;
}
/** Gear as eqJSON writes it: every slot in order, an empty one as null. */
function sameEq(eq: Char['eq'], f: unknown): boolean {
  if (!(f instanceof Fields)) return false;
  let i = 0;
  for (const k in eq) {
    if (f.keys[i] !== k) return false;
    const it = eq[k as keyof Char['eq']], w = f.vals[i++];
    if (!it ? w !== null : !(w instanceof Fields) || !sameFieldsC(it, w, AS_ITEM)) return false;
  }
  return i === f.keys.length;
}
/** A mind as brainToJSON writes it: what it keeps that is there (not null, false or missing), in BRAIN_KEEP's order, and nothing else. */
function sameBrain(b: any, f: unknown): boolean {
  let i = 0;
  for (const k of BRAIN_KEEP) {
    const x = b?.[k];
    if (x === undefined || x === null || x === false) continue;
    if (!(f instanceof Fields) || f.keys[i] !== k || !sameC(x, f.vals[i])) return false;
    i++;
  }
  return i === 0 ? f === undefined : f instanceof Fields && i === f.keys.length;
}
/**
 * The settled fields sameChar compares, one by one: written out by hand for
 * speed, each as charToJSON writes it (as it is, rounded, or with a check of
 * its own). COVERED says whether these are every settled field: when they
 * are not (one added to CHAR_FIELDS and not here), no character is ever taken
 * as unchanged, slower but never wrong. (tools/savetest.ts changes each field
 * in turn, every part of a body, slot of gear and thing a mind keeps, on
 * someone kept, and sees it saved; it says too when a field has no change
 * tried, or is not on this list.)
 */
const CHECKED = ['id', 'name', 'title', 'animal', 'look', 'faction', 'squad', 'role', 'rank', 'unique', 'site', 'homeX', 'homeZ', 'homeDir', 'body', 'mood', 'sk', 'inv', 'eq',
  'money', 'status', 'playDead', 'carrying', 'carriedBy', 'bed', 'cage', 'shackled', 'sleeping', 'combatMode', 'move', 'order', 'jobs', 'bounty', 'recruitable', 'price', 'shop', 'dialogue', 'stats'];
export const COVERED = [...CHECKED].sort().join() === FIELD_KEYS.filter((k) => !MOVING.has(k)).sort().join();
const [I_ID, I_NAME, I_TITLE, I_ANIMAL, I_LOOK, I_FACTION, I_SQUAD, I_ROLE, I_RANK, I_UNIQUE, I_SITE, I_HOMEX, I_HOMEZ, I_HOMEDIR, I_BODY, I_MOOD, I_SK, I_INV, I_EQ,
  I_MONEY, I_STATUS, I_PLAYDEAD, I_CARRYING, I_CARRIEDBY, I_BED, I_CAGE, I_SHACKLED, I_SLEEPING, I_COMBATMODE, I_MOVE, I_ORDER, I_JOBS, I_BOUNTY, I_RECRUITABLE, I_PRICE, I_SHOP, I_DIALOGUE, I_STATS] = CHECKED.map(at);
/** Whether c's settled part, as charToJSON would write it now (CHECKED, field by field), is the kept record f. */
function sameChar(c: Char, f: Fields): boolean {
  const v = f.vals;
  return sameV(c.id, v[I_ID]) && sameV(c.name, v[I_NAME]) && sameV(c.title, v[I_TITLE]) && sameV(c.animal, v[I_ANIMAL]) && sameV(c.look, v[I_LOOK])
    && sameV(c.faction, v[I_FACTION]) && sameV(c.squad, v[I_SQUAD]) && sameV(c.role, v[I_ROLE]) && sameV(c.rank, v[I_RANK]) && sameV(c.unique, v[I_UNIQUE])
    && sameV(c.site, v[I_SITE]) && sameV(round(c.homeX), v[I_HOMEX]) && sameV(round(c.homeZ), v[I_HOMEZ]) && sameV(round(c.homeDir), v[I_HOMEDIR])
    && sameBody(c.body, v[I_BODY]) && sameV(c.mood, v[I_MOOD]) && sameNums(c.sk, v[I_SK], true) && c.inv instanceof Grid && sameGridC(c.inv, v[I_INV]) && sameEq(c.eq, v[I_EQ])
    && sameV(c.money, v[I_MONEY]) && sameV(c.status, v[I_STATUS]) && sameV(c.playDead, v[I_PLAYDEAD]) && sameV(c.carrying, v[I_CARRYING]) && sameV(c.carriedBy, v[I_CARRIEDBY])
    && sameV(c.bed, v[I_BED]) && sameV(c.cage, v[I_CAGE]) && sameV(c.shackled, v[I_SHACKLED]) && sameV(c.sleeping, v[I_SLEEPING])
    && sameV(c.combatMode, v[I_COMBATMODE]) && sameV(c.move, v[I_MOVE]) && sameV(c.order, v[I_ORDER]) && sameV(c.jobs, v[I_JOBS]) && sameV(c.bounty, v[I_BOUNTY])
    && sameV(c.recruitable, v[I_RECRUITABLE]) && sameV(c.price, v[I_PRICE]) && sameV(c.shop, v[I_SHOP]) && sameV(c.dialogue, v[I_DIALOGUE]) && sameV(c.stats, v[I_STATS])
    && sameBrain(c.brain, f.keys.length > FIELD_KEYS.length ? v[FIELD_KEYS.length] : undefined);
}
/** A number as JSON writes it. */
const numText = (v: number) => (Number.isFinite(v) ? String(v) : 'null');
/** What moves of a character, as packChar would leave it to be written: where it stands, always; which way it faces, how hungry it is and what it remembers, unless plain. */
function moving(c: Char): string {
  let s = `"x":${numText(round(c.x))},"z":${numText(round(c.z))}`;
  const dir = round(c.dir), hunger = round(c.hunger);
  if (dir !== CHAR_PLAIN.dir) s += `,"dir":${numText(dir)}`;
  if (hunger !== CHAR_PLAIN.hunger) s += `,"hunger":${numText(hunger)}`;
  if (!same(c.mem, CHAR_PLAIN.mem)) s += `,"mem":${JSON.stringify(c.mem)}`;
  return s;
}
/** The text of a character's record as a save writes it now: what moves, then the settled part (kept when it has not changed). */
function charText(c: Char): string {
  let k = kept.get(c);
  if (k && k.snap === undefined && COVERED) k.snap = readKept(k);
  if (!(k?.snap && COVERED && sameChar(c, k.snap))) k = keep(c); // (read back between frames, by keepWarm)
  return `{${moving(c)},${k.json.slice(1)}`;
}
/**
 * The same for things a save writes in full (new since the seed made the
 * world, or changed from how it made them): each as last written, and that
 * record read back (compiled, items whole again), to tell whether it changed.
 */
interface KeptThing { json: string; snap?: Fields | null }
const keptThings = new WeakMap<WObj, KeptThing>();
function readThing(json: string): Fields | null {
  const r = JSON.parse(json);
  if (!rec(r)) return null;
  unpackGrid(r.inv, 0);
  return compile(r);
}
/** The text of a thing's record as a save writes it now (kept when it has not changed). */
function thingText(o: WObj): string {
  const k = keptThings.get(o);
  if (k && (k.snap === undefined ? (k.snap = readThing(k.json)) : k.snap) && sameObj(o, k.snap)) return k.json;
  const json = JSON.stringify(objRecord(o));
  keptThings.set(o, { json }); // (read back between frames, by keepWarm)
  return json;
}
/** The going-over of a world under way, if any (one at a time: a second asked for meanwhile waits for it). */
const warming = new WeakMap<World, Promise<void>>();
/**
 * Calls f with a few milliseconds to spend when the game's thread is next
 * idle (after a frame's work, where the browser says so; never later than a
 * moment from now, busy or not), or else in a moment.
 */
function whenIdle(f: (ms: number) => void) {
  if (typeof requestIdleCallback === 'function') requestIdleCallback((d) => f(Math.min(3, Math.max(1, d.timeRemaining()))), { timeout: 250 });
  else setTimeout(() => f(3), 0);
}
/**
 * Goes over W a few milliseconds at a time between frames, as a save would
 * (every character, every thing against the base), keeping what has changed
 * and reading back what was kept: the next save then has little to write
 * afresh, only to check, and the code it runs is not cold when it comes (a
 * save every few minutes would otherwise find it so). Stops when done, or when
 * W is no longer the world. (Run after a load, a new game and a save, and
 * every few seconds in play; an autosave waits for one to finish, so that it
 * finds everything fresh and close to hand.)
 */
export function keepWarm(W: World = S.W): Promise<void> {
  const going = warming.get(W);
  if (going) return going;
  let done!: () => void;
  const finished = new Promise<void>((res) => { done = res; });
  warming.set(W, finished);
  const end = () => { warming.delete(W); done(); };
  const chars = [...W.chars.values()], objs = [...W.objs.values()], base = bases.get(W);
  let i = 0, j = 0;
  const run = (ms: number) => {
    if (S.W !== W) { end(); return; }
    const until = performance.now() + ms;
    while (i < chars.length && performance.now() < until) {
      const c = chars[i++];
      if (W.chars.get(c.id) !== c) continue;
      charText(c);
      tiesOf(c); // (as a save in slices does)
      const k = kept.get(c)!;
      if (k.snap === undefined && COVERED) k.snap = readKept(k);
    }
    while (i >= chars.length && j < objs.length && performance.now() < until) {
      const o = objs[j++];
      if (W.objs.get(o.id) !== o || (base && sameObj(o, base.objs.get(o.id)))) continue;
      thingText(o);
      const k = keptThings.get(o)!;
      if (k.snap === undefined) k.snap = readThing(k.json);
    }
    if (i < chars.length || j < objs.length) { whenIdle(run); return; }
    // and the rest of what a save does, but changes nothing in, a moment of its own
    whenIdle(() => {
      if (S.W === W) {
        for (const s of W.squads.values()) squadRecord(s);
        if (base) for (const t of W.towns.values()) sameC(townToJSON(t), base.towns.get(t.site.id));
      }
      end();
    });
  };
  whenIdle(run);
  return finished;
}

// ---------------------------------------------------------------- the base
/**
 * The seed's things as made, and how they were numbered (ids from id0, the
 * items in them from uid0). A save is told against it: it holds the things
 * that differ and the ids of those gone, and a load makes the base again and
 * lays them over it.
 */
interface Base {
  id0: number;
  uid0: number;
  /** each thing as made, as a save would write it (compiled), by id */
  objs: Map<number, Fields>;
  /** and as text, for a whole save to write when it is still as made */
  texts: Map<number, string>;
  /** each town as laid out, as a save would write it (compiled), by site */
  towns: Map<number, Fields>;
  /** which things the seed made, of what kind, in what order (see shapeOf) */
  shape: string;
  /** and everything about them, where each stands and what lies in it (see seedSum): a save told against a base of another shape or sum cannot be read */
  sum: string;
}
const bases = new WeakMap<World, Base>();

/** Thrown when a save was told against a base this version does not make: it cannot be read. */
export class SaveMisfit extends Error {}

/** Two 32-bit hashes of some text, side by side: a check that two builds made the same things (no guard against forgery). */
class Hash {
  private a = 0x811c9dc5;
  private b = 0x2f8d1e47;
  add(s: string) {
    let a = this.a, b = this.b;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x5bd1e995);
      b ^= b >>> 13;
    }
    this.a = a; this.b = b;
  }
  get() { return (this.a >>> 0).toString(36) + '.' + (this.b >>> 0).toString(36); }
}

/** The seed's things in W, made from id0 on, in the order made. */
const seedIds = (W: World, id0: number) => [...W.objs.keys()].filter((id) => id >= id0).sort((a, b) => a - b);
/**
 * Which things the seed made in W (from id0 on) and the towns it laid out:
 * each thing's place in the order made, kind, make, site and the thing it
 * belongs to, as a fingerprint. Where the numbering began does not count, so
 * it is the same for every world this version builds from the seed.
 */
export function shapeOf(W: World, id0: number): string {
  const h = new Hash();
  for (const id of seedIds(W, id0)) { const o = W.objs.get(id)!; h.add(`${id - id0} ${o.kind} ${o.def} ${o.site} ${o.parent ? o.parent - id0 : 0};`); }
  for (const t of W.towns.values()) h.add(`town ${t.site.id};`);
  return h.get();
}
/** Numbers what lies in a thing's pack (written out) as from nought, not from uid0. */
function fromNought(g: any, uid0: number) {
  for (const it of g.items) { it.uid -= uid0; if (it.inv) fromNought(it.inv, uid0); }
}
/**
 * Numbers to the thousandth (a millimetre, a thousandth of a radian), for
 * seedSum: what another browser's arithmetic leaves in the last digits of
 * where a thing stands does not count; a thing anywhere else does.
 */
const thousandths = (_k: string, v: unknown) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v);
/**
 * Everything the seed made in W (from id0 on, what lies in things from uid0
 * on) as a fingerprint: each thing as a save writes it, where it stands and
 * all, and each town, to the thousandth; what lies in them counted from
 * nought, so that every world the seed's is built in (a game's, the title's)
 * sums the same. Each thing's own text, as a save writes it, is handed to
 * `each` on the way.
 */
function seedSum(W: World, id0: number, uid0: number, each?: (id: number, o: WObj, s: string) => void): string {
  const h = new Hash();
  for (const id of seedIds(W, id0)) {
    const o = W.objs.get(id)!;
    if (each) each(id, o, JSON.stringify(objToJSON(o)));
    const r = objToJSON(o);
    if (r.inv) fromNought(r.inv, uid0);
    h.add(JSON.stringify(r, thousandths));
  }
  for (const t of W.towns.values()) h.add(JSON.stringify(townToJSON(t), thousandths));
  return h.get();
}
/** A base as a save's listing names it: its shape and its sum. */
const baseName = (b: { shape: string; sum: string }) => `${b.shape} ${b.sum}`;
/** The name of the base this version's seed makes, once a world of it has been made (see misfit). */
let madeBase: string | undefined;
export const seedBase = () => madeBase;
/** The base: what W holds of the seed's making (everything from id0 on), as a save would write it. */
function takeBase(W: World, id0: number, uid0: number): Base {
  const objs = new Map<number, Fields>(), texts = new Map<number, string>(), towns = new Map<number, Fields>();
  const sum = seedSum(W, id0, uid0, (id, o, s) => {
    objs.set(id, compile(JSON.parse(s)));
    texts.set(id, o.inv ? JSON.stringify(objRecord(o)) : s);
  });
  for (const t of W.towns.values()) towns.set(t.site.id, compile(JSON.parse(JSON.stringify(townToJSON(t)))));
  const base = { id0, uid0, objs, texts, towns, shape: shapeOf(W, id0), sum };
  madeBase = baseName(base);
  return base;
}

/**
 * Remembers what the seed has just made in W (its things numbered from id0,
 * what lies in them from uid0) as the base W's saves are told against.
 */
export function markBase(W: World, id0: number, uid0: number) {
  bases.set(W, takeBase(W, id0, uid0));
}
/** The name of the base the seed has made in W (its things from id0 on, what lies in them from uid0 on). */
export const seedName = (W: World, id0: number, uid0: number) => baseName({ shape: shapeOf(W, id0), sum: seedSum(W, id0, uid0) });
/** Notes the name of the base the seed has just made in W, for a world no game is played in (the title's). */
export function noteSeed(W: World, id0: number, uid0: number) {
  madeBase = seedName(W, id0, uid0);
}

function shiftUids(g: Grid, by: number) {
  for (const it of g.items) { it.uid += by; if (it.inv) shiftUids(it.inv, by); }
}

/**
 * Makes the seed's things in an empty world, numbered as a base was: ids
 * from id0, the items in them from uid0 (made with whatever uids come next,
 * then moved along to those). Item numbering carries on past them.
 */
function build(W: World, id0: number, uid0: number) {
  W.nextId = id0;
  const u = peekUid();
  buildSeedWorld(W, S.T);
  const by = uid0 - u;
  let top = 0;
  const walk = (g: Grid) => { for (const it of g.items) { it.uid += by; if (it.uid > top) top = it.uid; if (it.inv) walk(it.inv); } };
  for (const o of W.objs.values()) if (o.inv) walk(o.inv);
  setNextUid(top + 1);
}

const tally = (m: Map<number, number>, k: number) => m.set(k, (m.get(k) ?? 0) + 1);
function most(m: Map<number, number>): number | undefined {
  let best: number | undefined, n = 0;
  for (const [k, c] of m) if (c > n) { best = k; n = c; }
  return best;
}

/**
 * A base for a world read from a whole save (one from before bases, or one
 * written without): the seed's things made again in a world of their own,
 * numbered as the save's copies of them are, found from where its ore lies
 * (the k-th ore is the k-th thing made) and what its chests hold. Saves after
 * are right whether or not it matches, since each names the numbering it was
 * told against; the better it matches, the less they hold. None when no ore
 * of the seed's is there to go by: the saves after stay whole.
 */
function baseFor(W: World): Base | undefined {
  const at = new Map<string, number>();
  for (const o of W.objs.values()) if (o.kind === 'ore') at.set(`${o.def} ${o.x} ${o.z}`, o.id);
  const firsts = new Map<number, number>();
  S.T.ores.forEach((r, k) => { const id = at.get(`${r.kind} ${r.x} ${r.z}`); if (id !== undefined) tally(firsts, id - k); });
  const id0 = most(firsts);
  if (id0 === undefined || id0 < 1) return undefined;
  const w = new World(), u = peekUid();
  build(w, id0, u);
  const shifts = new Map<number, number>();
  for (const s of w.objs.values()) {
    const o = W.objs.get(s.id);
    if (!s.inv || !o?.inv || o.kind !== s.kind || o.def !== s.def) continue;
    const a = s.inv.items, b = o.inv.items;
    for (let i = 0; i < a.length && i < b.length; i++) if (a[i].id === b[i].id && Number.isInteger(b[i].uid)) tally(shifts, b[i].uid - a[i].uid);
  }
  let by = most(shifts) ?? 0;
  if (u + by < 1) by = 0;
  if (by) for (const o of w.objs.values()) if (o.inv) shiftUids(o.inv, by);
  return takeBase(w, id0, u + by);
}

/**
 * Every item's uid once, after a save is read. The save's own items
 * (everyone's gear and packs, and what lies in every thing it wrote) keep
 * theirs, but for any it repeats, which are given new ones (should the game
 * ever put an item in two places, its saves still load); and so is an item
 * the seed put in a thing the save left untouched that shares a uid with one
 * of them (a save made by hand). Returns how many were given new ones.
 */
function uniqueUids(W: World, untouched?: Set<number>): number {
  const held = new Set<number>(), again: Item[] = [];
  let top = 0;
  const note = (g: Grid | undefined, d = 0) => { if (g && d < 8) for (const it of g.items) one(it, d); };
  const one = (it: Item, d: number) => {
    if (held.has(it.uid)) again.push(it);
    else { held.add(it.uid); if (it.uid > top) top = it.uid; }
    note(it.inv, d + 1);
  };
  for (const c of W.chars.values()) { note(c.inv); for (const it of Object.values(c.eq)) if (it) one(it, 0); }
  for (const o of W.objs.values()) if (!untouched?.has(o.id)) note(o.inv);
  if (untouched) for (const id of untouched) note(W.objs.get(id)?.inv);
  setNextUid(top + 1); // (and past the seed's own, which build() saw to)
  for (const it of again) it.uid = newUid();
  return again.length;
}

/**
 * A save as text, in pieces: the head (all but the things and the people,
 * opening the list of things), each thing's record, then each person's. Put
 * together with joinText, or by the compressor, which does it off the game's
 * thread.
 */
interface SaveText {
  head: string; things: string[]; people: string[];
  /** the name of the base it is told against, its shape and sum (none: a whole save) */
  base?: string;
}
const joinText = (t: SaveText) => `${t.head}${t.things.join(',')}],"chars":[${t.people.join(',')}]}`;

/** The map as explored, as text: kept while it stays as it was (it changes as you go somewhere new). */
let explored: { bytes: Uint8Array; text: string } | undefined;
function exploredText(a: Uint8Array | null): string | null {
  if (!a) return null;
  const k = explored;
  if (k && k.bytes.length === a.length) {
    let i = 0;
    while (i < a.length && a[i] === k.bytes[i]) i++;
    if (i === a.length) return k.text;
  }
  explored = { bytes: a.slice(), text: bytesToB64(a) };
  return explored.text;
}

/**
 * Ties, as a number: a person's squad, whom they carry or are carried by,
 * their bed, cage and seat, their purse and every item they hold (each uid
 * and stack); who is in a thing, on it or using it, and every item it holds.
 * A save taken a slice at a time takes again, in its last slice, anyone and
 * anything whose ties changed since they were taken (see finishTaking): so
 * every item is saved once, where it is, and every link from both its ends.
 * (Two 32-bit hashes side by side, 52 bits of them, worked out in ha and hb.)
 */
let ha = 0, hb = 0;
/** A number as its 64 bits, two 32-bit halves (what is not a number, as nought). */
const BITS = new Float64Array(1), HALVES = new Int32Array(BITS.buffer);
function mix(v: unknown) {
  BITS[0] = typeof v === 'number' ? v : 0;
  const lo = HALVES[0], hi = HALVES[1];
  ha = Math.imul(Math.imul(ha ^ lo, 0x01000193) ^ hi, 0x01000193);
  hb = Math.imul(hb ^ lo, 0x5bd1e995); hb ^= hb >>> 13;
  hb = Math.imul(hb ^ hi, 0x5bd1e995); hb ^= hb >>> 13;
}
function mixItems(g: Grid | undefined, d: number) {
  if (!g || d >= 8) { mix(-1); return; }
  mix(g.items.length);
  for (const it of g.items) { mix(it.uid); mix(it.n); mixItems(it.inv, d + 1); }
}
const hashed = () => (ha >>> 0) * 0x100000 + (hb >>> 12);
function tiesOf(c: Char): number {
  ha = 0x811c9dc5; hb = 0x2f8d1e47;
  mix(c.squad); mix(c.carrying); mix(c.carriedBy); mix(c.bed); mix(c.cage); mix(c.mem?.using); mix(c.money);
  mixItems(c.inv, 0);
  let slot = 0;
  for (const k in c.eq) { const it = c.eq[k as keyof Char['eq']]; mix(++slot); if (it) { mix(it.uid); mix(it.n); mixItems(it.inv, 1); } }
  return hashed();
}
function thingTiesOf(o: WObj): number {
  if (!o.inv && !o.occupant && !o.user && !o.data?.upper) return 0; // (tied to nothing, as most things are)
  ha = 0x811c9dc5; hb = 0x2f8d1e47;
  mix(o.occupant); mix(o.user); mix(o.data?.upper);
  mixItems(o.inv, 0);
  return hashed();
}

/**
 * A save being taken: who and what is to be, in the world's order; the text
 * of each record taken so far (null for a thing as the base has it, which is
 * left out); and, when it is taken a slice at a time, the ties of each when
 * it was taken.
 */
interface Taking {
  W: World; extra: Record<string, any>; whole: boolean; base: Base | undefined; sliced: boolean;
  chars: Char[]; people: string[]; ties: number[]; i: number;
  objs: WObj[]; texts: (string | null)[]; oties: number[]; j: number;
  /** how many of the things taken the base has (fewer than it has: some are gone) */
  left: number;
  /** what the save says of the base and the towns, once the things are taken (see told) */
  told?: Record<string, unknown>;
}
/** A save begun: links mended (a save never holds a link to nothing), and who and what is to be taken noted. */
function beginTaking(extra: Record<string, any>, whole: boolean, sliced: boolean): Taking {
  const W = S.W;
  repairLinks(W);
  const chars = [...W.chars.values()], objs = [...W.objs.values()];
  return {
    W, extra, whole, base: bases.get(W), sliced,
    chars, people: new Array<string>(chars.length), ties: new Array<number>(chars.length), i: 0,
    objs, texts: new Array<string | null>(objs.length), oties: new Array<number>(objs.length), j: 0, left: 0,
  };
}
/** A thing's record as a save writes it: when it is as the base has it, left out (null), or in a whole save the base's text of it. */
function thingIn(t: Taking, o: WObj): string | null {
  const b = t.base?.objs.get(o.id);
  if (b && sameObj(o, b)) return t.whole ? t.base!.texts.get(o.id)! : null;
  return thingText(o);
}
/**
 * What a save says of the base and the towns: told against a base, which it
 * was, the ids of its things that are gone and the towns laid out otherwise
 * than it has them; whole, every town.
 */
function told(t: Taking): Record<string, unknown> {
  const { W, base } = t;
  if (!base || t.whole) return { towns: [...W.towns.values()].map((tw) => townToJSON(tw)) };
  const gone: number[] = [], towns: any[] = [];
  // (every one of the base's things still here: none gone)
  if (t.left < base.objs.size) for (const id of base.objs.keys()) if (!W.objs.has(id)) gone.push(id);
  for (const tw of W.towns.values()) { const j = townToJSON(tw); if (!sameC(j, base.towns.get(tw.site.id))) towns.push(j); }
  return { base: { id0: base.id0, uid0: base.uid0, shape: base.shape, sum: base.sum }, gone, towns };
}
/** Takes people, then things, then what is told of them, until the clock reads `until` (ms) or all is taken: whether it is. */
function takeSome(t: Taking, until: number): boolean {
  const { chars, objs, base } = t, from = t.i + t.j;
  while (t.i < chars.length) {
    const c = chars[t.i];
    t.people[t.i] = charText(c);
    if (t.sliced) t.ties[t.i] = tiesOf(c);
    if ((++t.i & 7) === 0 && performance.now() >= until) return false;
  }
  while (t.j < objs.length) {
    const o = objs[t.j];
    if (base?.objs.has(o.id)) t.left++;
    t.texts[t.j] = thingIn(t, o);
    if (t.sliced) t.oties[t.j] = thingTiesOf(o);
    if ((++t.j & 63) === 0 && performance.now() >= until) return false;
  }
  if (!t.told) {
    // (in a slice of its own, unless this one has only just begun)
    if (t.sliced && t.i + t.j !== from && performance.now() >= until) return false;
    t.told = told(t);
  }
  return true;
}
/** Whether a map holds just these, in this order. */
function holdsJust<T>(m: Map<number, T>, a: readonly T[]): boolean {
  if (m.size !== a.length) return false;
  let i = 0;
  for (const v of m.values()) if (v !== a[i++]) return false;
  return true;
}
/**
 * The last of a save, all at once: whatever is left taken; when it was taken
 * a slice at a time, anyone and anything whose ties changed since taken again
 * (everyone, if anyone came or went; everything, if anything was made or
 * gone); then the rest of the game. So the save is the game at one moment,
 * this one.
 */
function finishTaking(t: Taking): SaveText {
  takeSome(t, Infinity);
  const { W } = t;
  if (t.sliced) {
    if (!holdsJust(W.chars, t.chars)) { t.chars = [...W.chars.values()]; t.people = t.chars.map(charText); t.i = t.chars.length; }
    else for (let i = 0; i < t.chars.length; i++) if (tiesOf(t.chars[i]) !== t.ties[i]) t.people[i] = charText(t.chars[i]);
    if (!holdsJust(W.objs, t.objs)) {
      t.objs = [...W.objs.values()]; t.texts = new Array<string | null>(t.objs.length); t.j = 0; t.left = 0; t.told = undefined; t.sliced = false;
      takeSome(t, Infinity);
    } else for (let j = 0; j < t.objs.length; j++) if (thingTiesOf(t.objs[j]) !== t.oties[j]) t.texts[j] = thingIn(t, t.objs[j]);
  }
  const things: string[] = [];
  for (const x of t.texts) if (x !== null) things.push(x);
  const head = JSON.stringify({
    v: SAVE_VERSION,
    shape: WORLD_SHAPE,
    seed: S.T.seed,
    savedAt: Date.now(),
    clock: S.clock.t,
    time: S.time,
    nextId: W.nextId,
    nextUid: peekUid(),
    money: W.money,
    factionName: W.factionName,
    rel: W.rel.serialize(),
    log: W.log.slice(-120),
    flags: W.flags,
    discovered: [...W.discovered],
    research: { done: [...W.research.done], current: W.research.current, progress: W.research.progress },
    playerSquads: W.playerSquads,
    bountyBoard: W.bountyBoard,
    populated: [...W.populated],
    killsBy: W.killsBy,
    weather: S.weather?.serialize(),
    seenSites: [...W.seenSites],
    explored: exploredText(W.explored),
    squads: [...W.squads.values()].map(squadRecord),
    ...t.told,
    shops: [...W.shops.values()],
    ...t.extra,
  });
  // (the things and the people go last, each as kept or written afresh)
  return { head: `${head.slice(0, -1)},"objs":[`, things, people: t.people, base: t.whole || !t.base ? undefined : baseName(t.base) };
}
/**
 * The game as a save holds it, as text in pieces, in one step: the game as it
 * stands at one moment. With a base (a game begun, or read from a save, in
 * this version) the seed's things are told against it; otherwise, or when
 * asked for whole, every thing and town is written. (An autosave under way is
 * finished first: one at a time.)
 */
function saveParts(extra: Record<string, any> = {}, whole = false): SaveText {
  finishSave();
  return finishTaking(beginTaking(extra, whole, false));
}

/**
 * An autosave is taken a few milliseconds at a time (see slicing), each slice a
 * task of its own, so frames go on being drawn between them. While one is
 * under way the world is held (the game's loop runs no sim: see holding), and
 * any input that comes first finishes it at once (see finishSave), before
 * anything is done with that input: so nothing moves meanwhile. (Whatever
 * moves anyway, by some other way, is caught by its ties and taken again.)
 */
let pending: { W: World; finish: () => void } | null = null;
/** How long the last save held the game: its one step, or each of its slices (ms). */
export const lastHold: number[] = [];
/** Whether an autosave is under way: the world is held. */
export const holding = () => pending !== null;
/** Finishes an autosave under way, now (input is coming). */
export function finishSave() { pending?.finish(); }
/** Events that come from the player, before any of which an autosave under way is finished. */
const INPUT = ['pointerdown', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'contextmenu', 'keydown', 'keyup', 'keypress',
  'touchstart', 'touchend', 'touchcancel', 'wheel', 'input', 'change', 'submit', 'drop', 'dragstart', 'dragend', 'focusin', 'focusout'];
/** Listens for the player's input ahead of everything else (call it before anything else listens). */
export function installSaveGuard(target: EventTarget = window) {
  for (const type of INPUT) target.addEventListener(type, finishSave, { capture: true, passive: true });
}
/** How long each slice of an autosave works, at most (ms): a small part of a frame. (Tests change it.) */
export const slicing = { ms: 5 };
/** A save's text taken a slice at a time; null when the world changed hands meanwhile (a load). */
function takeInSlices(extra: Record<string, any>, whole: boolean): Promise<SaveText | null> {
  finishSave(); // (one at a time)
  const t0 = performance.now(), t = beginTaking(extra, whole, true);
  let done = takeSome(t, t0 + slicing.ms);
  lastHold.length = 0;
  lastHold.push(performance.now() - t0);
  return new Promise((res, rej) => {
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      if (pending?.finish === finish) pending = null;
      if (S.W !== t.W) { res(null); return; }
      const t1 = performance.now();
      try { res(finishTaking(t)); } catch (e) { rej(e); }
      lastHold.push(performance.now() - t1);
    };
    const next = () => {
      if (over) return;
      // (and if it has been going on for long, a tab in the background, say, whose timers are slowed: the rest now)
      if (done || S.W !== t.W || performance.now() - t0 > 1500) { finish(); return; }
      const t1 = performance.now();
      try { done = takeSome(t, t1 + slicing.ms); } catch (e) { over = true; if (pending?.finish === finish) pending = null; rej(e); return; }
      lastHold.push(performance.now() - t1);
      setTimeout(next, 0);
    };
    pending = { W: t.W, finish };
    setTimeout(next, 0);
  });
}

/** The game as a save holds it, as text (see saveParts). */
export const saveText = (extra: Record<string, any> = {}, whole = false) => joinText(saveParts(extra, whole));
/** The same, read back: a save as loadData takes it (for tools, tests and the hand-over across a reload). */
export const serialize = (extra: Record<string, any> = {}, whole = false): any => JSON.parse(saveText(extra, whole));

/** Brings an older save up to this version's layout, a version at a time. */
const MIGRATE: Record<number, (d: any) => void> = {
  // only a character's bed was kept of their mind
  3: (d) => { for (const c of d.chars) if (c.brainBed) { c.brain = { bed: c.brainBed }; delete c.brainBed; } },
  // every thing and every field written out: read as it stands (the saves after are told against a base found for it: see baseFor)
  4: () => {},
};
function migrate(d: any) {
  // (a version that is not a small whole number counts as the first: the loop is never longer than the table)
  const from = Number.isInteger(d.v) && d.v >= 1 ? d.v : 1;
  if (from === SAVE_VERSION) unpack(d);
  for (let v = from; v < SAVE_VERSION; v++) MIGRATE[v]?.(d);
  d.v = SAVE_VERSION;
}

/**
 * Reads a save into a fresh world. The world is filled first; the shared
 * clock, item numbering and weather move to the save's only once everything
 * went in, so a save that turns out to be damaged changes nothing outside W
 * (bar item numbering, which only ever moves on). A save told against a base
 * has the seed's things made again, numbered as they were, with the save's
 * changes laid over them; one told against a base this version does not make
 * exactly (another shape, or the same things made otherwise: another sum)
 * throws a SaveMisfit. Whole saves are read by any version on the same land.
 */
export function apply(data: any, W: World) {
  migrate(data);
  W.money = data.money;
  W.factionName = data.factionName;
  W.rel.load(data.rel);
  W.log = Array.isArray(data.log) ? data.log.slice(-400) : []; // the log keeps 400 (World.say)
  W.flags = data.flags ?? {};
  W.discovered = new Set(data.discovered);
  // (research into something this version does not have is let go)
  W.research = { done: new Set(data.research.done), current: own(TECH, data.research.current) ? data.research.current : '', progress: data.research.progress ?? 0 };
  W.playerSquads = data.playerSquads;
  W.bountyBoard = data.bountyBoard ?? [];
  W.populated = new Set(data.populated);
  W.killsBy = data.killsBy ?? {};
  W.seenSites = new Set(data.seenSites ?? []);
  W.explored = data.explored ? b64ToBytes(data.explored) : null;
  W.active = [];
  W.chars.clear(); W.squads.clear(); W.objs.clear(); W.shops.clear(); W.towns.clear();
  // the seed's things as made, less those gone; then every thing the save holds, new or changed
  let base: Base | undefined, untouched: Set<number> | undefined;
  const B = data.base;
  if (B) {
    build(W, B.id0, B.uid0);
    base = takeBase(W, B.id0, B.uid0);
    // (told against a base of another shape or sum, what the save left out is not what this version builds: it cannot be read)
    if (base.shape !== B.shape || base.sum !== B.sum) throw new SaveMisfit(`the save was told against another base (${B.shape} ${B.sum}; this version makes ${baseName(base)})`);
    for (const id of data.gone ?? []) W.objs.delete(id);
    const held = new Set<number>(data.objs.map((o: any) => o.id));
    untouched = new Set([...W.objs.keys()].filter((id) => !held.has(id)));
  }
  for (const o of data.objs) {
    const ob = objFrom(o);
    // older saves: a watchtower you can keep watch from, a Workshop Hall's crates as storage
    if (ob.owner === 'player' && ob.kind === 'tower' && !ob.data?.job) Object.assign((ob.data ??= {}), { job: 'watch', jobLabel: 'Keep watch' });
    if (ob.owner === 'player' && ob.kind === 'crate') { ob.kind = 'storage'; ob.locked = 0; ob.data = { ...ob.data, name: ob.data?.name ?? 'Crate' }; }
    W.objs.set(ob.id, ob);
  }
  W.rebuildObjHash();
  // towns as laid out, pointing at their things as they now stand (those gone left out); or as the save has them
  for (const t of [...W.towns.values()]) { const ti = townFrom(townToJSON(t), W); if (ti) W.towns.set(ti.site.id, ti); else W.towns.delete(t.site.id); }
  for (const t of data.towns ?? []) { const ti = townFrom(t, W); if (ti) W.towns.set(ti.site.id, ti); }
  for (const s of data.squads) { const sq = Squad.from(s); W.squads.set(sq.id, sq); }
  for (const c of data.chars) { const ch = charFrom(c); W.chars.set(ch.id, ch); }
  for (const sh of (data.shops ?? []) as Shop[]) W.shops.set(sh.id, sh);
  const again = uniqueUids(W, untouched);
  if (again) console.warn(`${again} item${again > 1 ? 's' : ''} shared a number with another, and ${again > 1 ? 'were' : 'was'} given a new one.`);
  // numbering carries on past everything already in the world, whatever the save says, so nothing new takes an old id
  let top = 0;
  for (const m of [W.chars, W.objs, W.squads] as Map<number, unknown>[]) for (const id of m.keys()) if (id > top) top = id;
  W.nextId = Math.max(data.nextId, top + 1);
  repairLinks(W);
  // what the saves after are told against: the base made again, or one found for a whole save (none if that fails: they stay whole)
  if (!base) { try { base = baseFor(W); } catch (e) { console.warn('No base for this world: its saves stay whole.', e); } }
  if (base) bases.set(W, base);
  S.clock.t = data.clock;
  S.time = data.time ?? 0;
  setNextUid(data.nextUid ?? 1);
  S.weather?.load(data.weather ?? undefined);
}

// ---------------------------------------------------------------- checks and repairs
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nums = (a: unknown, max = Infinity) => Array.isArray(a) && a.length <= max && a.every(num);
const int = (v: unknown, lo: number, hi: number) => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
/** A key a table really has (not one every object has, like "constructor"). */
const own = (table: object, k: unknown) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(table, k);
/** A key that would find something on every object: never a name of anything in the game. */
const inherited = (k: unknown) => typeof k === 'string' && k in Object.prototype;
const record = (v: unknown) => v == null || (typeof v === 'object' && !Array.isArray(v));
/** Grids are at most 12 x 10 and stacks at most 60 today; anything far past that is not a save of ours. */
const gridOK = (g: any, depth = 0): boolean =>
  !!g && int(g.w, 1, 64) && int(g.h, 1, 64) && Array.isArray(g.items) && g.items.length <= 4096 && depth < 4
  && g.items.every((i: any) => i && typeof i.id === 'string' && !inherited(i.id) && num(i.n) && i.n >= 0 && i.n <= 9999 && num(i.uid) && (!i.inv || gridOK(i.inv, depth + 1)));
/** On the map, or parked well off it as a caravan's stock is (at -100 km): not a world away. */
const placeOK = (x: unknown, z: unknown) => num(x) && num(z) && Math.abs(x) <= 1e6 && Math.abs(z) <= 1e6;

/**
 * What is wrong with a save's contents, in a few words, or '' when it can be
 * read. Saves can come from other players, so nothing is taken on trust: a
 * version that would loop for ever, a pack the size of a city, a race called
 * "constructor", a purse that is a word, data nested deeper than any save of
 * ours (it could be read, but never written again) or an item numbered as no
 * item is are all refused here, before the game being played is touched.
 * (Items of a kind this version does not know are let through: they are left
 * behind as the save is read. A save that repeats an item is read, and the
 * copy given a number of its own: see uniqueUids.) A save of this version
 * has what it leaves out put back first (unpack, in place), so every
 * character, body and item is judged whole, as before.
 */
export function damage(d: any): string {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'not a save';
  if (tooDeep(d, NEST)) return 'nested too deep';
  if (d.v !== undefined && !int(d.v, 1, SAVE_VERSION)) return 'bad version';
  for (const k of ['chars', 'objs', 'squads']) if (!Array.isArray(d[k])) return `no ${k}`;
  if (d.v === SAVE_VERSION) unpack(d);
  // the base it is told against, and which of the base's things are gone (only a save with a base has them)
  const B = d.base;
  if (B !== undefined && !(rec(B) && int(B.id0, 1, 2 ** 40) && int(B.uid0, 1, 2 ** 40) && typeof B.shape === 'string' && B.shape.length <= 40 && typeof B.sum === 'string' && B.sum.length <= 40)) return 'bad base';
  if (d.gone !== undefined && !(B !== undefined && Array.isArray(d.gone) && d.gone.length <= 1e6 && d.gone.every((id: unknown) => int(id, 1, 2 ** 40)))) return 'bad list of things gone';
  if (!nums(d.playerSquads)) return 'bad squads of yours';
  if (!num(d.clock) || !num(d.nextId) || (d.time !== undefined && !num(d.time)) || (d.nextUid !== undefined && !num(d.nextUid))) return 'no clock';
  if (!num(d.money) || (d.factionName !== undefined && typeof d.factionName !== 'string')) return 'bad purse or name';
  if (!d.rel || !Array.isArray(d.rel.rel) || !Array.isArray(d.rel.met)) return 'no standings';
  const R = d.research;
  if (!R || !Array.isArray(R.done) || !R.done.every((k: unknown) => typeof k === 'string') || (R.current != null && (typeof R.current !== 'string' || inherited(R.current))) || (R.progress != null && !num(R.progress))) return 'bad research';
  for (const k of ['discovered', 'populated', 'seenSites', 'log', 'bountyBoard', 'shops', 'towns', 'weather']) if (d[k] != null && !Array.isArray(d[k])) return `bad ${k}`;
  for (const k of ['flags', 'killsBy']) if (!record(d[k])) return `bad ${k}`;
  if (d.explored != null && typeof d.explored !== 'string') return 'bad map';
  for (const t of d.towns ?? []) if (!t || !own(TOWN_PLANS, t.plan) || !Array.isArray(t.buildings)) return 'a damaged town';
  const ids = new Set<number>();
  for (const c of d.chars) {
    if (!c || !num(c.id) || ids.has(c.id)) return 'a character without a proper id';
    ids.add(c.id);
    const who = `character ${c.id}`;
    if (typeof c.name !== 'string' || !placeOK(c.x, c.z)) return `${who} has no name or place`;
    if (!c.look || typeof c.look !== 'object' || !own(RACE, c.look.race) || (c.animal && !own(ANIMAL, c.animal)) || !own(FACTION, c.faction)) return `${who} is of no known kind`;
    const b = c.body;
    if (!b || !nums(b.hp, 7) || !nums(b.max, 7) || !nums(b.bleed, 7) || !nums(b.treated, 7) || !num(b.blood) || !num(b.bloodMax ?? 0)) return `${who} has no body`;
    if (!int(b.lost ?? 0, 0, 127) || !int(b.splint ?? 0, 0, 127) || (b.prost != null && !(Array.isArray(b.prost) && b.prost.length <= 7 && b.prost.every((p: unknown) => p == null || (typeof p === 'string' && !inherited(p)))))) return `${who} has a damaged body`;
    if (!nums(c.sk, NSK) || !gridOK(c.inv)) return `${who} has a damaged pack or skills`;
    if (c.status !== 'up' && c.status !== 'ko' && c.status !== 'dead') return `${who} is neither up, down nor dead`;
    if (!record(c.eq) || !record(c.mem) || !record(c.brain) || !record(c.bounty) || !Object.values(c.bounty ?? {}).every(num) || (c.jobs != null && !Array.isArray(c.jobs)) || (c.money != null && !num(c.money))) return `${who} is damaged`;
    for (const it of Object.values(c.eq ?? {}) as any[]) if (it && (typeof it.id !== 'string' || inherited(it.id) || !num(it.uid) || (it.inv && !gridOK(it.inv)))) return `${who} has damaged gear`;
  }
  for (const o of d.objs) {
    if (!o || !num(o.id) || !placeOK(o.x, o.z) || typeof o.kind !== 'string' || inherited(o.def) || !record(o.data) || (o.inv && !gridOK(o.inv))) return 'a damaged object';
  }
  for (const s of d.squads) if (!s || !num(s.id) || !nums(s.members) || (s.faction && !own(FACTION, s.faction))) return 'a damaged squad';
  // every item numbered as the game numbers them (one numbered twice is given another as the save is read)
  let odd = false;
  const one = (it: any) => {
    if (!int(it.uid, 0, 2 ** 40)) odd = true;
    for (const x of it.inv?.items ?? []) one(x);
  };
  for (const c of d.chars) { for (const it of c.inv.items) one(it); for (const it of Object.values(c.eq ?? {}) as any[]) if (it) one(it); }
  for (const o of d.objs) for (const it of o.inv?.items ?? []) one(it);
  if (odd) return 'an item numbered as no item is';
  return '';
}

/** How deep lists and records go in a save at most: well past any of ours (a pack in a pack in a character is a dozen). */
const NEST = 32;
/** Whether v holds lists or records nested more than `room` deep (looked into no deeper than that). */
function tooDeep(v: unknown, room: number): boolean {
  if (v === null || typeof v !== 'object') return false;
  if (room === 0) return true;
  if (Array.isArray(v)) { for (const x of v) if (tooDeep(x, room - 1)) return true; return false; }
  for (const k in v) if (tooDeep((v as Record<string, unknown>)[k], room - 1)) return true;
  return false;
}

/** Whom and what a mind can be busy with, by the name it keeps them under. */
const MIND_PEOPLE = ['task', 'talkTo', 'finish', 'salvId', 'hackId'] as const;
const MIND_THINGS = ['post', 'bed', 'tending'] as const;
function jobGone(this: World, j: { obj: number }) { return !j.obj || !this.objs.has(j.obj); }
function memberGone(this: World, id: number) { return !this.chars.has(id); }

/** Is someone carrying a body for a reason they still remember? */
const carriesFor = (c: Char, t: Char) => c.faction === 'player' || (c.brain?.task?.id === t.id && ['capture', 'arrest', 'eat'].includes(c.brain.task.k));

/**
 * Mends links that point at nothing, or at someone who does not point back:
 * the carried and their carriers, beds, cages, seats and towers, squads,
 * orders, jobs and the things minds are busy with. A captor who no longer
 * knows why they carry someone (a save from before minds were kept) puts
 * them down, and they wake as anyone else does. Returns how many were mended.
 * A whole world in good order is left exactly as it was.
 */
export function repairLinks(W: World): number {
  let n = 0;
  const char = (id: number) => (id ? W.chars.get(id) : undefined);
  const obj = (id: number) => (id ? W.objs.get(id) : undefined);
  // carrying: both ends agree, and the carrier is on their feet with a reason
  for (const c of W.chars.values()) {
    if (!c.carrying) continue;
    const t = char(c.carrying);
    if (!t || t.carriedBy !== c.id) { c.carrying = 0; n++; continue; }
    if (c.status !== 'up' || !carriesFor(c, t)) {
      c.carrying = 0; t.carriedBy = 0;
      t.x = c.x; t.z = c.z; t.y = c.y;
      n++;
    }
  }
  for (const c of W.chars.values()) {
    if (c.carriedBy && char(c.carriedBy)?.carrying !== c.id) { c.carriedBy = 0; n++; }
  }
  // furniture: whoever is in or on it must still be there, and think so
  for (const o of W.objs.values()) {
    if (o.user && char(o.user)?.mem.using !== o.id) { o.user = 0; n++; }
    if (o.occupant) {
      const t = char(o.occupant);
      if (!t || (o.kind === 'bed' ? t.bed : t.cage) !== o.id) { o.occupant = 0; n++; }
    }
    if (o.data?.upper && char(o.data.upper)?.bed !== o.id) { o.data.upper = 0; n++; }
  }
  for (const c of W.chars.values()) {
    if (c.bed) {
      const b = obj(c.bed);
      if (!b || (b.occupant !== c.id && b.data?.upper !== c.id)) { c.bed = 0; c.mem.upper = false; n++; }
    }
    if (c.cage) {
      const k = obj(c.cage);
      // a prisoner whose cage stands empty is put back in it, not let go
      if (k && !k.occupant && (k.kind === 'cage' || k.kind === 'shackle_post')) { k.occupant = c.id; n++; }
      else if (!k || k.occupant !== c.id) { c.cage = 0; n++; }
    }
    if (c.mem.using) {
      const u = obj(c.mem.using);
      if (u && !u.user) { u.user = c.id; n++; }
      else if (!u || u.user !== c.id) { c.mem.using = 0; n++; }
    }
    if (c.mem.seat && !obj(c.mem.seat)) { delete c.mem.seat; n++; }
    // orders and jobs at things that are gone
    const ord = c.order as any;
    if (ord && ((ord.id !== undefined && !char(ord.id)) || (ord.obj !== undefined && !obj(ord.obj)))) { c.order = null; n++; }
    // (a world in good order is only looked at: nothing is built anew)
    if (c.jobs.some(jobGone, W)) { c.jobs = c.jobs.filter((j) => obj(j.obj)); n++; }
    // what the mind is busy with
    const B = c.brain;
    if (!B) continue;
    for (const k of MIND_PEOPLE) {
      const id = k === 'task' ? B.task?.id : B[k];
      if (id && !char(id)) { delete B[k]; n++; }
    }
    if (B.task && !B.task.id) { delete B.task; n++; }
    for (const k of MIND_THINGS) if (B[k] && !obj(B[k])) { delete B[k]; n++; }
    if (B.haul && !obj(B.haul.to)) { B.haul = null; n++; }
  }
  // squads: members who exist, a leader among them, and everyone in a squad that exists
  for (const s of W.squads.values()) {
    if (s.members.some(memberGone, W)) { s.members = s.members.filter((id) => W.chars.has(id)); n++; }
    if (s.leader && !s.members.includes(s.leader)) { s.leader = s.members[0] ?? 0; n++; }
  }
  const ps = W.playerSquads.filter((id) => W.squads.has(id));
  if (ps.length !== W.playerSquads.length) { W.playerSquads = ps; n++; }
  for (const c of W.chars.values()) {
    if (!c.squad || W.squads.has(c.squad)) continue;
    const home = c.faction === 'player' ? W.squads.get(W.playerSquads[0]) : undefined;
    if (home) W.moveToSquad(c, home); else c.squad = 0;
    n++;
  }
  return n;
}

/**
 * Removes markup from a piece of text that came from somebody else's save:
 * whole tags, and any "<" that could open one. A "<" that cannot ("Ash <3",
 * "3 < 5 rations") is left as it is.
 */
export const stripTags = (s: string) => s.replace(/<\/?[a-z][^>]*>/gi, '').replace(/<(?=[a-z!/?])/gi, '');

/**
 * A save from elsewhere (pasted, or opened from a file) may have come from
 * another player: nothing in it may carry markup into the page. Names are
 * kept to a sensible length too.
 */
export function cleanSave(d: any): any {
  const walk = (v: any, depth: number): any => {
    if (typeof v === 'string') return v.includes('<') ? stripTags(v) : v;
    if (!v || typeof v !== 'object' || depth > 12) return v;
    if (Array.isArray(v)) { for (let i = 0; i < v.length; i++) v[i] = walk(v[i], depth + 1); return v; }
    for (const k of Object.keys(v)) {
      if (k === '__proto__') { delete v[k]; continue; } // (an object read in with Object.assign would take it as its prototype)
      v[k] = walk(v[k], depth + 1);
    }
    return v;
  };
  walk(d, 0);
  if (d && typeof d === 'object') {
    if (typeof d.factionName === 'string') d.factionName = d.factionName.slice(0, 40);
    for (const c of Array.isArray(d.chars) ? d.chars : []) {
      if (c && typeof c.name === 'string') c.name = c.name.slice(0, 48);
      if (c && typeof c.title === 'string') c.title = c.title.slice(0, 64);
    }
  }
  return d;
}

// ---------------------------------------------------------------- storage
/**
 * Compression happens in a worker of its own where the browser gives one, so
 * a save never holds the game up; otherwise here, a piece at a time, with the
 * game let run between pieces.
 */
const PACKER = `onmessage = async (e) => {
  const { n, head, things, people } = e.data;
  try { postMessage({ n, b: await new Response(new Blob([head + things.join(',') + '],"chars":[' + people.join(',') + ']}']).stream().pipeThrough(new CompressionStream('gzip'))).blob() }); }
  catch (err) { postMessage({ n, err: String(err) }); }
};`;
/** The worker, if there is one; null while none is to be had (see packerBack). */
let packer: Worker | null = null;
/** When to try for a worker again, after one would not start (not allowed here, say) or broke (ms, on the clock of performance.now). */
let packerBack = 0;
/** How long to do without one then: the saves meanwhile are compressed here, a piece at a time. */
const PACKER_REST = 5 * 60 * 1000;
const packing = new Map<number, (b: Blob | null) => void>();
let packN = 0;
function startPacker(): Worker | null {
  if (packer || performance.now() < packerBack) return packer;
  try {
    if (typeof Worker === 'undefined' || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') { packerBack = Infinity; return null; }
    const w = new Worker(URL.createObjectURL(new Blob([PACKER], { type: 'text/javascript' })));
    w.onmessage = (e) => { const done = packing.get(e.data?.n); if (done) { packing.delete(e.data.n); done(e.data.b instanceof Blob ? e.data.b : null); } };
    w.onerror = () => { stopPacker(w); };
    packer = w;
  } catch { packerBack = performance.now() + PACKER_REST; }
  return packer;
}
function stopPacker(w: Worker) {
  if (packer === w) { packer = null; packerBack = performance.now() + PACKER_REST; }
  try { w.terminate(); } catch { /* gone already */ }
  for (const done of packing.values()) done(null);
  packing.clear();
}
/** The text put together and compressed by the worker, or null when there is none or it fails (a slow one is given 20 seconds). */
function packAway(t: SaveText): Promise<Blob | null> {
  const w = startPacker();
  if (!w) return Promise.resolve(null);
  return new Promise((res) => {
    const n = ++packN;
    const late = setTimeout(() => { if (packing.has(n)) stopPacker(w); }, 20000);
    packing.set(n, (b) => { clearTimeout(late); res(b); });
    try { w.postMessage({ n, head: t.head, things: t.things, people: t.people }); } catch { packing.delete(n); clearTimeout(late); res(null); }
  });
}
/** Bytes fed to the compressor at a time, here on the game's thread. */
const PIECE = 32768;
async function gzipHere(t: SaveText): Promise<Blob> {
  const enc = new TextEncoder();
  const cs = new CompressionStream('gzip');
  const out = new Response(cs.readable).blob();
  const w = cs.writable.getWriter();
  let buf = t.head;
  const feed = async () => { await w.write(enc.encode(buf)); buf = ''; await new Promise((r) => setTimeout(r, 0)); };
  for (let i = 0; i < t.things.length; i++) {
    buf += i ? ',' + t.things[i] : t.things[i];
    if (buf.length >= PIECE) await feed();
  }
  buf += '],"chars":[';
  for (let i = 0; i < t.people.length; i++) {
    buf += i ? ',' + t.people[i] : t.people[i];
    if (buf.length >= PIECE) await feed();
  }
  buf += ']}';
  await w.write(enc.encode(buf));
  await w.close();
  return await out;
}
/**
 * Text compressed: a save's pieces put together on the way, in the worker
 * where there is one; other text here, at once. (Kept as it is where the
 * browser cannot compress.)
 */
async function gzip(t: SaveText | string): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') return new Blob([typeof t === 'string' ? t : joinText(t)]);
  if (typeof t === 'string') return await new Response(new Blob([t]).stream().pipeThrough(new CompressionStream('gzip'))).blob();
  return (await packAway(t)) ?? (await gzipHere(t));
}
async function gunzip(b: Blob): Promise<string> {
  const head = new Uint8Array(await b.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x1f || head[1] !== 0x8b || typeof DecompressionStream === 'undefined') return await b.text();
  const ds = b.stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(ds).text();
}
function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open('saltblade', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('saves'); r.result.createObjectStore('meta'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function idbPut(store: string, key: string, val: any) {
  const d = await db();
  await new Promise<void>((res, rej) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
async function idbGet(store: string, key: string): Promise<any> {
  const d = await db();
  return await new Promise((res, rej) => { const tx = d.transaction(store, 'readonly'); const r = tx.objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbDel(store: string, key: string) {
  const d = await db();
  await new Promise<void>((res) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = () => res(); tx.onerror = () => res(); });
}
async function idbDelSave(slot: string) {
  const d = await db();
  await new Promise<void>((res) => { const tx = d.transaction(['saves', 'meta'], 'readwrite'); tx.objectStore('saves').delete(slot); tx.objectStore('meta').delete(slot); tx.oncomplete = () => res(); tx.onerror = () => res(); tx.onabort = () => res(); });
}
/** A save and its listing go in together or not at all. */
async function idbPutSave(slot: string, blob: Blob, m: SaveMeta) {
  const d = await db();
  await new Promise<void>((res, rej) => {
    const tx = d.transaction(['saves', 'meta'], 'readwrite');
    tx.objectStore('saves').put(blob, slot);
    tx.objectStore('meta').put(m, slot);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}
/** The same in localStorage, which has no transactions: a listing that will not fit takes its save back out. */
function lsPutSave(slot: string, b64: string, m: SaveMeta) {
  const ks = 'sb-save-' + slot, km = 'sb-meta-' + slot;
  const old = localStorage.getItem(ks);
  localStorage.setItem(ks, b64);
  try { localStorage.setItem(km, JSON.stringify(m)); }
  catch (e) {
    try { if (old === null) localStorage.removeItem(ks); else localStorage.setItem(ks, old); } catch { /* as it stands */ }
    throw e;
  }
}
async function storedMeta(slot: string): Promise<SaveMeta | null> {
  try { const m = await idbGet('meta', slot); if (m) return m; } catch { /* no IndexedDB */ }
  try { const s = localStorage.getItem('sb-meta-' + slot); if (s) return JSON.parse(s); } catch { /* none */ }
  return null;
}

export interface SaveMeta {
  slot: string; name: string; day: number; savedAt: number; chars: number; money: number; place: string; seed: number; shape?: number;
  /** game time when it was made */
  t?: number;
  /** false when it was made with someone of yours fighting, down or carried off (see danger) */
  safe?: boolean;
  /** the name of the base the save is told against, its shape and sum (see takeBase); none for a whole save */
  base?: string;
}

/**
 * Why a save cannot be read by this version, in a few words, or '' when it
 * can: it was made on land laid out otherwise, or told against a base this
 * version does not build (another version's towns, built otherwise).
 */
export function misfit(m: { shape?: number; base?: string }): string {
  if ((m.shape ?? 1) !== WORLD_SHAPE) return 'made before the waste changed shape';
  if (m.base && madeBase && m.base !== madeBase) return 'made by another version, whose towns are built otherwise';
  return '';
}
/** Whether a save fits the world as this version makes it. */
export const fitsWorld = (m: { shape?: number; base?: string }) => !misfit(m);

/** Autosaves take turns in three slots, so a bad moment never costs the only one. */
export const AUTO_SLOTS = ['auto', 'auto2', 'auto3'];
/** Every slot there is. The emergency slot holds the game as it stood when something broke. */
export const SLOTS = [...AUTO_SLOTS, 'quick', '1', '2', '3', '4', '5', 'emergency'];
/** The slots the menu saves into. */
const MENU_SLOTS = ['1', '2', '3', '4', '5'];
/**
 * The slots whose saves are written whole, every thing in them, not told
 * against the base: the menu's own, one of the three autosaves, and the
 * emergency copy. (So are saves sent elsewhere: see exportText.) A save told
 * against the base is read only by a version that builds the seed's world
 * exactly as this one does; a whole one, by any on the same land. Quick saves
 * and the other autosaves are told against the base: small, and quick to
 * make. (Where saves can only go into localStorage, a few megabytes in all,
 * only the menu's are written whole: see cramped.)
 */
export const WHOLE_SLOTS = [...MENU_SLOTS, 'auto3', 'emergency'];
/** Set once a save would not go into IndexedDB and went into localStorage instead (see WHOLE_SLOTS). */
let cramped = false;

export function slotLabel(slot: string) {
  const a = AUTO_SLOTS.indexOf(slot);
  if (a >= 0) return `Auto ${a + 1}`;
  return slot === 'quick' ? 'Quick' : slot === 'emergency' ? 'Emergency' : 'Slot ' + slot;
}

/**
 * The autosave slot to write next: an empty one, else the one written longest
 * ago. A save from a bad moment (safe = false) never takes the place of the
 * newest good one, so a long captivity cannot push the last way back out.
 */
export function nextAutoSlot(saves: SaveMeta[], safe = true): string {
  const autos = saves.filter((m) => AUTO_SLOTS.includes(m.slot));
  const keep = safe ? '' : autos.filter((m) => m.safe !== false).sort((a, b) => b.savedAt - a.savedAt)[0]?.slot;
  let best = AUTO_SLOTS.find((s) => s !== keep)!, bt = Infinity;
  for (const slot of AUTO_SLOTS) {
    if (slot === keep) continue;
    const t = autos.find((m) => m.slot === slot)?.savedAt ?? -Infinity;
    if (t < bt) { bt = t; best = slot; }
  }
  return best;
}

/** "day 3, 14:20" (older saves only know the day). */
export function saveWhen(m: Pick<SaveMeta, 'day' | 't'>) {
  if (m.t === undefined) return `day ${m.day}`;
  const h = (m.t / 3600) % 24, mn = Math.floor((h % 1) * 60);
  return `day ${Math.floor(m.t / 86400)}, ${String(Math.floor(h)).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
}

/**
 * Why this is a bad moment to keep the game (an autosave waits for a better
 * one, and game over will not offer such a save): one of your people is
 * fighting, down, or being carried off. '' when all is quiet.
 */
export function danger(W: World = S.W): '' | 'fighting' | 'down' | 'carried' {
  for (const c of W.playerChars()) {
    if (c.status === 'dead') continue;
    if (c.carriedBy) return 'carried';
    if (c.status === 'ko') return 'down';
    if (c.target || c.brain?.enemy || S.time - c.lastHitT < 8) return 'fighting';
  }
  return '';
}

/** The newest save worth going back to after a wipe: made in a quiet moment, with someone alive in it. */
export const safeToResume = (m: SaveMeta) => fitsWorld(m) && m.slot !== 'emergency' && m.safe !== false && m.chars > 0;

/** In-memory fallback when no storage is available (still lets the session reload). */
const memory = new Map<string, Blob>();

/**
 * Keeps the game in a slot, whole or told against the base as the slot is
 * (see WHOLE_SLOTS). The game as it stands at one moment is taken in one
 * step, or (an autosave: inSlices) a few milliseconds at a time with the
 * world held meanwhile; putting it together, compressing and storing it can
 * take their time. False when it could not be kept; null when another world
 * was loaded before it was taken (nothing kept, nothing lost).
 */
export async function writeSave(slot: string, meta: Omit<SaveMeta, 'slot' | 'savedAt'>, extra: Record<string, any> = {}, inSlices = false): Promise<boolean | null> {
  const whole = WHOLE_SLOTS.includes(slot) && (!cramped || MENU_SLOTS.includes(slot));
  let text: SaveText | null;
  if (inSlices) text = await takeInSlices(extra, whole);
  else { const t0 = performance.now(); text = saveParts(extra, whole); lastHold.length = 0; lastHold.push(performance.now() - t0); }
  if (!text) return null; // (another world was loaded meanwhile: this one is gone, and nothing was kept)
  // (the game runs a moment before what was taken is handed on: each piece of a save its own short task)
  await new Promise((r) => setTimeout(r, 0));
  keepWarm();
  const blob = await gzip(text);
  const m: SaveMeta = { ...meta, slot, savedAt: Date.now(), shape: WORLD_SHAPE, base: text.base };
  let ok = false;
  try { await idbPutSave(slot, blob, m); ok = true; }
  catch {
    cramped = true;
    try { lsPutSave(slot, await blobToB64(blob), m); ok = true; } catch { /* nowhere to put it */ }
  }
  // the session keeps a copy of what went in; with no storage at all, of the only save there is.
  // (Never of a write that failed over an older save: loading the slot gives what its listing says.)
  if (ok || !(await storedMeta(slot))) memory.set(slot, blob);
  return ok;
}

export async function readSave(slot: string): Promise<any | null> {
  let blob: Blob | null = memory.get(slot) ?? null;
  if (!blob) { try { blob = (await idbGet('saves', slot)) ?? null; } catch { blob = null; } }
  if (!blob) { try { const b = localStorage.getItem('sb-save-' + slot); if (b) blob = b64ToBlob(b); } catch { /* none */ } }
  if (!blob) return null;
  return JSON.parse(await gunzip(blob));
}

/** Every save there is, newest first (an emergency save last: Continue should not pick it). */
export async function listSaves(): Promise<SaveMeta[]> {
  const out: SaveMeta[] = [];
  for (const slot of SLOTS) {
    let m: SaveMeta | null = null;
    try { m = (await idbGet('meta', slot)) ?? null; } catch { m = null; }
    if (!m) { try { const s = localStorage.getItem('sb-meta-' + slot); if (s) m = JSON.parse(s); } catch { /* none */ } }
    if (m) out.push(m);
  }
  return out.sort((a, b) => Number(a.slot === 'emergency') - Number(b.slot === 'emergency') || b.savedAt - a.savedAt);
}

export async function deleteSave(slot: string) {
  memory.delete(slot);
  try { await idbDelSave(slot); } catch { /* none */ }
  try { localStorage.removeItem('sb-save-' + slot); localStorage.removeItem('sb-meta-' + slot); } catch { /* none */ }
}

function bytesToB64(buf: Uint8Array) {
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytes(s: string) {
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

async function blobToB64(b: Blob) {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBlob(s: string) {
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf]);
}

/**
 * Offers the game as a file. Inside the claude.ai viewer the file goes
 * through its downloads capability (the viewer confirms); elsewhere a plain
 * download link. The file is the same text a copied save is, so either way
 * it loads back through Open a save file or Paste a save.
 */
export async function exportSave(name: string, extra: Record<string, any> = {}): Promise<'saved' | 'declined' | 'failed'> {
  const text = await exportText(extra);
  const filename = `${name.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'saltblade'}.saltblade.txt`;
  const host = (window as any).claude;
  if (host?.use) {
    try {
      const dl = await host.use('downloads');
      if (dl) {
        try { await dl.save({ filename, data: text }); return 'saved'; }
        catch (e: any) { if (e?.code === 'declined' || e?.code === 'rate_limited') return 'declined'; }
      }
    } catch { /* fall through to a link */ }
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return 'saved';
  } catch { return 'failed'; }
}

export async function importSaveFile(f: File): Promise<any> {
  const head = await f.slice(0, TEXT_TAG.length).text();
  if (head === TEXT_TAG) return importText(await f.text());
  return cleanSave(JSON.parse(await gunzip(f)));
}

/** Hands a save across a page reload. */
export async function stashForReload(data: any) {
  const blob = await gzip(JSON.stringify(data));
  memory.set('__reload', blob);
  try { await idbPut('saves', '__reload', blob); } catch { /* ignore */ }
}
export async function takeReloadStash(): Promise<any | null> {
  let blob: Blob | null = null;
  try { blob = (await idbGet('saves', '__reload')) ?? null; await idbDel('saves', '__reload'); } catch { blob = null; }
  if (!blob) return null;
  return JSON.parse(await gunzip(blob));
}

const TEXT_TAG = 'SALTBLADE-SAVE:';
/** The whole game as one line of text, for copying between browsers. */
/** The game as text to keep elsewhere: whole, so that it can be read by any version on the same land, in any browser. */
export async function exportText(extra: Record<string, any> = {}): Promise<string> {
  const blob = await gzip(saveParts(extra, true));
  return TEXT_TAG + (await blobToB64(blob));
}
export async function importText(text: string): Promise<any> {
  const t = text.trim();
  const b64 = t.startsWith(TEXT_TAG) ? t.slice(TEXT_TAG.length) : t;
  return cleanSave(JSON.parse(await gunzip(b64ToBlob(b64.replace(/\s+/g, '')))));
}
