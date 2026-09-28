// Player preferences, kept in the browser between sessions.
import { G } from '../state';
import { setVolumes, getVolumes } from '../audio';

export interface Settings {
  quality: 'low' | 'medium' | 'high';
  shadows: boolean;
  viewDist: number; // multiplier on vegetation and character draw ranges
  autosave: number; // minutes, 0 = off
  edgeScroll: boolean;
  uiScale: number;
  names: 'always' | 'hover';
  pauseOnKO: boolean;
  hints: boolean;
  master: number;
  music: number;
  sfx: number;
  ambience: number;
}

export const DEFAULTS: Settings = {
  quality: 'high', shadows: true, viewDist: 1, autosave: 8, edgeScroll: false, uiScale: 1, names: 'hover', pauseOnKO: true, hints: true,
  master: 0.8, music: 0.5, sfx: 0.8, ambience: 0.6,
};

export function loadSettings(): Settings {
  let s: Partial<Settings> = {};
  try { s = JSON.parse(localStorage.getItem('sb-settings') ?? '{}'); } catch { s = {}; }
  const v = getVolumes();
  G.settings = { ...DEFAULTS, master: v.master, music: v.music, sfx: v.sfx, ambience: v.ambience, ...s };
  return G.settings;
}

export function saveSettings() {
  try { localStorage.setItem('sb-settings', JSON.stringify(G.settings)); } catch { /* private mode */ }
}

export function applySettings() {
  const s: Settings = G.settings;
  if (G.R) {
    if (G.R.quality !== s.quality) G.R.setQuality(s.quality);
    G.R.gl.shadowMap.enabled = s.shadows;
  }
  if (G.cam) G.cam.edgeScroll = s.edgeScroll;
  if (G.charViews) G.charViews.range = 420 * s.viewDist;
  if (G.props) G.props.distMul = s.viewDist;
  if (G.overlay) G.overlay.showAllNames = s.names === 'always';
  document.documentElement.style.setProperty('--ui-scale', String(s.uiScale));
  setVolumes({ master: s.master, music: s.music, sfx: s.sfx, ambience: s.ambience });
}
