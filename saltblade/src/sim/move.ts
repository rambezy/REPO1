// Walking: path planning with a per-frame budget, waypoint following,
// crowd separation, sliding along walls, wading and swimming.
import { Char } from './char';
import { S } from './ctx';
import { planPath, refine, F_BLOCK, F_DEEP } from '../world/nav';
import { SEA, WADE_DEPTH } from '../world/consts';
import { train } from './train';
import { turnToward } from '../core/math';
import { floorAt } from './structures';

let plansThisFrame = 0;
export const PLAN_BUDGET = 10;
export function newFrame() { plansThisFrame = 0; }

/** Orders a character to walk somewhere. */
export function goTo(c: Char, x: number, z: number) {
  if (c.hasGoal && Math.abs(c.goalX - x) < 0.3 && Math.abs(c.goalZ - z) < 0.3 && c.path) return;
  c.goalX = x;
  c.goalZ = z;
  c.hasGoal = true;
  c.path = null;
  c.stuckT = 0;
}

export function stop(c: Char) {
  c.hasGoal = false;
  c.path = null;
}

export function near(c: Char, x: number, z: number, r: number) {
  return Math.hypot(c.x - x, c.z - z) <= r;
}

/** Steps a character's movement. Returns metres moved. */
export function tickMove(c: Char, dt: number): number {
  c.speed = 0;
  if (c.status !== 'up' || c.carriedBy || c.cage || c.bed || c.knockT > 0 || c.sleeping) return 0;
  const busy = !!c.atk || c.act === 'mine' || c.act === 'build' || c.act === 'craft' || c.act === 'farm' || c.act === 'research';
  let dx = 0, dz = 0;
  if (c.hasGoal && !busy) {
    if (!c.path) {
      if (plansThisFrame >= PLAN_BUDGET) return 0;
      plansThisFrame++;
      c.path = planPath(S.nav, c.x, c.z, c.goalX, c.goalZ);
      if (!c.path) { c.hasGoal = false; c.mem.pathFail = (c.mem.pathFail ?? 0) + 1; return 0; }
    }
    const p = c.path;
    let tx = 0, tz = 0, found = false;
    while (!found) {
      if (p.idx < p.pts.length / 2) {
        tx = p.pts[p.idx * 2]; tz = p.pts[p.idx * 2 + 1];
        const last = p.idx === p.pts.length / 2 - 1 && p.cidx >= p.coarse.length / 2;
        if (Math.hypot(tx - c.x, tz - c.z) < (last ? 0.25 : 0.55)) { p.idx++; continue; }
        found = true;
      } else if (p.cidx < p.coarse.length / 2) {
        if (plansThisFrame >= PLAN_BUDGET) return 0;
        plansThisFrame++;
        refine(S.nav, p, c.x, c.z);
      } else {
        c.hasGoal = false;
        c.path = null;
        break;
      }
    }
    if (found) {
      dx = tx - c.x; dz = tz - c.z;
      const l = Math.hypot(dx, dz);
      if (l > 0) { dx /= l; dz /= l; }
    }
  }
  // separation from neighbours
  let sx = 0, sz = 0;
  S.W.hash.near(c.x, c.z, 1.1, (o, d2) => {
    if (o === c || o.status === 'dead' || o.carriedBy || o.cage) return;
    const d = Math.sqrt(d2) || 0.01;
    const push = (1.1 - d) / 1.1;
    const w = o.status !== 'up' ? 0.4 : 1;
    sx += ((c.x - o.x) / d) * push * w;
    sz += ((c.z - o.z) / d) * push * w;
  });
  const moving = dx !== 0 || dz !== 0;
  const sp = c.moveSpeed();
  let vx = dx * sp + sx * (moving ? 1.2 : 1.5);
  let vz = dz * sp + sz * (moving ? 1.2 : 1.5);
  if (!moving && Math.hypot(sx, sz) < 0.05) { vx = 0; vz = 0; }
  if (vx === 0 && vz === 0) {
    swimCheck(c);
    return 0;
  }
  const nx = c.x + vx * dt, nz = c.z + vz * dt;
  let mx = nx, mz = nz;
  if (!S.nav.walkable(nx, nz)) {
    // slide along whichever axis is open
    if (S.nav.walkable(nx, c.z)) mz = c.z;
    else if (S.nav.walkable(c.x, nz)) mx = c.x;
    else { mx = c.x; mz = c.z; }
  }
  const moved = Math.hypot(mx - c.x, mz - c.z);
  if (moving) {
    if (moved < sp * dt * 0.25) {
      c.stuckT += dt;
      if (c.stuckT > 1.2) {
        // wedged inside something built round them: step out onto open ground
        if (!S.nav.walkable(c.x, c.z)) { const out = S.nav.nearestOpen(c.x, c.z, 4); if (out) { mx = out[0]; mz = out[1]; } }
        c.path = null; // replan
        c.stuckT = 0;
        c.mem.stuck = (c.mem.stuck ?? 0) + 1;
        if (c.mem.stuck > 4) { c.hasGoal = false; c.mem.stuck = 0; }
      }
    } else { c.stuckT = 0; c.mem.stuck = 0; }
  }
  c.x = mx; c.z = mz;
  c.speed = moved / dt;
  if (moving) c.dir = turnToward(c.dir, Math.atan2(vx, vz), dt * 10);
  swimCheck(c);
  // training through movement
  if (moved > 0 && moving && c.faction === 'player') {
    c.stats.dist += moved;
    if (c.swim) train(c, 'swimming', moved * 0.02, 1);
    else if (c.move === 'run') train(c, 'athletics', moved * 0.004, 0.6 + Math.max(0, c.load() - 0.5) * 2);
    else if (c.move === 'sneak') train(c, 'stealth', moved * 0.006, 0.8);
    if (c.load() > 0.9) train(c, 'strength', moved * 0.003, c.load());
  }
  return moved;
}

function swimCheck(c: Char) {
  const h = S.T.heightAt(c.x, c.z);
  const swim = SEA - h > WADE_DEPTH + 0.3;
  if (swim && !c.swim && c.active) S.fx.sound('splash', c.x, c.z, 0.8);
  c.swim = swim;
  c.y = c.swim ? SEA - 1.25 : floorAt(c.x, c.z);
}

/** Can this character get to (x, z) at all? (cheap fine check) */
export function reachable(x: number, z: number) {
  const v = S.nav.cell(x, z);
  return v !== F_BLOCK && v !== F_DEEP;
}
