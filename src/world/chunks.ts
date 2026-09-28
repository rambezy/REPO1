// Ground chunk cache. Chunks are painted in web workers when possible and
// drawn from cached canvases; missing chunks fall back to flat colours.

import { CHUNK, TS, PX, chunkWindow, renderGround, groundSize } from '../gfx/ground/render';
import { TexCache, MatName, MatTex, ALL_MATS } from '../gfx/ground/textures';
import { drawWaterFx } from '../gfx/ground/water';
import { GameMap } from './map';
import { newCanvas } from '../gfx/paint';
import { T } from './terrain';
import { G } from '../G';
import ChunkWorker from '../gfx/chunkWorker?worker&inline';

interface Entry { canvas: HTMLCanvasElement | null; version: number; pending: boolean; lastUsed: number; rough?: HTMLCanvasElement }

const FALLBACK: Record<number, string> = {
  [T.GRASS]: '#4f7632', [T.FOREST]: '#34482a', [T.MEADOW]: '#5a8438', [T.DIRT]: '#76573a', [T.ROAD]: '#957853',
  [T.COBBLE]: '#7a746a', [T.SAND]: '#c4ab80', [T.MUD]: '#4b3827', [T.FIELD]: '#6a4c34', [T.WATER]: '#39707a', [T.DEEP]: '#1f4c62',
  [T.ROCK]: '#6c6862', [T.ASH]: '#2d2927', [T.FLAGSTONE]: '#8e8a82', [T.WOOD]: '#8a5c34', [T.STRAW]: '#8a7048', [T.CARPET]: '#6e1f1f',
  [T.WALL_STONE]: '#7c7870', [T.WALL_PLASTER]: '#2b1e14', [T.WALL_WOOD]: '#4f321e', [T.WALL_DARK]: '#0b0807', [T.BRIDGE]: '#7a6a58',
  [T.BRIDGE_V]: '#7a6a58', [T.FORD]: '#5d8a7c', [T.WHEAT]: '#b8923e', [T.VEG]: '#5a412b', [T.GRAVEL]: '#6f6b64', [T.WALL_CAVE]: '#26211e', [T.BURNT_WHEAT]: '#1f1b19',
};

class ChunkCache {
  private maps = new Map<string, Map<number, Entry>>();
  private workers: { w: Worker; busy: number }[] = [];
  private reqId = 1;
  private inflight = new Map<number, { mapId: string; key: number; version: number; worker: number }>();
  private frame = 0;
  private syncBudget = 0;
  private tr = 0;
  private tex: TexCache | null = null;

  /** Texels per world unit for the ground, chosen once from the display density. */
  private init() {
    if (this.tex) return;
    const k = G.scale * G.dpr;
    this.tr = k >= 2.6 ? 3 : 2;
    this.tex = new TexCache(this.tr);
    // workers paint their own textures when they have an OffscreenCanvas;
    // otherwise the main thread paints them once and sends them over
    const offscreen = typeof OffscreenCanvas !== 'undefined' && !!OffscreenCanvas.prototype.getContext;
    let shared: Record<string, MatTex> | undefined;
    const n = Math.max(1, Math.min(3, (navigator.hardwareConcurrency || 2) - 1));
    for (let i = 0; i < n; i++) {
      try {
        const w = new ChunkWorker();
        const slot = { w, busy: 0 };
        const idx = this.workers.length;
        w.onmessage = (e) => this.onResult(e.data, idx);
        w.onerror = () => { const j = this.workers.indexOf(slot); if (j >= 0) this.workers.splice(j, 1); };
        if (!offscreen && !shared) { shared = {}; for (const m of ALL_MATS) shared[m] = this.tex.get(m as MatName); }
        w.postMessage({ type: 'init', tr: this.tr, tex: shared });
        this.workers.push(slot);
      } catch {
        break;
      }
    }
  }

  private table(mapId: string) {
    let t = this.maps.get(mapId);
    if (!t) { t = new Map(); this.maps.set(mapId, t); }
    return t;
  }

  private onResult(d: { id: number; cx: number; cy: number; buf: ArrayBuffer }, wi: number) {
    const info = this.inflight.get(d.id);
    this.inflight.delete(d.id);
    if (this.workers[wi]) this.workers[wi].busy = Math.max(0, this.workers[wi].busy - 1);
    if (!info) return;
    const t = this.table(info.mapId);
    const e = t.get(info.key);
    if (!e) return;
    e.pending = false;
    if (e.version > info.version) return; // stale; will be re-requested
    e.canvas = this.toCanvas(new Uint32Array(d.buf));
    e.version = info.version;
  }

  invalidate(map: GameMap) {
    map.groundVersion++;
  }

  /** Drop everything cached for a map (e.g. after it was rebuilt). */
  forget(mapId: string) {
    this.maps.delete(mapId);
  }

  private request(map: GameMap, cx: number, cy: number, key: number, e: Entry) {
    const version = map.groundVersion;
    if (this.workers.length) {
      let wi = 0;
      for (let i = 1; i < this.workers.length; i++) if (this.workers[i].busy < this.workers[wi].busy) wi = i;
      const id = this.reqId++;
      e.pending = true;
      this.workers[wi].busy++;
      this.inflight.set(id, { mapId: map.id, key, version, worker: wi });
      const src = chunkWindow(map, cx, cy);
      this.workers[wi].w.postMessage({ id, src, cx, cy });
    } else if (this.syncBudget > 0) {
      this.syncBudget--;
      const n = groundSize(this.tr);
      const out = new Uint32Array(n * n);
      renderGround(map, cx, cy, this.tr, this.tex!, out);
      e.canvas = this.toCanvas(out);
      e.version = version;
    }
  }

  /** Ensure chunks around the view exist; call once per frame before drawing. */
  prepare(map: GameMap, x0: number, y0: number, x1: number, y1: number, margin = 1) {
    this.init();
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
      if (e.version !== map.groundVersion && !e.pending) this.request(map, cx, cy, key, e);
    }
    // evict old chunks
    if (t.size > 70) {
      const entries = [...t.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
      for (let i = 0; i < entries.length - 56; i++) if (!entries[i][1].pending) t.delete(entries[i][0]);
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
    const m = 1 / (this.tr || 3);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (cx * CHUNK >= map.w || cy * CHUNK >= map.h) continue;
      const e = t.get(cy * 1000 + cx);
      if (e && e.canvas) ctx.drawImage(e.canvas, cx * PX - m, cy * PX - m, PX + 2 * m, PX + 2 * m);
      else this.drawFallback(ctx, map, cx, cy, e);
    }
    drawWaterFx(ctx, map, x0, y0, x1, y1, time);
  }

  /**
   * Until a chunk is painted: a soft wash of its ground colours (one texel per
   * tile, smoothed), so a late chunk reads as out of focus rather than blocky.
   */
  private drawFallback(ctx: CanvasRenderingContext2D, map: GameMap, cx: number, cy: number, e?: Entry) {
    let rough = e?.rough;
    if (!rough) {
      const n = CHUNK + 2;
      rough = newCanvas(n, n);
      const g = rough.getContext('2d')!;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        g.fillStyle = FALLBACK[map.get(cx * CHUNK + i - 1, cy * CHUNK + j - 1)] || '#0b0807';
        g.fillRect(i, j, 1, 1);
      }
      if (e) e.rough = rough;
    }
    // the ring of neighbour tiles only feeds the smoothing at the edges
    ctx.drawImage(rough, 1, 1, CHUNK, CHUNK, cx * PX, cy * PX, PX, PX);
  }

  private toCanvas(px: Uint32Array): HTMLCanvasElement {
    const n = groundSize(this.tr);
    const c = newCanvas(n, n);
    const bytes = new Uint8ClampedArray(px.buffer as ArrayBuffer, px.byteOffset, px.byteLength);
    c.getContext('2d')!.putImageData(new ImageData(bytes, n, n), 0, 0);
    return c;
  }
}

export const chunks = new ChunkCache();
