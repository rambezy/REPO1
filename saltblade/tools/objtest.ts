// Headless check of the objective tracker: every start's chain is well formed;
// a save from before the tracker has none; the Wanderer chain completes off
// real happenings (walking into Crossroad, the barkeep, a sale, a swung pick,
// ore sold, a bandage, a recruit, a knockout) and ends with the outro; the
// rest of the triggers (the claim, the pit, the shackles, the ash) fire on
// what they watch and not before; and the things that must not count (a
// recruit's old fights, a bought house, a bounty wiped by a jailer, a coin
// sound that is no sale, a cannibal village) do not. Progress survives a save
// round trip, and a reward with no room in the packs lands at your feet. With
// the goals done, or in a save that never had any, the tracker keeps one Next
// line (the journal's current goal), which its × hides with the rest.
// Usage: npx tsx tools/objtest.ts
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
import { populateTown } from '../src/sim/populate';
import { recruit } from '../src/sim/dialogue';
import { payForGoods, payForSale, buyInto, sellInto, shopGrid } from '../src/sim/shops';
import { tickRunaways, tickStealth, ESCAPE_M, SNEAK_QUIET } from '../src/sim/crime';
import { wantsFight, beatableNear, spawn, SPECS } from '../src/sim/worldsim';
import { makeItem } from '../src/sim/inventory';
import { markHousesForSale, buyHouse } from '../src/sim/property';
import { serialize, apply } from '../src/sim/save';
import { emit, on } from '../src/core/events';
import { LI } from '../src/sim/body';
import { SCENARIOS } from '../src/content/scenarios';
import { OBJECTIVES, Trigger } from '../src/content/objectives';
import { withKeys, keymap } from '../src/core/keys';
import { beginObjectives, setupObjectives, tickObjectives, objectiveView, trackerNext, hideTracker, reachPoint } from '../src/ui/objectives';
import { currentGoal } from '../src/sim/contracts';
import type { Char } from '../src/sim/char';

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(77), time: 0 });
S.clock.t = DAY + 7.5 * HOUR;
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const notices: string[] = [];
const dropped: any[][] = [];
on('world:drop', (_x: number, _z: number, items: any[]) => { dropped.push(items); });
S.fx = { ...S.fx, notice: (t: string) => { notices.push(t); }, say: () => {}, sound: () => {}, burst: () => {}, hit: () => {}, shot: () => {}, died: () => {}, ko: () => {} } as typeof S.fx;
for (const site of T.sites) if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
for (const o of T.ores) W.addObj({ id: 0, kind: 'ore', def: o.kind, x: o.x, z: o.z, y: o.y, rot: o.rot, owner: '', site: 0, parent: 0, data: { left: 300, size: o.size } });
W.rebuildObjHash();

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const rng = new RNG(9);
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Nameless'; W.addSquad(sq); W.playerSquads.push(sq.id);
const crossroad = T.sites.find((s) => s.kind === 'town' && s.settlement === 'crossroad')!;
populateTown(W, W.towns.get(crossroad.id)!); // its keepers, drinkers and guards
const mine = (x: number, z: number, level = 8): Char => {
  const c = makePerson(W, { faction: 'drifters', role: 'wanderer', race: 'valefolk', level, loadout: 'drifters_wanderer', whole: true }, rng);
  c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, sq);
  const p = nav.nearestOpen(x, z, 20) ?? [x, z]; c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z);
  c.inv.items.length = 0;
  if (c.eq.back?.inv) c.eq.back.inv.items.length = 0;
  return c;
};
const put = (c: Char, x: number, z: number) => {
  const spot = nav.nearestOpen(x, z, 20) ?? [x, z];
  c.x = spot[0]; c.z = spot[1]; c.y = T.heightAt(c.x, c.z); c.path = null; c.hasGoal = false;
  // the rest of the band keeps up (a goal about where you are is about all of you)
  W.playerChars().forEach((o, i) => { if (o !== c && o.alive) { o.x = c.x + (i % 3) + 1; o.z = c.z + Math.floor(i / 3); o.y = c.y; o.path = null; o.hasGoal = false; } });
};
const dt = 0.1;
const step = (secs: number, c: Char) => { for (let i = 0; i < secs / dt; i++) { simStep(dt, { x: c.x, z: c.z }); tickSquads(dt); } };
const open = () => objectiveView()?.open.map((g) => g.key) ?? [];
const done = () => objectiveView()?.done.map((g) => g.key) ?? [];
const tick = (n = 1) => { for (let i = 0; i < n; i++) tickObjectives(); };
/** What tools/objtest.ts knows how to check: every trigger kind the content uses must be one of these. */
const KINDS: Trigger['k'][] = ['reach', 'talk', 'deal', 'sell', 'buy', 'sell_ore', 'mine', 'bandage', 'clot', 'eat', 'recruit', 'win', 'loot', 'build', 'farm', 'unshackle', 'sneak', 'escape', 'salvage', 'repair', 'bounty', 'clear_bounty', 'arena', 'money', 'road'];
setupObjectives();

// ---------------------------------------------------------------- every start has a chain, and the chains are sound
{
  const missing = SCENARIOS.filter((s) => !OBJECTIVES[s.key]).map((s) => s.key);
  check('every start has a chain of first goals', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : `${SCENARIOS.length} starts`);
  const sizes = Object.entries(OBJECTIVES).map(([k, s]) => `${k} ${s.goals.length}`);
  check('each chain has five to eight goals', Object.values(OBJECTIVES).every((s) => s.goals.length >= 5 && s.goals.length <= 8), sizes.join(', '));
  check('goal keys are unique within a chain', Object.values(OBJECTIVES).every((s) => new Set(s.goals.map((g) => g.key)).size === s.goals.length));
  const unknown = Object.values(OBJECTIVES).flatMap((s) => s.goals.map((g) => g.when.k)).filter((k) => !KINDS.includes(k));
  check('every trigger is one the tracker checks', unknown.length === 0, unknown.length ? `unknown: ${[...new Set(unknown)].join(', ')}` : `${KINDS.length} kinds`);
  // a key named in a goal (or a start's first steps) is the one bound, not a letter written in
  const texts = [...Object.values(OBJECTIVES).flatMap((s) => s.goals.flatMap((g) => [g.text, g.done])), ...SCENARIOS.map((s) => s.firstSteps ?? '')];
  const fixed = texts.filter((t) => /\([A-Z]\)/.test(t) || /[{}]/.test(withKeys(t)));
  keymap.set('sneak', ['y']);
  const rebound = withKeys('Sneak ({sneak})');
  keymap.set('sneak', ['t']);
  check('goals name keys as the player has them bound, never a fixed letter', fixed.length === 0 && rebound === 'Sneak (Y)' && withKeys('Sneak ({sneak})') === 'Sneak (T)', fixed.length ? fixed.join(' | ') : `rebound: ${rebound}`);
  check('every goal has text, an acknowledgement, and every chain an outro', Object.values(OBJECTIVES).every((s) => s.outro.length > 10 && s.goals.every((g) => g.text.length > 3 && g.done.length > 10)));
}

// ---------------------------------------------------------------- a save from before the tracker: nothing to show, nothing written
{
  const before = JSON.stringify(W.flags);
  tick(3);
  check('a game without objective state has no chain of goals', objectiveView() === null);
  check('...and ticking it writes nothing into the save', JSON.stringify(W.flags) === before);
}

// ---------------------------------------------------------------- the Wanderer chain, start to finish
const p = mine(crossroad.x + 300, crossroad.z + 60);
p.inv.add('dried_meat', 3); p.inv.add('bandages', 2);
beginObjectives('wanderer');
tick();
check('a new Wanderer game opens with eight goals, none done', open().length === 8 && done().length === 0, open().join(', '));

// reach
put(p, crossroad.x + crossroad.r + 60, crossroad.z);
tick();
check('standing well outside Crossroad does not count as reaching it', open().includes('reach'));
put(p, crossroad.x + crossroad.r + 4, crossroad.z);
tick();
check('walking up to Crossroad completes "Reach Crossroad"', done().includes('reach'), `${Math.hypot(p.x - crossroad.x, p.z - crossroad.z).toFixed(0)} m from the centre, r ${crossroad.r}`);

// talk
const keeper = [...W.chars.values()].find((c) => c.role === 'shopkeeper' && c.site === crossroad.id)!;
const barkeep = [...W.chars.values()].find((c) => c.role === 'barkeep' && c.site === crossroad.id)!;
emit('ui:talk', p.id, keeper.id);
check('talking to a shopkeeper is not talking to the barkeep', open().includes('barkeep'));
emit('ui:talk', p.id, barkeep.id);
check('talking to the barkeep completes the goal', done().includes('barkeep'), barkeep.name);

// a sale: chits move from a shop's till into the purse
const shop = [...W.shops.values()].find((s) => s.site === crossroad.id && s.money > 200)!;
tick();
W.money += 25; // chits found on a body: the loot window's coin sound, not a sale
emit('sound', 'coin', p.x, p.z, 1);
check('taking chits off a body is not a sale', open().includes('deal'));
tick();
p.inv.add('dried_meat', 1);
tick();
{ const it = p.inv.items.find((i) => i.id === 'dried_meat')!; p.inv.remove(it); payForSale(shop, it, it.n); }
check('selling to a shop completes "Buy or sell something"', done().includes('deal'), `${shop.name}, ${W.money}c`);

// mine: a swung pick at the nearest rock
const rock = [...W.objs.values()].filter((o) => o.kind === 'ore').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0]!;
put(p, rock.x + 2.5, rock.z);
p.jobs.unshift({ k: 'mine', obj: rock.id, label: 'Mine' });
let t = 0;
while (p.act !== 'mine' && t < 120) { step(1, p); t++; tick(); }
check('swinging a pick at a rock completes "Mine some ore"', p.act === 'mine' && done().includes('mine'), `${rock.def} after ${t} s`);
while (!p.inv.count('iron_ore') && !p.inv.count('copper_ore') && !p.inv.count('stone') && t < 400) { step(1, p); t++; }
p.jobs.length = 0; p.act = null;
const oreId = ['iron_ore', 'copper_ore', 'stone'].find((id) => p.inv.count(id)) ?? (p.inv.add('iron_ore', 2), 'iron_ore');
tick();
payForSale(shop, makeItem('bandages', 1, 2), 1); // selling something else does not sell the ore
check('selling something that is not ore leaves "Sell the ore" open', open().includes('sell_ore'));
tick();
p.inv.add(oreId, 2);
const oreHad = p.inv.count(oreId);
{ const it = p.inv.items.find((i) => i.id === oreId)!; sellInto(shop, it, p.inv, 1); } // a right-click sells one
check('selling one of the ore you dug completes "Sell the ore"', done().includes('sell_ore') && p.inv.count(oreId) === oreHad - 1, `${oreId}, ${p.inv.count(oreId)} of ${oreHad} kept`);

// bandage: a cut arm, treated by the only pair of hands around
p.body.hp[LI.larm] -= 25; p.body.bleed[LI.larm] = 0.12;
const bandages0 = p.inv.count('bandages');
p.order = { k: 'aid', id: p.id };
t = 0;
while (p.body.treated[LI.larm] <= 0 && t < 60) { step(1, p); t++; }
tick();
check('bandaging a wound completes "Bandage a wound"', p.body.treated[LI.larm] > 0 && done().includes('bandage'), `treated ${p.body.treated[LI.larm].toFixed(2)} after ${t} s`);
check('...and the goal\'s reward lands in the pack', p.inv.count('bandages') + (p.eq.back?.inv?.count('bandages') ?? 0) >= bandages0 - 1 + 2, `${bandages0} -> ${p.inv.count('bandages')} bandages`);

// recruit: a drinker in the bar
const drinker = [...W.chars.values()].find((c) => c.recruitable && c.site === crossroad.id && !c.cage)!;
const stool = drinker.mem.using ? W.objs.get(drinker.mem.using) : undefined;
const posed = `${drinker.mem.sit ? 'sitting' : 'standing'}${stool ? ` at a ${stool.def ?? stool.kind}` : ''}${drinker.act ? `, ${drinker.act}` : ''}`;
recruit({ p, n: drinker, vars: {} });
tick();
check('a recruit completes "Recruit someone"', done().includes('recruit'), drinker.name);
check('...and gets up from the bar to follow: off the stool, out of their pose', !drinker.mem.using && !drinker.mem.sit && drinker.act === null && (!stool || stool.user !== drinker.id), `was ${posed}`);

// win: a starveling who picked the wrong wanderer
const foe = makePerson(W, { faction: 'starvelings', role: 'bandit', level: 3, whole: true }, rng);
const fs = new Squad(); fs.faction = 'starvelings'; fs.kind = 'raid'; fs.name = 'Starvelings'; W.addSquad(fs); W.moveToSquad(foe, fs);
put(p, crossroad.x + crossroad.r + 120, crossroad.z + 40);
put(foe, p.x + 2.5, p.z);
for (let l = 0; l < 3; l++) foe.body.hp[l] = 3;
foe.brain.enemy = p.id;
p.order = { k: 'attack', id: foe.id };
t = 0;
while (foe.up && t < 300) { step(1, p); t++; tick(); }
const kos = W.playerChars().reduce((n, c) => n + c.stats.kos, 0); // whoever of the band landed it
check('knocking out a bandit completes "Win a fight"', !foe.up && kos > 0 && done().includes('win'), `${foe.name} ${foe.status} after ${t} s, ${kos} KO${kos === 1 ? '' : 's'} for the band`);
check('with every goal done the chain is finished and the outro is in the journal', !!objectiveView()?.finished && W.log.some((l) => /on your own now/.test(l.text)), `${done().length}/8`);
check('...and said out loud, once', notices.filter((n) => /on your own now/.test(n)).length === 1);

// ---------------------------------------------------------------- the goals done: what to do next
{
  const next = trackerNext(), goal = currentGoal();
  check('with the goals done the tracker keeps one line: what to do next, as the journal has it', !!next && !!goal && next.text === goal.text && !!next.where && !!next.entry, next ? `${next.entry}: ${next.text}` : 'nothing');
  const chain = W.flags.objectives;
  delete W.flags.objectives;
  const old = trackerNext();
  check('...and so does a save from before the goals', !!old && old.text === goal?.text && objectiveView() === null, old?.text);
  hideTracker();
  const W2 = new World(); apply(JSON.parse(JSON.stringify(serialize())), W2);
  check('...until its × hides it for the game, and the save remembers', trackerNext() === null && W.flags.nextHidden === true && W2.flags.nextHidden === true);
  delete W.flags.nextHidden;
  W.flags.objectives = chain;
  chain.hidden = true;
  check('...and hiding a chain hides its Next line with it', trackerNext() === null && objectiveView()?.hidden === true);
  delete chain.hidden;
}

// ---------------------------------------------------------------- it all survives a save
{
  const data = JSON.parse(JSON.stringify(serialize()));
  const W2 = new World();
  apply(data, W2);
  const st = W2.flags.objectives;
  check('objective progress is saved with the game', !!st && st.set === 'wanderer' && Object.keys(st.done).length === 8 && !!st.finished, st ? `${Object.keys(st.done).length} done` : 'no state');
}

// ---------------------------------------------------------------- the other triggers, on what they watch and not before
const fresh = (set: string) => {
  for (const k of Object.keys(W.flags)) if (['objectives', 'escaped', 'salvaged', 'bounties', 'bout', 'pitWins'].includes(k)) delete W.flags[k];
  // everyone healed of bleeding, free, and gathered at the lead, so each chain starts from the same footing
  W.playerChars().forEach((c, i) => { c.body.bleed.fill(0); c.cage = 0; c.shackled = false; delete c.mem.enslavedBy; if (i) { c.x = p.x + i; c.z = p.z; c.y = p.y; c.path = null; c.hasGoal = false; } });
  beginObjectives(set); tick();
};
// the claim: farming, building, eating
fresh('freeholders');
tick();
check('a fresh chain completes only what is already true (a bandaged band; old knockouts do not carry over)', done().join(',') === 'bandage' && open().length === 7, `done: ${done().join(', ')}; open: ${open().join(', ')}`);
p.act = 'farm'; tick(); p.act = null;
check('working a field completes "Farm the wheat field"', done().includes('farm'));
W.addObj({ id: 0, kind: 'chest', def: 'chest', x: p.x + 3, z: p.z, y: p.y, rot: 0, owner: 'player', site: 0, parent: 0, built: true, data: { name: 'Storage chest' } });
tick();
check('a finished building completes "Build something"', done().includes('build'));
p.hunger -= 10; tick();
check('hunger falling is not eating', open().includes('eat'));
p.hunger += 60; tick();
check('eating completes "Eat something"', done().includes('eat'));
// the pit, the Harrowmarket guards, a bounty
fresh('karuk');
W.flags.bout = { p: p.id, o: 0, tier: 0, t0: S.clock.t }; tick(); delete W.flags.bout;
check('stepping into the pit completes "Fight a bout in the pit"', done().includes('arena'));
fresh('blades');
const guard = [...W.chars.values()].find((c) => c.role === 'guard' && c.site === crossroad.id)!;
emit('ui:talk', p.id, guard.id);
check('asking a guard completes the bounty-board goal', done().includes('guard'), guard.name);
W.flags.bounties = 1; tick();
check('a collected bounty completes "Collect a bounty"', done().includes('bounty'));
emit('ui:loot', p.id, { char: foe.id });
check('going through a fallen enemy\'s pack completes "Loot the fallen"', done().includes('loot'));
// the machines' enclave: a kit bought, not just any purchase
fresh('constructs');
W.money = 2000;
payForGoods(shop, makeItem('bandages', 1, 2), 1);
check('buying something else does not buy a repair kit', open().includes('buy'));
const kits = makeItem('repair_kit', 3, 2);
shopGrid(shop)!.put(kits);
const [gotKit] = buyInto(shop, kits, [p.inv], 1); // a right-click buys one
check('buying one repair kit off a stack completes "Buy a repair kit"', done().includes('buy') && gotKit === 1 && kits.n === 2, `${W.money}c left, ${kits.n} kits left on the shelf`);
// scrap: salvage and a mended limb
p.body.lost |= 1 << LI.rleg; p.body.prost[LI.rleg] = 'scrap_leg'; p.body.hp[LI.rleg] = 10;
fresh('scrappers');
W.flags.salvaged = 1; tick();
check('stripping a machine completes "Salvage a downed machine"', done().includes('salvage'));
p.body.hp[LI.rleg] = 10; tick();
check('a limb left as it is does not count as mended', open().includes('repair'));
p.body.hp[LI.rleg] += 15; tick();
check('a prosthetic mended completes "Mend a wrecked limb"', done().includes('repair'));
// deserters: a clean name
fresh('deserters');
// the road brings a fight once winning one is the next goal (see worldsim tickPassers)
const fightBefore = wantsFight();
W.flags.objectives.done.reach = S.clock.t;
const fightAfter = wantsFight();
delete W.flags.objectives.done.reach;
check('once "Win a fight" is the next goal, the road may bring one, even on the first, gentle day', !fightBefore && fightAfter);
{
  // the Wanderer's "Bandage a wound" comes before "Win a fight", and with no wound yet it waits on the fight
  fresh('wanderer');
  for (const k of ['reach', 'barkeep', 'deal', 'mine', 'sell_ore', 'recruit']) W.flags.objectives.done[k] = S.clock.t;
  delete W.flags.objectives.done.bandage;
  // (everyone whole for this, and as they were after)
  const kept = W.playerChars().map((c) => [c, [...c.body.hp], [...c.body.bleed]] as const);
  for (const c of W.playerChars()) for (let l = 0; l < 7; l++) { c.body.hp[l] = c.body.max[l]; c.body.bleed[l] = 0; }
  const sound = W.playerChars().every((c) => !c.alive || !c.body.needsAid());
  const unhurt = wantsFight();
  p.body.bleed[LI.larm] = 0.1;
  const hurt = wantsFight();
  for (const [c, hp, bleed] of kept) for (let l = 0; l < 7; l++) { c.body.hp[l] = hp[l]; c.body.bleed[l] = bleed[l]; }
  check('with nobody hurt, an open "Bandage a wound" waits on "Win a fight": the road may bring one; with a wound to bandage, it does not yet', sound && unhurt && !hurt, `unhurt ${unhurt}, hurt ${hurt}`);
  fresh('deserters');
}
p.bounty.concord = 3000; tick();
check('a price on your head leaves "Clear your names" open', open().includes('clear'));
p.cage = 1; p.bounty.concord = 0; tick(); // arrested: the jailer wipes the bounty
check('a bounty wiped by an arrest does not clear your name', open().includes('clear'));
p.cage = 0; tick();
check('...nor does walking out of the cage afterwards', open().includes('clear'));
p.bounty.drifters = 200; p.bounty.drifters = 0; emit('sim:bountyPaid', p, 'drifters', 200); tick();
check('...nor paying off somebody else\'s bounty', open().includes('clear'));
p.bounty.concord = 3000; p.bounty.concord = 0; emit('sim:bountyPaid', p, 'concord', 3000); tick();
check('paying it off completes "Clear your names"', done().includes('clear'));
// the runaway
fresh('chainbound');
p.shackled = true; tick();
check('still in shackles, the first goal waits', open().includes('shackles'));
p.shackled = false; tick();
check('picked shackles complete "Pick your shackles"', done().includes('shackles'));
p.move = 'sneak'; tick(); p.move = 'run';
check('sneaking completes "Sneak"', done().includes('sneak'));
// a runaway of Chainfield's, out past the fields: free of it 300 m past the camp's edge (see tickRunaways)
const cfield = T.sites.find((s) => s.settlement === 'chainfield')!;
p.mem.enslavedBy = 'chainhouse'; p.mem.slaveSite = cfield.id;
const pastEdge = (m: number) => { put(p, cfield.x + cfield.r + m, cfield.z); tickRunaways(1.1); tick(); return Math.round(Math.hypot(p.x - cfield.x, p.z - cfield.z) - cfield.r); };
const near = pastEdge(ESCAPE_M - 60);
check('a runaway still within 300 m of Chainfield is not clear of it', open().includes('escape') && !!p.mem.slaveSite, `${near} m past the edge`);
p.move = 'sneak';
const far = pastEdge(ESCAPE_M + 15);
check('300 m past its edge completes "Get clear of Chainfield"', done().includes('escape') && !p.mem.slaveSite, `${far} m past the edge`);
const told = notices.filter((n) => /escaped/.test(n)).pop() ?? '';
// (the sim writes the key as {sneak}; where a notice is shown it becomes the key as bound)
check('a runaway who crept clear stands up to run, and is told the key to sneak again', p.move === 'run' && told.includes('{sneak} to sneak again') && withKeys(told).includes(`${withKeys('{sneak}')} to sneak again`), `${p.move}: ${withKeys(told)}`);
// left sneaking with nothing about: they stand up and run after a while, with a word why
{
  const spot = nav.nearestOpen(cfield.x + cfield.r + ESCAPE_M + 400, cfield.z, 80)!;
  put(p, spot[0], spot[1]); p.move = 'sneak'; p.order = null;
  let about = 0; W.hash.near(p.x, p.z, 120, (o) => { if (o !== p) about++; });
  const n0 = notices.length;
  let t = 0; while (p.move === 'sneak' && t < 120) { tickStealth(0.5); t += 0.5; }
  const said = notices.slice(n0).find((n) => /nobody about/.test(n)) ?? '';
  check('sneaking with nobody about, they stand up and run within a minute, and are told so', p.move === 'run' && t >= SNEAK_QUIET && t <= SNEAK_QUIET + 1 && said.includes('{sneak}'), `${t} s, ${about} others near: ${withKeys(said)}`);
}
p.bounty = {}; delete p.mem.runawayT;
const hideout = T.sites.find((s) => s.key === 'brokenchain' || s.settlement === 'brokenchain');
if (hideout) { put(p, hideout.x, hideout.z); tick(); }
check('reaching Brokenchain completes "Find Brokenchain"', !!hideout && done().includes('brokenchain'), hideout ? hideout.name : 'no such site');
// the ash: bleeding, a road, a town, chits
fresh('nothing');
W.money = 50;
const gnawbone = T.sites.find((s) => s.settlement === 'gnawbone' || s.key === 'gnawbone');
if (gnawbone) put(p, gnawbone.x, gnawbone.z);
p.body.bleed[LI.chest] = 0.05; tick();
check('a cannibal village does not count as reaching a town', !!gnawbone && open().includes('town'), gnawbone ? `${gnawbone.name} (${gnawbone.faction})` : 'no Gnawbone');
check('bleeding leaves "Stop the bleeding" open', open().includes('clot'));
p.body.bleed[LI.chest] = 0; tick();
check('clotted or bandaged, it completes', done().includes('clot'));
let road: [number, number] | null = null;
for (let r = 20; r < 600 && !road; r += 10) for (let k = 0; k < 24 && !road; k++) { const a = (k / 24) * Math.PI * 2; const x = crossroad.x + Math.cos(a) * r, z = crossroad.z + Math.sin(a) * r; if (T.roadAt(x, z) > 0) road = [x, z]; }
if (road) { p.x = road[0]; p.z = road[1]; tick(); }
check('standing on a road completes "Find a road"', !!road && done().includes('road'), road ? `${road[0].toFixed(0)}, ${road[1].toFixed(0)}` : 'no road near Crossroad');
put(p, crossroad.x, crossroad.z); tick();
check('a free town does for "Reach a town"', done().includes('town'));
W.money = 50; tick();
check('fifty chits do not make a hundred', open().includes('money'));
W.money = 120; tick();
check('a hundred chits complete "Earn 100 chits"', done().includes('money'));
// a recruit's old fights are not your win; a new one is
fresh('freeholders');
{
  const vet = makePerson(W, { faction: 'drifters', role: 'recruit', race: 'valefolk', level: 10, whole: true }, rng);
  vet.recruitable = true; vet.x = p.x + 1; vet.z = p.z; vet.y = p.y;
  vet.stats.kos = 2; // a drinker who has won a brawl or two
  recruit({ p, n: vet, vars: {} });
  tick();
  check('recruiting someone with old knockouts does not tick "Win a fight"', done().includes('recruit') && open().includes('win'), vet.name);
  vet.stats.kos = 3; tick();
  check('...but a knockout they land for you does', done().includes('win'));
}
// a bought house is not something you built
fresh('freeholders');
{
  markHousesForSale();
  const sign = [...W.objs.values()].find((o) => o.kind === 'sign' && o.def === 'forsale');
  W.money = 1e6;
  const err = sign ? buyHouse(sign) : 'no house for sale';
  tick();
  check('buying a house does not tick "Build something"', !sign || (err === null && open().includes('build')), sign ? `bought: ${err ?? 'ok'}` : 'no house for sale');
  W.addObj({ id: 0, kind: 'chest', def: 'chest', x: p.x + 3, z: p.z, y: p.y, rot: 0, owner: 'player', site: 0, parent: 0, built: true, data: { name: 'Storage chest' } });
  tick();
  check('...something built after the chain began does', done().includes('build'));
}
// a "patched up" notice with no kit used is not a bandage
for (let l = 0; l < 7; l++) p.body.treated[l] = 0;
fresh('blades');
emit('notice', `${p.name} is patched up.`, 'good');
tick();
check('a "patched up" notice alone does not tick the first aid goal', open().includes('bandage'));
p.body.treated[LI.larm] = 0.4; tick();
check('...a treated wound does', done().includes('bandage'));
// a reward with no room in the packs lands at your feet, and the record says so
fresh('wanderer');
{
  const packs = W.playerChars().flatMap((c) => [c.inv, c.eq.back?.inv]).filter(Boolean) as import('../src/sim/inventory').Grid[];
  for (const g of packs) { g.items.length = 0; for (const id of ['iron_plates', 'stone', 'wheat']) while (g.add(id, 1) === 0) { /* fill every cell, of everyone's packs */ } }
  for (let l = 0; l < 7; l++) p.body.treated[l] = 0;
  dropped.length = 0;
  p.body.treated[LI.larm] = 0.4; tick();
  const fell = dropped.flat().filter((i) => i.id === 'bandages').reduce((a, i) => a + i.n, 0);
  const line = W.log.filter((l) => /^Bandage a wound/.test(l.text)).pop()?.text ?? '';
  check('with every pack full the bandage reward is dropped at the lead\'s feet', done().includes('bandage') && fell === 2 && /2 Bandages at .* feet/.test(line), line.slice(-60));
  for (const g of packs) g.items.length = 0;
}
// a chain that is not one
{
  W.flags.objectives = { set: 'wanderer' };
  let err = '';
  try { tick(3); } catch (e) { err = String(e); }
  check('a saved chain with no done map is ignored rather than thrown on', !err && objectiveView() === null, err);
}
// hiding the tracker is remembered
fresh('nothing');
{
  const st = W.flags.objectives;
  st.hidden = true;
  const data = JSON.parse(JSON.stringify(serialize()));
  const W3 = new World(); apply(data, W3);
  check('a hidden tracker stays hidden in the save', W3.flags.objectives?.hidden === true);
}

// walled towns: the Wanderer starts on the road out of a gate, "Reach" points at the nearest gate, and the walk in is a straight one
{
  const sc = SCENARIOS.find((x) => x.key === 'wanderer')!;
  const [ox, oz] = sc.start.off!;
  const at = nav.nearestOpen(crossroad.x + ox, crossroad.z + oz, 30)!;
  const rp = reachPoint({ k: 'reach', site: 'crossroad' }, at[0], at[1]);
  const bark = [...W.chars.values()].find((c) => c.role === 'barkeep' && c.site === crossroad.id)!;
  const len = (a: [number, number], b: { x: number; z: number }) => { const pts = nav.fine(a[0], a[1], b.x, b.z, 60, 120000, false); let d = 0; if (!pts) return Infinity; for (let i = 2; i < pts.length; i += 2) d += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]); return d; };
  const walk = len(at, bark), straight = Math.hypot(bark.x - at[0], bark.z - at[1]);
  check('the Wanderer starts by a Crossroad gate, "Reach Crossroad" points at it, and the walk to the barkeep is nearly straight',
    !!rp && rp.gate && Math.hypot(rp.x - at[0], rp.z - at[1]) < 120 && walk < straight * 1.35,
    `gate ${rp ? Math.round(Math.hypot(rp.x - at[0], rp.z - at[1])) : '-'} m away; ${Math.round(walk)} m walked for ${Math.round(straight)} m straight`);
  // the other way: from out past the wall between gates, it points at the nearest gate, not through the wall
  const side = nav.nearestOpen(crossroad.x + 170, crossroad.z + 40, 30)!;
  const rq = reachPoint({ k: 'reach', site: 'crossroad' }, side[0], side[1])!;
  const gs = [...W.objs.values()].filter((o) => o.kind === 'gate' && o.site === crossroad.id);
  const nearest = Math.min(...gs.map((g) => Math.hypot(g.x - side[0], g.z - side[1])));
  check('...and from anywhere, it points at the gate nearest them', rq.gate && Math.abs(Math.hypot(rq.x - side[0], rq.z - side[1]) - nearest) < 8, `${gs.length} gates; nearest ${Math.round(nearest)} m`);
}

// "Win a fight" names, in order: a band within 300 m, then one coming this way, then one slower than your people
// within 900 m (an attack order runs it down); failing all those, the safest fight about, and says so
{
  const spot = nav.nearestOpen(crossroad.x + 1500, crossroad.z + 900, 60)!;
  put(p, spot[0], spot[1]);
  const away = W.playerChars().filter((c) => c !== p && c.alive).map((c) => { const was: [number, number] = [c.x, c.z]; put(c, crossroad.x - 2500, crossroad.z - 2500); return [c, was] as const; });
  const sv = SPECS.find((s) => s.key === 'starvelings')!;
  const bands: Char[][] = [];
  const band = (dx: number, dz: number, n: number, speed: number, toward: boolean) => {
    const at = nav.nearestOpen(p.x + dx, p.z + dz, 30)!;
    const q = spawn(sv, { x: at[0], z: at[1], route: [at[0], at[1]], cap: n, level: 3 })!;
    const ms = q.members.map((id) => W.char(id)!);
    for (const m of ms) { m.speed = speed; m.dir = toward ? Math.atan2(p.x - m.x, p.z - m.z) : Math.atan2(m.x - p.x, m.z - p.z); }
    bands.push(ms);
    return ms;
  };
  const down = (ms: Char[]) => { for (const m of ms) m.status = 'ko'; };
  const near = band(250, 0, 1, 0, false), coming = band(0, 600, 1, 1.8, true), slower = band(-700, 0, 1, 1.5, false), quick = band(0, -800, 2, 6, false), lone = band(-600, -600, 1, 6, false);
  band(1000, 0, 1, 1.8, true); // too far, whatever it does
  const seen: string[] = [];
  const look = () => { const b = beatableNear(); seen.push(b ? `${b.why} ${Math.round(b.d)} m` : 'none'); return b; };
  const a1 = look(); down(near);
  const a2 = look(); down(coming);
  const a3 = look(); down(slower);
  const a4 = look(); down(lone);
  const a5 = look(); down(quick);
  const a6 = look();
  check('"Win a fight" prefers a band near, then one coming, then one slower than yours, then the safest about (the lone runner before the pair); nothing past 900 m',
    a1?.why === 'near' && a2?.why === 'coming' && a3?.why === 'slower' && a4?.why === 'safest' && a4.n === 1 && a5?.why === 'safest' && a5.n === 2 && !a6, seen.join(' | '));
  // nor a band that means no harm to yours: the Scorched Hand, say, who want tribute and are the law in Mudwater
  const sh = SPECS.find((s) => s.key === 'scorched')!;
  const at = nav.nearestOpen(p.x + 200, p.z, 30)!;
  const q = spawn(sh, { x: at[0], z: at[1], route: [at[0], at[1]], cap: 1, level: 3 })!;
  const named = beatableNear();
  check('...nor a band that means yours no harm (the Scorched Hand, at peace with you)', !named && !W.rel.hostile('player', 'scorched'), named ? `${named.why}: ${named.name}` : 'none');
  for (const id of q.members) { const m = W.char(id); if (m) { m.status = 'dead'; W.removeChar(m); } }
  for (const ms of bands) for (const m of ms) { m.status = 'dead'; W.removeChar(m); }
  for (const [c, was] of away) put(c, was[0], was[1]);
}

const failed = results.filter((x) => !x[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
