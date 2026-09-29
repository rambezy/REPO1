// Transient visual effects and the camera.

import { hexToPixel, type Hex } from '../core/hex';
import { G } from '../game/G';

export interface Projectile {
  from: { x: number; y: number };
  to: { x: number; y: number };
  kind: string;
  t0: number;
  dur: number;
  burst: boolean;
  item?: string;
  done: () => void;
}

export interface Floater {
  x: number;
  y: number;
  text: string;
  color: string;
  t0: number;
}

export interface Blast {
  x: number;
  y: number;
  radius: number;
  t0: number;
  dur: number;
  fire: boolean;
}

export interface Splat {
  q: number;
  r: number;
  ox: number;
  oy: number;
  s: number;
  map: string;
}

export const camera = { x: 0, y: 0, tx: 0, ty: 0, follow: true, shake: 0, manual: false };

export const fxState = {
  projectiles: [] as Projectile[],
  floaters: [] as Floater[],
  blasts: [] as Blast[],
  splats: [] as Splat[],
  fade: 0,
  fadeText: '' as string,
  fadeT0: 0,
};

function center(h: Hex) {
  const p = hexToPixel(h.q, h.r);
  return { x: p.x, y: p.y - 18 };
}

export const fx = {
  projectile(from: Hex, to: Hex, kind: string, burst = false, item?: string): Promise<void> {
    const a = center(from);
    const b = center(to);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const speed = kind === 'laser' ? 3 : kind === 'bullet' ? 1.6 : kind === 'thrown' ? 0.45 : kind === 'rocket' ? 0.6 : kind === 'flame' ? 0.5 : 0.8;
    const dur = Math.max(80, dist / speed) / G.settings.combatSpeed;
    return new Promise((done) => {
      fxState.projectiles.push({ from: a, to: b, kind, t0: performance.now(), dur: burst ? dur + 300 : dur, burst, item, done });
    });
  },
  float(h: Hex, text: string, color = '#ffd24a') {
    const c = center(h);
    fxState.floaters.push({ x: c.x, y: c.y - 30, text, color, t0: performance.now() });
  },
  explosion(at: Hex, radius: number, fire = false): Promise<void> {
    const c = hexToPixel(at.q, at.r);
    const dur = 700;
    fxState.blasts.push({ x: c.x, y: c.y, radius, t0: performance.now(), dur, fire });
    return new Promise((res) => setTimeout(res, dur * 0.6));
  },
  blood(h: Hex, n = 1) {
    const mapId = G.map?.def.id ?? '';
    for (let i = 0; i < n; i++) {
      fxState.splats.push({ q: h.q, r: h.r, ox: (Math.random() - 0.5) * 20, oy: (Math.random() - 0.5) * 8, s: 3 + Math.random() * 5, map: mapId });
    }
    if (fxState.splats.length > 300) fxState.splats.splice(0, fxState.splats.length - 300);
  },
  shake(n: number) {
    camera.shake = Math.max(camera.shake, n);
  },
  centerOn(h: Hex, instant = false) {
    const p = hexToPixel(h.q, h.r);
    camera.tx = p.x;
    camera.ty = p.y;
    camera.manual = false;
    if (instant) {
      camera.x = p.x;
      camera.y = p.y;
    }
  },
  /** Keep a combatant in view; soft recenter if near screen edge. */
  focus(h: Hex, soft = false) {
    const p = hexToPixel(h.q, h.r);
    const w = (window.innerWidth || 800) * 0.35;
    const hh = (window.innerHeight || 600) * 0.3;
    if (!soft || Math.abs(p.x - camera.x) > w || Math.abs(p.y - camera.y) > hh) {
      camera.tx = p.x;
      camera.ty = p.y;
      camera.manual = false;
    }
  },
  fade(text = '') {
    fxState.fade = 1;
    fxState.fadeText = text;
    fxState.fadeT0 = performance.now();
  },
};

export function updateCamera(dt: number) {
  const k = Math.min(1, dt * 6);
  camera.x += (camera.tx - camera.x) * k;
  camera.y += (camera.ty - camera.y) * k;
  if (camera.shake > 0) camera.shake = Math.max(0, camera.shake - dt * 30);
}
