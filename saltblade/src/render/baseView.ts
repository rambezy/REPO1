// Ghost previews while placing buildings, and construction sites rising as
// work progresses.
import * as THREE from 'three';
import { Buildable, BUILDABLE } from '../content/buildables';
import { BUILDINGS, STYLES } from '../content/buildings';
import { WObj } from '../sim/objects';
import { buildBuilding, buildWallPiece, buildField, drawFurniture } from './buildings';
import { GeoBuilder } from './geo';

const ghostOK = new THREE.MeshBasicMaterial({ color: 0x8ce07a, transparent: true, opacity: 0.38, depthWrite: false });
const ghostBad = new THREE.MeshBasicMaterial({ color: 0xe0583a, transparent: true, opacity: 0.38, depthWrite: false });
const siteMat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.55, depthWrite: true });
const scaffoldMat = new THREE.MeshLambertMaterial({ vertexColors: true });

/** A stand-in object with the data the mesh builders expect. */
function fakeObj(b: Buildable, x: number, z: number, y: number, rot: number): WObj {
  const o: WObj = { id: 0, kind: b.kind, def: b.def, x, z, y, rot, owner: 'player', site: 0, parent: 0, data: { bkey: b.key, name: b.name } };
  if (b.kind === 'building') {
    const bd = BUILDINGS[b.building!];
    const st = STYLES[b.style ?? 'shanty'];
    o.data = { def: bd.key, name: b.name, use: bd.use, style: st.key, w: bd.w, d: bd.d, h: bd.h ?? st.wallH, doors: [{ side: 's', off: 0, w: 1.7 }], floors: bd.floors ?? 1, roof: st.roofType, stilts: 0, seed: 1, furniture: [], wallCol: st.wall[0], roofCol: st.roof[0] };
  }
  if (b.wall) o.data = { ...o.data, len: b.wall.len, h: b.wall.h, thick: b.w, style: b.wall.style };
  if (b.kind === 'gate') o.data = { ...o.data, w: b.d - 1.2, style: b.def };
  if (b.kind === 'tower') o.data = { ...o.data, h: 7, r: 2, style: 'palisade' };
  if (b.crop) o.data = { ...o.data, w: b.w, d: b.d, crop: b.crop, growth: 0.6 };
  return o;
}

export function buildableMesh(b: Buildable, o: WObj): THREE.Object3D {
  const root = new THREE.Group();
  if (b.kind === 'building') {
    const m = buildBuilding(o, []);
    root.add(m.shell);
    if (m.roof) root.add(m.roof);
  } else if (b.kind === 'wall' || b.kind === 'gate' || b.kind === 'tower') root.add(buildWallPiece(o));
  else if (b.kind === 'farm') { const f = buildField(o); root.add(f.mesh); if (f.glow) root.add(f.glow); }
  else {
    const g = new GeoBuilder();
    drawFurniture(g, b.def, 0, 0, 0, 0, o.data, null);
    root.add(new THREE.Mesh(g.build(), siteMat));
  }
  return root;
}

export class Ghost {
  obj: THREE.Object3D | null = null;
  key = '';
  constructor(public scene: THREE.Object3D) {}
  set(b: Buildable | null) {
    if (this.obj) { this.obj.removeFromParent(); this.obj.traverse((c) => (c as THREE.Mesh).geometry?.dispose()); this.obj = null; }
    this.key = b?.key ?? '';
    if (!b) return;
    this.obj = buildableMesh(b, fakeObj(b, 0, 0, 0, 0));
    this.obj.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.material = ghostOK; m.castShadow = false; m.renderOrder = 5; } });
    this.scene.add(this.obj);
  }
  place(x: number, y: number, z: number, rot: number, ok: boolean) {
    if (!this.obj) return;
    this.obj.position.set(x, y, z);
    this.obj.rotation.y = rot;
    this.obj.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) m.material = ok ? ghostOK : ghostBad; });
  }
}

/** Mesh for a construction site: the thing itself, faded, rising with progress, in scaffolding. */
export function buildSiteMesh(o: WObj): THREE.Object3D {
  const b = BUILDABLE[o.data.bkey];
  const root = new THREE.Group();
  root.position.set(o.x, o.y, o.z);
  root.rotation.y = o.rot;
  if (!b) return root;
  const p = Math.max(0.05, o.progress ?? 0);
  const inner = buildableMesh(b, fakeObj(b, 0, 0, 0, 0));
  inner.traverse((c) => { const m = c as THREE.Mesh; if (m.isMesh) { m.material = siteMat; } });
  inner.scale.y = b.kind === 'farm' ? 1 : 0.15 + 0.85 * p;
  root.add(inner);
  // scaffold posts and a pile of materials
  const g = new GeoBuilder();
  const hw = b.w / 2 + 0.3, hd = b.d / 2 + 0.3;
  const h = b.kind === 'building' ? 4 : 1.6;
  for (const [px, pz] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) g.push().translate(px, 0, pz).cyl(0.06, 0.07, h, 4, { color: 0x7a6040 }).pop();
  if (b.kind === 'building') for (const y of [1.5, 3]) {
    g.push().translate(0, y, -hd).box(b.w + 0.6, 0.08, 0.08, { color: 0x7a6040 }).pop();
    g.push().translate(0, y, hd).box(b.w + 0.6, 0.08, 0.08, { color: 0x7a6040 }).pop();
  }
  const have = Object.values(o.data.have as Record<string, number>).reduce((a, n) => a + n, 0);
  if (have > 0) g.push().translate(hw + 0.6, 0, 0).block(0.9, 0.2 + Math.min(1, have / 20) * 0.6, 0.9, { color: 0xa89a80 }).pop();
  root.add(new THREE.Mesh(g.build(), scaffoldMat));
  return root;
}
