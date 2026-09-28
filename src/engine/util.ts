// Small math, randomness and noise helpers shared by every system.

export const TILE = 16;

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => t * t * (3 - 2 * t);
export const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(bx - ax, by - ay);
export const dist2 = (ax: number, ay: number, bx: number, by: number) => (bx - ax) ** 2 + (by - ay) ** 2;
export const sign = (v: number) => (v < 0 ? -1 : v > 0 ? 1 : 0);
export const approach = (v: number, target: number, step: number) =>
  v < target ? Math.min(target, v + step) : Math.max(target, v - step);

/** Wraps an angle to (-PI, PI]. */
export function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
export const angleDiff = (a: number, b: number) => Math.abs(wrapAngle(a - b));

// Directions match sprite-sheet rows: 0 down, 1 left, 2 right, 3 up.
export type Dir = 0 | 1 | 2 | 3;
export const DIR_DOWN: Dir = 0, DIR_LEFT: Dir = 1, DIR_RIGHT: Dir = 2, DIR_UP: Dir = 3;
export const DIR_VEC: [number, number][] = [[0, 1], [-1, 0], [1, 0], [0, -1]];
export function dirFromVec(dx: number, dy: number, fallback: Dir = 0): Dir {
  if (dx === 0 && dy === 0) return fallback;
  if (Math.abs(dx) > Math.abs(dy) * 1.05) return dx < 0 ? DIR_LEFT : DIR_RIGHT;
  return dy < 0 ? DIR_UP : DIR_DOWN;
}
export function dirAngle(d: Dir) {
  return Math.atan2(DIR_VEC[d][1], DIR_VEC[d][0]);
}
export function dirFromAngle(a: number): Dir {
  return dirFromVec(Math.cos(a), Math.sin(a));
}

// ---------- hashing & seeded random ----------

export function hashInt(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}
export function hash2i(x: number, y: number, seed = 0): number {
  return hashInt((x | 0) * 374761393 + (y | 0) * 668265263 + seed * 2147483647 + 0x9e3779b9);
}
/** Deterministic value in [0,1) for an integer lattice point. */
export function hash2(x: number, y: number, seed = 0): number {
  return hash2i(x, y, seed) / 4294967296;
}
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export class RNG {
  s: number;
  constructor(seed: number | string = 1) {
    this.s = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 1;
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return Math.floor(this.range(a, b + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Global, non-deterministic RNG for gameplay randomness (combat rolls etc). */
export const rand = {
  next: () => Math.random(),
  range: (a: number, b: number) => a + (b - a) * Math.random(),
  int: (a: number, b: number) => Math.floor(a + (b - a + 1) * Math.random()),
  chance: (p: number) => Math.random() < p,
  pick: <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)],
};

// ---------- value noise ----------

export function valueNoise(x: number, y: number, seed = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  const u = smooth(xf), v = smooth(yf);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

export function fbm(x: number, y: number, octaves = 3, seed = 0): number {
  let amp = 0.5, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

// ---------- colour helpers ----------

export type RGB = [number, number, number];

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}
export function mixHex(a: string, b: string, t: number): string {
  const A = hexToRgb(a), B = hexToRgb(b);
  return rgbToHex([lerp(A[0], B[0], t), lerp(A[1], B[1], t), lerp(A[2], B[2], t)]);
}
/** Lighten (amt>0) or darken (amt<0) a colour, keeping a little hue shift toward warm/cool. */
export function shade(hex: string, amt: number): string {
  const [r, g, b] = hexToRgb(hex);
  if (amt >= 0) {
    return rgbToHex([r + (255 - r) * amt, g + (255 - g) * amt * 0.96, b + (255 - b) * amt * 0.88]);
  }
  const k = 1 + amt;
  // Shadows drift slightly toward purple-blue, which reads better in pixel art.
  return rgbToHex([r * k * 0.97, g * k * 0.95, b * k + (1 - k) * 18]);
}

export function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = Math.floor(minutes % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function uid(prefix = 'e'): string {
  return prefix + Math.random().toString(36).slice(2, 9);
}

export function titleCase(s: string) {
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
