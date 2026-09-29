// Chunk renderer for the painted ground. Runs in a web worker (or on the main
// thread as a fallback), so it touches no DOM: it samples the painted
// material textures and adds soft, organic borders, raised turf edges,
// shadows cast by banks and walls, water depth, shallows, foam, and a
// broad colour variation that keeps large fields from looking tiled.

import { T, tdef } from '../../world/terrain';
import { hash2, valueNoise } from '../../engine/util';
import type { MatTex, MatName } from './textures';

export interface TexSource { get(name: MatName): MatTex }

export const CHUNK = 8; // tiles per chunk side
export const TS = 16;
export const PX = CHUNK * TS; // world units per chunk side

export interface GroundSource {
  w: number; // full map width in tiles
  h: number;
  ground: Uint8Array; // the full map, or a window starting at (ox, oy) of size gw x gh
  seed: number;
  outdoor: boolean;
  ox?: number;
  oy?: number;
  gw?: number;
  gh?: number;
}

const WARP = new Uint8Array(64);
for (let i = 0; i < 64; i++) WARP[i] = tdef(i).warp ? 1 : 0;
const WALL = new Uint8Array(64);
for (let i = 0; i < 64; i++) WALL[i] = tdef(i).wall ? 1 : 0;

/** Height class: 0 water, 1 low ground, 2 turf and crops, 3 walls. */
const HT = new Uint8Array(64).fill(1);
for (const t of [T.WATER, T.DEEP, T.FORD]) HT[t] = 0;
for (const t of [T.GRASS, T.MEADOW, T.FOREST, T.WHEAT]) HT[t] = 2;
for (let i = 0; i < 64; i++) if (WALL[i] || i === T.WALL_DARK || i === T.VOID) HT[i] = 3;

/** Painted materials each ground type samples. */
const MATS_FOR: Record<number, MatName[]> = {
  [T.GRASS]: ['grass', 'grass2'], [T.MEADOW]: ['meadow', 'grass'], [T.FOREST]: ['forest', 'grass'],
  [T.DIRT]: ['dirt'], [T.ROAD]: ['road', 'dirt'], [T.SAND]: ['sand'], [T.MUD]: ['mud'], [T.ASH]: ['ash'], [T.GRAVEL]: ['gravel'],
  [T.FIELD]: ['field'], [T.VEG]: ['veg'], [T.WHEAT]: ['wheat'], [T.BURNT_WHEAT]: ['burnt'], [T.COBBLE]: ['cobble'],
  [T.FLAGSTONE]: ['flag', 'flagwarm'], [T.WOOD]: ['wood'], [T.STRAW]: ['straw'], [T.BRIDGE]: ['bridge'], [T.BRIDGE_V]: ['bridge'],
  [T.CARPET]: ['carpet'], [T.WATER]: ['riverbed'], [T.DEEP]: ['riverbed'], [T.FORD]: ['riverbed'],
  [T.ROCK]: ['rockTop', 'rockFace'], [T.WALL_STONE]: ['flag', 'stoneFace'], [T.WALL_PLASTER]: ['beamTop', 'plasterFace'],
  [T.WALL_WOOD]: ['beamTop', 'logFace'], [T.WALL_CAVE]: ['caveTop', 'caveFace'],
};

export function cellAt(src: GroundSource, cx: number, cy: number): number {
  if (cx < 0 || cy < 0 || cx >= src.w || cy >= src.h) {
    if (!src.outdoor) return T.WALL_DARK;
    cx = Math.max(0, Math.min(src.w - 1, cx));
    cy = Math.max(0, Math.min(src.h - 1, cy));
  }
  const gw = src.gw ?? src.w, gh = src.gh ?? src.h;
  const lx = Math.max(0, Math.min(gw - 1, cx - (src.ox ?? 0)));
  const ly = Math.max(0, Math.min(gh - 1, cy - (src.oy ?? 0)));
  return src.ground[ly * gw + lx];
}

/** Extracts the window of ground a chunk render needs (chunk plus a margin). */
export function chunkWindow(full: GroundSource, ccx: number, ccy: number): GroundSource {
  const m = 3;
  const x0 = Math.max(0, ccx * CHUNK - m), y0 = Math.max(0, ccy * CHUNK - m);
  const x1 = Math.min(full.w - 1, (ccx + 1) * CHUNK - 1 + m), y1 = Math.min(full.h - 1, (ccy + 1) * CHUNK - 1 + m);
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1;
  const g = new Uint8Array(Math.max(1, gw * gh));
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) g[y * gw + x] = full.ground[(y0 + y) * full.w + (x0 + x)];
  return { w: full.w, h: full.h, ground: g, seed: full.seed, outdoor: full.outdoor, ox: x0, oy: y0, gw, gh };
}

const wallFaceHeight = (t: number) => (t === T.ROCK ? 1 : t === T.WALL_DARK ? 0 : 2);

/** Wall display mode for a cell: 0 none, 1 top, 2 lower face, 3 upper face. */
export function wallMode(src: GroundSource, cx: number, cy: number): number {
  const t = cellAt(src, cx, cy);
  if (!WALL[t]) return 0;
  const h = wallFaceHeight(t);
  if (h === 0) return 1;
  const s1 = cellAt(src, cx, cy + 1);
  if (!WALL[s1]) return 2;
  if (h >= 2 && s1 === t) {
    const s2 = cellAt(src, cx, cy + 2);
    if (!WALL[s2]) return 3;
  }
  return 1;
}

/** Bilinear-interpolated lattice of a function (far fewer noise calls). */
class Grid {
  private v: Float32Array;
  private cols: number;
  constructor(private x0: number, private y0: number, w: number, h: number, private step: number, fn: (x: number, y: number) => number) {
    this.cols = Math.ceil(w / step) + 2;
    const rows = Math.ceil(h / step) + 2;
    this.v = new Float32Array(this.cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < this.cols; i++) this.v[j * this.cols + i] = fn(x0 + i * step, y0 + j * step);
  }
  get(x: number, y: number): number {
    const fx = (x - this.x0) / this.step, fy = (y - this.y0) / this.step;
    const i = fx | 0, j = fy | 0;
    const tx = fx - i, ty = fy - j;
    const k = j * this.cols + i;
    const a = this.v[k], b = this.v[k + 1], c = this.v[k + this.cols], d = this.v[k + this.cols + 1];
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
}

// ---- packed colour helpers (little-endian ABGR) ----
const R = (c: number) => c & 255;
const Gc = (c: number) => (c >>> 8) & 255;
const B = (c: number) => (c >>> 16) & 255;
function pack(r: number, g: number, b: number): number {
  r = r < 0 ? 0 : r > 255 ? 255 : r;
  g = g < 0 ? 0 : g > 255 ? 255 : g;
  b = b < 0 ? 0 : b > 255 ? 255 : b;
  return (0xff000000 | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0)) >>> 0;
}
function hexPack(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  return pack((n >> 16) & 255, (n >> 8) & 255, n & 255);
}
function lerpC(a: number, b: number, t: number): number {
  return pack(R(a) + (R(b) - R(a)) * t, Gc(a) + (Gc(b) - Gc(a)) * t, B(a) + (B(b) - B(a)) * t);
}
function mulC(a: number, f: number): number {
  return pack(R(a) * f, Gc(a) * f, B(a) * f);
}
/** Darken toward a cool shadow tone. */
function shadeC(a: number, f: number): number {
  const k = 1 - f;
  return pack(R(a) * f + 10 * k, Gc(a) * f + 12 * k, B(a) * f + 26 * k);
}

function samp(t: MatTex, x: number, y: number): number {
  let u = x % t.w; if (u < 0) u += t.w;
  let v = y % t.h; if (v < 0) v += t.h;
  return t.data[(v | 0) * t.w + (u | 0)];
}
/** Sample a texture with its axes swapped (vertical planks from horizontal ones). */
function sampT(t: MatTex, x: number, y: number): number { return samp(t, y, x); }

const C = {
  void: hexPack('#0b0807'),
  soilFace: hexPack('#3a2a1b'),
  soilFaceLit: hexPack('#5a4430'),
  bankTop: hexPack('#5c4a36'),
  bankBot: hexPack('#2a2219'),
  beamLit: hexPack('#8a6c4c'),
  beamD: hexPack('#4a3624'),
  beamLine: hexPack('#22180f'),
  postLit: hexPack('#a08058'),
  postD: hexPack('#5a4230'),
  bridgeBeam: hexPack('#4a3a2c'),
  bridgeBeamD: hexPack('#261c14'),
  shallow: hexPack('#5d8a7c'),
  mid: hexPack('#39707a'),
  deep: hexPack('#1f4c62'),
  deeper: hexPack('#163a50'),
  foam: hexPack('#dfeae4'),
  sky: hexPack('#9fc0d0'),
  gold: hexPack('#b8862e'),
  goldD: hexPack('#7a5418'),
  goldL: hexPack('#e0b850'),
  carpetEdge: hexPack('#4a1414'),
  capIn: hexPack('#2a2521'),
  capEdge: hexPack('#9a8e7a'),
  merlonLit: hexPack('#a8a296'),
  merlon: hexPack('#86827a'),
  merlonGap: hexPack('#2e2c28'),
  wet: hexPack('#3a3226'),
};

export function renderGround(src: GroundSource, ccx: number, ccy: number, tr: number, tex: TexSource, out: Uint32Array) {
  const N = PX * tr + 2; // output side with a one-texel margin all round
  const M = Math.ceil(4 * tr) + 2; // extra margin for edge effects
  const W = N + M * 2;
  const seed = src.seed;
  const gx0 = ccx * PX * tr - 1 - M, gy0 = ccy * PX * tr - 1 - M; // global texel of tt[0]
  const inv = 1 / tr;
  const wx0 = gx0 * inv, wy0 = gy0 * inv;
  const span = W * inv;

  // ---- terrain per texel, with soft organic borders ----
  // Warp-able ground types blend across tile corners (smoothed bilinear
  // weights plus per-type noise), so borders curve instead of stepping.
  const nwx = new Grid(wx0 - 30, wy0 - 30, span + 60, span + 60, 2, (x, y) => valueNoise(x * 0.09, y * 0.09, seed) + valueNoise(x * 0.3, y * 0.3, seed + 4) * 0.35);
  const nwy = new Grid(wx0 - 30, wy0 - 30, span + 60, span + 60, 2, (x, y) => valueNoise(x * 0.09 + 31.7, y * 0.09 + 11.3, seed + 9) + valueNoise(x * 0.3 + 7.1, y * 0.3, seed + 13) * 0.35);
  const jit = new Grid(wx0 - 30, wy0 - 30, span + 60, span + 60, 0.5, (x, y) => valueNoise(x * 0.8, y * 0.8, seed + 21));
  const typeNoise = (t: number, x: number, y: number) => valueNoise(x * 0.16 + t * 13.1, y * 0.16 - t * 7.7, seed + t * 31);
  const smoothType = (wx: number, wy: number): number => {
    const t0 = cellAt(src, Math.floor(wx / TS), Math.floor(wy / TS));
    if (!WARP[t0]) return t0;
    const px = wx + (nwx.get(wx, wy) - 0.67) * 4.5;
    const py = wy + (nwy.get(wx, wy) - 0.67) * 4.5;
    const fx = px / TS - 0.5, fy = py / TS - 0.5;
    const i0 = Math.floor(fx), j0 = Math.floor(fy);
    let ax = fx - i0, ay = fy - j0;
    ax = ax * ax * (3 - 2 * ax);
    ay = ay * ay * (3 - 2 * ay);
    const c0 = cellAt(src, i0, j0), c1 = cellAt(src, i0 + 1, j0), c2 = cellAt(src, i0, j0 + 1), c3 = cellAt(src, i0 + 1, j0 + 1);
    if (c0 === c1 && c1 === c2 && c2 === c3) return WARP[c0] ? c0 : t0;
    const w0 = (1 - ax) * (1 - ay), w1 = ax * (1 - ay), w2 = (1 - ax) * ay, w3 = ax * ay;
    const jj = (jit.get(wx, wy) - 0.5) * 0.22;
    let best = t0, bestS = -9;
    const cs = [c0, c1, c2, c3], ws = [w0, w1, w2, w3];
    for (let q = 0; q < 4; q++) {
      const t = cs[q];
      if (!WARP[t]) continue;
      let seen = false;
      for (let r = 0; r < q; r++) if (cs[r] === t) { seen = true; break; }
      if (seen) continue;
      let sc = 0;
      for (let r = q; r < 4; r++) if (cs[r] === t) sc += ws[r];
      sc += (typeNoise(t, px, py) - 0.5) * 0.55 + (t === t0 ? jj : -jj);
      if (sc > bestS) { bestS = sc; best = t; }
    }
    return best;
  };
  const tt = new Uint8Array(W * W);
  for (let j = 0; j < W; j++) {
    const wy = (gy0 + j + 0.5) * inv;
    for (let i = 0; i < W; i++) tt[j * W + i] = smoothType((gx0 + i + 0.5) * inv, wy);
  }

  // ---- the materials this chunk needs ----
  const used = new Set<number>();
  for (let k = 0; k < tt.length; k++) used.add(tt[k]);
  const need = new Set<MatName>();
  for (const t of used) for (const n of MATS_FOR[t] || []) {
    // indoors: warm slabs underfoot and on the wall tops, walls without moss
    if (!src.outdoor && n === 'flag') need.add('flagwarm');
    else if (!src.outdoor && n === 'stoneFace') need.add('stoneFaceIn');
    else need.add(n);
  }
  if (!src.outdoor) need.add('flagwarm');
  const tx = {} as Record<MatName, MatTex>;
  for (const n of need) tx[n] = tex.get(n);

  // ---- vertical distance scans (texels) ----
  // dS: nearest texel below with a lower height class; dN: nearest texel above with a higher one
  // dNL: nearest texel above with a lower one (water above land)
  const dS = new Uint8Array(W * W).fill(255);
  const dN = new Uint8Array(W * W).fill(255);
  const dNL = new Uint8Array(W * W).fill(255);
  const last = new Int32Array(4);
  for (let i = 0; i < W; i++) {
    last.fill(-100000);
    for (let j = W - 1; j >= 0; j--) {
      const h = HT[tt[j * W + i]];
      let best = 100000;
      for (let L = 0; L < h; L++) if (last[L] > -100000) best = Math.min(best, last[L] - j);
      dS[j * W + i] = best > 255 ? 255 : best;
      last[h] = j;
    }
    last.fill(-100000);
    for (let j = 0; j < W; j++) {
      const h = HT[tt[j * W + i]];
      let hi = 100000, lo = 100000;
      for (let L = h + 1; L < 4; L++) if (last[L] > -100000) hi = Math.min(hi, j - last[L]);
      for (let L = 0; L < h; L++) if (last[L] > -100000) lo = Math.min(lo, j - last[L]);
      dN[j * W + i] = hi > 255 ? 255 : hi;
      dNL[j * W + i] = lo > 255 ? 255 : lo;
      last[h] = j;
    }
  }

  // ---- water depth: coarse distance-to-shore field ----
  let depth: Grid | null = null;
  const anyWater = tt.some((t) => HT[t] === 0);
  if (anyWater) {
    const step = 2, mar = 28;
    const gxw = wx0 - mar, gyw = wy0 - mar;
    const cols = Math.ceil((span + mar * 2) / step) + 1;
    const dist = new Float32Array(cols * cols);
    const isW = (x: number, y: number) => HT[smoothType(x, y)] === 0;
    for (let j = 0; j < cols; j++) for (let i = 0; i < cols; i++) dist[j * cols + i] = isW(gxw + i * step, gyw + j * step) ? 1e6 : 0;
    const D1 = step, D2 = step * 1.414;
    for (let j = 0; j < cols; j++) for (let i = 0; i < cols; i++) {
      const k = j * cols + i;
      let v = dist[k];
      if (v === 0) continue;
      if (i > 0) v = Math.min(v, dist[k - 1] + D1);
      if (j > 0) { v = Math.min(v, dist[k - cols] + D1); if (i > 0) v = Math.min(v, dist[k - cols - 1] + D2); if (i < cols - 1) v = Math.min(v, dist[k - cols + 1] + D2); }
      dist[k] = v;
    }
    for (let j = cols - 1; j >= 0; j--) for (let i = cols - 1; i >= 0; i--) {
      const k = j * cols + i;
      let v = dist[k];
      if (v === 0) continue;
      if (i < cols - 1) v = Math.min(v, dist[k + 1] + D1);
      if (j < cols - 1) { v = Math.min(v, dist[k + cols] + D1); if (i < cols - 1) v = Math.min(v, dist[k + cols + 1] + D2); if (i > 0) v = Math.min(v, dist[k + cols - 1] + D2); }
      dist[k] = v;
    }
    for (let k = 0; k < dist.length; k++) if (dist[k] > 1e5) dist[k] = 60;
    depth = new Grid(gxw, gyw, span + mar * 2, span + mar * 2, step, (x, y) => {
      const i = Math.round((x - gxw) / step), j = Math.round((y - gyw) / step);
      if (i < 0 || j < 0 || i >= cols || j >= cols) return 60;
      return dist[j * cols + i];
    });
  }

  // ---- broad variation ----
  const lowA = new Grid(wx0, wy0, span, span, 8, (x, y) => valueNoise(x * 0.016, y * 0.016, seed + 31) * 0.65 + valueNoise(x * 0.05, y * 0.05, seed + 33) * 0.35);
  const lowB = new Grid(wx0, wy0, span, span, 4, (x, y) => valueNoise(x * 0.07, y * 0.07, seed + 35));

  // wall modes per cell (cached)
  const wm = new Map<number, number>();
  const wallModeC = (cx: number, cy: number) => {
    const k = cy * 100000 + cx;
    let v = wm.get(k);
    if (v === undefined) { v = wallMode(src, cx, cy); wm.set(k, v); }
    return v;
  };

  const face = Math.max(2, Math.round(1.5 * tr));
  const lip = Math.round(2.6 * tr);
  const shadowLen = 3.2 * tr;
  const bankFace = Math.max(2, Math.round(1.9 * tr));
  const bankShadow = 3 * tr;
  const flagTex = src.outdoor ? tx.flag : tx.flagwarm;

  for (let j = 0; j < N; j++) {
    const J = j + M;
    const gy = gy0 + J;
    const wy = (gy + 0.5) * inv;
    const cy = Math.floor(wy / TS);
    const ly = wy - cy * TS;
    for (let i = 0; i < N; i++) {
      const I = i + M;
      const k = J * W + I;
      const t = tt[k];
      const gx = gx0 + I;
      const wx = (gx + 0.5) * inv;
      let c: number;
      let natural = true;
      switch (t) {
        case T.GRASS: {
          const n = lowA.get(wx, wy);
          const m = n < 0.38 ? 0 : n > 0.62 ? 1 : (n - 0.38) / 0.24;
          const a = samp(tx.grass, gx, gy);
          c = m <= 0 ? a : lerpC(a, samp(tx.grass2, gx + 131, gy + 57), m);
          break;
        }
        case T.MEADOW: {
          const n = lowB.get(wx, wy);
          c = n < 0.7 ? samp(tx.meadow, gx, gy) : lerpC(samp(tx.meadow, gx, gy), samp(tx.grass, gx + 77, gy + 19), Math.min(1, (n - 0.7) * 3));
          break;
        }
        case T.FOREST: {
          const n = lowB.get(wx, wy);
          c = n > 0.72 ? lerpC(samp(tx.forest, gx, gy), samp(tx.grass, gx, gy), Math.min(0.7, (n - 0.72) * 3)) : samp(tx.forest, gx, gy);
          break;
        }
        case T.DIRT: c = samp(tx.dirt, gx, gy); break;
        case T.ROAD: {
          const n = lowB.get(wx, wy);
          c = n < 0.3 ? lerpC(samp(tx.road, gx, gy), samp(tx.dirt, gx, gy), (0.3 - n) * 2) : samp(tx.road, gx, gy);
          break;
        }
        case T.SAND: c = samp(tx.sand, gx, gy); break;
        case T.MUD: c = samp(tx.mud, gx, gy); break;
        case T.ASH: c = samp(tx.ash, gx, gy); break;
        case T.GRAVEL: c = samp(tx.gravel, gx, gy); break;
        case T.FIELD: c = samp(tx.field, gx, gy); break;
        case T.VEG: c = samp(tx.veg, gx, gy); break;
        case T.WHEAT: c = samp(tx.wheat, gx, gy); break;
        case T.BURNT_WHEAT: c = samp(tx.burnt, gx, gy); break;
        case T.COBBLE: c = samp(tx.cobble, gx, gy); natural = false; break;
        case T.FLAGSTONE: c = samp(flagTex, gx, gy); natural = false; break;
        case T.WOOD: c = samp(tx.wood, gx, gy); natural = false; break;
        case T.STRAW: c = samp(tx.straw, gx, gy); natural = false; break;
        case T.BRIDGE: case T.BRIDGE_V: {
          natural = false;
          // deck planks laid across the way, a side timber with posts along
          // each open edge, and the near timber's shadow on the deck
          const horiz = t === T.BRIDGE;
          c = horiz ? sampT(tx.bridge, gx, gy) : samp(tx.bridge, gx, gy);
          const cx = Math.floor(wx / TS);
          const lx = wx - cx * TS;
          const isB = (n: number) => n === T.BRIDGE || n === T.BRIDGE_V;
          const across = horiz ? ly : lx, along = horiz ? wx : wy;
          const openLo = !isB(horiz ? cellAt(src, cx, cy - 1) : cellAt(src, cx - 1, cy));
          const openHi = !isB(horiz ? cellAt(src, cx, cy + 1) : cellAt(src, cx + 1, cy));
          const bw = 2.4;
          const e = openLo && across < bw ? across : openHi && across > TS - bw ? TS - across : -1;
          if (e >= 0) {
            const post = (((along % 11) + 11) % 11) < 2.4;
            const f = e / bw;
            c = post ? lerpC(C.postLit, C.postD, f * 0.7) : lerpC(C.beamLit, C.beamD, Math.min(1, Math.abs(f - 0.4) * 1.6));
            if (e < 0.35 || e > bw - 0.3) c = C.beamLine;
          } else if (openLo && across < bw + 1) c = shadeC(c, 0.72 + 0.28 * (across - bw));
          break;
        }
        case T.CARPET: {
          natural = false;
          const cx = Math.floor(wx / TS);
          const lx = wx - cx * TS;
          const eL = lx < 2.6 && cellAt(src, cx - 1, cy) !== T.CARPET;
          const eR = lx > TS - 2.6 && cellAt(src, cx + 1, cy) !== T.CARPET;
          const eU = ly < 2.6 && cellAt(src, cx, cy - 1) !== T.CARPET;
          const eD = ly > TS - 2.6 && cellAt(src, cx, cy + 1) !== T.CARPET;
          if (eL || eR || eU || eD) {
            const d = Math.min(eL ? lx : 9, eR ? TS - lx : 9, eU ? ly : 9, eD ? TS - ly : 9);
            c = d < 0.5 ? C.carpetEdge : d < 1.1 ? C.goldL : d < 2 ? (((gx + gy) >> 1) & 1 ? C.gold : C.goldD) : C.carpetEdge;
          } else c = samp(tx.carpet, gx, gy);
          break;
        }
        case T.WATER: case T.DEEP: case T.FORD: {
          natural = false;
          const d = depth ? depth.get(wx, wy) : 12;
          const deepT = t === T.DEEP;
          let base: number;
          const dd = Math.min(1, d / 22);
          base = dd < 0.5 ? lerpC(C.shallow, C.mid, dd * 2) : lerpC(C.mid, deepT ? C.deeper : C.deep, (dd - 0.5) * 2);
          if (t === T.FORD) base = C.shallow;
          // the bed shows through in the shallows
          const show = t === T.FORD ? 0.55 : Math.max(0, 0.62 - d / 9);
          if (show > 0) base = lerpC(base, lerpC(samp(tx.riverbed, gx, gy), C.shallow, 0.35), show);
          // soft sky sheen
          const sh = lowB.get(wx, wy);
          if (sh > 0.62) base = lerpC(base, C.sky, (sh - 0.62) * 0.35);
          c = base;
          // north bank: the earth face above the water, then its shadow
          const dn = dN[k];
          if (dn <= bankFace) {
            const above = tt[(J - dn) * W + I];
            const f = (dn - 1) / Math.max(1, bankFace - 1);
            if (above === T.BRIDGE || above === T.BRIDGE_V) c = lerpC(C.bridgeBeam, C.bridgeBeamD, f);
            else c = lerpC(C.bankTop, C.bankBot, f);
            if (dn === bankFace) c = lerpC(c, C.foam, 0.35);
          } else if (dn <= bankFace + bankShadow) {
            c = shadeC(c, 0.62 + 0.38 * ((dn - bankFace) / bankShadow));
          }
          // foam along the other banks
          let near = 99;
          const rr = Math.ceil(0.9 * tr);
          for (let r = 1; r <= rr && near === 99; r++) {
            if (HT[tt[k + r]] > 0 || HT[tt[k - r]] > 0 || HT[tt[k + r * W]] > 0) near = r;
          }
          if (near !== 99 && dn > bankFace) c = lerpC(c, C.foam, 0.55 * (1 - (near - 1) / rr));
          break;
        }
        case T.ROCK: case T.WALL_STONE: case T.WALL_PLASTER: case T.WALL_WOOD: case T.WALL_CAVE: {
          natural = false;
          const cx = Math.floor(wx / TS);
          const lx = wx - cx * TS;
          const mode = wallModeC(cx, cy);
          if (mode === 1) {
            // top surface
            let base: number;
            if (t === T.WALL_STONE && !src.outdoor) {
              // the dark coping of an inside wall, lit along the room side
              base = lerpC(shadeC(samp(tx.flagwarm, gx, gy), 0.55), C.capIn, 0.6);
              const room = (dx: number, dy: number) => { const n = cellAt(src, cx + dx, cy + dy); return !WALL[n] && n !== T.WALL_DARK; };
              if ((room(1, 0) && lx > TS - 1.1) || (room(-1, 0) && lx < 1.1) || (room(0, 1) && ly > TS - 1.1)) base = lerpC(base, C.capEdge, 0.55);
              c = base;
              break;
            } else if (t === T.WALL_STONE) {
              base = samp(tx.flag, gx, gy);
              if (wallModeC(cx, cy + 1) >= 2 && ly >= 11) {
                // parapet along the outer edge
                const m = Math.floor(wx / 5) % 2 === 0;
                base = m ? (ly < 12.2 ? C.merlonLit : C.merlon) : (ly < 12.2 ? C.merlon : C.merlonGap);
              }
            } else if (t === T.ROCK) base = samp(tx.rockTop, gx, gy);
            else if (t === T.WALL_CAVE) base = samp(tx.caveTop, gx, gy);
            else base = samp(tx.beamTop, gx, gy);
            // rims where the top meets open ground
            const nOpen = !WALL[cellAt(src, cx, cy - 1)] && cellAt(src, cx, cy - 1) !== T.WALL_DARK;
            const wOpen = !WALL[cellAt(src, cx - 1, cy)] && cellAt(src, cx - 1, cy) !== T.WALL_DARK;
            const eOpen = !WALL[cellAt(src, cx + 1, cy)] && cellAt(src, cx + 1, cy) !== T.WALL_DARK;
            const sOpen = !WALL[cellAt(src, cx, cy + 1)] && cellAt(src, cx, cy + 1) !== T.WALL_DARK;
            const light = t === T.WALL_PLASTER || t === T.WALL_WOOD ? hexPack('#6a4c30') : lerpC(base, C.foam, 0.4);
            if ((nOpen && ly < 1) || (wOpen && lx < 1)) base = lerpC(base, light, 0.7);
            else if ((eOpen && lx > TS - 1) || (sOpen && ly > TS - 1)) base = shadeC(base, 0.55);
            else if ((nOpen && ly < 2) || (wOpen && lx < 2)) base = lerpC(base, light, 0.3);
            c = base;
          } else if (mode === 2 || mode === 3) {
            const H2 = wallFaceHeight(t) * TS;
            const fy = H2 === TS ? ly : mode === 3 ? ly : ly + TS;
            const fyT = Math.floor(fy * tr);
            if (t === T.ROCK) c = samp(tx.rockFace, gx, fyT);
            else if (t === T.WALL_CAVE) c = samp(tx.caveFace, gx, fyT);
            else if (t === T.WALL_STONE) c = samp(src.outdoor ? tx.stoneFace : tx.stoneFaceIn, gx, fyT);
            else if (t === T.WALL_WOOD) c = samp(tx.logFace, gx, fyT);
            else c = samp(tx.plasterFace, gx, fyT);
            // ends of a wall run are shaded like corners
            const wEnd = !WALL[cellAt(src, cx - 1, cy)], eEnd = !WALL[cellAt(src, cx + 1, cy)];
            if (wEnd && lx < 1.2) c = lerpC(c, C.foam, 0.18);
            if (eEnd && lx > TS - 1.6) c = shadeC(c, 0.6);
          } else c = C.void;
          break;
        }
        default:
          natural = false;
          c = C.void;
      }

      // broad natural variation
      if (natural) {
        const n = lowA.get(wx, wy);
        const f = 0.95 + n * 0.1;
        c = pack(R(c) * f + (n - 0.5) * 14, Gc(c) * f + (n - 0.5) * 4, B(c) * f - (n - 0.5) * 10);
      }

      // raised turf, banks and cast shadows
      const h = HT[t];
      if (h === 2) {
        const ds = dS[k];
        if (ds <= face) {
          // the turf's own little cut face, grass hanging over its top
          const f = (ds - 1) / Math.max(1, face - 1);
          const hang = hash2(gx, 7, seed) < 0.45 && f > 0.4;
          if (!hang) c = lerpC(C.soilFace, C.soilFaceLit, f * 0.8);
          else c = mulC(c, 0.62);
        } else if (ds <= face + lip) {
          c = mulC(c, 0.8 + 0.2 * ((ds - face) / lip));
        }
        const dn = dN[k];
        const dnl = dNL[k];
        if (dnl <= tr * 0.8 && dn === 255) c = pack(R(c) * 1.1 + 6, Gc(c) * 1.1 + 6, B(c) * 1.05);
      } else if (h === 1) {
        const dn = dN[k];
        if (dn <= shadowLen) {
          const above = tt[(J - dn) * W + I];
          if (HT[above] === 2) c = shadeC(c, 0.64 + 0.36 * (dn / shadowLen));
        }
        const dnl = dNL[k];
        if (dnl <= tr * 1.4 && HT[tt[(J - dnl) * W + I]] === 0) c = lerpC(c, C.wet, 0.35 * (1 - dnl / (tr * 1.4)));
      }
      // contact shadow at the foot of walls and under the back wall indoors
      if (h < 3) {
        const cxw = Math.floor(wx / TS);
        const lx = wx - cxw * TS;
        const above = cellAt(src, cxw, cy - 1);
        let ao = 1;
        if (WALL[above] || above === T.WALL_DARK) {
          const reach = src.outdoor ? 5 : 7;
          if (ly < reach) ao = Math.min(ao, 0.5 + 0.5 * (ly / reach));
        }
        if (!src.outdoor) {
          const wl = cellAt(src, cxw - 1, cy), wr = cellAt(src, cxw + 1, cy);
          if ((WALL[wl] || wl === T.WALL_DARK) && lx < 4) ao = Math.min(ao, 0.62 + 0.38 * (lx / 4));
          if ((WALL[wr] || wr === T.WALL_DARK) && lx > TS - 4) ao = Math.min(ao, 0.62 + 0.38 * ((TS - lx) / 4));
          const bl = cellAt(src, cxw, cy + 1);
          if ((WALL[bl] || bl === T.WALL_DARK) && ly > TS - 3) ao = Math.min(ao, 0.75 + 0.25 * ((TS - ly) / 3));
        }
        if (ao < 1) c = shadeC(c, ao);
      }
      out[j * N + i] = c;
    }
  }
}

export function groundSize(tr: number) { return PX * tr + 2; }
