// Meshes for buildings (a shell with furniture, and a roof that hides when
// someone is inside), town walls, gates, towers, fields and plaza features.
import * as THREE from 'three';
import { GeoBuilder, geoRand } from './geo';
import { WObj } from '../sim/objects';
import { STYLES } from '../content/buildings';
import type { BuildingData } from '../world/towns';

const dk = (c: number, k: number) => {
  const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
  return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
};

export const buildingMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const roofMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });

export interface BuildingMeshes { shell: THREE.Mesh; roof: THREE.Mesh | null; glow: THREE.Mesh | null; }

/** Furniture drawn into a builder at local position (x, z) with rotation. */
export function drawFurniture(g: GeoBuilder, def: string, x: number, y: number, z: number, rot: number, data: any, glow: GeoBuilder | null) {
  g.push().translate(x, y, z).rotateY(rot);
  const wood = 0x6a5038, dark = 0x3a2e22, cloth = 0x8a7a5a;
  switch (def) {
    case 'bed':
    case 'bed_fine':
    case 'bunk': {
      const fine = def === 'bed_fine';
      g.push().translate(0, 0.2, 0).box(fine ? 1.4 : 0.95, 0.3, 2.05, { color: fine ? 0x5a2e24 : wood }).pop();
      g.push().translate(0, 0.42, 0.05).box(fine ? 1.3 : 0.85, 0.14, 1.85, { color: fine ? 0xd8c8a0 : 0xb8a888 }).pop();
      g.push().translate(0, 0.52, -0.75).box(fine ? 1.0 : 0.6, 0.1, 0.3, { color: 0xe0d8c8 }).pop();
      g.push().translate(0, 0.5, 0.4).box(fine ? 1.32 : 0.87, 0.06, 0.95, { color: fine ? 0x8a2e3a : 0x6a7a5a }).pop();
      if (def === 'bunk') {
        for (const [px, pz] of [[-0.45, -1], [0.45, -1], [-0.45, 1], [0.45, 1]]) g.push().translate(px, 0, pz).cyl(0.04, 0.04, 1.9, 4, { color: wood }).pop();
        g.push().translate(0, 1.35, 0).box(0.95, 0.12, 2.05, { color: wood }).pop();
        g.push().translate(0, 1.47, 0.05).box(0.85, 0.12, 1.85, { color: 0xb8a888 }).pop();
      }
      break;
    }
    case 'bedroll':
      g.push().translate(0, 0.06, 0).box(0.8, 0.12, 1.9, { color: cloth }).pop();
      g.push().translate(0, 0.13, -0.7).box(0.6, 0.1, 0.3, { color: 0xc8b898 }).pop();
      break;
    case 'counter':
    case 'bar_counter':
    case 'desk': {
      const len = data?.len ?? 2;
      g.push().translate(0, 0.5, 0).box(len, 1.0, 0.75, { color: def === 'bar_counter' ? 0x5a3a26 : wood }).pop();
      g.push().translate(0, 1.03, 0).box(len + 0.1, 0.07, 0.85, { color: dk(wood, 1.25) }).pop();
      if (def === 'bar_counter') for (let i = 0; i < 4; i++) g.push().translate(-len / 2 + 0.4 + i * (len - 0.8) / 3, 1.07, 0.1).cyl(0.05, 0.05, 0.18, 6, { color: 0x8a6a3a }).pop();
      break;
    }
    case 'table':
      g.push().translate(0, 0.72, 0).box(1.2, 0.07, 0.9, { color: dk(wood, 1.15) }).pop();
      for (const [px, pz] of [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]]) g.push().translate(px, 0, pz).block(0.07, 0.7, 0.07, { color: wood }).pop();
      g.push().translate(0.2, 0.79, 0.1).cyl(0.05, 0.04, 0.12, 6, { color: 0x9a8a6a }).pop();
      break;
    case 'longtable': {
      const len = data?.len ?? 5;
      g.push().translate(0, 0.74, 0).box(1.1, 0.08, len, { color: dk(wood, 1.1) }).pop();
      for (let i = 0; i < 3; i++) g.push().translate(0, 0, -len / 2 + 0.3 + i * (len - 0.6) / 2).block(0.9, 0.7, 0.1, { color: wood }).pop();
      break;
    }
    case 'stool':
      g.cyl(0.2, 0.18, 0.5, 6, { color: wood });
      break;
    case 'chest':
    case 'chest_fine':
      g.push().block(0.9, 0.55, 0.6, { color: def === 'chest_fine' ? 0x5a2e24 : wood }).pop();
      g.push().translate(0, 0.55, 0).box(0.92, 0.08, 0.62, { color: def === 'chest_fine' ? 0xc8a040 : 0x4a3a2a }).pop();
      g.push().translate(0, 0.35, 0.31).box(0.12, 0.14, 0.03, { color: 0x9a9080 }).pop();
      break;
    case 'crate':
    case 'crate_old':
      g.block(1.1, 0.9, 1.1, { color: def === 'crate_old' ? 0x6a6a66 : 0x8a6a44, grad: 0.2 });
      g.push().translate(0, 0.45, 0.56).box(1.12, 0.1, 0.02, { color: 0x5a4430 }).pop();
      break;
    case 'barrel':
      g.cyl(0.38, 0.38, 1.0, 8, { color: 0x7a5a38, grad: 0.3 });
      for (const hy of [0.15, 0.85]) g.push().translate(0, hy, 0).cyl(0.4, 0.4, 0.05, 8, { color: 0x3a3430 }).pop();
      break;
    case 'shelf':
      g.push().block(1.8, 1.9, 0.45, { color: wood }).pop();
      for (let i = 0; i < 3; i++) for (let k = 0; k < 4; k++) {
        const c = [0x8a4a3a, 0x6a8a5a, 0xc8b070, 0x5a6a8a][(i + k) % 4];
        g.push().translate(-0.6 + k * 0.4, 0.35 + i * 0.6, 0.12).box(0.25, 0.3, 0.25, { color: c }).pop();
      }
      break;
    case 'weapon_rack':
      g.push().block(1.8, 0.1, 0.3, { color: wood }).pop();
      g.push().translate(0, 1.4, 0).box(1.8, 0.1, 0.3, { color: wood }).pop();
      for (let i = 0; i < 5; i++) g.push().translate(-0.7 + i * 0.35, 0.1, 0).cyl(0.02, 0.02, 1.6, 3, { color: 0xb0b0b0 }).pop();
      break;
    case 'cage': {
      const bar = 0x3a3a3c;
      g.push().block(1.9, 0.1, 1.9, { color: 0x2a2a2a }).pop();
      g.push().translate(0, 2.1, 0).box(1.9, 0.1, 1.9, { color: bar }).pop();
      for (let i = 0; i < 6; i++) for (const side of [0, 1, 2, 3]) {
        const t = -0.9 + i * 0.36;
        const [px, pz] = side === 0 ? [t, -0.92] : side === 1 ? [t, 0.92] : side === 2 ? [-0.92, t] : [0.92, t];
        g.push().translate(px, 0, pz).cyl(0.025, 0.025, 2.1, 4, { color: bar }).pop();
      }
      break;
    }
    case 'altar':
      g.push().block(2.4, 1.0, 1.1, { color: 0xd8d0c0 }).pop();
      g.push().translate(0, 1.0, 0).cyl(0.35, 0.25, 0.4, 8, { color: 0xb8a070 }).pop();
      if (glow) { glow.push().translate(x, y + 1.55, z).ico(0.25, 0, { color: [4, 1.6, 0.4] }).pop(); }
      break;
    case 'pew': {
      const len = data?.len ?? 3;
      g.push().translate(0, 0.45, 0).box(len, 0.08, 0.5, { color: wood }).pop();
      g.push().translate(0, 0.8, -0.22).box(len, 0.5, 0.06, { color: wood }).pop();
      for (const px of [-len / 2 + 0.2, len / 2 - 0.2]) g.push().translate(px, 0, 0).block(0.08, 0.45, 0.45, { color: dark }).pop();
      break;
    }
    case 'brazier':
      g.cyl(0.35, 0.2, 1.0, 7, { color: 0x4a4038 });
      if (glow) glow.push().translate(x, y + 1.1, z).ico(0.3, 0, { color: [5, 1.8, 0.3] }).pop();
      break;
    case 'throne':
      g.push().block(1.1, 0.6, 1.0, { color: 0x5a3a26 }).pop();
      g.push().translate(0, 0.6, -0.42).box(1.1, 1.6, 0.16, { color: 0x5a3a26 }).pop();
      g.push().translate(0, 1.5, -0.42).box(1.3, 0.14, 0.2, { color: 0xc8a040 }).pop();
      g.push().translate(0, 0.62, 0.05).box(0.9, 0.06, 0.8, { color: 0x8a2a2a }).pop();
      break;
    case 'rug':
      g.push().translate(0, 0.03, 0).box(data?.w ?? 3, 0.02, data?.d ?? 5, { color: 0x7a2a26 }).pop();
      g.push().translate(0, 0.04, 0).box((data?.w ?? 3) * 0.7, 0.02, (data?.d ?? 5) * 0.85, { color: 0xa8683a }).pop();
      break;
    case 'workbench':
      g.push().translate(0, 0.85, 0).box(2, 0.1, 0.9, { color: dk(wood, 1.1) }).pop();
      for (const [px, pz] of [[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]]) g.push().translate(px, 0, pz).block(0.1, 0.85, 0.1, { color: wood }).pop();
      g.push().translate(-0.4, 0.92, 0).box(0.4, 0.06, 0.2, { color: 0x7a7a7a }).pop();
      break;
    case 'anvil':
      g.push().block(0.4, 0.5, 0.3, { color: 0x3a3a3a }).pop();
      g.push().translate(0, 0.55, 0).box(0.8, 0.18, 0.32, { color: 0x4a4a4c }).pop();
      break;
    case 'lamp':
      g.cyl(0.04, 0.05, 2.2, 5, { color: dark });
      if (glow) glow.push().translate(x, y + 2.2, z).box(0.22, 0.28, 0.22, { color: [3.5, 2.4, 1.1] }).pop();
      break;
    case 'post':
      g.cyl(0.12, 0.14, 1.6, 6, { color: wood });
      g.push().translate(0, 1.2, 0.15).torus(0.08, 0.02, 4, 8, Math.PI * 2, { color: 0x3a3a3a }).pop();
      break;
    case 'firepit':
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.push().translate(Math.sin(a) * 0.8, 0.1, Math.cos(a) * 0.8).dodeca(0.22, { color: 0x6a6660 }).pop(); }
      for (let i = 0; i < 3; i++) g.push().translate(0, 0.12, 0).rotateY(i * 1.05).limb(-0.5, 0, 0, 0.5, 0.25, 0, 0.07, 0.07, 5, { color: 0x3a2a1a }).pop();
      if (glow) glow.push().translate(x, y + 0.45, z).ico(0.35, 0, { color: [5, 1.6, 0.3] }).pop();
      break;
    case 'well':
      g.cyl(1.3, 1.35, 0.9, 12, { color: 0x8a8274 });
      g.push().translate(0, 0.9, 0).cyl(1.0, 1.0, 0.05, 12, { color: 0x1a1a18 }).pop();
      for (const sx of [-1.1, 1.1]) g.push().translate(sx, 0.8, 0).cyl(0.07, 0.07, 1.8, 5, { color: wood }).pop();
      g.push().translate(0, 2.6, 0).rotateZ(Math.PI / 2).cyl(0.07, 0.07, 2.4, 5, { color: wood }).pop();
      g.push().translate(0, 2.9, 0).rotateX(Math.PI / 2).scale(1, 1, 1).box(2.8, 0.1, 1.6, { color: 0x7a5a3a }).pop();
      break;
    case 'statue':
      g.push().block(2.4, 1.2, 2.4, { color: 0x9a948a }).pop();
      g.push().translate(0, 1.2, 0).cyl(0.35, 0.45, 2.2, 7, { color: 0xb8b0a0 }).pop();
      g.push().translate(0, 3.6, 0).sphere(0.4, 7, 5, { color: 0xb8b0a0 }).pop();
      g.push().translate(0.6, 2.8, 0).rotateZ(-0.6).cyl(0.1, 0.12, 1.1, 5, { color: 0xb8b0a0 }).pop();
      break;
    case 'pyre':
      g.cyl(2.4, 2.6, 0.9, 12, { color: 0xd8d0c0 });
      g.push().translate(0, 0.9, 0).cyl(1.8, 2.2, 0.6, 12, { color: 0x4a4038 }).pop();
      if (glow) { glow.push().translate(x, y + 1.9, z).scale(1, 1.6, 1).ico(1.3, 1, { color: [6, 2.2, 0.4] }).pop(); }
      break;
    case 'arena': {
      const r = data?.r ?? 12;
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.push().translate(Math.sin(a) * r, 0, Math.cos(a) * r).cyl(0.2, 0.25, 1.4, 5, { color: 0xd8ccb0 }).pop(); }
      g.push().translate(0, 0.02, 0).cyl(r - 0.5, r - 0.5, 0.03, 20, { color: 0x9a7a5a }).pop();
      break;
    }
    case 'totem':
      g.cyl(0.5, 0.8, 5, 8, { color: 0xb89038 });
      g.push().translate(0, 5, 0).ico(1.1, 1, { color: 0xd8b04a, jitter: 0.2, seed: 3 }).pop();
      break;
    case 'pillar':
      g.cyl(0.9, 1.1, 7, 6, { color: 0x5a6068 });
      if (glow) glow.push().translate(x, y + 5, z).box(0.3, 3, 2.3, { color: [0.6, 2.6, 4] }).pop();
      break;
    case 'fire':
      if (glow) glow.push().translate(x, y + 0.45, z).ico(0.4, 0, { color: [5, 1.6, 0.3] }).pop();
      for (let i = 0; i < 3; i++) g.push().translate(0, 0.12, 0).rotateY(i * 1.05).limb(-0.5, 0, 0, 0.5, 0.25, 0, 0.07, 0.07, 5, { color: 0x3a2a1a }).pop();
      break;
    case 'research':
      g.push().translate(0, 0.85, 0).box(2, 0.1, 0.9, { color: 0x4a5058 }).pop();
      for (const [px, pz] of [[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]]) g.push().translate(px, 0, pz).block(0.1, 0.85, 0.1, { color: 0x3a3e44 }).pop();
      g.push().translate(-0.5, 0.9, -0.1).box(0.5, 0.35, 0.35, { color: 0x6a7078 }).pop();
      if (glow) glow.push().translate(x, y + 1.2, z).box(0.3, 0.2, 0.02, { color: [0.6, 2.6, 4] }).pop();
      break;
    case 'wreckage': {
      const sc = data?.s ?? 1.5;
      g.push().scale(sc).rotateZ(0.3).translate(0, 0.4, 0).box(3, 0.15, 1.6, { color: 0x6a5e56 }).pop();
      g.push().scale(sc).translate(1.2, 0.8, 0.3).rotateX(0.6).rotateZ(-0.4).box(0.2, 1.8, 1.2, { color: 0x7a5238 }).pop();
      g.push().scale(sc).translate(-1, 0.3, -0.4).rotateY(0.7).limb(0, 0, 0, 2, 0.4, 0, 0.18, 0.18, 6, { color: 0x5a5a5e }).pop();
      break;
    }
    case 'standing_stone':
      g.push().rotateZ(0.06).scale(1, 1, 0.6).cyl(0.7, 0.9, 4.5, 5, { color: 0x8a8274, grad: 0.3 }).pop();
      break;
    case 'bones_big':
      g.push().rotateY(0.4).limb(-1.5, 0.2, 0, 1.5, 0.3, 0, 0.3, 0.25, 6, { color: 0xe0d6c0 }).pop();
      break;
    default:
      g.block(0.6, 0.6, 0.6, { color: wood });
  }
  g.pop();
}

function wallBox(g: GeoBuilder, x0: number, x1: number, z: number, y0: number, y1: number, t: number, col: number, horiz: boolean, st: string, rnd: () => number) {
  const len = x1 - x0;
  if (len <= 0.02 || y1 - y0 <= 0.02) return;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  if (st === 'shanty' && len > 1.4) {
    // patchwork panels
    const n = Math.max(1, Math.round(len / 1.3));
    for (let i = 0; i < n; i++) {
      const a = x0 + (len * i) / n, b = x0 + (len * (i + 1)) / n;
      const c = dk(col, 0.85 + rnd() * 0.3);
      const hh = y1 - y0 - (rnd() < 0.3 ? rnd() * 0.3 : 0);
      if (horiz) g.push().translate((a + b) / 2, y0 + hh / 2, z).box(b - a + 0.02, hh, t, { color: c }).pop();
      else g.push().translate(z, y0 + hh / 2, (a + b) / 2).box(t, hh, b - a + 0.02, { color: c }).pop();
    }
    return;
  }
  if (horiz) g.push().translate(cx, cy, z).box(len, y1 - y0, t, { color: col }).pop();
  else g.push().translate(z, cy, cx).box(t, y1 - y0, len, { color: col }).pop();
}

/** Builds the meshes for a building from its data and furniture. */
export function buildBuilding(b: WObj, furniture: WObj[]): BuildingMeshes {
  const d = b.data as BuildingData;
  const st = STYLES[d.style] ?? STYLES.shanty;
  const rnd = geoRand(d.seed);
  const g = new GeoBuilder();
  const glow = new GeoBuilder();
  const hw = d.w / 2, hd = d.d / 2, H = d.h, t = Math.max(0.2, st.thick);
  const wall = d.wallCol, trim = st.trim;
  const ruin = d.roof === 'broken';
  const lift = d.stilts;
  // stilts and foundation
  if (lift > 0) {
    for (const [px, pz] of [[-hw + 0.3, -hd + 0.3], [hw - 0.3, -hd + 0.3], [-hw + 0.3, hd - 0.3], [hw - 0.3, hd - 0.3], [0, -hd + 0.3], [0, hd - 0.3]]) g.push().translate(px, -lift - 3, pz).cyl(0.15, 0.18, lift + 3, 5, { color: 0x4a3a2a }).pop();
    // ramp to the door
    for (const dr of d.doors) if (dr.side === 's') g.push().translate(dr.off, -lift / 2, hd + 1.4).rotateX(-Math.atan2(lift, 2.8)).box(dr.w, 0.12, Math.hypot(lift, 2.8), { color: 0x6a5a40 }).pop();
  } else g.push().translate(0, -1.5, 0).box(d.w + 0.2, 3, d.d + 0.2, { color: dk(st.floor, 0.8) }).pop();
  g.push().translate(0, 0.02, 0).box(d.w - 0.1, 0.06, d.d - 0.1, { color: st.floor }).pop();

  const round = st.round && d.use !== 'stall';
  if (d.use === 'stall') {
    for (const [px, pz] of [[-hw + 0.2, -hd + 0.2], [hw - 0.2, -hd + 0.2], [-hw + 0.2, hd - 0.2], [hw - 0.2, hd - 0.2]]) g.push().translate(px, 0, pz).cyl(0.07, 0.08, 2.6, 5, { color: trim }).pop();
  } else if (d.use === 'pen') {
    // fence
    const posts = Math.round((d.w + d.d) * 2 / 1.2);
    for (let i = 0; i < posts; i++) {
      const p = (i / posts) * (d.w + d.d) * 2;
      let px, pz;
      if (p < d.w) { px = -hw + p; pz = -hd; } else if (p < d.w + d.d) { px = hw; pz = -hd + (p - d.w); } else if (p < 2 * d.w + d.d) { px = hw - (p - d.w - d.d); pz = hd; } else { px = -hw; pz = hd - (p - 2 * d.w - d.d); }
      g.push().translate(px, 0, pz).cyl(0.07, 0.09, 1.8, 4, { color: 0x5a4a36 }).pop();
    }
    for (const yy of [0.6, 1.4]) {
      g.push().translate(0, yy, -hd).box(d.w, 0.08, 0.06, { color: 0x6a5840 }).pop();
      g.push().translate(0, yy, hd).box(d.w, 0.08, 0.06, { color: 0x6a5840 }).pop();
      g.push().translate(-hw, yy, 0).box(0.06, 0.08, d.d, { color: 0x6a5840 }).pop();
      g.push().translate(hw, yy, 0).box(0.06, 0.08, d.d, { color: 0x6a5840 }).pop();
    }
  } else if (round) {
    // round walls with a doorway gap on the front
    const R = Math.min(hw, hd), seg = 14;
    const wallTop = d.style === 'hive' || d.style === 'hive_dead' ? 1.3 : H * 0.8;
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      if (Math.abs(Math.atan2(Math.sin(am), Math.cos(am))) < 0.26) continue; // door at +z
      const x0 = Math.sin(a0) * R, z0 = Math.cos(a0) * R, x1 = Math.sin(a1) * R, z1 = Math.cos(a1) * R;
      g.push().translate((x0 + x1) / 2, wallTop / 2, (z0 + z1) / 2).rotateY(am).box(Math.hypot(x1 - x0, z1 - z0) + 0.05, wallTop, t, { color: dk(wall, 0.9 + rnd() * 0.15) }).pop();
    }
  } else {
    // four walls with doorways and a lintel above each
    const doorH = 2.4;
    const sides: ['s' | 'n' | 'e' | 'w', number, number, boolean][] = [['s', d.w, hd - t / 2, true], ['n', d.w, -hd + t / 2, true], ['e', d.d, hw - t / 2, false], ['w', d.d, -hw + t / 2, false]];
    for (const [side, len, fixed, horiz] of sides) {
      const doors = d.doors.filter((x) => x.side === side).sort((a, b) => a.off - b.off);
      let from = -len / 2;
      const topFor = () => (ruin ? H * (0.3 + rnd() * 0.7) : H);
      for (const dr of doors) {
        wallBox(g, from, dr.off - dr.w / 2, fixed, 0, topFor(), t, wall, horiz, d.style, rnd);
        if (!ruin) wallBox(g, dr.off - dr.w / 2, dr.off + dr.w / 2, fixed, doorH, H, t, wall, horiz, d.style, rnd);
        // door frame
        for (const e of [dr.off - dr.w / 2, dr.off + dr.w / 2]) {
          if (horiz) g.push().translate(e, doorH / 2, fixed).box(0.12, doorH, t + 0.06, { color: trim }).pop();
          else g.push().translate(fixed, doorH / 2, e).box(t + 0.06, doorH, 0.12, { color: trim }).pop();
        }
        from = dr.off + dr.w / 2;
      }
      wallBox(g, from, len / 2, fixed, 0, topFor(), t, wall, horiz, d.style, rnd);
      // windows (dark insets), lit at night
      if (!ruin && d.use !== 'tower' && len > 6) {
        const nw = Math.floor(len / 4.5);
        for (let i = 0; i < nw; i++) {
          const wx = -len / 2 + (i + 0.5) * (len / nw);
          if (doors.some((dr) => Math.abs(dr.off - wx) < dr.w)) continue;
          const out = fixed + Math.sign(fixed) * (t / 2 + 0.01);
          if (horiz) g.push().translate(wx, 1.7, out).box(0.8, 0.7, 0.02, { color: 0x1a1612 }).pop();
          else g.push().translate(out, 1.7, wx).box(0.02, 0.7, 0.8, { color: 0x1a1612 }).pop();
          if (rnd() < 0.5) {
            if (horiz) glow.push().translate(wx, 1.7, out + Math.sign(fixed) * 0.005).box(0.6, 0.5, 0.01, { color: [1.2, 0.8, 0.35] }).pop();
            else glow.push().translate(out + Math.sign(fixed) * 0.005, 1.7, wx).box(0.01, 0.5, 0.6, { color: [1.2, 0.8, 0.35] }).pop();
          }
        }
      }
    }
    // corner posts and beams
    if (!ruin && (d.style === 'concord' || d.style === 'swamp' || d.style === 'shanty' || d.style === 'stone')) {
      for (const [px, pz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) g.push().translate(px, 0, pz).block(0.3, H, 0.3, { color: trim }).pop();
      if (d.style === 'concord') {
        g.push().translate(0, H - 0.15, hd).box(d.w + 0.1, 0.25, t + 0.1, { color: trim }).pop();
        g.push().translate(0, H - 0.15, -hd).box(d.w + 0.1, 0.25, t + 0.1, { color: trim }).pop();
        g.push().translate(0, 0.25, hd + 0.02).box(d.w, 0.5, t + 0.04, { color: dk(wall, 0.75) }).pop();
      }
    }
    if (st.beams) for (let i = 0; i < Math.floor(d.w / 1.4); i++) {
      g.push().translate(-hw + 0.7 + i * 1.4, H - 0.35, hd + 0.3).rotateX(Math.PI / 2).cyl(0.09, 0.09, 0.8, 5, { color: trim }).pop();
    }
    if (d.style === 'hollow') {
      g.push().translate(0, H * 0.55, hd + 0.02).box(d.w * 0.9, 0.08, t, { color: 0x3a3e44 }).pop();
      glow.push().translate(0, H * 0.55, hd + t / 2 + 0.03).box(d.w * 0.85, 0.05, 0.01, { color: [0.5, 2.2, 3.5] }).pop();
    }
    if (d.style === 'ember') {
      g.push().translate(0, H - 0.4, hd + 0.01).box(d.w, 0.18, t + 0.02, { color: 0xc86a2a }).pop();
    }
  }
  // sign board over the door
  if (d.shop && d.use !== 'stall' && !round) {
    const dr = d.doors[0];
    if (dr) {
      const sc = d.shop === 'bar' ? 0x7a3a24 : d.shop === 'weapons' ? 0x5a5a60 : d.shop === 'armour' ? 0x4a5a4a : d.shop === 'robotics' || d.shop === 'tech' ? 0x3a5a6a : d.shop === 'slaves' ? 0x3a2a2a : 0x6a5030;
      g.push().translate(dr.off, 2.9, hd + t / 2 + 0.1).box(1.8, 0.6, 0.08, { color: sc }).pop();
      g.push().translate(dr.off, 2.9, hd + t / 2 + 0.15).box(1.3, 0.2, 0.02, { color: 0xd8c8a0 }).pop();
      glow.push().translate(dr.off + 1.2, 2.5, hd + t / 2 + 0.25).box(0.18, 0.24, 0.18, { color: [3.5, 2.2, 0.9] }).pop();
    }
  }
  // furniture
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  for (const f of furniture) {
    const dx = f.x - b.x, dz = f.z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    drawFurniture(g, f.def, lx, 0.05, lz, f.rot - b.rot, f.data, glow);
  }
  const shell = new THREE.Mesh(g.build(), buildingMat);
  shell.castShadow = true;
  shell.receiveShadow = true;
  // roof
  let roof: THREE.Mesh | null = null;
  if (!ruin && d.roof !== 'none') {
    const r = new GeoBuilder();
    const rc = d.roofCol;
    const ov = d.style === 'concord' ? 1.1 : d.style === 'shanty' ? 0.5 : 0.35;
    switch (round ? (st.roofType === 'cone' ? 'cone' : 'dome') : d.use === 'stall' ? 'shed' : d.roof) {
      case 'flat':
        r.push().translate(0, H + 0.12, 0).box(d.w + 0.1, 0.24, d.d + 0.1, { color: rc }).pop();
        if (st.parapet) for (const [px, pz, w, dd] of [[0, hd, d.w + 0.1, t], [0, -hd, d.w + 0.1, t], [hw, 0, t, d.d], [-hw, 0, t, d.d]] as [number, number, number, number][]) r.push().translate(px, H + 0.5, pz).box(w, 0.8, dd, { color: dk(wall, 0.95) }).pop();
        if (d.style === 'karuk') for (const [px, pz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) r.push().translate(px, H + 0.9, pz).rotateZ(px > 0 ? -0.4 : 0.4).cone(0.12, 0.9, 5, { color: 0xd8ccb0 }).pop();
        break;
      case 'shed': {
        const rise = d.w * 0.12 + 0.3;
        r.push().translate(0, H + rise / 2 + (d.use === 'stall' ? -H + 2.7 : 0), 0).rotateX(Math.atan2(rise, d.d) * (d.use === 'stall' ? -1 : 1)).box(d.w + ov * 2, 0.12, Math.hypot(d.d, rise) + ov * 2, { color: rc }).pop();
        if (st.corrugated) for (let i = 0; i < Math.floor(d.w / 0.8); i++) r.push().translate(-hw + i * 0.8, H + rise / 2 + 0.08, 0).rotateX(Math.atan2(rise, d.d)).box(0.08, 0.06, Math.hypot(d.d, rise) + ov * 2, { color: dk(rc, 0.8) }).pop();
        break;
      }
      case 'gable':
      case 'tent': {
        const rise = d.roof === 'tent' ? Math.min(d.w, d.d) * 0.55 : d.w * 0.35;
        const along = d.w >= d.d;
        const span = along ? d.d : d.w, len = along ? d.w : d.d;
        const ang = Math.atan2(rise, span / 2);
        const slope = Math.hypot(span / 2, rise) + ov;
        const base = d.roof === 'tent' ? 0.3 : H;
        for (const sd of [-1, 1]) {
          r.push().translate(0, base + rise / 2, 0);
          if (along) r.translate(0, 0, (sd * span) / 4).rotateX(sd * ang);
          else r.translate((sd * span) / 4, 0, 0).rotateZ(-sd * ang);
          r.box(along ? len + ov * 2 : slope, 0.12, along ? slope : len + ov * 2, { color: dk(rc, sd > 0 ? 1 : 0.88) });
          r.pop();
        }
        // gable ends
        for (const e of [-1, 1]) {
          r.push().translate(along ? (e * len) / 2 : 0, base, along ? 0 : (e * len) / 2).rotateY(along ? Math.PI / 2 : 0);
          const tri = new THREE.BufferGeometry();
          tri.setAttribute('position', new THREE.Float32BufferAttribute([-span / 2, 0, 0, span / 2, 0, 0, 0, rise, 0, span / 2, 0, 0, -span / 2, 0, 0, 0, rise, 0], 3));
          tri.computeVertexNormals();
          r.add(tri, { color: d.roof === 'tent' ? rc : wall });
          r.pop();
        }
        break;
      }
      case 'hip': {
        const rise = Math.min(d.w, d.d) * 0.38;
        const ex = hw + ov, ez = hd + ov;
        const ridge = Math.max(0, ex - ez);
        const P = (x: number, y: number, z: number) => [x, H + y, z];
        const quads: number[][][] = [
          [P(-ex, 0, ez), P(ex, 0, ez), P(ridge, rise, 0), P(-ridge, rise, 0)],
          [P(ex, 0, -ez), P(-ex, 0, -ez), P(-ridge, rise, 0), P(ridge, rise, 0)],
          [P(ex, 0, ez), P(ex, 0, -ez), P(ridge, rise, 0), P(ridge, rise, 0)],
          [P(-ex, 0, -ez), P(-ex, 0, ez), P(-ridge, rise, 0), P(-ridge, rise, 0)],
        ];
        const pos: number[] = [];
        for (const q of quads) pos.push(...q[0], ...q[1], ...q[2], ...q[0], ...q[2], ...q[3]);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        r.add(geo, { color: rc });
        // upturned eave tips and a ridge beam
        if (st.eaves) for (const [px, pz] of [[-ex, -ez], [ex, -ez], [-ex, ez], [ex, ez]]) r.push().translate(px, H + 0.05, pz).rotateY(Math.atan2(px, pz)).rotateX(-0.9).cone(0.12, 0.7, 4, { color: dk(rc, 0.8) }).pop();
        r.push().translate(0, H + rise + 0.05, 0).box(ridge * 2 + 0.3, 0.15, 0.25, { color: dk(rc, 0.7) }).pop();
        break;
      }
      case 'dome': {
        const R = Math.min(hw, hd) + (round ? 0.4 : 0.1);
        const top = round ? (d.style === 'hive' || d.style === 'hive_dead' ? 1.2 : H * 0.8) : H;
        if (!round) r.push().translate(0, H, 0).cyl(R * 0.95, R, 0.4, 16, { color: dk(wall, 0.95) }).pop();
        r.push().translate(0, top + (round ? 0 : 0.35), 0).scale(round ? hw + 0.4 : R * 0.95, round ? (d.style.startsWith('hive') ? d.h * 0.9 : R * 0.8) : R * 0.8, round ? hd + 0.4 : R * 0.95);
        const dome = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
        r.add(dome.toNonIndexed(), { color: rc });
        r.pop();
        if (d.style === 'ember') r.push().translate(0, top + R * 0.8 + 0.2, 0).cone(0.25, 1.4, 6, { color: 0xd8b040 }).pop();
        if (d.style.startsWith('hive')) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; r.push().translate(Math.sin(a) * hw * 0.6, top + d.h * 0.5, Math.cos(a) * hd * 0.6).scale(1, 0.6, 1).sphere(0.5, 6, 3, { color: dk(rc, 0.75) }).pop(); }
        break;
      }
      case 'cone': {
        const R = Math.min(hw, hd) + 0.6;
        r.push().translate(0, round ? H * 0.8 : H, 0).cone(R, R * (d.style === 'hide' ? 1.6 : 0.9), 12, { color: rc }).pop();
        if (d.style === 'hide') for (let i = 0; i < 3; i++) r.push().translate(0, H * 0.8 + R * 1.5, 0).rotateY(i * 2.1).rotateZ(0.3).cyl(0.04, 0.04, 1.2, 4, { color: 0xd8ccb0 }).pop();
        break;
      }
    }
    if (d.floors > 1 && d.roof !== 'dome') {
      // decorative upper storey inside the roof mesh so it hides with it
      r.push().translate(0, H + 0.1, 0).block(d.w * 0.7, H * 0.8, d.d * 0.7, { color: dk(wall, 1.05) }).pop();
    }
    roof = new THREE.Mesh(r.build(), roofMat);
    roof.castShadow = true;
  }
  const glowMesh = glow.vertexCount ? new THREE.Mesh(glow.build(), glowMat) : null;
  return { shell, roof, glow: glowMesh };
}

/** Town wall segment, gate or tower. */
export function buildWallPiece(o: WObj): THREE.Mesh {
  const g = new GeoBuilder();
  const d = o.data;
  const st = d.style as string;
  if (o.kind === 'wall') {
    const len = d.len, h = d.h, t = d.thick;
    const rnd = geoRand(o.id * 31);
    switch (st) {
      case 'stone':
        g.push().translate(0, h / 2 - 1, 0).box(t, h + 2, len + 0.2, { color: 0x9a9284 }).pop();
        for (let i = 0; i < Math.floor(len / 1.6); i++) g.push().translate(0, h + 0.45, -len / 2 + 0.8 + i * 1.6).box(t + 0.1, 0.9, 0.8, { color: 0x8a8274 }).pop();
        g.push().translate(0, 0.4, 0).box(t + 0.3, 0.8, len + 0.2, { color: 0x7a7266 }).pop();
        break;
      case 'palisade':
      case 'bone':
        for (let i = 0; i < Math.floor(len / 0.45); i++) {
          const zz = -len / 2 + 0.22 + i * 0.45, hh = h * (0.85 + rnd() * 0.3);
          g.push().translate(0, -1, zz).cyl(0.22, 0.24, hh + 1, 5, { color: st === 'bone' ? 0xd8ccb0 : dk(0x6a5238, 0.85 + rnd() * 0.3) }).pop();
          g.push().translate(0, hh, zz).cone(0.22, 0.5, 5, { color: st === 'bone' ? 0xe8e0d0 : 0x5a4430 }).pop();
        }
        break;
      case 'fence':
        for (let i = 0; i <= Math.floor(len / 2); i++) g.push().translate(0, 0, -len / 2 + i * 2).cyl(0.06, 0.08, h, 4, { color: 0x6a5238 }).pop();
        for (const y of [0.5, 1.1]) g.push().translate(0, y, 0).box(0.06, 0.08, len, { color: 0x7a6040 }).pop();
        break;
      case 'metal':
        g.push().translate(0, h / 2 - 1, 0).box(t, h + 2, len + 0.1, { color: 0x5a6068 }).pop();
        for (let i = 0; i < Math.floor(len / 3); i++) g.push().translate(0, h / 2, -len / 2 + 1.5 + i * 3).box(t + 0.08, h, 0.12, { color: 0x3a3e44 }).pop();
        break;
      case 'wax':
        g.push().translate(0, h / 2 - 1, 0).scale(1, 1, 1).box(t, h + 2, len + 0.3, { color: 0xb89038 }).pop();
        break;
      default: // scrap
        for (let i = 0; i < Math.ceil(len / 1.5); i++) {
          const zz = -len / 2 + 0.75 + i * 1.5;
          const hh = h * (0.8 + rnd() * 0.35);
          g.push().translate((rnd() - 0.5) * 0.2, hh / 2 - 0.8, zz).rotateX((rnd() - 0.5) * 0.08).box(t * 0.4, hh + 1.6, 1.55, { color: [0x7a5a44, 0x6a6a68, 0x8a6a4a, 0x5a4a3e][Math.floor(rnd() * 4)] }).pop();
        }
    }
  } else if (o.kind === 'gate') {
    const w = d.w;
    const h = st === 'fence' ? 2.2 : st === 'stone' ? 7 : 5.5;
    const col = st === 'stone' ? 0x8a8274 : st === 'metal' ? 0x4a5058 : st === 'bone' ? 0xd8ccb0 : 0x6a5238;
    for (const sd of [-1, 1]) g.push().translate(0, -1, sd * (w / 2 + 0.6)).block(1.6, h + 1, 1.2, { color: col }).pop();
    if (st !== 'fence') g.push().translate(0, h - 0.4, 0).box(1.6, 0.8, w + 2.4, { color: col }).pop();
    if (!o.open) g.push().translate(0, 0, 0).block(0.25, h - 1, w, { color: 0x4a3a2a }).pop();
    else for (const sd of [-1, 1]) g.push().translate(0.9, 0, sd * (w / 2 - 0.1)).rotateY(sd * 1.3).translate(0, 0, -sd * w / 4).block(0.2, h - 1.2, w / 2, { color: 0x4a3a2a }).pop();
    if (st === 'stone' || st === 'palisade' || st === 'scrap') for (const sd of [-1, 1]) g.push().translate(-0.9, h * 0.75, sd * (w / 2 + 0.6)).box(0.1, 1.4, 0.8, { color: 0x8a3a24 }).pop();
  } else {
    // tower
    const h = d.h, r = d.r;
    const col = st === 'stone' ? 0x9a9284 : st === 'metal' ? 0x5a6068 : 0x6a5238;
    if (st === 'stone' || st === 'metal') {
      g.push().translate(0, -1, 0).cyl(r * 0.9, r, h + 1, 8, { color: col }).pop();
      g.push().translate(0, h, 0).cyl(r * 1.15, r * 1.15, 0.5, 8, { color: dk(col, 0.9) }).pop();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.push().translate(Math.sin(a) * r, h + 0.5, Math.cos(a) * r).block(0.6, 0.8, 0.6, { color: col }).pop(); }
    } else {
      for (const [px, pz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) g.push().translate(px * 0.8, -1, pz * 0.8).cyl(0.18, 0.2, h + 1, 5, { color: col }).pop();
      g.push().translate(0, h - 1, 0).box(r * 2.2, 0.25, r * 2.2, { color: dk(col, 1.1) }).pop();
      g.push().translate(0, h + 0.8, 0).cone(r * 1.5, 1.6, 4, { color: 0x7a6a4a }).pop();
    }
  }
  const m = new THREE.Mesh(g.build(), buildingMat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A crop field: furrows and plants, height by growth. */
export function buildField(o: WObj): THREE.Mesh {
  const g = new GeoBuilder();
  const d = o.data;
  const w = d.w, dd = d.d;
  const crop = d.crop as string;
  const col = crop === 'wheat' ? 0xc8b060 : crop === 'riceweed' ? 0x9aa860 : crop === 'cactus' ? 0x5a7a3a : crop === 'dreamleaf' ? 0x4a7a3a : 0x6a8a3a;
  g.push().translate(0, 0.02, 0).box(w, 0.05, dd, { color: 0x5a4a34 }).pop();
  const rows = Math.floor(dd / 1.1);
  const growth = Math.max(0.15, d.growth ?? 0.5);
  for (let r = 0; r < rows; r++) {
    const z = -dd / 2 + 0.55 + r * 1.1;
    g.push().translate(0, 0.06, z).box(w - 0.4, 0.1, 0.35, { color: 0x4a3c2a }).pop();
    for (let i = 0; i < Math.floor(w / 0.9); i++) {
      const x = -w / 2 + 0.5 + i * 0.9;
      g.push().translate(x, 0.08, z);
      if (crop === 'cactus') g.cyl(0.12, 0.14, 0.7 * growth + 0.1, 6, { color: col });
      else for (let k = 0; k < 3; k++) { g.push().rotateY(k * 2.1); g.blade(0.12, (crop === 'wheat' ? 1.0 : 0.8) * growth + 0.1, 0.1, { color: col }); g.pop(); }
      g.pop();
    }
  }
  const m = new THREE.Mesh(g.build(), roofMat);
  m.receiveShadow = true;
  return m;
}

/** A standalone outdoor object (plaza feature, well, cage in the open...). */
export function buildProp(o: WObj): { mesh: THREE.Mesh; glow: THREE.Mesh | null } {
  const g = new GeoBuilder();
  const glow = new GeoBuilder();
  drawFurniture(g, o.def, 0, 0, 0, 0, o.data, glow);
  // glow was drawn in local coords with x/z = 0
  const mesh = new THREE.Mesh(g.build(), buildingMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, glow: glow.vertexCount ? new THREE.Mesh(glow.build(), glowMat) : null };
}
