// Leaf, dust and rage: the waste's drugs. A dose lifts some skills for a few
// hours and can leave a crash behind it. Every dose feeds a habit, and a habit
// left unfed turns to withdrawal: shaking hands, bad eyes, and a craving that
// takes whatever is in the pack. Raw crops work too, only weaker (and a raw
// glowcap turns your stomach). The Covenant burns the lot, and those who
// carry it.
import type { Char } from './char';
import { S } from './ctx';
import { HOUR, RATE } from './clock';
import { ITEM, itemValue } from '../content/items';
import { FACTION } from '../content/factions';
import { crime, witness } from './crime';
import type { Skill } from './skills';
import type { Grid, Item } from './inventory';
import type { BurstKind } from './ctx';

export interface Drug {
  /** what a character is on, as a word ("high on glowdust") */
  name: string;
  /** the habit a dose feeds: raw leaf and cured smoke share one */
  habit: 'dreamleaf' | 'glowdust' | 'redrage';
  /** the menu action and what the log says they did */
  act: string;
  verb: string;
  /** hours of lift, then hours of crash */
  hours: number;
  crash: number;
  /** addiction a dose adds, out of 100 */
  hook: number;
  lift: Partial<Record<Skill, number>>;
  low: Partial<Record<Skill, number>>;
  /** run-speed multiplier while it lasts */
  speed?: number;
  /** how much further past zero the vital parts go before they drop */
  pain?: number;
  /** how hard the world swims while high, 0..1 */
  high: number;
  /** a change in hunger (a raw glowcap brings your dinner up) */
  food?: number;
  puff: BurstKind;
}

export const DRUG: Record<string, Drug> = {
  dreamleaf: { name: 'dreamleaf', habit: 'dreamleaf', act: 'Smoke', verb: 'smokes some dreamleaf', hours: 5, crash: 0, hook: 4, lift: { toughness: 6, perception: -5, dexterity: -3 }, low: {}, pain: 0.1, high: 0.25, puff: 'smoke' },
  dreamsmoke: { name: 'dreamsmoke', habit: 'dreamleaf', act: 'Smoke', verb: 'lights a dreamsmoke', hours: 8, crash: 0, hook: 7, lift: { toughness: 14, perception: -10, dexterity: -6 }, low: {}, pain: 0.25, high: 0.4, puff: 'smoke' },
  glowcap: { name: 'glowcap', habit: 'glowdust', act: 'Eat raw', verb: 'eats a raw glowcap', hours: 2, crash: 2, hook: 6, lift: { perception: 6, athletics: 6 }, low: { dexterity: -6 }, speed: 1.04, high: 0.5, food: -60, puff: 'glint' },
  glowdust: { name: 'glowdust', habit: 'glowdust', act: 'Snort', verb: 'snorts a line of glowdust', hours: 4, crash: 3, hook: 14, lift: { athletics: 14, dexterity: 10, perception: 12, dodge: 8, stealth: 6 }, low: { athletics: -12, dexterity: -10, perception: -8 }, speed: 1.12, high: 0.65, puff: 'glint' },
  bloodthorn: { name: 'bloodthorn', habit: 'redrage', act: 'Chew', verb: 'chews a bloodthorn pod', hours: 1, crash: 1, hook: 5, lift: { strength: 6, toughness: 8 }, low: { strength: -4 }, pain: 0.15, high: 0.3, puff: 'blood' },
  redrage: { name: 'redrage', habit: 'redrage', act: 'Drink', verb: 'downs a vial of redrage', hours: 1.5, crash: 4, hook: 22, lift: { strength: 18, toughness: 25, melee_atk: 10, unarmed: 8, melee_def: -12, dodge: -8 }, low: { strength: -15, toughness: -10, dexterity: -8, athletics: -8 }, pain: 0.6, high: 0.9, puff: 'embers' },
};

/** A habit this strong, left unfed this long, is withdrawal. */
const HABIT_BITES = 30, CRAVE_AFTER = 16 * HOUR;
/** What withdrawal takes, at a habit of 100. */
const WITHDRAWAL: Partial<Record<Skill, number>> = { dexterity: -14, perception: -12, strength: -8, athletics: -10 };
export const HABIT_NAME: Record<Drug['habit'], string> = { dreamleaf: 'dreamleaf', glowdust: 'glowdust', redrage: 'redrage' };

interface High { until: number; crash: number; down?: boolean }
const highs = (c: Char): Record<string, High> => c.mem.high ?? {};
const habits = (c: Char): Record<string, number> => c.mem.habit ?? {};

/** Is this item something to take? */
export const drugOf = (id: string): Drug | undefined => DRUG[ITEM[id]?.drug ?? ''];

/** Takes one dose from a stack: its lift, its habit, and the risk of being seen doing it. */
export function takeDrug(c: Char, grid: Grid, it: Item, quiet = false): string | null {
  const d = drugOf(it.id);
  if (!d) return 'That is not something to take.';
  if (c.robot) return `${c.name} is a machine. It does nothing for them.`;
  if (c.status !== 'up') return `${c.name} is in no state to.`;
  const now = S.clock.t;
  const hi = (c.mem.high ??= {}) as Record<string, High>;
  const key = it.id;
  const on = hi[key] && hi[key].until > now;
  // a second dose on top of the first stretches it out; it doesn't lift any higher
  hi[key] = on ? { until: hi[key].until + d.hours * HOUR * 0.5, crash: hi[key].crash + d.hours * HOUR * 0.5 } : { until: now + d.hours * HOUR, crash: now + (d.hours + d.crash) * HOUR };
  const hb = (c.mem.habit ??= {}) as Record<string, number>;
  hb[d.habit] = Math.min(100, (hb[d.habit] ?? 0) + d.hook * (on ? 1.5 : 1) * (1 - Math.min(0.5, c.skill('toughness') / 200)));
  (c.mem.fed ??= {})[d.habit] = now;
  if (c.mem.craving === d.habit) delete c.mem.craving;
  if (d.food) c.hunger = Math.max(0, c.hunger + d.food);
  it.n--;
  if (it.n <= 0) grid.remove(it);
  S.fx.burst(d.puff, c.x, c.y + 1.55, c.z, d.puff === 'embers' ? 14 : 8);
  S.fx.sound(d.puff === 'smoke' ? 'inhale' : key === 'glowdust' ? 'sniff' : key === 'redrage' ? 'gulp' : 'eat', c.x, c.z, 0.6);
  if (!quiet && c.faction === 'player') S.fx.notice(`${c.name} ${d.verb}.`, 'info');
  if (d.food && c.faction === 'player') S.fx.notice(`${c.name}'s stomach turns over.`, 'bad');
  // doing it in front of the law
  for (const f of ITEM[it.id].illegal ?? []) {
    if (!FACTION[f]?.lawful) continue;
    if (witness(c, f, 20)) { crime(c, 'drugs', f, Math.max(150, Math.round(itemValue(ITEM[it.id], it.q) * 2)), false); break; }
  }
  c.dirty = true;
  return null;
}

/** What a character's drugs, crashes and cravings add to (or take from) a skill. */
export function drugLift(c: Char, s: Skill): number {
  const hi = c.mem.high as Record<string, High> | undefined;
  const hb = c.mem.craving ? habits(c) : undefined;
  if (!hi && !hb) return 0;
  const now = S.clock.t;
  let v = 0;
  if (hi) for (const [k, h] of Object.entries(hi)) {
    const d = DRUG[k];
    if (!d) continue;
    if (now < h.until) v += d.lift[s] ?? 0;
    else if (now < h.crash) v += d.low[s] ?? 0;
  }
  if (hb && c.mem.craving) v += (WITHDRAWAL[s] ?? 0) * ((hb[c.mem.craving] ?? 0) / 100);
  return v;
}

/** Run-speed multiplier from what they're on. */
export function drugSpeed(c: Char): number {
  const hi = c.mem.high as Record<string, High> | undefined;
  if (!hi) return 1;
  let k = 1;
  const now = S.clock.t;
  for (const [key, h] of Object.entries(hi)) {
    const d = DRUG[key];
    if (!d) continue;
    if (now < h.until) k *= d.speed ?? 1;
    else if (now < h.crash && d.speed) k *= 0.92; // legs of lead on the way down
  }
  return k;
}

/** How much further past zero pain lets them go before they drop. */
export function drugPain(c: Char): number {
  const hi = c.mem.high as Record<string, High> | undefined;
  if (!hi) return 0;
  let p = 0;
  for (const [key, h] of Object.entries(hi)) if (S.clock.t < h.until) p = Math.max(p, DRUG[key]?.pain ?? 0);
  return p;
}

/** How hard the world swims for them right now, 0..1 (for the screen). */
export function highLevel(c: Char): number {
  const hi = c.mem.high as Record<string, High> | undefined;
  if (!hi) return 0;
  const now = S.clock.t;
  let v = 0;
  for (const [key, h] of Object.entries(hi)) {
    const d = DRUG[key];
    if (!d || now >= h.until) continue;
    const start = h.until - d.hours * HOUR, left = h.until - now;
    const k = Math.min(1, (now - start) / (0.2 * HOUR), left / (0.5 * HOUR)); // comes on quick, fades out slower
    v = Math.max(v, d.high * Math.max(0, k));
  }
  return v;
}

/** What they're on, coming down from or craving, for the HUD. */
export function drugStatus(c: Char): { text: string; kind: 'high' | 'crash' | 'crave' }[] {
  const out: { text: string; kind: 'high' | 'crash' | 'crave' }[] = [];
  const now = S.clock.t;
  for (const [key, h] of Object.entries(highs(c))) {
    const d = DRUG[key];
    if (!d) continue;
    if (now < h.until) out.push({ text: `On ${d.name} (${Math.max(1, Math.round((h.until - now) / HOUR))}h)`, kind: 'high' });
    else if (now < h.crash) out.push({ text: `Coming down off ${d.name}`, kind: 'crash' });
  }
  if (c.mem.craving) out.push({ text: `Craving ${HABIT_NAME[c.mem.craving as Drug['habit']]}`, kind: 'crave' });
  return out;
}

/** Their habits, strongest first, for the health tab. */
export function habitList(c: Char): [string, number][] {
  return Object.entries(habits(c)).filter(([, v]) => v >= 1).sort((a, b) => b[1] - a[1]).map(([k, v]) => [HABIT_NAME[k as Drug['habit']] ?? k, v]);
}

/** A dose they carry that would feed this habit (the strongest first). */
function doseFor(c: Char, habit: string): { grid: Grid; it: Item } | null {
  let best: { grid: Grid; it: Item; hook: number } | null = null;
  for (const g of [c.inv, c.eq.back?.inv]) {
    if (!g) continue;
    for (const it of g.items) {
      const d = drugOf(it.id);
      if (d && d.habit === habit && (!best || d.hook > best.hook)) best = { grid: g, it, hook: d.hook };
    }
  }
  return best;
}

/** A fighting dose they carry (redrage, or bloodthorn at a pinch). */
export function stimFor(c: Char): { grid: Grid; it: Item } | null {
  const hi = highs(c);
  if (Object.entries(hi).some(([k, h]) => DRUG[k]?.habit === 'redrage' && S.clock.t < h.crash)) return null; // already on it, or crashing from it
  return doseFor(c, 'redrage');
}

/** Upkeep: highs run out into crashes, habits fade, unfed habits turn to cravings, and cravings get fed. */
export function tickDrugs(c: Char, dt: number) {
  if (!c.mem.high && !c.mem.habit) return;
  const now = S.clock.t;
  const gameH = (dt * RATE) / HOUR;
  const hi = c.mem.high as Record<string, High> | undefined;
  if (hi) {
    for (const [k, h] of Object.entries(hi)) {
      if (now >= h.crash) { delete hi[k]; continue; }
      const d = DRUG[k];
      if (d?.crash && !h.down && now >= h.until) {
        h.down = true;
        if (c.faction === 'player') S.fx.notice(`${c.name} is coming down off ${d.name}.`, 'info');
      }
    }
    if (!Object.keys(hi).length) delete c.mem.high;
  }
  const hb = c.mem.habit as Record<string, number> | undefined;
  if (!hb) return;
  const fed = (c.mem.fed ?? {}) as Record<string, number>;
  let craving: string | null = null, worst = 0;
  for (const [h, v] of Object.entries(hb)) {
    // a habit fades a few points a day, slower while it's being fed
    const nv = v - gameH * (now - (fed[h] ?? 0) < CRAVE_AFTER ? 0.06 : 0.2);
    if (nv <= 0) { delete hb[h]; continue; }
    hb[h] = nv;
    const high = hi && Object.entries(hi).some(([k, x]) => DRUG[k]?.habit === h && now < x.until);
    if (nv >= HABIT_BITES && !high && now - (fed[h] ?? 0) > CRAVE_AFTER && nv > worst) { worst = nv; craving = h; }
  }
  if (!Object.keys(hb).length) delete c.mem.habit;
  if (craving !== (c.mem.craving ?? null)) {
    if (craving) {
      c.mem.craving = craving;
      if (c.faction === 'player') S.fx.notice(`${c.name} is craving ${HABIT_NAME[craving as Drug['habit']]}: hands shaking, eyes bad.`, 'bad');
    } else delete c.mem.craving;
  }
  // a craving takes what's in the pack: the hooked soon, the badly hooked sooner
  if (c.mem.craving && c.up && !c.atk && !c.brain.enemy) {
    const need = hb[c.mem.craving] ?? 0;
    const chance = c.faction === 'player' ? (need > 60 ? 0.6 : 0) : 1;
    if (chance && S.rng.chance(Math.min(1, chance * gameH))) {
      const dose = doseFor(c, c.mem.craving);
      if (dose) {
        if (c.faction === 'player') S.fx.notice(`${c.name} couldn't hold out any longer.`, 'bad');
        takeDrug(c, dose.grid, dose.it);
      }
    }
  }
}
