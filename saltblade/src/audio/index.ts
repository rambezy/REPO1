// The audio system's public face: a lazy start on the first user gesture, the listener,
// ambience, music mood, volumes, UI sounds, and the sim's 'sound' events.
import { on } from '../core/events';
import { mix, createMix, loadVols, setVols, vols } from './core';
import { L, playWorld, playUi } from './sfx';
import { setAmb, tickAmb } from './ambience';
import { setMood, tickMusic } from './music';

export type MusicMood = 'explore' | 'combat' | 'town' | 'night' | 'danger' | 'silence';
export type UiSound = 'click' | 'open' | 'close' | 'coin' | 'error' | 'levelup' | 'build' | 'notify' | 'pause';

let inited = false, gestured = false, loaded = false;
const load = () => { if (!loaded) { loaded = true; loadVols(); } };

/** Installs the listeners; the AudioContext itself is made on the first pointer or key press. */
export function initAudio(): void {
  if (inited || typeof window === 'undefined') return;
  inited = true;
  try {
    load();
    for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => {
      const m = mix;
      if (!m) return;
      if (document.hidden) m.ctx.suspend().catch(() => {});
      else if (gestured) m.ctx.resume().catch(() => {});
    });
    on('sound', (name: unknown, x: unknown, z: unknown, vol: unknown) => {
      try { playWorld(String(name), Number(x), Number(z), vol === undefined ? 1 : Number(vol)); } catch { /* never break the sim */ }
    });
  } catch { /* no audio in this environment */ }
}

function unlock() {
  try {
    gestured = true;
    if (!mix) {
      if (!createMix()) return;
      setInterval(tick, 50);
    }
    if (mix!.ctx.state !== 'running' && !document.hidden) mix!.ctx.resume().catch(() => {});
  } catch { /* Web Audio unavailable or refused */ }
}

function tick() {
  const m = mix;
  if (!m || m.ctx.state !== 'running') return;
  try {
    const now = m.ctx.currentTime;
    tickMusic(now);
    tickAmb(now);
  } catch { /* keep ticking */ }
}

/** Camera target (world metres), zoom distance and yaw; call every frame. */
export function setListener(x: number, z: number, camDist: number, yaw: number): void {
  if (isFinite(x)) L.x = x;
  if (isFinite(z)) L.z = z;
  if (isFinite(camDist)) L.dist = Math.max(0, camDist);
  if (isFinite(yaw)) L.yaw = yaw;
}

export function setAmbience(a: { region: string; hour: number; weather: string; intensity: number; inTown: boolean; underwater?: boolean }): void {
  try { setAmb(a); } catch { /* ignore */ }
}

export function setMusicMood(mood: MusicMood): void {
  try { setMood(mood); } catch { /* ignore */ }
}

export function setVolumes(v: { master?: number; sfx?: number; music?: number; ambience?: number }): void {
  try { load(); setVols(v || {}); } catch { /* ignore */ }
}

export function getVolumes(): { master: number; sfx: number; music: number; ambience: number } {
  load();
  return { ...vols };
}

export function uiSound(name: UiSound): void {
  try { playUi(name); } catch { /* ignore */ }
}
