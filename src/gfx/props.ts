// Props and furniture, painted at high resolution in the same light as the
// trees and buildings: lit from the upper left, every surface shaded with
// gradients, grained and rimmed, with soft contact shadows on the ground.
// Each prop returns its sprite (painted lazily on first use) plus optional
// light, collision footprint and animation hints.

import { P, CLOTH } from './palette';
import { RNG, clamp, hashStr } from '../engine/util';
import { Sprite, lazySprite } from './sprite';
import { artCanvas, rim, grain, lit, dim, mix, rgba, jitter, ellipse, roundRect, poly, line, blade, blob, lin, rad, ballShade, Ctx } from './paint';

export interface PropLight { x: number; y: number; r: number; color: string; flicker?: boolean; intensity?: number }
export interface PropInfo {
  sprite: Sprite;
  light?: PropLight;
  /** collision footprint in px, centred horizontally on the base point, extending up from it */
  solid?: { w: number; h: number };
  anim?: 'fire' | 'bigfire' | 'smoke' | 'candle' | 'wheel';
  flat?: boolean; // draw under actors (rugs, decals)
  wall?: boolean; // mounted on a wall face
}

const infoCache = new Map<string, PropInfo>();

export function propInfo(type: string, variant = 0, opt = ''): PropInfo {
  const key = `${type}:${variant}:${opt}`;
  let info = infoCache.get(key);
  if (!info) {
    info = makeProp(type, variant, opt);
    infoCache.set(key, info);
  }
  return info;
}

// ================================================================ toolkit

type G = Ctx;
type Paint = (g: G) => ((g: G) => void) | void;

const INK = '#140d08';
const SHADE = '#0a0604';
const TAU = Math.PI * 2;

// woods: general oak, dark stained, fresh pine, weathered grey, warm honey
const OAK = '#7a5636', DARK = '#4e3524', PINE = '#a27c50', GREY = '#7a6c5a', HONEY = '#98693f';
const IRON = ['#1c1e22', '#30343a', '#474c53', '#646a72', '#8a9199', '#c0c7cf'];
const STONE = ['#5c5850', '#6e6a60', '#7c776c', '#888275', '#948d80', '#a39c8e'];
const STRAW = ['#5e4822', '#76592c', '#8c6c34', '#a2803e', '#b8954a', '#ccab5c', '#dec274', '#ecd896'];
const BARK = ['#2a1d14', '#3b2a1e', '#4e3828', '#634834', '#7a5b42'];
const CUT = ['#7a5432', '#a07848', '#c09a66', '#d8b882'];
const LEAF = ['#243d19', '#335624', '#436b2e', '#557f38', '#6c9646', '#8aae5a'];
const BRASS = ['#3e2c0e', '#6e5018', '#a07a2a', '#c8a044', '#e6c870', '#f8eab0'];
const COPPER = ['#3e1a0c', '#6e3016', '#a04e26', '#c87444', '#e8a070', '#f8d0b0'];
const CLAY = ['#4e2618', '#723a24', '#96522f', '#b26c40', '#c88a5a', '#dcaa7c'];
const EMBER = ['#5a1a0a', '#a8321a', '#e0621e', '#ff9a3a', '#ffd070', '#fff4c0'];
const LINEN = '#e2d8c0';
const GRASS = ['#35592a', '#3f6a2c', '#4b7b33', '#5a8c3a', '#6e9e46'];

interface Opts { seed?: number; grain?: number; rim?: number; under?: (g: G) => void }

/** Paints a prop lazily: the art, grain and rim, then shadows beneath and any glow on top. */
function art(W: number, H: number, ox: number, oy: number, paint: Paint, o: Opts = {}): Sprite {
  return lazySprite(() => {
    const { c, g } = artCanvas(W, H);
    const after = paint(g);
    const gr = o.grain ?? 7;
    if (gr > 0) grain(c, gr, o.seed ?? 7);
    const rm = o.rim ?? 0.55;
    if (rm > 0) rim(c, INK, rm, 1);
    if (o.under) {
      g.save();
      g.globalCompositeOperation = 'destination-over';
      o.under(g);
      g.restore();
    }
    if (after) { g.save(); after(g); g.restore(); }
    return { canvas: c, ox, oy, w: W, h: H };
  });
}

/** Soft contact shadow on the ground. */
function contact(g: G, cx: number, cy: number, rx: number, ry: number, a = 0.34) {
  g.save();
  g.translate(cx, cy);
  g.scale(1, ry / rx);
  g.fillStyle = rad(g, 0, 0, 0, 0, 0, rx, [[0, rgba(SHADE, a)], [0.5, rgba(SHADE, a * 0.78)], [1, rgba(SHADE, 0)]]);
  g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
  g.restore();
}

/** A soft glow; paint it after the rim so it can spill past the silhouette (or, `atop`, light only what is painted). */
function glow(g: G, x: number, y: number, r: number, col: string, a = 0.5, atop = false) {
  g.save();
  if (atop) g.globalCompositeOperation = 'source-atop';
  g.fillStyle = rad(g, x, y, 0, x, y, r, [[0, rgba(col, a)], [0.3, rgba(col, a * 0.5)], [1, rgba(col, 0)]]);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.restore();
}

/** Firelight pooled on the ground around a fire (flat, so it hugs the base). */
function groundGlow(g: G, x: number, y: number, rx: number, ry: number, col: string, a = 0.4) {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = rad(g, 0, 0, 0, 0, 0, rx, [[0, rgba(col, a)], [0.45, rgba(col, a * 0.45)], [1, rgba(col, 0)]]);
  g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
  g.restore();
}

function clipRect(g: G, x: number, y: number, w: number, h: number) {
  g.beginPath(); g.rect(x, y, w, h); g.clip();
}

/** Linear gradient fill of a path-building callback. */
function fillPath(g: G, path: () => void, fill: string | CanvasGradient) {
  path();
  g.fillStyle = fill;
  g.fill();
}

// ---------------------------------------------------------------- wood

/** Wavy streaks of grain along a board's length. */
function grainLines(g: G, x: number, y: number, w: number, h: number, col: string, rng: RNG, vertical: boolean, dens = 1) {
  const len = vertical ? h : w, across = vertical ? w : h;
  const n = Math.max(2, Math.round(across * 2.4 * dens));
  g.lineWidth = 0.13;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.2 + rng.next() * 0.6) / n;
    const a0 = -len * 0.1 + rng.next() * len * 0.5, a1 = a0 + len * (0.35 + rng.next() * 0.8);
    const dark = rng.next() < 0.68;
    g.strokeStyle = dark ? rgba(dim(col, 0.5), 0.2 + rng.next() * 0.22) : rgba(lit(col, 0.4), 0.12 + rng.next() * 0.14);
    const amp = 0.06 + rng.next() * 0.14, fr = 0.3 + rng.next() * 0.5, ph = rng.next() * TAU;
    g.beginPath();
    for (let k = 0; k <= 8; k++) {
      const s = a0 + (a1 - a0) * (k / 8);
      const o = t * across + Math.sin(s * fr + ph) * amp;
      const px = vertical ? x + o : x + s, py = vertical ? y + s : y + o;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
  }
}

function knot(g: G, x: number, y: number, r: number, col: string) {
  ellipse(g, x, y, r * 1.7, r, rgba(dim(col, 0.35), 0.45));
  ellipse(g, x, y, r * 0.9, r * 0.58, dim(col, 0.55));
  ellipse(g, x - r * 0.25, y - r * 0.2, r * 0.35, r * 0.2, rgba(lit(col, 0.3), 0.5));
}

/** A wooden board lit from the upper left, with grain along its length. */
function board(g: G, x: number, y: number, w: number, h: number, col: string, rng: RNG, o: { vertical?: boolean; knots?: number; edge?: number; dens?: number } = {}) {
  if (w <= 0.05 || h <= 0.05) return;
  const v = o.vertical ?? h > w;
  g.fillStyle = v
    ? lin(g, x, 0, x + w, 0, [[0, lit(col, 0.2)], [0.3, col], [1, dim(col, 0.3)]])
    : lin(g, 0, y, 0, y + h, [[0, lit(col, 0.22)], [0.35, col], [1, dim(col, 0.32)]]);
  g.fillRect(x, y, w, h);
  g.save();
  clipRect(g, x, y, w, h);
  grainLines(g, x, y, w, h, col, rng, v, o.dens ?? 1);
  const nk = o.knots ?? (rng.next() < 0.3 ? 1 : 0);
  for (let i = 0; i < nk; i++) knot(g, x + w * (0.15 + rng.next() * 0.7), y + h * (0.3 + rng.next() * 0.4), Math.min(w, h) * 0.17, col);
  g.restore();
  const e = o.edge ?? 1;
  if (e > 0) {
    const lw = Math.min(0.24, (v ? w : h) * 0.2);
    g.fillStyle = rgba(lit(col, 0.55), 0.42 * e);
    if (v) g.fillRect(x, y, lw, h); else g.fillRect(x, y, w, lw);
    g.fillStyle = rgba(dim(col, 0.65), 0.55 * e);
    if (v) g.fillRect(x + w - lw, y, lw, h); else g.fillRect(x, y + h - lw, w, lw);
  }
}

/** Boards side by side filling a rectangle, with dark seams between them. */
function planks(g: G, x: number, y: number, w: number, h: number, n: number, col: string, rng: RNG, vertical: boolean, seam = 0.16) {
  g.fillStyle = dim(col, 0.72);
  g.fillRect(x, y, w, h);
  for (let i = 0; i < n; i++) {
    const c = jitter(col, rng, 0.06);
    if (vertical) { const bw = w / n; board(g, x + i * bw + seam / 2, y, bw - seam, h, c, rng, { vertical: true }); }
    else { const bh = h / n; board(g, x, y + i * bh + seam / 2, w, bh - seam, c, rng, { vertical: false }); }
  }
}

/** A round upright pole or post, lit on the left. */
function post(g: G, x: number, top: number, bottom: number, w: number, col: string, rng: RNG, cap: 'cut' | 'round' | 'point' | 'none' = 'cut') {
  const x0 = x - w / 2;
  const body = lin(g, x0, 0, x0 + w, 0, [[0, dim(col, 0.12)], [0.2, lit(col, 0.28)], [0.5, col], [0.85, dim(col, 0.38)], [1, dim(col, 0.5)]]);
  if (cap === 'point') poly(g, [x0, top + w * 0.7, x, top, x0 + w, top + w * 0.7, x0 + w, bottom, x0, bottom], body);
  else { g.fillStyle = body; g.fillRect(x0, top, w, bottom - top); }
  g.save();
  clipRect(g, x0, top, w, bottom - top);
  grainLines(g, x0, top, w, bottom - top, col, rng, true, 0.75);
  g.restore();
  if (cap === 'cut') {
    ellipse(g, x, top, w / 2, w * 0.24, lin(g, x0, top, x0 + w, top, [[0, lit(col, 0.5)], [1, lit(col, 0.1)]]));
    g.strokeStyle = rgba(dim(col, 0.3), 0.5); g.lineWidth = 0.09;
    g.beginPath(); g.ellipse(x + 0.05, top, w * 0.24, w * 0.11, 0, 0, TAU); g.stroke();
  } else if (cap === 'round') {
    g.beginPath(); g.ellipse(x, top, w / 2, w * 0.42, 0, Math.PI, 0);
    g.fillStyle = lin(g, x0, top - w * 0.4, x0 + w, top, [[0, lit(col, 0.4)], [1, dim(col, 0.3)]]);
    g.fill();
  }
}

/** A squared timber seen from the front, lit on the top and left. */
function beam(g: G, x: number, y: number, w: number, h: number, col: string, rng: RNG) {
  board(g, x, y, w, h, col, rng, { vertical: h > w, knots: 0 });
}

/** A beam at an angle, from (x0,y0) to (x1,y1). */
/** Which way a stick's local "up" faces: 1 toward the light (upper left), -1 away. */
function facing(a: number) {
  return Math.sin(a) * -0.6 + -Math.cos(a) * -0.8 >= 0 ? 1 : -1;
}

function slantBeam(g: G, x0: number, y0: number, x1: number, y1: number, w: number, col: string, rng: RNG) {
  if (facing(Math.atan2(y1 - y0, x1 - x0)) < 0) [x0, y0, x1, y1] = [x1, y1, x0, y0];
  const len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
  g.save();
  g.translate(x0, y0);
  g.rotate(a);
  board(g, 0, -w / 2, len, w, col, rng, { vertical: false, knots: 0 });
  g.restore();
}

/** Cut end of a log: rings, checks and bark. */
function endGrain(g: G, x: number, y: number, rx: number, ry: number, rng: RNG, bark = BARK[1], col = CUT[2]) {
  ellipse(g, x, y, rx, ry, bark);
  const ix = rx * 0.84, iy = ry * 0.84;
  ellipse(g, x, y, ix, iy, rad(g, x - ix * 0.35, y - iy * 0.4, 0.05, x, y, Math.max(ix, iy) * 1.1, [[0, lit(col, 0.3)], [0.6, col], [1, dim(col, 0.3)]]));
  g.lineWidth = 0.09;
  for (let k = 1; k <= 3; k++) {
    const t = k / 4;
    g.strokeStyle = rgba(dim(col, 0.45), 0.5);
    g.beginPath(); g.ellipse(x + (rng.next() - 0.5) * 0.15, y, ix * t, iy * t, 0, 0, TAU); g.stroke();
  }
  g.strokeStyle = rgba(dim(col, 0.6), 0.6);
  g.lineWidth = 0.12;
  const a = rng.next() * TAU;
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * ix * 0.85, y + Math.sin(a) * iy * 0.85); g.stroke();
  // the bark rim catches the light on the upper left
  g.strokeStyle = rgba(BARK[4], 0.7);
  g.lineWidth = 0.18;
  g.beginPath(); g.ellipse(x, y, rx * 0.93, ry * 0.93, 0, Math.PI * 0.95, Math.PI * 1.6); g.stroke();
}

/** A log lying from (x0,y0) to (x1,y1), bark along it and a sawn end at (x1,y1). */
function logLying(g: G, x0: number, y0: number, x1: number, y1: number, r: number, rng: RNG, o: { char?: number; end?: boolean; bark?: string[]; glow?: number } = {}) {
  const bark = o.bark ?? BARK;
  const len = Math.hypot(x1 - x0, y1 - y0), a = Math.atan2(y1 - y0, x1 - x0);
  g.save();
  g.translate(x0, y0);
  g.rotate(a);
  const body = () => { g.beginPath(); g.moveTo(0, -r); g.lineTo(len, -r); g.lineTo(len, r); g.lineTo(0, r); g.ellipse(0, 0, r * 0.4, r, 0, Math.PI / 2, -Math.PI / 2); g.closePath(); };
  // light comes from the upper left in screen space: pick the lit side of the log
  const up = facing(a);
  fillPath(g, body, lin(g, 0, -r * up, 0, r * up, [[0, bark[4]], [0.3, bark[3]], [0.7, bark[1]], [1, bark[0]]]));
  g.save();
  body(); g.clip();
  g.lineWidth = 0.14;
  for (let k = 0; k < len * 1.3; k++) {
    const yy = (rng.next() * 2 - 1) * r * 0.9, xx = rng.next() * len;
    g.strokeStyle = rgba(rng.next() < 0.6 ? bark[0] : bark[4], 0.45);
    g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + 0.8 + rng.next() * 2.2, yy + (rng.next() - 0.5) * 0.2); g.stroke();
  }
  if (o.char) {
    // charred toward the fire end (x = len), with glowing cracks
    g.fillStyle = lin(g, len * (1 - o.char), 0, len, 0, [[0, 'rgba(14,10,8,0)'], [0.45, 'rgba(14,10,8,0.8)'], [1, 'rgba(10,8,6,0.95)']]);
    g.fillRect(0, -r, len, r * 2);
    if (o.glow) {
      for (let k = 0; k < len * 0.9 * o.char; k++) {
        const xx = len * (1 - o.char * 0.8) + rng.next() * len * o.char * 0.8, yy = (rng.next() * 2 - 1) * r * 0.7;
        g.strokeStyle = rgba(rng.next() < 0.5 ? EMBER[3] : EMBER[2], 0.55 + rng.next() * 0.4 * o.glow);
        g.lineWidth = 0.14 + rng.next() * 0.14;
        g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + 0.4 + rng.next() * 0.8, yy + (rng.next() - 0.5) * 0.5); g.stroke();
      }
    }
  }
  g.restore();
  if (o.end !== false) {
    const ec = o.char && o.char > 0.5 ? '#2a211c' : CUT[2];
    endGrain(g, len, 0, r * 0.42, r, rng, bark[1], ec);
    if (o.char && o.char > 0.5 && o.glow) ellipse(g, len, 0, r * 0.22, r * 0.5, rgba(EMBER[3], 0.7 * o.glow));
  }
  g.restore();
}

// ---------------------------------------------------------------- metal, stone, straw, cloth

function ironBar(g: G, x: number, y: number, w: number, h: number, vertical = false, rust = 0) {
  const c = (i: number) => (rust ? mix(IRON[i], '#7a4424', rust) : IRON[i]);
  g.fillStyle = vertical ? lin(g, x, 0, x + w, 0, [[0, c(4)], [0.35, c(3)], [1, c(1)]]) : lin(g, 0, y, 0, y + h, [[0, c(4)], [0.4, c(2)], [1, c(0)]]);
  g.fillRect(x, y, w, h);
}

function rivet(g: G, x: number, y: number, r = 0.3, rust = 0) {
  ellipse(g, x + r * 0.3, y + r * 0.4, r, r, rgba('#0a0806', 0.45));
  const hi = rust ? mix(IRON[5], '#c08050', rust) : IRON[5];
  ellipse(g, x, y, r, r, rad(g, x - r * 0.35, y - r * 0.35, 0.02, x, y, r, [[0, hi], [0.5, IRON[3]], [1, IRON[1]]]));
}

/** A dressed stone with bevelled, lit upper-left edges. */
function stoneBlock(g: G, x: number, y: number, w: number, h: number, col: string, rng: RNG, r = 0.55) {
  if (w <= 0.1 || h <= 0.1) return;
  roundRect(g, x, y, w, h, r, lin(g, x, y, x + w * 0.4, y + h, [[0, lit(col, 0.24)], [0.5, col], [1, dim(col, 0.3)]]));
  g.save();
  roundRect(g, x, y, w, h, r);
  g.clip();
  for (let i = 0; i < w * h * 0.14; i++) ellipse(g, x + rng.next() * w, y + rng.next() * h, 0.14 + rng.next() * 0.34, 0.1 + rng.next() * 0.2, rgba(rng.next() < 0.55 ? dim(col, 0.45) : lit(col, 0.4), 0.3));
  g.fillStyle = rgba(lit(col, 0.55), 0.32); g.fillRect(x, y, w, 0.28); g.fillRect(x, y, 0.28, h);
  g.fillStyle = rgba(dim(col, 0.6), 0.38); g.fillRect(x, y + h - 0.32, w, 0.32); g.fillRect(x + w - 0.32, y, 0.32, h);
  g.restore();
}

/** Courses of dressed stone (or brick) filling a rectangle. */
function masonry(g: G, x0: number, y0: number, x1: number, y1: number, rng: RNG, cols = STONE, rowH = 3.2, o: { mortar?: string; len?: [number, number]; r?: number } = {}) {
  g.fillStyle = o.mortar ?? '#39332b';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.save();
  clipRect(g, x0, y0, x1 - x0, y1 - y0);
  const [l0, l1] = o.len ?? [1.3, 2.6];
  for (let y = y1 - rowH, r = 0; y > y0 - rowH; y -= rowH, r++) {
    let x = x0 - (r % 2) * rowH * 0.8 - rng.next() * 1.2;
    while (x < x1) {
      const w = rowH * (l0 + rng.next() * (l1 - l0));
      stoneBlock(g, x + 0.13, y + 0.13, w - 0.26, rowH - 0.26, jitter(cols[Math.floor(rng.next() * cols.length)], rng, 0.05), rng, o.r ?? 0.45);
      x += w;
    }
  }
  g.restore();
}

/** Round rubble stone lit from the upper left. */
function cobble(g: G, x: number, y: number, rx: number, ry: number, col: string, rng: RNG) {
  blob(g, x, y, rx, ry, rng, rad(g, x - rx * 0.4, y - ry * 0.5, 0.05, x, y, Math.max(rx, ry) * 1.15, [[0, lit(col, 0.35)], [0.5, col], [1, dim(col, 0.4)]]), 7, 0.13);
  ellipse(g, x - rx * 0.3, y - ry * 0.45, rx * 0.35, ry * 0.18, rgba(lit(col, 0.5), 0.35));
}

/** Straw strands, sorted dark to light so the lit ones sit on top. */
function strawStrokes(g: G, n: number, pick: () => [number, number], rng: RNG, o: { ang?: (x: number, y: number) => number; len?: [number, number]; w?: number; light?: (x: number, y: number) => number; pal?: string[]; bend?: number } = {}) {
  const pal = o.pal ?? STRAW;
  const items: [number, number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = pick();
    const L = (o.light ? o.light(x, y) : 0.5) + (rng.next() - 0.5) * 0.38;
    const idx = clamp(Math.round(L * (pal.length - 1)), 0, pal.length - 1);
    const len = o.len ? o.len[0] + rng.next() * (o.len[1] - o.len[0]) : 3;
    items.push([x, y, idx, len, (o.ang ? o.ang(x, y) : Math.PI / 2) + (rng.next() - 0.5) * 0.35]);
  }
  items.sort((a, b) => a[2] - b[2]);
  const bend = o.bend ?? 0.5;
  for (const [x, y, idx, len, ang] of items) blade(g, x, y, len, ang, (rng.next() - 0.5) * bend, o.w ?? 0.36, pal[idx]);
}

/** Soft fold shading inside the current clip: pleats running along one axis. */
function folds(g: G, x0: number, y0: number, x1: number, y1: number, col: string, rng: RNG, n: number, vertical = true, depth = 0.32) {
  for (let i = 0; i < n; i++) {
    const t = (i + 0.3 + rng.next() * 0.4) / n;
    const w = (vertical ? x1 - x0 : y1 - y0) / n * (0.5 + rng.next() * 0.5);
    const c = vertical ? x0 + (x1 - x0) * t : y0 + (y1 - y0) * t;
    const gr = vertical ? lin(g, c - w, 0, c + w, 0, [[0, rgba(lit(col, 0.3), 0)], [0.35, rgba(lit(col, 0.35), depth * 0.7)], [0.55, rgba(dim(col, 0.5), depth)], [1, rgba(dim(col, 0.5), 0)]])
      : lin(g, 0, c - w, 0, c + w, [[0, rgba(lit(col, 0.3), 0)], [0.35, rgba(lit(col, 0.35), depth * 0.7)], [0.55, rgba(dim(col, 0.5), depth)], [1, rgba(dim(col, 0.5), 0)]]);
    g.fillStyle = gr;
    if (vertical) g.fillRect(c - w, y0, w * 2, y1 - y0); else g.fillRect(x0, c - w, x1 - x0, w * 2);
  }
}

/** Fine woven texture (warp and weft) inside the current clip. */
function weave(g: G, x0: number, y0: number, x1: number, y1: number, col: string, step = 0.5, a = 0.12) {
  g.lineWidth = 0.1;
  g.strokeStyle = rgba(dim(col, 0.45), a);
  g.beginPath();
  for (let y = y0; y < y1; y += step) { g.moveTo(x0, y); g.lineTo(x1, y); }
  g.stroke();
  g.strokeStyle = rgba(lit(col, 0.3), a * 0.8);
  g.beginPath();
  for (let x = x0; x < x1; x += step) { g.moveTo(x, y0); g.lineTo(x, y1); }
  g.stroke();
}

/** Soft undulations of a lying blanket: shaded hollows, each with a lit lip above it. */
function drape(g: G, x0: number, y0: number, x1: number, y1: number, col: string, rng: RNG, n: number, crease = true) {
  for (let i = 0; i < n; i++) {
    const x = x0 + rng.next() * (x1 - x0), y = y0 + rng.next() * (y1 - y0);
    const rx = 2.4 + rng.next() * 3.6, ry = 0.6 + rng.next() * 0.8, rot = (rng.next() - 0.5) * 0.9;
    g.save();
    g.translate(x, y); g.rotate(rot); g.scale(1, ry / rx);
    g.fillStyle = rad(g, 0, 0, 0, 0, 0, rx, [[0, rgba(dim(col, 0.55), 0.34)], [0.6, rgba(dim(col, 0.55), 0.14)], [1, rgba(dim(col, 0.55), 0)]]);
    g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
    g.fillStyle = rad(g, -rx * 0.1, -rx * 1.05, 0, -rx * 0.1, -rx * 1.05, rx * 0.85, [[0, rgba(lit(col, 0.45), 0.3)], [1, rgba(lit(col, 0.45), 0)]]);
    g.beginPath(); g.arc(-rx * 0.1, -rx * 1.05, rx * 0.85, 0, TAU); g.fill();
    g.restore();
    if (crease && rng.next() < 0.6) {
      const c = Math.cos(rot), sn = Math.sin(rot), L = rx * 0.55;
      g.strokeStyle = rgba(dim(col, 0.6), 0.28); g.lineWidth = 0.22;
      g.beginPath(); g.moveTo(x - c * L, y - sn * L); g.quadraticCurveTo(x, y + ry * 0.25, x + c * L, y + sn * L); g.stroke();
    }
  }
}

/** Grass tufts at the foot of an outdoor prop. */
function tufts(g: G, x0: number, x1: number, y: number, rng: RNG, n: number, h = 2.4) {
  for (let k = 0; k < n; k++) {
    const x = x0 + rng.next() * (x1 - x0);
    for (let j = 0; j < 3; j++) blade(g, x + (j - 1) * 0.35, y + 0.3, h * (0.6 + rng.next() * 0.6), -Math.PI / 2 + (j - 1) * 0.45 + (rng.next() - 0.5) * 0.3, (rng.next() - 0.5) * 0.6, 0.5, GRASS[1 + Math.floor(rng.next() * 4)]);
  }
}

// ---------------------------------------------------------------- fire and food

/** A bed of charcoal with glowing coals, hottest in the middle. */
function coals(g: G, cx: number, cy: number, rx: number, ry: number, rng: RNG, n: number, heat = 1) {
  const items: [number, number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = rng.next() * TAU, d = Math.sqrt(rng.next());
    items.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d, (1 - d) * heat + (rng.next() - 0.5) * 0.5, 0.35 + rng.next() * 0.55]);
  }
  items.sort((a, b) => a[1] - b[1]);
  for (const [x, y, h, r] of items) {
    if (h > 0.55) {
      ellipse(g, x, y, r, r * 0.7, rad(g, x - r * 0.2, y - r * 0.2, 0.02, x, y, r, [[0, EMBER[5]], [0.4, EMBER[4]], [1, EMBER[2]]]));
    } else if (h > 0.25) {
      ellipse(g, x, y, r, r * 0.7, rad(g, x, y, 0.02, x, y, r, [[0, EMBER[3]], [0.6, EMBER[1]], [1, '#3a1a10']]));
    } else {
      ellipse(g, x, y, r, r * 0.72, rad(g, x - r * 0.3, y - r * 0.4, 0.02, x, y, r, [[0, '#5a534c'], [0.5, '#2e2a26'], [1, '#161311']]));
    }
  }
}

function loaf(g: G, x: number, y: number, rx: number, ry: number, rng: RNG, o: { rot?: number; cuts?: number; dark?: number } = {}) {
  const d = o.dark ?? 0;
  const b = (c: string) => (d ? dim(c, d) : c);
  g.save();
  g.translate(x, y);
  g.rotate(o.rot ?? 0);
  ellipse(g, 0.25, ry * 0.45, rx, ry * 0.7, rgba(SHADE, 0.3));
  ellipse(g, 0, 0, rx, ry, rad(g, -rx * 0.35, -ry * 0.5, 0.05, 0, 0, Math.max(rx, ry) * 1.15, [[0, b(P.bread4)], [0.35, b(P.bread3)], [0.75, b(P.bread2)], [1, b(P.bread1)]]));
  const cuts = o.cuts ?? 3;
  g.lineWidth = Math.min(rx, ry) * 0.2;
  for (let k = 0; k < cuts; k++) {
    const t = (k + 0.5) / cuts - 0.5;
    g.strokeStyle = rgba(b('#f4d8a0'), 0.8);
    g.beginPath(); g.moveTo(t * rx * 1.5 - rx * 0.12, -ry * 0.5); g.quadraticCurveTo(t * rx * 1.5 + rx * 0.12, 0, t * rx * 1.5 - rx * 0.05, ry * 0.5); g.stroke();
  }
  for (let k = 0; k < 4; k++) ellipse(g, (rng.next() - 0.5) * rx * 1.2, (rng.next() - 0.7) * ry, 0.18, 0.12, rgba('#f8f0e0', 0.5));
  g.restore();
}

function fruit(g: G, x: number, y: number, r: number, col: string) {
  ellipse(g, x + r * 0.2, y + r * 0.55, r * 0.9, r * 0.45, rgba(SHADE, 0.3));
  ellipse(g, x, y, r, r * 0.94, ballShade(g, x, y, r, col, 0.5, 0.55));
  ellipse(g, x - r * 0.35, y - r * 0.4, r * 0.28, r * 0.18, 'rgba(255,250,235,0.55)');
  line(g, x + r * 0.05, y - r * 0.85, x + r * 0.25, y - r * 1.2, '#4a3220', 0.18);
}

/** A glass bottle or flask, standing with its foot at (x, yb). */
function bottle(g: G, x: number, yb: number, w: number, h: number, glass: string, liquid: string | null, o: { neck?: number; round?: boolean; fill?: number } = {}) {
  const neck = o.neck ?? h * 0.35;
  const bw = w / 2, bh = h - neck;
  const body = () => {
    g.beginPath();
    if (o.round) {
      g.ellipse(x, yb - bh / 2, bw, bh / 2, 0, 0, TAU);
    } else {
      g.moveTo(x - bw, yb - 0.3);
      g.lineTo(x - bw, yb - bh + bw * 0.6);
      g.quadraticCurveTo(x - bw, yb - bh, x - w * 0.18, yb - bh - 0.2);
      g.lineTo(x + w * 0.18, yb - bh - 0.2);
      g.quadraticCurveTo(x + bw, yb - bh, x + bw, yb - bh + bw * 0.6);
      g.lineTo(x + bw, yb - 0.3);
      g.quadraticCurveTo(x, yb + 0.25, x - bw, yb - 0.3);
    }
    g.closePath();
  };
  // neck and lip
  const nw = Math.max(0.45, w * 0.3);
  g.fillStyle = lin(g, x - nw / 2, 0, x + nw / 2, 0, [[0, lit(glass, 0.3)], [1, dim(glass, 0.4)]]);
  g.fillRect(x - nw / 2, yb - h, nw, neck + 0.4);
  roundRect(g, x - nw / 2 - 0.15, yb - h - 0.1, nw + 0.3, 0.45, 0.15, dim(glass, 0.2));
  fillPath(g, body, lin(g, x - bw, 0, x + bw, 0, [[0, lit(glass, 0.25)], [0.5, glass], [1, dim(glass, 0.45)]]));
  if (liquid) {
    g.save();
    body(); g.clip();
    const top = yb - bh * (o.fill ?? 0.6);
    g.fillStyle = lin(g, x - bw, 0, x + bw, 0, [[0, lit(liquid, 0.2)], [0.5, liquid], [1, dim(liquid, 0.45)]]);
    g.fillRect(x - bw, top, w, yb - top + 1);
    ellipse(g, x, top, bw * 0.95, Math.max(0.15, bw * 0.28), rgba(lit(liquid, 0.45), 0.8));
    g.restore();
  }
  // glass: bright rim on the left, a glint and a faint reflection on the right
  g.save();
  body(); g.clip();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  g.fillRect(x - bw * 0.62, yb - bh * 0.85, Math.max(0.2, w * 0.1), bh * 0.55);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(x + bw * 0.45, yb - bh * 0.7, Math.max(0.15, w * 0.07), bh * 0.4);
  g.restore();
}

/** A clay jar or jug, foot at (x, yb). */
function jar(g: G, x: number, yb: number, w: number, h: number, col: string, rng: RNG, o: { cover?: string; handle?: boolean; mouth?: number } = {}) {
  const bw = w / 2;
  const mouth = (o.mouth ?? 0.62) * bw;
  const body = () => {
    g.beginPath();
    g.moveTo(x - bw * 0.62, yb);
    g.bezierCurveTo(x - bw * 1.12, yb - h * 0.25, x - bw * 1.08, yb - h * 0.75, x - mouth, yb - h * 0.92);
    g.lineTo(x + mouth, yb - h * 0.92);
    g.bezierCurveTo(x + bw * 1.08, yb - h * 0.75, x + bw * 1.12, yb - h * 0.25, x + bw * 0.62, yb);
    g.closePath();
  };
  if (o.handle) {
    g.strokeStyle = dim(col, 0.25); g.lineWidth = Math.max(0.35, w * 0.12);
    g.beginPath(); g.moveTo(x + bw * 0.55, yb - h * 0.85); g.quadraticCurveTo(x + bw * 1.65, yb - h * 0.75, x + bw * 0.9, yb - h * 0.35); g.stroke();
  }
  fillPath(g, body, rad(g, x - bw * 0.4, yb - h * 0.65, 0.05, x, yb - h * 0.45, Math.max(bw, h) * 0.95, [[0, lit(col, 0.4)], [0.45, col], [1, dim(col, 0.5)]]));
  g.save(); body(); g.clip();
  g.strokeStyle = rgba(dim(col, 0.4), 0.3); g.lineWidth = 0.1;
  for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x - bw * 1.2, yb - h * k * 0.22); g.quadraticCurveTo(x, yb - h * k * 0.22 + 0.25, x + bw * 1.2, yb - h * k * 0.22); g.stroke(); }
  g.restore();
  // rim
  ellipse(g, x, yb - h * 0.92, mouth + 0.2, Math.max(0.22, mouth * 0.32), lit(col, 0.2));
  if (o.cover) {
    g.beginPath(); g.ellipse(x, yb - h * 0.93, mouth + 0.35, Math.max(0.35, mouth * 0.5), 0, Math.PI, 0);
    g.lineTo(x + mouth + 0.2, yb - h * 0.82); g.lineTo(x - mouth - 0.2, yb - h * 0.82); g.closePath();
    g.fillStyle = lin(g, x - mouth, 0, x + mouth, 0, [[0, lit(o.cover, 0.3)], [1, dim(o.cover, 0.3)]]);
    g.fill();
    line(g, x - mouth - 0.1, yb - h * 0.85, x + mouth + 0.1, yb - h * 0.85, '#6a4a2a', 0.18);
  } else {
    ellipse(g, x, yb - h * 0.915, mouth * 0.75, Math.max(0.12, mouth * 0.2), dim(col, 0.65));
  }
  if (rng.next() < 0.5) ellipse(g, x - bw * 0.45, yb - h * 0.6, bw * 0.12, h * 0.12, 'rgba(255,245,225,0.35)');
}

/** A small candle flame painted in place (for props the renderer does not animate). */
function smallFlame(g: G, x: number, y: number, h: number) {
  const w = h * 0.36;
  g.fillStyle = rad(g, x, y - h * 0.3, 0.05, x, y - h * 0.35, h * 0.7, [[0, '#fffbe0'], [0.35, '#ffe07a'], [0.75, '#ff9a3a'], [1, 'rgba(255,120,40,0)']]);
  g.beginPath();
  g.moveTo(x, y - h);
  g.quadraticCurveTo(x + w, y - h * 0.4, x + w * 0.6, y - h * 0.05);
  g.quadraticCurveTo(x, y + h * 0.12, x - w * 0.6, y - h * 0.05);
  g.quadraticCurveTo(x - w, y - h * 0.4, x, y - h);
  g.fill();
  ellipse(g, x, y - h * 0.25, w * 0.28, h * 0.2, '#fffef4');
}

/** A heraldic charge: a cross or a raven. */
function emblem(g: G, kind: 'cross' | 'raven', x: number, y: number, s: number, col: string) {
  const fill = lin(g, x - s, y - s, x + s, y + s, [[0, lit(col, 0.35)], [0.5, col], [1, dim(col, 0.35)]]);
  if (kind === 'cross') {
    const t = s * 0.28;
    g.fillStyle = fill;
    g.fillRect(x - t, y - s, t * 2, s * 2);
    g.fillRect(x - s * 0.75, y - s * 0.45 - t, s * 1.5, t * 2);
  } else {
    // a raven perched in profile: heavy beak, hunched body, long wedge tail
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(x - s * 1.12, y - s * 0.42); // beak tip
    g.quadraticCurveTo(x - s * 0.85, y - s * 0.66, x - s * 0.6, y - s * 0.72);
    g.quadraticCurveTo(x - s * 0.3, y - s * 0.86, x - s * 0.16, y - s * 0.58); // crown to nape
    g.quadraticCurveTo(x + s * 0.3, y - s * 0.5, x + s * 0.62, y - s * 0.06); // back
    g.lineTo(x + s * 1.18, y + s * 0.5); // tail
    g.lineTo(x + s * 0.92, y + s * 0.66);
    g.quadraticCurveTo(x + s * 0.5, y + s * 0.4, x + s * 0.2, y + s * 0.38);
    g.quadraticCurveTo(x - s * 0.3, y + s * 0.34, x - s * 0.44, y - s * 0.12); // breast
    g.quadraticCurveTo(x - s * 0.62, y - s * 0.3, x - s * 0.8, y - s * 0.34); // throat
    g.closePath();
    g.fill();
    g.strokeStyle = fill; g.lineWidth = s * 0.1;
    g.beginPath(); g.moveTo(x - s * 0.05, y + s * 0.34); g.lineTo(x - s * 0.1, y + s * 0.82); g.moveTo(x + s * 0.15, y + s * 0.36); g.lineTo(x + s * 0.12, y + s * 0.82); g.moveTo(x - s * 0.45, y + s * 0.84); g.lineTo(x + s * 0.5, y + s * 0.84); g.stroke();
    g.strokeStyle = rgba(dim(col, 0.6), 0.9); g.lineWidth = s * 0.07;
    g.beginPath(); g.moveTo(x - s * 0.2, y - s * 0.22); g.quadraticCurveTo(x + s * 0.3, y - s * 0.1, x + s * 0.7, y + s * 0.3); g.stroke();
    ellipse(g, x - s * 0.5, y - s * 0.56, s * 0.07, s * 0.07, dim(col, 0.8));
  }
}

// ---------------------------------------------------------------- vessels, wheels and boxes

interface BarrelShape { cx: number; top: number; bot: number; rEnd: number; rMid: number; ryTop: number; ryBot: number }

function barrelPath(g: G, b: BarrelShape) {
  const mid = (b.top + b.bot) / 2, ctrl = 2 * b.rMid - b.rEnd;
  g.beginPath();
  g.moveTo(b.cx - b.rEnd, b.top);
  g.quadraticCurveTo(b.cx - ctrl, mid, b.cx - b.rEnd, b.bot);
  g.ellipse(b.cx, b.bot, b.rEnd, b.ryBot, 0, Math.PI, 0, true);
  g.quadraticCurveTo(b.cx + ctrl, mid, b.cx + b.rEnd, b.top);
  g.ellipse(b.cx, b.top, b.rEnd, b.ryTop, 0, 0, Math.PI, true);
  g.closePath();
}

/** Radius of a barrel's bulging side at height y. */
function barrelR(b: BarrelShape, y: number) {
  const t = clamp((y - b.top) / (b.bot - b.top), 0, 1), ctrl = 2 * b.rMid - b.rEnd;
  return (1 - t) * (1 - t) * b.rEnd + 2 * (1 - t) * t * ctrl + t * t * b.rEnd;
}

/** An upright barrel with staves and iron hoops; the top is a lid or open water. */
function barrelUp(g: G, b: BarrelShape, col: string, rng: RNG, top: 'lid' | 'water' = 'lid', hoops = [0.1, 0.32, 0.68, 0.9], rust = 0) {
  const { cx, rMid } = b;
  barrelPath(g, b);
  g.fillStyle = lin(g, cx - rMid, 0, cx + rMid, 0, [[0, dim(col, 0.28)], [0.12, col], [0.3, lit(col, 0.28)], [0.5, col], [0.8, dim(col, 0.36)], [1, dim(col, 0.55)]]);
  g.fill();
  g.save();
  barrelPath(g, b);
  g.clip();
  g.fillStyle = lin(g, 0, b.top, 0, b.bot + b.ryBot, [[0, 'rgba(255,238,205,0.1)'], [0.55, 'rgba(0,0,0,0)'], [1, 'rgba(12,8,4,0.38)']]);
  g.fillRect(cx - rMid - 1, b.top - b.ryTop, rMid * 2 + 2, b.bot - b.top + b.ryTop + b.ryBot + 1);
  // staves: seams follow the bulge, crowded toward the edges
  const n = 9;
  for (let k = 1; k < n; k++) {
    const s = Math.sin(-Math.PI / 2 + (k * Math.PI) / n);
    for (const [dx, colr, w] of [[0, rgba(dim(col, 0.6), 0.55), 0.15], [0.2, rgba(lit(col, 0.35), 0.22), 0.1]] as const) {
      g.strokeStyle = colr; g.lineWidth = w;
      g.beginPath();
      for (let i = 0; i <= 12; i++) {
        const y = b.top + ((b.bot + b.ryBot - b.top) * i) / 12;
        const x = cx + barrelR(b, y) * s + dx * (1 - Math.abs(s));
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    if (rng.next() < 0.35) {
      const y = b.top + (b.bot - b.top) * (0.2 + rng.next() * 0.6);
      knot(g, cx + barrelR(b, y) * (s + 0.12), y, 0.28, col);
    }
  }
  // iron hoops
  for (const f of hoops) {
    const y = b.top + (b.bot - b.top) * f;
    const r = barrelR(b, y) + 0.12, ry = b.ryTop + (b.ryBot - b.ryTop) * f;
    g.strokeStyle = rgba(SHADE, 0.35); g.lineWidth = 0.35;
    g.beginPath(); g.ellipse(cx, y + 0.55, r, ry, 0, 0, Math.PI); g.stroke();
    const ic = (i: number) => (rust ? mix(IRON[i], '#7a4424', rust) : IRON[i]);
    g.strokeStyle = lin(g, cx - r, 0, cx + r, 0, [[0, ic(2)], [0.25, ic(4)], [0.55, ic(2)], [1, ic(0)]]);
    g.lineWidth = 0.85;
    g.beginPath(); g.ellipse(cx, y, r, ry, 0, 0, Math.PI); g.stroke();
    g.strokeStyle = rgba(rust ? '#d8a070' : IRON[5], 0.45); g.lineWidth = 0.18;
    g.beginPath(); g.ellipse(cx, y - 0.3, r, ry, 0, Math.PI * 0.45, Math.PI * 0.92); g.stroke();
    for (const a of [0.3, 0.62]) rivet(g, cx + Math.cos(a * Math.PI) * r, y + Math.sin(a * Math.PI) * ry, 0.2, rust);
  }
  g.restore();
  // the top
  const rt = b.rEnd, ryt = b.ryTop;
  ellipse(g, cx, b.top, rt, ryt, lin(g, cx - rt, b.top - ryt, cx + rt, b.top + ryt, [[0, lit(col, 0.45)], [1, dim(col, 0.1)]]));
  const ix = rt - 0.65, iy = ryt - 0.3;
  if (top === 'lid') {
    ellipse(g, cx, b.top + 0.08, ix, iy, lin(g, 0, b.top - iy, 0, b.top + iy, [[0, dim(col, 0.1)], [1, lit(col, 0.22)]]));
    g.save();
    g.beginPath(); g.ellipse(cx, b.top + 0.08, ix, iy, 0, 0, TAU); g.clip();
    for (let k = -2; k <= 2; k++) line(g, cx - ix, b.top + k * iy * 0.4, cx + ix, b.top + k * iy * 0.4, rgba(dim(col, 0.55), 0.5), 0.12);
    // the rim throws a crescent of shadow onto the head
    g.fillStyle = rgba(SHADE, 0.28);
    g.beginPath(); g.ellipse(cx, b.top + 0.08, ix, iy, 0, 0, TAU); g.ellipse(cx + 0.5, b.top + 0.35, ix, iy, 0, 0, TAU, true); g.fill();
    g.restore();
    ellipse(g, cx + ix * 0.35, b.top + 0.1, 0.42, 0.24, dim(col, 0.5));
    ellipse(g, cx + ix * 0.35 - 0.06, b.top + 0.05, 0.28, 0.15, lit(col, 0.15));
  } else {
    // open: the inner wall of the far side, then the water a little lower
    ellipse(g, cx, b.top + 0.08, ix, iy, dim(col, 0.45));
    g.save();
    g.beginPath(); g.ellipse(cx, b.top + 0.08, ix, iy, 0, 0, TAU); g.clip();
    ellipse(g, cx, b.top + 0.5, ix, iy, lin(g, 0, b.top - iy, 0, b.top + iy + 0.5, [[0, '#1d3a50'], [0.45, '#2c5874'], [1, '#4a7c98']]));
    ellipse(g, cx - ix * 0.35, b.top + 0.25, ix * 0.35, iy * 0.28, 'rgba(210,232,240,0.55)');
    g.strokeStyle = 'rgba(200,225,235,0.35)'; g.lineWidth = 0.12;
    g.beginPath(); g.ellipse(cx + ix * 0.2, b.top + 0.6, ix * 0.4, iy * 0.35, 0, 0, TAU); g.stroke();
    g.restore();
  }
}

/** A spoked wooden wheel with an iron tyre. */
function wheel(g: G, cx: number, cy: number, r: number, col: string, rng: RNG, spokes = 8, o: { rust?: number } = {}) {
  const rIn = r * 0.74;
  // spokes
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * TAU + 0.2;
    const c = Math.cos(a), s = Math.sin(a), nx = -s, ny = c;
    const L = -c * 0.5 - s * 0.6;
    const sc = L > 0 ? lit(col, L * 0.3) : dim(col, -L * 0.35);
    const h0 = r * 0.1, h1 = r * 0.06, r0 = r * 0.22;
    poly(g, [cx + c * r0 + nx * h0, cy + s * r0 + ny * h0, cx + c * (rIn + 0.2) + nx * h1, cy + s * (rIn + 0.2) + ny * h1, cx + c * (rIn + 0.2) - nx * h1, cy + s * (rIn + 0.2) - ny * h1, cx + c * r0 - nx * h0, cy + s * r0 - ny * h0], sc);
    line(g, cx + c * r0 + nx * h0 * 0.5, cy + s * r0 + ny * h0 * 0.5, cx + c * rIn + nx * h1 * 0.5, cy + s * rIn + ny * h1 * 0.5, rgba(lit(col, 0.4), 0.35), 0.1);
  }
  // felloes
  g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.arc(cx, cy, rIn, 0, TAU, true);
  g.fillStyle = lin(g, cx - r, cy - r, cx + r * 0.7, cy + r, [[0, lit(col, 0.3)], [0.5, col], [1, dim(col, 0.45)]]);
  g.fill();
  g.strokeStyle = rgba(dim(col, 0.6), 0.6); g.lineWidth = 0.12;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.55;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * rIn, cy + Math.sin(a) * rIn); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
  }
  // inner shading on the felloe: dark lower right, lit upper left
  g.strokeStyle = rgba(SHADE, 0.3); g.lineWidth = 0.35;
  g.beginPath(); g.arc(cx, cy, rIn + 0.2, -0.3, Math.PI * 0.8); g.stroke();
  const ic = (i: number) => (o.rust ? mix(IRON[i], '#7a4424', o.rust) : IRON[i]);
  g.strokeStyle = lin(g, cx - r, cy - r, cx + r, cy + r, [[0, ic(4)], [0.5, ic(2)], [1, ic(0)]]);
  g.lineWidth = Math.max(0.45, r * 0.12);
  g.beginPath(); g.arc(cx, cy, r - g.lineWidth / 2, 0, TAU); g.stroke();
  g.strokeStyle = rgba(o.rust ? '#d8a070' : IRON[5], 0.45); g.lineWidth = 0.14;
  g.beginPath(); g.arc(cx, cy, r - 0.15, Math.PI * 1.0, Math.PI * 1.55); g.stroke();
  // hub
  const hr = r * 0.24;
  ellipse(g, cx, cy, hr, hr, ballShade(g, cx, cy, hr, col, 0.45, 0.55));
  ellipse(g, cx, cy, hr * 0.5, hr * 0.5, rad(g, cx - hr * 0.2, cy - hr * 0.2, 0.02, cx, cy, hr * 0.5, [[0, IRON[4]], [1, IRON[1]]]));
  ellipse(g, cx - hr * 0.2, cy - hr * 0.22, hr * 0.14, hr * 0.1, 'rgba(255,255,255,0.4)');
}

/** A wooden bucket, foot at (x, yb). */
function bucket(g: G, x: number, yb: number, w: number, h: number, col: string, rng: RNG, water = false) {
  const b: BarrelShape = { cx: x, top: yb - h + w * 0.14, bot: yb - w * 0.12, rEnd: w / 2, rMid: w / 2, ryTop: w * 0.16, ryBot: w * 0.12 };
  const shape = () => { g.beginPath(); g.moveTo(x - w / 2, b.top); g.lineTo(x - w * 0.4, b.bot); g.ellipse(x, b.bot, w * 0.4, b.ryBot, 0, Math.PI, 0, true); g.lineTo(x + w / 2, b.top); g.ellipse(x, b.top, w / 2, b.ryTop, 0, 0, Math.PI, true); g.closePath(); };
  fillPath(g, shape, lin(g, x - w / 2, 0, x + w / 2, 0, [[0, dim(col, 0.2)], [0.25, lit(col, 0.25)], [0.6, col], [1, dim(col, 0.5)]]));
  g.save(); shape(); g.clip();
  for (let k = 1; k < 5; k++) line(g, x - w / 2 + (w * k) / 5, b.top, x - w * 0.4 + (w * 0.8 * k) / 5, b.bot + 1, rgba(dim(col, 0.6), 0.45), 0.1);
  for (const f of [0.25, 0.8]) {
    const y = b.top + (b.bot - b.top) * f;
    g.strokeStyle = lin(g, x - w / 2, 0, x + w / 2, 0, [[0, IRON[4]], [1, IRON[0]]]); g.lineWidth = 0.4;
    g.beginPath(); g.ellipse(x, y, w / 2 - (w * 0.1 * f), b.ryTop, 0, 0, Math.PI); g.stroke();
  }
  g.restore();
  ellipse(g, x, b.top, w / 2, b.ryTop, lit(col, 0.3));
  ellipse(g, x, b.top + 0.05, w / 2 - 0.3, b.ryTop - 0.12, water ? '#2c5470' : dim(col, 0.55));
  if (water) ellipse(g, x - w * 0.12, b.top, w * 0.12, b.ryTop * 0.3, 'rgba(210,232,240,0.6)');
}

// ================================================================ props

interface K { type: string; v: number; opt: string; seed: number }
const rngOf = (k: K, salt = 0) => new RNG(k.seed + salt);
/** A colour option (blankets, banners, rugs...), or the fallback when it is not a hex colour. */
const hexOr = (opt: string, fallback: string) => (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(opt) ? opt : fallback);

function makeProp(type: string, v: number, opt: string): PropInfo {
  const k: K = { type, v, opt, seed: (hashStr(type) + v * 7919 + hashStr(opt) * 31) >>> 0 };
  switch (type) {
    case 'barrel': return barrelProp(k);
    case 'crate': return crateProp(k);
    case 'sack': return sackProp(k);
    case 'haystack': return haystackProp(k);
    case 'cart': return cartProp(k);
    case 'woodpile': return woodpileProp(k);
    case 'fence_h': return fenceHProp(k, false);
    case 'fence_h_broken': return fenceHProp(k, true);
    case 'fence_v': return fenceVProp(k);
    case 'fence_post': return fencePostProp(k);
    case 'anvil': return anvilProp(k);
    case 'forge': return forgeProp(k);
    case 'grindstone': return grindstoneProp(k);
    case 'well': return wellProp(k);
    case 'trough': return troughProp(k);
    case 'bench': return benchProp(k);
    case 'table': return tableProp(k, false);
    case 'table_long': return tableProp(k, true);
    case 'stool': return stoolProp(k);
    case 'chair': return chairProp(k);
    case 'throne': return throneProp(k);
    case 'bed': return bedProp(k);
    case 'bed_straw': return bedStrawProp(k);
    case 'chest': return chestProp(k);
    case 'shelf': return shelfProp(k);
    case 'bookshelf': return bookshelfProp(k);
    case 'fireplace': case 'hearth': return fireplaceProp(k);
    case 'oven': return ovenProp(k);
    case 'cauldron': return cauldronProp(k);
    case 'alchemy': return alchemyProp(k);
    case 'lectern': return lecternProp(k);
    case 'altar': return altarProp(k);
    case 'pew': return pewProp(k);
    case 'candle': return candleProp(k);
    case 'candelabra': return candelabraProp(k);
    case 'torch': return torchProp(k);
    case 'banner': return bannerProp(k);
    case 'window': return windowProp(k);
    case 'hanging_herbs': return hangingHerbsProp(k);
    case 'rug': return rugProp(k);
    case 'signpost': return signpostProp(k);
    case 'noticeboard': return noticeboardProp(k);
    case 'grave': return graveProp(k, false);
    case 'grave_fresh': return graveProp(k, true);
    case 'wayshrine': return wayshrineProp(k);
    case 'pillory': return pilloryProp(k);
    case 'dummy': return dummyProp(k);
    case 'target': return targetProp(k);
    case 'weaponrack': return weaponrackProp(k);
    case 'campfire': return campfireProp(k);
    case 'bonfire': return bonfireProp(k);
    case 'skep': return skepProp(k);
    case 'coop': return coopProp(k);
    case 'kennel': return kennelProp(k);
    case 'laundry': return laundryProp(k);
    case 'rubble': return rubbleProp(k);
    case 'cage': return cageProp(k);
    case 'gallows': return gallowsProp(k);
    case 'mine': return mineProp(k);
    case 'minecart': return minecartProp(k);
    case 'waterwheel': return waterwheelProp(k);
    case 'boat': return boatProp(k);
    case 'fountain': return fountainProp(k);
    case 'statue': return statueProp(k);
    case 'dryingrack': return dryingrackProp(k);
    case 'spinningwheel': return spinningwheelProp(k);
    case 'millstone': return millstoneProp(k);
    case 'barrelstack': return barrelstackProp(k);
    case 'cross': return crossProp(k);
    case 'pot': return potProp(k);
    case 'ladder': return ladderProp(k);
    case 'stairs_down': return stairsDownProp(k);
    case 'bloodpool': return bloodpoolProp(k);
    case 'breadbasket': return breadbasketProp(k);
    case 'loom': return loomProp(k);
    case 'tub': return tubProp(k);
    case 'tent_small': return tentSmallProp(k);
    case 'bedroll': return bedrollProp(k);
    case 'stall_goods': return stallGoodsProp(k);
    case 'flag': return flagProp(k);
    case 'milestone': return milestoneProp(k);
    case 'orepile': return orepileProp(k);
  }
  return placeholder(k);
}

/** A loud magenta box so a missing prop type is obvious in testing. */
function placeholder(k: K): PropInfo {
  return {
    sprite: art(12, 12, 6, 11, (g) => {
      roundRect(g, 0.5, 0.5, 11, 11, 1.5, lin(g, 0, 0, 12, 12, [[0, '#ff66ff'], [1, '#b000b0']]));
      g.fillStyle = '#fff';
      g.font = 'bold 8px sans-serif';
      g.textAlign = 'center';
      g.fillText('?', 6, 9);
    }, { grain: 0 }),
  };
}

// ---------------------------------------------------------------- containers and stores

function barrelProp(k: K): PropInfo {
  const W = 14, H = 17, cx = 7, by = 15.5;
  const water = k.opt === 'water';
  return {
    sprite: art(W, H, cx, by, (g) => {
      // a rain barrel stands outside: its hoops have rusted
      barrelUp(g, { cx, top: 3.3, bot: by - 1.15, rEnd: 4.7, rMid: 5.7, ryTop: 1.9, ryBot: 1.15 }, water ? '#7a5838' : '#80593a', rngOf(k), water ? 'water' : 'lid', undefined, water ? 0.35 : 0);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.6, by - 0.1, 7, 1.9, 0.42) }),
    solid: { w: 10, h: 6 },
  };
}

function crateProp(k: K): PropInfo {
  const W = 16, H = 16, cx = 8, by = 14.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const x0 = 1.4, x1 = 14.6, top = 1.5, fy = 5.4;
      const col = PINE;
      // lid: boards seen from above, the brightest face
      planks(g, x0, top, x1 - x0, fy - top, 3, lit(col, 0.3), rng, false, 0.2);
      board(g, x0, top, 1.7, fy - top, lit(col, 0.22), rng, { vertical: true, knots: 0 });
      board(g, x1 - 1.7, top, 1.7, fy - top, lit(col, 0.08), rng, { vertical: true, knots: 0 });
      // front: slats in a frame, braced corner to corner
      planks(g, x0, fy, x1 - x0, by - fy, 3, dim(col, 0.16), rng, false, 0.3);
      g.save();
      clipRect(g, x0 + 1.8, fy + 1.5, x1 - x0 - 3.6, by - fy - 3.1);
      g.fillStyle = 'rgba(8,5,3,0.25)';
      g.fillRect(x0, fy, x1 - x0, by - fy);
      slantBeam(g, x0 + 1.2, by - 1.1, x1 - 1.2, fy + 1.1, 1.8, col, rng);
      g.restore();
      board(g, x0, fy, x1 - x0, 1.6, dim(col, 0.04), rng, { knots: 0 });
      board(g, x0, by - 1.6, x1 - x0, 1.6, dim(col, 0.18), rng, { knots: 0 });
      board(g, x0, fy, 1.9, by - fy, dim(col, 0.06), rng, { vertical: true, knots: 0 });
      board(g, x1 - 1.9, fy, 1.9, by - fy, dim(col, 0.26), rng, { vertical: true, knots: 0 });
      g.fillStyle = rgba(lit(col, 0.6), 0.6);
      g.fillRect(x0, fy - 0.12, x1 - x0, 0.26);
      for (const [nx, ny] of [[x0 + 0.95, fy + 0.8], [x1 - 0.95, fy + 0.8], [x0 + 0.95, by - 0.8], [x1 - 0.95, by - 0.8], [x0 + 0.85, top + 0.75], [x1 - 0.85, top + 0.75], [x0 + 0.85, fy - 0.75], [x1 - 0.85, fy - 0.75]]) rivet(g, nx, ny, 0.19);
      // a merchant's mark burnt into the lid
      g.strokeStyle = rgba('#3a2412', 0.55); g.lineWidth = 0.25;
      g.beginPath(); g.moveTo(cx - 1.6, top + 1.2); g.lineTo(cx, top + 2.9); g.lineTo(cx + 1.6, top + 1.2); g.moveTo(cx, top + 2.9); g.lineTo(cx, top + 0.6); g.moveTo(cx - 0.8, top + 1.0); g.lineTo(cx + 0.8, top + 1.0); g.stroke();
      g.fillStyle = lin(g, x0, top, x1, by, [[0, 'rgba(255,236,200,0.1)'], [0.55, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.24)']]);
      g.fillRect(x0, top, x1 - x0, by - top);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by, 8.8, 2, 0.42) }),
    solid: { w: 13, h: 8 },
  };
}

function sackProp(k: K): PropInfo {
  const W = 12, H = 13, cx = 6, by = 11.5;
  const flour = k.opt === 'flour';
  const col = flour ? '#d0c4a4' : '#aa956e';
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const body = () => {
        g.beginPath();
        g.moveTo(cx - 1.5, 3.7);
        g.bezierCurveTo(cx - 4.3, 4.6, cx - 5.5, 7.6, cx - 4.9, by - 1.1);
        g.quadraticCurveTo(cx - 4.5, by + 0.15, cx - 0.2, by + 0.1);
        g.quadraticCurveTo(cx + 4.7, by + 0.15, cx + 5.1, by - 1.3);
        g.bezierCurveTo(cx + 5.5, 7.4, cx + 4.5, 4.5, cx + 1.6, 3.7);
        g.closePath();
      };
      fillPath(g, body, rad(g, cx - 2, 5.6, 0.3, cx, 7.6, 6.6, [[0, lit(col, 0.4)], [0.45, col], [1, dim(col, 0.52)]]));
      g.save(); body(); g.clip();
      weave(g, 0, 3, W, by + 1, col, 0.45, 0.16);
      g.lineWidth = 0.38;
      for (const [x0, x1, y1, c] of [[-1.1, -3.3, 8.8, 0.55], [0.3, 0.9, 9.6, 0.4], [1.1, 3.5, 8.3, 0.5]] as const) {
        g.strokeStyle = rgba(dim(col, 0.6), c);
        g.beginPath(); g.moveTo(cx + x0, 4); g.quadraticCurveTo(cx + (x0 + x1) / 2 + 0.6, (4 + y1) / 2, cx + x1, y1); g.stroke();
        g.strokeStyle = rgba(lit(col, 0.45), c * 0.6);
        g.beginPath(); g.moveTo(cx + x0 - 0.4, 4.1); g.quadraticCurveTo(cx + (x0 + x1) / 2 + 0.2, (4 + y1) / 2, cx + x1 - 0.4, y1); g.stroke();
      }
      g.fillStyle = lin(g, 0, by - 3, 0, by + 0.2, [[0, 'rgba(10,6,4,0)'], [1, 'rgba(10,6,4,0.35)']]);
      g.fillRect(0, by - 3, W, 3.4);
      if (flour) {
        // the mill's wheel stamped in faded woad, and a dusting of flour
        g.strokeStyle = rgba('#4a5e86', 0.6); g.lineWidth = 0.26;
        g.beginPath(); g.arc(cx + 0.4, 7.9, 1.5, 0, TAU); g.stroke();
        for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI; g.beginPath(); g.moveTo(cx + 0.4 + Math.cos(a) * 1.5, 7.9 + Math.sin(a) * 1.5); g.lineTo(cx + 0.4 - Math.cos(a) * 1.5, 7.9 - Math.sin(a) * 1.5); g.stroke(); }
        for (let i = 0; i < 16; i++) ellipse(g, cx - 3.2 + rng.next() * 6.4, 4 + rng.next() * 2.8, 0.35 + rng.next() * 0.5, 0.25, 'rgba(252,250,244,0.55)');
      }
      g.restore();
      const ruf = () => {
        g.beginPath();
        g.moveTo(cx - 1.6, 3.9);
        g.lineTo(cx - 2.7, 1.9); g.quadraticCurveTo(cx - 2.3, 0.9, cx - 1.3, 1.2);
        g.lineTo(cx - 0.7, 1.9); g.quadraticCurveTo(cx - 0.1, 0.5, cx + 0.6, 0.9);
        g.lineTo(cx + 1.0, 1.7); g.quadraticCurveTo(cx + 2.1, 1.0, cx + 2.6, 1.8);
        g.lineTo(cx + 1.7, 3.9);
        g.closePath();
      };
      fillPath(g, ruf, lin(g, cx - 2.6, 0, cx + 2.6, 0, [[0, lit(col, 0.32)], [0.5, col], [1, dim(col, 0.38)]]));
      g.strokeStyle = rgba(dim(col, 0.6), 0.6); g.lineWidth = 0.15;
      for (const x of [-1.2, -0.2, 0.9]) { g.beginPath(); g.moveTo(cx + x, 1.6); g.lineTo(cx + x * 0.6, 3.6); g.stroke(); }
      if (flour) for (let i = 0; i < 6; i++) ellipse(g, cx - 1.8 + rng.next() * 3.6, 1.3 + rng.next() * 0.7, 0.4, 0.2, 'rgba(252,250,244,0.85)');
      roundRect(g, cx - 2.0, 3.2, 4.0, 1.15, 0.5, lin(g, 0, 3.2, 0, 4.35, [[0, '#b08e58'], [1, '#5e4424']]));
      g.strokeStyle = 'rgba(40,26,12,0.6)'; g.lineWidth = 0.12;
      for (let x = cx - 1.8; x < cx + 1.9; x += 0.5) { g.beginPath(); g.moveTo(x, 3.3); g.lineTo(x + 0.35, 4.25); g.stroke(); }
      line(g, cx + 1.6, 3.9, cx + 2.3, 5.5, '#7a5a30', 0.24);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.5, by - 0.1, 5.8, 1.5, 0.42) }),
    solid: { w: 8, h: 5 },
  };
}

function haystackProp(k: K): PropInfo {
  const W = 30, H = 24, cx = 15, by = 22.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const top = 2.4, rx = 13.6;
      const shape = () => {
        g.beginPath();
        g.moveTo(cx - rx, by - 0.4);
        g.bezierCurveTo(cx - rx - 0.9, by - 9.5, cx - 9.6, top, cx, top);
        g.bezierCurveTo(cx + 9.6, top, cx + rx + 0.9, by - 9.5, cx + rx, by - 0.4);
        g.quadraticCurveTo(cx, by + 1.1, cx - rx, by - 0.4);
        g.closePath();
      };
      post(g, cx + 0.8, 0.4, 6, 0.9, GREY, rng, 'point');
      fillPath(g, shape, rad(g, cx - 5, by - 14, 1, cx, by - 8, 17, [[0, STRAW[6]], [0.45, STRAW[4]], [0.8, STRAW[2]], [1, STRAW[1]]]));
      g.save(); shape(); g.clip();
      const cy = by - 8;
      const light = (x: number, y: number) => 0.62 - ((x - cx) / rx) * 0.42 - ((y - cy) / (by - top)) * 0.75;
      strawStrokes(g, 1800, () => [cx - rx - 1 + rng.next() * (rx * 2 + 2), top - 1 + rng.next() * (by - top + 2)], rng, {
        ang: (x) => Math.PI / 2 + ((x - cx) / rx) * 0.75, len: [2.2, 4.4], w: 0.36, light,
      });
      // courses where each forkful overhangs the one below
      for (let i = 0; i < 4; i++) {
        const yy = top + 4.5 + i * 4.2;
        const half = rx * Math.min(1, 0.55 + i * 0.16);
        g.strokeStyle = rgba('#3a2a10', 0.28); g.lineWidth = 0.7;
        g.beginPath(); g.moveTo(cx - half, yy + 1.4); g.quadraticCurveTo(cx, yy - 0.6, cx + half, yy + 1.4); g.stroke();
        g.strokeStyle = rgba(STRAW[7], 0.2); g.lineWidth = 0.4;
        g.beginPath(); g.moveTo(cx - half, yy + 0.8); g.quadraticCurveTo(cx, yy - 1.2, cx + half, yy + 0.8); g.stroke();
      }
      g.fillStyle = lin(g, 0, by - 6, 0, by + 1, [[0, 'rgba(20,12,4,0)'], [1, 'rgba(20,12,4,0.5)']]);
      g.fillRect(0, by - 6, W, 7);
      g.fillStyle = rad(g, cx - 5, top + 5, 0.5, cx + 2, by - 6, 17, [[0, 'rgba(255,244,210,0.22)'], [0.4, 'rgba(255,244,210,0)'], [0.75, 'rgba(12,8,20,0.12)'], [1, 'rgba(12,8,20,0.42)']]);
      g.fillRect(0, 0, W, H);
      g.restore();
      for (let i = 0; i < 34; i++) {
        const t = rng.next();
        const a = Math.PI + 0.12 + t * (Math.PI - 0.24);
        const x = cx + Math.cos(a) * rx * 0.98, y = by - 0.6 + Math.sin(a) * (by - top) * (0.95 + 0.08 * Math.abs(Math.cos(a)));
        blade(g, x, y, 0.8 + rng.next() * 1.1, a + Math.PI / 2 * (Math.cos(a) < 0 ? -1 : 1) * 0.6 + (rng.next() - 0.5) * 0.6, (rng.next() - 0.5) * 0.4, 0.26, STRAW[3 + Math.floor((1 - t) * 3 + rng.next() * 2)]);
      }
      for (let i = 0; i < 18; i++) {
        const x = cx + (rng.next() * 2 - 1) * (rx + 1.5);
        blade(g, x, by - rng.next() * 0.8, 1.5 + rng.next() * 2, (rng.next() < 0.5 ? 0 : Math.PI) + (rng.next() - 0.5) * 0.5, 0.2, 0.3, STRAW[2 + Math.floor(rng.next() * 4)]);
      }
    }, { seed: k.seed, under: (g) => contact(g, cx + 1, by, 15.5, 3, 0.42) }),
    solid: { w: 24, h: 10 },
  };
}

function cartProp(k: K): PropInfo {
  const W = 38, H = 26, cx = 17, by = 24.5;
  const cargo = k.opt;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const x0 = cx - 14, x1 = cx + 14;
      const rimFar = 5.4, rimNear = 9.8, sideBot = 17.4;
      const wood = '#7c5a3a';
      // the far shaft, half hidden
      slantBeam(g, x1 - 1, 12.4, W - 1.6, by - 4.4, 1.1, dim(wood, 0.3), rng);
      // inside the bed: far wall and floor boards
      board(g, x0 + 0.8, rimFar, x1 - x0 - 1.6, 2.2, dim(wood, 0.42), rng, { knots: 0 });
      planks(g, x0 + 0.8, rimFar + 2.2, x1 - x0 - 1.6, rimNear - rimFar - 1.9, 2, dim(wood, 0.5), rng, false);
      g.fillStyle = lin(g, 0, rimFar, 0, rimNear, [[0, 'rgba(8,5,3,0.5)'], [1, 'rgba(8,5,3,0.12)']]);
      g.fillRect(x0, rimFar, x1 - x0, rimNear - rimFar);
      board(g, x0, rimFar - 0.3, 1.2, rimNear - rimFar + 0.6, lit(wood, 0.25), rng, { vertical: true, knots: 0 });
      board(g, x1 - 1.2, rimFar - 0.3, 1.2, rimNear - rimFar + 0.6, wood, rng, { vertical: true, knots: 0 });
      board(g, x0, rimFar - 0.8, x1 - x0, 0.95, lit(wood, 0.22), rng, { knots: 0 });
      // cargo
      if (cargo === 'hay') {
        const bumps = [2.6, 1.4, 0.9, 1.5, 0.7, 1.2, 2.2];
        const heap = () => {
          g.beginPath();
          g.moveTo(x0 - 0.5, rimNear + 1.4);
          g.quadraticCurveTo(x0 - 1.4, 4.2, x0 + 1.4, bumps[0]);
          for (let i = 1; i < bumps.length; i++) { const xa = x0 + 1.4 + ((x1 - x0 - 2.8) * (i - 0.5)) / (bumps.length - 1), xb = x0 + 1.4 + ((x1 - x0 - 2.8) * i) / (bumps.length - 1); g.quadraticCurveTo(xa, Math.min(bumps[i - 1], bumps[i]) - 0.9, xb, bumps[i]); }
          g.quadraticCurveTo(x1 + 1.4, 4.2, x1 + 0.5, rimNear + 1.4);
          g.closePath();
        };
        fillPath(g, heap, lin(g, 0, 0.5, 0, rimNear, [[0, STRAW[5]], [1, STRAW[2]]]));
        g.save(); heap(); g.clip();
        strawStrokes(g, 900, () => [x0 - 1 + rng.next() * (x1 - x0 + 2), rng.next() * (rimNear + 1)], rng, {
          ang: (x) => Math.PI / 2 + ((x - cx) / 16) * 0.9 + (rng.next() - 0.5) * 0.8, len: [2, 4],
          light: (x, y) => 0.75 - (y / rimNear) * 0.55 - ((x - cx) / 16) * 0.25,
        });
        g.restore();
      } else if (cargo === 'bread') {
        // loaves heaped on a linen cloth
        fillPath(g, () => { g.beginPath(); g.moveTo(x0 + 1, rimNear); g.quadraticCurveTo(x0 + 3, 3.5, cx - 4, 4); g.quadraticCurveTo(cx + 8, 3, x1 - 1, 5); g.lineTo(x1 - 1, rimNear); g.closePath(); }, lin(g, 0, 3.5, 0, rimNear, [[0, LINEN], [1, dim(LINEN, 0.25)]]));
        const spots: [number, number, number, number][] = [[cx - 10, 5.8, 2.7, 1.8], [cx - 4.5, 5.2, 2.8, 1.9], [cx + 1.5, 5.4, 2.6, 1.8], [cx + 7.5, 5.8, 2.8, 1.9], [cx - 7.5, 8.2, 2.9, 1.9], [cx - 1.5, 8.0, 2.8, 1.9], [cx + 4.5, 8.3, 2.9, 1.9], [cx + 10.2, 8.4, 2.5, 1.7], [cx - 1.6, 3.4, 2.6, 1.7]];
        for (const [x, y, rx, ry] of spots) loaf(g, x, y, rx, ry, rng, { rot: (rng.next() - 0.5) * 0.4, cuts: 3, dark: rng.next() * 0.15 });
      } else if (cargo === 'barrels') {
        for (const [bx, t] of [[cx - 8.6, 1.9], [cx + 8.6, 2.1], [cx, 1.4]] as [number, number][]) {
          barrelUp(g, { cx: bx, top: t, bot: 11.5, rEnd: 3.5, rMid: 4.1, ryTop: 1.35, ryBot: 1 }, '#80593a', rng, 'lid', [0.12, 0.4]);
        }
      } else {
        for (let i = 0; i < 26; i++) blade(g, x0 + 2 + rng.next() * (x1 - x0 - 4), rimNear - 0.3 - rng.next() * 3, 1.5 + rng.next() * 2, rng.next() * Math.PI, 0.3, 0.3, STRAW[3 + Math.floor(rng.next() * 3)]);
        // an empty sack thrown in the back
        fillPath(g, () => { g.beginPath(); g.ellipse(cx + 6, rimNear - 1.6, 4, 1.8, -0.1, 0, TAU); }, rad(g, cx + 5, rimNear - 2.4, 0.2, cx + 6, rimNear - 1.6, 4.2, [[0, '#c4b08a'], [1, '#6e5e44']]));
      }
      // near side: boards between iron-shod stakes
      planks(g, x0, rimNear, x1 - x0, sideBot - rimNear, 3, wood, rng, false, 0.22);
      g.fillStyle = lin(g, x0, 0, x1, 0, [[0, 'rgba(255,236,200,0.08)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.22)']]);
      g.fillRect(x0, rimNear, x1 - x0, sideBot - rimNear);
      if (cargo === 'hay') for (let i = 0; i < 30; i++) blade(g, x0 + rng.next() * (x1 - x0), rimNear - 0.4, 1.5 + rng.next() * 2.2, Math.PI / 2 + (rng.next() - 0.5) * 0.9, 0.3, 0.32, STRAW[2 + Math.floor(rng.next() * 4)]);
      board(g, x0 - 0.5, rimNear - 0.6, x1 - x0 + 1, 1.35, lit(wood, 0.16), rng, { knots: 0 });
      for (const sx of [x0 + 0.2, cx - 7, cx, cx + 7, x1 - 1.6]) {
        board(g, sx, rimNear - 0.2, 1.4, sideBot - rimNear + 0.8, dim(wood, 0.14), rng, { vertical: true, knots: 0 });
        ironBar(g, sx - 0.05, sideBot - 2.2, 1.5, 0.7);
        rivet(g, sx + 0.7, rimNear + 1.3, 0.19);
      }
      board(g, x0 - 0.5, sideBot - 0.7, x1 - x0 + 1, 1.35, dim(wood, 0.22), rng, { knots: 0 });
      // under the bed: shadow, the axle trees
      g.fillStyle = 'rgba(12,8,5,0.8)';
      g.fillRect(x0 + 3, sideBot + 0.6, x1 - x0 - 6, 1.6);
      beam(g, x0 + 3, sideBot + 0.7, x1 - x0 - 6, 1.1, dim(wood, 0.5), rng);
      slantBeam(g, x1 - 1.6, 14.8, W - 0.6, by - 1.4, 1.35, wood, rng);
      ironBar(g, W - 2.4, by - 2.6, 1.6, 0.6);
      wheel(g, cx - 9.5, by - 5.3, 5.3, '#6e5034', rng, 10);
      wheel(g, cx + 9.5, by - 5.3, 5.3, '#6a4c32', rng, 10);
    }, { seed: k.seed, under: (g) => { contact(g, cx + 1, by - 0.8, 16.5, 2.6, 0.4); contact(g, cx - 9.5, by, 4.4, 1.1, 0.4); contact(g, cx + 9.5, by, 4.4, 1.1, 0.4); contact(g, W - 1.2, by - 0.6, 1.6, 0.6, 0.4); } }),
    solid: { w: 30, h: 10 },
  };
}

function woodpileProp(k: K): PropInfo {
  const W = 28, H = 18, cx = 14, by = 16.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      post(g, 1.5, 4.6, by, 1.2, GREY, rng, 'point');
      post(g, W - 1.5, 5.0, by, 1.2, GREY, rng, 'point');
      const rows: [number, number, number][] = [[5, by - 2.7, 0], [4, by - 7.0, 2.45], [3, by - 11.3, 4.9]];
      for (const [n, y, off] of rows) {
        for (let i = 0; i < n; i++) {
          const x = 4.1 + off + i * 4.9 + (rng.next() - 0.5) * 0.5;
          const r = 2.25 + rng.next() * 0.45;
          const ry = r * (0.9 + rng.next() * 0.12);
          const yy = y + (rng.next() - 0.5) * 0.4;
          const depth = 2.2;
          const body = () => { g.beginPath(); g.moveTo(x - r, yy); g.lineTo(x - r, yy - depth); g.ellipse(x, yy - depth, r, ry, 0, Math.PI, 0); g.lineTo(x + r, yy); g.closePath(); };
          fillPath(g, body, lin(g, x - r, 0, x + r, 0, [[0, BARK[3]], [0.3, BARK[4]], [0.6, BARK[2]], [1, BARK[0]]]));
          g.save(); body(); g.clip();
          for (let j = 0; j < 8; j++) { const bx = x - r + rng.next() * r * 2; line(g, bx, yy - depth - ry, bx + (rng.next() - 0.5) * 0.3, yy, rgba(rng.next() < 0.6 ? BARK[0] : BARK[4], 0.5), 0.14); }
          if (rng.next() < 0.3) ellipse(g, x - r * 0.4, yy - depth - ry * 0.4, r * 0.5, ry * 0.3, rgba('#6a8a3a', 0.5));
          g.restore();
          endGrain(g, x, yy, r, ry, rng, BARK[1], jitter(CUT[2], rng, 0.07));
        }
      }
      for (let i = 0; i < 12; i++) ellipse(g, 2 + rng.next() * (W - 4), by - rng.next() * 0.7, 0.3 + rng.next() * 0.45, 0.16, jitter(CUT[2], rng, 0.1), rng.next() * 3);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.2, 14.5, 2.3, 0.42) }),
    solid: { w: 24, h: 8 },
  };
}

function fenceHProp(k: K, broken: boolean): PropInfo {
  const W = 16, H = 16, by = 14.5;
  return {
    sprite: art(W, H, 8, by, (g) => {
      const rng = rngOf(k);
      post(g, 2.4, 2.3, by + 0.2, 2.3, GREY, rng, 'cut');
      board(g, 0, 5.3, W, 1.9, GREY, rng, { knots: 1 });
      if (!broken) board(g, 0, 9.5, W, 1.8, dim(GREY, 0.04), rng, { knots: 0 });
      else {
        // the lower rail has come away from the next post and dropped
        slantBeam(g, 1.0, 10.4, 13.4, by - 0.9, 1.8, dim(GREY, 0.04), rng);
        poly(g, [13.1, by - 1.9, 14.4, by - 1.2, 13.6, by - 0.6, 14.9, by - 0.2, 13.2, by + 0.1], CUT[1]);
        slantBeam(g, 12.2, by - 0.1, 15.6, by - 1.0, 1.2, dim(GREY, 0.18), rng);
      }
      for (const y of [6.25, 10.45]) { rivet(g, 1.85, y, 0.19); rivet(g, 2.95, y, 0.19); }
      tufts(g, 0.8, 4.2, by, rng, 3);
      tufts(g, 7, 12, by, rng, 1, 1.6);
    }, { seed: k.seed, under: (g) => contact(g, 2.9, by, 3, 1, 0.4) }),
    solid: { w: 16, h: 4 },
  };
}

function fenceVProp(k: K): PropInfo {
  const W = 8, H = 20, cx = 4, by = 18.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      // two rails seen from above, running north to the next post, a sliver of shadow between
      g.fillStyle = rgba(SHADE, 0.35); g.fillRect(cx - 0.4, 0.8, 0.8, by - 4.4);
      board(g, cx - 1.3, 0.6, 0.9, by - 3.9, lit(GREY, 0.12), rng, { vertical: true, knots: 0 });
      board(g, cx + 0.4, 0.9, 0.9, by - 4.8, GREY, rng, { vertical: true, knots: 0 });
      for (const [x, y] of [[cx - 0.85, 0.6], [cx + 0.85, 0.9]]) ellipse(g, x, y, 0.45, 0.22, CUT[1]);
      post(g, cx, by - 11.8, by + 0.2, 2.6, GREY, rng, 'cut');
      rivet(g, cx - 0.6, by - 5.0, 0.19); rivet(g, cx + 0.6, by - 9.2, 0.19);
      tufts(g, cx - 2.6, cx + 2.6, by, rng, 3);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.5, by, 2.9, 1, 0.4) }),
    solid: { w: 4, h: 16 },
  };
}

function fencePostProp(k: K): PropInfo {
  const W = 6, H = 14, cx = 3, by = 12.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      post(g, cx, 1.8, by + 0.2, 2.4, GREY, rng, 'cut');
      // a tether rope knotted round it
      g.strokeStyle = '#a08658'; g.lineWidth = 0.45;
      g.beginPath(); g.ellipse(cx, 4.6, 1.35, 0.45, 0, 0.1, Math.PI - 0.1); g.stroke();
      g.strokeStyle = 'rgba(60,40,18,0.6)'; g.lineWidth = 0.12;
      for (let x = cx - 1.1; x < cx + 1.2; x += 0.45) { g.beginPath(); g.moveTo(x, 4.7); g.lineTo(x + 0.25, 5.1); g.stroke(); }
      line(g, cx + 1.2, 5, cx + 2.2, 7.4, '#a08658', 0.35);
      tufts(g, cx - 2.4, cx + 2.4, by, rng, 3, 2);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.5, by, 2.6, 0.9, 0.4) }),
    solid: { w: 3, h: 3 },
  };
}

// ---------------------------------------------------------------- smithy and yard

function anvilProp(k: K): PropInfo {
  const W = 18, H = 14, cx = 9, by = 12.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      // a hammer leaning on the block
      line(g, cx + 4.7, by - 0.2, cx + 6.4, by - 5.3, '#6a4a2c', 0.6);
      line(g, cx + 4.5, by - 0.3, cx + 6.2, by - 5.4, rgba('#c09a68', 0.6), 0.16);
      roundRect(g, cx + 5.2, by - 6.7, 2.6, 1.35, 0.3, lin(g, 0, by - 6.7, 0, by - 5.35, [[0, IRON[4]], [1, IRON[1]]]));
      // the block: a length of oak trunk bound with iron
      const sx0 = cx - 3.8, sx1 = cx + 3.8, st = 8.7;
      const stump = () => { g.beginPath(); g.moveTo(sx0, st); g.lineTo(sx0 - 0.3, by - 0.8); g.ellipse(cx, by - 0.8, 4.1, 0.9, 0, Math.PI, 0, true); g.lineTo(sx1, st); g.closePath(); };
      fillPath(g, stump, lin(g, sx0, 0, sx1, 0, [[0, BARK[2]], [0.25, BARK[4]], [0.55, BARK[2]], [1, BARK[0]]]));
      g.save(); stump(); g.clip();
      for (let j = 0; j < 14; j++) { const bx = sx0 + rng.next() * 7.6; line(g, bx, st, bx + (rng.next() - 0.5) * 0.5, by, rgba(rng.next() < 0.6 ? BARK[0] : BARK[4], 0.5), 0.15); }
      g.strokeStyle = lin(g, sx0, 0, sx1, 0, [[0, IRON[3]], [0.3, IRON[4]], [1, IRON[0]]]); g.lineWidth = 0.7;
      g.beginPath(); g.ellipse(cx, by - 2.6, 4.0, 0.9, 0, 0, Math.PI); g.stroke();
      g.restore();
      ellipse(g, cx, st, 3.8, 1.2, lin(g, sx0, st - 1, sx1, st + 1, [[0, CUT[3]], [1, CUT[1]]]));
      // feet and waist
      poly(g, [cx - 4.6, st + 0.35, cx + 5.0, st + 0.35, cx + 3.1, st - 1.5, cx - 2.7, st - 1.5], lin(g, 0, st - 1.5, 0, st + 0.4, [[0, IRON[3]], [1, IRON[0]]]));
      g.fillStyle = lin(g, cx - 2.2, 0, cx + 2.6, 0, [[0, IRON[3]], [0.4, IRON[2]], [1, IRON[0]]]);
      g.fillRect(cx - 2.2, 5.9, 4.8, st - 1.5 - 5.9 + 0.1);
      // horn, body and heel
      const horn = () => { g.beginPath(); g.moveTo(cx - 4.4, 3.25); g.quadraticCurveTo(cx - 6.6, 3.35, cx - 8.5, 4.45); g.quadraticCurveTo(cx - 6.5, 5.2, cx - 4.4, 6.15); g.quadraticCurveTo(cx - 3.1, 6.2, cx - 2.2, 6.9); g.lineTo(cx - 2.2, 3.25); g.closePath(); };
      fillPath(g, horn, lin(g, 0, 3.2, 0, 6.9, [[0, '#b8bec6'], [0.3, IRON[3]], [0.7, IRON[1]], [1, IRON[0]]]));
      g.fillStyle = lin(g, 0, 4.5, 0, 6.2, [[0, IRON[3]], [0.35, IRON[2]], [1, IRON[0]]]);
      g.fillRect(cx - 4.5, 4.5, 10.4, 1.7);
      g.fillStyle = lin(g, cx - 4.5, 0, cx + 5.9, 0, [[0, '#8e969e'], [0.28, '#e2e6ea'], [0.5, '#b4bbc3'], [1, '#6a7179']]);
      g.fillRect(cx - 4.5, 3.2, 10.4, 1.35);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(cx - 4.4, 4.45, 10.2, 0.16);
      line(g, cx - 8.2, 4.4, cx - 4.6, 3.35, 'rgba(255,255,255,0.45)', 0.16);
      // hardy and pritchel holes
      g.fillStyle = '#16181b'; g.fillRect(cx + 3.7, 3.45, 0.75, 0.75);
      ellipse(g, cx + 2.5, 3.85, 0.3, 0.26, '#16181b');
      g.fillStyle = lin(g, cx + 3.5, 0, cx + 5.9, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(8,8,16,0.35)']]);
      g.fillRect(cx + 3.5, 3.2, 2.4, 3.0);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.1, 7.8, 1.8, 0.45) }),
    solid: { w: 12, h: 6 },
  };
}

function forgeProp(k: K): PropInfo {
  const W = 32, H = 34, cx = 16, by = 32.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const hx0 = 3, hx1 = 27.5, top = 17.6, front = 24;
      // chimney and hood
      const hood = () => { g.beginPath(); g.moveTo(3.8, 13.6); g.lineTo(10.6, 5.4); g.lineTo(21.4, 5.4); g.lineTo(28.2, 13.6); g.closePath(); };
      hood();
      g.save(); g.clip();
      masonry(g, 3, 5, 29, 14, rng, ['#7a6a5c', '#6e6054', '#86766a', '#5e5248'], 2.2, { len: [1.2, 2.2] });
      g.fillStyle = lin(g, 3.8, 0, 28.2, 0, [[0, 'rgba(255,236,210,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.35)']]);
      g.fillRect(3, 5, 26, 9);
      g.fillStyle = lin(g, 0, 8, 0, 14, [[0, 'rgba(12,10,8,0)'], [1, 'rgba(12,10,8,0.55)']]);
      g.fillRect(3, 8, 26, 6);
      g.restore();
      masonry(g, 11, 1.2, 21, 5.6, rng, ['#7a6a5c', '#6e6054', '#86766a'], 2.2, { len: [1.2, 2.2] });
      g.fillStyle = lin(g, 11, 0, 21, 0, [[0, 'rgba(255,236,210,0.12)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.35)']]);
      g.fillRect(11, 1.2, 10, 4.4);
      roundRect(g, 10.3, 0.3, 11.4, 1.4, 0.4, lin(g, 0, 0.3, 0, 1.7, [[0, '#8a8278'], [1, '#4a4440']]));
      // fireback, glowing
      g.fillStyle = lin(g, 0, 13.5, 0, top + 0.5, [[0, '#120c0a'], [1, '#3a1a0e']]);
      g.fillRect(hx0 + 1, 13.5, hx1 - hx0 - 2, top - 13.5 + 0.5);
      // hood lintel, sooted underneath and lit by the fire
      beam(g, 3, 12.8, 25.8, 2.4, '#4a3526', rng);
      g.fillStyle = lin(g, 0, 14.2, 0, 15.2, [[0, 'rgba(255,120,40,0)'], [1, 'rgba(255,120,40,0.35)']]);
      g.fillRect(3, 14.2, 25.8, 1);
      // hearth: stone box, coal bed on top
      masonry(g, hx0, front, hx1, by, rng, STONE, 2.9, { len: [1.2, 2.2] });
      g.fillStyle = lin(g, hx0, 0, hx1, 0, [[0, 'rgba(255,236,210,0.1)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.32)']]);
      g.fillRect(hx0, front, hx1 - hx0, by - front);
      g.fillStyle = lin(g, 0, top, 0, front, [[0, '#6e675e'], [1, '#8e867a']]);
      g.fillRect(hx0, top, hx1 - hx0, front - top);
      for (let x = hx0; x < hx1; x += 3.1) stoneBlock(g, x + 0.1, front - 1.6, 3.0, 1.5, jitter(STONE[4], rng, 0.05), rng, 0.3);
      for (let x = hx0; x < hx1; x += 3.1) stoneBlock(g, x + 0.1, top, 3.0, 1.1, jitter(STONE[2], rng, 0.05), rng, 0.3);
      g.fillStyle = '#1a1210';
      g.beginPath(); g.ellipse(cx, 21.2, 8.6, 2.5, 0, 0, TAU); g.fill();
      coals(g, cx, 21.2, 8.2, 2.2, rng, 150, 1.25);
      // tongs leaning on the hearth
      g.strokeStyle = IRON[1]; g.lineWidth = 0.5;
      g.beginPath(); g.moveTo(3.6, by - 0.2); g.lineTo(5.8, by - 8.8); g.moveTo(4.6, by - 0.2); g.lineTo(6.3, by - 8.5); g.stroke();
      line(g, 3.45, by - 0.3, 5.6, by - 8.6, rgba(IRON[4], 0.7), 0.14);
      ellipse(g, 6.0, by - 8.8, 0.45, 0.35, IRON[2]);
      // bellows on a trestle beside the hearth: a leather teardrop pleated between two boards
      const bY = 20.8, xn = 25.6, xe = 31.4;
      for (const lx of [26.4, 30.2]) beam(g, lx, bY + 2.2, 1.0, by - bY - 2.2, dim(OAK, 0.3), rng);
      beam(g, 25.6, bY + 2.2, 5.8, 0.9, dim(OAK, 0.2), rng);
      const half = (x: number) => { const u = clamp((x - xn) / (xe - xn), 0, 1); return 3.0 * Math.sqrt(u) * (1 - 0.3 * Math.pow(u, 5)); };
      const U = (x: number) => bY - half(x), Lw = (x: number) => bY + half(x) * 0.75;
      const leather = () => { g.beginPath(); g.moveTo(xn, bY); for (let x = xn; x <= xe; x += 0.25) g.lineTo(x, U(x)); for (let x = xe; x >= xn; x -= 0.25) g.lineTo(x, Lw(x)); g.closePath(); };
      fillPath(g, leather, lin(g, 0, bY - 3, 0, bY + 2.4, [[0, '#9a6a48'], [0.5, '#6e4428'], [1, '#3a2214']]));
      for (const f of [0.28, 0.52, 0.76]) {
        g.strokeStyle = rgba('#1e1006', 0.55); g.lineWidth = 0.2;
        g.beginPath(); for (let x = xn + 0.4; x <= xe; x += 0.25) { const y = U(x) + (Lw(x) - U(x)) * f; if (x === xn + 0.4) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
        g.strokeStyle = rgba('#c8946a', 0.4); g.lineWidth = 0.14;
        g.beginPath(); for (let x = xn + 0.4; x <= xe; x += 0.25) { const y = U(x) + (Lw(x) - U(x)) * f - 0.28; if (x === xn + 0.4) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
      }
      g.lineCap = 'round';
      g.strokeStyle = lin(g, xn, 0, xe, 0, [[0, lit(OAK, 0.35)], [1, lit(OAK, 0.1)]]); g.lineWidth = 0.75;
      g.beginPath(); for (let x = xn; x <= xe; x += 0.25) { if (x === xn) g.moveTo(x, U(x)); else g.lineTo(x, U(x)); } g.stroke();
      g.strokeStyle = dim(OAK, 0.35);
      g.beginPath(); for (let x = xn; x <= xe; x += 0.25) { if (x === xn) g.moveTo(x, Lw(x)); else g.lineTo(x, Lw(x)); } g.stroke();
      line(g, xe - 0.6, U(xe - 0.6), W - 0.2, U(xe) - 1.4, '#8a6a44', 0.5);
      poly(g, [xn - 2.2, bY - 0.35, xn + 0.4, bY - 0.7, xn + 0.4, bY + 0.6, xn - 2.2, bY + 0.25], lin(g, 0, bY - 0.8, 0, bY + 0.6, [[0, IRON[4]], [1, IRON[1]]]));
      return (gg) => {
        glow(gg, cx, 21, 10, '#ff8a3a', 0.3, true);
        glow(gg, cx, 21.2, 5, '#ffc070', 0.3, true);
      };
    }, { seed: k.seed, under: (g) => contact(g, cx, by - 0.2, 15, 2.2, 0.45) }),
    solid: { w: 28, h: 12 },
    light: { x: 0, y: -14, r: 70, color: '#ff8a3a', flicker: true, intensity: 0.9 },
    anim: 'fire',
  };
}

function grindstoneProp(k: K): PropInfo {
  const W = 20, H = 20, cx = 10, by = 18.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const wy = 8.4, r = 6.3;
      // trough beneath the wheel
      board(g, 3.2, by - 6.2, 13.6, 1.1, lit(OAK, 0.15), rng, { knots: 0 });
      g.fillStyle = '#284a60'; g.fillRect(4.2, by - 5.4, 11.6, 0.9);
      planks(g, 3.2, by - 5.2, 13.6, 3.6, 2, OAK, rng, false);
      for (const lx of [3.4, 15.4]) beam(g, lx, by - 1.8, 1.2, 1.8, dim(OAK, 0.3), rng);
      // uprights holding the axle
      for (const px of [3.8, 16.2]) { beam(g, px - 0.8, wy - 1.2, 1.6, by - 5.2 - wy + 1.2, dim(OAK, 0.05), rng); roundRect(g, px - 1.1, wy - 1.5, 2.2, 1.4, 0.3, lin(g, 0, wy - 1.5, 0, wy, [[0, lit(OAK, 0.3)], [1, dim(OAK, 0.3)]])); }
      ironBar(g, 3.6, wy - 0.35, 14.4, 0.7);
      // the stone: its rim, then the face
      ellipse(g, cx + 0.4, wy + 0.3, r, r, dim('#8e8270', 0.35));
      const face = rad(g, cx - 2.2, wy - 2.6, 0.3, cx, wy, r * 1.05, [[0, '#c2b69c'], [0.45, '#9c907a'], [1, '#6a6050']]);
      ellipse(g, cx, wy, r - 0.1, r - 0.1, face);
      g.save(); g.beginPath(); g.arc(cx, wy, r - 0.1, 0, TAU); g.clip();
      for (let i = 0; i < 60; i++) ellipse(g, cx + (rng.next() - 0.5) * 2 * r, wy + (rng.next() - 0.5) * 2 * r, 0.15 + rng.next() * 0.25, 0.12, rgba(rng.next() < 0.5 ? '#5a5040' : '#e0d6c0', 0.35));
      g.strokeStyle = 'rgba(70,60,44,0.35)'; g.lineWidth = 0.12;
      for (let rr = 1.8; rr < r; rr += 1.1) { g.beginPath(); g.arc(cx, wy, rr, 0, TAU); g.stroke(); }
      g.fillStyle = lin(g, 0, wy + 1, 0, wy + r, [[0, 'rgba(40,50,60,0)'], [1, 'rgba(40,50,60,0.35)']]);
      g.fillRect(cx - r, wy + 1, r * 2, r);
      g.restore();
      g.strokeStyle = 'rgba(240,232,210,0.45)'; g.lineWidth = 0.35;
      g.beginPath(); g.arc(cx, wy, r - 0.35, Math.PI * 0.95, Math.PI * 1.6); g.stroke();
      // hub and crank
      roundRect(g, cx - 1.2, wy - 1.2, 2.4, 2.4, 0.3, lin(g, cx - 1.2, wy - 1.2, cx + 1.2, wy + 1.2, [[0, IRON[4]], [1, IRON[0]]]));
      for (const [dx, dy] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) rivet(g, cx + dx, wy + dy, 0.18);
      g.strokeStyle = lin(g, 17, wy, 18.5, wy + 3.5, [[0, IRON[4]], [1, IRON[1]]]); g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(17.4, wy); g.lineTo(18.1, wy + 2.9); g.stroke();
      roundRect(g, 17.6, wy + 2.6, 1.9, 1.0, 0.45, lin(g, 0, wy + 2.6, 0, wy + 3.6, [[0, lit(OAK, 0.4)], [1, dim(OAK, 0.3)]]));
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.5, by - 0.1, 8.5, 1.8, 0.42) }),
    solid: { w: 14, h: 6 },
  };
}

function wellProp(k: K): PropInfo {
  const W = 30, H = 36, cx = 15, by = 34.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const rimY = 23.4, rx = 12.4, ry = 4.3, botRy = 3.2, botY = by - botRy;
      const irx = 9.2, iry = 2.85;
      // roof posts (behind the roof's shadow), the far half of the rim first
      const wall = () => { g.beginPath(); g.moveTo(cx - rx, rimY); g.lineTo(cx - rx, botY); g.ellipse(cx, botY, rx, botRy, 0, Math.PI, 0, true); g.lineTo(cx + rx, rimY); g.ellipse(cx, rimY, rx, ry, 0, 0, Math.PI); g.closePath(); };
      g.fillStyle = '#3a342c';
      wall(); g.fill();
      g.save(); wall(); g.clip();
      // courses of stone wrapping round the curved wall
      const courses = 3, hgt = botY - rimY;
      for (let c = 0; c < courses; c++) {
        const d0 = (hgt * c) / courses + 0.9, d1 = (hgt * (c + 1)) / courses + 0.9;
        const n = 9;
        const off = (c % 2) * 0.5;
        for (let i = -1; i < n; i++) {
          const t0 = Math.max(0, (i + off) / n), t1 = Math.min(1, (i + 1 + off) / n);
          if (t1 <= t0) continue;
          const pts: number[] = [];
          const a0 = t0 * Math.PI, a1 = t1 * Math.PI;
          for (let s = 0; s <= 6; s++) { const a = a0 + ((a1 - a0) * s) / 6; const ryy = ry + (botRy - ry) * (d0 / hgt); pts.push(cx + Math.cos(a) * (rx - 0.1), rimY + d0 + Math.sin(a) * ryy + 0.12); }
          for (let s = 6; s >= 0; s--) { const a = a0 + ((a1 - a0) * s) / 6; const ryy = ry + (botRy - ry) * (d1 / hgt); pts.push(cx + Math.cos(a) * (rx - 0.1), rimY + d1 + Math.sin(a) * ryy - 0.12); }
          const am = (a0 + a1) / 2, L = -Math.cos(am) * 0.55 + 0.05;
          const base = jitter(STONE[2 + Math.floor(rng.next() * 3)], rng, 0.05);
          const col = L > 0 ? lit(base, L * 0.5) : dim(base, -L * 0.6);
          // inset the block a touch so mortar shows between
          const mx = cx + Math.cos(am) * rx * 0.9;
          const sc = 0.93;
          const ins: number[] = [];
          for (let q = 0; q < pts.length; q += 2) ins.push(mx + (pts[q] - mx) * sc, (rimY + (d0 + d1) / 2 + Math.sin(am) * ry) + (pts[q + 1] - (rimY + (d0 + d1) / 2 + Math.sin(am) * ry)) * 0.86);
          poly(g, ins, lin(g, 0, rimY + d0, 0, rimY + d1 + ry, [[0, lit(col, 0.12)], [1, dim(col, 0.2)]]));
        }
      }
      g.fillStyle = lin(g, 0, botY - 2, 0, by, [[0, 'rgba(20,14,8,0)'], [1, 'rgba(20,14,8,0.45)']]);
      g.fillRect(0, botY - 2, W, by - botY + 2);
      for (let i = 0; i < 26; i++) ellipse(g, cx - rx + rng.next() * rx * 2, rimY + 2 + rng.next() * (hgt - 1), 0.5 + rng.next() * 0.9, 0.35, rgba(rng.next() < 0.5 ? '#557a30' : '#6a8e3a', 0.55));
      g.restore();
      // capstones round the rim
      const caps = 14;
      for (let i = 0; i < caps; i++) {
        const a0 = (i / caps) * TAU + 0.12, a1 = ((i + 1) / caps) * TAU + 0.12 - 0.05;
        const pts: number[] = [];
        for (let s = 0; s <= 4; s++) { const a = a0 + ((a1 - a0) * s) / 4; pts.push(cx + Math.cos(a) * rx, rimY + Math.sin(a) * ry); }
        for (let s = 4; s >= 0; s--) { const a = a0 + ((a1 - a0) * s) / 4; pts.push(cx + Math.cos(a) * irx, rimY + 0.1 + Math.sin(a) * iry); }
        const am = (a0 + a1) / 2;
        const L = -Math.cos(am) * 0.25 - Math.sin(am) * 0.15;
        const base = jitter(STONE[4], rng, 0.05);
        poly(g, pts, lin(g, cx + Math.cos(am) * irx, rimY + Math.sin(am) * iry, cx + Math.cos(am) * rx, rimY + Math.sin(am) * ry, [[0, dim(base, 0.12)], [1, L > 0 ? lit(base, 0.2 + L) : dim(base, -L * 0.8)]]));
      }
      // the capstones' front edge
      g.strokeStyle = rgba(lit(STONE[5], 0.2), 0.5); g.lineWidth = 0.25;
      g.beginPath(); g.ellipse(cx, rimY + 0.05, rx - 0.1, ry - 0.05, 0, Math.PI * 0.55, Math.PI * 1.05); g.stroke();
      // the shaft: dark, a glint of water far below
      ellipse(g, cx, rimY + 0.12, irx, iry, rad(g, cx, rimY + 1.2, 0.2, cx, rimY, irx, [[0, '#050404'], [0.6, '#0e0c0a'], [1, '#2a2520']]));
      g.save(); g.beginPath(); g.ellipse(cx, rimY + 0.12, irx, iry, 0, 0, TAU); g.clip();
      g.fillStyle = lin(g, 0, rimY - iry, 0, rimY + 0.5, [[0, 'rgba(120,110,95,0.45)'], [1, 'rgba(60,54,46,0)']]);
      g.fillRect(cx - irx, rimY - iry, irx * 2, iry + 0.5);
      for (let i = 0; i < 6; i++) line(g, cx - irx + 1.5 + i * 3, rimY - iry, cx - irx + 1.5 + i * 3 + 0.2, rimY - iry + 1.3, 'rgba(10,8,6,0.5)', 0.15);
      ellipse(g, cx + 0.5, rimY + 1.3, 2.2, 0.45, 'rgba(70,110,130,0.45)');
      ellipse(g, cx, rimY + 1.2, 0.9, 0.18, 'rgba(200,230,240,0.6)');
      g.restore();
      // posts and windlass
      const pl = cx - rx + 1.4, pr = cx + rx - 1.4, wy = 15.4;
      post(g, pl, 9.5, rimY + 0.4, 1.9, GREY, rng, 'none');
      post(g, pr, 9.5, rimY + 0.4, 1.9, GREY, rng, 'none');
      g.fillStyle = lin(g, 0, wy - 1.1, 0, wy + 1.1, [[0, lit(GREY, 0.35)], [0.45, GREY], [1, dim(GREY, 0.45)]]);
      g.fillRect(pl, wy - 1.1, pr - pl, 2.2);
      g.save(); clipRect(g, pl, wy - 1.1, pr - pl, 2.2); grainLines(g, pl, wy - 1.1, pr - pl, 2.2, GREY, rng, false, 0.8); g.restore();
      // coils of rope on the roller
      g.fillStyle = lin(g, 0, wy - 1.25, 0, wy + 1.25, [[0, '#d0b680'], [0.5, '#a88c5a'], [1, '#6a5430']]);
      g.fillRect(cx - 2.6, wy - 1.25, 5.2, 2.5);
      g.strokeStyle = 'rgba(60,44,20,0.6)'; g.lineWidth = 0.14;
      for (let x = cx - 2.5; x < cx + 2.6; x += 0.45) { g.beginPath(); g.moveTo(x, wy - 1.2); g.lineTo(x + 0.3, wy + 1.2); g.stroke(); }
      g.strokeStyle = lin(g, pr, wy, pr + 2.4, wy + 2.4, [[0, IRON[4]], [1, IRON[1]]]); g.lineWidth = 0.55;
      g.beginPath(); g.moveTo(pr + 0.9, wy); g.lineTo(pr + 1.6, wy + 2.4); g.lineTo(pr + 2.8, wy + 2.4); g.stroke();
      rivet(g, pr + 0.9, wy, 0.3);
      // rope down to the bucket hanging in the shaft
      line(g, cx + 0.2, wy + 1.1, cx + 0.2, 19.2, '#a88c5a', 0.35);
      g.strokeStyle = IRON[2]; g.lineWidth = 0.28;
      g.beginPath(); g.moveTo(cx - 1.75, 20.8); g.quadraticCurveTo(cx + 0.2, 17.6, cx + 2.15, 20.8); g.stroke();
      bucket(g, cx + 0.2, 24.3, 3.8, 4.2, OAK, rng);
      // the thatched roof
      const eave = 11.2, ridge = 2.6;
      const roof = () => { g.beginPath(); g.moveTo(0.5, eave); g.lineTo(2.6, ridge); g.lineTo(W - 2.6, ridge); g.lineTo(W - 0.5, eave); g.quadraticCurveTo(cx, eave + 1.6, 0.5, eave); g.closePath(); };
      g.fillStyle = '#2a1e10';
      g.beginPath(); g.ellipse(cx, eave + 0.6, cx - 0.6, 1.6, 0, 0, Math.PI); g.fill();
      fillPath(g, roof, lin(g, 0, ridge, 0, eave, [[0, STRAW[5]], [1, STRAW[2]]]));
      g.save(); roof(); g.clip();
      strawStrokes(g, 700, () => [rng.next() * W, ridge - 1 + rng.next() * (eave - ridge + 2)], rng, {
        ang: () => Math.PI / 2, len: [2.4, 3.8], w: 0.38,
        light: (x, y) => 0.8 - ((y - ridge) / (eave - ridge)) * 0.45 - (x / W) * 0.3,
      });
      g.fillStyle = lin(g, 0, eave - 3, 0, eave + 1.5, [[0, 'rgba(40,24,8,0)'], [1, 'rgba(40,24,8,0.55)']]);
      g.fillRect(0, eave - 3, W, 5);
      g.fillStyle = lin(g, 0, 0, W, 0, [[0, 'rgba(255,236,180,0.18)'], [0.2, 'rgba(255,236,180,0)'], [0.8, 'rgba(20,14,30,0)'], [1, 'rgba(20,14,30,0.35)']]);
      g.fillRect(0, 0, W, eave + 2);
      g.restore();
      roundRect(g, 2, ridge - 1.1, W - 4, 2.4, 1.1, lin(g, 0, ridge - 1.1, 0, ridge + 1.3, [[0, STRAW[6]], [1, STRAW[2]]]));
      g.strokeStyle = 'rgba(70,48,20,0.8)'; g.lineWidth = 0.28;
      for (let x = 3.5; x < W - 4; x += 2.6) { g.beginPath(); g.moveTo(x, ridge - 0.8); g.lineTo(x + 1.3, ridge + 0.9); g.lineTo(x + 2.6, ridge - 0.8); g.stroke(); }
      // the roof's shadow across the posts
      g.fillStyle = lin(g, 0, eave + 0.8, 0, eave + 4.5, [[0, 'rgba(10,8,6,0.5)'], [1, 'rgba(10,8,6,0)']]);
      g.fillRect(pl - 1, eave + 0.8, 2, 3.7);
      g.fillRect(pr - 1, eave + 0.8, 2, 3.7);
    }, { seed: k.seed, under: (g) => contact(g, cx + 1, by - 0.3, 14, 2.6, 0.42) }),
    solid: { w: 24, h: 12 },
  };
}

function troughProp(k: K): PropInfo {
  const W = 28, H = 12, cx = 14, by = 10.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#7a5838', x0 = 1.4, x1 = 26.6;
      for (const lx of [2.4, 23.8]) beam(g, lx, by - 2.3, 1.8, 2.3, dim(col, 0.35), rng);
      board(g, x0, 1.2, x1 - x0, 1.1, lit(col, 0.18), rng, { knots: 0 });
      g.fillStyle = dim(col, 0.5);
      g.fillRect(x0 + 1, 2.3, x1 - x0 - 2, 2.5);
      g.fillStyle = lin(g, 0, 2.9, 0, 4.8, [[0, '#1c3a50'], [0.5, '#2e5a78'], [1, '#4c7e9a']]);
      g.fillRect(x0 + 1, 2.9, x1 - x0 - 2, 1.9);
      g.fillStyle = 'rgba(210,232,240,0.5)';
      g.fillRect(x0 + 3, 3.9, 6, 0.28); g.fillRect(x0 + 12, 4.2, 3.5, 0.22);
      for (let i = 0; i < 6; i++) blade(g, x0 + 2 + rng.next() * (x1 - x0 - 4), 3.2 + rng.next() * 1.3, 1 + rng.next(), rng.next() * Math.PI, 0.2, 0.25, STRAW[4]);
      board(g, x0, 1.2, 1.15, 4.4, lit(col, 0.22), rng, { vertical: true, knots: 0 });
      board(g, x1 - 1.15, 1.2, 1.15, 4.4, col, rng, { vertical: true, knots: 0 });
      board(g, x0 - 0.2, 4.6, x1 - x0 + 0.4, 1.15, lit(col, 0.25), rng, { knots: 0 });
      planks(g, x0, 5.7, x1 - x0, by - 2.3 - 5.7, 2, col, rng, false);
      g.fillStyle = lin(g, x0, 0, x1, 0, [[0, 'rgba(255,236,200,0.08)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.25)']]);
      g.fillRect(x0, 4.6, x1 - x0, by - 2.3 - 4.6);
      for (const sx of [4.4, 23.6]) {
        ironBar(g, sx - 0.5, 4.5, 1.0, by - 2.2 - 4.5, true);
        rivet(g, sx, 6.2, 0.2); rivet(g, sx, by - 3.2, 0.2);
      }
      // a wet dark stain where it slops over
      ellipse(g, 9, by - 2.8, 3, 0.8, rgba('#1a120a', 0.25));
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.4, 14, 2, 0.42) }),
    solid: { w: 26, h: 6 },
  };
}

function benchProp(k: K): PropInfo {
  const W = 28, H = 12, cx = 14, by = 10.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#7e5a38';
      slantBeam(g, 5.6, 5.2, 6.4, by - 2.0, 1.2, dim(col, 0.45), rng);
      slantBeam(g, 22.4, 5.2, 21.6, by - 2.0, 1.2, dim(col, 0.45), rng);
      board(g, 1.2, 2.3, W - 2.4, 2.8, lit(col, 0.12), rng, { knots: 1 });
      g.fillStyle = 'rgba(255,240,210,0.12)';
      g.fillRect(3, 2.8, 9, 0.6);
      board(g, 1.2, 5.1, W - 2.4, 1.25, dim(col, 0.28), rng, { knots: 0 });
      ellipse(g, 1.5, 3.7, 0.45, 1.3, CUT[1]);
      slantBeam(g, 4.4, 5.9, 3.2, by, 1.45, dim(col, 0.1), rng);
      slantBeam(g, 23.6, 5.9, 24.8, by, 1.45, dim(col, 0.22), rng);
    }, { seed: k.seed, under: (g) => { contact(g, cx + 0.8, by - 1.2, 13.5, 1.8, 0.3); for (const x of [3.2, 24.8, 6.4, 21.6]) contact(g, x + 0.3, x > 5 && x < 22 ? by - 2 : by, 1.3, 0.5, 0.4); } }),
    solid: { w: 24, h: 4 },
  };
}

/** The visible front band of a disc's edge: between its top ellipse and the same ellipse dropped by t. */
function discSide(g: G, cx: number, cy: number, rx: number, ry: number, t: number, fill: string | CanvasGradient) {
  g.beginPath();
  g.moveTo(cx - rx, cy);
  g.lineTo(cx - rx, cy + t);
  g.ellipse(cx, cy + t, rx, ry, 0, Math.PI, 0, true);
  g.lineTo(cx + rx, cy);
  g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
}

// ---------------------------------------------------------------- tableware

/** A pewter plate or wooden trencher seen from above, with food on it. */
function plate(g: G, x: number, y: number, r: number, rng: RNG, food: 'stew' | 'bread' | 'meat', wood = false) {
  const ry = r * 0.56;
  ellipse(g, x + 0.3, y + 0.4, r, ry, rgba(SHADE, 0.3));
  const col = wood ? '#8e6844' : '#9ca0a6';
  ellipse(g, x, y, r, ry, lin(g, x - r, y - ry, x + r, y + ry, [[0, lit(col, 0.4)], [1, dim(col, 0.35)]]));
  ellipse(g, x, y + 0.05, r * 0.72, ry * 0.68, lin(g, x - r, y - ry, x + r, y + ry, [[0, dim(col, 0.15)], [1, lit(col, 0.15)]]));
  if (food === 'stew') {
    ellipse(g, x, y + 0.05, r * 0.66, ry * 0.6, rad(g, x - r * 0.2, y - ry * 0.2, 0.05, x, y, r * 0.7, [[0, '#8a5a30'], [1, '#4e2e16']]));
    for (let i = 0; i < 5; i++) ellipse(g, x + (rng.next() - 0.5) * r, y + (rng.next() - 0.5) * ry * 0.8, 0.28, 0.2, ['#d0782c', '#6a8a3a', '#c8b080'][i % 3]);
    ellipse(g, x - r * 0.25, y - ry * 0.2, r * 0.2, ry * 0.12, 'rgba(255,240,210,0.45)');
  } else if (food === 'bread') {
    loaf(g, x - r * 0.1, y - 0.1, r * 0.55, ry * 0.75, rng, { cuts: 2 });
  } else if (food === 'meat') {
    ellipse(g, x, y, r * 0.55, ry * 0.6, rad(g, x - r * 0.2, y - ry * 0.3, 0.05, x, y, r * 0.6, [[0, '#c07a40'], [0.6, '#8a4a22'], [1, '#5a2a12']]));
    line(g, x + r * 0.35, y - ry * 0.1, x + r * 0.75, y - ry * 0.45, '#efe4cc', 0.35);
    ellipse(g, x - r * 0.15, y - ry * 0.25, r * 0.18, ry * 0.12, 'rgba(255,230,190,0.55)');
  }
}

/** A wooden tankard with iron hoops, foot at (x, yb). */
function tankard(g: G, x: number, yb: number, rng: RNG, h = 2.9, w = 2.0, foam = true) {
  const col = '#8a6440';
  g.strokeStyle = dim(col, 0.2); g.lineWidth = 0.4;
  g.beginPath(); g.moveTo(x + w * 0.45, yb - h * 0.8); g.quadraticCurveTo(x + w * 1.15, yb - h * 0.55, x + w * 0.45, yb - h * 0.25); g.stroke();
  ellipse(g, x + 0.25, yb, w * 0.62, w * 0.22, rgba(SHADE, 0.35));
  g.fillStyle = lin(g, x - w / 2, 0, x + w / 2, 0, [[0, dim(col, 0.1)], [0.3, lit(col, 0.3)], [1, dim(col, 0.45)]]);
  g.fillRect(x - w / 2, yb - h, w, h);
  ellipse(g, x, yb, w / 2, w * 0.17, dim(col, 0.3));
  for (const f of [0.22, 0.78]) { g.strokeStyle = lin(g, x - w / 2, 0, x + w / 2, 0, [[0, IRON[4]], [1, IRON[0]]]); g.lineWidth = 0.28; g.beginPath(); g.ellipse(x, yb - h * f, w / 2, w * 0.16, 0, 0, Math.PI); g.stroke(); }
  for (let k = 1; k < 4; k++) line(g, x - w / 2 + (w * k) / 4, yb - h, x - w / 2 + (w * k) / 4, yb, rgba(dim(col, 0.5), 0.35), 0.08);
  ellipse(g, x, yb - h, w / 2, w * 0.18, lit(col, 0.2));
  ellipse(g, x, yb - h + 0.03, w / 2 - 0.2, w * 0.13, foam ? '#f2ead6' : '#3a2412');
  if (foam) ellipse(g, x - w * 0.12, yb - h - 0.08, w * 0.3, w * 0.08, '#fffaf0');
}

function goblet(g: G, x: number, yb: number, pal = BRASS, s = 1) {
  ellipse(g, x + 0.2 * s, yb, 0.9 * s, 0.3 * s, rgba(SHADE, 0.35));
  ellipse(g, x, yb - 0.1 * s, 0.8 * s, 0.26 * s, pal[2]);
  g.fillStyle = lin(g, x - 0.2 * s, 0, x + 0.2 * s, 0, [[0, pal[4]], [1, pal[1]]]);
  g.fillRect(x - 0.18 * s, yb - 1.4 * s, 0.36 * s, 1.3 * s);
  const cup = () => { g.beginPath(); g.moveTo(x - 0.95 * s, yb - 2.9 * s); g.quadraticCurveTo(x - 0.9 * s, yb - 1.4 * s, x, yb - 1.3 * s); g.quadraticCurveTo(x + 0.9 * s, yb - 1.4 * s, x + 0.95 * s, yb - 2.9 * s); g.closePath(); };
  fillPath(g, cup, lin(g, x - s, 0, x + s, 0, [[0, pal[3]], [0.3, pal[5]], [0.6, pal[3]], [1, pal[1]]]));
  ellipse(g, x, yb - 2.9 * s, 0.95 * s, 0.3 * s, pal[4]);
  ellipse(g, x, yb - 2.88 * s, 0.75 * s, 0.2 * s, '#5a1020');
}

function knife(g: G, x: number, y: number, len: number, ang: number) {
  const c = Math.cos(ang), s = Math.sin(ang);
  line(g, x + 0.15, y + 0.25, x + c * len + 0.15, y + s * len + 0.25, rgba(SHADE, 0.35), 0.5);
  line(g, x, y, x + c * len * 0.4, y + s * len * 0.4, '#4a3222', 0.55);
  g.strokeStyle = lin(g, x, y - 0.3, x, y + 0.3, [[0, IRON[5]], [1, IRON[2]]]);
  g.lineWidth = 0.5;
  g.beginPath(); g.moveTo(x + c * len * 0.42, y + s * len * 0.42); g.lineTo(x + c * len, y + s * len); g.stroke();
}

/** An open book lying on a table or lectern, seen from above. */
function openBook(g: G, x: number, y: number, w: number, h: number, rng: RNG, cover = '#6e2a22') {
  roundRect(g, x - 0.35, y - 0.2, w + 0.7, h + 0.55, 0.4, lin(g, 0, y, 0, y + h, [[0, lit(cover, 0.15)], [1, dim(cover, 0.3)]]));
  const mid = x + w / 2;
  for (const [px, pw, lft] of [[x, w / 2, true], [mid, w / 2, false]] as const) {
    const page = () => { g.beginPath(); g.moveTo(px, y + 0.25); g.quadraticCurveTo(px + pw / 2, lft ? y - 0.35 : y - 0.35, px + pw, y + 0.25); g.lineTo(px + pw, y + h); g.quadraticCurveTo(px + pw / 2, y + h - 0.45, px, y + h); g.closePath(); };
    fillPath(g, page, lin(g, px, 0, px + pw, 0, lft ? [[0, '#efe6d0'], [0.8, '#e0d4b8'], [1, '#b8aa8a']] : [[0, '#b0a282'], [0.2, '#e4d8bc'], [1, '#d6c9aa']]));
    g.save(); page(); g.clip();
    for (let ly = y + 1.1; ly < y + h - 0.6; ly += 0.62) {
      let lx = px + 0.55;
      while (lx < px + pw - 0.6) { const ww = 0.3 + rng.next() * 0.9; line(g, lx, ly, Math.min(lx + ww, px + pw - 0.55), ly, rgba('#3a2a1e', 0.55), 0.16); lx += ww + 0.25; }
    }
    g.restore();
  }
  line(g, mid, y + 0.1, mid, y + h - 0.1, rgba('#5a4a36', 0.6), 0.14);
  g.fillStyle = '#9a2a1e'; g.fillRect(x + 0.6, y + 0.8, 0.7, 0.8);
  g.fillStyle = BRASS[4]; g.fillRect(x + 0.75, y + 0.95, 0.4, 0.5);
}

/** A closed book lying flat. */
function flatBook(g: G, x: number, y: number, w: number, h: number, col: string, rng: RNG, rot = 0) {
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate(rot);
  ellipse(g, 0.3, h * 0.55, w * 0.55, 0.5, rgba(SHADE, 0.3));
  g.fillStyle = '#e8dcc0';
  g.fillRect(-w / 2 + 0.2, -h / 2 + 0.55, w - 0.5, h - 0.2);
  g.strokeStyle = 'rgba(120,100,70,0.5)'; g.lineWidth = 0.08;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-w / 2 + 0.3, h / 2 + 0.05 - k * 0.12); g.lineTo(w / 2 - 0.3, h / 2 + 0.05 - k * 0.12); g.stroke(); }
  roundRect(g, -w / 2, -h / 2, w, h - 0.15, 0.3, lin(g, -w / 2, -h / 2, w / 2, h / 2, [[0, lit(col, 0.3)], [1, dim(col, 0.3)]]));
  g.fillStyle = rgba(dim(col, 0.5), 0.8); g.fillRect(-w / 2, -h / 2, 0.55, h - 0.15);
  g.strokeStyle = rgba(BRASS[3], 0.8); g.lineWidth = 0.14;
  g.strokeRect(-w / 2 + 0.9, -h / 2 + 0.4, w - 1.3, h - 0.95);
  if (rng.next() < 0.5) ellipse(g, 0.2, -0.05, 0.45, 0.35, BRASS[3]);
  g.restore();
}

/** A book standing on a shelf. */
function bookSpine(g: G, x: number, yb: number, w: number, h: number, col: string, rng: RNG, lean = 0) {
  g.save();
  g.translate(x + w / 2, yb);
  g.rotate(lean);
  g.fillStyle = lin(g, -w / 2, 0, w / 2, 0, [[0, lit(col, 0.28)], [0.35, col], [1, dim(col, 0.45)]]);
  g.fillRect(-w / 2, -h, w, h);
  g.fillStyle = rgba(lit(col, 0.5), 0.35); g.fillRect(-w / 2, -h, w, 0.2);
  if (rng.next() < 0.75) {
    const bc = rng.next() < 0.6 ? BRASS[3] : dim(col, 0.5);
    g.fillStyle = bc;
    g.fillRect(-w / 2, -h + h * 0.18, w, 0.2);
    g.fillRect(-w / 2, -h * 0.25, w, 0.2);
    if (rng.next() < 0.5) g.fillRect(-w / 2 + w * 0.3, -h * 0.62, w * 0.4, 0.5);
  }
  g.restore();
}

function candlestick(g: G, x: number, yb: number, h: number, flame: boolean, pal = BRASS) {
  ellipse(g, x + 0.25, yb, 1.2, 0.4, rgba(SHADE, 0.35));
  ellipse(g, x, yb - 0.15, 1.05, 0.38, lin(g, x - 1, 0, x + 1, 0, [[0, pal[4]], [1, pal[1]]]));
  g.fillStyle = lin(g, x - 0.3, 0, x + 0.3, 0, [[0, pal[4]], [0.5, pal[3]], [1, pal[1]]]);
  g.fillRect(x - 0.28, yb - 2.2, 0.56, 2.1);
  ellipse(g, x, yb - 1.1, 0.45, 0.22, pal[3]);
  ellipse(g, x, yb - 2.2, 0.75, 0.25, lin(g, x - 0.8, 0, x + 0.8, 0, [[0, pal[5]], [1, pal[1]]]));
  g.fillStyle = lin(g, x - 0.4, 0, x + 0.4, 0, [[0, '#fbf6e8'], [0.6, '#e6dcc4'], [1, '#b8ac92']]);
  g.fillRect(x - 0.38, yb - 2.2 - h, 0.76, h);
  ellipse(g, x, yb - 2.2 - h, 0.38, 0.14, '#f4ecd8');
  line(g, x, yb - 2.2 - h, x + 0.05, yb - 2.2 - h - 0.45, '#2a1e14', 0.12);
  if (flame) smallFlame(g, x + 0.05, yb - 2.3 - h, 1.6);
}

// ---------------------------------------------------------------- furniture

function tableProp(k: K, long: boolean): PropInfo {
  const W = long ? 48 : 28, H = 20, cx = W / 2, by = 18.5;
  const col = '#82603c';
  const opt = k.opt;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const x0 = 1, x1 = W - 1, top = 2, edge = 12.6, apron = 14.4;
      beam(g, 3.4, 15.9, W - 6.8, 1.1, dim(col, 0.4), rng);
      const legs = long ? [2.3, cx - 1.1, W - 4.5] : [2.3, W - 4.5];
      for (const lx of legs) {
        board(g, lx, apron - 0.2, 2.2, by - apron + 0.2, dim(col, 0.18), rng, { vertical: true, knots: 0 });
        g.fillStyle = 'rgba(10,6,4,0.35)'; g.fillRect(lx, apron - 0.2, 2.2, 0.8);
      }
      planks(g, x0, top, x1 - x0, edge - top, 4, col, rng, false, 0.18);
      g.fillStyle = lin(g, x0, top, x0 + (x1 - x0) * 0.85, edge, [[0, 'rgba(255,238,205,0.16)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.2)']]);
      g.fillRect(x0, top, x1 - x0, edge - top);
      for (let i = 0; i < 3; i++) ellipse(g, x0 + 3 + rng.next() * (x1 - x0 - 6), top + 2 + rng.next() * 7, 1.2 + rng.next() * 2, 0.6 + rng.next() * 0.5, rgba(rng.next() < 0.5 ? '#3a2412' : '#e8c89a', 0.12));
      g.fillStyle = rgba(lit(col, 0.5), 0.45); g.fillRect(x0, top, x1 - x0, 0.22);
      board(g, x0, edge, x1 - x0, apron - edge, dim(col, 0.24), rng, { knots: 0 });
      g.fillStyle = rgba(lit(col, 0.65), 0.55); g.fillRect(x0, edge - 0.05, x1 - x0, 0.24);
      // what's on the table
      if (opt === 'bread') {
        if (long) {
          for (let i = 0; i < 6; i++) loaf(g, 6 + i * 7.2 + (rng.next() - 0.5), 5.6 + (i % 2) * 3.2, 3 + rng.next() * 0.4, 2 + rng.next() * 0.3, rng, { rot: (rng.next() - 0.5) * 0.3, cuts: 3 });
          knife(g, 40, 10.6, 4.4, -0.1);
        } else {
          roundRect(g, 3.4, 4.6, 11, 6.2, 1, lin(g, 3.4, 4.6, 14, 10.8, [[0, '#c49a64'], [1, '#8a643c']]));
          loaf(g, 8, 7.2, 3.4, 2.4, rng, { cuts: 3 });
          ellipse(g, 11.6, 7.4, 1.2, 2.1, rad(g, 11.6, 7, 0.1, 11.6, 7.4, 2.1, [[0, '#f4e2bc'], [1, '#d8b888']]));
          for (const [sx, sy] of [[12.8, 9.6], [11.2, 9.9]]) { ellipse(g, sx, sy, 1.1, 0.6, '#8f5427'); ellipse(g, sx, sy - 0.1, 0.9, 0.45, '#f0dcb4'); }
          loaf(g, 20.4, 6.4, 4.4, 1.9, rng, { rot: -0.18, cuts: 4, dark: 0.1 });
          knife(g, 14.6, 10.6, 4.6, -0.12);
          for (let i = 0; i < 8; i++) ellipse(g, 5 + rng.next() * 12, 9 + rng.next() * 2.5, 0.16, 0.12, '#d8b070');
        }
      } else if (opt === 'books') {
        openBook(g, 4, 4, 10, 5.6, rng);
        flatBook(g, 16.2, 6.3, 6.4, 3.8, CLOTH.woad, rng, 0.08);
        flatBook(g, 16.8, 4.2, 5.6, 3.4, CLOTH.red, rng, -0.1);
        // inkpot and quill
        ellipse(g, 24.3, 10.6, 1.2, 0.45, rgba(SHADE, 0.35));
        g.fillStyle = lin(g, 23.2, 0, 25.2, 0, [[0, '#4a4a52'], [1, '#141418']]);
        g.fillRect(23.3, 8.6, 1.8, 1.9);
        ellipse(g, 24.2, 8.6, 0.9, 0.32, '#08080a');
        blade(g, 24.3, 8.7, 4.2, -1.9, 0.5, 0.75, '#f0ece2');
        line(g, 24.3, 8.7, 23.1, 5, rgba('#8a8070', 0.8), 0.1);
        roundRect(g, 3.6, 10.2, 5.4, 1.4, 0.6, lin(g, 0, 10.2, 0, 11.6, [[0, '#efe4c8'], [1, '#bda886']]));
      } else if (opt === 'meal' || opt === 'feast') {
        if (opt === 'feast' && long) {
          // a roast bird on a platter, loaves, fruit and wine
          ellipse(g, cx, 7.6, 6, 3.2, rgba(SHADE, 0.3));
          ellipse(g, cx, 7.2, 6, 3.1, lin(g, cx - 6, 4, cx + 6, 10, [[0, '#c8ccd2'], [1, '#6e737a']]));
          ellipse(g, cx, 7.25, 5, 2.4, lin(g, cx - 5, 5, cx + 5, 9.5, [[0, '#8e939a'], [1, '#bfc4ca']]));
          ellipse(g, cx, 6.6, 3.8, 2.3, rad(g, cx - 1.4, 5.4, 0.2, cx, 6.6, 4, [[0, '#e8a860'], [0.4, '#b86a2c'], [1, '#6a3414']]));
          for (const d of [-1, 1]) { ellipse(g, cx + d * 3.4, 7.6, 1.5, 0.9, rad(g, cx + d * 3.2, 7.2, 0.1, cx + d * 3.4, 7.6, 1.6, [[0, '#d8904a'], [1, '#7a3c18']])); line(g, cx + d * 4.3, 8, cx + d * 5, 8.6, '#f0e6d0', 0.4); }
          ellipse(g, cx - 1.2, 5.4, 1.6, 0.6, 'rgba(255,236,200,0.5)');
          for (const [fx, fy] of [[cx - 4.2, 9.2], [cx + 4.4, 9.4], [cx - 2, 9.6], [cx + 2.4, 9.7]]) ellipse(g, fx, fy, 0.5, 0.35, ['#6a9a3a', '#c83a2a'][Math.floor(rng.next() * 2)]);
          loaf(g, cx - 11.5, 6, 3.2, 2.2, rng, { cuts: 3 });
          loaf(g, cx + 11, 5.6, 3.4, 1.8, rng, { rot: 0.15, cuts: 4 });
          // fruit bowl
          ellipse(g, cx + 16.5, 9, 3, 1.5, lin(g, 0, 7.5, 0, 10.5, [[0, '#a07a4a'], [1, '#5a3a20']]));
          fruit(g, cx + 15.5, 7.8, 1.05, '#b83a2a'); fruit(g, cx + 17.4, 7.9, 1.0, '#c8902a'); fruit(g, cx + 16.4, 6.9, 0.95, '#8aa83a');
          for (let i = 0; i < 6; i++) ellipse(g, cx + 14.4 + (i % 3) * 0.6, 8.6 + Math.floor(i / 3) * 0.5, 0.35, 0.35, '#4a2a4a');
          goblet(g, cx - 7, 11, BRASS); goblet(g, cx + 7.4, 11.2, BRASS);
          candlestick(g, cx - 17.5, 8.6, 2.4, true); candlestick(g, cx + 21.5, 8.2, 2.4, true);
          plate(g, 5, 9.3, 2.6, rng, 'meat'); plate(g, W - 5.5, 10, 2.5, rng, 'bread');
          tankard(g, cx - 20.5, 11.8, rng, 2.6, 1.8);
        } else {
          const n = long ? 5 : 2;
          for (let i = 0; i < n; i++) {
            const px = long ? 6 + i * 9 : i === 0 ? 7 : 20.5, py = long ? (i % 2 ? 5.6 : 8.8) : i === 0 ? 7.6 : 6.4;
            plate(g, px, py, 2.8, rng, (['stew', 'bread', 'stew', 'meat', 'stew'] as const)[i % 5], i % 2 === 1);
            const tx = long ? [10.2, 19.8, 29.4, 38.2, -1][i] : [11.2, 16.4][i];
            if (tx > 0) tankard(g, tx, (long ? [9.2, 11.2, 9.2, 11.2][i] : [9.4, 10.6][i]), rng, 3.2, 2.2, rng.next() < 0.7);
          }
          if (!long) { jar(g, 25.2, 7.6, 2.6, 3.8, CLAY[3], rng, { handle: true }); knife(g, 10.5, 10.9, 3.4, 0.15); }
          else { jar(g, cx + 1.8, 7.3, 2.8, 4, CLAY[3], rng, { handle: true }); loaf(g, cx - 4.5, 6.2, 2.8, 1.9, rng); }
        }
      }
    }, { seed: k.seed, under: (g) => { g.fillStyle = lin(g, 0, 13, 0, by + 1, [[0, rgba(SHADE, 0.55)], [1, rgba(SHADE, 0.25)]]); roundRect(g, 1.5, 13, W - 3, by + 1 - 13, 1.5); g.fill(); } }),
    solid: { w: long ? 44 : 24, h: 12 },
  };
}

function stoolProp(k: K): PropInfo {
  const W = 12, H = 11, cx = 6, by = 9.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#7e5a38';
      slantBeam(g, cx + 0.4, 4.6, cx + 0.7, by - 1.6, 1.0, dim(col, 0.45), rng);
      discSide(g, cx, 3.3, 4.7, 1.9, 1.1, lin(g, cx - 4.7, 0, cx + 4.7, 0, [[0, dim(col, 0.15)], [0.3, lit(col, 0.1)], [1, dim(col, 0.5)]]));
      ellipse(g, cx, 3.3, 4.7, 1.9, lin(g, cx - 4.7, 1.4, cx + 4.7, 5.2, [[0, lit(col, 0.38)], [0.6, col], [1, dim(col, 0.2)]]));
      g.save(); g.beginPath(); g.ellipse(cx, 3.3, 4.7, 1.9, 0, 0, TAU); g.clip();
      grainLines(g, cx - 4.7, 1.4, 9.4, 3.8, col, rng, false, 0.8);
      g.restore();
      g.strokeStyle = rgba(lit(col, 0.6), 0.5); g.lineWidth = 0.18;
      g.beginPath(); g.ellipse(cx, 3.3, 4.55, 1.78, 0, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
      slantBeam(g, cx - 3.1, 5.2, cx - 4.3, by, 1.15, dim(col, 0.12), rng);
      slantBeam(g, cx + 3.1, 5.2, cx + 4.3, by, 1.15, dim(col, 0.25), rng);
    }, { seed: k.seed, under: (g) => { contact(g, cx + 0.5, by - 0.8, 5, 1.4, 0.35); } }),
    solid: { w: 8, h: 3 },
  };
}

function chairProp(k: K): PropInfo {
  const W = 14, H = 18, cx = 7, by = 16.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#7a5634';
      // back legs, stiles and slats
      for (const x of [2.6, 11.4]) board(g, x - 0.65, 11.5, 1.3, by - 2.4 - 11.5, dim(col, 0.45), rng, { vertical: true, knots: 0 });
      for (const x of [3.2, 5.6, 8.0, 10.4]) if (x > 3 && x < 11) board(g, x - 0.5 + 0.9, 3.0, 1.0, 6.4, dim(col, 0.08), rng, { vertical: true, knots: 0 });
      board(g, 2.4, 5.6, 9.2, 1.0, dim(col, 0.15), rng, { knots: 0 });
      post(g, 2.6, 1.2, 11.2, 1.45, col, rng, 'round');
      post(g, 11.4, 1.2, 11.2, 1.45, dim(col, 0.12), rng, 'round');
      const rail = () => { g.beginPath(); g.moveTo(2.2, 1.9); g.quadraticCurveTo(cx, 0.9, 11.8, 1.9); g.lineTo(11.8, 3.5); g.quadraticCurveTo(cx, 2.6, 2.2, 3.5); g.closePath(); };
      fillPath(g, rail, lin(g, 0, 1, 0, 3.5, [[0, lit(col, 0.35)], [1, dim(col, 0.25)]]));
      // seat seen from above, then its front edge
      board(g, 1.2, 9.0, 11.6, 2.3, lit(col, 0.15), rng, { knots: 0 });
      g.fillStyle = 'rgba(10,6,4,0.3)'; g.fillRect(1.2, 9.0, 11.6, 0.5);
      board(g, 1.2, 11.3, 11.6, 1.2, dim(col, 0.25), rng, { knots: 0 });
      board(g, 2.6, 14.2, 8.8, 0.8, dim(col, 0.35), rng, { knots: 0 });
      for (const [x, d] of [[2.2, 0.05], [11.8, 0.2]] as const) board(g, x - 0.7, 12.4, 1.4, by - 12.4, dim(col, d), rng, { vertical: true, knots: 0 });
    }, { seed: k.seed, under: (g) => { g.fillStyle = rgba(SHADE, 0.3); g.fillRect(1.5, 12.2, 11, by - 12.2 - 1.5); contact(g, cx + 0.6, by - 1.2, 6.4, 1.6, 0.35); } }),
    solid: { w: 10, h: 4 },
  };
}

function throneProp(k: K): PropInfo {
  const W = 20, H = 30, cx = 10, by = 28.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const wood = '#523622', red = CLOTH.crimson;
      // back panel of carved oak framing crimson velvet
      const back = () => { g.beginPath(); g.moveTo(3.4, 19); g.lineTo(3.4, 5.2); g.quadraticCurveTo(3.8, 2.2, cx, 1.4); g.quadraticCurveTo(16.2, 2.2, 16.6, 5.2); g.lineTo(16.6, 19); g.closePath(); };
      fillPath(g, back, lin(g, 3.4, 0, 16.6, 0, [[0, lit(wood, 0.25)], [0.4, wood], [1, dim(wood, 0.4)]]));
      const vel = () => { g.beginPath(); g.moveTo(5.1, 18); g.lineTo(5.1, 6.2); g.quadraticCurveTo(5.6, 3.9, cx, 3.2); g.quadraticCurveTo(14.4, 3.9, 14.9, 6.2); g.lineTo(14.9, 18); g.closePath(); };
      fillPath(g, vel, lin(g, 5, 3, 15, 18, [[0, lit(red, 0.3)], [0.45, red], [1, dim(red, 0.45)]]));
      g.save(); vel(); g.clip();
      // buttoned tufting
      for (let y = 7; y < 18; y += 2.4) for (let x = 6.2 + ((y / 2.4) % 2 ? 1.2 : 0); x < 14.5; x += 2.4) {
        ellipse(g, x, y, 0.9, 0.9, rgba(dim(red, 0.5), 0.35));
        ellipse(g, x - 0.1, y - 0.1, 0.22, 0.22, BRASS[4]);
      }
      g.fillStyle = lin(g, 0, 3, 0, 8, [[0, 'rgba(10,4,4,0.35)'], [1, 'rgba(10,4,4,0)']]);
      g.fillRect(5, 3, 10, 5);
      g.restore();
      // a gilt crown on the back
      const crx = cx, cry = 8.2;
      poly(g, [crx - 2.6, cry + 1.4, crx - 2.8, cry - 1.2, crx - 1.4, cry - 0.1, crx, cry - 1.9, crx + 1.4, cry - 0.1, crx + 2.8, cry - 1.2, crx + 2.6, cry + 1.4], lin(g, crx - 2.8, cry - 2, crx + 2.8, cry + 1.4, [[0, BRASS[5]], [0.5, BRASS[3]], [1, BRASS[1]]]));
      for (const dx of [-2.8, 0, 2.8]) ellipse(g, crx + dx, cry - (dx ? 1.3 : 2.0), 0.35, 0.35, BRASS[5]);
      ellipse(g, crx, cry + 0.5, 0.4, 0.4, '#2a4a9a');
      g.strokeStyle = rgba(BRASS[3], 0.9); g.lineWidth = 0.28;
      vel(); g.stroke();
      // stiles with gilt finials
      for (const [x, d] of [[3.4, 0], [16.6, 0.25]] as const) {
        post(g, x, 2.6, by - 5.5, 1.9, dim(wood, d), rng, 'none');
        ellipse(g, x, 2.3, 1.05, 1.05, ballShade(g, x, 2.3, 1.05, BRASS[3], 0.6, 0.5));
        ellipse(g, x, 1.1, 0.45, 0.45, ballShade(g, x, 1.1, 0.45, BRASS[3], 0.6, 0.5));
      }
      // arms
      for (const [x0, x1, d] of [[0.8, 5.4, 0], [14.6, 19.2, 0.2]] as const) {
        board(g, x0, 17.0, x1 - x0, 1.1, lit(wood, 0.25 - d), rng, { knots: 0 });
        board(g, x0, 18.1, x1 - x0, 1.0, dim(wood, 0.15 + d), rng, { knots: 0 });
        board(g, (x0 + x1) / 2 - 0.7, 19.1, 1.4, 3.6, dim(wood, 0.1 + d), rng, { vertical: true, knots: 0 });
        ellipse(g, x0 < 5 ? x0 + 0.3 : x1 - 0.3, 17.9, 0.7, 0.8, lin(g, 0, 17, 0, 18.8, [[0, BRASS[4]], [1, BRASS[1]]]));
      }
      // cushion and apron
      roundRect(g, 4.4, 17.6, 11.2, 3.6, 1.4, lin(g, 4.4, 17.6, 15.6, 21.2, [[0, lit(red, 0.35)], [0.5, red], [1, dim(red, 0.35)]]));
      ellipse(g, 7.6, 18.5, 2.2, 0.5, rgba(lit(red, 0.6), 0.35));
      board(g, 3.2, 20.9, 13.6, 2.2, wood, rng, { knots: 0 });
      g.strokeStyle = rgba(BRASS[3], 0.85); g.lineWidth = 0.22;
      g.strokeRect(3.9, 21.4, 12.2, 1.2);
      ellipse(g, cx, 22, 0.55, 0.45, BRASS[4]);
      // legs with gilt feet
      for (const [x, d] of [[3.9, 0.05], [16.1, 0.3]] as const) {
        board(g, x - 0.9, 23.1, 1.8, by - 23.1 - 0.8, dim(wood, d), rng, { vertical: true, knots: 0 });
        ellipse(g, x, by - 0.6, 1.25, 0.7, lin(g, x - 1.2, 0, x + 1.2, 0, [[0, BRASS[4]], [1, BRASS[1]]]));
      }
      g.fillStyle = 'rgba(8,4,2,0.55)';
      g.fillRect(4.8, 23.1, 10.4, by - 23.1 - 1.2);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.5, 9.5, 2, 0.4) }),
    solid: { w: 16, h: 6 },
  };
}

function bedProp(k: K): PropInfo {
  const W = 20, H = 32, cx = 10, by = 30.5;
  const blanket = hexOr(k.opt, new RNG(k.seed).pick([CLOTH.red, CLOTH.woad, CLOTH.green, CLOTH.russet, CLOTH.undyed]));
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k, 3);
      const frame = '#6b4a30';
      // headboard
      const head = () => { g.beginPath(); g.moveTo(2.6, 9); g.lineTo(2.6, 3.4); g.quadraticCurveTo(cx, 0.9, 17.4, 3.4); g.lineTo(17.4, 9); g.closePath(); };
      fillPath(g, head, lin(g, 2.6, 0, 17.4, 0, [[0, lit(frame, 0.2)], [0.5, frame], [1, dim(frame, 0.35)]]));
      g.save(); head(); g.clip();
      for (let x = 2.6; x < 17.4; x += 2.5) line(g, x, 1, x, 9, rgba(dim(frame, 0.6), 0.5), 0.14);
      grainLines(g, 2.6, 1, 14.8, 8, frame, rng, true, 0.5);
      g.restore();
      for (const [x0, x1] of [[4.2, 9.3], [10.7, 15.8]]) { roundRect(g, x0, 3.9, x1 - x0, 3.6, 0.5, lin(g, x0, 3.9, x1, 7.5, [[0, dim(frame, 0.15)], [1, lit(frame, 0.12)]])); g.strokeStyle = rgba(lit(frame, 0.5), 0.45); g.lineWidth = 0.18; g.beginPath(); g.moveTo(x0 + 0.2, 7.3); g.lineTo(x0 + 0.2, 4.1); g.lineTo(x1 - 0.2, 4.1); g.stroke(); }
      post(g, 1.8, 1.8, 10.5, 1.9, frame, rng, 'round');
      post(g, 18.2, 1.8, 10.5, 1.9, dim(frame, 0.2), rng, 'round');
      // side rails seen from above
      board(g, 1.0, 9.5, 1.2, 17, lit(frame, 0.1), rng, { vertical: true, knots: 0 });
      board(g, 17.8, 9.5, 1.2, 17, dim(frame, 0.15), rng, { vertical: true, knots: 0 });
      // sheet and pillow
      roundRect(g, 2.1, 7.2, 15.8, 8, 0.8, lin(g, 2, 7, 18, 15, [[0, lit(LINEN, 0.2)], [1, dim(LINEN, 0.2)]]));
      ellipse(g, cx + 0.4, 11.5, 6.6, 1.6, rgba(SHADE, 0.25));
      roundRect(g, 3.5, 7.1, 13, 4.5, 2.1, rad(g, 7, 7.6, 0.4, cx, 9.4, 7.5, [[0, '#fbf7ec'], [0.5, '#e6dcc6'], [1, '#b0a488']]));
      g.strokeStyle = 'rgba(150,134,104,0.55)'; g.lineWidth = 0.2;
      g.beginPath(); g.moveTo(6, 9.6); g.quadraticCurveTo(cx, 8.5, 14, 9.7); g.stroke();
      g.beginPath(); g.moveTo(8.5, 7.8); g.quadraticCurveTo(9.3, 8.8, 8.4, 10.2); g.stroke();
      // blanket
      const bl = () => { g.beginPath(); g.moveTo(1.3, 12.2); g.quadraticCurveTo(cx, 11.4, 18.7, 12.2); g.lineTo(18.9, 26.8); g.quadraticCurveTo(cx, 27.8, 1.1, 26.8); g.closePath(); };
      fillPath(g, bl, lin(g, 1, 12, 19, 27, [[0, lit(blanket, 0.3)], [0.5, blanket], [1, dim(blanket, 0.35)]]));
      g.save(); bl(); g.clip();
      weave(g, 1, 11, 19, 28, blanket, 0.42, 0.06);
      drape(g, 2.5, 13.5, 17.5, 26, blanket, rng, 8);
      for (const y of [14.2, 15, 24.6, 25.4]) { g.fillStyle = rgba(y < 20 ? lit(blanket, 0.55) : dim(blanket, 0.5), 0.55); g.fillRect(1, y, 18, 0.35); }
      g.fillStyle = lin(g, 1, 0, 19, 0, [[0, 'rgba(0,0,0,0.12)'], [0.12, 'rgba(0,0,0,0)'], [0.85, 'rgba(0,0,0,0)'], [1, 'rgba(8,6,20,0.35)']]);
      g.fillRect(1, 11, 18, 17);
      g.restore();
      // the sheet folded back over the blanket
      const fold = () => { g.beginPath(); g.moveTo(1.2, 11.4); g.quadraticCurveTo(cx, 10.6, 18.8, 11.4); g.lineTo(18.8, 12.9); g.quadraticCurveTo(cx, 12.2, 1.2, 12.9); g.closePath(); };
      fillPath(g, fold, lin(g, 0, 10.6, 0, 12.9, [[0, '#fbf7ec'], [1, '#c8bca2']]));
      // footboard
      board(g, 0.8, 26.3, 18.4, 1.3, lit(frame, 0.22), rng, { knots: 0 });
      planks(g, 0.8, 27.6, 18.4, 2.2, 1, frame, rng, false);
      post(g, 1.7, 25.3, by, 1.8, frame, rng, 'round');
      post(g, 18.3, 25.3, by, 1.8, dim(frame, 0.2), rng, 'round');
    }, { seed: k.seed, under: (g) => contact(g, cx + 1, by - 0.4, 11, 1.9, 0.42) }),
    solid: { w: 16, h: 26 },
  };
}

function bedStrawProp(k: K): PropInfo {
  const W = 20, H = 30, cx = 10, by = 28.5;
  const blanket = hexOr(k.opt, CLOTH.undyed);
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      // a straw-stuffed pallet on the floor
      const pal = () => { g.beginPath(); g.moveTo(2, 3); g.quadraticCurveTo(cx, 1.6, 18, 3); g.quadraticCurveTo(19.4, cx + 5, 18.4, by - 1.2); g.quadraticCurveTo(cx, by + 0.3, 1.6, by - 1.2); g.quadraticCurveTo(0.6, cx + 5, 2, 3); g.closePath(); };
      fillPath(g, pal, lin(g, 0, 2, 0, by, [[0, STRAW[5]], [1, STRAW[2]]]));
      g.save(); pal(); g.clip();
      strawStrokes(g, 900, () => [rng.next() * W, 1 + rng.next() * (by - 1)], rng, { ang: () => rng.next() * Math.PI, len: [1.6, 3.4], w: 0.34, light: (x, y) => 0.7 - (y / by) * 0.35 - (x / W) * 0.25 });
      g.fillStyle = lin(g, 0, by - 3, 0, by, [[0, 'rgba(20,12,4,0)'], [1, 'rgba(20,12,4,0.45)']]);
      g.fillRect(0, by - 3, W, 3);
      g.restore();
      for (let i = 0; i < 40; i++) {
        const t = rng.next() * TAU;
        const x = cx + Math.cos(t) * 8.8, y = cx + 5 + Math.sin(t) * 12.5;
        blade(g, x, y, 1 + rng.next() * 1.6, t + (rng.next() - 0.5), 0.3, 0.28, STRAW[2 + Math.floor(rng.next() * 4)]);
      }
      // a rolled linen bundle for a pillow
      roundRect(g, 3.8, 3.6, 12.4, 4.6, 2.2, rad(g, 7, 4.4, 0.4, cx, 5.9, 7, [[0, '#f4ecd8'], [0.6, '#d6caae'], [1, '#9a8c70']]));
      g.strokeStyle = 'rgba(140,124,94,0.6)'; g.lineWidth = 0.18;
      for (const x of [6.5, 13.5]) { g.beginPath(); g.moveTo(x, 3.9); g.quadraticCurveTo(x + 0.5, 5.9, x, 7.9); g.stroke(); }
      // coarse wool blanket
      const bl = () => { g.beginPath(); g.moveTo(2.6, 11.4); g.quadraticCurveTo(cx, 10.6, 17.6, 11.6); g.quadraticCurveTo(18.4, 19, 17.8, 26.2); g.quadraticCurveTo(cx, 27.2, 2.2, 26); g.quadraticCurveTo(1.6, 19, 2.6, 11.4); g.closePath(); };
      fillPath(g, bl, lin(g, 2, 11, 18, 26, [[0, lit(blanket, 0.3)], [0.5, blanket], [1, dim(blanket, 0.35)]]));
      g.save(); bl(); g.clip();
      weave(g, 1, 10, 19, 28, blanket, 0.5, 0.09);
      drape(g, 3, 12.5, 17, 25.5, blanket, rng, 8);
      g.fillStyle = rgba(lit(blanket, 0.45), 0.6); g.fillRect(1, 11, 18, 1.2);
      g.restore();
      for (let i = 0; i < 16; i++) { const side = rng.next() < 0.5; blade(g, side ? 2.2 : 17.8, 12 + rng.next() * 14, 1.2 + rng.next(), (side ? Math.PI : 0) + (rng.next() - 0.5), 0.3, 0.28, STRAW[3 + Math.floor(rng.next() * 3)]); }
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 1, 10.5, 2, 0.38) }),
    solid: { w: 16, h: 22 },
  };
}

function chestProp(k: K): PropInfo {
  const W = 18, H = 15, cx = 9, by = 13.5;
  const open = k.opt === 'open';
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#74502e', x0 = 1.4, x1 = 16.6, fy = 7.0;
      if (open) {
        // the lid thrown back, its inside toward us
        planks(g, x0, 0.4, x1 - x0, 4.6, 3, dim(col, 0.25), rng, false);
        for (const sx of [4.4, 13.6]) ironBar(g, sx - 0.55, 0.4, 1.1, 4.6, true);
        // inside of the box: shadow, coins and cloth
        g.fillStyle = '#1c130c'; g.fillRect(x0 + 0.6, 4.9, x1 - x0 - 1.2, 2.3);
        fillPath(g, () => { g.beginPath(); g.moveTo(x0 + 1, 7.1); g.quadraticCurveTo(5, 5.2, 8.8, 5.9); g.lineTo(8.6, 7.1); g.closePath(); }, lin(g, 0, 5.4, 0, 7.1, [[0, lit(CLOTH.madder, 0.2)], [1, dim(CLOTH.madder, 0.4)]]));
        for (let i = 0; i < 14; i++) { const x = 9.6 + rng.next() * 5.6, y = 5.8 + rng.next() * 1.2; ellipse(g, x, y, 0.45, 0.25, rad(g, x - 0.15, y - 0.1, 0.02, x, y, 0.5, [[0, BRASS[5]], [0.6, BRASS[3]], [1, BRASS[1]]])); }
        board(g, x0, 4.6, x1 - x0, 0.7, lit(col, 0.2), rng, { knots: 0 });
        board(g, x0 - 0.1, fy - 0.2, x1 - x0 + 0.2, 0.8, lit(col, 0.3), rng, { knots: 0 });
      } else {
        // a barrel-vaulted lid: planks curving over, lit on its crown
        const lid = () => { g.beginPath(); g.moveTo(x0, fy + 0.3); g.lineTo(x0, 3.2); g.quadraticCurveTo(x0 + 0.2, 1.2, x0 + 1.6, 1.1); g.lineTo(x1 - 1.6, 1.1); g.quadraticCurveTo(x1 - 0.2, 1.2, x1, 3.2); g.lineTo(x1, fy + 0.3); g.closePath(); };
        fillPath(g, lid, lin(g, 0, 1.1, 0, fy + 0.3, [[0, lit(col, 0.2)], [0.3, lit(col, 0.38)], [0.55, col], [1, dim(col, 0.3)]]));
        g.save(); lid(); g.clip();
        for (const y of [2.4, 3.9, 5.5]) line(g, x0, y, x1, y, rgba(dim(col, 0.6), 0.6), 0.14);
        grainLines(g, x0, 1, x1 - x0, 6.3, col, rng, false, 0.7);
        g.fillStyle = lin(g, x0, 0, x1, 0, [[0, 'rgba(255,236,200,0.08)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.3)']]);
        g.fillRect(x0, 1, x1 - x0, 7);
        g.restore();
        ironBar(g, x0 - 0.1, fy - 0.35, x1 - x0 + 0.2, 0.75);
      }
      // body
      planks(g, x0, fy + 0.3, x1 - x0, by - fy - 0.3, 2, col, rng, false, 0.2);
      g.fillStyle = lin(g, x0, 0, x1, 0, [[0, 'rgba(255,236,200,0.06)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.32)']]);
      g.fillRect(x0, fy, x1 - x0, by - fy);
      ironBar(g, x0 - 0.1, by - 1.1, x1 - x0 + 0.2, 1.1);
      for (const sx of [4.4, 13.6]) {
        ironBar(g, sx - 0.55, open ? fy - 0.1 : 1.1, 1.1, by - (open ? fy - 0.1 : 1.1), true);
        for (let y = open ? fy + 0.8 : 2.2; y < by - 0.5; y += 1.8) rivet(g, sx, y, 0.2);
      }
      for (const [x, y] of [[x0 + 0.1, by - 1.6], [x1 - 1.6, by - 1.6]]) { ironBar(g, x, y - 1.2, 1.5, 2.4); rivet(g, x + 0.75, y, 0.2); }
      // lock plate and hasp
      roundRect(g, cx - 1.6, fy + 0.4, 3.2, 3.0, 0.4, lin(g, cx - 1.6, fy, cx + 1.6, fy + 3.4, [[0, IRON[4]], [1, IRON[1]]]));
      ellipse(g, cx, fy + 1.6, 0.35, 0.35, '#0a0908');
      g.fillStyle = '#0a0908'; g.fillRect(cx - 0.13, fy + 1.6, 0.26, 0.9);
      if (!open) roundRect(g, cx - 0.55, fy - 1.3, 1.1, 2.3, 0.3, lin(g, cx - 0.5, 0, cx + 0.5, 0, [[0, IRON[4]], [1, IRON[1]]]));
      for (const [dx, dy] of [[-1.15, 0.5], [1.15, 0.5], [-1.15, 2.9], [1.15, 2.9]]) rivet(g, cx + dx, fy + dy, 0.15);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.1, 9.2, 1.9, 0.42) }),
    solid: { w: 14, h: 6 },
  };
}

/** Odds and ends for a kitchen shelf, each standing on y. */
function shelfItem(g: G, kind: number, x: number, y: number, rng: RNG) {
  switch (kind) {
    case 0: jar(g, x, y, 2.6, 3.4, jitter(CLAY[3], rng, 0.08), rng, { cover: rng.next() < 0.6 ? LINEN : undefined }); break;
    case 1: bottle(g, x, y, 1.5, 4.4, rng.next() < 0.5 ? '#4a6a3a' : '#6a4a22', rng.next() < 0.5 ? '#6a2a1a' : null, { neck: 1.8 }); break;
    case 2: jar(g, x, y, 2.4, 3.8, jitter(CLAY[2], rng, 0.08), rng, { handle: true }); break;
    case 3: { // a stack of bowls
      for (let i = 0; i < 3; i++) { const yy = y - i * 0.75; g.beginPath(); g.ellipse(x, yy - 0.45, 1.6, 0.8, 0, 0, Math.PI); g.fillStyle = lin(g, x - 1.6, 0, x + 1.6, 0, [[0, '#b08a5a'], [1, '#5a3e22']]); g.fill(); }
      ellipse(g, x, y - 2.0, 1.6, 0.42, '#c49c68');
      ellipse(g, x, y - 1.95, 1.2, 0.28, '#7a5634');
      break;
    }
    case 4: { // a wheel of cheese
      discSide(g, x, y - 1.7, 1.8, 0.6, 1.2, lin(g, x - 1.8, 0, x + 1.8, 0, [[0, '#e0b050'], [1, '#8a6420']]));
      ellipse(g, x, y - 1.7, 1.8, 0.6, lin(g, x - 1.8, 0, x + 1.8, 0, [[0, '#f4d680'], [1, '#c89a3a']]));
      break;
    }
    case 5: { // folded linen
      for (let i = 0; i < 3; i++) roundRect(g, x - 1.8, y - 0.9 - i * 0.85, 3.6, 0.95, 0.35, lin(g, 0, y - 0.9 - i * 0.85, 0, y - i * 0.85, [[0, i === 1 ? '#c8b89a' : '#ece4d0'], [1, i === 1 ? '#8a7a5e' : '#b0a488']]));
      break;
    }
    case 6: { // a small sack of meal
      const b = () => { g.beginPath(); g.moveTo(x - 0.6, y - 3.2); g.quadraticCurveTo(x - 2.1, y - 2.2, x - 1.8, y - 0.2); g.lineTo(x + 1.8, y - 0.2); g.quadraticCurveTo(x + 2.1, y - 2.2, x + 0.6, y - 3.2); g.closePath(); };
      fillPath(g, b, rad(g, x - 0.8, y - 2.4, 0.1, x, y - 1.5, 2.6, [[0, '#d2c098'], [1, '#7a6a4a']]));
      line(g, x - 0.7, y - 3.1, x + 0.7, y - 3.1, '#6a4a2a', 0.3);
      break;
    }
    default: { // a candle stub on a dish
      ellipse(g, x, y - 0.3, 1.2, 0.35, IRON[3]);
      g.fillStyle = lin(g, x - 0.4, 0, x + 0.4, 0, [[0, '#f6f0e0'], [1, '#bcae92']]);
      g.fillRect(x - 0.4, y - 2.2, 0.8, 1.9);
      line(g, x, y - 2.2, x, y - 2.6, '#2a1e14', 0.12);
    }
  }
}

function shelfProp(k: K): PropInfo {
  const W = 20, H = 28, cx = 10, by = 26.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#6e4c30';
      planks(g, 2.4, 2.4, 15.2, by - 2.8, 4, dim(col, 0.52), rng, true, 0.12);
      const shelves = [9.4, 17.6, by - 0.9];
      let prev = 2.6;
      for (const sy of shelves) {
        // shadow under the shelf above, then the goods
        g.fillStyle = lin(g, 0, prev, 0, prev + 2.5, [[0, 'rgba(8,5,3,0.6)'], [1, 'rgba(8,5,3,0)']]);
        g.fillRect(2.4, prev, 15.2, 2.5);
        let x = 3.9 + rng.next() * 0.6;
        while (x < 16.2) {
          const kind = Math.floor(rng.next() * 8);
          shelfItem(g, kind, x, sy - 0.1, rng);
          x += 2.8 + rng.next() * 1.2;
        }
        board(g, 1.4, sy - 0.1, 17.2, 0.9, lit(col, 0.2), rng, { knots: 0 });
        board(g, 1.4, sy + 0.8, 17.2, 0.9, dim(col, 0.2), rng, { knots: 0 });
        prev = sy + 1.7;
      }
      board(g, 1.0, 2.2, 1.6, by - 2.2, col, rng, { vertical: true, knots: 0 });
      board(g, 17.4, 2.2, 1.6, by - 2.2, dim(col, 0.28), rng, { vertical: true, knots: 0 });
      board(g, 0.4, 0.9, 19.2, 1.0, lit(col, 0.3), rng, { knots: 0 });
      board(g, 0.4, 1.9, 19.2, 1.0, dim(col, 0.15), rng, { knots: 0 });
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.2, 10, 1.4, 0.4) }),
    solid: { w: 18, h: 8 },
    wall: true,
  };
}

function bookshelfProp(k: K): PropInfo {
  const W = 20, H = 30, cx = 10, by = 28.5;
  const COLS = [CLOTH.red, CLOTH.woad, CLOTH.green, CLOTH.ochre, CLOTH.brown, CLOTH.plum, '#3a2a4a', P.clay1, '#5a4030', CLOTH.forest, CLOTH.black];
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#4e3422';
      planks(g, 2.4, 2.4, 15.2, by - 2.8, 4, dim(col, 0.5), rng, true, 0.12);
      const shelves = [10.2, 19.4, by - 0.9];
      let prev = 2.6;
      for (const sy of shelves) {
        g.fillStyle = lin(g, 0, prev, 0, prev + 3, [[0, 'rgba(6,4,2,0.7)'], [1, 'rgba(6,4,2,0.1)']]);
        g.fillRect(2.4, prev, 15.2, sy - prev);
        const room = sy - prev - 0.4;
        let x = 2.6;
        while (x < 17.2) {
          const r = rng.next();
          if (r < 0.1) { x += 0.8 + rng.next(); continue; }
          if (r < 0.2 && x < 14) {
            // a few books lying in a pile
            const n = 2 + Math.floor(rng.next() * 2);
            for (let i = 0; i < n; i++) {
              const c = COLS[Math.floor(rng.next() * COLS.length)];
              const bw = 2.6 + rng.next() * 0.6;
              g.fillStyle = lin(g, 0, sy - (i + 1) * 0.85, 0, sy - i * 0.85, [[0, lit(c, 0.25)], [1, dim(c, 0.3)]]);
              g.fillRect(x + (rng.next() - 0.5) * 0.3, sy - (i + 1) * 0.85, bw, 0.8);
              g.fillStyle = '#e4d8bc'; g.fillRect(x + bw - 0.3, sy - (i + 1) * 0.85 + 0.15, 0.25, 0.5);
            }
            x += 3.4;
            continue;
          }
          const bw = 0.8 + rng.next() * 0.75;
          const bh = room * (0.62 + rng.next() * 0.36);
          const lean = rng.next() < 0.12 ? (rng.next() - 0.5) * 0.35 : 0;
          if (x + bw > 17.3) break;
          bookSpine(g, x, sy, bw, bh, jitter(COLS[Math.floor(rng.next() * COLS.length)], rng, 0.06), rng, lean);
          x += bw + 0.05;
        }
        board(g, 1.4, sy - 0.1, 17.2, 0.9, lit(col, 0.25), rng, { knots: 0 });
        board(g, 1.4, sy + 0.8, 17.2, 0.9, dim(col, 0.15), rng, { knots: 0 });
        prev = sy + 1.7;
      }
      board(g, 0.9, 2.2, 1.7, by - 2.2, col, rng, { vertical: true, knots: 0 });
      board(g, 17.4, 2.2, 1.7, by - 2.2, dim(col, 0.3), rng, { vertical: true, knots: 0 });
      board(g, 0.3, 0.8, 19.4, 1.1, lit(col, 0.35), rng, { knots: 0 });
      board(g, 0.3, 1.9, 19.4, 0.9, dim(col, 0.1), rng, { knots: 0 });
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.2, 10, 1.4, 0.4) }),
    solid: { w: 18, h: 8 },
    wall: true,
  };
}

// ---------------------------------------------------------------- hearths and fires

function fireplaceProp(k: K): PropInfo {
  const W = 32, H = 32, cx = 16, by = 29.5;
  const pot = k.opt === 'pot';
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const warm = ['#7c7266', '#6e645a', '#887c6e', '#766a5e', '#908476'];
      // chimney breast, sooted toward the mantel
      masonry(g, 5, 0.6, 27, 13.2, rng, warm, 2.6, { len: [1.3, 2.3] });
      g.fillStyle = lin(g, 5, 0, 27, 0, [[0, 'rgba(255,236,210,0.12)'], [0.55, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.35)']]);
      g.fillRect(5, 0.6, 22, 12.6);
      g.fillStyle = lin(g, 0, 6, 0, 13.2, [[0, 'rgba(14,10,8,0)'], [1, 'rgba(14,10,8,0.45)']]);
      g.fillRect(5, 6, 22, 7.2);
      // the firebox: sooty brick back wall lit from below by the fire
      const ox0 = 8.2, ox1 = 23.8, oTop = 15.4, oBot = by - 0.6;
      masonry(g, ox0, oTop, ox1, oBot, rng, ['#4a362c', '#3e2c24', '#523c30', '#443228'], 1.5, { len: [1.5, 2.3], mortar: '#140e0b', r: 0.25 });
      g.fillStyle = lin(g, 0, oTop, 0, oBot, [[0, 'rgba(6,4,3,0.95)'], [0.4, 'rgba(10,6,4,0.8)'], [0.75, 'rgba(40,16,8,0.45)'], [1, 'rgba(90,30,10,0.2)']]);
      g.fillRect(ox0, oTop, ox1 - ox0, oBot - oTop);
      g.fillStyle = rad(g, cx, oBot, 0.5, cx, oBot - 1, 8, [[0, 'rgba(255,150,60,0.6)'], [0.5, 'rgba(200,70,20,0.25)'], [1, 'rgba(120,40,10,0)']]);
      g.fillRect(ox0, oTop, ox1 - ox0, oBot - oTop);
      // splayed inner jambs
      poly(g, [ox0, oTop, ox0 + 1.7, oTop + 1.2, ox0 + 1.7, oBot - 0.4, ox0, oBot + 0.4], lin(g, 0, oTop, 0, oBot, [[0, '#1a120e'], [1, '#8a4a28']]));
      poly(g, [ox1, oTop, ox1 - 1.7, oTop + 1.2, ox1 - 1.7, oBot - 0.4, ox1, oBot + 0.4], lin(g, 0, oTop, 0, oBot, [[0, '#120c0a'], [1, '#5a301c']]));
      // ash, embers, firedogs and logs
      ellipse(g, cx, oBot - 0.1, 7.2, 1.3, '#3a332e');
      coals(g, cx, oBot - 0.6, 5.6, 1.0, rng, 70, 1.15);
      for (const ax of [11.2, 20.8]) {
        g.fillStyle = lin(g, ax - 0.4, 0, ax + 0.4, 0, [[0, IRON[3]], [1, IRON[0]]]);
        g.fillRect(ax - 0.35, oBot - 4.2, 0.7, 4.2);
        ellipse(g, ax, oBot - 4.3, 0.6, 0.6, ballShade(g, ax, oBot - 4.3, 0.6, IRON[3], 0.6, 0.5));
        g.fillRect(ax - 1, oBot - 0.5, 2, 0.5);
      }
      logLying(g, ox0 + 1.4, oBot - 3.4, ox1 - 1.4, oBot - 3.4, 1.05, rng, { char: 0.55, glow: 0.8, end: false });
      logLying(g, ox0 + 1.2, oBot - 1.2, cx + 0.8, oBot - 2.4, 1.0, rng, { char: 0.6, glow: 1 });
      logLying(g, ox1 - 1.2, oBot - 1.0, cx - 0.6, oBot - 2.2, 0.95, rng, { char: 0.6, glow: 1 });
      if (pot) {
        // an iron crane swung over the fire with the pot on its hook
        g.strokeStyle = lin(g, ox0, 0, ox0 + 2, 0, [[0, IRON[4]], [1, IRON[1]]]); g.lineWidth = 0.55;
        g.beginPath(); g.moveTo(ox0 + 1.1, oTop + 0.6); g.lineTo(ox0 + 1.1, oBot - 1.5); g.moveTo(ox0 + 1.1, oTop + 1.2); g.lineTo(cx + 1.2, oTop + 1.2); g.moveTo(ox0 + 1.1, oTop + 4.4); g.lineTo(ox0 + 5.2, oTop + 1.2); g.stroke();
        g.strokeStyle = IRON[2]; g.lineWidth = 0.25;
        for (let y = oTop + 1.4; y < 18.1; y += 0.65) { g.beginPath(); g.ellipse(cx + 0.6, y, 0.2, 0.3, 0, 0, TAU); g.stroke(); }
        const py = 20.2;
        g.strokeStyle = IRON[1]; g.lineWidth = 0.3;
        g.beginPath(); g.moveTo(cx - 3.3, py - 2.2); g.quadraticCurveTo(cx + 0.6, 16.4, cx + 4.5, py - 2.2); g.stroke();
        ellipse(g, cx + 0.6, py, 4.3, 3.2, rad(g, cx - 0.9, py - 1.4, 0.2, cx + 0.6, py, 4.5, [[0, '#6a6a70'], [0.35, '#3a3a40'], [1, '#101012']]));
        ellipse(g, cx + 0.6, py - 2.3, 3.6, 0.9, lin(g, cx - 3, 0, cx + 4, 0, [[0, '#8a8a92'], [1, '#2a2a30']]));
        ellipse(g, cx + 0.6, py - 2.25, 2.9, 0.6, '#3a2616');
        ellipse(g, cx - 0.6, py - 1.0, 1.2, 0.5, 'rgba(255,255,255,0.18)');
        g.fillStyle = lin(g, 0, py + 1, 0, py + 3.2, [[0, 'rgba(255,120,40,0)'], [1, 'rgba(255,120,40,0.45)']]);
        g.beginPath(); g.ellipse(cx + 0.6, py, 4.3, 3.2, 0, 0, Math.PI); g.fill();
      }
      // stone jambs and the mantel
      masonry(g, 2.4, 15.2, ox0, by + 0.4, rng, STONE, 2.4, { len: [1.1, 1.6] });
      masonry(g, ox1, 15.2, 29.6, by + 0.4, rng, STONE, 2.4, { len: [1.1, 1.6] });
      g.fillStyle = lin(g, 2.4, 0, ox0, 0, [[0, 'rgba(255,236,210,0.12)'], [1, 'rgba(255,140,60,0.12)']]);
      g.fillRect(2.4, 15.2, ox0 - 2.4, by + 0.4 - 15.2);
      g.fillStyle = lin(g, ox1, 0, 29.6, 0, [[0, 'rgba(255,140,60,0.1)'], [1, 'rgba(10,8,20,0.35)']]);
      g.fillRect(ox1, 15.2, 29.6 - ox1, by + 0.4 - 15.2);
      stoneBlock(g, 1.2, 14.8, 3.6, 2.4, STONE[4], rng, 0.4);
      stoneBlock(g, 27.2, 14.8, 3.6, 2.4, STONE[2], rng, 0.4);
      board(g, 0.6, 12.4, 30.8, 1.2, lit('#5e4028', 0.3), rng, { knots: 0 });
      board(g, 0.6, 13.6, 30.8, 1.9, '#553a24', rng, { knots: 1 });
      g.fillStyle = 'rgba(255,150,70,0.18)'; g.fillRect(ox0, 15.1, ox1 - ox0, 0.4);
      // things on the mantel
      jar(g, 4.4, 12.6, 2.4, 3.2, jitter(CLAY[3], rng, 0.05), rng, { handle: true });
      goblet(g, 24.8, 12.7, ['#2a2c30', '#4a4e54', '#6e737a', '#90969e', '#b8bec6', '#dce0e4'], 0.8);
      goblet(g, 26.6, 12.7, ['#2a2c30', '#4a4e54', '#6e737a', '#90969e', '#b8bec6', '#dce0e4'], 0.8);
      bottle(g, 7.4, 12.6, 1.3, 3.6, '#4a5a32', null, { neck: 1.4 });
      // hearthstone
      stoneBlock(g, 0.8, by - 0.6, 30.4, 3.0, STONE[4], rng, 0.5);
      g.fillStyle = lin(g, 0, 0, W, 0, [[0, 'rgba(255,236,210,0.08)'], [0.5, 'rgba(255,140,60,0.18)'], [1, 'rgba(10,8,20,0.3)']]);
      g.fillRect(0.8, by - 0.6, 30.4, 3);
      for (let i = 0; i < 8; i++) ellipse(g, cx + (rng.next() - 0.5) * 16, by + 0.3 + rng.next(), 0.5, 0.2, rgba('#2a2420', 0.5));
      return (gg) => {
        glow(gg, cx, by - 2.5, 12, '#ff8a3a', 0.26, true);
        glow(gg, cx, by - 1.5, 5, '#ffc070', 0.3, true);
      };
    }, { seed: k.seed }),
    solid: { w: 30, h: 10 },
    light: { x: 0, y: -8, r: 80, color: '#ff9a4a', flicker: true, intensity: 0.95 },
    anim: 'fire',
    wall: true,
  };
}

function ovenProp(k: K): PropInfo {
  const W = 32, H = 28, cx = 16, by = 26.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      // a baker's peel leaning on the right
      slantBeam(g, 30.6, by - 0.4, 27.2, 7.5, 0.7, '#9a7a52', rng);
      // plinth
      masonry(g, 1.2, by - 4.4, 30.8, by, rng, STONE, 2.2, { len: [1.3, 2.2] });
      g.fillStyle = lin(g, 1.2, 0, 30.8, 0, [[0, 'rgba(255,236,210,0.1)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.3)']]);
      g.fillRect(1.2, by - 4.4, 29.6, 4.4);
      // the clay dome
      const dome = () => { g.beginPath(); g.moveTo(2.2, by - 4.2); g.bezierCurveTo(1.4, 9, 8, 1.6, cx, 1.6); g.bezierCurveTo(24, 1.6, 30.6, 9, 29.8, by - 4.2); g.closePath(); };
      const clay = '#a8603e';
      fillPath(g, dome, rad(g, cx - 6, 7, 1, cx, 13, 17, [[0, lit(clay, 0.35)], [0.45, clay], [0.85, dim(clay, 0.35)], [1, dim(clay, 0.5)]]));
      g.save(); dome(); g.clip();
      // courses of brick showing where the daub has fallen away
      for (let i = 0; i < 5; i++) {
        const px = 4 + rng.next() * 24, py = 5 + rng.next() * 12;
        g.save(); g.beginPath(); g.ellipse(px, py, 2.5 + rng.next() * 2, 1.4 + rng.next(), rng.next() - 0.5, 0, TAU); g.clip();
        masonry(g, px - 5, py - 3, px + 5, py + 3, rng, ['#8e4a32', '#7a3e2a', '#9a563c'], 1.2, { len: [1.6, 2.4], mortar: '#5a4638', r: 0.2 });
        g.restore();
      }
      for (let i = 0; i < 160; i++) ellipse(g, 2 + rng.next() * 28, 2 + rng.next() * 21, 0.4 + rng.next() * 1.2, 0.3 + rng.next() * 0.5, rgba(rng.next() < 0.5 ? dim(clay, 0.3) : lit(clay, 0.3), 0.2), rng.next() * 3);
      g.strokeStyle = rgba(dim(clay, 0.6), 0.6); g.lineWidth = 0.15;
      for (let i = 0; i < 4; i++) { let x = 5 + rng.next() * 22, y = 4 + rng.next() * 8; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 4; j++) { x += (rng.next() - 0.5) * 2; y += 0.8 + rng.next(); g.lineTo(x, y); } g.stroke(); }
      // soot above the mouth
      g.fillStyle = rad(g, cx, 11, 0.5, cx, 9, 7, [[0, 'rgba(16,10,8,0.7)'], [1, 'rgba(16,10,8,0)']]);
      g.fillRect(cx - 8, 2, 16, 12);
      g.fillStyle = lin(g, 0, by - 8, 0, by - 4, [[0, 'rgba(20,10,6,0)'], [1, 'rgba(20,10,6,0.4)']]);
      g.fillRect(0, by - 8, W, 4);
      g.restore();
      // a vent in the crown
      ellipse(g, cx + 4.5, 3.4, 1.4, 0.55, '#1a0f0a');
      // the mouth, with a brick arch
      const m0 = cx - 5.4, m1 = cx + 5.4, mTop = 12.4, mBot = by - 3.2;
      const mouth = (pad: number) => { g.beginPath(); g.moveTo(m0 - pad, mBot); g.lineTo(m0 - pad, mTop + 5.4); g.arc(cx, mTop + 5.4, 5.4 + pad, Math.PI, 0); g.lineTo(m1 + pad, mBot); g.closePath(); };
      fillPath(g, () => mouth(1.5), '#5a3426');
      g.save(); mouth(1.5); g.clip();
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        const x0 = cx + Math.cos(a) * 5.5, y0 = mTop + 5.4 + Math.sin(a) * 5.5, x1 = cx + Math.cos(a) * 7.0, y1 = mTop + 5.4 + Math.sin(a) * 7.0;
        g.strokeStyle = '#3a2016'; g.lineWidth = 0.2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      for (const sx of [m0 - 1.5, m1]) for (let y = mTop + 5.4; y < mBot; y += 1.3) stoneBlock(g, sx + 0.1, y + 0.1, 1.3, 1.1, jitter('#8e4a32', rng, 0.06), rng, 0.2);
      g.restore();
      g.strokeStyle = rgba('#d8906a', 0.5); g.lineWidth = 0.3;
      g.beginPath(); g.arc(cx, mTop + 5.4, 6.9, Math.PI * 1.05, Math.PI * 1.55); g.stroke();
      fillPath(g, () => mouth(0), rad(g, cx, mBot, 0.5, cx, mBot - 3, 10, [[0, '#a8401a'], [0.3, '#4a1a0c'], [0.7, '#140a06'], [1, '#080504']]));
      coals(g, cx, mBot - 0.7, 4.4, 0.8, rng, 50, 1.2);
      stoneBlock(g, m0 - 1.8, mBot - 0.2, m1 - m0 + 3.6, 1.2, STONE[4], rng, 0.3);
      // split logs stacked by the plinth
      for (const [lx, ly] of [[3.4, by - 1.3], [6.3, by - 1.3], [4.8, by - 3.5]]) {
        g.fillStyle = BARK[2]; g.fillRect(lx - 1.3, ly - 2.5, 2.6, 2.4);
        endGrain(g, lx, ly, 1.35, 1.2, rng);
      }
      return (gg) => glow(gg, cx, mBot - 1.5, 8, '#ff8a3a', 0.3, true);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.2, 16, 2.2, 0.42) }),
    solid: { w: 28, h: 10 },
    light: { x: 0, y: -8, r: 60, color: '#ff9a4a', flicker: true, intensity: 0.8 },
    anim: 'fire',
  };
}

function cauldronProp(k: K): PropInfo {
  const W = 20, H = 21, cx = 10, by = 19.5;
  const brew = k.opt === 'brew';
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const pole = '#6a543c';
      // the back leg of the tripod, then the two front legs
      slantBeam(g, cx + 0.3, 1.2, cx + 1.8, by - 4.8, 0.8, dim(pole, 0.3), rng);
      // ring of stones behind, the fire, then the pot
      const ring = (front: boolean) => {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU + 0.2;
          if ((Math.sin(a) > 0) !== front) continue;
          cobble(g, cx + Math.cos(a) * 6.8, by - 1.4 + Math.sin(a) * 1.9, 1.3, 0.95, jitter(STONE[3], rng, 0.08), rng);
        }
      };
      ring(false);
      ellipse(g, cx, by - 1.3, 5.6, 1.4, '#2e2824');
      coals(g, cx, by - 1.4, 4.4, 1.0, rng, 50, 1.1);
      logLying(g, cx - 5, by - 0.6, cx + 0.8, by - 2.2, 0.75, rng, { char: 0.55, glow: 1 });
      logLying(g, cx + 5, by - 0.8, cx - 0.8, by - 2.0, 0.7, rng, { char: 0.55, glow: 1 });
      // chain from the lashing down to the bail
      g.strokeStyle = IRON[2]; g.lineWidth = 0.22;
      for (let y = 2.4; y < 6.4; y += 0.62) { g.beginPath(); g.ellipse(cx + (Math.floor(y / 0.62) % 2 ? 0.05 : -0.05), y, 0.2, 0.3, 0, 0, TAU); g.stroke(); }
      g.strokeStyle = IRON[1]; g.lineWidth = 0.32;
      g.beginPath(); g.moveTo(cx - 5, 9.2); g.quadraticCurveTo(cx, 3.8, cx + 5, 9.2); g.stroke();
      // the pot
      const py = 12.2;
      ellipse(g, cx, py, 5.9, 4.6, rad(g, cx - 2.2, py - 1.8, 0.2, cx, py, 6.2, [[0, '#76767e'], [0.3, '#44444a'], [0.8, '#1c1c20'], [1, '#101012']]));
      g.fillStyle = lin(g, 0, py + 1.5, 0, py + 4.6, [[0, 'rgba(255,120,40,0)'], [1, 'rgba(255,130,50,0.5)']]);
      g.beginPath(); g.ellipse(cx, py, 5.9, 4.6, 0, 0, Math.PI); g.fill();
      ellipse(g, cx - 2.4, py - 1.2, 1.2, 1.6, 'rgba(255,255,255,0.14)');
      for (const d of [-1, 1]) ellipse(g, cx + d * 5.1, py - 3.4, 0.5, 0.5, IRON[2]);
      ellipse(g, cx, py - 3.6, 5.0, 1.55, lin(g, cx - 5, 0, cx + 5, 0, [[0, '#9a9aa2'], [0.4, '#55555c'], [1, '#1a1a1e']]));
      const liq = brew ? '#5a9a3a' : '#6a4424';
      ellipse(g, cx, py - 3.5, 4.2, 1.1, rad(g, cx - 1, py - 3.8, 0.1, cx, py - 3.5, 4.2, [[0, lit(liq, 0.35)], [0.6, liq], [1, dim(liq, 0.5)]]));
      if (brew) {
        for (let i = 0; i < 7; i++) { const bx = cx + (rng.next() - 0.5) * 6, byy = py - 3.5 + (rng.next() - 0.5) * 1.2; g.strokeStyle = 'rgba(200,250,160,0.8)'; g.lineWidth = 0.12; g.beginPath(); g.ellipse(bx, byy, 0.35 + rng.next() * 0.3, 0.2, 0, 0, TAU); g.stroke(); }
      } else {
        for (let i = 0; i < 6; i++) ellipse(g, cx + (rng.next() - 0.5) * 6, py - 3.5 + (rng.next() - 0.5) * 1, 0.35, 0.22, ['#d0782c', '#8aa84a', '#e8dcc0'][i % 3]);
        ellipse(g, cx - 1.5, py - 3.8, 0.9, 0.2, 'rgba(255,240,210,0.45)');
      }
      // front legs of the tripod over the pot
      slantBeam(g, cx - 0.4, 0.9, cx - 8.3, by - 0.3, 0.9, pole, rng);
      slantBeam(g, cx + 0.4, 0.9, cx + 8.3, by - 0.3, 0.9, dim(pole, 0.15), rng);
      ellipse(g, cx, 1.6, 1.0, 0.8, lin(g, 0, 0.8, 0, 2.4, [[0, '#c0a070'], [1, '#6a5030']]));
      line(g, cx - 0.8, 1.3, cx + 0.8, 1.9, 'rgba(60,40,20,0.7)', 0.14);
      ring(true);
      return (gg) => {
        groundGlow(gg, cx, by - 1.4, 7.5, 2.6, '#ff9a4a', 0.5);
        if (brew) glow(gg, cx, py - 3.6, 4.4, '#8aff6a', 0.2);
      };
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.5, by - 1, 8.5, 2, 0.38) }),
    solid: { w: 14, h: 6 },
    light: { x: 0, y: -4, r: 40, color: '#ff9a4a', flicker: true, intensity: 0.6 },
    anim: 'fire',
  };
}

function alchemyProp(k: K): PropInfo {
  const W = 34, H = 25, cx = 17, by = 23.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#6e4c30';
      const top = 11.4, edge = 17.4;
      // legs and the low shelf of jars
      for (const lx of [2.2, 29.6]) board(g, lx, edge + 1.5, 2.2, by - edge - 1.5, dim(col, 0.2), rng, { vertical: true, knots: 0 });
      g.fillStyle = 'rgba(8,5,3,0.55)'; g.fillRect(4.4, edge + 1.5, 25.2, 3.5);
      board(g, 3.4, by - 2.2, 27.2, 1.0, dim(col, 0.3), rng, { knots: 0 });
      jar(g, 8, by - 2.1, 2.6, 3.0, CLAY[2], rng, { cover: LINEN });
      jar(g, 12, by - 2.1, 2.2, 2.6, '#6a7a6a', rng);
      bottle(g, 25.4, by - 2.1, 1.6, 3.2, '#3e5a3a', null, { round: true, neck: 1.2 });
      // top and front edge
      planks(g, 1, top, 32, edge - top, 3, col, rng, false, 0.18);
      g.fillStyle = lin(g, 1, top, 30, edge, [[0, 'rgba(255,238,205,0.14)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.2)']]);
      g.fillRect(1, top, 32, edge - top);
      for (let i = 0; i < 5; i++) ellipse(g, 3 + rng.next() * 28, top + 1 + rng.next() * 4.5, 0.8 + rng.next() * 1.4, 0.4 + rng.next() * 0.4, rgba(['#3a5a2a', '#5a2a1a', '#1a1a2a'][i % 3], 0.2));
      board(g, 1, edge, 32, 1.6, dim(col, 0.25), rng, { knots: 0 });
      g.fillStyle = rgba(lit(col, 0.6), 0.5); g.fillRect(1, edge - 0.05, 32, 0.24);
      // brazier and copper still
      g.fillStyle = lin(g, 4.4, 0, 9.6, 0, [[0, IRON[3]], [1, IRON[0]]]);
      g.fillRect(4.6, 12.4, 4.8, 1.9);
      ellipse(g, 7, 12.4, 2.6, 0.7, '#2a1a12');
      coals(g, 7, 12.4, 2.1, 0.5, rng, 16, 1);
      for (const lx of [5, 9]) line(g, lx, 14.2, lx - 0.3, 15.4, IRON[1], 0.35);
      ellipse(g, 7, 9.6, 3.2, 3.0, ballShade(g, 7, 9.6, 3.2, COPPER[3], 0.5, 0.55));
      ellipse(g, 6, 8.4, 0.8, 0.6, 'rgba(255,230,200,0.5)');
      ellipse(g, 7, 6.8, 1.7, 1.4, ballShade(g, 7, 6.8, 1.7, COPPER[3], 0.5, 0.5));
      g.strokeStyle = lin(g, 7, 5, 16, 11, [[0, COPPER[4]], [1, COPPER[2]]]); g.lineWidth = 0.55;
      g.beginPath(); g.moveTo(8.3, 6.1); g.quadraticCurveTo(12.6, 5.4, 15.2, 9.6); g.stroke();
      // receiver flask
      bottle(g, 15.4, 15.2, 4.0, 5.4, '#9ab8b0', '#c89a4a', { round: true, neck: 1.6, fill: 0.45 });
      // coloured philtres
      bottle(g, 19.6, 15.4, 1.8, 6.4, '#4a7a4a', '#3a8a3a', { neck: 2.4, fill: 0.7 });
      bottle(g, 22.5, 15.6, 2.8, 4.4, '#b89a9a', '#9a2a3a', { round: true, neck: 1.5, fill: 0.55 });
      bottle(g, 25.1, 15.2, 1.3, 3.4, '#8aa0c8', '#3a5aa8', { neck: 1.2, fill: 0.6 });
      for (const [x, y] of [[19.6, 8.8], [22.5, 10.9], [25.1, 11.6]]) roundRect(g, x - 0.4, y - 0.5, 0.8, 0.8, 0.2, '#a07a4a');
      // mortar and pestle
      g.fillStyle = lin(g, 27, 0, 31.4, 0, [[0, '#b0aaa0'], [1, '#5e5a54']]);
      g.beginPath(); g.moveTo(26.9, 13.2); g.quadraticCurveTo(27.2, 15.6, 29.2, 15.7); g.quadraticCurveTo(31.2, 15.6, 31.5, 13.2); g.closePath(); g.fill();
      ellipse(g, 29.2, 13.2, 2.3, 0.7, '#c8c2b6');
      ellipse(g, 29.2, 13.25, 1.8, 0.45, '#4a6a3a');
      line(g, 29.4, 13.2, 31.6, 10.6, '#c8c2b6', 0.6);
      // a scroll of receipts and a scatter of herbs
      roundRect(g, 9.4, 15.2, 6.2, 1.8, 0.6, lin(g, 0, 15.2, 0, 17, [[0, '#f0e6cc'], [1, '#bcaa86']]));
      for (let x = 10.2; x < 15; x += 1.1) line(g, x, 15.9, x + 0.7, 15.9, rgba('#3a2a1e', 0.5), 0.12);
      for (let i = 0; i < 5; i++) blade(g, 2.6 + rng.next() * 3, 16.4, 1.4, -0.3 + rng.next() * 0.6, 0.2, 0.45, LEAF[3 + (i % 2)]);
      return (gg) => glow(gg, 7, 12.6, 3.2, '#ff8a3a', 0.35);
    }, { seed: k.seed, under: (g) => { g.fillStyle = lin(g, 0, 18.6, 0, by + 1, [[0, rgba(SHADE, 0.5)], [1, rgba(SHADE, 0.25)]]); roundRect(g, 1.5, 18.6, W - 3, by + 1 - 18.6, 1.5); g.fill(); } }),
    solid: { w: 30, h: 10 },
  };
}

function lecternProp(k: K): PropInfo {
  const W = 16, H = 20, cx = 8, by = 18.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#6a4a30';
      // foot
      roundRect(g, 2.6, by - 2.2, 10.8, 2.2, 0.8, lin(g, 0, by - 2.2, 0, by, [[0, lit(col, 0.3)], [1, dim(col, 0.4)]]));
      for (const fx of [3.2, 12.8]) ellipse(g, fx, by - 0.4, 1.0, 0.5, dim(col, 0.35));
      // turned column
      post(g, cx, 7.8, by - 2, 2.0, col, rng, 'none');
      for (const ky of [10.4, 14.2, by - 2.6]) ellipse(g, cx, ky, 1.5, 0.55, lin(g, cx - 1.5, 0, cx + 1.5, 0, [[0, lit(col, 0.4)], [1, dim(col, 0.4)]]));
      // slanted desk
      poly(g, [1.2, 2.3, 14.8, 2.3, 15.3, 8.0, 0.7, 8.0], lin(g, 0, 2.3, 0, 8, [[0, lit(col, 0.15)], [1, col]]));
      board(g, 0.7, 8.0, 14.6, 1.1, dim(col, 0.3), rng, { knots: 0 });
      openBook(g, 2.3, 2.5, 11.4, 5.2, rng, '#5a2020');
      line(g, cx + 0.5, 7.6, cx + 0.8, 10.6, '#a8201c', 0.35);
      board(g, 0.7, 7.6, 14.6, 0.6, lit(col, 0.25), rng, { knots: 0 });
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.6, by - 0.4, 6.4, 1.5, 0.42) }),
    solid: { w: 10, h: 4 },
  };
}

function altarProp(k: K): PropInfo {
  const W = 36, H = 24, cx = 18, by = 22.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const top = 9.4, front = 12;
      // stone step and block
      stoneBlock(g, 0.6, by - 1.7, 34.8, 1.7, STONE[4], rng, 0.3);
      masonry(g, 1.6, front, 34.4, by - 1.5, rng, ['#a8a298', '#9a948a', '#b4aea2', '#8e887e'], 2.7, { len: [1.5, 2.6] });
      g.fillStyle = lin(g, 1.6, 0, 34.4, 0, [[0, 'rgba(255,240,220,0.1)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.3)']]);
      g.fillRect(1.6, front, 32.8, by - 1.5 - front);
      // white linen over the mensa, hanging down the front
      const cloth = () => { g.beginPath(); g.moveTo(1.2, top); g.lineTo(34.8, top); g.lineTo(34.9, front + 2.4); for (let x = 34.9; x > 1.1; x -= 1.2) g.lineTo(x - 0.6, front + 2.4 + ((x * 7) % 2 > 1 ? 0.35 : 0.1)); g.lineTo(1.1, front + 2.4); g.closePath(); };
      fillPath(g, cloth, lin(g, 0, top, 0, front + 2.5, [[0, '#fbf8f0'], [0.45, '#ece6d6'], [1, '#c8c0ac']]));
      g.save(); cloth(); g.clip();
      g.fillStyle = 'rgba(160,150,130,0.35)'; g.fillRect(1, front - 0.1, 34, 0.4);
      folds(g, 1, front, 35, front + 2.6, '#e8e2d2', rng, 9, true, 0.25);
      g.restore();
      // the crimson frontal with a gold cross
      const fr = () => { g.beginPath(); g.moveTo(9, front + 1.6); g.lineTo(27, front + 1.6); g.lineTo(27, by - 2.6); g.lineTo(9, by - 2.6); g.closePath(); };
      fillPath(g, fr, lin(g, 9, front, 27, by, [[0, lit(CLOTH.crimson, 0.25)], [1, dim(CLOTH.crimson, 0.35)]]));
      g.save(); fr(); g.clip(); folds(g, 9, front, 27, by, CLOTH.crimson, rng, 5, true, 0.28); g.restore();
      g.strokeStyle = rgba(BRASS[3], 0.9); g.lineWidth = 0.3; g.strokeRect(9.6, front + 2.2, 16.8, by - 2.6 - front - 2.8);
      emblem(g, 'cross', cx, front + 4.9, 2.2, BRASS[3]);
      for (let x = 9.4; x < 27; x += 0.9) line(g, x, by - 2.6, x + 0.1, by - 2.0, BRASS[3], 0.18);
      // candlesticks, crucifix, chalice and missal
      for (const x of [5, 31]) candlestick(g, x, top + 1.4, 3.8, true);
      g.fillStyle = lin(g, cx - 1.8, 0, cx + 1.8, 0, [[0, BRASS[4]], [1, BRASS[1]]]);
      g.beginPath(); g.moveTo(cx - 1.8, top + 1.4); g.lineTo(cx + 1.8, top + 1.4); g.lineTo(cx + 1.0, top - 0.4); g.lineTo(cx - 1.0, top - 0.4); g.closePath(); g.fill();
      emblem(g, 'cross', cx, 4.8, 4.4, BRASS[3]);
      for (const [x, y] of [[cx, 0.9], [cx - 3.2, 3.2], [cx + 3.2, 3.2]]) ellipse(g, x, y, 0.5, 0.5, BRASS[5]);
      goblet(g, 12, top + 1.6, BRASS, 0.85);
      openBook(g, 21.2, top - 1.6, 6.4, 2.8, rng, '#4a1a1a');
      return (gg) => { for (const x of [5, 31]) glow(gg, x, top + 1.4 - 2.2 - 3.8 - 0.9, 3.6, '#ffd58a', 0.45); };
    }, { seed: k.seed, under: (g) => contact(g, cx + 1, by - 0.3, 18, 2, 0.4) }),
    solid: { w: 34, h: 10 },
    light: { x: 0, y: -18, r: 50, color: '#ffd58a', flicker: true, intensity: 0.6 },
    anim: 'candle',
  };
}

function pewProp(k: K): PropInfo {
  const W = 36, H = 15, cx = 18, by = 13.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#5e4028';
      // seen from behind: the back of the backrest with its hymnal ledge, carved bench ends
      g.fillStyle = lin(g, 0, by - 2.6, 0, by, [[0, 'rgba(8,5,3,0.8)'], [1, 'rgba(8,5,3,0.5)']]); g.fillRect(3, by - 2.6, 30, 2.6);
      planks(g, 3.2, 3.3, 29.6, by - 2.6 - 3.3, 6, col, rng, true, 0.12);
      for (const [x0, x1] of [[4.2, 13], [13.6, 22.4], [23, 31.8]]) {
        roundRect(g, x0, 5.2, x1 - x0, by - 4.4 - 5.2, 0.5, lin(g, x0, 5, x1, by - 4, [[0, dim(col, 0.12)], [1, lit(col, 0.06)]]));
        g.strokeStyle = rgba(lit(col, 0.45), 0.5); g.lineWidth = 0.2;
        g.beginPath(); g.moveTo(x0 + 0.2, by - 4.6); g.lineTo(x0 + 0.2, 5.4); g.lineTo(x1 - 0.2, 5.4); g.stroke();
        g.strokeStyle = rgba(dim(col, 0.6), 0.6);
        g.beginPath(); g.moveTo(x1 - 0.2, 5.4); g.lineTo(x1 - 0.2, by - 4.6); g.lineTo(x0 + 0.2, by - 4.6); g.stroke();
      }
      // book ledge with a psalter lying on it
      board(g, 3.2, 7.2, 29.6, 0.7, lit(col, 0.3), rng, { knots: 0 });
      board(g, 3.2, 7.9, 29.6, 0.6, dim(col, 0.2), rng, { knots: 0 });
      flatBook(g, 9 + rng.next() * 3, 5.9, 3.2, 1.6, CLOTH.red, rng, 0);
      if (rng.next() < 0.6) flatBook(g, 22 + rng.next() * 4, 5.9, 3.0, 1.5, CLOTH.brown, rng, 0);
      // top rail
      roundRect(g, 2.4, 2.2, 31.2, 1.5, 0.7, lin(g, 0, 2.2, 0, 3.7, [[0, lit(col, 0.45)], [0.5, col], [1, dim(col, 0.35)]]));
      // bench ends with poppy-head tops
      for (const [x, d] of [[2.2, 0], [33.8, 0.25]] as const) {
        board(g, x - 1.35, 2.8, 2.7, by - 2.8, dim(col, d), rng, { vertical: true, knots: 0 });
        const t = () => { g.beginPath(); g.moveTo(x - 1.35, 2.9); g.quadraticCurveTo(x - 1.6, 0.4, x, 0.6); g.quadraticCurveTo(x + 1.6, 0.4, x + 1.35, 2.9); g.closePath(); };
        fillPath(g, t, lin(g, x - 1.4, 0.4, x + 1.4, 2.9, [[0, lit(col, 0.4 - d)], [1, dim(col, 0.3 + d)]]));
        ellipse(g, x, 1.6, 0.5, 0.45, dim(col, 0.4));
      }
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.2, 17.5, 1.6, 0.4) }),
    solid: { w: 32, h: 5 },
  };
}

// ---------------------------------------------------------------- lights

function candleProp(k: K): PropInfo {
  const W = 8, H = 13, cx = 4, by = 11.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const top = by - 6.7;
      g.strokeStyle = lin(g, cx + 2, 0, cx + 3.8, 0, [[0, BRASS[4]], [1, BRASS[1]]]); g.lineWidth = 0.4;
      g.beginPath(); g.ellipse(cx + 2.9, by - 1.35, 0.75, 0.62, 0, 0, TAU); g.stroke();
      discSide(g, cx, by - 1.1, 3.0, 0.95, 0.55, lin(g, cx - 3, 0, cx + 3, 0, [[0, BRASS[3]], [0.3, BRASS[4]], [1, BRASS[1]]]));
      ellipse(g, cx, by - 1.1, 3.0, 0.95, lin(g, cx - 3, by - 2, cx + 3, by, [[0, BRASS[4]], [1, BRASS[2]]]));
      ellipse(g, cx, by - 1.05, 2.2, 0.6, lin(g, cx - 2, by - 1.6, cx + 2, by - 0.4, [[0, BRASS[2]], [1, BRASS[4]]]));
      g.fillStyle = lin(g, cx - 0.85, 0, cx + 0.85, 0, [[0, '#fdf8ea'], [0.35, '#efe6cc'], [1, '#b4a688']]);
      g.fillRect(cx - 0.85, top, 1.7, by - 1.15 - top);
      ellipse(g, cx, by - 1.15, 0.85, 0.3, '#c8baa0');
      for (const [dx, len] of [[-0.55, 1.7], [0.3, 2.6], [0.68, 1.2]]) {
        g.fillStyle = lin(g, cx + dx - 0.2, 0, cx + dx + 0.2, 0, [[0, '#fffaf0'], [1, '#cfc2a4']]);
        roundRect(g, cx + dx - 0.2, top + 0.1, 0.4, len, 0.2);
        g.fill();
      }
      ellipse(g, cx - 0.62, by - 1.9, 0.5, 0.25, '#ece2c8');
      ellipse(g, cx, top, 0.85, 0.3, '#fbf3dc');
      ellipse(g, cx, top + 0.05, 0.55, 0.17, '#e2d0a4');
      line(g, cx, top, cx + 0.08, top - 0.55, '#241810', 0.14);
      g.fillStyle = lin(g, 0, top, 0, top + 2.6, [[0, 'rgba(255,196,110,0.5)'], [1, 'rgba(255,196,110,0)']]);
      g.fillRect(cx - 0.86, top, 1.72, 2.6);
      return (gg) => glow(gg, cx, top - 1.4, 3.2, '#ffd58a', 0.3);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.4, by - 0.6, 3.8, 1.0, 0.35) }),
    light: { x: 0, y: -8, r: 30, color: '#ffd58a', flicker: true, intensity: 0.5 },
    anim: 'candle',
  };
}

function candelabraProp(k: K): PropInfo {
  const W = 14, H = 27, cx = 7, by = 25.5;
  const cups: [number, number][] = [[cx - 4.5, by - 16.4], [cx, by - 17.6], [cx + 4.5, by - 16.4]];
  return {
    sprite: art(W, H, cx, by, (g) => {
      const pal = BRASS;
      const metal = (x0: number, x1: number) => lin(g, x0, 0, x1, 0, [[0, pal[4]], [0.45, pal[3]], [1, pal[1]]]);
      // three curled feet
      for (const [fx, fy, d] of [[cx + 0.8, by - 1.5, 0.25], [cx - 4.3, by - 0.3, 0], [cx + 4.3, by - 0.3, 0.1]] as const) {
        g.strokeStyle = metal(Math.min(cx, fx) - 0.5, Math.max(cx, fx) + 0.5); g.lineWidth = 0.6;
        g.beginPath(); g.moveTo(cx, by - 2.6); g.quadraticCurveTo(fx, by - 2.6 - d, fx, fy); g.stroke();
        ellipse(g, fx, fy, 0.55, 0.45, ballShade(g, fx, fy, 0.55, pal[3], 0.6, 0.5));
      }
      // stem with knops
      g.fillStyle = metal(cx - 0.42, cx + 0.42);
      g.fillRect(cx - 0.4, by - 17.4, 0.8, 15);
      for (const ky of [by - 2.7, by - 7.4, by - 11.6]) ellipse(g, cx, ky, 1.05, 0.72, ballShade(g, cx, ky, 1.05, pal[3], 0.6, 0.55));
      // curved arms
      g.strokeStyle = metal(cx - 5, cx + 5); g.lineWidth = 0.55;
      g.beginPath();
      g.moveTo(cx, by - 13.4); g.quadraticCurveTo(cx - 4.8, by - 13.2, cx - 4.5, by - 16.3);
      g.moveTo(cx, by - 13.4); g.quadraticCurveTo(cx + 4.8, by - 13.2, cx + 4.5, by - 16.3);
      g.stroke();
      ellipse(g, cx, by - 13.4, 0.8, 0.55, ballShade(g, cx, by - 13.4, 0.8, pal[3], 0.6, 0.5));
      for (const [x, y] of cups) {
        ellipse(g, x, y, 1.25, 0.42, lin(g, x - 1.2, 0, x + 1.2, 0, [[0, pal[5]], [1, pal[1]]]));
        const h = x === cx ? 3.4 : 3.0;
        g.fillStyle = lin(g, x - 0.42, 0, x + 0.42, 0, [[0, '#fdf8ea'], [0.4, '#ece2c8'], [1, '#b4a688']]);
        g.fillRect(x - 0.42, y - h, 0.84, h - 0.1);
        ellipse(g, x, y - h, 0.42, 0.15, '#fbf3dc');
        g.fillStyle = 'rgba(255,200,120,0.45)'; g.fillRect(x - 0.42, y - h, 0.84, 1.2);
        line(g, x, y - h, x + 0.05, y - h - 0.4, '#241810', 0.12);
        smallFlame(g, x + 0.05, y - h - 0.35, 1.9);
      }
      return (gg) => { for (const [x, y] of cups) glow(gg, x, y - (x === cx ? 3.4 : 3.0) - 1.2, 2.8, '#ffe0a0', 0.45); };
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.5, by - 0.5, 5, 1.2, 0.38) }),
    solid: { w: 6, h: 3 },
    light: { x: 0, y: -18, r: 45, color: '#ffd58a', flicker: true, intensity: 0.7 },
    anim: 'candle',
  };
}

function torchProp(k: K): PropInfo {
  const W = 10, H = 16, cx = 5, by = 14.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      ellipse(g, cx, by - 0.1, 1.9, 0.55, '#4a3624');
      // the shaft, pitch-dark where it meets the head
      g.fillStyle = lin(g, cx - 0.65, 0, cx + 0.75, 0, [[0, '#8a6a44'], [0.35, '#6e5032'], [1, '#3a2818']]);
      g.beginPath(); g.moveTo(cx - 0.55, by); g.lineTo(cx - 0.72, by - 5); g.lineTo(cx + 0.72, by - 5); g.lineTo(cx + 0.55, by); g.closePath(); g.fill();
      g.save(); clipRect(g, cx - 0.8, by - 5, 1.6, 5); grainLines(g, cx - 0.8, by - 5, 1.6, 5, '#6e5032', rng, true, 0.6); g.restore();
      ironBar(g, cx - 0.9, by - 4.6, 1.8, 0.55);
      // the head: pitch-soaked rags bound round the end, burning at the top
      const head = () => { g.beginPath(); g.moveTo(cx - 0.8, by - 4.2); g.quadraticCurveTo(cx - 1.9, by - 5.4, cx - 1.6, by - 7.2); g.quadraticCurveTo(cx, by - 7.9, cx + 1.6, by - 7.2); g.quadraticCurveTo(cx + 1.9, by - 5.4, cx + 0.8, by - 4.2); g.closePath(); };
      fillPath(g, head, lin(g, cx - 1.9, 0, cx + 1.9, 0, [[0, '#5a4430'], [0.4, '#3a2a1e'], [1, '#161008']]));
      g.save(); head(); g.clip();
      g.strokeStyle = 'rgba(12,8,4,0.7)'; g.lineWidth = 0.2;
      for (let y = by - 7; y < by - 4.2; y += 0.7) { g.beginPath(); g.moveTo(cx - 2, y + 0.5); g.lineTo(cx + 2, y - 0.2); g.stroke(); }
      g.fillStyle = lin(g, 0, by - 7.8, 0, by - 5.2, [[0, 'rgba(255,170,70,0.95)'], [0.5, 'rgba(210,70,20,0.6)'], [1, 'rgba(90,20,6,0)']]);
      g.fillRect(cx - 2, by - 7.9, 4, 2.8);
      for (let i = 0; i < 6; i++) ellipse(g, cx + (rng.next() - 0.5) * 2.6, by - 6.2 + (rng.next() - 0.5) * 1.4, 0.25, 0.15, EMBER[4]);
      g.restore();
      return (gg) => { glow(gg, cx, by - 6.6, 2.6, '#ffc070', 0.35); };
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.4, by - 0.2, 2.4, 0.8, 0.4) }),
    light: { x: 0, y: -11, r: 58, color: '#ffa04a', flicker: true, intensity: 0.85 },
    anim: 'fire',
    wall: true,
  };
}

// ---------------------------------------------------------------- on the walls

function bannerProp(k: K): PropInfo {
  const W = 14, H = 27, cx = 7, by = 25.5;
  const c = hexOr(k.opt, CLOTH.green);
  const dark = c === CLOTH.black || c === CLOTH.charcoal;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      // cord from the nail to the rod ends
      g.strokeStyle = '#8a7048'; g.lineWidth = 0.25;
      g.beginPath(); g.moveTo(1.6, 2.4); g.lineTo(cx, 0.4); g.lineTo(W - 1.6, 2.4); g.stroke();
      rivet(g, cx, 0.45, 0.3);
      const x0 = 1.8, x1 = W - 1.8, bot = 21.2, tip = 25.0;
      const cloth = () => { g.beginPath(); g.moveTo(x0, 2.6); g.lineTo(x1, 2.6); g.lineTo(x1 + 0.1, bot); g.lineTo(cx, tip); g.lineTo(x0 - 0.1, bot); g.closePath(); };
      fillPath(g, cloth, lin(g, x0, 2, x1, tip, [[0, lit(c, dark ? 0.2 : 0.3)], [0.5, c], [1, dim(c, 0.4)]]));
      g.save(); cloth(); g.clip();
      weave(g, x0, 2, x1, tip, c, 0.4, dark ? 0.08 : 0.1);
      folds(g, x0, 2, x1, tip, dark ? '#6a6460' : c, rng, 4, true, dark ? 0.2 : 0.3);
      g.fillStyle = lin(g, 0, 2.5, 0, 5, [[0, 'rgba(8,5,3,0.4)'], [1, 'rgba(8,5,3,0)']]);
      g.fillRect(x0, 2.5, x1 - x0, 2.5);
      g.restore();
      // gold trim following the edge
      g.strokeStyle = rgba(BRASS[3], 0.9); g.lineWidth = 0.3;
      g.beginPath(); g.moveTo(x0 + 0.8, 3.6); g.lineTo(x0 + 0.8, bot - 0.2); g.lineTo(cx, tip - 1.3); g.lineTo(x1 - 0.8, bot - 0.2); g.lineTo(x1 - 0.8, 3.6); g.stroke();
      if (dark) emblem(g, 'raven', cx, 11.8, 3.3, '#cfc6b2');
      else emblem(g, 'cross', cx, 11.6, 3.4, BRASS[3]);
      // tassel at the point
      line(g, cx, tip - 0.1, cx, tip + 0.4, BRASS[2], 0.3);
      // rod with knobs, tabs of cloth looped over it
      g.fillStyle = lin(g, 0, 1.9, 0, 3.1, [[0, lit(OAK, 0.4)], [1, dim(OAK, 0.4)]]);
      g.fillRect(0.9, 1.9, W - 1.8, 1.1);
      for (const x of [0.8, W - 0.8]) ellipse(g, x, 2.45, 0.75, 0.75, ballShade(g, x, 2.45, 0.75, BRASS[3], 0.6, 0.5));
      for (let x = x0 + 0.6; x < x1; x += 2.4) roundRect(g, x, 1.6, 1.2, 1.8, 0.4, lin(g, 0, 1.6, 0, 3.4, [[0, lit(c, 0.3)], [1, dim(c, 0.3)]]));
    }, { seed: k.seed, rim: 0.5 }),
    wall: true,
  };
}

function windowProp(k: K): PropInfo {
  const W = 16, H = 18, cx = 8, by = 16.5;
  const night = k.opt === 'night';
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const f0 = 1.1, f1 = W - 1.1, t0 = 1.0, b0 = 12.6;
      const frame = '#4e3726';
      roundRect(g, f0, t0, f1 - f0, b0 - t0, 0.3, lin(g, f0, t0, f1, b0, [[0, lit(frame, 0.2)], [1, dim(frame, 0.35)]]));
      g.save(); clipRect(g, f0, t0, f1 - f0, b0 - t0); grainLines(g, f0, t0, f1 - f0, b0 - t0, frame, rng, true, 0.5); g.restore();
      // the deep reveal of the wall
      const r0 = f0 + 1.3, r1 = f1 - 1.3, rt = t0 + 1.3, rb = b0 - 1.0, d = 0.9;
      const pl = '#c8bca0';
      poly(g, [r0, rt, r1, rt, r1 - d, rt + d, r0 + d, rt + d], dim(pl, 0.45));
      poly(g, [r0, rt, r0 + d, rt + d, r0 + d, rb - d * 0.4, r0, rb], dim(pl, 0.15));
      poly(g, [r1, rt, r1 - d, rt + d, r1 - d, rb - d * 0.4, r1, rb], dim(pl, 0.3));
      poly(g, [r0, rb, r0 + d, rb - d * 0.4, r1 - d, rb - d * 0.4, r1, rb], lit(pl, 0.15));
      // leaded glass
      const gx0 = r0 + d, gx1 = r1 - d, gy0 = rt + d, gy1 = rb - d * 0.4;
      g.fillStyle = night ? lin(g, 0, gy0, 0, gy1, [[0, '#26324e'], [0.6, '#172036'], [1, '#0e1424']])
        : lin(g, 0, gy0, 0, gy1, [[0, '#e2eef4'], [0.4, '#b0cddc'], [0.72, '#98b8b0'], [1, '#86a484']]);
      g.fillRect(gx0, gy0, gx1 - gx0, gy1 - gy0);
      g.save(); clipRect(g, gx0, gy0, gx1 - gx0, gy1 - gy0);
      if (!night) { ellipse(g, gx0 + 2, gy1 - 0.9, 3.2, 1.1, 'rgba(90,130,80,0.5)'); ellipse(g, gx1 - 1.5, gy1 - 0.6, 2.8, 1.0, 'rgba(70,110,70,0.5)'); }
      else { ellipse(g, gx1 - 1.9, gy0 + 1.6, 0.8, 0.8, 'rgba(230,236,250,0.55)'); for (let i = 0; i < 4; i++) ellipse(g, gx0 + rng.next() * (gx1 - gx0), gy0 + rng.next() * 3.5, 0.12, 0.12, 'rgba(240,240,255,0.8)'); }
      g.strokeStyle = night ? 'rgba(0,0,0,0.6)' : 'rgba(40,40,46,0.7)'; g.lineWidth = 0.14;
      for (let t = -20; t < 20; t += 1.5) {
        g.beginPath(); g.moveTo(gx0 + t, gy0); g.lineTo(gx0 + t + 20, gy0 + 20); g.stroke();
        g.beginPath(); g.moveTo(gx1 - t, gy0); g.lineTo(gx1 - t - 20, gy0 + 20); g.stroke();
      }
      g.fillStyle = night ? 'rgba(160,180,220,0.12)' : 'rgba(255,255,255,0.35)';
      g.beginPath(); g.moveTo(gx0 + 0.4, gy0 + 3.4); g.lineTo(gx0 + 3.4, gy0 + 0.4); g.lineTo(gx0 + 4.6, gy0 + 0.4); g.lineTo(gx0 + 0.4, gy0 + 4.6); g.closePath(); g.fill();
      g.restore();
      // mullion and transom
      beam(g, cx - 0.5, gy0, 1.0, gy1 - gy0, frame, rng);
      beam(g, gx0, (gy0 + gy1) / 2 - 0.45, gx1 - gx0, 0.9, frame, rng);
      // sill
      board(g, f0 - 0.6, b0 - 0.3, f1 - f0 + 1.2, 1.1, lit('#6a4a30', 0.3), rng, { knots: 0 });
      board(g, f0 - 0.6, b0 + 0.8, f1 - f0 + 1.2, 0.9, dim('#6a4a30', 0.25), rng, { knots: 0 });
      g.fillStyle = lin(g, 0, b0 + 1.7, 0, b0 + 3.2, [[0, 'rgba(10,6,4,0.35)'], [1, 'rgba(10,6,4,0)']]);
      g.fillRect(f0, b0 + 1.7, f1 - f0, 1.5);
    }, { seed: k.seed }),
    wall: true,
  };
}

function hangingHerbsProp(k: K): PropInfo {
  const W = 22, H = 16, cx = 11, by = 14.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      g.strokeStyle = '#8a7048'; g.lineWidth = 0.22;
      g.beginPath(); g.moveTo(3, 1.2); g.lineTo(1.6, 3.2); g.moveTo(19, 1.2); g.lineTo(20.4, 3.2); g.stroke();
      rivet(g, 3, 1.1, 0.28); rivet(g, 19, 1.1, 0.28);
      const xs = [2.9, 6.2, 9.5, 12.8, 16.1, 19.3];
      const kinds = [0, 1, 2, 3, 4, 5].sort(() => rng.next() - 0.5);
      xs.forEach((x, i) => herbBundle(g, x + (rng.next() - 0.5) * 0.4, 3.8, 6 + rng.next() * 2.6, kinds[i], rng));
      g.fillStyle = lin(g, 0, 2.6, 0, 3.8, [[0, lit(OAK, 0.4)], [0.5, OAK], [1, dim(OAK, 0.4)]]);
      g.fillRect(0.6, 2.6, W - 1.2, 1.2);
    }, { seed: k.seed, rim: 0.5 }),
    wall: true,
  };
}

/** A bundle of drying herbs tied at the top: a fan of leafy stems hanging down, flower heads at the tips. */
const HERB_KINDS: { leaf: string; head?: string }[] = [
  { leaf: '#5a8a3a' }, // mint
  { leaf: '#8e9c7e' }, // sage
  { leaf: '#66764e', head: '#8a70b8' }, // lavender
  { leaf: '#5e7a34', head: '#e0b83a' }, // tansy
  { leaf: '#3e6228' }, // nettle
  { leaf: '#5a7040', head: '#b4ae62' }, // hops
];
function herbBundle(g: G, x: number, y: number, len: number, kind: number, rng: RNG) {
  const k = HERB_KINDS[kind % HERB_KINDS.length];
  const pal = [dim(k.leaf, 0.45), dim(k.leaf, 0.15), k.leaf, lit(k.leaf, 0.35)];
  line(g, x, y - 0.4, x, y + 0.7, '#b09a70', 0.18);
  const stems = 6;
  const leaves: [number, number, number, number][] = [];
  const tips: [number, number][] = [];
  for (let i = 0; i < stems; i++) {
    const sp = (i / (stems - 1) - 0.5) * 2 + (rng.next() - 0.5) * 0.3;
    const x0 = x, y0 = y + 0.8, x1 = x + sp * 0.5, y1 = y + len * 0.45, x2 = x + sp * (1.4 + rng.next() * 0.5), y2 = y + len * (0.82 + rng.next() * 0.2);
    g.strokeStyle = rgba('#4a3e24', 0.85); g.lineWidth = 0.13;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x1, y1, x2, y2); g.stroke();
    tips.push([x2, y2]);
    for (let t = 0.3; t <= 1.001; t += 0.12) {
      const px = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * x1 + t * t * x2;
      const py = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * y1 + t * t * y2;
      for (const side of [-1, 1]) {
        if (rng.next() < 0.2) continue;
        const lx = px + side * (0.35 + rng.next() * 0.2), ly = py + 0.25;
        const L = 0.6 - (lx - x) * 0.28 - t * 0.35 + (rng.next() - 0.5) * 0.35;
        leaves.push([lx, ly, clamp(Math.round(L * 3), 0, 3), side]);
      }
    }
  }
  leaves.sort((p, q) => p[2] - q[2]);
  for (const [lx, ly, i, side] of leaves) ellipse(g, lx, ly, 0.3, 0.75, pal[i], side * 0.45);
  if (k.head) for (const [tx, ty] of tips) {
    for (let j = 0; j < 4; j++) ellipse(g, tx + (rng.next() - 0.5) * 0.5, ty - 0.5 + j * 0.42, 0.34, 0.3, j < 2 ? lit(k.head, 0.2) : dim(k.head, 0.2));
  }
  roundRect(g, x - 0.75, y + 0.2, 1.5, 0.75, 0.3, lin(g, 0, y + 0.2, 0, y + 0.95, [[0, '#d8b878'], [1, '#8a6a3a']]));
}

function rugProp(k: K): PropInfo {
  const W = 38, H = 26, cx = 19, by = 24.5;
  const c = mix(hexOr(k.opt, CLOTH.crimson), '#5a4632', 0.14);
  const accent = k.opt === CLOTH.green || k.opt === CLOTH.forest ? '#6e3024' : k.opt === CLOTH.russet || k.opt === CLOTH.madder ? '#2e4644' : '#2a3450';
  const gold = '#b48e48';
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const x0 = 2.4, x1 = 35.6, y0 = 1.4, y1 = 24.0;
      for (let y = y0 + 0.3; y < y1 - 0.1; y += 0.5) {
        line(g, x0 + 0.2, y, x0 - 1.4 - rng.next() * 0.4, y + (rng.next() - 0.5) * 0.3, '#e6dcc2', 0.2);
        line(g, x1 - 0.2, y, x1 + 1.4 + rng.next() * 0.4, y + (rng.next() - 0.5) * 0.3, '#d8ccb0', 0.2);
      }
      const band = (i: number, col: string | CanvasGradient) => { g.fillStyle = col; g.fillRect(x0 + i, y0 + i, x1 - x0 - i * 2, y1 - y0 - i * 2); };
      band(0, dim(c, 0.45));
      band(1.1, mix(gold, c, 0.25));
      // a running border of small lozenges
      g.save();
      g.beginPath(); g.rect(x0 + 1.1, y0 + 1.1, x1 - x0 - 2.2, y1 - y0 - 2.2); g.rect(x0 + 2.8, y0 + 2.8, x1 - x0 - 5.6, y1 - y0 - 5.6); g.clip('evenodd');
      for (let x = x0 + 1.9; x < x1; x += 1.9) for (const y of [y0 + 1.95, y1 - 1.95]) poly(g, [x, y - 0.6, x + 0.6, y, x, y + 0.6, x - 0.6, y], dim(c, 0.35));
      for (let y = y0 + 3.2; y < y1 - 2; y += 1.9) for (const x of [x0 + 1.95, x1 - 1.95]) poly(g, [x, y - 0.6, x + 0.6, y, x, y + 0.6, x - 0.6, y], dim(c, 0.35));
      g.restore();
      band(2.8, dim(c, 0.55));
      band(3.2, c);
      // abrash: the dye lots differ from one row of knots to the next
      g.save(); clipRect(g, x0 + 3.2, y0 + 3.2, x1 - x0 - 6.4, y1 - y0 - 6.4);
      for (let y = y0 + 3.2; y < y1; y += 1.4 + rng.next() * 2) { g.fillStyle = rgba(rng.next() < 0.5 ? lit(c, 0.3) : dim(c, 0.3), 0.18); g.fillRect(x0, y, x1 - x0, 0.8 + rng.next() * 1.4); }
      // field ornaments: corner quarters, the central medallion, little stars
      const my = (y0 + y1) / 2;
      const loz = (x: number, y: number, rx: number, ry: number, col: string) => poly(g, [x, y - ry, x + rx, y, x, y + ry, x - rx, y], col);
      for (const [qx, qy] of [[x0 + 3.2, y0 + 3.2], [x1 - 3.2, y0 + 3.2], [x0 + 3.2, y1 - 3.2], [x1 - 3.2, y1 - 3.2]]) { loz(qx, qy, 3.6, 3, accent); loz(qx, qy, 2.2, 1.8, gold); }
      loz(cx, my, 8.4, 6.2, gold);
      loz(cx, my, 7.6, 5.5, accent);
      loz(cx, my, 5.4, 3.9, dim(c, 0.15));
      loz(cx, my, 3.4, 2.5, gold);
      loz(cx, my, 1.9, 1.4, accent);
      for (const d of [-1, 1]) { loz(cx + d * 11.5, my, 1.2, 1.6, gold); loz(cx + d * 11.5, my, 0.6, 0.8, accent); }
      for (let i = 0; i < 10; i++) { const sx = x0 + 5 + rng.next() * (x1 - x0 - 10), sy = y0 + 5 + rng.next() * (y1 - y0 - 10); if (Math.abs(sx - cx) < 9 && Math.abs(sy - my) < 7) continue; loz(sx, sy, 0.5, 0.5, rgba(gold, 0.7)); }
      g.restore();
      g.save(); clipRect(g, x0, y0, x1 - x0, y1 - y0);
      weave(g, x0, y0, x1, y1, c, 0.32, 0.08);
      g.fillStyle = lin(g, x0, y0, x1, y1, [[0, 'rgba(255,240,210,0.1)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.16)']]);
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (let i = 0; i < 3; i++) ellipse(g, x0 + 5 + rng.next() * (x1 - x0 - 10), y0 + 4 + rng.next() * (y1 - y0 - 8), 2 + rng.next() * 3, 1 + rng.next() * 1.5, 'rgba(255,240,220,0.06)');
      g.restore();
    }, { seed: k.seed, grain: 5, rim: 0.3, under: (g) => { g.fillStyle = rgba(SHADE, 0.25); g.fillRect(2.8, 2, 33.4, 22.6); } }),
    flat: true,
  };
}

// ---------------------------------------------------------------- roads, yards and churchyards

function signpostProp(k: K): PropInfo {
  const W = 26, H = 31, cx = 13, by = 29.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const bcol = '#86705a';
      post(g, cx, 3.0, by + 0.2, 2.6, GREY, rng, 'point');
      const arrow = (x0: number, x1: number, y: number, h: number, dir: number) => {
        const path = () => {
          g.beginPath();
          if (dir < 0) { g.moveTo(x1, y); g.lineTo(x0 + h * 0.6, y); g.lineTo(x0, y + h / 2); g.lineTo(x0 + h * 0.6, y + h); g.lineTo(x1, y + h); }
          else { g.moveTo(x0, y); g.lineTo(x1 - h * 0.6, y); g.lineTo(x1, y + h / 2); g.lineTo(x1 - h * 0.6, y + h); g.lineTo(x0, y + h); }
          g.closePath();
        };
        fillPath(g, path, lin(g, 0, y, 0, y + h, [[0, lit(bcol, 0.28)], [0.35, bcol], [1, dim(bcol, 0.38)]]));
        g.save(); path(); g.clip();
        grainLines(g, x0, y, x1 - x0, h, bcol, rng, false, 1);
        // carved letters
        let lx = dir < 0 ? x0 + h * 0.7 : x0 + 1.2;
        const end = dir < 0 ? x1 - 1.2 : x1 - h * 0.7;
        while (lx < end - 0.6) {
          const w = 0.5 + rng.next() * 0.7;
          const ly = y + h / 2 - 0.8;
          g.strokeStyle = 'rgba(30,20,12,0.75)'; g.lineWidth = 0.28;
          g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx + w * 0.3, ly + 1.6); g.lineTo(lx + w * 0.7, ly); if (rng.next() < 0.5) g.lineTo(lx + w, ly + 1.6); g.stroke();
          lx += w + 0.45;
        }
        g.fillStyle = rgba(lit(bcol, 0.55), 0.5); g.fillRect(x0, y, x1 - x0, 0.25);
        g.restore();
        const nx = dir < 0 ? x1 - 0.9 : x0 + 0.9;
        rivet(g, nx, y + 1, 0.2); rivet(g, nx, y + h - 1, 0.2);
      };
      arrow(0.8, cx + 1.2, 5.0, 4.4, -1);
      arrow(cx - 1.2, W - 0.8, 11.3, 4.2, 1);
      ellipse(g, cx, by - 0.1, 3.6, 0.9, '#5a4630');
      cobble(g, cx - 2.6, by - 0.4, 1.1, 0.7, STONE[3], rng);
      cobble(g, cx + 2.3, by - 0.2, 0.9, 0.6, STONE[2], rng);
      tufts(g, cx - 4.5, cx + 4.5, by, rng, 5);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.1, 4.2, 1.1, 0.4) }),
    solid: { w: 5, h: 4 },
  };
}

/** A pinned notice: parchment with writing, perhaps a seal or a sketched face. */
function notice(g: G, x: number, y: number, w: number, h: number, rot: number, kind: number, rng: RNG) {
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.rotate(rot);
  const p = () => { g.beginPath(); g.moveTo(-w / 2, -h / 2); g.lineTo(w / 2, -h / 2); g.lineTo(w / 2, h / 2 - 0.9); g.lineTo(w / 2 - 0.9, h / 2); g.lineTo(-w / 2, h / 2); g.closePath(); };
  g.fillStyle = 'rgba(10,6,4,0.35)';
  g.fillRect(-w / 2 + 0.35, -h / 2 + 0.45, w, h);
  fillPath(g, p, lin(g, -w / 2, -h / 2, w / 2, h / 2, [[0, '#f2e8d0'], [0.6, '#e0d2b2'], [1, '#bca886']]));
  poly(g, [w / 2, h / 2 - 0.9, w / 2 - 0.9, h / 2 - 0.9, w / 2 - 0.9, h / 2], '#a8946e');
  if (kind === 1) {
    // wanted: a crude face
    g.strokeStyle = 'rgba(40,28,18,0.8)'; g.lineWidth = 0.18;
    g.beginPath(); g.ellipse(0, -h * 0.14, w * 0.2, h * 0.19, 0, 0, TAU); g.stroke();
    ellipse(g, -w * 0.07, -h * 0.17, 0.2, 0.15, '#2a1c12'); ellipse(g, w * 0.07, -h * 0.17, 0.2, 0.15, '#2a1c12');
    line(g, -w * 0.08, -h * 0.05, w * 0.08, -h * 0.06, '#2a1c12', 0.15);
    for (let ly = h * 0.16; ly < h / 2 - 0.8; ly += 0.7) line(g, -w / 2 + 0.7, ly, w / 2 - 0.9 - rng.next() * 1.2, ly, rgba('#3a2a1e', 0.6), 0.14);
  } else {
    for (let ly = -h / 2 + 0.9; ly < h / 2 - 0.7; ly += 0.72) {
      let lx = -w / 2 + 0.6;
      while (lx < w / 2 - 0.8) { const ww = 0.3 + rng.next() * 1.1; line(g, lx, ly, Math.min(lx + ww, w / 2 - 0.7), ly, rgba('#3a2a1e', 0.6), 0.14); lx += ww + 0.3; }
    }
    if (kind === 2) { ellipse(g, w * 0.2, h / 2 - 1.1, 0.75, 0.7, rad(g, w * 0.15, h / 2 - 1.3, 0.05, w * 0.2, h / 2 - 1.1, 0.8, [[0, '#d84a3a'], [1, '#6a1410']])); line(g, w * 0.2, h / 2 - 0.5, w * 0.1, h / 2 + 0.6, '#8a1a14', 0.2); }
  }
  g.restore();
  rivet(g, x + w / 2 + Math.sin(rot) * h * 0.4, y + 0.55, 0.25);
}

function noticeboardProp(k: K): PropInfo {
  const W = 28, H = 31, cx = 14, by = 29.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#76624a';
      for (const [x, d] of [[4.3, 0], [23.7, 0.2]] as const) post(g, x, 4, by + 0.2, 2.3, dim(GREY, d), rng, 'none');
      planks(g, 1.8, 5.2, W - 3.6, 15.2, 6, col, rng, true, 0.14);
      g.fillStyle = lin(g, 1.8, 0, W - 1.8, 0, [[0, 'rgba(255,236,200,0.08)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.25)']]);
      g.fillRect(1.8, 5.2, W - 3.6, 15.2);
      notice(g, 3.4, 7.0, 5.8, 7.0, -0.06, 0, rng);
      notice(g, 10.4, 6.2, 6.4, 5.4, 0.04, 2, rng);
      notice(g, 18.2, 7.2, 5.8, 7.6, 0.07, 1, rng);
      notice(g, 5.4, 14.2, 5.4, 5.0, 0.05, 0, rng);
      notice(g, 12.6, 12.4, 5.0, 6.6, -0.05, 0, rng);
      beam(g, 1.2, 4.6, W - 2.4, 1.2, lit(col, 0.1), rng);
      beam(g, 1.2, 20.2, W - 2.4, 1.2, dim(col, 0.15), rng);
      beam(g, 1.2, 4.6, 1.2, 16.8, col, rng);
      beam(g, W - 2.4, 4.6, 1.2, 16.8, dim(col, 0.2), rng);
      // a little shingled roof over the board
      const roof = () => { g.beginPath(); g.moveTo(0.3, 5.3); g.lineTo(1.4, 0.9); g.lineTo(W - 1.4, 0.9); g.lineTo(W - 0.3, 5.3); g.closePath(); };
      fillPath(g, roof, '#4a3a2c');
      g.save(); roof(); g.clip();
      for (let r = 0; r < 3; r++) {
        const y = 0.9 + r * 1.5;
        for (let x = -1 + (r % 2) * 1.1; x < W; x += 2.2) {
          const cc = jitter('#6e5a44', rng, 0.08);
          g.fillStyle = lin(g, 0, y, 0, y + 1.9, [[0, dim(cc, 0.15)], [0.7, cc], [1, lit(cc, 0.2)]]);
          g.fillRect(x + 0.1, y, 2.0, 1.9);
        }
        g.fillStyle = 'rgba(10,6,4,0.3)'; g.fillRect(0, y + 1.75, W, 0.25);
      }
      g.fillStyle = lin(g, 0, 0, W, 0, [[0, 'rgba(255,236,200,0.1)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.3)']]);
      g.fillRect(0, 0, W, 6);
      g.restore();
      g.fillStyle = lin(g, 0, 5.3, 0, 7.3, [[0, 'rgba(10,6,4,0.45)'], [1, 'rgba(10,6,4,0)']]);
      g.fillRect(1.8, 5.3, W - 3.6, 2);
      tufts(g, 2, 6.5, by, rng, 3); tufts(g, 21.5, 26, by, rng, 3);
    }, { seed: k.seed, under: (g) => { contact(g, 4.6, by, 2.4, 0.8, 0.4); contact(g, 24, by, 2.4, 0.8, 0.4); contact(g, cx + 1, by - 0.4, 12, 1.2, 0.2); } }),
    solid: { w: 24, h: 4 },
  };
}

function graveProp(k: K, fresh: boolean): PropInfo {
  const W = 16, H = 24, cx = 8, by = 22.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      if (!fresh) {
        const st = (dx: number, dy: number) => { g.beginPath(); g.moveTo(3.6 + dx, 16.4 + dy); g.lineTo(3.6 + dx, 6.8 + dy); g.arc(cx + dx, 6.8 + dy, 4.4, Math.PI, 0); g.lineTo(12.4 + dx, 16.4 + dy); g.closePath(); };
        const sc = '#8e8a80';
        fillPath(g, () => st(0.9, -0.4), dim(sc, 0.45));
        fillPath(g, () => st(0, 0), lin(g, 3.6, 2, 12.4, 16, [[0, lit(sc, 0.3)], [0.5, sc], [1, dim(sc, 0.3)]]));
        g.save(); st(0, 0); g.clip();
        for (let i = 0; i < 40; i++) ellipse(g, 3.6 + rng.next() * 8.8, 2.4 + rng.next() * 14, 0.15 + rng.next() * 0.3, 0.12, rgba(rng.next() < 0.5 ? '#4a4640' : '#d8d2c6', 0.35));
        for (let i = 0; i < 6; i++) ellipse(g, 4 + rng.next() * 8, 3 + rng.next() * 12, 0.5 + rng.next() * 0.9, 0.4 + rng.next() * 0.5, rgba(rng.next() < 0.5 ? '#b0b070' : '#d8d4c0', 0.45));
        g.fillStyle = lin(g, 0, 12, 0, 16.4, [[0, 'rgba(40,60,20,0)'], [1, 'rgba(40,60,20,0.5)']]);
        g.fillRect(3, 12, 10, 4.5);
        g.restore();
        // carved cross and a line of lettering
        for (const [dx, col] of [[0.18, 'rgba(230,226,214,0.55)'], [0, 'rgba(30,28,24,0.75)']] as const) {
          g.strokeStyle = col; g.lineWidth = 0.55;
          g.beginPath(); g.moveTo(cx + dx, 4.4 + dx); g.lineTo(cx + dx, 10.2 + dx); g.moveTo(cx - 2.2 + dx, 6.3 + dx); g.lineTo(cx + 2.2 + dx, 6.3 + dx); g.stroke();
        }
        for (const [y, w] of [[12, 5], [13.4, 3.6]]) line(g, cx - w / 2, y, cx + w / 2, y, 'rgba(40,36,30,0.55)', 0.3);
        g.strokeStyle = rgba(lit(sc, 0.5), 0.6); g.lineWidth = 0.25;
        g.beginPath(); g.arc(cx, 6.8, 4.25, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
        // the grassy mound in front
        const mound = () => { g.beginPath(); g.moveTo(cx - 6.2, 21.6); g.quadraticCurveTo(cx - 7, 16.6, cx - 3.4, 16.2); g.lineTo(cx + 3.4, 16.2); g.quadraticCurveTo(cx + 7, 16.6, cx + 6.2, 21.6); g.quadraticCurveTo(cx, 22.8, cx - 6.2, 21.6); g.closePath(); };
        fillPath(g, mound, lin(g, 0, 16, 0, 22.6, [[0, '#4e7a34'], [0.5, '#3e6a2c'], [1, '#2c4e20']]));
        g.save(); mound(); g.clip();
        for (let i = 0; i < 110; i++) { const x = cx + (rng.next() - 0.5) * 14, y = 16 + rng.next() * 7; const L = 0.45 - (x - cx) / 16 - (y - 16) / 12; blade(g, x, y + 0.6, 0.9 + rng.next() * 0.6, -Math.PI / 2 + (rng.next() - 0.5) * 0.9, 0.2, 0.35, GRASS[clamp(Math.round(L * 4 + 1.5), 0, 4)]); }
        g.fillStyle = lin(g, 0, 19, 0, 22.6, [[0, 'rgba(10,20,6,0)'], [1, 'rgba(10,20,6,0.35)']]); g.fillRect(0, 19, W, 4);
        g.restore();
        tufts(g, 3, 13, 16.6, rng, 5, 1.8);
      } else {
        // fresh earth heaped over the grave, a rough wooden cross at its head
        post(g, cx, 1.2, 15.4, 1.8, '#7a624a', rng, 'point');
        slantBeam(g, cx - 4.2, 5.4, cx + 4.2, 5.2, 1.6, '#7a624a', rng);
        g.strokeStyle = '#b8a070'; g.lineWidth = 0.28;
        for (const d of [-0.5, 0, 0.5]) { g.beginPath(); g.moveTo(cx - 1, 4.5 + d); g.lineTo(cx + 1, 6.1 + d); g.stroke(); }
        const mound = () => { g.beginPath(); g.moveTo(cx - 5.4, 21.6); g.quadraticCurveTo(cx - 6.4, 17, cx - 3.6, 14.4); g.quadraticCurveTo(cx, 13.2, cx + 3.6, 14.4); g.quadraticCurveTo(cx + 6.4, 17, cx + 5.4, 21.6); g.quadraticCurveTo(cx, 23, cx - 5.4, 21.6); g.closePath(); };
        fillPath(g, mound, lin(g, 0, 13.4, 0, 22.8, [[0, '#8e6e4c'], [0.45, '#6e5238'], [1, '#3a2a1c']]));
        g.save(); mound(); g.clip();
        g.fillStyle = lin(g, cx - 6, 0, cx + 6, 0, [[0, 'rgba(255,230,190,0.14)'], [0.45, 'rgba(0,0,0,0)'], [1, 'rgba(10,6,20,0.35)']]); g.fillRect(0, 13, W, 10);
        g.strokeStyle = 'rgba(255,230,190,0.18)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(cx - 0.6, 14.4); g.quadraticCurveTo(cx - 1.2, 18, cx - 0.4, 21.8); g.stroke();
        for (let i = 0; i < 80; i++) { const x = cx + (rng.next() - 0.5) * 13, y = 13.6 + rng.next() * 8.6; const L = 0.6 - (x - cx) / 12 - (y - 14) / 9; cobble(g, x, y, 0.4 + rng.next() * 0.45, 0.28 + rng.next() * 0.28, L > 0.35 ? '#8e6e4c' : L > -0.05 ? '#6a4e34' : '#46321f', rng); }
        g.restore();
        if (k.opt === 'flowers') {
          // a posy of field flowers tied with a red thread
          for (let i = 0; i < 7; i++) line(g, cx - 3.6 + i * 0.25, 20.2 + i * 0.05, cx + 1.2 + i * 0.45, 16.4 + i * 0.25, '#3e6e28', 0.24);
          line(g, cx - 1.6, 19.1, cx - 0.9, 18.3, '#c8303a', 0.45);
          const cols = ['#f0cc40', '#f6f2e6', '#9a78c8', '#d8483a', '#f0cc40', '#f6f2e6', '#e890a8', '#6a8ae0'];
          cols.forEach((c, i) => {
            const fx = cx + 0.8 + (i % 4) * 1.05 + (rng.next() - 0.5) * 0.5, fy = 15.6 + Math.floor(i / 4) * 1.2 + (i % 2) * 0.4;
            for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU + i; ellipse(g, fx + Math.cos(a) * 0.5, fy + Math.sin(a) * 0.38, 0.45, 0.3, p < 3 ? lit(c, 0.18) : dim(c, 0.15), a); }
            ellipse(g, fx, fy, 0.24, 0.2, '#e0a030');
          });
          for (let i = 0; i < 6; i++) ellipse(g, cx - 4.5 + rng.next() * 9, 17.5 + rng.next() * 3.5, 0.3, 0.2, cols[i], rng.next() * 3);
        }
      }
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.8, 7.4, 2, 0.35) }),
    solid: { w: 10, h: 5 },
  };
}

function wayshrineProp(k: K): PropInfo {
  const W = 18, H = 37, cx = 9, by = 35.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const wash = '#e6dcc4';
      stoneBlock(g, 3.2, by - 2.4, 11.6, 2.4, STONE[3], rng, 0.4);
      g.fillStyle = lin(g, 0, by - 3.2, 0, by - 2.3, [[0, lit(STONE[4], 0.2)], [1, STONE[3]]]);
      g.fillRect(3.2, by - 3.1, 11.6, 0.8);
      // the whitewashed pillar
      g.fillStyle = lin(g, 5.3, 0, 12.7, 0, [[0, lit(wash, 0.2)], [0.3, wash], [0.75, dim(wash, 0.22)], [1, dim(wash, 0.4)]]);
      g.fillRect(5.3, 19.5, 7.4, by - 3.1 - 19.5);
      g.save(); clipRect(g, 5.3, 19.5, 7.4, by - 3.1 - 19.5);
      for (let i = 0; i < 4; i++) { const x = 5.6 + rng.next() * 6, y = 21 + rng.next() * 9; ellipse(g, x, y, 0.8 + rng.next(), 0.5 + rng.next() * 0.5, rgba('#8a6a50', 0.5)); }
      g.fillStyle = lin(g, 0, by - 8, 0, by - 3, [[0, 'rgba(90,80,50,0)'], [1, 'rgba(90,80,50,0.35)']]);
      g.fillRect(5, by - 8, 8, 5);
      g.restore();
      g.fillStyle = lin(g, 0, by - 4, 0, by - 3, [[0, lit(wash, 0.1)], [1, dim(wash, 0.35)]]);
      g.fillRect(4.8, by - 4.1, 8.4, 1.0);
      // the head: a little chapel with an arched niche
      g.fillStyle = lin(g, 3.6, 0, 14.4, 0, [[0, lit(wash, 0.2)], [0.35, wash], [1, dim(wash, 0.4)]]);
      g.fillRect(3.6, 10.4, 10.8, 10);
      g.fillStyle = lin(g, 0, 19.6, 0, 21, [[0, lit(wash, 0.2)], [1, dim(wash, 0.45)]]);
      g.fillRect(3.1, 19.6, 11.8, 1.4);
      const niche = () => { g.beginPath(); g.moveTo(5.9, 19.2); g.lineTo(5.9, 14.6); g.arc(cx, 14.6, 3.1, Math.PI, 0); g.lineTo(12.1, 19.2); g.closePath(); };
      fillPath(g, niche, lin(g, 0, 11.5, 0, 19.2, [[0, '#1e2a48'], [1, '#2e4068']]));
      g.save(); niche(); g.clip();
      for (let i = 0; i < 7; i++) ellipse(g, 6.3 + rng.next() * 5.4, 12 + rng.next() * 6, 0.14, 0.14, BRASS[4]);
      // the Virgin in her blue mantle, with a gilt halo
      ellipse(g, cx, 14.2, 1.6, 1.6, rad(g, cx - 0.5, 13.7, 0.1, cx, 14.2, 1.7, [[0, BRASS[5]], [1, BRASS[2]]]));
      const robe = () => { g.beginPath(); g.moveTo(cx, 14.6); g.quadraticCurveTo(cx - 2.4, 16, cx - 2.2, 19.3); g.lineTo(cx + 2.2, 19.3); g.quadraticCurveTo(cx + 2.4, 16, cx, 14.6); g.closePath(); };
      fillPath(g, robe, lin(g, cx - 2.2, 0, cx + 2.2, 0, [[0, '#6a8ac8'], [0.5, '#3a5aa0'], [1, '#1e3268']]));
      g.fillStyle = '#b8403a'; g.fillRect(cx - 0.5, 16.4, 1.0, 2.9);
      ellipse(g, cx, 14.4, 0.75, 0.85, '#e8c8a8');
      g.fillStyle = lin(g, 0, 11, 0, 14, [[0, 'rgba(5,5,12,0.55)'], [1, 'rgba(5,5,12,0)']]);
      g.fillRect(5, 11, 8, 3);
      g.restore();
      g.strokeStyle = rgba(dim(wash, 0.4), 0.7); g.lineWidth = 0.3; niche(); g.stroke();
      // a wreath of field flowers hung below the niche
      for (let i = 0; i < 12; i++) { const a = Math.PI * 0.1 + (i / 11) * Math.PI * 0.8; const x = cx + Math.cos(a) * 3.2, y = 19.2 + Math.sin(a) * 1.2; ellipse(g, x, y, 0.45, 0.35, i % 3 ? '#4e7a32' : ['#e8c040', '#f2eee0', '#c84a3a'][i % 9 === 0 ? 2 : (i / 3) % 2 ? 1 : 0]); }
      // a small pyramid roof of clay tiles and an iron cross
      const roof = () => { g.beginPath(); g.moveTo(1.8, 11.2); g.lineTo(cx, 4.2); g.lineTo(W - 1.8, 11.2); g.quadraticCurveTo(cx, 12.2, 1.8, 11.2); g.closePath(); };
      fillPath(g, roof, lin(g, 1.8, 4, W - 1.8, 11, [[0, '#c46a4a'], [0.5, '#9a4a32'], [1, '#5e2a1c']]));
      g.save(); roof(); g.clip();
      for (let r = 0; r < 5; r++) { const y = 5.2 + r * 1.35; for (let x = (r % 2) * 0.8; x < W; x += 1.6) { g.fillStyle = lin(g, x, 0, x + 1.5, 0, [[0, 'rgba(0,0,0,0.22)'], [0.4, 'rgba(255,220,190,0.14)'], [1, 'rgba(0,0,0,0.3)']]); g.beginPath(); g.moveTo(x + 0.1, y); g.lineTo(x + 1.5, y); g.lineTo(x + 1.5, y + 1.1); g.arc(x + 0.8, y + 1.1, 0.7, 0, Math.PI); g.closePath(); g.fill(); } }
      g.fillStyle = lin(g, cx, 0, W, 0, [[0, 'rgba(10,6,20,0)'], [1, 'rgba(10,6,20,0.4)']]);
      g.fillRect(cx, 3, W - cx, 10);
      g.restore();
      g.strokeStyle = lin(g, cx - 1.5, 0, cx + 1.5, 0, [[0, IRON[4]], [1, IRON[0]]]); g.lineWidth = 0.45;
      g.beginPath(); g.moveTo(cx, 4.6); g.lineTo(cx, 0.4); g.moveTo(cx - 1.3, 1.7); g.lineTo(cx + 1.3, 1.7); g.stroke();
      tufts(g, 3, 15, by, rng, 6);
      for (let i = 0; i < 4; i++) ellipse(g, 4 + rng.next() * 10, by - 0.3, 0.35, 0.3, ['#e8c040', '#f2eee0', '#9a78c8', '#d8483a'][i]);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.2, 6.6, 1.5, 0.42) }),
    solid: { w: 8, h: 4 },
  };
}

function pilloryProp(k: K): PropInfo {
  const W = 28, H = 27, cx = 14, by = 25.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      // a low platform
      board(g, 5.2, by - 3.4, 17.6, 1.2, lit(GREY, 0.2), rng, { knots: 0 });
      planks(g, 5.2, by - 2.2, 17.6, 2.2, 1, dim(GREY, 0.1), rng, false);
      post(g, cx, 4.2, by - 2.6, 3.0, GREY, rng, 'point');
      // the hinged yoke with its three holes
      const yoke = (y0: number, y1: number, upper: boolean) => {
        const path = () => {
          g.beginPath();
          g.moveTo(1.6, y0); g.lineTo(W - 1.6, y0); g.lineTo(W - 1.6, y1); g.lineTo(1.6, y1); g.closePath();
          for (const [hx, hr] of [[6, 1.15], [cx, 1.9], [W - 6, 1.15]]) { g.moveTo(hx + hr, 9.4); g.arc(hx, 9.4, hr, 0, TAU, true); }
        };
        g.save(); path(); g.clip('evenodd');
        board(g, 1.6, y0, W - 3.2, y1 - y0, upper ? GREY : dim(GREY, 0.08), rng, { knots: 1 });
        g.restore();
      };
      // the dark insides of the holes first
      for (const [hx, hr] of [[6, 1.15], [cx, 1.9], [W - 6, 1.15]]) ellipse(g, hx, 9.4, hr, hr, '#1a120c');
      yoke(6.0, 9.4, true);
      yoke(9.4, 12.8, false);
      g.strokeStyle = rgba(dim(GREY, 0.6), 0.8); g.lineWidth = 0.18;
      g.beginPath(); g.moveTo(1.6, 9.4); g.lineTo(W - 1.6, 9.4); g.stroke();
      for (const [hx, hr] of [[6, 1.15], [cx, 1.9], [W - 6, 1.15]]) { g.strokeStyle = rgba(lit(GREY, 0.5), 0.5); g.lineWidth = 0.2; g.beginPath(); g.arc(hx, 9.4, hr, 0.1, Math.PI * 0.9); g.stroke(); }
      // iron hinge on one end, hasp and lock on the other
      ironBar(g, 1.8, 7.0, 3.2, 0.8); ironBar(g, 1.8, 11.2, 3.2, 0.8);
      rivet(g, 2.4, 7.4, 0.2); rivet(g, 2.4, 11.6, 0.2);
      ironBar(g, W - 3.4, 8.2, 1.2, 3.2, true);
      g.strokeStyle = IRON[2]; g.lineWidth = 0.3;
      g.beginPath(); g.arc(W - 2.8, 12.8, 0.7, Math.PI, 0); g.stroke();
      roundRect(g, W - 3.7, 12.8, 1.8, 1.6, 0.3, lin(g, W - 3.7, 0, W - 1.9, 0, [[0, IRON[4]], [1, IRON[1]]]));
      tufts(g, 5, 23, by, rng, 4, 1.8);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.4, 10, 1.6, 0.42) }),
    solid: { w: 10, h: 4 },
  };
}

function dummyProp(k: K): PropInfo {
  const W = 18, H = 30, cx = 9, by = 28.5;
  const armored = k.opt === 'armored';
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const sack = '#a8926a';
      // cross-foot and post
      slantBeam(g, cx + 0.6, by - 2.8, cx - 0.4, by - 0.2, 1.4, dim(GREY, 0.35), rng);
      board(g, 2.6, by - 1.6, W - 5.2, 1.6, GREY, rng, { knots: 0 });
      post(g, cx, 18, by - 1.2, 1.8, GREY, rng, 'none');
      // crossbar arms with straw-stuffed fists
      board(g, 1.4, 12.1, W - 2.8, 1.4, GREY, rng, { knots: 0 });
      for (const x of [2.0, W - 2.0]) {
        ellipse(g, x, 12.8, 1.6, 1.4, rad(g, x - 0.5, 12.3, 0.1, x, 12.8, 1.7, [[0, lit(sack, 0.3)], [1, dim(sack, 0.4)]]));
        for (let i = 0; i < 4; i++) blade(g, x, 12.8, 1.2, (x < cx ? Math.PI : 0) + (rng.next() - 0.5) * 1.4, 0.2, 0.3, STRAW[4]);
        line(g, x + (x < cx ? 1 : -1), 11.6, x + (x < cx ? 1 : -1), 14, '#6a5030', 0.3);
      }
      // stuffed body
      const body = () => { g.beginPath(); g.moveTo(cx - 4.4, 11.4); g.quadraticCurveTo(cx - 5.2, 17, cx - 3.4, 21.8); g.lineTo(cx + 3.4, 21.8); g.quadraticCurveTo(cx + 5.2, 17, cx + 4.4, 11.4); g.quadraticCurveTo(cx, 10.2, cx - 4.4, 11.4); g.closePath(); };
      fillPath(g, body, rad(g, cx - 1.8, 14, 0.4, cx, 16.5, 7, [[0, lit(sack, 0.35)], [0.5, sack], [1, dim(sack, 0.5)]]));
      g.save(); body(); g.clip();
      weave(g, 0, 10, W, 22, sack, 0.45, 0.14);
      for (const y of [13.6, 19.4]) { g.fillStyle = lin(g, 0, y, 0, y + 0.9, [[0, '#b89a62'], [1, '#6a5030']]); g.fillRect(0, y, W, 0.9); g.strokeStyle = 'rgba(50,34,16,0.6)'; g.lineWidth = 0.12; for (let x = 3; x < 15; x += 0.5) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 0.35, y + 0.9); g.stroke(); } }
      g.strokeStyle = 'rgba(40,26,14,0.7)'; g.lineWidth = 0.3;
      g.beginPath(); g.moveTo(cx - 2.4, 15.2); g.lineTo(cx + 1.4, 17.4); g.stroke();
      g.restore();
      for (let i = 0; i < 12; i++) blade(g, cx - 3.2 + rng.next() * 6.4, 21.6, 1.2 + rng.next() * 1.4, Math.PI / 2 + (rng.next() - 0.5) * 0.9, 0.3, 0.3, STRAW[3 + Math.floor(rng.next() * 3)]);
      for (let i = 0; i < 3; i++) blade(g, cx - 1.9 + i * 0.4, 15.9 + i * 0.3, 1.2, -0.4 + rng.next() * 0.8, 0.2, 0.26, STRAW[5]);
      if (armored) {
        // a battered breastplate and an old kettle hat
        const plate = () => { g.beginPath(); g.moveTo(cx - 4.2, 11.8); g.quadraticCurveTo(cx, 10.9, cx + 4.2, 11.8); g.quadraticCurveTo(cx + 4.4, 16.8, cx + 2.8, 19.4); g.quadraticCurveTo(cx, 20.2, cx - 2.8, 19.4); g.quadraticCurveTo(cx - 4.4, 16.8, cx - 4.2, 11.8); g.closePath(); };
        fillPath(g, plate, lin(g, cx - 4.4, 0, cx + 4.4, 0, [[0, IRON[3]], [0.3, IRON[5]], [0.5, IRON[3]], [1, IRON[1]]]));
        g.save(); plate(); g.clip();
        line(g, cx, 11.2, cx, 20, rgba(IRON[5], 0.5), 0.25);
        g.fillStyle = lin(g, 0, 16, 0, 20, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.3)']]); g.fillRect(cx - 5, 16, 10, 4);
        for (let i = 0; i < 3; i++) ellipse(g, cx - 2 + rng.next() * 4, 13 + rng.next() * 5, 0.5, 0.3, rgba('#8a5a3a', 0.45));
        g.restore();
        for (const [x, y] of [[cx - 3.5, 12.4], [cx + 3.5, 12.4], [cx - 2.5, 18.7], [cx + 2.5, 18.7]]) rivet(g, x, y, 0.22);
        g.fillStyle = lin(g, 0, 19.2, 0, 20.4, [[0, '#7a5230'], [1, '#3e2814']]); g.fillRect(cx - 3.2, 19.3, 6.4, 1.1);
      }
      // sackcloth head, tied at the neck, with a painted face
      ellipse(g, cx, 6.5, 3.6, 3.9, rad(g, cx - 1.3, 5.1, 0.2, cx, 6.5, 4.1, [[0, lit(sack, 0.4)], [0.5, sack], [1, dim(sack, 0.5)]]));
      g.save(); g.beginPath(); g.ellipse(cx, 6.5, 3.6, 3.9, 0, 0, TAU); g.clip(); weave(g, cx - 4, 2, cx + 4, 11, sack, 0.45, 0.14); g.restore();
      g.strokeStyle = '#2a1c12'; g.lineWidth = 0.32;
      for (const ex of [cx - 1.3, cx + 1.3]) { g.beginPath(); g.moveTo(ex - 0.55, 5.8); g.lineTo(ex + 0.55, 6.8); g.moveTo(ex + 0.55, 5.8); g.lineTo(ex - 0.55, 6.8); g.stroke(); }
      g.lineWidth = 0.22; g.beginPath(); g.moveTo(cx - 1.4, 8.4); for (let i = 0; i <= 6; i++) g.lineTo(cx - 1.4 + i * 0.47, 8.4 + (i % 2 ? 0.28 : 0)); g.stroke();
      roundRect(g, cx - 1.8, 9.9, 3.6, 0.9, 0.4, lin(g, 0, 9.9, 0, 10.8, [[0, '#b89a62'], [1, '#5e4424']]));
      if (armored) {
        g.beginPath(); g.ellipse(cx, 4.8, 3.3, 2.6, 0, Math.PI, 0); g.lineTo(cx + 3.3, 4.8); g.closePath();
        g.fillStyle = lin(g, cx - 3.3, 0, cx + 3.3, 0, [[0, IRON[3]], [0.3, IRON[5]], [1, IRON[1]]]); g.fill();
        ellipse(g, cx, 5.0, 4.9, 1.0, lin(g, cx - 4.9, 0, cx + 4.9, 0, [[0, IRON[4]], [0.5, IRON[3]], [1, IRON[0]]]));
        ellipse(g, cx - 1.2, 3.2, 0.9, 0.5, 'rgba(255,255,255,0.35)');
      } else for (let i = 0; i < 6; i++) blade(g, cx + (rng.next() - 0.5) * 1.6, 3, 1.2 + rng.next(), -Math.PI / 2 + (rng.next() - 0.5) * 1.4, 0.3, 0.28, STRAW[4 + Math.floor(rng.next() * 2)]);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.6, 6.5, 1.5, 0.42) }),
    solid: { w: 8, h: 4 },
  };
}

function targetProp(k: K): PropInfo {
  const W = 20, H = 24, cx = 10, by = 22.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const ty = 9.8, r = 7.5;
      slantBeam(g, cx + 0.5, ty - 2, cx + 1.6, by - 3.6, 1.1, dim(GREY, 0.4), rng);
      // the straw butt, coil upon coil, with its thickness showing
      ellipse(g, cx + 0.7, ty + 0.6, r, r * 1.02, STRAW[1]);
      ellipse(g, cx, ty, r, r * 1.02, rad(g, cx - 2.6, ty - 3, 0.4, cx, ty, r * 1.1, [[0, STRAW[6]], [0.5, STRAW[4]], [1, STRAW[2]]]));
      g.save(); g.beginPath(); g.ellipse(cx, ty, r, r * 1.02, 0, 0, TAU); g.clip();
      for (let rr = r - 0.3; rr > 0.5; rr -= 0.75) {
        g.strokeStyle = rgba(STRAW[1], 0.45); g.lineWidth = 0.16;
        g.beginPath(); g.ellipse(cx, ty, rr, rr * 1.02, 0, 0, TAU); g.stroke();
        for (let a = 0; a < TAU; a += 0.5 / rr + 0.25) { const x = cx + Math.cos(a) * rr, y = ty + Math.sin(a) * rr; line(g, x, y, x + Math.cos(a + 1.3) * 0.5, y + Math.sin(a + 1.3) * 0.5, rgba(STRAW[6], 0.35), 0.12); }
      }
      g.restore();
      // painted canvas face
      const face = [[5.6, '#e6dcc4'], [4.4, '#a8322a'], [3.1, '#e6dcc4'], [1.9, '#a8322a'], [0.9, '#e0b040']] as const;
      for (const [rr, c] of face) ellipse(g, cx, ty, rr, rr * 1.02, lin(g, cx - rr, ty - rr, cx + rr, ty + rr, [[0, lit(c, 0.2)], [1, dim(c, 0.25)]]));
      g.save(); g.beginPath(); g.ellipse(cx, ty, 5.6, 5.7, 0, 0, TAU); g.clip(); weave(g, cx - 6, ty - 6, cx + 6, ty + 6, '#e6dcc4', 0.4, 0.1); g.restore();
      // two arrows stuck in
      for (const [ax, ay, dx, dy, fc] of [[cx + 1.6, ty - 1.4, 3.2, 2.6, '#f2eee4'], [cx - 2.4, ty + 2.2, -2.8, 2.9, '#c8302a']] as const) {
        ellipse(g, ax, ay, 0.3, 0.3, '#1a120a');
        line(g, ax, ay, ax + dx, ay + dy, '#8a6a44', 0.3);
        const ex = ax + dx, ey = ay + dy;
        blade(g, ex - dx * 0.25, ey - dy * 0.25, 1.4, Math.atan2(dy, dx) - 0.35, 0.1, 0.6, fc);
        blade(g, ex - dx * 0.25, ey - dy * 0.25, 1.4, Math.atan2(dy, dx) + 0.35, -0.1, 0.6, dim(fc, 0.2));
      }
      // easel legs in front
      slantBeam(g, cx - 3.2, ty + 3.4, cx - 6.8, by - 0.2, 1.2, GREY, rng);
      slantBeam(g, cx + 3.2, ty + 3.4, cx + 6.8, by - 0.2, 1.2, dim(GREY, 0.15), rng);
      board(g, cx - 5.6, by - 4.8, 11.2, 0.9, dim(GREY, 0.1), rng, { knots: 0 });
      tufts(g, 2, 18, by, rng, 4, 1.8);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.5, 7.6, 1.4, 0.4) }),
    solid: { w: 12, h: 4 },
  };
}

function weaponrackProp(k: K): PropInfo {
  const W = 28, H = 24, cx = 14, by = 22.5;
  const old = k.opt === 'old';
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = old ? '#6a5a48' : '#6e4c30';
      const rust = old ? 0.6 : 0;
      const steel = (x0: number, x1: number) => lin(g, x0, 0, x1, 0, old ? [[0, '#a88a6c'], [0.4, '#7e6048'], [1, '#3e2c20']] : [[0, IRON[4]], [0.35, IRON[5]], [0.6, IRON[3]], [1, IRON[1]]]);
      const shaft = (x: number, top: number, bottom: number, w = 0.75) => { g.fillStyle = lin(g, x - w / 2, 0, x + w / 2, 0, [[0, '#b08c60'], [0.4, '#86643e'], [1, '#4a3420']]); g.fillRect(x - w / 2, top, w, bottom - top); };
      // frame: uprights, the rail the weapons lean on, and the slotted foot
      for (const [x, d] of [[2.2, 0], [W - 2.2, 0.25]] as const) { post(g, x, 5.2, by, 1.9, dim(col, d), rng, 'round'); board(g, x - 1.9, by - 1.2, 3.8, 1.2, dim(col, d + 0.15), rng, { knots: 0 }); }
      board(g, 1.4, 9.0, W - 2.8, 1.3, lit(col, 0.12), rng, { knots: 0 });
      board(g, 1.4, 10.3, W - 2.8, 0.7, dim(col, 0.3), rng, { knots: 0 });
      g.fillStyle = 'rgba(8,5,3,0.5)'; g.fillRect(3.2, 17.9, W - 6.4, by - 1.2 - 17.9);
      board(g, 1.4, 16.2, W - 2.8, 1.7, lit(col, 0.1), rng, { knots: 0 });
      board(g, 1.4, by - 1.8, W - 2.8, 1.0, dim(col, 0.2), rng, { knots: 0 });
      // spear
      const spx = 5.6;
      if (old) { shaft(spx, 7.6, 16.6); poly(g, [spx - 0.38, 7.6, spx + 0.38, 7.6, spx + 0.2, 6.8, spx, 7.3, spx - 0.2, 6.5], '#c8a878'); }
      else {
        shaft(spx, 3.6, 16.6);
        poly(g, [spx, 0.2, spx + 1.0, 2.4, spx + 0.35, 4.0, spx - 0.35, 4.0, spx - 1.0, 2.4], steel(spx - 1, spx + 1));
        line(g, spx, 0.6, spx, 3.8, rgba(IRON[5], 0.7), 0.12);
        ironBar(g, spx - 0.5, 4.0, 1.0, 0.7);
      }
      // a sword standing hilt up
      const sx = 9.8;
      poly(g, [sx - 0.62, 8.2, sx + 0.62, 8.2, sx + 0.5, 16.4, sx, 17.2, sx - 0.5, 16.4], steel(sx - 0.62, sx + 0.62));
      line(g, sx, 8.6, sx, 15.8, old ? 'rgba(70,44,24,0.55)' : 'rgba(40,44,50,0.45)', 0.18);
      if (old) for (let i = 0; i < 5; i++) ellipse(g, sx + (rng.next() - 0.5) * 0.7, 9 + rng.next() * 7, 0.32, 0.45, rgba('#7a3a1a', 0.6));
      g.fillStyle = steel(sx - 2.2, sx + 2.2); g.fillRect(sx - 2.2, 7.4, 4.4, 0.85);
      ellipse(g, sx - 2.2, 7.82, 0.35, 0.45, old ? '#8a6a4a' : IRON[3]); ellipse(g, sx + 2.2, 7.82, 0.35, 0.45, old ? '#6a4a30' : IRON[2]);
      g.fillStyle = lin(g, sx - 0.42, 0, sx + 0.42, 0, [[0, '#7a5434'], [1, '#2e1c10']]); g.fillRect(sx - 0.4, 4.6, 0.8, 2.8);
      for (let y = 4.9; y < 7.3; y += 0.5) line(g, sx - 0.4, y, sx + 0.4, y + 0.25, 'rgba(20,10,4,0.6)', 0.1);
      ellipse(g, sx, 4.2, 0.8, 0.7, ballShade(g, sx, 4.2, 0.8, old ? '#8a6a4a' : BRASS[3], 0.6, 0.5));
      if (!old) {
        // halberd: axe blade, top spike and back hook
        const hx = 14.2;
        shaft(hx, 1.4, 16.6);
        poly(g, [hx, -0.3, hx + 0.5, 1.8, hx - 0.5, 1.8], steel(hx - 0.5, hx + 0.5));
        const axe = () => { g.beginPath(); g.moveTo(hx - 0.35, 2.2); g.quadraticCurveTo(hx - 3.4, 1.6, hx - 3.9, 3.8); g.quadraticCurveTo(hx - 3.6, 6.1, hx - 0.35, 5.9); g.closePath(); };
        fillPath(g, axe, steel(hx - 3.9, hx));
        g.strokeStyle = rgba(IRON[5], 0.8); g.lineWidth = 0.18; g.beginPath(); g.moveTo(hx - 3.6, 2.4); g.quadraticCurveTo(hx - 4.0, 3.8, hx - 3.5, 5.4); g.stroke();
        poly(g, [hx + 0.35, 2.8, hx + 2.1, 3.6, hx + 0.35, 4.6], steel(hx, hx + 2.1));
        ironBar(g, hx - 0.5, 5.9, 1.0, 0.8);
        // flanged mace
        const mx = 18.2;
        shaft(mx, 6.8, 16.6, 0.65);
        ellipse(g, mx, 5.4, 1.35, 1.6, steel(mx - 1.4, mx + 1.4));
        for (let i = -1; i <= 1; i++) poly(g, [mx + i * 0.8, 3.6, mx + i * 0.8 + 0.45, 5.4, mx + i * 0.8, 7.1, mx + i * 0.8 - 0.45, 5.4], steel(mx - 1.6, mx + 1.6));
        ellipse(g, mx, 3.5, 0.45, 0.32, IRON[4]);
        // a round shield hung on the upright
        const shx = 22.9, shy = 11.2, r = 3.9;
        ellipse(g, shx + 0.4, shy + 0.5, r, r, rgba(SHADE, 0.35));
        ellipse(g, shx, shy, r, r, lin(g, shx - r, shy - r, shx + r, shy + r, [[0, lit(CLOTH.red, 0.3)], [1, dim(CLOTH.red, 0.4)]]));
        g.save(); g.beginPath(); g.arc(shx, shy, r - 0.4, 0, TAU); g.clip();
        g.fillStyle = lin(g, shx - r, shy - r, shx + r, shy + r, [[0, '#ece2c8'], [1, '#9a8e76']]);
        g.fillRect(shx - r, shy - r, r, r); g.fillRect(shx, shy, r, r);
        g.restore();
        g.strokeStyle = lin(g, shx - r, shy - r, shx + r, shy + r, [[0, IRON[4]], [1, IRON[0]]]); g.lineWidth = 0.45;
        g.beginPath(); g.arc(shx, shy, r - 0.2, 0, TAU); g.stroke();
        ellipse(g, shx, shy, 1.1, 1.1, ballShade(g, shx, shy, 1.1, IRON[3], 0.7, 0.55));
        for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; rivet(g, shx + Math.cos(a) * (r - 0.2), shy + Math.sin(a) * (r - 0.2), 0.16); }
      } else {
        // a rusty axe, an empty slot and a split shield leaning at the end
        const ax = 16.4;
        shaft(ax, 5.2, 16.6);
        const axe = () => { g.beginPath(); g.moveTo(ax - 0.3, 5.0); g.quadraticCurveTo(ax - 3.0, 4.4, ax - 3.4, 6.2); g.quadraticCurveTo(ax - 3.2, 8.2, ax - 0.3, 8.0); g.closePath(); };
        fillPath(g, axe, steel(ax - 3.4, ax));
        const shx = 22.4, shy = 13.2, r = 3.6;
        ellipse(g, shx, shy, r, r, lin(g, shx - r, shy - r, shx + r, shy + r, [[0, '#8a7a62'], [1, '#3e342a']]));
        g.strokeStyle = 'rgba(20,14,10,0.8)'; g.lineWidth = 0.3;
        g.beginPath(); g.moveTo(shx - 0.4, shy - r); g.lineTo(shx + 0.3, shy - 0.6); g.lineTo(shx - 0.2, shy + r); g.stroke();
        g.strokeStyle = '#6a4a30'; g.lineWidth = 0.4; g.beginPath(); g.arc(shx, shy, r - 0.2, 0, TAU); g.stroke();
        ellipse(g, shx, shy, 0.9, 0.9, '#7a4a2a');
        // cobweb in the corner
        g.strokeStyle = 'rgba(230,230,225,0.35)'; g.lineWidth = 0.08;
        for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(3.2, 11.0); g.lineTo(3.2 + i * 0.9, 11.0 + (4 - i) * 0.9); g.stroke(); }
        for (let rr = 1; rr < 4; rr += 0.9) { g.beginPath(); g.arc(3.2, 11.0, rr, 0, Math.PI / 2); g.stroke(); }
      }
      if (rust) for (let i = 0; i < 6; i++) ellipse(g, 2 + rng.next() * (W - 4), 9 + rng.next() * 8, 0.6, 0.3, rgba('#3a3028', 0.4));
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.5, 13.5, 1.6, 0.4) }),
    solid: { w: 24, h: 5 },
    wall: true,
  };
}

function campfireProp(k: K): PropInfo {
  const W = 20, H = 15, cx = 10, by = 13.5;
  const cold = k.opt === 'cold';
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const ring = (front: boolean) => {
        for (let i = 0; i < 11; i++) {
          const a = (i / 11) * TAU + 0.15;
          if ((Math.sin(a) > 0.05) !== front) continue;
          cobble(g, cx + Math.cos(a) * 7.2, by - 3.4 + Math.sin(a) * 2.7, 1.45 + rng.next() * 0.3, 1.05 + rng.next() * 0.2, jitter(cold ? STONE[2] : STONE[3], rng, 0.08), rng);
          if (!cold && Math.sin(a) < 0) { g.fillStyle = 'rgba(255,120,40,0.25)'; g.beginPath(); g.ellipse(cx + Math.cos(a) * 7.2, by - 3.4 + Math.sin(a) * 2.7 + 0.5, 1.3, 0.6, 0, 0, Math.PI); g.fill(); }
        }
      };
      ring(false);
      ellipse(g, cx, by - 3.2, 5.9, 2.1, cold ? '#6a6460' : '#3a322c');
      if (cold) for (let i = 0; i < 40; i++) ellipse(g, cx + (rng.next() - 0.5) * 10, by - 3.2 + (rng.next() - 0.5) * 3.2, 0.4, 0.25, rgba(rng.next() < 0.5 ? '#9a948c' : '#3a3632', 0.6));
      else coals(g, cx, by - 3.1, 4.4, 1.5, rng, 70, 1.2);
      const char = cold ? 0.8 : 0.6;
      logLying(g, cx - 5.6, by - 1.8, cx + 0.6, by - 4.4, 0.85, rng, { char, glow: cold ? 0 : 1 });
      logLying(g, cx + 5.8, by - 2.2, cx - 0.4, by - 4.6, 0.8, rng, { char, glow: cold ? 0 : 1 });
      logLying(g, cx + 0.4, by - 6.4, cx - 0.2, by - 3.6, 0.75, rng, { char, glow: cold ? 0 : 1 });
      logLying(g, cx - 1.6, by - 0.4, cx + 0.2, by - 3.0, 0.8, rng, { char, glow: cold ? 0 : 1 });
      ring(true);
      if (!cold) return (gg) => { groundGlow(gg, cx, by - 3.2, 8, 3.4, '#ff9a4a', 0.5); glow(gg, cx, by - 3.4, 2.6, '#ffd070', 0.35); };
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.5, by - 2.6, 9.4, 3.2, 0.3) }),
    solid: { w: 12, h: 6 },
    ...(cold ? {} : { light: { x: 0, y: -6, r: 75, color: '#ff9a4a', flicker: true, intensity: 0.95 }, anim: 'fire' as const }),
  };
}

function bonfireProp(k: K): PropInfo {
  const W = 38, H = 36, cx = 19, by = 34.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const ring = (front: boolean) => {
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * TAU + 0.1;
          if ((Math.sin(a) > 0.05) !== front) continue;
          cobble(g, cx + Math.cos(a) * 15.4, by - 2.8 + Math.sin(a) * 3.2, 1.7 + rng.next() * 0.4, 1.2 + rng.next() * 0.2, jitter(STONE[3], rng, 0.08), rng);
        }
      };
      ring(false);
      ellipse(g, cx, by - 2.8, 13.4, 3.0, '#2e2622');
      coals(g, cx, by - 2.8, 12, 2.6, rng, 160, 1.1);
      // a stack of poles leaning together, their tips crossing above the apex
      const apex = { x: cx + 0.4, y: 5.2 };
      const poles: [number, number, number][] = [];
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + rng.next() * 0.25; poles.push([cx + Math.cos(a) * 11.6, by - 2.8 + Math.sin(a) * 2.8, a]); }
      const pole = ([x, y, a]: [number, number, number]) => {
        const r = 0.55 + rng.next() * 0.3;
        const ax = apex.x + (rng.next() - 0.5) * 2.2, ay = apex.y + rng.next() * 2;
        const tx = ax + (ax - x) * 0.14, ty = ay + (ay - y) * 0.14;
        logLying(g, tx, ty, x, y, r, rng, { char: Math.sin(a) > 0 ? 0.5 : 0.35, glow: 1, end: false });
      };
      const back = poles.filter((p) => Math.sin(p[2]) <= 0), front = poles.filter((p) => Math.sin(p[2]) > 0);
      back.forEach(pole);
      // the hollow inside the stack, lit from the fire at its foot
      poly(g, [cx - 9, by - 3.2, apex.x, apex.y + 2, cx + 9, by - 3.2], lin(g, 0, apex.y, 0, by - 3, [[0, 'rgba(20,10,6,0.9)'], [0.6, 'rgba(120,40,12,0.9)'], [1, 'rgba(255,150,60,0.95)']]));
      front.sort((p, q) => p[1] - q[1]).forEach(pole);
      // split logs thrown at the foot
      logLying(g, cx - 12, by - 1.2, cx - 4, by - 2.6, 1.0, rng, { char: 0.5, glow: 1 });
      logLying(g, cx + 12.5, by - 1.4, cx + 3.5, by - 2.4, 1.0, rng, { char: 0.5, glow: 1 });
      ring(true);
      return (gg) => { groundGlow(gg, cx, by - 3, 16, 5, '#ff9a4a', 0.5); groundGlow(gg, cx, by - 10, 9, 9, '#ffb060', 0.3); };
    }, { seed: k.seed, under: (g) => contact(g, cx + 1, by - 2.4, 18, 4.2, 0.35) }),
    solid: { w: 28, h: 10 },
    light: { x: 0, y: -16, r: 140, color: '#ff8a3a', flicker: true, intensity: 1 },
    anim: 'bigfire',
  };
}

// ---------------------------------------------------------------- farmyard

function skepProp(k: K): PropInfo {
  const W = 16, H = 16, cx = 8, by = 14.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      // a plank stand
      board(g, 0.8, by - 3.2, W - 1.6, 1.3, lit(GREY, 0.2), rng, { knots: 0 });
      board(g, 0.8, by - 1.9, W - 1.6, 1.0, dim(GREY, 0.2), rng, { knots: 0 });
      for (const x of [1.6, W - 2.6]) board(g, x, by - 1.0, 1.0, 1.0, dim(GREY, 0.4), rng, { knots: 0 });
      // coiled straw dome
      const base = by - 2.8, top = 1.6, n = 6;
      const half = (y: number) => 5.9 * Math.pow(Math.max(0, (y - top) / (base - top)), 0.42);
      for (let i = 0; i < n; i++) {
        const y0 = top + ((base - top) * i) / n, y1 = top + ((base - top) * (i + 1)) / n + 0.25;
        const w0 = half(y0), w1 = half(y1);
        const coil = () => { g.beginPath(); g.moveTo(cx - w0, y0); g.quadraticCurveTo(cx, y0 - 0.9, cx + w0, y0); g.lineTo(cx + w1, y1); g.quadraticCurveTo(cx, y1 + 0.55, cx - w1, y1); g.closePath(); };
        fillPath(g, coil, lin(g, 0, y0 - 0.5, 0, y1 + 0.5, [[0, STRAW[6]], [0.45, STRAW[4]], [1, STRAW[1]]]));
        g.save(); coil(); g.clip();
        g.fillStyle = lin(g, cx - w1, 0, cx + w1, 0, [[0, 'rgba(255,240,200,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(20,12,24,0.35)']]);
        g.fillRect(cx - w1 - 1, y0 - 1, w1 * 2 + 2, y1 - y0 + 2);
        for (let x = cx - w1; x < cx + w1; x += 0.35) line(g, x, y0 + 0.2, x + 0.25, y1 - 0.1, rgba(rng.next() < 0.5 ? STRAW[7] : STRAW[2], 0.35), 0.1);
        for (let x = cx - w1 + 0.4; x < cx + w1; x += 1.3) line(g, x, y0 + 0.1, x + 0.5, y1 - 0.2, 'rgba(70,48,20,0.6)', 0.16);
        g.restore();
      }
      // the entrance
      g.beginPath(); g.ellipse(cx, base + 0.1, 1.3, 1.3, 0, Math.PI, 0); g.fillStyle = '#1a1008'; g.fill();
      return (gg) => {
        for (const [x, y] of [[cx + 2.6, base - 1.4], [cx - 3.2, base - 3.6], [cx + 4.6, base - 5.4], [cx - 1, base - 0.6]]) {
          ellipse(gg, x, y, 0.32, 0.22, '#e0a820');
          line(gg, x - 0.2, y, x + 0.2, y, '#1a1008', 0.1);
          ellipse(gg, x - 0.05, y - 0.28, 0.25, 0.16, 'rgba(240,248,255,0.7)');
        }
      };
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.6, by - 0.4, 7, 1.5, 0.42) }),
    solid: { w: 12, h: 4 },
  };
}

function coopProp(k: K): PropInfo {
  const W = 28, H = 25, cx = 14, by = 23.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#806848';
      for (const x of [3.2, W - 4.2]) board(g, x, by - 2.8, 1.1, 2.8, dim(col, 0.4), rng, { vertical: true, knots: 0 });
      g.fillStyle = 'rgba(8,5,3,0.6)'; g.fillRect(4, by - 2.6, W - 8, 2.4);
      planks(g, 2.2, 11.4, W - 4.4, by - 2.4 - 11.4, 7, col, rng, true, 0.16);
      g.fillStyle = lin(g, 2.2, 0, W - 2.2, 0, [[0, 'rgba(255,236,200,0.08)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.28)']]);
      g.fillRect(2.2, 11.4, W - 4.4, by - 2.4 - 11.4);
      beam(g, 1.8, by - 3.2, W - 3.6, 1.0, dim(col, 0.25), rng);
      // hatch and ramp
      const door = () => { g.beginPath(); g.moveTo(6, by - 3.2); g.lineTo(6, 16.4); g.arc(8.2, 16.4, 2.2, Math.PI, 0); g.lineTo(10.4, by - 3.2); g.closePath(); };
      fillPath(g, door, lin(g, 0, 14, 0, by - 3, [[0, '#0e0906'], [1, '#2a1e14']]));
      for (let i = 0; i < 6; i++) blade(g, 6.4 + rng.next() * 3.6, by - 3.3, 1 + rng.next(), -Math.PI / 2 + (rng.next() - 0.5) * 1.4, 0.2, 0.28, STRAW[4]);
      slantBeam(g, 7.8, by - 3.3, 1.2, by - 0.4, 1.8, lit(col, 0.1), rng);
      for (let i = 1; i < 5; i++) { const t = i / 5; line(g, 7.8 + (1.2 - 7.8) * t - 0.5, by - 3.3 + 2.9 * t - 0.4, 7.8 + (1.2 - 7.8) * t + 0.3, by - 3.3 + 2.9 * t + 0.5, dim(col, 0.5), 0.3); }
      // a barred window
      g.fillStyle = '#140e0a'; g.fillRect(17.4, 14.6, 4.4, 3.0);
      for (let x = 18.3; x < 21.8; x += 1.1) beam(g, x, 14.6, 0.5, 3.0, col, rng);
      // thatched roof
      const eave = 12.8, ridge = 2.2;
      const roof = () => { g.beginPath(); g.moveTo(0.4, eave); g.lineTo(2.8, ridge); g.lineTo(W - 2.8, ridge); g.lineTo(W - 0.4, eave); g.quadraticCurveTo(cx, eave + 1.4, 0.4, eave); g.closePath(); };
      g.fillStyle = '#2a1e10'; g.beginPath(); g.ellipse(cx, eave + 0.6, cx - 0.5, 1.4, 0, 0, Math.PI); g.fill();
      fillPath(g, roof, lin(g, 0, ridge, 0, eave, [[0, STRAW[5]], [1, STRAW[2]]]));
      g.save(); roof(); g.clip();
      strawStrokes(g, 520, () => [rng.next() * W, ridge - 1 + rng.next() * (eave - ridge + 2)], rng, { ang: () => Math.PI / 2, len: [2.2, 3.4], w: 0.36, light: (x, y) => 0.8 - ((y - ridge) / (eave - ridge)) * 0.45 - (x / W) * 0.3 });
      g.fillStyle = lin(g, 0, eave - 3, 0, eave + 1.5, [[0, 'rgba(40,24,8,0)'], [1, 'rgba(40,24,8,0.55)']]);
      g.fillRect(0, eave - 3, W, 5);
      g.fillStyle = lin(g, 0, 0, W, 0, [[0, 'rgba(255,236,180,0.16)'], [0.25, 'rgba(255,236,180,0)'], [0.8, 'rgba(20,14,30,0)'], [1, 'rgba(20,14,30,0.35)']]);
      g.fillRect(0, 0, W, eave + 2);
      g.restore();
      roundRect(g, 2.4, ridge - 1.0, W - 4.8, 2.2, 1, lin(g, 0, ridge - 1, 0, ridge + 1.2, [[0, STRAW[6]], [1, STRAW[2]]]));
      g.fillStyle = lin(g, 0, eave + 0.6, 0, eave + 3.2, [[0, 'rgba(10,6,4,0.45)'], [1, 'rgba(10,6,4,0)']]);
      g.fillRect(2.2, eave + 0.6, W - 4.4, 2.6);
      ellipse(g, 20, by - 0.6, 0.9, 0.3, '#ece6da');
      blade(g, 19.4, by - 0.7, 1.5, -0.3, 0.3, 0.5, '#f4f0e6');
    }, { seed: k.seed, under: (g) => contact(g, cx + 1, by - 0.6, 13.5, 2, 0.42) }),
    solid: { w: 24, h: 10 },
  };
}

function kennelProp(k: K): PropInfo {
  const W = 20, H = 18, cx = 10, by = 16.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#7e6446';
      const apexY = 4.0, eaveY = 9.8, d = 2.8;
      // roof slopes receding behind the gable
      poly(g, [0.8, eaveY, cx, apexY, cx, apexY - d, 0.8, eaveY - d], lin(g, 0, apexY - d, 0, eaveY, [[0, '#8a7458'], [1, '#5e4a36']]));
      poly(g, [W - 0.8, eaveY, cx, apexY, cx, apexY - d, W - 0.8, eaveY - d], lin(g, 0, apexY - d, 0, eaveY, [[0, '#5a4634'], [1, '#3a2c20']]));
      g.strokeStyle = 'rgba(30,20,12,0.5)'; g.lineWidth = 0.14;
      for (let t = 0.2; t < 1; t += 0.2) { g.beginPath(); g.moveTo(0.8 + (cx - 0.8) * t, eaveY + (apexY - eaveY) * t); g.lineTo(0.8 + (cx - 0.8) * t, eaveY + (apexY - eaveY) * t - d); g.stroke(); g.beginPath(); g.moveTo(W - 0.8 - (cx - 0.8) * t, eaveY + (apexY - eaveY) * t); g.lineTo(W - 0.8 - (cx - 0.8) * t, eaveY + (apexY - eaveY) * t - d); g.stroke(); }
      // the gable wall
      const gable = () => { g.beginPath(); g.moveTo(2.2, by); g.lineTo(2.2, eaveY - 0.3); g.lineTo(cx, apexY + 0.6); g.lineTo(W - 2.2, eaveY - 0.3); g.lineTo(W - 2.2, by); g.closePath(); };
      g.save(); gable(); g.clip();
      planks(g, 2.2, apexY, W - 4.4, by - apexY, 5, col, rng, true, 0.16);
      g.fillStyle = lin(g, 2.2, 0, W - 2.2, 0, [[0, 'rgba(255,236,200,0.08)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.28)']]);
      g.fillRect(2.2, apexY, W - 4.4, by - apexY);
      g.fillStyle = lin(g, 0, eaveY - 2, 0, eaveY + 2, [[0, 'rgba(10,6,4,0.4)'], [1, 'rgba(10,6,4,0)']]);
      g.fillRect(0, apexY, W, eaveY + 2 - apexY);
      g.restore();
      const door = () => { g.beginPath(); g.moveTo(cx - 3.2, by); g.lineTo(cx - 3.2, 11.4); g.arc(cx, 11.4, 3.2, Math.PI, 0); g.lineTo(cx + 3.2, by); g.closePath(); };
      fillPath(g, door, lin(g, 0, 8.2, 0, by, [[0, '#0c0806'], [1, '#241810']]));
      for (let i = 0; i < 7; i++) blade(g, cx - 2.6 + rng.next() * 5.2, by - 0.1, 0.8 + rng.next(), -Math.PI / 2 + (rng.next() - 0.5) * 1.6, 0.2, 0.26, STRAW[3]);
      g.strokeStyle = rgba(lit(col, 0.4), 0.5); g.lineWidth = 0.3; g.beginPath(); g.arc(cx, 11.4, 3.3, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
      // bargeboards
      slantBeam(g, 0.4, eaveY + 0.5, cx + 0.3, apexY - 0.4, 1.3, lit(col, 0.15), rng);
      slantBeam(g, W - 0.4, eaveY + 0.5, cx - 0.3, apexY - 0.4, 1.3, dim(col, 0.2), rng);
      // a wooden bowl by the door
      discSide(g, W - 3.3, by - 1.2, 1.5, 0.5, 0.6, lin(g, W - 5, 0, W - 1.8, 0, [[0, '#a07a4a'], [1, '#4a3420']]));
      ellipse(g, W - 3.3, by - 1.2, 1.5, 0.5, '#b08a58');
      ellipse(g, W - 3.3, by - 1.15, 1.1, 0.3, '#5a4028');
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.3, 9.6, 1.6, 0.42) }),
    solid: { w: 16, h: 8 },
  };
}

function laundryProp(k: K): PropInfo {
  const W = 38, H = 24, cx = 19, by = 22.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const lineY = (x: number) => { const t = (x - 2.4) / (W - 4.8); return 3.4 * (1 - t) + 3.7 * t + Math.sin(t * Math.PI) * 2.6; };
      post(g, 2.2, 1.6, by + 0.2, 1.4, GREY, rng, 'cut');
      post(g, W - 2.2, 1.8, by + 0.2, 1.4, dim(GREY, 0.2), rng, 'cut');
      g.strokeStyle = '#c8b48a'; g.lineWidth = 0.28;
      g.beginPath(); for (let x = 2.4; x <= W - 2.4; x += 0.5) { if (x === 2.4) g.moveTo(x, lineY(x)); else g.lineTo(x, lineY(x)); } g.stroke();
      const peg = (x: number) => { const y = lineY(x); roundRect(g, x - 0.28, y - 0.8, 0.56, 1.7, 0.2, lin(g, x - 0.3, 0, x + 0.3, 0, [[0, '#d0b080'], [1, '#7a5a34']])); };
      const hang = (x0: number, x1: number, drop: number, col: string, shape: 'shirt' | 'sheet' | 'skirt' | 'hose') => {
        const y0 = lineY(x0), y1 = lineY(x1), bottom = Math.max(y0, y1) + drop;
        const path = () => {
          g.beginPath();
          if (shape === 'shirt') {
            const m = (x0 + x1) / 2;
            g.moveTo(x0 - 1.4, y0 + 0.2); g.lineTo(x1 + 1.4, y1 + 0.2); g.lineTo(x1 + 1.7, y1 + 3.6); g.lineTo(x1 - 0.2, y1 + 3.2);
            g.lineTo(x1 - 0.3, bottom); g.quadraticCurveTo(m, bottom + 0.8, x0 + 0.3, bottom); g.lineTo(x0 + 0.2, y0 + 3.2); g.lineTo(x0 - 1.7, y0 + 3.6); g.closePath();
          } else if (shape === 'skirt') {
            g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1 + 1.3, bottom); g.quadraticCurveTo((x0 + x1) / 2, bottom + 1.0, x0 - 1.3, bottom); g.closePath();
          } else if (shape === 'hose') {
            const m = (x0 + x1) / 2;
            g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1 + 0.2, bottom - 0.6); g.lineTo(m + 0.4, bottom); g.lineTo(m + 0.2, y1 + drop * 0.35); g.lineTo(m - 0.2, y0 + drop * 0.35); g.lineTo(m - 0.4, bottom + 0.4); g.lineTo(x0 - 0.2, bottom - 0.4); g.closePath();
          } else {
            g.moveTo(x0, y0); g.lineTo(x1, y1); g.lineTo(x1 + 0.1, bottom); for (let x = x1; x > x0; x -= 1.2) g.lineTo(x - 0.6, bottom + ((x * 3.1) % 1) * 0.5); g.lineTo(x0, bottom); g.closePath();
          }
        };
        fillPath(g, path, lin(g, x0, y0, x1, bottom, [[0, lit(col, 0.3)], [0.5, col], [1, dim(col, 0.35)]]));
        g.save(); path(); g.clip();
        weave(g, x0 - 2, y0, x1 + 2, bottom + 1, col, 0.45, 0.1);
        folds(g, x0 - 2, y0, x1 + 2, bottom + 1, col, rng, shape === 'sheet' ? 4 : 3, true, 0.35);
        g.fillStyle = lin(g, 0, Math.min(y0, y1), 0, Math.min(y0, y1) + 1.6, [[0, 'rgba(10,6,4,0.3)'], [1, 'rgba(10,6,4,0)']]);
        g.fillRect(x0 - 2, Math.min(y0, y1), x1 - x0 + 4, 1.6);
        g.restore();
        if (shape === 'shirt') { g.beginPath(); g.ellipse((x0 + x1) / 2, (y0 + y1) / 2 + 0.6, 1.1, 0.5, 0, 0, Math.PI); g.fillStyle = dim(col, 0.4); g.fill(); }
        peg(x0 + 0.3); peg(x1 - 0.3);
      };
      hang(5.6, 11.4, 9.4, '#ece6d6', 'shirt');
      hang(13.4, 19.6, 10.4, CLOTH.woad, 'sheet');
      hang(21.4, 27.0, 9.0, CLOTH.madder, 'skirt');
      hang(29.2, 33.8, 8.2, CLOTH.undyed, 'hose');
      tufts(g, 0.5, 4, by, rng, 2); tufts(g, W - 4, W - 0.5, by, rng, 2);
    }, { seed: k.seed, under: (g) => { contact(g, 2.6, by, 2, 0.7, 0.4); contact(g, W - 1.8, by, 2, 0.7, 0.4); for (const [x, w] of [[8.5, 4], [16.5, 4.5], [24.2, 4.2], [31.5, 3.2]]) contact(g, x + 1.2, by - 1.8, w, 1.2, 0.14); } }),
  };
}

function rubbleProp(k: K): PropInfo {
  const W = 28, H = 16, cx = 14, by = 14.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const mound = () => { g.beginPath(); g.moveTo(1.6, by - 0.2); g.quadraticCurveTo(4, by - 6.4, cx - 2, by - 7.2); g.quadraticCurveTo(cx + 7, by - 7.6, W - 1.6, by - 0.4); g.closePath(); };
      fillPath(g, mound, lin(g, 0, by - 7, 0, by, [[0, '#6a625a'], [1, '#3a3430']]));
      g.save(); mound(); g.clip();
      for (let i = 0; i < 60; i++) ellipse(g, 2 + rng.next() * 24, by - rng.next() * 7, 0.3 + rng.next() * 0.6, 0.2 + rng.next() * 0.3, rgba(rng.next() < 0.5 ? '#2a2622' : '#8a827a', 0.5));
      g.restore();
      const burnt = ['#221c18', '#342a24', '#463a30', '#5a4a3e', '#6e5c4c'];
      logLying(g, 3.2, by - 3.4, 17.4, by - 7.6, 0.95, rng, { char: 0.45, end: true, bark: burnt });
      for (let i = 0; i < 8; i++) ellipse(g, 3 + rng.next() * 22, by - 1 - rng.next() * 5, 1 + rng.next() * 1.6, 0.5 + rng.next() * 0.4, rgba(rng.next() < 0.5 ? '#8a847c' : '#2a2622', 0.45));
      const stones: [number, number, number][] = [];
      for (let i = 0; i < 30; i++) { const x = 3 + rng.next() * 22, t = 1 - Math.abs(x - cx) / 13; stones.push([x, by - 0.6 - rng.next() * 5.5 * t, 0.8 + rng.next() * 1.5 * (0.5 + t * 0.5)]); }
      stones.sort((a, b) => a[1] - b[1]);
      for (const [x, y, r] of stones) {
        if (rng.next() < 0.2) {
          const bw = r * 1.6, bh = r * 0.8, rot = (rng.next() - 0.5) * 0.8;
          g.save(); g.translate(x, y); g.rotate(rot);
          roundRect(g, -bw / 2, -bh / 2, bw, bh, 0.2, lin(g, -bw / 2, -bh / 2, bw / 2, bh / 2, [[0, '#9a6450'], [1, '#4e2e22']]));
          g.restore();
        } else {
          const n = 5 + Math.floor(rng.next() * 2), pts: number[] = [];
          const off = rng.next() * TAU;
          for (let j = 0; j < n; j++) { const a = off + (j / n) * TAU; const rr = r * (0.75 + rng.next() * 0.35); pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7); }
          const c = jitter(STONE[1 + Math.floor(rng.next() * 4)], rng, 0.06);
          poly(g, pts, lin(g, x - r, y - r * 0.7, x + r * 0.6, y + r * 0.7, [[0, lit(c, 0.3)], [0.5, c], [1, dim(c, 0.4)]]));
          ellipse(g, x - r * 0.25, y - r * 0.3, r * 0.4, r * 0.18, rgba(lit(c, 0.5), 0.4));
        }
      }
      logLying(g, 11.4, by - 1.0, 25.2, by - 3.4, 0.85, rng, { char: 0.45, end: true, bark: burnt });
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.5, 13.5, 2, 0.42) }),
    solid: { w: 20, h: 6 },
  };
}

function cageProp(k: K): PropInfo {
  const W = 36, H = 32, cx = 18, by = 30.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#6e5438';
      const bedTop = by - 11.8, bedFar = by - 15.2, roofF = 5.2, roofB = 1.4;
      // back bars and the straw floor seen between the front bars
      g.fillStyle = '#16100c'; g.fillRect(2.4, roofB + 1, W - 4.8, bedTop - roofB - 1);
      for (let x = 4.4; x < W - 3; x += 3.2) { g.fillStyle = lin(g, x - 0.3, 0, x + 0.3, 0, [[0, IRON[3]], [1, IRON[0]]]); g.fillRect(x - 0.3, roofB + 1.5, 0.6, bedFar - roofB - 1.5); }
      g.fillStyle = lin(g, 0, bedFar, 0, bedTop, [[0, '#6a5230'], [1, '#9a7c48']]);
      g.fillRect(2.4, bedFar, W - 4.8, bedTop - bedFar);
      for (let i = 0; i < 60; i++) blade(g, 3 + rng.next() * (W - 6), bedFar + rng.next() * (bedTop - bedFar), 1 + rng.next() * 1.5, rng.next() * Math.PI, 0.3, 0.28, STRAW[2 + Math.floor(rng.next() * 4)]);
      // the wagon bed and wheels
      planks(g, 1.4, bedTop, W - 2.8, by - 6.2 - bedTop, 2, col, rng, false, 0.2);
      board(g, 1.0, bedTop - 0.6, W - 2, 1.2, lit(col, 0.2), rng, { knots: 0 });
      g.fillStyle = 'rgba(10,6,4,0.8)'; g.fillRect(4, by - 6.3, W - 8, 1.6);
      wheel(g, 8.2, by - 4.4, 4.4, '#6a4c32', rng, 8, { rust: 0.3 });
      wheel(g, W - 8.2, by - 4.4, 4.4, '#664a30', rng, 8, { rust: 0.3 });
      // corner posts, roof and front bars
      for (const [x, d] of [[2.4, 0], [W - 2.4, 0.25]] as const) board(g, x - 1, roofF, 2, bedTop - roofF, dim(col, d), rng, { vertical: true, knots: 0 });
      for (let x = 5.6; x < W - 3.5; x += 3.2) {
        g.fillStyle = lin(g, x - 0.4, 0, x + 0.4, 0, [[0, IRON[4]], [0.4, IRON[3]], [1, IRON[0]]]);
        g.fillRect(x - 0.38, roofF + 1, 0.76, bedTop - roofF - 1);
      }
      ironBar(g, 3.4, 13.6, W - 6.8, 0.8);
      for (let x = 5.6; x < W - 3.5; x += 3.2) rivet(g, x, 14, 0.22);
      // door with its padlock
      ironBar(g, cx + 1.2, roofF + 1, 0.8, bedTop - roofF - 1, true);
      g.strokeStyle = IRON[2]; g.lineWidth = 0.35; g.beginPath(); g.arc(cx + 1.6, 16.6, 0.8, Math.PI, 0); g.stroke();
      roundRect(g, cx + 0.5, 16.6, 2.2, 1.9, 0.3, lin(g, cx + 0.5, 0, cx + 2.7, 0, [[0, IRON[4]], [1, IRON[1]]]));
      poly(g, [2, roofF, W - 2, roofF, W - 2.6, roofB, 2.6, roofB], lin(g, 0, roofB, 0, roofF, [[0, lit(col, 0.1)], [1, lit(col, 0.3)]]));
      g.save(); g.beginPath(); g.rect(2, roofB, W - 4, roofF - roofB); g.clip(); for (let x = 2; x < W; x += 3.1) line(g, x, roofB, x, roofF, rgba(dim(col, 0.6), 0.6), 0.14); g.restore();
      board(g, 1.4, roofF, W - 2.8, 1.1, dim(col, 0.15), rng, { knots: 0 });
    }, { seed: k.seed, under: (g) => { contact(g, cx + 1, by - 1, 16, 2.2, 0.42); contact(g, 8.2, by, 3.6, 1, 0.4); contact(g, W - 8.2, by, 3.6, 1, 0.4); } }),
    solid: { w: 30, h: 10 },
  };
}

function gallowsProp(k: K): PropInfo {
  const W = 36, H = 46, cx = 18, by = 44.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#5e5044';
      // the scaffold
      const pTop = by - 9.8, pFront = by - 6.6;
      planks(g, 1, pTop, W - 2, pFront - pTop, 3, lit(col, 0.1), rng, false, 0.2);
      g.strokeStyle = 'rgba(8,5,3,0.8)'; g.lineWidth = 0.3; g.strokeRect(22, pTop + 0.6, 8.4, pFront - pTop - 1.2);
      planks(g, 1, pFront, W - 2, by - pFront, 9, dim(col, 0.1), rng, true, 0.16);
      for (const x of [1, cx - 1, W - 3]) beam(g, x, pFront, 2, by - pFront, dim(col, 0.2), rng);
      beam(g, 0.6, pFront - 0.4, W - 1.2, 1.3, col, rng);
      // upright, beam, brace
      board(g, 5, 2.2, 3.4, pTop - 1.8, col, rng, { vertical: true, knots: 1 });
      board(g, 3.8, 1.8, 27.2, 3.2, lit(col, 0.08), rng, { knots: 1 });
      slantBeam(g, 8.2, 14.4, 17.6, 4.8, 2.0, dim(col, 0.1), rng);
      for (const [x, y] of [[6.7, 3.4], [9.6, 13.4], [16.4, 5.8]]) rivet(g, x, y, 0.3);
      // a ladder up to the scaffold
      for (let y = by - 1.4; y > pTop - 1.2; y -= 2.1) { const t = (by - y) / (by - pTop + 1.2); board(g, 31.2 - t * 0.6, y - 0.4, 3.6, 0.8, dim(col, 0.1), rng, { knots: 0 }); }
      slantBeam(g, 30.8, by + 0.2, 30.2, pTop - 2.4, 0.9, col, rng);
      slantBeam(g, 35.0, by + 0.2, 34.2, pTop - 2.4, 0.9, dim(col, 0.2), rng);
      // the rope and noose
      const rx = 26.6;
      g.strokeStyle = '#a89068'; g.lineWidth = 0.55;
      g.beginPath(); g.moveTo(rx, 5); g.lineTo(rx, 14.8); g.stroke();
      g.beginPath(); g.ellipse(rx, 18.6, 1.7, 2.4, 0, 0, TAU); g.stroke();
      roundRect(g, rx - 0.6, 13.4, 1.2, 3.6, 0.5, lin(g, rx - 0.6, 0, rx + 0.6, 0, [[0, '#c8b088'], [1, '#6a5638']]));
      g.strokeStyle = 'rgba(60,44,24,0.8)'; g.lineWidth = 0.16;
      for (let y = 13.7; y < 16.9; y += 0.45) { g.beginPath(); g.moveTo(rx - 0.6, y); g.lineTo(rx + 0.6, y + 0.25); g.stroke(); }
      ellipse(g, rx + 0.5, 5.4, 0.9, 0.5, '#a89068');
    }, { seed: k.seed, under: (g) => contact(g, cx + 1, by - 0.3, 17.5, 1.8, 0.45) }),
    solid: { w: 32, h: 6 },
  };
}

// ---------------------------------------------------------------- mines, mills and water

/** An angular boulder of weathered rock: a lit top facet, a shaded flank, cracks and moss. */
function rockBlob(g: G, x: number, y: number, rx: number, ry: number, col: string, rng: RNG) {
  const n = 7 + Math.floor(rng.next() * 3), pts: number[] = [];
  const off = rng.next() * 0.6;
  for (let i = 0; i < n; i++) {
    const a = off + (i / n) * TAU, k = 0.84 + rng.next() * 0.22;
    pts.push(x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k);
  }
  poly(g, pts, lin(g, x - rx, y - ry, x + rx * 0.7, y + ry, [[0, lit(col, 0.28)], [0.5, col], [1, dim(col, 0.5)]]));
  g.save();
  poly(g, pts); g.clip();
  // the top facet catches the light, the right flank turns away
  poly(g, [x - rx * 1.1, y - ry * 0.1, x - rx * 0.3, y - ry * 1.2, x + rx * 0.5, y - ry * 1.1, x + rx * 0.2, y - ry * 0.2], rgba(lit(col, 0.45), 0.4));
  poly(g, [x + rx * 0.25, y - ry * 0.3, x + rx * 1.2, y - ry * 0.5, x + rx * 1.2, y + ry * 1.2, x + rx * 0.1, y + ry * 1.2], rgba(dim(col, 0.6), 0.34));
  for (let i = 0; i < rx * ry * 0.5; i++) ellipse(g, x + (rng.next() - 0.5) * rx * 1.8, y + (rng.next() - 0.5) * ry * 1.6, 0.18 + rng.next() * 0.35, 0.12, rgba(rng.next() < 0.5 ? '#2a2622' : '#d8d2c6', 0.3));
  // moss and lichen on the upper faces
  for (let i = 0; i < rx * 0.9; i++) { const a = Math.PI * (1.05 + rng.next() * 0.9), d = 0.55 + rng.next() * 0.45; ellipse(g, x + Math.cos(a) * rx * d, y + Math.sin(a) * ry * d, 0.6 + rng.next() * 0.5, 0.35, rgba(rng.next() < 0.5 ? '#4e6e2e' : '#66843a', 0.45), rng.next() * 3); }
  g.restore();
  g.strokeStyle = 'rgba(20,16,12,0.6)'; g.lineWidth = 0.22;
  g.beginPath(); let cx = x + (rng.next() - 0.3) * rx * 0.6, cy = y - ry * 0.7; g.moveTo(cx, cy); for (let i = 0; i < 3; i++) { cx += (rng.next() - 0.5) * 1.6; cy += ry * 0.45; g.lineTo(cx, cy); } g.stroke();
  g.strokeStyle = rgba(lit(col, 0.55), 0.45); g.lineWidth = 0.2;
  g.beginPath(); g.moveTo(pts[pts.length - 2], pts[pts.length - 1]); for (let i = 0; i < Math.ceil(n / 2) * 2 && i < pts.length; i += 2) { if (pts[i + 1] > y + ry * 0.2) break; g.lineTo(pts[i], pts[i + 1]); } g.stroke();
}

function mineProp(k: K): PropInfo {
  const W = 38, H = 34, cx = 19, by = 32.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const rock = '#77706a';
      const mass = () => { g.beginPath(); g.moveTo(0.4, by); g.lineTo(0.8, 14); g.quadraticCurveTo(1.4, 4, 10, 1.6); g.quadraticCurveTo(19, -0.2, 28, 1.4); g.quadraticCurveTo(37, 4, 37.4, 14); g.lineTo(37.6, by); g.closePath(); };
      fillPath(g, mass, lin(g, 0, 0, 0, by, [[0, dim(rock, 0.35)], [1, dim(rock, 0.6)]]));
      const bould: [number, number, number, number][] = [[12, 3.6, 5.8, 3.4], [26.5, 3.4, 6, 3.2], [19, 6.5, 13, 6.5], [7, 10, 6.5, 6.5], [31, 10.5, 6.5, 6.5], [4.2, 18.5, 4.4, 6.5], [33.8, 19, 4.4, 6.5], [4, 27.6, 4.2, 5.2], [34, 27.8, 4.2, 5.0]];
      for (const [x, y, rx, ry] of bould) rockBlob(g, x, y, rx, ry, jitter(rock, rng, 0.06), rng);
      for (let i = 0; i < 16; i++) { const x = 3 + rng.next() * 32; const y = 2 + rng.next() * 6; blade(g, x, y + 1, 1.2 + rng.next() * 1.5, -Math.PI / 2 + (rng.next() - 0.5), 0.3, 0.5, GRASS[1 + Math.floor(rng.next() * 4)]); }
      // the adit: darkness going down into the hill
      const t0 = 10.4, t1 = 27.6, tt = 9.2;
      g.fillStyle = rad(g, cx, by + 2, 1, cx, by - 6, 22, [[0, '#4a3c30'], [0.35, '#1c1612'], [1, '#050404']]);
      g.fillRect(t0, tt, t1 - t0, by - tt);
      g.fillStyle = lin(g, 0, tt, 0, tt + 6, [[0, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
      g.fillRect(t0, tt, t1 - t0, 6);
      // rails running in
      for (let i = 0; i < 7; i++) { const t = i / 7; const y = by - 0.6 - t * t * 14; const hw = 5.2 - t * 3; board(g, cx - hw - 0.4, y - 0.3, hw * 2 + 0.8, 0.7 - t * 0.3, dim('#5a4430', t * 0.5), rng, { knots: 0, edge: 0.4 }); }
      for (const [x0, x1] of [[14.6, 17.8], [23.4, 20.2]]) { g.strokeStyle = lin(g, 0, 16, 0, by, [[0, 'rgba(60,60,64,0)'], [1, IRON[4]]]); g.lineWidth = 0.4; g.beginPath(); g.moveTo(x0, by); g.quadraticCurveTo(x0 + (x1 - x0) * 0.6, by - 7, x1, 17); g.stroke(); }
      // timber set: posts, cap and wedges
      for (const [x, d] of [[10.6, 0], [27.4, 0.25]] as const) board(g, x - 1.3, 8, 2.6, by - 8, dim('#5e4a36', d), rng, { vertical: true, knots: 1 });
      board(g, 7.6, 6.4, 22.8, 2.8, '#5e4a36', rng, { knots: 1 });
      for (const x of [9.5, 26.3]) poly(g, [x, 6.4, x + 2.2, 6.4, x + 1.1, 5.3], '#7a6448');
      // a pick left against the post and a lantern on its nail
      line(g, 7.2, by - 0.2, 9.0, by - 8.2, '#7a5a38', 0.5);
      poly(g, [7.2, by - 8.8, 11.2, by - 7.2, 10.8, by - 6.8, 9.0, by - 7.6, 7.0, by - 7.8], lin(g, 7, 0, 11, 0, [[0, IRON[4]], [1, IRON[1]]]));
      line(g, 24.4, 9.2, 24.4, 10.2, IRON[1], 0.2);
      roundRect(g, 23.5, 10.2, 1.8, 2.4, 0.3, lin(g, 23.5, 0, 25.3, 0, [[0, IRON[3]], [1, IRON[0]]]));
      g.fillStyle = 'rgba(200,190,160,0.4)'; g.fillRect(23.8, 10.6, 1.2, 1.5);
      for (let i = 0; i < 7; i++) cobble(g, 2 + rng.next() * 8 + (i % 2) * 26, by - rng.next() * 1.2, 0.7 + rng.next() * 0.7, 0.5 + rng.next() * 0.4, jitter(rock, rng, 0.08), rng);
    }, { seed: k.seed, under: (g) => contact(g, cx, by - 1, 18, 2.4, 0.35) }),
  };
}

function minecartProp(k: K): PropInfo {
  const W = 20, H = 16, cx = 10, by = 14.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#6a5238';
      g.fillStyle = 'rgba(10,6,4,0.8)'; g.fillRect(4, 10.8, 12, 1.4);
      // the ore heaped in the tub
      const heap = () => { g.beginPath(); g.moveTo(2.2, 4.8); g.quadraticCurveTo(4, 0.6, cx, 0.9); g.quadraticCurveTo(16, 0.6, 17.8, 4.8); g.closePath(); };
      fillPath(g, heap, '#34343a');
      g.save(); heap(); g.clip();
      for (let i = 0; i < 26; i++) { const x = 2.5 + rng.next() * 15, y = 1 + rng.next() * 4; ore(g, x, y, 0.8 + rng.next() * 0.7, rng); }
      g.restore();
      // tub
      const tub = () => { g.beginPath(); g.moveTo(1.8, 4.4); g.lineTo(18.2, 4.4); g.lineTo(16.8, 11.2); g.lineTo(3.2, 11.2); g.closePath(); };
      g.save(); tub(); g.clip();
      planks(g, 1.8, 4.4, 16.4, 6.8, 3, col, rng, false, 0.2);
      g.fillStyle = lin(g, 2, 0, 18, 0, [[0, 'rgba(255,236,200,0.08)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.3)']]);
      g.fillRect(1.8, 4.4, 16.4, 6.8);
      g.restore();
      ironBar(g, 1.6, 3.9, 16.8, 0.9, false, 0.3);
      for (const [x0, x1] of [[1.9, 3.3], [16.7, 18.1]]) poly(g, [x0, 4.4, x0 + 1.2, 4.4, x1 + (x0 < 5 ? 0.2 : -0.2), 11.2, x1 - 1.2 + (x0 < 5 ? 0.2 : -0.2), 11.2], lin(g, x0, 0, x1, 0, [[0, mix(IRON[4], '#8a5030', 0.3)], [1, IRON[1]]]));
      for (const x of [2.6, 17.4]) for (const y of [5.6, 9.6]) rivet(g, x + (x < 5 ? (y - 4.4) * 0.2 : -(y - 4.4) * 0.2), y, 0.2, 0.3);
      for (const wx of [5.4, 14.6]) {
        ellipse(g, wx, by - 2.3, 2.3, 2.3, rad(g, wx - 0.6, by - 3, 0.1, wx, by - 2.3, 2.4, [[0, IRON[3]], [0.7, IRON[1]], [1, IRON[0]]]));
        g.strokeStyle = rgba(IRON[4], 0.6); g.lineWidth = 0.3; g.beginPath(); g.arc(wx, by - 2.3, 1.9, Math.PI * 0.95, Math.PI * 1.6); g.stroke();
        ellipse(g, wx, by - 2.3, 0.6, 0.6, IRON[4]);
      }
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.6, by - 0.4, 9, 1.4, 0.42) }),
    solid: { w: 16, h: 6 },
  };
}

/** A lump of silver-bearing ore. */
function ore(g: G, x: number, y: number, r: number, rng: RNG) {
  const n = 5 + Math.floor(rng.next() * 2), pts: number[] = [];
  const off = rng.next() * TAU;
  for (let j = 0; j < n; j++) { const a = off + (j / n) * TAU; const rr = r * (0.7 + rng.next() * 0.4); pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.75); }
  const c = jitter(['#4a4a52', '#58585f', '#3e3e44', '#5a5048'][Math.floor(rng.next() * 4)], rng, 0.05);
  poly(g, pts, lin(g, x - r, y - r, x + r * 0.6, y + r, [[0, lit(c, 0.3)], [0.5, c], [1, dim(c, 0.45)]]));
  for (let i = 0; i < 3; i++) if (rng.next() < 0.6) ellipse(g, x + (rng.next() - 0.6) * r, y + (rng.next() - 0.6) * r * 0.6, 0.14 + rng.next() * 0.16, 0.1, rng.next() < 0.8 ? '#dfe6f0' : '#c87a3a');
}

function waterwheelProp(k: K): PropInfo {
  const W = 34, H = 34, cx = 17, cy = 17;
  return {
    // radially symmetric: the renderer spins it about its centre
    sprite: art(W, H, W / 2, 32, (g) => {
      const rng = rngOf(k);
      const col = '#6a543e';
      const n = 16;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        g.save(); g.translate(cx, cy); g.rotate(a);
        // a float board standing out from the rim
        g.fillStyle = lin(g, 0, -1.1, 0, 1.1, [[0, lit(col, 0.2)], [0.5, col], [1, dim(col, 0.45)]]);
        g.fillRect(10.8, -1.05, 5.9, 2.1);
        g.fillStyle = rgba(dim(col, 0.6), 0.7); g.fillRect(10.8, 0.75, 5.9, 0.3);
        g.fillStyle = rgba(lit(col, 0.5), 0.5); g.fillRect(16.2, -1.05, 0.45, 2.1);
        for (let j = 0; j < 3; j++) line(g, 11 + rng.next() * 4, -0.6 + j * 0.55, 13 + rng.next() * 3.5, -0.6 + j * 0.55, rgba(dim(col, 0.5), 0.4), 0.1);
        // the outer ends dip in the race: dark, wet and green with weed
        g.fillStyle = lin(g, 13.4, 0, 16.7, 0, [[0, 'rgba(20,30,20,0)'], [1, 'rgba(20,34,22,0.5)']]);
        g.fillRect(13.4, -1.05, 3.3, 2.1);
        for (let j = 0; j < 3; j++) ellipse(g, 15.2 + rng.next() * 1.3, -0.7 + rng.next() * 1.4, 0.45, 0.25, rgba(rng.next() < 0.5 ? '#4e6e3a' : '#6a8a44', 0.6));
        line(g, 11.2, -0.8, 15.8, -0.8, 'rgba(220,235,240,0.3)', 0.12);
        g.restore();
      }
      // the rim ring
      g.beginPath(); g.arc(cx, cy, 14.2, 0, TAU); g.arc(cx, cy, 12.3, 0, TAU, true);
      g.fillStyle = rad(g, cx, cy, 12.3, cx, cy, 14.2, [[0, dim(col, 0.45)], [0.35, lit(col, 0.15)], [0.7, col], [1, dim(col, 0.5)]]);
      g.fill();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + 0.2; line(g, cx + Math.cos(a) * 12.3, cy + Math.sin(a) * 12.3, cx + Math.cos(a) * 14.2, cy + Math.sin(a) * 14.2, rgba(dim(col, 0.6), 0.7), 0.14); }
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU + 0.1; rivet(g, cx + Math.cos(a) * 13.25, cy + Math.sin(a) * 13.25, 0.2); }
      // spokes
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + TAU / 16;
        g.save(); g.translate(cx, cy); g.rotate(a);
        g.fillStyle = lin(g, 0, -0.75, 0, 0.75, [[0, dim(col, 0.35)], [0.5, lit(col, 0.2)], [1, dim(col, 0.35)]]);
        g.fillRect(2.8, -0.72, 9.8, 1.44);
        g.restore();
      }
      // hub and axle
      ellipse(g, cx, cy, 3.4, 3.4, rad(g, cx, cy, 0.4, cx, cy, 3.4, [[0, lit(col, 0.25)], [0.7, col], [1, dim(col, 0.5)]]));
      ellipse(g, cx, cy, 2.1, 2.1, rad(g, cx, cy, 0.2, cx, cy, 2.1, [[0, IRON[3]], [1, IRON[1]]]));
      for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ellipse(g, cx + Math.cos(a) * 1.5, cy + Math.sin(a) * 1.5, 0.22, 0.22, IRON[4]); }
      ellipse(g, cx, cy, 0.8, 0.8, rad(g, cx, cy, 0.05, cx, cy, 0.8, [[0, IRON[4]], [1, IRON[0]]]));
    }, { seed: k.seed }),
    solid: { w: 28, h: 10 },
    anim: 'wheel',
  };
}

function boatProp(k: K): PropInfo {
  const W = 36, H = 16, cx = 18, by = 14.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#7a5e42';
      const far = (x: number) => { const t = (x - 1.4) / (W - 2.8); return 6.2 - Math.sin(t * Math.PI) * 4.0; };
      const near = (x: number) => { const t = (x - 1.4) / (W - 2.8); return 6.4 + Math.sin(t * Math.PI) * 2.8; };
      const keel = (x: number) => { const t = (x - 1.4) / (W - 2.8); return 6.6 + Math.pow(Math.sin(t * Math.PI), 0.7) * 7.4; };
      const curve = (f: (x: number) => number, x0: number, x1: number) => { for (let i = 0; i <= 24; i++) { const x = x0 + ((x1 - x0) * i) / 24; g.lineTo(x, f(x)); } };
      // inside of the hull
      const inside = () => { g.beginPath(); g.moveTo(1.4, 6.2); curve(far, 1.4, W - 1.4); curve(near, W - 1.4, 1.4); g.closePath(); };
      fillPath(g, inside, lin(g, 0, 2, 0, 9, [[0, dim(col, 0.2)], [1, dim(col, 0.55)]]));
      g.save(); inside(); g.clip();
      for (let x = 5; x < W - 4; x += 2.6) line(g, x, 1.5, x + 0.3, 10, rgba(dim(col, 0.7), 0.6), 0.3);
      grainLines(g, 2, 2, W - 4, 7, dim(col, 0.3), rng, false, 0.6);
      // thwarts, oars and a coil of rope
      for (const x of [11.5, 24.5]) board(g, x - 1.2, far(x) - 0.2, 2.4, near(x) - far(x) + 0.2, lit(col, 0.15), rng, { vertical: true, knots: 0 });
      for (const [x0, y0, x1, y1] of [[5, 5.6, 30, 3.8], [6.5, 7.2, 31, 5.6]]) { line(g, x0, y0 + 0.3, x1 - 5, y1 + 0.3, rgba(SHADE, 0.4), 0.6); line(g, x0, y0, x1 - 5, y1, '#b0916a', 0.5); ellipse(g, x1 - 3, y1 - 0.15, 2.4, 0.7, lin(g, x1 - 5, 0, x1 - 1, 0, [[0, '#c0a07a'], [1, '#7a5c3c']]), -0.07); }
      g.strokeStyle = '#b8a078'; g.lineWidth = 0.35;
      for (let r = 0.5; r < 1.8; r += 0.45) { g.beginPath(); g.ellipse(29.6, 6.2, r * 1.3, r * 0.7, 0, 0, TAU); g.stroke(); }
      g.restore();
      // clinker strakes of the near side
      const side = () => { g.beginPath(); g.moveTo(1.4, 6.4); curve(near, 1.4, W - 1.4); curve(keel, W - 1.4, 1.4); g.closePath(); };
      fillPath(g, side, col);
      g.save(); side(); g.clip();
      for (let s = 0; s < 3; s++) {
        const f0 = s / 3, f1 = (s + 1) / 3;
        const strake = () => { g.beginPath(); for (let i = 0; i <= 24; i++) { const x = 1.4 + ((W - 2.8) * i) / 24; const y = near(x) + (keel(x) - near(x)) * f0; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } for (let i = 24; i >= 0; i--) { const x = 1.4 + ((W - 2.8) * i) / 24; g.lineTo(x, near(x) + (keel(x) - near(x)) * f1 + 0.3); } g.closePath(); };
        const c = jitter(col, rng, 0.05);
        fillPath(g, strake, lin(g, 0, 6, 0, 14, [[0, lit(c, 0.3 - s * 0.12)], [1, dim(c, 0.2 + s * 0.12)]]));
        g.save(); strake(); g.clip(); grainLines(g, 1, 6, W - 2, 8, c, rng, false, 0.7); g.restore();
        g.strokeStyle = 'rgba(12,8,4,0.55)'; g.lineWidth = 0.25;
        g.beginPath(); for (let i = 0; i <= 24; i++) { const x = 1.4 + ((W - 2.8) * i) / 24; const y = near(x) + (keel(x) - near(x)) * f1; if (i === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke();
      }
      for (let x = 4; x < W - 3; x += 3.2) rivet(g, x, near(x) + (keel(x) - near(x)) * 0.33, 0.15);
      g.fillStyle = lin(g, 0, 10, 0, by, [[0, 'rgba(20,30,30,0)'], [1, 'rgba(20,30,30,0.5)']]);
      g.fillRect(0, 10, W, 5);
      g.restore();
      // gunwales
      g.strokeStyle = lit(col, 0.2); g.lineWidth = 0.6;
      g.beginPath(); g.moveTo(1.4, 6.2); curve(far, 1.4, W - 1.4); g.stroke();
      g.strokeStyle = lin(g, 0, 0, W, 0, [[0, lit(col, 0.45)], [1, lit(col, 0.1)]]); g.lineWidth = 0.9;
      g.beginPath(); g.moveTo(1.4, 6.4); curve(near, 1.4, W - 1.4); g.stroke();
      poly(g, [0.6, 5.2, 2.4, 6.0, 1.6, 7.4], lit(col, 0.2));
    }, { seed: k.seed, under: (g) => contact(g, cx + 1, by - 0.8, 16.5, 2, 0.35) }),
    solid: { w: 30, h: 10 },
  };
}

function fountainProp(k: K): PropInfo {
  const W = 38, H = 33, cx = 19, by = 31.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const rimY = 21.2, rx = 17.6, ry = 6.2, irx = 15.3, iry = 5.1, botRy = 3.6, botY = by - botRy;
      const stone = '#9a948a';
      // basin wall: blocks wrapped round the curve
      const wall = () => { g.beginPath(); g.moveTo(cx - rx, rimY); g.lineTo(cx - rx, botY); g.ellipse(cx, botY, rx, botRy, 0, Math.PI, 0, true); g.lineTo(cx + rx, rimY); g.ellipse(cx, rimY, rx, ry, 0, 0, Math.PI); g.closePath(); };
      fillPath(g, wall, '#4a453e');
      g.save(); wall(); g.clip();
      const n = 12, hgt = botY - rimY;
      for (let i = 0; i < n; i++) {
        const a0 = (i / n) * Math.PI + 0.03, a1 = ((i + 1) / n) * Math.PI - 0.03, am = (a0 + a1) / 2;
        const pts: number[] = [];
        for (let s = 0; s <= 5; s++) { const a = a0 + ((a1 - a0) * s) / 5; pts.push(cx + Math.cos(a) * rx, rimY + 0.8 + Math.sin(a) * ry); }
        for (let s = 5; s >= 0; s--) { const a = a0 + ((a1 - a0) * s) / 5; pts.push(cx + Math.cos(a) * rx, rimY + hgt + Math.sin(a) * botRy - 0.1); }
        const L = -Math.cos(am) * 0.55;
        const c = jitter(stone, rng, 0.05);
        poly(g, pts, lin(g, 0, rimY, 0, by, [[0, L > 0 ? lit(c, L * 0.5) : dim(c, -L * 0.6)], [1, dim(c, 0.3 - L * 0.2)]]));
      }
      g.fillStyle = lin(g, 0, by - 3, 0, by, [[0, 'rgba(30,40,20,0)'], [1, 'rgba(30,40,20,0.45)']]);
      g.fillRect(0, by - 3, W, 3);
      g.restore();
      // coping
      g.beginPath(); g.ellipse(cx, rimY, rx, ry, 0, 0, TAU); g.ellipse(cx, rimY + 0.15, irx, iry, 0, 0, TAU, true);
      g.fillStyle = lin(g, cx - rx, rimY - ry, cx + rx, rimY + ry, [[0, lit(stone, 0.4)], [0.5, lit(stone, 0.1)], [1, dim(stone, 0.2)]]);
      g.fill();
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + 0.1; line(g, cx + Math.cos(a) * irx, rimY + 0.15 + Math.sin(a) * iry, cx + Math.cos(a) * rx, rimY + Math.sin(a) * ry, 'rgba(40,36,30,0.5)', 0.16); }
      // the pool
      const pool = () => { g.beginPath(); g.ellipse(cx, rimY + 0.15, irx, iry, 0, 0, TAU); };
      fillPath(g, pool, dim(stone, 0.45));
      g.save(); pool(); g.clip();
      ellipse(g, cx, rimY + 0.9, irx, iry, lin(g, 0, rimY - iry, 0, rimY + iry, [[0, '#244a60'], [0.5, '#2e6280'], [1, '#4a86a4']]));
      g.strokeStyle = 'rgba(200,228,240,0.35)'; g.lineWidth = 0.18;
      for (const [x, y, r] of [[cx, rimY + 0.6, 3], [cx, rimY + 0.6, 5.2], [cx - 7.6, rimY + 1.2, 1.6], [cx + 7.4, rimY + 1.4, 1.8]]) { g.beginPath(); g.ellipse(x, y, r, r * 0.33, 0, 0, TAU); g.stroke(); }
      ellipse(g, cx - 8, rimY - 1, 3.2, 0.5, 'rgba(230,242,248,0.35)');
      for (let i = 0; i < 5; i++) ellipse(g, cx - 10 + rng.next() * 20, rimY + 1 + rng.next() * 3, 0.3, 0.16, rgba(BRASS[4], 0.8));
      g.restore();
      // pedestal and upper bowl
      g.fillStyle = lin(g, cx - 1.9, 0, cx + 1.9, 0, [[0, lit(stone, 0.3)], [0.4, stone], [1, dim(stone, 0.45)]]);
      g.fillRect(cx - 1.8, 11.4, 3.6, rimY + 0.6 - 11.4);
      for (const [y, r] of [[rimY, 2.6], [13.2, 2.3]]) ellipse(g, cx, y, r, r * 0.4, lin(g, cx - r, 0, cx + r, 0, [[0, lit(stone, 0.35)], [1, dim(stone, 0.4)]]));
      g.beginPath(); g.ellipse(cx, 9.6, 6.6, 3.4, 0, 0, Math.PI); g.fillStyle = lin(g, cx - 6.6, 0, cx + 6.6, 0, [[0, lit(stone, 0.25)], [0.4, stone], [1, dim(stone, 0.5)]]); g.fill();
      ellipse(g, cx, 9.6, 6.6, 2.1, lin(g, cx - 6.6, 7.5, cx + 6.6, 11.7, [[0, lit(stone, 0.45)], [1, dim(stone, 0.15)]]));
      ellipse(g, cx, 9.7, 5.5, 1.55, lin(g, 0, 8.2, 0, 11.2, [[0, '#2a5874'], [1, '#5a94b0']]));
      // spout and finial
      g.fillStyle = lin(g, cx - 0.6, 0, cx + 0.6, 0, [[0, lit(stone, 0.3)], [1, dim(stone, 0.4)]]);
      g.fillRect(cx - 0.55, 6.4, 1.1, 3.2);
      ellipse(g, cx, 5.6, 1.4, 1.5, ballShade(g, cx, 5.6, 1.4, stone, 0.5, 0.5));
      return (gg) => {
        // falling water: the jet, the sheets over the bowl lip and the splashes
        gg.strokeStyle = 'rgba(220,240,250,0.65)'; gg.lineWidth = 0.35;
        gg.beginPath(); gg.moveTo(cx, 4.2); gg.quadraticCurveTo(cx - 0.8, 0.6, cx - 2.8, 7.8); gg.moveTo(cx, 4.2); gg.quadraticCurveTo(cx + 0.9, 0.8, cx + 2.9, 7.9); gg.stroke();
        for (const d of [-1, 1]) for (const off of [0, 1.6]) {
          const x0 = cx + d * (6.2 - off * 0.8), y0 = 10.1 + off * 0.4;
          gg.strokeStyle = 'rgba(190,225,240,0.5)'; gg.lineWidth = 0.55;
          gg.beginPath(); gg.moveTo(x0, y0); gg.quadraticCurveTo(x0 + d * 1.6, y0 + 1.5, x0 + d * 1.8, rimY + 1.2 + off * 0.8); gg.stroke();
          gg.strokeStyle = 'rgba(245,252,255,0.7)'; gg.lineWidth = 0.2;
          gg.beginPath(); gg.moveTo(x0, y0); gg.quadraticCurveTo(x0 + d * 1.6, y0 + 1.5, x0 + d * 1.8, rimY + 1.2 + off * 0.8); gg.stroke();
          ellipse(gg, x0 + d * 1.8, rimY + 1.3 + off * 0.8, 1.1, 0.35, 'rgba(235,248,255,0.55)');
        }
      };
    }, { seed: k.seed, under: (g) => contact(g, cx + 1, by - 0.6, 19, 3, 0.4) }),
    solid: { w: 34, h: 14 },
  };
}

function statueProp(k: K): PropInfo {
  const W = 20, H = 39, cx = 10, by = 37.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const st = '#a6a094';
      // stepped plinth with an inscription
      stoneBlock(g, 1.2, by - 2.6, 17.6, 2.6, STONE[3], rng, 0.4);
      g.fillStyle = lin(g, 0, by - 3.4, 0, by - 2.5, [[0, lit(STONE[4], 0.25)], [1, STONE[4]]]); g.fillRect(1.2, by - 3.4, 17.6, 0.9);
      stoneBlock(g, 3.0, by - 11.4, 14, 8.1, jitter(STONE[4], rng, 0.03), rng, 0.4);
      g.fillStyle = lin(g, 3, 0, 17, 0, [[0, 'rgba(255,240,220,0.1)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.3)']]); g.fillRect(3, by - 11.4, 14, 8.1);
      roundRect(g, 5, by - 9.6, 10, 4.2, 0.3, rgba('#3a362e', 0.25));
      for (const [y, w] of [[by - 8.4, 7], [by - 6.8, 5]]) line(g, cx - w / 2, y, cx + w / 2, y, 'rgba(40,36,30,0.6)', 0.35);
      stoneBlock(g, 2.4, by - 12.6, 15.2, 1.4, lit(STONE[4], 0.1), rng, 0.3);
      g.fillStyle = lit(STONE[5], 0.1); g.fillRect(2.6, by - 13.3, 14.8, 0.8);
      // the saint: a hooded, robed figure with a staff, a book held to his breast
      const foot = by - 12.9;
      const shade = (x0: number, x1: number) => lin(g, x0, 0, x1, 0, [[0, lit(st, 0.4)], [0.3, lit(st, 0.12)], [0.65, dim(st, 0.22)], [1, dim(st, 0.52)]]);
      // the staff behind his right shoulder
      g.fillStyle = lin(g, cx + 4.4, 0, cx + 5.4, 0, [[0, lit(st, 0.25)], [1, dim(st, 0.45)]]);
      g.fillRect(cx + 4.35, 1.6, 0.9, foot - 1.6);
      g.strokeStyle = shade(cx + 3.4, cx + 6.8); g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(cx + 4.8, 2.4); g.quadraticCurveTo(cx + 4.9, 0.3, cx + 6.2, 0.8); g.quadraticCurveTo(cx + 7.0, 1.6, cx + 6.0, 2.4); g.stroke();
      // mantle falling from the shoulders
      const robe = () => { g.beginPath(); g.moveTo(cx - 2.6, 7.2); g.quadraticCurveTo(cx - 4.9, 8.2, cx - 4.6, 12.2); g.quadraticCurveTo(cx - 5.0, 19, cx - 5.6, foot); g.lineTo(cx + 5.6, foot); g.quadraticCurveTo(cx + 5.0, 19, cx + 4.6, 12.2); g.quadraticCurveTo(cx + 4.9, 8.2, cx + 2.6, 7.2); g.quadraticCurveTo(cx, 6.4, cx - 2.6, 7.2); g.closePath(); };
      fillPath(g, robe, shade(cx - 5.6, cx + 5.6));
      g.save(); robe(); g.clip();
      // deep folds running down from the book, curving out at the hem
      for (let i = 0; i < 7; i++) {
        const x = cx - 4.2 + i * 1.4 + (rng.next() - 0.5) * 0.3;
        const lean = (x - cx) * 0.18;
        g.strokeStyle = rgba(dim(st, 0.6), 0.6); g.lineWidth = 0.42;
        g.beginPath(); g.moveTo(x, 14.6); g.quadraticCurveTo(x + lean + 0.4, 19.5, x + lean * 2, foot); g.stroke();
        g.strokeStyle = rgba(lit(st, 0.5), 0.45); g.lineWidth = 0.22;
        g.beginPath(); g.moveTo(x - 0.5, 14.8); g.quadraticCurveTo(x + lean - 0.1, 19.5, x + lean * 2 - 0.5, foot); g.stroke();
      }
      g.fillStyle = lin(g, 0, 18, 0, foot, [[0, 'rgba(60,70,40,0)'], [1, 'rgba(60,70,40,0.35)']]);
      g.fillRect(cx - 6, 18, 12, foot - 18);
      g.restore();
      // the hem pooling on the plinth
      fillPath(g, () => { g.beginPath(); g.moveTo(cx - 5.9, foot + 0.1); g.quadraticCurveTo(cx, foot - 1.2, cx + 5.9, foot + 0.1); g.closePath(); }, dim(st, 0.3));
      // sleeves and hands holding the book
      const sleeve = (d: number) => { g.beginPath(); g.moveTo(cx + d * 3.9, 8.6); g.quadraticCurveTo(cx + d * 5.0, 12.8, cx + d * 1.6, 14.2); g.lineTo(cx + d * 0.8, 12.9); g.quadraticCurveTo(cx + d * 3.0, 12, cx + d * 2.6, 8.9); g.closePath(); };
      fillPath(g, () => sleeve(-1), lin(g, cx - 5, 0, cx, 0, [[0, lit(st, 0.35)], [1, st]]));
      fillPath(g, () => sleeve(1), lin(g, cx, 0, cx + 5, 0, [[0, st], [1, dim(st, 0.45)]]));
      poly(g, [cx - 2.1, 11.0, cx + 2.2, 10.6, cx + 2.4, 13.8, cx - 1.9, 14.2], lin(g, cx - 2, 10.6, cx + 2.4, 14.2, [[0, lit(st, 0.3)], [1, dim(st, 0.3)]]));
      poly(g, [cx - 2.1, 11.0, cx + 2.2, 10.6, cx + 2.2, 11.2, cx - 2.1, 11.6], lit(st, 0.45));
      line(g, cx + 0.05, 11.2, cx + 0.25, 14.0, rgba(dim(st, 0.6), 0.7), 0.16);
      for (const [hx, hy] of [[cx - 1.9, 12.9], [cx + 2.1, 12.5]]) ellipse(g, hx, hy, 0.7, 0.55, rad(g, hx - 0.25, hy - 0.2, 0.05, hx, hy, 0.75, [[0, lit(st, 0.4)], [1, dim(st, 0.25)]]));
      // head in a hood, with a gilt halo behind
      g.strokeStyle = lin(g, cx - 3.2, 0, cx + 3.2, 0, [[0, BRASS[4]], [1, BRASS[1]]]); g.lineWidth = 0.5;
      g.beginPath(); g.ellipse(cx, 4.4, 3.2, 3.2, 0, 0, TAU); g.stroke();
      const hood = () => { g.beginPath(); g.moveTo(cx - 2.9, 8.4); g.quadraticCurveTo(cx - 3.3, 2.6, cx, 2.2); g.quadraticCurveTo(cx + 3.3, 2.6, cx + 2.9, 8.4); g.quadraticCurveTo(cx, 7.4, cx - 2.9, 8.4); g.closePath(); };
      fillPath(g, hood, lin(g, cx - 3.2, 0, cx + 3.2, 0, [[0, lit(st, 0.35)], [0.5, st], [1, dim(st, 0.5)]]));
      ellipse(g, cx + 0.1, 5.2, 1.7, 2.1, dim(st, 0.55));
      ellipse(g, cx - 0.1, 5.3, 1.45, 1.85, rad(g, cx - 0.7, 4.6, 0.1, cx, 5.3, 2.0, [[0, lit(st, 0.42)], [0.6, st], [1, dim(st, 0.4)]]));
      // brow, eyes in shadow, nose and a carved beard
      line(g, cx - 1.1, 4.6, cx - 0.3, 4.7, rgba(dim(st, 0.7), 0.85), 0.24);
      line(g, cx + 0.3, 4.7, cx + 1.1, 4.6, rgba(dim(st, 0.7), 0.85), 0.24);
      line(g, cx + 0.05, 4.8, cx + 0.2, 5.7, rgba(dim(st, 0.5), 0.8), 0.2);
      poly(g, [cx - 1.3, 6.0, cx + 1.3, 6.0, cx + 0.8, 7.6, cx, 8.1, cx - 0.8, 7.6], lin(g, cx - 1.3, 0, cx + 1.3, 0, [[0, lit(st, 0.25)], [1, dim(st, 0.35)]]));
      for (const d of [-0.5, 0, 0.5]) line(g, cx + d, 6.4, cx + d * 0.6, 7.7, rgba(dim(st, 0.55), 0.6), 0.1);
      // weather: lichen and moss
      for (let i = 0; i < 7; i++) ellipse(g, cx - 5 + rng.next() * 10, 12 + rng.next() * (foot - 12), 0.3 + rng.next() * 0.35, 0.25, rgba(rng.next() < 0.5 ? '#8a9058' : '#c8c4ac', 0.3));
      for (let i = 0; i < 14; i++) ellipse(g, 3 + rng.next() * 14, by - 3.4 - rng.next() * 1.6, 0.7, 0.45, rgba(rng.next() < 0.5 ? '#557a30' : '#6a8e3a', 0.7));
      tufts(g, 1.5, 18.5, by, rng, 5, 1.8);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.4, 9.6, 1.8, 0.45) }),
    solid: { w: 14, h: 8 },
  };
}

function dryingrackProp(k: K): PropInfo {
  const W = 28, H = 24, cx = 14, by = 22.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      // A-frames at either end
      for (const [x, d] of [[3.2, 0], [W - 3.2, 0.2]] as const) {
        slantBeam(g, x, 1.6, x - 2.2, by, 1.0, dim(GREY, d), rng);
        slantBeam(g, x, 1.6, x + 2.2, by, 1.0, dim(GREY, d + 0.1), rng);
      }
      const poleY = [3.2, 11.2];
      for (const [pi, y] of poleY.entries()) {
        const xs = pi === 0 ? [6.4, 9.6, 12.8, 16.0, 19.2, 22.2] : [7.8, 11.0, 14.2, 17.4, 20.6];
        for (const x of xs) herbBundle(g, x + (rng.next() - 0.5) * 0.4, y + 0.6, 5 + rng.next() * 2.6, Math.floor(rng.next() * 6), rng);
        g.fillStyle = lin(g, 0, y - 0.5, 0, y + 0.6, [[0, lit(GREY, 0.35)], [1, dim(GREY, 0.35)]]);
        g.fillRect(1.2, y - 0.5, W - 2.4, 1.1);
      }
      for (const [x, y] of [[3.2, 3.2], [W - 3.2, 3.2], [2.2, 11.2], [W - 2.2, 11.2]]) { g.strokeStyle = '#b8a070'; g.lineWidth = 0.25; g.beginPath(); g.moveTo(x - 0.6, y - 0.5); g.lineTo(x + 0.6, y + 0.5); g.moveTo(x + 0.6, y - 0.5); g.lineTo(x - 0.6, y + 0.5); g.stroke(); }
    }, { seed: k.seed, under: (g) => { contact(g, 3.4, by, 3.2, 0.8, 0.4); contact(g, W - 3, by, 3.2, 0.8, 0.4); contact(g, cx, by - 1, 10, 1.2, 0.15); } }),
    solid: { w: 24, h: 4 },
  };
}

function spinningwheelProp(k: K): PropInfo {
  const W = 20, H = 20, cx = 10, by = 18.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = HONEY;
      const wx = 8.2, wy = 7.6, r = 6.0;
      // distaff with its cloud of wool
      post(g, 2.6, 3.2, 13, 0.6, dim(col, 0.1), rng, 'none');
      blob(g, 2.8, 3.4, 2.2, 2.6, rng, rad(g, 2, 2.6, 0.2, 2.8, 3.4, 2.8, [[0, '#fffaf0'], [0.6, '#e4dcc8'], [1, '#b0a48a']]), 10, 0.25);
      g.strokeStyle = 'rgba(160,150,130,0.5)'; g.lineWidth = 0.1;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(1.2 + rng.next() * 3, 1.5 + rng.next() * 4); g.quadraticCurveTo(2.8, 3.4, 1.4 + rng.next() * 3, 2 + rng.next() * 3.6); g.stroke(); }
      // the stock (a slanted bench) on three legs
      slantBeam(g, 14.6, 13.4, 15.8, by - 1.8, 0.9, dim(col, 0.45), rng);
      slantBeam(g, 3.6, 13.8, 2.4, by, 1.0, dim(col, 0.1), rng);
      slantBeam(g, 16.8, 13.2, 18.0, by, 1.0, dim(col, 0.25), rng);
      slantBeam(g, 1.8, 13.8, 18.4, 12.6, 1.6, col, rng);
      // treadle and footman
      board(g, 6.2, by - 1.2, 6.4, 0.9, dim(col, 0.2), rng, { knots: 0 });
      line(g, 9.2, by - 1.1, wx + 1.4, wy + 1.6, dim(col, 0.35), 0.28);
      // the wheel: rim, spokes and hub on its upright
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        line(g, wx + Math.cos(a) * 1.1, wy + Math.sin(a) * 1.1, wx + Math.cos(a) * (r - 0.5), wy + Math.sin(a) * (r - 0.5), (-Math.cos(a) - Math.sin(a)) > 0 ? lit(col, 0.2) : dim(col, 0.25), 0.3);
      }
      g.beginPath(); g.arc(wx, wy, r, 0, TAU); g.arc(wx, wy, r - 0.85, 0, TAU, true);
      g.fillStyle = lin(g, wx - r, wy - r, wx + r, wy + r, [[0, lit(col, 0.35)], [0.5, col], [1, dim(col, 0.45)]]); g.fill();
      post(g, wx + 0.6, wy, 13.2, 1.1, dim(col, 0.1), rng, 'none');
      ellipse(g, wx, wy, 1.1, 1.1, ballShade(g, wx, wy, 1.1, col, 0.5, 0.5));
      // drive band to the flyer
      g.strokeStyle = 'rgba(230,220,196,0.7)'; g.lineWidth = 0.12;
      g.beginPath(); g.moveTo(wx + 0.4, wy - r); g.lineTo(15.8, 8.6); g.moveTo(wx + 0.4, wy + r); g.lineTo(15.8, 9.6); g.stroke();
      // the maidens and flyer with its bobbin of yarn
      for (const x of [14.8, 18.0]) post(g, x, 7.4, 12.8, 0.8, dim(col, 0.15), rng, 'round');
      board(g, 14.2, 11.8, 4.6, 0.9, col, rng, { knots: 0 });
      roundRect(g, 15.1, 8.3, 2.6, 1.5, 0.6, lin(g, 0, 8.3, 0, 9.8, [[0, '#f4ecd8'], [1, '#a89a7a']]));
      g.strokeStyle = dim(col, 0.2); g.lineWidth = 0.25;
      g.beginPath(); g.moveTo(14.9, 8.0); g.lineTo(18.1, 8.0); g.moveTo(14.9, 10.1); g.lineTo(18.1, 10.1); g.stroke();
      line(g, 3.6, 3.8, 15.2, 8.9, 'rgba(236,228,210,0.55)', 0.1);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.5, 8.4, 1.4, 0.4) }),
    solid: { w: 14, h: 4 },
  };
}

function millstoneProp(k: K): PropInfo {
  const W = 32, H = 20, cx = 16, by = 18.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const st = '#9a9486';
      // bed stone, then the runner stone upon it
      discSide(g, cx, 12.0, 14.6, 4.6, 3.1, lin(g, cx - 14.6, 0, cx + 14.6, 0, [[0, lit(st, 0.15)], [0.35, st], [1, dim(st, 0.5)]]));
      ellipse(g, cx, 12.0, 14.6, 4.6, lit(st, 0.08));
      for (let i = 0; i < 30; i++) ellipse(g, cx + (rng.next() - 0.5) * 27, 13 + rng.next() * 4.5, 0.3, 0.2, rgba(rng.next() < 0.5 ? '#5a564e' : '#f4f2ea', 0.5));
      ellipse(g, cx + 1, 12.3, 13.6, 4.1, 'rgba(250,248,240,0.55)');
      discSide(g, cx, 8.4, 13.2, 4.2, 3.2, lin(g, cx - 13.2, 0, cx + 13.2, 0, [[0, lit(st, 0.2)], [0.35, st], [1, dim(st, 0.5)]]));
      g.save(); g.beginPath(); g.rect(0, 8, W, 8); g.clip();
      for (let i = 0; i < 40; i++) ellipse(g, cx + (rng.next() - 0.5) * 25, 9 + rng.next() * 5.5, 0.25, 0.18, rgba(rng.next() < 0.5 ? '#5a564e' : '#e8e4da', 0.45));
      g.restore();
      ellipse(g, cx, 8.4, 13.2, 4.2, lin(g, cx - 13, 4.2, cx + 13, 12.6, [[0, lit(st, 0.35)], [0.6, st], [1, dim(st, 0.2)]]));
      // dressing: harps of furrows cut into the face
      g.save(); g.beginPath(); g.ellipse(cx, 8.4, 13.2, 4.2, 0, 0, TAU); g.clip();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU;
        for (let j = 0; j < 3; j++) {
          const o = j * 1.4;
          const x0 = cx + Math.cos(a) * 2.4 + Math.cos(a + Math.PI / 2) * o * 0.6, y0 = 8.4 + (Math.sin(a) * 2.4 + Math.sin(a + Math.PI / 2) * o * 0.6) * 0.32;
          const x1 = cx + Math.cos(a) * 13 + Math.cos(a + Math.PI / 2) * o, y1 = 8.4 + (Math.sin(a) * 13 + Math.sin(a + Math.PI / 2) * o) * 0.32;
          line(g, x0, y0, x1, y1, 'rgba(50,46,40,0.45)', 0.22);
          line(g, x0 - 0.15, y0 - 0.1, x1 - 0.15, y1 - 0.1, 'rgba(240,236,226,0.25)', 0.12);
        }
      }
      for (let i = 0; i < 50; i++) ellipse(g, cx + (rng.next() - 0.5) * 26, 8.4 + (rng.next() - 0.5) * 8, 0.2, 0.14, rgba(rng.next() < 0.5 ? '#5a564e' : '#f4f2ea', 0.4));
      g.restore();
      // the eye, iron rynd and the spindle
      ellipse(g, cx, 8.4, 2.2, 0.8, '#161412');
      ironBar(g, cx - 2.2, 8.1, 4.4, 0.6);
      g.fillStyle = lin(g, cx - 0.8, 0, cx + 0.8, 0, [[0, IRON[4]], [0.4, IRON[3]], [1, IRON[0]]]);
      g.fillRect(cx - 0.75, 0.8, 1.5, 7.5);
      ellipse(g, cx, 0.8, 0.75, 0.3, IRON[4]);
      ironBar(g, cx - 1.1, 3.2, 2.2, 0.8);
      // a spill of flour on the floor
      blob(g, cx + 9, by - 0.5, 3.2, 0.9, rng, 'rgba(248,246,238,0.85)', 8, 0.25);
    }, { seed: k.seed, under: (g) => contact(g, cx + 1, by - 1.2, 15.5, 2.4, 0.42) }),
    solid: { w: 28, h: 10 },
  };
}

/** A barrel lying with its head toward us, body receding behind. */
function barrelEnd(g: G, x: number, y: number, r: number, col: string, rng: RNG, tap: boolean) {
  const depth = 1.9;
  const body = () => { g.beginPath(); g.moveTo(x - r, y); g.lineTo(x - r * 0.97, y - depth); g.ellipse(x, y - depth, r * 0.97, r, 0, Math.PI, 0); g.lineTo(x + r, y); g.closePath(); };
  fillPath(g, body, lin(g, x - r, 0, x + r, 0, [[0, dim(col, 0.15)], [0.3, lit(col, 0.25)], [0.6, col], [1, dim(col, 0.5)]]));
  g.save(); body(); g.clip();
  for (let i = 1; i < 6; i++) line(g, x - r + (2 * r * i) / 6, y - depth - r, x - r + (2 * r * i) / 6, y, rgba(dim(col, 0.6), 0.5), 0.12);
  g.strokeStyle = lin(g, x - r, 0, x + r, 0, [[0, IRON[4]], [1, IRON[0]]]); g.lineWidth = 0.6;
  g.beginPath(); g.ellipse(x, y - depth + 0.6, r, r, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
  g.restore();
  // hoop round the chime, then the head
  ellipse(g, x, y, r + 0.12, r + 0.12, lin(g, x - r, y - r, x + r, y + r, [[0, IRON[4]], [0.5, IRON[2]], [1, IRON[0]]]));
  ellipse(g, x, y, r - 0.35, r - 0.35, lin(g, x - r, y - r, x + r, y + r, [[0, lit(CUT[1], 0.1)], [1, dim(CUT[1], 0.3)]]));
  const hr = r - 0.95;
  ellipse(g, x, y, hr, hr, lin(g, x - hr, y - hr, x + hr, y + hr, [[0, lit(col, 0.3)], [0.5, col], [1, dim(col, 0.3)]]));
  g.save(); g.beginPath(); g.arc(x, y, hr, 0, TAU); g.clip();
  for (let i = 1; i < 4; i++) line(g, x - hr + (2 * hr * i) / 4, y - hr, x - hr + (2 * hr * i) / 4, y + hr, rgba(dim(col, 0.6), 0.55), 0.14);
  g.fillStyle = rgba(SHADE, 0.3);
  g.beginPath(); g.arc(x, y, hr, 0, TAU); g.arc(x + 0.35, y + 0.4, hr, 0, TAU, true); g.fill();
  g.restore();
  if (tap) {
    roundRect(g, x - 0.6, y + hr * 0.35, 1.2, 1.2, 0.3, lin(g, x - 0.6, 0, x + 0.6, 0, [[0, '#b08a5a'], [1, '#5a3e22']]));
    poly(g, [x - 0.3, y + hr * 0.35 + 1.1, x + 0.3, y + hr * 0.35 + 1.1, x + 0.2, y + hr * 0.35 + 2.0, x - 0.2, y + hr * 0.35 + 2.0], '#6a4a2a');
  } else if (rng.next() < 0.6) {
    // a chalked tally
    g.strokeStyle = 'rgba(240,236,226,0.7)'; g.lineWidth = 0.18;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(x - 1 + i * 0.6, y - 0.8); g.lineTo(x - 1 + i * 0.6, y + 0.6); g.stroke(); }
    g.beginPath(); g.moveTo(x - 1.4, y + 0.4); g.lineTo(x + 0.8, y - 0.6); g.stroke();
  }
}

function barrelstackProp(k: K): PropInfo {
  const W = 30, H = 24, cx = 15, by = 22.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#7e5838', r = 5.6;
      const low = by - r - 0.3;
      barrelEnd(g, cx - 6.6, low, r, jitter(col, rng, 0.05), rng, true);
      barrelEnd(g, cx + 6.6, low, r, jitter(col, rng, 0.05), rng, true);
      for (const [x, d] of [[cx - 10.6, 1], [cx - 2.6, -1], [cx + 2.6, 1], [cx + 10.6, -1]] as const) poly(g, [x - 1.3, by, x + 1.3, by, x + d * 1.3, by - 1.0], lin(g, 0, by - 1, 0, by, [[0, '#6a5034'], [1, '#3a2818']]));
      barrelEnd(g, cx, low - 9.1, r, jitter(col, rng, 0.05), rng, false);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.3, 14, 1.9, 0.45) }),
    solid: { w: 26, h: 10 },
  };
}

// ---------------------------------------------------------------- small things

function crossProp(k: K): PropInfo {
  const W = 16, H = 30, cx = 8, by = 28.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#7a6048';
      stoneBlock(g, 4.2, by - 2.6, 7.6, 2.6, STONE[3], rng, 0.4);
      board(g, cx - 1.4, 2.4, 2.8, by - 2.4 - 2.2, col, rng, { vertical: true, knots: 1 });
      board(g, 1.4, 7.6, 13.2, 2.6, lit(col, 0.05), rng, { knots: 0 });
      // a little gabled roof over the head
      slantBeam(g, 3.8, 3.8, cx + 0.3, 0.6, 1.0, dim(col, 0.1), rng);
      slantBeam(g, 12.2, 3.8, cx - 0.3, 0.6, 1.0, dim(col, 0.3), rng);
      // a wreath of dried flowers at the crossing
      for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; ellipse(g, cx + Math.cos(a) * 1.9, 8.9 + Math.sin(a) * 1.9, 0.55, 0.42, i % 3 ? '#6a7a3a' : ['#c8a040', '#e0d8c8', '#a84a3a'][i % 9 === 0 ? 2 : (i / 3) % 2 ? 1 : 0], a); }
      for (const [x, y] of [[cx, 8.9], [cx - 4.5, 8.9], [cx + 4.5, 8.9]]) rivet(g, x, y, 0.22);
      tufts(g, 3, 13, by, rng, 5, 2);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.6, by - 0.3, 5, 1.2, 0.42) }),
    solid: { w: 6, h: 3 },
  };
}

function potProp(k: K): PropInfo {
  const W = 12, H = 14, cx = 6, by = 12.5;
  const flowers = k.opt === 'flowers';
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const clay = '#b0643e';
      const body = () => { g.beginPath(); g.moveTo(cx - 3.3, 5.4); g.bezierCurveTo(cx - 4.9, 7, cx - 4.4, 10.8, cx - 2.9, by - 0.2); g.quadraticCurveTo(cx, by + 0.4, cx + 2.9, by - 0.2); g.bezierCurveTo(cx + 4.4, 10.8, cx + 4.9, 7, cx + 3.3, 5.4); g.closePath(); };
      fillPath(g, body, rad(g, cx - 1.6, 7.4, 0.2, cx, 8.4, 5.2, [[0, lit(clay, 0.35)], [0.5, clay], [1, dim(clay, 0.5)]]));
      g.save(); body(); g.clip();
      for (let y = 6; y < by; y += 0.9) line(g, 0, y, W, y + 0.15, rgba(dim(clay, 0.4), 0.2), 0.1);
      g.strokeStyle = rgba('#f0dcc0', 0.5); g.lineWidth = 0.22;
      g.beginPath(); for (let x = cx - 4.5; x < cx + 4.6; x += 0.9) g.lineTo(x, 8.2 + ((x * 1.11) % 1.8 > 0.9 ? 0.5 : -0.1)); g.stroke();
      g.restore();
      ellipse(g, cx, 4.8, 3.9, 1.3, lin(g, cx - 3.9, 0, cx + 3.9, 0, [[0, lit(clay, 0.4)], [1, dim(clay, 0.35)]]));
      ellipse(g, cx, 4.85, 2.9, 0.85, flowers ? '#3a2a1a' : '#2a160c');
      if (flowers) {
        for (let i = 0; i < 9; i++) blade(g, cx + (rng.next() - 0.5) * 4, 5, 2.4 + rng.next() * 2, -Math.PI / 2 + (rng.next() - 0.5) * 1.3, (rng.next() - 0.5) * 0.8, 0.6, LEAF[2 + Math.floor(rng.next() * 3)]);
        for (const [fx, fy, c] of [[cx - 2, 1.8, '#e8c040'], [cx + 1.5, 1.2, '#e8a0a8'], [cx + 0.2, 2.8, '#f4f0e6'], [cx - 0.6, 0.9, '#e8a0a8'], [cx + 2.8, 2.9, '#e8c040']] as const) {
          for (let p = 0; p < 5; p++) { const a = (p / 5) * TAU; ellipse(g, fx + Math.cos(a) * 0.5, fy + Math.sin(a) * 0.4, 0.45, 0.32, p < 3 ? lit(c, 0.15) : dim(c, 0.12), a); }
          ellipse(g, fx, fy, 0.24, 0.22, '#d8962a');
        }
      }
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.5, by - 0.2, 4.4, 1.2, 0.42) }),
    solid: { w: 8, h: 4 },
  };
}

function ladderProp(k: K): PropInfo {
  const W = 12, H = 26, cx = 6, by = 24.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#8a6c4a';
      for (let y = by - 2.6; y > 2; y -= 3.8) {
        const t = y / by;
        const xl = 2.3 + (1 - t) * 0.5, xr = 9.7 - (1 - t) * 0.5;
        g.fillStyle = lin(g, 0, y - 0.55, 0, y + 0.55, [[0, lit(col, 0.35)], [0.5, col], [1, dim(col, 0.45)]]);
        g.fillRect(xl, y - 0.55, xr - xl, 1.1);
        g.fillStyle = 'rgba(10,6,4,0.3)'; g.fillRect(xl, y + 0.55, xr - xl, 0.4);
      }
      for (const [x0, x1, d] of [[2.2, 2.8, 0], [9.8, 9.2, 0.25]] as const) {
        g.save();
        const path = () => { g.beginPath(); g.moveTo(x0 - 0.7, by); g.lineTo(x1 - 0.65, 1); g.quadraticCurveTo(x1, 0.3, x1 + 0.65, 1); g.lineTo(x0 + 0.7, by); g.closePath(); };
        fillPath(g, path, lin(g, x0 - 0.7, 0, x0 + 0.7, 0, [[0, lit(col, 0.3 - d)], [0.5, dim(col, d)], [1, dim(col, 0.4 + d)]]));
        path(); g.clip(); grainLines(g, x0 - 1, 0, 2, by, col, rng, true, 0.8);
        g.restore();
      }
    }, { seed: k.seed, under: (g) => { contact(g, 2.4, by, 1.6, 0.6, 0.4); contact(g, 9.8, by, 1.6, 0.6, 0.4); } }),
  };
}

function stairsDownProp(k: K): PropInfo {
  const W = 16, H = 16;
  return {
    sprite: art(W, H, 8, 15, (g) => {
      const rng = rngOf(k);
      g.fillStyle = '#0c0a09'; g.fillRect(0, 0, W, H);
      // steps sinking into the dark, each darker and cooler than the last
      const n = 5, top = 2.2;
      for (let i = 0; i < n; i++) {
        const y = top + (i * (H - top)) / n, h = (H - top) / n;
        const k2 = i / (n - 1);
        const c = dim(STONE[4], 0.12 + k2 * 0.7);
        stoneBlock(g, 2.4, y, W - 4.8, h * 0.62, c, rng, 0.2);
        g.fillStyle = lin(g, 0, y + h * 0.62, 0, y + h, [[0, dim(c, 0.4)], [1, dim(c, 0.7)]]);
        g.fillRect(2.4, y + h * 0.62, W - 4.8, h * 0.38);
      }
      // the stairwell's walls and the lip of the floor above
      for (const [x, d] of [[0, 0], [W - 2.4, 0.3]] as const) {
        for (let y = 0; y < H; y += 2.6) stoneBlock(g, x + 0.1, y + 0.1, 2.2, 2.4, dim(STONE[3], d + y * 0.03), rng, 0.3);
      }
      g.fillStyle = lin(g, 2.4, 0, 5, 0, [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(2.4, top, 2.6, H - top);
      for (let x = 0; x < W; x += 3.2) stoneBlock(g, x + 0.1, 0.1, 3.0, 2.1, jitter(STONE[4], rng, 0.05), rng, 0.3);
      g.fillStyle = lin(g, 0, top, 0, top + 1.6, [[0, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(2.4, top, W - 4.8, 1.6);
    }, { seed: k.seed, rim: 0.35, grain: 5 }),
    flat: true,
  };
}

function bloodpoolProp(k: K): PropInfo {
  const W = 16, H = 10, cx = 8, by = 8.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      blob(g, cx, 4.8, 6.2, 2.9, rng, rad(g, cx - 0.5, 4.6, 0.3, cx, 4.8, 6.6, [[0, '#5e0c0c'], [0.7, '#4a0909'], [1, '#2e0606']]), 12, 0.3);
      blob(g, cx - 3.4, 3.9, 2.2, 1.1, rng, '#520a0a', 8, 0.3);
      blob(g, cx + 0.8, 5.1, 3.4, 1.4, rng, 'rgba(110,16,16,0.55)', 9, 0.25);
      for (let i = 0; i < 9; i++) { const a = rng.next() * TAU, d = 6.8 + rng.next() * 1.4; ellipse(g, cx + Math.cos(a) * d, 4.8 + Math.sin(a) * d * 0.5, 0.25 + rng.next() * 0.35, 0.18 + rng.next() * 0.16, '#4a0808'); }
      ellipse(g, cx - 2, 3.9, 1.6, 0.28, 'rgba(255,200,200,0.22)', -0.08);
      ellipse(g, cx + 1.8, 4.5, 0.6, 0.14, 'rgba(255,215,215,0.25)');
    }, { seed: k.seed, rim: 0.2, grain: 4 }),
    flat: true,
  };
}

function breadbasketProp(k: K): PropInfo {
  const W = 16, H = 12, cx = 8, by = 10.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const wick = '#a8864e';
      const rimY = 5.4, rx = 6.6, ry = 2.3;
      // linen lining and loaves in the basket
      ellipse(g, cx, rimY, rx - 0.4, ry - 0.3, '#3a2a18');
      fillPath(g, () => { g.beginPath(); g.moveTo(cx - rx + 0.4, rimY + 0.4); g.quadraticCurveTo(cx - 3, 2, cx + 1, 3); g.quadraticCurveTo(cx + 5, 2.2, cx + rx - 0.4, rimY); g.lineTo(cx + rx - 0.4, rimY + 1); g.lineTo(cx - rx + 0.4, rimY + 1); g.closePath(); }, lin(g, 0, 2, 0, rimY + 1, [[0, '#f4ecdc'], [1, '#bcb096']]));
      loaf(g, cx - 2.7, 4.2, 2.5, 1.7, rng, { rot: -0.2, cuts: 3 });
      loaf(g, cx + 2.4, 3.7, 2.6, 1.6, rng, { rot: 0.15, cuts: 3 });
      loaf(g, cx - 0.2, 2.6, 2.3, 1.5, rng, { rot: 0.05, cuts: 2, dark: 0.12 });
      // woven body
      const body = () => { g.beginPath(); g.moveTo(cx - rx, rimY); g.ellipse(cx, rimY, rx, ry, 0, Math.PI, 0, true); g.lineTo(cx + rx - 1.1, by - 1); g.ellipse(cx, by - 1, rx - 1.1, 1.1, 0, 0, Math.PI); g.closePath(); };
      fillPath(g, body, lin(g, cx - rx, 0, cx + rx, 0, [[0, lit(wick, 0.2)], [0.35, wick], [1, dim(wick, 0.45)]]));
      g.save(); body(); g.clip();
      for (let row = 0; row < 6; row++) {
        const y = rimY + 0.9 + row * 0.75;
        for (let x = cx - rx + (row % 2) * 0.7; x < cx + rx; x += 1.4) {
          ellipse(g, x, y + Math.sin(((x - cx) / rx) * Math.PI / 2) * 0, 0.7, 0.32, rgba(lit(wick, 0.35), 0.5));
          ellipse(g, x + 0.1, y + 0.2, 0.6, 0.18, rgba(dim(wick, 0.5), 0.45));
        }
      }
      g.fillStyle = lin(g, 0, rimY, 0, by, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(10,6,4,0.35)']]); g.fillRect(0, rimY, W, by - rimY);
      g.restore();
      g.strokeStyle = lin(g, cx - rx, 0, cx + rx, 0, [[0, lit(wick, 0.35)], [1, dim(wick, 0.35)]]); g.lineWidth = 0.9;
      g.beginPath(); g.ellipse(cx, rimY, rx, ry, 0, 0, Math.PI); g.stroke();
      g.strokeStyle = 'rgba(60,40,18,0.5)'; g.lineWidth = 0.12;
      for (let a = 0.1; a < Math.PI; a += 0.22) { const x = cx + Math.cos(a) * rx, y = rimY + Math.sin(a) * ry; g.beginPath(); g.moveTo(x - 0.3, y - 0.35); g.lineTo(x + 0.3, y + 0.35); g.stroke(); }
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.6, by - 0.6, 6.4, 1.4, 0.42) }),
  };
}

function loomProp(k: K): PropInfo {
  const W = 26, H = 24, cx = 13, by = 22.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = HONEY;
      for (const [x, d] of [[2.4, 0], [W - 2.4, 0.25]] as const) { board(g, x - 1, 1.2, 2, by - 1.2, dim(col, d), rng, { vertical: true, knots: 0 }); board(g, x - 1.8, by - 1.2, 3.6, 1.2, dim(col, d + 0.2), rng, { knots: 0 }); }
      // warp threads from the beam to the fell of the cloth
      const x0 = 4.4, x1 = W - 4.4, fell = 11.4;
      for (let x = x0; x <= x1; x += 0.42) line(g, x, 3.6, x + (x - cx) * 0.02, fell, rgba(((x * 10) | 0) % 2 ? '#e8e0cc' : '#c8bca0', 0.9), 0.12);
      // reed/beater
      board(g, 3.2, 8.8, W - 6.4, 1.2, lit(col, 0.15), rng, { knots: 0 });
      g.fillStyle = 'rgba(30,20,12,0.35)'; for (let x = 4; x < W - 4; x += 0.6) g.fillRect(x, 8.9, 0.1, 1.0);
      // woven cloth: bands of woad on undyed, a small check
      const cloth = () => { g.beginPath(); g.rect(x0, fell, x1 - x0, 16.4 - fell); };
      g.save(); cloth(); g.clip();
      for (let y = fell; y < 16.4; y += 0.36) { const band = Math.floor((y - fell) / 1.1) % 3; g.fillStyle = band === 1 ? CLOTH.woad : band === 2 ? '#d4c8aa' : '#b8aa8a'; g.fillRect(x0, y, x1 - x0, 0.36); }
      for (let x = x0; x < x1; x += 0.42) line(g, x, fell, x, 16.4, rgba(((x * 10) | 0) % 5 === 0 ? CLOTH.woad : '#fff8e8', 0.18), 0.12);
      g.fillStyle = lin(g, x0, 0, x1, 0, [[0, 'rgba(255,240,210,0.12)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.25)']]); g.fillRect(x0, fell, x1 - x0, 6);
      g.restore();
      // shuttle resting at the fell
      poly(g, [13.4, 11.7, 14.6, 11.1, 17.6, 11.1, 18.8, 11.7, 17.6, 12.3, 14.6, 12.3], lin(g, 0, 11, 0, 12.3, [[0, '#c8a070'], [1, '#6a4a2a']]));
      line(g, 14.6, 11.7, 17.6, 11.7, CLOTH.woad, 0.25);
      // warp and cloth beams
      for (const [y, c] of [[2.6, col], [17.4, dim(col, 0.1)]] as const) {
        g.fillStyle = lin(g, 0, y - 1.1, 0, y + 1.1, [[0, lit(c, 0.4)], [0.5, c], [1, dim(c, 0.45)]]);
        g.fillRect(1.6, y - 1.1, W - 3.2, 2.2);
      }
      g.fillStyle = lin(g, 0, 16.4, 0, 18.6, [[0, '#8aa0c8'], [1, '#2a4068']]); g.fillRect(x0, 16.4, x1 - x0, 2.2);
      g.fillStyle = lin(g, 0, 1.6, 0, 3.6, [[0, '#f4ecd8'], [1, '#a89a7a']]); g.fillRect(x0, 1.7, x1 - x0, 1.8);
      // treadles
      for (const x of [9.6, 13.2, 16.8]) board(g, x - 1.2, by - 1.4, 2.4, 0.8, dim(col, 0.25), rng, { knots: 0 });
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.5, 12, 1.5, 0.4) }),
    solid: { w: 22, h: 5 },
  };
}

function tubProp(k: K): PropInfo {
  const W = 30, H = 18, cx = 15, by = 16.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const col = '#86603c';
      const rimY = 6.0, rx = 13.6, ry = 4.3, botRy = 2.8, botY = by - botRy, brx = 12.4;
      const body = () => { g.beginPath(); g.moveTo(cx - rx, rimY); g.lineTo(cx - brx, botY); g.ellipse(cx, botY, brx, botRy, 0, Math.PI, 0, true); g.lineTo(cx + rx, rimY); g.ellipse(cx, rimY, rx, ry, 0, 0, Math.PI); g.closePath(); };
      fillPath(g, body, lin(g, cx - rx, 0, cx + rx, 0, [[0, dim(col, 0.2)], [0.25, lit(col, 0.25)], [0.55, col], [1, dim(col, 0.5)]]));
      g.save(); body(); g.clip();
      for (let i = 1; i < 12; i++) { const s = Math.cos(Math.PI - (i / 12) * Math.PI); line(g, cx + s * rx, rimY + Math.sqrt(1 - s * s) * ry, cx + s * brx, botY + Math.sqrt(1 - s * s) * botRy, rgba(dim(col, 0.6), 0.5), 0.14); }
      for (const f of [0.3, 0.78]) {
        const y = rimY + (botY - rimY) * f, r = rx + (brx - rx) * f, yr = ry + (botRy - ry) * f;
        g.strokeStyle = lin(g, cx - r, 0, cx + r, 0, [[0, IRON[3]], [0.3, IRON[4]], [1, IRON[0]]]); g.lineWidth = 0.8;
        g.beginPath(); g.ellipse(cx, y, r + 0.1, yr, 0, 0.05, Math.PI - 0.05); g.stroke();
      }
      g.fillStyle = lin(g, 0, botY - 2, 0, by, [[0, 'rgba(10,6,4,0)'], [1, 'rgba(10,6,4,0.4)']]); g.fillRect(0, botY - 2, W, by - botY + 2);
      g.restore();
      // rim of stave ends, the inner wall and the soapy water
      ellipse(g, cx, rimY, rx, ry, lin(g, cx - rx, rimY - ry, cx + rx, rimY + ry, [[0, lit(col, 0.45)], [1, dim(col, 0.1)]]));
      ellipse(g, cx, rimY + 0.1, rx - 1.0, ry - 0.7, dim(col, 0.45));
      g.save(); g.beginPath(); g.ellipse(cx, rimY + 0.1, rx - 1.0, ry - 0.7, 0, 0, TAU); g.clip();
      ellipse(g, cx, rimY + 0.9, rx - 1.0, ry - 0.7, lin(g, 0, rimY - ry, 0, rimY + ry, [[0, '#6a8a98'], [1, '#a8c4cc']]));
      for (let i = 0; i < 22; i++) { const a = rng.next() * TAU, d = Math.sqrt(rng.next()); ellipse(g, cx + Math.cos(a) * (rx - 2) * d, rimY + 0.9 + Math.sin(a) * (ry - 1.2) * d, 0.5 + rng.next() * 0.8, 0.3 + rng.next() * 0.3, rgba('#f8f8f2', 0.6)); }
      ellipse(g, cx - 5, rimY + 0.2, 2.6, 0.4, 'rgba(255,255,255,0.4)');
      g.restore();
      // a linen towel over the rim
      fillPath(g, () => { g.beginPath(); g.moveTo(3.4, rimY + 1.4); g.quadraticCurveTo(5.6, rimY + 0.4, 8.2, rimY + 2.8); g.lineTo(8.0, rimY + 7.2); g.quadraticCurveTo(6.6, rimY + 7.8, 4.6, rimY + 6.8); g.closePath(); }, lin(g, 3, 0, 8.4, 0, [[0, '#f4eee0'], [1, '#b8ae96']]));
      line(g, 5.4, rimY + 2.4, 5.8, rimY + 6.6, 'rgba(150,140,120,0.5)', 0.2);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.6, 14, 2.2, 0.42) }),
    solid: { w: 26, h: 10 },
  };
}

function tentSmallProp(k: K): PropInfo {
  const W = 30, H = 24, cx = 15, by = 22.5;
  const c = hexOr(k.opt, '#b8ae94');
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      // guy ropes and pegs
      g.strokeStyle = 'rgba(200,188,156,0.85)'; g.lineWidth = 0.25;
      for (const d of [-1, 1]) {
        g.beginPath(); g.moveTo(cx + d * 8.4, 11.6); g.lineTo(cx + d * 14.2, by - 1.4); g.stroke();
        poly(g, [cx + d * 14.2 - 0.4, by - 1.8, cx + d * 14.2 + 0.4, by - 1.8, cx + d * 14.2, by - 0.3], '#6b4526');
      }
      const apex = 2.4;
      const canvas = () => { g.beginPath(); g.moveTo(cx, apex); g.quadraticCurveTo(cx - 6, 9, cx - 12.6, by - 0.6); g.lineTo(cx + 12.6, by - 0.6); g.quadraticCurveTo(cx + 6, 9, cx, apex); g.closePath(); };
      fillPath(g, canvas, lin(g, cx - 12, 0, cx + 12, 0, [[0, lit(c, 0.3)], [0.45, c], [0.55, dim(c, 0.15)], [1, dim(c, 0.45)]]));
      g.save(); canvas(); g.clip();
      weave(g, 0, 0, W, by, c, 0.45, 0.08);
      for (const d of [-6.5, 6.5]) line(g, cx, apex, cx + d, by, rgba(dim(c, 0.4), 0.5), 0.18);
      for (let i = 0; i < 18; i++) ellipse(g, rng.next() * W, apex + rng.next() * (by - apex), 0.8 + rng.next() * 2, 0.5, rgba(rng.next() < 0.5 ? '#3a2e1e' : '#fff8e8', 0.07));
      g.fillStyle = lin(g, 0, by - 5, 0, by, [[0, 'rgba(40,28,16,0)'], [1, 'rgba(40,28,16,0.4)']]); g.fillRect(0, by - 5, W, 5);
      g.restore();
      // the open door: dark inside, a bedroll glimpsed, flaps tied back
      const door = () => { g.beginPath(); g.moveTo(cx, 8.4); g.quadraticCurveTo(cx - 2.6, 14, cx - 4.6, by - 0.6); g.lineTo(cx + 4.6, by - 0.6); g.quadraticCurveTo(cx + 2.6, 14, cx, 8.4); g.closePath(); };
      fillPath(g, door, lin(g, 0, 8.4, 0, by, [[0, '#0c0806'], [1, '#2a1e14']]));
      ellipse(g, cx + 0.6, by - 1.2, 3, 0.8, rgba(CLOTH.olive, 0.8));
      for (const d of [-1, 1]) {
        fillPath(g, () => { g.beginPath(); g.moveTo(cx + d * 0.5, 8.6); g.quadraticCurveTo(cx + d * 3.2, 13.5, cx + d * 4.9, by - 0.6); g.lineTo(cx + d * 6.6, by - 0.8); g.quadraticCurveTo(cx + d * 4.4, 14, cx + d * 0.5, 8.6); g.closePath(); }, lin(g, cx + d * 0.5, 0, cx + d * 6.6, 0, [[0, dim(c, d < 0 ? 0 : 0.25)], [1, dim(c, d < 0 ? 0.25 : 0.5)]]));
        line(g, cx + d * 3.9, 15.8, cx + d * 5.5, 15.2, '#8a7048', 0.3);
      }
      // ridge pole end and the stakes at the hem
      post(g, cx, 0.4, apex + 1, 0.8, '#5a4028', rng, 'round');
      for (const d of [-1, 1]) poly(g, [cx + d * 12.4 - 0.35, by - 1.4, cx + d * 12.4 + 0.35, by - 1.4, cx + d * 12.4, by + 0.2], '#6b4526');
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.6, 14, 2, 0.4) }),
    solid: { w: 24, h: 8 },
  };
}

function bedrollProp(k: K): PropInfo {
  const W = 14, H = 26, cx = 7, by = 24.5;
  const c = hexOr(k.opt, CLOTH.olive);
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      // a hide laid down first
      const hide = () => { g.beginPath(); g.moveTo(1.4, 2); g.quadraticCurveTo(cx, 0.9, 12.6, 2.2); g.quadraticCurveTo(13.6, 13, 12.8, 24); g.quadraticCurveTo(cx, 25, 1.2, 23.8); g.quadraticCurveTo(0.4, 13, 1.4, 2); g.closePath(); };
      fillPath(g, hide, lin(g, 0, 0, W, 25, [[0, '#8a6c4c'], [1, '#4e3a28']]));
      g.save(); hide(); g.clip();
      for (let i = 0; i < 260; i++) { const x = rng.next() * W, y = rng.next() * 25; line(g, x, y, x + (rng.next() - 0.5) * 0.4, y + 0.6 + rng.next() * 0.5, rgba(rng.next() < 0.5 ? '#a8885e' : '#3a2a1c', 0.5), 0.12); }
      g.restore();
      // rolled cloak for a pillow
      const roll = '#b4a482';
      roundRect(g, 2.4, 2.6, 9.2, 4.6, 2.3, lin(g, 0, 2.6, 0, 7.2, [[0, lit(roll, 0.4)], [0.45, roll], [1, dim(roll, 0.45)]]));
      ellipse(g, 10.2, 4.9, 1.35, 2.25, lin(g, 9, 2.6, 11.6, 7.2, [[0, lit(roll, 0.25)], [1, dim(roll, 0.3)]]));
      g.strokeStyle = rgba(dim(roll, 0.6), 0.8); g.lineWidth = 0.16;
      g.beginPath(); for (let a = 0; a < TAU * 2.2; a += 0.3) { const r = 0.2 + a * 0.08; const px = 10.2 + Math.cos(a) * r * 0.6, py = 4.9 + Math.sin(a) * r; if (a === 0) g.moveTo(px, py); else g.lineTo(px, py); } g.stroke();
      for (const x of [4.4, 7.4]) { g.fillStyle = lin(g, 0, 2.5, 0, 7.3, [[0, '#8a6038'], [1, '#3e2814']]); g.fillRect(x, 2.5, 0.6, 4.8); }
      line(g, 3, 3.6, 9.2, 3.4, rgba(lit(roll, 0.5), 0.5), 0.2);
      // the blanket, its top turned back
      const bl = () => { g.beginPath(); g.moveTo(1.8, 8.8); g.quadraticCurveTo(cx, 8.2, 12.2, 8.8); g.quadraticCurveTo(12.8, 16, 12.2, 23.4); g.quadraticCurveTo(cx, 24.2, 1.8, 23.4); g.quadraticCurveTo(1.2, 16, 1.8, 8.8); g.closePath(); };
      fillPath(g, bl, lin(g, 1, 8, 13, 24, [[0, lit(c, 0.3)], [0.5, c], [1, dim(c, 0.4)]]));
      g.save(); bl(); g.clip();
      weave(g, 0, 8, W, 25, c, 0.5, 0.07);
      drape(g, 2, 11, 12, 23, c, rng, 6);
      g.fillStyle = lin(g, 0, 8.4, 0, 10.4, [[0, lit(c, 0.45)], [1, lit(c, 0.1)]]); g.fillRect(0, 8.2, W, 2.0);
      g.fillStyle = 'rgba(10,6,4,0.3)'; g.fillRect(0, 10.2, W, 0.4);
      g.restore();
    }, { seed: k.seed, rim: 0.35, grain: 5 }),
    flat: true,
  };
}

function stallGoodsProp(k: K): PropInfo {
  const W = 16, H = 10, cx = 8, by = 8.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      g.fillStyle = '#2a1c12'; g.fillRect(1.2, 3.6, 13.6, 1.8);
      // apples, a round loaf and a cabbage heaped in a shallow tray
      for (const [x, y] of [[3, 3.6], [4.6, 3.3], [2.4, 4.6], [4, 4.8], [5.6, 4.5]]) fruit(g, x, y, 1.05, rng.next() < 0.7 ? '#b8322a' : '#8aa83a');
      loaf(g, cx + 0.4, 3.4, 2.3, 1.6, rng, { cuts: 3 });
      ellipse(g, 12.2, 3.4, 2.1, 1.9, ballShade(g, 12.2, 3.4, 2.1, '#6a9a44', 0.5, 0.5));
      for (let i = 0; i < 4; i++) { const a = -Math.PI / 2 + (i - 1.5) * 0.7; g.strokeStyle = 'rgba(210,236,170,0.6)'; g.lineWidth = 0.15; g.beginPath(); g.moveTo(12.2, 3.8); g.quadraticCurveTo(12.2 + Math.cos(a) * 1.6, 3.4 + Math.sin(a) * 1.2, 12.2 + Math.cos(a) * 2, 3.4 + Math.sin(a) * 1.8); g.stroke(); }
      board(g, 0.8, 4.8, 14.4, 0.9, lit(PINE, 0.2), rng, { knots: 0 });
      planks(g, 0.8, 5.7, 14.4, by - 5.7, 1, PINE, rng, false);
      for (const x of [1.6, 14.4]) rivet(g, x, 6.8, 0.18);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.6, by - 0.3, 7.6, 1.2, 0.42) }),
  };
}

function flagProp(k: K): PropInfo {
  const W = 18, H = 36, px = 2.5, by = 34.5;
  const c = hexOr(k.opt, CLOTH.green);
  const dark = c === CLOTH.black || c === CLOTH.charcoal;
  return {
    sprite: art(W, H, px, by, (g) => {
      const rng = rngOf(k);
      ellipse(g, px, by - 0.2, 2.0, 0.6, '#5a4630');
      post(g, px, 1.8, by, 1.1, '#6a5038', rng, 'none');
      ellipse(g, px, 1.3, 0.8, 0.8, ballShade(g, px, 1.3, 0.8, BRASS[3], 0.6, 0.5));
      // the flag, rippling out to the right
      const x0 = px + 0.5, x1 = W - 0.6, top = 2.4, h = 9.0;
      const wave = (x: number) => Math.sin((x - x0) * 0.62) * 0.8 * ((x - x0) / (x1 - x0));
      const flag = () => {
        g.beginPath(); g.moveTo(x0, top);
        for (let x = x0; x <= x1; x += 0.5) g.lineTo(x, top + wave(x));
        g.lineTo(x1 - 1.2, top + h / 2 + wave(x1));
        g.lineTo(x1, top + h + wave(x1));
        for (let x = x1; x >= x0; x -= 0.5) g.lineTo(x, top + h + wave(x) + 0.3 * ((x - x0) / (x1 - x0)));
        g.closePath();
      };
      fillPath(g, flag, lin(g, x0, top, x1, top + h, [[0, lit(c, dark ? 0.2 : 0.25)], [1, dim(c, 0.3)]]));
      g.save(); flag(); g.clip();
      for (let x = x0; x < x1; x += 0.4) {
        const s = Math.cos((x - x0) * 0.62);
        g.fillStyle = s > 0 ? rgba(lit(dark ? '#6a6460' : c, 0.5), 0.22 * s) : rgba(SHADE, -0.3 * s);
        g.fillRect(x, 0, 0.42, H);
      }
      weave(g, x0, top - 1, x1, top + h + 2, c, 0.45, 0.08);
      g.restore();
      const ex = x0 + (x1 - x0) * 0.45, ey = top + h / 2 + wave(x0 + (x1 - x0) * 0.45);
      if (dark) emblem(g, 'raven', ex, ey + 0.2, 2.6, '#cfc6b2');
      else emblem(g, 'cross', ex, ey, 2.8, BRASS[3]);
      g.fillStyle = lin(g, x0, 0, x0 + 1, 0, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(x0, top, 1, h);
      for (const y of [top + 0.8, top + h - 0.8]) { g.strokeStyle = '#c8b48a'; g.lineWidth = 0.28; g.beginPath(); g.ellipse(px, y, 0.8, 0.35, 0, 0, TAU); g.stroke(); }
      tufts(g, 0.2, 5, by, rng, 3, 2);
    }, { seed: k.seed, under: (g) => contact(g, px + 0.4, by - 0.2, 2.6, 0.8, 0.42) }),
    solid: { w: 3, h: 3 },
  };
}

function milestoneProp(k: K): PropInfo {
  const W = 12, H = 16, cx = 6, by = 14.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const st = '#948e82';
      const face = (dx: number, dy: number) => { g.beginPath(); g.moveTo(2.2 + dx, by + dy); g.lineTo(2.2 + dx, 4.8 + dy); g.arc(cx + dx, 4.8 + dy, 3.8, Math.PI, 0); g.lineTo(9.8 + dx, by + dy); g.closePath(); };
      fillPath(g, () => face(0.9, -0.5), dim(st, 0.45));
      fillPath(g, () => face(0, 0), lin(g, 2.2, 1, 9.8, by, [[0, lit(st, 0.3)], [0.5, st], [1, dim(st, 0.3)]]));
      g.save(); face(0, 0); g.clip();
      for (let i = 0; i < 30; i++) ellipse(g, 2.4 + rng.next() * 7.2, 1.4 + rng.next() * 13, 0.15 + rng.next() * 0.3, 0.12, rgba(rng.next() < 0.5 ? '#4a4640' : '#d8d2c6', 0.35));
      for (let i = 0; i < 5; i++) ellipse(g, 3 + rng.next() * 6, 2 + rng.next() * 10, 0.5 + rng.next() * 0.7, 0.4, rgba(rng.next() < 0.5 ? '#b0b070' : '#d8d4c0', 0.45));
      g.fillStyle = lin(g, 0, by - 4, 0, by, [[0, 'rgba(40,60,20,0)'], [1, 'rgba(40,60,20,0.5)']]); g.fillRect(2, by - 4, 8, 4);
      g.restore();
      // carved numerals and an arrow
      for (const [dx, col] of [[0.15, 'rgba(230,226,214,0.5)'], [0, 'rgba(30,28,24,0.8)']] as const) {
        g.strokeStyle = col; g.lineWidth = 0.4;
        g.beginPath();
        g.moveTo(3.6 + dx, 4.6 + dx); g.lineTo(4.4 + dx, 7.2 + dx); g.lineTo(5.2 + dx, 4.6 + dx);
        g.moveTo(6.2 + dx, 4.6 + dx); g.lineTo(6.2 + dx, 7.2 + dx); g.moveTo(7.4 + dx, 4.6 + dx); g.lineTo(7.4 + dx, 7.2 + dx);
        g.moveTo(3.8 + dx, 9.6 + dx); g.lineTo(8 + dx, 9.6 + dx); g.lineTo(6.8 + dx, 8.8 + dx); g.moveTo(8 + dx, 9.6 + dx); g.lineTo(6.8 + dx, 10.4 + dx);
        g.stroke();
      }
      g.strokeStyle = rgba(lit(st, 0.5), 0.6); g.lineWidth = 0.25; g.beginPath(); g.arc(cx, 4.8, 3.65, Math.PI * 1.05, Math.PI * 1.6); g.stroke();
      tufts(g, 1, 11, by, rng, 5, 2);
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.8, by - 0.2, 4.6, 1.1, 0.45) }),
    solid: { w: 8, h: 4 },
  };
}

function orepileProp(k: K): PropInfo {
  const W = 24, H = 14, cx = 12, by = 12.5;
  return {
    sprite: art(W, H, cx, by, (g) => {
      const rng = rngOf(k);
      const heap = () => { g.beginPath(); g.moveTo(1.4, by - 0.2); g.quadraticCurveTo(5, by - 7.4, cx, by - 8.2); g.quadraticCurveTo(W - 5, by - 7.4, W - 1.4, by - 0.2); g.closePath(); };
      fillPath(g, heap, lin(g, 0, by - 8, 0, by, [[0, '#4a4850'], [1, '#26252a']]));
      const lumps: [number, number, number][] = [];
      for (let i = 0; i < 46; i++) {
        const u = rng.next() * 2 - 1, x = cx + u * 10.2;
        const hgt = 7.2 * (1 - u * u);
        lumps.push([x, by - 0.7 - rng.next() * hgt, 0.7 + rng.next() * 0.9 * (0.6 + (1 - Math.abs(u)) * 0.6)]);
      }
      lumps.sort((a, b) => a[1] - b[1]);
      for (const [x, y, r] of lumps) ore(g, x, y, r, rng);
      for (let i = 0; i < 12; i++) ore(g, 1.8 + rng.next() * (W - 3.6), by - rng.next() * 0.6, 0.35 + rng.next() * 0.3, rng);
      return (gg) => { for (let i = 0; i < 5; i++) { const x = 4 + rng.next() * 16, y = by - 1 - rng.next() * 5; gg.strokeStyle = 'rgba(255,255,255,0.7)'; gg.lineWidth = 0.1; gg.beginPath(); gg.moveTo(x - 0.5, y); gg.lineTo(x + 0.5, y); gg.moveTo(x, y - 0.5); gg.lineTo(x, y + 0.5); gg.stroke(); } };
    }, { seed: k.seed, under: (g) => contact(g, cx + 0.6, by - 0.6, 11, 1.8, 0.42) }),
    solid: { w: 18, h: 6 },
  };
}
