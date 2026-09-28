// Particles, floating text and ground decals.

import { rand } from './util';
import { drawText } from '../gfx/font';

export type PKind = 'smoke' | 'spark' | 'ember' | 'dust' | 'blood' | 'leaf' | 'firefly' | 'splash' | 'hay' | 'feather' | 'heart' | 'note' | 'steam' | 'petal' | 'ash';

export interface Particle {
  kind: PKind;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number;
  color: string;
  grav: number;
  drag: number;
  glow?: boolean;
}

const MAX = 900;
export const particles: Particle[] = [];

export function emit(kind: PKind, x: number, y: number, o: Partial<Particle> = {}) {
  if (particles.length >= MAX) particles.shift();
  const base: Particle = { kind, x, y, z: 0, vx: 0, vy: 0, vz: 0, life: 1, max: 1, size: 1, color: '#fff', grav: 0, drag: 0.98 };
  switch (kind) {
    case 'smoke':
      Object.assign(base, { vx: rand.range(-3, 3), vz: rand.range(8, 14), life: rand.range(2.5, 4), size: rand.range(2, 3), color: '#8a8480', drag: 0.99 });
      break;
    case 'steam':
      Object.assign(base, { vx: rand.range(-2, 2), vz: rand.range(10, 16), life: rand.range(0.8, 1.4), size: 1.5, color: '#d8e0e8', drag: 0.98 });
      break;
    case 'spark':
      Object.assign(base, { vx: rand.range(-60, 60), vy: rand.range(-30, 30), vz: rand.range(20, 70), life: rand.range(0.25, 0.6), size: 1, color: rand.pick(['#fff3b0', '#ffc24a', '#ffe080']), grav: 160, drag: 0.94, glow: true });
      break;
    case 'ember':
      Object.assign(base, { vx: rand.range(-6, 6), vz: rand.range(14, 30), life: rand.range(1, 2.4), size: 1, color: rand.pick(['#ffb347', '#e0762b', '#fff3b0']), drag: 0.99, glow: true });
      break;
    case 'dust':
      Object.assign(base, { vx: rand.range(-12, 12), vy: rand.range(-4, 4), vz: rand.range(4, 10), life: rand.range(0.3, 0.6), size: 1, color: '#a8845a', grav: 20 });
      break;
    case 'blood':
      Object.assign(base, { vx: rand.range(-50, 50), vy: rand.range(-20, 20), vz: rand.range(20, 60), life: rand.range(0.4, 0.8), size: rand.chance(0.3) ? 2 : 1, color: rand.pick(['#7a1414', '#a82020', '#5a0d0d']), grav: 180, drag: 0.95 });
      break;
    case 'leaf':
      Object.assign(base, { vx: rand.range(-8, 8), vy: rand.range(2, 8), vz: rand.range(0, 4), life: rand.range(3, 6), size: 1, color: rand.pick(['#5c8f3d', '#7aab4d', '#b8a040', '#8a6a2a']), grav: 2, drag: 0.995 });
      break;
    case 'firefly':
      Object.assign(base, { vx: rand.range(-5, 5), vy: rand.range(-5, 5), vz: rand.range(4, 14), life: rand.range(3, 6), size: 1, color: '#d8f080', drag: 1, glow: true });
      break;
    case 'splash':
      Object.assign(base, { vx: rand.range(-30, 30), vy: rand.range(-10, 10), vz: rand.range(20, 45), life: 0.45, size: 1, color: '#cde4ef', grav: 180, drag: 0.95 });
      break;
    case 'hay': case 'feather':
      Object.assign(base, { vx: rand.range(-25, 25), vy: rand.range(-10, 10), vz: rand.range(10, 30), life: rand.range(0.8, 1.5), size: 1, color: kind === 'hay' ? '#d8bd72' : '#f0ece4', grav: 30, drag: 0.96 });
      break;
    case 'heart': case 'note':
      Object.assign(base, { vx: rand.range(-4, 4), vz: 14, life: 1.4, size: 1, color: kind === 'heart' ? '#e05060' : '#90d070', drag: 1 });
      break;
    case 'petal':
      Object.assign(base, { vx: rand.range(-6, 6), vy: rand.range(-2, 6), vz: rand.range(6, 20), life: rand.range(2, 4), size: 1, color: rand.pick(['#f4e9a0', '#f2f0e6', '#e8a0a8', '#b89ad8']), grav: 4, drag: 0.99 });
      break;
    case 'ash':
      Object.assign(base, { vx: rand.range(-4, 4), vy: rand.range(-2, 2), vz: rand.range(10, 30), life: rand.range(3, 6), size: 1, color: rand.pick(['#57514b', '#3d3935', '#8a8480']), grav: 3, drag: 0.995 });
      break;
  }
  Object.assign(base, o);
  base.max = base.life;
  particles.push(base);
  return base;
}

export function updateParticles(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.vx *= Math.pow(p.drag, dt * 60);
    p.vy *= Math.pow(p.drag, dt * 60);
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vz -= p.grav * dt;
    p.z += p.vz * dt;
    if (p.z < 0 && p.grav > 0) {
      p.z = 0; p.vz = 0; p.vx *= 0.5; p.vy *= 0.5;
      if (p.kind === 'blood' && Math.random() < 0.3) addDecal('blood', p.x, p.y);
    }
    if (p.kind === 'firefly') { p.vx += rand.range(-20, 20) * dt; p.vy += rand.range(-20, 20) * dt; p.vz += rand.range(-10, 10) * dt; }
    if (p.kind === 'leaf' || p.kind === 'petal' || p.kind === 'ash') p.vx += Math.sin(p.life * 3 + p.x) * 6 * dt;
  }
}

export function drawParticles(ctx: CanvasRenderingContext2D) {
  for (const p of particles) {
    const t = p.life / p.max;
    const x = Math.round(p.x), y = Math.round(p.y - p.z);
    switch (p.kind) {
      case 'smoke': case 'steam': {
        const r = p.size + (1 - t) * (p.kind === 'smoke' ? 5 : 2);
        ctx.globalAlpha = Math.min(1, t * 1.4) * (p.kind === 'smoke' ? 0.35 : 0.4);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      }
      case 'heart': case 'note': {
        ctx.globalAlpha = Math.min(1, t * 2);
        drawText(ctx, p.kind === 'heart' ? '♥' : '*', x - 3, y - 4, p.color, '#1b1410');
        ctx.globalAlpha = 1;
        break;
      }
      case 'firefly': {
        const blink = 0.5 + 0.5 * Math.sin(p.life * 6 + p.x);
        ctx.globalAlpha = Math.min(1, t * 3) * blink;
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, 1, 1);
        ctx.globalAlpha = 1;
        break;
      }
      default: {
        ctx.globalAlpha = Math.min(1, t * 2);
        ctx.fillStyle = p.color;
        ctx.fillRect(x, y, p.size, p.size);
        ctx.globalAlpha = 1;
      }
    }
  }
}

/** Glowing particles contribute light at night. */
export function particleLights(): { x: number; y: number; r: number; color: string; intensity: number }[] {
  const out = [];
  for (const p of particles) if (p.glow) out.push({ x: p.x, y: p.y - p.z, r: p.kind === 'firefly' ? 10 : 8, color: p.color, intensity: 0.5 * (p.life / p.max) });
  return out;
}

// ---------- floating text ----------
export interface FloatText { text: string; x: number; y: number; vy: number; life: number; color: string; big?: boolean }
export const floats: FloatText[] = [];
export function floatText(text: string, x: number, y: number, color = '#fff', big = false) {
  floats.push({ text, x, y, vy: -22, life: 1.1, color, big });
}
export function updateFloats(dt: number) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.life -= dt;
    f.y += f.vy * dt;
    f.vy *= 0.94;
    if (f.life <= 0) floats.splice(i, 1);
  }
}
export function drawFloats(ctx: CanvasRenderingContext2D) {
  for (const f of floats) {
    ctx.globalAlpha = Math.min(1, f.life * 2.5);
    drawText(ctx, f.text, f.x, f.y, f.color, '#1b1410', 1, 'center');
  }
  ctx.globalAlpha = 1;
}

// ---------- decals ----------
export interface Decal { kind: string; x: number; y: number; life: number; r: number; seed: number }
export const decals: Decal[] = [];
export function addDecal(kind: string, x: number, y: number, r = 2) {
  if (decals.length > 140) decals.shift();
  decals.push({ kind, x, y, life: 240, r: r + Math.random() * 2, seed: Math.random() });
}
export function updateDecals(dt: number) {
  for (let i = decals.length - 1; i >= 0; i--) { decals[i].life -= dt; if (decals[i].life <= 0) decals.splice(i, 1); }
}
export function drawDecals(ctx: CanvasRenderingContext2D) {
  for (const d of decals) {
    ctx.globalAlpha = Math.min(0.85, d.life / 30);
    if (d.kind === 'blood') {
      ctx.fillStyle = '#5a0d0d';
      ctx.fillRect(Math.round(d.x), Math.round(d.y), Math.ceil(d.r), 1);
      if (d.seed > 0.5) ctx.fillRect(Math.round(d.x + 1), Math.round(d.y - 1), 1, 1);
    } else if (d.kind === 'footprint') {
      ctx.fillStyle = 'rgba(40,30,20,0.35)';
      ctx.fillRect(Math.round(d.x), Math.round(d.y), 2, 1);
    } else if (d.kind === 'scorch') {
      ctx.fillStyle = '#1c1a19';
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 3, d.r * 1.5, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function clearFx() {
  particles.length = 0;
  floats.length = 0;
  decals.length = 0;
}
