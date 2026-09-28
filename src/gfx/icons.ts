// 16x16 procedural item icons, exported as data URLs for the HTML UI and as
// canvases for in-world drops.

import { PixelBuffer } from './pixel';
import { P, CLOTH } from './palette';
import { shade } from '../engine/util';

export interface IconSpec { shape: string; c1?: string; c2?: string; c3?: string }

const urlCache = new Map<string, string>();
const canvasCache = new Map<string, HTMLCanvasElement>();

function paint(spec: IconSpec): PixelBuffer {
  const b = new PixelBuffer(16, 16);
  const c1 = spec.c1 || P.metal3, c2 = spec.c2 || P.wood2, c3 = spec.c3 || P.gold2;
  const d1 = shade(c1, -0.3), l1 = shade(c1, 0.3);
  switch (spec.shape) {
    case 'sword': case 'longsword': case 'fathersword': {
      const long = spec.shape !== 'sword';
      const top = long ? 0 : 2;
      for (let i = top; i <= 10; i++) { b.px(14 - i, i, c1); b.px(15 - i, i, l1); b.px(13 - i, i + 1, d1); }
      b.px(15, 0, l1);
      b.line(2, 10, 6, 14, c3); // crossguard
      b.line(3, 12, 1, 14, c2); b.line(2, 12, 0, 14, c2); // grip
      b.px(0, 15, c3); b.px(1, 15, c3);
      if (spec.shape === 'fathersword') { b.px(8, 6, P.gold4); b.px(9, 5, P.gold4); }
      break;
    }
    case 'dagger': {
      for (let i = 4; i <= 10; i++) { b.px(14 - i, i, c1); b.px(15 - i, i, l1); }
      b.line(3, 9, 6, 12, c3);
      b.line(2, 12, 0, 14, c2); b.line(3, 12, 1, 14, c2);
      break;
    }
    case 'axe': {
      b.line(3, 14, 10, 3, c2); b.line(4, 14, 11, 3, shade(c2, -0.2));
      b.rect(9, 1, 5, 6, c1); b.rect(12, 0, 3, 8, c1); b.px(14, 0, l1); b.vline(14, 1, 7, l1); b.rect(9, 1, 2, 6, d1);
      break;
    }
    case 'mace': case 'hammer': {
      b.line(3, 14, 10, 5, c2); b.line(4, 14, 11, 5, shade(c2, -0.2));
      if (spec.shape === 'mace') { b.circle(11, 4, 3.2, c1); b.px(10, 3, l1); b.px(14, 1, c1); b.px(8, 1, c1); b.px(14, 7, c1); }
      else { b.rect(8, 1, 8, 5, c1); b.rect(8, 1, 8, 1, l1); b.rect(15, 1, 1, 5, d1); }
      break;
    }
    case 'spear': {
      b.line(1, 15, 12, 4, c2);
      b.line(12, 4, 15, 0, c1); b.line(11, 4, 14, 1, l1); b.line(10, 5, 13, 2, c1);
      break;
    }
    case 'stick': {
      b.line(2, 14, 13, 2, P.wood3); b.line(3, 14, 14, 2, P.wood2); b.px(8, 8, P.wood1);
      break;
    }
    case 'bow': {
      for (let i = 0; i < 14; i++) { const x = 3 + Math.round(Math.sin((i / 13) * Math.PI) * 6); b.px(x, 1 + i, c2); b.px(x + 1, 1 + i, shade(c2, 0.2)); }
      b.vline(3, 1, 14, P.plaster3);
      break;
    }
    case 'arrows': {
      for (const o of [0, 3, 6]) { b.line(2 + o, 14, 10 + o, 2, P.wood3); b.px(10 + o, 2, P.metal3); b.px(11 + o, 1, P.metal3); b.px(2 + o, 13, P.white); b.px(3 + o, 14, P.white); }
      break;
    }
    case 'helmet': case 'kettle': case 'bascinet': case 'coif': case 'hood': case 'cap': {
      if (spec.shape === 'kettle') { b.rect(4, 4, 8, 5, c1); b.rect(1, 9, 14, 2, c1); b.rect(4, 4, 3, 2, l1); b.rect(1, 10, 14, 1, d1); }
      else if (spec.shape === 'bascinet') { b.ellipse(3, 1, 10, 12, c1); b.rect(5, 6, 6, 4, '#1a1414'); b.rect(3, 11, 10, 4, d1); b.px(6, 3, l1); b.px(7, 2, l1); }
      else if (spec.shape === 'coif') { b.ellipse(3, 2, 10, 13, c1); b.ellipse(5, 5, 6, 7, '#2a2020'); for (let y = 2; y < 15; y++) for (let x = 3; x < 13; x++) if ((x + y) % 2 && b.get(x, y) && b.get(x, y) !== 0) b.px(x, y, d1); }
      else if (spec.shape === 'hood') { b.ellipse(2, 2, 12, 13, c1); b.ellipse(5, 5, 6, 8, '#2a2020'); b.rect(2, 12, 12, 3, d1); }
      else if (spec.shape === 'cap') { b.ellipse(3, 4, 10, 8, c1); b.rect(3, 8, 10, 3, c1); b.rect(3, 10, 10, 1, d1); b.rect(4, 5, 3, 2, l1); }
      else { b.ellipse(3, 2, 10, 10, c1); b.rect(3, 7, 10, 5, c1); b.px(5, 4, l1); }
      break;
    }
    case 'body': case 'gambeson': case 'mail': case 'plate': case 'tunic': case 'dress': case 'robe': {
      const col = spec.shape === 'mail' ? P.metal2 : spec.shape === 'plate' ? P.metal3 : c1;
      b.rect(3, 2, 10, 12, col);
      b.rect(0, 2, 3, 7, col); b.rect(13, 2, 3, 7, col);
      b.rect(6, 2, 4, 2, '#2a2020');
      if (spec.shape === 'mail') for (let y = 2; y < 14; y++) for (let x = 0; x < 16; x++) if ((x + y) % 2 && b.get(x, y)) b.px(x, y, P.metal3);
      if (spec.shape === 'gambeson') for (let x = 4; x < 13; x += 2) b.vline(x, 4, 13, shade(col, -0.2));
      if (spec.shape === 'plate') { b.rect(4, 3, 3, 8, P.metal5); b.rect(11, 3, 2, 10, P.metal2); }
      if (spec.shape === 'dress' || spec.shape === 'robe') { b.rect(2, 10, 12, 5, col); }
      b.rect(3, 13, 10, 1, shade(col, -0.3));
      if (spec.c2 && spec.shape !== 'mail') b.rect(3, 9, 10, 1, spec.c2);
      break;
    }
    case 'legs': {
      b.rect(3, 1, 10, 4, c1); b.rect(3, 5, 4, 10, c1); b.rect(9, 5, 4, 10, c1); b.rect(6, 5, 1, 10, shade(c1, -0.3)); b.rect(12, 5, 1, 10, shade(c1, -0.3));
      if (spec.c2) { b.rect(3, 12, 4, 3, spec.c2); b.rect(9, 12, 4, 3, spec.c2); }
      break;
    }
    case 'gloves': {
      b.rect(2, 5, 5, 8, c1); b.rect(9, 5, 5, 8, c1); b.rect(2, 3, 1, 3, c1); b.rect(9, 3, 1, 3, c1);
      b.rect(2, 11, 5, 2, shade(c1, -0.3)); b.rect(9, 11, 5, 2, shade(c1, -0.3));
      break;
    }
    case 'bread': { b.ellipse(1, 5, 14, 9, P.bread2); b.ellipse(2, 5, 12, 6, P.bread3); b.line(4, 7, 6, 9, P.bread1); b.line(8, 6, 10, 8, P.bread1); b.px(5, 6, P.bread4); break; }
    case 'roll': { b.ellipse(3, 5, 10, 8, P.bread3); b.px(6, 7, P.bread4); b.line(7, 8, 9, 10, P.bread1); break; }
    case 'apple': { b.circle(8, 9, 5, c1); b.px(6, 7, shade(c1, 0.4)); b.vline(8, 2, 4, P.wood2); b.px(9, 3, P.leaf4); b.px(10, 3, P.leaf4); break; }
    case 'cheese': { b.rect(2, 7, 12, 6, '#e8c860'); for (let x = 2; x < 14; x++) b.px(x, 6 - Math.floor((x - 2) / 3), '#f0d878'); b.px(5, 9, '#c8a040'); b.px(10, 10, '#c8a040'); b.rect(2, 12, 12, 1, '#b89030'); break; }
    case 'sausage': { for (let i = 0; i < 12; i++) b.circle(2 + i, 8 + Math.round(Math.sin(i / 3) * 2), 2, c1 || '#8a3a2a'); b.px(4, 7, '#c86a5a'); break; }
    case 'meat': { b.ellipse(2, 3, 11, 10, c1 || '#b85a4a'); b.ellipse(4, 5, 6, 5, shade(c1 || '#b85a4a', 0.3)); b.line(11, 11, 14, 14, P.plaster4); b.px(14, 13, P.plaster4); break; }
    case 'fish': { b.ellipse(1, 5, 11, 6, P.metal3); b.px(3, 7, P.ink); b.line(11, 7, 14, 4, P.metal2); b.line(11, 8, 14, 11, P.metal2); break; }
    case 'bowl': { b.ellipse(1, 6, 14, 8, P.wood3); b.ellipse(2, 5, 12, 4, c1 || '#8a5a3a'); b.px(5, 6, shade(c1 || '#8a5a3a', 0.4)); b.px(9, 5, P.leaf4); break; }
    case 'mug': { b.rect(3, 4, 8, 10, P.wood3); b.rect(3, 4, 8, 2, P.white); b.rect(11, 6, 3, 1, P.wood2); b.rect(13, 6, 1, 5, P.wood2); b.rect(11, 10, 3, 1, P.wood2); b.hline(3, 10, 9, P.wood1); break; }
    case 'bottle': case 'potion': {
      const col = c1;
      b.rect(6, 1, 4, 2, P.wood3);
      b.rect(6, 3, 4, 3, shade(col, 0.2));
      b.ellipse(2, 5, 12, 10, col);
      b.px(5, 8, shade(col, 0.6)); b.px(5, 9, shade(col, 0.5));
      if (spec.shape === 'potion') b.rect(4, 10, 8, 3, shade(col, -0.25));
      break;
    }
    case 'waterskin': { b.ellipse(2, 3, 12, 12, P.wood3); b.rect(6, 1, 4, 3, P.wood1); b.px(5, 6, P.wood4); break; }
    case 'herb': { b.vline(8, 5, 15, P.leaf3); b.vline(6, 7, 15, P.leaf2); b.vline(10, 7, 15, P.leaf2); for (const [x, y] of [[8, 3], [5, 6], [11, 6]]) { b.px(x, y, c1); b.px(x - 1, y, c1); b.px(x + 1, y, c1); b.px(x, y - 1, c1); b.px(x, y + 1, c2 || c1); } b.px(7, 10, P.leaf4); b.px(9, 11, P.leaf4); break; }
    case 'mushroom': { b.ellipse(2, 3, 12, 7, c1); b.rect(6, 8, 4, 6, P.plaster4); b.px(5, 5, P.white); b.px(9, 4, P.white); break; }
    case 'book': { b.rect(2, 2, 12, 12, c1); b.rect(2, 2, 2, 12, shade(c1, -0.3)); b.rect(12, 3, 1, 10, P.paper); b.rect(5, 5, 6, 2, c3); b.px(7, 9, c3); b.px(8, 9, c3); break; }
    case 'letter': { b.rect(2, 3, 12, 10, P.paper); b.line(2, 3, 8, 8, P.plaster1); b.line(13, 3, 8, 8, P.plaster1); b.circle(8, 9, 1.5, c1 || CLOTH.red); break; }
    case 'scroll': { b.rect(3, 3, 10, 10, P.paper); b.rect(2, 2, 12, 2, P.plaster2); b.rect(2, 12, 12, 2, P.plaster2); b.hline(5, 11, 6, P.stone2); b.hline(5, 10, 8, P.stone2); break; }
    case 'key': { b.circle(4, 5, 3, c1 || P.gold2); b.set(4, 5, 0); b.line(6, 7, 13, 14, c1 || P.gold2); b.px(12, 12, c1 || P.gold2); b.px(11, 13, c1 || P.gold2); break; }
    case 'coin': { b.circle(8, 8, 5, P.metal3); b.circle(8, 8, 3, P.metal4); b.px(7, 7, P.metal5); break; }
    case 'purse': { b.ellipse(2, 5, 12, 10, P.wood3); b.rect(5, 3, 6, 3, P.wood2); b.px(8, 3, P.gold3); b.px(6, 8, P.wood4); break; }
    case 'fox': {
      // the wooden fox toy
      const w = P.wood4, wd = P.wood3;
      b.rect(3, 8, 9, 4, w); b.rect(10, 5, 4, 5, w); b.px(10, 4, wd); b.px(13, 4, wd); b.px(14, 7, P.ink); b.px(12, 6, P.ink);
      b.rect(3, 12, 2, 2, wd); b.rect(9, 12, 2, 2, wd); b.line(3, 9, 0, 6, w); b.px(0, 5, P.plaster4); b.rect(4, 8, 6, 1, shade(w, 0.2));
      break;
    }
    case 'torch': { b.line(4, 14, 10, 6, P.wood2); b.rect(9, 2, 4, 5, P.fire1); b.rect(10, 1, 2, 3, P.fire2); b.px(10, 0, P.fire3); break; }
    case 'lantern': { b.rect(5, 4, 6, 9, P.metal1); b.rect(6, 5, 4, 7, P.fire2); b.rect(7, 7, 2, 3, P.fire3); b.rect(6, 1, 4, 2, P.metal1); break; }
    case 'lockpick': { b.line(2, 13, 12, 3, P.metal3); b.line(12, 3, 14, 3, P.metal3); b.line(3, 14, 11, 6, P.metal2); break; }
    case 'bandage': { b.circle(8, 8, 5, P.plaster4); b.circle(8, 8, 2, P.plaster2); b.line(11, 11, 15, 14, P.plaster4); b.px(12, 11, '#c05050'); break; }
    case 'pelt': { b.ellipse(1, 3, 14, 11, c1); b.rect(0, 5, 2, 3, c1); b.rect(14, 5, 2, 3, c1); b.rect(3, 12, 2, 3, c1); b.rect(11, 12, 2, 3, c1); b.ellipse(4, 5, 8, 6, shade(c1, 0.15)); break; }
    case 'ore': { b.ellipse(2, 5, 12, 9, P.stone2); b.px(5, 7, c1 || P.metal4); b.px(9, 9, c1 || P.metal4); b.px(7, 11, c1 || P.metal4); break; }
    case 'ingot': { for (let y = 7; y < 12; y++) b.hline(3 - (y - 7) + 3, 12 + (y - 7) - 3 + 1, y, c1 || P.metal3); b.hline(4, 11, 7, shade(c1 || P.metal3, 0.3)); break; }
    case 'charcoal': { for (let i = 0; i < 5; i++) b.circle(4 + (i % 3) * 4, 8 + Math.floor(i / 3) * 3, 2.2, i % 2 ? '#2a2624' : '#3a3634'); break; }
    case 'wreath': { for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; b.px(8 + Math.round(Math.cos(a) * 5), 8 + Math.round(Math.sin(a) * 4), i % 3 === 0 ? '#f0c020' : i % 3 === 1 ? '#f2f0e6' : P.leaf4); } break; }
    case 'dice': { b.rect(2, 5, 7, 7, P.plaster4); b.px(4, 7, P.ink); b.px(6, 9, P.ink); b.rect(8, 3, 6, 6, P.plaster3); b.px(10, 5, P.ink); b.px(12, 7, P.ink); b.px(11, 6, P.ink); break; }
    case 'ring': { b.circle(8, 9, 4, c1 || P.gold2); b.set(8, 9, 0); b.set(7, 9, 0); b.set(9, 9, 0); b.set(8, 8, 0); b.set(8, 10, 0); b.px(8, 4, c2 || '#c02030'); break; }
    case 'amulet': { b.line(3, 2, 8, 9, c2 || P.plaster3); b.line(13, 2, 8, 9, c2 || P.plaster3); b.circle(8, 11, 3, c1 || P.gold2); b.px(8, 11, c3); break; }
    case 'flower': { b.vline(8, 7, 15, P.leaf3); b.px(7, 11, P.leaf4); b.circle(8, 5, 3, c1); b.px(8, 5, '#f0c020'); break; }
    case 'drawing': { b.rect(1, 2, 14, 12, '#c8b894'); b.rect(1, 2, 14, 1, '#a89874'); for (const x of [4, 7, 10, 12]) { b.circle(x, 7, 1, P.ink); b.vline(x, 8, 11, P.ink); } b.px(12, 6, CLOTH.red); break; }
    case 'honey': { b.rect(4, 4, 8, 10, '#e8a830'); b.rect(4, 3, 8, 2, P.plaster3); b.px(6, 7, '#f8d070'); b.rect(3, 2, 10, 1, P.wood2); break; }
    case 'feather': { b.line(3, 14, 12, 2, P.plaster4); for (let i = 0; i < 8; i++) { b.px(6 + i, 10 - i, P.white); b.px(5 + i, 9 - i + 2, P.plaster3); } break; }
    case 'tool': { b.line(2, 14, 12, 4, P.wood2); b.rect(10, 1, 5, 5, P.metal2); break; }
    case 'wood': { b.rect(1, 6, 14, 5, P.wood3); b.rect(1, 6, 14, 1, P.wood4); b.circle(14, 8, 2, P.wood4); break; }
    case 'cloth': { b.rect(2, 4, 12, 9, c1); b.rect(2, 4, 12, 2, shade(c1, 0.25)); b.rect(12, 4, 2, 9, shade(c1, -0.25)); break; }
    case 'shield': { for (let y = 1; y < 15; y++) { const half = y < 9 ? 6 : 6 - (y - 9); b.hline(8 - half, 7 + half, y, c1); } b.vline(7, 1, 14, c2 || P.gold2); b.vline(8, 1, 14, c2 || P.gold2); break; }
    case 'seal': { b.circle(8, 8, 6, c1 || '#8e2f2f'); b.circle(8, 8, 4, shade(c1 || '#8e2f2f', 0.2)); b.px(7, 6, P.ink); b.px(9, 6, P.ink); b.line(6, 9, 10, 9, P.ink); b.px(8, 10, P.ink); break; }
    case 'bone': { b.line(3, 12, 12, 3, P.plaster4); b.circle(3, 13, 2, P.plaster4); b.circle(13, 3, 2, P.plaster4); b.circle(2, 11, 1.5, P.plaster4); b.circle(11, 2, 1.5, P.plaster4); break; }
    default:
      b.rect(3, 3, 10, 10, c1 || '#ff00ff');
  }
  b.outline(P.ink);
  return b;
}

export function iconCanvas(spec: IconSpec): HTMLCanvasElement {
  const key = JSON.stringify(spec);
  let c = canvasCache.get(key);
  if (!c) { c = paint(spec).toCanvas(); canvasCache.set(key, c); }
  return c;
}

export function iconURL(spec: IconSpec): string {
  const key = JSON.stringify(spec);
  let u = urlCache.get(key);
  if (!u) { u = iconCanvas(spec).toDataURL(); urlCache.set(key, u); }
  return u;
}
