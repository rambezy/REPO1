// The building kit: a mesh builder that tags each vertex with a surface (see
// surface.ts), and the dressing every building is put together from: framed
// doors with open leaves, windows with shutters or panes, awnings, hanging
// shop signs, and the clutter (barrels, crates, sacks, pots) that fills rooms
// and yards. Pieces are drawn in a wall's own frame: x along the wall, y up,
// z out from its outer face. Everything is kept low-poly: a town is thousands
// of these, and the surface patterns do the fine detail.
import * as THREE from 'three';
import { GeoBuilder, PrimOpts, ColorLike, linColor } from './geo';
import { SURF } from './surface';

const tm = new THREE.Matrix4();
const nmat = new THREE.Matrix3();

/** GeoBuilder that also writes a `surf` attribute (and, for shells, an interior `lamp`). */
export class KitBuilder extends GeoBuilder {
  surf = 0;
  private sf: number[] = [];
  private mstack: THREE.Matrix4[] = [];
  private depth = 0;
  /** interior light for the whole mesh: local x, y, z and radius (+1000 for a cold light) */
  lamp: [number, number, number, number] | null = null;
  S(id: number) { this.surf = id; return this; }
  // the transform stack without allocating (buildings make thousands of calls)
  push() {
    let m = this.mstack[this.depth];
    if (!m) this.mstack.push((m = new THREE.Matrix4()));
    m.copy(this.m);
    this.depth++;
    return this;
  }
  pop() { this.m.copy(this.mstack[--this.depth]); return this; }
  translate(x: number, y: number, z: number) { this.m.multiply(tm.makeTranslation(x, y, z)); return this; }
  rotateX(a: number) { this.m.multiply(tm.makeRotationX(a)); return this; }
  rotateY(a: number) { this.m.multiply(tm.makeRotationY(a)); return this; }
  rotateZ(a: number) { this.m.multiply(tm.makeRotationZ(a)); return this; }
  scale(x: number, y = x, z = x) { this.m.multiply(tm.makeScale(x, y, z)); return this; }
  /** Bakes a primitive (as GeoBuilder.add, inlined for speed). */
  add(geo: THREE.BufferGeometry, o: PrimOpts = {}) {
    const n0 = this.vertexCount;
    if (o.jitter) { super.add(geo, o); this.fill(n0); return this; }
    const p = (geo.getAttribute('position') as THREE.BufferAttribute).array, n = (geo.getAttribute('normal') as THREE.BufferAttribute).array;
    const count = p.length / 3;
    const c = o.color !== undefined ? linColor(o.color) : this.color;
    const e = this.m.elements, ne = nmat.getNormalMatrix(this.m).elements;
    const grad = o.grad ?? 0;
    let minY = 0, span = 1;
    if (grad) {
      minY = Infinity; let maxY = -Infinity;
      for (let i = 1; i < p.length; i += 3) { if (p[i] < minY) minY = p[i]; if (p[i] > maxY) maxY = p[i]; }
      span = Math.max(1e-6, maxY - minY);
    }
    const P = this.pos, N = this.nor, C = this.col, sfa = this.sf, sid = this.surf;
    for (let i = 0; i < count; i++) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      P.push(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
      const a = n[i * 3], b = n[i * 3 + 1], d = n[i * 3 + 2];
      const nx = ne[0] * a + ne[3] * b + ne[6] * d, ny = ne[1] * a + ne[4] * b + ne[7] * d, nz = ne[2] * a + ne[5] * b + ne[8] * d;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      N.push(nx / l, ny / l, nz / l);
      const gy = grad ? 1 - grad * (1 - (y - minY) / span) : 1;
      C.push(c[0] * gy, c[1] * gy, c[2] * gy);
      sfa.push(sid);
    }
    return this;
  }
  blade(w: number, h: number, lean: number, o: PrimOpts = {}) {
    const n0 = this.vertexCount;
    super.blade(w, h, lean, o);
    this.fill(n0);
    return this;
  }
  private fill(n0: number) { for (let i = n0, n = this.vertexCount; i < n; i++) this.sf.push(this.surf); }
  build(): THREE.BufferGeometry {
    const g = super.build();
    g.setAttribute('surf', new THREE.Uint16BufferAttribute(this.sf, 1));
    if (this.lamp) {
      const n = this.vertexCount, a = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) a.set(this.lamp, i * 4);
      g.setAttribute('lamp', new THREE.BufferAttribute(a, 4));
    }
    return g;
  }
}

/** Sets the surface if the builder keeps them (furniture is also drawn into plain builders for ghosts). */
export function surf<T extends GeoBuilder>(g: T, id: number): T {
  if (g instanceof KitBuilder) g.surf = id;
  return g;
}

export const dk = (c: number, k: number) => {
  const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
  return ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
};

export type DoorKind = 'plank' | 'metal' | 'cloth' | 'arch' | 'none';
export type WindowKind = 'shutter' | 'glass' | 'slit' | 'round' | 'grille' | 'none';

const IRON = 0x2e2c2a;

/** One leaf of a board door, hinged at x = 0, hanging toward +x, swung by `open` radians about the hinge. */
function plankLeaf(g: KitBuilder, w: number, h: number, open: number, col: number) {
  g.push().rotateY(open);
  g.S(SURF.plank).push().translate(w / 2, h / 2 + 0.04, 0).box(w, h, 0.06, { color: col }).pop();
  // a brace on the inside face, an iron strap on the outside
  g.push().translate(w / 2, h / 2, -0.045).rotateZ(Math.atan2(h - 0.7, w - 0.1)).box(Math.hypot(h - 0.7, w - 0.1), 0.11, 0.035, { color: dk(col, 0.82) }).pop();
  g.S(SURF.metal).push().translate(w * 0.32, h - 0.35, 0.035).box(w * 0.6, 0.06, 0.012, { color: IRON }).pop();
  g.pop();
}

/**
 * A doorway of width w in a wall frame (x along, z out of the outer face, wall
 * thickness t behind it): jambs, lintel, threshold and open leaves.
 */
export function drawDoor(g: KitBuilder, kind: DoorKind, x: number, w: number, h: number, t: number, trim: number, leafCol: number, rnd: () => number) {
  if (kind === 'none') return;
  const T = t + 0.08;
  if (kind === 'arch') {
    // a round arch of voussoirs over the opening
    g.S(SURF.stone);
    for (const sx of [-1, 1]) g.push().translate(x + sx * (w / 2 + 0.1), h * 0.42, -t / 2).box(0.2, h * 0.84, T, { color: trim }).pop();
    const R = w / 2 + 0.1, n = 5;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI;
      g.push().translate(x + Math.cos(a) * R, h * 0.84 + Math.sin(a) * R * 0.55, -t / 2).rotateZ(a - Math.PI / 2).box(0.24, 0.3, T, { color: dk(trim, 0.92 + 0.1 * (i % 2)) }).pop();
    }
  } else {
    g.S(kind === 'metal' ? SURF.metal : SURF.plank);
    for (const sx of [-1, 1]) g.push().translate(x + sx * (w / 2 + 0.06), h / 2, -t / 2).box(0.12, h + 0.02, T, { color: trim }).pop();
    g.push().translate(x, h + 0.1, -t / 2).box(w + 0.42, 0.2, T + 0.04, { color: dk(trim, 0.92) }).pop();
  }
  g.S(SURF.stone).push().translate(x, 0.03, 0.12).box(w + 0.3, 0.1, 0.4, { color: 0x8a8274 }).pop();
  if (kind === 'cloth') {
    // a hide or canvas flap tied back to one side
    g.S(SURF.cloth).push().translate(x - w / 2 + 0.12, h / 2, 0.06).rotateZ(-0.04).box(0.4, h - 0.1, 0.05, { color: leafCol }).pop();
    g.push().translate(x - w / 2 + 0.12, h * 0.55, 0.1).box(0.46, 0.06, 0.04, { color: dk(leafCol, 0.6) }).pop();
    return;
  }
  if (kind === 'metal') {
    // a sliding plate pushed aside along the wall, on a rail
    g.S(SURF.metal).push().translate(x - w * 0.95, h / 2, 0.06).box(w, h, 0.05, { color: leafCol }).pop();
    g.push().translate(x - w * 0.45, h + 0.05, 0.08).box(w * 2, 0.08, 0.05, { color: IRON }).pop();
    return;
  }
  // board leaves swung back against the outer wall (hinged at the jambs, open past square)
  const leaves = w > 1.4 ? 2 : 1;
  const lw = w / leaves - 0.02, lh = Math.min(h - 0.08, 2.3);
  g.push().translate(x - w / 2, 0, 0.04);
  plankLeaf(g, lw, lh, -(2.65 + rnd() * 0.3), leafCol);
  g.pop();
  if (leaves === 2) {
    g.push().translate(x + w / 2, 0, 0.04).rotateY(Math.PI);
    plankLeaf(g, lw, lh, 2.5 + rnd() * 0.45, leafCol);
    g.pop();
  }
}

/** A window centred at (x, y) in a wall frame; returns the glass rectangle (for a night glow). */
export function drawWindow(g: KitBuilder, kind: WindowKind, x: number, y: number, trim: number, shutterCol: number, rnd: () => number, box = false): [number, number, number, number] | null {
  if (kind === 'none') return null;
  const dark = 0x15120f;
  if (kind === 'slit') {
    g.S(SURF.glass).push().translate(x, y - 0.45, 0.012).quad(0.2, 0.9, { color: dark }).pop();
    g.S(SURF.stone).push().translate(x, y + 0.52, 0.02).box(0.5, 0.14, 0.06, { color: trim }).pop();
    g.push().translate(x, y - 0.5, 0.03).box(0.42, 0.08, 0.1, { color: trim }).pop();
    return [x, y, 0.14, 0.8];
  }
  if (kind === 'round') {
    g.S(SURF.glass).push().translate(x, y, 0.012).rotateX(Math.PI / 2).cyl(0.36, 0.36, 0.02, 10, { color: dark }).pop();
    g.S(SURF.stone);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.push().translate(x + Math.cos(a) * 0.42, y + Math.sin(a) * 0.42, 0.03).rotateZ(a + Math.PI / 2).box(0.34, 0.12, 0.08, { color: trim }).pop(); }
    g.S(SURF.metal);
    for (const a of [0, Math.PI / 2]) g.push().translate(x, y, 0.035).rotateZ(a).box(0.72, 0.03, 0.02, { color: IRON }).pop();
    return [x, y, 0.5, 0.5];
  }
  const W = 0.82, H = 0.74;
  // a frame proud of the wall with the pane set in it, and a sill
  g.S(kind === 'grille' ? SURF.metal : SURF.plank);
  g.push().translate(x, y + 0.02, 0.02).box(W + 0.2, H + 0.2, 0.04, { color: trim }).pop();
  g.push().translate(x, y - H / 2 - 0.08, 0.07).box(W + 0.3, 0.07, 0.14, { color: trim }).pop();
  g.S(SURF.glass).push().translate(x, y - H / 2, 0.042).quad(W, H, { color: kind === 'glass' ? 0x24303a : dark }).pop();
  if (kind === 'glass' || kind === 'grille') {
    const bar = kind === 'grille' ? IRON : trim;
    const n = kind === 'grille' ? 3 : 1;
    g.S(kind === 'grille' ? SURF.metal : SURF.plank);
    for (let i = 1; i <= n; i++) g.push().translate(x - W / 2 + (i * W) / (n + 1), y, 0.05).box(0.03, H, 0.02, { color: bar }).pop();
    g.push().translate(x, y, 0.05).box(W, 0.03, 0.02, { color: bar }).pop();
  }
  if (kind === 'shutter') {
    // louvred leaves folded back against the wall
    g.S(SURF.siding);
    for (const sx of [-1, 1]) {
      const a = 0.15 + rnd() * 0.5;
      g.push().translate(x + sx * (W / 2 + 0.1), y, 0.05).rotateY(-sx * a).translate(sx * 0.22, 0, 0.02).box(0.42, H + 0.04, 0.035, { color: shutterCol }).pop();
    }
  }
  if (box) {
    // a planter under the sill
    g.S(SURF.plank).push().translate(x, y - H / 2 - 0.2, 0.16).box(W + 0.1, 0.2, 0.24, { color: 0x5a4430 }).pop();
    g.S(SURF.leaf);
    for (let i = 0; i < 2; i++) g.push().translate(x + (i - 0.5) * 0.4, y - H / 2 - 0.06, 0.16).scale(1.5, 0.7, 1).ico(0.13, 0, { color: [0x4e6e32, 0xa8483a][i] }).pop();
  }
  return [x, y, W - 0.1, H - 0.1];
}

/** A sloped canopy over a doorway, on two iron brackets: striped cloth, boards or sheet. */
export function drawAwning(g: KitBuilder, x: number, w: number, y: number, depth: number, kind: 'cloth' | 'plank' | 'corrugated', col: number) {
  const drop = 0.38;
  const ang = Math.atan2(drop, depth), len = Math.hypot(depth, drop);
  g.S(kind === 'cloth' ? SURF.awning : kind === 'plank' ? SURF.plank : SURF.corrugated);
  g.push().translate(x, y - drop / 2, depth / 2).rotateX(ang).box(w, 0.04, len, { color: col }).pop();
  // the valance, or a fascia board
  g.S(kind === 'cloth' ? SURF.awning : SURF.plank).push().translate(x, y - drop - 0.12, depth + 0.01).box(w, 0.24, 0.02, { color: kind === 'cloth' ? col : dk(col, 0.8) }).pop();
  g.S(SURF.metal);
  for (const sx of [-1, 1]) {
    const bx = x + sx * (w / 2 - 0.1);
    g.push().translate(bx, y - drop - 0.45, depth * 0.45).rotateX(-0.85).box(0.05, 0.05, depth * 1.05, { color: IRON }).pop();
  }
}

/** Little emblems for shop signs, centred on the board's face (z out of it). */
export function drawEmblem(g: GeoBuilder, shop: string, s = 1) {
  const gold = 0xc8a040, white = 0xe0d8c8, steel = 0xb0b0b4, red = 0x9a2a22;
  g.push().scale(s);
  surf(g, SURF.plain);
  switch (shop) {
    case 'bar':
    case 'mercs':
      // a tankard with a head of foam
      g.push().translate(-0.05, -0.16, 0.05).cyl(0.12, 0.11, 0.3, 7, { color: gold }).pop();
      g.push().translate(0.13, -0.02, 0.05).box(0.05, 0.2, 0.04, { color: gold }).pop();
      g.push().translate(-0.05, 0.16, 0.05).scale(1, 0.4, 1).ico(0.13, 0, { color: white }).pop();
      break;
    case 'weapons':
      for (const a of [-0.75, 0.75]) {
        g.push().translate(0, 0, 0.04).rotateZ(a);
        g.push().translate(0, 0.08, 0).box(0.05, 0.42, 0.02, { color: steel }).pop();
        g.push().translate(0, -0.15, 0).box(0.16, 0.03, 0.03, { color: gold }).pop();
        g.push().translate(0, -0.21, 0).box(0.03, 0.1, 0.03, { color: 0x4a3426 }).pop();
        g.pop();
      }
      break;
    case 'armour':
      g.push().translate(0, 0, 0.03).rotateX(Math.PI / 2).cyl(0.2, 0.2, 0.03, 8, { color: steel }).pop();
      g.push().translate(0, 0, 0.06).box(0.08, 0.08, 0.04, { color: gold }).pop();
      break;
    case 'clinic':
      g.push().translate(0, 0, 0.03).box(0.12, 0.4, 0.03, { color: red }).pop();
      g.push().translate(0, 0, 0.03).box(0.4, 0.12, 0.03, { color: red }).pop();
      break;
    case 'robotics':
    case 'tech':
      g.push().translate(0, 0, 0.03).rotateX(Math.PI / 2).cyl(0.14, 0.14, 0.04, 8, { color: steel }).pop();
      for (let i = 0; i < 6; i++) g.push().translate(0, 0, 0.03).rotateZ((i / 6) * Math.PI * 2).translate(0, 0.16, 0).box(0.07, 0.07, 0.04, { color: steel }).pop();
      break;
    case 'slaves':
      for (let i = 0; i < 3; i++) g.push().translate(-0.16 + i * 0.16, 0, 0.04).rotateZ(i % 2 ? 0 : Math.PI / 2).box(0.16, 0.06, 0.04, { color: 0x5a5a5e }).pop();
      break;
    case 'drugs':
      surf(g, SURF.grass);
      for (let k = 0; k < 5; k++) g.push().translate(0, -0.18, 0.04).rotateZ((k - 2) * 0.42).blade(0.1, 0.4, 0, { color: 0x4e7a34 }).pop();
      break;
    case 'construction':
      g.push().translate(0, -0.04, 0.04).rotateZ(0.6).box(0.05, 0.4, 0.03, { color: 0x6a4a2a }).pop();
      g.push().translate(0.1, 0.12, 0.05).rotateZ(0.6).box(0.24, 0.09, 0.06, { color: steel }).pop();
      break;
    case 'animals':
      for (let i = 0; i < 5; i++) { const a = Math.PI * (0.15 + i * 0.175) * 2 - Math.PI * 0.3; g.push().translate(Math.cos(a) * 0.13, Math.sin(a) * 0.13, 0.04).rotateZ(a + Math.PI / 2).box(0.09, 0.05, 0.04, { color: steel }).pop(); }
      break;
    case 'thrum':
      g.push().translate(0, 0, 0.04).rotateX(Math.PI / 2).cyl(0.18, 0.18, 0.04, 6, { color: gold }).pop();
      break;
    case 'temple':
      g.push().translate(0, -0.16, 0.05).cone(0.13, 0.42, 6, { color: 0xe08a30 }).pop();
      break;
    default:
      // goods: a laden sack
      g.push().translate(0, -0.04, 0.05).scale(1, 1.2, 0.6).ico(0.18, 0, { color: 0xc8b088 }).pop();
      g.push().translate(0, 0.17, 0.05).box(0.08, 0.08, 0.06, { color: 0x8a6a44 }).pop();
  }
  g.pop();
}

/** A sign board hanging from an iron arm that sticks out of the wall, with the shop's emblem on both faces. */
export function drawHangingSign(g: GeoBuilder, x: number, y: number, shop: string, board: number) {
  surf(g, SURF.metal);
  g.push().translate(x, y, 0.55).box(0.05, 0.05, 1.1, { color: IRON }).pop();
  g.push().translate(x, y - 0.32, 0.25).rotateX(0.95).box(0.04, 0.04, 0.78, { color: IRON }).pop();
  for (const z of [0.5, 1.0]) g.push().translate(x, y - 0.12, z).box(0.015, 0.22, 0.015, { color: IRON }).pop();
  surf(g, SURF.plank).push().translate(x, y - 0.55, 0.75).box(0.06, 0.6, 0.83, { color: board }).pop();
  for (const side of [-1, 1]) {
    g.push().translate(x + side * 0.035, y - 0.55, 0.75).rotateY(side * Math.PI / 2);
    drawEmblem(g, shop, 0.9);
    g.pop();
  }
}

/** Dressing pieces for rooms and yards, drawn standing at the current origin. */
export const clutter = {
  barrel(g: GeoBuilder, col = 0x7a5a38) {
    surf(g, SURF.plank).cyl(0.35, 0.32, 0.95, 7, { color: col, grad: 0.25 });
    surf(g, SURF.metal);
    for (const y of [0.14, 0.78]) g.push().translate(0, y, 0).cyl(0.37, 0.37, 0.06, 7, { color: IRON }).pop();
  },
  crate(g: GeoBuilder, s = 0.8, col = 0x8a6a44) {
    surf(g, SURF.siding).push().block(s, s * 0.85, s, { color: col }).pop();
    surf(g, SURF.plank);
    g.push().translate(0, s * 0.425, s / 2 + 0.005).rotateZ(Math.atan2(s * 0.75, s * 0.85)).box(Math.hypot(s * 0.75, s * 0.85), 0.07, 0.02, { color: dk(col, 0.8) }).pop();
    g.push().translate(0, s * 0.425, 0).box(s + 0.03, 0.08, s + 0.03, { color: dk(col, 0.82) }).pop();
  },
  sack(g: GeoBuilder, col = 0xb8a07a) {
    surf(g, SURF.cloth).push().translate(0, 0.3, 0).scale(0.95, 1.2, 0.8).ico(0.28, 0, { color: col }).pop();
    g.push().translate(0, 0.62, 0).box(0.12, 0.1, 0.1, { color: dk(col, 0.8) }).pop();
  },
  pot(g: GeoBuilder, col = 0xa0603a) {
    surf(g, SURF.plaster).push().translate(0, 0.24, 0).scale(1, 1.1, 1).ico(0.23, 0, { color: col }).pop();
    g.push().translate(0, 0.44, 0).cyl(0.1, 0.13, 0.1, 6, { color: dk(col, 0.9) }).pop();
  },
  firewood(g: GeoBuilder) {
    surf(g, SURF.bark);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 3 - r; i++) g.push().translate(-0.24 + i * 0.24 + r * 0.12, 0.1 + r * 0.19, 0).rotateX(Math.PI / 2).cyl(0.1, 0.1, 1.1, 5, { color: [0x6a5038, 0x5a4430, 0x7a5a3e][(i + r) % 3] }).pop();
  },
  trough(g: GeoBuilder) {
    surf(g, SURF.plank).push().block(1.6, 0.5, 0.6, { color: 0x6a5038 }).pop();
    surf(g, SURF.glass).push().translate(0, 0.46, 0).box(1.45, 0.02, 0.45, { color: 0x2a3a3a }).pop();
  },
  bottles(g: GeoBuilder, n: number, rnd: () => number) {
    surf(g, SURF.glass);
    for (let i = 0; i < n; i++) {
      const c = [0x3a5a2a, 0x5a3a1a, 0x2a3a4a, 0x6a5a3a][Math.floor(rnd() * 4)];
      g.push().translate((i - (n - 1) / 2) * 0.12, 0, (rnd() - 0.5) * 0.08);
      g.cyl(0.045, 0.05, 0.2, 5, { color: c });
      g.push().translate(0, 0.24, 0).box(0.03, 0.08, 0.03, { color: c }).pop();
      g.pop();
    }
  },
  /** goods along a shelf board: tins, boxes and bottles of a few sizes */
  goods(g: GeoBuilder, len: number, rnd: () => number) {
    let x = -len / 2 + 0.1;
    while (x < len / 2 - 0.15) {
      const r = rnd();
      const w = 0.12 + rnd() * 0.16, h = 0.12 + rnd() * 0.18;
      const c = r < 0.35 ? [0x3a5a2a, 0x5a3a1a, 0x2a3a4a][Math.floor(rnd() * 3)] : [0x8a6a44, 0xb0805a, 0x9a8a6a, 0x8a3a2a, 0x3a5a6a, 0xa89068][Math.floor(rnd() * 6)];
      surf(g, r < 0.35 ? SURF.glass : r < 0.7 ? SURF.siding : SURF.cloth);
      g.push().translate(x + w / 2, 0, 0).block(w, r < 0.35 ? h + 0.08 : h, 0.2, { color: c }).pop();
      x += w + 0.03 + rnd() * 0.08;
    }
  },
  /**
   * A lantern on a wall bracket (its body 0.25 out from the wall) or hanging on a
   * chain; the flame goes in the glow builder at (gx, gy, gz), which should be
   * this origin plus (0, -0.13, 0.25), or (0, -0.13, 0) when hanging.
   */
  lantern(g: GeoBuilder, glow: GeoBuilder | null, gx: number, gy: number, gz: number, col: ColorLike = [3.2, 2.0, 0.85], hanging = false) {
    surf(g, SURF.metal);
    const oz = hanging ? 0 : 0.25;
    if (hanging) g.push().translate(0, 0.33, 0).box(0.015, 0.6, 0.015, { color: IRON }).pop();
    else g.push().translate(0, 0.12, 0.12).box(0.03, 0.03, 0.28, { color: IRON }).pop();
    g.push().translate(0, 0.02, oz).cone(0.1, 0.1, 4, { color: IRON }).pop();
    g.push().translate(0, -0.29, oz).box(0.17, 0.04, 0.17, { color: IRON }).pop();
    for (const [dx, dz] of [[-0.075, -0.075], [0.075, 0.075]]) g.push().translate(dx, -0.14, oz + dz).box(0.015, 0.28, 0.015, { color: IRON }).pop();
    if (glow) glow.push().translate(gx, gy, gz).box(0.13, 0.22, 0.13, { color: col }).pop();
  },
};
