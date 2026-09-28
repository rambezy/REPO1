// Painted, seamlessly tiling ground materials. Each material is painted once
// at startup with canvas strokes (grass tufts, pebbles, planks, stones) and
// handed to the chunk renderer as raw texels.

import { RNG, clamp } from '../../engine/util';
import { newCanvas, rgba, blade, ellipse, lit, dim, mix } from '../paint';

export interface MatTex { w: number; h: number; data: Uint32Array }
export type TexSet = Record<string, MatTex>;

type G = CanvasRenderingContext2D;

function surface(sw: number, sh: number, tr: number) {
  const c = newCanvas(sw * tr, sh * tr);
  const g = c.getContext('2d')!;
  g.scale(tr, tr);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  return { c, g };
}

/** Calls fn at every wrapped copy of a shape so the texture tiles seamlessly. */
function wrap(sw: number, sh: number, x: number, y: number, r: number, fn: (x: number, y: number) => void, wrapY = true) {
  for (const dx of [-sw, 0, sw]) for (const dy of wrapY ? [-sh, 0, sh] : [0]) {
    const X = x + dx, Y = y + dy;
    if (X + r < 0 || X - r > sw || Y + r < 0 || Y - r > sh) continue;
    fn(X, Y);
  }
}

function toTex(c: HTMLCanvasElement): MatTex {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height);
  return { w: c.width, h: c.height, data: new Uint32Array(d.data.buffer) };
}

function softSpot(g: G, x: number, y: number, r: number, color: string, a: number) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, a));
  gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
}

/** Per-texel grain; keeps the painted look from being too clean. */
function noiseGrain(c: HTMLCanvasElement, amt: number, seed: number) {
  const g = c.getContext('2d')!;
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  const rng = new RNG(seed);
  for (let i = 0; i < d.length; i += 4) {
    const n = (rng.next() - 0.5) * amt;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n * 0.8, 0, 255);
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}

const pick = <T>(rng: RNG, a: readonly T[]) => a[Math.floor(rng.next() * a.length)];

// ---------------------------------------------------------------- grass family

interface GrassPal {
  base: string; spots: string[]; blades: string[]; tips: string[]; shadow: string;
  density: number; len: number;
  flowers?: string[]; flowerRate?: number;
  litter?: boolean; clover?: boolean;
}

const LUSH: GrassPal = {
  base: '#4a712f', spots: ['#39602a', '#588535', '#63903b', '#3f6629', '#50773a'],
  blades: ['#315722', '#3d6628', '#49752e', '#568434'], tips: ['#6a963d', '#78a444', '#88b24e'],
  shadow: '#1e3314', density: 0.62, len: 1, clover: true,
};
const DRY: GrassPal = {
  base: '#5f7f34', spots: ['#6e8a3a', '#56752f', '#7d9442', '#8a9a48', '#647d36'],
  blades: ['#4a6a2c', '#58792f', '#668a36', '#72913b'], tips: ['#8ea546', '#a3b555', '#b9c465'],
  shadow: '#27361a', density: 0.55, len: 1.05,
};
const MEADOW: GrassPal = {
  base: '#58843a', spots: ['#679540', '#4d7732', '#77a247', '#5f8c3c', '#86ab4c'],
  blades: ['#3f6d2a', '#4e7f31', '#5d9038', '#6aa03e'], tips: ['#88b84e', '#9dc75a', '#b2d066'],
  shadow: '#223a17', density: 0.7, len: 1.25,
  flowers: ['#f6f1dc', '#f3dc62', '#b995de', '#86aee6', '#eba4b4', '#f0f0f0', '#f6c85a'], flowerRate: 0.9,
};
const FOREST: GrassPal = {
  base: '#34482a', spots: ['#3d5228', '#2c3d22', '#4a5a2c', '#433726', '#3a4f2a'],
  blades: ['#2a4020', '#324c24', '#3c5828', '#46632c'], tips: ['#56733a', '#648140', '#728e48'],
  shadow: '#141c10', density: 0.28, len: 0.95, litter: true,
};

function tuft(g: G, x: number, y: number, rng: RNG, p: GrassPal, scale: number) {
  const n = 3 + Math.floor(rng.next() * 4);
  ellipse(g, x, y + 0.15, 1.3 * scale, 0.5 * scale, rgba(p.shadow, 0.28));
  for (let i = 0; i < n; i++) {
    const ang = -Math.PI / 2 + (rng.next() - 0.5) * 1.35;
    const len = (1.3 + rng.next() * 1.9) * scale * p.len;
    const bend = (rng.next() - 0.5) * 0.9 * scale;
    const w = (0.34 + rng.next() * 0.26) * scale;
    const bx = x + (rng.next() - 0.5) * 0.9 * scale;
    blade(g, bx, y, len, ang, bend, w, pick(rng, p.blades));
    if (rng.next() < 0.55) blade(g, bx, y - len * 0.35, len * 0.6, ang + (rng.next() - 0.5) * 0.2, bend * 0.6, w * 0.7, pick(rng, p.tips));
  }
}

function flower(g: G, x: number, y: number, col: string, rng: RNG) {
  const r = 0.45 + rng.next() * 0.25;
  blade(g, x, y + 1.6, 1.6, -Math.PI / 2 + (rng.next() - 0.5) * 0.4, 0.2, 0.25, '#3f6a28');
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rng.next();
    ellipse(g, x + Math.cos(a) * r * 0.9, y + Math.sin(a) * r * 0.75, r * 0.62, r * 0.5, col, a);
  }
  ellipse(g, x, y, r * 0.42, r * 0.38, col === '#f3dc62' || col === '#f6c85a' ? '#c88a24' : '#e8b83a');
}

function leaf(g: G, x: number, y: number, rng: RNG, cols: string[]) {
  const a = rng.next() * Math.PI * 2;
  const L = 0.9 + rng.next() * 0.9, W = L * (0.45 + rng.next() * 0.2);
  const c = pick(rng, cols);
  ellipse(g, x + 0.12, y + 0.18, L, W, 'rgba(10,8,4,0.25)', a);
  ellipse(g, x, y, L, W, c, a);
  g.strokeStyle = dim(c, 0.35);
  g.lineWidth = 0.14;
  g.beginPath();
  g.moveTo(x - Math.cos(a) * L * 0.9, y - Math.sin(a) * L * 0.9);
  g.lineTo(x + Math.cos(a) * L * 0.9, y + Math.sin(a) * L * 0.9);
  g.stroke();
}

function twig(g: G, x: number, y: number, rng: RNG) {
  const a = rng.next() * Math.PI * 2, L = 1.5 + rng.next() * 2.5;
  g.strokeStyle = pick(rng, ['#4a3522', '#5a4228', '#3a2a1c']);
  g.lineWidth = 0.28;
  g.beginPath();
  g.moveTo(x, y);
  const mx = x + Math.cos(a) * L * 0.5, my = y + Math.sin(a) * L * 0.5;
  g.lineTo(mx, my);
  g.lineTo(x + Math.cos(a + 0.2) * L, y + Math.sin(a + 0.2) * L);
  g.moveTo(mx, my);
  g.lineTo(mx + Math.cos(a - 0.9) * L * 0.35, my + Math.sin(a - 0.9) * L * 0.35);
  g.stroke();
}

function clover(g: G, x: number, y: number, rng: RNG) {
  const c = pick(rng, ['#4f8a34', '#5a9438', '#467e30']);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 - Math.PI / 2 + rng.next() * 0.3;
    ellipse(g, x + Math.cos(a) * 0.5, y + Math.sin(a) * 0.42, 0.48, 0.42, c);
    ellipse(g, x + Math.cos(a) * 0.5 - 0.1, y + Math.sin(a) * 0.42 - 0.12, 0.22, 0.18, lit(c, 0.35));
  }
}

function paintGrass(tr: number, p: GrassPal, seed: number, S = 128): MatTex {
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  g.fillStyle = p.base;
  g.fillRect(0, 0, S, S);
  // broad soft variation
  for (let i = 0; i < 70; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 5 + rng.next() * 16;
    const col = pick(rng, p.spots);
    wrap(S, S, x, y, r, (X, Y) => softSpot(g, X, Y, r, col, 0.22 + rng.next() * 0.2));
  }
  // forest litter under everything
  if (p.litter) {
    for (let i = 0; i < 26; i++) {
      const x = rng.next() * S, y = rng.next() * S, r = 3 + rng.next() * 7;
      wrap(S, S, x, y, r, (X, Y) => softSpot(g, X, Y, r, pick(rng, ['#4a3a26', '#3c3020', '#54402a']), 0.55));
    }
    for (let i = 0; i < 520; i++) {
      const x = rng.next() * S, y = rng.next() * S;
      wrap(S, S, x, y, 2, (X, Y) => leaf(g, X, Y, rng, ['#7a5a2a', '#8e6a30', '#6a4a22', '#5c6a2a', '#9a7a3a', '#6b5230', '#5a4a2a']));
    }
    for (let i = 0; i < 40; i++) {
      const x = rng.next() * S, y = rng.next() * S;
      wrap(S, S, x, y, 4, (X, Y) => twig(g, X, Y, rng));
    }
    // moss cushions
    for (let i = 0; i < 26; i++) {
      const x = rng.next() * S, y = rng.next() * S, r = 1.5 + rng.next() * 3;
      wrap(S, S, x, y, r + 1, (X, Y) => {
        ellipse(g, X, Y, r, r * 0.75, '#3f5a26');
        for (let k = 0; k < 14; k++) ellipse(g, X + (rng.next() - 0.5) * r * 1.6, Y + (rng.next() - 0.5) * r * 1.1, 0.35, 0.3, pick(rng, ['#577a32', '#4a6a2c', '#6a8a3a']));
      });
    }
  }
  // small clumps
  for (let i = 0; i < 900; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 0.6 + rng.next() * 1.4;
    const col = pick(rng, [...p.blades, ...p.spots]);
    wrap(S, S, x, y, r, (X, Y) => ellipse(g, X, Y, r, r * 0.7, rgba(col, 0.35)));
  }
  if (p.clover) {
    for (let i = 0; i < 60; i++) {
      const x = rng.next() * S, y = rng.next() * S;
      wrap(S, S, x, y, 2, (X, Y) => { for (let k = 0; k < 4; k++) clover(g, X + (rng.next() - 0.5) * 3, Y + (rng.next() - 0.5) * 2, rng); });
    }
  }
  // tufts, painted back to front
  const n = Math.floor(S * S * p.density * 0.19);
  const tufts: [number, number, number][] = [];
  for (let i = 0; i < n; i++) tufts.push([rng.next() * S, rng.next() * S, 0.75 + rng.next() * 0.5]);
  tufts.sort((a, b) => a[1] - b[1]);
  for (const [x, y, s] of tufts) wrap(S, S, x, y, 4, (X, Y) => tuft(g, X, Y, rng, p, s));
  if (p.flowers) {
    for (let i = 0; i < S * S * 0.0045 * (p.flowerRate ?? 1); i++) {
      const x = rng.next() * S, y = rng.next() * S;
      const col = pick(rng, p.flowers);
      const k = 1 + Math.floor(rng.next() * 3);
      wrap(S, S, x, y, 4, (X, Y) => { for (let j = 0; j < k; j++) flower(g, X + (rng.next() - 0.5) * 3, Y + (rng.next() - 0.5) * 2, col, rng); });
    }
  } else if (!p.litter) {
    // a few tiny white and yellow flowers in ordinary grass
    for (let i = 0; i < S * S * 0.0009; i++) {
      const x = rng.next() * S, y = rng.next() * S;
      const col = pick(rng, ['#f4f0e0', '#f0d860', '#f4f0e0']);
      wrap(S, S, x, y, 2, (X, Y) => flower(g, X, Y, col, rng));
    }
  }
  noiseGrain(c, 7, seed + 1);
  return toTex(c);
}

// ---------------------------------------------------------------- earth family

interface EarthPal {
  base: string; spots: string[]; grains: string[]; pebbles: string[];
  pebbleRate: number; grainRate: number; cracks?: string; wet?: boolean; embers?: boolean; sprigs?: boolean; charcoal?: boolean;
}

const DIRT: EarthPal = {
  base: '#76573a', spots: ['#6a4c32', '#846444', '#5e442c', '#8c6c4a'], grains: ['#5a402a', '#8a6a48', '#6c5034', '#98795a'],
  pebbles: ['#9a8c78', '#8a7a64', '#aa9c86', '#7a6a58'], pebbleRate: 1, grainRate: 1, cracks: '#4a3422', sprigs: true,
};
const ROAD: EarthPal = {
  base: '#957853', spots: ['#8a6c4a', '#a4865e', '#7f6446', '#ab8e66'], grains: ['#7c6044', '#aa8c66', '#8a6e4e', '#b89c74'],
  pebbles: ['#b3a58e', '#9d8e76', '#c4b8a0', '#8a7c68', '#a89880'], pebbleRate: 1.6, grainRate: 1.2,
};
const SAND: EarthPal = {
  base: '#c4ab80', spots: ['#d2bc90', '#b89e74', '#dcc8a0', '#b0966c'], grains: ['#a88e66', '#dccaa2', '#b89f78', '#e6d6b0'],
  pebbles: ['#a8a090', '#bcb4a0', '#8e887c', '#c8c0ac'], pebbleRate: 0.7, grainRate: 1.4,
};
const MUD: EarthPal = {
  base: '#4b3827', spots: ['#3e2d1f', '#56412d', '#453325', '#5e4832'], grains: ['#342619', '#5c4632', '#40301f', '#6a5440'],
  pebbles: ['#6a5c4c', '#5a4e40'], pebbleRate: 0.3, grainRate: 1, wet: true,
};
const ASH: EarthPal = {
  base: '#2d2927', spots: ['#383230', '#221f1d', '#45403b', '#2a2624'], grains: ['#1c1a19', '#4a4440', '#3a3532', '#57504a'],
  pebbles: ['#3a3634', '#4a4644'], pebbleRate: 0.5, grainRate: 1.3, embers: true, charcoal: true,
};
const GRAVEL: EarthPal = {
  base: '#77716a', spots: ['#7c776f', '#6a655e', '#827c74', '#716a60'], grains: ['#625d56', '#857f76', '#6e6960'],
  pebbles: ['#8e897f', '#837e75', '#98928a', '#7a756c', '#8a8378'], pebbleRate: 4, grainRate: 0.8,
};

function pebble(g: G, x: number, y: number, r: number, col: string, rng: RNG) {
  const ry = r * (0.6 + rng.next() * 0.25);
  const rot = (rng.next() - 0.5) * 0.8;
  ellipse(g, x + r * 0.25, y + ry * 0.45, r * 1.05, ry, 'rgba(20,12,6,0.35)', rot);
  const gr = g.createRadialGradient(x - r * 0.35, y - ry * 0.45, r * 0.05, x, y, r * 1.1);
  gr.addColorStop(0, lit(col, 0.4));
  gr.addColorStop(0.5, col);
  gr.addColorStop(1, dim(col, 0.35));
  ellipse(g, x, y, r, ry, gr, rot);
}

function paintEarth(tr: number, p: EarthPal, seed: number, S = 96): MatTex {
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  g.fillStyle = p.base;
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 60; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 4 + rng.next() * 14;
    const col = pick(rng, p.spots);
    wrap(S, S, x, y, r, (X, Y) => softSpot(g, X, Y, r, col, 0.3 + rng.next() * 0.25));
  }
  for (let i = 0; i < S * S * 0.22 * p.grainRate; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 0.18 + rng.next() * 0.45;
    const col = pick(rng, p.grains);
    wrap(S, S, x, y, r, (X, Y) => ellipse(g, X, Y, r, r * 0.8, rgba(col, 0.6)));
  }
  if (p.cracks) {
    g.strokeStyle = rgba(p.cracks, 0.55);
    g.lineWidth = 0.22;
    for (let i = 0; i < 14; i++) {
      let x = rng.next() * S, y = rng.next() * S;
      let a = rng.next() * Math.PI * 2;
      const pts: [number, number][] = [[x, y]];
      for (let k = 0; k < 5; k++) { a += (rng.next() - 0.5) * 1.2; x += Math.cos(a) * 1.6; y += Math.sin(a) * 1.6; pts.push([x, y]); }
      wrap(S, S, pts[0][0], pts[0][1], 10, (X, Y) => {
        const ox = X - pts[0][0], oy = Y - pts[0][1];
        g.beginPath();
        g.moveTo(pts[0][0] + ox, pts[0][1] + oy);
        for (const [px, py] of pts) g.lineTo(px + ox, py + oy);
        g.stroke();
      });
    }
  }
  if (p.wet) {
    for (let i = 0; i < 16; i++) {
      const x = rng.next() * S, y = rng.next() * S, rx = 2 + rng.next() * 5, ry = rx * (0.4 + rng.next() * 0.3);
      wrap(S, S, x, y, rx + 1, (X, Y) => {
        ellipse(g, X, Y, rx + 0.5, ry + 0.4, '#3a2a1c');
        const gr = g.createLinearGradient(X, Y - ry, X, Y + ry);
        gr.addColorStop(0, '#5a6a72');
        gr.addColorStop(1, '#2e3a40');
        ellipse(g, X, Y, rx, ry, gr);
        ellipse(g, X - rx * 0.3, Y - ry * 0.35, rx * 0.4, ry * 0.2, 'rgba(210,225,230,0.35)');
      });
    }
    for (let i = 0; i < 120; i++) {
      const x = rng.next() * S, y = rng.next() * S;
      wrap(S, S, x, y, 1, (X, Y) => ellipse(g, X, Y, 0.5 + rng.next() * 0.6, 0.25, 'rgba(200,190,170,0.18)'));
    }
  }
  if (p.charcoal) {
    for (let i = 0; i < 90; i++) {
      const x = rng.next() * S, y = rng.next() * S, w = 0.6 + rng.next() * 1.6;
      wrap(S, S, x, y, w + 1, (X, Y) => {
        g.fillStyle = pick(rng, ['#141211', '#1d1a18', '#26221f']);
        g.save();
        g.translate(X, Y);
        g.rotate(rng.next() * Math.PI);
        g.fillRect(-w / 2, -0.3, w, 0.6);
        g.fillStyle = 'rgba(120,110,100,0.35)';
        g.fillRect(-w / 2, -0.3, w, 0.15);
        g.restore();
      });
    }
    for (let i = 0; i < 40; i++) {
      const x = rng.next() * S, y = rng.next() * S, r = 1.5 + rng.next() * 4;
      wrap(S, S, x, y, r, (X, Y) => softSpot(g, X, Y, r, '#8a847c', 0.25));
    }
  }
  const np = Math.floor(S * S * 0.012 * p.pebbleRate);
  for (let i = 0; i < np; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 0.35 + rng.next() * (p.pebbleRate > 3 ? 0.7 : 1.1);
    const col = pick(rng, p.pebbles);
    wrap(S, S, x, y, r + 1, (X, Y) => pebble(g, X, Y, r, col, rng));
  }
  if (p.sprigs) {
    for (let i = 0; i < 16; i++) {
      const x = rng.next() * S, y = rng.next() * S;
      wrap(S, S, x, y, 4, (X, Y) => tuft(g, X, Y, rng, DRY, 0.6));
    }
  }
  if (p.embers) {
    for (let i = 0; i < 12; i++) {
      const x = rng.next() * S, y = rng.next() * S;
      wrap(S, S, x, y, 2, (X, Y) => {
        softSpot(g, X, Y, 1.4, '#e0762b', 0.35);
        ellipse(g, X, Y, 0.35, 0.28, '#ffb347');
      });
    }
  }
  noiseGrain(c, 9, seed + 1);
  return toTex(c);
}

// ---------------------------------------------------------------- fields and crops

function paintField(tr: number, seed: number, S = 96): MatTex {
  // ploughed strips: soft ridges and furrows with clods, stones and weeds
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  g.fillStyle = '#654832';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 5 + rng.next() * 12;
    wrap(S, S, x, y, r, (X, Y) => softSpot(g, X, Y, r, pick(rng, ['#5a3f2a', '#735438', '#6a4c34']), 0.4));
  }
  const rowH = 6;
  for (let r = 0; r < S / rowH; r++) {
    const y0 = r * rowH;
    // furrow: a soft dark line with a wavy edge
    for (let x = 0; x < S; x += 1) {
      const wob = Math.sin((x + r * 13) * 0.35) * 0.35 + (rng.next() - 0.5) * 0.3;
      g.fillStyle = rgba('#3a281a', 0.45);
      g.fillRect(x, y0 + 4.2 + wob, 1.05, 1.1);
      g.fillStyle = rgba('#8a6a4c', 0.25);
      g.fillRect(x, y0 + 1.2 + wob, 1.05, 1.4);
    }
    for (let i = 0; i < 60; i++) {
      const x = rng.next() * S, y = y0 + 0.8 + rng.next() * 3.2, rr = 0.25 + rng.next() * 0.55;
      wrap(S, S, x, y, 2, (X, Y) => pebble(g, X, Y, rr, pick(rng, ['#86664a', '#7a5a3c', '#946f50', '#6a4c34', '#8a8070']), rng), false);
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = rng.next() * S, r = Math.floor(rng.next() * (S / rowH));
    wrap(S, S, x, r * rowH + 2.5, 3, (X, Y) => tuft(g, X, Y, rng, DRY, 0.4), false);
  }
  noiseGrain(c, 8, seed + 1);
  return toTex(c);
}

function paintVeg(tr: number, seed: number, S = 96): MatTex {
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  g.fillStyle = '#5a412b';
  g.fillRect(0, 0, S, S);
  const rowH = 8;
  for (let r = 0; r < S / rowH; r++) {
    const y0 = r * rowH;
    const gr = g.createLinearGradient(0, y0, 0, y0 + rowH);
    gr.addColorStop(0, '#46311f');
    gr.addColorStop(0.4, '#6e5036');
    gr.addColorStop(1, '#4a3422');
    g.fillStyle = gr;
    g.fillRect(0, y0, S, rowH);
  }
  const crops = ['cabbage', 'leek', 'beet', 'cabbage', 'bean'];
  for (let r = 0; r < S / rowH; r++) {
    const kind = crops[r % crops.length];
    const y = r * rowH + 5;
    for (let x = 2; x < S; x += kind === 'leek' ? 2.6 : 5 + rng.next()) {
      const X = x + (rng.next() - 0.5);
      wrap(S, S, X, y, 5, (px, py) => crop(g, px, py, kind, rng), false);
    }
  }
  noiseGrain(c, 7, seed + 1);
  return toTex(c);
}

function crop(g: G, x: number, y: number, kind: string, rng: RNG) {
  ellipse(g, x + 0.4, y + 0.6, 2.2, 0.9, 'rgba(20,12,6,0.35)');
  if (kind === 'cabbage') {
    const base = pick(rng, ['#6f9a4a', '#7fa656', '#628c44']);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      ellipse(g, x + Math.cos(a) * 1.3, y - 1 + Math.sin(a) * 0.9, 1.3, 0.9, dim(base, 0.2), a);
    }
    const gr = g.createRadialGradient(x - 0.4, y - 1.6, 0.1, x, y - 1, 1.6);
    gr.addColorStop(0, '#c8e0a0');
    gr.addColorStop(1, base);
    ellipse(g, x, y - 1.1, 1.3, 1.1, gr);
  } else if (kind === 'leek') {
    for (let k = 0; k < 3; k++) blade(g, x + (k - 1) * 0.35, y, 3.2 + rng.next(), -Math.PI / 2 + (k - 1) * 0.35, 0.3, 0.45, k === 1 ? '#8fb86a' : '#5f8a44');
  } else if (kind === 'beet') {
    for (let k = 0; k < 4; k++) blade(g, x, y - 0.3, 2.4, -Math.PI / 2 + (k - 1.5) * 0.45, 0.4, 0.9, k % 2 ? '#4f7a36' : '#6a9244');
    ellipse(g, x, y, 0.8, 0.55, '#8a2a3a');
  } else {
    g.strokeStyle = '#6a4a2a';
    g.lineWidth = 0.25;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 4.5); g.stroke();
    for (let k = 0; k < 5; k++) ellipse(g, x + (k % 2 ? 0.7 : -0.7), y - 0.8 - k * 0.8, 0.7, 0.45, k % 2 ? '#5f8a44' : '#77a052');
  }
}

function paintWheat(tr: number, seed: number, burnt: boolean, S = 96): MatTex {
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  g.fillStyle = burnt ? '#1f1b19' : '#8a6a2a';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 50; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 4 + rng.next() * 12;
    wrap(S, S, x, y, r, (X, Y) => softSpot(g, X, Y, r, burnt ? pick(rng, ['#2a2624', '#141211']) : pick(rng, ['#a07c34', '#7a5a24', '#b08a3c']), 0.4));
  }
  const stalks: [number, number][] = [];
  const n = Math.floor(S * S * (burnt ? 0.5 : 0.95));
  for (let i = 0; i < n; i++) stalks.push([rng.next() * S, rng.next() * S]);
  stalks.sort((a, b) => a[1] - b[1]);
  const cols = burnt ? ['#2e2a27', '#3a3532', '#24201e', '#4a443e'] : ['#b8923e', '#c9a24a', '#d8b45a', '#a88434', '#e2c46c'];
  for (const [x, y] of stalks) {
    wrap(S, S, x, y, 6, (X, Y) => {
      const len = burnt ? 1 + rng.next() * 2.2 : 3 + rng.next() * 2.5;
      const ang = -Math.PI / 2 + (rng.next() - 0.5) * 0.35;
      const col = pick(rng, cols);
      blade(g, X, Y, len, ang, (rng.next() - 0.5) * 0.4, 0.3, dim(col, 0.25));
      if (!burnt) {
        const hx = X + Math.cos(ang) * len, hy = Y + Math.sin(ang) * len;
        ellipse(g, hx, hy + 0.5, 0.42, 1.1, col, ang + Math.PI / 2);
        ellipse(g, hx - 0.12, hy + 0.2, 0.18, 0.6, lit(col, 0.4), ang + Math.PI / 2);
      } else if (rng.next() < 0.02) {
        ellipse(g, X, Y - len, 0.3, 0.3, '#e0762b');
      }
    });
  }
  if (!burnt) {
    for (let i = 0; i < 26; i++) {
      const x = rng.next() * S, y = rng.next() * S;
      const col = rng.next() < 0.6 ? '#c8302a' : '#4a7ad8';
      wrap(S, S, x, y, 2, (X, Y) => flower(g, X, Y, col, rng));
    }
  }
  noiseGrain(c, 8, seed + 1);
  return toTex(c);
}

// ---------------------------------------------------------------- stone surfaces

function paintCobble(tr: number, seed: number, S = 96): MatTex {
  // irregular setts of mixed stone, packed with dirt and a little moss
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  g.fillStyle = '#463d33';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 30; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 3 + rng.next() * 6;
    wrap(S, S, x, y, r, (X, Y) => softSpot(g, X, Y, r, pick(rng, ['#5a4e3e', '#3a322a', '#4f5a36']), 0.5));
  }
  const cols = ['#827c72', '#8a8479', '#7a756c', '#8e877b', '#857c70', '#7f786e', '#8a8276'];
  const step = 5.2;
  for (let j = 0; j < S / step; j++) {
    const rowOff = rng.next() * step;
    for (let i = 0; i < S / step + 1; i++) {
      const x = i * step + rowOff + (rng.next() - 0.5) * 1.4;
      const y = (j + 0.5) * step + (rng.next() - 0.5) * 1.2;
      const big = rng.next() < 0.12;
      const rx = step * (big ? 0.56 : 0.44 + rng.next() * 0.08), ry = step * (big ? 0.46 : 0.38 + rng.next() * 0.06);
      const col = pick(rng, cols);
      const rot = (rng.next() - 0.5) * 0.9;
      wrap(S, S, x, y, step * 1.2, (X, Y) => {
        ellipse(g, X + 0.3, Y + 0.4, rx, ry, 'rgba(15,10,6,0.38)', rot);
        const gr = g.createRadialGradient(X - rx * 0.35, Y - ry * 0.45, 0.2, X, Y, rx * 1.15);
        gr.addColorStop(0, lit(col, 0.18));
        gr.addColorStop(0.55, col);
        gr.addColorStop(1, dim(col, 0.22));
        ellipse(g, X, Y, rx, ry, gr, rot);
        if (rng.next() < 0.3) ellipse(g, X + (rng.next() - 0.5) * rx, Y + (rng.next() - 0.5) * ry, 0.7, 0.35, 'rgba(30,24,18,0.18)');
      });
    }
  }
  for (let i = 0; i < 220; i++) {
    const x = rng.next() * S, y = rng.next() * S;
    wrap(S, S, x, y, 1, (X, Y) => ellipse(g, X, Y, 0.5, 0.35, pick(rng, ['rgba(80,100,50,0.55)', 'rgba(60,48,32,0.55)', 'rgba(100,120,60,0.4)'])));
  }
  noiseGrain(c, 8, seed + 1);
  return toTex(c);
}

function paintFlagstone(tr: number, seed: number, S = 96, warm = false): MatTex {
  // big, slightly irregular slabs worn smooth: a floor, not a wall of bricks
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  g.fillStyle = warm ? '#3b342b' : '#3f3b35';
  g.fillRect(0, 0, S, S);
  const cols = warm
    ? ['#8f826e', '#857864', '#998b76', '#7d705e', '#8a7e6a', '#94866f', '#827563']
    : ['#8a867e', '#817d75', '#938f86', '#7a766e', '#8e897f', '#86827a'];
  const rows = [12, 14, 11, 13, 12, 10, 14, 10]; // sums to S so the rows tile
  let y = 0;
  for (const rh of rows) {
    let x = rng.next() * 9;
    const start = x;
    while (x < S + start) {
      const W = Math.min(11 + rng.next() * 11, S + start - x);
      // everything random is drawn up front so wrapped copies match
      const col = pick(rng, cols);
      const ins = [0, 1, 2, 3].map(() => 0.2 + rng.next() * 0.28);
      const jit = [0, 1, 2, 3, 4, 5, 6, 7].map(() => (rng.next() - 0.5) * 0.4);
      const spots = [0, 1, 2, 3].map(() => [rng.next(), rng.next(), 1.5 + rng.next() * 3, rng.next() < 0.5 ? 1 : 0]);
      const crack = rng.next() < 0.2 ? [rng.next(), ...[0, 1, 2, 3, 4].map(() => rng.next() - 0.5)] : null;
      const worn = rng.next() < 0.3;
      const chip = rng.next() < 0.12 ? Math.floor(rng.next() * 4) : -1;
      const X0 = x, Y0 = y;
      wrap(S, S, X0 + W / 2, Y0 + rh / 2, Math.max(W, rh), (cx, cy) => {
        const l = cx - W / 2 + ins[0], r = cx + W / 2 - ins[1], t = cy - rh / 2 + ins[2], b = cy + rh / 2 - ins[3];
        const q = [[l + jit[0], t + jit[1]], [r + jit[2], t + jit[3]], [r + jit[4], b + jit[5]], [l + jit[6], b + jit[7]]];
        const quad = () => {
          g.beginPath();
          g.moveTo(q[0][0], q[0][1]);
          for (let k = 1; k < 4; k++) g.lineTo(q[k][0], q[k][1]);
          g.closePath();
        };
        const gr = g.createLinearGradient(l, t, r, b);
        gr.addColorStop(0, lit(col, 0.06));
        gr.addColorStop(1, dim(col, 0.1));
        g.fillStyle = gr;
        quad();
        g.fill();
        g.save();
        quad();
        g.clip();
        for (const [u, v, rr, light] of spots) softSpot(g, l + u * (r - l), t + v * (b - t), rr, light ? lit(col, 0.25) : dim(col, 0.3), 0.22);
        if (worn) softSpot(g, (l + r) / 2, (t + b) / 2, Math.min(r - l, b - t) * 0.55, lit(col, 0.2), 0.16);
        if (crack) {
          g.strokeStyle = 'rgba(28,24,20,0.45)';
          g.lineWidth = 0.16;
          g.beginPath();
          let px = l + crack[0] * (r - l), py = t;
          g.moveTo(px, py);
          for (let k = 1; k <= 5; k++) { px += crack[k] * 2.2; py = t + ((b - t) * k) / 5; g.lineTo(px, py); }
          g.stroke();
        }
        g.restore();
        // soft bevel: light along the top and left, shade along the bottom and right
        g.lineWidth = 0.3;
        g.strokeStyle = 'rgba(255,246,226,0.12)';
        g.beginPath(); g.moveTo(q[3][0], q[3][1]); g.lineTo(q[0][0], q[0][1]); g.lineTo(q[1][0], q[1][1]); g.stroke();
        g.strokeStyle = 'rgba(20,16,12,0.3)';
        g.beginPath(); g.moveTo(q[1][0], q[1][1]); g.lineTo(q[2][0], q[2][1]); g.lineTo(q[3][0], q[3][1]); g.stroke();
        if (chip >= 0) {
          const [px, py] = q[chip];
          const sx = chip === 0 || chip === 3 ? 1 : -1, sy = chip < 2 ? 1 : -1;
          g.fillStyle = 'rgba(40,34,28,0.8)';
          g.beginPath(); g.moveTo(px, py); g.lineTo(px + sx * 1.6, py); g.lineTo(px, py + sy * 1.3); g.closePath(); g.fill();
        }
      });
      x += W;
    }
    y += rh;
  }
  noiseGrain(c, 6, seed + 1);
  return toTex(c);
}

// ---------------------------------------------------------------- wood

function paintPlanks(tr: number, seed: number, weathered: boolean, S = 96): MatTex {
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  const plankH = 4;
  g.fillStyle = weathered ? '#2e241c' : '#3a2416';
  g.fillRect(0, 0, S, S);
  const cols = weathered ? ['#7a6a58', '#86745e', '#6c5e4e', '#8e7e68', '#74644f'] : ['#8a5c34', '#9a6a3c', '#7e5430', '#a4743f', '#8f6038', '#6f4a2b'];
  for (let r = 0; r < S / plankH; r++) {
    const y = r * plankH;
    let x = rng.next() * 20;
    const start = x;
    while (x < S + start) {
      const w = 18 + rng.next() * 26;
      const W = Math.min(w, S + start - x);
      const col = pick(rng, cols);
      const X0 = x;
      wrap(S, S, X0 + W / 2, y + plankH / 2, W, (cx, cy) => {
        const x0 = cx - W / 2, y0 = cy - plankH / 2;
        const gr = g.createLinearGradient(0, y0, 0, y0 + plankH);
        gr.addColorStop(0, lit(col, 0.16));
        gr.addColorStop(0.5, col);
        gr.addColorStop(1, dim(col, 0.18));
        g.fillStyle = gr;
        g.fillRect(x0 + 0.15, y0 + 0.2, W - 0.3, plankH - 0.4);
        // grain
        g.strokeStyle = rgba(dim(col, 0.45), 0.45);
        g.lineWidth = 0.12;
        for (let k = 0; k < 4; k++) {
          const gy = y0 + 0.6 + rng.next() * (plankH - 1.2);
          g.beginPath();
          g.moveTo(x0 + 0.3, gy);
          const segs = 5;
          for (let s = 1; s <= segs; s++) g.lineTo(x0 + (W * s) / segs, gy + (rng.next() - 0.5) * 0.5);
          g.stroke();
        }
        if (rng.next() < 0.4) {
          const kx = x0 + 3 + rng.next() * (W - 6), ky = y0 + 1 + rng.next() * (plankH - 2);
          ellipse(g, kx, ky, 0.9, 0.45, dim(col, 0.5));
          ellipse(g, kx, ky, 0.45, 0.2, dim(col, 0.7));
        }
        // nails at the ends
        for (const nx of [x0 + 0.9, x0 + W - 0.9]) {
          ellipse(g, nx, y0 + 1, 0.22, 0.2, '#2a2420');
          ellipse(g, nx, y0 + plankH - 1, 0.22, 0.2, '#2a2420');
        }
        if (weathered) for (let k = 0; k < 3; k++) softSpot(g, x0 + rng.next() * W, y0 + rng.next() * plankH, 1 + rng.next() * 2, rng.next() < 0.5 ? '#4a5a3a' : '#a09884', 0.25);
      });
      x += w;
    }
  }
  noiseGrain(c, 7, seed + 1);
  return toTex(c);
}

function paintStraw(tr: number, seed: number, S = 96): MatTex {
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  g.fillStyle = '#6a5234';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 40; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 3 + rng.next() * 8;
    wrap(S, S, x, y, r, (X, Y) => softSpot(g, X, Y, r, pick(rng, ['#5a4228', '#7a6040', '#8a7048']), 0.45));
  }
  const cols = ['#c8a860', '#b89448', '#dcc278', '#a88438', '#e4d08a', '#9c7c3a'];
  for (let i = 0; i < S * S * 0.9; i++) {
    const x = rng.next() * S, y = rng.next() * S, L = 1.5 + rng.next() * 3, a = rng.next() * Math.PI;
    const col = pick(rng, cols);
    wrap(S, S, x, y, L, (X, Y) => {
      g.strokeStyle = rgba(dim(col, 0.4), 0.5);
      g.lineWidth = 0.3;
      g.beginPath(); g.moveTo(X + 0.1, Y + 0.15); g.lineTo(X + Math.cos(a) * L + 0.1, Y + Math.sin(a) * L + 0.15); g.stroke();
      g.strokeStyle = col;
      g.lineWidth = 0.22;
      g.beginPath(); g.moveTo(X, Y); g.lineTo(X + Math.cos(a) * L, Y + Math.sin(a) * L); g.stroke();
    });
  }
  noiseGrain(c, 8, seed + 1);
  return toTex(c);
}

function paintCarpet(tr: number, seed: number, S = 32): MatTex {
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  g.fillStyle = '#6e1f1f';
  g.fillRect(0, 0, S, S);
  // woven diamonds
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const cx = i * 8 + 4, cy = j * 8 + 4;
    g.fillStyle = (i + j) % 2 ? '#842a26' : '#5e1a1a';
    g.beginPath(); g.moveTo(cx, cy - 3.6); g.lineTo(cx + 3.6, cy); g.lineTo(cx, cy + 3.6); g.lineTo(cx - 3.6, cy); g.closePath(); g.fill();
    g.fillStyle = '#b8862e';
    g.beginPath(); g.moveTo(cx, cy - 1.2); g.lineTo(cx + 1.2, cy); g.lineTo(cx, cy + 1.2); g.lineTo(cx - 1.2, cy); g.closePath(); g.fill();
  }
  // weave
  for (let i = 0; i < S * S * 1.5; i++) {
    const x = rng.next() * S, y = rng.next() * S;
    g.fillStyle = rng.next() < 0.5 ? 'rgba(255,220,200,0.07)' : 'rgba(0,0,0,0.12)';
    g.fillRect(x, y, 0.5, 0.25);
  }
  noiseGrain(c, 6, seed + 1);
  return toTex(c);
}

// ---------------------------------------------------------------- walls (faces tile only horizontally)

function paintPlasterFace(tr: number, seed: number, S = 64, H = 32): MatTex {
  const { c, g } = surface(S, H, tr);
  const rng = new RNG(seed);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#cdbf9e');
  gr.addColorStop(0.7, '#d9ccab');
  gr.addColorStop(1, '#b8a988');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, H);
  for (let i = 0; i < 60; i++) {
    const x = rng.next() * S, y = rng.next() * H, r = 1.5 + rng.next() * 5;
    wrap(S, H, x, y, r, (X, Y) => softSpot(g, X, Y, r, pick(rng, ['#e6dcc0', '#b3a482', '#c8b894', '#a89878']), 0.3), false);
  }
  const timber = '#3b2a1c';
  const beam = (x: number, y: number, w: number, h: number) => {
    const bg = g.createLinearGradient(x, y, x, y + h);
    bg.addColorStop(0, '#5a4028');
    bg.addColorStop(0.4, timber);
    bg.addColorStop(1, '#241810');
    g.fillStyle = bg;
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(x, y + h, w, 0.6);
  };
  const post = (x: number) => {
    const pg = g.createLinearGradient(x, 0, x + 2.2, 0);
    pg.addColorStop(0, '#5a4028');
    pg.addColorStop(0.5, timber);
    pg.addColorStop(1, '#221710');
    g.fillStyle = pg;
    g.fillRect(x, 0, 2.2, H);
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(x + 2.2, 0, 0.7, H);
  };
  // diagonal braces in some bays
  for (let b = 0; b < S / 32; b++) {
    if (rng.next() < 0.6) {
      const x0 = b * 32 + 2, dir = rng.next() < 0.5;
      g.strokeStyle = timber;
      g.lineWidth = 1.6;
      g.beginPath();
      g.moveTo(x0 + (dir ? 0 : 28), 16);
      g.lineTo(x0 + (dir ? 14 : 14), 3);
      g.stroke();
    }
  }
  for (let x = 0; x < S; x += 32) post(x);
  beam(0, 0, S, 2.8);
  beam(0, 14.6, S, 1.8);
  // baseboard
  const bb = g.createLinearGradient(0, H - 3.2, 0, H);
  bb.addColorStop(0, '#6b4526');
  bb.addColorStop(1, '#3a2416');
  g.fillStyle = bb;
  g.fillRect(0, H - 3.2, S, 3.2);
  // grime near the floor
  const gm = g.createLinearGradient(0, H - 9, 0, H - 3);
  gm.addColorStop(0, 'rgba(60,40,20,0)');
  gm.addColorStop(1, 'rgba(60,40,20,0.3)');
  g.fillStyle = gm;
  g.fillRect(0, H - 9, S, 6);
  noiseGrain(c, 6, seed + 1);
  return toTex(c);
}

function paintStoneFace(tr: number, seed: number, S = 64, H = 32, cave = false, inside = false): MatTex {
  const { c, g } = surface(S, H, tr);
  const rng = new RNG(seed);
  g.fillStyle = cave ? '#1c1816' : inside ? '#403930' : '#3a3834';
  g.fillRect(0, 0, S, H);
  const cols = cave ? ['#3a332d', '#443c34', '#2e2824', '#4a423a']
    : inside ? ['#8c8274', '#807668', '#978c7c', '#7a7064', '#867c6e']
    : ['#7c7870', '#8a857c', '#6e6a62', '#94907f', '#747066', '#827c70'];
  const rowH = inside ? 6.4 : 5.5;
  for (let r = 0; r * rowH < H; r++) {
    let x = (r % 2) * 5 + rng.next() * 2;
    const y = r * rowH;
    while (x < S + 10) {
      const w = 7 + rng.next() * 6;
      const col = pick(rng, cols);
      const X = x;
      wrap(S, H, X + w / 2, y + rowH / 2, w, (cx, cy) => {
        const x0 = cx - w / 2 + 0.25, y0 = cy - rowH / 2 + 0.25, ww = w - 0.5, hh = rowH - 0.5;
        const gr = g.createLinearGradient(x0, y0, x0 + 1, y0 + hh);
        gr.addColorStop(0, lit(col, 0.22));
        gr.addColorStop(0.35, col);
        gr.addColorStop(1, dim(col, 0.28));
        g.fillStyle = gr;
        g.beginPath();
        const rr = 0.9;
        g.moveTo(x0 + rr, y0); g.lineTo(x0 + ww - rr, y0); g.quadraticCurveTo(x0 + ww, y0, x0 + ww, y0 + rr);
        g.lineTo(x0 + ww, y0 + hh - rr); g.quadraticCurveTo(x0 + ww, y0 + hh, x0 + ww - rr, y0 + hh);
        g.lineTo(x0 + rr, y0 + hh); g.quadraticCurveTo(x0, y0 + hh, x0, y0 + hh - rr);
        g.lineTo(x0, y0 + rr); g.quadraticCurveTo(x0, y0, x0 + rr, y0);
        g.fill();
        for (let k = 0; k < 2; k++) softSpot(g, x0 + rng.next() * ww, y0 + rng.next() * hh, 1 + rng.next() * 1.5, rng.next() < 0.5 ? dim(col, 0.3) : lit(col, 0.3), 0.3);
      }, false);
      x += w;
    }
  }
  // moss and damp at the foot (indoors just a little grime)
  const mg = g.createLinearGradient(0, H - 8, 0, H);
  mg.addColorStop(0, 'rgba(40,50,25,0)');
  mg.addColorStop(1, cave ? 'rgba(10,8,6,0.6)' : inside ? 'rgba(30,24,18,0.4)' : 'rgba(40,52,24,0.55)');
  g.fillStyle = mg;
  g.fillRect(0, H - 8, S, 8);
  if (!cave && !inside) for (let i = 0; i < 30; i++) {
    const x = rng.next() * S, y = H - rng.next() * 7;
    wrap(S, H, x, y, 2, (X, Y) => ellipse(g, X, Y, 0.8 + rng.next(), 0.5, pick(rng, ['#4a6a2c', '#3e5a26', '#587a34'])), false);
  }
  noiseGrain(c, 8, seed + 1);
  return toTex(c);
}

function paintLogFace(tr: number, seed: number, S = 64, H = 32): MatTex {
  const { c, g } = surface(S, H, tr);
  const rng = new RNG(seed);
  g.fillStyle = '#2a1a10';
  g.fillRect(0, 0, S, H);
  const logH = 5.2;
  for (let r = 0; r * logH < H; r++) {
    const y = r * logH;
    const col = pick(rng, ['#7a5230', '#6c482a', '#845a36', '#70502e']);
    const gr = g.createLinearGradient(0, y, 0, y + logH);
    gr.addColorStop(0, dim(col, 0.35));
    gr.addColorStop(0.25, lit(col, 0.2));
    gr.addColorStop(0.55, col);
    gr.addColorStop(1, dim(col, 0.45));
    g.fillStyle = gr;
    g.fillRect(0, y + 0.2, S, logH - 0.4);
    g.strokeStyle = rgba(dim(col, 0.5), 0.5);
    g.lineWidth = 0.15;
    for (let k = 0; k < 8; k++) {
      const x = rng.next() * S, L = 3 + rng.next() * 8, yy = y + 1 + rng.next() * (logH - 2);
      g.beginPath(); g.moveTo(x, yy); g.lineTo(x + L, yy + (rng.next() - 0.5) * 0.4); g.stroke();
    }
    // chinking
    g.fillStyle = 'rgba(160,140,110,0.5)';
    g.fillRect(0, y + logH - 0.5, S, 0.4);
  }
  const gm = g.createLinearGradient(0, H - 6, 0, H);
  gm.addColorStop(0, 'rgba(0,0,0,0)');
  gm.addColorStop(1, 'rgba(20,12,6,0.45)');
  g.fillStyle = gm;
  g.fillRect(0, H - 6, S, 6);
  noiseGrain(c, 7, seed + 1);
  return toTex(c);
}

function paintRockFace(tr: number, seed: number, S = 64, H = 16): MatTex {
  const { c, g } = surface(S, H, tr);
  const rng = new RNG(seed);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#8a8680');
  gr.addColorStop(0.3, '#6e6a64');
  gr.addColorStop(1, '#3e3c38');
  g.fillStyle = gr;
  g.fillRect(0, 0, S, H);
  for (let i = 0; i < 90; i++) {
    const x = rng.next() * S, w = 1 + rng.next() * 4, y0 = rng.next() * H * 0.4, L = 4 + rng.next() * 10;
    wrap(S, H, x, y0, w + 1, (X) => {
      const cg = g.createLinearGradient(X, 0, X + w, 0);
      cg.addColorStop(0, 'rgba(200,196,188,0.35)');
      cg.addColorStop(0.4, 'rgba(120,116,110,0.1)');
      cg.addColorStop(1, 'rgba(20,18,16,0.45)');
      g.fillStyle = cg;
      g.fillRect(X, y0, w, L);
    }, false);
  }
  for (let i = 0; i < 20; i++) {
    const x = rng.next() * S;
    wrap(S, H, x, 1, 3, (X) => ellipse(g, X, 0.8 + rng.next(), 1.5 + rng.next() * 2, 0.8, pick(rng, ['#5a7a34', '#4a6a2c'])), false);
  }
  const fg = g.createLinearGradient(0, H - 4, 0, H);
  fg.addColorStop(0, 'rgba(0,0,0,0)');
  fg.addColorStop(1, 'rgba(10,8,6,0.5)');
  g.fillStyle = fg;
  g.fillRect(0, H - 4, S, 4);
  noiseGrain(c, 9, seed + 1);
  return toTex(c);
}

function paintRockTop(tr: number, seed: number, S = 96, cave = false): MatTex {
  // fractured bedrock: angular slabs with lit upper edges, dark cracks,
  // lichen, and grass in the crevices
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  g.fillStyle = cave ? '#15110f' : '#57534c';
  g.fillRect(0, 0, S, S);
  const cols = cave ? ['#2e2824', '#26211e', '#3a332d', '#332c27'] : ['#7a766e', '#6a665f', '#86817a', '#5e5a54', '#8e887e', '#747068'];
  for (let i = 0; i < 30; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 6 + rng.next() * 14;
    wrap(S, S, x, y, r, (X, Y) => softSpot(g, X, Y, r, pick(rng, cave ? ['#1e1a18', '#2a2420'] : ['#4a4640', '#6a665e', '#5a5a4a']), 0.5));
  }
  const step = 12;
  for (let j = 0; j < S / step; j++) for (let i = 0; i < S / step; i++) {
    const cx = (i + 0.5) * step + (rng.next() - 0.5) * step * 0.5;
    const cy = (j + 0.5) * step + (rng.next() - 0.5) * step * 0.5;
    const n = 5 + Math.floor(rng.next() * 3);
    const pts: number[] = [];
    const a0 = rng.next() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + (rng.next() - 0.5) * 0.5;
      const r = step * (0.5 + rng.next() * 0.35);
      pts.push(Math.cos(a) * r, Math.sin(a) * r * 0.8);
    }
    const col = pick(rng, cols);
    wrap(S, S, cx, cy, step, (X, Y) => {
      const at = (q: number) => [X + pts[q * 2], Y + pts[q * 2 + 1]] as const;
      g.beginPath();
      for (let k = 0; k < n; k++) { const [px, py] = at(k); if (k === 0) g.moveTo(px, py); else g.lineTo(px, py); }
      g.closePath();
      const gr = g.createLinearGradient(X - step * 0.5, Y - step * 0.5, X + step * 0.4, Y + step * 0.5);
      gr.addColorStop(0, lit(col, 0.24));
      gr.addColorStop(0.5, col);
      gr.addColorStop(1, dim(col, 0.22));
      g.globalAlpha = 0.85;
      g.fillStyle = gr;
      g.fill();
      g.globalAlpha = 1;
      // lit upper-left rims, dark lower-right rims
      for (let k = 0; k < n; k++) {
        const [x1, y1] = at(k), [x2, y2] = at((k + 1) % n);
        const nx = y2 - y1, ny = -(x2 - x1);
        const facing = (-nx - ny) / Math.hypot(nx, ny);
        g.strokeStyle = facing > 0.2 ? rgba('#e8e2d6', 0.3 * facing) : rgba('#0c0a08', 0.32 * Math.min(1, -facing + 0.3));
        g.lineWidth = 0.4;
        g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      }
      for (let k = 0; k < 2; k++) softSpot(g, X + (rng.next() - 0.5) * step * 0.6, Y + (rng.next() - 0.5) * step * 0.5, 1 + rng.next() * 2, rng.next() < 0.5 ? dim(col, 0.4) : lit(col, 0.3), 0.3);
    });
  }
  if (!cave) {
    // lichen and moss
    for (let i = 0; i < 70; i++) {
      const x = rng.next() * S, y = rng.next() * S, r = 0.6 + rng.next() * 1.6;
      wrap(S, S, x, y, r, (X, Y) => ellipse(g, X, Y, r, r * 0.7, rgba(pick(rng, ['#a8a868', '#7a8a48', '#c8c490', '#56703a']), 0.55)));
    }
    for (let i = 0; i < 26; i++) {
      const x = rng.next() * S, y = rng.next() * S;
      wrap(S, S, x, y, 4, (X, Y) => tuft(g, X, Y, rng, DRY, 0.55));
    }
  }
  noiseGrain(c, 9, seed + 1);
  return toTex(c);
}

function paintBeamTop(tr: number, seed: number, S = 64): MatTex {
  // the thick top of interior walls: dark timber and plaster seen from above
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  g.fillStyle = '#2b1e14';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 200; i++) {
    const x = rng.next() * S, y = rng.next() * S, L = 4 + rng.next() * 10;
    wrap(S, S, x, y, L, (X, Y) => {
      g.strokeStyle = rng.next() < 0.5 ? 'rgba(80,56,36,0.45)' : 'rgba(10,6,4,0.4)';
      g.lineWidth = 0.2;
      g.beginPath(); g.moveTo(X, Y); g.lineTo(X + L, Y + (rng.next() - 0.5) * 0.3); g.stroke();
    });
  }
  noiseGrain(c, 6, seed + 1);
  return toTex(c);
}

function paintRiverbed(tr: number, seed: number, S = 96): MatTex {
  const { c, g } = surface(S, S, tr);
  const rng = new RNG(seed);
  g.fillStyle = '#7a6a4a';
  g.fillRect(0, 0, S, S);
  for (let i = 0; i < 50; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 3 + rng.next() * 10;
    wrap(S, S, x, y, r, (X, Y) => softSpot(g, X, Y, r, pick(rng, ['#6a5a3c', '#8a7a58', '#5a5a3a', '#4a5a3a']), 0.45));
  }
  for (let i = 0; i < S * S * 0.03; i++) {
    const x = rng.next() * S, y = rng.next() * S, r = 0.4 + rng.next() * 1.3;
    wrap(S, S, x, y, r + 1, (X, Y) => pebble(g, X, Y, r, pick(rng, ['#9a8c78', '#8a8070', '#aaa08a', '#6a6458', '#7a7466']), rng));
  }
  // weed
  for (let i = 0; i < 30; i++) {
    const x = rng.next() * S, y = rng.next() * S;
    wrap(S, S, x, y, 4, (X, Y) => { for (let k = 0; k < 4; k++) blade(g, X, Y, 2.5 + rng.next() * 2, -Math.PI / 2 + (rng.next() - 0.5), (rng.next() - 0.5) * 1.2, 0.35, pick(rng, ['#3e5a2a', '#4a6a30', '#34502a'])); });
  }
  noiseGrain(c, 6, seed + 1);
  return toTex(c);
}

// ---------------------------------------------------------------- assembly

const MAKERS = {
  grass: (tr: number) => paintGrass(tr, LUSH, 11),
  grass2: (tr: number) => paintGrass(tr, DRY, 12),
  meadow: (tr: number) => paintGrass(tr, MEADOW, 13),
  forest: (tr: number) => paintGrass(tr, FOREST, 14),
  dirt: (tr: number) => paintEarth(tr, DIRT, 21),
  road: (tr: number) => paintEarth(tr, ROAD, 22),
  sand: (tr: number) => paintEarth(tr, SAND, 23),
  mud: (tr: number) => paintEarth(tr, MUD, 24),
  ash: (tr: number) => paintEarth(tr, ASH, 25),
  gravel: (tr: number) => paintEarth(tr, GRAVEL, 26),
  field: (tr: number) => paintField(tr, 31),
  veg: (tr: number) => paintVeg(tr, 32),
  wheat: (tr: number) => paintWheat(tr, 33, false),
  burnt: (tr: number) => paintWheat(tr, 34, true),
  cobble: (tr: number) => paintCobble(tr, 41),
  flag: (tr: number) => paintFlagstone(tr, 42),
  flagwarm: (tr: number) => paintFlagstone(tr, 43, 96, true),
  wood: (tr: number) => paintPlanks(tr, 51, false),
  bridge: (tr: number) => paintPlanks(tr, 52, true),
  straw: (tr: number) => paintStraw(tr, 53),
  carpet: (tr: number) => paintCarpet(tr, 54),
  plasterFace: (tr: number) => paintPlasterFace(tr, 61),
  stoneFace: (tr: number) => paintStoneFace(tr, 62),
  stoneFaceIn: (tr: number) => paintStoneFace(tr, 70, 64, 32, false, true),
  caveFace: (tr: number) => paintStoneFace(tr, 63, 64, 32, true),
  logFace: (tr: number) => paintLogFace(tr, 64),
  rockFace: (tr: number) => paintRockFace(tr, 65),
  rockTop: (tr: number) => paintRockTop(tr, 66),
  caveTop: (tr: number) => paintRockTop(tr, 67, 96, true),
  beamTop: (tr: number) => paintBeamTop(tr, 68),
  riverbed: (tr: number) => paintRiverbed(tr, 69),
};
export type MatName = keyof typeof MAKERS;
export const ALL_MATS = Object.keys(MAKERS) as MatName[];

/** Paints materials on first use and keeps them. */
export class TexCache {
  private made = new Map<string, MatTex>();
  constructor(public tr: number) {}
  get(name: MatName): MatTex {
    let t = this.made.get(name);
    if (!t) { t = MAKERS[name](this.tr); this.made.set(name, t); }
    return t;
  }
}

export { mix };
