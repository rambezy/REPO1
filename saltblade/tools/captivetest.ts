// Headless check of captivity, and that nobody is ever left with nothing to
// do: a lone wanderer knocked out and taken by Chainhouse slavers goes to the
// fields in shackles, not into a cage, and is put to work within the day; a
// slave can pick their own shackles at night and walk free; a caged prisoner
// can work the lock from inside; every captive state names a way out or
// passes by itself; a caged slave from an older save is let out to the fields.
// Usage: npx tsx tools/captivetest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR, DAY } from '../src/sim/clock';
import { RNG, hash3 } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { tickRunaways, captivity } from '../src/sim/crime';
import { structuresIn, townRings } from '../src/sim/structures';
import { buildTown } from '../src/world/towns';
import { buildSite } from '../src/world/sites';
import { SETTLEMENT } from '../src/content/layout';
import { populateTown } from '../src/sim/populate';
import { enslave } from '../src/sim/ai';
import { knockOut } from '../src/sim/health';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import { SK } from '../src/sim/skills';
import type { Char } from '../src/sim/char';

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(99), time: 0 });
S.clock.t = DAY + 8 * HOUR;
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const notices: string[] = [];
S.fx = { ...S.fx, notice: (t: string) => { notices.push(t); }, say: () => {}, sound: () => {}, burst: () => {}, hit: () => {} } as typeof S.fx;
for (const site of T.sites) {
  if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
  else buildSite(W, T, site, new RNG(hash3(site.seed, 1234, 5)));
}
W.rebuildObjHash();

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const rng = new RNG(3);
const cf = T.sites.find((s) => s.settlement === 'chainfield')!;
populateTown(W, W.towns.get(cf.id)!);
const fields = [...W.objs.values()].filter((o) => o.kind === 'farm' && o.site === cf.id);
const cages = [...W.objs.values()].filter((o) => o.kind === 'cage' && o.site === cf.id);
console.log(`Chainfield: ${fields.length} fields, ${cages.length} cages, ${[...W.chars.values()].filter((c) => c.site === cf.id).length} people`);
const fieldDist = (c: Char) => Math.min(...fields.map((f) => Math.hypot(f.x - c.x, f.z - c.z)));
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Taken'; W.addSquad(sq); W.playerSquads.push(sq.id);
const mine = (x: number, z: number): Char => {
  const c = makePerson(W, { faction: 'drifters', role: 'wanderer', race: 'valefolk', level: 10, whole: true }, rng);
  c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, sq);
  const p = nav.nearestOpen(x, z, 20)!; c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z);
  return c;
};
const focus = { x: cf.x, z: cf.z };
const step = (secs: number) => { for (let i = 0; i < secs / 0.1; i++) { simStep(0.1, focus); tickSquads(0.1); tickRunaways(0.1); } };
/** Steps until a condition holds, in five-second strides; returns the seconds it took, or -1. */
const until = (cond: () => boolean, max: number) => { let t = 0; while (!cond() && t < max) { step(5); t += 5; } return cond() ? t : -1; };

// ---------------------------------------------------------------- a lone wanderer, knocked out, taken by the Chainhouse
const p = mine(cf.x + cf.r + 60, cf.z);
const ss = new Squad(); ss.faction = 'chainhouse'; ss.kind = 'slavers'; ss.name = 'Slavers'; W.addSquad(ss);
const s = makePerson(W, { faction: 'chainhouse', role: 'slaver', level: 30, whole: true }, rng);
W.moveToSquad(s, ss); s.x = p.x + 5; s.z = p.z; s.y = T.heightAt(s.x, s.z); s.homeX = s.x; s.homeZ = s.z;
p.body.hp[1] = -20; knockOut(p);
check('a lone fallen wanderer is picked up by a slaver', until(() => s.carrying === p.id, 120) >= 0 && p.shackled, `${s.carrying === p.id ? 'carried' : 'left'}, shackled ${p.shackled}`);
check('...and is nothing to the "all held" card but a captive being carried', captivity(p).kind === 'carried' && captivity(p).passes);
// a captor who has forgotten what they were about (a task lost on the way) puts the captive down rather than carry them for good
// (and, the captive still lying there, takes them up again within the second: so look every step)
s.brain.task = null;
let dropped = false;
for (let i = 0; i < 50 && !dropped; i++) { simStep(0.1, focus); tickSquads(0.1); tickRunaways(0.1); dropped = !p.carriedBy && !s.carrying; }
check('a captor with no task left puts the captive down', dropped);
const tDeliver = until(() => !p.carriedBy && !!p.mem.slaveSite, 1800);
check('they are set down in the fields of Chainfield, not in a cage', tDeliver >= 0 && !p.cage && p.mem.slaveSite === cf.id && p.mem.enslavedBy === 'chainhouse' && fieldDist(p) < 30, `after ${tDeliver} s, ${fieldDist(p).toFixed(0)} m from a field, caged ${!!p.cage}`);
check('...still in shackles, and told so', p.shackled && notices.some((n) => /taken by slavers/.test(n)), notices.find((n) => /slavers/.test(n)) ?? '');
const tWake = until(() => p.status === 'up', 900);
check('they come round where they were left', tWake >= 0, `${tWake} s`);
// the overseers put the idle to work by day: within the day they are cutting riceweed
S.clock.t = Math.floor(S.clock.t / DAY) * DAY + 8 * HOUR;
let farmed = false, farmedAt = 0;
for (let t = 0; t < DAY / 36 && !farmed; t += 5) { step(5); if (p.act === 'farm' && fieldDist(p) < 20) { farmed = true; farmedAt = t; } }
check('within the day they are working a field', farmed, `farming after ${farmedAt} s of sim, ${fieldDist(p).toFixed(0)} m from a field`);
check('the camp\'s own people leave their chained slave be', p.status === 'up' && p.lastHitBy === 0, `hit by ${p.lastHitBy}`);
const cs = captivity(p);
check('the card knows a slave can act for themselves', cs.kind === 'slave' && cs.order?.k === 'free' && (cs.order as any).id === p.id, cs.text);
// a chained slave who falls in the fields (hunger, a beating) is left to come round, not taken again and again
const takenBefore = notices.filter((n) => /taken by slavers/.test(n)).length;
p.body.hp[1] = -20; knockOut(p);
let retaken = false;
for (let i = 0; i < 600 && !retaken; i++) { simStep(0.1, focus); tickSquads(0.1); tickRunaways(0.1); retaken = !!p.carriedBy; }
check('a chained slave who falls in the fields is left to come round, not taken again', !retaken && notices.filter((n) => /taken by slavers/.test(n)).length === takenBefore, retaken ? 'picked up again' : 'left lying');
p.body.hp[1] = p.body.max[1];
until(() => p.status === 'up', 900);

// ---------------------------------------------------------------- someone else's fallen: one more of the camp's chained, in no squad of another colour
S.clock.t = Math.floor(S.clock.t / DAY) * DAY + 10 * HOUR;
const spot = p.mem.slaveSpot as { x: number; z: number };
const rsq = new Squad(); rsq.faction = 'reavers'; rsq.kind = 'raid'; rsq.name = 'Reavers'; W.addSquad(rsq);
const rv = makePerson(W, { faction: 'reavers', role: 'bandit', level: 12, whole: true }, rng);
const rv2 = makePerson(W, { faction: 'reavers', role: 'bandit', level: 12, whole: true }, rng);
W.moveToSquad(rv, rsq); W.moveToSquad(rv2, rsq);
const rp = nav.nearestOpen(spot.x + 25, spot.z + 25, 15)!; rv.x = rp[0]; rv.z = rp[1]; rv.y = T.heightAt(rv.x, rv.z);
const rp2 = nav.nearestOpen(cf.x + cf.r + 300, cf.z + 300, 40)!; rv2.x = rp2[0]; rv2.z = rp2[1]; rv2.y = T.heightAt(rv2.x, rv2.z); rv2.homeX = rv2.x; rv2.homeZ = rv2.z;
const s2 = makePerson(W, { faction: 'chainhouse', role: 'slaver', level: 30, whole: true }, rng);
const ss2 = new Squad(); ss2.faction = 'chainhouse'; ss2.kind = 'slavers'; ss2.name = 'Slavers'; W.addSquad(ss2); W.moveToSquad(s2, ss2);
s2.x = rv.x + 3; s2.z = rv.z; s2.y = T.heightAt(s2.x, s2.z); s2.homeX = s2.x; s2.homeZ = s2.z;
rv.body.hp[1] = -20; knockOut(rv);
const tNpc = until(() => rv.faction === 'chainhouse' && !rv.carriedBy, 600);
const rvSq = W.squadOf(rv);
check('a fallen stranger the slavers take is one more of the camp\'s chained', tNpc >= 0 && rv.role === 'slave' && rv.shackled && !rv.cage && rv.mem.enslavedBy === 'chainhouse', `${tNpc} s`);
// (the camp's squad holds its caged prisoners of every colour, as towns do; nobody free in it is of another)
check('...in the camp\'s own squad, out of their old band, beside nobody free of another colour', !!rvSq && rvSq.kind === 'town' && rvSq.faction === 'chainhouse' && rvSq.members.every((m) => { const o = W.char(m); return !o || !!o.cage || o.faction === 'chainhouse'; }) && !rsq.members.includes(rv.id), `squad ${rvSq?.name ?? 'none'}`);
const camp = T.sites.find((s) => s.kind === 'camp_scorched') ?? T.sites.find((s) => s.kind !== 'town')!;
enslave(rv2, 'scorched', camp);
check('a slave of a camp with no people of its own stands alone, not with their old band', rv2.squad === 0 && !rsq.members.includes(rv2.id) && rsq.leader !== rv2.id && rv2.faction === 'scorched' && rv2.shackled, `at ${camp.name}`);
// a name worth something is held for whoever comes for it, not chained
const u = makePerson(W, { faction: 'drifters', role: 'wanderer', level: 20, whole: true }, rng);
u.unique = 'someone_named';
const up = nav.nearestOpen(s2.x + 2, s2.z + 2, 8)!; u.x = up[0]; u.z = up[1]; u.y = T.heightAt(u.x, u.z);
u.body.hp[1] = -20; knockOut(u);
const tU = until(() => !!u.cage || (!u.carriedBy && !s2.brain.task && s2.carrying === 0 && !!u.mem.lootedBy), 900);
check('a named character is caged for ransom rather than chained', tU >= 0 && !!u.cage && !u.shackled && u.faction === 'drifters' && u.mem.prisonerOf === 'chainhouse', `${tU} s, caged ${!!u.cage}`);
W.removeChar(s2);

// ---------------------------------------------------------------- picking the shackles under an overseer's eye
// by day, with an overseer four paces off: the odds halve, and a fumble is likely to be seen (or the irons seen to come off)
S.clock.t = Math.floor(S.clock.t / DAY) * DAY + 11 * HOUR;
const ov = makePerson(W, { faction: 'chainhouse', role: 'guard', level: 30, whole: true }, rng);
const op = nav.nearestOpen(p.x + 4, p.z, 6)!; ov.x = op[0]; ov.z = op[1]; ov.y = T.heightAt(ov.x, ov.z); ov.homeX = ov.x; ov.homeZ = ov.z;
notices.length = 0; p.bounty = {}; delete p.mem.runawayT;
p.order = { k: 'free', id: p.id };
const tSeen = until(() => (p.bounty.chainhouse ?? 0) > 0 || !p.shackled, 900);
check('under an overseer\'s eye, working at your own shackles gets you reported', tSeen >= 0 && (p.bounty.chainhouse ?? 0) === 1000 && notices.some((n) => /seen at their shackles|wanted for escaping slavery/.test(n)), `${tSeen} s: ${notices.find((n) => /seen at their shackles|wanted for escaping/.test(n)) ?? 'no notice'}`);
W.removeChar(ov);
// (and back to the fields, whole, for the night's work)
p.shackled = true; p.order = null; p.bounty = {}; delete p.mem.runawayT; p.dirty = true; p.lastHitBy = 0;
for (let l = 0; l < 7; l++) p.body.hp[l] = p.body.max[l];
p.body.blood = p.body.bloodMax; p.status = 'up'; p.body.koT = 0;

// ---------------------------------------------------------------- picking their own shackles, at night, and walking away
S.clock.t = Math.floor(S.clock.t / DAY) * DAY + DAY + 1 * HOUR; // 01:00: the overseers are abed
step(5);
const lp0 = p.sk[SK.lockpicking];
const runT0 = S.clock.t;
p.order = { k: 'free', id: p.id };
const tFree = until(() => !p.shackled, 1800);
check('a slave can pick their own shackles', tFree >= 0 && !p.order, `${tFree} s, lockpicking ${lp0.toFixed(1)}`);
check('...which trains lockpicking', p.sk[SK.lockpicking] > lp0, `${lp0.toFixed(1)} -> ${p.sk[SK.lockpicking].toFixed(1)}`);
const away = nav.nearestOpen(cf.x - cf.r - 980, cf.z, 80)!;
p.order = { k: 'move', x: away[0], z: away[1] }; p.move = 'run';
const tGone = until(() => !p.mem.slaveSite, 1500);
check('...and walk away from Chainfield for good', tGone >= 0 && !p.mem.slaveSite, `${tGone} s, ${Math.round(Math.hypot(p.x - cf.x, p.z - cf.z))} m out, bounty ${p.bounty.chainhouse ?? 0}`);
// seen again an hour later they may be reported again; what must not happen is a report every second in sight
const hoursLoose = 1 + Math.floor((S.clock.t - runT0) / HOUR);
check('a runaway seen leaving is reported at most once an hour, not every second in sight', (p.bounty.chainhouse ?? 0) <= 1000 * hoursLoose, `bounty ${p.bounty.chainhouse ?? 0} over ${hoursLoose} hour(s) loose`);
check('nobody is caged for slavery', !p.cage && !cages.some((c) => c.occupant === p.id));

// ---------------------------------------------------------------- a caged prisoner works the lock from inside
S.clock.t = Math.floor(S.clock.t / DAY) * DAY + 14 * HOUR;
const q = mine(cf.x, cf.z);
const cage = cages.find((c) => !c.occupant)!;
cage.occupant = q.id; q.cage = cage.id; q.x = cage.x; q.z = cage.z; q.y = T.heightAt(q.x, q.z);
q.mem.jailUntil = S.clock.t + 2 * DAY;
const cq = captivity(q);
check('a caged prisoner is told of the sentence and the lock', cq.kind === 'caged' && cq.order?.k === 'lockpick' && cq.passes && /2 days/.test(cq.text), cq.text);
notices.length = 0;
q.order = { k: 'move', x: q.x + 20, z: q.z };
q.hunger = 20;
step(5);
check('a caged prisoner cannot walk off, and is told so', !q.order && Math.hypot(q.x - cage.x, q.z - cage.z) < 0.1 && notices.some((n) => /locked in a cage/.test(n)));
check('...and the jailers feed them enough to stand', q.hunger >= 89, `hunger ${q.hunger.toFixed(0)}`);
const lq0 = q.sk[SK.lockpicking];
const lock0 = cage.locked ?? 0;
q.order = { k: 'lockpick', obj: q.cage, id: q.id };
const tOut = until(() => !q.cage, 1800);
const gain = q.sk[SK.lockpicking] - lq0;
check('...but can pick the lock from inside', tOut >= 0 && !cage.occupant && !q.mem.jailUntil, `${tOut} s`);
check('...and one escape is no lockpicking school', gain > 0 && gain <= 6, `lockpicking ${lq0.toFixed(1)} -> ${q.sk[SK.lockpicking].toFixed(1)} over ${tOut} s`);
check('...and is standing outside the cage', !q.cage && Math.hypot(q.x - cage.x, q.z - cage.z) > 0.5 && nav.walkable(q.x, q.z), `${Math.hypot(q.x - cage.x, q.z - cage.z).toFixed(1)} m from the cage`);
check('the lock is not broken by picking it: the next prisoner faces the same lock', (cage.locked ?? 0) === lock0 && lock0 > 0, `lock ${lock0}`);
W.removeChar(q); sq.members = sq.members.filter((m) => m !== q.id);

// ---------------------------------------------------------------- arrested where there is no cell: a fine, not a free pardon
const horn = T.sites.find((s) => s.settlement === 'hornspire')!;
const r = mine(horn.x + horn.r + 30, horn.z);
r.bounty.karuk = 2500; W.money = 800;
const gsq = new Squad(); gsq.faction = 'karuk'; gsq.kind = 'patrol'; gsq.name = 'Horn guard'; W.addSquad(gsq);
const g = makePerson(W, { faction: 'karuk', role: 'guard', level: 30, whole: true }, rng);
W.moveToSquad(g, gsq); g.x = r.x + 3; g.z = r.z; g.y = T.heightAt(g.x, g.z); g.homeX = g.x; g.homeZ = g.z;
knockOut(r, 'surrendered'); r.body.koT = -30; g.brain.task = { k: 'arrest', id: r.id, t: 0 }; // "I surrender." (dialogue.ts)
notices.length = 0;
focus.x = r.x; focus.z = r.z;
const tFine = until(() => !g.brain.task && !g.carrying, 3000);
check('with no cell in any Karuk town, a surrendered outlaw is fined what they have, and still owes the rest', tFine >= 0 && W.money === 0 && r.bounty.karuk === 1700 && !r.cage && (r.mem.grace?.karuk ?? 0) > S.clock.t, `purse 800 -> ${W.money}, bounty 2500 -> ${r.bounty.karuk ?? 0}: ${notices.find((n) => /no cell/.test(n)) ?? 'no notice'}`);
step(120);
check('...and for a while the guard who took the fine leaves them be', r.lastHitBy === 0 && !r.carriedBy && !g.brain.task && r.bounty.karuk === 1700, `hit by ${r.lastHitBy}`);
W.removeChar(g); W.removeChar(r); sq.members = sq.members.filter((m) => m !== r.id);
focus.x = cf.x; focus.z = cf.z;

// ---------------------------------------------------------------- every captive state names a way out, or passes by itself
const k = mine(cf.x + cf.r + 60, cf.z + 40);
k.body.hp[1] = -20; knockOut(k);
check('out cold: it passes', captivity(k).kind === 'down' && captivity(k).passes);
check('...and it does: they wake', until(() => k.status === 'up', 900) >= 0);
const c2 = cages.find((c) => !c.occupant)!;
c2.occupant = k.id; k.cage = c2.id; k.x = c2.x; k.z = c2.z;
check('caged with no sentence: the lock from inside', captivity(k).kind === 'caged' && captivity(k).order?.k === 'lockpick' && !captivity(k).passes && /no sentence/.test(captivity(k).text), captivity(k).text);
k.mem.jailUntil = S.clock.t - 1;
step(2);
check('a served sentence opens the cage', !k.cage && !c2.occupant);
k.shackled = true; k.mem.enslavedBy = 'chainhouse'; k.mem.slaveSite = cf.id;
check('a shackled slave: the shackles', captivity(k).kind === 'slave' && captivity(k).order?.k === 'free');
k.mem.enslavedBy = undefined; k.mem.slaveSite = undefined;
check('shackles alone hold nobody', captivity(k).kind === 'free');
k.shackled = false;
// an older save: caged by slavers with no sentence, the state that once was for good
const c3 = cages.find((c) => !c.occupant)!;
c3.occupant = k.id; k.cage = c3.id; k.x = c3.x; k.z = c3.z; k.mem.enslavedBy = 'chainhouse';
S.clock.t = Math.floor(S.clock.t / DAY) * DAY + 9 * HOUR;
step(2);
check('a caged slave from an older save is let out to the fields', !k.cage && !c3.occupant && k.shackled && k.mem.slaveSite === cf.id && fieldDist(k) < 30, `${fieldDist(k).toFixed(0)} m from a field`);
const all = [p, k].map((c) => captivity(c));
check('no state leaves everyone with nothing: each is free, passes, or has an order', all.every((c) => c.kind === 'free' || c.passes || !!c.order), all.map((c) => c.kind).join(', '));

const failed = results.filter((x) => !x[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
