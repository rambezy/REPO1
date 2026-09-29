// Game clock: date formatting, passage of time, healing, deadlines.

import { G, player } from './G';
import { tickEffects, playerRadTick, heal } from './effects';
import { healingRate } from './character';
import { emit, msg } from './log';

// Day 1 is 12 August 2177, 07:00.
export const START_MINUTE = 7 * 60;
const START = { y: 2177, m: 7, d: 12 };
const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const MDAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function dateParts(t: number) {
  t = Math.floor(t);
  let day = Math.floor(t / 1440);
  let { y, m, d } = START;
  d += day;
  while (d > MDAYS[m]) {
    d -= MDAYS[m];
    m++;
    if (m > 11) {
      m = 0;
      y++;
    }
  }
  const mins = t % 1440;
  return { y, m, d, hh: Math.floor(mins / 60), mm: mins % 60 };
}

export function fmtDate(t: number): string {
  const p = dateParts(t);
  return `${String(p.d).padStart(2, '0')} ${MONTHS[p.m]} ${p.y}`;
}

export function fmtTime(t: number): string {
  const p = dateParts(t);
  return String(p.hh).padStart(2, '0') + String(p.mm).padStart(2, '0');
}

export function dayNumber(t = G.state.time): number {
  return Math.floor(t / 1440) + 1;
}

export function hourOf(t = G.state.time): number {
  return Math.floor((t % 1440) / 60);
}

/** 0 = full day, 1 = deep night. */
export function nightness(t = G.state.time): number {
  const h = (t % 1440) / 60;
  if (h >= 7 && h <= 18) return 0;
  if (h > 18 && h < 21) return (h - 18) / 3;
  if (h >= 21 || h < 4) return 1;
  return 1 - (h - 4) / 3;
}

export function waterDaysLeft(): number {
  return Math.max(0, Math.ceil((G.state.waterDeadline - G.state.time) / 1440));
}

let minuteAcc = 0;

/** Advance the clock. Handles effects, healing and deadlines. */
export function advanceTime(minutes: number, opts: { resting?: boolean } = {}) {
  if (minutes <= 0) return;
  const s = G.state;
  const before = s.time;
  s.time += minutes;
  const p = player();
  tickEffects(p, minutes);
  for (const c of s.party) tickEffects(c, minutes);
  if (G.map) {
    for (const a of G.map.actors) if (a !== p && a.effects.length) tickEffects(a, minutes);
    const rads = G.map.radsAt(p.q, p.r);
    if (rads > 0) playerRadTick(rads, minutes);
  }
  // Natural healing: healing rate every 6 hours, or every 2 hours while resting.
  const period = opts.resting ? 120 : 360;
  const heals = Math.floor(s.time / period) - Math.floor(before / period);
  if (heals > 0 && !G.combat) {
    const hr = healingRate(p);
    heal(p, hr * heals);
    for (const c of s.party) heal(c, hr * heals);
    if (G.map) for (const a of G.map.actors) if (a.companion && !a.dead) heal(a, hr * heals);
  }
  if (G.map?.def.onTick) {
    minuteAcc += minutes;
    if (minuteAcc >= 1) {
      minuteAcc = 0;
      import('./script').then(({ ctx }) => G.map?.def.onTick?.(ctx()));
    }
  }
  checkDeadlines();
  emit('time');
}

export function checkDeadlines() {
  const s = G.state;
  if (s.ended) return;
  if (!s.flags.coreReturned && s.time >= s.waterDeadline) {
    import('../ui/endings').then((m) => m.showEnding('water'));
    return;
  }
  if (s.armyDeadline && !s.flags.gameWon && s.time >= s.armyDeadline) {
    import('../ui/endings').then((m) => m.showEnding('army'));
    return;
  }
  const left = waterDaysLeft();
  if (!s.flags.coreReturned && [100, 50, 20, 10, 5, 1].includes(left) && s.flags._warned !== left) {
    s.flags._warned = left;
    msg(`Your wrist-link blinks: ${left} day${left === 1 ? '' : 's'} of water left in Shelter 29.`);
  }
}
