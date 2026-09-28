// Squad-level movement: patrols walk their loops, travellers follow roads.
// The leader is steered; followers keep formation behind (see routine).
import { S } from './ctx';
import { goTo } from './move';
import { Squad } from './squad';

let t = 0;

export function isRouted(sq: Squad | undefined) {
  return !!sq && (!!sq.flags.loop || sq.task.k === 'travel' || sq.task.k === 'patrol' || sq.task.k === 'raid');
}

export function tickSquads(dt: number) {
  t -= dt;
  if (t > 0) return;
  t = 0.5;
  for (const sq of S.W.squads.values()) {
    if (!sq.leader) continue;
    const L = S.W.char(sq.leader);
    if (!L || !L.active) continue;
    if (!L.up) {
      // pick a new leader who is still standing
      const nl = sq.members.map((m) => S.W.char(m)).find((c) => c && c.up);
      if (nl) sq.leader = nl.id;
      continue;
    }
    if (L.brain.enemy || L.brain.task || L.brain.flee || L.faction === 'player') continue;
    const loop = sq.flags.loop as [number, number][] | undefined;
    if (loop && loop.length) {
      if (!L.hasGoal) {
        sq.ri = (sq.ri + 1) % loop.length;
        const [x, z] = loop[sq.ri];
        goTo(L, x, z);
        L.move = 'walk';
      }
      continue;
    }
    if (sq.route && sq.ri < sq.route.length / 2) {
      if (!L.hasGoal) {
        // wait for stragglers
        const lag = sq.members.some((m) => { const c = S.W.char(m); return c && c.up && Math.hypot(c.x - L.x, c.z - L.z) > 25; });
        if (lag) continue;
        const x = sq.route[sq.ri * 2], z = sq.route[sq.ri * 2 + 1];
        goTo(L, x, z);
        L.move = sq.kind === 'raid' ? 'run' : 'walk';
        sq.ri++;
      }
      sq.x = L.x; sq.z = L.z;
    }
  }
}
