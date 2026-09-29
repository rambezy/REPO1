// Weapons as smooth meshes for the character material: blades lofted from
// lens-shaped sections with a curve and a polished edge, wrapped grips,
// guards, collars and pommels, clubs and maces turned on a lathe, picks,
// polearms and crossbows. The grip is at the origin with the blade along +Y
// and the edge toward +Z, as the animations hold them.
import * as THREE from 'three';
import type { WeaponVis } from '../sim/look';
import { SkinBuilder, Sec, Paint, RGB, Weights, loft, lathe, frame, rgb, mix, shade } from './skin';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const X = V(1, 0, 0), Y = V(0, 1, 0), Z = V(0, 0, 1);
const W: Weights = [[0, 1]];
const HP = Math.PI / 2;
const P = (c: RGB, s: Paint['s']): Paint => ({ c, s });
/** Angular distance. */
const ad = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

const IRON = rgb(0x3a3834), BRASS = rgb(0x9a7a3a), WOOD = rgb(0x5a4430), RAY = rgb(0xcfc6b0);

/** One row of a blade: height, centre line (toward the edge), reach of the edge and of the back from it, thickness. */
type BladeRow = [y: number, z: number, edge: number, back: number, t: number];

/** A blade along its rows, closing to a point at `tip`; the edge side gets a polished bevel. */
function blade(b: SkinBuilder, rows: BladeRow[], steel: RGB, tip: THREE.Vector3, o: { twoEdged?: boolean; e?: number; n?: number } = {}) {
  const bright = mix(steel, [0.95, 0.95, 0.93], 0.35);
  const secs: Sec[] = rows.map(([y, z, we, wb, t], i) => {
    const nx = rows[Math.min(rows.length - 1, i + 1)], pv = rows[Math.max(0, i - 1)];
    const d = V(0, nx[0] - pv[0], nx[1] - pv[1]).normalize();
    const { u, v } = frame(d, Z);
    return {
      c: V(0, y, z), u, v, rx: t / 2, rf: we, rb: wb, e: o.e ?? 1.35, w: W,
      // the bevel catches the light along the edge (both edges on a two-edged blade)
      paint: (a: number) => (ad(a, HP) < 0.5 || (o.twoEdged && ad(a, -HP) < 0.5) ? P(bright, 'metal') : P(steel, 'metal')),
    };
  });
  loft(b, secs, o.n ?? 10, { capStart: true, capEnd: tip });
}

/** A round-ish shaft between two heights on the Y axis (grips, poles), with its paint by height and angle. */
function shaft(b: SkinBuilder, ys: number[], r: (y: number) => number, pnt: (y: number, a: number) => Paint, n = 10, ovalZ = 1, caps = true) {
  const secs: Sec[] = ys.map((y) => ({ c: V(0, y, 0), u: X, v: Z, rx: r(y), rf: r(y) * ovalZ, rb: r(y) * ovalZ, w: W, paint: (a: number) => pnt(y, a) }));
  loft(b, secs, n, caps ? { capStart: true, capEnd: true } : {});
}

const range = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

/** Cord wound over the grip in diamonds, the ray skin showing between. */
const wrapped = (hc: RGB) => (y: number, a: number): Paint => {
  const k = (a / Math.PI) * 2;
  const p = Math.abs(((y * 30 + k) % 1 + 1) % 1 - 0.5) + Math.abs(((y * 30 - k) % 1 + 1) % 1 - 0.5);
  return p < 0.28 ? P(RAY, 'leather') : P(hc, 'cloth');
};
/** Leather strip wound round and round. */
const bound = (hc: RGB) => (y: number, a: number): Paint => P((((y * 42 + a / (Math.PI * 2)) % 1) + 1) % 1 < 0.14 ? shade(hc, 0.7) : hc, 'leather');

/** A guard or disc turned about Y at height y. */
function disc(b: SkinBuilder, y: number, r: number, h: number, c: RGB, sx = 1, sz = 1) {
  lathe(b, V(0, y, 0), [[0, 0], [r * 0.96, 0], [r, h * 0.5], [r * 0.96, h], [0, h]], 14, () => P(c, 'metal'), W, { sx, sz });
}

/** A bar across Z (the edge direction) at height y: crossguards. */
function bar(b: SkinBuilder, y: number, z0: number, z1: number, r: number, c: RGB, curl = 0) {
  const pts = range(z0, z1, 6).map((z) => V(0, y + curl * ((z - (z0 + z1) / 2) / ((z1 - z0) / 2)) ** 2, z));
  const secs: Sec[] = pts.map((p, i) => {
    const d = (i < pts.length - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
    const { u, v } = frame(d, Y);
    const k = 1 - 0.35 * Math.abs((i / (pts.length - 1)) * 2 - 1);
    return { c: p, u, v, rx: r * k, rf: r * 1.1 * k, rb: r * 1.1 * k, w: W, paint: P(c, 'metal') };
  });
  loft(b, secs, 8, { capStart: true, capEnd: true });
}

/** A tapering spike or prong from `a` toward `b`. */
function spike(bb: SkinBuilder, a: THREE.Vector3, b: THREE.Vector3, r: number, c: RGB, n = 6) {
  const d = b.clone().sub(a).normalize();
  const { u, v } = frame(d, Math.abs(d.y) > 0.9 ? Z : Y);
  loft(bb, [0, 0.5].map((k) => ({ c: a.clone().lerp(b, k), u, v, rx: r * (1 - k * 0.7), rf: r * (1 - k * 0.7), rb: r * (1 - k * 0.7), w: W, paint: P(c, 'metal') })), n, { capStart: true, capEnd: b });
}

/** Weapon mesh, grip at the origin, blade along +Y, edge toward +Z. */
export function buildWeapon(v: WeaponVis): THREE.BufferGeometry {
  const b = new SkinBuilder();
  const L = v.length;
  const wd = v.wide ?? 1;
  const steel = rgb(v.blade), hc = rgb(v.handle);
  switch (v.kind) {
    case 'katana': {
      // tsuka wrapped in cord over ray skin, a round tsuba, a brass habaki, and a curved blade with a kissaki
      shaft(b, range(-0.21, 0.075, 8), (y) => 0.0145 - 0.0012 * Math.abs(y + 0.07) * 6, wrapped(hc), 10, 1.18);
      shaft(b, [-0.228, -0.222, -0.21], (y) => (y < -0.225 ? 0.01 : 0.0152), () => P(IRON, 'metal'), 10, 1.18);
      disc(b, 0.075, 0.037, 0.008, IRON, 0.86, 1);
      loft(b, [0.083, 0.097, 0.11].map((y) => ({ c: V(0, y, 0.003), u: X, v: Z, rx: 0.0062, rf: 0.0172, rb: 0.0125, e: 2.2, w: W, paint: P(BRASS, 'metal') })), 10, { capStart: true, capEnd: true });
      const y0 = 0.083, sori = 0.022 * (L / 0.7);
      const rows: BladeRow[] = [0, 0.08, 0.2, 0.35, 0.5, 0.65, 0.8, 0.9, 0.95].map((t) => {
        const y = y0 + t * L;
        const z = sori * t * t;
        return [y, z, (0.0175 - 0.004 * t) * wd, (0.011 - 0.002 * t) * wd, 0.0068 - 0.0018 * t];
      });
      const last = rows[rows.length - 1];
      rows.push([y0 + 0.985 * L, last[1] + 0.001, 0.009 * wd, 0.0085 * wd, 0.004]);
      blade(b, rows, steel, V(0, y0 + L, sori * 0.98 - 0.006 * wd));
      break;
    }
    case 'sabre': {
      shaft(b, range(-0.16, 0.055, 6), (y) => 0.0155 + 0.002 * Math.sin((y + 0.16) * 14), bound(hc), 10, 1.15);
      lathe(b, V(0, -0.2, 0), [[0, 0], [0.017, 0.004], [0.021, 0.02], [0.016, 0.036], [0, 0.04]], 12, () => P(BRASS, 'metal'), W);
      bar(b, 0.06, -0.055, 0.065, 0.009, BRASS, -0.012);
      const y0 = 0.07, curve = 0.06 * (L / 0.8);
      const rows: BladeRow[] = [0, 0.1, 0.25, 0.4, 0.55, 0.7, 0.82, 0.9].map((t) => [y0 + t * L, curve * t * t, (0.022 - 0.005 * t) * wd, (0.009 - 0.002 * t) * wd, 0.0065 - 0.0025 * t]);
      rows.push([y0 + 0.96 * L, curve * 0.93, 0.011 * wd, 0.006, 0.003]);
      blade(b, rows, steel, V(0, y0 + L, curve * 1.02));
      break;
    }
    case 'hacker': {
      // a cleaver: straight back, the blade widening to a squared chopping end
      shaft(b, range(-0.2, 0.06, 6), () => 0.017, bound(hc), 10, 1.2);
      lathe(b, V(0, -0.225, 0), [[0, 0], [0.019, 0.004], [0.02, 0.018], [0, 0.026]], 10, () => P(IRON, 'metal'), W);
      bar(b, 0.065, -0.03, 0.05, 0.011, IRON);
      const y0 = 0.07;
      const rows: BladeRow[] = [0, 0.15, 0.35, 0.55, 0.75, 0.9, 0.97].map((t) => {
        const wE = (0.03 + 0.065 * t * t) * wd;
        return [y0 + t * L, 0.012 + wE * 0.35, wE * 0.65, wE * 0.35 + 0.004, 0.009 - 0.002 * t];
      });
      blade(b, rows, steel, V(0, y0 + L, 0.05 * wd), { e: 1.8 });
      break;
    }
    case 'heavy': {
      // a great slab of a blade on a long grip, with a heavy guard and a slanted chisel end
      shaft(b, range(-0.34, 0.085, 8), () => 0.019, bound(hc), 10, 1.15);
      lathe(b, V(0, -0.37, 0), [[0, 0], [0.024, 0.006], [0.026, 0.024], [0, 0.034]], 10, () => P(IRON, 'metal'), W);
      bar(b, 0.095, -0.1, 0.11, 0.017, rgb(0x4a4038));
      const y0 = 0.1;
      const rows: BladeRow[] = [0, 0.08, 0.3, 0.55, 0.8, 0.92].map((t) => [y0 + t * L, 0.01, 0.085 * wd, 0.07 * wd, 0.02 - 0.004 * t]);
      rows.push([y0 + 0.985 * L, 0.03 * wd, 0.065 * wd, 0.03 * wd, 0.013]);
      blade(b, rows, steel, V(0, y0 + L, 0.08 * wd), { e: 2.6, n: 12 });
      break;
    }
    case 'blunt': {
      // a hafted club: iron-banded wooden head, or a flanged mace with spikes
      const top = L + 0.08;
      shaft(b, range(-0.27, top - 0.1, 8), (y) => 0.019 + 0.006 * Math.max(0, (y + 0.27) / (top + 0.17)), (y, a) => (y < 0.02 ? bound(hc)(y, a) : P(WOOD, 'leather')), 10);
      lathe(b, V(0, -0.29, 0), [[0, 0], [0.022, 0.004], [0.025, 0.02], [0, 0.028]], 10, () => P(IRON, 'metal'), W);
      const hr = 0.062 * wd;
      const head: [number, number][] = [[0, 0], [hr * 0.7, 0.004], [hr, 0.04], [hr * 1.06, 0.1], [hr, 0.16], [hr * 0.72, 0.196], [0, 0.2]];
      lathe(b, V(0, top - 0.14, 0), head, 14, (i) => P(i === 1 || i === 4 ? IRON : steel, 'metal'), W);
      if (v.variant === 1) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + (k % 2) * 0.4;
          const y = top - 0.14 + (k % 2 ? 0.07 : 0.13);
          const at = V(Math.sin(a) * hr * 0.95, y, Math.cos(a) * hr * 0.95);
          spike(b, at, at.clone().add(V(Math.sin(a) * 0.05, 0, Math.cos(a) * 0.05)), 0.012, rgb(0x5a5a5a));
        }
        spike(b, V(0, top + 0.05, 0), V(0, top + 0.11, 0), 0.014, rgb(0x5a5a5a));
      }
      break;
    }
    case 'polearm': {
      // a long pole with a socket and a glaive blade
      const top = L * 0.45 + 0.06;
      shaft(b, range(-1.02, top, 10), (y) => 0.019 + 0.003 * (y + 1.02) / (top + 1.02), (y, a) => (Math.abs(y + 0.02) < 0.16 ? bound(hc)(y, a) : P(hc, 'leather')), 10);
      lathe(b, V(0, -1.05, 0), [[0, 0], [0.018, 0.004], [0.022, 0.03], [0, 0.034]], 10, () => P(IRON, 'metal'), W);
      shaft(b, [top - 0.04, top, top + 0.06], (y) => (y > top + 0.03 ? 0.018 : 0.026), () => P(rgb(0x4a3e30), 'metal'), 10, 1, false);
      const y0 = top + 0.05, bl = 0.56, curve = 0.05;
      const rows: BladeRow[] = [0, 0.12, 0.3, 0.5, 0.7, 0.85, 0.93].map((t) => [y0 + t * bl, 0.004 + curve * t * t, (0.021 + 0.008 * Math.sin(t * Math.PI)) * wd, 0.011 * wd, 0.007 - 0.003 * t]);
      blade(b, rows, steel, V(0, y0 + bl, curve * 1.05));
      break;
    }
    case 'dagger': {
      shaft(b, range(-0.1, 0.012, 4), () => 0.013, bound(hc), 8, 1.2);
      lathe(b, V(0, -0.118, 0), [[0, 0], [0.014, 0.004], [0.016, 0.014], [0, 0.02]], 8, () => P(IRON, 'metal'), W);
      bar(b, 0.016, -0.028, 0.028, 0.006, IRON);
      const y0 = 0.02;
      const rows: BladeRow[] = [0, 0.2, 0.5, 0.75, 0.9].map((t) => [y0 + t * L, 0, (0.015 - 0.006 * t) * wd, (0.015 - 0.006 * t) * wd, 0.006 - 0.002 * t]);
      blade(b, rows, steel, V(0, y0 + L, 0), { twoEdged: true, e: 1.1 });
      break;
    }
    case 'pick': {
      shaft(b, range(-0.32, 0.56, 8), (y) => 0.018 + 0.004 * (y + 0.32) / 0.88, (y, a) => (y < 0.0 ? bound(hc)(y, a) : P(WOOD, 'leather')), 10);
      shaft(b, [0.49, 0.52, 0.55], () => 0.028, () => P(IRON, 'metal'), 10, 1, true);
      // a curved spike forward and a short one back
      const pts = [V(0, 0.52, 0.02), V(0, 0.515, 0.12), V(0, 0.49, 0.22), V(0, 0.45, 0.3)];
      loft(b, pts.map((p, i) => { const d = (i < pts.length - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize(); const { u, v: vv } = frame(d, Y); const r = 0.022 * (1 - i / 4); return { c: p, u, v: vv, rx: r, rf: r * 1.3, rb: r * 1.3, w: W, paint: P(steel, 'metal') }; }), 8, { capStart: true, capEnd: V(0, 0.42, 0.34) });
      spike(b, V(0, 0.52, -0.02), V(0, 0.5, -0.15), 0.02, steel, 8);
      break;
    }
    case 'crossbow': {
      // stock along +Z, the prod across it near the front, the string drawn back to the nut
      const sp = range(-0.02, 0.62, 8).map((z) => V(0, 0.05 - (0.03 * Math.max(0, 0.18 - z)) / 0.2, z));
      loft(b, sp.map((c, i) => {
        const z = c.z;
        const f = frame((i < sp.length - 1 ? sp[i + 1].clone().sub(c) : c.clone().sub(sp[i - 1])).normalize(), Y);
        return { c, u: f.u, v: f.v, rx: 0.02 + (0.008 * Math.max(0, 0.15 - z)) / 0.17, rf: 0.022, rb: 0.024 + (0.02 * Math.max(0, 0.2 - z)) / 0.22, e: 3, w: W, paint: P(hc, 'leather') };
      }), 10, { capStart: true, capEnd: true });
      const pz = 0.52, span = 0.31 * (L / 0.6);
      const prod = range(-1, 1, 8).map((k) => V(k * span, 0.085, pz + 0.07 * k * k));
      loft(b, prod.map((p, i) => { const d = (i < prod.length - 1 ? prod[i + 1].clone().sub(p) : p.clone().sub(prod[i - 1])).normalize(); const f = frame(d, Y); const r = 0.012 - 0.005 * Math.abs(i / 4 - 1); return { c: p, u: f.u, v: f.v, rx: r * 1.3, rf: r, rb: r, w: W, paint: P(steel, 'metal') }; }), 8, { capStart: true, capEnd: true });
      for (const side of [1, -1]) {
        const a = V(side * span, 0.085, pz + 0.07), c = V(0, 0.08, 0.36);
        const d = c.clone().sub(a).normalize(); const f = frame(d, Y);
        loft(b, [a, c].map((p) => ({ c: p, u: f.u, v: f.v, rx: 0.0022, rf: 0.0022, rb: 0.0022, w: W, paint: P(rgb(0xd8d0c0), 'cloth') })), 4, {});
      }
      break;
    }
    default:
      break;
  }
  return b.build();
}
