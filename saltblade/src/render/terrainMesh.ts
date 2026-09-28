// Chunked terrain meshes with distance LOD and skirts, vertex-coloured by
// region, slope and wetness, with fine detail added in the fragment shader.
import * as THREE from 'three';
import { Terrain } from '../world/terrain';
import { RegionField } from '../world/gen';
import { REGIONS } from '../world/regions';
import { CELL, CHUNK, CHUNKS, CHUNK_M, N, SEA } from '../world/consts';
import { Noise2 } from '../core/noise';
import { smoothstep, clamp01 } from '../core/math';

const tmpC = new THREE.Color();
function lin(hex: number): [number, number, number] {
  tmpC.setHex(hex);
  return [tmpC.r, tmpC.g, tmpC.b];
}
interface RegCols { g0: number[]; g1: number[]; g2: number[]; rock: number[]; shore: number[]; }
const REGCOLS: RegCols[] = REGIONS.map((r) => ({ g0: lin(r.ground[0]), g1: lin(r.ground[1]), g2: lin(r.ground[2]), rock: lin(r.rock), shore: lin(r.shore) }));
const TOWN = lin(0x9a8a6e);

export const terrainDetailChunk = {
  pars: /* glsl */ `
    varying vec3 vWPos;
    varying vec3 vWNorm;
    float th(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
    float tnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(th(i), th(i+vec2(1.0,0.0)), f.x), mix(th(i+vec2(0.0,1.0)), th(i+vec2(1.0,1.0)), f.x), f.y); }
  `,
};

export function makeTerrainMaterial() {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNorm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNorm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + terrainDetailChunk.pars)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float vd = length(vWPos - cameraPosition);
        float fine = 1.0 - smoothstep(120.0, 700.0, vd);
        float n1 = tnoise(vWPos.xz * 0.043);
        float n2 = tnoise(vWPos.xz * 0.21);
        float n3 = tnoise(vWPos.xz * 0.93);
        float n4 = tnoise(vWPos.xz * 3.1);
        float dn = n1 * 0.35 + n2 * 0.3 + (n3 * 0.22 + n4 * 0.13) * fine + (0.35 * 0.5) * (1.0 - fine);
        float steep = 1.0 - clamp(vWNorm.y, 0.0, 1.0);
        float strata = tnoise(vec2(vWPos.y * 0.9, (vWPos.x + vWPos.z) * 0.02)) * smoothstep(0.25, 0.55, steep);
        diffuseColor.rgb *= (0.83 + 0.34 * dn) * (1.0 - 0.22 * strata);
        // pebbles and cracks close up
        float pk = smoothstep(0.8, 0.9, tnoise(vWPos.xz * 3.3 + 17.0)) * fine;
        diffuseColor.rgb *= 1.0 - 0.09 * pk;
      `);
  };
  return mat;
}

interface ChunkMesh {
  mesh: THREE.Mesh;
  step: number;
  water?: THREE.Mesh;
}

export class TerrainRenderer {
  group = new THREE.Group();
  material = makeTerrainMaterial();
  waterMat: THREE.Material;
  private chunks = new Map<number, ChunkMesh>();
  private pending = new Map<number, number>(); // key -> desired step
  private indexCache = new Map<number, THREE.BufferAttribute>();
  private cn: Noise2;
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

  /** Ground colour at a sample, blending up to three regions. */
  colorAt(x: number, z: number, h: number, slope: number, out: number[]) {
    const f = this.field;
    f.eval(x, z);
    const cn = this.cn;
    const t1 = Math.min(1, Math.max(0, cn.fbm(x / 260, z / 260, 3) * 0.9 + 0.5));
    const t2 = cn.n(x / 37 + 7, z / 37 - 3) * 0.5 + 0.5;
    const rockT = smoothstep(0.42, 0.95, slope);
    const shoreT = h < SEA + 1.6 ? smoothstep(SEA + 1.6, SEA - 0.2, h) : 0;
    let r = 0, g = 0, b = 0;
    const ids = [f.r1, f.r2, f.r3], ws = [f.w1, f.w2, f.w3];
    for (let k = 0; k < 3; k++) {
      const w = ws[k];
      if (w < 0.002) continue;
      const c = REGCOLS[ids[k]];
      const a = t1, bb = t2 * 0.55;
      let cr = c.g0[0] * (1 - a) + c.g1[0] * a, cg = c.g0[1] * (1 - a) + c.g1[1] * a, cb = c.g0[2] * (1 - a) + c.g1[2] * a;
      cr = cr * (1 - bb) + c.g2[0] * bb; cg = cg * (1 - bb) + c.g2[1] * bb; cb = cb * (1 - bb) + c.g2[2] * bb;
      cr += (c.rock[0] - cr) * rockT; cg += (c.rock[1] - cg) * rockT; cb += (c.rock[2] - cb) * rockT;
      cr += (c.shore[0] - cr) * shoreT; cg += (c.shore[1] - cg) * shoreT; cb += (c.shore[2] - cb) * shoreT;
      r += cr * w; g += cg * w; b += cb * w;
    }
    // under water: darker with depth
    if (h < SEA) {
      const d = clamp01((SEA - h) / 4);
      r *= 1 - 0.55 * d; g *= 1 - 0.45 * d; b *= 1 - 0.35 * d;
    }
    // trodden ground in settlements
    const site = this.T.siteAt(x, z);
    if (site && site.kind === 'town') {
      const k = smoothstep(site.r, site.r * 0.6, Math.hypot(x - site.x, z - site.z)) * 0.45 * (0.6 + 0.4 * t2);
      r += (TOWN[0] - r) * k; g += (TOWN[1] - g) * k; b += (TOWN[2] - b) * k;
    }
    out[0] = r; out[1] = g; out[2] = b;
  }

  private build(key: number, step: number) {
    const T = this.T;
    const ci = key % CHUNKS, cj = (key / CHUNKS) | 0;
    const V = CHUNK / step + 1;
    const nv = V * V + (V - 1) * 4;
    const pos = new Float32Array(nv * 3);
    const nor = new Float32Array(nv * 3);
    const col = new Float32Array(nv * 3);
    const S = N + 1;
    const H = T.h;
    const i0 = ci * CHUNK, j0 = cj * CHUNK;
    const c3 = [0, 0, 0];
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
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
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
    if (this.hasWater[key]) cm.water = this.buildWater(ci, cj, step);
    this.group.add(mesh);
    if (cm.water) this.group.add(cm.water);
    this.chunks.set(key, cm);
  }

  private buildWater(ci: number, cj: number, step: number) {
    const V = Math.max(3, 16 / step + 1);
    const pos: number[] = [], col: number[] = [], idx: number[] = [];
    for (let j = 0; j < V; j++) for (let i = 0; i < V; i++) {
      const x = (i / (V - 1)) * CHUNK_M, z = (j / (V - 1)) * CHUNK_M;
      pos.push(x, SEA, z);
      const wx = ci * CHUNK_M + x, wz = cj * CHUNK_M + z;
      const c = lin(this.T.regionAt(wx, wz).water);
      const depth = SEA - this.T.heightAt(wx, wz);
      col.push(c[0], c[1], c[2], clamp01(0.35 + depth * 0.25));
    }
    for (let j = 0; j < V - 1; j++) for (let i = 0; i < V - 1; i++) {
      const a = j * V + i, b = a + 1, c = a + V, d = c + 1;
      idx.push(a, d, b, a, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
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
