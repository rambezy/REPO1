// Fades and map travel.

import { G } from '../G';
import { enterMap } from '../world/world';
import { snapCamera } from '../engine/renderer';
import { chunks } from '../world/chunks';
import { sfx } from '../audio/sfx';
import { hideDialogue, dialogueBusy } from '../ui/dialogue';

interface Fade { from: number; to: number; t: number; dur: number; resolve: () => void }
let fade: Fade | null = null;

export function fadeTo(to: number, dur = 0.35, color = '#000'): Promise<void> {
  G.fadeColor = color;
  // a line of dialogue should not linger over a fade to black
  if (to >= 1 && !dialogueBusy()) hideDialogue();
  return new Promise((resolve) => {
    if (fade) fade.resolve();
    fade = { from: G.fade, to, t: 0, dur: Math.max(0.01, dur), resolve };
  });
}

export function updateFade(dt: number) {
  if (!fade) return;
  fade.t += dt;
  const k = Math.min(1, fade.t / fade.dur);
  G.fade = fade.from + (fade.to - fade.from) * k;
  if (k >= 1) { const r = fade.resolve; fade = null; r(); }
}

let traveling = false;
export const isTraveling = () => traveling;

/** Fade out, move the player to another map/spawn, wait for terrain, fade in. */
export async function travel(mapId: string, spawn: string | { x: number; y: number }, dir?: number, opts: { sound?: string; fade?: number; hold?: number } = {}) {
  if (traveling) return;
  traveling = true;
  const wasLocked = G.controlLocked;
  G.controlLocked = true;
  if (opts.sound) sfx(opts.sound);
  await fadeTo(1, opts.fade ?? 0.28);
  try {
    enterMap(mapId, spawn, dir);
    snapCamera();
    // stay dark until the ground under the view is painted (slow machines
    // can take a couple of seconds on a first visit)
    const t0 = performance.now();
    while (!chunks.ready(G.map, G.cam.x, G.cam.y, G.cam.x + G.viewW, G.cam.y + G.viewH) && performance.now() - t0 < 2200) {
      chunks.prepare(G.map, G.cam.x, G.cam.y, G.cam.x + G.viewW, G.cam.y + G.viewH, 0);
      await new Promise((r) => setTimeout(r, 30));
    }
    if (opts.hold) await new Promise((r) => setTimeout(r, opts.hold));
  } finally {
    await fadeTo(0, opts.fade ?? 0.3);
    G.controlLocked = wasLocked;
    traveling = false;
  }
}
