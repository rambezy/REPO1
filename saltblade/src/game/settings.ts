// Player preferences, kept in the browser between sessions.
import { G } from '../state';
import { setVolumes, getVolumes } from '../audio';
import { chatter } from '../sim/chatter';

export interface Settings {
  quality: 'auto' | 'low' | 'medium' | 'high'; // auto: picked from measured frame times
  shadows: boolean;
  viewDist: number; // multiplier on vegetation and character draw ranges
  autosave: number; // minutes, 0 = off
  edgeScroll: boolean;
  uiScale: number;
  names: 'always' | 'hover';
  pauseOnKO: boolean; // auto-pause: one of yours is knocked out
  pauseOnAttacked: boolean; // auto-pause: one of yours is hit while not fighting
  pauseOnLimbLost: boolean; // auto-pause: one of yours loses a limb
  reducedMotion: boolean; // no impact hold, camera kick or pulsing
  hints: boolean;
  chatter: boolean;
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  rev: number; // of the settings format: 1 since Auto quality replaced High as the default
}

export const DEFAULTS: Settings = {
  quality: 'auto', shadows: true, viewDist: 1, autosave: 8, edgeScroll: false, uiScale: 1, names: 'hover', pauseOnKO: true, pauseOnAttacked: false, pauseOnLimbLost: false, reducedMotion: false, hints: true, chatter: true,
  master: 0.8, music: 0.5, sfx: 0.8, ambience: 0.6, rev: 1,
};
const QUALITIES = ['auto', 'low', 'medium', 'high'];

export function loadSettings(): Settings {
  let s: Partial<Settings> = {};
  try { s = JSON.parse(localStorage.getItem('sb-settings') ?? '{}'); } catch { s = {}; }
  if (!s || typeof s !== 'object') s = {}; // 'null', or a number: a store that was cleared or written by hand
  // settings saved before Auto existed hold the old default, High, without anyone having chosen it: once
  if (!s.rev && s.quality === 'high') s.quality = 'auto';
  if (s.quality !== undefined && !QUALITIES.includes(s.quality)) delete s.quality;
  const v = getVolumes();
  G.settings = { ...DEFAULTS, master: v.master, music: v.music, sfx: v.sfx, ambience: v.ambience, ...s, rev: DEFAULTS.rev };
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
  chatter.on = s.chatter;
  document.documentElement.style.setProperty('--ui-scale', String(s.uiScale));
  setVolumes({ master: s.master, music: s.music, sfx: s.sfx, ambience: s.ambience });
}
