// Sparks, smoke, dust and laser beams: short-lived effects the sim asks for
// through S.fx (see game/fx.ts). Two pooled point clouds, one added (sparks,
// embers, flashes: bright enough to bloom) and one blended (smoke, dust), and
// a handful of beams drawn as thin glowing boxes that fade in a blink.
import * as THREE from 'three';

const MAX = 1400;

interface Pool {
  pts: THREE.Points;
  pos: Float32Array; vel: Float32Array; col: Float32Array; size: Float32Array; alpha: Float32Array;
  life: Float32Array; age: Float32Array; drag: Float32Array; grav: Float32Array; grow: Float32Array; size0: Float32Array;
  base: Float32Array; // starting colour, faded towards the end
  n: number; next: number;
}

const vert = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.5, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const frag = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  uniform float uSoft;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float a = mix(1.0 - r * r, exp(-r * r * 3.5), uSoft) * vAlpha;
    gl_FragColor = vec4(vColor, a);
  }`;

function pool(additive: boolean): Pool {
  const g = new THREE.BufferGeometry();
  const mk = (n: number) => new Float32Array(MAX * n);
  const p: Pool = {
    pts: null as unknown as THREE.Points,
    pos: mk(3), vel: mk(3), col: mk(3), size: mk(1), alpha: mk(1), life: mk(1), age: mk(1), drag: mk(1), grav: mk(1), grow: mk(1), size0: mk(1), base: mk(3),
    n: 0, next: 0,
  };
  g.setAttribute('position', new THREE.BufferAttribute(p.pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aColor', new THREE.BufferAttribute(p.col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aSize', new THREE.BufferAttribute(p.size, 1).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('aAlpha', new THREE.BufferAttribute(p.alpha, 1).setUsage(THREE.DynamicDrawUsage));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
  const m = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag,
    uniforms: { uScale: { value: 600 }, uSoft: { value: additive ? 1 : 0.4 } },
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  p.pts = new THREE.Points(g, m);
  p.pts.frustumCulled = false;
  p.pts.renderOrder = additive ? 12 : 11;
  for (let i = 0; i < MAX; i++) p.alpha[i] = 0;
  return p;
}

interface Beam { mesh: THREE.Mesh; age: number; life: number; }

export type Burst = 'sparks' | 'embers' | 'flash' | 'smoke' | 'dust' | 'blood' | 'steam' | 'oil' | 'glint';

export class Particles {
  glow = pool(true);
  soft = pool(false);
  private beams: Beam[] = [];
  private beamGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0, 0.5);

  constructor(scene: THREE.Scene) {
    scene.add(this.glow.pts, this.soft.pts);
  }

  /** Points shrink with distance by the screen's height. */
  setScreen(h: number, fov: number) {
    const k = h / (2 * Math.tan((fov * Math.PI) / 360));
    (this.glow.pts.material as THREE.ShaderMaterial).uniforms.uScale.value = k;
    (this.soft.pts.material as THREE.ShaderMaterial).uniforms.uScale.value = k;
  }

  private spawn(p: Pool, x: number, y: number, z: number, vx: number, vy: number, vz: number, r: number, g: number, b: number, size: number, life: number, drag: number, grav: number, grow = 0) {
    const i = p.next;
    p.next = (p.next + 1) % MAX;
    p.n = Math.min(MAX, p.n + 1);
    p.pos[i * 3] = x; p.pos[i * 3 + 1] = y; p.pos[i * 3 + 2] = z;
    p.vel[i * 3] = vx; p.vel[i * 3 + 1] = vy; p.vel[i * 3 + 2] = vz;
    p.base[i * 3] = r; p.base[i * 3 + 1] = g; p.base[i * 3 + 2] = b;
    p.col[i * 3] = r; p.col[i * 3 + 1] = g; p.col[i * 3 + 2] = b;
    p.size[i] = size; p.size0[i] = size; p.alpha[i] = 1; p.life[i] = life; p.age[i] = 0; p.drag[i] = drag; p.grav[i] = grav; p.grow[i] = grow;
  }

  /** A burst of one kind at a point; `dir` biases where it flies (a hit's direction). */
  burst(kind: Burst, x: number, y: number, z: number, n = 12, dir?: [number, number]) {
    const R = Math.random;
    const dx = dir?.[0] ?? 0, dz = dir?.[1] ?? 0;
    for (let k = 0; k < n; k++) {
      const a = R() * Math.PI * 2, u = R();
      switch (kind) {
        case 'sparks': {
          const s = 3 + R() * 6;
          this.spawn(this.glow, x, y, z, Math.cos(a) * s * 0.6 + dx * s, 1 + R() * 4, Math.sin(a) * s * 0.6 + dz * s, 7, 3.6 + R() * 1.5, 1, 0.07 + R() * 0.05, 0.25 + R() * 0.45, 1.5, 9.8);
          break;
        }
        case 'embers':
          this.spawn(this.glow, x + (R() - 0.5) * 0.3, y, z + (R() - 0.5) * 0.3, (R() - 0.5) * 0.6, 0.6 + R() * 1.2, (R() - 0.5) * 0.6, 5, 1.6, 0.3, 0.06 + R() * 0.04, 1 + R() * 1.4, 0.6, -0.4);
          break;
        case 'flash':
          this.spawn(this.glow, x, y, z, 0, 0, 0, 9, 7, 5, 0.9 + R() * 0.3, 0.07, 0, 0, 4);
          break;
        case 'smoke':
          this.spawn(this.soft, x + (R() - 0.5) * 0.4, y, z + (R() - 0.5) * 0.4, (R() - 0.5) * 0.5 + dx, 0.5 + R() * 0.7, (R() - 0.5) * 0.5 + dz, 0.16, 0.15, 0.14, 0.5 + R() * 0.4, 2.5 + R() * 2, 0.4, -0.15, 0.9);
          break;
        case 'steam':
          this.spawn(this.soft, x, y, z, (R() - 0.5) * 0.4, 0.8 + R() * 0.6, (R() - 0.5) * 0.4, 0.75, 0.76, 0.78, 0.3 + R() * 0.2, 1.2 + R(), 0.5, -0.2, 0.8);
          break;
        case 'dust':
          this.spawn(this.soft, x + Math.cos(a) * u * 0.4, y + 0.08, z + Math.sin(a) * u * 0.4, Math.cos(a) * (0.5 + R()), 0.25 + R() * 0.4, Math.sin(a) * (0.5 + R()), 0.5, 0.44, 0.34, 0.22 + R() * 0.2, 0.7 + R() * 0.6, 1.4, 0.2, 0.9);
          break;
        case 'blood':
          this.spawn(this.soft, x, y, z, Math.cos(a) * (1 + R()) + dx * 2, 0.5 + R() * 2, Math.sin(a) * (1 + R()) + dz * 2, 0.32, 0.02, 0.02, 0.08 + R() * 0.06, 0.4 + R() * 0.3, 0.8, 9.8);
          break;
        case 'glint':
          // blue motes drifting up off someone on glowdust
          this.spawn(this.glow, x + (R() - 0.5) * 0.5, y + (R() - 0.5) * 0.4, z + (R() - 0.5) * 0.5, (R() - 0.5) * 0.3, 0.3 + R() * 0.5, (R() - 0.5) * 0.3, 0.8, 2.6, 5, 0.04 + R() * 0.03, 0.8 + R() * 0.8, 0.8, -0.2);
          break;
        case 'oil':
          this.spawn(this.soft, x, y, z, Math.cos(a) * (1 + R()) + dx * 2, 0.5 + R() * 2, Math.sin(a) * (1 + R()) + dz * 2, 0.04, 0.035, 0.03, 0.09 + R() * 0.06, 0.45 + R() * 0.3, 0.8, 9.8);
          break;
      }
    }
  }

  /** A beam from a to b that fades in a blink: lasers. */
  beam(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: [number, number, number], width = 0.06, life = 0.16) {
    const d = Math.hypot(bx - ax, by - ay, bz - az);
    if (d < 0.01) return;
    let bm = this.beams.find((b) => b.age >= b.life);
    if (!bm) {
      if (this.beams.length >= 24) return;
      const mat = new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
      bm = { mesh: new THREE.Mesh(this.beamGeo, mat), age: 0, life: 0 };
      bm.mesh.renderOrder = 13;
      bm.mesh.frustumCulled = false;
      this.beams.push(bm);
      this.glow.pts.parent?.add(bm.mesh);
    }
    bm.age = 0; bm.life = life;
    const m = bm.mesh;
    m.position.set(ax, ay, az);
    m.lookAt(bx, by, bz);
    m.scale.set(width, width, d);
    (m.material as THREE.MeshBasicMaterial).color.setRGB(color[0], color[1], color[2]);
    (m.material as THREE.MeshBasicMaterial).opacity = 1;
    m.visible = true;
    // a flash where it leaves and sparks where it lands
    this.burst('flash', ax, ay, az, 1);
    this.burst('sparks', bx, by, bz, 6);
  }

  update(dt: number) {
    // a slow frame slows the effects rather than skipping them
    dt = Math.min(dt, 1 / 30);
    for (const p of [this.glow, this.soft]) {
      let live = 0;
      for (let i = 0; i < p.n; i++) {
        if (p.alpha[i] <= 0) continue;
        p.age[i] += dt;
        const t = p.age[i] / p.life[i];
        if (t >= 1) { p.alpha[i] = 0; continue; }
        live++;
        const dr = Math.exp(-p.drag[i] * dt);
        p.vel[i * 3] *= dr; p.vel[i * 3 + 2] *= dr;
        p.vel[i * 3 + 1] = p.vel[i * 3 + 1] * dr - p.grav[i] * dt;
        p.pos[i * 3] += p.vel[i * 3] * dt;
        p.pos[i * 3 + 1] += p.vel[i * 3 + 1] * dt;
        p.pos[i * 3 + 2] += p.vel[i * 3 + 2] * dt;
        p.size[i] = p.size0[i] * (1 + p.grow[i] * p.age[i]);
        // sparks cool from white-hot to red as they die; smoke thins out
        const cool = p === this.glow ? 1 - t * 0.7 : 1;
        p.col[i * 3] = p.base[i * 3] * cool;
        p.col[i * 3 + 1] = p.base[i * 3 + 1] * cool * cool;
        p.col[i * 3 + 2] = p.base[i * 3 + 2] * cool * cool * cool;
        p.alpha[i] = p === this.glow ? 1 - t * t : Math.min(1, t * 6) * (1 - t) * 0.6;
      }
      const g = p.pts.geometry;
      for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) g.getAttribute(k).needsUpdate = true;
      g.setDrawRange(0, live || p.n ? p.n : 0);
      p.pts.visible = live > 0;
    }
    for (const b of this.beams) {
      if (b.age >= b.life) { b.mesh.visible = false; continue; }
      if (b.age === 0) { b.age = 1e-4; continue; } // every beam is seen at full strength for a frame at least
      b.age += dt;
      const f = Math.max(0, 1 - b.age / b.life);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = f;
      b.mesh.scale.x = b.mesh.scale.y = Math.max(0.01, b.mesh.scale.x * (0.9 + 0.1 * f));
    }
  }
}
