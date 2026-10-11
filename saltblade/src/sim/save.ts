// Saving and loading. The land is rebuilt from its seed; everything that
// lives on it (people, squads, objects, shops, standing, research) is
// serialised, gzip-compressed and kept in IndexedDB (localStorage fallback).
import { S } from './ctx';
import { World } from './world';
import { Char } from './char';
import { Squad } from './squad';
import { Body } from './body';
import { Grid, Item, peekUid, setNextUid } from './inventory';
import { WObj } from './objects';
import { Shop } from './shops';
import { NSK } from './skills';
import type { TownInfo } from '../world/towns';
import { TOWN_PLANS } from '../content/buildings';
import { ITEM } from '../content/items';
import { RACE } from '../content/races';
import { ANIMAL } from '../content/animals';
import { FACTION } from '../content/factions';
import { TECH } from '../content/buildables';

/** 4: what each character's mind is busy with (see BRAIN_KEEP). */
export const SAVE_VERSION = 4;
/**
 * The shape of the land: which towns and landmarks the generator lays out.
 * The land is rebuilt from its seed on load, so a save only fits the shape
 * it was made in. Raise this whenever settlements, landmarks or roads change.
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

function charToJSON(c: Char): any {
  const o: any = {
    id: c.id, name: c.name, title: c.title, animal: c.animal, look: c.look, faction: c.faction, squad: c.squad, role: c.role, rank: c.rank, unique: c.unique,
    x: round(c.x), z: round(c.z), dir: round(c.dir), site: c.site, homeX: round(c.homeX), homeZ: round(c.homeZ), homeDir: round(c.homeDir),
    body: c.body.serialize(), hunger: round(c.hunger), mood: c.mood, sk: Array.from(c.sk, (v) => round(v)),
    inv: c.inv.serialize(), eq: Object.fromEntries(Object.entries(c.eq).map(([k, v]) => [k, v ? itemJSON(v) : null])),
    money: c.money, status: c.status, playDead: c.playDead, carrying: c.carrying, carriedBy: c.carriedBy, bed: c.bed, cage: c.cage, shackled: c.shackled, sleeping: c.sleeping,
    combatMode: c.combatMode, move: c.move, order: c.order, jobs: c.jobs, bounty: c.bounty, mem: c.mem, recruitable: c.recruitable, price: c.price, shop: c.shop, dialogue: c.dialogue, stats: c.stats,
  };
  const brain = brainToJSON(c.brain);
  if (brain) o.brain = brain;
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

export function serialize(extra: Record<string, any> = {}): any {
  const W = S.W;
  repairLinks(W); // (a save never holds a link to nothing)
  return {
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
    explored: W.explored ? bytesToB64(W.explored) : null,
    chars: [...W.chars.values()].map(charToJSON),
    squads: [...W.squads.values()].map((s) => s.serialize()),
    objs: [...W.objs.values()].map(objToJSON),
    shops: [...W.shops.values()],
    towns: [...W.towns.values()].map((t) => townToJSON(t)),
    ...extra,
  };
}

/** Brings an older save up to this version's layout, a version at a time. */
const MIGRATE: Record<number, (d: any) => void> = {
  // only a character's bed was kept of their mind
  3: (d) => { for (const c of d.chars) if (c.brainBed) { c.brain = { bed: c.brainBed }; delete c.brainBed; } },
};
function migrate(d: any) {
  // (a version that is not a small whole number counts as the first: the loop is never longer than the table)
  const from = Number.isInteger(d.v) && d.v >= 1 ? d.v : 1;
  for (let v = from; v < SAVE_VERSION; v++) MIGRATE[v]?.(d);
  d.v = SAVE_VERSION;
}

/**
 * Reads a save into a fresh world. The world is filled first; the shared
 * clock, item numbering and weather move to the save's only once everything
 * went in, so a save that turns out to be damaged changes nothing outside W.
 */
export function apply(data: any, W: World) {
  migrate(data);
  W.nextId = data.nextId;
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
  for (const o of data.objs) {
    const ob = objFrom(o);
    // older saves: a watchtower you can keep watch from, a Workshop Hall's crates as storage
    if (ob.owner === 'player' && ob.kind === 'tower' && !ob.data?.job) Object.assign((ob.data ??= {}), { job: 'watch', jobLabel: 'Keep watch' });
    if (ob.owner === 'player' && ob.kind === 'crate') { ob.kind = 'storage'; ob.locked = 0; ob.data = { ...ob.data, name: ob.data?.name ?? 'Crate' }; }
    W.objs.set(ob.id, ob);
  }
  W.rebuildObjHash();
  for (const s of data.squads) { const sq = Squad.from(s); W.squads.set(sq.id, sq); }
  for (const c of data.chars) { const ch = charFrom(c); W.chars.set(ch.id, ch); }
  for (const sh of (data.shops ?? []) as Shop[]) W.shops.set(sh.id, sh);
  for (const t of data.towns ?? []) { const ti = townFrom(t, W); if (ti) W.towns.set(ti.site.id, ti); }
  // numbering carries on past everything already in the world, whatever the save says, so nothing new takes an old id
  let top = 0;
  for (const m of [W.chars, W.objs, W.squads] as Map<number, unknown>[]) for (const id of m.keys()) if (id > top) top = id;
  W.nextId = Math.max(W.nextId, top + 1);
  repairLinks(W);
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
 * "constructor" or a purse that is a word are all refused here, before the
 * game being played is touched. (Items of a kind this version does not know
 * are let through: they are left behind as the save is read.)
 */
export function damage(d: any): string {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return 'not a save';
  if (d.v !== undefined && !int(d.v, 1, SAVE_VERSION)) return 'bad version';
  for (const k of ['chars', 'objs', 'squads']) if (!Array.isArray(d[k])) return `no ${k}`;
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
  return '';
}

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
    const jobs = c.jobs.filter((j) => obj(j.obj));
    if (jobs.length !== c.jobs.length) { c.jobs = jobs; n++; }
    // what the mind is busy with
    const B = c.brain;
    if (!B) continue;
    for (const k of ['task', 'talkTo', 'finish', 'salvId', 'hackId'] as const) {
      const id = k === 'task' ? B.task?.id : B[k];
      if (id && !char(id)) { delete B[k]; n++; }
    }
    if (B.task && !B.task.id) { delete B.task; n++; }
    for (const k of ['post', 'bed', 'tending'] as const) if (B[k] && !obj(B[k])) { delete B[k]; n++; }
    if (B.haul && !obj(B.haul.to)) { B.haul = null; n++; }
  }
  // squads: members who exist, a leader among them, and everyone in a squad that exists
  for (const s of W.squads.values()) {
    const members = s.members.filter((id) => W.chars.has(id));
    if (members.length !== s.members.length) { s.members = members; n++; }
    if (s.leader && !members.includes(s.leader)) { s.leader = members[0] ?? 0; n++; }
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
async function gzip(s: string): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') return new Blob([s]);
  const cs = new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(cs).blob();
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
}

/** Whether a save fits the land as this version lays it out. */
export const fitsWorld = (m: { shape?: number }) => (m.shape ?? 1) === WORLD_SHAPE;

/** Autosaves take turns in three slots, so a bad moment never costs the only one. */
export const AUTO_SLOTS = ['auto', 'auto2', 'auto3'];
/** Every slot there is. The emergency slot holds the game as it stood when something broke. */
export const SLOTS = [...AUTO_SLOTS, 'quick', '1', '2', '3', '4', '5', 'emergency'];

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

export async function writeSave(slot: string, meta: Omit<SaveMeta, 'slot' | 'savedAt'>, extra: Record<string, any> = {}): Promise<boolean> {
  const json = JSON.stringify(serialize(extra));
  const blob = await gzip(json);
  const m: SaveMeta = { ...meta, slot, savedAt: Date.now(), shape: WORLD_SHAPE };
  let ok = false;
  try { await idbPutSave(slot, blob, m); ok = true; }
  catch {
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
export async function exportText(extra: Record<string, any> = {}): Promise<string> {
  const blob = await gzip(JSON.stringify(serialize(extra)));
  return TEXT_TAG + (await blobToB64(blob));
}
export async function importText(text: string): Promise<any> {
  const t = text.trim();
  const b64 = t.startsWith(TEXT_TAG) ? t.slice(TEXT_TAG.length) : t;
  return cleanSave(JSON.parse(await gunzip(b64ToBlob(b64.replace(/\s+/g, '')))));
}
