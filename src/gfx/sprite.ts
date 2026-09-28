// Shared sprite type + cache used by every procedural object painter.

import { PixelBuffer, makeCanvas } from './pixel';

export interface Sprite {
  /** The painted image; may be at a higher resolution than w x h (see ART). */
  canvas: HTMLCanvasElement;
  /** Offset from the object's base point (feet / bottom-centre) to the top-left corner, in world units. */
  ox: number;
  oy: number;
  /** Size in world units. */
  w: number;
  h: number;
  /** Soft silhouette used for cast shadows (lazily made). */
  shadow?: HTMLCanvasElement | null;
  /** Fraction of the sprite's height that casts a shadow from its base (default: all). */
  shadowFrom?: number;
  /** Split layers for wind sway: `top` bends around `pivot` (world units from the top). */
  parts?: { base: HTMLCanvasElement; top: HTMLCanvasElement; pivot: number; sway: number };
}

const cache = new Map<string, Sprite>();

/**
 * A sprite painted on first use: touching any of its fields paints it. Maps
 * hold hundreds of these, so only what comes near the camera gets painted.
 */
export function lazySprite(make: () => Sprite): Sprite {
  let real: Sprite | null = null;
  const get = () => real || (real = make());
  const lazy = {
    get canvas() { return get().canvas; },
    get ox() { return get().ox; },
    get oy() { return get().oy; },
    get w() { return get().w; },
    get h() { return get().h; },
    get parts() { return get().parts; },
    get shadow() { return get().shadow; },
    set shadow(v: HTMLCanvasElement | null | undefined) { get().shadow = v; },
    get shadowFrom() { return get().shadowFrom; },
    get painted() { return !!real; },
    paint() { get(); },
  };
  return lazy as unknown as Sprite;
}

/** True unless the sprite is lazy and still unpainted. */
export function isPainted(s: Sprite): boolean {
  const l = s as unknown as { painted?: boolean };
  return l.painted !== false;
}
export function paintNow(s: Sprite) {
  (s as unknown as { paint?: () => void }).paint?.();
}

export function cachedSprite(key: string, make: () => Sprite): Sprite {
  let s = cache.get(key);
  if (!s) {
    s = lazySprite(make);
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

/** Draws a sprite whose top layer bends in the wind by `bend` (a shear factor). */
export function drawSwaying(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, bend: number, alpha = 1, flip = false) {
  const p = s.parts;
  if (!p) { drawSprite(ctx, s, x, y, alpha, flip); return; }
  if (alpha <= 0) return;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.translate(x - s.ox + (flip ? s.w : 0), y - s.oy);
  if (flip) ctx.scale(-1, 1);
  ctx.drawImage(p.base, 0, 0, s.w, s.h);
  // shear the crown about its pivot line
  const k = (flip ? -bend : bend) * p.sway;
  ctx.transform(1, 0, k, 1, -k * p.pivot, 0);
  ctx.drawImage(p.top, 0, 0, s.w, s.h);
  ctx.restore();
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, alpha = 1, flip = false) {
  if (alpha <= 0) return;
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save();
    ctx.translate(x - s.ox + s.w, y - s.oy);
    ctx.scale(-1, 1);
    ctx.drawImage(s.canvas, 0, 0, s.w, s.h);
    ctx.restore();
  } else {
    ctx.drawImage(s.canvas, x - s.ox, y - s.oy, s.w, s.h);
  }
  if (alpha < 1) ctx.globalAlpha = 1;
}

export { makeCanvas };
