// The generated land: heights, regions, water, roads and the sites on it.
// Height queries match the rendered triangles exactly so feet meet ground.
import { CELL, N, WORLD, SEA } from './consts';
import { REGIONS, RegionDef } from './regions';
import type { POIKind } from '../content/layout';

export interface Road {
  a: string;
  b: string;
  pts: number[]; // x0,z0,x1,z1... every ~6 m
  len: number;
}

export interface Site {
  id: number;
  key: string;
  name: string;
  kind: 'town' | POIKind;
  x: number;
  z: number;
  r: number;
  y: number; // ground height at centre after flattening
  region: number;
  faction?: string;
  settlement?: string; // settlement key for towns
  landmark?: boolean;
  seed: number;
  discovered?: boolean;
}

export interface OreNode {
  id: number;
  kind: 'iron' | 'copper' | 'stone';
  x: number;
  z: number;
  y: number;
  rot: number;
  size: number;
}

export class Terrain {
  readonly S = N + 1; // samples per side
  h: Float32Array;
  reg: Uint8Array; // dominant region per sample
  road: Uint8Array; // 0..255 closeness to a road, per sample
  roads: Road[] = [];
  sites: Site[] = [];
  ores: OreNode[] = [];
  constructor(public seed: number) {
    this.h = new Float32Array(this.S * this.S);
    this.reg = new Uint8Array(this.S * this.S);
    this.road = new Uint8Array(this.S * this.S);
  }
  inBounds(x: number, z: number, margin = 0) {
    return x >= margin && z >= margin && x <= WORLD - margin && z <= WORLD - margin;
  }
  /** Height of the ground surface (not water) at world position. */
  heightAt(x: number, z: number): number {
    const S = this.S;
    let fx = x / CELL, fz = z / CELL;
    if (fx < 0) fx = 0; else if (fx > N - 0.0001) fx = N - 0.0001;
    if (fz < 0) fz = 0; else if (fz > N - 0.0001) fz = N - 0.0001;
    const i = fx | 0, j = fz | 0;
    const tx = fx - i, tz = fz - j;
    const k = j * S + i;
    const h = this.h;
    const h00 = h[k], h10 = h[k + 1], h01 = h[k + S], h11 = h[k + S + 1];
    if (tx > tz) return h00 + (h10 - h00) * tx + (h11 - h10) * tz;
    return h00 + (h11 - h01) * tx + (h01 - h00) * tz;
  }
  sample(i: number, j: number) {
    if (i < 0) i = 0; else if (i > N) i = N;
    if (j < 0) j = 0; else if (j > N) j = N;
    return this.h[j * this.S + i];
  }
  /** Smooth normal from central differences. */
  normalAt(x: number, z: number, out: { x: number; y: number; z: number }) {
    const e = CELL;
    const hl = this.heightAt(x - e, z), hr = this.heightAt(x + e, z);
    const hd = this.heightAt(x, z - e), hu = this.heightAt(x, z + e);
    let nx = hl - hr, ny = 2 * e, nz = hd - hu;
    const l = Math.hypot(nx, ny, nz);
    out.x = nx / l; out.y = ny / l; out.z = nz / l;
    return out;
  }
  /** Slope as rise over run, from the steepest neighbouring difference. */
  slopeAt(x: number, z: number) {
    const e = 2;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }
  depthAt(x: number, z: number) { return SEA - this.heightAt(x, z); }
  isWater(x: number, z: number) { return this.heightAt(x, z) < SEA; }
  regionIdAt(x: number, z: number) {
    const i = Math.round(x / CELL), j = Math.round(z / CELL);
    if (!(i >= 0 && j >= 0 && i <= N && j <= N)) return 0; // also catches NaN
    return this.reg[j * this.S + i];
  }
  roadAt(x: number, z: number) {
    const i = Math.round(x / CELL), j = Math.round(z / CELL);
    if (i < 0 || j < 0 || i > N || j > N) return 0;
    return this.road[j * this.S + i];
  }
  regionAt(x: number, z: number): RegionDef { return REGIONS[this.regionIdAt(x, z)]; }
  private siteGrid: Map<number, Site[]> | null = null;
  /** Rebuilds the spatial index after sites change. */
  indexSites() {
    const g = new Map<number, Site[]>();
    const B = 512;
    for (const s of this.sites) {
      const pad = s.r + 60;
      for (let j = Math.floor((s.z - pad) / B); j <= Math.floor((s.z + pad) / B); j++)
        for (let i = Math.floor((s.x - pad) / B); i <= Math.floor((s.x + pad) / B); i++) {
          const k = j * 64 + i;
          let l = g.get(k);
          if (!l) g.set(k, (l = []));
          l.push(s);
        }
    }
    this.siteGrid = g;
  }
  siteAt(x: number, z: number, pad = 0): Site | null {
    if (!this.siteGrid) this.indexSites();
    const list = this.siteGrid!.get(Math.floor(z / 512) * 64 + Math.floor(x / 512));
    if (!list) return null;
    let best: Site | null = null, bd = Infinity;
    for (const s of list) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < s.r + pad && d < bd) { bd = d; best = s; }
    }
    return best;
  }
  nearestSite(x: number, z: number, filter?: (s: Site) => boolean) {
    let best: Site | null = null, bd = Infinity;
    for (const s of this.sites) {
      if (filter && !filter(s)) continue;
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
}
