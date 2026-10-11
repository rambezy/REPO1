// Close-up ground cover: dense grass tufts, dry twigs, pebbles, stones and
// shards in the look of each region, around the camera only. It is pure
// decoration (nothing blocks, nothing is clicked), placed by hashing its own
// coordinates so it takes nothing from the world's random streams. Tiles are
// built a few at a time and cached; every kind is one instanced mesh for the
// whole ring of tiles, so it costs a handful of draw calls. It thins out with
// the quality setting and the draw distance, and is off on low quality.
// Nothing grows inside buildings, building sites, fields, walls or towers; in
// towns dry tufts, stones and litter gather along their feet instead. A tile
// is rebuilt when what stands on it changes.
import * as THREE from 'three';
import { Terrain } from '../world/terrain';
import { REGIONS } from '../world/regions';
import { SEA } from '../world/consts';
import { hash3 } from '../core/rng';
import { Noise2 } from '../core/noise';
import { geoRand } from './geo';
import { KitBuilder } from './kit';
import { SURF, surfaceMaterial } from './surface';
import { G } from '../state';
import { on } from '../core/events';
import type { WObj } from '../sim/objects';

const TILE = 32;
const STEP = 1.45; // candidate spacing, m

type Maker = (b: KitBuilder, r: () => number) => void;
const MAKERS: Record<string, Maker> = {
  tuft(b, r) {
    b.S(SURF.grass);
    for (let i = 0; i < 6; i++) {
      const a = r() * 6.28, d = r() * 0.16;
      b.push().translate(Math.cos(a) * d, 0, Math.sin(a) * d).rotateY(r() * 3.14);
      b.blade(0.07 + r() * 0.05, 0.32 + r() * 0.3, (r() - 0.5) * 0.3, { color: [0xffffff, 0xe8e8e0, 0xfffff0][i % 3] });
      b.pop();
    }
  },
  tall(b, r) {
    b.S(SURF.grass);
    for (let i = 0; i < 7; i++) {
      const a = r() * 6.28, d = r() * 0.22;
      b.push().translate(Math.cos(a) * d, 0, Math.sin(a) * d).rotateY(r() * 3.14);
      b.blade(0.05 + r() * 0.03, 0.7 + r() * 0.6, (r() - 0.5) * 0.35, { color: [0xffffff, 0xe8e8e0][i % 2] });
      b.pop();
    }
  },
  flower(b, r) {
    b.S(SURF.grass);
    for (let i = 0; i < 4; i++) {
      b.push().rotateY(r() * 3.14);
      b.blade(0.06, 0.3 + r() * 0.15, (r() - 0.5) * 0.3, { color: 0x6f8a42 });
      b.pop();
    }
    b.S(SURF.plain);
    const pc = [0xe8d060, 0xd87a9a, 0xf0ece0, 0xa880d8, 0xe89a40][Math.floor(r() * 5)];
    for (let i = 0; i < 3; i++) { const a = r() * 6.28, d = r() * 0.12; b.push().translate(Math.cos(a) * d, 0.32 + r() * 0.12, Math.sin(a) * d).octa(0.045, { color: pc }).pop(); }
  },
  twigs(b, r) {
    b.S(SURF.bark);
    for (let i = 0; i < 7; i++) {
      b.push().rotateY(r() * 6.28).rotateZ((r() - 0.5) * 0.9);
      b.blade(0.03, 0.4 + r() * 0.45, (r() - 0.5) * 0.4, { color: [0xd0c8c0, 0xb0a8a0][i % 2] });
      b.pop();
    }
  },
  pebbles(b, r) {
    b.S(SURF.rock);
    const n = 3 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = r() * 0.35;
      b.push().translate(Math.cos(a) * d, 0.02, Math.sin(a) * d).rotateY(r() * 3).scale(1, 0.55, 1).octa(0.05 + r() * 0.07, { color: [0xf0f0f0, 0xd8d8d8, 0xffffff][i % 3] }).pop();
    }
  },
  stone(b, r) {
    b.S(SURF.rock).push().translate(0, 0.06, 0).rotateY(r() * 3).scale(1, 0.55 + r() * 0.2, 0.8 + r() * 0.3).ico(0.2 + r() * 0.12, 0, { color: 0xffffff, grad: 0.3 }).pop();
  },
  shard(b, r) {
    b.S(SURF.glass);
    for (let i = 0; i < 3; i++) b.push().translate((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3).rotateZ((r() - 0.5) * 0.7).rotateX((r() - 0.5) * 0.7).translate(0, 0.08, 0).scale(0.06, 0.12 + r() * 0.14, 0.06).octa(1, { color: [0xffffff, 0xe0e0e0][i % 2] }).pop();
  },
  bone(b, r) {
    b.S(SURF.bone);
    b.push().translate(0, 0.04, 0).rotateY(r() * 3).limb(-0.3, 0, 0, 0.3, 0.05, 0, 0.04, 0.035, 4, { color: 0xe0d6c0 }).pop();
    if (r() < 0.6) b.push().translate(0.1, 0.03, 0.12).rotateY(r() * 3).limb(-0.15, 0, 0, 0.15, 0, 0, 0.03, 0.03, 4, { color: 0xd8ccb0 }).pop();
  },
  scrap(b, r) {
    b.S(SURF.metal);
    for (let i = 0; i < 2; i++) b.push().translate((r() - 0.5) * 0.4, 0.03, (r() - 0.5) * 0.4).rotateY(r() * 3).rotateZ((r() - 0.5) * 0.3).box(0.3 + r() * 0.3, 0.025, 0.12 + r() * 0.15, { color: [0x8a6a50, 0x6a6a68][i] }).pop();
  },
  pad(b, r) {
    b.S(SURF.leaf);
    for (let i = 0; i < 2 + Math.floor(r() * 2); i++) b.push().translate((r() - 0.5) * 0.7, 0, (r() - 0.5) * 0.7).cyl(0.18 + r() * 0.12, 0.18, 0.012, 7, { color: [0x5a7a3a, 0x4e6a34][i % 2] }).pop();
  },
  cap(b, r) {
    b.S(SURF.bone).cyl(0.025, 0.035, 0.16, 4, { color: 0xd8d0b8 });
    b.S(SURF.plain).push().translate(0, 0.16, 0).scale(1, 0.5, 1).ico(0.09, 0, { color: 0xffffff }).pop();
  },
  // the litter of a town: offcuts, a rag, an empty bottle
  litter(b, r) {
    b.S(SURF.plank);
    for (let i = 0; i < 2; i++) b.push().translate((r() - 0.5) * 0.5, 0.02, (r() - 0.5) * 0.5).rotateY(r() * 3).box(0.25 + r() * 0.3, 0.03, 0.06 + r() * 0.05, { color: [0x7a6448, 0x5e4c38][i] }).pop();
    b.S(SURF.cloth).push().translate((r() - 0.5) * 0.4, 0.012, (r() - 0.5) * 0.4).rotateY(r() * 3).box(0.22, 0.015, 0.16, { color: 0x8a7a5a }).pop();
    if (r() < 0.6) b.S(SURF.glass).push().translate((r() - 0.5) * 0.4, 0.04, (r() - 0.5) * 0.4).rotateY(r() * 3).rotateZ(1.5).cyl(0.035, 0.04, 0.2, 5, { color: 0x3a5a3a }).pop();
  },
};
const VARIANTS = 2;
const SWAY = new Set(['tuft', 'tall', 'flower', 'twigs']);

/** Per region: kind, density per 100 m², colour (-1: the region's rock), clumping 0..1. */
type Spec = [string, number, number, number];
const ROCK = -1;
const COVER: Record<string, Spec[]> = {
  flats: [['tuft', 4.5, 0xc8b47a, 0.6], ['twigs', 0.5, 0x7a6450, 0.4], ['pebbles', 2.5, ROCK, 0.3], ['stone', 0.6, ROCK, 0.2]],
  salt: [['shard', 2.2, 0xf0eee8, 0.7], ['pebbles', 1.5, 0xd8d4c8, 0.3], ['tuft', 0.4, 0xc8b88a, 0.8]],
  vale: [['tuft', 11, 0x98b45a, 0.4], ['tall', 1.2, 0x86a24e, 0.7], ['flower', 1.6, 0xffffff, 0.8], ['pebbles', 0.5, ROCK, 0.2]],
  coast: [['tuft', 5, 0xa0aa84, 0.7], ['pebbles', 4, 0xb8b4a8, 0.3], ['stone', 1, ROCK, 0.3]],
  ember: [['tuft', 6, 0xc8b47a, 0.5], ['tuft', 1.5, 0xa0b060, 0.6], ['twigs', 0.4, 0x7a6450, 0.3], ['pebbles', 1.5, ROCK, 0.3]],
  highlands: [['tuft', 6, 0xc87a50, 0.6], ['pebbles', 3, ROCK, 0.3], ['stone', 1, ROCK, 0.3]],
  thrumwood: [['tuft', 8, 0xa4a052, 0.5], ['tall', 1, 0x908e4a, 0.6], ['cap', 1.2, 0xc86a3a, 0.8], ['pebbles', 0.6, ROCK, 0.2]],
  mire: [['tuft', 7, 0x7e9050, 0.5], ['tall', 3, 0x7e884a, 0.8], ['pad', 2.5, 0xffffff, 0.7], ['cap', 0.4, 0x9a6ab0, 0.8]],
  ash: [['tuft', 3, 0x8e8a84, 0.7], ['pebbles', 2.5, 0x3a3634, 0.4], ['twigs', 0.6, 0x3a3230, 0.5], ['stone', 0.5, ROCK, 0.3]],
  bonesea: [['tuft', 1.2, 0xd8b880, 0.8], ['bone', 0.5, 0xffffff, 0.6], ['pebbles', 1.5, ROCK, 0.3]],
  rust: [['tuft', 2.2, 0xbca06a, 0.7], ['scrap', 1.1, 0xffffff, 0.6], ['pebbles', 2, ROCK, 0.3]],
  glass: [['shard', 2.2, 0x4a7a6a, 0.6], ['tuft', 0.9, 0x6a6660, 0.8], ['pebbles', 1.4, ROCK, 0.3]],
};
/** The share of each kind kept beyond the near ring (the rest shrink away before it). */
const KEEP: Record<string, number> = { tuft: 0.4, tall: 0.5, flower: 0.45, twigs: 0.45 };
const WET = new Set(['pad']);
const SHORE = new Set(['tall']);
const STONY = new Set(['pebbles', 'stone', 'shard', 'scrap', 'bone']);

/**
 * Per kind: the instances kept far away come first (`far` of them), then the
 * near-only ones. `sig` names what stood on the tile when it was built.
 */
interface Tile { counts: number[]; far: number[]; mats: Float32Array[]; cols: Float32Array[]; sig: string; }
/** The footprint of something standing on the ground: centre, the cosine and sine of its turn, half sizes. */
interface Foot { x: number; z: number; c: number; s: number; hw: number; hd: number; }
/** Dry straw, for what grows along town walls. */
const DRY = new THREE.Color(0xb8a87a);

/**
 * Footprints of what stands on the ground within r of (x, z): buildings,
 * building sites, fields, walls, towers and wells. `sig` names the set, so a
 * cached piece of ground knows when what stands on it has changed.
 */
export function footprints(x: number, z: number, r: number): { feet: Foot[]; sig: string } {
  const W = G.W;
  const feet: Foot[] = [];
  let sig = '';
  if (!W) return { feet, sig };
  W.objHash.near(x, z, r, (o: WObj) => {
    const f = footOf(o);
    if (!f) return;
    const [hw, hd] = f;
    feet.push({ x: o.x, z: o.z, c: Math.cos(o.rot), s: Math.sin(o.rot), hw, hd });
    sig += o.id + ':' + Math.round(o.x * 10) + ',' + Math.round(o.z * 10) + ',' + Math.round(hw * 10) + ';';
  });
  return { feet, sig };
}
/** Half sizes of an object's footprint, if it is something that stands on the ground (see footprints). */
function footOf(o: WObj): [number, number] | null {
  const d = o.data;
  if (!d) return null;
  let hw = 0, hd = 0;
  if (o.kind === 'building' || o.kind === 'site' || o.kind === 'farm') { hw = d.w / 2; hd = d.d / 2; }
  else if (o.kind === 'wall') { hw = (d.thick ?? 0.4) / 2; hd = (d.len ?? 0) / 2; }
  else if (o.kind === 'tower') hw = hd = d.r ?? 2;
  else if (o.kind === 'well') hw = hd = 1.3;
  return hw > 0 && hd > 0 ? [hw, hd] : null;
}

/**
 * Watches what stands on the ground. `changes()` gives the places (centre and
 * reach) where something was built, moved or pulled down since it was last
 * called, or 'all' for a new world.
 */
export class FeetWatch {
  private known = new Map<number, string>();
  private world: unknown = null;
  changes(): { x: number; z: number; r: number }[] | 'all' {
    const W = G.W;
    if (W !== this.world) {
      // (the first world is only noted: what was built from it so far is right)
      const first = this.world === null;
      this.world = W;
      this.known.clear();
      if (W) for (const o of W.objs.values()) { const f = footOf(o); if (f) this.known.set(o.id, o.x.toFixed(1) + ',' + o.z.toFixed(1) + ',' + f[0] + ',' + f[1]); }
      return first ? [] : 'all';
    }
    if (!W) return [];
    const out: { x: number; z: number; r: number }[] = [];
    const seen = new Set<number>();
    for (const o of W.objs.values()) {
      const f = footOf(o);
      if (!f) continue;
      seen.add(o.id);
      const key = o.x.toFixed(1) + ',' + o.z.toFixed(1) + ',' + f[0] + ',' + f[1];
      if (this.known.get(o.id) !== key) {
        const was = this.known.get(o.id);
        if (was) { const [x, z, hw, hd] = was.split(',').map(Number); out.push({ x, z, r: Math.hypot(hw, hd) + 1 }); }
        this.known.set(o.id, key);
        out.push({ x: o.x, z: o.z, r: Math.hypot(f[0], f[1]) + 1 });
      }
    }
    for (const [id, was] of this.known) if (!seen.has(id)) {
      const [x, z, hw, hd] = was.split(',').map(Number);
      out.push({ x, z, r: Math.hypot(hw, hd) + 1 });
      this.known.delete(id);
    }
    return out;
  }
}

/** Whether (x, z) lies within `pad` of any of the footprints. */
export function insideFeet(feet: Foot[], x: number, z: number, pad: number) {
  for (const f of feet) {
    const dx = x - f.x, dz = z - f.z;
    if (Math.abs(dx * f.c - dz * f.s) <= f.hw + pad && Math.abs(dx * f.s + dz * f.c) <= f.hd + pad) return true;
  }
  return false;
}

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();

export class GroundCover {
  group = new THREE.Group();
  /** one per kind and variant */
  private kinds: string[] = [];
  private meshes: THREE.InstancedMesh[] = [];
  private caps: number[] = [];
  private tiles = new Map<number, Tile>();
  private shown = '';
  private clump: Noise2;
  private uR = { value: 130 };
  private uR1 = { value: 60 };
  radius = 0;
  /** the camera tile, radius and quality last shown with every tile built: nothing to do until one changes */
  private settledAt = NaN;
  private quality = '';
  /** whether what stands on the ground may have changed, and where it did */
  private nObjs = -1;
  private objsChanged = false;
  private recheckAt = 0;
  private watch = new FeetWatch();
  /** cached tiles whose footprints changed: rebuilt (and shown as they were until then) */
  private stale = new Set<number>();

  constructor(public T: Terrain, wind: { value: number }, windS: { value: number }) {
    this.clump = new Noise2(T.seed + 4321);
    on('objs', () => { this.objsChanged = true; });
    const fade = (sh: THREE.WebGLProgramParametersWithUniforms, sway: boolean) => {
      sh.uniforms.uCoverR = this.uR;
      sh.uniforms.uCoverR1 = this.uR1;
      sh.uniforms.uWind = wind;
      sh.uniforms.uWindS = windS;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uCoverR;\nuniform float uCoverR1;\nuniform float uWind;\nuniform float uWindS;')
        // near-only instances carry a negative red tint: take the sign off the colour
        .replace('#include <color_vertex>', `#include <color_vertex>
          #ifdef USE_INSTANCING_COLOR
            vColor.r = abs(vColor.r);
          #endif`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          {
            vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
            float cd = length(ip.xz - cameraPosition.xz);
            // shrink away toward the edge of the ring rather than pop; most go before the near ring's edge
            transformed *= 1.0 - smoothstep(uCoverR * 0.62, uCoverR, cd);
            #ifdef USE_INSTANCING_COLOR
              if (instanceColor.r < 0.0) transformed *= 1.0 - smoothstep(uCoverR1 * 0.55, uCoverR1, cd);
            #endif
            ${sway ? `float sw = max(0.0, transformed.y) * 0.09 * uWindS;
            transformed.x += sin(uWind * 1.9 + ip.x * 0.37 + ip.z * 0.21) * sw;
            transformed.z += cos(uWind * 1.4 + ip.z * 0.29) * sw * 0.6;` : ''}
          }`);
    };
    // (small things: the middle-distance surfaces are detail enough, and cheaper)
    const swayMat = surfaceMaterial({ side: THREE.DoubleSide, key: 'coverS', mid: true, patch: (sh) => fade(sh, true) });
    const stillMat = surfaceMaterial({ key: 'coverT', mid: true, patch: (sh) => fade(sh, false) });
    for (const k of Object.keys(MAKERS)) for (let v = 0; v < VARIANTS; v++) {
      const b = new KitBuilder();
      MAKERS[k](b, geoRand(5000 + v * 131 + k.length * 17));
      const geo = b.build();
      const mesh = new THREE.InstancedMesh(geo, SWAY.has(k) ? swayMat : stillMat, 256);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(256 * 3), 3);
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      this.kinds.push(k);
      this.meshes.push(mesh);
      this.caps.push(256);
      this.group.add(mesh);
    }
  }

  /** Builds missing tiles near the camera within the budget, and shows the ring of them. */
  update(cam: THREE.Vector3, budgetMs = 2, distMul = 1) {
    const q = G.R?.level ?? 'high';
    const dm = Math.min(1.5, Math.max(0.5, distMul));
    const R = q === 'low' ? 0 : (q === 'high' ? 115 : 85) * dm;
    // within R1 everything shows; beyond it only a share of each kind (see KEEP)
    const R1 = (q === 'high' ? 55 : 40) * dm;
    this.radius = R;
    // the cover only matters near the ground: none when the camera is high up
    if (!R || cam.y - Math.max(0, this.T.heightAt(cam.x, cam.z)) > 260) {
      if (this.shown) { for (const m of this.meshes) m.count = 0; this.shown = ''; this.settledAt = NaN; }
      // (nothing to draw: not even the empty meshes)
      this.group.visible = false;
      return;
    }
    this.group.visible = true;
    this.uR.value = R;
    this.uR1.value = R1;
    if (q !== this.quality) { this.quality = q; this.tiles.clear(); this.stale.clear(); this.shown = ''; }
    // a new world (a game loaded) starts afresh; when things are built or pulled down, the tiles they stand on are rebuilt
    const nObjs = G.W ? G.W.objs.size : 0;
    if (nObjs !== this.nObjs || this.objsChanged) {
      if (!this.recheckAt) this.recheckAt = performance.now() + 400;
      this.nObjs = nObjs;
      this.objsChanged = false;
    }
    if (this.recheckAt && performance.now() > this.recheckAt) {
      this.recheckAt = 0;
      const ch = this.watch.changes();
      if (ch === 'all') { this.tiles.clear(); this.stale.clear(); this.shown = ''; }
      else for (const c of ch) {
        for (let tj = Math.floor((c.z - c.r) / TILE); tj <= Math.floor((c.z + c.r) / TILE); tj++) for (let ti = Math.floor((c.x - c.r) / TILE); ti <= Math.floor((c.x + c.r) / TILE); ti++) {
          const k = tj * 1024 + ti;
          if (this.tiles.has(k)) this.stale.add(k);
        }
      }
      this.settledAt = NaN;
    }
    const cti = Math.floor(cam.x / TILE), ctj = Math.floor(cam.z / TILE);
    const here = cti * 4096 + ctj + R * 1e-3 + (q === 'high' ? 0.5 : 0);
    if (here === this.settledAt) return;
    const t0 = performance.now();
    const dens = q === 'high' ? 1 : 0.6;
    const ti0 = Math.floor((cam.x - R) / TILE), ti1 = Math.floor((cam.x + R) / TILE);
    const tj0 = Math.floor((cam.z - R) / TILE), tj1 = Math.floor((cam.z + R) / TILE);
    const want: number[] = [];
    const todo: [number, number][] = [];
    for (let tj = tj0; tj <= tj1; tj++) for (let ti = ti0; ti <= ti1; ti++) {
      const dx = Math.max(0, Math.abs(cam.x - (ti + 0.5) * TILE) - TILE / 2), dz = Math.max(0, Math.abs(cam.z - (tj + 0.5) * TILE) - TILE / 2);
      const d = Math.hypot(dx, dz);
      if (d > R) continue;
      const k = tj * 1024 + ti;
      if (this.tiles.has(k)) { want.push(k); if (this.stale.has(k)) todo.push([k, d]); } else todo.push([k, d]);
    }
    todo.sort((a, b) => a[1] - b[1]);
    let built = 0;
    for (const [k] of todo) {
      if (performance.now() - t0 > budgetMs) break;
      const had = this.tiles.has(k);
      this.tiles.set(k, this.buildTile(k % 1024, Math.floor(k / 1024), dens));
      this.stale.delete(k);
      if (had) this.shown = ''; else want.push(k);
      built++;
    }
    this.settledAt = built === todo.length ? here : NaN;
    // forget tiles far behind
    if (this.tiles.size > want.length * 2 + 64) {
      const keep = new Set(want);
      for (const k of this.tiles.keys()) if (!keep.has(k)) { this.tiles.delete(k); this.stale.delete(k); }
    }
    want.sort((a, b) => a - b);
    const sig = want.join(',') + q + R1 + ':' + cti + ',' + ctj;
    if (sig === this.shown) return;
    this.shown = sig;
    // a tile is near while any of it may come within R1 of the camera (anywhere in the camera's tile):
    // only there do the near-only instances show at all
    const near = want.map((k) => {
      const dx = Math.max(0, Math.abs((k % 1024) - cti) - 1) * TILE, dz = Math.max(0, Math.abs(Math.floor(k / 1024) - ctj) - 1) * TILE;
      return Math.hypot(dx, dz) < R1;
    });
    // gather the ring's instances into each kind's mesh
    for (let kv = 0; kv < this.meshes.length; kv++) {
      let total = 0;
      for (let w = 0; w < want.length; w++) { const t = this.tiles.get(want[w])!; total += near[w] ? t.counts[kv] : t.far[kv]; }
      let mesh = this.meshes[kv];
      if (total > this.caps[kv]) {
        let cap = this.caps[kv];
        while (cap < total) cap *= 2;
        const nm = new THREE.InstancedMesh(mesh.geometry, mesh.material, cap);
        nm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        nm.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        nm.instanceColor.setUsage(THREE.DynamicDrawUsage);
        nm.frustumCulled = false;
        nm.receiveShadow = true;
        this.group.remove(mesh);
        mesh.dispose();
        this.group.add(nm);
        this.meshes[kv] = mesh = nm;
        this.caps[kv] = cap;
      }
      const ma = mesh.instanceMatrix.array as Float32Array, ca = mesh.instanceColor!.array as Float32Array;
      let o = 0;
      for (let w = 0; w < want.length; w++) {
        const t = this.tiles.get(want[w])!;
        const n = near[w] ? t.counts[kv] : t.far[kv];
        if (!n) continue;
        ma.set(n === t.counts[kv] ? t.mats[kv] : t.mats[kv].subarray(0, n * 16), o * 16);
        ca.set(n === t.counts[kv] ? t.cols[kv] : t.cols[kv].subarray(0, n * 3), o * 3);
        o += n;
      }
      mesh.count = total;
      mesh.visible = total > 0;
      mesh.instanceMatrix.clearUpdateRanges();
      mesh.instanceMatrix.addUpdateRange(0, total * 16);
      mesh.instanceMatrix.needsUpdate = true;
      mesh.instanceColor!.clearUpdateRanges();
      mesh.instanceColor!.addUpdateRange(0, total * 3);
      mesh.instanceColor!.needsUpdate = true;
    }
  }

  /** What stands on a tile (or near enough to reach into it), and a name for that set. */
  private feet(ti: number, tj: number) {
    return footprints((ti + 0.5) * TILE, (tj + 0.5) * TILE, TILE * 0.71 + 26);
  }

  private buildTile(ti: number, tj: number, dens: number): Tile {
    const T = this.T;
    const nk = this.meshes.length;
    const { feet, sig } = this.feet(ti, tj);
    const litterK = this.kinds.indexOf('litter');
    // per kind: instances kept far away, and near-only ones
    const lists: number[][] = Array.from({ length: nk }, () => []);
    const cl: number[][] = Array.from({ length: nk }, () => []);
    const listsN: number[][] = Array.from({ length: nk }, () => []);
    const clN: number[][] = Array.from({ length: nk }, () => []);
    const n = Math.floor(TILE / STEP);
    const area = STEP * STEP / 100;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gx = ti * n + i, gz = tj * n + j;
      const h0 = hash3(gx, gz, 9173);
      const x = ti * TILE + (i + (h0 & 255) / 256) * STEP, z = tj * TILE + (j + ((h0 >>> 8) & 255) / 256) * STEP;
      if (T.roadAt(x, z) > 40) continue;
      // nothing grows inside what stands on the ground; how far outside the nearest thing this is
      let inside = false, edge = 99;
      for (const f of feet) {
        const dx = x - f.x, dz = z - f.z;
        const lx = Math.abs(dx * f.c - dz * f.s) - f.hw, lz = Math.abs(dx * f.s + dz * f.c) - f.hd;
        if (lx <= 0.3 && lz <= 0.3) { inside = true; break; }
        const e = Math.hypot(Math.max(lx, 0), Math.max(lz, 0));
        if (e < edge) edge = e;
      }
      if (inside) continue;
      const reg = REGIONS[T.regionIdAt(x, z)];
      const list = COVER[reg.key];
      if (!list) continue;
      const h = T.heightAt(x, z);
      const site = T.siteAt(x, z, 8);
      const town = site && site.kind === 'town' ? Math.hypot(x - site.x, z - site.z) / site.r : 2;
      // along the feet of walls and buildings, out of the way of feet and wheels
      const foot = edge < 1.7 ? 1 : 0;
      let r = ((h0 >>> 16) & 0xffff) / 65536;
      let placed = false;
      for (let s = 0; s < list.length; s++) {
        const [kind, d, col, clump] = list[s];
        let p = d * area * dens;
        if (clump) p *= 1 - clump + clump * 2.2 * Math.max(0, this.clump.n(x / 19 + s * 7.3, z / 19 - s * 3.1) * 0.5 + 0.5);
        // inside settlements the ground is trodden bare: loose stones, and dry tufts only along the feet of things
        if (town < 1) p *= STONY.has(kind) ? 0.35 + 1.4 * foot : kind === 'tuft' || kind === 'twigs' ? (foot ? 1.4 : town < 0.85 ? 0 : 0.3) : town < 0.85 ? 0 : 0.3;
        if (r < p) {
          if (WET.has(kind) ? h > SEA - 0.15 || h < SEA - 1.4 : SHORE.has(kind) ? h < SEA - 0.4 : h < SEA + 0.12) break;
          if (T.slopeAt(x, z) > (STONY.has(kind) ? 1.2 : 0.75)) break;
          const h2 = hash3(gx, gz, 311 + s);
          const v = h2 & 1;
          const kv = this.kinds.indexOf(kind) + v;
          const sc = (STONY.has(kind) ? 0.7 : 0.75) + ((h2 >>> 4) & 255) / 255 * 0.65;
          tmpE.set(((h2 >>> 12) & 15) / 15 * 0.12 - 0.06, ((h2 >>> 16) & 1023) / 163, ((h2 >>> 26) & 15) / 15 * 0.12 - 0.06);
          tmpQ.setFromEuler(tmpE);
          tmpM.compose(tmpP.set(x, WET.has(kind) ? SEA + 0.03 : h - 0.03, z), tmpQ, tmpS.set(sc, sc, sc));
          const nearOnly = hash3(gx, gz, 577 + s) / 4294967296 >= (KEEP[kind] ?? 0.6);
          const l = nearOnly ? listsN[kv] : lists[kv];
          for (let e = 0; e < 16; e++) l.push(tmpM.elements[e]);
          const vary = 0.82 + ((h2 >>> 20) & 63) / 63 * 0.32;
          if (col === ROCK) tmpC.setHex(reg.rock).multiplyScalar(vary * 1.1);
          else tmpC.setHex(col).multiplyScalar(vary);
          // what grows in a town is dry
          if (town < 1 && !STONY.has(kind)) tmpC.lerp(DRY, 0.6);
          placed = true;
          // (the sign of red marks the near-only ones for the shader)
          (nearOnly ? clN : cl)[kv].push(nearOnly ? -Math.max(tmpC.r, 0.002) : tmpC.r, tmpC.g, tmpC.b);
          break;
        }
        r -= p;
        if (r < 0) break;
      }
      // litter in the yards of a town, most of it blown against walls
      if (!placed && town < 1 && edge < 5 && litterK >= 0) {
        const h3 = hash3(gx, gz, 4242);
        if ((h3 & 0xffff) / 65536 < (foot ? 0.1 : 0.025) * dens && T.slopeAt(x, z) < 0.6) {
          const kv = litterK + ((h3 >>> 16) & 1);
          tmpE.set(0, ((h3 >>> 17) & 1023) / 163, 0);
          tmpQ.setFromEuler(tmpE);
          tmpM.compose(tmpP.set(x, h - 0.02, z), tmpQ, tmpS.set(1, 1, 1));
          for (let e = 0; e < 16; e++) lists[kv].push(tmpM.elements[e]);
          cl[kv].push(0.9, 0.88, 0.84);
        }
      }
    }
    return {
      counts: lists.map((l, k) => (l.length + listsN[k].length) / 16),
      far: lists.map((l) => l.length / 16),
      mats: lists.map((l, k) => new Float32Array(l.concat(listsN[k]))),
      cols: cl.map((c, k) => new Float32Array(c.concat(clN[k]))),
      sig,
    };
  }
}
