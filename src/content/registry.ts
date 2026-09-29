// Registries that content modules fill in at import time.

import type { Ctx, DialogueDef, LocationDef, MapDef, QuestDef, MapObject, Actor } from '../game/types';
import type { Look } from '../data/protos';

export const MAPS: Record<string, MapDef> = {};
export const DIALOGUES: Record<string, DialogueDef> = {};
export const QUESTS: Record<string, QuestDef> = {};
export const LOCATIONS: Record<string, LocationDef> = {};

/** Scripts for object use (`onUse`), keyed by id. Return true if handled. */
export type ObjScript = (c: Ctx, o: MapObject, user: Actor, skillUsed?: string) => boolean | void;
export const OBJ_SCRIPTS: Record<string, ObjScript> = {};

/** Called when a named NPC dies (key = npc id), e.g. to fail quests. */
export const DEATH_SCRIPTS: Record<string, (c: Ctx, a: Actor) => void> = {};

/** Ending slides are assembled from these, in order of `order`. */
export interface EndingSlide {
  order: number;
  title: string;
  text: (c: Ctx) => string | null; // null = skip
  look?: Partial<Look>;
  scene?: string; // backdrop painter id
}
export const ENDINGS: EndingSlide[] = [];

export function defineMap(m: MapDef) {
  MAPS[m.id] = m;
}
export function defineDialogue(d: DialogueDef) {
  DIALOGUES[d.id] = d;
}
export function defineDialogues(list: DialogueDef[]) {
  for (const d of list) DIALOGUES[d.id] = d;
}
export function defineQuests(list: QuestDef[]) {
  for (const q of list) QUESTS[q.id] = q;
}
export function defineLocations(list: LocationDef[]) {
  for (const l of list) LOCATIONS[l.id] = l;
}
export function defineObjScripts(o: Record<string, ObjScript>) {
  Object.assign(OBJ_SCRIPTS, o);
}
export function defineDeathScripts(o: Record<string, (c: Ctx, a: Actor) => void>) {
  Object.assign(DEATH_SCRIPTS, o);
}
export function defineEndings(list: EndingSlide[]) {
  ENDINGS.push(...list);
}
