// Headless check of money and making things: hauling goods from a town with
// too much of them to one short of them pays, and buying and selling back at
// one counter never does; purchases are settled one way; workshop output keeps
// its grade on the way to storage and is never doubled when the workshop is
// full; tearing down a cage lets its prisoner out; relics pay for a tech once;
// a bribe the officer takes ends the search; a paid bounty never leaves you
// better liked than before the crime; a weapon dropped by armless hands lands
// on the ground when the pack is full.
// Usage: npx tsx tools/economytest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR, DAY } from '../src/sim/clock';
import { RNG, hash3 } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { tickBase, placeSite, finishSite, deconstruct, startResearch, researchPaid, countOwned } from '../src/sim/base';
import { JOB_HANDLERS } from '../src/sim/jobs';
import { structuresIn, townRings } from '../src/sim/structures';
import { buildTown } from '../src/world/towns';
import { buildSite } from '../src/world/sites';
import { SETTLEMENT } from '../src/content/layout';
import { BUILDABLE, RECIPES, TECH } from '../src/content/buildables';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import { Grid, makeItem, type Item } from '../src/sim/inventory';
import { buyPrice, sellPrice, makeShop, restock, shopGrid, payForGoods, payForSale, sellInto, buyStanding, dearMarkets, type Shop } from '../src/sim/shops';
import { MARKETS } from '../src/content/markets';
import { ITEM, ITEMS } from '../src/content/items';
import { treeFor, choose, say, type DChoice, type DCtx, type Tree } from '../src/sim/dialogue';
import { crime } from '../src/sim/crime';
import { placeInto, takeBed, useObject } from '../src/sim/use';
import { tickHealth, severLimb } from '../src/sim/health';
import { LI } from '../src/sim/body';
import { on } from '../src/core/events';
import type { Char } from '../src/sim/char';

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
S.fx = { ...S.fx, notice: (t: string) => { notices.push(t); }, say: () => {}, sound: () => {}, burst: () => {}, hit: () => {} } as typeof S.fx;
const dropped: Item[] = [];
on('world:drop', (_x: number, _z: number, items: Item[]) => dropped.push(...items));

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const pct = (v: number) => `${v >= 0 ? '+' : ''}${(v * 100).toFixed(0)}%`;

// ---------------------------------------------------------------- hauling pays (the reviewers' route list)
const town = (k: string) => T.sites.find((s) => s.settlement === k)!;
const counter = (k: string, wealth: number, kind = 'general'): Shop => ({ id: 1, kind, faction: town(k).faction!, site: town(k).id, keeper: 0, money: 1e9, restockDay: 0, markup: 0.15 + (1 - wealth) * 0.1, wealth, name: k });
const routes: [string, string, string][] = [];
for (const [from, m] of Object.entries(MARKETS)) for (const id of m.cheap) {
  if (!ITEM[id]) continue;
  for (const [to, m2] of Object.entries(MARKETS)) if (m2.dear.includes(id) || m2.dear.includes(ITEM[id].cat)) routes.push([id, from, to]);
}
const standing = (f: string, v: number) => W.rel.set('player', f, v);
/** Profit on each route, buying at a general store in the cheap town and selling at the best counter in the dear one. */
function margins(rel: number, wealth: number) {
  return routes.map(([id, from, to]) => {
    standing(town(from).faction!, rel); standing(town(to).faction!, rel);
    const b = buyPrice(counter(from, wealth), { id, q: 2 });
    const s = Math.max(...['general', 'tech', 'robotics'].map((kind) => sellPrice(counter(to, wealth, kind), { id, q: 2 })));
    return { id, from, to, b, s, p: (s - b) / b };
  });
}
const summary = (ms: { p: number }[]) => { const ps = ms.map((m) => m.p).sort((a, b) => a - b); return `min ${pct(ps[0])}, median ${pct(ps[ps.length >> 1])}, max ${pct(ps[ps.length - 1])}`; };
const rich0 = margins(0, 1), poor0 = margins(0, 0.35);
const inBand = (ms: { p: number }[]) => ms.filter((m) => m.p >= 0.1 && m.p <= 0.35).length;
check('at standing 0, most cheap->dear hauls pay 10-35% (the richest shops, as reviewed)', inBand(rich0) >= routes.length * 0.7 && rich0.every((m) => m.p <= 0.6),
  `${inBand(rich0)}/${routes.length} in band; ${summary(rich0)}`);
check('...and from the poorest towns too', inBand(poor0) >= routes.length * 0.7 && poor0.every((m) => m.p <= 0.6), `${inBand(poor0)}/${routes.length} in band; ${summary(poor0)}`);
const rich25 = margins(25, 1), rich55 = margins(55, 1), poor55 = margins(55, 0.35);
check('better standing at both ends pays better, never worse', rich25.every((m, i) => m.p >= rich0[i].p) && rich55.every((m, i) => m.p >= rich25[i].p),
  `standing 25: ${summary(rich25)}; standing 55: ${summary(rich55)}`);
check('...but even liked at both ends, no haul pays half as much again: the route matters more than the standing', [...rich55, ...poor55].every((m) => m.p <= 0.5),
  `best at standing 55: ${pct(Math.max(...rich55.map((m) => m.p), ...poor55.map((m) => m.p)))}`);
console.log(`     e.g. ${rich0.slice(0, 3).map((m) => `${m.id} ${m.from}->${m.to}: buy ${m.b}, sell ${m.s} (${pct(m.p)})`).join('; ')}`);

// only from where it is cheap to where it is dear: anything else loses
let wins = 0, tries = 0;
for (const [from, m] of Object.entries(MARKETS)) for (const id of m.cheap) {
  if (!ITEM[id]) continue;
  standing(town(from).faction!, 0);
  const b = buyPrice(counter(from, 1), { id, q: 2 });
  for (const to of Object.keys(MARKETS)) {
    if (to === from || MARKETS[to].dear.includes(id) || MARKETS[to].dear.includes(ITEM[id].cat)) continue;
    standing(town(to).faction!, 0);
    tries++;
    if (sellPrice(counter(to, 1), { id, q: 2 }) > b) wins++;
  }
}
check('carried anywhere that does not want it, a cheap load loses money', wins === 0, `${wins}/${tries} would pay`);

// buying and selling back at the same counter, or another in the same town, never pays
const kinds = ['general', 'bar', 'weapons', 'armour', 'travel', 'construction', 'robotics', 'tech', 'drugs', 'thrum', 'slaves', 'animals', 'mercs', 'temple'];
let worst = 0, worstAt = '';
for (const rel of [-60, 0, 55, 100]) for (const k of [...Object.keys(MARKETS), '']) for (const wealth of [0.35, 1]) {
  const shops = kinds.map((kind): Shop => k ? counter(k, wealth, kind) : { id: 1, kind, faction: 'drifters', site: 0, keeper: 0, money: 1e9, restockDay: 0, markup: 0.15 + (1 - wealth) * 0.1, wealth, name: 'caravan' });
  standing(shops[0].faction, rel);
  for (const d of ITEMS) {
    if (d.value < 5 || d.builtin) continue;
    for (const q of d.graded ? [0, 2, 5] : [2]) {
      const lo = Math.min(...shops.map((sh) => buyPrice(sh, { id: d.id, q }))), hi = Math.max(...shops.map((sh) => sellPrice(sh, { id: d.id, q })));
      if (hi / lo > worst) { worst = hi / lo; worstAt = `${d.id} at ${k || 'a caravan'}, standing ${rel}: ${lo}c to buy, ${hi}c to sell`; }
    }
  }
}
check('no counter, or pair of counters in one town, buys anything back for what it sells it for', worst < 1, `best ratio ${worst.toFixed(2)}: ${worstAt}`);

// relics: a dealer in a town hungry for them pays what it always did (13,920 for a relic core before the haul tuning)
const relicAt = (rel: number) => { standing(town('aurum').faction!, rel); return sellPrice(counter('aurum', 1, 'tech'), { id: 'relic_core', q: 2 }); };
const relic0 = relicAt(0), relic55 = relicAt(55);
check('a relic dealer in a town hungry for relics still pays the ruin-diver\'s price for a relic core', [relic0, relic55].every((v) => Math.abs(v - 13920) <= 13920 * 0.05),
  `${relic0}c at Aurum, ${relic55}c liked there; ${sellPrice(counter('crossroad', 0.45, 'tech'), { id: 'relic_core', q: 2 })}c at a dealer elsewhere`);

// the trade window's hint: where a cheap load sells, and for how much more
for (const k of Object.keys(MARKETS)) standing(town(k).faction!, 0);
const harrow = counter('harrowmarket', 0.8);
const saltTips = dearMarkets({ id: 'salt', q: 2 }, { x: town('harrowmarket').x, z: town('harrowmarket').z, site: town('harrowmarket').id });
const saltCost = buyPrice(harrow, { id: 'salt', q: 2 });
check('the trader can say where salt from Harrowmarket sells for more', saltTips.length > 0 && saltTips[0].price > saltCost && saltTips.every((t) => t.site.id !== town('harrowmarket').id),
  saltTips.length ? `${saltCost}c here, ${saltTips[0].price}c in ${saltTips[0].site.name} (${pct((saltTips[0].price - saltCost) / saltCost)}), ${saltTips.length} towns want it` : 'none');

// a general store keeps its town's surplus
const ctr = W.addObj({ id: 0, kind: 'counter', def: 'counter', x: town('harrowmarket').x, z: town('harrowmarket').z, y: 0, rot: 0, owner: 'harrow', site: town('harrowmarket').id, parent: 0, inv: new Grid(12, 10) });
const store = makeShop(W, ctr.id, 'general', town('harrowmarket').faction!, town('harrowmarket').id, 0, 0.8, 'Test Store');
let surplus = 0;
for (let day = 0; day < 5; day++) {
  S.clock.t = day * DAY + 12 * HOUR;
  restock(store);
  surplus = Math.max(surplus, MARKETS.harrowmarket.cheap.reduce((a, id) => a + (ITEM[id] ? shopGrid(store)!.count(id) : 0), 0));
}
S.clock.t = 12 * HOUR;
check('a general store stocks what its town has too much of', surplus >= 6, `up to ${surplus} of ${MARKETS.harrowmarket.cheap.join(', ')} on the shelf`);
W.shops.delete(ctr.id);
W.removeObj(ctr);

// ---------------------------------------------------------------- one way to pay
W.money = 10000;
standing('concord', 0);
const fine = makeItem('cleaver', 1, 4);
fine.stolen = 'reavers';
const cost = buyPrice(harrow, fine), m0 = W.money, sm0 = harrow.money;
const paid = payForGoods(harrow, fine, 1);
check('a purchase charges the shop price, pays the shop and clears any stolen mark', paid === cost && W.money === m0 - cost && harrow.money === sm0 + cost && !fine.stolen, `${cost}c`);
const rel1 = W.rel.get('player', 'concord');
check('...and earns a little standing for a good customer', Math.abs(rel1 - Math.min(0.2, cost / 1000)) < 1e-9, `+${rel1.toFixed(2)}`);
const bolt = makeItem('bolts', 1);
payForGoods(harrow, bolt, 1);
check('...but none worth farming with trinkets', W.rel.get('player', 'concord') - rel1 <= 0.01 && buyStanding(5) <= 0.005, `+${(W.rel.get('player', 'concord') - rel1).toFixed(4)} for one bolt`);
const val = sellPrice(harrow, fine), m1 = W.money;
check('a sale pays the shop\'s price', payForSale(harrow, fine, 1) === val && W.money === m1 + val, `${val}c`);

// a stolen stack sold onto a shelf with room for only some of it: what stays in the pack stays marked
const till = W.addObj({ id: 0, kind: 'counter', def: 'counter', x: town('crossroad').x, z: town('crossroad').z, y: 0, rot: 0, owner: 'drifters', site: town('crossroad').id, parent: 0, inv: new Grid(4, 2) });
const fence = makeShop(W, till.id, 'general', 'drifters', town('crossroad').id, 0, 0.45, 'Test Counter');
const shelf = shopGrid(fence)!;
shelf.items = [];
const onShelf = makeItem('bandages', 19);
onShelf.stolen = 'concord';
shelf.put(onShelf, 0, 0);
while (shelf.findSpot(ITEM.bandages)) shelf.add('bandages', 20);
const sack = new Grid(4, 4);
const loot = makeItem('bandages', 20);
loot.stolen = 'concord';
sack.put(loot, 0, 0);
const each = sellPrice(fence, loot), m2 = W.money;
const [partSold, partPaid] = sellInto(fence, loot, sack);
check('selling part of a stolen stack leaves the rest marked', partSold === 1 && partPaid === each && W.money === m2 + each && sack.items.includes(loot) && loot.n === 19 && loot.stolen === 'concord' && shelf.items.every((x) => !x.stolen),
  `${partSold} sold for ${partPaid}c, ${loot.n} kept, still marked: ${loot.stolen === 'concord'}`);
shelf.items = [];
const [restSold] = sellInto(fence, loot, sack);
check('...while what reaches the shelf is the shop\'s own, unmarked', restSold === 19 && shelf.items.includes(loot) && !loot.stolen && !sack.items.length);
W.shops.delete(till.id);
W.removeObj(till);

// ---------------------------------------------------------------- a base near Aurum
for (const site of T.sites) {
  if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
  else buildSite(W, T, site, new RNG(hash3(site.seed, 1234, 5)));
}
W.rebuildObjHash();
const aurum = T.sites.find((s) => s.key === 'aurum')!;
const [bx, bz] = nav.nearestOpen(aurum.x - 900, aurum.z + 500, 60)!;
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'B'; W.addSquad(sq); W.playerSquads.push(sq.id);
const rng = new RNG(5);
const spot = (dx: number, dz: number): [number, number] => nav.nearestOpen(bx + dx, bz + dz, 12)!;
const person = (dx: number, dz: number, mine = true) => {
  const c = makePerson(W, { faction: 'drifters', role: 'wanderer', level: 14, whole: true } as any, rng);
  if (mine) { c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, sq); }
  const [x, z] = spot(dx, dz); c.x = x; c.z = z; c.y = T.heightAt(x, z); c.hunger = 250;
  return c;
};
const build = (key: string, dx: number, dz: number) => { const [x, z] = spot(dx, dz); return finishSite(placeSite(BUILDABLE[key], x, z, 0), true); };

// ---------------------------------------------------------------- a full workshop drops only what does not fit
const medic = person(-14, 8);
const bench = build('med_bench', -14, 6);
const job = { k: 'craft' as const, obj: bench.id, label: 'Craft' };
medic.jobs = [job];
medic.x = bench.x + 1; medic.z = bench.z; medic.y = T.heightAt(medic.x, medic.z);
const g = bench.inv!;
g.add('fabric', 2);
g.add('bandages', 19);
while (g.findSpot(ITEM.bandages)) g.add('bandages', 20);
const before = g.count('bandages');
bench.data.queue = [{ r: 'bandages', n: 1 }];
bench.data.recipe = 'bandages';
bench.data.prog = RECIPES.bandages.time - 0.01;
dropped.length = 0;
for (let i = 0; i < 4 && bench.data.queue[0]?.n > 0; i++) JOB_HANDLERS.craft!(medic, job, bench, 0.5, true);
const onGround = dropped.filter((it) => it.id === 'bandages').reduce((a, it) => a + it.n, 0);
check('a workshop with room for part of a batch drops only the rest', g.count('bandages') + onGround === before + 2 && onGround === 1,
  `${before} + 2 made = ${g.count('bandages')} inside + ${onGround} on the ground`);

// ---------------------------------------------------------------- hauled work keeps its grade
const smith = person(0, 0);
const anvil = build('weapon_bench', 4, 0);
const rack = build('gear_box', -6, 0);
W.research.done.add('weapons1');
for (let i = 0; i < 10; i++) anvil.inv!.put(makeItem('cleaver', 1, 5));
anvil.data.queue = [{ r: 'w_cleaver', n: 1 }]; // with nothing to forge it from: only finished blades, all grade 5, can leave
const own = makeItem('cleaver', 1, 1);
smith.inv.put(own); // the smith's own spare, which is no workshop output
const made = new Set(anvil.inv!.items.filter((it) => it.id === 'cleaver').map((it) => it.uid));
smith.jobs = [{ k: 'craft', obj: anvil.id, label: 'Craft' }];
for (let i = 0; i < 1200; i++) { simStep(0.1, { x: bx, z: bz }); tickSquads(0.1); tickBase(0.1); if (rack.inv!.count('cleaver') > 0 && i % 10 === 0) break; }
const racked = rack.inv!.items.filter((it) => it.id === 'cleaver');
check('a grade-5 cleaver carried from the smithy arrives as grade 5, the same blade', racked.length > 0 && racked.every((it) => it.q === 5 && made.has(it.uid)),
  `rack: ${racked.map((it) => `grade ${it.q} #${it.uid}`).join(', ') || 'nothing'}`);
check('...and the smith\'s own spare stays in their pack', smith.inv.items.includes(own) && !racked.some((it) => it.uid === own.uid));

// plain stock (no grade to keep) goes by kind and count: a pack of part-full stacks still carries it
const porter = person(-20, 14);
porter.eq.back = null;
const works = build('med_bench', -20, 12);
const box = build('chest', -26, 14);
works.inv!.add('iron_plates', 12);
works.data.queue = [{ r: 'bandages', n: 1 }]; // nothing to make it from: only the hauling runs
const pjob = { k: 'craft' as const, obj: works.id, label: 'Craft' };
porter.jobs = [pjob];
for (let at = porter.inv.findSpot(ITEM.iron_plates); at; at = porter.inv.findSpot(ITEM.iron_plates)) porter.inv.put(makeItem('iron_plates', 15), at[0], at[1]);
const ownPlates = porter.inv.count('iron_plates');
porter.x = works.x + 1; porter.z = works.z;
JOB_HANDLERS.craft!(porter, pjob, works, 0.5, true);
const carried = porter.brain.haul ? { ...porter.brain.haul } : null;
porter.x = box.x + 1; porter.z = box.z;
JOB_HANDLERS.craft!(porter, pjob, works, 0.5, true);
check('a hauler whose pack is all part-full stacks of plates still hauls plates', carried?.n === 12 && !works.inv!.count('iron_plates') && box.inv!.count('iron_plates') === 12 && porter.inv.count('iron_plates') === ownPlates && !porter.brain.haul,
  `carried ${carried?.n ?? 0}; stored ${box.inv!.count('iron_plates')}; the hauler kept their own ${porter.inv.count('iron_plates')} of ${ownPlates}`);

// a store that fills up on the way: it takes what fits, and the rest goes on to the next store with room
const box2 = build('chest', -32, 14);
for (let at = box.inv!.findSpot(ITEM.bandages); at; at = box.inv!.findSpot(ITEM.bandages)) box.inv!.put(makeItem('bandages', 1), at[0], at[1]);
const inBox = box.inv!.count('iron_plates');
works.inv!.add('iron_plates', 12);
porter.x = works.x + 1; porter.z = works.z;
JOB_HANDLERS.craft!(porter, pjob, works, 0.5, true);
porter.x = box.x + 1; porter.z = box.z;
JOB_HANDLERS.craft!(porter, pjob, works, 0.5, true);
const onward = porter.brain.haul ? { ...porter.brain.haul } : null;
const onTo = onward ? W.objs.get(onward.to) : undefined;
if (onTo) { porter.x = onTo.x + 1; porter.z = onTo.z; JOB_HANDLERS.craft!(porter, pjob, works, 0.5, true); }
const atNext = onTo?.inv?.count('iron_plates') ?? 0;
check('...and when the store fills on the way, the rest goes on to the next store with room', !!onTo && onTo !== box && box.inv!.count('iron_plates') - inBox + atNext === 12 && atNext === onward!.n && porter.inv.count('iron_plates') === ownPlates && !porter.brain.haul,
  `first store took ${box.inv!.count('iron_plates') - inBox}; ${onward?.n ?? 0} went on to ${onTo === box2 ? 'the second chest' : onTo?.kind ?? 'nowhere'}; the hauler kept their own ${porter.inv.count('iron_plates')} of ${ownPlates}`);

// ---------------------------------------------------------------- tearing down lets go of people
const captor = person(10, 10);
const prisoner = person(14, 10, false);
const cage = build('cage', 14, 10);
placeInto(captor, prisoner, cage);
const caged = prisoner.cage === cage.id && cage.occupant === prisoner.id;
deconstruct(cage);
check('tearing down an occupied cage frees its prisoner', caged && !prisoner.cage && !W.objs.has(cage.id) && nav.walkable(prisoner.x, prisoner.z),
  `was caged: ${caged}; now at ${prisoner.x.toFixed(1)}, ${prisoner.z.toFixed(1)}`);
const sleeper = person(10, 16);
const bedroll = build('bedroll', 10, 16);
takeBed(sleeper, bedroll); sleeper.sleeping = true;
const sitter = person(16, 16);
const stool = build('stool', 16, 16);
useObject(sitter, stool);
const sat = sitter.mem.using === stool.id;
deconstruct(bedroll); deconstruct(stool);
check('...and whoever lay in a bed or sat on a stool that is torn down', !sleeper.bed && !sleeper.sleeping && sat && !sitter.mem.using && !sitter.mem.sit);
const shack = build('shack', 26, -14);
const inner = finishSite(placeSite(BUILDABLE.cage, shack.x, shack.z, 0), true);
const prisoner2 = person(26, -14, false);
placeInto(captor, prisoner2, inner);
const inShack = (shack.data.furniture as number[]).includes(inner.id) && prisoner2.cage === inner.id;
deconstruct(shack);
check('...and a cage inside a building torn down', inShack && !prisoner2.cage && !W.objs.has(inner.id), `cage was furniture of the shack: ${inShack}`);

// ---------------------------------------------------------------- relics pay for a tech once
const R = W.research;
for (const k of ['robotics1', 'electronics', 'weapons3', 'machining', 'armour3']) R.done.add(k);
smith.inv.add('relic_core', 3);
const cores = () => countOwned('relic_core');
const c0 = cores();
const e1 = startResearch('robotics2');
const c1 = cores();
const e2 = startResearch('weapons4');
const c2 = cores();
R.progress = 120;
const e3 = startResearch('robotics2');
const c3 = cores();
check('switching research and back charges relics once per tech', !e1 && !e2 && !e3 && c1 === c0 - 1 && c2 === c0 - 2 && c3 === c2 && R.current === 'robotics2' && R.progress === 0,
  `relic cores ${c0} -> ${c1} -> ${c2} -> ${c3}`);
check('...and both stay marked as paid', researchPaid('robotics2') && researchPaid('weapons4'));
// a save from before payments were kept: what is being researched was paid for when it started
W.flags.researchPaid = [];
R.current = 'armour4';
const e4 = startResearch('weapons4');
const c4 = cores();
const e5 = startResearch('armour4');
check('...including a topic started in an older save', !e4 && !e5 && c4 === 0 && cores() === 0 && R.current === 'armour4', `relic cores ${c3} -> ${c4} -> ${cores()}`);
check('...and a tech nobody can pay for is refused', startResearch('robotics2') !== '' && R.current === 'armour4' && cores() === 0, startResearch('robotics2'));
const desk = build('research_bench', -10, -8);
const scholar = person(-10, -6);
scholar.x = desk.x + 1; scholar.z = desk.z; scholar.y = T.heightAt(scholar.x, scholar.z);
R.progress = TECH.armour4.time - 0.01;
JOB_HANDLERS.research!(scholar, { k: 'research', obj: desk.id, label: 'Research' }, desk, 1, false);
check('...and a finished tech leaves the paid list', R.done.has('armour4') && !(W.flags.researchPaid as string[]).includes('armour4'));

// ---------------------------------------------------------------- dialogue: an effect may choose the next node
const es = new Squad(); es.faction = 'ember'; es.kind = 'patrol'; W.addSquad(es);
const officer = makePerson(W, { faction: 'ember', role: 'patrol', race: 'valefolk' } as any, new RNG(2)); W.moveToSquad(officer, es);
const talker = person(0, 4);
talker.look.race = 'valefolk';
talker.inv.add('glowdust', 3);
W.money = 1000;
standing('ember', 100);
const realChance = S.rng.chance;
const talk = (n: Char): [Tree, string, DCtx] => { const [tree, start] = treeFor(n, talker); return [tree, start, { p: talker, n, vars: {} }]; };
const pick = (tree: Tree, node: string, ctx: DCtx, text: string): DChoice | undefined => tree[node].ch?.find((c) => (!c.if || c.if(ctx)) && say(c.t, ctx).includes(text));
S.rng.chance = () => true; // the officer takes it
officer.brain.inspect = true;
let [tree, start, ctx] = talk(officer);
const bribe = pick(tree, start, ctx, 'gift')!;
const next = choose(tree, bribe, ctx);
check('a bribe the officer takes ends the inspection: no search', next === 'bribed' && W.money === 700 && talker.inv.count('glowdust') === 3 && !!es.flags.settled,
  `-> ${next}: "${next ? say(tree[next].t, ctx) : ''}", ${W.money} chits left, ${talker.inv.count('glowdust')} glowdust kept`);
check('...and the conversation closes from there', choose(tree, tree.bribed.ch![0], ctx) === null);
S.rng.chance = () => false; // this one keeps the chits and searches twice as hard
officer.brain.inspect = true;
[tree, start, ctx] = talk(officer);
const refused = choose(tree, pick(tree, start, ctx, 'gift')!, ctx);
check('a bribe refused still leads to the search', refused === 'caught' && choose(tree, tree.caught.ch![0], ctx) === 'search' && ctx.vars.thorough === true);
S.rng.chance = realChance;
officer.brain.inspect = true;
[tree, start, ctx] = talk(officer);
check('choices whose effect returns \'end\' still close the conversation', choose(tree, pick(tree, start, ctx, 'Fight')!, ctx) === null);
const keeper = makePerson(W, { faction: 'drifters', role: 'shopkeeper' } as any, new RNG(3));
keeper.shop = '1';
[tree, start, ctx] = talk(keeper);
check('...like opening a shop', choose(tree, pick(tree, start, ctx, 'Show me')!, ctx) === null);

// ---------------------------------------------------------------- paying a bounty
const gs = new Squad(); gs.faction = 'concord'; gs.kind = 'guard'; W.addSquad(gs);
const guard = makePerson(W, { faction: 'concord', role: 'guard' } as any, new RNG(4)); W.moveToSquad(guard, gs);
W.money = 5000;
for (const amount of [20, 150, 299, 1500]) {
  standing('concord', 10);
  crime(talker, 'trespass', 'concord', amount, false);
  [tree, start, ctx] = talk(guard);
  const pay = pick(tree, start, ctx, 'Pay the');
  if (pay) choose(tree, pay, ctx);
  const after = W.rel.get('player', 'concord');
  check(`paying a ${amount}-chit bounty never leaves you better liked than before the crime`, !!pay && !talker.bounty.concord && after <= 10, `standing 10 -> ${after.toFixed(2)}`);
}

// ---------------------------------------------------------------- a weapon falls from armless hands
const armless = (packFull: boolean) => {
  const c = person(4, 8);
  c.eq.back = null;
  if (packFull) for (let i = 0; i < 200 && c.inv.findSpot(ITEM.cleaver); i++) c.inv.add('bandages', 20);
  const w = makeItem('cleaver', 1, 4);
  c.eq.weapon = w;
  severLimb(c, LI.larm); severLimb(c, LI.rarm);
  dropped.length = 0;
  tickHealth(c, 0.1);
  return { c, w };
};
let r = armless(true);
check('a weapon dropped by someone who lost both arms lands on the ground when the pack is full', !r.c.eq.weapon && dropped.includes(r.w) && r.w.q === 4, `${dropped.length} item(s) on the ground`);
r = armless(false);
check('...and goes into the pack, the same blade, when there is room', !r.c.eq.weapon && r.c.inv.items.includes(r.w) && !dropped.length);

const failed = results.filter((x) => !x[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
