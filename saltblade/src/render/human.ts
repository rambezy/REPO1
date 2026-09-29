// Bodies for people: one smooth skinned mesh each, lofted from anatomical
// cross-sections (pelvis, waist, ribcage, chest, shoulders, thighs, knees,
// calves, biceps, forearms), with a sculpted head (jaw, chin, cheekbones,
// brow, eye sockets, nose, lips, eyes, ears), hair and beards grown from the
// scalp, and fitted clothing, armour, hats and packs. It uses the same rig
// and bones as the animations (charModel); weights blend across the joints,
// so elbows, knees, shoulders and hips bend instead of hinging.
import * as THREE from 'three';
import type { Look, Vis } from '../sim/look';
import { RACE } from '../content/races';
import { B, Rig, LOST_LARM, LOST_RARM, LOST_LLEG, LOST_RLEG } from './charModel';
import { SkinBuilder, Sec, Paint, RGB, Weights, Surf, loft, lathe, blob, frame, rgb, mix, shade, prng, gauss, smoothstep, lerp } from './skin';
import { faceOf, faceShape } from './face';

type Kind = 'human' | 'karuk' | 'thrum' | 'hollow' | 'construct' | 'sentinel' | 'pale';
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), FRONT = V(0, 0, 1);
const HP = Math.PI / 2, TAU = Math.PI * 2;
const P = (c: RGB, s: Surf): Paint => ({ c, s });
/** Angular distance. */
const ad = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Catmull-Rom interpolation over rows keyed by their first column. */
function rowAt(rows: number[][], x: number): number[] {
  const n = rows.length;
  if (x <= rows[0][0]) return rows[0].slice(1);
  if (x >= rows[n - 1][0]) return rows[n - 1].slice(1);
  let i = 0;
  while (i < n - 2 && rows[i + 1][0] < x) i++;
  const r0 = rows[Math.max(0, i - 1)], r1 = rows[i], r2 = rows[i + 1], r3 = rows[Math.min(n - 1, i + 2)];
  const t = (x - r1[0]) / (r2[0] - r1[0]), t2 = t * t, t3 = t2 * t;
  const out: number[] = [];
  for (let k = 1; k < r1.length; k++) {
    const p0 = r0[k], p1 = r1[k], p2 = r2[k], p3 = r3[k];
    out.push(0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3));
  }
  return out;
}

/** Sample positions: every table row, subdivided, plus extra cut points (kept in order). */
function samples(rows: number[][], sub: number, from: number, to: number, cuts: number[] = []): number[] {
  const xs: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) for (let k = 0; k < sub; k++) xs.push(lerp(rows[i][0], rows[i + 1][0], k / sub));
  xs.push(rows[rows.length - 1][0]);
  for (const c of cuts) xs.push(c);
  return [...new Set(xs.filter((x) => x >= from - 1e-6 && x <= to + 1e-6).map((x) => Math.round(x * 1e4) / 1e4))].sort((a, b) => a - b);
}

// --- anatomy tables (y or t, half-width, front depth, back depth [, shift back]) ---
const TORSO_M = [
  [0.845, 0.075, 0.055, 0.065], [0.9, 0.155, 0.083, 0.1], [0.96, 0.17, 0.092, 0.11], [1.02, 0.163, 0.097, 0.094],
  [1.08, 0.15, 0.099, 0.085], [1.14, 0.148, 0.1, 0.084], [1.2, 0.156, 0.106, 0.088], [1.27, 0.168, 0.114, 0.092],
  [1.34, 0.178, 0.114, 0.094], [1.4, 0.186, 0.104, 0.092], [1.445, 0.176, 0.084, 0.088], [1.475, 0.148, 0.07, 0.078], [1.5, 0.104, 0.057, 0.063], [1.525, 0.054, 0.046, 0.048],
];
const TORSO_F = [
  [0.845, 0.08, 0.056, 0.068], [0.9, 0.17, 0.084, 0.108], [0.96, 0.184, 0.09, 0.116], [1.02, 0.168, 0.092, 0.098],
  [1.08, 0.14, 0.088, 0.082], [1.14, 0.128, 0.088, 0.078], [1.2, 0.134, 0.094, 0.082], [1.26, 0.146, 0.102, 0.086],
  [1.32, 0.156, 0.104, 0.088], [1.38, 0.162, 0.098, 0.088], [1.43, 0.158, 0.08, 0.082], [1.46, 0.132, 0.066, 0.07], [1.487, 0.093, 0.053, 0.057], [1.515, 0.046, 0.041, 0.043],
];
const ARM = [
  [-0.2, 0.034, 0.038, 0.036], [-0.12, 0.05, 0.052, 0.05], [-0.03, 0.058, 0.056, 0.054], [0.1, 0.056, 0.053, 0.052],
  [0.3, 0.049, 0.052, 0.047], [0.55, 0.045, 0.048, 0.044], [0.82, 0.039, 0.039, 0.039], [1.0, 0.036, 0.035, 0.041],
  [1.14, 0.041, 0.039, 0.04], [1.35, 0.041, 0.037, 0.036], [1.62, 0.034, 0.03, 0.029], [1.88, 0.028, 0.023, 0.023], [2.0, 0.027, 0.021, 0.021],
];
const LEG = [
  [-0.16, 0.078, 0.074, 0.084, 0], [-0.06, 0.086, 0.082, 0.09, 0], [0.05, 0.088, 0.084, 0.09, 0], [0.2, 0.083, 0.082, 0.08, 0],
  [0.42, 0.074, 0.076, 0.07, 0], [0.65, 0.063, 0.066, 0.058, 0], [0.86, 0.053, 0.056, 0.049, 0], [1.0, 0.049, 0.052, 0.047, 0],
  [1.1, 0.049, 0.046, 0.056, 0.004], [1.28, 0.05, 0.043, 0.064, 0.008], [1.5, 0.043, 0.038, 0.05, 0.005],
  [1.75, 0.034, 0.031, 0.036, 0.002], [1.93, 0.029, 0.028, 0.03, 0], [2.0, 0.03, 0.03, 0.032, 0],
];
// along the hand from the wrist (×s): half-width across the palm, half-thickness
const HAND = [[0, 0.026, 0.02], [0.03, 0.037, 0.018], [0.075, 0.043, 0.016], [0.105, 0.042, 0.015], [0.14, 0.037, 0.013], [0.168, 0.028, 0.011], [0.18, 0.016, 0.008]];
// the palm alone, to the knuckles, when the fingers are made separately
const PALM = [[0, 0.026, 0.02], [0.03, 0.037, 0.018], [0.07, 0.043, 0.016], [0.095, 0.041, 0.014], [0.108, 0.034, 0.012]];
// along the foot from the heel (×s): half-width, top, bottom
const FOOT = [[-0.06, 0.028, 0.06, 0.002], [-0.035, 0.036, 0.085, 0.002], [0.01, 0.041, 0.092, 0.002], [0.07, 0.045, 0.062, 0.002], [0.13, 0.046, 0.043, 0.002], [0.18, 0.04, 0.03, 0.002], [0.205, 0.028, 0.022, 0.004]];

const COVERING_HATS = ['kabuto', 'bucket', 'helm_ember', 'hood', 'hood_white', 'mask', 'gasmask', 'turban', 'visor'];

/**
 * Builds a person's skinned body. detail 1 for close views and portraits, 0 for
 * distant ones. `prost` gives each body part's prosthetic make, if it has one.
 */
export function buildHuman(look: Look, vis: Vis, lost: number, rig: Rig, prost: (string | null)[] = [], detail = 1): THREE.BufferGeometry {
  const kind = (RACE[look.race]?.race ?? 'human') as Kind;
  const b = new SkinBuilder();
  const J = rig.joints;
  const s = rig.s, w = rig.w;
  const robot = kind === 'hollow' || kind === 'construct' || kind === 'sentinel';
  const sentinel = kind === 'sentinel';
  const bug = kind === 'thrum';
  const fem = look.female && !bug && !robot;
  const thin = bug ? 0.74 : kind === 'pale' ? 0.84 : robot ? 0.95 : 1;
  const thick = kind === 'karuk' ? 1.16 : kind === 'construct' ? 1.28 : sentinel ? 1.34 : 1;
  const muscle = kind === 'karuk' ? 1.6 : fem ? 0.5 : bug ? 0.3 : 1;
  const rnd = prng(look.face * 7919 + look.skin * 3 + look.hair + look.hairStyle * 131 + (look.female ? 17 : 0));
  const N = detail ? { torso: 22, limb: 14, lon: 40, lat: 30, small: 10, hand: 10, sub: 2 } : { torso: 11, limb: 7, lon: 14, lat: 10, small: 6, hand: 6, sub: 1 };

  // --- colours and surfaces ---
  const SKIN = rgb(look.skin);
  const skinSurf: Surf = robot ? 'metal' : bug ? 'chitin' : 'skin';
  const DARKMETAL = rgb(0x3a3d42), LEATHER = rgb(0x3a2e22), BONE = rgb(0xd8ccb0);
  const hairC = rgb(look.hair);
  const T = vis.torso, A = vis.armour, L = vis.legs, F = vis.feet;
  const clothT = T ? rgb(T.color) : null, clothT2 = T ? (T.color2 !== undefined ? rgb(T.color2) : shade(rgb(T.color), 0.7)) : null;
  const legsC = L ? rgb(L.color) : robot || bug || kind === 'pale' ? null : rgb(0x5a4a3a);
  const bootC = F && !F.wraps ? rgb(F.color) : null;
  const gloveC = vis.hands ? rgb(vis.hands.color) : null;
  const hat = vis.head && vis.head.style !== 'none' ? vis.head : null;
  const skinP = (k = 1): Paint => P(k === 1 ? SKIN : shade(SKIN, k), skinSurf);
  const coat = T && (T.style === 'coat' || T.style === 'robe');
  const tInflate = T ? (T.style === 'coat' ? 0.011 : T.style === 'robe' ? 0.009 : 0.005) : 0;

  // ================= torso =================
  const TOR = fem ? TORSO_F : TORSO_M;
  const wx = w * thick * thin, wd = thick * (0.55 + 0.45 * w) * (bug ? 0.9 : 1);
  const BELT = 1.035;
  const torsoPush = (y: number, a: number) => {
    let p = 0;
    const front2 = gauss(ad(a, HP - 0.44), 0.3) + gauss(ad(a, HP + 0.44), 0.3);
    if (fem) p += 0.02 * gauss(y - 1.29, 0.04) * front2;
    else p += 0.007 * muscle * gauss(y - 1.31, 0.035) * front2;
    const back2 = gauss(ad(a, 3 * HP - 0.5), 0.35) + gauss(ad(a, 3 * HP + 0.5), 0.35);
    p += (fem ? 0.016 : 0.01) * gauss(y - 0.93, 0.04) * back2; // buttocks
    p += 0.006 * muscle * gauss(y - 1.37, 0.035) * (gauss(ad(a, 3 * HP - 0.6), 0.3) + gauss(ad(a, 3 * HP + 0.6), 0.3)); // shoulder blades
    p -= 0.005 * gauss(ad(a, 3 * HP), 0.12) * smoothstep(1.02, 1.12, y) * (1 - smoothstep(1.4, 1.48, y)); // spine
    if (bug) p += 0.006 * ((y * 16) % 1); // chitin plates, each overlapping the next
    return p;
  };
  const torsoPaint = (y: number, a: number): Paint => {
    if (sentinel) {
      // yellow plate: a hazard-striped chest band, a slatted grille below it, dark seams
      const front = ad(a, HP) < 1.05;
      if (front && y > 1.22 && y < 1.3) return P(Math.floor((a + y * 2) * 9) % 2 ? rgb(0x1e1e1c) : rgb(0xd8b020), 'metal');
      if (front && y > 1.02 && y < 1.18) return P(Math.floor(y * 90) % 2 ? shade(SKIN, 0.35) : shade(SKIN, 0.6), 'metal');
      if (Math.abs(((y * 8) % 1) - 0.5) < 0.03) return P(shade(SKIN, 0.5), 'metal');
      return P(SKIN, 'metal');
    }
    if (robot) {
      const band = Math.abs(((y * 11) % 1) - 0.5) < 0.04;
      const plate = y > 1.16 && y < 1.44 && ad(a, HP) < 0.9;
      return P(band ? shade(SKIN, 0.55) : plate ? shade(SKIN, 1.12) : SKIN, 'metal');
    }
    if (bug) return P(Math.floor(y * 16) % 2 ? shade(SKIN, 0.82) : SKIN, 'chitin');
    if (y >= BELT) {
      if (clothT) {
        const open = (T!.style === 'coat' || T!.style === 'vest' || T!.style === 'robe') && ad(a, HP) < 0.17;
        if (T!.style === 'rags') return P(shade(clothT, 0.75 + 0.35 * ((Math.sin(a * 7 + y * 40) + 1) / 2)), 'cloth');
        return P(open ? clothT2! : clothT, 'cloth');
      }
      if (look.paint && !A && ad(a, HP) < 1.2 && Math.abs(y - 1.3) < 0.018) return P(rgb(look.paint), 'skin');
      return skinP();
    }
    return legsC ? P(legsC, 'cloth') : skinP();
  };
  const torsoInflate = (y: number) => (y >= BELT ? (clothT ? tInflate : 0) : legsC ? 0.006 : 0);
  const torsoW = (y: number): Weights => {
    if (y <= 0.98) return [[B.hips, 1]];
    if (y <= 1.1) { const t = smoothstep(0.98, 1.1, y); return [[B.hips, 1 - t], [B.spine, t]]; }
    if (y <= 1.3) { const t = smoothstep(1.1, 1.3, y); return [[B.spine, 1 - t], [B.chest, t]]; }
    return [[B.chest, 1]];
  };
  const torsoWf = (y: number) => (a: number): Weights => {
    const base = torsoW(y);
    const k = smoothstep(1.36, 1.45, y) * smoothstep(0.55, 0.95, Math.abs(Math.cos(a))) * 0.35;
    if (!k) return base;
    const arm = Math.cos(a) > 0 ? B.uaR : B.uaL;
    if ((arm === B.uaL && lost & LOST_LARM && !prost[3]) || (arm === B.uaR && lost & LOST_RARM && !prost[4])) return base;
    return [...base.map(([bn, v]) => [bn, v * (1 - k)] as [number, number]), [arm, k]];
  };
  const torsoSec = (y: number, extra = 0, paintFn = torsoPaint, pushFn = torsoPush): Sec => {
    const [X, Zf, Zb] = rowAt(TOR, y);
    const infl = torsoInflate(y) + extra;
    return {
      c: V(0, y * s, 0), u: V(-1, 0, 0), v: V(0, 0, 1), rx: X * wx + infl, rf: Zf * wd + infl, rb: Zb * wd + infl, e: robot ? 2.6 : 2.25,
      w: torsoW(y), wf: torsoWf(y), paint: (a) => paintFn(y, a), push: (a) => pushFn(y, a),
    };
  };
  {
    const ys = samples(TOR, N.sub, 0.845, TOR[TOR.length - 1][0], clothT || legsC ? [BELT - 0.004, BELT + 0.004] : []);
    loft(b, ys.map((y) => torsoSec(y)), N.torso, { capStart: V(0, 0.83 * s, 0.005) });
  }
  // belt
  if (T || A || L) {
    const ys = [BELT - 0.018, BELT - 0.008, BELT + 0.008, BELT + 0.018];
    loft(b, ys.map((y, i) => torsoSec(y, i === 0 || i === 3 ? 0.006 : 0.013, (_yy, a) => P(ad(a, HP) < 0.12 ? rgb(0x8a7a5a) : LEATHER, ad(a, HP) < 0.12 ? 'metal' : 'leather'), () => 0)), N.torso, {});
  }

  // ================= neck and head =================
  const neck = J[B.neck], head = J[B.head];
  const hw = kind === 'karuk' ? 1.1 : kind === 'pale' ? 0.95 : 1;
  const Rx = (bug ? 0.072 : robot ? 0.086 : 0.078) * hw * (fem ? 0.95 : 1) * (kind === 'construct' ? 1.25 : sentinel ? 1.5 : 1);
  const Ry = (bug ? 0.098 : robot ? 0.11 : 0.113) * (fem ? 0.96 : 1) * (kind === 'construct' ? 1.2 : sentinel ? 1.3 : 1);
  const Rz = (bug ? 0.118 : robot ? 0.096 : 0.098) * hw * (fem ? 0.96 : 1) * (kind === 'construct' ? 1.2 : sentinel ? 1.5 : 1);
  const hy = head.y + 0.085 * s;
  const hz = bug ? 0.022 : 0;
  {
    const nr = (kind === 'karuk' ? 0.07 : robot ? 0.046 : bug ? 0.04 : fem ? 0.048 : 0.057) * (kind === 'construct' ? 1.3 : sentinel ? 1.6 : 1);
    const y0 = 1.44 * s, y1 = head.y + 0.03 * s;
    const ys = [0, 0.25, 0.5, 0.75, 1].map((k) => lerp(y0, y1, k));
    loft(b, ys.map((y, i) => {
      const k = i / 4;
      const wts: Weights = y < neck.y ? [[B.chest, 1 - smoothstep(1.46 * s, neck.y, y)], [B.neck, smoothstep(1.46 * s, neck.y, y)]] : [[B.neck, 1 - smoothstep(neck.y, head.y, y)], [B.head, smoothstep(neck.y, head.y, y)]];
      return {
        c: V(0, y, lerp(-0.006, hz * 0.6 + 0.004, k)), u: V(-1, 0, 0), v: V(0, 0, 1), rx: nr * (1.12 - 0.12 * k), rf: nr * 1.02, rb: nr * (1.1 - 0.1 * k), e: robot ? 2.4 : 2,
        w: wts, paint: robot ? P(shade(SKIN, 0.55), 'metal') : bug ? P(shade(SKIN, 0.8), 'chitin') : skinP(),
        push: (a: number) => (!fem && !robot && !bug ? 0.005 * gauss(ad(a, HP), 0.3) * gauss(k - 0.55, 0.15) : 0),
      };
    }), N.small + 4, {});
  }
  buildHead(b, { look, vis, kind, hat, s, hy, hz, Rx, Ry, Rz, hw, fem, rnd, detail, N, SKIN, hairC });

  // ================= arms =================
  const armF = thick * thin * (0.82 + 0.18 * w) * (fem ? 0.88 : 1.07) * (kind === 'karuk' ? 1.12 : 1);
  for (const side of [1, -1]) {
    const isL = side > 0;
    const ua = isL ? B.uaL : B.uaR, la = isL ? B.laL : B.laR, hd = isL ? B.handL : B.handR;
    const lostArm = !!(lost & (isL ? LOST_LARM : LOST_RARM)), make = lostArm ? prost[isL ? 3 : 4] : null;
    const S = J[ua], E = J[la], H = J[hd];
    const top = S.clone().add(V(-side * 0.03, 0.03 * s, 0));
    const pos = (t: number) => (t < 0 ? S.clone().lerp(top, -t / 0.2) : t < 1 ? S.clone().lerp(E, t) : E.clone().lerp(H, t - 1));
    const d1 = S.clone().sub(top).normalize(), d2 = E.clone().sub(S).normalize(), d3 = H.clone().sub(E).normalize();
    const dir = (t: number) => (t < -0.04 ? d1 : t < 0.08 ? d1.clone().lerp(d2, smoothstep(-0.04, 0.08, t)) : t < 0.9 ? d2 : t < 1.1 ? d2.clone().lerp(d3, smoothstep(0.9, 1.1, t)) : d3).clone().normalize();
    const wOf = (t: number): Weights => {
      if (t < -0.06) { const k = smoothstep(-0.2, -0.06, t); return [[B.chest, 0.55 - 0.45 * k], [ua, 0.45 + 0.45 * k]]; }
      if (t < 0.12) { const k = smoothstep(-0.06, 0.12, t); return [[B.chest, 0.1 * (1 - k)], [ua, 0.9 + 0.1 * k]]; }
      if (t < 0.86) return [[ua, 1]];
      if (t < 1.16) { const k = smoothstep(0.86, 1.16, t); return [[ua, 1 - k], [la, k]]; }
      if (t < 1.9) return [[la, 1]];
      const k = smoothstep(1.9, 2, t); return [[la, 1 - 0.5 * k], [hd, 0.5 * k]];
    };
    if (make) {
      prostArm(make, side, ua, la, hd, top, pos, dir, wOf);
      if (vis.shackles) ring(b, H.clone().addScaledVector(d3, 0.012), d3, 0.036, 0.03, 0.028, P(rgb(0x3a3a3c), 'metal'), [[hd, 1]], N.small + 2);
      if (A?.shoulders) pauldron(b, A.style, S, top, side, rgb(A.color2 ?? A.color), rgb(A.color), thick, ua, N.small + 4);
      continue;
    }
    if (lostArm) {
      // a stump at the shoulder
      const ts = [-0.2, -0.12, -0.03, 0.08, 0.16];
      loft(b, ts.map((t) => { const { u, v } = frame(dir(t), FRONT); const [rx, rf, rb] = rowAt(ARM, t); const k = t > 0.1 ? 0.85 : 1; return { c: pos(t), u, v, rx: rx * armF * k, rf: rf * armF * k, rb: rb * armF * k, w: wOf(t), paint: T && T.sleeves ? P(clothT!, 'cloth') : skinP(0.95) }; }), N.limb, { capEnd: pos(0.2) });
      continue;
    }
    const sleeveEnd = T ? (T.sleeves >= 2 ? 1.9 : T.sleeves === 1 ? 0.56 : -1) : -1;
    const chainEnd = A && A.style === 'chain' ? 0.95 : -1;
    const brace = A && ['plate', 'ember_plate', 'samurai', 'robo'].includes(A.style);
    const gloves = !!gloveC;
    const cuts: number[] = [];
    if (sleeveEnd > 0) cuts.push(sleeveEnd, sleeveEnd + 0.014);
    if (chainEnd > 0) cuts.push(chainEnd, chainEnd + 0.014);
    if (brace) cuts.push(1.18, 1.194, 1.84, 1.854);
    if (gloves) cuts.push(1.8, 1.814);
    const paintOf = (t: number, a: number): Paint => {
      if (brace && t >= 1.194 && t <= 1.84) return P(rgb(A!.color2 ?? A!.color), 'metal');
      if (gloves && t >= 1.814) return P(gloveC!, 'leather');
      if (chainEnd > 0 && t <= chainEnd) return P(rgb(A!.color2 ?? A!.color), 'metal');
      if (sleeveEnd > 0 && t <= sleeveEnd) return P(clothT!, 'cloth');
      if (sentinel && !isL && t > 1.8 && t < 1.88) return P([2.8, 0.55, 0.25], 'glow'); // the emitter
      if (sentinel && t > 1.12 && t < 1.8) return P(Math.abs(((t * 9) % 1) - 0.5) < 0.08 ? shade(SKIN, 0.45) : shade(SKIN, 0.9), 'metal');
      if (robot) return P(Math.abs(t - 1) < 0.06 || Math.abs(t - 0.02) < 0.05 ? shade(SKIN, 0.55) : SKIN, 'metal');
      if (bug) return P(Math.abs(t - 1) < 0.08 || t > 1.85 ? shade(SKIN, 0.7) : SKIN, 'chitin');
      void a;
      return skinP();
    };
    const pushOf = (t: number, a: number) => {
      let p = 0;
      if (!robot) {
        p += 0.006 * muscle * gauss(t - 0.42, 0.15) * gauss(ad(a, HP), 0.6); // biceps
        p += 0.005 * muscle * gauss(t - 0.3, 0.16) * gauss(ad(a, 3 * HP), 0.7); // triceps
        p += 0.004 * muscle * gauss(t + 0.02, 0.08); // deltoid
        p += 0.003 * muscle * gauss(t - 1.25, 0.14);
      }
      if (brace && t >= 1.194 && t <= 1.84) p += 0.011;
      else if (gloves && t >= 1.814) p += 0.004;
      else if (chainEnd > 0 && t <= chainEnd) p += 0.009;
      else if (sleeveEnd > 0 && t <= sleeveEnd) p += coat ? 0.01 : 0.005;
      return p;
    };
    const ts = samples(ARM, N.sub, -0.2, 2, cuts);
    loft(b, ts.map((t) => {
      const { u, v } = frame(dir(t), FRONT);
      const [rx, rf, rb] = rowAt(ARM, t);
      return { c: pos(t), u, v, rx: rx * armF, rf: rf * armF, rb: rb * armF, e: robot ? 2.5 : 2, w: wOf(t), paint: (a: number) => paintOf(t, a), push: (a: number) => pushOf(t, a) };
    }), N.limb, { capStart: top.clone().add(V(0, 0.01, 0)) });
    if (robot) {
      // joints: ball at the elbow and the shoulder
      jointBall(b, E, 0.034 * armF, DARKMETAL, [[ua, 0.5], [la, 0.5]], N.small);
      jointBall(b, S.clone().add(V(side * 0.01, 0.01, 0)), 0.05 * armF, DARKMETAL, [[ua, 0.7], [B.chest, 0.3]], N.small);
    }
    // the hand
    const handPaint: Paint = gloves ? P(gloveC!, 'leather') : robot ? P(SKIN, 'metal') : bug ? P(shade(SKIN, 0.75), 'chitin') : skinP();
    buildHand(b, H, d3, side, s * (fem ? 0.93 : 1) * (kind === 'karuk' ? 1.1 : 1), handPaint, hd, N.hand, bug, !!detail && !bug && !robot);
    if (vis.shackles) ring(b, H.clone().addScaledVector(d3, 0.012), d3, 0.036, 0.03, 0.028, P(rgb(0x3a3a3c), 'metal'), [[hd, 1]], N.small + 2);
    // shoulder armour
    if (A?.shoulders) pauldron(b, A.style, S, top, side, rgb(A.color2 ?? A.color), rgb(A.color), thick, ua, N.small + 4);
  }

  // ================= legs =================
  const legF = thick * thin * (0.8 + 0.2 * w);
  const bootH = F && !F.wraps ? 0.25 : 0; // metres above the ankle
  for (const side of [1, -1]) {
    const isL = side > 0;
    const ul = isL ? B.ulL : B.ulR, ll = isL ? B.llL : B.llR, ft = isL ? B.footL : B.footR;
    const lostLeg = !!(lost & (isL ? LOST_LLEG : LOST_RLEG)), make = lostLeg ? prost[isL ? 5 : 6] : null;
    const Hj = J[ul], K = J[ll], An = J[ft];
    const top = Hj.clone().add(V(-side * 0.028 * w, 0.075 * s, 0.005));
    const pos = (t: number) => (t < 0 ? Hj.clone().lerp(top, -t / 0.16) : t < 1 ? Hj.clone().lerp(K, t) : K.clone().lerp(An, t - 1));
    const d1 = Hj.clone().sub(top).normalize(), d2 = K.clone().sub(Hj).normalize(), d3 = An.clone().sub(K).normalize();
    const dir = (t: number) => (t < -0.04 ? d1 : t < 0.08 ? d1.clone().lerp(d2, smoothstep(-0.04, 0.08, t)) : t < 0.9 ? d2 : t < 1.1 ? d2.clone().lerp(d3, smoothstep(0.9, 1.1, t)) : d3).clone().normalize();
    const wOf = (t: number): Weights => {
      if (t < -0.04) { const k = smoothstep(-0.16, -0.04, t); return [[B.hips, 0.6 - 0.45 * k], [ul, 0.4 + 0.45 * k]]; }
      if (t < 0.12) { const k = smoothstep(-0.04, 0.12, t); return [[B.hips, 0.15 * (1 - k)], [ul, 0.85 + 0.15 * k]]; }
      if (t < 0.84) return [[ul, 1]];
      if (t < 1.16) { const k = smoothstep(0.84, 1.16, t); return [[ul, 1 - k], [ll, k]]; }
      if (t < 1.86) return [[ll, 1]];
      const k = smoothstep(1.86, 2, t); return [[ll, 1 - 0.4 * k], [ft, 0.4 * k]];
    };
    if (make) { prostLeg(make, side, ul, ll, ft, top, pos, dir, wOf); continue; }
    if (lostLeg) {
      const ts = [-0.16, -0.06, 0.05, 0.14];
      loft(b, ts.map((t) => { const { u, v } = frame(dir(t), FRONT); const [rx, rf, rb] = rowAt(LEG, t); return { c: pos(t), u, v, rx: rx * legF, rf: rf * legF, rb: rb * legF, w: wOf(t), paint: legsC ? P(legsC, 'cloth') : skinP(0.95) }; }), N.limb, { capEnd: pos(0.19) });
      continue;
    }
    const shin = K.distanceTo(An);
    const bootTop = bootH ? 2 - Math.min(0.9, bootH / shin) : 3;
    const plates = L?.armour;
    const cuts: number[] = [];
    if (bootH) cuts.push(bootTop - 0.014, bootTop);
    const paintOf = (t: number, a: number): Paint => {
      if (t >= bootTop) return P(bootC!, F!.armour ? 'metal' : 'leather');
      if (plates && ((t > 0.08 && t < 0.72) || (t > 1.08 && t < Math.min(1.8, bootTop - 0.02))) && ad(a, HP) < 1.25) return P(rgb(L!.color2 ?? L!.color), 'metal');
      if (F?.wraps && t > 1.76) return P(shade(rgb(F.color), (Math.floor(t * 60) % 2) ? 0.85 : 1), 'cloth');
      if (legsC) return P(legsC, 'cloth');
      if (robot) return P(Math.abs(t - 1) < 0.06 ? shade(SKIN, 0.55) : SKIN, 'metal');
      if (bug) return P(Math.abs(t - 1) < 0.08 ? shade(SKIN, 0.7) : SKIN, 'chitin');
      return skinP();
    };
    const pushOf = (t: number, a: number) => {
      let p = 0;
      if (!robot) {
        p += 0.007 * gauss(t - 1.0, 0.06) * gauss(ad(a, HP), 0.5); // kneecap
        p += 0.004 * muscle * gauss(t - 0.3, 0.2) * gauss(ad(a, HP), 0.8); // quadriceps
      }
      if (t >= bootTop) p += 0.011 + (t < bootTop + 0.03 ? 0.003 : 0);
      else if (plates && ((t > 0.08 && t < 0.72) || (t > 1.08 && t < 1.8)) && ad(a, HP) < 1.25) p += 0.012 * Math.cos(ad(a, HP) / 1.3);
      else if (legsC) p += 0.006;
      return p;
    };
    const ts = samples(LEG, N.sub, -0.16, 2, cuts);
    loft(b, ts.map((t) => {
      const { u, v } = frame(dir(t), FRONT);
      const [rx, rf, rb, sh] = rowAt(LEG, t);
      const f = legF * (fem && t < 0.5 ? 1.04 : 1);
      return { c: pos(t).addScaledVector(v, -sh * legF), u, v, rx: rx * f, rf: rf * f, rb: rb * f, e: robot ? 2.5 : 2, w: wOf(t), paint: (a: number) => paintOf(t, a), push: (a: number) => pushOf(t, a) };
    }), N.limb, { capStart: top.clone().add(V(0, 0.01, 0)) });
    if (robot) jointBall(b, K, 0.045 * legF, DARKMETAL, [[ul, 0.5], [ll, 0.5]], N.small);
    // the foot
    const footPaint: Paint = bootC ? P(bootC, F!.armour ? 'metal' : 'leather') : robot ? P(SKIN, 'metal') : bug ? P(shade(SKIN, 0.7), 'chitin') : F?.wraps ? P(rgb(F.color), 'cloth') : skinP();
    buildFoot(b, An, s, footPaint, !!bootC, ft, ll, N.limb, bug ? 0.8 : 1);
  }

  // ================= skirts, coats and armour =================
  if (T && (T.style === 'robe' || T.style === 'dress' || (T.style === 'coat' && T.long) || T.style === 'tunic')) {
    const hem = T.style === 'coat' ? 0.44 : T.style === 'tunic' ? 0.8 : 0.12;
    skirt(b, 1.06, hem, T.style === 'coat' ? 0.3 : 0, (y, a) => P(ad(a, HP) < 0.16 && T.style !== 'tunic' ? clothT2! : y < hem + 0.04 ? shade(clothT!, 0.82) : clothT!, 'cloth'), tInflate + 0.004);
  }
  if (T && (T.style === 'coat' || T.style === 'robe')) collar(b, clothT2 ?? clothT!);
  if (A) torsoArmour(A.style, rgb(A.color), A.color2 !== undefined ? rgb(A.color2) : shade(rgb(A.color), 0.75));
  if (A?.skirt || L?.skirt) {
    const c = A?.skirt ? rgb(A.color2 ?? A.color) : rgb(L!.color2 ?? L!.color);
    const metalSkirt = A?.skirt && A.style !== 'leather' && A.style !== 'padded';
    skirt(b, 1.02, 0.76, 0, (y, a) => P(Math.floor(y * 22) % 2 ? shade(c, 0.8) : c, metalSkirt ? 'metal' : 'leather'), 0.024, (y, a) => 0.004 * ((y * 22) % 1) + (Math.floor(a / (TAU / 10)) % 2 ? 0.002 : 0));
  }

  // ================= back =================
  if (vis.back) backItem(vis.back.style, rgb(vis.back.color));

  const geo = b.build();
  geo.boundingSphere = new THREE.Sphere(V(0, 0.9 * s, 0), 1.7 * s);
  geo.userData.face = detail ? faceOf(look, kind, Rx, Ry) : null;
  return geo;

  // ----------------------------------------------------------------- helpers using the body's measures
  function skirt(bb: SkinBuilder, top: number, hem: number, gap: number, pnt: (y: number, a: number) => Paint, infl: number, extraPush?: (y: number, a: number) => number) {
    const n = Math.max(6, Math.round((top - hem) / (detail ? 0.05 : 0.11)));
    const ys: number[] = [];
    for (let i = 0; i <= n; i++) ys.push(lerp(top, hem, i / n));
    const secs: Sec[] = ys.map((y) => {
      const r = rowAt(TOR, Math.max(0.845, y));
      const below = Math.max(0, 0.9 - y);
      const X = Math.max(r[0] * wx, 0.19 * w * thick + below * 0.16), Zf = Math.max(r[1] * wd, 0.1 + below * 0.2), Zb = Math.max(r[2] * wd, 0.11 + below * 0.22);
      const depth = clamp((top - y) / Math.max(0.01, top - hem), 0, 1);
      return {
        c: V(0, y * s, 0), u: V(-1, 0, 0), v: V(0, 0, 1), rx: X + infl, rf: Zf + infl, rb: Zb + infl, e: 2.2,
        w: [[B.hips, 1]],
        wf: (a: number): Weights => {
          const sideW = depth * 0.8;
          const bl = smoothstep(0, 0.6, Math.abs(Math.cos(a)));
          const same = Math.cos(a) > 0 ? B.ulR : B.ulL, other = same === B.ulR ? B.ulL : B.ulR;
          return [[B.hips, 1 - sideW], [same, sideW * (0.5 + 0.5 * bl)], [other, sideW * (0.5 - 0.5 * bl)]];
        },
        paint: (a: number) => pnt(y, a),
        push: extraPush ? (a: number) => extraPush(y, a) : undefined,
      };
    });
    loft(bb, secs, N.torso, gap ? { arc: [HP + gap, HP - gap + TAU] } : {});
  }

  function collar(bb: SkinBuilder, c: RGB) {
    const secs: Sec[] = [1.44, 1.47, 1.5, 1.535].map((y, i) => {
      const r = rowAt(TOR, Math.min(y, 1.5));
      const k = i / 3;
      return { c: V(0, y * s, -0.004), u: V(-1, 0, 0), v: V(0, 0, 1), rx: Math.max(r[0] * wx * (1 - k * 0.4), 0.075) + 0.014, rf: Math.max(r[1] * wd, 0.06) + 0.012, rb: Math.max(r[2] * wd, 0.065) + 0.016, w: [[B.chest, 1 - k * 0.5], [B.neck, k * 0.5]], paint: P(c, 'cloth') };
    });
    loft(bb, secs, N.torso, { arc: [HP + 0.35, HP - 0.35 + TAU] });
  }

  function torsoArmour(style: string, ac: RGB, ac2: RGB) {
    const metal = !['leather', 'padded', 'bone', 'hive'].includes(style);
    const surf: Surf = metal ? 'metal' : style === 'padded' ? 'cloth' : style === 'hive' ? 'chitin' : 'leather';
    const infl = style === 'chain' ? 0.012 : style === 'leather' || style === 'padded' ? 0.015 : 0.021;
    const scrapC = [ac, rgb(0x7a5a42), rgb(0x6a6a6a), shade(ac, 0.8)];
    const pnt = (y: number, a: number): Paint => {
      switch (style) {
        case 'samurai': {
          const band = Math.floor((y - 1.02) / 0.045);
          const lace = ((y - 1.02) / 0.045) % 1 < 0.12;
          return P(lace ? ac2 : band % 2 ? shade(ac, 0.9) : ac, lace ? 'cloth' : 'metal');
        }
        case 'leather':
          return P([1.12, 1.22, 1.32].some((yy) => Math.abs(y - yy) < 0.012) ? ac2 : ac, 'leather');
        case 'padded':
          return P(((y * 25) % 1) < 0.12 ? shade(ac, 0.8) : ac, 'cloth');
        case 'bone':
          return P(y > 1.17 && y < 1.39 && ad(a, HP) < 1.1 && ((y * 20) % 1) < 0.45 ? BONE : ac, y > 1.17 && y < 1.39 && ad(a, HP) < 1.1 && ((y * 20) % 1) < 0.45 ? 'bone' : 'leather');
        case 'scrap':
          return P(scrapC[(Math.floor(a * 1.6) * 7 + Math.floor(y * 9) * 3) % 4], 'metal');
        case 'hive':
          return P(Math.floor(y * 14) % 2 ? ac2 : ac, 'chitin');
        case 'ember_plate':
          if (gauss(y - 1.3, 0.03) * gauss(ad(a, HP), 0.22) > 0.45) return P(rgb(0xe08a2a), 'metal');
          return P(ac, 'metal');
        case 'robo':
          return P(Math.abs(((y * 12) % 1) - 0.5) < 0.05 ? shade(ac, 0.6) : ac, 'metal');
        case 'chain':
          return P(ac, 'metal');
        default:
          return P(Math.abs(y - 1.2) < 0.008 || Math.abs(y - 1.1) < 0.008 ? ac2 : ac, 'metal');
      }
    };
    const psh = (y: number, a: number) => {
      let p = 0;
      if (style === 'plate' || style === 'ember_plate' || style === 'robo') p += 0.012 * gauss(ad(a, HP), 0.9) * smoothstep(1.1, 1.22, y) * (1 - smoothstep(1.38, 1.46, y)) + 0.003 * gauss(ad(a, HP), 0.05) * smoothstep(1.12, 1.2, y);
      if (style === 'samurai' || style === 'hive') p += 0.005 * (((y - 1.02) / 0.045) % 1);
      if (style === 'padded') p -= 0.003 * gauss(((y * 25) % 1) - 0.06, 0.05);
      if (style === 'bone' && y > 1.17 && y < 1.39 && ad(a, HP) < 1.1 && ((y * 20) % 1) < 0.45) p += 0.007;
      if (style === 'scrap') p += 0.004 * (((Math.floor(a * 1.6) * 5 + Math.floor(y * 9) * 3) % 3) - 1);
      return p + torsoPush(y, a) * 0.6;
    };
    const top = 1.47, bottom = style === 'chain' ? 1.0 : 1.03;
    const ys: number[] = [];
    const n = detail ? 16 : 7;
    for (let i = 0; i <= n; i++) ys.push(lerp(bottom, top, i / n));
    loft(b, ys.map((y) => torsoSec(y, infl, pnt, psh)), N.torso, {});
    if (style === 'chain') skirt(b, 1.02, 0.72, 0, (y) => P(shade(ac, y < 0.75 ? 0.85 : 1), 'metal'), 0.018);
    if (style === 'samurai') skirt(b, 1.03, 0.8, 0.22, (y, a) => P(((y - 0.8) / 0.045) % 1 < 0.14 ? ac2 : Math.floor(a / (TAU / 8)) % 2 ? shade(ac, 0.9) : ac, 'metal'), 0.03, (y) => 0.005 * (((y - 0.8) / 0.045) % 1));
    void surf;
  }

  function backItem(style: string, c: RGB) {
    const chest = J[B.chest];
    const bz = -0.1 * thick - (T ? tInflate : 0) - (A ? 0.02 : 0);
    const W: Weights = [[B.chest, 1]];
    const box = (cx: number, cy: number, cz: number, hx: number, hy2: number, hz2: number, pnt: Paint | ((y: number, a: number) => Paint), surfE = 5) => {
      const ys = [-1, -0.9, -0.5, 0, 0.5, 0.9, 1];
      loft(b, ys.map((k) => ({ c: V(cx, cy + k * hy2, cz), u: V(-1, 0, 0), v: V(0, 0, 1), rx: hx * (Math.abs(k) > 0.95 ? 0.9 : 1), rf: hz2 * (Math.abs(k) > 0.95 ? 0.9 : 1), rb: hz2 * (Math.abs(k) > 0.95 ? 0.9 : 1), e: surfE, w: W, paint: typeof pnt === 'function' ? (a: number) => pnt(k, a) : pnt })), N.small + 4, { capStart: true, capEnd: true });
    };
    const cyl = (cx: number, cy: number, cz: number, r: number, len: number, axis: THREE.Vector3, pnt: Paint) => {
      lathe(b, V(cx, cy, cz).addScaledVector(axis, -len / 2), [[0, 0], [r * 0.85, 0], [r, 0.02], [r, len - 0.02], [r * 0.85, len], [0, len]], N.small + 2, () => pnt, W, { up: axis, front: UP });
    };
    const strap = () => {
      for (const side of [1, -1]) {
        const pts = [V(side * 0.09 * w, chest.y + 0.1, bz - 0.02), V(side * 0.1 * w, chest.y + 0.19 * s, -0.02), V(side * 0.1 * w, chest.y + 0.16 * s, 0.1 * thick), V(side * 0.1 * w, chest.y - 0.02, 0.13 * thick + tInflate)];
        // which way each stretch of strap faces: across the back, over the shoulder, down the chest
        const out = [V(0, 0.3, -1), V(0, 1, 0.2), V(0, 0.3, 1)];
        for (let i = 0; i + 1 < pts.length; i++) {
          const a0 = pts[i], a1 = pts[i + 1];
          const { u, v } = frame(a1.clone().sub(a0), out[i].normalize());
          loft(b, [a0, a1].map((c2) => ({ c: c2, u, v, rx: 0.018, rf: 0.004, rb: 0.004, e: 4, w: W, paint: P(LEATHER, 'leather') })), 5, {});
        }
      }
    };
    switch (style) {
      case 'pack':
        box(0, chest.y - 0.08, bz - 0.08, 0.14 * w, 0.17, 0.075, (k) => P(k > 0.6 ? shade(c, 0.8) : c, 'cloth'));
        strap();
        break;
      case 'large_pack':
        box(0, chest.y - 0.02, bz - 0.13, 0.18 * w, 0.26, 0.12, (k) => P(Math.abs(k) < 0.08 ? shade(c, 0.75) : c, 'cloth'));
        cyl(0, chest.y + 0.3, bz - 0.12, 0.07, 0.42, V(1, 0, 0), P(rgb(0x8a7a5a), 'cloth'));
        strap();
        break;
      case 'basket':
        lathe(b, V(0, chest.y - 0.32, bz - 0.14), [[0, 0], [0.12, 0], [0.15, 0.1], [0.17, 0.44], [0.16, 0.45], [0, 0.44]], N.small + 4, () => P(c, 'straw'), W);
        strap();
        break;
      case 'bedroll':
        cyl(0, chest.y + 0.16, bz - 0.07, 0.08, 0.42, V(1, 0, 0), P(c, 'cloth'));
        box(0, chest.y - 0.1, bz - 0.06, 0.11 * w, 0.13, 0.06, P(shade(c, 0.8), 'cloth'));
        strap();
        break;
      case 'thief':
        box(0, chest.y - 0.12, bz - 0.045, 0.1 * w, 0.12, 0.045, P(c, 'leather'));
        strap();
        break;
      case 'medic':
        box(0, chest.y - 0.08, bz - 0.07, 0.13 * w, 0.15, 0.07, (k, a) => P((ad(a, 3 * HP) < 0.25 && Math.abs(k) < 0.4) || (ad(a, 3 * HP) < 0.7 && Math.abs(k) < 0.12) ? rgb(0xc04030) : c, 'cloth'));
        strap();
        break;
      case 'hive_pack':
        blob(b, V(0, chest.y - 0.05, bz - 0.12), N.small + 4, N.small, (d, out) => { out.set(d.x * 0.2, d.y * 0.24, d.z * 0.14).add(V(0, chest.y - 0.05, bz - 0.12)); return P(Math.floor((d.y + 1) * 4) % 2 ? shade(c, 0.85) : c, 'chitin'); }, W);
        break;
      case 'chest':
        box(0, chest.y - 0.05, bz - 0.15, 0.2 * w, 0.23, 0.14, (k) => P(Math.abs(Math.abs(k) - 0.55) < 0.07 ? DARKMETAL : c, Math.abs(Math.abs(k) - 0.55) < 0.07 ? 'metal' : 'leather'));
        strap();
        break;
    }
  }

  // ----------------------------------------------------------------- prosthetic limbs
  /**
   * A prosthetic arm, by make: a socket cupped over the stump, an upper arm and
   * forearm hinged on a pinned elbow, and a hand, a claw or a fist.
   */
  function prostArm(make: string, side: number, ua: number, la: number, hd: number, top: THREE.Vector3, pos: (t: number) => THREE.Vector3, dir: (t: number) => THREE.Vector3, wOf: (t: number) => Weights) {
    const st = PROST[make] ?? PROST.steel;
    const E = J[la], H = J[hd];
    const outA = side > 0 ? 0 : Math.PI; // the outer side, round the arm
    const n = N.limb, ns = N.small;
    const sec = (t: number, k: number, paint: Paint | ((a: number) => Paint), e = 2.5, push?: (a: number) => number): Sec => {
      const { u, v } = frame(dir(t), FRONT);
      const [rx, rf, rb] = rowAt(ARM, t);
      return { c: pos(t), u, v, rx: rx * armF * k, rf: rf * armF * k, rb: rb * armF * k, e, w: wOf(t), paint, push };
    };
    const at = (t: number, du: number, dv: number) => { const { u, v } = frame(dir(t), FRONT); return pos(t).addScaledVector(u, du).addScaledVector(v, dv); };
    const rOf = (t: number) => rowAt(ARM, t)[0] * armF;
    const scrap = make === 'scrap';
    const UP_T = [0.14, 0.3, 0.5, 0.7, 0.9], FORE_T = [1.08, 1.25, 1.45, 1.65, 1.82, 1.9];
    // the socket
    const sockK = make === 'sentinel' ? 1.12 : make === 'warden' ? 1.1 : 1.04;
    loft(b, [-0.2, -0.12, -0.03, 0.08, 0.15, 0.19].map((t) => sec(t, t > 0.14 ? sockK * 0.9 : sockK, (a) => metalP(t > 0.14 ? st.dark : scrap ? rust(st.main, st.dark, t, a) : st.main))), n, { capStart: top.clone().add(V(0, 0.01, 0)), capEnd: true });
    if (detail) for (let k = 0; k < 5; k++) jointBall(b, at(0.1, Math.cos(outA + (k - 2) * 0.55) * rOf(0.1) * sockK, Math.sin(outA + (k - 2) * 0.55) * rOf(0.1) * sockK), 0.0055, st.pin ?? st.accent, wOf(0.1), 5); // rivets
    switch (make) {
      case 'scrap': {
        // two rusted struts down to the elbow, a loose wire, a pipe of a forearm held with clamps
        for (const dv of [0.021, -0.019]) tube(b, [at(0.12, 0, dv), at(0.95, 0, dv * 0.7)], 0.0105 * armF, metalP(st.main), (i) => wOf(i ? 0.95 : 0.12), 6);
        if (detail) { const ts = [0.05, 0.3, 0.55, 0.8, 1.05, 1.2]; tube(b, ts.map((t, i) => at(t, side * (0.032 + 0.008 * Math.sin(i * 2.1)), 0.01 * Math.cos(i * 1.7))), 0.0045, P(st.accent, 'leather'), (i) => wOf(ts[i]), 5); }
        loft(b, FORE_T.map((t) => sec(t, 0.7, (a) => metalP(rust(st.main, st.dark, t, a)), 2)), n, { capStart: true, capEnd: true });
        for (const t of [1.24, 1.52, 1.8]) ring(b, pos(t), dir(t), rOf(t) * 0.8, rOf(t) * 0.6, 0.016, metalP(st.dark), wOf(t), ns);
        break;
      }
      case 'drone': {
        // slim chrome segments with bare cables down the back
        loft(b, [0.14, 0.4, 0.7, 0.9].map((t) => sec(t, 0.44, metalP(st.main), 2)), n, { capStart: true, capEnd: true });
        loft(b, [1.08, 1.4, 1.7, 1.9].map((t) => sec(t, 0.42, metalP(st.main), 2)), n, { capStart: true, capEnd: true });
        if (detail) for (const du of [0.011, -0.011]) { const ts = [0.1, 0.5, 0.95, 1.3, 1.85]; tube(b, ts.map((t) => at(t, du, -0.026)), 0.0042, metalP(st.dark), (i) => wOf(ts[i]), 5); }
        break;
      }
      case 'warden':
      case 'sentinel': {
        // heavy plated segments: the Warden's gunmetal with a lit seam, the Sentinel's in hazard yellow
        const war = make === 'warden';
        const plate = (t: number, a: number): Paint => {
          if (war && st.glow && ad(a, outA) < 0.1 && ((t > 0.3 && t < 0.75) || (t > 1.2 && t < 1.78))) return P(st.glow, 'glow');
          if (!war && t > 1.52 && t < 1.68) return metalP(Math.floor((a + t * 3) * 3) % 2 ? st.accent : st.main);
          if (Math.abs(t - 0.5) < 0.015 || Math.abs(t - 1.42) < 0.015) return metalP(st.dark); // seams
          return metalP(st.main);
        };
        const armour = (a: number) => 0.007 * Math.max(0, Math.cos(a - outA)); // plating stands proud on the outer side
        const kU = war ? 0.78 : 0.86, kF = war ? 0.86 : 1.02;
        loft(b, UP_T.map((t) => sec(t, kU, (a) => plate(t, a), 3, armour)), n, { capStart: true, capEnd: true });
        loft(b, FORE_T.map((t) => sec(t, kF * (t > 1.75 ? 0.9 : 1), (a) => plate(t, a), 3, armour)), n, { capStart: true, capEnd: true });
        if (!war && st.glow) ring(b, pos(1.93), dir(1.93), rOf(1.93) * 0.95, rOf(1.93) * 0.6, 0.02, P(st.glow, 'glow'), wOf(1.93), ns); // the emitter
        break;
      }
      default: {
        // steel: smooth casings worked by hydraulic rams
        loft(b, UP_T.map((t) => sec(t, 0.64, metalP(Math.abs(t - 0.5) < 0.012 ? st.dark : st.main), 2.3)), n, { capStart: true, capEnd: true });
        loft(b, FORE_T.map((t) => sec(t, 0.62, metalP(Math.abs(t - 1.45) < 0.012 ? st.dark : st.main), 2.3)), n, { capStart: true, capEnd: true });
        ram(b, at(0.22, 0, 0.042 * armF), at(1.16, 0, 0.03 * armF), 0.009, metalP(st.dark), metalP(st.accent), wOf(0.22), wOf(1.16), 6); // the biceps
        if (detail) for (const du of [0.026, -0.026]) ram(b, at(1.12, du * armF, 0), at(1.84, du * armF * 0.8, 0), 0.006, metalP(st.dark), metalP(st.accent), wOf(1.12), wOf(1.84), 5);
      }
    }
    // the elbow: a joint and the pin it turns on
    const jw: Weights = [[ua, 0.5], [la, 0.5]];
    const jr = (make === 'drone' ? 0.024 : make === 'warden' || make === 'sentinel' ? 0.036 : 0.03) * armF;
    const { u: uE } = frame(dir(1), FRONT);
    jointBall(b, E, jr, st.dark, jw, ns);
    tube(b, [E.clone().addScaledVector(uE, -jr * 1.25), E.clone().addScaledVector(uE, jr * 1.25)], jr * 0.45, metalP(st.pin ?? st.accent), () => jw, ns);
    if (make === 'warden' && st.glow) ring(b, E, dir(1), jr * 1.06, jr * 0.8, 0.012, P(st.glow, 'glow'), jw, ns);
    // the hand
    const d3 = H.clone().sub(E).normalize();
    if (scrap || make === 'drone') claw(b, H, d3, side, s, make === 'drone' ? 0.12 : 0.085, metalP(make === 'drone' ? st.main : st.dark), metalP(make === 'drone' ? st.dark : st.main), make === 'drone' && st.glow ? P(st.glow, 'glow') : null, hd, detail ? 6 : 4);
    else buildHand(b, H, d3, side, s * (make === 'sentinel' ? 1.18 : make === 'warden' ? 1.08 : 1), metalP(make === 'warden' ? st.accent : st.main), hd, N.hand, false, !!detail);
  }

  /**
   * A prosthetic leg, by make: a socket over the stump, a pinned knee, and below
   * it a shin and foot, a peg on a spring, or a strider's ram and clawed pad.
   */
  function prostLeg(make: string, side: number, ul: number, ll: number, ft: number, top: THREE.Vector3, pos: (t: number) => THREE.Vector3, dir: (t: number) => THREE.Vector3, wOf: (t: number) => Weights) {
    const st = PROST[make] ?? PROST.steel;
    const K = J[ll], An = J[ft];
    const outA = side > 0 ? 0 : Math.PI;
    const n = N.limb, ns = N.small;
    const sec = (t: number, k: number, paint: Paint | ((a: number) => Paint), e = 2.5, push?: (a: number) => number): Sec => {
      const { u, v } = frame(dir(t), FRONT);
      const [rx, rf, rb, sh] = rowAt(LEG, t);
      return { c: pos(t).addScaledVector(v, -sh * legF), u, v, rx: rx * legF * k, rf: rf * legF * k, rb: rb * legF * k, e, w: wOf(t), paint, push };
    };
    const at = (t: number, du: number, dv: number) => { const { u, v } = frame(dir(t), FRONT); return pos(t).addScaledVector(u, du).addScaledVector(v, dv); };
    const rOf = (t: number) => rowAt(LEG, t)[0] * legF;
    const scrap = make === 'scrap';
    const THIGH_T = [0.26, 0.45, 0.65, 0.85], SHIN_T = [1.08, 1.3, 1.5, 1.7, 1.86];
    const footW: Weights = [[ft, 0.6], [ll, 0.4]];
    const ground = An.clone().add(V(0, -0.075 * s, 0)); // where the sole meets the ground
    // the socket
    const sockK = scrap ? 0.98 : 1.05;
    loft(b, [-0.16, -0.06, 0.05, 0.16, 0.26, 0.3].map((t) => sec(t, t > 0.25 ? sockK * 0.9 : sockK, (a) => metalP(t > 0.25 ? st.dark : scrap ? rust(st.main, st.dark, t, a) : st.main))), n, { capStart: top.clone().add(V(0, 0.01, 0)), capEnd: true });
    if (detail) for (let k = 0; k < 5; k++) jointBall(b, at(0.2, Math.cos(outA + (k - 2) * 0.6) * rOf(0.2) * sockK, Math.sin(outA + (k - 2) * 0.6) * rOf(0.2) * sockK), 0.006, st.pin ?? st.accent, wOf(0.2), 5); // rivets
    switch (make) {
      case 'scrap': {
        // a strut to a bolted knee, then a peg on a spring and a rubber foot
        tube(b, [at(0.28, 0, 0), at(0.97, 0, 0)], 0.018 * legF, metalP(st.main), (i) => wOf(i ? 0.97 : 0.28), 6);
        tube(b, [at(1.04, 0, 0), ground.clone().add(V(0, 0.045 * s, 0))], 0.015 * legF, metalP(st.main), (i) => (i ? footW : wOf(1.04)), 6);
        if (detail) coil(b, at(1.45, 0, 0), at(1.82, 0, 0), 0.025 * legF, 0.005, 5, metalP(st.dark), (k) => wOf(1.45 + k * 0.37), 5);
        lathe(b, ground, [[0, 0], [0.034 * s, 0.002], [0.036 * s, 0.026 * s], [0.02 * s, 0.05 * s], [0, 0.052 * s]], ns, () => P(rgb(0x1c1a18), 'leather'), footW);
        break;
      }
      case 'walker': {
        // a Warbot's leg cut down: a plated thigh, a shin that is all ram and spring, a clawed pad
        loft(b, THIGH_T.map((t) => sec(t, 0.74, metalP(Math.abs(t - 0.55) < 0.025 ? st.accent : st.main), 3.2)), n, { capStart: true, capEnd: true });
        tube(b, [at(1.06, 0, 0), at(1.5, 0, 0)], 0.04 * legF, (i) => metalP(i ? st.main : st.dark), (i) => wOf(i ? 1.5 : 1.06), n);
        ring(b, pos(1.16), dir(1.16), 0.046 * legF, 0.03 * legF, 0.03, metalP(st.accent), wOf(1.16), ns); // a hazard band
        tube(b, [at(1.42, 0, 0), ground.clone().add(V(0, 0.05 * s, 0))], 0.022 * legF, metalP(rgb(0xc8ccd0)), (i) => (i ? footW : wOf(1.42)), n);
        if (detail) coil(b, at(1.55, 0, 0), at(1.9, 0, 0), 0.034 * legF, 0.006, 5, metalP(st.accent), (k) => wOf(1.55 + k * 0.35), 5);
        // the pad: a heel disc and two splayed toes
        lathe(b, ground, [[0, 0], [0.05 * s, 0.003], [0.052 * s, 0.03 * s], [0.03 * s, 0.05 * s], [0, 0.055 * s]], ns, () => metalP(st.dark), footW);
        for (const a of [0.38, -0.38]) tube(b, [ground.clone().add(V(0, 0.02 * s, 0.02 * s)), ground.clone().add(V(Math.sin(a) * 0.12 * s, 0.012 * s, Math.cos(a) * 0.12 * s))], 0.014 * s, metalP(st.main), () => [[ft, 1]], 6);
        break;
      }
      case 'warden': {
        // gunmetal plating: a shin guard with a lit seam, a plate outside the thigh, a heavy foot
        const plate = (t: number, a: number): Paint => {
          if (st.glow && ad(a, HP) < 0.07 && t > 1.2 && t < 1.8) return P(st.glow, 'glow');
          if (Math.abs(t - 0.6) < 0.015 || Math.abs(t - 1.5) < 0.015) return metalP(st.dark);
          return metalP(st.main);
        };
        const guard = (t: number) => (a: number) => (t > 1 ? 0.012 * Math.max(0, Math.cos(a - HP)) : 0.006 * Math.max(0, Math.cos(a - outA)));
        loft(b, THIGH_T.map((t) => sec(t, 0.78, (a) => plate(t, a), 3, guard(t))), n, { capStart: true, capEnd: true });
        loft(b, SHIN_T.map((t) => sec(t, 0.8, (a) => plate(t, a), 3, guard(t))), n, { capStart: true, capEnd: true });
        buildFoot(b, An, s, metalP(st.accent), true, ft, ll, N.limb, 1.05);
        break;
      }
      default: {
        // steel: smooth casings, a kneecap, and a ram behind the calf
        loft(b, THIGH_T.map((t) => sec(t, 0.64, metalP(Math.abs(t - 0.55) < 0.012 ? st.dark : st.main), 2.3)), n, { capStart: true, capEnd: true });
        loft(b, SHIN_T.map((t) => sec(t, 0.62, metalP(Math.abs(t - 1.5) < 0.012 ? st.dark : st.main), 2.3)), n, { capStart: true, capEnd: true });
        ram(b, at(1.1, 0, -0.04 * legF), at(1.86, 0, -0.03 * legF), 0.01, metalP(st.dark), metalP(st.accent), wOf(1.1), wOf(1.86), 6);
        const cap = K.clone().add(V(0, 0, 0.045 * legF));
        blob(b, cap, ns, Math.max(4, ns - 2), (d, o) => { o.set(cap.x + d.x * 0.034 * legF, cap.y + d.y * 0.04 * legF, cap.z + d.z * 0.014); return metalP(st.accent); }, [[ul, 0.3], [ll, 0.7]]);
        buildFoot(b, An, s, metalP(st.main), false, ft, ll, N.limb, 0.9);
      }
    }
    // the knee: a joint and its pin, and on a machine's leg a light
    const jw: Weights = [[ul, 0.5], [ll, 0.5]];
    const kr = (make === 'walker' ? 0.05 : scrap ? 0.03 : 0.042) * legF;
    const { u: uK } = frame(dir(1), FRONT);
    jointBall(b, K, kr, st.dark, jw, ns);
    tube(b, [K.clone().addScaledVector(uK, -kr * 1.25), K.clone().addScaledVector(uK, kr * 1.25)], kr * 0.45, metalP(st.pin ?? st.accent), () => jw, ns);
    if (st.glow && (make === 'walker' || make === 'warden')) {
      const eye = K.clone().add(V(0, 0, kr * 0.9));
      blob(b, eye, 8, 6, (d, o) => { o.copy(eye).addScaledVector(d, kr * 0.38); return P(st.glow!, 'glow'); }, jw);
    }
  }
}

// ======================================================================= parts

/** Prosthetic makes: body metal, dark joints and fittings, an accent, pins and rivets (if not the accent), and a light if it has one. */
const PROST: Record<string, { main: RGB; dark: RGB; accent: RGB; pin?: RGB; glow?: RGB }> = {
  scrap: { main: rgb(0x8a5634), dark: rgb(0x34302c), accent: rgb(0x9a2418), pin: rgb(0x5a534c) },
  steel: { main: rgb(0xaab0b8), dark: rgb(0x44484e), accent: rgb(0xd8dce0) },
  warden: { main: rgb(0x454c54), dark: rgb(0x1e2226), accent: rgb(0x5e6873), glow: [0.35, 1.7, 2.6] },
  sentinel: { main: rgb(0xd8b020), dark: rgb(0x2a2a28), accent: rgb(0x1e1e1c), glow: [2.8, 0.55, 0.25] },
  drone: { main: rgb(0xc8ced4), dark: rgb(0x2c3036), accent: rgb(0x70767e), glow: [0.5, 2.6, 0.9] },
  walker: { main: rgb(0x5c6064), dark: rgb(0x26282a), accent: rgb(0xc89a28), glow: [1.15, 0.04, 0.02] },
};
const metalP = (c: RGB): Paint => P(c, 'metal');

/** Patchy rust over scrap iron, by position along and round a part. */
function rust(c: RGB, dark: RGB, t: number, a: number): RGB {
  const k = Math.sin(t * 41 + a * 3.1) * Math.sin(t * 17 - a * 5.3) + 0.4 * Math.sin(a * 11 + t * 7);
  return k > 0.45 ? shade(c, 1.3) : k < -0.5 ? mix(c, dark, 0.65) : c;
}

/** A tube through a run of points: rods, cables, prongs. */
function tube(b: SkinBuilder, pts: THREE.Vector3[], r: number | ((i: number) => number), p: Paint | ((i: number) => Paint), w: (i: number) => Weights, n: number) {
  loft(b, pts.map((c, i) => {
    const d = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const f = frame(d, FRONT);
    const ri = typeof r === 'number' ? r : r(i);
    return { c, u: f.u, v: f.v, rx: ri, rf: ri, rb: ri, w: w(i), paint: typeof p === 'function' ? p(i) : p };
  }), n, { capStart: true, capEnd: true });
}

/** A hydraulic ram from a to c: a sleeve that moves with a, and a bright shaft reaching to c. */
function ram(b: SkinBuilder, a: THREE.Vector3, c: THREE.Vector3, r: number, sleeve: Paint, shaft: Paint, wa: Weights, wc: Weights, n: number) {
  tube(b, [a, a.clone().lerp(c, 0.55)], r, sleeve, () => wa, n);
  tube(b, [a.clone().lerp(c, 0.45), c], r * 0.55, shaft, (i) => (i ? wc : wa), n);
}

/** A coil spring round the line from a to c. */
function coil(b: SkinBuilder, a: THREE.Vector3, c: THREE.Vector3, R: number, r: number, turns: number, p: Paint, w: (k: number) => Weights, n: number) {
  const d = c.clone().sub(a), L = d.length();
  d.normalize();
  const { u, v } = frame(d, FRONT);
  const steps = Math.round(turns * 8), pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps, an = k * turns * TAU;
    pts.push(a.clone().addScaledVector(d, L * k).addScaledVector(u, Math.cos(an) * R).addScaledVector(v, Math.sin(an) * R));
  }
  tube(b, pts, r, p, (i) => w(i / steps), n);
}

/** A machine's gripping claw: a hub at the wrist, two prongs and a thumb, curling in at the tips. */
function claw(b: SkinBuilder, wrist: THREE.Vector3, dir: THREE.Vector3, side: number, s: number, len: number, p: Paint, tip: Paint, eye: Paint | null, bone: number, n: number) {
  const W: Weights = [[bone, 1]];
  const { u, v } = frame(dir, V(side, 0, 0));
  const hub = wrist.clone().addScaledVector(dir, 0.022 * s);
  blob(b, hub, n + 2, n, (d, o) => { o.copy(hub).addScaledVector(d, 0.027 * s); return p; }, W);
  if (eye) { const e = hub.clone().addScaledVector(v, 0.024 * s); blob(b, e, 6, 4, (d, o) => { o.copy(e).addScaledVector(d, 0.007 * s); return eye; }, W); }
  for (const [ang, lk] of [[0.9, 1], [-0.9, 1], [Math.PI, 0.75]] as [number, number][]) {
    const radial = u.clone().multiplyScalar(Math.cos(ang)).addScaledVector(v, Math.sin(ang));
    const base = hub.clone().addScaledVector(dir, 0.015 * s).addScaledVector(radial, 0.018 * s);
    const L = len * lk * s;
    const pts = [0, 0.35, 0.7, 1].map((k) => base.clone().addScaledVector(dir, L * k).addScaledVector(radial, 0.02 * s * Math.sin(k * Math.PI * 0.85) - 0.012 * s * k * k));
    tube(b, pts, (i) => (0.0078 - i * 0.0016) * s, (i) => (i === 3 ? tip : p), () => W, n);
  }
}

/** A small ball at a joint (machines and prosthetics). */
function jointBall(b: SkinBuilder, c: THREE.Vector3, r: number, col: RGB, w: Weights, n: number) {
  blob(b, c, n, Math.max(4, n - 2), (d, out) => { out.copy(c).addScaledVector(d, r); return P(col, 'metal'); }, w);
}

/** A band round a limb: shackles, cuffs. */
function ring(b: SkinBuilder, c: THREE.Vector3, axis: THREE.Vector3, rOut: number, rIn: number, h: number, p: Paint, w: Weights, n: number) {
  const { u, v } = frame(axis, FRONT);
  const secs: Sec[] = ([[rIn, -h / 2], [rOut, -h / 2], [rOut, h / 2], [rIn, h / 2], [rIn, -h / 2]] as [number, number][]).map(([r, o]) => ({ c: c.clone().addScaledVector(axis, o), u, v, rx: r, rf: r, rb: r, w, paint: p }));
  loft(b, secs, n, {});
}

function buildHand(b: SkinBuilder, wrist: THREE.Vector3, dir: THREE.Vector3, side: number, s: number, p: Paint, bone: number, n: number, claws: boolean, fingers: boolean) {
  const out = V(side, 0, 0);
  const { u, v } = frame(dir, out);
  const W: Weights = [[bone, 1]];
  // a mitten far off; close up, a palm with four fingers curled a little toward it
  const rows = fingers ? PALM : HAND;
  const secs: Sec[] = rows.map(([d, hwid, th]) => {
    const curl = fingers ? 0 : 0.012 * smoothstep(0.09, 0.18, d);
    return { c: wrist.clone().addScaledVector(dir, d * s).addScaledVector(v, -curl), u, v, rx: hwid * s, rf: th * s, rb: th * s * 1.05, e: 2.7, w: W, paint: claws && d > 0.15 ? P(shade(p.c, 0.6), p.s) : p };
  });
  const end = rows[rows.length - 1][0];
  loft(b, secs, n, { capEnd: wrist.clone().addScaledVector(dir, (end + 0.006) * s).addScaledVector(v, fingers ? 0 : -0.012) });
  if (fingers) {
    const lens = [0.074, 0.084, 0.079, 0.063], across = [0.026, 0.0088, -0.0088, -0.025];
    for (let k = 0; k < 4; k++) {
      const knuckle = wrist.clone().addScaledVector(dir, (0.098 - Math.abs(across[k]) * 0.35) * s).addScaledVector(u, -side * across[k] * s);
      const L = lens[k] * s;
      const pts = [0, 0.35, 0.7, 1].map((t) => knuckle.clone().addScaledVector(dir, L * t * (1 - 0.12 * t)).addScaledVector(v, -0.018 * s * t * t).addScaledVector(u, -side * across[k] * s * 0.18 * t));
      loft(b, pts.map((c, i) => {
        const d = pts[Math.min(3, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
        const f = frame(d, out);
        const r = (0.0092 - 0.0022 * (i / 3)) * s * (k === 3 ? 0.88 : 1);
        return { c, u: f.u, v: f.v, rx: r, rf: r * 0.85, rb: r * 0.85, w: W, paint: p };
      }), 6, { capStart: true, capEnd: pts[3].clone().addScaledVector(dir, 0.006 * s).addScaledVector(v, -0.004 * s) });
    }
  }
  // the thumb, on the front of the hand
  const base = wrist.clone().addScaledVector(dir, 0.035 * s).add(V(0, 0, 0.026 * s)).addScaledVector(v, -0.006);
  const tip = base.clone().addScaledVector(dir, 0.06 * s).add(V(0, 0, 0.014 * s)).addScaledVector(v, -0.012);
  const td = tip.clone().sub(base).normalize();
  const tf = frame(td, FRONT);
  loft(b, [0, 0.5, 1].map((k) => ({ c: base.clone().lerp(tip, k), u: tf.u, v: tf.v, rx: (0.011 - k * 0.003) * s, rf: (0.01 - k * 0.002) * s, rb: (0.01 - k * 0.002) * s, w: W, paint: p })), Math.max(5, n - 3), { capStart: true, capEnd: tip.clone().addScaledVector(td, 0.008 * s) });
}

function buildFoot(b: SkinBuilder, ankle: THREE.Vector3, s: number, p: Paint, boot: boolean, foot: number, shin: number, n: number, narrow: number) {
  const g = boot ? 0.009 : 0;
  const secs: Sec[] = FOOT.map(([z, hwid, top, bot], i) => {
    const t = top * s + g, bt = Math.max(0.001, bot * s - (boot ? 0.004 : 0));
    const cy = (t + bt) / 2;
    const sole = boot ? shade(p.c, 0.55) : p.c;
    return {
      c: V(ankle.x, ankle.y - 0.09 * s + cy, ankle.z + z * s), u: V(1, 0, 0), v: V(0, 1, 0), rx: hwid * s * narrow + g, rf: (t - bt) / 2, rb: (t - bt) / 2, e: 2.8,
      w: i < 2 ? [[shin, 0.25], [foot, 0.75]] : [[foot, 1]],
      paint: (a: number) => (a > Math.PI * 1.25 && a < Math.PI * 1.75 ? P(sole, p.s) : p),
    };
  });
  loft(b, secs, n, { capStart: true, capEnd: true });
}

/** Shoulder armour: a domed pauldron, or the flat hanging plates of samurai armour. */
function pauldron(b: SkinBuilder, style: string, sh: THREE.Vector3, top: THREE.Vector3, side: number, c: RGB, c2: RGB, thick: number, ua: number, n: number) {
  const W: Weights = [[ua, 0.75], [B.chest, 0.25]];
  if (style === 'samurai') {
    const secs: Sec[] = [0, 0.3, 0.6, 1].map((k) => ({
      c: sh.clone().add(V(side * (0.075 + 0.012 * k) * thick, 0.03 - 0.2 * k, 0)), u: V(0, 0, 1), v: V(side, 0, 0), rx: 0.075 * thick, rf: 0.008, rb: 0.008, e: 5, w: W,
      paint: P(k > 0.9 ? c2 : Math.floor(k * 6) % 2 ? shade(c, 0.9) : c, 'metal'),
    }));
    loft(b, secs, n, { capStart: true, capEnd: true });
    return;
  }
  const up = top.clone().sub(sh).normalize().add(V(side * 0.35, 0, 0)).normalize();
  const base = sh.clone().add(V(side * 0.006, -0.02, 0));
  const r = 0.085 * thick;
  lathe(b, base, [[0, -0.02], [r * 0.95, -0.06], [r, -0.02], [r * 0.85, 0.04], [r * 0.5, 0.08], [0, 0.092]], n, (i) => P(i >= 4 ? shade(c, 1.08) : c, style === 'leather' || style === 'padded' ? 'leather' : 'metal'), W, { up });
  void c2;
}

// ======================================================================= the head

interface HeadCtx {
  look: Look; vis: Vis; kind: Kind; hat: Vis['head'] | null; s: number; hy: number; hz: number; Rx: number; Ry: number; Rz: number; hw: number; fem: boolean;
  rnd: () => number; detail: number; N: { lon: number; lat: number; small: number }; SKIN: RGB; hairC: RGB;
}

function buildHead(b: SkinBuilder, h: HeadCtx) {
  const { look, vis, kind, hat, s, hy, hz, Rx, Ry, Rz, fem, rnd, N, SKIN, hairC } = h;
  const W: Weights = [[B.head, 1]];
  const C = V(0, hy, hz);
  const robot = kind === 'hollow' || kind === 'construct' || kind === 'sentinel';
  const sentinel = kind === 'sentinel';
  const bug = kind === 'thrum';
  // face shape, different for everyone
  const noseL = (kind === 'karuk' ? 0.034 : 0.026) + rnd() * 0.012;
  const noseW = 0.07 + rnd() * 0.04 + (kind === 'karuk' ? 0.04 : 0);
  const jawN = kind === 'karuk' ? 0.08 : fem ? 0.3 : 0.2 + rnd() * 0.08;
  const jawW = (kind === 'karuk' ? 0.01 : fem ? 0 : 0.004) + rnd() * 0.004;
  const brow = kind === 'karuk' ? 0.017 : kind === 'pale' ? 0.002 : fem ? 0.004 : 0.007 + rnd() * 0.004;
  const chin = (fem ? 0.005 : 0.008) + rnd() * 0.006 + (kind === 'karuk' ? 0.006 : 0);
  const cheek = 0.004 + rnd() * 0.004;
  const lipC = mix(SKIN, [SKIN[0] * 0.75, SKIN[1] * 0.42, SKIN[2] * 0.42], 0.55);
  const covered = hat && COVERING_HATS.includes(hat.style);
  const style = kind === 'pale' || robot || bug || covered ? 0 : look.hairStyle;
  const hood = hat && (hat.style === 'hood' || hat.style === 'hood_white');
  const cap = hat && (hat.style === 'skullcap' || hat.style === 'horncap' || hat.style === 'bandana');
  const maskFace = hat && hat.style === 'mask';
  const hatC = hat ? rgb(hat.color) : SKIN, hatC2 = hat ? (hat.color2 !== undefined ? rgb(hat.color2) : shade(rgb(hat.color), 0.75)) : SKIN;
  const beard = !fem && !robot && !bug && kind !== 'pale' ? look.beard : 0;
  const fs = faceShape(look); // where the eyes and mouth are painted (face.ts)
  for (let i = 0; i < look.scars; i++) { rnd(); rnd(); rnd(); }

  /** The bare head: anatomy before hair and hats. */
  const shape = (d: THREE.Vector3, out: THREE.Vector3) => {
    const ax = Math.abs(d.x), sx = Math.sign(d.x) || 1;
    let x = d.x * Rx, y = d.y * Ry, z = d.z * Rz;
    if (sentinel) {
      // a glass dome over a drum
      if (d.y > 0) return out.set(d.x * Rx, d.y * Ry * 1.1, d.z * Rz).add(C);
      const r = Math.hypot(d.x, d.z) || 1, k = 1 / r;
      return out.set(d.x * k * Rx * 0.98, d.y * Ry * 0.75, d.z * k * Rz * 0.98).add(C);
    }
    if (robot) {
      // a rounded box
      const pe = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.72);
      x = pe(d.x) * Rx; y = pe(d.y) * Ry; z = pe(d.z) * Rz;
      if (d.y < -0.2) x *= 1 - 0.18 * smoothstep(-0.2, -0.9, d.y);
      return out.set(x, y, z).add(C);
    }
    if (bug) {
      // a long insect head with a snout and a ridge along the crown
      z += 0.034 * smoothstep(0.3, 1, d.z) * smoothstep(0.35, -0.5, d.y);
      y += 0.012 * gauss(d.x, 0.16) * smoothstep(0.2, 0.7, d.y);
      if (d.y < 0) x *= 1 - 0.3 * smoothstep(0, 0.9, -d.y);
      return out.set(x, y, z).add(C);
    }
    if (d.z < 0) z *= 1 + 0.08 * Math.max(0, d.y + 0.3); // back of the skull
    if (d.y < 0) {
      const k = -d.y;
      x *= 1 - jawN * smoothstep(0.25, 0.95, k);
      if (d.z < 0.35) { y *= 1 - 0.1 * smoothstep(0.4, 1, k); z *= 1 - 0.12 * smoothstep(0.5, 1, k); }
    }
    x *= 1 - 0.04 * smoothstep(0.2, 0.8, d.y) * ax;
    const face = smoothstep(0.55, 0.85, d.z);
    z += brow * gauss(d.y - fs.ey - 0.15, 0.07) * gauss(d.x, 0.5) * face;
    z -= 0.009 * (gauss(d.x - fs.ex, 0.12) + gauss(d.x + fs.ex, 0.12)) * gauss(d.y - fs.ey, 0.085) * face;
    z += 0.004 * (gauss(d.x - fs.ex, 0.08) + gauss(d.x + fs.ex, 0.08)) * gauss(d.y - fs.ey, 0.045) * face; // the eyeballs under the lids
    const ramp = smoothstep(0.18, -0.2, d.y), cut = 1 - smoothstep(-0.2, -0.3, d.y);
    z += noseL * ramp * cut * gauss(d.x, noseW * (0.6 + 0.8 * smoothstep(0.05, -0.25, d.y))) * smoothstep(0.72, 0.92, d.z);
    z += 0.006 * gauss(ax - 0.13, 0.05) * gauss(d.y + 0.23, 0.04) * smoothstep(0.75, 0.9, d.z);
    x += sx * cheek * gauss(ax - 0.62, 0.12) * gauss(d.y + 0.02, 0.12) * smoothstep(0.2, 0.5, d.z);
    z += cheek * 0.8 * gauss(ax - 0.6, 0.12) * gauss(d.y + 0.02, 0.12) * smoothstep(0.2, 0.5, d.z);
    z -= 0.003 * gauss(ax - 0.5, 0.12) * gauss(d.y + 0.3, 0.1) * face;
    z += 0.0055 * gauss(d.x, 0.2) * gauss(d.y - fs.my - 0.04, 0.035) * face;
    z += 0.006 * gauss(d.x, 0.18) * gauss(d.y - fs.my + 0.045, 0.035) * face;
    z -= 0.0025 * gauss(d.x, 0.22) * gauss(d.y - fs.my, 0.014) * face;
    z += chin * gauss(d.x, 0.22) * gauss(d.y + 0.72, 0.1) * smoothstep(0.4, 0.7, d.z);
    x += sx * jawW * gauss(ax - 0.75, 0.15) * gauss(d.y + 0.5, 0.15);
    return out.set(x, y, z).add(C);
  };

  let hairAmt = 0; // how much hair grows at the vertex being made (painted by the material up close)
  const hairline = (d: THREE.Vector3) => lerp(0.4, -0.5, smoothstep(0.5, 2.6, Math.abs(Math.atan2(d.x, d.z))));
  const layer = (d: THREE.Vector3, out: THREE.Vector3): Paint => {
    shape(d, out);
    const ax = Math.abs(d.x);
    const nrm = V(d.x / Rx, d.y / Ry, d.z / Rz).normalize();
    let col: RGB = SKIN;
    let surf: Surf = robot ? 'metal' : bug ? 'chitin' : 'skin';
    let lift = 0;
    if (sentinel) {
      // under the glass, three lenses in a triangle; the drum below it has a speaker grille
      if (d.y > 0.06) {
        const lens = (gauss(d.x - 0.32, 0.1) + gauss(d.x + 0.32, 0.1)) * gauss(d.y - 0.3, 0.08) + gauss(d.x, 0.1) * gauss(d.y - 0.62, 0.08);
        if (lens > 0.5 && d.z > 0.35) return P([2.6, 0.5, 0.22], 'glow');
        return P(d.y > 0.9 ? rgb(0x4a5a60) : rgb(0x223034), 'eye');
      }
      if (d.y > -0.08) return P(rgb(0x2a2a28), 'metal'); // the rim
      if (d.z > 0.55 && d.y < -0.25 && Math.floor(-d.y * 30) % 2) return P(rgb(0x1a1a18), 'metal');
      return P(SKIN, 'metal');
    }
    if (robot) {
      const visor = d.y > -0.05 && d.y < 0.22 && d.z > 0.45;
      const eye = kind === 'construct' ? gauss(d.x, 0.1) * gauss(d.y - 0.09, 0.05) > 0.5 : (gauss(ax - 0.35, 0.07) * gauss(d.y - 0.09, 0.05)) > 0.5;
      if (eye && d.z > 0.6) return P(kind === 'construct' ? [2.2, 0.35, 0.18] : [0.3, 1.3, 2], 'glow');
      if (visor) return P(rgb(0x1a1c20), 'eye');
      if (d.y < -0.45 && d.z > 0.3) col = shade(SKIN, 0.7);
      if (Math.abs(d.x) < 0.04 && d.y > 0.3) col = shade(SKIN, 0.6);
      return P(col, 'metal');
    }
    if (bug) {
      col = Math.floor((d.y + 1) * 5) % 2 ? shade(SKIN, 0.85) : SKIN;
      if (d.z > 0.8 && d.y < -0.2) col = shade(SKIN, 0.6);
      return P(col, 'chitin');
    }
    // skin detail: warm cheeks and ears (the eyes, brows, lips, paint and scars are painted by the material)
    const face = smoothstep(0.55, 0.85, d.z);
    const lips = gauss(d.x, 0.2) * gauss(d.y - fs.my, 0.045) * face;
    col = mix(col, [SKIN[0] * 1.05, SKIN[1] * 0.82, SKIN[2] * 0.8], 0.22 * gauss(ax - 0.52, 0.15) * gauss(d.y + 0.08, 0.12) * face);
    if (!h.detail) col = mix(col, lipC, clamp(lips * 1.3, 0, 1) * 0.5);
    // beards
    hairAmt = 0;
    if (beard) {
      const jaw = smoothstep(-0.18, -0.36, d.y) * smoothstep(-0.3, 0.1, d.z) + gauss(ax - 0.93, 0.1) * smoothstep(0.15, -0.1, d.y) * smoothstep(-0.2, 0.3, d.z) * 0.9;
      const bm = clamp(jaw, 0, 1) * (1 - clamp(lips * 2.5, 0, 1));
      const must = gauss(d.x, 0.24) * gauss(d.y - fs.my - 0.08, 0.04) * face;
      if (beard === 1) { if (!h.detail) col = mix(col, shade(hairC, 0.85), 0.5 * bm); }
      else if (beard === 4) { hairAmt = clamp(must * 2, 0, 1); lift = Math.max(lift, 0.004 * must); if (!h.detail) { col = mix(col, hairC, hairAmt); surf = must > 0.4 ? 'hair' : surf; } }
      else { hairAmt = clamp(bm * 1.5 + must * 1.5, 0, 1); lift = Math.max(lift, (beard === 3 ? 0.011 : 0.007) * clamp(bm + must, 0, 1)); if (!h.detail) { col = mix(col, hairC, hairAmt); if (bm + must > 0.5) surf = 'hair'; } }
    }
    // hair on the scalp
    if (style) {
      const hl = hairline(d);
      let amt = smoothstep(hl - 0.07, hl + 0.07, d.y);
      if (style === 6) amt *= 1 - smoothstep(0.35, 0.55, ax);
      if (style === 4) amt *= 0.3;
      if (amt > 0.01) {
        const th = style === 7 ? 0.018 + 0.012 * Math.sin(d.x * 23 + d.y * 17) * Math.sin(d.z * 19) : style === 6 ? 0.02 : style === 2 ? 0.012 : style === 1 ? 0.006 : 0.008;
        if (h.detail && style !== 4) hairAmt = Math.max(hairAmt, amt);
        else { col = mix(col, style === 4 ? mix(SKIN, hairC, 0.5) : mix(hairC, shade(hairC, 1.2), smoothstep(0.3, 1, d.y)), amt); if (amt > 0.5) surf = 'hair'; }
        lift = Math.max(lift, th * amt);
        if (style === 6) out.z -= 0.008 * amt * smoothstep(0.3, 1, d.y);
      }
    }
    // hoods, caps and masks
    if (hood) {
      const open = smoothstep(0.25, 0.45, d.z) * (1 - smoothstep(0.62, 0.8, ax)) * (1 - smoothstep(0.42, 0.55, d.y)) * (1 - smoothstep(-0.7, -0.85, d.y));
      const amt = 1 - open;
      if (amt > 0.02) { col = mix(col, hatC, smoothstep(0, 0.4, amt)); lift = Math.max(lift, 0.024 * amt + 0.01 * smoothstep(0.3, 1, d.y) * smoothstep(0, -1, d.z)); if (amt > 0.3) surf = 'cloth'; }
    } else if (cap) {
      const hl = hairline(d) + (hat!.style === 'bandana' ? 0.05 : -0.02);
      const amt = smoothstep(hl - 0.04, hl + 0.04, d.y);
      if (amt > 0.01) { col = mix(col, hat!.style === 'bandana' && Math.abs(d.y - hl - 0.06) < 0.04 ? hatC2 : hatC, amt); lift = Math.max(lift, 0.01 * amt); if (amt > 0.5) surf = hat!.style === 'bandana' ? 'cloth' : 'leather'; }
    } else if (maskFace) {
      const amt = smoothstep(0.2, 0.4, d.z) * (1 - smoothstep(0.55, 0.7, d.y)) * smoothstep(-0.95, -0.8, d.y);
      if (amt > 0.02) {
        const eye = (gauss(ax - 0.36, 0.1) * gauss(d.y - 0.12, 0.06)) > 0.45;
        col = eye ? rgb(0x080808) : mix(col, hatC, amt);
        lift = Math.max(lift, 0.012 * amt);
        if (amt > 0.5) surf = 'leather';
      }
    }
    if (vis.mask) {
      const amt = smoothstep(0.02, -0.06, d.y) * smoothstep(-0.2, 0.15, d.z);
      if (amt > 0.02) { col = mix(col, rgb(vis.mask.color), amt); lift = Math.max(lift, 0.01 * amt); if (amt > 0.5) surf = 'cloth'; }
    }
    if (hat?.style === 'goggles' || hat?.style === 'gasmask') {
      const band = gauss(d.y - 0.2, 0.04);
      if (band > 0.5 && d.z < 0.55) { col = rgb(0x2a241e); lift = Math.max(lift, 0.004); surf = 'leather'; }
    }
    if (lift) out.addScaledVector(nrm, lift);
    return P(col, surf);
  };
  blob(b, C, N.lon, N.lat, layer, W, { warp: h.detail ? [0.6, 0.45] : [0.3, 0.2], each: robot || bug ? undefined : (i, d) => b.setFace(i, d.x * Rx, d.y * Ry, d.z, hairAmt) });

  // Thrum eyes (other people's are painted on)
  if (h.detail && bug) {
    for (const side of [1, -1]) {
      const ec = V(side * 0.052, hy + 0.014, hz + 0.058);
      blob(b, ec, N.small + 2, N.small, (d, out) => { out.set(d.x * 0.03, d.y * 0.036, d.z * 0.034).add(ec); return P(rgb(0x14140e), 'eye'); }, W);
    }
  }
  // ears
  if (!robot && !bug && !(hood || covered)) {
    for (const side of [1, -1]) {
      const ec = V(side * Rx * 0.97, hy - 0.012 * s, hz - 0.008);
      const tip = kind === 'karuk' ? 1.25 : 1;
      blob(b, ec, N.small, Math.max(5, N.small - 3), (d, out) => {
        out.set(d.x * 0.009, d.y * 0.028 * (d.y > 0 ? tip : 1), d.z * 0.019).applyAxisAngle(UP, side * 0.25).add(ec);
        return P(mix(SKIN, [SKIN[0] * 1.02, SKIN[1] * 0.78, SKIN[2] * 0.76], 0.3), 'skin');
      }, W);
    }
  }
  // Karuk horns, curving up and back from the temples
  if (kind === 'karuk' && !(hat && ['kabuto', 'bucket', 'helm_ember', 'visor'].includes(hat.style))) {
    for (const side of [1, -1]) {
      const pts = [V(side * 0.055, hy + 0.07, 0.035)];
      const steps = [V(side * 0.03, 0.055, -0.005), V(side * 0.04, 0.05, -0.035), V(side * 0.035, 0.02, -0.055), V(side * 0.015, -0.012, -0.05)];
      for (const st of steps) pts.push(pts[pts.length - 1].clone().add(st));
      const radii = [0.026, 0.022, 0.016, 0.009, 0.003];
      const secs: Sec[] = pts.map((p, i) => {
        const d = (i < pts.length - 1 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize();
        const { u, v } = frame(d, FRONT);
        return { c: p, u, v, rx: radii[i], rf: radii[i], rb: radii[i], w: W, paint: P(i === 0 ? shade(BONE_C, 0.8) : BONE_C, 'bone') };
      });
      loft(b, secs, N.small, { capStart: true, capEnd: pts[pts.length - 1].clone().add(V(side * 0.004, -0.008, -0.012)) });
    }
  }
  // Thrum mandibles and feelers
  if (bug) {
    for (const side of [1, -1]) {
      const m0 = V(side * 0.022, hy - 0.07, hz + 0.1), m1 = V(side * 0.014, hy - 0.1, hz + 0.125), m2 = V(side * 0.002, hy - 0.112, hz + 0.118);
      const pts = [m0, m1, m2];
      loft(b, pts.map((p, i) => { const d = (i < 2 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize(); const { u, v } = frame(d, UP); const r = [0.009, 0.007, 0.003][i]; return { c: p, u, v, rx: r, rf: r, rb: r, w: W, paint: P(shade(SKIN, 0.55), 'chitin') }; }), 6, { capStart: true, capEnd: true });
      if (!hat) {
        const a0 = V(side * 0.024, hy + 0.075, hz + 0.07), a1 = a0.clone().add(V(side * 0.05, 0.12, -0.02)), a2 = a1.clone().add(V(side * 0.05, 0.08, -0.07));
        const pts2 = [a0, a1, a2];
        loft(b, pts2.map((p, i) => { const d = (i < 2 ? pts2[i + 1].clone().sub(p) : p.clone().sub(pts2[i - 1])).normalize(); const { u, v } = frame(d, FRONT); const r = [0.005, 0.004, 0.002][i]; return { c: p, u, v, rx: r, rf: r, rb: r, w: W, paint: P(shade(SKIN, 0.6), 'chitin') }; }), 5, { capEnd: true });
      }
    }
    if (look.race === 'thrum_soldier') blob(b, V(0, hy + 0.05, hz - 0.02), N.small + 4, N.small, (d, out) => { out.set(d.x * 0.09, Math.max(-0.01, d.y * 0.05), d.z * 0.13).add(V(0, hy + 0.05, hz - 0.02)); return P(shade(SKIN, 0.72), 'chitin'); }, W);
  }
  // hair that hangs: long hair, ponytails, topknots, crests, braids
  if (style === 2) hangingHair(b, V(0, hy - 0.02, -Rz * 0.85), V(0, hy - 0.2, -Rz * 0.95), 0.07 * h.hw, 0.028, hairC, N.small + 2);
  if (style === 3) hangingHair(b, V(0, hy + 0.01, -Rz * 1.02), V(0, hy - 0.17, -Rz * 1.25), 0.024, 0.02, hairC, N.small);
  if (style === 5) blob(b, V(0, hy + Ry * 0.95, -Rz * 0.25), N.small, N.small - 2, (d, out) => { out.copy(d).multiplyScalar(0.034).add(V(0, hy + Ry * 0.95, -Rz * 0.25)); return P(hairC, 'hair'); }, W);
  if (style === 4) {
    const secs: Sec[] = [-0.9, -0.5, 0, 0.5, 0.9].map((k) => {
      const ang = k * 1.25;
      const p = V(0, hy + Math.cos(ang) * (Ry + 0.004), hz + Math.sin(ang) * (Rz + 0.004));
      const nrm = V(0, Math.cos(ang), Math.sin(ang));
      return { c: p.clone().addScaledVector(nrm, 0.022), u: V(1, 0, 0), v: nrm, rx: 0.012, rf: 0.03, rb: 0.024, w: W, paint: P(hairC, 'hair') };
    });
    loft(b, secs, 8, { capStart: true, capEnd: true });
  }
  if (style === 8) for (const side of [1, -1]) hangingHair(b, V(side * Rx * 0.85, hy - 0.02, -0.03), V(side * Rx * 0.95, hy - 0.26, -0.02), 0.018, 0.012, hairC, N.small);
  if (beard === 3) hangingHair(b, V(0, hy - Ry * 0.8, hz + Rz * 0.62), V(0, hy - Ry * 1.55, hz + Rz * 0.72), 0.04, 0.012, hairC, N.small, [0, 0, 1]);

  // hats and helmets
  if (hat && !sentinel) buildHat(b, hat.style, rgb(hat.color), hat.color2 !== undefined ? rgb(hat.color2) : shade(rgb(hat.color), 0.75), C, Rx, Ry, Rz, h.hw * (kind === 'construct' ? 1.2 : 1), N.small + 6);
}

const BONE_C = rgb(0xd8ccb0);

function hangingHair(b: SkinBuilder, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number, c: RGB, n: number, front: [number, number, number] = [0, 0, -1]) {
  const W: Weights = [[B.head, 1]];
  const d = to.clone().sub(from).normalize();
  const { u, v } = frame(d, V(...front));
  const secs: Sec[] = [0, 0.3, 0.65, 1].map((k) => ({ c: from.clone().lerp(to, k), u, v, rx: lerp(r0, r1, k), rf: lerp(r0, r1, k) * 0.6, rb: lerp(r0, r1, k) * 0.6, e: 2.2, w: W, paint: P(shade(c, 1 - 0.15 * k), 'hair') }));
  loft(b, secs, n, { capStart: true, capEnd: to.clone().addScaledVector(d, r1) });
}

function buildHat(b: SkinBuilder, style: string, c: RGB, c2: RGB, C: THREE.Vector3, Rx: number, Ry: number, Rz: number, k: number, n: number) {
  const W: Weights = [[B.head, 1]];
  const at = (dy: number) => V(C.x, C.y + dy, C.z);
  const sxz = { sx: (Rx / 0.078) * 0.92, sz: (Rz / 0.098) * 1.05 };
  const closed = { sx: sxz.sx * 1.08, sz: sxz.sz * 1.28 }; // room for the nose
  switch (style) {
    case 'straw': {
      const prof: [number, number][] = [[0, 0.05], [0.09, 0.062], [0.2, 0.05], [0.305, 0.036], [0.314, 0.042], [0.3, 0.049], [0.19, 0.09], [0.1, 0.138], [0.035, 0.172], [0, 0.18]];
      lathe(b, at(0), prof.map(([r, y]) => [r * k, y]), n + 8, (i, a) => P(i >= 3 && i <= 5 ? shade(c, 0.78) : shade(c, 0.92 + 0.12 * Math.abs(Math.sin(a * 18))), 'straw'), W);
      break;
    }
    case 'kasa': {
      const prof: [number, number][] = [[0, 0.06], [0.1, 0.07], [0.22, 0.06], [0.262, 0.05], [0.268, 0.062], [0.2, 0.095], [0.1, 0.122], [0.03, 0.134], [0, 0.136]];
      lathe(b, at(0), prof.map(([r, y]) => [r * k, y]), n + 6, (i) => P(i >= 3 && i <= 4 ? c2 : c, 'leather'), W);
      break;
    }
    case 'kabuto': case 'visor': {
      // a kabuto sits above the brows, with a peak over the eyes; a visor helm comes down over them
      const lo = style === 'kabuto' ? 0.036 : -0.01;
      const dome: [number, number][] = [[0, lo], [0.098, lo], [0.102, Math.max(lo + 0.02, 0.035)], [0.094, 0.085], [0.072, 0.122], [0.04, 0.142], [0, 0.15]];
      lathe(b, at(0), dome, n + 4, (i) => P(i === 1 ? c2 : c, 'metal'), W, sxz);
      if (style === 'kabuto') {
        // the peak, the neck guard (open at the front) and a crest
        lathe(b, at(0), [[0.098, lo + 0.012], [0.126, lo + 0.002], [0.128, lo - 0.002], [0.098, lo + 0.004]], n + 4, () => P(shade(c, 0.85), 'metal'), W, { ...sxz, arc: [HP - 1.05, HP + 1.05] });
        lathe(b, at(0), [[0.1, lo], [0.118, 0.0], [0.145, -0.06], [0.16, -0.1], [0.165, -0.11]], n + 4, (i) => P(i % 2 ? shade(c2, 0.9) : c2, 'metal'), W, { ...sxz, arc: [HP + 1.1, HP - 1.1 + TAU] });
        const crest = [V(0, 0.1, 0.104), V(0.05, 0.155, 0.12), V(0.09, 0.2, 0.1)];
        for (const side of [1, -1]) loft(b, crest.map((p, i) => ({ c: at(0).add(V(p.x * side, p.y, p.z)), u: V(0, 1, 0), v: V(0, 0, 1), rx: 0.012 - i * 0.003, rf: 0.004, rb: 0.004, e: 4, w: W, paint: P(rgb(0xc8a040), 'metal') })), 6, { capStart: true, capEnd: true });
      } else {
        lathe(b, at(0.005), [[0.104, -0.035], [0.106, -0.035], [0.106, 0.03], [0.104, 0.03]], n + 4, () => P(rgb(0x14161a), 'eye'), W, { ...sxz, arc: [HP - 1.0, HP + 1.0] });
      }
      break;
    }
    case 'bucket': {
      const prof: [number, number][] = [[0, -0.12], [0.1, -0.12], [0.104, -0.03], [0.104, 0.08], [0.097, 0.128], [0.05, 0.148], [0, 0.15]];
      lathe(b, at(0), prof, n + 4, (i, a) => P(i === 2 && ad(a, HP) < 0.8 ? rgb(0x101010) : c, i === 2 && ad(a, HP) < 0.8 ? 'eye' : 'metal'), W, closed);
      break;
    }
    case 'helm_ember': {
      const prof: [number, number][] = [[0, -0.12], [0.098, -0.12], [0.104, -0.02], [0.102, 0.1], [0.09, 0.15], [0.062, 0.21], [0.022, 0.25], [0, 0.26]];
      lathe(b, at(0), prof, n + 4, (i, a) => P(i === 2 && ad(a, HP) < 0.7 ? rgb(0x101010) : c, i === 2 && ad(a, HP) < 0.7 ? 'eye' : 'metal'), W, closed);
      const fin = [V(0, 0.2, 0.06), V(0, 0.29, 0), V(0, 0.24, -0.08)];
      loft(b, fin.map((p, i) => ({ c: at(0).add(p), u: V(0, 0, 1), v: V(1, 0, 0), rx: 0.04 - i * 0.008, rf: 0.006, rb: 0.006, e: 4, w: W, paint: P(rgb(0xe08a2a), 'metal') })), 6, { capStart: true, capEnd: true });
      break;
    }
    case 'turban': {
      const prof: [number, number][] = [[0, 0.02], [0.097, 0.02], [0.11, 0.045], [0.116, 0.08], [0.106, 0.115], [0.08, 0.14], [0.036, 0.152], [0, 0.154]];
      lathe(b, at(0), prof.map(([r, y]) => [r * k, y]), n + 4, (i, a) => P((i + Math.floor(a * 2.5)) % 2 ? c2 : c, 'cloth'), W, sxz);
      break;
    }
    case 'crown': {
      lathe(b, at(0), [[0.084, 0.06], [0.088, 0.06], [0.088, 0.09], [0.084, 0.09], [0.084, 0.06]], n + 4, () => P(rgb(0xd8b040), 'metal'), W, sxz);
      break;
    }
    case 'horncap': {
      const p0 = at(0.105).add(V(0, 0, 0.03)), p1 = p0.clone().add(V(0, 0.05, 0.03)), p2 = p1.clone().add(V(0, 0.035, 0.035));
      const pts = [p0, p1, p2];
      loft(b, pts.map((p, i) => { const d = (i < 2 ? pts[i + 1].clone().sub(p) : p.clone().sub(pts[i - 1])).normalize(); const { u, v } = frame(d, FRONT); const r = [0.022, 0.014, 0.004][i]; return { c: p, u, v, rx: r, rf: r, rb: r, w: W, paint: P(BONE_C, 'bone') }; }), 8, { capEnd: true });
      break;
    }
    case 'goggles': case 'gasmask': {
      for (const side of [1, -1]) {
        const base = at(0.014).add(V(side * 0.033, 0, Rz * 0.9));
        lathe(b, base, [[0, 0], [0.019, 0], [0.02, 0.012], [0.016, 0.018], [0, 0.017]], 10, (i) => P(i >= 3 ? rgb(0x4a7a7a) : rgb(0x8a6a3a), i >= 3 ? 'eye' : 'metal'), W, { up: FRONT, front: UP });
      }
      if (style === 'gasmask') lathe(b, at(-0.06).add(V(0, 0, Rz * 0.85)), [[0, 0], [0.036, 0], [0.04, 0.025], [0.032, 0.055], [0.022, 0.07], [0, 0.07]], 12, (i) => P(i >= 3 ? rgb(0x2a2a2a) : c, i >= 3 ? 'metal' : 'leather'), W, { up: V(0, -0.35, 1).normalize(), front: UP });
      break;
    }
    default:
      break;
  }
  void Ry;
}
