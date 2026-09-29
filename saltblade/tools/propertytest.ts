// Headless check of town life: buy a house in Crossroad from its sign, the
// way the right-click menu does; furnish it (only inside: the town will not
// let you build anywhere else); rest in its bed; keep things in its chest;
// and make sure a house in town is not a base for raiders to come for.
// Usage: npx tsx tools/propertytest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR } from '../src/sim/clock';
import { RNG, hash3 } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { tickBase, canPlace, placeSite, playerBase, finishSite, deconstruct } from '../src/sim/base';
import { structuresIn, townRings, buildingAt } from '../src/sim/structures';
import { buildTown } from '../src/world/towns';
import { buildSite } from '../src/world/sites';
import { SETTLEMENT } from '../src/content/layout';
import { BUILDABLE } from '../src/content/buildables';
import { markHousesForSale, buyHouse, houseOf } from '../src/sim/property';
import { populateTown } from '../src/sim/populate';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import { serialize, apply } from '../src/sim/save';
import type { WObj } from '../src/sim/objects';

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
markHousesForSale();

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const forSale = [...W.objs.values()].filter((o) => o.kind === 'sign' && o.def === 'forsale');
const towns = new Set(forSale.map((o) => o.site));
check('towns have houses for sale', forSale.length > 0, `${forSale.length} in ${towns.size} towns`);

const cross = T.sites.find((s) => s.key === 'crossroad')!;
const info = W.towns.get(cross.id)!;
populateTown(W, info);
const sign = forSale.filter((o) => o.site === cross.id).sort((a, b) => a.data.price - b.data.price)[0];
if (!sign) throw new Error('no house for sale in Crossroad');
const house = houseOf(sign)!;
console.log(`     ${house.data.name ?? 'house'} in Crossroad for ${sign.data.price} chits, ${house.data.w} x ${house.data.d} m`);

// two of your people, at the door
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Lodgers'; W.addSquad(sq); W.playerSquads.push(sq.id);
const rng = new RNG(8);
const crew = [0, 1].map((i) => {
  const c = makePerson(W, { faction: 'drifters', role: 'wanderer', level: 12 } as any, rng);
  c.faction = 'player'; c.role = 'player';
  W.moveToSquad(c, sq);
  const p = nav.nearestOpen(sign.x + i, sign.z, 6)!;
  c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z);
  c.inv.add('building_mats', 10);
  c.inv.add('iron_plates', 4);
  c.inv.add('fabric', 2);
  return c;
});
const dt = 0.1;
const step = (secs: number) => { for (let i = 0; i < secs / dt; i++) { simStep(dt, { x: house.x, z: house.z }); tickSquads(dt); tickBase(dt); } };

// 1. money first
W.money = sign.data.price - 1;
check('a house cannot be had without the chits', !!buyHouse(sign) && house.owner !== 'player');
W.money = sign.data.price + 500;
const err = buyHouse(sign);
const inside = [...W.objs.values()].filter((o) => o.parent === house.id);
check('buying from the sign makes the house and its furniture yours', !err && house.owner === 'player' && inside.every((o) => o.owner === 'player') && W.money === 500,
  err ?? `${inside.length} pieces inside (${[...new Set(inside.map((o) => o.kind))].join(', ')}); 500 chits left`);
check('the sign comes down', !W.objs.has(sign.id));

// 2. furnishing: only inside your own four walls
const spotInside = (key: string): [number, number] | null => {
  const b = BUILDABLE[key];
  for (let r = 0; r < Math.max(house.data.w, house.data.d) / 2; r += 0.4) for (let a = 0; a < Math.PI * 2; a += 0.5) {
    const x = house.x + Math.sin(a) * r, z = house.z + Math.cos(a) * r;
    if (buildingAt(x, z)?.id === house.id && canPlace(b, x, z, house.rot).ok) return [x, z];
  }
  return null;
};
let outside: WObj | undefined;
for (const b of info.buildings) if (b.owner !== 'player' && Math.hypot(b.x - house.x, b.z - house.z) > 20) { outside = b; break; }
const street = nav.nearestOpen(cross.x + 20, cross.z + 20, 30)!;
check('the town will not let you build in its streets', !canPlace(BUILDABLE.chest, street[0], street[1], 0).ok, canPlace(BUILDABLE.chest, street[0], street[1], 0).why);
check('...nor in somebody else\'s house', !!outside && !canPlace(BUILDABLE.chest, outside.x, outside.z, 0).ok);
const wanted = ['chest', 'bedroll', 'research_bench'];
for (const k of wanted) {
  const at = spotInside(k);
  if (!at) { check(`room inside for a ${k}`, false); continue; }
  const s = placeSite(BUILDABLE[k], at[0], at[1], house.rot);
  for (const c of crew) c.jobs.push({ k: 'build', obj: s.id, label: 'Build ' + k });
}
let t = 0;
const done = () => wanted.every((k) => [...W.objs.values()].some((o) => o.owner === 'player' && o.built && o.data?.bkey === k && o.parent === house.id));
while (!done() && t < 12 * HOUR / 36) { step(5); t += 5; }
check('a chest, a bedroll and a research bench go up inside', done(), `${((t * 36) / HOUR).toFixed(1)} game hours`);

// 3. living there
const bed = [...W.objs.values()].find((o) => o.kind === 'bed' && o.parent === house.id);
if (bed) {
  const c = crew[0];
  c.body.hp[1] -= 30; // a bad day behind them
  c.order = { k: 'use', obj: bed.id } as any;
  let s = 0;
  while (!c.bed && s < 60) { step(1); s++; }
  const hp0 = c.body.hp[1];
  step(120);
  check('your people rest in your own bed and heal there', c.bed === bed.id && c.body.hp[1] > hp0 + 5, `chest ${hp0.toFixed(0)} -> ${c.body.hp[1].toFixed(0)} after ${((120 * 36) / 60).toFixed(0)} game minutes`);
}
const chest = [...W.objs.values()].find((o) => o.owner === 'player' && o.data?.bkey === 'chest' && o.parent === house.id);
check('the chest keeps what you put in it', !!chest?.inv && chest.inv.add('dried_meat', 5) === 0 && chest.inv.count('dried_meat') === 5);

// 4. the town keeps the raiders off: a house in town is not a base, however much is in it
const more = [spotInside('chest'), spotInside('chest')].filter(Boolean).map((at) => finishSite(placeSite(BUILDABLE.chest, at![0], at![1], house.rot), true));
const ours = [...W.objs.values()].filter((o) => o.owner === 'player' && o.data?.bkey).length;
check('a well furnished house in town is not a base for raiders', more.length === 2 && playerBase() === null, `${ours} pieces of your own in it; base ${JSON.stringify(playerBase())}`);

// what you built there can come down again (and leaves the house), the house itself cannot
const extra = more.pop()!, v0 = house.data.v ?? 0;
deconstruct(extra);
check('your own furniture comes down and out of the house', !W.objs.has(extra.id) && !house.data.furniture.includes(extra.id) && (house.data.v ?? 0) > v0);

// 5. and it is still yours after saving and loading
const data = JSON.parse(JSON.stringify(serialize()));
const w2 = new World();
const keep = S.W;
apply(data, w2);
S.W = keep;
const h2 = w2.objs.get(house.id);
check('the house is still yours after a save and load', h2?.owner === 'player' && [...w2.objs.values()].filter((o) => o.parent === house.id && o.owner === 'player').length >= inside.length + wanted.length + more.length);

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
