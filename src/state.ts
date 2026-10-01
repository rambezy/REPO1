// Serializable game state (everything that goes into a save file) and
// helpers for flags and the calendar.

export interface ItemStack { id: string; n: number; q?: number; stolen?: boolean; cond?: number }

export interface QuestState {
  stage: string;
  status: 'active' | 'done' | 'failed';
  entries: string[];
  started: number; // game minutes
  vars: Record<string, any>;
}

export interface GameState {
  version: number;
  playerName: string;
  minutes: number;
  flags: Record<string, any>;
  quests: Record<string, QuestState>;
  trackedQuest: string | null;
  inv: ItemStack[];
  equip: Record<string, string | null>; // slot -> item id
  quick: (string | null)[];
  money: number;
  attrs: Record<string, number>; // strength, agility, vitality, speech
  skills: Record<string, number>; // level per skill
  xp: Record<string, number>; // xp per attr/skill
  perks: string[];
  perkPoints: Record<string, number>;
  hunger: number; // 0..100 (100 = full)
  energy: number; // 0..100 (100 = rested)
  hp: number;
  stamina: number;
  bleeding: number;
  dirt: number; // 0..100
  drunk: number;
  buffs: { id: string; until: number; power?: number }[];
  rep: Record<string, number>;
  rel: Record<string, number>;
  containers: Record<string, ItemStack[]>;
  picked: Record<string, number>; // herb key -> minute it regrows
  looted: Record<string, boolean>;
  deadNpcs: Record<string, boolean>;
  npcState: Record<string, Record<string, any>>;
  mapId: string;
  px: number;
  py: number;
  pdir: number;
  discovered: string[];
  codex: string[];
  bounty: Record<string, number>;
  booksRead: string[];
  recipes: string[];
  stats: Record<string, number>; // kills, mercy, etc.
  dog: { owned: boolean; name: string; affection: number; hp: number; mode: 'follow' | 'stay' | 'home'; x?: number; y?: number; map?: string; downUntil?: number };
  merchants: Record<string, { restock: number; stock: ItemStack[]; money: number }>;
  lastSave: number;
  playSeconds: number;
  difficulty: 'story' | 'normal' | 'hard';
  journal: { day: number; text: string }[];
}

export const START_MINUTES = 6 * 60 + 20; // 06:20 on day 0

export function newState(name = 'Janek'): GameState {
  return {
    version: 1,
    playerName: name,
    minutes: START_MINUTES,
    flags: {},
    quests: {},
    trackedQuest: null,
    inv: [],
    equip: { weapon: null, head: null, body: null, legs: null, hands: null, torch: null, bow: null },
    quick: [null, null, null, null],
    money: 4,
    attrs: { strength: 3, agility: 3, vitality: 3, speech: 3 },
    skills: { sword: 1, blunt: 1, axe: 1, archery: 0, defense: 1, stealth: 1, thievery: 0, alchemy: 0, herbalism: 1, smithing: 2, reading: 0, houndmaster: 0, horsemanship: 0 },
    xp: {},
    perks: [],
    perkPoints: {},
    hunger: 80,
    energy: 85,
    hp: 100,
    stamina: 100,
    bleeding: 0,
    dirt: 10,
    drunk: 0,
    buffs: [],
    rep: { hollowbrook: 60, linden: 25, priory: 30, silverdale: 20, harrow: -20, refugees: 40 },
    rel: {},
    containers: {},
    picked: {},
    looted: {},
    deadNpcs: {},
    npcState: {},
    mapId: 'overworld',
    px: 0,
    py: 0,
    pdir: 0,
    discovered: [],
    codex: [],
    bounty: {},
    booksRead: [],
    recipes: [],
    stats: {},
    dog: { owned: false, name: 'Crumb', affection: 60, hp: 60, mode: 'follow' },
    merchants: {},
    lastSave: 0,
    playSeconds: 0,
    difficulty: 'normal',
    journal: [],
  };
}

export let S: GameState = newState();
export function setState(s: GameState) { S = s; }

// ---------- flags ----------
export const flag = (k: string): any => S.flags[k];
export const setFlag = (k: string, v: any = true) => { S.flags[k] = v; };
export const incFlag = (k: string, n = 1) => { S.flags[k] = (S.flags[k] || 0) + n; return S.flags[k]; };
export const stat = (k: string) => S.stats[k] || 0;
export const addStat = (k: string, n = 1) => { S.stats[k] = (S.stats[k] || 0) + n; };

// ---------- calendar ----------
// Day 0 is the eve of St. John's Day (23 June 1409), a Sunday.
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const dayIndex = () => Math.floor(S.minutes / 1440);
export const hourF = () => (S.minutes % 1440) / 60;
export const weekday = () => WEEKDAYS[dayIndex() % 7];
export const isSunday = () => dayIndex() % 7 === 0;
export const isNight = () => { const h = hourF(); return h < 5.2 || h >= 21; };

export function dateString(): string {
  const d = dayIndex();
  const start = 23; // June 23
  let day = start + d;
  let month = 'June';
  if (day > 30) { day -= 30; month = 'July'; }
  if (month === 'July' && day > 31) { day -= 31; month = 'August'; }
  if (month === 'August' && day > 31) { day -= 31; month = 'September'; }
  const suf = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `${weekday()}, ${day}${suf} of ${month}`;
}

export function clockString(): string {
  const h = Math.floor(hourF());
  const m = Math.floor(S.minutes % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

/** Canonical hours, as a medieval person would name the time. */
export function hourName(): string {
  const h = hourF();
  if (h < 3) return 'Matins';
  if (h < 5) return 'Lauds';
  if (h < 7) return 'Prime';
  if (h < 10) return 'Terce';
  if (h < 13) return 'Sext';
  if (h < 16) return 'None';
  if (h < 19) return 'Vespers';
  if (h < 21) return 'Compline';
  return 'Night';
}

/** 0 = full daylight, 1 = deepest night. */
export function darkness(): number {
  const h = hourF();
  if (h >= 7 && h < 19) return 0;
  if (h >= 5 && h < 7) return 1 - (h - 5) / 2;
  if (h >= 19 && h < 21.5) return (h - 19) / 2.5;
  return 1;
}
