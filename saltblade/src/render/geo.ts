// A small procedural mesh builder: bake primitives with a transform stack,
// colours and (for characters) rigid bone weights into one BufferGeometry.
import * as THREE from 'three';

const tmpColor = new THREE.Color();
const v3 = new THREE.Vector3();
const n3 = new THREE.Vector3();
const nm = new THREE.Matrix3();

export type ColorLike = number | [number, number, number];

export function linColor(c: ColorLike): [number, number, number] {
  if (Array.isArray(c)) return c;
  tmpColor.setHex(c);
  return [tmpColor.r, tmpColor.g, tmpColor.b];
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function prim(key: string, make: () => THREE.BufferGeometry) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    if (g.index) g = g.toNonIndexed();
    g.computeVertexNormals();
    geoCache.set(key, g);
  }
  return g;
}

export interface PrimOpts {
  color?: ColorLike;
  /** randomise vertex positions by this amount (in local units) */
  jitter?: number;
  seed?: number;
  /** shade darker toward the bottom (0..1) */
  grad?: number;
}

export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  skinI: number[] | null = null;
  bone = 0;
  color: [number, number, number] = [1, 1, 1];
  m = new THREE.Matrix4();
  private stack: THREE.Matrix4[] = [];

  constructor(skinned = false) {
    if (skinned) this.skinI = [];
  }
  setColor(c: ColorLike) { this.color = linColor(c); return this; }
  push() { this.stack.push(this.m.clone()); return this; }
  pop() { this.m.copy(this.stack.pop()!); return this; }
  translate(x: number, y: number, z: number) { this.m.multiply(new THREE.Matrix4().makeTranslation(x, y, z)); return this; }
  rotateX(a: number) { this.m.multiply(new THREE.Matrix4().makeRotationX(a)); return this; }
  rotateY(a: number) { this.m.multiply(new THREE.Matrix4().makeRotationY(a)); return this; }
  rotateZ(a: number) { this.m.multiply(new THREE.Matrix4().makeRotationZ(a)); return this; }
  scale(x: number, y = x, z = x) { this.m.multiply(new THREE.Matrix4().makeScale(x, y, z)); return this; }
  at(x: number, y: number, z: number, ry = 0) { return this.push().translate(x, y, z).rotateY(ry); }

  /** Bakes a (non-indexed, normal-carrying) geometry with the current transform. */
  add(g: THREE.BufferGeometry, o: PrimOpts = {}) {
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const c = o.color !== undefined ? linColor(o.color) : this.color;
    nm.getNormalMatrix(this.m);
    let seed = o.seed ?? 1;
    const jit = o.jitter ?? 0;
    const grad = o.grad ?? 0;
    // jitter must move shared corners together: key by original position
    const jmap = jit ? new Map<string, [number, number, number]>() : null;
    let minY = Infinity, maxY = -Infinity;
    if (grad) for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const base = this.pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      v3.set(p.getX(i), p.getY(i), p.getZ(i));
      if (jmap) {
        const k = v3.x.toFixed(3) + ',' + v3.y.toFixed(3) + ',' + v3.z.toFixed(3);
        let d = jmap.get(k);
        if (!d) {
          const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
          d = [r() * jit, r() * jit, r() * jit];
          jmap.set(k, d);
        }
        v3.x += d[0]; v3.y += d[1]; v3.z += d[2];
      }
      const gy = grad ? 1 - grad * (1 - (p.getY(i) - minY) / Math.max(1e-6, maxY - minY)) : 1;
      v3.applyMatrix4(this.m);
      this.pos.push(v3.x, v3.y, v3.z);
      n3.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(nm).normalize();
      this.nor.push(n3.x, n3.y, n3.z);
      this.col.push(c[0] * gy, c[1] * gy, c[2] * gy);
      if (this.skinI) this.skinI.push(this.bone);
    }
    if (jmap) this.recomputeNormals(base, p.count);
    return this;
  }
  /** Flat normals for a range of triangles (after jitter). */
  private recomputeNormals(base: number, count: number) {
    const P = this.pos, Nn = this.nor;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let t = 0; t < count; t += 3) {
      const i = (base + t) * 3;
      a.set(P[i], P[i + 1], P[i + 2]);
      b.set(P[i + 3], P[i + 4], P[i + 5]);
      c.set(P[i + 6], P[i + 7], P[i + 8]);
      b.sub(a); c.sub(a);
      b.cross(c).normalize();
      for (let k = 0; k < 3; k++) { Nn[i + k * 3] = b.x; Nn[i + k * 3 + 1] = b.y; Nn[i + k * 3 + 2] = b.z; }
    }
  }

  // --- primitives (all centred on the origin unless noted) ---
  box(w: number, h: number, d: number, o: PrimOpts = {}) {
    this.push().scale(w, h, d);
    this.add(prim('box', () => new THREE.BoxGeometry(1, 1, 1)), o);
    return this.pop();
  }
  /** Box standing on y=0. */
  block(w: number, h: number, d: number, o: PrimOpts = {}) {
    this.push().translate(0, h / 2, 0);
    this.box(w, h, d, o);
    return this.pop();
  }
  /** Cylinder from y=0 to y=h. */
  cyl(rTop: number, rBot: number, h: number, seg = 6, o: PrimOpts = {}) {
    this.push().translate(0, h / 2, 0).scale(1, h, 1);
    this.add(prim(`cyl${rTop.toFixed(3)}_${rBot.toFixed(3)}_${seg}`, () => new THREE.CylinderGeometry(rTop, rBot, 1, seg, 1)), o);
    return this.pop();
  }
  /** Cylinder between two points. */
  limb(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r0: number, r1: number, seg = 5, o: PrimOpts = {}) {
    const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
    const len = dir.length();
    if (len < 1e-5) return this;
    dir.normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.push();
    this.m.multiply(new THREE.Matrix4().compose(new THREE.Vector3(ax, ay, az), q, new THREE.Vector3(1, 1, 1)));
    this.cyl(r1, r0, len, seg, o);
    return this.pop();
  }
  cone(r: number, h: number, seg = 6, o: PrimOpts = {}) { return this.cyl(0.0001, r, h, seg, o); }
  sphere(r: number, wSeg = 7, hSeg = 5, o: PrimOpts = {}) {
    this.push().scale(r);
    this.add(prim(`sph${wSeg}_${hSeg}`, () => new THREE.SphereGeometry(1, wSeg, hSeg)), o);
    return this.pop();
  }
  ico(r: number, detail = 0, o: PrimOpts = {}) {
    this.push().scale(r);
    this.add(prim(`ico${detail}`, () => new THREE.IcosahedronGeometry(1, detail)), o);
    return this.pop();
  }
  dodeca(r: number, o: PrimOpts = {}) {
    this.push().scale(r);
    this.add(prim('dod', () => new THREE.DodecahedronGeometry(1, 0)), o);
    return this.pop();
  }
  octa(r: number, o: PrimOpts = {}) {
    this.push().scale(r);
    this.add(prim('oct', () => new THREE.OctahedronGeometry(1, 0)), o);
    return this.pop();
  }
  torus(r: number, tube: number, radSeg = 4, tubSeg = 10, arc = Math.PI * 2, o: PrimOpts = {}) {
    this.add(prim(`tor${r}_${tube}_${radSeg}_${tubSeg}_${arc.toFixed(3)}`, () => new THREE.TorusGeometry(r, tube, radSeg, tubSeg, arc)), o);
    return this;
  }
  /** Double-sided triangle blade from base (width w) to tip at height h, leaning by lean. */
  blade(w: number, h: number, lean: number, o: PrimOpts = {}) {
    const c = o.color !== undefined ? linColor(o.color) : this.color;
    const tip = [lean, h, 0];
    const verts = [
      [-w / 2, 0, 0], [w / 2, 0, 0], tip,
      [w / 2, 0, 0], [-w / 2, 0, 0], tip,
    ];
    nm.getNormalMatrix(this.m);
    for (let k = 0; k < 6; k++) {
      v3.set(verts[k][0], verts[k][1], verts[k][2]).applyMatrix4(this.m);
      this.pos.push(v3.x, v3.y, v3.z);
      n3.set(0, 0.7, k < 3 ? 0.7 : -0.7).applyMatrix3(nm).normalize();
      this.nor.push(n3.x, n3.y, n3.z);
      const g = k % 3 === 2 ? 1.15 : 0.75;
      this.col.push(c[0] * g, c[1] * g, c[2] * g);
      if (this.skinI) this.skinI.push(this.bone);
    }
    return this;
  }
  /** Flat quad (x from -w/2..w/2, y from 0..h), single sided facing +z. */
  quad(w: number, h: number, o: PrimOpts = {}) {
    this.push().translate(0, h / 2, 0).scale(w, h, 1);
    this.add(prim('plane', () => new THREE.PlaneGeometry(1, 1)), o);
    return this.pop();
  }

  get vertexCount() { return this.pos.length / 3; }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (this.skinI) {
      const n = this.skinI.length;
      const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) { si[i * 4] = this.skinI[i]; sw[i * 4] = 1; }
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    }
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

/** Deterministic tiny RNG for geometry variation. */
export function geoRand(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
