// Procedural animal sprites: a parameterised quadruped painter plus birds.

import { PixelBuffer, sheetFromBuffers } from './pixel';
import { P } from './palette';
import { shade } from '../engine/util';

export type Species = 'dog' | 'wolf' | 'deer' | 'boar' | 'hare' | 'horse' | 'cow' | 'sheep' | 'chicken' | 'goose' | 'fox';

export interface AnimalLook {
  species: Species;
  coat: string;
  coat2?: string; // patches / belly
  eye?: string;
  variant?: number;
  saddle?: string; // horses
  antlers?: boolean;
}

export const AFRAME = { IDLE: 0, WALK_A: 1, WALK_B: 2, ATTACK: 3, DEAD: 4, SIT: 5, LIE: 6 } as const;
const NFRAMES = 7;

interface Spec {
  fw: number; fh: number;
  bodyL: number; bodyH: number; legL: number; headW: number; headH: number;
  snout: number; ear: 'pointy' | 'floppy' | 'long' | 'small' | 'none'; tail: 'bushy' | 'thin' | 'stub' | 'curly' | 'horse' | 'none';
}

const SPECS: Record<string, Spec> = {
  dog: { fw: 24, fh: 20, bodyL: 12, bodyH: 6, legL: 4, headW: 6, headH: 6, snout: 3, ear: 'floppy', tail: 'bushy' },
  wolf: { fw: 26, fh: 20, bodyL: 14, bodyH: 6, legL: 5, headW: 6, headH: 6, snout: 4, ear: 'pointy', tail: 'bushy' },
  fox: { fw: 22, fh: 16, bodyL: 10, bodyH: 5, legL: 3, headW: 5, headH: 5, snout: 3, ear: 'pointy', tail: 'bushy' },
  deer: { fw: 28, fh: 28, bodyL: 14, bodyH: 7, legL: 8, headW: 5, headH: 6, snout: 3, ear: 'pointy', tail: 'stub' },
  boar: { fw: 26, fh: 20, bodyL: 14, bodyH: 8, legL: 3, headW: 7, headH: 7, snout: 4, ear: 'small', tail: 'thin' },
  hare: { fw: 14, fh: 14, bodyL: 7, bodyH: 5, legL: 2, headW: 4, headH: 4, snout: 1, ear: 'long', tail: 'stub' },
  horse: { fw: 38, fh: 34, bodyL: 20, bodyH: 10, legL: 10, headW: 6, headH: 9, snout: 5, ear: 'pointy', tail: 'horse' },
  cow: { fw: 34, fh: 28, bodyL: 18, bodyH: 10, legL: 6, headW: 7, headH: 7, snout: 3, ear: 'small', tail: 'thin' },
  sheep: { fw: 24, fh: 20, bodyL: 12, bodyH: 8, legL: 4, headW: 5, headH: 5, snout: 2, ear: 'small', tail: 'stub' },
};

function quad(look: AnimalLook, dir: 0 | 1 | 3, frame: number): PixelBuffer {
  const s = SPECS[look.species];
  const b = new PixelBuffer(s.fw, s.fh);
  const C = look.coat, CD = shade(C, -0.3), CL = shade(C, 0.2);
  const C2 = look.coat2 || shade(C, 0.35);
  const eye = look.eye || '#1a1210';
  const nose = look.species === 'boar' ? '#c89080' : '#1a1210';
  const feet = look.species === 'horse' || look.species === 'deer' || look.species === 'boar' || look.species === 'cow' || look.species === 'sheep' ? '#2a2018' : CD;
  const walkA = frame === AFRAME.WALK_A, walkB = frame === AFRAME.WALK_B;
  const ground = s.fh - 1;

  if (frame === AFRAME.DEAD) {
    // lying on the side, legs out
    const by = ground - s.bodyH;
    const bx = Math.floor((s.fw - s.bodyL) / 2) + 2;
    b.ellipse(bx, by, s.bodyL, s.bodyH, C);
    b.ellipse(bx + 2, by + s.bodyH - 3, s.bodyL - 4, 3, C2);
    b.ellipse(bx - s.headW + 1, by + 1, s.headW, s.headH - 1, C);
    b.px(bx - s.headW + 3, by + 3, eye); b.px(bx - s.headW + 4, by + 3, eye);
    for (let i = 0; i < 4; i++) b.hline(bx + 2 + i * 3, bx + 4 + i * 3, ground, CD);
    b.outline(P.ink);
    return b;
  }

  if (dir === 1) {
    // side view facing left
    const lie = frame === AFRAME.LIE, sit = frame === AFRAME.SIT;
    const legL = lie ? 0 : s.legL;
    const bodyTop = ground - legL - s.bodyH + (lie ? 1 : 0);
    const bx = Math.floor((s.fw - s.bodyL) / 2) + 1;
    // tail
    const tailX = bx + s.bodyL - 1, tailY = bodyTop + 1;
    if (s.tail === 'bushy') { b.line(tailX, tailY + 1, tailX + 3, tailY - 2 + (walkA ? 1 : 0), C); b.line(tailX + 1, tailY + 1, tailX + 4, tailY - 1 + (walkA ? 1 : 0), CL); b.px(tailX + 4, tailY - 2, C2); }
    else if (s.tail === 'thin') b.line(tailX, tailY + 1, tailX + 2, tailY + 4, CD);
    else if (s.tail === 'horse') { for (let k = 0; k < 8; k++) b.px(tailX + 1 + (k > 4 ? 1 : 0), tailY + k, k > 5 ? shade(look.coat2 || CD, -0.1) : (look.coat2 || CD)); b.px(tailX + 2, tailY + 1, look.coat2 || CD); }
    else if (s.tail === 'stub') b.px(tailX + 1, tailY, C2);
    // legs
    if (!lie) {
      const legs = [bx + 1, bx + 3, bx + s.bodyL - 4, bx + s.bodyL - 2];
      legs.forEach((lx, i) => {
        let off = 0;
        if (walkA) off = i % 2 === 0 ? -1 : 1;
        if (walkB) off = i % 2 === 0 ? 1 : -1;
        const far = i === 1 || i === 3;
        const len = sit && i >= 2 ? 1 : legL;
        const col = far ? CD : C;
        b.line(lx, bodyTop + s.bodyH - 1, lx + off, bodyTop + s.bodyH - 1 + len, col);
        if (s.bodyL > 16) b.line(lx + 1, bodyTop + s.bodyH - 1, lx + 1 + off, bodyTop + s.bodyH - 1 + len, col);
        b.px(lx + off, bodyTop + s.bodyH - 1 + len, feet);
      });
    }
    // body
    const sitTilt = sit ? 2 : 0;
    b.ellipse(bx, bodyTop + sitTilt, s.bodyL, s.bodyH, C);
    b.ellipse(bx + 1, bodyTop + s.bodyH - 3 + sitTilt, s.bodyL - 2, 3, C2);
    b.ellipse(bx + 1, bodyTop + sitTilt, s.bodyL - 3, 2, CL);
    if (look.species === 'sheep') for (let k = 0; k < 10; k++) b.px(bx + 1 + ((k * 5) % (s.bodyL - 2)), bodyTop + 1 + ((k * 3) % (s.bodyH - 2)), P.white);
    if (look.species === 'cow' && look.coat2) { b.ellipse(bx + 4, bodyTop + 1, 5, 4, look.coat2); b.ellipse(bx + 11, bodyTop + 3, 4, 4, look.coat2); }
    if (look.saddle) { b.rect(bx + 6, bodyTop - 1, 7, 4, look.saddle); b.rect(bx + 6, bodyTop - 1, 7, 1, shade(look.saddle, 0.3)); b.vline(bx + 9, bodyTop + 3, bodyTop + s.bodyH + 1, P.wood1); }
    // head
    const neckUp = look.species === 'horse' ? 6 : look.species === 'deer' ? 5 : look.species === 'boar' ? -1 : 2;
    const hx = bx - s.headW + 2, hy = bodyTop - neckUp + (sit ? 0 : 0);
    if (look.species === 'horse' || look.species === 'deer') {
      // neck
      for (let k = 0; k < neckUp + 2; k++) b.rect(bx + 1 - Math.floor(k / 2), bodyTop - k + 2, 4, 2, C);
      if (look.species === 'horse') for (let k = 0; k < neckUp + 1; k++) b.px(bx + 4 - Math.floor(k / 2), bodyTop - k + 2, look.coat2 || CD);
    }
    const attack = frame === AFRAME.ATTACK;
    b.ellipse(hx, hy, s.headW, s.headH, C);
    // snout
    const sy = hy + Math.floor(s.headH / 2) - (look.species === 'horse' ? -2 : 0);
    b.rect(hx - s.snout + 1, sy, s.snout, Math.max(2, Math.floor(s.headH / 2) - (attack ? 0 : 0)), look.species === 'boar' ? shade(C, -0.1) : C);
    b.px(hx - s.snout + 1, sy, nose);
    if (attack) { b.hline(hx - s.snout + 1, hx, sy + 2, '#5a1a18'); b.px(hx - s.snout + 2, sy + 3, P.white); }
    if (look.species === 'boar') { b.px(hx - 1, sy + 2, P.white); b.px(hx - 2, sy + 1, P.white); }
    b.px(hx + 1, hy + 2, eye);
    // ears
    if (s.ear === 'pointy') { b.px(hx + s.headW - 3, hy - 1, CD); b.px(hx + s.headW - 3, hy - 2, CD); b.px(hx + s.headW - 2, hy - 1, C); }
    if (s.ear === 'floppy') { b.rect(hx + s.headW - 3, hy, 2, 4, look.coat2 && look.species === 'dog' ? shade(C, -0.25) : CD); }
    if (s.ear === 'long') { b.vline(hx + s.headW - 2, hy - 5, hy, C); b.vline(hx + s.headW - 1, hy - 4, hy, CD); }
    if (s.ear === 'small') b.px(hx + s.headW - 2, hy - 1, CD);
    if (look.antlers) {
      const ax = hx + s.headW - 3, ay = hy - 1;
      b.line(ax, ay, ax - 2, ay - 6, P.wood4); b.line(ax - 1, ay - 3, ax - 4, ay - 5, P.wood4); b.line(ax, ay, ax + 3, ay - 6, P.wood3); b.line(ax + 1, ay - 3, ax + 4, ay - 4, P.wood3);
    }
    if (look.species === 'horse' && look.coat2) for (let k = 0; k < 4; k++) b.px(hx + s.headW - 1, hy + k, look.coat2);
  } else {
    // front (down) or back (up) view
    const front = dir === 0;
    const cx = Math.floor(s.fw / 2);
    const lie = frame === AFRAME.LIE, sit = frame === AFRAME.SIT;
    const legL = lie ? 0 : s.legL;
    const bw = Math.max(6, Math.round(s.bodyH * 1.1));
    const bodyLen = Math.round(s.bodyL * 0.6);
    const bodyBottom = ground - legL + 1;
    const bodyTop = bodyBottom - bodyLen;
    // legs
    if (!lie) {
      const lxs = [cx - Math.floor(bw / 2) + 1, cx + Math.floor(bw / 2) - 2];
      lxs.forEach((lx, i) => {
        const lift = (walkA && i === 0) || (walkB && i === 1) ? 1 : 0;
        b.rect(lx, bodyBottom - 1, s.bodyL > 16 ? 2 : 1, legL - lift + (sit && !front ? -1 : 0), C);
        b.px(lx, ground - lift, feet);
        if (s.bodyL > 16) b.px(lx + 1, ground - lift, feet);
      });
    }
    // body
    b.ellipse(cx - Math.floor(bw / 2), bodyTop, bw, bodyLen, C);
    b.ellipse(cx - Math.floor(bw / 2) + 1, bodyTop + 1, bw - 3, 2, CL);
    if (look.species === 'sheep') for (let k = 0; k < 8; k++) b.px(cx - 2 + ((k * 3) % 5), bodyTop + 1 + ((k * 5) % (bodyLen - 1)), P.white);
    if (look.saddle) b.rect(cx - 3, bodyTop + 3, 7, 5, look.saddle);
    if (front) {
      // head over the body, near the bottom
      const hy = bodyTop + (look.species === 'horse' ? -4 : look.species === 'deer' ? -3 : 1);
      b.ellipse(cx - Math.floor(s.headW / 2), hy, s.headW, s.headH, C);
      b.rect(cx - 1, hy + s.headH - 2, 3, Math.max(2, s.snout - 1), look.species === 'boar' ? shade(C, -0.1) : C2);
      b.px(cx, hy + s.headH - 2 + Math.max(1, s.snout - 2), nose);
      if (frame === AFRAME.ATTACK) b.hline(cx - 1, cx + 1, hy + s.headH, '#5a1a18');
      b.px(cx - 2, hy + 2, eye); b.px(cx + 2, hy + 2, eye);
      if (s.ear === 'pointy') { b.px(cx - 3, hy - 1, CD); b.px(cx + 3, hy - 1, CD); b.px(cx - 3, hy, C); b.px(cx + 3, hy, C); }
      if (s.ear === 'floppy') { b.rect(cx - 4, hy + 1, 2, 3, CD); b.rect(cx + 3, hy + 1, 2, 3, CD); }
      if (s.ear === 'long') { b.vline(cx - 2, hy - 5, hy, C); b.vline(cx + 2, hy - 5, hy, C); }
      if (s.ear === 'small') { b.px(cx - 3, hy, CD); b.px(cx + 3, hy, CD); }
      if (look.antlers) { b.line(cx - 2, hy, cx - 5, hy - 6, P.wood4); b.line(cx + 2, hy, cx + 5, hy - 6, P.wood3); b.line(cx - 4, hy - 3, cx - 6, hy - 4, P.wood4); b.line(cx + 4, hy - 3, cx + 6, hy - 4, P.wood3); }
      if (look.species === 'boar') { b.px(cx - 2, hy + s.headH - 1, P.white); b.px(cx + 2, hy + s.headH - 1, P.white); }
      // chest patch
      if (look.coat2 && look.species === 'dog') b.rect(cx - 1, hy + s.headH, 3, 3, look.coat2);
    } else {
      // back view: head small at top, tail at bottom
      const hy = bodyTop - s.headH + 3;
      b.ellipse(cx - Math.floor(s.headW / 2), hy, s.headW, s.headH - 1, CD);
      if (s.ear === 'pointy') { b.px(cx - 2, hy - 1, CD); b.px(cx + 2, hy - 1, CD); }
      if (s.ear === 'floppy') { b.rect(cx - 3, hy + 1, 1, 3, CD); b.rect(cx + 3, hy + 1, 1, 3, CD); }
      if (s.ear === 'long') { b.vline(cx - 1, hy - 5, hy, C); b.vline(cx + 1, hy - 5, hy, C); }
      if (look.antlers) { b.line(cx - 1, hy, cx - 4, hy - 6, P.wood4); b.line(cx + 1, hy, cx + 4, hy - 6, P.wood3); }
      const ty = bodyBottom - 2;
      if (s.tail === 'bushy') { b.vline(cx, ty, ty + 3 + (walkA ? 1 : 0), C); b.vline(cx + 1, ty, ty + 3, CL); b.px(cx, ty + 4, C2); }
      else if (s.tail === 'horse') { b.rect(cx - 1, ty - 2, 3, 7, look.coat2 || CD); }
      else if (s.tail === 'thin') b.vline(cx, ty, ty + 3, CD);
      else b.px(cx, ty, C2);
    }
  }
  b.outline(P.ink);
  return b;
}

function bird(look: AnimalLook, dir: 0 | 1 | 3, frame: number): PixelBuffer {
  const goose = look.species === 'goose';
  const W = goose ? 14 : 12, H = goose ? 14 : 12;
  const b = new PixelBuffer(W, H);
  const C = look.coat, CD = shade(C, -0.25);
  const beak = goose ? '#e8902a' : '#e8b02a';
  const ground = H - 1;
  const walk = frame === AFRAME.WALK_A ? 1 : frame === AFRAME.WALK_B ? -1 : 0;
  if (frame === AFRAME.DEAD) {
    b.ellipse(1, ground - 4, W - 2, 4, C);
    b.px(1, ground - 3, beak);
    b.outline(P.ink);
    return b;
  }
  // legs
  b.px(Math.floor(W / 2) - 1 + walk, ground, beak); b.px(Math.floor(W / 2) + 1 - walk, ground, beak);
  b.vline(Math.floor(W / 2) - 1, ground - 2, ground - 1, beak); b.vline(Math.floor(W / 2) + 1, ground - 2, ground - 1, beak);
  if (dir === 1) {
    b.ellipse(3, ground - 7, W - 4, 6, C);
    b.rect(W - 3, ground - 8, 2, 2, CD); // tail
    const neck = goose ? 5 : 2;
    b.rect(3, ground - 7 - neck, 2, neck + 1, C);
    b.ellipse(1, ground - 9 - neck, 5, 4, C);
    b.px(0, ground - 7 - neck, beak); b.px(-0, ground - 8 - neck, beak);
    b.px(2, ground - 8 - neck, '#1a1210');
    if (!goose) { b.px(3, ground - 10 - neck, '#c8302a'); b.px(2, ground - 10 - neck, '#c8302a'); }
    b.hline(5, W - 4, ground - 5, CD);
    if (frame === AFRAME.ATTACK) { b.px(-1, ground - 8 - neck, beak); }
  } else {
    const cx = Math.floor(W / 2);
    b.ellipse(cx - 3, ground - 7, 7, 6, C);
    const neck = goose ? 4 : 1;
    b.rect(cx - 1, ground - 7 - neck, 2, neck + 1, C);
    b.ellipse(cx - 2, ground - 10 - neck, 4, 4, C);
    if (dir === 0) { b.px(cx - 1, ground - 8 - neck, beak); b.px(cx, ground - 8 - neck, beak); b.px(cx - 2, ground - 9 - neck, '#1a1210'); b.px(cx + 1, ground - 9 - neck, '#1a1210'); }
    if (!goose) b.px(cx, ground - 11 - neck, '#c8302a');
  }
  b.outline(P.ink);
  return b;
}

export interface AnimalSheet { canvas: HTMLCanvasElement; flash: HTMLCanvasElement; fw: number; fh: number }
const cache = new Map<string, AnimalSheet>();

export function getAnimalSheet(look: AnimalLook): AnimalSheet {
  const key = JSON.stringify(look);
  let s = cache.get(key);
  if (s) return s;
  const isBird = look.species === 'chicken' || look.species === 'goose';
  const spec = isBird ? { fw: look.species === 'goose' ? 14 : 12, fh: look.species === 'goose' ? 14 : 12 } : SPECS[look.species];
  const rows: PixelBuffer[][] = [[], [], [], []];
  for (let f = 0; f < NFRAMES; f++) {
    const paintF = isBird ? bird : quad;
    const d = paintF(look, 0, f), l = paintF(look, 1, f), u = paintF(look, 3, f);
    rows[0].push(d); rows[1].push(l); rows[2].push(l.flipH()); rows[3].push(u);
  }
  const canvas = sheetFromBuffers(rows, spec.fw, spec.fh);
  const flash = document.createElement('canvas');
  flash.width = canvas.width; flash.height = canvas.height;
  const fctx = flash.getContext('2d')!;
  fctx.drawImage(canvas, 0, 0);
  fctx.globalCompositeOperation = 'source-in';
  fctx.fillStyle = '#fff';
  fctx.fillRect(0, 0, flash.width, flash.height);
  s = { canvas, flash, fw: spec.fw, fh: spec.fh };
  cache.set(key, s);
  return s;
}

export function drawAnimal(ctx: CanvasRenderingContext2D, look: AnimalLook, dir: number, frame: number, x: number, y: number, flash = 0, alpha = 1) {
  const sh = getAnimalSheet(look);
  const dx = Math.round(x - sh.fw / 2), dy = Math.round(y - sh.fh + 1);
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(sh.canvas, frame * sh.fw, dir * sh.fh, sh.fw, sh.fh, dx, dy, sh.fw, sh.fh);
  if (flash > 0) {
    ctx.globalAlpha = Math.min(1, flash) * alpha;
    ctx.drawImage(sh.flash, frame * sh.fw, dir * sh.fh, sh.fw, sh.fh, dx, dy, sh.fw, sh.fh);
  }
  ctx.globalAlpha = 1;
}

export const ANIMAL_LOOKS: Record<string, AnimalLook> = {
  crumb: { species: 'dog', coat: '#8a5a32', coat2: '#e8dcc8', eye: '#2a1810' },
  guarddog: { species: 'dog', coat: '#3a3230', coat2: '#6a5a4a' },
  wolf: { species: 'wolf', coat: '#6e6a66', coat2: '#b0aaa0' },
  deer: { species: 'deer', coat: '#8a5a34', coat2: '#d8c0a0' },
  stag: { species: 'deer', coat: '#7a4a2a', coat2: '#d0b890', antlers: true },
  boar: { species: 'boar', coat: '#4a3a2e', coat2: '#6a5646' },
  hare: { species: 'hare', coat: '#8a7250', coat2: '#d8ccb4' },
  fox: { species: 'fox', coat: '#c86a2a', coat2: '#f0e6d8' },
  horse_brown: { species: 'horse', coat: '#6b4226', coat2: '#2a1c14' },
  horse_black: { species: 'horse', coat: '#2a2220', coat2: '#141010', saddle: '#6a1a1a' },
  horse_grey: { species: 'horse', coat: '#a8a4a0', coat2: '#e8e4e0', saddle: '#3a5a2a' },
  cow: { species: 'cow', coat: '#8a6a4a', coat2: '#e8e0d0' },
  sheep: { species: 'sheep', coat: '#d8d0c0', coat2: '#b8b0a0' },
  chicken: { species: 'chicken', coat: '#e8e0d0' },
  chicken_brown: { species: 'chicken', coat: '#a8683a' },
  goose: { species: 'goose', coat: '#f0ece4' },
};
