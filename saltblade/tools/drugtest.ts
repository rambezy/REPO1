// Headless check of the drug trade: doses that lift and then crash, painkillers
// that keep you standing, habits that grow and fade, cravings that take what's
// in the pack, raw crops that do less (and turn the stomach), crops that each
// want their own ground, the lab's recipes, bandits who take redrage as a fight
// starts, and the Covenant: witnesses, road searches, smuggler packs, the
// evidence chest, fines, bribes and bounties.
// Usage: npx tsx tools/drugtest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR, DAY } from '../src/sim/clock';
import { RNG, hash3 } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { structuresIn, townRings } from '../src/sim/structures';
import { buildTown } from '../src/world/towns';
import { SETTLEMENT } from '../src/content/layout';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import { koThreshold, tickHealth } from '../src/sim/health';
import { SK } from '../src/sim/skills';
import { takeDrug, tickDrugs, drugStatus, highLevel, DRUG } from '../src/sim/drugs';
import { wantsToInspect, contraband, search } from '../src/sim/inspect';
import { treeFor, choose, type DCtx } from '../src/sim/dialogue';
import { cropFitness, tickBase } from '../src/sim/base';
import { RECIPES, BUILDABLE, TECH } from '../src/content/buildables';
import { ITEM } from '../src/content/items';
import { makeItem } from '../src/sim/inventory';
import type { Char } from '../src/sim/char';

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(51), time: 0 });
S.clock.t = 12 * HOUR;
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const notices: string[] = [], said: string[] = [];
S.fx = { ...S.fx, notice: (t: string) => { notices.push(t); }, say: (_c: Char, t: string) => { said.push(t); }, sound: () => {}, burst: () => {}, hit: () => {} } as typeof S.fx;
for (const site of T.sites) if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
W.rebuildObjHash();

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const rng = new RNG(9);
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Runners'; W.addSquad(sq); W.playerSquads.push(sq.id);
const far = T.sites.find((s) => s.kind === 'town' && s.settlement === 'crossroad') ?? T.sites.find((s) => s.kind === 'town')!;
const [bx, bz] = nav.nearestOpen(far.x + 420, far.z + 60, 80)!;
const mine = (dx: number, dz: number, x = bx, z = bz): Char => {
  const c = makePerson(W, { faction: 'drifters', role: 'wanderer', race: 'valefolk', level: 20, whole: true }, rng);
  c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, sq);
  const p = nav.nearestOpen(x + dx, z + dz, 10)!; c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z);
  c.inv.items.length = 0;
  if (c.eq.back?.inv) c.eq.back.inv.items.length = 0;
  c.sk[SK.toughness] = 10;
  return c;
};
const dose = (c: Char, id: string) => { c.inv.add(id, 1); const it = c.inv.items.find((i) => i.id === id)!; return takeDrug(c, c.inv, it); };
const pass = (hours: number, c: Char) => { for (let i = 0; i < hours * 10; i++) { S.clock.t += HOUR / 10; tickDrugs(c, HOUR / 10 / 36); } };

// ---------------------------------------------------------------- a dose: the lift, then the crash
const a = mine(0, 0);
const ath0 = a.skill('athletics'), dex0 = a.skill('dexterity'), run0 = a.moveSpeed('run');
dose(a, 'glowdust');
check('glowdust lifts: quick feet, sharp eyes, a faster run', a.skill('athletics') - ath0 === DRUG.glowdust.lift.athletics && a.skill('dexterity') > dex0 && a.moveSpeed('run') > run0 * 1.1, `athletics ${ath0.toFixed(0)} -> ${a.skill('athletics').toFixed(0)}, run ${run0.toFixed(2)} -> ${a.moveSpeed('run').toFixed(2)} m/s`);
pass(0.3, a);
check('...and the world swims while it lasts', highLevel(a) > 0.4 && drugStatus(a).some((s) => s.kind === 'high'), highLevel(a).toFixed(2));
pass(4, a);
check('when it wears off there is a crash', a.skill('dexterity') < dex0 && a.moveSpeed('run') < run0 && drugStatus(a).some((s) => s.kind === 'crash') && notices.some((n) => /coming down/.test(n)), `dexterity ${a.skill('dexterity').toFixed(0)}`);
pass(4, a);
check('...and then it is over', Math.abs(a.skill('dexterity') - dex0) < 1e-6 && !a.mem.high);

// ---------------------------------------------------------------- painkillers
const b = mine(2, 0);
const ko0 = koThreshold(b, 1);
dose(b, 'redrage');
check('redrage keeps them standing well past where they would drop, and hits harder', koThreshold(b, 1) < ko0 - b.body.max[1] * 0.3 && b.skill('strength') > 15, `KO at ${ko0.toFixed(0)} -> ${koThreshold(b, 1).toFixed(0)}`);
b.body.hp[1] = ko0 - 5; // past where they'd have dropped sober
tickHealth(b, 0.1);
check('...a blow that would have knocked them out leaves them on their feet', b.status === 'up');

// ---------------------------------------------------------------- habits
const h = mine(4, 0);
for (let i = 0; i < 4; i++) { dose(h, 'glowdust'); pass(8, h); }
const habit = h.mem.habit?.glowdust ?? 0;
check('four doses of glowdust make a habit', habit >= 30, `habit ${habit.toFixed(0)}`);
const dexH = h.skill('dexterity');
pass(18, h);
check('left unfed for most of a day, a habit turns to craving: shaking hands, bad eyes', h.mem.craving === 'glowdust' && h.skill('dexterity') < dexH && notices.some((n) => /craving glowdust/.test(n)), `dexterity ${dexH.toFixed(0)} -> ${h.skill('dexterity').toFixed(0)}`);
dose(h, 'glowdust');
check('a dose ends the craving', !h.mem.craving);
const npc = makePerson(W, { faction: 'scorched', role: 'bandit', race: 'valefolk', level: 25, whole: true }, rng);
npc.mem.habit = { glowdust: 70 }; npc.mem.fed = { glowdust: S.clock.t - 20 * HOUR };
npc.inv.items.length = 0; npc.inv.add('glowdust', 2);
pass(3, npc);
check('a hooked bandit feeds the craving from their own pack', npc.inv.count('glowdust') === 1 && !!npc.mem.high?.glowdust, `${npc.inv.count('glowdust')} left`);
const quit = mine(6, 0);
quit.mem.habit = { redrage: 45 }; quit.mem.fed = { redrage: S.clock.t };
pass(24 * 12, quit);
check('a habit fades over days without', (quit.mem.habit?.redrage ?? 0) < 30 && !quit.mem.craving, `${(quit.mem.habit?.redrage ?? 0).toFixed(0)} after twelve days`);
const junk = mine(8, 0);
junk.mem.habit = { dreamleaf: 80 }; junk.mem.fed = { dreamleaf: S.clock.t - 20 * HOUR };
junk.inv.add('dreamsmoke', 3);
notices.length = 0;
pass(6, junk);
check('your own people hold out for a while, but a bad habit wins in the end', junk.inv.count('dreamsmoke') < 3 && notices.some((n) => /couldn't hold out/.test(n)));

// ---------------------------------------------------------------- raw crops
const r = mine(10, 0);
r.hunger = 200;
dose(r, 'glowcap');
check('a raw glowcap lifts a little and turns the stomach', r.hunger <= 140 && r.skill('perception') > r.base('perception') && (r.mem.habit?.glowdust ?? 0) < DRUG.glowdust.hook, notices.find((n) => /stomach/.test(n)) ?? '');
const m = mine(12, 0);
m.sk[SK.robotics] = 0;
m.body.robotic = true;
check('machines get nothing from it', dose(m, 'redrage') !== null && !m.mem.high);
m.body.robotic = false;

// ---------------------------------------------------------------- growing and making
const reg = (k: string) => T.regions?.find?.((x: any) => x.key === k);
const fit = (crop: string, fert: number, wet: number) => cropFitness(crop, fert, wet);
check('each drug crop wants its own ground: leaf the wet, thorn the dry, caps the damp and poor',
  fit('dreamleaf', 0.8, 1) > fit('dreamleaf', 0.3, 0.35) && fit('bloodthorn', 0.3, 0.35) > fit('bloodthorn', 0.8, 1) && fit('glowcap', 0.2, 0.9) > fit('glowcap', 0.95, 0.2));
void reg;
const cap = W.addObj({ id: 0, kind: 'farm', def: 'glowcap', x: bx + 60, z: bz, y: T.heightAt(bx + 60, bz), rot: 0, owner: 'player', site: 0, parent: 0, data: { crop: 'glowcap', growth: 0, w: 10, d: 6, tended: 1e12 } });
const grow = (hour: number) => { cap.data.growth = 0; S.clock.t = Math.floor(S.clock.t / DAY) * DAY + DAY + hour * HOUR; for (let i = 0; i < 40; i++) tickBase(3); return cap.data.growth; };
const night = grow(1), day = grow(12);
check('glowcaps grow fastest in the dark', night > day * 1.8, `${(night * 100).toFixed(2)}% by night against ${(day * 100).toFixed(2)}% by day`);
W.removeObj(cap);
check('the drug lab cures, grinds and boils, once Narcotics is known', !!TECH.narcotics && ['dreamsmoke', 'glowdust', 'redrage'].every((k) => RECIPES[k]?.research === 'narcotics' && BUILDABLE.druglab.recipes!.includes(k)) && ['farm_dreamleaf', 'farm_glowcap', 'farm_bloodthorn'].every((k) => BUILDABLE[k]?.research === 'narcotics'));
check('what the lab makes is worth more than what went in', ITEM.glowdust.value > ITEM.glowcap.value * 4 && ITEM.dreamsmoke.value * 2 > ITEM.dreamleaf.value * 3 && ITEM.redrage.value > ITEM.bloodthorn.value * 3 + ITEM.grog.value);

// ---------------------------------------------------------------- a bandit takes redrage as the fight starts
const [fx, fz] = nav.nearestOpen(bx - 300, bz + 200, 60)!;
const victim = mine(0, 0, fx, fz);
victim.combatMode = 'passive';
victim.body.max.forEach((v, l) => { victim.body.max[l] = v * 20; victim.body.hp[l] = victim.body.max[l]; });
const rsq = new Squad(); rsq.faction = 'reavers'; rsq.kind = 'raid'; rsq.name = 'Reavers'; W.addSquad(rsq);
rsq.spoke = true; rsq.flags.settled = 0; // past talking
const raiders: Char[] = [];
for (let k = 0; k < 5; k++) {
  const raider = makePerson(W, { faction: 'reavers', role: 'bandit', race: 'valefolk', level: 20, whole: true }, rng);
  W.moveToSquad(raider, rsq);
  const rp = nav.nearestOpen(fx + 6 + k, fz + k - 2, 10)!; raider.x = rp[0]; raider.z = rp[1]; raider.y = T.heightAt(raider.x, raider.z);
  raider.inv.items.length = 0; raider.inv.add('redrage', 1);
  raiders.push(raider);
}
said.length = 0;
for (let i = 0; i < 200 && raiders.some((r) => !r.brain.foe); i++) { simStep(0.1, { x: fx, z: fz }); tickSquads(0.1); }
const raged = raiders.filter((r) => !!r.mem.high?.redrage && r.inv.count('redrage') === 0).length;
check('Reavers down their redrage as the fight starts (most of the time), and say so', raged >= 3 && said.some((t) => /NOTHING|COME ON|Red in the blood|feel a thing|arms off/.test(t)), `${raged}/5; ${said.find((t) => /!/.test(t)) ?? 'said nothing'}`);
for (const r of raiders) W.removeChar(r);

// ---------------------------------------------------------------- the Covenant
const ember = T.sites.find((s) => s.kind === 'town' && SETTLEMENT[s.settlement!]?.faction === 'ember')!;
const [ex, ez] = nav.nearestOpen(ember.x, ember.z, 40)!;
const runner = mine(0, 0, ex, ez);
const guard = makePerson(W, { faction: 'ember', role: 'guard', race: 'valefolk', level: 30, whole: true }, rng);
const gp = nav.nearestOpen(ex + 2, ez, 6)!; guard.x = gp[0]; guard.z = gp[1]; guard.y = T.heightAt(guard.x, guard.z);
for (let i = 0; i < 12; i++) simStep(0.1, { x: ex, z: ez }); // the watch is about (and woken, and in the world's index)
guard.dir = Math.atan2(runner.x - guard.x, runner.z - guard.z);
runner.inv.add('dreamsmoke', 1);
const smoke = runner.inv.items.find((i) => i.id === 'dreamsmoke')!;
takeDrug(runner, runner.inv, smoke);
check('lighting up in front of the Covenant watch is a crime', (runner.bounty.ember ?? 0) > 0, `bounty ${runner.bounty.ember ?? 0}`);
runner.bounty = {};
W.removeChar(guard);

const patrol = makePerson(W, { faction: 'ember', role: 'patrol', race: 'valefolk', level: 30, whole: true }, rng);
const psq = new Squad(); psq.faction = 'ember'; psq.kind = 'patrol'; psq.name = 'Covenant patrol'; W.addSquad(psq); W.moveToSquad(patrol, psq); psq.leader = patrol.id;
patrol.x = runner.x + 2; patrol.z = runner.z; patrol.y = runner.y;
check('a Covenant patrol on the road stops you to search', wantsToInspect(patrol, psq));
runner.bounty = { ember: 500 };
check('...unless you are wanted: then it is the sword', !wantsToInspect(patrol, psq));
runner.bounty = {};
runner.inv.add('glowdust', 3);
runner.eq.back = makeItem('smuggler_pack');
runner.eq.back.inv!.add('redrage', 2);
const cb = contraband('ember', runner);
check('the search finds what is in the pockets, and knows what sits in a smuggler pack', cb.some((x) => x.it.id === 'glowdust' && !x.hidden) && cb.some((x) => x.it.id === 'redrage' && x.hidden));
search(patrol); // (clears the pockets)
let hidden = 0;
for (let i = 0; i < 200; i++) {
  runner.eq.back.inv!.items.length = 0; runner.eq.back.inv!.add('redrage', 1);
  const res = search(patrol);
  if (!res.found.length) hidden++;
}
check('a smuggler pack hides most of what is in it', hidden >= 110 && hidden < 190, `${hidden}/200 searches missed it`);
runner.eq.back.inv!.items.length = 0; runner.eq.back.inv!.add('redrage', 1);
const thorough = search(patrol, true);
check('...but not from a search after a bribe gone wrong', thorough.found.some(([id]) => id === 'redrage'));
// the whole stop, as it plays out
runner.inv.add('glowdust', 2);
psq.flags = {};
patrol.brain.inspect = true;
const [tree, start] = treeFor(patrol, runner);
const ctx: DCtx = { p: runner, n: patrol, vars: {} };
const go = (key: string, pick: RegExp) => {
  const node = tree[key];
  node.fx?.(ctx);
  const ch = (node.ch ?? []).filter((c) => !c.if || c.if(ctx)).find((c) => pick.test(typeof c.t === 'function' ? c.t(ctx) : c.t));
  return ch ? choose(tree, ch, ctx) : null;
};
check('the patrol leader\'s words are an inspection', tree === treeFor(Object.assign(patrol, { brain: { ...patrol.brain, inspect: true } }), runner)[0] && start === 'start');
W.money = 5000;
const next = go(start, /Search us/);
const found = next ? (tree[next].fx?.(ctx), ctx.vars.fine) : 0;
const money0 = W.money;
const pay = (tree[next!].ch ?? []).find((c) => /Pay the/.test(typeof c.t === 'function' ? c.t(ctx) : c.t));
if (pay) choose(tree, pay, ctx);
check('they take the dust and fine you more than half its worth', runner.inv.count('glowdust') === 0 && found >= ITEM.glowdust.value * 2 * 0.6 && W.money === money0 - found, `fine ${found}`);
// broke, in a Covenant town: the goods go to the watch house, and you owe the Ember
runner.inv.add('dreamsmoke', 4);
W.money = 0;
patrol.x = ex; patrol.z = ez;
const ctx2: DCtx = { p: runner, n: patrol, vars: {} };
tree.search.fx!(ctx2);
const owe = (tree.search.ch ?? []).find((c) => (!c.if || c.if(ctx2)) && /can't pay/.test(typeof c.t === 'function' ? c.t(ctx2) : c.t));
if (owe) choose(tree, owe, ctx2);
let inChest = 0;
for (const o of W.objs.values()) if (o.data?.name === 'Confiscated goods' && o.inv) inChest += o.inv.count('dreamsmoke');
check('in a Covenant town the goods go in the watch house chest', ctx2.vars.chest && inChest === 4, `${inChest} dreamsmoke in the chest`);
check('...and those who cannot pay carry a bounty', (runner.bounty.ember ?? 0) > 0, `bounty ${runner.bounty.ember ?? 0}`);

const failed = results.filter((x) => !x[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
