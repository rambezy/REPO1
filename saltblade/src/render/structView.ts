// Keeps meshes for buildings, walls, fields, props, ore and loot piles near
// the camera, and hides the roofs of buildings your people are inside.
import * as THREE from 'three';
import { World } from '../sim/world';
import { WObj } from '../sim/objects';
import { buildBuilding, buildWallPiece, buildField, buildProp, BuildingMeshes } from './buildings';
import { GeoBuilder, geoRand } from './geo';
import { buildingAt } from '../sim/structures';
import { buildSiteMesh } from './baseView';
import { surfU, NOISE_GLSL, lodTwin } from './surface';
import { reducedMotion } from './impact';
import { G } from '../state';
import type { BuildingData } from '../world/towns';

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
function lightPool(def: string, r = POOL[def]): THREE.Mesh | null {
  if (!r) return null;
  const m = new THREE.Mesh(poolGeo, poolMat);
  m.scale.set(r * 2, 1, r * 2);
  m.position.y = 0.06;
  m.renderOrder = 4;
  m.frustumCulled = true;
  return m;
}
// trodden earth round a building's walls and out from its door, multiplied over the ground
const apronMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.MultiplyBlending,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2,
  vertexShader: `attribute vec3 aAp; varying vec3 vAp; varying float vD;
    void main() { vAp = aAp; vec4 mv = modelViewMatrix * vec4(position, 1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying vec3 vAp; varying float vD;
    ${NOISE_GLSL}
    void main() {
      float n = sbN(vAp.xy * 1.3);
      float f = clamp(vAp.z * (0.5 + 0.95 * n) - 0.1, 0.0, 0.85) * (1.0 - smoothstep(320.0, 520.0, vD));
      gl_FragColor = vec4(vec3(0.72, 0.64, 0.54) * f, f);
    }`,
});

/** The apron of trodden ground under and round a building, following the terrain. */
function apronMesh(b: WObj): THREE.Mesh | null {
  const T = G.T;
  const d = b.data as BuildingData;
  if (!T || !d || d.stilts) return null;
  const m = d.use === 'stall' ? 1.6 : 2.6, path = d.use === 'stall' || d.use === 'pen' ? 0 : 4.5;
  const hw = d.w / 2, hd = d.d / 2;
  const door = d.doors.find((dr) => dr.side === 's');
  const x0 = -hw - m, x1 = hw + m, z0 = -hd - m, z1 = hd + m + (door ? path : 0);
  const nx = Math.max(3, Math.ceil((x1 - x0) / 1.7)), nz = Math.max(3, Math.ceil((z1 - z0) / 1.7));
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  const pos: number[] = [], ap: number[] = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const lx = x0 + ((x1 - x0) * i) / nx, lz = z0 + ((z1 - z0) * j) / nz;
    const wx = b.x + lx * c + lz * s, wz = b.z - lx * s + lz * c;
    const qx = Math.abs(lx) - hw, qz = Math.abs(lz) - hd;
    const dist = Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
    let f = Math.min(1, Math.max(0, 1 - dist / m));
    if (door && lz > hd) f = Math.max(f, Math.max(0, 1 - Math.abs(lx - door.off) / 1.9) * Math.max(0, 1 - (lz - hd) / (path + m)));
    pos.push(lx, T.heightAt(wx, wz) + 0.05 - b.y, lz);
    ap.push(lx, lz, f);
  }
  const idx: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const a = j * (nx + 1) + i, bb = a + 1, cc = a + nx + 1, dd = cc + 1;
    idx.push(a, cc, bb, bb, cc, dd);
  }
  // a worn track on from the door: out to the road it faces, or else over to the nearest well
  if (door && path) {
    const sx = b.x + door.off * c + (hd + path) * s, sz = b.z - door.off * s + (hd + path) * c;
    let tx = NaN, tz = NaN;
    for (let k = 1; k <= 18; k++) {
      const px = sx + s * k * 1.5, pz = sz + c * k * 1.5;
      if (buildingAt(px, pz, 0.5)) break;
      if (T.roadAt(px, pz) > 40) { tx = px; tz = pz; break; }
    }
    if (isNaN(tx) && G.W) {
      let best = 30;
      G.W.objHash.near(sx, sz, 30, (o: WObj) => {
        if (o.kind !== 'well') return;
        const dd = Math.hypot(o.x - sx, o.z - sz);
        if (dd < best && dd > 3) { best = dd; tx = o.x - ((o.x - sx) / dd) * 1.6; tz = o.z - ((o.z - sz) / dd) * 1.6; }
      });
      // (not through another building)
      if (!isNaN(tx)) for (let k = 1; k < 8; k++) if (buildingAt(sx + ((tx - sx) * k) / 8, sz + ((tz - sz) * k) / 8, 0.3)) { tx = NaN; break; }
    }
    if (!isNaN(tx)) {
      const len = Math.hypot(tx - sx, tz - sz), n = Math.max(2, Math.ceil(len / 1.5));
      const ux = (tx - sx) / len, uz = (tz - sz) / len, w = 0.9 + (b.id % 5) * 0.12;
      const base = pos.length / 3;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        for (const a of [-1, 0, 1]) {
          const wx = sx + (tx - sx) * t - uz * a * w, wz = sz + (tz - sz) * t + ux * a * w;
          const dx = wx - b.x, dz = wz - b.z;
          const lx = dx * c - dz * s, lz = dx * s + dz * c;
          pos.push(lx, T.heightAt(wx, wz) + 0.05 - b.y, lz);
          ap.push(lx, lz, a ? 0 : 0.62 * Math.min(1, (1 - t) * 4 + 0.35));
        }
        if (k) {
          const r0 = base + (k - 1) * 3, r1 = r0 + 3;
          // (wound to face up, as the apron's own grid)
          for (let q = 0; q < 2; q++) idx.push(r0 + q, r0 + q + 1, r1 + q, r0 + q + 1, r1 + q + 1, r1 + q);
        }
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aAp', new THREE.Float32BufferAttribute(ap, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, apronMat);
  mesh.renderOrder = 1;
  return mesh;
}

/** Dust and debris gathered along both feet of a town wall, the same kind of decal. */
function wallFoot(o: WObj): THREE.Mesh | null {
  const T = G.T;
  const d = o.data;
  if (!T || !d || d.style === 'fence') return null;
  const len = d.len as number, t = d.thick as number, m = 2.2;
  const n = Math.max(2, Math.ceil(len / 2));
  const c = Math.cos(o.rot), s = Math.sin(o.rot);
  const pos: number[] = [], ap: number[] = [], idx: number[] = [];
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (let i = 0; i <= n; i++) for (let k = 0; k < 3; k++) {
      const lz = -len / 2 + (len * i) / n, lx = side * (t / 2 + (m * k) / 2);
      const wx = o.x + lx * c + lz * s, wz = o.z - lx * s + lz * c;
      pos.push(lx, T.heightAt(wx, wz) + 0.05 - o.y, lz);
      ap.push(lx, lz, k === 0 ? 0.8 : k === 1 ? 0.35 : 0);
    }
    for (let i = 0; i < n; i++) for (let k = 0; k < 2; k++) {
      const a = base + i * 3 + k, b2 = a + 1, cc = a + 3, dd = cc + 1;
      if (side > 0) idx.push(a, cc, b2, b2, cc, dd); else idx.push(a, b2, cc, b2, dd, cc);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('aAp', new THREE.Float32BufferAttribute(ap, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, apronMat);
  mesh.renderOrder = 1;
  return mesh;
}

const FAR = 2600;
const NEAR = 700;
/** beyond this (m) the insides of roofed buildings are not drawn */
const INNER_D = 170;

/** `decals` (aprons, wall feet) and `pools` (lamplight on the ground) are only drawn near (see DECAL_D, POOL_D). */
interface View { root: THREE.Object3D; roof?: THREE.Mesh | null; inner?: THREE.Mesh | null; glow?: THREE.Mesh | null; key: string; lod?: number; decals?: THREE.Object3D[]; pools?: THREE.Object3D[]; }

/** beyond these (m) structures are drawn with the middle-distance, then the far, version of their surfaces */
const MID_MAT = 80, FAR_MAT = 190;
/** decals have faded out by here (see apronMat); lamplight on the ground is too small to see beyond this */
const DECAL_D = 520, POOL_D = 250;
const lodAt = (d: number) => (d > FAR_MAT ? 2 : d > MID_MAT ? 1 : 0);
const LOD_EDGES = [-1e9, MID_MAT, FAR_MAT, 1e9];
/** The surface version for a distance, changing only a few metres past each line (no flicker on it); low quality is always far. */
function lodFor(d: number, cur: number | undefined, low: boolean) {
  if (low) return 2;
  if (cur === undefined || cur > 2) return lodAt(d);
  return d < LOD_EDGES[cur] - 5 || d > LOD_EDGES[cur + 1] + 5 ? lodAt(d) : cur;
}
/** Shows a view's decals and pools only where they can be seen, and not at all on low quality. */
function nearDetail(v: View, d: number, low: boolean) {
  if (v.decals) for (const m of v.decals) m.visible = !low && d < DECAL_D;
  if (v.pools) for (const m of v.pools) m.visible = !low && d < POOL_D;
}
const nearMat = new WeakMap<THREE.Mesh, THREE.Material>();
/** Puts a view's meshes on the version of their surface materials for a distance (see lodTwin). */
function setLod(v: View, lod: number) {
  v.lod = lod;
  v.root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;
    let near = nearMat.get(m);
    if (!near) nearMat.set(m, (near = m.material));
    m.material = lodTwin(near, lod);
  });
}

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
  /** at most this many builds a frame, and no more once this many ms are spent */
  buildBudget = 6;
  buildMs = 4;
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
      const low = G.R?.level === 'low';
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
          // rooms are only glimpsed through doorways: none drawn from far off (unless the roof is off, below)
          if (v?.inner) v.inner.visible = d < INNER_D || this.hiddenRoofs.has(o.id);
          if (v) {
            const lod = lodFor(d, v.lod, low);
            if (v.lod !== lod) setLod(v, lod);
            nearDetail(v, d, low);
          }
          const key = this.keyOf(o);
          if (!v || v.key !== key) this.pending.push(o);
        }
      }
      for (const [id, v] of this.views) if (!want.has(id)) { this.dispose(v); this.views.delete(id); }
      this.pending.sort((a, b) => Math.hypot(a.x - cam.x, a.z - cam.z) - Math.hypot(b.x - cam.x, b.z - cam.z));
    }
    let built = 0;
    const t0 = performance.now();
    while (this.pending.length && built < this.buildBudget && (built === 0 || performance.now() - t0 < this.buildMs)) {
      const o = this.pending.shift()!;
      if (!this.W.objs.has(o.id)) continue;
      const old = this.views.get(o.id);
      if (old) this.dispose(old);
      const v = this.build(o);
      if (v) {
        const d = Math.hypot(o.x - cam.x, o.z - cam.z), low = G.R?.level === 'low';
        setLod(v, lodFor(d, undefined, low));
        nearDetail(v, d, low);
        this.views.set(o.id, v);
        this.group.add(v.root);
      }
      built++;
    }
    // roofs: hidden over anyone of ours inside, and over the camera focus
    const hide = new Set<number>();
    for (const p of insiders) { const b = buildingAt(p.x, p.z, 0.5); if (b) hide.add(b.id); }
    const fb = buildingAt(focus.x, focus.z, 0.5);
    if (fb) hide.add(fb.id);
    // (a room's contents cast shadows only while its roof is off: otherwise the roof's shadow covers them)
    for (const id of this.hiddenRoofs) if (!hide.has(id)) { const v = this.views.get(id); if (v?.roof) v.roof.visible = true; if (v?.inner) v.inner.castShadow = false; }
    for (const id of hide) { const v = this.views.get(id); if (v?.roof) v.roof.visible = false; if (v?.inner) { v.inner.castShadow = true; v.inner.visible = true; } }
    this.hiddenRoofs = hide;
    if (this.glowMat) this.glowMat.color.setScalar(0.25 + 0.75 * night);
    poolU.uNight.value = night;
    // by day the pools add nothing: skip drawing them
    poolMat.visible = night > 0.01;
    surfU.uNight.value = night;
    surfU.uLampK.value = 0.3 + 1.1 * night;
    // (the flicker holds still for those who want less motion)
    if (!reducedMotion()) poolU.uTime.value += dt;
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
        // roofs are drawn before everything else, so the rooms under them are never shaded in vain
        if (m.roof) { m.roof.renderOrder = -1; root.add(m.roof); }
        const decals: THREE.Object3D[] = [], pools: THREE.Object3D[] = [];
        const apron = apronMesh(o);
        if (apron) { root.add(apron); decals.push(apron); }
        if (m.glow) { root.add(m.glow); this.glowMat = m.glow.material as THREE.MeshBasicMaterial; }
        // lamplight on the floor inside, and spilling out of the door
        for (const [px, py, pz, r] of m.pools) {
          const pool = lightPool('', r)!;
          pool.position.set(px, py, pz);
          root.add(pool);
          pools.push(pool);
        }
        return { root, roof: m.roof, inner: m.interior, glow: m.glow, key, decals, pools };
      }
      case 'wall':
      case 'gate':
      case 'tower': {
        const m = buildWallPiece(o);
        m.position.set(o.x, o.y, o.z);
        m.rotation.y = o.rot;
        const foot = o.kind === 'wall' ? wallFoot(o) : null;
        if (foot) m.add(foot);
        return { root: m, key, decals: foot ? [foot] : undefined };
      }
      case 'farm': {
        const { mesh, glow } = buildField(o);
        const root = new THREE.Group();
        root.position.set(o.x, o.y, o.z);
        root.rotation.y = o.rot;
        root.add(mesh);
        if (glow) { root.add(glow); this.glowMat = glow.material as THREE.MeshBasicMaterial; }
        return { root, glow, key };
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
        return { root, glow, key, pools: pool ? [pool] : undefined };
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
