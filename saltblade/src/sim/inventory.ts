// Grid inventories: items take up w x h cells, stack by type and grade.
import { ITEM, ItemDef } from '../content/items';

export interface Item {
  uid: number;
  id: string;
  q: number; // quality grade 0..6
  n: number;
  x: number;
  y: number;
  stolen?: string; // faction it was stolen from
  inv?: Grid; // backpacks carry their own grid
}

let nextUid = 1;
export const setNextUid = (n: number) => { nextUid = Math.max(nextUid, n); };
export const peekUid = () => nextUid;

export function makeItem(id: string, n = 1, q = 2): Item {
  const d = ITEM[id];
  if (!d) throw new Error('unknown item ' + id);
  const it: Item = { uid: nextUid++, id, q: d.graded ? q : 2, n, x: 0, y: 0 };
  if (d.pack) it.inv = new Grid(d.pack.w, d.pack.h);
  return it;
}

export class Grid {
  items: Item[] = [];
  constructor(public w: number, public h: number) {}

  private occupied(ignore?: Item) {
    const occ = new Uint8Array(this.w * this.h);
    for (const it of this.items) {
      if (it === ignore) continue;
      const d = ITEM[it.id];
      for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) {
        const x = it.x + i, y = it.y + j;
        if (x < this.w && y < this.h) occ[y * this.w + x] = 1;
      }
    }
    return occ;
  }
  fitsAt(d: ItemDef, x: number, y: number, ignore?: Item, occ?: Uint8Array) {
    if (x < 0 || y < 0 || x + d.w > this.w || y + d.h > this.h) return false;
    const o = occ ?? this.occupied(ignore);
    for (let j = 0; j < d.h; j++) for (let i = 0; i < d.w; i++) if (o[(y + j) * this.w + x + i]) return false;
    return true;
  }
  findSpot(d: ItemDef, ignore?: Item): [number, number] | null {
    const occ = this.occupied(ignore);
    for (let y = 0; y + d.h <= this.h; y++) for (let x = 0; x + d.w <= this.w; x++) if (this.fitsAt(d, x, y, ignore, occ)) return [x, y];
    return null;
  }
  /** Adds up to n; returns how many did not fit. */
  add(id: string, n = 1, q = 2, stolen?: string): number {
    const d = ITEM[id];
    if (!d) return n;
    const qq = d.graded ? q : 2;
    // top up existing stacks
    if (d.stack > 1) {
      for (const it of this.items) {
        if (n <= 0) break;
        if (it.id === id && it.q === qq && it.n < d.stack && it.stolen === stolen) {
          const k = Math.min(n, d.stack - it.n);
          it.n += k; n -= k;
        }
      }
    }
    while (n > 0) {
      const spot = this.findSpot(d);
      if (!spot) return n;
      const k = Math.min(n, d.stack);
      const it = makeItem(id, k, qq);
      it.x = spot[0]; it.y = spot[1];
      if (stolen) it.stolen = stolen;
      this.items.push(it);
      n -= k;
    }
    return 0;
  }
  /** Places an existing item instance (e.g. moved by drag), merging stacks. */
  put(it: Item, x?: number, y?: number): boolean {
    const d = ITEM[it.id];
    if (x === undefined || y === undefined) {
      if (d.stack > 1) {
        for (const o of this.items) {
          if (o !== it && o.id === it.id && o.q === it.q && o.n < d.stack && o.stolen === it.stolen) {
            const k = Math.min(it.n, d.stack - o.n);
            o.n += k; it.n -= k;
            if (it.n <= 0) return true;
          }
        }
      }
      const s = this.findSpot(d);
      if (!s) return false;
      [x, y] = s;
    } else {
      // dropping onto a matching stack merges
      const on = this.itemAt(x, y);
      if (on && on !== it && on.id === it.id && on.q === it.q && d.stack > 1 && on.stolen === it.stolen) {
        const k = Math.min(it.n, d.stack - on.n);
        on.n += k; it.n -= k;
        return it.n <= 0 ? true : false;
      }
      if (!this.fitsAt(d, x, y, it)) return false;
    }
    it.x = x; it.y = y;
    if (!this.items.includes(it)) this.items.push(it);
    return true;
  }
  itemAt(x: number, y: number): Item | null {
    for (const it of this.items) {
      const d = ITEM[it.id];
      if (x >= it.x && y >= it.y && x < it.x + d.w && y < it.y + d.h) return it;
    }
    return null;
  }
  remove(it: Item) {
    const i = this.items.indexOf(it);
    if (i >= 0) this.items.splice(i, 1);
  }
  count(id: string) {
    let n = 0;
    for (const it of this.items) if (it.id === id) n += it.n;
    return n;
  }
  countWhere(f: (d: ItemDef, it: Item) => boolean) {
    let n = 0;
    for (const it of this.items) if (f(ITEM[it.id], it)) n += it.n;
    return n;
  }
  /** Takes up to n of an item type; returns how many were taken. */
  take(id: string, n: number): number {
    let got = 0;
    for (let i = this.items.length - 1; i >= 0 && got < n; i--) {
      const it = this.items[i];
      if (it.id !== id) continue;
      const k = Math.min(n - got, it.n);
      it.n -= k; got += k;
      if (it.n <= 0) this.items.splice(i, 1);
    }
    return got;
  }
  first(f: (d: ItemDef, it: Item) => boolean): Item | null {
    for (const it of this.items) if (f(ITEM[it.id], it)) return it;
    return null;
  }
  weight(): number {
    let w = 0;
    for (const it of this.items) {
      const d = ITEM[it.id];
      w += d.weight * it.n;
      if (it.inv) w += it.inv.weight() * (d.pack?.lighten ?? 1);
    }
    return w;
  }
  value(): number {
    let v = 0;
    for (const it of this.items) v += ITEM[it.id].value * it.n;
    return v;
  }
  /** Re-packs items (largest first) to reduce fragmentation. */
  sort() {
    const items = this.items.slice().sort((a, b) => {
      const da = ITEM[a.id], db = ITEM[b.id];
      return db.w * db.h - da.w * da.h || da.cat.localeCompare(db.cat) || a.id.localeCompare(b.id);
    });
    this.items = [];
    const left: Item[] = [];
    for (const it of items) if (!this.put(it)) left.push(it);
    return left;
  }
  serialize(): any {
    return { w: this.w, h: this.h, items: this.items.map((i) => ({ ...i, inv: i.inv ? i.inv.serialize() : undefined })) };
  }
  static from(o: any): Grid {
    const g = new Grid(o.w, o.h);
    for (const i of o.items) {
      const it: Item = { ...i, inv: i.inv ? Grid.from(i.inv) : undefined };
      if (!ITEM[it.id]) continue;
      setNextUid(it.uid + 1);
      g.items.push(it);
    }
    return g;
  }
}
