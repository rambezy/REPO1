// Expressive 48x48 pixel portraits generated from the same `Look` used for
// sprites. Supports expressions, blinking and a talking mouth.

import { PixelBuffer, makeCanvas } from './pixel';
import { P, SKIN } from './palette';
import { Look } from './characters';
import { shade, mixHex, hashStr, clamp } from '../engine/util';

export type Expr = 'neutral' | 'happy' | 'laugh' | 'sad' | 'cry' | 'angry' | 'surprised' | 'worried' | 'smirk' | 'pain' | 'tender' | 'sleep';
export const EXPRS: Expr[] = ['neutral', 'happy', 'laugh', 'sad', 'cry', 'angry', 'surprised', 'worried', 'smirk', 'pain', 'tender', 'sleep'];

const S = 48;

interface FaceGeo {
  cx: number; yt: number; ye: number; yc: number; hw: number;
  eyeOff: number; eyeW: number; eyeH: number;
  noseTop: number; noseBot: number; mouthY: number; mouthW: number;
  child: boolean;
}

function faceGeo(look: Look): FaceGeo {
  const child = look.build === 'child';
  const jaw = look.face?.jaw || 'round';
  let hw = jaw === 'heavy' ? 11 : jaw === 'narrow' ? 8.5 : 10;
  if (look.build === 'fat') hw += 1;
  if (child) hw = 10;
  const yt = child ? 10 : 7;
  const ye = child ? 24 : 22;
  const yc = child ? 35 : (jaw === 'narrow' ? 36 : 35);
  const nose = look.face?.nose || 'small';
  const noseLen = child ? 3 : nose === 'long' || nose === 'hooked' ? 6 : nose === 'button' ? 3 : 5;
  const mw = look.face?.mouth === 'wide' ? 8 : look.face?.mouth === 'small' ? 5 : 6;
  return {
    cx: 24, yt, ye, yc, hw,
    eyeOff: child ? 5 : 5,
    eyeW: 5, eyeH: child ? 4 : 3,
    noseTop: ye + 1, noseBot: ye + 1 + noseLen,
    mouthY: child ? ye + 7 : Math.min(yc - 4, ye + 2 + noseLen + 3),
    mouthW: child ? 4 : mw,
    child,
  };
}

function halfWidth(g: FaceGeo, look: Look, y: number): number {
  const jaw = look.face?.jaw || 'round';
  if (y < g.yt) return 0;
  if (y <= g.ye) {
    const t = (g.ye - y) / (g.ye - g.yt);
    return g.hw * Math.sqrt(Math.max(0, 1 - t * t * 0.98));
  }
  if (y > g.yc) return 0;
  const t = (y - g.ye) / (g.yc - g.ye);
  let taper = 0;
  switch (jaw) {
    case 'square': taper = Math.pow(t, 3.2) * 0.62; break;
    case 'narrow': taper = Math.pow(t, 1.4) * 0.66; break;
    case 'heavy': taper = Math.pow(t, 2.6) * 0.45; break;
    default: taper = Math.pow(t, 1.9) * 0.62;
  }
  if (g.child) taper = Math.pow(t, 1.6) * 0.55;
  let hw = g.hw * (1 - taper);
  if (y >= g.yc - 1) hw = Math.min(hw, g.hw * 0.45);
  return hw;
}

function lipColor(skin: string) { return mixHex(skin, '#8a3a36', 0.45); }

export function paintPortrait(look: Look, expr: Expr, talk: boolean, blink: boolean): PixelBuffer {
  const g = faceGeo(look);
  const sk = SKIN[look.skin] || SKIN.fair;
  const skin = sk[2], skinD = sk[1], skinDD = sk[0], skinL = sk[3];
  const fig = new PixelBuffer(S, S); // character layer (outlined later)
  const hat = look.hat || 'none';
  const hs = look.hairStyle;
  const H = look.hair, HD = shade(H, -0.32), HL = shade(H, 0.25), HDD = shade(H, -0.5);

  // ---------- long hair behind the head ----------
  const coverAll = hat === 'hood' || hat === 'coif' || hat === 'wimple' || hat === 'monkhood' || hat === 'bascinet' || hat === 'sallet';
  if (!coverAll && (hs === 'long' || hs === 'ponytail')) {
    for (let y = g.ye - 6; y < S; y++) {
      const extra = hs === 'long' ? 1.5 : 0;
      const hw = g.hw + 2 + extra * Math.min(1, (y - g.ye + 6) / 10);
      for (let x = Math.round(g.cx - hw); x <= Math.round(g.cx + hw); x++) {
        if (hs === 'ponytail' && y > g.yc) continue;
        fig.px(x, y, x > g.cx + hw - 3 ? HD : (x < g.cx - hw + 2 ? HL : H));
      }
    }
  }
  if (hat === 'hood' || hat === 'monkhood') {
    const hc = look.hatColor || P.wood2;
    for (let y = g.yt - 3; y < S; y++) {
      const hw = y < g.ye ? (g.hw + 4) * Math.sqrt(Math.max(0, 1 - ((g.ye - y) / (g.ye - g.yt + 3)) ** 2)) : g.hw + 4 + (y - g.ye) * 0.35;
      for (let x = Math.round(g.cx - hw); x <= Math.round(g.cx + hw); x++) {
        fig.px(x, y, x > g.cx + hw - 3 ? shade(hc, -0.3) : hc);
      }
    }
  }

  // ---------- neck & shoulders ----------
  const neckTop = g.yc - 4;
  for (let y = neckTop; y < S; y++) {
    const nw = g.child ? 4 : look.build === 'broad' ? 6 : look.female ? 4 : 5;
    for (let x = g.cx - nw; x <= g.cx + nw; x++) fig.px(x, y, x > g.cx + nw - 2 ? skinDD : skinD);
  }
  paintShoulders(fig, look, g);

  // ---------- ears ----------
  const earCol = skin;
  for (let y = g.ye - 1; y <= g.ye + 5; y++) {
    const lx = Math.round(g.cx - halfWidth(g, look, g.ye) - 1);
    const rx = Math.round(g.cx + halfWidth(g, look, g.ye) + 1);
    if (y === g.ye - 1 || y === g.ye + 5) { fig.px(lx + 1, y, earCol); fig.px(rx - 1, y, skinD); continue; }
    fig.px(lx, y, earCol); fig.px(lx + 1, y, skinD);
    fig.px(rx, y, skinD); fig.px(rx - 1, y, skinD);
  }
  if (look.face?.earrings) { fig.px(Math.round(g.cx - g.hw - 1), g.ye + 6, P.gold3); fig.px(Math.round(g.cx + g.hw + 1), g.ye + 6, P.gold3); }

  // ---------- head skin ----------
  for (let y = g.yt; y <= g.yc; y++) {
    const hw = halfWidth(g, look, y);
    if (hw <= 0) continue;
    const x0 = Math.round(g.cx - hw), x1 = Math.round(g.cx + hw);
    for (let x = x0; x <= x1; x++) {
      let c = skin;
      const rel = (x - g.cx) / (hw + 0.01);
      if (rel > 0.55) c = skinD;
      if (rel > 0.85 && y > g.ye) c = skinDD;
      if (rel < -0.5 && y < g.ye + 4 && y > g.yt + 2) c = skinL;
      if (y >= g.yc - 1) c = skinD;
      fig.px(x, y, c);
    }
  }
  // cheek highlight & jaw shadow
  for (let y = g.ye + 2; y <= g.ye + 4; y++) fig.pxOn(Math.round(g.cx - g.hw * 0.62), y, skinL);

  // ---------- eyes ----------
  const eyeCol = look.eyes || '#4a3322';
  const lidCol = shade(skinDD, -0.35);
  const white = '#efe8dc';
  const closed = blink || expr === 'sleep' || expr === 'laugh' || expr === 'pain';
  const narrow = expr === 'angry' || expr === 'smirk' || look.face?.eyeShape === 'narrow' || look.face?.eyeShape === 'sleepy' || expr === 'tender';
  const wide = expr === 'surprised' || look.face?.eyeShape === 'wide' || g.child;
  for (const side of [-1, 1]) {
    const ex = g.cx + side * g.eyeOff; // eye center
    const x0 = ex - 2, x1 = ex + 2;
    const y = g.ye;
    if (look.eyepatch && side === 1) {
      for (let yy = y - 2; yy <= y + 2; yy++) for (let xx = x0 - 1; xx <= x1 + 1; xx++) fig.px(xx, yy, '#1f1a18');
      fig.line(x0 - 1, y - 2, Math.round(g.cx - g.hw), g.yt + 6, '#1f1a18');
      fig.line(x1 + 1, y - 2, Math.round(g.cx + g.hw), g.ye - 5, '#1f1a18');
      continue;
    }
    // socket shadow
    for (let xx = x0; xx <= x1; xx++) fig.pxOn(xx, y - 2, skinD);
    if (closed) {
      if (expr === 'laugh' || expr === 'happy') {
        // ^ shaped happy closed eyes
        fig.px(x0, y, lidCol); fig.px(x0 + 1, y - 1, lidCol); fig.px(ex, y - 1, lidCol); fig.px(x1 - 1, y - 1, lidCol); fig.px(x1, y, lidCol);
      } else if (expr === 'pain') {
        fig.px(x0, side < 0 ? y - 1 : y + 1, lidCol); fig.px(x0 + 1, y, lidCol); fig.px(ex, y, lidCol); fig.px(x1 - 1, y, lidCol); fig.px(x1, side < 0 ? y + 1 : y - 1, lidCol);
      } else {
        for (let xx = x0; xx <= x1; xx++) fig.px(xx, y + (xx === x0 || xx === x1 ? 0 : 1), lidCol);
        fig.px(x0 + 1, y + 2, skinD); fig.px(x1 - 1, y + 2, skinD);
      }
    } else {
      const h = wide ? g.eyeH : narrow ? 2 : g.eyeH - 1 + 1;
      const top = y - (h >= 3 ? 1 : 0);
      for (let yy = top; yy < top + h; yy++) for (let xx = x0; xx <= x1; xx++) {
        if ((xx === x0 || xx === x1) && (yy === top + h - 1 && h > 2)) continue;
        fig.px(xx, yy, white);
      }
      // iris & pupil
      const ix = ex - (side < 0 ? 0 : 1);
      for (let yy = top; yy < top + h; yy++) { fig.px(ix, yy, eyeCol); fig.px(ix + 1, yy, shade(eyeCol, -0.2)); }
      fig.px(ix + (side < 0 ? 1 : 0), top + Math.min(1, h - 1), '#15100e');
      fig.px(ix, top, '#ffffff');
      // upper lid & lashes
      for (let xx = x0; xx <= x1; xx++) fig.px(xx, top - 1, lidCol);
      if (look.female && !g.child) fig.px(side < 0 ? x0 - 1 : x1 + 1, top - 1, lidCol);
      if (narrow && expr === 'angry') { fig.px(side < 0 ? x1 : x0, top, lidCol); }
      // lower lid
      for (let xx = x0 + 1; xx <= x1 - 1; xx++) fig.pxOn(xx, top + h, skinD);
    }
    if (expr === 'cry') {
      const tx = side < 0 ? x0 + 1 : x1 - 1;
      for (let yy = y + 2; yy <= y + 7; yy++) if (yy % 3 !== 0) fig.px(tx + (yy > y + 4 ? -side : 0), yy, '#9cc8e8');
    }
    if (expr === 'sad' && !closed) fig.px(side < 0 ? x1 : x0, g.ye + 2, '#b8d8ee');
  }

  // ---------- brows ----------
  const browCol = look.hat === 'coif' || look.hat === 'wimple' ? (look.hair) : shade(look.hair, -0.1);
  const bThick = look.face?.brows === 'bushy' ? 2 : look.face?.brows === 'thick' ? 2 : 1;
  for (const side of [-1, 1]) {
    const ex = g.cx + side * g.eyeOff;
    let inner = 0, outer = 0; // vertical offsets
    switch (expr) {
      case 'angry': inner = 2; outer = -1; break;
      case 'sad': case 'cry': case 'worried': inner = -2; outer = 1; break;
      case 'surprised': inner = -2; outer = -2; break;
      case 'smirk': inner = side > 0 ? -1 : 0; outer = side > 0 ? -1 : 0; break;
      case 'pain': inner = 2; outer = 0; break;
      case 'tender': inner = -1; outer = 0; break;
    }
    const by = g.ye - 4;
    const xs = [ex - 3, ex - 2, ex - 1, ex, ex + 1, ex + 2];
    xs.forEach((xx, i) => {
      // i=0 is left end; inner end faces the nose
      const tInner = side < 0 ? i / 5 : 1 - i / 5;
      const off = Math.round(outer + (inner - outer) * tInner);
      for (let k = 0; k < bThick; k++) fig.px(xx, by + off - k, k === 0 ? browCol : shade(browCol, -0.15));
      if (look.face?.brows === 'bushy' && i % 2 === 0) fig.px(xx, by + off - 2, browCol);
    });
  }

  // ---------- nose ----------
  const nose = look.face?.nose || 'small';
  for (let y = g.noseTop; y <= g.noseBot; y++) {
    fig.px(g.cx + 1, y, skinD);
    if (y > g.noseTop + 1) fig.pxOn(g.cx - 1, y, skinL);
    if (nose === 'broad' && y > g.noseBot - 2) { fig.px(g.cx + 2, y, skinD); fig.px(g.cx - 2, y, skinD); }
    if (nose === 'hooked' && y === g.noseTop + 2) fig.px(g.cx + 2, y, skinD);
  }
  fig.px(g.cx - 1, g.noseBot + 1, skinDD);
  fig.px(g.cx + 1, g.noseBot + 1, skinDD);
  fig.px(g.cx, g.noseBot + 1, skinD);
  if (nose === 'button' || g.child) fig.px(g.cx, g.noseBot, skinL);

  // ---------- cheeks / freckles / wrinkles / scars ----------
  if (look.face?.cheeks || g.child || expr === 'tender' || expr === 'laugh') {
    const blush = mixHex(skin, '#d0605a', 0.35);
    for (const side of [-1, 1]) {
      const bx = g.cx + side * (g.eyeOff + 2);
      fig.pxOn(bx, g.ye + 3, blush); fig.pxOn(bx + side, g.ye + 3, blush); fig.pxOn(bx, g.ye + 4, blush);
    }
  }
  if (look.freckles) {
    const fcol = mixHex(skinD, '#8a4a2a', 0.4);
    for (const [dx, dy] of [[-6, 3], [-4, 4], [-7, 5], [4, 3], [6, 4], [7, 2], [-2, 2], [2, 3]]) fig.pxOn(g.cx + dx, g.ye + dy, fcol);
  }
  const wr = look.face?.wrinkles || 0;
  if (wr >= 1) { for (const side of [-1, 1]) fig.pxOn(g.cx + side * (g.eyeOff + 3), g.ye + 1, skinD); }
  if (wr >= 2) {
    for (let x = g.cx - 4; x <= g.cx + 4; x++) if (x % 3 !== 0) fig.pxOn(x, g.yt + 5, skinD);
    for (const side of [-1, 1]) { fig.pxOn(g.cx + side * 3, g.noseBot + 2, skinD); fig.pxOn(g.cx + side * 4, g.noseBot + 3, skinD); }
  }
  if (wr >= 3) {
    for (let x = g.cx - 3; x <= g.cx + 3; x++) if (x % 2 === 0) fig.pxOn(x, g.yt + 7, skinD);
    for (const side of [-1, 1]) fig.pxOn(g.cx + side * (g.eyeOff + 3), g.ye + 2, skinD);
  }
  if (look.scar) {
    const sc = mixHex(skin, '#e0a8a0', 0.6);
    for (let i = 0; i < 7; i++) fig.pxOn(g.cx + g.eyeOff - 2 + (i >> 1), g.ye - 4 + i, sc);
  }

  // ---------- mouth ----------
  const lip = lipColor(skin), lipD = shade(lip, -0.35);
  const my = g.mouthY, mw = g.mouthW;
  const mx0 = g.cx - Math.floor(mw / 2), mx1 = mx0 + mw - 1;
  const open = talk || expr === 'surprised' || expr === 'laugh';
  const mouthDark = '#3a1a18';
  const teeth = '#ece6da';
  if (open) {
    const oh = expr === 'surprised' ? 3 : expr === 'laugh' ? 3 : 2;
    const ox0 = expr === 'surprised' ? g.cx - 1 : mx0 + 1, ox1 = expr === 'surprised' ? g.cx + 1 : mx1 - 1;
    const lift = expr === 'happy' || expr === 'laugh' || expr === 'tender' ? -1 : 0;
    for (let y = my; y < my + oh; y++) for (let x = ox0; x <= ox1; x++) fig.px(x, y, mouthDark);
    if (expr === 'laugh' || expr === 'happy') for (let x = ox0; x <= ox1; x++) fig.px(x, my, teeth);
    fig.px(ox0 - 1, my + lift, lipD); fig.px(ox1 + 1, my + lift, lipD);
    for (let x = ox0; x <= ox1; x++) fig.pxOn(x, my + oh, lip);
    if (expr === 'sad' || expr === 'cry' || expr === 'angry') { fig.px(ox0 - 1, my + 1, lipD); fig.px(ox1 + 1, my + 1, lipD); }
  } else {
    let lc = 0, rc = 0; // corner offsets (negative = up)
    switch (expr) {
      case 'happy': case 'tender': lc = -1; rc = -1; break;
      case 'smirk': rc = -1; break;
      case 'sad': case 'cry': case 'worried': lc = 1; rc = 1; break;
      case 'angry': lc = 1; rc = 1; break;
      case 'pain': lc = 0; rc = 0; break;
    }
    for (let x = mx0; x <= mx1; x++) {
      let off = 0;
      if (x === mx0) off = lc; else if (x === mx1) off = rc;
      fig.px(x, my + off, lipD);
    }
    if (expr === 'angry' || expr === 'pain') for (let x = mx0 + 1; x <= mx1 - 1; x++) fig.px(x, my + 1, teeth);
    // lower lip hint
    for (let x = mx0 + 1; x <= mx1 - 1; x++) fig.pxOn(x, my + (expr === 'angry' || expr === 'pain' ? 2 : 1), lip);
    if (look.face?.mouth === 'full' || look.female) for (let x = mx0 + 1; x <= mx1 - 1; x++) fig.pxOn(x, my - 1, mixHex(lip, skin, 0.5));
  }
  // chin shading
  fig.pxOn(g.cx, g.yc - 2, skinD);

  // ---------- beard ----------
  const beard = look.beard || 'none';
  if (beard !== 'none') paintBeard(fig, look, g, beard, open);

  // ---------- hair on top / hats ----------
  if (!coverAll) paintPortraitHair(fig, look, g);
  paintPortraitHat(fig, look, g, expr);

  fig.outline(P.ink);

  // ---------- background ----------
  const out = new PixelBuffer(S, S);
  const bg = look.portraitBg || pickBg(look);
  const bgD = shade(bg, -0.35), bgL = shade(bg, 0.12);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x - 20, y - 16) / 40;
    let c = d < 0.45 ? bgL : d < 0.85 ? bg : bgD;
    // soft dither between bands
    if (Math.abs(d - 0.45) < 0.05 && (x + y) % 2) c = bg;
    if (Math.abs(d - 0.85) < 0.05 && (x + y) % 2) c = bgD;
    out.px(x, y, c);
  }
  out.blit(fig, 0, 0);
  return out;
}

function pickBg(look: Look) {
  const h = hashStr(look.shirt + look.hair) % 6;
  return ['#51657a', '#6b5a44', '#4f6a4a', '#6e4a4a', '#5a5270', '#6a6440'][h];
}

function paintShoulders(fig: PixelBuffer, look: Look, g: FaceGeo) {
  const outer = look.outer || 'none';
  const base = outer === 'mail' ? P.metal2 : outer === 'plate' ? P.metal3 : outer === 'none' || outer === 'apron' || outer === 'vest' ? look.shirt : (look.outerColor || look.shirt);
  const baseD = shade(base, -0.3), baseL = shade(base, 0.15);
  const top = g.child ? 40 : 39;
  const broad = look.build === 'broad' || look.build === 'fat';
  const halfTop = g.child ? 9 : broad ? 12 : look.female ? 9 : 11;
  const halfBot = g.child ? 15 : broad ? 21 : look.female ? 16 : 19;
  for (let y = top; y < S; y++) {
    const t = (y - top) / (S - top);
    const hw = Math.round(halfTop + (halfBot - halfTop) * Math.min(1, t * 1.6));
    for (let x = g.cx - hw; x <= g.cx + hw; x++) {
      let c = base;
      if (x > g.cx + hw - 4) c = baseD;
      else if (x < g.cx - hw + 3) c = baseL;
      if (outer === 'mail' && (x + y) % 2) c = shade(c, -0.18);
      if (outer === 'gambeson' && (x - g.cx) % 3 === 0) c = shade(c, -0.15);
      fig.px(x, y, c);
    }
  }
  const sk = SKIN[look.skin] || SKIN.fair;
  // neckline
  if (outer === 'none' || outer === 'vest' || outer === 'apron' || outer === 'dress' || outer === 'leather') {
    const w = outer === 'dress' ? 6 : 3;
    for (let y = top; y < top + (outer === 'dress' ? 3 : 4); y++) for (let x = g.cx - w + (y - top); x <= g.cx + w - (y - top); x++) fig.px(x, y, y === top ? sk[1] : sk[2]);
    if (outer === 'none' || outer === 'leather') { fig.px(g.cx, top + 4, shade(base, -0.4)); fig.px(g.cx, top + 5, shade(base, -0.4)); }
  }
  if (outer === 'vest' || outer === 'leather') {
    const vc = look.outerColor || P.wood2;
    for (let y = top + 1; y < S; y++) {
      for (let x = g.cx - halfBot; x <= g.cx - 4; x++) fig.pxOn(x, y, x < g.cx - halfBot + 3 ? shade(vc, 0.1) : vc);
      for (let x = g.cx + 4; x <= g.cx + halfBot; x++) fig.pxOn(x, y, x > g.cx + halfBot - 4 ? shade(vc, -0.3) : vc);
    }
  }
  if (outer === 'apron') {
    const ac = look.apronColor || P.wood2;
    for (let y = top + 2; y < S; y++) { fig.pxOn(g.cx - 7, y, ac); fig.pxOn(g.cx - 6, y, ac); fig.pxOn(g.cx + 6, y, shade(ac, -0.2)); fig.pxOn(g.cx + 7, y, shade(ac, -0.2)); }
    for (let y = S - 4; y < S; y++) for (let x = g.cx - 7; x <= g.cx + 7; x++) fig.pxOn(x, y, x > g.cx + 4 ? shade(ac, -0.2) : ac);
  }
  if (outer === 'dress') {
    const trim = look.trim || shade(base, 0.35);
    for (let x = g.cx - 7; x <= g.cx + 7; x++) fig.pxOn(x, top + 3, trim);
    if (look.apronColor) for (let y = S - 5; y < S; y++) for (let x = g.cx - 8; x <= g.cx + 8; x++) fig.pxOn(x, y, look.apronColor);
  }
  if (outer === 'plate') {
    for (let y = top; y < top + 4; y++) for (let x = g.cx - 7; x <= g.cx + 7; x++) fig.pxOn(x, y, y === top ? P.metal4 : P.metal3);
    for (let x = g.cx - 5; x <= g.cx - 2; x++) fig.pxOn(x, top + 1, P.metal5);
  }
  if (outer === 'tabard' || outer === 'noble' || outer === 'brigandine') {
    const tc = look.outerColor || look.shirt;
    if (outer === 'tabard') {
      for (let y = top + 2; y < S; y++) for (let x = g.cx - 9; x <= g.cx + 9; x++) fig.pxOn(x, y, x > g.cx + 6 ? shade(tc, -0.3) : tc);
      if (look.trim) { for (let y = top + 3; y < S; y++) { fig.pxOn(g.cx, y, look.trim); fig.pxOn(g.cx + 1, y, look.trim); } for (let x = g.cx - 4; x <= g.cx + 5; x++) fig.pxOn(x, top + 6, look.trim); }
    }
    if (outer === 'noble') {
      // fur collar and chain
      for (let y = top; y < top + 3; y++) for (let x = g.cx - halfTop - 2; x <= g.cx + halfTop + 2; x++) fig.pxOn(x, y, (x + y) % 3 === 0 ? '#8a7a6a' : '#c8baa6');
      if (look.trim) for (let x = g.cx - 6; x <= g.cx + 6; x++) fig.pxOn(x, top + 5 + Math.round(Math.abs(x - g.cx) * -0.3 + 2), (x % 2) ? P.gold3 : P.gold2);
    }
    if (outer === 'brigandine') {
      for (let y = top + 2; y < S; y += 3) for (let x = g.cx - halfBot + 2; x < g.cx + halfBot; x += 3) fig.pxOn(x + (y % 2), y, shade(tc, 0.45));
    }
  }
  if (outer === 'robe') {
    const rc = look.outerColor || P.wood2;
    // hood folds on shoulders
    for (let x = g.cx - halfTop - 1; x <= g.cx + halfTop + 1; x++) { fig.pxOn(x, top, shade(rc, 0.12)); fig.pxOn(x, top + 1, shade(rc, -0.2)); }
  }
  if (look.cape) {
    const cc = look.cape;
    for (let y = top; y < S; y++) { fig.px(g.cx - halfBot - 1, y, shade(cc, -0.2)); fig.px(g.cx + halfBot + 1, y, shade(cc, -0.35)); }
    fig.px(g.cx - halfTop, top + 1, P.gold3); fig.px(g.cx + halfTop, top + 1, P.gold3);
  }
}

function paintBeard(fig: PixelBuffer, look: Look, g: FaceGeo, beard: string, open: boolean) {
  const bc = look.beardColor || look.hair;
  const bD = shade(bc, -0.3), bL = shade(bc, 0.2);
  const my = g.mouthY;
  if (beard === 'stubble') {
    for (let y = g.noseBot + 2; y <= g.yc; y++) {
      const hw = halfWidth(g, look, y);
      for (let x = Math.round(g.cx - hw) + 1; x <= Math.round(g.cx + hw) - 1; x++) {
        if ((x * 7 + y * 3) % 4 === 0 && !(y === my && Math.abs(x - g.cx) < g.mouthW / 2)) fig.pxOn(x, y, bD);
      }
    }
    return;
  }
  const moustache = () => {
    for (let x = g.cx - Math.floor(g.mouthW / 2) - 1; x <= g.cx + Math.ceil(g.mouthW / 2); x++) {
      fig.px(x, my - 1, x > g.cx + 1 ? bD : bc);
      if (x < g.cx - 1 || x > g.cx + 2) fig.px(x, my, bc);
    }
    fig.px(g.cx - Math.floor(g.mouthW / 2) - 1, my + 1, bD);
    fig.px(g.cx + Math.ceil(g.mouthW / 2), my + 1, bD);
  };
  if (beard === 'moustache') { moustache(); return; }
  if (beard === 'goatee') {
    moustache();
    for (let y = my + 2; y <= g.yc + 2; y++) for (let x = g.cx - 2; x <= g.cx + 2; x++) fig.px(x, y, x > g.cx ? bD : bc);
    return;
  }
  const extra = beard === 'short' ? 1 : beard === 'full' ? 3 : 8;
  const startY = g.ye + 3;
  for (let y = startY; y <= g.yc + extra; y++) {
    let hw = y <= g.yc ? halfWidth(g, look, y) : Math.max(2, halfWidth(g, look, g.yc - 1) - (y - g.yc) * (beard === 'long' ? 0.6 : 1.4));
    if (y < g.noseBot + 1) {
      // sideburns only
      const x0 = Math.round(g.cx - halfWidth(g, look, y));
      const x1 = Math.round(g.cx + halfWidth(g, look, y));
      fig.px(x0, y, bc); fig.px(x0 + 1, y, bc); fig.px(x1, y, bD); fig.px(x1 - 1, y, bD);
      continue;
    }
    for (let x = Math.round(g.cx - hw); x <= Math.round(g.cx + hw); x++) {
      // leave the mouth visible
      if (y >= my - 0 && y <= my + (open ? 2 : 1) && Math.abs(x - g.cx) <= Math.floor(g.mouthW / 2)) continue;
      if (y < my - 1 && Math.abs(x - g.cx) <= 1 && y <= g.noseBot + 1) continue;
      let c = bc;
      if (x > g.cx + hw * 0.5) c = bD;
      if ((x + y * 2) % 5 === 0) c = bL;
      if ((x * 3 + y) % 7 === 0) c = bD;
      fig.px(x, y, c);
    }
  }
  moustache();
}

function hairline(g: FaceGeo, x: number, style: string): number {
  // y where hair ends above the forehead for a given column
  const rel = (x - g.cx) / g.hw;
  const base = g.yt + (g.child ? 6 : 6);
  let y = base + Math.abs(rel) * 3;
  if (Math.abs(rel) > 0.75) y = g.ye - 1;
  if (style === 'messy') y += (x % 3 === 0 ? 2 : 0);
  if (style === 'curly') y += (x % 2 === 0 ? 1 : 0);
  if (style === 'long' || style === 'braids' || style === 'bun' || style === 'ponytail') {
    // center parting
    if (Math.abs(x - g.cx) <= 1) y = base - 1;
  }
  return y;
}

function paintPortraitHair(fig: PixelBuffer, look: Look, g: FaceGeo) {
  const hs = look.hairStyle;
  const hat = look.hat || 'none';
  const H = look.hair, HD = shade(H, -0.32), HL = shade(H, 0.25), HDD = shade(H, -0.5);
  if (hs === 'none') return;
  const hatted = hat !== 'none' && hat !== 'circlet';
  if (hs === 'bald' || hs === 'tonsure' || hs === 'balding') {
    // side hair only
    const sideTop = hs === 'bald' ? g.ye - 3 : hs === 'balding' ? g.ye - 6 : g.yt + 4;
    for (let y = sideTop; y <= g.ye + 3; y++) {
      const hw = halfWidth(g, look, y);
      for (const s of [-1, 1]) {
        for (let k = 0; k < 3; k++) fig.px(Math.round(g.cx + s * (hw - k)), y, s > 0 ? HD : H);
        fig.px(Math.round(g.cx + s * (hw + 1)), y, s > 0 ? HD : H);
      }
    }
    if (hs === 'tonsure') {
      for (let x = Math.round(g.cx - g.hw) - 1; x <= Math.round(g.cx + g.hw) + 1; x++) {
        const y = g.yt + 5 + Math.round(Math.abs(x - g.cx) * 0.25);
        fig.px(x, y, H); fig.px(x, y + 1, HD); fig.px(x, y - 1, x < g.cx ? HL : H);
      }
    }
    // scalp shine
    const sk = SKIN[look.skin] || SKIN.fair;
    fig.pxOn(g.cx - 4, g.yt + 2, sk[3]); fig.pxOn(g.cx - 3, g.yt + 1, sk[3]); fig.pxOn(g.cx - 5, g.yt + 3, sk[3]);
    return;
  }
  if (hatted && hat !== 'strawhat' && hat !== 'cap' && hat !== 'chaperon' && hat !== 'kettle' && hat !== 'kerchief' && hat !== 'feathercap') return;
  const volume = hs === 'curly' ? 3 : hs === 'messy' ? 2 : 1.5;
  const cyH = g.ye - 1;
  const ry = (g.ye - g.yt) + 3 + (hs === 'curly' ? 1 : 0);
  const rx = g.hw + volume;
  for (let y = g.yt - 5; y <= g.ye + 4; y++) {
    for (let x = Math.round(g.cx - rx) - 1; x <= Math.round(g.cx + rx) + 1; x++) {
      const dx = (x - g.cx) / rx, dy = (y - cyH) / ry;
      const r2 = dx * dx + dy * dy;
      if (y < cyH && r2 > 1) continue;
      if (y >= cyH && Math.abs(dx) > 1) continue;
      const hl = hairline(g, x, hs);
      const outsideHead = Math.abs(x - g.cx) > halfWidth(g, look, y) - 0.5 || y < g.yt;
      const inHairZone = y < hl || (outsideHead && y < g.ye + (hs === 'short' || hs === 'messy' || hs === 'curly' ? 1 : 4));
      if (!inHairZone) continue;
      if (hs === 'messy' && r2 > 0.8 && y < cyH && ((x * 7 + y) % 5 === 0)) continue;
      if (hs === 'curly' && r2 > 0.82 && y < cyH && ((x + y) % 3 === 0)) continue;
      let c = H;
      if (dx > 0.45) c = HD;
      if (dx < -0.25 && dy < -0.55) c = HL;
      if ((x * 5 + y * 3) % (look.old ? 13 : 7) === 0) c = HD;
      if (r2 > 0.62 && r2 < 0.78 && dx < 0.1 && dx > -0.7 && dy < -0.5) c = HL;
      fig.px(x, y, c);
    }
  }
  if (hs === 'messy') {
    for (let x = g.cx - 5; x <= g.cx + 2; x += 2) fig.px(x, hairline(g, x, 'short') + 1, H);
  }
  if (hs === 'short') { for (let x = g.cx - 5; x <= g.cx - 1; x++) fig.px(x, g.yt + 7, H); }
  if (hs === 'bun' && hat !== 'kerchief') {
    fig.ellipse(g.cx - 4, g.yt - 8, 9, 7, H);
    for (let x = g.cx - 2; x <= g.cx + 1; x++) fig.px(x, g.yt - 7, HL);
    fig.px(g.cx + 3, g.yt - 5, HD);
  }
  if (hs === 'braids') {
    for (const s of [-1, 1]) {
      const bx = Math.round(g.cx + s * (g.hw + 1));
      for (let y = g.ye; y < S; y++) {
        const wob = (Math.floor(y / 2) % 2) ? 1 : 0;
        const x0 = bx - 1 + (s < 0 ? -wob : wob);
        fig.px(x0, y, (y % 3 === 0) ? HD : H);
        fig.px(x0 + 1, y, (y % 3 === 1) ? HD : H);
        fig.px(x0 + 2, y, HD);
        if (y === S - 6) { fig.px(x0, y, P.clay3); fig.px(x0 + 1, y, P.clay3); fig.px(x0 + 2, y, P.clay2); }
      }
    }
  }
  if (hs === 'long') {
    for (const s of [-1, 1]) {
      for (let y = g.ye; y < S - 2; y++) {
        const bx = Math.round(g.cx + s * (halfWidth(g, look, Math.min(y, g.yc)) + 1));
        for (let k = 0; k < 3; k++) fig.px(bx + s * k, y, s > 0 ? HD : (k === 0 ? H : HL));
      }
    }
  }
}

function paintPortraitHat(fig: PixelBuffer, look: Look, g: FaceGeo, expr: Expr) {
  const hat = look.hat || 'none';
  if (hat === 'none') return;
  const hc = look.hatColor || '#b3a88a';
  const hcD = shade(hc, -0.3), hcL = shade(hc, 0.18);
  const steel = P.metal3, steelD = P.metal2, steelL = P.metal5, steelDD = P.metal1;
  const sk = SKIN[look.skin] || SKIN.fair;
  const faceOpening = (x: number, y: number, pad = 0) => {
    const hw = halfWidth(g, look, y) - 2 - pad;
    return y >= g.ye - 6 + pad && y <= g.yc - 1 && Math.abs(x - g.cx) <= hw;
  };
  switch (hat) {
    case 'kerchief': case 'wimple': {
      const col = hat === 'wimple' ? P.white : hc;
      const colD = hat === 'wimple' ? P.plaster2 : hcD;
      const cyH = g.ye - 1;
      const ry = (g.ye - g.yt) + 3.5;
      const rx = g.hw + 2.5;
      const bottom = hat === 'wimple' ? g.yc + 5 : g.ye + 2;
      for (let y = g.yt - 5; y < bottom; y++) {
        for (let x = Math.round(g.cx - rx) - 1; x <= Math.round(g.cx + rx) + 1; x++) {
          const dx = (x - g.cx) / rx, dy = (y - cyH) / ry;
          if (y < cyH && dx * dx + dy * dy > 1) continue;
          if (y >= cyH && Math.abs(dx) > 1) continue;
          if (hat === 'wimple' ? faceOpening(x, y) : (y > g.yt + 5 && Math.abs(x - g.cx) < halfWidth(g, look, y) - 1)) continue;
          let c = dx > 0.45 ? colD : col;
          if (dx < -0.3 && dy < -0.5) c = shade(col, 0.1);
          if ((x * 3 + y * 5) % 11 === 0) c = colD;
          fig.px(x, y, c);
        }
      }
      if (hat === 'kerchief') {
        // folded band over the forehead
        for (let x = Math.round(g.cx - g.hw) - 1; x <= Math.round(g.cx + g.hw) + 1; x++) {
          fig.px(x, g.yt + 5 + Math.round(Math.abs(x - g.cx) * 0.18), colD);
          fig.px(x, g.yt + 4 + Math.round(Math.abs(x - g.cx) * 0.18), col);
        }
        // a few strands of hair peeking out at the temples
        for (const sgn of [-1, 1]) for (let y = g.yt + 6; y < g.ye; y++) fig.pxOn(Math.round(g.cx + sgn * (halfWidth(g, look, y) - 1)), y, look.hair);
      }
      break;
    }
    case 'hood': case 'monkhood': {
      for (let y = g.yt - 4; y <= g.yc + 2; y++) {
        const hw = (y <= g.ye ? halfWidth(g, look, Math.max(g.yt, y)) : g.hw) + 3;
        for (let x = Math.round(g.cx - hw); x <= Math.round(g.cx + hw); x++) {
          const topY = g.yt - 4 + Math.pow(Math.abs(x - g.cx) / (hw + 0.1), 2) * 7;
          if (y < topY) continue;
          if (faceOpening(x, y, -1) || (y > g.yt + 4 && Math.abs(x - g.cx) < halfWidth(g, look, y) - 0.5 && y < g.yc)) continue;
          fig.px(x, y, x > g.cx + hw * 0.4 ? hcD : (x < g.cx - hw * 0.6 ? hcL : hc));
        }
      }
      // inner shadow around the face
      for (let y = g.yt + 5; y < g.yc; y++) {
        const hw = halfWidth(g, look, y);
        fig.pxOn(Math.round(g.cx - hw), y, shade(sk[1], -0.25));
        fig.pxOn(Math.round(g.cx + hw), y, shade(sk[1], -0.35));
      }
      break;
    }
    case 'coif': case 'bascinet': {
      const isB = hat === 'bascinet';
      for (let y = g.yt - (isB ? 6 : 3); y < S - 2; y++) {
        const hw = (y <= g.ye ? halfWidth(g, look, Math.max(g.yt, y)) : g.hw + (y - g.ye) * 0.3) + 2;
        for (let x = Math.round(g.cx - hw); x <= Math.round(g.cx + hw); x++) {
          let topY = g.yt - 3 + Math.pow(Math.abs(x - g.cx) / (hw + 0.1), 2) * 6;
          if (isB) topY = g.yt - 7 + Math.abs(x - g.cx) * 0.9;
          if (y < topY) continue;
          if (faceOpening(x, y, 0) && y > (isB ? g.ye - 5 : g.ye - 6)) continue;
          const plate = isB && y < g.ye - 4;
          let c = plate ? (x < g.cx - 3 ? steelL : x > g.cx + hw * 0.4 ? steelD : steel) : (((x + y) & 1) ? steelD : steel);
          if (!plate && y > g.yc + 2 && y > S - 8) c = ((x + y) & 1) ? steelDD : steelD;
          fig.px(x, y, c);
        }
      }
      if (isB) for (let x = Math.round(g.cx - g.hw) - 2; x <= Math.round(g.cx + g.hw) + 2; x++) fig.px(x, g.ye - 5, steelDD);
      break;
    }
    case 'kettle': {
      for (let y = g.yt - 5; y <= g.yt + 5; y++) {
        const hw = y < g.yt + 4 ? g.hw + 1 - Math.max(0, (g.yt - y) * 0.9) : g.hw + 7;
        for (let x = Math.round(g.cx - hw); x <= Math.round(g.cx + hw); x++) {
          const brim = y >= g.yt + 4;
          let c = brim ? (y === g.yt + 5 ? steelDD : steelD) : (x < g.cx - 3 ? steelL : x > g.cx + 4 ? steelD : steel);
          fig.px(x, y, c);
        }
      }
      break;
    }
    case 'sallet': {
      const m = look.hatColor || steel;
      const mD = shade(m, -0.3), mL = shade(m, 0.4), mDD = shade(m, -0.55);
      const rxS = g.hw + 3, ryS = (g.ye - g.yt) + 5, cyS = g.ye;
      for (let y = g.yt - 5; y <= g.yc + 1; y++) {
        const hw = g.hw + 3 + Math.max(0, y - g.ye) * 0.12;
        for (let x = Math.round(g.cx - hw); x <= Math.round(g.cx + hw); x++) {
          const ddx = (x - g.cx) / rxS, ddy = (y - cyS) / ryS;
          if (y < cyS && ddx * ddx + ddy * ddy > 1) continue;
          let c = x < g.cx - 4 && y < g.ye ? mL : x > g.cx + hw * 0.4 ? mD : m;
          if (y === g.ye - 1 || y === g.ye) c = mDD; // visor slit
          if (y === g.ye && Math.abs(x - g.cx) > 2 && (x % 2 === 0)) c = '#6a0f0f'; // glint of eyes in the dark
          fig.px(x, y, c);
        }
      }
      // tail
      for (let y = g.yc - 4; y <= g.yc + 3; y++) fig.px(Math.round(g.cx + g.hw + 3), y, mD);
      break;
    }
    case 'cap': case 'feathercap': {
      for (let y = g.yt - 4; y <= g.yt + 5; y++) {
        const hw = halfWidth(g, look, Math.max(g.yt, y)) + 2;
        for (let x = Math.round(g.cx - hw); x <= Math.round(g.cx + hw); x++) {
          const topY = g.yt - 4 + Math.pow(Math.abs(x - g.cx) / (hw + 0.1), 2) * 6;
          if (y < topY) continue;
          fig.px(x, y, y === g.yt + 5 ? hcD : x > g.cx + hw * 0.4 ? hcD : x < g.cx - hw * 0.4 ? hcL : hc);
        }
      }
      if (hat === 'feathercap') for (let i = 0; i < 9; i++) { fig.px(g.cx + 8 + (i >> 2), g.yt - 3 - i, P.white); fig.px(g.cx + 9 + (i >> 2), g.yt - 3 - i, '#d8d2c4'); }
      break;
    }
    case 'strawhat': {
      const s = P.thatch3, sD = P.thatch1, sL = P.thatch4;
      for (let y = g.yt - 6; y <= g.yt + 5; y++) {
        const brim = y >= g.yt + 3;
        const hw = brim ? g.hw + 9 - (y - g.yt - 3) : g.hw - 2 + Math.max(0, (y - g.yt + 6) * 0.2);
        for (let x = Math.round(g.cx - hw); x <= Math.round(g.cx + hw); x++) {
          let c = (x + y) % 3 === 0 ? sD : (x < g.cx - 3 ? sL : s);
          if (brim && y === g.yt + 5) c = sD;
          if (y === g.yt + 1) c = hc === '#b3a88a' ? P.clay2 : hc;
          fig.px(x, y, c);
        }
      }
      break;
    }
    case 'chaperon': {
      for (let y = g.yt - 7; y <= g.yt + 5; y++) {
        const hw = y > g.yt + 1 ? g.hw + 3 : g.hw + 1 - Math.max(0, (g.yt - 2 - y)) * 0.8;
        for (let x = Math.round(g.cx - hw); x <= Math.round(g.cx + hw); x++) {
          let c = y > g.yt + 1 ? ((x + y) % 4 === 0 ? hcD : hcL) : (x > g.cx + 3 ? hcD : hc);
          fig.px(x, y, c);
        }
      }
      for (let y = g.yt + 4; y < S - 4; y++) fig.px(Math.round(g.cx + g.hw + 4), y, hcD);
      break;
    }
    case 'circlet': {
      for (let x = Math.round(g.cx - g.hw) - 1; x <= Math.round(g.cx + g.hw) + 1; x++) {
        const y = g.yt + 5 + Math.round(Math.abs(x - g.cx) * 0.2);
        fig.px(x, y, (x % 4 === 0) ? P.gold4 : P.gold2);
      }
      fig.px(g.cx, g.yt + 4, '#a82020');
      break;
    }
  }
}

// ---------- cache & API ----------

const cache = new Map<string, HTMLCanvasElement>();

export function getPortrait(key: string, look: Look, expr: Expr = 'neutral', talk = false, blink = false): HTMLCanvasElement {
  const k = `${key}|${expr}|${talk ? 1 : 0}|${blink ? 1 : 0}|${JSON.stringify(look).length}`;
  let c = cache.get(k);
  if (c) return c;
  const buf = paintPortrait(look, expr, talk, blink);
  c = makeCanvas(S, S);
  buf.drawTo(c.getContext('2d')!, 0, 0);
  cache.set(k, c);
  return c;
}

export const PORTRAIT_SIZE = S;
export { clamp };
