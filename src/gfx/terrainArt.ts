// Per-pixel ground rendering. Terrain borders are domain-warped so that grass,
// dirt, roads and water meet in organic, hand-drawn-looking edges. Walls are
// auto-tiled into "top" and "face" cells for the 3/4 perspective.

import { T, tdef } from '../world/terrain';
import { pack } from './pixel';
import { P } from './palette';
import { hash2, hash2i, valueNoise } from '../engine/util';

export const CHUNK = 16; // tiles per chunk side
export const TS = 16;

export interface GroundSource {
  w: number; // full map width in tiles
  h: number;
  ground: Uint8Array; // either the full map, or a window starting at (ox, oy) of size gw x gh
  seed: number;
  outdoor: boolean;
  ox?: number;
  oy?: number;
  gw?: number;
  gh?: number;
}

const C = (hex: string) => pack(hex);
const pal = {
  grass: [C(P.grass0), C(P.grass1), C(P.grass2), C(P.grass3), C(P.grass4), C(P.grass5)],
  forest: [C(P.forest0), C(P.forest1), C(P.forest2), C(P.forest3)],
  dirt: [C(P.dirt0), C(P.dirt1), C(P.dirt2), C(P.dirt3), C(P.dirt4)],
  road: [C(P.road0), C(P.road1), C(P.road2), C(P.road3), C(P.road4)],
  sand: [C(P.sand0), C(P.sand1), C(P.sand2), C(P.sand3)],
  mud: [C(P.mud0), C(P.mud1), C(P.mud2)],
  stone: [C(P.stone0), C(P.stone1), C(P.stone2), C(P.stone3), C(P.stone4), C(P.stone5)],
  water: [C(P.water0), C(P.water1), C(P.water2), C(P.water3), C(P.water4), C(P.foam)],
  wood: [C(P.wood0), C(P.wood1), C(P.wood2), C(P.wood3), C(P.wood4), C(P.wood5)],
  thatch: [C(P.thatch0), C(P.thatch1), C(P.thatch2), C(P.thatch3), C(P.thatch4)],
  ash: [C(P.ash0), C(P.ash1), C(P.ash2), C(P.ash3)],
  wheat: [C(P.wheat0), C(P.wheat1), C(P.wheat2), C(P.wheat3)],
  leaf: [C(P.leaf0), C(P.leaf1), C(P.leaf2), C(P.leaf3), C(P.leaf4), C(P.leaf5)],
  plaster: [C(P.plaster0), C(P.plaster1), C(P.plaster2), C(P.plaster3), C(P.plaster4)],
  timber: C(P.timber),
  ember: C(P.ember), ember2: C(P.ember2),
  carpet: [C('#4a1616'), C('#6e1f1f'), C('#8a2a26'), C('#a23a2e')],
  gold: [C(P.gold1), C(P.gold2), C(P.gold3)],
  flowers: [C('#f4e9a0'), C('#f2f0e6'), C('#b89ad8'), C('#7fa8e0'), C('#e8a0a8'), C('#f0c060')],
  flowerCenter: C('#d8a030'),
  black: C('#0b0807'),
  moss: [C('#3d5a2a'), C('#4d6d32')],
  cave: [C('#1e1a18'), C('#2c2622'), C('#3a332d'), C('#4a423a')],
};

function darken(v: number, f: number): number {
  const a = (v >>> 24) & 255;
  const b = ((v >>> 16) & 255) * f;
  const g = ((v >>> 8) & 255) * f;
  const r = (v & 255) * f;
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/** Lazily evaluated, bilinearly interpolated noise over a region: far fewer noise calls. */
class NoiseGrid {
  private vals: Float32Array;
  private cols: number;
  constructor(private x0: number, private y0: number, w: number, h: number, private step: number, private fn: (x: number, y: number) => number) {
    this.cols = Math.ceil(w / step) + 2;
    const rows = Math.ceil(h / step) + 2;
    this.vals = new Float32Array(this.cols * rows).fill(NaN);
  }
  private at(i: number, j: number): number {
    const k = j * this.cols + i;
    let v = this.vals[k];
    if (v !== v) { v = this.fn(this.x0 + i * this.step, this.y0 + j * this.step); this.vals[k] = v; }
    return v;
  }
  get(x: number, y: number): number {
    const fx = (x - this.x0) / this.step, fy = (y - this.y0) / this.step;
    const i = Math.floor(fx), j = Math.floor(fy);
    const tx = fx - i, ty = fy - j;
    const a = this.at(i, j), b = this.at(i + 1, j), c = this.at(i, j + 1), d = this.at(i + 1, j + 1);
    return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
  }
}

const WARP = new Uint8Array(64);
for (let i = 0; i < 64; i++) WARP[i] = tdef(i).warp ? 1 : 0;

const isGrassy = (t: number) => t === T.GRASS || t === T.FOREST || t === T.MEADOW || t === T.WHEAT;
const isLow = (t: number) => t === T.DIRT || t === T.ROAD || t === T.FIELD || t === T.SAND || t === T.MUD || t === T.ASH || t === T.VEG || t === T.GRAVEL || t === T.BURNT_WHEAT;
const isWaterT = (t: number) => t === T.WATER || t === T.DEEP || t === T.FORD;
const wallFaceHeight = (t: number) => (t === T.ROCK ? 1 : t === T.WALL_DARK ? 0 : 2);

function cellAt(src: GroundSource, cx: number, cy: number): number {
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

/** Wall display mode for a cell: 0 none, 1 top, 2 lower face, 3 upper face. */
export function wallMode(src: GroundSource, cx: number, cy: number): number {
  const t = cellAt(src, cx, cy);
  const d = tdef(t);
  if (!d.wall) return 0;
  const h = wallFaceHeight(t);
  if (h === 0) return 1;
  const s1 = cellAt(src, cx, cy + 1);
  if (!tdef(s1).wall) return 2;
  if (h >= 2 && s1 === t) {
    const s2 = cellAt(src, cx, cy + 2);
    if (!tdef(s2).wall) return 3;
  }
  return 1;
}

export function renderChunkPixels(src: GroundSource, ccx: number, ccy: number, out: Uint32Array) {
  const M = 6;
  const PW = CHUNK * TS;
  const W = PW + M * 2;
  const baseX = ccx * PW - M, baseY = ccy * PW - M;
  const seed = src.seed;
  // 1. warped terrain per pixel (with margin for edge effects)
  const tt = new Uint8Array(W * W);
  const gwx = new NoiseGrid(baseX, baseY, W, W, 2, (x, y) => valueNoise(x * 0.14, y * 0.14, seed));
  const gwy = new NoiseGrid(baseX, baseY, W, W, 2, (x, y) => valueNoise(x * 0.14 + 31.7, y * 0.14 + 11.3, seed + 9));
  const cx0 = ccx * PW, cy0 = ccy * PW;
  const g045 = new NoiseGrid(cx0, cy0, PW, PW, 4, (x, y) => valueNoise(x * 0.045, y * 0.045, seed + 3));
  const g20 = new NoiseGrid(cx0, cy0, PW, PW, 2, (x, y) => valueNoise(x * 0.2, y * 0.2, seed + 5));
  const nf = new Map<number, NoiseGrid>();
  const noiseF = (freq: number, sd: number, x: number, y: number) => {
    const key = sd * 1000 + Math.round(freq * 1000);
    let g = nf.get(key);
    if (!g) { g = new NoiseGrid(cx0, cy0, PW, PW, freq >= 0.2 ? 2 : 4, (xx, yy) => valueNoise(xx * freq, yy * freq, sd)); nf.set(key, g); }
    return g.get(x, y);
  };
  for (let py = 0; py < W; py++) {
    const wy = baseY + py;
    for (let px = 0; px < W; px++) {
      const wx = baseX + px;
      const cx = Math.floor(wx / TS), cy = Math.floor(wy / TS);
      const t0 = cellAt(src, cx, cy);
      if (!WARP[t0]) { tt[py * W + px] = t0; continue; }
      const ox = (gwx.get(wx, wy) - 0.5) * 8;
      const oy = (gwy.get(wx, wy) - 0.5) * 8;
      const t1 = cellAt(src, Math.floor((wx + ox) / TS), Math.floor((wy + oy) / TS));
      tt[py * W + px] = WARP[t1] ? t1 : t0;
    }
  }
  const at = (px: number, py: number) => tt[(py + M) * W + (px + M)];

  // wall modes for cells in chunk (+1 margin)
  const wm = new Map<number, number>();
  const wallModeC = (cx: number, cy: number) => {
    const k = cy * 100000 + cx;
    let v = wm.get(k);
    if (v === undefined) { v = wallMode(src, cx, cy); wm.set(k, v); }
    return v;
  };

  for (let py = 0; py < PW; py++) {
    const wy = ccy * PW + py;
    for (let px = 0; px < PW; px++) {
      const wx = ccx * PW + px;
      const t = at(px, py);
      let c = 0;
      const h = hash2(wx, wy, seed);
      switch (t) {
        case T.GRASS: case T.MEADOW: case T.FOREST: {
          const forest = t === T.FOREST;
          const n = g045.get(wx, wy);
          const n2 = g20.get(wx, wy);
          const G = forest ? pal.forest : pal.grass;
          let i = forest ? (n < 0.35 ? 1 : n < 0.7 ? 2 : 1) : (n < 0.3 ? 2 : n < 0.72 ? 3 : 2);
          if (!forest && n2 > 0.72) i++;
          if (n2 < 0.18) i--;
          c = G[Math.max(0, Math.min(G.length - 1, i))];
          // blades
          const b0 = hash2(wx, wy, seed + 11) < 0.06;
          const b1 = hash2(wx, wy - 1, seed + 11) < 0.06;
          const b2 = hash2(wx, wy - 2, seed + 11) < 0.06;
          if (b0) c = G[Math.min(G.length - 1, i + 2)];
          else if (b1) c = G[Math.min(G.length - 1, i + 1)];
          else if (b2) c = G[Math.max(0, i - 1)];
          if (forest && h < 0.08) c = h < 0.03 ? pal.dirt[3] : pal.dirt[2];
          if (forest && h > 0.985) c = pal.leaf[4];
          if (t === T.MEADOW || (!forest && n > 0.8)) {
            const fl = hash2i(wx >> 0, wy >> 0, seed + 21) % 1000;
            if (fl < 7) c = pal.flowerCenter;
            else {
              const nb = (hash2i(wx - 1, wy, seed + 21) % 1000 < 7) || (hash2i(wx + 1, wy, seed + 21) % 1000 < 7) || (hash2i(wx, wy - 1, seed + 21) % 1000 < 7) || (hash2i(wx, wy + 1, seed + 21) % 1000 < 7);
              if (nb) {
                const src2 = hash2i(wx - 1, wy, seed + 21) % 1000 < 7 ? [wx - 1, wy] : hash2i(wx + 1, wy, seed + 21) % 1000 < 7 ? [wx + 1, wy] : hash2i(wx, wy - 1, seed + 21) % 1000 < 7 ? [wx, wy - 1] : [wx, wy + 1];
                c = pal.flowers[hash2i(src2[0], src2[1], seed + 77) % pal.flowers.length];
              }
            }
          }
          // edge above lower terrain: darker lip
          const below = at(px, py + 1);
          if (isLow(below) || isWaterT(below)) c = darken(c, 0.72);
          break;
        }
        case T.WHEAT: case T.BURNT_WHEAT: {
          const burnt = t === T.BURNT_WHEAT;
          const W2 = burnt ? pal.ash : pal.wheat;
          const col = (wx + (hash2i(wx, 0, seed) % 2)) % 3;
          const row = (wy + (hash2i(wx, 1, seed) % 5)) % 6;
          let i = col === 0 ? 1 : 2;
          if (row === 0) i = 3;
          if (row === 1) i = 2;
          if (row === 5) i = 0;
          if (h < 0.05) i = 0;
          c = W2[Math.min(W2.length - 1, i)];
          if (burnt && h > 0.992) c = pal.ember;
          const below = at(px, py + 1);
          if (!isGrassy(below) && below !== T.BURNT_WHEAT) c = darken(c, 0.7);
          break;
        }
        case T.DIRT: case T.ROAD: case T.GRAVEL: {
          const R = t === T.ROAD ? pal.road : t === T.GRAVEL ? pal.stone : pal.dirt;
          const n = noiseF(0.09, seed + 7, wx, wy);
          let i = n < 0.35 ? 1 : n < 0.7 ? 2 : 3;
          if (t === T.GRAVEL) i = n < 0.4 ? 2 : 3;
          if (h < 0.1) i = Math.max(0, i - 1);
          else if (h > 0.93) i = Math.min(R.length - 1, i + 1);
          c = R[i];
          // pebbles
          if (hash2(wx, wy, seed + 31) < (t === T.GRAVEL ? 0.12 : 0.018)) c = t === T.ROAD ? pal.road[4] : pal.stone[4];
          else if (hash2(wx, wy - 1, seed + 31) < (t === T.GRAVEL ? 0.12 : 0.018)) c = R[0];
          // shadow under grass
          if (isGrassy(at(px, py - 1)) || isGrassy(at(px, py - 2))) c = darken(c, 0.78);
          break;
        }
        case T.FIELD: case T.VEG: {
          const r = ((wy % 4) + 4) % 4;
          const n = noiseF(0.1, seed + 13, wx, wy);
          c = r === 0 ? pal.dirt[0] : r === 1 ? pal.dirt[3] : (n < 0.5 ? pal.dirt[1] : pal.dirt[2]);
          if (h < 0.04) c = pal.grass[3];
          if (t === T.VEG) {
            const gx = ((wx % 8) + 8) % 8, gy = ((wy % 8) + 8) % 8;
            const dx = gx - 3.5, dy = gy - 3.5;
            const d = dx * dx + dy * dy;
            if (d < 7) c = d < 2 ? pal.leaf[5] : dx + dy > 1 ? pal.leaf[2] : pal.leaf[4];
          }
          if (isGrassy(at(px, py - 1))) c = darken(c, 0.78);
          break;
        }
        case T.SAND: {
          const n = noiseF(0.12, seed + 17, wx, wy);
          c = n < 0.4 ? pal.sand[1] : pal.sand[2];
          if (h < 0.05) c = pal.sand[0];
          if (h > 0.96) c = pal.sand[3];
          if (isGrassy(at(px, py - 1))) c = darken(c, 0.82);
          break;
        }
        case T.MUD: {
          const n = noiseF(0.15, seed + 19, wx, wy);
          c = n < 0.45 ? pal.mud[1] : pal.mud[2];
          if (n > 0.75 && h < 0.3) c = pal.water[2];
          if (h < 0.04) c = pal.mud[0];
          break;
        }
        case T.ASH: {
          const n = noiseF(0.08, seed + 23, wx, wy);
          c = n < 0.35 ? pal.ash[0] : n < 0.7 ? pal.ash[1] : pal.ash[2];
          if (h < 0.06) c = pal.ash[3];
          if (h > 0.994) c = pal.ember;
          else if (h > 0.99) c = pal.ember2;
          break;
        }
        case T.WATER: case T.DEEP: case T.FORD: {
          const n = noiseF(0.05, seed + 29, wx, wy);
          const deep = t === T.DEEP;
          const ford = t === T.FORD;
          let i = deep ? (n < 0.5 ? 0 : 1) : ford ? 3 : (n < 0.4 ? 1 : n < 0.8 ? 2 : 3);
          // proximity to land -> shallows and foam
          let near = 9;
          for (let r = 1; r <= 4 && near === 9; r++) {
            if (!isWaterT(at(px + r, py)) || !isWaterT(at(px - r, py)) || !isWaterT(at(px, py + r)) || !isWaterT(at(px, py - r))) near = r;
          }
          if (near <= 1) i = 5;
          else if (near <= 2) i = 4;
          else if (near <= 4 && !deep) i = Math.max(i, 3);
          c = pal.water[i];
          // bank shadow on the far side
          if (!isWaterT(at(px, py - 1)) || !isWaterT(at(px, py - 2))) c = pal.water[deep ? 0 : 1];
          if (ford && h < 0.08) c = pal.sand[0];
          if (i < 4 && hash2(wx >> 2, wy, seed + 41) < 0.03 && (wx & 3) !== 3) c = pal.water[Math.min(4, i + 1)];
          break;
        }
        case T.COBBLE: case T.FLAGSTONE: {
          const big = t === T.FLAGSTONE;
          const sh = big ? 8 : 4, sw = big ? 10 : 5;
          const row = Math.floor(wy / sh);
          const off = (row & 1) * (sw >> 1) + (hash2i(row, 7, seed) % 3);
          const col = Math.floor((wx + off) / sw);
          const lx = ((wx + off) % sw + sw) % sw, ly = ((wy % sh) + sh) % sh;
          const sv = hash2(col, row, seed + 51);
          const S = pal.stone;
          let i = sv < 0.3 ? 2 : sv < 0.75 ? 3 : 4;
          if (lx === 0 || ly === 0) c = S[1];
          else if (ly === 1 && lx < sw - 1) c = S[Math.min(5, i + 1)];
          else if (ly === sh - 1 || lx === sw - 1) c = S[i - 1];
          else c = S[i];
          if (!big && sv > 0.9 && !(lx === 0 || ly === 0)) c = darken(pal.road[3], 1);
          if (h < 0.03) c = S[1];
          break;
        }
        case T.WOOD: case T.BRIDGE: case T.BRIDGE_V: {
          const vert = t === T.BRIDGE;
          const a = vert ? wx : wy, b = vert ? wy : wx;
          const plank = Math.floor(a / 4);
          const la = ((a % 4) + 4) % 4;
          const off = hash2i(plank, 3, seed) % 24;
          const joint = ((b + off) % 24 + 24) % 24 === 0;
          const n = valueNoise(b * 0.25, plank * 3.1, seed + 61);
          let i = n < 0.4 ? 2 : n < 0.8 ? 3 : 4;
          if (hash2(plank, Math.floor((b + off) / 24), seed) < 0.3) i--;
          c = la === 3 || joint ? pal.wood[1] : la === 0 ? pal.wood[Math.min(5, i + 1)] : pal.wood[i];
          if (h < 0.01) c = pal.wood[1];
          break;
        }
        case T.STRAW: {
          const n = noiseF(0.12, seed + 67, wx, wy);
          c = n < 0.5 ? pal.dirt[2] : pal.dirt[3];
          const s0 = hash2(wx, wy, seed + 71) < 0.12, s1 = hash2(wx - 1, wy - 1, seed + 71) < 0.12;
          if (s0) c = pal.thatch[3]; else if (s1) c = pal.thatch[2];
          break;
        }
        case T.CARPET: {
          const lx = ((wx % TS) + TS) % TS, ly = ((wy % TS) + TS) % TS;
          const cx = Math.floor(wx / TS), cy = Math.floor(wy / TS);
          const edgeL = cellAt(src, cx - 1, cy) !== T.CARPET && lx < 3;
          const edgeR = cellAt(src, cx + 1, cy) !== T.CARPET && lx > 12;
          const edgeU = cellAt(src, cx, cy - 1) !== T.CARPET && ly < 3;
          const edgeD = cellAt(src, cx, cy + 1) !== T.CARPET && ly > 12;
          if (edgeL || edgeR || edgeU || edgeD) c = ((lx + ly) & 1) ? pal.gold[1] : pal.gold[0];
          else c = ((lx >> 2) + (ly >> 2)) % 2 ? pal.carpet[2] : pal.carpet[1];
          if (!(edgeL || edgeR || edgeU || edgeD) && lx % 8 === 4 && ly % 8 === 4) c = pal.gold[2];
          break;
        }
        case T.ROCK: case T.WALL_STONE: case T.WALL_PLASTER: case T.WALL_WOOD: case T.WALL_CAVE: case T.WALL_DARK: {
          const cx = Math.floor(wx / TS), cy = Math.floor(wy / TS);
          const mode = wallModeC(cx, cy);
          const lx = ((wx % TS) + TS) % TS, ly = ((wy % TS) + TS) % TS;
          c = wallPixel(src, t, mode, wx, wy, lx, ly, cx, cy, seed, wallModeC);
          break;
        }
        default:
          c = pal.black;
      }
      out[py * PW + px] = c;
    }
  }
}

function wallPixel(src: GroundSource, t: number, mode: number, wx: number, wy: number, lx: number, ly: number, cx: number, cy: number, seed: number,
  wallModeC: (cx: number, cy: number) => number): number {
  const h = hash2(wx, wy, seed + 5);
  if (t === T.WALL_DARK) return pal.black;
  const northOpen = !tdef(cellAt(src, cx, cy - 1)).wall;
  const westOpen = !tdef(cellAt(src, cx - 1, cy)).wall;
  const eastOpen = !tdef(cellAt(src, cx + 1, cy)).wall;
  if (mode === 1) {
    // top surface
    let c: number;
    if (t === T.WALL_STONE) {
      const S = pal.stone;
      const n = valueNoise(wx * 0.2, wy * 0.2, seed + 81);
      c = n < 0.5 ? S[1] : S[2];
      if ((wx % 8 === 0) || (wy % 8 === 0)) c = S[0];
      // parapet merlons along the south edge
      if (wallModeC(cx, cy + 1) >= 2 && ly >= 12) {
        const m = Math.floor(wx / 4) % 2 === 0;
        c = m ? (ly === 12 ? S[4] : S[3]) : S[0];
      }
    } else if (t === T.ROCK || t === T.WALL_CAVE) {
      const R = t === T.ROCK ? pal.stone : pal.cave;
      const n = valueNoise(wx * 0.07, wy * 0.07, seed + 83);
      const n2 = valueNoise(wx * 0.25, wy * 0.25, seed + 85);
      let i = n < 0.3 ? 1 : n < 0.65 ? 2 : 3;
      if (n2 > 0.75) i++;
      if (n2 < 0.2) i--;
      c = R[Math.max(0, Math.min(R.length - 1, i))];
      if (t === T.ROCK && n > 0.6 && h < 0.25) c = pal.moss[h < 0.12 ? 0 : 1];
    } else if (t === T.WALL_WOOD) {
      c = (ly % 5 === 0) ? pal.wood[0] : pal.wood[1];
    } else {
      c = pal.timber;
      if (h < 0.1) c = darken(pal.timber, 0.85);
    }
    // rim light on open edges
    if ((northOpen && ly === 0) || (westOpen && lx === 0) || (eastOpen && lx === 15)) c = darken(c, t === T.WALL_PLASTER ? 1.6 : 1.25);
    return c;
  }
  // faces
  const faceY = mode === 3 ? ly : ly + TS; // 0..31 across upper+lower face
  const H2 = wallFaceHeight(t) * TS;
  const fy = wallFaceHeight(t) === 1 ? ly : faceY;
  if (t === T.WALL_STONE || t === T.ROCK || t === T.WALL_CAVE) {
    if (t === T.ROCK || t === T.WALL_CAVE) {
      // cliff face: vertical striations
      const R = t === T.ROCK ? pal.stone : pal.cave;
      const n = valueNoise(wx * 0.3, wy * 0.05, seed + 87);
      let i = n < 0.3 ? 1 : n < 0.6 ? 2 : 3;
      if (fy >= H2 - 3) i = 0;
      if (fy < 2) i = 4 > R.length - 1 ? R.length - 1 : 4;
      return R[Math.max(0, Math.min(R.length - 1, i))];
    }
    const S = pal.stone;
    const bh = 6, bw = 10;
    const row = Math.floor(fy / bh);
    const off = (row & 1) * 5;
    const col = Math.floor((wx + off) / bw);
    const bx = ((wx + off) % bw + bw) % bw, by = fy % bh;
    const sv = hash2(col, row + cy * 7, seed + 91);
    let i = sv < 0.35 ? 2 : sv < 0.8 ? 3 : 4;
    let c = S[i];
    if (bx === 0 || by === 0) c = S[0];
    else if (by === 1) c = S[Math.min(5, i + 1)];
    else if (by === bh - 1) c = S[i - 1];
    if (fy >= H2 - 3) c = h < 0.5 ? pal.moss[0] : darken(S[1], 0.9);
    if (fy === 0) c = S[5];
    return c;
  }
  if (t === T.WALL_PLASTER) {
    const Pl = pal.plaster;
    let c = h < 0.5 ? Pl[3] : Pl[2];
    if (h < 0.04) c = Pl[1];
    // timber framing: posts every 16px, beams top and mid
    const post = ((wx % 32) + 32) % 32;
    if (post < 2) c = post === 0 ? pal.timber : darken(pal.timber, 1.3);
    if (fy < 3) c = fy === 2 ? darken(pal.timber, 0.8) : pal.timber;
    if (fy === 14 || fy === 15) c = pal.timber;
    // baseboard
    if (fy >= H2 - 3) c = fy === H2 - 3 ? pal.wood[3] : pal.wood[1];
    // diagonal brace in some panels
    const panel = Math.floor(wx / 32);
    if (hash2(panel, cy, seed) < 0.35 && fy > 15 && fy < H2 - 3) {
      const d = (post - 2) - (fy - 16) * 1.6;
      if (Math.abs(d) < 1.2) c = pal.timber;
    }
    return c;
  }
  // log wall
  const W = pal.wood;
  const log = Math.floor(fy / 5);
  const ly2 = fy % 5;
  let c = ly2 === 0 ? W[1] : ly2 === 1 ? W[4] : ly2 === 4 ? W[1] : W[3];
  if (hash2(Math.floor(wx / 3), log, seed) < 0.2 && ly2 > 1 && ly2 < 4) c = W[2];
  if (fy >= H2 - 2) c = W[0];
  return c;
}

/** Glinting water overlay drawn every frame for visible water tiles. */
export function drawWaterGlints(ctx: CanvasRenderingContext2D, src: GroundSource, x0: number, y0: number, x1: number, y1: number, time: number) {
  ctx.fillStyle = 'rgba(220,240,255,0.55)';
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
    const t = cellAt(src, cx, cy);
    if (t !== T.WATER && t !== T.DEEP) continue;
    const k = hash2i(cx, cy, 99);
    const phase = ((time * 0.6 + (k % 1000) / 1000) % 1);
    if (phase > 0.55) continue;
    const gx = cx * TS + (k % 13) + Math.floor(phase * 6);
    const gy = cy * TS + ((k >> 8) % 13);
    const w = phase < 0.2 || phase > 0.45 ? 1 : 3;
    ctx.fillRect(gx, gy, w, 1);
  }
}
