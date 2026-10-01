// Trees, bushes, rocks and plants, painted at high resolution. Leafy
// canopies are built from clusters of leaf dabs lit from the upper left,
// and trees keep their canopy on a separate layer so it can sway.

import { RNG, clamp } from '../engine/util';
import { Sprite, cachedSprite } from './sprite';
import { artCanvas, ART, rim, lit, dim, rgba, ellipse, blob, blade, poly, lin, rad, newCanvas, jitter, trimCanvas } from './paint';

export type TreeKind = 'oak' | 'linden' | 'birch' | 'pine' | 'apple' | 'dead' | 'burnt' | 'willow';

type G = CanvasRenderingContext2D;

const LEAF: Record<string, string[]> = {
  oak: ['#15270f', '#1d3615', '#27471c', '#315a23', '#3e6c2b', '#4d7e34', '#5f903e', '#78a44d', '#94ba62'],
  linden: ['#1a2f12', '#243f18', '#2f521f', '#3b6427', '#48762f', '#588939', '#6c9c44', '#86b054', '#a2c46a'],
  apple: ['#1f3516', '#2a4a1d', '#365e25', '#43712d', '#528436', '#649741', '#7aaa4e', '#94be60'],
  birch: ['#2a4219', '#375720', '#466d28', '#568230', '#68963a', '#7ea946', '#96bc56', '#b0cf6c', '#c8dc84'],
  willow: ['#213819', '#2d4b20', '#3a5f28', '#487330', '#588639', '#6a9944', '#80ac52', '#9abf66', '#b4d07c'],
  pine: ['#0c1d14', '#11281a', '#183421', '#1f4229', '#285032', '#325e3b', '#3d6c45', '#4b7b50'],
  bush: ['#1c3014', '#27441a', '#335822', '#3f6b29', '#4d7d31', '#5e903b', '#72a247', '#8ab657'],
  burnt: ['#0c0a09', '#161311', '#201c19', '#2a2522', '#35302c', '#403a35'],
};
const BARK = {
  oak: ['#2a1d14', '#3b2a1e', '#4e3828', '#634834', '#7a5b42'],
  linden: ['#2c2520', '#3d342c', '#51463b', '#665a4c', '#7c6f5f'],
  willow: ['#2a2218', '#3b3024', '#4f4231', '#65563f', '#7b6b50'],
  pine: ['#26170f', '#382216', '#4c2f1e', '#603d27', '#764d33'],
  dead: ['#2a241e', '#3d352c', '#524839', '#685c4a', '#7e725e'],
  burnt: ['#0a0908', '#141110', '#1e1a18', '#2a2522', '#3a3430'],
};

// ---------------------------------------------------------------- canopy

interface Cluster { x: number; y: number; r: number }
interface Box { cx: number; cy: number; rx: number; ry: number }

/** Paints leafy clusters as dabs lit by both the whole crown and each clump. */
function paintCanopy(g: G, clusters: Cluster[], box: Box, pal: string[], rng: RNG, o: { dab?: number; density?: number; fruit?: string; blossom?: string; flat?: number } = {}) {
  const dabR = o.dab ?? 1.35;
  const dens = o.density ?? 1.7;
  const flat = o.flat ?? 0.82;
  const sorted = [...clusters].sort((a, b) => a.y - b.y);
  const L = pal.length;
  for (const c of sorted) {
    // dark core gives the gaps between clumps their depth
    blob(g, c.x, c.y + c.r * 0.06, c.r * 1.0, c.r * flat * 1.02, rng, pal[1], 9, 0.14);
    blob(g, c.x + c.r * 0.08, c.y + c.r * 0.14, c.r * 0.86, c.r * flat * 0.86, rng, pal[0], 8, 0.12);
    const n = Math.floor(c.r * c.r * dens);
    const dabs: [number, number, number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      const a = rng.next() * Math.PI * 2;
      const d = Math.sqrt(rng.next()) * c.r * 0.97;
      const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d * flat;
      const lx = (x - c.x) / c.r, ly = (y - c.y) / (c.r * flat);
      const lz = Math.sqrt(Math.max(0, 1 - lx * lx - ly * ly));
      const gx = (x - box.cx) / box.rx, gy = (y - box.cy) / box.ry;
      const local = -lx * 0.45 - ly * 0.7 + lz * 0.55;
      const global = -gx * 0.4 - gy * 0.62;
      const lum = local * 0.55 + global * 0.45 + (rng.next() - 0.5) * 0.35;
      const idx = clamp(Math.floor((lum + 0.55) * (L - 1) * 0.72), 1, L - 1);
      dabs.push([x, y, idx, dabR * (0.7 + rng.next() * 0.6), rng.next() * Math.PI]);
    }
    dabs.sort((p, q) => p[2] - q[2]);
    for (const [x, y, idx, r, rot] of dabs) ellipse(g, x, y, r, r * 0.66, pal[idx], rot);
    // a few crisp highlights on the lit shoulder
    for (let i = 0; i < c.r * 0.9; i++) {
      const a = -2.2 + (rng.next() - 0.5) * 1.3;
      const d = c.r * (0.45 + rng.next() * 0.4);
      ellipse(g, c.x + Math.cos(a) * d, c.y + Math.sin(a) * d * flat, dabR * 0.55, dabR * 0.38, pal[L - 1], rng.next() * 3);
    }
  }
  if (o.fruit || o.blossom) {
    const col = o.fruit || o.blossom!;
    for (const c of sorted) {
      const k = Math.floor(c.r * (o.fruit ? 0.5 : 1.4));
      for (let i = 0; i < k; i++) {
        const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next()) * c.r * 0.8;
        const x = c.x + Math.cos(a) * d, y = c.y + Math.sin(a) * d * flat;
        if (o.fruit) {
          ellipse(g, x + 0.2, y + 0.3, 0.95, 0.9, 'rgba(10,6,2,0.35)');
          ellipse(g, x, y, 0.95, 0.9, rad(g, x - 0.35, y - 0.35, 0.05, x, y, 1, [[0, lit(col, 0.5)], [0.6, col], [1, dim(col, 0.4)]]));
        } else {
          ellipse(g, x, y, 0.6, 0.5, col);
          ellipse(g, x, y, 0.2, 0.2, '#e8c070');
        }
      }
    }
  }
}

function crownClusters(rng: RNG, box: Box, n: number, rMin: number, rMax: number): Cluster[] {
  const out: Cluster[] = [{ x: box.cx, y: box.cy, r: (rMin + rMax) * 0.62 }];
  let tries = 0;
  while (out.length < n && tries++ < 400) {
    const a = rng.next() * Math.PI * 2, d = Math.sqrt(rng.next());
    const r = rMin + rng.next() * (rMax - rMin);
    const x = box.cx + Math.cos(a) * d * (box.rx - r * 0.8);
    const y = box.cy + Math.sin(a) * d * (box.ry - r * 0.6);
    out.push({ x, y, r });
  }
  return out;
}

// ---------------------------------------------------------------- trunks and branches

function trunk(g: G, x: number, baseY: number, topY: number, w0: number, w1: number, bark: string[], rng: RNG, o: { roots?: boolean; lean?: number; moss?: boolean } = {}) {
  const lean = o.lean ?? (rng.next() - 0.5) * 3;
  const H = baseY - topY;
  const pts: number[] = [];
  const steps = 8;
  const L: [number, number][] = [], Rr: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = baseY - H * t;
    const cx = x + lean * t * t + Math.sin(t * 5 + rng.next()) * 0.35;
    const w = (w0 + (w1 - w0) * Math.pow(t, 0.8)) / 2 + (t < 0.12 && o.roots !== false ? (0.12 - t) * 14 : 0);
    L.push([cx - w, y]);
    Rr.push([cx + w, y]);
  }
  for (const [px, py] of L) pts.push(px, py);
  for (let i = Rr.length - 1; i >= 0; i--) pts.push(Rr[i][0], Rr[i][1]);
  const gx0 = x - w0 / 2 - 1, gx1 = x + w0 / 2 + 1;
  poly(g, pts, lin(g, gx0, 0, gx1, 0, [[0, bark[3]], [0.3, bark[2]], [0.7, bark[1]], [1, bark[0]]]));
  // bark furrows
  g.lineWidth = 0.28;
  for (let k = 0; k < w0 * 1.6; k++) {
    const fx = (rng.next() - 0.5) * 0.8;
    const t0 = rng.next() * 0.8, t1 = Math.min(1, t0 + 0.1 + rng.next() * 0.35);
    g.strokeStyle = rgba(rng.next() < 0.65 ? bark[0] : bark[4], rng.next() < 0.65 ? 0.55 : 0.35);
    g.beginPath();
    for (let t = t0; t <= t1; t += 0.05) {
      const y = baseY - H * t;
      const cx = x + lean * t * t;
      const w = (w0 + (w1 - w0) * Math.pow(t, 0.8)) / 2;
      const px = cx + fx * w * 2 + Math.sin(t * 20 + k) * 0.25;
      if (t === t0) g.moveTo(px, y); else g.lineTo(px, y);
    }
    g.stroke();
  }
  if (o.moss) {
    for (let k = 0; k < 18; k++) {
      const t = rng.next() * 0.3;
      const y = baseY - H * t;
      const w = (w0 + (w1 - w0) * t) / 2;
      ellipse(g, x - w * (0.2 + rng.next() * 0.7), y, 0.7, 0.5, rng.next() < 0.5 ? '#4a6a2c' : '#5d7d36');
    }
  }
  // grass tufts at the foot
  for (let k = 0; k < 5; k++) blade(g, x + (rng.next() - 0.5) * w0 * 1.6, baseY + 0.4, 2 + rng.next() * 2, -Math.PI / 2 + (rng.next() - 0.5) * 1.2, (rng.next() - 0.5), 0.5, rng.next() < 0.5 ? '#3d6628' : '#56843a');
}

function branch(g: G, x: number, y: number, ang: number, len: number, w: number, bark: string[], rng: RNG, depth: number) {
  const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
  const mx = (x + x2) / 2 + (rng.next() - 0.5) * len * 0.25, my = (y + y2) / 2 + (rng.next() - 0.5) * len * 0.2;
  g.strokeStyle = bark[1];
  g.lineWidth = w;
  g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(mx, my, x2, y2); g.stroke();
  g.strokeStyle = rgba(bark[3], 0.6);
  g.lineWidth = w * 0.35;
  g.beginPath(); g.moveTo(x - w * 0.2, y); g.quadraticCurveTo(mx - w * 0.2, my, x2 - w * 0.15, y2); g.stroke();
  if (depth > 0) {
    const n = 2 + (rng.next() < 0.3 ? 1 : 0);
    for (let i = 0; i < n; i++) branch(g, x2, y2, ang + (rng.next() - 0.5) * 1.3, len * (0.55 + rng.next() * 0.2), w * 0.62, bark, rng, depth - 1);
  }
}

// ---------------------------------------------------------------- tree assembly

function layered(W: number, H: number, ox: number, oy: number, pivot: number, sway: number, paintBase: (g: G) => void, paintTop: (g: G) => void): Sprite {
  const b = artCanvas(W, H), t = artCanvas(W, H);
  paintBase(b.g);
  paintTop(t.g);
  rim(b.c, '#140d08', 0.55, 1);
  rim(t.c, '#0f160b', 0.5, 1);
  const full = newCanvas(b.c.width, b.c.height);
  const fg = full.getContext('2d')!;
  fg.drawImage(b.c, 0, 0);
  fg.drawImage(t.c, 0, 0);
  // crop each layer to its paint: most of a tree's box is empty air
  const bt = trimCanvas(b.c), tt = trimCanvas(t.c);
  const k = b.c.width / W;
  return {
    canvas: full, ox, oy, w: W, h: H,
    parts: { base: bt.c, top: tt.c, pivot, sway, b: [bt.x / k, bt.y / k, bt.w / k, bt.h / k], t: [tt.x / k, tt.y / k, tt.w / k, tt.h / k] },
  };
}

export function treeSprite(kind: TreeKind, variant: number): Sprite {
  const v = variant % 8;
  return cachedSprite(`tree2:${kind}:${v}`, () => {
    const rng = new RNG(v * 7919 + kind.length * 131 + 17);
    const s = 0.9 + rng.next() * 0.22;
    switch (kind) {
      case 'pine': return pine(rng, s);
      case 'birch': return birch(rng, s);
      case 'willow': return willow(rng, s);
      case 'dead': case 'burnt': return bare(rng, s, kind === 'burnt');
      default: return broadleaf(kind, rng, s);
    }
  });
}

function broadleaf(kind: 'oak' | 'linden' | 'apple', rng: RNG, s: number): Sprite {
  const big = kind === 'oak' ? 1.08 : kind === 'apple' ? 0.72 : 1;
  const W = Math.round(56 * big * s), H = Math.round(70 * big * s);
  const baseX = W / 2, baseY = H - 3;
  const box: Box = { cx: W / 2 + (rng.next() - 0.5) * 3, cy: H * (kind === 'apple' ? 0.4 : 0.37), rx: W * 0.46, ry: H * (kind === 'apple' ? 0.3 : 0.31) };
  const topY = box.cy + box.ry * 0.35;
  const bark = kind === 'linden' ? BARK.linden : BARK.oak;
  const pal = LEAF[kind];
  const clusters = crownClusters(rng, box, kind === 'apple' ? 8 : 12, W * 0.16, W * 0.25);
  const fruit = kind === 'apple' ? (rng.next() < 0.7 ? '#c8302a' : '#d8a030') : undefined;
  return layered(W, H, baseX, baseY, topY, kind === 'oak' ? 0.012 : 0.016, (g) => {
    ellipse(g, baseX, baseY + 0.5, W * 0.12, 1.6, 'rgba(10,8,4,0.3)');
    trunk(g, baseX, baseY, topY - 4, kind === 'oak' ? 8.5 * s : 7 * s, 4.2 * s, bark, rng, { moss: kind === 'oak' });
    for (let i = 0; i < 3; i++) branch(g, baseX + (rng.next() - 0.5) * 2, topY, -Math.PI / 2 + (i - 1) * 0.75 + (rng.next() - 0.5) * 0.3, H * 0.16, 2.6 * s, bark, rng, 1);
  }, (g) => {
    paintCanopy(g, clusters, box, pal, rng, { fruit, dab: kind === 'apple' ? 1.15 : 1.35, density: 1.75 });
  });
}

function birch(rng: RNG, s: number): Sprite {
  const W = Math.round(36 * s), H = Math.round(60 * s);
  const baseX = W / 2, baseY = H - 3;
  const box: Box = { cx: W / 2, cy: H * 0.34, rx: W * 0.44, ry: H * 0.28 };
  const pal = LEAF.birch;
  const clusters = crownClusters(rng, box, 9, W * 0.15, W * 0.24);
  const lean = (rng.next() - 0.5) * 4;
  return layered(W, H, baseX, baseY, box.cy + box.ry * 0.4, 0.02, (g) => {
    ellipse(g, baseX, baseY + 0.4, 4, 1.2, 'rgba(10,8,4,0.3)');
    const topY = H * 0.14;
    const steps = 10;
    const pts: number[] = [];
    const L: [number, number][] = [], R: [number, number][] = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, y = baseY - (baseY - topY) * t, cx = baseX + lean * t * t, w = (3.4 - t * 2) * s / 2 + (t < 0.08 ? (0.08 - t) * 10 : 0);
      L.push([cx - w, y]); R.push([cx + w, y]);
    }
    for (const [x, y] of L) pts.push(x, y);
    for (let i = R.length - 1; i >= 0; i--) pts.push(R[i][0], R[i][1]);
    poly(g, pts, lin(g, baseX - 2, 0, baseX + 2, 0, [[0, '#f4f0e6'], [0.5, '#dcd6c8'], [1, '#9c968a']]));
    // black lenticels and scars
    for (let k = 0; k < 26; k++) {
      const t = rng.next() * 0.9, y = baseY - (baseY - topY) * t, cx = baseX + lean * t * t;
      const w = (3.4 - t * 2) * s / 2;
      g.fillStyle = rng.next() < 0.7 ? '#2a2622' : '#5a544c';
      g.fillRect(cx - w + rng.next() * w * 0.6, y, w * (0.5 + rng.next() * 0.9), 0.35 + rng.next() * 0.45);
    }
    g.fillStyle = 'rgba(40,34,30,0.6)';
    g.fillRect(baseX - 2.2, baseY - 4, 4.4, 4);
    for (let i = 0; i < 4; i++) branch(g, baseX + lean * 0.4, H * (0.28 + i * 0.08), -Math.PI / 2 + (i % 2 ? 0.8 : -0.8), H * 0.12, 1.1, ['#3a342e', '#5a544c', '#8a847a', '#c8c2b6', '#e8e4da'], rng, 1);
  }, (g) => {
    paintCanopy(g, clusters, box, pal, rng, { dab: 1.05, density: 1.35, flat: 0.9 });
  });
}

function pine(rng: RNG, s: number): Sprite {
  const W = Math.round(38 * s), H = Math.round(68 * s);
  const baseX = W / 2, baseY = H - 3;
  const pal = LEAF.pine;
  const tiers = 6 + Math.floor(rng.next() * 2);
  return layered(W, H, baseX, baseY, H * 0.55, 0.008, (g) => {
    ellipse(g, baseX, baseY + 0.4, 5, 1.4, 'rgba(10,8,4,0.3)');
    trunk(g, baseX, baseY, H * 0.5, 5 * s, 3 * s, BARK.pine, rng, { lean: 0 });
  }, (g) => {
    const top = 2, bottom = H - 11;
    for (let i = 0; i < tiers; i++) {
      const t = i / (tiers - 1); // 0 bottom .. 1 top
      const ty = bottom - (bottom - top - 6) * t;
      const hw = (W / 2 - 1.5) * (1 - t * 0.78) * (0.92 + rng.next() * 0.12);
      const th = (bottom - top) / tiers * 1.9;
      // skirt silhouette with a scalloped hem
      g.beginPath();
      g.moveTo(baseX, ty - th);
      const segs = 7;
      g.quadraticCurveTo(baseX - hw * 0.45, ty - th * 0.45, baseX - hw, ty + 0.5);
      for (let k = 0; k < segs; k++) {
        const x0 = baseX - hw + (2 * hw * k) / segs, x1 = baseX - hw + (2 * hw * (k + 1)) / segs;
        g.quadraticCurveTo((x0 + x1) / 2, ty + 2.4 + rng.next() * 0.8, x1, ty + 0.3);
      }
      g.quadraticCurveTo(baseX + hw * 0.45, ty - th * 0.45, baseX, ty - th);
      g.closePath();
      g.fillStyle = lin(g, baseX - hw, ty - th, baseX + hw, ty, [[0, pal[3]], [0.5, pal[2]], [1, pal[0]]]);
      g.fill();
      // needles, lit on the left
      const n = Math.floor(hw * th * 1.3);
      for (let k = 0; k < n; k++) {
        const u = rng.next() * 2 - 1;
        const v = rng.next();
        const x = baseX + u * hw * (0.35 + v * 0.65);
        const y = ty - th * (1 - v) * 0.85 + 1;
        const light = -u * 0.5 + (1 - v) * 0.2 + (rng.next() - 0.5) * 0.5;
        const idx = clamp(Math.floor((light + 0.6) * 4.2), 1, pal.length - 1);
        blade(g, x, y, 1.6 + rng.next() * 1.2, Math.PI / 2 + u * 0.9 + (rng.next() - 0.5) * 0.4, 0.2, 0.45, pal[idx]);
      }
      // snow-light rim on the upper left edge
      g.strokeStyle = rgba(pal[7], 0.5);
      g.lineWidth = 0.4;
      g.beginPath();
      g.moveTo(baseX - 0.5, ty - th + 1);
      g.quadraticCurveTo(baseX - hw * 0.45, ty - th * 0.45, baseX - hw + 0.8, ty);
      g.stroke();
    }
  });
}

function willow(rng: RNG, s: number): Sprite {
  const W = Math.round(60 * s), H = Math.round(62 * s);
  const baseX = W / 2, baseY = H - 3;
  const box: Box = { cx: W / 2, cy: H * 0.34, rx: W * 0.44, ry: H * 0.25 };
  const pal = LEAF.willow;
  const clusters = crownClusters(rng, box, 11, W * 0.14, W * 0.22);
  return layered(W, H, baseX, baseY, box.cy + box.ry * 0.5, 0.018, (g) => {
    ellipse(g, baseX, baseY + 0.4, W * 0.12, 1.6, 'rgba(10,8,4,0.3)');
    trunk(g, baseX, baseY, box.cy + 4, 10 * s, 5 * s, BARK.willow, rng, { moss: true, lean: (rng.next() - 0.5) * 5 });
    for (let i = 0; i < 3; i++) branch(g, baseX, box.cy + 6, -Math.PI / 2 + (i - 1) * 0.9, H * 0.13, 2.8, BARK.willow, rng, 1);
  }, (g) => {
    paintCanopy(g, clusters, box, pal, rng, { dab: 1.2, density: 1.5, flat: 0.75 });
    // hanging fronds
    const n = Math.floor(W * 1.4);
    const strands: [number, number, number][] = [];
    for (let i = 0; i < n; i++) {
      const x = box.cx + (rng.next() * 2 - 1) * box.rx * 0.98;
      const edge = box.cy + box.ry * Math.sqrt(Math.max(0, 1 - ((x - box.cx) / box.rx) ** 2)) * 0.85;
      const y0 = edge - rng.next() * box.ry * 1.2;
      strands.push([x, y0, 8 + rng.next() * (baseY - y0 - 6) * 0.7]);
    }
    strands.sort((a, b) => a[1] - b[1]);
    for (const [x, y0, len] of strands) {
      const sway = (rng.next() - 0.5) * 2;
      const side = (x - box.cx) / box.rx;
      for (let k = 0; k < len; k += 1.1) {
        const t = k / len;
        const px = x + sway * t * t + side * t * 2;
        const light = -side * 0.4 - t * 0.5 + (rng.next() - 0.5) * 0.4;
        const idx = clamp(Math.floor((light + 0.7) * 5), 1, pal.length - 1);
        ellipse(g, px, y0 + k, 0.55, 0.95, pal[idx], side * 0.3);
      }
    }
  });
}

function bare(rng: RNG, s: number, burnt: boolean): Sprite {
  const W = Math.round(42 * s), H = Math.round(58 * s);
  const baseX = W / 2, baseY = H - 3;
  const bark = burnt ? BARK.burnt : BARK.dead;
  return layered(W, H, baseX, baseY, H * 0.5, 0.004, (g) => {
    ellipse(g, baseX, baseY + 0.4, 6, 1.5, 'rgba(10,8,4,0.3)');
    trunk(g, baseX, baseY, H * 0.3, 7 * s, 3.5 * s, bark, rng, { lean: (rng.next() - 0.5) * 4 });
    if (burnt) {
      for (let k = 0; k < 7; k++) {
        const y = baseY - rng.next() * H * 0.5, x = baseX + (rng.next() - 0.5) * 4;
        ellipse(g, x, y, 0.9, 0.35, rgba('#ff8a3a', 0.8));
        ellipse(g, x, y, 0.45, 0.2, '#ffd080');
      }
    }
  }, (g) => {
    for (let i = 0; i < 4; i++) branch(g, baseX + (rng.next() - 0.5) * 2, H * (0.3 + i * 0.07), -Math.PI / 2 + (i - 1.5) * 0.55 + (rng.next() - 0.5) * 0.3, H * 0.2, 2.4 * s, bark, rng, 2);
    if (!burnt) for (let k = 0; k < 14; k++) ellipse(g, W * (0.2 + rng.next() * 0.6), H * (0.12 + rng.next() * 0.35), 0.8, 0.5, rng.next() < 0.5 ? '#8a6a30' : '#6a5028', rng.next() * 3);
  });
}

// ---------------------------------------------------------------- bushes and rocks

export function bushSprite(variant: number, berries?: string, burnt = false): Sprite {
  return cachedSprite(`bush2:${variant % 8}:${berries || ''}:${burnt}`, () => {
    const rng = new RNG(variant * 37 + 5);
    const W = 24 + rng.int(0, 4), H = 19;
    const { c, g } = artCanvas(W, H);
    const baseY = H - 2;
    if (burnt) {
      ellipse(g, W / 2, baseY, W * 0.35, 2, 'rgba(10,8,6,0.4)');
      for (let i = 0; i < 9; i++) branch(g, W / 2 + (rng.next() - 0.5) * 6, baseY, -Math.PI / 2 + (rng.next() - 0.5) * 1.8, 6 + rng.next() * 5, 0.9, BARK.burnt, rng, 1);
      for (let i = 0; i < 20; i++) ellipse(g, W / 2 + (rng.next() - 0.5) * W * 0.7, baseY - rng.next() * 3, 1, 0.6, rng.next() < 0.5 ? '#3a3532' : '#57504a');
    } else {
      const box: Box = { cx: W / 2, cy: baseY - 6.5, rx: W * 0.44, ry: 6.5 };
      const clusters = crownClusters(rng, box, 5, 4.2, 6.2);
      paintCanopy(g, clusters, box, LEAF.bush, rng, { dab: 1.05, density: 1.9, fruit: berries });
      for (let k = 0; k < 6; k++) blade(g, W / 2 + (rng.next() - 0.5) * W * 0.7, baseY + 0.6, 2 + rng.next() * 2, -Math.PI / 2 + (rng.next() - 0.5) * 1.2, 0.4, 0.5, rng.next() < 0.5 ? '#3d6628' : '#56843a');
    }
    rim(c, '#0f160b', 0.5, 1);
    return { canvas: c, ox: W / 2, oy: baseY, w: W, h: H };
  });
}

export function rockSprite(variant: number, size: 'small' | 'big' | 'boulder' = 'small', mossy = false): Sprite {
  return cachedSprite(`rock2:${variant % 8}:${size}:${mossy}`, () => {
    const rng = new RNG(variant * 101 + size.length);
    const W = size === 'boulder' ? 36 : size === 'big' ? 22 : 12;
    const H = size === 'boulder' ? 28 : size === 'big' ? 17 : 9;
    const { c, g } = artCanvas(W, H);
    const cx = W / 2, by = H - 1.5;
    const rx = W * 0.44, ry = H * 0.8;
    const cy = by - ry * 0.55;
    // silhouette: flattened bottom, knobbly top
    const n = 11;
    const pts: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.PI + (i / (n - 1)) * Math.PI; // upper half
      const k = 0.82 + rng.next() * 0.3;
      pts.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * 0.7 * k);
    }
    pts.push(cx + rx * 0.95, by - 1, cx + rx * 0.6, by, cx - rx * 0.6, by, cx - rx * 0.95, by - 1);
    const base = jitter(rng.next() < 0.5 ? '#7c776e' : '#857c6c', rng, 0.05);
    ellipse(g, cx + 1, by, rx * 1.05, 1.8, 'rgba(10,8,6,0.35)');
    poly(g, pts, lin(g, cx - rx, cy - ry * 0.5, cx + rx * 0.6, by, [[0, lit(base, 0.32)], [0.45, base], [1, dim(base, 0.42)]]));
    g.save();
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.closePath();
    g.clip();
    // facets: a lit top plane and a shaded flank
    ellipse(g, cx - rx * 0.25, cy - ry * 0.3, rx * 0.75, ry * 0.4, rgba(lit(base, 0.45), 0.55), -0.2);
    poly(g, [cx + rx * 0.15, cy - ry * 0.7, cx + rx * 1.1, cy - ry * 0.2, cx + rx * 1.1, by + 1, cx + rx * 0.3, by + 1], rgba(dim(base, 0.55), 0.5));
    for (let k = 0; k < W * 0.8; k++) ellipse(g, cx + (rng.next() - 0.5) * rx * 2, cy + (rng.next() - 0.5) * ry * 1.4, 0.3 + rng.next() * 0.5, 0.25, rgba(rng.next() < 0.5 ? '#2a2622' : '#d8d2c6', 0.35));
    if (size !== 'small') {
      g.strokeStyle = 'rgba(20,16,12,0.7)';
      g.lineWidth = 0.35;
      g.beginPath();
      let x = cx + (rng.next() - 0.5) * rx, y = cy - ry * 0.6;
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) { x += (rng.next() - 0.5) * 3; y += ry * 0.25; g.lineTo(x, y); }
      g.stroke();
    }
    if (mossy) {
      for (let k = 0; k < W * 2.2; k++) {
        const a = Math.PI + rng.next() * Math.PI, d = rng.next();
        ellipse(g, cx + Math.cos(a) * rx * d * 0.9 - 1, cy + Math.sin(a) * ry * 0.6 * d, 0.9, 0.6, rng.next() < 0.5 ? '#557a30' : '#6a8e3a', rng.next() * 3);
      }
    }
    g.restore();
    for (let k = 0; k < (size === 'small' ? 2 : 5); k++) blade(g, cx + (rng.next() - 0.5) * rx * 2, by + 0.5, 1.8 + rng.next() * 2, -Math.PI / 2 + (rng.next() - 0.5) * 1.2, 0.4, 0.5, rng.next() < 0.5 ? '#3d6628' : '#56843a');
    rim(c, '#16110c', 0.5, 1);
    return { canvas: c, ox: cx, oy: by, w: W, h: H };
  });
}

export function stumpSprite(variant: number): Sprite {
  return cachedSprite(`stump2:${variant % 4}`, () => {
    const rng = new RNG(variant + 91);
    const W = 16, H = 14;
    const { c, g } = artCanvas(W, H);
    const cx = W / 2, by = H - 1.5, rx = 5.5, top = 5;
    ellipse(g, cx + 0.8, by, 7, 1.6, 'rgba(10,8,6,0.35)');
    for (const sx of [-1, 1]) poly(g, [cx + sx * rx * 0.6, by - 3, cx + sx * (rx + 2.2), by + 0.3, cx + sx * rx * 0.3, by + 0.5], sx < 0 ? BARK.oak[2] : BARK.oak[0]);
    g.fillStyle = lin(g, cx - rx, 0, cx + rx, 0, [[0, BARK.oak[3]], [0.5, BARK.oak[2]], [1, BARK.oak[0]]]);
    g.fillRect(cx - rx, top, rx * 2, by - top);
    ellipse(g, cx, by, rx, 1.4, BARK.oak[1]);
    ellipse(g, cx, top, rx, 2.3, '#b08a5a');
    for (let r = 4.4; r > 0.5; r -= 1.1) { g.strokeStyle = 'rgba(90,62,34,0.6)'; g.lineWidth = 0.22; g.beginPath(); g.ellipse(cx + 0.2, top + 0.1, r, r * 0.42, 0, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = 'rgba(60,40,22,0.7)';
    g.lineWidth = 0.3;
    g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + 3 + rng.next(), top + 0.6); g.stroke();
    rim(c, '#140d08', 0.5, 1);
    return { canvas: c, ox: cx, oy: by, w: W, h: H };
  });
}

export function logSprite(): Sprite {
  return cachedSprite('log2', () => {
    const rng = new RNG(5);
    const W = 32, H = 12;
    const { c, g } = artCanvas(W, H);
    const by = H - 1.5;
    ellipse(g, W / 2 + 1, by, 14, 1.8, 'rgba(10,8,6,0.35)');
    g.fillStyle = lin(g, 0, 3, 0, by, [[0, BARK.oak[4]], [0.35, BARK.oak[2]], [1, BARK.oak[0]]]);
    g.beginPath();
    g.moveTo(3, 3.5); g.lineTo(W - 5, 3); g.quadraticCurveTo(W - 2, 6.5, W - 5, by); g.lineTo(3, by); g.quadraticCurveTo(0.5, 6.5, 3, 3.5);
    g.fill();
    for (let k = 0; k < 12; k++) { g.strokeStyle = rgba(BARK.oak[0], 0.6); g.lineWidth = 0.25; const y = 4 + rng.next() * 5; g.beginPath(); g.moveTo(3 + rng.next() * 10, y); g.lineTo(12 + rng.next() * 14, y + (rng.next() - 0.5)); g.stroke(); }
    ellipse(g, W - 5, 6.6, 2.6, 3.6, '#b08a5a');
    for (let r = 2.2; r > 0.3; r -= 0.7) { g.strokeStyle = 'rgba(90,62,34,0.6)'; g.lineWidth = 0.2; g.beginPath(); g.ellipse(W - 5, 6.6, r * 0.72, r, 0, 0, Math.PI * 2); g.stroke(); }
    for (let k = 0; k < 16; k++) ellipse(g, 4 + rng.next() * 18, 3.6 + rng.next() * 2, 0.8, 0.5, rng.next() < 0.5 ? '#557a30' : '#6a8e3a');
    rim(c, '#140d08', 0.5, 1);
    return { canvas: c, ox: W / 2, oy: by, w: W, h: H };
  });
}

export function reedsSprite(variant: number): Sprite {
  return cachedSprite(`reeds2:${variant % 6}`, () => {
    const rng = new RNG(variant + 3);
    const W = 16, H = 22;
    const { c, g } = artCanvas(W, H);
    const by = H - 1;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const x = 2 + rng.next() * (W - 4), h = 9 + rng.next() * 11;
      const ang = -Math.PI / 2 + (rng.next() - 0.5) * 0.3;
      blade(g, x, by, h, ang, (rng.next() - 0.5) * 1.2, 0.8, rng.next() < 0.5 ? '#4a6e2e' : '#6a8a3a');
      if (rng.next() < 0.45) {
        const tx = x + Math.cos(ang) * h * 0.85, ty = by + Math.sin(ang) * h * 0.85;
        ellipse(g, tx, ty, 0.75, 2, lin(g, tx - 0.7, 0, tx + 0.7, 0, [[0, '#8a5a32'], [1, '#4a2e18']]));
      }
    }
    for (let i = 0; i < 4; i++) blade(g, 3 + rng.next() * (W - 6), by, 6 + rng.next() * 4, -Math.PI / 2 + (rng.next() - 0.5) * 0.8, 0.8, 1.1, '#b8a860');
    rim(c, '#101a0c', 0.4, 1);
    return { canvas: c, ox: W / 2, oy: by, w: W, h: H };
  });
}

export function flowerPatchSprite(variant: number, color: string): Sprite {
  return cachedSprite(`flowers2:${variant % 6}:${color}`, () => {
    const rng = new RNG(variant * 3 + 11);
    const W = 14, H = 12;
    const { c, g } = artCanvas(W, H);
    const by = H - 1;
    for (let k = 0; k < 7; k++) blade(g, 2 + rng.next() * (W - 4), by, 2.5 + rng.next() * 2.5, -Math.PI / 2 + (rng.next() - 0.5) * 1.4, 0.5, 0.7, rng.next() < 0.5 ? '#3d6628' : '#56843a');
    const n = 4 + Math.floor(rng.next() * 3);
    for (let i = 0; i < n; i++) {
      const x = 2.5 + rng.next() * (W - 5), y = 3 + rng.next() * (by - 5);
      g.strokeStyle = '#3d6628';
      g.lineWidth = 0.3;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng.next() - 0.5), by); g.stroke();
      for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2 + rng.next() * 0.3;
        ellipse(g, x + Math.cos(a) * 0.75, y + Math.sin(a) * 0.62, 0.75, 0.55, p < 3 ? lit(color, 0.15) : dim(color, 0.12), a);
      }
      ellipse(g, x, y, 0.45, 0.4, '#e0a838');
    }
    rim(c, '#101a0c', 0.35, 1);
    return { canvas: c, ox: W / 2, oy: by, w: W, h: H };
  });
}

// ---------------------------------------------------------------- herbs

const HERB: Record<string, [string, string]> = {
  yarrow: ['#f2ecd8', '#d8ccb0'], chamomile: ['#f8f4e8', '#f0c040'], nettle: ['#5a8a3a', '#3a6428'],
  sage: ['#a8b89a', '#7e9474'], comfrey: ['#8a70b8', '#6a5098'], valerian: ['#f0d0e0', '#d0a0c0'],
  feverfew: ['#f8f4e8', '#e8c030'], belladonna: ['#4a2a5a', '#1a1018'], poppy: ['#d8302a', '#2a1a1a'],
  stjohnswort: ['#f4c828', '#c89010'], mint: ['#6ab04a', '#4a8a3a'], thistle: ['#b070c0', '#6a8a5a'],
  marigold: ['#f08a20', '#d06a10'], angelica: ['#eaeacc', '#b8c890'], wormwood: ['#c0ccb8', '#8a9a88'],
  mushroom: ['#b85a3a', '#efe0c8'], cornflower: ['#4a7ad8', '#2a5ab8'], moonwort: ['#d0e0f4', '#8aa8d8'],
  willow_bark: ['#8a6a4a', '#5a4430'],
};

/** Herb plants the player can gather; each herb has a distinct silhouette. */
export function herbSprite(kind: string, picked = false): Sprite {
  return cachedSprite(`herb2:${kind}:${picked}`, () => {
    const rng = new RNG(kind.length * 31 + kind.charCodeAt(0));
    const W = 16, H = 16;
    const { c, g } = artCanvas(W, H);
    const cx = W / 2, by = H - 1.5;
    const [c1, c2] = HERB[kind] || ['#f0f0f0', '#c0c0c0'];
    ellipse(g, cx, by, 4.5, 1.2, 'rgba(10,8,6,0.3)');
    if (picked) {
      for (let k = 0; k < 4; k++) blade(g, cx + (k - 1.5) * 1.2, by, 1.5, -Math.PI / 2 + (k - 1.5) * 0.4, 0.2, 0.6, '#3a6428');
    } else if (kind === 'mushroom') {
      for (const [dx, sc] of [[-2.2, 0.75], [1.4, 1]] as const) {
        const x = cx + dx;
        g.fillStyle = lin(g, x - 1, 0, x + 1, 0, [[0, '#f6ecd8'], [1, '#c8b89a']]);
        g.fillRect(x - 0.9 * sc, by - 5 * sc, 1.8 * sc, 5 * sc);
        g.beginPath();
        g.ellipse(x, by - 5 * sc, 3.4 * sc, 2.6 * sc, 0, Math.PI, 0);
        g.fillStyle = rad(g, x - 1, by - 6.5 * sc, 0.2, x, by - 5 * sc, 3.4 * sc, [[0, lit(c1, 0.3)], [1, dim(c1, 0.3)]]);
        g.fill();
        ellipse(g, x, by - 5 * sc, 3.4 * sc, 0.6 * sc, '#8a4a2e');
        for (let k = 0; k < 4; k++) ellipse(g, x + (rng.next() - 0.5) * 4 * sc, by - 5.8 * sc - rng.next() * 1.2 * sc, 0.45 * sc, 0.35 * sc, '#f6ecd8');
      }
    } else if (kind === 'willow_bark') {
      for (let k = 0; k < 3; k++) {
        const x = cx - 3 + k * 2.8, y = by - 1.5 - (k % 2);
        g.fillStyle = lin(g, x, y - 1, x, y + 1, [[0, lit(c1, 0.3)], [1, c2]]);
        g.save(); g.translate(x, y); g.rotate(-0.3 + k * 0.3); g.fillRect(-2.2, -0.8, 4.4, 1.6); g.restore();
      }
    } else if (kind === 'nettle' || kind === 'mint' || kind === 'sage' || kind === 'wormwood') {
      // leafy herbs: paired leaves up a stem
      for (const sx of [-2.2, 0.2, 2.4]) {
        const h = 7 + rng.next() * 4;
        g.strokeStyle = c2; g.lineWidth = 0.45;
        g.beginPath(); g.moveTo(cx + sx, by); g.lineTo(cx + sx * 1.3, by - h); g.stroke();
        for (let y = 1.5; y < h; y += 2.2) {
          for (const d of [-1, 1]) {
            const lx = cx + sx * (1 + (y / h) * 0.3) + d * 1.3, ly = by - y;
            const sz = 1.5 * (1 - y / h * 0.5);
            ellipse(g, lx, ly, sz, sz * 0.58, d < 0 ? lit(c1, 0.15) : dim(c1, 0.1), d * 0.6);
            if (kind === 'nettle') ellipse(g, lx - d * 0.3, ly - 0.2, sz * 0.4, sz * 0.2, dim(c1, 0.35), d * 0.6);
          }
        }
      }
    } else {
      // flowering herbs
      for (let k = 0; k < 7; k++) blade(g, cx + (rng.next() - 0.5) * 7, by, 3 + rng.next() * 3, -Math.PI / 2 + (rng.next() - 0.5) * 1.2, 0.6, 0.9, rng.next() < 0.5 ? '#3d6628' : '#56843a');
      const heads = kind === 'yarrow' || kind === 'angelica' ? 3 : 4;
      for (let k = 0; k < heads; k++) {
        const x = cx + (k - (heads - 1) / 2) * 2.6 + (rng.next() - 0.5), y = by - 7 - rng.next() * 4;
        g.strokeStyle = '#3d6628'; g.lineWidth = 0.35;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng.next() - 0.5) * 1.5, by); g.stroke();
        if (kind === 'yarrow' || kind === 'angelica' || kind === 'valerian') {
          for (let p = 0; p < 9; p++) ellipse(g, x + (rng.next() - 0.5) * 3, y + (rng.next() - 0.5) * 1.4, 0.55, 0.45, p % 3 ? c1 : c2);
        } else if (kind === 'thistle') {
          ellipse(g, x, y + 0.8, 1.2, 1.3, c2);
          for (let p = 0; p < 9; p++) blade(g, x, y, 1.8, -Math.PI / 2 + (p - 4) * 0.3, 0, 0.35, c1);
        } else if (kind === 'comfrey' || kind === 'belladonna') {
          for (let p = 0; p < 3; p++) ellipse(g, x + (p - 1) * 0.9, y + p * 0.7, 0.7, 1.1, p % 2 ? c1 : dim(c1, 0.2));
          if (kind === 'belladonna') ellipse(g, x + 1.2, y + 2.4, 0.8, 0.8, '#141014');
        } else {
          const petals = kind === 'poppy' ? 4 : 7;
          const pr = kind === 'poppy' || kind === 'marigold' ? 1.3 : 1.05;
          for (let p = 0; p < petals; p++) {
            const a = (p / petals) * Math.PI * 2;
            ellipse(g, x + Math.cos(a) * pr * 0.8, y + Math.sin(a) * pr * 0.65, pr * 0.8, pr * 0.55, p < petals / 2 ? lit(c1, 0.12) : c1, a);
          }
          ellipse(g, x, y, pr * 0.45, pr * 0.4, c2);
        }
      }
    }
    rim(c, '#101a0c', 0.45, 1);
    return { canvas: c, ox: cx, oy: by, w: W, h: H };
  });
}

export { ART };
