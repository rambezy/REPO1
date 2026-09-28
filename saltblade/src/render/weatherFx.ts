// What weather looks like: rain streaks, drifting dust, ash and spores, the
// sky and fog closing in, the odd flash of lightning.
import * as THREE from 'three';
import type { WeatherKind } from '../world/regions';
import type { SkyWeather } from './daylight';
import { lerp, clamp } from '../core/math';

interface Look { cloud: number; fogMul: number; tint: number; tintAmt: number; dim: number; rain: number; rainCol: number; motes: number; moteCol: number; moteSize: number; wind: number; fall: number; }

const CLEAR: Look = { cloud: 0.25, fogMul: 1, tint: 0xd8c9a8, tintAmt: 0, dim: 1, rain: 0, rainCol: 0xb8c4d0, motes: 0, moteCol: 0xd8c090, moteSize: 1, wind: 2, fall: 0.3 };
const LOOKS: Record<WeatherKind, Look> = {
  clear: CLEAR,
  overcast: { ...CLEAR, cloud: 0.85, fogMul: 1.8, tint: 0xa8a8a0, tintAmt: 0.25, dim: 0.72 },
  heat: { ...CLEAR, cloud: 0.02, fogMul: 2.2, tint: 0xf0d8a0, tintAmt: 0.3, dim: 1.08, motes: 0.12, moteCol: 0xf0e0c0, moteSize: 0.5, wind: 1 },
  dust: { ...CLEAR, cloud: 0.6, fogMul: 20, tint: 0xb89060, tintAmt: 0.85, dim: 0.6, motes: 0.55, moteCol: 0xc8a070, moteSize: 0.55, wind: 16, fall: 0.2 },
  rain: { ...CLEAR, cloud: 0.95, fogMul: 5, tint: 0x8894a0, tintAmt: 0.45, dim: 0.5, rain: 1, rainCol: 0xc0ccdc, wind: 3 },
  fog: { ...CLEAR, cloud: 0.75, fogMul: 24, tint: 0xd0d4d6, tintAmt: 0.75, dim: 0.55, motes: 0.1, moteCol: 0xe8ecf0, moteSize: 9, wind: 0.6, fall: 0.02 },
  acid: { ...CLEAR, cloud: 0.95, fogMul: 6, tint: 0x98b060, tintAmt: 0.5, dim: 0.5, rain: 0.85, rainCol: 0xc8f080, wind: 4 },
  gas: { ...CLEAR, cloud: 0.6, fogMul: 16, tint: 0xa8b058, tintAmt: 0.8, dim: 0.65, motes: 0.14, moteCol: 0xc8d878, moteSize: 8, wind: 1.2, fall: 0.01 },
  ash: { ...CLEAR, cloud: 0.8, fogMul: 10, tint: 0x7a7068, tintAmt: 0.7, dim: 0.58, motes: 0.8, moteCol: 0xa8a098, moteSize: 0.7, wind: 3, fall: 0.8 },
  spores: { ...CLEAR, cloud: 0.5, fogMul: 6, tint: 0xd8c890, tintAmt: 0.5, dim: 0.8, motes: 0.6, moteCol: 0xf8f0b0, moteSize: 0.8, wind: 1, fall: 0.1 },
};

const RAIN_N = 7000, MOTE_N = 5000;

const rainVS = /* glsl */ `
uniform float uTime, uBox, uH, uSpeed, uLen;
uniform vec3 uCenter;
uniform vec2 uWind;
attribute vec3 aSeed;
attribute float aEnd;
varying float vFade;
void main() {
  vec3 o = aSeed * vec3(uBox, uH, uBox);
  float sp = uSpeed * (0.85 + aSeed.y * 0.3);
  float y = mod(o.y - uTime * sp, uH);
  vec3 base = uCenter - vec3(uBox * 0.5, 0.0, uBox * 0.5);
  vec3 drift = vec3(uWind.x, 0.0, uWind.y) * (uH - y) / sp;
  vec3 p = vec3(o.x, 0.0, o.z) + drift;
  p.x = base.x + mod(p.x - base.x, uBox);
  p.z = base.z + mod(p.z - base.z, uBox);
  p.y = uCenter.y - uH * 0.35 + y;
  vec3 dir = normalize(vec3(uWind.x, -sp, uWind.y));
  p -= dir * uLen * aEnd;
  vFade = (1.0 - aEnd * 0.8) * smoothstep(0.0, 0.2, y / uH) * smoothstep(1.0, 0.8, y / uH);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const rainFS = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vFade;
void main() { gl_FragColor = vec4(uColor, uAlpha * vFade); }`;

const moteVS = /* glsl */ `
uniform float uTime, uBox, uH, uFall, uSize;
uniform vec3 uCenter;
uniform vec2 uWind;
attribute vec3 aSeed;
varying float vFade;
void main() {
  vec3 o = aSeed * vec3(uBox, uH, uBox);
  float t = uTime;
  o.x += t * uWind.x * (0.7 + aSeed.z * 0.6) + sin(t * 0.7 + aSeed.z * 40.0) * 1.8;
  o.z += t * uWind.y * (0.7 + aSeed.x * 0.6) + cos(t * 0.6 + aSeed.x * 40.0) * 1.8;
  float y = mod(o.y - t * uFall * (0.6 + aSeed.x) + sin(t * 1.3 + aSeed.y * 30.0) * 0.6, uH);
  vec3 base = uCenter - vec3(uBox * 0.5, 0.0, uBox * 0.5);
  vec3 p = vec3(base.x + mod(o.x - base.x, uBox), uCenter.y - uH * 0.3 + y, base.z + mod(o.z - base.z, uBox));
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * (0.6 + aSeed.y) * 260.0 / -mv.z, 1.0, 160.0);
  vFade = smoothstep(0.0, 0.15, y / uH) * smoothstep(1.0, 0.8, y / uH);
}`;
const moteFS = /* glsl */ `
uniform vec3 uColor;
uniform float uAlpha;
varying float vFade;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.05, d);
  gl_FragColor = vec4(uColor, uAlpha * a * vFade);
}`;

export class WeatherFx {
  group = new THREE.Group();
  kind: WeatherKind = 'clear';
  i = 0; // shown intensity
  private rainU: Record<string, THREE.IUniform>;
  private moteU: Record<string, THREE.IUniform>;
  private rain: THREE.LineSegments;
  private motes: THREE.Points;
  private t = 0;
  flash = 0;
  private flashT = 8;
  private tint = new THREE.Color();

  constructor() {
    const seeds = new Float32Array(RAIN_N * 2 * 3), ends = new Float32Array(RAIN_N * 2);
    for (let k = 0; k < RAIN_N; k++) {
      const x = Math.random(), y = Math.random(), z = Math.random();
      for (let e = 0; e < 2; e++) { seeds.set([x, y, z], (k * 2 + e) * 3); ends[k * 2 + e] = e; }
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(RAIN_N * 2 * 3), 3));
    rg.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 3));
    rg.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    this.rainU = {
      uTime: { value: 0 }, uBox: { value: 70 }, uH: { value: 40 }, uSpeed: { value: 17 }, uLen: { value: 0.9 },
      uCenter: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(2, 1) }, uColor: { value: new THREE.Color(0xb8c4d0) }, uAlpha: { value: 0 },
    };
    this.rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({ uniforms: this.rainU, vertexShader: rainVS, fragmentShader: rainFS, transparent: true, depthWrite: false, fog: false }));
    this.rain.frustumCulled = false;
    this.rain.renderOrder = 8;
    const ms = new Float32Array(MOTE_N * 3);
    for (let k = 0; k < ms.length; k++) ms[k] = Math.random();
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MOTE_N * 3), 3));
    mg.setAttribute('aSeed', new THREE.BufferAttribute(ms, 3));
    this.moteU = {
      uTime: { value: 0 }, uBox: { value: 90 }, uH: { value: 30 }, uFall: { value: 0.3 }, uSize: { value: 1 },
      uCenter: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(3, 1) }, uColor: { value: new THREE.Color(0xd8c090) }, uAlpha: { value: 0 },
    };
    this.motes = new THREE.Points(mg, new THREE.ShaderMaterial({ uniforms: this.moteU, vertexShader: moteVS, fragmentShader: moteFS, transparent: true, depthWrite: false, fog: false }));
    this.motes.frustumCulled = false;
    this.motes.renderOrder = 8;
    this.group.add(this.rain, this.motes);
  }

  /**
   * Follows the weather at the camera: fades the old kind out before the new
   * one comes in, fills the sky-weather block and moves the particles.
   */
  update(dt: number, want: { kind: WeatherKind; i: number }, cam: THREE.Vector3, target: THREE.Vector3, camDist: number, out: SkyWeather, windAngle: number) {
    this.t += dt;
    if (want.kind !== this.kind) {
      this.i = Math.max(0, this.i - dt * 0.35);
      if (this.i <= 0.001) this.kind = want.kind;
    } else this.i += clamp(want.i - this.i, -dt * 0.25, dt * 0.25);
    const L = LOOKS[this.kind] ?? CLEAR;
    const k = this.kind === 'clear' ? 0 : this.i;
    out.cloud = lerp(CLEAR.cloud, L.cloud, k);
    out.fogMul = lerp(1, L.fogMul, k);
    out.tint.copy(this.tint.setHex(L.tint));
    out.tintAmt = L.tintAmt * k;
    out.dim = lerp(1, L.dim, k);
    // particles hover between the camera and what it looks at
    const c = this.rainU.uCenter.value as THREE.Vector3;
    c.copy(cam).lerp(target, camDist > 90 ? 0.75 : 0.45);
    (this.moteU.uCenter.value as THREE.Vector3).copy(c);
    const near = clamp(1.4 - camDist / 260, 0, 1);
    const wind = L.wind * (0.6 + 0.4 * k);
    const wx = Math.cos(windAngle) * wind, wz = Math.sin(windAngle) * wind;
    this.rainU.uTime.value = this.t;
    (this.rainU.uWind.value as THREE.Vector2).set(wx, wz);
    (this.rainU.uColor.value as THREE.Color).setHex(L.rainCol);
    this.rainU.uAlpha.value = L.rain * k * near * 0.7;
    this.rainU.uBox.value = clamp(camDist * 1.1, 45, 140);
    this.rain.visible = (this.rainU.uAlpha.value as number) > 0.01;
    this.moteU.uTime.value = this.t;
    (this.moteU.uWind.value as THREE.Vector2).set(wx, wz);
    (this.moteU.uColor.value as THREE.Color).setHex(L.moteCol);
    this.moteU.uAlpha.value = L.motes * k * near * 0.7;
    this.moteU.uSize.value = L.moteSize;
    this.moteU.uFall.value = L.fall;
    this.moteU.uBox.value = clamp(camDist * 1.3, 60, 180);
    this.motes.visible = (this.moteU.uAlpha.value as number) > 0.01;
    // lightning in heavy rain
    this.flash = Math.max(0, this.flash - dt * 6);
    if ((this.kind === 'rain' || this.kind === 'acid') && k > 0.7) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flash = 1; this.flashT = 6 + Math.random() * 18; }
    }
  }
}
