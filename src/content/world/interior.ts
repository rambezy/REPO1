// Interior builder: a room with a tall back wall, furnishings placed in
// floor-local tile coordinates, a door back out, and named spots for NPCs.

import { MapBuilder } from '../../world/build';
import { T } from '../../world/terrain';
import { registerMap } from '../../world/world';
import { GameMap, Interaction } from '../../world/map';
import { TILE, hashStr } from '../../engine/util';

export interface RoomOpts {
  w: number; // floor width in tiles
  h: number; // floor height in tiles
  floor?: number;
  wall?: number;
  parent?: string;
  ambient?: number;
  music?: string;
  settlement?: string;
  doorX?: number; // floor-local x of the exit (default centre)
  region?: string;
  restricted?: 'night' | 'always';
  owner?: string;
}

export class Room {
  b: MapBuilder;
  o: Required<Pick<RoomOpts, 'w' | 'h' | 'floor' | 'wall'>> & RoomOpts;
  ox = 1; // floor origin in map tiles
  oy = 3;
  constructor(public id: string, public name: string, o: RoomOpts) {
    this.o = { floor: T.WOOD, wall: T.WALL_PLASTER, ...o };
    const W = o.w + 2, H = o.h + 4;
    this.b = new MapBuilder(id, name, W, H, T.WALL_DARK, hashStr(id) % 100000, false);
    const b = this.b;
    b.fill(0, 0, W, H, this.o.wall);
    b.fill(1, 3, o.w, o.h, this.o.floor);
    const dx = 1 + (o.doorX ?? Math.floor(o.w / 2));
    b.set(dx, H - 1, this.o.floor);
    const m = b.map;
    m.ambient = o.ambient ?? 0.42;
    m.music = o.music || '';
    m.parent = o.parent || 'overworld';
    b.region({ id: id, name, x: 0, y: 0, w: W, h: H, settlement: o.settlement, restricted: o.restricted, owner: o.owner, indoor: true });
    // exit
    b.marker(dx * TILE + 8, (H - 1) * TILE + 10, { type: 'door', to: m.parent!, spawn: id + '_out', label: 'Leave' }, { key: id + ':exit' });
    b.spawnPx('door', dx * TILE + 8, (H - 2) * TILE + 12, 3);
  }
  /** floor-local tile -> map tile */
  X(fx: number) { return this.ox + fx; }
  Y(fy: number) { return this.oy + fy; }
  prop(type: string, fx: number, fy: number, o: Parameters<MapBuilder['prop']>[3] = {}) {
    return this.b.prop(type, this.X(fx), this.Y(fy), o);
  }
  /** props mounted on the back wall (fy = -1 is the lower face row) */
  wallProp(type: string, fx: number, o: Parameters<MapBuilder['prop']>[3] = {}) {
    return this.b.prop(type, this.X(fx), this.Y(-1), { ...o, solid: false, dy: -2 });
  }
  window(fx: number) {
    const w = this.wallProp('window', fx, { opt: 'day' });
    // daylight through the glass
    w.data = { ...(w.data || {}), window: true };
    return w;
  }
  bed(fx: number, fy: number, owner: string, blanket?: string, straw = false) {
    return this.prop(straw ? 'bed_straw' : 'bed', fx, fy + 1, { opt: blanket, interact: { type: 'bed', owner, label: owner === 'player' ? 'Sleep in your bed' : undefined } });
  }
  chest(fx: number, fy: number, container: string, o: { owner?: string; locked?: number; key?: string; label?: string } = {}) {
    return this.prop('chest', fx, fy, { interact: { type: 'chest', container, owner: o.owner ?? this.o.owner, locked: o.locked, key: o.key, label: o.label } });
  }
  spot(name: string, fx: number, fy: number, dir = 0) {
    this.b.spawnPx(name, this.X(fx) * TILE + 8, this.Y(fy) * TILE + 12, dir);
  }
  interact(fx: number, fy: number, it: Interaction, key?: string) {
    return this.b.marker(this.X(fx) * TILE + 8, this.Y(fy) * TILE + 12, it, { key });
  }
  /** px position of a floor-local tile centre (for NPC schedules) */
  px(fx: number, fy: number) { return { x: this.X(fx) * TILE + 8, y: this.Y(fy) * TILE + 12 }; }
  done(): GameMap { return this.b.done(); }
}

export const ROOM_SPOTS: Record<string, Record<string, { x: number; y: number }>> = {};

/** Registers an interior map built lazily by `build`. */
export function interior(id: string, name: string, o: RoomOpts, furnish: (r: Room) => void) {
  registerMap(id, () => {
    const r = new Room(id, name, o);
    furnish(r);
    const m = r.done();
    ROOM_SPOTS[id] = Object.fromEntries(Object.entries(m.spawns).map(([k, v]) => [k, { x: v.x, y: v.y }]));
    return m;
  });
}

/** Spot lookup that builds the map if needed (for schedules). */
import { getMap } from '../../world/world';
export function spotOf(mapId: string, name: string): { x: number; y: number } {
  const m = getMap(mapId);
  const s = m.spawns[name];
  if (!s) { console.warn('missing spot', mapId, name); return { x: m.w * 8, y: m.h * 8 }; }
  return { x: s.x, y: s.y };
}
