// Day/night lighting: a darkness layer with light sources cut out of it,
// plus additive warm glow and time-of-day colour grading.

import { makeCanvas } from '../gfx/pixel';

export interface Light { x: number; y: number; r: number; color: string; intensity: number; flicker?: boolean }

let layer: HTMLCanvasElement | null = null;
let lctx: CanvasRenderingContext2D | null = null;

const gradCache = new Map<string, HTMLCanvasElement>();
/** Pre-rendered radial light sprite for a colour, 128px wide. */
function lightSprite(color: string, soft: boolean): HTMLCanvasElement {
  const key = color + soft;
  let c = gradCache.get(key);
  if (c) return c;
  c = makeCanvas(128, 128);
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  if (soft) {
    gr.addColorStop(0, color);
    gr.addColorStop(0.4, color);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
  } else {
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.35, 'rgba(255,255,255,0.85)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
  }
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  gradCache.set(key, c);
  return c;
}

function hexA(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/**
 * darkness: 0..1 ambient darkness. tint: the colour of the dark.
 * lights are in world coordinates; camX/camY convert to screen.
 */
export function renderLighting(
  ctx: CanvasRenderingContext2D, w: number, h: number, camX: number, camY: number,
  darkness: number, tint: string, lights: Light[], clock: number,
) {
  if (darkness <= 0.01) return;
  if (!layer || layer.width !== w || layer.height !== h) {
    layer = makeCanvas(w, h);
    lctx = layer.getContext('2d')!;
  }
  const L = lctx!;
  L.globalCompositeOperation = 'source-over';
  L.clearRect(0, 0, w, h);
  L.fillStyle = hexA(tint, Math.min(0.9, darkness));
  L.fillRect(0, 0, w, h);
  L.globalCompositeOperation = 'destination-out';
  const cut = lightSprite('#fff', false);
  for (const l of lights) {
    const fl = l.flicker ? 1 + Math.sin(clock * 11 + l.x * 0.7) * 0.04 + Math.sin(clock * 17.3 + l.y) * 0.03 : 1;
    const r = l.r * fl;
    const sx = l.x - camX, sy = l.y - camY;
    if (sx + r < 0 || sy + r < 0 || sx - r > w || sy - r > h) continue;
    L.globalAlpha = Math.min(1, l.intensity);
    L.drawImage(cut, sx - r, sy - r, r * 2, r * 2);
  }
  L.globalAlpha = 1;
  ctx.drawImage(layer, 0, 0);

  // warm additive glow
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const fl = l.flicker ? 1 + Math.sin(clock * 9 + l.x) * 0.06 : 1;
    const r = l.r * 0.75 * fl;
    const sx = l.x - camX, sy = l.y - camY;
    if (sx + r < 0 || sy + r < 0 || sx - r > w || sy - r > h) continue;
    ctx.globalAlpha = Math.min(0.5, l.intensity * 0.28 * Math.min(1, darkness * 1.4));
    ctx.drawImage(lightSprite(hexA(l.color, 1), true), sx - r, sy - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Warm/cool colour grading for dawn, dusk and night. hour: 0..24 */
export function gradeForHour(ctx: CanvasRenderingContext2D, w: number, h: number, hour: number, outdoor: boolean, weather: number) {
  let col = '', a = 0;
  if (hour >= 4.5 && hour < 7.5) { col = '#ff9a5a'; a = 0.22 * (1 - Math.abs(hour - 6) / 1.5); }
  else if (hour >= 17.5 && hour < 21) { col = '#ff7a3a'; a = 0.26 * (1 - Math.abs(hour - 19.2) / 1.9); }
  if (outdoor && a > 0) {
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = hexA(col, Math.max(0, a) * 2.2);
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (weather > 0) {
    ctx.fillStyle = `rgba(60,70,85,${weather * 0.25})`;
    ctx.fillRect(0, 0, w, h);
  }
}
