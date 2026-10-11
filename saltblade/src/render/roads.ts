// Road ribbons laid over the terrain: wheel ruts, a crown between them,
// ragged worn edges and loose stones, drawn in the shader from coordinates
// across and along the road. Where roads share a stretch (they often leave a
// town together) only the first is drawn, so the overlap doesn't darken.
import * as THREE from 'three';
import { Terrain } from '../world/terrain';
import { REGIONS } from '../world/regions';
import { NOISE_GLSL } from './surface';

const HALF = 3.0; // half width, m
const ACROSS = [-1, -0.5, 0, 0.5, 1];

/** The road material; `low`: without the bump (a material of its own, so changing quality compiles nothing). */
function roadMaterial(low: boolean) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  if (low) mat.defines = { SB_LQ: '' };
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aRoad;\nvarying vec3 vRoad;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRoad = aRoad;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vRoad;
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        // vRoad: x across (-1..1), y along (m), z how much of the road shows here
        float ru = abs(vRoad.x), rv = vRoad.y;
        float rn1 = sbN(vec2(rv * 0.31, vRoad.x * 1.7)), rn2 = sbN(vec2(rv * 1.6, vRoad.x * 7.0));
        float rEdge = smoothstep(1.0, 0.58 + 0.32 * rn1, ru);
        float rRut = exp(-pow((ru - 0.4) / 0.085, 2.0)) * (0.6 + 0.4 * sbN(vec2(rv * 0.2, 3.0)));
        float rCrown = smoothstep(0.28, 0.0, ru);
        float rPeb = smoothstep(0.76, 0.86, sbN(vec2(rv * 3.5, vRoad.x * 11.0))) * smoothstep(0.35, 0.9, ru);
        diffuseColor.rgb *= (1.0 - 0.24 * rRut * (0.7 + 0.3 * rn2)) * (1.0 + 0.08 * rCrown) * (0.92 + 0.12 * rn2) * (1.0 + 0.2 * rPeb * (rn1 - 0.3));
        diffuseColor.a *= rEdge * vRoad.z * 0.9;
        float rH = -rRut * 0.05 + rCrown * 0.02 + rPeb * 0.015 + rn2 * 0.006;`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifndef SB_LQ
          normal = sbBump(-vViewPosition, normal, rH * (1.0 - smoothstep(60.0, 200.0, length(vViewPosition))), faceDirection);
        #endif`);
  };
  mat.customProgramCacheKey = () => 'sbroad' + (low ? 'L' : 'H');
  return mat;
}
const MATS = { high: roadMaterial(false), low: roadMaterial(true) };
const meshes: THREE.Mesh[] = [];
/** Both road materials, for warming up. */
export const roadMaterials = () => [MATS.high, MATS.low];
/** Puts every road on the material for the quality setting. */
export function setRoadQuality(low: boolean) {
  for (const m of meshes) m.material = low ? MATS.low : MATS.high;
}

export function buildRoads(T: Terrain): THREE.Group {
  const group = new THREE.Group();
  const mat = MATS.high;
  meshes.length = 0;
  const tmp = new THREE.Color();
  const dirt = new THREE.Color(0x8a7656);
  // points already drawn, by 4 m cell
  const CELLM = 4;
  const drawn = new Map<number, number[]>();
  const key = (x: number, z: number) => Math.floor(z / CELLM) * 8192 + Math.floor(x / CELLM);
  const covered = (x: number, z: number) => {
    const cx = Math.floor(x / CELLM), cz = Math.floor(z / CELLM);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const l = drawn.get((cz + dz) * 8192 + cx + dx);
      if (!l) continue;
      for (let i = 0; i < l.length; i += 2) if (Math.hypot(l[i] - x, l[i + 1] - z) < 3.2) return true;
    }
    return false;
  };
  for (const road of T.roads) {
    const pts = road.pts;
    const n = pts.length / 2;
    const keep = new Uint8Array(n);
    const cum = new Float32Array(n);
    for (let p = 1; p < n; p++) cum[p] = cum[p - 1] + Math.hypot(pts[p * 2] - pts[p * 2 - 2], pts[p * 2 + 1] - pts[p * 2 - 1]);
    for (let p = 0; p < n; p++) keep[p] = covered(pts[p * 2], pts[p * 2 + 1]) ? 0 : 1;
    for (let p = 0; p < n; p++) {
      const k = key(pts[p * 2], pts[p * 2 + 1]);
      let l = drawn.get(k);
      if (!l) drawn.set(k, (l = []));
      l.push(pts[p * 2], pts[p * 2 + 1]);
    }
    // runs of new road, each reaching one point into the stretch already drawn so they join
    const runs: [number, number][] = [];
    for (let p = 0; p < n; p++) {
      if (!keep[p]) continue;
      let q = p;
      while (q + 1 < n && keep[q + 1]) q++;
      runs.push([Math.max(0, p - 1), Math.min(n - 1, q + 1)]);
      p = q;
    }
    for (const [r0, r1] of runs) {
      // split long roads into pieces for culling
      const PIECE = 120;
      for (let s0 = r0; s0 < r1; s0 += PIECE) {
        const s1 = Math.min(r1, s0 + PIECE);
        const pos: number[] = [], col: number[] = [], rd: number[] = [], idx: number[] = [];
        for (let p = s0; p <= s1; p++) {
          const x = pts[p * 2], z = pts[p * 2 + 1];
          const pp = Math.max(0, p - 1), np = Math.min(n - 1, p + 1);
          let tx = pts[np * 2] - pts[pp * 2], tz = pts[np * 2 + 1] - pts[pp * 2 + 1];
          const tl = Math.hypot(tx, tz) || 1;
          tx /= tl; tz /= tl;
          const nx = -tz, nz = tx;
          const reg = REGIONS[T.regionIdAt(x, z)];
          tmp.setHex(reg.ground[1]).multiplyScalar(0.9).lerp(dirt, 0.25);
          // fade in where a run starts on a stretch drawn by another road
          const ends = (p === r0 && !keep[p]) || (p === r1 && !keep[p]) ? 0 : 1;
          for (const a of ACROSS) {
            const vx = x + nx * a * HALF, vz = z + nz * a * HALF;
            const h = T.heightAt(vx, vz);
            pos.push(vx, h + 0.1, vz);
            col.push(tmp.r, tmp.g, tmp.b);
            rd.push(a, cum[p], (h < -0.3 ? 0 : 1) * ends);
          }
          if (p > s0) {
            const b = (p - s0) * ACROSS.length, a0 = b - ACROSS.length;
            for (let k = 0; k < ACROSS.length - 1; k++) idx.push(a0 + k, a0 + k + 1, b + k, a0 + k + 1, b + k + 1, b + k);
          }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.setAttribute('aRoad', new THREE.Float32BufferAttribute(rd, 3));
        geo.setIndex(idx);
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, mat);
        m.receiveShadow = true;
        m.renderOrder = 1;
        group.add(m);
        meshes.push(m);
      }
    }
  }
  return group;
}
