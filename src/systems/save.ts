// Saving and loading: game state in localStorage, with safe fallbacks when
// storage is unavailable.

import { S, setState, GameState } from '../state';
import { G } from '../G';
import { actors } from '../world/world';
import { notify } from '../ui/notify';
import { emit } from '../engine/events';

const PREFIX = 'obi_save_';
export const SLOTS = ['auto', '1', '2', '3'];

export interface SaveMeta { slot: string; name: string; date: string; day: number; place: string; quest: string; playSeconds: number; savedAt: number }

function store(): Storage | null {
  try { const s = window.localStorage; s.setItem('__t', '1'); s.removeItem('__t'); return s; } catch { return null; }
}

/** Snapshot of NPC state that must persist (positions for followers, flags). */
function npcSnapshot() {
  const out: Record<string, Record<string, unknown>> = {};
  for (const a of actors) {
    if (!a.charId || a === G.player) continue;
    out[a.charId] = { ...(S.npcState[a.charId] || {}), map: a.mapId, x: Math.round(a.x), y: Math.round(a.y), hp: Math.round(a.hp), dead: a.dead, hidden: a.hidden };
  }
  return out;
}

export function saveGame(slot = 'auto', label?: string): boolean {
  const st = store();
  if (!st || !G.player) { notify('Saving is not available in this browser.', 'bad'); return false; }
  S.hp = G.player.hp;
  S.stamina = G.player.stamina;
  S.px = G.player.x; S.py = G.player.y; S.pdir = G.player.dir;
  S.mapId = G.map.id;
  S.npcState = { ...S.npcState, ...npcSnapshot() };
  S.lastSave = Date.now();
  if (G.player.combat.bleeding) S.bleeding = G.player.combat.bleeding;
  const meta: SaveMeta = {
    slot, name: S.playerName, date: label || '', day: Math.floor(S.minutes / 1440) + 1,
    place: G.map.regionAt(G.player.x, G.player.y)?.name || G.map.name,
    quest: S.trackedQuest || '', playSeconds: Math.round(S.playSeconds), savedAt: Date.now(),
  };
  try {
    st.setItem(PREFIX + slot, JSON.stringify(S));
    st.setItem(PREFIX + slot + '_meta', JSON.stringify(meta));
    if (slot !== 'auto') notify('Game saved.', 'info', 1800);
    emit('saved', slot);
    return true;
  } catch (e) {
    notify('Could not save: storage is full or blocked.', 'bad');
    return false;
  }
}

export function listSaves(): SaveMeta[] {
  const st = store();
  if (!st) return [];
  const out: SaveMeta[] = [];
  for (const s of SLOTS) {
    try {
      const m = st.getItem(PREFIX + s + '_meta');
      if (m) out.push(JSON.parse(m));
    } catch { /* ignore corrupt */ }
  }
  return out;
}

export function hasSaves() { return listSaves().length > 0; }

export function readSave(slot: string): GameState | null {
  const st = store();
  if (!st) return null;
  try {
    const raw = st.getItem(PREFIX + slot);
    if (!raw) return null;
    return JSON.parse(raw) as GameState;
  } catch { return null; }
}

export function latestSlot(): string | null {
  const l = listSaves().sort((a, b) => b.savedAt - a.savedAt)[0];
  return l ? l.slot : null;
}

export function deleteSave(slot: string) {
  const st = store();
  if (!st) return;
  st.removeItem(PREFIX + slot);
  st.removeItem(PREFIX + slot + '_meta');
}

export { setState };
