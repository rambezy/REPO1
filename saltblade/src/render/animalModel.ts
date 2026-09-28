// Procedural beasts: a shared rig for four-, six- and eight-legged animals
// with necks, jaws, tails, shells, pincers and wings, plus their gaits.
import * as THREE from 'three';
import { GeoBuilder } from './geo';
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

const dk = (c: number, k: number) => {
  const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
  return (r << 16) | (g << 8) | b;
};

export function buildAnimal(def: AnimalDef, look: Look): AnimalRig {
  const sp = SPECS[def.shape];
  const s = def.size * look.bulk;
  const [col, acc, eyeC] = def.colors;
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

  const bones: THREE.Bone[] = [];
  for (let i = 0; i < NB; i++) {
    const b = new THREE.Bone();
    const p = PARENTS[i];
    if (p >= 0) { b.position.copy(J[i]).sub(J[p]); bones[p].add(b); } else b.position.copy(J[i]);
    bones.push(b);
  }

  const g = new GeoBuilder(true);
  const at = (bone: number) => { g.bone = bone; };
  // body: rear and front halves
  at(A.body);
  g.push().translate(0, J[A.body].y, (J[A.body].z + J[A.chest].z) / 2 - sp.len * s * 0.12).rotateX(Math.PI / 2).scale(sp.bodyW * s * 1.1, 1, sp.bodyR * s * 2);
  g.cyl(0.5, 0.45, sp.len * s * 0.55, 8, { color: col, grad: 0.3 });
  g.pop();
  at(A.chest);
  g.push().translate(0, J[A.chest].y, J[A.chest].z - sp.len * s * 0.2).rotateX(Math.PI / 2).scale(sp.bodyW * s * 1.15, 1, sp.bodyR * s * 2.1);
  g.cyl(0.5, 0.52, sp.len * s * 0.5, 8, { color: col, grad: 0.3 });
  g.pop();
  // belly
  at(A.body);
  g.push().translate(0, J[A.body].y - sp.bodyR * s * 0.55, (J[A.body].z + J[A.chest].z) / 2).scale(sp.bodyW * s * 0.8, sp.bodyR * s * 0.5, sp.len * s * 0.7);
  g.sphere(0.6, 7, 4, { color: acc });
  g.pop();
  if (sp.shell) {
    at(A.body);
    g.push().translate(0, J[A.body].y + sp.bodyR * s * 0.3, (J[A.body].z + J[A.chest].z) / 2).scale(sp.bodyW * s * 0.75, sp.bodyR * s * 1.4, sp.len * s * 0.62);
    g.ico(1, 1, { color: dk(col, 0.85), jitter: 0.08, seed: 5, grad: 0.4 });
    g.pop();
    if (sp.spikes) for (let i = 0; i < 7; i++) {
      g.push().translate((i % 3 - 1) * sp.bodyW * s * 0.25, J[A.body].y + sp.bodyR * s * 1.5, hz + (i / 7) * sp.len * s * 0.8).cone(0.08 * s, 0.25 * s, 4, { color: dk(acc, 0.8) }).pop();
    }
    if (def.key === 'mauler') for (let i = 0; i < 5; i++) g.push().translate(Math.sin(i * 2.3) * 0.4 * s, J[A.body].y + sp.bodyR * s * 1.2, hz + i * 0.3 * s).scale(0.3 * s, 0.1 * s, 0.3 * s).sphere(1, 5, 3, { color: 0x4a6a34 }).pop();
  }
  if (sp.plates) for (let i = 0; i < 4; i++) {
    at(i < 2 ? A.chest : A.body);
    g.push().translate(0, J[A.body].y + sp.bodyR * s * 0.95, cz - i * sp.len * s * 0.22).rotateX(0.3).box(sp.bodyW * s * 0.7, 0.05 * s, 0.16 * s, { color: 0xd8ccb0 }).pop();
  }
  if (sp.crystals) for (let i = 0; i < 6; i++) {
    at(i < 3 ? A.chest : A.body);
    g.push().translate(Math.sin(i * 1.7) * 0.1 * s, J[A.body].y + sp.bodyR * s, cz - i * sp.len * s * 0.15).rotateZ(Math.sin(i * 2.1) * 0.4).cone(0.07 * s, (0.3 + (i % 3) * 0.1) * s, 4, { color: 0x9ae0d0 }).pop();
  }
  if (sp.robot) {
    at(A.body);
    g.push().translate(0, J[A.body].y + sp.bodyR * s * 0.6, J[A.body].z).box(sp.bodyW * s * 0.5, 0.08 * s, sp.len * s * 0.4, { color: dk(col, 0.7) }).pop();
    g.push().translate(0, J[A.body].y + sp.bodyR * s * 0.75, J[A.body].z).box(0.08 * s, 0.05 * s, 0.08 * s, { color: [3, 0.4, 0.2] }).pop();
  }
  // neck and head
  if (sp.neckLen > 0.08) {
    at(A.neck);
    g.limb(J[A.neck].x, J[A.neck].y, J[A.neck].z, J[A.head].x, J[A.head].y, J[A.head].z, sp.neckR * s * 1.1, sp.neckR * s * 0.85, 6, { color: col });
  }
  at(A.head);
  const H = J[A.head];
  g.push().translate(H.x, H.y, H.z + sp.headLen * s * 0.35).scale(sp.headR * s * 1.1, sp.headR * s, sp.headLen * s * 0.55);
  g.sphere(1, 7, 5, { color: col, grad: 0.2 });
  g.pop();
  // eyes
  for (let e = 0; e < sp.eyes; e++) {
    const side = e % 2 ? -1 : 1, row = Math.floor(e / 2);
    const ex = side * sp.headR * s * (sp.eyes > 2 ? 0.55 : 0.75), ey = H.y + sp.headR * s * (0.35 + row * 0.25), ez = H.z + sp.headLen * s * (0.55 - row * 0.1);
    if (def.shape === 'crab') {
      g.limb(ex * 0.6, ey - 0.02, ez, ex * 0.9, ey + 0.18 * s, ez + 0.03, 0.015 * s, 0.012 * s, 4, { color: acc });
      g.push().translate(ex * 0.9, ey + 0.2 * s, ez + 0.03).sphere(0.035 * s, 5, 3, { color: eyeC }).pop();
    } else {
      const glow = sp.robot || def.key === 'glassstalker' || def.key === 'hookbeak';
      g.push().translate(ex, ey, ez).sphere((sp.eyes > 2 ? 0.03 : 0.04) * s * (def.shape === 'fly' ? 2.4 : 1), 5, 3, { color: glow ? [((eyeC >> 16) & 255) / 60, ((eyeC >> 8) & 255) / 60, (eyeC & 255) / 60] : eyeC }).pop();
    }
  }
  if (sp.ears) for (const side of [1, -1]) g.push().translate(side * sp.headR * s * 0.6, H.y + sp.headR * s * 0.9, H.z + sp.headLen * s * 0.1).rotateZ(-side * 0.3).cone(0.05 * s * (def.shape === 'bat' ? 2 : 1), 0.14 * s * (def.shape === 'bat' ? 1.8 : 1), 4, { color: dk(col, 0.9) }).pop();
  if (sp.horns === 'curved') for (const side of [1, -1]) {
    let px = side * sp.headR * s * 0.8, py = H.y + sp.headR * s * 0.7, pz = H.z + sp.headLen * s * 0.1;
    for (let k = 0; k < 4; k++) {
      const qx = px + side * 0.12 * s, qy = py + (k < 2 ? 0.05 : 0.08) * s, qz = pz + (k - 1) * 0.04 * s;
      g.limb(px, py, pz, qx, qy, qz, (0.05 - k * 0.01) * s, (0.04 - k * 0.01) * s, 5, { color: 0xd8ccb0 });
      px = qx; py = qy; pz = qz;
    }
  }
  if (sp.horns === 'back') for (const side of [1, -1]) g.limb(side * 0.05 * s, H.y + sp.headR * s * 0.8, H.z + 0.1 * s, side * 0.09 * s, H.y + sp.headR * s * 0.8 + 0.18 * s, H.z - 0.15 * s, 0.03 * s, 0.012 * s, 4, { color: 0x6a5a48 });
  if (sp.mandibles) for (const side of [1, -1]) g.push().translate(side * 0.06 * s, H.y - 0.04 * s, H.z + sp.headLen * s * 0.85).rotateX(1.4).rotateZ(side * 0.5).cone(0.025 * s, 0.14 * s, 4, { color: dk(col, 0.6) }).pop();
  if (sp.robot) g.push().translate(0, H.y, H.z + sp.headLen * s * 0.4).box(sp.headR * s * 1.6, sp.headR * s * 1.1, sp.headLen * s * 0.7, { color: dk(col, 1.1) }).pop();
  // jaw / beak
  at(A.jaw);
  const Jw = J[A.jaw];
  if (sp.beak) {
    g.push().translate(Jw.x, H.y + 0.02 * s, H.z + sp.headLen * s * 0.8).rotateX(Math.PI / 2 + 0.2).cone(sp.headR * s * 0.8, sp.headLen * s * 0.9, 5, { color: 0x3a3630 }).pop();
  }
  g.push().translate(Jw.x, Jw.y, Jw.z + sp.headLen * s * 0.35).scale(sp.headR * s * 0.8, sp.headR * s * 0.35, sp.headLen * s * 0.45);
  g.sphere(1, 6, 3, { color: sp.beak ? 0x2a2622 : dk(col, 0.85) });
  g.pop();
  if (def.shape === 'hound' || def.shape === 'stalker' || def.shape === 'turtle') for (const side of [1, -1]) g.push().translate(side * 0.04 * s, Jw.y + 0.03 * s, Jw.z + sp.headLen * s * 0.65).cone(0.015 * s, 0.05 * s, 3, { color: 0xe8e0d0 }).pop();
  // tail
  if (sp.tailLen > 0.05) {
    at(A.tail);
    const T0 = J[A.tail];
    if (def.shape === 'skitter' || def.shape === 'fly' || def.shape === 'spider') {
      g.push().translate(T0.x, T0.y, T0.z - sp.tailLen * s * 0.5).scale(sp.tailR * s * 1.1, sp.tailR * s, sp.tailLen * s * 0.6);
      g.sphere(1, 7, 5, { color: def.shape === 'fly' ? acc : dk(col, 0.9), grad: 0.3 });
      g.pop();
    } else g.limb(T0.x, T0.y, T0.z, T0.x, T0.y - sp.tailLen * s * 0.4, T0.z - sp.tailLen * s, sp.tailR * s, sp.tailR * s * 0.4, 5, { color: col });
  }
  // legs
  for (let k = 0; k < sp.pairs; k++) for (let side = 0; side < 2; side++) {
    const u = LEG0 + (k * 2 + side) * 2;
    const hip = J[u], knee = J[u + 1];
    const sx = side === 0 ? 1 : -1;
    const foot = new THREE.Vector3(hip.x + sx * sp.spread * s, 0.02, hip.z + (sp.kneeUp ? (k - (sp.pairs - 1) / 2) * 0.12 * s : 0));
    const wing = sp.wings && k === 0;
    const pincer = sp.pincers && k === 0;
    g.bone = u;
    g.limb(hip.x, hip.y, hip.z, knee.x, knee.y, knee.z, sp.legR * s * 1.2, sp.legR * s, 5, { color: pincer ? acc : col });
    g.bone = u + 1;
    if (pincer) {
      const tip = new THREE.Vector3(knee.x + sx * 0.05, knee.y - 0.05, knee.z + 0.35 * s);
      g.limb(knee.x, knee.y, knee.z, tip.x, tip.y, tip.z, sp.legR * s * 1.5, sp.legR * s * 2.2, 6, { color: acc });
      g.push().translate(tip.x, tip.y, tip.z).scale(0.12 * s, 0.08 * s, 0.2 * s).sphere(1, 6, 4, { color: acc }).pop();
    } else if (wing) {
      g.limb(knee.x, knee.y, knee.z, foot.x, foot.y, foot.z, sp.legR * s, sp.legR * s * 0.6, 4, { color: col });
      // membrane
      g.push().translate(knee.x, knee.y, knee.z).rotateY(sx * 0.3);
      g.box(0.02, (knee.y - foot.y) * 0.9, 0.5 * s, { color: dk(acc, 0.9) });
      g.pop();
    } else g.limb(knee.x, knee.y, knee.z, foot.x, foot.y, foot.z, sp.legR * s, sp.legR * s * (sp.robot ? 0.5 : 0.8), 5, { color: sp.robot ? dk(col, 0.8) : col });
    if (!pincer && !wing && (def.shape === 'shellback' || def.shape === 'bovine' || def.shape === 'turtle')) g.push().translate(foot.x, 0.04, foot.z).cyl(sp.legR * s * 1.2, sp.legR * s * 1.3, 0.08, 6, { color: dk(col, 0.6) }).pop();
  }
  // flies get wings on the chest
  if (def.shape === 'fly') {
    g.bone = A.chest;
    for (const side of [1, -1]) g.push().translate(side * 0.25 * s, J[A.chest].y + 0.15 * s, J[A.chest].z - 0.1 * s).rotateZ(side * 0.2).box(0.5 * s, 0.01, 0.25 * s, { color: 0xa0a8a0 }).pop();
  }
  const geo = g.build();
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, sp.hipH * s, 0), Math.max(1.5, sp.len * s * 1.6 + sp.neckLen * s));
  return { bones, geo, spec: sp, shape: def.shape, rest: J };
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
  }
}
