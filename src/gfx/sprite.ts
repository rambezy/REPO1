// Shared sprite type + cache used by every procedural object painter.


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
  /**
   * Split layers for wind sway: `top` bends around `pivot` (world units from
   * the top). Each layer is cropped to its paint; `b` and `t` give where it
   * sits inside the sprite as [x, y, w, h] in world units.
   */
  parts?: { base: HTMLCanvasElement; top: HTMLCanvasElement; pivot: number; sway: number; b: number[]; t: number[] };
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


export function spriteFromCanvas(c: HTMLCanvasElement, ox: number, oy: number): Sprite {
  return { canvas: c, ox, oy, w: c.width, h: c.height };
}

/** Draws a sprite whose top layer bends in the wind by `bend` (a shear factor). */
export function drawSwaying(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, bend: number, alpha = 1, flip = false) {
  const p = s.parts;
  if (!p) { drawSprite(ctx, s, x, y, alpha, flip); return; }
  if (alpha <= 0) return;
  // transforms are set outright (no save/restore: it costs more than the draw)
  const m = ctx.getTransform();
  if (alpha < 1) ctx.globalAlpha = alpha;
  const X = x - s.ox + (flip ? s.w : 0), Y = y - s.oy, fx = flip ? -1 : 1;
  const A = m.a * fx, B = m.b * fx, C = m.c, D = m.d;
  const E = m.a * X + m.c * Y + m.e, F = m.b * X + m.d * Y + m.f;
  ctx.setTransform(A, B, C, D, E, F);
  ctx.drawImage(p.base, p.b[0], p.b[1], p.b[2], p.b[3]);
  // shear the crown about its pivot line
  const k = (flip ? -bend : bend) * p.sway;
  ctx.setTransform(A, B, A * k + C, B * k + D, E - A * k * p.pivot, F - B * k * p.pivot);
  ctx.drawImage(p.top, p.t[0], p.t[1], p.t[2], p.t[3]);
  ctx.setTransform(m);
  if (alpha < 1) ctx.globalAlpha = 1;
}

export function drawSprite(ctx: CanvasRenderingContext2D, s: Sprite, x: number, y: number, alpha = 1, flip = false) {
  if (alpha <= 0) return;
  if (alpha < 1) ctx.globalAlpha = alpha;
  if (flip) {
    const m = ctx.getTransform();
    const X = x - s.ox + s.w, Y = y - s.oy;
    ctx.setTransform(-m.a, -m.b, m.c, m.d, m.a * X + m.c * Y + m.e, m.b * X + m.d * Y + m.f);
    ctx.drawImage(s.canvas, 0, 0, s.w, s.h);
    ctx.setTransform(m);
  } else {
    ctx.drawImage(s.canvas, x - s.ox, y - s.oy, s.w, s.h);
  }
  if (alpha < 1) ctx.globalAlpha = 1;
}

