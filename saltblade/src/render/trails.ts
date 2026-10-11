// Weapon trails: a short ribbon left by the outer part of a heavy blade over
// its last few frames of a swing. One pooled strip mesh holds every trail;
// the ribbon fades along its length and dies within a blink of the swing.
import * as THREE from 'three';

const MAX = 12; // trails at once
const K = 10; // samples kept per trail
const LIFE = 0.13; // seconds a sample stays visible

interface Trail {
  owner: number;
  n: number; // samples held
  head: number; // next slot to write
  last: number; // time of the newest sample
  bx: Float32Array; by: Float32Array; bz: Float32Array; // base of the ribbon (down the blade)
  tx: Float32Array; ty: Float32Array; tz: Float32Array; // the tip
  t: Float32Array; // time each sample was taken
}

const vert = /* glsl */ `
  attribute float aAlpha;
  varying float vAlpha;
  void main() { vAlpha = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const frag = /* glsl */ `
  uniform vec3 uColor;
  varying float vAlpha;
  void main() { if (vAlpha <= 0.001) discard; gl_FragColor = vec4(uColor, vAlpha); }`;

export class Trails {
  mesh: THREE.Mesh;
  private trails: Trail[] = [];
  private pos: Float32Array;
  private alpha: Float32Array;
  private now = 0;
  private live = 0;
  /** seconds a sample stays visible (a knob for tuning and for slow-motion captures) */
  life = LIFE;
  /** trails showing after the last update */
  get count() { return this.live; }

  constructor() {
    const mk = () => new Float32Array(K);
    for (let i = 0; i < MAX; i++) this.trails.push({ owner: 0, n: 0, head: 0, last: -1, bx: mk(), by: mk(), bz: mk(), tx: mk(), ty: mk(), tz: mk(), t: mk() });
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(MAX * K * 2 * 3);
    this.alpha = new Float32Array(MAX * K * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    // each trail is a strip of quads between consecutive samples
    const idx: number[] = [];
    for (let s = 0; s < MAX; s++) {
      const v0 = s * K * 2;
      for (let i = 0; i < K - 1; i++) {
        const a = v0 + i * 2, b = a + 1, c = a + 2, d = a + 3;
        idx.push(a, b, c, b, d, c);
      }
    }
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    const m = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: { uColor: { value: new THREE.Color(0.96, 0.94, 0.86) } },
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
    this.mesh.visible = false;
  }

  /** Adds a sample of where the blade is now for `owner`'s swing. */
  push(owner: number, bx: number, by: number, bz: number, tx: number, ty: number, tz: number) {
    let tr: Trail | null = null, stale: Trail | null = null;
    for (const t of this.trails) {
      if (t.owner === owner) { tr = t; break; }
      if (!stale || t.last < stale.last) stale = t;
    }
    if (!tr) {
      tr = stale!;
      // a dead or abandoned trail gives up its slot; a live one is kept
      if (tr.n && this.now - tr.last < this.life) return;
      tr.owner = owner; tr.n = 0; tr.head = 0;
    }
    const i = tr.head;
    tr.bx[i] = bx; tr.by[i] = by; tr.bz[i] = bz;
    tr.tx[i] = tx; tr.ty[i] = ty; tr.tz[i] = tz;
    tr.t[i] = this.now;
    tr.head = (i + 1) % K;
    tr.n = Math.min(K, tr.n + 1);
    tr.last = this.now;
  }

  update(dt: number) {
    this.now += dt;
    let live = 0;
    for (let s = 0; s < MAX; s++) {
      const tr = this.trails[s];
      const v0 = s * K * 2;
      if (!tr.n || this.now - tr.last > this.life) {
        if (tr.n) { tr.n = 0; tr.owner = 0; }
        for (let i = 0; i < K * 2; i++) this.alpha[v0 + i] = 0;
        continue;
      }
      live++;
      // oldest first, so the strip runs along the swing; slots not yet filled repeat the oldest
      const start = (tr.head - tr.n + K) % K;
      for (let i = 0; i < K; i++) {
        const si = (start + Math.max(0, i - (K - tr.n))) % K;
        const age = this.now - tr.t[si];
        const a = Math.max(0, 1 - age / this.life);
        const vi = v0 + i * 2;
        const p = vi * 3;
        this.pos[p] = tr.bx[si]; this.pos[p + 1] = tr.by[si]; this.pos[p + 2] = tr.bz[si];
        this.pos[p + 3] = tr.tx[si]; this.pos[p + 4] = tr.ty[si]; this.pos[p + 5] = tr.tz[si];
        // the ribbon is strongest at the newest sample and at the tip
        this.alpha[vi] = a * a * 0.3;
        this.alpha[vi + 1] = a * a * 0.6;
      }
    }
    if (live || this.live) {
      const g = this.mesh.geometry;
      g.getAttribute('position').needsUpdate = true;
      g.getAttribute('aAlpha').needsUpdate = true;
    }
    this.live = live;
    this.mesh.visible = live > 0;
  }
}
