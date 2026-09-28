// A small pixel buffer used to paint sprites procedurally, with helpers for
// shapes, automatic outlines and export to canvas.

import { hexToRgb } from '../engine/util';

const packCache = new Map<string, number>();
/** Packs a hex colour (optionally with alpha 0..255) into a little-endian ABGR uint32. */
export function pack(hex: string, a = 255): number {
  const key = hex + a;
  let v = packCache.get(key);
  if (v !== undefined) return v;
  const [r, g, b] = hexToRgb(hex);
  v = ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  packCache.set(key, v);
  return v;
}
export const TRANSPARENT = 0;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return c;
}

export class PixelBuffer {
  w: number;
  h: number;
  data: Uint32Array;
  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.data = new Uint32Array(w * h);
  }
  inside(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  get(x: number, y: number): number {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return 0;
    return this.data[y * this.w + x];
  }
  set(x: number, y: number, c: number) {
    x = Math.round(x); y = Math.round(y);
    if (!this.inside(x, y)) return;
    this.data[y * this.w + x] = c;
  }
  px(x: number, y: number, hex: string, a = 255) { this.set(x, y, pack(hex, a)); }
  /** Only paints where something is already drawn (useful for shading/clothing). */
  pxOn(x: number, y: number, hex: string) {
    if (this.get(x, y) !== 0) this.px(x, y, hex);
  }
  rect(x: number, y: number, w: number, h: number, hex: string, a = 255) {
    const c = pack(hex, a);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  rectOn(x: number, y: number, w: number, h: number, hex: string) {
    const c = pack(hex);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (this.get(x + i, y + j) !== 0) this.set(x + i, y + j, c);
  }
  hline(x0: number, x1: number, y: number, hex: string) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) this.px(x, y, hex);
  }
  vline(x: number, y0: number, y1: number, hex: string) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) this.px(x, y, hex);
  }
  line(x0: number, y0: number, x1: number, y1: number, hex: string) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const c = pack(hex);
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Filled ellipse inside the box (x,y,w,h). */
  ellipse(x: number, y: number, w: number, h: number, hex: string, a = 255) {
    const c = pack(hex, a);
    const cx = x + w / 2 - 0.5, cy = y + h / 2 - 0.5;
    const rx = w / 2, ry = h / 2;
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
      const dx = (x + i - cx) / rx, dy = (y + j - cy) / ry;
      if (dx * dx + dy * dy <= 1.0) this.set(x + i, y + j, c);
    }
  }
  circle(cx: number, cy: number, r: number, hex: string, a = 255) {
    const c = pack(hex, a);
    for (let j = -Math.ceil(r); j <= Math.ceil(r); j++) for (let i = -Math.ceil(r); i <= Math.ceil(r); i++) {
      if (i * i + j * j <= r * r + r * 0.6) this.set(cx + i, cy + j, c);
    }
  }
  /** Adds a 1px outline around all opaque pixels. `diag` includes diagonal neighbours. */
  outline(hex: string, diag = false) {
    const c = pack(hex);
    const src = this.data.slice();
    const w = this.w, h = this.h;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (src[y * w + x] !== 0) continue;
      let hit = false;
      const test = (xx: number, yy: number) => {
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && src[yy * w + xx] !== 0 && src[yy * w + xx] !== c) hit = true;
      };
      test(x - 1, y); test(x + 1, y); test(x, y - 1); test(x, y + 1);
      if (diag && !hit) { test(x - 1, y - 1); test(x + 1, y - 1); test(x - 1, y + 1); test(x + 1, y + 1); }
      if (hit) this.data[y * w + x] = c;
    }
  }
  /** Darkens opaque pixels whose neighbour in direction (dx,dy) is transparent: cheap rim shading. */
  rimShade(dx: number, dy: number, factor: number) {
    const src = this.data.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      const v = src[y * this.w + x];
      if (v === 0) continue;
      const nx = x + dx, ny = y + dy;
      const n = this.inside(nx, ny) ? src[ny * this.w + nx] : 0;
      if (n === 0) this.data[y * this.w + x] = scalePacked(v, factor);
    }
  }
  flipH(): PixelBuffer {
    const out = new PixelBuffer(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) out.data[y * this.w + (this.w - 1 - x)] = this.data[y * this.w + x];
    return out;
  }
  blit(src: PixelBuffer, ox: number, oy: number) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const v = src.data[y * src.w + x];
      if (v !== 0) this.set(ox + x, oy + y, v);
    }
  }
  toCanvas(): HTMLCanvasElement {
    const c = makeCanvas(this.w, this.h);
    this.drawTo(c.getContext('2d')!, 0, 0);
    return c;
  }
  drawTo(ctx: CanvasRenderingContext2D, x: number, y: number) {
    const bytes = new Uint8ClampedArray(this.w * this.h * 4);
    bytes.set(new Uint8Array(this.data.buffer, this.data.byteOffset, this.data.byteLength));
    const img = new ImageData(bytes, this.w, this.h);
    ctx.putImageData(img, x, y);
  }
}

export function scalePacked(v: number, f: number): number {
  const a = (v >>> 24) & 255;
  const b = Math.min(255, ((v >>> 16) & 255) * f);
  const g = Math.min(255, ((v >>> 8) & 255) * f);
  const r = Math.min(255, (v & 255) * f);
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Composites several canvases horizontally/vertically into a sheet. */
export function sheetFromBuffers(frames: PixelBuffer[][], fw: number, fh: number): HTMLCanvasElement {
  const rows = frames.length;
  const cols = Math.max(...frames.map((r) => r.length));
  const c = makeCanvas(cols * fw, rows * fh);
  const ctx = c.getContext('2d')!;
  const all = new ImageData(cols * fw, rows * fh);
  const out = new Uint32Array(all.data.buffer);
  frames.forEach((row, ry) => row.forEach((buf, cx) => {
    for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) {
      const v = buf.data[y * buf.w + x];
      if (v) out[(ry * fh + y) * cols * fw + cx * fw + x] = v;
    }
  }));
  ctx.putImageData(all, 0, 0);
  return c;
}
