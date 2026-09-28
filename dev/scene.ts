import { renderGround, CHUNK, groundSize } from '../src/gfx/ground/render';
import { TexCache } from '../src/gfx/ground/textures';
import { drawWaterFx } from '../src/gfx/ground/water';
import { T } from '../src/world/terrain';
import { treeSprite, bushSprite, rockSprite, herbSprite, flowerPatchSprite, reedsSprite } from '../src/gfx/nature';
import { buildingArt } from '../src/gfx/buildings';
import { propInfo } from '../src/gfx/props';
import { drawSprite } from '../src/gfx/sprite';
import { drawChar, randomLook } from '../src/gfx/characters';
import { drawAnimal, ANIMAL_LOOKS } from '../src/gfx/animals';
import { CLOTH } from '../src/gfx/palette';

const W = 48, H = 32;
const ground = new Uint8Array(W * H).fill(T.GRASS);
const set = (x: number, y: number, t: number) => { if (x >= 0 && y >= 0 && x < W && y < H) ground[y * W + x] = t; };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (x > 30 && y < 12) set(x, y, T.FOREST);
  if (x < 10 && y > 18) set(x, y, T.MEADOW);
}
for (let x = 0; x < W; x++) { set(x, 14, T.ROAD); set(x, 15, T.ROAD); if (x % 7 === 0) set(x, 16, T.ROAD); }
for (let y = 0; y < H; y++) { const rx = 24 + Math.round(Math.sin(y * 0.3) * 2); set(rx, y, T.WATER); set(rx + 1, y, T.WATER); set(rx + 2, y, T.WATER); if (y === 14 || y === 15) { set(rx, y, T.BRIDGE); set(rx + 1, y, T.BRIDGE); set(rx + 2, y, T.BRIDGE); } }
for (let y = 18; y < 26; y++) for (let x = 12; x < 20; x++) set(x, y, T.FIELD);
for (let y = 18; y < 26; y++) for (let x = 30; x < 38; x++) set(x, y, T.WHEAT);
for (let y = 22; y < 30; y++) for (let x = 40; x < 47; x++) set(x, y, T.COBBLE);
for (let y = 0; y < 5; y++) for (let x = 0; x < 12; x++) set(x, y, T.WALL_STONE);
for (let y = 26; y < 32; y++) for (let x = 20; x < 28; x++) set(x, y, T.ASH);
for (let y = 3; y < 8; y++) for (let x = 40; x < 48; x++) set(x, y, T.ROCK);
const src = { w: W, h: H, ground, seed: 7, outdoor: true };

const c = document.getElementById('c') as HTMLCanvasElement;
const S = +(new URLSearchParams(location.search).get('s') || 3);
c.width = W * 16 * S; c.height = H * 16 * S;
const ctx = c.getContext('2d')!;
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
ctx.scale(S, S);
const TR = 3;
const t0 = performance.now();
const tex = new TexCache(TR);
const t1 = performance.now();
const n = groundSize(TR);
for (let cy = 0; cy < Math.ceil(H / CHUNK); cy++) for (let cx = 0; cx < Math.ceil(W / CHUNK); cx++) {
  const out = new Uint32Array(n * n);
  renderGround(src, cx, cy, TR, tex, out);
  const img = new ImageData(new Uint8ClampedArray(out.buffer), n, n);
  const tmp = document.createElement('canvas'); tmp.width = n; tmp.height = n;
  tmp.getContext('2d')!.putImageData(img, 0, 0);
  const m = 1 / TR;
  ctx.drawImage(tmp, cx * 128 - m, cy * 128 - m, 128 + 2 * m, 128 + 2 * m);
}
console.log('textures ms', (t1 - t0).toFixed(1), 'chunks ms', (performance.now() - t1).toFixed(1));
const wm = { w: W, h: H, outdoor: true, get: (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? T.GRASS : ground[y * W + x]) };
drawWaterFx(ctx, wm, 0, 0, W * 16, H * 16, 0.3);
type D = { y: number; draw: () => void };
const list: D[] = [];
const add = (y: number, draw: () => void) => list.push({ y, draw });
const house = (tx: number, ty: number, spec: any) => { const a = buildingArt(spec); const bx = tx * 16 + (spec.w * 16) / 2, by = (ty + spec.h) * 16; add(by, () => drawSprite(ctx, a.sprite, bx, by)); };
house(2, 6, { w: 4, h: 3, style: 'cottage', door: 1, seed: 1, chimney: true });
house(8, 6, { w: 5, h: 3, style: 'townhouse', door: 2, seed: 2, sign: 'tavern', chimney: true });
house(14, 5, { w: 4, h: 4, style: 'burned', door: 1, seed: 3 });
house(2, 20, { w: 6, h: 4, style: 'church', door: 2, seed: 4 });
house(40, 17, { w: 5, h: 3, style: 'stone', door: 2, seed: 5, sign: 'smith' });
house(19, 1, { w: 4, h: 3, style: 'log', door: 1, seed: 6 });
house(42, 9, { w: 3, h: 2, style: 'tent', door: 1, seed: 7, tint: '#8e2f2f', tint2: '#262220' });
house(35, 27, { w: 3, h: 1, style: 'stall', door: -1, seed: 8, tint: CLOTH.woad });
house(28, 0, { w: 4, h: 5, style: 'keep', door: 1, seed: 9, tint: CLOTH.green, tint2: '#c79a2c' });
const trees = ['oak', 'linden', 'birch', 'pine', 'apple', 'dead', 'burnt', 'willow'] as const;
trees.forEach((k, i) => { const x = 33 * 16 + (i % 4) * 36, y = 3 * 16 + Math.floor(i / 4) * 60 + 40; add(y, () => drawSprite(ctx, treeSprite(k, i), x, y)); });
for (let i = 0; i < 4; i++) { const x = 60 + i * 30, y = 12 * 16; add(y, () => drawSprite(ctx, bushSprite(i, i === 1 ? '#c8302a' : undefined), x, y)); }
add(200, () => drawSprite(ctx, rockSprite(1, 'boulder', true), 200, 200));
add(205, () => drawSprite(ctx, rockSprite(2, 'big'), 235, 205));
const props = ['barrel', 'crate', 'sack', 'haystack', 'cart', 'woodpile', 'fence_h', 'anvil', 'forge', 'grindstone', 'well', 'trough', 'bench', 'table', 'bed', 'chest', 'shelf', 'fireplace', 'oven', 'cauldron', 'alchemy', 'altar', 'signpost', 'noticeboard', 'grave', 'grave_fresh', 'wayshrine', 'pillory', 'dummy', 'target', 'weaponrack', 'campfire', 'bonfire', 'skep', 'coop', 'cage', 'gallows', 'fountain', 'statue', 'mine', 'waterwheel', 'boat', 'millstone'];
props.forEach((p, i) => { const x = 24 + (i % 15) * 32, y = 27 * 16 + Math.floor(i / 15) * 34 - 30; add(y, () => drawSprite(ctx, propInfo(p, i, p === 'cart' ? 'bread' : '').sprite, x, y)); });
const herbs = ['yarrow', 'chamomile', 'nettle', 'sage', 'comfrey', 'valerian', 'feverfew', 'belladonna', 'poppy', 'stjohnswort', 'mint', 'thistle', 'marigold', 'mushroom'];
herbs.forEach((h, i) => add(22 * 16, () => drawSprite(ctx, herbSprite(h), 200 + i * 14, 22 * 16)));
for (let i = 0; i < 6; i++) add(15 * 16 + 8, () => drawChar(ctx, randomLook(40 + i), i % 4, 1, 90 + i * 20, 15 * 16 + 8));
const animals = Object.keys(ANIMAL_LOOKS);
animals.forEach((a, i) => add(18 * 16 + (i % 2) * 20, () => drawAnimal(ctx, ANIMAL_LOOKS[a], i % 4, 0, 330 + i * 26, 18 * 16 + 20 + (i % 2) * 20)));
list.sort((a, b) => a.y - b.y).forEach((d) => d.draw());
