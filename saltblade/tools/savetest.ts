// Headless check of saving and loading: what minds are busy with survives a
// save (a captive being carried off, a haul, a harvest, a post, a wreck half
// stripped, a band's leader walking up to talk); a captive taken mid-carry
// is still delivered after a load, and one whose captor has forgotten why
// (an older save) is put down; a damaged save is refused without touching the
// game being played; links to things that are gone are mended; saves from
// elsewhere lose any markup; and the autosave takes turns in three slots and
// waits for a quiet moment. And (version 5) a save holds only what differs
// from what the land's seed makes: things added, changed or gone, a shop's
// stock and the work taken on all read back the same, and so does every way a
// thing or a person can change (every field a save writes of a person, in
// turn, on someone kept since the last save); a save from version 4 loads, and
// the saves after it are small; a save told against another version's base is
// refused, and once what the seed builds changes it is greyed out, while the
// whole saves (the menu's, one autosave, an export) still load and Continue
// goes to them; an autosave taken a slice at a time is the game at one moment,
// whatever moves meanwhile; a mid-game save is a fraction of the size, and
// quick to make.
// Usage: npx tsx tools/savetest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR } from '../src/sim/clock';
import { RNG } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { structuresIn, townRings } from '../src/sim/structures';
import { buildSeedWorld } from '../src/world/seedworld';
import { Grid, peekUid, makeItem } from '../src/sim/inventory';
import { populateTown, populateSite } from '../src/sim/populate';
import { openJobs, takeContract, contractsState } from '../src/sim/contracts';
import { findItem } from '../src/sim/errands';
import { FACTION } from '../src/content/factions';
import { tickWorld } from '../src/sim/worldsim';
import { gzipSync } from 'node:zlib';
import { TOWN_PLANS } from '../src/content/buildings';
import { ITEM, slotFor } from '../src/content/items';
import { ANIMAL } from '../src/content/animals';
import { RACE } from '../src/content/races';
import { Squad } from '../src/sim/squad';
import { makePerson, makeAnimal } from '../src/sim/spawn';
import { knockOut } from '../src/sim/health';
import { workSalvage } from '../src/sim/salvage';
import { takeBed } from '../src/sim/use';
import { G } from '../src/state';
import {
  serialize, apply, repairLinks, damage, cleanSave, stripTags, exportText, importText, listSaves, readSave, writeSave, nextAutoSlot, danger, safeToResume,
  markBase, noteSeed, seedName, seedBase, misfit, fitsWorld, saveText, keepWarm, holding, finishSave, lastHold, slicing, AUTO_SLOTS, SAVE_VERSION, WORLD_SHAPE, COVERED, type SaveMeta,
} from '../src/sim/save';
import { enslave } from '../src/sim/ai';
import { placeInto } from '../src/sim/use';
import { loadData, autosave, saveGame, tickAutosave, unsavedTime, sessionExtra } from '../src/game/session';
import { Char, EQUIP_SLOTS } from '../src/sim/char';
import type { WObj } from '../src/sim/objects';

// storage: no IndexedDB here, so saves fall back to (this stand-in for) localStorage
const store = new Map<string, string>();
let full = false; // (the browser's storage quota, reached)
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => { if (full) throw new Error('QuotaExceededError'); store.set(k, String(v)); },
    removeItem: (k: string) => void store.delete(k),
  },
});

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(77), time: 0 });
S.clock.t = 12 * HOUR;
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const notices: string[] = [];
S.fx = { ...S.fx, notice: (t: string) => { notices.push(t); }, say: () => {}, sound: () => {}, burst: () => {}, hit: () => {} } as typeof S.fx;
// the world as a new game makes it: what the seed makes, remembered as the base saves are told against
const dice = (S.rng as any).s, id0 = W.nextId, uid0 = peekUid();
buildSeedWorld(W, T);
markBase(W, id0, uid0);
const diceAfter = (S.rng as any).s;
// just enough of the game around the world for a session to load into
const cam = { target: { x: 0, z: 0 }, yaw: 0, pitch: 0.6, dist: 40, wantYaw: 0, wantPitch: 0, follow: null, lookAt(x: number, z: number, d: number) { cam.target.x = x; cam.target.z = z; cam.dist = d; } };
Object.assign(G, { T, nav, W, seed: 1337, mode: 'play', speed: 1, lastSpeed: 1, settings: { autosave: 1 }, cam, structViews: { clear() {}, W }, charViews: { clear() {} } });

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
check('the seed\'s things are made without the game\'s own dice', dice === diceAfter);
const rng = new RNG(3);
const copy = (d: any) => JSON.parse(JSON.stringify(d));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** serialize, then read it back into a world of its own, which becomes the world */
const reload = (data = copy(serialize())) => { const w = new World(); S.W = w; G.W = w; apply(data, w); w.rebuildObjHash(); return w; };
const steps = (secs: number, focus: { x: number; z: number }) => { for (let i = 0; i < secs / 0.1; i++) { simStep(0.1, focus); tickSquads(0.1); } };
/** every link in a world that points at something that is not there */
function dangling(w: World): string[] {
  const out: string[] = [];
  const char = (id: number) => !id || w.chars.has(id), obj = (id: number) => !id || w.objs.has(id);
  for (const c of w.chars.values()) {
    if (!char(c.carrying) || !char(c.carriedBy)) out.push(`${c.id} carry`);
    if (!obj(c.bed) || !obj(c.cage) || !obj(c.mem.using) || !obj(c.mem.seat)) out.push(`${c.id} furniture`);
    if (c.brain?.task && !char(c.brain.task.id)) out.push(`${c.id} task`);
    if (c.carrying && w.chars.get(c.carrying)!.carriedBy !== c.id) out.push(`${c.id} carrying one-sided`);
    if (c.carriedBy && w.chars.get(c.carriedBy)!.carrying !== c.id) out.push(`${c.id} carried one-sided`);
  }
  for (const o of w.objs.values()) if (!char(o.user ?? 0) || !char(o.occupant ?? 0) || !char(o.data?.upper ?? 0)) out.push(`obj ${o.id}`);
  for (const s of w.squads.values()) if (s.members.some((m) => !w.chars.has(m))) out.push(`squad ${s.id}`);
  return out;
}
const diff = (a: any, b: any, path = ''): string[] => {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) return [path];
  if (a && typeof a === 'object') { const out: string[] = []; for (const k of new Set([...Object.keys(a), ...Object.keys(b ?? {})])) { out.push(...diff(a[k], b?.[k], path + '.' + k)); if (out.length > 5) break; } return out; }
  return a === b || (typeof a === 'number' && Math.abs(a - b) < 1e-9) ? [] : [path];
};
/** Where two values read from JSON differ, exactly (the order of keys aside). */
const differ = (a: any, b: any, path = ''): string[] => {
  if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b) || (a === null) !== (b === null)) return [path || '(top)'];
  if (a && typeof a === 'object') {
    const out: string[] = [];
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) { if (!(k in a) || !(k in b)) out.push(`${path}.${k} (only one has it)`); else out.push(...differ(a[k], b[k], path + '.' + k)); if (out.length > 5) break; }
    return out;
  }
  return a === b ? [] : [`${path}: ${JSON.stringify(a)} / ${JSON.stringify(b)}`];
};
/** A world, as a whole save of it says (every thing, every field), in an order of its own: what is the same world reads the same. */
function wholeOf(w: World): any {
  const keep = S.W, keepG = G.W;
  S.W = w; G.W = w;
  const d = serialize({}, true);
  S.W = keep; G.W = keepG;
  delete d.savedAt; delete d.nextUid; // (when it was made, and the next number an item would get: not things in the world)
  for (const k of ['chars', 'objs', 'squads', 'shops']) d[k].sort((a: any, b: any) => a.id - b.id);
  d.towns.sort((a: any, b: any) => a.site - b.site);
  return d;
}
/** A save less when it was made and the next item number (both move on with every save and load). */
const bare = (d: any) => { const o = copy(d); delete o.savedAt; delete o.nextUid; return o; };
/** What console.warn says while f runs. */
function warned(f: () => void): string[] {
  const said: string[] = [], warn = console.warn;
  console.warn = (...a: unknown[]) => { said.push(a.map(String).join(' ')); };
  try { f(); } finally { console.warn = warn; }
  return said;
}

// ---------------------------------------------------------------- saves as version 4 wrote them (the shipped writer, kept as it was)
const v4 = {
  round: (v: number, k = 100) => Math.round(v * k) / k,
  BRAIN_KEEP: ['bed', 'task', 'haul', 'post', 'reaped', 'dug', 'hauling', 'tending', 'tendT', 'mineT', 'salvId', 'salvT', 'hackId', 'hackT', 'lockT', 'aidT', 'finish', 'talkTo', 'talkT', 'inspect', 'alarm', 'alarmT'],
  brainToJSON(b: any): any { let o: any; for (const k of v4.BRAIN_KEEP) { const v = b?.[k]; if (v !== undefined && v !== null && v !== false) (o ??= {})[k] = v; } return o; },
  itemJSON: (it: any): any => ({ ...it, inv: it.inv ? it.inv.serialize() : undefined }),
  charToJSON(c: Char): any {
    const r = v4.round;
    const o: any = {
      id: c.id, name: c.name, title: c.title, animal: c.animal, look: c.look, faction: c.faction, squad: c.squad, role: c.role, rank: c.rank, unique: c.unique,
      x: r(c.x), z: r(c.z), dir: r(c.dir), site: c.site, homeX: r(c.homeX), homeZ: r(c.homeZ), homeDir: r(c.homeDir),
      body: c.body.serialize(), hunger: r(c.hunger), mood: c.mood, sk: Array.from(c.sk, (v) => r(v)),
      inv: c.inv.serialize(), eq: Object.fromEntries(Object.entries(c.eq).map(([k, v]) => [k, v ? v4.itemJSON(v) : null])),
      money: c.money, status: c.status, playDead: c.playDead, carrying: c.carrying, carriedBy: c.carriedBy, bed: c.bed, cage: c.cage, shackled: c.shackled, sleeping: c.sleeping,
      combatMode: c.combatMode, move: c.move, order: c.order, jobs: c.jobs, bounty: c.bounty, mem: c.mem, recruitable: c.recruitable, price: c.price, shop: c.shop, dialogue: c.dialogue, stats: c.stats,
    };
    const brain = v4.brainToJSON(c.brain);
    if (brain) o.brain = brain;
    return o;
  },
  objToJSON(o: WObj): any { const { view, ...rest } = o as any; return { ...rest, inv: o.inv ? o.inv.serialize() : undefined }; },
  townToJSON(t: any): any {
    return {
      site: t.site.id, plan: Object.keys(TOWN_PLANS).find((k) => TOWN_PLANS[k] === t.plan), style: t.style, buildings: t.buildings.map((b: any) => b.id), gates: t.gates, posts: t.posts, patrol: t.patrol,
      beds: t.beds, shops: t.shops.map((s: any) => ({ kind: s.kind, building: s.building.id, counter: s.counter.id, spot: s.spot })),
      bars: t.bars.map((b: any) => ({ building: b.building.id, counter: b.counter.id, spot: b.spot, seats: b.seats })), cages: t.cages, fields: t.fields.map((f: any) => f.id), jobs: t.jobs, plazaR: t.plazaR,
    };
  },
  b64(buf: Uint8Array) { let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000)); return btoa(s); },
  /** The game as version 4 saved it (as it was shipped; links mended first, as it did). */
  serialize(extra: Record<string, any> = {}): any {
    const W = S.W;
    repairLinks(W);
    return {
      v: 4, shape: WORLD_SHAPE, seed: S.T.seed, savedAt: Date.now(), clock: S.clock.t, time: S.time, nextId: W.nextId, nextUid: peekUid(), money: W.money, factionName: W.factionName,
      rel: W.rel.serialize(), log: W.log.slice(-120), flags: W.flags, discovered: [...W.discovered],
      research: { done: [...W.research.done], current: W.research.current, progress: W.research.progress },
      playerSquads: W.playerSquads, bountyBoard: W.bountyBoard, populated: [...W.populated], killsBy: W.killsBy, weather: S.weather?.serialize(), seenSites: [...W.seenSites],
      explored: W.explored ? v4.b64(W.explored) : null,
      chars: [...W.chars.values()].map(v4.charToJSON), squads: [...W.squads.values()].map((s) => s.serialize()), objs: [...W.objs.values()].map(v4.objToJSON),
      shops: [...W.shops.values()], towns: [...W.towns.values()].map((t) => v4.townToJSON(t)),
      ...extra,
    };
  },
};

// ---------------------------------------------------------------- a captive carried off, saved halfway there
const ps = new Squad(); ps.faction = 'player'; ps.kind = 'player'; ps.name = 'Wanderers'; W.addSquad(ps); W.playerSquads.push(ps.id);
const cf = T.sites.find((s) => s.settlement === 'chainfield')!;
const cage0 = [...W.objs.values()].find((o) => o.kind === 'cage' && o.site === cf.id)!;
const [px, pz] = nav.nearestOpen(cage0.x + 22, cage0.z + 4, 10)!;
const here = { x: px, z: pz };
const mine = (dx = 0, dz = 0): Char => {
  const c = makePerson(W, { faction: 'drifters', role: 'wanderer', race: 'valefolk', level: 12, whole: true } as any, rng);
  c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, ps);
  const p = nav.nearestOpen(px + dx, pz + dz, 10)!; c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z);
  return c;
};
const victim = mine();
const ss = new Squad(); ss.faction = 'chainhouse'; ss.kind = 'slavers'; ss.name = 'Slavers'; W.addSquad(ss);
const slaver = makePerson(W, { faction: 'chainhouse', role: 'slaver', level: 30 } as any, rng);
W.moveToSquad(slaver, ss); slaver.x = px + 2; slaver.z = pz; slaver.y = T.heightAt(slaver.x, slaver.z); slaver.homeX = slaver.x; slaver.homeZ = slaver.z;
victim.body.hp[1] = -20; knockOut(victim);
let t = 0;
while (slaver.carrying !== victim.id && t < 60) { steps(0.5, here); t += 0.5; }
// saved on the last stretch, wherever the captive is being taken (a cage, a field)
const togo = () => Math.hypot(slaver.x - slaver.brain.task?.dx, slaver.z - slaver.brain.task?.dz);
for (let i = 0; i < 300 && slaver.carrying === victim.id && !(togo() < 35); i++) steps(1, here);
const task0 = slaver.brain.task;
check('a slaver picks up a knocked-out wanderer and carries them off', slaver.carrying === victim.id && task0?.k === 'capture', `saved ${togo().toFixed(0)} m from where they are going`);
const midCarry = copy(serialize());
const midCarry4 = copy(v4.serialize()); // (the same moment, as version 4 wrote it)
const liveW = S.W;
{
  const w = reload(copy(midCarry));
  const s2 = w.chars.get(slaver.id)!, v2 = w.chars.get(victim.id)!;
  check('after a load the slaver still knows where the captive is going', s2.brain.task?.k === 'capture' && s2.brain.task.id === v2.id && s2.brain.task.dx === task0.dx && s2.carrying === v2.id && v2.carriedBy === s2.id);
  let secs = 0;
  while (v2.carriedBy && secs < 60) { steps(1, here); secs++; }
  // (delivered: caged, or put to work in their captors' fields, wherever the captors keep them)
  check('...and delivers them within a minute', !v2.carriedBy && !s2.carrying && (!!v2.cage || v2.mem.enslavedBy === s2.faction), `${secs} s; ${v2.cage ? 'caged' : v2.mem.slaveSite ? 'a slave in the fields' : 'on the ground'}`);
}
{
  // the same moment in a save from before minds were kept (version 3): only the bed survived
  const old = copy(midCarry4);
  old.v = 3;
  for (const c of old.chars) { if (c.brain?.bed) c.brainBed = c.brain.bed; delete c.brain; }
  const w = reload(old);
  const s2 = w.chars.get(slaver.id)!, v2 = w.chars.get(victim.id)!;
  check('an older save: a captor who no longer knows why puts the captive down at once', !v2.carriedBy && !s2.carrying && Math.hypot(v2.x - s2.x, v2.z - s2.z) < 1);
  // a captor with no task carries nobody for good: within a minute the captive is delivered or on the ground
  let stuck = 0, again = false;
  for (let i = 0; i < 60; i++) { steps(1, here); if (v2.carriedBy) again = true; if (v2.carriedBy && !w.chars.get(v2.carriedBy)?.brain.task) stuck++; }
  check('...and nobody is carried without a reason afterwards', stuck === 0, `${again ? 'picked up again with a fresh task, ' : ''}${v2.carriedBy ? 'still on the way' : v2.cage ? 'now caged' : 'on the ground'}`);
}
{
  // a save in which the captor is gone altogether (and a bed, a cage and a seat with them)
  const d = copy(midCarry);
  d.chars = d.chars.filter((c: any) => c.id !== slaver.id);
  const w = reload(d);
  const v2 = w.chars.get(victim.id)!;
  v2.body.hp[1] = v2.body.max[1];
  steps(15, here);
  check('a captive whose captor is gone is not carried by nobody, and wakes up', !v2.carriedBy && v2.status === 'up', v2.status);
}
S.W = liveW; G.W = liveW;

// ---------------------------------------------------------------- what else a mind keeps
const worker = mine(4, 0), lookout = mine(6, 0);
const storage = [...W.objs.values()].find((o) => o.kind === 'chest' || o.kind === 'storage')!;
const tower = [...W.objs.values()].find((o) => o.kind === 'tower' || o.kind === 'turret') ?? storage;
const wreck = makePerson(W, { faction: 'drifters', role: 'wanderer', level: 5 } as any, rng);
Object.assign(worker.brain, { haul: { id: 'iron_bar', to: storage.id }, reaped: 6, dug: 3, hauling: true, salvId: wreck.id, salvT: 7.5, hackId: wreck.id, hackT: 6, lockT: 2.1, mineT: 4.2, tending: storage.id, tendT: 11 });
Object.assign(lookout.brain, { post: tower.id, alarm: 9, alarmT: S.time - 20 });
const leader = makePerson(W, { faction: 'reavers', role: 'bandit', level: 10 } as any, rng);
Object.assign(leader.brain, { talkTo: lookout.id, talkT: S.time, inspect: true, task: { k: 'loot', id: victim.id, t: 3, w: 1.5 } });
{
  const before = copy(serialize());
  const w = reload(copy(before));
  const wk = w.chars.get(worker.id)!.brain, lk = w.chars.get(lookout.id)!.brain, ld = w.chars.get(leader.id)!.brain;
  check('a haul, a harvest and ore being carried to storage survive a load', wk.haul?.to === storage.id && wk.haul.id === 'iron_bar' && wk.reaped === 6 && wk.dug === 3 && wk.hauling === true);
  check('...as do a wreck half stripped, a machine half rewritten and a lock half picked', wk.salvId === wreck.id && wk.salvT === 7.5 && wk.hackT === 6 && wk.lockT === 2.1 && wk.mineT === 4.2);
  check('...a post kept, and a band\'s leader walking up to talk and search', lk.post === tower.id && ld.talkTo === lookout.id && ld.inspect === true && ld.task?.k === 'loot' && ld.task.w === 1.5);
  const after = copy(serialize());
  const d = differ(bare(before), bare(after));
  check('a save read back and written again is the same, minds and all', d.length === 0, d.slice(0, 3).join(', '));
  check('...and a world in good order needs no mending', repairLinks(w) === 0);
  // half-done work picks up where it was: a rustspider all but stripped comes apart at once
  const spider = makeAnimal(w, 'rustspider', rng);
  spider.x = px + 3; spider.z = pz; spider.status = 'ko';
  Object.assign(w.chars.get(worker.id)!.brain, { salvId: spider.id, salvT: 8.9 });
  const w2 = reload();
  const done = workSalvage(w2.chars.get(worker.id)!, w2.chars.get(spider.id)!, 0.2);
  check('...and a wreck half stripped comes apart where the work left off', done && !w2.chars.has(spider.id));
  S.W = liveW; G.W = liveW;
}

// ---------------------------------------------------------------- links to things that are gone
{
  const sleeper = mine(-4, 0), sitter = mine(-6, 0), prisoner = mine(-8, 0);
  const bed = [...W.objs.values()].find((o) => o.kind === 'bed' && !o.occupant)!;
  takeBed(sleeper, bed);
  const stool = [...W.objs.values()].find((o) => o.kind === 'stool' && !o.user)!;
  stool.user = sitter.id; sitter.mem.using = stool.id; sitter.mem.sit = true;
  const cage = [...W.objs.values()].find((o) => o.kind === 'cage' && !o.occupant && o !== cage0)!;
  cage.occupant = prisoner.id; prisoner.cage = cage.id;
  const d = copy(serialize({}, true)); // (whole: every thing in it, to take some out)
  // the sleeper and the sitter go, and the cage, a bed nobody is in and the stool's seat with them
  const gone = new Set([sleeper.id, sitter.id]);
  d.chars = d.chars.filter((c: any) => !gone.has(c.id));
  d.objs = d.objs.filter((o: any) => o.id !== cage.id);
  const strayBed = d.objs.find((o: any) => o.kind === 'bed' && !o.occupant);
  strayBed.occupant = 999999;
  const p = d.chars.find((c: any) => c.id === prisoner.id);
  (p.mem ??= {}).using = 888888; // (a record leaves out what is plain: an empty memory among it)
  p.brain = { task: { k: 'aid', id: 777777, t: 0 }, post: 666666 };
  p.order = { k: 'follow', id: 555555 };
  const w = reload(d);
  const p2 = w.chars.get(prisoner.id)!;
  const left = dangling(w);
  check('after a load nothing points at someone or something that is not there', left.length === 0, left.slice(0, 4).join(', '));
  check('...the bed and stool of the departed are free again', !w.objs.get(bed.id)!.occupant && !w.objs.get(stool.id)!.user && !w.objs.get(strayBed.id)!.occupant);
  check('...a prisoner whose cage is gone is out of it, and forgets a task and an order for the vanished', !p2.cage && !p2.mem.using && !p2.brain.task && !p2.brain.post && !p2.order);
  check('...and the squad no longer counts the departed', !w.squads.get(ps.id)!.members.some((m) => gone.has(m)));
  S.W = liveW; G.W = liveW;
  // put the live world back as it was
  for (const c of [sleeper, sitter, prisoner]) { W.removeChar(c); }
  bed.occupant = 0; stool.user = 0; cage.occupant = 0;
}

// ---------------------------------------------------------------- a damaged save over a game in progress
{
  const before = { w: S.W, chars: S.W.chars.size, objs: S.W.objs.size, clock: S.clock.t, time: S.time, weather: JSON.stringify(S.weather.serialize()) };
  const quiet = console.error;
  console.error = () => {}; // (the refusals are logged)
  const errA = loadData({ v: 3, seed: 1337, shape: 2, chars: [{ id: 1 }], objs: [], squads: [], shops: [], rel: { rel: [], met: [] }, research: { done: [] }, playerSquads: [] });
  // and one that passes every check but breaks while it is read in, after the people
  const bad = copy(midCarry);
  bad.towns = [{ site: cf.id, plan: 'nope', buildings: null }];
  bad.clock = before.clock + 5 * HOUR;
  const errB = loadData(bad);
  console.error = quiet;
  const intact = S.W === before.w && S.W.chars.size === before.chars && S.W.objs.size === before.objs && S.clock.t === before.clock && S.time === before.time && JSON.stringify(S.weather.serialize()) === before.weather;
  check('a damaged save is refused, and the game being played is left exactly as it was', !!errA && !!errB && intact, `${errA} / ${errB}`);
  check('the checks name what is wrong with a damaged save', damage({ ...copy(midCarry), chars: [{ id: 1, name: 'x', x: 0, z: 0, look: { race: 'valefolk' } }] }) !== '' && damage(copy(midCarry)) === '');
  const errC = loadData(copy(midCarry));
  check('a good save loads over it', errC === null && S.W !== before.w && S.W.chars.size === midCarry.chars.length);
}

// ---------------------------------------------------------------- hostile saves (they can come from other players)
{
  const quiet = console.error;
  console.error = () => {};
  const good = copy(serialize({}, true)); // (whole, written out in full, as an older save or a hand-made one would be)
  const someone = good.chars.findIndex((c: any) => c.inv?.items?.length);
  const hostile: [string, (d: any) => void][] = [
    ['a version far below the first', (d) => { d.v = -2e7; }],
    ['a version of minus infinity', (d) => { d.v = -Infinity; }],
    ['a version that is not whole', (d) => { d.v = 2.5; }],
    ['flags that are a word', (d) => { d.flags = 'abc'; }],
    ['a purse that is a word', (d) => { d.money = 'rich'; }],
    ['squads of yours that are not ids', (d) => { d.playerSquads = ['x', null]; }],
    ['kills that are a number', (d) => { d.killsBy = 5; }],
    ['research that is an object', (d) => { d.research.current = { a: 1 }; }],
    ['a pack the size of a city', (d) => { d.chars[someone].inv.w = 1e5; d.chars[someone].inv.h = 1e5; }],
    ['a stack of minus five', (d) => { d.chars[someone].inv.items[0].n = -5; }],
    ['a stack of a million', (d) => { d.chars[someone].inv.items[0].n = 1e6; }],
    ['a race called constructor', (d) => { d.chars[0].look.race = 'constructor'; }],
    ['a beast called toString', (d) => { d.chars[0].animal = 'toString'; }],
    ['a faction called constructor', (d) => { d.chars[0].faction = 'constructor'; }],
    ['an item called constructor', (d) => { d.chars[someone].inv.items[0].id = 'constructor'; }],
    ['gear called __proto__', (d) => { (d.chars[0].eq ??= {}).weapon = { uid: 1e6, id: '__proto__', n: 1, q: 2, x: 0, y: 0 }; }],
    ['lost limbs that are a word', (d) => { d.chars[0].body.lost = 'abc'; }],
    ['a bounty that is markup', (d) => { d.chars[0].bounty = { reavers: '" onmouseover="alert(1)' }; }],
    ['a town laid out to a plan called constructor', (d) => { d.towns[0].plan = 'constructor'; }],
    ['someone a world away', (d) => { d.chars[0].x = 1e12; }],
  ];
  const missed = hostile.filter(([, edit]) => { const d = copy(good); edit(d); return damage(d) === ''; }).map(([label]) => label);
  // and in what only this version writes: the base a save is told against, what of it is gone, records with their plain parts left out
  const someoneD = midCarry.chars.findIndex((c: any) => c.inv?.items?.length);
  const hostile5: [string, (d: any) => void][] = [
    ['a base numbered from below one', (d) => { d.base.id0 = -1; }],
    ['a base numbered with a word', (d) => { d.base.uid0 = 'many'; }],
    ['a base numbered past counting', (d) => { d.base.id0 = 1e300; }],
    ['a base that is a word', (d) => { d.base = 'abc'; }],
    ['a base whose shape is a list', (d) => { d.base.shape = [1, 2]; }],
    ['a base whose shape is a book', (d) => { d.base.shape = 'x'.repeat(1e5); }],
    ['things gone that are a word', (d) => { d.gone = 'abc'; }],
    ['things gone that are not whole', (d) => { d.gone = [1.5]; }],
    ['things gone below one', (d) => { d.gone = [-3]; }],
    ['things gone without a base', (d) => { delete d.base; d.gone = [5]; }],
    ['things gone by the million', (d) => { d.gone = Array.from({ length: 1e6 + 1 }, (_, i) => i + 1); }],
    ['a body with no measure of a whole one', (d) => { d.chars[0].body = { pv: 1 }; }],
    ['a stack that is a word', (d) => { d.chars[someoneD].inv.items[0].n = 'many'; }],
    ['a pack that is a word', (d) => { d.chars[0].inv = 'abc'; }],
    ['gear that is a list', (d) => { d.chars[0].eq = [1]; }],
    ['data nested a hundred thousand deep (read, it could never be written again)', (d) => { let v: any = 1; for (let i = 0; i < 1e5; i++) v = { v }; d.flags.deep = v; }],
    ['data nested forty deep in a thing', (d) => { let v: any = 1; for (let i = 0; i < 40; i++) v = [v]; d.objs.push({ id: 9e6, kind: 'decor', def: 'x', x: 0, z: 0, y: 0, rot: 0, owner: '', site: 0, parent: 0, data: { deep: v } }); }],
    ['an item numbered past counting', (d) => { d.chars[someoneD].inv.items[0].uid = 1e300; }],
    ['an item numbered by halves', (d) => { d.chars[someoneD].inv.items[0].uid = 2.5; }],
  ];
  const missed5 = hostile5.filter(([, edit]) => { const d = copy(midCarry); edit(d); return damage(d) === ''; }).map(([label]) => label);
  // what this version leaves out of a record (a whole body, a stack of one, a plain field) is filled in, not refused
  const plain = copy(midCarry);
  const pc = plain.chars[someoneD];
  delete pc.body.hp; delete pc.inv.items[0].n; delete pc.title; delete pc.eq;
  check('a save with what this version leaves out left out is read, and judged whole', damage(plain) === '' && pc.body.hp?.length === 7 && pc.inv.items[0].n === 1 && pc.title === '' && pc.eq.weapon === null, damage(plain));
  check('...and its own hostile kinds are refused too', missed5.length === 0 && someoneD >= 0, missed5.length ? `let through: ${missed5.join(', ')}` : `${hostile5.length} kinds`);
  // what the game itself does is let through: a caravan's stock parked off the map, a lone "<" in a name
  const odd = copy(midCarry);
  odd.objs.push({ id: 1e7, kind: 'crate', def: 'caravan', x: -1e5, z: -1e5, y: 0, rot: 0, owner: 'drifters', site: 0, parent: 0, hidden: true, inv: { w: 12, h: 10, items: [] } });
  odd.chars[0].name = 'Ash <3';
  check('a save with what the game itself does in it is not taken for a hostile one', damage(odd) === '', damage(odd));
  check('hostile saves are refused before anything is read in', missed.length === 0, missed.length ? `let through: ${missed.join(', ')}` : `${hostile.length} kinds`);
  // and at once: a version far below the first is not counted up to
  const live = S.W;
  const slow = copy(midCarry); slow.v = -2e7;
  const inf = copy(midCarry); inf.v = -Infinity;
  const t1 = performance.now();
  const e1 = loadData(slow), e2 = loadData(inf);
  const t2 = performance.now();
  const clock = S.clock.t, time = S.time;
  try { apply({ ...copy(midCarry), v: -1e9 }, new World()); } catch { /* (tools read saves with apply directly: it may fail, but not loop) */ }
  const t3 = performance.now();
  S.clock.t = clock; S.time = time; S.W = live; G.W = live;
  check('...at once, whatever the version says, and reading one directly cannot loop either', !!e1 && !!e2 && S.W === live && t2 - t1 < 200 && t3 - t2 < 3000, `${(t2 - t1).toFixed(0)} ms, ${(t3 - t2).toFixed(0)} ms`);
  // a camera that is not a number is not followed: the game looks at your people instead
  const nancam = copy(midCarry);
  nancam.cam = { x: NaN, z: 'a', yaw: null, pitch: {}, dist: -1 };
  const e3 = loadData(nancam);
  check('a save with a camera that is not a number loads, and the camera stays on the map', e3 === null && Number.isFinite(cam.target.x) && Number.isFinite(cam.target.z) && Number.isFinite(cam.dist), `${cam.target.x.toFixed(0)}, ${cam.target.z.toFixed(0)}`);
  // numbering that says 1 in a full world would hand the next newcomer an old one's id
  const lowId = copy(midCarry);
  lowId.nextId = 1;
  const wl = new World();
  apply(lowId, wl);
  const topId = Math.max(...wl.chars.keys(), ...wl.objs.keys(), ...wl.squads.keys());
  S.clock.t = clock; S.time = time; S.W = live; G.W = live;
  check('...and a save whose numbering runs behind its own things carries on past them', wl.nextId > topId, `next ${wl.nextId}, highest in use ${topId}`);
  // a save that repeats an item (should the game ever put one in two places), this version's or an older one's: read, and
  // the copy given a number of its own, so that saves after can be read too
  const mended: string[] = [];
  for (const [label, from] of [['this version\'s', midCarry], ['an older version\'s', midCarry4]] as const) {
    const twice = copy(from);
    const holder = twice.chars.find((c: any) => c.inv?.items?.length);
    holder.inv.items.push({ ...holder.inv.items[0], x: 0, y: 0 });
    let e4: string | null = 'not run';
    const said4 = warned(() => { e4 = loadData(twice); });
    const counts = new Map<number, number>();
    const count = (g?: Grid) => { for (const it of g?.items ?? []) { counts.set(it.uid, (counts.get(it.uid) ?? 0) + 1); count(it.inv); } };
    for (const c of S.W.chars.values()) { count(c.inv); for (const it of Object.values(c.eq)) if (it) { counts.set(it.uid, (counts.get(it.uid) ?? 0) + 1); count(it.inv); } }
    for (const o of S.W.objs.values()) count(o.inv);
    const kept = S.W.chars.get(holder.id)?.inv.items.length;
    const again = loadData(copy(serialize()));
    S.clock.t = clock; S.time = time; S.W = live; G.W = live;
    const ok = e4 === null && [...counts.values()].every((n) => n === 1) && kept === holder.inv.items.length && said4.length === 1 && again === null;
    mended.push(ok ? `${label}: ${said4[0]}` : `${label}: ${e4 ?? again ?? said4.join(' | ')}`);
    if (!ok) mended.push('FAILED');
  }
  check('a save that repeats an item is read, this version\'s or an older one\'s, the copy given a number of its own, and its saves after read too', !mended.includes('FAILED'), mended.join('; '));
  console.error = quiet;
}
const game = S.W;

// ---------------------------------------------------------------- saves from somebody else
{
  const d = copy(midCarry);
  d.chars[0].name = 'Ash<img src=x onerror="alert(1)">';
  d.chars[1].title = '<b>the</b> Bold';
  d.factionName = '<script>steal()</script>Dustwalkers';
  d.log.push({ t: 0, text: 'A <i>note</i>', kind: 'info' });
  const c = cleanSave(JSON.parse(JSON.stringify(d).replace('"squads":[{', '"squads":[{"__proto__":{"serialize":1},')));
  check('a save from elsewhere loses its markup', c.chars[0].name === 'Ash' && c.chars[1].title === 'the Bold' && c.factionName === 'steal()Dustwalkers' && !JSON.stringify(c).match(/[<>]/), `${c.chars[0].name} / ${c.factionName}`);
  check('...and cannot slip anything into how its squads work', !Object.keys(c.squads[0]).includes('__proto__') && typeof reload(copy(c)).squads.get(c.squads[0].id)?.serialize === 'function');
  const lt = [stripTags('Ash <3'), stripTags('Bought 3 < 5 rations'), stripTags('<img src=x onerror=alert(1)//')];
  check('...but a "<" that opens nothing stays, and one that could open a tag goes', lt[0] === 'Ash <3' && lt[1] === 'Bought 3 < 5 rations' && !/<[a-z!/?]/i.test(lt[2]), lt.join(' | '));
  S.W = game; G.W = game;
  const plain = copy(midCarry);
  check('...and an ordinary save is untouched by the cleaning', diff(copy(midCarry), cleanSave(plain)).length === 0);
  const text = await exportText();
  const back = await importText(text);
  check('a save copied as text reads back whole: every thing in it, not told against the base', back.chars.length === S.W.chars.size && back.objs.length === S.W.objs.size && !back.base && back.v === SAVE_VERSION && damage(back) === '');
}

// ---------------------------------------------------------------- version 5: a save told against what the seed made
{
  S.W = game; G.W = game;
  const d = copy(serialize());
  const before = wholeOf(game);
  check('a save holds only what differs from what the seed made', !!d.base && d.objs.length < game.objs.size / 20 && Array.isArray(d.gone),
    `${d.objs.length} of ${game.objs.size} things written, ${d.gone.length} gone, ${d.towns.length} towns laid out otherwise`);
  let w = game;
  const said = warned(() => { w = reload(copy(d)); });
  const dd = differ(before, wholeOf(w));
  check('...and reads back as the same world, every thing and every field, the seed\'s things made again exactly', dd.length === 0 && said.length === 0, dd.slice(0, 3).join(', ') || said[0]);
  const d2 = differ(bare(d), bare(serialize()));
  check('...a save of it read back and written again is the same save', d2.length === 0, d2.slice(0, 3).join(', '));
  check('...and a world read back from it needs no mending', repairLinks(w) === 0);
  S.W = game; G.W = game;
}

// ---------------------------------------------------------------- things gone, changed and new in a town
{
  const cr = T.sites.find((s) => s.settlement === 'crossroad')!;
  const inTown = (k: string) => [...game.objs.values()].filter((o) => o.kind === k && o.site === cr.id);
  const holding = (o: WObj) => (o.inv?.items.length ?? 0) > 0 && !o.shop;
  const table = inTown('table')[0], stool = inTown('stool')[0], house = inTown('building')[1];
  const chest = [...game.objs.values()].find((o) => o.site === cr.id && holding(o)) ?? [...game.objs.values()].find(holding)!;
  const untouched = inTown('table')[1];
  // gone: a table broken up; changed: a chest emptied and filled again, a stool moved, a house with notes; new: a crate of your own
  game.removeObj(table);
  const took = chest.inv!.items.shift()!;
  chest.inv!.add('dustbread', 3);
  chest.locked = 0;
  stool.x += 0.5; stool.rot = 1.25;
  house.data.note = { by: 'you', at: [1, 2], none: null };
  house.data.inv = null; // (in a thing's data, "inv" is no inventory: written as it is, null and all)
  const [cx, cz] = nav.nearestOpen(cr.x + 30, cr.z + 30, 20)!;
  const crate = game.addObj({ id: 0, kind: 'storage', def: 'crate', x: cx, z: cz, y: T.heightAt(cx, cz), rot: 0, owner: 'player', site: cr.id, parent: 0, inv: new Grid(6, 6), data: { name: 'Mine' } });
  crate.inv!.add('iron_plates', 4);
  const d = copy(serialize());
  const written = new Set(d.objs.map((o: any) => o.id));
  check('a thing gone, changed or new in a town is in the save, and the one beside them left untouched is not',
    d.gone.includes(table.id) && [chest.id, stool.id, house.id, crate.id].every((id) => written.has(id)) && !written.has(untouched.id), `${d.objs.length} written, ${d.gone.length} gone`);
  const same = (a: WObj | undefined, b: WObj | undefined) => !!a && !!b && differ(copy(v4.objToJSON(a)), copy(v4.objToJSON(b))).length === 0;
  for (let round = 1; round <= 2; round++) {
    const w = reload(copy(serialize()));
    const o = (id: number) => w.objs.get(id);
    check(`...and read back${round > 1 ? ' again' : ''}: the table stays gone, the chest, the stool, the house and the crate as they were left`,
      !o(table.id) && same(o(chest.id), chest) && same(o(stool.id), stool) && same(o(house.id), house) && o(house.id)!.data.inv === null && same(o(crate.id), crate)
      && !o(chest.id)!.inv!.items.some((i) => i.uid === took.uid) && o(crate.id)!.inv!.items[0].uid === crate.inv!.items[0].uid && same(o(untouched.id), untouched));
  }
  S.W = game; G.W = game;
}

// ---------------------------------------------------------------- a shop's stock, and work taken on
{
  const cr = T.sites.find((s) => s.settlement === 'crossroad')!;
  if (!game.populated.has(cr.id)) populateTown(game, game.towns.get(cr.id)!);
  const shop = [...game.shops.values()].find((sh) => sh.site === cr.id && (game.objs.get(sh.id)?.inv?.items.length ?? 0) > 2)!;
  const counter = game.objs.get(shop.id)!;
  const sold = counter.inv!.items.pop()!; // (sold to you)
  shop.money += 123; shop.restockDay += 2;
  const lead = game.playerChars().find((c) => c.alive)!;
  game.money += 5000;
  let job: any, why = 'no deliveries posted';
  for (const c of T.sites.filter((s) => s.kind === 'town' && FACTION[s.faction!]?.lawful).flatMap((s) => openJobs(s)).filter((c) => c.kind === 'deliver')) {
    game.rel.set('player', c.issuer, 65);
    why = takeContract(c, lead);
    if (!why) { job = c; break; }
  }
  const work0 = copy(contractsState());
  const parcel = work0.active.find((c: any) => c.id === job?.id)?.e?.uid;
  const w = reload(copy(serialize()));
  const sh2 = w.shops.get(shop.id), counter2 = w.objs.get(shop.id);
  check('a shop\'s stock and purse are read back as they were',
    !!sh2 && !!counter2 && differ(copy(shop), copy(sh2)).length === 0 && differ(copy(counter.inv!.serialize()), copy(counter2.inv!.serialize())).length === 0 && !counter2.inv!.items.some((i) => i.uid === sold.uid),
    `${shop.kind}, ${counter.inv!.items.length} lots`);
  const work1 = copy(contractsState()); // (S.W is the world read back)
  check('...and so is work taken on: the job, and the parcel it gave you to carry', !!job && parcel !== undefined && differ(work0, work1).length === 0 && !!findItem(parcel), why || `${job.kind} to ${job.to ?? '?'}`);
  S.W = game; G.W = game;
}

// ---------------------------------------------------------------- every way a thing or a person can change
{
  // in a world of its own (what is done to it here is no way to treat a world one plays on)
  const fw = reload(copy(serialize()));
  const fz = new RNG(17);
  const ODD = [0, -0, 1, 2.5, -7, NaN, Infinity, -Infinity, 1e21, '', 'a', '0', 'null', true, false, null, undefined, [], [null], [undefined], [1, [2, 3]], {}, { a: undefined }, { a: 1 }, { inv: null }, { inv: 0 }, () => 1, { b: [{ c: -0 }] }];
  const odd = () => { const v = ODD[fz.int(0, ODD.length - 1)]; return v && typeof v === 'object' ? copy(v) ?? v : v; };
  const all = [...fw.objs.values()];
  const picked = new Set<WObj>();
  /** n changes of every kind, each to a thing from among those given */
  function changeThings(from: WObj[], n: number) {
    for (let i = 0; i < n; i++) {
      const o: any = from[fz.int(0, from.length - 1)];
      picked.add(o);
      const r = fz.next();
      const keys = Object.keys(o).filter((k) => !['id', 'x', 'z', 'kind', 'view', 'inv'].includes(k));
      if (r < 0.25) o[fz.pick(keys)] = odd();
      else if (r < 0.35) delete o[fz.pick(keys)];
      else if (r < 0.45) o['extra' + fz.int(0, 3)] = odd();
      else if (r < 0.7 && o.data && typeof o.data === 'object') {
        const dk = Object.keys(o.data);
        const q = fz.next();
        if (q < 0.4 && dk.length) o.data[fz.pick(dk)] = odd();
        else if (q < 0.6 && dk.length) delete o.data[fz.pick(dk)];
        else if (q < 0.8) o.data['inv'] = fz.chance(0.5) ? null : odd();
        else o.data['n' + fz.int(0, 3)] = { deep: [odd(), { x: odd() }] };
      } else if (o.inv?.items.length) {
        const it: any = fz.pick(o.inv.items);
        const q = fz.next();
        if (q < 0.3) it.n += 1;
        else if (q < 0.45) it.q = fz.int(0, 6);
        else if (q < 0.6) it.stolen = 'reavers';
        else if (q < 0.7) it.cond = odd();
        else if (q < 0.8) o.inv.items.splice(o.inv.items.indexOf(it), 1);
        else { const g = new Grid(3, 3); g.add('dustbread', 2); it.inv = g; }
      } else if (o.inv) o.inv.add('dustbread', fz.int(1, 4));
      else o.open = fz.chance(0.5);
    }
  }
  /** Where fw's things, saved and read back, differ from what they are. */
  function thingsWrong(d: any): string[] {
    const w = reload(copy(d));
    S.W = fw; G.W = fw;
    const wrong: string[] = [];
    for (const o of fw.objs.values()) {
      const b = w.objs.get(o.id);
      const dd = b ? differ(copy(v4.objToJSON(o)), copy(v4.objToJSON(b))) : ['missing'];
      if (dd.length) wrong.push(`${o.kind} ${o.id}: ${dd[0]}`);
    }
    for (const id of w.objs.keys()) if (!fw.objs.has(id)) wrong.push(`${id} came back from nowhere`);
    return wrong;
  }
  changeThings(all, 400);
  // changes JSON cannot see: a field set to nothing, a function, minus nought for nought; none of them is written
  const invisible = all.find((x) => !picked.has(x) && x.kind === 'wall' && x.rot === 0) ?? null;
  if (invisible) Object.assign(invisible as any, { zzz: undefined, fn: () => 1, rot: -0 });
  const d = copy(serialize());
  const wrong = thingsWrong(d);
  check('a thing changed in any way at all is read back exactly as it was left (400 changes of every kind)', wrong.length === 0, wrong.slice(0, 3).join('; ') || `${d.objs.length} things written`);
  check('...and a change no save can see (nothing, a function, minus nought) writes nothing', !!invisible && !d.objs.some((o: any) => o.id === invisible!.id));
  // the same things changed again, each now kept as last written and read back between frames, as in play
  await keepWarm(fw);
  changeThings([...picked], 300);
  const d2 = copy(serialize());
  const wrong2 = thingsWrong(d2);
  check('...and changed again where each is kept as last written, read back exactly as left again (300 more)', wrong2.length === 0, wrong2.slice(0, 3).join('; ') || `${d2.objs.length} things written`);
  // people: kept between saves, so each change must be seen
  await keepWarm(fw);
  const people = [...fw.chars.values()];
  const anyObj = all.find((o) => fw.objs.has(o.id))!.id;
  const CHANGES: ((c: Char) => void)[] = [
    (c) => { c.title = 'the Changed'; }, (c) => { c.look.scars = (c.look.scars + 1) % 4; }, (c) => { c.look = { ...c.look, hair: 123 }; },
    (c) => { c.body.hp[2] -= 3; }, (c) => { c.body.bleed[1] = 0.5; }, (c) => { c.body.treated[0] = 0.75; }, (c) => { c.body.lost |= 1 << 6; c.body.hp[6] = 0; },
    (c) => { c.body.blood -= 7; }, (c) => { c.body.koT = 3; }, (c) => { c.sk[3] += 0.25; }, (c) => { c.inv.add('dustbread', 1); },
    (c) => { if (c.inv.items[0]) c.inv.items[0].n += 1; else c.inv.add('bandages', 2); }, (c) => { c.eq.head = null; }, (c) => { if (c.eq.weapon) c.eq.weapon.q = 5; else c.money += 1; },
    (c) => { c.stats.kills += 1; }, (c) => { c.bounty.reavers = 50; }, (c) => { c.jobs = [{ k: 'guard', obj: anyObj, label: 'Watch' }]; },
    (c) => { c.order = { k: 'move', x: 1, z: 2 }; }, (c) => { c.brain.post = anyObj; }, (c) => { c.money += 7; }, (c) => { c.mood = 3; },
    (c) => { c.shop = 'general'; }, (c) => { c.dialogue = 'smith'; }, (c) => { c.recruitable = true; c.price = 99; }, (c) => { c.rank = 2; c.role = 'guard'; },
    (c) => { c.homeX += 1; c.homeDir = 0.5; }, (c) => { c.combatMode = 'passive'; c.move = 'walk'; }, (c) => { c.sleeping = true; }, (c) => { c.mem.note = { at: 3 }; },
    (c) => { c.x += 3; c.hunger -= 10; }, (c) => { c.name = 'Renamed'; }, (c) => { c.unique = 'one'; }, (c) => { c.faction = 'reavers'; },
  ];
  for (const c of people) if (fz.chance(0.5)) fz.pick(CHANGES)(c);
  const dp = copy(serialize());
  const wp = reload(copy(dp));
  const wrongP: string[] = [];
  for (const c of people) {
    const b = wp.chars.get(c.id);
    const dd = b ? differ(copy(v4.charToJSON(c)), copy(v4.charToJSON(b))) : ['missing'];
    if (dd.length) wrongP.push(`${c.id}: ${dd[0]}`);
  }
  check('a person changed in any way is read back exactly as they were left, kept between saves or not', wrongP.length === 0, wrongP.slice(0, 3).join('; ') || `${people.length} people, about half changed`);
  S.W = game; G.W = game;
}
{
  // each field in turn. A person kept since the last save is told unchanged field by field, by a list written out
  // by hand (sameChar, in sim/save.ts), and a change it missed would be lost without a word: so every field a save
  // writes of a person is changed here in turn, as is every part of a body, every slot of gear and everything a
  // mind keeps, each on someone kept warm, and the next save must have it (in a world of its own again)
  const fw = reload(copy(serialize()));
  const people = [...fw.chars.values()], all = [...fw.objs.values()];
  const anyObj = all[0].id;
  const free = () => people.filter((p) => fw.chars.get(p.id) === p && p.status === 'up' && !p.carrying && !p.carriedBy && !p.bed && !p.cage && !p.mem.using && !p.animal);
  const freeObj = (kind: string) => [...fw.objs.values()].find((o) => o.kind === kind && !o.occupant && !o.user && !o.data?.upper);
  const forSlot = (slot: string) => Object.keys(ITEM).find((k) => slotFor(ITEM[k]) === slot) ?? 'bandages';
  const packId = Object.keys(ITEM).find((k) => ITEM[k].pack)!;
  const thingNot = (was: unknown) => all.find((o) => fw.objs.has(o.id) && o.id !== was)!.id;
  const personNot = (c: Char, was: unknown) => people.find((p) => p !== c && p.id !== was && fw.chars.get(p.id) === p)!.id;
  /** Something else for a mind to keep under k. */
  const mindValue = (k: string, c: Char): unknown => {
    const was = c.brain[k];
    switch (k) {
      case 'bed': case 'post': case 'tending': return thingNot(was);
      case 'task': return { k: 'loot', id: personNot(c, was?.id), w: 1.5 };
      case 'haul': return { to: thingNot(was?.to), id: was?.id === 'iron_plates' ? 'dustbread' : 'iron_plates' };
      case 'salvId': case 'hackId': case 'finish': case 'talkTo': return personNot(c, was);
      case 'hauling': case 'inspect': return !was;
      case 'alarm': return was === 'band 7' ? 'band 8' : 'band 7';
      default: return (typeof was === 'number' ? was : 0) + 1.5; // (counts and timers)
    }
  };
  const anItem = (c: Char) => { if (!c.inv.items.length) c.inv.add('bandages', 2); };
  const STAT_KEYS = Object.keys(new Char(people[0].look).stats);
  type Change = [label: string, change: (c: Char, partner: () => Char) => void, prep?: (c: Char) => void];
  const FIELDS: Change[] = [
    ['id', (c) => { fw.chars.delete(c.id); c.id = fw.nextId++; fw.chars.set(c.id, c); }],
    ['name', (c) => { c.name += ' the Second'; }],
    ['title', (c) => { c.title = c.title === 'the Changed' ? '' : 'the Changed'; }],
    ['animal', (c) => { c.animal = Object.keys(ANIMAL)[0]; }],
    ['look', (c) => { c.look.scars = (c.look.scars + 1) % 4; }],
    ['look', (c) => { c.look = { ...c.look, hair: c.look.hair + 1 }; }],
    ['look', (c) => { c.look.race = Object.keys(RACE).find((r) => r !== c.look.race)!; }],
    ['faction', (c) => { c.faction = Object.keys(FACTION).find((f) => f !== c.faction && f !== 'player')!; }],
    ['squad', (c) => { fw.moveToSquad(c, [...fw.squads.values()].find((s) => s.id !== c.squad)!); }],
    ['role', (c) => { c.role = c.role === 'guard' ? 'resident' : 'guard'; }],
    ['rank', (c) => { c.rank += 1; }],
    ['unique', (c) => { c.unique = c.unique ? '' : 'one of a kind'; }],
    ['site', (c) => { c.site = S.T.sites.find((s) => s.id !== c.site)!.id; }],
    ['homeX', (c) => { c.homeX += 1.5; }], ['homeZ', (c) => { c.homeZ -= 0.25; }], ['homeDir', (c) => { c.homeDir += 0.5; }],
    ['body.hp', (c) => { c.body.hp[2] -= 3; }], ['body.max', (c) => { c.body.max[1] += 5; }],
    ['body.bleed', (c) => { c.body.bleed[1] += 0.5; }], ['body.treated', (c) => { c.body.treated[0] += 0.75; }],
    ['body.lost', (c) => { c.body.lost ^= 1 << 6; }], ['body.splint', (c) => { c.body.splint ^= 1 << 5; }],
    ['body.prost', (c) => { c.body.prost[4] = c.body.prost[4] ? null : 'scrap_arm'; }],
    ['body.blood', (c) => { c.body.blood -= 7; }], ['body.bloodMax', (c) => { c.body.bloodMax += 10; }],
    ['body.koT', (c) => { c.body.koT += 3; }], ['body.robotic', (c) => { c.body.robotic = !c.body.robotic; }],
    ['mood', (c) => { c.mood += 3; }],
    ['sk', (c) => { c.sk[3] += 0.25; }],
    // the pack: an item added, taken out, or changed where it lies; a pack within it; and a pack of another size
    ['inv', (c) => { c.inv.add('dustbread', 1); }],
    ['inv', (c) => { c.inv.items.pop(); }, anItem],
    ['inv', (c) => { c.inv.items[0].n += 1; }, anItem],
    ['inv', (c) => { c.inv.items[0].q = (c.inv.items[0].q + 1) % 7; }, anItem],
    ['inv', (c) => { c.inv.items[0].x += 1; }, anItem],
    ['inv', (c) => { c.inv.items[0].stolen = 'reavers'; }, anItem],
    ['inv', (c) => { c.inv.items[0].cond = 0.5; }, anItem],
    ['inv', (c) => { c.inv.items[0].inv!.add('dustbread', 2); }, (c) => { c.inv.items.unshift(makeItem(packId)); }],
    ['inv', (c) => { const g = new Grid(c.inv.w + 1, c.inv.h); g.items = c.inv.items; c.inv = g; }],
    // gear: each slot filled or emptied, and what is worn changed where it is
    ...EQUIP_SLOTS.map((slot): Change => [`eq.${slot}`, (c) => { const eq = c.eq as any; eq[slot] = eq[slot] ? null : makeItem(forSlot(slot)); }]),
    ['eq.weapon', (c) => { c.eq.weapon!.q = (c.eq.weapon!.q + 1) % 7; }, (c) => { c.eq.weapon ??= makeItem(forSlot('weapon')); }],
    ['eq.weapon', (c) => { c.eq.weapon!.n += 1; }, (c) => { c.eq.weapon ??= makeItem(forSlot('weapon')); }],
    ['eq.head', (c) => { c.eq.head!.stolen = 'reavers'; }, (c) => { c.eq.head ??= makeItem(forSlot('head')); }],
    ['eq.back', (c) => { c.eq.back!.inv!.add('dustbread', 1); }, (c) => { c.eq.back = makeItem(packId); }],
    ['money', (c) => { c.money += 7; }],
    ['status', (c) => { c.status = 'ko'; }], ['status', (c) => { c.status = 'dead'; }],
    ['playDead', (c) => { c.playDead = !c.playDead; }],
    ['carrying', (c, partner) => { const t = partner(); c.carrying = t.id; t.carriedBy = c.id; c.brain.task = { k: 'capture', id: t.id }; }],
    ['carriedBy', (c, partner) => { const t = partner(); t.carrying = c.id; c.carriedBy = t.id; t.brain.task = { k: 'capture', id: c.id }; }],
    ['bed', (c) => { const b = freeObj('bed')!; b.occupant = c.id; c.bed = b.id; }],
    ['cage', (c) => {
      const k = freeObj('cage') ?? fw.addObj({ id: 0, kind: 'cage', def: 'cage', x: c.x, z: c.z, y: 0, rot: 0, owner: '', site: 0, parent: 0, data: {} } as WObj);
      k.occupant = c.id; c.cage = k.id;
    }],
    ['shackled', (c) => { c.shackled = !c.shackled; }],
    ['sleeping', (c) => { c.sleeping = !c.sleeping; }],
    ['combatMode', (c) => { c.combatMode = c.combatMode === 'passive' ? 'aggressive' : 'passive'; }],
    ['move', (c) => { c.move = c.move === 'walk' ? 'run' : 'walk'; }],
    ['order', (c) => { c.order = { k: 'move', x: c.x + 1, z: 2 } as any; }],
    ['order', (c) => { (c.order as any).x += 1; }, (c) => { c.order = { k: 'move', x: 1, z: 2 } as any; }],
    ['jobs', (c) => { c.jobs = [{ k: 'guard', obj: anyObj, label: `Watch ${c.id}` }]; }],
    ['jobs', (c) => { c.jobs[0].label += ' at night'; }, (c) => { c.jobs = [{ k: 'guard', obj: anyObj, label: 'Watch' }]; }],
    ['bounty', (c) => { c.bounty.reavers = (c.bounty.reavers ?? 0) + 50; }],
    ['recruitable', (c) => { c.recruitable = !c.recruitable; }],
    ['price', (c) => { c.price += 99; }],
    ['shop', (c) => { c.shop = c.shop === 'general' ? 'smith' : 'general'; }],
    ['dialogue', (c) => { c.dialogue = c.dialogue === 'smith' ? '' : 'smith'; }],
    ...STAT_KEYS.map((k): Change => [`stats.${k}`, (c) => { (c.stats as any)[k] += 1; }]),
    ['stats', (c) => { (c.stats as any).extra = 1; }],
    // what moves, written afresh by every save rather than kept: changed all the same
    ['x', (c) => { c.x += 3; }], ['z', (c) => { c.z -= 3; }], ['dir', (c) => { c.dir += 0.5; }], ['hunger', (c) => { c.hunger -= 10; }],
    ['mem', (c) => { c.mem.note = { at: 3 }; }],
    ['mem', (c) => { c.mem.note.at += 1; }, (c) => { c.mem.note = { at: 3 }; }],
    // everything a mind keeps, each in turn; and a task and a haul changed where they are
    ...v4.BRAIN_KEEP.map((k): Change => [`brain.${k}`, (c) => { c.brain[k] = mindValue(k, c); }]),
    ['brain.task', (c) => { c.brain.task.w += 1; }, (c) => { c.brain.task = { k: 'loot', id: personNot(c, 0), w: 1.5 }; }],
    ['brain.haul', (c) => { c.brain.haul.id = 'dustbread'; }, (c) => { c.brain.haul = { to: anyObj, id: 'iron_plates' }; }],
  ];
  const missed: string[] = [], vain: string[] = [], changed: Char[] = [];
  let rounds = 0, first: any = null;
  for (let at = 0; at < FIELDS.length; rounds++) {
    const pool = free();
    const batch: [Change, Char][] = [];
    while (at < FIELDS.length && pool.length > 4) batch.push([FIELDS[at++], pool.pop()!]);
    if (!batch.length) { missed.push('nobody left to change'); break; }
    for (const [[, , prep], c] of batch) prep?.(c);
    serialize(); // (each kept as they are now)
    await keepWarm(fw); // (and what was kept read back between frames, as in play)
    const before = batch.map(([, c]) => copy(v4.charToJSON(c)));
    for (const [[, change], c] of batch) { change(c, () => pool.pop()!); changed.push(c); }
    const d = copy(serialize());
    const why = damage(d); // (and what a save leaves out put back)
    first ??= d;
    const recs = new Map<number, any>(d.chars.map((r: any) => [r.id, r]));
    batch.forEach(([[label], c], i) => {
      const now = copy(v4.charToJSON(c));
      if (!differ(before[i], now).length) vain.push(label);
      const dd = why ? [why] : differ(recs.get(c.id) ?? null, now);
      if (dd.length) missed.push(`${label}: ${dd[0]}`);
    });
  }
  // every field a save writes (as read back, so that one added later is caught here), every part of a body, slot of gear, stat and thing a mind keeps
  const due = new Set<string>(['brain']);
  for (const r of first.chars) for (const k of Object.keys(r)) due.add(k);
  for (const k of Object.keys(people[0].body.serialize())) if (k !== 'pv') due.add(`body.${k}`); // (pv: how the body is written, always the same)
  for (const slot of EQUIP_SLOTS) due.add(`eq.${slot}`);
  for (const k of STAT_KEYS) due.add(`stats.${k}`);
  for (const k of v4.BRAIN_KEEP) due.add(`brain.${k}`);
  const tried = new Set(FIELDS.flatMap(([l]) => [l, l.split('.')[0]]));
  const untried = [...due].filter((k) => !tried.has(k));
  check(`every field a save writes of a person, changed in turn on someone kept since the last save, is in the next save (${FIELDS.length} changes)`,
    missed.length === 0 && vain.length === 0 && untried.length === 0,
    [...missed.slice(0, 3), ...vain.slice(0, 3).map((l) => `${l}: the change shows nowhere`), ...untried.map((k) => `nothing changes ${k}`)].join('; ') || `${rounds} round${rounds > 1 ? 's' : ''}; every part of a body, slot of gear, stat and thing a mind keeps`);
  const back = reload(copy(serialize()));
  const lostP: string[] = [];
  for (const c of changed) {
    const b = back.chars.get(c.id);
    const dd = b ? differ(copy(v4.charToJSON(c)), copy(v4.charToJSON(b))) : ['missing'];
    if (dd.length) lostP.push(`${c.id}: ${dd[0]}`);
  }
  check('...and read back so', lostP.length === 0, lostP.slice(0, 3).join('; ') || `${changed.length} people`);
  check('...and sim/save.ts checks every field a save writes before taking anyone as unchanged (else nobody is kept, and saves are slow)', COVERED);
  S.W = game; G.W = game;
}

// ---------------------------------------------------------------- a save from version 4, and saves told against another base
{
  const quiet = console.error;
  const delta0 = copy(serialize());
  const old = copy(v4.serialize());
  const live = wholeOf(game);
  const err = loadData(copy(old));
  const w = S.W;
  const dd = differ(live, wholeOf(w));
  check('a save from version 4 loads, and is the same world', err === null && w !== game && dd.length === 0, err ?? dd.slice(0, 3).join(', '));
  const next = copy(serialize());
  check('...and the saves after it are told against a base found for it: as small as any', !!next.base && next.objs.length === delta0.objs.length && next.gone.length === delta0.gone.length,
    `${next.objs.length} things written (${delta0.objs.length} from the game itself), ${next.gone.length} gone`);
  check('...and read back the same', differ(live, wholeOf(reload(copy(next)))).length === 0);
  // told against another base (another version laid the towns out otherwise): refused, the game left as it was
  S.W = game; G.W = game;
  const mis = copy(delta0); mis.base.shape = 'x.y';
  console.error = () => {};
  const e1 = loadData(mis);
  console.error = quiet;
  check('a save told against another version\'s towns is refused, and the game left as it was', !!e1 && /another version/.test(e1) && S.W === game, e1 ?? 'loaded');
  // told against the same things made otherwise (another sum: another version's layout or loot): refused just the same, as
  // what it left out is not what this version builds (a whole save is the way back: see "a change in what the seed builds")
  const other = copy(delta0); other.base.sum = 'x.y';
  console.error = () => {};
  const e2 = loadData(other);
  console.error = quiet;
  check('...and so is one told against the same things made otherwise, and the game left as it was', !!e2 && /another version/.test(e2) && S.W === game, e2 ?? 'loaded');
  S.W = game; G.W = game;
  // a tripwire: what the seed makes, its shape (by kind and order) and its sum (everything about them, to the thousandth).
  // When it changes on purpose (what is built in the towns and places, or where), set BASE to the new name, and leave
  // WORLD_SHAPE, which is for the land alone: saves told against the old base are then known for what they are, greyed out
  // and refused, while the whole saves still load (see "a change in what the seed builds")
  const BASE = '1k7mvpu.1y3iri1 17hahdd.z1ie4t';
  const name0 = `${delta0.base.shape} ${delta0.base.sum}`;
  check(`the seed's things are what they were (if this changes on purpose, set BASE here to ${name0})`, name0 === BASE);
  // ...and another land's, whose towns are other kinds and other plans
  const T2 = await generateWorld(4242, () => {});
  const W2 = new World(), id2 = W2.nextId, uid2 = peekUid();
  buildSeedWorld(W2, T2);
  const BASE2 = '1ovq9qo.6xlrcp 1mo8vtg.8xblcw';
  const name2 = seedName(W2, id2, uid2);
  check(`...and another seed's too (if this changes on purpose, set BASE2 here to ${name2})`, name2 === BASE2, `${W2.objs.size} things, ${W2.towns.size} towns`);
}

// ---------------------------------------------------------------- a change in what the seed builds
{
  // a later version builds the seed's world otherwise: saves told against the old base cannot say what they changed, and are
  // greyed out and refused; whole saves (the menu's, one autosave, an export) still load
  S.W = game; G.W = game;
  const quiet = console.error;
  await saveGame('quick'); // (told against the base)
  await saveGame('2'); // (whole)
  const copied = await exportText(sessionExtra());
  const before = wholeOf(game);
  const listed0 = await listSaves();
  const q0 = listed0.find((m) => m.slot === 'quick')!, w0 = listed0.find((m) => m.slot === '2')!;
  check('a quick save is told against the base and names it; a save in a slot of the menu\'s is whole', q0.base === seedBase() && !!q0.base && !w0.base && fitsWorld(q0) && fitsWorld(w0), `${q0.base} / ${w0.base ?? 'whole'}`);
  const made = () => { const w = new World(), id0 = w.nextId, uid0 = peekUid(); buildSeedWorld(w, T); noteSeed(w, id0, uid0); };
  const nameOf = (b: any) => (b ? `${b.shape} ${b.sum}` : undefined);
  const shape0 = q0.base!.split(' ')[0];
  const cr = T.sites.find((s) => s.settlement === 'crossroad')!;
  // two kinds of change: another shape (an ore more), and the same shape made otherwise (Crossroad, where things were
  // changed above, laid out anew: the same things in the same order, each somewhere else, so only the sum tells)
  const CHANGES: [string, () => () => void][] = [
    ['an ore more', () => { T.ores.push({ ...T.ores[0], x: T.ores[0].x + 9, z: T.ores[0].z + 4 }); return () => { T.ores.pop(); }; }],
    ['Crossroad laid out otherwise', () => { const was = cr.seed; cr.seed = (cr.seed + 1) >>> 0; return () => { cr.seed = was; }; }],
  ];
  for (const [label, change] of CHANGES) {
    const undo = change();
    made(); // (as the title's world, built when the game starts, notes what this version makes)
    const sameShape = seedBase()!.split(' ')[0] === shape0;
    const listed = await listSaves();
    const q = listed.find((m) => m.slot === 'quick')!, w = listed.find((m) => m.slot === '2')!;
    const cont = listed.find(safeToResume) ?? listed.find(fitsWorld);
    console.error = () => {};
    const eq = loadData(await readSave('quick'));
    console.error = quiet;
    const stillGame = S.W === game;
    const ew = loadData(await readSave('2'));
    const fromWhole = differ(before, wholeOf(S.W));
    const ec = loadData(await importText(copied));
    const fromCopy = differ(before, wholeOf(S.W));
    // and the saves of a world read from a whole save are told against the base this version makes
    const after = copy(serialize());
    const fromAfter = differ(before, wholeOf(reload(copy(after))));
    check(`${label}${label.startsWith('Crossroad') ? ` (the same shape: ${sameShape})` : ''}: the save told against the old base is greyed out, saying why, and the whole one is not`,
      !fitsWorld(q) && /another version/.test(misfit(q)) && fitsWorld(w) && misfit(w) === '' && sameShape === label.startsWith('Crossroad'), `${misfit(q) || 'fits'} / ${misfit(w) || 'fits'}`);
    check('...Continue offers the newest save that still fits: the whole one', cont?.slot === '2', cont?.slot ?? 'none');
    check('...the one told against the old base is refused, the game left as it was; the whole one loads, the same world', !!eq && /another version/.test(eq) && stillGame && ew === null && fromWhole.length === 0, eq ?? fromWhole[0]);
    check('...and so does a save copied out as text, which is whole', ec === null && fromCopy.length === 0, ec ?? fromCopy[0]);
    check('...whose saves after are told against the base this version makes, and read back the same', nameOf(after.base) === seedBase() && nameOf(after.base) !== q.base && fromAfter.length === 0, fromAfter[0]);
    undo();
    made();
    S.W = game; G.W = game;
  }
  check('...and once the seed builds as before, the saves told against its base fit again', fitsWorld((await listSaves()).find((m) => m.slot === 'quick')!) && seedBase() === q0.base);
  // what another browser's arithmetic leaves in the last digits of where things stand (a hair, as the same land built by
  // another engine shows) does not count; a centimetre does
  const nudged = (metres: number) => {
    const w = new World(), id0 = w.nextId, uid0 = peekUid();
    buildSeedWorld(w, T);
    let i = 0;
    for (const o of w.objs.values()) if (o.kind === 'wall' && i++ < 20) { o.x += metres; o.rot += metres / 10; }
    noteSeed(w, id0, uid0);
    return seedBase();
  };
  const hair = nudged(1e-9), cm = nudged(0.01);
  made();
  check('...a hair\'s difference in where things stand names the same base; a centimetre names another', hair === q0.base && cm !== q0.base && seedBase() === q0.base);
}

// ---------------------------------------------------------------- an autosave taken a slice at a time
{
  S.W = game; G.W = game;
  const meta = { name: 'x', day: 1, chars: 1, money: 0, place: '', seed: 1337 };
  const ms0 = slicing.ms;
  // nothing moves meanwhile: the same as a save taken in one step, in slices of any size
  const one = bare(serialize());
  const saving = writeSave('quick', meta, {}, true);
  const held = holding();
  await saving;
  const n1 = lastHold.length;
  const dd = differ(one, bare(await readSave('quick')));
  slicing.ms = 0; // (a few people or a few dozen things a slice)
  await writeSave('quick', meta, {}, true);
  const n2 = lastHold.length;
  const d2 = differ(one, bare(await readSave('quick')));
  slicing.ms = ms0;
  // ...and whole, as one of the autosaves is
  await writeSave('5', meta, {}, true);
  const n3 = lastHold.length;
  const d3 = differ(bare(serialize({}, true)), bare(await readSave('5')));
  check('an autosave taken a slice at a time is the game at one moment, the same as one taken in a single step, told against the base or whole',
    held && !holding() && dd.length === 0 && d2.length === 0 && d3.length === 0 && n2 > 20,
    [...dd, ...d2, ...d3].slice(0, 3).join(', ') || `${n1} slices, ${n2} small ones, and ${n3} whole`);
  // something moves meanwhile anyway (not by the game's loop, which is held, nor by input, which finishes the save first):
  // whoever and whatever it moved from and to is taken again, whether taken already (all of it in the first slice) or not yet
  const owner = game.playerChars().find((c) => c.alive && c.inv.items.length)!;
  const box = [...game.objs.values()].find((o) => o.inv && o.site && !o.shop && o.inv.findSpot(ITEM[owner.inv.items[0].id]))!;
  const where = (d: any, uid: number) => [...d.chars.flatMap((c: any) => (c.inv?.items ?? []).filter((i: any) => i.uid === uid).map(() => `char ${c.id}`)), ...d.objs.flatMap((o: any) => (o.inv?.items ?? []).filter((i: any) => i.uid === uid).map(() => `thing ${o.id}`))];
  const moves: string[] = [];
  for (const ms of [Infinity, 0]) {
    slicing.ms = ms;
    const moved = owner.inv.items[0];
    let late = writeSave('quick', meta, {}, true);
    owner.inv.remove(moved);
    box.inv!.put(moved);
    await late;
    moves.push(where(await readSave('quick'), moved.uid).join(' and ') || 'nowhere');
    late = writeSave('quick', meta, {}, true);
    box.inv!.remove(moved);
    owner.inv.put(moved);
    await late;
    moves.push(where(await readSave('quick'), moved.uid).join(' and ') || 'nowhere');
  }
  slicing.ms = ms0;
  check('...an item moved meanwhile, to a thing or back, is saved once, where it went (whoever and whatever held it is taken again)',
    moves.join() === [`thing ${box.id}`, `char ${owner.id}`, `thing ${box.id}`, `char ${owner.id}`].join(), moves.join('; '));
  // someone gone and someone come meanwhile, a thing made and one of the seed's gone: everyone and everything taken again
  const lead = game.playerChars().find((c) => c.alive)!;
  const ore = [...game.objs.values()].find((o) => o.kind === 'ore' && Math.hypot(o.x - lead.x, o.z - lead.z) > 1500)!;
  const passer = () => { const c = makePerson(game, { faction: 'drifters', role: 'wanderer', level: 3 } as any, rng); c.x = box.x + 2; c.z = box.z + 2; c.y = T.heightAt(c.x, c.z); return c; };
  const comings: string[] = [];
  for (const ms of [Infinity, 0]) {
    slicing.ms = ms;
    const leaver = passer(); // (tied to nobody: nothing points at them once they are gone)
    const late = writeSave('quick', meta, {}, true);
    game.removeChar(leaver);
    const comer = passer();
    const crate = game.addObj({ id: 0, kind: 'storage', def: 'crate', x: box.x + 3, z: box.z, y: box.y, rot: 0, owner: 'player', site: box.site, parent: 0, inv: new Grid(4, 4), data: { name: 'Late' } });
    crate.inv!.add('dustbread', 2);
    game.removeObj(ore);
    await late;
    const d = await readSave('quick');
    const dc = differ(bare(serialize()), bare(d));
    const ok = dc.length === 0 && d.chars.some((c: any) => c.id === comer.id) && !d.chars.some((c: any) => c.id === leaver.id)
      && d.objs.some((o: any) => o.id === crate.id) && d.gone.includes(ore.id);
    comings.push(ok ? 'ok' : dc[0] ?? 'missing');
    game.removeChar(comer); game.removeObj(crate); game.addObj(ore);
  }
  slicing.ms = ms0;
  check('...and someone gone or come meanwhile, a thing made or gone: the save is the game as it was when it ended', comings.every((x) => x === 'ok'), comings.join('; '));
  // a game loaded meanwhile (not by input, which finishes the save first; by the game itself, say): the save of the old one is
  // let go, and the game now in play is saved instead, with no word of storage failing
  const other = reload(copy(serialize()));
  other.money = game.money + 4321;
  S.W = game; G.W = game;
  slicing.ms = 0;
  notices.length = 0;
  const swapping = saveGame('3', true);
  S.W = other; G.W = other;
  const swapped = await swapping;
  slicing.ms = ms0;
  const sw = await readSave('3');
  S.W = game; G.W = game;
  check('...and when another game is loaded meanwhile, the one now in play is saved instead, with no word of storage failing',
    swapped && sw?.money === game.money + 4321 && !notices.some((n) => /Could not save/.test(n)), `${sw?.money} saved; ${notices.join(' | ')}`);
  // input comes meanwhile: the save is finished first, then the input is heard
  const early = writeSave('quick', meta, {}, true);
  finishSave(); // (as the guard does on any input)
  const wasHeld = holding();
  game.money += 777; // (what that input did)
  await early;
  const e = await readSave('quick');
  check('...and input meanwhile finishes the save before it is heard (what it does is not in the save)', !wasHeld && e.money === game.money - 777, `${e.money} saved, ${game.money} now`);
  game.money -= 777;
  // a save in one step meanwhile (a quick save, say) finishes it first too
  const under = writeSave('quick', meta, {}, true);
  serialize();
  const stillHeld = holding();
  await under;
  check('...as does a save taken in one step meanwhile', !stillHeld && !holding());
}

// ---------------------------------------------------------------- autosaves: three slots, taken in quiet moments
{
  check('autosaves fill the empty slots first, then replace the oldest', nextAutoSlot([]) === 'auto'
    && nextAutoSlot([{ slot: 'auto', savedAt: 5 } as SaveMeta]) === 'auto2'
    && nextAutoSlot(AUTO_SLOTS.map((slot, i) => ({ slot, savedAt: [30, 10, 20][i] }) as SaveMeta)) === 'auto2');
    const written: string[] = [];
  for (let i = 0; i < 4; i++) {
    await autosave();
    const saves = await listSaves();
    written.push(saves.filter((m) => AUTO_SLOTS.includes(m.slot)).sort((a, b) => b.savedAt - a.savedAt)[0].slot);
    await wait(5);
  }
  check('four autosaves go round the three slots', written.join(',') === 'auto,auto2,auto3,auto', written.join(','));
  const data = await readSave('auto');
  check('...and each holds a whole game', data?.chars?.length === S.W.chars.size);

  const p = S.W.playerChars().find((c) => c.alive)!;
  const others = S.W.playerChars().filter((c) => c !== p);
  for (const o of others) { o.status = 'dead'; }
  const reasons: string[] = [];
  p.status = 'up'; p.carriedBy = 0; p.target = 0; p.brain.enemy = 0; p.lastHitT = -999;
  reasons.push(danger(S.W) || 'quiet');
  p.lastHitT = S.time; reasons.push(danger(S.W) || 'quiet');
  p.lastHitT = -999; p.status = 'ko'; reasons.push(danger(S.W) || 'quiet');
  p.carriedBy = slaver.id; reasons.push(danger(S.W) || 'quiet');
  check('fighting, down and carried off are bad moments to save', reasons.join(',') === 'quiet,fighting,down,carried', reasons.join(','));
  p.carriedBy = 0; p.status = 'ko';
  G.autosaveT = 60;
  const t0 = Math.max(...(await listSaves()).map((m) => m.savedAt));
  const n0 = (await listSaves()).length;
  for (let i = 0; i < 50; i++) tickAutosave(0.1);
  const held = G.autosaveT >= 60; // (it starts again from 0 once an autosave is under way)
  p.status = 'up';
  for (let i = 0; i < 30 && G.autosaveT >= 60; i++) tickAutosave(0.1);
  const began = G.autosaveT < 60;
  let saves = await listSaves();
  for (let i = 0; i < 300 && !(saves[0].savedAt > t0); i++) { await wait(50); saves = await listSaves(); }
  const newest = saves[0];
  check('the autosave waits while someone is down, and saves once all is quiet', held && began && newest.savedAt > t0 && AUTO_SLOTS.includes(newest.slot) && newest.safe === true && saves.length === n0, `${newest.slot}, safe ${newest.safe}`);
  check('saving resets the play counted as unsaved', unsavedTime() === 0);
  // a quick save made mid-fight is kept, but game over will not offer it
  p.lastHitT = S.time;
  await saveGame('quick');
  const all = await listSaves();
  const quick = all.find((m) => m.slot === 'quick')!;
  check('a save made mid-fight is marked, and game over offers the last quiet one instead', quick.safe === false && all[0].slot === 'quick' && !!all.find(safeToResume) && all.find(safeToResume)!.slot !== 'quick');
  p.lastHitT = -999;

  // down for good (a captive can be one for days): the autosave waits, but not for ever, and never over the last good one
  await autosave();
  const good = (await listSaves()).filter((m) => AUTO_SLOTS.includes(m.slot) && m.safe !== false).sort((a, b) => b.savedAt - a.savedAt)[0];
  p.status = 'ko';
  G.autosaveT = 0;
  const forced: { slot: string; safe?: boolean; after: number }[] = [];
  let secs = 0;
  for (let round = 0; round < 4; round++) {
    const from = secs;
    let started = false;
    for (let i = 0; i < 3000 && !started; i++) { const before = G.autosaveT; tickAutosave(0.1); secs += 0.1; started = G.autosaveT < before; }
    if (!started) break;
    const t0 = Math.max(...(await listSaves()).map((m) => m.savedAt));
    let newest = (await listSaves())[0];
    for (let i = 0; i < 300 && !(newest.savedAt > t0); i++) { await wait(50); newest = (await listSaves()).sort((a, b) => b.savedAt - a.savedAt)[0]; }
    forced.push({ slot: newest.slot, safe: newest.safe, after: secs - from });
  }
  const kept = (await listSaves()).find((m) => m.slot === good.slot);
  check('with someone down for good, autosaves still come, a wait late and marked as made at a bad moment', forced.length === 4 && forced.every((f) => f.safe === false && f.after <= 60 + 60 + 2.5), forced.map((f) => `${f.slot} after ${f.after.toFixed(0)} s`).join(', '));
  check('...and four of them never push out the last good autosave', !!kept && kept.savedAt === good.savedAt && kept.safe !== false && !forced.some((f) => f.slot === good.slot), `${good.slot} kept`);
  check('a bad moment\'s autosave never takes the slot of the newest good one', nextAutoSlot([{ slot: 'auto', savedAt: 10, safe: true }, { slot: 'auto2', savedAt: 20, safe: false }, { slot: 'auto3', savedAt: 30, safe: false }] as SaveMeta[], false) === 'auto2'
    && nextAutoSlot([{ slot: 'auto', savedAt: 10, safe: true }, { slot: 'auto2', savedAt: 20, safe: false }, { slot: 'auto3', savedAt: 30, safe: false }] as SaveMeta[], true) === 'auto');
  p.status = 'up';
}

// ---------------------------------------------------------------- a save that does not fit
{
  await saveGame('1');
  const before = (await listSaves()).find((m) => m.slot === '1')!;
  const stored = store.get('sb-save-1');
  const money0 = S.W.money;
  S.W.money = 123456;
  full = true;
  const ok = await saveGame('1');
  full = false;
  const listed = (await listSaves()).find((m) => m.slot === '1')!;
  const read = await readSave('1');
  check('a save that does not fit fails, and the slot, its listing and what loading it gives stay as they were', !ok && listed.savedAt === before.savedAt && store.get('sb-save-1') === stored && read.money === money0, `money read back ${read.money}`);
  S.W.money = money0;
}

// ---------------------------------------------------------------- captivity in play: a save finds nothing to mend
{
  const w = S.W;
  const pw = w.squads.get(w.playerSquads[0])!;
  const ours = (dx: number): Char => {
    const c = makePerson(w, { faction: 'drifters', role: 'wanderer', race: 'valefolk', level: 12, whole: true } as any, rng);
    c.faction = 'player'; c.role = 'player'; w.moveToSquad(c, pw);
    const p = nav.nearestOpen(px + dx, pz, 10)!; c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z);
    return c;
  };
  const fieldHand = ours(10), caged = ours(12), taken = ours(14);
  enslave(fieldHand, 'chainhouse', cf);
  const cell = [...w.objs.values()].find((o) => o.kind === 'cage' && !o.occupant)!;
  const keeper = makePerson(w, { faction: 'chainhouse', role: 'slaver', level: 30 } as any, rng);
  keeper.x = cell.x + 1; keeper.z = cell.z; caged.status = 'up';
  keeper.carrying = caged.id; caged.carriedBy = keeper.id;
  placeInto(keeper, caged, cell);
  const sq = new Squad(); sq.faction = 'chainhouse'; sq.kind = 'slavers'; sq.name = 'Slavers'; w.addSquad(sq);
  const taker = makePerson(w, { faction: 'chainhouse', role: 'slaver', level: 30 } as any, rng);
  w.moveToSquad(taker, sq);
  taker.x = taken.x + 2; taker.z = taken.z; taker.homeX = taker.x; taker.homeZ = taker.z;
  taken.body.hp[1] = -20; knockOut(taken);
  for (let i = 0; i < 120 && taker.carrying !== taken.id; i++) steps(0.5, here);
  const states = `${fieldHand.mem.slaveSite ? 'a field slave' : 'not enslaved'}, ${caged.cage ? 'one caged' : 'nobody caged'}, ${taker.carrying ? 'a captive on the way' : 'no carry'}`;
  let mended = repairLinks(w);
  for (let i = 0; i < 6; i++) { steps(20, here); mended += repairLinks(w); }
  const a = copy(serialize()); const b = copy(serialize());
  delete a.savedAt; delete b.savedAt;
  check('with captivity in play, saving finds nothing to mend, then or over two minutes', mended === 0 && diff(a, b).length === 0 && !!fieldHand.mem.slaveSite && !!caged.cage, `${states}; mended ${mended}`);
}
// ---------------------------------------------------------------- a mid-game world: how big a save is, and how long it holds the game
{
  S.W = game; G.W = game;
  const w = game;
  const lead = w.playerChars().find((c) => c.alive)!;
  // the towns and places within a long day's walk peopled, as a player who has travelled would find them, and a minute of their lives
  for (const site of T.sites) {
    if (Math.hypot(site.x - lead.x, site.z - lead.z) > 3500 || w.populated.has(site.id)) continue;
    if (site.kind === 'town') populateTown(w, w.towns.get(site.id)!); else populateSite(w, site);
  }
  const live = (secs: number) => { for (let i = 0; i < secs * 10; i++) { simStep(0.1, lead); tickSquads(0.1); try { tickWorld(0.1); } catch { /* (the wider world's own business) */ } } };
  live(60);
  const best = (f: () => unknown, n: number) => { let t = Infinity; for (let i = 0; i < n; i++) { const a = performance.now(); f(); t = Math.min(t, performance.now() - a); } return t; };
  // before: version 4 wrote every thing and every field, in one step
  let j4 = '';
  const t4 = best(() => { j4 = JSON.stringify(v4.serialize()); }, 3);
  // after: what the save takes as it stands is kept between frames; the save checks it, and writes afresh only what changed
  keepWarm(w);
  await wait(2500);
  const meta = { name: 'x', day: 1, chars: 1, money: 0, place: '', seed: 1337 };
  const median = (a: number[]) => [...a].sort((x, y) => x - y)[a.length >> 1];
  // a save in one step (a quick save, told against the base; the menu's, whole): how long that step holds the game
  const ones: number[] = [], onesW: number[] = [];
  for (let i = 0; i < 5; i++) { live(2); await writeSave('quick', meta); ones.push(lastHold[0]); await writeSave('1', meta); onesW.push(lastHold[0]); await wait(300); }
  // an autosave: gone over first between frames, then taken a few milliseconds at a time; the longest slice is its frame spike
  const slices: number[][] = [], slicesW: number[][] = [];
  for (let i = 0; i < 5; i++) {
    live(2); await keepWarm(w); await writeSave('quick', meta, {}, true); slices.push([...lastHold]);
    live(2); await keepWarm(w); await writeSave('5', meta, {}, true); slicesW.push([...lastHold]);
    await wait(300);
  }
  const spike = median(slices.map((h) => Math.max(...h))), spikeW = median(slicesW.map((h) => Math.max(...h)));
  // (and, with nothing moving meanwhile, each the same as a save in one step just after)
  await writeSave('quick', meta, {}, true);
  const sameNow = differ(bare(serialize()), bare(await readSave('quick')));
  await writeSave('5', meta, {}, true);
  sameNow.push(...differ(bare(serialize({}, true)), bare(await readSave('5'))));
  // and the longest the game's thread is held over a whole autosave, the bigger kind (here, with no worker: compressed a piece
  // at a time); the least of three, as a collection of this big test's own garbage can land in any one
  let longest = Infinity;
  const holds: string[] = [];
  for (let i = 0; i < 3; i++) {
    live(2);
    await keepWarm(w);
    let most = 0, last = performance.now(), on = true, at = 0;
    const a = last;
    const tick = () => { const n = performance.now(); if (n - last > most) { most = n - last; at = last - a; } last = n; if (on) setTimeout(tick, 0); };
    tick();
    await writeSave('5', meta, {}, true);
    on = false;
    holds.push(`${most.toFixed(1)} ms at +${at.toFixed(0)} (slices ${lastHold.map((x) => x.toFixed(1)).join('+')})`);
    longest = Math.min(longest, most);
  }
  console.log(`     the longest holds over three whole autosaves: ${holds.join('; ')}`);
  const j5 = saveText(), jw = saveText({}, true);
  const kb = (n: number) => `${Math.round(n / 1024)} KB`;
  const gz4 = gzipSync(j4).length, gz5 = gzipSync(j5).length, gzw = gzipSync(jw).length;
  const depth = (v: unknown): number => (v && typeof v === 'object' ? 1 + Math.max(0, ...Object.values(v).map(depth)) : 0);
  const deepest = depth(JSON.parse(jw));
  console.log(`     mid-game world: ${w.chars.size} people, ${w.objs.size} things`);
  console.log(`     size: version 4 ${kb(j4.length)} (gzip ${kb(gz4)}); now told against the base ${kb(j5.length)} (gzip ${kb(gz5)}), whole ${kb(jw.length)} (gzip ${kb(gzw)}); nested ${deepest} deep at most`);
  console.log(`     version 4 took ${t4.toFixed(1)} ms just to write a save out (then compressed it on the same thread); now a save in one step takes ${median(ones).toFixed(1)} ms, whole ${median(onesW).toFixed(1)} ms,`);
  console.log(`     an autosave's slices ${slices.map((h) => h.map((x) => x.toFixed(1)).join('+')).join(', ')} ms (its spike, the longest: ${spike.toFixed(1)} ms),`);
  console.log(`     whole ${slicesW.map((h) => h.map((x) => x.toFixed(1)).join('+')).join(', ')} ms (its spike: ${spikeW.toFixed(1)} ms); the longest hold over a whole autosave ${longest.toFixed(1)} ms`);
  check('a mid-game save is under a third of the size it was, written out and compressed', j5.length < j4.length / 3 && gz5 < gz4 / 2.5, `${kb(j4.length)} -> ${kb(j5.length)}, gzip ${kb(gz4)} -> ${kb(gz5)}`);
  check('...a whole one is smaller than it was too, and nests well inside what a save may', jw.length < j4.length && gzw < gz4 && deepest < 20, `${kb(jw.length)}, gzip ${kb(gzw)}; ${deepest} deep`);
  check('a save in one step (a quick save, or the menu\'s, whole) holds the game less than version 4 took just to write it out', median(ones) < t4 && median(onesW) < t4, `${median(ones).toFixed(1)} and ${median(onesW).toFixed(1)} ms vs ${t4.toFixed(1)} ms`);
  check('an autosave\'s longest slice holds the game under a quarter as long, told against the base or whole, and the autosave is the game as it stands', spike < t4 / 4 && spikeW < t4 / 4 && sameNow.length === 0, sameNow[0] ?? `${spike.toFixed(1)} and ${spikeW.toFixed(1)} ms vs ${t4.toFixed(1)} ms`);
  check('...and compressing and storing it adds no longer hold of its own', longest < spikeW + 12, `${longest.toFixed(1)} ms`);
  // where saves can only go into localStorage (as here: there is no IndexedDB), a few megabytes in all, only the menu's are
  // written whole: the third autosave is told against the base there
  await writeSave('auto3', meta);
  const a3 = await readSave('auto3');
  await writeSave('4', meta);
  const s4 = await readSave('4');
  check('where saves go only into localStorage, the third autosave is told against the base, and the menu\'s are still whole', !!a3?.base && !s4?.base);
  const back = reload(JSON.parse(j5));
  const dd = differ(wholeOf(w), wholeOf(back));
  check('...and the mid-game save reads back as the same world, with nothing to mend', dd.length === 0 && repairLinks(back) === 0, dd.slice(0, 3).join(', '));
  S.W = game; G.W = game;
}
void game;

const failed = results.filter((x) => !x[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
void ({} as WObj);
