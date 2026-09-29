// Painted people. A `Look` is turned into a set of painted body parts per
// facing (head, torso, skirt, arms, legs, cape, hair behind), cached at high
// resolution, and posed every frame with continuous animation: walking with
// swinging arms and legs, breathing, blinking, attacks aimed where the
// weapon goes, sitting, crouching and lying down.

import { RNG, clamp } from '../engine/util';
import { P, SKIN, SkinTone } from './palette';
import type { Look } from './characters';
import { artCanvas, ART, lit, dim, mix, rgba, ellipse, poly, lin, rad, blade, roundRect, newCanvas, silhouette, rim, Ctx } from './paint';

type G = Ctx;

// ================================================================ geometry

export interface Body {
  child: boolean;
  scale: number;       // overall size (children are smaller)
  hipY: number;        // hip joint height (negative = up)
  shoulderY: number;
  headY: number;       // head centre
  headR: number;
  sw: number;          // half shoulder width
  ww: number;          // half waist width
  hw: number;          // half hip width
  legX: number;        // hip joint offset from centre
  legW: number;        // leg thickness
  armW: number;        // arm thickness
  armL: number;        // shoulder to wrist
  legL: number;        // hip to sole
  hemY: number;        // tunic hem height
  depth: number;       // half body depth in profile
  belly: number;       // extra front bulge
}

export function bodyOf(look: Look): Body {
  const build = look.build || 'normal';
  if (build === 'child') {
    return { child: true, scale: 0.72, hipY: -7, shoulderY: -11.6, headY: -15.4, headR: 4.05, sw: 3.5, ww: 2.9, hw: 3, legX: 1.5, legW: 2.1, armW: 1.7, armL: 5.2, legL: 7, hemY: -4.4, depth: 2.2, belly: 0 };
  }
  const b: Body = { child: false, scale: 1, hipY: -9.6, shoulderY: -16.1, headY: -20.4, headR: 4.25, sw: 4.6, ww: 3.6, hw: 3.8, legX: 1.95, legW: 2.55, armW: 2.15, armL: 7.3, legL: 9.6, hemY: -5.8, depth: 2.7, belly: 0 };
  if (build === 'broad') { b.sw = 5.4; b.ww = 4.3; b.hw = 4.3; b.legX = 2.2; b.legW = 2.9; b.armW = 2.6; b.depth = 3.1; b.shoulderY -= 0.3; b.headY -= 0.3; }
  if (build === 'thin') { b.sw = 3.95; b.ww = 3; b.hw = 3.2; b.legW = 2.2; b.armW = 1.85; b.depth = 2.3; b.legX = 1.75; }
  if (build === 'fat') { b.sw = 5; b.ww = 5.1; b.hw = 4.8; b.legX = 2.3; b.legW = 2.9; b.armW = 2.5; b.depth = 3.6; b.belly = 1.4; }
  if (look.female) { b.sw -= 0.45; b.hw += 0.2; b.headR -= 0.1; }
  if (look.old) { b.headY += 0.4; b.shoulderY += 0.3; }
  return b;
}

// ================================================================ palette per look

interface Pal {
  skin: string[]; // dark .. light
  hair: string; hairD: string; hairL: string;
  shirt: string; outer: string; trim: string; legs: string; boots: string; belt: string;
  sleeve: string; torso: string; hand: string;
}

function palOf(look: Look): Pal {
  const sk = SKIN[look.skin as SkinTone] || SKIN.fair;
  const outer = look.outer || 'none';
  const oc = look.outerColor || look.shirt;
  const metal = outer === 'mail' || outer === 'tabard' ? '#7c858e' : outer === 'plate' ? '#a2acb6' : null;
  const sleeve = outer === 'mail' || outer === 'tabard' || outer === 'plate' ? (metal as string)
    : outer === 'gambeson' || outer === 'brigandine' || outer === 'leather' || outer === 'robe' || outer === 'noble' || outer === 'dress' ? oc
    : look.shirt;
  return {
    skin: sk,
    hair: look.hair, hairD: dim(look.hair, 0.4), hairL: lit(look.hair, 0.35),
    shirt: look.shirt, outer: oc, trim: look.trim || P.gold2, legs: look.legs, boots: look.boots, belt: look.belt || '#3a2616',
    sleeve, torso: outer === 'none' || outer === 'apron' || outer === 'vest' ? look.shirt : oc,
    hand: outer === 'plate' ? '#8e98a2' : sk[2],
  };
}

// ================================================================ part cache

interface Part { c: HTMLCanvasElement; w: number; h: number; px: number; py: number; white?: HTMLCanvasElement }
interface PartSet {
  head: Part; headShut: Part; hairBack: Part | null; torso: Part; skirt: Part | null; cape: Part | null;
  armFar: Part; armNear: Part; thigh: Part; shin: Part; leg: Part;
}

const cache = new Map<string, PartSet[]>();

/** Paints a part of w x h world units whose pivot is (px, py). */
function part(w: number, h: number, px: number, py: number, paint: (g: G) => void, outline = 0.55): Part {
  const { c, g } = artCanvas(w, h);
  g.translate(px, py);
  paint(g);
  if (outline > 0) rim(c, '#1a120c', outline, 1);
  return { c, w, h, px, py };
}
function whiteOf(p: Part): HTMLCanvasElement {
  if (!p.white) p.white = silhouette(p.c, '#fff8ee');
  return p.white;
}

function partsFor(look: Look): PartSet[] {
  const key = JSON.stringify(look);
  let v = cache.get(key);
  if (!v) {
    const b = bodyOf(look), pal = palOf(look);
    v = [0, 1, 3].map((d) => makeParts(look, b, pal, d as 0 | 1 | 3));
    cache.set(key, v);
  }
  return v;
}

// ================================================================ drawing API

export type PersonPose = 'idle' | 'walk' | 'windup' | 'strike' | 'block' | 'hurt' | 'dead' | 'sit' | 'crouch' | 'work' | 'lie' | 'sleep';

export interface PersonState {
  dir: number;            // 0 down, 1 left, 2 right, 3 up
  pose: PersonPose;
  t: number;              // seconds (animation clock)
  running?: boolean;
  crouching?: boolean;
  /** weapon arm aim in radians (screen space) while fighting or working */
  aim?: number | null;
  /** 0..1: how far the arm reaches toward `aim` */
  reach?: number;
  /** body weight shift for attacks: negative leans back, positive into the blow */
  lunge?: number;
  flash?: number;
  alpha?: number;
  seed?: number;          // per-actor offset for blinking/breathing
  /** out: where the weapon hand ended up */
  hand?: { x: number; y: number };
}

const BLINK = 4.3;

let off: HTMLCanvasElement | null = null;

/** Draws a person with feet at (x, y) in world units. */
export function drawPerson(ctx: CanvasRenderingContext2D, look: Look, st: PersonState, x: number, y: number) {
  const alpha = st.alpha ?? 1;
  if (alpha <= 0) return;
  if (alpha < 0.99) {
    // draw into an offscreen layer first so overlapping parts don't show through
    const k = ART;
    const W = 40, H = 40;
    if (!off) off = newCanvas(W * k, H * k);
    const og = off.getContext('2d')!;
    og.setTransform(1, 0, 0, 1, 0, 0);
    og.clearRect(0, 0, off.width, off.height);
    og.setTransform(k, 0, 0, k, (W / 2) * k, (H - 6) * k);
    const hand = st.hand;
    drawPersonAt(og, look, { ...st, alpha: 1, hand: undefined }, 0, 0);
    if (hand) { hand.x = x; hand.y = y - 11; }
    ctx.globalAlpha = alpha;
    ctx.drawImage(off, x - W / 2, y - (H - 6), W, H);
    ctx.globalAlpha = 1;
    return;
  }
  drawPersonAt(ctx, look, st, x, y);
}

/** How long a reaching arm looks: cocked at the shoulder (0) to fully out (1). */
const armLen = (reach: number) => 0.6 + clamp(reach, 0, 1.1) * 0.42;

function drawPersonAt(ctx: CanvasRenderingContext2D, look: Look, st: PersonState, x: number, y: number) {
  const b = bodyOf(look);
  const sets = partsFor(look);
  const pose = st.pose;
  if (pose === 'dead' || pose === 'lie' || pose === 'sleep') { drawLying(ctx, sets[0], b, st, x, y); return; }
  const flip = st.dir === 2;
  const set = st.dir === 0 ? sets[0] : st.dir === 3 ? sets[2] : sets[1];
  const view = st.dir === 0 ? 0 : st.dir === 3 ? 3 : 1;
  const seed = st.seed ?? 0;
  const blink = ((st.t + seed * 0.37) % BLINK) < 0.13;
  const walking = pose === 'walk';
  const rate = st.crouching ? 1.3 : st.running ? 2.75 : 1.9;
  const ph = walking ? ((st.t + seed * 0.11) * rate) % 1 : 0;
  const s2 = Math.sin(ph * Math.PI * 2);
  const c2 = Math.cos(ph * Math.PI * 2);
  const breathe = walking ? 0 : Math.sin((st.t + seed) * 2.1) * 0.18;
  const stride = st.running ? 1.35 : 1;
  // body drop for crouch/sit and bounce while walking
  let drop = 0;
  if (pose === 'crouch' || st.crouching) drop = 2.6;
  if (pose === 'sit') drop = 4.2 * b.scale;
  const bounce = walking ? -Math.abs(c2) * 0.55 * stride + 0.3 : 0;
  const hurtLean = pose === 'hurt' ? 1 : 0;
  const lunge = st.lunge ?? 0;
  const lean = (pose === 'crouch' || st.crouching ? 1.2 : 0) + (st.running && walking ? 0.8 : 0) - hurtLean * 1.3 + lunge * 0.9;
  const sway = walking && view !== 1 ? s2 * 0.35 : 0;

  ctx.save();
  ctx.translate(x, y);
  if (flip) ctx.scale(-1, 1);
  if (pose === 'hurt') ctx.translate(0, 0.4);
  // dip a little into a blow, rise a little on the wind-up
  const bodyY = drop + bounce + lunge * 0.28;

  // ---- arm aims ----
  const hasAim = st.aim !== null && st.aim !== undefined;
  let aim = st.aim ?? 0;
  if (flip && hasAim) aim = Math.PI - aim; // mirror into the left-facing frame
  const reach = st.reach ?? 0.8;

  const draws: (() => void)[] = [];
  const P = (p: Part, px: number, py: number, rot = 0, sx = 1, sy = 1) => draws.push(() => blitPart(ctx, p, px, py, rot, sx, sy, st.flash ?? 0));

  // shoulder and hip joints (in the actor's local frame)
  const shY = b.shoulderY + bodyY + 0.2;
  const hipY = b.hipY + bodyY;
  const armSwing = walking ? -s2 * 0.42 * stride : pose === 'sit' ? 0.25 : 0;

  // which arm holds the weapon: the right arm (viewer's left in front view)
  const aimArm = (side: 'L' | 'R'): number | null => {
    if (!hasAim) return null;
    if (view === 1) return side === 'R' ? aim : null;
    return side === 'L' ? aim : null;
  };
  const armRot = (a: number) => a - Math.PI / 2; // parts hang down (+y) at rot 0

  if (view === 1) {
    // ---------- profile (facing left) ----------
    const legSwing = walking ? 0.46 * stride : 0;
    const farLeg = s2 * legSwing, nearLeg = -s2 * legSwing;
    const kneeBend = (sw: number, phase: number) => (walking ? Math.max(0, Math.sin(phase)) * 0.9 * stride : 0) + (pose === 'crouch' || st.crouching ? 0.9 : 0) + (pose === 'sit' ? 1.5 : 0) + Math.max(0, sw) * 0.2;
    const farArmA = aimArm('L');
    const nearArmA = aimArm('R');
    // far arm (behind body)
    if (farArmA === null) P(set.armFar, 0.4 + lean * 0.5, shY, armSwing * -1 + 0.05, 0.92, 0.95);
    else P(set.armFar, 0.4, shY, armRot(farArmA));
    // cape and far leg
    if (set.cape) P(set.cape, 1.2, shY - 0.4, walking ? 0.08 + Math.abs(s2) * 0.1 : 0.04);
    const legPos = (rot: number, bend: number, dx: number) => {
      P(set.thigh, dx, hipY, rot + (pose === 'sit' ? 1.35 : 0));
      const tl = b.legL * 0.48;
      const kx = dx - Math.sin(rot + (pose === 'sit' ? 1.35 : 0)) * tl, ky = hipY + Math.cos(rot + (pose === 'sit' ? 1.35 : 0)) * tl;
      P(set.shin, kx, ky, rot - bend + (pose === 'sit' ? 0 : 0));
    };
    if (!set.skirt) {
      legPos(farLeg * 0.9, kneeBend(farLeg, ph * Math.PI * 2 + Math.PI), 0.5);
      legPos(nearLeg, kneeBend(nearLeg, ph * Math.PI * 2), -0.2);
    } else {
      // long hem: only the feet show, pacing under it
      const fx = walking ? s2 * 1.6 * stride : 0;
      draws.push(() => bootProfile(ctx, look, b, -0.2 + fx, 0 + drop * 0.2, st.flash ?? 0));
      draws.push(() => bootProfile(ctx, look, b, 0.8 - fx, 0 - 0.2 + drop * 0.2, st.flash ?? 0));
    }
    if (set.hairBack) P(set.hairBack, 0.6 + lean, b.headY + bodyY + 0.2, walking ? Math.abs(s2) * 0.05 : 0);
    P(set.torso, lean * 0.4, hipY, -lean * 0.06);
    if (set.skirt) P(set.skirt, lean * 0.3, hipY + 0.4, walking ? s2 * 0.05 : 0, 1, pose === 'sit' ? 0.7 : 1);
    P(set.head, lean * 1.1 + (look.old ? -0.4 : 0), b.headY + bodyY + breathe * 0.4 + (look.old ? 0.3 : 0));
    const hand = st.hand;
    if (nearArmA === null) P(set.armNear, -0.1 + lean * 0.6, shY + breathe, armSwing, 1, 1);
    else {
      const a = nearArmA;
      P(set.armNear, -0.1, shY, armRot(a), 1, armLen(reach));
    }
    if (hand) {
      const sx = -0.1, sy = shY;
      const a = nearArmA ?? (Math.PI / 2 + armSwing);
      const L = b.armL * (nearArmA === null ? 1 : armLen(reach));
      const hx = sx + Math.cos(a) * L, hy = sy + Math.sin(a) * L;
      hand.x = x + (flip ? -hx : hx);
      hand.y = y + hy;
    }
  } else {
    // ---------- front (0) or back (3) ----------
    const back = view === 3;
    const lf = walking ? s2 * 1.1 * stride : 0; // + = left foot forward (down the screen)
    const liftL = walking ? Math.max(0, -c2) * 0.9 : 0;
    const liftR = walking ? Math.max(0, c2) * 0.9 : 0;
    const legScale = pose === 'sit' ? 0.62 : pose === 'crouch' || st.crouching ? 0.78 : 1;
    const armA = aimArm('L');
    // hair behind the shoulders (front view) or the cape (front view shows its edges)
    if (!back && set.cape) P(set.cape, 0, shY - 0.2);
    if (!back && set.hairBack) P(set.hairBack, sway * 0.5, b.headY + bodyY + breathe * 0.3);
    // arms behind the body when seen from the back are drawn later; from the front, first
    const armY = shY + breathe * 0.6;
    const lx = -b.sw + b.armW * 0.42, rx = b.sw - b.armW * 0.42;
    const armDraw = (side: 'L' | 'R') => {
      const ax = side === 'L' ? lx : rx;
      const a = aimArm(side);
      const p = side === 'L' ? set.armNear : set.armFar;
      const swing = (side === 'L' ? 1 : -1) * armSwing * (back ? -1 : 1);
      if (a === null) {
        // a forward swing foreshortens the arm and brings the hand in toward the body
        const k = 1 - Math.abs(swing) * 0.32;
        const inward = (side === 'L' ? 1 : -1) * (swing > 0 ? -swing * 0.3 : -swing * 0.12);
        P(p, ax + sway, armY - swing * 0.4, (side === 'L' ? 0.07 : -0.07) + inward + (pose === 'sit' ? (side === 'L' ? 0.25 : -0.25) : 0), 1, k);
      } else {
        const sy = armLen(reach);
        P(p, ax + sway, armY, armRot(a), 1, sy);
      }
      if (side === 'L' && st.hand) {
        const aa = a ?? Math.PI / 2;
        const L = b.armL * (a === null ? 1 : armLen(reach));
        const hx = ax + sway + Math.cos(aa) * L, hy = armY + Math.sin(aa) * L;
        st.hand.x = x + (flip ? -hx : hx);
        st.hand.y = y + hy;
      }
    };
    if (!back) {
      // legs
      if (!set.skirt) {
        // the stepping foot reaches toward the camera (lower, longer); the other trails and lifts
        const order = lf > 0 ? [1, -1] : [-1, 1];
        for (const side of order as (1 | -1)[]) {
          const f = side < 0 ? lf : -lf;
          const lift = side < 0 ? liftL : liftR;
          P(set.leg, side * b.legX + sway * 0.3, hipY + 0.2 + f * 0.25, 0, side < 0 ? 1 : -1, legScale * (1 + f * 0.09 - lift * 0.16));
        }
      } else {
        const fx = walking ? s2 * 0.9 : 0;
        draws.push(() => bootFront(ctx, look, b, -b.legX * 0.9, (walking ? Math.max(0, s2) * 0.8 : 0) + drop * 0.2, st.flash ?? 0));
        draws.push(() => bootFront(ctx, look, b, b.legX * 0.9, (walking ? Math.max(0, -s2) * 0.8 : 0) + drop * 0.2, st.flash ?? 0));
        void fx;
      }
      P(set.torso, sway, hipY + breathe * 0.2, 0, 1, 1 + breathe * 0.01);
      if (set.skirt) P(set.skirt, sway * 0.6, hipY + 0.4, walking ? s2 * 0.035 : 0, 1, pose === 'sit' ? 0.62 : 1);
      if (armA === null || armA > 0) armDraw('R'); // right arm (viewer's right) always behind the head layer
      P(set.head, sway, b.headY + bodyY + breathe * 0.5);
      if (blink && !st.flash) draws.push(() => blitPart(ctx, set.headShut, sway, b.headY + bodyY + breathe * 0.5, 0, 1, 1, 0));
      armDraw('L');
      if (!(armA === null || armA > 0)) armDraw('R');
    } else {
      // from behind: arms and legs first, then the body, hair and cape over them
      if (hasAim && aim < 0) armDraw('L');
      if (!set.skirt) {
        for (const side of [-1, 1] as const) {
          const f = side < 0 ? -lf : lf;
          const lift = side < 0 ? liftR : liftL;
          P(set.leg, side * b.legX + sway * 0.3, hipY + 0.2 + f * 0.2, 0, side < 0 ? 1 : -1, legScale * (1 + f * 0.07 - lift * 0.16));
        }
      } else {
        draws.push(() => bootFront(ctx, look, b, -b.legX * 0.9, (walking ? Math.max(0, -s2) * 0.6 : 0), st.flash ?? 0, true));
        draws.push(() => bootFront(ctx, look, b, b.legX * 0.9, (walking ? Math.max(0, s2) * 0.6 : 0), st.flash ?? 0, true));
      }
      armDraw('R');
      if (!(hasAim && aim < 0)) armDraw('L');
      P(set.torso, sway, hipY + breathe * 0.2);
      if (set.skirt) P(set.skirt, sway * 0.6, hipY + 0.4, walking ? s2 * 0.035 : 0, 1, pose === 'sit' ? 0.62 : 1);
      if (set.cape) P(set.cape, sway, shY - 0.3, 0, 1, walking ? 1 + Math.abs(s2) * 0.03 : 1);
      if (set.hairBack) P(set.hairBack, sway * 0.5, b.headY + bodyY + breathe * 0.3);
      P(set.head, sway, b.headY + bodyY + breathe * 0.5);
    }
  }
  frame = ctx.getTransform();
  for (const d of draws) d();
  frame = null;
  ctx.restore();
}

/** The person's own frame while its parts are drawn (saves a getTransform per part). */
let frame: DOMMatrix | null = null;

function blitPart(ctx: CanvasRenderingContext2D, p: Part, x: number, y: number, rot: number, sx: number, sy: number, flash: number) {
  // set frame * translate * rotate * scale outright: a save/restore pair per
  // part costs more than the drawing itself
  const m = frame ?? ctx.getTransform();
  const c = rot ? Math.cos(rot) : 1, s = rot ? Math.sin(rot) : 0;
  const la = c * sx, lb = s * sx, lc = -s * sy, ld = c * sy;
  ctx.setTransform(m.a * la + m.c * lb, m.b * la + m.d * lb, m.a * lc + m.c * ld, m.b * lc + m.d * ld, m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f);
  ctx.drawImage(p.c, -p.px, -p.py, p.w, p.h);
  if (flash > 0) {
    ctx.globalAlpha = Math.min(1, flash);
    ctx.drawImage(whiteOf(p), -p.px, -p.py, p.w, p.h);
    ctx.globalAlpha = 1;
  }
  ctx.setTransform(m);
}

// feet under long hems
function bootFront(ctx: G, look: Look, b: Body, x: number, lift: number, flash: number, back = false) {
  const w = b.legW * 1.15, h = 2.1;
  const col = flash > 0.5 ? '#fff8ee' : look.boots;
  ellipse(ctx, x, -h / 2 - lift + 0.4, w / 2, h / 2 + (back ? 0 : 0.3), lin(ctx, x - w / 2, 0, x + w / 2, 0, [[0, lit(col, 0.25)], [1, dim(col, 0.35)]]));
}
function bootProfile(ctx: G, look: Look, b: Body, x: number, y: number, flash: number) {
  const col = flash > 0.5 ? '#fff8ee' : look.boots;
  ctx.fillStyle = lin(ctx, 0, y - 2.2, 0, y, [[0, lit(col, 0.25)], [1, dim(col, 0.3)]]);
  ctx.beginPath();
  ctx.moveTo(x + 1.2, y - 2.3);
  ctx.lineTo(x + 1.2, y);
  ctx.lineTo(x - 2.4 * b.scale, y);
  ctx.quadraticCurveTo(x - 2.6 * b.scale, y - 1.3, x - 0.8, y - 1.6);
  ctx.lineTo(x - 0.6, y - 2.3);
  ctx.closePath();
  ctx.fill();
}

/** Lying on the back, head to the left: the dead, the sleeping, the wounded. */
function drawLying(ctx: CanvasRenderingContext2D, set: PartSet, b: Body, st: PersonState, x: number, y: number) {
  const sleep = st.pose === 'sleep';
  ctx.save();
  ctx.translate(x, y - 3);
  if (sleep) {
    // head and shoulders above the blanket; the rest is under the covers
    ctx.restore();
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.rect(-12, -28, 24, 17.5);
    ctx.clip();
    blitPart(ctx, set.armFar, b.sw - b.armW * 0.4, b.shoulderY + 0.4, -0.1, 1, 1, 0);
    blitPart(ctx, set.armNear, -b.sw + b.armW * 0.4, b.shoulderY + 0.4, 0.1, 1, 1, 0);
    blitPart(ctx, set.torso, 0, b.hipY + 0.4, 0, 1, 1, 0);
    blitPart(ctx, set.head, 0, b.headY + 1.2, 0, 1, 1, 0);
    blitPart(ctx, set.headShut, 0, b.headY + 1.2, 0, 1, 1, 0);
    ctx.restore();
    return;
  }
  ctx.rotate(-Math.PI / 2);
  ctx.scale(0.86, 1);
  const f = st.flash ?? 0;
  // legs, body, arms at the sides, head: all from the front set
  for (const side of [-1, 1] as const) blitPart(ctx, set.leg, side * b.legX, b.hipY + 0.2, 0, side < 0 ? 1 : -1, 1, f);
  blitPart(ctx, set.torso, 0, b.hipY, 0, 1, 1, f);
  if (set.skirt) blitPart(ctx, set.skirt, 0, b.hipY + 0.4, 0, 1, 1, f);
  blitPart(ctx, set.armFar, b.sw - b.armW * 0.4, b.shoulderY + 0.2, -0.12, 1, 1, f);
  blitPart(ctx, set.armNear, -b.sw + b.armW * 0.4, b.shoulderY + 0.2, 0.12, 1, 1, f);
  blitPart(ctx, set.head, 0, b.headY, 0, 1, 1, f);
  blitPart(ctx, set.headShut, 0, b.headY, 0, 1, 1, 0);
  ctx.restore();
}

// ================================================================ painting the parts

function makeParts(look: Look, b: Body, pal: Pal, d: 0 | 1 | 3): PartSet {
  const rng = new RNG(JSON.stringify(look).length * 97 + d);
  const head = paintHead(look, b, pal, d, false, rng);
  const headShut = d === 0 ? paintHead(look, b, pal, d, true, rng, true) : part(1, 1, 0, 0, () => {});
  return {
    head, headShut,
    hairBack: paintHairBack(look, b, pal, d),
    torso: paintTorso(look, b, pal, d, rng),
    skirt: paintSkirt(look, b, pal, d),
    cape: look.cape ? paintCape(look, b, d) : null,
    armFar: paintArm(look, b, pal, d, true),
    armNear: paintArm(look, b, pal, d, false),
    thigh: paintThigh(look, b, pal),
    shin: paintShin(look, b, pal),
    leg: paintLeg(look, b, pal, d),
  };
}

// ---------------------------------------------------------------- limbs

function sleeveStyle(look: Look): 'cloth' | 'mail' | 'plate' | 'quilt' {
  const o = look.outer || 'none';
  if (o === 'mail' || o === 'tabard') return 'mail';
  if (o === 'plate') return 'plate';
  if (o === 'gambeson' || o === 'brigandine') return 'quilt';
  return 'cloth';
}

function mailTexture(g: G, x: number, y: number, w: number, h: number, base: string) {
  g.fillStyle = lin(g, x, 0, x + w, 0, [[0, lit(base, 0.3)], [0.5, base], [1, dim(base, 0.4)]]);
  g.fillRect(x, y, w, h);
  g.strokeStyle = rgba('#1c2024', 0.55);
  g.lineWidth = 0.14;
  for (let yy = y + 0.45; yy < y + h; yy += 0.65) {
    for (let xx = x + ((Math.round((yy - y) / 0.65) % 2) * 0.35); xx < x + w; xx += 0.7) {
      g.beginPath(); g.arc(xx, yy, 0.28, 0, Math.PI); g.stroke();
    }
  }
}

function paintArm(look: Look, b: Body, pal: Pal, d: 0 | 1 | 3, far: boolean): Part {
  const w = b.armW, L = b.armL;
  const style = sleeveStyle(look);
  const col = far ? dim(pal.sleeve, 0.14) : pal.sleeve;
  return part(w + 1.6, L + 2.6, w / 2 + 0.8, 0.8, (g) => {
    // sleeve tapering to the wrist
    const top = -0.4, wrist = L - 1.1;
    const shape = () => {
      g.beginPath();
      g.moveTo(-w / 2, top + 0.6);
      g.quadraticCurveTo(-w / 2, top - 0.5, 0, top - 0.5);
      g.quadraticCurveTo(w / 2, top - 0.5, w / 2, top + 0.6);
      g.lineTo(w * 0.4, wrist);
      g.lineTo(-w * 0.4, wrist);
      g.closePath();
    };
    shape();
    if (style === 'mail') {
      g.save(); g.clip(); mailTexture(g, -w, top - 1, w * 2, wrist + 2, col); g.restore();
    } else if (style === 'plate') {
      g.fillStyle = lin(g, -w / 2, 0, w / 2, 0, [[0, '#e8eef4'], [0.35, '#aab4be'], [0.7, '#6f7882'], [1, '#4a525a']]);
      g.fill();
      g.strokeStyle = 'rgba(30,34,40,0.6)'; g.lineWidth = 0.18;
      for (const yy of [L * 0.3, L * 0.45, L * 0.62]) { g.beginPath(); g.moveTo(-w * 0.45, yy); g.lineTo(w * 0.45, yy); g.stroke(); }
    } else {
      g.fillStyle = lin(g, -w / 2, 0, w / 2, 0, [[0, lit(col, d === 3 ? 0.1 : 0.22)], [0.45, col], [1, dim(col, 0.35)]]);
      g.fill();
      if (style === 'quilt') { g.strokeStyle = rgba(dim(col, 0.4), 0.6); g.lineWidth = 0.15; for (let yy = 1; yy < wrist; yy += 1.2) { g.beginPath(); g.moveTo(-w * 0.45, yy); g.lineTo(w * 0.45, yy + 0.2); g.stroke(); } }
      // a crease at the elbow
      g.strokeStyle = rgba(dim(col, 0.45), 0.45); g.lineWidth = 0.16;
      g.beginPath(); g.moveTo(-w * 0.3, L * 0.48); g.quadraticCurveTo(0, L * 0.54, w * 0.35, L * 0.47); g.stroke();
    }
    // cuff and hand
    g.fillStyle = dim(style === 'plate' ? '#8e98a2' : col, 0.25);
    g.fillRect(-w * 0.42, wrist - 0.5, w * 0.84, 0.6);
    const hc = pal.hand;
    ellipse(g, 0, wrist + 0.75, w * 0.42, 1.05, rad(g, -0.3, wrist + 0.4, 0.1, 0, wrist + 0.75, 1.1, [[0, lit(hc, 0.25)], [1, dim(hc, 0.25)]]));
  });
}

function hoseCol(pal: Pal) { return pal.legs; }

function paintLeg(look: Look, b: Body, pal: Pal, d: 0 | 1 | 3): Part {
  // a straight leg seen from the front or back, pivot at the hip; flipped for the other side
  const w = b.legW, L = b.legL;
  const bootH = b.child ? 2 : 2.8;
  const col = hoseCol(pal);
  return part(w + 1.6, L + 1.6, w / 2 + 0.8, 0.4, (g) => {
    const knee = L * 0.5;
    g.fillStyle = lin(g, -w / 2, 0, w / 2, 0, [[0, lit(col, 0.2)], [0.5, col], [1, dim(col, 0.4)]]);
    g.beginPath();
    g.moveTo(-w / 2, 0);
    g.lineTo(w / 2, 0);
    g.lineTo(w * 0.42, knee);
    g.lineTo(w * 0.38, L - bootH);
    g.lineTo(-w * 0.4, L - bootH);
    g.lineTo(-w * 0.45, knee);
    g.closePath();
    g.fill();
    g.strokeStyle = rgba(dim(col, 0.5), 0.35); g.lineWidth = 0.14;
    g.beginPath(); g.moveTo(-w * 0.3, knee); g.quadraticCurveTo(0, knee + 0.3, w * 0.3, knee); g.stroke();
    // boot
    const bc = pal.boots;
    const toe = d === 3 ? 0 : 0.35;
    g.fillStyle = lin(g, -w / 2, 0, w / 2, 0, [[0, lit(bc, 0.28)], [0.5, bc], [1, dim(bc, 0.4)]]);
    g.beginPath();
    g.moveTo(-w * 0.52, L - bootH);
    g.lineTo(w * 0.52, L - bootH);
    g.lineTo(w * 0.56, L - 0.2);
    g.quadraticCurveTo(0, L + toe + 0.3, -w * 0.56, L - 0.2);
    g.closePath();
    g.fill();
    g.fillStyle = rgba(lit(bc, 0.4), 0.5);
    g.fillRect(-w * 0.52, L - bootH, w * 1.04, 0.4);
  });
}

function paintThigh(look: Look, b: Body, pal: Pal): Part {
  const w = b.legW * 1.05, L = b.legL * 0.5;
  const col = hoseCol(pal);
  return part(w + 1.4, L + 1.4, w / 2 + 0.7, 0.5, (g) => {
    roundRect(g, -w / 2, -0.4, w, L + 0.9, w * 0.45, lin(g, -w / 2, 0, w / 2, 0, [[0, lit(col, 0.2)], [0.5, col], [1, dim(col, 0.4)]]));
  });
}

function paintShin(look: Look, b: Body, pal: Pal): Part {
  // shin plus a boot with the toe pointing left (profile)
  const w = b.legW * 0.95, L = b.legL * 0.52;
  const bootH = b.child ? 2 : 2.7;
  const col = hoseCol(pal), bc = pal.boots;
  return part(w + 4.4, L + 1.6, w / 2 + 3, 0.4, (g) => {
    roundRect(g, -w / 2, -0.4, w, L - bootH + 1, w * 0.4, lin(g, -w / 2, 0, w / 2, 0, [[0, lit(col, 0.2)], [0.5, col], [1, dim(col, 0.4)]]));
    g.fillStyle = lin(g, 0, L - bootH, 0, L, [[0, lit(bc, 0.3)], [0.6, bc], [1, dim(bc, 0.35)]]);
    g.beginPath();
    g.moveTo(w / 2 + 0.1, L - bootH);
    g.lineTo(w / 2 + 0.3, L);
    g.lineTo(-w / 2 - 2.2 * b.scale, L);
    g.quadraticCurveTo(-w / 2 - 2.5 * b.scale, L - 1.2, -w / 2 - 0.4, L - 1.5);
    g.lineTo(-w / 2 - 0.1, L - bootH);
    g.closePath();
    g.fill();
  });
}

// ---------------------------------------------------------------- torso

function paintTorso(look: Look, b: Body, pal: Pal, d: 0 | 1 | 3, rng: RNG): Part {
  const outer = look.outer || 'none';
  const side = d === 1, back = d === 3;
  const top = b.shoulderY - b.hipY; // negative
  const hem = b.hemY - b.hipY; // positive (below hip joint)
  const W = side ? b.depth * 2 + b.belly + 3 : b.sw * 2 + 3;
  return part(W + 2, -top + hem + 5, W / 2 + 1, -top + 2.4, (g) => {
    const sw = side ? b.depth + 0.2 : b.sw;
    const ww = side ? b.depth - 0.1 : b.ww;
    const hw = side ? b.depth + 0.2 : b.hw;
    const bellyF = side ? -b.belly : 0;
    const longHem = outer === 'robe' || outer === 'dress';
    const hemY = longHem ? 1.5 : hem;
    const torsoPath = () => {
      g.beginPath();
      g.moveTo(-sw + 0.9, top - 0.3);
      g.quadraticCurveTo(-sw, top - 0.2, -sw, top + 1.2);
      g.quadraticCurveTo(-ww - 0.2 + bellyF, top * 0.4, -ww + bellyF * 1.2, -1);
      g.lineTo(-hw - (longHem ? 0 : 0.5), hemY);
      g.quadraticCurveTo(0, hemY + 0.8, hw + (longHem ? 0 : 0.5), hemY);
      g.lineTo(ww, -1);
      g.quadraticCurveTo(ww + 0.2, top * 0.4, sw, top + 1.2);
      g.quadraticCurveTo(sw, top - 0.2, sw - 0.9, top - 0.3);
      g.closePath();
    };
    const base = pal.torso;
    const shadeFill = (col: string) => lin(g, -sw, top, sw, hemY, [[0, lit(col, back ? 0.08 : 0.22)], [0.45, col], [1, dim(col, 0.38)]]);
    // the shirt/tunic body
    torsoPath();
    g.fillStyle = shadeFill(base);
    g.fill();
    g.save();
    torsoPath();
    g.clip();
    // cloth folds
    g.strokeStyle = rgba(dim(base, 0.5), 0.3);
    g.lineWidth = 0.2;
    for (let k = 0; k < 4; k++) {
      const fx = -ww + (k + 0.5) * (ww * 2) / 4 + (rng.next() - 0.5);
      g.beginPath(); g.moveTo(fx, -0.5); g.quadraticCurveTo(fx + 0.4, hemY * 0.5, fx - 0.2, hemY); g.stroke();
    }
    switch (outer) {
      case 'mail': case 'tabard':
        mailTexture(g, -sw - 1, top - 1, sw * 2 + 2, hemY - top + 2, '#7c858e');
        if (outer === 'tabard') {
          const tc = pal.outer;
          g.fillStyle = shadeFill(tc);
          g.fillRect(-ww + 0.6, top + 0.4, ww * 2 - 1.2, hemY - top);
          g.fillStyle = pal.trim;
          g.fillRect(-ww + 0.6, top + 0.4, 0.45, hemY - top);
          g.fillRect(ww - 1.05, top + 0.4, 0.45, hemY - top);
          if (!back && !side) {
            // a simple cross device
            g.fillStyle = rgba(pal.trim, 0.85);
            g.fillRect(-0.45, top + 2.2, 0.9, 4.2);
            g.fillRect(-1.6, top + 3.4, 3.2, 0.9);
          }
        }
        break;
      case 'plate': {
        mailTexture(g, -sw - 1, -1.5, sw * 2 + 2, hemY + 3, '#7c858e');
        g.fillStyle = lin(g, -sw, top, sw * 0.8, 0, [[0, '#f4f8fa'], [0.25, '#b8c2cc'], [0.6, '#7a848e'], [1, '#4a525a']]);
        g.beginPath(); g.moveTo(-sw + 0.8, top); g.lineTo(sw - 0.8, top); g.quadraticCurveTo(sw, top * 0.3, ww, -0.8); g.quadraticCurveTo(0, 0.4, -ww, -0.8); g.quadraticCurveTo(-sw, top * 0.3, -sw + 0.8, top); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 0.25;
        g.beginPath(); g.moveTo(-sw * 0.4, top + 1); g.quadraticCurveTo(-sw * 0.5, top * 0.5, -ww * 0.5, -1.4); g.stroke();
        break;
      }
      case 'brigandine': {
        g.fillStyle = shadeFill(pal.outer);
        g.fillRect(-sw, top, sw * 2, hemY - top + 1);
        for (let yy = top + 1.2; yy < hemY; yy += 1.4) for (let xx = -ww + 0.7; xx < ww; xx += 1.4) ellipse(g, xx, yy, 0.14, 0.14, rgba('#c8b880', 0.8));
        break;
      }
      case 'gambeson': {
        g.fillStyle = shadeFill(pal.outer);
        g.fillRect(-sw, top, sw * 2, hemY - top + 1);
        g.strokeStyle = rgba(dim(pal.outer, 0.45), 0.7); g.lineWidth = 0.16;
        for (let xx = -sw + 1; xx < sw; xx += 1.2) { g.beginPath(); g.moveTo(xx, top + 0.5); g.lineTo(xx + 0.1, hemY); g.stroke(); }
        break;
      }
      case 'leather': {
        g.fillStyle = shadeFill(pal.outer);
        g.fillRect(-sw, top + 0.2, sw * 2, hemY - top);
        g.strokeStyle = rgba(lit(pal.outer, 0.4), 0.5); g.lineWidth = 0.15; g.setLineDash([0.4, 0.4]);
        g.beginPath(); g.moveTo(-ww + 0.7, top + 1); g.lineTo(-ww + 0.9, hemY - 0.5); g.moveTo(ww - 0.7, top + 1); g.lineTo(ww - 0.9, hemY - 0.5); g.stroke();
        g.setLineDash([]);
        if (!side && !back) { g.strokeStyle = 'rgba(20,12,6,0.6)'; g.lineWidth = 0.3; g.beginPath(); g.moveTo(0, top + 0.6); g.lineTo(0, -1); g.stroke(); for (let yy = top + 1.4; yy < -1.5; yy += 1.4) ellipse(g, 0.5, yy, 0.25, 0.25, '#c8a060'); }
        break;
      }
      case 'vest': {
        if (!back) {
          const vc = pal.outer;
          g.fillStyle = shadeFill(vc);
          if (side) g.fillRect(-sw * 0.2, top + 0.3, sw * 1.3, hemY - top - 1);
          else { g.fillRect(-sw, top + 0.3, sw - 1.2, hemY - top - 1); g.fillRect(1.2, top + 0.3, sw - 1.2, hemY - top - 1); }
        } else { g.fillStyle = shadeFill(pal.outer); g.fillRect(-sw, top + 0.3, sw * 2, hemY - top - 1); }
        break;
      }
      case 'apron': {
        if (!back) {
          const ac = look.apronColor || '#6b4526';
          g.fillStyle = shadeFill(ac);
          g.fillRect(side ? -sw - 0.3 : -ww + 0.5, top + (side ? 2.5 : 2), side ? sw * 0.9 : ww * 2 - 1, hemY - top);
          g.strokeStyle = rgba(dim(ac, 0.45), 0.6); g.lineWidth = 0.2;
          g.beginPath(); g.moveTo(-ww + 0.5, top + 2); g.lineTo(-sw + 0.5, top + 0.3); g.moveTo(ww - 0.5, top + 2); g.lineTo(sw - 0.5, top + 0.3); g.stroke();
        }
        break;
      }
      case 'noble': {
        g.fillStyle = shadeFill(pal.outer);
        g.fillRect(-sw, top, sw * 2, hemY - top + 1);
        g.fillStyle = pal.trim;
        if (!back && !side) {
          g.fillRect(-0.3, top + 0.4, 0.6, hemY - top);
          for (let yy = top + 1.2; yy < hemY - 1; yy += 1.3) { ellipse(g, -0.9, yy, 0.3, 0.3, lit(pal.trim, 0.3)); ellipse(g, 0.9, yy, 0.3, 0.3, lit(pal.trim, 0.3)); }
        }
        g.fillRect(-sw, hemY - 0.6, sw * 2, 0.6);
        break;
      }
      case 'dress': {
        // fitted bodice laced at the front, with an apron over the skirt drawn separately
        g.fillStyle = shadeFill(pal.outer);
        g.fillRect(-sw, top, sw * 2, 3 - top);
        if (!back && !side) {
          g.fillStyle = shadeFill(look.shirt);
          g.beginPath(); g.moveTo(-1.8, top + 0.2); g.lineTo(1.8, top + 0.2); g.lineTo(0, top + 2.8); g.closePath(); g.fill();
          g.strokeStyle = rgba(dim(pal.outer, 0.5), 0.8); g.lineWidth = 0.14;
          for (let yy = top + 3; yy < -1.8; yy += 0.9) { g.beginPath(); g.moveTo(-0.6, yy); g.lineTo(0.6, yy + 0.5); g.moveTo(0.6, yy); g.lineTo(-0.6, yy + 0.5); g.stroke(); }
        }
        break;
      }
      case 'robe': {
        g.fillStyle = shadeFill(pal.outer);
        g.fillRect(-sw, top, sw * 2, 4 - top);
        break;
      }
    }
    // soft shade under the arms and at the flank
    g.fillStyle = lin(g, -sw, 0, sw, 0, [[0, 'rgba(0,0,0,0)'], [0.72, 'rgba(0,0,0,0)'], [1, 'rgba(10,8,24,0.28)']]);
    g.fillRect(-sw - 1, top - 1, sw * 2 + 2, hemY - top + 2);
    g.restore();
    // collar and neck
    if (!back) {
      const sk = pal.skin;
      if (!side) {
        roundRect(g, -1.15, top - 1.9, 2.3, 2.2, 0.7, lin(g, -1, 0, 1, 0, [[0, sk[2]], [1, sk[1]]]));
        const neckline = outer === 'mail' || outer === 'plate' || outer === 'tabard' ? '#6f7882' : dim(base, 0.35);
        g.strokeStyle = neckline; g.lineWidth = 0.4;
        g.beginPath(); g.moveTo(-1.9, top - 0.1); g.quadraticCurveTo(0, top + (outer === 'none' ? 1.6 : 1), 1.9, top - 0.1); g.stroke();
      } else {
        roundRect(g, -1.4, top - 1.9, 2.1, 2.2, 0.6, sk[1]);
      }
    }
    // belt with buckle and pouch
    if (outer !== 'robe' && outer !== 'plate') {
      const by = -1.6;
      const bw = side ? b.depth + 0.4 : ww + 0.35;
      g.fillStyle = lin(g, 0, by, 0, by + 1, [[0, lit(pal.belt, 0.25)], [1, dim(pal.belt, 0.3)]]);
      g.fillRect(-bw, by, bw * 2, 1);
      if (!back) {
        g.fillStyle = '#b89a50';
        g.fillRect(side ? -bw - 0.1 : -0.5, by + 0.05, 0.9, 0.9);
        if (!side) { roundRect(g, ww - 1.6, by + 0.6, 1.5, 1.8, 0.4, lin(g, 0, by, 0, by + 2.4, [[0, lit(pal.belt, 0.3)], [1, dim(pal.belt, 0.2)]])); }
      }
    } else if (outer === 'robe') {
      g.strokeStyle = '#c8b88a'; g.lineWidth = 0.35;
      g.beginPath(); g.moveTo(-ww - 0.3, -1.2); g.quadraticCurveTo(0, -0.6, ww + 0.3, -1.2); g.stroke();
      if (!back && !side) { g.beginPath(); g.moveTo(0.8, -1); g.lineTo(1.2, 2.6); g.stroke(); }
    }
    // shoulder highlight
    g.fillStyle = 'rgba(255,245,225,0.12)';
    g.beginPath(); g.ellipse(-sw * 0.45, top + 0.5, sw * 0.4, 0.6, -0.2, 0, Math.PI * 2); g.fill();
  });
}

function paintSkirt(look: Look, b: Body, pal: Pal, d: 0 | 1 | 3): Part | null {
  const outer = look.outer || 'none';
  if (outer !== 'robe' && outer !== 'dress') return null;
  const side = d === 1;
  const L = -b.hipY - 0.9;
  const top = 0, bot = L;
  const w0 = side ? b.depth + 0.3 : b.ww + 0.2, w1 = side ? b.depth + 1.6 : b.hw + 1.5;
  return part(w1 * 2 + 2, L + 2, w1 + 1, 0.8, (g) => {
    const col = pal.outer;
    const path = () => {
      g.beginPath();
      g.moveTo(-w0, top - 0.5);
      g.lineTo(w0, top - 0.5);
      g.quadraticCurveTo(w1 * 0.9, bot * 0.5, w1, bot);
      g.quadraticCurveTo(0, bot + 0.9, -w1, bot);
      g.quadraticCurveTo(-w1 * 0.9, bot * 0.5, -w0, top - 0.5);
      g.closePath();
    };
    path();
    g.fillStyle = lin(g, -w1, 0, w1, 0, [[0, lit(col, 0.2)], [0.45, col], [1, dim(col, 0.4)]]);
    g.fill();
    g.save(); path(); g.clip();
    g.strokeStyle = rgba(dim(col, 0.5), 0.45); g.lineWidth = 0.22;
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * w0 * 0.35, top); g.quadraticCurveTo(k * w1 * 0.38, bot * 0.6, k * w1 * 0.42, bot + 0.5); g.stroke(); }
    if (look.apronColor && d !== 3) {
      const ac = look.apronColor;
      g.fillStyle = lin(g, -w1, 0, w1, 0, [[0, lit(ac, 0.2)], [1, dim(ac, 0.25)]]);
      if (side) g.fillRect(-w1 - 0.5, top, w1 * 0.9, bot * 0.8);
      else g.fillRect(-w0 * 0.85, top - 0.2, w0 * 1.7, bot * 0.8);
    }
    g.fillStyle = rgba(dim(col, 0.5), 0.4);
    g.fillRect(-w1 - 1, bot - 0.6, w1 * 2 + 2, 1);
    g.restore();
  });
}

function paintCape(look: Look, b: Body, d: 0 | 1 | 3): Part {
  const col = look.cape!;
  const L = -b.shoulderY - 3;
  if (d === 3) {
    const w = b.sw + 1;
    return part(w * 2 + 2, L + 2, w + 1, 0.6, (g) => {
      g.fillStyle = lin(g, -w, 0, w, 0, [[0, lit(col, 0.15)], [0.5, col], [1, dim(col, 0.35)]]);
      g.beginPath(); g.moveTo(-w + 1, -0.4); g.lineTo(w - 1, -0.4); g.quadraticCurveTo(w + 0.4, L * 0.5, w + 0.6, L); g.quadraticCurveTo(0, L + 0.8, -w - 0.6, L); g.quadraticCurveTo(-w - 0.4, L * 0.5, -w + 1, -0.4); g.closePath(); g.fill();
      g.strokeStyle = rgba(dim(col, 0.5), 0.5); g.lineWidth = 0.25;
      for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(k * 1.5, 0.5); g.quadraticCurveTo(k * 2.5, L * 0.6, k * 3, L); g.stroke(); }
    });
  }
  if (d === 1) {
    return part(6, L + 2, 1.5, 0.6, (g) => {
      g.fillStyle = lin(g, -1, 0, 4, 0, [[0, col], [1, dim(col, 0.4)]]);
      g.beginPath(); g.moveTo(-0.6, -0.4); g.quadraticCurveTo(2.5, L * 0.4, 3.8, L); g.lineTo(0.6, L - 0.4); g.quadraticCurveTo(0.8, L * 0.5, -0.6, -0.4); g.closePath(); g.fill();
    });
  }
  const w = b.sw + 1.1;
  return part(w * 2 + 2, L + 2, w + 1, 0.6, (g) => {
    // only the edges show from the front, falling behind the arms
    g.fillStyle = dim(col, 0.3);
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * (w - 1.6), -0.3); g.quadraticCurveTo(s * (w + 0.4), L * 0.4, s * (w + 0.6), L * 0.85); g.lineTo(s * (w - 1), L * 0.8); g.closePath(); g.fill(); }
    g.fillStyle = lin(g, 0, -0.6, 0, 1, [[0, lit(col, 0.2)], [1, col]]);
    g.fillRect(-w + 1.2, -0.7, w * 2 - 2.4, 1.2);
    ellipse(g, 0, -0.1, 0.55, 0.55, '#c8a040');
  });
}

// ---------------------------------------------------------------- hair behind

function paintHairBack(look: Look, b: Body, pal: Pal, d: 0 | 1 | 3): Part | null {
  const style = look.hairStyle;
  const hat = look.hat || 'none';
  const covered = hat === 'hood' || hat === 'monkhood' || hat === 'wimple' || hat === 'coif' || hat === 'bascinet' || hat === 'sallet';
  if (covered) return null;
  if (style !== 'long' && style !== 'braids' && style !== 'ponytail') return null;
  const r = b.headR;
  return part(r * 3 + 2, r * 4.2, r * 1.5 + 1, r + 1, (g) => {
    const col = pal.hair;
    if (style === 'long') {
      const L = r * 2.4;
      g.fillStyle = lin(g, -r, 0, r, 0, [[0, dim(col, 0.05)], [1, dim(col, 0.45)]]);
      g.beginPath();
      if (d === 1) { g.moveTo(-0.5, -r * 0.5); g.quadraticCurveTo(r * 1.3, 0, r * 1.1, L); g.lineTo(0, L - 0.5); g.quadraticCurveTo(r * 0.3, r, -0.5, -r * 0.5); }
      else { g.moveTo(-r * 0.95, -r * 0.2); g.quadraticCurveTo(-r * 1.25, L * 0.5, -r * 1.05, L); g.lineTo(r * 1.05, L); g.quadraticCurveTo(r * 1.25, L * 0.5, r * 0.95, -r * 0.2); }
      g.closePath();
      g.fill();
      g.strokeStyle = rgba(lit(col, 0.3), 0.4); g.lineWidth = 0.18;
      for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * r * 0.35, 0); g.quadraticCurveTo(k * r * 0.45, L * 0.5, k * r * 0.4, L - 0.3); g.stroke(); }
    } else if (style === 'braids' && d !== 0) {
      for (const s of d === 1 ? [0.6] : [-1, 1]) {
        for (let k = 0; k < 6; k++) ellipse(g, s * r * 0.5, r * 0.4 + k * 1.05, 0.75, 0.62, k % 2 ? pal.hairD : col);
        ellipse(g, s * r * 0.5, r * 0.4 + 6.5, 0.5, 0.4, '#b83a3a');
      }
    } else if (style === 'ponytail' && d !== 0) {
      const x = d === 1 ? r * 0.9 : 0;
      g.fillStyle = lin(g, x - 1, 0, x + 1, 0, [[0, col], [1, pal.hairD]]);
      g.beginPath(); g.moveTo(x - 0.9, -r * 0.2); g.quadraticCurveTo(x + (d === 1 ? 1.6 : 0.4), r * 1.2, x + (d === 1 ? 0.8 : 0), r * 2.4); g.quadraticCurveTo(x - 0.8, r * 1.2, x - 0.9, -r * 0.2); g.fill();
    }
  });
}

// ---------------------------------------------------------------- head

function paintHead(look: Look, b: Body, pal: Pal, d: 0 | 1 | 3, eyesShut: boolean, rng: RNG, lidsOnly = false): Part {
  const r = b.headR;
  const S = r * 3.4;
  return part(S, S + r * 1.4, S / 2, S / 2 + 0.4, (g) => {
    if (lidsOnly) { closedLids(g, look, r, pal); return; }
    paintHeadInto(g, look, b, pal, d, eyesShut, rng);
  }, lidsOnly ? 0 : 0.6);
}

function closedLids(g: G, look: Look, r: number, pal: Pal) {
  const hat = look.hat || 'none';
  if (hat === 'sallet') return;
  const ey = r * 0.12, ex = r * 0.36;
  for (const s of [-1, 1]) {
    ellipse(g, s * ex, ey, r * 0.17, r * 0.1, pal.skin[2]);
    g.strokeStyle = dim(pal.skin[0], 0.2); g.lineWidth = 0.22;
    g.beginPath(); g.moveTo(s * ex - r * 0.15, ey); g.quadraticCurveTo(s * ex, ey + r * 0.08, s * ex + r * 0.15, ey); g.stroke();
  }
}

export function paintHeadInto(g: G, look: Look, b: Body, pal: Pal, d: 0 | 1 | 3, eyesShut: boolean, rng: RNG) {
  const r = b.headR;
  const sk = pal.skin;
  const hat = look.hat || 'none';
  const style = look.hairStyle;
  const side = d === 1, back = d === 3;
  const helm = hat === 'sallet' || hat === 'bascinet' || hat === 'kettle' || hat === 'coif';
  const hood = hat === 'hood' || hat === 'monkhood' || hat === 'wimple';
  const face = look.face || {};
  const jaw = face.jaw || 'round';
  const jawW = jaw === 'square' ? 0.82 : jaw === 'heavy' ? 0.9 : jaw === 'narrow' ? 0.62 : 0.72;
  const skinFill = (cx: number, cy: number) => rad(g, cx - r * 0.4, cy - r * 0.45, r * 0.1, cx, cy, r * 1.15, [[0, lit(sk[3], 0.15)], [0.5, sk[2]], [1, sk[1]]]);

  // hood/wimple backs sit behind the face
  if (hood) hoodBack(g, look, r, d);

  // ---- skull and face ----
  const headShape = () => {
    g.beginPath();
    if (side) {
      g.moveTo(r * 0.2, -r);
      g.bezierCurveTo(r * 1.15, -r * 0.95, r * 1.15, r * 0.5, r * 0.5, r * 0.8);
      g.quadraticCurveTo(0, r * 1.05, -r * 0.45, r * 0.95);
      g.quadraticCurveTo(-r * 0.78, r * 0.72, -r * 0.8, r * 0.35);
      g.lineTo(-r * 1.02, r * 0.1);
      g.quadraticCurveTo(-r * 0.9, -r * 0.05, -r * 0.92, -r * 0.25);
      g.bezierCurveTo(-r * 1.05, -r * 0.95, -r * 0.4, -r * 1.05, r * 0.2, -r);
    } else {
      g.moveTo(0, -r * 1.02);
      g.bezierCurveTo(r * 0.98, -r * 1.02, r * 1.02, -r * 0.1, r * 0.94, r * 0.25);
      g.quadraticCurveTo(r * 0.85, r * 0.75, r * jawW * 0.6, r * 0.93);
      g.quadraticCurveTo(0, r * 1.12, -r * jawW * 0.6, r * 0.93);
      g.quadraticCurveTo(-r * 0.85, r * 0.75, -r * 0.94, r * 0.25);
      g.bezierCurveTo(-r * 1.02, -r * 0.1, -r * 0.98, -r * 1.02, 0, -r * 1.02);
    }
    g.closePath();
  };
  // ears
  if (!helm && !hood) {
    if (side) ellipse(g, r * 0.25, r * 0.12, r * 0.2, r * 0.3, skinFill(r * 0.25, 0));
    else for (const s of [-1, 1]) ellipse(g, s * r * 0.95, r * 0.12, r * 0.17, r * 0.27, sk[1]);
  }
  headShape();
  g.fillStyle = skinFill(0, 0);
  g.fill();

  if (!back && hat !== 'sallet') {
    g.save();
    headShape();
    g.clip();
    // cheek warmth and jaw shade
    if (face.cheeks || look.female || b.child) {
      for (const s of side ? [-0.35] : [-1, 1]) ellipse(g, s * r * (side ? 1 : 0.5), r * 0.45, r * 0.22, r * 0.15, rgba('#d84a4a', 0.22));
    }
    g.fillStyle = lin(g, 0, r * 0.3, 0, r * 1.1, [[0, 'rgba(0,0,0,0)'], [1, rgba(sk[0], 0.35)]]);
    g.fillRect(-r * 1.2, r * 0.3, r * 2.4, r);
    g.restore();
    paintFace(g, look, b, pal, side, eyesShut, r);
  }

  // ---- beard ----
  const beard = look.beard || 'none';
  if (beard !== 'none' && !back && hat !== 'sallet') paintBeard(g, look, r, side, beard);

  // ---- hair ----
  if (!helm && !hood) paintHair(g, look, pal, r, d, rng, hat === 'kerchief');

  // ---- headwear ----
  paintHat(g, look, r, d, rng);

  // soft rim light on the upper left
  if (!helm) {
    g.save();
    headShape();
    g.clip();
    g.fillStyle = rad(g, -r * 0.7, -r * 0.8, 0, -r * 0.7, -r * 0.8, r * 0.9, [[0, 'rgba(255,244,220,0.18)'], [1, 'rgba(255,244,220,0)']]);
    g.fillRect(-r * 2, -r * 2, r * 4, r * 4);
    g.restore();
  }
}

function paintFace(g: G, look: Look, b: Body, pal: Pal, side: boolean, shut: boolean, r: number) {
  const sk = pal.skin;
  const face = look.face || {};
  const eyeCol = look.eyes || '#3b2a1e';
  const ey = r * 0.12;
  const ex = side ? -r * 0.55 : r * 0.36;
  const eyeW = (face.eyeShape === 'wide' ? 0.19 : face.eyeShape === 'narrow' ? 0.15 : 0.17) * r;
  const eyeH = (face.eyeShape === 'narrow' || face.eyeShape === 'sleepy' ? 0.12 : 0.16) * r * (b.child ? 1.15 : 1);
  const eyes = side ? [ex] : [-ex, ex];
  // brows
  const browW = face.brows === 'bushy' ? 0.32 : face.brows === 'thick' ? 0.24 : 0.17;
  g.strokeStyle = dim(look.hair, 0.3);
  g.lineCap = 'round';
  for (const x of eyes) {
    const s = side ? -1 : Math.sign(x);
    g.lineWidth = browW * r * 0.5 + 0.18;
    g.beginPath();
    g.moveTo(x - s * r * 0.14 - (side ? 0.1 : 0), ey - r * 0.3);
    g.quadraticCurveTo(x, ey - r * 0.4, x + s * r * 0.2, ey - r * 0.3);
    g.stroke();
  }
  // eyes
  for (const x of eyes) {
    if (look.eyepatch && (side || x < 0)) {
      ellipse(g, x, ey, eyeW * 1.6, eyeH * 1.8, '#18120e');
      g.strokeStyle = '#18120e'; g.lineWidth = 0.28;
      g.beginPath(); g.moveTo(x - r * 0.3, ey - r * 0.2); g.lineTo(r * 0.9, -r * 0.55); g.moveTo(x + r * 0.2, ey - r * 0.1); g.lineTo(-r * 0.9, -r * 0.4); g.stroke();
      continue;
    }
    if (shut) {
      g.strokeStyle = dim(sk[0], 0.2); g.lineWidth = 0.22;
      g.beginPath(); g.moveTo(x - eyeW, ey); g.quadraticCurveTo(x, ey + eyeH * 0.7, x + eyeW, ey); g.stroke();
      continue;
    }
    ellipse(g, x, ey, eyeW * 1.05, eyeH * 1.05, '#f4efe6');
    ellipse(g, x + (side ? -eyeW * 0.25 : 0), ey + eyeH * 0.05, eyeW * 0.72, eyeH * 0.95, mix(eyeCol, '#140c08', 0.35));
    ellipse(g, x + (side ? -eyeW * 0.35 : 0) - eyeW * 0.1, ey - eyeH * 0.3, eyeW * 0.28, eyeH * 0.3, 'rgba(255,255,255,0.9)');
    g.strokeStyle = rgba(dim(sk[0], 0.3), 0.8); g.lineWidth = 0.2;
    g.beginPath(); g.moveTo(x - eyeW * 1.1, ey - eyeH * 0.4); g.quadraticCurveTo(x, ey - eyeH * 1.35, x + eyeW * 1.1, ey - eyeH * 0.4); g.stroke();
    if (look.female && !b.child) { g.lineWidth = 0.16; g.beginPath(); g.moveTo(x + (side ? -eyeW : Math.sign(x) * eyeW) * 1.05, ey - eyeH * 0.5); g.lineTo(x + (side ? -eyeW * 1.5 : Math.sign(x) * eyeW * 1.5), ey - eyeH * 0.9); g.stroke(); }
    if (face.eyeShape === 'sleepy') { ellipse(g, x, ey - eyeH * 0.55, eyeW * 1.1, eyeH * 0.5, sk[2]); }
  }
  // nose
  const nose = face.nose || 'small';
  const nl = (nose === 'long' || nose === 'hooked' ? 0.42 : nose === 'button' ? 0.24 : nose === 'broad' ? 0.3 : 0.3) * r;
  if (side) {
    g.fillStyle = sk[2];
    g.beginPath();
    g.moveTo(-r * 0.9, ey + r * 0.02);
    g.quadraticCurveTo(-r * 0.98 - nl * 0.8, ey + nl * 0.9 + (nose === 'hooked' ? -r * 0.1 : 0), -r * 0.88, ey + nl + r * 0.1);
    g.lineTo(-r * 0.8, ey + nl + r * 0.08);
    g.closePath();
    g.fill();
    g.strokeStyle = rgba(sk[0], 0.5); g.lineWidth = 0.18;
    g.beginPath(); g.moveTo(-r * 0.95 - nl * 0.5, ey + nl + r * 0.05); g.lineTo(-r * 0.8, ey + nl + r * 0.1); g.stroke();
  } else {
    const nw = (nose === 'broad' ? 0.24 : 0.17) * r;
    g.fillStyle = rgba(sk[0], 0.35);
    g.beginPath(); g.ellipse(r * 0.05, ey + nl + r * 0.08, nw, r * 0.07, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = rgba(sk[0], 0.45); g.lineWidth = 0.18;
    g.beginPath(); g.moveTo(r * 0.1, ey + r * 0.05); g.quadraticCurveTo(r * 0.16, ey + nl * 0.7, r * 0.12, ey + nl + r * 0.02); g.stroke();
    ellipse(g, -r * 0.03, ey + nl * 0.5, r * 0.05, nl * 0.35, rgba(lit(sk[3], 0.3), 0.55));
  }
  // mouth
  const mw = (face.mouth === 'wide' ? 0.36 : face.mouth === 'small' ? 0.2 : 0.27) * r;
  const my = ey + nl + r * 0.36;
  const lip = mix(sk[1], '#8a3a36', 0.5);
  g.strokeStyle = lip; g.lineWidth = 0.28;
  g.beginPath();
  if (side) { g.moveTo(-r * 0.86, my); g.quadraticCurveTo(-r * 0.75, my + 0.05, -r * 0.62, my - 0.05); }
  else { g.moveTo(-mw, my); g.quadraticCurveTo(0, my + r * 0.09, mw, my); }
  g.stroke();
  if (face.mouth === 'full' && !side) ellipse(g, 0, my + r * 0.1, mw * 0.55, r * 0.06, rgba(lip, 0.6));
  // age and marks
  const wr = face.wrinkles ?? (look.old ? 2 : 0);
  if (wr > 1) {
    g.strokeStyle = rgba(sk[0], 0.35); g.lineWidth = 0.14;
    for (let k = 0; k < wr; k++) { g.beginPath(); g.moveTo(-r * 0.4, -r * 0.35 - k * r * 0.14); g.quadraticCurveTo(0, -r * 0.42 - k * r * 0.14, r * 0.4, -r * 0.35 - k * r * 0.14); g.stroke(); }
    if (!side) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.3, my - r * 0.25); g.quadraticCurveTo(s * r * 0.42, my, s * r * 0.34, my + r * 0.12); g.stroke(); }
  }
  if (look.freckles) {
    const rn = new RNG(look.hair.length * 7 + 3);
    for (let k = 0; k < 12; k++) ellipse(g, (rn.next() - 0.5) * r * (side ? 0.8 : 1.3) - (side ? r * 0.5 : 0), ey + r * 0.2 + rn.next() * r * 0.3, 0.13, 0.13, rgba('#8a4a2a', 0.6));
  }
  if (look.scar) {
    g.strokeStyle = rgba('#e8b8a8', 0.9); g.lineWidth = 0.22;
    const sx = side ? -r * 0.5 : r * 0.42;
    g.beginPath(); g.moveTo(sx - r * 0.1, ey - r * 0.45); g.lineTo(sx + r * 0.15, ey + r * 0.55); g.stroke();
    g.strokeStyle = rgba('#8a4a3a', 0.6); g.lineWidth = 0.1;
    g.beginPath(); g.moveTo(sx - r * 0.06, ey - r * 0.45); g.lineTo(sx + r * 0.19, ey + r * 0.55); g.stroke();
  }
}

function paintBeard(g: G, look: Look, r: number, side: boolean, beard: string) {
  const bc = look.beardColor || look.hair;
  const fill = lin(g, -r, 0, r, 0, [[0, lit(bc, 0.2)], [0.5, bc], [1, dim(bc, 0.35)]]);
  const my = r * 0.62;
  g.fillStyle = fill;
  if (beard === 'stubble') {
    g.fillStyle = rgba(dim(bc, 0.1), 0.35);
    g.beginPath();
    if (side) g.ellipse(-r * 0.4, r * 0.62, r * 0.55, r * 0.38, 0.3, 0, Math.PI * 2);
    else g.ellipse(0, r * 0.68, r * 0.72, r * 0.4, 0, 0, Math.PI * 2);
    g.fill();
    return;
  }
  if (beard === 'moustache' || beard === 'goatee' || beard === 'full' || beard === 'short' || beard === 'long') {
    // moustache
    g.beginPath();
    if (side) { g.moveTo(-r * 0.95, my - r * 0.15); g.quadraticCurveTo(-r * 0.7, my - r * 0.28, -r * 0.45, my - r * 0.12); g.quadraticCurveTo(-r * 0.7, my + r * 0.05, -r * 0.95, my - r * 0.02); }
    else { g.moveTo(-r * 0.42, my - r * 0.02); g.quadraticCurveTo(-r * 0.2, my - r * 0.25, 0, my - r * 0.16); g.quadraticCurveTo(r * 0.2, my - r * 0.25, r * 0.42, my - r * 0.02); g.quadraticCurveTo(r * 0.2, my - r * 0.05, 0, my - r * 0.04); g.quadraticCurveTo(-r * 0.2, my - r * 0.05, -r * 0.42, my - r * 0.02); }
    g.fill();
  }
  if (beard === 'goatee') {
    g.beginPath();
    if (side) g.ellipse(-r * 0.62, r * 0.95, r * 0.22, r * 0.3, 0.3, 0, Math.PI * 2);
    else g.ellipse(0, r * 0.98, r * 0.24, r * 0.3, 0, 0, Math.PI * 2);
    g.fill();
  } else if (beard === 'short' || beard === 'full' || beard === 'long') {
    const len = beard === 'short' ? 0.25 : beard === 'full' ? 0.5 : 1.3;
    g.beginPath();
    if (side) {
      g.moveTo(r * 0.3, r * 0.1);
      g.quadraticCurveTo(r * 0.35, r * 0.9, -r * 0.1, r * (1 + len * 0.6));
      g.quadraticCurveTo(-r * 0.7, r * (1.05 + len), -r * 0.95, r * (0.8 + len * 0.6));
      g.quadraticCurveTo(-r * 0.9, my + r * 0.2, -r * 0.62, my + r * 0.05);
      g.quadraticCurveTo(-r * 0.2, my + r * 0.2, 0, r * 0.3);
      g.closePath();
    } else {
      g.moveTo(-r * 0.93, r * 0.1);
      g.quadraticCurveTo(-r * 0.95, r * (0.9 + len * 0.4), -r * 0.35, r * (1.05 + len * 0.7));
      g.quadraticCurveTo(0, r * (1.18 + len), r * 0.35, r * (1.05 + len * 0.7));
      g.quadraticCurveTo(r * 0.95, r * (0.9 + len * 0.4), r * 0.93, r * 0.1);
      g.quadraticCurveTo(r * 0.7, r * 0.55, r * 0.35, my + r * 0.05);
      g.quadraticCurveTo(0, my + r * 0.3, -r * 0.35, my + r * 0.05);
      g.quadraticCurveTo(-r * 0.7, r * 0.55, -r * 0.93, r * 0.1);
      g.closePath();
    }
    g.fill();
    g.strokeStyle = rgba(lit(bc, 0.35), 0.4); g.lineWidth = 0.15;
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * r * 0.25 + (side ? -r * 0.4 : 0), r * 0.75); g.quadraticCurveTo(k * r * 0.28 + (side ? -r * 0.45 : 0), r * (0.95 + len * 0.3), k * r * 0.2 + (side ? -r * 0.5 : 0), r * (1 + len * 0.6)); g.stroke(); }
    // mouth shows through
    if (!side) { g.strokeStyle = rgba('#5a2a24', 0.8); g.lineWidth = 0.22; g.beginPath(); g.moveTo(-r * 0.18, my + r * 0.06); g.lineTo(r * 0.18, my + r * 0.06); g.stroke(); }
  }
}

function paintHair(g: G, look: Look, pal: Pal, r: number, d: 0 | 1 | 3, rng: RNG, underHat = false) {
  const style = underHat ? (look.hairStyle === 'bald' || look.hairStyle === 'none' || look.hairStyle === 'tonsure' ? 'none' : 'short') : look.hairStyle;
  if (style === 'none' || style === 'bald') {
    if (!underHat && style === 'bald') ellipse(g, -r * 0.35, -r * 0.6, r * 0.3, r * 0.18, 'rgba(255,245,230,0.35)');
    return;
  }
  const col = pal.hair, colD = pal.hairD, colL = pal.hairL;
  const side = d === 1, back = d === 3;
  const fill = lin(g, -r, -r, r * 0.6, r * 0.5, [[0, colL], [0.4, col], [1, colD]]);
  g.fillStyle = fill;
  const strands = (x0: number, y0: number, x1: number, y1: number, n: number) => {
    g.strokeStyle = rgba(colD, 0.55); g.lineWidth = 0.16;
    for (let k = 0; k < n; k++) {
      const t = k / Math.max(1, n - 1);
      g.beginPath(); g.moveTo(x0 + (x1 - x0) * t, y0); g.quadraticCurveTo(x0 + (x1 - x0) * t + (rng.next() - 0.5) * 0.6, (y0 + y1) / 2, x0 + (x1 - x0) * t + (rng.next() - 0.5), y1); g.stroke();
    }
    g.strokeStyle = rgba(colL, 0.5); g.lineWidth = 0.14;
    for (let k = 0; k < n / 2; k++) { const x = x0 + rng.next() * (x1 - x0) * 0.6; g.beginPath(); g.moveTo(x, y0 + 0.2); g.quadraticCurveTo(x - 0.3, (y0 + y1) / 2, x - 0.1, y0 + (y1 - y0) * 0.6); g.stroke(); }
  };
  if (back) {
    // the back of the head
    g.beginPath();
    g.moveTo(-r * 1.02, r * 0.2);
    g.bezierCurveTo(-r * 1.08, -r * 1.12, r * 1.08, -r * 1.12, r * 1.02, r * 0.2);
    if (style === 'long' || style === 'braids' || style === 'bun' || style === 'ponytail') g.quadraticCurveTo(r * 0.9, r * 0.95, 0, r * 1.05);
    else g.quadraticCurveTo(r * 0.8, r * 0.75, 0, r * 0.8);
    if (style === 'long' || style === 'braids' || style === 'bun' || style === 'ponytail') g.quadraticCurveTo(-r * 0.9, r * 0.95, -r * 1.02, r * 0.2);
    else g.quadraticCurveTo(-r * 0.8, r * 0.75, -r * 1.02, r * 0.2);
    g.closePath();
    if (style === 'tonsure' || style === 'balding') {
      g.fill();
      ellipse(g, 0, -r * 0.45, r * 0.55, r * 0.42, rad(g, -r * 0.2, -r * 0.6, 0.1, 0, -r * 0.45, r * 0.6, [[0, lit(pal.skin[3], 0.2)], [1, pal.skin[1]]]));
    } else g.fill();
    strands(-r * 0.8, -r * 0.7, r * 0.8, r * 0.6, 9);
    if (style === 'bun') ellipse(g, 0, -r * 0.35, r * 0.42, r * 0.38, lin(g, -r * 0.4, -r * 0.7, r * 0.4, 0, [[0, colL], [1, colD]]));
    return;
  }
  if (side) {
    // facing left: hair over the crown and the back of the head
    g.beginPath();
    g.moveTo(-r * 0.95, -r * 0.2);
    g.bezierCurveTo(-r * 1.0, -r * 1.2, r * 1.2, -r * 1.25, r * 1.1, r * 0.1);
    const nape = style === 'long' || style === 'braids' || style === 'ponytail' || style === 'bun' ? r * 0.85 : style === 'curly' || style === 'messy' ? r * 0.55 : r * 0.45;
    g.quadraticCurveTo(r * 0.95, nape, r * 0.45, nape);
    g.quadraticCurveTo(r * 0.55, 0, r * 0.1, -r * 0.1);
    g.quadraticCurveTo(-r * 0.4, -r * 0.3, -r * 0.95, -r * 0.2);
    g.closePath();
    if (style === 'balding' || style === 'tonsure') {
      g.save(); g.clip();
      g.fillRect(-r * 1.2, -r * 0.5, r * 2.6, r * 1.6);
      g.restore();
    } else g.fill();
    if (style === 'curly') for (let k = 0; k < 9; k++) ellipse(g, -r * 0.5 + rng.next() * r * 1.5, -r * 0.8 + rng.next() * r, r * 0.3, r * 0.28, rng.next() < 0.5 ? colL : col);
    if (style === 'messy') for (let k = 0; k < 5; k++) blade(g, -r * 0.6 + k * r * 0.35, -r * 0.8, r * 0.5, -Math.PI / 2 - 0.9 + rng.next() * 0.5, 0.3, 0.6, col);
    if (style === 'bun') ellipse(g, r * 0.8, -r * 0.6, r * 0.42, r * 0.38, fill);
    if (style === 'braids') for (let k = 0; k < 5; k++) ellipse(g, r * 0.35, r * 0.7 + k * 1.05, 0.72, 0.6, k % 2 ? colD : col);
    strands(-r * 0.6, -r * 0.95, r * 0.9, r * 0.2, 7);
    return;
  }
  // ---- front view ----
  const fringe = style === 'messy' ? r * -0.18 : style === 'curly' ? -r * 0.12 : style === 'balding' || style === 'tonsure' ? -r * 0.9 : -r * 0.3;
  g.beginPath();
  g.moveTo(-r * 1.03, r * 0.3);
  g.bezierCurveTo(-r * 1.12, -r * 1.22, r * 1.12, -r * 1.22, r * 1.03, r * 0.3);
  // down the sides to the ears, then the fringe line across the brow
  const sideLen = style === 'long' || style === 'braids' ? r * 0.9 : style === 'bun' || style === 'ponytail' ? r * 0.25 : r * 0.1;
  g.lineTo(r * 1.0, sideLen);
  g.quadraticCurveTo(r * 0.85, fringe + r * 0.2, r * 0.6, fringe);
  if (style === 'messy') {
    for (let k = 0; k < 5; k++) { const x = r * 0.6 - (k + 1) * r * 0.24; g.lineTo(x + r * 0.12, fringe + r * 0.25); g.lineTo(x, fringe); }
  } else if (style === 'bun' || style === 'ponytail' || (look.female && style === 'long')) {
    // parted in the middle
    g.quadraticCurveTo(r * 0.25, fringe - r * 0.25, 0, fringe - r * 0.45);
    g.quadraticCurveTo(-r * 0.25, fringe - r * 0.25, -r * 0.6, fringe);
  } else {
    g.quadraticCurveTo(0, fringe + r * 0.12, -r * 0.6, fringe);
  }
  g.quadraticCurveTo(-r * 0.85, fringe + r * 0.2, -r * 1.0, sideLen);
  g.closePath();
  if (style === 'balding' || style === 'tonsure') {
    // only the fringe around the sides remains
    g.save(); g.clip();
    g.fillRect(-r * 1.3, -r * 0.35, r * 2.6, r * 1.3);
    g.restore();
    ellipse(g, -r * 0.3, -r * 0.7, r * 0.28, r * 0.15, 'rgba(255,245,230,0.3)');
  } else g.fill();
  if (style === 'curly') for (let k = 0; k < 12; k++) { const a = Math.PI + (k / 11) * Math.PI; ellipse(g, Math.cos(a) * r * 0.92, Math.sin(a) * r * 0.85 - r * 0.1, r * 0.3, r * 0.28, k % 2 ? colL : col); }
  if (style === 'bun') ellipse(g, 0, -r * 1.02, r * 0.42, r * 0.32, fill);
  if (style === 'braids') {
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) ellipse(g, s * r * 0.92, r * 0.55 + k * 1.02, 0.72, 0.6, k % 2 ? colD : col);
    for (const s of [-1, 1]) ellipse(g, s * r * 0.92, r * 0.55 + 6.2, 0.45, 0.35, '#b83a3a');
  }
  strands(-r * 0.7, -r * 0.95, r * 0.7, fringe + r * 0.1, 8);
}

function hoodBack(g: G, look: Look, r: number, d: 0 | 1 | 3) {
  const hat = look.hat!;
  const col = hat === 'wimple' ? '#ece6d8' : look.hatColor || '#5a4a3a';
  g.fillStyle = lin(g, -r * 1.3, 0, r * 1.3, 0, [[0, lit(col, 0.15)], [1, dim(col, 0.35)]]);
  g.beginPath();
  if (d === 1) g.ellipse(r * 0.2, r * 0.25, r * 1.25, r * 1.35, 0, 0, Math.PI * 2);
  else g.ellipse(0, r * 0.3, r * 1.3, r * 1.35, 0, 0, Math.PI * 2);
  g.fill();
}

function paintHat(g: G, look: Look, r: number, d: 0 | 1 | 3, rng: RNG) {
  const hat = look.hat || 'none';
  if (hat === 'none') return;
  const hc = look.hatColor || '#6b4a30';
  const side = d === 1, back = d === 3;
  const fillOf = (c: string) => lin(g, -r * 1.2, -r * 1.2, r, r * 0.4, [[0, lit(c, 0.3)], [0.5, c], [1, dim(c, 0.4)]]);
  const steel = '#9aa3ad';
  switch (hat) {
    case 'cap': case 'feathercap': {
      g.fillStyle = fillOf(hc);
      g.beginPath();
      g.moveTo(-r * 1.05, -r * 0.2);
      g.bezierCurveTo(-r * 1.1, -r * 1.35, r * 1.1, -r * 1.35, r * 1.05, -r * 0.2);
      g.quadraticCurveTo(0, -r * 0.45, -r * 1.05, -r * 0.2);
      g.fill();
      g.fillStyle = dim(hc, 0.3);
      g.beginPath(); g.ellipse(0, -r * 0.3, r * 1.05, r * 0.22, 0, 0, Math.PI); g.fill();
      if (hat === 'feathercap') { blade(g, r * 0.5, -r * 0.8, r * 1.6, -Math.PI / 2 + 0.6, -0.8, 1.1, '#e8e2d2'); blade(g, r * 0.5, -r * 0.8, r * 1.3, -Math.PI / 2 + 0.5, -0.6, 0.5, '#b8322a'); }
      break;
    }
    case 'strawhat': {
      const bc = look.hatColor || '#d8b870';
      ellipse(g, 0, -r * 0.35, r * 1.75, r * 0.62, lin(g, -r * 1.7, 0, r * 1.7, 0, [[0, lit(bc, 0.3)], [0.5, bc], [1, dim(bc, 0.35)]]));
      g.strokeStyle = rgba(dim(bc, 0.4), 0.55); g.lineWidth = 0.14;
      for (let k = 1; k < 4; k++) { g.beginPath(); g.ellipse(0, -r * 0.35, r * 1.75 * (k / 4), r * 0.62 * (k / 4), 0, 0, Math.PI * 2); g.stroke(); }
      g.fillStyle = fillOf(bc);
      g.beginPath(); g.moveTo(-r * 0.8, -r * 0.4); g.quadraticCurveTo(-r * 0.8, -r * 1.35, 0, -r * 1.35); g.quadraticCurveTo(r * 0.8, -r * 1.35, r * 0.8, -r * 0.4); g.closePath(); g.fill();
      g.fillStyle = '#6b3a2a';
      g.fillRect(-r * 0.8, -r * 0.6, r * 1.6, r * 0.2);
      break;
    }
    case 'kerchief': {
      g.fillStyle = fillOf(hc);
      g.beginPath();
      g.moveTo(-r * 1.08, r * 0.15);
      g.bezierCurveTo(-r * 1.15, -r * 1.3, r * 1.15, -r * 1.3, r * 1.08, r * 0.15);
      if (back) g.quadraticCurveTo(r * 0.5, r * 1.1, 0, r * 1.2), g.quadraticCurveTo(-r * 0.5, r * 1.1, -r * 1.08, r * 0.15);
      else g.quadraticCurveTo(r * 0.8, -r * 0.25, 0, -r * 0.42), g.quadraticCurveTo(-r * 0.8, -r * 0.25, -r * 1.08, r * 0.15);
      g.fill();
      g.strokeStyle = rgba(dim(hc, 0.4), 0.5); g.lineWidth = 0.16;
      g.beginPath(); g.moveTo(-r * 0.6, -r * 0.9); g.quadraticCurveTo(0, -r * 0.6, r * 0.6, -r * 0.9); g.stroke();
      if (back) { ellipse(g, 0, r * 1.1, r * 0.3, r * 0.2, dim(hc, 0.2)); }
      break;
    }
    case 'hood': case 'monkhood': case 'wimple': {
      const col = hat === 'wimple' ? '#ece6d8' : hc;
      g.fillStyle = fillOf(col);
      g.beginPath();
      if (back) { g.ellipse(0, -r * 0.05, r * 1.22, r * 1.3, 0, 0, Math.PI * 2); g.fill(); if (hat !== 'wimple') { g.fillStyle = dim(col, 0.2); g.beginPath(); g.moveTo(-r * 0.3, r * 0.6); g.quadraticCurveTo(0, r * 2, r * 0.3, r * 0.6); g.fill(); } break; }
      if (side) {
        g.moveTo(-r * 0.7, -r * 1.0);
        g.bezierCurveTo(r * 0.2, -r * 1.55, r * 1.55, -r * 0.8, r * 1.3, r * 0.6);
        g.quadraticCurveTo(r * 1.1, r * 1.35, 0, r * 1.25);
        g.quadraticCurveTo(-r * 0.2, r * 0.3, -r * 0.35, -r * 0.2);
        g.quadraticCurveTo(-r * 0.55, -r * 0.7, -r * 0.7, -r * 1.0);
      } else {
        // frame around the face
        g.moveTo(-r * 1.25, r * 1.25);
        g.bezierCurveTo(-r * 1.5, -r * 1.55, r * 1.5, -r * 1.55, r * 1.25, r * 1.25);
        g.lineTo(r * 0.72, r * 1.05);
        g.quadraticCurveTo(r * 0.95, -r * 0.55, 0, -r * 0.7);
        g.quadraticCurveTo(-r * 0.95, -r * 0.55, -r * 0.72, r * 1.05);
        g.closePath();
      }
      g.fill();
      g.strokeStyle = rgba(dim(col, 0.45), 0.6); g.lineWidth = 0.2;
      if (!side) { g.beginPath(); g.moveTo(-r * 0.78, r * 0.9); g.quadraticCurveTo(-r * 1.0, -r * 0.5, 0, -r * 0.82); g.quadraticCurveTo(r * 1.0, -r * 0.5, r * 0.78, r * 0.9); g.stroke(); }
      if (hat === 'wimple' && !side) { g.fillStyle = '#e0dacb'; g.beginPath(); g.moveTo(-r * 0.7, r * 0.85); g.quadraticCurveTo(0, r * 1.35, r * 0.7, r * 0.85); g.lineTo(r * 0.8, r * 1.3); g.lineTo(-r * 0.8, r * 1.3); g.closePath(); g.fill(); }
      break;
    }
    case 'coif': case 'bascinet': case 'sallet': case 'kettle': {
      const m = hat === 'sallet' && look.hatColor ? look.hatColor : steel;
      const metal = (c: string) => lin(g, -r * 1.1, -r * 1.1, r * 0.9, r * 0.6, [[0, lit(c, 0.55)], [0.35, c], [1, dim(c, 0.45)]]);
      if (hat === 'coif' || hat === 'bascinet') {
        // mail around the face and neck
        g.save();
        g.beginPath();
        if (back) g.ellipse(0, r * 0.1, r * 1.2, r * 1.3, 0, 0, Math.PI * 2);
        else if (side) { g.moveTo(-r * 0.55, -r * 1.05); g.bezierCurveTo(r * 0.3, -r * 1.45, r * 1.45, -r * 0.8, r * 1.25, r * 0.7); g.quadraticCurveTo(r * 0.9, r * 1.4, -r * 0.2, r * 1.3); g.quadraticCurveTo(-r * 0.3, r * 0.5, -r * 0.4, 0); g.closePath(); }
        else { g.moveTo(-r * 1.2, r * 1.3); g.bezierCurveTo(-r * 1.4, -r * 1.45, r * 1.4, -r * 1.45, r * 1.2, r * 1.3); g.lineTo(r * 0.68, r * 1.05); g.quadraticCurveTo(r * 0.9, -r * 0.45, 0, -r * 0.55); g.quadraticCurveTo(-r * 0.9, -r * 0.45, -r * 0.68, r * 1.05); g.closePath(); }
        g.clip();
        mailTexture(g, -r * 1.6, -r * 1.6, r * 3.2, r * 3.2, '#848d96');
        g.restore();
      }
      if (hat === 'kettle') {
        ellipse(g, 0, -r * 0.35, r * 1.55, r * 0.5, metal(m));
        g.fillStyle = metal(m);
        g.beginPath(); g.moveTo(-r * 0.95, -r * 0.4); g.bezierCurveTo(-r * 1.0, -r * 1.45, r * 1.0, -r * 1.45, r * 0.95, -r * 0.4); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.2;
        g.beginPath(); g.moveTo(-r * 0.5, -r * 1.05); g.quadraticCurveTo(-r * 0.75, -r * 0.8, -r * 0.8, -r * 0.5); g.stroke();
      }
      if (hat === 'bascinet') {
        g.fillStyle = metal(m);
        g.beginPath(); g.moveTo(-r * 1.0, -r * 0.1); g.quadraticCurveTo(-r * 1.0, -r * 1.2, side ? -r * 0.2 : 0, -r * 1.55); g.quadraticCurveTo(r * 1.0, -r * 1.2, r * 1.0, -r * 0.1); g.quadraticCurveTo(0, -r * 0.35, -r * 1.0, -r * 0.1); g.fill();
      }
      if (hat === 'sallet') {
        g.fillStyle = metal(m);
        g.beginPath();
        if (side) { g.moveTo(-r * 1.05, r * 0.6); g.quadraticCurveTo(-r * 1.2, -r * 1.3, r * 0.3, -r * 1.2); g.quadraticCurveTo(r * 1.4, -r * 0.9, r * 2.0, r * 0.6); g.quadraticCurveTo(r * 0.5, r * 0.9, -r * 1.05, r * 0.6); }
        else { g.moveTo(-r * 1.15, r * 0.75); g.bezierCurveTo(-r * 1.3, -r * 1.4, r * 1.3, -r * 1.4, r * 1.15, r * 0.75); g.quadraticCurveTo(0, r * 1.0, -r * 1.15, r * 0.75); }
        g.fill();
        if (!back) {
          g.fillStyle = '#0e0b0a';
          if (side) g.fillRect(-r * 1.1, r * 0.02, r * 0.9, r * 0.14);
          else g.fillRect(-r * 0.8, r * 0.05, r * 1.6, r * 0.16);
        }
        g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 0.22;
        g.beginPath(); g.moveTo(-r * 0.6, -r * 0.95); g.quadraticCurveTo(-r * 0.9, -r * 0.6, -r * 0.9, -r * 0.1); g.stroke();
      }
      break;
    }
    case 'chaperon': {
      g.fillStyle = fillOf(hc);
      g.beginPath(); g.ellipse(0, -r * 0.65, r * 1.25, r * 0.62, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = dim(hc, 0.2);
      for (let k = 0; k < 5; k++) { const a = Math.PI + (k / 4) * Math.PI; ellipse(g, Math.cos(a) * r * 0.9, -r * 0.65 + Math.sin(a) * r * 0.4, r * 0.35, r * 0.25, k % 2 ? hc : dim(hc, 0.2)); }
      if (side || back) { g.fillStyle = hc; g.beginPath(); g.moveTo(r * 0.6, -r * 0.4); g.quadraticCurveTo(r * 1.5, r * 0.5, r * 1.1, r * 1.8); g.lineTo(r * 0.7, r * 1.6); g.quadraticCurveTo(r * 1.0, r * 0.4, r * 0.3, -r * 0.3); g.fill(); }
      break;
    }
    case 'circlet': {
      g.strokeStyle = lin(g, -r, 0, r, 0, [[0, '#f6e39a'], [0.5, '#c79a2c'], [1, '#8a6a18']]);
      g.lineWidth = 0.55;
      g.beginPath();
      if (side) g.ellipse(r * 0.1, -r * 0.45, r * 1.0, r * 0.3, 0.1, 0, Math.PI * 2);
      else g.ellipse(0, -r * 0.42, r * 1.0, r * 0.3, 0, 0, Math.PI);
      g.stroke();
      if (!back && !side) ellipse(g, 0, -r * 0.14, 0.4, 0.4, '#b8322a');
      break;
    }
  }
  void rng;
}

export { clamp };
