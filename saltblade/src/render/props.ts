// Instanced vegetation and boulders around the camera, built per chunk, and
// the denser ground cover close to it (see groundCover.ts).
import * as THREE from 'three';
import { Terrain } from '../world/terrain';
import { chunkProps, PROP_KINDS, PROP_INDEX } from '../world/scatter';
import { propVariants, PROP_LOD } from './propGeo';
import { CHUNKS, CHUNK_M } from '../world/consts';
import { REGIONS } from '../world/regions';
import { surfaceMaterial, farTwin } from './surface';
import { reducedMotion } from './impact';
import { G } from '../state';
import { GroundCover, FeetWatch, footprints, insideFeet } from './groundCover';
import { on } from '../core/events';

interface PropChunk {
  /** what stood on the chunk when it was built (see footprints): it is rebuilt when that changes */
  sig: string;
  /** `near`/`far`: the geometry close up and beyond `lod` metres (the same when a kind has no distant version) */
  meshes: { mesh: THREE.InstancedMesh; range: number; near: THREE.BufferGeometry; far: THREE.BufferGeometry; lod: number; mat: THREE.Material }[];
}

/** beyond this (m) plants and rocks are drawn with the cheap distant version of their surfaces */
const FAR_MAT = 200;

export const windUniform = { value: 0 };
export const windStrength = { value: 1 };

function makeMat(sway: boolean) {
  return surfaceMaterial({
    side: sway ? THREE.DoubleSide : THREE.FrontSide,
    key: sway ? 'propS' : 'propT',
    patch: sway ? (sh) => {
      sh.uniforms.uWind = windUniform;
      sh.uniforms.uWindS = windStrength;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uWind;\nuniform float uWindS;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.0);
          #endif
          float sw = max(0.0, transformed.y) * 0.06 * uWindS;
          transformed.x += sin(uWind * 1.7 + ip.x * 0.21 + ip.z * 0.13) * sw;
          transformed.z += cos(uWind * 1.3 + ip.z * 0.17) * sw * 0.6;`);
    } : undefined,
  });
}

export class PropRenderer {
  /** draw-distance multiplier from the options */
  distMul = 1;
  group = new THREE.Group();
  swayMat = makeMat(true);
  staticMat = makeMat(false);
  private chunks = new Map<number, PropChunk>();
  maxRange = 1800;
  private dummy = new THREE.Object3D();
  private col = new THREE.Color();
  cover: GroundCover;

  /** something was built or pulled down: a moment later the chunks under it are rebuilt */
  private recheckAt = 0;
  private nObjs = -1;
  private watch = new FeetWatch();

  constructor(public T: Terrain) {
    this.cover = new GroundCover(T, windUniform, windStrength);
    this.group.add(this.cover.group);
    on('objs', () => { if (!this.recheckAt) this.recheckAt = performance.now() + 500; });
  }

  update(cam: THREE.Vector3, budgetMs = 4) {
    const t0 = performance.now();
    // plants hold still for those who want less motion
    windStrength.value = reducedMotion() ? 0 : 1;
    const low = (G.R?.level ?? 'high') === 'low';
    this.cover.update(cam, Math.min(2, budgetMs / 2), this.distMul);
    const R = this.maxRange;
    const ci0 = Math.max(0, Math.floor((cam.x - R) / CHUNK_M)), ci1 = Math.min(CHUNKS - 1, Math.floor((cam.x + R) / CHUNK_M));
    const cj0 = Math.max(0, Math.floor((cam.z - R) / CHUNK_M)), cj1 = Math.min(CHUNKS - 1, Math.floor((cam.z + R) / CHUNK_M));
    const want = new Set<number>();
    const todo: [number, number][] = [];
    for (let cj = cj0; cj <= cj1; cj++) for (let ci = ci0; ci <= ci1; ci++) {
      const d = this.chunkDist(ci, cj, cam);
      if (d > R) continue;
      const k = cj * CHUNKS + ci;
      want.add(k);
      if (!this.chunks.has(k)) todo.push([k, d]);
    }
    for (const [k, c] of this.chunks) {
      if (!want.has(k)) {
        for (const m of c.meshes) { this.group.remove(m.mesh); m.mesh.dispose(); }
        this.chunks.delete(k);
      }
    }
    todo.sort((a, b) => a[1] - b[1]);
    for (const [k] of todo) {
      if (performance.now() - t0 > budgetMs) break;
      this.build(k);
    }
    // plants never grow through what is built: a chunk whose footprints changed is rebuilt there and then
    const nObjs = G.W ? G.W.objs.size : 0;
    if (nObjs !== this.nObjs) { this.nObjs = nObjs; if (!this.recheckAt) this.recheckAt = performance.now() + 500; }
    if (this.recheckAt && performance.now() > this.recheckAt) {
      this.recheckAt = 0;
      const ch = this.watch.changes();
      const redo = new Set<number>();
      if (ch !== 'all') for (const c of ch) {
        for (let cj = Math.floor((c.z - c.r) / CHUNK_M); cj <= Math.floor((c.z + c.r) / CHUNK_M); cj++) for (let ci = Math.floor((c.x - c.r) / CHUNK_M); ci <= Math.floor((c.x + c.r) / CHUNK_M); ci++) redo.add(cj * CHUNKS + ci);
      }
      // a new world (a game loaded): every chunk is rebuilt as it comes back into view
      if (ch === 'all') for (const [k, c] of this.chunks) { for (const m of c.meshes) { this.group.remove(m.mesh); m.mesh.dispose(); } this.chunks.delete(k); }
      for (const k of redo) {
        const c = this.chunks.get(k);
        if (!c || this.chunkFeet(k).sig === c.sig) continue;
        for (const m of c.meshes) { this.group.remove(m.mesh); m.mesh.dispose(); }
        this.chunks.delete(k);
        this.build(k);
      }
    }
    // per-kind draw distance, and the cheaper shapes far off
    for (const [k, c] of this.chunks) {
      const d = this.chunkDist(k % CHUNKS, (k / CHUNKS) | 0, cam);
      for (const m of c.meshes) {
        m.mesh.visible = d < m.range * this.distMul;
        if (m.lod) m.mesh.geometry = d > m.lod ? m.far : m.near;
        m.mesh.material = low || d > FAR_MAT ? farTwin(m.mat) : m.mat;
      }
    }
  }

  private chunkDist(ci: number, cj: number, cam: THREE.Vector3) {
    const cx = (ci + 0.5) * CHUNK_M, cz = (cj + 0.5) * CHUNK_M;
    const dx = Math.max(0, Math.abs(cam.x - cx) - CHUNK_M / 2), dz = Math.max(0, Math.abs(cam.z - cz) - CHUNK_M / 2);
    return Math.sqrt(dx * dx + dz * dz + cam.y * cam.y * 0.15);
  }

  private chunkFeet(k: number) {
    return footprints(((k % CHUNKS) + 0.5) * CHUNK_M, (((k / CHUNKS) | 0) + 0.5) * CHUNK_M, CHUNK_M * 0.71 + 30);
  }

  private build(k: number) {
    const ci = k % CHUNKS, cj = (k / CHUNKS) | 0;
    const { feet, sig } = this.chunkFeet(k);
    const props = feet.length ? chunkProps(this.T, ci, cj).filter((p) => !insideFeet(feet, p.x, p.z, 0.3)) : chunkProps(this.T, ci, cj);
    const groups = new Map<string, typeof props>();
    for (const p of props) {
      const kd = PROP_KINDS[p.kind];
      const nv = propVariants(kd.key).length;
      const v = Math.min(nv - 1, Math.floor(p.tint * nv));
      const key = p.kind + ':' + v;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = []));
      g.push(p);
    }
    const pc: PropChunk = { meshes: [], sig };
    const boulderIdx = PROP_INDEX.boulder;
    for (const [key, list] of groups) {
      const [kindS, vS] = key.split(':');
      const kind = +kindS;
      const kd = PROP_KINDS[kind];
      const geo = propVariants(kd.key)[+vS];
      const far = propVariants(kd.key, true)[+vS];
      const mesh = new THREE.InstancedMesh(geo, kd.sway > 0.3 ? this.swayMat : this.staticMat, list.length);
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        this.dummy.position.set(p.x, p.y - (kind === boulderIdx ? 0.25 * p.s : 0.02), p.z);
        this.dummy.rotation.set(0, p.rot, 0);
        this.dummy.scale.setScalar(p.s);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(i, this.dummy.matrix);
        const tint = 0.84 + ((p.tint * 7.31) % 1) * 0.3;
        if (kind === boulderIdx) {
          this.col.setHex(REGIONS[this.T.regionIdAt(p.x, p.z)].rock).multiplyScalar(tint * 1.05);
        } else this.col.setRGB(tint, tint, tint * 0.97);
        mesh.setColorAt(i, this.col);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.castShadow = kd.shadow;
      mesh.receiveShadow = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      pc.meshes.push({ mesh, range: kd.range, near: geo, far, lod: PROP_LOD[kd.key] ?? 0, mat: mesh.material as THREE.Material });
    }
    this.chunks.set(k, pc);
  }
}
