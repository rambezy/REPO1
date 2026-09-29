// The humanoid rig: bone layout, joint positions per race and build, and
// the bones themselves (the bodies are built on it in human.ts).
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import type { Look, WeaponVis } from '../sim/look';
import { RACE } from '../content/races';

export const B = {
  root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5,
  shL: 6, uaL: 7, laL: 8, handL: 9, shR: 10, uaR: 11, laR: 12, handR: 13,
  ulL: 14, llL: 15, footL: 16, ulR: 17, llR: 18, footR: 19,
} as const;
export const BONE_COUNT = 20;
const PARENT = [-1, 0, 1, 2, 3, 4, 3, 6, 7, 8, 3, 10, 11, 12, 1, 14, 15, 1, 17, 18];

// limb loss bits (match sim/body LIMB order: head chest stomach larm rarm lleg rleg)
export const LOST_LARM = 1 << 3, LOST_RARM = 1 << 4, LOST_LLEG = 1 << 5, LOST_RLEG = 1 << 6;
/** Bitmask of limbs replaced by prosthetics. */
export const prostMask = (prost: (string | null)[]) => prost.reduce((m, p, i) => (p ? m | (1 << i) : m), 0);

export interface Rig {
  joints: THREE.Vector3[]; // model-space joint positions
  s: number; // height scale
  w: number; // width scale
}

type Kind = 'human' | 'karuk' | 'thrum' | 'hollow' | 'construct' | 'pale';

function kindOf(look: Look): Kind {
  return (RACE[look.race]?.race ?? 'human') as Kind;
}

export function makeRig(look: Look): Rig {
  const kind = kindOf(look);
  const s = look.height / 1.8;
  let w = look.bulk;
  if (look.female) w *= 0.92;
  const arm = kind === 'karuk' ? 1.05 : kind === 'pale' ? 1.12 : 1;
  const hipX = look.female ? 0.108 : 0.1;
  const j: [number, number, number][] = [];
  j[B.root] = [0, 0, 0];
  j[B.hips] = [0, 0.98 * s, 0];
  j[B.spine] = [0, 1.1 * s, 0];
  j[B.chest] = [0, 1.3 * s, 0];
  j[B.neck] = [0, (kind === 'thrum' ? 1.5 : 1.52) * s, 0];
  j[B.head] = [0, (kind === 'thrum' ? 1.61 : 1.6) * s, kind === 'thrum' ? 0.02 : 0];
  for (const side of [1, -1]) {
    const L = side > 0;
    j[L ? B.shL : B.shR] = [side * 0.07 * w, 1.47 * s, 0];
    j[L ? B.uaL : B.uaR] = [side * 0.2 * w, 1.46 * s, 0];
    j[L ? B.laL : B.laR] = [side * 0.232 * w, (1.46 - 0.29 * arm) * s, 0];
    j[L ? B.handL : B.handR] = [side * 0.25 * w, (1.46 - 0.55 * arm) * s, 0.02];
    j[L ? B.ulL : B.ulR] = [side * hipX * w, 0.95 * s, 0];
    j[L ? B.llL : B.llR] = [side * (hipX + 0.005) * w, 0.52 * s, 0.01];
    j[L ? B.footL : B.footR] = [side * (hipX + 0.005) * w, 0.09 * s, 0];
  }
  return { joints: j.map((p) => new THREE.Vector3(p[0], p[1], p[2])), s, w };
}

/** Bones positioned relative to their parents, root first. */
export function makeBones(rig: Rig): THREE.Bone[] {
  const bones: THREE.Bone[] = [];
  for (let i = 0; i < BONE_COUNT; i++) {
    const b = new THREE.Bone();
    b.name = 'b' + i;
    const p = rig.joints[i];
    const par = PARENT[i];
    if (par >= 0) {
      b.position.copy(p).sub(rig.joints[par]);
      bones[par].add(b);
    } else b.position.copy(p);
    bones.push(b);
  }
  return bones;
}

/** Weapon mesh, grip at the origin, blade along +Y. */
export function buildWeapon(v: WeaponVis): THREE.BufferGeometry {
  const g = new GeoBuilder();
  const L = v.length;
  const wd = v.wide ?? 1;
  switch (v.kind) {
    case 'katana':
      g.setColor(v.handle).translate(0, -0.2, 0).cyl(0.016, 0.016, 0.28, 5).translate(0, 0.2, 0);
      g.push().translate(0, 0.08, 0).cyl(0.045, 0.045, 0.012, 8, { color: 0x3a3228 }).pop();
      for (let i = 0; i < 4; i++) {
        const y0 = 0.09 + (L * i) / 4, y1 = 0.09 + (L * (i + 1)) / 4;
        const c0 = Math.pow(i / 4, 2) * 0.1, c1 = Math.pow((i + 1) / 4, 2) * 0.1;
        g.push().translate(0, 0, c0).limb(0, y0, 0, 0, y1, c1 - c0, 0.012, 0.012, 3, { color: v.blade }).pop();
        g.push().translate(0, (y0 + y1) / 2, c0 + 0.012).box(0.004, y1 - y0, 0.022 * wd, { color: v.blade }).pop();
      }
      break;
    case 'sabre':
      g.setColor(v.handle).translate(0, -0.16, 0).cyl(0.018, 0.018, 0.22, 5).translate(0, 0.16, 0);
      g.push().translate(0, 0.06, 0).box(0.12, 0.02, 0.03, { color: 0x6a5a3a }).pop();
      for (let i = 0; i < 3; i++) {
        const y0 = 0.07 + (L * i) / 3, y1 = 0.07 + (L * (i + 1)) / 3;
        const c = Math.pow((i + 0.5) / 3, 2) * 0.12;
        g.push().translate(0, (y0 + y1) / 2, c).box(0.006, y1 - y0 + 0.01, 0.055 * wd * (1 - i * 0.12), { color: v.blade }).pop();
      }
      break;
    case 'hacker':
      g.setColor(v.handle).translate(0, -0.2, 0).cyl(0.02, 0.02, 0.28, 5).translate(0, 0.2, 0);
      g.push().translate(0, 0.06 + L / 2, 0.03).box(0.012, L, 0.11 * wd, { color: v.blade }).pop();
      g.push().translate(0, 0.06 + L - 0.04, 0.05).box(0.012, 0.09, 0.14 * wd, { color: v.blade }).pop();
      break;
    case 'heavy':
      g.setColor(v.handle).translate(0, -0.32, 0).cyl(0.024, 0.024, 0.45, 5).translate(0, 0.32, 0);
      g.push().translate(0, 0.09, 0).box(0.22, 0.04, 0.05, { color: 0x4a4038 }).pop();
      g.push().translate(0, 0.1 + L / 2, 0).box(0.018, L, 0.16 * wd, { color: v.blade }).pop();
      g.push().translate(0, 0.1 + L, 0).rotateX(0.7).box(0.018, 0.12, 0.12 * wd, { color: v.blade }).pop();
      break;
    case 'blunt':
      g.setColor(v.handle).translate(0, -0.25, 0).cyl(0.022, 0.026, L + 0.25, 6).translate(0, 0.25, 0);
      g.push().translate(0, L - 0.1, 0).cyl(0.07 * wd, 0.06 * wd, 0.2, 7, { color: v.blade }).pop();
      if (v.variant === 1) for (let i = 0; i < 6; i++) g.push().translate(0, L - 0.02, 0).rotateY((i / 6) * 6.28).translate(0, 0, 0.07).rotateX(1.57).cone(0.02, 0.06, 4, { color: 0x5a5a5a }).pop();
      break;
    case 'polearm':
      g.setColor(v.handle).translate(0, -1.0, 0).cyl(0.02, 0.022, 1.0 + L * 0.45, 6).translate(0, 1.0, 0);
      g.push().translate(0, L * 0.45 + 0.06, 0).cyl(0.03, 0.03, 0.05, 6, { color: 0x4a3e30 }).pop();
      g.push().translate(0, L * 0.45 + 0.1 + 0.28, 0.02).box(0.008, 0.6, 0.06 * wd, { color: v.blade }).pop();
      g.push().translate(0, L * 0.45 + 0.7, 0.035).rotateX(0.3).box(0.008, 0.2, 0.04 * wd, { color: v.blade }).pop();
      break;
    case 'crossbow':
      g.setColor(v.handle).push().translate(0, 0.05, 0.25).rotateX(1.57).box(0.05, 0.6, 0.06).pop();
      g.push().translate(0, 0.08, 0.5).box(0.62, 0.03, 0.04, { color: v.blade }).pop();
      g.push().translate(0, 0.08, 0.44).box(0.6, 0.004, 0.004, { color: 0xd8d0c0 }).pop();
      break;
    case 'dagger':
      g.setColor(v.handle).translate(0, -0.1, 0).cyl(0.014, 0.014, 0.12, 5).translate(0, 0.1, 0);
      g.push().translate(0, 0.02 + L / 2, 0).box(0.005, L, 0.03, { color: v.blade }).pop();
      break;
    case 'pick':
      g.setColor(v.handle).translate(0, -0.3, 0).cyl(0.02, 0.02, 0.85, 6).translate(0, 0.3, 0);
      g.push().translate(0, 0.52, 0).rotateX(1.57).cyl(0.012, 0.03, 0.4, 5, { color: 0x6a6a6a }).pop();
      g.push().translate(0, 0.52, 0).rotateX(-1.57).cyl(0.012, 0.03, 0.18, 5, { color: 0x6a6a6a }).pop();
      break;
    default:
      break;
  }
  return g.build();
}
