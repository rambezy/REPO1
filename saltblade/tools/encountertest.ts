// Headless check that the waste comes to you: four armed farmhands camp in
// the Vale where the Freeholders start, a long walk from Aurum, and wait two
// game days. Reports everyone who came by (traders, wanderers, bandits,
// slavers, beasts), how close they came, whether it came to blows, and how
// the camp fared. Passes if a few came by and nothing threw.
// Usage: npx tsx tools/encountertest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR } from '../src/sim/clock';
import { RNG, hash3 } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { tickEncounters } from '../src/sim/encounters';
import { tickWorld } from '../src/sim/worldsim';
import { structuresIn, townRings } from '../src/sim/structures';
import { buildTown } from '../src/world/towns';
import { buildSite } from '../src/world/sites';
import { SETTLEMENT } from '../src/content/layout';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import { makeItem } from '../src/sim/inventory';
import { on } from '../src/core/events';

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(99), time: 0 });
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
S.fx = { ...S.fx, notice: () => {}, say: () => {} } as typeof S.fx;
for (const site of T.sites) {
  if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
  else buildSite(W, T, site, new RNG(hash3(site.seed, 1234, 5)));
}
W.rebuildObjHash();

// the Freeholders' corner of the Vale, with their farm tools
const aurum = T.sites.find((s) => s.key === 'aurum')!;
const camp = nav.nearestOpen(aurum.x - 900, aurum.z + 500, 60)!;
console.log(`camp at ${camp.map(Math.round).join(', ')} in ${T.regionAt(camp[0], camp[1]).key}`);
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Freeholders'; W.addSquad(sq); W.playerSquads.push(sq.id);
const rng = new RNG(3);
const tools = ['spear', 'cleaver', 'mining_pick', 'pipe_spear'];
const crew = tools.map((tool, i) => {
  const c = makePerson(W, { faction: 'drifters', role: 'worker', level: 6, loadout: 'drifters_resident' } as any, rng);
  c.eq.weapon = makeItem(tool, 1, 1);
  c.faction = 'player'; c.role = 'player';
  W.moveToSquad(c, sq);
  c.x = camp[0] + i * 2; c.z = camp[1]; c.y = T.heightAt(c.x, c.z);
  return c;
});
let talks = 0;
on('ui:talk', () => { talks++; });

const errors = new Map<string, number>();
const guard = (name: string, f: () => void) => { try { f(); } catch (e: any) { const k = `${name}: ${e?.message ?? e}`; errors.set(k, (errors.get(k) ?? 0) + 1); } };
const met = new Map<number, { who: string; at: number; closest: number; fought: boolean }>();
const t0 = S.clock.t, dt = 0.1;
let lastHour = -1;
while (S.clock.t < t0 + 2 * 86400) {
  guard('simStep', () => simStep(dt, { x: camp[0], z: camp[1] }));
  guard('tickSquads', () => tickSquads(dt));
  guard('tickEncounters', () => tickEncounters(dt));
  guard('tickWorld', () => tickWorld(dt));
  guard('weather', () => S.weather.tick(dt));
  for (const c of crew) if (c.alive) c.hunger = 300; // food is not what is under test
  const hour = Math.floor((S.clock.t - t0) / (HOUR / 4));
  if (hour === lastHour) continue;
  lastHour = hour;
  for (const s of W.squads.values()) {
    if (!s.flags.passer) continue;
    const L = W.char(s.leader);
    const d = L ? Math.min(...crew.map((c) => Math.hypot(c.x - L.x, c.z - L.z))) : Infinity;
    const e = met.get(s.id) ?? { who: `${s.name} (${s.flags.spec})`, at: (S.clock.t - t0) / HOUR, closest: Infinity, fought: false };
    e.closest = Math.min(e.closest, d);
    e.fought ||= s.members.some((id) => { const m = W.char(id); return !!m && crew.some((c) => m.brain.enemy === c.id || c.lastHitBy === m.id); });
    met.set(s.id, e);
  }
}
for (const e of met.values()) console.log(`  hour ${e.at.toFixed(1)}: ${e.who}, came within ${e.closest.toFixed(0)} m${e.fought ? ', came to blows' : ''}`);
console.log(`${met.size} came by in two days; ${talks} stopped to talk; the camp: ${crew.filter((c) => c.up).length} standing, ${crew.filter((c) => c.status === 'ko').length} out cold, ${crew.filter((c) => !c.alive).length} dead`);
if (errors.size) for (const [k, n] of errors) console.log(`ERROR ${k} ×${n}`);
if (met.size < 2 || errors.size) { console.log('FAIL'); process.exitCode = 1; }
