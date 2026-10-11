// The jolt of a big hit: a moment's hold on the simulation and a small kick
// of the camera. Both are presentation only (the sim's own clock never sees
// them) and both stay off for anyone who asked for less motion. The hold is
// rationed: never above normal speed, a second between jolts, and no more
// than a twentieth of the time, so a brawl stays a brawl and not a strobe.
import { G } from '../state';

let hold = 0; // real seconds of hitstop left
let cooldown = 0;
let count = 0; // jolts so far (for tests)
let held = 0; // seconds spent holding, over a fading window
let elapsed = 0; // seconds that window spans
const BUDGET = 0.05;
const WINDOW = 20;
const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** The reduced-motion setting, or the browser's own preference. */
export function reducedMotion(): boolean {
  return !!G.settings?.reducedMotion || !!mq?.matches;
}

/**
 * A hit worth feeling, `k` from 0 (a solid blow) to 1 (a limb off, a death):
 * the camera is nudged a little, and at normal speed the world holds for 40
 * to 70 ms.
 */
export function impact(k: number) {
  if (reducedMotion() || !G.speed) return;
  if (cooldown > 0) return;
  k = Math.max(0, Math.min(1, k));
  cooldown = 1;
  count++;
  if (G.cam) G.cam.shake = Math.max(G.cam.shake, 0.12 + 0.22 * k);
  if (G.speed <= 1 && held <= BUDGET * elapsed) hold = 0.04 + 0.03 * k;
}

/**
 * Multiplier for this frame's sim step, the hold used up by the fraction of
 * the frame it covers. Call once a frame with the real dt.
 */
export function impactScale(dt: number): number {
  if (cooldown > 0) cooldown -= dt;
  const fade = Math.exp(-dt / WINDOW);
  elapsed = elapsed * fade + dt;
  held *= fade;
  if (hold <= 0 || dt <= 0) return 1;
  const used = Math.min(hold, dt);
  hold -= used;
  held += used;
  return 1 - used / dt;
}

/** For tests and the debug handle. */
export const impactState = () => ({ hold, cooldown, count, held, elapsed });

/** Forgets everything (tests). */
export function resetImpact() { hold = 0; cooldown = 0; count = 0; held = 0; elapsed = 0; }
