// Grid A* with octile moves, reusable buffers and a node budget.
import { IdHeap } from '../core/heap';

export interface GridSearch {
  w: number;
  h: number;
  /** cost to enter cell i (>= 1), or 0 if blocked */
  cost: (i: number) => number;
  /** lower bound of cost per cell, for the heuristic */
  minCost?: number;
  maxNodes?: number;
  /** optional window: only cells with x in [x0,x1], y in [y0,y1] */
  x0?: number; y0?: number; x1?: number; y1?: number;
}

const SQ2 = Math.SQRT2;

export class GridAStar {
  private g: Float32Array;
  private from: Int32Array;
  private stamp: Uint32Array;
  private closed: Uint32Array;
  private gen = 1;
  private heap = new IdHeap(4096);
  constructor(public size: number) {
    this.g = new Float32Array(size);
    this.from = new Int32Array(size);
    this.stamp = new Uint32Array(size);
    this.closed = new Uint32Array(size);
  }
  /** Returns cell indices from start to goal, or null. If the goal is unreachable
   *  within budget and `partial` is set, returns the path to the closest node. */
  find(s: GridSearch, start: number, goal: number, partial = false): number[] | null {
    const { w, h, cost } = s;
    const x0 = s.x0 ?? 0, y0 = s.y0 ?? 0, x1 = s.x1 ?? w - 1, y1 = s.y1 ?? h - 1;
    const minC = s.minCost ?? 1;
    const maxNodes = s.maxNodes ?? 200000;
    const gen = ++this.gen;
    if (gen > 0xfffffff0) { this.stamp.fill(0); this.closed.fill(0); this.gen = 1; }
    const g = this.g, from = this.from, stamp = this.stamp, closed = this.closed, heap = this.heap;
    heap.clear();
    const gx = goal % w, gy = (goal / w) | 0;
    const hfun = (i: number) => {
      const dx = Math.abs((i % w) - gx), dy = Math.abs(((i / w) | 0) - gy);
      return minC * (dx + dy + (SQ2 - 2) * Math.min(dx, dy));
    };
    g[start] = 0; from[start] = -1; stamp[start] = gen;
    heap.push(start, hfun(start));
    let best = start, bestH = hfun(start);
    let expanded = 0;
    while (!heap.empty) {
      const cur = heap.pop();
      if (closed[cur] === gen) continue;
      closed[cur] = gen;
      if (cur === goal) return this.trace(goal);
      if (++expanded > maxNodes) break;
      const cx = cur % w, cy = (cur / w) | 0;
      const gc = g[cur];
      for (let d = 0; d < 8; d++) {
        const dx = DX[d], dy = DY[d];
        const nx = cx + dx, ny = cy + dy;
        if (nx < x0 || ny < y0 || nx > x1 || ny > y1) continue;
        const ni = ny * w + nx;
        if (closed[ni] === gen) continue;
        const c = cost(ni);
        if (c <= 0) continue;
        let step = c;
        if (dx !== 0 && dy !== 0) {
          // no corner cutting
          if (cost(cy * w + nx) <= 0 || cost(ny * w + cx) <= 0) continue;
          step *= SQ2;
        }
        const ng = gc + step;
        if (stamp[ni] !== gen || ng < g[ni]) {
          stamp[ni] = gen; g[ni] = ng; from[ni] = cur;
          const hh = hfun(ni);
          if (hh < bestH) { bestH = hh; best = ni; }
          heap.push(ni, ng + hh);
        }
      }
    }
    return partial && best !== start ? this.trace(best) : null;
  }
  private trace(i: number) {
    const out: number[] = [];
    const from = this.from;
    while (i >= 0) { out.push(i); i = from[i]; }
    return out.reverse();
  }
}
const DX = [1, -1, 0, 0, 1, 1, -1, -1];
const DY = [0, 0, 1, -1, 1, -1, 1, -1];
