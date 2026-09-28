// Props and furniture. Each prop returns its sprite plus optional light,
// collision footprint and animation hints.

import { PixelBuffer } from './pixel';
import { P, CLOTH } from './palette';
import { RNG, shade } from '../engine/util';
import { Sprite, cachedSprite, spriteFromBuffer } from './sprite';

export interface PropLight { x: number; y: number; r: number; color: string; flicker?: boolean; intensity?: number }
export interface PropInfo {
  sprite: Sprite;
  light?: PropLight;
  /** collision footprint in px, centred horizontally on the base point, extending up from it */
  solid?: { w: number; h: number };
  anim?: 'fire' | 'bigfire' | 'smoke' | 'candle' | 'wheel';
  flat?: boolean; // draw under actors (rugs, decals)
  wall?: boolean; // mounted on a wall face
}

const infoCache = new Map<string, PropInfo>();

function box(b: PixelBuffer, x: number, y: number, w: number, h: number, col: string, top = true) {
  b.rect(x, y, w, h, col);
  if (top) b.rect(x, y, w, 1, shade(col, 0.2));
  b.rect(x, y + h - 1, w, 1, shade(col, -0.3));
  b.rect(x + w - 1, y, 1, h, shade(col, -0.22));
}

function finish(b: PixelBuffer, ox: number, oy: number, extra: Omit<PropInfo, 'sprite'> = {}, outline = true): PropInfo {
  if (outline) b.outline(P.ink);
  return { sprite: spriteFromBuffer(b, ox, oy), ...extra };
}

export function propInfo(type: string, variant = 0, opt = ''): PropInfo {
  const key = `${type}:${variant}:${opt}`;
  let info = infoCache.get(key);
  if (!info) {
    info = makeProp(type, variant, opt);
    infoCache.set(key, info);
  }
  return info;
}

function makeProp(type: string, v: number, opt: string): PropInfo {
  const rng = new RNG(v * 97 + type.length * 13);
  switch (type) {
    case 'barrel': {
      const b = new PixelBuffer(12, 15);
      b.ellipse(0, 1, 12, 14, P.wood3);
      for (let y = 2; y < 14; y++) { b.px(1, y, P.wood4); b.px(10, y, P.wood1); b.px(9, y, P.wood2); }
      b.hline(1, 10, 4, P.metal1); b.hline(1, 10, 11, P.metal1);
      b.ellipse(1, 0, 10, 5, opt === 'water' ? P.water3 : P.wood4);
      b.ellipse(2, 1, 8, 3, opt === 'water' ? P.water2 : P.wood2);
      if (opt === 'water') b.px(4, 1, P.foam);
      return finish(b, 6, 14, { solid: { w: 10, h: 6 } });
    }
    case 'crate': {
      const b = new PixelBuffer(14, 14);
      box(b, 0, 1, 14, 13, P.wood3);
      b.rect(0, 0, 14, 3, P.wood4);
      b.line(1, 4, 12, 12, P.wood2); b.rect(0, 3, 14, 1, P.wood1);
      b.rect(0, 12, 14, 1, P.wood1);
      return finish(b, 7, 13, { solid: { w: 13, h: 8 } });
    }
    case 'sack': {
      const b = new PixelBuffer(10, 11);
      b.ellipse(0, 2, 10, 9, P.plaster2);
      b.rect(3, 0, 4, 3, P.plaster1);
      b.px(4, 1, P.wood2); b.px(5, 1, P.wood2);
      b.rect(6, 4, 3, 6, P.plaster1);
      if (opt === 'flour') b.px(2, 4, P.white);
      return finish(b, 5, 10, { solid: { w: 8, h: 5 } });
    }
    case 'haystack': {
      const b = new PixelBuffer(28, 22);
      for (let y = 0; y < 22; y++) {
        const half = 13 * Math.sqrt(Math.max(0, 1 - ((21 - y) / 22) ** 2));
        for (let x = Math.round(14 - half); x <= Math.round(14 + half); x++) {
          const n = rng.next();
          let c = n < 0.3 ? P.thatch2 : n < 0.8 ? P.thatch3 : P.thatch4;
          if (x > 14 + half * 0.5) c = P.thatch1;
          if ((x + y * 2) % 7 === 0) c = P.thatch1;
          b.px(x, y, c);
        }
      }
      return finish(b, 14, 21, { solid: { w: 24, h: 10 } });
    }
    case 'cart': {
      const b = new PixelBuffer(34, 22);
      box(b, 2, 6, 28, 9, P.wood3);
      b.rect(2, 4, 28, 3, P.wood4);
      for (let x = 4; x < 30; x += 5) b.vline(x, 7, 13, P.wood2);
      // cargo
      if (opt === 'hay') for (let x = 3; x < 29; x++) for (let y = 0; y < 5; y++) b.px(x, y, rng.chance(0.5) ? P.thatch3 : P.thatch2);
      if (opt === 'bread') for (let x = 4; x < 28; x += 4) { b.rect(x, 1, 4, 3, P.bread3); b.px(x + 1, 1, P.bread4); }
      if (opt === 'barrels') { b.ellipse(4, 0, 8, 6, P.wood2); b.ellipse(14, 0, 8, 6, P.wood2); }
      // wheels
      for (const wx of [4, 22]) {
        b.circle(wx + 3, 17, 4, P.wood1);
        b.circle(wx + 3, 17, 3, P.wood2);
        b.px(wx + 3, 17, P.metal2);
        b.line(wx, 17, wx + 6, 17, P.wood1); b.line(wx + 3, 14, wx + 3, 20, P.wood1);
      }
      // shafts
      b.hline(30, 33, 11, P.wood2);
      return finish(b, 16, 21, { solid: { w: 30, h: 10 } });
    }
    case 'woodpile': {
      const b = new PixelBuffer(26, 16);
      for (let row = 0; row < 3; row++) for (let i = 0; i < 5 - row; i++) {
        const cx = 4 + i * 5 + row * 2.5, cy = 13 - row * 5;
        b.circle(Math.round(cx), cy, 2.5, P.wood2);
        b.circle(Math.round(cx), cy, 1.5, P.wood4);
        b.px(Math.round(cx), cy, P.wood3);
      }
      return finish(b, 13, 15, { solid: { w: 24, h: 8 } });
    }
    case 'fence_h': case 'fence_h_broken': {
      const b = new PixelBuffer(16, 14);
      const broken = type === 'fence_h_broken';
      b.rect(1, 3, 2, 11, P.wood2); b.px(1, 3, P.wood4);
      b.rect(0, 5, 16, 2, P.wood3); b.rect(0, 5, 16, 1, P.wood4);
      if (!broken) { b.rect(0, 9, 16, 2, P.wood3); b.rect(0, 9, 16, 1, P.wood4); }
      else b.line(4, 9, 14, 12, P.wood2);
      return finish(b, 8, 13, { solid: { w: 16, h: 4 } });
    }
    case 'fence_v': {
      const b = new PixelBuffer(6, 18);
      b.rect(2, 0, 2, 18, P.wood3);
      b.rect(2, 0, 1, 18, P.wood4);
      b.rect(1, 2, 4, 2, P.wood2); b.rect(1, 12, 4, 2, P.wood2);
      return finish(b, 3, 17, { solid: { w: 4, h: 16 } });
    }
    case 'fence_post': {
      const b = new PixelBuffer(4, 12);
      b.rect(1, 0, 2, 12, P.wood2); b.px(1, 0, P.wood4);
      return finish(b, 2, 11, { solid: { w: 3, h: 3 } });
    }
    case 'anvil': {
      const b = new PixelBuffer(16, 12);
      b.rect(5, 7, 6, 5, P.wood2); // stump
      b.rect(5, 7, 6, 1, P.wood4);
      b.rect(2, 2, 12, 3, P.metal2);
      b.rect(2, 2, 12, 1, P.metal4);
      b.rect(0, 3, 3, 1, P.metal2); b.px(0, 2, P.metal3);
      b.rect(6, 5, 5, 2, P.metal1);
      return finish(b, 8, 11, { solid: { w: 12, h: 6 } });
    }
    case 'forge': {
      const b = new PixelBuffer(30, 30);
      // hood
      for (let y = 0; y < 12; y++) { const half = 5 + y * 0.7; for (let x = Math.round(15 - half); x <= Math.round(15 + half); x++) b.px(x, y, x > 15 + half - 3 ? P.stone1 : (y + x) % 5 === 0 ? P.stone2 : P.stone3); }
      // hearth body
      box(b, 2, 12, 26, 18, P.stone3);
      for (let y = 13; y < 29; y += 5) for (let x = 3; x < 27; x += 1) if ((x + (y % 2) * 4) % 8 === 0) b.vline(x, y, y + 4, P.stone1);
      // coals
      b.rect(6, 14, 18, 5, '#2a1a14');
      for (let x = 7; x < 23; x++) b.px(x, 15 + (x % 2), rng.chance(0.5) ? P.fire1 : P.fire2);
      for (let x = 8; x < 22; x += 3) b.px(x, 14, P.fire3);
      // bellows
      b.rect(24, 20, 6, 5, P.wood2); b.rect(25, 21, 4, 3, '#6a3a22');
      return finish(b, 15, 29, { solid: { w: 28, h: 12 }, light: { x: 0, y: -14, r: 70, color: '#ff8a3a', flicker: true, intensity: 0.9 }, anim: 'fire' });
    }
    case 'grindstone': {
      const b = new PixelBuffer(18, 18);
      b.rect(2, 10, 2, 8, P.wood2); b.rect(14, 10, 2, 8, P.wood2);
      b.rect(1, 14, 16, 2, P.wood3);
      b.circle(9, 8, 6, P.stone3); b.circle(9, 8, 4, P.stone4); b.circle(9, 8, 1, P.wood2);
      b.hline(15, 17, 8, P.wood1);
      return finish(b, 9, 17, { solid: { w: 14, h: 6 } });
    }
    case 'well': {
      const b = new PixelBuffer(26, 32);
      // roof
      for (let y = 0; y < 8; y++) for (let x = 2 + (7 - y) * 0; x < 24; x++) b.px(x, y, y < 2 ? P.thatch4 : (x + y) % 3 === 0 ? P.thatch1 : P.thatch2);
      b.rect(3, 8, 2, 12, P.wood2); b.rect(21, 8, 2, 12, P.wood2);
      b.hline(3, 22, 11, P.wood1);
      b.vline(13, 11, 17, P.metal1);
      b.rect(11, 17, 5, 3, P.wood3);
      // stone ring
      for (let y = 18; y < 32; y++) for (let x = 1; x < 25; x++) {
        const dy = (y - 22) / 6, dx = (x - 13) / 12;
        if (dx * dx + dy * dy > 1.4 && y < 26) continue;
        if (y > 26 && (x < 2 || x > 23)) continue;
        b.px(x, y, (x + y * 2) % 7 === 0 ? P.stone1 : x > 19 ? P.stone2 : P.stone3);
      }
      b.ellipse(5, 19, 16, 6, P.water1);
      b.ellipse(7, 20, 12, 4, P.water0);
      return finish(b, 13, 31, { solid: { w: 24, h: 12 } });
    }
    case 'trough': {
      const b = new PixelBuffer(26, 10);
      box(b, 0, 2, 26, 8, P.wood3);
      b.rect(2, 2, 22, 4, P.water2);
      b.rect(2, 2, 22, 1, P.water4);
      b.rect(2, 8, 2, 2, P.wood1); b.rect(22, 8, 2, 2, P.wood1);
      return finish(b, 13, 9, { solid: { w: 26, h: 6 } });
    }
    case 'bench': {
      const b = new PixelBuffer(26, 10);
      b.rect(0, 2, 26, 3, P.wood3); b.rect(0, 2, 26, 1, P.wood4);
      b.rect(2, 5, 2, 5, P.wood1); b.rect(22, 5, 2, 5, P.wood1);
      return finish(b, 13, 9, { solid: { w: 24, h: 4 } });
    }
    case 'table': case 'table_long': {
      const long = type === 'table_long';
      const W = long ? 46 : 26;
      const b = new PixelBuffer(W, 18);
      b.rect(0, 2, W, 10, P.wood3);
      for (let x = 0; x < W; x += 5) b.vline(x, 2, 11, P.wood2);
      b.rect(0, 2, W, 1, P.wood4);
      b.rect(0, 11, W, 2, P.wood1);
      b.rect(2, 13, 2, 5, P.wood1); b.rect(W - 4, 13, 2, 5, P.wood1);
      if (long) b.rect(W / 2 - 1, 13, 2, 5, P.wood1);
      // things on the table
      if (opt === 'meal' || opt === 'feast') {
        for (let x = 3; x < W - 5; x += 8) {
          b.ellipse(x, 4, 6, 4, P.plaster3); b.rect(x + 1, 5, 4, 2, rng.pick([P.bread3, '#b85a3a', P.leaf4, P.gold3]));
        }
        b.rect(W - 6, 2, 3, 5, P.metal3); b.px(W - 6, 2, P.white);
      }
      if (opt === 'bread') { b.rect(4, 3, 6, 4, P.bread3); b.rect(5, 3, 3, 1, P.bread4); b.rect(13, 4, 5, 3, P.bread2); }
      if (opt === 'books') { b.rect(4, 4, 6, 4, CLOTH.red); b.rect(12, 5, 7, 3, P.paper); b.px(14, 6, P.ink); b.px(16, 6, P.ink); }
      return finish(b, W / 2, 17, { solid: { w: W - 2, h: 12 } });
    }
    case 'stool': {
      const b = new PixelBuffer(10, 9);
      b.ellipse(0, 0, 10, 4, P.wood4);
      b.rect(1, 3, 2, 6, P.wood1); b.rect(7, 3, 2, 6, P.wood1);
      return finish(b, 5, 8, { solid: { w: 8, h: 3 } });
    }
    case 'chair': {
      const b = new PixelBuffer(12, 16);
      b.rect(1, 0, 10, 8, P.wood2); b.rect(1, 0, 10, 1, P.wood4);
      b.rect(0, 8, 12, 3, P.wood3);
      b.rect(1, 11, 2, 5, P.wood1); b.rect(9, 11, 2, 5, P.wood1);
      return finish(b, 6, 15, { solid: { w: 10, h: 4 } });
    }
    case 'throne': {
      const b = new PixelBuffer(18, 26);
      b.rect(2, 0, 14, 16, P.wood2);
      b.rect(4, 2, 10, 12, CLOTH.crimson);
      b.px(8, 5, P.gold3); b.px(9, 5, P.gold3); b.rect(7, 6, 4, 1, P.gold2);
      b.rect(0, 14, 18, 5, P.wood3); b.rect(0, 14, 18, 1, P.wood4);
      b.rect(1, 19, 3, 7, P.wood1); b.rect(14, 19, 3, 7, P.wood1);
      b.px(2, 0, P.gold3); b.px(15, 0, P.gold3);
      return finish(b, 9, 25, { solid: { w: 16, h: 6 } });
    }
    case 'bed': {
      const b = new PixelBuffer(18, 30);
      const blanket = opt || rng.pick([CLOTH.red, CLOTH.woad, CLOTH.green, CLOTH.russet, CLOTH.undyed]);
      box(b, 0, 0, 18, 30, P.wood2);
      b.rect(1, 1, 16, 6, P.wood3); // headboard
      b.rect(2, 5, 14, 6, P.plaster4); // pillow
      b.rect(2, 5, 14, 1, P.white);
      b.rect(1, 10, 16, 18, blanket);
      b.rect(1, 10, 16, 2, shade(blanket, 0.2));
      for (let y = 14; y < 28; y += 4) b.hline(2, 15, y, shade(blanket, -0.15));
      b.rect(15, 10, 2, 18, shade(blanket, -0.3));
      return finish(b, 9, 29, { solid: { w: 16, h: 26 } });
    }
    case 'bed_straw': {
      const b = new PixelBuffer(18, 28);
      for (let y = 2; y < 28; y++) for (let x = 0; x < 18; x++) b.px(x, y, rng.chance(0.3) ? P.thatch2 : P.thatch3);
      b.rect(2, 12, 14, 14, opt || CLOTH.undyed);
      b.rect(3, 4, 10, 5, P.plaster3);
      return finish(b, 9, 27, { solid: { w: 16, h: 22 } });
    }
    case 'chest': {
      const b = new PixelBuffer(16, 13);
      const open = opt === 'open';
      box(b, 0, 4, 16, 9, P.wood3);
      if (!open) {
        b.rect(0, 0, 16, 5, P.wood4); b.rect(0, 0, 16, 1, P.wood5);
        b.vline(3, 0, 12, P.metal1); b.vline(12, 0, 12, P.metal1);
        b.rect(7, 4, 2, 3, P.gold2);
      } else {
        b.rect(0, 0, 16, 3, P.wood1);
        b.rect(1, 3, 14, 3, '#1e1410');
        b.px(4, 4, P.gold3); b.px(9, 4, P.gold3);
      }
      return finish(b, 8, 12, { solid: { w: 14, h: 6 } });
    }
    case 'shelf': {
      const b = new PixelBuffer(18, 26);
      box(b, 0, 0, 18, 26, P.wood2);
      for (let s = 0; s < 3; s++) {
        const y = 2 + s * 8;
        b.rect(1, y, 16, 6, P.wood0);
        b.rect(1, y + 6, 16, 1, P.wood4);
        for (let x = 2; x < 16; x += 3) {
          const k = rng.next();
          if (k < 0.3) { b.rect(x, y + 2, 2, 4, rng.pick([P.clay2, P.clay3, P.stone3])); }
          else if (k < 0.6) { b.rect(x, y + 1, 2, 5, rng.pick([CLOTH.red, CLOTH.woad, CLOTH.green, P.wood3])); }
          else if (k < 0.8) { b.rect(x, y + 3, 3, 3, rng.pick(['#6a8ab8', '#8ab86a', '#b86a6a'])); b.px(x + 1, y + 2, P.wood4); }
        }
      }
      return finish(b, 9, 25, { solid: { w: 18, h: 8 }, wall: true });
    }
    case 'bookshelf': {
      const b = new PixelBuffer(18, 28);
      box(b, 0, 0, 18, 28, P.wood1);
      for (let s = 0; s < 3; s++) {
        const y = 2 + s * 8;
        b.rect(1, y, 16, 7, P.wood0);
        for (let x = 1; x < 17; x++) {
          if (rng.chance(0.15)) continue;
          const h = rng.int(4, 7);
          b.vline(x, y + 7 - h, y + 6, rng.pick([CLOTH.red, CLOTH.woad, CLOTH.green, P.wood3, CLOTH.ochre, P.clay1, '#3a2a4a']));
        }
        b.rect(1, y + 7, 16, 1, P.wood3);
      }
      return finish(b, 9, 27, { solid: { w: 18, h: 8 }, wall: true });
    }
    case 'fireplace': case 'hearth': {
      const b = new PixelBuffer(30, 30);
      for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) {
        const v = (x + (Math.floor(y / 4) % 2) * 3) % 6 === 0 || y % 4 === 0;
        b.px(x, y, v ? P.stone1 : x > 25 ? P.stone2 : P.stone3);
      }
      b.rect(0, 12, 30, 3, P.wood2); // mantel
      b.rect(0, 12, 30, 1, P.wood4);
      b.rect(6, 16, 18, 14, '#1c120e');
      b.rect(8, 26, 14, 2, P.wood1);
      b.rect(10, 22, 10, 4, P.fire1); b.rect(12, 19, 6, 4, P.fire2); b.rect(14, 18, 2, 2, P.fire3);
      if (opt === 'pot') { b.rect(10, 17, 10, 7, '#2a2624'); b.rect(10, 17, 10, 1, P.metal2); b.vline(15, 15, 17, P.metal1); }
      return finish(b, 15, 29, { solid: { w: 30, h: 10 }, light: { x: 0, y: -8, r: 80, color: '#ff9a4a', flicker: true, intensity: 0.95 }, anim: 'fire', wall: true });
    }
    case 'oven': {
      const b = new PixelBuffer(30, 26);
      for (let y = 0; y < 26; y++) {
        const half = y < 14 ? 14 * Math.sqrt(Math.max(0, 1 - ((14 - y) / 14) ** 2)) : 14;
        for (let x = Math.round(15 - half); x <= Math.round(15 + half); x++) {
          let c = (x * 3 + y) % 7 === 0 ? P.clay1 : x > 15 + half * 0.4 ? P.clay2 : P.clay3;
          if (y < 4) c = P.clay4;
          b.px(x, y, c);
        }
      }
      b.ellipse(8, 12, 14, 12, '#1c120e');
      b.rect(10, 18, 10, 3, P.fire1); b.rect(12, 16, 6, 2, P.fire2);
      b.rect(0, 22, 30, 4, P.stone3);
      return finish(b, 15, 25, { solid: { w: 28, h: 10 }, light: { x: 0, y: -8, r: 60, color: '#ff9a4a', flicker: true, intensity: 0.8 }, anim: 'fire' });
    }
    case 'cauldron': {
      const b = new PixelBuffer(18, 18);
      b.line(1, 17, 5, 4, P.wood1); b.line(16, 17, 12, 4, P.wood1);
      b.ellipse(3, 5, 12, 10, '#2a2624');
      b.ellipse(3, 5, 12, 4, P.metal1);
      b.ellipse(4, 6, 10, 2, opt === 'brew' ? '#6ab04a' : '#5a4a3a');
      b.rect(5, 15, 8, 3, P.fire1); b.rect(7, 15, 4, 1, P.fire2);
      return finish(b, 9, 17, { solid: { w: 14, h: 6 }, light: { x: 0, y: -4, r: 40, color: '#ff9a4a', flicker: true, intensity: 0.6 }, anim: 'fire' });
    }
    case 'alchemy': {
      const b = new PixelBuffer(32, 22);
      b.rect(0, 8, 32, 8, P.wood3); b.rect(0, 8, 32, 1, P.wood4); b.rect(0, 15, 32, 1, P.wood1);
      b.rect(2, 16, 2, 6, P.wood1); b.rect(28, 16, 2, 6, P.wood1);
      // alembic & bottles
      b.ellipse(3, 3, 8, 7, P.metal3); b.line(10, 3, 15, 1, P.metal2);
      b.rect(17, 3, 3, 6, '#6ab04a'); b.px(18, 2, P.wood4);
      b.rect(21, 4, 3, 5, '#b86a6a'); b.px(22, 3, P.wood4);
      b.rect(25, 2, 3, 7, '#6a8ab8'); b.px(26, 1, P.wood4);
      b.ellipse(12, 6, 4, 3, P.stone3); // mortar
      b.px(14, 4, P.wood2);
      return finish(b, 16, 21, { solid: { w: 30, h: 10 } });
    }
    case 'lectern': {
      const b = new PixelBuffer(14, 18);
      b.rect(5, 6, 4, 12, P.wood2);
      b.rect(2, 16, 10, 2, P.wood1);
      b.rect(0, 2, 14, 5, P.wood3);
      b.rect(1, 1, 12, 4, P.paper); b.vline(7, 1, 4, P.wood2);
      for (let x = 2; x < 12; x += 2) if (x !== 7) b.px(x, 2, P.stone2);
      return finish(b, 7, 17, { solid: { w: 10, h: 4 } });
    }
    case 'altar': {
      const b = new PixelBuffer(34, 20);
      box(b, 0, 6, 34, 14, P.stone4);
      b.rect(0, 6, 34, 4, P.white); b.rect(4, 10, 26, 6, CLOTH.crimson); b.rect(15, 11, 4, 4, P.gold3);
      for (const x of [4, 28]) { b.rect(x, 0, 2, 6, P.plaster4); b.px(x, 0, P.fire2); }
      b.rect(15, 0, 4, 1, P.gold3); b.rect(16, 0, 2, 6, P.gold3); b.rect(14, 2, 6, 1, P.gold3);
      return finish(b, 17, 19, { solid: { w: 34, h: 10 }, light: { x: 0, y: -18, r: 50, color: '#ffd58a', flicker: true, intensity: 0.6 }, anim: 'candle' });
    }
    case 'pew': {
      const b = new PixelBuffer(34, 12);
      b.rect(0, 0, 34, 4, P.wood2); b.rect(0, 4, 34, 3, P.wood3); b.rect(0, 4, 34, 1, P.wood4);
      b.rect(1, 7, 2, 5, P.wood1); b.rect(31, 7, 2, 5, P.wood1);
      return finish(b, 17, 11, { solid: { w: 32, h: 5 } });
    }
    case 'candle': {
      const b = new PixelBuffer(6, 10);
      b.rect(2, 4, 2, 6, P.plaster4); b.rect(1, 9, 4, 1, P.metal2);
      b.px(2, 2, P.fire2); b.px(2, 3, P.fire1); b.px(3, 3, P.fire3);
      return finish(b, 3, 9, { light: { x: 0, y: -8, r: 30, color: '#ffd58a', flicker: true, intensity: 0.5 }, anim: 'candle' }, false);
    }
    case 'candelabra': {
      const b = new PixelBuffer(12, 22);
      b.vline(6, 6, 20, P.gold1); b.rect(3, 20, 7, 2, P.gold1);
      b.hline(2, 10, 7, P.gold2);
      for (const x of [2, 6, 10]) { b.rect(x, 3, 1, 4, P.plaster4); b.px(x, 1, P.fire2); b.px(x, 2, P.fire1); }
      return finish(b, 6, 21, { light: { x: 0, y: -18, r: 45, color: '#ffd58a', flicker: true, intensity: 0.7 }, anim: 'candle', solid: { w: 6, h: 3 } });
    }
    case 'torch': {
      const b = new PixelBuffer(8, 14);
      b.rect(3, 6, 2, 8, P.wood2); b.rect(2, 11, 4, 1, P.metal1);
      b.rect(2, 3, 4, 4, P.fire1); b.rect(3, 1, 2, 3, P.fire2); b.px(3, 0, P.fire3);
      return finish(b, 4, 13, { light: { x: 0, y: -11, r: 58, color: '#ffa04a', flicker: true, intensity: 0.85 }, anim: 'fire', wall: true }, false);
    }
    case 'banner': {
      const b = new PixelBuffer(12, 24);
      const c = opt || CLOTH.green;
      b.hline(0, 11, 0, P.wood1);
      b.rect(1, 1, 10, 20, c);
      b.rect(1, 1, 10, 1, shade(c, 0.2));
      b.rect(9, 1, 2, 20, shade(c, -0.25));
      b.px(1, 21, c); b.px(2, 22, c); b.px(10, 21, c); b.px(9, 22, c);
      b.rect(5, 5, 2, 10, P.gold3); b.rect(3, 8, 6, 2, P.gold3);
      return finish(b, 6, 23, { wall: true });
    }
    case 'window': {
      const b = new PixelBuffer(14, 14);
      b.rect(0, 0, 14, 14, P.timber);
      b.rect(2, 2, 10, 10, opt === 'night' ? '#1a2238' : '#8ab0d0');
      b.vline(7, 2, 11, P.timber); b.hline(2, 11, 7, P.timber);
      b.rect(2, 2, 4, 4, opt === 'night' ? '#26304a' : '#b8d4ea');
      return finish(b, 7, 13, { wall: true }, false);
    }
    case 'rug': {
      const b = new PixelBuffer(36, 24);
      const c = opt || CLOTH.crimson;
      b.rect(0, 0, 36, 24, shade(c, -0.25));
      b.rect(2, 2, 32, 20, c);
      b.rect(5, 5, 26, 14, shade(c, -0.15));
      for (let x = 7; x < 30; x += 4) { b.px(x, 11, P.gold3); b.px(x + 1, 12, P.gold2); }
      for (let x = 0; x < 36; x += 2) { b.px(x, 0, P.gold2); b.px(x, 23, P.gold2); }
      return finish(b, 18, 23, { flat: true }, false);
    }
    case 'signpost': {
      const b = new PixelBuffer(22, 28);
      b.rect(10, 4, 3, 24, P.wood2); b.rect(10, 4, 1, 24, P.wood4);
      b.rect(1, 5, 20, 5, P.wood3); b.rect(1, 5, 20, 1, P.wood4); b.px(0, 7, P.wood3);
      b.rect(2, 12, 18, 5, P.wood3); b.rect(2, 12, 18, 1, P.wood4); b.px(20, 14, P.wood3); b.px(21, 14, P.wood3);
      for (let x = 3; x < 19; x += 2) { b.px(x, 7, P.wood1); b.px(x + 1, 14, P.wood1); }
      return finish(b, 11, 27, { solid: { w: 5, h: 4 } });
    }
    case 'noticeboard': {
      const b = new PixelBuffer(26, 28);
      b.rect(2, 6, 2, 22, P.wood2); b.rect(22, 6, 2, 22, P.wood2);
      box(b, 0, 2, 26, 18, P.wood3);
      b.rect(0, 0, 26, 3, P.wood1);
      for (const [x, y] of [[3, 5], [12, 4], [18, 8], [5, 12]]) { b.rect(x, y, 6, 6, P.paper); b.px(x + 2, y, CLOTH.red); b.hline(x + 1, x + 4, y + 2, P.stone2); b.hline(x + 1, x + 3, y + 4, P.stone2); }
      return finish(b, 13, 27, { solid: { w: 24, h: 4 } });
    }
    case 'grave': case 'grave_fresh': {
      const b = new PixelBuffer(14, 22);
      if (type === 'grave_fresh') {
        b.ellipse(1, 12, 12, 10, P.dirt1); b.ellipse(3, 13, 8, 6, P.dirt2);
        b.rect(6, 0, 2, 14, P.wood2); b.rect(3, 3, 8, 2, P.wood2); b.px(6, 0, P.wood4);
        if (opt === 'flowers') { b.px(4, 16, '#e8c040'); b.px(8, 17, P.white); b.px(6, 18, '#b89ad8'); }
      } else {
        b.ellipse(1, 14, 12, 8, P.grass1);
        b.rect(3, 2, 8, 13, P.stone3); b.rect(3, 2, 8, 1, P.stone4); b.rect(9, 2, 2, 13, P.stone2);
        b.set(3, 2, 0); b.set(10, 2, 0);
        b.hline(5, 8, 6, P.stone1); b.vline(6, 4, 10, P.stone1);
      }
      return finish(b, 7, 21, { solid: { w: 10, h: 5 } });
    }
    case 'wayshrine': {
      // Central European wayside shrine: a small roofed pillar with an icon
      const b = new PixelBuffer(16, 34);
      b.rect(5, 12, 6, 22, P.plaster3); b.rect(9, 12, 2, 22, P.plaster2);
      b.rect(4, 32, 8, 2, P.stone3);
      b.rect(3, 12, 10, 10, P.plaster4);
      b.rect(5, 14, 6, 6, '#3a5a8a'); b.rect(7, 15, 2, 4, P.gold3); b.px(6, 16, P.gold3); b.px(9, 16, P.gold3);
      for (let y = 4; y < 12; y++) { const half = (y - 3) * 0.9; for (let x = Math.round(8 - half); x <= Math.round(8 + half); x++) b.px(x, y, x > 8 ? P.clay1 : P.clay2); }
      b.vline(8, 0, 4, P.metal2); b.hline(7, 9, 1, P.metal2);
      return finish(b, 8, 33, { solid: { w: 8, h: 4 } });
    }
    case 'pillory': {
      const b = new PixelBuffer(26, 24);
      b.rect(11, 6, 4, 18, P.wood2);
      b.rect(2, 6, 22, 5, P.wood3); b.rect(2, 6, 22, 1, P.wood4);
      b.circle(7, 9, 1, P.wood0); b.circle(13, 8, 2, P.wood0); b.circle(19, 9, 1, P.wood0);
      b.rect(8, 22, 10, 2, P.wood1);
      return finish(b, 13, 23, { solid: { w: 10, h: 4 } });
    }
    case 'dummy': {
      const b = new PixelBuffer(16, 28);
      b.rect(7, 10, 2, 18, P.wood2);
      b.rect(3, 12, 10, 3, P.wood3);
      b.ellipse(3, 10, 10, 12, P.thatch3);
      for (let y = 11; y < 21; y += 2) b.hline(4, 11, y, P.thatch2);
      b.circle(8, 5, 4, P.plaster2); b.px(7, 5, P.ink); b.px(9, 5, P.ink);
      b.rect(3, 13, 10, 5, opt === 'armored' ? P.metal3 : CLOTH.undyed);
      return finish(b, 8, 27, { solid: { w: 8, h: 4 } });
    }
    case 'target': {
      const b = new PixelBuffer(18, 22);
      b.line(3, 21, 7, 8, P.wood1); b.line(14, 21, 10, 8, P.wood1);
      b.circle(9, 9, 8, P.thatch3); b.circle(9, 9, 6, P.white); b.circle(9, 9, 4, CLOTH.red); b.circle(9, 9, 2, P.white); b.px(9, 9, CLOTH.red);
      return finish(b, 9, 21, { solid: { w: 12, h: 4 } });
    }
    case 'weaponrack': {
      const b = new PixelBuffer(26, 22);
      b.rect(0, 14, 26, 3, P.wood3); b.rect(0, 4, 26, 2, P.wood3);
      b.rect(1, 4, 2, 18, P.wood1); b.rect(23, 4, 2, 18, P.wood1);
      for (const x of [5, 10, 15, 20]) { b.vline(x, 0, 16, P.metal3); b.px(x, 0, P.metal5); b.hline(x - 1, x + 1, 12, P.metal1); }
      return finish(b, 13, 21, { solid: { w: 24, h: 5 }, wall: true });
    }
    case 'campfire': {
      const b = new PixelBuffer(18, 14);
      for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; b.circle(Math.round(9 + Math.cos(a) * 6), Math.round(9 + Math.sin(a) * 3.2), 1.5, P.stone3); }
      b.line(4, 11, 14, 6, P.wood1); b.line(4, 6, 14, 11, P.wood2);
      if (opt !== 'cold') { b.rect(7, 5, 5, 5, P.fire1); b.rect(8, 3, 3, 3, P.fire2); b.px(9, 2, P.fire3); }
      else b.rect(6, 7, 6, 3, P.ash2);
      return finish(b, 9, 13, opt === 'cold' ? { solid: { w: 12, h: 6 } } : { solid: { w: 12, h: 6 }, light: { x: 0, y: -6, r: 75, color: '#ff9a4a', flicker: true, intensity: 0.95 }, anim: 'fire' });
    }
    case 'bonfire': {
      const b = new PixelBuffer(36, 34);
      for (let i = 0; i < 12; i++) {
        const a = -Math.PI * 0.9 + (i / 11) * Math.PI * 0.8;
        b.line(18, 6, Math.round(18 + Math.cos(a + Math.PI) * 16), 32, i % 2 ? P.wood1 : P.wood2);
      }
      for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; b.circle(Math.round(18 + Math.cos(a) * 14), Math.round(30 + Math.sin(a) * 3), 2, P.stone3); }
      return finish(b, 18, 33, { solid: { w: 28, h: 10 }, light: { x: 0, y: -16, r: 140, color: '#ff8a3a', flicker: true, intensity: 1 }, anim: 'bigfire' });
    }
    case 'skep': {
      const b = new PixelBuffer(14, 14);
      b.rect(0, 11, 14, 3, P.wood2);
      for (let y = 1; y < 12; y++) {
        const half = 6 * Math.sqrt(Math.max(0, 1 - ((11 - y) / 11) ** 2));
        for (let x = Math.round(7 - half); x <= Math.round(7 + half); x++) b.px(x, y, y % 2 ? P.thatch3 : P.thatch2);
      }
      b.rect(6, 8, 2, 2, '#2a1a10');
      return finish(b, 7, 13, { solid: { w: 12, h: 4 } });
    }
    case 'coop': {
      const b = new PixelBuffer(26, 22);
      box(b, 1, 8, 24, 14, P.wood3);
      for (let x = 2; x < 25; x += 4) b.vline(x, 9, 21, P.wood2);
      for (let y = 0; y < 9; y++) for (let x = 0; x < 26; x++) b.px(x, y, y < 2 ? P.thatch4 : P.thatch2);
      b.rect(10, 14, 6, 8, '#1e1410');
      return finish(b, 13, 21, { solid: { w: 24, h: 10 } });
    }
    case 'kennel': {
      const b = new PixelBuffer(18, 16);
      box(b, 1, 6, 16, 10, P.wood3);
      for (let y = 0; y < 7; y++) { const half = y * 1.4; for (let x = Math.round(9 - half); x <= Math.round(9 + half); x++) b.px(x, y, P.wood1); }
      b.ellipse(5, 9, 8, 8, '#1e1410');
      return finish(b, 9, 15, { solid: { w: 16, h: 8 } });
    }
    case 'laundry': {
      const b = new PixelBuffer(36, 22);
      b.vline(1, 2, 21, P.wood2); b.vline(34, 2, 21, P.wood2);
      b.line(1, 3, 34, 4, P.plaster2);
      const cols = [P.white, CLOTH.woad, CLOTH.madder, P.plaster3];
      for (let i = 0; i < 4; i++) { const x = 4 + i * 8; b.rect(x, 4, 6, 8 + (i % 2) * 3, cols[i]); b.rect(x + 5, 4, 1, 8, shade(cols[i], -0.2)); }
      return finish(b, 18, 21, {});
    }
    case 'rubble': {
      const b = new PixelBuffer(26, 14);
      for (let i = 0; i < 14; i++) { const x = rng.int(2, 22), y = rng.int(5, 11); b.circle(x, y, rng.range(1, 3), rng.pick([P.stone2, P.stone3, P.ash2, P.wood1, P.ash1])); }
      b.line(2, 10, 20, 4, P.wood0); b.line(6, 12, 24, 8, P.wood1);
      return finish(b, 13, 13, { solid: { w: 20, h: 6 } });
    }
    case 'cage': {
      const b = new PixelBuffer(34, 30);
      box(b, 1, 20, 32, 5, P.wood2);
      for (const wx of [4, 24]) { b.circle(wx + 3, 26, 3.5, P.wood1); b.px(wx + 3, 26, P.metal2); }
      b.rect(1, 2, 32, 2, P.wood1);
      for (let x = 2; x < 33; x += 4) b.vline(x, 3, 19, P.metal1);
      return finish(b, 17, 29, { solid: { w: 30, h: 10 } });
    }
    case 'gallows': {
      const b = new PixelBuffer(34, 44);
      b.rect(4, 0, 3, 40, P.wood1);
      b.rect(4, 0, 26, 3, P.wood1);
      b.line(7, 12, 16, 3, P.wood1);
      b.vline(26, 3, 14, P.thatch2); b.circle(26, 16, 2, P.thatch2); b.set(26, 16, 0);
      box(b, 0, 38, 34, 6, P.wood2);
      return finish(b, 17, 43, { solid: { w: 32, h: 6 } });
    }
    case 'mine': {
      const b = new PixelBuffer(36, 32);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 36; x++) { const v = rng.next(); b.px(x, y, v < 0.3 ? P.stone1 : v < 0.7 ? P.stone2 : P.stone3); }
      b.rect(8, 8, 20, 24, '#0e0a08');
      b.rect(6, 6, 3, 26, P.wood2); b.rect(27, 6, 3, 26, P.wood2); b.rect(5, 5, 26, 3, P.wood1);
      return finish(b, 18, 31, {});
    }
    case 'minecart': {
      const b = new PixelBuffer(18, 14);
      box(b, 1, 2, 16, 8, P.metal1);
      for (let x = 2; x < 16; x += 2) b.px(x, 1, rng.pick([P.stone2, P.stone3, P.metal3]));
      b.circle(4, 11, 2, P.metal0); b.circle(13, 11, 2, P.metal0);
      return finish(b, 9, 13, { solid: { w: 16, h: 6 } });
    }
    case 'waterwheel': {
      const b = new PixelBuffer(30, 32);
      b.circle(15, 16, 14, P.wood1);
      for (let y = 0; y < 32; y++) for (let x = 0; x < 30; x++) if ((x - 15) ** 2 + (y - 16) ** 2 < 144) b.set(x, y, 0);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + v * 0.3; b.line(15, 16, Math.round(15 + Math.cos(a) * 14), Math.round(16 + Math.sin(a) * 14), P.wood2); }
      b.circle(15, 16, 2, P.wood3);
      return finish(b, 15, 31, { solid: { w: 28, h: 10 }, anim: 'wheel' });
    }
    case 'boat': {
      const b = new PixelBuffer(34, 14);
      for (let y = 2; y < 12; y++) { const inset = Math.abs(y - 7) * 1.5; for (let x = Math.round(inset); x < 34 - Math.round(inset); x++) b.px(x, y, y < 4 ? P.wood4 : y > 9 ? P.wood1 : P.wood2); }
      b.rect(6, 5, 22, 4, P.wood0);
      b.hline(10, 24, 7, P.wood3);
      return finish(b, 17, 13, { solid: { w: 30, h: 10 } });
    }
    case 'fountain': {
      const b = new PixelBuffer(36, 30);
      b.ellipse(0, 12, 36, 18, P.stone2);
      b.ellipse(2, 13, 32, 14, P.stone3);
      b.ellipse(4, 15, 28, 10, P.water2);
      b.ellipse(8, 17, 20, 6, P.water3);
      b.rect(16, 2, 4, 16, P.stone4); b.rect(18, 2, 2, 16, P.stone3);
      b.ellipse(12, 0, 12, 5, P.stone4);
      b.px(17, 6, P.foam); b.px(19, 9, P.foam); b.px(14, 12, P.foam);
      return finish(b, 18, 29, { solid: { w: 34, h: 14 } });
    }
    case 'statue': {
      const b = new PixelBuffer(18, 36);
      b.rect(2, 28, 14, 8, P.stone3); b.rect(2, 28, 14, 1, P.stone4);
      b.rect(6, 12, 6, 16, P.stone4); b.rect(10, 12, 2, 16, P.stone3);
      b.circle(9, 8, 3, P.stone5);
      b.rect(4, 14, 2, 8, P.stone4); b.rect(12, 14, 2, 8, P.stone3);
      return finish(b, 9, 35, { solid: { w: 14, h: 8 } });
    }
    case 'dryingrack': {
      const b = new PixelBuffer(26, 22);
      b.vline(2, 2, 21, P.wood2); b.vline(23, 2, 21, P.wood2);
      b.hline(2, 23, 3, P.wood3); b.hline(2, 23, 10, P.wood3);
      for (let x = 4; x < 22; x += 3) { b.vline(x, 4, 8, rng.pick([P.leaf3, P.leaf4, '#b8c8b0', P.thatch3])); b.vline(x + 1, 11, 15, rng.pick([P.leaf3, '#8a70b8', P.leaf4])); }
      return finish(b, 13, 21, { solid: { w: 24, h: 4 } });
    }
    case 'spinningwheel': {
      const b = new PixelBuffer(18, 18);
      b.circle(10, 7, 6, P.wood3); b.circle(10, 7, 4, P.wood1);
      b.circle(10, 7, 1, P.wood4);
      b.rect(2, 13, 14, 2, P.wood2); b.rect(3, 15, 2, 3, P.wood1); b.rect(14, 15, 2, 3, P.wood1);
      return finish(b, 9, 17, { solid: { w: 14, h: 4 } });
    }
    case 'millstone': {
      const b = new PixelBuffer(30, 18);
      b.ellipse(0, 4, 30, 14, P.stone2); b.ellipse(2, 2, 26, 12, P.stone3); b.ellipse(12, 6, 6, 4, P.stone1);
      b.rect(14, 0, 2, 7, P.wood2);
      return finish(b, 15, 17, { solid: { w: 28, h: 10 } });
    }
    case 'barrelstack': {
      const b = new PixelBuffer(28, 22);
      for (const [x, y] of [[0, 8], [14, 8], [7, 0]] as [number, number][]) {
        b.ellipse(x, y, 13, 13, P.wood3);
        b.ellipse(x + 2, y + 2, 9, 9, P.wood4);
        b.ellipse(x + 4, y + 4, 5, 5, P.wood2);
        b.px(x + 6, y + 6, P.metal1);
      }
      return finish(b, 14, 21, { solid: { w: 26, h: 10 } });
    }
    case 'cross': {
      const b = new PixelBuffer(14, 28);
      b.rect(6, 0, 3, 28, P.wood2); b.rect(1, 6, 13, 3, P.wood2); b.px(6, 0, P.wood4);
      return finish(b, 7, 27, { solid: { w: 6, h: 3 } });
    }
    case 'pot': {
      const b = new PixelBuffer(10, 10);
      b.ellipse(0, 2, 10, 8, P.clay2); b.rect(2, 1, 6, 2, P.clay3); b.rect(3, 0, 4, 1, P.clay1);
      if (opt === 'flowers') { b.px(3, 0, '#e8c040'); b.px(6, 0, '#e8a0a8'); b.px(4, 1, P.leaf4); }
      return finish(b, 5, 9, { solid: { w: 8, h: 4 } });
    }
    case 'ladder': {
      const b = new PixelBuffer(12, 24);
      b.vline(1, 0, 23, P.wood2); b.vline(10, 0, 23, P.wood2);
      for (let y = 2; y < 24; y += 4) b.hline(1, 10, y, P.wood3);
      return finish(b, 6, 23, {});
    }
    case 'stairs_down': {
      const b = new PixelBuffer(16, 16);
      for (let i = 0; i < 4; i++) b.rect(0, i * 4, 16, 4, shade(P.stone3, -i * 0.18));
      return finish(b, 8, 15, { flat: true }, false);
    }
    case 'bloodpool': {
      const b = new PixelBuffer(14, 8);
      b.ellipse(0, 0, 14, 8, P.blood1); b.ellipse(3, 2, 7, 4, P.blood2);
      return finish(b, 7, 7, { flat: true }, false);
    }
    case 'breadbasket': {
      const b = new PixelBuffer(14, 10);
      b.ellipse(0, 3, 14, 7, P.thatch2);
      b.rect(3, 1, 4, 3, P.bread3); b.rect(7, 2, 4, 3, P.bread2); b.px(4, 1, P.bread4);
      b.hline(0, 13, 5, P.thatch1);
      return finish(b, 7, 9, {});
    }
    case 'loom': {
      const b = new PixelBuffer(24, 22);
      b.rect(1, 0, 2, 22, P.wood2); b.rect(21, 0, 2, 22, P.wood2);
      b.rect(1, 2, 22, 2, P.wood3); b.rect(1, 16, 22, 2, P.wood3);
      for (let x = 4; x < 21; x++) b.vline(x, 4, 15, x % 2 ? CLOTH.woad : P.plaster3);
      return finish(b, 12, 21, { solid: { w: 22, h: 5 } });
    }
    case 'tub': {
      const b = new PixelBuffer(28, 16);
      b.ellipse(0, 0, 28, 16, P.wood3);
      b.ellipse(2, 2, 24, 10, P.water3);
      b.ellipse(5, 4, 12, 4, P.water4);
      b.hline(3, 24, 13, P.metal1);
      return finish(b, 14, 15, { solid: { w: 26, h: 10 } });
    }
    case 'tent_small': {
      const b = new PixelBuffer(28, 22);
      const c = opt || '#b8ae94';
      for (let y = 0; y < 22; y++) { const half = 2 + y * 0.6; for (let x = Math.round(14 - half); x <= Math.round(14 + half); x++) b.px(x, y, x > 14 ? shade(c, -0.2) : c); }
      for (let y = 10; y < 22; y++) { const half = (y - 10) * 0.4; for (let x = Math.round(14 - half); x <= Math.round(14 + half); x++) b.px(x, y, '#1e1612'); }
      return finish(b, 14, 21, { solid: { w: 24, h: 8 } });
    }
    case 'bedroll': {
      const b = new PixelBuffer(12, 24);
      b.rect(1, 2, 10, 22, opt || CLOTH.olive); b.rect(1, 2, 10, 5, P.plaster3);
      return finish(b, 6, 23, { flat: true });
    }
    case 'stall_goods': {
      const b = new PixelBuffer(14, 8);
      for (let x = 0; x < 14; x += 4) b.rect(x, 2, 3, 5, rng.pick([P.bread3, '#c8302a', P.leaf4, P.gold3]));
      return finish(b, 7, 7, {});
    }
    case 'flag': {
      const b = new PixelBuffer(16, 34);
      b.vline(2, 0, 33, P.wood1);
      const c = opt || CLOTH.green;
      b.rect(3, 1, 12, 8, c); b.rect(3, 1, 12, 1, shade(c, 0.2));
      b.rect(7, 3, 3, 4, P.gold3);
      return finish(b, 2, 33, { solid: { w: 3, h: 3 } });
    }
    case 'milestone': {
      const b = new PixelBuffer(10, 14);
      b.rect(1, 2, 8, 12, P.stone3); b.ellipse(1, 0, 8, 5, P.stone4); b.rect(7, 2, 2, 12, P.stone2);
      b.hline(3, 6, 6, P.stone1);
      return finish(b, 5, 13, { solid: { w: 8, h: 4 } });
    }
    case 'orepile': {
      const b = new PixelBuffer(22, 12);
      for (let i = 0; i < 16; i++) b.circle(rng.int(3, 18), rng.int(5, 10), rng.range(1, 2.5), rng.pick([P.stone2, P.stone3, P.metal3, P.stone1, '#8a8aa0']));
      return finish(b, 11, 11, { solid: { w: 18, h: 6 } });
    }
    case 'hanging_herbs': {
      const b = new PixelBuffer(20, 14);
      b.hline(0, 19, 0, P.wood2);
      for (let x = 1; x < 19; x += 3) { b.vline(x, 1, 4 + (x % 5), rng.pick([P.leaf3, P.leaf4, '#b8c8b0', '#8a70b8'])); }
      return finish(b, 10, 13, { wall: true }, false);
    }
  }
  // Fallback: a visible placeholder crate so missing props are obvious in testing.
  const b = new PixelBuffer(12, 12);
  b.rect(0, 0, 12, 12, '#ff00ff');
  return finish(b, 6, 11);
}
