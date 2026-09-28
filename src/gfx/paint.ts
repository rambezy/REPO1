// Painting toolkit for the high-resolution art: colour helpers, organic
// shapes, gradients, and post-processing (rims, grain, silhouettes).
// Sprites are painted at ART texels per world unit and drawn scaled.

import { RNG, hexToRgb, rgbToHex, clamp, lerp } from '../engine/util';
import { Sprite } from './sprite';

/** Sprite texels per world unit. */
export const ART = 4;

export type Ctx = CanvasRenderingContext2D;

export function newCanvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document === 'undefined') {
    // inside a worker: an OffscreenCanvas offers the same 2D drawing API
    return new OffscreenCanvas(Math.max(1, Math.ceil(w)), Math.max(1, Math.ceil(h))) as unknown as HTMLCanvasElement;
  }
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

/** A canvas sized for w x h world units, with a context that draws in world units. */
export function artCanvas(w: number, h: number, res = ART): { c: HTMLCanvasElement; g: Ctx } {
  const c = newCanvas(w * res, h * res);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.scale(res, res);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  return { c, g };
}

/** Paints a sprite of w x h world units whose base point is (ox, oy). */
export function paintSprite(w: number, h: number, ox: number, oy: number, paint: (g: Ctx) => void, o: { rim?: number | false; rimColor?: string; res?: number } = {}): Sprite {
  const res = o.res ?? ART;
  const { c, g } = artCanvas(w, h, res);
  paint(g);
  if (o.rim !== false) rim(c, o.rimColor ?? '#1c130d', o.rim ?? 0.5, Math.max(1, Math.round(res / 3)));
  return { canvas: c, ox, oy, w, h };
}

// ---------------------------------------------------------------- colour

export function mix(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}
export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
/** Lighter and warmer (sunlit). */
export function lit(hex: string, t: number): string {
  return mix(hex, mix('#fff4d6', hex, 0.35), clamp(t, 0, 1));
}
/** Darker and cooler (shade). */
export function dim(hex: string, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const k = 1 - clamp(t, 0, 1);
  return rgbToHex([r * k * 0.92 + 6 * (1 - k), g * k * 0.95 + 8 * (1 - k), b * k + 22 * (1 - k)]);
}
/** A light-to-dark ramp of n steps around a base colour. */
export function ramp(hex: string, n = 5, spread = 0.5): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * 2 - 1; // -1 dark .. 1 light
    out.push(t < 0 ? dim(hex, -t * spread) : lit(hex, t * spread * 0.8));
  }
  return out;
}
export function jitter(hex: string, rng: RNG, amt = 0.06): string {
  const [r, g, b] = hexToRgb(hex);
  const k = 1 + (rng.next() - 0.5) * 2 * amt;
  const w = (rng.next() - 0.5) * amt * 40;
  return rgbToHex([r * k + w, g * k, b * k - w * 0.6]);
}

// ---------------------------------------------------------------- gradients

export function lin(g: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of stops) gr.addColorStop(clamp(t, 0, 1), c);
  return gr;
}
export function rad(g: Ctx, x: number, y: number, r0: number, x1: number, y1: number, r1: number, stops: [number, string][]): CanvasGradient {
  const gr = g.createRadialGradient(x, y, r0, x1, y1, r1);
  for (const [t, c] of stops) gr.addColorStop(clamp(t, 0, 1), c);
  return gr;
}
/** Ball-like shading for round masses lit from the upper left. */
export function ballShade(g: Ctx, cx: number, cy: number, r: number, base: string, lightAmt = 0.45, darkAmt = 0.5): CanvasGradient {
  return rad(g, cx - r * 0.35, cy - r * 0.45, r * 0.08, cx, cy, r * 1.05, [
    [0, lit(base, lightAmt)], [0.45, base], [1, dim(base, darkAmt)],
  ]);
}

// ---------------------------------------------------------------- shapes

export function ellipse(g: Ctx, cx: number, cy: number, rx: number, ry: number, fill: string | CanvasGradient, rot = 0) {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(cx, cy, Math.max(0.01, rx), Math.max(0.01, ry), rot, 0, Math.PI * 2);
  g.fill();
}
export function circle(g: Ctx, cx: number, cy: number, r: number, fill: string | CanvasGradient) { ellipse(g, cx, cy, r, r, fill); }

export function rect(g: Ctx, x: number, y: number, w: number, h: number, fill: string | CanvasGradient) {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
}
export function roundRect(g: Ctx, x: number, y: number, w: number, h: number, r: number, fill?: string | CanvasGradient, stroke?: string, lw = 0.3) {
  const rr = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + rr, y);
  g.arcTo(x + w, y, x + w, y + h, rr);
  g.arcTo(x + w, y + h, x, y + h, rr);
  g.arcTo(x, y + h, x, y, rr);
  g.arcTo(x, y, x + w, y, rr);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
export function line(g: Ctx, x0: number, y0: number, x1: number, y1: number, color: string | CanvasGradient, w = 0.4) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.stroke();
}
export function poly(g: Ctx, pts: number[], fill?: string | CanvasGradient, stroke?: string, lw = 0.3) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
}
/** A tapered curved stroke (grass blade, hair strand, straw). */
export function blade(g: Ctx, x: number, y: number, len: number, ang: number, bend: number, w: number, color: string | CanvasGradient) {
  const tx = x + Math.cos(ang) * len, ty = y + Math.sin(ang) * len;
  const mx = x + Math.cos(ang) * len * 0.5 + Math.cos(ang + Math.PI / 2) * bend;
  const my = y + Math.sin(ang) * len * 0.5 + Math.sin(ang + Math.PI / 2) * bend;
  const nx = Math.cos(ang + Math.PI / 2) * w * 0.5, ny = Math.sin(ang + Math.PI / 2) * w * 0.5;
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - nx, y - ny);
  g.quadraticCurveTo(mx - nx * 0.6, my - ny * 0.6, tx, ty);
  g.quadraticCurveTo(mx + nx * 0.6, my + ny * 0.6, x + nx, y + ny);
  g.closePath();
  g.fill();
}
/** Closed organic blob path around (cx,cy); caller fills/strokes. */
export function blobPath(g: Ctx, cx: number, cy: number, rx: number, ry: number, rng: RNG, lumps = 8, jag = 0.16) {
  const pts: [number, number][] = [];
  const off = rng.next() * Math.PI * 2;
  for (let i = 0; i < lumps; i++) {
    const a = off + (i / lumps) * Math.PI * 2;
    const k = 1 + (rng.next() - 0.5) * 2 * jag;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  g.beginPath();
  const mid = (i: number) => {
    const a = pts[i % lumps], b = pts[(i + 1) % lumps];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  };
  const m0 = mid(lumps - 1);
  g.moveTo(m0[0], m0[1]);
  for (let i = 0; i < lumps; i++) {
    const m = mid(i);
    g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]);
  }
  g.closePath();
}
export function blob(g: Ctx, cx: number, cy: number, rx: number, ry: number, rng: RNG, fill: string | CanvasGradient, lumps = 8, jag = 0.16) {
  blobPath(g, cx, cy, rx, ry, rng, lumps, jag);
  g.fillStyle = fill;
  g.fill();
}

// ---------------------------------------------------------------- post-processing

/** Draws a thin dark rim just outside the silhouette of a canvas (in place). */
export function rim(c: HTMLCanvasElement, color = '#1c130d', alpha = 0.5, px = 1) {
  if (alpha <= 0) return;
  const s = silhouette(c, color);
  const out = newCanvas(c.width, c.height);
  const g = out.getContext('2d')!;
  g.globalAlpha = alpha;
  for (const [dx, dy] of [[-px, 0], [px, 0], [0, -px], [0, px], [-px, -px], [px, -px], [-px, px], [px, px]]) g.drawImage(s, dx, dy);
  g.globalAlpha = 1;
  g.drawImage(c, 0, 0);
  const cg = c.getContext('2d')!;
  cg.save();
  cg.setTransform(1, 0, 0, 1, 0, 0);
  cg.clearRect(0, 0, c.width, c.height);
  cg.drawImage(out, 0, 0);
  cg.restore();
}

/** Solid-colour copy of a canvas's alpha. */
export function silhouette(c: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const s = newCanvas(c.width, c.height);
  const g = s.getContext('2d')!;
  g.drawImage(c, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, s.width, s.height);
  return s;
}

/** Adds fine painterly grain to the opaque parts of a canvas. */
export function grain(c: HTMLCanvasElement, amount = 10, seed = 1) {
  const g = c.getContext('2d')!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const rng = new RNG(seed);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (rng.next() - 0.5) * amount;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n * 0.8, 0, 255);
  }
  g.putImageData(img, 0, 0);
}

/** A soft, low-resolution silhouette for cast shadows (1 texel per world unit). */
export function shadowOf(s: Sprite): HTMLCanvasElement {
  if (s.shadow) return s.shadow;
  const pad = 3;
  const w = Math.ceil(s.w) + pad * 2, h = Math.ceil(s.h) + pad * 2;
  const small = newCanvas(w, h);
  const g = small.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.drawImage(s.canvas, pad, pad, s.w, s.h);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  // soften: shrink and grow once
  const tiny = newCanvas(Math.ceil(w / 2), Math.ceil(h / 2));
  const tg = tiny.getContext('2d')!;
  tg.imageSmoothingEnabled = true;
  tg.drawImage(small, 0, 0, tiny.width, tiny.height);
  const out = newCanvas(w, h);
  const og = out.getContext('2d')!;
  og.imageSmoothingEnabled = true;
  og.drawImage(tiny, 0, 0, w, h);
  s.shadow = out;
  return out;
}

export { RNG };
