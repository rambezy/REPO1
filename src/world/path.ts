// A* path-finding on the tile grid, with line-of-sight smoothing.

import { GameMap } from './map';
import { TILE } from '../engine/util';

class Heap {
  private a: number[] = [];
  private f: Float64Array;
  constructor(size: number) { this.f = new Float64Array(size); }
  push(n: number, f: number) {
    this.f[n] = f;
    const a = this.a;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.f[a[p]] <= this.f[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let m = i;
        if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l;
        if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
  get size() { return this.a.length; }
}

const walkCache = new Map<string, { version: number; grid: Int8Array }>();

function walkable(map: GameMap, tx: number, ty: number): boolean {
  if (!map.inBounds(tx, ty)) return false;
  let c = walkCache.get(map.id);
  if (!c || c.version !== map.version || c.grid.length !== map.w * map.h) {
    c = { version: map.version, grid: new Int8Array(map.w * map.h).fill(-1) };
    walkCache.set(map.id, c);
  }
  const i = ty * map.w + tx;
  let v = c.grid[i];
  if (v === -1) { v = map.walkableTile(tx, ty) ? 1 : 0; c.grid[i] = v; }
  return v === 1;
}

export function invalidateWalk(mapId: string) { walkCache.delete(mapId); }

export function findPath(map: GameMap, sx: number, sy: number, gx: number, gy: number, maxNodes = 2500): { x: number; y: number }[] | null {
  let stx = Math.floor(sx / TILE), sty = Math.floor(sy / TILE);
  let gtx = Math.floor(gx / TILE), gty = Math.floor(gy / TILE);
  if (!walkable(map, gtx, gty)) {
    // pick nearest walkable tile to the goal
    let found = false;
    for (let r = 1; r <= 3 && !found; r++) for (let dy = -r; dy <= r && !found; dy++) for (let dx = -r; dx <= r && !found; dx++) {
      if (walkable(map, gtx + dx, gty + dy)) { gtx += dx; gty += dy; found = true; }
    }
    if (!found) return null;
  }
  if (!walkable(map, stx, sty)) {
    for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      if (walkable(map, stx + dx, sty + dy)) { stx += dx; sty += dy; break; }
    }
  }
  const W = map.w;
  const start = sty * W + stx, goal = gty * W + gtx;
  if (start === goal) return [{ x: gx, y: gy }];
  const g = new Map<number, number>();
  const came = new Map<number, number>();
  const heap = new Heap(map.w * map.h);
  const h = (n: number) => { const x = n % W, y = (n / W) | 0; const dx = Math.abs(x - gtx), dy = Math.abs(y - gty); return (dx + dy) + (1.414 - 2) * Math.min(dx, dy); };
  g.set(start, 0);
  heap.push(start, h(start));
  let expanded = 0;
  const closed = new Set<number>();
  while (heap.size) {
    const n = heap.pop();
    if (n === goal) break;
    if (closed.has(n)) continue;
    closed.add(n);
    if (++expanded > maxNodes) return null;
    const x = n % W, y = (n / W) | 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx, ny = y + dy;
      if (!walkable(map, nx, ny)) continue;
      if (dx && dy && (!walkable(map, x + dx, y) || !walkable(map, x, y + dy))) continue;
      const m = ny * W + nx;
      const cost = g.get(n)! + (dx && dy ? 1.414 : 1);
      if (cost < (g.get(m) ?? Infinity)) {
        g.set(m, cost);
        came.set(m, n);
        heap.push(m, cost + h(m));
      }
    }
  }
  if (!came.has(goal)) return null;
  const tiles: number[] = [];
  let cur = goal;
  while (cur !== start) { tiles.push(cur); cur = came.get(cur)!; }
  tiles.reverse();
  const pts = tiles.map((n) => ({ x: (n % W) * TILE + 8, y: ((n / W) | 0) * TILE + 10 }));
  pts[pts.length - 1] = { x: gx, y: gy };
  return smooth(map, sx, sy, pts);
}

function lineWalkable(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(d / 6);
  for (let i = 1; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps;
    if (map.blocked(x - 5, y - 6, x + 5, y)) return false;
  }
  return true;
}

function smooth(map: GameMap, sx: number, sy: number, pts: { x: number; y: number }[]) {
  const out: { x: number; y: number }[] = [];
  let cx = sx, cy = sy;
  let i = 0;
  while (i < pts.length) {
    let j = Math.min(pts.length - 1, i + 8);
    while (j > i && !lineWalkable(map, cx, cy, pts[j].x, pts[j].y)) j--;
    out.push(pts[j]);
    cx = pts[j].x; cy = pts[j].y;
    i = j + 1;
  }
  return out;
}

/** Line of sight for vision: blocked by walls/solid terrain (not by small props). */
export function lineOfSight(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const d = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.ceil(d / 8);
  for (let i = 1; i < steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps, y = y0 + ((y1 - y0) * i) / steps;
    const t = map.get(Math.floor(x / TILE), Math.floor(y / TILE));
    if (t === 18 || t === 19 || t === 20 || t === 21 || t === 12 || t === 28) return false;
  }
  return true;
}
