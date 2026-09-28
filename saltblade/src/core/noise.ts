// 2D simplex noise with seeded permutation, plus fBm / ridged helpers.

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1, 0.7, 0.7, -0.7, 0.7, 0.7, -0.7, -0.7, -0.7]);

export class Noise2 {
  private perm = new Uint8Array(512);
  private permG = new Uint8Array(512);
  constructor(seed: number) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let s = seed >>> 0 || 1;
    for (let i = 255; i > 0; i--) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const j = s % (i + 1);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permG[i] = (this.perm[i] % 12) * 2;
    }
  }
  /** Simplex noise in roughly [-1, 1]. */
  n(xin: number, yin: number): number {
    const perm = this.perm, pg = this.permG;
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n0 = 0, n1 = 0, n2 = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = pg[ii + perm[jj]];
      t0 *= t0;
      n0 = t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = pg[ii + i1 + perm[jj + j1]];
      t1 *= t1;
      n1 = t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = pg[ii + 1 + perm[jj + 1]];
      t2 *= t2;
      n2 = t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }
  /** Fractal sum, normalised to roughly [-1, 1]. */
  fbm(x: number, y: number, oct = 5, lac = 2.03, gain = 0.5): number {
    let a = 1, f = 1, sum = 0, norm = 0;
    for (let o = 0; o < oct; o++) {
      sum += a * this.n(x * f + o * 17.3, y * f - o * 9.1);
      norm += a;
      a *= gain;
      f *= lac;
    }
    return sum / norm;
  }
  /** Ridged multifractal in [0, 1]: sharp crests. */
  ridged(x: number, y: number, oct = 5, lac = 2.1, gain = 0.5): number {
    let a = 1, f = 1, sum = 0, norm = 0, w = 1;
    for (let o = 0; o < oct; o++) {
      let v = 1 - Math.abs(this.n(x * f + o * 31.7, y * f + o * 12.9));
      v *= v;
      v *= w;
      w = Math.min(1, Math.max(0, v * 1.6));
      sum += a * v;
      norm += a;
      a *= gain;
      f *= lac;
    }
    return sum / norm;
  }
}
