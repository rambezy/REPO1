// Map data: ground tiles, placed objects, regions, spawn points and collision.

import { TILE } from '../engine/util';
import { T, tdef } from './terrain';
import { Sprite } from '../gfx/sprite';
import { PropLight } from '../gfx/props';

export type Interaction =
  | { type: 'door'; to: string; spawn: string; locked?: number; key?: string; label?: string; night?: boolean; owner?: string; oneway?: boolean }
  | { type: 'chest'; container: string; locked?: number; key?: string; owner?: string; label?: string }
  | { type: 'bed'; owner?: string; label?: string; free?: boolean }
  | { type: 'herb'; herb: string; key: string }
  | { type: 'sign'; text: string; label?: string }
  | { type: 'script'; script: string; label: string; arg?: string }
  | { type: 'bench'; bench: 'alchemy' | 'grindstone' | 'forge' | 'anvil'; label?: string }
  | { type: 'water'; label?: string; wash?: boolean }
  | { type: 'shrine'; label?: string }
  | { type: 'travel'; label?: string; place: string }
  | { type: 'item'; item: string; count: number; key?: string; owner?: string }
  | { type: 'sit'; label?: string }
  | { type: 'read'; book: string; label?: string }
  | { type: 'dice'; label?: string }
  | { type: 'notice'; board: string; label?: string }
  | { type: 'loot'; entity?: string; label?: string };

export interface MapObject {
  id: number;
  kind: 'tree' | 'building' | 'prop' | 'herb' | 'marker' | 'item';
  type: string;
  x: number;
  y: number;
  sprite: Sprite | null;
  flip?: boolean;
  solid?: { x: number; y: number; w: number; h: number } | null;
  light?: (PropLight & { ax: number; ay: number }) | null;
  anim?: string;
  flat?: boolean;
  hidden?: boolean;
  alpha?: number;
  interact?: Interaction;
  name?: string;
  key?: string;
  occluder?: boolean;
  windows?: { x: number; y: number; w?: number; h?: number }[];
  smoke?: { x: number; y: number } | null;
  /** extra draw data (e.g. building spec for re-painting when burned) */
  data?: Record<string, unknown>;
  /** interaction reach centre, if different from base */
  ix?: number;
  iy?: number;
}

export interface Region {
  id: string;
  name: string;
  x: number; y: number; w: number; h: number; // tiles
  music?: string;
  restricted?: 'night' | 'always' | 'never';
  owner?: string;
  settlement?: string; // reputation bucket
  indoor?: boolean;
}

export interface Spawn { x: number; y: number; dir?: number }

const BUCKET = 8; // tiles per spatial bucket side

export class GameMap {
  id: string;
  name: string;
  w: number;
  h: number;
  ground: Uint8Array;
  seed: number;
  outdoor: boolean;
  objects: MapObject[] = [];
  regions: Region[] = [];
  spawns: Record<string, Spawn> = {};
  music = 'village';
  /** 0 = lit like outdoors at day; 1 = pitch dark. Interiors use this as a floor. */
  ambient = 0;
  version = 0;
  parent?: string;
  private nextId = 1;
  private buckets = new Map<number, MapObject[]>();
  private tileBlock: Uint8Array;
  private dirtyIndex = true;

  constructor(id: string, name: string, w: number, h: number, fill: number, seed: number, outdoor: boolean) {
    this.id = id;
    this.name = name;
    this.w = w;
    this.h = h;
    this.ground = new Uint8Array(w * h).fill(fill);
    this.seed = seed;
    this.outdoor = outdoor;
    this.tileBlock = new Uint8Array(w * h);
  }

  inBounds(tx: number, ty: number) { return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h; }
  get(tx: number, ty: number): number {
    if (!this.inBounds(tx, ty)) return this.outdoor ? T.FOREST : T.WALL_DARK;
    return this.ground[ty * this.w + tx];
  }
  set(tx: number, ty: number, t: number) {
    if (!this.inBounds(tx, ty)) return;
    this.ground[ty * this.w + tx] = t;
  }
  fillRect(tx: number, ty: number, w: number, h: number, t: number) {
    for (let y = ty; y < ty + h; y++) for (let x = tx; x < tx + w; x++) this.set(x, y, t);
  }

  add(o: Omit<MapObject, 'id'>): MapObject {
    const obj = { ...o, id: this.nextId++ } as MapObject;
    this.objects.push(obj);
    this.dirtyIndex = true;
    return obj;
  }
  remove(o: MapObject) {
    const i = this.objects.indexOf(o);
    if (i >= 0) this.objects.splice(i, 1);
    this.dirtyIndex = true;
  }
  byKey(key: string): MapObject | undefined {
    return this.objects.find((o) => o.key === key);
  }
  markDirty() { this.dirtyIndex = true; this.version++; }

  private rebuildIndex() {
    this.buckets.clear();
    for (const o of this.objects) {
      const k = this.bucketKey(Math.floor(o.x / TILE / BUCKET), Math.floor(o.y / TILE / BUCKET));
      let arr = this.buckets.get(k);
      if (!arr) { arr = []; this.buckets.set(k, arr); }
      arr.push(o);
    }
    // tile blocking from terrain
    for (let i = 0; i < this.w * this.h; i++) this.tileBlock[i] = tdef(this.ground[i]).solid ? 1 : 0;
    this.dirtyIndex = false;
  }
  private bucketKey(bx: number, by: number) { return by * 4096 + bx; }

  /** Objects whose base point lies within the pixel rect (with padding for tall sprites). */
  queryObjects(x0: number, y0: number, x1: number, y1: number): MapObject[] {
    if (this.dirtyIndex) this.rebuildIndex();
    const out: MapObject[] = [];
    const bx0 = Math.floor(x0 / TILE / BUCKET) - 1, by0 = Math.floor(y0 / TILE / BUCKET) - 1;
    const bx1 = Math.floor(x1 / TILE / BUCKET) + 1, by1 = Math.floor(y1 / TILE / BUCKET) + 1;
    for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
      const arr = this.buckets.get(this.bucketKey(bx, by));
      if (arr) for (const o of arr) if (o.x >= x0 && o.x <= x1 && o.y >= y0 && o.y <= y1) out.push(o);
    }
    return out;
  }

  tileSolid(tx: number, ty: number): boolean {
    if (this.dirtyIndex) this.rebuildIndex();
    if (!this.inBounds(tx, ty)) return true;
    return this.tileBlock[ty * this.w + tx] === 1;
  }

  /** True if the pixel-space AABB overlaps any solid terrain or object footprint. */
  blocked(x0: number, y0: number, x1: number, y1: number, ignore?: MapObject): boolean {
    if (this.dirtyIndex) this.rebuildIndex();
    const tx0 = Math.floor(x0 / TILE), ty0 = Math.floor(y0 / TILE);
    const tx1 = Math.floor((x1 - 0.001) / TILE), ty1 = Math.floor((y1 - 0.001) / TILE);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) if (this.tileSolid(tx, ty)) return true;
    const near = this.queryObjects(x0 - 64, y0 - 16, x1 + 64, y1 + 96);
    for (const o of near) {
      if (!o.solid || o.hidden || o === ignore) continue;
      const s = o.solid;
      if (x1 > s.x && x0 < s.x + s.w && y1 > s.y && y0 < s.y + s.h) return true;
    }
    return false;
  }

  /** Walkability of a tile centre for path-finding (checks objects too). */
  walkableTile(tx: number, ty: number): boolean {
    if (this.tileSolid(tx, ty)) return false;
    const cx = tx * TILE + 8, cy = ty * TILE + 8;
    return !this.blocked(cx - 4, cy - 3, cx + 4, cy + 3);
  }

  regionAt(px: number, py: number): Region | undefined {
    const tx = px / TILE, ty = py / TILE;
    let best: Region | undefined;
    for (const r of this.regions) {
      if (tx >= r.x && ty >= r.y && tx < r.x + r.w && ty < r.y + r.h) {
        if (!best || r.w * r.h < best.w * best.h) best = r; // most specific wins
      }
    }
    return best;
  }

  speedAt(px: number, py: number): number {
    return tdef(this.get(Math.floor(px / TILE), Math.floor(py / TILE))).speed;
  }
  soundAt(px: number, py: number) {
    return tdef(this.get(Math.floor(px / TILE), Math.floor(py / TILE))).sound;
  }
}
