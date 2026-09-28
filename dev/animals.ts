// Preview of every animal look in every direction and frame, at game scale.
// ?s=3 scale, ?only=crumb,wolf  ?walk=1 (show the smooth walk cycle)  ?w=1800 page width
// ?mode=scene (animals scattered on grass with their contact shadows)
// ?cols=idle,attack,dead,sit,lie,walkA,walkB (subset of frames)
import { drawAnimal, ANIMAL_LOOKS, AFRAME, WALK_FRAMES, getAnimalSheet } from '../src/gfx/animals';

const qs = new URLSearchParams(location.search);
const S = +(qs.get('s') || 3);
const PW = +(qs.get('w') || 1800);
const keys = (qs.get('only') || Object.keys(ANIMAL_LOOKS).join(',')).split(',').filter((k) => ANIMAL_LOOKS[k]);
const walk = qs.get('walk') === '1';
const mode = qs.get('mode') || 'grid';
const dirs = ['down', 'left', 'right', 'up'];
type F = [string, number, number | undefined];
const frames: F[] = walk
  ? Array.from({ length: WALK_FRAMES }, (_, i) => [`w${i}`, AFRAME.WALK_A, i / WALK_FRAMES] as F)
  : [['idle', AFRAME.IDLE, undefined], ['walk A', AFRAME.WALK_A, undefined], ['walk B', AFRAME.WALK_B, undefined], ['attack', AFRAME.ATTACK, undefined], ['dead', AFRAME.DEAD, undefined], ['sit', AFRAME.SIT, undefined], ['lie', AFRAME.LIE, undefined]];

const colsQ = qs.get('cols');
if (colsQ) {
  const want = colsQ.split(',');
  for (let i = frames.length - 1; i >= 0; i--) if (!want.includes(frames[i][0].replace(' ', ''))) frames.splice(i, 1);
}
const c = document.getElementById('c') as HTMLCanvasElement;
const ctx = c.getContext('2d')!;
const t0 = performance.now();
const sheets = keys.map((k) => getAnimalSheet(ANIMAL_LOOKS[k]));
const tPaint = performance.now() - t0;

function hitW(k: string) {
  const sp = ANIMAL_LOOKS[k].species;
  return k === 'crumb' ? 10 : sp === 'horse' || sp === 'cow' ? 20 : sp === 'hare' || sp === 'chicken' || sp === 'goose' ? 6 : 12;
}
function shadow(k: string, x: number, y: number) {
  const w = Math.min(22, hitW(k) + 8);
  const g = ctx.createRadialGradient(x, y, 0, x, y, w / 2);
  g.addColorStop(0, 'rgba(12,8,6,0.42)');
  g.addColorStop(1, 'rgba(12,8,6,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, w / 2, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
}
function grass(w: number, h: number) {
  ctx.fillStyle = '#4b5e3a';
  ctx.fillRect(0, 0, w, h);
  // soft mottling so the painted edges can be judged against a real-ish ground
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < (w * h) / 60; i++) {
    ctx.fillStyle = r() < 0.5 ? 'rgba(90,120,60,0.25)' : 'rgba(40,58,30,0.25)';
    ctx.beginPath();
    ctx.ellipse(r() * w, r() * h, 1 + r() * 4, 0.6 + r() * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

if (mode === 'scene') {
  const W = PW / S, H = 420;
  c.width = W * S; c.height = H * S;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(S, S);
  grass(W, H);
  const items: [string, number, number, number, number][] = [];
  keys.forEach((k, i) => {
    const x = 40 + (i % 8) * ((W - 60) / 8), y = 70 + Math.floor(i / 8) * 110;
    items.push([k, x, y, i % 4, AFRAME.IDLE]);
    items.push([k, x + 18, y + 45, (i + 1) % 4, i % 3 === 0 ? AFRAME.WALK_A : i % 3 === 1 ? AFRAME.SIT : AFRAME.WALK_B]);
  });
  items.sort((a, b) => a[2] - b[2]).forEach(([k, x, y, d, f]) => {
    if (f !== AFRAME.SIT && f !== AFRAME.LIE && f !== AFRAME.DEAD) shadow(k, x, y);
    drawAnimal(ctx, ANIMAL_LOOKS[k], d, f, x, y);
  });
} else {
  // lay out one block per look: rows = directions, columns = frames
  const gap = 4, lab = 7;
  const blocks = keys.map((k, i) => ({ k, w: frames.length * (sheets[i].fw + gap) + 30, h: 4 * (sheets[i].fh + gap) + lab + 6, fw: sheets[i].fw, fh: sheets[i].fh }));
  const maxW = PW / S;
  let x = 0, y = 0, rowH = 0;
  const pos: [number, number][] = [];
  for (const b of blocks) {
    if (x > 0 && x + b.w > maxW) { x = 0; y += rowH; rowH = 0; }
    pos.push([x, y]);
    x += b.w; rowH = Math.max(rowH, b.h);
  }
  const W = maxW, H = y + rowH + 4;
  c.width = Math.ceil(W * S); c.height = Math.ceil(H * S);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(S, S);
  grass(W, H);
  const t1 = performance.now();
  blocks.forEach((b, i) => {
    const [bx, by] = pos[i];
    ctx.fillStyle = '#f0e8d0';
    ctx.font = '5px sans-serif';
    ctx.fillText(b.k, bx + 2, by + 5);
    frames.forEach(([name, f], fi) => {
      ctx.fillStyle = 'rgba(240,232,208,0.7)';
      ctx.font = '3px sans-serif';
      ctx.fillText(name, bx + 28 + fi * (b.fw + gap), by + lab + 2);
    });
    dirs.forEach((dn, d) => {
      const cy = by + lab + 4 + d * (b.fh + gap);
      ctx.fillStyle = 'rgba(240,232,208,0.7)';
      ctx.font = '3px sans-serif';
      ctx.fillText(dn, bx + 2, cy + b.fh / 2);
      frames.forEach(([, f, ph], fi) => {
        const cx = bx + 28 + fi * (b.fw + gap);
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.lineWidth = 0.25;
        ctx.strokeRect(cx, cy, b.fw, b.fh);
        const sh = sheets[i] as unknown as { fw: number; fh: number };
        void sh;
        // ground point: use the same anchor drawAnimal uses by drawing at the cell's anchor
        const ax = (ANIMAL_ANCHOR(b.k) as [number, number]);
        const gx = cx + ax[0], gy = cy + ax[1];
        if (f !== AFRAME.SIT && f !== AFRAME.LIE && f !== AFRAME.DEAD) shadow(b.k, gx, gy);
        drawAnimal(ctx, ANIMAL_LOOKS[b.k], d, f, gx, gy, 0, 1, ph);
      });
    });
  });
  console.log(`canvas ${c.width}x${c.height}  paint ${tPaint.toFixed(0)}ms  draw ${(performance.now() - t1).toFixed(0)}ms`);
}

// anchor of a look's cell (read through a probe draw on a scratch canvas)
function ANIMAL_ANCHOR(k: string): [number, number] {
  const cache = (ANIMAL_ANCHOR as unknown as { m?: Map<string, [number, number]> }).m ||= new Map();
  const hit = cache.get(k);
  if (hit) return hit;
  // drawImage(cell, x - ax, y - ay, fw, fh): probe with a recording context
  let rec: [number, number] = [0, 0];
  const probe = {
    globalAlpha: 1, fillStyle: '', createRadialGradient: () => ({ addColorStop() {} }), beginPath() {}, ellipse() {}, fill() {},
    drawImage: (...a: number[]) => { rec = a.length === 5 ? [-a[1], -a[2]] : [-a[5], -a[6]]; },
  } as unknown as CanvasRenderingContext2D;
  drawAnimal(probe, ANIMAL_LOOKS[k], 0, AFRAME.IDLE, 0, 0);
  cache.set(k, rec);
  return rec;
}
