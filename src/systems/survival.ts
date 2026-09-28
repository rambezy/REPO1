// The passage of time and bodily needs: hunger, fatigue, drink, dirt,
// natural healing, sleeping and waiting.

import { G } from '../G';
import { S, hourF, dayIndex } from '../state';
import { addBuff, hasPerk, buffActive, pruneBuffs, maxHp } from './stats';
import { notify } from '../ui/notify';
import { emit } from '../engine/events';
import { fadeTo } from './transition';
import { sfx } from '../audio/sfx';

export const MIN_PER_SEC = 1; // one game minute per real second

let lastHour = -1;
let lastDay = -1;
let warned: Record<string, boolean> = {};

export function advanceTime(dt: number) {
  const mins = dt * MIN_PER_SEC * G.timeScale;
  S.minutes += mins;
  applyNeeds(mins / 60);
  const h = Math.floor(hourF());
  if (h !== lastHour) {
    lastHour = h;
    emit('hour', h);
    pruneBuffs();
  }
  const d = dayIndex();
  if (d !== lastDay) {
    if (lastDay >= 0) emit('day', d);
    lastDay = d;
  }
}

/** Applies needs for a span of game hours (used for both real time and sleeping). */
export function applyNeeds(hours: number, sleeping = false) {
  const p = G.player;
  if (!p) return;
  const hungerRate = hasPerk('iron_stomach') ? 2.4 : 3.2;
  S.hunger = Math.max(0, S.hunger - hours * hungerRate * (sleeping ? 0.6 : 1));
  if (sleeping) S.energy = Math.min(100, S.energy + hours * 13);
  else S.energy = Math.max(0, S.energy - hours * (buffActive('rested') ? 3.4 : 4.6));
  S.drunk = Math.max(0, S.drunk - hours * (sleeping ? 25 : 12));
  if (!sleeping && G.map?.outdoor) S.dirt = Math.min(100, S.dirt + hours * 1.2);
  // health
  const bleeding = p.combat.bleeding > 0;
  let regen = 0;
  if (S.hunger > 50 && !bleeding) regen += 1.5;
  if (buffActive('fed_well')) regen += 5;
  if (sleeping) regen += S.hunger > 20 ? 9 : 3;
  if (S.hunger < 5) regen -= 3;
  p.maxHp = maxHp();
  p.hp = Math.max(1, Math.min(p.maxHp, p.hp + regen * hours));
  S.hp = p.hp;
  // warnings (once per threshold crossing)
  const warn = (key: string, cond: boolean, msg: string) => {
    if (cond && !warned[key]) { warned[key] = true; notify(msg, 'bad', 5000); }
    if (!cond) warned[key] = false;
  };
  warn('hungry', S.hunger < 30 && S.hunger >= 12, 'You are hungry. Your stamina suffers.');
  warn('starving', S.hunger < 12, 'You are starving. Eat something, soon.');
  warn('tired', S.energy < 25 && S.energy >= 10, 'You are tired. Find a bed.');
  warn('exhausted', S.energy < 10, 'You are exhausted. Your legs feel like lead.');
  warn('dirty', S.dirt > 70, 'You are filthy. People wrinkle their noses at you.');
  if (S.drunk >= 95 && !sleeping) passOut();
}

let passing = false;
async function passOut() {
  if (passing) return;
  passing = true;
  notify('The ground rises up to meet you...', 'bad');
  await sleepHours(6, { quality: 0.5, noSave: true, reason: 'drunk' });
  addBuff('hungover', 240);
  passing = false;
}

export interface SleepOpts { quality?: number; noSave?: boolean; reason?: string; until?: number }

/** Fades to black and advances time. quality scales energy recovery (inn beds are better than haystacks). */
export async function sleepHours(hours: number, opts: SleepOpts = {}) {
  const prevMode = G.mode;
  G.controlLocked = true;
  await fadeTo(1, 0.8);
  const steps = Math.ceil(hours * 4);
  for (let i = 0; i < steps; i++) {
    const h = hours / steps;
    S.minutes += h * 60;
    applyNeeds(h * (opts.quality ?? 1), true);
    emit('sleep:tick');
    await new Promise((r) => setTimeout(r, 20));
  }
  if (opts.quality && opts.quality > 0.9) addBuff('rested', 360);
  lastHour = -1;
  emit('slept', hours, opts.reason);
  if (!opts.noSave) emit('autosave', 'sleep');
  sfx('rooster');
  await fadeTo(0, 1.0);
  G.controlLocked = false;
  G.mode = prevMode === 'play' ? 'play' : G.mode;
}

/** Hours until a given clock hour (e.g. 7 for sunrise). */
export function hoursUntil(targetHour: number): number {
  const h = hourF();
  let d = targetHour - h;
  if (d <= 0.05) d += 24;
  return d;
}

export async function waitHours(hours: number) {
  G.controlLocked = true;
  await fadeTo(0.85, 0.4);
  const steps = Math.ceil(hours * 4);
  for (let i = 0; i < steps; i++) {
    const h = hours / steps;
    S.minutes += h * 60;
    applyNeeds(h, false);
    emit('sleep:tick');
    await new Promise((r) => setTimeout(r, 15));
  }
  lastHour = -1;
  await fadeTo(0, 0.5);
  G.controlLocked = false;
}

export function resetSurvivalWarnings() { warned = {}; lastHour = -1; lastDay = dayIndex(); }
