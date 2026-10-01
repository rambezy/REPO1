// Where an actor's weapon (or fist) points this frame. Shared by the body
// renderer, which reaches the arm toward it, and the weapon renderer, which
// draws the blade from the hand along the same angle.
//
// Every attack is a continuous curve: guard, wind-up, the strike's arc, the
// follow-through, and back to guard. The pose is also eased frame to frame,
// so starting, blocking or dropping out of combat never snaps the arm.

import type { Actor } from '../world/actor';
import { G } from '../G';
import { clamp, wrapAngle } from '../engine/util';

export interface WeaponPose {
  /** angle of the blade (or bow, or fist), radians in screen space */
  A: number;
  /** angle the weapon arm reaches along; null leaves the arm hanging naturally */
  armA: number | null;
  /** blade length in world units */
  len: number;
  /** 0..1 how far the arm reaches (0 cocked back at the shoulder, 1 fully out) */
  reach: number;
  /** whether the weapon itself should be drawn */
  show: boolean;
  /** held at rest by the side (the arm hangs, the weapon dangles forward) */
  rest: boolean;
  /** swing arc for the trail during a strike */
  trail: [number, number] | null;
  /** 0..1 progress through the current phase */
  t: number;
  /** body weight: negative leans back into a wind-up, positive into the blow */
  lean: number;
}

const HANG = Math.PI / 2; // an arm hanging straight down
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const easeInOut = (t: number) => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mixA = (a: number, b: number, t: number) => a + wrapAngle(b - a) * t;
/** facing angle for each direction: down, left, right, up */
const FACE = [Math.PI / 2, Math.PI, 0, -Math.PI / 2];

interface Target { A: number; armA: number | null; reach: number; lean: number; trail: [number, number] | null; rest: boolean; sharp: boolean }

/** `from`: where the arm was when this phase began (wind-ups start from there). */
function target(a: Actor, isPlayer: boolean, from: { A: number; R: number } | null): Target {
  const c = a.combat;
  const w = c.weapon;
  const fist = w.kind === 'fist';
  const bow = w.kind === 'bow';
  const t = c.phaseLen > 0 ? clamp(c.phaseT / c.phaseLen, 0, 1) : 1;
  const face = FACE[a.dir] ?? HANG;
  const aim = c.phase === 'none' && !isPlayer ? face : c.attackAngle;
  // alternate sides through a combo: forehand, backhand, forehand
  const s = c.combo % 2 === 0 ? -1 : 1;
  const heavy = c.attackKind === 'heavy';
  const thrust = c.attackKind === 'thrust';
  const nearPlayer = !isPlayer && a.hostile && G.player && Math.hypot(a.x - G.player.x, a.y - G.player.y) < 150;
  const ready = isPlayer ? !!a.mem.combatReady : nearPlayer;
  // the guard: weapon raised toward the foe, or fists up in front of the chest
  const guardA = fist ? aim - 0.35 : aim - 0.55;
  const guardR = fist ? 0.34 : 0.62;
  const guard: Target = { A: guardA, armA: guardA, reach: guardR, lean: 0, trail: null, rest: false, sharp: false };
  const pose = (A: number, reach: number, lean = 0, trail: [number, number] | null = null, sharp = false): Target => ({ A, armA: A, reach, lean, trail, rest: false, sharp });

  if (bow && (c.phase === 'draw' || c.attackKind === 'shoot' && (c.phase === 'windup' || c.phase === 'strike' || c.phase === 'recover'))) {
    // the bow is held out at the mark while it is drawn and loosed
    return pose(c.attackAngle, 0.95, c.phase === 'strike' ? -0.2 : 0);
  }
  switch (c.phase) {
    case 'windup': {
      // from wherever the arm is (the guard, or the last blow's follow-through
      // when chaining a combo) back to the cocked position
      const k = easeOut(t);
      const fA = from ? from.A : guardA, fR = from ? from.R : guardR;
      if (fist) {
        // cock the fist back at the shoulder (further for a hook)
        const back = heavy ? -0.95 : -0.5;
        return pose(mixA(fA, aim + back, k), mix(fR, heavy ? 0.3 : 0.2, k), -0.35 * k);
      }
      if (thrust) return pose(mixA(fA, aim + 0.18 * s, k), mix(fR, 0.36, k), -0.3 * k);
      const back = heavy ? -1.95 : -1.45 * s;
      return pose(mixA(fA, aim + back, k), mix(fR, 0.72, k), (heavy ? -0.5 : -0.3) * k);
    }
    case 'strike': {
      const k = easeInOut(t);
      if (fist) {
        if (heavy) return pose(aim - 0.95 + 1.3 * k, mix(0.3, 0.96, easeOut(t)), mix(-0.35, 0.9, easeOut(t)), null, true);
        // a jab: straight out at the mark, fast
        return pose(aim - 0.5 + 0.45 * easeOut(t), mix(0.2, 1, easeOut(t)), mix(-0.35, 0.8, easeOut(t)), null, true);
      }
      if (thrust) return pose(aim + 0.18 * s * (1 - k), mix(0.36, 1.05, easeOut(t)), mix(-0.3, 1, easeOut(t)), null, true);
      const from = heavy ? -1.95 : -1.45 * s;
      const to = heavy ? 1.75 : 1.3 * s;
      const A = aim + from + (to - from) * k;
      return pose(A, mix(0.72, 0.98, easeOut(t)), mix(-0.3, 1, easeOut(t)), [aim + from, A], true);
    }
    case 'recover': {
      // follow through, then settle back into the guard
      const k = easeInOut(clamp((t - 0.15) / 0.85, 0, 1));
      let endA: number, endR: number;
      if (fist) { endA = heavy ? aim + 0.35 : aim - 0.05; endR = heavy ? 0.9 : 1; }
      else if (thrust) { endA = aim; endR = 1.02; }
      else { endA = aim + (heavy ? 1.75 : 1.3 * s); endR = 0.9; }
      if (!ready && k >= 1) return rest(a, isPlayer);
      return pose(mixA(endA, guardA, k), mix(endR, guardR, k), mix(heavy ? 0.9 : 0.7, 0, k));
    }
    case 'block': {
      const b = a.mem.blockAngle ?? aim;
      // a blade held across the line of the attack; fists up before the face
      return fist ? pose(b - 1.15, 0.3, -0.15) : pose(b + Math.PI / 2 * 0.9, 0.58, -0.1);
    }
    case 'stagger':
      return pose(aim + 0.9, 0.55, -0.6);
    case 'dodge':
      return ready ? guard : rest(a, isPlayer);
    default:
      if (a.pose === 'work') {
        // hammering or chopping: a steady raise and fall
        const k = (Math.sin(a.animT * 6) + 1) / 2;
        const A = face - 1.6 + k * 1.9;
        return pose(A, 0.75, 0, null, true);
      }
      return ready && !bow ? guard : rest(a, isPlayer);
  }
}

/** The weapon hangs from a relaxed hand; the arm itself is left alone. */
function rest(a: Actor, _isPlayer: boolean): Target {
  const face = FACE[a.dir] ?? HANG;
  return { A: face + 0.6, armA: null, reach: 1, lean: 0, trail: null, rest: true, sharp: false };
}

interface Smooth { at: number; A: number; armA: number; reach: number; lean: number; out: WeaponPose | null; key: string; fromA: number; fromR: number }

export function weaponPose(a: Actor, isPlayer: boolean): WeaponPose | null {
  if (a.dead || a.isAnimal || a.hidden) return null;
  const c = a.combat;
  const w = c.weapon;
  const fist = w.kind === 'fist';
  // once per frame: both the body and the weapon renderer ask
  let sm = a.mem.wpose as Smooth | undefined;
  if (sm && sm.at === G.clock) return sm.out;
  // remember where the arm was as each phase (or each blow of a combo) begins
  const key = `${c.phase}:${c.combo}:${c.attackKind}`;
  if (sm && sm.key !== key) { sm.key = key; sm.fromA = sm.armA; sm.fromR = sm.reach; }
  const tg = target(a, isPlayer, sm ? { A: sm.fromA, R: sm.fromR } : null);
  const t = c.phaseLen > 0 ? clamp(c.phaseT / c.phaseLen, 0, 1) : 1;
  const tgArm = tg.armA ?? HANG;
  if (!sm) sm = a.mem.wpose = { at: G.clock, A: tg.A, armA: tgArm, reach: tg.reach, lean: tg.lean, out: null, key, fromA: tgArm, fromR: tg.reach };
  const dt = clamp(G.clock - sm.at, 0, 0.1);
  sm.at = G.clock;
  if (tg.sharp) {
    // strikes follow their own curve exactly (they are fast, and continuous)
    sm.A = tg.A; sm.armA = tgArm; sm.reach = tg.reach;
  } else {
    const k = 1 - Math.exp(-dt * 22);
    sm.A += wrapAngle(tg.A - sm.A) * k;
    sm.armA += wrapAngle(tgArm - sm.armA) * k;
    sm.reach += (tg.reach - sm.reach) * k;
  }
  sm.lean += (tg.lean - sm.lean) * (1 - Math.exp(-dt * 18));
  // keep angles in -pi..pi: the body picks its draw order by their sign
  sm.A = wrapAngle(sm.A);
  sm.armA = wrapAngle(sm.armA);
  // settled back at the side: hand the arm back to the walk cycle
  const settled = tg.armA === null && Math.abs(wrapAngle(sm.armA - HANG)) < 0.08 && sm.reach > 0.97;
  const inCombat = c.phase !== 'none' || !tg.rest || (isPlayer && !!a.mem.combatReady);
  const show = !fist && (inCombat || !!a.mem.showWeapon);
  let len = Math.max(8, w.reach - 6);
  if (c.phase === 'block') len *= 0.8;
  else if (tg.rest) len *= 0.75;
  if (settled && !show) { sm.out = null; return null; }
  sm.out = {
    A: sm.A,
    armA: settled ? null : sm.armA,
    len,
    reach: sm.reach,
    show,
    rest: tg.rest,
    trail: tg.trail,
    t,
    lean: sm.lean,
  };
  return sm.out;
}
