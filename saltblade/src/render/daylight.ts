// Sun, moon, sky, fog and ambient colours from the time of day, the weather
// and the region the camera is looking at.
import * as THREE from 'three';
import { Renderer } from './renderer';
import { Sky } from './sky';
import { clamp01, smoothstep, lerp } from '../core/math';

export interface SkyWeather {
  cloud: number; // 0..1
  fogMul: number;
  tint: THREE.Color; // haze tint (sRGB-linear colour)
  tintAmt: number;
  dim: number; // 1 = full sun
}

const C = (hex: number) => new THREE.Color(hex);
const DAY_ZEN = C(0x6f93b8), SET_ZEN = C(0x4a5878), NIGHT_ZEN = C(0x060a14);
const SET_HOR = C(0xe39a62), NIGHT_HOR = C(0x141c2a);
const SUN_DAY = C(0xfff1dc), SUN_SET = C(0xffa060), MOON = C(0x8a9ac0);
const tmp = new THREE.Color(), tmp2 = new THREE.Color(), hazeC = new THREE.Color();

export class Daylight {
  sunDir = new THREE.Vector3();
  moonDir = new THREE.Vector3();
  night = 0;
  haze = new THREE.Color(0xd8c9a8);
  private hazeTarget = new THREE.Color(0xd8c9a8);
  fogBase = 1;
  private fogTarget = 1;
  horizon = new THREE.Color();

  setRegion(hazeHex: number, fog: number) {
    this.hazeTarget.setHex(hazeHex);
    this.fogTarget = fog;
  }

  update(dt: number, hour: number, day: number, R: Renderer, sky: Sky, W: SkyWeather, waterU?: Record<string, THREE.IUniform>) {
    this.haze.lerp(this.hazeTarget, 1 - Math.exp(-dt * 0.8));
    this.fogBase = lerp(this.fogBase, this.fogTarget, 1 - Math.exp(-dt * 0.8));
    // sun path: rises east (+x) around 06:00, sets west around 18:30
    const a = ((hour - 6.2) / 12.6) * Math.PI;
    this.sunDir.set(Math.cos(a), Math.sin(a) * 0.92, 0.38).normalize();
    // the moon runs its own slow cycle
    const ma = ((hour - 18 + ((day % 9) / 9) * 24) / 12.4) * Math.PI;
    this.moonDir.set(Math.cos(ma) * 0.8, Math.max(0.12, Math.sin(ma)) * 0.85, -0.45).normalize();
    const e = this.sunDir.y;
    const dayT = smoothstep(-0.08, 0.25, e); // 0 night .. 1 day
    const setT = (1 - smoothstep(0.0, 0.32, Math.abs(e - 0.03))) * smoothstep(-0.12, 0.02, e); // golden hour
    this.night = 1 - dayT;

    // sky colours
    hazeC.copy(this.haze);
    if (W.tintAmt > 0) hazeC.lerp(W.tint, W.tintAmt);
    const zen = tmp.copy(NIGHT_ZEN).lerp(DAY_ZEN, dayT).lerp(SET_ZEN, setT * 0.6);
    zen.lerp(hazeC, W.cloud * 0.45 * dayT);
    const hor = tmp2.copy(NIGHT_HOR).lerp(hazeC, dayT).lerp(SET_HOR, setT * 0.55);
    this.horizon.copy(hor);
    const u = sky.u;
    (u.uZenith.value as THREE.Color).copy(zen).multiplyScalar(lerp(1, W.dim, dayT));
    (u.uHorizon.value as THREE.Color).copy(hor).multiplyScalar(lerp(1, 0.6 + 0.4 * W.dim, dayT));
    (u.uSunDir.value as THREE.Vector3).copy(this.sunDir);
    (u.uMoonDir.value as THREE.Vector3).copy(this.moonDir);
    const sunCol = (u.uSunCol.value as THREE.Color).copy(SUN_DAY).lerp(SUN_SET, setT);
    u.uStars.value = clamp01(1 - dayT * 1.6) * (1 - W.cloud * 0.8);
    u.uCloud.value = W.cloud;
    u.uNight.value = this.night;
    (u.uCloudCol.value as THREE.Color).copy(hazeC).lerp(C(0xffffff), 0.35).multiplyScalar(0.25 + 0.75 * dayT * W.dim);

    // lights
    const sunI = dayT * 2.7 * W.dim;
    const moonI = (1 - dayT) * 0.5;
    if (sunI >= moonI) {
      R.sun.color.copy(sunCol);
      R.sun.intensity = sunI + 0.001;
      R.placeSun(this.sunDir);
    } else {
      R.sun.color.copy(MOON);
      R.sun.intensity = moonI;
      R.placeSun(this.moonDir);
    }
    R.hemi.color.copy(zen).lerp(C(0xffffff), 0.35).multiplyScalar(0.5 + 0.9 * dayT);
    R.hemi.groundColor.copy(hazeC).multiplyScalar(0.35 + 0.5 * dayT);
    R.hemi.intensity = 0.55 + 0.75 * dayT * (0.7 + 0.3 * W.dim) + (1 - dayT) * 0.25;
    // fog matches the horizon
    R.fog.color.copy(hor).multiplyScalar(lerp(1, 0.75 + 0.25 * W.dim, dayT));
    R.fog.density = 0.00026 * this.fogBase * W.fogMul * (1 + (1 - dayT) * 0.4);
    R.gl.toneMappingExposure = 1.0 + (1 - dayT) * 0.35;
    if (waterU) {
      (waterU.uSunDir.value as THREE.Vector3).copy(sunI >= moonI ? this.sunDir : this.moonDir);
      (waterU.uSunCol.value as THREE.Color).copy(R.sun.color).multiplyScalar(Math.min(1, R.sun.intensity));
      (waterU.uSky.value as THREE.Color).copy(hor).lerp(zen, 0.4);
      waterU.uDim.value = 0.35 + 0.65 * dayT;
    }
  }
}
