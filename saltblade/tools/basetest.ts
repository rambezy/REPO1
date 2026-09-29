// Headless outpost play-through: founds a base in the wilds and takes it
// through every production chain the way a player would, through the same
// calls the build and job panels make: storage and benches built from carried
// materials, research, wind power, mining with hauling to storage, stone
// cutting, iron refining, a hemp field and a loom, a smithy that forges a
// weapon from its queue, and then a raid on the base. Each stage must finish
// within a game-time limit.
// Usage: npx tsx tools/basetest.ts   (DEBUG=1 to see who is doing what when a stage stalls)
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR } from '../src/sim/clock';
import { RNG, hash3 } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { tickWorld } from '../src/sim/worldsim';
import { tickBase, canPlace, placeSite, playerBase } from '../src/sim/base';
import { tickRaids, spawnRaid } from '../src/sim/raids';
import { structuresIn, townRings } from '../src/sim/structures';
import { buildTown } from '../src/world/towns';
import { buildSite } from '../src/world/sites';
import { SETTLEMENT } from '../src/content/layout';
import { BUILDABLE } from '../src/content/buildables';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import type { Char } from '../src/sim/char';
import type { WObj } from '../src/sim/objects';

const DEBUG = !!process.env.DEBUG;
const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(99), time: 0 });
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const notices: string[] = [];
S.fx = { ...S.fx, notice: (text: string) => { notices.push(text); }, say: () => {} } as typeof S.fx;
for (const o of T.ores) W.addObj({ id: 0, kind: 'ore', def: o.kind, x: o.x, z: o.z, y: o.y, rot: o.rot, owner: '', site: 0, parent: 0, data: { left: 300, size: o.size } });
for (const site of T.sites) {
  if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
  else buildSite(W, T, site, new RNG(hash3(site.seed, 1234, 5)));
}
W.rebuildObjHash();

// somewhere quiet with iron and stone close together
const ores = [...W.objs.values()].filter((o) => o.kind === 'ore');
const clearOfSites = (x: number, z: number, r: number) => T.sites.every((s) => Math.hypot(s.x - x, s.z - z) > s.r + r);
let iron: WObj | undefined, stone: WObj | undefined;
for (const a of ores) {
  if (a.def !== 'iron' || !clearOfSites(a.x, a.z, 250)) continue;
  const b = ores.find((o) => o.def === 'stone' && Math.hypot(o.x - a.x, o.z - a.z) < 160);
  if (b) { iron = a; stone = b; break; }
}
if (!iron || !stone) throw new Error('no iron and stone near each other away from towns');
const cx = (iron.x + stone.x) / 2 + 12, cz = (iron.z + stone.z) / 2 + 12;
console.log(`base at ${cx.toFixed(0)}, ${cz.toFixed(0)} in ${T.regionAt(cx, cz).key}; iron ${Math.hypot(iron.x - cx, iron.z - cz).toFixed(0)} m, stone ${Math.hypot(stone.x - cx, stone.z - cz).toFixed(0)} m away`);

// four settlers with the materials in their packs
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Outpost'; W.addSquad(sq); W.playerSquads.push(sq.id);
const rng = new RNG(11);
const crew: Char[] = [];
for (let i = 0; i < 4; i++) {
  const c = makePerson(W, { faction: 'drifters', role: 'merc', level: 25, loadout: 'merc' }, rng);
  c.faction = 'player'; c.role = 'player';
  W.moveToSquad(c, sq);
  const p = nav.nearestOpen(cx + i * 2, cz - 6, 20) ?? [cx, cz];
  c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z);
  crew.push(c);
}
const carry: Record<string, number> = { building_mats: 44, iron_plates: 30, fabric: 4 };
for (const [id, n] of Object.entries(carry)) {
  let left = n;
  for (const c of crew) { if (left <= 0) break; const k = Math.min(Math.ceil(n / crew.length), left); left -= k - c.inv.add(id, k); }
  if (left > 0) throw new Error(`could not hand out ${left} ${id}`);
}

// ---------------------------------------------------------------- running the world
const errors = new Map<string, { n: number; stack: string }>();
const guard = (name: string, f: () => void) => {
  try { f(); } catch (e: any) {
    const key = name + ': ' + (e?.message ?? String(e));
    const cur = errors.get(key);
    if (cur) cur.n++; else errors.set(key, { n: 1, stack: String(e?.stack ?? '').split('\n').slice(0, 6).join('\n') });
  }
};
const dt = 0.1;
/** The wider world (roaming bands, raids of its own) is held back until the raid stage, so a war band passing by cannot spoil the production checks. */
let threats = false;
function step(n: number) {
  for (let i = 0; i < n; i++) {
    guard('simStep', () => simStep(dt, { x: cx, z: cz }));
    guard('tickSquads', () => tickSquads(dt));
    if (threats) guard('tickWorld', () => tickWorld(dt));
    guard('tickBase', () => tickBase(dt));
    if (threats) guard('tickRaids', () => tickRaids(dt));
    guard('weather', () => S.weather.tick(dt));
    for (const c of crew) if (c.alive) c.hunger = Math.max(c.hunger, 200); // food is not what is under test
  }
}

const results: [string, boolean][] = [];
/** Runs until `ok` or the game-time limit, and reports how long it took. */
function until(label: string, hours: number, ok: () => boolean, info: () => string = () => '') {
  const start = S.clock.t;
  while (!ok() && S.clock.t - start < hours * HOUR) step(50);
  const pass = ok();
  const note = info();
  results.push([label, pass]);
  console.log(`${pass ? 'ok  ' : 'FAIL'} ${label} (${((S.clock.t - start) / HOUR).toFixed(1)} game hours${note ? '; ' + note : ''})`);
  if (!pass && DEBUG) for (const c of crew) console.log('    ' + doing(c));
  return pass;
}
/** One settler's state, for stalled stages. */
function doing(c: Char) {
  const foe = W.char(c.brain.enemy ?? 0) ?? W.char(c.lastHitBy);
  return `${c.name}: ${c.status}, jobs [${c.jobs.map((j) => j.k).join(', ')}], act ${c.act ?? '-'}, at ${c.x.toFixed(0)},${c.z.toFixed(0)}` +
    `${c.hasGoal ? ` heading for ${c.goalX.toFixed(0)},${c.goalZ.toFixed(0)}` : ''}${S.nav.walkable(c.x, c.z) ? '' : ' (on blocked ground)'}, load ${c.load().toFixed(2)}` +
    `${foe ? `, fighting ${foe.name} (${foe.faction})` : ''}, carrying ${c.inv.items.map((i) => i.id + ' ' + i.n).join(', ') || 'nothing'}`;
}

// ---------------------------------------------------------------- the player's hand
/** Finds room for a thing near the base and lays out its construction site, the way the build panel does. */
function site(key: string) {
  const b = BUILDABLE[key];
  for (let r = 4; r < 90; r += 2.5) {
    for (let a = 0; a < Math.PI * 2; a += 0.4) {
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      if (canPlace(b, x, z, 0).ok) return placeSite(b, x, z, 0);
    }
  }
  throw new Error(`no room for ${key}`);
}
const assign = (c: Char, k: string, o: WObj) => { if (!c.jobs.some((j) => j.obj === o.id)) c.jobs.push({ k, obj: o.id, label: k } as any); };
const buildAll = (keys: string[]) => { for (const k of keys) { const o = site(k); for (const c of crew) assign(c, 'build', o); } };
/** The finished thing that replaced a construction site. */
const built = (key: string) => [...W.objs.values()].find((o) => o.owner === 'player' && o.built && o.data?.bkey === key);
/** How much of an item the outpost has, in stores, machines and packs. */
const total = (id: string) => [...W.objs.values()].filter((o) => o.owner === 'player' && o.inv).reduce((n, o) => n + o.inv!.count(id), 0) + crew.reduce((n, c) => n + c.inv.count(id) + (c.eq.back?.inv?.count(id) ?? 0), 0);
const inStores = (id: string) => [...W.objs.values()].filter((o) => o.owner === 'player' && o.kind === 'storage').reduce((n, o) => n + (o.inv?.count(id) ?? 0), 0);

// 1. the first buildings, from what the settlers carry
const first = ['chest', 'res_box', 'ore_box', 'research_bench', 'stonecutter', 'loom', 'farm_hemp', 'campfire'];
buildAll(first);
until('build storage, benches, a field and a campfire', 30, () => first.every((k) => built(k)), () => first.filter((k) => !built(k)).join(', '));

// the player stocks the new stores with what is left in the packs
const store = built('res_box');
if (store) for (const c of crew) for (const id of Object.keys(carry)) { const n = c.inv.count(id); if (n) c.inv.take(id, n - store.inv!.add(id, n)); }

// 2. research at the bench: wind power, iron refining, then the smithy
const bench = built('research_bench');
if (bench) {
  assign(crew[0], 'research', bench);
  for (const tech of ['power', 'refining', 'weapons1']) {
    W.research.current = tech; W.research.progress = 0;
    until(`research ${tech}`, 24, () => W.research.done.has(tech), () => `science ${crew[0].skill('science').toFixed(0)}`);
  }
  crew[0].jobs = [];
}

// 3. power, a refinery and a smithy
const second = ['windmill', 'refinery', 'weapon_bench'];
buildAll(second);
until('build a wind generator, refinery and smithy', 30, () => second.every((k) => built(k)), () => `building_mats ${total('building_mats')}, iron_plates ${total('iron_plates')}`);

// 4. two miners; one hand on the stone cutter and then the refinery; one farming hemp and weaving it
assign(crew[0], 'mine', iron);
assign(crew[1], 'mine', stone);
until('miners dig ore and haul it to storage', 12, () => iron!.data.left <= 294 && stone!.data.left <= 294 && inStores('iron_ore') + inStores('stone') >= 3,
  () => `dug iron ${300 - iron!.data.left}, stone ${300 - stone!.data.left}; stored iron ${inStores('iron_ore')}, stone ${inStores('stone')}`);
const power = () => +(built('refinery')?.data.powerOK ?? 0).toFixed(2);
until('the wind generator powers the machines', 1, () => power() > 0.3, () => `refinery power ${power()}`);
const run = (c: Char, key: string, k = 'operate') => { const o = built(key); c.jobs = []; if (o) assign(c, k, o); };
run(crew[2], 'stonecutter');
const mats0 = total('building_mats');
until('stone is cut into building materials', 24, () => total('building_mats') >= mats0 + 3, () => `building_mats ${mats0} -> ${total('building_mats')}`);
run(crew[2], 'refinery');
const plates0 = total('iron_plates');
until('iron ore is refined into plates', 24, () => total('iron_plates') >= plates0 + 3, () => `iron_plates ${plates0} -> ${total('iron_plates')}`);
run(crew[3], 'farm_hemp', 'farm');
const hemp0 = total('hemp');
until('the hemp field grows and is harvested', 96, () => total('hemp') > hemp0, () => `growth ${(built('farm_hemp')?.data.growth ?? 0).toFixed(2)}, hemp ${total('hemp')}`);
const loom = built('loom');
if (loom) assign(crew[3], 'operate', loom);
const fabric0 = total('fabric');
until('the loom weaves hemp into fabric', 24, () => total('fabric') > fabric0, () => `fabric ${fabric0} -> ${total('fabric')}, hemp ${total('hemp')}`);

// 5. a smith works through a queue
const smithy = built('weapon_bench');
if (smithy) {
  smithy.data.queue.push({ r: 'w_cleaver', n: 1 });
  run(crew[2], 'weapon_bench', 'craft');
  until('the smithy forges a cleaver from the queue', 24, () => total('cleaver') >= 1, () => `queue ${JSON.stringify(smithy.data.queue)}`);
}

// 6. a raid comes, from beyond sight, and must reach the base and be settled one way or another
const base = playerBase();
if (!base) results.push(['the outpost counts as a base', false]);
else {
  for (const c of crew) { c.jobs = []; c.combatMode = 'aggressive'; }
  threats = true;
  spawnRaid(base.x, base.z, base.n);
  const raid = [...W.squads.values()].find((s) => s.flags.baseRaid);
  if (!raid) results.push(['a raid sets out', false]);
  else {
    console.log(`     ${raid.members.length} ${raid.name} set out (${raid.flags.demand})`);
    const out = () => { const l = W.char(raid.leader); return l ? Math.hypot(l.x - base.x, l.z - base.z) : Infinity; };
    until('the raiders reach the base', 12, () => raid.flags.arrived !== undefined, () => `leader ${out().toFixed(0)} m out`);
    until('the raid ends (beaten off, paid or looted)', 30, () => !raid.flags.baseRaid, () => {
      const up = raid.members.map((id) => W.char(id)).filter((c) => c?.up).length;
      return `${up} raiders standing, ${crew.filter((c) => c.up).length}/4 settlers standing`;
    });
  }
}

// ---------------------------------------------------------------- report
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} stages passed by day ${S.clock.day}.`);
if (DEBUG) {
  const warn = [...new Set(notices)].filter((n) => /needs|no power|full|Nothing queued|Choose/.test(n));
  if (warn.length) console.log(`notices along the way:\n  ${warn.slice(0, 12).join('\n  ')}`);
}
if (errors.size) {
  console.log(`\nERRORS (${errors.size} kinds):`);
  for (const [k, v] of errors) console.log(`- ${k} ×${v.n}\n${v.stack}`);
}
if (failed.length || errors.size) process.exitCode = 1;
