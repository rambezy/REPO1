// Travel speed, headless: 15× only on a walk, back to 1× when a hostile comes
// into sight, a notice or an auto-pause fires, someone is hit, or the walk
// ends; never something Space resumes at; and a walk's time estimate that is
// about right. Frames are stepped as the game steps them (0.05 s sim steps).
// Usage: npx tsx tools/traveltest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR, DAY, RATE } from '../src/sim/clock';
import { RNG, hash3 } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { structuresIn, townRings } from '../src/sim/structures';
import { buildTown } from '../src/world/towns';
import { SETTLEMENT } from '../src/content/layout';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import { giveOrder } from '../src/sim/orders';
import { emit, on } from '../src/core/events';
import { keymap, ACTION } from '../src/core/keys';
import { G } from '../src/state';
import { setupTravel, startTravel, tickTravel, isTravelling, walkMinutes, minutesText, TRAVEL_SPEED } from '../src/game/travel';
import type { Char } from '../src/sim/char';

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(5), time: 0 });
S.clock.t = DAY + 9 * HOUR;
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const notices: string[] = [];
on('notice', (t: string) => { notices.push(t); });
S.fx = { ...S.fx, notice: (t: string, kind = 'info') => emit('notice', t, kind), hit: (c: Char, by: Char) => emit('fx:hit', c, by), say: () => {}, sound: () => {}, burst: () => {}, shot: () => {}, died: () => {}, ko: () => {} } as typeof S.fx;
for (const site of T.sites) if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
for (const o of T.ores) W.addObj({ id: 0, kind: 'ore', def: o.kind, x: o.x, z: o.z, y: o.y, rot: o.rot, owner: '', site: 0, parent: 0, data: { left: 300, size: o.size } });
W.rebuildObjHash();

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
Object.assign(G, { mode: 'play', speed: 1, lastSpeed: 1 });
setupTravel(false);

const rng = new RNG(8);
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Nameless'; W.addSquad(sq); W.playerSquads.push(sq.id);
const cr = T.sites.find((s) => s.settlement === 'crossroad')!;
const put = (c: Char, x: number, z: number) => { const p = nav.nearestOpen(x, z, 30) ?? [x, z]; c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z); c.path = null; c.hasGoal = false; };
const p = makePerson(W, { faction: 'drifters', role: 'wanderer', level: 8, loadout: 'drifters_wanderer', whole: true }, rng);
p.faction = 'player'; p.role = 'player'; W.moveToSquad(p, sq); p.hunger = 280;
/** Out along the road east of Crossroad, to somewhere `m` metres on. */
const road = cr ? T.roads.find((r) => r.a === 'crossroad' || r.b === 'crossroad')! : null;
const along = (m: number): [number, number] => {
  const pts = road!.pts, n = pts.length / 2, fromA = road!.a === 'crossroad';
  let d = 0, px = pts[fromA ? 0 : (n - 1) * 2], pz = pts[fromA ? 1 : (n - 1) * 2 + 1];
  for (let k = 1; k < n; k++) {
    const i = fromA ? k : n - 1 - k;
    const x = pts[i * 2], z = pts[i * 2 + 1];
    d += Math.hypot(x - px, z - pz); px = x; pz = z;
    if (d >= m) break;
  }
  return nav.nearestOpen(px, pz, 30) ?? [px, pz];
};
let simT = 0;
/** One frame of `real` seconds, as the game steps one: the sim in 0.05 s steps at the game's speed, then travel's look round. */
const frame = (real = 0.1) => {
  let left = real * G.speed;
  simT += left;
  while (left > 1e-6) { const h = Math.min(left, 0.05); simStep(h, { x: p.x, z: p.z }); tickSquads(h); left -= h; }
  tickTravel();
};
const press5 = () => keymap.handle('travel');

// ---------------------------------------------------------------- the key
check('travel speed has a key of its own (5), in the Time group, and can be rebound', keymap.labels('travel')[0] === '5' && ACTION.travel.group === 'Time' && !ACTION.travel.fixed, keymap.labels('travel').join(' '));

// ---------------------------------------------------------------- only on a walk
const start = along(250);
put(p, start[0], start[1]);
press5();
check('with nobody walking anywhere it does nothing, and says why', G.speed === 1 && !isTravelling() && /send your people somewhere/.test(notices[notices.length - 1] ?? ''), notices[notices.length - 1]);

// ---------------------------------------------------------------- a long walk, and its estimate
const far = along(1250);
giveOrder(p, { k: 'move', x: far[0], z: far[1] });
for (let i = 0; i < 5; i++) frame(0.05);
const est = walkMinutes(p);
press5();
check('on a walk, the key goes to 15×', G.speed === TRAVEL_SPEED && isTravelling() && G.lastSpeed === 1, `speed ${G.speed}`);
const t0 = simT;
let frames = 0;
while (isTravelling() && frames < 4000) { frame(0.1); frames++; }
const took = ((simT - t0) * RATE) / 60;
check('...and back to 1× when they get there, with a word why', G.speed === 1 && !isTravelling() && Math.hypot(p.x - far[0], p.z - far[1]) < 4 && /where they were going/.test(notices[notices.length - 1] ?? ''), `${Math.round(Math.hypot(p.x - far[0], p.z - far[1]))} m from the spot; "${notices[notices.length - 1]}"`);
check('the selection panel\'s estimate of the walk is about right', est !== null && Math.abs(est - took) <= 0.35 * took, `estimated ${est === null ? '-' : minutesText(est)} (${est?.toFixed(0)} min), took ${took.toFixed(0)} game min in ${frames} frames`);

// ---------------------------------------------------------------- danger
const foeSq = new Squad(); foeSq.faction = 'starvelings'; foeSq.kind = 'raid'; foeSq.name = 'Starvelings'; W.addSquad(foeSq);
const foe = makePerson(W, { faction: 'starvelings', role: 'bandit', level: 3, whole: true }, rng);
W.moveToSquad(foe, foeSq);
const back = along(300);
const mid = along(700);
put(foe, mid[0], mid[1]);
foe.order = { k: 'hold' };
giveOrder(p, { k: 'move', x: back[0], z: back[1] });
for (let i = 0; i < 3; i++) frame(0.05);
press5();
const started = isTravelling();
frames = 0;
let gap = Infinity;
while (isTravelling() && frames < 4000) { frame(0.1); frames++; gap = Math.hypot(foe.x - p.x, foe.z - p.z); }
check('a hostile coming into sight drops it to 1× before they close, and says who', started && G.speed === 1 && /in sight/.test(notices[notices.length - 1] ?? '') && gap > 20, `${Math.round(gap)} m apart: "${notices[notices.length - 1]}"`);
press5();
check('...and it will not start again with them in sight', G.speed === 1 && /Not with/.test(notices[notices.length - 1] ?? ''), notices[notices.length - 1]);
foe.status = 'dead';

// (a long walk each time: to the far spot, or back from it)
const walkOn = () => { const A = along(1100), B = along(250); const to = Math.hypot(p.x - A[0], p.z - A[1]) > 400 ? A : B; giveOrder(p, { k: 'move', x: to[0], z: to[1] }); for (let i = 0; i < 3; i++) frame(0.05); G.speed = 1; press5(); return isTravelling(); };
// a notice, but not good news
let on0 = walkOn();
S.fx.notice(`${p.name}'s Athletics rose to 5.`, 'good');
frame(0.1);
const kept = isTravelling();
S.fx.notice('Something happened somewhere.', 'info');
check('good news (a skill rising) leaves it on; any other notice drops it to 1×, saying so', on0 && kept && G.speed === 1 && !isTravelling() && notices[notices.length - 1] === 'Back to normal speed: Something happened somewhere.', notices[notices.length - 1]);
// one of yours bleeding, or down
on0 = walkOn();
p.body.bleed[1] = 0.12;
frame(0.1);
const bled = !isTravelling() && /is bleeding/.test(notices[notices.length - 1] ?? '');
press5();
const refused = !isTravelling() && /Not now: .* is bleeding/.test(notices[notices.length - 1] ?? '');
p.body.bleed[1] = 0;
check('one of yours bleeding stops it, and it will not start again till they are seen to', on0 && bled && refused, notices.slice(-2).join(' / '));
// a blow
on0 = walkOn();
S.fx.hit(p, foe, 4, false, 1);
check('a blow to one of yours drops it to 1×', on0 && G.speed === 1 && !isTravelling());
// an auto-pause: paused, and Space then resumes at 1×, not 15×
on0 = walkOn();
G.lastSpeed = G.speed; G.speed = 0; emit('speed'); emit('autopause', 'test');
check('an auto-pause stops it, and Space resumes at 1×, never at travel speed', on0 && G.speed === 0 && !isTravelling() && G.lastSpeed === 1, `started ${on0}, lastSpeed ${G.lastSpeed}`);
// the menu opened on the way, and closed again: what it gives back is 1×, not an unwatched 15×
on0 = walkOn();
{ const r = G.speed; G.lastSpeed = r; G.speed = 0; emit('speed'); G.speed = r; G.lastSpeed = r; emit('speed'); }
check('the menu (or a conversation) closing after pausing it gives back 1×, not an unwatched 15×', on0 && G.speed === 1 && G.lastSpeed === 1 && !isTravelling(), `speed ${G.speed}, lastSpeed ${G.lastSpeed}`);
// a conversation or a counter on arrival
on0 = walkOn();
emit('ui:trade', p.id, 0);
check('a trade window or a conversation opening drops it to 1×', on0 && G.speed === 1 && !isTravelling());
// a walk that ends at work: the last stretch, and the work, are not a journey
{
  const rock = [...W.objs.values()].filter((o) => o.kind === 'ore').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
  if (rock) {
    giveOrder(p, { k: 'mine', obj: rock.id });
    for (let i = 0; i < 3; i++) frame(0.05);
    G.speed = 1; press5();
    const went = isTravelling();
    frames = 0;
    while (isTravelling() && frames < 4000) { frame(0.1); frames++; }
    const d = Math.hypot(rock.x - p.x, rock.z - p.z);
    check('a walk to work drops back to 1× for the last 50 m, never on through the work', went && G.speed === 1 && d <= 55 && /where they were going/.test(notices[notices.length - 1] ?? ''), `${Math.round(d)} m from the rock; "${notices[notices.length - 1]}"`);
    // and set to work 30 m off, there is no long walk to skip
    put(p, rock.x + 30, rock.z);
    giveOrder(p, { k: 'mine', obj: rock.id });
    for (let i = 0; i < 3; i++) frame(0.05);
    press5();
    check('...and a short walk between jobs is no journey', !isTravelling() && /for a long walk/.test(notices[notices.length - 1] ?? ''), notices[notices.length - 1]);
    giveOrder(p, null); p.jobs.length = 0; p.act = null;
  } else check('a walk to work drops back to 1× for the last 50 m', false, 'no rock');
}
// a spot nobody can get to (in a building, or out in the water, a few metres off open ground): the walk ends short of it
{
  let goal: [number, number] | null = null;
  outer: for (let r = 60; r < 900 && !goal; r += 10) for (let a = 0; a < Math.PI * 2; a += 0.3) {
    const x = cr.x + Math.cos(a) * r, z = cr.z + Math.sin(a) * r;
    if (nav.walkable(x, z)) continue;
    const o = nav.nearestOpen(x, z, 30);
    if (o && Math.hypot(o[0] - x, o[1] - z) >= 4 && Math.hypot(o[0] - x, o[1] - z) < 20) { goal = [x, z]; break outer; }
  }
  const from = along(200);
  put(p, from[0], from[1]);
  if (goal) {
    const n0 = notices.length;
    giveOrder(p, { k: 'move', x: goal[0], z: goal[1] });
    for (let i = 0; i < 5; i++) frame(0.05);
    G.speed = 1; press5();
    const went = isTravelling();
    frames = 0;
    let still = -1;
    while (isTravelling() && frames < 2400) { frame(0.1); frames++; if (still < 0 && p.speed < 0.3) still = simT; else if (p.speed >= 0.3) still = -1; }
    const ended = simT;
    for (let i = 0; i < 40 && p.order; i++) frame(0.1);
    const said = notices.slice(n0);
    check('a walk that cannot reach its spot drops travel within seconds of standing still short of it, and the order with it, saying so', went && !isTravelling() && still >= 0 && ended - still < 10 && !p.order && said.some((n) => /can't (get there|find a way there)/.test(n)),
      `stood still ${still < 0 ? 'never' : (ended - still).toFixed(1) + ' sim s'} before it ended, ${Math.round(Math.hypot(p.x - goal[0], p.z - goal[1]))} m short; order ${p.order?.k ?? 'none'}; ${said.join(' / ')}`);
  } else check('a walk that cannot reach its spot drops travel', false, 'no such spot near Crossroad');
}
// a speed key
on0 = walkOn();
G.speed = 3; G.lastSpeed = 3; emit('speed');
frame(0.1);
check('a speed key takes over from it', on0 && G.speed === 3 && !isTravelling());
G.speed = 1;

console.log(`\n${results.filter((r) => r[1]).length}/${results.length} checks passed.`);
if (results.some((r) => !r[1])) process.exitCode = 1;
