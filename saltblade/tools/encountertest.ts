// Headless check that the waste comes to you: four armed farmhands camp in
// the Vale where the Freeholders start, a long walk from Aurum, and wait two
// game days. Reports everyone who came by (traders, wanderers, bandits,
// slavers, beasts), how close they came, whether it came to blows, and how
// the camp fared. Passes if a few came by and nothing threw, and if in the
// first days no band that means harm came near more than three strong.
// Usage: npx tsx tools/encountertest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR, DAY } from '../src/sim/clock';
import { RNG, hash3 } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { tickEncounters } from '../src/sim/encounters';
import { tickWorld, EARLY_DAYS, spawn, SPECS, beatableNear } from '../src/sim/worldsim';
import { structuresIn, townRings } from '../src/sim/structures';
import { buildTown } from '../src/world/towns';
import { buildSite } from '../src/world/sites';
import { SETTLEMENT } from '../src/content/layout';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import { makeItem } from '../src/sim/inventory';
import { on } from '../src/core/events';
import { ANIMAL } from '../src/content/animals';
import type { Char } from '../src/sim/char';

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
const big = new Set<string>(), near = new Set<number>();
const meansHarm = (s: Squad) => s.kind === 'raid' || s.kind === 'slavers' || (s.kind === 'herd' && s.members.some((id) => { const a = W.char(id)?.animal; return !!a && ANIMAL[a].diet !== 'grazer'; }));
// a roaming band of Starvelings as the world makes them (five to twelve), wandering in 650 m off on the first day:
// cut to what the camp can stand up to, three at most, before it is in sight (see worldsim fitEarly)
{
  const at = nav.nearestOpen(camp[0] + 650, camp[1], 60)!;
  // (by the camp and on, as a band on the road goes: one whose road ended at the camp stood about there, in
  // play, for the two days, and as company already on the way kept every passer off; see tickPassers)
  const on = nav.nearestOpen(camp[0] - 800, camp[1], 120) ?? at;
  const roamer = spawn(SPECS.find((s) => s.key === 'starvelings')!, { x: at[0], z: at[1], route: [at[0], at[1], camp[0], camp[1], on[0], on[1]] })!;
  const born = roamer.members.length;
  tickWorld(2.1);
  const left = W.squads.has(roamer.id) ? roamer.members.length : 0;
  console.log(`${born > 3 && left <= 3 ? 'ok  ' : 'FAIL'} a roaming band ${born} strong that wanders within 650 m on day ${S.clock.day} is cut to ${left}`);
  if (!(born > 3 && left <= 3)) process.exitCode = 1;
}
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
  // the first days: nothing that means harm comes near more than three strong (see worldsim fitEarly)
  if (S.clock.day <= EARLY_DAYS) for (const s of W.squads.values()) {
    if (!s.flags.spec || s.faction === 'player' || !meansHarm(s)) continue;
    const up = s.members.map((id) => W.char(id)).filter((m): m is Char => !!m && m.up);
    if (!up.length) continue;
    // (from the living: a camp already killed to a man has no one left to keep the promise to, and fitEarly rightly stops)
    const d = Math.min(...crew.filter((c) => c.alive).map((c) => Math.hypot(c.x - up[0].x, c.z - up[0].z)));
    if (d < 600 && up.length > 3) big.add(`${s.name} (${s.flags.spec}) ${up.length} strong at ${d.toFixed(0)} m on day ${S.clock.day}`);
    if (d < 600) near.add(s.id);
  }
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
console.log(`${big.size ? 'FAIL' : 'ok  '} in the first days, none of the ${near.size} bands that meant harm and came within 600 m was more than three strong${big.size ? ': ' + [...big].join('; ') : ''}`);
if (errors.size) for (const [k, n] of errors) console.log(`ERROR ${k} ×${n}`);
if (met.size < 2 || errors.size || big.size) { console.log('FAIL'); process.exitCode = 1; }

// day one on the road out of Crossroad, a lone Wanderer with "Win a fight" left (and "Bandage a wound", with no wound
// yet to bandage): within a few hours the road brings a fight the goal tracker can name, though traders and patrols
// pass that road all day (see tickPassers, wantsFight)
{
  const W2 = new World();
  Object.assign(S, { W: W2, clock: new Clock(), time: 0 });
  S.clock.t = DAY + 7.5 * HOUR;
  const cr = T.sites.find((s) => s.settlement === 'crossroad')!;
  W2.towns.set(cr.id, buildTown(W2, T, cr, SETTLEMENT[cr.settlement!], hash3(cr.seed, 4321, 1)));
  W2.rebuildObjHash();
  const sq2 = new Squad(); sq2.faction = 'player'; sq2.kind = 'player'; sq2.name = 'Nameless'; W2.addSquad(sq2); W2.playerSquads.push(sq2.id);
  const w = makePerson(W2, { faction: 'drifters', role: 'wanderer', level: 8, loadout: 'drifters_wanderer', whole: true } as any, new RNG(4));
  w.faction = 'player'; w.role = 'player'; W2.moveToSquad(w, sq2);
  const at = nav.nearestOpen(cr.x + 480, cr.z - 120, 30)!;
  w.x = at[0]; w.z = at[1]; w.y = T.heightAt(w.x, w.z);
  W2.flags.objectives = { set: 'wanderer', done: { reach: 1, barkeep: 1, deal: 1, mine: 1, sell_ore: 1, recruit: 1 }, ids0: [w.id], stats0: { [w.id]: [0, 0] } };
  let first = -1, why = '', last = -1;
  while (S.clock.t < DAY + 13.5 * HOUR && first < 0) {
    guard('simStep', () => simStep(dt, { x: w.x, z: w.z }));
    guard('tickSquads', () => tickSquads(dt));
    guard('tickEncounters', () => tickEncounters(dt));
    guard('tickWorld', () => tickWorld(dt));
    w.hunger = 300; w.x = at[0]; w.z = at[1]; // (they wait there)
    const q = Math.floor(S.clock.t / (HOUR / 4));
    if (q === last) continue;
    last = q;
    const b = beatableNear();
    if (b) { first = (S.clock.t - DAY) / HOUR; why = `${b.why}: ${b.n} ${b.name}, ${Math.round(b.d)} m`; }
  }
  const ok = first >= 0 && first <= 7.5 + 4 && !errors.size;
  console.log(`${ok ? 'ok  ' : 'FAIL'} a lone Wanderer on the road out of Crossroad on day one, a fight their goal: one is named by ${first < 0 ? 'never' : `${Math.floor(first)}:${String(Math.round((first % 1) * 60)).padStart(2, '0')}`} (${why || 'nothing'})`);
  if (!ok) process.exitCode = 1;
}
