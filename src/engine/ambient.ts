// Small ambient life drawn in the world: flocks of birds crossing overhead
// (their shadows sliding over the ground) and butterflies over the meadows.

import { G } from '../G';
import { T } from '../world/terrain';
import { hourF } from '../state';
import { rand } from './util';

interface Bird { x: number; y: number; vx: number; vy: number; ph: number; alt: number }
interface Fly { x: number; y: number; vx: number; vy: number; ph: number; col: string; life: number }

const birds: Bird[] = [];
const flies: Fly[] = [];
let nextFlock = 20;

export function clearAmbient() { birds.length = 0; flies.length = 0; }

export function updateAmbient(dt: number, rain: number) {
  const map = G.map;
  if (!map || !map.outdoor || G.mode === 'title') { birds.length = 0; flies.length = 0; return; }
  const h = hourF();
  const day = h > 5.5 && h < 20.5;
  const cam = G.cam;
  // birds
  nextFlock -= dt;
  if (nextFlock <= 0 && day && rain < 0.5) {
    nextFlock = rand.range(35, 90);
    const fromLeft = rand.chance(0.5);
    const y0 = cam.y + rand.range(-40, G.viewH * 0.6);
    const vx = (fromLeft ? 1 : -1) * rand.range(34, 48), vy = rand.range(-6, 6);
    const n = rand.int(3, 7);
    for (let i = 0; i < n; i++) {
      birds.push({ x: (fromLeft ? cam.x - 30 : cam.x + G.viewW + 30) - Math.sign(vx) * i * rand.range(6, 12), y: y0 + (i % 2 ? 1 : -1) * i * rand.range(3, 6), vx: vx * rand.range(0.95, 1.05), vy, ph: rand.range(0, 6), alt: rand.range(40, 70) });
    }
  }
  for (let i = birds.length - 1; i >= 0; i--) {
    const b = birds[i];
    b.x += b.vx * dt; b.y += b.vy * dt; b.ph += dt * 9;
    if (b.x < cam.x - 120 || b.x > cam.x + G.viewW + 120) birds.splice(i, 1);
  }
  // butterflies near the player over flowery ground
  if (day && rain < 0.3 && flies.length < 7 && Math.random() < dt * 0.6) {
    const x = cam.x + rand.range(0, G.viewW), y = cam.y + rand.range(0, G.viewH);
    const t = map.get(Math.floor(x / 16), Math.floor(y / 16));
    if (t === T.MEADOW || t === T.GRASS && Math.random() < 0.3) flies.push({ x, y, vx: rand.range(-8, 8), vy: rand.range(-6, 6), ph: rand.range(0, 6), col: rand.pick(['#f4f0e0', '#f0d860', '#e89040', '#a8c8f0', '#f0b0c8']), life: rand.range(8, 16) });
  }
  for (let i = flies.length - 1; i >= 0; i--) {
    const f = flies[i];
    f.life -= dt;
    f.ph += dt * 16;
    f.vx += rand.range(-30, 30) * dt; f.vy += rand.range(-30, 30) * dt;
    f.vx *= 0.98; f.vy *= 0.98;
    f.x += f.vx * dt; f.y += f.vy * dt;
    if (f.life <= 0) flies.splice(i, 1);
  }
}

/** Shadows first (on the ground), called before objects are drawn. */
export function drawAmbientShadows(ctx: CanvasRenderingContext2D, sunStrength: number) {
  if (!birds.length || sunStrength < 0.05) return;
  ctx.save();
  ctx.fillStyle = `rgba(10,8,6,${0.18 * sunStrength})`;
  for (const b of birds) {
    const s = 0.8 + Math.sin(b.ph) * 0.35;
    ctx.beginPath();
    ctx.ellipse(b.x + 6, b.y + b.alt, 2.4 * s, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Birds and butterflies (world space, above everything on the ground). */
export function drawAmbient(ctx: CanvasRenderingContext2D) {
  if (!birds.length && !flies.length) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const b of birds) {
    const w = Math.sin(b.ph);
    ctx.strokeStyle = '#2a2420';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(b.x - 3.2, b.y - w * 2);
    ctx.quadraticCurveTo(b.x - 1.4, b.y - 1.2 - w * 0.8, b.x, b.y);
    ctx.quadraticCurveTo(b.x + 1.4, b.y - 1.2 - w * 0.8, b.x + 3.2, b.y - w * 2);
    ctx.stroke();
  }
  for (const f of flies) {
    const a = Math.min(1, f.life) * 0.95;
    const flap = Math.abs(Math.sin(f.ph));
    ctx.globalAlpha = a;
    ctx.fillStyle = f.col;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(f.x + s * 0.9 * flap, f.y - 0.6, 0.9 * flap + 0.2, 1.1, s * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#2a2018';
    ctx.fillRect(f.x - 0.15, f.y - 1.2, 0.3, 1.6);
  }
  ctx.restore();
}
