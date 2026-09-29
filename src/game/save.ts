// Saving and loading to browser storage.

import { G, player, type SaveState } from './G';
import { stripRuntime } from './map';
import { msg } from './log';
import { closeAllModals, toast } from '../ui/common';
import { fxState } from '../render/fx';

const PREFIX = 'dustfall.save.';
export const SLOTS = ['quick', '1', '2', '3', '4', '5', '6'];

export interface SlotInfo {
  slot: string;
  name: string;
  level: number;
  where: string;
  time: number;
  saved: number;
}

function snapshot(): SaveState {
  const s = G.state;
  if (G.map) {
    G.map.save();
    // Keep party members in the save, placed on the map when loaded.
  }
  const party = G.map ? G.map.actors.filter((a) => a.companion && !a.dead) : s.party;
  const copy: SaveState = JSON.parse(JSON.stringify({ ...s, party }, (k, v) => (k.startsWith('_') && k !== '_wore' ? undefined : v)));
  copy.flags = { ...s.flags }; // flags keep their leading-underscore keys
  copy.party.forEach(stripRuntime);
  stripRuntime(copy.player);
  (copy as any).splats = fxState.splats.slice(-120);
  return copy;
}

export function saveGame(slot: string): boolean {
  if (G.combat) {
    toast('You cannot save during combat.');
    return false;
  }
  try {
    const data = snapshot();
    const info: SlotInfo = {
      slot,
      name: data.player.name,
      level: data.player.level,
      where: G.map?.def.name ?? 'World map',
      time: data.time,
      saved: Date.now(),
    };
    localStorage.setItem(PREFIX + slot, JSON.stringify({ info, data }));
    toast('Game saved.');
    return true;
  } catch (e) {
    console.error(e);
    toast('Could not save (storage unavailable).');
    return false;
  }
}

export function listSaves(): (SlotInfo | null)[] {
  return SLOTS.map((s) => {
    try {
      const raw = localStorage.getItem(PREFIX + s);
      if (!raw) return null;
      return JSON.parse(raw).info as SlotInfo;
    } catch {
      return null;
    }
  });
}

export function hasAnySave(): boolean {
  return listSaves().some(Boolean);
}

export async function loadGame(slot: string): Promise<boolean> {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(PREFIX + slot);
  } catch {
    raw = null;
  }
  if (!raw) {
    toast('No saved game there.');
    return false;
  }
  const { data } = JSON.parse(raw) as { data: SaveState };
  closeAllModals();
  const { endCombat } = await import('./combat');
  if (G.combat) endCombat();
  G.map = null;
  G.state = data;
  G.state.flags ??= {};
  fxState.splats = (data as any).splats ?? [];
  const { clearLog } = await import('./log');
  clearLog();
  const { closeWorldMap, openWorldMap } = await import('../ui/worldmap');
  closeWorldMap();
  const { startPlaying } = await import('../main');
  startPlaying();
  if (data.mapId) {
    const { enterMap } = await import('./travel');
    enterMap(data.mapId, 'default', { restore: true });
  } else {
    G.screen = 'world';
    openWorldMap();
  }
  msg('Game loaded.');
  player();
  return true;
}

export function quickSave() {
  saveGame('quick');
}

export function quickLoad() {
  loadGame('quick');
}
