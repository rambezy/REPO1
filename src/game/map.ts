// Map runtime: grid, actors, objects and ground items for the current map.

import { hexDist, hexKey, hexLine, neighbors, type Hex } from '../core/hex';
import type { Actor, GroundItem, LegendEntry, MapDef, MapObject } from './types';
import { G, nextUid } from './G';
import { MAPS } from '../content/registry';
import { makeActor } from './actors';
import { ctx } from './script';
import { rand } from '../core/rng';

export const T_VOID = 0;
export const T_FLOOR = 1;
export const T_WALL = 2;
export const T_WATER = 3;

const DEFAULT_LEGEND: Record<string, LegendEntry> = {
  '.': { floor: '$floor' },
  ',': { floor: '$floor2' },
  '#': { wall: '$wall' },
  '%': { wall: '$wall2' },
  '~': { water: true },
  '"': { floor: '$floor', decor: 'scrub' },
  ';': { floor: '$floor', decor: 'rubble' },
  '=': { floor: 'tile' },
  '_': { floor: 'metal' },
  ':': { floor: 'dirt' },
  '+': { floor: '$floor', door: {} },
  'o': { floor: '$floor', block: 'rock' },
  'T': { floor: '$floor', block: 'deadtree' },
  'Y': { floor: '$floor', block: 'cactus' },
  '>': { floor: '$floor', exit: 'out' },
};

export class MapRuntime {
  def: MapDef;
  w: number;
  h: number;
  tile: Uint8Array;
  floorMat: string[];
  wallMat: string[];
  decor: (string | undefined)[];
  exitAt = new Map<number, string>();
  markers: Record<string, Hex[]> = {};
  actors: Actor[] = [];
  objects: MapObject[] = [];
  ground: GroundItem[] = [];
  seen: Uint8Array;
  version = 0; // bumps when static geometry changes (for renderer caches)
  radZones: { q: number; r: number; radius: number; perMin: number }[] = [];

  constructor(def: MapDef) {
    this.def = def;
    this.h = def.rows.length;
    this.w = Math.max(...def.rows.map((r) => r.length));
    const n = this.w * this.h;
    this.tile = new Uint8Array(n);
    this.floorMat = new Array(n).fill(def.floor);
    this.wallMat = new Array(n).fill('');
    this.decor = new Array(n);
    this.seen = new Uint8Array(n);
    const legend = { ...DEFAULT_LEGEND, ...(def.legend ?? {}) };
    const resolve = (m: string | undefined, fallback: string) => {
      if (!m) return fallback;
      if (m === '$floor') return def.floor;
      if (m === '$floor2') return def.floor2 ?? def.floor;
      if (m === '$wall') return def.wall;
      if (m === '$wall2') return def.wall2 ?? def.wall;
      return m;
    };
    const pendingDoors: { q: number; r: number; e: LegendEntry }[] = [];
    const pendingBlocks: { q: number; r: number; kind: string }[] = [];
    for (let r = 0; r < this.h; r++) {
      const row = def.rows[r];
      for (let q = 0; q < this.w; q++) {
        const ch = row[q] ?? ' ';
        const i = r * this.w + q;
        if (ch === ' ') {
          this.tile[i] = T_VOID;
          continue;
        }
        const e = legend[ch];
        if (!e) {
          // Marker: floor underneath, position recorded.
          this.tile[i] = T_FLOOR;
          (this.markers[ch] ??= []).push({ q, r });
          continue;
        }
        if (e.marker) (this.markers[e.marker] ??= []).push({ q, r });
        if (e.wall) {
          this.tile[i] = T_WALL;
          this.wallMat[i] = resolve(e.wall, def.wall);
          this.floorMat[i] = resolve(e.floor, def.floor);
        } else if (e.water) {
          this.tile[i] = T_WATER;
          this.floorMat[i] = 'water';
        } else {
          this.tile[i] = T_FLOOR;
          this.floorMat[i] = resolve(e.floor, def.floor);
        }
        if (e.decor) this.decor[i] = e.decor;
        if (e.exit) this.exitAt.set(i, e.exit);
        if (e.door) pendingDoors.push({ q, r, e });
        if (e.block) pendingBlocks.push({ q, r, kind: e.block });
      }
    }
    // Solid rock deep inside wall masses is drawn as void, so only the
    // walls that face open ground are rendered.
    const deep: number[] = [];
    for (let r = 0; r < this.h; r++) {
      for (let q = 0; q < this.w; q++) {
        const i = r * this.w + q;
        if (this.tile[i] !== T_WALL) continue;
        let open = false;
        for (let dr = -1; dr <= 1 && !open; dr++) {
          for (let dq = -1; dq <= 1 && !open; dq++) {
            const t = this.tileAt(q + dq, r + dr);
            if (t === T_FLOOR || t === T_WATER) open = true;
          }
        }
        if (!open) deep.push(i);
      }
    }
    for (const i of deep) this.tile[i] = T_VOID;
    this.staticDoors = pendingDoors;
    this.staticBlocks = pendingBlocks;
    for (const z of def.rads ?? []) {
      const p = this.pos(z.at);
      if (p) this.radZones.push({ q: p.q, r: p.r, radius: z.radius, perMin: z.perMin });
    }
  }

  staticDoors: { q: number; r: number; e: LegendEntry }[];
  staticBlocks: { q: number; r: number; kind: string }[];

  inBounds(q: number, r: number): boolean {
    return q >= 0 && r >= 0 && q < this.w && r < this.h;
  }
  idx(q: number, r: number): number {
    return r * this.w + q;
  }
  tileAt(q: number, r: number): number {
    return this.inBounds(q, r) ? this.tile[r * this.w + q] : T_VOID;
  }

  /** Resolve a marker char or coordinate pair to a hex. */
  pos(at: string | [number, number], nth = 0): Hex | null {
    if (Array.isArray(at)) return { q: at[0], r: at[1] };
    const list = this.markers[at];
    if (!list || !list.length) return null;
    return list[Math.min(nth, list.length - 1)];
  }

  objectAt(q: number, r: number): MapObject | undefined {
    for (const o of this.objects) if (o.q === q && o.r === r && !o.hidden) return o;
    return undefined;
  }

  objectsAt(q: number, r: number): MapObject[] {
    return this.objects.filter((o) => o.q === q && o.r === r && !o.hidden);
  }

  actorAt(q: number, r: number, includeDead = false): Actor | undefined {
    for (const a of this.actors) if (a.q === q && a.r === r && (includeDead || !a.dead)) return a;
    return undefined;
  }

  objBlocks(o: MapObject): boolean {
    if (o.hidden) return false;
    if (o.kind === 'door' || o.kind === 'hatch' || o.kind === 'gate') return !o.open;
    return o.blocks !== false;
  }

  /** Static passability, ignoring actors. */
  walkable(q: number, r: number, opts: { ignoreDoors?: boolean } = {}): boolean {
    if (this.tileAt(q, r) !== T_FLOOR) return false;
    for (const o of this.objects) {
      if (o.q !== q || o.r !== r || o.hidden) continue;
      const isDoor = o.kind === 'door' || o.kind === 'hatch' || o.kind === 'gate';
      if (isDoor) {
        if (!o.open && !(opts.ignoreDoors && !o.locked)) return false;
      } else if (o.blocks !== false) return false;
    }
    return true;
  }

  passable(q: number, r: number, self?: Actor, opts: { ignoreDoors?: boolean; ignoreActors?: boolean } = {}): boolean {
    if (!this.walkable(q, r, opts)) return false;
    if (opts.ignoreActors) return true;
    const a = this.actorAt(q, r);
    return !a || a === self;
  }

  blocksSight(q: number, r: number): boolean {
    const t = this.tileAt(q, r);
    if (t === T_WALL || t === T_VOID) return true;
    for (const o of this.objects) {
      if (o.q === q && o.r === r && !o.hidden) {
        if ((o.kind === 'door' || o.kind === 'hatch' || o.kind === 'gate') && !o.open) return true;
        if (o.kind === 'rockwall') return true;
      }
    }
    return false;
  }

  /** Line of sight between hexes; the end cells themselves are not checked. */
  los(a: Hex, b: Hex): boolean {
    const line = hexLine(a, b);
    for (let i = 1; i < line.length - 1; i++) if (this.blocksSight(line[i].q, line[i].r)) return false;
    return true;
  }

  freeNear(h: Hex, maxR = 6): Hex | null {
    if (this.passable(h.q, h.r)) return h;
    const seen = new Set([hexKey(h.q, h.r)]);
    let frontier = [h];
    for (let d = 0; d < maxR; d++) {
      const next: Hex[] = [];
      for (const c of frontier) {
        for (const n of neighbors(c)) {
          const k = hexKey(n.q, n.r);
          if (seen.has(k)) continue;
          seen.add(k);
          if (this.passable(n.q, n.r) && !this.exitAt.has(this.idx(n.q, n.r))) return n;
          if (this.walkable(n.q, n.r, { ignoreDoors: true })) next.push(n);
        }
      }
      frontier = next;
    }
    return null;
  }

  livingActors(): Actor[] {
    return this.actors.filter((a) => !a.dead);
  }

  groundAt(q: number, r: number): GroundItem[] {
    return this.ground.filter((g) => g.q === q && g.r === r);
  }

  dropItem(q: number, r: number, id: string, n: number, extra: Partial<GroundItem['stack']> = {}) {
    const ex = this.ground.find((g) => g.q === q && g.r === r && g.stack.id === id && g.stack.ammo === undefined && extra.ammo === undefined);
    if (ex) ex.stack.n += n;
    else this.ground.push({ q, r, stack: { id, n, ...extra } });
  }

  radsAt(q: number, r: number): number {
    let p = 0;
    for (const z of this.radZones) {
      const d = hexDist({ q, r }, z);
      if (d <= z.radius) p += z.perMin * (1 - d / (z.radius + 1));
    }
    return p;
  }

  save() {
    const keep = this.actors.filter((a) => a.uid !== 'player' && !a.companion);
    for (const a of keep) stripRuntime(a);
    G.state.maps[this.def.id] = {
      actors: keep,
      objects: this.objects,
      ground: this.ground,
      visited: G.state.time,
      seen: encodeBits(this.seen),
    };
  }
}

export function stripRuntime(a: Actor) {
  delete a._ap;
  delete a._path;
  delete a._move;
  delete a._anim;
  delete a._bark;
  delete a._next;
  delete a._seen;
  delete a._acBonus;
  delete a._flash;
}

export function encodeBits(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 6) {
    let v = 0;
    for (let j = 0; j < 6; j++) if (b[i + j]) v |= 1 << j;
    s += String.fromCharCode(48 + v);
  }
  return s;
}

export function decodeBits(s: string, b: Uint8Array) {
  for (let i = 0; i < s.length; i++) {
    const v = s.charCodeAt(i) - 48;
    for (let j = 0; j < 6; j++) if (i * 6 + j < b.length) b[i * 6 + j] = (v >> j) & 1;
  }
}

function doorOrientation(m: MapRuntime, q: number, r: number): boolean {
  // true when the wall runs along r (the door faces east/west)
  const wallE = m.tileAt(q + 1, r) === T_WALL || m.tileAt(q - 1, r) === T_WALL;
  return !wallE;
}

/** Build the runtime for a map, restoring saved state or spawning fresh. */
export function loadMap(id: string): MapRuntime {
  const def = MAPS[id];
  if (!def) throw new Error('Unknown map ' + id);
  const m = new MapRuntime(def);
  const saved = G.state.maps[id];
  const c = ctx();
  if (saved) {
    m.actors = saved.actors;
    m.objects = saved.objects;
    m.ground = saved.ground;
    if (saved.seen) decodeBits(saved.seen, m.seen);
  } else {
    for (const d of m.staticDoors) {
      m.objects.push({ id: 'door_' + d.q + '_' + d.r, kind: 'door', q: d.q, r: d.r, open: false, locked: d.e.door?.locked ?? 0, key: d.e.door?.key, vertical: doorOrientation(m, d.q, d.r) });
    }
    for (const b of m.staticBlocks) {
      m.objects.push({ id: 'b_' + b.q + '_' + b.r, kind: b.kind, q: b.q, r: b.r, blocks: true });
    }
    for (const o of def.objects ?? []) {
      if (o.if && !o.if(c)) continue;
      const p = m.pos(o.at);
      if (!p) {
        console.warn('object marker missing', id, o.at);
        continue;
      }
      const isDoor = o.kind === 'door' || o.kind === 'hatch' || o.kind === 'gate';
      if (isDoor) {
        // Replace an auto door on the same cell.
        m.objects = m.objects.filter((x) => !(x.kind === 'door' && x.q === p.q && x.r === p.r));
      }
      m.objects.push({
        id: o.id ?? o.kind + '_' + p.q + '_' + p.r,
        kind: o.kind,
        q: p.q,
        r: p.r,
        name: o.name,
        desc: o.desc,
        inv: o.inv ? o.inv.map((s) => ({ id: s.id, n: s.n ?? 1 })) : undefined,
        container: !!o.inv || CONTAINER_KINDS.has(o.kind),
        locked: o.locked ?? 0,
        key: o.key,
        trap: o.trap,
        onUse: o.onUse,
        blocks: o.blocks ?? !FLAT_KINDS.has(o.kind),
        tint: o.tint,
        facing: o.facing,
        open: isDoor ? false : undefined,
        vertical: isDoor ? doorOrientation(m, p.q, p.r) : undefined,
      });
      const last = m.objects[m.objects.length - 1];
      if (last.container && !last.inv) last.inv = [];
    }
    for (const it of def.items ?? []) {
      const p = m.pos(it.at);
      if (p) m.dropItem(p.q, p.r, it.id, it.n ?? 1);
    }
    for (const s of def.npcs ?? []) {
      if (s.if && !s.if(c)) continue;
      spawnFromDef(m, s);
    }
  }
  // Conditional NPC spawns are re-evaluated on every entry.
  if (saved) {
    for (const s of def.npcs ?? []) {
      if (!s.id || !s.if) continue;
      const present = m.actors.find((a) => a.npc === s.id);
      const want = s.if(c);
      if (want && !present && !G.state.flags['gone:' + s.id]) spawnFromDef(m, s);
      else if (!want && present && !present.dead) m.actors = m.actors.filter((a) => a !== present);
    }
  }
  return m;
}

export const CONTAINER_KINDS = new Set(['crate', 'locker', 'desk', 'footlocker', 'fridge', 'bookcase', 'shelf', 'chest', 'safe', 'cabinet', 'barrelc', 'toolbox', 'bag']);
export const FLAT_KINDS = new Set(['rug', 'blood', 'bones', 'puddle', 'grate', 'sign_floor', 'mat', 'bedroll', 'tracks', 'pile']);

export function spawnFromDef(m: MapRuntime, s: import('./types').NpcSpawn): Actor[] {
  const out: Actor[] = [];
  const count = s.count ?? 1;
  for (let i = 0; i < count; i++) {
    let p = m.pos(s.at, i);
    if (!p) {
      console.warn('npc marker missing', m.def.id, s.at);
      continue;
    }
    if (count > 1 && i > 0 && (m.markers[s.at as string]?.length ?? 0) <= i) {
      p = { q: p.q + rand(-2, 2), r: p.r + rand(-2, 2) };
    }
    const free = m.freeNear(p) ?? p;
    const a = makeActor(s.proto, {
      uid: nextUid(),
      q: free.q,
      r: free.r,
      name: s.name,
      npc: s.id && count === 1 ? s.id : s.id ? s.id + '_' + i : undefined,
      dialog: s.dialog,
      team: s.team,
      hostile: s.hostile,
      wander: s.wander,
      barter: s.barter,
      inv: s.inv,
      equip: s.equip,
      facing: s.facing,
      essential: s.essential,
      look: s.look,
      hp: s.hp,
    });
    m.actors.push(a);
    out.push(a);
  }
  return out;
}

export function nearestFreeTo(m: MapRuntime, h: Hex, from: Hex): Hex | null {
  let best: Hex | null = null;
  let bd = Infinity;
  for (const n of neighbors(h)) {
    if (!m.passable(n.q, n.r)) continue;
    const d = hexDist(n, from);
    if (d < bd) {
      bd = d;
      best = n;
    }
  }
  return best;
}
