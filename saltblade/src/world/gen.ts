// World generation: a fixed macro layout (regions, mountains, the river,
// settlements) dressed with seeded noise, then roads routed between towns and
// lesser sites scattered over the land.
import { Noise2 } from '../core/noise';
import { RNG, hash3 } from '../core/rng';
import { clamp, clamp01, smoothstep, smooth, lerp } from '../core/math';
import { CELL, N, WORLD, SEA } from './consts';
import { REGIONS, MOUNTAIN_PAIRS, PASSES, RIVER, FORDS, LAKES, REGION_BY_KEY } from './regions';
import { SETTLEMENTS, ROADS, LANDMARKS, POIKind } from '../content/layout';
import { Terrain, Site } from './terrain';
import { GridAStar } from './astar';

export type Progress = (stage: string, frac: number) => void;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

const R = REGIONS.length;
const BLEND = 190;

/** Warped, weighted Voronoi over region seeds: which regions a point belongs
 *  to and how strongly. Shared by generation and terrain colouring. */
export class RegionField {
  private sx: Float32Array;
  private sz: Float32Array;
  private sinv: Float32Array;
  private sreg: Uint8Array;
  private dist = new Float32Array(R);
  private warp: Noise2;
  // results of the last eval
  r1 = 0; r2 = 0; r3 = 0;
  w1 = 1; w2 = 0; w3 = 0;
  d1 = 0; d2 = 0;
  constructor(seed: number) {
    this.warp = new Noise2(seed ^ 0x51ed);
    const all: [number, number, number, number][] = [];
    for (const r of REGIONS) for (const s of r.seeds) all.push([s[0] * WORLD, s[1] * WORLD, 1 / s[2], r.id]);
    this.sx = new Float32Array(all.map((a) => a[0]));
    this.sz = new Float32Array(all.map((a) => a[1]));
    this.sinv = new Float32Array(all.map((a) => a[2]));
    this.sreg = new Uint8Array(all.map((a) => a[3]));
  }
  eval(x: number, z: number) {
    const n = this.warp;
    const wx = x + 820 * n.fbm(x / 3200, z / 3200, 3) + 240 * n.fbm(x / 900 + 5.3, z / 900, 2) + 50 * n.n(x / 230, z / 230);
    const wz = z + 820 * n.fbm(x / 3200 + 31.7, z / 3200 - 11.3, 3) + 240 * n.fbm(x / 900 - 7.7, z / 900 + 3.1, 2) + 50 * n.n(x / 230 + 9.1, z / 230 + 4.4);
    const dist = this.dist;
    dist.fill(1e9);
    const sx = this.sx, sz = this.sz, si = this.sinv, sr = this.sreg;
    for (let k = 0; k < sx.length; k++) {
      const dx = wx - sx[k], dz = wz - sz[k];
      const d = Math.sqrt(dx * dx + dz * dz) * si[k];
      const r = sr[k];
      if (d < dist[r]) dist[r] = d;
    }
    let a = 0, b = 1, c = 2;
    let da = 1e9, db = 1e9, dc = 1e9;
    for (let r = 0; r < R; r++) {
      const d = dist[r];
      if (d < da) { c = b; dc = db; b = a; db = da; a = r; da = d; }
      else if (d < db) { c = b; dc = db; b = r; db = d; }
      else if (d < dc) { c = r; dc = d; }
    }
    this.r1 = a; this.r2 = b; this.r3 = c;
    this.d1 = da; this.d2 = db;
    const w2 = Math.exp(-(db - da) / BLEND), w3 = Math.exp(-(dc - da) / BLEND);
    const s = 1 + w2 + w3;
    this.w1 = 1 / s; this.w2 = w2 / s; this.w3 = w3 / s;
  }
}

const MOUNTAIN = new Float32Array(R * R);
for (const [a, b, hgt] of MOUNTAIN_PAIRS) {
  const ia = REGION_BY_KEY[a].id, ib = REGION_BY_KEY[b].id;
  MOUNTAIN[ia * R + ib] = hgt;
  MOUNTAIN[ib * R + ia] = hgt;
}

function terrace(v: number, levels: number, sharp: number) {
  const s = v * levels;
  const k = Math.floor(s);
  const f = s - k;
  return (k + smoothstep(0.5 - sharp, 0.5 + sharp, f)) / levels;
}

class HeightFns {
  n: Noise2; m: Noise2; q: Noise2;
  constructor(seed: number) {
    this.n = new Noise2(seed);
    this.m = new Noise2(seed + 101);
    this.q = new Noise2(seed + 202);
  }
  /** Crater field on a jittered grid; returns roughly -0.7 (bowl) .. +0.3 (rim). */
  craters(x: number, z: number, size: number, p: number, salt: number) {
    const ci = Math.floor(x / size), cj = Math.floor(z / size);
    let v = 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = ci + di, j = cj + dj;
      const hsh = hash3(i, j, salt);
      if ((hsh & 1023) / 1024 > p) continue;
      const cx = (i + 0.2 + 0.6 * (((hsh >>> 10) & 255) / 255)) * size;
      const cz = (j + 0.2 + 0.6 * (((hsh >>> 18) & 255) / 255)) * size;
      const rad = size * (0.12 + 0.22 * (((hsh >>> 26) & 63) / 63));
      const d = Math.hypot(x - cx, z - cz) / rad;
      if (d > 1.6) continue;
      const k = rad / size / 0.34;
      if (d < 1) v += -(1 - d * d) * 0.7 * k;
      v += 0.3 * k * Math.exp(-((d - 1) * (d - 1)) / 0.035);
    }
    return v;
  }
  height(kind: string, base: number, x: number, z: number): number {
    const n = this.n, m = this.m;
    switch (kind) {
      case 'flats': {
        let h = base + 10 * n.fbm(x / 1100, z / 1100, 4) + 4 * n.fbm(x / 260, z / 260, 3);
        const b = n.fbm(x / 820 + 40, z / 820 - 20, 3);
        if (b > 0.26) h += 30 * smoothstep(0.26, 0.42, b + 0.05 * n.n(x / 40, z / 40)) * (0.85 + 0.15 * n.n(x / 70, z / 70));
        const rm = smoothstep(0.15, 0.45, m.fbm(x / 1800, z / 1800, 2));
        if (rm > 0) h += 24 * rm * Math.pow(n.ridged(x / 450, z / 450, 4), 2.2);
        return h;
      }
      case 'salt':
        return base + 1.4 * n.fbm(x / 900, z / 900, 3) + 0.25 * n.n(x / 45, z / 45) + 5 * smoothstep(0.45, 0.8, m.fbm(x / 420, z / 420, 3));
      case 'hills':
        return base + 24 * n.fbm(x / 1300, z / 1300, 4) + 5 * n.fbm(x / 300, z / 300, 3);
      case 'ember': {
        let h = base + 15 * n.fbm(x / 1100, z / 1100, 4) + 3 * n.fbm(x / 200, z / 200, 2);
        h += 26 * smoothstep(0.18, 0.32, m.fbm(x / 1500, z / 1500, 3) + 0.04 * n.n(x / 45, z / 45));
        const p = n.ridged(x / 300 + 7, z / 300, 3);
        if (p > 0.82) h += (p - 0.82) * 110;
        return h;
      }
      case 'mesa': {
        const r = n.fbm(x / 1000, z / 1000, 5) * 0.55 + 0.5;
        let h = base + 120 * terrace(clamp01(r + 0.03 * n.n(x / 50, z / 50)), 5, 0.17) + 3 * n.fbm(x / 120, z / 120, 2);
        const c = 1 - Math.abs(m.fbm(x / 1400, z / 1400, 3));
        if (c > 0.9) h -= 40 * smoothstep(0.9, 0.97, c);
        return h;
      }
      case 'forest':
        return base + 14 * n.fbm(x / 800, z / 800, 4) + 3 * Math.abs(n.n(x / 80, z / 80));
      case 'swamp':
        return base + 2.3 * n.fbm(x / 500, z / 500, 4) - 1.0 + 1.3 * n.fbm(x / 140, z / 140, 2);
      case 'ash':
        return base + 9 * n.fbm(x / 900, z / 900, 4) + 3 * n.fbm(x / 200, z / 200, 2) + 14 * this.craters(x, z, 640, 0.45, 11);
      case 'dunes': {
        const w = n.fbm(x / 900, z / 900, 3) * 300;
        const a = (x * 0.6 + z * 0.8 + w) / 170;
        const s = a - Math.floor(a);
        const dune = s < 0.72 ? smooth(s / 0.72) : smooth((1 - s) / 0.28);
        return base + 9 * n.fbm(x / 1600, z / 1600, 3) + dune * 11 * (0.6 + 0.4 * m.n(x / 700, z / 700));
      }
      case 'craters':
        return base + 18 * n.fbm(x / 1300, z / 1300, 4) + 4 * n.fbm(x / 150, z / 150, 2) + 30 * this.craters(x, z, 760, 0.7, 23) + 3 * Math.max(0, m.n(x / 40, z / 40) - 0.5);
      case 'glass':
        return base + 26 * n.fbm(x / 1000, z / 1000, 4) + 20 * Math.pow(n.ridged(x / 380, z / 380, 4), 2) + 38 * this.craters(x, z, 900, 0.8, 37);
      case 'coast':
        return base + 6 * n.fbm(x / 700, z / 700, 4) + 2 * n.fbm(x / 120, z / 120, 2);
    }
    return base;
  }
}

/** Distance field to a polyline, rasterised into samples within `reach`. */
function polylineField(pts: number[], reach: number, dist: Float32Array, param?: Float32Array, paramBase = 0) {
  const S = N + 1;
  let acc = paramBase;
  for (let k = 0; k + 3 < pts.length; k += 2) {
    const ax = pts[k], az = pts[k + 1], bx = pts[k + 2], bz = pts[k + 3];
    const segLen = Math.hypot(bx - ax, bz - az);
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx) - reach) / CELL));
    const i1 = Math.min(N, Math.ceil((Math.max(ax, bx) + reach) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz) - reach) / CELL));
    const j1 = Math.min(N, Math.ceil((Math.max(az, bz) + reach) / CELL));
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz || 1;
    for (let j = j0; j <= j1; j++) {
      const pz = j * CELL;
      for (let i = i0; i <= i1; i++) {
        const px = i * CELL;
        let t = ((px - ax) * dx + (pz - az) * dz) / l2;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const cx = ax + dx * t - px, cz = az + dz * t - pz;
        const d = Math.sqrt(cx * cx + cz * cz);
        const idx = j * S + i;
        if (d < dist[idx]) {
          dist[idx] = d;
          if (param) param[idx] = acc + t * segLen;
        }
      }
    }
    acc += segLen;
  }
  return acc;
}

/** Catmull-Rom through control points, sampled every `step` metres. */
function spline(ctrl: number[][], step: number, wobble: Noise2 | null, amp: number, freq: number): number[] {
  const out: number[] = [];
  const P = (i: number) => ctrl[Math.max(0, Math.min(ctrl.length - 1, i))];
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
    const segLen = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(1, Math.ceil(segLen / step));
    for (let s = 0; s < steps; s++) {
      const t = s / steps, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3);
      const z = 0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3);
      out.push(x, z);
    }
  }
  const last = ctrl[ctrl.length - 1];
  out.push(last[0], last[1]);
  if (wobble && amp > 0) {
    const res: number[] = [];
    for (let k = 0; k < out.length; k += 2) {
      const pk = Math.max(0, k - 2), nk = Math.min(out.length - 2, k + 2);
      const tx = out[nk] - out[pk], tz = out[nk + 1] - out[pk + 1];
      const tl = Math.hypot(tx, tz) || 1;
      const nx = -tz / tl, nz = tx / tl;
      const endFade = Math.min(1, k / 20, (out.length - k) / 20);
      const w = amp * wobble.fbm(out[k] * freq, out[k + 1] * freq, 3) * endFade;
      res.push(out[k] + nx * w, out[k + 1] + nz * w);
    }
    return res;
  }
  return out;
}

export async function generateWorld(seed: number, progress: Progress = () => {}): Promise<Terrain> {
  const T = new Terrain(seed);
  const S = N + 1;
  const H = T.h;
  const field = new RegionField(seed);
  const fns = new HeightFns(seed);
  const ridgeN = new Noise2(seed + 303);
  const passes = PASSES.map(([u, v, r]) => [u * WORLD, v * WORLD, r]);

  // 1. base heights
  progress('Raising the land', 0);
  for (let j = 0; j <= N; j++) {
    const z = j * CELL;
    for (let i = 0; i <= N; i++) {
      const x = i * CELL;
      field.eval(x, z);
      const ra = REGIONS[field.r1], rb = REGIONS[field.r2], rc = REGIONS[field.r3];
      let h = field.w1 * fns.height(ra.terrain, ra.base, x, z);
      if (field.w2 > 0.004) h += field.w2 * fns.height(rb.terrain, rb.base, x, z);
      else h += field.w2 * ra.base;
      if (field.w3 > 0.004) h += field.w3 * fns.height(rc.terrain, rc.base, x, z);
      else h += field.w3 * ra.base;
      // mountain ridges along some region borders
      const mh = MOUNTAIN[field.r1 * R + field.r2];
      if (mh > 0) {
        const edge = field.d2 - field.d1;
        const t = clamp01(1 - edge / 600);
        if (t > 0) {
          let pm = 1;
          for (const p of passes) {
            const d = Math.hypot(x - p[0], z - p[1]);
            if (d < p[2]) pm = Math.min(pm, smoothstep(p[2] * 0.3, p[2], d));
          }
          const shape = smooth(t) * t;
          h += mh * shape * pm * (0.5 + 0.5 * ridgeN.ridged(x / 700, z / 700, 4));
        }
      }
      // world edges: mountains north and west, sea east and south
      const eN = z, eW = x, eE = WORLD - x, eS = WORLD - z;
      const mt = Math.max(smoothstep(900, 0, eN), smoothstep(900, 0, eW));
      if (mt > 0) h += mt * mt * (220 + 180 * ridgeN.ridged(x / 520, z / 520, 4));
      const oc = Math.max(smoothstep(620, 60, eE), smoothstep(700, 60, eS));
      if (oc > 0) h = lerp(h, -28 + 4 * ridgeN.n(x / 300, z / 300), Math.pow(oc, 1.4));
      H[j * S + i] = h;
      T.reg[j * S + i] = field.r1;
    }
    if ((j & 31) === 0) { progress('Raising the land', j / N); await tick(); }
  }

  // 2. the river, carving a valley down to the sea
  progress('Carving the Wending', 0);
  await tick();
  const wob = new Noise2(seed + 404);
  const riverPts = spline(RIVER.map(([u, v]) => [u * WORLD, v * WORLD]), 30, wob, 140, 1 / 900);
  {
    const dist = new Float32Array(S * S).fill(1e9);
    const par = new Float32Array(S * S);
    polylineField(riverPts, 420, dist, par);
    const fords = FORDS.map(([u, v]) => [u * WORLD, v * WORLD]);
    for (let idx = 0; idx < S * S; idx++) {
      const d = dist[idx];
      if (d > 420) continue;
      const x = (idx % S) * CELL, z = ((idx / S) | 0) * CELL;
      const width = 16 + 8 * wob.n(par[idx] / 600, 3.3);
      let bed = -3.2 * (1 - (d / width) * (d / width)) - 0.3;
      for (const f of fords) {
        const fd = Math.hypot(x - f[0], z - f[1]);
        if (fd < 60) bed = lerp(-0.45, bed, smoothstep(22, 60, fd));
      }
      const bank = 0.8 + (d - width) * (0.2 + 0.06 * wob.n(x / 300, z / 300));
      const target = d < width ? bed : bank;
      if (H[idx] > target) H[idx] = target;
    }
  }

  // 3. lakes and oases
  for (const [u, v, r, depth] of LAKES) {
    const cx = u * WORLD, cz = v * WORLD;
    const reach = r + 260;
    const i0 = Math.max(0, Math.floor((cx - reach) / CELL)), i1 = Math.min(N, Math.ceil((cx + reach) / CELL));
    const j0 = Math.max(0, Math.floor((cz - reach) / CELL)), j1 = Math.min(N, Math.ceil((cz + reach) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = i * CELL, z = j * CELL;
      const d = Math.hypot(x - cx, z - cz) * (1 + 0.18 * wob.n(x / 160, z / 160));
      const target = d < r ? -depth * (1 - (d / r) * (d / r)) - 0.2 : (d - r) * 0.16 - 0.2;
      const idx = j * S + i;
      if (H[idx] > target) H[idx] = target;
    }
  }

  // 4. settlements and landmarks sit on levelled ground
  progress('Founding the towns', 0);
  await tick();
  let siteId = 1;
  const flatten = (cx: number, cz: number, r: number, minH: number, strength = 1) => {
    // average height of the ring
    let sum = 0, cnt = 0;
    for (let a = 0; a < 24; a++) {
      for (const rr of [0.3, 0.7, 1]) {
        const x = cx + Math.cos((a / 24) * Math.PI * 2) * r * rr, z = cz + Math.sin((a / 24) * Math.PI * 2) * r * rr;
        sum += T.heightAt(x, z); cnt++;
      }
    }
    const target = Math.max(minH, sum / cnt);
    const reach = r * 1.6;
    const i0 = Math.max(0, Math.floor((cx - reach) / CELL)), i1 = Math.min(N, Math.ceil((cx + reach) / CELL));
    const j0 = Math.max(0, Math.floor((cz - reach) / CELL)), j1 = Math.min(N, Math.ceil((cz + reach) / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i * CELL - cx, j * CELL - cz);
      const b = smoothstep(reach, r * 0.95, d) * strength;
      if (b <= 0) continue;
      const idx = j * S + i;
      H[idx] = lerp(H[idx], target + 0.25 * wob.n(i / 9, j / 9), b);
    }
    return target;
  };
  for (const s of SETTLEMENTS) {
    const x = s.u * WORLD, z = s.v * WORLD;
    const minH = s.tmpl === 'swamp_town' || s.tmpl === 'fishing' ? 1.2 : 2.5;
    const y = flatten(x, z, s.r * 1.1, minH);
    T.sites.push({ id: siteId++, key: s.key, name: s.name, kind: 'town', x, z, r: s.r, y, region: T.regionIdAt(x, z), faction: s.faction, settlement: s.key, seed: hash3(seed, siteId, 5) });
  }
  for (const l of LANDMARKS) {
    const x = l.u * WORLD, z = l.v * WORLD;
    const y = flatten(x, z, l.r, 1.5, l.kind === 'ruin_tower' && REGIONS[T.regionIdAt(x, z)].key === 'mire' ? 0.5 : 1);
    T.sites.push({ id: siteId++, key: l.key, name: l.name, kind: l.kind, x, z, r: l.r, y, region: T.regionIdAt(x, z), landmark: true, seed: hash3(seed, siteId, 6) });
  }

  // 5. roads, routed over a coarse cost grid, then carved into the land
  progress('Laying the roads', 0);
  await tick();
  const RC = 24, RN = WORLD / RC;
  const rcost = new Float32Array(RN * RN);
  for (let j = 0; j < RN; j++) for (let i = 0; i < RN; i++) {
    const x = (i + 0.5) * RC, z = (j + 0.5) * RC;
    const h = T.heightAt(x, z);
    const s = Math.max(
      Math.abs(T.heightAt(x + RC / 2, z) - T.heightAt(x - RC / 2, z)),
      Math.abs(T.heightAt(x, z + RC / 2) - T.heightAt(x, z - RC / 2)),
    ) / RC;
    let c = 1 + s * s * 60 + (s > 0.55 ? 300 : 0);
    if (h < SEA) c += h < -0.8 ? 120 : 4;
    if (x < 500 || z < 500 || x > WORLD - 500 || z > WORLD - 500) c += 200;
    rcost[j * RN + i] = c;
  }
  const astar = new GridAStar(RN * RN);
  const siteByKey = new Map(T.sites.map((s) => [s.key, s]));
  const roadCell = new Uint8Array(RN * RN);
  for (let k = 0; k < ROADS.length; k++) {
    const [ak, bk] = ROADS[k];
    const a = siteByKey.get(ak)!, b = siteByKey.get(bk)!;
    const si = Math.floor(a.z / RC) * RN + Math.floor(a.x / RC);
    const gi = Math.floor(b.z / RC) * RN + Math.floor(b.x / RC);
    const path = astar.find({ w: RN, h: RN, cost: (i) => rcost[i] * (roadCell[i] ? 0.45 : 1), minCost: 0.45, maxNodes: 400000 }, si, gi, true);
    const ctrl: number[][] = [];
    if (path) {
      for (let p = 0; p < path.length; p += 3) ctrl.push([(path[p] % RN + 0.5) * RC, (Math.floor(path[p] / RN) + 0.5) * RC]);
      const lp = path[path.length - 1];
      ctrl.push([(lp % RN + 0.5) * RC, (Math.floor(lp / RN) + 0.5) * RC]);
      for (const c of path) roadCell[c] = 1;
    } else {
      ctrl.push([a.x, a.z], [b.x, b.z]);
    }
    ctrl[0] = [a.x, a.z];
    ctrl[ctrl.length - 1] = [b.x, b.z];
    const pts = spline(ctrl, 6, null, 0, 0);
    let len = 0;
    for (let p = 2; p < pts.length; p += 2) len += Math.hypot(pts[p] - pts[p - 2], pts[p + 1] - pts[p - 1]);
    T.roads.push({ a: ak, b: bk, pts, len });
    progress('Laying the roads', (k + 1) / ROADS.length);
    if ((k & 3) === 0) await tick();
  }
  // carve: each road follows a smoothed height profile with a limited grade
  for (const road of T.roads) {
    const pts = road.pts;
    const n = pts.length / 2;
    const raw = new Float32Array(n);
    for (let p = 0; p < n; p++) raw[p] = Math.max(0.35, T.heightAt(pts[p * 2], pts[p * 2 + 1]));
    const prof = new Float32Array(n);
    const W = 10;
    for (let p = 0; p < n; p++) {
      let s = 0, c = 0;
      for (let q = Math.max(0, p - W); q <= Math.min(n - 1, p + W); q++) { s += raw[q]; c++; }
      prof[p] = s / c;
    }
    // limit grade to ~16% both ways
    for (let p = 1; p < n; p++) prof[p] = clamp(prof[p], prof[p - 1] - 1, prof[p - 1] + 1);
    for (let p = n - 2; p >= 0; p--) prof[p] = clamp(prof[p], prof[p + 1] - 1, prof[p + 1] + 1);
    const dist = new Float32Array(0);
    void dist;
    for (let p = 0; p < n; p++) {
      const cx = pts[p * 2], cz = pts[p * 2 + 1];
      const reach = 16;
      const i0 = Math.max(0, Math.floor((cx - reach) / CELL)), i1 = Math.min(N, Math.ceil((cx + reach) / CELL));
      const j0 = Math.max(0, Math.floor((cz - reach) / CELL)), j1 = Math.min(N, Math.ceil((cz + reach) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i * CELL - cx, j * CELL - cz);
        const b = smoothstep(reach, 5, d);
        if (b <= 0) continue;
        const idx = j * S + i;
        // blend toward the profile, taking the strongest pull seen so far
        const target = prof[p];
        const cur = H[idx];
        const want = lerp(cur, target, b);
        if (Math.abs(want - cur) > 0.001) H[idx] = want;
      }
    }
  }

  // road mask for scatter exclusion and ground wear
  for (const road of T.roads) {
    const pts = road.pts;
    for (let p = 0; p < pts.length; p += 2) {
      const cx = pts[p], cz = pts[p + 1];
      const i0 = Math.max(0, Math.floor((cx - 8) / CELL)), i1 = Math.min(N, Math.ceil((cx + 8) / CELL));
      const j0 = Math.max(0, Math.floor((cz - 8) / CELL)), j1 = Math.min(N, Math.ceil((cz + 8) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = Math.hypot(i * CELL - cx, j * CELL - cz);
        const v = Math.round(255 * clamp01(1 - d / 8));
        const idx = j * S + i;
        if (v > T.road[idx]) T.road[idx] = v;
      }
    }
  }

  // 6. lesser sites: ruins, camps, nests, shacks, wrecks...
  progress('Scattering ruins', 0);
  await tick();
  const rng = new RNG(seed ^ 0xabcdef);
  const POI_TABLE: Record<string, [POIKind, number][]> = {
    flats: [['ruin', 3], ['camp_reavers', 2], ['camp_starvelings', 2], ['nest_dunehound', 2], ['shack', 2], ['wreck', 1], ['battlefield', 0.5], ['caravan', 1], ['homestead', 1], ['shrine', 0.3]],
    salt: [['ruin', 2], ['wreck', 3], ['nest_brineclaw', 2], ['camp_reavers', 1], ['caravan', 1], ['shack', 1]],
    vale: [['homestead', 4], ['ruin', 2], ['shack', 1], ['caravan', 1], ['camp_starvelings', 1]],
    coast: [['nest_brineclaw', 3], ['mist_camp', 2], ['wreck', 2], ['ruin', 1], ['shack', 1]],
    ember: [['homestead', 3], ['shrine', 2], ['ruin', 1], ['battlefield', 1], ['camp_starvelings', 1]],
    highlands: [['ruin', 2], ['nest_hookbeak', 1], ['monolith', 1], ['camp_reavers', 1], ['nest_dunehound', 2], ['battlefield', 1]],
    thrumwood: [['nest_skitter', 3], ['ruin', 2], ['blackcomb_nest', 1], ['hermit', 1], ['shack', 1]],
    mire: [['nest_mauler', 2], ['nest_bloodfly', 2], ['camp_scorched', 2], ['ruin_tower', 1], ['shack', 1]],
    ash: [['camp_mawkin', 3], ['bat_roost', 2], ['ruin', 2], ['battlefield', 1], ['nest_dunehound', 1]],
    bonesea: [['skeleton', 4], ['nest_hookbeak', 1], ['nest_skitter', 2], ['ruin_dome', 1], ['wreck', 1], ['caravan', 1]],
    rust: [['ruin', 3], ['ruin_tower', 1], ['ruin_dome', 1], ['nest_rustspider', 3], ['warden_post', 2], ['wreck', 2]],
    glass: [['glass_ruin', 3], ['warden_post', 2], ['nest_rustspider', 2], ['ruin_lab', 0.4]],
  };
  const POI_R: Partial<Record<POIKind, number>> = { ruin: 30, ruin_tower: 35, ruin_dome: 45, ruin_lab: 55, glass_ruin: 40, wreck: 40, skeleton: 50, camp_mawkin: 40, battlefield: 45 };
  const MIN = 560;
  const cand: [number, number][] = [];
  const cs = MIN / Math.SQRT2, gw = Math.ceil(WORLD / cs);
  const grid = new Int32Array(gw * gw).fill(-1);
  for (let tries = 0; tries < 9000; tries++) {
    const x = rng.range(700, WORLD - 700), z = rng.range(700, WORLD - 700);
    const gi = Math.floor(x / cs), gj = Math.floor(z / cs);
    let ok = true;
    for (let dj = -2; dj <= 2 && ok; dj++) for (let di = -2; di <= 2 && ok; di++) {
      const ii = gi + di, jj = gj + dj;
      if (ii < 0 || jj < 0 || ii >= gw || jj >= gw) continue;
      const k = grid[jj * gw + ii];
      if (k >= 0 && Math.hypot(cand[k][0] - x, cand[k][1] - z) < MIN) ok = false;
    }
    if (!ok) continue;
    if (T.heightAt(x, z) < 0.6 || T.slopeAt(x, z) > 0.35) continue;
    if (T.sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + (s.kind === 'town' ? 420 : 260))) continue;
    grid[gj * gw + gi] = cand.length;
    cand.push([x, z]);
  }
  for (const [x, z] of cand) {
    const reg = REGIONS[T.regionIdAt(x, z)];
    const table = POI_TABLE[reg.key];
    if (!table) continue;
    const kind = rng.weighted(table);
    const r = POI_R[kind] ?? 26;
    let nearRoad = false;
    if (kind.startsWith('camp') || kind === 'caravan') {
      for (const rd of T.roads) {
        for (let p = 0; p < rd.pts.length && !nearRoad; p += 20) if (Math.hypot(rd.pts[p] - x, rd.pts[p + 1] - z) < 40) nearRoad = true;
        if (nearRoad) break;
      }
    }
    if (nearRoad) continue;
    const y = flatten(x, z, r, 1, 0.85);
    T.sites.push({ id: siteId++, key: `${kind}_${siteId}`, name: poiName(kind, reg.key, rng), kind, x, z, r, y, region: reg.id, seed: hash3(seed, siteId, 7) });
  }

  // 7. ore deposits
  progress('Burying ore', 0);
  await tick();
  let oreId = 1;
  for (let tries = 0; tries < 900; tries++) {
    const x = rng.range(600, WORLD - 600), z = rng.range(600, WORLD - 600);
    const reg = REGIONS[T.regionIdAt(x, z)];
    if (!reg.ores.length) continue;
    const h = T.heightAt(x, z);
    if (h < 0.5) continue;
    const sl = T.slopeAt(x, z);
    if (sl > 0.5) continue;
    if (T.sites.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + 40)) continue;
    const kind = rng.weighted(reg.ores) as 'iron' | 'copper' | 'stone';
    const count = rng.int(1, 3);
    for (let c = 0; c < count; c++) {
      const ox = x + rng.range(-14, 14), oz = z + rng.range(-14, 14);
      T.ores.push({ id: oreId++, kind, x: ox, z: oz, y: T.heightAt(ox, oz), rot: rng.range(0, 6.283), size: rng.range(0.8, 1.3) });
    }
  }
  T.indexSites();
  progress('Done', 1);
  return T;
}

const POI_NAMES: Partial<Record<POIKind, string[]>> = {
  ruin: ['Broken Walls', 'Old Maker Ruin', 'Tumbled Stones', 'The Empty Houses', 'Rusted Hall', 'Shattered Vault', 'Collapsed Archive', 'Silent Ruin'],
  ruin_tower: ['Leaning Tower', 'Old Spire', 'Watchtower Ruin', 'Hollow Tower'],
  ruin_dome: ['Cracked Dome', 'Old Observatory', 'The Shell'],
  ruin_lab: ['Buried Laboratory', 'Maker Vault'],
  glass_ruin: ['Fused Ruin', 'Glass Hall', 'Melted Tower'],
  camp_reavers: ['Reaver Camp', 'Toll Camp', 'Bandit Camp'],
  camp_starvelings: ['Starveling Camp', 'Hungry Camp'],
  camp_scorched: ['Scorched Hand Camp', 'Smuggler Camp'],
  camp_mawkin: ['Mawkin Camp', 'Cookfire Camp', 'Bone Camp'],
  nest_dunehound: ['Dunehound Den'],
  nest_skitter: ['Skitter Nest'],
  nest_hookbeak: ['Hookbeak Nest'],
  nest_brineclaw: ['Brineclaw Beds'],
  nest_rustspider: ['Rustspider Nest'],
  nest_mauler: ['Mauler Wallow'],
  nest_bloodfly: ['Bloodfly Swarm'],
  wreck: ['Maker Wreck', 'Crashed Hull', 'Old Machine'],
  shack: ['Lone Shack', 'Scav Hut', "Trader's Hut"],
  homestead: ['Homestead', 'Farmstead', 'Lonely Farm'],
  skeleton: ['Giant Bones', 'Ribcage', 'Skull Hill'],
  monolith: ['Standing Stones', 'Old Monolith'],
  caravan: ['Caravan Camp', 'Traders Resting'],
  battlefield: ['Old Battlefield', 'Field of the Dead'],
  warden_post: ['Warden Post', 'Machine Watch'],
  hermit: ["Hermit's Hut"],
  shrine: ['Wayside Shrine', 'Ember Shrine'],
  mist_camp: ['Pale Camp'],
  blackcomb_nest: ['Blackcomb Outpost'],
  bat_roost: ['Bat Roost'],
};

function poiName(kind: POIKind, region: string, rng: RNG) {
  const names = POI_NAMES[kind] ?? ['Ruin'];
  return rng.pick(names);
}
