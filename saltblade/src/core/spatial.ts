// Uniform grid of things with x/z, rebuilt each tick for neighbour queries.
export class SpatialHash<T extends { x: number; z: number }> {
  private cells = new Map<number, T[]>();
  constructor(public size = 16) {}
  private key(i: number, j: number) { return (j + 32768) * 65536 + (i + 32768); }
  clear() { this.cells.clear(); }
  insert(o: T) {
    const k = this.key(Math.floor(o.x / this.size), Math.floor(o.z / this.size));
    let c = this.cells.get(k);
    if (!c) this.cells.set(k, (c = []));
    c.push(o);
  }
  /** Calls fn for things within r of (x, z). */
  near(x: number, z: number, r: number, fn: (o: T, d2: number) => void) {
    const s = this.size;
    const i0 = Math.floor((x - r) / s), i1 = Math.floor((x + r) / s);
    const j0 = Math.floor((z - r) / s), j1 = Math.floor((z + r) / s);
    const r2 = r * r;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const c = this.cells.get(this.key(i, j));
      if (!c) continue;
      for (const o of c) {
        const dx = o.x - x, dz = o.z - z;
        const d2 = dx * dx + dz * dz;
        if (d2 <= r2) fn(o, d2);
      }
    }
  }
  list(x: number, z: number, r: number): T[] {
    const out: T[] = [];
    this.near(x, z, r, (o) => out.push(o));
    return out;
  }
}
