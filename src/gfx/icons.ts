// Item icons, painted at 64x64 (a 16x16 design space scaled by 4): one object
// per icon in three-quarter view, lit from the upper left, with gradient
// shading, crisp glints on metal and glass, a soft dark rim and a faint cast
// shadow so they read on the dark HUD and on inventory parchment alike.
// Each spec is painted once and cached, as a canvas (in-world drops) and as a
// data URL (HTML UI).

import { P, CLOTH } from './palette';
import { hexToRgb, clamp, hashStr } from '../engine/util';
import { RNG, Ctx, newCanvas, rim, grain, lit, dim, mix, rgba, ellipse, roundRect, line, blade, lin, rad } from './paint';

export interface IconSpec { shape: string; c1?: string; c2?: string; c3?: string }

const urlCache = new Map<string, string>();
const canvasCache = new Map<string, HTMLCanvasElement>();

export function iconCanvas(spec: IconSpec): HTMLCanvasElement {
  const key = JSON.stringify(spec);
  let c = canvasCache.get(key);
  if (!c) { c = render(spec); canvasCache.set(key, c); }
  return c;
}

export function iconURL(spec: IconSpec): string {
  const key = JSON.stringify(spec);
  let u = urlCache.get(key);
  if (!u) { u = iconCanvas(spec).toDataURL(); urlCache.set(key, u); }
  return u;
}

// ================================================================ rendering

const RES = 4;         // canvas pixels per design unit
const N = 16;          // design units per side
const INK = '#1b120c'; // rim colour

type G = Ctx;
type Pt = [number, number];
type Fill = string | CanvasGradient;

/** What a painter works with: the spec's colours, a seeded RNG and effects queued for after the rim. */
interface B {
  c1?: string; c2?: string; c3?: string;
  rng: RNG;
  /** Painted last, over the rim and shadow, in design units (flames, glints, steam). */
  post: ((g: G) => void)[];
  /** A coloured halo around the whole object (heirlooms). */
  glow?: string;
}
type Painter = (g: G, b: B) => void;

function layer(): { c: HTMLCanvasElement; g: G } {
  const c = newCanvas(N * RES, N * RES);
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.scale(RES, RES);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  return { c, g };
}

function render(spec: IconSpec): HTMLCanvasElement {
  const b: B = { c1: spec.c1, c2: spec.c2, c3: spec.c3, rng: new RNG(hashStr(JSON.stringify(spec))), post: [] };
  const body = layer();
  light = WORLD_LIGHT;
  (PAINTERS[spec.shape] || parcel)(body.g, b);
  grain(body.c, 7, hashStr(spec.shape));
  edgeTone(body.c, 'rgba(255,246,222,0.38)', 1);
  edgeTone(body.c, 'rgba(16,8,20,0.3)', -1);
  rim(body.c, INK, 0.85, 1);
  rim(body.c, INK, 0.3, 1);
  const out = layer();
  const og = out.g;
  og.save();
  og.setTransform(1, 0, 0, 1, 0, 0);
  if (b.glow) {
    og.shadowColor = b.glow;
    og.shadowBlur = 7;
    og.drawImage(body.c, 0, 0);
  }
  og.shadowColor = 'rgba(18,10,4,0.42)';
  og.shadowBlur = 4;
  og.shadowOffsetX = 1.5;
  og.shadowOffsetY = 2.5;
  og.drawImage(body.c, 0, 0);
  og.restore();
  for (const f of b.post) f(og);
  return out.c;
}

/** Tints the silhouette's edge that faces the light (d = 1: upper left) or faces away from it (d = -1). */
function edgeTone(c: HTMLCanvasElement, color: string, d: number) {
  const band = newCanvas(c.width, c.height);
  const bg = band.getContext('2d')!;
  bg.drawImage(c, 0, 0);
  bg.globalCompositeOperation = 'destination-out';
  bg.drawImage(c, d, d);
  bg.globalCompositeOperation = 'source-in';
  bg.fillStyle = color;
  bg.fillRect(0, 0, band.width, band.height);
  const g = c.getContext('2d')!;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.drawImage(band, 0, 0);
  g.restore();
}

// ================================================================ light and geometry

/** Direction toward the light in world space: the upper left. */
const WORLD_LIGHT = Math.atan2(-1, -1);
/** Direction toward the light in the current frame. */
let light = WORLD_LIGHT;

/** Paints in a frame moved to (x, y), rotated by ang and optionally mirrored; the shading helpers keep the light in world space. */
function frame(g: G, x: number, y: number, ang: number, fn: () => void, flip = false) {
  const prev = light;
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  if (flip) g.scale(-1, 1);
  light = flip ? Math.PI - (prev - ang) : prev - ang;
  fn();
  g.restore();
  light = prev;
}
function L(): Pt { return [Math.cos(light), Math.sin(light)]; }

function seg(a: Pt, b: Pt, n = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n; out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  return out;
}
/** Catmull-Rom curve through the control points. */
function spline(ctrl: Pt[], per = 8): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)], p1 = ctrl[i], p2 = ctrl[i + 1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1]);
  return out;
}
function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * (i / n); out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  return out;
}
function trace(g: G, pts: Pt[], close = true) {
  g.beginPath();
  pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  if (close) g.closePath();
}
function fillPts(g: G, pts: Pt[], fill: Fill) { trace(g, pts); g.fillStyle = fill; g.fill(); }
function strokePts(g: G, pts: Pt[], col: Fill, w: number) { trace(g, pts, false); g.strokeStyle = col; g.lineWidth = w; g.stroke(); }
/** A closed, rounded outline through the points (corners become curves). */
function smooth(g: G, pts: Pt[]) {
  const n = pts.length;
  const mid = (i: number): Pt => { const a = pts[(i + n) % n], b = pts[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const m0 = mid(-1);
  g.beginPath();
  g.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const m = mid(i); g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
  g.closePath();
}
function withClip(g: G, shape: () => void, fn: () => void) { g.save(); shape(); g.clip(); fn(); g.restore(); }
function fillShape(g: G, shape: () => void, fill: Fill) { shape(); g.fillStyle = fill; g.fill(); }

type Cmd = [number, number] | [number, number, number, number];
/** A left-right symmetric outline: `cmds` trace the left half from `start` (top centre) down to the bottom centre, lines [x,y] or curves [cx,cy,x,y]. */
function symPath(g: G, start: Pt, cmds: Cmd[], cx = 8) {
  g.beginPath();
  g.moveTo(start[0], start[1]);
  const ends: Pt[] = [start];
  for (const c of cmds) {
    if (c.length === 2) { g.lineTo(c[0], c[1]); ends.push([c[0], c[1]]); }
    else { g.quadraticCurveTo(c[0], c[1], c[2], c[3]); ends.push([c[2], c[3]]); }
  }
  for (let i = cmds.length - 1; i >= 0; i--) {
    const c = cmds[i], e = ends[i];
    if (c.length === 2) g.lineTo(2 * cx - e[0], e[1]);
    else g.quadraticCurveTo(2 * cx - c[0], c[1], 2 * cx - e[0], e[1]);
  }
  g.closePath();
}

// ================================================================ colour

function luma(c: string): number { const [r, g, b] = hexToRgb(c); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; }
/** Bluish-grey: iron and steel rather than cloth or wood. */
function isMetal(c: string): boolean { const [r, g, b] = hexToRgb(c); return b >= r - 2 && Math.max(r, g, b) - Math.min(r, g, b) < 40; }
function isWoody(c: string): boolean { const [r, g, b] = hexToRgb(c); return r > g && g > b && r - b > 40 && luma(c) < 0.55; }
function isGreen(c: string): boolean { const [r, g, b] = hexToRgb(c); return g > r && g >= b; }
function hue(c: string): number {
  const [r, g, b] = hexToRgb(c).map((v) => v / 255);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 1e-6) return 0;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
/** How rusty a steel colour looks (warm greys are old iron). */
function weathering(c: string): number { const [r, , b] = hexToRgb(c); return clamp((r - b - 2) / 28, 0, 1); }

// ================================================================ shading

function tone(col: string, hi = 0.35, lo = 0.45): [number, string][] { return [[0, lit(col, hi)], [0.5, col], [1, dim(col, lo)]]; }
/** A linear gradient across (cx, cy) from the lit side to the shaded side, r either way. */
function lightLin(g: G, cx: number, cy: number, r: number, stops: [number, string][]): CanvasGradient {
  const [lx, ly] = L();
  return lin(g, cx + lx * r, cy + ly * r, cx - lx * r, cy - ly * r, stops);
}
/** Sphere shading with an optional specular spot. */
function orb(g: G, x: number, y: number, r: number, col: string, o: { hi?: number; lo?: number; spec?: number; ry?: number } = {}) {
  const ry = o.ry ?? r;
  const [lx, ly] = L();
  ellipse(g, x, y, r, ry, rad(g, x + lx * r * 0.45, y + ly * ry * 0.45, r * 0.05, x - lx * r * 0.1, y - ly * ry * 0.1, Math.max(r, ry) * 1.08,
    [[0, lit(col, o.hi ?? 0.5)], [0.5, col], [1, dim(col, o.lo ?? 0.55)]]));
  const sp = o.spec ?? 0.6;
  if (sp > 0) ellipse(g, x + lx * r * 0.48, y + ly * ry * 0.48, r * 0.24, ry * 0.15, rgba('#fffdf4', sp), light + Math.PI / 2);
}

function normalsOf(pts: Pt[]): Pt[] {
  const n = pts.length;
  return pts.map((_, i) => {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[Math.min(n - 1, i + 1)];
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  });
}
function arr(v: number | number[], n: number): number[] { return typeof v === 'number' ? new Array(n).fill(v) : v; }
/** The strip between offsets a and b (in half-widths, -1..1) along a centre line. */
function bandPath(g: G, pts: Pt[], ns: Pt[], hw: number[], a: number[], b: number[]) {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const x = pts[i][0] + ns[i][0] * hw[i] * a[i], y = pts[i][1] + ns[i][1] * hw[i] * a[i];
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  for (let i = pts.length - 1; i >= 0; i--) g.lineTo(pts[i][0] + ns[i][0] * hw[i] * b[i], pts[i][1] + ns[i][1] * hw[i] * b[i]);
  g.closePath();
}
function tubePath(g: G, pts: Pt[], hw: number | number[]) {
  const n = pts.length;
  bandPath(g, pts, normalsOf(pts), arr(hw, n), arr(-1, n), arr(1, n));
}
/** A round rod along a centre line (straight or curved), shaded as a cylinder lit from the light. */
function tube(g: G, pts: Pt[], hw: number | number[], col: string, o: { hi?: number; lo?: number; spec?: number; steps?: number } = {}) {
  const n = pts.length, ns = normalsOf(pts), W = arr(hw, n);
  const [lx, ly] = L();
  const s = ns.map(([nx, ny]) => clamp(nx * lx + ny * ly, -1, 1));
  const lo = o.lo ?? 0.5, hi = o.hi ?? 0.4, steps = o.steps ?? 6;
  bandPath(g, pts, ns, W, arr(-1, n), arr(1, n));
  g.fillStyle = dim(col, lo);
  g.fill();
  for (let k = 1; k <= steps; k++) {
    const t = k / steps;
    const half = 1.02 - t * 0.74;
    const c = s.map((v) => v * (0.12 + 0.5 * t));
    bandPath(g, pts, ns, W, c.map((v) => clamp(v - half, -1, 1)), c.map((v) => clamp(v + half, -1, 1)));
    g.fillStyle = t <= 0.5 ? mix(dim(col, lo), col, t * 2) : lit(col, (t - 0.5) * 2 * hi);
    g.fill();
  }
  if (o.spec) {
    const c = s.map((v) => v * 0.62);
    bandPath(g, pts, ns, W, c.map((v) => clamp(v - 0.1, -1, 1)), c.map((v) => clamp(v + 0.1, -1, 1)));
    g.fillStyle = rgba('#fffdf4', o.spec);
    g.fill();
  }
}
/** Grain or fibre lines running along a tube. */
function tubeLines(g: G, pts: Pt[], hw: number | number[], col: string, rng: RNG, n: number, alpha = 0.35) {
  const ns = normalsOf(pts), W = arr(hw, pts.length), m = pts.length;
  for (let k = 0; k < n; k++) {
    const off = rng.next() * 1.6 - 0.8;
    const i0 = Math.floor(rng.next() * m * 0.6), i1 = Math.min(m - 1, i0 + 2 + Math.floor(rng.next() * m * 0.6));
    g.beginPath();
    for (let i = i0; i <= i1; i++) {
      const w = off + Math.sin(i * 1.3 + k * 2.1) * 0.06;
      const x = pts[i][0] + ns[i][0] * W[i] * w, y = pts[i][1] + ns[i][1] * W[i] * w;
      if (i === i0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.strokeStyle = rgba(col, alpha);
    g.lineWidth = 0.07 + rng.next() * 0.06;
    g.stroke();
  }
}
/** A soft cloth crease: a dark stroke with a lit lip on the side toward the light. */
function fold(g: G, pts: Pt[], w: number, col: string, a = 0.3) {
  const p = pts.length > 2 ? spline(pts, 6) : pts;
  strokePts(g, p, rgba(dim(col, 0.55), a), w);
  const [lx, ly] = L();
  strokePts(g, p.map(([x, y]) => [x + lx * w * 0.6, y + ly * w * 0.6] as Pt), rgba(lit(col, 0.5), a * 0.8), w * 0.4);
}
function stitch(g: G, pts: Pt[], col: string, w = 0.09, dash = 0.32, gap = 0.22) {
  g.save();
  g.setLineDash([dash, gap]);
  strokePts(g, pts.length > 2 ? spline(pts, 6) : pts, col, w);
  g.restore();
}
/** Diagonal light-to-shade wash over whatever is inside the current clip. */
function shadeOver(g: G, x0: number, y0: number, x1: number, y1: number, a = 0.28, d = 0.4) {
  g.fillStyle = lin(g, x0, y0, x1, y1, [[0, rgba('#fff6dc', a)], [0.42, rgba('#fff6dc', 0)], [0.58, rgba('#140a18', 0)], [1, rgba('#140a18', d)]]);
  g.fillRect(-2, -2, N + 4, N + 4);
}
/** A glint queued to paint over the rim, so its rays do not get outlined. */
function sparkle(g: G, b: B, x: number, y: number, s: number, a = 0.95) {
  const p = g.getTransform().transformPoint(new DOMPoint(x, y));
  const wx = p.x / RES, wy = p.y / RES;
  b.post.push((h) => star(h, wx, wy, s, a));
}
function star(g: G, x: number, y: number, s: number, a: number) {
  ellipse(g, x, y, s * 0.5, s * 0.5, rad(g, x, y, 0, x, y, s * 0.5, [[0, rgba('#fffef2', a * 0.9)], [1, rgba('#fffef2', 0)]]));
  g.fillStyle = rgba('#ffffff', a);
  g.beginPath();
  g.moveTo(x - s, y);
  g.quadraticCurveTo(x, y, x, y - s);
  g.quadraticCurveTo(x, y, x + s, y);
  g.quadraticCurveTo(x, y, x, y + s);
  g.quadraticCurveTo(x, y, x - s, y);
  g.fill();
}
/** Layered flame with a warm halo, rising from (x, y). */
function flame(g: G, x: number, y: number, h: number, w: number, lean = 0.4) {
  ellipse(g, x + lean * 0.3, y - h * 0.42, h * 1.05, h * 1.05, rad(g, x + lean * 0.3, y - h * 0.42, 0, x + lean * 0.3, y - h * 0.42, h * 1.05,
    [[0, 'rgba(255,200,90,0.5)'], [0.5, 'rgba(255,150,50,0.18)'], [1, 'rgba(255,120,40,0)']]));
  const lick = (s: number, col: string) => {
    const hh = h * s, ww = w * s, tx = x + lean * s;
    g.beginPath();
    g.moveTo(x - ww, y);
    g.bezierCurveTo(x - ww * 1.25, y - hh * 0.45, tx - ww * 0.5, y - hh * 0.72, tx, y - hh);
    g.bezierCurveTo(tx + ww * 0.25, y - hh * 0.62, x + ww * 1.2, y - hh * 0.42, x + ww, y);
    g.quadraticCurveTo(x, y + ww * 0.9, x - ww, y);
    g.closePath();
    g.fillStyle = col;
    g.fill();
  };
  lick(1, 'rgba(206,64,24,0.92)');
  lick(0.8, '#f0842a');
  lick(0.6, '#ffbf45');
  lick(0.38, '#fff1b8');
}
/** Riveted mail: rows of lit rings over a dark ground (fills the given box; clip first). */
function mailRings(g: G, x0: number, y0: number, x1: number, y1: number, col: string, r = 0.42) {
  g.fillStyle = dim(col, 0.68);
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  const dy = r * 1.2;
  g.lineWidth = r * 0.46;
  for (let row = 0, y = y0; y < y1 + r; y += dy, row++) {
    for (let x = x0 + (row % 2 ? r : 0); x < x1 + r; x += r * 2) {
      g.strokeStyle = col;
      g.beginPath(); g.ellipse(x, y, r * 0.92, r * 0.7, 0, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = rgba(lit(col, 0.7), 0.9);
      g.beginPath(); g.ellipse(x, y, r * 0.92, r * 0.7, 0, Math.PI * 1.02, Math.PI * 1.62); g.stroke();
    }
  }
}

// ---------------------------------------------------------------- a small box projector

type V3 = [number, number, number];
interface Cam { x: number; y: number; s: number; yaw: number; pitch: number }
const LIGHT3: V3 = (() => { const v: V3 = [-0.52, 0.62, 0.58]; const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; })();
function rot3(c: Cam, [x, y, z]: V3): V3 {
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  const x1 = x * cy + z * sy, z1 = -x * sy + z * cy;
  return [x1, y * cp - z1 * sp, y * sp + z1 * cp];
}
function pr(c: Cam, v: V3): Pt { const [x, y] = rot3(c, v); return [c.x + x * c.s, c.y - y * c.s]; }
function cross3(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function sub3(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function unit3(v: V3): V3 { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
/** Facing (z of the rotated normal) and brightness of a planar face given as counter-clockwise vertices seen from outside. */
function faceInfo(c: Cam, vs: V3[]): { facing: number; lum: number } {
  const n = rot3(c, unit3(cross3(sub3(vs[1], vs[0]), sub3(vs[2], vs[0]))));
  return { facing: n[2], lum: n[0] * LIGHT3[0] + n[1] * LIGHT3[1] + n[2] * LIGHT3[2] };
}
function faceTone(col: string, lum: number, hi = 0.45, lo = 0.6): string {
  return lum > 0.45 ? lit(col, ((lum - 0.45) / 0.55) * hi) : dim(col, ((0.45 - lum) / 1.45) * lo * 1.5);
}
/** Draws in a face's own 2D coordinates: origin o, axes u and v (3D). */
function onFace(g: G, c: Cam, o: V3, u: V3, v: V3, fn: () => void) {
  const p0 = pr(c, o), pu = pr(c, [o[0] + u[0], o[1] + u[1], o[2] + u[2]]), pv = pr(c, [o[0] + v[0], o[1] + v[1], o[2] + v[2]]);
  g.save();
  g.transform(pu[0] - p0[0], pu[1] - p0[1], pv[0] - p0[0], pv[1] - p0[1], p0[0], p0[1]);
  fn();
  g.restore();
}
/** Box faces (x0..x1, y0..y1, z0..z1) that face the viewer, back to front, with their vertices and brightness. */
function boxFaces(c: Cam, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const F: { k: string; vs: V3[] }[] = [
    { k: 'top', vs: [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]] },
    { k: 'bottom', vs: [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]] },
    { k: 'front', vs: [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]] },
    { k: 'back', vs: [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]] },
    { k: 'right', vs: [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]] },
    { k: 'left', vs: [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]] },
  ];
  return F.map((f) => ({ ...f, ...faceInfo(c, f.vs) })).filter((f) => f.facing > 0.01);
}

// ================================================================ weapons

function bladeOutline(g: G, x0: number, x1: number, w0: number) {
  const pA = x1 - Math.min(3.0, (x1 - x0) * 0.24), w1 = w0 * 0.74, cx = x1 - (x1 - pA) * 0.3;
  g.beginPath();
  g.moveTo(x0, -w0);
  g.lineTo(pA, -w1);
  g.quadraticCurveTo(cx, -w1 * 0.78, x1, 0);
  g.quadraticCurveTo(cx, w1 * 0.78, pA, w1);
  g.lineTo(x0, w0);
  g.closePath();
}

/** A double-edged blade along +x from x0 to its point at x1 (in a weapon frame: -y is the lit bevel). */
function swordBlade(g: G, b: B, x0: number, x1: number, w0: number, steel: string, o: { fuller?: number; wear?: number; scale?: boolean; inscribe?: boolean } = {}) {
  const len = x1 - x0, pA = x1 - Math.min(3.0, len * 0.24), w1 = w0 * 0.74, cx = x1 - (x1 - pA) * 0.3;
  const shape = () => bladeOutline(g, x0, x1, w0);
  fillShape(g, shape, steel);
  withClip(g, shape, () => {
    g.fillStyle = lin(g, x0, 0, x1, 0, [[0, lit(steel, 0.3)], [0.17, lit(steel, 0.66)], [0.4, lit(steel, 0.3)], [0.63, lit(steel, 0.56)], [0.86, lit(steel, 0.28)], [1, lit(steel, 0.5)]]);
    g.fillRect(x0 - 1, -w0 - 1, len + 2, w0 + 1);
    g.fillStyle = lin(g, x0, 0, x1, 0, [[0, dim(steel, 0.52)], [0.25, dim(steel, 0.24)], [0.5, dim(steel, 0.46)], [0.78, dim(steel, 0.28)], [1, dim(steel, 0.42)]]);
    g.fillRect(x0 - 1, 0, len + 2, w0 + 1);
    // a crisp ridge between the bevels
    line(g, x0, -0.02, x1, -0.02, rgba(lit(steel, 0.75), 0.55), 0.07);
    const fx = x0 + len * (o.fuller ?? 0.6);
    if (o.fuller !== 0) {
      const fw = w0 * 0.27;
      roundRect(g, x0 + 0.35, -fw, fx - x0 - 0.35, fw * 2, fw, lin(g, 0, -fw, 0, fw, [[0, dim(steel, 0.62)], [0.5, dim(steel, 0.3)], [1, lit(steel, 0.5)]]));
    }
    if (o.inscribe) {
      // gold-inlaid letters along the fuller
      for (let x = x0 + 0.7, k = 0; x < x0 + len * 0.42; x += 0.44, k++) {
        g.strokeStyle = P.gold3;
        g.lineWidth = 0.09;
        g.beginPath();
        if (k % 3 === 0) { g.moveTo(x, -0.17); g.lineTo(x, 0.17); g.moveTo(x - 0.12, 0); g.lineTo(x + 0.14, 0); }
        else if (k % 3 === 1) { g.arc(x, 0, 0.15, 0.4, Math.PI * 1.7); }
        else { g.moveTo(x - 0.12, 0.17); g.lineTo(x, -0.17); g.lineTo(x + 0.12, 0.17); }
        g.stroke();
      }
      ellipse(g, x0 + len * 0.2, -0.05, len * 0.18, 0.06, rgba('#fff2c0', 0.6));
    }
    if (o.scale) {
      for (let i = 0; i < 46; i++) {
        const x = x0 + b.rng.next() * len, y = (b.rng.next() * 2 - 1) * w0;
        ellipse(g, x, y, 0.2 + b.rng.next() * 0.55, 0.12 + b.rng.next() * 0.26, rgba(b.rng.next() < 0.7 ? '#18161c' : '#7a7a86', 0.25 + b.rng.next() * 0.35), b.rng.next() * 3);
      }
    }
    const wear = o.wear ?? 0;
    if (wear > 0) {
      for (let i = 0; i < wear * 44; i++) {
        const x = x0 + b.rng.next() * len, y = (b.rng.next() * 2 - 1) * w0;
        const r = 0.1 + b.rng.next() * 0.34 * wear;
        ellipse(g, x, y, r, r * 0.7, rgba(['#6a3a1c', '#8a4a22', '#7a5030', '#4a2a18'][Math.floor(b.rng.next() * 4)], 0.3 + 0.5 * b.rng.next()), b.rng.next() * 3);
      }
    }
  });
  // honed edges and a hot spot
  g.lineWidth = 0.13;
  g.strokeStyle = rgba(lit(steel, 0.95), 0.95);
  g.beginPath(); g.moveTo(x0 + 0.1, -w0 + 0.09); g.lineTo(pA, -w1 + 0.09); g.quadraticCurveTo(cx, -w1 * 0.78 + 0.07, x1 - 0.18, 0); g.stroke();
  g.lineWidth = 0.1;
  g.strokeStyle = rgba(lit(steel, 0.3), 0.55);
  g.beginPath(); g.moveTo(x0 + 0.1, w0 - 0.08); g.lineTo(pA, w1 - 0.08); g.quadraticCurveTo(cx, w1 * 0.78 - 0.07, x1 - 0.18, 0); g.stroke();
  const hx = x0 + len * 0.24;
  ellipse(g, hx, -w0 * 0.5, len * 0.1, 0.1, rgba('#ffffff', o.scale ? 0.35 : 0.8));
  if (!o.scale && (o.wear ?? 0) < 0.6) sparkle(g, b, hx, -w0 * 0.5, o.inscribe ? 1.5 : 1.1);
  const wear = o.wear ?? 0;
  if (wear > 0.45) {
    // nicks along the edges
    g.save();
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 4; i++) {
      const x = x0 + len * (0.15 + b.rng.next() * 0.6), s = b.rng.next() < 0.5 ? -1 : 1;
      const w = w0 + (w1 - w0) * ((x - x0) / (pA - x0));
      fillPts(g, [[x - 0.22, s * (w + 0.1)], [x + 0.2, s * (w + 0.1)], [x, s * (w - 0.3)]], '#000');
    }
    g.restore();
  }
}

function hiltGrip(g: G, xa: number, xb: number, hw: number, col: string, metal: string, wire: boolean) {
  const pts = seg([xa, 0], [xb, 0], 10);
  const W = pts.map(([x]) => hw * (1 + 0.14 * Math.sin(((x - xa) / (xb - xa)) * Math.PI)));
  tube(g, pts, W, col, { hi: 0.4, lo: 0.55 });
  withClip(g, () => tubePath(g, pts, W), () => {
    for (let x = xa - 0.8; x < xb + 0.4; x += 0.34) {
      line(g, x, -hw * 1.3, x + 0.34, hw * 1.3, rgba(dim(col, 0.7), 0.75), 0.09);
      line(g, x + 0.1, -hw * 1.3, x + 0.44, hw * 1.3, wire ? rgba(P.gold3, 0.95) : rgba(lit(col, 0.5), 0.4), wire ? 0.075 : 0.06);
    }
  });
  for (const x of [xa + 0.08, xb - 0.08]) tube(g, seg([x - 0.15, 0], [x + 0.15, 0], 3), hw * 1.25, metal, { hi: 0.6, lo: 0.5, spec: 0.45 });
}

function crossguard(g: G, b: B, x: number, gw: number, t: number, col: string, curve: number, ornate: boolean) {
  const pts: Pt[] = [];
  for (let i = 0; i <= 20; i++) { const u = (i / 20) * 2 - 1; pts.push([x + curve * u * u, u * gw]); }
  const W = pts.map((_, i) => (t / 2) * (1.05 - 0.3 * Math.abs((i / 20) * 2 - 1)));
  tube(g, pts, W, col, { hi: 0.6, lo: 0.5, spec: 0.5 });
  withClip(g, () => tubePath(g, pts, W), () => {
    g.fillStyle = lin(g, 0, -gw, 0, gw, [[0, rgba('#fff4d6', 0.32)], [0.45, 'rgba(0,0,0,0)'], [1, 'rgba(20,10,30,0.4)']]);
    g.fillRect(x - 1, -gw - 1, curve + 2, gw * 2 + 2);
  });
  for (const s of [-1, 1]) {
    if (ornate) {
      // quillons curling back into little scrolls
      tube(g, arcPts(x + curve - 0.5, s * (gw + 0.1), 0.55, 0.55, s < 0 ? Math.PI * 0.4 : -Math.PI * 0.4, s < 0 ? Math.PI * 1.9 : Math.PI * 0.1, 12), 0.17, col, { hi: 0.6, spec: 0.45 });
    }
    orb(g, x + curve, s * gw, t * 0.6, col, { hi: 0.65, spec: 0.7 });
  }
  const ex = x + 0.05;
  fillPts(g, [[ex - 0.6, -0.66], [ex + 1.0, -0.4], [ex + 1.0, 0.4], [ex - 0.6, 0.66]], lightLin(g, ex, 0, 0.7, tone(col, 0.55, 0.5)));
  line(g, ex - 0.55, -0.6, ex + 0.95, -0.36, rgba(lit(col, 0.9), 0.8), 0.08);
  if (ornate) { orb(g, ex + 0.2, 0, 0.32, '#b01c2c', { hi: 0.75, spec: 0.95 }); sparkle(g, b, ex + 0.12, -0.1, 0.8, 0.85); }
}

function pommel(g: G, b: B, x: number, r: number, kind: 'wheel' | 'pear', col: string, gem: boolean) {
  if (kind === 'pear') {
    orb(g, x, 0, r * 1.05, col, { ry: r * 0.8, hi: 0.6, spec: 0.6 });
    tube(g, seg([x + r * 0.55, 0], [x + r * 1.05, 0], 3), r * 0.42, col, { hi: 0.5, spec: 0.35 });
  } else {
    // a wheel: bright rim, sunken ring, raised boss
    orb(g, x, 0, r, col, { hi: 0.65, lo: 0.6, spec: 0 });
    orb(g, x + 0.05, 0.03, r * 0.7, dim(col, 0.3), { hi: 0.1, lo: 0.3, spec: 0 });
    orb(g, x + 0.02, 0.02, r * 0.46, col, { hi: 0.6, lo: 0.5, spec: 0.6 });
    if (gem) { orb(g, x + 0.02, 0.02, r * 0.34, '#b01a2c', { hi: 0.8, lo: 0.5, spec: 0.95 }); sparkle(g, b, x - 0.1, -0.15, 0.9, 0.9); }
  }
  orb(g, x - r * 0.95, 0, r * 0.26, col, { spec: 0.45 });
}

function swordIcon(kind: 'sword' | 'longsword' | 'father' | 'blade'): Painter {
  return (g, b) => {
    const father = kind === 'father';
    const long = kind === 'longsword' || father;
    const steel = b.c1 ?? (father ? '#b6c2ce' : P.metal3);
    const grip = b.c2 ?? (father ? '#3b2418' : P.wood2);
    const brass = b.c3 ?? (father ? P.gold3 : P.gold2);
    const wear = weathering(steel);
    const a = father ? 1.7 : long ? 1.2 : 1.9, e = father ? 14.5 : long ? 14.8 : 14.25;
    if (father) b.glow = 'rgba(255,206,110,0.85)';
    frame(g, a, N - a, -Math.PI / 4, () => {
      const len = (e - a) * Math.SQRT2;
      const gripA = 2.0, gripB = long ? 6.0 : 4.8;
      const gx = gripB + 0.45, x0 = gx + 0.3;
      if (kind === 'blade') {
        const tang = seg([1.0, 0], [x0 + 0.4, 0], 8);
        tube(g, tang, tang.map(([x]) => 0.26 + 0.3 * (x / x0)), dim(steel, 0.2), { hi: 0.35, lo: 0.5 });
        swordBlade(g, b, x0, len, 1.05, steel, { wear, scale: true });
        return;
      }
      swordBlade(g, b, x0, len, long ? 1.05 : 1.08, steel, { wear, inscribe: father, fuller: long ? 0.66 : 0.6 });
      hiltGrip(g, gripA, gripB, long ? 0.52 : 0.55, grip, brass, father);
      crossguard(g, b, gx, father ? 3.2 : long ? 3.1 : 2.8, 0.92, brass, father ? 0.85 : long ? 0.22 : 0.36, father);
      pommel(g, b, 1.25, father ? 1.3 : 1.2, long && !father ? 'pear' : 'wheel', brass, father);
    });
  };
}

function dagger(g: G, b: B) {
  const steel = b.c1 ?? P.metal3, wood = b.c2 ?? '#8a5a34', brass = b.c3 ?? P.gold2;
  frame(g, 2.5, 13.5, -Math.PI / 4, () => {
    const len = (13.7 - 2.5) * Math.SQRT2;
    const hA = 0.6, hB = 5.6, x0 = 6.3, k = 1.35;
    const shape = () => {
      g.beginPath();
      g.moveTo(x0, -0.64 * k);
      g.lineTo(len - 3.1, -0.68 * k);
      g.quadraticCurveTo(len - 1.3, -0.6 * k, len, -0.12 * k);
      g.quadraticCurveTo(len - 2.5, 1.08 * k, len - 6.0, 1.05 * k);
      g.quadraticCurveTo(x0 + 1.0, 0.98 * k, x0, 0.74 * k);
      g.closePath();
    };
    fillShape(g, shape, steel);
    withClip(g, shape, () => {
      g.fillStyle = lin(g, x0, 0, len, 0, [[0, lit(steel, 0.25)], [0.3, lit(steel, 0.58)], [0.62, lit(steel, 0.22)], [1, lit(steel, 0.5)]]);
      g.fillRect(x0 - 1, -2, len, 2.3);
      g.beginPath();
      g.moveTo(x0 - 1, 0.32 * k); g.lineTo(len - 3.4, 0.3 * k); g.quadraticCurveTo(len - 1.4, 0.12 * k, len + 0.2, -0.12 * k); g.lineTo(len + 1, 3); g.lineTo(x0 - 1, 3); g.closePath();
      g.fillStyle = lin(g, 0, 0.25 * k, 0, 1.1 * k, [[0, dim(steel, 0.42)], [0.55, dim(steel, 0.12)], [1, lit(steel, 0.45)]]);
      g.fill();
      line(g, x0 + 0.4, -0.34 * k, len - 3.8, -0.38 * k, rgba(dim(steel, 0.55), 0.8), 0.16);
      line(g, x0 + 0.4, -0.2 * k, len - 3.8, -0.24 * k, rgba(lit(steel, 0.6), 0.6), 0.08);
    });
    line(g, x0 + 0.1, -0.6 * k, len - 3.1, -0.64 * k, rgba(lit(steel, 0.95), 0.9), 0.12);
    g.strokeStyle = rgba('#ffffff', 0.75);
    g.lineWidth = 0.1;
    g.beginPath(); g.moveTo(len - 0.3, 0.02); g.quadraticCurveTo(len - 2.5, 0.98 * k, len - 5.6, 0.96 * k); g.stroke();
    ellipse(g, x0 + 2.4, -0.1, 1.3, 0.11, rgba('#ffffff', 0.75));
    sparkle(g, b, x0 + 2.2, -0.1, 1.1);
    const hp = spline([[hA, 0.04], [(hA + hB) / 2, 0.12], [hB, 0]], 6);
    const hw = hp.map(([x]) => 0.74 + 0.14 * Math.sin(((x - hA) / (hB - hA)) * Math.PI));
    tube(g, hp, hw, wood, { hi: 0.45, lo: 0.55, spec: 0.2 });
    tubeLines(g, hp, hw, dim(wood, 0.6), b.rng, 7, 0.45);
    for (const x of [2.0, 4.4]) orb(g, x, 0.02, 0.24, brass, { spec: 0.7 });
    tube(g, seg([hA - 0.35, 0], [hA + 0.3, 0], 3), 0.8, brass, { hi: 0.6, spec: 0.5 });
    tube(g, seg([hB - 0.05, 0], [x0 + 0.05, 0], 3), 0.98, brass, { hi: 0.6, spec: 0.5 });
    tube(g, seg([x0 - 0.15, -1.5], [x0 - 0.15, 1.55], 6), 0.26, brass, { hi: 0.6, spec: 0.45 });
    for (const s of [-1, 1]) orb(g, x0 - 0.15, s * 1.55, 0.3, brass, { spec: 0.5 });
  });
}

function axe(g: G, b: B) {
  const steel = b.c1 ?? P.metal3, wood = b.c2 ?? P.wood3;
  const x0 = 2.6, y0 = 14.8, x1 = 8.7, y1 = 2.8;
  const len = Math.hypot(x1 - x0, y1 - y0);
  frame(g, x0, y0, Math.atan2(y1 - y0, x1 - x0), () => {
    const hp = spline([[0, 0], [len * 0.45, 0.22], [len + 0.3, 0]], 8);
    const hw = hp.map(([x]) => 0.53 - 0.07 * (x / len) + (x < 1.2 ? (1.2 - x) * 0.22 : 0));
    tube(g, hp, hw, wood, { hi: 0.45, lo: 0.5, spec: 0.15 });
    tubeLines(g, hp, hw, dim(wood, 0.55), b.rng, 8, 0.4);
    const T = len, k = 1.18;
    const head = () => {
      g.beginPath();
      g.moveTo(T - 0.4, -1.85 * k);
      g.lineTo(T - 0.25, 0.6);
      g.quadraticCurveTo(T - 0.8, 1.6 * k, T - 0.5, 2.4 * k);
      g.quadraticCurveTo(T + 0.1, 3.7 * k, T + 0.65, 4.6 * k);
      g.quadraticCurveTo(T - 2.2 * k, 6.2 * k, T - 5.3 * k, 4.35 * k);
      g.quadraticCurveTo(T - 3.4 * k, 3.1 * k, T - 2.7 * k, 1.9 * k);
      g.lineTo(T - 2.75, 0.6);
      g.lineTo(T - 2.6, -1.85 * k);
      g.closePath();
    };
    fillShape(g, head, lightLin(g, T - 1.6, 1.8, 3.8, [[0, lit(steel, 0.42)], [0.5, steel], [1, dim(steel, 0.5)]]));
    withClip(g, head, () => {
      // forge-dark round the eye, a bright ground bevel along the bit
      ellipse(g, T - 1.5, -0.3, 1.9, 2.6, rgba(dim(steel, 0.65), 0.5));
      g.beginPath();
      g.moveTo(T + 1.0, 4.8 * k); g.quadraticCurveTo(T - 2.2 * k, 6.5 * k, T - 5.6 * k, 4.35 * k);
      g.lineTo(T - 4.4 * k, 3.45 * k); g.quadraticCurveTo(T - 2.0 * k, 4.8 * k, T + 0.1, 3.6 * k); g.closePath();
      g.fillStyle = lin(g, T - 2, 3.7 * k, T - 2, 5.6 * k, [[0, lit(steel, 0.15)], [1, lit(steel, 0.85)]]);
      g.fill();
      ellipse(g, T - 0.95, 2.6 * k, 0.28, 1.7, rgba('#ffffff', 0.35), -0.3);
      g.fillStyle = lin(g, 0, -1.85 * k, 0, -1.3 * k, [[0, lit(steel, 0.65)], [1, rgba(steel, 0)]]);
      g.fillRect(T - 3, -2.4, 3, 0.8);
    });
    g.strokeStyle = rgba('#fffaf0', 0.9);
    g.lineWidth = 0.13;
    g.beginPath(); g.moveTo(T + 0.55, 4.5 * k); g.quadraticCurveTo(T - 2.2 * k, 6.05 * k, T - 5.15 * k, 4.3 * k); g.stroke();
    sparkle(g, b, T - 1.7, 5.4 * k, 1.1);
  });
}

function club(g: G, b: B, wood: string) {
  frame(g, 2.3, 13.7, -Math.PI / 4, () => {
    const len = 15.8;
    const pts = spline([[0, 0], [len * 0.5, 0.12], [len - 1.5, -0.05]], 10);
    const W = pts.map(([x]) => { const t = x / len; return t < 0.28 ? 0.52 : 0.52 + Math.pow((t - 0.28) / 0.72, 1.3) * 1.15; });
    orb(g, len - 1.45, -0.05, W[W.length - 1] * 1.02, wood, { hi: 0.45, lo: 0.55, spec: 0.12 });
    tube(g, pts, W, wood, { hi: 0.45, lo: 0.55, spec: 0.1 });
    tubeLines(g, pts, W, dim(wood, 0.55), b.rng, 10, 0.45);
    // knots: lumps on the silhouette and knot holes
    for (const [t, s] of [[0.5, 1], [0.64, -1], [0.79, 1], [0.9, -0.6]] as Pt[]) {
      const i = Math.floor(t * (pts.length - 1)), [x, y] = pts[i];
      orb(g, x, y + s * W[i] * 0.85, 0.46, wood, { hi: 0.5, lo: 0.5, spec: 0.15 });
      ellipse(g, x + 0.3, y + s * W[i] * 0.25, 0.32, 0.22, dim(wood, 0.7));
      g.strokeStyle = rgba(dim(wood, 0.45), 0.7); g.lineWidth = 0.08;
      g.beginPath(); g.ellipse(x + 0.3, y + s * W[i] * 0.25, 0.55, 0.38, 0, 0, Math.PI * 2); g.stroke();
    }
    // leather thong wound round the handle
    const hp = seg([0.3, 0], [3.4, 0], 6);
    tube(g, hp, 0.6, '#4a3020', { hi: 0.45, lo: 0.55 });
    withClip(g, () => tubePath(g, hp, 0.6), () => {
      for (let x = 0; x < 3.8; x += 0.44) line(g, x, -0.7, x + 0.32, 0.7, rgba('#1e120a', 0.7), 0.1);
    });
  });
}

function mace(g: G, b: B) {
  const head = b.c1 ?? P.metal3, shaft = b.c2 ?? P.wood2;
  if (isWoody(head)) { club(g, b, head); return; }
  frame(g, 2.4, 13.6, -Math.PI / 4, () => {
    const len = 16.4;
    const h0 = len - 5.0, h1 = len - 1.0;
    const sp = seg([0, 0], [h0 + 0.3, 0], 10);
    tube(g, sp, 0.44, shaft, { hi: 0.45, lo: 0.5, spec: isWoody(shaft) ? 0.1 : 0.4 });
    if (isWoody(shaft)) tubeLines(g, sp, 0.44, dim(shaft, 0.55), b.rng, 6, 0.4);
    const gp = seg([0.5, 0], [4.2, 0], 6);
    tube(g, gp, 0.56, '#4a3020', { hi: 0.45, lo: 0.55 });
    withClip(g, () => tubePath(g, gp, 0.56), () => { for (let x = 0; x < 4.6; x += 0.42) line(g, x, -0.6, x + 0.34, 0.6, rgba('#1e120a', 0.7), 0.1); });
    orb(g, 0.2, 0, 0.68, head, { hi: 0.55, spec: 0.6 });
    tube(g, seg([h0 - 0.7, 0], [h0 + 0.1, 0], 3), 0.66, head, { hi: 0.55, spec: 0.5 });
    const R = 2.75, core = 0.85;
    const prof: [number, number][] = [[0, core / R], [0.1, 0.72], [0.32, 1], [0.7, 0.84], [0.93, 0.6], [1, core / R]];
    const flange = (k: number, sgn: number): Pt[] => prof.map(([u, r]) => [h0 + u * (h1 - h0), sgn * Math.max(core, r * R) * k] as Pt).concat([[h1, sgn * core * k], [h0, sgn * core * k]]);
    // the two fins seen side-on
    for (const s of [1, -1]) {
      const f = flange(1, s);
      fillPts(g, f, s < 0 ? lin(g, h0, 0, h1, 0, [[0, lit(head, 0.25)], [0.4, lit(head, 0.5)], [1, head]]) : lin(g, h0, 0, h1, 0, [[0, dim(head, 0.45)], [0.5, dim(head, 0.25)], [1, dim(head, 0.4)]]));
      strokePts(g, f.slice(0, prof.length), rgba(lit(head, s < 0 ? 0.9 : 0.35), s < 0 ? 0.9 : 0.6), 0.12);
    }
    tube(g, seg([h0, 0], [h1 + 0.1, 0], 6), core, dim(head, 0.1), { hi: 0.4 });
    // the two fins turned toward the viewer
    for (const s of [1, -1]) {
      const f = flange(0.5, s);
      fillPts(g, f, s < 0 ? lit(head, 0.5) : dim(head, 0.08));
      strokePts(g, f.slice(0, prof.length), rgba(lit(head, 0.9), s < 0 ? 0.95 : 0.5), 0.1);
    }
    fillPts(g, [[h1 - 0.1, -0.68], [len, 0], [h1 - 0.1, 0.68]], lightLin(g, h1 + 0.4, 0, 0.7, tone(head, 0.6, 0.5)));
    sparkle(g, b, h0 + 1.6, -2.0, 1.1);
  });
}

function hammer(g: G, b: B) {
  const steel = b.c1 ?? P.metal3, wood = b.c2 ?? P.wood3;
  const x0 = 3.0, y0 = 14.9, x1 = 10.2, y1 = 4.0;
  const len = Math.hypot(x1 - x0, y1 - y0);
  frame(g, x0, y0, Math.atan2(y1 - y0, x1 - x0), () => {
    const hp = seg([0, 0], [len + 0.4, 0], 12);
    const hw = hp.map(([x]) => 0.52 - 0.06 * (x / len) + (x < 1.0 ? (1.0 - x) * 0.22 : 0));
    tube(g, hp, hw, wood, { hi: 0.45, lo: 0.5, spec: 0.12 });
    tubeLines(g, hp, hw, dim(wood, 0.55), b.rng, 8, 0.4);
    // worn smooth where the hand held it
    ellipse(g, 2.6, -0.12, 1.5, 0.26, rgba(lit(wood, 0.5), 0.45));
    // iron langets down the haft
    for (const s of [-1, 1]) {
      fillPts(g, [[len - 4.0, s * 0.22], [len - 0.9, s * 0.24], [len - 0.9, s * 0.54], [len - 3.8, s * 0.5]], s < 0 ? lit(steel, 0.2) : dim(steel, 0.35));
      orb(g, len - 3.2, s * 0.38, 0.12, steel, { spec: 0.6 });
    }
    const hx = len - 0.7, a = 1.35;
    // peen: a wedge tapering toward the light side
    const peen: Pt[] = [[hx - a, -0.62], [hx + a, -0.62], [hx + 0.32, -3.7], [hx - 0.32, -3.7]];
    fillPts(g, peen, lin(g, hx - a, 0, hx + a, 0, [[0, lit(steel, 0.35)], [0.45, lit(steel, 0.55)], [0.55, dim(steel, 0.1)], [1, dim(steel, 0.42)]]));
    line(g, hx - 0.32, -3.64, hx + 0.32, -3.64, lit(steel, 0.9), 0.16);
    // face block
    const face: Pt[] = [[hx - a - 0.1, 0.5], [hx + a + 0.1, 0.5], [hx + a + 0.1, 2.75], [hx - a - 0.1, 2.75]];
    fillPts(g, face, lin(g, 0, 0.45, 0, 2.8, [[0, lit(steel, 0.32)], [0.5, steel], [1, dim(steel, 0.35)]]));
    fillPts(g, [[hx - a - 0.1, 2.7], [hx + a + 0.1, 2.7], [hx + a - 0.05, 3.06], [hx - a + 0.05, 3.06]], dim(steel, 0.45));
    line(g, hx - a, 2.72, hx + a, 2.72, lit(steel, 0.8), 0.09);
    // eye cheeks
    fillPts(g, [[hx - a - 0.3, -0.7], [hx + a + 0.3, -0.7], [hx + a + 0.3, 0.7], [hx - a - 0.3, 0.7]], lightLin(g, hx, 0, 0.9, tone(steel, 0.55, 0.45)));
    line(g, hx - a - 0.25, -0.6, hx + a + 0.25, -0.6, rgba(lit(steel, 0.9), 0.9), 0.1);
    ellipse(g, hx - 0.5, 1.55, 0.24, 0.85, rgba('#ffffff', 0.45));
    sparkle(g, b, hx - 0.6, -1.7, 1.0);
  });
}

function spear(g: G, b: B) {
  const steel = b.c1 ?? P.metal3, wood = b.c2 ?? P.wood3;
  frame(g, 1.5, 14.5, -Math.PI / 4, () => {
    const len = (14.75 - 1.5) * Math.SQRT2;
    const s1 = len - 6.0;
    const sp = seg([0, 0], [s1 + 0.4, 0], 14);
    tube(g, sp, 0.4, wood, { hi: 0.45, lo: 0.5, spec: 0.12 });
    tubeLines(g, sp, 0.4, dim(wood, 0.55), b.rng, 9, 0.4);
    tube(g, seg([-0.1, 0], [0.6, 0], 3), 0.47, dim(steel, 0.25), { hi: 0.5, spec: 0.4 });
    // leather binding under the socket
    const lb = seg([s1 - 1.4, 0], [s1 + 0.1, 0], 4);
    tube(g, lb, 0.47, '#5a3a22', { hi: 0.4 });
    withClip(g, () => tubePath(g, lb, 0.47), () => { for (let x = s1 - 1.6; x < s1 + 0.3; x += 0.32) line(g, x, -0.6, x + 0.24, 0.6, rgba('#20140a', 0.7), 0.08); });
    // socket
    const sk = seg([s1, 0], [s1 + 1.9, 0], 5);
    tube(g, sk, sk.map(([x]) => 0.58 - 0.22 * ((x - s1) / 1.9)), steel, { hi: 0.55, spec: 0.5 });
    // lugs
    tube(g, seg([s1 + 0.9, -1.65], [s1 + 0.9, 1.65], 8), 0.25, steel, { hi: 0.55, spec: 0.4 });
    for (const s of [-1, 1]) orb(g, s1 + 0.9, s * 1.65, 0.32, steel, { spec: 0.5 });
    // leaf blade
    const bx = s1 + 1.7, w = 1.3;
    const leaf = () => {
      g.beginPath();
      g.moveTo(bx, -0.34);
      g.quadraticCurveTo(bx + 0.8, -w * 1.02, bx + 1.7, -w);
      g.quadraticCurveTo(len - 1.5, -w * 0.62, len, 0);
      g.quadraticCurveTo(len - 1.5, w * 0.62, bx + 1.7, w);
      g.quadraticCurveTo(bx + 0.8, w * 1.02, bx, 0.34);
      g.closePath();
    };
    fillShape(g, leaf, steel);
    withClip(g, leaf, () => {
      g.fillStyle = lin(g, bx, 0, len, 0, [[0, lit(steel, 0.3)], [0.35, lit(steel, 0.66)], [1, lit(steel, 0.35)]]);
      g.fillRect(bx - 1, -2, len, 2);
      g.fillStyle = lin(g, bx, 0, len, 0, [[0, dim(steel, 0.45)], [0.5, dim(steel, 0.2)], [1, dim(steel, 0.4)]]);
      g.fillRect(bx - 1, 0, len, 2);
      line(g, bx, 0, len, 0, rgba(lit(steel, 0.8), 0.6), 0.1);
    });
    g.strokeStyle = rgba('#ffffff', 0.85);
    g.lineWidth = 0.12;
    g.beginPath(); g.moveTo(bx + 0.4, -w * 0.75); g.quadraticCurveTo(bx + 1.2, -w * 0.97, bx + 1.7, -w * 0.92); g.quadraticCurveTo(len - 1.5, -w * 0.57, len - 0.2, -0.04); g.stroke();
    sparkle(g, b, bx + 1.7, -0.55, 1.1);
  });
}

function stick(g: G, b: B) {
  const ash = '#d6c29a', bark = '#6e5d4a';
  const pts = spline([[2.1, 14.0], [5.4, 10.4], [9.6, 6.5], [13.9, 2.1]], 6);
  const n = pts.length;
  const W = pts.map((_, i) => 0.74 - (i / n) * 0.2 + Math.sin(i * 1.7) * 0.03);
  // a twig stub
  const k = Math.floor(n * 0.42);
  tube(g, seg(pts[k], [pts[k][0] - 0.6, pts[k][1] - 1.3], 3), [0.32, 0.29, 0.26, 0.22], bark, { hi: 0.4 });
  tube(g, pts, W, ash, { hi: 0.45, lo: 0.45, spec: 0.22 });
  tubeLines(g, pts, W, dim(ash, 0.4), b.rng, 9, 0.35);
  // strips of bark the knife missed, and a knot
  tube(g, pts.slice(0, 4), W.slice(0, 4), bark, { hi: 0.4, lo: 0.5 });
  tube(g, pts.slice(n - 3), W.slice(n - 3), bark, { hi: 0.4, lo: 0.5 });
  const j = Math.floor(n * 0.7);
  ellipse(g, pts[j][0], pts[j][1], 0.4, 0.3, dim(ash, 0.55), -0.7);
  ellipse(g, pts[j][0] - 0.05, pts[j][1] - 0.05, 0.22, 0.14, dim(ash, 0.75), -0.7);
  ellipse(g, pts[0][0] - 0.12, pts[0][1] + 0.1, 0.5, 0.68, lit(ash, 0.25), 0.78);
}

function bow(g: G, b: B) {
  const wood = b.c2 ?? P.wood3;
  // limbs on a circular arc; the string runs between the tips
  const cx = 4.9, cy = 4.9, R = 7.5, a0 = -0.4, a1 = Math.PI / 2 + 0.42;
  const pts = arcPts(cx, cy, R, R, a0, a1, 40);
  const tipA = pts[0], tipB = pts[pts.length - 1];
  line(g, tipA[0], tipA[1], tipB[0], tipB[1], '#dcd2b8', 0.2);
  line(g, tipA[0] - 0.06, tipA[1] - 0.06, tipB[0] - 0.06, tipB[1] - 0.06, rgba('#fffaf0', 0.6), 0.07);
  const mid: Pt = [(tipA[0] + tipB[0]) / 2, (tipA[1] + tipB[1]) / 2];
  line(g, mid[0] - 1.0, mid[1] + 1.0, mid[0] + 1.0, mid[1] - 1.0, '#8a7a5a', 0.32);
  const hw = pts.map((_, i) => { const t = i / (pts.length - 1); return 0.24 + 0.38 * Math.pow(Math.sin(t * Math.PI), 0.8); });
  tube(g, pts, hw, wood, { hi: 0.5, lo: 0.55, spec: 0.22 });
  tubeLines(g, pts, hw, dim(wood, 0.55), b.rng, 9, 0.35);
  // leather grip at the belly
  const gp = pts.slice(16, 25);
  tube(g, gp, 0.7, '#4a2e1c', { hi: 0.45, lo: 0.55 });
  withClip(g, () => tubePath(g, gp, 0.7), () => {
    for (let i = 0; i < gp.length; i++) { const [x, y] = gp[i]; line(g, x - 0.6, y + 0.25, x + 0.35, y - 0.6, rgba('#1a0e08', 0.6), 0.09); }
  });
  // horn nocks
  tube(g, pts.slice(0, 3), 0.28, '#e6dcc2', { hi: 0.4, spec: 0.3 });
  tube(g, pts.slice(pts.length - 3), 0.28, '#e6dcc2', { hi: 0.4, spec: 0.3 });
}

function arrows(g: G, b: B) {
  for (const [dy, dx] of [[1.6, 0.4], [0, 0], [-1.6, -0.4]] as Pt[]) {
    frame(g, 2.8, 13.0, -Math.PI / 4, () => {
      const x0 = 0.5 + dx, x1 = 11.8 + dx, tip = x1 + 2.5;
      const sp = seg([x0, dy], [x1 + 0.2, dy], 8);
      tube(g, sp, 0.22, '#b89060', { hi: 0.45, lo: 0.5, spec: 0.2 });
      // broadhead
      const h: Pt[] = [[x1 - 0.1, dy - 0.36], [x1 + 0.25, dy - 0.9], [tip, dy], [x1 + 0.25, dy + 0.9], [x1 - 0.1, dy + 0.36]];
      fillPts(g, h, lightLin(g, x1 + 1, dy, 0.8, tone('#7a828c', 0.6, 0.5)));
      line(g, x1 + 0.35, dy - 0.78, tip - 0.15, dy - 0.02, rgba('#ffffff', 0.8), 0.08);
      // fletching
      for (const s of [-1, 1]) {
        const v: Pt[] = [[x0 + 3.1, dy + s * 0.18], [x0 + 2.5, dy + s * 1.05], [x0 + 0.6, dy + s * 1.08], [x0 + 0.25, dy + s * 0.18]];
        fillPts(g, v, s < 0 ? '#f2ede0' : '#b8b0a0');
        for (let k = 0; k < 3; k++) {
          const xx = x0 + 0.9 + k * 0.72;
          line(g, xx, dy + s * 0.24, xx - 0.28, dy + s * 0.98, rgba('#6a6258', 0.55), 0.14);
        }
      }
      tube(g, seg([x0 + 3.05, dy], [x0 + 3.4, dy], 2), 0.26, '#8e2f2f', { hi: 0.4 });
      tube(g, seg([x0 + 0.15, dy], [x0 + 0.5, dy], 2), 0.26, '#8e2f2f', { hi: 0.4 });
      ellipse(g, x0 - 0.02, dy, 0.16, 0.24, '#2a1a10');
    });
  }
  sparkle(g, b, 12.0, 3.9, 0.9, 0.8);
}

// ================================================================ armour: heads

function kettle(g: G, b: B) {
  const steel = b.c1 ?? P.metal3;
  const cx = 8, by = 9.9, rot = -0.05;
  const brim = () => { g.beginPath(); g.ellipse(cx, by, 7.2, 2.9, rot, 0, Math.PI * 2); };
  g.beginPath(); g.ellipse(cx, by + 0.42, 7.15, 2.85, rot, 0, Math.PI); g.fillStyle = dim(steel, 0.6); g.fill();
  fillShape(g, brim, lin(g, 0, by - 2.9, 0, by + 2.9, [[0, lit(steel, 0.5)], [0.45, steel], [1, dim(steel, 0.35)]]));
  withClip(g, brim, () => {
    g.fillStyle = lin(g, cx - 7, 0, cx + 7, 0, [[0, rgba('#fff6e0', 0.35)], [0.4, rgba('#fff6e0', 0)], [1, rgba('#101020', 0.4)]]);
    g.fillRect(0, 0, N, N);
    for (const k of [0.84, 0.68]) { g.beginPath(); g.ellipse(cx, by, 7.2 * k, 2.9 * k, rot, 0, Math.PI * 2); g.strokeStyle = rgba(dim(steel, 0.45), 0.4); g.lineWidth = 0.1; g.stroke(); }
  });
  g.beginPath(); g.ellipse(cx, by, 7.0, 2.72, rot, Math.PI * 0.95, Math.PI * 1.75); g.strokeStyle = rgba(lit(steel, 0.9), 0.85); g.lineWidth = 0.18; g.stroke();
  g.beginPath(); g.ellipse(cx, by, 7.05, 2.78, rot, Math.PI * 0.05, Math.PI * 0.9); g.strokeStyle = rgba(lit(steel, 0.25), 0.5); g.lineWidth = 0.12; g.stroke();
  const crown = () => {
    g.beginPath();
    g.moveTo(cx - 4.2, by);
    g.bezierCurveTo(cx - 4.5, by - 4.6, cx - 2.0, 2.3, cx - 0.1, 2.2);
    g.bezierCurveTo(cx + 2.0, 2.3, cx + 4.5, by - 4.6, cx + 4.2, by);
    g.ellipse(cx, by, 4.2, 1.5, 0, 0, Math.PI);
    g.closePath();
  };
  fillShape(g, crown, rad(g, cx - 1.9, 4.4, 0.2, cx + 0.3, 6.6, 6.4, [[0, lit(steel, 0.8)], [0.3, lit(steel, 0.25)], [0.68, steel], [1, dim(steel, 0.55)]]));
  withClip(g, crown, () => {
    // comb: lit on the left, shaded on the right
    g.strokeStyle = rgba(dim(steel, 0.5), 0.8); g.lineWidth = 0.22;
    g.beginPath(); g.moveTo(cx + 0.12, 2.2); g.quadraticCurveTo(cx + 0.25, 7, cx + 0.1, by + 1.6); g.stroke();
    g.strokeStyle = rgba(lit(steel, 0.8), 0.85); g.lineWidth = 0.14;
    g.beginPath(); g.moveTo(cx - 0.12, 2.3); g.quadraticCurveTo(cx - 0.05, 7, cx - 0.2, by + 1.6); g.stroke();
    ellipse(g, cx - 2.3, 5.4, 0.45, 1.5, rgba('#ffffff', 0.7), 0.3);
    ellipse(g, cx + 2.6, 6.4, 0.3, 1.0, rgba('#ffffff', 0.22), -0.3);
    // band where the crown meets the brim
    g.beginPath(); g.ellipse(cx, by - 0.1, 4.25, 1.55, 0, 0, Math.PI); g.lineWidth = 0.55; g.strokeStyle = rgba(dim(steel, 0.35), 0.6); g.stroke();
  });
  for (const a of [0.35, 0.95, 1.57, 2.2, 2.8]) orb(g, cx + Math.cos(a) * 4.0, by - 0.2 + Math.sin(a) * 1.35, 0.2, lit(steel, 0.1), { spec: 0.7 });
  sparkle(g, b, cx - 2.2, 4.6, 1.2);
}

function bascinet(g: G, b: B) {
  const steel = b.c1 ?? P.metal3;
  const dark = luma(steel) < 0.3;
  // mail aventail
  const av = () => {
    g.beginPath();
    g.moveTo(4.0, 8.4);
    g.quadraticCurveTo(3.2, 11.8, 2.4, 14.4);
    for (let i = 0; i < 7; i++) { const x = 2.4 + (i + 0.5) * 1.63; g.quadraticCurveTo(x, 15.3, x + 0.8, 14.5); }
    g.quadraticCurveTo(12.8, 11.8, 12.2, 8.4);
    g.closePath();
  };
  withClip(g, av, () => {
    mailRings(g, 1, 7, 15, 16, dark ? mix(steel, P.metal2, 0.4) : dim(steel, 0.08), 0.38);
    shadeOver(g, 2, 8, 14, 15, 0.2, 0.55);
    g.fillStyle = lin(g, 0, 8.4, 0, 10.4, [[0, 'rgba(10,8,12,0.6)'], [1, 'rgba(10,8,12,0)']]);
    g.fillRect(0, 8, N, 3);
  });
  for (let i = 0; i < 7; i++) { const x = 2.4 + (i + 0.5) * 1.63 + 0.4; ellipse(g, x, 14.75, 0.28, 0.2, P.gold2); }
  // skull
  const skull = () => {
    g.beginPath();
    g.moveTo(3.7, 9.6);
    g.bezierCurveTo(3.0, 5.2, 4.8, 1.2, 7.4, 0.8);
    g.bezierCurveTo(10.4, 1.2, 12.9, 4.4, 12.7, 9.4);
    g.quadraticCurveTo(8.2, 10.7, 3.7, 9.6);
    g.closePath();
  };
  fillShape(g, skull, rad(g, 5.8, 3.6, 0.2, 7.6, 5.6, 7, [[0, lit(steel, 0.8)], [0.3, lit(steel, 0.2)], [0.7, steel], [1, dim(steel, 0.55)]]));
  withClip(g, skull, () => {
    ellipse(g, 5.6, 3.6, 0.5, 1.5, rgba('#ffffff', dark ? 0.45 : 0.7), 0.55);
    g.strokeStyle = rgba(dim(steel, 0.45), 0.6); g.lineWidth = 0.35;
    g.beginPath(); g.moveTo(3.6, 9.0); g.quadraticCurveTo(8.2, 10.2, 12.8, 8.8); g.stroke();
  });
  for (let i = 0; i < 6; i++) orb(g, 4.4 + i * 1.6, 9.35 + Math.sin((i / 5) * Math.PI) * 0.45, 0.17, P.gold2, { spec: 0.6 });
  // snouted visor
  const visor = () => {
    g.beginPath();
    g.moveTo(5.0, 4.9);
    g.quadraticCurveTo(8.8, 3.6, 12.3, 4.8);
    g.quadraticCurveTo(14.9, 7.4, 14.3, 9.0);
    g.quadraticCurveTo(12.4, 11.7, 8.6, 11.5);
    g.quadraticCurveTo(5.6, 11.3, 4.7, 9.0);
    g.quadraticCurveTo(4.4, 6.8, 5.0, 4.9);
    g.closePath();
  };
  fillShape(g, visor, lin(g, 5, 4, 13.5, 11, [[0, lit(steel, 0.55)], [0.4, lit(steel, 0.1)], [0.75, dim(steel, 0.25)], [1, dim(steel, 0.5)]]));
  withClip(g, visor, () => {
    // the snout's ridge
    g.strokeStyle = rgba(lit(steel, 0.85), 0.9); g.lineWidth = 0.16;
    g.beginPath(); g.moveTo(9.4, 4.1); g.quadraticCurveTo(12.9, 5.8, 14.2, 8.9); g.stroke();
    g.strokeStyle = rgba(dim(steel, 0.5), 0.6); g.lineWidth = 0.2;
    g.beginPath(); g.moveTo(9.6, 4.35); g.quadraticCurveTo(12.9, 6.2, 13.9, 9.2); g.stroke();
    // eye slit with a lip above it
    g.strokeStyle = '#0c090b'; g.lineWidth = 0.55;
    g.beginPath(); g.moveTo(5.6, 6.7); g.quadraticCurveTo(9.4, 5.7, 13.3, 6.9); g.stroke();
    g.strokeStyle = rgba(lit(steel, 0.8), 0.9); g.lineWidth = 0.13;
    g.beginPath(); g.moveTo(5.5, 6.25); g.quadraticCurveTo(9.4, 5.25, 13.1, 6.45); g.stroke();
    // breaths
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const x = 10.6 + i * 0.72 - j * 0.25, y = 8.2 + j * 0.72 + i * 0.1;
      ellipse(g, x, y, 0.13, 0.13, '#0e0a0c');
      ellipse(g, x + 0.05, y + 0.08, 0.12, 0.06, rgba(lit(steel, 0.6), 0.5));
    }
    ellipse(g, 7.2, 8.8, 1.3, 0.35, rgba('#ffffff', dark ? 0.2 : 0.35), -0.2);
  });
  orb(g, 5.2, 6.4, 0.42, lit(steel, 0.1), { spec: 0.7 });
  sparkle(g, b, 5.7, 3.2, 1.1, dark ? 0.8 : 0.95);
}

function coifShape(g: G) {
  symPath(g, [8, 1.3], [[5.0, 1.35, 3.7, 4.5], [2.8, 8.0, 3.9, 9.7], [3.1, 11.2, 1.8, 13.5], [2.8, 15.0, 8, 15.0]]);
}
function coif(g: G, b: B) {
  const col = b.c1 ?? P.metal3;
  const mail = isMetal(col);
  const face = () => { g.beginPath(); g.ellipse(8.1, 7.1, 2.45, 2.95, 0, 0, Math.PI * 2); };
  withClip(g, () => coifShape(g), () => {
    if (mail) {
      mailRings(g, 0, 0, N, N, col, 0.4);
    } else {
      g.fillStyle = col;
      g.fillRect(0, 0, N, N);
      // quilted channels curving round the head
      for (let k = -5; k <= 5; k++) {
        const pts: Pt[] = [[8 + k * 0.55, 1.2], [8 + k * 1.15, 5.0], [8 + k * 1.1, 9.6], [8 + k * 1.75, 15.2]];
        const sp = spline(pts, 6);
        strokePts(g, sp.map(([x, y]) => [x + 0.5, y] as Pt), rgba(lit(col, 0.45), 0.55), 0.55);
        stitch(g, pts, rgba(dim(col, 0.6), 0.9), 0.1, 0.25, 0.15);
      }
    }
    g.fillStyle = rad(g, 5.2, 3.4, 0.5, 8, 8, 10, [[0, rgba('#fff6dc', 0.35)], [0.4, rgba('#fff6dc', 0)], [0.75, rgba('#140a18', 0.2)], [1, rgba('#140a18', 0.6)]]);
    g.fillRect(0, 0, N, N);
    // shadow cast into the neck and round the face
    g.strokeStyle = 'rgba(12,8,10,0.35)'; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(8.3, 7.4, 3.0, 3.4, 0, 0, Math.PI * 2); g.stroke();
    fold(g, [[3.9, 10.0], [8, 11.1], [12.1, 10.0]], 0.7, mail ? dim(col, 0.3) : col, 0.45);
  });
  fillShape(g, face, rad(g, 8.1, 8.6, 0.2, 8.1, 7.1, 3.2, [[0, '#3a2a22'], [0.6, '#1c1310'], [1, '#0e0a08']]));
  // bound edge round the face
  const edge = arcPts(8.1, 7.1, 2.5, 3.0, 0, Math.PI * 2, 36);
  tube(g, edge, 0.24, mail ? '#6a4a2e' : lit(col, 0.1), { hi: 0.45, lo: 0.5 });
  if (mail) sparkle(g, b, 5.0, 3.6, 0.9, 0.8);
}

function hood(g: G, b: B) {
  const col = b.c1 ?? CLOTH.forest;
  // cape with a dagged hem
  const cape = () => {
    g.beginPath();
    g.moveTo(4.3, 8.6);
    g.quadraticCurveTo(2.6, 11.0, 1.4, 13.7);
    const n = 6;
    for (let i = 0; i < n; i++) {
      const xa = 1.4 + (i / n) * 13.2, xb = 1.4 + ((i + 1) / n) * 13.2;
      g.quadraticCurveTo((xa + xb) / 2, 15.6 - Math.abs(i - 2.5) * 0.1, xb, 13.7 + (i === n - 1 ? 0 : 0.1));
    }
    g.quadraticCurveTo(13.4, 11.0, 11.8, 8.6);
    g.closePath();
  };
  fillShape(g, cape, lin(g, 1.5, 9, 14.5, 15, [[0, lit(col, 0.28)], [0.5, col], [1, dim(col, 0.45)]]));
  withClip(g, cape, () => {
    fold(g, [[5.4, 10.0], [4.4, 12.2], [3.9, 14.6]], 0.55, col, 0.45);
    fold(g, [[8.0, 10.4], [8.0, 12.6], [8.0, 15.0]], 0.55, col, 0.35);
    fold(g, [[10.6, 10.0], [11.6, 12.2], [12.2, 14.6]], 0.55, col, 0.45);
    stitch(g, [[1.8, 13.5], [8, 14.3], [14.2, 13.5]], rgba(lit(col, 0.4), 0.7));
  });
  // the hood, drawn up into a point that falls back over the crown
  const head = () => {
    g.beginPath();
    g.moveTo(3.4, 9.6);
    g.bezierCurveTo(2.4, 5.4, 4.4, 2.2, 7.6, 1.6);
    g.quadraticCurveTo(10.6, 1.0, 13.4, 0.7);
    g.quadraticCurveTo(12.4, 2.0, 12.3, 3.6);
    g.bezierCurveTo(13.4, 5.6, 13.2, 7.8, 12.7, 9.6);
    g.quadraticCurveTo(8, 11.4, 3.4, 9.6);
    g.closePath();
  };
  fillShape(g, head, rad(g, 5.6, 3.6, 0.4, 8, 6.4, 7.8, [[0, lit(col, 0.45)], [0.45, col], [1, dim(col, 0.5)]]));
  withClip(g, head, () => {
    fold(g, [[4.4, 3.8], [3.6, 6.4], [4.0, 9.4]], 0.6, col, 0.3);
    fold(g, [[10.8, 2.6], [12.2, 5.4], [12.0, 9.2]], 0.6, col, 0.45);
    fold(g, [[8.4, 1.9], [11.0, 1.9], [12.6, 1.3]], 0.35, col, 0.35);
  });
  const face = () => { g.beginPath(); g.ellipse(7.9, 6.9, 2.5, 3.0, 0.05, 0, Math.PI * 2); };
  fillShape(g, face, rad(g, 7.9, 8.5, 0.2, 7.9, 6.9, 3.2, [[0, '#2e241c'], [0.6, '#16100c'], [1, '#0a0706']]));
  tube(g, arcPts(7.9, 6.9, 2.55, 3.05, 0, Math.PI * 2, 36), 0.36, lit(col, 0.12), { hi: 0.5, lo: 0.45 });
}

function cap(g: G, b: B) {
  const col = b.c1 ?? CLOTH.linen;
  const crown = () => {
    g.beginPath();
    g.moveTo(3.0, 10.4);
    g.bezierCurveTo(2.6, 5.4, 5.2, 2.8, 8.0, 2.8);
    g.bezierCurveTo(10.9, 2.8, 13.4, 5.4, 13.0, 10.4);
    g.closePath();
  };
  fillShape(g, crown, rad(g, 5.9, 4.6, 0.3, 8, 7.2, 7.4, [[0, lit(col, 0.45)], [0.45, col], [1, dim(col, 0.5)]]));
  withClip(g, crown, () => {
    for (const x of [5.3, 8.0, 10.7]) {
      g.strokeStyle = rgba(dim(col, 0.5), 0.5); g.lineWidth = 0.14;
      g.beginPath(); g.moveTo(8, 3.0); g.quadraticCurveTo(x + (x - 8) * 0.5, 5.6, x + (x - 8) * 0.55, 10.4); g.stroke();
      g.strokeStyle = rgba(lit(col, 0.5), 0.45); g.lineWidth = 0.08;
      g.beginPath(); g.moveTo(7.9, 3.1); g.quadraticCurveTo(x + (x - 8) * 0.5 - 0.18, 5.6, x + (x - 8) * 0.55 - 0.2, 10.4); g.stroke();
    }
    fold(g, [[4.0, 6.0], [4.8, 7.8], [4.6, 9.8]], 0.5, col, 0.25);
  });
  orb(g, 8, 2.9, 0.42, dim(col, 0.1), { spec: 0.2 });
  // turned-up band
  const band = () => {
    g.beginPath();
    g.moveTo(2.7, 9.3);
    g.quadraticCurveTo(8, 11.5, 13.3, 9.3);
    g.lineTo(13.1, 11.5);
    g.quadraticCurveTo(8, 13.8, 2.9, 11.5);
    g.closePath();
  };
  fillShape(g, band, lin(g, 2.7, 9, 13.3, 12, [[0, lit(col, 0.3)], [0.5, lit(col, 0.05)], [1, dim(col, 0.4)]]));
  withClip(g, band, () => {
    stitch(g, [[2.9, 10.9], [8, 13.0], [13.1, 10.9]], rgba(dim(col, 0.55), 0.8));
    g.strokeStyle = rgba(lit(col, 0.6), 0.7); g.lineWidth = 0.14;
    g.beginPath(); g.moveTo(2.9, 9.55); g.quadraticCurveTo(8, 11.75, 13.1, 9.55); g.stroke();
  });
}

function helmet(g: G, b: B) {
  const steel = b.c1 ?? P.metal3;
  const dome = () => {
    g.beginPath();
    g.moveTo(3.2, 10.8);
    g.bezierCurveTo(2.8, 5.0, 5.2, 2.0, 8.0, 1.9);
    g.bezierCurveTo(10.8, 2.0, 13.2, 5.0, 12.8, 10.8);
    g.quadraticCurveTo(8, 12.2, 3.2, 10.8);
    g.closePath();
  };
  fillShape(g, dome, rad(g, 6.0, 4.4, 0.2, 8, 7, 7, [[0, lit(steel, 0.8)], [0.3, lit(steel, 0.2)], [0.7, steel], [1, dim(steel, 0.55)]]));
  withClip(g, dome, () => { ellipse(g, 5.6, 4.9, 0.45, 1.6, rgba('#ffffff', 0.7), 0.35); });
  const bandPts = spline([[3.1, 9.8], [8, 11.2], [12.9, 9.8]], 8);
  tube(g, bandPts, 0.55, dim(steel, 0.1), { hi: 0.5, spec: 0.3 });
  for (let i = 1; i < 6; i++) { const p = bandPts[Math.floor((i / 6) * (bandPts.length - 1))]; orb(g, p[0], p[1], 0.18, lit(steel, 0.1), { spec: 0.7 }); }
  // nasal
  fillPts(g, [[7.5, 9.8], [8.5, 9.8], [8.4, 14.2], [7.6, 14.2]], lin(g, 7.5, 0, 8.5, 0, tone(steel, 0.6, 0.45)));
  sparkle(g, b, 5.8, 4.2, 1.1);
}

// ================================================================ armour: body

type Sleeve = 'long' | 'short' | 'wide' | 'none';
function shirtPath(g: G, sleeve: Sleeve, hem: number, flare = 0) {
  const cmds: Cmd[] = [[6.1, 1.7]];
  if (sleeve === 'none') cmds.push([4.3, 2.2], [3.7, 4.6, 4.6, 6.4]);
  else {
    cmds.push([4.6, 1.9, 3.1, 2.7]);
    if (sleeve === 'long') cmds.push([1.7, 5.2, 0.9, 9.9], [3.3, 10.5], [3.8, 8.0, 4.4, 6.2]);
    else if (sleeve === 'short') cmds.push([2.0, 4.6, 1.5, 7.4], [3.8, 8.2], [4.1, 7.2, 4.5, 6.2]);
    else cmds.push([1.4, 5.6, 0.5, 11.0], [3.9, 11.9], [4.0, 8.6, 4.5, 6.4]);
  }
  cmds.push([4.3, 10.2, 3.6 - flare, hem], [5.6, hem + 0.4, 8, hem + 0.4]);
  symPath(g, [8, 1.75], cmds);
}
/** Mirror an x coordinate from the left half onto side s (-1 left, 1 right). */
function side(x: number, s: number): number { return s < 0 ? x : 16 - x; }

function clothBase(g: G, shape: () => void, col: string) {
  fillShape(g, shape, lin(g, 1, 0, 15, 0, [[0, lit(col, 0.3)], [0.42, col], [1, dim(col, 0.45)]]));
  withClip(g, shape, () => {
    g.fillStyle = lin(g, 0, 1, 0, 15, [[0, rgba('#fff4dc', 0.16)], [0.5, 'rgba(0,0,0,0)'], [1, rgba('#140c14', 0.28)]]);
    g.fillRect(0, 0, N, N);
  });
}
function neckOpening(g: G, col: string, depth = 3.6) {
  g.beginPath();
  g.moveTo(6.1, 1.8);
  g.quadraticCurveTo(8, 1.0, 9.9, 1.8);
  g.quadraticCurveTo(8, depth, 6.1, 1.8);
  g.closePath();
  g.fillStyle = lin(g, 0, 1.2, 0, depth, [[0, dim(col, 0.75)], [1, dim(col, 0.5)]]);
  g.fill();
  g.strokeStyle = rgba(lit(col, 0.45), 0.8); g.lineWidth = 0.14;
  g.beginPath(); g.moveTo(6.2, 1.9); g.quadraticCurveTo(8, depth + 0.05, 9.8, 1.9); g.stroke();
}
function belt(g: G, y: number, col = '#4a3020', buckle = P.gold2) {
  const pts = spline([[3.9, y], [8, y + 0.35], [12.1, y]], 6);
  tube(g, pts, 0.42, col, { hi: 0.45, lo: 0.5 });
  const bx = 6.6, by = y + 0.3;
  roundRect(g, bx - 0.5, by - 0.55, 1.0, 1.1, 0.2, undefined, buckle, 0.2);
  line(g, bx, by - 0.4, bx, by + 0.4, lit(buckle, 0.4), 0.1);
  // the strap end hanging from the buckle
  tube(g, spline([[bx + 0.4, by + 0.2], [bx + 0.7, by + 1.4], [bx + 0.5, by + 2.4]], 4), 0.3, col, { hi: 0.4 });
  orb(g, bx + 0.5, by + 2.45, 0.28, buckle, { spec: 0.5, ry: 0.22 });
}

function garment(kind: 'tunic' | 'gambeson' | 'mail' | 'body' | 'robe' | 'dress'): Painter {
  return (g, b) => {
    if (kind === 'mail' || kind === 'body') {
      const steel = kind === 'mail' ? b.c1 ?? P.metal3 : P.metal3;
      const mailShape = () => shirtPath(g, 'short', kind === 'body' ? 14.6 : 14.3, 0.4);
      withClip(g, mailShape, () => {
        mailRings(g, 0, 0, N, N, steel, 0.4);
        shadeOver(g, 2, 2, 14, 15, 0.3, 0.6);
        for (const s of [-1, 1]) fold(g, [[side(4.4, s), 6.3], [side(3.6, s), 7.3]], 0.6, dim(steel, 0.3), 0.5);
      });
      // brass rings at the hem and sleeves
      g.strokeStyle = P.gold2; g.lineWidth = 0.14;
      for (let x = 3.9; x < 12.2; x += 0.62) { g.beginPath(); g.ellipse(x, (kind === 'body' ? 14.6 : 14.3) + 0.12 + Math.sin(((x - 3.9) / 8.2) * Math.PI) * 0.36, 0.26, 0.2, 0, 0, Math.PI * 2); g.stroke(); }
      if (kind === 'mail') {
        for (const s of [-1, 1]) for (let t = 0; t <= 1; t += 0.25) { g.beginPath(); g.ellipse(side(1.5 + 2.3 * t, s), 7.45 + 0.8 * t, 0.26, 0.2, 0, 0, Math.PI * 2); g.stroke(); }
        neckOpening(g, steel, 3.2);
        sparkle(g, b, 4.2, 4.2, 0.9, 0.8);
        return;
      }
      // tabard or brigandine over the mail
      const cloth = b.c1 ?? CLOTH.green, trim = b.c2;
      const tab = () => {
        symPath(g, [8, 1.75], [[6.1, 1.7], [4.3, 2.2], [3.6, 4.4, 4.3, 6.4], [4.2, 10.2, 3.9, 13.9], [5.6, 14.2, 8, 14.2]]);
      };
      clothBase(g, tab, cloth);
      withClip(g, tab, () => {
        if (trim && isMetal(trim)) {
          // brigandine: rows of rivet heads
          for (let y = 3.4; y < 13.6; y += 1.05) {
            for (let x = 4.7; x < 11.6; x += 1.15) orb(g, x + ((y * 3) % 2 ? 0.3 : 0), y, 0.16, trim, { spec: 0.6, hi: 0.6 });
          }
        } else if (trim) {
          // a pale of the second colour, with trim on the edges
          g.fillStyle = lin(g, 6.9, 0, 9.1, 0, [[0, lit(trim, 0.35)], [0.5, trim], [1, dim(trim, 0.35)]]);
          g.fillRect(6.9, 0, 2.2, N);
          tab(); g.strokeStyle = trim; g.lineWidth = 0.7; g.stroke();
          tab(); g.strokeStyle = rgba(dim(trim, 0.5), 0.6); g.lineWidth = 0.12; g.stroke();
        }
        fold(g, [[5.4, 9.6], [5.2, 12], [5.0, 14.2]], 0.55, cloth, 0.3);
        fold(g, [[10.6, 9.6], [10.8, 12], [11.0, 14.2]], 0.55, cloth, 0.4);
        shadeOver(g, 3, 1, 13, 15, 0.12, 0.3);
      });
      belt(g, 9.1, '#3a2618', trim && !isMetal(trim) ? trim : P.gold2);
      neckOpening(g, cloth, 3.3);
      return;
    }
    const col = b.c1 ?? (kind === 'robe' ? CLOTH.brown : CLOTH.linen);
    if (kind === 'robe') {
      const shape = () => shirtPath(g, 'wide', 15.0, 1.2);
      clothBase(g, shape, col);
      withClip(g, shape, () => {
        for (const s of [-1, 1]) {
          g.beginPath(); g.ellipse(side(2.2, s), 11.45, 1.35, 0.5, s * -0.35, 0, Math.PI * 2);
          g.fillStyle = dim(col, 0.7); g.fill();
          fold(g, [[side(4.3, s), 6.6], [side(3.4, s), 9.0], [side(3.2, s), 11.4]], 0.6, col, 0.45);
          fold(g, [[side(2.8, s), 3.4], [side(1.8, s), 7.0], [side(1.2, s), 10.6]], 0.5, col, 0.25);
        }
        for (const [x, a] of [[5.4, 0.35], [7.4, 0.25], [9.2, 0.35], [10.8, 0.4]] as Pt[]) fold(g, [[x, 9.4], [x + (x - 8) * 0.15, 12.4], [x + (x - 8) * 0.3, 15.4]], 0.55, col, a);
      });
      // cowl lying on the shoulders
      const cowl = () => {
        g.beginPath();
        g.moveTo(4.6, 2.5);
        g.quadraticCurveTo(5.0, 0.9, 8, 0.8);
        g.quadraticCurveTo(11.0, 0.9, 11.4, 2.5);
        g.quadraticCurveTo(10.6, 5.2, 8, 5.4);
        g.quadraticCurveTo(5.4, 5.2, 4.6, 2.5);
        g.closePath();
      };
      fillShape(g, cowl, rad(g, 6.4, 1.8, 0.2, 8, 3, 4.4, [[0, lit(col, 0.35)], [0.5, col], [1, dim(col, 0.45)]]));
      g.beginPath(); g.moveTo(6.2, 2.0); g.quadraticCurveTo(8, 1.2, 9.8, 2.0); g.quadraticCurveTo(8, 4.0, 6.2, 2.0); g.closePath();
      g.fillStyle = dim(col, 0.72); g.fill();
      fold(g, [[5.6, 3.2], [8, 4.6], [10.4, 3.2]], 0.45, col, 0.35);
      // rope girdle with knotted ends
      const rope = '#d2c49c';
      const rp = spline([[3.9, 8.7], [8, 9.2], [12.1, 8.7]], 6);
      tube(g, rp, 0.24, rope, { hi: 0.4 });
      const hang = spline([[6.6, 9.1], [6.9, 11.2], [6.5, 13.8]], 6);
      tube(g, hang, 0.2, rope, { hi: 0.4 });
      const hang2 = spline([[6.9, 9.1], [7.7, 10.8], [7.9, 12.6]], 6);
      tube(g, hang2, 0.2, dim(rope, 0.1), { hi: 0.4 });
      for (const p of [hang[6], hang[hang.length - 1], hang2[hang2.length - 1]]) orb(g, p[0], p[1], 0.32, rope, { spec: 0.2 });
      orb(g, 6.8, 9.1, 0.42, rope, { spec: 0.2 });
      return;
    }
    const sleeve: Sleeve = 'long';
    const hem = kind === 'dress' ? 15.1 : 14.3;
    const shape = kind === 'dress'
      ? () => symPath(g, [8, 1.75], [[6.1, 1.7], [4.6, 1.9, 3.3, 2.7], [1.9, 5.2, 1.3, 9.8], [3.2, 10.3], [3.9, 7.8, 4.6, 6.0], [4.6, 7.8, 4.9, 8.6], [2.4, 12.4, 1.8, 15.0], [5.0, 15.6, 8, 15.5]])
      : () => shirtPath(g, sleeve, hem, 0.35);
    clothBase(g, shape, col);
    withClip(g, shape, () => {
      for (const s of [-1, 1]) {
        fold(g, [[side(4.4, s), 6.3], [side(3.6, s), 8.4], [side(3.3, s), 10.3]], 0.6, col, 0.45);
        fold(g, [[side(3.2, s), 3.2], [side(2.3, s), 5.8], [side(1.6, s), 8.8]], 0.45, col, 0.22);
      }
      if (kind === 'gambeson') {
        for (let x = 4.0; x < 12.5; x += 1.0) {
          g.fillStyle = lin(g, x, 0, x + 1, 0, [[0, rgba(lit(col, 0.5), 0.4)], [0.5, rgba(col, 0)], [1, rgba(dim(col, 0.5), 0.45)]]);
          g.fillRect(x, 2.5, 1, 12.5);
          stitch(g, [[x, 3.0], [x - (x - 8) * 0.04, 14.8]], rgba(dim(col, 0.65), 0.9), 0.1, 0.22, 0.14);
        }
        for (const s of [-1, 1]) for (let t = 0.2; t < 1; t += 0.2) {
          const ax = side(3.1 + (0.9 - 3.1) * t, s), ay = 2.7 + (9.9 - 2.7) * t, bx = side(4.4 + (3.3 - 4.4) * t, s), by = 6.2 + (10.5 - 6.2) * t;
          stitch(g, [[ax, ay], [bx, by]], rgba(dim(col, 0.6), 0.9), 0.1, 0.2, 0.14);
        }
      } else {
        fold(g, [[6.4, 10.4], [6.1, 12.4], [5.6, hem + 0.4]], 0.55, col, 0.3);
        fold(g, [[9.8, 10.6], [10.2, 12.6], [10.6, hem + 0.4]], 0.55, col, 0.38);
        fold(g, [[4.8, 3.6], [5.4, 5.6], [5.2, 8.0]], 0.5, col, 0.18);
        if (kind === 'dress') fold(g, [[8, 9.6], [8.2, 12.6], [8.4, 15.4]], 0.6, col, 0.3);
      }
      stitch(g, [[3.4, hem - 0.2], [8, hem + 0.2], [12.6, hem - 0.2]], rgba(dim(col, 0.5), 0.7));
      g.fillStyle = lin(g, 0, hem - 0.6, 0, hem + 0.4, [[0, 'rgba(0,0,0,0)'], [1, rgba(dim(col, 0.6), 0.5)]]);
      g.fillRect(0, hem - 0.6, N, 1.2);
    });
    if (kind === 'gambeson') {
      roundRect(g, 6.2, 0.6, 3.6, 1.9, 0.6, lin(g, 6.2, 0, 9.8, 0, tone(col, 0.35, 0.45)));
      stitch(g, [[6.5, 1.5], [9.5, 1.5]], rgba(dim(col, 0.6), 0.9));
      line(g, 8, 2.4, 8, 14.6, rgba(dim(col, 0.65), 0.85), 0.12);
      for (let y = 3.2; y < 14; y += 1.6) { line(g, 7.6, y, 8.4, y, '#3a2a1c', 0.2); orb(g, 8, y, 0.16, '#6a4a2a', { spec: 0.2 }); }
    } else {
      neckOpening(g, col, kind === 'dress' ? 3.8 : 3.4);
      if (kind === 'tunic' && !b.c2) {
        line(g, 8, 3.3, 8, 5.6, rgba(dim(col, 0.7), 0.9), 0.14);
        for (let y = 3.7; y < 5.6; y += 0.55) { line(g, 7.55, y, 8.45, y + 0.35, '#e8dcc0', 0.08); line(g, 8.45, y, 7.55, y + 0.35, '#c8bca0', 0.08); }
      }
    }
    if (b.c2) {
      // buttons down the front and trim at collar and cuffs
      g.strokeStyle = b.c2; g.lineWidth = 0.3;
      g.beginPath(); g.moveTo(6.2, 1.95); g.quadraticCurveTo(8, 3.6, 9.8, 1.95); g.stroke();
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(side(1.0, s), 9.7); g.lineTo(side(3.2, s), 10.3); g.lineWidth = 0.45; g.stroke(); }
      for (let y = 3.9; y < 9.2; y += 0.95) orb(g, 8, y, 0.24, b.c2, { spec: 0.75, hi: 0.6 });
      if (kind === 'dress') belt(g, 8.6, b.c2, lit(b.c2, 0.3));
    } else if (kind === 'tunic') {
      belt(g, 9.3);
    }
  };
}

function cuirass(g: G, b: B) {
  const steel = b.c1 ?? P.metal3;
  // faulds: hooped lames below the waist
  for (let i = 2; i >= 0; i--) {
    const y = 10.4 + i * 1.35, w = 4.5 + i * 0.35;
    const lame = () => { g.beginPath(); g.moveTo(8 - w, y); g.quadraticCurveTo(8, y + 0.8, 8 + w, y); g.lineTo(8 + w + 0.15, y + 1.55); g.quadraticCurveTo(8, y + 2.45, 8 - w - 0.15, y + 1.55); g.closePath(); };
    fillShape(g, lame, lin(g, 8 - w, y, 8 + w, y + 1.6, [[0, lit(steel, 0.5)], [0.35, lit(steel, 0.1)], [0.7, dim(steel, 0.2)], [1, dim(steel, 0.5)]]));
    g.strokeStyle = rgba(lit(steel, 0.9), 0.8); g.lineWidth = 0.1;
    g.beginPath(); g.moveTo(8 - w + 0.1, y + 0.1); g.quadraticCurveTo(8, y + 0.9, 8 + w - 0.1, y + 0.1); g.stroke();
    for (const s of [-1, 1]) orb(g, 8 + s * (w - 0.45), y + 0.75, 0.16, P.gold2, { spec: 0.6 });
  }
  // breastplate
  const plate = () => symPath(g, [8, 2.4], [[6.2, 2.0], [4.6, 2.0], [4.6, 3.8, 3.3, 5.0], [2.9, 8.2, 4.4, 11.0], [6.0, 12.0, 8, 12.0]]);
  fillShape(g, plate, rad(g, 5.8, 5.6, 0.3, 8, 7, 7.4, [[0, lit(steel, 0.65)], [0.35, lit(steel, 0.12)], [0.7, dim(steel, 0.12)], [1, dim(steel, 0.55)]]));
  withClip(g, plate, () => {
    // mirror-bright reflections: a window on the left breast, dark ground band, warm bounce
    ellipse(g, 5.7, 6.0, 0.55, 2.4, rgba('#ffffff', 0.75), 0.12);
    ellipse(g, 10.6, 6.3, 0.35, 1.8, rgba('#ffffff', 0.25), -0.12);
    g.fillStyle = lin(g, 0, 8.2, 0, 12.2, [[0, 'rgba(20,16,24,0)'], [0.4, 'rgba(20,16,24,0.35)'], [0.8, rgba('#c89a5a', 0.25)], [1, rgba('#c89a5a', 0.1)]]);
    g.fillRect(0, 8.2, N, 4);
    // the medial ridge
    g.strokeStyle = rgba(lit(steel, 0.9), 0.85); g.lineWidth = 0.14;
    g.beginPath(); g.moveTo(7.9, 2.6); g.quadraticCurveTo(7.8, 7.5, 7.9, 12.0); g.stroke();
    g.strokeStyle = rgba(dim(steel, 0.5), 0.55); g.lineWidth = 0.2;
    g.beginPath(); g.moveTo(8.15, 2.6); g.quadraticCurveTo(8.1, 7.5, 8.15, 12.0); g.stroke();
  });
  // rolled edges at the neck and arm holes
  tube(g, spline([[6.2, 2.1], [8, 3.0], [9.8, 2.1]], 6), 0.26, steel, { hi: 0.6, spec: 0.55 });
  for (const s of [-1, 1]) tube(g, spline([[side(4.7, s), 2.1], [side(4.4, s), 3.9], [side(3.3, s), 5.1]], 6), 0.24, steel, { hi: 0.6, spec: 0.45 });
  // shoulder straps
  for (const s of [-1, 1]) {
    fillPts(g, [[side(5.0, s), 0.8], [side(6.0, s), 0.8], [side(6.1, s), 2.4], [side(4.9, s), 2.4]], lin(g, 0, 0.8, 0, 2.4, [[0, '#5a3a22'], [1, '#3a2416']]));
    roundRect(g, side(5.0, s) - (s > 0 ? 1.0 : 0), 1.2, 1.0, 0.7, 0.15, undefined, P.gold2, 0.14);
  }
  for (const [x, y] of [[4.3, 9.9], [11.7, 9.9], [5.6, 3.0], [10.4, 3.0]]) orb(g, x, y, 0.17, lit(steel, 0.2), { spec: 0.7 });
  sparkle(g, b, 5.6, 4.6, 1.3);
}

function legs(g: G, b: B) {
  const col = b.c1 ?? CLOTH.brown;
  const metal = isMetal(col), plate = metal && luma(col) > 0.55;
  const shape = () => symPath(g, [8, 1.3], [[4.1, 1.3], [4.0, 2.7], [3.7, 6.0, 4.0, 8.4], [3.9, 10.6, 4.4, 12.6], [3.3, 13.4, 2.3, 14.2], [2.1, 14.9, 3.4, 14.9], [6.5, 14.9], [6.9, 14.2, 6.7, 12.8], [6.9, 10.4, 7.1, 8.5], [7.3, 6.5, 8, 5.3]]);
  if (plate) {
    const lower = b.c2 ?? col;
    fillShape(g, shape, dim(col, 0.3));
    for (const s of [-1, 1]) {
      const X = (x: number) => side(x, s);
      const tone2 = s < 0 ? 0 : 0.18;
      // cuisse
      fillPts(g, [[X(4.1), 2.6], [X(7.6), 2.6], [X(7.1), 7.8], [X(4.0), 7.8]], lin(g, X(4.0), 0, X(7.4), 0, tone(dim(col, tone2), 0.6, 0.5)));
      line(g, X(5.6), 2.8, X(5.55), 7.6, rgba(lit(col, 0.9), 0.8), 0.12);
      // poleyn with its fan
      fillPts(g, [[X(3.7), 8.0], [X(4.5), 7.4], [X(4.5), 9.6], [X(3.6), 9.2]], dim(col, 0.3 + tone2));
      orb(g, X(5.6), 8.5, 1.35, dim(col, tone2), { ry: 1.05, hi: 0.7, spec: 0.8 });
      // greave
      fillPts(g, [[X(4.1), 9.4], [X(7.0), 9.4], [X(6.7), 12.9], [X(4.5), 12.9]], lin(g, X(4.1), 0, X(7.0), 0, tone(dim(lower, tone2), 0.6, 0.5)));
      line(g, X(5.5), 9.6, X(5.55), 12.7, rgba(lit(lower, 0.9), 0.8), 0.12);
      // sabaton
      fillPts(g, [[X(4.4), 12.9], [X(6.8), 12.9], [X(6.6), 14.9], [X(2.3), 14.9], [X(2.6), 14.1]], lightLin(g, X(4.6), 13.9, 1.2, tone(dim(col, tone2), 0.5, 0.5)));
      for (const y of [13.4, 13.95]) line(g, X(3.0 + (y - 13.4)), y + 0.2, X(6.6), y, rgba(dim(col, 0.6), 0.8), 0.09);
    }
    fillPts(g, [[4.1, 1.3], [11.9, 1.3], [11.9, 2.7], [4.1, 2.7]], lin(g, 0, 1.3, 0, 2.7, [[0, '#6a4a2e'], [1, '#3e2a1a']]));
    for (const x of [5.0, 7.0, 9.0, 11.0]) orb(g, x, 2.0, 0.17, P.gold2, { spec: 0.6 });
    sparkle(g, b, 4.9, 8.0, 1.0);
    return;
  }
  withClip(g, shape, () => {
    if (metal) mailRings(g, 0, 0, N, N, col, 0.38);
    else { g.fillStyle = col; g.fillRect(0, 0, N, N); }
    if (b.c2) { g.fillStyle = b.c2; g.fillRect(0, 11.6, N, 5); }
    for (const [x0, x1, k] of [[3.7, 7.3, 0], [8.7, 12.3, 0.16]]) {
      g.fillStyle = lin(g, x0, 0, x1, 0, [[0, rgba('#fff4dc', 0.3 - k)], [0.35, rgba('#fff4dc', 0)], [0.7, rgba('#140a18', 0.2 + k)], [1, rgba('#140a18', 0.5 + k)]]);
      g.fillRect(x0 - 0.5, 0, x1 - x0 + 1, N);
    }
    if (!metal) {
      for (const s of [-1, 1]) {
        fold(g, [[side(4.2, s), 8.8], [side(5.4, s), 9.1], [side(6.7, s), 8.7]], 0.3, col, 0.4);
        fold(g, [[side(4.5, s), 12.2], [side(5.6, s), 12.6], [side(6.6, s), 12.3]], 0.28, col, 0.4);
        fold(g, [[side(7.0, s), 5.6], [side(6.2, s), 6.8]], 0.3, col, 0.3);
        ellipse(g, side(5.3, s), 8.4, 0.7, 0.9, rgba(lit(col, 0.5), s < 0 ? 0.3 : 0.15));
      }
    }
    g.fillStyle = lin(g, 0, 1.3, 0, 2.8, [[0, lit(metal ? '#6a4a2e' : col, 0.25)], [1, dim(metal ? '#6a4a2e' : col, 0.35)]]);
    g.fillRect(0, 1.3, N, 1.5);
    g.fillStyle = '#2a1c12';
    g.fillRect(0, 14.55, N, 0.5);
  });
  for (const x of [5.2, 7.0, 9.0, 10.8]) { line(g, x, 2.3, x - 0.25, 3.3, '#d8ccae', 0.12); line(g, x, 2.3, x + 0.25, 3.3, '#b8ac8e', 0.12); }
  if (metal) sparkle(g, b, 5.0, 5.0, 0.8, 0.8);
}

function glove(g: G, col: string, style: 'leather' | 'mail' | 'plate', shade: number) {
  const c = shade ? dim(col, shade) : col;
  const leather = style === 'leather';
  // thumb
  const th = spline([[-1.7, -0.6], [-2.9, -1.8], [-3.5, -3.3]], 5);
  tube(g, th, th.map((_, i) => 0.6 - i * 0.02), style === 'plate' ? c : c, { hi: 0.45, lo: 0.5, spec: style === 'plate' ? 0.4 : 0.1 });
  orb(g, th[th.length - 1][0], th[th.length - 1][1], 0.5, c, { spec: style === 'plate' ? 0.5 : 0.1 });
  if (style === 'mail') {
    // mitten: one mail bag for the fingers
    const mit = () => { g.beginPath(); g.moveTo(-2.0, -3.0); g.bezierCurveTo(-2.3, -7.4, 2.3, -7.6, 2.1, -3.0); g.closePath(); };
    withClip(g, mit, () => { mailRings(g, -3, -8, 3, -2.5, c, 0.36); shadeOver(g, -2.5, -7.5, 2.5, -3, 0.25, 0.5); });
  } else {
    const fingers: [number, number, number][] = [[-1.5, 3.0, -0.12], [-0.5, 3.65, -0.04], [0.5, 3.45, 0.04], [1.45, 2.7, 0.12]];
    for (const [x, len, a] of fingers) {
      const tip: Pt = [x + Math.sin(a) * len, -3.4 - Math.cos(a) * len];
      const fp = seg([x, -3.2], tip, 6);
      tube(g, fp, 0.47, c, { hi: 0.45, lo: 0.5, spec: style === 'plate' ? 0.35 : 0.08 });
      orb(g, tip[0], tip[1], 0.47, c, { spec: style === 'plate' ? 0.45 : 0.1 });
      if (style === 'plate') for (let k = 1; k < 4; k++) { const p = fp[k * 2 - 1]; line(g, p[0] - 0.46, p[1], p[0] + 0.46, p[1], rgba(dim(c, 0.6), 0.9), 0.08); }
      else { const p = fp[2]; line(g, p[0] - 0.35, p[1], p[0] + 0.35, p[1] - 0.05, rgba(dim(c, 0.5), 0.5), 0.07); }
    }
  }
  // back of the hand
  const hand = () => { g.beginPath(); g.moveTo(-2.1, 0.4); g.lineTo(-2.2, -2.6); g.quadraticCurveTo(0, -4.2, 2.2, -2.8); g.lineTo(2.0, 0.4); g.closePath(); };
  if (style === 'mail') withClip(g, hand, () => { mailRings(g, -3, -4.5, 3, 1, c, 0.36); shadeOver(g, -2.5, -4, 2.5, 0.5, 0.25, 0.5); });
  else fillShape(g, hand, lightLin(g, 0, -1.4, 2.2, tone(c, style === 'plate' ? 0.6 : 0.35, 0.5)));
  if (style === 'plate') {
    g.strokeStyle = rgba(lit(c, 0.9), 0.9); g.lineWidth = 0.12;
    g.beginPath(); g.moveTo(-2.0, -2.5); g.quadraticCurveTo(0, -3.9, 2.0, -2.6); g.stroke();
    ellipse(g, -0.9, -1.4, 0.3, 0.9, rgba('#ffffff', 0.55), 0.2);
  } else if (leather) {
    for (const x of [-1.0, 0, 1.0]) stitch(g, [[x * 0.9, -0.2], [x, -2.7]], rgba(dim(c, 0.6), 0.8));
  }
  // flared cuff
  const cuff = () => { g.beginPath(); g.moveTo(-2.1, 0.2); g.lineTo(2.0, 0.2); g.lineTo(2.7, 4.3); g.quadraticCurveTo(0.2, 5.0, -2.6, 4.3); g.closePath(); };
  const cc = style === 'plate' ? c : leather ? dim(c, 0.08) : '#5a3a24';
  fillShape(g, cuff, lightLin(g, 0, 2.2, 2.6, tone(cc, style === 'plate' ? 0.6 : 0.3, 0.5)));
  withClip(g, cuff, () => {
    if (style === 'plate') { line(g, -2.2, 1.0, 2.2, 1.0, rgba(dim(c, 0.6), 0.9), 0.1); ellipse(g, -1.2, 2.4, 0.25, 1.2, rgba('#ffffff', 0.5), 0.15); }
    else stitch(g, [[-2.3, 3.7], [0.2, 4.3], [2.4, 3.7]], rgba(lit(cc, 0.5), 0.7));
  });
  g.beginPath(); g.ellipse(0.05, 4.3, 2.65, 0.55, 0, 0, Math.PI * 2); g.fillStyle = dim(cc, 0.75); g.fill();
}
function gloves(g: G, b: B) {
  const col = b.c1 ?? P.wood2;
  const style = isMetal(col) ? (luma(col) > 0.55 ? 'plate' : 'mail') : 'leather';
  frame(g, 10.5, 9.9, 0.22, () => glove(g, col, style, 0.22), true);
  frame(g, 5.6, 10.5, -0.2, () => glove(g, col, style, 0));
  if (style !== 'leather') sparkle(g, b, 4.4, 8.4, 0.9, 0.85);
}

// ================================================================ food and drink

function bread(g: G, b: B) {
  const crust = b.c1 ?? mix(P.bread1, P.bread2, 0.35);
  const fancy = !!b.c1;
  const cx = 8, cy = 9.3;
  const loaf = () => { g.beginPath(); g.moveTo(1.6, 11.2); g.bezierCurveTo(1.0, 5.4, 5.0, 4.0, 8, 4.0); g.bezierCurveTo(11.2, 4.0, 15.0, 5.4, 14.4, 11.2); g.quadraticCurveTo(8, 14.2, 1.6, 11.2); g.closePath(); };
  // underside
  g.beginPath(); g.ellipse(cx, 11.6, 6.3, 1.9, 0, 0, Math.PI * 2); g.fillStyle = dim(crust, 0.45); g.fill();
  fillShape(g, loaf, rad(g, 5.6, 5.6, 0.4, cx, cy, 8.4, [[0, lit(crust, 0.5)], [0.35, lit(crust, 0.12)], [0.7, crust], [1, dim(crust, 0.5)]]));
  withClip(g, loaf, () => {
    const cut = (pts: Pt[], w: number) => {
      const sp = spline(pts, 6);
      strokePts(g, sp, dim(crust, 0.55), w);
      strokePts(g, sp.map(([x, y]) => [x + 0.08, y + 0.14] as Pt), lit(P.bread4, 0.2), w * 0.45);
    };
    if (fancy) {
      cut([[4.4, 6.0], [8.2, 8.2], [11.4, 10.8]], 0.55);
      cut([[11.8, 5.6], [8.0, 8.3], [4.8, 11.2]], 0.55);
      for (let i = 0; i < 26; i++) {
        const a = b.rng.next() * Math.PI * 2, r = Math.sqrt(b.rng.next()) * 5.4;
        ellipse(g, cx + Math.cos(a) * r, 8.0 + Math.sin(a) * r * 0.55, 0.16, 0.06, '#3a2410', b.rng.next() * 3);
      }
    } else {
      for (const x of [4.6, 7.4, 10.2]) cut([[x, 5.4], [x + 1.4, 8.0], [x + 2.2, 10.6]], 0.5);
    }
    for (let i = 0; i < 70; i++) {
      const a = b.rng.next() * Math.PI * 2, r = Math.sqrt(b.rng.next()) * 5.6;
      ellipse(g, cx - 1 + Math.cos(a) * r, 7.0 + Math.sin(a) * r * 0.45, 0.14, 0.1, rgba('#f6efe0', 0.18 + b.rng.next() * 0.3));
    }
    ellipse(g, 5.2, 5.8, 1.6, 0.5, rgba('#fff4dc', 0.25), -0.3);
  });
}

function roll(g: G, b: B) {
  const cake = !!b.c1;
  const dough = cake ? P.bread2 : P.bread3;
  g.beginPath(); g.ellipse(8, 11.3, 5.6, 1.9, 0, 0, Math.PI * 2); g.fillStyle = dim(dough, 0.45); g.fill();
  const bun = () => { g.beginPath(); g.moveTo(2.4, 11.0); g.bezierCurveTo(2.0, 6.0, 5.2, 4.6, 8, 4.6); g.bezierCurveTo(10.8, 4.6, 14.0, 6.0, 13.6, 11.0); g.quadraticCurveTo(8, 13.6, 2.4, 11.0); g.closePath(); };
  fillShape(g, bun, rad(g, 6.0, 6.2, 0.4, 8, 9, 7, [[0, lit(dough, 0.55)], [0.4, lit(dough, 0.1)], [0.75, dough], [1, dim(dough, 0.5)]]));
  if (cake) {
    const glaze = b.c1!;
    const top = () => {
      g.beginPath();
      g.moveTo(2.6, 8.6);
      g.bezierCurveTo(2.8, 5.4, 5.4, 4.7, 8, 4.7);
      g.bezierCurveTo(10.6, 4.7, 13.2, 5.4, 13.4, 8.6);
      // drips down the side
      const xs = [12.6, 11.0, 9.4, 7.6, 5.8, 4.2, 3.0];
      xs.forEach((x, i) => { const d = i % 2 ? 1.4 : 0.7; g.quadraticCurveTo(x + 0.5, 9.2 + d, x, 9.0 + (i % 2 ? 0.2 : 0.9)); });
      g.closePath();
    };
    fillShape(g, top, rad(g, 6.2, 5.8, 0.2, 8, 7, 6.4, [[0, lit(glaze, 0.7)], [0.35, lit(glaze, 0.2)], [0.8, glaze], [1, dim(glaze, 0.35)]]));
    ellipse(g, 6.0, 6.0, 1.7, 0.45, rgba('#fffbe8', 0.7), -0.25);
    ellipse(g, 10.6, 7.4, 0.5, 0.2, rgba('#fffbe8', 0.45), 0.4);
    for (const [x, y, a] of [[7.0, 6.4, 0.4], [9.2, 6.0, -0.5], [8.2, 7.6, 1.2], [5.6, 7.4, -0.2]]) { ellipse(g, x, y, 0.5, 0.2, '#f0dcb0', a); ellipse(g, x - 0.1, y - 0.06, 0.3, 0.08, '#fff6e0', a); }
    sparkle(g, b, 6.0, 5.9, 0.9, 0.8);
  } else {
    withClip(g, bun, () => {
      // the split: crust lips either side of a pale, torn crumb
      g.beginPath(); g.moveTo(3.4, 8.2); g.quadraticCurveTo(8, 4.4, 12.6, 8.0); g.quadraticCurveTo(8, 7.4, 3.4, 8.2); g.closePath();
      g.fillStyle = lin(g, 0, 5.6, 0, 8.2, [[0, '#fbeccc'], [1, '#e8c890']]); g.fill();
      for (let i = 0; i < 16; i++) ellipse(g, 4.6 + i * 0.45, 6.6 + Math.sin(i * 1.7) * 0.25 - Math.sin((i / 15) * Math.PI) * 0.6, 0.18, 0.12, rgba('#d8b070', 0.6));
      strokePts(g, spline([[3.4, 8.2], [8, 7.35], [12.6, 8.0]], 6), dim(dough, 0.35), 0.28);
      strokePts(g, spline([[3.6, 8.0], [8, 4.55], [12.4, 7.85]], 6), rgba(dim(dough, 0.5), 0.8), 0.22);
      ellipse(g, 5.6, 8.9, 1.8, 0.4, rgba('#fff4dc', 0.3), -0.1);
      for (let i = 0; i < 30; i++) ellipse(g, 3.4 + b.rng.next() * 9, 8 + b.rng.next() * 3.5, 0.12, 0.08, rgba('#f8f0e0', 0.35));
    });
  }
}

function fruit(g: G, b: B) {
  const col = b.c1 ?? '#c8302a';
  const h = hue(col);
  const pear = h > 35 && h < 160;
  const body = () => {
    g.beginPath();
    if (pear) {
      g.moveTo(8.3, 3.6);
      g.bezierCurveTo(10.0, 3.6, 10.2, 6.2, 11.4, 7.8);
      g.bezierCurveTo(13.8, 10.6, 12.6, 14.6, 8.2, 14.6);
      g.bezierCurveTo(3.8, 14.6, 2.6, 10.6, 5.0, 7.8);
      g.bezierCurveTo(6.4, 6.2, 6.6, 3.6, 8.3, 3.6);
    } else {
      g.moveTo(8, 5.2);
      g.bezierCurveTo(9.6, 3.6, 14.2, 4.0, 14.1, 9.0);
      g.bezierCurveTo(14.0, 13.2, 10.8, 14.8, 8, 14.2);
      g.bezierCurveTo(5.2, 14.8, 2.0, 13.2, 1.9, 9.0);
      g.bezierCurveTo(1.8, 4.0, 6.4, 3.6, 8, 5.2);
    }
    g.closePath();
  };
  fillShape(g, body, rad(g, 5.8, 7.2, 0.3, 8, 9.4, 7, [[0, lit(col, 0.55)], [0.35, lit(col, 0.1)], [0.75, col], [1, dim(col, 0.55)]]));
  withClip(g, body, () => {
    // streaks and freckles
    for (let i = 0; i < 16; i++) {
      const x = 3 + b.rng.next() * 10;
      strokePts(g, spline([[x, 5], [x + (x - 8) * 0.3, 9.5], [x + (x - 8) * 0.1, 14]], 4), rgba(b.rng.next() < 0.5 ? dim(col, 0.35) : lit(col, 0.3), 0.18), 0.3 + b.rng.next() * 0.3);
    }
    for (let i = 0; i < 26; i++) ellipse(g, 3 + b.rng.next() * 10, 5 + b.rng.next() * 9, 0.09, 0.09, rgba(pear ? '#6a5a20' : '#f4e0a0', 0.5));
    g.fillStyle = rad(g, 11.5, 12.5, 0.5, 11.5, 12.5, 4, [[0, rgba(dim(col, 0.6), 0.45)], [1, rgba(dim(col, 0.6), 0)]]);
    g.fillRect(0, 0, N, N);
    ellipse(g, 5.2, 7.4, 1.2, 0.7, rgba('#fffaf0', 0.6), -0.7);
    ellipse(g, 4.6, 8.4, 0.35, 0.22, rgba('#ffffff', 0.8), -0.7);
  });
  const top: Pt = pear ? [8.3, 3.9] : [8.1, 5.2];
  if (!pear) { g.beginPath(); g.ellipse(top[0], top[1] + 0.15, 1.1, 0.45, 0, 0, Math.PI * 2); g.fillStyle = rgba(dim(col, 0.6), 0.8); g.fill(); }
  tube(g, spline([top, [top[0] + 0.1, top[1] - 1.2], [top[0] + 0.6, top[1] - 2.3]], 4), 0.2, '#5a3a1e', { hi: 0.4 });
  // leaf
  frame(g, top[0] + 0.3, top[1] - 1.3, -0.35, () => {
    const lf = () => { g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(1.6, -1.2, 3.6, -0.2); g.quadraticCurveTo(1.8, 0.9, 0, 0); g.closePath(); };
    fillShape(g, lf, lightLin(g, 1.8, -0.2, 0.9, tone('#5c8f3d', 0.4, 0.45)));
    line(g, 0.2, 0, 3.2, -0.2, rgba('#b8d890', 0.7), 0.07);
  });
}

function cheese(g: G, b: B) {
  const paste = b.c1 ?? '#ecd27e', rind = '#c89038';
  const A: Pt = [1.8, 8.4], Bk: Pt = [12.2, 3.9], C: Pt = [14.4, 7.2];
  const top = () => { g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(Bk[0], Bk[1]); g.quadraticCurveTo(14.0, 4.6, C[0], C[1]); g.closePath(); };
  const front = () => { g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(C[0], C[1]); g.lineTo(C[0], C[1] + 4.6); g.lineTo(A[0], A[1] + 3.6); g.closePath(); };
  const rindSide = () => { g.beginPath(); g.moveTo(C[0], C[1]); g.quadraticCurveTo(15.1, 6.2, 14.6, 5.0); g.lineTo(14.6, 9.6); g.quadraticCurveTo(15.1, 10.8, C[0], C[1] + 4.6); g.closePath(); };
  fillShape(g, rindSide, lin(g, 14, 0, 15.2, 0, [[0, rind], [1, dim(rind, 0.5)]]));
  fillShape(g, front, lin(g, A[0], A[1], C[0], C[1] + 4.6, [[0, lit(paste, 0.2)], [0.6, paste], [1, dim(paste, 0.3)]]));
  withClip(g, front, () => {
    for (const [x, y, r] of [[4.4, 10.0, 0.5], [7.2, 9.6, 0.7], [9.8, 10.8, 0.45], [11.8, 9.2, 0.55], [6.0, 11.2, 0.35], [12.6, 11.6, 0.4]]) {
      ellipse(g, x, y, r, r * 0.8, dim(paste, 0.35));
      ellipse(g, x + 0.1, y + r * 0.35, r * 0.8, r * 0.4, rgba(lit(paste, 0.4), 0.8));
    }
    g.fillStyle = lin(g, 0, 11, 0, 13, [[0, rgba(rind, 0)], [1, rgba(rind, 0.6)]]);
    g.fillRect(0, 10.5, N, 3);
  });
  fillShape(g, top, lin(g, 3, 5, 12, 8, [[0, lit(paste, 0.5)], [1, lit(paste, 0.15)]]));
  withClip(g, top, () => {
    for (const [x, y, r] of [[6.2, 6.8, 0.4], [9.4, 5.8, 0.55], [11.8, 6.4, 0.35]]) { ellipse(g, x, y, r, r * 0.55, dim(paste, 0.3)); ellipse(g, x + 0.1, y + 0.1, r * 0.7, r * 0.3, rgba(lit(paste, 0.4), 0.7)); }
    g.strokeStyle = rgba(rind, 0.9); g.lineWidth = 0.5;
    g.beginPath(); g.moveTo(Bk[0], Bk[1]); g.quadraticCurveTo(14.0, 4.6, C[0], C[1]); g.stroke();
  });
  line(g, A[0] + 0.2, A[1], C[0] - 0.2, C[1], rgba('#fffbe8', 0.8), 0.12);
  // crumbs
  for (const [x, y] of [[3.2, 13.0], [2.4, 12.6], [4.2, 13.2]]) orb(g, x, y, 0.28, paste, { spec: 0.2 });
}

function sausage(g: G, b: B) {
  const col = b.c1 ?? '#8a3a2a';
  const pts = arcPts(8, 8.6, 5.2, 4.3, -Math.PI * 0.28, Math.PI * 1.28, 36);
  tube(g, pts, pts.map((_, i) => 1.35 - Math.pow(Math.abs(i / (pts.length - 1) - 0.5) * 2, 6) * 0.35), col, { hi: 0.55, lo: 0.55, spec: 0.45 });
  const ns = normalsOf(pts);
  for (let i = 2; i < pts.length - 2; i += 1) {
    const [x, y] = pts[i], [nx, ny] = ns[i];
    const o = (b.rng.next() * 1.6 - 0.8) * 1.1;
    ellipse(g, x + nx * o, y + ny * o, 0.14, 0.1, rgba('#f0d8c0', 0.5));
    if (i % 4 === 0) fold(g, [[x + nx * 1.1, y + ny * 1.1], [x + nx * 0.3, y + ny * 0.3]], 0.14, col, 0.35);
  }
  // tied ends
  for (const i of [0, pts.length - 1]) {
    const [x, y] = pts[i];
    ellipse(g, x, y - 0.3, 0.55, 0.45, dim(col, 0.2));
    tube(g, spline([[x - 0.3, y - 0.6], [x, y - 1.3], [x + (i ? -0.3 : 0.3), y - 2.0]], 4), 0.1, '#d8ccb0', { hi: 0.4 });
  }
}

function meat(g: G, b: B) {
  const col = b.c1 ?? '#b85a4a';
  const cooked = luma(col) < 0.36;
  // bone
  frame(g, 7.8, 8.0, -Math.PI / 4, () => {
    tube(g, seg([0, 0], [6.0, 0], 6), 0.55, '#e6d8b8', { hi: 0.4, spec: 0.3 });
    orb(g, 6.2, -0.55, 0.72, '#e6d8b8', { spec: 0.35 });
    orb(g, 6.4, 0.55, 0.72, '#e2d2b0', { spec: 0.25 });
  });
  const lump = () => { g.beginPath(); g.moveTo(9.6, 5.4); g.bezierCurveTo(12.4, 7.2, 11.8, 12.6, 7.4, 13.8); g.bezierCurveTo(3.4, 14.8, 1.2, 12.0, 2.0, 8.6); g.bezierCurveTo(2.8, 5.0, 7.4, 3.6, 9.6, 5.4); g.closePath(); };
  fillShape(g, lump, rad(g, 5.0, 7.4, 0.3, 6.8, 9.6, 6.6, [[0, lit(col, 0.5)], [0.4, lit(col, 0.1)], [0.8, col], [1, dim(col, 0.55)]]));
  withClip(g, lump, () => {
    if (cooked) {
      for (let i = 0; i < 4; i++) strokePts(g, seg([2.6 + i * 2.2, 6.6 + i * 0.4], [4.0 + i * 2.2, 12.8 - i * 0.2], 2), rgba('#2a160c', 0.55), 0.35);
      for (let i = 0; i < 40; i++) ellipse(g, 2 + b.rng.next() * 10, 5 + b.rng.next() * 9, 0.3, 0.2, rgba(b.rng.next() < 0.5 ? '#3a200e' : lit(col, 0.4), 0.35), b.rng.next() * 3);
    } else {
      // marbling and a fat cap
      for (let i = 0; i < 7; i++) {
        const x = 3 + b.rng.next() * 7, y = 6 + b.rng.next() * 6;
        strokePts(g, spline([[x, y], [x + 1 + b.rng.next(), y + (b.rng.next() - 0.5) * 1.4], [x + 2.2, y + (b.rng.next() - 0.5)]], 4), rgba('#f4e2d0', 0.5), 0.14 + b.rng.next() * 0.12);
      }
      g.strokeStyle = rgba('#f2e0c8', 0.85); g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(2.4, 8.2); g.bezierCurveTo(3.2, 5.2, 7.2, 4.0, 9.4, 5.5); g.stroke();
    }
    ellipse(g, 4.6, 7.4, 1.4, 0.45, rgba('#fff6ec', cooked ? 0.45 : 0.55), -0.6);
    ellipse(g, 9.2, 11.0, 0.6, 0.2, rgba('#fff6ec', 0.3), -0.9);
  });
  sparkle(g, b, 4.4, 7.2, 0.8, 0.75);
}

function fish(g: G, b: B) {
  const side = b.c1 ?? '#c08a44', back = dim(side, 0.5), belly = '#ecdcb0';
  frame(g, 8, 8.6, -0.5, () => {
    // tail
    const tail = () => { g.beginPath(); g.moveTo(-5.2, 0); g.quadraticCurveTo(-6.4, -0.6, -7.3, -2.2); g.quadraticCurveTo(-6.8, 0, -7.4, 2.1); g.quadraticCurveTo(-6.3, 0.7, -5.2, 0); g.closePath(); };
    fillShape(g, tail, lin(g, -7.4, 0, -5.2, 0, [[0, dim(side, 0.4)], [1, side]]));
    withClip(g, tail, () => { for (let k = -3; k <= 3; k++) line(g, -5.4, 0, -7.6, k * 0.7, rgba(dim(side, 0.6), 0.6), 0.06); });
    // fins
    fillPts(g, [[-1.6, -1.6], [0.2, -2.9], [1.8, -1.9]], lin(g, 0, -3, 0, -1.6, [[0, dim(side, 0.35)], [1, side]]));
    fillPts(g, [[-2.8, 1.3], [-1.6, 2.5], [-0.8, 1.5]], dim(side, 0.3));
    const body = () => { g.beginPath(); g.moveTo(-5.6, 0); g.bezierCurveTo(-3.5, -2.3, 3.2, -2.4, 6.4, -0.4); g.quadraticCurveTo(7.0, 0.2, 6.3, 0.7); g.bezierCurveTo(3.2, 2.2, -3.4, 2.0, -5.6, 0); g.closePath(); };
    fillShape(g, body, lin(g, 0, -2.2, 0, 1.9, [[0, back], [0.35, side], [0.7, lit(side, 0.3)], [1, belly]]));
    withClip(g, body, () => {
      for (let i = 0; i < 34; i++) {
        const x = -4.6 + b.rng.next() * 9.6, y = -1.5 + b.rng.next() * 2.0;
        ellipse(g, x, y, 0.13, 0.13, rgba(b.rng.next() < 0.7 ? '#3a2412' : '#e8c890', 0.55));
      }
      g.strokeStyle = rgba(lit(side, 0.6), 0.6); g.lineWidth = 0.12;
      g.beginPath(); g.moveTo(-5.0, -0.1); g.quadraticCurveTo(0, -0.6, 5.6, -0.2); g.stroke();
      ellipse(g, 0.6, -1.2, 3.2, 0.4, rgba('#fff8e0', 0.35), -0.05);
      // gill line and a smoky head
      g.strokeStyle = rgba(dim(side, 0.6), 0.8); g.lineWidth = 0.14;
      g.beginPath(); g.moveTo(3.9, -1.4); g.quadraticCurveTo(3.3, 0, 3.9, 1.2); g.stroke();
      g.fillStyle = lin(g, 3.8, 0, 7, 0, [[0, 'rgba(40,20,10,0)'], [1, 'rgba(40,20,10,0.4)']]);
      g.fillRect(3.8, -3, 4, 6);
    });
    orb(g, 5.1, -0.45, 0.42, '#f2e8c8', { spec: 0 });
    orb(g, 5.15, -0.45, 0.24, '#140c08', { spec: 0.9, hi: 0.3 });
    line(g, 6.3, 0.3, 5.5, 0.55, rgba('#2a160c', 0.8), 0.1);
  });
}

function bowl(g: G, b: B) {
  const stew = b.c1 ?? '#8a5a3a', wood = P.wood3;
  // spoon behind
  frame(g, 8.6, 7.4, -0.95, () => {
    tube(g, seg([0, 0], [7.2, 0], 8), 0.26, P.wood4, { hi: 0.45 });
    orb(g, 7.2, 0, 0.34, P.wood4, { spec: 0.2 });
  });
  const cx = 8, ry = 2.4, top = 7.6;
  const body = () => { g.beginPath(); g.moveTo(cx - 6.4, top); g.bezierCurveTo(cx - 6.2, 12.4, cx - 3.2, 14.0, cx, 14.0); g.bezierCurveTo(cx + 3.2, 14.0, cx + 6.2, 12.4, cx + 6.4, top); g.ellipse(cx, top, 6.4, ry, 0, 0, Math.PI); g.closePath(); };
  fillShape(g, body, lin(g, 1.6, 0, 14.4, 0, [[0, lit(wood, 0.35)], [0.35, wood], [1, dim(wood, 0.55)]]));
  withClip(g, body, () => {
    for (let i = 0; i < 9; i++) {
      const y = top + 1 + i * 0.62;
      g.strokeStyle = rgba(dim(wood, 0.55), 0.35); g.lineWidth = 0.08;
      g.beginPath(); g.ellipse(cx + (b.rng.next() - 0.5) * 2, y, 6.2 - i * 0.3, 1.8 + b.rng.next(), 0, 0.1, Math.PI - 0.1); g.stroke();
    }
    g.fillStyle = lin(g, 0, 11.5, 0, 14, [[0, 'rgba(20,10,5,0)'], [1, 'rgba(20,10,5,0.35)']]);
    g.fillRect(0, 11, N, 3);
    ellipse(g, 3.6, 10.2, 0.4, 1.4, rgba('#fff4dc', 0.3), 0.35);
  });
  g.beginPath(); g.ellipse(cx, top, 6.4, ry, 0, 0, Math.PI * 2); g.fillStyle = lin(g, 0, top - ry, 0, top + ry, [[0, dim(wood, 0.2)], [1, lit(wood, 0.35)]]); g.fill();
  const inner = () => { g.beginPath(); g.ellipse(cx, top + 0.1, 5.8, ry - 0.45, 0, 0, Math.PI * 2); };
  fillShape(g, inner, rad(g, cx - 1, top - 0.6, 0.3, cx, top, 6, [[0, lit(stew, 0.35)], [0.6, stew], [1, dim(stew, 0.45)]]));
  withClip(g, inner, () => {
    const bits: [number, number, string][] = [[5.0, 7.4, '#e8a040'], [7.2, 8.4, '#efe0c0'], [9.6, 7.0, '#6a3a22'], [11.2, 8.2, '#e8a040'], [8.4, 6.6, '#efe0c0'], [6.0, 8.8, '#6a3a22'], [10.4, 8.9, '#efe0c0']];
    for (const [x, y, c] of bits) { orb(g, x, y, 0.62, c, { ry: 0.42, spec: 0.35, hi: 0.4 }); }
    for (let i = 0; i < 8; i++) ellipse(g, 3 + b.rng.next() * 10, 6.4 + b.rng.next() * 2.6, 0.18, 0.1, '#4a7a2e');
    ellipse(g, 6.2, 6.6, 1.4, 0.25, rgba('#fff6e0', 0.35));
  });
  g.strokeStyle = rgba(lit(wood, 0.6), 0.8); g.lineWidth = 0.12;
  g.beginPath(); g.ellipse(cx, top, 6.3, ry - 0.1, 0, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
  // steam
  b.post.push((h) => {
    for (const [x, d] of [[6.6, 0], [9.2, 1]]) {
      h.strokeStyle = 'rgba(255,250,240,0.35)'; h.lineWidth = 0.35;
      h.beginPath(); h.moveTo(x, 5.6); h.bezierCurveTo(x - 0.9, 4.4 - d * 0.3, x + 0.9, 3.2, x - 0.2, 1.6 + d * 0.4); h.stroke();
    }
  });
}

function mug(g: G, b: B) {
  const wood = b.c1 ?? P.wood3, iron = '#4a4e56';
  // handle
  const hp = spline([[10.8, 6.2], [13.7, 6.4], [14.0, 9.4], [13.2, 11.6], [10.8, 11.8]], 5);
  tube(g, hp, 0.62, dim(wood, 0.1), { hi: 0.45, lo: 0.55 });
  const body = () => { g.beginPath(); g.moveTo(3.4, 5.4); g.lineTo(11.2, 5.4); g.lineTo(10.8, 14.2); g.ellipse(7.1, 14.2, 3.7, 0.9, 0, 0, Math.PI); g.lineTo(3.4, 5.4); g.closePath(); };
  fillShape(g, body, lin(g, 3.4, 0, 11.2, 0, [[0, lit(wood, 0.3)], [0.4, wood], [1, dim(wood, 0.55)]]));
  withClip(g, body, () => {
    for (let x = 4.3; x < 11; x += 1.25) {
      line(g, x, 5, x - (x - 7.3) * 0.05, 15.2, rgba(dim(wood, 0.6), 0.7), 0.1);
      line(g, x + 0.12, 5, x + 0.12 - (x - 7.3) * 0.05, 15.2, rgba(lit(wood, 0.4), 0.35), 0.06);
    }
    for (const y of [7.0, 12.6]) {
      g.beginPath(); g.ellipse(7.3, y, 4.2, 0.9, 0, 0, Math.PI); g.lineWidth = 0.55; g.strokeStyle = iron; g.stroke();
      g.beginPath(); g.ellipse(7.3, y - 0.18, 4.2, 0.9, 0, Math.PI * 0.35, Math.PI * 0.8); g.lineWidth = 0.14; g.strokeStyle = rgba(lit(iron, 0.7), 0.9); g.stroke();
    }
  });
  // foam spilling over the rim
  const foam = () => {
    g.beginPath();
    g.moveTo(3.0, 5.6);
    const bumps: Pt[] = [[3.2, 3.4], [5.0, 2.4], [7.2, 2.2], [9.4, 2.4], [11.2, 3.6], [11.6, 5.4]];
    let prev: Pt = [3.0, 5.6];
    for (const p of bumps) { g.quadraticCurveTo((prev[0] + p[0]) / 2 - 0.3, Math.min(prev[1], p[1]) - 0.9, p[0], p[1]); prev = p; }
    g.quadraticCurveTo(11.4, 6.6, 10.6, 6.2);
    g.quadraticCurveTo(10.2, 7.9, 9.7, 6.4);
    g.quadraticCurveTo(7.2, 7.0, 5.2, 6.5);
    g.quadraticCurveTo(4.6, 8.4, 4.0, 6.3);
    g.quadraticCurveTo(3.1, 6.4, 3.0, 5.6);
    g.closePath();
  };
  fillShape(g, foam, rad(g, 5.6, 3.2, 0.3, 7.2, 4.8, 5.4, [[0, '#fffdf4'], [0.55, '#f0e6cc'], [1, '#c8b890']]));
  withClip(g, foam, () => {
    for (let i = 0; i < 14; i++) { const x = 3.6 + b.rng.next() * 7.6, y = 3 + b.rng.next() * 3; g.strokeStyle = rgba('#b8a880', 0.45); g.lineWidth = 0.06; g.beginPath(); g.arc(x, y, 0.15 + b.rng.next() * 0.2, 0, Math.PI * 2); g.stroke(); }
  });
}

function potion(g: G, b: B) {
  const liq = b.c1 ?? '#b8302a';
  const cx = 8;
  // three flask shapes, picked by the brew's colour so each potion keeps its own
  const kind = hashStr(liq) % 3;
  let flask: () => void, surf: number, glint: Pt, neckY: number, neckW: number;
  if (kind === 0) {
    const cy = 10.1, r = 4.7;
    flask = () => { g.beginPath(); g.moveTo(cx - 1.05, 5.0); g.lineTo(cx - 1.05, 6.0); g.bezierCurveTo(cx - 3.4, 6.5, cx - r, 7.8, cx - r, cy); g.arc(cx, cy, r, Math.PI, 0, true); g.bezierCurveTo(cx + r, 7.8, cx + 3.4, 6.5, cx + 1.05, 6.0); g.lineTo(cx + 1.05, 5.0); g.closePath(); };
    surf = 8.2; glint = [cx - 2.6, cy - 1.8]; neckY = 4.5; neckW = 1.45;
  } else if (kind === 1) {
    // a tall vial
    flask = () => { g.beginPath(); g.moveTo(cx - 0.95, 4.2); g.lineTo(cx - 0.95, 5.4); g.quadraticCurveTo(cx - 2.6, 5.8, cx - 2.6, 7.4); g.lineTo(cx - 2.6, 13.2); g.quadraticCurveTo(cx - 2.6, 15.0, cx, 15.0); g.quadraticCurveTo(cx + 2.6, 15.0, cx + 2.6, 13.2); g.lineTo(cx + 2.6, 7.4); g.quadraticCurveTo(cx + 2.6, 5.8, cx + 0.95, 5.4); g.lineTo(cx + 0.95, 4.2); g.closePath(); };
    surf = 7.6; glint = [cx - 1.6, 8.0]; neckY = 3.7; neckW = 1.35;
  } else {
    // a pear-shaped flask with a long neck
    flask = () => { g.beginPath(); g.moveTo(cx - 0.9, 3.4); g.lineTo(cx - 0.9, 6.4); g.bezierCurveTo(cx - 1.6, 8.0, cx - 4.8, 9.4, cx - 4.6, 12.0); g.quadraticCurveTo(cx - 4.4, 15.0, cx, 15.0); g.quadraticCurveTo(cx + 4.4, 15.0, cx + 4.6, 12.0); g.bezierCurveTo(cx + 4.8, 9.4, cx + 1.6, 8.0, cx + 0.9, 6.4); g.lineTo(cx + 0.9, 3.4); g.closePath(); };
    surf = 9.4; glint = [cx - 2.5, 11.0]; neckY = 2.9; neckW = 1.3;
  }
  // glass: pale and bright, see-through above the brew
  fillShape(g, flask, lin(g, 3, 5, 13, 12, [[0, rgba('#f2f8f6', 0.62)], [1, rgba('#b8c8c8', 0.5)]]));
  withClip(g, flask, () => {
    g.beginPath(); g.moveTo(0, surf); g.quadraticCurveTo(cx, surf + 0.5, N, surf); g.lineTo(N, N); g.lineTo(0, N); g.closePath();
    g.fillStyle = rad(g, cx + 1.8, 12.4, 0.3, cx + 0.5, 11.0, 6.2, [[0, lit(liq, 0.55)], [0.4, liq], [1, dim(liq, 0.55)]]);
    g.fill();
    g.beginPath(); g.ellipse(cx, surf + 0.25, 5, 0.55, 0, 0, Math.PI * 2); g.fillStyle = lit(liq, 0.35); g.fill();
    for (const [x, y, sz] of [[6.4, 12.6, 0.3], [9.6, 11.4, 0.22], [7.7, 10.4, 0.16], [8.9, 13.3, 0.2]]) {
      g.strokeStyle = rgba(lit(liq, 0.7), 0.8); g.lineWidth = 0.07; g.beginPath(); g.arc(x, y, sz, 0, Math.PI * 2); g.stroke();
      ellipse(g, x - sz * 0.3, y - sz * 0.3, sz * 0.3, sz * 0.2, rgba('#ffffff', 0.8));
    }
    // glass thickness, a lit inner edge, and reflections
    g.strokeStyle = rgba('#10181c', 0.35); g.lineWidth = 0.35; flask(); g.stroke();
    g.save(); g.translate(0.55, 0.5); flask(); g.restore();
    g.strokeStyle = rgba('#ffffff', 0.6); g.lineWidth = 0.4; g.stroke();
    ellipse(g, glint[0], glint[1], 0.5, 0.3, rgba('#ffffff', 0.95), -0.6);
    g.save(); g.translate(-0.45, -0.3); flask(); g.restore();
    g.strokeStyle = rgba('#ffffff', 0.2); g.lineWidth = 0.3; g.stroke();
  });
  // lip, cork and a wax seal
  roundRect(g, cx - neckW, neckY, neckW * 2, 0.8, 0.35, lin(g, cx - neckW, 0, cx + neckW, 0, [[0, '#f4f8f8'], [0.5, '#b8c8c8'], [1, '#6a7a7c']]));
  const ct = neckY - 2.3;
  roundRect(g, cx - 0.95, ct, 1.9, 2.5, 0.35, lin(g, cx - 1, 0, cx + 1, 0, tone('#b88a58', 0.4, 0.5)));
  for (let i = 0; i < 5; i++) ellipse(g, cx - 0.5 + b.rng.next(), ct + 0.4 + b.rng.next() * 1.8, 0.1, 0.1, '#6a4a2a');
  g.beginPath(); g.moveTo(cx - 1.1, ct + 0.4); g.quadraticCurveTo(cx, ct - 0.9, cx + 1.1, ct + 0.4); g.quadraticCurveTo(cx + 1.3, ct + 1.4, cx + 0.7, ct + 1.2); g.quadraticCurveTo(cx, ct + 1.7, cx - 0.9, ct + 1.3); g.closePath();
  g.fillStyle = lin(g, cx - 1, ct - 0.4, cx + 1, ct + 1.4, [[0, '#c8404a'], [1, '#6a1a20']]); g.fill();
  if (kind === 0) {
    // string and a paper tag
    line(g, cx + 1.3, 5.0, cx + 2.8, 6.4, '#d8ccb0', 0.1);
    frame(g, cx + 3.0, 6.3, 0.35, () => {
      roundRect(g, 0, 0, 1.6, 1.1, 0.15, lin(g, 0, 0, 1.6, 1.1, [[0, '#f0e6cc'], [1, '#c8b890']]));
      line(g, 0.3, 0.4, 1.3, 0.4, rgba('#4a3020', 0.6), 0.08);
      line(g, 0.3, 0.7, 1.0, 0.7, rgba('#4a3020', 0.6), 0.08);
    });
  } else {
    tube(g, seg([cx - neckW - 0.05, neckY + 1.2], [cx + neckW + 0.05, neckY + 1.2], 4), 0.16, '#d8ccb0', { hi: 0.4 });
  }
  sparkle(g, b, glint[0], glint[1] - 0.1, 1.0);
}

function bottle(g: G, b: B) {
  const liq = b.c1 ?? '#6a1a2a';
  const glass = mix(liq, '#2a3a2a', 0.35);
  const shape = () => {
    g.beginPath();
    g.moveTo(7.1, 1.9); g.lineTo(7.1, 5.2);
    g.bezierCurveTo(7.0, 6.6, 3.9, 6.8, 3.9, 9.2);
    g.lineTo(3.9, 13.6); g.quadraticCurveTo(3.9, 14.8, 5.2, 14.8); g.lineTo(10.8, 14.8); g.quadraticCurveTo(12.1, 14.8, 12.1, 13.6);
    g.lineTo(12.1, 9.2); g.bezierCurveTo(12.1, 6.8, 9.0, 6.6, 8.9, 5.2); g.lineTo(8.9, 1.9);
    g.closePath();
  };
  fillShape(g, shape, lin(g, 3.9, 0, 12.1, 0, [[0, lit(glass, 0.25)], [0.3, glass], [1, dim(glass, 0.6)]]));
  withClip(g, shape, () => {
    g.fillStyle = rad(g, 9.6, 12.4, 0.3, 8.4, 11, 5.6, [[0, rgba(lit(liq, 0.55), 0.95)], [0.5, rgba(liq, 0.9)], [1, rgba(dim(liq, 0.55), 0.95)]]);
    g.fillRect(0, 7.4, N, 9);
    g.beginPath(); g.ellipse(8, 7.4, 3.9, 0.35, 0, 0, Math.PI * 2); g.fillStyle = rgba(lit(liq, 0.3), 0.8); g.fill();
    // a paper label
    roundRect(g, 5.1, 9.2, 5.8, 3.6, 0.3, lin(g, 5.1, 9.2, 10.9, 12.8, [[0, '#f0e4c4'], [1, '#c4b08a']]));
    line(g, 5.8, 10.4, 10.2, 10.4, rgba('#4a3020', 0.55), 0.12);
    line(g, 5.8, 11.3, 9.4, 11.3, rgba('#4a3020', 0.45), 0.1);
    line(g, 5.8, 12.0, 9.8, 12.0, rgba('#4a3020', 0.45), 0.1);
    g.strokeStyle = rgba('#ffffff', 0.7); g.lineWidth = 0.45;
    g.beginPath(); g.moveTo(4.7, 9.0); g.lineTo(4.7, 13.8); g.stroke();
    g.strokeStyle = rgba('#ffffff', 0.55); g.lineWidth = 0.25;
    g.beginPath(); g.moveTo(7.5, 2.4); g.lineTo(7.5, 5.2); g.quadraticCurveTo(6.8, 6.4, 5.4, 7.2); g.stroke();
    g.strokeStyle = rgba('#ffffff', 0.18); g.lineWidth = 0.3;
    g.beginPath(); g.moveTo(11.3, 9.4); g.lineTo(11.3, 13.8); g.stroke();
  });
  roundRect(g, 6.8, 1.3, 2.4, 1.1, 0.35, lin(g, 6.8, 0, 9.2, 0, tone('#b88a58', 0.4, 0.5)));
  g.beginPath(); g.moveTo(6.7, 1.9); g.quadraticCurveTo(8, 0.5, 9.3, 1.9); g.quadraticCurveTo(9.4, 3.0, 8.6, 2.8); g.quadraticCurveTo(8, 3.4, 6.9, 2.9); g.closePath();
  g.fillStyle = lin(g, 6.7, 1, 9.3, 3, [[0, '#c8404a'], [1, '#6a1a20']]); g.fill();
  line(g, 7.0, 4.2, 9.0, 4.4, '#d8ccb0', 0.18);
  sparkle(g, b, 4.8, 9.2, 0.9, 0.85);
}

function waterskin(g: G, b: B) {
  const leather = b.c1 ?? '#8a5a34';
  // shoulder strap from the neck round to the foot of the bag
  tube(g, spline([[11.2, 4.6], [8.2, 1.3], [3.4, 2.0], [1.7, 6.2], [3.2, 10.8]], 6), 0.3, '#5a3a22', { hi: 0.4 });
  // a teardrop skin bag lying on the diagonal, its neck up at the right
  frame(g, 11.5, 4.3, Math.atan2(7.7, -6.6), () => {
    const bag = () => { g.beginPath(); g.moveTo(0, -1.05); g.bezierCurveTo(2.4, -1.5, 4.4, -4.3, 7.0, -4.2); g.bezierCurveTo(10.8, -4.0, 11.1, 4.0, 7.0, 4.2); g.bezierCurveTo(4.4, 4.3, 2.4, 1.5, 0, 1.05); g.closePath(); };
    const [lx, ly] = L();
    fillShape(g, bag, rad(g, 6.0 + lx * 2.6, ly * 2.6, 0.4, 6.2, 0, 6.4, [[0, lit(leather, 0.5)], [0.35, lit(leather, 0.12)], [0.75, leather], [1, dim(leather, 0.55)]]));
    withClip(g, bag, () => {
      fold(g, [[0.8, -0.6], [2.6, -1.4], [4.0, -2.8]], 0.35, leather, 0.4);
      fold(g, [[0.8, 0.6], [2.6, 1.4], [4.0, 2.8]], 0.35, leather, 0.4);
      fold(g, [[5.4, -1.4], [7.6, 0.2], [9.2, -0.6]], 0.4, leather, 0.25);
      for (let i = 0; i < 46; i++) ellipse(g, b.rng.next() * 11, (b.rng.next() * 2 - 1) * 4.2, 0.12, 0.08, rgba(dim(leather, 0.6), 0.35));
      // stitched seam round the edge
      g.save(); g.translate(5.6, 0); g.scale(0.9, 0.84); g.translate(-5.6, 0); bag(); g.restore();
      g.save(); g.setLineDash([0.34, 0.26]); g.strokeStyle = rgba('#ead9b2', 0.85); g.lineWidth = 0.12; g.stroke(); g.restore();
    });
    // horn spout, cord binding and a wooden stopper
    fillPts(g, [[0.3, -1.05], [0.3, 1.05], [-1.9, 0.6], [-1.9, -0.6]], lightLin(g, -0.8, 0, 0.9, tone('#d8c49a', 0.35, 0.5)));
    tube(g, seg([0, -1.15], [0, 1.15], 4), 0.26, '#c8b48a', { hi: 0.45 });
    roundRect(g, -3.1, -0.58, 1.4, 1.16, 0.3, lightLin(g, -2.4, 0, 0.6, tone(P.wood4, 0.45, 0.5)));
  });
  b.post.push((h) => { ellipse(h, 12.9, 4.2, 0.26, 0.36, rgba('#a8d0f0', 0.85)); ellipse(h, 12.83, 4.1, 0.09, 0.11, '#ffffff'); });
}

function honey(g: G, b: B) {
  const hon = b.c1 ?? '#e09a24';
  const jar = () => { g.beginPath(); g.moveTo(4.6, 5.6); g.bezierCurveTo(2.8, 6.4, 2.6, 8.0, 2.8, 10.4); g.lineTo(2.9, 13.2); g.quadraticCurveTo(3.0, 14.7, 5.0, 14.7); g.lineTo(11.0, 14.7); g.quadraticCurveTo(13.0, 14.7, 13.1, 13.2); g.lineTo(13.2, 10.4); g.bezierCurveTo(13.4, 8.0, 13.2, 6.4, 11.4, 5.6); g.closePath(); };
  fillShape(g, jar, rgba('#e8eee8', 0.5));
  withClip(g, jar, () => {
    // honey right up to the shoulder, glowing where the light comes through
    g.fillStyle = rad(g, 9.6, 11.8, 0.3, 8, 10.4, 7.4, [[0, lit(hon, 0.55)], [0.35, hon], [0.8, dim(hon, 0.4)], [1, dim(hon, 0.6)]]);
    g.fillRect(0, 6.6, N, 10);
    g.beginPath(); g.ellipse(8, 6.6, 4.6, 0.7, 0, 0, Math.PI * 2); g.fillStyle = lit(hon, 0.3); g.fill();
    ellipse(g, 10.2, 12.0, 1.6, 1.1, rgba(lit(hon, 0.7), 0.45));
    // glass: a thick lit edge, a window glint, a faint back reflection
    g.strokeStyle = rgba('#fff8e0', 0.55); g.lineWidth = 0.4; jar(); g.stroke();
    g.strokeStyle = rgba('#ffffff', 0.8); g.lineWidth = 0.42;
    g.beginPath(); g.moveTo(4.1, 7.4); g.quadraticCurveTo(3.6, 10.2, 4.0, 13.2); g.stroke();
    ellipse(g, 4.7, 7.0, 0.35, 0.25, rgba('#ffffff', 0.9));
    g.strokeStyle = rgba('#ffffff', 0.25); g.lineWidth = 0.3;
    g.beginPath(); g.moveTo(12.1, 8.0); g.lineTo(12.2, 13.0); g.stroke();
  });
  // linen cover over the mouth, tied with twine, its hem falling in folds
  const cover = () => { g.beginPath(); g.moveTo(3.8, 6.9); g.quadraticCurveTo(3.0, 4.4, 5.0, 3.6); g.quadraticCurveTo(8, 2.4, 11.0, 3.6); g.quadraticCurveTo(13.0, 4.4, 12.2, 6.9); g.quadraticCurveTo(11.4, 7.9, 10.8, 7.0); g.quadraticCurveTo(9.4, 8.2, 8.2, 7.1); g.quadraticCurveTo(6.8, 8.2, 5.6, 7.1); g.quadraticCurveTo(4.6, 7.9, 3.8, 6.9); g.closePath(); };
  fillShape(g, cover, rad(g, 6.4, 3.6, 0.3, 8, 5.2, 5.2, [[0, '#fbf6ea'], [0.6, '#e2d8c0'], [1, '#b8ac90']]));
  withClip(g, cover, () => {
    fold(g, [[5.6, 7.2], [6.0, 5.8]], 0.3, '#e2d8c0', 0.5);
    fold(g, [[8.2, 7.2], [8.3, 5.9]], 0.3, '#e2d8c0', 0.5);
    fold(g, [[10.8, 7.1], [10.4, 5.8]], 0.3, '#e2d8c0', 0.5);
    for (let i = 0; i < 14; i++) line(g, 3 + i * 0.7, 2.5, 3 + i * 0.7 - 0.4, 8, rgba('#a89a78', 0.12), 0.05);
  });
  tube(g, spline([[3.6, 5.4], [8, 6.1], [12.4, 5.4]], 6), 0.22, '#b89a68', { hi: 0.45 });
  tube(g, spline([[4.6, 5.6], [4.2, 6.6], [4.6, 7.6]], 4), 0.12, '#b89a68', { hi: 0.4 });
  // a drip escaping down the glass
  const drip = () => { g.beginPath(); g.moveTo(10.2, 7.1); g.quadraticCurveTo(10.9, 8.6, 10.6, 9.6); g.quadraticCurveTo(10.2, 10.3, 9.9, 9.6); g.quadraticCurveTo(9.8, 8.4, 9.4, 7.3); g.closePath(); };
  fillShape(g, drip, lin(g, 9.4, 0, 10.9, 0, [[0, lit(hon, 0.45)], [1, dim(hon, 0.2)]]));
  ellipse(g, 10.05, 8.7, 0.1, 0.35, rgba('#fffbe8', 0.9));
  sparkle(g, b, 4.7, 7.0, 0.9, 0.85);
}

// ================================================================ plants

type HerbStyle = 'umbel' | 'daisy' | 'nettle' | 'sage' | 'mint' | 'feathery' | 'bells' | 'berries' | 'cup' | 'star' | 'thistle' | 'dense' | 'root' | 'fern' | 'ragged';
/** Head shapes for the herbs of the item table, keyed by their flower colour. */
const HERB_STYLE: Record<string, HerbStyle> = {
  '#efe8d4': 'umbel', '#f6f2e4': 'daisy', '#5c8f3d': 'nettle', '#a8b89a': 'sage', '#8a70b8': 'bells',
  '#f0d0e0': 'umbel', '#3a2a4a': 'berries', '#d8302a': 'cup', '#f0c020': 'star', '#6ab04a': 'mint',
  '#b070c0': 'thistle', '#f08a20': 'dense', '#e8e8c8': 'root', '#b8c8b0': 'feathery', '#c8d8f0': 'fern', '#4a7ad8': 'ragged',
};
const STEM = '#3d6628', STEM2 = '#56843a', LEAF = '#4f7f34';

function leafShape(g: G, x: number, y: number, ang: number, len: number, wid: number, col: string, o: { serrate?: boolean; vein?: boolean; round?: boolean; veins?: boolean } = {}) {
  frame(g, x, y, ang, () => {
    const shape = () => {
      g.beginPath();
      g.moveTo(0, 0);
      if (o.serrate) {
        // heart-shaped with coarse teeth
        const n = 14;
        for (let s = -1; s <= 1; s += 2) {
          for (let i = 1; i <= n; i++) {
            const t = s < 0 ? i / n : 1 - i / n;
            const w = Math.sin(Math.PI * Math.pow(t, 0.65)) * wid * (i % 2 ? 1.16 : 0.8);
            g.lineTo(len * t, s * w);
          }
        }
      } else {
        const k = o.round ? 0.5 : 0.4;
        g.bezierCurveTo(len * 0.1, -wid * 1.1, len * k + len * 0.2, -wid * 1.05, len, 0);
        g.bezierCurveTo(len * k + len * 0.2, wid * 1.05, len * 0.1, wid * 1.1, 0, 0);
      }
      g.closePath();
    };
    fillShape(g, shape, lightLin(g, len / 2, 0, wid, tone(col, 0.4, 0.45)));
    if (o.vein !== false) line(g, 0.1, 0, len * 0.85, 0, rgba(lit(col, 0.5), 0.65), Math.max(0.05, wid * 0.14));
    if (o.veins) for (let k = 1; k <= 3; k++) {
      const vx = len * (0.18 + k * 0.18);
      for (const s of [-1, 1]) line(g, vx, 0, vx + len * 0.12, s * wid * 0.55, rgba(lit(col, 0.45), 0.45), Math.max(0.04, wid * 0.07));
    }
  });
}

function flowerHead(g: G, b: B, style: HerbStyle, x: number, y: number, s: number, c1: string, c2: string) {
  const rng = b.rng;
  switch (style) {
    case 'umbel': case 'root': {
      for (let k = 0; k < 5; k++) line(g, x, y + 1.2 * s, x + (k - 2) * 0.55 * s, y + 0.1 * s, rgba(STEM2, 0.9), 0.08);
      const pts: Pt[] = [];
      for (let i = 0; i < 30; i++) { const a = rng.next() * Math.PI * 2, r = Math.sqrt(rng.next()); pts.push([x + Math.cos(a) * r * 1.7 * s, y + Math.sin(a) * r * 0.75 * s - (1 - r) * 0.35 * s]); }
      pts.sort((p, q) => p[1] - q[1]);
      for (const [px, py] of pts) {
        const lt = -(px - x) * 0.25 - (py - y) * 0.6;
        orb(g, px, py, 0.33 * s, lt > 0 ? lit(c1, 0.25) : mix(c1, c2, 0.6), { spec: 0, hi: 0.4, lo: 0.4 });
      }
      break;
    }
    case 'daisy': case 'ragged': {
      const n = style === 'daisy' ? 12 : 9, r = 1.45 * s;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.2;
        const px = x + Math.cos(a) * r * 0.62, py = y + Math.sin(a) * r * 0.62 * 0.72;
        const col = Math.sin(a) < -0.2 || Math.cos(a) < -0.3 ? lit(c1, 0.2) : dim(c1, 0.12);
        if (style === 'daisy') ellipse(g, px, py, r * 0.55, r * 0.2, col, Math.atan2(Math.sin(a) * 0.72, Math.cos(a)));
        else {
          frame(g, x, y, Math.atan2(Math.sin(a) * 0.72, Math.cos(a)), () => {
            fillPts(g, [[0.2 * s, -0.12 * s], [r * 1.05, -0.36 * s], [r * 0.95, -0.12 * s], [r * 1.12, 0], [r * 0.95, 0.12 * s], [r * 1.05, 0.36 * s], [0.2 * s, 0.12 * s]], col);
          });
        }
      }
      orb(g, x, y, (style === 'daisy' ? 0.55 : 0.45) * s, style === 'daisy' ? c2 : dim(c2, 0.2), { hi: 0.5, spec: 0.2, ry: (style === 'daisy' ? 0.45 : 0.4) * s });
      break;
    }
    case 'cup': {
      const r = 1.75 * s;
      // back petals, the dark heart, then the front petals and the pod
      for (const a of [-2.35, -0.8]) {
        const px = x + Math.cos(a) * r * 0.5, py = y + Math.sin(a) * r * 0.38;
        ellipse(g, px, py, r * 0.66, r * 0.52, lightLin(g, px, py, r * 0.6, tone(dim(c1, 0.12), 0.35, 0.45)), a);
      }
      ellipse(g, x, y, r * 0.58, r * 0.4, c2);
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; line(g, x + Math.cos(a) * r * 0.18, y + Math.sin(a) * r * 0.12, x + Math.cos(a) * r * 0.46, y + Math.sin(a) * r * 0.3, rgba('#e8d8a0', 0.85), 0.07 * s); }
      for (const a of [2.45, 0.7]) {
        const px = x + Math.cos(a) * r * 0.72, py = y + Math.sin(a) * r * 0.46 + 0.12 * s;
        ellipse(g, px, py, r * 0.62, r * 0.46, lightLin(g, px, py, r * 0.6, tone(c1, 0.45, 0.4)), a);
        ellipse(g, px - 0.15 * s, py - 0.12 * s, r * 0.3, r * 0.1, rgba(lit(c1, 0.6), 0.5), a);
      }
      orb(g, x, y - 0.12 * s, 0.34 * s, '#8a9a70', { spec: 0.3, ry: 0.3 * s });
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; line(g, x, y - 0.2 * s, x + Math.cos(a) * 0.3 * s, y - 0.2 * s + Math.sin(a) * 0.14 * s, '#3a3a2a', 0.05 * s); }
      break;
    }
    case 'star': {
      for (let k = 0; k < 5; k++) {
        const fx = x + (rng.next() - 0.5) * 2.6 * s, fy = y + (rng.next() - 0.5) * 1.4 * s;
        for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + k; ellipse(g, fx + Math.cos(a) * 0.4 * s, fy + Math.sin(a) * 0.4 * s, 0.42 * s, 0.24 * s, i < 3 ? lit(c1, 0.15) : c1, a); }
        for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; line(g, fx, fy, fx + Math.cos(a) * 0.45 * s, fy + Math.sin(a) * 0.45 * s, c2, 0.05); }
        orb(g, fx, fy, 0.16 * s, c2, { spec: 0 });
      }
      break;
    }
    case 'thistle': {
      for (let i = 0; i < 11; i++) blade(g, x + (i - 5) * 0.12 * s, y - 0.3 * s, 1.5 * s, -Math.PI / 2 + (i - 5) * 0.16, 0, 0.3 * s, i % 2 ? c1 : lit(c1, 0.25));
      const bulb = () => { g.beginPath(); g.ellipse(x, y + 0.5 * s, 0.95 * s, 1.05 * s, 0, 0, Math.PI * 2); };
      fillShape(g, bulb, lightLin(g, x, y + 0.5 * s, s, tone('#6a8a4a', 0.35, 0.45)));
      withClip(g, bulb, () => { for (let i = 0; i < 12; i++) blade(g, x + (rng.next() - 0.5) * 1.6 * s, y + 1.4 * s, 1.0 * s, -Math.PI / 2 + (rng.next() - 0.5) * 1.2, 0, 0.22 * s, rgba('#9ab870', 0.8)); });
      break;
    }
    case 'bells': {
      // a curled spray of small drooping bells
      const curl = arcPts(x + 0.9 * s, y + 0.2 * s, 1.1 * s, 0.9 * s, Math.PI * 1.05, Math.PI * 2.15, 10);
      strokePts(g, curl, STEM2, 0.12);
      curl.forEach(([bx, by], i) => {
        if (i % 2 === 1 || i === 0) return;
        frame(g, bx, by + 0.15 * s, 0.35 - i * 0.07, () => {
          const bell = () => { g.beginPath(); g.moveTo(-0.22 * s, -0.1 * s); g.quadraticCurveTo(-0.42 * s, 0.55 * s, -0.36 * s, 0.95 * s); g.quadraticCurveTo(0, 1.1 * s, 0.36 * s, 0.95 * s); g.quadraticCurveTo(0.42 * s, 0.55 * s, 0.22 * s, -0.1 * s); g.closePath(); };
          fillShape(g, bell, lightLin(g, 0, 0.5 * s, 0.4 * s, tone(c1, 0.4, 0.4)));
          g.beginPath(); g.ellipse(0, 0.97 * s, 0.34 * s, 0.12 * s, 0, 0, Math.PI * 2); g.fillStyle = lit(c1, 0.35); g.fill();
          for (let k = 0; k < 4; k++) ellipse(g, (k - 1.5) * 0.12 * s, -0.08 * s, 0.1 * s, 0.2 * s, STEM2, (k - 1.5) * 0.4);
        });
      });
      break;
    }
    case 'berries': {
      const n = 3;
      for (let i = 0; i < n; i++) {
        const a = -0.4 + (i / (n - 1)) * 1.6;
        const bx = x + Math.cos(a) * 1.1 * s, by = y + Math.sin(a) * 0.9 * s + 0.3 * s;
        line(g, x, y, bx, by - 0.45 * s, STEM2, 0.08);
        frame(g, bx, by, 0.25 - i * 0.12, () => {
          const bell = () => { g.beginPath(); g.moveTo(-0.3 * s, -0.55 * s); g.quadraticCurveTo(-0.55 * s, 0.4 * s, -0.42 * s, 0.75 * s); g.quadraticCurveTo(0, 0.95 * s, 0.42 * s, 0.75 * s); g.quadraticCurveTo(0.55 * s, 0.4 * s, 0.3 * s, -0.55 * s); g.closePath(); };
          fillShape(g, bell, lightLin(g, 0, 0, 0.5 * s, tone(c1, 0.35, 0.4)));
          g.beginPath(); g.ellipse(0, 0.78 * s, 0.4 * s, 0.14 * s, 0, 0, Math.PI * 2); g.fillStyle = c2; g.fill();
        });
      }
      {
        for (const [dx, dy] of [[-1.2, 1.5], [0.2, 2.1], [1.4, 1.2], [-0.2, 0.9]] as Pt[]) {
          const bx = x + dx * s, by = y + dy * s;
          for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; ellipse(g, bx + Math.cos(a) * 0.45 * s, by + Math.sin(a) * 0.45 * s, 0.35 * s, 0.14 * s, '#4a6a2c', a); }
          orb(g, bx, by, 0.5 * s, '#1a1218', { hi: 0.35, lo: 0.4, spec: 0.95 });
        }
      }
      break;
    }
    case 'dense': {
      for (const [r, k] of [[1.6, 0], [1.2, 1], [0.8, 2]] as Pt[]) {
        const n = 13 - k * 3;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + k * 0.4;
          const col = k === 2 ? c2 : Math.sin(a) < 0 ? lit(c1, 0.2 - k * 0.1) : dim(c1, 0.15 - k * 0.05);
          ellipse(g, x + Math.cos(a) * r * 0.6 * s, y + Math.sin(a) * r * 0.45 * s, r * 0.42 * s, r * 0.24 * s, col, Math.atan2(Math.sin(a) * 0.75, Math.cos(a)));
        }
      }
      orb(g, x, y, 0.35 * s, dim(c2, 0.2), { spec: 0.2, ry: 0.28 * s });
      break;
    }
    default: {
      orb(g, x, y, 0.8 * s, c1, { spec: 0.3 });
    }
  }
}

/** A posy of picked herbs tied with twine: stems gathered at the lower left, heads fanning up and right. */
function herbBundle(g: G, b: B, style: HerbStyle, c1: string, c2: string) {
  const rng = b.rng;
  const tie: Pt = [5.0, 11.4];
  const leafy = style === 'nettle' || style === 'sage' || style === 'mint' || style === 'feathery';
  const tips: Pt[] = leafy ? [[6.4, 2.0], [10.4, 2.6], [13.4, 6.6]] : style === 'fern' ? [[7.2, 3.4], [12.8, 5.0]] : [[6.8, 3.2], [10.6, 2.8], [13.0, 6.2], [9.4, 6.4]];
  const stems = tips.map((t, i) => spline([[tie[0] - 1.6 - i * 0.2, tie[1] + 2.8 + (i % 2) * 0.3], tie, [(tie[0] + t[0]) / 2 + 0.3, (tie[1] + t[1]) / 2 + 0.3], t], 6));
  const stemCol = style === 'feathery' ? '#7a8a70' : style === 'fern' ? mix(c2, STEM, 0.5) : STEM;
  if (style === 'root') {
    // the root itself: a thick, wrinkled taproot with straggling rootlets
    const rc = mix(c1, '#b08a5a', 0.5);
    for (const [x, y, a, l] of [[3.2, 13.2, 2.3, 2.4], [4.4, 12.2, 2.9, 2.2], [2.6, 14.2, 1.7, 1.6], [5.6, 11.4, 2.5, 2.0], [3.8, 12.9, 1.6, 2.2]]) {
      const rl = spline([[x, y], [x + Math.cos(a) * l * 0.5 + 0.2, y + Math.sin(a) * l * 0.5], [x + Math.cos(a) * l, y + Math.sin(a) * l + 0.3]], 4);
      tube(g, rl, rl.map((_, i) => 0.26 - i * 0.025), dim(rc, 0.1), { hi: 0.4 });
    }
    const rt = spline([[1.8, 15.0], [3.2, 13.2], [5.2, 11.2], [7.0, 10.0]], 6);
    const rw = rt.map((_, i) => 0.55 + Math.sin((i / rt.length) * Math.PI) * 0.55);
    tube(g, rt, rw, rc, { hi: 0.5, lo: 0.5, spec: 0.1 });
    const ns = normalsOf(rt);
    for (let i = 2; i < rt.length - 1; i += 2) {
      const [x, y] = rt[i], [nx, ny] = ns[i];
      strokePts(g, spline([[x + nx * rw[i] * 0.9, y + ny * rw[i] * 0.9], [x + 0.15, y - 0.1], [x - nx * rw[i] * 0.9, y - ny * rw[i] * 0.9]], 3), rgba(dim(rc, 0.55), 0.6), 0.08);
    }
    tubeLines(g, rt, rw, dim(rc, 0.45), rng, 5, 0.4);
  }
  for (const st of stems) strokePts(g, style === 'root' ? st.slice(Math.floor(st.length * 0.35)) : st, stemCol, style === 'fern' ? 0.2 : 0.26);
  stems.forEach((st, i) => {
    const n = st.length;
    if (leafy) {
      const P0 = {
        nettle: { step: 5, len: 2.9, wid: 1.0, spread: 1.2, from: 0.3 },
        mint: { step: 2, len: 1.55, wid: 0.78, spread: 0.75, from: 0.4 },
        sage: { step: 3, len: 2.5, wid: 0.58, spread: 0.72, from: 0.35 },
        feathery: { step: 3, len: 2.0, wid: 0.3, spread: 0.95, from: 0.3 },
      }[style as 'nettle' | 'mint' | 'sage' | 'feathery'];
      for (let k = Math.floor(n * P0.from); k < n - 1; k += P0.step) {
        const [x, y] = st[k], [x2, y2] = st[Math.min(n - 1, k + 1)];
        const ang = Math.atan2(y2 - y, x2 - x);
        const t = k / n, len = P0.len * (1.15 - t * 0.5), wid = P0.wid * (1.15 - t * 0.5);
        for (const sd of [-1, 1]) {
          const la = ang + sd * P0.spread;
          const col = sd < 0 ? lit(c1, 0.08) : style === 'nettle' ? dim(c1, 0.12) : c1;
          if (style === 'feathery') {
            for (let q = 0; q < 4; q++) leafShape(g, x + Math.cos(la) * q * 0.45, y + Math.sin(la) * q * 0.45, la + sd * 0.55 * (q % 2 ? 1 : -1), len * (0.5 - q * 0.06), wid, lit(c1, 0.1 * (1 - q * 0.3)), { vein: false });
          } else leafShape(g, x, y, la, len, wid, col, { serrate: style === 'nettle', round: style === 'mint', veins: style !== 'sage' });
        }
      }
      const [tx, ty] = st[n - 1], [px, py] = st[n - 3];
      const tipLen = style === 'nettle' ? 2.2 : style === 'sage' ? 1.9 : 1.3;
      leafShape(g, tx - (tx - px) * 0.3, ty - (ty - py) * 0.3, Math.atan2(ty - py, tx - px), tipLen, style === 'mint' ? 0.62 : style === 'nettle' ? 0.8 : 0.45, lit(c1, 0.1), { serrate: style === 'nettle', round: style === 'mint' });
    } else if (style === 'fern') {
      for (let k = Math.floor(n * 0.36); k < n; k += 3) {
        const [x, y] = st[k], [x2, y2] = st[Math.min(n - 1, k + 1)];
        const ang = Math.atan2(y2 - y, x2 - x), sz = 1.35 - (k / n) * 0.6;
        for (const sd of [-1, 1]) {
          frame(g, x, y, ang + sd * 1.2, () => {
            const fan = () => { g.beginPath(); g.moveTo(0, 0); g.arc(0.1, 0, sz * 1.05, -1.05, 1.05); g.closePath(); };
            fillShape(g, fan, lightLin(g, sz * 0.5, 0, sz * 0.8, tone(sd < 0 ? lit(c1, 0.12) : c1, 0.35, 0.45)));
            for (let q = -2; q <= 2; q++) line(g, 0.15, 0, Math.cos(q * 0.42) * sz * 0.95, Math.sin(q * 0.42) * sz * 0.95, rgba(dim(c1, 0.3), 0.5), 0.05);
          });
        }
      }
      if (i === 0) {
        // the fertile spike, grape-like
        const [x, y] = st[n - 1];
        for (let k = 0; k < 8; k++) orb(g, x + 0.3 + k * 0.12 + (rng.next() - 0.5) * 1.0, y - 0.3 - k * 0.24, 0.28, mix(c2, '#c8a860', 0.5), { spec: 0.3 });
      }
    } else {
      // a few narrow leaves along the stem
      for (let k = Math.floor(n * 0.45); k < n - 3; k += 4) {
        const [x, y] = st[k], [x2, y2] = st[k + 1];
        const ang = Math.atan2(y2 - y, x2 - x);
        const sd = k % 8 ? 1 : -1;
        leafShape(g, x, y, ang + sd * 0.7, style === 'bells' || style === 'berries' ? 2.0 : 1.6, style === 'bells' || style === 'berries' ? 0.62 : 0.34, style === 'thistle' ? '#6a8a52' : LEAF, { serrate: style === 'thistle' });
      }
    }
  });
  if (!leafy && style !== 'fern') {
    const heads = tips.map((t, i) => ({ t, i })).sort((p, q) => p.t[1] - q.t[1]);
    for (const { t, i } of heads) flowerHead(g, b, style, t[0], t[1], i === 3 ? 0.85 : 1, c1, c2);
  }
  if (style !== 'root') {
    // twine wrapped round the stems
    const tp = seg([tie[0] - 0.9, tie[1] - 0.55], [tie[0] + 0.7, tie[1] + 0.75], 4);
    tube(g, tp, 0.5, '#c8b48a', { hi: 0.45, lo: 0.5 });
    withClip(g, () => tubePath(g, tp, 0.5), () => { for (let k = -2; k <= 2; k++) line(g, tie[0] + k * 0.35 - 0.6, tie[1] - 0.6, tie[0] + k * 0.35 + 0.6, tie[1] + 0.6, rgba('#6a5a3a', 0.8), 0.08); });
    tube(g, spline([[tie[0] + 0.5, tie[1] + 0.4], [tie[0] + 1.3, tie[1] + 1.4], [tie[0] + 1.0, tie[1] + 2.6]], 4), 0.1, '#c8b48a', { hi: 0.4 });
  }
}

function herb(g: G, b: B) {
  const c1 = b.c1 ?? '#f0f0e0', c2 = b.c2 ?? dim(c1, 0.25);
  const style = HERB_STYLE[c1.toLowerCase()] ?? (isGreen(c1) ? 'mint' : 'daisy');
  herbBundle(g, b, style, c1, c2);
}

function flower(g: G, b: B) {
  const c1 = b.c1 ?? '#4a7ad8';
  const tie: Pt = [5.2, 11.6];
  const heads: [Pt, HerbStyle, string, string][] = [[[7.2, 3.0], 'ragged', c1, '#2a2a6a'], [[12.4, 5.2], 'ragged', lit(c1, 0.1), '#2a2a6a'], [[10.0, 3.4], 'cup', '#d8302a', '#2a1a1a'], [[9.6, 7.2], 'ragged', dim(c1, 0.1), '#2a2a6a'], [[5.0, 5.0], 'cup', '#c8281e', '#2a1a1a']];
  for (const [t] of heads) strokePts(g, spline([[tie[0] - 1.6, tie[1] + 2.8], tie, [(tie[0] + t[0]) / 2 + 0.3, (tie[1] + t[1]) / 2 + 0.3], t], 6), STEM, 0.24);
  for (let k = 0; k < 6; k++) blade(g, tie[0] + 0.2, tie[1] - 0.2, 3.5 + b.rng.next() * 3, -0.9 - b.rng.next() * 0.9, (b.rng.next() - 0.5) * 1.5, 0.35, b.rng.next() < 0.5 ? STEM : STEM2);
  for (const [t, st, a, c] of heads.sort((p, q) => p[0][1] - q[0][1])) flowerHead(g, b, st, t[0], t[1], 0.95, a, c);
  const tp = seg([tie[0] - 0.9, tie[1] - 0.55], [tie[0] + 0.7, tie[1] + 0.75], 4);
  tube(g, tp, 0.5, '#c8b48a', { hi: 0.45 });
}

function mushroom(g: G, b: B) {
  const cap = b.c1 ?? '#b85a3a', stem = b.c2 ?? '#efe0c8';
  const one = (x: number, y: number, s: number) => {
    const st = () => { g.beginPath(); g.moveTo(x - 1.1 * s, y - 3.4 * s); g.bezierCurveTo(x - 2.2 * s, y - 1.6 * s, x - 2.0 * s, y, x - 0.6 * s, y + 0.2 * s); g.lineTo(x + 0.8 * s, y + 0.2 * s); g.bezierCurveTo(x + 2.2 * s, y, x + 2.1 * s, y - 1.6 * s, x + 1.1 * s, y - 3.4 * s); g.closePath(); };
    fillShape(g, st, lin(g, x - 2 * s, 0, x + 2 * s, 0, [[0, lit(stem, 0.35)], [0.45, stem], [1, dim(stem, 0.45)]]));
    withClip(g, st, () => { for (let i = 0; i < 8; i++) line(g, x - 1.2 * s + i * 0.35 * s, y - 3 * s, x - 1.4 * s + i * 0.4 * s, y - 0.4 * s, rgba(dim(stem, 0.35), 0.35), 0.07); });
    g.beginPath(); g.ellipse(x, y - 3.5 * s, 2.9 * s, 0.75 * s, 0, 0, Math.PI * 2); g.fillStyle = '#c8b060'; g.fill();
    const cp = () => { g.beginPath(); g.moveTo(x - 3.1 * s, y - 3.4 * s); g.bezierCurveTo(x - 3.4 * s, y - 6.8 * s, x + 3.4 * s, y - 6.8 * s, x + 3.1 * s, y - 3.4 * s); g.quadraticCurveTo(x, y - 2.6 * s, x - 3.1 * s, y - 3.4 * s); g.closePath(); };
    fillShape(g, cp, rad(g, x - 1.2 * s, y - 5.6 * s, 0.2, x, y - 4.4 * s, 3.4 * s, [[0, lit(cap, 0.5)], [0.4, lit(cap, 0.1)], [0.85, cap], [1, dim(cap, 0.45)]]));
    ellipse(g, x - 1.2 * s, y - 5.4 * s, 0.9 * s, 0.35 * s, rgba('#fff6e8', 0.55), -0.35);
  };
  one(9.4, 14.6, 1.38);
  one(4.3, 14.6, 0.9);
  for (let k = 0; k < 5; k++) blade(g, 3 + b.rng.next() * 10, 14.6, 1.4 + b.rng.next() * 1.4, -Math.PI / 2 + (b.rng.next() - 0.5) * 1.2, 0.3, 0.4, b.rng.next() < 0.5 ? STEM : STEM2);
}

function bark(g: G, b: B) {
  const outer = b.c1 ?? '#6e5a46', inner = b.c2 ?? '#c8925e';
  const quill = (x: number, y: number, ang: number, len: number, w: number) => {
    frame(g, x, y, ang, () => {
      const pts = seg([0, 0], [len, 0], 10);
      tube(g, pts, w, outer, { hi: 0.45, lo: 0.55, spec: 0.1 });
      withClip(g, () => tubePath(g, pts, w), () => {
        for (let i = 0; i < 10; i++) { const yy = (b.rng.next() * 2 - 1) * w * 0.9, x0 = b.rng.next() * len * 0.7; line(g, x0, yy, x0 + 1.5 + b.rng.next() * 3, yy + (b.rng.next() - 0.5) * 0.3, rgba(dim(outer, 0.7), 0.7), 0.1); }
        for (let i = 0; i < 12; i++) { const xx = b.rng.next() * len, yy = (b.rng.next() * 2 - 1) * w * 0.8; line(g, xx, yy - 0.12, xx, yy + 0.12, rgba('#c8bca8', 0.55), 0.09); }
        // the seam where the curl overlaps
        line(g, -0.2, w * 0.45, len + 0.2, w * 0.4, rgba('#241a10', 0.7), 0.12);
        line(g, -0.2, w * 0.3, len + 0.2, w * 0.26, rgba(lit(inner, 0.2), 0.8), 0.1);
      });
      // the rolled end: a hollow curl of pale inner bark
      ellipse(g, len, 0, w * 0.45, w, '#2a1a0e');
      g.strokeStyle = lit(inner, 0.2); g.lineWidth = 0.26;
      g.beginPath();
      for (let t = 0.3; t <= Math.PI * 3.2; t += 0.15) { const r = w * 0.86 * (1 - t / (Math.PI * 4.2)); const px = len + Math.cos(t) * r * 0.45, py = Math.sin(t) * r; if (t === 0.3) g.moveTo(px, py); else g.lineTo(px, py); }
      g.stroke();
      g.strokeStyle = rgba(dim(outer, 0.3), 0.9); g.lineWidth = 0.12;
      g.beginPath(); g.ellipse(len, 0, w * 0.45, w, 0, -Math.PI * 0.5, Math.PI * 0.5); g.stroke();
    });
  };
  quill(2.4, 10.0, -0.62, 10.6, 0.95);
  quill(3.3, 12.4, -0.62, 10.8, 1.0);
  quill(4.4, 14.6, -0.62, 10.2, 0.95);
  // twine round the bundle
  const tw = spline([[5.5, 7.8], [6.5, 10.2], [7.4, 12.9]], 5);
  tube(g, tw, 0.24, '#c8b48a', { hi: 0.45 });
  tube(g, spline([[7.2, 12.6], [8.2, 13.8], [7.8, 15.0]], 4), 0.1, '#c8b48a', { hi: 0.4 });
}

// ================================================================ materials

function pelt(g: G, b: B) {
  const fur = b.c1 ?? '#6e6a66';
  const rng = b.rng;
  frame(g, 8, 8.4, -0.3, () => {
    const outline: Pt[] = [
      [0, -6.9], [1.2, -6.2], [1.5, -4.8], [3.4, -4.6], [6.0, -5.6], [5.4, -3.4], [4.4, -1.8], [4.6, 1.8], [5.6, 3.2], [6.4, 5.8], [3.6, 4.4], [1.6, 5.2], [0.6, 7.4],
      [-0.6, 7.4], [-1.6, 5.2], [-3.6, 4.4], [-6.4, 5.8], [-5.6, 3.2], [-4.6, 1.8], [-4.4, -1.8], [-5.4, -3.4], [-6.0, -5.6], [-3.4, -4.6], [-1.5, -4.8], [-1.2, -6.2],
    ];
    const shape = () => smooth(g, outline);
    // flesh side peeking at the edges
    g.save(); g.translate(0.35, 0.45); fillShape(g, shape, '#c8a88a'); g.restore();
    fillShape(g, shape, rad(g, -2, -2.5, 0.5, 0, 0, 8.4, [[0, lit(fur, 0.35)], [0.55, fur], [1, dim(fur, 0.45)]]));
    withClip(g, shape, () => {
      // darker saddle down the spine
      g.fillStyle = lin(g, -3, 0, 3, 0, [[0, rgba(dim(fur, 0.5), 0)], [0.5, rgba(dim(fur, 0.55), 0.55)], [1, rgba(dim(fur, 0.5), 0)]]);
      g.fillRect(-4, -8, 8, 16);
      const strokes: [number, number, number, number][] = [];
      for (let i = 0; i < 520; i++) {
        const x = (rng.next() * 2 - 1) * 6.6, y = -7 + rng.next() * 14.6;
        const ang = Math.atan2(3 + y * 0.2, x === 0 ? 0.01 : x * 1.4) ;
        const lum = -x * 0.08 - y * 0.08 + (rng.next() - 0.5) * 0.9;
        strokes.push([x, y, ang, lum]);
      }
      strokes.sort((p, q) => p[3] - q[3]);
      for (const [x, y, ang, lum] of strokes) blade(g, x, y, 0.9 + rng.next() * 0.7, ang, (rng.next() - 0.5) * 0.4, 0.26, lum > 0.2 ? lit(fur, 0.35) : lum < -0.35 ? dim(fur, 0.4) : fur);
    });
    // tufts breaking the outline
    for (let i = 0; i < outline.length; i++) {
      const [x, y] = outline[i];
      blade(g, x * 0.93, y * 0.93, 0.9, Math.atan2(y, x) + (rng.next() - 0.5) * 0.6, 0.2, 0.3, x + y < 0 ? lit(fur, 0.2) : dim(fur, 0.2));
    }
  });
}

function bone(g: G, b: B) {
  const ivory = '#e8dcbe';
  frame(g, 3.1, 12.9, -Math.PI / 4, () => {
    const len = 13.6;
    for (const x of [0, len]) for (const s of [-1, 1]) orb(g, x + (x ? -0.9 : 0.9), s * 0.82, 1.08, s > 0 ? dim(ivory, 0.08) : ivory, { hi: 0.4, lo: 0.5, spec: 0.3 });
    const sp = spline([[0.9, 0], [len * 0.5, 0.1], [len - 0.9, 0]], 6);
    tube(g, sp, sp.map(([x]) => 0.66 - Math.sin((x / len) * Math.PI) * 0.12), ivory, { hi: 0.4, lo: 0.5, spec: 0.25 });
    tubeLines(g, sp, 0.6, dim(ivory, 0.4), b.rng, 5, 0.35);
    for (let i = 0; i < 12; i++) ellipse(g, 1 + b.rng.next() * (len - 2), (b.rng.next() - 0.5) * 1.2, 0.12, 0.08, rgba('#8a7a5a', 0.4));
  });
}

function antlers(g: G, b: B) {
  const base = '#6a5038', tipc = '#efe6d2';
  const beam = (s: number) => {
    const X = (x: number) => 8 + s * x;
    const main = spline([[X(0.9), 13.2], [X(2.2), 10.8], [X(4.4), 8.2], [X(5.6), 5.0], [X(5.0), 1.8]], 6);
    const n = main.length;
    const W = main.map((_, i) => 0.62 - (i / n) * 0.4);
    const col = s < 0 ? lit(base, 0.1) : base;
    const tines: Pt[][] = [
      spline([main[Math.floor(n * 0.22)], [X(1.8), 9.2], [X(1.2), 7.4]], 4),
      spline([main[Math.floor(n * 0.5)], [X(3.4), 5.6], [X(2.8), 3.6]], 4),
      spline([main[Math.floor(n * 0.72)], [X(6.8), 4.0], [X(7.2), 2.4]], 4),
    ];
    for (const t of tines) {
      const tw = t.map((_, i) => 0.36 - (i / t.length) * 0.26);
      tube(g, t, tw, col, { hi: 0.45, lo: 0.5 });
      tube(g, t.slice(Math.floor(t.length * 0.55)), tw.slice(Math.floor(t.length * 0.55)), tipc, { hi: 0.35, lo: 0.4 });
    }
    tube(g, main, W, col, { hi: 0.45, lo: 0.5, spec: 0.15 });
    tube(g, main.slice(Math.floor(n * 0.82)), W.slice(Math.floor(n * 0.82)), tipc, { hi: 0.35, lo: 0.4 });
    tubeLines(g, main.slice(0, Math.floor(n * 0.8)), W.slice(0, Math.floor(n * 0.8)), dim(base, 0.6), b.rng, 5, 0.5);
    // the burr at the base
    for (let k = 0; k < 7; k++) orb(g, X(0.9) + (k - 3) * 0.2 * s, 13.2 + Math.sin(k) * 0.2, 0.3, '#8a7050', { spec: 0.15 });
  };
  beam(1);
  beam(-1);
  const skull = () => { g.beginPath(); g.moveTo(6.2, 13.0); g.quadraticCurveTo(8, 12.0, 9.8, 13.0); g.quadraticCurveTo(10.2, 14.8, 8, 15.0); g.quadraticCurveTo(5.8, 14.8, 6.2, 13.0); g.closePath(); };
  fillShape(g, skull, lightLin(g, 8, 13.6, 1.6, tone('#e0d4b8', 0.4, 0.45)));
}

function ingot(g: G, b: B) {
  const col = b.c1 ?? P.metal3;
  const smooth2 = luma(col) > 0.6;
  const cam: Cam = { x: 8, y: 9.0, s: 1.34, yaw: -0.42, pitch: 0.62 };
  const X0 = 5.0, Z0 = 1.8, X1 = 4.1, Z1 = 1.15, H = 2.1;
  const v = (x: number, y: number, z: number): V3 => [x, y, z];
  const faces: { vs: V3[]; top?: boolean }[] = [
    { vs: [v(-X1, H, Z1), v(X1, H, Z1), v(X1, H, -Z1), v(-X1, H, -Z1)], top: true },
    { vs: [v(-X0, 0, Z0), v(X0, 0, Z0), v(X1, H, Z1), v(-X1, H, Z1)] },
    { vs: [v(X0, 0, Z0), v(X0, 0, -Z0), v(X1, H, -Z1), v(X1, H, Z1)] },
    { vs: [v(-X0, 0, -Z0), v(-X0, 0, Z0), v(-X1, H, Z1), v(-X1, H, -Z1)] },
    { vs: [v(X0, 0, -Z0), v(-X0, 0, -Z0), v(-X1, H, -Z1), v(X1, H, -Z1)] },
  ];
  for (const f of faces) {
    const info = faceInfo(cam, f.vs);
    if (info.facing <= 0.01) continue;
    const pts = f.vs.map((p) => pr(cam, p));
    const c = faceTone(col, info.lum, 0.55, 0.6);
    fillPts(g, pts, lin(g, pts[0][0], pts[0][1], pts[2][0], pts[2][1], [[0, lit(c, 0.12)], [1, dim(c, 0.12)]]));
    withClip(g, () => trace(g, pts), () => {
      const rng = b.rng;
      for (let i = 0; i < (smooth2 ? 6 : 22); i++) {
        const t = rng.next(), u = rng.next();
        const x = pts[0][0] + (pts[1][0] - pts[0][0]) * t + (pts[3][0] - pts[0][0]) * u;
        const y = pts[0][1] + (pts[1][1] - pts[0][1]) * t + (pts[3][1] - pts[0][1]) * u;
        ellipse(g, x, y, 0.35 + rng.next() * 0.3, 0.2, rgba(dim(c, 0.4), smooth2 ? 0.2 : 0.4), -0.3);
        ellipse(g, x - 0.1, y - 0.12, 0.3, 0.08, rgba(lit(c, 0.5), smooth2 ? 0.25 : 0.35), -0.3);
      }
      if (f.top) {
        const a = pts[0], c2 = pts[2];
        g.fillStyle = lin(g, a[0], a[1], c2[0], c2[1], [[0, rgba('#ffffff', 0)], [0.35, rgba('#ffffff', smooth2 ? 0.55 : 0.3)], [0.45, rgba('#ffffff', 0)]]);
        g.fillRect(0, 0, N, N);
      }
    });
    strokePts(g, [pts[3], pts[0], pts[1]], rgba(lit(c, 0.6), 0.6), 0.08);
  }
  sparkle(g, b, pr(cam, [-2.6, H, 0.4])[0], pr(cam, [-2.6, H, 0.4])[1], 0.9, smooth2 ? 0.95 : 0.6);
}

function charcoal(g: G, b: B) {
  const rng = b.rng;
  const lumps: [number, number, number][] = [[4.2, 12.2, 2.4], [8.4, 12.8, 2.6], [12.2, 12.0, 2.2], [6.2, 9.4, 2.3], [10.4, 9.2, 2.2], [8.2, 6.6, 2.1]];
  for (const [x, y, r] of lumps) {
    const n = 7, pts: Pt[] = [];
    const off = rng.next() * 6;
    for (let i = 0; i < n; i++) { const a = off + (i / n) * Math.PI * 2, k = 0.75 + rng.next() * 0.35; pts.push([x + Math.cos(a) * r * k * 1.15, y + Math.sin(a) * r * k * 0.8]); }
    fillPts(g, pts, lin(g, x - r, y - r, x + r, y + r, [[0, '#4a4a52'], [0.5, '#2a2828'], [1, '#141212']]));
    withClip(g, () => trace(g, pts), () => {
      // facets catching a bluish sheen
      fillPts(g, [[x - r, y - r], [x + r * 0.3, y - r * 1.1], [x + r * 0.1, y - 0.1], [x - r * 1.1, y + 0.2]], rgba('#7a7e8a', 0.45));
      for (let k = 0; k < 4; k++) {
        const yy = y - r * 0.5 + k * r * 0.35;
        line(g, x - r, yy, x + r, yy + (rng.next() - 0.5) * 0.6, rgba('#0a0808', 0.7), 0.1);
        line(g, x - r, yy - 0.12, x + r, yy - 0.12 + (rng.next() - 0.5) * 0.6, rgba('#8a8e98', 0.25), 0.06);
      }
    });
    strokePts(g, [pts[3], pts[4], pts[5]], rgba('#a8acb8', 0.5), 0.1);
  }
  sparkle(g, b, 7.4, 5.6, 0.6, 0.6);
}

function ore(g: G, b: B) {
  const vein = b.c1 ?? P.metal4, rock = '#6e6a62';
  const rng = b.rng;
  const outline: Pt[] = [[2.0, 10.6], [3.2, 6.4], [6.4, 4.0], [10.6, 4.2], [13.6, 7.0], [14.2, 10.8], [11.6, 13.8], [5.6, 14.2]];
  fillPts(g, outline, lin(g, 3, 5, 13, 14, [[0, lit(rock, 0.3)], [0.5, rock], [1, dim(rock, 0.5)]]));
  withClip(g, () => trace(g, outline), () => {
    fillPts(g, [[3.2, 6.4], [6.4, 4.0], [10.6, 4.2], [9.6, 7.6], [4.8, 8.6]], lin(g, 4, 4, 9, 8, [[0, lit(rock, 0.45)], [1, lit(rock, 0.15)]]));
    fillPts(g, [[10.6, 4.2], [13.6, 7.0], [14.2, 10.8], [11.2, 10.4], [9.6, 7.6]], dim(rock, 0.25));
    fillPts(g, [[2.0, 10.6], [4.8, 8.6], [9.6, 7.6], [11.2, 10.4], [11.6, 13.8], [5.6, 14.2]], rgba(dim(rock, 0.1), 0.6));
    for (let i = 0; i < 60; i++) ellipse(g, 2 + rng.next() * 12, 4 + rng.next() * 10, 0.2, 0.14, rgba(rng.next() < 0.5 ? '#2a2622' : '#b8b0a0', 0.35));
    // veins
    for (const v of [[[3.4, 11.4], [6.2, 9.6], [8.4, 10.4], [11.6, 8.2]], [[6.6, 5.2], [7.6, 7.2], [7.0, 9.4]], [[10.2, 12.8], [11.4, 10.8], [13.2, 10.2]]] as Pt[][]) {
      const sp = spline(v, 5);
      strokePts(g, sp, dim(vein, 0.35), 0.6);
      strokePts(g, sp, vein, 0.36);
      strokePts(g, sp.map(([x, y]) => [x - 0.08, y - 0.1] as Pt), rgba('#ffffff', 0.7), 0.1);
    }
  });
  for (const [x, y, s] of [[8.4, 10.4, 1.0], [6.4, 9.7, 0.6], [11.4, 8.3, 0.7]]) sparkle(g, b, x, y, s, 0.9);
}

function clothBolt(g: G, b: B) {
  const col = b.c1 ?? CLOTH.linen;
  // three folded layers seen from the front edge, one soft top
  for (let i = 2; i >= 0; i--) {
    const y = 8.4 + i * 1.5;
    const layerShape = () => { g.beginPath(); g.moveTo(2.2, y); g.quadraticCurveTo(8, y - 0.4, 13.8, y - 1.2); g.quadraticCurveTo(14.7, y + 0.2, 13.8, y + 1.4); g.quadraticCurveTo(8, y + 2.2, 2.2, y + 2.2); g.quadraticCurveTo(1.3, y + 1.1, 2.2, y); g.closePath(); };
    fillShape(g, layerShape, lin(g, 0, y, 0, y + 2.2, [[0, lit(col, 0.25)], [0.45, dim(col, 0.05)], [1, dim(col, 0.45)]]));
    g.strokeStyle = rgba(lit(col, 0.6), 0.7); g.lineWidth = 0.12;
    g.beginPath(); g.moveTo(2.2, y + 0.25); g.quadraticCurveTo(8, y - 0.1, 13.8, y - 0.9); g.stroke();
  }
  const top = () => { g.beginPath(); g.moveTo(2.2, 8.4); g.quadraticCurveTo(4.6, 5.8, 6.2, 4.4); g.quadraticCurveTo(10.4, 3.4, 13.6, 3.2); g.quadraticCurveTo(14.4, 5.2, 13.8, 7.2); g.quadraticCurveTo(8, 8.0, 2.2, 8.4); g.closePath(); };
  fillShape(g, top, lin(g, 3, 3.5, 13, 8, [[0, lit(col, 0.45)], [1, dim(col, 0.08)]]));
  withClip(g, top, () => {
    fold(g, [[5.0, 7.4], [7.4, 5.6], [9.6, 4.4]], 0.45, col, 0.3);
    fold(g, [[9.2, 7.2], [11.4, 5.4], [12.8, 4.0]], 0.4, col, 0.25);
    for (let i = 0; i < 30; i++) { const x = 3 + b.rng.next() * 10; line(g, x, 4, x - 1.4, 8.2, rgba(dim(col, 0.25), 0.12), 0.05); }
  });
  // twine
  for (const x of [5.4, 10.4]) {
    const tw = spline([[x - 0.4, 4.2 + (x - 5) * 0.08], [x, 8.3 - (x - 5) * 0.06], [x + 0.1, 12.6 - (x - 5) * 0.1]], 5);
    tube(g, tw, 0.16, '#b89a68', { hi: 0.45 });
  }
}

function feather(g: G, b: B) {
  frame(g, 2.6, 14.0, -0.86, () => {
    const len = 16.0;
    const rach = spline([[0, 0], [len * 0.5, -0.5], [len, 0.2]], 8);
    const vane = (sgn: number) => {
      const w = sgn < 0 ? 2.0 : 1.35;
      const sh = () => { g.beginPath(); g.moveTo(3.0, 0); g.quadraticCurveTo(4.0, sgn * w * 1.05, 8.0, sgn * w - 0.5 * (sgn < 0 ? 1 : 0.3)); g.quadraticCurveTo(13.5, sgn * w * 0.7, len + 0.3, 0.2); g.quadraticCurveTo(10, sgn * 0.1 - 0.4, 3.0, 0); g.closePath(); };
      fillShape(g, sh, lin(g, 0, 0, 0, sgn * w, sgn < 0 ? [[0, '#f8f4ea'], [0.7, '#e8e2d4'], [1, '#d0c8b8']] : [[0, '#d8d0c0'], [1, '#a8a090']]));
      withClip(g, sh, () => {
        for (let x = 3.2; x < len; x += 0.28) line(g, x, -0.2, x + 1.4, sgn * w * 1.2, rgba(sgn < 0 ? '#b8b0a0' : '#8a8274', 0.45), 0.05);
        // dark tip barring, and a split in the vane
        g.fillStyle = lin(g, 9, 0, len, 0, [[0, 'rgba(90,86,80,0)'], [0.6, 'rgba(90,86,80,0.45)'], [1, 'rgba(60,58,54,0.7)']]);
        g.fillRect(8, -3, 9, 6);
      });
    };
    vane(1);
    vane(-1);
    line(g, 7.6, -0.3, 8.6, -2.0, rgba('#8a8274', 0.8), 0.12);
    line(g, 11.2, 0.1, 11.9, 1.2, rgba('#6a6258', 0.8), 0.1);
    // downy barbs near the base
    for (let k = 0; k < 8; k++) blade(g, 2.6 + k * 0.2, 0, 1.2, (k % 2 ? 1 : -1) * (1.1 + b.rng.next() * 0.5), 0.3, 0.2, 'rgba(240,236,226,0.8)');
    tube(g, rach, rach.map(([x]) => 0.18 - (x / len) * 0.12), '#efe6d0', { hi: 0.4, spec: 0.4 });
    tube(g, rach.slice(0, 7), 0.2, '#e8dcc0', { hi: 0.5, spec: 0.5 });
  });
}

// ================================================================ tools and trinkets

function bandage(g: G, b: B) {
  const lin1 = '#ece4cc';
  // trailing end
  const tr = spline([[9.0, 10.8], [11.0, 12.4], [13.2, 11.6], [14.4, 13.8]], 8);
  const trW = tr.map(() => 1.0);
  tube(g, tr, trW, lin1, { hi: 0.3, lo: 0.4 });
  withClip(g, () => tubePath(g, tr, trW), () => { for (let i = 0; i < 40; i++) { const [x, y] = tr[Math.floor(b.rng.next() * tr.length)]; line(g, x - 0.6, y - 0.6, x + 0.6, y + 0.6, rgba('#b8ae94', 0.25), 0.05); } });
  for (let k = 0; k < 5; k++) blade(g, 14.4, 13.8, 0.6, 0.6 + k * 0.25, 0.1, 0.12, '#d8d0b8');
  // the roll: a drum lying on its side
  const cx = 7.0, cy = 8.4;
  const drum = () => { g.beginPath(); g.moveTo(cx - 1.8, cy - 4.3); g.lineTo(cx + 2.6, cy - 4.0); g.bezierCurveTo(cx + 4.6, cy - 3.8, cx + 4.6, cy + 3.6, cx + 2.6, cy + 3.9); g.lineTo(cx - 1.8, cy + 4.2); g.closePath(); };
  fillShape(g, drum, lin(g, 0, cy - 4.3, 0, cy + 4.2, [[0, lit(lin1, 0.4)], [0.4, lin1], [1, dim(lin1, 0.4)]]));
  withClip(g, drum, () => { for (let i = 0; i < 12; i++) line(g, cx - 2, cy - 3.6 + i * 0.65, cx + 4.4, cy - 3.4 + i * 0.65, rgba('#b8ae94', 0.35), 0.06); });
  const end = () => { g.beginPath(); g.ellipse(cx - 1.8, cy, 2.1, 4.25, 0, 0, Math.PI * 2); };
  fillShape(g, end, rad(g, cx - 2.4, cy - 1.4, 0.2, cx - 1.8, cy, 4.2, [[0, lit(lin1, 0.4)], [1, dim(lin1, 0.2)]]));
  for (let k = 1; k <= 5; k++) { g.beginPath(); g.ellipse(cx - 1.8, cy, 2.1 * (1 - k * 0.15), 4.25 * (1 - k * 0.15), 0, 0, Math.PI * 2); g.strokeStyle = rgba('#a89e84', 0.6); g.lineWidth = 0.08; g.stroke(); }
  g.beginPath(); g.ellipse(cx - 1.8, cy, 0.5, 1.0, 0, 0, Math.PI * 2); g.fillStyle = '#6a604c'; g.fill();
}

function lockpick(g: G, b: B) {
  const steel = '#a8b0ba';
  // tension wrench
  frame(g, 3.6, 13.0, -0.62, () => {
    tube(g, seg([0, 0], [9.6, 0], 10), 0.17, dim(steel, 0.1), { hi: 0.6, spec: 0.5 });
    tube(g, seg([9.6, 0], [9.6, -1.6], 3), 0.17, dim(steel, 0.1), { hi: 0.6, spec: 0.5 });
  });
  // hook pick with a wrapped grip
  frame(g, 2.4, 13.8, -Math.PI / 4, () => {
    const sp = seg([3.6, 0], [15.0, 0], 12);
    tube(g, sp, 0.16, steel, { hi: 0.65, spec: 0.6 });
    tube(g, spline([[15.0, 0], [15.6, -0.2], [15.8, -0.9]], 4), 0.16, steel, { hi: 0.65, spec: 0.6 });
    const gp = seg([0.2, 0], [4.2, 0], 6);
    tube(g, gp, 0.5, '#5a3a24', { hi: 0.45 });
    withClip(g, () => tubePath(g, gp, 0.5), () => { for (let x = 0; x < 4.6; x += 0.3) line(g, x, -0.6, x + 0.25, 0.6, rgba('#1e120a', 0.7), 0.08); });
    tube(g, arcPts(-0.6, 0, 0.8, 0.8, 0, Math.PI * 2, 16), 0.12, steel, { hi: 0.6, spec: 0.4 });
  });
  sparkle(g, b, 11.4, 4.2, 0.9);
}

function torch(g: G, b: B) {
  const wood = P.wood3;
  frame(g, 3.5, 15.0, -1.0, () => {
    const sp = seg([0, 0], [10.6, 0], 10);
    tube(g, sp, sp.map(([x]) => 0.42 + x * 0.012), wood, { hi: 0.45, lo: 0.5 });
    tubeLines(g, sp, 0.45, dim(wood, 0.55), b.rng, 5, 0.4);
    // pitch-soaked rags
    const rp = seg([7.6, 0], [11.4, 0], 6);
    tube(g, rp, rp.map(([x]) => 0.95 + Math.sin((x - 7.6) * 0.8) * 0.12), '#3a2c22', { hi: 0.4, lo: 0.5, spec: 0.2 });
    withClip(g, () => tubePath(g, rp, 1.1), () => {
      for (let x = 7.4; x < 11.6; x += 0.7) line(g, x, -1.2, x + 0.8, 1.2, rgba('#6a5440', 0.7), 0.18);
      for (let k = 0; k < 6; k++) ellipse(g, 8 + b.rng.next() * 3, (b.rng.next() - 0.5) * 1.6, 0.3, 0.15, rgba('#e06a2a', 0.5));
    });
  });
  b.post.push((h) => flame(h, 10.2, 5.4, 5.4, 1.5, 0.9));
}

function lantern(g: G, b: B) {
  const iron = '#3a3a40';
  // ring handle
  tube(g, arcPts(8, 2.3, 1.3, 1.3, Math.PI * 0.9, Math.PI * 2.1, 14), 0.2, iron, { hi: 0.6, spec: 0.4 });
  // roof
  fillPts(g, [[4.4, 5.6], [8, 2.9], [11.6, 5.6], [8, 6.4]], lightLin(g, 8, 4.6, 2.6, tone(iron, 0.55, 0.45)));
  fillPts(g, [[8, 2.9], [11.6, 5.6], [8, 6.4]], rgba('#000000', 0.25));
  for (const [x, y] of [[6.6, 4.8], [7.4, 4.3], [9.2, 4.6], [9.9, 5.1]]) ellipse(g, x, y, 0.16, 0.1, '#ffb040');
  // panes, glowing
  const body = () => { g.beginPath(); g.moveTo(4.6, 6.0); g.lineTo(8, 6.8); g.lineTo(11.4, 6.0); g.lineTo(11.4, 12.6); g.lineTo(8, 13.4); g.lineTo(4.6, 12.6); g.closePath(); };
  fillShape(g, body, rad(g, 8, 9.8, 0.2, 8, 9.6, 5.0, [[0, '#fff4c0'], [0.25, '#ffcf5a'], [0.6, '#e8902a'], [1, '#8a4a18']]));
  withClip(g, body, () => {
    g.fillStyle = rgba('#000000', 0.18); g.fillRect(8, 5, 4, 9);
    // candle and flame inside
    roundRect(g, 7.4, 10.2, 1.2, 2.6, 0.2, lin(g, 7.4, 0, 8.6, 0, [[0, '#fff6e0'], [1, '#c8b890']]));
    ellipse(g, 8, 9.2, 0.45, 0.95, '#fffbe0');
    for (let k = 0; k < 20; k++) ellipse(g, 4.6 + b.rng.next() * 6.8, 6.4 + b.rng.next() * 6.4, 0.5, 0.25, rgba('#8a5a20', 0.18), b.rng.next() * 3);
  });
  // frame posts and bands
  for (const [x0, y0, x1, y1] of [[4.6, 6.0, 4.6, 12.6], [8, 6.8, 8, 13.4], [11.4, 6.0, 11.4, 12.6]]) line(g, x0, y0, x1, y1, iron, 0.45);
  line(g, 4.45, 6.0, 4.45, 12.6, rgba(lit(iron, 0.8), 0.8), 0.1);
  for (const y of [6.0, 12.6]) { strokePts(g, [[4.4, y], [8, y + 0.85], [11.6, y]], iron, 0.5); strokePts(g, [[4.4, y - 0.15], [8, y + 0.7]], rgba(lit(iron, 0.7), 0.8), 0.1); }
  fillPts(g, [[4.2, 12.8], [8, 13.7], [11.8, 12.8], [11.8, 13.6], [8, 14.6], [4.2, 13.6]], lightLin(g, 8, 13.6, 1, tone(iron, 0.5, 0.5)));
  b.post.push((h) => {
    h.save(); h.globalCompositeOperation = 'destination-over';
    ellipse(h, 8, 9.6, 7.2, 7.2, rad(h, 8, 9.6, 0, 8, 9.6, 7.2, [[0, 'rgba(255,190,90,0.5)'], [0.5, 'rgba(255,160,60,0.16)'], [1, 'rgba(255,140,40,0)']]));
    h.restore();
  });
}

function dice(g: G, b: B) {
  const one = !!b.c1;
  const col = b.c1 ?? '#e8dcc0';
  const gold = one && hue(col) > 35 && hue(col) < 60 && luma(col) > 0.6;
  const die = (cam: Cam, faces: Record<string, number>) => {
    const s = 1;
    for (const f of boxFaces(cam, -s, s, -s, s, -s, s)) {
      const pts = f.vs.map((p) => pr(cam, p));
      const c = faceTone(col, f.lum, 0.5, 0.55);
      g.lineJoin = 'round';
      trace(g, pts); g.fillStyle = lin(g, pts[0][0], pts[0][1], pts[2][0], pts[2][1], [[0, lit(c, 0.1)], [1, dim(c, 0.12)]]); g.fill();
      g.strokeStyle = c; g.lineWidth = 0.5; g.stroke();
      const n = faces[f.k] ?? 1;
      const o = f.vs[0], u = sub3(f.vs[1], f.vs[0]), v = sub3(f.vs[3], f.vs[0]);
      onFace(g, cam, o, u, v, () => {
        const P6: Record<number, Pt[]> = { 1: [[0.5, 0.5]], 2: [[0.27, 0.27], [0.73, 0.73]], 3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]], 4: [[0.27, 0.27], [0.73, 0.27], [0.27, 0.73], [0.73, 0.73]], 5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]], 6: [[0.27, 0.22], [0.73, 0.22], [0.27, 0.5], [0.73, 0.5], [0.27, 0.78], [0.73, 0.78]] };
        for (const [px, py] of P6[n] ?? P6[1]) {
          g.beginPath(); g.arc(px, py, n === 1 ? 0.13 : 0.1, 0, Math.PI * 2); g.fillStyle = gold ? '#5a3a0a' : '#2a1a12'; g.fill();
        }
      });
    }
    // bevelled highlight on the lit top edge
    const e0 = pr(cam, [-s, s, s]), e1 = pr(cam, [s, s, s]);
    line(g, e0[0], e0[1], e1[0], e1[1], rgba('#fffbef', 0.65), 0.12);
  };
  if (one) {
    die({ x: 8, y: 8.6, s: 3.5, yaw: 0.62, pitch: 0.5 }, { top: 1, front: 2, left: 3, right: 5 });
    if (gold) sparkle(g, b, 5.6, 5.4, 1.2);
  } else {
    die({ x: 10.8, y: 6.6, s: 2.35, yaw: -0.5, pitch: 0.55 }, { top: 6, front: 4, right: 5, left: 3 });
    die({ x: 5.8, y: 10.2, s: 2.75, yaw: 0.7, pitch: 0.45 }, { top: 1, front: 2, left: 3, right: 5 });
  }
}

function ring(g: G, b: B) {
  const metal = b.c1 ?? P.metal4;
  const gem = b.c2;
  const cx = 8, cy = 10.0;
  const band = () => { g.beginPath(); g.ellipse(cx, cy, 5.9, 4.5, 0, 0, Math.PI * 2); g.ellipse(cx, cy - 0.4, 4.3, 2.9, 0, 0, Math.PI * 2, true); };
  fillShape(g, band, lin(g, 3, 6, 13, 13.6, [[0, lit(metal, 0.7)], [0.35, lit(metal, 0.15)], [0.65, dim(metal, 0.25)], [1, dim(metal, 0.55)]]));
  withClip(g, band, () => {
    // the inside of the far side, in shade
    g.beginPath(); g.ellipse(cx, cy - 0.4, 4.9, 3.4, 0, Math.PI, 0); g.lineTo(cx + 6, cy - 6); g.lineTo(cx - 6, cy - 6); g.closePath();
    g.fillStyle = lin(g, 0, cy - 4.6, 0, cy - 0.5, [[0, dim(metal, 0.35)], [1, dim(metal, 0.6)]]); g.fill();
    g.strokeStyle = rgba('#ffffff', 0.85); g.lineWidth = 0.34;
    g.beginPath(); g.ellipse(cx, cy, 5.4, 4.0, 0, Math.PI * 0.62, Math.PI * 0.9); g.stroke();
    g.beginPath(); g.ellipse(cx, cy, 5.4, 4.0, 0, Math.PI * 1.1, Math.PI * 1.3); g.stroke();
    g.strokeStyle = rgba(dim(metal, 0.5), 0.5); g.lineWidth = 0.1;
    g.beginPath(); g.ellipse(cx, cy, 5.1, 3.7, 0, 0, Math.PI * 2); g.stroke();
  });
  if (gem) {
    // claw setting and a faceted stone
    const gx = cx, gy = 5.3;
    fillPts(g, [[gx - 1.9, gy + 1.4], [gx + 1.9, gy + 1.4], [gx + 1.2, gy + 2.6], [gx - 1.2, gy + 2.6]], lightLin(g, gx, gy + 2, 1.5, tone(metal, 0.5, 0.5)));
    const stone = () => { g.beginPath(); g.ellipse(gx, gy, 1.9, 1.6, 0, 0, Math.PI * 2); };
    fillShape(g, stone, rad(g, gx + 0.5, gy + 0.6, 0.1, gx, gy, 2.0, [[0, lit(gem, 0.5)], [0.5, gem], [1, dim(gem, 0.55)]]));
    withClip(g, stone, () => {
      fillPts(g, [[gx - 0.9, gy - 0.7], [gx + 0.9, gy - 0.7], [gx + 1.2, gy + 0.3], [gx, gy + 1.0], [gx - 1.2, gy + 0.3]], rgba(lit(gem, 0.3), 0.55));
      fillPts(g, [[gx - 0.9, gy - 0.7], [gx, gy - 1.7], [gx + 0.9, gy - 0.7]], rgba('#ffffff', 0.35));
      line(g, gx - 1.9, gy, gx - 0.9, gy - 0.7, rgba(dim(gem, 0.4), 0.8), 0.07);
      line(g, gx + 1.9, gy, gx + 0.9, gy - 0.7, rgba(dim(gem, 0.4), 0.8), 0.07);
    });
    for (const [x, y] of [[gx - 1.6, gy - 1.0], [gx + 1.6, gy - 1.0], [gx - 1.7, gy + 1.0], [gx + 1.7, gy + 1.0]]) orb(g, x, y, 0.3, metal, { hi: 0.6, spec: 0.7 });
    sparkle(g, b, gx - 0.6, gy - 0.6, 1.3);
  } else {
    sparkle(g, b, 3.8, 8.2, 1.1);
  }
}

function amulet(g: G, b: B) {
  const metal = b.c1 ?? P.gold2;
  const cord = b.c2;
  const cx = 8, cy = 10.6, r = 3.9;
  // chain (or cord) hanging in a V to the bail
  for (const s of [-1, 1]) {
    const pts = spline([[cx + s * 5.4, 1.2], [cx + s * 3.6, 4.6], [cx + s * 0.6, cy - r - 0.3]], 8);
    if (cord) tube(g, pts, 0.18, cord, { hi: 0.4 });
    else pts.forEach(([x, y], i) => {
      g.strokeStyle = i % 2 ? dim(metal, 0.2) : lit(metal, 0.2);
      g.lineWidth = 0.14;
      g.beginPath(); g.ellipse(x, y, i % 2 ? 0.2 : 0.34, i % 2 ? 0.34 : 0.2, s * 0.5, 0, Math.PI * 2); g.stroke();
    });
  }
  tube(g, arcPts(cx, cy - r - 0.3, 0.6, 0.6, 0, Math.PI * 2, 12), 0.18, metal, { hi: 0.6, spec: 0.5 });
  // medal: raised rim, sunken field, a saint in relief
  orb(g, cx, cy, r, metal, { hi: 0.6, lo: 0.55, spec: 0 });
  orb(g, cx + 0.12, cy + 0.12, r * 0.8, dim(metal, 0.38), { hi: 0.15, lo: 0.3, spec: 0 });
  const [lx, ly] = L();
  const relief = (off: number, col: string) => {
    // St Christopher wading with his staff, the Child on his shoulder
    g.save(); g.translate(off * lx, off * ly);
    g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round';
    g.lineWidth = 0.14; g.beginPath(); g.arc(cx - 0.15, cy - 1.3, 0.85, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(cx - 0.15, cy - 1.25, 0.46, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(cx - 0.95, cy - 0.45); g.quadraticCurveTo(cx - 0.1, cy - 0.95, cx + 0.8, cy - 0.5); g.lineTo(cx + 1.15, cy + 1.9); g.quadraticCurveTo(cx, cy + 2.2, cx - 1.1, cy + 1.9); g.closePath(); g.fill();
    g.beginPath(); g.arc(cx + 0.72, cy - 1.72, 0.33, 0, Math.PI * 2); g.fill();
    ellipse(g, cx + 0.62, cy - 1.05, 0.34, 0.4, col);
    g.lineWidth = 0.26; g.beginPath(); g.moveTo(cx - 1.55, cy - 2.0); g.lineTo(cx - 1.7, cy + 2.2); g.stroke();
    g.lineWidth = 0.3; g.beginPath(); g.moveTo(cx - 0.55, cy - 0.3); g.lineTo(cx - 1.55, cy + 0.25); g.stroke();
    g.lineWidth = 0.18; g.beginPath(); g.moveTo(cx - 2.2, cy + 2.35); g.quadraticCurveTo(cx - 1.1, cy + 1.9, cx, cy + 2.35); g.quadraticCurveTo(cx + 1.1, cy + 2.8, cx + 2.2, cy + 2.35); g.stroke();
    g.restore();
  };
  relief(0.14, lit(metal, 0.75));
  relief(-0.13, dim(metal, 0.65));
  relief(0, lit(metal, 0.22));
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; orb(g, cx + Math.cos(a) * (r - 0.42), cy + Math.sin(a) * (r - 0.42), 0.13, metal, { spec: 0.4, hi: 0.6 }); }
  if (b.c3) { orb(g, cx, cy + 0.2, 0.55, b.c3, { hi: 0.6, spec: 0.8 }); }
  g.strokeStyle = rgba('#ffffff', 0.7); g.lineWidth = 0.25;
  g.beginPath(); g.arc(cx, cy, r - 0.25, Math.PI * 1.05, Math.PI * 1.45); g.stroke();
  sparkle(g, b, cx - 2.2, cy - 2.2, 1.0);
}

function key(g: G, b: B) {
  const iron = b.c1 ?? '#6e737a';
  frame(g, 3.7, 12.3, -Math.PI / 4, () => {
    // bow: a ring with a trefoil of lobes
    for (const a of [Math.PI * 0.5, Math.PI, Math.PI * 1.5]) tube(g, arcPts(-0.2 + Math.cos(a) * 1.65, Math.sin(a) * 1.65, 0.95, 0.95, 0, Math.PI * 2, 14), 0.27, iron, { hi: 0.5, spec: 0.3 });
    tube(g, arcPts(0, 0, 1.5, 1.5, 0, Math.PI * 2, 20), 0.36, iron, { hi: 0.55, spec: 0.4 });
    // collar and shank
    tube(g, seg([1.4, 0], [11.4, 0], 10), 0.42, iron, { hi: 0.55, spec: 0.45 });
    for (const x of [2.0, 2.7]) tube(g, seg([x - 0.14, 0], [x + 0.14, 0], 2), 0.62, iron, { hi: 0.55, spec: 0.4 });
    orb(g, 11.45, 0, 0.44, iron, { spec: 0.4 });
    // bit with wards cut into it
    fillPts(g, [[8.2, 0.25], [10.8, 0.25], [10.8, 3.0], [10.1, 3.0], [10.1, 2.1], [9.4, 2.1], [9.4, 3.0], [8.2, 3.0]], lightLin(g, 9.5, 1.6, 1.5, tone(iron, 0.5, 0.5)));
    line(g, 8.25, 0.35, 8.25, 2.95, rgba(lit(iron, 0.8), 0.8), 0.1);
  });
  sparkle(g, b, 6.9, 8.4, 0.9, 0.8);
}

function coin(g: G, b: B) {
  const silver = b.c1 ?? '#c8ccd0';
  const one = (x: number, y: number, r: number, lie: boolean) => {
    const ry = lie ? r * 0.45 : r;
    ellipse(g, x + 0.1, y + (lie ? 0.35 : 0.1), r, ry, dim(silver, 0.5));
    ellipse(g, x, y, r, ry, lin(g, x - r, y - ry, x + r, y + ry, [[0, lit(silver, 0.6)], [0.5, silver], [1, dim(silver, 0.35)]]));
    g.strokeStyle = rgba(dim(silver, 0.4), 0.7); g.lineWidth = 0.1;
    g.beginPath(); g.ellipse(x, y, r * 0.8, ry * 0.8, 0, 0, Math.PI * 2); g.stroke();
    // a cross on the face
    g.save(); g.translate(x, y); g.scale(1, ry / r);
    line(g, -r * 0.45, 0, r * 0.45, 0, rgba(dim(silver, 0.4), 0.8), 0.18);
    line(g, 0, -r * 0.45, 0, r * 0.45, rgba(dim(silver, 0.4), 0.8), 0.18);
    g.restore();
  };
  for (let i = 0; i < 4; i++) one(6.2, 12.4 - i * 0.7, 3.0, true);
  one(10.6, 8.6, 3.4, false);
  sparkle(g, b, 9.2, 6.8, 1.0);
}

function purse(g: G, b: B) {
  const leather = b.c1 ?? P.wood3;
  // coins spilling out in front (drawn after the pouch)
  const bag = () => { g.beginPath(); g.moveTo(5.6, 5.4); g.bezierCurveTo(1.4, 7.0, 1.2, 13.6, 5.2, 14.4); g.lineTo(10.8, 14.4); g.bezierCurveTo(14.8, 13.6, 14.6, 7.0, 10.4, 5.4); g.closePath(); };
  fillShape(g, bag, rad(g, 6.0, 8.6, 0.4, 8, 10.2, 7.4, [[0, lit(leather, 0.5)], [0.4, lit(leather, 0.1)], [0.8, leather], [1, dim(leather, 0.55)]]));
  withClip(g, bag, () => {
    fold(g, [[6.2, 6.0], [5.2, 9.0], [5.4, 12.8]], 0.4, leather, 0.35);
    fold(g, [[8.6, 6.0], [8.8, 9.2]], 0.35, leather, 0.3);
    fold(g, [[10.6, 6.2], [11.8, 9.0], [11.4, 12.6]], 0.4, leather, 0.4);
    for (let i = 0; i < 40; i++) ellipse(g, 2 + b.rng.next() * 12, 6 + b.rng.next() * 9, 0.12, 0.08, rgba(dim(leather, 0.6), 0.35));
  });
  // gathered neck and frill
  const frill = () => { g.beginPath(); g.moveTo(5.2, 5.6); g.quadraticCurveTo(4.6, 3.0, 5.6, 2.2); g.quadraticCurveTo(6.6, 3.0, 7.2, 2.0); g.quadraticCurveTo(8.2, 3.0, 9.0, 2.0); g.quadraticCurveTo(9.8, 2.8, 10.6, 2.2); g.quadraticCurveTo(11.4, 3.2, 10.8, 5.6); g.closePath(); };
  fillShape(g, frill, lin(g, 5, 2, 11, 6, [[0, lit(leather, 0.35)], [1, dim(leather, 0.35)]]));
  tube(g, spline([[5.0, 5.4], [8, 6.0], [11.0, 5.4]], 6), 0.28, '#c8b48a', { hi: 0.4 });
  tube(g, spline([[7.4, 5.9], [6.8, 7.4], [7.2, 8.8]], 4), 0.13, '#c8b48a', { hi: 0.4 });
  orb(g, 7.2, 8.9, 0.3, '#c8b48a', { spec: 0.2 });
  // coins
  for (const [x, y] of [[10.8, 13.4], [12.8, 12.8], [9.0, 14.2]]) {
    ellipse(g, x + 0.08, y + 0.2, 1.3, 0.62, dim('#c8ccd0', 0.5));
    ellipse(g, x, y, 1.3, 0.6, lin(g, x - 1.3, y - 0.6, x + 1.3, y + 0.6, [[0, '#f4f6f8'], [0.5, '#c8ccd0'], [1, '#8a9098']]));
    g.strokeStyle = rgba('#7a8088', 0.7); g.lineWidth = 0.08; g.beginPath(); g.ellipse(x, y, 0.95, 0.42, 0, 0, Math.PI * 2); g.stroke();
  }
  sparkle(g, b, 12.4, 12.5, 0.8, 0.85);
}

function fox(g: G, b: B) {
  const wood = '#b86a38';
  const carve = (shape: () => void, c: string) => { fillShape(g, shape, rad(g, 5, 5, 0.3, 8, 8, 9, [[0, lit(c, 0.4)], [0.5, c], [1, dim(c, 0.5)]])); };
  // tail sweeping up behind
  const tail = () => { g.beginPath(); g.moveTo(4.2, 10.2); g.bezierCurveTo(1.0, 10.2, 0.8, 5.4, 2.6, 4.0); g.bezierCurveTo(3.0, 6.2, 4.0, 7.4, 5.8, 8.2); g.closePath(); };
  carve(tail, dim(wood, 0.05));
  withClip(g, tail, () => {
    g.fillStyle = '#efe4cc';
    g.beginPath(); g.moveTo(1.2, 6.6); g.quadraticCurveTo(1.6, 3.8, 2.8, 3.6); g.quadraticCurveTo(2.6, 5.0, 3.0, 6.0); g.closePath(); g.fill();
    for (let k = 0; k < 4; k++) line(g, 1.6 + k * 0.6, 9.6 - k * 0.2, 3.0 + k * 0.6, 5.6 + k * 0.4, rgba(dim(wood, 0.5), 0.45), 0.08);
  });
  // legs
  for (const [x, d] of [[5.0, 0.2], [6.6, 0], [10.2, 0.2], [11.6, 0]]) {
    fillPts(g, [[x - 0.55, 11.0], [x + 0.55, 11.0], [x + 0.45, 14.2], [x - 0.5, 14.2]], lin(g, x - 0.5, 0, x + 0.5, 0, tone(d ? dim(wood, 0.25) : wood, 0.3, 0.45)));
    roundRect(g, x - 0.65, 13.8, 1.35, 0.6, 0.2, '#3a2418');
  }
  // body and head
  const body = () => { g.beginPath(); g.moveTo(3.8, 9.2); g.bezierCurveTo(4.2, 7.0, 9.8, 6.8, 11.2, 7.6); g.bezierCurveTo(12.6, 8.6, 12.6, 11.6, 11.2, 11.8); g.lineTo(4.8, 11.8); g.bezierCurveTo(3.6, 11.6, 3.4, 10.4, 3.8, 9.2); g.closePath(); };
  carve(body, wood);
  withClip(g, body, () => {
    g.fillStyle = rgba('#efe4cc', 0.9);
    g.beginPath(); g.moveTo(9.4, 11.8); g.quadraticCurveTo(10.6, 9.0, 12.4, 9.0); g.lineTo(12.6, 12); g.closePath(); g.fill();
    for (let k = 0; k < 6; k++) line(g, 4.2 + k * 1.2, 7.6, 4.6 + k * 1.2, 11.6, rgba(dim(wood, 0.45), 0.35), 0.08);
    fillPts(g, [[4, 7], [9, 7], [8, 8.4], [4, 8.8]], rgba(lit(wood, 0.5), 0.35));
  });
  const head = () => { g.beginPath(); g.moveTo(10.0, 7.6); g.lineTo(10.6, 3.4); g.lineTo(11.8, 5.0); g.lineTo(12.6, 3.2); g.lineTo(13.2, 5.6); g.quadraticCurveTo(13.6, 6.4, 15.2, 7.4); g.quadraticCurveTo(15.0, 8.2, 13.2, 8.6); g.quadraticCurveTo(11.6, 9.4, 10.0, 7.6); g.closePath(); };
  carve(head, wood);
  withClip(g, head, () => {
    fillPts(g, [[12.4, 8.8], [13.4, 7.8], [15.2, 7.4], [15.4, 9.0]], '#efe4cc');
    fillPts(g, [[10.6, 3.4], [11.8, 5.0], [11.0, 5.4]], dim(wood, 0.5));
    fillPts(g, [[10.2, 7.0], [11.2, 5.0], [12.8, 5.6], [12.2, 6.8]], rgba(lit(wood, 0.5), 0.35));
  });
  // the chewed ear: a notch bitten out
  g.save(); g.globalCompositeOperation = 'destination-out';
  ellipse(g, 12.9, 3.5, 0.45, 0.35, '#000');
  ellipse(g, 12.4, 3.9, 0.25, 0.3, '#000');
  g.restore();
  orb(g, 15.0, 7.5, 0.3, '#1a100a', { spec: 0.6 });
  orb(g, 12.6, 6.2, 0.26, '#1a100a', { spec: 0.8 });
}

function wreath(g: G, b: B) {
  const rng = b.rng;
  const cx = 8, cy = 8.6, rx = 5.6, ry = 4.1;
  const ring = (a0: number, a1: number, dark: boolean) => {
    for (let k = 0; k < 3; k++) {
      const pts = arcPts(cx, cy, rx + (k - 1) * 0.35, ry + (k - 1) * 0.3, a0, a1, 30).map(([x, y], i) => [x, y + Math.sin(i * 1.3 + k * 2) * 0.2] as Pt);
      tube(g, pts, 0.42, dark ? dim(STEM, 0.3) : k === 1 ? STEM2 : STEM, { hi: 0.4, lo: 0.5 });
    }
    for (let i = 0; i < 16; i++) {
      const a = a0 + (a1 - a0) * rng.next();
      leafShape(g, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, a + Math.PI / 2 + (rng.next() - 0.5), 1.4, 0.45, dark ? dim(LEAF, 0.3) : LEAF, {});
    }
  };
  ring(Math.PI, Math.PI * 2, true);
  const flowers: [number, HerbStyle, string, string][] = [[3.5, 'daisy', '#f6f2e4', '#f0c040'], [3.95, 'star', '#f0c020', '#c89010'], [4.5, 'ragged', '#4a7ad8', '#2a2a6a'], [5.1, 'daisy', '#f6f2e4', '#e8c030'], [5.7, 'cup', '#d8302a', '#2a1a1a']];
  for (const [a, st, c1, c2] of flowers) flowerHead(g, b, st, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0.62, dim(c1, 0.1), c2);
  ring(0, Math.PI, false);
  const front: [number, HerbStyle, string, string][] = [[0.3, 'star', '#f0c020', '#c89010'], [0.95, 'daisy', '#f6f2e4', '#f0c040'], [1.6, 'cup', '#d8302a', '#2a1a1a'], [2.25, 'ragged', '#4a7ad8', '#2a2a6a'], [2.85, 'daisy', '#f6f2e4', '#e8c030']];
  for (const [a, st, c1, c2] of front) flowerHead(g, b, st, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 0.78, c1, c2);
}

function drawing(g: G, b: B) {
  const board = '#c8b894';
  const shape: Pt[] = [[1.4, 3.4], [14.2, 2.4], [14.8, 7.0], [14.4, 12.8], [9.0, 13.4], [8.4, 12.9], [7.6, 13.6], [1.8, 13.8], [1.2, 8.4]];
  // board edge thickness
  g.save(); g.translate(0.25, 0.45); fillPts(g, shape, dim(board, 0.5)); g.restore();
  fillPts(g, shape, lin(g, 1, 3, 15, 13, [[0, lit(board, 0.25)], [0.6, board], [1, dim(board, 0.25)]]));
  withClip(g, () => trace(g, shape), () => {
    for (let i = 0; i < 14; i++) { const y = 3 + i * 0.8 + b.rng.next() * 0.3; line(g, 1, y, 15, y - 0.6 + b.rng.next() * 0.4, rgba(dim(board, 0.35), 0.3), 0.07); }
    ellipse(g, 11.4, 6.2, 0.5, 0.3, rgba(dim(board, 0.5), 0.6));
    // four figures, tallest to smallest, and the dog
    const ink = rgba('#2a2420', 0.85);
    const fig = (x: number, h: number) => {
      const top = 11.0 - h;
      g.strokeStyle = ink; g.lineWidth = 0.16;
      g.beginPath(); g.arc(x, top, h * 0.14, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      g.moveTo(x, top + h * 0.14); g.lineTo(x, top + h * 0.62);
      g.moveTo(x - h * 0.22, top + h * 0.34); g.lineTo(x + h * 0.22, top + h * 0.34);
      g.moveTo(x, top + h * 0.62); g.lineTo(x - h * 0.16, top + h); g.moveTo(x, top + h * 0.62); g.lineTo(x + h * 0.16, top + h);
      g.stroke();
    };
    fig(3.4, 6.0); fig(5.6, 5.4); fig(7.8, 4.4); fig(9.6, 3.2);
    g.strokeStyle = ink; g.lineWidth = 0.16;
    g.beginPath(); g.moveTo(11.2, 9.8); g.lineTo(13.0, 9.8); g.moveTo(11.4, 9.8); g.lineTo(11.2, 11.0); g.moveTo(12.8, 9.8); g.lineTo(13.0, 11.0); g.moveTo(13.0, 9.8); g.lineTo(13.6, 9.0); g.moveTo(11.2, 9.8); g.lineTo(10.7, 9.2); g.stroke();
    ellipse(g, 13.7, 8.9, 0.35, 0.28, rgba('#2a2420', 0.7));
    // L I D A underneath
    g.lineWidth = 0.14;
    g.beginPath();
    g.moveTo(4.2, 11.8); g.lineTo(4.2, 12.9); g.lineTo(4.9, 12.9);
    g.moveTo(6.0, 11.8); g.lineTo(6.0, 12.9);
    g.moveTo(7.1, 11.8); g.lineTo(7.1, 12.9); g.quadraticCurveTo(8.2, 12.4, 7.1, 11.8);
    g.moveTo(8.8, 12.9); g.lineTo(9.3, 11.8); g.lineTo(9.8, 12.9); g.moveTo(9.0, 12.5); g.lineTo(9.6, 12.5);
    g.stroke();
    g.fillStyle = rgba('#2a2420', 0.12); g.fillRect(2, 11.2, 9, 2);
  });
}

function seal(g: G, b: B) {
  const c0 = b.c1 ?? '#8e2f2f';
  const metal = isMetal(c0), token = !metal && luma(c0) < 0.2;
  // a charred wooden token keeps a little of its wood colour so it reads on a dark ground
  const col = token ? mix(c0, '#6a5240', 0.4) : c0;
  const cx = 8, cy = 8.4, r = 5.6;
  if (metal) {
    orb(g, cx, cy, r, col, { hi: 0.6, lo: 0.55, spec: 0 });
    for (let i = 0; i < 48; i++) { const a = (i / 48) * Math.PI * 2; line(g, cx + Math.cos(a) * (r - 0.35), cy + Math.sin(a) * (r - 0.35), cx + Math.cos(a) * r, cy + Math.sin(a) * r, rgba(dim(col, 0.5), 0.6), 0.08); }
  } else {
    const pts: Pt[] = [];
    for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2, k = token ? 1 : 1 + (b.rng.next() - 0.5) * 0.14; pts.push([cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]); }
    smooth(g, pts);
    g.fillStyle = rad(g, cx - 2, cy - 2, 0.3, cx, cy, r * 1.1, [[0, lit(col, 0.45)], [0.5, col], [1, dim(col, 0.55)]]);
    g.fill();
  }
  // sunken field
  g.beginPath(); g.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  g.fillStyle = lin(g, cx - r, cy - r, cx + r, cy + r, [[0, dim(col, 0.35)], [1, lit(col, 0.2)]]);
  g.fill();
  if (token) {
    withClip(g, () => { g.beginPath(); g.arc(cx, cy, r - 0.1, 0, Math.PI * 2); }, () => {
      for (let i = 0; i < 12; i++) line(g, cx - r, cy - r + i * 1.0, cx + r, cy - r + i * 1.0 + 0.5, rgba(i % 2 ? '#8a7260' : '#1a1210', 0.45), 0.08);
    });
  }
  // the device: a bird with spread wings (wax), crossed hammers (metal)
  const [lx, ly] = L();
  const device = (dx: number, dy: number, c: string) => {
    g.save(); g.translate(dx, dy); g.fillStyle = c; g.strokeStyle = c;
    if (metal) {
      g.lineWidth = 0.45;
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(cx - s * 2.4, cy + 2.4); g.lineTo(cx + s * 1.4, cy - 1.4); g.stroke();
        g.save(); g.translate(cx + s * 1.5, cy - 1.5); g.rotate(s * Math.PI / 4); g.fillRect(-1.2, -0.45, 2.4, 0.9); g.restore();
      }
    } else {
      g.beginPath();
      g.moveTo(cx, cy - 1.4);
      g.quadraticCurveTo(cx - 1.6, cy - 2.6, cx - 3.2, cy - 1.4);
      g.lineTo(cx - 2.4, cy - 0.9); g.lineTo(cx - 3.0, cy - 0.3); g.lineTo(cx - 2.0, cy - 0.1); g.lineTo(cx - 2.4, cy + 0.6);
      g.quadraticCurveTo(cx - 1.0, cy + 0.6, cx - 0.5, cy + 1.2);
      g.lineTo(cx - 1.0, cy + 2.6); g.lineTo(cx, cy + 2.0); g.lineTo(cx + 1.0, cy + 2.6); g.lineTo(cx + 0.5, cy + 1.2);
      g.quadraticCurveTo(cx + 1.0, cy + 0.6, cx + 2.4, cy + 0.6);
      g.lineTo(cx + 2.0, cy - 0.1); g.lineTo(cx + 3.0, cy - 0.3); g.lineTo(cx + 2.4, cy - 0.9); g.lineTo(cx + 3.2, cy - 1.4);
      g.quadraticCurveTo(cx + 1.6, cy - 2.6, cx, cy - 1.4);
      g.closePath(); g.fill();
      g.beginPath(); g.arc(cx, cy - 1.8, 0.62, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  };
  device(lx * 0.14, ly * 0.14, lit(col, token ? 0.25 : 0.5));
  device(-lx * 0.12, -ly * 0.12, dim(col, 0.6));
  device(0, 0, lit(col, 0.05));
  g.strokeStyle = rgba('#ffffff', metal ? 0.7 : token ? 0.35 : 0.5); g.lineWidth = 0.3;
  g.beginPath(); g.arc(cx, cy, r * 0.86, Math.PI * 1.05, Math.PI * 1.45); g.stroke();
  if (token) { g.strokeStyle = rgba(lit(col, 0.5), 0.6); g.lineWidth = 0.22; g.beginPath(); g.arc(cx, cy, r - 0.15, Math.PI * 0.9, Math.PI * 1.7); g.stroke(); }
  if (!token) sparkle(g, b, cx - 3.2, cy - 3.0, metal ? 1.1 : 0.8, 0.85);
}

function book(g: G, b: B) {
  const cover = b.c1 ?? CLOTH.brown, gilt = b.c3 ?? P.gold2;
  const cam: Cam = { x: 8.5, y: 8.3, s: 1.18, yaw: 0.5, pitch: 0.28 };
  const W = 3.6, H = 4.7, T = 1.25;
  // page block top between the boards
  const pv: V3[] = [[-W + 0.35, H - 0.2, T - 0.3], [W - 0.1, H - 0.2, T - 0.3], [W - 0.1, H - 0.2, -T + 0.3], [-W + 0.35, H - 0.2, -T + 0.3]];
  // back board edge, spine, then the front board
  const faces = boxFaces(cam, -W, W, -H, H, -T, T);
  for (const f of faces) {
    const pts = f.vs.map((p) => pr(cam, p));
    if (f.k === 'top') {
      fillPts(g, pts, faceTone(cover, f.lum, 0.4, 0.5));
      const pp = pv.map((p) => pr(cam, p));
      fillPts(g, pp, lin(g, pp[0][0], pp[0][1], pp[2][0], pp[2][1], [[0, '#f6eed8'], [1, '#c8b890']]));
      withClip(g, () => trace(g, pp), () => { for (let k = 1; k < 8; k++) { const t = k / 8; const a = pr(cam, [-W + 0.35, H - 0.2, T - 0.3 - t * (2 * T - 0.6)]), c = pr(cam, [W - 0.1, H - 0.2, T - 0.3 - t * (2 * T - 0.6)]); line(g, a[0], a[1], c[0], c[1], rgba('#a89870', 0.45), 0.05); } });
      continue;
    }
    const c = faceTone(cover, f.lum, 0.4, 0.55);
    fillPts(g, pts, lin(g, pts[0][0], pts[0][1], pts[2][0], pts[2][1], [[0, lit(c, 0.12)], [1, dim(c, 0.18)]]));
    withClip(g, () => trace(g, pts), () => {
      for (let i = 0; i < 40; i++) { const p = pts[0], q = pts[2]; ellipse(g, p[0] + (q[0] - p[0]) * b.rng.next(), p[1] + (q[1] - p[1]) * b.rng.next(), 0.2, 0.12, rgba(b.rng.next() < 0.5 ? dim(c, 0.3) : lit(c, 0.2), 0.25)); }
    });
    if (f.k === 'left') {
      // spine: raised bands with gilt lines
      for (let k = 0; k < 4; k++) {
        const y = -H + 1.4 + k * 2.3;
        const a = pr(cam, [-W, y, -T]), c2 = pr(cam, [-W, y, T]);
        line(g, a[0], a[1], c2[0], c2[1], dim(c, 0.4), 0.42);
        line(g, a[0], a[1] - 0.18, c2[0], c2[1] - 0.18, rgba(lit(c, 0.4), 0.8), 0.12);
        line(g, a[0], a[1] + 0.35, c2[0], c2[1] + 0.35, gilt, 0.07);
      }
    }
    if (f.k === 'front') {
      onFace(g, cam, [-W, -H, T], [2 * W, 0, 0], [0, 2 * H, 0], () => {
        // tooled gilt border, a lozenge, corner pieces, and a clasp
        g.strokeStyle = gilt; g.lineWidth = 0.012;
        g.strokeRect(0.08, 0.06, 0.84, 0.88);
        g.strokeStyle = rgba(gilt, 0.7); g.lineWidth = 0.008;
        g.strokeRect(0.13, 0.1, 0.74, 0.8);
        g.fillStyle = gilt;
        g.beginPath(); g.moveTo(0.5, 0.3); g.lineTo(0.72, 0.5); g.lineTo(0.5, 0.7); g.lineTo(0.28, 0.5); g.closePath(); g.fill();
        g.fillStyle = dim(c, 0.2);
        g.beginPath(); g.moveTo(0.5, 0.38); g.lineTo(0.64, 0.5); g.lineTo(0.5, 0.62); g.lineTo(0.36, 0.5); g.closePath(); g.fill();
        g.fillStyle = gilt;
        g.beginPath(); g.arc(0.5, 0.5, 0.045, 0, Math.PI * 2); g.fill();
        for (const [x, y, sx, sy] of [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]]) {
          g.fillStyle = lin(g, x, y, x + sx * 0.2, y + sy * 0.16, [[0, lit(gilt, 0.5)], [1, dim(gilt, 0.3)]]);
          g.beginPath(); g.moveTo(x, y); g.lineTo(x + sx * 0.2, y); g.lineTo(x, y + sy * 0.16); g.closePath(); g.fill();
        }
        g.fillStyle = '#3a2416'; g.fillRect(0.84, 0.44, 0.16, 0.12);
        g.fillStyle = lin(g, 0.8, 0.43, 0.9, 0.57, [[0, lit(gilt, 0.5)], [1, dim(gilt, 0.3)]]);
        g.fillRect(0.8, 0.43, 0.09, 0.14);
      });
    }
  }
  const e0 = pr(cam, [-W, H, T]), e1 = pr(cam, [W, H, T]);
  line(g, e0[0], e0[1], e1[0], e1[1], rgba(lit(cover, 0.6), 0.7), 0.1);
  const s0 = pr(cam, [-W, H, T]), s1 = pr(cam, [-W, -H, T]);
  line(g, s0[0], s0[1], s1[0], s1[1], rgba(lit(cover, 0.5), 0.6), 0.12);
}

function letter(g: G, b: B) {
  const wax = b.c1 ?? CLOTH.red;
  const paper = P.paper;
  frame(g, 8, 8.6, -0.12, () => {
    const sheet = () => { g.beginPath(); g.moveTo(-6.4, -4.2); g.lineTo(6.4, -4.4); g.lineTo(6.6, 4.4); g.lineTo(-6.5, 4.6); g.closePath(); };
    g.save(); g.translate(0.25, 0.35); fillShape(g, sheet, dim(paper, 0.5)); g.restore();
    fillShape(g, sheet, lin(g, -6, -4, 6, 4, [[0, lit(paper, 0.4)], [0.6, paper], [1, dim(paper, 0.2)]]));
    withClip(g, sheet, () => {
      // folded flaps meeting under the seal
      fillPts(g, [[-6.5, -4.3], [6.5, -4.5], [0.2, 0.9]], lin(g, 0, -4.4, 0, 1, [[0, lit(paper, 0.3)], [1, dim(paper, 0.12)]]));
      strokePts(g, [[-6.5, -4.2], [0.2, 0.9], [6.5, -4.4]], rgba(dim(paper, 0.45), 0.8), 0.12);
      strokePts(g, [[-6.4, 4.5], [-1.2, 0.6]], rgba(dim(paper, 0.3), 0.6), 0.1);
      strokePts(g, [[6.5, 4.3], [1.6, 0.6]], rgba(dim(paper, 0.3), 0.6), 0.1);
      for (let i = 0; i < 20; i++) ellipse(g, -6 + b.rng.next() * 12, -4 + b.rng.next() * 8, 0.6, 0.3, rgba('#b8a070', 0.12));
      g.fillStyle = lin(g, 0, 2, 0, 4.6, [[0, 'rgba(120,90,50,0)'], [1, 'rgba(120,90,50,0.2)']]);
      g.fillRect(-7, 2, 14, 3);
    });
    // ribbon under the seal
    fillPts(g, [[-0.4, 0.9], [0.5, 0.9], [1.6, 4.8], [0.9, 4.6], [0.5, 5.2]], dim(wax, 0.15));
    const blob: Pt[] = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2, k = 1 + (b.rng.next() - 0.5) * 0.2; blob.push([0.2 + Math.cos(a) * 1.75 * k, 0.9 + Math.sin(a) * 1.6 * k]); }
    smooth(g, blob);
    g.fillStyle = rad(g, -0.4, 0.3, 0.1, 0.2, 0.9, 1.9, [[0, lit(wax, 0.55)], [0.5, wax], [1, dim(wax, 0.5)]]);
    g.fill();
    g.beginPath(); g.arc(0.2, 0.9, 1.05, 0, Math.PI * 2); g.strokeStyle = rgba(dim(wax, 0.5), 0.8); g.lineWidth = 0.14; g.stroke();
    g.beginPath(); g.arc(0.2, 0.9, 1.05, Math.PI * 0.2, Math.PI * 1.0); g.strokeStyle = rgba(lit(wax, 0.5), 0.7); g.lineWidth = 0.1; g.stroke();
    line(g, -0.3, 0.9, 0.7, 0.9, rgba(dim(wax, 0.55), 0.9), 0.14);
    line(g, 0.2, 0.4, 0.2, 1.4, rgba(dim(wax, 0.55), 0.9), 0.14);
    ellipse(g, -0.6, 0.2, 0.4, 0.2, rgba('#ffffff', 0.6), -0.6);
  });
}

function scroll(g: G, b: B) {
  const paper = '#e6d7b0';
  frame(g, 8, 8.2, -0.5, () => {
    const sheet = () => { g.beginPath(); g.moveTo(-4.4, -4.2); g.lineTo(4.4, -4.2); g.lineTo(4.4, 4.2); g.lineTo(-4.4, 4.2); g.closePath(); };
    fillShape(g, sheet, lin(g, 0, -4, 0, 4, [[0, dim(paper, 0.15)], [0.25, lit(paper, 0.25)], [0.75, paper], [1, dim(paper, 0.2)]]));
    withClip(g, sheet, () => {
      for (let i = 0; i < 7; i++) {
        const y = -2.8 + i * 0.85, w = i === 6 ? 3.6 : 6.4 - (i % 3) * 0.6;
        g.strokeStyle = rgba('#3a2a1a', 0.55); g.lineWidth = 0.14;
        g.beginPath(); g.moveTo(-3.4, y);
        for (let x = -3.4; x < -3.4 + w; x += 0.35) g.lineTo(x + 0.35, y + Math.sin(x * 7 + i) * 0.08);
        g.stroke();
      }
      g.fillStyle = rgba('#8e2f2f', 0.9); g.fillRect(-3.6, -3.4, 0.5, 0.5);
      for (let i = 0; i < 16; i++) ellipse(g, -4 + b.rng.next() * 8, -4 + b.rng.next() * 8, 0.5, 0.3, rgba('#a88a50', 0.12));
    });
    // rolled ends
    for (const [y, s] of [[-4.2, -1], [4.2, 1]] as Pt[]) {
      tube(g, seg([-4.9, y], [4.9, y], 8), 0.95, paper, { hi: 0.45, lo: 0.45, spec: 0.2 });
      for (const x of [-4.9, 4.9]) {
        g.beginPath(); g.ellipse(x, y, 0.35, 0.95, 0, 0, Math.PI * 2); g.fillStyle = lit(paper, x < 0 ? 0.3 : 0); g.fill();
        g.beginPath(); g.ellipse(x, y + 0.05, 0.18, 0.5, 0, 0, Math.PI * 2); g.strokeStyle = rgba('#8a7050', 0.8); g.lineWidth = 0.07; g.stroke();
      }
      if (s > 0) line(g, -4.9, y - 0.95, 4.9, y - 0.95, rgba(dim(paper, 0.5), 0.6), 0.12);
    }
  });
}

function shield(g: G, b: B) {
  const field = b.c1 ?? CLOTH.woad, charge = b.c2 ?? P.gold2;
  const shape = () => symPath(g, [8, 1.4], [[2.2, 1.6], [2.0, 9.6, 8, 15.0]]);
  fillShape(g, shape, lin(g, 2, 1, 14, 15, [[0, lit(field, 0.35)], [0.5, field], [1, dim(field, 0.5)]]));
  withClip(g, shape, () => {
    g.fillStyle = lin(g, 6.6, 0, 9.4, 0, tone(charge, 0.4, 0.4));
    g.fillRect(6.6, 0, 2.8, N);
    shadeOver(g, 2, 1, 14, 15, 0.25, 0.4);
    for (let i = 0; i < 30; i++) line(g, 2 + b.rng.next() * 12, 1 + b.rng.next() * 13, 2 + b.rng.next() * 12, 1 + b.rng.next() * 13, rgba('#2a1a10', 0.12), 0.06);
  });
  shape(); g.strokeStyle = '#6a6e76'; g.lineWidth = 0.5; g.stroke();
  shape(); g.strokeStyle = rgba('#e8ecf0', 0.7); g.lineWidth = 0.12; g.stroke();
  orb(g, 8, 6.4, 1.1, P.metal3, { hi: 0.6, spec: 0.8 });
}

function tool(g: G, b: B) {
  // smith's pincers crossed over a small hammer
  const iron = '#5a5e66';
  frame(g, 12.6, 14.0, -Math.PI * 0.72, () => {
    for (const s of [-1, 1]) {
      const arm = spline([[0, s * 0.45], [6.6, s * 0.36], [9.4, -s * 0.24], [11.4, -s * 0.7]], 6);
      tube(g, arm, arm.map((_, i) => 0.4 - i * 0.004), s < 0 ? lit(iron, 0.1) : iron, { hi: 0.55, spec: 0.35 });
    }
    orb(g, 9.1, 0, 0.52, iron, { hi: 0.6, spec: 0.6 });
    for (const s of [-1, 1]) orb(g, 11.5, -s * 0.72, 0.42, iron, { spec: 0.4 });
  });
  frame(g, 2.8, 14.2, -Math.PI / 4, () => {
    const hp = seg([0, 0], [11.4, 0], 10);
    tube(g, hp, 0.5, P.wood3, { hi: 0.45, spec: 0.12 });
    tubeLines(g, hp, 0.5, dim(P.wood3, 0.55), b.rng, 5, 0.4);
    fillPts(g, [[9.9, -2.9], [12.5, -2.9], [12.5, 1.3], [11.8, 2.6], [10.6, 2.6], [9.9, 1.3]], lin(g, 9.9, 0, 12.5, 0, tone('#7a808a', 0.6, 0.45)));
    line(g, 9.95, -2.8, 12.45, -2.8, rgba('#ffffff', 0.7), 0.12);
  });
  sparkle(g, b, 11.0, 3.4, 0.8, 0.8);
}

function parcel(g: G, b: B) {
  const cloth = b.c1 ?? CLOTH.linen;
  const bundle = () => { g.beginPath(); g.moveTo(2.4, 7.0); g.quadraticCurveTo(8, 4.2, 13.6, 6.8); g.quadraticCurveTo(15.0, 10.4, 13.2, 13.8); g.quadraticCurveTo(8, 15.2, 2.8, 13.8); g.quadraticCurveTo(1.0, 10.4, 2.4, 7.0); g.closePath(); };
  fillShape(g, bundle, rad(g, 5.6, 7.4, 0.3, 8, 10, 7.6, [[0, lit(cloth, 0.45)], [0.5, cloth], [1, dim(cloth, 0.5)]]));
  withClip(g, bundle, () => {
    fold(g, [[3.6, 8.0], [6.0, 10.4], [5.4, 13.4]], 0.5, cloth, 0.35);
    fold(g, [[12.4, 7.6], [10.4, 10.2], [11.0, 13.6]], 0.5, cloth, 0.4);
  });
  // knot on top with ears of cloth
  for (const s of [-1, 1]) fillPts(g, [[8, 6.2], [8 + s * 3.0, 2.2], [8 + s * 1.2, 2.6], [8 + s * 0.2, 5.8]], lightLin(g, 8 + s * 1.6, 4, 1.6, tone(s < 0 ? cloth : dim(cloth, 0.12), 0.4, 0.45)));
  orb(g, 8, 6.0, 0.9, dim(cloth, 0.05), { spec: 0.2 });
  tube(g, spline([[2.6, 10.2], [8, 11.4], [13.6, 10.0]], 6), 0.2, '#b89a68', { hi: 0.4 });
}

// ================================================================ shapes offered for the item table

function horseshoe(g: G, b: B) {
  const iron = b.c1 ?? P.metal2;
  const pts = arcPts(8, 7.6, 5.0, 5.6, -Math.PI * 0.2, Math.PI * 1.2, 40);
  const W = pts.map(() => 1.3);
  tube(g, pts, W, iron, { hi: 0.55, lo: 0.55, spec: 0.3 });
  const ns = normalsOf(pts);
  // fuller groove with nail holes
  strokePts(g, pts.slice(3, pts.length - 3).map(([x, y], i) => [x + ns[i + 3][0] * 0.3, y + ns[i + 3][1] * 0.3] as Pt), rgba(dim(iron, 0.6), 0.75), 0.24);
  for (const i of [6, 11, 16, 24, 29, 34]) {
    const [x, y] = pts[i], [nx, ny] = ns[i];
    frame(g, x + nx * 0.3, y + ny * 0.3, Math.atan2(ny, nx), () => { roundRect(g, -0.3, -0.15, 0.6, 0.3, 0.08, '#1a1612'); });
  }
  // squared heels and a toe clip
  for (const i of [0, pts.length - 1]) { const [x, y] = pts[i]; roundRect(g, x - 1.0, y - 0.7, 2.0, 1.0, 0.25, lin(g, x - 1, 0, x + 1, 0, tone(iron, 0.45, 0.5))); }
  fillPts(g, [[7.0, 12.4], [9.0, 12.4], [8.6, 13.9], [7.4, 13.9]], lightLin(g, 8, 13, 1, tone(iron, 0.55, 0.45)));
  sparkle(g, b, 4.0, 10.8, 0.9, 0.8);
}

function candle(g: G, b: B) {
  const wax = b.c1 ?? '#f0e0a0', brass = P.gold2;
  // dish with a ring handle
  tube(g, arcPts(12.4, 12.6, 1.1, 0.9, -Math.PI * 0.6, Math.PI * 0.7, 12), 0.2, brass, { hi: 0.6, spec: 0.4 });
  g.beginPath(); g.ellipse(8, 13.4, 5.2, 1.6, 0, 0, Math.PI * 2); g.fillStyle = lin(g, 3, 12, 13, 15, [[0, lit(brass, 0.55)], [0.5, brass], [1, dim(brass, 0.5)]]); g.fill();
  g.beginPath(); g.ellipse(8, 13.1, 4.3, 1.15, 0, 0, Math.PI * 2); g.fillStyle = lin(g, 0, 12, 0, 14.2, [[0, dim(brass, 0.35)], [1, lit(brass, 0.25)]]); g.fill();
  // the candle
  const body = () => { g.beginPath(); g.moveTo(6.2, 5.2); g.lineTo(9.8, 5.2); g.lineTo(9.8, 13.2); g.ellipse(8, 13.2, 1.8, 0.5, 0, 0, Math.PI); g.closePath(); };
  fillShape(g, body, lin(g, 6.2, 0, 9.8, 0, [[0, lit(wax, 0.35)], [0.35, wax], [1, dim(wax, 0.4)]]));
  withClip(g, body, () => {
    for (const [x, len] of [[6.7, 3.2], [8.9, 2.0], [9.5, 4.2]]) { roundRect(g, x - 0.3, 5, 0.6, len, 0.3, lin(g, x - 0.3, 0, x + 0.3, 0, tone(lit(wax, 0.1), 0.4, 0.3))); }
    ellipse(g, 6.9, 9, 0.2, 2.6, rgba('#fffbe8', 0.55));
  });
  g.beginPath(); g.ellipse(8, 5.2, 1.8, 0.5, 0, 0, Math.PI * 2); g.fillStyle = lit(wax, 0.35); g.fill();
  line(g, 8, 5.1, 8.1, 4.2, '#2a1a10', 0.14);
  b.post.push((h) => flame(h, 8.05, 4.4, 3.4, 0.75, 0.25));
}

function waxCake(g: G, b: B) {
  const wax = b.c1 ?? '#d8a838';
  const cx = 8, top = 7.6;
  g.beginPath(); g.moveTo(cx - 6, top); g.lineTo(cx - 6, top + 3.6); g.ellipse(cx, top + 3.6, 6, 2.4, 0, Math.PI, 0, true); g.lineTo(cx + 6, top); g.closePath();
  g.fillStyle = lin(g, 2, 0, 14, 0, [[0, lit(wax, 0.25)], [0.4, wax], [1, dim(wax, 0.45)]]); g.fill();
  const face = () => { g.beginPath(); g.ellipse(cx, top, 6, 2.4, 0, 0, Math.PI * 2); };
  fillShape(g, face, rad(g, cx - 2, top - 1, 0.3, cx, top, 6.4, [[0, lit(wax, 0.55)], [0.6, lit(wax, 0.15)], [1, wax]]));
  withClip(g, face, () => {
    // honeycomb pressed into the top
    g.save(); g.translate(cx, top); g.scale(1, 0.4);
    const hr = 0.78;
    for (let row = -4; row <= 4; row++) for (let col = -5; col <= 5; col++) {
      const hx = col * hr * 1.73 + (row % 2 ? hr * 0.87 : 0), hy = row * hr * 1.5;
      if (hx * hx / 36 + hy * hy / 36 > 0.72) continue;
      const hex = (dx: number, dy: number, c: string, w: number) => {
        g.beginPath();
        for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k / 6) * Math.PI * 2; const px = hx + dx + Math.cos(a) * hr * 0.86, py = hy + dy + Math.sin(a) * hr * 0.86; if (k) g.lineTo(px, py); else g.moveTo(px, py); }
        g.closePath(); g.strokeStyle = c; g.lineWidth = w; g.stroke();
      };
      hex(0.08, 0.25, rgba(lit(wax, 0.55), 0.8), 0.14);
      hex(0, 0, rgba(dim(wax, 0.4), 0.85), 0.14);
    }
    g.restore();
    ellipse(g, cx - 2.8, top - 0.8, 1.6, 0.35, rgba('#fffbe8', 0.5), -0.1);
  });
  sparkle(g, b, cx - 3.2, top - 0.9, 0.8, 0.75);
}

function swarm(g: G, b: B) {
  const sack = '#b8a070';
  const bag = () => { g.beginPath(); g.moveTo(5.8, 6.2); g.bezierCurveTo(1.6, 7.6, 1.8, 14.4, 5.4, 14.8); g.lineTo(10.8, 14.8); g.bezierCurveTo(14.4, 14.4, 14.4, 7.6, 10.2, 6.2); g.closePath(); };
  fillShape(g, bag, rad(g, 6, 9, 0.4, 8, 10.6, 7, [[0, lit(sack, 0.4)], [0.5, sack], [1, dim(sack, 0.55)]]));
  withClip(g, bag, () => {
    for (let y = 6; y < 15; y += 0.35) line(g, 1, y, 15, y + 0.1, rgba(dim(sack, 0.45), 0.25), 0.06);
    for (let x = 1; x < 15; x += 0.35) line(g, x, 6, x + 0.2, 15, rgba(dim(sack, 0.45), 0.2), 0.05);
    fold(g, [[6.4, 7.0], [5.4, 10.6], [6.0, 14.2]], 0.5, sack, 0.4);
    fold(g, [[9.8, 7.0], [11.0, 10.4]], 0.45, sack, 0.4);
  });
  const neck = () => { g.beginPath(); g.moveTo(5.8, 6.4); g.quadraticCurveTo(5.4, 3.8, 6.4, 2.6); g.quadraticCurveTo(8, 3.6, 9.6, 2.6); g.quadraticCurveTo(10.6, 3.8, 10.2, 6.4); g.closePath(); };
  fillShape(g, neck, lin(g, 5.5, 0, 10.5, 0, tone(sack, 0.35, 0.45)));
  tube(g, spline([[5.4, 6.0], [8, 6.6], [10.6, 6.0]], 6), 0.3, '#8a6a3a', { hi: 0.4 });
  b.post.push((h) => {
    for (const [x, y, a] of [[12.6, 3.4, 0.4], [3.4, 4.2, -0.5], [13.4, 7.6, 0.9], [11.0, 1.8, -0.2]]) {
      h.save(); h.translate(x, y); h.rotate(a);
      ellipse(h, -0.25, -0.4, 0.42, 0.25, 'rgba(240,248,255,0.8)', -0.5);
      ellipse(h, 0.25, -0.4, 0.42, 0.25, 'rgba(240,248,255,0.8)', 0.5);
      ellipse(h, 0, 0, 0.55, 0.36, '#e8b030');
      line(h, -0.15, -0.3, -0.15, 0.3, '#2a1a0a', 0.16);
      line(h, 0.2, -0.3, 0.2, 0.3, '#2a1a0a', 0.16);
      h.restore();
    }
    h.strokeStyle = 'rgba(40,30,20,0.4)'; h.lineWidth = 0.08; h.setLineDash([0.2, 0.25]);
    h.beginPath(); h.moveTo(12.0, 3.8); h.quadraticCurveTo(10.6, 5.4, 9.6, 3.4); h.stroke();
    h.setLineDash([]);
  });
}

function shovel(g: G, b: B) {
  const iron = b.c1 ?? '#5e636b', wood = b.c2 ?? P.wood3;
  frame(g, 2.2, 13.8, -Math.PI / 4, () => {
    tube(g, seg([-0.9, 0], [0.9, 0], 3).map(([x, y]) => [0, x] as Pt), 0.36, wood, { hi: 0.45 });
    const sp = seg([0, 0], [11.2, 0], 10);
    tube(g, sp, 0.36, wood, { hi: 0.45, spec: 0.12 });
    tubeLines(g, sp, 0.36, dim(wood, 0.55), b.rng, 5, 0.4);
    // blade
    const bl = () => { g.beginPath(); g.moveTo(10.4, -0.5); g.lineTo(11.8, -1.9); g.quadraticCurveTo(16.4, -2.2, 17.2, 0); g.quadraticCurveTo(16.4, 2.2, 11.8, 1.9); g.lineTo(10.4, 0.5); g.closePath(); };
    fillShape(g, bl, lin(g, 11, -2, 11, 2, [[0, lit(iron, 0.45)], [0.5, iron], [1, dim(iron, 0.5)]]));
    withClip(g, bl, () => {
      g.fillStyle = lin(g, 14.8, 0, 17.4, 0, [[0, rgba(lit(iron, 0.6), 0)], [1, rgba(lit(iron, 0.8), 0.8)]]);
      g.fillRect(14.6, -3, 3, 6);
      for (let i = 0; i < 10; i++) ellipse(g, 11.6 + b.rng.next() * 3, (b.rng.next() - 0.5) * 3, 0.4, 0.25, rgba('#5a4028', 0.4));
    });
    line(g, 11.8, 0, 16.6, 0, rgba(dim(iron, 0.4), 0.7), 0.14);
  });
  sparkle(g, b, 13.6, 3.2, 0.8, 0.8);
}

function whetstone(g: G, b: B) {
  const stone = b.c1 ?? P.stone3;
  const cam: Cam = { x: 8, y: 8.8, s: 1.1, yaw: -0.6, pitch: 0.6 };
  for (const f of boxFaces(cam, -5.2, 5.2, -0.9, 0.9, -1.4, 1.4)) {
    const pts = f.vs.map((p) => pr(cam, p));
    const c = faceTone(stone, f.lum, 0.45, 0.6);
    fillPts(g, pts, lin(g, pts[0][0], pts[0][1], pts[2][0], pts[2][1], [[0, lit(c, 0.1)], [1, dim(c, 0.1)]]));
    withClip(g, () => trace(g, pts), () => {
      for (let i = 0; i < 50; i++) { const p = pts[0], q = pts[2]; ellipse(g, p[0] + (q[0] - p[0]) * b.rng.next(), p[1] + (q[1] - p[1]) * b.rng.next(), 0.1, 0.08, rgba(b.rng.next() < 0.5 ? '#2a2a30' : '#d8d8e0', 0.35)); }
      if (f.k === 'top') { g.fillStyle = lin(g, pts[0][0], pts[0][1], pts[2][0], pts[2][1], [[0.3, rgba('#ffffff', 0)], [0.5, rgba('#e8f0ff', 0.35)], [0.7, rgba('#ffffff', 0)]]); g.fillRect(0, 0, N, N); }
    });
  }
  sparkle(g, b, 7.0, 7.4, 0.8, 0.7);
}

function ribbon(g: G, b: B) {
  const col = b.c1 ?? CLOTH.green;
  const loop = (s: number) => {
    const pts = spline([[8, 7.6], [8 + s * 3.2, 4.4], [8 + s * 6.2, 4.6], [8 + s * 6.0, 8.6], [8 + s * 3.0, 9.2], [8, 7.8]], 6);
    tube(g, pts, 0.95, s < 0 ? col : dim(col, 0.12), { hi: 0.55, lo: 0.55, spec: 0.35 });
  };
  for (const s of [1, -1]) {
    const tail = spline([[8, 8.2], [8 + s * 1.6, 11.2], [8 + s * 2.4, 14.4]], 6);
    tube(g, tail, tail.map((_, i) => 0.8 + i * 0.02), s < 0 ? col : dim(col, 0.15), { hi: 0.5, spec: 0.3 });
    const e = tail[tail.length - 1];
    g.save(); g.globalCompositeOperation = 'destination-out'; fillPts(g, [[e[0] - 0.9, e[1] + 0.8], [e[0], e[1] - 0.3], [e[0] + 0.9, e[1] + 0.8]], '#000'); g.restore();
  }
  loop(1);
  loop(-1);
  orb(g, 8, 7.9, 1.1, col, { hi: 0.5, spec: 0.5, ry: 0.95 });
}

function apron(g: G, b: B) {
  const col = b.c1 ?? CLOTH.white;
  tube(g, spline([[5.8, 3.6], [8, 0.6], [10.2, 3.6]], 6), 0.25, dim(col, 0.1), { hi: 0.4 });
  for (const s of [-1, 1]) tube(g, spline([[side(4.2, s), 7.0], [side(2.2, s), 7.8], [side(1.6, s), 10.6]], 5), 0.3, dim(col, 0.05), { hi: 0.4 });
  const shape = () => symPath(g, [8, 3.2], [[5.8, 3.2], [5.6, 5.4, 4.2, 6.6], [3.4, 11.0, 2.8, 14.6], [5.4, 15.1, 8, 15.1]]);
  clothBase(g, shape, col);
  withClip(g, shape, () => {
    fold(g, [[6.0, 7.6], [5.2, 11.0], [4.6, 15]], 0.55, col, 0.35);
    fold(g, [[9.6, 7.8], [10.6, 11.2], [11.2, 15]], 0.55, col, 0.4);
    stitch(g, [[4.4, 6.9], [8, 7.3], [11.6, 6.9]], rgba(dim(col, 0.4), 0.8));
    roundRect(g, 6.4, 9.4, 3.2, 2.6, 0.3, undefined, rgba(dim(col, 0.35), 0.8), 0.12);
    // flour and a singed hem
    for (let i = 0; i < 26; i++) ellipse(g, 4 + b.rng.next() * 8, 5 + b.rng.next() * 9, 0.3, 0.2, rgba('#ffffff', 0.35));
    for (let i = 0; i < 9; i++) ellipse(g, 3 + b.rng.next() * 10, 14.8 + b.rng.next() * 0.4, 0.8, 0.5, rgba('#3a2414', 0.55));
  });
}

function basket(g: G, b: B) {
  const wicker = '#b08a50';
  const cx = 8, top = 8.0;
  // handle arching over
  tube(g, arcPts(cx, top, 5.6, 6.2, Math.PI, Math.PI * 2, 24), 0.4, dim(wicker, 0.1), { hi: 0.45 });
  // loaves
  for (const [x, y, r] of [[5.4, 7.2, 2.3], [10.0, 6.8, 2.5], [7.8, 8.0, 2.4]]) {
    ellipse(g, x, y, r, r * 0.72, rad(g, x - r * 0.4, y - r * 0.4, 0.2, x, y, r, [[0, lit(P.bread3, 0.4)], [0.6, P.bread2], [1, dim(P.bread1, 0.3)]]));
    line(g, x - r * 0.5, y - 0.2, x + r * 0.4, y - 0.6, rgba(P.bread4, 0.8), 0.2);
  }
  const body = () => { g.beginPath(); g.moveTo(cx - 6.2, top); g.lineTo(cx - 5.0, 14.2); g.quadraticCurveTo(cx, 15.4, cx + 5.0, 14.2); g.lineTo(cx + 6.2, top); g.ellipse(cx, top, 6.2, 1.6, 0, 0, Math.PI); g.closePath(); };
  fillShape(g, body, lin(g, 1.8, 0, 14.2, 0, [[0, lit(wicker, 0.3)], [0.4, wicker], [1, dim(wicker, 0.5)]]));
  withClip(g, body, () => {
    for (let r = 0; r < 7; r++) {
      const y = top + 0.9 + r * 0.9;
      for (let k = 0; k < 14; k++) {
        const x = 1.6 + k * 1.0 + (r % 2) * 0.5;
        ellipse(g, x, y, 0.55, 0.36, (k + r) % 2 ? rgba(lit(wicker, 0.35), 0.55) : rgba(dim(wicker, 0.45), 0.55));
      }
    }
    shadeOver(g, 2, 8, 14, 15, 0.1, 0.35);
  });
  tube(g, arcPts(cx, top, 6.2, 1.6, 0, Math.PI, 20), 0.32, lit(wicker, 0.1), { hi: 0.45 });
}

function clapper(g: G, b: B) {
  const iron = b.c1 ?? P.metal1;
  frame(g, 12.8, 3.2, Math.PI * 0.75, () => {
    tube(g, arcPts(-0.9, 0, 1.0, 1.0, 0, Math.PI * 2, 16), 0.3, iron, { hi: 0.6, spec: 0.5 });
    tube(g, seg([0, 0], [9.0, 0], 10), seg([0, 0], [9.0, 0], 10).map(([x]) => 0.3 + x * 0.02), iron, { hi: 0.6, spec: 0.5 });
    orb(g, 10.6, 0, 2.1, iron, { hi: 0.65, lo: 0.55, spec: 0.75, ry: 1.8 });
    tube(g, seg([11.9, 0], [13.0, 0], 3), 0.7, iron, { hi: 0.6, spec: 0.5 });
  });
  sparkle(g, b, 4.6, 9.4, 0.8, 0.7);
}

// ================================================================ registry

const PAINTERS: Record<string, Painter> = {
  sword: swordIcon('sword'), longsword: swordIcon('longsword'), fathersword: swordIcon('father'), blade: swordIcon('blade'),
  dagger, axe, mace, hammer, spear, stick, bow, arrows,
  helmet, kettle, bascinet, coif, hood, cap,
  tunic: garment('tunic'), gambeson: garment('gambeson'), mail: garment('mail'), body: garment('body'), robe: garment('robe'), dress: garment('dress'), plate: cuirass,
  legs, gloves,
  bread, roll, apple: fruit, cheese, sausage, meat, fish, bowl, mug, bottle, potion, waterskin, honey,
  herb, mushroom, flower, wreath, wood: bark,
  pelt, bone, antlers, ingot, charcoal, ore, cloth: clothBolt, feather,
  bandage, lockpick, tool, torch, lantern, dice, ring, amulet, key, coin, purse, fox, drawing, seal, book, letter, scroll, shield,
  horseshoe, candle, wax: waxCake, swarm, shovel, whetstone, ribbon, apron, basket, clapper,
  box: parcel,
};
