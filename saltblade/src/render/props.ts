// Instanced vegetation and boulders around the camera, built per chunk.
import * as THREE from 'three';
import { Terrain } from '../world/terrain';
import { chunkProps, PROP_KINDS, PROP_INDEX } from '../world/scatter';
import { propVariants } from './propGeo';
import { CHUNKS, CHUNK_M } from '../world/consts';
import { REGIONS } from '../world/regions';

interface PropChunk {
  meshes: { mesh: THREE.InstancedMesh; range: number }[];
}

export const windUniform = { value: 0 };
export const windStrength = { value: 1 };

function makeMat(sway: boolean) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: sway ? THREE.DoubleSide : THREE.FrontSide });
  if (sway) {
    m.onBeforeCompile = (sh) => {
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
    };
    m.customProgramCacheKey = () => 'sway';
  }
  return m;
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

  constructor(public T: Terrain) {}

  update(cam: THREE.Vector3, budgetMs = 4) {
    const t0 = performance.now();
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
    // per-kind draw distance
    for (const [k, c] of this.chunks) {
      const d = this.chunkDist(k % CHUNKS, (k / CHUNKS) | 0, cam);
      for (const m of c.meshes) m.mesh.visible = d < m.range * this.distMul;
    }
  }

  private chunkDist(ci: number, cj: number, cam: THREE.Vector3) {
    const cx = (ci + 0.5) * CHUNK_M, cz = (cj + 0.5) * CHUNK_M;
    const dx = Math.max(0, Math.abs(cam.x - cx) - CHUNK_M / 2), dz = Math.max(0, Math.abs(cam.z - cz) - CHUNK_M / 2);
    return Math.sqrt(dx * dx + dz * dz + cam.y * cam.y * 0.15);
  }

  private build(k: number) {
    const ci = k % CHUNKS, cj = (k / CHUNKS) | 0;
    const props = chunkProps(this.T, ci, cj);
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
    const pc: PropChunk = { meshes: [] };
    const boulderIdx = PROP_INDEX.boulder;
    for (const [key, list] of groups) {
      const [kindS, vS] = key.split(':');
      const kind = +kindS;
      const kd = PROP_KINDS[kind];
      const geo = propVariants(kd.key)[+vS];
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
      pc.meshes.push({ mesh, range: kd.range });
    }
    this.chunks.set(k, pc);
  }
}
