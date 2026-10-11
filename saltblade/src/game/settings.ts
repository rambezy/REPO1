// Player preferences, kept in the browser between sessions.
import { G } from '../state';
import { setVolumes, getVolumes } from '../audio';
import { chatter } from '../sim/chatter';
import { emit } from '../core/events';
import { keymap, loadLayout, sanitizeBindings, ActionId } from '../core/keys';
import { applyPalette, Vision, VISIONS } from '../ui/palette';
import { setUiScale, zoomSupported, refitWindows } from '../ui/dom';
import { reducedMotion } from '../render/impact';

export interface Settings {
  quality: 'auto' | 'low' | 'medium' | 'high'; // auto: picked from measured frame times
  shadows: boolean;
  viewDist: number; // multiplier on vegetation and character draw ranges
  autosave: number; // minutes, 0 = off
  edgeScroll: boolean;
  uiScale: number; // the whole interface, 0.8 to 1.5
  names: 'always' | 'hover';
  pauseOnKO: boolean; // auto-pause: one of yours is knocked out
  pauseOnAttacked: boolean; // auto-pause: one of yours is hit while not fighting
  pauseOnLimbLost: boolean; // auto-pause: one of yours loses a limb
  hints: boolean;
  chatter: boolean;
  reducedMotion: boolean; // no impact hold, camera kick, flashing or pulsing (lightning, the drug haze); the browser's own preference counts too
  colorblind: Vision;
  keys: Partial<Record<ActionId, string[]>>; // bindings that differ from the defaults
  flashWarned: boolean; // the notice about flashing effects has been shown
  master: number;
  music: number;
  sfx: number;
  ambience: number;
  rev: number; // of the settings format: 1 since Auto quality replaced High as the default
}

export const DEFAULTS: Settings = {
  quality: 'auto', shadows: true, viewDist: 1, autosave: 8, edgeScroll: false, uiScale: 1, names: 'hover', pauseOnKO: true, pauseOnAttacked: false, pauseOnLimbLost: false, hints: true, chatter: true,
  reducedMotion: false, colorblind: 'none', keys: {}, flashWarned: false,
  master: 0.8, music: 0.5, sfx: 0.8, ambience: 0.6, rev: 1,
};

export const UI_SCALE: [number, number] = [0.8, 1.5];
const QUALITIES: Settings['quality'][] = ['auto', 'low', 'medium', 'high'];
const AUTOSAVES = [0, 4, 8, 15];

/**
 * A settings blob from the browser (an old version's, or one edited by hand)
 * made whole: unknown keys dropped, bad values replaced by the defaults,
 * numbers kept in range and key bindings checked.
 */
export function migrateSettings(raw: unknown, defaults: Settings = DEFAULTS): Settings {
  const s: Settings = { ...defaults, keys: {} };
  if (!raw || typeof raw !== 'object') return s;
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(defaults) as (keyof Settings)[]) {
    const v = r[k];
    if (v !== undefined && typeof v === typeof defaults[k]) (s as unknown as Record<string, unknown>)[k] = v;
  }
  const num = (k: 'viewDist' | 'uiScale' | 'master' | 'music' | 'sfx' | 'ambience', lo: number, hi: number) => {
    s[k] = Number.isFinite(s[k]) ? Math.min(hi, Math.max(lo, s[k])) : defaults[k];
  };
  // settings saved before Auto existed (rev 0) hold the old default, High, without anyone having chosen it: once
  if (!r.rev && s.quality === 'high') s.quality = 'auto';
  s.rev = defaults.rev;
  num('viewDist', 0.6, 1.5); num('uiScale', UI_SCALE[0], UI_SCALE[1]);
  num('master', 0, 1); num('music', 0, 1); num('sfx', 0, 1); num('ambience', 0, 1);
  if (!QUALITIES.includes(s.quality)) s.quality = defaults.quality;
  if (!AUTOSAVES.includes(s.autosave)) s.autosave = defaults.autosave;
  if (s.names !== 'always' && s.names !== 'hover') s.names = defaults.names;
  if (!VISIONS.some(([v]) => v === s.colorblind)) s.colorblind = defaults.colorblind;
  s.keys = sanitizeBindings(r.keys);
  return s;
}

export function loadSettings(): Settings {
  let raw: unknown = {};
  try { raw = JSON.parse(localStorage.getItem('sb-settings') ?? '{}'); } catch { raw = {}; }
  const v = getVolumes();
  G.settings = migrateSettings(raw, { ...DEFAULTS, master: v.master, music: v.music, sfx: v.sfx, ambience: v.ambience });
  // what the physical keys print on this keyboard, for the labels, when the browser will say
  void loadLayout().then(() => emit('keys'));
  return G.settings;
}

export function saveSettings() {
  try { localStorage.setItem('sb-settings', JSON.stringify(G.settings)); } catch { /* private mode */ }
}

// the browser's own preference can change while the game runs
const motionQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
motionQuery?.addEventListener?.('change', () => applyMotion());
export { reducedMotion };

function applyMotion() {
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = reducedMotion() ? 'reduced' : 'full';
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
  if (G.overlay) { G.overlay.showAllNames = s.names === 'always'; G.overlay.scale = zoomSupported ? s.uiScale : 1; }
  chatter.on = s.chatter;
  const scale = zoomSupported ? s.uiScale : 1;
  document.documentElement.style.setProperty('--ui-scale', String(scale));
  setUiScale(scale);
  refitWindows();
  applyMotion();
  applyPalette(s.colorblind);
  keymap.load(s.keys);
  emit('keys');
  setVolumes({ master: s.master, music: s.music, sfx: s.sfx, ambience: s.ambience });
}

// ---------------------------------------------------------------- fullscreen
export const fullscreenOn = () => typeof document !== 'undefined' && !!document.fullscreenElement;

/** In and out of fullscreen; the browser only allows it from a click or a key press. */
export function toggleFullscreen() {
  try {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => { /* not allowed here */ });
  } catch { /* not supported */ }
}
