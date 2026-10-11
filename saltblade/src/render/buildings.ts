// Meshes for buildings (a shell with furniture, and a roof that hides when
// someone is inside), town walls, gates, towers, fields and plaza features.
// Each style has a kit: what its walls, floors and roofs are made of and its
// doors and windows. Rooms get clutter and a lamp, shops an awning and a
// hanging sign, yards a few barrels and crates. All of it is decoration:
// where people walk and what they click is decided by the building's data.
import * as THREE from 'three';
import { GeoBuilder, geoRand } from './geo';
import { WObj } from '../sim/objects';
import { STYLES } from '../content/buildings';
import type { BuildingData, Door } from '../world/towns';
import { FURN } from '../sim/structures';
import { G } from '../state';
import { SURF, wallSurf, surfaceMaterial } from './surface';
import { KitBuilder, surf, dk, drawDoor, drawWindow, drawAwning, drawHangingSign, drawEmblem, clutter, DoorKind, WindowKind } from './kit';

export const buildingMat = surfaceMaterial({ arch: true });
const roofMat = surfaceMaterial({ arch: true, side: THREE.DoubleSide, key: 'roof' });
const fieldMat = surfaceMaterial({ side: THREE.DoubleSide, key: 'field' });
// lamps, fires and screens: bright enough to glow through the bloom pass (see renderer.ts)
const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2) });

/** A pool of lamplight on the floor: local x, y, z and radius. */
export type LightPool = [number, number, number, number];
/**
 * `interior`: the floor, furniture and clutter of a roofed room, a child of the
 * shell that casts no shadow while the roof is on (the roof's shadow covers it).
 */
export interface BuildingMeshes { shell: THREE.Mesh; roof: THREE.Mesh | null; interior: THREE.Mesh | null; glow: THREE.Mesh | null; pools: LightPool[]; }

interface Kit {
  wall: number; inner: number; floor: number; found: number; trim: number; roof: number;
  door: DoorKind; win: WindowKind; awning: 'cloth' | 'plank' | 'corrugated';
  leaf: number; shutters: number[]; plinth: boolean; planters?: boolean; timber?: boolean;
}
const S = SURF;
const KITS: Record<string, Kit> = {
  shanty: { wall: S.plank, inner: S.plank, floor: S.floor, found: S.rubble, trim: S.plank, roof: S.corrugated, door: 'plank', win: 'shutter', awning: 'corrugated', leaf: 0x6a5038, shutters: [0x6a5a48, 0x56655a, 0x7a5038], plinth: false },
  adobe: { wall: S.plaster, inner: S.plaster, floor: S.flag, found: S.rubble, trim: S.plank, roof: S.earth, door: 'plank', win: 'shutter', awning: 'cloth', leaf: 0x7a5a3a, shutters: [0x4a6a7a, 0x7a5a3a, 0x5a6a4a], plinth: true },
  concord: { wall: S.plaster, inner: S.plaster, floor: S.floor, found: S.stone, trim: S.plank, roof: S.tile, door: 'plank', win: 'glass', awning: 'cloth', leaf: 0x4a2e22, shutters: [0x3a5a4a, 0x5a3a2a, 0x3a4a6a], plinth: true, planters: true, timber: true },
  ember: { wall: S.plaster, inner: S.plaster, floor: S.flag, found: S.stone, trim: S.stone, roof: S.plaster, door: 'arch', win: 'round', awning: 'cloth', leaf: 0x7a5030, shutters: [0x8a6a40], plinth: true },
  karuk: { wall: S.rubble, inner: S.plaster, floor: S.earth, found: S.rubble, trim: S.plank, roof: S.earth, door: 'cloth', win: 'slit', awning: 'cloth', leaf: 0x8a6a4a, shutters: [0x5a3a2a], plinth: false },
  karuk_hut: { wall: S.plaster, inner: S.plaster, floor: S.earth, found: S.rubble, trim: S.bark, roof: S.thatch, door: 'cloth', win: 'none', awning: 'cloth', leaf: 0x8a6a4a, shutters: [0x5a3a2a], plinth: false },
  hive: { wall: S.wax, inner: S.wax, floor: S.wax, found: S.wax, trim: S.wax, roof: S.wax, door: 'none', win: 'none', awning: 'cloth', leaf: 0xb89038, shutters: [0xb89038], plinth: false },
  hive_dead: { wall: S.wax, inner: S.wax, floor: S.wax, found: S.wax, trim: S.wax, roof: S.wax, door: 'none', win: 'none', awning: 'cloth', leaf: 0x3a3628, shutters: [0x3a3628], plinth: false },
  delver: { wall: S.corrugated, inner: S.metal, floor: S.metal, found: S.rubble, trim: S.metal, roof: S.cloth, door: 'metal', win: 'grille', awning: 'cloth', leaf: 0x6a6a5e, shutters: [0x6a6a5e], plinth: false },
  hollow: { wall: S.metal, inner: S.metal, floor: S.metal, found: S.concrete, trim: S.metal, roof: S.corrugated, door: 'metal', win: 'grille', awning: 'corrugated', leaf: 0x5a6068, shutters: [0x5a6068], plinth: true },
  swamp: { wall: S.plank, inner: S.plank, floor: S.floor, found: S.plank, trim: S.bark, roof: S.thatch, door: 'plank', win: 'shutter', awning: 'plank', leaf: 0x5a4a36, shutters: [0x4a5a3a, 0x5a4a36], plinth: false },
  tent: { wall: S.cloth, inner: S.cloth, floor: S.earth, found: S.earth, trim: S.bark, roof: S.cloth, door: 'cloth', win: 'none', awning: 'cloth', leaf: 0x7a6a4e, shutters: [0x7a6a4e], plinth: false },
  hide: { wall: S.cloth, inner: S.cloth, floor: S.earth, found: S.earth, trim: S.bone, roof: S.cloth, door: 'cloth', win: 'none', awning: 'cloth', leaf: 0x5a4a3a, shutters: [0x5a4a3a], plinth: false },
  ruin: { wall: S.concrete, inner: S.concrete, floor: S.flag, found: S.rubble, trim: S.concrete, roof: S.concrete, door: 'none', win: 'none', awning: 'cloth', leaf: 0x5a5a58, shutters: [0x5a5a58], plinth: false },
  stone: { wall: S.stone, inner: S.plaster, floor: S.flag, found: S.rubble, trim: S.plank, roof: S.shingle, door: 'plank', win: 'shutter', awning: 'plank', leaf: 0x5a4430, shutters: [0x5a4430, 0x4a5a6a], plinth: true, planters: true },
};
const kitFor = (style: string) => KITS[style] ?? KITS.shanty;

type Side = Door['side'];
/** Enters a wall side's frame: x along the wall, y up, z out of the outer face (pop when done). */
function frame(b: GeoBuilder, side: Side, hw: number, hd: number) {
  const ry = side === 's' ? 0 : side === 'n' ? Math.PI : side === 'e' ? Math.PI / 2 : -Math.PI / 2;
  return b.push().rotateY(ry).translate(0, 0, side === 's' || side === 'n' ? hd : hw);
}
/** A door's or window's along-wall offset as the frame's x. */
const fxOf = (side: Side, off: number) => (side === 'n' || side === 'e' ? -off : off);

const LIT: Record<string, number> = { lamp: 2.2, brazier: 1.1, firepit: 0.5, fire: 0.5, stove: 0.6, altar: 1.5, furnace: 0.9, refinery: 0.9, anvil_bench: 0.9, pyre: 1.9 };

/** Furniture drawn into a builder at local position (x, z) with rotation. */
export function drawFurniture(g: GeoBuilder, def: string, x: number, y: number, z: number, rot: number, data: any, glow: GeoBuilder | null) {
  g.push().translate(x, y, z).rotateY(rot);
  const wood = 0x6a5038, dark = 0x3a2e22, cloth = 0x8a7a5a;
  const rnd = geoRand(Math.floor(x * 131 + z * 71) + def.length * 977);
  surf(g, S.plank);
  switch (def) {
    case 'bed':
    case 'bed_fine':
    case 'bunk': {
      const fine = def === 'bed_fine';
      const fw = fine ? 1.4 : 0.95;
      surf(g, S.floor).push().translate(0, 0.2, 0).box(fw, 0.3, 2.05, { color: fine ? 0x5a2e24 : wood }).pop();
      if (fine) surf(g, S.plank).push().translate(0, 0.55, -1.0).box(fw + 0.08, 1.1, 0.1, { color: 0x4a2620 }).pop();
      surf(g, S.cloth);
      g.push().translate(0, 0.42, -0.45).box(fw - 0.1, 0.14, 0.95, { color: fine ? 0xd8c8a0 : 0xb8a888 }).pop();
      g.push().translate(0, 0.54, -0.74).box(fine ? 0.9 : 0.55, 0.12, 0.3, { color: 0xe0d8c8 }).pop();
      surf(g, S.rug).push().translate(0, 0.45, 0.48).box(fw - 0.04, 0.2, 1.0, { color: fine ? 0x8a2e3a : [0x6a7a5a, 0x7a4a3a, 0x4a5a6a][Math.floor(rnd() * 3)] }).pop();
      if (def === 'bunk') {
        surf(g, S.plank);
        for (const px of [-0.45, 0.45]) g.push().translate(px, 0, 0).block(0.08, 1.9, 2.0, { color: wood }).pop();
        surf(g, S.floor).push().translate(0, 1.35, 0).box(0.95, 0.12, 2.05, { color: wood }).pop();
        surf(g, S.rug).push().translate(0, 1.48, 0.05).box(0.85, 0.14, 1.85, { color: 0x5a6a4a }).pop();
      }
      break;
    }
    case 'bedroll':
      surf(g, S.cloth).push().translate(0, 0.06, 0).box(0.8, 0.12, 1.9, { color: cloth }).pop();
      g.push().translate(0, 0.16, -0.72).box(0.62, 0.16, 0.26, { color: 0xc8b898 }).pop();
      surf(g, S.rug).push().translate(0, 0.13, 0.3).box(0.78, 0.04, 1.0, { color: [0x7a4a3a, 0x5a6a4a, 0x6a5a7a][Math.floor(rnd() * 3)] }).pop();
      break;
    case 'counter':
    case 'bar_counter':
    case 'desk': {
      const len = data?.len ?? 2;
      const bar = def === 'bar_counter';
      surf(g, S.plank).push().translate(0, 0.5, 0.02).box(len, 1.0, 0.7, { color: bar ? 0x5a3a26 : wood }).pop();
      surf(g, S.floor).push().translate(0, 1.03, 0).box(len + 0.12, 0.07, 0.86, { color: dk(wood, 1.25) }).pop();
      surf(g, S.plank).push().translate(0, 0.06, 0.38).box(len, 0.12, 0.06, { color: dk(wood, 0.7) }).pop();
      if (bar) {
        surf(g, S.metal).push().translate(0, 0.22, 0.5).rotateZ(Math.PI / 2).cyl(0.025, 0.025, len - 0.2, 6, { color: 0xb08a3a }).pop();
        g.push().translate(-len / 2 + 0.6, 1.06, 0.05);
        clutter.bottles(g, 3, rnd);
        g.pop();
        surf(g, S.metal);
        for (let i = 0; i < 4; i++) g.push().translate(-len / 2 + 1.4 + i * (len - 1.8) / 4, 1.07, 0.15 + (i % 2) * 0.1).cyl(0.05, 0.045, 0.14, 5, { color: 0x8a6a3a }).pop();
        // a keg on the bar
        surf(g, S.plank).push().translate(len / 2 - 0.45, 1.25, -0.1).rotateZ(Math.PI / 2).cyl(0.2, 0.2, 0.42, 7, { color: 0x6a4a2a }).pop();
      } else if (def === 'counter') {
        g.push().translate(len / 2 - 0.5, 1.06, -0.1);
        clutter.goods(g, 0.7, rnd);
        g.pop();
        surf(g, S.metal).push().translate(-len / 2 + 0.35, 1.07, 0).cyl(0.12, 0.12, 0.04, 6, { color: 0x8a7a5a }).pop();
      } else {
        surf(g, S.cloth).push().translate(0.2, 1.08, 0).rotateY(0.2).box(0.42, 0.01, 0.3, { color: 0xd8ccb0 }).pop();
      }
      break;
    }
    case 'table':
      surf(g, S.floor).push().translate(0, 0.72, 0).box(1.2, 0.07, 0.9, { color: dk(wood, 1.15) }).pop();
      surf(g, S.plank);
      for (const px of [-0.48, 0.48]) g.push().translate(px, 0, 0).block(0.08, 0.7, 0.7, { color: wood }).pop();
      surf(g, S.metal);
      g.push().translate(0.2, 0.76, 0.1).cyl(0.05, 0.04, 0.12, 5, { color: 0x9a8a6a }).pop();
      g.push().translate(-0.25, 0.765, -0.15).box(0.22, 0.02, 0.22, { color: 0x8a7a62 }).pop();
      if (rnd() < 0.4) { g.push().translate(-0.25, 0.76, 0.2); clutter.bottles(g, 1, rnd); g.pop(); }
      break;
    case 'longtable': {
      const len = data?.len ?? 5;
      surf(g, S.floor).push().translate(0, 0.74, 0).rotateY(Math.PI / 2).box(len, 0.08, 1.1, { color: dk(wood, 1.1) }).pop();
      surf(g, S.plank);
      for (let i = 0; i < 3; i++) g.push().translate(0, 0, -len / 2 + 0.3 + i * (len - 0.6) / 2).block(0.9, 0.7, 0.1, { color: wood }).pop();
      surf(g, S.metal);
      for (let i = 0; i < Math.floor(len / 1.1); i++) g.push().translate((i % 2 ? 0.25 : -0.25), 0.79, -len / 2 + 0.5 + i * 1.1).box(0.24, 0.02, 0.24, { color: 0x8a7a62 }).pop();
      break;
    }
    case 'stool':
      surf(g, S.plank);
      g.cyl(0.2, 0.14, 0.5, 6, { color: wood });
      break;
    case 'chest':
    case 'chest_fine': {
      const fine = def === 'chest_fine';
      surf(g, S.siding).push().block(0.9, 0.5, 0.6, { color: fine ? 0x5a2e24 : wood }).pop();
      surf(g, S.plank).push().translate(0, 0.56, 0).box(0.92, 0.12, 0.62, { color: fine ? 0x6a3a2a : dk(wood, 0.9) }).pop();
      surf(g, S.metal);
      g.push().block(0.06, 0.52, 0.62, { color: fine ? 0xc8a040 : 0x3a3430 }).pop();
      g.push().translate(0, 0.38, 0.31).box(0.12, 0.14, 0.03, { color: fine ? 0xd8b050 : 0x9a9080 }).pop();
      break;
    }
    case 'crate':
    case 'crate_old':
      clutter.crate(g, 1.08, def === 'crate_old' ? 0x6a6a66 : 0x8a6a44);
      break;
    case 'barrel':
      clutter.barrel(g);
      break;
    case 'shelf': {
      surf(g, S.plank);
      for (const sx of [-0.88, 0.88]) g.push().translate(sx, 0, 0).block(0.06, 1.9, 0.42, { color: dk(wood, 0.9) }).pop();
      g.push().translate(0, 0.95, -0.2).box(1.8, 1.9, 0.03, { color: dk(wood, 0.75) }).pop();
      for (let i = 0; i < 4; i++) {
        surf(g, S.floor).push().translate(0, 0.08 + i * 0.6, 0).box(1.76, 0.04, 0.42, { color: wood }).pop();
        if (i < 3) { g.push().translate(0, 0.1 + i * 0.6, 0.02); clutter.goods(g, 1.6, rnd); g.pop(); }
      }
      break;
    }
    case 'weapon_rack':
      surf(g, S.plank);
      g.push().block(1.8, 0.1, 0.3, { color: wood }).pop();
      g.push().translate(0, 1.4, 0).box(1.8, 0.1, 0.3, { color: wood }).pop();
      for (const sx of [-0.85, 0.85]) g.push().translate(sx, 0, 0).block(0.08, 1.5, 0.08, { color: dk(wood, 0.85) }).pop();
      surf(g, S.metal);
      for (let i = 0; i < 5; i++) {
        g.push().translate(-0.7 + i * 0.35, 0.1, 0).block(0.05, 1.2, 0.02, { color: 0xb0b0b0 }).pop();
        g.push().translate(-0.7 + i * 0.35, 1.25, 0).box(0.03, 0.22, 0.04, { color: 0x4a3426 }).pop();
        g.push().translate(-0.7 + i * 0.35, 1.13, 0).box(0.16, 0.03, 0.05, { color: 0x8a7a50 }).pop();
      }
      break;
    case 'cage': {
      const bar = 0x3a3a3c;
      surf(g, S.metal).push().block(1.9, 0.1, 1.9, { color: 0x2a2a2a }).pop();
      g.push().translate(0, 2.1, 0).box(1.9, 0.1, 1.9, { color: bar }).pop();
      for (let i = 0; i < 6; i++) for (const side of [0, 1, 2, 3]) {
        const t = -0.9 + i * 0.36;
        const [px, pz] = side === 0 ? [t, -0.92] : side === 1 ? [t, 0.92] : side === 2 ? [-0.92, t] : [0.92, t];
        g.push().translate(px, 0, pz).cyl(0.025, 0.025, 2.1, 4, { color: bar }).pop();
      }
      surf(g, S.thatch).push().translate(0.2, 0.12, 0.1).box(1.3, 0.05, 1.1, { color: 0xa8905a }).pop();
      break;
    }
    case 'altar':
      surf(g, S.stone).push().block(2.4, 1.0, 1.1, { color: 0xd8d0c0 }).pop();
      surf(g, S.cloth).push().translate(0, 1.0, 0).box(2.5, 0.03, 0.8, { color: 0x8a2a22 }).pop();
      surf(g, S.metal).push().translate(0, 1.0, 0).cyl(0.35, 0.25, 0.4, 8, { color: 0xb8a070 }).pop();
      for (const sx of [-0.95, 0.95]) g.push().translate(sx, 1.0, 0.1).cyl(0.05, 0.06, 0.3, 6, { color: 0xe8e0c8 }).pop();
      if (glow) {
        glow.push().translate(x, y + 1.55, z).ico(0.25, 0, { color: [4, 1.6, 0.4] }).pop();
        for (const sx of [-0.95, 0.95]) glow.push().translate(x + Math.cos(rot) * sx, y + 1.36, z - Math.sin(rot) * sx).box(0.05, 0.1, 0.05, { color: [4, 2.4, 0.8] }).pop();
      }
      break;
    case 'pew': {
      const len = data?.len ?? 3;
      surf(g, S.floor).push().translate(0, 0.45, 0).box(len, 0.08, 0.5, { color: wood }).pop();
      surf(g, S.siding).push().translate(0, 0.8, -0.22).box(len, 0.5, 0.06, { color: wood }).pop();
      surf(g, S.plank);
      for (const px of [-len / 2 + 0.2, len / 2 - 0.2]) g.push().translate(px, 0, 0).block(0.08, 0.45, 0.45, { color: dark }).pop();
      break;
    }
    case 'brazier':
      surf(g, S.metal);
      for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; g.push().translate(Math.cos(a) * 0.2, 0.35, Math.sin(a) * 0.2).rotateY(-a).rotateZ(0.2).box(0.04, 0.72, 0.04, { color: 0x2e2a26 }).pop(); }
      g.push().translate(0, 0.7, 0).cyl(0.38, 0.22, 0.32, 9, { color: 0x4a4038 }).pop();
      surf(g, S.rubble).push().translate(0, 0.98, 0).scale(1, 0.4, 1).ico(0.3, 0, { color: 0x2a1a12 }).pop();
      if (glow) glow.push().translate(x, y + 1.1, z).ico(0.3, 0, { color: [5, 1.8, 0.3] }).pop();
      break;
    case 'throne':
      surf(g, S.plank).push().block(1.1, 0.6, 1.0, { color: 0x5a3a26 }).pop();
      g.push().translate(0, 0.6, -0.42).box(1.1, 1.6, 0.16, { color: 0x5a3a26 }).pop();
      surf(g, S.metal).push().translate(0, 1.5, -0.42).box(1.3, 0.14, 0.2, { color: 0xc8a040 }).pop();
      for (const sx of [-0.5, 0.5]) g.push().translate(sx, 0.85, 0).box(0.12, 0.08, 0.95, { color: 0xc8a040 }).pop();
      surf(g, S.cloth).push().translate(0, 0.65, 0.05).box(0.9, 0.1, 0.8, { color: 0x8a2a2a }).pop();
      g.push().translate(0, 1.0, -0.33).box(0.85, 0.7, 0.04, { color: 0x8a2a2a }).pop();
      break;
    case 'rug': {
      const w = data?.w ?? 3, d = data?.d ?? 5;
      surf(g, S.rug);
      g.push().translate(0, 0.03, 0).box(w, 0.02, d, { color: 0x7a2a26 }).pop();
      g.push().translate(0, 0.042, 0).box(w * 0.78, 0.01, d * 0.86, { color: 0xa8683a }).pop();
      g.push().translate(0, 0.05, 0).box(w * 0.4, 0.01, d * 0.55, { color: 0x6a3a5a }).pop();
      break;
    }
    case 'workbench':
      surf(g, S.floor).push().translate(0, 0.85, 0).box(2, 0.1, 0.9, { color: dk(wood, 1.1) }).pop();
      surf(g, S.plank);
      for (const [px, pz] of [[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]]) g.push().translate(px, 0, pz).block(0.1, 0.85, 0.1, { color: wood }).pop();
      g.push().translate(0, 0.25, 0).box(1.8, 0.04, 0.8, { color: dk(wood, 0.85) }).pop();
      surf(g, S.metal);
      g.push().translate(-0.4, 0.92, 0).box(0.4, 0.06, 0.2, { color: 0x7a7a7a }).pop();
      g.push().translate(0.75, 0.9, -0.25).box(0.18, 0.14, 0.14, { color: 0x3a3a3c }).pop();
      g.push().translate(0.3, 0.91, 0.2).rotateY(0.6).box(0.3, 0.03, 0.05, { color: 0x9a9a9e }).pop();
      g.push().translate(0.1, 0.91, 0.25).rotateY(-0.3).box(0.06, 0.04, 0.26, { color: 0x6a4a2a }).pop();
      g.push().translate(0, 0.27, 0.1);
      clutter.goods(g, 1.2, rnd);
      g.pop();
      break;
    case 'anvil':
      surf(g, S.plank).push().cyl(0.28, 0.32, 0.45, 8, { color: 0x5a4430 }).pop();
      surf(g, S.metal).push().translate(0, 0.45, 0).block(0.3, 0.12, 0.22, { color: 0x3a3a3a }).pop();
      g.push().translate(0, 0.62, 0).box(0.8, 0.14, 0.3, { color: 0x4a4a4c }).pop();
      g.push().translate(0.48, 0.64, 0).rotateZ(-Math.PI / 2).cone(0.1, 0.25, 6, { color: 0x4a4a4c }).pop();
      break;
    case 'lamp':
      surf(g, S.metal);
      g.cyl(0.05, 0.07, 2.0, 6, { color: dark });
      g.push().translate(0, 0, 0).cyl(0.18, 0.22, 0.08, 7, { color: dark }).pop();
      g.push().translate(0, 2.0, 0).cyl(0.16, 0.13, 0.06, 6, { color: dark }).pop();
      g.push().translate(0, 2.42, 0).cone(0.18, 0.18, 6, { color: dark }).pop();
      for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4; g.push().translate(Math.cos(a) * 0.12, 2.05, Math.sin(a) * 0.12).block(0.02, 0.38, 0.02, { color: dark }).pop(); }
      if (glow) glow.push().translate(x, y + 2.22, z).box(0.18, 0.28, 0.18, { color: [3.5, 2.4, 1.1] }).pop();
      break;
    case 'forsale':
      surf(g, S.plank).push().translate(0, 0.7, 0).box(0.1, 1.4, 0.1, { color: wood }).pop();
      g.push().translate(0, 1.25, 0.06).box(0.8, 0.45, 0.05, { color: 0xd8c8a0 }).pop();
      surf(g, S.plain).push().translate(0, 1.25, 0.09).box(0.6, 0.08, 0.02, { color: 0x8a2a1a }).pop();
      break;
    case 'post':
      surf(g, S.bark).cyl(0.12, 0.14, 1.6, 7, { color: wood });
      surf(g, S.metal).push().translate(0, 1.2, 0.15).torus(0.08, 0.02, 4, 8, Math.PI * 2, { color: 0x3a3a3a }).pop();
      for (let i = 0; i < 3; i++) g.push().translate(0.02 * i, 1.0 - i * 0.12, 0.2).rotateX(0.2).torus(0.04, 0.012, 4, 6, Math.PI * 2, { color: 0x3a3a3a }).pop();
      break;
    case 'firepit':
      surf(g, S.rock);
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; g.push().translate(Math.sin(a) * 0.8, 0.1, Math.cos(a) * 0.8).rotateY(a * 3).octa(0.24 + rnd() * 0.05, { color: 0x6a6660 }).pop(); }
      surf(g, S.earth).push().translate(0, 0.02, 0).cyl(0.7, 0.7, 0.04, 10, { color: 0x2a221c }).pop();
      surf(g, S.bark);
      for (let i = 0; i < 4; i++) g.push().translate(0, 0.12, 0).rotateY(i * 0.8).limb(-0.5, 0, 0, 0.5, 0.28, 0, 0.07, 0.06, 5, { color: [0x3a2a1a, 0x2a1e14][i % 2] }).pop();
      if (glow) glow.push().translate(x, y + 0.45, z).ico(0.35, 0, { color: [5, 1.6, 0.3] }).pop();
      break;
    case 'well': {
      // a stone drum, posts and a little shingled roof over the winch
      surf(g, S.rubble).cyl(1.3, 1.38, 0.9, 14, { color: 0x8a8274 });
      surf(g, S.stone).push().translate(0, 0.86, 0).cyl(1.36, 1.36, 0.1, 14, { color: 0x9a9284 }).pop();
      surf(g, S.plain).push().translate(0, 0.9, 0).cyl(1.02, 1.02, 0.05, 14, { color: 0x0e0d0b }).pop();
      surf(g, S.bark);
      for (const sx of [-1.12, 1.12]) g.push().translate(sx, 0.3, 0).cyl(0.08, 0.09, 2.6, 6, { color: wood }).pop();
      surf(g, S.plank).push().translate(0, 2.25, 0).rotateZ(Math.PI / 2).cyl(0.09, 0.09, 2.3, 7, { color: dk(wood, 0.9) }).pop();
      surf(g, S.metal).push().translate(1.3, 2.25, 0).box(0.06, 0.4, 0.06, { color: 0x3a3a3a }).pop();
      surf(g, S.plain).push().translate(0, 1.55, 0).box(0.02, 1.4, 0.02, { color: 0x8a7a5a }).pop();
      surf(g, S.plank).push().translate(0, 0.98, 0).cyl(0.17, 0.14, 0.3, 7, { color: 0x6a4a2a }).pop();
      surf(g, S.shingle);
      for (const sd of [-1, 1]) g.push().translate(0, 3.05, sd * 0.42).rotateX(sd * 0.75).box(2.9, 0.07, 1.15, { color: 0x6a4a34 }).pop();
      surf(g, S.plank).push().translate(0, 3.42, 0).box(3.0, 0.1, 0.14, { color: dk(wood, 0.8) }).pop();
      break;
    }
    case 'statue':
      surf(g, S.stone).push().block(2.4, 1.2, 2.4, { color: 0x9a948a }).pop();
      surf(g, S.rock);
      g.push().translate(0, 1.2, 0).cyl(0.35, 0.45, 2.2, 8, { color: 0xb8b0a0 }).pop();
      g.push().translate(0, 3.6, 0).sphere(0.4, 8, 6, { color: 0xb8b0a0 }).pop();
      g.push().translate(0.6, 2.8, 0).rotateZ(-0.6).cyl(0.1, 0.12, 1.1, 6, { color: 0xb8b0a0 }).pop();
      g.push().translate(0, 1.25, 0).box(1.1, 0.1, 0.8, { color: 0xa8a090 }).pop();
      break;
    case 'pyre':
      surf(g, S.stone).cyl(2.4, 2.6, 0.9, 14, { color: 0xd8d0c0 });
      surf(g, S.rubble).push().translate(0, 0.9, 0).cyl(1.8, 2.2, 0.6, 12, { color: 0x4a4038 }).pop();
      surf(g, S.bark);
      for (let i = 0; i < 7; i++) g.push().translate(0, 1.5, 0).rotateY(i * 0.9).limb(-1.4, 0, 0, 1.4, 0.4, 0, 0.12, 0.1, 5, { color: [0x2a1e14, 0x3a2a1a][i % 2] }).pop();
      if (glow) { glow.push().translate(x, y + 1.9, z).scale(1, 1.6, 1).ico(1.3, 1, { color: [6, 2.2, 0.4] }).pop(); }
      break;
    case 'arena': {
      const r = data?.r ?? 12;
      surf(g, S.bone);
      for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; g.push().translate(Math.sin(a) * r, 0, Math.cos(a) * r).cyl(0.2, 0.25, 1.4, 6, { color: 0xd8ccb0 }).pop(); }
      surf(g, S.earth).push().translate(0, 0.02, 0).cyl(r - 0.5, r - 0.5, 0.03, 24, { color: 0x9a7a5a }).pop();
      break;
    }
    case 'totem':
      surf(g, S.wax).cyl(0.5, 0.8, 5, 8, { color: 0xb89038 });
      g.push().translate(0, 5, 0).ico(1.1, 1, { color: 0xd8b04a, jitter: 0.2, seed: 3 }).pop();
      break;
    case 'pillar':
      surf(g, S.concrete).cyl(0.9, 1.1, 7, 6, { color: 0x5a6068 });
      surf(g, S.metal).push().translate(0, 6.9, 0).cyl(1.0, 0.95, 0.3, 6, { color: 0x3a3e44 }).pop();
      if (glow) glow.push().translate(x, y + 5, z).box(0.3, 3, 2.3, { color: [0.6, 2.6, 4] }).pop();
      break;
    case 'fire':
      if (glow) glow.push().translate(x, y + 0.45, z).ico(0.4, 0, { color: [5, 1.6, 0.3] }).pop();
      surf(g, S.bark);
      for (let i = 0; i < 3; i++) g.push().translate(0, 0.12, 0).rotateY(i * 1.05).limb(-0.5, 0, 0, 0.5, 0.25, 0, 0.07, 0.07, 5, { color: 0x3a2a1a }).pop();
      break;
    case 'research':
      surf(g, S.metal).push().translate(0, 0.85, 0).box(2, 0.1, 0.9, { color: 0x4a5058 }).pop();
      for (const [px, pz] of [[-0.9, -0.35], [0.9, -0.35], [-0.9, 0.35], [0.9, 0.35]]) g.push().translate(px, 0, pz).block(0.1, 0.85, 0.1, { color: 0x3a3e44 }).pop();
      g.push().translate(-0.5, 0.9, -0.1).box(0.5, 0.35, 0.35, { color: 0x6a7078 }).pop();
      g.push().translate(0.4, 0.9, -0.2).box(0.6, 0.45, 0.06, { color: 0x2a2e34 }).pop();
      if (glow) glow.push().translate(x, y + 1.2, z).box(0.3, 0.2, 0.02, { color: [0.6, 2.6, 4] }).pop();
      break;
    case 'refinery':
    case 'furnace': {
      const big = def === 'furnace';
      surf(g, S.stone).push().block(big ? 2.6 : 2.2, 0.4, big ? 2.6 : 2.2, { color: 0x5a544c }).pop();
      surf(g, S.rubble).push().translate(0, 0.4, 0).cyl(big ? 1.0 : 0.8, big ? 1.2 : 1.0, big ? 2.4 : 2, 9, { color: 0x6a5e52, grad: 0.3 }).pop();
      surf(g, S.metal).push().translate(0.5, 0.4, 0.5).cyl(0.2, 0.25, big ? 4.2 : 3.4, 7, { color: 0x3a3632 }).pop();
      g.push().translate(0, 0.9, big ? 1.2 : 1).box(0.7, 0.6, 0.1, { color: 0x2a2420 }).pop();
      if (glow) glow.push().translate(x + Math.sin(rot) * (big ? 1.25 : 1.05), y + 0.9, z + Math.cos(rot) * (big ? 1.25 : 1.05)).box(0.5, 0.4, 0.05, { color: [5, 1.8, 0.4] }).pop();
      break;
    }
    case 'stonecutter':
      surf(g, S.stone).push().block(2.6, 0.9, 2, { color: 0x6a6660 }).pop();
      surf(g, S.metal).push().translate(0, 1.2, 0).rotateX(Math.PI / 2).cyl(0.7, 0.7, 0.1, 14, { color: 0x9a9a9e }).pop();
      surf(g, S.rock).push().translate(-0.8, 0.9, 0.6).block(0.8, 0.6, 0.6, { color: 0xa8a298 }).pop();
      break;
    case 'loom':
      surf(g, S.plank);
      for (const px of [-0.8, 0.8]) g.push().translate(px, 0, 0).block(0.12, 1.6, 1.2, { color: wood }).pop();
      g.push().translate(0, 1.5, 0).box(1.8, 0.1, 0.1, { color: wood }).pop();
      surf(g, S.cloth).push().translate(0, 0.9, 0).box(1.5, 0.9, 0.04, { color: 0xc8b89a }).pop();
      break;
    case 'tannery':
      surf(g, S.bark);
      for (const px of [-0.8, 0.8]) g.push().translate(px, 0, 0).cyl(0.06, 0.07, 1.8, 5, { color: wood }).pop();
      g.push().translate(0, 1.7, 0).rotateZ(Math.PI / 2).cyl(0.05, 0.05, 1.8, 5, { color: wood }).pop();
      surf(g, S.cloth).push().translate(0, 1.05, 0).rotateX(0.15).box(1.3, 1.2, 0.04, { color: 0x8a6a4a }).pop();
      break;
    case 'mill':
      surf(g, S.stone).push().cyl(0.9, 1.0, 1.1, 12, { color: 0x8a8274 }).pop();
      surf(g, S.rock).push().translate(0, 1.1, 0).cyl(0.8, 0.8, 0.25, 12, { color: 0x9a948a }).pop();
      surf(g, S.plank).push().translate(0, 1.35, 0).rotateZ(Math.PI / 2).cyl(0.06, 0.06, 2.2, 5, { color: wood }).pop();
      break;
    case 'druglab': {
      // a scarred table of flasks, a burner and a drying rack (cylinders are centred, so each stands at top + h/2)
      const top = 0.89;
      surf(g, S.floor).push().translate(0, 0.85, 0).box(1.9, 0.08, 0.9, { color: 0x5a4a38 }).pop();
      surf(g, S.plank);
      for (const [px, pz] of [[-0.85, -0.38], [0.85, -0.38], [-0.85, 0.38], [0.85, 0.38]]) g.push().translate(px, 0, pz).block(0.08, 0.85, 0.08, { color: 0x3a3028 }).pop();
      surf(g, S.metal);
      g.push().translate(-0.55, top + 0.06, 0).cyl(0.16, 0.18, 0.12, 8, { color: 0x3a3a3c }).pop(); // the burner
      g.push().translate(-0.55, top + 0.175, 0).cyl(0.018, 0.018, 0.11, 4, { color: 0x6a6a6e }).pop();
      surf(g, S.glass);
      g.push().translate(-0.55, top + 0.36, 0).sphere(0.13, 8, 6, { color: 0x9ab0b8 }).pop(); // the retort
      g.push().translate(-0.3, top + 0.44, 0).rotateZ(-1.2).cyl(0.018, 0.018, 0.5, 4, { color: 0x9ab0b8 }).pop();
      g.push().translate(0.2, top + 0.16, -0.15).cyl(0.025, 0.045, 0.1, 7, { color: 0x9ab0b8 }).pop(); // flask necks over the glowing stuff
      g.push().translate(0.42, top + 0.14, 0.18).cyl(0.02, 0.04, 0.08, 7, { color: 0x9ab0b8 }).pop();
      surf(g, S.cloth).push().translate(0.75, top + 0.01, -0.1).box(0.3, 0.02, 0.4, { color: 0xc8bca0 }).pop(); // paper and powder
      surf(g, S.plank);
      for (const px of [-0.2, 0.2]) g.push().translate(0.1 + px, 1.55, 0.4).block(0.04, 0.7, 0.04, { color: 0x4a3a2a }).pop();
      g.push().translate(0.1, 2.2, 0.4).box(0.5, 0.03, 0.03, { color: 0x4a3a2a }).pop();
      surf(g, S.grass);
      for (let k = 0; k < 4; k++) g.push().translate(-0.08 + k * 0.12, 2.05, 0.4).blade(0.09, -0.22, 0.02, { color: 0x3e6a34 }).pop(); // leaf hung to dry
      if (glow) {
        // (the glow is drawn unrotated, so turn each offset with the table)
        glow.push().translate(x, y, z).rotateY(rot);
        glow.push().translate(-0.55, top + 0.15, 0).cyl(0.07, 0.11, 0.06, 7, { color: [2.4, 1.0, 0.35] }).pop(); // the flame
        glow.push().translate(0.2, top + 0.055, -0.15).cyl(0.05, 0.065, 0.11, 7, { color: [0.4, 1.6, 2.4] }).pop(); // a flask of blue dust
        glow.push().translate(0.42, top + 0.05, 0.18).cyl(0.04, 0.055, 0.1, 7, { color: [2.2, 0.25, 0.2] }).pop(); // and one of red
        glow.pop();
      }
      break;
    }
    case 'still':
      surf(g, S.metal);
      g.push().translate(0, 0, 0).cyl(0.7, 0.8, 1.3, 10, { color: 0xa06a3a, grad: 0.2 }).pop();
      g.push().translate(0, 1.3, 0).sphere(0.7, 10, 5, { color: 0xb07a44 }).pop();
      g.push().translate(0.6, 1.5, 0).rotateZ(-1.0).cyl(0.06, 0.06, 1.1, 5, { color: 0x8a5a30 }).pop();
      surf(g, S.plank).push().translate(1.1, 0, 0).cyl(0.3, 0.3, 0.6, 8, { color: 0x6a5238 }).pop();
      break;
    case 'press':
      surf(g, S.metal);
      for (const px of [-0.7, 0.7]) g.push().translate(px, 0, 0).block(0.2, 2, 0.2, { color: 0x4a4a4c }).pop();
      g.push().translate(0, 1.9, 0).box(1.6, 0.25, 0.4, { color: 0x4a4a4c }).pop();
      surf(g, S.plank).push().translate(0, 0.3, 0).block(1.2, 0.6, 1.2, { color: 0x5a4a38 }).pop();
      surf(g, S.metal).push().translate(0, 1.2, 0).cyl(0.08, 0.08, 0.7, 5, { color: 0x8a8a8a }).pop();
      break;
    case 'electronics':
    case 'machineshop':
      surf(g, S.metal);
      g.push().translate(0, 0.9, 0).box(def === 'machineshop' ? 2.8 : 1.9, 0.1, 0.9, { color: 0x4a5058 }).pop();
      for (const [px, pz] of [[-0.85, -0.35], [0.85, -0.35], [-0.85, 0.35], [0.85, 0.35]]) g.push().translate(px * (def === 'machineshop' ? 1.4 : 1), 0, pz).block(0.1, 0.9, 0.1, { color: 0x3a3e44 }).pop();
      g.push().translate(-0.4, 0.95, -0.1).box(0.5, 0.4, 0.4, { color: 0x6a7078 }).pop();
      if (def === 'machineshop') g.push().translate(0.8, 0.95, 0).cyl(0.2, 0.2, 0.7, 8, { color: 0x8a8a8e }).pop();
      if (glow) glow.push().translate(x, y + 1.3, z).box(0.3, 0.2, 0.02, { color: [0.6, 2.6, 4] }).pop();
      break;
    case 'anvil_bench':
      surf(g, S.metal);
      g.push().translate(-0.6, 0, 0).block(0.5, 0.55, 0.4, { color: 0x3a3a3a }).pop();
      g.push().translate(-0.6, 0.6, 0).box(0.9, 0.2, 0.36, { color: 0x4a4a4c }).pop();
      surf(g, S.rubble).push().translate(0.6, 0, 0).cyl(0.5, 0.6, 0.9, 9, { color: 0x6a5e52 }).pop();
      if (glow) glow.push().translate(x + Math.cos(rot) * 0.6, y + 0.95, z - Math.sin(rot) * 0.6).ico(0.3, 0, { color: [5, 1.8, 0.4] }).pop();
      break;
    case 'dummy':
      surf(g, S.bark).cyl(0.06, 0.08, 1.2, 5, { color: wood });
      surf(g, S.cloth).push().translate(0, 1.2, 0).cyl(0.22, 0.25, 0.7, 7, { color: 0xb8a070 }).pop();
      g.push().translate(0, 2.05, 0).sphere(0.18, 7, 5, { color: 0xb8a070 }).pop();
      surf(g, S.bark).push().translate(0, 1.6, 0).rotateZ(Math.PI / 2).cyl(0.05, 0.05, 1.1, 5, { color: wood }).pop();
      break;
    case 'windmill':
      surf(g, S.metal).push().cyl(0.25, 0.4, 7, 6, { color: 0x6a6a6e }).pop();
      g.push().translate(0, 7, 0.35).rotateX(Math.PI / 2).cyl(0.25, 0.25, 0.5, 6, { color: 0x5a5a5e }).pop();
      surf(g, S.cloth);
      for (let i = 0; i < 3; i++) g.push().translate(0, 7, 0.65).rotateZ((i / 3) * Math.PI * 2 + (data?.spin ?? 0)).translate(0, 1.4, 0).box(0.35, 2.8, 0.05, { color: 0xd8d0c0 }).pop();
      break;
    case 'generator':
      surf(g, S.metal).push().block(1.8, 1.2, 1.4, { color: 0x5a5e62 }).pop();
      g.push().translate(0.5, 1.2, 0.3).cyl(0.12, 0.12, 0.9, 6, { color: 0x3a3a3a }).pop();
      g.push().translate(-0.4, 1.25, 0).cyl(0.35, 0.35, 0.1, 8, { color: 0x7a5a3a }).pop();
      if (glow) glow.push().translate(x, y + 0.7, z + 0.71).box(0.4, 0.15, 0.02, { color: [3, 2.4, 0.4] }).pop();
      break;
    case 'turret':
      surf(g, S.siding).push().block(1.8, 1.4, 1.8, { color: 0x6a5e52 }).pop();
      surf(g, S.metal);
      g.push().translate(0, 1.4, 0).cyl(0.5, 0.6, 0.4, 8, { color: 0x4a4a4c }).pop();
      g.push().translate(0, 2.0, 0.4).rotateX(Math.PI / 2).cyl(0.12, 0.16, 1.8, 6, { color: 0x3a3a3c }).pop();
      surf(g, S.plank).push().translate(0, 2.0, 0.2).box(1.8, 0.12, 0.2, { color: 0x6a5238 }).pop();
      break;
    case 'banner':
      surf(g, S.bark).cyl(0.05, 0.06, 4, 5, { color: 0x4a3a2a });
      surf(g, S.cloth).push().translate(0.45, 3.2, 0).box(0.9, 1.4, 0.03, { color: 0x9a3a2a }).pop();
      g.push().translate(0.45, 2.45, 0).box(0.9, 0.1, 0.035, { color: 0x6a2a1a }).pop();
      break;
    case 'stove':
      surf(g, S.metal).push().block(1.4, 1.0, 0.9, { color: 0x4a4a4c }).pop();
      g.push().translate(0.4, 1.0, -0.2).cyl(0.1, 0.12, 1.6, 6, { color: 0x3a3a3c }).pop();
      g.push().translate(-0.3, 1.02, 0.1).cyl(0.2, 0.2, 0.15, 8, { color: 0x6a5a4a }).pop();
      if (glow) glow.push().translate(x, y + 0.5, z + 0.46).box(0.5, 0.2, 0.02, { color: [5, 1.6, 0.3] }).pop();
      break;
    case 'wreckage': {
      // rusted hull plates, a snapped girder and ribs half sunk in the ground
      const sc = data?.s ?? 1.5;
      surf(g, S.corrugated).push().scale(sc).rotateZ(0.3).translate(0, 0.4, 0).box(3, 0.15, 1.6, { color: 0x6a5e56 }).pop();
      surf(g, S.metal).push().scale(sc).translate(1.2, 0.8, 0.3).rotateX(0.6).rotateZ(-0.4).box(0.2, 1.8, 1.2, { color: 0x7a5238 }).pop();
      g.push().scale(sc).translate(-1, 0.3, -0.4).rotateY(0.7).limb(0, 0, 0, 2, 0.4, 0, 0.18, 0.18, 6, { color: 0x5a5a5e }).pop();
      for (let i = 0; i < 3; i++) g.push().scale(sc).translate(-0.8 + i * 0.7, -0.2, 0.9).rotateZ(0.2 - i * 0.15).box(0.12, 1.3 - i * 0.2, 0.12, { color: [0x6a4a36, 0x5a5250, 0x7a5a40][i] }).pop();
      g.push().scale(sc).translate(0.3, 0.05, -0.9).rotateY(1.2).rotateX(0.1).box(1.4, 0.08, 0.7, { color: 0x5a4a40 }).pop();
      break;
    }
    case 'standing_stone':
      surf(g, S.rock).push().rotateZ(0.06).scale(1, 1, 0.6).cyl(0.7, 0.9, 4.5, 6, { color: 0x8a8274, grad: 0.3 }).pop();
      break;
    case 'bones_big':
      surf(g, S.bone).push().rotateY(0.4).limb(-1.5, 0.2, 0, 1.5, 0.3, 0, 0.3, 0.25, 6, { color: 0xe0d6c0 }).pop();
      break;
    default:
      clutter.crate(g, 0.6, wood);
  }
  g.pop();
}

/** One wall run along a side from x0 to x1 (in the side's own axis), from y0 to y1. */
function wallRun(g: KitBuilder, x0: number, x1: number, fixed: number, y0: number, y1: number, t: number, col: number, horiz: boolean, kit: Kit, style: string, rnd: () => number) {
  const len = x1 - x0;
  if (len <= 0.02 || y1 - y0 <= 0.02) return;
  const put = (a: number, b: number, ya: number, yb: number, c: number, sf: number) => {
    g.S(sf);
    if (horiz) g.push().translate((a + b) / 2, (ya + yb) / 2, fixed).box(b - a + 0.02, yb - ya, t, { color: c }).pop();
    else g.push().translate(fixed, (ya + yb) / 2, (a + b) / 2).box(t, yb - ya, b - a + 0.02, { color: c }).pop();
  };
  if (style === 'shanty' && len > 1.4) {
    // patchwork: boards, and sheets of scavenged metal
    const n = Math.max(1, Math.round(len / 1.3));
    for (let i = 0; i < n; i++) {
      const a = x0 + (len * i) / n, b = x0 + (len * (i + 1)) / n;
      const metal = rnd() < 0.35;
      const c = metal ? dk([0x8a8a84, 0x7a6a5a, 0x6a6a68][Math.floor(rnd() * 3)], 0.9 + rnd() * 0.2) : dk(col, 0.85 + rnd() * 0.3);
      const hh = y1 - y0 - (rnd() < 0.3 ? rnd() * 0.3 : 0);
      put(a, b, y0, y0 + hh, c, wallSurf(metal ? S.corrugated : kit.wall, kit.inner));
    }
  } else put(x0, x1, y0, y1, col, wallSurf(kit.wall, kit.inner));
  if (kit.plinth && y0 < 0.1) {
    // a darker base course, proud of the outer face
    const out = fixed + Math.sign(fixed) * (t / 2 + 0.04);
    g.S(kit.found);
    if (horiz) g.push().translate((x0 + x1) / 2, 0.16, out).box(len + 0.04, 0.5, 0.1, { color: dk(col, 0.72) }).pop();
    else g.push().translate(out, 0.16, (x0 + x1) / 2).box(0.1, 0.5, len + 0.04, { color: dk(col, 0.72) }).pop();
  }
}

/** Where along a side the doors leave room for things: does a span (a..b) touch a doorway? */
function nearDoor(doors: Door[], side: Side, a: number, pad: number) {
  return doors.some((dr) => dr.side === side && Math.abs(dr.off - a) < dr.w / 2 + pad);
}

interface Spot { x: number; z: number; ry: number; side: Side; along: number; }
/** Places along the inside of the walls that are clear of doorways and furniture. */
function wallSpots(d: BuildingData, t: number, inset: number, furn: { x: number; z: number; r: number }[], rnd: () => number, gap = 1.1): Spot[] {
  const hw = d.w / 2, hd = d.d / 2, out: Spot[] = [];
  for (const side of ['n', 'e', 'w', 's'] as Side[]) {
    const len = side === 's' || side === 'n' ? d.w : d.d;
    const half = len / 2 - t - 0.45;
    for (let a = -half + rnd() * 0.4; a <= half; a += gap + rnd() * 0.5) {
      if (nearDoor(d.doors, side, a, 1.0)) continue;
      const x = side === 's' || side === 'n' ? a : side === 'e' ? hw - inset : -hw + inset;
      const z = side === 'e' || side === 'w' ? a : side === 's' ? hd - inset : -hd + inset;
      if (furn.some((f) => Math.hypot(f.x - x, f.z - z) < f.r + 0.55)) continue;
      const ry = side === 's' ? Math.PI : side === 'n' ? 0 : side === 'e' ? -Math.PI / 2 : Math.PI / 2;
      out.push({ x, z, ry, side, along: a });
    }
  }
  return out;
}

const STACK_USES = new Set(['warehouse', 'workshop', 'barracks', 'container']);

/** Clutter along the inside walls, wall shelves and hangings, by what the building is for. */
function dressRoom(g: KitBuilder, d: BuildingData, t: number, kit: Kit, furn: { x: number; z: number; r: number }[], rnd: () => number) {
  const use = d.use;
  if (use === 'tower' || use === 'pen' || use === 'stall' || use === 'ruin') return;
  const dense = use === 'warehouse' ? 0.75 : use === 'shop' || use === 'workshop' ? 0.45 : use === 'bar' ? 0.4 : 0.3;
  // a rug where people sit or sleep, clear of the beds
  if ((use === 'house' || use === 'farmhouse' || use === 'hut' || use === 'tent' || use === 'bar' || use === 'barracks' || use === 'clinic') && rnd() < 0.8) {
    const rw = Math.min(3.2, d.w * 0.32), rd = Math.min(2.4, d.d * 0.3);
    const rx = (rnd() - 0.5) * d.w * 0.15, rz = (rnd() - 0.5) * d.d * 0.15;
    if (!furn.some((f) => f.r > 0.9 && Math.abs(f.x - rx) < rw / 2 + 0.2 && Math.abs(f.z - rz) < rd / 2 + 0.2)) {
      const c = [[0x7a2a26, 0xa8683a], [0x2a3a5a, 0x8a7a5a], [0x5a3a24, 0xb08a4a], [0x4a5a3a, 0xa89068]][Math.floor(rnd() * 4)];
      g.S(S.rug).push().translate(rx, 0.06, rz).rotateY(rnd() < 0.5 ? 0 : Math.PI / 2);
      g.box(rw, 0.015, rd, { color: c[0] });
      g.push().translate(0, 0.009, 0).box(rw * 0.74, 0.012, rd * 0.7, { color: c[1] }).pop();
      g.pop();
    }
  }
  const spots = wallSpots(d, t, t + 0.42, furn, rnd);
  const round = use === 'hut' || use === 'tent' || use === 'dome';
  let left = Math.min(5, Math.max(1, Math.round((d.w * d.d) / 30)));
  for (const s of spots) {
    if (rnd() > dense || left <= 0) continue;
    left--;
    if (round && Math.hypot(s.x, s.z) > Math.min(d.w, d.d) / 2 - t - 0.6) continue;
    g.push().translate(s.x, 0.05, s.z).rotateY(s.ry + (rnd() - 0.5) * 0.4);
    const r = rnd();
    if (use === 'dome') { if (r < 0.5) clutter.pot(g, 0xb08a3a); else g.S(S.wax).push().scale(1, 0.6, 1).ico(0.45, 1, { color: 0xb89038, jitter: 0.1, seed: 5 }).pop(); }
    else if (r < 0.3) clutter.barrel(g);
    else if (r < 0.55) {
      clutter.crate(g, 0.75, [0x8a6a44, 0x7a5a3a, 0x6a6a5a][Math.floor(rnd() * 3)]);
      if (STACK_USES.has(use) && rnd() < 0.6) { g.push().translate(0.05, 0.64, 0).rotateY(0.3); clutter.crate(g, 0.6); g.pop(); }
    } else if (r < 0.75) { clutter.sack(g); if (rnd() < 0.5) { g.push().translate(0.42, 0, 0.1); clutter.sack(g, 0xa89068); g.pop(); } }
    else clutter.pot(g, [0xa0603a, 0x8a7a5a, 0xb0805a][Math.floor(rnd() * 3)]);
    g.pop();
  }
  // things on the walls: shelves of jars, racks of tools, hangings
  if (round) return;
  const high = wallSpots(d, t, t + 0.14, [], rnd, 2.2);
  let n = 0;
  for (const s of high) {
    if (n >= 2 || rnd() < 0.5) continue;
    n++;
    g.push().translate(s.x, 0, s.z).rotateY(s.ry);
    if (use === 'temple' || use === 'palace' || use === 'hall' || use === 'boss') {
      g.S(S.cloth).push().translate(0, 2.0, 0).box(0.9, 1.8, 0.03, { color: [0x8a2a22, 0x2a3a6a, 0x6a2a4a][Math.floor(rnd() * 3)] }).pop();
      g.S(S.metal).push().translate(0, 2.95, 0.02).box(1.05, 0.05, 0.05, { color: 0xb08a3a }).pop();
    } else if (use === 'workshop' || use === 'barracks') {
      g.S(S.plank).push().translate(0, 1.7, 0).box(1.2, 0.7, 0.04, { color: 0x6a5038 }).pop();
      g.S(S.metal);
      for (let i = 0; i < 4; i++) g.push().translate(-0.42 + i * 0.28, 1.65, 0.05).rotateZ((rnd() - 0.5) * 0.3).box(0.05, 0.45, 0.03, { color: [0x8a8a8e, 0x5a4a3a, 0x6a6a6e][i % 3] }).pop();
    } else {
      g.S(S.floor).push().translate(0, 1.55, 0.12).box(1.3, 0.04, 0.26, { color: 0x6a5038 }).pop();
      g.S(S.plank);
      for (const sx of [-0.55, 0.55]) g.push().translate(sx, 1.45, 0.06).box(0.04, 0.18, 0.12, { color: 0x5a4430 }).pop();
      g.push().translate(0, 1.57, 0.12);
      if (use === 'bar') clutter.bottles(g, 5, rnd); else clutter.goods(g, 1.2, rnd);
      g.pop();
    }
    g.pop();
  }
}

/**
 * Ruins: heaps of rubble against the walls; and in a Maker foundry a smokestack,
 * pipe runs along a wall and a machine that still hums.
 */
function dressRuin(g: KitBuilder, glow: GeoBuilder, b: WObj, d: BuildingData, t: number, furn: { x: number; z: number; r: number }[], rnd: () => number) {
  const hw = d.w / 2, hd = d.d / 2;
  g.S(S.rubble);
  for (const s of wallSpots(d, t, t + 0.6, furn, rnd, 2.6)) {
    if (rnd() < 0.45) continue;
    for (let i = 0; i < 4; i++) g.push().translate(s.x + (rnd() - 0.5) * 1.2, 0.1, s.z + (rnd() - 0.5) * 0.8).rotateY(rnd() * 3).scale(1, 0.6, 1).dodeca(0.22 + rnd() * 0.25, { color: dk(0x8a8a86, 0.75 + rnd() * 0.35) }).pop();
  }
  const site = b.site ? G.T?.sites.find((st) => st.id === b.site) : null;
  if (!site || site.kind !== 'foundry' || d.w < 16) return;
  // a smokestack at a back corner
  g.S(S.concrete).push().translate(hw - 1.2, -0.5, -hd - 1.3).cyl(0.75, 1.0, 15, 10, { color: 0x7a7672 }).pop();
  g.S(S.metal).push().translate(hw - 1.2, 14.5, -hd - 1.3).cyl(0.82, 0.82, 0.4, 10, { color: 0x3a3634 }).pop();
  for (const y of [4, 9]) g.push().translate(hw - 1.2, y, -hd - 1.3).cyl(0.8, 0.8, 0.12, 10, { color: 0x5a4a40 }).pop();
  // pipes along the back wall, inside
  g.S(S.metal);
  for (const [y, r] of [[2.4, 0.16], [2.9, 0.1]]) g.push().translate(0, y, -hd + t + 0.3).rotateZ(Math.PI / 2).cyl(r, r, d.w - t * 2 - 0.4, 7, { color: y > 2.5 ? 0x6a4a3a : 0x5a5e62 }).pop();
  // and a machine with a lit panel, where the floor is clear
  const spots = [[0, 0], [hw * 0.4, -hd * 0.3], [-hw * 0.4, -hd * 0.3]];
  for (const [mx, mz] of spots) {
    if (furn.some((f) => Math.hypot(f.x - mx, f.z - mz) < f.r + 2.2)) continue;
    g.S(S.metal).push().translate(mx, 0.05, mz).block(3, 1.8, 2, { color: 0x4a5058 }).pop();
    g.push().translate(mx - 0.8, 1.85, mz).cyl(0.5, 0.5, 0.9, 8, { color: 0x5a5e62 }).pop();
    g.push().translate(mx + 0.7, 1.85, mz + 0.3).block(0.9, 0.7, 0.9, { color: 0x3a3e44 }).pop();
    glow.push().translate(mx, 1.2, mz + 1.02).box(1.4, 0.2, 0.02, { color: [0.6, 2.6, 4] }).pop();
    break;
  }
}

/** Barrels, crates, firewood and pots against the outside walls, set on the ground. */
function dressYard(g: KitBuilder, b: WObj, d: BuildingData, t: number, style: string, rnd: () => number) {
  if (!b.id || !G.T || b.owner === 'player') return;
  const use = d.use;
  if (use === 'stall' || use === 'pen' || use === 'tower' || use === 'ruin' || use === 'dome') return;
  const n = use === 'tent' || use === 'hut' ? 1 : 1 + Math.floor(rnd() * 3);
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  for (let i = 0; i < n; i++) {
    const side = (['e', 'w', 'n', 's'] as Side[])[Math.floor(rnd() * (d.w * d.d > 60 ? 4 : 3))];
    const len = side === 's' || side === 'n' ? d.w : d.d;
    const a = (rnd() - 0.5) * (len - 1.6);
    if (nearDoor(d.doors, side, a, 1.6)) continue;
    const out = (side === 's' || side === 'n' ? d.d : d.w) / 2 + 0.55;
    const lx = side === 's' || side === 'n' ? a : side === 'e' ? out : -out;
    const lz = side === 'e' || side === 'w' ? a : side === 's' ? out : -out;
    const wx = b.x + lx * c + lz * s, wz = b.z - lx * s + lz * c;
    const ly = G.T.heightAt(wx, wz) - b.y;
    if (ly < -1.4 || ly > 0.3) continue;
    g.push().translate(lx, ly, lz).rotateY(rnd() * 6.28);
    const r = rnd();
    if (r < 0.3) { clutter.barrel(g, rnd() < 0.5 ? 0x6a5a48 : 0x7a5a38); if (rnd() < 0.5) { g.push().translate(0.75, 0, 0.1); clutter.barrel(g); g.pop(); } }
    else if (r < 0.5) clutter.crate(g, 0.8);
    else if (r < 0.68 && (use === 'house' || use === 'farmhouse' || use === 'hut' || use === 'tent')) clutter.firewood(g);
    else if (r < 0.82) { clutter.pot(g, style === 'adobe' || style === 'karuk' || style === 'ember' ? 0xb0704a : 0x8a7a5a); g.push().translate(0.45, 0, 0.2); clutter.pot(g, 0x9a6a44); g.pop(); }
    else if (use === 'house' || use === 'farmhouse') clutter.trough(g);
    else clutter.sack(g);
    g.pop();
  }
}

/** Builds the meshes for a building from its data and furniture. */
export function buildBuilding(b: WObj, furniture: WObj[]): BuildingMeshes {
  const d = b.data as BuildingData;
  const st = STYLES[d.style] ?? STYLES.shanty;
  const kit = kitFor(d.style);
  const rnd = geoRand(d.seed);
  const g = new KitBuilder();
  const glow = new GeoBuilder();
  const hw = d.w / 2, hd = d.d / 2, H = d.h, t = Math.max(0.2, st.thick);
  const wall = d.wallCol, trim = st.trim;
  const ruin = d.roof === 'broken';
  const lift = d.stilts;
  const pools: LightPool[] = [];
  // what is inside a roofed room goes in a mesh of its own (see BuildingMeshes)
  const roofed = !ruin && d.roof !== 'none' && d.use !== 'stall' && d.use !== 'pen';
  // your own buildings are dark at night until you put a light in them
  const unlit = b.owner === 'player' && !furniture.some((f) => LIT[f.def] !== undefined);
  const gi = roofed ? new KitBuilder() : g;
  // stilts and foundation
  if (lift > 0) {
    g.S(S.bark);
    for (const [px, pz] of [[-hw + 0.3, -hd + 0.3], [hw - 0.3, -hd + 0.3], [-hw + 0.3, hd - 0.3], [hw - 0.3, hd - 0.3], [0, -hd + 0.3], [0, hd - 0.3]]) g.push().translate(px, -lift - 3, pz).cyl(0.15, 0.18, lift + 3, 6, { color: 0x4a3a2a }).pop();
    // cross bracing between the stilts, and a ramp to the door
    g.S(S.plank);
    for (const pz of [-hd + 0.3, hd - 0.3]) g.push().translate(0, -lift * 0.5, pz).rotateZ(Math.atan2(lift * 0.8, d.w - 0.6)).box(Math.hypot(lift * 0.8, d.w - 0.6), 0.1, 0.06, { color: 0x4a3a2a }).pop();
    for (const dr of d.doors) if (dr.side === 's') g.push().translate(dr.off, -lift / 2, hd + 1.4).rotateX(-Math.atan2(lift, 2.8)).box(dr.w, 0.12, Math.hypot(lift, 2.8), { color: 0x6a5a40 }).pop();
    g.push().translate(0, -0.08, hd + 0.45).box(d.w, 0.1, 0.9, { color: 0x5a4a36 }).pop();
  } else g.S(kit.found).push().translate(0, -1.5, 0).box(d.w + 0.2, 3, d.d + 0.2, { color: dk(st.floor, 0.8) }).pop();
  gi.S(kit.floor).push().translate(0, 0.02, 0).box(d.w - 0.1, 0.06, d.d - 0.1, { color: st.floor }).pop();

  const round = st.round && d.use !== 'stall';
  const lightCol: [number, number, number] = d.style === 'hollow' || d.style === 'delver' || d.style === 'ruin' ? [0.6, 2.4, 3.8] : [1.25, 0.82, 0.36];
  if (d.use === 'stall') {
    g.S(S.bark);
    for (const [px, pz] of [[-hw + 0.2, -hd + 0.2], [hw - 0.2, -hd + 0.2], [-hw + 0.2, hd - 0.2], [hw - 0.2, hd - 0.2]]) g.push().translate(px, 0, pz).cyl(0.07, 0.08, 2.6, 6, { color: trim }).pop();
    // a cloth hung at the back, goods in baskets and crates
    g.S(S.cloth).push().translate(0, 1.5, -hd + 0.2).box(d.w - 0.4, 1.6, 0.03, { color: [0x8a3a2a, 0x3a5a6a, 0xa88a4a][Math.floor(rnd() * 3)] }).pop();
    for (let i = 0; i < 3; i++) {
      g.push().translate(-hw + 0.9 + i * (d.w - 1.8) / 2, 0.05, -hd + 0.75);
      if (i === 1) clutter.crate(g, 0.6); else clutter.sack(g, [0xb8a07a, 0xa89068][i % 2]);
      g.pop();
    }
    for (let i = 0; i < 4; i++) {
      g.S(S.thatch).push().translate(-1.1 + i * 0.75, 1.07, 0.6).cyl(0.22, 0.16, 0.16, 8, { color: 0x9a7a4a }).pop();
      g.S(S.plain).push().translate(-1.1 + i * 0.75, 1.2, 0.6).scale(1, 0.5, 1).ico(0.18, 0, { color: [0xb84a2a, 0xc8a040, 0x6a8a3a, 0x8a5a7a][(i + Math.floor(rnd() * 4)) % 4] }).pop();
    }
  } else if (d.use === 'pen') {
    g.S(S.bark);
    const posts = Math.round((d.w + d.d) * 2 / 1.2);
    for (let i = 0; i < posts; i++) {
      const p = (i / posts) * (d.w + d.d) * 2;
      let px, pz;
      if (p < d.w) { px = -hw + p; pz = -hd; } else if (p < d.w + d.d) { px = hw; pz = -hd + (p - d.w); } else if (p < 2 * d.w + d.d) { px = hw - (p - d.w - d.d); pz = hd; } else { px = -hw; pz = hd - (p - 2 * d.w - d.d); }
      g.push().translate(px, 0, pz).cyl(0.07, 0.09, 1.8, 5, { color: 0x5a4a36 }).pop();
    }
    g.S(S.plank);
    for (const yy of [0.6, 1.4]) {
      g.push().translate(0, yy, -hd).box(d.w, 0.08, 0.06, { color: 0x6a5840 }).pop();
      g.push().translate(0, yy, hd).box(d.w, 0.08, 0.06, { color: 0x6a5840 }).pop();
      g.push().translate(-hw, yy, 0).box(0.06, 0.08, d.d, { color: 0x6a5840 }).pop();
      g.push().translate(hw, yy, 0).box(0.06, 0.08, d.d, { color: 0x6a5840 }).pop();
    }
    g.S(S.thatch).push().translate(0, 0.07, hd * 0.4).box(d.w * 0.7, 0.04, d.d * 0.4, { color: 0x9a8858 }).pop();
  } else if (round) {
    // round walls with a doorway gap on the front
    const R = Math.min(hw, hd), seg = 14;
    const wallTop = d.style === 'hive' || d.style === 'hive_dead' ? 1.3 : H * 0.8;
    g.S(wallSurf(kit.wall, kit.inner));
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      if (Math.abs(Math.atan2(Math.sin(am), Math.cos(am))) < 0.26) continue; // door at +z
      const x0 = Math.sin(a0) * R, z0 = Math.cos(a0) * R, x1 = Math.sin(a1) * R, z1 = Math.cos(a1) * R;
      g.push().translate((x0 + x1) / 2, wallTop / 2, (z0 + z1) / 2).rotateY(am).box(Math.hypot(x1 - x0, z1 - z0) + 0.05, wallTop, t, { color: dk(wall, 0.9 + rnd() * 0.15) }).pop();
    }
    if (kit.door !== 'none') {
      g.push().translate(0, 0, R);
      drawDoor(g, kit.door, 0, 2 * R * Math.sin(0.26), Math.min(2.3, wallTop - 0.1), t, d.style === 'hide' ? 0xd8ccb0 : dk(trim, 1.1), kit.leaf, rnd);
      g.pop();
    }
  } else {
    // four walls with doorways, and the windows and doors dressed in each wall's own frame
    const doorH = 2.4;
    const sides: [Side, number, number, boolean][] = [['s', d.w, hd - t / 2, true], ['n', d.w, -hd + t / 2, true], ['e', d.d, hw - t / 2, false], ['w', d.d, -hw + t / 2, false]];
    for (const [side, len, fixed, horiz] of sides) {
      const doors = d.doors.filter((x) => x.side === side).sort((a, b) => a.off - b.off);
      let from = -len / 2;
      const topFor = () => (ruin ? H * (0.3 + rnd() * 0.7) : H);
      for (const dr of doors) {
        wallRun(g, from, dr.off - dr.w / 2, fixed, 0, topFor(), t, wall, horiz, kit, d.style, rnd);
        if (!ruin) wallRun(g, dr.off - dr.w / 2, dr.off + dr.w / 2, fixed, doorH, H, t, wall, horiz, kit, d.style, rnd);
        from = dr.off + dr.w / 2;
      }
      wallRun(g, from, len / 2, fixed, 0, topFor(), t, wall, horiz, kit, d.style, rnd);
      frame(g, side, hw, hd);
      frame(glow, side, hw, hd);
      for (const dr of doors) drawDoor(g, ruin ? 'none' : kit.door, fxOf(side, dr.off), dr.w, doorH, t, trim, kit.leaf, rnd);
      // windows, lit at night in some
      if (!ruin && d.use !== 'tower' && len > 6) {
        const nw = Math.floor(len / 4.5);
        const shutter = kit.shutters[Math.floor(rnd() * kit.shutters.length)];
        for (let i = 0; i < nw; i++) {
          const wx = -len / 2 + (i + 0.5) * (len / nw);
          if (doors.some((dr) => Math.abs(dr.off - wx) < dr.w)) continue;
          const x = fxOf(side, wx);
          const pane = drawWindow(g, kit.win, x, 1.7, trim, shutter, rnd, !!kit.planters && rnd() < 0.35);
          if (pane && rnd() < 0.5 && !unlit) glow.push().translate(pane[0], pane[1], 0.025).box(pane[2], pane[3], 0.01, { color: [1.2, 0.8, 0.35] }).pop();
          // the same window seen from inside
          if (pane) g.S(S.glass).push().translate(x, 1.7 - pane[3] / 2 - 0.04, -t - 0.012).rotateY(Math.PI).quad(pane[2] + 0.08, pane[3] + 0.08, { color: 0x1a1612 }).pop();
        }
      }
      // half-timbering: posts between the openings, a sill beam and a top plate
      if (kit.timber && !ruin) {
        g.S(S.plank);
        const tc = dk(trim, 1.05);
        const posts: number[] = [-len / 2 + 0.15, len / 2 - 0.15];
        const nw = len > 6 ? Math.floor(len / 4.5) : 0;
        for (let i = 0; i <= nw; i++) { const px = -len / 2 + (i * len) / Math.max(1, nw); if (i > 0 && i < nw) posts.push(px); }
        for (const px of posts) if (!nearDoor(doors, side, px, 0.3)) g.push().translate(fxOf(side, px), H / 2, 0.03).box(0.18, H, 0.06, { color: tc }).pop();
        let a = -len / 2;
        const spans: [number, number][] = [];
        for (const dr of doors) { spans.push([a, dr.off - dr.w / 2 - 0.12]); a = dr.off + dr.w / 2 + 0.12; }
        spans.push([a, len / 2]);
        for (const [s0, s1] of spans) if (s1 - s0 > 0.1) g.push().translate(fxOf(side, (s0 + s1) / 2), 0.62, 0.03).box(s1 - s0, 0.16, 0.06, { color: tc }).pop();
        g.push().translate(0, H - 0.2, 0.03).box(len, 0.2, 0.07, { color: tc }).pop();
      }
      g.pop();
      glow.pop();
    }
    // corner posts and beams
    if (!ruin && (d.style === 'concord' || d.style === 'swamp' || d.style === 'shanty' || d.style === 'stone')) {
      g.S(d.style === 'swamp' ? S.bark : d.style === 'stone' ? S.stone : S.plank);
      for (const [px, pz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) g.push().translate(px, 0, pz).block(d.style === 'stone' ? 0.42 : 0.3, H, d.style === 'stone' ? 0.42 : 0.3, { color: d.style === 'stone' ? dk(wall, 0.85) : trim }).pop();
    }
    if (st.beams) {
      g.S(S.bark);
      for (let i = 0; i < Math.floor(d.w / 1.4); i++) g.push().translate(-hw + 0.7 + i * 1.4, H - 0.35, hd + 0.3).rotateX(Math.PI / 2).cyl(0.09, 0.09, 0.8, 6, { color: trim }).pop();
    }
    if (d.style === 'hollow') {
      g.S(S.metal).push().translate(0, H * 0.55, hd + 0.02).box(d.w * 0.9, 0.08, t, { color: 0x3a3e44 }).pop();
      glow.push().translate(0, H * 0.55, hd + t / 2 + 0.03).box(d.w * 0.85, 0.05, 0.01, { color: [0.5, 2.2, 3.5] }).pop();
    }
    if (d.style === 'ember') {
      g.S(S.stone).push().translate(0, H - 0.4, hd + 0.01).box(d.w, 0.18, t + 0.02, { color: 0xc86a2a }).pop();
      // a cornice round the top of the walls (not over the room: you see in when the dome lifts)
      for (const [px, pz, cw, cd] of [[0, hd - t / 2, d.w + 0.24, t + 0.24], [0, -hd + t / 2, d.w + 0.24, t + 0.24], [hw - t / 2, 0, t + 0.24, d.d], [-hw + t / 2, 0, t + 0.24, d.d]] as [number, number, number, number][]) g.push().translate(px, H - 0.08, pz).box(cw, 0.16, cd, { color: dk(wall, 0.9) }).pop();
    }
    if (d.style === 'adobe' || d.style === 'karuk') {
      // waterspouts through the parapet
      g.S(S.plank);
      for (const sx of [-0.3, 0.3]) g.push().translate(sx * d.w, H + 0.15, hd + 0.3).box(0.16, 0.12, 0.7, { color: 0x5a4430 }).pop();
    }
  }
  // shops: an awning over the door, a hanging sign beside it, and the bar's name board
  if (d.shop && d.use !== 'stall' && !round) {
    const dr = d.doors[0];
    if (dr) {
      const sc = d.shop === 'bar' ? 0x7a3a24 : d.shop === 'weapons' ? 0x5a5a60 : d.shop === 'armour' ? 0x4a5a4a : d.shop === 'robotics' || d.shop === 'tech' ? 0x3a5a6a : d.shop === 'slaves' ? 0x3a2a2a : 0x6a5030;
      frame(g, dr.side, hw, hd);
      frame(glow, dr.side, hw, hd);
      const x = fxOf(dr.side, dr.off);
      const cloth = [0xa8442e, 0x3a5a6a, 0x5a6a3a, 0x8a5a2a][Math.floor(rnd() * 4)];
      drawAwning(g, x, dr.w + 1.5, 2.95, 1.7, kit.awning, kit.awning === 'cloth' ? cloth : kit.awning === 'plank' ? 0x6a5038 : 0x7a7a74);
      const sx = x + (dr.w / 2 + 1.0) * (rnd() < 0.5 ? -1 : 1);
      if (H > 3) drawHangingSign(g, sx, Math.min(H - 0.15, 3.3), d.shop, sc);
      if ((d.shop === 'bar' || d.w >= 14) && H >= 3.5) {
        const by = H - 0.32;
        g.S(S.plank).push().translate(x, by, 0.06).box(2.4, 0.5, 0.08, { color: sc }).pop();
        g.S(S.plain).push().translate(x, by, 0.11).box(2.0, 0.2, 0.02, { color: 0xd8c8a0 }).pop();
        g.push().translate(x - 1.45, by, 0.04);
        drawEmblem(g, d.shop, 0.7);
        g.pop();
      }
      // a lantern by the door
      const lx = x + (dr.w / 2 + 0.5) * (sx > x ? -1 : 1);
      g.push().translate(lx, 2.35, 0);
      clutter.lantern(g, glow, lx, 2.22, 0.25);
      g.pop();
      g.pop();
      glow.pop();
    }
  }
  // furniture, and the lights in the room
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const furn: { x: number; z: number; r: number }[] = [];
  const lights: [number, number, number][] = [];
  for (const f of furniture) {
    const dx = f.x - b.x, dz = f.z - b.z;
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    drawFurniture(gi, f.def, lx, 0.05, lz, f.rot - b.rot, f.data, glow);
    const fp = FURN[f.def];
    furn.push({ x: lx, z: lz, r: f.data?.len ? f.data.len / 2 : fp ? Math.max(fp[0], fp[1]) + 0.2 : 0.7 });
    if (LIT[f.def] !== undefined) lights.push([lx, LIT[f.def], lz]);
  }
  // (your own buildings hold only what you put in them)
  if (ruin) dressRuin(g, glow, b, d, t, furn, rnd);
  else if (b.owner !== 'player') dressRoom(gi as KitBuilder, d, t, kit, furn, rnd);
  dressYard(g, b, d, t, d.style, rnd);
  // somewhere to see by: a lantern hung from the middle of the room if nothing else gives light
  const dark = !lights.length && d.use !== 'tower' && d.use !== 'pen' && d.use !== 'stall' && !ruin && !unlit;
  if (dark) {
    const hy = round ? Math.min(H * 0.8, 2.6) : H - 0.65;
    const free = !furn.some((f) => Math.hypot(f.x, f.z) < f.r + 0.2);
    const lx = free ? 0 : 0.6, lz = free ? 0 : -0.5;
    gi.push().translate(lx, hy, lz);
    clutter.lantern(gi, glow, lx, hy - 0.13, lz, lightCol[2] > 1 ? [0.5, 2.0, 3.2] : [3.2, 2.0, 0.85], true);
    gi.pop();
    lights.push([lx, hy - 0.13, lz]);
  }
  if (lights.length) {
    let lx = 0, ly = 0, lz = 0;
    for (const l of lights) { lx += l[0]; ly += l[1]; lz += l[2]; }
    lx /= lights.length; ly /= lights.length; lz /= lights.length;
    const R = Math.min(16, Math.max(5.5, Math.max(d.w, d.d) * 0.85));
    g.lamp = gi.lamp = [lx, Math.max(ly, 1.6), lz, R + (lightCol[2] > 1 ? 1000 : 0)];
    for (const l of lights) pools.push([l[0], 0.08, l[2], Math.min(5.5, R * 0.5)]);
    // light spills out of the front door at night
    const dr = d.doors[0];
    if (dr && dr.side === 's' && b.id && G.T && lift === 0) {
      const wx = b.x + dr.off * c + (hd + 1.1) * s, wz = b.z - dr.off * s + (hd + 1.1) * c;
      pools.push([dr.off, G.T.heightAt(wx, wz) - b.y + 0.08, hd + 1.1, 2.6]);
    }
  }
  const shell = new THREE.Mesh(g.build(), buildingMat);
  shell.castShadow = true;
  shell.receiveShadow = true;
  let interior: THREE.Mesh | null = null;
  if (gi !== g && gi.vertexCount) {
    interior = new THREE.Mesh(gi.build(), buildingMat);
    interior.receiveShadow = true;
    shell.add(interior);
  }
  // roof
  let roof: THREE.Mesh | null = null;
  if (!ruin && d.roof !== 'none') {
    const r = new KitBuilder();
    const rc = d.roofCol;
    const ov = d.style === 'concord' ? 1.1 : d.style === 'shanty' ? 0.5 : 0.35;
    const kind = round ? (st.roofType === 'cone' ? 'cone' : 'dome') : d.use === 'stall' ? 'shed' : d.roof;
    r.S(d.use === 'stall' ? S.cloth : kind === 'tent' ? S.cloth : kit.roof);
    switch (kind) {
      case 'flat':
        r.push().translate(0, H + 0.12, 0).box(d.w + 0.1, 0.24, d.d + 0.1, { color: rc }).pop();
        if (st.parapet) {
          r.S(wallSurf(kit.wall, kit.wall));
          for (const [px, pz, w, dd] of [[0, hd, d.w + 0.1, t], [0, -hd, d.w + 0.1, t], [hw, 0, t, d.d], [-hw, 0, t, d.d]] as [number, number, number, number][]) r.push().translate(px, H + 0.5, pz).box(w, 0.8, dd, { color: dk(wall, 0.95) }).pop();
        }
        if (d.style === 'karuk') { r.S(S.bone); for (const [px, pz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) r.push().translate(px, H + 0.9, pz).rotateZ(px > 0 ? -0.4 : 0.4).cone(0.12, 0.9, 5, { color: 0xd8ccb0 }).pop(); }
        // things kept on a flat roof: a water barrel, a crate, a hatch
        if (d.w * d.d > 40) {
          r.push().translate(hw * 0.5, H + 0.24, -hd * 0.45);
          clutter.barrel(r, 0x6a5a48);
          r.pop();
          r.push().translate(-hw * 0.45, H + 0.24, hd * 0.3).rotateY(rnd());
          if (rnd() < 0.6) clutter.crate(r, 0.7); else clutter.pot(r);
          r.pop();
          r.S(S.plank).push().translate(-hw * 0.2, H + 0.3, -hd * 0.3).box(0.9, 0.08, 0.9, { color: 0x5a4430 }).pop();
        }
        break;
      case 'shed': {
        const rise = d.w * 0.12 + 0.3;
        const stall = d.use === 'stall';
        const ang = Math.atan2(rise, d.d) * (stall ? -1 : 1);
        const y0 = H + rise / 2 + (stall ? -H + 2.7 : 0);
        if (stall) {
          // a striped canvas
          const cols = [[0xa8442e, 0xd8c8a0], [0x3a5a6a, 0xd8c8a0], [0x6a7a3a, 0xc8b070]][Math.floor(rnd() * 3)];
          const n = Math.max(4, Math.round((d.w + ov * 2) / 0.6));
          for (let i = 0; i < n; i++) r.push().translate(-hw - ov + (i + 0.5) * (d.w + ov * 2) / n, y0, 0).rotateX(ang).box((d.w + ov * 2) / n + 0.01, 0.06, Math.hypot(d.d, rise) + ov * 2, { color: cols[i % 2] }).pop();
        } else r.push().translate(0, y0, 0).rotateX(ang).box(d.w + ov * 2, 0.12, Math.hypot(d.d, rise) + ov * 2, { color: rc }).pop();
        if (st.corrugated && !stall) {
          // battens over the sheets, a few stones to hold them down, and a stovepipe
          r.S(S.plank);
          for (let i = 0; i < 3; i++) r.push().translate(-hw - ov + 0.3 + i * (d.w + ov * 2 - 0.6) / 2, y0 + 0.09, 0).rotateX(ang).box(0.1, 0.06, Math.hypot(d.d, rise) + ov * 2, { color: 0x5a4a38 }).pop();
          r.S(S.rock);
          for (let i = 0; i < 4; i++) { const zz = (rnd() - 0.5) * d.d * 0.8; r.push().translate((rnd() - 0.5) * d.w * 0.8, y0 - zz * Math.tan(ang) + 0.18, zz).dodeca(0.16 + rnd() * 0.08, { color: 0x7a7266, jitter: 0.05, seed: i + 2 }).pop(); }
          r.S(S.metal);
          const px = hw * (rnd() - 0.5), pz = -hd * 0.4;
          r.push().translate(px, H + rise * (0.5 - pz / d.d) - 0.2, pz).cyl(0.13, 0.13, 1.6, 8, { color: 0x3a3634 }).pop();
          r.push().translate(px, H + rise * (0.5 - pz / d.d) + 1.4, pz).cone(0.26, 0.22, 8, { color: 0x2e2a28 }).pop();
        }
        // fascia along the low edge
        if (!stall) r.S(S.plank).push().translate(0, y0 - Math.sin(ang) * (Math.hypot(d.d, rise) / 2 + ov) - 0.08, (Math.cos(ang) * (Math.hypot(d.d, rise) / 2 + ov))).box(d.w + ov * 2, 0.18, 0.05, { color: dk(rc, 0.75) }).pop();
        if (!stall) {
          // the walls carried up to the roof: a strip along the high back, a triangle each side
          r.S(wallSurf(kit.wall, kit.inner));
          r.push().translate(0, H + rise / 2, -hd + t / 2).box(d.w, rise, t, { color: dk(wall, 0.95) }).pop();
          for (const sx of [-1, 1]) {
            const x = sx * (hw - t / 2);
            const tri = new THREE.BufferGeometry();
            tri.setAttribute('position', new THREE.Float32BufferAttribute([x, H, -hd, x, H, hd, x, H + rise, -hd, x, H, hd, x, H, -hd, x, H + rise, -hd], 3));
            tri.computeVertexNormals();
            r.add(tri, { color: dk(wall, 0.95) });
          }
        }
        break;
      }
      case 'gable':
      case 'tent': {
        const rise = kind === 'tent' ? Math.min(d.w, d.d) * 0.55 : d.w * 0.35;
        const along = d.w >= d.d;
        const span = along ? d.d : d.w, len = along ? d.w : d.d;
        const ang = Math.atan2(rise, span / 2);
        const slope = Math.hypot(span / 2, rise) + ov;
        const base = kind === 'tent' ? 0.3 : H;
        for (const sd of [-1, 1]) {
          r.push().translate(0, base + rise / 2, 0);
          if (along) r.translate(0, 0, (sd * span) / 4).rotateX(sd * ang);
          else r.translate((sd * span) / 4, 0, 0).rotateZ(-sd * ang);
          r.box(along ? len + ov * 2 : slope, 0.12, along ? slope : len + ov * 2, { color: dk(rc, sd > 0 ? 1 : 0.9) });
          r.pop();
        }
        // gable ends, a ridge cap and barge boards
        r.S(kind === 'tent' ? S.cloth : wallSurf(kit.wall, kit.inner));
        for (const e of [-1, 1]) {
          r.push().translate(along ? (e * len) / 2 : 0, base, along ? 0 : (e * len) / 2).rotateY(along ? Math.PI / 2 : 0);
          const tri = new THREE.BufferGeometry();
          tri.setAttribute('position', new THREE.Float32BufferAttribute([-span / 2, 0, 0, span / 2, 0, 0, 0, rise, 0, span / 2, 0, 0, -span / 2, 0, 0, 0, rise, 0], 3));
          tri.computeVertexNormals();
          r.add(tri, { color: kind === 'tent' ? rc : wall });
          r.pop();
        }
        if (kind === 'gable') {
          r.S(kit.roof === S.thatch ? S.thatch : S.plank);
          r.push().translate(0, base + rise + 0.06, 0).rotateY(along ? 0 : Math.PI / 2).box(len + ov * 2 + 0.1, 0.16, 0.3, { color: dk(rc, 0.72) }).pop();
          r.S(S.plank);
          for (const e of [-1, 1]) for (const sd of [-1, 1]) {
            r.push().translate(along ? e * (len / 2 + ov) : 0, base + rise / 2 + 0.02, along ? 0 : e * (len / 2 + ov));
            if (along) r.translate(0, 0, (sd * span) / 4).rotateX(sd * ang);
            else r.translate((sd * span) / 4, 0, 0).rotateZ(-sd * ang);
            r.box(along ? 0.06 : slope, 0.22, along ? slope : 0.06, { color: dk(trim, 0.95) }).pop();
          }
          if (d.style === 'stone') {
            // a stone chimney through the roof
            const cx = along ? len * 0.28 : span * 0.15, cz = along ? span * 0.15 : len * 0.28;
            r.S(S.stone).push().translate(cx, H, cz).block(0.8, rise + 1.0, 0.8, { color: 0x8a8478 }).pop();
            r.push().translate(cx, H + rise + 1.0, cz).box(0.95, 0.12, 0.95, { color: 0x6a6458 }).pop();
          }
        } else {
          // canvas: a ridge pole and pegged edges
          r.S(S.bark).push().translate(0, base + rise + 0.02, 0).rotateY(along ? 0 : Math.PI / 2).rotateZ(Math.PI / 2).cyl(0.05, 0.05, len + ov * 2 + 0.3, 5, { color: 0x4a3a2a }).pop();
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
        // the hips and ridge capped, the eaves upturned at the corners, a fascia round the edge
        r.S(S.tile);
        for (const [px, pz] of [[-ex, -ez], [ex, -ez], [-ex, ez], [ex, ez]]) {
          const tx = Math.sign(px) * ridge, hl = Math.hypot(px - tx, rise, pz);
          r.push().translate((px + tx) / 2, H + rise / 2 + 0.05, pz / 2).rotateY(Math.atan2(px - tx, pz)).rotateX(Math.atan2(rise, Math.hypot(px - tx, pz))).box(0.22, 0.12, hl, { color: dk(rc, 0.7) }).pop();
        }
        if (st.eaves) for (const [px, pz] of [[-ex, -ez], [ex, -ez], [-ex, ez], [ex, ez]]) r.push().translate(px, H + 0.05, pz).rotateY(Math.atan2(px, pz)).rotateX(-0.9).cone(0.12, 0.7, 4, { color: dk(rc, 0.8) }).pop();
        r.push().translate(0, H + rise + 0.05, 0).box(ridge * 2 + 0.3, 0.15, 0.25, { color: dk(rc, 0.7) }).pop();
        r.S(S.plank);
        for (const [px, pz, w, dd] of [[0, ez, ex * 2, 0.06], [0, -ez, ex * 2, 0.06], [ex, 0, 0.06, ez * 2], [-ex, 0, 0.06, ez * 2]] as [number, number, number, number][]) r.push().translate(px, H - 0.06, pz).box(w, 0.2, dd, { color: dk(trim, 0.9) }).pop();
        break;
      }
      case 'dome': {
        const R = Math.min(hw, hd) + (round ? 0.4 : 0.1);
        const top = round ? (d.style === 'hive' || d.style === 'hive_dead' ? 1.2 : H * 0.8) : H;
        if (!round) r.push().translate(0, H, 0).cyl(R * 0.95, R, 0.4, 16, { color: dk(wall, 0.95) }).pop();
        r.push().translate(0, top + (round ? 0 : 0.35), 0).scale(round ? hw + 0.4 : R * 0.95, round ? (d.style.startsWith('hive') ? d.h * 0.9 : R * 0.8) : R * 0.8, round ? hd + 0.4 : R * 0.95);
        // faceted, so the plaster and comb patterns sit flat on each facet
        const dome = new THREE.SphereGeometry(1, 16, 7, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
        dome.computeVertexNormals();
        r.add(dome, { color: rc });
        r.pop();
        if (d.style === 'ember') {
          r.S(S.stone).push().translate(0, top + 0.35, 0).cyl(R * 0.97, R * 0.97, 0.16, 16, { color: 0xc86a2a }).pop();
          r.S(S.metal).push().translate(0, top + R * 0.8 + 0.2, 0).cone(0.25, 1.4, 6, { color: 0xd8b040 }).pop();
          r.push().translate(0, top + R * 0.8 + 0.25, 0).sphere(0.18, 6, 4, { color: 0xd8b040 }).pop();
        }
        if (d.style.startsWith('hive')) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; r.push().translate(Math.sin(a) * hw * 0.6, top + d.h * 0.5, Math.cos(a) * hd * 0.6).scale(1, 0.6, 1).sphere(0.5, 7, 4, { color: dk(rc, 0.75) }).pop(); }
        break;
      }
      case 'cone': {
        const R = Math.min(hw, hd) + 0.6;
        const ch = R * (d.style === 'hide' ? 1.6 : 0.9);
        const y0 = round ? H * 0.8 : H;
        r.push().translate(0, y0, 0).cone(R, ch, 14, { color: rc }).pop();
        // bound with rope near the top, and a topknot of thatch or poles through the smoke hole
        r.S(S.cloth);
        for (const k of [0.62, 0.8]) r.push().translate(0, y0 + ch * k, 0).cyl(R * (1 - k) + 0.04, R * (1 - k) + 0.06, 0.08, 12, { color: 0x6a5a3a }).pop();
        if (d.style === 'hide') { r.S(S.bark); for (let i = 0; i < 3; i++) r.push().translate(0, y0 + ch * 0.92, 0).rotateY(i * 2.1).rotateZ(0.3).cyl(0.04, 0.04, 1.2, 4, { color: 0xd8ccb0 }).pop(); }
        else r.S(S.thatch).push().translate(0, y0 + ch * 0.93, 0).cone(0.3, 0.5, 8, { color: dk(rc, 0.85) }).pop();
        break;
      }
    }
    if (d.floors > 1 && d.roof !== 'dome') {
      // decorative upper storey inside the roof mesh so it hides with it
      const uw = d.w * 0.7, ud = d.d * 0.7, uh = H * 0.8;
      r.S(wallSurf(kit.wall, kit.inner)).push().translate(0, H + 0.1, 0).block(uw, uh, ud, { color: dk(wall, 1.05) }).pop();
      for (const [side, len] of [['s', uw], ['n', uw]] as [Side, number][]) {
        frame(r, side, uw / 2, ud / 2);
        for (let i = 0; i < Math.floor(len / 3); i++) drawWindow(r, kit.win === 'slit' || kit.win === 'round' ? kit.win : 'shutter', -len / 2 + (i + 0.5) * (len / Math.floor(len / 3)), H + 0.1 + uh * 0.55, trim, kit.shutters[0], rnd);
        r.pop();
      }
    }
    roof = new THREE.Mesh(r.build(), roofMat);
    roof.castShadow = true;
    roof.receiveShadow = true;
  }
  const glowMesh = glow.vertexCount ? new THREE.Mesh(glow.build(), glowMat) : null;
  return { shell, roof, interior, glow: glowMesh, pools };
}

/** Town wall segment, gate or tower. */
export function buildWallPiece(o: WObj): THREE.Mesh {
  const g = new KitBuilder();
  const d = o.data;
  const st = d.style as string;
  if (o.kind === 'wall') {
    const len = d.len, h = d.h, t = d.thick;
    const rnd = geoRand(o.id * 31);
    switch (st) {
      case 'stone':
        g.S(S.stone).push().translate(0, h / 2 - 1, 0).box(t, h + 2, len + 0.2, { color: 0x9a9284 }).pop();
        for (let i = 0; i < Math.floor(len / 1.6); i++) g.push().translate(0, h + 0.45, -len / 2 + 0.8 + i * 1.6).box(t + 0.1, 0.9, 0.8, { color: 0x8a8274 }).pop();
        g.push().translate(0, h - 0.05, 0).box(t + 0.24, 0.16, len + 0.2, { color: 0x8a8274 }).pop();
        g.S(S.rubble).push().translate(0, 0.4, 0).box(t + 0.3, 0.8, len + 0.2, { color: 0x7a7266 }).pop();
        break;
      case 'palisade':
      case 'bone':
        g.S(st === 'bone' ? S.bone : S.bark);
        for (let i = 0; i < Math.floor(len / 0.45); i++) {
          const zz = -len / 2 + 0.22 + i * 0.45, hh = h * (0.85 + rnd() * 0.3);
          g.push().translate(0, -1, zz).cyl(0.22, 0.24, hh + 1, 6, { color: st === 'bone' ? 0xd8ccb0 : dk(0x6a5238, 0.85 + rnd() * 0.3) }).pop();
          g.push().translate(0, hh, zz).cone(0.22, 0.5, 6, { color: st === 'bone' ? 0xe8e0d0 : 0x5a4430 }).pop();
        }
        // lashed cross rails on the inside
        g.S(S.plank);
        for (const y of [1.0, h * 0.75]) g.push().translate(-0.28, y, 0).box(0.1, 0.16, len, { color: st === 'bone' ? 0x8a7a5a : 0x5a4430 }).pop();
        break;
      case 'fence':
        g.S(S.bark);
        for (let i = 0; i <= Math.floor(len / 2); i++) g.push().translate(0, 0, -len / 2 + i * 2).cyl(0.06, 0.08, h, 5, { color: 0x6a5238 }).pop();
        g.S(S.plank);
        for (const y of [0.5, 1.1]) g.push().translate(0, y, 0).box(0.06, 0.1, len, { color: 0x7a6040 }).pop();
        break;
      case 'metal':
        g.S(S.metal).push().translate(0, h / 2 - 1, 0).box(t, h + 2, len + 0.1, { color: 0x5a6068 }).pop();
        for (let i = 0; i < Math.floor(len / 3); i++) g.push().translate(0, h / 2, -len / 2 + 1.5 + i * 3).box(t + 0.08, h, 0.12, { color: 0x3a3e44 }).pop();
        g.push().translate(0, h + 0.08, 0).box(t + 0.16, 0.16, len + 0.1, { color: 0x3a3e44 }).pop();
        break;
      case 'wax':
        g.S(S.wax).push().translate(0, h / 2 - 1, 0).box(t, h + 2, len + 0.3, { color: 0xb89038 }).pop();
        break;
      default: // scrap
        for (let i = 0; i < Math.ceil(len / 1.5); i++) {
          const zz = -len / 2 + 0.75 + i * 1.5;
          const hh = h * (0.8 + rnd() * 0.35);
          const k = Math.floor(rnd() * 4);
          g.S(k === 1 ? S.metal : k === 3 ? S.plank : S.corrugated);
          g.push().translate((rnd() - 0.5) * 0.2, hh / 2 - 0.8, zz).rotateX((rnd() - 0.5) * 0.08).box(t * 0.4, hh + 1.6, 1.55, { color: [0x7a5a44, 0x6a6a68, 0x8a6a4a, 0x5a4a3e][k] }).pop();
        }
        g.S(S.bark).push().translate(-t * 0.3, h * 0.55, 0).box(0.12, 0.14, len, { color: 0x4a3a2a }).pop();
    }
  } else if (o.kind === 'gate') {
    const w = d.w;
    const h = st === 'fence' ? 2.2 : st === 'stone' ? 7 : 5.5;
    const col = st === 'stone' ? 0x8a8274 : st === 'metal' ? 0x4a5058 : st === 'bone' ? 0xd8ccb0 : 0x6a5238;
    const ps = st === 'stone' ? S.stone : st === 'metal' ? S.metal : st === 'bone' ? S.bone : S.plank;
    g.S(ps);
    for (const sd of [-1, 1]) g.push().translate(0, -1, sd * (w / 2 + 0.6)).block(1.6, h + 1, 1.2, { color: col }).pop();
    if (st !== 'fence') g.push().translate(0, h - 0.4, 0).box(1.6, 0.8, w + 2.4, { color: col }).pop();
    g.S(S.plank);
    if (!o.open) g.push().translate(0, 0, 0).block(0.25, h - 1, w, { color: 0x4a3a2a }).pop();
    else for (const sd of [-1, 1]) {
      g.push().translate(0.9, 0, sd * (w / 2 - 0.1)).rotateY(sd * 1.3).translate(0, 0, -sd * w / 4);
      g.block(0.2, h - 1.2, w / 2, { color: 0x4a3a2a });
      g.S(S.metal);
      for (const y of [0.6, h - 2.0]) g.push().translate(0.11, y, 0).box(0.03, 0.14, w / 2 - 0.1, { color: 0x2e2c2a }).pop();
      g.S(S.plank);
      g.pop();
    }
    g.S(S.cloth);
    if (st === 'stone' || st === 'palisade' || st === 'scrap') for (const sd of [-1, 1]) g.push().translate(-0.9, h * 0.75, sd * (w / 2 + 0.6)).box(0.1, 1.4, 0.8, { color: 0x8a3a24 }).pop();
  } else {
    // tower
    const h = d.h, r = d.r;
    const col = st === 'stone' ? 0x9a9284 : st === 'metal' ? 0x5a6068 : 0x6a5238;
    if (st === 'stone' || st === 'metal') {
      g.S(st === 'stone' ? S.stone : S.metal);
      g.push().translate(0, -1, 0).cyl(r * 0.9, r, h + 1, 10, { color: col }).pop();
      g.push().translate(0, h, 0).cyl(r * 1.15, r * 1.15, 0.5, 10, { color: dk(col, 0.9) }).pop();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.push().translate(Math.sin(a) * r, h + 0.5, Math.cos(a) * r).block(0.6, 0.8, 0.6, { color: col }).pop(); }
    } else {
      // posts up past the platform to a roof with headroom under it for a lookout, and a rail round it
      g.S(S.bark);
      for (const [px, pz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) g.push().translate(px * 0.8, -1, pz * 0.8).cyl(0.18, 0.2, h + 2.2, 6, { color: col }).pop();
      g.S(S.plank);
      for (const [px, pz] of [[0, -r * 0.8], [0, r * 0.8]]) g.push().translate(px, h * 0.45, pz).rotateZ(Math.atan2(h * 0.6, r * 1.6)).box(Math.hypot(h * 0.6, r * 1.6), 0.12, 0.08, { color: dk(col, 0.85) }).pop();
      g.S(S.floor).push().translate(0, h - 1, 0).box(r * 2.2, 0.25, r * 2.2, { color: dk(col, 1.1) }).pop();
      g.S(S.plank);
      for (const [px, pz, rw, rd] of [[0, -r * 1.05, r * 2.2, 0.08], [0, r * 1.05, r * 2.2, 0.08], [-r * 1.05, 0, 0.08, r * 2.2], [r * 1.05, 0, 0.08, r * 2.2]]) g.push().translate(px, h - 0.05, pz).box(rw, 0.1, rd, { color: col }).pop();
      g.S(S.thatch).push().translate(0, h + 2, 0).rotateY(Math.PI / 4).cone(r * 1.5, 1.6, 4, { color: 0x7a6a4a }).pop();
    }
  }
  const m = new THREE.Mesh(g.build(), buildingMat);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/**
 * A crop field: furrows and plants, height by growth. Glowcaps shine at night
 * (their caps go in the glow mesh, which brightens after dark).
 */
export function buildField(o: WObj): { mesh: THREE.Mesh; glow: THREE.Mesh | null } {
  const g = new KitBuilder();
  const glow = new GeoBuilder();
  const d = o.data;
  const w = d.w, dd = d.d;
  const crop = d.crop as string;
  const col = crop === 'wheat' ? 0xc8b060 : crop === 'riceweed' ? 0x9aa860 : crop === 'cactus' ? 0x5a7a3a : crop === 'dreamleaf' ? 0x3e6a34 : crop === 'bloodthorn' ? 0x5a3a2a : 0x6a8a3a;
  const soil = crop === 'glowcap' ? 0x2e2a26 : crop === 'riceweed' ? 0x4a4a38 : 0x5a4a34;
  g.S(S.soil).push().translate(0, 0.02, 0).box(w, 0.05, dd, { color: soil }).pop();
  if (crop === 'riceweed') g.S(S.glass).push().translate(0, 0.06, 0).box(w - 0.3, 0.02, dd - 0.3, { color: 0x3a4a46 }).pop();
  // a low bank of earth round the edge
  g.S(S.soil);
  for (const [px, pz, bw, bd] of [[0, dd / 2, w + 0.3, 0.3], [0, -dd / 2, w + 0.3, 0.3], [w / 2, 0, 0.3, dd], [-w / 2, 0, 0.3, dd]] as [number, number, number, number][]) g.push().translate(px, 0.06, pz).box(bw, 0.14, bd, { color: dk(soil, 0.85) }).pop();
  const rows = Math.floor(dd / 1.1);
  const growth = Math.max(0.15, d.growth ?? 0.5);
  let seed = (o.id * 7919) % 1000;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const ripe = growth > 0.75;
  const grain = crop === 'wheat' || crop === 'riceweed' || crop === 'hemp';
  for (let r = 0; r < rows; r++) {
    const z = -dd / 2 + 0.55 + r * 1.1;
    g.S(S.soil).push().translate(0, 0.06, z).box(w - 0.4, 0.12, 0.42, { color: crop === 'glowcap' ? 0x3a3028 : 0x4a3c2a }).pop();
    // the row's canopy, a ridge as tall as the crop has grown, so a field reads as a field from afar
    if (crop !== 'cactus' && crop !== 'glowcap') {
      const ch = (grain ? (crop === 'hemp' ? 1.2 : 0.85) : 0.5) * growth + 0.06;
      const cc = ripe && crop === 'wheat' ? 0xc8a85a : crop === 'wheat' ? (growth > 0.5 ? 0xa8a858 : 0x7e9448) : col;
      g.S(S.grass).push().translate(0, 0.1, z).scale(1, ch / 0.36, 1).rotateX(Math.PI / 4).box(w - 0.7, 0.5, 0.5, { color: dk(cc, 0.92) }).pop();
    }
    const step = grain ? 1.1 : 0.9;
    for (let i = 0; i < Math.floor((w - 0.6) / step); i++) {
      const x = -w / 2 + 0.5 + i * step + (rnd() - 0.5) * 0.15;
      g.push().translate(x, 0.1, z + (rnd() - 0.5) * 0.12);
      g.S(S.grass);
      if (crop === 'cactus') g.S(S.cactus).cyl(0.12, 0.14, 0.7 * growth + 0.1, 8, { color: col });
      else if (crop === 'dreamleaf') {
        // broad drooping leaves, veined red as they ripen
        for (let k = 0; k < 5; k++) { g.push().rotateY(k * 1.26 + rnd()).rotateX(0.5); g.blade(0.26, 0.55 * growth + 0.1, 0.18, { color: growth > 0.8 && k % 2 ? 0x6a3a3a : col }); g.pop(); }
      } else if (crop === 'glowcap') {
        // pale stalks and blue caps, in clusters
        for (let k = 0; k < 3; k++) {
          const a = k * 2.1 + rnd(), rr = 0.12 + rnd() * 0.08, sh = (0.1 + rnd() * 0.12) * growth + 0.03, cap = (0.05 + rnd() * 0.04) * (0.4 + growth * 0.6);
          g.push().translate(Math.cos(a) * rr, 0, Math.sin(a) * rr).cyl(0.018, 0.024, sh, 5, { color: 0xd8e0d8 }).pop();
          glow.push().translate(x + Math.cos(a) * rr, 0.1 + sh, z + Math.sin(a) * rr).scale(1, 0.45, 1).sphere(cap, 7, 4, { color: [0.35, 1.1, 1.6] }).pop();
        }
      } else if (crop === 'bloodthorn') {
        // a thorny tangle with red pods
        for (let k = 0; k < 4; k++) { g.push().rotateY(k * 1.57 + rnd()); g.blade(0.05, 0.6 * growth + 0.12, 0.2 + rnd() * 0.15, { color: col }); g.pop(); }
        if (growth > 0.35) for (let k = 0; k < 3; k++) { const a = k * 2.1 + rnd(); g.push().translate(Math.cos(a) * 0.1, 0.25 + 0.3 * growth * rnd(), Math.sin(a) * 0.1).sphere(0.04 + 0.02 * growth, 5, 4, { color: 0xb02a20 }).pop(); }
      } else {
        // grain and fibre: a sheaf of stalks, golden heads on ripe wheat
        const tall = (crop === 'wheat' ? 1.0 : crop === 'hemp' ? 1.3 : 0.8) * growth + 0.1;
        const c2 = ripe && crop === 'wheat' ? 0xd8b868 : col;
        for (let k = 0; k < 5; k++) {
          g.push().rotateY(k * 1.25 + rnd()).rotateX((rnd() - 0.5) * 0.25);
          g.blade(0.07, tall * (0.8 + rnd() * 0.3), (rnd() - 0.5) * 0.25, { color: k % 2 ? c2 : dk(c2, 0.82) });
          g.pop();
        }
        if (crop === 'wheat' && growth > 0.5) for (let k = 0; k < 3; k++) { const a = k * 2.1 + rnd(); g.push().translate(Math.cos(a) * 0.05, tall * 0.92, Math.sin(a) * 0.05).rotateZ((rnd() - 0.5) * 0.4).cyl(0.025, 0.035, 0.16, 4, { color: ripe ? 0xe0c070 : 0xb8b060 }).pop(); }
      }
      g.pop();
    }
  }
  const m = new THREE.Mesh(g.build(), fieldMat);
  m.receiveShadow = true;
  return { mesh: m, glow: glow.vertexCount ? new THREE.Mesh(glow.build(), glowMat) : null };
}

/** A standalone outdoor object (plaza feature, well, cage in the open...). */
export function buildProp(o: WObj): { mesh: THREE.Mesh; glow: THREE.Mesh | null } {
  const g = new KitBuilder();
  const glow = new GeoBuilder();
  drawFurniture(g, o.def, 0, 0, 0, 0, o.data, glow);
  // glow was drawn in local coords with x/z = 0
  const mesh = new THREE.Mesh(g.build(), buildingMat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, glow: glow.vertexCount ? new THREE.Mesh(glow.build(), glowMat) : null };
}
