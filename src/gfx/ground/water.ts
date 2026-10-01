// Animated water surface drawn over the ground chunks each frame: drifting
// sun glints and slow ripple arcs, kept out of the shade under the banks.

import { T } from '../../world/terrain';
import { hash2i } from '../../engine/util';

interface WaterMap { w: number; h: number; get(tx: number, ty: number): number; outdoor: boolean }

const isW = (t: number) => t === T.WATER || t === T.DEEP || t === T.FORD;

let ripple: HTMLCanvasElement | null = null;
/** A tileable sheet of soft, wavy highlights (64 units, 4 texels per unit). */
function rippleTex(): HTMLCanvasElement {
  if (ripple) return ripple;
  const N = 256, k = 4;
  ripple = document.createElement('canvas');
  ripple.width = ripple.height = N;
  const g = ripple.getContext('2d')!;
  g.scale(k, k);
  g.lineCap = 'round';
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 46; i++) {
    const x = rnd() * 64, y = rnd() * 64, L = 4 + rnd() * 9, a = rnd() * 0.5 + 0.35;
    for (const [dx, dy] of [[0, 0], [-64, 0], [64, 0], [0, -64], [0, 64]]) {
      g.strokeStyle = `rgba(220,238,245,${a})`;
      g.lineWidth = 0.35 + rnd() * 0.35;
      g.beginPath();
      g.moveTo(x + dx - L / 2, y + dy);
      g.quadraticCurveTo(x + dx, y + dy - 1.2, x + dx + L / 2, y + dy);
      g.stroke();
    }
  }
  return ripple;
}
let pattern: CanvasPattern | null = null;

export function drawWaterFx(ctx: CanvasRenderingContext2D, map: WaterMap, x0: number, y0: number, x1: number, y1: number, time: number) {
  const tx0 = Math.max(0, Math.floor(x0 / 16)), ty0 = Math.max(0, Math.floor(y0 / 16));
  const tx1 = Math.min(map.w - 1, Math.floor(x1 / 16)), ty1 = Math.min(map.h - 1, Math.floor(y1 / 16));
  ctx.save();
  // slow ripples drifting over open water (not in the shallows by the banks)
  if (!pattern) pattern = ctx.createPattern(rippleTex(), 'repeat');
  if (pattern) {
    const m = new DOMMatrix();
    m.translateSelf((time * 3.2) % 64, (time * 1.1) % 64);
    m.scaleSelf(0.25, 0.25);
    pattern.setTransform(m);
    ctx.fillStyle = pattern;
    ctx.globalAlpha = 0.22;
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (!isW(map.get(tx, ty)) || !isW(map.get(tx - 1, ty)) || !isW(map.get(tx + 1, ty)) || !isW(map.get(tx, ty - 1)) || !isW(map.get(tx, ty + 1))) continue;
      ctx.fillRect(tx * 16, ty * 16 + 2, 16, 16);
    }
    ctx.globalAlpha = 1;
  }
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const t = map.get(tx, ty);
    if (!isW(t)) continue;
    const bankAbove = !isW(map.get(tx, ty - 1));
    const k = hash2i(tx, ty, 99);
    for (let n = 0; n < 2; n++) {
      const kk = (k >>> (n * 11)) & 2047;
      const phase = (time * (0.22 + (kk % 7) * 0.03) + kk / 2048) % 1;
      const a = Math.sin(phase * Math.PI);
      const gx = tx * 16 + ((kk * 7) % 13) + 1.5 + phase * 3;
      const gy = ty * 16 + ((kk >> 4) % 14) + 1;
      if (bankAbove && gy - ty * 16 < 6) continue;
      ctx.globalAlpha = a * a * (t === T.FORD ? 0.35 : 0.5);
      ctx.fillStyle = '#eef6f8';
      ctx.beginPath();
      ctx.ellipse(gx, gy, 1.2 + a * 1.6, 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // a slow ripple arc
    const ph = (time * 0.12 + (k & 1023) / 1024) % 1;
    const ry = ty * 16 + ((k >> 12) % 12) + 2;
    if (!(bankAbove && ry - ty * 16 < 6)) {
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.16;
      ctx.strokeStyle = '#d8ecf0';
      ctx.lineWidth = 0.35;
      ctx.beginPath();
      const rx = tx * 16 + 8 + ((k >> 20) % 5) - 2;
      ctx.ellipse(rx, ry, 2 + ph * 5, 0.6 + ph * 1.2, 0, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    }
  }
  ctx.restore();
}
