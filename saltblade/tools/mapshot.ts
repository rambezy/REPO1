// Renders the generated world to a PNG (hillshaded, coloured by region) for review.
// Usage: npx tsx tools/mapshot.ts [seed] [out.png] [scale]
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { generateWorld } from '../src/world/gen';
import { REGIONS } from '../src/world/regions';
import { N, CELL, WORLD } from '../src/world/consts';

const seed = +(process.argv[2] ?? 1337);
const out = process.argv[3] ?? 'tools/out/map.png';
const DS = +(process.argv[4] ?? 2); // downsample
const t0 = Date.now();
const T = await generateWorld(seed, (s, f) => { if (f === 0) process.stdout.write(`\n${s} `); });
console.log(`\ngenerated in ${Date.now() - t0} ms; sites ${T.sites.length}; ores ${T.ores.length}; roads ${T.roads.length}`);
const W = Math.floor(N / DS);
const img = Buffer.alloc(W * W * 3);
const hex = (c: number) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
  const x = i * DS * CELL, z = j * DS * CELL;
  const h = T.heightAt(x, z);
  const reg = REGIONS[T.regionIdAt(x, z)];
  let [r, g, b] = hex(reg.ground[0]);
  const hl = T.heightAt(x - CELL, z - CELL);
  const shade = Math.max(0.35, Math.min(1.4, 1 + (h - hl) * 0.12));
  r *= shade; g *= shade; b *= shade;
  if (h < 0) { const d = Math.min(1, -h / 4); [r, g, b] = [80 - d * 40, 110 - d * 40, 120 - d * 20]; if (-h < 0.9) { r += 40; g += 40; b += 30; } }
  const e = Math.min(1, Math.max(0, h / 250));
  r = r * (1 - e * 0.3) + 255 * e * 0.3; g = g * (1 - e * 0.3) + 255 * e * 0.3; b = b * (1 - e * 0.3) + 255 * e * 0.3;
  const o = (j * W + i) * 3;
  img[o] = Math.max(0, Math.min(255, r)); img[o + 1] = Math.max(0, Math.min(255, g)); img[o + 2] = Math.max(0, Math.min(255, b));
}
const put = (x: number, z: number, c: number[], rad = 1) => {
  const ci = Math.floor(x / CELL / DS), cj = Math.floor(z / CELL / DS);
  for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) {
    const i = ci + di, j = cj + dj;
    if (i < 0 || j < 0 || i >= W || j >= W) continue;
    const o = (j * W + i) * 3; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2];
  }
};
for (const rd of T.roads) for (let p = 0; p < rd.pts.length; p += 2) put(rd.pts[p], rd.pts[p + 1], [120, 70, 40], 0);
for (const o of T.ores) put(o.x, o.z, o.kind === 'iron' ? [160, 60, 50] : o.kind === 'copper' ? [60, 160, 140] : [200, 200, 200], 0);
for (const s of T.sites) put(s.x, s.z, s.kind === 'town' ? [255, 255, 0] : s.landmark ? [255, 0, 255] : [255, 80, 0], s.kind === 'town' ? 5 : 2);
// png
const raw = Buffer.alloc((W * 3 + 1) * W);
for (let j = 0; j < W; j++) { raw[j * (W * 3 + 1)] = 0; img.copy(raw, j * (W * 3 + 1) + 1, j * W * 3, (j + 1) * W * 3); }
const crcT = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc = (b: Buffer) => { let c = -1; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out, W + 'x' + W);
// stats
let water = 0, steep = 0, total = 0, maxH = -1e9;
for (let j = 0; j < N; j += 4) for (let i = 0; i < N; i += 4) { const x = i * CELL, z = j * CELL; const h = T.heightAt(x, z); total++; if (h < 0) water++; if (T.slopeAt(x, z) > 0.8) steep++; maxH = Math.max(maxH, h); }
console.log(`water ${(water / total * 100).toFixed(1)}%  steep ${(steep / total * 100).toFixed(1)}%  maxH ${maxH.toFixed(0)}`);
for (const rd of T.roads) {
  let maxS = 0, wet = 0;
  for (let p = 0; p < rd.pts.length; p += 2) { const s = T.slopeAt(rd.pts[p], rd.pts[p + 1]); maxS = Math.max(maxS, s); if (T.heightAt(rd.pts[p], rd.pts[p + 1]) < -0.8) wet++; }
  if (maxS > 0.5 || wet > 0) console.log(`road ${rd.a}-${rd.b} len ${rd.len.toFixed(0)} maxSlope ${maxS.toFixed(2)} deepWaterPts ${wet}`);
}
const kinds: Record<string, number> = {};
for (const s of T.sites) kinds[s.kind] = (kinds[s.kind] || 0) + 1;
console.log(JSON.stringify(kinds));
