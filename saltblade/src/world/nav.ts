// Navigation. A coarse 12 m cost grid covers the whole world for long
// journeys; fine 1 m tiles are built lazily near where characters walk and
// include walls, furniture, gates, boulders and trees. Long paths are planned
// coarse and refined into fine waypoints a stretch at a time.
import { Terrain } from './terrain';
import { WORLD, SEA, WADE_DEPTH } from './consts';
import { GridAStar } from './astar';
import { blockersIn } from './scatter';

export const COARSE = 12;
export const CN = WORLD / COARSE; // 1024
const TILE = 64; // fine tile size in 1 m cells
const TN = WORLD / TILE; // tiles per side

/** Fine cell values */
export const F_BLOCK = 0, F_OPEN = 1, F_SHALLOW = 2, F_DEEP = 6;

export interface StructPrim {
  kind: 'rect' | 'circle' | 'open' | 'floor';
  // rect: centre, half extents, rotation. circle: centre and r.
  // floor: walkable area stamped first (building interiors); open: doorways stamped last
  x: number; z: number; hx?: number; hz?: number; rot?: number; r?: number;
}

export type StructProvider = (x0: number, z0: number, x1: number, z1: number) => StructPrim[];

export class Nav {
  coarse: Uint8Array;
  private tiles = new Map<number, Uint8Array>();
  private tileUse = new Map<number, number>();
  private coarseA = new GridAStar(CN * CN);
  private fineA = new GridAStar(200 * 200);
  structures: StructProvider = () => [];
  frame = 0;
  stats = { coarse: 0, fine: 0, fineNodes: 0 };

  constructor(public T: Terrain) {
    this.coarse = new Uint8Array(CN * CN);
    this.buildCoarse();
  }

  private buildCoarse() {
    const T = this.T;
    for (let j = 0; j < CN; j++) for (let i = 0; i < CN; i++) {
      const x = (i + 0.5) * COARSE, z = (j + 0.5) * COARSE;
      let maxS = 0, wet = 0, deep = 0;
      for (let k = 0; k < 5; k++) {
        const sx = x + (k === 1 ? -4 : k === 2 ? 4 : 0), sz = z + (k === 3 ? -4 : k === 4 ? 4 : 0);
        const s = T.slopeAt(sx, sz);
        if (s > maxS) maxS = s;
        const h = T.heightAt(sx, sz);
        if (h < SEA) { wet++; if (SEA - h > WADE_DEPTH) deep++; }
      }
      let c = 1;
      if (maxS > 1.25) c = 0;
      else if (maxS > 0.8) c = 4;
      else if (maxS > 0.5) c = 2;
      if (deep >= 3) c = c ? 14 : 0;
      else if (wet >= 2) c = Math.max(c, 3);
      if (x < 150 || z < 150 || x > WORLD - 150 || z > WORLD - 150) c = 0;
      this.coarse[j * CN + i] = c;
    }
  }

  // ---------- fine tiles ----------
  private tileKey(ti: number, tj: number) { return tj * TN + ti; }

  private buildTile(ti: number, tj: number): Uint8Array {
    const T = this.T;
    const cells = new Uint8Array(TILE * TILE);
    const x0 = ti * TILE, z0 = tj * TILE;
    // terrain: sample heights on a 1 m lattice (65x65 corners)
    const H = new Float32Array((TILE + 1) * (TILE + 1));
    for (let j = 0; j <= TILE; j++) for (let i = 0; i <= TILE; i++) H[j * (TILE + 1) + i] = T.heightAt(x0 + i, z0 + j);
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      const a = H[j * (TILE + 1) + i], b = H[j * (TILE + 1) + i + 1], c = H[(j + 1) * (TILE + 1) + i], d = H[(j + 1) * (TILE + 1) + i + 1];
      const s = Math.max(Math.abs(a - b), Math.abs(c - d), Math.abs(a - c), Math.abs(b - d), Math.abs(a - d) / 1.41);
      const h = (a + b + c + d) / 4;
      let v = F_OPEN;
      if (s > 1.05) v = F_BLOCK;
      if (h < SEA) v = SEA - h > WADE_DEPTH ? (v ? F_DEEP : F_BLOCK) : v ? F_SHALLOW : F_BLOCK;
      const wx = x0 + i, wz = z0 + j;
      if (wx < 150 || wz < 150 || wx > WORLD - 150 || wz > WORLD - 150) v = F_BLOCK;
      cells[j * TILE + i] = v;
    }
    // boulders and trees
    for (const [bx, bz, br] of blockersIn(T, x0 - 4, z0 - 4, x0 + TILE + 4, z0 + TILE + 4)) {
      this.stampCircle(cells, x0, z0, bx, bz, br, F_BLOCK);
    }
    // structures
    const prims = this.structures(x0, z0, x0 + TILE, z0 + TILE);
    for (const p of prims) if (p.kind === 'floor') this.stampRect(cells, x0, z0, p, F_OPEN);
    for (const p of prims) {
      if (p.kind === 'rect') this.stampRect(cells, x0, z0, p, F_BLOCK);
      else if (p.kind === 'circle') this.stampCircle(cells, x0, z0, p.x, p.z, p.r!, F_BLOCK);
    }
    // doorways and floors reopen what walls and slopes closed
    for (const p of prims) if (p.kind === 'open') this.stampRect(cells, x0, z0, p, F_OPEN);
    return cells;
  }

  private stampCircle(cells: Uint8Array, x0: number, z0: number, cx: number, cz: number, r: number, v: number) {
    const i0 = Math.max(0, Math.floor(cx - r - x0)), i1 = Math.min(TILE - 1, Math.floor(cx + r - x0));
    const j0 = Math.max(0, Math.floor(cz - r - z0)), j1 = Math.min(TILE - 1, Math.floor(cz + r - z0));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = x0 + i + 0.5 - cx, dz = z0 + j + 0.5 - cz;
      if (dx * dx + dz * dz <= r * r) cells[j * TILE + i] = v;
    }
  }

  private stampRect(cells: Uint8Array, x0: number, z0: number, p: StructPrim, v: number) {
    const hx = p.hx!, hz = p.hz!, rot = p.rot ?? 0;
    const c = Math.cos(rot), s = Math.sin(rot);
    const ext = Math.abs(hx * c) + Math.abs(hz * s), ezt = Math.abs(hx * s) + Math.abs(hz * c);
    const i0 = Math.max(0, Math.floor(p.x - ext - x0)), i1 = Math.min(TILE - 1, Math.floor(p.x + ext - x0));
    const j0 = Math.max(0, Math.floor(p.z - ezt - z0)), j1 = Math.min(TILE - 1, Math.floor(p.z + ezt - z0));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const dx = x0 + i + 0.5 - p.x, dz = z0 + j + 0.5 - p.z;
      // rotate into rect space (rotation about y: local x = dx*c - dz*s ...)
      const lx = dx * c - dz * s, lz = dx * s + dz * c;
      if (Math.abs(lx) <= hx + 0.05 && Math.abs(lz) <= hz + 0.05) cells[j * TILE + i] = v;
    }
  }

  tile(ti: number, tj: number) {
    const k = this.tileKey(ti, tj);
    let t = this.tiles.get(k);
    if (!t) {
      t = this.buildTile(ti, tj);
      this.tiles.set(k, t);
      if (this.tiles.size > 900) this.evict();
    }
    this.tileUse.set(k, this.frame);
    return t;
  }

  private evict() {
    const old = [...this.tileUse.entries()].sort((a, b) => a[1] - b[1]).slice(0, 200);
    for (const [k] of old) { this.tiles.delete(k); this.tileUse.delete(k); }
  }

  /** Throws away every cached fine tile. */
  reset() { this.tiles.clear(); this.tileUse.clear(); }

  /** Throws away cached fine tiles over an area (after building or gates). */
  invalidate(x0: number, z0: number, x1: number, z1: number) {
    for (let tj = Math.floor(z0 / TILE); tj <= Math.floor(z1 / TILE); tj++)
      for (let ti = Math.floor(x0 / TILE); ti <= Math.floor(x1 / TILE); ti++) {
        const k = this.tileKey(ti, tj);
        this.tiles.delete(k);
        this.tileUse.delete(k);
      }
  }

  /** Fine cell value at a world position. */
  cell(x: number, z: number) {
    if (x < 0 || z < 0 || x >= WORLD || z >= WORLD) return F_BLOCK;
    const ix = x | 0, iz = z | 0;
    const t = this.tile((ix / TILE) | 0, (iz / TILE) | 0);
    return t[(iz % TILE) * TILE + (ix % TILE)];
  }
  walkable(x: number, z: number) { return this.cell(x, z) !== F_BLOCK; }

  /** Straight walkable line between two points (fine grid). */
  clearLine(ax: number, az: number, bx: number, bz: number, allowDeep = true) {
    const d = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(d / 0.5);
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const c = this.cell(ax + (bx - ax) * t, az + (bz - az) * t);
      if (c === F_BLOCK || (!allowDeep && c === F_DEEP)) return false;
    }
    return true;
  }

  /** Nearest walkable spot to (x, z) within r metres. */
  nearestOpen(x: number, z: number, r = 12): [number, number] | null {
    if (this.walkable(x, z) && this.cell(x, z) !== F_DEEP) return [x, z];
    for (let rad = 1; rad <= r; rad++) {
      const steps = Math.max(8, Math.round(rad * 6));
      for (let k = 0; k < steps; k++) {
        const a = (k / steps) * Math.PI * 2;
        const px = x + Math.cos(a) * rad, pz = z + Math.sin(a) * rad;
        const c = this.cell(px, pz);
        if (c !== F_BLOCK && c !== F_DEEP) return [px, pz];
      }
    }
    return null;
  }

  // ---------- searches ----------
  /** Fine A* inside a square window; returns world waypoints (cell centres). */
  fine(ax: number, az: number, bx: number, bz: number, margin = 20, maxNodes = 30000, partial = true): number[] | null {
    let x0 = Math.floor(Math.min(ax, bx) - margin), z0 = Math.floor(Math.min(az, bz) - margin);
    let x1 = Math.ceil(Math.max(ax, bx) + margin), z1 = Math.ceil(Math.max(az, bz) + margin);
    // the search buffer holds 200x200 cells
    if (x1 - x0 >= 200) { const cx = (ax + bx) / 2; x0 = Math.floor(cx - 99); x1 = x0 + 199; }
    if (z1 - z0 >= 200) { const cz = (az + bz) / 2; z0 = Math.floor(cz - 99); z1 = z0 + 199; }
    x0 = Math.max(0, x0); z0 = Math.max(0, z0);
    x1 = Math.min(WORLD - 1, x1); z1 = Math.min(WORLD - 1, z1);
    const W = x1 - x0 + 1, Hh = z1 - z0 + 1;
    const grid = new Uint8Array(W * Hh);
    for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) grid[j * W + i] = this.cell(x0 + i + 0.5, z0 + j + 0.5);
    const clampI = (v: number, hi: number) => Math.max(0, Math.min(hi - 1, v));
    let si = clampI(Math.floor(ax) - x0, W), sj = clampI(Math.floor(az) - z0, Hh);
    let gi = clampI(Math.floor(bx) - x0, W), gj = clampI(Math.floor(bz) - z0, Hh);
    // let a character standing in a blocked cell walk out
    if (grid[sj * W + si] === F_BLOCK) grid[sj * W + si] = F_OPEN;
    if (grid[gj * W + gi] === F_BLOCK) {
      // retarget to the nearest open cell
      let best = -1, bd = 1e9;
      for (let dj = -6; dj <= 6; dj++) for (let di = -6; di <= 6; di++) {
        const i = gi + di, j = gj + dj;
        if (i < 0 || j < 0 || i >= W || j >= Hh) continue;
        if (grid[j * W + i] === F_BLOCK) continue;
        const d = di * di + dj * dj;
        if (d < bd) { bd = d; best = j * W + i; }
      }
      if (best < 0) return null;
      gi = best % W; gj = (best / W) | 0;
    }
    this.stats.fine++;
    const res = this.fineA.find({ w: W, h: Hh, cost: (i) => grid[i], minCost: 1, maxNodes }, sj * W + si, gj * W + gi, partial);
    if (!res) return null;
    const pts: number[] = [];
    for (const c of res) pts.push(x0 + (c % W) + 0.5, z0 + Math.floor(c / W) + 0.5);
    return this.smooth(pts, grid, W, Hh, x0, z0);
  }

  /** String-pulling: drop waypoints that have a clear line to a later one. */
  private smooth(pts: number[], grid: Uint8Array, W: number, Hh: number, x0: number, z0: number): number[] {
    if (pts.length <= 4) return pts;
    const clear = (ax: number, az: number, bx: number, bz: number) => {
      const d = Math.hypot(bx - ax, bz - az);
      const n = Math.ceil(d / 0.35);
      const ca = grid[(Math.floor(az) - z0) * W + (Math.floor(ax) - x0)];
      for (let k = 1; k < n; k++) {
        const t = k / n;
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        // check a small footprint so corners are not clipped
        for (const [ox, oz] of [[0, 0], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
          const i = Math.floor(px + ox) - x0, j = Math.floor(pz + oz) - z0;
          if (i < 0 || j < 0 || i >= W || j >= Hh) return false;
          const c = grid[j * W + i];
          if (c === F_BLOCK || (c !== ca && c === F_DEEP)) return false;
        }
      }
      return true;
    };
    const out = [pts[0], pts[1]];
    let i = 0;
    const n = pts.length / 2;
    while (i < n - 1) {
      let j = n - 1;
      while (j > i + 1 && !clear(pts[i * 2], pts[i * 2 + 1], pts[j * 2], pts[j * 2 + 1])) j--;
      out.push(pts[j * 2], pts[j * 2 + 1]);
      i = j;
    }
    return out;
  }

  /** Coarse A* over the whole world; returns world waypoints every ~12 m. */
  coarsePath(ax: number, az: number, bx: number, bz: number): number[] | null {
    const ci = (x: number) => Math.max(0, Math.min(CN - 1, Math.floor(x / COARSE)));
    const s = ci(az) * CN + ci(ax), g = ci(bz) * CN + ci(bx);
    this.stats.coarse++;
    const cost = this.coarse;
    const res = this.coarseA.find({ w: CN, h: CN, cost: (i) => cost[i] || (i === s || i === g ? 1 : 0), minCost: 1, maxNodes: 250000 }, s, g, true);
    if (!res) return null;
    const pts: number[] = [];
    for (let k = 0; k < res.length; k++) {
      const c = res[k];
      pts.push(((c % CN) + 0.5) * COARSE, (Math.floor(c / CN) + 0.5) * COARSE);
    }
    pts[pts.length - 2] = bx; pts[pts.length - 1] = bz;
    return pts;
  }
}

/** A path being walked: fine waypoints now, coarse ones still to refine. */
export class Path {
  pts: number[] = [];
  idx = 0;
  coarse: number[] = [];
  cidx = 0;
  failed = false;
  constructor(public gx: number, public gz: number) {}
  get done() { return this.idx >= this.pts.length / 2 && this.cidx >= this.coarse.length / 2; }
}

const FINE_DIRECT = 90;

/** Plans a path from a to b. Short trips are planned fine immediately. */
export function planPath(nav: Nav, ax: number, az: number, bx: number, bz: number): Path | null {
  const p = new Path(bx, bz);
  const d = Math.hypot(bx - ax, bz - az);
  if (d < 0.6) return p;
  if (d < FINE_DIRECT) {
    const f = nav.fine(ax, az, bx, bz, 24, 30000, true);
    if (f) { p.pts = f; p.idx = 1; return p; }
  }
  const c = nav.coarsePath(ax, az, bx, bz);
  if (!c) return null;
  p.coarse = c;
  p.cidx = 0;
  refine(nav, p, ax, az);
  return p;
}

/** Refines the next stretch of a coarse path into fine waypoints. */
export function refine(nav: Nav, p: Path, x: number, z: number): boolean {
  if (p.cidx >= p.coarse.length / 2) return false;
  const n = p.coarse.length / 2;
  // aim at a coarse waypoint ~60 m ahead (or the goal)
  let k = p.cidx;
  while (k < n - 1 && Math.hypot(p.coarse[k * 2] - x, p.coarse[k * 2 + 1] - z) < 60) k++;
  const tx = p.coarse[k * 2], tz = p.coarse[k * 2 + 1];
  const f = nav.fine(x, z, tx, tz, 16, 20000, true);
  p.cidx = k + 1;
  if (!f) {
    // fall back to walking straight at the coarse point
    p.pts = [x, z, tx, tz];
    p.idx = 1;
    return true;
  }
  p.pts = f;
  p.idx = 1;
  return true;
}
