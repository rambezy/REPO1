// Light and shade. The world is lit through a light map: ambient light that
// follows the sun (gold at dawn and dusk, moonlit blue at night) with every
// fire, lantern and window added into it, multiplied over the scene. Objects
// cast soft sun shadows that swing and stretch through the day, clouds drift
// their shadows across the land, and windows glow once night falls.

import { newCanvas } from '../gfx/paint';
import { shadowOf } from '../gfx/paint';
import type { Sprite } from '../gfx/sprite';
import { clamp, valueNoise, fbm } from './util';

export interface Light { x: number; y: number; r: number; color: string; intensity: number; flicker?: boolean }

// ---------------------------------------------------------------- time of day

type RGB = [number, number, number];

/** Outdoor ambient light over the day, [hour, rgb]. */
const SKY: [number, RGB][] = [
  [0, [0.25, 0.3, 0.5]],
  [3.8, [0.27, 0.31, 0.52]],
  [4.8, [0.42, 0.4, 0.58]],
  [5.6, [0.85, 0.64, 0.62]],
  [6.6, [1.0, 0.86, 0.72]],
  [8.2, [1.0, 0.97, 0.9]],
  [12.5, [1.0, 1.0, 0.97]],
  [17, [1.0, 0.95, 0.86]],
  [19, [1.0, 0.8, 0.6]],
  [20.2, [0.88, 0.56, 0.5]],
  [21.2, [0.46, 0.4, 0.6]],
  [22.3, [0.27, 0.31, 0.52]],
  [24, [0.25, 0.3, 0.5]],
];

export function skyLight(h: number): RGB {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, c0] = SKY[i], [h1, c1] = SKY[i + 1];
    if (h >= h0 && h <= h1) {
      const t = (h - h0) / (h1 - h0);
      const s = t * t * (3 - 2 * t);
      return [c0[0] + (c1[0] - c0[0]) * s, c0[1] + (c1[1] - c0[1]) * s, c0[2] + (c1[2] - c0[2]) * s];
    }
  }
  return SKY[0][1];
}

/** Interiors: daylight through small windows, dimmer and warmer; dark at night. */
export function roomLight(h: number, ambient: number): RGB {
  const sky = skyLight(h);
  const k = 1 - ambient * 0.5;
  const warm: RGB = [sky[0] * 0.98, sky[1] * 0.92, sky[2] * 0.84];
  const night: RGB = [0.2, 0.17, 0.19];
  const day = clamp((sky[0] + sky[1] + sky[2]) / 3 - 0.3, 0, 1) / 0.7;
  return [night[0] + (warm[0] * k - night[0]) * day, night[1] + (warm[1] * k - night[1]) * day, night[2] + (warm[2] * k - night[2]) * day];
}

export interface Sun { /** 0..1 how strongly it casts shadows */ strength: number; /** shadow offset per unit of height */ sx: number; sy: number }

export function sunAt(h: number, rain: number): Sun {
  if (h < 4.9 || h > 21) return { strength: 0, sx: 0, sy: -0.4 };
  const t = (h - 4.9) / (21 - 4.9); // 0 sunrise .. 1 sunset
  const el = Math.sin(t * Math.PI); // elevation
  const az = (t - 0.5) * 2.6; // radians from north, west in the morning
  const len = 0.32 + Math.pow(1 - el, 2) * 1.6;
  const rise = clamp(Math.min(h - 4.9, 21 - h) / 0.8, 0, 1);
  return { strength: rise * (1 - rain * 0.75) * (0.55 + el * 0.45), sx: Math.sin(az) * len, sy: -Math.cos(az) * len * 0.55 - 0.08 };
}

// ---------------------------------------------------------------- light map

let lmap: HTMLCanvasElement | null = null;
let lctx: CanvasRenderingContext2D | null = null;
const spriteCache = new Map<string, HTMLCanvasElement>();

function hexRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** A soft round light of one colour, 128px. */
function lightSprite(color: string): HTMLCanvasElement {
  let c = spriteCache.get(color);
  if (c) return c;
  c = newCanvas(128, 128);
  const g = c.getContext('2d')!;
  const [r, gg, b] = hexRgb(color);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${r},${gg},${b},1)`);
  gr.addColorStop(0.25, `rgba(${r},${gg},${b},0.8)`);
  gr.addColorStop(0.55, `rgba(${r},${gg},${b},0.32)`);
  gr.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  spriteCache.set(color, c);
  return c;
}

function flick(l: Light, clock: number) {
  return l.flicker ? 1 + Math.sin(clock * 11 + l.x * 0.7) * 0.05 + Math.sin(clock * 17.3 + l.y) * 0.035 + Math.sin(clock * 3.1 + l.x) * 0.03 : 1;
}

/**
 * Multiplies the scene by ambient light plus every light source. The context
 * is in screen space measured in world units (0..w, 0..h).
 */
export function applyLightMap(ctx: CanvasRenderingContext2D, w: number, h: number, camX: number, camY: number, ambient: RGB, lights: Light[], clock: number) {
  const lw = Math.ceil(w / 2) + 1, lh = Math.ceil(h / 2) + 1; // half a texel per unit: light is soft anyway
  if (!lmap || lmap.width !== lw || lmap.height !== lh) {
    lmap = newCanvas(lw, lh);
    lctx = lmap.getContext('2d')!;
  }
  const L = lctx!;
  L.setTransform(1, 0, 0, 1, 0, 0);
  L.globalCompositeOperation = 'source-over';
  L.globalAlpha = 1;
  L.fillStyle = `rgb(${Math.round(ambient[0] * 255)},${Math.round(ambient[1] * 255)},${Math.round(ambient[2] * 255)})`;
  L.fillRect(0, 0, lw, lh);
  L.setTransform(0.5, 0, 0, 0.5, 0, 0);
  L.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const r = l.r * flick(l, clock);
    const sx = l.x - camX, sy = l.y - camY;
    if (sx + r < 0 || sy + r < 0 || sx - r > w || sy - r > h) continue;
    L.globalAlpha = clamp(l.intensity, 0, 1.5) * 0.9;
    L.drawImage(lightSprite(l.color), sx - r, sy - r, r * 2, r * 2);
  }
  L.globalAlpha = 1;
  L.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.globalCompositeOperation = 'multiply';
  ctx.drawImage(lmap, 0, 0, lw * 2, lh * 2);
  ctx.restore();
}

/** Additive glow around bright lights: a cheap bloom. */
export function drawGlows(ctx: CanvasRenderingContext2D, w: number, h: number, camX: number, camY: number, lights: Light[], clock: number, dark: number) {
  if (dark < 0.05) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const r = l.r * 0.42 * flick(l, clock);
    const sx = l.x - camX, sy = l.y - camY;
    if (sx + r < 0 || sy + r < 0 || sx - r > w || sy - r > h) continue;
    ctx.globalAlpha = Math.min(0.45, l.intensity * 0.3 * dark);
    ctx.drawImage(lightSprite(l.color), sx - r, sy - r, r * 2, r * 2);
  }
  ctx.restore();
}

// ---------------------------------------------------------------- sun shadows

let smap: HTMLCanvasElement | null = null;
let sctx: CanvasRenderingContext2D | null = null;

export interface Caster { sprite?: Sprite | null; x: number; y: number; flip?: boolean; blob?: { w: number; h: number } }

/**
 * Soft sun shadows: every caster's silhouette is sheared along the sun
 * direction into one layer (so overlaps never double up), then laid over the
 * ground. Called in world space before objects are drawn.
 */
export function drawSunShadows(ctx: CanvasRenderingContext2D, casters: Caster[], sun: Sun, camX: number, camY: number, w: number, h: number) {
  if (sun.strength < 0.02) return;
  const lw = Math.ceil(w) + 2, lh = Math.ceil(h) + 2;
  if (!smap || smap.width !== lw || smap.height !== lh) {
    smap = newCanvas(lw, lh);
    sctx = smap.getContext('2d')!;
  }
  const S = sctx!;
  S.setTransform(1, 0, 0, 1, 0, 0);
  S.clearRect(0, 0, lw, lh);
  S.fillStyle = '#000';
  const sx = sun.sx, sy = sun.sy;
  for (const c of casters) {
    const X = c.x - camX, Y = c.y - camY;
    if (c.blob) {
      // people and animals: a soft stretched blob from the feet
      const L = c.blob.h;
      const ex = X + (sx * L) / 2, ey = Y + (sy * L) / 2;
      S.setTransform(1, 0, 0, 1, 0, 0);
      S.save();
      S.translate(ex, ey);
      S.rotate(Math.atan2(sy, sx));
      S.beginPath();
      S.ellipse(0, 0, Math.max(c.blob.w * 0.5, Math.hypot(sx, sy) * L * 0.5 + 1), c.blob.w * 0.42, 0, 0, Math.PI * 2);
      S.fill();
      S.restore();
      continue;
    }
    const s = c.sprite;
    if (!s) continue;
    const sh = shadowOf(s);
    const pad = 3;
    // sprite local (u,v) -> ground: x' = X - ox + u + (oy - v)*sx, y' = Y + (oy - v)*sy
    // (mirrored sprites flip u within their own box, as drawSprite does)
    const f = Y + s.oy * sy + sy * pad;
    if (c.flip) S.setTransform(-1, 0, -sx, -sy, X - s.ox + s.w + pad + s.oy * sx + pad * sx, f);
    else S.setTransform(1, 0, -sx, -sy, X - s.ox - pad + s.oy * sx + pad * sx, f);
    S.drawImage(sh, 0, 0);
  }
  S.setTransform(1, 0, 0, 1, 0, 0);
  ctx.save();
  ctx.globalAlpha = 0.4 * sun.strength;
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(smap, camX, camY, lw, lh);
  ctx.restore();
}

// ---------------------------------------------------------------- clouds and mist

let clouds: HTMLCanvasElement | null = null;

function cloudTexture(): HTMLCanvasElement {
  if (clouds) return clouds;
  const N = 256;
  clouds = newCanvas(N, N);
  const g = clouds.getContext('2d')!;
  const img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // tileable: blend four offset samples
    const fx = x / N, fy = y / N;
    const s = (u: number, v: number) => fbm(u * 6, v * 6, 4, 811);
    const n = s(fx, fy) * (1 - fx) * (1 - fy) + s(fx - 1, fy) * fx * (1 - fy) + s(fx, fy - 1) * (1 - fx) * fy + s(fx - 1, fy - 1) * fx * fy;
    const a = clamp((n - 0.46) / 0.22, 0, 1);
    const i = (y * N + x) * 4;
    img.data[i] = 20; img.data[i + 1] = 24; img.data[i + 2] = 40;
    img.data[i + 3] = Math.round(a * a * (3 - 2 * a) * 255);
  }
  g.putImageData(img, 0, 0);
  return clouds;
}

/** Cloud shadows drifting over the land by day (world space). */
export function drawCloudShadows(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number, clock: number, strength: number) {
  if (strength < 0.02) return;
  const tex = cloudTexture();
  const scale = 5; // world units per texel
  const size = 256 * scale;
  const ox = (clock * 7) % size, oy = (clock * 2.5) % size;
  ctx.save();
  ctx.globalAlpha = strength;
  const x0 = Math.floor((camX - ox) / size) * size + ox, y0 = Math.floor((camY - oy) / size) * size + oy;
  for (let y = y0; y < camY + h; y += size) for (let x = x0; x < camX + w; x += size) ctx.drawImage(tex, x, y, size, size);
  ctx.restore();
}

/** Morning mist and rain haze (screen space). */
export function drawMist(ctx: CanvasRenderingContext2D, camX: number, camY: number, w: number, h: number, clock: number, amount: number) {
  if (amount < 0.02) return;
  const tex = cloudTexture();
  const scale = 3, size = 256 * scale;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = amount;
  ctx.filter = 'none';
  const ox = (camX * 0.9 + clock * 4) % size, oy = (camY * 0.9) % size;
  for (let y = -oy - size; y < h; y += size) for (let x = -ox - size; x < w; x += size) {
    ctx.drawImage(tex, x, y, size, size);
  }
  ctx.restore();
}

/** Final colour grade: a little contrast and warmth by day, cool haze in the rain. */
export function grade(ctx: CanvasRenderingContext2D, w: number, h: number, hour: number, outdoor: boolean, rain: number) {
  let col = '', a = 0;
  if (hour >= 4.8 && hour < 8) { col = '#ffb070'; a = 0.2 * Math.sin(((hour - 4.8) / 3.2) * Math.PI); }
  else if (hour >= 17 && hour < 21.3) { col = '#ff8a40'; a = 0.24 * Math.sin(((hour - 17) / 4.3) * Math.PI); }
  if (outdoor && a > 0.01) {
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    const [r, g, b] = hexRgb(col);
    ctx.fillStyle = `rgba(${r},${g},${b},${a * 2})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
  if (rain > 0) {
    ctx.fillStyle = `rgba(70,80,96,${rain * 0.22})`;
    ctx.fillRect(0, 0, w, h);
  }
}

export { valueNoise };
