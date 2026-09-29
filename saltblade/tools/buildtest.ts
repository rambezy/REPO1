// Headless check that everything the player can build does what its description
// says: the turret hits, the fuel generator fuels itself, the still makes rum,
// beds heal by kind and bunks sleep two, the shackle post holds a prisoner, the
// watchtower's lookout spots and shoots, tables, stools, lamps and banners each
// help, a Workshop Hall's crates are storage, and long blades suffer indoors.
// Usage: npx tsx tools/buildtest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR } from '../src/sim/clock';
import { RNG, hash3 } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { tickBase, placeSite, finishSite } from '../src/sim/base';
import { structuresIn, townRings, buildingAt } from '../src/sim/structures';
import { buildTown } from '../src/world/towns';
import { buildSite } from '../src/world/sites';
import { SETTLEMENT } from '../src/content/layout';
import { BUILDABLE } from '../src/content/buildables';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import { makeItem } from '../src/sim/inventory';
import { canSee, eatSomething, pickUp, lamplit } from '../src/sim/ai';
import { colours, cramped } from '../src/sim/combat';
import { knockOut } from '../src/sim/health';
import { useObject, placeInto, leaveFurniture } from '../src/sim/use';
import type { Char } from '../src/sim/char';
import type { WObj } from '../src/sim/objects';

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(99), time: 0 });
S.clock.t = 12 * HOUR;
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const notices: string[] = [];
const shots: boolean[] = [];
S.fx = { ...S.fx, notice: (t: string) => { notices.push(t); }, say: () => {}, sound: () => {}, shot: (_c: Char, _x: number, _z: number, hit: boolean) => { shots.push(hit); } } as typeof S.fx;
for (const site of T.sites) {
  if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
  else buildSite(W, T, site, new RNG(hash3(site.seed, 1234, 5)));
}
W.rebuildObjHash();

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };

// a quiet corner of the Vale, a long way from any town
const aurum = T.sites.find((s) => s.key === 'aurum')!;
const [bx, bz] = nav.nearestOpen(aurum.x - 900, aurum.z + 500, 60)!;
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Builders'; W.addSquad(sq); W.playerSquads.push(sq.id);
const rng = new RNG(5);
const spot = (dx: number, dz: number): [number, number] => nav.nearestOpen(bx + dx, bz + dz, 12)!;
const person = (dx: number, dz: number, faction = 'player'): Char => {
  const c = makePerson(W, { faction: faction === 'player' ? 'drifters' : faction, role: faction === 'player' ? 'wanderer' : 'bandit', level: 14 } as any, rng);
  if (faction === 'player') { c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, sq); }
  const [x, z] = spot(dx, dz);
  c.x = x; c.z = z; c.y = T.heightAt(x, z);
  c.hunger = 250;
  return c;
};
const build = (key: string, dx: number, dz: number, rot = 0): WObj => { const [x, z] = spot(dx, dz); return finishSite(placeSite(BUILDABLE[key], x, z, rot), true); };
const dt = 0.1;
const run = (secs: number, focus: { x: number; z: number } = { x: bx, z: bz }, each?: () => void) => {
  for (let i = 0; i < secs / dt; i++) { simStep(dt, focus); tickSquads(dt); tickBase(dt); each?.(); }
};
const gone = (cs: Char[]) => { for (const c of cs) W.removeChar(c); };
// a player's order, as the right-click menu gives it (game/control.ts issue)
const issue = (c: Char, o: any) => { if (c.bed || c.mem.using) leaveFurniture(c); c.mem.sit = false; c.order = o; if (o.k === 'move') { c.brain.enemy = 0; c.path = null; c.hasGoal = false; } };
const hurt = (c: Char) => { c.body.hp[1] = c.body.max[1] * 0.4; c.body.hp[2] = c.body.max[2] * 0.4; };
const hp = (c: Char) => c.body.hp[1] + c.body.hp[2];

// ---------------------------------------------------------------- the harpoon turret
{
  const tur = build('turret', 0, 0);
  const gunner = person(3, 0);
  gunner.combatMode = 'aggressive';
  gunner.jobs.push({ k: 'turret', obj: tur.id, label: 'Man turret' });
  const foes = [0, 1, 2].map((i) => person(-6 + i * 6, -38, 'starvelings'));
  let far = 0;
  shots.length = 0;
  run(60, tur, () => {
    const d = Math.hypot(gunner.x - tur.x, gunner.z - tur.z);
    const close = foes.some((f) => f.up && Math.hypot(f.x - gunner.x, f.z - gunner.z) < 3);
    if (!close) far = Math.max(far, d);
  });
  const hits = shots.filter(Boolean).length;
  check('the turret fires at raiders coming in', shots.length >= 3, `${shots.length} harpoons, ${hits} hit`);
  check('its gunner stays at the turret', far < 3.5, `never more than ${far.toFixed(1)} m from it while nobody was at arm's reach`);
  gone([gunner, ...foes]);
}

// ---------------------------------------------------------------- the fuel generator
{
  const gen = build('generator', 40, 0);
  const ref = build('refinery', 52, 0);
  const chest = build('chest', 44, 6);
  chest.inv!.add('fuel', 4);
  check('a new fuel generator has a tank to fill', !!gen.inv, 'before any machine is near');
  for (let i = 0; i < 3; i++) tickBase(3);
  check('it fills its tank from storage nearby and powers the refinery', (gen.inv?.count('fuel') ?? 0) > 0 && chest.inv!.count('fuel') < 4 && ref.data.powerOK === 1,
    `tank ${gen.inv?.count('fuel')}, chest ${chest.inv!.count('fuel')}, refinery power ${Math.round((ref.data.powerOK ?? 0) * 100)}%`);
  build('stonecutter', 36, 8);
  const f0 = gen.data.fuelT;
  tickBase(3);
  check('fuel burns at one rate however many machines draw on it', f0 - gen.data.fuelT === 3, `${f0} -> ${gen.data.fuelT} with two machines`);
}

// ---------------------------------------------------------------- the still makes rum when asked
{
  const still = build('brewery', 80, 0);
  const box = build('chest', 84, 5);
  box.inv!.add('cactus', 9);
  const brewer = person(78, 3);
  still.data.recipe = 'cactus_rum'; // what the Make buttons in its window set
  brewer.jobs.push({ k: 'operate', obj: still.id, label: still.data.jobLabel });
  const rum = () => [still.inv, box.inv, brewer.inv].reduce((n, g) => n + (g?.count('cactus_rum') ?? 0), 0);
  let t = 0;
  while (!rum() && t < 400) { run(5, still); t += 5; }
  check('the still makes cactus rum when set to', rum() > 0, `${rum()} after ${t} s`);
  gone([brewer]);
}

// ---------------------------------------------------------------- beds and bunks
{
  const roll = build('bedroll', 120, 0), bed = build('bed', 124, 0), bunk = build('bunk', 128, 0);
  const a = person(119, 3), b = person(123, 3);
  hurt(a); hurt(b);
  useObject(a, roll); useObject(b, bed);
  const a0 = hp(a), b0 = hp(b);
  run(60, bed);
  const ga = hp(a) - a0, gb = hp(b) - b0;
  check('a proper bed heals faster than a bedroll', gb > ga * 1.25 && ga > 0, `bed +${gb.toFixed(1)}, bedroll +${ga.toFixed(1)}`);
  leaveFurniture(a); leaveFurniture(b);
  const c = person(127, 3);
  notices.length = 0;
  useObject(a, bunk); useObject(b, bunk); useObject(c, bunk);
  check('a bunk sleeps two', a.bed === bunk.id && b.bed === bunk.id && !!b.mem.upper && c.bed !== bunk.id && notices.some((n) => /Both bunks/.test(n)));
  leaveFurniture(b);
  check('...and the top one can get out without the bottom one', a.bed === bunk.id && !bunk.data.upper && bunk.occupant === a.id);
  gone([a, b, c]);
}

// ---------------------------------------------------------------- the shackle post
{
  const post = build('shackle_post', 160, 0);
  const jailer = person(158, 2);
  const thief = person(163, 4, 'starvelings');
  knockOut(thief, 'test');
  pickUp(jailer, thief);
  placeInto(jailer, thief, post);
  thief.body.koT = 999; // wakes up soon
  run(40, post);
  const d = Math.hypot(thief.x - post.x, thief.z - post.z);
  check('a prisoner chained to the post stays there', thief.cage === post.id && post.occupant === thief.id && d < 1, `${d.toFixed(2)} m from it, ${thief.status}`);
  jailer.order = { k: 'lockpick', obj: post.id } as any;
  let t = 0;
  while (thief.cage && t < 120) { run(2, post); t += 2; }
  check('...until someone unchains them', !thief.cage && !post.occupant, `after ${t} s`);
  gone([jailer, thief]);
}

// ---------------------------------------------------------------- a seat, and a table to eat at
{
  const stool = build('stool', 200, 0);
  const sitter = person(198, 2), stander = person(204, 4);
  hurt(sitter); hurt(stander);
  useObject(sitter, stool);
  const s0 = hp(sitter), t0 = hp(stander);
  run(60, stool);
  const gs = hp(sitter) - s0, gt = hp(stander) - t0;
  check('resting on a seat heals a little faster than standing about', gs > gt * 1.2 && gt > 0, `seated +${gs.toFixed(1)}, standing +${gt.toFixed(1)}`);
  const table = build('table', 206, 10);
  const diner = person(207, 12), walker = person(260, 0);
  for (const c of [diner, walker]) { c.hunger = 50; c.inv.add('dried_meat', 1); }
  eatSomething(diner); eatSomething(walker);
  check('food eaten at a table goes a third further', Math.abs((diner.hunger - 50) / (walker.hunger - 50) - 4 / 3) < 0.01, `at the table +${(diner.hunger - 50).toFixed(0)}, standing +${(walker.hunger - 50).toFixed(0)}`);
  void table;
  gone([sitter, stander, diner, walker]);
}

// ---------------------------------------------------------------- lamplight and banners
{
  const watcher = person(240, 0);
  const prowler = person(240, 32, 'starvelings');
  prowler.move = 'walk';
  S.clock.t = Math.floor(S.clock.t / 86400) * 86400 + 86400 + 23 * HOUR;
  const dark = canSee(watcher, prowler);
  const lamp = build('lamp', 240, 30);
  const lit = canSee(watcher, prowler);
  check('a lamp shows who is about at night', !dark && lit && lamplit(prowler.x, prowler.z), `seen at ${Math.hypot(prowler.x - watcher.x, prowler.z - watcher.z).toFixed(0)} m: dark ${dark}, lit ${lit}`);
  W.removeObj(lamp);
  S.clock.t += 13 * HOUR; // midday again
  const flag = build('banner', 244, 4);
  const near = colours(watcher);
  watcher.x += 60;
  check('your people fight better near your banner', near === 5 && colours(watcher) === 0 && colours(prowler) === 0);
  void flag;
  gone([watcher, prowler]);
}

// ---------------------------------------------------------------- the watchtower
{
  const tower = build('tower', 300, 0);
  const look = person(296, 4);
  look.eq.ranged = makeItem('hand_xbow', 1, 2);
  look.inv.add('bolts', 30);
  look.jobs.push({ k: 'watch', obj: tower.id, label: 'Keep watch' });
  const sleeper = person(290, -6);
  sleeper.sleeping = true;
  run(8, tower);
  check('a lookout climbs the watchtower', look.mem.using === tower.id, `${Math.hypot(look.x - tower.x, look.z - tower.z).toFixed(1)} m from its middle`);
  const stranger = person(300, 62, 'starvelings');
  stranger.combatMode = 'passive';
  const ground = person(304, 2); // someone at the foot of the tower, who can't see that far
  const groundSees = canSee(ground, stranger);
  notices.length = 0; shots.length = 0;
  run(4, tower);
  check('from the tower they see twice as far and raise the alarm', !groundSees && notices.some((n) => /spots/.test(n)) && !sleeper.sleeping,
    `${notices.find((n) => /spots/.test(n)) ?? 'no alarm'}; the sleeper ${sleeper.sleeping ? 'slept on' : 'woke'}`);
  stranger.x = tower.x; stranger.z = tower.z + 38; // within crossbow range
  run(12, tower);
  check('...and shoot a crossbow from up there', shots.length > 0, `${shots.length} bolts`);
  issue(look, { k: 'move', x: tower.x + 8, z: tower.z });
  check('and come down again when told to move', !look.mem.using && nav.walkable(look.x, look.z));
  gone([look, sleeper, stranger, ground]);
}

// ---------------------------------------------------------------- a Workshop Hall's crates, and long blades indoors
{
  const hall = build('hall', 360, 0);
  const crates = [...W.objs.values()].filter((o) => o.parent === hall.id && o.def === 'crate');
  check('a Workshop Hall comes with crates your people store things in', crates.length === 5 && crates.every((o) => o.kind === 'storage' && !o.locked && o.owner === 'player'), `${crates.length} crates`);
  const brute = person(360, 0);
  brute.eq.weapon = makeItem('slab', 1, 2);
  brute.x = hall.x; brute.z = hall.z;
  const inside = cramped(brute);
  brute.x += 30;
  check('a slab is clumsy indoors, and fine outside', !!buildingAt(hall.x, hall.z) && inside === 0.15 && cramped(brute) === 0, `inside ${inside}, outside ${cramped(brute)}`);
  gone([brute]);
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
