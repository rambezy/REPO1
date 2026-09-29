// Headless check of prosthetic limbs: who walks about on them, blows that
// ring off metal instead of drawing blood, plating, limbs wrecked but never
// cut off, mending one with a repair kit, fitting only at a built bench,
// taking limbs off your own people and off the downed, wear carried through
// saves and trade, the machine-grafting recipes, and a body built for every
// make of limb.
// Usage: npx tsx tools/limbtest.ts
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
import { SETTLEMENT } from '../src/content/layout';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import { applyDamage } from '../src/sim/combat';
import { knockOut, fitProsthetic, removeProsthetic, takeProsthetic, aidPlan } from '../src/sim/health';
import { Body, LI } from '../src/sim/body';
import { SK } from '../src/sim/skills';
import { sellPrice, type Shop } from '../src/sim/shops';
import { ITEM } from '../src/content/items';
import { RECIPES, BUILDABLE, TECH } from '../src/content/buildables';
import { SCENARIOS } from '../src/content/scenarios';
import { RACE } from '../src/content/races';
import { buildHuman } from '../src/render/human';
import { makeRig, prostLooks } from '../src/render/charModel';
import type { Char } from '../src/sim/char';
import type { EquipSlot } from '../src/content/items';

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(33), time: 0 });
S.clock.t = 12 * HOUR;
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const notices: string[] = [];
S.fx = { ...S.fx, notice: (t: string) => { notices.push(t); }, say: () => {}, sound: () => {}, burst: () => {}, hit: () => {} } as typeof S.fx;
for (const site of T.sites) if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
W.rebuildObjHash();

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const LIMB_SLOTS = [LI.larm, LI.rarm, LI.lleg, LI.rleg];
const hasProst = (c: Char) => LIMB_SLOTS.some((l) => c.body.isProst(l));

// ---------------------------------------------------------------- who wears them
const rng = new RNG(7);
const crowd = new Map<string, Char[]>();
for (const f of ['delvers', 'ironcoin', 'reavers', 'thrum', 'concord']) {
  const list: Char[] = [];
  for (let i = 0; i < 300; i++) list.push(makePerson(W, { faction: f, role: 'guard', level: 5 + (i % 60) }, rng));
  crowd.set(f, list);
}
const worn = (f: string) => crowd.get(f)!.filter(hasProst);
const all = [...crowd.values()].flat().filter(hasProst);
check('some of the wasteland\'s fighters walk on prosthetics', worn('delvers').length >= 15 && worn('delvers').length <= 70 && worn('reavers').length >= 8, `${worn('delvers').length}/300 Delvers, ${worn('ironcoin').length} Iron Coin, ${worn('reavers').length} Reavers, ${worn('concord').length} Concord`);
check('...never the Thrum, who are not made for it', worn('thrum').length === 0);
const makes = (cs: Char[]) => cs.flatMap((c) => LIMB_SLOTS.filter((l) => c.body.isProst(l)).map((l) => ({ c, id: c.body.prost[l]! })));
const wardens = makes(all).filter((m) => m.id.startsWith('warden'));
check('Warden limbs only on hardened fighters who could afford one; bandits make do with scrap',
  wardens.length > 0 && wardens.every((m) => ['delvers', 'ironcoin'].includes(m.c.faction)) && makes(worn('reavers')).every((m) => m.id.startsWith('scrap')),
  `${wardens.length} Warden, ${makes(all).filter((m) => m.id.startsWith('standard')).length} standard, ${makes(all).filter((m) => m.id.startsWith('scrap')).length} scrap`);
check('a limb worn in the wild has taken some knocks', makes(all).some((m) => { const l = LIMB_SLOTS.find((x) => m.c.body.prost[x] === m.id)!; return m.c.body.hp[l] < m.c.body.max[l] * 0.9; }));
let whole = 0;
for (let i = 0; i < 300; i++) { const c = makePerson(W, { faction: 'delvers', role: 'guard', level: 30, whole: true }, rng); if (!hasProst(c)) whole++; W.removeChar(c); }
check('the people you start with start whole', whole === 300);
for (const c of [...crowd.values()].flat()) W.removeChar(c);

// ---------------------------------------------------------------- blows on metal
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Scrappers'; W.addSquad(sq); W.playerSquads.push(sq.id);
const town = T.sites.find((s) => s.kind === 'town')!;
const [bx, bz] = nav.nearestOpen(town.x + 420, town.z + 60, 80)!;
const mine = (dx: number, dz: number, race = 'valefolk'): Char => {
  const c = makePerson(W, { faction: 'drifters', role: 'wanderer', race, level: 20, whole: true }, rng);
  c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, sq);
  const p = nav.nearestOpen(bx + dx, bz + dz, 10)!; c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z);
  for (const s of ['head', 'shirt', 'body', 'legs', 'feet'] as EquipSlot[]) c.eq[s] = null; // bare, so only the limb itself turns a blow
  c.sk[SK.toughness] = 10;
  return c;
};
const fit = (c: Char, l: number, id: string) => { c.body.lost |= 1 << l; c.body.prost[l] = id; c.body.hp[l] = c.body.max[l]; c.body.bleed[l] = 0; c.dirty = true; };

const v = mine(0, 0), w = mine(3, 0);
fit(v, LI.larm, 'standard_arm');
const strong = v.skill('strength');
applyDamage(v, LI.larm, 30, 0, null);
applyDamage(w, LI.larm, 30, 0, null);
const dv = v.body.max[LI.larm] - v.body.hp[LI.larm], dw = w.body.max[LI.larm] - w.body.hp[LI.larm];
check('a steel arm\'s plating turns part of a blade', dv > 0 && dv < dw * 0.8, `${dv.toFixed(1)} against ${dw.toFixed(1)} on flesh`);
check('...and metal does not bleed', v.body.bleed[LI.larm] === 0 && w.body.bleed[LI.larm] > 0);
notices.length = 0;
for (let i = 0; i < 40; i++) applyDamage(v, LI.larm, 70, 40, null);
check('beaten past use, a prosthetic is wrecked, never cut off', v.body.isProst(LI.larm) && v.body.hp[LI.larm] <= 0 && v.body.hp[LI.larm] >= -v.body.max[LI.larm] && !v.body.armOK(LI.larm), notices.find((n) => /wrecked/.test(n)) ?? 'no notice');
check('a wrecked arm gives nothing but its weight', Math.abs(strong - v.skill('strength') - (ITEM.standard_arm.limb!.bonus.strength ?? 0)) < 1e-6, `strength ${strong.toFixed(1)} -> ${v.skill('strength').toFixed(1)}`);

// ---------------------------------------------------------------- mending
const mech = mine(1.5, 1);
mech.inv.add('repair_kit', 3);
mech.sk[SK.robotics] = 30;
const rob0 = mech.sk[SK.robotics];
mech.order = { k: 'aid', id: v.id };
notices.length = 0;
const run = (secs: number) => { for (let i = 0; i < secs / 0.1; i++) { simStep(0.1, { x: bx, z: bz }); tickSquads(0.1); } };
run(40);
check('a repair kit mends a wrecked limb, and robotics does the work', v.body.hp[LI.larm] > 0 && v.body.armOK(LI.larm) && mech.inv.count('repair_kit') < 3 && mech.sk[SK.robotics] > rob0, `${Math.round(v.body.hp[LI.larm])}/${v.body.max[LI.larm]}, ${mech.inv.count('repair_kit')} kits left; ${notices.find((n) => /works again/.test(n)) ?? 'no notice'}`);

const hol = mine(6, 0, 'hollow');
fit(hol, LI.rarm, 'scrap_arm');
hol.body.hp[LI.rarm] = -5;
const hp = aidPlan(mech, hol);
check('...a Hollow\'s prosthetic too', !!hp && hp.prost && hp.l === LI.rarm);

// ---------------------------------------------------------------- legs
const lg = mine(-3, 0);
fit(lg, LI.rleg, 'strider_leg');
const quick = lg.legFactor();
check('a strider leg is nearly as quick as the one it replaced', quick > 0.85 && quick < 1, quick.toFixed(2));
for (let i = 0; i < 40; i++) applyDamage(lg, LI.rleg, 70, 60, null);
check('a wrecked leg will not carry them', !lg.body.canWalk() && lg.legFactor() < 0.5 && lg.body.limp() > 0);

// ---------------------------------------------------------------- fitting and taking off
const fitter = mine(30, 20);
mech.x = bx - 40; mech.z = bz; // no squadmate who knows robotics close by
fitter.body.lost |= 1 << LI.rarm; fitter.body.hp[LI.rarm] = 0;
fitter.inv.add('scrap_arm', 1);
const arm = fitter.inv.items.find((i) => i.id === 'scrap_arm')!;
const site = W.addObj({ id: 0, kind: 'site', def: 'robo_bench', x: fitter.x + 2, z: fitter.z, y: fitter.y, rot: 0, owner: 'player', site: 0, parent: 0, data: { bkey: 'robo_bench', w: 2, d: 1, need: {}, have: {} } });
const err = fitProsthetic(fitter, arm.uid);
check('an unbuilt robotics bench is no help fitting a limb', err !== null && !fitter.body.prost[LI.rarm], err ?? 'it went on');
W.removeObj(site);
const bench = W.addObj({ id: 0, kind: 'bench', def: 'research', x: fitter.x + 2, z: fitter.z, y: fitter.y, rot: 0, owner: 'player', site: 0, parent: 0, data: { bkey: 'robo_bench' } });
check('at a built one it goes on', fitProsthetic(fitter, arm.uid) === null && fitter.body.prost[LI.rarm] === 'scrap_arm' && fitter.body.armOK(LI.rarm));
fitter.body.hp[LI.rarm] = fitter.body.max[LI.rarm] * 0.4;
const offErr = removeProsthetic(fitter, LI.rarm);
const back = fitter.inv.items.find((i) => i.id === 'scrap_arm');
check('taken off, it goes in the pack, dents and all', offErr === null && !fitter.body.prost[LI.rarm] && !!back && Math.abs((back.cond ?? 1) - 0.4) < 0.01, offErr ?? `cond ${back?.cond}`);
const shop = { id: 0, faction: 'drifters', kind: 'general', markup: 0, site: 0 } as unknown as Shop;
check('a dented limb sells for less than a sound one', !!back && sellPrice(shop, back) < sellPrice(shop, { ...back, cond: undefined }), back ? `${sellPrice(shop, back)} against ${sellPrice(shop, { ...back, cond: undefined })}` : '');
fitProsthetic(fitter, back!.uid);
check('...and goes back on as worn as it came off', Math.abs(fitter.body.hp[LI.rarm] / fitter.body.max[LI.rarm] - 0.4) < 0.01);
W.removeObj(bench);

// ---------------------------------------------------------------- saves
const ser = JSON.parse(JSON.stringify(fitter.body.serialize()));
const b2 = Body.from(ser);
const old = JSON.parse(JSON.stringify(ser)); delete old.pv; old.hp[LI.rarm] = 0;
const b3 = Body.from(old);
check('a save keeps a limb\'s wear; an older save brings limbs back sound', Math.abs(b2.hp[LI.rarm] - fitter.body.hp[LI.rarm]) < 1e-3 && b3.hp[LI.rarm] === b3.max[LI.rarm] && b3.prost[LI.rarm] === 'scrap_arm');

// ---------------------------------------------------------------- the downed
const foe = makePerson(W, { faction: 'reavers', role: 'bandit', level: 20, whole: true }, rng);
fit(foe, LI.lleg, 'scrap_leg');
foe.body.hp[LI.lleg] = foe.body.max[LI.lleg] * 0.7;
knockOut(foe, 'test');
const loot = takeProsthetic(foe, LI.lleg);
check('a downed bandit\'s scrap leg can be unbolted and carried off', loot?.id === 'scrap_leg' && Math.abs((loot.cond ?? 1) - 0.7) < 0.01 && !foe.body.prost[LI.lleg] && !foe.body.canWalk());

// ---------------------------------------------------------------- making them
const grafts = ['r_sarm', 'r_darm', 'r_strider'];
check('Machine Grafting rebuilds salvaged machine limbs at the robotics bench', !!TECH.grafting && grafts.every((k) => RECIPES[k]?.research === 'grafting' && BUILDABLE.robo_bench.recipes!.includes(k)));
check('servo motors go into every limb better than scrap', ['r_arm', 'r_leg', 'r_warm', 'r_wleg', ...grafts].every((k) => (RECIPES[k].in.servo_motor ?? 0) >= 1));
const start = SCENARIOS.find((s) => s.key === 'scrappers');
check('a start with two scavengers on scrap limbs', !!start && start.people.every((p) => (p.prost ?? []).every(([l, id]) => l >= 3 && ITEM[id]?.limb)) && start.people.some((p) => p.prost?.length));

// ---------------------------------------------------------------- bodies
const model = mine(-20, 10);
const pairs: [string, string][] = [['scrap_arm', 'scrap_leg'], ['standard_arm', 'standard_leg'], ['warden_arm', 'warden_leg'], ['sentinel_arm', 'strider_leg'], ['drone_arm', 'standard_leg']];
let bad = '', verts0 = 0, most = 0;
for (const race of ['valefolk', 'karuk', 'pale']) {
  if (!RACE[race]) continue;
  model.look = { ...model.look, race };
  const rig = makeRig(model.look);
  for (const detail of [0, 1]) {
    verts0 = buildHuman(model.look, model.vis(), 0, rig, [], detail).getAttribute('position').count;
    for (const [a, g] of pairs) {
      const prost: (string | null)[] = [null, null, null, a, a, g, g];
      const lost = (1 << 3) | (1 << 4) | (1 << 5) | (1 << 6);
      const geo = buildHuman(model.look, model.vis(), lost, rig, prostLooks(prost), detail);
      const p = geo.getAttribute('position').array as Float32Array;
      if (!p.every(Number.isFinite)) bad = `${race} ${a}/${g} detail ${detail}`;
      most = Math.max(most, p.length / 3 - verts0);
    }
  }
}
check('a body builds for every make of limb, near and far, with nothing out of place', !bad, bad || `up to ${most} more vertices than flesh`);

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
