// Deterministic placement of vegetation and boulders per terrain chunk.
// The renderer draws these; navigation blocks the large ones.
import { Terrain } from './terrain';
import { REGIONS } from './regions';
import { CELL, CHUNK_M, SEA } from './consts';
import { hash3 } from '../core/rng';
import { Noise2 } from '../core/noise';
import { smoothstep } from '../core/math';

export interface PropInst {
  kind: number; // index into PROP_KINDS
  x: number;
  y: number;
  z: number;
  rot: number;
  s: number; // scale
  tint: number; // 0..1
}

export interface PropKindDef {
  key: string;
  range: number; // draw distance
  shadow: boolean;
  sway: number; // wind response
  block: number; // blocking radius at scale 1 (0 = walk-through)
  wet?: boolean; // grows at the water's edge / in shallows
  maxSlope?: number;
  scale: [number, number];
}

export const PROP_KINDS: PropKindDef[] = [
  { key: 'shrub', range: 420, shadow: true, sway: 0.6, block: 0, scale: [0.7, 1.4] },
  { key: 'deadtree', range: 1100, shadow: true, sway: 0.1, block: 0.35, scale: [0.8, 1.5] },
  { key: 'cactus', range: 700, shadow: true, sway: 0, block: 0.35, scale: [0.7, 1.5] },
  { key: 'grassdry', range: 260, shadow: false, sway: 1, block: 0, scale: [0.7, 1.3] },
  { key: 'grass', range: 260, shadow: false, sway: 1, block: 0, scale: [0.7, 1.4] },
  { key: 'redgrass', range: 260, shadow: false, sway: 1, block: 0, scale: [0.8, 1.5] },
  { key: 'ashgrass', range: 260, shadow: false, sway: 1, block: 0, scale: [0.7, 1.2] },
  { key: 'seagrass', range: 260, shadow: false, sway: 1, block: 0, wet: true, scale: [0.8, 1.4] },
  { key: 'reeds', range: 300, shadow: false, sway: 1, block: 0, wet: true, scale: [0.8, 1.4] },
  { key: 'flowers', range: 180, shadow: false, sway: 1, block: 0, scale: [0.8, 1.2] },
  { key: 'tree', range: 1400, shadow: true, sway: 0.25, block: 0.5, scale: [0.8, 1.5] },
  { key: 'olive', range: 1200, shadow: true, sway: 0.2, block: 0.4, scale: [0.8, 1.3] },
  { key: 'blacktree', range: 1200, shadow: true, sway: 0.05, block: 0.4, scale: [0.8, 1.6] },
  { key: 'swamptree', range: 1400, shadow: true, sway: 0.15, block: 0.8, wet: true, scale: [0.8, 1.5] },
  { key: 'stalk', range: 1800, shadow: true, sway: 0.08, block: 0.6, scale: [0.7, 1.5] },
  { key: 'fungus', range: 600, shadow: true, sway: 0.05, block: 0, scale: [0.6, 1.8] },
  { key: 'saltcrystal', range: 600, shadow: true, sway: 0, block: 0, scale: [0.5, 1.6] },
  { key: 'crystal', range: 900, shadow: true, sway: 0, block: 0.5, scale: [0.9, 3] },
  { key: 'bones', range: 2200, shadow: true, sway: 0, block: 2.2, scale: [1.4, 2.8] },
  { key: 'scrap', range: 700, shadow: true, sway: 0, block: 0.5, scale: [0.6, 1.4] },
  { key: 'driftwood', range: 500, shadow: true, sway: 0, block: 0, wet: true, scale: [0.7, 1.4] },
  { key: 'boulder', range: 1500, shadow: true, sway: 0, block: 0.85, maxSlope: 3, scale: [0.4, 3.2] },
];
export const PROP_INDEX: Record<string, number> = Object.fromEntries(PROP_KINDS.map((k, i) => [k.key, i]));
const BOULDER = PROP_INDEX.boulder;

const cache = new Map<number, PropInst[]>();
let noise: Noise2 | null = null;

/** Props for chunk (ci, cj). Cached; the same for every call. */
export function chunkProps(T: Terrain, ci: number, cj: number): PropInst[] {
  const key = cj * 1000 + ci;
  const c = cache.get(key);
  if (c) return c;
  if (!noise) noise = new Noise2(T.seed + 777);
  const n = noise;
  const out: PropInst[] = [];
  const step = 6;
  const cells = CHUNK_M / step;
  const x0 = ci * CHUNK_M, z0 = cj * CHUNK_M;
  for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
    const hsh = hash3(ci * cells + i, cj * cells + j, T.seed);
    const x = x0 + (i + ((hsh & 255) / 255)) * step;
    const z = z0 + (j + (((hsh >>> 8) & 255) / 255)) * step;
    const reg = REGIONS[T.regionIdAt(x, z)];
    const h = T.heightAt(x, z);
    const road = T.roadAt(x, z);
    if (road > 60) continue;
    const site = T.siteAt(x, z, 6);
    const inSite = !!site;
    const slope = T.slopeAt(x, z);
    let r = ((hsh >>> 16) & 0xffff) / 65536;
    // boulders: more on slopes and near cliffs
    const rockP = (reg.rocks * (0.4 + smoothstep(0.2, 0.9, slope) * 3) * step * step) / 10000;
    if (!inSite && h > SEA - 0.3 && r < rockP) {
      const h2 = hash3(i, j, key + 91);
      const big = (h2 & 255) / 255;
      const s = 0.4 + Math.pow(big, 2.2) * 2.8;
      out.push({ kind: BOULDER, x, y: h, z, rot: ((h2 >>> 8) & 1023) / 163, s, tint: ((h2 >>> 18) & 255) / 255 });
      continue;
    }
    r -= Math.max(0, rockP);
    if (inSite && site!.kind === 'town') continue;
    for (let v = 0; v < reg.veg.length; v++) {
      const spec = reg.veg[v];
      const kd = PROP_KINDS[PROP_INDEX[spec.kind]];
      if (!kd) continue;
      if (kd.wet) {
        if (h < SEA - 1.2 || h > SEA + 1.8) continue;
      } else if (h < SEA + 0.15) continue;
      if (slope > (spec.maxSlope ?? kd.maxSlope ?? 0.7)) continue;
      let p = (spec.density * step * step) / 10000;
      if (spec.cluster) {
        const m = smoothstep(-0.25, 0.55, n.n(x / 70 + v * 13.1, z / 70 - v * 7.7));
        p *= 1 - spec.cluster + spec.cluster * m * 2.2;
      }
      if (inSite) p *= 0.3;
      if (r < p) {
        const h2 = hash3(i + v * 977, j, key + 13);
        const s = kd.scale[0] + (kd.scale[1] - kd.scale[0]) * ((h2 & 1023) / 1023);
        out.push({ kind: PROP_INDEX[spec.kind], x, y: h, z, rot: ((h2 >>> 10) & 1023) / 163, s, tint: ((h2 >>> 20) & 255) / 255 });
        break;
      }
      r -= p;
      if (r < 0) break;
    }
  }
  cache.set(key, out);
  return out;
}

/** Blocking circles (x, z, radius) of props overlapping an area. */
export function blockersIn(T: Terrain, x0: number, z0: number, x1: number, z1: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  const ci0 = Math.max(0, Math.floor(x0 / CHUNK_M)), ci1 = Math.floor(x1 / CHUNK_M);
  const cj0 = Math.max(0, Math.floor(z0 / CHUNK_M)), cj1 = Math.floor(z1 / CHUNK_M);
  for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
    for (const p of chunkProps(T, ci, cj)) {
      const b = PROP_KINDS[p.kind].block;
      if (!b) continue;
      if (p.kind === BOULDER && p.s < 1.1) continue;
      const r = b * p.s;
      if (p.x + r < x0 || p.x - r > x1 || p.z + r < z0 || p.z - r > z1) continue;
      out.push([p.x, p.z, r]);
    }
  }
  return out;
}

export const _cellSize = CELL;
