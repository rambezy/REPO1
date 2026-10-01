// Buildings in 3/4 view, painted at high resolution: a front wall with its
// door, windows and sign, under a roof that covers the footprint. Layout
// (window lights, chimney smoke, door) is worked out up front; the painting
// itself happens lazily the first time the building comes into view.

import { RNG, clamp } from '../engine/util';
import { P, CLOTH } from './palette';
import { Sprite, lazySprite } from './sprite';
import { artCanvas, rim, lit, dim, rgba, mix, ellipse, poly, lin, rad, blade, roundRect, grain, jitter, Ctx } from './paint';

export type BuildingStyle = 'cottage' | 'townhouse' | 'stone' | 'log' | 'burned' | 'church' | 'keep' | 'tower' | 'tent' | 'barn' | 'mill' | 'stall' | 'shed' | 'gatehouse' | 'ruin';
export type RoofStyle = 'thatch' | 'clay' | 'slate' | 'shingle' | 'canvas' | 'none';

export interface BuildingSpec {
  w: number;
  h: number;
  style: BuildingStyle;
  door: number; // door column within footprint, -1 = none
  seed: number;
  roof?: RoofStyle;
  chimney?: boolean;
  sign?: string;
  tint?: string;
  tint2?: string;
}

export interface BuildingArt {
  sprite: Sprite;
  windows: { x: number; y: number; w?: number; h?: number }[]; // centres relative to the base point
  smoke: { x: number; y: number } | null;
  doorX: number; // relative to base
}

type G = Ctx;
const artCache = new Map<string, BuildingArt>();

export function buildingArt(spec: BuildingSpec): BuildingArt {
  const key = JSON.stringify(spec);
  const hit = artCache.get(key);
  if (hit) return hit;
  let art: BuildingArt;
  switch (spec.style) {
    case 'tent': art = tent(spec); break;
    case 'stall': art = stall(spec); break;
    case 'church': art = church(spec); break;
    case 'keep': case 'tower': art = keep(spec); break;
    case 'gatehouse': art = gatehouse(spec); break;
    default: art = house(spec);
  }
  artCache.set(key, art);
  return art;
}

// ================================================================ materials

const STONE = ['#5c5850', '#6e6a60', '#7c776c', '#888275', '#948d80', '#a39c8e'];
const TIMBER = '#3a281a';

/** Sub-rectangle fill with a soft top-lit gradient. */
function shadedRect(g: G, x: number, y: number, w: number, h: number, col: string, top = 0.18, bottom = 0.2) {
  g.fillStyle = lin(g, 0, y, 0, y + h, [[0, lit(col, top)], [0.5, col], [1, dim(col, bottom)]]);
  g.fillRect(x, y, w, h);
}

function plaster(g: G, x0: number, y0: number, x1: number, y1: number, rng: RNG, base = '#d8ccae') {
  g.fillStyle = lin(g, 0, y0, 0, y1, [[0, dim(base, 0.18)], [0.25, base], [1, dim(base, 0.08)]]);
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let i = 0; i < (x1 - x0) * (y1 - y0) * 0.02; i++) {
    const x = x0 + rng.next() * (x1 - x0), y = y0 + rng.next() * (y1 - y0), r = 0.8 + rng.next() * 2.5;
    ellipse(g, x, y, r, r * 0.7, rgba(rng.next() < 0.5 ? dim(base, 0.25) : lit(base, 0.3), 0.18));
  }
  // a few cracks and damp stains
  g.strokeStyle = rgba(dim(base, 0.45), 0.45);
  g.lineWidth = 0.18;
  for (let i = 0; i < (x1 - x0) / 20; i++) {
    let x = x0 + rng.next() * (x1 - x0), y = y0 + rng.next() * (y1 - y0) * 0.6;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += (rng.next() - 0.5) * 2; y += 1 + rng.next() * 1.5; g.lineTo(x, y); }
    g.stroke();
  }
}

function beam(g: G, x: number, y: number, w: number, h: number, col = TIMBER) {
  const vertical = h > w;
  g.fillStyle = vertical
    ? lin(g, x, 0, x + w, 0, [[0, lit(col, 0.25)], [0.45, col], [1, dim(col, 0.35)]])
    : lin(g, 0, y, 0, y + h, [[0, lit(col, 0.25)], [0.45, col], [1, dim(col, 0.35)]]);
  g.fillRect(x, y, w, h);
}

function braceBeam(g: G, x0: number, y0: number, x1: number, y1: number, w: number, col = TIMBER) {
  g.strokeStyle = dim(col, 0.2);
  g.lineWidth = w;
  g.lineCap = 'butt';
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = rgba(lit(col, 0.3), 0.6);
  g.lineWidth = w * 0.3;
  g.beginPath(); g.moveTo(x0 - w * 0.25, y0); g.lineTo(x1 - w * 0.25, y1); g.stroke();
  g.lineCap = 'round';
}

function ashlar(g: G, x0: number, y0: number, x1: number, y1: number, rng: RNG, cols = STONE, rowH = 5, quoins = true) {
  g.fillStyle = '#3e3a34';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let y = y1 - rowH, r = 0; y > y0 - rowH; y -= rowH, r++) {
    let x = x0 - (r % 2) * 4 - rng.next() * 2;
    while (x < x1) {
      const w = 6 + rng.next() * 6;
      const col = jitter(cols[Math.floor(rng.next() * cols.length)], rng, 0.05);
      const bx = Math.max(x0, x) + 0.25, bw = Math.min(x1, x + w) - Math.max(x0, x) - 0.5;
      const by = Math.max(y0, y) + 0.25, bh = Math.min(y1, y + rowH) - Math.max(y0, y) - 0.5;
      if (bw > 0.3 && bh > 0.3) {
        roundRect(g, bx, by, bw, bh, 0.8, lin(g, bx, by, bx + bw * 0.3, by + bh, [[0, lit(col, 0.22)], [0.5, col], [1, dim(col, 0.25)]]));
        if (rng.next() < 0.3) ellipse(g, bx + rng.next() * bw, by + rng.next() * bh, 1 + rng.next(), 0.6, rgba(dim(col, 0.4), 0.3));
      }
      x += w;
    }
  }
  if (quoins) {
    for (const qx of [x0, x1 - 4]) for (let y = y1 - 6, r = 0; y > y0 - 6; y -= 6, r++) {
      const w = r % 2 ? 4 : 6;
      const bx = qx === x0 ? x0 : x1 - w;
      const col = STONE[4];
      roundRect(g, bx + 0.2, Math.max(y0, y) + 0.2, w - 0.4, Math.min(6, y + 6 - Math.max(y0, y)) - 0.4, 0.6, lin(g, bx, y, bx + w, y + 6, [[0, lit(col, 0.25)], [1, dim(col, 0.2)]]));
    }
  }
}

function logs(g: G, x0: number, y0: number, x1: number, y1: number, rng: RNG) {
  const logH = 4.4;
  g.fillStyle = '#2a1a10';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let y = y1 - logH, i = 0; y > y0 - logH; y -= logH, i++) {
    const col = jitter(['#7a5230', '#6c482a', '#845a36', '#70502e'][i % 4], rng, 0.05);
    const top = Math.max(y0, y);
    g.fillStyle = lin(g, 0, y, 0, y + logH, [[0, dim(col, 0.45)], [0.22, lit(col, 0.22)], [0.55, col], [1, dim(col, 0.5)]]);
    g.fillRect(x0 - 1.5, top + 0.15, x1 - x0 + 3, y + logH - top - 0.3);
    g.strokeStyle = rgba(dim(col, 0.5), 0.5);
    g.lineWidth = 0.14;
    for (let k = 0; k < (x1 - x0) / 5; k++) {
      const x = x0 + rng.next() * (x1 - x0), yy = y + 1 + rng.next() * (logH - 2);
      if (yy < y0) continue;
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + 3 + rng.next() * 6, yy + (rng.next() - 0.5) * 0.3); g.stroke();
    }
    // log ends at the corners
    for (const ex of [x0 - 1.2, x1 + 1.2]) {
      if (y + logH / 2 < y0) continue;
      ellipse(g, ex, y + logH / 2, 1.8, logH / 2 - 0.1, lin(g, ex - 1.8, 0, ex + 1.8, 0, [[0, '#b08a5a'], [1, '#7a5a38']]));
      g.strokeStyle = 'rgba(80,54,30,0.6)';
      g.lineWidth = 0.15;
      g.beginPath(); g.ellipse(ex, y + logH / 2, 0.9, logH / 4, 0, 0, Math.PI * 2); g.stroke();
    }
    g.fillStyle = 'rgba(170,150,120,0.45)';
    g.fillRect(x0, y + logH - 0.35, x1 - x0, 0.3);
  }
}

function planks(g: G, x0: number, y0: number, x1: number, y1: number, rng: RNG, col = '#7a5a3a') {
  g.fillStyle = '#231710';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let x = x0; x < x1; x += 3.2) {
    const c = jitter(col, rng, 0.08);
    const w = Math.min(3.0, x1 - x);
    g.fillStyle = lin(g, x, 0, x + w, 0, [[0, lit(c, 0.18)], [0.6, c], [1, dim(c, 0.3)]]);
    g.fillRect(x + 0.1, y0, w - 0.2, y1 - y0);
    if (rng.next() < 0.5) ellipse(g, x + 1.5, y0 + rng.next() * (y1 - y0), 0.5, 0.35, dim(c, 0.5));
  }
  // battens
  for (const by of [y0 + 3, y1 - 5]) beam(g, x0, by, x1 - x0, 1.6, '#4a3222');
}

function charred(g: G, x0: number, y0: number, x1: number, y1: number, rng: RNG) {
  g.fillStyle = lin(g, 0, y0, 0, y1, [[0, '#1a1614'], [1, '#2e2826']]);
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let i = 0; i < (x1 - x0) * 1.2; i++) {
    const x = x0 + rng.next() * (x1 - x0), y = y0 + rng.next() * (y1 - y0);
    ellipse(g, x, y, 0.8 + rng.next() * 2, 0.6 + rng.next(), rgba(rng.next() < 0.6 ? '#3a3430' : '#0e0c0b', 0.5));
  }
  // what's left of the timber frame
  for (let x = x0; x < x1; x += 13 + rng.next() * 6) beam(g, x, y0 + rng.next() * 6, 2, y1 - y0, '#1c1410');
  for (let i = 0; i < (x1 - x0) / 7; i++) {
    const x = x0 + rng.next() * (x1 - x0), y = y0 + rng.next() * (y1 - y0);
    ellipse(g, x, y, 1.2, 0.5, rgba('#ff7a2a', 0.45));
    ellipse(g, x, y, 0.5, 0.25, '#ffc070');
  }
}

// ---------------------------------------------------------------- openings

function windowArt(g: G, cx: number, y: number, w: number, h: number, shutter: string | null, rng: RNG, o: { arched?: boolean; box?: boolean; frame?: string; broken?: boolean } = {}) {
  const x = cx - w / 2;
  const frame = o.frame ?? TIMBER;
  // lintel and sill
  beam(g, x - 1.2, y - 1.4, w + 2.4, 1.4, frame);
  // shutters
  if (shutter) {
    for (const side of [-1, 1]) {
      const sx = side < 0 ? x - w * 0.55 - 0.3 : x + w + 0.3;
      const sw = w * 0.55;
      const col = side < 0 ? shutter : dim(shutter, 0.18);
      g.fillStyle = lin(g, sx, 0, sx + sw, 0, [[0, lit(col, 0.15)], [1, dim(col, 0.2)]]);
      g.fillRect(sx, y, sw, h);
      g.strokeStyle = rgba(dim(col, 0.45), 0.8);
      g.lineWidth = 0.2;
      for (let k = 1; k < 3; k++) { g.beginPath(); g.moveTo(sx + (sw * k) / 3, y + 0.3); g.lineTo(sx + (sw * k) / 3, y + h - 0.3); g.stroke(); }
      g.fillStyle = rgba('#100c08', 0.3);
      g.fillRect(sx, y + h - 0.4, sw, 0.4);
    }
  }
  // frame and glass
  g.fillStyle = frame;
  if (o.arched) {
    g.beginPath(); g.moveTo(x - 0.5, y + h + 0.3); g.lineTo(x - 0.5, y + w / 2); g.arc(cx, y + w / 2, w / 2 + 0.5, Math.PI, 0); g.lineTo(x + w + 0.5, y + h + 0.3); g.closePath(); g.fill();
  } else g.fillRect(x - 0.5, y - 0.5, w + 1, h + 1);
  const glass = o.broken ? '#0e0b09' : undefined;
  const gg = glass || lin(g, x, y, x + w, y + h, [[0, '#6d8292'], [0.45, '#34404c'], [1, '#1e242c']]);
  g.fillStyle = gg;
  if (o.arched) {
    g.beginPath(); g.moveTo(x, y + h); g.lineTo(x, y + w / 2); g.arc(cx, y + w / 2, w / 2, Math.PI, 0); g.lineTo(x + w, y + h); g.closePath(); g.fill();
  } else g.fillRect(x, y, w, h);
  if (!o.broken) {
    // leading and a glint
    g.strokeStyle = rgba('#1a1410', 0.8);
    g.lineWidth = 0.35;
    g.beginPath(); g.moveTo(cx, y); g.lineTo(cx, y + h); g.moveTo(x, y + h * 0.5); g.lineTo(x + w, y + h * 0.5); g.stroke();
    g.fillStyle = 'rgba(220,235,245,0.4)';
    g.fillRect(x + 0.5, y + 0.5, w * 0.3, h * 0.2);
  }
  // sill
  beam(g, x - 1, y + h + 0.3, w + 2, 1.2, frame);
  if (o.box && shutter) {
    shadedRect(g, x - 0.6, y + h + 1.4, w + 1.2, 1.8, '#6b4526');
    for (let k = 0; k < 6; k++) {
      const fx = x + (k + 0.5) * (w / 6);
      blade(g, fx, y + h + 1.6, 1.6, -Math.PI / 2 + (rng.next() - 0.5), 0.3, 0.6, '#3f6a28');
      ellipse(g, fx + (rng.next() - 0.5), y + h + 0.6 - rng.next(), 0.55, 0.5, ['#d8302a', '#f0c040', '#e8e0f0', '#c060a0'][Math.floor(rng.next() * 4)]);
    }
  }
}

function doorArt(g: G, cx: number, bottom: number, w: number, h: number, o: { arched?: boolean; col?: string; frame?: string; open?: boolean; burned?: boolean; studs?: boolean } = {}) {
  const x = cx - w / 2, top = bottom - h;
  const frame = o.frame ?? TIMBER;
  const col = o.col ?? '#7a5230';
  const path = (pad: number) => {
    g.beginPath();
    g.moveTo(x - pad, bottom);
    if (o.arched) { g.lineTo(x - pad, top + w / 2); g.arc(cx, top + w / 2, w / 2 + pad, Math.PI, 0); }
    else { g.lineTo(x - pad, top - pad); g.lineTo(x + w + pad, top - pad); }
    g.lineTo(x + w + pad, bottom);
    g.closePath();
  };
  path(1.3);
  g.fillStyle = frame;
  g.fill();
  path(0);
  if (o.open || o.burned) {
    g.fillStyle = lin(g, 0, top, 0, bottom, [[0, '#0a0706'], [1, '#1a120c']]);
    g.fill();
  } else {
    g.fillStyle = lin(g, x, 0, x + w, 0, [[0, lit(col, 0.18)], [1, dim(col, 0.25)]]);
    g.fill();
    g.save();
    path(0);
    g.clip();
    g.strokeStyle = rgba(dim(col, 0.5), 0.8);
    g.lineWidth = 0.28;
    for (let px = x + 2.4; px < x + w; px += 2.4) { g.beginPath(); g.moveTo(px, top - 2); g.lineTo(px, bottom); g.stroke(); }
    // iron strap hinges
    g.fillStyle = '#2a2622';
    for (const hy of [top + (o.arched ? w / 2 : 2.5), bottom - 4]) {
      g.fillRect(x, hy, w * 0.7, 0.9);
      ellipse(g, x + w * 0.7, hy + 0.45, 0.6, 0.6, '#2a2622');
    }
    if (o.studs) for (let sy = top + 3; sy < bottom - 1; sy += 3) for (let sx = x + 1.2; sx < x + w; sx += 2.4) ellipse(g, sx, sy, 0.3, 0.3, '#5a5650');
    g.restore();
    ellipse(g, x + w - 1.6, top + h * 0.55, 0.55, 0.55, '#c8a040');
  }
  // step
  roundRect(g, x - 1.8, bottom - 0.4, w + 3.6, 1.8, 0.4, lin(g, 0, bottom - 0.4, 0, bottom + 1.4, [[0, '#a8a296'], [1, '#6a665e']]));
}

function signArt(g: G, x: number, y: number, kind: string) {
  // iron bracket and a hanging board with a painted emblem
  g.strokeStyle = '#2a2622';
  g.lineWidth = 0.6;
  g.beginPath(); g.moveTo(x - 1, y); g.lineTo(x + 9, y); g.moveTo(x - 1, y + 3); g.lineTo(x + 2, y); g.stroke();
  g.lineWidth = 0.3;
  g.beginPath(); g.moveTo(x + 1.5, y); g.lineTo(x + 1.5, y + 1.6); g.moveTo(x + 7.5, y); g.lineTo(x + 7.5, y + 1.6); g.stroke();
  roundRect(g, x, y + 1.6, 9, 8, 1, lin(g, x, 0, x + 9, 0, [[0, '#a87444'], [1, '#6b4526']]), '#2a1a10', 0.35);
  const cx = x + 4.5, cy = y + 5.6;
  switch (kind) {
    case 'tavern': case 'inn':
      roundRect(g, cx - 2, cy - 2.2, 3.4, 4.6, 0.5, lin(g, cx - 2, 0, cx + 1.4, 0, [[0, '#c8cfd6'], [1, '#6f7882']]));
      g.strokeStyle = '#6f7882'; g.lineWidth = 0.5; g.beginPath(); g.arc(cx + 1.6, cy, 1.2, -1.2, 1.2); g.stroke();
      ellipse(g, cx - 0.3, cy - 2.2, 1.9, 0.7, '#f4efe4');
      break;
    case 'smith':
      poly(g, [cx - 3, cy - 1, cx + 3, cy - 1, cx + 2, cy + 0.4, cx + 0.6, cy + 0.4, cx + 0.6, cy + 1.8, cx + 1.8, cy + 2.6, cx - 1.8, cy + 2.6, cx - 0.6, cy + 1.8, cx - 0.6, cy + 0.4, cx - 2.4, cy + 0.2], '#3a3f46');
      break;
    case 'bakery':
      ellipse(g, cx, cy + 0.4, 3, 1.9, rad(g, cx - 1, cy - 0.6, 0.2, cx, cy, 3, [[0, '#efc47e'], [1, '#8f5427']]));
      g.strokeStyle = '#6b3e1c'; g.lineWidth = 0.3;
      for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(cx + k * 1.2 - 0.5, cy - 0.6); g.lineTo(cx + k * 1.2 + 0.5, cy + 1.2); g.stroke(); }
      break;
    case 'herbs': case 'apothecary':
      ellipse(g, cx, cy + 1.2, 2.2, 1.6, '#8a8a90');
      for (let k = 0; k < 5; k++) blade(g, cx + (k - 2) * 0.6, cy + 0.2, 3, -Math.PI / 2 + (k - 2) * 0.35, 0.3, 0.7, k % 2 ? '#5c8f3d' : '#7aab4d');
      break;
    case 'tailor':
      g.strokeStyle = '#c8cfd6'; g.lineWidth = 0.5;
      g.beginPath(); g.moveTo(cx - 2.4, cy - 2.4); g.lineTo(cx + 1.6, cy + 1.2); g.moveTo(cx + 2.4, cy - 2.4); g.lineTo(cx - 1.6, cy + 1.2); g.stroke();
      g.beginPath(); g.arc(cx - 2, cy + 2, 0.9, 0, Math.PI * 2); g.arc(cx + 2, cy + 2, 0.9, 0, Math.PI * 2); g.stroke();
      break;
    case 'bath':
      g.fillStyle = '#5a3a22';
      g.beginPath(); g.moveTo(cx - 3, cy); g.lineTo(cx + 3, cy); g.lineTo(cx + 2.2, cy + 2.6); g.lineTo(cx - 2.2, cy + 2.6); g.closePath(); g.fill();
      for (let k = -1; k <= 1; k++) { g.strokeStyle = '#d8e4ec'; g.lineWidth = 0.35; g.beginPath(); g.moveTo(cx + k * 1.3, cy - 0.5); g.quadraticCurveTo(cx + k * 1.3 + 0.8, cy - 1.6, cx + k * 1.3, cy - 2.8); g.stroke(); }
      break;
    case 'butcher':
      ellipse(g, cx - 0.6, cy, 2.2, 1.6, '#b84848');
      ellipse(g, cx - 0.6, cy, 1, 0.7, '#f0d0c0');
      g.strokeStyle = '#efe6d2'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(cx + 1.4, cy + 0.6); g.lineTo(cx + 3, cy + 2); g.stroke();
      break;
    case 'armorer':
      g.fillStyle = lin(g, cx - 2.4, 0, cx + 2.4, 0, [[0, '#dce2e8'], [1, '#6f7882']]);
      g.beginPath(); g.moveTo(cx - 2.4, cy - 1); g.quadraticCurveTo(cx, cy - 3.8, cx + 2.4, cy - 1); g.lineTo(cx + 2.4, cy + 2.4); g.lineTo(cx - 2.4, cy + 2.4); g.closePath(); g.fill();
      g.fillStyle = '#1a1410'; g.fillRect(cx - 1.8, cy - 0.2, 3.6, 0.5);
      break;
    default:
      for (let k = 0; k < 3; k++) ellipse(g, cx + (k - 1) * 1.6, cy + (k === 1 ? -0.8 : 0.4), 1.2, 1.2, rad(g, cx + (k - 1) * 1.6 - 0.4, cy - 0.4, 0.1, cx + (k - 1) * 1.6, cy, 1.2, [[0, '#f6e39a'], [1, '#9a6e1c']]));
  }
}

function chimneyArt(g: G, x: number, y: number, h: number, rng: RNG) {
  const w = 5.2;
  ashlar(g, x, y, x + w, y + h, rng, ['#8a5a44', '#7a4a38', '#9a6a52', '#6e4636'], 2.4, false);
  g.fillStyle = lin(g, x, 0, x + w, 0, [[0, 'rgba(255,240,220,0.15)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.3)']]);
  g.fillRect(x, y, w, h);
  roundRect(g, x - 0.7, y - 1, w + 1.4, 1.6, 0.4, '#5a5650');
  ellipse(g, x + w / 2, y - 0.6, w / 2 - 0.4, 0.6, '#141110');
  g.fillStyle = lin(g, 0, y, 0, y + 4, [[0, 'rgba(20,16,14,0.55)'], [1, 'rgba(20,16,14,0)']]);
  g.fillRect(x, y + 0.6, w, 4);
}

// ---------------------------------------------------------------- roofs

function thatch(g: G, x0: number, x1: number, top: number, eave: number, rng: RNG, o: { burned?: boolean; hip?: number } = {}) {
  const hip = o.hip ?? 7;
  const H = eave - top;
  const outline = () => {
    g.beginPath();
    g.moveTo(x0 + 1.5, eave);
    g.quadraticCurveTo(x0 - 1, eave - H * 0.25, x0 + hip * 0.4, top + H * 0.35);
    g.quadraticCurveTo(x0 + hip * 0.6, top + 1, x0 + hip + 3, top);
    g.lineTo(x1 - hip - 3, top);
    g.quadraticCurveTo(x1 - hip * 0.6, top + 1, x1 - hip * 0.4, top + H * 0.35);
    g.quadraticCurveTo(x1 + 1, eave - H * 0.25, x1 - 1.5, eave);
    g.closePath();
  };
  // thick eave underside
  g.fillStyle = '#2a1e10';
  g.beginPath(); g.ellipse((x0 + x1) / 2, eave, (x1 - x0) / 2 - 0.5, 2.6, 0, 0, Math.PI); g.fill();
  outline();
  if (o.burned) {
    g.fillStyle = '#141110';
    g.fill();
    g.save(); outline(); g.clip();
    // charred rafters over a dark gap
    for (let x = x0 + 3; x < x1; x += 5 + rng.next() * 3) braceBeam(g, x, eave + 1, x + (rng.next() - 0.5) * 6, top + rng.next() * H * 0.4, 1.6, '#241a14');
    beam(g, x0, top + H * 0.3, x1 - x0, 1.8, '#1e1612');
    for (let i = 0; i < 40; i++) ellipse(g, x0 + rng.next() * (x1 - x0), top + rng.next() * H, 1 + rng.next() * 2, 0.8, rgba(rng.next() < 0.5 ? '#3a3430' : '#0a0908', 0.7));
    for (let i = 0; i < 10; i++) { const x = x0 + rng.next() * (x1 - x0), y = top + rng.next() * H; ellipse(g, x, y, 1.5, 0.7, rgba('#ff6a20', 0.55)); ellipse(g, x, y, 0.6, 0.3, '#ffc070'); }
    g.restore();
    return;
  }
  g.fillStyle = lin(g, 0, top, 0, eave, [[0, '#c8a458'], [0.35, '#b08c46'], [0.8, '#8e6e34'], [1, '#6a5024']]);
  g.fill();
  g.save();
  outline();
  g.clip();
  // the hipped ends turn toward and away from the light
  g.fillStyle = lin(g, x0, 0, x0 + hip * 1.6, 0, [[0, 'rgba(255,236,180,0.22)'], [1, 'rgba(255,236,180,0)']]);
  g.fillRect(x0 - 2, top, hip * 1.6 + 2, H + 2);
  g.fillStyle = lin(g, x1 - hip * 1.8, 0, x1, 0, [[0, 'rgba(20,14,30,0)'], [1, 'rgba(20,14,30,0.4)']]);
  g.fillRect(x1 - hip * 1.8, top, hip * 1.8 + 2, H + 2);
  // courses of straw laid in overlapping rows
  const cols = ['#d6b666', '#c4a052', '#b08c44', '#9c7a3a', '#e0c67a', '#8a6a30'];
  const rows = Math.ceil(H / 3.2);
  for (let r = 0; r < rows; r++) {
    const y = top + r * 3.2;
    const shade = r / rows;
    for (let k = 0; k < (x1 - x0) * 2.2; k++) {
      const x = x0 + rng.next() * (x1 - x0);
      const col = cols[Math.floor(rng.next() * cols.length)];
      const c2 = shade > 0.5 ? dim(col, (shade - 0.5) * 0.5) : lit(col, (0.5 - shade) * 0.25);
      blade(g, x, y - 0.5, 3.2 + rng.next() * 2, Math.PI / 2 + (rng.next() - 0.5) * 0.25, (rng.next() - 0.5) * 0.4, 0.45, c2);
    }
    g.fillStyle = rgba('#3a2a14', 0.2);
    g.fillRect(x0, y + 2.9, x1 - x0, 0.35);
  }
  // weather: moss and darker streaks
  for (let i = 0; i < (x1 - x0) / 5; i++) {
    const x = x0 + rng.next() * (x1 - x0), y = top + H * (0.3 + rng.next() * 0.6);
    ellipse(g, x, y, 1.5 + rng.next() * 3, 1 + rng.next(), rgba(rng.next() < 0.5 ? '#5a6a2a' : '#4a5a24', 0.35));
  }
  // ridge roll with hazel spars
  const ry = top + 2.2;
  roundRect(g, x0 + hip + 1, top - 0.6, x1 - x0 - hip * 2 - 2, 4.4, 2, lin(g, 0, top - 0.6, 0, top + 3.8, [[0, '#d8bc70'], [1, '#7a5e2a']]));
  g.strokeStyle = 'rgba(70,48,20,0.8)';
  g.lineWidth = 0.35;
  for (let x = x0 + hip + 3; x < x1 - hip - 3; x += 3) { g.beginPath(); g.moveTo(x, ry - 1.4); g.lineTo(x + 1.5, ry + 1.4); g.lineTo(x + 3, ry - 1.4); g.stroke(); }
  // the rounded eave edge catches light, then turns under into shadow
  g.fillStyle = lin(g, 0, eave - 6, 0, eave, [[0, 'rgba(255,230,160,0)'], [0.45, 'rgba(255,230,160,0.2)'], [0.7, 'rgba(90,60,20,0.1)'], [1, 'rgba(30,18,8,0.65)']]);
  g.fillRect(x0 - 2, eave - 6, x1 - x0 + 4, 6);
  // a broad sheen across the middle of the slope
  g.fillStyle = lin(g, 0, top, 0, eave, [[0, 'rgba(255,240,200,0)'], [0.35, 'rgba(255,240,200,0.1)'], [0.6, 'rgba(255,240,200,0)']]);
  g.fillRect(x0, top, x1 - x0, H);
  g.restore();
}

function tiledRoof(g: G, x0: number, x1: number, top: number, eave: number, rng: RNG, kind: 'clay' | 'slate' | 'shingle') {
  const H = eave - top;
  const pal = kind === 'clay' ? ['#8e3b2b', '#a24632', '#b8543a', '#9a4030', '#c46a4a', '#7a3024']
    : kind === 'slate' ? ['#3e4450', '#4a5260', '#566070', '#454c58', '#5e6878', '#383e4a']
    : ['#6b4a30', '#7a5838', '#5e4028', '#86643f', '#735236', '#54392a'];
  const tw = kind === 'clay' ? 3.2 : kind === 'slate' ? 4.2 : 3.6;
  const th = kind === 'clay' ? 3.4 : 3;
  // body
  g.fillStyle = lin(g, 0, top, 0, eave, [[0, lit(pal[2], 0.15)], [1, dim(pal[0], 0.3)]]);
  g.beginPath(); g.moveTo(x0, eave); g.lineTo(x0 + 1.2, top); g.lineTo(x1 - 1.2, top); g.lineTo(x1, eave); g.closePath(); g.fill();
  g.save();
  g.beginPath(); g.moveTo(x0, eave); g.lineTo(x0 + 1.2, top); g.lineTo(x1 - 1.2, top); g.lineTo(x1, eave); g.closePath(); g.clip();
  const rows = Math.ceil(H / th) + 1;
  for (let r = 0; r < rows; r++) {
    const y = top + r * th;
    const t = r / rows;
    const off = (r % 2) * tw * 0.5;
    for (let x = x0 - tw + off; x < x1 + tw; x += tw) {
      const col = jitter(pal[Math.floor(rng.next() * pal.length)], rng, 0.04);
      const c = t < 0.5 ? lit(col, (0.5 - t) * 0.2) : dim(col, (t - 0.5) * 0.35);
      if (kind === 'clay') {
        // barrel tiles with rounded lower ends
        g.fillStyle = lin(g, x, 0, x + tw, 0, [[0, dim(c, 0.2)], [0.35, lit(c, 0.2)], [1, dim(c, 0.3)]]);
        g.beginPath(); g.moveTo(x + 0.1, y); g.lineTo(x + tw - 0.1, y); g.lineTo(x + tw - 0.1, y + th); g.arc(x + tw / 2, y + th, tw / 2 - 0.1, 0, Math.PI); g.closePath(); g.fill();
      } else {
        g.fillStyle = lin(g, 0, y, 0, y + th + 0.5, [[0, dim(c, 0.12)], [0.7, c], [1, lit(c, 0.18)]]);
        g.fillRect(x + 0.15, y, tw - 0.3, th + 0.4);
        if (kind === 'shingle' && rng.next() < 0.4) { g.strokeStyle = rgba(dim(c, 0.4), 0.6); g.lineWidth = 0.15; g.beginPath(); g.moveTo(x + tw * 0.5, y + 0.4); g.lineTo(x + tw * 0.5, y + th); g.stroke(); }
      }
      g.fillStyle = 'rgba(10,6,4,0.28)';
      g.fillRect(x, y + th + (kind === 'clay' ? tw / 2 - 0.2 : 0.3), tw, 0.45);
    }
  }
  // lichen and grime
  for (let i = 0; i < (x1 - x0) / 4; i++) ellipse(g, x0 + rng.next() * (x1 - x0), top + rng.next() * H, 0.8 + rng.next() * 1.8, 0.6, rgba(rng.next() < 0.5 ? '#9a9a58' : '#50503a', 0.3));
  g.restore();
  // ridge cap and bargeboards
  roundRect(g, x0 + 0.4, top - 1.4, x1 - x0 - 0.8, 2.6, 1.2, lin(g, 0, top - 1.4, 0, top + 1.2, [[0, lit(pal[2], 0.25)], [1, dim(pal[0], 0.3)]]));
  for (const sx of [0, 1]) {
    const bx = sx ? x1 : x0;
    g.strokeStyle = '#2a1a10';
    g.lineWidth = 1.1;
    g.beginPath(); g.moveTo(bx + (sx ? -1.2 : 1.2), top - 0.5); g.lineTo(bx, eave + 0.5); g.stroke();
  }
  // eave board
  shadedRect(g, x0 - 0.4, eave - 0.4, x1 - x0 + 0.8, 1.6, '#3a2618');
}

// ================================================================ houses

function house(s: BuildingSpec): BuildingArt {
  const lay = new RNG(s.seed * 31 + 7);
  const W = s.w * 16 + 6;
  const burned = s.style === 'burned';
  const ruin = s.style === 'ruin';
  const town = s.style === 'townhouse';
  const barnLike = s.style === 'barn' || s.style === 'shed';
  const wallH = town ? 38 : s.style === 'barn' ? 32 : s.style === 'stone' ? 32 : 30;
  const roofH = s.h * 16 - (town ? 6 : 2) + (s.style === 'barn' ? 6 : 0);
  const H = wallH + roofH + 6;
  const base = H - 1.5;
  const wx0 = 3, wx1 = W - 3;
  const wallTop = base - wallH;
  const eave = wallTop + 3;
  const roofTop = eave - roofH;
  const roof: RoofStyle = s.roof || (town ? 'clay' : s.style === 'stone' ? 'slate' : s.style === 'log' ? 'shingle' : s.style === 'shed' ? 'shingle' : 'thatch');
  const shutter = s.tint || lay.pick([CLOTH.green, CLOTH.blue, CLOTH.russet, CLOTH.red, P.wood2, CLOTH.teal, CLOTH.woad]);

  // --- layout
  const doorCx = s.door >= 0 ? wx0 + s.door * 16 + 8 : -1000;
  const doorW = barnLike ? 13 : 7.5, doorH = barnLike ? 20 : 15;
  const wins: { x: number; y: number; w: number; h: number; row: number }[] = [];
  if (!barnLike && !ruin) {
    const rowsY = town ? [base - 30, base - 13.5] : [base - 19];
    rowsY.forEach((wy, row) => {
      for (let c = 0; c < s.w; c++) {
        const cx = wx0 + c * 16 + 8;
        if (row === rowsY.length - 1 && c === s.door) continue;
        if (Math.abs(cx - doorCx) < 12 && row === rowsY.length - 1) continue;
        if (s.w >= 4 && c % 2 === 1 && lay.chance(0.35) && row === rowsY.length - 1) continue;
        wins.push({ x: cx, y: wy, w: 6, h: town && row === 0 ? 7 : 7.5, row });
      }
    });
  }
  let smoke: { x: number; y: number } | null = null;
  const chimX = lay.chance(0.5) ? wx1 - 16 : wx0 + 10;
  const chimTop = roofTop - 5;
  if (s.chimney && !burned && !ruin) smoke = { x: chimX + 2.6 - W / 2, y: chimTop - base - 1 };
  if (burned && lay.chance(0.8)) smoke = { x: lay.int(8, W - 8) - W / 2, y: eave - 10 - base };
  const signX = s.sign && s.door >= 0 && !burned ? (doorCx + 14 < wx1 - 10 ? doorCx + 6 : doorCx - 15) : null;

  const paint = (): Sprite => {
    const { c, g } = artCanvas(W, H);
    const rng = new RNG(s.seed * 131 + 3);
    // walls
    if (ruin) {
      ashlar(g, wx0, wallTop + 6, wx1, base, rng);
      g.save();
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.moveTo(wx0 - 1, wallTop - 2);
      for (let x = wx0; x <= wx1 + 1; x += 3) g.lineTo(x, wallTop + 6 + Math.abs(Math.sin(x * 0.37 + s.seed)) * 14 + rng.next() * 3);
      g.lineTo(wx1 + 1, wallTop - 2); g.closePath(); g.fill();
      g.restore();
      // ivy and rubble
      for (let i = 0; i < W * 1.4; i++) ellipse(g, wx0 + rng.next() * (wx1 - wx0), base - rng.next() * rng.next() * wallH * 0.8, 0.9, 0.7, rng.next() < 0.5 ? '#3f6a28' : '#56843a', rng.next() * 3);
      for (let i = 0; i < 9; i++) { const x = wx0 + rng.next() * (wx1 - wx0); ellipse(g, x, base - 0.5, 1.5 + rng.next() * 2, 1.2, lin(g, x, base - 2, x, base, [[0, STONE[4]], [1, STONE[1]]])); }
    } else if (burned) {
      charred(g, wx0, wallTop, wx1, base, rng);
    } else if (s.style === 'stone') {
      ashlar(g, wx0, wallTop, wx1, base, rng);
    } else if (s.style === 'log') {
      logs(g, wx0, wallTop, wx1, base, rng);
    } else if (barnLike) {
      planks(g, wx0, wallTop, wx1, base, rng);
      beam(g, wx0, wallTop, 2.2, wallH, TIMBER);
      beam(g, wx1 - 2.2, wallTop, 2.2, wallH, TIMBER);
    } else {
      // half-timbered plaster over a stone plinth
      const upper = town ? base - 20 : wallTop;
      plaster(g, wx0, wallTop, wx1, base - 3, rng, town ? '#e0d4b6' : '#d8ccae');
      if (town) {
        // ground floor in stone, jettied upper floor above
        ashlar(g, wx0, base - 20, wx1, base, rng, STONE, 4.5);
        g.fillStyle = 'rgba(10,6,4,0.35)';
        g.fillRect(wx0, base - 20, wx1 - wx0, 1.4);
      } else {
        ashlar(g, wx0, base - 3.2, wx1, base, rng, STONE, 3.2, false);
      }
      const frameTop = wallTop, frameBot = town ? upper - 1.2 : base - 3.2;
      beam(g, wx0 - (town ? 1 : 0), frameBot - 1.6, wx1 - wx0 + (town ? 2 : 0), 1.8);
      beam(g, wx0, frameTop, wx1 - wx0, 1.8);
      if (!town) beam(g, wx0, frameTop + (frameBot - frameTop) * 0.46, wx1 - wx0, 1.4);
      const posts: number[] = [];
      for (let x = wx0; x <= wx1 - 2; x += 8) posts.push(x);
      posts.push(wx1 - 2);
      for (const px of posts) {
        const nearWin = wins.some((w) => w.row === 0 && Math.abs(w.x - (px + 1)) < w.w / 2 + 3.5) || (!town && Math.abs(px + 1 - doorCx) < doorW / 2 + 1.5);
        if (!nearWin || px === wx0 || px === wx1 - 2) beam(g, px, frameTop, 2, frameBot - frameTop);
      }
      // a few diagonal braces in bays without openings
      for (let b = 0; b < posts.length - 1; b++) {
        const bx0 = posts[b] + 2, bx1 = posts[b + 1];
        const busy = wins.some((w) => w.row === 0 && w.x > bx0 - 4 && w.x < bx1 + 4) || (Math.abs((bx0 + bx1) / 2 - doorCx) < 8 && !town);
        if (!busy && rng.chance(0.7)) {
          const mid = frameTop + (frameBot - frameTop) * (town ? 0.5 : 0.46);
          if (rng.chance(0.5)) braceBeam(g, bx0, mid, bx1, frameTop + 1.5, 1.5); else braceBeam(g, bx0, frameTop + 1.5, bx1, mid, 1.5);
          if (!town) { if (rng.chance(0.5)) braceBeam(g, bx0, frameBot - 1.5, bx1, mid + 1, 1.5); }
        }
      }
    }
    // shade under the eaves and grime at the foot
    g.fillStyle = lin(g, 0, wallTop, 0, wallTop + 9, [[0, 'rgba(12,8,4,0.55)'], [1, 'rgba(12,8,4,0)']]);
    g.fillRect(wx0, wallTop, wx1 - wx0, 9);
    g.fillStyle = lin(g, 0, base - 5, 0, base, [[0, 'rgba(40,28,16,0)'], [1, 'rgba(40,28,16,0.4)']]);
    g.fillRect(wx0, base - 5, wx1 - wx0, 5);
    // side shading: the right end of the wall turns away from the light
    g.fillStyle = lin(g, wx1 - 10, 0, wx1, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.22)']]);
    g.fillRect(wx1 - 10, wallTop, 10, wallH);
    // openings
    for (const w of wins) windowArt(g, w.x, w.y, w.w, w.h, burned ? null : shutter, rng, { box: !burned && w.row === (town ? 1 : 0) && rng.chance(0.5), broken: burned, arched: s.style === 'stone' });
    if (s.door >= 0) doorArt(g, doorCx, base, doorW, doorH, { arched: s.style === 'stone', open: burned, burned, col: barnLike ? '#6a4a2e' : undefined, studs: s.style === 'stone' });
    if (signX !== null && s.sign) signArt(g, signX, wallTop + 7, s.sign);
    // roof
    if (!ruin) {
      if (roof === 'thatch') thatch(g, 0, W, roofTop, eave, rng, { burned });
      else if (burned) thatch(g, 0, W, roofTop, eave, rng, { burned: true, hip: 2 });
      else tiledRoof(g, 0, W, roofTop, eave, rng, roof === 'clay' ? 'clay' : roof === 'slate' ? 'slate' : 'shingle');
      if (s.chimney && !burned) chimneyArt(g, chimX, chimTop, roofTop + roofH * 0.35 - chimTop, rng);
      if (s.style === 'barn') {
        // hay loft door in the gable
        roundRect(g, W / 2 - 4, eave - 13, 8, 8, 0.6, '#1a120c', TIMBER, 0.8);
        for (let k = 0; k < 8; k++) blade(g, W / 2 - 3 + rng.next() * 6, eave - 6, 2, Math.PI / 2 + (rng.next() - 0.5), 0.3, 0.5, '#d4b060');
      }
    }
    grain(c, 8, s.seed);
    rim(c, '#140d08', 0.6, 1);
    return { canvas: c, ox: W / 2, oy: base, w: W, h: H, shadowFrom: 1 };
  };
  return {
    sprite: lazySprite(paint),
    windows: wins.map((w) => ({ x: w.x - W / 2, y: w.y + w.h / 2 - base, w: w.w, h: w.h })),
    smoke,
    doorX: doorCx - W / 2,
  };
}

// ================================================================ church

function church(s: BuildingSpec): BuildingArt {
  const W = s.w * 16 + 6;
  const towerH = 60;
  const wallH = 40;
  const roofH = s.h * 16;
  const H = wallH + roofH + towerH * 0.6 + 8;
  const base = H - 1.5;
  const wallTop = base - wallH, eave = wallTop + 3, roofTop = eave - roofH;
  const doorCx = 3 + s.door * 16 + 8;
  const tw = 20, tx0 = 5;
  const lancets = [] as number[];
  for (let x = tx0 + tw + 8; x < W - 8; x += 12) if (Math.abs(x - doorCx) > 12) lancets.push(x);
  const rose = { x: doorCx, y: wallTop + 9 };
  const paint = (): Sprite => {
    const { c, g } = artCanvas(W, H);
    const rng = new RNG(s.seed + 999);
    ashlar(g, 3, wallTop, W - 3, base, rng);
    // buttresses
    for (let x = tx0 + tw + 3; x < W - 3; x += 12) {
      ashlar(g, x - 1.6, wallTop + 8, x + 1.6, base, rng, STONE, 4, false);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 1.6, wallTop + 8, 1, wallH - 8);
    }
    g.fillStyle = lin(g, 0, wallTop, 0, wallTop + 10, [[0, 'rgba(12,8,4,0.55)'], [1, 'rgba(12,8,4,0)']]);
    g.fillRect(3, wallTop, W - 6, 10);
    for (const x of lancets) windowArt(g, x + 6, wallTop + 12, 4.5, 14, null, rng, { arched: true, frame: '#5a5650' });
    // rose window
    ellipse(g, rose.x, rose.y, 5.4, 5.4, '#5a5650');
    const cols = ['#7a2a3a', '#2a4a8a', '#c8a030', '#2a6a4a', '#6a3a8a'];
    for (let k = 0; k < 8; k++) {
      g.fillStyle = cols[k % cols.length];
      g.beginPath(); g.moveTo(rose.x, rose.y); g.arc(rose.x, rose.y, 4.4, (k / 8) * Math.PI * 2, ((k + 1) / 8) * Math.PI * 2); g.closePath(); g.fill();
    }
    ellipse(g, rose.x, rose.y, 1.4, 1.4, '#e8c040');
    g.strokeStyle = '#3a3630'; g.lineWidth = 0.4;
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; g.beginPath(); g.moveTo(rose.x, rose.y); g.lineTo(rose.x + Math.cos(a) * 4.4, rose.y + Math.sin(a) * 4.4); g.stroke(); }
    doorArt(g, doorCx, base, 9, 17, { arched: true, studs: true, frame: '#6e6a60' });
    tiledRoof(g, 0, W, roofTop, eave, rng, 'slate');
    // bell tower
    const tTop = base - wallH - towerH;
    ashlar(g, tx0, tTop, tx0 + tw, base, rng);
    g.fillStyle = lin(g, tx0, 0, tx0 + tw, 0, [[0, 'rgba(255,240,220,0.12)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.3)']]);
    g.fillRect(tx0, tTop, tw, base - tTop);
    // belfry
    const by = tTop + 8;
    g.fillStyle = '#141110';
    g.beginPath(); g.moveTo(tx0 + 5, by + 12); g.lineTo(tx0 + 5, by + 4); g.arc(tx0 + tw / 2, by + 4, tw / 2 - 5, Math.PI, 0); g.lineTo(tx0 + tw - 5, by + 12); g.closePath(); g.fill();
    ellipse(g, tx0 + tw / 2, by + 7, 3, 3.4, rad(g, tx0 + tw / 2 - 1, by + 5.5, 0.2, tx0 + tw / 2, by + 7, 3.4, [[0, '#f0d070'], [1, '#8a6018']]));
    g.fillStyle = '#6a4a14'; g.fillRect(tx0 + tw / 2 - 3.2, by + 9.8, 6.4, 0.8);
    windowArt(g, tx0 + tw / 2, by + 22, 3.5, 9, null, rng, { arched: true, frame: '#5a5650' });
    // spire
    const sp = tTop;
    g.fillStyle = lin(g, tx0 - 1, 0, tx0 + tw + 1, 0, [[0, '#5e6878'], [0.5, '#4a5260'], [1, '#2a2e38']]);
    g.beginPath(); g.moveTo(tx0 - 1.5, sp + 1); g.lineTo(tx0 + tw / 2, sp - towerH * 0.55); g.lineTo(tx0 + tw + 1.5, sp + 1); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(20,24,30,0.5)'; g.lineWidth = 0.25;
    for (let k = 1; k < 10; k++) { const yy = sp + 1 - (towerH * 0.56 * k) / 10; const hw = (tw / 2 + 1.5) * (1 - k / 10); g.beginPath(); g.moveTo(tx0 + tw / 2 - hw, yy); g.lineTo(tx0 + tw / 2 + hw, yy); g.stroke(); }
    const cx = tx0 + tw / 2, cy = sp - towerH * 0.55;
    g.strokeStyle = '#d8b040'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx, cy - 7); g.moveTo(cx - 2.2, cy - 5); g.lineTo(cx + 2.2, cy - 5); g.stroke();
    grain(c, 7, s.seed);
    rim(c, '#140d08', 0.6, 1);
    return { canvas: c, ox: W / 2, oy: base, w: W, h: H };
  };
  return {
    sprite: lazySprite(paint),
    windows: [{ x: rose.x - W / 2, y: rose.y - base, w: 9, h: 9 }, ...lancets.map((x) => ({ x: x + 6 - W / 2, y: wallTop + 19 - base, w: 4.5, h: 14 }))],
    smoke: null,
    doorX: doorCx - W / 2,
  };
}

// ================================================================ keep, tower, gatehouse

function crenellations(g: G, x0: number, x1: number, y: number, rng: RNG) {
  // walkway seen from above, then merlons along the front edge
  g.fillStyle = lin(g, 0, y - 7, 0, y, [[0, '#6e6a60'], [1, '#8a857a']]);
  g.fillRect(x0, y - 7, x1 - x0, 7);
  for (let i = 0; i < (x1 - x0) / 3; i++) ellipse(g, x0 + rng.next() * (x1 - x0), y - 7 + rng.next() * 6, 1 + rng.next() * 2, 0.6, rgba('#4a4640', 0.4));
  for (let x = x0; x < x1 - 0.5; x += 6) {
    const w = Math.min(3.6, x1 - x);
    roundRect(g, x + 0.2, y - 3.5, w - 0.4, 5.2, 0.5, lin(g, x, y - 3.5, x + w, y + 2, [[0, lit(STONE[4], 0.2)], [1, STONE[1]]]));
  }
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.fillRect(x0, y + 1.6, x1 - x0, 1);
}

function keep(s: BuildingSpec): BuildingArt {
  const isKeep = s.style === 'keep';
  const W = s.w * 16 + 4;
  const wallH = isKeep ? 64 : 54;
  const H = s.h * 16 + wallH - 8;
  const base = H - 1.5;
  const wallTop = base - wallH + 10;
  const doorCx = s.door >= 0 ? 2 + s.door * 16 + 8 : -1000;
  const slits: { x: number; y: number }[] = [];
  for (let row = 0; row < 3; row++) for (let c = 1; c < s.w; c += 2) {
    const x = 2 + c * 16, y = wallTop + 12 + row * 17;
    if (y > base - 24) continue;
    if (Math.abs(x - doorCx) < 8 && row === 2) continue;
    slits.push({ x, y });
  }
  const paint = (): Sprite => {
    const { c, g } = artCanvas(W, H);
    const rng = new RNG(s.seed + 555);
    // roof platform seen from above
    g.fillStyle = lin(g, 0, 0, 0, wallTop, [[0, '#5a564e'], [1, '#77726a']]);
    g.fillRect(2, 2, W - 4, wallTop - 2);
    for (let i = 0; i < W; i++) ellipse(g, 3 + rng.next() * (W - 6), 3 + rng.next() * (wallTop - 6), 1 + rng.next() * 2.5, 0.7, rgba(rng.next() < 0.5 ? '#46423c' : '#8a857a', 0.4));
    // back parapet
    for (let x = 2; x < W - 2; x += 6) roundRect(g, x + 0.2, 0.5, 3.4, 4, 0.5, STONE[2]);
    ashlar(g, 2, wallTop, W - 2, base, rng);
    g.fillStyle = lin(g, 2, 0, W - 2, 0, [[0, 'rgba(255,240,220,0.1)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.3)']]);
    g.fillRect(2, wallTop, W - 4, base - wallTop);
    crenellations(g, 2, W - 2, wallTop, rng);
    for (const sl of slits) {
      roundRect(g, sl.x - 1, sl.y - 0.5, 2, 8, 1, '#5a5650');
      roundRect(g, sl.x - 0.55, sl.y, 1.1, 7, 0.55, '#0e0b09');
    }
    if (s.tint) {
      // a long banner
      const bx = W / 2 - 5.5, by = wallTop + 4;
      beam(g, bx - 1.5, by - 1, 14, 1.4, '#3a2a1c');
      g.fillStyle = lin(g, bx, 0, bx + 11, 0, [[0, lit(s.tint, 0.2)], [0.5, s.tint], [1, dim(s.tint, 0.35)]]);
      g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 11, by); g.lineTo(bx + 11, by + 22); g.lineTo(bx + 5.5, by + 19); g.lineTo(bx, by + 22); g.closePath(); g.fill();
      if (s.tint2) {
        g.fillStyle = s.tint2;
        g.fillRect(bx + 4.7, by + 3, 1.6, 12);
        g.fillRect(bx + 2, by + 6, 7, 1.6);
      }
      g.strokeStyle = rgba('#e8c55a', 0.8); g.lineWidth = 0.35;
      g.strokeRect(bx + 0.8, by + 0.8, 9.4, 17);
    }
    if (s.door >= 0) doorArt(g, doorCx, base, 10, 18, { arched: true, studs: true, frame: '#6e6a60' });
    grain(c, 7, s.seed);
    rim(c, '#140d08', 0.6, 1);
    return { canvas: c, ox: W / 2, oy: base, w: W, h: H };
  };
  return { sprite: lazySprite(paint), windows: slits.map((sl) => ({ x: sl.x - W / 2, y: sl.y + 3.5 - base, w: 1.2, h: 7 })), smoke: null, doorX: doorCx - W / 2 };
}

function gatehouse(s: BuildingSpec): BuildingArt {
  const W = s.w * 16;
  const H = s.h * 16 + 34;
  const base = H - 1.5;
  const wallTop = 12;
  const paint = (): Sprite => {
    const { c, g } = artCanvas(W, H);
    const rng = new RNG(s.seed + 77);
    g.fillStyle = lin(g, 0, 0, 0, wallTop, [[0, '#5a564e'], [1, '#77726a']]);
    g.fillRect(0, 2, W, wallTop - 2);
    ashlar(g, 0, wallTop, W, base, rng);
    crenellations(g, 0, W, wallTop, rng);
    const aw = 26, ax = W / 2 - aw / 2, atop = base - 30;
    g.save();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.moveTo(ax, base + 1); g.lineTo(ax, atop + aw / 2); g.arc(W / 2, atop + aw / 2, aw / 2, Math.PI, 0); g.lineTo(ax + aw, base + 1); g.closePath(); g.fill();
    g.restore();
    // voussoirs around the arch
    g.strokeStyle = STONE[4]; g.lineWidth = 2.2;
    g.beginPath(); g.arc(W / 2, atop + aw / 2, aw / 2 + 1.1, Math.PI, 0); g.stroke();
    g.strokeStyle = 'rgba(30,26,22,0.6)'; g.lineWidth = 0.3;
    for (let k = 0; k <= 10; k++) { const a = Math.PI + (k / 10) * Math.PI; g.beginPath(); g.moveTo(W / 2 + Math.cos(a) * aw / 2, atop + aw / 2 + Math.sin(a) * aw / 2); g.lineTo(W / 2 + Math.cos(a) * (aw / 2 + 2.2), atop + aw / 2 + Math.sin(a) * (aw / 2 + 2.2)); g.stroke(); }
    // raised portcullis teeth
    for (let x = ax + 2; x < ax + aw - 1; x += 3) {
      g.fillStyle = lin(g, x, 0, x + 1, 0, [[0, '#6f7882'], [1, '#34393f']]);
      g.fillRect(x, atop + 2, 1, 7);
      poly(g, [x - 0.2, atop + 9, x + 1.2, atop + 9, x + 0.5, atop + 10.6], '#34393f');
    }
    if (s.tint) for (const bx of [ax - 13, ax + aw + 4]) {
      g.fillStyle = lin(g, bx, 0, bx + 9, 0, [[0, lit(s.tint, 0.2)], [1, dim(s.tint, 0.3)]]);
      g.beginPath(); g.moveTo(bx, wallTop + 5); g.lineTo(bx + 9, wallTop + 5); g.lineTo(bx + 9, wallTop + 22); g.lineTo(bx + 4.5, wallTop + 19.5); g.lineTo(bx, wallTop + 22); g.closePath(); g.fill();
      if (s.tint2) { g.fillStyle = s.tint2; g.fillRect(bx + 3.8, wallTop + 7, 1.4, 10); g.fillRect(bx + 1.5, wallTop + 10, 6, 1.4); }
    }
    grain(c, 7, s.seed);
    rim(c, '#140d08', 0.6, 1);
    return { canvas: c, ox: W / 2, oy: base, w: W, h: H };
  };
  return { sprite: lazySprite(paint), windows: [], smoke: null, doorX: 0 };
}

// ================================================================ tents and stalls

function tent(s: BuildingSpec): BuildingArt {
  const W = s.w * 16 + 6;
  const H = s.h * 16 + 16;
  const base = H - 1.5;
  const c1 = s.tint || '#d8cfb5', c2 = s.tint2 || dim(c1, 0.2);
  const paint = (): Sprite => {
    const { c, g } = artCanvas(W, H);
    const rng = new RNG(s.seed + 3);
    const cx = W / 2, top = 4;
    // guy ropes and pegs
    g.strokeStyle = 'rgba(200,190,160,0.8)'; g.lineWidth = 0.3;
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(cx + sx * 6, top + 8); g.lineTo(cx + sx * (W / 2 - 0.5), base - 2); g.stroke(); poly(g, [cx + sx * (W / 2 - 1), base - 2.5, cx + sx * (W / 2), base - 2.5, cx + sx * (W / 2 - 0.5), base - 0.5], '#6b4526'); }
    // canvas body: a bell tent with sagging panels
    const hw = W / 2 - 3;
    const body = () => {
      g.beginPath();
      g.moveTo(cx, top);
      g.quadraticCurveTo(cx - hw * 0.35, top + (base - top) * 0.3, cx - hw, base - 3);
      g.quadraticCurveTo(cx - hw * 0.8, base, cx - hw * 0.55, base - 0.5);
      g.lineTo(cx + hw * 0.55, base - 0.5);
      g.quadraticCurveTo(cx + hw * 0.8, base, cx + hw, base - 3);
      g.quadraticCurveTo(cx + hw * 0.35, top + (base - top) * 0.3, cx, top);
      g.closePath();
    };
    body();
    g.fillStyle = c1;
    g.fill();
    g.save();
    body();
    g.clip();
    const panels = 9;
    for (let k = 0; k < panels; k++) {
      const t0 = k / panels, t1 = (k + 1) / panels;
      g.fillStyle = k % 2 ? c1 : c2;
      g.beginPath();
      g.moveTo(cx, top);
      g.lineTo(cx - hw * 1.1 + t0 * hw * 2.2, base + 1);
      g.lineTo(cx - hw * 1.1 + t1 * hw * 2.2, base + 1);
      g.closePath();
      g.fill();
    }
    g.fillStyle = lin(g, cx - hw, 0, cx + hw, 0, [[0, 'rgba(255,245,225,0.25)'], [0.45, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.45)']]);
    g.fillRect(0, 0, W, H);
    g.fillStyle = lin(g, 0, base - 8, 0, base, [[0, 'rgba(40,28,16,0)'], [1, 'rgba(40,28,16,0.45)']]);
    g.fillRect(0, base - 8, W, 8);
    for (let i = 0; i < 30; i++) ellipse(g, rng.next() * W, top + rng.next() * (base - top), 1 + rng.next() * 3, 0.7, rgba(rng.next() < 0.5 ? '#2a2016' : '#fff8e8', 0.08));
    g.restore();
    // entrance flap
    if (s.door >= 0 || true) {
      g.fillStyle = lin(g, 0, base - 15, 0, base, [[0, '#1a120c'], [1, '#2a1e14']]);
      g.beginPath(); g.moveTo(cx, base - 15); g.quadraticCurveTo(cx - 3, base - 6, cx - 5.5, base - 0.5); g.lineTo(cx + 5.5, base - 0.5); g.quadraticCurveTo(cx + 3, base - 6, cx, base - 15); g.closePath(); g.fill();
      g.fillStyle = dim(c1, 0.15);
      g.beginPath(); g.moveTo(cx, base - 15); g.quadraticCurveTo(cx + 1.5, base - 7, cx + 5.8, base - 0.5); g.lineTo(cx + 7.2, base - 1.2); g.quadraticCurveTo(cx + 3, base - 8, cx, base - 15); g.closePath(); g.fill();
    }
    // pole and pennant
    g.strokeStyle = '#4a3222'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(cx, top + 1); g.lineTo(cx, 0.5); g.stroke();
    g.fillStyle = s.tint2 || '#8e2f2f';
    g.beginPath(); g.moveTo(cx + 0.4, 0.6); g.quadraticCurveTo(cx + 3, 1.4, cx + 5.5, 1.2); g.lineTo(cx + 0.4, 3.4); g.closePath(); g.fill();
    rim(c, '#140d08', 0.55, 1);
    return { canvas: c, ox: W / 2, oy: base, w: W, h: H };
  };
  return { sprite: lazySprite(paint), windows: [], smoke: null, doorX: 0 };
}

function stall(s: BuildingSpec): BuildingArt {
  const W = s.w * 16 + 6;
  const H = 38;
  const base = H - 1.5;
  const paint = (): Sprite => {
    const { c, g } = artCanvas(W, H);
    const rng = new RNG(s.seed + 9);
    // posts
    for (const px of [3.5, W - 5.5]) beam(g, px, 7, 2, base - 7, '#5a3a22');
    // counter
    planks(g, 2.5, base - 11, W - 2.5, base, rng, '#8a6038');
    shadedRect(g, 1.8, base - 12.5, W - 3.6, 2.2, '#a87444');
    // goods
    const goods = [
      (x: number, y: number) => ellipse(g, x, y, 1.6, 1.2, rad(g, x - 0.5, y - 0.5, 0.1, x, y, 1.6, [[0, '#efc47e'], [1, '#8f5427']])),
      (x: number, y: number) => { for (let k = 0; k < 3; k++) ellipse(g, x - 1 + k, y - (k % 2) * 0.8, 0.8, 0.8, rad(g, x - 1.3 + k, y - 0.4, 0.1, x - 1 + k, y, 0.8, [[0, '#f07060'], [1, '#8a1a1a']])); },
      (x: number, y: number) => { ellipse(g, x, y, 1.4, 1.1, '#5c8f3d'); ellipse(g, x - 0.3, y - 0.3, 0.6, 0.4, '#8fc060'); },
      (x: number, y: number) => roundRect(g, x - 1.6, y - 1, 3.2, 2, 0.4, lin(g, x, y - 1, x, y + 1, [[0, '#6a8ac8'], [1, '#2f4e7e']])),
      (x: number, y: number) => ellipse(g, x, y, 1.3, 1.3, rad(g, x - 0.4, y - 0.4, 0.1, x, y, 1.3, [[0, '#d88a60'], [1, '#6e2c22']])),
      (x: number, y: number) => ellipse(g, x, y, 1.5, 1, '#e8e0c8'),
    ];
    for (let x = 6; x < W - 6; x += 3.4) goods[Math.floor(rng.next() * goods.length)](x, base - 13.4);
    // striped awning with a scalloped hem
    const c1 = s.tint || CLOTH.red, c2 = s.tint2 || P.white;
    const aw = () => { g.beginPath(); g.moveTo(0.5, 9); g.lineTo(3, 1.5); g.lineTo(W - 3, 1.5); g.lineTo(W - 0.5, 9); for (let x = W - 0.5; x > 0.5; x -= 3.2) g.quadraticCurveTo(x - 1.6, 11.5, x - 3.2, 9); g.closePath(); };
    aw();
    g.fillStyle = c1; g.fill();
    g.save(); aw(); g.clip();
    for (let x = 0; x < W; x += 6.4) { g.fillStyle = c2; g.beginPath(); g.moveTo(x + 1.5, 1.5); g.lineTo(x + 4.7, 1.5); g.lineTo(x + 4.3, 12); g.lineTo(x + 1.1, 12); g.closePath(); g.fill(); }
    g.fillStyle = lin(g, 0, 1.5, 0, 12, [[0, 'rgba(255,245,225,0.2)'], [0.6, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,20,0.35)']]);
    g.fillRect(0, 0, W, 12);
    g.restore();
    rim(c, '#140d08', 0.55, 1);
    return { canvas: c, ox: W / 2, oy: base, w: W, h: H };
  };
  return { sprite: lazySprite(paint), windows: [], smoke: null, doorX: 0 };
}

export { clamp, mix };
