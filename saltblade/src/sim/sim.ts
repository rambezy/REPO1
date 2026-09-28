// The simulation step: activation around the player, AI, movement, combat,
// health and presentation timers for every active character.
import { Char } from './char';
import { S } from './ctx';
import { tickAI } from './ai';
import { tickMove, newFrame } from './move';
import { tickHealth } from './health';
import { tickReload } from './combat';

export const ACTIVE_R = 460;
const LOOP_ACTS = new Set(['mine', 'build', 'farm', 'craft', 'research', 'talk']);

let activationT = 0;
export const anchors: { x: number; z: number }[] = [];

/** Recomputes which characters are simulated in detail. */
export function updateActivation(extra?: { x: number; z: number }) {
  const W = S.W;
  anchors.length = 0;
  for (const c of W.playerChars()) if (c.alive) anchors.push({ x: c.x, z: c.z });
  if (extra) anchors.push(extra);
  const act: Char[] = [];
  for (const c of W.chars.values()) {
    let on = false;
    for (const a of anchors) {
      const dx = c.x - a.x, dz = c.z - a.z;
      if (dx * dx + dz * dz < ACTIVE_R * ACTIVE_R) { on = true; break; }
    }
    if (c.faction === 'player') on = true;
    c.active = on;
    if (on) act.push(c);
  }
  W.active = act;
}

export function simStep(dt: number, focus?: { x: number; z: number }) {
  const W = S.W;
  S.time += dt;
  S.clock.advance(dt);
  activationT -= dt;
  if (activationT <= 0) { updateActivation(focus); activationT = 1; }
  // spatial index
  W.hash.clear();
  for (const c of W.active) if (!c.carriedBy) W.hash.insert(c);
  newFrame();
  for (const c of W.active) {
    if (c.status === 'dead') { c.act = null; continue; }
    tickHealth(c, dt);
    if ((c.status as string) === 'dead') continue;
    tickReload(c, dt);
    tickAI(c, dt);
    const moved = tickMove(c, dt);
    c.mem.moved = moved;
    if (c.act) {
      c.actT += dt / Math.max(0.05, c.actDur);
      if (c.actT >= 1) {
        if (LOOP_ACTS.has(c.act)) c.actT %= 1;
        else { c.act = null; c.actT = 0; }
      }
    }
    if (c.barkT > 0) c.barkT -= dt;
    // wake sleepers who are needed
    if (c.sleeping && c.faction === 'player' && (c.order || (c.hunger < 30 && !c.robot))) c.sleeping = false;
    if (c.sleeping && !S.clock.isNight && c.faction !== 'player' && S.clock.hour > 6 && S.clock.hour < 19) {
      c.sleeping = false;
      const b = W.objs.get(c.bed);
      if (b && b.occupant === c.id) b.occupant = 0;
      c.bed = 0;
    }
  }
  // carried bodies ride on their carriers
  for (const c of W.active) {
    if (!c.carriedBy) continue;
    const k = W.char(c.carriedBy);
    if (!k || k.status !== 'up' || k.carrying !== c.id) { c.carriedBy = 0; if (k) k.carrying = 0; continue; }
    c.x = k.x; c.z = k.z; c.y = k.y; c.dir = k.dir;
  }
}
