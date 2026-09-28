// Blood on the ground: splats where blows land and drips behind the
// bleeding, fading over a day. One instanced mesh, a ring of slots.
import * as THREE from 'three';

const MAX = 480;
const LIFE = 86400; // game seconds

const vs = /* glsl */ `
attribute float aBirth;
attribute float aShade;
uniform float uNow;
varying float vA;
varying float vShade;
varying vec2 vUv;
void main() {
  vUv = uv;
  vShade = aShade;
  float age = (uNow - aBirth) / ${LIFE.toFixed(1)};
  vA = clamp(1.0 - age, 0.0, 1.0) * step(0.0, age);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
}`;
const fs = /* glsl */ `
varying float vA;
varying float vShade;
varying vec2 vUv;
void main() {
  // ragged edge from a cheap hash of the uv
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);
  float n = fract(sin(dot(floor(vUv * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
  float edge = 0.78 + n * 0.22;
  if (r > edge) discard;
  vec3 col = mix(vec3(0.30, 0.03, 0.02), vec3(0.16, 0.02, 0.01), vShade);
  gl_FragColor = vec4(col, vA * 0.7 * smoothstep(edge, edge - 0.25, r));
}`;

export class Decals {
  mesh: THREE.InstancedMesh;
  private births: Float32Array;
  private shades: Float32Array;
  private next = 0;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  u = { uNow: { value: 0 } };

  constructor() {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.births = new Float32Array(MAX).fill(-1e9);
    this.shades = new Float32Array(MAX);
    geo.setAttribute('aBirth', new THREE.InstancedBufferAttribute(this.births, 1));
    geo.setAttribute('aShade', new THREE.InstancedBufferAttribute(this.shades, 1));
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    this.mesh = new THREE.InstancedMesh(geo, mat, MAX);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) this.mesh.setMatrixAt(i, zero);
  }

  /** A splat of `size` metres at a point on the ground, at game time `now`. */
  splat(x: number, y: number, z: number, size: number, now: number) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.e.set(0, Math.random() * Math.PI * 2, 0);
    this.q.setFromEuler(this.e);
    const sx = size * (0.7 + Math.random() * 0.6), sz = size * (0.7 + Math.random() * 0.6);
    this.m.compose(this.v.set(x, y + 0.04, z), this.q, this.s.set(sx, 1, sz));
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.births[i] = now;
    this.shades[i] = Math.random();
    (this.mesh.geometry.getAttribute('aBirth') as THREE.InstancedBufferAttribute).needsUpdate = true;
    (this.mesh.geometry.getAttribute('aShade') as THREE.InstancedBufferAttribute).needsUpdate = true;
  }

  /** Forget every splat (a new world). */
  clear() {
    this.births.fill(-1e9);
    (this.mesh.geometry.getAttribute('aBirth') as THREE.InstancedBufferAttribute).needsUpdate = true;
  }
}
