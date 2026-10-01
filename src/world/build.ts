// Tools for authoring maps: terrain painting, roads and rivers, scattering
// nature, and placing buildings, props, doors, herbs and spawn points.

import { GameMap, Interaction, MapObject, Region } from './map';
import { T, tdef } from './terrain';
import { RNG, TILE, valueNoise, hash2 } from '../engine/util';
import { buildingArt, BuildingSpec } from '../gfx/buildings';
import { treeSprite, bushSprite, rockSprite, stumpSprite, herbSprite, flowerPatchSprite, reedsSprite, logSprite, TreeKind } from '../gfx/nature';
import { propInfo } from '../gfx/props';

export interface DoorSpec { to: string; spawn: string; locked?: number; key?: string; label?: string; owner?: string; night?: boolean }

export class MapBuilder {
  map: GameMap;
  rng: RNG;
  /** tiles reserved by buildings/roads so nature does not grow there */
  reserved: Uint8Array;

  constructor(id: string, name: string, w: number, h: number, fill: number, seed: number, outdoor: boolean) {
    this.map = new GameMap(id, name, w, h, fill, seed, outdoor);
    this.rng = new RNG(seed);
    this.reserved = new Uint8Array(w * h);
  }

  get w() { return this.map.w; }
  get h() { return this.map.h; }
  set(x: number, y: number, t: number) { this.map.set(x, y, t); }
  get(x: number, y: number) { return this.map.get(x, y); }
  reserve(x: number, y: number, w: number, h: number) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (this.map.inBounds(i, j)) this.reserved[j * this.w + i] = 1;
  }
  isReserved(x: number, y: number) { return !this.map.inBounds(x, y) || this.reserved[y * this.w + x] === 1; }

  fill(x: number, y: number, w: number, h: number, t: number) { this.map.fillRect(x, y, w, h, t); }

  /** Organic blob of terrain. */
  blob(cx: number, cy: number, rx: number, ry: number, t: number, noise = 0.35, only?: number[]) {
    for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
      const dx = (x - cx) / rx, dy = (y - cy) / ry;
      const n = (valueNoise(x * 0.25, y * 0.25, this.map.seed + t) - 0.5) * noise * 2;
      if (dx * dx + dy * dy <= 1 + n) {
        if (only && !only.includes(this.get(x, y))) continue;
        this.set(x, y, t);
      }
    }
  }

  /** Thick poly-line of terrain with optional wobble. */
  path(points: [number, number][], width: number, t: number, wobble = 0.6, reserve = true, only?: number[]) {
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i], [x1, y1] = points[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(len * 2));
      for (let s = 0; s <= steps; s++) {
        const k = s / steps;
        const off = (valueNoise((x0 + (x1 - x0) * k) * 0.15, (y0 + (y1 - y0) * k) * 0.15, this.map.seed + 3) - 0.5) * 2 * wobble;
        const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
        const cx = x0 + (x1 - x0) * k + nx * off, cy = y0 + (y1 - y0) * k + ny * off;
        const r = width / 2;
        for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
          if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r + 0.3) {
            if (only && !only.includes(this.get(x, y))) continue;
            this.set(x, y, t);
            if (reserve) this.reserve(x, y, 1, 1);
          }
        }
      }
    }
  }

  road(points: [number, number][], width = 2) {
    const wobble = 0.7;
    this.path(points, width, T.ROAD, wobble, true, [T.GRASS, T.FOREST, T.MEADOW, T.DIRT, T.FIELD, T.WHEAT, T.SAND, T.MUD, T.ASH, T.VEG, T.ROAD]);
    // Bridges carry the road itself over the water: the same wobbly footprint
    // the road was painted with, over short crossings only (a road that runs
    // beside a river never becomes a boardwalk). Decks that come out nearly
    // rectangular are squared off.
    const r = width / 2;
    const wet = (t: number) => t === T.WATER || t === T.DEEP;
    const placed = new Map<number, number>();
    for (let i = 0; i < points.length - 1; i++) {
      const [x0, y0] = points[i], [x1, y1] = points[i + 1];
      const len = Math.hypot(x1 - x0, y1 - y0);
      const steps = Math.max(1, Math.ceil(len * 2));
      const kind = Math.abs(x1 - x0) >= Math.abs(y1 - y0) ? T.BRIDGE : T.BRIDGE_V;
      const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
      const centre = (s: number): [number, number] => {
        const k = s / steps;
        const off = (valueNoise((x0 + (x1 - x0) * k) * 0.15, (y0 + (y1 - y0) * k) * 0.15, this.map.seed + 3) - 0.5) * 2 * wobble;
        return [x0 + (x1 - x0) * k + nx * off, y0 + (y1 - y0) * k + ny * off];
      };
      const wetAt = (s: number) => { const [cx, cy] = centre(s); return wet(this.get(Math.floor(cx), Math.floor(cy))); };
      let s = 0;
      while (s <= steps) {
        if (!wetAt(s)) { s++; continue; }
        const start = s;
        let e = s;
        while (e + 1 <= steps && wetAt(e + 1)) e++;
        s = e + 1;
        const [ax, ay] = centre(start), [bx, by] = centre(e);
        if (Math.hypot(bx - ax, by - ay) > 8) continue;
        for (let q = Math.max(0, start - 3); q <= Math.min(steps, e + 3); q++) {
          const [cx, cy] = centre(q);
          for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
            if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 > r * r + 0.3) continue;
            if (!wet(this.get(x, y))) continue;
            this.set(x, y, kind);
            placed.set(y * this.map.w + x, kind);
          }
        }
      }
    }
    // square off each deck when it nearly fills its bounding box
    const seen = new Set<number>();
    for (const [start, kind] of placed) {
      if (seen.has(start)) continue;
      const cells: number[] = [];
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const k = stack.pop()!;
        cells.push(k);
        const x = k % this.map.w, y = Math.floor(k / this.map.w);
        for (const n of [k - 1, k + 1, k - this.map.w, k + this.map.w]) {
          const nx2 = n % this.map.w;
          if (Math.abs(nx2 - x) > 1 || !placed.has(n) || seen.has(n)) continue;
          seen.add(n);
          stack.push(n);
        }
        void y;
      }
      const xs = cells.map((k) => k % this.map.w), ys = cells.map((k) => Math.floor(k / this.map.w));
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      const area = (bx1 - bx0 + 1) * (by1 - by0 + 1);
      if (cells.length / area >= 0.6 && area <= 24) {
        for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
          const t = this.get(x, y);
          if (wet(t) || t === T.SAND || t === T.ROAD) this.set(x, y, kind);
        }
      }
      for (let y = by0; y <= by1; y++) for (let x = bx0; x <= bx1; x++) {
        const t = this.get(x, y);
        if (t === T.BRIDGE || t === T.BRIDGE_V) this.reserve(x, y, 1, 1);
      }
    }
  }

  river(points: [number, number][], width: number) {
    this.path(points, width + 2.2, T.SAND, 0.9, false, [T.GRASS, T.FOREST, T.MEADOW, T.DIRT, T.FIELD]);
    this.path(points, width, T.WATER, 0.9, true);
    if (width >= 5) this.path(points, width - 3, T.DEEP, 0.9, true);
  }

  // ---------- objects ----------

  obj(o: Omit<MapObject, 'id'>): MapObject { return this.map.add(o); }

  tree(tx: number, ty: number, kind: TreeKind, variant = this.rng.int(0, 11), jitter = true): MapObject | null {
    if (this.isReserved(tx, ty)) return null;
    const x = tx * TILE + 8 + (jitter ? this.rng.int(-3, 3) : 0), y = ty * TILE + 13 + (jitter ? this.rng.int(-2, 2) : 0);
    const s = treeSprite(kind, variant);
    this.reserve(tx, ty, 1, 1);
    const big = kind === 'oak' || kind === 'linden' || kind === 'willow';
    return this.obj({ kind: 'tree', type: kind, x, y, sprite: s, flip: this.rng.chance(0.5), solid: { x: x - (big ? 5 : 3), y: y - 5, w: big ? 10 : 6, h: 6 } });
  }

  bush(tx: number, ty: number, berries?: string, burnt = false) {
    if (this.isReserved(tx, ty)) return null;
    const x = tx * TILE + 8 + this.rng.int(-4, 4), y = ty * TILE + 12 + this.rng.int(-2, 2);
    return this.obj({ kind: 'prop', type: 'bush', x, y, sprite: bushSprite(this.rng.int(0, 7), berries, burnt), solid: { x: x - 6, y: y - 5, w: 12, h: 5 } });
  }

  rock(tx: number, ty: number, size: 'small' | 'big' | 'boulder' = 'small', mossy = false) {
    if (this.isReserved(tx, ty)) return null;
    const x = tx * TILE + 8, y = ty * TILE + 12;
    const s = rockSprite(this.rng.int(0, 7), size, mossy);
    const solid = size === 'small' ? null : size === 'big' ? { x: x - 7, y: y - 6, w: 14, h: 6 } : { x: x - 12, y: y - 9, w: 24, h: 9 };
    if (size !== 'small') this.reserve(tx, ty, 1, 1);
    return this.obj({ kind: 'prop', type: 'rock', x, y, sprite: s, solid });
  }

  deco(tx: number, ty: number, kind: 'flowers' | 'reeds' | 'stump' | 'log' | 'grass', color?: string) {
    const x = tx * TILE + 8 + this.rng.int(-4, 4), y = ty * TILE + 12 + this.rng.int(-3, 3);
    let s = null;
    let solid: MapObject['solid'] = null;
    if (kind === 'flowers') s = flowerPatchSprite(this.rng.int(0, 5), color || this.rng.pick(['#f4e9a0', '#f2f0e6', '#b89ad8', '#7fa8e0', '#e8a0a8']));
    else if (kind === 'reeds') s = reedsSprite(this.rng.int(0, 5));
    else if (kind === 'stump') { s = stumpSprite(this.rng.int(0, 3)); solid = { x: x - 5, y: y - 4, w: 10, h: 4 }; }
    else if (kind === 'log') { s = logSprite(); solid = { x: x - 13, y: y - 6, w: 26, h: 6 }; }
    if (!s) return null;
    return this.obj({ kind: 'prop', type: kind, x, y, sprite: s, solid, flip: this.rng.chance(0.5) });
  }

  prop(type: string, tx: number, ty: number, o: { variant?: number; opt?: string; interact?: Interaction; key?: string; name?: string; flip?: boolean; dx?: number; dy?: number; solid?: boolean; hidden?: boolean } = {}): MapObject {
    const info = propInfo(type, o.variant ?? 0, o.opt ?? '');
    const x = tx * TILE + 8 + (o.dx ?? 0), y = ty * TILE + 15 + (o.dy ?? 0);
    const solid = o.solid === false || !info.solid ? null : { x: x - info.solid.w / 2, y: y - info.solid.h, w: info.solid.w, h: info.solid.h };
    return this.obj({
      kind: 'prop', type, x, y, sprite: info.sprite, solid, flip: o.flip,
      light: info.light ? { ...info.light, ax: 0, ay: 0 } : null, anim: info.anim, flat: info.flat,
      interact: o.interact, key: o.key, name: o.name, hidden: o.hidden,
    });
  }

  /** Invisible interaction point. */
  marker(px: number, py: number, interact: Interaction, o: { key?: string; name?: string } = {}): MapObject {
    return this.obj({ kind: 'marker', type: 'marker', x: px, y: py, sprite: null, interact, key: o.key, name: o.name });
  }

  herb(tx: number, ty: number, herb: string, key?: string) {
    if (this.isReserved(tx, ty) && !key) return null;
    const x = tx * TILE + 8 + this.rng.int(-3, 3), y = ty * TILE + 12;
    const k = key || `${this.map.id}:herb:${tx},${ty}`;
    return this.obj({ kind: 'herb', type: herb, x, y, sprite: herbSprite(herb), interact: { type: 'herb', herb, key: k }, key: k });
  }

  building(tx: number, ty: number, spec: Omit<BuildingSpec, 'seed'> & { seed?: number }, door?: DoorSpec, opts: { key?: string; name?: string; dark?: boolean } = {}): MapObject {
    const full: BuildingSpec = { seed: spec.seed ?? this.rng.int(1, 99999), ...spec } as BuildingSpec;
    const art = buildingArt(full);
    const x = (tx + spec.w / 2) * TILE, y = (ty + spec.h) * TILE;
    const walkThrough = spec.style === 'gatehouse';
    const solid = walkThrough ? null : { x: tx * TILE, y: ty * TILE, w: spec.w * TILE, h: spec.h * TILE };
    const b = this.obj({
      kind: 'building', type: spec.style, x, y, sprite: art.sprite, solid, occluder: true,
      windows: art.windows, smoke: art.smoke, key: opts.key, name: opts.name,
      data: { spec: full, dark: opts.dark },
    });
    this.reserve(tx - 1, ty - 1, spec.w + 2, spec.h + 2);
    if (walkThrough) {
      // solid wall on either side of the archway
      const aw = 2;
      const left = Math.floor((spec.w - aw) / 2);
      this.obj({ kind: 'marker', type: 'wallblock', x: tx * TILE, y: (ty + spec.h) * TILE, sprite: null, solid: { x: tx * TILE, y: ty * TILE, w: left * TILE, h: spec.h * TILE } });
      this.obj({ kind: 'marker', type: 'wallblock', x: (tx + left + aw) * TILE, y: (ty + spec.h) * TILE, sprite: null, solid: { x: (tx + left + aw) * TILE, y: ty * TILE, w: (spec.w - left - aw) * TILE, h: spec.h * TILE } });
    }
    if (door && spec.door >= 0) {
      const dx = tx * TILE + spec.door * TILE + 8;
      const dy = (ty + spec.h) * TILE + 3;
      this.marker(dx, dy, { type: 'door', to: door.to, spawn: door.spawn, locked: door.locked, key: door.key, label: door.label, owner: door.owner, night: door.night }, { name: opts.name, key: opts.key ? opts.key + ':door' : undefined });
      // keep the doorstep clear
      this.reserve(tx + spec.door, ty + spec.h, 1, 2);
    }
    return b;
  }

  spawn(name: string, tx: number, ty: number, dir = 0) {
    this.map.spawns[name] = { x: tx * TILE + 8, y: ty * TILE + 12, dir };
  }
  spawnPx(name: string, x: number, y: number, dir = 0) { this.map.spawns[name] = { x, y, dir }; }

  region(r: Region) { this.map.regions.push(r); }

  /** Scatter trees over an area wherever the ground allows. */
  forest(x0: number, y0: number, w: number, h: number, density: number, kinds: TreeKind[], ground: number[] = [T.FOREST, T.GRASS, T.MEADOW]) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (!this.map.inBounds(x, y) || this.isReserved(x, y)) continue;
      if (!ground.includes(this.get(x, y))) continue;
      const n = valueNoise(x * 0.12, y * 0.12, this.map.seed + 77);
      const d = density * (0.55 + n * 0.9);
      if (hash2(x, y, this.map.seed + 5) < d) this.tree(x, y, kinds[Math.floor(hash2(x, y, 9) * kinds.length)]);
      else if (hash2(x, y, this.map.seed + 6) < d * 0.25) this.bush(x, y, hash2(x, y, 3) < 0.2 ? this.rng.pick(['#c8302a', '#3a3a9a']) : undefined);
    }
  }

  scatter(x0: number, y0: number, w: number, h: number, chance: number, fn: (x: number, y: number) => void, ground: number[] = [T.GRASS, T.MEADOW, T.FOREST]) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      if (!this.map.inBounds(x, y) || this.isReserved(x, y)) continue;
      if (!ground.includes(this.get(x, y))) continue;
      if (this.rng.next() < chance) fn(x, y);
    }
  }

  /** Stone wall ring with gates (gaps). Walls are 3 tiles thick vertically. */
  wallRect(x: number, y: number, w: number, h: number, gates: { side: 'n' | 's' | 'e' | 'w'; at: number; width: number }[], t = T.WALL_STONE) {
    const gap = (side: string, i: number) => gates.some((g) => g.side === side && i >= g.at && i < g.at + g.width);
    for (let i = 0; i < w; i++) {
      for (let k = 0; k < 3; k++) { if (!gap('n', i)) this.set(x + i, y + k, t); if (!gap('s', i)) this.set(x + i, y + h - 3 + k, t); }
    }
    for (let j = 0; j < h; j++) {
      for (let k = 0; k < 2; k++) { if (!gap('w', j)) this.set(x + k, y + j, t); if (!gap('e', j)) this.set(x + w - 2 + k, y + j, t); }
    }
    this.reserve(x, y, w, 3); this.reserve(x, y + h - 3, w, 3); this.reserve(x, y, 2, h); this.reserve(x + w - 2, y, 2, h);
  }

  done(): GameMap {
    this.map.markDirty();
    return this.map;
  }
}

/** Helper for interior maps: a room with thick top wall, floor, and one exit door at the bottom. */
export function room(b: MapBuilder, x: number, y: number, w: number, h: number, floor: number, wall: number) {
  b.fill(x, y, w, h, wall);
  b.fill(x + 1, y + 3, w - 2, h - 4, floor);
}

export function isGround(t: number) { return !tdef(t).solid; }
