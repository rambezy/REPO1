// Painted dialogue portraits, built from the same `Look` as the people in
// the world: a lit bust against a soft backdrop, with expressions that move
// the brows, lids and mouth (and bring tears, blushes and gritted teeth), a
// talking mouth and blinking.

import { SKIN, SkinTone } from './palette';
import type { Look } from './characters';
import { hashStr, clamp, RNG } from '../engine/util';
import { newCanvas, lit, dim, mix, rgba, lin, rad, ellipse, blade } from './paint';

export type Expr = 'neutral' | 'happy' | 'laugh' | 'sad' | 'cry' | 'angry' | 'surprised' | 'worried' | 'smirk' | 'pain' | 'tender' | 'sleep';
export const EXPRS: Expr[] = ['neutral', 'happy', 'laugh', 'sad', 'cry', 'angry', 'surprised', 'worried', 'smirk', 'pain', 'tender', 'sleep'];

const S = 256;
type G = CanvasRenderingContext2D;

interface Face {
  brow: [number, number]; // inner, outer raise (+ up) in units of R
  open: number;           // eye opening 0..1.3
  look: [number, number]; // iris offset
  mouth: 'line' | 'smile' | 'grin' | 'frown' | 'open' | 'o' | 'tight' | 'teeth' | 'smirk' | 'soft' | 'wobble';
  cheek: number;          // cheek raise 0..1
  tears?: boolean;
  sweat?: boolean;
  blush?: number;
}

const FACES: Record<Expr, Face> = {
  neutral: { brow: [0, 0], open: 1, look: [0, 0], mouth: 'line', cheek: 0 },
  happy: { brow: [0.03, 0.02], open: 0.82, look: [0, 0], mouth: 'smile', cheek: 0.6 },
  laugh: { brow: [0.05, 0.03], open: 0.15, look: [0, 0], mouth: 'grin', cheek: 1 },
  sad: { brow: [0.09, -0.04], open: 0.7, look: [0, 0.35], mouth: 'frown', cheek: 0 },
  cry: { brow: [0.12, -0.05], open: 0.45, look: [0, 0.3], mouth: 'wobble', cheek: 0.2, tears: true, blush: 0.3 },
  angry: { brow: [-0.1, 0.05], open: 0.85, look: [0, 0], mouth: 'tight', cheek: 0 },
  surprised: { brow: [0.12, 0.12], open: 1.3, look: [0, 0], mouth: 'o', cheek: 0 },
  worried: { brow: [0.1, -0.02], open: 1, look: [0.25, 0], mouth: 'wobble', cheek: 0, sweat: true },
  smirk: { brow: [0, 0.06], open: 0.8, look: [-0.25, 0], mouth: 'smirk', cheek: 0.3 },
  pain: { brow: [0.08, -0.06], open: 0.35, look: [0, 0], mouth: 'teeth', cheek: 0.4, sweat: true },
  tender: { brow: [0.05, 0], open: 0.7, look: [0, 0.15], mouth: 'soft', cheek: 0.4, blush: 0.35 },
  sleep: { brow: [0, 0], open: 0, look: [0, 0], mouth: 'soft', cheek: 0 },
};

function skinOf(look: Look) { return SKIN[look.skin as SkinTone] || SKIN.fair; }

// ================================================================ API

const cache = new Map<string, HTMLCanvasElement>();

export function getPortrait(key: string, look: Look, expr: Expr = 'neutral', talk = false, blink = false): HTMLCanvasElement {
  const k = `${key}|${expr}|${talk ? 1 : 0}|${blink ? 1 : 0}|${hashStr(JSON.stringify(look))}`;
  let c = cache.get(k);
  if (c) return c;
  c = newCanvas(S, S);
  const g = c.getContext('2d')!;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  if (key.includes('crumb')) paintDog(g, look, expr, talk, blink);
  else paintPortrait(g, look, expr, talk, blink, key);
  if (cache.size > 400) cache.clear();
  cache.set(k, c);
  return c;
}

export const PORTRAIT_SIZE = S;

// ================================================================ painting

export function paintPortrait(g: G, look: Look, expr: Expr, talk: boolean, blink: boolean, seedKey = '') {
  const rng = new RNG(hashStr(seedKey + JSON.stringify(look)));
  const child = look.build === 'child';
  const R = child ? 63 : 67;
  const cx = 128, cy = child ? 126 : 116;
  const sk = skinOf(look);
  const f = { ...FACES[expr] };
  if (blink && expr !== 'sleep') f.open = 0;
  const bg = look.portraitBg || '#5a5048';

  background(g, bg, rng);
  hairBehind(g, look, cx, cy, R);
  bust(g, look, cx, cy, R, sk, child);
  neck(g, cx, cy, R, sk);
  const hat = look.hat || 'none';
  if (hat === 'hood' || hat === 'monkhood' || hat === 'wimple' || hat === 'coif') hoodBehind(g, look, cx, cy, R);
  head(g, look, cx, cy, R, sk, f, talk, rng, expr);
  hairFront(g, look, cx, cy, R, rng);
  headwear(g, look, cx, cy, R, rng);
  // gentle key light from the upper left, rim of warm light
  g.save();
  g.globalCompositeOperation = 'soft-light';
  g.fillStyle = rad(g, cx - R * 1.2, cy - R * 1.4, 10, cx - R * 0.5, cy - R * 0.5, R * 3, [[0, 'rgba(255,240,210,0.55)'], [1, 'rgba(20,16,30,0.45)']]);
  g.fillRect(0, 0, S, S);
  g.restore();
  vignette(g);
  grainAll(g, rng);
}

function grainAll(g: G, rng: RNG) {
  const img = g.getImageData(0, 0, S, S);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * 7;
    d[i] = clamp(d[i] + n, 0, 255); d[i + 1] = clamp(d[i + 1] + n, 0, 255); d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  g.putImageData(img, 0, 0);
}

function background(g: G, bg: string, rng: RNG) {
  g.fillStyle = rad(g, 80, 60, 10, 128, 128, 210, [[0, lit(bg, 0.35)], [0.55, bg], [1, dim(bg, 0.55)]]);
  g.fillRect(0, 0, S, S);
  // painterly dabs
  for (let i = 0; i < 90; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 8 + rng.next() * 26;
    g.fillStyle = rgba(rng.next() < 0.5 ? lit(bg, 0.25) : dim(bg, 0.3), 0.08);
    g.beginPath(); g.ellipse(x, y, r, r * 0.6, rng.next() * 3, 0, Math.PI * 2); g.fill();
  }
}

function vignette(g: G) {
  g.fillStyle = rad(g, 128, 118, 90, 128, 128, 190, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(8,5,3,0.55)']]);
  g.fillRect(0, 0, S, S);
}

// ---------------------------------------------------------------- body

function clothAt(look: Look): { base: string; kind: string } {
  const o = look.outer || 'none';
  if (o === 'mail' || o === 'tabard') return { base: '#7c858e', kind: o };
  if (o === 'plate') return { base: '#a2acb6', kind: o };
  if (o === 'none' || o === 'apron' || o === 'vest') return { base: look.shirt, kind: o };
  return { base: look.outerColor || look.shirt, kind: o };
}

function mail(g: G, x: number, y: number, w: number, h: number, base: string) {
  g.fillStyle = lin(g, x, y, x + w, y + h, [[0, lit(base, 0.3)], [0.5, base], [1, dim(base, 0.45)]]);
  g.fillRect(x, y, w, h);
  g.strokeStyle = 'rgba(20,24,28,0.5)';
  g.lineWidth = 1;
  for (let yy = y + 3; yy < y + h; yy += 4.2) for (let xx = x + ((Math.round((yy - y) / 4.2) % 2) * 2.2); xx < x + w; xx += 4.4) { g.beginPath(); g.arc(xx, yy, 1.8, 0, Math.PI); g.stroke(); }
}

function bust(g: G, look: Look, cx: number, cy: number, R: number, sk: string[], child: boolean) {
  const { base, kind } = clothAt(look);
  const top = cy + R * 1.18;
  const sw = child ? R * 1.55 : look.build === 'broad' || look.build === 'fat' ? R * 2.1 : look.female ? R * 1.7 : R * 1.9;
  const shape = () => {
    g.beginPath();
    g.moveTo(cx - sw - 20, S + 5);
    g.bezierCurveTo(cx - sw - 6, top + 50, cx - sw * 0.9, top + 8, cx - R * 0.5, top);
    g.lineTo(cx + R * 0.5, top);
    g.bezierCurveTo(cx + sw * 0.9, top + 8, cx + sw + 6, top + 50, cx + sw + 20, S + 5);
    g.closePath();
  };
  // cape over the shoulders
  if (look.cape) {
    g.fillStyle = lin(g, cx - sw, 0, cx + sw, 0, [[0, lit(look.cape, 0.2)], [1, dim(look.cape, 0.45)]]);
    g.beginPath(); g.moveTo(cx - sw - 28, S + 5); g.bezierCurveTo(cx - sw - 10, top + 30, cx - sw * 0.8, top - 2, cx, top - 4); g.bezierCurveTo(cx + sw * 0.8, top - 2, cx + sw + 10, top + 30, cx + sw + 28, S + 5); g.closePath(); g.fill();
  }
  shape();
  g.fillStyle = lin(g, cx - sw, top, cx + sw, S, [[0, lit(base, 0.25)], [0.5, base], [1, dim(base, 0.45)]]);
  g.fill();
  g.save();
  shape();
  g.clip();
  if (kind === 'mail' || kind === 'tabard') mail(g, cx - sw - 20, top - 5, sw * 2 + 40, S - top + 10, base);
  if (kind === 'tabard') {
    const tc = look.outerColor || '#3e6b3a';
    g.fillStyle = lin(g, cx - R, 0, cx + R, 0, [[0, lit(tc, 0.2)], [1, dim(tc, 0.35)]]);
    g.fillRect(cx - R * 1.05, top + 18, R * 2.1, S);
    g.fillStyle = look.trim || '#c79a2c';
    g.fillRect(cx - 7, top + 32, 14, S);
    g.fillRect(cx - 30, top + 48, 60, 12);
  }
  if (kind === 'plate') {
    g.fillStyle = lin(g, cx - sw, top, cx + sw * 0.6, S, [[0, '#f4f8fa'], [0.3, '#b8c2cc'], [0.65, '#7a848e'], [1, '#3e464e']]);
    g.beginPath(); g.moveTo(cx - sw * 0.85, S + 5); g.quadraticCurveTo(cx - sw * 0.8, top + 16, cx, top + 12); g.quadraticCurveTo(cx + sw * 0.8, top + 16, cx + sw * 0.85, S + 5); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2.2;
    g.beginPath(); g.moveTo(cx - sw * 0.5, top + 30); g.quadraticCurveTo(cx - sw * 0.55, top + 60, cx - sw * 0.45, S); g.stroke();
    for (const s of [-1, 1]) { g.fillStyle = lin(g, cx + s * sw, top, cx + s * sw * 0.6, top + 40, [[0, '#d8e0e6'], [1, '#6f7882']]); g.beginPath(); g.ellipse(cx + s * sw * 0.85, top + 22, sw * 0.32, 22, s * 0.3, 0, Math.PI * 2); g.fill(); }
  }
  if (kind === 'gambeson' || kind === 'brigandine') {
    g.strokeStyle = rgba(dim(base, 0.45), 0.6); g.lineWidth = 1.4;
    for (let x = cx - sw; x < cx + sw; x += 11) { g.beginPath(); g.moveTo(x, top); g.lineTo(x + 3, S); g.stroke(); }
    if (kind === 'brigandine') for (let y = top + 16; y < S; y += 11) for (let x = cx - sw + 6; x < cx + sw; x += 11) ellipse(g, x, y, 1.6, 1.6, '#c8b880');
  }
  if (kind === 'leather') {
    g.strokeStyle = 'rgba(20,12,6,0.6)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(cx, top + 8); g.lineTo(cx, S); g.stroke();
    for (let y = top + 18; y < S; y += 14) ellipse(g, cx + 5, y, 2.4, 2.4, '#c8a060');
  }
  if (kind === 'noble') {
    g.fillStyle = look.trim || '#c79a2c';
    g.fillRect(cx - 3, top + 6, 6, S);
    for (let y = top + 16; y < S; y += 12) { ellipse(g, cx - 9, y, 3, 3, lit(look.trim || '#c79a2c', 0.3)); ellipse(g, cx + 9, y, 3, 3, lit(look.trim || '#c79a2c', 0.3)); }
    g.strokeStyle = look.trim || '#c79a2c'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx - R * 0.6, top + 2); g.quadraticCurveTo(cx, top + 22, cx + R * 0.6, top + 2); g.stroke();
  }
  if (kind === 'dress') {
    const sh = look.shirt;
    g.fillStyle = lin(g, 0, top, 0, top + 40, [[0, lit(sh, 0.2)], [1, dim(sh, 0.2)]]);
    g.beginPath(); g.moveTo(cx - R * 0.8, top - 2); g.quadraticCurveTo(cx, top + 48, cx + R * 0.8, top - 2); g.closePath(); g.fill();
    g.strokeStyle = rgba(dim(base, 0.5), 0.9); g.lineWidth = 1.3;
    for (let y = top + 30; y < S; y += 9) { g.beginPath(); g.moveTo(cx - 6, y); g.lineTo(cx + 6, y + 5); g.moveTo(cx + 6, y); g.lineTo(cx - 6, y + 5); g.stroke(); }
  }
  if (kind === 'apron' || look.apronColor) {
    const ac = look.apronColor || '#6b4526';
    g.strokeStyle = dim(ac, 0.1); g.lineWidth = 6;
    g.beginPath(); g.moveTo(cx - R * 0.95, top + 10); g.lineTo(cx - R * 0.55, S); g.moveTo(cx + R * 0.95, top + 10); g.lineTo(cx + R * 0.55, S); g.stroke();
    if (kind === 'apron') { g.fillStyle = lin(g, 0, top + 40, 0, S, [[0, lit(ac, 0.15)], [1, dim(ac, 0.25)]]); g.fillRect(cx - R * 0.8, top + 44, R * 1.6, S); }
  }
  if (kind === 'vest') {
    g.fillStyle = lin(g, cx - sw, 0, cx + sw, 0, [[0, lit(look.outerColor || '#6b4a30', 0.2)], [1, dim(look.outerColor || '#6b4a30', 0.4)]]);
    g.beginPath(); g.moveTo(cx - sw - 20, S); g.bezierCurveTo(cx - sw, top + 40, cx - sw * 0.8, top + 6, cx - R * 0.45, top + 2); g.lineTo(cx - 12, S); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(cx + sw + 20, S); g.bezierCurveTo(cx + sw, top + 40, cx + sw * 0.8, top + 6, cx + R * 0.45, top + 2); g.lineTo(cx + 12, S); g.closePath(); g.fill();
  }
  if (kind === 'robe') {
    g.strokeStyle = rgba(dim(base, 0.5), 0.6); g.lineWidth = 2.5;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * R * 0.4, top + 4); g.quadraticCurveTo(cx + s * R * 0.9, top + 40, cx + s * R * 0.7, S); g.stroke(); }
  }
  // folds and shoulder shading
  g.strokeStyle = rgba(dim(base, 0.5), 0.3); g.lineWidth = 2;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * sw * 0.55, top + 14); g.quadraticCurveTo(cx + s * sw * 0.62, top + 50, cx + s * sw * 0.5, S); g.stroke(); }
  g.fillStyle = rad(g, cx, top - 10, 10, cx, top, R * 1.3, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(0, top - 10, S, 60);
  g.restore();
  // neckline
  if (kind === 'none' || kind === 'apron' || kind === 'vest' || kind === 'leather' || kind === 'gambeson') {
    g.fillStyle = dim(look.shirt, 0.35);
    g.beginPath(); g.moveTo(cx - R * 0.42, top + 1); g.quadraticCurveTo(cx, top + 26, cx + R * 0.42, top + 1); g.quadraticCurveTo(cx, top + 14, cx - R * 0.42, top + 1); g.fill();
  }
  void sk;
}

function neck(g: G, cx: number, cy: number, R: number, sk: string[]) {
  const top = cy + R * 0.7, bot = cy + R * 1.3;
  g.fillStyle = lin(g, cx - R * 0.35, 0, cx + R * 0.35, 0, [[0, sk[2]], [0.55, sk[2]], [1, sk[1]]]);
  g.beginPath(); g.moveTo(cx - R * 0.33, top); g.lineTo(cx - R * 0.38, bot); g.quadraticCurveTo(cx, bot + 10, cx + R * 0.38, bot); g.lineTo(cx + R * 0.33, top); g.closePath(); g.fill();
  // shadow under the jaw
  g.fillStyle = lin(g, 0, top, 0, top + R * 0.35, [[0, rgba(sk[0], 0.7)], [1, rgba(sk[0], 0)]]);
  g.fillRect(cx - R * 0.4, top, R * 0.8, R * 0.35);
}

// ---------------------------------------------------------------- head

function faceShape(g: G, look: Look, cx: number, cy: number, R: number) {
  const jaw = look.face?.jaw || 'round';
  const jw = jaw === 'square' ? 0.8 : jaw === 'heavy' ? 0.9 : jaw === 'narrow' ? 0.56 : 0.68;
  const chin = jaw === 'heavy' ? 1.1 : jaw === 'narrow' ? 1.14 : 1.1;
  const cheekW = look.build === 'fat' ? 1.02 : 0.93;
  g.beginPath();
  g.moveTo(cx, cy - R * 1.02);
  g.bezierCurveTo(cx + R * 0.72, cy - R * 1.02, cx + R * cheekW, cy - R * 0.6, cx + R * cheekW, cy - R * 0.02);
  g.bezierCurveTo(cx + R * cheekW, cy + R * 0.45, cx + R * jw, cy + R * 0.78, cx + R * jw * 0.62, cy + R * 0.95);
  g.quadraticCurveTo(cx + R * 0.2, cy + R * chin, cx, cy + R * chin);
  g.quadraticCurveTo(cx - R * 0.2, cy + R * chin, cx - R * jw * 0.62, cy + R * 0.95);
  g.bezierCurveTo(cx - R * jw, cy + R * 0.78, cx - R * cheekW, cy + R * 0.45, cx - R * cheekW, cy - R * 0.02);
  g.bezierCurveTo(cx - R * cheekW, cy - R * 0.6, cx - R * 0.72, cy - R * 1.02, cx, cy - R * 1.02);
  g.closePath();
}

function head(g: G, look: Look, cx: number, cy: number, R: number, sk: string[], f: Face, talk: boolean, rng: RNG, expr: Expr) {
  const hat = look.hat || 'none';
  const helmClosed = hat === 'sallet';
  // ears
  if (!(hat === 'hood' || hat === 'monkhood' || hat === 'wimple' || hat === 'coif' || hat === 'bascinet' || helmClosed)) {
    for (const s of [-1, 1]) {
      g.fillStyle = lin(g, cx + s * R * 0.9, 0, cx + s * R * 1.12, 0, [[0, sk[1]], [1, sk[2]]]);
      g.beginPath(); g.ellipse(cx + s * R * 0.94, cy + R * 0.12, R * 0.15, R * 0.24, s * 0.15, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(sk[0], 0.6); g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(cx + s * R * 0.95, cy + R * 0.12, R * 0.08, R * 0.14, s * 0.15, s < 0 ? -1.2 : Math.PI - 1.9, s < 0 ? 1.9 : Math.PI + 1.2); g.stroke();
      if (look.face?.earrings) ellipse(g, cx + s * R * 0.96, cy + R * 0.36, 2.4, 2.4, '#e8c55a');
    }
  }
  // skin with soft shading and a painted outline
  faceShape(g, look, cx, cy, R);
  g.fillStyle = rad(g, cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R * 1.25, [[0, lit(sk[3], 0.18)], [0.45, sk[2]], [0.85, mix(sk[2], sk[1], 0.6)], [1, sk[1]]]);
  g.fill();
  g.strokeStyle = rgba(dim(sk[0], 0.5), 0.6);
  g.lineWidth = 2;
  g.stroke();
  g.save();
  faceShape(g, look, cx, cy, R);
  g.clip();
  // side and jaw shade, warm cheeks
  g.fillStyle = lin(g, cx + R * 0.2, 0, cx + R, 0, [[0, 'rgba(0,0,0,0)'], [1, rgba(sk[0], 0.45)]]);
  g.fillRect(cx, cy - R * 1.2, R * 1.2, R * 2.4);
  g.fillStyle = lin(g, 0, cy + R * 0.6, 0, cy + R * 1.15, [[0, 'rgba(0,0,0,0)'], [1, rgba(sk[0], 0.3)]]);
  g.fillRect(cx - R, cy + R * 0.6, R * 2, R * 0.6);
  const blush = (look.face?.cheeks || look.female || look.build === 'child' ? 0.22 : 0.1) + (f.blush ?? 0) + f.cheek * 0.08;
  for (const s of [-1, 1]) {
    g.fillStyle = rad(g, cx + s * R * 0.5, cy + R * (0.45 - f.cheek * 0.06), 1, cx + s * R * 0.5, cy + R * (0.45 - f.cheek * 0.06), R * 0.3, [[0, rgba('#e0605a', blush)], [1, 'rgba(224,96,90,0)']]);
    g.fillRect(cx + s * R * 0.5 - R * 0.35, cy, R * 0.7, R);
  }
  // cheekbone light and temple shade
  g.fillStyle = rad(g, cx - R * 0.45, cy + R * 0.22, 1, cx - R * 0.45, cy + R * 0.22, R * 0.35, [[0, rgba(lit(sk[3], 0.4), 0.35)], [1, 'rgba(255,255,255,0)']]);
  g.fillRect(cx - R, cy - R * 0.2, R, R);
  for (const s2 of [-1, 1]) {
    g.fillStyle = rad(g, cx + s2 * R * 0.95, cy - R * 0.3, 1, cx + s2 * R * 0.95, cy - R * 0.3, R * 0.4, [[0, rgba(sk[0], 0.3)], [1, rgba(sk[0], 0)]]);
    g.fillRect(cx + s2 * R * 0.95 - R * 0.5, cy - R * 0.8, R, R);
  }
  // wrinkles and age
  const wr = look.face?.wrinkles ?? (look.old ? 2 : 0);
  g.strokeStyle = rgba(sk[0], 0.35); g.lineWidth = 1.2;
  if (wr >= 1) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * R * 0.3, cy + R * 0.45); g.quadraticCurveTo(cx + s * R * 0.44, cy + R * 0.65, cx + s * R * 0.36, cy + R * 0.82); g.stroke(); }
  if (wr >= 2) for (let k = 0; k < wr; k++) { g.beginPath(); g.moveTo(cx - R * 0.4, cy - R * (0.45 + k * 0.1)); g.quadraticCurveTo(cx, cy - R * (0.5 + k * 0.1), cx + R * 0.4, cy - R * (0.45 + k * 0.1)); g.stroke(); }
  if (wr >= 2) for (const s of [-1, 1]) for (let k = 0; k < 2; k++) { g.beginPath(); g.moveTo(cx + s * R * 0.64, cy + R * (0.06 + k * 0.08)); g.lineTo(cx + s * R * 0.76, cy + R * (0.02 + k * 0.1)); g.stroke(); }
  if (look.freckles) {
    for (let k = 0; k < 26; k++) {
      const s = rng.next() < 0.5 ? -1 : 1;
      ellipse(g, cx + s * R * (0.12 + rng.next() * 0.5), cy + R * (0.2 + rng.next() * 0.35), 1 + rng.next() * 0.8, 0.9, rgba('#9a5a34', 0.55));
    }
  }
  g.restore();

  if (!helmClosed) {
    eyes(g, look, cx, cy, R, sk, f, expr);
    nose(g, look, cx, cy, R, sk);
    mouth(g, look, cx, cy, R, sk, f, talk);
  }
  // tears and sweat
  if (f.tears) {
    for (const s of [-1, 1]) {
      const x = cx + s * R * 0.34, y = cy + R * 0.2;
      g.fillStyle = lin(g, 0, y, 0, y + R * 0.7, [[0, 'rgba(200,230,255,0.9)'], [1, 'rgba(200,230,255,0.2)']]);
      g.beginPath(); g.moveTo(x - 2, y); g.quadraticCurveTo(x - 3.5, y + R * 0.4, x - 1, y + R * 0.66); g.quadraticCurveTo(x + 1.5, y + R * 0.4, x + 2, y); g.fill();
      ellipse(g, x - 0.5, y + R * 0.2, 1, 3, 'rgba(255,255,255,0.8)');
    }
  }
  if (f.sweat) {
    const x = cx + R * 0.78, y = cy - R * 0.45;
    g.fillStyle = rad(g, x - 1, y - 1, 0.5, x, y, 5, [[0, '#ffffff'], [1, '#a8d0f0']]);
    g.beginPath(); g.moveTo(x, y - 7); g.quadraticCurveTo(x + 5, y + 2, x, y + 4); g.quadraticCurveTo(x - 5, y + 2, x, y - 7); g.fill();
  }
  if (look.scar) {
    g.strokeStyle = rgba('#e8b0a0', 0.95); g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx + R * 0.28, cy - R * 0.4); g.quadraticCurveTo(cx + R * 0.42, cy + R * 0.05, cx + R * 0.34, cy + R * 0.55); g.stroke();
    g.strokeStyle = rgba('#8a3a2a', 0.55); g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx + R * 0.3, cy - R * 0.4); g.quadraticCurveTo(cx + R * 0.44, cy + R * 0.05, cx + R * 0.36, cy + R * 0.55); g.stroke();
    for (let k = 0; k < 4; k++) { const t = 0.15 + k * 0.22; const x = cx + R * (0.3 + t * 0.1), y = cy - R * 0.4 + t * R * 0.95; g.beginPath(); g.moveTo(x - 3, y); g.lineTo(x + 3, y + 1); g.stroke(); }
  }
  beard(g, look, cx, cy, R, f, talk);
}

function eyes(g: G, look: Look, cx: number, cy: number, R: number, sk: string[], f: Face, expr: Expr) {
  const face = look.face || {};
  const shape = face.eyeShape || 'round';
  const ew = R * (shape === 'wide' ? 0.2 : shape === 'narrow' ? 0.19 : 0.185) * (look.build === 'child' ? 1.12 : 1);
  const eh0 = R * (shape === 'narrow' ? 0.09 : shape === 'sleepy' ? 0.085 : shape === 'wide' ? 0.125 : 0.11) * (look.build === 'child' ? 1.25 : 1);
  const ey = cy + R * 0.1;
  const iris = look.eyes || '#4a3322';
  const open = clamp(f.open * (shape === 'sleepy' ? 0.8 : 1), 0, 1.35);
  for (const s of [-1, 1]) {
    const ex = cx + s * R * 0.37;
    // brow
    const bt = face.brows === 'bushy' ? 4.2 : face.brows === 'thick' ? 3.4 : face.brows === 'thin' ? 1.8 : 2.6;
    const inner = f.brow[0] * R, outer = f.brow[1] * R;
    g.strokeStyle = dim(look.beardColor && look.hairStyle === 'bald' ? look.beardColor : look.hair, 0.25);
    g.lineWidth = bt;
    g.beginPath();
    g.moveTo(ex - s * ew * 1.05, ey - R * 0.2 - inner);
    g.quadraticCurveTo(ex + s * ew * 0.2, ey - R * 0.3 - (inner + outer) * 0.6, ex + s * ew * 1.25, ey - R * 0.2 - outer);
    g.stroke();
    if (face.brows === 'bushy') { g.lineWidth = 1; for (let k = 0; k < 6; k++) { const t = k / 5; const x = ex - s * ew + s * t * ew * 2.2; g.beginPath(); g.moveTo(x, ey - R * 0.2 - inner * (1 - t) - outer * t); g.lineTo(x + s * 2, ey - R * 0.26 - inner * (1 - t) - outer * t); g.stroke(); } }
    // eye socket shade
    g.fillStyle = rad(g, ex, ey - 1, 1, ex, ey, ew * 1.8, [[0, rgba(sk[0], 0.28)], [1, rgba(sk[0], 0)]]);
    g.beginPath(); g.ellipse(ex, ey, ew * 1.8, ew * 1.3, 0, 0, Math.PI * 2); g.fill();
    if (look.eyepatch && s < 0) {
      g.fillStyle = lin(g, ex - ew, ey - ew, ex + ew, ey + ew, [[0, '#3a302a'], [1, '#0e0a08']]);
      g.beginPath(); g.ellipse(ex, ey + 1, ew * 1.35, ew * 1.1, 0.1, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1a120e'; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(ex - ew * 1.2, ey - 3); g.lineTo(cx + R * 0.9, cy - R * 0.55); g.moveTo(ex + ew * 1.2, ey - 2); g.lineTo(cx - R * 0.95, cy - R * 0.2); g.stroke();
      continue;
    }
    const eh = eh0 * open;
    if (open < 0.12) {
      // closed: a soft curved lash line (smiling lids for laughter)
      g.strokeStyle = dim(sk[0], 0.35); g.lineWidth = 1.8;
      g.beginPath();
      if (expr === 'laugh' || expr === 'happy') { g.moveTo(ex - ew, ey + 1); g.quadraticCurveTo(ex, ey - eh0 * 1.2, ex + ew, ey + 1); }
      else { g.moveTo(ex - ew, ey); g.quadraticCurveTo(ex, ey + eh0 * 0.9, ex + ew, ey); }
      g.stroke();
      continue;
    }
    // white, iris, pupil, glint
    g.save();
    g.beginPath();
    g.moveTo(ex - ew, ey);
    g.quadraticCurveTo(ex, ey - eh * 1.9, ex + ew, ey);
    g.quadraticCurveTo(ex, ey + eh * 1.3, ex - ew, ey);
    g.closePath();
    g.fillStyle = '#f6f1e8';
    g.fill();
    g.clip();
    const ix = ex + f.look[0] * ew * 0.6, iy = ey + f.look[1] * eh * 0.6;
    const ir = Math.min(ew * 0.55, eh0 * 1.25);
    g.fillStyle = rad(g, ix - ir * 0.3, iy - ir * 0.4, 0.5, ix, iy, ir, [[0, lit(iris, 0.45)], [0.6, iris], [1, dim(iris, 0.5)]]);
    g.beginPath(); g.arc(ix, iy, ir, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#120c08';
    g.beginPath(); g.arc(ix, iy, ir * 0.48, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(ex - ew, ey - eh * 2, ew * 2, eh * 0.9);
    g.restore();
    ellipse(g, ix - ir * 0.35, iy - ir * 0.4, ir * 0.28, ir * 0.24, 'rgba(255,255,255,0.95)');
    // lids and lashes
    g.strokeStyle = dim(sk[0], 0.5); g.lineWidth = look.female ? 2.4 : 1.8;
    g.beginPath(); g.moveTo(ex - ew * 1.05, ey + 0.5); g.quadraticCurveTo(ex, ey - eh * 1.95, ex + ew * 1.08, ey - 0.5); g.stroke();
    if (look.female) { g.lineWidth = 1.3; g.beginPath(); g.moveTo(ex + s * ew * 0.95, ey - eh * 0.3); g.lineTo(ex + s * ew * 1.35, ey - eh * 0.9); g.stroke(); }
    g.strokeStyle = rgba(sk[0], 0.5); g.lineWidth = 1;
    g.beginPath(); g.moveTo(ex - ew * 0.8, ey + eh * 0.9); g.quadraticCurveTo(ex, ey + eh * 1.5, ex + ew * 0.8, ey + eh * 0.9); g.stroke();
    if (shape === 'sleepy') { g.fillStyle = sk[2]; g.beginPath(); g.moveTo(ex - ew * 1.1, ey - eh * 0.3); g.quadraticCurveTo(ex, ey - eh * 2.2, ex + ew * 1.1, ey - eh * 0.3); g.quadraticCurveTo(ex, ey - eh * 1.1, ex - ew * 1.1, ey - eh * 0.3); g.fill(); }
  }
}

function nose(g: G, look: Look, cx: number, cy: number, R: number, sk: string[]) {
  const n = look.face?.nose || 'small';
  const len = R * (n === 'long' || n === 'hooked' ? 0.48 : n === 'button' ? 0.3 : 0.38) * (look.build === 'child' ? 0.8 : 1);
  const w = R * (n === 'broad' ? 0.2 : n === 'button' ? 0.13 : 0.15);
  const top = cy + R * 0.08, tip = top + len;
  // bridge light and side shadow
  g.fillStyle = lin(g, cx - w, 0, cx + w * 1.4, 0, [[0, rgba(lit(sk[3], 0.3), 0.5)], [0.4, 'rgba(0,0,0,0)'], [1, rgba(sk[0], 0.35)]]);
  g.beginPath(); g.moveTo(cx - w * 0.3, top); g.lineTo(cx + w * 0.4, top); g.lineTo(cx + w * 1.2, tip); g.lineTo(cx - w * 1.1, tip); g.closePath(); g.fill();
  if (n === 'hooked') { g.strokeStyle = rgba(sk[0], 0.5); g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx + w * 0.3, top + len * 0.3); g.quadraticCurveTo(cx + w * 0.9, top + len * 0.45, cx + w * 0.4, tip - 1); g.stroke(); }
  // tip and nostrils
  g.fillStyle = rad(g, cx - w * 0.3, tip - w * 0.5, 0.5, cx, tip - w * 0.2, w * 1.2, [[0, lit(sk[2], 0.2)], [1, sk[2]]]);
  g.beginPath(); g.ellipse(cx, tip - w * 0.25, w * 0.95, w * 0.75, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = rgba(sk[0], 0.7);
  for (const s of [-1, 1]) { g.beginPath(); g.ellipse(cx + s * w * 0.62, tip + w * 0.12, w * 0.32, w * 0.2, s * 0.3, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = rgba(sk[0], 0.3);
  g.beginPath(); g.ellipse(cx + w * 0.2, tip + w * 0.55, w * 1.1, w * 0.25, 0, 0, Math.PI * 2); g.fill();
}

function mouth(g: G, look: Look, cx: number, cy: number, R: number, sk: string[], f: Face, talk: boolean) {
  const face = look.face || {};
  const mw = R * (face.mouth === 'wide' ? 0.3 : face.mouth === 'small' ? 0.19 : 0.25) * (look.build === 'child' ? 0.85 : 1);
  const my = cy + R * 0.7;
  const lip = mix(sk[1], '#b04a44', 0.45), lipD = dim(lip, 0.35);
  let kind = f.mouth;
  if (talk) kind = kind === 'grin' ? 'grin' : kind === 'o' ? 'o' : kind === 'teeth' ? 'teeth' : 'open';
  const open = (o: number, curve: number) => {
    g.fillStyle = '#3a1612';
    g.beginPath();
    g.moveTo(cx - mw, my - curve);
    g.quadraticCurveTo(cx, my - curve * 0.2 - o * 0.25, cx + mw, my - curve);
    g.quadraticCurveTo(cx, my + o + curve * 0.5, cx - mw, my - curve);
    g.fill();
    // teeth and tongue
    g.save(); g.clip();
    g.fillStyle = '#f2ece0';
    g.fillRect(cx - mw, my - curve - 2, mw * 2, o * 0.42 + 1);
    g.fillStyle = '#b8565a';
    g.beginPath(); g.ellipse(cx, my + o * 0.9, mw * 0.6, o * 0.45, 0, 0, Math.PI * 2); g.fill();
    g.restore();
    g.strokeStyle = lipD; g.lineWidth = 1.6;
    g.beginPath(); g.moveTo(cx - mw, my - curve); g.quadraticCurveTo(cx, my + o + curve * 0.5, cx + mw, my - curve); g.stroke();
  };
  g.lineCap = 'round';
  switch (kind) {
    case 'line': case 'soft': {
      const c = kind === 'soft' ? 2.2 : 0.8;
      g.strokeStyle = lipD; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - mw, my - c * 0.4); g.quadraticCurveTo(cx, my + c, cx + mw, my - c * 0.4); g.stroke();
      g.fillStyle = rgba(lip, 0.8);
      g.beginPath(); g.ellipse(cx, my + 4, mw * 0.55, 2.4, 0, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'smile': {
      g.strokeStyle = lipD; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(cx - mw * 1.1, my - 4); g.quadraticCurveTo(cx, my + 7, cx + mw * 1.1, my - 4); g.stroke();
      g.lineWidth = 1.2;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * mw * 1.1, my - 4); g.lineTo(cx + s * mw * 1.25, my - 6); g.stroke(); }
      g.fillStyle = rgba(lip, 0.7);
      g.beginPath(); g.ellipse(cx, my + 6.5, mw * 0.5, 2, 0, 0, Math.PI * 2); g.fill();
      break;
    }
    case 'grin': open(R * 0.2, 5); break;
    case 'open': open(R * 0.1, 1); break;
    case 'o':
      g.fillStyle = '#3a1612';
      g.beginPath(); g.ellipse(cx, my + 2, mw * 0.45, R * 0.12, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = lipD; g.lineWidth = 2; g.stroke();
      break;
    case 'frown': case 'wobble': {
      g.strokeStyle = lipD; g.lineWidth = 2.2;
      g.beginPath();
      if (kind === 'frown') { g.moveTo(cx - mw, my + 4); g.quadraticCurveTo(cx, my - 4, cx + mw, my + 4); }
      else { g.moveTo(cx - mw, my + 2); g.bezierCurveTo(cx - mw * 0.4, my - 3, cx + mw * 0.3, my + 4, cx + mw, my + 1); }
      g.stroke();
      break;
    }
    case 'tight':
      g.strokeStyle = lipD; g.lineWidth = 2.6;
      g.beginPath(); g.moveTo(cx - mw * 0.9, my + 2); g.lineTo(cx + mw * 0.9, my + 2); g.stroke();
      g.lineWidth = 1.2;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(cx + s * mw * 0.9, my + 2); g.lineTo(cx + s * mw * 1.05, my + 4.5); g.stroke(); }
      break;
    case 'teeth':
      g.fillStyle = '#f2ece0';
      g.fillRect(cx - mw, my - 3, mw * 2, 7);
      g.strokeStyle = 'rgba(80,40,30,0.8)'; g.lineWidth = 1;
      g.strokeRect(cx - mw, my - 3, mw * 2, 7);
      g.beginPath(); g.moveTo(cx - mw, my + 0.5); g.lineTo(cx + mw, my + 0.5); g.stroke();
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(cx + k * mw * 0.35, my - 3); g.lineTo(cx + k * mw * 0.35, my + 4); g.stroke(); }
      break;
    case 'smirk':
      g.strokeStyle = lipD; g.lineWidth = 2.2;
      g.beginPath(); g.moveTo(cx - mw, my + 1); g.quadraticCurveTo(cx + mw * 0.2, my + 3, cx + mw * 1.1, my - 5); g.stroke();
      break;
  }
}

function beard(g: G, look: Look, cx: number, cy: number, R: number, f: Face, talk: boolean) {
  const b = look.beard || 'none';
  if (b === 'none' || look.hat === 'sallet') return;
  const bc = look.beardColor || look.hair;
  const my = cy + R * 0.7;
  const fill = lin(g, cx - R, cy, cx + R, cy + R * 1.4, [[0, lit(bc, 0.25)], [0.5, bc], [1, dim(bc, 0.4)]]);
  const strands = (x0: number, y0: number, x1: number, y1: number, n: number) => {
    g.lineWidth = 1.2;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      g.strokeStyle = rgba(k % 3 === 0 ? lit(bc, 0.4) : dim(bc, 0.35), 0.55);
      const x = x0 + (x1 - x0) * t;
      g.beginPath(); g.moveTo(x, y0 + Math.abs(t - 0.5) * 10); g.quadraticCurveTo(x + (t - 0.5) * 6, (y0 + y1) / 2, x + (t - 0.5) * 10, y1 - Math.abs(t - 0.5) * 16); g.stroke();
    }
  };
  if (b === 'stubble') {
    g.save(); faceShape(g, look, cx, cy, R); g.clip();
    g.fillStyle = rgba(dim(bc, 0.15), 0.3);
    g.beginPath(); g.ellipse(cx, cy + R * 0.82, R * 0.8, R * 0.45, 0, 0, Math.PI * 2); g.fill();
    for (let k = 0; k < 160; k++) { const a = Math.random() * Math.PI, d = Math.random(); ellipse(g, cx + Math.cos(a) * R * 0.75 * d * 1.1, cy + R * 0.55 + Math.sin(a) * R * 0.5 * d, 0.7, 0.7, rgba(dim(bc, 0.3), 0.45)); }
    g.restore();
    return;
  }
  // moustache
  if (b !== 'goatee' || true) {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(cx, my - R * 0.1);
    g.bezierCurveTo(cx - R * 0.2, my - R * 0.2, cx - R * 0.42, my - R * 0.08, cx - R * 0.46, my + R * 0.1);
    g.quadraticCurveTo(cx - R * 0.3, my + R * 0.02, cx, my + (talk ? -R * 0.04 : R * 0.01));
    g.quadraticCurveTo(cx + R * 0.3, my + R * 0.02, cx + R * 0.46, my + R * 0.1);
    g.bezierCurveTo(cx + R * 0.42, my - R * 0.08, cx + R * 0.2, my - R * 0.2, cx, my - R * 0.1);
    g.fill();
  }
  if (b === 'moustache') return;
  const len = b === 'goatee' ? 0.3 : b === 'short' ? 0.25 : b === 'full' ? 0.5 : 1.1;
  g.fillStyle = fill;
  g.beginPath();
  if (b === 'goatee') {
    g.moveTo(cx - R * 0.22, my + R * 0.12);
    g.quadraticCurveTo(cx - R * 0.2, my + R * 0.6, cx, my + R * 0.66);
    g.quadraticCurveTo(cx + R * 0.2, my + R * 0.6, cx + R * 0.22, my + R * 0.12);
    g.quadraticCurveTo(cx, my + R * 0.2, cx - R * 0.22, my + R * 0.12);
  } else {
    g.moveTo(cx - R * 0.92, cy + R * 0.1);
    g.bezierCurveTo(cx - R * 0.96, cy + R * (0.9 + len * 0.4), cx - R * 0.5, cy + R * (1.1 + len), cx, cy + R * (1.18 + len));
    g.bezierCurveTo(cx + R * 0.5, cy + R * (1.1 + len), cx + R * 0.96, cy + R * (0.9 + len * 0.4), cx + R * 0.92, cy + R * 0.1);
    g.lineTo(cx + R * 0.84, cy + R * 0.12);
    g.quadraticCurveTo(cx + R * 0.72, my + R * 0.05, cx + R * 0.34, my + R * 0.12);
    g.quadraticCurveTo(cx, my + R * (f.mouth === 'grin' || talk ? 0.3 : 0.2), cx - R * 0.34, my + R * 0.12);
    g.quadraticCurveTo(cx - R * 0.72, my + R * 0.05, cx - R * 0.84, cy + R * 0.12);
    g.closePath();
  }
  g.fill();
  strands(cx - R * 0.8, cy + R * 0.5, cx + R * 0.8, cy + R * (1.15 + len), b === 'goatee' ? 5 : 16);
}

// ---------------------------------------------------------------- hair

function hairFill(g: G, look: Look, cx: number, cy: number, R: number) {
  const h = look.hair;
  return lin(g, cx - R, cy - R * 1.2, cx + R * 0.8, cy + R * 0.6, [[0, lit(h, 0.35)], [0.35, h], [1, dim(h, 0.45)]]);
}

function strandLines(g: G, look: Look, pts: [number, number, number, number][], rng: RNG) {
  const h = look.hair;
  for (const [x0, y0, x1, y1] of pts) {
    g.strokeStyle = rgba(rng.next() < 0.6 ? dim(h, 0.4) : lit(h, 0.45), 0.5);
    g.lineWidth = 1 + rng.next() * 0.8;
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2 + (rng.next() - 0.5) * 8, (y0 + y1) / 2, x1, y1); g.stroke();
  }
}

function hairBehind(g: G, look: Look, cx: number, cy: number, R: number) {
  const st = look.hairStyle;
  const hat = look.hat || 'none';
  if (hat === 'hood' || hat === 'monkhood' || hat === 'wimple' || hat === 'coif' || hat === 'bascinet' || hat === 'sallet') return;
  if (st === 'long' || st === 'braids' || st === 'ponytail' || st === 'curly' || st === 'bun') {
    const L = st === 'long' ? R * 2.2 : st === 'curly' ? R * 1.3 : R * 1.05;
    g.fillStyle = lin(g, cx - R, 0, cx + R, 0, [[0, dim(look.hair, 0.15)], [1, dim(look.hair, 0.55)]]);
    g.beginPath();
    g.moveTo(cx - R * 1.08, cy - R * 0.2);
    g.bezierCurveTo(cx - R * 1.35, cy + L * 0.4, cx - R * 1.25, cy + L * 0.8, cx - R * 1.1, cy + L);
    g.lineTo(cx + R * 1.1, cy + L);
    g.bezierCurveTo(cx + R * 1.25, cy + L * 0.8, cx + R * 1.35, cy + L * 0.4, cx + R * 1.08, cy - R * 0.2);
    g.closePath();
    g.fill();
  }
}

function hairFront(g: G, look: Look, cx: number, cy: number, R: number, rng: RNG) {
  const hat = look.hat || 'none';
  if (hat === 'hood' || hat === 'monkhood' || hat === 'wimple' || hat === 'coif' || hat === 'bascinet' || hat === 'sallet') return;
  let st = look.hairStyle;
  if (hat === 'kerchief' && st !== 'bald' && st !== 'tonsure') st = 'short';
  if (st === 'none') return;
  const fill = hairFill(g, look, cx, cy, R);
  if (st === 'bald') {
    ellipse(g, cx - R * 0.3, cy - R * 0.75, R * 0.3, R * 0.14, 'rgba(255,248,235,0.4)');
    return;
  }
  if (st === 'balding' || st === 'tonsure') {
    // hair ring around the sides, bald crown
    g.fillStyle = fill;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * R * 0.62, cy - R * 0.7);
      g.bezierCurveTo(cx + s * R * 1.1, cy - R * 0.62, cx + s * R * 1.12, cy - R * 0.1, cx + s * R * 1.02, cy + R * 0.35);
      g.lineTo(cx + s * R * 0.92, cy + R * 0.3);
      g.bezierCurveTo(cx + s * R * 0.92, cy - R * 0.1, cx + s * R * 0.85, cy - R * 0.5, cx + s * R * 0.55, cy - R * 0.62);
      g.closePath();
      g.fill();
    }
    if (st === 'tonsure') { g.fillStyle = fill; g.beginPath(); g.ellipse(cx, cy - R * 0.72, R * 0.72, R * 0.24, 0, 0, Math.PI * 2); g.fill(); ellipse(g, cx, cy - R * 0.84, R * 0.5, R * 0.18, rad(g, cx - R * 0.2, cy - R * 0.9, 1, cx, cy - R * 0.84, R * 0.5, [[0, lit(skinOf(look)[3], 0.3)], [1, skinOf(look)[2]]])); }
    ellipse(g, cx - R * 0.25, cy - R * 0.82, R * 0.3, R * 0.12, 'rgba(255,248,235,0.35)');
    return;
  }
  // crown and fringe
  const fringeY = st === 'messy' ? cy - R * 0.38 : st === 'curly' ? cy - R * 0.42 : cy - R * 0.5;
  const hairPath = () => {
  g.beginPath();
  g.moveTo(cx - R * 1.06, cy + (st === 'long' || st === 'braids' ? R * 0.9 : R * 0.1));
  g.bezierCurveTo(cx - R * 1.2, cy - R * 1.2, cx + R * 1.2, cy - R * 1.2, cx + R * 1.06, cy + (st === 'long' || st === 'braids' ? R * 0.9 : R * 0.1));
  g.lineTo(cx + R * 0.94, cy + (st === 'long' || st === 'braids' ? R * 0.9 : R * 0.1));
  g.bezierCurveTo(cx + R * 0.95, cy - R * 0.2, cx + R * 0.85, fringeY, cx + R * 0.55, fringeY);
  if (st === 'messy') {
    for (let k = 0; k < 7; k++) { const x = cx + R * 0.55 - (k + 1) * R * 0.157; g.lineTo(x + R * 0.08, fringeY + R * 0.14 + rng.next() * R * 0.06); g.lineTo(x, fringeY); }
  } else if (st === 'curly') {
    for (let k = 0; k < 5; k++) { const x = cx + R * 0.55 - (k + 0.5) * R * 0.22; g.quadraticCurveTo(x + R * 0.11, fringeY + R * 0.2, x, fringeY); }
  } else if (look.female || st === 'bun' || st === 'ponytail' || st === 'long' || st === 'braids') {
    g.quadraticCurveTo(cx + R * 0.25, fringeY - R * 0.15, cx, fringeY - R * 0.3);
    g.quadraticCurveTo(cx - R * 0.25, fringeY - R * 0.15, cx - R * 0.55, fringeY);
  } else {
    g.bezierCurveTo(cx + R * 0.2, fringeY + R * 0.14, cx - R * 0.3, fringeY + R * 0.02, cx - R * 0.55, fringeY + R * 0.06);
  }
  g.bezierCurveTo(cx - R * 0.85, fringeY, cx - R * 0.95, cy - R * 0.2, cx - R * 0.94, cy + (st === 'long' || st === 'braids' ? R * 0.9 : R * 0.1));
  g.closePath();
  };
  // the hair casts a soft shadow onto the brow
  g.save();
  faceShape(g, look, cx, cy, R);
  g.clip();
  g.translate(R * 0.04, R * 0.1);
  hairPath();
  g.fillStyle = rgba(skinOf(look)[0], 0.32);
  g.fill();
  g.restore();
  hairPath();
  g.fillStyle = fill;
  g.fill();
  g.strokeStyle = rgba(dim(look.hair, 0.6), 0.55);
  g.lineWidth = 1.8;
  g.stroke();
  if (st === 'curly') {
    // ringlets: small shaded curls over the crown
    for (let k = 0; k < 22; k++) {
      const a = Math.PI * 1.04 + rng.next() * Math.PI * 0.92, d = 0.72 + rng.next() * 0.3;
      const x = cx + Math.cos(a) * R * d * 1.0, y = cy - R * 0.12 + Math.sin(a) * R * d * 1.02;
      const r = R * (0.13 + rng.next() * 0.05);
      g.fillStyle = rad(g, x - r * 0.3, y - r * 0.4, 0.5, x, y, r, [[0, lit(look.hair, 0.4)], [1, dim(look.hair, 0.25)]]);
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(dim(look.hair, 0.45), 0.4); g.lineWidth = 1;
      g.beginPath(); g.arc(x, y, r * 0.6, 0.6, 3.6); g.stroke();
    }
  }
  if (st === 'bun') ellipse(g, cx, cy - R * 1.1, R * 0.36, R * 0.26, fill);
  if (st === 'braids') for (const s of [-1, 1]) for (let k = 0; k < 7; k++) {
    const x = cx + s * R * 0.98, y = cy + R * 0.45 + k * R * 0.2;
    ellipse(g, x, y, R * 0.15, R * 0.12, k % 2 ? dim(look.hair, 0.25) : lit(look.hair, 0.1));
    if (k === 6) ellipse(g, x, y + R * 0.16, R * 0.1, R * 0.07, '#b83a3a');
  }
  // strands and a sheen
  const pts: [number, number, number, number][] = [];
  for (let k = 0; k < 16; k++) { const t = k / 15; pts.push([cx - R * 0.9 + t * R * 1.8, cy - R * 1.0 + Math.abs(t - 0.5) * R * 0.3, cx - R * 0.8 + t * R * 1.6, fringeY + R * 0.05]); }
  strandLines(g, look, pts, rng);
  g.strokeStyle = rgba(lit(look.hair, 0.6), 0.35); g.lineWidth = 4;
  g.beginPath(); g.arc(cx - R * 0.1, cy - R * 0.2, R * 0.78, Math.PI * 1.15, Math.PI * 1.45); g.stroke();
}

// ---------------------------------------------------------------- headwear

function hoodBehind(g: G, look: Look, cx: number, cy: number, R: number) {
  const hat = look.hat!;
  const col = hat === 'wimple' ? '#ece6d8' : hat === 'coif' ? '#848d96' : look.hatColor || '#5a4a3a';
  if (hat === 'coif') { g.save(); g.beginPath(); g.ellipse(cx, cy + R * 0.2, R * 1.3, R * 1.45, 0, 0, Math.PI * 2); g.clip(); mail(g, cx - R * 1.4, cy - R * 1.4, R * 2.8, R * 3.2, col); g.restore(); return; }
  g.fillStyle = lin(g, cx - R * 1.3, 0, cx + R * 1.3, 0, [[0, lit(col, 0.2)], [1, dim(col, 0.45)]]);
  g.beginPath(); g.ellipse(cx, cy + R * 0.25, R * 1.32, R * 1.45, 0, 0, Math.PI * 2); g.fill();
}

function headwear(g: G, look: Look, cx: number, cy: number, R: number, rng: RNG) {
  const hat = look.hat || 'none';
  if (hat === 'none') return;
  const hc = look.hatColor || '#6b4a30';
  const cloth = (c: string) => lin(g, cx - R * 1.2, cy - R * 1.3, cx + R, cy + R * 0.2, [[0, lit(c, 0.3)], [0.5, c], [1, dim(c, 0.45)]]);
  const steel = '#9aa3ad';
  const metal = (c: string) => lin(g, cx - R * 1.1, cy - R * 1.2, cx + R * 0.9, cy + R * 0.4, [[0, lit(c, 0.6)], [0.35, c], [1, dim(c, 0.5)]]);
  switch (hat) {
    case 'cap': case 'feathercap':
      g.fillStyle = cloth(hc);
      g.beginPath(); g.moveTo(cx - R * 1.08, cy - R * 0.4); g.bezierCurveTo(cx - R * 1.2, cy - R * 1.5, cx + R * 1.2, cy - R * 1.5, cx + R * 1.08, cy - R * 0.4); g.quadraticCurveTo(cx, cy - R * 0.62, cx - R * 1.08, cy - R * 0.4); g.fill();
      g.fillStyle = dim(hc, 0.3); g.beginPath(); g.ellipse(cx, cy - R * 0.45, R * 1.08, R * 0.14, 0, 0, Math.PI); g.fill();
      if (hat === 'feathercap') { blade(g, cx + R * 0.5, cy - R * 0.9, R * 1.3, -Math.PI / 2 + 0.7, -R * 0.2, R * 0.28, '#efe8d8'); blade(g, cx + R * 0.5, cy - R * 0.9, R * 1.1, -Math.PI / 2 + 0.65, -R * 0.15, R * 0.12, '#b8322a'); }
      break;
    case 'strawhat': {
      const bc = look.hatColor || '#d8b870';
      g.fillStyle = lin(g, cx - R * 1.8, 0, cx + R * 1.8, 0, [[0, lit(bc, 0.3)], [0.5, bc], [1, dim(bc, 0.4)]]);
      g.beginPath(); g.ellipse(cx, cy - R * 0.55, R * 1.75, R * 0.42, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = rgba(dim(bc, 0.45), 0.6); g.lineWidth = 1;
      for (let k = 1; k < 6; k++) { g.beginPath(); g.ellipse(cx, cy - R * 0.55, R * 1.75 * (k / 6), R * 0.42 * (k / 6), 0, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = cloth(bc);
      g.beginPath(); g.moveTo(cx - R * 0.85, cy - R * 0.6); g.quadraticCurveTo(cx - R * 0.8, cy - R * 1.45, cx, cy - R * 1.45); g.quadraticCurveTo(cx + R * 0.8, cy - R * 1.45, cx + R * 0.85, cy - R * 0.6); g.closePath(); g.fill();
      g.fillStyle = '#6b3a2a'; g.fillRect(cx - R * 0.85, cy - R * 0.78, R * 1.7, R * 0.14);
      break;
    }
    case 'kerchief':
      g.fillStyle = cloth(hc);
      g.beginPath(); g.moveTo(cx - R * 1.1, cy - R * 0.05); g.bezierCurveTo(cx - R * 1.25, cy - R * 1.35, cx + R * 1.25, cy - R * 1.35, cx + R * 1.1, cy - R * 0.05); g.quadraticCurveTo(cx + R * 0.8, cy - R * 0.62, cx, cy - R * 0.66); g.quadraticCurveTo(cx - R * 0.8, cy - R * 0.62, cx - R * 1.1, cy - R * 0.05); g.fill();
      g.strokeStyle = rgba(dim(hc, 0.4), 0.6); g.lineWidth = 1.5;
      for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(cx - R * 0.8 + k * R * 0.4, cy - R * 1.05); g.quadraticCurveTo(cx - R * 0.7 + k * R * 0.4, cy - R * 0.8, cx - R * 0.75 + k * R * 0.42, cy - R * 0.62); g.stroke(); }
      break;
    case 'hood': case 'monkhood': case 'wimple': {
      const col = hat === 'wimple' ? '#ece6d8' : hc;
      g.fillStyle = cloth(col);
      g.beginPath();
      g.moveTo(cx - R * 1.35, cy + R * 1.35);
      g.bezierCurveTo(cx - R * 1.6, cy - R * 1.6, cx + R * 1.6, cy - R * 1.6, cx + R * 1.35, cy + R * 1.35);
      g.lineTo(cx + R * 0.82, cy + R * 1.05);
      g.bezierCurveTo(cx + R * 1.02, cy - R * 0.2, cx + R * 0.8, cy - R * 0.85, cx, cy - R * 0.88);
      g.bezierCurveTo(cx - R * 0.8, cy - R * 0.85, cx - R * 1.02, cy - R * 0.2, cx - R * 0.82, cy + R * 1.05);
      g.closePath();
      g.fill();
      g.strokeStyle = rgba(dim(col, 0.5), 0.6); g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx - R * 0.9, cy + R * 0.9); g.bezierCurveTo(cx - R * 1.12, cy - R * 0.3, cx - R * 0.85, cy - R * 0.98, cx, cy - R * 1.0); g.bezierCurveTo(cx + R * 0.85, cy - R * 0.98, cx + R * 1.12, cy - R * 0.3, cx + R * 0.9, cy + R * 0.9); g.stroke();
      if (hat === 'wimple') { g.fillStyle = '#e2dccd'; g.beginPath(); g.moveTo(cx - R * 0.75, cy + R * 0.85); g.quadraticCurveTo(cx, cy + R * 1.45, cx + R * 0.75, cy + R * 0.85); g.lineTo(cx + R * 0.9, cy + R * 1.6); g.lineTo(cx - R * 0.9, cy + R * 1.6); g.closePath(); g.fill(); }
      break;
    }
    case 'coif': {
      g.save();
      g.beginPath();
      g.moveTo(cx - R * 1.3, cy + R * 1.4); g.bezierCurveTo(cx - R * 1.5, cy - R * 1.55, cx + R * 1.5, cy - R * 1.55, cx + R * 1.3, cy + R * 1.4);
      g.lineTo(cx + R * 0.78, cy + R * 1.0); g.bezierCurveTo(cx + R * 0.98, cy - R * 0.2, cx + R * 0.78, cy - R * 0.8, cx, cy - R * 0.82); g.bezierCurveTo(cx - R * 0.78, cy - R * 0.8, cx - R * 0.98, cy - R * 0.2, cx - R * 0.78, cy + R * 1.0);
      g.closePath(); g.clip();
      mail(g, cx - R * 1.6, cy - R * 1.6, R * 3.2, R * 3.2, '#848d96');
      g.restore();
      break;
    }
    case 'kettle':
      g.fillStyle = metal(steel);
      g.beginPath(); g.ellipse(cx, cy - R * 0.5, R * 1.6, R * 0.34, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(cx - R * 1.0, cy - R * 0.55); g.bezierCurveTo(cx - R * 1.05, cy - R * 1.6, cx + R * 1.05, cy - R * 1.6, cx + R * 1.0, cy - R * 0.55); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx - R * 0.5, cy - R * 1.25); g.quadraticCurveTo(cx - R * 0.8, cy - R * 1.0, cx - R * 0.82, cy - R * 0.65); g.stroke();
      break;
    case 'bascinet':
      g.save(); g.beginPath(); g.moveTo(cx - R * 1.3, cy + R * 1.4); g.bezierCurveTo(cx - R * 1.45, cy - R * 0.2, cx - R * 1.2, cy - R * 0.3, cx - R * 1.0, cy - R * 0.3); g.lineTo(cx + R * 1.0, cy - R * 0.3); g.bezierCurveTo(cx + R * 1.2, cy - R * 0.3, cx + R * 1.45, cy - R * 0.2, cx + R * 1.3, cy + R * 1.4); g.lineTo(cx + R * 0.8, cy + R * 1.05); g.quadraticCurveTo(cx + R, cy - R * 0.1, cx, cy - R * 0.4); g.quadraticCurveTo(cx - R, cy - R * 0.1, cx - R * 0.8, cy + R * 1.05); g.closePath(); g.clip();
      mail(g, cx - R * 1.6, cy - R * 0.5, R * 3.2, R * 2, '#848d96'); g.restore();
      g.fillStyle = metal(steel);
      g.beginPath(); g.moveTo(cx - R * 1.05, cy - R * 0.25); g.bezierCurveTo(cx - R * 1.1, cy - R * 1.3, cx - R * 0.3, cy - R * 1.55, cx, cy - R * 1.85); g.bezierCurveTo(cx + R * 0.3, cy - R * 1.55, cx + R * 1.1, cy - R * 1.3, cx + R * 1.05, cy - R * 0.25); g.quadraticCurveTo(cx, cy - R * 0.5, cx - R * 1.05, cy - R * 0.25); g.fill();
      break;
    case 'sallet': {
      const m = look.hatColor || steel;
      g.fillStyle = metal(m);
      g.beginPath(); g.moveTo(cx - R * 1.2, cy + R * 0.95); g.bezierCurveTo(cx - R * 1.35, cy - R * 1.5, cx + R * 1.35, cy - R * 1.5, cx + R * 1.2, cy + R * 0.95); g.quadraticCurveTo(cx, cy + R * 1.2, cx - R * 1.2, cy + R * 0.95); g.fill();
      // visor slit, with a cold glint of eyes behind
      g.fillStyle = '#080605';
      g.beginPath(); g.moveTo(cx - R * 0.9, cy + R * 0.02); g.lineTo(cx + R * 0.9, cy + R * 0.02); g.lineTo(cx + R * 0.85, cy + R * 0.2); g.lineTo(cx - R * 0.85, cy + R * 0.2); g.closePath(); g.fill();
      for (const s of [-1, 1]) ellipse(g, cx + s * R * 0.35, cy + R * 0.11, 2.2, 1.2, 'rgba(230,200,160,0.55)');
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx - R * 0.6, cy - R * 1.0); g.quadraticCurveTo(cx - R * 1.0, cy - R * 0.6, cx - R * 1.0, cy - R * 0.1); g.stroke();
      for (let k = 0; k < 5; k++) ellipse(g, cx - R * 0.8 + k * R * 0.4, cy + R * 0.55, 1.6, 1.6, lit(m, 0.4));
      break;
    }
    case 'chaperon':
      g.fillStyle = cloth(hc);
      g.beginPath(); g.ellipse(cx, cy - R * 0.75, R * 1.25, R * 0.5, 0, 0, Math.PI * 2); g.fill();
      for (let k = 0; k < 7; k++) { const a = Math.PI + (k / 6) * Math.PI; ellipse(g, cx + Math.cos(a) * R * 0.95, cy - R * 0.75 + Math.sin(a) * R * 0.32, R * 0.3, R * 0.2, k % 2 ? hc : dim(hc, 0.25)); }
      g.fillStyle = dim(hc, 0.2);
      g.beginPath(); g.moveTo(cx + R * 0.9, cy - R * 0.6); g.quadraticCurveTo(cx + R * 1.6, cy + R * 0.3, cx + R * 1.35, cy + R * 1.6); g.lineTo(cx + R * 1.05, cy + R * 1.5); g.quadraticCurveTo(cx + R * 1.2, cy + R * 0.3, cx + R * 0.7, cy - R * 0.5); g.fill();
      break;
    case 'circlet':
      g.strokeStyle = lin(g, cx - R, 0, cx + R, 0, [[0, '#f6e39a'], [0.5, '#c79a2c'], [1, '#8a6a18']]);
      g.lineWidth = 4;
      g.beginPath(); g.ellipse(cx, cy - R * 0.55, R * 1.0, R * 0.22, 0, 0.1, Math.PI - 0.1); g.stroke();
      ellipse(g, cx, cy - R * 0.33, 4, 4, '#b8322a');
      break;
  }
  void rng;
}

// ---------------------------------------------------------------- the dog

function paintDog(g: G, look: Look, expr: Expr, talk: boolean, blink: boolean) {
  const rng = new RNG(7);
  const coat = look.hair || '#8a5a32';
  const light = '#e8dcc8';
  background(g, look.portraitBg || '#6b5a44', rng);
  const cx = 128, cy = 120;
  // chest
  g.fillStyle = lin(g, 60, 190, 200, 256, [[0, lit(light, 0.1)], [1, dim(light, 0.25)]]);
  g.beginPath(); g.moveTo(40, 260); g.quadraticCurveTo(60, 170, 128, 165); g.quadraticCurveTo(196, 170, 216, 260); g.fill();
  g.fillStyle = lin(g, 40, 0, 216, 0, [[0, lit(coat, 0.2)], [1, dim(coat, 0.4)]]);
  g.beginPath(); g.moveTo(30, 260); g.quadraticCurveTo(40, 190, 90, 172); g.quadraticCurveTo(100, 230, 80, 260); g.fill();
  g.beginPath(); g.moveTo(226, 260); g.quadraticCurveTo(216, 190, 166, 172); g.quadraticCurveTo(156, 230, 176, 260); g.fill();
  // ears (floppy)
  for (const s of [-1, 1]) {
    g.fillStyle = lin(g, cx + s * 60, 60, cx + s * 80, 170, [[0, dim(coat, 0.1)], [1, dim(coat, 0.5)]]);
    g.beginPath(); g.moveTo(cx + s * 38, 70); g.bezierCurveTo(cx + s * 95, 60, cx + s * 100, 150, cx + s * 78, 170); g.bezierCurveTo(cx + s * 60, 150, cx + s * 58, 110, cx + s * 30, 95); g.fill();
  }
  // head
  g.fillStyle = rad(g, cx - 20, cy - 40, 5, cx, cy, 80, [[0, lit(coat, 0.3)], [0.6, coat], [1, dim(coat, 0.35)]]);
  g.beginPath(); g.ellipse(cx, cy - 10, 58, 55, 0, 0, Math.PI * 2); g.fill();
  // blaze and muzzle
  g.fillStyle = lin(g, 0, cy - 60, 0, cy + 40, [[0, 'rgba(232,220,200,0)'], [0.4, light], [1, light]]);
  g.beginPath(); g.moveTo(cx - 8, cy - 62); g.quadraticCurveTo(cx - 16, cy - 10, cx - 36, cy + 30); g.quadraticCurveTo(cx, cy + 50, cx + 36, cy + 30); g.quadraticCurveTo(cx + 16, cy - 10, cx + 8, cy - 62); g.fill();
  g.fillStyle = rad(g, cx - 8, cy + 18, 4, cx, cy + 25, 40, [[0, '#f6f0e4'], [1, '#c8baa0']]);
  g.beginPath(); g.ellipse(cx, cy + 25, 36, 26, 0, 0, Math.PI * 2); g.fill();
  // eyes
  const f = FACES[expr];
  const open = blink ? 0 : Math.max(0.2, Math.min(1.1, f.open));
  for (const s of [-1, 1]) {
    const ex = cx + s * 26, ey = cy - 14;
    if (open < 0.25) { g.strokeStyle = '#2a1810'; g.lineWidth = 3; g.beginPath(); g.moveTo(ex - 9, ey); g.quadraticCurveTo(ex, ey + (expr === 'happy' || expr === 'laugh' ? -6 : 5), ex + 9, ey); g.stroke(); continue; }
    g.fillStyle = '#1a0e08';
    g.beginPath(); g.ellipse(ex, ey, 10, 10 * open, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = rad(g, ex - 2, ey - 2, 1, ex, ey, 9, [[0, '#7a4a28'], [1, '#2a1810']]);
    g.beginPath(); g.ellipse(ex, ey, 8, 8 * open, 0, 0, Math.PI * 2); g.fill();
    ellipse(g, ex - 3, ey - 3 * open, 3, 2.6 * open, 'rgba(255,255,255,0.95)');
    ellipse(g, ex + 3, ey + 3 * open, 1.3, 1.1 * open, 'rgba(255,255,255,0.6)');
    // soft brows
    g.strokeStyle = dim(coat, 0.35); g.lineWidth = 3;
    g.beginPath(); g.moveTo(ex - 8, ey - 14 + (expr === 'sad' || expr === 'worried' ? -4 * s * -1 : 0)); g.quadraticCurveTo(ex, ey - 18, ex + 8, ey - 14); g.stroke();
  }
  // nose
  g.fillStyle = rad(g, cx - 5, cy + 6, 1, cx, cy + 10, 16, [[0, '#6a5a58'], [1, '#141010']]);
  g.beginPath(); g.moveTo(cx - 13, cy + 4); g.quadraticCurveTo(cx, cy - 2, cx + 13, cy + 4); g.quadraticCurveTo(cx + 10, cy + 18, cx, cy + 18); g.quadraticCurveTo(cx - 10, cy + 18, cx - 13, cy + 4); g.fill();
  ellipse(g, cx - 4, cy + 5, 4, 2, 'rgba(255,255,255,0.5)');
  // mouth and tongue
  g.strokeStyle = '#3a2418'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(cx, cy + 18); g.lineTo(cx, cy + 28); g.moveTo(cx - 22, cy + 28); g.quadraticCurveTo(cx - 10, cy + 36, cx, cy + 28); g.quadraticCurveTo(cx + 10, cy + 36, cx + 22, cy + 28); g.stroke();
  if (expr === 'happy' || expr === 'laugh' || talk || expr === 'tender') {
    g.fillStyle = lin(g, 0, cy + 30, 0, cy + 58, [[0, '#e87a80'], [1, '#b84a52']]);
    g.beginPath(); g.moveTo(cx - 10, cy + 30); g.quadraticCurveTo(cx - 12, cy + 56, cx, cy + 58); g.quadraticCurveTo(cx + 12, cy + 56, cx + 10, cy + 30); g.fill();
    g.strokeStyle = 'rgba(120,30,40,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, cy + 34); g.lineTo(cx, cy + 50); g.stroke();
  }
  if (f.tears) for (const s of [-1, 1]) ellipse(g, cx + s * 30, cy + 2, 3, 6, 'rgba(200,230,255,0.8)');
  vignette(g);
}

export { clamp };
