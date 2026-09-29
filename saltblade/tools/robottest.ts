// Headless check of the Old Machines: foundries in the world and who guards
// them, machines keeping to their own, warbots and Sentinels firing lasers, a
// beam rifle burning energy cells, salvaging a downed Sentinel for parts,
// reprogramming a saw drone to serve you, and Warden Prime at the Maker vault.
// Usage: npx tsx tools/robottest.ts
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
import { buildSite } from '../src/world/sites';
import { SETTLEMENT, LANDMARKS } from '../src/content/layout';
import { REGIONS } from '../src/world/regions';
import { Squad } from '../src/sim/squad';
import { makePerson, makeAnimal } from '../src/sim/spawn';
import { makeItem } from '../src/sim/inventory';
import { populateSite } from '../src/sim/populate';
import { hostile } from '../src/sim/combat';
import { knockOut } from '../src/sim/health';
import { canSalvage, canReprogram } from '../src/sim/salvage';
import type { Char } from '../src/sim/char';
import type { ShotKind } from '../src/sim/ctx';

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(21), time: 0 });
S.clock.t = 12 * HOUR;
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const notices: string[] = [], said: string[] = [];
const shots: { kind: ShotKind; hit: boolean; by: string }[] = [];
S.fx = {
  ...S.fx, notice: (t: string) => { notices.push(t); }, say: (_c: Char, t: string) => { said.push(t); }, sound: () => {},
  shot: (c: Char, _x: number, _z: number, hit: boolean, kind?: ShotKind) => { shots.push({ kind: kind ?? 'bolt', hit, by: c.animal ?? c.look.race }); },
} as typeof S.fx;
for (const site of T.sites) {
  if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
  else buildSite(W, T, site, new RNG(hash3(site.seed, 1234, 5)));
}
W.rebuildObjHash();

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };

// ---------------------------------------------------------------- foundries, and who guards them
const foundries = T.sites.filter((s) => s.kind === 'foundry');
const byRegion = new Map<string, number>();
for (const f of foundries) byRegion.set(REGIONS[f.region].key, (byRegion.get(REGIONS[f.region].key) ?? 0) + 1);
check('the Makers\' foundries stand in the machine country', foundries.length >= 3 && [...byRegion.keys()].every((k) => ['rust', 'glass', 'ash'].includes(k)), [...byRegion].map(([k, n]) => `${n} in ${k}`).join(', '));
const fd = foundries[0];
const before = W.chars.size;
populateSite(W, fd);
const guards = [...W.chars.values()].slice(0).filter((c) => c.site === fd.id);
const sentinels = guards.filter((c) => c.look.race === 'sentinel'), drones = guards.filter((c) => c.animal === 'sawdrone');
check(`${fd.name} is guarded by Sentinels and saw drones`, sentinels.length >= 2 && drones.length >= 2 && W.chars.size > before, `${sentinels.length} Sentinels, ${drones.length} drones, ${guards.filter((c) => c.animal === 'warbot').length} warbots`);
const crates = [...W.objs.values()].filter((o) => o.site === fd.id && o.def === 'crate_old' && o.inv?.items.some((i) => ['energy_cell', 'servo_motor', 'elec_parts', 'machine_parts'].includes(i.id)));
check('its stores hold cells, servos and parts', crates.length >= 1, `${crates.length} crates`);
const sent = sentinels[0];
check('Sentinels are machines with a built-in emitter and plating', sent.robot && sent.eq.ranged?.id === 'sentinel_emitter' && sent.eq.weapon?.id === 'shock_fist' && sent.armourAt(1)[0] > 0.3);

// ---------------------------------------------------------------- machines keep to their own
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Scavengers'; W.addSquad(sq); W.playerSquads.push(sq.id);
const rng = new RNG(4);
const [bx, bz] = nav.nearestOpen(fd.x + 160, fd.z, 60)!;
const mine = (dx: number, dz: number): Char => {
  const c = makePerson(W, { faction: 'drifters', role: 'wanderer', level: 30 } as any, rng);
  c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, sq);
  const p = nav.nearestOpen(bx + dx, bz + dz, 10)!; c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z);
  return c;
};
const drone = drones[0];
check('saw drones leave Sentinels alone, and come for you', !hostile(drone, sent) && !hostile(sent, drone) && hostile(drone, mine(0, 40)));
check('a saw drone is a machine: repaired, not healed', drone.robot && drone.body.robotic);

// ---------------------------------------------------------------- lasers
const range = (c: Char, t: Char) => Math.hypot(c.x - t.x, c.z - t.z);
const lone = (x: number, z: number, f: () => Char) => { const c = f(); const p = nav.nearestOpen(x, z, 10)!; c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z); return c; };
const target = mine(0, 0);
target.combatMode = 'passive';
target.body.max.forEach((m, l) => { target.body.max[l] = m * 20; target.body.hp[l] = target.body.max[l]; }); // it only has to stand there
const wb = lone(bx + 40, bz, () => makeAnimal(W, 'warbot', rng, 1));
const wsq = new Squad(); wsq.faction = 'fauna'; wsq.kind = 'herd'; wsq.name = 'Warbots'; W.addSquad(wsq); W.moveToSquad(wb, wsq);
shots.length = 0;
const run = (secs: number, f: { x: number; z: number }) => { for (let i = 0; i < secs / 0.1; i++) { simStep(0.1, f); tickSquads(0.1); } };
run(25, { x: bx, z: bz });
const heavy = shots.filter((s) => s.by === 'warbot' && s.kind === 'heavy');
check('a warbot stands off and fires its beam cannons', heavy.length >= 3 && range(wb, target) > 6, `${heavy.length} beams, ${heavy.filter((s) => s.hit).length} hit, from ${range(wb, target).toFixed(0)} m`);
W.removeChar(wb);

const s2 = lone(bx + 25, bz + 5, () => makePerson(W, { faction: 'machines', role: 'construct', level: 28 } as any, rng));
const ssq = new Squad(); ssq.faction = 'machines'; ssq.kind = 'raid'; ssq.name = 'Old Machines'; W.addSquad(ssq); W.moveToSquad(s2, ssq);
shots.length = 0; said.length = 0;
run(20, { x: bx, z: bz });
const beams = shots.filter((s) => s.by === 'sentinel' && s.kind === 'laser');
check('a Sentinel fires its emitter, with no ammunition to run out of', beams.length >= 3, `${beams.length} beams`);
check('...and hails you like the city watch it thinks it is', said.some((t) => /HALT|CITIZEN|COMPLIANCE|LETHAL|CURFEW|SILENT|LOITERING/.test(t)), said.find((t) => /[A-Z]{4}/.test(t)) ?? 'said nothing');

// ---------------------------------------------------------------- a beam rifle burns cells
const gunner = mine(-4, 0);
gunner.eq.ranged = makeItem('laser_rifle', 1, 3);
gunner.inv.add('energy_cell', 10);
gunner.combatMode = 'aggressive';
gunner.order = { k: 'attack', id: s2.id } as any;
shots.length = 0;
run(15, { x: bx, z: bz });
const ours = shots.filter((s) => s.by !== 'sentinel' && s.kind === 'laser');
check('a beam rifle fires lasers and burns an energy cell a shot', ours.length >= 2 && gunner.inv.count('energy_cell') === 10 - ours.length, `${ours.length} shots, ${gunner.inv.count('energy_cell')} cells left`);

// ---------------------------------------------------------------- salvage
s2.body.hp[1] = -s2.body.max[1] * 0.3; // beaten down, as a fight would leave it: machines don't get up on their own
knockOut(s2, 'test');
const scav = mine(4, 0);
scav.order = { k: 'salvage', id: s2.id } as any;
check('a downed Sentinel can be salvaged, and not a sleeping friend', canSalvage(s2) && !canSalvage(scav));
const inv0 = scav.inv.count('servo_motor') + scav.inv.count('elec_parts') + scav.inv.count('energy_cell');
run(20, { x: bx, z: bz });
const inv1 = scav.inv.count('servo_motor') + scav.inv.count('elec_parts') + scav.inv.count('energy_cell');
check('salvaging it gives servos, parts and cells, and the wreck is gone', !W.chars.has(s2.id) && inv1 > inv0, notices.find((n) => /stripped/.test(n)) ?? 'no notice');

// ---------------------------------------------------------------- reprogramming
const hacker = mine(8, 0);
const { SK } = await import('../src/sim/skills');
hacker.sk[SK.robotics] = 32;
hacker.inv.add('elec_parts', 6);
let joined = false;
for (let tries = 0; tries < 4 && !joined; tries++) {
  const d = lone(hacker.x + 2, hacker.z, () => makeAnimal(W, 'sawdrone', rng, 1));
  const dsq = new Squad(); dsq.faction = 'fauna'; dsq.kind = 'herd'; dsq.name = 'Drones'; W.addSquad(dsq); W.moveToSquad(d, dsq);
  d.body.hp[1] = -d.body.max[1] * 0.3;
  knockOut(d, 'test');
  check(tries ? 'another try' : 'a downed saw drone can be reprogrammed', canReprogram(d));
  hacker.order = { k: 'reprogram', id: d.id } as any;
  run(18, { x: bx, z: bz });
  joined = d.faction === 'player' && d.squad === sq.id && d.up;
  if (!joined) W.removeChar(d);
}
check('a reprogrammed drone joins your squad and speaks for you', joined && said.some((t) => /sir|service|prune/i.test(t)), notices.find((n) => /yours now/.test(n)) ?? 'not joined');

// ---------------------------------------------------------------- Warden Prime
const vault = T.sites.find((s) => s.landmark && LANDMARKS.find((l) => l.key === s.key)?.boss === 'warden_prime');
if (vault) {
  populateSite(W, vault);
  const prime = [...W.chars.values()].find((c) => c.site === vault.id && c.name === 'Warden Prime');
  check(`Warden Prime keeps the door at ${vault.name}`, !!prime && prime.animal === 'warbot' && prime.inv.count('relic_core') > 0);
} else check('a Maker vault with a Warden Prime', false, 'none in this world');

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
