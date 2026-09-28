// Seeded random numbers. Everything procedural in the world derives from a
// seed so the same world can be rebuilt from a save without storing terrain.

export function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Integer hash of up to three ints, stable across runs. */
export function hash3(a: number, b: number, c = 0): number {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Deterministic float in [0,1) from integer coordinates. */
export function hash01(a: number, b: number, c = 0): number {
  return hash3(a, b, c) / 4294967296;
}

export class RNG {
  private s: number;
  constructor(seed: number | string = 1) {
    this.s = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 0x9e3779b9;
  }
  /** mulberry32 */
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  get state() { return this.s; }
  set state(v: number) { this.s = v >>> 0; }
  range(a: number, b: number) { return a + (b - a) * this.next(); }
  int(a: number, b: number) { return a + Math.floor(this.next() * (b - a + 1)); }
  chance(p: number) { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  /** Picks by weight from [item, weight] pairs or objects with .w */
  weighted<T>(items: readonly (readonly [T, number])[]): T {
    let total = 0;
    for (const it of items) total += it[1];
    let r = this.next() * total;
    for (const it of items) {
      r -= it[1];
      if (r <= 0) return it[0];
    }
    return items[items.length - 1][0];
  }
  gauss(mean = 0, sd = 1) {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  fork(salt: string | number): RNG {
    return new RNG(hash3(this.s, typeof salt === 'string' ? hashStr(salt) : salt, 77));
  }
}

/** A process-wide RNG for things that need not be reproducible (combat rolls, barks). */
export const rng = new RNG((Date.now() ^ 0x5bd1e995) >>> 0);
