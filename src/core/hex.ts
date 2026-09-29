// Axial hex coordinates. Maps are authored as rows of characters where the
// character index is q and the row is r. On screen, +q runs east and +r runs
// south-east, so rectangular blocks of text become slanted parallelograms,
// which gives the classic isometric look.

export interface Hex { q: number; r: number }

export const HEX_W = 32; // horizontal distance between neighbouring hexes
export const ROW_H = 16; // vertical distance between rows

// Neighbour directions, clockwise from north-east.
export const DIRS: readonly Hex[] = [
  { q: 1, r: -1 }, // 0 NE
  { q: 1, r: 0 }, //  1 E
  { q: 0, r: 1 }, //  2 SE
  { q: -1, r: 1 }, // 3 SW
  { q: -1, r: 0 }, // 4 W
  { q: 0, r: -1 }, // 5 NW
];

export function hexKey(q: number, r: number): string {
  return q + ',' + r;
}

export function neighbor(h: Hex, d: number): Hex {
  const o = DIRS[((d % 6) + 6) % 6];
  return { q: h.q + o.q, r: h.r + o.r };
}

export function neighbors(h: Hex): Hex[] {
  return DIRS.map((o) => ({ q: h.q + o.q, r: h.r + o.r }));
}

export function hexDist(a: Hex, b: Hex): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function hexEq(a: Hex, b: Hex): boolean {
  return a.q === b.q && a.r === b.r;
}

/** World-space pixel centre of a hex (before camera offset). */
export function hexToPixel(q: number, r: number): { x: number; y: number } {
  return { x: q * HEX_W + r * (HEX_W / 2), y: r * ROW_H };
}

export function pixelToHex(x: number, y: number): Hex {
  // Invert the linear map, then round in cube space.
  const rf = y / ROW_H;
  const qf = (x - rf * (HEX_W / 2)) / HEX_W;
  return hexRound(qf, rf);
}

export function hexRound(qf: number, rf: number): Hex {
  const sf = -qf - rf;
  let q = Math.round(qf);
  let r = Math.round(rf);
  const s = Math.round(sf);
  const dq = Math.abs(q - qf);
  const dr = Math.abs(r - rf);
  const ds = Math.abs(s - sf);
  if (dq > dr && dq > ds) q = -r - s;
  else if (dr > ds) r = -q - s;
  return { q, r };
}

/** Hexes on the straight line from a to b, inclusive of both ends. */
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = hexDist(a, b);
  const out: Hex[] = [];
  if (n === 0) return [{ q: a.q, r: a.r }];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Nudge to avoid ambiguous ties landing on corners.
    const qf = a.q + (b.q - a.q) * t + 1e-6;
    const rf = a.r + (b.r - a.r) * t + 1e-6;
    out.push(hexRound(qf, rf));
  }
  return out;
}

/** Direction index (0..5) that best points from a toward b. */
export function dirTo(a: Hex, b: Hex): number {
  const pa = hexToPixel(a.q, a.r);
  const pb = hexToPixel(b.q, b.r);
  const dx = pb.x - pa.x;
  const dy = (pb.y - pa.y) * (HEX_W / 2 / ROW_H) * 1.732;
  if (dx === 0 && dy === 0) return 2;
  const ang = Math.atan2(dy, dx); // 0 = east
  // Direction angles: NE=-60, E=0, SE=60, SW=120, W=180, NW=-120
  const deg = (ang * 180) / Math.PI;
  const idx = Math.round(deg / 60); // -3..3
  const map: Record<number, number> = { [-3]: 4, [-2]: 5, [-1]: 0, 0: 1, 1: 2, 2: 3, 3: 4 };
  return map[idx] ?? 2;
}

export function hexesInRange(c: Hex, radius: number): Hex[] {
  const out: Hex[] = [];
  for (let dq = -radius; dq <= radius; dq++) {
    const r1 = Math.max(-radius, -dq - radius);
    const r2 = Math.min(radius, -dq + radius);
    for (let dr = r1; dr <= r2; dr++) out.push({ q: c.q + dq, r: c.r + dr });
  }
  return out;
}

/** Generic A* over hexes. `cost` returns Infinity for impassable. */
export function findPath(
  start: Hex,
  goal: Hex,
  passable: (q: number, r: number) => boolean,
  opts: { maxNodes?: number; adjacentOk?: boolean } = {},
): Hex[] | null {
  const maxNodes = opts.maxNodes ?? 6000;
  const goalK = hexKey(goal.q, goal.r);
  const startK = hexKey(start.q, start.r);
  if (startK === goalK) return [];
  const isGoal = (q: number, r: number) =>
    opts.adjacentOk ? hexDist({ q, r }, goal) <= 1 : q === goal.q && r === goal.r;
  if (opts.adjacentOk && hexDist(start, goal) <= 1) return [];

  const open = new MinHeap<{ q: number; r: number; f: number }>((a, b) => a.f - b.f);
  const g = new Map<string, number>();
  const came = new Map<string, string>();
  g.set(startK, 0);
  open.push({ q: start.q, r: start.r, f: hexDist(start, goal) });
  let count = 0;
  while (open.size) {
    const cur = open.pop()!;
    const ck = hexKey(cur.q, cur.r);
    if (isGoal(cur.q, cur.r)) {
      const path: Hex[] = [];
      let k: string | undefined = ck;
      while (k && k !== startK) {
        const [q, r] = k.split(',').map(Number);
        path.push({ q, r });
        k = came.get(k);
      }
      return path.reverse();
    }
    if (++count > maxNodes) break;
    const cg = g.get(ck)!;
    for (const o of DIRS) {
      const nq = cur.q + o.q;
      const nr = cur.r + o.r;
      const nk = hexKey(nq, nr);
      if (!passable(nq, nr)) continue;
      const ng = cg + 1;
      if (ng < (g.get(nk) ?? Infinity)) {
        g.set(nk, ng);
        came.set(nk, ck);
        open.push({ q: nq, r: nr, f: ng + hexDist({ q: nq, r: nr }, goal) * 1.001 });
      }
    }
  }
  return null;
}

export class MinHeap<T> {
  private a: T[] = [];
  constructor(private cmp: (x: T, y: T) => number) {}
  get size() {
    return this.a.length;
  }
  push(v: T) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
