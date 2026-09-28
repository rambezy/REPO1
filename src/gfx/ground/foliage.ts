// Loose ground cover drawn over the terrain each frame: tufts of grass,
// meadow flowers and forest ferns that lean with the wind. Placement comes
// from a hash of the tile, so it never changes and costs no memory.

import { T } from '../../world/terrain';
import { hash2i, RNG } from '../../engine/util';
import { artCanvas, blade, ellipse, rim, lit } from '../paint';

interface Tuft { c: HTMLCanvasElement; w: number; h: number }

const GRASS_COLS = ['#3d6628', '#4a7a2e', '#568838', '#63953e', '#78a848'];
const DRY_COLS = ['#5a7a30', '#6a8a36', '#7a9a42', '#8ea44c'];

function tuft(seed: number, cols: string[], n: number, len: number, flowers?: string[]): Tuft {
  const rng = new RNG(seed);
  const W = 12, H = 12;
  const { c, g } = artCanvas(W, H);
  const bx = W / 2, by = H - 1;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (rng.next() - 0.5) * 1.4;
    blade(g, bx + (rng.next() - 0.5) * 3, by, len * (0.6 + rng.next() * 0.6), a, (rng.next() - 0.5) * 1.6, 0.55, cols[Math.floor(rng.next() * cols.length)]);
  }
  if (flowers) {
    for (let k = 0; k < 2; k++) {
      const col = flowers[Math.floor(rng.next() * flowers.length)];
      const x = bx + (rng.next() - 0.5) * 5, y = by - len * (0.7 + rng.next() * 0.4);
      g.strokeStyle = '#3d6628'; g.lineWidth = 0.3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(bx + (rng.next() - 0.5) * 2, by); g.stroke();
      for (let p = 0; p < 5; p++) { const q = (p / 5) * Math.PI * 2; ellipse(g, x + Math.cos(q) * 0.7, y + Math.sin(q) * 0.55, 0.62, 0.45, p < 3 ? lit(col, 0.2) : col, q); }
      ellipse(g, x, y, 0.35, 0.3, '#e8b030');
    }
  }
  rim(c, '#16240e', 0.35, 1);
  return { c, w: W, h: H };
}

function fern(seed: number): Tuft {
  const rng = new RNG(seed);
  const W = 18, H = 12;
  const { c, g } = artCanvas(W, H);
  const bx = W / 2, by = H - 1;
  const cols = ['#3a5a26', '#46702c', '#528034', '#62903c'];
  for (let f = 0; f < 6; f++) {
    const a = -Math.PI / 2 + (f - 2.5) * 0.42 + (rng.next() - 0.5) * 0.2;
    const L = 6 + rng.next() * 3;
    const col = cols[Math.floor(rng.next() * cols.length)];
    g.strokeStyle = col; g.lineWidth = 0.35;
    g.beginPath(); g.moveTo(bx, by);
    const ex = bx + Math.cos(a) * L, ey = by + Math.sin(a) * L * 0.8;
    g.quadraticCurveTo(bx + Math.cos(a) * L * 0.5, by + Math.sin(a) * L * 0.6 - 1, ex, ey);
    g.stroke();
    for (let k = 1; k < 7; k++) {
      const t = k / 7;
      const px = bx + (ex - bx) * t, py = by + (ey - by) * t - Math.sin(t * Math.PI) * 1;
      const w = (1 - t) * 1.8 + 0.4;
      for (const s of [-1, 1]) blade(g, px, py, w, a + s * 1.3, 0.1, 0.45, lit(col, t * 0.2));
    }
  }
  rim(c, '#16240e', 0.35, 1);
  return { c, w: W, h: H };
}

let sets: { grass: Tuft[]; dry: Tuft[]; meadow: Tuft[]; fern: Tuft[] } | null = null;
function tufts() {
  if (sets) return sets;
  const fl = ['#f4f0e0', '#f0d860', '#c8a0e0', '#8ab0e8', '#f0a8b8'];
  sets = {
    grass: [0, 1, 2, 3, 4, 5].map((i) => tuft(100 + i, GRASS_COLS, 7, 5.5)),
    dry: [0, 1, 2].map((i) => tuft(200 + i, DRY_COLS, 6, 5)),
    meadow: [0, 1, 2, 3, 4].map((i) => tuft(300 + i, GRASS_COLS, 8, 6.5, fl)),
    fern: [0, 1, 2, 3].map((i) => fern(400 + i)),
  };
  return sets;
}

interface GroundMap { w: number; h: number; get(tx: number, ty: number): number; outdoor: boolean; seed: number }

/** Draws the ground cover for the visible tiles (world space). */
export function drawGroundFoliage(ctx: CanvasRenderingContext2D, map: GroundMap, x0: number, y0: number, x1: number, y1: number, time: number, wind: number) {
  if (!map.outdoor) return;
  const S = tufts();
  const tx0 = Math.max(0, Math.floor(x0 / 16)), ty0 = Math.max(0, Math.floor(y0 / 16) - 1);
  const tx1 = Math.min(map.w - 1, Math.floor(x1 / 16)), ty1 = Math.min(map.h - 1, Math.floor(y1 / 16) + 1);
  const amp = 0.08 + wind * 0.22;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = map.get(tx, ty);
    let set: Tuft[] | null = null, n = 0;
    const h = hash2i(tx, ty, map.seed + 991);
    if (t === T.GRASS) { set = (h & 7) === 0 ? S.dry : S.grass; n = (h >>> 3) % 5 < 2 ? 1 : (h >>> 3) % 5 === 4 ? 2 : 0; }
    else if (t === T.MEADOW) { set = S.meadow; n = 1 + ((h >>> 3) % 3 === 0 ? 1 : 0); }
    else if (t === T.FOREST) { set = (h & 3) === 0 ? S.grass : S.fern; n = (h >>> 3) % 3 === 0 ? 1 : 0; }
    if (!set || n === 0) continue;
    for (let k = 0; k < n; k++) {
      const hh = hash2i(tx * 7 + k, ty * 13 - k, map.seed + 17);
      const x = tx * 16 + 2 + (hh % 12), y = ty * 16 + 3 + ((hh >>> 8) % 12);
      const tf = set[(hh >>> 16) % set.length];
      const bend = Math.sin(time * 1.7 + x * 0.045 + y * 0.03) * amp + Math.sin(time * 3.3 + x * 0.1) * amp * 0.3;
      ctx.save();
      ctx.translate(x, y);
      ctx.transform(1, 0, bend, 1, 0, 0);
      if ((hh >>> 24) & 1) ctx.scale(-1, 1);
      ctx.drawImage(tf.c, -tf.w / 2, -tf.h + 1, tf.w, tf.h);
      ctx.restore();
    }
  }
}
