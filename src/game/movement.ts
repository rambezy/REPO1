// Hex-by-hex walking for all actors, in real time and in combat.

import { G, player } from './G';
import type { Actor, MapObject } from './types';
import { findPath, dirTo, hexDist, type Hex } from '../core/hex';
import { isPlayer } from './character';
import { msg } from './log';
import { sfx } from '../audio/sfx';
import { onPlayerSide } from './combat';

const resolvers = new WeakMap<Actor, (ok: boolean) => void>();

export function stepDuration(a: Actor): number {
  if (G.combat) return 200 / G.settings.combatSpeed;
  const run = (a as any)._run;
  const base = run ? 150 : 260;
  return base / ((a as any).speed ?? 1);
}

export function pathTo(a: Actor, goal: Hex, adjacent = false): Hex[] | null {
  const m = G.map;
  if (!m) return null;
  return findPath(a, goal, (q, r) => {
    if (!m.walkable(q, r, { ignoreDoors: true })) return false;
    if (!adjacent && q === goal.q && r === goal.r) return !m.actorAt(q, r) || m.actorAt(q, r) === a;
    const o = m.actorAt(q, r);
    if (!o || o === a) return true;
    // Walk through allies when not in combat; they shuffle aside.
    if (!G.combat && onPlayerSide(a) && onPlayerSide(o)) return true;
    return hexDist(a, { q, r }) > 6 && !G.combat; // distant actors will likely move
  }, { adjacentOk: adjacent, maxNodes: 8000 });
}

/** Start walking along a path. Resolves true when arrived, false if interrupted. */
export function walk(a: Actor, path: Hex[], maxSteps = Infinity): Promise<boolean> {
  const prev = resolvers.get(a);
  if (prev) prev(false);
  if (!path.length) return Promise.resolve(true);
  a._path = path.slice(0, maxSteps);
  return new Promise((res) => resolvers.set(a, res));
}

export function stopWalking(a: Actor) {
  a._path = undefined;
  const r = resolvers.get(a);
  if (r) {
    resolvers.delete(a);
    r(false);
  }
}

function finish(a: Actor, ok: boolean) {
  a._path = undefined;
  const r = resolvers.get(a);
  if (r) {
    resolvers.delete(a);
    r(ok);
  }
}

function doorAt(q: number, r: number): MapObject | undefined {
  return G.map?.objects.find((o) => o.q === q && o.r === r && (o.kind === 'door' || o.kind === 'hatch' || o.kind === 'gate') && !o.hidden);
}

export function openDoor(d: MapObject, by: Actor): boolean {
  if (d.open) return true;
  if (d.locked) {
    if (d.key && by.inv.some((s) => s.id === d.key)) {
      d.locked = 0;
      if (isPlayer(by)) msg('You unlock the door with your key.');
    } else {
      if (isPlayer(by)) msg(`The ${d.kind === 'hatch' ? 'hatch' : d.kind === 'gate' ? 'gate' : 'door'} is locked.`);
      sfx('locked');
      return false;
    }
  }
  d.open = true;
  sfx(d.kind === 'hatch' ? 'hatch' : 'door');
  if (G.map) G.map.version++;
  return true;
}

/** Called every frame: advance movement for all actors. */
export function updateMovement(now: number) {
  const m = G.map;
  if (!m) return;
  for (const a of m.actors) {
    if (a.dead) continue;
    if (a._move) {
      const t = (now - a._move.t) / a._move.dur;
      if (t >= 1) {
        a._move = undefined;
        onArrive(a);
      } else continue;
    }
    if (!a._path || !a._path.length) {
      if (a._path) finish(a, true);
      continue;
    }
    if (G.combat && G.combat.order[G.combat.turn] !== a) continue;
    const next = a._path[0];
    // Door handling
    const door = doorAt(next.q, next.r);
    if (door && !door.open) {
      if (!openDoor(door, a)) {
        finish(a, false);
        continue;
      }
    }
    const blocker = m.actorAt(next.q, next.r);
    if (blocker && blocker !== a) {
      if (!G.combat && onPlayerSide(a) && onPlayerSide(blocker) && !blocker._path) {
        // Swap places with an idle companion.
        blocker.q = a.q;
        blocker.r = a.r;
      } else {
        // Try to repath around, else give up.
        const goal = a._path[a._path.length - 1];
        const alt = findPath(a, goal, (q, r) => m.passable(q, r, a, { ignoreDoors: true }), { maxNodes: 3000 });
        if (alt && alt.length && alt.length <= a._path.length + 6) {
          a._path = alt;
        } else {
          finish(a, false);
        }
        continue;
      }
    }
    if (!m.walkable(next.q, next.r)) {
      finish(a, false);
      continue;
    }
    if (G.combat) {
      if ((a._ap ?? 0) < 1) {
        finish(a, false);
        continue;
      }
      a._ap! -= 1;
    }
    a.facing = dirTo(a, next);
    a._move = { fq: a.q, fr: a.r, t: now, dur: stepDuration(a) };
    a.q = next.q;
    a.r = next.r;
    a._path.shift();
    if (isPlayer(a) && ((a as any)._stepN = ((a as any)._stepN ?? 0) + 1) % 2 === 0) sfx('step');
  }
}

let arriveHook: ((a: Actor) => void) | null = null;
export function setArriveHook(fn: (a: Actor) => void) {
  arriveHook = fn;
}

function onArrive(a: Actor) {
  if (arriveHook) arriveHook(a);
  if (a._path && !a._path.length) finish(a, true);
}

export function isMoving(a: Actor): boolean {
  return !!a._move || !!(a._path && a._path.length);
}

let lastFollow = 0;

export function followParty() {
  // Companions trail the player when not in combat.
  const m = G.map;
  if (!m || G.combat) return;
  if (G.now - lastFollow < 400) return;
  lastFollow = G.now;
  const p = player();
  for (const c of m.actors) {
    if (!c.companion || c.dead || isMoving(c)) continue;
    const d = hexDist(c, p);
    if (d > 3 && !((c as any)._wait)) {
      const path = pathTo(c, p, true);
      if (path) {
        (c as any)._run = d > 6;
        walk(c, path.slice(0, Math.max(0, path.length - 1)));
      }
    }
  }
}
