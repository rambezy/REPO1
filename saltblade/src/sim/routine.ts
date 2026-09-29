// Daily routines for the people and beasts of the world when nothing more
// pressing is happening: guard posts, counters, wandering, sleeping, working,
// following the squad leader on the road.
import { Char } from './char';
import { S } from './ctx';
import { goTo, stop, near } from './move';
import { ANIMAL } from '../content/animals';
import { isRouted } from './squads';
import { reachOf } from './structures';

/** Formation offset behind a leader for squad member i. */
function slot(i: number): [number, number] {
  const row = Math.floor((i + 1) / 2), side = i % 2 ? 1 : -1;
  return [side * (1.2 + (row % 2) * 0.4), -1.6 * row];
}

export function followLeader(c: Char, leader: Char, idx: number, run: boolean) {
  const [ox, oz] = slot(idx);
  const s = Math.sin(leader.dir), co = Math.cos(leader.dir);
  const tx = leader.x + ox * co + oz * s, tz = leader.z - ox * s + oz * co;
  const d = Math.hypot(tx - c.x, tz - c.z);
  if (d > 1.2) {
    goTo(c, tx, tz);
    c.move = run || d > 12 ? 'run' : leader.move === 'sneak' ? 'sneak' : leader.speed > 2.5 ? 'run' : 'walk';
  } else if (!leader.hasGoal) stop(c);
}

export function runRoutine(c: Char, dt: number, think: boolean) {
  const sq = S.W.squadOf(c);
  const B = c.brain;
  // squad followers
  if (sq && sq.leader && sq.leader !== c.id && (sq.kind === 'patrol' || sq.kind === 'caravan' || sq.kind === 'raid' || sq.kind === 'wanderers' || sq.kind === 'slavers' || sq.kind === 'bounty' || sq.kind === 'herd')) {
    const leader = S.W.char(sq.leader);
    if (leader && leader.up) {
      if (think) followLeader(c, leader, sq.members.indexOf(c.id), false);
      return;
    }
  }
  if (sq && sq.leader === c.id && isRouted(sq)) return;
  if (!think) return;
  const night = S.clock.isNight;
  const h = S.clock.hour;
  if (c.animal) return animalRoutine(c);
  switch (c.role) {
    case 'guard':
    case 'construct':
    case 'priest':
    case 'shopkeeper':
    case 'barkeep':
    case 'boss':
      // stand at post, facing out
      if (!near(c, c.homeX, c.homeZ, 1.2)) { goTo(c, c.homeX, c.homeZ); c.move = 'walk'; }
      else { stop(c); if (!c.hasGoal) c.dir = c.homeDir; c.drawn = false; }
      if (c.role === 'shopkeeper' || c.role === 'barkeep') c.act = S.rng.chance(0.02) ? 'talk' : c.act === 'talk' ? 'talk' : null;
      return;
    case 'slave':
    case 'worker':
      if (!near(c, c.homeX, c.homeZ, 2)) { goTo(c, c.homeX, c.homeZ); c.move = 'walk'; return; }
      if (!night && h > 6.5 && h < 18.5) { c.act = 'farm'; c.actDur = 3; c.actT = (c.actT + 0.02) % 1; }
      else { c.act = null; c.mem.sit = true; }
      return;
    case 'prisoner':
      return;
    case 'recruit':
    case 'resident':
    case 'noble':
    case 'bandit':
    case 'merc':
    case 'hunter':
    case 'slaver':
    case 'wanderer':
    case 'trader':
    case 'caravan':
    default: {
      // sleep at night where they live; wander by day
      if (night && c.role !== 'bandit' && B.bed) {
        const bed = S.W.objs.get(B.bed);
        if (bed && !bed.occupant) {
          if (!near(c, bed.x, bed.z, reachOf(bed))) { goTo(c, bed.x, bed.z); c.move = 'walk'; return; }
          bed.occupant = c.id; c.bed = bed.id; c.sleeping = true; c.x = bed.x; c.z = bed.z; c.dir = bed.rot;
          return;
        }
      }
      if (c.hasGoal) return;
      // bar patrons keep to their stools, and now and then get up for a stretch
      if (c.mem.seat && sitOnStool(c)) return;
      B.idleT = (B.idleT ?? 0) - 0.45;
      if (B.idleT > 0) return;
      B.idleT = S.rng.range(6, 24);
      const r = c.role === 'bandit' || c.role === 'recruit' ? 8 : c.role === 'noble' ? 10 : 30;
      if (c.role === 'recruit' && S.rng.chance(0.7)) { c.mem.sit = S.rng.chance(0.5); return; }
      if (S.rng.chance(0.35)) { c.mem.sit = c.role === 'bandit' && S.rng.chance(0.6); return; }
      c.mem.sit = false;
      const a = S.rng.range(0, Math.PI * 2), d = S.rng.range(2, r);
      const tx = c.homeX + Math.sin(a) * d, tz = c.homeZ + Math.cos(a) * d;
      const spot = S.nav.nearestOpen(tx, tz, 5);
      if (spot) { goTo(c, spot[0], spot[1]); c.move = 'walk'; }
    }
  }
}

/** Sits a patron on their stool; returns false when they would rather stretch their legs. */
function sitOnStool(c: Char): boolean {
  const B = c.brain;
  const st = S.W.objs.get(c.mem.seat);
  if (!st || (st.user && st.user !== c.id)) return false;
  B.stoolT = (B.stoolT ?? S.rng.range(40, 200)) - 0.45;
  if (B.stoolT <= 0) {
    B.stoolT = S.rng.range(60, 240);
    if (S.rng.chance(0.3)) {
      // up for a while
      st.user = 0; c.mem.using = 0; c.mem.sit = false;
      B.idleT = S.rng.range(10, 25);
      const a = S.rng.range(0, Math.PI * 2), d = S.rng.range(2, 6);
      const spot = S.nav.nearestOpen(st.x + Math.sin(a) * d, st.z + Math.cos(a) * d, 4);
      if (spot) { goTo(c, spot[0], spot[1]); c.move = 'walk'; }
      return true;
    }
  }
  if ((B.idleT ?? 0) > 0 && !c.mem.using) { B.idleT -= 0.45; return true; }
  if (!near(c, st.x, st.z, 0.5)) { c.mem.sit = false; goTo(c, st.x, st.z); c.move = 'walk'; return true; }
  stop(c);
  c.x = st.x; c.z = st.z; c.dir = st.rot;
  st.user = c.id; c.mem.using = st.id; c.mem.sit = true;
  return true;
}

function animalRoutine(c: Char) {
  const B = c.brain;
  const a = ANIMAL[c.animal!];
  if (c.hasGoal) return;
  B.idleT = (B.idleT ?? 0) - 0.45;
  if (B.idleT > 0) return;
  B.idleT = S.rng.range(4, 16);
  const sq = S.W.squadOf(c);
  const leader = sq ? S.W.char(sq.leader) : null;
  const cx = leader && leader !== c ? leader.x : c.homeX, cz = leader && leader !== c ? leader.z : c.homeZ;
  const r = a.diet === 'grazer' ? 18 : 28;
  const ang = S.rng.range(0, Math.PI * 2), d = S.rng.range(2, r);
  const spot = S.nav.nearestOpen(cx + Math.sin(ang) * d, cz + Math.cos(ang) * d, 5);
  if (spot) { goTo(c, spot[0], spot[1]); c.move = S.rng.chance(0.2) ? 'run' : 'walk'; }
}
