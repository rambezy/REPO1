// Procedural buildings in 3/4 view: a front wall with door and windows, and a
// roof rising above the footprint. Returns sprite plus light/smoke anchors.

import { PixelBuffer } from './pixel';
import { P, CLOTH } from './palette';
import { RNG, shade } from '../engine/util';
import { Sprite, cachedSprite, spriteFromBuffer } from './sprite';

export type BuildingStyle = 'cottage' | 'townhouse' | 'stone' | 'log' | 'burned' | 'church' | 'keep' | 'tower' | 'tent' | 'barn' | 'mill' | 'stall' | 'shed' | 'gatehouse' | 'ruin';
export type RoofStyle = 'thatch' | 'clay' | 'slate' | 'shingle' | 'canvas' | 'none';

export interface BuildingSpec {
  w: number;
  h: number;
  style: BuildingStyle;
  door: number; // door column within footprint, -1 = none
  seed: number;
  roof?: RoofStyle;
  chimney?: boolean;
  sign?: string;
  tint?: string;
  tint2?: string;
}

export interface BuildingArt {
  sprite: Sprite;
  windows: { x: number; y: number }[]; // relative to base point
  smoke: { x: number; y: number } | null;
  doorX: number; // relative to base
}

const artCache = new Map<string, BuildingArt>();

export function buildingArt(spec: BuildingSpec): BuildingArt {
  const key = JSON.stringify(spec);
  const hit = artCache.get(key);
  if (hit) return hit;
  let art: BuildingArt;
  switch (spec.style) {
    case 'tent': art = paintTent(spec); break;
    case 'stall': art = paintStall(spec); break;
    case 'church': art = paintChurch(spec); break;
    case 'keep': case 'tower': art = paintKeep(spec); break;
    case 'gatehouse': art = paintGatehouse(spec); break;
    default: art = paintHouse(spec);
  }
  artCache.set(key, art);
  return art;
}

// ---------- roofs ----------

function paintRoof(b: PixelBuffer, x0: number, x1: number, top: number, eave: number, roof: RoofStyle, rng: RNG, inset = 5, burned = false) {
  const H = eave - top;
  for (let y = top; y <= eave; y++) {
    const t = (y - top) / Math.max(1, H);
    const ins = Math.round(inset * (1 - Math.min(1, t * 3)));
    for (let x = x0 + ins; x <= x1 - ins; x++) {
      let c = '#000';
      const lx = x - x0, ly = y - top;
      switch (roof) {
        case 'thatch': {
          const band = Math.floor(ly / 3);
          const n = rng.next();
          let i = band % 2 === 0 ? 2 : 3;
          if (n < 0.18) i--;
          if (n > 0.88) i++;
          if (ly < 3) i = 4;
          if (y >= eave - 2) i = 0;
          const T = [P.thatch0, P.thatch1, P.thatch2, P.thatch3, P.thatch4];
          c = T[Math.max(0, Math.min(4, i))];
          // straw streaks
          if ((lx * 7 + ly * 3) % 11 === 0) c = P.thatch1;
          break;
        }
        case 'clay': {
          const row = Math.floor(ly / 4);
          const ry = ly % 4;
          const off = (row % 2) * 3;
          const col = (lx + off) % 6;
          const Cc = [P.clay0, P.clay1, P.clay2, P.clay3, P.clay4];
          let i = ry === 3 ? 0 : ry === 0 ? 3 : 2;
          if (col === 0 && ry > 0) i = 1;
          if (rng.next() < 0.06) i = Math.max(1, i - 1);
          if (ly < 3) i = 4;
          c = Cc[i];
          break;
        }
        case 'slate': {
          const row = Math.floor(ly / 4);
          const ry = ly % 4;
          const off = (row % 2) * 4;
          const col = (lx + off) % 8;
          const S = ['#2a2e38', '#3a404c', '#4a5260', '#5c6474', '#707a8a'];
          let i = ry === 3 ? 0 : ry === 0 ? 3 : 2;
          if (col === 0) i = 1;
          if (ly < 3) i = 4;
          c = S[i];
          break;
        }
        case 'shingle': {
          const row = Math.floor(ly / 3);
          const ry = ly % 3;
          const off = (row % 2) * 2;
          const col = (lx + off) % 4;
          const W = [P.wood0, P.wood1, P.wood2, P.wood3, P.wood4];
          let i = ry === 2 ? 0 : 2;
          if (col === 0) i = 1;
          if (rng.next() < 0.1) i = 3;
          if (ly < 3) i = 4;
          c = W[i];
          break;
        }
        default:
          c = P.wood2;
      }
      if (burned) {
        // charred, collapsed: mostly dark interior with a few rafters
        c = rng.next() < 0.1 ? P.ash2 : P.ash0;
        if ((lx + ly) % 9 === 0 || (lx - ly * 2 + 99) % 13 === 0) c = P.wood0;
        if (rng.next() < 0.015) c = P.ember;
      }
      b.px(x, y, c);
    }
  }
  // eave shadow line
  for (let x = x0; x <= x1; x++) b.px(x, eave + 1, shade(P.ink, 0.1));
}

// ---------- walls ----------

type WallKind = 'plaster' | 'stone' | 'log' | 'charred' | 'plank';

function paintWall(b: PixelBuffer, x0: number, x1: number, top: number, bottom: number, kind: WallKind, rng: RNG) {
  for (let y = top; y <= bottom; y++) for (let x = x0; x <= x1; x++) {
    const lx = x - x0, ly = y - top;
    let c = '#000';
    let skip = false;
    switch (kind) {
      case 'plaster': {
        c = rng.next() < 0.5 ? P.plaster3 : P.plaster2;
        if (rng.next() < 0.03) c = P.plaster1;
        // timber frame
        if (ly < 2 || y > bottom - 2) c = P.timber;
        if (lx < 2 || x > x1 - 2) c = P.timber;
        if (lx % 24 === 12 || lx % 24 === 13) c = P.timber;
        if (ly === Math.floor((bottom - top) / 2) - 1) c = P.timber;
        break;
      }
      case 'stone': {
        const row = Math.floor(ly / 5);
        const off = (row % 2) * 4;
        const col = Math.floor((lx + off) / 8);
        const bx = (lx + off) % 8, by = ly % 5;
        const v = ((col * 31 + row * 17) % 7) / 7;
        const S = [P.stone1, P.stone2, P.stone3, P.stone4, P.stone5];
        let i = v < 0.35 ? 2 : v < 0.8 ? 3 : 4;
        if (bx === 0 || by === 0) i = 0;
        else if (by === 1) i = Math.min(4, i + 1);
        c = S[i];
        break;
      }
      case 'log': {
        const lg = ly % 5;
        c = lg === 0 ? P.wood1 : lg === 1 ? P.wood4 : lg === 4 ? P.wood1 : P.wood3;
        if (rng.next() < 0.05) c = P.wood2;
        if (lx < 2 || x > x1 - 2) c = lg < 2 ? P.wood5 : P.wood2;
        break;
      }
      case 'plank': {
        const pl = lx % 5;
        c = pl === 0 ? P.wood1 : pl === 1 ? P.wood4 : P.wood3;
        if (rng.next() < 0.05) c = P.wood2;
        break;
      }
      case 'charred': {
        const v = rng.next();
        c = v < 0.5 ? P.ash1 : v < 0.8 ? P.ash0 : P.ash2;
        if ((lx % 24 === 12 || lx < 2 || x > x1 - 2) && rng.next() < 0.8) c = P.wood0;
        if (ly < 6 && rng.next() < 0.5) skip = true;
        break;
      }
    }
    if (skip) continue;
    b.px(x, y, c);
  }
}

function paintWindow(b: PixelBuffer, x: number, y: number, shutter: string, arched = false, burned = false) {
  // 8x9 window with shutters open
  b.rect(x, y, 8, 9, P.timber);
  b.rect(x + 1, y + 1, 6, 7, burned ? P.ash0 : '#2a2a3a');
  if (!burned) {
    b.px(x + 2, y + 2, '#5a6a8a'); b.px(x + 3, y + 2, '#48587a');
    b.vline(x + 4, y + 1, y + 7, P.timber);
    b.hline(x + 1, x + 6, y + 4, P.timber);
    // shutters
    b.rect(x - 3, y, 3, 9, shutter);
    b.rect(x + 8, y, 3, 9, shade(shutter, -0.2));
    b.vline(x - 2, y + 1, y + 7, shade(shutter, -0.25));
    b.vline(x + 9, y + 1, y + 7, shade(shutter, -0.4));
    // sill & flower box
    b.rect(x - 1, y + 9, 10, 1, P.wood2);
  }
  if (arched) { b.set(x, y, 0); b.set(x + 7, y, 0); }
}

function paintDoor(b: PixelBuffer, x: number, bottom: number, w = 12, h = 20, arched = false, burned = false, open = false) {
  const top = bottom - h + 1;
  b.rect(x - 1, top - 1, w + 2, h + 1, P.timber);
  for (let yy = top; yy <= bottom; yy++) for (let xx = x; xx < x + w; xx++) {
    if (arched && yy < top + 3) {
      const d = Math.abs(xx - (x + w / 2 - 0.5));
      if (d > (w / 2) * ((yy - top + 1) / 3.2) + 1) continue;
    }
    let c = (xx - x) % 4 === 0 ? P.wood1 : (xx - x) % 4 === 1 ? P.wood4 : P.wood3;
    if (burned) c = (xx + yy) % 3 === 0 ? P.ash2 : P.ash0;
    if (open) c = '#150f0c';
    b.px(xx, yy, c);
  }
  if (!burned && !open) {
    b.hline(x, x + w - 1, top + 4, P.wood1);
    b.hline(x, x + w - 1, bottom - 4, P.wood1);
    b.px(x + w - 3, top + h / 2, P.gold2);
  }
  // step
  b.rect(x - 1, bottom, w + 2, 1, P.stone3);
}

function paintSign(b: PixelBuffer, x: number, y: number, sign: string) {
  // bracket
  b.hline(x, x + 8, y, P.metal1);
  b.vline(x + 1, y, y + 1, P.metal1);
  b.vline(x + 7, y, y + 1, P.metal1);
  b.rect(x, y + 2, 9, 8, P.wood3);
  b.rect(x, y + 2, 9, 1, P.wood4);
  b.rect(x, y + 9, 9, 1, P.wood1);
  const ic = (dx: number, dy: number, c: string) => b.px(x + dx, y + dy, c);
  switch (sign) {
    case 'tavern': case 'inn':
      // tankard
      for (let yy = 4; yy <= 8; yy++) { ic(3, yy, P.metal3); ic(4, yy, P.metal4); ic(5, yy, P.metal3); }
      ic(6, 5, P.metal3); ic(7, 6, P.metal3); ic(6, 7, P.metal3); ic(3, 4, P.white); ic(4, 4, P.white); ic(5, 4, P.white);
      break;
    case 'smith':
      for (let xx = 2; xx <= 6; xx++) ic(xx, 5, P.metal1);
      ic(2, 6, P.metal1); ic(3, 6, P.metal1); ic(4, 6, P.metal2); ic(4, 7, P.metal2); ic(3, 8, P.metal1); ic(4, 8, P.metal1); ic(5, 8, P.metal1);
      break;
    case 'bakery':
      for (let xx = 2; xx <= 6; xx++) { ic(xx, 6, P.bread3); ic(xx, 7, P.bread2); } ic(3, 5, P.bread3); ic(4, 5, P.bread4); ic(5, 5, P.bread3);
      break;
    case 'herbs': case 'apothecary':
      ic(4, 4, P.leaf4); ic(3, 5, P.leaf4); ic(5, 5, P.leaf4); ic(4, 5, P.leaf3); ic(4, 6, P.leaf3); ic(4, 7, P.leaf3); ic(4, 8, P.leaf2);
      break;
    case 'tailor':
      ic(2, 4, P.metal3); ic(3, 5, P.metal3); ic(4, 6, P.metal3); ic(6, 4, P.metal3); ic(5, 5, P.metal3); ic(2, 7, P.metal4); ic(6, 7, P.metal4); ic(3, 8, P.metal4); ic(5, 8, P.metal4);
      break;
    case 'bath':
      for (let xx = 2; xx <= 6; xx++) ic(xx, 7, P.wood1); ic(2, 6, P.wood1); ic(6, 6, P.wood1); ic(3, 5, P.water4); ic(5, 4, P.water4); ic(4, 6, P.water3);
      break;
    case 'butcher':
      ic(3, 4, '#c05050'); ic(4, 4, '#c05050'); ic(3, 5, '#c05050'); ic(4, 5, '#e0a0a0'); ic(5, 6, P.bread4); ic(6, 7, P.bread4);
      break;
    case 'armorer':
      for (let yy = 4; yy <= 8; yy++) for (let xx = 3; xx <= 5; xx++) ic(xx, yy, yy === 4 ? P.metal4 : P.metal3); ic(2, 4, P.metal3); ic(6, 4, P.metal3);
      break;
    default:
      ic(4, 5, P.gold3); ic(4, 6, P.gold3); ic(3, 6, P.gold2); ic(5, 6, P.gold2);
  }
}

// ---------- houses ----------

function paintHouse(s: BuildingSpec): BuildingArt {
  const rng = new RNG(s.seed * 31 + 7);
  const W = s.w * 16 + 4;
  const extraTop = s.style === 'barn' ? 22 : 18;
  const H = s.h * 16 + extraTop;
  const b = new PixelBuffer(W, H);
  const base = H - 1;
  const burned = s.style === 'burned' || s.style === 'ruin';
  const wallH = s.style === 'barn' ? 30 : 28;
  const wallTop = base - wallH + 1;
  const eave = wallTop + 3;
  const roofTop = 1;
  const wallKind: WallKind = burned ? 'charred' : s.style === 'stone' ? 'stone' : s.style === 'log' ? 'log' : s.style === 'barn' || s.style === 'shed' ? 'plank' : 'plaster';
  const roof: RoofStyle = s.roof || (s.style === 'townhouse' ? 'clay' : s.style === 'stone' ? 'slate' : s.style === 'log' ? 'shingle' : 'thatch');

  // walls
  paintWall(b, 2, W - 3, wallTop, base, wallKind, rng);
  // roof
  if (s.style !== 'ruin') paintRoof(b, 0, W - 1, roofTop, eave, roof, rng, roof === 'thatch' ? 6 : 4, burned);
  // ruin: broken wall tops
  if (s.style === 'ruin') {
    for (let x = 2; x < W - 2; x++) {
      const drop = Math.floor(Math.abs(Math.sin(x * 0.7 + s.seed)) * 10);
      for (let y = wallTop; y < wallTop + drop; y++) b.set(x, y, 0);
    }
  }

  // door
  const doorX = s.door >= 0 ? 2 + s.door * 16 + 2 : -100;
  if (s.door >= 0) {
    if (s.style === 'barn') paintDoor(b, doorX - 4, base, 20, 22, false, burned);
    else paintDoor(b, doorX, base, 12, 20, s.style === 'stone', burned, burned);
  }
  // windows
  const windows: { x: number; y: number }[] = [];
  const shutter = s.tint || rng.pick([CLOTH.green, CLOTH.blue, CLOTH.russet, CLOTH.red, P.wood2, CLOTH.teal]);
  for (let c = 0; c < s.w; c++) {
    if (c === s.door) continue;
    if (s.style === 'barn' || s.style === 'shed') continue;
    if (s.w >= 4 && c % 2 === 1 && c !== s.w - 1 && rng.chance(0.4)) continue;
    const wx = 2 + c * 16 + 4;
    const wy = wallTop + 8;
    if (wx < 5 || wx > W - 14) continue;
    paintWindow(b, wx, wy, shutter, s.style === 'stone', burned);
    windows.push({ x: wx + 4 - W / 2, y: wy + 4 - base });
  }
  // chimney
  let smoke: { x: number; y: number } | null = null;
  if (s.chimney && !burned) {
    const cx = rng.chance(0.5) ? W - 14 : 8;
    const ctop = roofTop - 0;
    for (let y = ctop; y < ctop + 12; y++) for (let x = cx; x < cx + 6; x++) {
      const v = (x + y * 3) % 5;
      b.px(x, y, y === ctop ? P.stone4 : v === 0 ? P.stone1 : x === cx + 5 ? P.stone2 : P.stone3);
    }
    b.rect(cx + 1, ctop, 4, 1, P.ink);
    smoke = { x: cx + 3 - W / 2, y: ctop - base };
  }
  if (burned && rng.chance(0.8)) smoke = { x: rng.int(8, W - 8) - W / 2, y: eave - 8 - base };
  // sign
  if (s.sign && s.door >= 0 && !burned) {
    const sx = doorX + 14 < W - 10 ? doorX + 13 : doorX - 11;
    paintSign(b, sx, wallTop + 4, s.sign);
  }
  // grime at base
  for (let x = 2; x < W - 2; x++) if (rng.chance(0.4)) b.px(x, base - 1, shade(P.stone1, -0.1));
  b.outline(P.ink);
  return { sprite: spriteFromBuffer(b, Math.floor(W / 2), base), windows, smoke, doorX: doorX + 6 - W / 2 };
}

function paintChurch(s: BuildingSpec): BuildingArt {
  const rng = new RNG(s.seed + 999);
  const W = s.w * 16 + 4;
  const towerH = 56;
  const H = s.h * 16 + 22 + towerH;
  const b = new PixelBuffer(W, H);
  const base = H - 1;
  const wallTop = base - 34;
  const eave = wallTop + 3;
  const roofTop = base - s.h * 16 - 12;
  paintWall(b, 2, W - 3, wallTop, base, 'stone', rng);
  paintRoof(b, 0, W - 1, roofTop, eave, s.roof || 'slate', rng, 6);
  // bell tower at the left third
  const tx0 = 6, tw = 22;
  const ttop = 16;
  paintWall(b, tx0, tx0 + tw, ttop, wallTop + 8, 'stone', rng);
  // belfry opening
  b.rect(tx0 + 7, ttop + 8, 9, 11, '#1a1614');
  b.rect(tx0 + 9, ttop + 12, 5, 4, P.gold2); // bell
  b.rect(tx0 + 10, ttop + 16, 3, 1, P.gold1);
  // spire
  for (let y = 0; y < ttop; y++) {
    const half = ((y + 1) / ttop) * (tw / 2 + 2);
    for (let x = Math.round(tx0 + tw / 2 - half); x <= Math.round(tx0 + tw / 2 + half); x++) {
      b.px(x, y, x < tx0 + tw / 2 ? '#4a5260' : '#3a404c');
    }
  }
  // cross
  const cxm = Math.round(tx0 + tw / 2);
  b.vline(cxm, 0, 5, P.gold3);
  b.hline(cxm - 2, cxm + 2, 2, P.gold3);
  // rose window
  const rwx = Math.floor(W * 0.62);
  b.circle(rwx, wallTop + 10, 5, P.timber);
  b.circle(rwx, wallTop + 10, 4, '#5a3a8a');
  b.px(rwx, wallTop + 10, P.gold3); b.px(rwx - 2, wallTop + 10, '#b83a3a'); b.px(rwx + 2, wallTop + 10, '#3a7ab8'); b.px(rwx, wallTop + 8, '#e8c040'); b.px(rwx, wallTop + 12, '#3a8a4a');
  const doorX = 2 + s.door * 16 + 1;
  paintDoor(b, doorX, base, 14, 22, true);
  const windows = [{ x: rwx - W / 2, y: wallTop + 10 - base }];
  b.outline(P.ink);
  return { sprite: spriteFromBuffer(b, Math.floor(W / 2), base), windows, smoke: null, doorX: doorX + 7 - W / 2 };
}

function paintKeep(s: BuildingSpec): BuildingArt {
  const rng = new RNG(s.seed + 555);
  const W = s.w * 16 + 4;
  const tall = s.style === 'keep' ? 64 : 52;
  const H = s.h * 16 + tall;
  const b = new PixelBuffer(W, H);
  const base = H - 1;
  const wallTop = 10;
  paintWall(b, 2, W - 3, wallTop, base, 'stone', rng);
  // top platform (seen from above) with crenellations
  const platTop = 0;
  for (let y = platTop; y < wallTop; y++) for (let x = 2; x < W - 2; x++) b.px(x, y, (x + y) % 7 === 0 ? P.stone1 : P.stone2);
  for (let x = 2; x < W - 2; x++) {
    const m = Math.floor((x - 2) / 4) % 2 === 0;
    b.px(x, wallTop - 3, m ? P.stone4 : P.stone1);
    b.px(x, wallTop - 2, m ? P.stone3 : P.stone0);
    b.px(x, wallTop - 1, m ? P.stone3 : P.stone0);
  }
  // arrow slits
  const windows: { x: number; y: number }[] = [];
  for (let row = 0; row < 3; row++) for (let c = 1; c < s.w; c += 2) {
    const x = 2 + c * 16 - 1, y = wallTop + 12 + row * 20;
    if (y > base - 26) continue;
    b.rect(x, y, 2, 7, '#15110f');
    windows.push({ x: x + 1 - W / 2, y: y + 3 - base });
  }
  // banner
  if (s.tint) {
    const bx = Math.floor(W / 2) - 5;
    b.rect(bx, wallTop + 4, 10, 18, s.tint);
    b.rect(bx, wallTop + 4, 10, 1, P.gold2);
    if (s.tint2) { b.rect(bx + 4, wallTop + 7, 2, 10, s.tint2); b.rect(bx + 2, wallTop + 10, 6, 2, s.tint2); }
    b.px(bx, wallTop + 22, s.tint); b.px(bx + 9, wallTop + 22, s.tint);
  }
  let doorX = -100;
  if (s.door >= 0) { doorX = 2 + s.door * 16 + 1; paintDoor(b, doorX, base, 14, 22, true); }
  b.outline(P.ink);
  return { sprite: spriteFromBuffer(b, Math.floor(W / 2), base), windows, smoke: null, doorX: doorX + 7 - W / 2 };
}

function paintGatehouse(s: BuildingSpec): BuildingArt {
  // a wall section with an open archway through the middle; the passage is walkable.
  const rng = new RNG(s.seed + 77);
  const W = s.w * 16;
  const H = s.h * 16 + 34;
  const b = new PixelBuffer(W, H);
  const base = H - 1;
  const wallTop = 12;
  paintWall(b, 0, W - 1, wallTop, base, 'stone', rng);
  for (let y = 0; y < wallTop; y++) for (let x = 0; x < W; x++) b.px(x, y, (x + y) % 6 === 0 ? P.stone1 : P.stone2);
  for (let x = 0; x < W; x++) {
    const m = Math.floor(x / 4) % 2 === 0;
    b.px(x, wallTop - 3, m ? P.stone4 : P.stone1);
    b.px(x, wallTop - 2, m ? P.stone3 : P.stone0);
  }
  // archway
  const aw = 28, ax = Math.floor(W / 2 - aw / 2);
  const atop = base - 34;
  for (let y = atop; y <= base; y++) for (let x = ax; x < ax + aw; x++) {
    if (y < atop + 8) {
      const d = Math.abs(x - (ax + aw / 2 - 0.5));
      if (d > (aw / 2) * Math.sqrt(Math.max(0, (y - atop) / 8)) + 0.5) continue;
    }
    b.set(x, y, 0);
  }
  // portcullis teeth at the top of the arch
  for (let x = ax + 2; x < ax + aw - 2; x += 3) { b.px(x, atop + 6, P.metal1); b.px(x, atop + 7, P.metal1); b.px(x, atop + 8, P.metal2); }
  if (s.tint) {
    b.rect(ax - 12, wallTop + 6, 8, 16, s.tint); b.rect(ax + aw + 4, wallTop + 6, 8, 16, s.tint);
    if (s.tint2) { b.rect(ax - 9, wallTop + 8, 2, 11, s.tint2); b.rect(ax + aw + 7, wallTop + 8, 2, 11, s.tint2); }
  }
  b.outline(P.ink);
  return { sprite: spriteFromBuffer(b, Math.floor(W / 2), base), windows: [], smoke: null, doorX: 0 };
}

function paintTent(s: BuildingSpec): BuildingArt {
  const rng = new RNG(s.seed + 3);
  const W = s.w * 16 + 4;
  const H = s.h * 16 + 14;
  const b = new PixelBuffer(W, H);
  const base = H - 1;
  const c1 = s.tint || '#d8cfb5', c2 = s.tint2 || shade(c1, -0.2);
  const top = 2;
  for (let y = top; y <= base; y++) {
    const t = (y - top) / (base - top);
    const half = 4 + t * (W / 2 - 4);
    for (let x = Math.round(W / 2 - half); x <= Math.round(W / 2 + half); x++) {
      const stripe = Math.floor((x - W / 2) / 5 + 100) % 2 === 0;
      let c = stripe ? c1 : c2;
      if (x > W / 2 + half - 3) c = shade(c, -0.25);
      if (x < W / 2 - half + 2) c = shade(c, 0.1);
      b.px(x, y, c);
    }
  }
  // entrance flap
  const ex = Math.floor(W / 2);
  for (let y = base - 14; y <= base; y++) {
    const half = Math.round((y - (base - 14)) / 2.5);
    for (let x = ex - half; x <= ex + half; x++) b.px(x, y, '#1e1612');
  }
  // pole & pennant
  b.vline(ex, 0, top + 2, P.wood1);
  b.rect(ex + 1, 0, 4, 2, s.tint2 || '#8e2f2f');
  b.outline(P.ink);
  return { sprite: spriteFromBuffer(b, Math.floor(W / 2), base), windows: [], smoke: null, doorX: 0 };
}

function paintStall(s: BuildingSpec): BuildingArt {
  const rng = new RNG(s.seed + 9);
  const W = s.w * 16 + 4;
  const H = 36;
  const b = new PixelBuffer(W, H);
  const base = H - 1;
  // posts
  b.rect(3, 8, 2, base - 8, P.wood1);
  b.rect(W - 5, 8, 2, base - 8, P.wood1);
  // counter
  b.rect(2, base - 11, W - 4, 11, P.wood3);
  b.rect(2, base - 11, W - 4, 2, P.wood4);
  for (let x = 4; x < W - 4; x += 5) b.vline(x, base - 9, base, P.wood2);
  // goods
  const goods = [P.bread3, '#c8302a', P.leaf4, P.gold3, '#e8e0c8', P.clay3, CLOTH.woad];
  for (let x = 5; x < W - 6; x += 4) {
    const g = rng.pick(goods);
    b.rect(x, base - 14, 3, 3, g);
    b.px(x, base - 14, shade(g, 0.3));
  }
  // striped awning
  const c1 = s.tint || CLOTH.red, c2 = s.tint2 || P.white;
  for (let y = 0; y < 10; y++) for (let x = 0; x < W; x++) {
    const stripe = Math.floor(x / 5) % 2 === 0;
    let c = stripe ? c1 : c2;
    if (y > 7) c = shade(c, -0.25);
    if (y === 9 && x % 5 === 2) continue;
    b.px(x, y, c);
  }
  b.outline(P.ink);
  return { sprite: spriteFromBuffer(b, Math.floor(W / 2), base), windows: [], smoke: null, doorX: 0 };
}
