// Shared runtime and content types.

import type { Stats, SkillKey, StatKey } from '../data/stats';
import type { AttackKind } from '../data/items';

export interface Stack {
  id: string; // item def id
  n: number;
  ammo?: number; // rounds loaded (weapons)
  ammoId?: string;
}

export type Limb = 'head' | 'eyes' | 'torso' | 'larm' | 'rarm' | 'groin' | 'lleg' | 'rleg';

export interface Effect {
  id: string; // e.g. 'bulk', 'poison', 'addict_bulk'
  until: number; // game minute when it expires
  mods?: Partial<Record<StatKey, number>>;
  ap?: number;
  dr?: number;
}

export interface Actor {
  uid: string;
  proto: string;
  name: string;
  q: number;
  r: number;
  facing: number;
  stats: Stats; // base stats
  skillPts?: Partial<Record<SkillKey, number>>; // player: points invested (after tagging multiplier)
  tags?: SkillKey[];
  traits?: string[];
  perks?: Record<string, number>;
  level: number;
  xp: number;
  hp: number;
  maxHpBonus?: number;
  inv: Stack[];
  hands: [Stack | null, Stack | null];
  active: 0 | 1;
  mode: [number, number]; // chosen attack mode index per hand
  armor: Stack | null;
  team: string;
  hostile: boolean; // hostile to the player
  dead: boolean;
  knockedOut?: number; // turns remaining
  crippled: Partial<Record<Limb, boolean>>;
  rads: number;
  poison: number;
  effects: Effect[];
  npc?: string; // NPC definition id (for dialogue & scripts)
  dialog?: string;
  home?: { q: number; r: number };
  wander?: number;
  companion?: boolean;
  barter?: boolean;
  essential?: boolean;
  // runtime-only fields (not persisted)
  _ap?: number;
  _path?: { q: number; r: number }[];
  _move?: { fq: number; fr: number; t: number; dur: number };
  _anim?: { kind: string; t: number; dur: number; data?: any };
  _bark?: { text: string; until: number; color?: string };
  _next?: number; // next wander time
  _seen?: boolean;
  _acBonus?: number;
  _flash?: number;
}

export interface MapObject {
  id: string;
  kind: string; // prop painter id (door, crate, locker, terminal, ...)
  q: number;
  r: number;
  name?: string;
  desc?: string;
  blocks?: boolean;
  // doors
  open?: boolean;
  locked?: number; // lock difficulty modifier (0 = unlocked). Key id in `key`.
  key?: string;
  vertical?: boolean; // door orientation hint
  // containers
  inv?: Stack[];
  container?: boolean;
  // generic
  used?: boolean;
  hidden?: boolean;
  trap?: number; // trap difficulty; 0 or undefined = none
  onUse?: string; // script id
  tint?: string;
  facing?: number;
  light?: number;
  label?: string; // text painted on hatches
}

export interface GroundItem {
  q: number;
  r: number;
  stack: Stack;
}

// ---------------------------------------------------------------- content

export type TileKind = 'void' | 'floor' | 'wall' | 'water' | 'exit';

export interface LegendEntry {
  wall?: string; // wall material
  floor?: string; // floor material
  water?: boolean;
  exit?: string; // exit id
  decor?: string; // walkable floor decoration (painted)
  block?: string; // blocking scenery prop kind drawn on floor cell
  marker?: string; // placeholder: position of a named marker (floor underneath is map default)
  door?: { locked?: number; key?: string };
}

export interface ExitDef {
  to: 'world' | string; // 'world' or map id
  entrance?: string; // entrance name on the target map
  label?: string;
}

export interface NpcSpawn {
  proto: string;
  at: string | [number, number]; // marker char or coordinates
  id?: string; // unique id for scripts (npc id)
  name?: string;
  dialog?: string;
  team?: string;
  hostile?: boolean;
  wander?: number;
  barter?: boolean;
  inv?: { id: string; n?: number }[];
  equip?: string[];
  facing?: number;
  if?: (c: Ctx) => boolean; // spawn only if true (checked on first visit and on each entry for flagged spawns)
  essential?: boolean;
  look?: Partial<import('../data/protos').Look>;
  hp?: number;
  count?: number; // spawn several around the marker
}

export interface ObjSpawn {
  kind: string;
  at: string | [number, number];
  id?: string;
  name?: string;
  desc?: string;
  inv?: { id: string; n?: number }[];
  locked?: number;
  key?: string;
  trap?: number;
  onUse?: string;
  blocks?: boolean;
  tint?: string;
  facing?: number;
  label?: string;
  if?: (c: Ctx) => boolean;
}

export interface MapDef {
  id: string;
  name: string;
  area: string; // world location id this map belongs to
  outdoor?: boolean;
  dark?: number; // 0..1 extra darkness (caves, basements)
  floor: string; // default floor material for '.'
  floor2?: string; // for ','
  wall: string; // default wall material for '#'
  wall2?: string; // for '%'
  legend?: Record<string, LegendEntry>;
  rows: string[];
  entrances: Record<string, string | [number, number]>; // name -> marker or coords; 'default' required
  exits?: Record<string, ExitDef>; // exit id -> destination; referenced by legend `exit`
  npcs?: NpcSpawn[];
  objects?: ObjSpawn[];
  items?: { id: string; n?: number; at: string | [number, number] }[];
  music?: string;
  onEnter?: (c: Ctx, first: boolean) => void;
  onTick?: (c: Ctx) => void; // called every game minute while on the map
  rads?: { at: string | [number, number]; radius: number; perMin: number }[];
}

export interface DialogueOption {
  text: string | ((c: Ctx) => string);
  if?: (c: Ctx) => boolean;
  lowInt?: boolean; // only shown when INT <= 3
  any?: boolean; // shown regardless of INT
  normalInt?: boolean; // hidden when INT <= 3 (default true for plain options: see dialogue.ts)
  skill?: { key: SkillKey; diff: number }; // skill check: success chance = skill - diff
  stat?: { key: StatKey; min: number }; // shown only if stat >= min
  to?: string; // next node on success / default
  fail?: string; // node on failed skill check
  do?: (c: Ctx) => void; // side effect on selection
  end?: boolean; // closes dialogue
  barter?: boolean; // opens barter
  combat?: boolean; // closes dialogue and starts combat
}

export interface DialogueNode {
  text: string | ((c: Ctx) => string);
  options: DialogueOption[];
  onEnter?: (c: Ctx) => void;
}

export interface DialogueDef {
  id: string;
  name?: string; // overrides actor name shown in header
  portrait?: Partial<import('../data/protos').Look> & { bg?: string };
  start: string | ((c: Ctx) => string);
  nodes: Record<string, DialogueNode>;
}

export interface QuestDef {
  id: string;
  title: string;
  area: string; // location id
  desc: string;
  xp?: number;
}

export interface LocationDef {
  id: string;
  name: string;
  x: number; // world map tile coords
  y: number;
  map: string; // entry map id
  entrance?: string;
  size?: number; // circle radius on world map (1..3)
  known?: boolean; // discovered at start
  desc?: string;
}

/** Scripting context handed to dialogue and map callbacks. */
export interface Ctx {
  flag(name: string): any;
  set(name: string, v?: any): void;
  inc(name: string, by?: number): number;
  stat(k: StatKey): number;
  skill(k: SkillKey): number;
  roll(k: SkillKey, diff?: number): boolean;
  has(item: string, n?: number): boolean;
  count(item: string): number;
  give(item: string, n?: number): void;
  take(item: string, n?: number): boolean;
  scrip(): number;
  pay(n: number): boolean; // take scrip; false if not enough
  xp(n: number): void;
  karma(n: number): void;
  rep(area: string, n: number): void;
  quest(id: string, note?: string): void; // start or add a note
  questDone(id: string, note?: string): void;
  questFail(id: string, note?: string): void;
  questState(id: string): 'none' | 'active' | 'done' | 'failed';
  msg(text: string): void;
  bark(npcId: string, text: string): void;
  npc(id: string): Actor | undefined;
  speaker(): Actor | undefined;
  hostile(npcIdOrTeam: string): void; // turn an NPC (or whole team on this map) hostile and start combat
  remove(npcId: string): void; // remove NPC from the map (leaves, not dies)
  kill(npcId: string): void;
  recruit(npcId: string): void;
  dismiss(npcId: string): void;
  heal(n: number): void;
  hurt(n: number): void;
  rads(n: number): void;
  time(): number; // minutes since start
  day(): number;
  advance(minutes: number): void;
  waterDays(): number;
  addWaterDays(days: number): void;
  goto(map: string, entrance?: string): void;
  reveal(locationId: string): void;
  endGame(kind: string): void;
  playerName(): string;
  female(): boolean;
  level(): number;
  karmaValue(): number;
  obj(id: string): MapObject | undefined;
  mapId(): string;
  openBarter(npcId?: string): void;
  startDialog(dialogId: string, npcId?: string): void;
  spawn(proto: string, q: number, r: number, opts?: Partial<NpcSpawn>): Actor;
  random(n: number): number; // 0..n-1
  fade(text?: string): void;
  sound(id: string): void;
  partyHas(npcId: string): boolean;
}
