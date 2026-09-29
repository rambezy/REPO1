// Procedural beasts: a shared rig for four-, six- and eight-legged animals
// with necks, jaws, tails, shells, pincers and wings, plus their gaits. The
// bodies are smooth skinned meshes (skin.ts): a lofted trunk from rump to
// chest, legs that grow out of it, a sculpted head with its own jaw, and
// shells, plates, horns, wings and crystals on top.
import * as THREE from 'three';
import { SkinBuilder, Sec, Paint, RGB, Weights, Surf, loft, lathe, blob, frame, rgb, mix, shade, gauss, smoothstep, lerp } from './skin';
import type { AnimalDef, Shape } from '../content/animals';
import type { Look } from '../sim/look';
import type { Stance } from './anim';

const A = { root: 0, body: 1, chest: 2, neck: 3, head: 4, jaw: 5, tail: 6 } as const;
const LEG0 = 7; // pair k, side s (0 left, 1 right): upper = LEG0 + (k*2+s)*2, lower = +1
const NB = LEG0 + 16;

interface Spec {
  len: number; hipH: number; chestH: number; bodyW: number; bodyR: number;
  pairs: number; legLen: number; legR: number; spread: number; kneeUp?: boolean;
  neckLen: number; neckAng: number; neckR: number; headLen: number; headR: number;
  tailLen: number; tailR: number;
  shell?: boolean; pincers?: boolean; wings?: boolean; beak?: boolean; horns?: 'curved' | 'back' | null; mandibles?: boolean;
  eyes: number; plates?: boolean; crystals?: boolean; robot?: boolean; hover?: number; ears?: boolean; spikes?: boolean;
  /** Maker machines with bodies of their own (see droneGeometry, walkerGeometry) */
  drone?: boolean; walker?: boolean;
}

const SPECS: Record<Shape, Spec> = {
  hound: { len: 1.0, hipH: 0.6, chestH: 0.66, bodyW: 0.3, bodyR: 0.19, pairs: 2, legLen: 0.62, legR: 0.05, spread: 0.02, neckLen: 0.32, neckAng: 0.55, neckR: 0.1, headLen: 0.36, headR: 0.11, tailLen: 0.5, tailR: 0.04, plates: true, eyes: 2, ears: true },
  shellback: { len: 1.8, hipH: 0.95, chestH: 0.9, bodyW: 0.9, bodyR: 0.5, pairs: 2, legLen: 0.9, legR: 0.14, spread: 0.1, neckLen: 0.55, neckAng: 0.25, neckR: 0.16, headLen: 0.45, headR: 0.17, tailLen: 0.4, tailR: 0.1, shell: true, eyes: 2 },
  hookbeak: { len: 1.7, hipH: 1.55, chestH: 1.75, bodyW: 0.6, bodyR: 0.45, pairs: 2, legLen: 1.6, legR: 0.1, spread: 0.08, neckLen: 1.7, neckAng: 1.05, neckR: 0.14, headLen: 0.75, headR: 0.18, tailLen: 0.9, tailR: 0.09, beak: true, eyes: 2 },
  skitter: { len: 0.9, hipH: 0.42, chestH: 0.45, bodyW: 0.36, bodyR: 0.2, pairs: 3, legLen: 0.75, legR: 0.035, spread: 0.55, kneeUp: true, neckLen: 0.1, neckAng: 0.1, neckR: 0.1, headLen: 0.3, headR: 0.13, tailLen: 0.65, tailR: 0.2, mandibles: true, eyes: 4 },
  crab: { len: 0.7, hipH: 0.45, chestH: 0.45, bodyW: 0.95, bodyR: 0.26, pairs: 3, legLen: 0.8, legR: 0.05, spread: 0.55, kneeUp: true, neckLen: 0.05, neckAng: 0, neckR: 0.08, headLen: 0.12, headR: 0.1, tailLen: 0, tailR: 0, pincers: true, eyes: 2 },
  bat: { len: 0.7, hipH: 0.5, chestH: 0.62, bodyW: 0.34, bodyR: 0.18, pairs: 2, legLen: 0.6, legR: 0.04, spread: 0.3, neckLen: 0.18, neckAng: 0.5, neckR: 0.09, headLen: 0.3, headR: 0.12, tailLen: 0.2, tailR: 0.03, wings: true, ears: true, eyes: 2 },
  bovine: { len: 1.6, hipH: 1.12, chestH: 1.2, bodyW: 0.62, bodyR: 0.42, pairs: 2, legLen: 1.05, legR: 0.09, spread: 0.02, neckLen: 0.5, neckAng: 0.45, neckR: 0.19, headLen: 0.55, headR: 0.17, tailLen: 0.75, tailR: 0.04, horns: 'curved', eyes: 2, ears: true },
  goat: { len: 0.9, hipH: 0.62, chestH: 0.66, bodyW: 0.3, bodyR: 0.2, pairs: 2, legLen: 0.6, legR: 0.045, spread: 0.02, neckLen: 0.36, neckAng: 0.8, neckR: 0.09, headLen: 0.32, headR: 0.1, tailLen: 0.12, tailR: 0.04, horns: 'back', eyes: 2, ears: true },
  spider: { len: 0.9, hipH: 0.6, chestH: 0.6, bodyW: 0.7, bodyR: 0.28, pairs: 4, legLen: 1.25, legR: 0.045, spread: 0.85, kneeUp: true, neckLen: 0.05, neckAng: 0, neckR: 0.1, headLen: 0.3, headR: 0.16, tailLen: 0.4, tailR: 0.24, robot: true, eyes: 3 },
  turtle: { len: 1.6, hipH: 0.62, chestH: 0.62, bodyW: 1.1, bodyR: 0.42, pairs: 2, legLen: 0.55, legR: 0.14, spread: 0.3, neckLen: 0.55, neckAng: 0.15, neckR: 0.15, headLen: 0.5, headR: 0.17, tailLen: 0.5, tailR: 0.1, shell: true, spikes: true, eyes: 2 },
  fly: { len: 0.6, hipH: 0.95, chestH: 1.0, bodyW: 0.28, bodyR: 0.16, pairs: 3, legLen: 0.4, legR: 0.02, spread: 0.2, neckLen: 0.05, neckAng: 0, neckR: 0.08, headLen: 0.2, headR: 0.12, tailLen: 0.45, tailR: 0.14, wings: true, eyes: 2, hover: 0.95 },
  stalker: { len: 1.4, hipH: 0.9, chestH: 1.0, bodyW: 0.4, bodyR: 0.26, pairs: 2, legLen: 0.95, legR: 0.07, spread: 0.1, neckLen: 0.6, neckAng: 0.5, neckR: 0.11, headLen: 0.5, headR: 0.13, tailLen: 1.1, tailR: 0.07, crystals: true, eyes: 2 },
  // a hovering sphere with an eye on a stalk and three arms (two a pair, the third where a tail would be)
  drone: { len: 0.5, hipH: 1.25, chestH: 1.25, bodyW: 0.62, bodyR: 0.3, pairs: 1, legLen: 0.6, legR: 0.028, spread: 0.1, neckLen: 0.3, neckAng: 1.3, neckR: 0.024, headLen: 0.14, headR: 0.08, tailLen: 0.5, tailR: 0.028, robot: true, eyes: 1, hover: 1.0, drone: true },
  // a war machine: a boxy hull on four piston legs, cannons on its shoulders
  walker: { len: 1.5, hipH: 1.15, chestH: 1.2, bodyW: 1.05, bodyR: 0.46, pairs: 2, legLen: 1.05, legR: 0.13, spread: 0.24, neckLen: 0.12, neckAng: 0.2, neckR: 0.16, headLen: 0.44, headR: 0.2, tailLen: 0, tailR: 0, robot: true, eyes: 1, walker: true },
};

export interface AnimalRig {
  bones: THREE.Bone[];
  geo: THREE.BufferGeometry;
  spec: Spec;
  shape: Shape;
  rest: THREE.Vector3[];
}

const BASE_PARENTS = (() => {
  const p = new Array(NB).fill(0);
  p[A.root] = -1; p[A.body] = 0; p[A.chest] = 1; p[A.neck] = 2; p[A.head] = 3; p[A.jaw] = 4; p[A.tail] = 1;
  return p;
})();

export function buildAnimal(def: AnimalDef, look: Look): AnimalRig {
  const sp = SPECS[def.shape];
  const s = def.size * look.bulk;
  const PARENTS = BASE_PARENTS.slice();
  const J: THREE.Vector3[] = [];
  const hz = -sp.len * 0.35 * s, cz = sp.len * 0.35 * s;
  const hoverY = (sp.hover ?? 0) * s;
  J[A.root] = new THREE.Vector3(0, 0, 0);
  J[A.body] = new THREE.Vector3(0, sp.hipH * s + hoverY * 0, hz);
  J[A.chest] = new THREE.Vector3(0, sp.chestH * s, cz);
  const nx = Math.cos(sp.neckAng) * sp.neckLen * s, ny = Math.sin(sp.neckAng) * sp.neckLen * s;
  J[A.neck] = new THREE.Vector3(0, sp.chestH * s + sp.bodyR * s * 0.3, cz + sp.bodyR * s * 0.6);
  J[A.head] = J[A.neck].clone().add(new THREE.Vector3(0, ny, nx));
  J[A.jaw] = J[A.head].clone().add(new THREE.Vector3(0, -sp.headR * s * 0.4, sp.headR * s * 0.3));
  J[A.tail] = new THREE.Vector3(0, sp.hipH * s + sp.bodyR * s * 0.2, hz - sp.bodyR * s * 0.8);
  const legParent: number[] = [];
  for (let k = 0; k < 4; k++) for (let side = 0; side < 2; side++) {
    const u = LEG0 + (k * 2 + side) * 2;
    if (k >= sp.pairs) { J[u] = J[A.body].clone(); J[u + 1] = J[A.body].clone(); legParent[u] = A.body; continue; }
    const t = sp.pairs === 1 ? 0.5 : k / (sp.pairs - 1);
    const z = cz + (hz - cz) * t;
    const y = (sp.chestH + (sp.hipH - sp.chestH) * t) * s - sp.bodyR * s * 0.3;
    const x = (side === 0 ? 1 : -1) * sp.bodyW * s * 0.45;
    J[u] = new THREE.Vector3(x, y, z);
    const kx = x + (side === 0 ? 1 : -1) * sp.spread * s * 0.6;
    const ky = sp.kneeUp ? y + sp.legLen * s * 0.25 : y - sp.legLen * s * 0.5;
    J[u + 1] = new THREE.Vector3(kx, ky, z + (sp.kneeUp ? 0 : 0.02 * s));
    legParent[u] = t < 0.5 ? A.chest : A.body;
    PARENTS[u] = legParent[u];
    PARENTS[u + 1] = u;
  }
  for (let k = 0; k < 16; k += 2) { if (PARENTS[LEG0 + k] === 0) PARENTS[LEG0 + k] = A.body; PARENTS[LEG0 + k + 1] = LEG0 + k; }
  if (sp.drone) {
    // arms from the sphere's flanks, the eye stalk from its crown, the torch arm from underneath at the back
    const R = sp.bodyR * s * 1.25, bc = new THREE.Vector3(0, sp.hipH * s, 0);
    for (let side = 0; side < 2; side++) {
      const u = LEG0 + side * 2, sx = side === 0 ? 1 : -1;
      J[u] = bc.clone().add(new THREE.Vector3(sx * R * 0.82, -R * 0.2, R * 0.28));
      J[u + 1] = J[u].clone().add(new THREE.Vector3(sx * 0.1 * s, -0.26 * s, 0.14 * s));
      PARENTS[u] = A.chest;
    }
    J[A.neck] = bc.clone().add(new THREE.Vector3(0, R * 0.92, -R * 0.05));
    J[A.head] = J[A.neck].clone().add(new THREE.Vector3(0, 0.26 * s, 0.06 * s));
    J[A.jaw] = J[A.head].clone();
    J[A.tail] = bc.clone().add(new THREE.Vector3(0, -R * 0.55, -R * 0.55));
  }

  const bones: THREE.Bone[] = [];
  for (let i = 0; i < NB; i++) {
    const b = new THREE.Bone();
    const p = PARENTS[i];
    if (p >= 0) { b.position.copy(J[i]).sub(J[p]); bones[p].add(b); } else b.position.copy(J[i]);
    bones.push(b);
  }

  const geo = beastGeometry(def, sp, J, s, PARENTS);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, sp.hipH * s, 0), Math.max(1.5, sp.len * s * 1.6 + sp.neckLen * s));
  return { bones, geo, spec: sp, shape: def.shape, rest: J };
}

// ------------------------------------------------------------------ the smooth bodies

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0), FWD = V(0, 0, 1);
const P = (c: RGB, s: Surf): Paint => ({ c, s });

/** What the hide is like, for the material. */
const HIDE: Record<Shape, Surf> = {
  hound: 'leather', shellback: 'leather', hookbeak: 'hair', skitter: 'chitin', crab: 'chitin', bat: 'leather',
  bovine: 'hair', goat: 'hair', spider: 'metal', turtle: 'leather', fly: 'chitin', stalker: 'leather', drone: 'metal', walker: 'metal',
};
const INSECT = (sh: Shape) => sh === 'skitter' || sh === 'crab' || sh === 'spider' || sh === 'fly';

/** Rows along the trunk from rump (0) to chest (1): width, back and belly, as fractions of the full size. */
const TRUNK: Record<'beast' | 'lean' | 'barrel' | 'bug', number[][]> = {
  beast: [[0, 0.3, 0.4, 0.35], [0.08, 0.72, 0.78, 0.74], [0.22, 0.9, 0.94, 0.9], [0.42, 0.84, 0.88, 0.82], [0.66, 1, 1, 1.02], [0.86, 0.95, 0.98, 0.94], [1, 0.5, 0.6, 0.55]],
  lean: [[0, 0.3, 0.4, 0.35], [0.08, 0.7, 0.78, 0.7], [0.22, 0.86, 0.9, 0.8], [0.44, 0.74, 0.84, 0.56], [0.68, 0.96, 1, 1.05], [0.87, 0.92, 0.98, 0.92], [1, 0.48, 0.6, 0.55]],
  barrel: [[0, 0.35, 0.45, 0.4], [0.08, 0.8, 0.84, 0.8], [0.24, 0.96, 0.98, 0.98], [0.46, 1, 1, 1.04], [0.68, 1.02, 1, 1.04], [0.87, 0.95, 0.98, 0.92], [1, 0.5, 0.62, 0.55]],
  bug: [[0, 0.4, 0.42, 0.4], [0.18, 0.85, 0.85, 0.8], [0.5, 1, 1, 0.95], [0.82, 0.9, 0.9, 0.85], [1, 0.45, 0.45, 0.42]],
};

function rowLerp(rows: number[][], t: number): number[] {
  let i = 0;
  while (i < rows.length - 2 && rows[i + 1][0] < t) i++;
  const a = rows[i], b = rows[i + 1], k = smoothstep(a[0], b[0], t);
  return a.slice(1).map((v, j) => lerp(v, b[j + 1], k));
}

/** A tube through points: sections square to the path, `v` kept toward `up`. */
function tube(b: SkinBuilder, pts: THREE.Vector3[], rad: (i: number) => [number, number, number], w: (i: number) => Weights, paint: (i: number, a: number) => Paint, n: number, o: { up?: THREE.Vector3; e?: number; capStart?: boolean | THREE.Vector3; capEnd?: boolean | THREE.Vector3 } = {}) {
  const secs: Sec[] = pts.map((p, i) => {
    const d = pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();
    const { u, v } = frame(d, o.up ?? UP);
    const [rx, rup, rdown] = rad(i);
    return { c: p, u, v, rx, rf: rup, rb: rdown, e: o.e, w: w(i), paint: (a: number) => paint(i, a) };
  });
  loft(b, secs, n, { capStart: o.capStart, capEnd: o.capEnd });
}

/** A thin surface through rows of points (wings, membranes), seen from both sides. */
function sheet(b: SkinBuilder, rows: THREE.Vector3[][], pnt: (i: number, j: number) => Paint, w: (i: number, j: number) => Weights) {
  const idx = rows.map((r, i) => r.map((p, j) => b.vert(p.x, p.y, p.z, pnt(i, j), w(i, j))));
  for (let i = 0; i + 1 < idx.length; i++) for (let j = 0; j + 1 < idx[i].length; j++) {
    const a = idx[i][j], c = idx[i][j + 1], d = idx[i + 1][j], e = idx[i + 1][j + 1];
    b.tri(a, c, e); b.tri(a, e, d);
  }
}

const bezier = (a: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, t: number) => a.clone().multiplyScalar((1 - t) * (1 - t)).addScaledVector(c, 2 * (1 - t) * t).addScaledVector(d, t * t);

function beastGeometry(def: AnimalDef, sp: Spec, J: THREE.Vector3[], s: number, PARENTS: number[]): THREE.BufferGeometry {
  if (sp.drone) return droneGeometry(def, sp, J, s);
  if (sp.walker) return walkerGeometry(def, sp, J, s, PARENTS);
  const b = new SkinBuilder();
  const sh = def.shape;
  const C = rgb(def.colors[0]), ACC = rgb(def.colors[1]), EYE = rgb(def.colors[2]);
  const hide = HIDE[sh];
  const bug = INSECT(sh);
  const L = sp.len * s, BW = sp.bodyW * s, BR = sp.bodyR * s;
  const HORN = rgb(0xd8ccb0), HOOF = rgb(0x2a2420), TOOTH = rgb(0xe8e0d0), DARK = shade(C, 0.55);
  const glowEyes = !!sp.robot || def.key === 'glassstalker' || def.key === 'hookbeak';
  /** Countershaded: the back in the main colour, the belly in the second. */
  const hideAt = (a: number, k = 1): Paint => {
    const down = -Math.sin(a);
    return P(shade(mix(C, ACC, smoothstep(0.05, 0.75, down) * (bug ? 0.35 : 0.85)), k), hide);
  };
  const mid = (J[A.body].z + J[A.chest].z) / 2;

  // ---- trunk, rump to chest
  {
    const prof = sh === 'hound' || sh === 'stalker' ? TRUNK.lean : sh === 'bovine' || sh === 'shellback' || sh === 'turtle' ? TRUNK.barrel : bug ? TRUNK.bug : TRUNK.beast;
    const z0 = bug ? J[A.body].z - BR * 0.35 : mid - L * 0.43, z1 = bug ? J[A.chest].z + BR * 0.45 : mid + L * 0.44;
    const y0 = J[A.body].y + BR * 0.08, y1 = J[A.chest].y + BR * 0.15;
    const ts = [0, 0.04, 0.1, 0.18, 0.28, 0.38, 0.48, 0.58, 0.68, 0.78, 0.87, 0.94, 1];
    const pts = ts.map((t) => V(0, lerp(y0, y1, t) + BR * 0.08 * Math.sin(Math.PI * t), lerp(z0, z1, t)));
    tube(b, pts, (i) => { const [wk, bk, dk] = rowLerp(prof, ts[i]); return [BW * 0.55 * wk, BR * bk, BR * dk]; },
      (i) => { const k = smoothstep(0.38, 0.64, ts[i]); return [[A.body, 1 - k], [A.chest, k]]; },
      (i, a) => {
        if (sp.robot) return P(Math.abs(Math.sin(a)) > 0.92 ? shade(C, 0.7) : C, 'metal');
        if (bug) return P(shade(mix(C, ACC, smoothstep(0.1, 0.8, -Math.sin(a)) * 0.4), Math.floor(ts[i] * 7) % 2 ? 0.86 : 1), hide);
        return hideAt(a);
      }, 18, { e: bug ? 2.2 : 2.05, capStart: pts[0].clone().add(V(0, 0, -BR * 0.12)), capEnd: pts[pts.length - 1].clone().add(V(0, 0, BR * 0.1)) });
  }

  // ---- neck and head
  const H = J[A.head];
  if (sp.neckLen > 0.08) {
    const n0 = J[A.neck].clone().add(V(0, -BR * 0.25, -BR * 0.35));
    const ctrl = J[A.neck].clone().lerp(H, 0.5).add(V(0, sp.neckLen * s * 0.06, -sp.neckLen * s * 0.04));
    const ts = [0, 0.2, 0.4, 0.6, 0.8, 1];
    const pts = ts.map((t) => (t === 0 ? n0 : bezier(J[A.neck], ctrl, H.clone().add(V(0, -sp.headR * s * 0.2, 0)), t)));
    const r0 = sp.neckR * s;
    tube(b, pts, (i) => { const t = ts[i]; const r = r0 * lerp(1.45, 0.9, t); return [r * 0.92, r, r * 1.08]; },
      (i) => { const t = ts[i]; return t < 0.2 ? [[A.chest, 1 - t * 2.5], [A.neck, t * 2.5]] : t < 0.75 ? [[A.neck, 1]] : [[A.neck, 1 - (t - 0.75) * 3], [A.head, (t - 0.75) * 3]]; },
      (_i, a) => (sp.robot ? P(shade(C, 0.6), 'metal') : hideAt(a)), 14, { up: FWD.clone().multiplyScalar(-1) });
  }
  const hl = sp.headLen * s, hr = sp.headR * s;
  const hc = H.clone().add(V(0, 0, hl * 0.3));
  const snout = sh === 'hound' || sh === 'stalker' || sh === 'bovine' || sh === 'goat' || sh === 'shellback' || sh === 'turtle';
  blob(b, hc, 20, 14, (d, out) => {
    let x = d.x * hr * 1.05, y = d.y * hr * 0.95, z = d.z * hl * 0.55;
    if (sp.robot) {
      const pe = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.7);
      out.set(pe(d.x) * hr * 0.85, pe(d.y) * hr * 0.6, pe(d.z) * hl * 0.4).add(hc);
      return P(Math.abs(d.y) > 0.8 ? shade(C, 0.75) : shade(C, 1.1), 'metal');
    }
    if (snout) {
      const f = smoothstep(0.1, 0.95, d.z);
      x *= 1 - 0.42 * f; y *= 1 - 0.3 * f;
      y -= hr * 0.12 * f; // the muzzle drops a little
      if (d.y < -0.1) y *= 1 - 0.45 * smoothstep(0.1, 0.8, d.z); // room for the jaw
      z += hl * 0.06 * gauss(d.y - 0.55, 0.25) * gauss(d.z + 0.2, 0.4); // the brow
    }
    if (bug) { x *= 1.05; y *= 0.9; }
    out.set(x, y, z).add(hc);
    let c = sp.robot ? C : mix(C, ACC, smoothstep(-0.1, -0.8, d.y) * 0.6);
    if (snout && d.z > 0.9 && Math.abs(d.x) < 0.3) c = shade(c, 0.45); // the nose
    return P(c, bug ? 'chitin' : hide === 'hair' ? 'leather' : hide);
  }, [[A.head, 1]]);
  // the lower jaw (or beak), hinged at the jaw bone
  const Jw = J[A.jaw];
  if (sp.beak) {
    for (const lower of [false, true]) {
      const base = V(0, H.y + (lower ? -hr * 0.28 : hr * 0.05), H.z + hl * 0.62);
      const tip = V(0, H.y + (lower ? -hr * 0.55 : -hr * 0.6), H.z + hl * (lower ? 1.35 : 1.5));
      const ctrl = V(0, H.y + (lower ? -hr * 0.3 : hr * 0.15), H.z + hl * 1.2);
      const ts = [0, 0.25, 0.5, 0.75, 0.92];
      const pts = ts.map((t) => bezier(base, ctrl, tip, t));
      tube(b, pts, (i) => { const k = 1 - ts[i]; return [hr * 0.55 * k + 0.004, hr * (lower ? 0.25 : 0.4) * k + 0.003, hr * (lower ? 0.2 : 0.3) * k + 0.003]; }, () => [[lower ? A.jaw : A.head, 1]],
        () => P(rgb(0x2e2a24), 'bone'), 10, { capStart: true, capEnd: tip });
    }
  } else if (!bug && !sp.robot) {
    const jc = V(0, Jw.y, Jw.z + hl * 0.3);
    blob(b, jc, 14, 8, (d, out) => {
      const f = smoothstep(-0.4, 1, d.z);
      out.set(d.x * hr * 0.72 * (1 - 0.35 * f), d.y * hr * 0.26, d.z * hl * 0.48).add(jc);
      return P(mix(C, ACC, 0.5), hide === 'hair' ? 'leather' : hide);
    }, [[A.jaw, 1]]);
    if (sh === 'hound' || sh === 'stalker' || sh === 'turtle') {
      for (const side of [1, -1]) for (const k of [0, 1]) {
        const at = V(side * hr * (0.3 - k * 0.08), Jw.y + hr * 0.2, Jw.z + hl * (0.55 + k * 0.12));
        tube(b, [at, at.clone().add(V(0, hr * 0.28, 0))], () => [hr * 0.06, hr * 0.06, hr * 0.06], () => [[A.jaw, 1]], () => P(TOOTH, 'bone'), 5, { up: FWD, capStart: true, capEnd: at.clone().add(V(0, hr * 0.4, 0)) });
      }
    }
  }
  // eyes
  for (let e = 0; e < sp.eyes; e++) {
    const side = e % 2 ? -1 : 1, row = Math.floor(e / 2);
    const big = sh === 'fly' ? 2.6 : bug ? 1.2 : 1;
    const er = (sp.eyes > 2 ? 0.028 : 0.034) * s * big;
    const ec = sh === 'crab'
      ? V(side * hr * 0.55, H.y + hr * 0.5 + 0.18 * s, H.z + hl * 0.5)
      : V(side * hr * (sp.eyes > 2 ? 0.52 : 0.7), H.y + hr * (0.32 + row * 0.24), hc.z + hl * (0.22 - row * 0.1));
    if (sh === 'crab') tube(b, [V(side * hr * 0.4, H.y + hr * 0.3, H.z + hl * 0.45), ec.clone().add(V(0, -er, 0))], () => [0.014 * s, 0.014 * s, 0.014 * s], () => [[A.head, 1]], () => P(ACC, 'chitin'), 6, { up: FWD });
    blob(b, ec, 10, 7, (d, out) => { out.copy(d).multiplyScalar(er).add(ec); return glowEyes ? P(EYE, 'glow') : P(d.z > 0.5 || sh === 'fly' ? EYE : shade(EYE, 0.6), 'eye'); }, [[A.head, 1]]);
  }
  // ears, horns, mandibles
  if (sp.ears) for (const side of [1, -1]) {
    const bat = sh === 'bat' ? 1.8 : 1;
    const base = V(side * hr * 0.55, H.y + hr * 0.62, H.z + hl * 0.05);
    const tip = base.clone().add(V(side * 0.05 * s * bat, 0.14 * s * bat, -0.03 * s));
    tube(b, [base, base.clone().lerp(tip, 0.5), tip], (i) => { const k = [1, 0.8, 0.1][i]; return [0.045 * s * bat * k, 0.012 * s * k + 0.002, 0.012 * s * k + 0.002]; }, () => [[A.head, 1]], () => P(shade(C, 0.9), hide === 'hair' ? 'leather' : hide), 8, { up: FWD, capStart: true, capEnd: true });
  }
  if (sp.horns === 'curved') for (const side of [1, -1]) {
    const a = V(side * hr * 0.75, H.y + hr * 0.62, H.z + hl * 0.05);
    const c = a.clone().add(V(side * 0.3 * s, 0.02 * s, 0.02 * s)), d = a.clone().add(V(side * 0.42 * s, 0.26 * s, 0.14 * s));
    const ts = [0, 0.2, 0.4, 0.6, 0.8, 1];
    tube(b, ts.map((t) => bezier(a, c, d, t)), (i) => { const r = 0.05 * s * (1 - ts[i] * 0.8); return [r, r, r]; }, () => [[A.head, 1]], (i) => P(ts[i] > 0.75 ? shade(HORN, 0.7) : HORN, 'bone'), 8, { up: FWD, capStart: true, capEnd: d.clone().add(V(side * 0.01 * s, 0.03 * s, 0.01 * s)) });
  }
  if (sp.horns === 'back') for (const side of [1, -1]) {
    const a = V(side * hr * 0.4, H.y + hr * 0.75, H.z + hl * 0.1);
    const c = a.clone().add(V(side * 0.03 * s, 0.2 * s, -0.08 * s)), d = a.clone().add(V(side * 0.08 * s, 0.1 * s, -0.26 * s));
    const ts = [0, 0.25, 0.5, 0.75, 1];
    tube(b, ts.map((t) => bezier(a, c, d, t)), (i) => { const r = 0.032 * s * (1 - ts[i] * 0.75); return [r, r * 1.2, r * 1.2]; }, () => [[A.head, 1]], (i) => P(shade(rgb(0x6a5a48), 1 - 0.2 * ((i * 3) % 2)), 'bone'), 8, { up: FWD, capStart: true, capEnd: d.clone().add(V(0, -0.02 * s, -0.02 * s)) });
  }
  if (sp.mandibles) for (const side of [1, -1]) {
    const a = V(side * 0.05 * s, H.y - 0.05 * s, hc.z + hl * 0.45);
    const c = a.clone().add(V(side * 0.06 * s, -0.02 * s, 0.08 * s)), d = a.clone().add(V(-side * 0.01 * s, -0.04 * s, 0.14 * s));
    tube(b, [0, 0.33, 0.66, 1].map((t) => bezier(a, c, d, t)), (i) => { const r = 0.02 * s * (1 - i * 0.25); return [r, r * 0.7, r * 0.7]; }, () => [[A.jaw, 1]], () => P(DARK, 'chitin'), 6, { up: UP, capStart: true, capEnd: d });
  }

  // ---- tail, or the abdomen of insects
  if (sp.tailLen > 0.05) {
    const T0 = J[A.tail], tl = sp.tailLen * s, tr = sp.tailR * s;
    if (sh === 'skitter' || sh === 'fly' || sh === 'spider') {
      const ac = T0.clone().add(V(0, tr * 0.2, -tl * 0.5));
      blob(b, ac, 16, 12, (d, out) => {
        out.set(d.x * tr * 1.1, d.y * tr, d.z * tl * 0.62).add(ac);
        const band = Math.floor((d.z + 1) * 4) % 2;
        if (sp.robot) return P(band ? shade(C, 0.8) : C, 'metal');
        return P(sh === 'fly' ? shade(ACC, band ? 0.8 : 1) : shade(mix(C, ACC, smoothstep(0, -0.8, d.y) * 0.5), band ? 0.82 : 1), hide);
      }, (p) => { const k = smoothstep(T0.z, T0.z - tl * 0.3, p.z); return [[A.body, 1 - k], [A.tail, k]]; });
    } else {
      const end = T0.clone().add(V(0, -tl * 0.45, -tl));
      const ctrl = T0.clone().add(V(0, 0, -tl * 0.5));
      const ts = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
      const pts = [T0.clone().add(V(0, 0, BR * 0.3)), ...ts.slice(1).map((t) => bezier(T0, ctrl, end, t))];
      tube(b, pts, (i) => { const r = tr * lerp(1.4, 0.3, ts[i]); return [r, r, r]; }, (i) => (i === 0 ? [[A.body, 1]] : [[A.body, Math.max(0, 0.5 - ts[i] * 2)], [A.tail, Math.min(1, 0.5 + ts[i] * 2)]]),
        (i, a) => (sh === 'goat' || sh === 'bovine') && ts[i] > 0.85 ? P(shade(C, 0.5), 'hair') : hideAt(a), 10, { up: UP, capEnd: end.clone().add(V(0, -tr * 0.2, -tr * 0.4)) });
      if (sp.crystals) for (let i = 0; i < 4; i++) {
        const p = bezier(T0, ctrl, end, 0.2 + i * 0.2).add(V(0, tr * 0.6, 0));
        crystal(b, p, V(Math.sin(i * 2.1) * 0.3, 1, -0.4).normalize(), 0.035 * s, (0.16 + (i % 2) * 0.06) * s, [[A.tail, 1]]);
      }
    }
  }

  // ---- legs
  for (let k = 0; k < sp.pairs; k++) for (let side = 0; side < 2; side++) {
    const u = LEG0 + (k * 2 + side) * 2;
    const hip = J[u], knee = J[u + 1];
    const sx = side === 0 ? 1 : -1;
    // (a hovering fly's legs dangle)
    const foot = V(hip.x + sx * sp.spread * s, sp.hover ? knee.y - sp.legLen * s * 0.55 : 0.02, hip.z + (sp.kneeUp ? (k - (sp.pairs - 1) / 2) * 0.12 * s : 0) + (sp.hover ? (1 - k) * 0.05 * s : 0));
    const par = PARENTS[u];
    const lr = sp.legR * s;
    const wing = sp.wings && k === 0 && sh === 'bat';
    const pincer = sp.pincers && k === 0;
    const legC = sp.robot ? shade(C, 0.8) : C;
    const legSurf: Surf = sp.robot ? 'metal' : bug ? 'chitin' : hide;
    if (wing) {
      // a bat's arm, and the membrane from it back to the flank
      tube(b, [hip.clone().add(V(-sx * 0.04 * s, 0.03 * s, 0)), hip, knee, foot], (i) => { const r = lr * [1.8, 1.4, 1, 0.6][i]; return [r, r, r]; }, (i) => [[par, i === 0 ? 1 : 0], [u, i === 1 || i === 2 ? 1 : 0], [u + 1, i === 3 ? 1 : 0]], () => P(legC, legSurf), 8, { up: FWD, capEnd: true });
      const flank = [hip.clone().add(V(-sx * 0.02, -0.04 * s, -0.1 * s)), V(sx * BW * 0.35, J[A.body].y - BR * 0.2, J[A.body].z), V(sx * BW * 0.25, J[A.body].y - BR * 0.4, J[A.body].z - BR * 0.6)];
      const arm = [knee, knee.clone().lerp(foot, 0.5), foot];
      sheet(b, [0, 0.5, 1].map((t) => arm.map((p, j) => p.clone().lerp(flank[j], t))), () => P(shade(ACC, 0.7), 'leather'), (i, j) => (i === 2 ? [[A.body, 1]] : j === 0 ? [[u, 1]] : [[u + 1, 1]]));
      continue;
    }
    // from inside the body out through the hip, knee and down to the foot
    const root = hip.clone().add(V(-sx * lr * 1.2, sp.kneeUp ? 0 : BR * 0.35, 0));
    const footTop = foot.clone().add(V(0, bug ? 0 : lr * 0.9, 0));
    let pts: THREE.Vector3[], rad: number[];
    if (sp.kneeUp) {
      pts = [root, hip, hip.clone().lerp(knee, 0.5), knee, knee.clone().lerp(foot, 0.35), knee.clone().lerp(foot, 0.7), footTop];
      rad = [1.5, 1.25, 1.1, 0.95, 0.85, 0.7, 0.45];
    } else {
      // a haunch that swells out of the body; hind legs bend forward at the stifle and back at the hock
      const hind = k === sp.pairs - 1, ll = sp.legLen * s;
      const kneeP = knee.clone().add(V(0, 0, hind ? 0.08 * ll : -0.02 * ll));
      const hock = knee.clone().lerp(foot, hind ? 0.52 : 0.62).add(V(0, 0, hind ? -0.09 * ll : 0.012 * ll));
      pts = [root, hip, hip.clone().lerp(kneeP, 0.5).add(V(0, 0, hind ? 0.02 * ll : 0)), kneeP, kneeP.clone().lerp(hock, 0.5), hock, hock.clone().lerp(footTop, 0.5), footTop];
      const heavy = sh === 'bovine' || sh === 'shellback' || sh === 'turtle' ? 1.1 : 1;
      rad = (hind ? [2.9, 2.45, 1.85, 1.1, 0.85, 0.76, 0.64, 0.62] : [2.5, 2.1, 1.55, 1.05, 0.86, 0.7, 0.63, 0.62]).map((r, i) => (i < 3 ? r * heavy : r));
    }
    const kneeI = 3;
    const w = (i: number): Weights => {
      if (i === 0) return [[par, 0.6], [u, 0.4]];
      if (i === 1) return [[par, 0.15], [u, 0.85]];
      if (i < kneeI) return [[u, 1]];
      if (i === kneeI) return [[u, 0.5], [u + 1, 0.5]];
      return [[u + 1, 1]];
    };
    if (pincer) {
      // a crab's great claw on the front pair
      const tip = V(knee.x + sx * 0.05, knee.y - 0.05, knee.z + 0.35 * s);
      tube(b, [root, hip, knee, knee.clone().lerp(tip, 0.5), tip], (i) => { const r = lr * [1.6, 1.4, 1.3, 1.9, 2.4][i]; return [r, r, r]; }, (i) => (i < 2 ? w(i) : i === 2 ? [[u, 0.5], [u + 1, 0.5]] : [[u + 1, 1]]), () => P(ACC, 'chitin'), 10, { up: UP });
      for (const jaw of [1, -1]) {
        const a = tip.clone().add(V(0, jaw * 0.03 * s, 0)), d = tip.clone().add(V(-sx * 0.02 * s, jaw * 0.05 * s, 0.22 * s)), c = tip.clone().add(V(0, jaw * 0.09 * s, 0.1 * s));
        tube(b, [0, 0.33, 0.66, 1].map((t) => bezier(a, c, d, t)), (i) => { const r = 0.06 * s * (1 - i * 0.26); return [r * 0.8, r, r]; }, () => [[u + 1, 1]], (i) => P(i === 3 ? DARK : ACC, 'chitin'), 8, { up: FWD, capStart: true, capEnd: d });
      }
      continue;
    }
    tube(b, pts, (i) => { const r = lr * rad[i]; return sp.kneeUp ? [r, r, r] : [r * (i < 3 ? 0.72 : 0.85), r, r * (i < 3 ? 1.12 : 1)]; }, w,
      (i, a) => (i >= pts.length - 2 && !bug && !sp.robot ? P(shade(legC, 0.82), legSurf) : i === 0 || i === 1 ? hideAt(a) : P(legC, legSurf)), sp.kneeUp ? 8 : 10,
      { up: FWD, capEnd: bug || sp.robot ? foot : false });
    if (!bug && !sp.robot) {
      // hooves for grazers, a padded paw for the rest
      const hoof = sh === 'shellback' || sh === 'bovine' || sh === 'turtle' || sh === 'goat';
      const fc = foot.clone().add(V(0, 0, hoof ? 0 : lr * 0.5));
      if (hoof) lathe(b, V(foot.x, 0, foot.z), [[0, 0], [lr * 1.05, 0], [lr * 1.0, lr * 0.9], [lr * 0.8, lr * 1.3], [0, lr * 1.35]], 10, (i) => P(i < 2 ? HOOF : shade(HOOF, 1.4), 'bone'), [[u + 1, 1]]);
      else blob(b, fc, 10, 7, (d, out) => { out.set(d.x * lr * 1.0, Math.max(-0.2, d.y) * lr * 0.8 + lr * 0.35, d.z * lr * 1.5).add(V(fc.x, 0, fc.z)); return P(d.y < -0.1 ? DARK : legC, legSurf); }, [[u + 1, 1]]);
    }
  }

  // ---- shells, plates, crystals and machinery
  if (sp.shell) {
    const sc = V(0, J[A.body].y + BR * 0.25, mid);
    const rx = BW * 0.72, ry = BR * 1.45, rz = L * 0.6;
    blob(b, sc, 26, 16, (d, out) => {
      const y = Math.max(d.y, -0.28 + 0.1 * Math.abs(d.z));
      out.set(d.x * rx * (1 + 0.06 * (1 - Math.abs(d.y))), y * ry, d.z * rz).add(sc);
      // plates: a pattern of scutes, darker in the seams, the rim lighter
      const seg = Math.abs(Math.sin(Math.atan2(d.x, d.z) * 3.5)) < 0.12 || Math.abs(Math.sin(d.y * 7)) < 0.1;
      const rim = d.y < -0.15;
      return P(rim ? shade(ACC, 0.9) : seg ? shade(C, 0.62) : shade(C, 0.92 + 0.12 * d.y), 'chitin');
    }, (p) => { const k = smoothstep(mid - L * 0.1, mid + L * 0.2, p.z); return [[A.body, 1 - k], [A.chest, k]]; });
    if (sp.spikes) for (let i = 0; i < 7; i++) {
      const a = V((i % 3 - 1) * BW * 0.25, J[A.body].y + BR * 1.55, J[A.body].z - BR * 0.3 + (i / 7) * L * 0.8);
      crystal(b, a, V((i % 3 - 1) * 0.3, 1, 0).normalize(), 0.06 * s, 0.22 * s, [[i < 4 ? A.body : A.chest, 1]], shade(ACC, 0.8), 'bone');
    }
    if (def.key === 'mauler') for (let i = 0; i < 5; i++) {
      const mc = V(Math.sin(i * 2.3) * 0.4 * s, J[A.body].y + BR * 1.35, J[A.body].z + i * 0.3 * s);
      blob(b, mc, 10, 6, (d, out) => { out.set(d.x * 0.3 * s, Math.max(d.y, -0.3) * 0.1 * s, d.z * 0.3 * s).add(mc); return P(shade(rgb(0x4a6a34), 0.85 + 0.2 * d.y), 'hair'); }, [[A.body, 1]]);
    }
  }
  if (sp.plates) for (let i = 0; i < 4; i++) {
    const z = J[A.chest].z - i * L * 0.22;
    const t = (z - (mid - L * 0.43)) / (L * 0.87);
    const y = lerp(J[A.body].y, J[A.chest].y, t) + BR * 0.98;
    const pc = V(0, y, z);
    blob(b, pc, 14, 8, (d, out) => {
      out.set(d.x * BW * 0.4, Math.max(d.y, -0.2) * 0.03 * s + 0.02 * s * (1 - d.x * d.x) * (d.y > 0 ? 1 : 0), d.z * 0.09 * s).add(pc);
      out.y -= BW * 0.18 * d.x * d.x; // curving down the flanks
      return P(shade(HORN, 0.9 + 0.1 * d.y), 'bone');
    }, [[i < 2 ? A.chest : A.body, 1]]);
  }
  if (sp.crystals) for (let i = 0; i < 6; i++) {
    const z = J[A.chest].z - i * L * 0.15;
    const at = V(Math.sin(i * 1.7) * 0.1 * s, lerp(J[A.chest].y, J[A.body].y, i / 6) + BR * 0.9, z);
    crystal(b, at, V(Math.sin(i * 2.1) * 0.4, 1, -0.2).normalize(), 0.05 * s, (0.26 + (i % 3) * 0.1) * s, [[i < 3 ? A.chest : A.body, 1]]);
  }
  if (sp.robot) {
    const pc = V(0, J[A.body].y + BR * 0.72, J[A.body].z + L * 0.1);
    tube(b, [pc.clone().add(V(0, 0, -L * 0.22)), pc, pc.clone().add(V(0, 0, L * 0.22))], () => [BW * 0.26, 0.04 * s, 0.04 * s], () => [[A.body, 1]], () => P(shade(C, 0.7), 'metal'), 10, { e: 4, capStart: true, capEnd: true });
    blob(b, pc.clone().add(V(0, 0.05 * s, 0)), 8, 6, (d, out) => { out.copy(d).multiplyScalar(0.035 * s).add(pc).add(V(0, 0.05 * s, 0)); return P([1, 0.2, 0.08], 'glow'); }, [[A.body, 1]]);
  }
  if (sh === 'fly') {
    for (const side of [1, -1]) {
      const root = V(side * 0.08 * s, J[A.chest].y + BR * 0.7, J[A.chest].z - 0.05 * s);
      const rows = [0, 0.35, 0.7, 1].map((t) => [-1, -0.5, 0, 0.5, 1].map((q) => root.clone().add(V(side * t * 0.5 * s, 0.02 * s * t, q * 0.13 * s * Math.sin(Math.PI * (0.15 + 0.85 * t)) - t * 0.12 * s))));
      sheet(b, rows, () => P([0.55, 0.58, 0.55], 'eye'), () => [[A.chest, 1]]);
    }
  }
  return b.build();
}

// ------------------------------------------------------------------ the Makers' machines

/** A saw drone: a chrome sphere with a glowing thruster, an eye on a stalk and three tool arms. */
function droneGeometry(def: AnimalDef, sp: Spec, J: THREE.Vector3[], s: number): THREE.BufferGeometry {
  const b = new SkinBuilder();
  const C = rgb(def.colors[0]), DARK = rgb(def.colors[1]), EYE = rgb(def.colors[2]);
  const JET: RGB = [0.35, 1.0, 1.7], FLAME: RGB = [0.9, 2.2, 4];
  const R = sp.bodyR * s * 1.25, bc = V(0, sp.hipH * s, 0);
  const hull: Weights = [[A.body, 0.5], [A.chest, 0.5]];
  // the hull: a sphere banded at the equator, seamed into panels, the crown a little taller
  blob(b, bc, 28, 20, (d, out) => {
    out.copy(d).multiplyScalar(R).add(bc);
    if (d.y > 0) out.y += R * 0.1 * d.y;
    const band = Math.abs(d.y) < 0.11, rivet = Math.abs(d.y) < 0.16 && Math.abs(d.y) > 0.13;
    const seam = Math.abs(Math.sin(Math.atan2(d.x, d.z) * 3)) < 0.05 && Math.abs(d.y) > 0.15;
    return P(band ? DARK : rivet ? shade(C, 0.6) : seam ? shade(C, 0.72) : shade(C, 0.9 + 0.12 * d.y), 'metal');
  }, hull);
  // the thruster underneath: a skirt, and the blue jet inside it
  lathe(b, bc.clone().add(V(0, -R * 1.18, 0)), [[R * 0.5, 0], [R * 0.56, R * 0.12], [R * 0.44, R * 0.34], [R * 0.2, R * 0.4]], 16, (i) => P(i === 0 ? shade(DARK, 0.7) : DARK, 'metal'), hull);
  blob(b, bc.clone().add(V(0, -R * 1.16, 0)), 12, 6, (d, out) => { out.set(d.x * R * 0.42, Math.min(0, d.y) * R * 0.12, d.z * R * 0.42).add(bc).add(V(0, -R * 1.16, 0)); return P(JET, 'glow'); }, hull);
  // the eye on its stalk
  const N0 = J[A.neck], H = J[A.head];
  tube(b, [N0.clone().add(V(0, -R * 0.1, 0)), N0, N0.clone().lerp(H, 0.5), H], () => [0.022 * s, 0.022 * s, 0.022 * s], (i) => (i < 2 ? [[A.chest, 1]] : i === 2 ? [[A.neck, 1]] : [[A.head, 1]]), () => P(DARK, 'metal'), 8, { up: FWD });
  const hc = H.clone().add(V(0, 0.02 * s, 0.02 * s));
  blob(b, hc, 14, 10, (d, out) => { out.set(d.x * 0.075 * s, d.y * 0.06 * s, d.z * 0.09 * s).add(hc); return P(d.z > 0.55 ? shade(DARK, 0.5) : C, 'metal'); }, [[A.head, 1]]);
  const ec = hc.clone().add(V(0, 0, 0.075 * s));
  blob(b, ec, 10, 8, (d, out) => { out.copy(d).multiplyScalar(0.038 * s).add(ec); return P(EYE, 'glow'); }, [[A.head, 1]]);
  // two arms: the left ends in a buzz saw, the right in a three-fingered claw
  for (let side = 0; side < 2; side++) {
    const u = LEG0 + side * 2, sx = side === 0 ? 1 : -1;
    const sh = J[u], el = J[u + 1], hand = el.clone().add(V(sx * 0.02 * s, -0.02 * s, 0.26 * s));
    const r = sp.legR * s;
    tube(b, [sh.clone().add(V(-sx * R * 0.2, 0, 0)), sh, sh.clone().lerp(el, 0.5), el], () => [r, r, r], (i) => (i < 2 ? [[A.chest, 0.4], [u, 0.6]] : [[u, 1]]), () => P(C, 'metal'), 8, { up: FWD });
    blob(b, sh, 10, 7, (d, out) => { out.copy(d).multiplyScalar(r * 2.2).add(sh); return P(DARK, 'metal'); }, [[u, 1]]);
    blob(b, el, 8, 6, (d, out) => { out.copy(d).multiplyScalar(r * 1.7).add(el); return P(DARK, 'metal'); }, [[u, 0.5], [u + 1, 0.5]]);
    tube(b, [el, el.clone().lerp(hand, 0.5), hand], () => [r * 0.85, r * 0.85, r * 0.85], () => [[u + 1, 1]], () => P(C, 'metal'), 8, { up: UP });
    if (side === 0) {
      // the saw: a toothed disc standing across the arm's end
      const axis = V(1, 0, 0), sr = 0.13 * s;
      lathe(b, hand.clone().add(V(-0.008 * s, 0, 0.05 * s)), [[0, 0], [sr * 0.2, 0], [sr, 0.004 * s], [sr, 0.012 * s], [sr * 0.2, 0.016 * s], [0, 0.016 * s]], 24,
        (_i, a) => P(Math.floor((a / (Math.PI * 2)) * 24) % 2 ? shade(C, 1.15) : shade(C, 0.8), 'metal'), [[u + 1, 1]], { up: axis, front: FWD });
    } else {
      for (let f = 0; f < 3; f++) {
        const a = (f / 3) * Math.PI * 2;
        const f0 = hand.clone().add(V(Math.cos(a) * 0.02 * s, Math.sin(a) * 0.02 * s, 0));
        const f1 = f0.clone().add(V(Math.cos(a) * 0.035 * s, Math.sin(a) * 0.035 * s, 0.07 * s));
        const f2 = f1.clone().add(V(-Math.cos(a) * 0.02 * s, -Math.sin(a) * 0.02 * s, 0.05 * s));
        tube(b, [f0, f1, f2], (i) => { const q = r * (0.55 - i * 0.15); return [q, q, q]; }, () => [[u + 1, 1]], () => P(DARK, 'metal'), 6, { up: UP, capEnd: true });
      }
    }
  }
  // the third arm, underneath at the back: a cutting torch, its nozzle burning blue
  const T0 = J[A.tail], T1 = T0.clone().add(V(0, -0.12 * s, -0.08 * s)), T2 = T1.clone().add(V(0, -0.06 * s, 0.2 * s));
  tube(b, [T0.clone().add(V(0, R * 0.2, R * 0.2)), T0, T1, T2], () => [0.025 * s, 0.025 * s, 0.025 * s], (i) => (i < 2 ? [[A.body, 0.5], [A.tail, 0.5]] : [[A.tail, 1]]), () => P(C, 'metal'), 8, { up: FWD });
  tube(b, [T2, T2.clone().add(V(0, 0, 0.06 * s))], () => [0.032 * s, 0.032 * s, 0.032 * s], () => [[A.tail, 1]], () => P(DARK, 'metal'), 8, { up: UP, capStart: true });
  const tip = T2.clone().add(V(0, 0, 0.075 * s));
  blob(b, tip, 8, 6, (d, out) => { out.set(d.x * 0.016 * s, d.y * 0.016 * s, d.z * 0.03 * s).add(tip); return P(FLAME, 'glow'); }, [[A.tail, 1]]);
  return b.build();
}

/** A warbot: a boxy war hull on four piston legs, beam cannons on its shoulders and a sensor head. */
function walkerGeometry(def: AnimalDef, sp: Spec, J: THREE.Vector3[], s: number, PARENTS: number[]): THREE.BufferGeometry {
  const b = new SkinBuilder();
  const C = rgb(def.colors[0]), DARK = rgb(def.colors[1]), EYE = rgb(def.colors[2]);
  const HAZ: RGB = [0.85, 0.66, 0.12], CORE: RGB = [3.2, 1.3, 0.25];
  const L = sp.len * s, BW = sp.bodyW * s, BR = sp.bodyR * s;
  const z0 = J[A.body].z - L * 0.18, z1 = J[A.chest].z + L * 0.2;
  // the hull: a squared-off box, panelled, hazard-striped on the brow
  const ts = [0, 0.06, 0.2, 0.45, 0.7, 0.9, 1];
  const pts = ts.map((t) => V(0, lerp(J[A.body].y, J[A.chest].y, t) + BR * 0.1, lerp(z0, z1, t)));
  tube(b, pts, (i) => { const k = [0.7, 0.95, 1, 1, 1, 0.96, 0.75][i]; return [BW * 0.52 * k, BR * k, BR * 0.9 * k]; },
    (i) => { const k = smoothstep(0.35, 0.65, ts[i]); return [[A.body, 1 - k], [A.chest, k]]; },
    (i, a) => {
      const up = Math.sin(a);
      if (ts[i] > 0.85 && up > 0.3) return P(Math.floor((Math.cos(a) + 1) * 6) % 2 ? HAZ : DARK, 'metal');
      if (Math.abs(ts[i] - 0.45) < 0.03 || Math.abs(ts[i] - 0.7) < 0.03) return P(shade(DARK, 0.9), 'metal');
      return P(shade(C, 0.85 + 0.2 * up), 'metal');
    }, 20, { e: 4.5, capStart: pts[0].clone().add(V(0, 0, -BR * 0.1)), capEnd: pts[pts.length - 1].clone().add(V(0, 0, BR * 0.08)) });
  // the sensor head: a low armoured box with a red visor slit
  const H = J[A.head], hc = H.clone().add(V(0, 0, sp.headLen * s * 0.3));
  const hw = sp.headR * s, hl = sp.headLen * s;
  blob(b, hc, 18, 12, (d, out) => {
    const pe = (v: number) => Math.sign(v) * Math.pow(Math.abs(v), 0.55);
    out.set(pe(d.x) * hw * 1.2, pe(d.y) * hw * 0.62, pe(d.z) * hl * 0.5).add(hc);
    return P(Math.abs(d.y) > 0.85 ? shade(DARK, 1.2) : C, 'metal');
  }, [[A.head, 1]]);
  const vc = hc.clone().add(V(0, hw * 0.05, hl * 0.47));
  tube(b, [vc.clone().add(V(hw * 0.95, 0, 0)), vc, vc.clone().add(V(-hw * 0.95, 0, 0))], () => [0.022 * s, 0.03 * s, 0.03 * s], () => [[A.head, 1]], () => P(EYE, 'glow'), 8, { up: UP, capStart: true, capEnd: true });
  tube(b, [J[A.chest].clone().add(V(0, BR * 0.2, BR * 0.2)), J[A.neck], H], () => [sp.neckR * s, sp.neckR * s, sp.neckR * s], (i) => (i === 0 ? [[A.chest, 1]] : i === 1 ? [[A.neck, 1]] : [[A.head, 1]]), () => P(DARK, 'metal'), 10, { up: FWD });
  // beam cannons on the shoulders: a pod, a barrel, the emitter glowing at the muzzle
  for (const sx of [1, -1]) {
    const pc = V(sx * BW * 0.6, J[A.chest].y + BR * 0.55, J[A.chest].z - L * 0.05);
    tube(b, [pc.clone().add(V(0, 0, -L * 0.16)), pc, pc.clone().add(V(0, 0, L * 0.16))], () => [0.13 * s, 0.13 * s, 0.13 * s], () => [[A.chest, 1]], (_i, a) => P(Math.abs(Math.sin(a)) > 0.9 ? DARK : shade(C, 0.9), 'metal'), 10, { e: 3.5, capStart: true, capEnd: true, up: UP });
    const m0 = pc.clone().add(V(0, 0, L * 0.16)), m1 = m0.clone().add(V(0, 0, L * 0.32));
    tube(b, [m0, m0.clone().lerp(m1, 0.5), m1], (i) => { const q = (i === 2 ? 0.05 : 0.04) * s; return [q, q, q]; }, () => [[A.chest, 1]], () => P(DARK, 'metal'), 10, { up: UP });
    const mz = m1.clone().add(V(0, 0, 0.012 * s));
    blob(b, mz, 10, 6, (d, out) => { out.set(d.x * 0.038 * s, d.y * 0.038 * s, Math.max(-0.2, d.z) * 0.01 * s).add(mz); return P(EYE, 'glow'); }, [[A.chest, 1]]);
  }
  // a power core on its back, venting orange
  const cc = V(0, J[A.body].y + BR * 0.95, J[A.body].z);
  lathe(b, cc, [[0.2 * s, 0], [0.22 * s, 0.05 * s], [0.22 * s, 0.26 * s], [0.12 * s, 0.32 * s], [0, 0.33 * s]], 14, (i) => P(i === 1 || i === 2 ? DARK : shade(C, 0.8), 'metal'), [[A.body, 1]]);
  for (let v = 0; v < 6; v++) {
    const a = (v / 6) * Math.PI * 2, vc2 = cc.clone().add(V(Math.cos(a) * 0.223 * s, 0.15 * s, Math.sin(a) * 0.223 * s));
    blob(b, vc2, 6, 5, (d, out) => { out.set(d.x * 0.012 * s, d.y * 0.06 * s, d.z * 0.012 * s).add(vc2); return P(CORE, 'glow'); }, [[A.body, 1]]);
  }
  // four piston legs: an armoured thigh, a ball knee, a ram down the shin, a broad pad of a foot
  for (let k = 0; k < sp.pairs; k++) for (let side = 0; side < 2; side++) {
    const u = LEG0 + (k * 2 + side) * 2, sx = side === 0 ? 1 : -1;
    const hip = J[u], knee = J[u + 1], par = PARENTS[u];
    const foot = V(hip.x + sx * sp.spread * s, 0.06 * s, hip.z);
    const lr = sp.legR * s;
    tube(b, [hip.clone().add(V(-sx * lr, BR * 0.3, 0)), hip, hip.clone().lerp(knee, 0.5), knee], (i) => { const q = lr * [1.5, 1.35, 1.2, 1][i]; return [q, q * 1.1, q * 1.1]; },
      (i) => (i === 0 ? [[par, 0.6], [u, 0.4]] : [[u, 1]]), (_i, a) => P(Math.abs(Math.cos(a)) > 0.92 ? DARK : C, 'metal'), 10, { e: 3, up: FWD });
    blob(b, knee, 10, 8, (d, out) => { out.copy(d).multiplyScalar(lr * 1.25).add(knee); return P(DARK, 'metal'); }, [[u, 0.5], [u + 1, 0.5]]);
    tube(b, [knee, knee.clone().lerp(foot, 0.5), foot.clone().add(V(0, lr * 0.6, 0))], () => [lr * 0.7, lr * 0.7, lr * 0.7], () => [[u + 1, 1]], () => P(shade(C, 0.8), 'metal'), 10, { up: FWD });
    const r0 = knee.clone().add(V(0, -lr * 0.3, -lr * 1.1)), r1 = foot.clone().add(V(0, lr * 1.4, -lr * 0.9));
    tube(b, [r0, r0.clone().lerp(r1, 0.5), r1], (i) => { const q = lr * (i === 0 ? 0.32 : 0.24); return [q, q, q]; }, () => [[u + 1, 1]], (i) => P(i === 1 ? rgb(0xc8c8c8) : DARK, 'metal'), 8, { up: FWD, capStart: true, capEnd: true });
    blob(b, foot.clone().add(V(0, lr * 0.25, lr * 0.3)), 12, 8, (d, out) => { out.set(d.x * lr * 1.6, Math.max(-0.4, d.y) * lr * 0.45, d.z * lr * 2.2).add(foot).add(V(0, lr * 0.25, lr * 0.3)); return P(d.y < 0 ? shade(DARK, 0.7) : DARK, 'metal'); }, [[u + 1, 1]]);
  }
  return b.build();
}

/** A faceted crystal or spike standing out along `dir`. */
function crystal(b: SkinBuilder, at: THREE.Vector3, dir: THREE.Vector3, r: number, h: number, w: Weights, c: RGB = [0.1, 0.3, 0.28], surf: Surf = 'glow') {
  const { u, v } = frame(dir, Math.abs(dir.y) > 0.9 ? FWD : UP);
  const secs: Sec[] = [0, 0.55].map((k) => ({ c: at.clone().addScaledVector(dir, h * k), u, v, rx: r * (1 - k * 0.4), rf: r * (1 - k * 0.4), rb: r * (1 - k * 0.4), e: 1.2, w, paint: P(c, surf) }));
  loft(b, secs, 5, { capStart: true, capEnd: at.clone().addScaledVector(dir, h) });
}


export interface AnimalIn {
  speed: number;
  run: boolean;
  stance: Stance;
  attacking: boolean;
  atkT: number;
  hit: boolean;
  actT: number;
  variant: number;
}

export class AnimalAnimator {
  phase = Math.random() * 6;
  t = Math.random() * 10;
  roll = 0;
  drop = 0;
  constructor(public r: AnimalRig) {}
  update(dt: number, a: AnimalIn, moved: number) {
    const b = this.r.bones, sp = this.r.spec;
    this.t += dt;
    const stride = (sp.legLen + sp.len) * (a.run ? 1.3 : 0.8);
    this.phase += (moved / Math.max(0.3, stride)) * Math.PI * 2;
    const ph = this.phase;
    const moving = a.speed > 0.2;
    const down = a.stance === 'down' || a.stance === 'dead' || a.stance === 'carried';
    // lying on the side
    const tRoll = down ? Math.PI / 2 * (a.variant % 2 ? 1 : -1) : 0;
    this.roll += (tRoll - this.roll) * Math.min(1, dt * 6);
    b[A.root].rotation.z = this.roll;
    b[A.root].position.y = down ? sp.bodyW * 0.3 - (sp.hover ?? 0) : Math.sin(this.t * 6) * (sp.hover ? 0.05 : 0);
    if (sp.hover && !down) b[A.root].position.y = 0;
    // legs
    for (let k = 0; k < sp.pairs; k++) for (let side = 0; side < 2; side++) {
      const u = LEG0 + (k * 2 + side) * 2;
      const off = sp.pairs === 2 ? ((k + side) % 2) * Math.PI : ((k + side) % 2) * Math.PI;
      const sw = moving ? Math.sin(ph + off) : 0;
      const amp = a.run ? 0.7 : 0.4;
      if (down) {
        b[u].rotation.set(0.3 * Math.sin(this.t + k), 0, 0);
        b[u + 1].rotation.set(0.4, 0, 0);
        continue;
      }
      if (sp.kneeUp) {
        b[u].rotation.set(0, sw * amp * 0.6, (side === 0 ? -1 : 1) * Math.max(0, Math.cos(ph + off)) * 0.25 * (moving ? 1 : 0));
        b[u + 1].rotation.set(0, 0, 0);
      } else {
        b[u].rotation.set(-sw * amp, 0, 0);
        b[u + 1].rotation.set(Math.max(0, Math.cos(ph + off)) * amp * 1.1 * (moving ? 1 : 0), 0, 0);
      }
      if (sp.wings && k === 0 && sp.hover) b[u].rotation.z = Math.sin(this.t * 40) * 0.6;
    }
    // body bob, neck and head
    const bob = moving ? Math.abs(Math.sin(ph)) * 0.04 : Math.sin(this.t * 1.5) * 0.01;
    b[A.body].position.y = this.r.rest[1].y + bob - (down ? 0 : 0);
    let neckX = moving ? 0.1 : Math.sin(this.t * 0.7) * 0.1;
    let headX = 0, jawX = 0.02, headY = moving ? 0 : Math.sin(this.t * 0.4) * 0.4;
    if (a.attacking) {
      const t = a.atkT;
      const wind = t < 0.45 ? t / 0.45 : 1 - Math.min(1, (t - 0.45) / 0.15);
      const strike = t >= 0.45 && t < 0.7 ? Math.sin(((t - 0.45) / 0.25) * Math.PI) : 0;
      neckX = -0.5 * wind + 0.7 * strike;
      headX = -0.2 * wind + 0.5 * strike;
      jawX = 0.6 * wind + 0.1;
      b[A.chest].rotation.x = -0.15 * wind + 0.2 * strike;
      headY = 0;
    } else b[A.chest].rotation.x = 0;
    if (a.hit) neckX -= 0.3;
    if (down) { neckX = 0.6; headX = 0.3; jawX = a.stance === 'dead' ? 0.4 : 0.1; }
    b[A.neck].rotation.set(neckX, headY * 0.5, 0);
    b[A.head].rotation.set(headX, headY * 0.5, 0);
    b[A.jaw].rotation.set(jawX, 0, 0);
    b[A.tail].rotation.set(0.2, Math.sin(this.t * (moving ? 6 : 1.5)) * 0.3, 0);
    if (sp.drone && !down) {
      // it bobs on its jet and leans into its flight, its eye looks about, and the saw arm slashes
      b[A.root].position.y = Math.sin(this.t * 2.3) * 0.05;
      b[A.root].rotation.x = moving ? 0.16 : 0;
      b[A.neck].rotation.set(0, Math.sin(this.t * 0.6) * 0.6, 0);
      b[A.head].rotation.set(Math.sin(this.t * 1.3) * 0.15, 0, 0);
      b[A.tail].rotation.set(0.1 + Math.sin(this.t * 0.9) * 0.15, 0, 0);
      if (a.attacking) {
        const t = a.atkT;
        const wind = t < 0.45 ? t / 0.45 : 1 - Math.min(1, (t - 0.45) / 0.15);
        const strike = t >= 0.45 && t < 0.7 ? Math.sin(((t - 0.45) / 0.25) * Math.PI) : 0;
        b[LEG0].rotation.set(-1.2 * wind + 1.5 * strike, 0, -0.35 * wind);
        b[LEG0 + 1].rotation.set(0.9 * wind, 0, 0);
      }
    }
    if (sp.walker && a.attacking) b[A.chest].rotation.x = 0.25 * Math.sin(Math.min(1, a.atkT / 0.7) * Math.PI); // a stamp
  }
}
