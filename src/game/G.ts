// Global game singleton. Systems read and mutate this directly.

import type { Actor, GroundItem, MapObject } from './types';
import type { MapRuntime } from './map';

export interface QuestState {
  state: 'active' | 'done' | 'failed';
  notes: string[];
  t: number;
}

export interface MapSave {
  actors: Actor[];
  objects: MapObject[];
  ground: GroundItem[];
  visited: number; // time of last visit
  seen?: string; // explored cells bitmap (run-length string)
}

export interface SaveState {
  version: number;
  player: Actor;
  party: Actor[]; // companions travelling with the player (when on world map)
  time: number; // minutes since start
  waterDeadline: number; // minute at which water runs out
  armyDeadline: number; // minute at which the Grafted find the shelter (0 = not set)
  flags: Record<string, any>;
  quests: Record<string, QuestState>;
  karma: number;
  rep: Record<string, number>;
  mapId: string | null; // null while on the world map
  world: { x: number; y: number };
  discovered: string[]; // location ids known on the world map
  visitedLoc: string[];
  explored: string; // world map fog (tile bitmap as string of 0/1)
  maps: Record<string, MapSave>;
  kills: Record<string, number>;
  notes: string[]; // archive entries in the wrist computer
  uidSeq: number;
  lastHeal: number;
  firstAidUses: { t: number; n: number };
  doctorUses: { t: number; n: number };
  ended?: string;
}

export interface CombatState {
  order: Actor[];
  turn: number; // index into order
  round: number;
  busy: boolean; // animations running
  playerTurn: boolean;
}

export const G = {
  state: null as unknown as SaveState,
  map: null as MapRuntime | null,
  combat: null as CombatState | null,
  screen: 'menu' as 'menu' | 'play' | 'world' | 'end',
  modal: null as string | null, // name of open modal UI, blocks world input
  paused: false,
  now: 0, // real ms timestamp of current frame
  settings: { combatSpeed: 1, sound: true, music: true, textSpeed: 1, difficulty: 'normal' as 'easy' | 'normal' | 'hard' },
};

export function player(): Actor {
  return G.state.player;
}

export function nextUid(prefix = 'a'): string {
  G.state.uidSeq = (G.state.uidSeq ?? 0) + 1;
  return prefix + G.state.uidSeq;
}
