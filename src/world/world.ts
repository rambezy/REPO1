// World registry: lazily-built maps, all actors, and moving between maps.

import { G } from '../G';
import { GameMap } from './map';
import { Actor } from './actor';
import { S } from '../state';
import { emit } from '../engine/events';
import { TILE } from '../engine/util';
import { clearFx } from '../engine/fx';

const builders = new Map<string, () => GameMap>();
const maps = new Map<string, GameMap>();
/** Called whenever a map is (re)built, so story code can add its own objects. */
export const mapBuiltHooks: ((m: GameMap) => void)[] = [];

export function registerMap(id: string, build: () => GameMap) {
  builders.set(id, build);
}
export function hasMap(id: string) { return builders.has(id) || maps.has(id); }
/** Every map the world knows how to build. */
export function mapIds(): string[] { return [...builders.keys()]; }

export function getMap(id: string): GameMap {
  let m = maps.get(id);
  if (!m) {
    const b = builders.get(id);
    if (!b) throw new Error('Unknown map ' + id);
    m = b();
    maps.set(id, m);
    for (const h of mapBuiltHooks) h(m);
  }
  return m;
}

/** Throws away a built map so it is rebuilt from current flags next time. */
export function rebuildMap(id: string) {
  maps.delete(id);
}
export function clearMaps() { maps.clear(); }
export function isBuilt(id: string) { return maps.has(id); }

// ---------- actors ----------
export const actors: Actor[] = [];
let hereCache: Actor[] = [];
let hereFrame = -1;
let frameNo = 0;

export function addActor(a: Actor, mapId: string, x: number, y: number) {
  a.mapId = mapId;
  a.x = x;
  a.y = y;
  if (!actors.includes(a)) actors.push(a);
  hereFrame = -1;
  return a;
}
export function removeActor(a: Actor) {
  const i = actors.indexOf(a);
  if (i >= 0) actors.splice(i, 1);
  hereFrame = -1;
}
export function findActor(id: string): Actor | undefined {
  return actors.find((a) => a.id === id);
}
export function tickFrame() { frameNo++; }
export function invalidateHere() { hereFrame = -1; }

/** Actors on the current map (cached per frame). */
export function here(): Actor[] {
  if (hereFrame !== frameNo) {
    hereCache = actors.filter((a) => a.mapId === G.map.id);
    hereFrame = frameNo;
  }
  return hereCache;
}

export function actorsNear(x: number, y: number, r: number, pred?: (a: Actor) => boolean): Actor[] {
  return here().filter((a) => !a.hidden && Math.hypot(a.x - x, a.y - y) <= r && (!pred || pred(a)));
}

// ---------- moving between maps ----------

export function spawnPoint(map: GameMap, spawn: string | { x: number; y: number }): { x: number; y: number; dir: number } {
  if (typeof spawn !== 'string') return { x: spawn.x, y: spawn.y, dir: 0 };
  const s = map.spawns[spawn];
  if (!s) {
    console.warn('missing spawn', map.id, spawn);
    return { x: (map.w * TILE) / 2, y: (map.h * TILE) / 2, dir: 0 };
  }
  return { x: s.x, y: s.y, dir: s.dir ?? 0 };
}

/** Puts the player (and followers) on a map. Does not fade; callers handle transitions. */
export function enterMap(mapId: string, spawn: string | { x: number; y: number }, dir?: number) {
  const prev = G.map ? G.map.id : null;
  const map = getMap(mapId);
  const sp = spawnPoint(map, spawn);
  G.map = map;
  G.player.mapId = mapId;
  G.player.x = sp.x;
  G.player.y = sp.y;
  G.player.dir = (dir ?? sp.dir) as 0 | 1 | 2 | 3;
  S.mapId = mapId;
  // followers come along
  for (const a of actors) {
    if (a.mem.follow === G.player.id && a.mapId === prev && !a.dead) {
      a.mapId = mapId;
      a.x = sp.x + (Math.random() - 0.5) * 12;
      a.y = sp.y + 6;
    }
  }
  hereFrame = -1;
  if (prev !== mapId) clearFx();
  G.cam.x = G.player.x - G.viewW / 2;
  G.cam.y = G.player.y - G.viewH / 2;
  emit('map:enter', mapId, prev);
}
