// Chunked terrain meshes with distance LOD and skirts. Vertex colours carry
// the region's ground tones, shore and wetness; each vertex also carries its
// region's rock colour and how much of each kind of ground detail it shows
// (cracked earth, sand ripples, grass, mud, salt crust, ash, rust, glass),
// which the fragment shader draws close up, with rock on the slopes and a bump.
import * as THREE from 'three';
import { Terrain } from '../world/terrain';
import { RegionField } from '../world/gen';
import { REGIONS } from '../world/regions';
import { CELL, CHUNK, CHUNKS, CHUNK_M, N, SEA } from '../world/consts';
import { Noise2 } from '../core/noise';
import { smoothstep, clamp01 } from '../core/math';
import { NOISE_GLSL, setSurfaceQuality, warmSurfaces } from './surface';
import { roadMaterials, setRoadQuality } from './roads';
import { reducedMotion } from './impact';
import { G } from '../state';

const tmpC = new THREE.Color();
function lin(hex: number): [number, number, number] {
  tmpC.setHex(hex);
  return [tmpC.r, tmpC.g, tmpC.b];
}
interface RegCols { g0: number[]; g1: number[]; g2: number[]; rock: number[]; shore: number[]; water: number[]; }
const REGCOLS: RegCols[] = REGIONS.map((r) => ({ g0: lin(r.ground[0]), g1: lin(r.ground[1]), g2: lin(r.ground[2]), rock: lin(r.rock), shore: lin(r.shore), water: lin(r.water) }));
const TOWN = lin(0x9a8a6e);

/** Ground detail per region: cracks, ripples, grass, wet | salt, ash, rust, glass. */
const DETAIL: Record<string, number[]> = {
  flats: [0.85, 0.3, 0.05, 0, 0, 0, 0, 0],
  salt: [0.15, 0.1, 0, 0.05, 1, 0, 0, 0],
  vale: [0, 0, 1, 0.1, 0, 0, 0, 0],
  coast: [0, 0.35, 0.3, 0.55, 0, 0.15, 0, 0],
  ember: [0.55, 0.12, 0.45, 0, 0, 0, 0, 0],
  highlands: [0.65, 0.1, 0.2, 0, 0, 0, 0.12, 0],
  thrumwood: [0, 0, 0.9, 0.25, 0, 0, 0, 0],
  mire: [0, 0, 0.55, 1, 0, 0, 0, 0],
  ash: [0.25, 0.2, 0, 0, 0, 1, 0, 0],
  bonesea: [0.15, 1, 0, 0, 0, 0, 0, 0],
  rust: [0.35, 0.1, 0.05, 0, 0, 0.1, 1, 0],
  glass: [0.15, 0, 0, 0.1, 0, 0.2, 0, 1],
};
const REGDET = REGIONS.map((r) => DETAIL[r.key] ?? [0, 0, 0, 0, 0, 0, 0, 0]);
/** Mire water is murky, with scum on it. */
const MURK = REGIONS.map((r) => (r.key === 'mire' ? 1 : r.key === 'thrumwood' ? 0.4 : 0));

/** uFineK: how much of the finest grain shows, by the camera's height above the ground */
export const terrainU = { uSky: { value: new THREE.Color(0.7, 0.75, 0.8) }, uFineK: { value: 0 } };
/** chunks nearer than this (m) get the close-up material */
const NEAR_D = 280;

// Every pixel works all of this out (a GPU without real branching pays for every
// feature whether a region has it or not), so the features share five noises:
// macro (tN1), patches (tN5), mid (tN2), and close up the metre (n3) and the
// fine grain (n4); cracks, salt plates and glass plates share one network of
// plates (a hexagonal grid bent out of true by the noise).
// Chunks further off use the far version (no SB_TNEAR): no fine detail, no bump.
const TERRAIN_FRAG = /* glsl */ `
  vec3 tCol = diffuseColor.rgb;
  float tVd = length(vWPos - cameraPosition);
  float tMid = 1.0 - smoothstep(500.0, 1600.0, tVd);
  vec2 tp = vWPos.xz;
  float tN1 = sbN(tp * 0.043), tN2 = sbN(tp * 0.21);
  // (low quality, SB_TLOW: only the macro noise, rock, grass and paths, about what the ground cost before)
  #ifdef SB_TLOW
    float tN5 = 0.5;
  #else
    float tN5 = sbN(tp * 0.075 + 13.0);
  #endif
  #ifdef SB_TNEAR
    float tFine = 1.0 - smoothstep(70.0, 260.0, tVd);
    float n3r = sbN(tp * 0.93), n3 = mix(0.5, n3r, tFine);
    #ifdef SB_TFINE
      // the finest grain (pebbles, blades, cinders) only right by the camera, and only as it comes down close
      float tNear = (1.0 - smoothstep(30.0, 55.0, tVd)) * uFineK;
      float n4 = mix(0.5, sbN(tp * 3.1), tNear);
    #else
      float tNear = 0.0, n4 = 0.5;
    #endif
  #else
    float tFine = 0.0, tNear = 0.0, n3r = 0.5, n3 = 0.5, n4 = 0.5;
  #endif
  float tSteep = 1.0 - clamp(vWNorm.y, 0.0, 1.0);
  float tH = (n3 * 0.035 + n4 * 0.012) * tFine, tGloss = 0.0, tPud = 0.0;
  float tDn = tN1 * 0.35 + tN2 * 0.3 + n3 * 0.22 + n4 * 0.13;
  // patches you still see from high up: lighter and darker ground, and scrub in the dry country
  tDn += (tN5 - 0.5) * 0.36 * tMid;
  tCol *= 0.83 + 0.34 * tDn;
  #ifndef SB_TLOW
    float tScrub = smoothstep(0.6, 0.78, tN1 * 0.45 + tN5 * 0.55 + (tN2 - 0.5) * 0.2) * max(vDet.x * 0.7, vDet.y * 0.5) * tMid;
    tCol = mix(tCol, tCol * vec3(0.8, 0.78, 0.66), tScrub * 0.6);
  #endif
  // rock where the ground is steep, banded with strata, its edge broken up
  float tRockT = smoothstep(0.07, 0.27, tSteep + (tN2 - 0.5) * 0.1);
  float strata = 0.5 + 0.5 * sbSin(vWPos.y * 5.6 + tN2 * 4.0 + (tp.x + tp.y) * 0.02);
  float rnk = mix(tN2, n3, tFine);
  vec3 rc = vRock.rgb * (0.78 + 0.3 * strata) * (0.82 + 0.3 * rnk) * (1.0 - 0.22 * strata * smoothstep(0.25, 0.55, tSteep));
  tCol = mix(tCol, rc, tRockT);
  tH += tRockT * (strata * 0.12 + rnk * 0.06) * tFine;
  float tFlat = 1.0 - tRockT;
  float k;
  #ifdef SB_TNEAR
  // the network of plates: a hexagonal grid bent out of true, stretched and squeezed by the broad noises
  // so plates come big and small, bigger on salt and again on glass; rn is each plate's own tint
  vec2 hq = tp * (0.75 - 0.3 * vDet2.x - 0.42 * vDet2.w) + (vec2(n3r, tN2) - 0.5) * vec2(1.1, 0.9) + vec2(tN5, tN1 * 0.6 + tN5 * 0.4) * 3.2;
  vec2 hs = vec2(1.0, 1.732), hh = hs * 0.5;
  vec2 ha = mod(hq, hs) - hh, hb = mod(hq - hh, hs) - hh;
  vec2 hg = dot(ha, ha) < dot(hb, hb) ? ha : hb;
  vec2 ag = abs(hg);
  float hexd = max(dot(ag, vec2(0.5, 0.866)), ag.x);
  vec2 hc = hq - hg;
  float rn = sbH1(hc * 3.0 + 0.5);
  // some cracks never opened (both plates beside an edge agree, so two plates read as one), and sand drifts over others
  float e0 = hg.x, e1 = dot(hg, vec2(0.5, 0.866)), e2 = dot(hg, vec2(-0.5, 0.866));
  vec2 en = abs(e0) > max(abs(e1), abs(e2)) ? vec2(sign(e0), 0.0) : (abs(e1) > abs(e2) ? sign(e1) * vec2(0.5, 0.866) : sign(e2) * vec2(-0.5, 0.866));
  float tDrift = smoothstep(0.55, 0.8, tN2 * 0.6 + n3r * 0.25 + tN5 * 0.3);
  float tNet = sbLine(0.5 - hexd, 0.025, fwidth(hexd)) * tFine * step(0.3, sbH1((hc * 2.0 + en) * 5.0 + 0.5)) * (1.0 - tDrift);
  // cracked earth (not on trodden town ground)
  k = vDet.x * tFlat * tFine * (1.0 - vRock.a);
  tCol *= (1.0 - 0.34 * tNet * smoothstep(0.3, 0.6, tN2 + (rn - 0.5) * 0.4) * k) * (1.0 + (rn - 0.5) * 0.1 * k * (1.0 - tDrift));
  tCol = mix(tCol, tCol * 1.06 + 0.015, tDrift * 0.6 * k);
  tH -= tNet * 0.025 * k;
  // sand ripples, combed by the wind
  k = vDet.y * tFlat * tFine * (1.0 - smoothstep(0.03, 0.15, tSteep));
  float rp = sbSin(dot(tp, vec2(0.83, 0.55)) * 4.2 + tN2 * 7.0 + n3 * 1.5);
  tCol *= 1.0 + rp * 0.05 * k;
  tH += rp * 0.02 * k;
  // salt: white plates with raised rims
  k = vDet2.x * tFlat * tFine;
  tCol = mix(tCol, tCol * 1.15 + 0.03, tNet * k);
  tCol *= 1.0 - (rn - 0.5) * 0.06 * k;
  tH += tNet * 0.03 * k;
  // glass: dark plates with pale seams that catch the sun
  k = vDet2.w * tFine;
  tCol = mix(tCol * (1.0 + (rn - 0.5) * 0.36 * k), vec3(0.12, 0.22, 0.2), tNet * 0.6 * k);
  tGloss += k * (0.5 + 0.5 * rn);
  tH += (rn * 0.05 - tNet * 0.02) * k;
  #endif
  // grass and moss: darker clumps and sunlit blades
  k = vDet.z * tFlat;
  float clump = smoothstep(0.35, 0.75, mix(tN2, n3r, tFine));
  tCol = mix(tCol, tCol * mix(vec3(0.78, 0.9, 0.66), vec3(1.12, 1.07, 0.8), n4) * (0.86 + 0.28 * clump), k * (0.4 + 0.6 * tFine));
  tH += (n3 * 0.02 + n4 * 0.008) * k * tFine;
  // mud: darker, with puddles of dark water ringed by wet mud (their sky is added after the lighting)
  k = vDet.w * tFlat;
  tCol *= 1.0 - 0.25 * k;
  #ifndef SB_TLOW
    // puddles come and go with the broad noise, fewer on trodden town ground, each ringed by glistening wet mud
    float pn = tN2 * 0.8 + n3 * 0.2 + (tN5 - 0.5) * 0.35 + (tN1 - 0.5) * 0.2 + vRock.a * 0.12;
    float ring = 1.0 - smoothstep(0.24, 0.33, pn);
    tPud = (1.0 - smoothstep(0.19, 0.22, pn)) * (1.0 - smoothstep(0.02, 0.08, tSteep)) * k;
    tCol *= 1.0 - 0.3 * ring * k;
    tCol = mix(tCol, vec3(0.07, 0.08, 0.05) + tCol * 0.18, tPud);
    tGloss += tPud + ring * 0.35 * k;
    tH -= ring * k * 0.03 * tFine;
    // ash: pale drifts and black cinders (further off, what the cinders average out to)
    k = vDet2.y * tFlat;
    tCol = mix(tCol, tCol * vec3(1.18, 1.16, 1.12), smoothstep(0.55, 0.8, mix(tN2, n3, 0.5)) * k);
    tCol *= (1.0 - 0.05 * k * (1.0 - tNear)) * (1.0 - 0.5 * smoothstep(0.78, 0.86, n4) * k * tNear);
    // rust: oxide stains and flakes of old metal
    k = vDet2.z;
    tCol = mix(tCol, vec3(0.32, 0.13, 0.05) * (0.8 + 0.4 * n3), smoothstep(0.55, 0.8, tN2 * 0.7 + n3 * 0.4) * 0.55 * k);
    tCol *= (1.0 - 0.02 * k * (1.0 - tNear)) * (1.0 - 0.35 * smoothstep(0.8, 0.88, n4) * k * tNear);
  #endif
  // wet sand just above the waterline, its edge broken so the shore isn't drawn by the triangles
  float tWet = (1.0 - smoothstep(0.0, 0.55 + 0.4 * tN2, vWPos.y + (mix(tN5, n3, 0.5) - 0.5) * 0.3)) * step(-0.3, vWPos.y);
  tCol *= 1.0 - 0.32 * tWet;
  tGloss += tWet * 0.35;
  // trodden ground in settlements: worn paths and scuffs
  float paths = smoothstep(0.3, 0.9, tN5 * 0.6 + tN1 * 0.4) + smoothstep(0.55, 0.9, n3) * 0.35;
  tCol *= 1.0 - 0.13 * vRock.a * paths;
  #ifdef SB_TFINE
    // pebbles close up
    float pk = smoothstep(0.8, 0.9, n4) * tNear * tFlat;
    tCol *= 1.0 - 0.1 * pk;
    tH += pk * 0.012;
  #endif
  diffuseColor.rgb = tCol;
`;

/**
 * The ground's material; `near` adds the close-up detail and the bump, `fine`
 * the finest grain for a camera down close, `low` the plain low-quality ground
 * (see TERRAIN_FRAG). Each is a material of its own, so nothing recompiles.
 */
export function makeTerrainMaterial(near = true, fine = false, low = false) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.defines = low ? { SB_TLOW: '' } : near ? (fine ? { SB_TNEAR: '', SB_TFINE: '' } : { SB_TNEAR: '' }) : {};
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSky = terrainU.uSky;
    sh.uniforms.uFineK = terrainU.uFineK;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aDet;
        attribute vec4 aDet2;
        attribute vec4 aRock;
        varying vec3 vWPos;
        varying vec3 vWNorm;
        varying vec4 vDet;
        varying vec4 vDet2;
        varying vec4 vRock;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vWNorm = normalize(mat3(modelMatrix) * objectNormal);
        vDet = aDet; vDet2 = aDet2; vRock = aRock;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uSky;
        uniform float uFineK;
        varying vec3 vWPos;
        varying vec3 vWNorm;
        varying vec4 vDet;
        varying vec4 vDet2;
        varying vec4 vRock;
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${TERRAIN_FRAG}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #ifdef SB_TNEAR
          normal = sbBump(-vViewPosition, normal, tH, faceDirection);
        #endif`)
      .replace('#include <envmap_fragment>', `#include <envmap_fragment>
        #if NUM_DIR_LIGHTS > 0 && defined(SB_TNEAR)
          if (tGloss > 0.0) {
            // wet ground and glass catch the sun, in shadow where the light is
            vec3 tLd = directionalLights[0].direction;
            float tS = max(dot(normal, normalize(tLd + normalize(vViewPosition))), 0.0);
            tS *= tS; tS *= tS; tS *= tS; tS *= tS; tS *= tS; tS *= tS;
            float tLit = clamp(dot(reflectedLight.directDiffuse, vec3(0.333)) / max(1e-4, dot(diffuseColor.rgb * directionalLights[0].color, vec3(0.333)) * max(dot(normal, tLd), 0.0) * RECIPROCAL_PI), 0.0, 1.0);
            outgoingLight += directionalLights[0].color * tS * min(tGloss, 1.0) * 0.25 * tLit;
          }
        #endif
        #ifndef SB_TLOW
        if (tPud > 0.0) {
          // still water mirrors the sky, more so at a glancing angle
          float tF = 1.0 - clamp((cameraPosition.y - vWPos.y) / max(tVd, 0.01), 0.0, 1.0);
          tF *= tF * tF;
          // murky water: the sky comes back browned
          outgoingLight += uSky * vec3(0.5, 0.55, 0.42) * (0.03 + 0.24 * tF) * tPud;
        }
        #endif`);
  };
  mat.customProgramCacheKey = () => 'sbterrain' + (mat.defines?.SB_TNEAR !== undefined ? 'N' : 'F') + (mat.defines?.SB_TFINE !== undefined ? 'f' : '') + (mat.defines?.SB_TLOW !== undefined ? 'L' : '');
  return mat;
}

interface ChunkMesh {
  mesh: THREE.Mesh;
  step: number;
  water?: THREE.Mesh;
}

export class TerrainRenderer {
  group = new THREE.Group();
  material = makeTerrainMaterial(true);
  /** the near chunks' material while the camera is down close to the ground */
  fineMaterial = makeTerrainMaterial(true, true);
  /** for chunks too far off to show any close-up detail */
  farMaterial = makeTerrainMaterial(false);
  /** every chunk on low quality */
  lowMaterial = makeTerrainMaterial(false, false, true);
  waterMat: THREE.Material;
  private fine = false;
  private warmed = false;
  private chunks = new Map<number, ChunkMesh>();
  private indexCache = new Map<number, THREE.BufferAttribute>();
  private cn: Noise2;
  private quality = '';
  maxDist = 4800;
  /** chunks whose ground changed (flattened foundations) */
  dirty = new Set<number>();
  hasWater: Uint8Array;

  constructor(public T: Terrain, public field: RegionField, waterMat: THREE.Material) {
    this.cn = new Noise2(T.seed + 555);
    this.waterMat = waterMat;
    this.hasWater = new Uint8Array(CHUNKS * CHUNKS);
    const S = N + 1;
    for (let cj = 0; cj < CHUNKS; cj++) for (let ci = 0; ci < CHUNKS; ci++) {
      let any = 0;
      for (let j = 0; j <= CHUNK && !any; j += 2) for (let i = 0; i <= CHUNK; i += 2) {
        if (T.h[(cj * CHUNK + j) * S + ci * CHUNK + i] < SEA + 0.2) { any = 1; break; }
      }
      this.hasWater[cj * CHUNKS + ci] = any;
    }
  }

  stepFor(dist: number) {
    return dist < 800 ? 1 : dist < 1600 ? 2 : dist < 2800 ? 4 : 8;
  }

  update(cam: THREE.Vector3, budgetMs = 5) {
    const t0 = performance.now();
    // the ground detail follows the quality setting; puddles reflect the sky colour the water uses
    const q = G.R?.level ?? 'high';
    if (q !== this.quality) {
      this.quality = q;
      setSurfaceQuality(q === 'low');
      setRoadQuality(q === 'low');
    }
    // every version of every procedural material is compiled once, up front, rather than when first seen
    if (!this.warmed && G.R) {
      this.warmed = true;
      warmSurfaces(G.R.gl, G.R.camera, G.R.scene, [this.material, this.fineMaterial, this.farMaterial, this.lowMaterial, ...roadMaterials()]);
    }
    const wu = (this.waterMat as THREE.ShaderMaterial).uniforms;
    if (wu?.uSky) terrainU.uSky.value.copy(wu.uSky.value as THREE.Color);
    // glints need the sun: none under heavy cloud; the water stills for those who want less motion
    if (wu?.uGlint) wu.uGlint.value = 1 - smoothstep(0.45, 0.85, G.sky?.u.uCloud.value ?? 0);
    if (wu?.uMotion) wu.uMotion.value = reducedMotion() ? 0.1 : 1;
    // the finest grain fades in as the camera comes down
    const camH = cam.y - Math.max(0, this.T.heightAt(cam.x, cam.z));
    terrainU.uFineK.value = 1 - smoothstep(35, 55, camH);
    this.fine = this.fine ? camH < 62 : camH < 58;
    const want = new Map<number, number>();
    const ci0 = Math.max(0, Math.floor((cam.x - this.maxDist) / CHUNK_M)), ci1 = Math.min(CHUNKS - 1, Math.floor((cam.x + this.maxDist) / CHUNK_M));
    const cj0 = Math.max(0, Math.floor((cam.z - this.maxDist) / CHUNK_M)), cj1 = Math.min(CHUNKS - 1, Math.floor((cam.z + this.maxDist) / CHUNK_M));
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const cx = (ci + 0.5) * CHUNK_M, cz = (cj + 0.5) * CHUNK_M;
      const dx = Math.max(0, Math.abs(cam.x - cx) - CHUNK_M / 2), dz = Math.max(0, Math.abs(cam.z - cz) - CHUNK_M / 2);
      const d = Math.sqrt(dx * dx + dz * dz + cam.y * cam.y * 0.25);
      if (d > this.maxDist) continue;
      want.set(cj * CHUNKS + ci, this.stepFor(d));
    }
    // drop far chunks
    for (const [k, c] of this.chunks) {
      if (!want.has(k)) {
        this.group.remove(c.mesh);
        c.mesh.geometry.dispose();
        if (c.water) { this.group.remove(c.water); c.water.geometry.dispose(); }
        this.chunks.delete(k);
      }
    }
    // build or rebuild, nearest (finest) first
    const todo: [number, number][] = [];
    for (const [k, step] of want) {
      const c = this.chunks.get(k);
      if (!c || c.step !== step || this.dirty.has(k)) todo.push([k, step]);
    }
    todo.sort((a, b) => a[1] - b[1]);
    for (const [k, step] of todo) {
      if (performance.now() - t0 > budgetMs && this.chunks.size > 0) break;
      this.build(k, step);
      this.dirty.delete(k);
    }
    // close-up detail only on chunks that come within its reach, the finest only with the camera down low
    // (by then uFineK has faded it out, so the change of material shows nothing)
    const low = q === 'low';
    const near = this.fine ? this.fineMaterial : this.material;
    for (const [k, c] of this.chunks) {
      const cx = ((k % CHUNKS) + 0.5) * CHUNK_M, cz = (Math.floor(k / CHUNKS) + 0.5) * CHUNK_M;
      const dx = Math.max(0, Math.abs(cam.x - cx) - CHUNK_M / 2), dz = Math.max(0, Math.abs(cam.z - cz) - CHUNK_M / 2);
      c.mesh.material = low ? this.lowMaterial : dx * dx + dz * dz < NEAR_D * NEAR_D ? near : this.farMaterial;
    }
  }

  /** Forces every loaded chunk to rebuild (e.g. after terrain edits). */
  invalidateAt(x: number, z: number, r: number) {
    const ci0 = Math.max(0, Math.floor((x - r) / CHUNK_M)), ci1 = Math.min(CHUNKS - 1, Math.floor((x + r) / CHUNK_M));
    const cj0 = Math.max(0, Math.floor((z - r) / CHUNK_M)), cj1 = Math.min(CHUNKS - 1, Math.floor((z + r) / CHUNK_M));
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) this.dirty.add(cj * CHUNKS + ci);
  }

  private indices(step: number) {
    let idx = this.indexCache.get(step);
    if (idx) return idx;
    const V = CHUNK / step + 1;
    const arr: number[] = [];
    for (let j = 0; j < V - 1; j++) for (let i = 0; i < V - 1; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
      // diagonal a-d, matching Terrain.heightAt
      arr.push(a, d, b, a, c, d);
    }
    // skirt: ring of V*4 vertices after the grid, one below each edge vertex
    const base = V * V;
    const ring: number[] = [];
    for (let i = 0; i < V; i++) ring.push(i); // top edge (j=0)
    for (let j = 1; j < V; j++) ring.push(j * V + V - 1); // right edge
    for (let i = V - 2; i >= 0; i--) ring.push((V - 1) * V + i); // bottom edge
    for (let j = V - 2; j >= 1; j--) ring.push(j * V); // left edge
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k], b = ring[(k + 1) % ring.length];
      const as = base + k, bs = base + ((k + 1) % ring.length);
      arr.push(a, b, bs, a, bs, as);
      arr.push(a, bs, b, a, as, bs); // both windings so skirts show from any side
    }
    idx = new THREE.BufferAttribute(new Uint32Array(arr), 1);
    this.indexCache.set(step, idx);
    return idx;
  }

  /**
   * Ground colour at a sample, blending up to three regions, into out[0..2];
   * out[3..5] the rock colour, out[6] how trodden (in a settlement), out[7..14]
   * the ground detail weights.
   */
  colorAt(x: number, z: number, h: number, slope: number, out: number[]) {
    const f = this.field;
    f.eval(x, z);
    const cn = this.cn;
    const t1 = Math.min(1, Math.max(0, cn.fbm(x / 260, z / 260, 3) * 0.9 + 0.5));
    const t2 = cn.n(x / 37 + 7, z / 37 - 3) * 0.5 + 0.5;
    const shoreT = h < SEA + 1.6 ? smoothstep(SEA + 1.6, SEA - 0.2, h) : 0;
    let r = 0, g = 0, b = 0, rr = 0, rg = 0, rb = 0;
    for (let k = 7; k < 15; k++) out[k] = 0;
    const ids = [f.r1, f.r2, f.r3], ws = [f.w1, f.w2, f.w3];
    for (let k = 0; k < 3; k++) {
      const w = ws[k];
      if (w < 0.002) continue;
      const c = REGCOLS[ids[k]];
      const a = t1, bb = t2 * 0.55;
      let cr = c.g0[0] * (1 - a) + c.g1[0] * a, cg = c.g0[1] * (1 - a) + c.g1[1] * a, cb = c.g0[2] * (1 - a) + c.g1[2] * a;
      cr = cr * (1 - bb) + c.g2[0] * bb; cg = cg * (1 - bb) + c.g2[1] * bb; cb = cb * (1 - bb) + c.g2[2] * bb;
      cr += (c.shore[0] - cr) * shoreT; cg += (c.shore[1] - cg) * shoreT; cb += (c.shore[2] - cb) * shoreT;
      r += cr * w; g += cg * w; b += cb * w;
      rr += c.rock[0] * w; rg += c.rock[1] * w; rb += c.rock[2] * w;
      const det = REGDET[ids[k]];
      for (let d = 0; d < 8; d++) out[7 + d] += det[d] * w;
    }
    // the slope's rock colour is drawn by the shader; out here it only tints the far LOD a little
    const rockT = smoothstep(0.6, 1.2, slope) * 0.5;
    r += (rr - r) * rockT; g += (rg - g) * rockT; b += (rb - b) * rockT;
    // wet ground near the water
    out[10] = Math.max(out[10], shoreT * 0.6);
    // under water: darker with depth
    if (h < SEA) {
      const d = clamp01((SEA - h) / 4);
      r *= 1 - 0.55 * d; g *= 1 - 0.45 * d; b *= 1 - 0.35 * d;
    }
    // trodden ground in settlements
    let trod = 0;
    const site = this.T.siteAt(x, z);
    if (site && site.kind === 'town') {
      trod = smoothstep(site.r, site.r * 0.6, Math.hypot(x - site.x, z - site.z));
      const k = trod * 0.45 * (0.6 + 0.4 * t2);
      r += (TOWN[0] - r) * k; g += (TOWN[1] - g) * k; b += (TOWN[2] - b) * k;
      // little grass grows where people walk
      out[9] *= 1 - trod * 0.7;
    }
    out[0] = r; out[1] = g; out[2] = b;
    out[3] = rr; out[4] = rg; out[5] = rb;
    out[6] = trod;
  }

  private build(key: number, step: number) {
    const T = this.T;
    const ci = key % CHUNKS, cj = (key / CHUNKS) | 0;
    const V = CHUNK / step + 1;
    const nv = V * V + (V - 1) * 4;
    const pos = new Float32Array(nv * 3);
    const nor = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const det = new Uint8Array(nv * 4), det2 = new Uint8Array(nv * 4), rock = new Uint8Array(nv * 4);
    const S = N + 1;
    const H = T.h;
    const i0 = ci * CHUNK, j0 = cj * CHUNK;
    const c3: number[] = new Array(15).fill(0);
    const u8 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const si = i0 + i * step, sj = j0 + j * step;
      const h = H[sj * S + si];
      const v = j * V + i;
      pos[v * 3] = i * step * CELL;
      pos[v * 3 + 1] = h;
      pos[v * 3 + 2] = j * step * CELL;
      const e = Math.max(1, step);
      const hl = T.sample(si - e, sj), hr = T.sample(si + e, sj), hd = T.sample(si, sj - e), hu = T.sample(si, sj + e);
      let nx = hl - hr, ny = 2 * e * CELL, nz = hd - hu;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      nor[v * 3] = nx; nor[v * 3 + 1] = ny; nor[v * 3 + 2] = nz;
      const slope = Math.sqrt(nx * nx + nz * nz) / Math.max(0.05, ny);
      const wx = si * CELL, wz = sj * CELL;
      this.colorAt(wx, wz, h, slope, c3);
      // cavity darkening from the local laplacian
      const lap = (hl + hr + hd + hu) * 0.25 - h;
      const ao = 1 - Math.max(-0.12, Math.min(0.2, lap * 0.05));
      col[v * 3] = c3[0] * ao; col[v * 3 + 1] = c3[1] * ao; col[v * 3 + 2] = c3[2] * ao;
      rock[v * 4] = u8(c3[3] * ao); rock[v * 4 + 1] = u8(c3[4] * ao); rock[v * 4 + 2] = u8(c3[5] * ao); rock[v * 4 + 3] = u8(c3[6]);
      for (let k = 0; k < 4; k++) { det[v * 4 + k] = u8(c3[7 + k]); det2[v * 4 + k] = u8(c3[11 + k]); }
    }
    // skirt vertices
    const ring: number[] = [];
    for (let i = 0; i < V; i++) ring.push(i);
    for (let j = 1; j < V; j++) ring.push(j * V + V - 1);
    for (let i = V - 2; i >= 0; i--) ring.push((V - 1) * V + i);
    for (let j = V - 2; j >= 1; j--) ring.push(j * V);
    const drop = 6 + step * 6;
    for (let k = 0; k < ring.length; k++) {
      const s = ring[k], d = V * V + k;
      pos[d * 3] = pos[s * 3]; pos[d * 3 + 1] = pos[s * 3 + 1] - drop; pos[d * 3 + 2] = pos[s * 3 + 2];
      nor[d * 3] = nor[s * 3]; nor[d * 3 + 1] = nor[s * 3 + 1]; nor[d * 3 + 2] = nor[s * 3 + 2];
      col[d * 3] = col[s * 3] * 0.8; col[d * 3 + 1] = col[s * 3 + 1] * 0.8; col[d * 3 + 2] = col[s * 3 + 2] * 0.8;
      for (let q = 0; q < 4; q++) { det[d * 4 + q] = det[s * 4 + q]; det2[d * 4 + q] = det2[s * 4 + q]; rock[d * 4 + q] = rock[s * 4 + q]; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aDet', new THREE.BufferAttribute(det, 4, true));
    geo.setAttribute('aDet2', new THREE.BufferAttribute(det2, 4, true));
    geo.setAttribute('aRock', new THREE.BufferAttribute(rock, 4, true));
    geo.setIndex(this.indices(step));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.position.set(i0 * CELL, 0, j0 * CELL);
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    const old = this.chunks.get(key);
    if (old) {
      this.group.remove(old.mesh);
      old.mesh.geometry.dispose();
      if (old.water) { this.group.remove(old.water); old.water.geometry.dispose(); }
    }
    const cm: ChunkMesh = { mesh, step };
    if (this.hasWater[key]) cm.water = this.buildWater(ci, cj, step) ?? undefined;
    this.group.add(mesh);
    if (cm.water) this.group.add(cm.water);
    this.chunks.set(key, cm);
  }

  /**
   * The water over a chunk, on the terrain's own grid so the depth under each
   * vertex is exact and the shore falls where the ground meets the sea level.
   * Quads well above the water are left out.
   */
  private buildWater(ci: number, cj: number, step: number) {
    const T = this.T;
    const s = step;
    const V = CHUNK / s + 1;
    const S = N + 1;
    const pos = new Float32Array(V * V * 3), col = new Float32Array(V * V * 3), dep = new Float32Array(V * V * 2);
    const i0 = ci * CHUNK, j0 = cj * CHUNK;
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const v = j * V + i;
      const si = i0 + i * s, sj = j0 + j * s;
      const x = i * s * CELL, z = j * s * CELL;
      pos[v * 3] = x; pos[v * 3 + 1] = SEA; pos[v * 3 + 2] = z;
      const wx = ci * CHUNK_M + x, wz = cj * CHUNK_M + z;
      const rid = T.regionIdAt(wx, wz);
      const c = REGCOLS[rid].water;
      col[v * 3] = c[0]; col[v * 3 + 1] = c[1]; col[v * 3 + 2] = c[2];
      dep[v * 2] = SEA - T.h[Math.min(N, sj) * S + Math.min(N, si)];
      dep[v * 2 + 1] = MURK[rid];
    }
    const idx: number[] = [];
    for (let j = 0; j < V - 1; j++) for (let i = 0; i < V - 1; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
      if (Math.max(dep[a * 2], dep[b * 2], dep[c * 2], dep[d * 2]) < -0.6) continue;
      idx.push(a, d, b, a, c, d);
    }
    if (!idx.length) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aDepth', new THREE.BufferAttribute(dep, 2));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, this.waterMat);
    m.position.set(ci * CHUNK_M, 0, cj * CHUNK_M);
    m.renderOrder = 2;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    return m;
  }
}
