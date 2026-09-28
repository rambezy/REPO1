// Procedural humanoid bodies: a bone rig per race and a rigidly skinned mesh
// with skin, hair, clothing, armour and packs baked in as vertex colours.
import * as THREE from 'three';
import { GeoBuilder, geoRand } from './geo';
import type { Look, Vis, WeaponVis } from '../sim/look';
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

const dark = (c: number, k: number) => {
  const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
  return (Math.min(255, r) << 16) | (Math.min(255, g) << 8) | Math.min(255, b);
};

/** Builds the skinned body geometry. */
export function buildBody(look: Look, vis: Vis, lost: number, rig: Rig): THREE.BufferGeometry {
  const kind = kindOf(look);
  const g = new GeoBuilder(true);
  const J = rig.joints;
  const s = rig.s, w = rig.w;
  const r = geoRand(look.face * 131 + look.hairStyle * 17 + look.skin);
  const skin = look.skin;
  const robot = kind === 'hollow' || kind === 'construct';
  const thin = kind === 'thrum' ? 0.72 : kind === 'pale' ? 0.8 : robot ? 0.95 : 1;
  const thick = kind === 'karuk' ? 1.18 : kind === 'construct' ? 1.3 : 1;
  const jointCol = robot ? dark(skin, 0.55) : skin;

  const torsoC = vis.torso ? vis.torso.color : robot ? skin : skin;
  const sleeve = vis.torso ? vis.torso.sleeves : 0;
  const legC = vis.legs ? vis.legs.color : robot ? skin : kind === 'thrum' ? skin : 0x5a4a3a;
  const footC = vis.feet ? vis.feet.color : robot ? dark(skin, 0.8) : skin;
  const handC = vis.hands ? vis.hands.color : skin;

  const at = (bone: number) => { g.bone = bone; return J[bone]; };
  const limb = (bone: number, a: THREE.Vector3, b: THREE.Vector3, r0: number, r1: number, col: number, seg = 6) => {
    g.bone = bone;
    g.limb(a.x, a.y, a.z, b.x, b.y, b.z, r0, r1, seg, { color: col });
  };

  // ---------- legs ----------
  for (const side of [1, -1]) {
    const L = side > 0;
    if (lost & (L ? LOST_LLEG : LOST_RLEG)) {
      // stump
      const hip = J[L ? B.ulL : B.ulR];
      g.bone = L ? B.ulL : B.ulR;
      g.push().translate(hip.x, hip.y - 0.1 * s, hip.z).sphere(0.08 * w * thick, 6, 4, { color: legC }).pop();
      continue;
    }
    const ul = L ? B.ulL : B.ulR, ll = L ? B.llL : B.llR, ft = L ? B.footL : B.footR;
    const hipJ = J[ul], knee = J[ll], ankle = J[ft];
    const lr = 0.075 * w * thin * thick;
    limb(ul, hipJ, knee, lr, lr * 0.78, legC, robot ? 6 : 7);
    limb(ll, knee, ankle.clone().setY(ankle.y + 0.02), lr * 0.76, lr * 0.55, vis.feet && !vis.feet.wraps ? (knee.y - ankle.y > 0.3 ? legC : footC) : legC);
    if (vis.legs?.armour) {
      g.bone = ul;
      g.push().translate(hipJ.x + side * 0.01, (hipJ.y + knee.y) / 2, hipJ.z + 0.035).scale(1, 1, 0.6).box(lr * 2.3, (hipJ.y - knee.y) * 0.8, lr * 2, { color: vis.legs.color2 ?? dark(legC, 0.85) }).pop();
      g.bone = ll;
      g.push().translate(knee.x, knee.y - 0.1 * s, knee.z + 0.05).box(lr * 1.9, 0.26 * s, lr * 1.2, { color: vis.legs.color2 ?? dark(legC, 0.85) }).pop();
    }
    if (robot) { g.bone = ll; g.push().translate(knee.x, knee.y, knee.z).sphere(lr * 0.9, 6, 4, { color: jointCol }).pop(); }
    // boots / feet
    g.bone = ft;
    const bootH = vis.feet && !vis.feet.wraps ? 0.22 * s : 0.08;
    if (vis.feet && !vis.feet.wraps) {
      g.push().translate(ankle.x, ankle.y - 0.09 * s + bootH / 2, ankle.z).box(lr * 1.55, bootH, lr * 1.6, { color: footC }).pop();
    }
    if (kind === 'thrum' && !vis.feet) {
      // chitin claw-foot
      g.push().translate(ankle.x, ankle.y - 0.06, ankle.z + 0.07).rotateX(0.2).box(0.07 * w, 0.05, 0.22, { color: dark(skin, 0.8) }).pop();
    } else {
      g.push().translate(ankle.x, ankle.y - 0.055 * s, ankle.z + 0.055).box(0.095 * w * thick, 0.07 * s, 0.25 * s, { color: vis.feet ? footC : robot ? jointCol : skin }).pop();
    }
    if (vis.feet?.wraps) {
      g.push().translate(ankle.x, ankle.y + 0.02, ankle.z).cyl(lr * 0.62, lr * 0.62, 0.1, 6, { color: vis.feet.color }).pop();
    }
  }

  // ---------- pelvis ----------
  const hips = J[B.hips];
  g.bone = B.hips;
  g.push().translate(0, hips.y - 0.1 * s, 0).scale(1.0 * w * thick * (look.female ? 1.08 : 1), 1, 0.7 * thick);
  g.cyl(0.165 * thin, 0.15 * thin, 0.22 * s, 8, { color: legC });
  g.pop();
  // belt
  if (vis.torso || vis.armour) {
    g.push().translate(0, hips.y + 0.08 * s, 0).scale(w * thick, 1, 0.72 * thick).cyl(0.172 * thin, 0.172 * thin, 0.045, 8, { color: 0x3a2e22 }).pop();
  }
  // robes, long coats and armour skirts hang from the hips
  const skirtLong = vis.torso && (vis.torso.style === 'robe' || vis.torso.style === 'dress' || (vis.torso.style === 'coat' && vis.torso.long));
  if (skirtLong) {
    const len = vis.torso!.style === 'coat' ? 0.55 : 0.78;
    g.push().translate(0, hips.y + 0.05 * s - len * s, 0).scale(w * thick, 1, 0.8 * thick);
    g.cyl(0.19, 0.28 + len * 0.1, len * s, 8, { color: vis.torso!.color2 ?? vis.torso!.color, grad: 0.25 });
    g.pop();
  }
  if (vis.armour?.skirt || vis.legs?.skirt) {
    const c = vis.armour?.skirt ? vis.armour.color2 ?? vis.armour.color : vis.legs!.color2 ?? legC;
    for (const a of [0, 1.1, -1.1, 2.3, -2.3]) {
      g.push().translate(Math.sin(a) * 0.14 * w, hips.y - 0.22 * s, Math.cos(a) * 0.1).rotateY(a).rotateX(0.12);
      g.box(0.13 * w, 0.3 * s, 0.03, { color: c });
      g.pop();
    }
  }

  // ---------- torso ----------
  const chest = J[B.chest], spine = J[B.spine];
  const tw = w * thick, tz = kind === 'thrum' ? 0.9 : 1;
  g.bone = B.spine;
  g.push().translate(0, spine.y - 0.02, 0).scale(tw, 1, 0.72 * tz * thick);
  g.cyl(0.165 * thin, 0.158 * thin, 0.22 * s, 8, { color: robot && !vis.torso ? dark(skin, 0.7) : torsoC });
  g.pop();
  g.bone = B.chest;
  g.push().translate(0, chest.y - 0.1 * s, 0).scale(tw, 1, 0.75 * tz * thick);
  g.cyl(0.21 * thin * (look.female ? 0.93 : 1), 0.168 * thin, 0.3 * s, 8, { color: torsoC });
  g.pop();
  if (look.female && !robot && kind !== 'thrum') {
    g.push().translate(0, chest.y + 0.02 * s, 0.1 * thick).scale(tw * 1.35, 0.5, 0.45);
    g.sphere(0.11, 7, 4, { color: torsoC });
    g.pop();
  }
  // shoulders (deltoid caps)
  for (const side of [1, -1]) {
    const L = side > 0;
    if (lost & (L ? LOST_LARM : LOST_RARM)) continue;
    const sh = J[L ? B.uaL : B.uaR];
    g.bone = B.chest;
    g.push().translate(sh.x - side * 0.02, sh.y - 0.01, sh.z).sphere(0.075 * w * thin * thick, 7, 5, { color: sleeve >= 1 ? torsoC : robot ? jointCol : skin }).pop();
  }
  // race details on the torso
  if (kind === 'thrum') {
    for (let i = 0; i < 3; i++) {
      g.bone = i < 2 ? B.chest : B.spine;
      g.push().translate(0, chest.y - 0.02 - i * 0.12 * s, 0.09 * thick).scale(tw, 1, 0.55).cyl(0.17 - i * 0.015, 0.15 - i * 0.015, 0.07, 7, { color: dark(skin, 1.12) }).pop();
    }
    if (look.race === 'thrum_soldier') {
      g.bone = B.chest;
      g.push().translate(0, chest.y + 0.02, -0.07).scale(tw * 1.25, 0.9, 0.8).sphere(0.22, 8, 5, { color: dark(skin, 0.75) }).pop();
    }
  }
  if (robot) {
    g.bone = B.chest;
    g.push().translate(0, chest.y - 0.02, 0.11 * thick).box(0.26 * tw, 0.22 * s, 0.05, { color: dark(skin, 1.1) }).pop();
    g.push().translate(0, chest.y - 0.02, 0.14 * thick).box(0.05, 0.05, 0.02, { color: kind === 'construct' ? 0xff4020 : 0x40c0ff }).pop();
    g.bone = B.spine;
    for (let i = 0; i < 3; i++) g.push().translate(0, spine.y - 0.06 + i * 0.05, 0.1 * thick).box(0.2 * tw, 0.025, 0.04, { color: dark(skin, 0.6) }).pop();
  }
  if (look.paint && !vis.torso && !vis.armour) {
    g.bone = B.chest;
    g.push().translate(0, chest.y - 0.02, 0.13 * thick).box(0.3 * tw, 0.035, 0.02, { color: look.paint }).pop();
  }

  // ---------- clothing and armour on the torso ----------
  if (vis.torso) {
    const t = vis.torso;
    if (t.style === 'vest' || t.style === 'coat' || t.style === 'robe') {
      // open front / lapels in the second colour
      g.bone = B.chest;
      g.push().translate(0, chest.y - 0.06 * s, 0.132 * thick).box(0.07 * tw, 0.28 * s, 0.02, { color: t.color2 ?? dark(t.color, 0.7) }).pop();
    }
    if (t.style === 'rags') {
      g.bone = B.spine;
      for (let i = 0; i < 4; i++) {
        const a = -1.2 + i * 0.8;
        g.push().translate(Math.sin(a) * 0.15 * tw, spine.y - 0.12, Math.cos(a) * 0.1).rotateY(a).box(0.08, 0.1, 0.02, { color: dark(t.color, 0.85) }).pop();
      }
    }
    if (t.style === 'robe' || t.style === 'coat') {
      g.bone = B.chest;
      g.push().translate(0, chest.y + 0.14 * s, 0).scale(tw * 1.05, 1, 0.8 * thick).cyl(0.16, 0.2, 0.06, 8, { color: t.color2 ?? t.color }).pop();
    }
  }
  if (vis.armour) {
    const a = vis.armour;
    const ac = a.color, ac2 = a.color2 ?? dark(ac, 0.75);
    g.bone = B.chest;
    switch (a.style) {
      case 'leather':
      case 'padded':
        g.push().translate(0, chest.y - 0.08 * s, 0).scale(tw * 1.07, 1, 0.8 * thick).cyl(0.22 * thin, 0.18 * thin, 0.32 * s, 8, { color: ac }).pop();
        for (let i = 0; i < 3; i++) g.push().translate(0, chest.y - 0.18 * s + i * 0.09 * s, 0.155 * thick).box(0.3 * tw, 0.02, 0.02, { color: ac2 }).pop();
        break;
      case 'chain':
        g.push().translate(0, chest.y - 0.2 * s, 0).scale(tw * 1.07, 1, 0.8 * thick).cyl(0.22 * thin, 0.2 * thin, 0.46 * s, 8, { color: ac }).pop();
        break;
      case 'plate':
      case 'ember_plate':
      case 'robo':
        g.push().translate(0, chest.y - 0.06 * s, 0.03).scale(tw * 1.1, 1, 0.85 * thick).cyl(0.225 * thin, 0.19 * thin, 0.3 * s, 8, { color: ac }).pop();
        g.push().translate(0, chest.y - 0.02 * s, 0.15 * thick).rotateX(-0.08).box(0.3 * tw, 0.24 * s, 0.05, { color: dark(ac, 1.08) }).pop();
        if (a.style === 'ember_plate') g.push().translate(0, chest.y, 0.18 * thick).box(0.06, 0.14, 0.02, { color: 0xe08a2a }).pop();
        g.bone = B.spine;
        for (let i = 0; i < 2; i++) g.push().translate(0, spine.y - 0.04 - i * 0.07, 0.02).scale(tw * 1.08, 1, 0.8 * thick).cyl(0.18 * thin, 0.18 * thin, 0.06, 8, { color: i ? ac2 : ac }).pop();
        break;
      case 'samurai':
        g.push().translate(0, chest.y - 0.1 * s, 0.02).scale(tw * 1.1, 1, 0.85 * thick).cyl(0.23 * thin, 0.2 * thin, 0.34 * s, 8, { color: ac }).pop();
        for (let i = 0; i < 4; i++) g.push().translate(0, chest.y - 0.22 * s + i * 0.08 * s, 0.16 * thick).box(0.32 * tw, 0.03, 0.03, { color: ac2 }).pop();
        break;
      case 'bone':
        for (let i = 0; i < 4; i++) g.push().translate(0, chest.y - 0.16 * s + i * 0.07 * s, 0.14 * thick).scale(1, 1, 0.5).limb(-0.14 * tw, 0, 0, 0.14 * tw, 0, 0, 0.022, 0.022, 5, { color: 0xd8ccb0 }).pop();
        g.push().translate(0, chest.y - 0.06 * s, 0).scale(tw * 1.04, 1, 0.78 * thick).cyl(0.215 * thin, 0.18 * thin, 0.3 * s, 8, { color: ac }).pop();
        break;
      case 'scrap':
        g.push().translate(0, chest.y - 0.06 * s, 0).scale(tw * 1.06, 1, 0.8 * thick).cyl(0.22 * thin, 0.18 * thin, 0.3 * s, 7, { color: ac }).pop();
        g.push().translate(0.05, chest.y - 0.02 * s, 0.15 * thick).rotateZ(0.2).box(0.18, 0.16, 0.03, { color: 0x7a5a42 }).pop();
        g.push().translate(-0.07, chest.y - 0.14 * s, 0.15 * thick).rotateZ(-0.3).box(0.14, 0.1, 0.03, { color: 0x6a6a6a }).pop();
        break;
      case 'hive':
        for (let i = 0; i < 4; i++) g.push().translate(0, chest.y + 0.04 - i * 0.08 * s, 0.03).scale(tw * 1.1, 1, 0.82 * thick).cyl(0.21 - i * 0.012, 0.2 - i * 0.012, 0.07, 7, { color: i % 2 ? ac2 : ac }).pop();
        break;
    }
    if (a.shoulders) {
      for (const side of [1, -1]) {
        const L = side > 0;
        if (lost & (L ? LOST_LARM : LOST_RARM)) continue;
        const sh = J[L ? B.uaL : B.uaR];
        g.bone = B.chest;
        g.push().translate(sh.x + side * 0.02, sh.y + 0.02, sh.z).rotateZ(side * -0.5).scale(1.1, 0.5, 1.1).sphere(0.1 * w * thick, 7, 4, { color: ac2 }).pop();
      }
    }
  }

  // ---------- arms ----------
  for (const side of [1, -1]) {
    const L = side > 0;
    if (lost & (L ? LOST_LARM : LOST_RARM)) continue;
    const ua = L ? B.uaL : B.uaR, la = L ? B.laL : B.laR, hd = L ? B.handL : B.handR;
    const sh = J[ua], el = J[la], wr = J[hd];
    const ar = 0.052 * w * thin * thick;
    const upperC = sleeve >= 1 ? torsoC : robot ? skin : skin;
    const lowerC = sleeve >= 2 ? torsoC : robot ? skin : skin;
    limb(ua, sh, el, ar, ar * 0.85, vis.armour && (vis.armour.style === 'chain' || vis.armour.style === 'samurai') ? vis.armour.color2 ?? upperC : upperC);
    limb(la, el, wr, ar * 0.82, ar * 0.62, lowerC);
    if (robot) { g.bone = la; g.push().translate(el.x, el.y, el.z).sphere(ar, 6, 4, { color: jointCol }).pop(); }
    if (vis.armour && (vis.armour.style === 'plate' || vis.armour.style === 'ember_plate' || vis.armour.style === 'samurai' || vis.armour.style === 'robo')) {
      g.bone = la;
      g.push().translate((el.x + wr.x) / 2, (el.y + wr.y) / 2 + 0.03, 0.01).box(ar * 2.4, 0.16 * s, ar * 2.4, { color: vis.armour.color2 ?? vis.armour.color }).pop();
    }
    // hand
    g.bone = hd;
    const hc = kind === 'thrum' ? dark(skin, 0.85) : handC;
    g.push().translate(wr.x, wr.y - 0.06 * s, wr.z + 0.005).box(0.055 * w * thick, 0.11 * s, 0.075 * thick, { color: hc }).pop();
    if (kind === 'thrum') {
      g.push().translate(wr.x, wr.y - 0.13 * s, wr.z + 0.02).rotateX(0.3).cone(0.02, 0.07, 4, { color: dark(skin, 0.6) }).pop();
    }
  }

  // ---------- neck and head ----------
  const neck = J[B.neck], head = J[B.head];
  g.bone = B.neck;
  g.push().translate(0, neck.y - 0.04, 0).cyl(0.05 * thick * thin, 0.058 * thick * thin, (head.y - neck.y) + 0.06, 6, { color: robot ? jointCol : skin }).pop();
  g.bone = B.head;
  const hy = head.y + 0.1 * s;
  const hat = vis.head && vis.head.style !== 'none' ? vis.head : null;
  if (kind === 'thrum') {
    // insect head: long, with compound eyes, mandibles and antennae
    g.push().translate(0, hy - 0.02, 0.03).scale(0.85, 0.95, 1.25).sphere(0.11 * s, 8, 6, { color: skin }).pop();
    for (const side of [1, -1]) {
      g.push().translate(side * 0.075, hy + 0.01, 0.085).scale(0.7, 1, 0.8).sphere(0.05, 6, 4, { color: 0x14140e }).pop();
      g.push().translate(side * 0.035, hy - 0.085, 0.15).rotateX(1.3).rotateZ(-side * 0.4).cone(0.018, 0.08, 4, { color: dark(skin, 0.55) }).pop();
      if (!hat) g.limb(side * 0.03, hy + 0.09, 0.07, side * 0.12, hy + 0.3, 0.16, 0.009, 0.005, 3, { color: dark(skin, 0.6) });
    }
    if (look.race === 'thrum_soldier') g.push().translate(0, hy + 0.08, -0.02).rotateX(-0.5).scale(1, 0.4, 1.2).sphere(0.12, 6, 4, { color: dark(skin, 0.7) }).pop();
  } else if (robot) {
    const big = kind === 'construct' ? 1.25 : 1;
    g.push().translate(0, hy, 0).box(0.19 * big, 0.23 * big * s, 0.21 * big, { color: skin }).pop();
    g.push().translate(0, hy + 0.02, 0.105 * big).box(0.16 * big, 0.045, 0.02, { color: 0x1a1c20 }).pop();
    const ec: [number, number, number] = kind === 'construct' ? [4, 0.6, 0.3] : [0.6, 2.6, 4];
    if (kind === 'construct') g.push().translate(0, hy + 0.02, 0.118 * big).box(0.05, 0.03, 0.01, { color: ec }).pop();
    else for (const side of [1, -1]) g.push().translate(side * 0.045, hy + 0.02, 0.117).box(0.035, 0.02, 0.01, { color: ec }).pop();
    g.push().translate(0, hy - 0.08, 0.1).box(0.1, 0.02, 0.02, { color: dark(skin, 0.6) }).pop();
    if (!hat) g.limb(0.07, hy + 0.1, -0.03, 0.09, hy + 0.2, -0.05, 0.008, 0.006, 3, { color: 0x3a3e44 });
  } else {
    const hw = kind === 'karuk' ? 1.12 : kind === 'pale' ? 0.95 : 1;
    // skull and jaw
    g.push().translate(0, hy, 0).scale(0.105 * hw, 0.125 * s, 0.118).sphere(1, 8, 6, { color: skin }).pop();
    g.push().translate(0, hy - 0.07 * s, 0.03).box(0.15 * hw, 0.08 * s, 0.14, { color: skin }).pop();
    // nose, brow, ears
    g.push().translate(0, hy - 0.015, 0.118).rotateX(-0.25).box(0.03, 0.05, 0.035, { color: dark(skin, 0.95) }).pop();
    g.push().translate(0, hy + 0.035, 0.105).box(0.15 * hw, 0.022, 0.03, { color: dark(skin, kind === 'karuk' ? 0.8 : 0.92) }).pop();
    for (const side of [1, -1]) {
      g.push().translate(side * 0.103 * hw, hy - 0.005, -0.005).box(0.02, 0.05, 0.035, { color: dark(skin, 0.92) }).pop();
      // eyes
      const eyeC = kind === 'pale' ? 0x080808 : RACE[look.race]?.eyes ?? 0x2a2018;
      g.push().translate(side * 0.042, hy + 0.012, 0.108).box(kind === 'pale' ? 0.035 : 0.026, kind === 'pale' ? 0.03 : 0.014, 0.012, { color: eyeC }).pop();
    }
    // mouth
    g.push().translate(0, hy - 0.07, 0.1).box(0.05, 0.008, 0.01, { color: dark(skin, 0.6) }).pop();
    if (look.scars) g.push().translate(0.04, hy - 0.02, 0.112).rotateZ(0.9).box(0.07, 0.008, 0.008, { color: dark(skin, 0.7) }).pop();
    if (look.paint) g.push().translate(0, hy + 0.012, 0.113).box(0.13, 0.02, 0.006, { color: look.paint }).pop();
    if (kind === 'karuk') {
      for (const side of [1, -1]) {
        // horns curving up and back
        let px = side * 0.08, py = hy + 0.08, pz = 0.02;
        for (let k = 0; k < 4; k++) {
          const nx = px + side * 0.045, ny = py + 0.06 - k * 0.005, nz = pz - 0.04 - k * 0.012;
          g.limb(px, py, pz, nx, ny, nz, 0.035 - k * 0.007, 0.028 - k * 0.007, 5, { color: 0xd8ccb0 });
          px = nx; py = ny; pz = nz;
        }
      }
    }
    // hair
    const hairC = look.hair;
    const hs = hat && ['kabuto', 'bucket', 'helm_ember', 'hood', 'hood_white', 'mask', 'gasmask', 'turban', 'visor'].includes(hat.style) ? 0 : look.hairStyle;
    if (kind !== 'pale') {
      switch (hs) {
        case 1: // crop
          g.push().translate(0, hy + 0.025, -0.01).scale(0.112 * hw, 0.11, 0.122).sphere(1, 8, 4, { color: hairC }).pop();
          break;
        case 2: // long
          g.push().translate(0, hy + 0.025, -0.012).scale(0.115 * hw, 0.115, 0.125).sphere(1, 8, 5, { color: hairC }).pop();
          g.push().translate(0, hy - 0.1, -0.08).box(0.2 * hw, 0.24, 0.06, { color: hairC }).pop();
          break;
        case 3: // ponytail
          g.push().translate(0, hy + 0.025, -0.01).scale(0.112 * hw, 0.11, 0.122).sphere(1, 8, 4, { color: hairC }).pop();
          g.limb(0, hy + 0.02, -0.12, 0, hy - 0.18, -0.16, 0.035, 0.02, 5, { color: hairC });
          break;
        case 4: // mohawk
          g.push().translate(0, hy + 0.11, -0.01).box(0.035, 0.08, 0.22, { color: hairC }).pop();
          break;
        case 5: // topknot
          g.push().translate(0, hy + 0.02, -0.01).scale(0.108 * hw, 0.1, 0.118).sphere(1, 8, 4, { color: hairC }).pop();
          g.push().translate(0, hy + 0.14, -0.03).sphere(0.045, 6, 4, { color: hairC }).pop();
          break;
        case 6: // shaved sides, long top swept back
          g.push().translate(0, hy + 0.07, -0.02).scale(0.07, 0.07, 0.13).sphere(1, 7, 4, { color: hairC }).pop();
          break;
        case 7: // wild
          g.push().translate(0, hy + 0.04, -0.02).scale(0.14 * hw, 0.13, 0.14).ico(1, 0, { color: hairC, jitter: 0.25, seed: look.face + 3 }).pop();
          break;
        case 8: // braids
          g.push().translate(0, hy + 0.025, -0.01).scale(0.112 * hw, 0.11, 0.122).sphere(1, 8, 4, { color: hairC }).pop();
          for (const side of [1, -1]) g.limb(side * 0.08, hy - 0.02, -0.04, side * 0.09, hy - 0.26, -0.03, 0.022, 0.015, 4, { color: hairC });
          break;
      }
      // beards
      if (!look.female) {
        switch (look.beard) {
          case 1: g.push().translate(0, hy - 0.07 * s, 0.035).box(0.155 * hw, 0.085 * s, 0.14, { color: dark(skin, 0.82) }).pop(); break;
          case 2: g.push().translate(0, hy - 0.1, 0.085).box(0.13 * hw, 0.08, 0.06, { color: hairC }).pop(); break;
          case 3: g.push().translate(0, hy - 0.15, 0.09).rotateX(0.15).box(0.11 * hw, 0.17, 0.06, { color: hairC }).pop(); break;
          case 4: g.push().translate(0, hy - 0.045, 0.114).box(0.08, 0.02, 0.02, { color: hairC }).pop(); break;
        }
      }
    }
  }
  // hats and helmets
  if (hat) buildHat(g, hat.style, hat.color, hat.color2, hy, s, kind === 'karuk' ? 1.12 : kind === 'construct' ? 1.25 : 1);
  if (vis.mask) {
    g.bone = B.head;
    g.push().translate(0, hy - 0.05, 0.1).box(0.17, 0.09, 0.06, { color: vis.mask.color }).pop();
  }

  // ---------- back ----------
  if (vis.back) {
    g.bone = B.chest;
    const c = vis.back.color, bz = -0.14 * thick;
    switch (vis.back.style) {
      case 'pack':
        g.push().translate(0, chest.y - 0.08, bz - 0.06).box(0.28 * w, 0.34, 0.16, { color: c }).pop();
        g.push().translate(0, chest.y + 0.08, bz - 0.14).box(0.24 * w, 0.06, 0.05, { color: dark(c, 0.8) }).pop();
        break;
      case 'large_pack':
        g.push().translate(0, chest.y - 0.02, bz - 0.12).box(0.36 * w, 0.52, 0.26, { color: c }).pop();
        g.push().translate(0, chest.y + 0.28, bz - 0.12).rotateZ(1.57).cyl(0.07, 0.07, 0.4, 6, { color: 0x8a7a5a }).pop();
        break;
      case 'basket':
        g.push().translate(0, chest.y - 0.1, bz - 0.12).cyl(0.17, 0.13, 0.45, 8, { color: c }).pop();
        break;
      case 'bedroll':
        g.push().translate(0.2, chest.y + 0.1, bz - 0.06).rotateZ(1.57).cyl(0.08, 0.08, 0.4, 6, { color: c }).pop();
        g.push().translate(0, chest.y - 0.1, bz - 0.05).box(0.22 * w, 0.26, 0.12, { color: dark(c, 0.8) }).pop();
        break;
      case 'thief':
        g.push().translate(0, chest.y - 0.12, bz - 0.03).box(0.2 * w, 0.24, 0.09, { color: c }).pop();
        break;
      case 'medic':
        g.push().translate(0, chest.y - 0.08, bz - 0.06).box(0.26 * w, 0.3, 0.14, { color: c }).pop();
        g.push().translate(0, chest.y - 0.05, bz - 0.14).box(0.1, 0.03, 0.01, { color: 0xc04030 }).pop();
        g.push().translate(0, chest.y - 0.05, bz - 0.14).box(0.03, 0.1, 0.01, { color: 0xc04030 }).pop();
        break;
      case 'hive_pack':
        g.push().translate(0, chest.y - 0.05, bz - 0.12).scale(1, 1.2, 0.8).sphere(0.2, 8, 5, { color: c }).pop();
        break;
      case 'chest':
        g.push().translate(0, chest.y - 0.05, bz - 0.14).box(0.4 * w, 0.46, 0.28, { color: c }).pop();
        break;
    }
  }
  if (vis.shackles) {
    for (const hdb of [B.handL, B.handR]) {
      if (lost & (hdb === B.handL ? LOST_LARM : LOST_RARM)) continue;
      const wr = J[hdb];
      g.bone = hdb;
      g.push().translate(wr.x, wr.y + 0.01, wr.z).cyl(0.045, 0.045, 0.05, 6, { color: 0x3a3a3c }).pop();
    }
  }
  void r;
  const geo = g.build();
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9 * s, 0), 1.6 * s);
  return geo;
}

function buildHat(g: GeoBuilder, style: string, c: number, c2: number | undefined, hy: number, s: number, hw: number) {
  g.bone = B.head;
  const c2c = c2 ?? dark(c, 0.75);
  switch (style) {
    case 'straw':
      g.push().translate(0, hy + 0.06, 0).cone(0.3 * hw, 0.16, 10, { color: c }).pop();
      g.push().translate(0, hy + 0.05, 0).cyl(0.3 * hw, 0.3 * hw, 0.015, 10, { color: dark(c, 0.9) }).pop();
      break;
    case 'kasa':
      g.push().translate(0, hy + 0.08, 0).cone(0.26 * hw, 0.12, 8, { color: c }).pop();
      g.push().translate(0, hy + 0.06, 0).cyl(0.26 * hw, 0.25 * hw, 0.03, 8, { color: c2c }).pop();
      break;
    case 'hood':
    case 'hood_white':
      g.push().translate(0, hy + 0.01, -0.02).scale(0.13 * hw, 0.14, 0.14).sphere(1, 8, 5, { color: c }).pop();
      g.push().translate(0, hy - 0.12, -0.03).scale(1, 1, 0.85).cyl(0.13 * hw, 0.17 * hw, 0.12, 8, { color: c }).pop();
      break;
    case 'bandana':
      g.push().translate(0, hy + 0.05, -0.005).scale(0.112 * hw, 0.08, 0.124).sphere(1, 8, 4, { color: c }).pop();
      g.push().translate(0, hy + 0.02, -0.13).rotateX(0.6).box(0.04, 0.12, 0.02, { color: c }).pop();
      break;
    case 'kabuto':
      g.push().translate(0, hy + 0.03, -0.005).scale(0.13 * hw, 0.13, 0.14).sphere(1, 8, 5, { color: c }).pop();
      g.push().translate(0, hy - 0.06, -0.03).scale(1.15 * hw, 1, 1.1).cyl(0.13, 0.19, 0.1, 8, { color: c2c }).pop();
      g.push().translate(0, hy + 0.12, 0.1).rotateX(-0.4).box(0.14, 0.05, 0.01, { color: 0xc8a040 }).pop();
      break;
    case 'bucket':
      g.push().translate(0, hy - 0.1, 0).cyl(0.14 * hw, 0.14 * hw, 0.3, 8, { color: c }).pop();
      g.push().translate(0, hy + 0.01, 0.13 * hw).box(0.14, 0.02, 0.02, { color: 0x121212 }).pop();
      g.push().translate(0, hy - 0.05, 0.13 * hw).box(0.02, 0.1, 0.02, { color: 0x121212 }).pop();
      break;
    case 'skullcap':
      g.push().translate(0, hy + 0.04, 0).scale(0.115 * hw, 0.1, 0.125).sphere(1, 8, 4, { color: c }).pop();
      break;
    case 'goggles':
      g.push().translate(0, hy + 0.02, 0).scale(1, 1, 1).cyl(0.118 * hw, 0.118 * hw, 0.03, 8, { color: 0x3a2e24 }).pop();
      for (const side of [1, -1]) g.push().translate(side * 0.045, hy + 0.02, 0.115).rotateX(1.57).cyl(0.03, 0.03, 0.03, 6, { color: c }).pop();
      break;
    case 'helm_ember':
      g.push().translate(0, hy - 0.08, 0).cyl(0.13 * hw, 0.14 * hw, 0.28, 8, { color: c }).pop();
      g.push().translate(0, hy + 0.2, -0.01).cone(0.13 * hw, 0.16, 8, { color: c }).pop();
      g.push().translate(0, hy + 0.3, -0.01).box(0.02, 0.16, 0.14, { color: 0xe08a2a }).pop();
      g.push().translate(0, hy + 0.01, 0.135 * hw).box(0.12, 0.02, 0.01, { color: 0x121212 }).pop();
      break;
    case 'horncap':
      g.push().translate(0, hy + 0.045, 0).scale(0.12 * hw, 0.09, 0.13).sphere(1, 8, 4, { color: c }).pop();
      g.push().translate(0, hy + 0.1, 0.06).rotateX(-0.6).cone(0.03, 0.12, 5, { color: 0xd8ccb0 }).pop();
      break;
    case 'turban':
      for (let i = 0; i < 3; i++) g.push().translate(0, hy + 0.03 + i * 0.045, -0.01).scale(1, 0.55, 1).torus(0.105 * hw - i * 0.015, 0.035, 4, 10, Math.PI * 2, { color: i % 2 ? c2c : c }).pop();
      break;
    case 'mask':
      g.push().translate(0, hy - 0.01, 0.06).box(0.19, 0.2, 0.12, { color: c }).pop();
      for (const side of [1, -1]) g.push().translate(side * 0.042, hy + 0.012, 0.121).box(0.03, 0.015, 0.005, { color: 0x080808 }).pop();
      break;
    case 'gasmask':
      g.push().translate(0, hy - 0.04, 0.1).rotateX(1.57).cyl(0.05, 0.035, 0.08, 6, { color: c }).pop();
      g.push().translate(0, hy + 0.02, 0).cyl(0.118 * hw, 0.118 * hw, 0.03, 8, { color: 0x2a2a2a }).pop();
      for (const side of [1, -1]) g.push().translate(side * 0.045, hy + 0.02, 0.115).rotateX(1.57).cyl(0.028, 0.028, 0.02, 6, { color: 0x6aa0a0 }).pop();
      break;
    case 'crown':
      g.push().translate(0, hy + 0.07, 0).cyl(0.11 * hw, 0.11 * hw, 0.06, 8, { color: 0xd8b040 }).pop();
      break;
    case 'visor':
      g.push().translate(0, hy + 0.02, 0.02).scale(0.122 * hw, 0.13, 0.13).sphere(1, 8, 5, { color: c }).pop();
      g.push().translate(0, hy + 0.01, 0.125).box(0.16, 0.04, 0.02, { color: 0x1a1a1a }).pop();
      break;
  }
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
