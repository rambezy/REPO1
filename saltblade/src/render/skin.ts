// Smooth skinned meshes built in code: lofts (tubes with shaped cross-sections
// along a path), lathes (surfaces of revolution) and sculpted spheres.
// Vertices are shared, so shading is smooth; each vertex carries up to four
// bone weights, a colour and a surface kind (skin, cloth, leather, metal...)
// that the character material turns into roughness, sheen and grain.
import * as THREE from 'three';

export const SURF = { skin: 0, cloth: 1, leather: 2, metal: 3, hair: 4, chitin: 5, straw: 6, bone: 7, eye: 8, glow: 9 } as const;
export type Surf = keyof typeof SURF;
/** Roughness and metalness per surface kind. */
const PBR: Record<Surf, [number, number]> = {
  skin: [0.56, 0], cloth: [0.92, 0], leather: [0.66, 0], metal: [0.38, 0.5], hair: [0.7, 0], chitin: [0.4, 0.06],
  straw: [0.86, 0], bone: [0.58, 0], eye: [0.18, 0], glow: [1, 0],
};

export type RGB = [number, number, number];
/** [bone, weight] pairs. */
export type Weights = [number, number][];
export interface Paint { c: RGB; s: Surf }

const tmpC = new THREE.Color();
/** An sRGB hex colour (or an already linear triple) as linear RGB. */
export function rgb(c: number | RGB): RGB {
  if (Array.isArray(c)) return c;
  tmpC.setHex(c);
  return [tmpC.r, tmpC.g, tmpC.b];
}
export const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const shade = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
export const paint = (c: RGB, s: Surf): Paint => ({ c, s });

// scratch for merging a vertex's bone weights
const wb = new Int32Array(16), ww = new Float64Array(16);

export class SkinBuilder {
  private cap = 0;
  private P = new Float32Array(0);
  private C = new Float32Array(0);
  private SI = new Uint16Array(0);
  private SW = new Float32Array(0);
  private SF = new Float32Array(0);
  private FC = new Float32Array(0);
  private I = new Uint32Array(1024);
  private ni = 0;
  count = 0;

  private grow() {
    const cap = Math.max(1024, this.cap * 2);
    const more = <T extends Float32Array | Uint16Array>(a: T, k: number): T => { const b = new (a.constructor as any)(cap * k); b.set(a); return b; };
    this.P = more(this.P, 3); this.C = more(this.C, 3); this.SI = more(this.SI, 4); this.SW = more(this.SW, 4); this.SF = more(this.SF, 3); this.FC = more(this.FC, 4);
    this.cap = cap;
  }

  vert(x: number, y: number, z: number, p: Paint, w: Weights): number {
    const i = this.count;
    if (i >= this.cap) this.grow();
    const i3 = i * 3, i4 = i * 4;
    this.P[i3] = x; this.P[i3 + 1] = y; this.P[i3 + 2] = z;
    this.C[i3] = p.c[0]; this.C[i3 + 1] = p.c[1]; this.C[i3 + 2] = p.c[2];
    // merge repeated bones, keep the four heaviest and normalise
    let n = 0;
    for (let j = 0; j < w.length; j++) {
      const bone = w[j][0], v = w[j][1];
      if (!(v > 0)) continue;
      let k = 0;
      while (k < n && wb[k] !== bone) k++;
      if (k < n) ww[k] += v;
      else if (n < wb.length) { wb[n] = bone; ww[n] = v; n++; }
    }
    const m = n < 4 ? n : 4;
    let tot = 0;
    for (let k = 0; k < m; k++) {
      let best = k;
      for (let j = k + 1; j < n; j++) if (ww[j] > ww[best]) best = j;
      if (best !== k) { const tb = wb[k], tw = ww[k]; wb[k] = wb[best]; ww[k] = ww[best]; wb[best] = tb; ww[best] = tw; }
      tot += ww[k];
    }
    for (let k = 0; k < 4; k++) {
      this.SI[i4 + k] = k < m ? wb[k] : 0;
      this.SW[i4 + k] = k < m ? ww[k] / tot : m === 0 && k === 0 ? 1 : 0;
    }
    const pb = PBR[p.s];
    this.SF[i3] = pb[0]; this.SF[i3 + 1] = pb[1]; this.SF[i3 + 2] = SURF[p.s];
    return this.count++;
  }

  /**
   * Where a vertex lies on the face (metres across and up from the head centre, and 2 + how far round to the front)
   * and how much hair grows there, for the features the material paints.
   */
  setFace(i: number, x: number, y: number, front: number, hair: number) { const k = i * 4; this.FC[k] = x; this.FC[k + 1] = y; this.FC[k + 2] = 2 + front; this.FC[k + 3] = hair; }

  tri(a: number, b: number, c: number) {
    if (this.ni + 3 > this.I.length) { const m = new Uint32Array(this.I.length * 2); m.set(this.I); this.I = m; }
    this.I[this.ni++] = a; this.I[this.ni++] = b; this.I[this.ni++] = c;
  }

  pos(i: number, out: THREE.Vector3) { return out.set(this.P[i * 3], this.P[i * 3 + 1], this.P[i * 3 + 2]); }

  build(): THREE.BufferGeometry {
    const nv = this.count, P = this.P.slice(0, nv * 3);
    const I = nv < 65536 ? Uint16Array.from(this.I.subarray(0, this.ni)) : this.I.slice(0, this.ni);
    // smooth normals: area-weighted sums of the faces round each vertex
    const N = new Float32Array(nv * 3);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ex = P[b] - P[a], ey = P[b + 1] - P[a + 1], ez = P[b + 2] - P[a + 2];
      const fx = P[c] - P[a], fy = P[c + 1] - P[a + 1], fz = P[c + 2] - P[a + 2];
      const nx = ey * fz - ez * fy, ny = ez * fx - ex * fz, nz = ex * fy - ey * fx;
      N[a] += nx; N[a + 1] += ny; N[a + 2] += nz;
      N[b] += nx; N[b + 1] += ny; N[b + 2] += nz;
      N[c] += nx; N[c + 1] += ny; N[c + 2] += nz;
    }
    for (let k = 0; k < N.length; k += 3) {
      const l = Math.hypot(N[k], N[k + 1], N[k + 2]) || 1;
      N[k] /= l; N[k + 1] /= l; N[k + 2] /= l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.C.slice(0, nv * 3), 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(this.SI.slice(0, nv * 4), 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(this.SW.slice(0, nv * 4), 4));
    g.setAttribute('surf', new THREE.BufferAttribute(this.SF.slice(0, nv * 3), 3));
    g.setAttribute('face', new THREE.BufferAttribute(this.FC.slice(0, nv * 4), 4));
    g.setIndex(new THREE.BufferAttribute(I, 1));
    return g;
  }
}

/** A cross-section of a loft. Angle 0 points along u, π/2 along v (the front). */
export interface Sec {
  c: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
  rx: number; // half-width toward +u
  rxn?: number; // half-width toward -u (default rx)
  rf: number; // half-depth toward +v
  rb: number; // half-depth toward -v
  e?: number; // superellipse exponent: 2 round, larger is boxier
  w: Weights;
  wf?: (a: number) => Weights; // weights by angle, when they vary round the section
  paint: Paint | ((a: number) => Paint);
  push?: (a: number) => number; // extra outward offset by angle
}

const tA = new THREE.Vector3(), tB = new THREE.Vector3(), tC = new THREE.Vector3(), tD = new THREE.Vector3();

/** A point on a section at angle a. */
export function secPoint(s: Sec, a: number, out: THREE.Vector3) {
  const ca = Math.cos(a), sa = Math.sin(a);
  const e = s.e ?? 2;
  const k = 2 / e;
  const xe = Math.sign(ca) * Math.pow(Math.abs(ca), k), ze = Math.sign(sa) * Math.pow(Math.abs(sa), k);
  let x = xe * (xe >= 0 ? s.rx : s.rxn ?? s.rx);
  let z = ze * (ze >= 0 ? s.rf : s.rb);
  if (s.push) {
    const p = s.push(a);
    if (p) { const l = Math.hypot(x, z) || 1; x += (x / l) * p; z += (z / l) * p; }
  }
  return out.copy(s.c).addScaledVector(s.u, x).addScaledVector(s.v, z);
}

/** Orthonormal frame for a tube running along d, with v toward `front`. */
export function frame(d: THREE.Vector3, front: THREE.Vector3): { u: THREE.Vector3; v: THREE.Vector3 } {
  const dn = d.clone().normalize();
  let v = front.clone().addScaledVector(dn, -front.dot(dn));
  if (v.lengthSq() < 1e-6) v = new THREE.Vector3(1, 0, 0).addScaledVector(dn, -dn.x);
  v.normalize();
  const u = new THREE.Vector3().crossVectors(v, dn).normalize();
  return { u, v };
}

export interface LoftOpts {
  capStart?: boolean | THREE.Vector3; // close the first ring (at its centre, or at a given point)
  capEnd?: boolean | THREE.Vector3;
  arc?: [number, number]; // an open loft over this angle range instead of a full ring
}

/** Joins cross-sections into a tube, with outward-facing triangles. */
export function loft(b: SkinBuilder, secs: Sec[], n: number, o: LoftOpts = {}) {
  if (secs.length < 2) return;
  const open = !!o.arc;
  const cols = open ? n + 1 : n;
  const a0 = o.arc ? o.arc[0] : 0, span = o.arc ? o.arc[1] - o.arc[0] : Math.PI * 2;
  const rings: number[][] = [];
  for (const s of secs) {
    const ring: number[] = [];
    for (let j = 0; j < cols; j++) {
      const a = a0 + (span * j) / n;
      secPoint(s, a, tA);
      const an = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const p = typeof s.paint === 'function' ? s.paint(an) : s.paint;
      ring.push(b.vert(tA.x, tA.y, tA.z, p, s.wf ? s.wf(an) : s.w));
    }
    rings.push(ring);
  }
  // which way round the triangles go: test the first quad against the outward direction
  b.pos(rings[0][0], tA); b.pos(rings[0][1 % cols], tB); b.pos(rings[1][0], tC);
  tD.subVectors(tB, tA).cross(tC.clone().sub(tA));
  const out = tA.clone().sub(secs[0].c);
  const flip = tD.dot(out) < 0;
  const quads = open ? n : n;
  for (let i = 0; i + 1 < rings.length; i++) {
    const r0 = rings[i], r1 = rings[i + 1];
    for (let j = 0; j < quads; j++) {
      const j1 = open ? j + 1 : (j + 1) % n;
      const a = r0[j], bb = r0[j1], c = r1[j], d = r1[j1];
      if (flip) { b.tri(a, d, bb); b.tri(a, c, d); } else { b.tri(a, bb, d); b.tri(a, d, c); }
    }
  }
  const cap = (ring: number[], sec: Sec, at: boolean | THREE.Vector3, start: boolean) => {
    if (!at || open) return;
    const cp = at instanceof THREE.Vector3 ? at : sec.c;
    const p = typeof sec.paint === 'function' ? sec.paint(Math.PI / 2) : sec.paint;
    const ci = b.vert(cp.x, cp.y, cp.z, p, sec.w);
    // the cap faces away from the rest of the tube
    const axis = start ? secs[0].c.clone().sub(secs[1].c) : secs[secs.length - 1].c.clone().sub(secs[secs.length - 2].c);
    b.pos(ring[0], tA); b.pos(ring[1], tB);
    tD.subVectors(tA, cp).cross(tC.subVectors(tB, cp));
    const f = tD.dot(axis) < 0;
    for (let j = 0; j < n; j++) {
      const j1 = (j + 1) % n;
      if (f) b.tri(ci, ring[j1], ring[j]); else b.tri(ci, ring[j], ring[j1]);
    }
  };
  if (o.capStart) cap(rings[0], secs[0], o.capStart, true);
  if (o.capEnd) cap(rings[rings.length - 1], secs[secs.length - 1], o.capEnd, false);
}

/**
 * A surface of revolution about `up` through `base`: prof is [radius, height]
 * from the underside pole round to the top pole (the first and last points
 * should have radius 0). Paint by profile index and angle.
 */
export function lathe(b: SkinBuilder, base: THREE.Vector3, prof: [number, number][], n: number, pnt: (i: number, a: number) => Paint, w: Weights, o: { up?: THREE.Vector3; front?: THREE.Vector3; e?: number; sx?: number; sz?: number; arc?: [number, number] } = {}) {
  const up = (o.up ?? new THREE.Vector3(0, 1, 0)).clone().normalize();
  const { u, v } = frame(up, o.front ?? new THREE.Vector3(0, 0, 1));
  const at = (h: number) => base.clone().addScaledVector(up, h);
  const inner = prof.slice(1, -1);
  const secs: Sec[] = inner.map(([r, h], k) => ({
    c: at(h), u, v, rx: r * (o.sx ?? 1), rf: r * (o.sz ?? 1), rb: r * (o.sz ?? 1), e: o.e, w, paint: (a: number) => pnt(k + 1, a),
  }));
  const first = prof[0], last = prof[prof.length - 1];
  loft(b, secs, n, {
    capStart: first[0] < 1e-4 ? at(first[1]) : false,
    capEnd: last[0] < 1e-4 ? at(last[1]) : false,
    arc: o.arc,
  });
}

/**
 * A sculpted sphere: `f` maps each unit direction to a position and paint.
 * `center` is used only to face the triangles outward.
 */
export interface BlobOpts {
  /** Gather the rings toward the front (lon) and the middle (lat): 0 even, up to about 0.8. */
  warp?: [number, number];
  /** Called with each new vertex and its direction. */
  each?: (i: number, d: THREE.Vector3) => void;
}

export function blob(b: SkinBuilder, center: THREE.Vector3, nLon: number, nLat: number, f: (d: THREE.Vector3, out: THREE.Vector3) => Paint, w: Weights | ((p: THREE.Vector3) => Weights), o: BlobOpts = {}) {
  const d = new THREE.Vector3(), p = new THREE.Vector3();
  const wf = typeof w === 'function' ? w : () => w;
  const put = () => { const pt = f(d, p); const i = b.vert(p.x, p.y, p.z, pt, wf(p)); o.each?.(i, d); return i; };
  const [kl, kt] = o.warp ?? [0, 0];
  d.set(0, -1, 0); const south = put();
  const rings: number[][] = [];
  for (let i = 1; i < nLat; i++) {
    const t = i / nLat;
    const phi = -Math.PI / 2 + Math.PI * (t - (kt * Math.sin(Math.PI * 2 * (t - 0.5))) / (Math.PI * 2));
    const ring: number[] = [];
    for (let j = 0; j < nLon; j++) {
      const u = j / nLon;
      const th = Math.PI * 2 * u - kl * Math.sin(Math.PI * 2 * u);
      d.set(Math.sin(th) * Math.cos(phi), Math.sin(phi), Math.cos(th) * Math.cos(phi));
      ring.push(put());
    }
    rings.push(ring);
  }
  d.set(0, 1, 0); const north = put();
  // orientation from one triangle of the middle ring
  const mid = rings[Math.floor(rings.length / 2)], nxt = rings[Math.floor(rings.length / 2) + 1] ?? rings[rings.length - 1];
  b.pos(mid[0], tA); b.pos(mid[1], tB); b.pos(nxt[0], tC);
  tD.subVectors(tB, tA).cross(tC.clone().sub(tA));
  const flip = tD.dot(tA.clone().sub(center)) < 0;
  const T = (x: number, y: number, z: number) => (flip ? b.tri(x, z, y) : b.tri(x, y, z));
  for (let j = 0; j < nLon; j++) {
    const j1 = (j + 1) % nLon;
    T(south, rings[0][j1], rings[0][j]);
    for (let i = 0; i + 1 < rings.length; i++) {
      const a = rings[i][j], bb = rings[i][j1], c = rings[i + 1][j], dd = rings[i + 1][j1];
      T(a, bb, dd); T(a, dd, c);
    }
    const top = rings[rings.length - 1];
    T(top[j], top[j1], north);
  }
}

/** Small deterministic random numbers for faces and wear. */
export function prng(seed: number) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const gauss = (x: number, s: number) => Math.exp(-(x * x) / (2 * s * s));
export const smoothstep = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
