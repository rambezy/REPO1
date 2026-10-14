// Headless checks of the body and combat model, somewhere quiet in the
// waste: a duel to the knockout (the shorter reach stepping in), wounds that
// bleed, blood loss, a limb cut off, a knockout slept off, crossbow fire,
// skills that grow from use (toughness from a beating, not from beatings
// back to back), a faction that sours when its people are beaten, bandits
// that go for the player's people on sight, and chases: a faster fighter
// catches a runner, an order after one who cannot be caught is given up,
// the world's people do not follow anyone across the whole waste, but
// bounty hunters do, and the law runs a wanted man the length of a town.
// Usage: npx tsx tools/combattest.ts
import { generateWorld } from '../src/world/gen';
import { Nav, type StructPrim } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR, DAY } from '../src/sim/clock';
import { RNG } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep, updateActivation } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { structuresIn, townRings } from '../src/sim/structures';
import { applyDamage, shoot, dist } from '../src/sim/combat';
import { LEASH, LAW_LEASH, CHASE_GIVE_UP } from '../src/sim/ai';
import { LI } from '../src/sim/body';
import { SK } from '../src/sim/skills';
import { Squad } from '../src/sim/squad';
import { makePerson, makeAnimal } from '../src/sim/spawn';
import { knockOut } from '../src/sim/health';
import { makeItem } from '../src/sim/inventory';
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

// flat, open ground well away from anywhere
let ax = 0, az = 0;
search: for (let z = 1500; z < 14000; z += 400) for (let x = 1500; x < 14000; x += 400) {
  if (T.heightAt(x, z) < 2 || T.slopeAt(x, z) > 0.15 || !T.sites.every((s) => Math.hypot(s.x - x, s.z - z) > s.r + 500)) continue;
  let open = true;
  for (let dx = -30; dx <= 30 && open; dx += 3) for (let dz = -30; dz <= 30 && open; dz += 3) open = nav.walkable(x + dx, z + dz) && T.slopeAt(x + dx, z + dz) < 0.3;
  if (open) { ax = x; az = z; break search; }
}
if (!ax) throw new Error('no open ground');
console.log(`arena at ${ax}, ${az} in ${T.regionAt(ax, az).key}`);

const player = new Squad(); player.faction = 'player'; player.kind = 'player'; player.name = 'Test'; W.addSquad(player); W.playerSquads.push(player.id);
const rng = new RNG(5);
function person(faction: string, role: any, dx: number, dz: number, extra: Record<string, unknown> = {}): Char {
  const c = makePerson(W, { faction: faction === 'player' ? 'drifters' : faction, role, level: 30, ...extra } as any, rng);
  if (faction === 'player') { c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, player); }
  c.x = ax + dx; c.z = az + dz; c.y = T.heightAt(c.x, c.z); c.homeX = c.x; c.homeZ = c.z;
  c.hunger = 300;
  return c;
}
const dt = 0.1;
const step = (secs: number) => { for (let i = 0; i < secs / dt; i++) { simStep(dt, { x: ax, z: az }); tickSquads(dt); } };
const results: [string, boolean, string][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok, info]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const hurt = (c: Char) => [...c.body.max].reduce((n, m, i) => n + Math.max(0, m - c.body.hp[i]), 0);
const clearArena = () => { for (const c of [...W.chars.values()]) if (c.faction !== 'player' || c.squad === player.id) W.removeChar(c); player.members.length = 0; };

/** Puts a weapon in someone's hand, with the skill to use it (as their gear would have come with). */
function arm(c: Char, id: string) {
  if (c.eq.weapon?.id === id) return;
  c.eq.weapon = makeItem(id, 1, 2);
  const s = SK[c.weaponStats().skill];
  c.sk[s] = Math.max(c.sk[s], c.sk[SK.melee_atk]);
}

// 1. a duel to the knockout, and what the fighters learn from it: a slab against a spear, the slab
// half a metre out of its reach, so it has to step in (it once stood there and took every blow)
{
  const a = person('player', 'player', 0, 0, { loadout: 'merc' });
  const b = person('reavers', 'bandit', 2.5, 0);
  arm(a, 'slab');
  arm(b, 'spear');
  const before = [SK.melee_atk, SK.melee_def, SK.toughness].map((k) => a.sk[k]);
  let bled = 0, t = 0, first = -1;
  const swings = [0, 0], was = [false, false];
  while (a.up && b.up && t < 600) {
    simStep(dt, { x: ax, z: az }); tickSquads(dt); t += dt;
    [a, b].forEach((c, i) => { if (c.atk && !was[i]) swings[i]++; was[i] = !!c.atk; });
    if (swings[0] && first < 0) first = t;
    bled = Math.max(bled, a.body.bleeding(), b.body.bleeding());
  }
  const loser = a.up ? b : a;
  check('a melee duel ends in a knockout or a death', !a.up || !b.up, `${Math.round(t)} s; ${loser.name} ${loser.status}, ${hurt(loser).toFixed(0)} damage taken`);
  check('the shorter reach steps in and swings within 5 s', first >= 0 && first <= 5, `${a.name}'s slab first swung at ${first < 0 ? 'never' : `${first.toFixed(1)} s`}`);
  check('both fighters swing', swings[0] > 0 && swings[1] > 0, `slab ${swings[0]}, spear ${swings[1]}`);
  check('blows land on the body parts and open bleeding wounds', hurt(a) + hurt(b) > 40 && bled > 0, `worst bleeding ${bled.toFixed(2)}/s`);
  const after = [SK.melee_atk, SK.melee_def, SK.toughness].map((k) => a.sk[k]);
  check('fighting trains attack, defence and toughness, all three', after.every((v, i) => v > before[i]), `atk ${before[0].toFixed(1)} -> ${after[0].toFixed(1)}, def ${before[1].toFixed(1)} -> ${after[1].toFixed(1)}, tough ${before[2].toFixed(1)} -> ${after[2].toFixed(1)}`);
  clearArena();
}

// ...and toughness comes from a beating, not from one beating after another
{
  const v = person('player', 'player', 0, 0);
  const by = person('reavers', 'bandit', 40, 0);
  const limbs = [LI.larm, LI.rarm, LI.lleg, LI.rleg];
  const beating = () => {
    const t0 = v.sk[SK.toughness];
    for (let i = 0; i < 40; i++) { const l = limbs[i % 4]; v.body.hp[l] = v.body.max[l]; applyDamage(v, l, 0, 10, by, 0, false); }
    return v.sk[SK.toughness] - t0;
  };
  const once = beating(), again = beating();
  S.clock.t += DAY;
  const rested = beating();
  check('a beating toughens, one straight after much less, and the next day more again', once > 0.5 && again < once * 0.6 && rested > again * 1.2,
    `+${once.toFixed(2)}, then +${again.toFixed(2)} straight after, +${rested.toFixed(2)} a day later`);
  clearArena();
}

// 2. an untreated wound drains blood until it clots, or the bleeder dies
{
  const c = person('drifters', 'resident', 0, 0);
  applyDamage(c, LI.stomach, 55, 0, null, 1.6, false);
  applyDamage(c, LI.larm, 40, 0, null, 1.6, false);
  const blood0 = c.body.blood, bleed0 = c.body.bleeding();
  let t = 0;
  while (c.alive && c.body.bleeding() > 0.01 && t < 6 * HOUR) { step(10); t += 10; }
  check('open wounds bleed and the bleeding stops (clotting) or kills', bleed0 > 0 && c.body.blood < blood0 && (c.body.bleeding() <= 0.01 || !c.alive),
    `bled ${(blood0 - c.body.blood).toFixed(0)} of ${blood0.toFixed(0)} blood over ${(t / 60).toFixed(0)} min; now ${c.status}`);
  clearArena();
}

// ...while a light cut clots by itself
{
  const c = person('drifters', 'resident', 0, 0);
  applyDamage(c, LI.larm, 14, 0, null, 1, false);
  const blood0 = c.body.blood, bleed0 = c.body.bleeding();
  let t = 0;
  while (c.alive && c.body.bleeding() > 0.005 && t < 2 * HOUR) { step(5); t += 5; }
  check('a light cut stops bleeding on its own', bleed0 > 0 && c.alive && c.body.bleeding() <= 0.005, `bleeding ${bleed0.toFixed(2)}/s at first; lost ${(blood0 - c.body.blood).toFixed(0)} blood; ${c.status} after ${(t / 60).toFixed(1)} min`);
  clearArena();
}

// 3. a limb hacked past its limit comes off
{
  const c = person('drifters', 'resident', 0, 0);
  let hits = 0;
  while (!(c.body.lost & (1 << LI.rarm)) && hits < 200) { applyDamage(c, LI.rarm, 60, 10, null, 0, false); hits++; }
  check('a limb beaten past its maximum can be severed', !!(c.body.lost & (1 << LI.rarm)), `${hits} blows; arm ${c.body.lost & (1 << LI.rarm) ? 'lost' : 'still on'}; now ${c.status}`);
  clearArena();
}

// 4. a knockout from blunt blows is slept off
{
  const c = person('drifters', 'resident', 0, 0);
  let hits = 0;
  while (c.up && hits < 50) { applyDamage(c, LI.head, 0, 20, null, 0, false); hits++; }
  const ko = c.status;
  let t = 0;
  while (c.status === 'ko' && t < 4 * HOUR) { step(10); t += 10; }
  check('a knockout wears off and the person gets up', ko === 'ko' && c.status === 'up', `knocked out after ${hits} blows, up again after ${(t / 60).toFixed(0)} min`);
  clearArena();
}

// 5. crossbow fire: bolts spent, hits taken, the shooter learns
{
  const s = person('player', 'player', 0, 0, { loadout: 'merc' });
  s.eq.ranged = { uid: 9001, id: 'bolt_thrower', q: 2, n: 1, x: 0, y: 0 } as any;
  s.inv.add('bolts', 40);
  const target = person('drifters', 'resident', 0, 22);
  target.combatMode = 'passive';
  const bolts0 = s.inv.count('bolts'), prec0 = s.sk[SK.precision], hp0 = hurt(target);
  // every shot costs a bolt, ordered here or loosed by the shooter's own sense (at a target that fights back, then runs)
  let shots = 0, fired = 0, t = 0;
  const shot = S.fx.shot;
  S.fx.shot = (from, ...rest) => { if (from === s) fired++; shot(from, ...rest); };
  // (eight shots, or more until one lands: a middling shot misses a good deal at 22 m)
  while ((shots < 8 || hurt(target) === hp0) && shots < 24 && target.up && t < 600) { if (s.reload <= 0 && shoot(s, target)) shots++; step(0.5); t += 0.5; }
  S.fx.shot = shot;
  check('a crossbow shoots, spends bolts and wounds its target', shots > 0 && s.inv.count('bolts') === bolts0 - fired && hurt(target) > hp0, `${fired} shots, ${bolts0 - s.inv.count('bolts')} bolts spent, ${(hurt(target) - hp0).toFixed(0)} damage`);
  check('shooting trains precision', s.sk[SK.precision] > prec0, `${prec0.toFixed(1)} -> ${s.sk[SK.precision].toFixed(1)}`);
  clearArena();
}

// 6. beating a faction's people sours it
{
  const a = person('player', 'player', 0, 0, { loadout: 'merc' });
  const v = person('concord', 'resident', 1.5, 0);
  const r0 = W.rel.get('player', 'concord');
  let hits = 0;
  while (v.up && hits < 60) { applyDamage(v, LI.chest, 0, 25, a, 0, false); hits++; }
  check('knocking out a faction member lowers its regard for you', W.rel.get('player', 'concord') < r0, `concord ${r0} -> ${W.rel.get('player', 'concord')}`);
  clearArena();
}

// 7. bandits go for the player's people on sight
{
  const p = person('player', 'player', 0, 0, { loadout: 'merc' });
  const band = new Squad(); band.faction = 'reavers'; band.kind = 'raid'; band.name = 'Reavers'; W.addSquad(band);
  const bandits = [0, 1, 2].map((i) => { const c = person('reavers', 'bandit', 14 + i * 1.5, 4); W.moveToSquad(c, band); return c; });
  let t = 0;
  while (t < 60 && !bandits.some((b) => b.brain.enemy === p.id || b.target === p.id)) { step(1); t++; }
  const engaged = bandits.filter((b) => b.brain.enemy === p.id || b.target === p.id).length;
  step(20);
  check('bandits in sight pick a fight with the player', engaged > 0 && (hurt(p) > 0 || !p.up), `${engaged}/3 engaged within ${t} s; ${p.name} took ${hurt(p).toFixed(0)} damage`);
}

// 8. chases
clearArena();
const chase = (who: Char, secs: number, done: () => boolean) => { let t = 0; while (t < secs && !done()) { simStep(dt, { x: who.x, z: who.z }); tickSquads(dt); t += dt; } return t; };
const reavers = () => { const s = new Squad(); s.faction = 'reavers'; s.kind = 'raid'; s.name = 'Reavers'; s.spoke = true; W.addSquad(s); return s; };
{
  // a beaten Reaver runs for it, slowed by his legs; a quicker fighter ordered after him lands a blow before long
  const a = person('player', 'player', 0, 0, { loadout: 'merc' });
  const b = person('reavers', 'bandit', 4, 0, { level: 20, whole: true });
  W.moveToSquad(b, reavers());
  for (let l = 0; l < 7; l++) b.body.hp[l] = b.body.max[l] * 0.25;
  b.lastHitBy = a.id; b.lastHitT = S.time;
  a.order = { k: 'attack', id: b.id };
  const t0 = S.time, x0 = a.x, z0 = a.z;
  const hit = () => b.lastHitBy === a.id && b.lastHitT > t0;
  const t = chase(a, 30, hit);
  check('a faster fighter lands a blow on a hurt runner within 15 s', hit() && t <= 15, `${a.moveSpeed('run').toFixed(1)} m/s after ${b.moveSpeed('run').toFixed(1)} m/s; ${hit() ? `first blow at ${t.toFixed(1)} s, ${Math.hypot(a.x - x0, a.z - z0).toFixed(0)} m on` : 'not one'}`);
  clearArena();
}
{
  // ...but on hurt legs, after one on sound ones, the order is given up, and said so (once, for the two of them)
  const ours = [0, 1.5].map((dz) => person('player', 'player', 0, dz, { loadout: 'merc' }));
  for (const a of ours) for (const l of [LI.lleg, LI.rleg]) a.body.hp[l] = a.body.max[l] * 0.3;
  const b = person('reavers', 'bandit', 4, 0, { level: 20, whole: true });
  W.moveToSquad(b, reavers());
  for (const l of [LI.head, LI.chest, LI.stomach]) b.body.hp[l] = b.body.max[l] * 0.05;
  for (const l of [LI.larm, LI.rarm]) b.body.hp[l] = 0;
  b.lastHitBy = ours[0].id; b.lastHitT = S.time;
  for (const a of ours) a.order = { k: 'attack', id: b.id };
  const said: string[] = [], notice = S.fx.notice;
  S.fx.notice = (text: string) => { said.push(text); };
  const t = chase(ours[0], CHASE_GIVE_UP + 15, () => ours.every((a) => !a.order));
  S.fx.notice = notice;
  const gave = said.filter((x) => /gave up the chase/.test(x));
  check('an attack order on someone who cannot be caught is given up, and said so once', ours.every((a) => !a.order) && gave.length === 1, `${ours[0].moveSpeed('run').toFixed(1)} m/s after ${b.moveSpeed('run').toFixed(1)} m/s; ${ours.some((a) => a.order) ? 'still at it' : `both dropped it by ${t.toFixed(0)} s`}; ${gave.length} notice${gave.length === 1 ? '' : 's'}${gave.length ? `: "${gave[0]}"` : ''}`);
  clearArena();
}
{
  // a Reaver after one of the player's people who keeps running turns back in the end
  const p = person('player', 'player', 0, 0);
  p.combatMode = 'passive';
  p.sk[SK.athletics] = 80;
  const r = person('reavers', 'bandit', 10, 0, { level: 14, loadout: 'reavers_young', whole: true });
  W.moveToSquad(r, reavers());
  let start: [number, number] | null = null, far = 0;
  chase(p, 90, () => {
    if (!start && r.brain.enemy === p.id) { start = [r.x, r.z]; p.order = { k: 'move', x: p.x - 500, z: p.z + 40 }; }
    if (start) far = Math.max(far, Math.hypot(r.x - start[0], r.z - start[1]));
    return false;
  });
  const from = start as [number, number] | null;
  const back = from ? Math.hypot(r.x - from[0], r.z - from[1]) : Infinity;
  check(`one of the world's people gives up a chase about ${LEASH} m out`, !!from && far <= LEASH + 10 && back <= LEASH + 10 && r.brain.enemy !== p.id && dist(p, r) > 2 * LEASH, from ? `chased ${far.toFixed(0)} m, now ${back.toFixed(0)} m from where it began, the runner ${dist(p, r).toFixed(0)} m off` : 'never gave chase');
  clearArena();
}

/** Sets someone's athletics so they run about as fast as `speed` (m/s). */
const runAt = (c: Char, speed: number) => { let best = 0, bd = Infinity; for (let a = 0; a <= 100; a++) { c.sk[SK.athletics] = a; const d = Math.abs(c.moveSpeed('run') - speed); if (d < bd) { bd = d; best = a; } } c.sk[SK.athletics] = best; return c.moveSpeed('run'); };
{
  // bounty hunters after a quarry a touch faster than them keep at it well past where others would turn back
  const p = person('player', 'player', 0, 0);
  p.combatMode = 'passive';
  p.bounty.concord = 2000;
  const sq = new Squad(); sq.faction = 'concord'; sq.kind = 'bounty'; sq.name = 'Hunters'; sq.task = { k: 'hunt', target: p.id }; sq.flags.spec = 'hunters'; sq.flags.hunt = p.id; W.addSquad(sq);
  const hunters = [0, 2].map((dx) => { const h = person('concord', 'patrol', dx, 20, { level: 25, whole: true }); W.moveToSquad(h, sq); return h; });
  const L = hunters[0], x0 = L.x, z0 = L.z;
  runAt(p, L.moveSpeed('run') + 0.35);
  p.order = { k: 'move', x: p.x, z: p.z - 900 };
  let far = 0, shed = false;
  chase(p, 60, () => { far = Math.max(far, Math.hypot(L.x - x0, L.z - z0)); shed ||= L.brain.letGo === p.id; return !p.up; });
  check(`bounty hunters are not shed at ${LEASH} m by a quarry a little faster`, far > LEASH + 20 && !shed, `the leader ran ${far.toFixed(0)} m after them${shed ? ', then gave up' : ''}`);
  clearArena();
}
{
  // a town guard runs a wanted thief the length of a town, and no further
  const p = person('player', 'player', 0, 0);
  p.combatMode = 'passive';
  p.bounty.drifters = 800;
  const g = person('drifters', 'guard', 0, 12, { level: 25 });
  runAt(p, g.moveSpeed('run') + 0.35);
  let far = 0, began = false;
  chase(p, 120, () => {
    if (!began && g.brain.enemy === p.id) { began = true; p.order = { k: 'move', x: p.x, z: p.z - 600 }; }
    far = Math.max(far, Math.hypot(g.x - g.homeX, g.z - g.homeZ));
    return false;
  });
  check(`a guard keeps after a wanted thief to about ${LAW_LEASH} m from his post, and no further`, began && far > LEASH + 30 && far <= LAW_LEASH + 10, began ? `ran ${far.toFixed(0)} m from his post; now ${dist(g, p).toFixed(0)} m behind` : 'never gave chase');
  clearArena();
}
{
  // ...but someone walking off at a steady pace that a runner gains on is caught up with, however far:
  // the order is kept while it gains (the band the goal tracker names, walking its round)
  const a = person('player', 'player', 0, 0, { loadout: 'merc' });
  const b = person('drifters', 'resident', 60, 0);
  b.combatMode = 'passive';
  a.order = { k: 'attack', id: b.id };
  const said: string[] = [], notice = S.fx.notice;
  S.fx.notice = (text: string) => { said.push(text); };
  const pace = 2.4;
  let t = 0;
  while (t < 120 && a.order && b.lastHitBy !== a.id) {
    simStep(dt, { x: a.x, z: a.z }); tickSquads(dt);
    if (b.lastHitBy !== a.id) { b.x += pace * dt; b.y = T.heightAt(b.x, b.z); b.speed = pace; b.path = null; }
    t += dt;
  }
  S.fx.notice = notice;
  check('an attack order on someone walking off more slowly is kept till they are caught', b.lastHitBy === a.id && !said.some((x) => /gave up the chase/.test(x)), `${a.moveSpeed('run').toFixed(1)} m/s after ${pace} m/s from 60 m: ${b.lastHitBy === a.id ? `caught after ${t.toFixed(0)} s` : a.order ? 'still at it' : 'given up'}`);
  clearArena();
}
{
  // ...and one who stops and starts (fifteen seconds a little quicker than the runner, ten at a walk) is still being
  // closed on: the stretches that bring the runner nearer than ever wipe out the ones that do not, so a long chase
  // is not given up while it closes, though more than half a minute of it gains nothing
  const a = person('player', 'player', 0, 0, { loadout: 'merc' });
  const b = person('drifters', 'resident', 50, 0);
  b.combatMode = 'passive';
  a.order = { k: 'attack', id: b.id };
  const said: string[] = [], notice = S.fx.notice;
  S.fx.notice = (text: string) => { said.push(text); };
  const quick = a.moveSpeed('run') * 1.25, slow = 1;
  let t = 0;
  while (t < 200 && a.order && b.lastHitBy !== a.id) {
    b.knockT = 1; // (it goes only where it is put)
    simStep(dt, { x: a.x, z: a.z }); tickSquads(dt);
    const pace = t % 25 < 15 ? quick : slow;
    if (b.lastHitBy !== a.id) { b.x += pace * dt; b.y = T.heightAt(b.x, b.z); b.speed = pace; b.path = null; }
    t += dt;
  }
  S.fx.notice = notice;
  check('an attack order on someone who stops and starts is kept while it closes, past half a minute of stretches gaining nothing', b.lastHitBy === a.id && t > 45 && !said.some((x) => /gave up the chase/.test(x)), `${a.moveSpeed('run').toFixed(1)} m/s after ${quick.toFixed(1)}/${slow} m/s by turns from 50 m: ${b.lastHitBy === a.id ? `caught after ${t.toFixed(0)} s` : a.order ? 'still at it' : `given up after ${t.toFixed(0)} s`}`);
  clearArena();
}
{
  // ...and an order on someone who cannot be got at, standing in a pen with no way in, is given up too
  const a = person('player', 'player', 0, 0, { loadout: 'merc' });
  const b = person('drifters', 'resident', 12, 0);
  b.combatMode = 'passive';
  const pen: StructPrim[] = [[0, -4, 4.5, 0.3], [0, 4, 4.5, 0.3], [-4, 0, 0.3, 4.5], [4, 0, 0.3, 4.5]].map(([dx, dz, hx, hz]) => ({ kind: 'rect', x: b.x + dx, z: b.z + dz, hx, hz }));
  nav.structures = (x0, z0, x1, z1) => [...structuresIn(x0, z0, x1, z1), ...pen];
  nav.invalidate(b.x - 10, b.z - 10, b.x + 10, b.z + 10);
  a.order = { k: 'attack', id: b.id };
  const said: string[] = [], notice = S.fx.notice;
  S.fx.notice = (text: string) => { said.push(text); };
  const t = chase(a, CHASE_GIVE_UP + 20, () => !a.order);
  S.fx.notice = notice;
  nav.structures = structuresIn;
  nav.invalidate(b.x - 10, b.z - 10, b.x + 10, b.z + 10);
  check('an attack order on someone who cannot be got at is given up', !a.order && said.some((x) => /gave up the chase/.test(x)), `${a.order ? 'still at it' : `dropped after ${t.toFixed(0)} s`}, ${dist(a, b).toFixed(1)} m off behind the pen's wall`);
  clearArena();
}

// 12. the downed can be finished: nobody dies in the fall itself (see combat's DOWN_GRACE), but a deliberate
// "Finish them" with a club, which never bleeds, kills a knocked-out foe within a couple of minutes, and a
// hound left with one eats it
{
  clearArena();
  const a = person('player', 'player', 0, 0, { loadout: 'merc' });
  arm(a, 'iron_club');
  const v = person('reavers', 'bandit', 2, 0, { level: 18, loadout: 'reavers_bandit' });
  updateActivation({ x: ax, z: az });
  knockOut(v, 'test');
  a.brain.finish = v.id; a.order = { k: 'attack', id: v.id }; a.mem.enemies = [v.id];
  let t = 0;
  while (t < 240 && v.status !== 'dead') { step(0.5); t += 0.5; if (v.status === 'up') knockOut(v, 'again'); }
  check('"Finish them" with an iron club kills a downed foe within about two minutes', v.status === 'dead' && t <= 150, `${t.toFixed(0)} s`);
  clearArena();
  const w = person('reavers', 'bandit', 0, 0, { level: 18, loadout: 'reavers_bandit' });
  const hound = makeAnimal(W, 'dunehound', rng, 10);
  hound.x = w.x + 2; hound.z = w.z; hound.y = T.heightAt(hound.x, hound.z); hound.homeX = hound.x; hound.homeZ = hound.z; hound.hunger = 50;
  hound.mem.enemies = [w.id]; hound.brain.enemy = w.id;
  updateActivation({ x: ax, z: az });
  knockOut(w, 'test');
  let th = 0;
  while (th < 240 && w.status !== 'dead') { step(0.5); th += 0.5; }
  check('a dunehound kills the downed person it is left with', w.status === 'dead' && th <= 120, `${th.toFixed(0)} s`);
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
