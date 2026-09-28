// Where an actor's weapon (or fist) points this frame. Shared by the body
// renderer, which reaches the arm toward it, and the weapon renderer, which
// draws the blade from the hand along the same angle.

import type { Actor } from '../world/actor';
import { clamp } from '../engine/util';

export interface WeaponPose {
  /** angle of the arm and blade, radians in screen space */
  A: number;
  /** blade length in world units */
  len: number;
  /** 0..1 how far the arm reaches */
  reach: number;
  /** whether the weapon itself should be drawn */
  show: boolean;
  /** held at rest by the side (the arm hangs, the weapon dangles forward) */
  rest: boolean;
  /** swing arc for the trail during a strike */
  trail: [number, number] | null;
  /** 0..1 progress through the current phase */
  t: number;
}

export function weaponPose(a: Actor, isPlayer: boolean): WeaponPose | null {
  if (a.dead || a.isAnimal || a.hidden) return null;
  const c = a.combat;
  const w = c.weapon;
  const fist = w.kind === 'fist';
  const inCombat = c.phase !== 'none' || a.hostile || (isPlayer && !!a.mem.combatReady);
  const t = c.phaseLen > 0 ? clamp(c.phaseT / c.phaseLen, 0, 1) : 1;
  let ang = c.attackAngle;
  let len = Math.max(8, w.reach - 6);
  let swing = 0;
  let reach = 0.85;
  let trail: [number, number] | null = null;
  let rest = false;
  if (c.phase === 'windup') {
    swing = c.attackKind === 'thrust' ? 0 : -1.4 * (c.combo % 2 === 0 ? -1 : 1) * t;
    if (c.attackKind === 'thrust') { len *= 0.7; reach = 0.55; }
    if (c.attackKind === 'heavy') swing = -1.9 * t;
    reach = 0.7;
  } else if (c.phase === 'strike') {
    const from = c.attackKind === 'heavy' ? -1.9 : -1.4 * (c.combo % 2 === 0 ? -1 : 1);
    const to = -from * 0.9;
    swing = c.attackKind === 'thrust' ? 0 : from + (to - from) * t;
    reach = c.attackKind === 'thrust' ? 1 : 0.95;
    if (c.attackKind !== 'thrust' && c.attackKind !== 'shoot') trail = [ang + from, ang + swing];
  } else if (c.phase === 'recover') {
    swing = c.attackKind === 'thrust' ? 0 : 1.2 * (c.combo % 2 === 0 ? 1 : -1) * (c.combo % 2 === 0 ? -1 : 1);
    reach = 0.8;
  } else if (c.phase === 'block') {
    ang = a.mem.blockAngle ?? ang;
    swing = Math.PI / 2;
    len *= 0.8;
    reach = 0.6;
  } else if (a.pose === 'work') {
    // hammering or chopping: a steady raise and fall
    const k = (Math.sin(a.animT * 6) + 1) / 2;
    ang = [Math.PI / 2, Math.PI, 0, -Math.PI / 2][a.dir] ?? Math.PI / 2;
    swing = -1.6 + k * 1.9;
    reach = 0.75;
    return { A: ang + swing, len: len * 0.8, reach, show: !fist, rest: false, trail: null, t: k };
  } else {
    rest = true;
    ang = [Math.PI / 2, Math.PI, 0, -Math.PI / 2][a.dir] + 0.6;
    len *= 0.75;
  }
  const show = !fist && (inCombat || !!a.mem.showWeapon);
  if (rest && !show) return null;
  return { A: ang + swing, len, reach, show, rest, trail, t };
}
