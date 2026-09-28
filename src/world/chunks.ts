// Terrain chunk cache. Chunks are rendered in a web worker when possible and
// drawn from cached canvases; missing chunks fall back to flat colours.

import { CHUNK, TS, chunkWindow, renderChunkPixels, drawWaterGlints } from '../gfx/terrainArt';
import { GameMap } from './map';
import { makeCanvas } from '../gfx/pixel';
import { T } from './terrain';
import ChunkWorker from '../gfx/chunkWorker?worker&inline';

const PX = CHUNK * TS;

interface Entry { canvas: HTMLCanvasElement | null; version: number; pending: boolean; lastUsed: number }

const FALLBACK: Record<number, string> = {
  [T.GRASS]: '#4b7d33', [T.FOREST]: '#35592a', [T.MEADOW]: '#5a8f3b', [T.DIRT]: '#765637', [T.ROAD]: '#937553',
  [T.COBBLE]: '#75757c', [T.SAND]: '#bca46f', [T.MUD]: '#3d2e20', [T.FIELD]: '#5e432c', [T.WATER]: '#29557f', [T.DEEP]: '#1f4166',
  [T.ROCK]: '#5b5b63', [T.ASH]: '#2b2826', [T.FLAGSTONE]: '#75757c', [T.WOOD]: '#8a5c33', [T.STRAW]: '#8f6b46', [T.CARPET]: '#6e1f1f',
  [T.WALL_STONE]: '#44444c', [T.WALL_PLASTER]: '#3b2a1c', [T.WALL_WOOD]: '#4f321e', [T.WALL_DARK]: '#0b0807', [T.BRIDGE]: '#8a5c33',
  [T.BRIDGE_V]: '#8a5c33', [T.FORD]: '#356b98', [T.WHEAT]: '#b08a3a', [T.VEG]: '#5e432c', [T.GRAVEL]: '#75757c', [T.WALL_CAVE]: '#2c2622', [T.BURNT_WHEAT]: '#2b2826',
};

class ChunkCache {
  private maps = new Map<string, Map<number, Entry>>();
  private worker: Worker | null = null;
  private reqId = 1;
  private inflight = new Map<number, { mapId: string; key: number; version: number }>();
  private frame = 0;
  private syncBudget = 0;

  constructor() {
    try {
      this.worker = new ChunkWorker();
      this.worker.onmessage = (e) => this.onResult(e.data);
      this.worker.onerror = () => { this.worker = null; };
    } catch {
      this.worker = null;
    }
  }

  private table(mapId: string) {
    let t = this.maps.get(mapId);
    if (!t) { t = new Map(); this.maps.set(mapId, t); }
    return t;
  }

  private onResult(d: { id: number; cx: number; cy: number; buf: ArrayBuffer }) {
    const info = this.inflight.get(d.id);
    this.inflight.delete(d.id);
    if (!info) return;
    const t = this.table(info.mapId);
    const e = t.get(info.key);
    if (!e) return;
    e.pending = false;
    if (e.version > info.version) return; // stale; will be re-requested
    e.canvas = toCanvas(new Uint32Array(d.buf));
    e.version = info.version;
  }

  invalidate(map: GameMap) {
    map.version++;
  }

  /** Drop everything cached for a map (e.g. after it was rebuilt). */
  forget(mapId: string) {
    this.maps.delete(mapId);
  }

  private request(map: GameMap, cx: number, cy: number, key: number, e: Entry) {
    const version = map.version;
    if (this.worker) {
      const id = this.reqId++;
      e.pending = true;
      this.inflight.set(id, { mapId: map.id, key, version });
      const src = chunkWindow(map, cx, cy);
      this.worker.postMessage({ id, src, cx, cy });
    } else if (this.syncBudget > 0) {
      this.syncBudget--;
      const out = new Uint32Array(PX * PX);
      renderChunkPixels(map, cx, cy, out);
      e.canvas = toCanvas(out);
      e.version = version;
    }
  }

  /** Ensure chunks around the view exist; call once per frame before drawing. */
  prepare(map: GameMap, x0: number, y0: number, x1: number, y1: number, margin = 1) {
    this.frame++;
    this.syncBudget = 1;
    const t = this.table(map.id);
    const cx0 = Math.max(0, Math.floor(x0 / PX) - margin), cy0 = Math.max(0, Math.floor(y0 / PX) - margin);
    const cx1 = Math.min(Math.ceil(map.w / CHUNK) - 1, Math.floor(x1 / PX) + margin);
    const cy1 = Math.min(Math.ceil(map.h / CHUNK) - 1, Math.floor(y1 / PX) + margin);
    // visible first, then margin ring
    const order: [number, number][] = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) order.push([cx, cy]);
    const mx = (x0 + x1) / 2 / PX, my = (y0 + y1) / 2 / PX;
    order.sort((a, b) => Math.hypot(a[0] + 0.5 - mx, a[1] + 0.5 - my) - Math.hypot(b[0] + 0.5 - mx, b[1] + 0.5 - my));
    for (const [cx, cy] of order) {
      const key = cy * 1000 + cx;
      let e = t.get(key);
      if (!e) { e = { canvas: null, version: -1, pending: false, lastUsed: this.frame }; t.set(key, e); }
      e.lastUsed = this.frame;
      if (e.version !== map.version && !e.pending) this.request(map, cx, cy, key, e);
    }
    // evict old chunks
    if (t.size > 90) {
      const entries = [...t.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      for (let i = 0; i < entries.length - 70; i++) t.delete(entries[i][0]);
    }
  }

  /** True once every chunk in the rect has a canvas (used to hide pop-in after teleports). */
  ready(map: GameMap, x0: number, y0: number, x1: number, y1: number): boolean {
    const t = this.table(map.id);
    for (let cy = Math.max(0, Math.floor(y0 / PX)); cy <= Math.min(Math.ceil(map.h / CHUNK) - 1, Math.floor(y1 / PX)); cy++)
      for (let cx = Math.max(0, Math.floor(x0 / PX)); cx <= Math.min(Math.ceil(map.w / CHUNK) - 1, Math.floor(x1 / PX)); cx++) {
        const e = t.get(cy * 1000 + cx);
        if (!e || !e.canvas) return false;
      }
    return true;
  }

  draw(ctx: CanvasRenderingContext2D, map: GameMap, x0: number, y0: number, x1: number, y1: number, time: number) {
    const t = this.table(map.id);
    const cx0 = Math.max(0, Math.floor(x0 / PX)), cy0 = Math.max(0, Math.floor(y0 / PX));
    const cx1 = Math.floor(x1 / PX), cy1 = Math.floor(y1 / PX);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx * CHUNK >= map.w || cy * CHUNK >= map.h) continue;
      const e = t.get(cy * 1000 + cx);
      if (e && e.canvas) ctx.drawImage(e.canvas, cx * PX, cy * PX);
      else this.drawFallback(ctx, map, cx, cy);
    }
    // outside-of-map fill for interiors
    drawWaterGlints(ctx, map, Math.floor(x0 / TS), Math.floor(y0 / TS), Math.floor(x1 / TS), Math.floor(y1 / TS), time);
  }

  private drawFallback(ctx: CanvasRenderingContext2D, map: GameMap, cx: number, cy: number) {
    for (let ty = cy * CHUNK; ty < Math.min(map.h, (cy + 1) * CHUNK); ty++) for (let tx = cx * CHUNK; tx < Math.min(map.w, (cx + 1) * CHUNK); tx++) {
      ctx.fillStyle = FALLBACK[map.get(tx, ty)] || '#000';
      ctx.fillRect(tx * TS, ty * TS, TS, TS);
    }
  }
}

function toCanvas(px: Uint32Array): HTMLCanvasElement {
  const c = makeCanvas(PX, PX);
  const bytes = new Uint8ClampedArray(px.buffer as ArrayBuffer, px.byteOffset, px.byteLength);
  c.getContext('2d')!.putImageData(new ImageData(bytes, PX, PX), 0, 0);
  return c;
}

export const chunks = new ChunkCache();
