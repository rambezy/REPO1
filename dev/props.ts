// Prop gallery: every prop type and its opt variants on a grass background,
// tiling checks for fences, and an interior strip (the real painted wall and
// floor) with wall-mounted props where Room.wallProp puts them.
// URL params: s (scale), only (comma list of types), guides=1 (base point,
// footprint, light), fire=0 (hide the renderer's flames), room=0.
import { propInfo } from '../src/gfx/props';
import { drawSprite } from '../src/gfx/sprite';
import { CLOTH } from '../src/gfx/palette';
import { renderGround, CHUNK, groundSize } from '../src/gfx/ground/render';
import { TexCache } from '../src/gfx/ground/textures';
import { T } from '../src/world/terrain';

const q = new URLSearchParams(location.search);
const S = +(q.get('s') || 3);
const mapId = q.get('map');
const only = q.get('only') ? q.get('only')!.split(',') : null;
const guides = q.get('guides') === '1';
const fire = q.get('fire') !== '0';
const showRoom = q.get('room') !== '0' && !only;

type Item = [type: string, opt?: string, variant?: number];
const ITEMS: Item[] = [
  ['barrel'], ['barrel', 'water'], ['barrelstack'], ['crate'], ['sack'], ['sack', 'flour'], ['breadbasket'], ['stall_goods'], ['pot'], ['pot', 'flowers'],
  ['haystack'], ['woodpile'], ['orepile'], ['rubble'], ['skep'],
  ['cart'], ['cart', 'hay'], ['cart', 'bread'], ['cart', 'barrels'], ['minecart'],
  ['fence_h'], ['fence_h_broken'], ['fence_v'], ['fence_post'], ['signpost'], ['milestone'], ['cross'], ['flag', CLOTH.green], ['flag', CLOTH.black],
  ['anvil'], ['forge'], ['grindstone'], ['well'], ['trough'], ['tub'], ['fountain'],
  ['bench'], ['stool'], ['chair'], ['throne'], ['pew'], ['lectern'],
  ['table'], ['table', 'bread'], ['table', 'books'], ['table', 'meal'], ['table_long'], ['table_long', 'feast'], ['table_long', 'meal'], ['table_long', 'bread'],
  ['bed', CLOTH.madder], ['bed', CLOTH.woad], ['bed', '', 3], ['bed_straw', CLOTH.undyed], ['bed_straw', CLOTH.woad], ['bedroll', CLOTH.olive], ['bedroll', CLOTH.madder],
  ['chest'], ['chest', 'open'], ['shelf'], ['bookshelf'], ['weaponrack'], ['weaponrack', 'old'],
  ['fireplace'], ['fireplace', 'pot'], ['hearth'], ['oven'], ['cauldron'], ['cauldron', 'brew'], ['alchemy'],
  ['candle'], ['candelabra'], ['torch'], ['altar'], ['campfire'], ['campfire', 'cold'], ['bonfire'],
  ['banner', CLOTH.green], ['banner', CLOTH.black], ['window', 'day'], ['window', 'night'], ['hanging_herbs'],
  ['rug', CLOTH.crimson], ['rug', CLOTH.green], ['rug', CLOTH.russet], ['bloodpool'], ['stairs_down'], ['ladder'],
  ['noticeboard'], ['grave'], ['grave_fresh'], ['grave_fresh', 'flowers'], ['wayshrine'], ['statue'],
  ['pillory'], ['gallows'], ['cage'], ['dummy'], ['dummy', 'armored'], ['target'],
  ['coop'], ['kennel'], ['laundry'], ['dryingrack'], ['spinningwheel'], ['loom'], ['millstone'],
  ['tent_small'], ['tent_small', CLOTH.russet], ['mine'], ['waterwheel'], ['boat'], ['nonesuch'],
  ['@fence_h'], ['@fence_v'], ['@wheel'],
];

const clothName = (v: string) => Object.entries(CLOTH).find(([, c]) => c === v)?.[0] ?? v;
const label = ([t, o, v]: Item) => t.startsWith('@') ? t.slice(1) + (t === '@wheel' ? ' turning' : ' tiled') : t + (o ? ':' + clothName(o) : '') + (v ? '#' + v : '');

// ---------------------------------------------------------------- the renderer's flames (copied for alignment checks)
function drawFire(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, t = 1.3) {
  const cols = ['#b83a1a', '#f07a24', '#ffc24a', '#fff3b0'];
  for (let i = 0; i < 4; i++) {
    const h = size * (1 - i * 0.22) * (0.85 + Math.sin(t * 13 + i * 2.1 + x) * 0.15);
    const w = size * 0.55 * (1 - i * 0.2);
    ctx.fillStyle = cols[i];
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 0.6, y - h * 0.6, x + Math.sin(t * 7 + i) * w * 0.3, y - h);
    ctx.quadraticCurveTo(x + w * 0.6, y - h * 0.6, x + w, y);
    ctx.closePath();
    ctx.fill();
  }
}

function drawProp(ctx: CanvasRenderingContext2D, type: string, opt: string, variant: number, x: number, y: number, rot?: number) {
  const info = propInfo(type, variant, opt);
  const s = info.sprite;
  if (info.anim === 'wheel' && rot !== undefined) {
    // as the renderer spins it: about the sprite's centre
    ctx.save();
    ctx.translate(x, y - s.oy + s.h / 2);
    ctx.rotate(rot);
    ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
    ctx.restore();
  } else drawSprite(ctx, s, x, y);
  if (fire) {
    if (info.anim === 'bigfire') drawFire(ctx, x, y - 6, 18);
    else if (info.anim === 'fire' && info.light) drawFire(ctx, x + info.light.x, y + info.light.y + 5, 5);
    else if (info.anim === 'candle' && info.light && type === 'candle') drawFire(ctx, x, y - 7, 2);
  }
  if (guides) {
    ctx.fillStyle = '#ff2a2a';
    ctx.fillRect(x - 0.5, y - 0.15, 1, 0.3);
    ctx.fillRect(x - 0.15, y - 0.5, 0.3, 1);
    if (info.solid) { ctx.strokeStyle = 'rgba(255,255,0,0.8)'; ctx.lineWidth = 0.25; ctx.strokeRect(x - info.solid.w / 2, y - info.solid.h, info.solid.w, info.solid.h); }
    if (info.light) { ctx.strokeStyle = 'rgba(0,255,255,0.9)'; ctx.lineWidth = 0.25; ctx.beginPath(); ctx.arc(x + info.light.x, y + info.light.y, 1.2, 0, Math.PI * 2); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 0.2; ctx.strokeRect(x - s.ox, y - s.oy, s.w, s.h);
  }
}

// special cells: repeated segments to check that fences join up
type Cell = { w: number; h: number; oy: number; draw: (ctx: CanvasRenderingContext2D, x: number, y: number) => void };
function cellOf(it: Item): Cell {
  const [t, o = '', v = 0] = it;
  if (t === '@fence_h') return { w: 64, h: 16, oy: 14.5, draw: (ctx, x, y) => { for (let i = 0; i < 4; i++) drawProp(ctx, i === 2 ? 'fence_h_broken' : 'fence_h', '', 0, x - 24 + i * 16, y); } };
  if (t === '@fence_v') return { w: 8, h: 43, oy: 41.5, draw: (ctx, x, y) => { drawProp(ctx, 'fence_v', '', 0, x, y - 16); drawProp(ctx, 'fence_v', '', 0, x, y); } };
  if (t === '@wheel') return { w: 34, h: 34, oy: 32, draw: (ctx, x, y) => drawProp(ctx, 'waterwheel', '', 0, x, y, 1.1) }; // turned, to check its symmetry
  const s = propInfo(t, v, o).sprite;
  return { w: s.w, h: s.h, oy: s.oy, draw: (ctx, x, y) => drawProp(ctx, t, o, v, x - s.w / 2 + s.ox, y) };
}

function gallery() {
// ---------------------------------------------------------------- layout: a flow of labelled cells
const WORLD_W = 600;
const items = ITEMS.filter((it) => !only || only.includes(it[0]));
type Placed = { it: Item; c: Cell; x: number; y: number };
const placed: Placed[] = [];
let cx = 5, cy = 4, rowH = 0;
const row: Placed[] = [];
const flush = () => {
  for (const p of row) p.y = cy + rowH - (p.c.h - p.c.oy);
  cy += rowH + 9;
  row.length = 0;
  rowH = 0;
  cx = 5;
};
for (const it of items) {
  const c = cellOf(it);
  const lw = label(it).length * 1.75 + 2;
  const cw = Math.max(c.w, lw) + 4;
  if (cx + cw > WORLD_W - 3) flush();
  const p = { it, c, x: cx + cw / 2 - 2, y: 0 };
  placed.push(p);
  row.push(p);
  rowH = Math.max(rowH, c.h);
  cx += cw;
}
flush();
const gridH = cy;

// interior strip: map rows 0-2 are the wall (1-2 its face), the floor below
const RW = 37, RH = 6;
const roomY = gridH + 2;
const H = showRoom ? roomY + RH * 16 : gridH;

const c = document.getElementById('c') as HTMLCanvasElement;
c.width = WORLD_W * S;
c.height = Math.ceil(H * S);
const ctx = c.getContext('2d')!;
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
ctx.scale(S, S);
ctx.fillStyle = '#5a6e40';
ctx.fillRect(0, 0, WORLD_W, gridH);
for (let i = 0; i < 900; i++) {
  const x = (Math.sin(i * 12.9898) * 43758.5453) % 1, y = (Math.sin(i * 78.233) * 12543.123) % 1;
  ctx.fillStyle = i % 2 ? 'rgba(40,60,26,0.18)' : 'rgba(120,140,80,0.12)';
  ctx.beginPath(); ctx.ellipse(Math.abs(x) * WORLD_W, Math.abs(y) * gridH, 6, 3, 0, 0, Math.PI * 2); ctx.fill();
}
for (const p of placed) p.c.draw(ctx, p.x, p.y);
ctx.save();
ctx.setTransform(1, 0, 0, 1, 0, 0);
ctx.font = `${Math.round(S * 2.5)}px sans-serif`;
ctx.textAlign = 'center';
for (const p of placed) {
  const tx = p.x * S, ty = (p.y + (p.c.h - p.c.oy) + 3.6) * S;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillText(label(p.it), tx + 1, ty + 1);
  ctx.fillStyle = '#f4efe4';
  ctx.fillText(label(p.it), tx, ty);
}
ctx.restore();

if (showRoom) {
  const ground = new Uint8Array(RW * RH);
  for (let y = 0; y < RH; y++) for (let x = 0; x < RW; x++) {
    let t: number = y < 3 ? T.WALL_PLASTER : T.WOOD;
    if (x >= 26) t = y < 3 ? T.WALL_STONE : T.FLAGSTONE;
    ground[y * RW + x] = t;
  }
  const src = { w: RW, h: RH, ground, seed: 3, outdoor: false };
  const TR = 3;
  const tex = new TexCache(TR);
  const n = groundSize(TR);
  ctx.save();
  ctx.translate(0, roomY);
  ctx.beginPath(); ctx.rect(0, 0, RW * 16, RH * 16); ctx.clip();
  for (let ccy = 0; ccy < Math.ceil(RH / CHUNK); ccy++) for (let ccx = 0; ccx < Math.ceil(RW / CHUNK); ccx++) {
    const out = new Uint32Array(n * n);
    renderGround(src, ccx, ccy, TR, tex, out);
    const img = new ImageData(new Uint8ClampedArray(out.buffer), n, n);
    const tmp = document.createElement('canvas'); tmp.width = n; tmp.height = n;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    const m = 1 / TR;
    ctx.drawImage(tmp, ccx * 128 - m, ccy * 128 - m, 128 + 2 * m, 128 + 2 * m);
  }
  // wall props sit on the lower face row, 2 units up (as Room.wallProp does)
  const wallY = 2 * 16 + 15 - 2;
  const wall: [string, number, string?][] = [['window', 1, 'day'], ['shelf', 3], ['fireplace', 6, 'pot'], ['hanging_herbs', 9], ['bookshelf', 11], ['banner', 13, CLOTH.green], ['window', 15, 'night'], ['weaponrack', 17], ['torch', 19], ['hanging_herbs', 21], ['fireplace', 24], ['banner', 28, CLOTH.black], ['window', 30, 'day'], ['shelf', 33]];
  const floor: [string, number, number, string?, number?, number?][] = [
    ['bed', 1, 5, CLOTH.woad], ['chair', 4, 3], ['table', 5, 3, 'meal'], ['bench', 5, 4], ['candle', 5, 3, '', 4, -12], ['chest', 8, 4], ['barrel', 10, 3], ['sack', 11, 3, 'flour'],
    ['bed_straw', 13, 5, CLOTH.undyed], ['rug', 16, 5, CLOTH.crimson], ['stool', 15, 3], ['cauldron', 20, 4, 'brew'], ['alchemy', 23, 4],
    ['altar', 30, 3], ['candelabra', 27, 3], ['candelabra', 34, 3], ['pew', 29, 5, '', 8], ['pew', 33, 5, '', 8], ['lectern', 27, 5],
  ];
  const draws: { y: number; f: () => void }[] = [];
  for (const [t, fx, o] of wall) draws.push({ y: wallY, f: () => drawProp(ctx, t, o ?? '', 0, fx * 16 + 8, wallY) });
  for (const [t, fx, fy, o, dx, dy] of floor) {
    const x = fx * 16 + 8 + (dx ?? 0), y = fy * 16 + 15 + (dy ?? 0);
    draws.push({ y: t === 'rug' ? -1e9 : y, f: () => drawProp(ctx, t, o ?? '', 0, x, y) });
  }
  draws.sort((a, b) => a.y - b.y).forEach((d) => d.f());
  ctx.restore();
}
}

// ---------------------------------------------------------------- a real map from the game's content
// ?map=hb_home[&x0=..&y0=..&w=..&h=..][&night=1][&hour=..]
async function renderMap(id: string) {
  const { registerWorld } = await import('../src/content/world/overworld');
  const { registerVillageInteriors } = await import('../src/content/world/interiors_village');
  const { registerTownInteriors } = await import('../src/content/world/interiors_town');
  const { getMap } = await import('../src/world/world');
  const lighting = await import('../src/engine/lighting');
  registerWorld(); registerVillageInteriors(); registerTownInteriors();
  const m = getMap(id);
  const x0 = +(q.get('x0') || 0), y0 = +(q.get('y0') || 0);
  const w = +(q.get('w') || m.w), h = +(q.get('h') || m.h);
  const c = document.getElementById('c') as HTMLCanvasElement;
  c.width = w * 16 * S; c.height = h * 16 * S;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.setTransform(S, 0, 0, S, -x0 * 16 * S, -y0 * 16 * S);
  const src = { w: m.w, h: m.h, ground: m.ground, seed: m.seed, outdoor: m.outdoor };
  const TR = 3, tex = new TexCache(TR), n = groundSize(TR);
  for (let ccy = Math.floor(y0 / CHUNK); ccy <= Math.floor((y0 + h - 1) / CHUNK); ccy++) for (let ccx = Math.floor(x0 / CHUNK); ccx <= Math.floor((x0 + w - 1) / CHUNK); ccx++) {
    const out = new Uint32Array(n * n);
    renderGround(src, ccx, ccy, TR, tex, out);
    const img = new ImageData(new Uint8ClampedArray(out.buffer), n, n);
    const tmp = document.createElement('canvas'); tmp.width = n; tmp.height = n;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    const mm = 1 / TR;
    ctx.drawImage(tmp, ccx * 128 - mm, ccy * 128 - mm, 128 + 2 * mm, 128 + 2 * mm);
  }
  const objs = m.objects.filter((o) => o.sprite && !o.hidden && o.x > x0 * 16 - 64 && o.x < (x0 + w) * 16 + 64 && o.y > y0 * 16 - 16 && o.y < (y0 + h) * 16 + 80);
  for (const o of objs) if (o.flat) drawSprite(ctx, o.sprite!, o.x, o.y, 1, o.flip);
  for (const o of objs.filter((o) => !o.flat).sort((a, b) => a.y - b.y)) {
    const s = o.sprite!;
    if (o.anim === 'wheel') { ctx.save(); ctx.translate(o.x, o.y - s.oy + s.h / 2); ctx.rotate(0.35); ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h); ctx.restore(); } // as the renderer does
    else drawSprite(ctx, s, o.x, o.y, 1, o.flip);
    if (fire) {
      if (o.anim === 'bigfire') drawFire(ctx, o.x, o.y - 6, 18);
      else if (o.anim === 'fire' && o.light) drawFire(ctx, o.x + o.light.x, o.y + o.light.y + 5, 5);
      else if (o.anim === 'candle' && o.light && o.type === 'candle') drawFire(ctx, o.x, o.y - 7, 2);
    }
  }
  if (q.get('night') === '1') {
    const hour = +(q.get('hour') || 23);
    const L = lighting as unknown as Record<string, (...a: unknown[]) => unknown>;
    const ambient = m.outdoor ? L.skyLight(hour) : L.roomLight(hour, m.ambient);
    const lights = objs.filter((o) => o.light).map((o) => ({ x: o.x + o.light!.x, y: o.y + o.light!.y, r: o.light!.r * 1.25, color: o.light!.color, intensity: o.light!.intensity ?? 0.8, flicker: o.light!.flicker }));
    ctx.setTransform(S, 0, 0, S, 0, 0);
    L.applyLightMap(ctx, w * 16, h * 16, x0 * 16, y0 * 16, ambient, lights, 1.3, { vignette: 0 });
    L.drawGlows(ctx, w * 16, h * 16, x0 * 16, y0 * 16, lights, 1.3, 0.8);
  }
}

if (mapId) void renderMap(mapId).then(() => { (window as unknown as { __ready: boolean }).__ready = true; });
else { gallery(); (window as unknown as { __ready: boolean }).__ready = true; }
