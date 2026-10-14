// Character AI. Every few tenths of a second each active character decides
// what to do: follow the player's order, fight, flee, help the fallen, carry
// captives, loot, or get on with its routine. The chosen behaviour then runs
// every step.
import { Char } from './char';
import { S } from './ctx';
import { hostile, dist, reach, startAttack, tickAttack, canShoot, shoot, rangedStats, strengthOf, beastLaser, blowWillLand, receding } from './combat';
import { goTo, stop, near, toolsDown } from './move';
import { ANIMAL } from '../content/animals';
import { FACTION } from '../content/factions';
import { ITEM } from '../content/items';
import { findMedkit, limbToTreat, treatLimb, dropCarried } from './health';
import { angleTo } from '../core/math';
import { LI } from './body';
import { runOrder } from './orders';
import { runRoutine } from './routine';
import { runJobs, jobsHeld } from './jobs';
import { wantsToTalk } from './encounters';
import { leaveFurniture, leaveBed } from './use';
import { machineSay } from './machines';
import { stimFor, takeDrug } from './drugs';
import { train } from './train';
import { HOUR } from './clock';
import type { Site } from '../world/terrain';

export const SIGHT_DAY = 42;
export const SIGHT_NIGHT = 24;

/** How far a character notices others, reduced at night and by sneaking. */
export function canSee(c: Char, o: Char): boolean {
  const d = dist(c, o);
  // by night only lamplit ground is seen as by day
  let r = S.clock.isNight && !lamplit(o.x, o.z) ? SIGHT_NIGHT : SIGHT_DAY;
  // a lookout up a watchtower sees twice as far
  if (c.mem.using && onTower(c)) r *= 2;
  if (c.animal) r = Math.max(r, ANIMAL[c.animal].aggro);
  if (o.move === 'sneak' && o.speed < 3 && o.up) {
    const stealth = o.skill('stealth') * (1 - o.armourPenalty('stealth'));
    const per = c.skill('perception') + 10;
    r *= Math.max(0.12, 0.9 - (stealth - per * 0.5) * 0.012);
    // from behind is harder
    const facing = Math.abs(((angleTo(c.x, c.z, o.x, o.z) - c.dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (facing > 1.8) r *= 0.55;
  }
  if (!c.awake) r *= 0.15;
  if (S.weather) r *= S.weather.sight(c.x, c.z);
  return d <= r;
}

/** The watchtower someone is up, if they are. */
export function onTower(c: Char) {
  const t = c.mem.using ? S.W.objs.get(c.mem.using) : undefined;
  return t?.kind === 'tower' && Math.hypot(c.x - t.x, c.z - t.z) < 0.6 ? t : undefined;
}

/** How far a lamp lights the ground around it. */
export const LAMP_R = 9;
/** Is this spot lit by a lamp? */
export function lamplit(x: number, z: number) {
  let lit = false;
  S.W.objHash.near(x, z, LAMP_R, (l) => { if (!lit && l.kind === 'lamp' && Math.hypot(l.x - x, l.z - z) < LAMP_R) lit = true; });
  return lit;
}

/** Nearest visible enemy within a radius. */
export function findEnemy(c: Char, radius: number): Char | null {
  let best: Char | null = null, bd = Infinity;
  const onlyUp = !(c.animal && ANIMAL[c.animal].eatsDowned);
  S.W.hash.near(c.x, c.z, radius, (o, d2) => {
    if (o === c || !o.alive || o.carriedBy || o.cage) return;
    if (onlyUp && o.status !== 'up') return;
    if (o.shackled && o.mem.enslavedBy === c.faction && !((o.bounty[c.faction] ?? 0) > 0)) return; // their own chained slaves are worked, not fought (a runaway is another matter)
    if (o.mem.grace?.[c.faction] > S.clock.t && !S.W.rel.hostile(c.faction, o.faction)) return; // fined and turned loose: the law leaves them be a while
    if (heldBy(o, c.faction) || heldBy(c, o.faction)) return; // their catch, down or just come round, and the catch, dazed: each lets the other be (see deliverCaptive)
    if (!hostile(c, o)) return;
    if (forsaken(c, o)) return;
    if (!canSee(c, o) && o.lastHitBy !== c.id && c.lastHitBy !== o.id) return;
    let d = d2;
    if (o.status !== 'up') d *= 4; // prefer those still fighting
    if (o.id === c.lastHitBy && S.time - c.lastHitT < 8) d *= 0.3;
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}

export function allies(c: Char, radius: number): Char[] {
  const out: Char[] = [];
  S.W.hash.near(c.x, c.z, radius, (o) => {
    if (o !== c && o.up && (o.squad === c.squad || o.faction === c.faction)) out.push(o);
  });
  return out;
}

/** Runs a fight with a target: close in, strike, or shoot. */
export function fight(c: Char, t: Char, dt: number) {
  c.target = t.id;
  if (!c.drawn && (c.mem.sit || c.mem.using)) { c.mem.sit = false; leaveFurniture(c); }
  // (when this fight began: the lane and the steps go by it, so a fight runs the same whenever it starts)
  if (!c.drawn) c.brain.fightAt = S.time;
  c.drawn = true;
  if (c.knockT > 0 || c.stagger > 0) return;
  const d = dist(c, t);
  if (c.atk) return;
  // machines with beams fire at range: a warbot stands and fires, a drone burns and closes in
  const beam = c.animal ? ANIMAL[c.animal].laser : undefined;
  if (beam && d > reach(c) + 1.5 && d < beam.range * 0.95) {
    if (beastLaser(c, t) || beam.heavy) { stop(c); c.dir = angleTo(c.x, c.z, t.x, t.z); return; }
  }
  // crossbows (and beam guns) at range
  if (!c.animal && canShoot(c) && d > 5 && d < (rangedStats(c)?.range ?? 0) * 0.95) {
    stop(c);
    c.dir = angleTo(c.x, c.z, t.x, t.z);
    if (c.reload <= 0) shoot(c, t);
    return;
  }
  const r = reach(c);
  // (a blow at someone getting away faster than the attacker can follow would only fall short: keep after them)
  if (d <= r && blowWillLand(c, t)) {
    // a step round the target under way is finished first (see sidestep)
    if (c.brain.stepping) { if (c.hasGoal && S.time - c.brain.stepAt < 0.7) return; c.brain.stepping = false; }
    stop(c);
    c.dir = angleTo(c.x, c.z, t.x, t.z);
    if (c.atkCD <= 0 && c.canUseWeapon()) startAttack(c, t, !c.animal && c.weaponStats().kind === 'unarmed' && S.rng.chance(0.25));
    else if (c.atkCD <= 0 && !c.canUseWeapon() && !c.animal) startAttack(c, t, true); // kick
    // (every other beat, by the clock and who they are, not the world's dice: a step is only a step)
    else if (c.atkCD > 0.3 && !c.animal && !c.holdPos && S.time - (c.brain.stepAt ?? -9) > 2.5 && (Math.floor(S.time - (c.brain.fightAt ?? 0)) + c.id) % 2 === 0) sidestep(c, t, r);
  } else if (!c.holdPos || d < 6) {
    // approach to just inside reach; of someone getting away, to where they will be by then. From a way
    // off, fighters fan out into three lanes, so they arrive round their target and not in a file behind one another
    const lead = receding(c, t) > 0.3 ? Math.min(1, d / Math.max(1, c.moveSpeed('run'))) : 0;
    const px = t.x + t.vx * lead, pz = t.z + t.vz * lead;
    const a = angleTo(px, pz, c.x, c.z) + (d > r * 2.5 ? (((c.id + Math.floor(c.brain.fightAt ?? 0)) % 3) - 1) * 0.6 : 0);
    goTo(c, px + Math.sin(a) * (r * 0.7), pz + Math.cos(a) * (r * 0.7));
    c.move = 'run';
  }
}

/**
 * In the beat after a swing, a step round the target to one side (the side by who they are): a
 * brawl spreads into a ring of separate figures instead of a knot, and the next blow comes from a
 * new angle. Nowhere a foot cannot go.
 */
function sidestep(c: Char, t: Char, r: number) {
  const a = angleTo(t.x, t.z, c.x, c.z) + (c.id % 2 ? 0.55 : -0.55);
  const px = t.x + Math.sin(a) * r * 0.8, pz = t.z + Math.cos(a) * r * 0.8;
  if (!S.nav.walkable(px, pz)) return;
  goTo(c, px, pz);
  c.move = 'walk';
  c.brain.stepping = true;
  c.brain.stepAt = S.time;
}

/** Seconds of running after someone, with no blow struck either way, before giving it up. */
export const CHASE_GIVE_UP = 30;
/** An attack order's chase is judged in stretches this long (seconds)... */
const CHASE_WINDOW = 5;
/** ...and one that closes the gap by less than this (metres) brought them no nearer. */
const CHASE_GAIN = 1;
/** Farther off than this (metres), a stretch that brings them nearer than ever wipes the slate; nearer, a target kept just out of reach (round a wall) is not being caught. */
const CHASE_NEAR = 10;
/** How far a chase may draw one of the world's people from their own: the leader they keep with, their home, or where the fight began. */
export const LEASH = 60;
/** ...and how far the law runs a wanted man: the length of a town. */
export const LAW_LEASH = LEASH * 3;

/** Is c the law, after someone wanted by c's own people? */
const lawAfter = (c: Char, t: Char) => (c.role === 'guard' || c.role === 'patrol') && (t.bounty[c.faction] ?? 0) > 0;

/**
 * Counts how long someone has been after a target with no blow struck either way, and says when to
 * give it up: a target who keeps just out of reach, or who cannot be got at (across water, up a
 * ledge), could be chased for ever. Time counts while the target is on the move or the chaser is
 * getting no nearer.
 */
function outrun(c: Char, t: Char, dt: number, ordered = false): boolean {
  const B = c.brain;
  const d = dist(c, t);
  if (B.chase !== t.id) { B.chase = t.id; B.chaseT = 0; B.chaseBest = d; B.chaseMark = d; B.chaseMarkT = 0; B.chaseFloor = d; }
  const struck = Math.max(t.lastHitBy === c.id ? t.lastHitT : -1e9, c.lastHitBy === t.id ? c.lastHitT : -1e9);
  if (S.time - struck < 1) { B.chaseT = 0; B.chaseBest = d; B.chaseMark = d; B.chaseMarkT = 0; B.chaseFloor = d; }
  else if (d > reach(c)) {
    if (ordered) {
      // told to attack someone, your people keep after them while they gain on them, however far (a band
      // walking off is caught up with): only stretches of a few seconds that bring them no nearer count, so
      // a runner as quick as they are, or one they cannot get at, is still let go. (A fight they took up
      // themselves is let go as before: they are not to wander off after every runner.)
      // (a stretch that brings them nearer than they have ever been, while still some way off, wipes the slate:
      // a long chase with a detour or two is still closing; one round and round a wall, close by, is not)
      B.chaseMarkT = (B.chaseMarkT ?? 0) + dt;
      if (B.chaseMarkT >= CHASE_WINDOW) {
        const floor = B.chaseFloor ?? B.chaseMark ?? d;
        if (d < floor - CHASE_GAIN && d > CHASE_NEAR) B.chaseT = 0;
        else if (d > (B.chaseMark ?? d) - CHASE_GAIN) B.chaseT += B.chaseMarkT;
        B.chaseFloor = Math.min(floor, d);
        B.chaseMark = d; B.chaseMarkT = 0;
      }
    } else if (t.speed > 1 || (d > B.chaseBest - 0.05 && c.speed < 0.5)) B.chaseT += dt; // a runner getting away, or a chaser stood stuck no nearer (walking a long way round is still chasing)
    B.chaseBest = Math.min(B.chaseBest, d);
  }
  return B.chaseT > CHASE_GIVE_UP;
}

/** Says, once for all who give up on the same runner, that the chase is off. */
function gaveUp(c: Char, t: Char) {
  if (S.time - (t.brain.shookOff ?? -1e9) > 10) S.fx.notice(`${c.name} gave up the chase.`, 'info');
  t.brain.shookOff = S.time;
}

/** Breaks off from a target and leaves them be for a while, unless they come back for more (see forsaken). */
function letGo(c: Char, t: Char) {
  const B = c.brain;
  B.letGo = t.id; B.letGoAt = S.time;
  B.chase = 0; B.chaseT = 0;
  if (B.enemy === t.id) B.enemy = 0;
  c.target = 0;
  stop(c);
}

/**
 * Has c broken off from o lately, and is o still keeping away? A blow from o, or o coming within
 * reach and not making off, ends it; the law looks away from a wanted man only for a few moments,
 * and not at all once he is close.
 */
function forsaken(c: Char, o: Char) {
  const B = c.brain;
  if (o.id !== B.letGo) return false;
  const law = lawAfter(c, o);
  if (S.time - B.letGoAt >= (law ? 10 : 30)) return false;
  if (c.lastHitBy === o.id && c.lastHitT > B.letGoAt) return false;
  const d = dist(c, o);
  if (law && d < 15) return false;
  return !(d <= reach(c) + 1 && receding(c, o) <= 0.3);
}

/** Squads whose people keep with their leader on the road (see routine). */
const ON_THE_ROAD = new Set(['patrol', 'caravan', 'raid', 'wanderers', 'slavers', 'bounty', 'herd']);

/**
 * Has a chase drawn one of the world's people too far from their own? Those on the road keep with
 * their leader (a leader, with where the fight began); a town's people or a camp's with their home.
 * The law runs a wanted man the length of a town, and hunters follow their quarry anywhere.
 */
function leashed(c: Char, t: Char) {
  if (dist(c, t) <= reach(c) + 1) return false; // a fight within reach is no chase
  const B = c.brain, sq = S.W.squadOf(c);
  if (sq?.flags.hunt === t.id) return false;
  let ax: number, az: number;
  const L = sq && sq.leader !== c.id && ON_THE_ROAD.has(sq.kind) ? S.W.char(sq.leader) : undefined;
  if (L?.up) { ax = L.x; az = L.z; }
  else if ((!sq || !ON_THE_ROAD.has(sq.kind)) && (c.homeX || c.homeZ)) { ax = c.homeX; az = c.homeZ; }
  else if (B.fromId === t.id) { ax = B.fromX; az = B.fromZ; }
  else return false; // (not yet seen where this one began)
  const r = lawAfter(c, t) ? LAW_LEASH : LEASH;
  return (c.x - ax) ** 2 + (c.z - az) ** 2 > r * r;
}

/** Flee away from a point. */
export function flee(c: Char, fx: number, fz: number) {
  const a = angleTo(fx, fz, c.x, c.z) + S.rng.range(-0.4, 0.4);
  goTo(c, c.x + Math.sin(a) * 40, c.z + Math.cos(a) * 40);
  c.move = 'run';
  c.drawn = false;
}

/** Main per-step AI entry. */
export function tickAI(c: Char, dt: number) {
  if (c.atkCD > 0) c.atkCD -= dt;
  if (c.stagger > 0) c.stagger -= dt;
  if (c.knockT > 0) { c.knockT -= dt; if (c.knockT <= 0) { c.knockT = 0; } }
  if (c.atk) tickAttack(c, dt);
  if (c.status !== 'up' || c.carriedBy) return;
  if (c.cage) {
    // locked up, the only things to do are eat what is in the pack and work at the lock from inside; any other order is beyond them
    c.thinkT -= dt;
    if (c.thinkT <= 0) { c.thinkT = 0.3 + S.rng.next() * 0.3; if (c.hunger < 150 && !c.robot && !c.animal) eatSomething(c); }
    if (c.order && selfRescue(c)) runOrder(c, dt);
    else if (c.order) { c.order = null; if (c.faction === 'player') S.fx.notice(`${c.name} is locked in a cage.`, 'info'); }
    return;
  }
  c.thinkT -= dt;
  const think = c.thinkT <= 0;
  if (think) c.thinkT = 0.3 + S.rng.next() * 0.3;
  if (c.faction === 'player') playerAI(c, dt, think);
  else npcAI(c, dt, think);
}

/** An order a captive can carry out where they are: picking their own cage lock or their own shackles. */
export function selfRescue(c: Char) {
  const o = c.order;
  return !!o && ((o.k === 'lockpick' && o.obj === c.cage && !!c.cage) || (o.k === 'free' && o.id === c.id));
}

// ---------------------------------------------------------------- player characters
function playerAI(c: Char, dt: number, think: boolean) {
  const B = c.brain;
  if (think) {
    // fight back or engage enemies depending on stance
    // someone manning a turret or a watchtower keeps to the post: only what comes within arm's reach draws them off it
    const po = B.post ? S.W.objs.get(B.post) : undefined;
    const post = !c.order && !!po && c.jobs.some((j) => j.obj === po.id) && Math.hypot(po.x - c.x, po.z - c.z) < 5;
    const threatR = c.combatMode === 'passive' ? 0 : post ? 2.5 : c.combatMode === 'aggressive' ? 22 : c.combatMode === 'defensive' ? 8 : 0;
    let enemy: Char | null = null;
    const attacker = S.W.char(c.lastHitBy);
    if (attacker && attacker.up && S.time - c.lastHitT < 6 && c.combatMode !== 'passive' && hostileOrProvoked(c, attacker) && (!post || dist(c, attacker) < 3) && !forsaken(c, attacker)) enemy = attacker;
    if (!enemy && threatR > 0 && (!c.order || c.order.k === 'hold' || c.order.k === 'follow')) enemy = findEnemy(c, threatR);
    // help squadmates in trouble
    if (!enemy && !post && c.combatMode === 'aggressive' && (!c.order || c.order.k === 'follow' || c.order.k === 'hold')) {
      for (const m of S.W.squadOf(c)?.members ?? []) {
        const a = S.W.char(m);
        if (!a || a === c || !a.up || a.mem.bout) continue; // (a bout or a duel is nobody else's fight)
        const foe = S.W.char(a.target);
        if (foe && foe.up && a.atk && dist(c, a) < 30) { enemy = foe; break; }
      }
    }
    B.enemy = enemy ? enemy.id : 0;
    if (enemy && enemy.id !== B.foe) machineSay(c, 'engage'); // your own machines speak too
    B.foe = enemy ? enemy.id : B.foe;
  }
  const order = c.order;
  if (order && order.k === 'attack') {
    const t = S.W.char(order.id);
    if (!t || !t.alive || (t.status !== 'up' && !B.finish)) { c.order = null; }
    else if (t.up && outrun(c, t, dt, true)) { c.order = null; letGo(c, t); gaveUp(c, t); }
    else { fight(c, t, dt); return; }
  }
  const enemy = S.W.char(B.enemy);
  if (enemy && enemy.alive && (enemy.up || (enemy.status === 'ko' && B.finish === enemy.id)) && (!order || order.k === 'hold' || order.k === 'follow' || order.k === 'use' || order.k === 'mine' || order.k === 'build' || order.k === 'operate')) {
    if (enemy.up && outrun(c, enemy, dt)) { letGo(c, enemy); gaveUp(c, enemy); }
    else {
      if (c.carrying) dropCarried(c);
      if (order && order.k !== 'hold' && order.k !== 'follow') { c.jobs.length && (B.resumeJob = true); }
      fight(c, enemy, dt);
      return;
    }
  }
  c.target = 0;
  if (!B.enemy && c.drawn && S.time - c.lastHitT > 6) c.drawn = false;
  // off watch: down from the tower before anything else
  if (c.mem.using && !c.jobs.some((j) => j.obj === c.mem.using) && onTower(c)) leaveFurniture(c);
  if (c.order) { B.slaveT = 0; runOrder(c, dt); return; } // (not `order`: an attack on someone now gone was just dropped)
  // at a trade or loot window: everything else waits where they stand, until it closes
  if (jobsHeld(c)) { if (c.hasGoal) stop(c); toolsDown(c); return; }
  if (c.jobs.length && runJobs(c, dt, think)) return;
  // idle: eat when hungry, patch yourself up; the chained are put to work
  if (think) { idleUpkeep(c); if (!c.order && c.shackled && c.mem.slaveSite) slaveWork(c); }
}

/**
 * Forced labour: a slave of yours left idle in their owners' camp is put to the fields by day,
 * as the camp's own slaves are (see routine.ts). An order of yours always comes first.
 */
function slaveWork(c: Char) {
  const B = c.brain;
  const spot = c.mem.slaveSpot ?? (c.mem.slaveSpot = workSpot(c.mem.slaveSite, c.x, c.z));
  if (!spot) return;
  const h = S.clock.hour;
  if (S.clock.isNight || h < 6.5 || h > 18.5) { if (c.act === 'farm') c.act = null; return; } // the fields rest at night
  // left standing about for half a minute, an overseer sends them back to work
  if (c.act !== 'farm') { B.slaveT = (B.slaveT ?? 0) + 0.45; if (B.slaveT < 30) return; }
  if (!near(c, spot.x, spot.z, 2.5)) {
    if (c.hasGoal || S.time < (B.slaveRest ?? 0)) return;
    // no way there (a shut gate, a flooded paddy): after a few tries another spot, and failing that a rest before trying again
    B.slavePF ??= c.mem.pathFail ?? 0; // failures from before the chains don't count
    if ((c.mem.pathFail ?? 0) > B.slavePF && (B.slaveFails = (B.slaveFails ?? 0) + 1) >= 3) {
      B.slaveFails = 0;
      const other = workSpots(c.mem.slaveSite).filter((j) => j.x !== spot.x || j.z !== spot.z);
      if (other.length) c.mem.slaveSpot = S.rng.pick(other);
      else B.slaveRest = S.time + 300;
      return;
    }
    B.slavePF = c.mem.pathFail ?? 0;
    goTo(c, spot.x, spot.z); c.move = 'walk';
    return;
  }
  stop(c);
  c.dir = spot.dir;
  c.act = 'farm'; c.actDur = 3;
  train(c, 'labouring', 0.05, 1);
}

function hostileOrProvoked(c: Char, a: Char) {
  return hostile(c, a) || a.target === c.id || a.lastHitBy !== 0;
}

/** Eating and self-care for idle characters. */
export function idleUpkeep(c: Char) {
  if (c.hunger < 150 && !c.robot && !c.animal) eatSomething(c);
  if (c.faction !== 'player' || c.animal) return;
  // bind the bleeding, yourself first, then the nearest of your squad
  let patient: Char | null = null;
  if (c.body.bleeding() > 0.04 && c.body.needsAid() && findMedkit(c, c.robot, c)) patient = c;
  else {
    let bd = 25 * 25;
    for (const id of S.W.squadOf(c)?.members ?? []) {
      const o = S.W.char(id);
      if (!o || o === c || o.animal || o.status === 'dead' || o.carriedBy || o.cage) continue;
      if ((o.status !== 'ko' && o.body.bleeding() <= 0.04) || !o.body.needsAid()) continue;
      const d2 = (o.x - c.x) ** 2 + (o.z - c.z) ** 2;
      if (d2 < bd && findMedkit(c, o.robot, o)) { bd = d2; patient = o; }
    }
  }
  if (patient) c.order = { k: 'aid', id: patient.id };
}

/** Food eaten at one of your tables goes a third further. */
export function tableBonus(x: number, z: number, r: number) {
  let t = false;
  S.W.objHash.near(x, z, r, (o) => { if (!t && o.kind === 'table' && o.owner === 'player' && Math.hypot(o.x - x, o.z - z) < r) t = true; });
  return t ? 4 / 3 : 1;
}

export function eatSomething(c: Char): boolean {
  for (const g of [c.inv, c.eq.back?.inv]) {
    if (!g) continue;
    const it = g.first((d) => !!d.food && d.cat === 'food');
    if (it) {
      const d = ITEM[it.id];
      c.hunger = Math.min(300, c.hunger + (d.food ?? 0) * tableBonus(c.x, c.z, 6));
      it.n--;
      if (it.n <= 0) g.remove(it);
      c.act = 'pickup'; c.actT = 0; c.actDur = 0.8;
      S.fx.sound('eat', c.x, c.z, 0.6);
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- NPCs
function npcAI(c: Char, dt: number, think: boolean) {
  const B = c.brain;
  const f = FACTION[c.faction];
  if (think) {
    B.enemy = 0;
    const radius = c.animal ? Math.max(20, ANIMAL[c.animal].aggro) : c.role === 'guard' || c.role === 'patrol' ? 36 : 26;
    const e = c.combatMode === 'passive' ? null : findEnemy(c, radius);
    const attacker = S.W.char(c.lastHitBy);
    const provoked = attacker && attacker.alive && attacker.up && S.time - c.lastHitT < 12 && !forsaken(c, attacker) ? attacker : null;
    let target = provoked ?? e;
    // some would rather talk (and extort) first
    if (target && !provoked && target.faction === 'player' && wantsToTalk(c)) target = null;
    // animals: grazers flee instead of fighting unless cornered
    if (c.animal && target) {
      const a = ANIMAL[c.animal];
      if (a.diet === 'grazer' && !provoked) { B.flee = target.id; target = null; }
      else if (a.diet === 'grazer' && provoked && c.body.total() < 0.5) { B.flee = provoked.id; target = null; }
    }
    // people: the weak and civilians run from fights
    if (!c.animal && target) {
      const coward = c.role === 'resident' || c.role === 'shopkeeper' || c.role === 'slave' || c.role === 'noble' || c.role === 'trader' || c.role === 'worker' || c.role === 'caravan' || c.role === 'recruit';
      const beaten = c.body.total() < 0.35 && (f?.attitude === 'bandit' || c.role === 'wanderer');
      if ((coward && !provoked) || beaten || (coward && c.body.total() < 0.6)) { B.flee = target.id; target = null; }
    }
    // guards help anyone of theirs who is being attacked nearby
    if (!target && (c.role === 'guard' || c.role === 'patrol' || f?.attitude === 'bandit' || c.animal)) {
      S.W.hash.near(c.x, c.z, 30, (o) => {
        if (target || o === c || o.faction !== c.faction || !o.up || o.mem.bout) return; // a pit bout is nobody else's fight
        const foe = S.W.char(o.lastHitBy);
        if (foe && foe.up && S.time - o.lastHitT < 6 && foe.faction !== c.faction) target = foe;
      });
    }
    B.enemy = target ? target.id : 0;
    // where a fight began, to turn back to if a chase goes too far (see leashed); the same one taken up again soon after keeps it
    if (target) {
      if (target.id !== B.fromId || S.time - (B.fromT ?? -1e9) > 120) { B.fromId = target.id; B.fromX = c.x; B.fromZ = c.z; }
      B.fromT = S.time;
    }
    // machines announce themselves when they pick a fight, and mutter on patrol
    if (target && target.id !== B.foe) machineSay(c, 'engage');
    // those who carry a fighting drug take it as the fight starts
    if (target && target.id !== B.foe && !c.robot && !c.animal) {
      const st = stimFor(c);
      if (st && S.rng.chance(0.8)) { takeDrug(c, st.grid, st.it); S.fx.say(c, S.rng.pick(RAGE_LINES)); }
    }
    else if (!target && S.rng.chance(0.006)) machineSay(c, 'idle');
    B.foe = target ? target.id : B.foe;
    if (!target && B.flee) {
      const fr = S.W.char(B.flee);
      if (!fr || !fr.up || dist(c, fr) > 45) B.flee = 0;
    }
  }
  const enemy = S.W.char(B.enemy);
  if (enemy && enemy.alive) {
    // beasts that eat the fallen keep at it
    if (enemy.status !== 'up' && !(c.animal && ANIMAL[c.animal].eatsDowned)) { if (c.carrying) dropCarried(c); B.enemy = 0; }
    else if (leashed(c, enemy)) letGo(c, enemy); // (a captor turning back keeps his prisoner)
    else { if (c.carrying) dropCarried(c); fight(c, enemy, dt); return; }
  }
  c.target = 0;
  if (B.flee) {
    const fr = S.W.char(B.flee);
    if (fr && think) flee(c, fr.x, fr.z);
    if (fr) return;
  }
  if (c.drawn && S.time - c.lastHitT > 8) c.drawn = false;
  // after a fight: help the fallen, loot, capture
  if (think && !c.animal && postFight(c)) return;
  if (B.task && runTask(c, dt)) return;
  // carrying someone with no idea why (a task lost on the way): put them down rather than carry them about for good
  if (c.carrying && !B.task) dropCarried(c);
  // walking up to have a word with your people (see encounters): the post can wait
  if (B.talkTo && S.time - (B.talkT ?? -1e9) < 1.5) return;
  runRoutine(c, dt, think);
}

/** Medics patch up friends; slavers and police pick up the defeated. */
function postFight(c: Char): boolean {
  const B = c.brain;
  if (B.task) return false;
  const f = FACTION[c.faction];
  let best: Char | null = null, bd = 30 * 30, kind = '';
  S.W.hash.near(c.x, c.z, 30, (o, d2) => {
    if (o === c || o.carriedBy || o.cage || o.status === 'dead' || heldBy(o, c.faction)) return;
    if (o.status === 'ko' || o.body.bleeding() > 0.15) {
      if (o.faction === c.faction && o.body.needsAid() && findMedkit(c, o.robot, o) && d2 < bd) { best = o; bd = d2; kind = 'aid'; return; }
      if (o.status !== 'ko') return;
      if (o.faction !== c.faction && !o.animal) {
        // their own chained slaves are already theirs: a runaway is another matter
        if (o.shackled && o.mem.enslavedBy === c.faction && !((o.bounty[c.faction] ?? 0) > 0)) return;
        if (f?.captures === 'slavery' && c.role !== 'resident' && d2 < bd && !o.robot) { best = o; bd = d2; kind = 'capture'; }
        else if (f?.captures === 'prison' && (o.bounty[c.faction] ?? 0) > 0 && !(o.mem.grace?.[c.faction] > S.clock.t) && (c.role === 'guard' || c.role === 'patrol') && d2 < bd) { best = o; bd = d2; kind = 'arrest'; }
        else if (f?.captures === 'eat' && d2 < bd) { best = o; bd = d2; kind = 'eat'; }
        else if (f?.attitude === 'bandit' && !o.mem.lootedBy && d2 < bd) { best = o; bd = d2; kind = 'loot'; }
      }
    }
  });
  // nobody else to see to: patch yourself up
  if (!best && c.status === 'up' && c.body.bleeding() > 0.04 && c.body.needsAid() && findMedkit(c, c.robot, c)) { best = c; kind = 'aid'; }
  if (!best) return false;
  B.task = { k: kind, id: (best as Char).id, t: 0 };
  return true;
}

/** Multi-step tasks (aid, capture, arrest, loot...). */
function runTask(c: Char, dt: number): boolean {
  const B = c.brain;
  const task = B.task;
  const o = S.W.char(task.id);
  task.t += dt;
  // a long walk with a captive is allowed; anything else is given up after two minutes
  if (!o || task.t > (c.carrying ? 3600 : 120)) { if (c.carrying) dropCarried(c); B.task = null; return false; }
  switch (task.k) {
    case 'aid': {
      if (!o.body.needsAid() || o.status === 'dead') { B.task = null; c.act = null; return false; }
      if (!near(c, o.x, o.z, 1.4)) { goTo(c, o.x, o.z); c.move = 'run'; return true; }
      stop(c);
      c.act = 'loot'; c.actDur = 1.2;
      task.w = (task.w ?? 0) + dt;
      if (task.w > 1.2) {
        task.w = 0;
        const kit = findMedkit(c, o.robot, o);
        if (!kit) { B.task = null; return false; }
        const splint = !!kit.def.med!.splint;
        const l = limbToTreat(o.body, splint);
        if (l < 0) { B.task = null; return false; }
        const used = treatLimb(c, o, l, kit.def.med!.points * 0.3, kit.def.med!.quality, splint);
        (kit.it as any).used = ((kit.it as any).used ?? 0) + used;
        if ((kit.it as any).used >= kit.def.med!.points) { kit.it.n--; (kit.it as any).used = 0; if (kit.it.n <= 0) kit.grid.remove(kit.it); }
      }
      return true;
    }
    case 'loot': {
      if (!near(c, o.x, o.z, 1.3)) { goTo(c, o.x, o.z); c.move = 'walk'; return true; }
      stop(c);
      c.act = 'loot'; c.actDur = 1.5;
      task.w = (task.w ?? 0) + dt;
      if (task.w > 2) {
        // take money and a few valuables
        const take = Math.floor(S.W.money > 0 && o.faction === 'player' ? Math.min(S.W.money * 0.1, 500) : o.money * 0.8);
        if (o.faction === 'player') { S.W.money -= take; if (take > 0) S.fx.notice(`Bandits rob ${take} chits from ${o.name}.`, 'bad'); }
        else o.money -= take;
        c.money += take;
        const best = o.inv.items.slice().sort((a, b) => ITEM[b.id].value - ITEM[a.id].value).slice(0, 2);
        for (const it of best) { o.inv.remove(it); c.inv.put(it) || c.inv.add(it.id, it.n, it.q); }
        o.mem.lootedBy = c.id;
        B.task = null;
      }
      return true;
    }
    case 'capture':
    case 'arrest':
    case 'eat': {
      if (o.carriedBy && o.carriedBy !== c.id) { B.task = null; return false; }
      if (o.status === 'up') { B.task = null; return false; }
      // nobody pays for a corpse, except the Mawkin
      if (o.status === 'dead' && task.k !== 'eat') { if (c.carrying === o.id) dropCarried(c); B.task = null; return false; }
      if (!c.carrying) {
        if (!near(c, o.x, o.z, 1.3)) { goTo(c, o.x, o.z); c.move = 'run'; return true; }
        pickUp(c, o);
        if (task.k === 'capture') o.shackled = true;
        // a live captive is worth more: bind the worst of the bleeding
        if (task.k !== 'eat') for (let l = 0; l < 7; l++) { o.body.bleed[l] *= 0.15; o.body.treated[l] = Math.max(o.body.treated[l], 0.3); }
        const dest = captureDestination(c, task.k, o);
        task.dx = dest.x; task.dz = dest.z; task.site = dest.site;
        return true;
      }
      if (!near(c, task.dx, task.dz, 3)) { goTo(c, task.dx, task.dz); c.move = 'walk'; return true; }
      // arrived: hand over
      deliverCaptive(c, o, task.k, task.site);
      B.task = null;
      return true;
    }
  }
  B.task = null;
  return false;
}

export function pickUp(c: Char, o: Char) {
  if (c.carrying || o.carriedBy) return false;
  // carried off by anyone else (a rescue, another catch), the catch is nobody's any more
  if (o.mem.heldBy && o.mem.heldBy !== c.faction) { delete o.mem.heldBy; delete o.mem.heldUntil; }
  c.carrying = o.id;
  o.carriedBy = c.id;
  o.path = null;
  o.hasGoal = false;
  if (o.bed) leaveBed(o);
  return true;
}

/** Named people and the leaders of places are not put in chains: a cage, or let go. */
const notForChains = (o: Char) => o.faction !== 'player' && (!!o.unique || !!o.mem.leaderOf);

/** Where captors take their prisoners: slaves to the fields, outlaws to a cage, the Mawkin's catch to the cookfires. */
function captureDestination(c: Char, kind: string, o: Char): { x: number; z: number; site: number } {
  const T = S.T;
  let site = kind === 'capture'
    ? T.nearestSite(c.x, c.z, (s) => s.faction === 'chainhouse' || s.settlement === 'harrowmarket' || s.settlement === 'aurum' || s.faction === 'scorched')
    : kind === 'arrest'
      ? townWithCell(c)
      : T.nearestSite(c.x, c.z, (s) => s.faction === c.faction || s.kind === 'camp_mawkin' || s.kind === 'mist_camp');
  if (!site) site = T.nearestSite(c.x, c.z, (s) => s.kind === 'town');
  if (kind === 'capture' && !notForChains(o)) {
    const w = workSpot(site!.id, c.x, c.z);
    if (w) return { x: w.x, z: w.z, site: site!.id };
  }
  // aim for a cage in that site if there is one (the Mawkin pen only yours: anyone else would starve in it)
  const cage = kind === 'eat' && o.faction !== 'player' ? null : findFreeCage(site!.id, site!.x, site!.z);
  if (cage) return { x: cage.x, z: cage.z, site: site!.id };
  if (kind === 'eat') {
    // no pen: left at the camp's edge, on the side they were brought in by, where coming round is a chance
    const dx = c.x - site!.x, dz = c.z - site!.z, d = Math.hypot(dx, dz) || 1, r = Math.max(10, site!.r * 0.9);
    const p = S.nav.nearestOpen(site!.x + (dx / d) * r, site!.z + (dz / d) * r, 12);
    if (p) return { x: p[0], z: p[1], site: site!.id };
  }
  return { x: site!.x, z: site!.z, site: site!.id };
}

/** The nearest of a faction's towns with a cell free, within a walk; failing that its nearest town, where a fine must do. */
function townWithCell(c: Char): Site | null {
  const towns = S.T.sites.filter((s) => s.kind === 'town' && s.faction === c.faction).sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z));
  for (const s of towns) {
    if (Math.hypot(s.x - c.x, s.z - c.z) > 1500) break;
    if (findFreeCage(s.id, s.x, s.z)) return s;
  }
  return towns[0] ?? null;
}

/** The spots where a settlement's slaves work: its fields, else open ground by its centre. */
function workSpots(siteId: number): { x: number; z: number; dir: number }[] {
  const site = S.T.sites.find((s) => s.id === siteId);
  if (!site) return [];
  const jobs = S.W.towns.get(siteId)?.jobs as { x: number; z: number; dir: number }[] | undefined;
  if (jobs?.length) return jobs.map((j) => ({ x: j.x, z: j.z, dir: j.dir }));
  const spot = S.nav.nearestOpen(site.x + 6, site.z, 14) ?? [site.x, site.z];
  return [{ x: spot[0], z: spot[1], dir: 0 }];
}

/** Where a slave of a settlement works: the nearest of its spots. */
export function workSpot(siteId: number, x: number, z: number): { x: number; z: number; dir: number } | null {
  let best: { x: number; z: number; dir: number } | null = null, bd = Infinity;
  for (const j of workSpots(siteId)) { const d = Math.hypot(j.x - x, j.z - z); if (d < bd) { bd = d; best = j; } }
  return best;
}

/** Takes someone out of whatever squad they were in; a slave in the fields answers to nobody on the road. */
function leaveSquad(o: Char) {
  const old = S.W.squads.get(o.squad);
  if (old) {
    old.members = old.members.filter((m) => m !== o.id);
    if (old.leader === o.id) old.leader = old.members[0] ?? 0;
  }
  o.squad = 0;
}

/**
 * Puts a captive to work as a slave of a settlement: shackled, owned, and watched (see tickRunaways in
 * crime.ts). Nobody is caged for it: a cage with no sentence is a hole with no way out, and the fields
 * at least can be walked away from, shackles picked, when nobody is looking.
 */
export function enslave(o: Char, faction: string, site: Site | null) {
  o.shackled = true;
  o.dirty = true;
  o.mem.enslavedBy = faction;
  o.bounty[faction] = 0; // sold is as good as punished
  delete o.mem.jailUntil;
  o.order = null; o.jobs.length = 0; // whatever they were about is over
  const spot = site ? workSpot(site.id, o.x, o.z) : null;
  if (site) { o.mem.slaveSite = site.id; o.mem.slaveSpot = spot; }
  if (spot) {
    const p = S.nav.nearestOpen(spot.x, spot.z, 8);
    if (p) { o.x = p[0]; o.z = p[1]; o.y = S.T.heightAt(o.x, o.z); }
    o.homeX = o.x; o.homeZ = o.z; o.homeDir = spot.dir;
  }
  if (o.faction === 'player') {
    S.W.say(`${o.name} was taken by the ${FACTION[faction]?.short ?? faction}${site ? ` and put to work at ${site.name}` : ''}.`, 'bad', S.clock.t);
    S.fx.notice(`${o.name} has been taken by slavers${site ? ` and put to work in the fields of ${site.name}` : ''}.`, 'bad');
    return;
  }
  // someone else's: one more of the camp's chained, who will go with whoever gets the irons off.
  // They join the camp's people, or stand alone: never a squad of another colour.
  o.faction = faction;
  o.role = 'slave';
  o.title = 'Slave';
  leaveSquad(o);
  if (site) {
    o.site = site.id;
    for (const q of S.W.squads.values()) if (q.site === site.id && q.kind === 'town' && q.faction === faction) { S.W.moveToSquad(o, q); break; }
  }
}

export function findFreeCage(siteId: number, x: number, z: number) {
  let best = null, bd = Infinity;
  for (const o of S.W.objs.values()) {
    if (o.kind !== 'cage' || o.occupant || (siteId && o.site !== siteId)) continue;
    const d = Math.hypot(o.x - x, o.z - z);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function deliverCaptive(c: Char, o: Char, kind: string, siteId = 0) {
  dropCarried(c);
  const site = S.T.sites.find((s) => s.id === siteId) ?? S.T.nearestSite(c.x, c.z) ?? null;
  const cage = kind === 'eat' && o.faction !== 'player' ? null : findFreeCage(kind === 'eat' ? site?.id ?? 0 : 0, c.x, c.z);
  const cell = cage && Math.hypot(cage.x - c.x, cage.z - c.z) < 8 ? cage : null;
  if (kind === 'eat') {
    // the catch is theirs now: penned if the camp keeps a pen (a lock can be worked from inside), else
    // left where it fell, not to be carried about again; it is let be a while after it wakes (see heldBy)
    const first = o.mem.heldBy !== c.faction || (o.mem.heldUntil !== undefined && S.clock.t >= o.mem.heldUntil);
    o.mem.heldBy = c.faction;
    delete o.mem.heldUntil;
    if (cell && o.status !== 'dead') { cell.occupant = o.id; o.cage = cell.id; o.x = cell.x; o.z = cell.z; o.mem.prisonerOf = c.faction; }
    if (first && o.faction === 'player') S.fx.notice(`${o.name} has been dragged off by the ${FACTION[c.faction]?.short ?? 'enemy'}${o.cage ? ' and penned' : ''}.`, 'bad');
    return;
  }
  if (kind === 'capture') {
    if (!notForChains(o)) { enslave(o, c.faction, site); return; }
    // a name worth something, or a lord: held in a cage for whoever comes for them, or let go
    o.shackled = false;
    if (cell) { cell.occupant = o.id; o.cage = cell.id; o.x = cell.x; o.z = cell.z; o.mem.prisonerOf = c.faction; }
    return;
  }
  if (kind === 'arrest') {
    if (cell) {
      cell.occupant = o.id;
      o.cage = cell.id;
      o.x = cell.x; o.z = cell.z;
      o.mem.jailUntil = S.clock.t + 86400 * (1 + Math.min(4, (o.bounty[c.faction] ?? 0) / 2000));
      o.bounty[c.faction] = 0;
      if (o.faction === 'player') S.fx.notice(`${o.name} has been thrown in a cage.`, 'bad');
    } else {
      // no cell free anywhere near: a fine of what they can pay, the rest still owed, and a while before the law comes for it again
      const owed = o.bounty[c.faction] ?? 0;
      const purse = o.faction === 'player' ? S.W.money : o.money;
      const fine = Math.max(0, Math.min(owed, Math.floor(purse)));
      if (o.faction === 'player') S.W.money -= fine; else o.money -= fine;
      const left = owed - fine;
      o.bounty[c.faction] = left;
      (o.mem.grace ??= {})[c.faction] = S.clock.t + 6 * HOUR;
      o.shackled = false;
      if (o.faction === 'player') {
        const short = FACTION[c.faction]?.short ?? 'guards';
        S.W.say(`The ${short} had no cell for ${o.name}: fined ${fine} chits${left > 0 ? `, ${left} still owed` : ''}.`, 'crime', S.clock.t);
        S.fx.notice(`The ${short} had no cell for ${o.name}: fined ${fine} chits${left > 0 ? `, ${left} still owed,` : ''} and turned loose.`, left > 0 ? 'bad' : 'info');
      }
    }
    return;
  }
}

/**
 * Carried off by the Mawkin (or their like): theirs while they are down, so nobody carries them
 * about again, and let be for an hour after they come round (stamped as they wake: see health),
 * a chance to slip away. Carried off by anyone else, they are nobody's (see pickUp).
 */
export function heldBy(o: Char, faction: string): boolean {
  if (o.mem.heldBy !== faction) return false;
  // down and not come round since the catch, or still within the hour: a fall long after is a fresh catch
  if (o.status !== 'up') return o.mem.heldUntil === undefined || S.clock.t < o.mem.heldUntil;
  return o.mem.heldUntil !== undefined && S.clock.t < o.mem.heldUntil;
}

const RAGE_LINES = ['Red in the blood!', 'Can\'t feel a thing!', 'Come on, then! COME ON!', 'Nothing hurts! NOTHING!', 'I\'ll pull your arms off!'];

/** Forces NPCs in a group to attack a target (demands refused, crimes). */
export function aggro(group: Char[], target: Char) {
  for (const c of group) {
    if (!c.up) continue;
    c.brain.enemy = target.id;
    c.lastHitBy = target.id;
    c.lastHitT = S.time;
    c.mem.enemies = [...(c.mem.enemies ?? []), target.id];
  }
}

export { strengthOf, LI };
