// Procedurally drawn scenery and interactive objects.

import type { MapObject } from '../game/types';
import { shade } from './materials';
import { roundRect } from './sprites';
import { HEX_W, ROW_H } from '../core/hex';

type Painter = (c: CanvasRenderingContext2D, o: MapObject, t: number) => void;

/** Parallelogram box aligned with the hex grid axes, sitting on the ground. */
function box(c: CanvasRenderingContext2D, w: number, d: number, h: number, top: string, front: string, side: string, y0 = 0) {
  // w along +q (screen x), d along +r (screen: +x/2, +y)
  const dx = (d * HEX_W) / 2 / HEX_W;
  const x0 = -w / 2 - (d * dx) / 2;
  const yb = (d * ROW_H) / HEX_W / 2;
  // corners of footprint: back-left (bl), back-right (br), front-right (fr), front-left (fl)
  const bl = { x: x0, y: -yb };
  const br = { x: x0 + w, y: -yb };
  const fl = { x: x0 + d * dx, y: yb };
  const fr = { x: fl.x + w, y: yb };
  const lift = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - h - y0 });
  const g = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - y0 });
  // left face
  c.fillStyle = side;
  poly(c, [g(bl), g(fl), lift(fl), lift(bl)]);
  // front face
  c.fillStyle = front;
  poly(c, [g(fl), g(fr), lift(fr), lift(fl)]);
  // top
  c.fillStyle = top;
  poly(c, [lift(bl), lift(br), lift(fr), lift(fl)]);
  return { bl, br, fl, fr, lift };
}

function poly(c: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  c.beginPath();
  c.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
  c.closePath();
  c.fill();
}

const P: Record<string, Painter> = {
  crate: (c, o) => {
    const b = box(c, 20, 18, 14, '#8a6a42', '#6e5232', '#5a4228');
    c.strokeStyle = 'rgba(40,24,10,0.6)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(b.fl.x, b.fl.y - 7);
    c.lineTo(b.fr.x, b.fr.y - 7);
    c.stroke();
  },
  footlocker: (c) => {
    box(c, 18, 12, 9, '#4a5a4a', '#3a4a3a', '#2e3c2e');
    c.fillStyle = '#b0a060';
    c.fillRect(-1, -5, 3, 2);
  },
  chest: (c) => {
    box(c, 18, 12, 10, '#7a5230', '#5e3e22', '#4e321a');
    c.fillStyle = '#c0a050';
    c.fillRect(-1, -6, 3, 3);
  },
  locker: (c, o) => {
    const col = o.tint ?? '#6a7a80';
    box(c, 12, 8, 34, shade(col, 1.1), col, shade(col, 0.75));
    c.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 3; i++) c.fillRect(-3, -28 + i * 3, 7, 1);
  },
  cabinet: (c, o) => {
    const col = o.tint ?? '#7a7060';
    box(c, 14, 10, 24, shade(col, 1.1), col, shade(col, 0.75));
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(-4, -18, 10, 1);
    c.fillRect(-4, -10, 10, 1);
  },
  safe: (c) => {
    box(c, 14, 12, 16, '#5a5a5a', '#474747', '#383838');
    c.strokeStyle = '#999';
    c.beginPath();
    c.arc(1, -8, 3, 0, 7);
    c.stroke();
  },
  fridge: (c) => {
    box(c, 13, 10, 30, '#d8d4c4', '#c0baa6', '#a8a290');
    c.fillStyle = 'rgba(80,70,50,0.5)';
    c.fillRect(-4, -24, 1, 8);
    c.fillStyle = 'rgba(120,80,40,0.4)';
    c.fillRect(-2, -10, 6, 4);
  },
  desk: (c) => {
    box(c, 26, 14, 14, '#7a5a3a', '#624628', '#4e371f');
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(-4, -9, 10, 1);
  },
  table: (c, o) => {
    const top = o.tint ?? '#7a5a3a';
    const b = box(c, 24, 16, 2, top, shade(top, 0.8), shade(top, 0.7), 11);
    c.fillStyle = shade(top, 0.5);
    for (const p of [b.bl, b.br, b.fl, b.fr]) c.fillRect(p.x - 1 + (p.x < 0 ? 2 : -2), p.y - 11, 2, 11);
  },
  chair: (c) => {
    box(c, 8, 8, 2, '#6a4a2a', '#543a20', '#44301a', 7);
    c.fillStyle = '#44301a';
    c.fillRect(-5, -7, 2, 7);
    c.fillRect(3, -7, 2, 7);
    c.fillStyle = '#6a4a2a';
    c.fillRect(-5, -18, 10, 9);
  },
  bed: (c, o) => {
    box(c, 30, 14, 8, '#8a8070', '#5a5448', '#4a4438');
    box(c, 26, 12, 3, o.tint ?? '#7a8a8e', shade(o.tint ?? '#7a8a8e', 0.8), shade(o.tint ?? '#7a8a8e', 0.7), 8);
    c.fillStyle = '#d8d0c0';
    c.fillRect(-14, -15, 8, 4);
  },
  bunk: (c, o) => {
    box(c, 30, 12, 6, '#6a6e70', '#56595b', '#46494b');
    box(c, 26, 10, 3, '#5f7f86', '#4a666c', '#3e565c', 6);
    box(c, 30, 12, 2, '#6a6e70', '#56595b', '#46494b', 22);
    box(c, 26, 10, 3, '#5f7f86', '#4a666c', '#3e565c', 24);
    c.fillStyle = '#56595b';
    c.fillRect(-16, -30, 2, 30);
    c.fillRect(14, -30, 2, 30);
  },
  bedroll: (c) => {
    c.fillStyle = '#6a5a3a';
    c.beginPath();
    c.ellipse(0, 0, 14, 5, 0, 0, 7);
    c.fill();
    c.fillStyle = '#8a7a5a';
    c.beginPath();
    c.ellipse(-8, -1, 4, 3, 0, 0, 7);
    c.fill();
  },
  bookcase: (c) => {
    box(c, 22, 8, 32, '#6a4a2a', '#543a20', '#44301a');
    const cols = ['#8a3a2a', '#3a5a7a', '#6a6a3a', '#5a3a5a', '#aa8a4a'];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 6; i++) {
      c.fillStyle = cols[(i + row * 2) % cols.length];
      c.fillRect(-8 + i * 3 + 2, -28 + row * 9, 2, 7);
    }
  },
  shelf: (c) => {
    box(c, 22, 8, 26, '#6a6a6a', '#555', '#444');
    const cols = ['#8a7a4a', '#5a6a6a', '#7a5a3a'];
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4; i++) {
      c.fillStyle = cols[(i + row) % 3];
      c.fillRect(-7 + i * 5 + 2, -23 + row * 8, 4, 5);
    }
  },
  toolbox: (c) => {
    box(c, 12, 8, 7, '#b03020', '#902818', '#782010');
  },
  bag: (c) => {
    c.fillStyle = '#8a7a5a';
    c.beginPath();
    c.ellipse(0, -5, 7, 6, 0, 0, 7);
    c.fill();
    c.fillStyle = '#6a5a3a';
    c.fillRect(-2, -12, 4, 3);
  },
  barrel: (c, o) => {
    const col = o.tint ?? '#6a7a4a';
    c.fillStyle = shade(col, 0.7);
    c.beginPath();
    c.ellipse(0, 0, 7, 3.5, 0, 0, 7);
    c.fill();
    c.fillStyle = col;
    c.fillRect(-7, -18, 14, 18);
    c.fillStyle = shade(col, 1.2);
    c.beginPath();
    c.ellipse(0, -18, 7, 3.5, 0, 0, 7);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(-7, -12, 14, 1.5);
    c.fillRect(-7, -5, 14, 1.5);
    c.fillRect(3, -18, 4, 18);
  },
  barrelc: (c, o) => P.barrel(c, o, 0),
  terminal: (c, o, t) => {
    box(c, 16, 10, 12, '#6a6e70', '#555a5c', '#45494b');
    box(c, 14, 8, 14, '#5a5e60', '#3a3e40', '#35393b', 12);
    c.fillStyle = o.used ? '#1a3a1a' : `rgba(60,${200 + Math.sin(t * 3) * 30},90,0.9)`;
    c.fillRect(-6, -23, 10, 8);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    for (let i = 0; i < 3; i++) c.fillRect(-5, -21 + i * 2.5, 8, 0.7);
  },
  console: (c, o, t) => {
    box(c, 28, 10, 16, '#5a6468', '#48525a', '#3a4248');
    for (let i = 0; i < 6; i++) {
      c.fillStyle = ['#e04030', '#40e060', '#e0c030'][(i + Math.floor(t * 2)) % 3];
      c.fillRect(-10 + i * 4, -12, 2, 2);
    }
  },
  rock: (c, o) => {
    const s = 0.8 + ((o.q * 7 + o.r * 13) % 5) / 10;
    c.fillStyle = '#6e604e';
    c.beginPath();
    c.moveTo(-12 * s, 0);
    c.lineTo(-9 * s, -10 * s);
    c.lineTo(-2 * s, -15 * s);
    c.lineTo(7 * s, -12 * s);
    c.lineTo(12 * s, -3 * s);
    c.lineTo(8 * s, 3);
    c.lineTo(-6 * s, 3);
    c.closePath();
    c.fill();
    c.fillStyle = '#8a7a64';
    c.beginPath();
    c.moveTo(-9 * s, -10 * s);
    c.lineTo(-2 * s, -15 * s);
    c.lineTo(7 * s, -12 * s);
    c.lineTo(0, -8 * s);
    c.closePath();
    c.fill();
  },
  deadtree: (c, o) => {
    c.strokeStyle = '#4a3a2a';
    c.lineCap = 'round';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(0, 0);
    c.lineTo(1, -30);
    c.stroke();
    c.lineWidth = 2;
    const k = (o.q * 3 + o.r) % 3;
    c.beginPath();
    c.moveTo(1, -18);
    c.lineTo(-10, -30 - k * 2);
    c.moveTo(1, -24);
    c.lineTo(10, -36);
    c.moveTo(1, -30);
    c.lineTo(-3, -42);
    c.moveTo(-6, -26);
    c.lineTo(-12, -24);
    c.stroke();
  },
  cactus: (c) => {
    c.fillStyle = '#5a7040';
    roundRect(c, -3, -26, 6, 26, 3);
    c.fill();
    roundRect(c, -10, -18, 5, 10, 2.5);
    c.fill();
    roundRect(c, 5, -22, 5, 8, 2.5);
    c.fill();
    c.fillRect(-7, -10, 5, 3);
    c.fillRect(2, -16, 5, 3);
    c.fillStyle = 'rgba(255,255,255,0.15)';
    c.fillRect(-2, -24, 1, 22);
  },
  scrubbush: (c) => {
    c.fillStyle = '#6a6a3a';
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.arc(-6 + i * 2.5, -4 - (i % 2) * 3, 4, 0, 7);
      c.fill();
    }
  },
  car: (c, o) => {
    const col = o.tint ?? '#7a4a30';
    box(c, 40, 18, 10, shade(col, 1.1), col, shade(col, 0.7), 4);
    box(c, 22, 14, 8, shade(col, 1.2), shade(col, 0.6), shade(col, 0.5), 14);
    c.fillStyle = '#2a2a2a';
    for (const x of [-16, 12]) {
      c.beginPath();
      c.ellipse(x, 1, 4, 2.5, 0, 0, 7);
      c.fill();
    }
    c.fillStyle = 'rgba(40,60,70,0.7)';
    c.fillRect(-6, -21, 12, 5);
  },
  campfire: (c, o, t) => {
    c.fillStyle = '#3a3a3a';
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      c.beginPath();
      c.arc(Math.cos(a) * 8, Math.sin(a) * 3.5, 2.5, 0, 7);
      c.fill();
    }
    c.fillStyle = '#4a2a1a';
    c.fillRect(-6, -2, 12, 2);
    const f = Math.sin(t * 12) * 1.5;
    c.fillStyle = 'rgba(255,140,30,0.9)';
    c.beginPath();
    c.moveTo(-5, -1);
    c.quadraticCurveTo(-3, -12 + f, 0, -16 - f);
    c.quadraticCurveTo(3, -10 + f, 5, -1);
    c.fill();
    c.fillStyle = 'rgba(255,230,120,0.95)';
    c.beginPath();
    c.moveTo(-2, -1);
    c.quadraticCurveTo(0, -8 - f, 2, -1);
    c.fill();
  },
  well: (c) => {
    c.fillStyle = '#6a6258';
    c.beginPath();
    c.ellipse(0, -4, 11, 5.5, 0, 0, 7);
    c.fill();
    c.fillRect(-11, -10, 22, 6);
    c.fillStyle = '#8a8274';
    c.beginPath();
    c.ellipse(0, -10, 11, 5.5, 0, 0, 7);
    c.fill();
    c.fillStyle = '#1a2224';
    c.beginPath();
    c.ellipse(0, -10, 8, 4, 0, 0, 7);
    c.fill();
    c.strokeStyle = '#5a3a20';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-10, -10);
    c.lineTo(-10, -30);
    c.lineTo(10, -30);
    c.lineTo(10, -10);
    c.stroke();
  },
  tent: (c, o) => {
    const col = o.tint ?? '#8a7a5a';
    c.fillStyle = shade(col, 0.7);
    poly(c, [{ x: -18, y: 4 }, { x: 0, y: -24 }, { x: 4, y: 6 }]);
    c.fillStyle = col;
    poly(c, [{ x: 4, y: 6 }, { x: 0, y: -24 }, { x: 22, y: -2 }, { x: 24, y: 4 }]);
    c.fillStyle = 'rgba(0,0,0,0.5)';
    poly(c, [{ x: -6, y: 5 }, { x: -1, y: -10 }, { x: 2, y: 5 }]);
  },
  generator: (c, o, t) => {
    box(c, 24, 14, 18, '#6a6a4a', '#55553a', '#46462e');
    c.fillStyle = '#2a2a2a';
    c.beginPath();
    c.arc(-2, -10, 4, 0, 7);
    c.fill();
    c.fillStyle = o.used ? '#40e060' : '#e04030';
    c.fillRect(6, -14, 2, 2);
  },
  vat: (c, o, t) => {
    const col = o.tint ?? '#4a8a4a';
    c.fillStyle = '#4a5054';
    c.beginPath();
    c.ellipse(0, 0, 13, 6, 0, 0, 7);
    c.fill();
    c.fillRect(-13, -30, 26, 30);
    c.fillStyle = o.used ? '#2a2a2a' : col;
    c.globalAlpha = 0.85;
    c.fillRect(-10, -28, 20, 20);
    c.globalAlpha = 1;
    if (!o.used) {
      c.fillStyle = 'rgba(200,255,200,0.4)';
      for (let i = 0; i < 3; i++) c.fillRect(-6 + i * 5, -12 - ((t * 20 + i * 7) % 16), 2, 2);
    }
    c.fillStyle = '#5a6064';
    c.beginPath();
    c.ellipse(0, -30, 13, 6, 0, 0, 7);
    c.fill();
    c.strokeStyle = '#3a3e40';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(0, -36);
    c.lineTo(0, -50);
    c.stroke();
  },
  tank: (c, o) => {
    c.fillStyle = '#6a7074';
    c.beginPath();
    c.ellipse(0, 0, 12, 6, 0, 0, 7);
    c.fill();
    c.fillRect(-12, -36, 24, 36);
    c.fillStyle = '#7e858a';
    c.beginPath();
    c.ellipse(0, -36, 12, 6, 0, 0, 7);
    c.fill();
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.fillRect(4, -36, 8, 36);
  },
  sandbags: (c) => {
    c.fillStyle = '#8a7a52';
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.ellipse(-8 + i * 8 + (row % 2) * 4, -3 - row * 5, 5, 3, 0, 0, 7);
      c.fill();
    }
  },
  stall: (c, o) => {
    const col = o.tint ?? '#8a4a3a';
    box(c, 30, 12, 12, '#7a5a3a', '#624628', '#4e371f');
    c.fillStyle = '#5a3a20';
    c.fillRect(-16, -34, 2, 22);
    c.fillRect(16, -34, 2, 22);
    c.fillStyle = col;
    poly(c, [{ x: -20, y: -30 }, { x: 22, y: -30 }, { x: 18, y: -38 }, { x: -16, y: -38 }]);
    c.fillStyle = shade(col, 1.3);
    for (let i = 0; i < 4; i++) c.fillRect(-18 + i * 10, -30, 5, 3);
  },
  lamp: (c, o, t) => {
    c.fillStyle = '#3a3a3a';
    c.fillRect(-1, -36, 2, 36);
    c.fillStyle = 'rgba(255,220,140,0.95)';
    c.beginPath();
    c.arc(0, -38, 3, 0, 7);
    c.fill();
  },
  sign: (c, o) => {
    c.fillStyle = '#4a3a2a';
    c.fillRect(-1, -26, 2, 26);
    c.fillStyle = o.tint ?? '#8a7a5a';
    c.fillRect(-10, -30, 20, 10);
    c.fillStyle = 'rgba(40,20,10,0.8)';
    c.fillRect(-7, -27, 14, 1.2);
    c.fillRect(-7, -24, 10, 1.2);
  },
  cage: (c) => {
    c.strokeStyle = '#6a6a6a';
    c.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      c.beginPath();
      c.moveTo(-12 + i * 5, 2);
      c.lineTo(-12 + i * 5, -28);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(-12, -28);
    c.lineTo(13, -28);
    c.stroke();
  },
  rack: (c) => {
    box(c, 22, 6, 24, '#4a4a4a', '#3a3a3a', '#2e2e2e');
    c.fillStyle = '#222';
    for (let i = 0; i < 4; i++) c.fillRect(-9 + i * 5, -22, 2, 16);
  },
  statue: (c) => {
    box(c, 16, 12, 8, '#8a8a80', '#6e6e66', '#5a5a52');
    c.fillStyle = '#7a7a70';
    c.fillRect(-4, -34, 8, 26);
    c.beginPath();
    c.arc(0, -38, 5, 0, 7);
    c.fill();
  },
  pipe: (c) => {
    c.fillStyle = '#6a6258';
    c.fillRect(-14, -12, 28, 8);
    c.fillStyle = '#8a8274';
    c.fillRect(-14, -12, 28, 2);
  },
  debris: (c, o) => {
    const k = (o.q * 5 + o.r * 3) % 4;
    c.fillStyle = '#6a625a';
    c.fillRect(-10, -6, 12, 6);
    c.fillStyle = '#5a4a3a';
    c.fillRect(-2 + k, -10, 10, 10);
    c.fillStyle = '#7a4a2a';
    c.fillRect(-6, -3, 16, 2);
  },
  pile: (c) => {
    c.fillStyle = '#7a6a54';
    c.beginPath();
    c.ellipse(0, -2, 12, 5, 0, 0, 7);
    c.fill();
    c.fillStyle = '#5a5048';
    c.fillRect(-6, -6, 4, 3);
    c.fillRect(2, -7, 5, 3);
  },
  bones: (c) => {
    c.fillStyle = '#d8d0b8';
    c.fillRect(-8, -1, 10, 2);
    c.fillRect(0, 2, 8, 1.5);
    c.beginPath();
    c.arc(6, -2, 3, 0, 7);
    c.fill();
    c.fillStyle = '#222';
    c.fillRect(5, -3, 1, 1);
    c.fillRect(7, -3, 1, 1);
  },
  blood: (c) => {
    c.fillStyle = 'rgba(100,10,6,0.7)';
    c.beginPath();
    c.ellipse(0, 0, 10, 4, 0.2, 0, 7);
    c.fill();
  },
  rug: (c, o) => {
    c.fillStyle = o.tint ?? '#7a3a2a';
    poly(c, [{ x: -24, y: -8 }, { x: 16, y: -8 }, { x: 24, y: 8 }, { x: -16, y: 8 }]);
    c.strokeStyle = 'rgba(220,180,100,0.5)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(-18, -5);
    c.lineTo(14, -5);
    c.lineTo(19, 5);
    c.lineTo(-13, 5);
    c.closePath();
    c.stroke();
  },
  grate: (c) => {
    c.strokeStyle = 'rgba(20,20,20,0.7)';
    c.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      c.beginPath();
      c.moveTo(-10 + i * 5, -6);
      c.lineTo(-6 + i * 5, 6);
      c.stroke();
    }
  },
  mat: (c) => {
    c.fillStyle = '#5a4a3a';
    poly(c, [{ x: -12, y: -5 }, { x: 8, y: -5 }, { x: 12, y: 5 }, { x: -8, y: 5 }]);
  },
  sink: (c) => {
    box(c, 14, 10, 14, '#c8c8c0', '#a8a8a0', '#909088');
    c.fillStyle = '#6a7a7a';
    c.fillRect(-4, -15, 8, 3);
  },
  toilet: (c) => {
    c.fillStyle = '#d8d8d0';
    c.beginPath();
    c.ellipse(0, -8, 6, 4, 0, 0, 7);
    c.fill();
    c.fillRect(-4, -8, 8, 8);
    c.fillRect(-6, -20, 12, 8);
  },
  hydrocore: (c, o, t) => {
    // The shelter's water purification core housing.
    box(c, 30, 18, 30, '#5a6a6e', '#4a5a5e', '#3a4a4e');
    c.fillStyle = '#1a2224';
    c.fillRect(-8, -26, 16, 12);
    c.fillStyle = o.used ? `rgba(80,200,255,${0.6 + Math.sin(t * 3) * 0.3})` : 'rgba(200,40,30,0.8)';
    c.fillRect(-6, -24, 12, 8);
    c.fillStyle = '#e08a2a';
    c.fillRect(-15, -6, 30, 2);
  },
  corechip: (c, o, t) => {
    // A loose purification core module (quest item on a pedestal).
    box(c, 12, 10, 16, '#7a7a70', '#606058', '#4e4e48');
    c.fillStyle = `rgba(80,200,255,${0.6 + Math.sin(t * 4) * 0.3})`;
    c.fillRect(-4, -24, 8, 6);
    c.fillStyle = '#c8a040';
    c.fillRect(-5, -19, 10, 2);
  },
  reactor: (c, o, t) => {
    c.fillStyle = '#4a5054';
    c.beginPath();
    c.ellipse(0, 0, 16, 8, 0, 0, 7);
    c.fill();
    c.fillRect(-16, -40, 32, 40);
    c.fillStyle = o.used ? '#301010' : `rgba(255,${120 + Math.sin(t * 5) * 60},40,0.85)`;
    c.fillRect(-10, -34, 20, 12);
    c.fillStyle = '#6a7074';
    c.beginPath();
    c.ellipse(0, -40, 16, 8, 0, 0, 7);
    c.fill();
  },
  radsign: (c) => {
    c.fillStyle = '#4a3a2a';
    c.fillRect(-1, -24, 2, 24);
    c.fillStyle = '#d8b030';
    poly(c, [{ x: 0, y: -38 }, { x: 10, y: -22 }, { x: -10, y: -22 }]);
    c.fillStyle = '#222';
    c.beginPath();
    c.arc(0, -27, 3, 0, 7);
    c.fill();
  },
  elevator: (c, o, t) => {
    box(c, 22, 8, 40, '#6a7074', '#50565a', '#40464a');
    c.fillStyle = '#2a2e30';
    c.fillRect(-8, -36, 16, 34);
    c.fillStyle = '#909090';
    c.fillRect(-0.5, -36, 1, 34);
    c.fillStyle = `rgba(60,220,90,${0.6 + Math.sin(t * 3) * 0.3})`;
    c.fillRect(10, -24, 2, 3);
  },
  ladder: (c) => {
    c.strokeStyle = '#6a6a6a';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(-5, 0);
    c.lineTo(-5, -40);
    c.moveTo(5, 0);
    c.lineTo(5, -40);
    for (let i = 0; i < 7; i++) {
      c.moveTo(-5, -4 - i * 6);
      c.lineTo(5, -4 - i * 6);
    }
    c.stroke();
  },
  manhole: (c) => {
    c.fillStyle = '#3a3a3a';
    c.beginPath();
    c.ellipse(0, 0, 9, 4.5, 0, 0, 7);
    c.fill();
    c.strokeStyle = '#5a5a5a';
    c.stroke();
  },
  altar: (c, o, t) => {
    box(c, 26, 12, 12, '#8a8a90', '#6a6a70', '#5a5a60');
    c.fillStyle = `rgba(180,200,255,${0.4 + Math.sin(t * 2) * 0.2})`;
    c.beginPath();
    c.arc(0, -20, 5, 0, 7);
    c.fill();
  },
  pew: (c) => {
    box(c, 30, 6, 10, '#6a4a2a', '#543a20', '#44301a');
    c.fillStyle = '#44301a';
    c.fillRect(-14, -18, 28, 8);
  },
  crystal: (c, o, t) => {
    c.fillStyle = `rgba(160,220,255,0.75)`;
    poly(c, [{ x: 0, y: -34 }, { x: 7, y: -12 }, { x: 0, y: 0 }, { x: -7, y: -12 }]);
    c.fillStyle = `rgba(255,255,255,${0.3 + Math.sin(t * 3) * 0.2})`;
    poly(c, [{ x: 0, y: -34 }, { x: 3, y: -14 }, { x: -3, y: -14 }]);
  },
};

export function drawProp(c: CanvasRenderingContext2D, o: MapObject, x: number, y: number, t: number) {
  const p = P[o.kind];
  c.save();
  c.translate(Math.round(x), Math.round(y));
  if (p) p(c, o, t);
  else box(c, 16, 12, 14, '#7a7a70', '#606058', '#4e4e48');
  c.restore();
}

export function hasPainter(kind: string) {
  return !!P[kind];
}

/** Doors are drawn by the renderer as part of the wall line. */
export function drawDoor(c: CanvasRenderingContext2D, o: MapObject, x: number, y: number, wallH: number, faceColor: string) {
  c.save();
  c.translate(Math.round(x), Math.round(y));
  const isHatch = o.kind === 'hatch';
  const isGate = o.kind === 'gate';
  const w = isHatch ? 30 : 22;
  const h = isHatch ? Math.min(wallH, 50) : Math.min(wallH - 6, 36);
  if (o.vertical) {
    // Door in a wall running along r (the slanted "\" direction).
    c.transform(0.5, 0.5, 0, 1, 0, 0);
  }
  const x0 = -w / 2;
  if (o.open) {
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(x0, -h, w, h);
    c.fillStyle = shade(faceColor.startsWith('#') ? faceColor : '#6a5a4a', 0.7);
    if (!isHatch && !isGate) c.fillRect(x0 - 2, -h, 4, h);
  } else if (isHatch) {
    c.fillStyle = '#4a5054';
    c.beginPath();
    c.arc(0, -h / 2, h / 2, 0, 7);
    c.fill();
    c.fillStyle = '#6a7478';
    c.beginPath();
    c.arc(0, -h / 2, h / 2 - 4, 0, 7);
    c.fill();
    c.fillStyle = '#e08a2a';
    c.font = 'bold 12px monospace';
    c.textAlign = 'center';
    c.fillText(o.label ?? '29', 0, -h / 2 + 4);
    c.strokeStyle = '#3a4044';
    c.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.beginPath();
      c.moveTo(Math.cos(a) * (h / 2 - 4), -h / 2 + Math.sin(a) * (h / 2 - 4));
      c.lineTo(Math.cos(a) * (h / 2), -h / 2 + Math.sin(a) * (h / 2));
      c.stroke();
    }
  } else if (isGate) {
    c.strokeStyle = '#5a5a5a';
    c.lineWidth = 2;
    for (let i = 0; i <= 5; i++) {
      c.beginPath();
      c.moveTo(x0 + (i * w) / 5, 0);
      c.lineTo(x0 + (i * w) / 5, -h);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(x0, -h * 0.5);
    c.lineTo(x0 + w, -h * 0.5);
    c.stroke();
  } else {
    c.fillStyle = '#6a4a2e';
    c.fillRect(x0, -h, w, h);
    c.fillStyle = '#56391f';
    c.fillRect(x0 + 2, -h + 3, w - 4, h / 2 - 4);
    c.fillRect(x0 + 2, -h / 2 + 2, w - 4, h / 2 - 5);
    c.fillStyle = o.locked ? '#c04030' : '#c8a040';
    c.fillRect(x0 + w - 5, -h / 2, 2, 3);
  }
  c.restore();
}
