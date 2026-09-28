// Headless simulation soak: generates the world, puts a squad in it and runs
// the simulation for several game days without rendering, touring the towns
// so that each gets populated. Reports errors (with stacks) and a summary.
// Usage: npx tsx tools/simtest.ts [days=3] [dt=0.1]
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, DAY } from '../src/sim/clock';
import { RNG, hash3 } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { tickEncounters } from '../src/sim/encounters';
import { tickWorld } from '../src/sim/worldsim';
import { tickBase } from '../src/sim/base';
import { tickRunaways, tickStealth } from '../src/sim/crime';
import { tickRaids } from '../src/sim/raids';
import { tickWorldEvents } from '../src/sim/worldevents';
import { tickArena } from '../src/sim/arena';
import { tickDeeds } from '../src/sim/deeds';
import { tickChatter, chatter } from '../src/sim/chatter';
import { tickHunters } from '../src/sim/hunters';
import { tickPersonal } from '../src/sim/personal';
import { structuresIn, townRings } from '../src/sim/structures';
import { buildTown } from '../src/world/towns';
import { buildSite } from '../src/world/sites';
import { SETTLEMENT } from '../src/content/layout';
import { populateTown, populateSite } from '../src/sim/populate';
import { postBounties } from '../src/sim/bounties';
import { markHousesForSale } from '../src/sim/property';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import { serialize, apply } from '../src/sim/save';
import { on } from '../src/core/events';

const days = +(process.argv[2] ?? 3);
const dt = +(process.argv[3] ?? 0.1);
const t0 = Date.now();
const T = await generateWorld(1337, () => {});
console.log(`world in ${Date.now() - t0} ms`);
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(99), time: 0 });
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const notices: string[] = [];
const said: string[] = [];
chatter.needView = false;
S.fx = { ...S.fx, notice: (text: string) => { notices.push(text); }, say: (c, text: string) => { if (c.faction === 'player' || said.length < 400) said.push(`${c.name.split(' ')[0]} (${c.faction}): ${text}`); } } as typeof S.fx;
let talks = 0;
on('ui:talk', () => { talks++; });

for (const o of T.ores) W.addObj({ id: 0, kind: 'ore', def: o.kind, x: o.x, z: o.z, y: o.y, rot: o.rot, owner: '', site: 0, parent: 0, data: { left: 300, size: o.size } });
for (const site of T.sites) {
  if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
  else buildSite(W, T, site, new RNG(hash3(site.seed, 1234, 5)));
}
W.rebuildObjHash();
postBounties();
markHousesForSale();
console.log(`structures: ${W.objs.size} objects, ${W.towns.size} towns, ${W.bountyBoard.length} bounties`);
for (const info of W.towns.values()) {
  const want = SETTLEMENT[info.site.settlement!]?.shops ?? [];
  const have = info.shops.map((x) => x.kind);
  const missing = want.filter((k) => !have.includes(k));
  if (missing.length) console.log(`  ${info.site.name} is missing shops: ${missing.join(', ')}`);
}

// a squad of three to tour the waste
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Test'; W.addSquad(sq); W.playerSquads.push(sq.id);
const rng = new RNG(7);
for (let i = 0; i < 3; i++) {
  const c = makePerson(W, { faction: 'drifters', role: 'merc', level: 30, loadout: 'merc' }, rng);
  c.faction = 'player'; c.role = 'player';
  W.moveToSquad(c, sq);
}
const towns = T.sites.filter((s) => s.kind === 'town');
const place = (k: number) => {
  const s = towns[k % towns.length];
  W.playerChars().forEach((c, i) => {
    const p = nav.nearestOpen(s.x + s.r + 40 + i * 2, s.z, 20) ?? [s.x + s.r + 40, s.z];
    c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z); c.path = null; c.hasGoal = false;
    if (c.status !== 'up') { c.status = 'up'; c.body.init(c.look.race, 30); c.body.blood = c.body.bloodMax; }
  });
  return s;
};

const errors = new Map<string, { n: number; stack: string }>();
const guard = (name: string, f: () => void) => {
  try { f(); } catch (e: any) {
    const key = name + ': ' + (e?.message ?? String(e));
    const cur = errors.get(key);
    if (cur) cur.n++; else errors.set(key, { n: 1, stack: String(e?.stack ?? '').split('\n').slice(0, 6).join('\n') });
  }
};

let popT = 0, tourT = 0, tour = 0, steps = 0, saves = 0;
const weatherSeen = new Set<string>();
let here = place(0);
const tStart = Date.now();
while (S.clock.day < 1 + days) {
  const lead = W.playerChars()[0];
  const focus = { x: lead.x, z: lead.z };
  guard('simStep', () => simStep(dt, focus));
  guard('tickSquads', () => tickSquads(dt));
  guard('tickEncounters', () => tickEncounters(dt));
  guard('tickWorld', () => tickWorld(dt));
  guard('tickBase', () => tickBase(dt));
  guard('tickRunaways', () => tickRunaways(dt));
  guard('tickStealth', () => tickStealth(dt));
  guard('tickRaids', () => tickRaids(dt));
  guard('tickWorldEvents', () => tickWorldEvents(dt));
  guard('weather', () => S.weather.tick(dt));
  guard('tickArena', () => tickArena(dt));
  guard('tickDeeds', () => tickDeeds(dt));
  guard('tickChatter', () => tickChatter(dt));
  guard('tickHunters', () => tickHunters(dt));
  guard('tickPersonal', () => tickPersonal(dt));
  steps++;
  popT -= dt;
  if (popT <= 0) {
    popT = 1.5;
    guard('population', () => {
      for (const site of T.sites) {
        if (W.populated.has(site.id)) continue;
        if (Math.hypot(site.x - lead.x, site.z - lead.z) > site.r + 520) continue;
        if (site.kind === 'town') { const info = W.towns.get(site.id); if (info) populateTown(W, info); }
        else populateSite(W, site);
      }
    });
    weatherSeen.add(S.weather.at(lead.x, lead.z).kind);
  }
  // move on to the next town every game hour and a half
  tourT -= dt;
  if (tourT <= 0) { tourT = 150; here = place(++tour); }
  // save and load round trip twice a day
  if (steps % Math.round(DAY / 36 / 2 / dt) === 0) {
    guard('save/load', () => {
      const data = JSON.parse(JSON.stringify(serialize()));
      const w2 = new World();
      const keep = S.W;
      apply(data, w2);
      S.W = keep;
      saves++;
      if (w2.chars.size !== keep.chars.size || w2.objs.size !== keep.objs.size) throw new Error(`round trip lost things: ${w2.chars.size}/${keep.chars.size} chars, ${w2.objs.size}/${keep.objs.size} objects`);
    });
  }
}
const secs = (Date.now() - tStart) / 1000;
const dead = [...W.chars.values()].filter((c) => c.status === 'dead').length;
console.log(`\n${days} days in ${secs.toFixed(0)} s (${(steps / secs).toFixed(0)} steps/s), last at ${here.name}`);
console.log(`chars ${W.chars.size} (${dead} dead), squads ${W.squads.size}, objects ${W.objs.size}, populated ${W.populated.size}/${T.sites.length}, talks ${talks}, saves ${saves}`);
console.log(`weather seen: ${[...weatherSeen].join(', ')}; sacked: ${JSON.stringify(W.flags.sacked ?? {})}; leaderless: ${JSON.stringify(W.flags.leaderless ?? {})}`);
console.log(`log tail:\n  ${W.log.slice(-12).map((l) => l.text).join('\n  ')}`);
const mine = said.filter((l) => l.includes('(player)'));
console.log(`chatter: ${mine.length} lines from your people, ${said.length - mine.length} from townsfolk. A few:\n  ${[...mine.slice(0, 8), ...said.filter((l) => !l.includes('(player)')).slice(0, 6)].join('\n  ')}`);
if (errors.size) {
  console.log(`\nERRORS (${errors.size} kinds):`);
  for (const [k, v] of errors) console.log(`- ${k} ×${v.n}\n${v.stack}`);
  process.exitCode = 1;
} else console.log('\nno errors');
void notices;
