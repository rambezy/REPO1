// Quests: stages with objectives, map markers and first-person journal entries.

import { S, dayIndex } from '../state';
import { notify, banner } from '../ui/notify';
import { emit } from '../engine/events';
import { sfx } from '../audio/sfx';
import { fillText } from './script';
import { G } from '../G';
import { findActor, getMap, hasMap } from '../world/world';
import { TILE } from '../engine/util';

export type Marker =
  | { map: string; x: number; y: number } // tile coords
  | { actor: string }
  | { key: string; map: string }; // map object by key

export interface StageDef {
  obj?: string; // objective text (HUD)
  entry?: string; // journal paragraph added when the stage begins
  marker?: Marker | Marker[] | (() => Marker | Marker[] | null);
  optional?: string[]; // extra objectives shown under the main one
}

export interface QuestDef {
  id: string;
  title: string;
  kind: 'main' | 'side';
  act?: string;
  summary: string;
  stages: Record<string, StageDef>;
  onStage?: (stage: string) => void;
}

export const QUESTS: Record<string, QuestDef> = {};
export function defineQuest(q: QuestDef) { QUESTS[q.id] = q; return q; }

export const qStage = (id: string): string | null => S.quests[id]?.stage ?? null;
export const qActive = (id: string) => S.quests[id]?.status === 'active';
export const qDone = (id: string) => S.quests[id]?.status === 'done';
export const qFailed = (id: string) => S.quests[id]?.status === 'failed';
export const qAt = (id: string, ...stages: string[]) => qActive(id) && stages.includes(S.quests[id].stage);
export const qVar = (id: string, k: string, v?: any) => {
  const q = S.quests[id];
  if (!q) return undefined;
  if (v !== undefined) q.vars[k] = v;
  return q.vars[k];
};

export function startQuest(id: string, stage = 'start', quiet = false) {
  const def = QUESTS[id];
  if (!def) { console.warn('unknown quest', id); return; }
  if (S.quests[id]) return;
  S.quests[id] = { stage, status: 'active', entries: [], started: S.minutes, vars: {} };
  if (!S.trackedQuest || def.kind === 'main' || !qActive(S.trackedQuest)) S.trackedQuest = id;
  addEntry(id, stage);
  if (!quiet) {
    banner(def.title, def.kind === 'main' ? 'A new chapter' : 'New quest', 3000);
    sfx('quest');
  }
  def.onStage?.(stage);
  emit('quest', id, stage);
}

function addEntry(id: string, stage: string) {
  const st = QUESTS[id]?.stages[stage];
  if (st?.entry) {
    S.quests[id].entries.push(fillText(st.entry));
    S.journal.push({ day: dayIndex(), text: fillText(st.entry) });
  }
}

export function setStage(id: string, stage: string, quiet = false) {
  const def = QUESTS[id];
  if (!def) return;
  if (!S.quests[id]) { startQuest(id, stage, quiet); return; }
  const q = S.quests[id];
  if (q.stage === stage) return;
  q.stage = stage;
  addEntry(id, stage);
  const st = def.stages[stage];
  if (!quiet && st?.obj) notify(`<b>${def.title}</b>: ${fillText(st.obj)}`, 'quest', 5000);
  if (q.status === 'active' && !quiet) sfx('page');
  def.onStage?.(stage);
  emit('quest', id, stage);
  emit(`quest:${id}:${stage}`);
}

export function completeQuest(id: string, stage = 'done') {
  const def = QUESTS[id];
  if (!def) return;
  if (!S.quests[id]) startQuest(id, stage, true);
  const q = S.quests[id];
  q.stage = stage;
  addEntry(id, stage);
  q.status = 'done';
  banner(def.title, 'Completed', 2800);
  sfx('quest_done');
  if (S.trackedQuest === id) S.trackedQuest = pickNextTracked();
  def.onStage?.(stage);
  emit('quest', id, stage);
  emit('quest:done', id);
  emit(`quest:${id}:${stage}`);
}

export function failQuest(id: string, stage = 'failed') {
  const def = QUESTS[id];
  if (!def || !S.quests[id]) return;
  const q = S.quests[id];
  q.stage = stage;
  addEntry(id, stage);
  q.status = 'failed';
  banner(def.title, 'Failed', 2800);
  sfx('fail');
  if (S.trackedQuest === id) S.trackedQuest = pickNextTracked();
  emit('quest', id, stage);
}

function pickNextTracked(): string | null {
  const act = Object.keys(S.quests).filter((k) => S.quests[k].status === 'active');
  return act.find((k) => QUESTS[k]?.kind === 'main') || act[0] || null;
}

export function objectiveFor(id: string): { title: string; obj: string; extra: string[] } | null {
  const q = S.quests[id];
  const def = QUESTS[id];
  if (!q || !def || q.status !== 'active') return null;
  const st = def.stages[q.stage];
  return { title: def.title, obj: st?.obj ? fillText(st.obj) : '', extra: (st?.optional || []).map(fillText) };
}

/** Resolves the tracked quest's marker(s) to world positions on the current map. */
export function markerPositions(id: string | null = S.trackedQuest): { x: number; y: number; far: boolean }[] {
  if (!id) return [];
  const q = S.quests[id];
  const def = QUESTS[id];
  if (!q || !def || q.status !== 'active') return [];
  let m = def.stages[q.stage]?.marker;
  if (typeof m === 'function') m = m() || undefined;
  if (!m) return [];
  const list = Array.isArray(m) ? m : [m];
  const out: { x: number; y: number; far: boolean }[] = [];
  for (const mk of list) {
    const p = resolveMarker(mk);
    if (p) out.push(p);
  }
  return out;
}

export function resolveMarker(mk: Marker): { x: number; y: number; far: boolean; map?: string } | null {
  let map: string, x: number, y: number;
  if ('actor' in mk) {
    const a = findActor(mk.actor) || (G.map ? undefined : undefined);
    const act = a || findActorByChar(mk.actor);
    if (!act || act.dead) return null;
    map = act.mapId; x = act.x; y = act.y;
  } else if ('key' in mk) {
    if (!hasMap(mk.map)) return null;
    const o = getMap(mk.map).byKey(mk.key);
    if (!o) return null;
    map = mk.map; x = o.x; y = o.y;
  } else {
    map = mk.map; x = mk.x * TILE + 8; y = mk.y * TILE + 8;
  }
  if (!G.map) return null;
  if (map === G.map.id) return { x, y, far: false, map };
  // different map: point at a door that leads toward it
  const door = doorToward(G.map.id, map);
  if (door) return { x: door.x, y: door.y, far: true, map };
  return null;
}

function findActorByChar(charId: string) {
  return (findActor(charId));
}

/** Finds a door on `from` that leads to `to`, or out of an interior, or into the building containing `to`. */
export function doorToward(from: string, to: string): { x: number; y: number } | null {
  const fm = getMap(from);
  for (const o of fm.objects) if (o.interact?.type === 'door' && o.interact.to === to) return { x: o.x, y: o.y };
  // target is an interior of some building on this map? (interiors name their parent)
  if (hasMap(to)) {
    const tm = getMap(to);
    if (tm.parent) {
      if (tm.parent === from) {
        for (const o of fm.objects) if (o.interact?.type === 'door' && o.interact.to === to) return { x: o.x, y: o.y };
      } else if (fm.parent) {
        // leave this interior first
        for (const o of fm.objects) if (o.interact?.type === 'door') return { x: o.x, y: o.y };
      } else {
        for (const o of fm.objects) if (o.interact?.type === 'door' && o.interact.to === tm.parent) return { x: o.x, y: o.y };
      }
    }
  }
  if (fm.parent) for (const o of fm.objects) if (o.interact?.type === 'door') return { x: o.x, y: o.y };
  return null;
}
