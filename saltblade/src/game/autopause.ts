// Auto-pause rules: the game stops itself when something happens to one of
// yours that you would want to see. Each rule is a setting (see
// game/settings.ts): someone goes down (on by default), an idle person is
// attacked, a limb is lost.
import { G } from '../state';
import { S } from '../sim/ctx';
import { emit } from '../core/events';
import type { Char } from '../sim/char';
import { setSpeed } from './control';

const attackedAt = new Map<number, number>(); // char id -> sim time of the last pause for an attack on them
const ATTACK_COOLDOWN = 20; // sim seconds
const LULL = 10; // sim seconds without a blow before the next one counts as a new attack
let pausedAt = -1e9; // real time of the last auto-pause

function pause(why: string, notice = true) {
  if (G.mode !== 'play') return false;
  const now = G.realTime ?? 0;
  // the same blow can set off two rules (hit, then down): the game is already stopped, but say why
  if (!G.speed && now - pausedAt > 0.1) return false;
  if (G.speed) setSpeed(0);
  pausedAt = now;
  if (notice) emit('notice', `Paused: ${why}`, 'bad');
  emit('autopause', why);
  return true;
}

/**
 * One of yours was hit by someone else: pause if they were not already
 * fighting, and only for the first blow after a lull, so someone who never
 * fights back is not paused on every swing. The hook runs before the sim
 * records this blow, so `lastHitT` is still the one before it.
 */
export function hitRule(c: Char, by: Char): boolean {
  if (!G.settings?.pauseOnAttacked || c.faction !== 'player' || by.faction === 'player' || by === c || !c.up) return false;
  const idle = !c.drawn && !c.atk && !c.target && c.order?.k !== 'attack';
  if (!idle) return false;
  if (S.time - c.lastHitT < LULL) return false;
  if (S.time - (attackedAt.get(c.id) ?? -1e9) < ATTACK_COOLDOWN) return false;
  attackedAt.set(c.id, S.time);
  return pause(`${c.name} is under attack`);
}

/** One of yours is knocked out. */
export function koRule(c: Char): boolean {
  if (!G.settings?.pauseOnKO || c.faction !== 'player') return false;
  return pause(`${c.name} is down`);
}

/** One of yours lost a limb to a blow (the sim has already said so: no second notice). */
export function limbRule(c: Char): boolean {
  if (!G.settings?.pauseOnLimbLost || c.faction !== 'player') return false;
  return pause(`${c.name} lost a limb`, false);
}

/** Forgets the cooldowns (a new game or a load). */
export function resetAutopause() { attackedAt.clear(); pausedAt = -1e9; }
