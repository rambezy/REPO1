// Trees, bushes, rocks and other natural features.

import { PixelBuffer } from './pixel';
import { P } from './palette';
import { RNG, shade } from '../engine/util';
import { Sprite, cachedSprite, spriteFromBuffer } from './sprite';

export type TreeKind = 'oak' | 'linden' | 'birch' | 'pine' | 'apple' | 'dead' | 'burnt' | 'willow';

interface Blob { x: number; y: number; r: number }

/** Paints a clumpy canopy from overlapping circles with directional light. */
function canopy(b: PixelBuffer, blobs: Blob[], ramp: string[], rng: RNG, fruit?: string) {
  const L = [-0.55, -0.83];
  const w = b.w, h = b.h;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best: Blob | null = null, bestD = 1e9;
    for (const bl of blobs) {
      const dx = x - bl.x, dy = y - bl.y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d <= bl.r) {
        // prefer the blob that is "on top": lower on screen = nearer the viewer
        const score = d / bl.r - bl.y * 0.01;
        if (score < bestD) { bestD = score; best = bl; }
      }
    }
    if (!best) continue;
    const nx = (x - best.x) / best.r, ny = (y - best.y) / best.r;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    let lum = -(nx * L[0] + ny * L[1]) * 0.6 + nz * 0.5;
    lum += (rng.next() - 0.5) * 0.35;
    let i = Math.floor((lum + 0.35) * 3.2);
    i = Math.max(0, Math.min(ramp.length - 1, i));
    b.px(x, y, ramp[i]);
  }
  // leaf clusters: small highlight pixels
  for (let k = 0; k < (w * h) / 12; k++) {
    const x = rng.int(0, w - 1), y = rng.int(0, h - 1);
    if (b.get(x, y) && b.get(x, y + 1)) {
      b.px(x, y, ramp[Math.min(ramp.length - 1, 3 + (rng.chance(0.4) ? 1 : 0))]);
      b.px(x, y + 1, ramp[1]);
    }
  }
  if (fruit) {
    for (let k = 0; k < (w * h) / 60; k++) {
      const x = rng.int(2, w - 3), y = rng.int(2, h - 3);
      if (b.get(x, y)) { b.px(x, y, fruit); b.px(x + 1, y, shade(fruit, -0.25)); }
    }
  }
}

function trunk(b: PixelBuffer, cx: number, bottom: number, height: number, width: number, col: string, colD: string, colL: string) {
  for (let y = bottom - height; y <= bottom; y++) {
    const flare = y > bottom - 3 ? 1 : 0;
    for (let x = cx - Math.floor(width / 2) - flare; x <= cx + Math.ceil(width / 2) - 1 + flare; x++) {
      const rel = x - (cx - width / 2);
      b.px(x, y, rel < 1.5 ? colL : rel > width - 1.5 ? colD : col);
    }
  }
}

export function treeSprite(kind: TreeKind, variant: number): Sprite {
  return cachedSprite(`tree:${kind}:${variant}`, () => {
    const rng = new RNG(variant * 7919 + kind.length * 131);
    let b: PixelBuffer;
    let baseX: number, baseY: number;
    switch (kind) {
      case 'pine': {
        const W = 30 + rng.int(0, 6), H = 50 + rng.int(0, 10);
        b = new PixelBuffer(W, H);
        baseX = Math.floor(W / 2); baseY = H - 2;
        trunk(b, baseX, baseY, 8, 4, P.wood2, P.wood1, P.wood3);
        const ramp = [P.pine0, P.pine1, P.pine2, P.pine3, shade(P.pine3, 0.25)];
        const tiers = 5;
        for (let t = 0; t < tiers; t++) {
          const ty = H - 10 - t * ((H - 14) / tiers);
          const tw = (W / 2 - 1) * (1 - t / (tiers + 0.8));
          for (let y = Math.floor(ty - (H - 14) / tiers - 3); y <= ty; y++) {
            const k = (ty - y) / ((H - 14) / tiers + 3);
            const half = tw * (1 - k) + 1;
            for (let x = Math.round(baseX - half); x <= Math.round(baseX + half); x++) {
              const rel = (x - baseX) / (half + 0.01);
              let i = rel < -0.3 ? 3 : rel < 0.3 ? 2 : 1;
              if (y > ty - 2) i = Math.max(0, i - 1);
              if (rng.chance(0.18)) i = Math.max(0, i - 1);
              b.px(x, y, ramp[i]);
            }
          }
        }
        b.px(baseX, 1, ramp[3]); b.px(baseX, 2, ramp[3]);
        break;
      }
      case 'birch': {
        const W = 28, H = 48;
        b = new PixelBuffer(W, H);
        baseX = 14; baseY = H - 2;
        for (let y = 16; y <= baseY; y++) {
          for (let x = baseX - 1; x <= baseX + 1; x++) b.px(x, y, x === baseX + 1 ? '#b8b2a0' : P.birch);
          if (rng.chance(0.25)) b.px(baseX + rng.int(-1, 1), y, P.birchDark);
        }
        const blobs: Blob[] = [];
        for (let i = 0; i < 7; i++) blobs.push({ x: 14 + rng.range(-7, 7), y: 14 + rng.range(-8, 8), r: rng.range(5, 8) });
        const cb = new PixelBuffer(W, H);
        canopy(cb, blobs, [P.leaf1, P.leaf3, P.leaf4, P.leaf5, '#9fca68', '#b8dc80'], rng);
        // sparse: punch holes
        for (let k = 0; k < 60; k++) { const x = rng.int(0, W - 1), y = rng.int(0, 30); if (rng.chance(0.5)) cb.set(x, y, 0); }
        b.blit(cb, 0, 0);
        break;
      }
      case 'dead': case 'burnt': {
        const W = 30, H = 44;
        b = new PixelBuffer(W, H);
        baseX = 15; baseY = H - 2;
        const col = kind === 'burnt' ? P.ash1 : P.wood2, colD = kind === 'burnt' ? P.ash0 : P.wood1, colL = kind === 'burnt' ? P.ash2 : P.wood3;
        trunk(b, baseX, baseY, 26, 4, col, colD, colL);
        const branch = (x: number, y: number, ang: number, len: number, depth: number) => {
          const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
          b.line(x, y, x2, y2, depth > 1 ? col : colD);
          if (depth > 1) b.line(x + 1, y, x2 + 1, y2, colD);
          if (depth > 0) {
            branch(x2, y2, ang - rng.range(0.3, 0.7), len * 0.65, depth - 1);
            branch(x2, y2, ang + rng.range(0.3, 0.7), len * 0.6, depth - 1);
          }
        };
        branch(baseX, baseY - 18, -Math.PI / 2 - 0.5, 9, 2);
        branch(baseX, baseY - 22, -Math.PI / 2 + 0.45, 10, 2);
        branch(baseX, baseY - 26, -Math.PI / 2, 8, 2);
        if (kind === 'burnt') for (let k = 0; k < 4; k++) b.px(baseX + rng.int(-2, 2), baseY - rng.int(0, 20), P.ember);
        break;
      }
      case 'willow': {
        const W = 44, H = 50;
        b = new PixelBuffer(W, H);
        baseX = 22; baseY = H - 2;
        trunk(b, baseX, baseY, 18, 5, P.wood2, P.wood1, P.wood3);
        const blobs: Blob[] = [];
        for (let i = 0; i < 9; i++) blobs.push({ x: 22 + rng.range(-12, 12), y: 16 + rng.range(-8, 6), r: rng.range(7, 10) });
        const cb = new PixelBuffer(W, H);
        canopy(cb, blobs, [P.leaf1, P.leaf2, P.leaf3, P.leaf4, P.leaf5, '#98c068'], rng);
        // drooping fronds
        for (let x = 2; x < W - 2; x += 2) {
          let top = -1;
          for (let y = 0; y < H; y++) if (cb.get(x, y)) top = y;
          if (top < 0) continue;
          const len = rng.int(6, 14);
          for (let y = top; y < Math.min(H - 3, top + len); y++) cb.px(x, y, (y - top) % 3 === 0 ? P.leaf3 : P.leaf4);
        }
        b.blit(cb, 0, 0);
        break;
      }
      default: {
        // oak, linden, apple
        const big = kind === 'oak' ? 1.15 : kind === 'apple' ? 0.75 : 1.0;
        const W = Math.round(40 * big), H = Math.round(52 * big);
        b = new PixelBuffer(W, H);
        baseX = Math.floor(W / 2); baseY = H - 2;
        const trunkH = Math.round(16 * big);
        trunk(b, baseX, baseY, trunkH, kind === 'oak' ? 6 : 5, P.wood2, P.wood1, P.wood3);
        // roots
        b.px(baseX - 4, baseY, P.wood1); b.px(baseX + 4, baseY, P.wood1);
        const blobs: Blob[] = [];
        const cx = W / 2, cy = H * 0.38;
        const n = kind === 'apple' ? 6 : 9;
        for (let i = 0; i < n; i++) {
          const a = rng.range(0, Math.PI * 2);
          const d = rng.range(0, W * 0.24);
          blobs.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.8, r: rng.range(W * 0.17, W * 0.26) });
        }
        blobs.push({ x: cx, y: cy, r: W * 0.28 });
        const cb = new PixelBuffer(W, H);
        const ramp = kind === 'linden'
          ? [P.linden0, P.linden1, P.linden2, P.linden3, P.linden4, P.linden5]
          : kind === 'apple'
          ? [P.leaf1, P.leaf2, P.leaf3, P.leaf4, P.leaf5, '#98c068']
          : [P.leaf0, P.leaf1, P.leaf2, P.leaf3, P.leaf4, P.leaf5];
        canopy(cb, blobs, ramp, rng, kind === 'apple' ? '#c8302a' : undefined);
        b.blit(cb, 0, 0);
      }
    }
    b.outline(kind === 'birch' ? '#2a3a1e' : P.ink);
    return spriteFromBuffer(b, baseX, baseY);
  });
}

export function bushSprite(variant: number, berries?: string, burnt = false): Sprite {
  return cachedSprite(`bush:${variant}:${berries || ''}:${burnt}`, () => {
    const rng = new RNG(variant * 37 + 5);
    const W = 18 + rng.int(0, 4), H = 15;
    const b = new PixelBuffer(W, H);
    const blobs: Blob[] = [];
    for (let i = 0; i < 4; i++) blobs.push({ x: W / 2 + rng.range(-4, 4), y: H - 7 + rng.range(-2, 2), r: rng.range(4, 6) });
    const ramp = burnt ? [P.ash0, P.ash1, P.ash2, P.ash3, P.ash3] : [P.leaf0, P.leaf1, P.leaf2, P.leaf3, P.leaf4, P.leaf5];
    canopy(b, blobs, ramp, rng, berries);
    b.outline(P.ink);
    return spriteFromBuffer(b, Math.floor(W / 2), H - 1);
  });
}

export function rockSprite(variant: number, size: 'small' | 'big' | 'boulder' = 'small', mossy = false): Sprite {
  return cachedSprite(`rock:${variant}:${size}:${mossy}`, () => {
    const rng = new RNG(variant * 101 + size.length);
    const W = size === 'boulder' ? 28 : size === 'big' ? 18 : 10;
    const H = size === 'boulder' ? 22 : size === 'big' ? 14 : 8;
    const b = new PixelBuffer(W, H);
    const blobs: Blob[] = [];
    const n = size === 'small' ? 2 : 4;
    for (let i = 0; i < n; i++) blobs.push({ x: W / 2 + rng.range(-W * 0.2, W * 0.2), y: H * 0.55 + rng.range(-H * 0.15, H * 0.15), r: rng.range(W * 0.25, W * 0.38) });
    const ramp = [P.stone1, P.stone2, P.stone3, P.stone4, P.stone5];
    canopy(b, blobs, ramp, rng);
    if (mossy) for (let k = 0; k < W; k++) { const x = rng.int(0, W - 1), y = rng.int(0, Math.floor(H / 2)); if (b.get(x, y)) b.px(x, y, rng.chance(0.5) ? '#4d6d32' : '#3d5a2a'); }
    // crack
    if (size !== 'small') { let x = rng.int(W / 3, W / 2), y = 2; for (let k = 0; k < H / 2; k++) { if (b.get(x, y)) b.px(x, y, P.stone0); x += rng.int(-1, 1); y++; } }
    b.outline(P.ink);
    return spriteFromBuffer(b, Math.floor(W / 2), H - 1);
  });
}

export function stumpSprite(variant: number): Sprite {
  return cachedSprite(`stump:${variant}`, () => {
    const b = new PixelBuffer(14, 12);
    b.rect(3, 4, 8, 7, P.wood2);
    b.rect(3, 4, 2, 7, P.wood3);
    b.rect(9, 4, 2, 7, P.wood1);
    b.ellipse(3, 1, 8, 5, P.wood4);
    b.ellipse(5, 2, 4, 3, P.wood3);
    b.px(6, 3, P.wood2);
    b.px(2, 10, P.wood1); b.px(11, 10, P.wood1);
    b.outline(P.ink);
    return spriteFromBuffer(b, 7, 11);
  });
}

export function logSprite(): Sprite {
  return cachedSprite('log', () => {
    const b = new PixelBuffer(30, 10);
    b.rect(3, 2, 24, 7, P.wood2);
    b.rect(3, 2, 24, 2, P.wood3);
    b.rect(3, 7, 24, 2, P.wood1);
    b.ellipse(24, 1, 5, 8, P.wood4);
    b.ellipse(25, 3, 3, 4, P.wood3);
    for (let x = 5; x < 23; x += 4) b.px(x, 5, P.wood1);
    b.outline(P.ink);
    return spriteFromBuffer(b, 15, 9);
  });
}

export function reedsSprite(variant: number): Sprite {
  return cachedSprite(`reeds:${variant}`, () => {
    const rng = new RNG(variant + 3);
    const b = new PixelBuffer(14, 16);
    for (let i = 0; i < 7; i++) {
      const x = rng.int(1, 12), h = rng.int(7, 14);
      for (let y = 15; y > 15 - h; y--) b.px(x + (y < 8 && i % 2 ? 1 : 0), y, y < 15 - h + 3 ? P.thatch2 : P.leaf3);
      if (rng.chance(0.4)) { b.px(x, 15 - h, P.wood2); b.px(x, 16 - h, P.wood2); }
    }
    return spriteFromBuffer(b, 7, 15);
  });
}

export function flowerPatchSprite(variant: number, color: string): Sprite {
  return cachedSprite(`flowers:${variant}:${color}`, () => {
    const rng = new RNG(variant * 3 + 11);
    const b = new PixelBuffer(12, 10);
    for (let i = 0; i < 5; i++) {
      const x = rng.int(2, 9), y = rng.int(3, 8);
      b.px(x, y + 1, P.leaf3); b.px(x, y + 2, P.leaf2);
      b.px(x, y, color); b.px(x - 1, y, color); b.px(x + 1, y, color); b.px(x, y - 1, color);
      b.px(x, y, '#e8c040');
    }
    return spriteFromBuffer(b, 6, 9);
  });
}

/** Herb plants the player can gather; each herb has a distinct silhouette. */
export function herbSprite(kind: string, picked = false): Sprite {
  return cachedSprite(`herb:${kind}:${picked}`, () => {
    const b = new PixelBuffer(12, 12);
    const stem = P.leaf3, leaf = P.leaf4;
    if (picked) {
      b.px(5, 10, P.leaf2); b.px(6, 10, P.leaf2); b.px(5, 9, P.leaf3);
      return spriteFromBuffer(b, 6, 11);
    }
    const colors: Record<string, [string, string]> = {
      yarrow: ['#efe8d4', '#d8ccb0'], chamomile: ['#f6f2e4', '#f0c040'], nettle: [P.leaf4, P.leaf2],
      sage: ['#a8b89a', '#7e9474'], comfrey: ['#8a70b8', '#6a5098'], valerian: ['#f0d0e0', '#d0a0c0'],
      feverfew: ['#f6f2e4', '#e8c030'], belladonna: ['#3a2a4a', '#6a3a6a'], poppy: ['#d8302a', '#2a1a1a'],
      stjohnswort: ['#f0c020', '#c89010'], mint: ['#6ab04a', '#4a8a3a'], thistle: ['#b070c0', '#7a4a8a'],
      marigold: ['#f08a20', '#d06a10'], angelica: ['#e8e8c8', '#b8c890'], wormwood: ['#b8c8b0', '#8a9a88'],
      mushroom: ['#b85a3a', '#efe0c8'], cornflower: ['#4a7ad8', '#2a5ab8'], moonwort: ['#c8d8f0', '#8aa8d8'],
    };
    const [c1, c2] = colors[kind] || ['#f0f0f0', '#c0c0c0'];
    if (kind === 'mushroom') {
      b.rect(5, 7, 2, 4, c2);
      b.ellipse(2, 4, 8, 4, c1);
      b.px(4, 5, c2); b.px(7, 5, c2);
    } else if (kind === 'nettle' || kind === 'mint' || kind === 'sage' || kind === 'wormwood') {
      for (const [x, y] of [[3, 6], [8, 6], [4, 3], [7, 3], [5, 8], [6, 1]]) { b.px(x, y, c1); b.px(x + 1, y, c2); b.px(x, y + 1, c2); }
      b.vline(5, 3, 10, stem); b.vline(6, 2, 10, stem);
    } else {
      b.vline(5, 4, 10, stem); b.vline(7, 5, 10, stem); b.vline(3, 6, 10, stem);
      b.px(4, 8, leaf); b.px(6, 7, leaf); b.px(8, 8, leaf); b.px(2, 9, leaf);
      for (const [x, y] of [[5, 3], [7, 4], [3, 5]]) {
        b.px(x, y, c2); b.px(x - 1, y, c1); b.px(x + 1, y, c1); b.px(x, y - 1, c1);
        if (kind === 'yarrow' || kind === 'angelica') { b.px(x - 1, y - 1, c1); b.px(x + 1, y - 1, c1); }
      }
    }
    b.outline(P.ink);
    return spriteFromBuffer(b, 6, 11);
  });
}
