// Keeps meshes for buildings, walls, fields, props, ore and loot piles near
// the camera, and hides the roofs of buildings your people are inside.
import * as THREE from 'three';
import { World } from '../sim/world';
import { WObj } from '../sim/objects';
import { buildBuilding, buildWallPiece, buildField, buildProp, BuildingMeshes } from './buildings';
import { GeoBuilder, geoRand } from './geo';
import { buildingAt } from '../sim/structures';
import { buildSiteMesh } from './baseView';

const TILE = 256;

// warm pools of light on the ground around lamps and fires, strongest at night
const poolU = { uNight: { value: 0 }, uTime: { value: 0 } };
const poolMat = new THREE.ShaderMaterial({
  uniforms: poolU,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float uNight, uTime; varying vec2 vUv;
    void main() {
      float r = length(vUv * 2.0 - 1.0);
      float flick = 0.88 + 0.12 * sin(uTime * 9.0 + vUv.x * 3.0) * sin(uTime * 5.3);
      float a = pow(max(0.0, 1.0 - r), 2.2) * uNight * flick;
      gl_FragColor = vec4(vec3(1.0, 0.62, 0.28) * a * 0.75, 1.0);
    }`,
});
const poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const POOL: Record<string, number> = { lamp: 7, campfire: 7, firepit: 8, brazier: 6, pyre: 14, fire: 8, stove: 3.5 };
function lightPool(def: string): THREE.Mesh | null {
  const r = POOL[def];
  if (!r) return null;
  const m = new THREE.Mesh(poolGeo, poolMat);
  m.scale.set(r * 2, 1, r * 2);
  m.position.y = 0.06;
  m.renderOrder = 4;
  m.frustumCulled = true;
  return m;
}
const FAR = 2600;
const NEAR = 700;

interface View { root: THREE.Object3D; roof?: THREE.Mesh | null; glow?: THREE.Mesh | null; key: string; }

const oreMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const oreGeo: Record<string, THREE.BufferGeometry> = {};
function oreGeometry(kind: string) {
  if (oreGeo[kind]) return oreGeo[kind];
  const g = new GeoBuilder();
  const r = geoRand(kind.length * 99);
  const rock = kind === 'iron' ? 0x6a5448 : kind === 'copper' ? 0x5e5a50 : 0xa8a298;
  const vein = kind === 'iron' ? 0xa84a32 : kind === 'copper' ? 0x3aa088 : 0xd8d4cc;
  g.push().translate(0, 0.5, 0).scale(1.4, 1, 1.2).dodeca(1, { color: rock, jitter: 0.45, seed: 11, grad: 0.35 }).pop();
  g.push().translate(0.9, 0.3, 0.5).scale(0.7).dodeca(1, { color: rock, jitter: 0.4, seed: 17, grad: 0.3 }).pop();
  for (let i = 0; i < 7; i++) {
    const a = r() * 6.28, h = 0.3 + r() * 0.9;
    g.push().translate(Math.cos(a) * 1.1, h, Math.sin(a) * 0.95).rotateZ(r() - 0.5).rotateX(r() - 0.5).scale(0.18, 0.3 + r() * 0.25, 0.18).octa(1, { color: vein }).pop();
  }
  oreGeo[kind] = g.build();
  return oreGeo[kind];
}

let pileGeo: THREE.BufferGeometry | null = null;
function pileGeometry() {
  if (pileGeo) return pileGeo;
  const g = new GeoBuilder();
  g.push().translate(0, 0.22, 0).scale(1, 0.75, 0.9).sphere(0.35, 7, 5, { color: 0x8a7a58 }).pop();
  g.push().translate(0.3, 0.12, 0.2).rotateY(0.6).box(0.5, 0.22, 0.35, { color: 0x6a5038 }).pop();
  g.push().translate(0, 0.5, 0).cyl(0.06, 0.1, 0.12, 5, { color: 0x5a4a38 }).pop();
  pileGeo = g.build();
  return pileGeo;
}

export class StructViews {
  group = new THREE.Group();
  glowMat: THREE.MeshBasicMaterial | null = null;
  private views = new Map<number, View>();
  private index = new Map<number, WObj[]>();
  private indexed = -1;
  private t = 0;
  hiddenRoofs = new Set<number>();
  buildBudget = 6;
  private pending: WObj[] = [];

  constructor(public W: World) {}

  private reindex() {
    this.index.clear();
    for (const o of this.W.objs.values()) {
      if (o.parent && o.kind !== 'cage') { const p = this.W.objs.get(o.parent); if (p && p.kind === 'building') continue; }
      const k = Math.floor(o.z / TILE) * 64 + Math.floor(o.x / TILE);
      let l = this.index.get(k);
      if (!l) this.index.set(k, (l = []));
      l.push(o);
    }
    this.indexed = this.W.objs.size;
  }

  /** Drops every mesh (after loading a save). */
  clear() {
    for (const v of this.views.values()) this.dispose(v);
    this.views.clear();
    this.pending = [];
    this.hiddenRoofs.clear();
    this.indexed = -1;
    this.t = 0;
  }

  /** Forces an object's mesh to be rebuilt. */
  refresh(o: WObj) {
    const v = this.views.get(o.id);
    if (v) { this.dispose(v); this.views.delete(o.id); }
    if (o.parent) { const p = this.W.objs.get(o.parent); if (p) this.refresh(p); }
  }

  private range(o: WObj) {
    return o.kind === 'building' || o.kind === 'wall' || o.kind === 'gate' || o.kind === 'tower' ? FAR : o.kind === 'farm' ? 1200 : NEAR;
  }

  update(dt: number, cam: THREE.Vector3, focus: THREE.Vector3, insiders: { x: number; z: number }[], night: number) {
    this.t -= dt;
    if (this.indexed !== this.W.objs.size) this.reindex();
    if (this.t <= 0) {
      this.t = 0.5;
      const want = new Set<number>();
      const ti0 = Math.floor((cam.x - FAR) / TILE), ti1 = Math.floor((cam.x + FAR) / TILE);
      const tj0 = Math.floor((cam.z - FAR) / TILE), tj1 = Math.floor((cam.z + FAR) / TILE);
      this.pending = [];
      for (let tj = tj0; tj <= tj1; tj++) for (let ti = ti0; ti <= ti1; ti++) {
        const list = this.index.get(tj * 64 + ti);
        if (!list) continue;
        for (const o of list) {
          if (o.hidden) continue;
          const d = Math.hypot(o.x - cam.x, o.z - cam.z);
          if (d > this.range(o)) continue;
          if (o.parent && o.kind !== 'cage' && this.W.objs.get(o.parent)?.kind === 'building') continue;
          want.add(o.id);
          const v = this.views.get(o.id);
          const key = this.keyOf(o);
          if (!v || v.key !== key) this.pending.push(o);
        }
      }
      for (const [id, v] of this.views) if (!want.has(id)) { this.dispose(v); this.views.delete(id); }
      this.pending.sort((a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z));
    }
    let built = 0;
    while (this.pending.length && built < this.buildBudget) {
      const o = this.pending.shift()!;
      if (!this.W.objs.has(o.id)) continue;
      const old = this.views.get(o.id);
      if (old) this.dispose(old);
      const v = this.build(o);
      if (v) { this.views.set(o.id, v); this.group.add(v.root); }
      built++;
    }
    // roofs: hidden over anyone of ours inside, and over the camera focus
    const hide = new Set<number>();
    for (const p of insiders) { const b = buildingAt(p.x, p.z, 0.5); if (b) hide.add(b.id); }
    const fb = buildingAt(focus.x, focus.z, 0.5);
    if (fb) hide.add(fb.id);
    for (const id of this.hiddenRoofs) if (!hide.has(id)) { const v = this.views.get(id); if (v?.roof) v.roof.visible = true; }
    for (const id of hide) { const v = this.views.get(id); if (v?.roof) v.roof.visible = false; }
    this.hiddenRoofs = hide;
    if (this.glowMat) this.glowMat.color.setScalar(0.25 + 0.75 * night);
    poolU.uNight.value = night;
    poolU.uTime.value += dt;
  }

  private keyOf(o: WObj) {
    switch (o.kind) {
      case 'gate': return o.open ? 'o' : 'c';
      case 'farm': return String(Math.round((o.data?.growth ?? 0) * 5));
      case 'building': return String(o.data?.furniture?.length ?? 0) + (o.data?.v ?? '');
      case 'ore': return String((o.data?.left ?? 1) > 0);
      case 'pile': return String(o.inv?.items.length ? 1 : 0);
      case 'site': return String(Math.round((o.progress ?? 0) * 10)) + (o.built ? 'b' : '');
      default: return o.data?.v ?? '';
    }
  }

  private build(o: WObj): View | null {
    const key = this.keyOf(o);
    switch (o.kind) {
      case 'building': {
        const furn = (o.data.furniture as number[]).map((id) => this.W.objs.get(id)).filter(Boolean) as WObj[];
        const m: BuildingMeshes = buildBuilding(o, furn);
        const root = new THREE.Group();
        root.position.set(o.x, o.y, o.z);
        root.rotation.y = o.rot;
        root.add(m.shell);
        if (m.roof) root.add(m.roof);
        if (m.glow) { root.add(m.glow); this.glowMat = m.glow.material as THREE.MeshBasicMaterial; }
        return { root, roof: m.roof, glow: m.glow, key };
      }
      case 'wall':
      case 'gate':
      case 'tower': {
        const m = buildWallPiece(o);
        m.position.set(o.x, o.y, o.z);
        m.rotation.y = o.rot;
        return { root: m, key };
      }
      case 'farm': {
        const m = buildField(o);
        m.position.set(o.x, o.y, o.z);
        m.rotation.y = o.rot;
        return { root: m, key };
      }
      case 'ore': {
        if ((o.data?.left ?? 1) <= 0) return null;
        const m = new THREE.Mesh(oreGeometry(o.def), oreMat);
        m.position.set(o.x, o.y - 0.2, o.z);
        m.rotation.y = o.rot;
        m.scale.setScalar(o.data?.size ?? 1);
        m.castShadow = true;
        m.receiveShadow = true;
        return { root: m, key };
      }
      case 'pile': {
        if (!o.inv?.items.length) return null;
        const m = new THREE.Mesh(pileGeometry(), oreMat);
        m.position.set(o.x, o.y, o.z);
        return { root: m, key };
      }
      case 'site':
        return { root: buildSiteMesh(o), key };
      default: {
        const { mesh, glow } = buildProp(o);
        const root = new THREE.Group();
        root.position.set(o.x, o.y, o.z);
        root.rotation.y = o.rot;
        root.add(mesh);
        const pool = lightPool(o.def);
        if (pool) root.add(pool);
        if (glow) { root.add(glow); this.glowMat = glow.material as THREE.MeshBasicMaterial; }
        return { root, glow, key };
      }
    }
  }

  private dispose(v: View) {
    v.root.removeFromParent();
    v.root.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh && m.geometry && !Object.values(oreGeo).includes(m.geometry) && m.geometry !== pileGeo && m.geometry !== poolGeo) m.geometry.dispose();
    });
  }
}
