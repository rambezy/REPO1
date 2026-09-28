// Shared sprite type + cache used by every procedural object painter.

import { PixelBuffer, makeCanvas } from './pixel';

export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Offset from the object's base point (feet / bottom-centre) to the top-left corner. */
  ox: number;
  oy: number;
  w: number;
  h: number;
}

const cache = new Map<string, Sprite>();

export function cachedSprite(key: string, make: () => Sprite): Sprite {
  let s = cache.get(key);
  if (!s) {
    s = make();
    cache.set(key, s);
  }
  return s;
}

export function spriteFromBuffer(b: PixelBuffer, ox: number, oy: number): Sprite {
  return { canvas: b.toCanvas(), ox, oy, w: b.w, h: b.h };
}

export function spriteFromCanvas(c: HTMLCanvasElement, ox: number, oy: number): Sprite {
  return { canvas: c, ox, oy, w: c.width, h: c.height };
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, alpha = 1, flip = false) {
  if (alpha <= 0) return;
  if (alpha < 1) ctx.globalAlpha = alpha;
  const dx = Math.round(x - s.ox), dy = Math.round(y - s.oy);
  if (flip) {
    ctx.save();
    ctx.translate(dx + s.w, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(s.canvas, 0, 0);
    ctx.restore();
  } else {
    ctx.drawImage(s.canvas, dx, dy);
  }
  if (alpha < 1) ctx.globalAlpha = 1;
}

export { makeCanvas };
