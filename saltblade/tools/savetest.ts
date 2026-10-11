// Headless check of saving and loading: what minds are busy with survives a
// save (a captive being carried off, a haul, a harvest, a post, a wreck half
// stripped, a band's leader walking up to talk); a captive taken mid-carry
// is still delivered after a load, and one whose captor has forgotten why
// (an older save) is put down; a damaged save is refused without touching the
// game being played; links to things that are gone are mended; saves from
// elsewhere lose any markup; and the autosave takes turns in three slots and
// waits for a quiet moment.
// Usage: npx tsx tools/savetest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR } from '../src/sim/clock';
import { RNG, hash3 } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { structuresIn, townRings } from '../src/sim/structures';
import { buildTown } from '../src/world/towns';
import { SETTLEMENT } from '../src/content/layout';
import { Squad } from '../src/sim/squad';
import { makePerson, makeAnimal } from '../src/sim/spawn';
import { knockOut } from '../src/sim/health';
import { workSalvage } from '../src/sim/salvage';
import { takeBed } from '../src/sim/use';
import { G } from '../src/state';
import {
  serialize, apply, repairLinks, damage, cleanSave, stripTags, exportText, importText, listSaves, readSave, writeSave, nextAutoSlot, danger, safeToResume,
  AUTO_SLOTS, SAVE_VERSION, type SaveMeta,
} from '../src/sim/save';
import { enslave } from '../src/sim/ai';
import { placeInto } from '../src/sim/use';
import { loadData, autosave, saveGame, tickAutosave, unsavedTime } from '../src/game/session';
import type { Char } from '../src/sim/char';
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
for (const site of T.sites) if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
W.rebuildObjHash();
// just enough of the game around the world for a session to load into
const cam = { target: { x: 0, z: 0 }, yaw: 0, pitch: 0.6, dist: 40, wantYaw: 0, wantPitch: 0, follow: null, lookAt(x: number, z: number, d: number) { cam.target.x = x; cam.target.z = z; cam.dist = d; } };
Object.assign(G, { T, nav, W, seed: 1337, mode: 'play', speed: 1, lastSpeed: 1, settings: { autosave: 1 }, cam, structViews: { clear() {}, W }, charViews: { clear() {} } });

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
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
  const old = copy(midCarry);
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
  delete before.savedAt; delete after.savedAt;
  const d = diff(before, after);
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
  const d = copy(serialize());
  // the sleeper and the sitter go, and the cage, a bed nobody is in and the stool's seat with them
  const gone = new Set([sleeper.id, sitter.id]);
  d.chars = d.chars.filter((c: any) => !gone.has(c.id));
  d.objs = d.objs.filter((o: any) => o.id !== cage.id);
  const strayBed = d.objs.find((o: any) => o.kind === 'bed' && !o.occupant);
  strayBed.occupant = 999999;
  const p = d.chars.find((c: any) => c.id === prisoner.id);
  p.mem.using = 888888;
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
  const someone = midCarry.chars.findIndex((c: any) => c.inv.items.length);
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
    ['gear called __proto__', (d) => { d.chars[0].eq.weapon = { uid: 1e6, id: '__proto__', n: 1, q: 2, x: 0, y: 0 }; }],
    ['lost limbs that are a word', (d) => { d.chars[0].body.lost = 'abc'; }],
    ['a bounty that is markup', (d) => { d.chars[0].bounty = { reavers: '" onmouseover="alert(1)' }; }],
    ['a town laid out to a plan called constructor', (d) => { d.towns[0].plan = 'constructor'; }],
    ['someone a world away', (d) => { d.chars[0].x = 1e12; }],
  ];
  const missed = hostile.filter(([, edit]) => { const d = copy(midCarry); edit(d); return damage(d) === ''; }).map(([label]) => label);
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
  apply({ ...copy(midCarry), v: -1e9 }, new World()); // (tools read saves with apply directly)
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
  check('a save copied as text reads back whole', back.chars.length === S.W.chars.size && back.v === SAVE_VERSION && damage(back) === '');
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
void game;

const failed = results.filter((x) => !x[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
void ({} as WObj);
