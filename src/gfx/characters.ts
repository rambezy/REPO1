// Procedural character sprites. A `Look` describes a person (skin, hair,
// clothes, armour, build) and is painted into a sheet of 24x24 frames:
// rows are directions (down, left, right, up), columns are poses.

import { PixelBuffer, sheetFromBuffers } from './pixel';
import { P, SKIN, SkinTone, HAIR, CLOTH } from './palette';
import { shade, hashStr, RNG } from '../engine/util';

export type HairStyle = 'short' | 'messy' | 'long' | 'bald' | 'balding' | 'braids' | 'bun' | 'tonsure' | 'ponytail' | 'curly' | 'none';
export type BeardStyle = 'none' | 'stubble' | 'short' | 'full' | 'long' | 'moustache' | 'goatee';
export type HatStyle = 'none' | 'cap' | 'hood' | 'strawhat' | 'kerchief' | 'wimple' | 'coif' | 'kettle' | 'bascinet' | 'sallet' | 'chaperon' | 'monkhood' | 'circlet' | 'feathercap';
export type OuterStyle = 'none' | 'apron' | 'gambeson' | 'mail' | 'plate' | 'brigandine' | 'tabard' | 'vest' | 'robe' | 'dress' | 'leather' | 'noble';
export type Build = 'normal' | 'broad' | 'thin' | 'fat' | 'child';

export interface Look {
  skin: SkinTone;
  hair: string;
  hairStyle: HairStyle;
  beard?: BeardStyle;
  beardColor?: string;
  eyes?: string;
  hat?: HatStyle;
  hatColor?: string;
  shirt: string;
  outer?: OuterStyle;
  outerColor?: string;
  trim?: string;
  legs: string;
  boots: string;
  belt?: string;
  build?: Build;
  cape?: string;
  female?: boolean;
  old?: boolean;
  apronColor?: string;
  freckles?: boolean;
  scar?: boolean;
  eyepatch?: boolean;
  // Portrait-only details.
  face?: FaceShape;
  portraitBg?: string;
}

export interface FaceShape {
  jaw?: 'round' | 'square' | 'narrow' | 'heavy';
  nose?: 'small' | 'button' | 'long' | 'broad' | 'hooked';
  eyeShape?: 'round' | 'narrow' | 'sleepy' | 'wide';
  brows?: 'thin' | 'thick' | 'bushy';
  mouth?: 'small' | 'wide' | 'full';
  wrinkles?: number; // 0..3
  cheeks?: boolean;
  earrings?: boolean;
}

export const FRAME = { IDLE: 0, WALK_A: 1, WALK_B: 2, WINDUP: 3, STRIKE: 4, BLOCK: 5, HURT: 6, DEAD: 7, SIT: 8, CROUCH: 9, WORK: 10 } as const;
export const FRAME_COUNT = 11;
export const FW = 24, FH = 24;

interface Geom {
  child: boolean;
  headX: number; headY: number; // top-left of 8x8 head box (body-local)
  tx0: number; tx1: number;     // torso x range inclusive
  ty0: number; ty1: number;     // torso y range (shoulders to hem)
  belt: number;                 // belt row
  lx: [number, number];         // left leg x start, right leg x start (3px legs)
  ly0: number;                  // leg top row
  armL: number; armR: number;   // arm x (2px wide, left col)
  armY0: number; armY1: number; // arm rows (hand at armY1+1)
}

function geom(build: Build): Geom {
  switch (build) {
    case 'child':
      return { child: true, headX: 4, headY: 7, tx0: 5, tx1: 10, ty0: 15, ty1: 19, belt: 18, lx: [5, 8], ly0: 20, armL: 3, armR: 11, armY0: 15, armY1: 18 };
    case 'broad':
      return { child: false, headX: 4, headY: 2, tx0: 3, tx1: 12, ty0: 11, ty1: 18, belt: 15, lx: [4, 9], ly0: 19, armL: 1, armR: 13, armY0: 11, armY1: 16 };
    case 'fat':
      return { child: false, headX: 4, headY: 2, tx0: 3, tx1: 12, ty0: 11, ty1: 18, belt: 16, lx: [5, 8], ly0: 19, armL: 1, armR: 13, armY0: 11, armY1: 16 };
    case 'thin':
      return { child: false, headX: 4, headY: 2, tx0: 5, tx1: 10, ty0: 11, ty1: 18, belt: 15, lx: [5, 8], ly0: 19, armL: 3, armR: 11, armY0: 11, armY1: 16 };
    default:
      return { child: false, headX: 4, headY: 2, tx0: 4, tx1: 11, ty0: 11, ty1: 18, belt: 15, lx: [5, 8], ly0: 19, armL: 2, armR: 12, armY0: 11, armY1: 16 };
  }
}

const OX = 4; // body-local x -> frame x

class Painter {
  b = new PixelBuffer(FW, FH);
  dy = 0; // vertical offset applied to upper body (crouch/sit)
  px(x: number, y: number, c: string) { this.b.px(x + OX, y, c); }
  rect(x: number, y: number, w: number, h: number, c: string) { this.b.rect(x + OX, y, w, h, c); }
  on(x: number, y: number, c: string) { this.b.pxOn(x + OX, y, c); }
  get(x: number, y: number) { return this.b.get(x + OX, y); }
}

function skinRamp(t: SkinTone) { return SKIN[t] || SKIN.fair; }

/** Paints one frame. dir: 0 down, 1 left, 3 up (right is mirrored from left). */
function paint(look: Look, dir: 0 | 1 | 3, frame: number): PixelBuffer {
  const g = geom(look.build || 'normal');
  const p = new Painter();
  const sk = skinRamp(look.skin);
  const skin = sk[2], skinD = sk[1], skinL = sk[3], skinDD = sk[0];
  const hair = look.hair, hairD = shade(look.hair, -0.3), hairL = shade(look.hair, 0.22);
  const shirt = look.shirt, shirtD = shade(shirt, -0.28), shirtL = shade(shirt, 0.15);
  const legs = look.legs, legsD = shade(legs, -0.3);
  const boots = look.boots, bootsD = shade(boots, -0.35);
  const outer = look.outer || 'none';
  const oc = look.outerColor || shirt;
  const ocD = shade(oc, -0.28), ocL = shade(oc, 0.18);
  const belt = look.belt || P.wood1;

  if (frame === FRAME.DEAD) return paintDead(look, g);

  const crouch = frame === FRAME.CROUCH ? 2 : 0;
  const sit = frame === FRAME.SIT ? 3 : 0;
  const up = dir === 3;
  const side = dir === 1;
  const walkA = frame === FRAME.WALK_A, walkB = frame === FRAME.WALK_B;
  const bob = walkA || walkB ? 1 : 0;
  const Y = crouch + sit + (bob ? 0 : 0);

  const longSkirt = outer === 'robe' || outer === 'dress';

  // ---------- legs & boots ----------
  const ly0 = g.ly0;
  const footY = 23;
  if (sit) {
    // Seated: shins visible below the hem, feet apart.
    if (!side) {
      p.rect(g.lx[0], footY - 2, 3, 2, boots);
      p.rect(g.lx[1], footY - 2, 3, 2, boots);
      p.rect(g.lx[0], footY - 4 + 1, 3, 1, legs);
      p.rect(g.lx[1], footY - 4 + 1, 3, 1, legs);
    } else {
      p.rect(4, footY - 3, 5, 2, legs); // thigh forward
      p.rect(3, footY - 2, 2, 2, boots);
    }
  } else if (!longSkirt) {
    const legLen = footY - 2 - ly0 - crouch; // rows of hose before boots
    if (!side) {
      const liftL = walkA ? 1 : 0, liftR = walkB ? 1 : 0;
      for (const [i, lift] of [[0, liftL], [1, liftR]] as [number, number][]) {
        const x = g.lx[i];
        const top = ly0 + crouch;
        p.rect(x, top, 3, Math.max(1, legLen - lift + 1), i === 1 ? legs : legs);
        p.rect(x + 2, top, 1, Math.max(1, legLen - lift + 1), legsD);
        p.rect(x, footY - 1 - lift, 3, 2, boots);
        p.rect(x + 2, footY - 1 - lift, 1, 2, bootsD);
        if (!up) p.px(x, footY - lift, bootsD);
      }
    } else {
      const top = ly0 + crouch;
      if (walkA || walkB) {
        // stride: front leg forward-left, back leg back-right
        const back = walkA ? legsD : legs;
        const front = walkA ? legs : legsD;
        // back leg
        p.rect(8, top, 2, legLen, back);
        p.rect(9, top + legLen - 1, 2, 1, back);
        p.rect(9, footY - 1, 3, 2, bootsD);
        // front leg
        p.rect(6, top, 2, legLen - 1, front);
        p.rect(5, top + legLen - 2, 2, 2, front);
        p.rect(3, footY - 1, 4, 2, boots);
      } else {
        p.rect(6, top, 4, legLen + 1, legs);
        p.rect(9, top, 1, legLen + 1, legsD);
        p.rect(5, footY - 1, 5, 2, boots);
        p.px(9, footY, bootsD);
      }
    }
  } else {
    // Long skirt / robe: only feet peek out.
    if (!side) {
      const liftL = walkA ? 1 : 0, liftR = walkB ? 1 : 0;
      p.rect(g.lx[0], footY - 1 - liftL, 3, 2, boots);
      p.rect(g.lx[1], footY - 1 - liftR, 3, 2, boots);
    } else {
      p.rect(walkA ? 3 : 5, footY - 1, 4, 2, boots);
      if (walkA || walkB) p.rect(9, footY - 1, 3, 2, bootsD);
    }
  }

  // ---------- cape behind (drawn before torso) ----------
  if (look.cape && !sit) {
    const cc = look.cape, ccD = shade(cc, -0.3);
    if (up) {
      p.rect(g.tx0 - 1, g.ty0 + Y, g.tx1 - g.tx0 + 3, g.ty1 - g.ty0 + 4 - crouch, cc);
      p.rect(g.tx1 + 1, g.ty0 + Y, 1, g.ty1 - g.ty0 + 4 - crouch, ccD);
    } else if (side) {
      p.rect(9, g.ty0 + Y, 3, g.ty1 - g.ty0 + 4 - crouch, ccD);
    } else {
      p.rect(g.tx0 - 1, g.ty0 + Y + 1, 1, 6, ccD);
      p.rect(g.tx1 + 1, g.ty0 + Y + 1, 1, 6, ccD);
    }
  }

  // ---------- torso ----------
  const ty0 = g.ty0 + Y, ty1 = g.ty1 + (longSkirt ? 4 : 0) + (sit ? -1 : 0);
  const torsoCol = outer === 'dress' || outer === 'robe' ? oc : shirt;
  const torsoD = outer === 'dress' || outer === 'robe' ? ocD : shirtD;
  const tx0 = side ? g.tx0 + 1 : g.tx0;
  const tx1 = side ? g.tx1 - 1 : g.tx1;
  for (let y = ty0; y <= Math.min(ty1, 22); y++) {
    let x0 = tx0, x1 = tx1;
    if (longSkirt && y > g.ty1 && !side) { x0 -= 1; x1 += 1; }
    if (longSkirt && y > g.ty1 && side) { x0 -= 1; }
    if (look.build === 'fat' && y >= ty0 + 3 && y <= ty0 + 6 && !side) { x0 -= 0; x1 += 0; }
    for (let x = x0; x <= x1; x++) p.px(x, y, x === x1 ? torsoD : torsoCol);
  }
  if (look.build === 'fat') {
    // belly
    if (side) p.rect(tx0 - 1, ty0 + 3, 1, 4, torsoCol);
  }
  // hem shading
  p.rect(tx0, Math.min(ty1, 22), tx1 - tx0 + 1, 1, torsoD);

  // Outer garments over the torso.
  const tw = tx1 - tx0 + 1;
  const hemY = Math.min(ty1, 22);
  switch (outer) {
    case 'apron': {
      const ac = look.apronColor || P.wood2;
      if (!up) {
        const ax0 = side ? tx0 - 1 : tx0 + 1, aw = side ? 3 : tw - 2;
        p.rect(ax0, ty0 + 2, aw, hemY - ty0 - 1 + 1, ac);
        p.rect(ax0, ty0 + 2, aw, 1, shade(ac, 0.15));
        if (!side) { p.px(tx0 + 1, ty0, ac); p.px(tx1 - 1, ty0, ac); p.px(tx0 + 1, ty0 + 1, ac); p.px(tx1 - 1, ty0 + 1, ac); }
      } else {
        p.rect(tx0, g.belt + Y, tw, 1, look.apronColor || P.wood2);
      }
      break;
    }
    case 'gambeson': case 'mail': case 'plate': case 'brigandine': case 'tabard': case 'leather': case 'vest': case 'noble': {
      const isMail = outer === 'mail' || outer === 'tabard';
      const base = outer === 'mail' ? P.metal2 : outer === 'plate' ? P.metal3 : oc;
      for (let y = ty0; y <= hemY + (outer === 'vest' ? -2 : 1); y++) {
        for (let x = tx0; x <= tx1; x++) {
          let c = base;
          if (isMail || (outer === 'plate' && y > g.belt + Y)) c = ((x + y) & 1) ? P.metal2 : P.metal3;
          if (outer === 'gambeson') c = (x - tx0) % 2 === 1 ? shade(oc, -0.12) : oc;
          if (outer === 'plate' && y <= g.belt + Y) c = x === tx0 + 1 && y < ty0 + 4 ? P.metal5 : (x === tx1 ? P.metal2 : P.metal3);
          if (outer === 'vest' && !up && !side && (x === Math.floor((tx0 + tx1) / 2) || x === Math.ceil((tx0 + tx1) / 2))) c = shirt;
          if (x === tx1 && outer !== 'plate') c = shade(c, -0.22);
          p.px(x, y, c);
        }
      }
      if (outer === 'brigandine') {
        for (let y = ty0 + 1; y <= g.belt + Y; y += 3) for (let x = tx0 + 1 + (y % 2); x < tx1; x += 3) p.px(x, y, shade(oc, 0.45));
      }
      if (outer === 'tabard') {
        // tabard panel over mail with trim stripe
        const tc = oc, tcD = ocD;
        const x0 = side ? tx0 : tx0 + 1, x1 = side ? tx1 : tx1 - 1;
        for (let y = ty0; y <= hemY + 1; y++) for (let x = x0; x <= x1; x++) p.px(x, y, x === x1 ? tcD : tc);
        if (look.trim && !side) {
          const mid = Math.floor((tx0 + tx1) / 2);
          p.rect(mid, ty0 + 1, 2, hemY - ty0, look.trim);
          p.rect(mid - 2, ty0 + 3, 6, 1, look.trim);
        }
      }
      if (outer === 'noble' && look.trim) {
        p.rect(tx0, hemY, tw, 1, look.trim);
        if (!side && !up) p.rect(Math.floor((tx0 + tx1) / 2), ty0, 2, hemY - ty0, look.trim);
      }
      if (outer === 'leather' && !up && !side) {
        const mid = Math.floor((tx0 + tx1) / 2);
        for (let y = ty0 + 1; y < g.belt + Y; y += 2) p.px(mid, y, shade(oc, 0.3));
      }
      break;
    }
    case 'robe': {
      // rope belt and hood fold
      break;
    }
    case 'dress': {
      if (!up && !side) {
        p.rect(tx0 + 1, ty0, tw - 2, 3, shade(oc, 0.1)); // bodice
        if (look.apronColor) {
          p.rect(tx0 + 2, g.belt + Y + 1, tw - 4, hemY - (g.belt + Y) - 1, look.apronColor);
          p.rect(tx1 - 2, g.belt + Y + 1, 1, hemY - (g.belt + Y) - 1, shade(look.apronColor, -0.15));
        }
      }
      if (side && look.apronColor) p.rect(tx0 - 1, g.belt + Y + 1, 2, hemY - (g.belt + Y) - 1, look.apronColor);
      break;
    }
  }
  // collar / neckline
  if (!up) {
    const midL = side ? tx0 : Math.floor((tx0 + tx1) / 2);
    if (outer === 'none' || outer === 'apron' || outer === 'vest' || outer === 'dress') {
      p.px(midL, ty0, skinD);
      if (!side) p.px(midL + 1, ty0, skinD);
    }
  }
  // belt
  if (outer !== 'robe' && outer !== 'dress' && outer !== 'plate' && !sit) {
    p.rect(tx0, g.belt + Y, tw, 1, belt);
    if (!up && !side) p.px(Math.floor((tx0 + tx1) / 2), g.belt + Y, P.gold2);
  }
  if (outer === 'robe') {
    p.rect(tx0, g.belt + Y, tw, 1, P.thatch2); // rope cord
    if (!up && !side) { p.px(Math.floor((tx0 + tx1) / 2), g.belt + Y + 1, P.thatch2); p.px(Math.floor((tx0 + tx1) / 2), g.belt + Y + 2, P.thatch2); }
  }

  // ---------- arms ----------
  const sleeve = outer === 'mail' || outer === 'tabard' ? P.metal2
    : outer === 'plate' ? P.metal3
    : outer === 'gambeson' || outer === 'brigandine' || outer === 'leather' || outer === 'robe' || outer === 'noble' ? oc
    : outer === 'dress' ? oc
    : shirt;
  const sleeveD = shade(sleeve, -0.25);
  const handC = outer === 'plate' ? P.metal3 : skin;
  const drawArm = (ax: number, y0: number, y1: number, hx: number, hy: number, dark: boolean) => {
    p.rect(ax, y0, 2, y1 - y0 + 1, dark ? sleeveD : sleeve);
    p.px(ax + 1, y0, dark ? sleeveD : sleeve);
    p.rect(hx, hy, 2, 1, dark ? shade(handC, -0.2) : handC);
  };
  const aY0 = g.armY0 + Y, aY1 = g.armY1 + Y;
  if (!side) {
    let lHandY = aY1 + 1, rHandY = aY1 + 1;
    if (walkA) { lHandY -= 1; } else if (walkB) { rHandY -= 1; }
    if (frame === FRAME.WINDUP || frame === FRAME.WORK) {
      // right arm raised
      drawArm(g.armL, aY0, lHandY - 1, g.armL, lHandY, false);
      if (!up) {
        p.rect(g.armR, aY0 - 4, 2, 5, sleeve);
        p.rect(g.armR, aY0 - 5, 2, 1, handC);
      } else {
        p.rect(g.armR, aY0 - 4, 2, 5, sleeveD);
        p.rect(g.armR, aY0 - 5, 2, 1, handC);
      }
    } else if (frame === FRAME.STRIKE) {
      drawArm(g.armL, aY0, lHandY - 1, g.armL, lHandY, false);
      if (!up) {
        p.rect(g.armR - 1, aY0 + 1, 2, 5, sleeve);
        p.rect(g.armR - 2, aY0 + 6, 2, 1, handC);
      } else {
        p.rect(g.armR, aY0, 2, 4, sleeveD);
      }
    } else if (frame === FRAME.BLOCK) {
      if (!up) {
        p.rect(g.armL + 1, aY0 + 1, 2, 3, sleeve);
        p.rect(g.armR - 1, aY0 + 1, 2, 3, sleeve);
        p.rect(g.armL + 3, aY0 + 3, 2, 1, handC);
        p.rect(g.armR - 3, aY0 + 3, 2, 1, handC);
      } else {
        p.rect(g.armL, aY0, 2, 3, sleeveD);
        p.rect(g.armR, aY0, 2, 3, sleeveD);
      }
    } else if (sit) {
      drawArm(g.armL, aY0, aY1 - 1, g.armL + 1, aY1, false);
      drawArm(g.armR, aY0, aY1 - 1, g.armR - 1, aY1, true);
    } else {
      drawArm(g.armL, aY0, lHandY - 1, g.armL, lHandY, false);
      drawArm(g.armR, aY0, rHandY - 1, g.armR, rHandY, true);
    }
  } else {
    // side view: one near arm
    const ax = 7;
    if (frame === FRAME.WINDUP || frame === FRAME.WORK) {
      p.rect(ax + 1, aY0 - 3, 2, 5, sleeve);
      p.rect(ax + 1, aY0 - 4, 2, 1, handC);
    } else if (frame === FRAME.STRIKE) {
      p.rect(ax - 3, aY0 + 1, 5, 2, sleeve);
      p.rect(ax - 5, aY0 + 1, 2, 2, handC);
    } else if (frame === FRAME.BLOCK) {
      p.rect(ax - 2, aY0 + 1, 3, 2, sleeve);
      p.rect(ax - 4, aY0 + 1, 2, 2, handC);
    } else {
      const swing = walkA ? -2 : walkB ? 2 : 0;
      p.rect(ax, aY0, 2, aY1 - aY0, sleeve);
      p.rect(ax + (swing > 0 ? 1 : swing < 0 ? -1 : 0), aY1 - 1, 2, 1, sleeve);
      p.rect(ax + swing / 2, aY1, 2, 1, sleeve);
      p.rect(ax + swing / 2, aY1 + 1, 2, 1, handC);
    }
  }

  // ---------- head ----------
  const hx = g.headX, hy = g.headY + Y;
  paintHead(p, look, dir, hx, hy, frame, { skin, skinD, skinL, skinDD, hair, hairD, hairL });

  // children are drawn with a smaller body but the same head, fine as is.
  // Outline and done.
  p.b.outline(P.ink);
  return p.b;
}

interface HeadCols { skin: string; skinD: string; skinL: string; skinDD: string; hair: string; hairD: string; hairL: string }

function paintHead(p: Painter, look: Look, dir: 0 | 1 | 3, hx: number, hy: number, frame: number, c: HeadCols) {
  const side = dir === 1, up = dir === 3;
  const hat = look.hat || 'none';
  const hs = look.hairStyle;
  // base head shape (8 wide x 8 tall, rounded)
  const rows: [number, number][] = side
    ? [[2, 6], [1, 7], [1, 7], [0, 7], [0, 7], [1, 7], [1, 6], [2, 5]]
    : [[1, 6], [0, 7], [0, 7], [0, 7], [0, 7], [0, 7], [0, 7], [1, 6]];
  rows.forEach(([a, b], j) => {
    for (let x = a; x <= b; x++) p.px(hx + x, hy + 1 + j, x === b && !side ? c.skinD : c.skin);
  });
  if (side) {
    p.px(hx - 1 + 1, hy + 6, c.skin); // nose
    p.px(hx, hy + 6, c.skin);
    p.px(hx + 5, hy + 5, c.skinD); // ear
    p.px(hx + 5, hy + 6, c.skinD);
  }
  // face
  const hurt = frame === FRAME.HURT;
  if (!up) {
    const eye = '#2a1d18';
    if (!side) {
      if (look.eyepatch) {
        p.px(hx + 2, hy + 5, eye); p.px(hx + 2, hy + 4, eye);
        p.px(hx + 1, hy + 3, eye); p.px(hx + 3, hy + 3, eye);
      } else if (hurt) {
        p.px(hx + 2, hy + 5, eye); p.px(hx + 1, hy + 5, eye);
      } else {
        p.px(hx + 2, hy + 4, eye); p.px(hx + 2, hy + 5, eye);
      }
      if (hurt) { p.px(hx + 5, hy + 5, eye); p.px(hx + 6, hy + 5, eye); }
      else { p.px(hx + 5, hy + 4, eye); p.px(hx + 5, hy + 5, eye); }
      if (look.female || look.build === 'child') {
        p.px(hx + 1, hy + 6, shade(c.skin, -0.08));
        p.px(hx + 6, hy + 6, shade(c.skin, -0.08));
      }
      if (look.freckles) { p.px(hx + 1, hy + 6, c.skinD); p.px(hx + 6, hy + 6, c.skinD); }
      p.px(hx + 3, hy + 7, c.skinD);
      p.px(hx + 4, hy + 7, c.skinD);
      if (look.scar) { p.px(hx + 5, hy + 3, '#d8a0a0'); p.px(hx + 6, hy + 4, '#d8a0a0'); p.px(hx + 6, hy + 6, '#d8a0a0'); }
    } else {
      if (look.eyepatch) { p.px(hx + 1, hy + 4, eye); p.px(hx + 1, hy + 5, eye); p.px(hx + 2, hy + 3, eye); p.px(hx + 3, hy + 3, eye); }
      else if (hurt) { p.px(hx + 1, hy + 5, eye); p.px(hx + 2, hy + 5, eye); }
      else { p.px(hx + 1, hy + 4, eye); p.px(hx + 1, hy + 5, eye); }
      p.px(hx + 1, hy + 7, c.skinD);
    }
  }

  // beard
  const beard = look.beard || 'none';
  const bc = look.beardColor || look.hair;
  const bcD = shade(bc, -0.25);
  if (!up && beard !== 'none') {
    if (!side) {
      if (beard === 'stubble') {
        for (let x = 1; x <= 6; x++) if ((x + hy) % 2 === 0) p.px(hx + x, hy + 7, bcD);
        p.px(hx + 2, hy + 8, bcD); p.px(hx + 5, hy + 8, bcD);
      } else if (beard === 'moustache') {
        p.px(hx + 2, hy + 6, bc); p.px(hx + 3, hy + 6, bc); p.px(hx + 4, hy + 6, bc); p.px(hx + 5, hy + 6, bc);
        p.px(hx + 2, hy + 7, bc); p.px(hx + 5, hy + 7, bc);
      } else if (beard === 'goatee') {
        p.px(hx + 3, hy + 6, bc); p.px(hx + 4, hy + 6, bc);
        p.px(hx + 3, hy + 8, bc); p.px(hx + 4, hy + 8, bc); p.px(hx + 3, hy + 9, bcD); p.px(hx + 4, hy + 9, bcD);
      } else {
        const len = beard === 'short' ? 1 : beard === 'full' ? 2 : 4;
        for (let x = 0; x <= 7; x++) for (let y = 6; y <= 7 + len; y++) {
          if (y === 6 && (x === 0 || x === 7)) continue;
          if (y >= 8 && (x === 0 || x === 7)) continue;
          if (y >= 9 && (x === 1 || x === 6)) continue;
          if (y === 7 && (x === 3 || x === 4)) continue; // mouth
          p.px(hx + x, hy + y, x >= 6 ? bcD : bc);
        }
      }
    } else {
      if (beard === 'stubble') { p.px(hx + 1, hy + 7, bcD); p.px(hx + 2, hy + 8, bcD); p.px(hx + 3, hy + 7, bcD); }
      else if (beard === 'moustache') { p.px(hx, hy + 6, bc); p.px(hx + 1, hy + 6, bc); }
      else {
        const len = beard === 'short' || beard === 'goatee' ? 1 : beard === 'full' ? 2 : 4;
        for (let x = 0; x <= 4; x++) for (let y = 6; y <= 7 + len; y++) {
          if (y > 8 && x > 3) continue;
          if (y === 6 && x > 1 && beard === 'goatee') continue;
          p.px(hx + x, hy + y, x >= 3 ? bcD : bc);
        }
      }
    }
  }

  // hair (skipped under full-cover hats)
  const coverAll = hat === 'hood' || hat === 'coif' || hat === 'bascinet' || hat === 'sallet' || hat === 'wimple' || hat === 'monkhood';
  if (!coverAll) paintHair(p, look, dir, hx, hy, c, hat !== 'none');
  if (hat !== 'none') paintHat(p, look, dir, hx, hy, c);
}

function paintHair(p: Painter, look: Look, dir: 0 | 1 | 3, hx: number, hy: number, c: HeadCols, hatted: boolean) {
  const side = dir === 1, up = dir === 3;
  const hs = look.hairStyle;
  const H = c.hair, D = c.hairD, L = c.hairL;
  if (hs === 'none') return;
  if (hs === 'bald') {
    if (up || side) { for (let y = 4; y <= 6; y++) { p.px(hx + (side ? 5 : 0), hy + y, H); if (!side) p.px(hx + 7, hy + y, H); } }
    else { p.px(hx, hy + 4, H); p.px(hx, hy + 5, H); p.px(hx + 7, hy + 4, D); p.px(hx + 7, hy + 5, D); }
    p.px(hx + 2, hy + 1, c.skinL); // shine
    return;
  }
  if (hs === 'tonsure') {
    // ring of hair around a bald crown
    if (!side) {
      for (let x = 0; x <= 7; x++) p.px(hx + x, hy + 3, x > 5 ? D : H);
      p.px(hx, hy + 4, H); p.px(hx + 7, hy + 4, D); p.px(hx, hy + 5, H); p.px(hx + 7, hy + 5, D);
      if (up) for (let x = 0; x <= 7; x++) { p.px(hx + x, hy + 4, H); p.px(hx + x, hy + 5, H); p.px(hx + x, hy + 6, D); }
    } else {
      for (let x = 1; x <= 7; x++) p.px(hx + x, hy + 3, H);
      for (let y = 4; y <= 6; y++) { p.px(hx + 6, hy + y, H); p.px(hx + 7, hy + y, D); }
    }
    p.px(hx + 3, hy + 1, c.skinL);
    return;
  }
  if (hs === 'balding') {
    if (!side) {
      p.px(hx, hy + 3, H); p.px(hx, hy + 4, H); p.px(hx, hy + 5, H);
      p.px(hx + 7, hy + 3, D); p.px(hx + 7, hy + 4, D); p.px(hx + 7, hy + 5, D);
      if (up) for (let x = 0; x <= 7; x++) for (let y = 4; y <= 6; y++) p.px(hx + x, hy + y, H);
    } else {
      for (let y = 3; y <= 6; y++) { p.px(hx + 6, hy + y, H); p.px(hx + 7, hy + y, D); }
    }
    p.px(hx + 3, hy + 1, c.skinL);
    return;
  }
  // Common top volume
  const top = hatted ? 2 : 0;
  if (!side) {
    for (let x = 0; x <= 7; x++) {
      const y0 = x === 0 || x === 7 ? 1 : 0;
      for (let y = y0 + top; y <= (up ? 7 : 2); y++) p.px(hx + x, hy + y, x >= 6 ? D : (y === 0 && x < 3 ? L : H));
    }
    if (!up) {
      // fringe
      if (hs === 'messy' || hs === 'curly') { p.px(hx + 1, hy + 3, H); p.px(hx + 3, hy + 3, H); p.px(hx + 6, hy + 3, D); }
      else { p.px(hx + 1, hy + 3, H); p.px(hx + 2, hy + 3, H); }
      // sides
      p.px(hx, hy + 3, H); p.px(hx, hy + 4, H); p.px(hx + 7, hy + 3, D); p.px(hx + 7, hy + 4, D);
    } else {
      p.px(hx, hy + 8, H); p.px(hx + 7, hy + 8, D);
    }
    if (hs === 'messy') { p.px(hx + 2, hy - 1, H); p.px(hx + 5, hy - 1, H); }
    if (hs === 'curly') { for (let x = -1; x <= 8; x += 3) p.px(hx + x, hy + 2, H); p.px(hx - 1, hy + 4, H); p.px(hx + 8, hy + 4, D); }
    if (hs === 'long' || hs === 'ponytail' && up) {
      for (let y = 4; y <= 11; y++) { p.px(hx - 1, hy + y, H); p.px(hx + 8, hy + y, D); if (up) for (let x = 0; x <= 7; x++) p.px(hx + x, hy + y, y > 9 ? D : H); }
      if (!up) { p.px(hx, hy + 5, H); p.px(hx + 7, hy + 5, D); }
    }
    if (hs === 'braids') {
      for (let y = 5; y <= 13; y++) {
        const col = y % 3 === 0 ? D : H;
        p.px(hx - 1, hy + y, col); p.px(hx + 8, hy + y, col);
      }
      p.px(hx - 1, hy + 14, P.clay2); p.px(hx + 8, hy + 14, P.clay2);
      if (up) for (let x = 0; x <= 7; x++) p.px(hx + x, hy + 8, H);
    }
    if (hs === 'bun') { p.rect(hx + 2, hy - 2, 4, 2, H); p.px(hx + 5, hy - 2, D); }
  } else {
    for (let x = 1; x <= 7; x++) {
      for (let y = (x < 2 ? 1 : 0) + top; y <= 2; y++) p.px(hx + x, hy + y, x > 5 ? D : H);
    }
    for (let y = 3; y <= 6; y++) { p.px(hx + 6, hy + y, H); p.px(hx + 7, hy + y, D); }
    p.px(hx + 5, hy + 3, H);
    p.px(hx + 1, hy + 3, H);
    if (hs === 'messy') { p.px(hx + 3, hy - 1, H); p.px(hx + 6, hy - 1, H); }
    if (hs === 'curly') { p.px(hx + 8, hy + 3, D); p.px(hx + 8, hy + 5, D); p.px(hx + 2, hy - 1, H); }
    if (hs === 'long') for (let y = 7; y <= 11; y++) { p.px(hx + 6, hy + y, H); p.px(hx + 7, hy + y, D); }
    if (hs === 'ponytail') { for (let y = 4; y <= 10; y++) p.px(hx + 8, hy + y, y > 8 ? D : H); }
    if (hs === 'braids') { for (let y = 5; y <= 13; y++) p.px(hx + 6, hy + y, y % 3 === 0 ? D : H); p.px(hx + 6, hy + 14, P.clay2); }
    if (hs === 'bun') { p.rect(hx + 6, hy + 1, 3, 3, H); }
  }
}

function paintHat(p: Painter, look: Look, dir: 0 | 1 | 3, hx: number, hy: number, c: HeadCols) {
  const side = dir === 1, up = dir === 3;
  const hat = look.hat!;
  const hc = look.hatColor || CLOTH.linenDark;
  const hcD = shade(hc, -0.28), hcL = shade(hc, 0.18);
  const steel = P.metal3, steelD = P.metal2, steelL = P.metal5;
  switch (hat) {
    case 'cap':
    case 'feathercap': {
      for (let x = -0; x <= 7; x++) for (let y = 0; y <= 2; y++) {
        if (y === 0 && (x === 0 || x === 7)) continue;
        p.px(hx + x, hy + y, x >= 6 ? hcD : y === 0 ? hcL : hc);
      }
      if (!up && !side) p.rect(hx, hy + 3, 8, 1, hcD);
      if (side) { p.px(hx, hy + 3, hcD); p.px(hx - 1, hy + 3, hcD); }
      if (hat === 'feathercap') { p.px(hx + 7, hy - 1, P.white); p.px(hx + 8, hy - 2, P.white); p.px(hx + 8, hy - 3, P.white); }
      break;
    }
    case 'strawhat': {
      const s = P.thatch3, sD = P.thatch1;
      for (let x = -2; x <= 9; x++) p.px(hx + x, hy + 3, x > 7 ? sD : s);
      for (let x = -1; x <= 8; x++) p.px(hx + x, hy + 4, sD);
      for (let x = 1; x <= 6; x++) for (let y = 0; y <= 2; y++) p.px(hx + x, hy + y, x > 5 ? sD : s);
      p.rect(hx + 1, hy + 2, 6, 1, hc === CLOTH.linenDark ? P.clay2 : hc);
      break;
    }
    case 'kerchief': {
      for (let x = 0; x <= 7; x++) for (let y = 0; y <= (up ? 7 : 3); y++) {
        if (y === 0 && (x === 0 || x === 7)) continue;
        p.px(hx + x, hy + y, x >= 6 ? hcD : hc);
      }
      if (!up && !side) { p.px(hx, hy + 4, hc); p.px(hx + 7, hy + 4, hcD); }
      if (side) { for (let y = 3; y <= 6; y++) p.px(hx + 6, hy + y, hc); p.px(hx + 7, hy + 5, hcD); p.px(hx + 8, hy + 6, hcD); }
      if (up) { p.px(hx + 3, hy + 8, hcD); p.px(hx + 4, hy + 8, hcD); }
      break;
    }
    case 'wimple': case 'hood': case 'monkhood': case 'coif': {
      const col = hat === 'coif' ? steel : hat === 'wimple' ? P.white : hc;
      const colD = hat === 'coif' ? steelD : hat === 'wimple' ? P.plaster2 : hcD;
      // full cover with face opening
      for (let x = -1; x <= 8; x++) for (let y = -1; y <= 10; y++) {
        const inHead = y >= 0 && y <= 9 && x >= -1 && x <= 8;
        if (!inHead) continue;
        if ((y <= 0 && (x <= 0 || x >= 7))) continue;
        const face = !up && (side ? x >= 0 && x <= 3 && y >= 3 && y <= 8 : x >= 1 && x <= 6 && y >= 3 && y <= 8);
        if (face) continue;
        let cc = x >= 7 ? colD : col;
        if (hat === 'coif' && (x + y) % 2) cc = steelD;
        p.px(hx + x, hy + y, cc);
      }
      if (hat === 'hood' || hat === 'monkhood') {
        // shoulder cape
        for (let x = -1; x <= 8; x++) p.px(hx + x, hy + 10, hcD);
        if (!side) { p.px(hx - 2, hy + 11, hcD); p.px(hx + 9, hy + 11, hcD); for (let x = -1; x <= 8; x++) p.px(hx + x, hy + 11, hc); }
      }
      if (hat === 'wimple') { for (let x = 0; x <= 7; x++) p.px(hx + x, hy + 10, P.white); }
      break;
    }
    case 'kettle': {
      for (let x = -2; x <= 9; x++) p.px(hx + x, hy + 3, x > 7 ? steelD : steel);
      for (let x = -1; x <= 8; x++) p.px(hx + x, hy + 4, steelD);
      for (let x = 1; x <= 6; x++) for (let y = -1; y <= 2; y++) p.px(hx + x, hy + y, x === 2 && y < 1 ? steelL : x > 5 ? steelD : steel);
      break;
    }
    case 'bascinet': case 'sallet': {
      const isS = hat === 'sallet';
      const m = isS && look.hatColor ? look.hatColor : steel;
      const mD = shade(m, -0.3), mL = shade(m, 0.35);
      for (let x = -1; x <= 8; x++) for (let y = -1; y <= (isS ? 7 : 5); y++) {
        if (y === -1 && (x < 2 || x > 5)) continue;
        if (y === 0 && (x < 0 || x > 7)) continue;
        p.px(hx + x, hy + y, x >= 7 ? mD : (x === 1 && y < 2 ? mL : m));
      }
      if (!up) {
        if (isS) {
          // visor slit
          if (!side) for (let x = 0; x <= 7; x++) p.px(hx + x, hy + 4, P.ink);
          else for (let x = -1; x <= 3; x++) p.px(hx + x, hy + 4, P.ink);
        } else {
          // open face
          if (!side) for (let x = 1; x <= 6; x++) for (let y = 3; y <= 5; y++) p.px(hx + x, hy + y, y === 3 ? mD : c.skin);
          else for (let x = 0; x <= 3; x++) for (let y = 3; y <= 5; y++) p.px(hx + x, hy + y, c.skin);
          if (!side) { p.px(hx + 2, hy + 4, '#2a1d18'); p.px(hx + 5, hy + 4, '#2a1d18'); }
          else p.px(hx + 1, hy + 4, '#2a1d18');
        }
      }
      if (isS && side) { p.px(hx + 8, hy + 6, mD); p.px(hx + 9, hy + 7, mD); p.px(hx + 9, hy + 6, mD); }
      // aventail
      if (!isS) for (let x = -1; x <= 8; x++) for (let y = 6; y <= 9; y++) {
        if (!up && !side && x >= 1 && x <= 6 && y <= 7) continue;
        if (side && x <= 2 && y <= 7) continue;
        p.px(hx + x, hy + y, (x + y) & 1 ? steelD : steel);
      }
      break;
    }
    case 'chaperon': {
      for (let x = -1; x <= 8; x++) for (let y = 0; y <= 2; y++) p.px(hx + x, hy + y, x > 6 ? hcD : (y === 1 ? hcL : hc));
      for (let x = 0; x <= 7; x++) p.px(hx + x, hy - 1, hc);
      if (side || up) { for (let y = 3; y <= 9; y++) p.px(hx + (side ? 8 : 6), hy + y, hcD); }
      break;
    }
    case 'circlet': {
      for (let x = 0; x <= 7; x++) p.px(hx + x, hy + 2, x % 3 === 0 ? P.gold4 : P.gold2);
      break;
    }
  }
}

function paintDead(look: Look, g: Geom): PixelBuffer {
  const b = new PixelBuffer(FW, FH);
  const sk = skinRamp(look.skin);
  const torso = look.outer === 'mail' ? P.metal2 : look.outer === 'plate' ? P.metal3 : look.outer && look.outer !== 'none' && look.outer !== 'apron' ? (look.outerColor || look.shirt) : look.shirt;
  const child = g.child;
  const y = 14;
  // head
  b.ellipse(1, y, 8, 8, sk[2]);
  const hat = look.hat || 'none';
  const hairCol = hat !== 'none' && hat !== 'circlet' ? (hat === 'kettle' || hat === 'bascinet' || hat === 'sallet' || hat === 'coif' ? P.metal3 : look.hatColor || look.hair) : look.hair;
  if (look.hairStyle !== 'bald' || hat !== 'none') { b.rect(1, y + 1, 3, 6, hairCol); b.px(1, y + 2, hairCol); }
  b.px(5, y + 3, '#2a1d18'); b.px(6, y + 3, '#2a1d18');
  b.px(5, y + 5, '#2a1d18'); b.px(6, y + 5, '#2a1d18');
  if (look.beard && look.beard !== 'none' && look.beard !== 'stubble') b.rect(7, y + 2, 2, 4, look.beardColor || look.hair);
  // torso
  const tl = child ? 6 : 8;
  b.rect(9, y + 1, tl, 7, torso);
  b.rect(9, y + 7, tl, 1, shade(torso, -0.3));
  // arms
  b.rect(10, y - 1, 4, 2, torso);
  b.rect(10, y + 8, 4, 2, torso);
  b.rect(14, y - 1, 2, 2, sk[2]);
  // legs
  const lx = 9 + tl;
  const ll = child ? 3 : 4;
  b.rect(lx, y + 1, ll, 3, look.legs);
  b.rect(lx, y + 4, ll, 3, shade(look.legs, -0.2));
  b.rect(lx + ll, y + 1, 2, 3, look.boots);
  b.rect(lx + ll, y + 4, 2, 3, look.boots);
  b.outline(P.ink);
  return b;
}

// ---------- sheets ----------

export interface CharSheet {
  canvas: HTMLCanvasElement;
  flash: HTMLCanvasElement; // white silhouette for hit flashes
}
const sheetCache = new Map<string, CharSheet>();

export function lookKey(look: Look): string {
  return JSON.stringify(look);
}

export function getCharSheet(look: Look): CharSheet {
  const key = lookKey(look);
  let s = sheetCache.get(key);
  if (s) return s;
  const rows: PixelBuffer[][] = [[], [], [], []];
  for (let f = 0; f < FRAME_COUNT; f++) {
    const down = paint(look, 0, f);
    const left = paint(look, 1, f);
    const upF = paint(look, 3, f);
    rows[0].push(down);
    rows[1].push(left);
    rows[2].push(left.flipH());
    rows[3].push(upF);
  }
  const canvas = sheetFromBuffers(rows, FW, FH);
  // white silhouette version
  const flash = document.createElement('canvas');
  flash.width = canvas.width; flash.height = canvas.height;
  const fctx = flash.getContext('2d')!;
  fctx.drawImage(canvas, 0, 0);
  fctx.globalCompositeOperation = 'source-in';
  fctx.fillStyle = '#fff';
  fctx.fillRect(0, 0, flash.width, flash.height);
  s = { canvas, flash };
  sheetCache.set(key, s);
  return s;
}

/** Draws a character frame with feet at (x,y). */
export function drawChar(
  ctx: CanvasRenderingContext2D, look: Look, dir: number, frame: number, x: number, y: number,
  opts: { flash?: number; alpha?: number; clipH?: number } = {},
) {
  const sheet = getCharSheet(look);
  const sx = frame * FW, sy = dir * FH;
  const dx = Math.round(x - FW / 2), dy = Math.round(y - FH + 1);
  if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts.clipH) {
    ctx.drawImage(sheet.canvas, sx, sy, FW, opts.clipH, dx, dy, FW, opts.clipH);
    ctx.globalAlpha = 1;
    return;
  }
  ctx.drawImage(sheet.canvas, sx, sy, FW, FH, dx, dy, FW, FH);
  if (opts.flash && opts.flash > 0) {
    ctx.globalAlpha = Math.min(1, opts.flash) * (opts.alpha ?? 1);
    ctx.drawImage(sheet.flash, sx, sy, FW, FH, dx, dy, FW, FH);
  }
  ctx.globalAlpha = 1;
}

// ---------- random townsfolk looks ----------


export function randomLook(seed: number | string, opts: { female?: boolean; role?: string; child?: boolean; old?: boolean } = {}): Look {
  const r = new RNG(typeof seed === 'string' ? hashStr(seed) : seed);
  const female = opts.female ?? r.chance(0.5);
  const old = opts.old ?? r.chance(0.18);
  const child = opts.child ?? false;
  const skins: SkinTone[] = ['fair', 'fair', 'pale', 'ruddy', 'tan', 'olive'];
  const skin = r.pick(skins);
  const hairCols = old ? [HAIR.grey, HAIR.white, HAIR.saltpepper, HAIR.ash] : [HAIR.black, HAIR.darkbrown, HAIR.brown, HAIR.brown, HAIR.chestnut, HAIR.auburn, HAIR.blond, HAIR.flaxen, HAIR.red];
  const hair = r.pick(hairCols);
  const peasantCloth = [CLOTH.linen, CLOTH.undyed, CLOTH.brown, CLOTH.russet, CLOTH.olive, CLOTH.green, CLOTH.woad, CLOTH.grey, CLOTH.madder, CLOTH.mustard, CLOTH.darkbrown];
  const legsCols = [CLOTH.brown, CLOTH.darkbrown, CLOTH.grey, CLOTH.charcoal, CLOTH.olive, CLOTH.russet, CLOTH.blue];
  const bootCols = [P.wood1, P.wood0, P.dirt0, '#3a2a1e'];
  const look: Look = {
    skin, hair, female, old,
    hairStyle: female ? r.pick(['long', 'bun', 'braids', 'ponytail'] as HairStyle[]) : r.pick(old ? ['balding', 'bald', 'short'] as HairStyle[] : ['short', 'short', 'messy', 'curly', 'long'] as HairStyle[]),
    shirt: r.pick(peasantCloth),
    legs: r.pick(legsCols),
    boots: r.pick(bootCols),
    build: child ? 'child' : r.pick(['normal', 'normal', 'normal', 'thin', 'broad', 'fat'] as Build[]),
    belt: r.pick([P.wood1, P.wood0, '#3a2a1e']),
    face: {
      jaw: r.pick(['round', 'square', 'narrow', 'heavy']),
      nose: r.pick(['small', 'button', 'long', 'broad', 'hooked']),
      eyeShape: r.pick(['round', 'narrow', 'sleepy', 'wide']),
      brows: r.pick(['thin', 'thick', 'bushy']),
      mouth: r.pick(['small', 'wide', 'full']),
      wrinkles: old ? r.int(2, 3) : r.int(0, 1),
    },
    eyes: r.pick(['#3b5a7a', '#4a3322', '#5a6a3a', '#6b4a2a', '#2e2e3a', '#6b7f8f']),
  };
  if (!female && !child && r.chance(old ? 0.8 : 0.45)) {
    look.beard = r.pick(['stubble', 'short', 'full', 'moustache', 'long', 'goatee'] as BeardStyle[]);
    look.beardColor = r.chance(0.2) ? shade(hair, 0.1) : hair;
  }
  if (female) {
    if (!child && r.chance(0.55)) { look.hat = r.pick(['kerchief', 'kerchief', 'wimple'] as HatStyle[]); look.hatColor = r.pick([CLOTH.white, CLOTH.linen, CLOTH.madder, CLOTH.woad, CLOTH.ochre]); }
    look.outer = 'dress';
    look.outerColor = r.pick(peasantCloth);
    if (r.chance(0.5)) look.apronColor = r.pick([CLOTH.linen, CLOTH.white, CLOTH.linenDark]);
    look.face!.cheeks = r.chance(0.5);
  } else if (r.chance(0.25)) {
    look.hat = r.pick(['cap', 'strawhat', 'hood', 'chaperon'] as HatStyle[]);
    look.hatColor = r.pick(peasantCloth);
  }
  if (!female && r.chance(0.3)) { look.outer = r.pick(['vest', 'apron', 'leather'] as OuterStyle[]); look.outerColor = r.pick([CLOTH.brown, CLOTH.darkbrown, CLOTH.russet, CLOTH.olive]); }
  if (child) { delete look.beard; look.hat = undefined; }
  if (r.chance(0.12)) look.freckles = true;

  switch (opts.role) {
    case 'guard':
      look.outer = r.pick(['tabard', 'gambeson', 'mail'] as OuterStyle[]);
      look.outerColor = CLOTH.green;
      look.trim = CLOTH.ochre;
      look.hat = r.pick(['kettle', 'coif', 'kettle', 'bascinet'] as HatStyle[]);
      look.legs = CLOTH.charcoal;
      look.boots = P.wood0;
      look.female = false; look.hairStyle = 'short';
      if (look.outer === 'gambeson') look.outerColor = CLOTH.olive;
      break;
    case 'mercenary':
      look.outer = r.pick(['mail', 'gambeson', 'brigandine', 'leather'] as OuterStyle[]);
      look.outerColor = r.pick([CLOTH.black, CLOTH.charcoal, CLOTH.red, CLOTH.darkbrown]);
      look.hat = r.pick(['kettle', 'coif', 'bascinet', 'none', 'hood'] as HatStyle[]);
      look.hatColor = CLOTH.charcoal;
      look.legs = r.pick([CLOTH.charcoal, CLOTH.red, CLOTH.black]);
      look.boots = P.wood0;
      look.cape = r.chance(0.3) ? CLOTH.black : undefined;
      look.female = false;
      look.scar = r.chance(0.3);
      if (look.hairStyle === 'braids' || look.hairStyle === 'bun') look.hairStyle = 'messy';
      break;
    case 'bandit':
      look.outer = r.pick(['leather', 'gambeson', 'vest', 'none'] as OuterStyle[]);
      look.outerColor = r.pick([CLOTH.brown, CLOTH.darkbrown, CLOTH.olive, CLOTH.forest]);
      look.hat = r.pick(['hood', 'none', 'cap', 'hood'] as HatStyle[]);
      look.hatColor = r.pick([CLOTH.forest, CLOTH.brown, CLOTH.charcoal]);
      look.female = false;
      if (look.hairStyle === 'braids' || look.hairStyle === 'bun') look.hairStyle = 'messy';
      look.scar = r.chance(0.3);
      break;
    case 'monk':
      look.outer = 'robe'; look.outerColor = CLOTH.brown; look.hairStyle = 'tonsure'; look.hat = undefined;
      break;
    case 'noble':
      look.outer = 'noble'; look.outerColor = r.pick([CLOTH.purple, CLOTH.blue, CLOTH.crimson, CLOTH.teal]);
      look.trim = CLOTH.ochre; look.hat = r.chance(0.5) ? 'chaperon' : undefined; look.hatColor = look.outerColor;
      break;
    case 'miner':
      look.outer = 'leather'; look.outerColor = CLOTH.darkbrown; look.hat = 'cap'; look.hatColor = CLOTH.white;
      look.shirt = CLOTH.grey;
      break;
  }
  return look;
}
