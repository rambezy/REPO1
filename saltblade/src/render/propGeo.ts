// Low-poly geometry for every vegetation and rock kind, a few variants each.
import * as THREE from 'three';
import { GeoBuilder, geoRand } from './geo';

type Maker = (b: GeoBuilder, r: () => number) => void;

const MAKERS: Record<string, Maker> = {
  shrub(b, r) {
    const n = 3 + Math.floor(r() * 3);
    const base = [0x6e6a3e, 0x7a6e44, 0x5e603a][Math.floor(r() * 3)];
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = r() * 0.45;
      b.push().translate(Math.cos(a) * d, 0.25 + r() * 0.3, Math.sin(a) * d).scale(1, 0.75, 1);
      b.ico(0.32 + r() * 0.25, 0, { color: base, jitter: 0.12, seed: 1 + i, grad: 0.35 });
      b.pop();
    }
    b.setColor(0x4a3e2e).cyl(0.03, 0.05, 0.3, 4);
  },
  deadtree(b, r) {
    b.setColor(0x6a5a48);
    const h = 3 + r() * 2.5;
    b.cyl(0.08, 0.2, h, 5);
    const branches = 3 + Math.floor(r() * 3);
    for (let i = 0; i < branches; i++) {
      const y = h * (0.45 + r() * 0.5), a = r() * 6.28, len = 0.8 + r() * 1.4;
      const ex = Math.cos(a) * len, ez = Math.sin(a) * len;
      b.limb(0, y, 0, ex, y + len * (0.4 + r() * 0.5), ez, 0.07, 0.02, 4);
      if (r() < 0.6) b.limb(ex, y + len * 0.6, ez, ex * 1.4, y + len * 1.2, ez * 1.4 + 0.3, 0.03, 0.01, 3);
    }
  },
  cactus(b, r) {
    const g = [0x5a7a3a, 0x6a8440, 0x4e6a36][Math.floor(r() * 3)];
    const h = 1.6 + r() * 1.6;
    b.setColor(g).cyl(0.2, 0.24, h, 8, { grad: 0.3 });
    b.push().translate(0, h, 0).sphere(0.2, 8, 3).pop();
    const arms = Math.floor(r() * 3);
    for (let i = 0; i < arms; i++) {
      const y = h * (0.35 + r() * 0.35), side = i % 2 ? 1 : -1, len = 0.35 + r() * 0.2, up = 0.5 + r() * 0.7;
      b.limb(0, y, 0, side * len, y, 0, 0.13, 0.13, 6);
      b.limb(side * len, y - 0.05, 0, side * len, y + up, 0, 0.13, 0.12, 6);
      b.push().translate(side * len, y + up, 0).sphere(0.12, 6, 3).pop();
    }
    if (r() < 0.4) b.push().translate(0, h + 0.15, 0).setColor(0xd8a0c0).sphere(0.08, 5, 3).pop();
  },
  grassdry(b, r) { tuft(b, r, [0xa8985e, 0xb4a26a, 0x968a58], 7, 0.55); },
  grass(b, r) { tuft(b, r, [0x6f8a42, 0x7e9848, 0x5e7a3a], 9, 0.6); },
  redgrass(b, r) { tuft(b, r, [0xa0583a, 0xb46a44, 0x8e4e36], 8, 0.75); },
  ashgrass(b, r) { tuft(b, r, [0x6a6660, 0x7a7670, 0x5a5652], 6, 0.45); },
  seagrass(b, r) { tuft(b, r, [0x7a8a6a, 0x8a9474, 0x6e7c60], 8, 0.7); },
  reeds(b, r) {
    const n = 7 + Math.floor(r() * 5);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = r() * 0.35;
      b.push().translate(Math.cos(a) * d, 0, Math.sin(a) * d).rotateY(r() * 3.14);
      const h = 1.3 + r() * 1.0;
      b.blade(0.05, h, (r() - 0.5) * 0.4, { color: [0x6a7240, 0x7a7c48][i % 2] });
      if (r() < 0.4) b.push().translate(0, h * 0.95, 0).setColor(0x5a4430).cyl(0.035, 0.035, 0.22, 4).pop();
      b.pop();
    }
  },
  flowers(b, r) {
    tuft(b, r, [0x6f8a42, 0x7e9848], 5, 0.4);
    const pc = [0xd8c050, 0xc86a8a, 0xe8e0d0, 0x9a70c8][Math.floor(r() * 4)];
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.28, d = r() * 0.3;
      b.push().translate(Math.cos(a) * d, 0.35 + r() * 0.15, Math.sin(a) * d).setColor(pc).octa(0.05).pop();
    }
  },
  tree(b, r) {
    const h = 3.2 + r() * 1.8;
    b.setColor(0x5e4a36).cyl(0.14, 0.24, h, 6);
    const crowns = 3 + Math.floor(r() * 2);
    const gc = [0x5a7a38, 0x4e6e32, 0x66843e][Math.floor(r() * 3)];
    for (let i = 0; i < crowns; i++) {
      const a = r() * 6.28, d = i === 0 ? 0 : 0.6 + r() * 0.5;
      b.push().translate(Math.cos(a) * d, h + (i === 0 ? 0.6 : r() * 0.8 - 0.2), Math.sin(a) * d).scale(1, 0.85, 1);
      b.ico(1.1 + r() * 0.6, 0, { color: gc, jitter: 0.35, seed: 3 + i, grad: 0.4 });
      b.pop();
    }
  },
  olive(b, r) {
    b.setColor(0x6a5c4a);
    const h = 1.8 + r() * 0.8;
    b.limb(0, 0, 0, 0.3, h * 0.6, 0.1, 0.22, 0.14, 5);
    b.limb(0.3, h * 0.6, 0.1, -0.1, h, 0, 0.14, 0.1, 5);
    const gc = 0x7a8660;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.28 + r(), d = 0.7 + r() * 0.4;
      b.push().translate(Math.cos(a) * d, h + r() * 0.3, Math.sin(a) * d).scale(1.2, 0.55, 1.2);
      b.ico(0.8, 0, { color: gc, jitter: 0.3, seed: 9 + i, grad: 0.35 });
      b.pop();
    }
  },
  blacktree(b, r) {
    b.setColor(0x2a2624);
    const h = 3.5 + r() * 3;
    b.limb(0, 0, 0, 0.4 - r() * 0.8, h, 0.3 - r() * 0.6, 0.26, 0.06, 5);
    for (let i = 0; i < 4; i++) {
      const y = h * (0.4 + r() * 0.5), a = r() * 6.28, len = 1 + r() * 1.5;
      b.limb(0, y, 0, Math.cos(a) * len, y + len * 0.3, Math.sin(a) * len, 0.08, 0.02, 4);
    }
  },
  swamptree(b, r) {
    const h = 5 + r() * 3;
    b.setColor(0x4a4232);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * 6.28 + r() * 0.5;
      b.limb(Math.cos(a) * 1.1, -0.2, Math.sin(a) * 1.1, 0, 1.4, 0, 0.12, 0.3, 4);
    }
    b.cyl(0.3, 0.45, h, 7);
    const gc = [0x3e4a2a, 0x46522e][Math.floor(r() * 2)];
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.28, d = 0.8 + r() * 1.6;
      b.push().translate(Math.cos(a) * d, h - 0.5 + r() * 1.2, Math.sin(a) * d).scale(1.3, 0.6, 1.3);
      b.ico(1.3, 0, { color: gc, jitter: 0.4, seed: 5 + i, grad: 0.3 });
      b.pop();
    }
    // hanging moss
    for (let i = 0; i < 6; i++) {
      const a = r() * 6.28, d = 1 + r() * 1.8;
      b.push().translate(Math.cos(a) * d, h - 2.2, Math.sin(a) * d).rotateY(r() * 3);
      b.blade(0.25, -1.4 - r(), 0, { color: 0x5a6040 });
      b.pop();
    }
  },
  stalk(b, r) {
    const h = 11 + r() * 8;
    const segs = 4;
    const col = [0x8a7a3a, 0x9a8440, 0x7a6e38][Math.floor(r() * 3)];
    let x = 0, z = 0;
    for (let i = 0; i < segs; i++) {
      const y0 = (h * i) / segs, y1 = (h * (i + 1)) / segs;
      const nx = x + (r() - 0.5) * 0.6, nz = z + (r() - 0.5) * 0.6;
      b.limb(x, y0, z, nx, y1, nz, 0.42 - i * 0.07, 0.36 - i * 0.07, 7, { color: col });
      b.push().translate(nx, y1, nz).setColor(0x6a5a2a).cyl(0.36 - i * 0.07, 0.36 - i * 0.07, 0.15, 7).pop();
      x = nx; z = nz;
    }
    // bulb crown
    b.push().translate(x, h, z).scale(1, 0.7, 1);
    b.ico(1.8 + r() * 0.8, 1, { color: [0xc89a3a, 0xb88a34, 0xd6a844][Math.floor(r() * 3)], jitter: 0.3, seed: 17, grad: 0.4 });
    b.pop();
    // hanging fronds
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * 6.28;
      b.push().translate(x + Math.cos(a) * 1.4, h - 0.8, z + Math.sin(a) * 1.4).rotateY(-a);
      b.blade(0.6, -2.2 - r() * 1.5, 0.2, { color: 0x9a7a30 });
      b.pop();
    }
  },
  fungus(b, r) {
    const col = [0xc86a3a, 0x9a6ab0, 0xd8c8a0, 0xb84a4a][Math.floor(r() * 4)];
    const n = 1 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = i ? 0.4 + r() * 0.5 : 0;
      const h = 0.5 + r() * 1.3;
      b.push().translate(Math.cos(a) * d, 0, Math.sin(a) * d);
      b.setColor(0xd8d0b8).cyl(0.07 + h * 0.04, 0.1 + h * 0.05, h, 6);
      b.push().translate(0, h, 0).scale(1, 0.45, 1);
      b.sphere(0.35 + h * 0.3, 8, 4, { color: col, grad: 0.5 });
      b.pop();
      b.pop();
    }
  },
  saltcrystal(b, r) {
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = r() * 0.5;
      b.push().translate(Math.cos(a) * d, 0, Math.sin(a) * d).rotateZ((r() - 0.5) * 0.6).rotateX((r() - 0.5) * 0.6);
      b.push().translate(0, 0.25, 0).scale(0.18, 0.5 + r() * 0.5, 0.18);
      b.octa(1, { color: [0xf0eee8, 0xe0dcd0, 0xfaf8f2][i % 3] });
      b.pop();
      b.pop();
    }
  },
  crystal(b, r) {
    const n = 3 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const a = r() * 6.28, d = r() * 0.6;
      b.push().translate(Math.cos(a) * d, 0, Math.sin(a) * d).rotateZ((r() - 0.5) * 0.9).rotateX((r() - 0.5) * 0.9);
      b.cone(0.2 + r() * 0.15, 1 + r() * 1.8, 5, { color: [0x2e4a44, 0x3a5a4e, 0x6a9a84][i % 3] });
      b.pop();
    }
  },
  bones(b, r) {
    // a giant ribcage arching out of the sand
    const n = 4 + Math.floor(r() * 4);
    const col = 0xe0d6c0;
    const len = n * 1.6;
    b.limb(-len / 2, 0.3, 0, len / 2, 0.8, 0, 0.35, 0.28, 6, { color: col });
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + (i + 0.5) * (len / n);
      const hgt = 3.5 + Math.sin((i / n) * Math.PI) * 3;
      for (const side of [-1, 1]) {
        let px = x, py = 0.4, pz = 0;
        const segs = 4;
        for (let s = 1; s <= segs; s++) {
          const t = s / segs;
          const ny = Math.sin(t * Math.PI * 0.9) * hgt, nz = side * (Math.sin(t * Math.PI * 0.55) * 3.2);
          b.limb(px, py, pz, x, ny, nz, 0.2 - s * 0.03, 0.18 - s * 0.03, 5, { color: col });
          px = x; py = ny; pz = nz;
        }
      }
    }
  },
  scrap(b, r) {
    const n = 2 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      b.push().translate((r() - 0.5) * 1.5, 0.2, (r() - 0.5) * 1.5).rotateY(r() * 3).rotateZ((r() - 0.5) * 0.8).rotateX((r() - 0.5) * 0.6);
      if (r() < 0.5) b.box(0.8 + r() * 1.2, 0.08, 0.5 + r() * 0.8, { color: [0x7a5238, 0x6a5a4e, 0x8a6a4a][i % 3] });
      else b.limb(-0.6, 0, 0, 0.6, 0, 0, 0.12, 0.12, 6, { color: 0x5a4a40 });
      b.pop();
    }
  },
  driftwood(b, r) {
    b.setColor(0x9a8e7a);
    b.limb(-1.2, 0.12, 0, 1.2, 0.18, (r() - 0.5) * 0.6, 0.16, 0.1, 5);
    if (r() < 0.6) b.limb(0.3, 0.15, 0, 0.9, 0.5, 0.6, 0.06, 0.03, 4);
  },
  boulder(b, r) {
    b.push().translate(0, 0.35, 0).scale(1, 0.7 + r() * 0.3, 0.9 + r() * 0.3);
    b.dodeca(1, { color: 0xffffff, jitter: 0.5, seed: Math.floor(r() * 1000) + 1, grad: 0.35 });
    b.pop();
    if (r() < 0.5) {
      b.push().translate(0.6, 0.15, 0.4).scale(0.5);
      b.dodeca(1, { color: 0xf0f0f0, jitter: 0.5, seed: Math.floor(r() * 1000) + 7, grad: 0.3 });
      b.pop();
    }
  },
};

function tuft(b: GeoBuilder, r: () => number, cols: number[], n: number, h: number) {
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = r() * 0.28;
    b.push().translate(Math.cos(a) * d, 0, Math.sin(a) * d).rotateY(r() * 3.14);
    b.blade(0.08 + r() * 0.05, h * (0.6 + r() * 0.7), (r() - 0.5) * 0.35, { color: cols[i % cols.length] });
    b.pop();
  }
}

const variantCache = new Map<string, THREE.BufferGeometry[]>();
/** Geometry variants for a prop kind. */
export function propVariants(kind: string): THREE.BufferGeometry[] {
  let v = variantCache.get(kind);
  if (v) return v;
  const mk = MAKERS[kind];
  const count = kind === 'boulder' ? 4 : kind.includes('grass') || kind === 'flowers' ? 2 : 3;
  v = [];
  for (let i = 0; i < count; i++) {
    const b = new GeoBuilder();
    mk(b, geoRand(1000 + i * 77 + kind.length * 13));
    v.push(b.build());
  }
  variantCache.set(kind, v);
  return v;
}
