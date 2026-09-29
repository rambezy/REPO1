// The humanoid rig: bone layout, joint positions per race and build, and
// the bones themselves (the bodies are built on it in human.ts).
import * as THREE from 'three';
import type { Look } from '../sim/look';
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

type Kind = 'human' | 'karuk' | 'thrum' | 'hollow' | 'construct' | 'sentinel' | 'pale';

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
