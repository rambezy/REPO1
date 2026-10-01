// Smithing at the forge: keep the iron at "dawn colour" with the bellows,
// strike when the hammer mark sits on the target, then quench.
// The smithy is painted at the canvas's full display resolution: the hearth
// and its glow, the anvil with the work on it, an iron-and-brass heat gauge
// and a timing rail inlaid along the anvil's face.

import './minigames.css';
import { openScreen, el, button } from '../ui';
import { input } from '../../engine/input';
import { sfx } from '../../audio/sfx';
import { hasPerk, skill, addXp } from '../../systems/stats';
import { rand, clamp, lerp, RNG } from '../../engine/util';
import { G } from '../../G';
import { newCanvas, lit, dim, mix, rgba, ellipse, circle, roundRect, poly, line, lin, rad, grain, blobPath, type Ctx } from '../../gfx/paint';

export interface ForgeOpts { title: string; strikes: number; help?: string; shape?: 'horseshoe' | 'blade' | 'knife' | 'sword'; easy?: boolean }

export function forge(opts: ForgeOpts): Promise<number> {
  return new Promise((resolve) => {
    const W = 360, H = 200;
    let temp = 0.35;
    let progress = 0;
    let quality = 100;
    let marker = 0; // 0..1 across the piece
    let dirm = 1;
    let target = rand.range(0.2, 0.8);
    let phase: 'work' | 'quench' | 'done' = 'work';
    let flash = 0;
    let hammerT = 0;
    let msg = 'Pump the bellows until the iron glows like dawn.';
    let done = false;
    const zoneW = (opts.easy ? 0.2 : 0.13) + skill('smithing') * 0.008 + (hasPerk('fathers_hands') ? 0.03 : 0);
    const speed = 0.9 + opts.strikes * 0.02;
    openScreen('forge', (close) => {
      const m = el('div', { cls: 'vellum mg mg-forge' });
      m.append(el('h2', { html: opts.title }));
      m.append(el('p', { cls: 'help', html: opts.help || 'Bellows heat the iron; it cools as you work. Strike only when it glows orange-gold, and only when the hammer mark is over the bright target. When the work is shaped, quench it while it is hot.' }));
      const c = document.createElement('canvas');
      c.className = 'mg-scene';
      c.width = W; c.height = H;
      c.style.maxWidth = '720px';
      c.style.alignSelf = 'center';
      c.style.aspectRatio = `${W} / ${H}`;
      m.append(c);
      const info = el('p', { cls: 'meta mg-caption' });
      m.append(info);
      const row = el('div', { cls: 'row' });
      row.style.display = 'flex'; row.style.gap = '8px'; row.style.justifyContent = 'flex-end'; row.style.flexWrap = 'wrap';
      const bellowsBtn = button('Bellows (B / hold)', () => pump());
      const strikeBtn = button('Strike (Space / E)', () => strike(), 'btn primary');
      const quenchBtn = button('Quench (Q)', () => quench());
      row.append(bellowsBtn, strikeBtn, quenchBtn, button('Leave it', () => finish(0)));
      m.append(row);
      c.addEventListener('mousedown', () => strike());
      const scene = new Smithy(c, W, H, opts.shape, opts.strikes);
      const pump = () => { if (phase === 'done') return; temp = Math.min(1.05, temp + 0.12); sfx('bellows'); };
      const strike = () => {
        if (phase !== 'work' || hammerT > 0) return;
        hammerT = 0.18;
        sfx('hammer');
        scene.strike(marker, temp, progress / opts.strikes);
        const inZone = Math.abs(marker - target) < zoneW / 2;
        if (temp < 0.55) { quality -= 7; msg = 'The iron is too cold: the hammer rings off it. Heat it up.'; flash = 0.3; return; }
        if (temp > 0.92) { quality -= 6; msg = 'Too hot, it\'s burning! The steel sparks white.'; }
        if (!inZone) { quality -= 5; msg = 'A glancing blow. Watch the mark.'; progress += 0.4; }
        else { progress += 1; msg = rand.pick(['Good!', 'Clean strike.', 'That\'s it. Again.', 'The iron sings.']); }
        temp -= 0.05;
        target = rand.range(0.15, 0.85);
        addXp('smithing', 1);
        addXp('strength', 0.5);
        if (progress >= opts.strikes) { phase = 'quench'; msg = 'Shaped. Now quench it, while it is still hot.'; }
      };
      const quench = () => {
        if (phase !== 'quench') return;
        sfx('quench');
        if (temp < 0.5) { quality -= 15; msg = 'Too cold: the temper will be soft.'; }
        else if (temp > 0.95) { quality -= 10; msg = 'Too hot: a hairline crack.'; }
        else msg = 'A good quench.';
        phase = 'done';
        addXp('smithing', 6);
        setTimeout(() => finish(Math.max(10, quality)), 900);
      };
      const finish = (q: number) => {
        if (done) return;
        done = true;
        close();
        resolve(q);
      };
      let last = performance.now();
      const frame = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (input.pressed('confirm') || input.pressed('interact') || input.pressed('attack')) strike();
        if (input.pressed('journal') || input.down('journal')) pump();
        if (input.pressed('dog')) quench();
        temp = Math.max(0, temp - dt * 0.07);
        if (phase === 'work') {
          marker += dirm * dt * speed;
          if (marker > 1) { marker = 1; dirm = -1; }
          if (marker < 0) { marker = 0; dirm = 1; }
        }
        if (hammerT > 0) hammerT -= dt;
        if (flash > 0) flash -= dt;
        if (c.isConnected) scene.draw({ temp, progress, marker, target, zoneW, phase, hammerT, flash }, dt);
        info.innerHTML = `${msg} &nbsp; <b>Quality ${Math.max(0, Math.round(quality))}</b>`;
        if (!done && G.mode === 'menu') requestAnimationFrame(frame);
        else if (!done) finish(0);
      };
      requestAnimationFrame(frame);
      return m;
    });
  });
}

// ================================================================ the smithy

type Shape = ForgeOpts['shape'];
interface ForgeView { temp: number; progress: number; marker: number; target: number; zoneW: number; phase: 'work' | 'quench' | 'done'; hammerT: number; flash: number }
interface Spark { x: number; y: number; vx: number; vy: number; l: number; l0: number; heat: number; w: number; flake?: boolean }
interface Puff { x: number; y: number; vx: number; vy: number; l: number; l0: number; r: number }

const TAU = Math.PI * 2;
const FLOOR = 150;            // where the back wall meets the floor
const FACE = 117;             // top of the anvil's face
const AX0 = 84, AX1 = 286;    // the anvil face's extent
const R0 = 90, R1 = 270;      // the hammer mark's travel (marker 0..1)
const RAIL_Y = 120, RAIL_H = 6;
const FIRE_X = 312, FIRE_Y = 97;
const TUBE_X = 13, TUBE_W = 8, TUBE_TOP = 26, TUBE_BOT = 162; // heat gauge tube (logical units)

const IRON = ['#121315', '#1d1f23', '#2b2e33', '#3e4248', '#585d64', '#7d838b', '#b4bac1'];
const BRASS = ['#3a2a0e', '#6a4c18', '#9c7428', '#c49a40', '#e2c26c', '#f6e6ae'];

/** Colour of iron at a heat of 0..1.05: grey steel, dull red, cherry, orange, gold, white. */
const HEAT: [number, string][] = [
  [0, '#3e3a38'], [0.25, '#4a3530'], [0.35, '#6a2c20'], [0.45, '#9a321c'], [0.55, '#cc4a1e'], [0.62, '#e8661f'],
  [0.72, '#f7862a'], [0.82, '#ffb040'], [0.9, '#ffcc58'], [0.96, '#ffeeb8'], [1.02, '#fffaf0'],
];
function heatCol(t: number): string {
  if (t <= HEAT[0][0]) return HEAT[0][1];
  for (let i = 1; i < HEAT.length; i++) {
    if (t <= HEAT[i][0]) {
      const [a, ca] = HEAT[i - 1], [b, cb] = HEAT[i];
      return mix(ca, cb, (t - a) / (b - a));
    }
  }
  return HEAT[HEAT.length - 1][1];
}
const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const railX = (u: number) => R0 + u * (R1 - R0);

/** Matches the canvas's backing store to its displayed size x devicePixelRatio (capped at 2); returns device pixels per logical unit. */
function fitCanvas(c: HTMLCanvasElement, W: number, H: number): number {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bw = Math.max(1, Math.round((c.clientWidth || W) * dpr));
  const bh = Math.max(1, Math.round((bw * H) / W));
  if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
  return bw / W;
}

// ---------------------------------------------------------------- the work piece

interface Work {
  /** builds the outline path */
  path(g: Ctx): void;
  /** top surface (where the hammer lands) at x, or null when x is off the piece */
  top(x: number): number | null;
  x0: number; x1: number; y0: number; y1: number;
}

/** The piece as it looks after `f` (0..1) of the shaping is done. */
function workShape(shape: Shape, f: number): Work {
  if (shape === 'horseshoe') {
    // a bar that bends into an arch, standing on its heels
    const L = 112, R = 38;
    const k = Math.max(0.0001, f / R), th = lerp(7.6, 7, f);
    const half = L / 2, tMax = half * k;
    const base = FACE - 0.2;
    const yTop = base - (1 - Math.cos(tMax)) / k - th / 2;
    const at = (s: number, off: number): [number, number] => {
      const a = s * k;
      const x = 180 + Math.sin(a) / k, y = yTop + (1 - Math.cos(a)) / k;
      return [x - Math.sin(a) * off, y - Math.cos(a) * off];
    };
    const n = 28;
    return {
      path(g) {
        g.beginPath();
        for (let i = 0; i <= n; i++) { const [x, y] = at(-half + (L * i) / n, th / 2); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
        for (let i = n; i >= 0; i--) { const [x, y] = at(-half + (L * i) / n, -th / 2); g.lineTo(x, y); }
        g.closePath();
      },
      top(x) {
        const d = (x - 180) * k;
        if (Math.abs(d) >= Math.sin(Math.min(tMax, Math.PI / 2)) * 0.999) return null;
        const a = Math.asin(d);
        if (Math.abs(a) > tMax) return null;
        return yTop + (1 - Math.cos(a)) / k - th / 2;
      },
      x0: 180 - Math.sin(Math.min(tMax, Math.PI / 2)) / k - th, x1: 180 + Math.sin(Math.min(tMax, Math.PI / 2)) / k + th, y0: yTop - th, y1: base,
    };
  }
  // straight pieces: a rough billet drawn out into a blade (or left a bar)
  const p = shape === 'sword' ? { x0: 72, x1: 288, h0: 9, h1: 6.2, tip: 17, tang: 20 }
    : shape === 'knife' ? { x0: 104, x1: 250, h0: 9, h1: 7.4, tip: 14, tang: 16 }
      : shape === 'blade' ? { x0: 94, x1: 266, h0: 9.5, h1: 9, tip: 10, tang: 12 }
        : { x0: 88, x1: 272, h0: 8, h1: 7, tip: 0, tang: 0 };
  const h = lerp(p.h0, p.h1, f);
  const x0 = lerp(Math.max(p.x0, 86), p.x0, f), x1 = lerp(Math.min(p.x1, 276), p.x1, f);
  const tip = p.tip * f, tang = p.tang * f;
  const yb = FACE - 0.2, yt = yb - h;
  const bx = x0 + tang; // shoulder where the tang meets the blade
  return {
    path(g) {
      g.beginPath();
      if (tang > 0.5) {
        const th = h * 0.42;
        g.moveTo(x0, yb - h * 0.2);
        g.lineTo(x0, yb - h * 0.2 - th);
        g.lineTo(bx - 2, yb - h * 0.2 - th);
        g.quadraticCurveTo(bx, yt - 0.3, bx + 3, yt);
      } else {
        g.moveTo(x0 + 1.2, yb);
        g.quadraticCurveTo(x0 - 0.6, (yt + yb) / 2, x0 + 1.2, yt);
      }
      if (shape === 'knife') {
        // straight spine, the edge sweeping up to the point
        g.lineTo(x1 - tip * 0.6, yt);
        g.quadraticCurveTo(x1 - tip * 0.1, yt + h * 0.15, x1, yt + h * (0.25 + 0.2 * (1 - f)));
        g.quadraticCurveTo(x1 - tip * 0.5, yb, x1 - tip * 1.6, yb);
      } else if (tip > 0.5) {
        g.lineTo(x1 - tip, yt + h * 0.06);
        g.lineTo(x1, yt + h * 0.5);
        g.lineTo(x1 - tip, yb - h * 0.06);
      } else {
        g.lineTo(x1 - 1.2, yt);
        g.quadraticCurveTo(x1 + 0.6, (yt + yb) / 2, x1 - 1.2, yb);
      }
      if (tang > 0.5) { g.lineTo(bx + 3, yb); g.quadraticCurveTo(bx, yb - 0.2, bx - 2, yb - h * 0.2); g.lineTo(x0, yb - h * 0.2); }
      g.closePath();
    },
    top(x) {
      if (x < x0 || x > x1) return null;
      if (x < bx) return yb - h * 0.2 - h * 0.42;
      if (tip > 0.5 && x > x1 - tip) return yt + h * 0.5 * ((x - (x1 - tip)) / tip);
      return yt;
    },
    x0, x1, y0: yt, y1: yb,
  };
}

// ---------------------------------------------------------------- the scene

class Smithy {
  private g: Ctx;
  private bg: HTMLCanvasElement | null = null;
  private k = 0;
  private sparks: Spark[] = [];
  private embers: Spark[] = [];
  private steam: Puff[] = [];
  private flashes: { x: number; y: number; l: number; cold: boolean }[] = [];
  private t = 0;
  private shake = 0;
  private flare = 0;
  private lastTemp = -1;
  private lastMarker = 0;
  private strikeX = 0;
  private quenchT = -1;
  private scale: [number, number, number][] = [];
  private coals: { x: number; y: number; r: number; seed: number; heat: number; ph: number; sp: number }[] = [];
  private lastWork: Work | null = null;

  constructor(private c: HTMLCanvasElement, private W: number, private H: number, private shape: Shape, private strikes: number) {
    this.g = c.getContext('2d')!;
    const rng = new RNG(31);
    for (let i = 0; i < 46; i++) this.scale.push([rng.next(), rng.next(), 0.3 + rng.next() * 0.8]);
    for (let i = 0; i < 34; i++) {
      const u = rng.next() * 2 - 1;
      const x = FIRE_X + u * 25, y = FIRE_Y + 2.5 - (1 - u * u) * 3.2 + rng.next() * 2.4;
      this.coals.push({ x, y, r: 1.6 + rng.next() * 2.4, seed: 100 + i, heat: (1 - Math.abs(u)) * 0.9 + rng.next() * 0.35, ph: rng.next() * TAU, sp: 1.5 + rng.next() * 3 });
    }
    this.coals.sort((a, b) => a.y - b.y);
  }

  /** Sparks and glowing scale fly from the blow; how many and how bright depends on the heat. */
  strike(marker: number, temp: number, frac: number) {
    const x = railX(marker);
    const w = workShape(this.shape, clamp(frac, 0, 1));
    const y = w.top(x) ?? FACE;
    const cold = temp < 0.55, white = temp > 0.92;
    const n = cold ? 6 : white ? 46 : 30;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * (cold ? 1.8 : 2.9);
      const sp = (cold ? 45 : 70) + Math.random() * (white ? 240 : 180);
      const l = (cold ? 0.15 : 0.28) + Math.random() * (white ? 0.8 : 0.5);
      this.sparks.push({ x: x + (Math.random() - 0.5) * 6, y: y - 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, l, l0: l, heat: cold ? 0.3 : white ? 1 : 0.8, w: 0.35 + Math.random() * 0.45 });
    }
    if (temp > 0.45) {
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, sp = 40 + Math.random() * 80, l = 0.5 + Math.random() * 0.5;
        this.sparks.push({ x, y: y - 0.5, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, l, l0: l, heat: 0.7, w: 0.5 + Math.random() * 0.6, flake: true });
      }
    }
    this.flashes.push({ x, y, l: cold ? 0.35 : 0.16, cold });
    this.shake = cold ? 0.6 : 1;
    this.strikeX = x;
  }

  draw(v: ForgeView, dt: number) {
    const { c, g, W, H } = this;
    this.t += dt;
    const t = this.t;
    const k = fitCanvas(c, W, H);
    if (!this.bg || this.k !== k || this.bg.width !== c.width) {
      this.k = k;
      this.bg = newCanvas(c.width, c.height);
      const bg = this.bg.getContext('2d')!;
      bg.setTransform(k, 0, 0, k, 0, 0);
      bg.lineCap = 'round'; bg.lineJoin = 'round';
      paintSmithy(bg, W, H, this.strikes);
      grain(this.bg, 7, 11);
    }
    // the bellows make the fire roar for a moment
    if (this.lastTemp >= 0 && v.temp - this.lastTemp > 0.06) {
      this.flare = 1;
      for (let i = 0; i < 10; i++) this.spawnEmber(true);
    }
    this.lastTemp = v.temp;
    this.flare = Math.max(0, this.flare - dt * 1.6);
    this.shake = Math.max(0, this.shake - dt * 9);
    if (v.phase === 'done' && this.quenchT < 0) {
      this.quenchT = 0;
      for (let i = 0; i < 26; i++) this.spawnSteam(true);
    }
    if (this.quenchT >= 0) this.quenchT += dt;
    // what the eye sees of the heat: after quenching the iron darkens fast
    const q = this.quenchT >= 0 ? smoothstep(0, 0.45, this.quenchT) : 0;
    const heat = v.temp * (1 - q);
    const fire = clamp(0.35 + v.temp * 0.55 + this.flare * 0.5, 0, 1.4);
    const flick = 0.92 + Math.sin(t * 11.3) * 0.04 + Math.sin(t * 17.9 + 1.3) * 0.03 + Math.sin(t * 5.1) * 0.03;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = '#0d0907';
    g.fillRect(0, 0, c.width, c.height);
    const sx = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 1.4 : 0;
    const sy = this.shake > 0 ? (Math.random() - 0.3) * this.shake * 1.4 : 0;
    g.setTransform(k, 0, 0, k, sx * k, sy * k);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.drawImage(this.bg!, 0, 0, W, H);

    this.drawFire(g, fire, flick, t);
    // firelight over the room
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rad(g, FIRE_X, FIRE_Y - 6, 4, FIRE_X - 40, FIRE_Y + 10, 260, [[0, rgba('#ff8a3a', 0.16 * fire * flick)], [0.35, rgba('#e0602a', 0.06 * fire * flick)], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(0, 0, W, H);
    g.restore();
    this.drawBarrel(g, v, fire, t);
    this.updateEmbers(g, dt, fire);

    // the work, glowing on the anvil
    const f = clamp(v.progress / this.strikes, 0, 1);
    const work = workShape(this.shape, f);
    this.lastWork = work;
    this.drawWork(g, work, heat, f, t);
    if (v.phase === 'work') this.drawTarget(g, work, v, t);

    this.drawHammer(g, v, work, t, heat);
    this.updateSparks(g, dt);
    this.drawFlashes(g, dt);
    this.updateSteam(g, dt);

    // gauges
    this.drawHeatGauge(g, v.temp, t, q);
    this.drawProgress(g, v, t);
    this.lastMarker = v.marker;

    // a cold, ringing blow washes the room blue for a moment
    if (v.flash > 0) {
      g.fillStyle = rgba('#a8b8e0', clamp(v.flash, 0, 0.3) * 0.5);
      g.fillRect(-2, -2, W + 4, H + 4);
    }
    // vignette
    g.fillStyle = rad(g, W * 0.52, H * 0.55, H * 0.35, W * 0.52, H * 0.55, W * 0.72, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(6,3,2,0.5)']]);
    g.fillRect(-4, -4, W + 8, H + 8);
  }

  // ------------------------------------------------ fire and light

  private drawFire(g: Ctx, fire: number, flick: number, t: number) {
    const hot = clamp(fire, 0, 1.2);
    // a bed of charcoal: dark lumps with glowing hearts, hottest in the middle
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rad(g, FIRE_X, FIRE_Y + 1, 2, FIRE_X, FIRE_Y + 1, 40, [[0, rgba('#ffb050', 0.5 * hot * flick)], [0.45, rgba('#ff6a20', 0.22 * hot)], [1, 'rgba(0,0,0,0)']]);
    g.beginPath(); g.ellipse(FIRE_X, FIRE_Y + 1, 40, 16, 0, 0, TAU); g.fill();
    g.restore();
    for (const cl of this.coals) {
      const pulse = 0.7 + 0.3 * Math.sin(t * cl.sp + cl.ph);
      const h = clamp(cl.heat * (0.45 + hot * 0.6) * pulse, 0, 1.1);
      const rng = new RNG(cl.seed);
      blobPath(g, cl.x, cl.y, cl.r, cl.r * 0.7, rng);
      g.fillStyle = rad(g, cl.x - cl.r * 0.2, cl.y - cl.r * 0.3, 0.1, cl.x, cl.y, cl.r * 1.1, [[0, mix('#3a1a0e', '#fff0b8', clamp(h, 0, 1))], [0.5, mix('#1e100a', '#ff8a2a', clamp(h, 0, 1))], [1, mix('#0c0806', '#8a2a10', clamp(h * 0.9, 0, 1))]]);
      g.fill();
      if (h < 0.5) {
        // cooler lumps show grey ash on top
        ellipse(g, cl.x - cl.r * 0.25, cl.y - cl.r * 0.35, cl.r * 0.5, cl.r * 0.22, rgba('#8a8078', 0.35 * (1 - h * 2)));
      }
    }
    // tongues of flame, outer to inner
    g.save();
    g.globalCompositeOperation = 'lighter';
    const n = 11;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const ph = t * (6.5 + (i % 4) * 1.4) + i * 2.3;
      const edge = 1 - Math.pow(Math.abs(u - 0.5) * 2, 1.6) * 0.75;
      const hgt = (10 + 26 * hot) * (0.6 + 0.4 * Math.sin(ph)) * edge;
      const w = (3.4 + 2.4 * edge) * (0.85 + 0.15 * Math.sin(ph * 1.3));
      const ox = FIRE_X - 21 + u * 42 + Math.sin(t * 3.7 + i * 1.7) * 1.3;
      const lean = Math.sin(t * 2.1 + i) * 2.2;
      flameTongue(g, ox, FIRE_Y + 1.5, w, hgt, lean, 0.55 + 0.25 * edge);
    }
    g.fillStyle = rad(g, FIRE_X, FIRE_Y - 3, 0, FIRE_X, FIRE_Y - 3, 20, [[0, rgba('#fff6d8', 0.5 * clamp(hot, 0, 1))], [1, 'rgba(255,200,120,0)']]);
    g.beginPath(); g.ellipse(FIRE_X, FIRE_Y - 3, 22, 11, 0, 0, TAU); g.fill();
    // the hood's lip catches the light
    g.fillStyle = lin(g, 0, 58, 0, 66, [[0, 'rgba(0,0,0,0)'], [1, rgba('#ff8a3a', 0.4 * hot * flick)]]);
    g.fillRect(252, 58, 112, 8);
    g.restore();
  }

  private spawnEmber(burst = false) {
    const l = 0.7 + Math.random() * 1.3;
    this.embers.push({ x: FIRE_X + (Math.random() - 0.5) * 34, y: FIRE_Y - 4 - Math.random() * 8, vx: (Math.random() - 0.5) * (burst ? 34 : 8), vy: -(burst ? 36 : 16) - Math.random() * (burst ? 44 : 18), l, l0: l, heat: 1, w: 0.22 + Math.random() * 0.32 });
  }

  private updateEmbers(g: Ctx, dt: number, fire: number) {
    if (Math.random() < dt * (1.5 + fire * 3.5)) this.spawnEmber();
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = this.embers.length - 1; i >= 0; i--) {
      const e = this.embers[i];
      e.l -= dt;
      const underHood = e.x > 252 && e.x < 364;
      if (e.l <= 0 || e.y < -4 || (underHood && e.y < 63)) { this.embers.splice(i, 1); continue; }
      e.vx += Math.sin(this.t * 3 + i * 1.7) * 14 * dt;
      e.x += e.vx * dt; e.y += e.vy * dt;
      const a = (e.l / e.l0) * (underHood ? smoothstep(63, 78, e.y) : 1);
      const flickr = 0.6 + 0.4 * Math.sin(this.t * 20 + i);
      g.fillStyle = rgba(a > 0.5 ? '#ffe0a0' : '#ff8a3a', 0.9 * a * flickr);
      g.beginPath(); g.arc(e.x, e.y, e.w, 0, TAU); g.fill();
      g.fillStyle = rad(g, e.x, e.y, 0, e.x, e.y, e.w * 5, [[0, rgba('#ff8a3a', 0.25 * a)], [1, 'rgba(255,138,58,0)']]);
      g.beginPath(); g.arc(e.x, e.y, e.w * 5, 0, TAU); g.fill();
    }
    g.restore();
  }

  private drawBarrel(g: Ctx, v: ForgeView, fire: number, t: number) {
    // the quench water mirrors the fire; it beckons once the work is shaped
    const cx = 340, cy = 151.4;
    g.save();
    g.beginPath(); g.ellipse(cx, cy, 21, 4.4, 0, 0, TAU); g.clip();
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const y = cy - 2.4 + i * 1.5 + Math.sin(t * 2 + i) * 0.35;
      g.strokeStyle = rgba('#ff9a4a', (0.14 + 0.1 * Math.sin(t * 3 + i * 2)) * fire);
      g.lineWidth = 0.55;
      g.beginPath(); g.moveTo(cx - 12 + i * 3 + Math.sin(t + i) * 2, y); g.lineTo(cx + 4 + i * 2 + Math.sin(t * 1.3 + i) * 2, y); g.stroke();
    }
    if (v.phase === 'quench') {
      const p = 0.5 + 0.5 * Math.sin(t * 5);
      g.fillStyle = rad(g, cx, cy, 0, cx, cy, 22, [[0, rgba('#9fd8ff', 0.2 + 0.25 * p)], [1, rgba('#9fd8ff', 0.05)]]);
      g.fillRect(cx - 22, cy - 6, 44, 12);
    }
    g.restore();
    if (v.phase === 'quench') {
      const p = 0.5 + 0.5 * Math.sin(t * 5);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rad(g, cx, cy, 2, cx, cy, 36, [[0, rgba('#7ac8ff', 0.2 * p + 0.08)], [1, 'rgba(0,0,0,0)']]);
      g.beginPath(); g.ellipse(cx, cy, 36, 18, 0, 0, TAU); g.fill();
      g.restore();
    }
  }

  private spawnSteam(burst = false) {
    const fromBar = Math.random() < 0.5;
    const l = 0.9 + Math.random() * 1.2;
    const w = this.lastWork;
    const x = fromBar && w ? lerp(w.x0 + 4, w.x1 - 4, Math.random()) : 328 + Math.random() * 24;
    const y = fromBar && w ? (w.top(x) ?? w.y0) - 1 : 150;
    this.steam.push({ x, y, vx: (Math.random() - 0.5) * 18, vy: -(burst ? 22 : 14) - Math.random() * 30, l, l0: l, r: 2.5 + Math.random() * 4 });
  }

  private updateSteam(g: Ctx, dt: number) {
    if (this.quenchT >= 0 && this.quenchT < 0.9 && Math.random() < dt * 30) this.spawnSteam();
    for (let i = this.steam.length - 1; i >= 0; i--) {
      const s = this.steam[i];
      s.l -= dt;
      if (s.l <= 0) { this.steam.splice(i, 1); continue; }
      s.x += s.vx * dt + Math.sin(this.t * 2 + i) * 6 * dt; s.y += s.vy * dt; s.vy *= 1 - dt * 0.5; s.r += dt * 11;
      const a = (s.l / s.l0) * smoothstep(0, 0.15, s.l0 - s.l);
      g.fillStyle = rad(g, s.x, s.y, 0, s.x, s.y, s.r, [[0, `rgba(236,232,226,${0.3 * a})`], [0.5, `rgba(236,232,226,${0.14 * a})`], [1, 'rgba(236,232,226,0)']]);
      g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill();
    }
  }

  // ------------------------------------------------ the work and the target

  private drawWork(g: Ctx, w: Work, heat: number, f: number, t: number) {
    const col = heatCol(heat);
    const glow = smoothstep(0.35, 1, heat);
    const steel = 1 - smoothstep(0.14, 0.46, heat);
    const shimmer = 0.94 + 0.06 * Math.sin(t * 9) * Math.sin(t * 5.3);
    // heat blooms around the iron (a real blur of its outline) and lights the anvil beneath
    if (glow > 0.01) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const cx = (w.x0 + w.x1) / 2;
      w.path(g);
      g.fillStyle = rgba(col, 0.25 * glow);
      g.shadowColor = rgba(col, 0.55 * glow * shimmer);
      g.shadowBlur = Math.min(110, (26 + 20 * glow) * this.k);
      g.fill();
      g.shadowColor = rgba(lit(col, 0.3), 0.8 * glow);
      g.shadowBlur = Math.min(40, (5 + 5 * glow) * this.k);
      g.fill();
      g.shadowColor = 'rgba(0,0,0,0)';
      g.shadowBlur = 0;
      // on the anvil's face and front, fading off past the ends of the piece
      const ax0 = Math.max(AX0, w.x0 - 10), ax1 = Math.min(AX1, w.x1 + 10);
      g.save();
      g.beginPath(); g.rect(ax0, FACE - 2.5, ax1 - ax0, 13.5); g.clip();
      const feet = this.shape === 'horseshoe' ? [w.x0 + 6, w.x1 - 6] : [cx];
      for (const fx of feet) {
        const rx = this.shape === 'horseshoe' ? 16 : (w.x1 - w.x0) / 2 + 10;
        g.save();
        g.translate(fx, FACE - 1); g.scale(1, 12 / rx);
        g.fillStyle = rad(g, 0, 0, 0, 0, 0, rx, [[0, rgba(col, 0.55 * glow)], [0.7, rgba(col, 0.25 * glow)], [1, 'rgba(0,0,0,0)']]);
        g.beginPath(); g.arc(0, 0, rx, 0, TAU); g.fill();
        g.restore();
      }
      g.restore();
      g.restore();
    }
    // contact shadow
    g.fillStyle = 'rgba(8,5,3,0.5)';
    if (this.shape === 'horseshoe') for (const x of [w.x0 + 3, w.x1 - 9]) g.fillRect(x, FACE - 1.2, 6, 1.2);
    else g.fillRect(w.x0 + 2, FACE - 1.2, Math.max(0, w.x1 - w.x0 - 4), 1.2);
    // body: hotter in the middle, cooling toward the ends
    const cool = heatCol(heat - 0.16);
    const top = mix(lit(col, 0.3), '#9aa0a8', steel), mid = mix(col, '#50545b', steel), bot = mix(dim(col, 0.25), '#23252a', steel);
    w.path(g);
    g.fillStyle = lin(g, 0, w.y0, 0, w.y1, [[0, top], [0.45, mid], [1, bot]]);
    g.fill();
    g.save();
    w.path(g);
    g.clip();
    const endCol = mix(cool, '#2a2c30', steel);
    g.fillStyle = lin(g, w.x0, 0, w.x1, 0, [[0, rgba(endCol, 0.8)], [0.2, rgba(endCol, 0)], [0.8, rgba(endCol, 0)], [1, rgba(endCol, 0.8)]]);
    g.fillRect(w.x0 - 2, w.y0 - 2, w.x1 - w.x0 + 4, w.y1 - w.y0 + 4);
    // forge scale: dark flecks that show as the iron cools
    const sa = 0.06 + 0.3 * (1 - glow);
    for (const [u, vv, r] of this.scale) {
      const x = lerp(w.x0, w.x1, u), y = lerp(w.y0 + 1, w.y1 - 1, vv);
      ellipse(g, x, y, r * 4.5, r * 0.55, rgba(mix(dim(col, 0.55), '#34363a', steel), sa));
      ellipse(g, x + r * 2, y - r * 0.8, r * 2.2, r * 0.3, rgba(lit(col, 0.4), sa * 0.6 * (1 - steel)));
    }
    // a hot core and a lit upper edge
    if (glow > 0.01) {
      g.globalCompositeOperation = 'lighter';
      const hh = w.y1 - w.y0;
      if (this.shape === 'horseshoe') {
        g.strokeStyle = rgba(lit(col, 0.6), 0.35 * glow * shimmer);
        g.lineWidth = 1.6;
        w.path(g);
        g.stroke();
      } else {
        g.fillStyle = lin(g, 0, w.y0, 0, w.y1, [[0, rgba('#fff6e0', 0.35 * glow)], [0.18, rgba(lit(col, 0.6), 0.3 * glow * shimmer)], [0.5, rgba(lit(col, 0.4), 0.14 * glow)], [1, 'rgba(0,0,0,0)']]);
        g.fillRect(w.x0 - 2, w.y0 - 1, w.x1 - w.x0 + 4, hh + 2);
      }
      g.globalCompositeOperation = 'source-over';
    }
    // steel sheen when cold
    if (steel > 0.05) {
      g.fillStyle = lin(g, 0, w.y0, 0, w.y0 + 2.2, [[0, rgba('#e6ebf0', 0.45 * steel)], [1, 'rgba(0,0,0,0)']]);
      g.fillRect(w.x0 - 2, w.y0 - 1, w.x1 - w.x0 + 4, 3.5);
    }
    g.restore();
    // horseshoe nail holes, a sword's fuller, once the shape is there
    if (this.shape === 'horseshoe') {
      if (f > 0.55) {
        const a = smoothstep(0.55, 0.9, f);
        for (const s of [-0.8, -0.55, 0.55, 0.8]) {
          const x = lerp(180, s < 0 ? w.x0 + 4 : w.x1 - 4, Math.abs(s)), y = w.top(x);
          if (y !== null) ellipse(g, x, y + 2.6, 0.8, 1.1, rgba('#1a0e08', 0.75 * a));
        }
      }
    } else if (this.shape === 'sword' && f > 0.45) {
      // the fuller runs down the blade as it is drawn out
      const a = smoothstep(0.45, 0.9, f), y = (w.y0 + w.y1) / 2;
      line(g, w.x0 + 30, y, w.x1 - 34, y, rgba(dim(col, 0.5), 0.55 * a), 1);
      line(g, w.x0 + 30, y - 0.9, w.x1 - 34, y - 0.9, rgba(lit(col, 0.5), 0.3 * a), 0.4);
    }
    // outline
    w.path(g);
    g.strokeStyle = rgba('#140c08', 0.5);
    g.lineWidth = 0.45;
    g.stroke();
  }

  private drawTarget(g: Ctx, w: Work, v: ForgeView, t: number) {
    const x0 = railX(clamp(v.target - v.zoneW / 2, 0, 1)), x1 = railX(clamp(v.target + v.zoneW / 2, 0, 1));
    const cx = (x0 + x1) / 2, hw = (x1 - x0) / 2;
    const inZone = Math.abs(v.marker - v.target) < v.zoneW / 2;
    const pulse = 0.85 + 0.15 * Math.sin(t * 6);
    g.save();
    g.globalCompositeOperation = 'lighter';
    // a shaft of light marks the spot on the iron
    const ty = Math.min(w.y0, FACE - 6) - 24;
    g.fillStyle = lin(g, x0 - 3, 0, x1 + 3, 0, [[0, 'rgba(255,230,160,0)'], [0.25, rgba('#ffe6a0', 0.13 * pulse)], [0.5, rgba('#fff0c0', 0.19 * pulse)], [0.75, rgba('#ffe6a0', 0.13 * pulse)], [1, 'rgba(255,230,160,0)']]);
    g.beginPath();
    g.moveTo(cx - hw * 0.6, ty); g.lineTo(cx + hw * 0.6, ty); g.lineTo(x1 + 3, FACE + 1); g.lineTo(x0 - 3, FACE + 1); g.closePath();
    g.fill();
    // the bright patch on the metal itself
    g.save();
    w.path(g); g.clip();
    g.fillStyle = lin(g, x0 - 2, 0, x1 + 2, 0, [[0, 'rgba(255,245,210,0)'], [0.3, rgba('#fff5d2', 0.5 * pulse)], [0.7, rgba('#fff5d2', 0.5 * pulse)], [1, 'rgba(255,245,210,0)']]);
    g.fillRect(x0 - 2, w.y0 - 2, x1 - x0 + 4, w.y1 - w.y0 + 4);
    g.restore();
    // the window on the rail
    g.fillStyle = lin(g, x0, 0, x1, 0, [[0, rgba('#ffcf5a', 0.55)], [0.5, rgba('#fff0b0', 0.95 * pulse)], [1, rgba('#ffcf5a', 0.55)]]);
    roundRect(g, x0, RAIL_Y + 0.9, x1 - x0, RAIL_H - 1.8, 1.4);
    g.fill();
    g.fillStyle = rad(g, cx, RAIL_Y + RAIL_H / 2, 0, cx, RAIL_Y + RAIL_H / 2, hw + 8, [[0, rgba('#ffc24a', 0.35)], [1, 'rgba(0,0,0,0)']]);
    g.beginPath(); g.ellipse(cx, RAIL_Y + RAIL_H / 2, hw + 8, 7, 0, 0, TAU); g.fill();
    g.restore();
    // brackets either side of the window
    for (const x of [x0, x1]) {
      poly(g, [x - 1.2, RAIL_Y - 2.3, x + 1.2, RAIL_Y - 2.3, x, RAIL_Y + 0.4], BRASS[4], BRASS[1], 0.3);
      poly(g, [x - 1.2, RAIL_Y + RAIL_H + 2.3, x + 1.2, RAIL_Y + RAIL_H + 2.3, x, RAIL_Y + RAIL_H - 0.4], BRASS[4], BRASS[1], 0.3);
    }
    // the moving mark: a steel needle riding the rail, golden over the target
    const mx = railX(v.marker);
    const tint = inZone ? '#fff2b8' : '#e8edf2';
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rad(g, mx, RAIL_Y + RAIL_H / 2, 0, mx, RAIL_Y + RAIL_H / 2, 8, [[0, rgba(inZone ? '#ffd870' : '#bcd4ff', inZone ? 0.7 : 0.45)], [1, 'rgba(0,0,0,0)']]);
    g.beginPath(); g.arc(mx, RAIL_Y + RAIL_H / 2, 8, 0, TAU); g.fill();
    g.restore();
    poly(g, [mx, RAIL_Y - 3.6, mx + 2.2, RAIL_Y - 0.8, mx + 0.8, RAIL_Y + RAIL_H + 2, mx - 0.8, RAIL_Y + RAIL_H + 2, mx - 2.2, RAIL_Y - 0.8], lin(g, mx - 2, 0, mx + 2, 0, [[0, '#ffffff'], [0.5, tint], [1, '#7d848c']]), '#1a1410', 0.35);
    circle(g, mx - 0.4, RAIL_Y - 1.4, 0.7, '#ffffff');
  }

  // ------------------------------------------------ the hammer

  private drawHammer(g: Ctx, v: ForgeView, w: Work, t: number, heat: number) {
    const mx = railX(v.marker);
    const vel = v.marker - this.lastMarker;
    let hit = 0, p = 1;
    if (v.hammerT > 0) {
      p = 1 - v.hammerT / 0.18;
      hit = p < 0.3 ? 1 : 1 - easeOut((p - 0.3) / 0.7);
    }
    // the blow lands where it was struck, then the hammer follows the mark again
    const x = hit > 0 ? lerp(mx, this.strikeX, hit) : mx;
    const land = (w.top(x) ?? FACE) - HAMMER_FACE;
    const restY = Math.min(50, land - 26) + Math.sin(t * 2.4) * 1.2, restA = -0.42 + clamp(vel * 12, -0.08, 0.08);
    const impactA = 0.02;
    const pose = (h: number) => ({ y: lerp(restY, land, h), a: lerp(restA, impactA, h) });
    // a blur of the swing on the frames around the blow
    if (v.hammerT > 0 && p < 0.22) {
      g.save();
      for (const [h, a] of [[0.25, 0.08], [0.5, 0.14], [0.75, 0.22]] as const) {
        const q = pose(h);
        g.globalAlpha = a;
        hammer(g, x, q.y, q.a, true);
      }
      g.restore();
    }
    const q = pose(hit);
    // its shadow darkens the work as it comes down
    const near = clamp(1 - (land - q.y) / 60, 0, 1);
    ellipse(g, x + 2, FACE - 1.5, 11 + (1 - near) * 8, 1.7, `rgba(8,5,3,${0.12 + near * 0.3})`);
    hammer(g, x, q.y, q.a, false);
    // the iron's glow on the underside of the head as it nears
    if (heat > 0.4 && near > 0.2) {
      g.save();
      g.globalCompositeOperation = 'lighter';
      const by = q.y + HAMMER_FACE;
      g.fillStyle = rad(g, x, by, 0, x, by, 10, [[0, rgba(heatCol(heat), 0.35 * near * smoothstep(0.4, 1, heat))], [1, 'rgba(0,0,0,0)']]);
      g.beginPath(); g.arc(x, by, 10, 0, TAU); g.fill();
      g.restore();
    }
  }

  // ------------------------------------------------ sparks

  private updateSparks(g: Ctx, dt: number) {
    g.save();
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const s = this.sparks[i];
      s.l -= dt;
      if (s.l <= 0 || s.y > this.H + 4) { this.sparks.splice(i, 1); continue; }
      const px = s.x, py = s.y;
      s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 300 * dt;
      if (s.flake) s.vx *= 1 - dt * 1.5;
      // skitter across the anvil's face
      if (s.y > FACE - 0.5 && py <= FACE - 0.5 && s.x > AX0 && s.x < AX1 && s.vy > 0) { s.y = FACE - 0.5; s.vy *= -0.3; s.vx *= 0.7; }
      const a = s.l / s.l0;
      if (s.flake) {
        // a flake of scale, glowing as it flies and darkening
        const hot = clamp((a - 0.35) / 0.65, 0, 1);
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = mix('#2a1c16', '#ff8a3a', hot);
        g.save(); g.translate(s.x, s.y); g.rotate(s.x * 0.3 + s.l * 18);
        g.fillRect(-s.w * 0.6, -s.w * 0.3, s.w * 1.2, s.w * 0.6);
        g.restore();
        continue;
      }
      g.globalCompositeOperation = 'lighter';
      const hot = s.heat * (0.35 + 0.65 * a);
      const col = hot > 0.62 ? '#fff4d0' : hot > 0.4 ? '#ffc04a' : '#ff6a22';
      // a streak along the path of the last few hundredths of a second
      const k = 0.028;
      g.strokeStyle = rgba(col, 0.25 + 0.7 * a);
      g.lineWidth = s.w * (0.6 + a * 0.5);
      g.beginPath(); g.moveTo(s.x - s.vx * k, s.y - s.vy * k); g.lineTo(s.x, s.y); g.stroke();
      if (a > 0.35) {
        g.fillStyle = rad(g, s.x, s.y, 0, s.x, s.y, 3.4, [[0, rgba(col, 0.35 * a)], [1, 'rgba(0,0,0,0)']]);
        g.beginPath(); g.arc(s.x, s.y, 3.4, 0, TAU); g.fill();
      }
      void px;
    }
    g.restore();
  }

  private drawFlashes(g: Ctx, dt: number) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      const f = this.flashes[i];
      f.l -= dt;
      if (f.l <= 0) { this.flashes.splice(i, 1); continue; }
      if (f.cold) {
        // the dull ring of a cold blow
        const p = 1 - f.l / 0.35;
        for (let j = 0; j < 3; j++) {
          const r = 6 + p * 34 + j * 7;
          g.strokeStyle = rgba('#c8dcff', (1 - p) * 0.5 / (j + 1));
          g.lineWidth = 1.1;
          g.beginPath(); g.ellipse(f.x, f.y - 2, r, r * 0.45, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
        }
      } else {
        const a = f.l / 0.16;
        g.fillStyle = rad(g, f.x, f.y - 1, 0, f.x, f.y - 1, 28, [[0, rgba('#fffbe8', 0.9 * a)], [0.25, rgba('#ffc860', 0.4 * a)], [1, 'rgba(0,0,0,0)']]);
        g.beginPath(); g.arc(f.x, f.y - 1, 28, 0, TAU); g.fill();
      }
    }
    g.restore();
  }

  // ------------------------------------------------ gauges

  private drawHeatGauge(g: Ctx, temp: number, t: number, q: number) {
    temp *= 1 - q;
    const lvl = clamp(temp, 0, 1);
    const yT = TUBE_BOT - lvl * (TUBE_BOT - TUBE_TOP);
    const x = TUBE_X, w = TUBE_W;
    const col = heatCol(temp);
    const good = temp >= 0.57 && temp <= 0.9;
    // the column of heat, coloured along the ramp
    g.save();
    roundRect(g, x, TUBE_TOP - 2, w, TUBE_BOT - TUBE_TOP + 14, w / 2);
    g.clip();
    const stops: [number, string][] = HEAT.filter(([h]) => h <= 1).map(([h, c]) => [h, c]);
    g.fillStyle = lin(g, 0, TUBE_BOT, 0, TUBE_TOP, stops);
    g.fillRect(x, yT, w, TUBE_BOT - yT + 16);
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = lin(g, x, 0, x + w, 0, [[0, 'rgba(255,255,255,0)'], [0.4, 'rgba(255,245,220,0.22)'], [1, 'rgba(255,255,255,0)']]);
    g.fillRect(x, yT, w, TUBE_BOT - yT + 16);
    // the glowing meniscus
    g.fillStyle = rad(g, x + w / 2, yT, 0, x + w / 2, yT, 9, [[0, rgba(lit(col, 0.5), 0.9)], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(x - 2, yT - 9, w + 4, 18);
    g.restore();
    // the bulb
    const bx = x + w / 2, by = TUBE_BOT + 13;
    circle(g, bx, by, 6.2, rad(g, bx - 1.8, by - 2, 0.3, bx, by, 6.4, [[0, lit(col, 0.6)], [0.55, col], [1, dim(col, 0.45)]]));
    g.save();
    g.globalCompositeOperation = 'lighter';
    const ga = 0.25 + smoothstep(0.3, 1, temp) * 0.55;
    g.fillStyle = rad(g, bx, by, 0, bx, by, 16, [[0, rgba(col, ga)], [1, 'rgba(0,0,0,0)']]);
    g.beginPath(); g.arc(bx, by, 16, 0, TAU); g.fill();
    if (good) {
      // the brackets of the working band glow while the iron is ready
      const y0 = TUBE_BOT - 0.9 * (TUBE_BOT - TUBE_TOP), y1 = TUBE_BOT - 0.57 * (TUBE_BOT - TUBE_TOP);
      g.fillStyle = lin(g, 0, y0, 0, y1, [[0, rgba('#ffd870', 0.45)], [0.5, rgba('#ffe8a0', 0.6)], [1, rgba('#ffd870', 0.45)]]);
      g.fillRect(x + w + 1.2, y0, 2.4, y1 - y0);
      g.fillStyle = rad(g, x + w + 2.4, (y0 + y1) / 2, 0, x + w + 2.4, (y0 + y1) / 2, 24, [[0, rgba('#ffc24a', 0.18)], [1, 'rgba(0,0,0,0)']]);
      g.fillRect(x - 6, y0 - 10, 30, y1 - y0 + 20);
    }
    if (temp > 0.92) {
      const pp = 0.5 + 0.5 * Math.sin(t * 14);
      g.fillStyle = rad(g, x + w / 2, TUBE_TOP + 6, 0, x + w / 2, TUBE_TOP + 6, 16, [[0, rgba('#ffffff', 0.35 + 0.3 * pp)], [1, 'rgba(0,0,0,0)']]);
      g.beginPath(); g.arc(x + w / 2, TUBE_TOP + 6, 16, 0, TAU); g.fill();
    }
    g.restore();
    // glass highlights
    g.fillStyle = 'rgba(255,255,255,0.28)';
    roundRect(g, x + 1.2, TUBE_TOP + 1, 1.3, TUBE_BOT - TUBE_TOP - 2, 0.6); g.fill();
    ellipse(g, bx - 2.2, by - 2.4, 1.6, 1.1, 'rgba(255,255,255,0.45)');
  }

  private drawProgress(g: Ctx, v: ForgeView, t: number) {
    const n = this.strikes;
    const { x0, gap } = pipLayout(n);
    for (let i = 0; i < n; i++) {
      const fill = clamp(v.progress - i, 0, 1);
      if (fill <= 0) continue;
      const x = x0 + i * gap, y = 12;
      const pulse = v.phase !== 'work' ? 0.8 + 0.2 * Math.sin(t * 5 - i * 0.5) : 1;
      circle(g, x, y, 3.1, rad(g, x - 1, y - 1.1, 0.2, x, y, 3.2, [[0, rgba('#fff6d0', fill)], [0.5, rgba('#ffc24a', fill)], [1, rgba('#b8561a', fill)]]));
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rad(g, x, y, 0, x, y, 9, [[0, rgba('#ffb040', 0.45 * fill * pulse)], [1, 'rgba(0,0,0,0)']]);
      g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill();
      g.restore();
      ellipse(g, x - 1, y - 1.2, 1, 0.7, rgba('#ffffff', 0.7 * fill));
    }
  }
}

function easeOut(x: number) { const u = 1 - clamp(x, 0, 1); return 1 - u * u * u; }

function pipLayout(n: number) {
  const gap = Math.min(20, 168 / Math.max(1, n - 1));
  const span = gap * (n - 1);
  return { x0: 180 - span / 2, gap, span };
}

/** One tongue of flame rising from (x, y), drawn additively in three layers. */
function flameTongue(g: Ctx, x: number, y: number, w: number, h: number, lean: number, a: number) {
  const layer = (sw: number, sh: number, c0: string, c1: string, al: number) => {
    const ww = w * sw, hh = h * sh;
    g.fillStyle = lin(g, 0, y, 0, y - hh, [[0, rgba(c0, al)], [0.55, rgba(c1, al * 0.75)], [1, rgba(c1, 0)]]);
    g.beginPath();
    g.moveTo(x - ww, y);
    g.bezierCurveTo(x - ww * 1.05, y - hh * 0.45, x + lean * 0.5 - ww * 0.4, y - hh * 0.75, x + lean, y - hh);
    g.bezierCurveTo(x + lean * 0.5 + ww * 0.4, y - hh * 0.75, x + ww * 1.05, y - hh * 0.45, x + ww, y);
    g.closePath();
    g.fill();
  };
  layer(1, 1, '#ff4a12', '#ff7a1e', a * 0.55);
  layer(0.66, 0.78, '#ff9a2a', '#ffc24a', a * 0.6);
  layer(0.34, 0.5, '#fff0b0', '#ffe28a', a * 0.7);
}

const HAMMER_FACE = 13.2; // from the head's centre to its striking face

/** A cross-peen smith's hammer: head centre (x, y), handle pointing along angle a (0 = right). */
function hammer(g: Ctx, x: number, y: number, a: number, ghost: boolean) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  // handle: ash, darkened where the hand grips it
  const L = 62;
  g.beginPath();
  g.moveTo(5, -2.4); g.lineTo(L, -2.1); g.quadraticCurveTo(L + 2.8, 0, L, 2.4); g.lineTo(5, 2.4); g.closePath();
  g.fillStyle = ghost ? '#6b4a2c' : lin(g, 0, -2.4, 0, 2.4, [[0, '#c9a06a'], [0.35, '#a47646'], [1, '#4e321c']]);
  g.fill();
  if (!ghost) {
    line(g, 12, -0.9, L - 4, -1.1, 'rgba(255,236,200,0.3)', 0.55);
    g.fillStyle = 'rgba(30,18,10,0.3)';
    g.fillRect(L - 20, -2.2, 16, 4.6);
    g.strokeStyle = 'rgba(20,12,6,0.6)'; g.lineWidth = 0.4;
    g.beginPath(); g.moveTo(5, -2.4); g.lineTo(L, -2.1); g.quadraticCurveTo(L + 2.8, 0, L, 2.4); g.lineTo(5, 2.4); g.stroke();
  }
  // head: face down, the cross-peen up
  g.beginPath();
  g.moveTo(-6.4, -9.5); g.lineTo(-2, -17.5); g.lineTo(2, -17.5); g.lineTo(6.4, -9.5);
  g.lineTo(6.4, 8.4); g.lineTo(7.4, 9.8); g.lineTo(7.4, HAMMER_FACE); g.lineTo(-7.4, HAMMER_FACE); g.lineTo(-7.4, 9.8); g.lineTo(-6.4, 8.4);
  g.closePath();
  g.fillStyle = ghost ? '#3a3e44' : lin(g, -7, 0, 7, 0, [[0, IRON[5]], [0.3, IRON[4]], [0.7, IRON[2]], [1, IRON[1]]]);
  g.fill();
  if (!ghost) {
    g.strokeStyle = 'rgba(10,8,6,0.85)'; g.lineWidth = 0.55; g.stroke();
    line(g, -5.3, -9, -5.3, 8, 'rgba(230,236,242,0.55)', 0.8);
    line(g, -1.6, -17, 1.6, -17, 'rgba(230,236,242,0.5)', 0.55);
    line(g, 5.6, -8, 5.6, 8, 'rgba(255,140,60,0.35)', 0.6);
    // the polished face
    g.fillStyle = lin(g, -7, 0, 7, 0, [[0, '#dfe4e8'], [1, '#6a7078']]);
    g.fillRect(-7.4, HAMMER_FACE - 1.6, 14.8, 1.6);
    // the eye and wedge
    g.fillStyle = '#1a1410';
    g.fillRect(-2, -3.6, 4, 7);
    line(g, 0, -3, 0, 2.8, '#8a6a3a', 0.9);
  }
  g.restore();
}

// ---------------------------------------------------------------- painting the smithy (static)

function stoneWall(g: Ctx, x0: number, y0: number, x1: number, y1: number, rng: RNG, rowH = 13) {
  g.fillStyle = '#0f0b08';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  for (let y = y1 - rowH, r = 0; y > y0 - rowH; y -= rowH, r++) {
    let x = x0 - (r % 2) * rowH * 0.9 - rng.next() * 8;
    while (x < x1) {
      const w = rowH * (1.3 + rng.next() * 1.7);
      const h = rowH - 1.3 + (rng.next() - 0.5) * 0.8;
      const col = mix('#3c332c', rng.next() < 0.5 ? '#4c4238' : '#2c2622', rng.next() * 0.7);
      const sx = x + 0.7, sy = y + 0.7;
      roundRect(g, sx, sy, w - 1.4, h, 3.2, lin(g, sx, sy, sx + w * 0.35, sy + h, [[0, lit(col, 0.16)], [0.45, col], [1, dim(col, 0.4)]]));
      g.save();
      roundRect(g, sx, sy, w - 1.4, h, 3.2);
      g.clip();
      for (let i = 0; i < w * 0.5; i++) ellipse(g, sx + rng.next() * w, sy + rng.next() * h, 0.6 + rng.next() * 1.6, 0.4 + rng.next() * 0.9, rgba(rng.next() < 0.6 ? dim(col, 0.5) : lit(col, 0.3), 0.25));
      g.fillStyle = rgba(lit(col, 0.4), 0.22); g.fillRect(sx, sy, w, 0.8);
      g.fillStyle = rgba(dim(col, 0.7), 0.4); g.fillRect(sx, sy + h - 1, w, 1);
      g.restore();
      x += w;
    }
  }
}

function brickCourses(g: Ctx, x0: number, y0: number, x1: number, y1: number, rng: RNG) {
  g.fillStyle = '#1a0f0a';
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.save();
  g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
  const bh = 5.6;
  for (let y = y0, r = 0; y < y1; y += bh, r++) {
    for (let x = x0 - (r % 2) * 7 - 1; x < x1; x += 14) {
      const col = mix('#6a3522', rng.next() < 0.5 ? '#84452a' : '#4e2618', rng.next() * 0.7);
      roundRect(g, x + 0.5, y + 0.5, 13, bh - 1, 1, lin(g, x, y, x + 4, y + bh, [[0, lit(col, 0.15)], [0.5, col], [1, dim(col, 0.35)]]));
      if (rng.next() < 0.3) ellipse(g, x + 3 + rng.next() * 8, y + 2 + rng.next() * 2, 1.4, 0.7, rgba('#140a06', 0.4));
    }
  }
  g.restore();
}

function rivet(g: Ctx, x: number, y: number, r: number, pal: string[] = IRON) {
  ellipse(g, x + r * 0.35, y + r * 0.45, r, r, 'rgba(6,4,2,0.5)');
  circle(g, x, y, r, rad(g, x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r, [[0, pal[5]], [0.5, pal[3]], [1, pal[1]]]));
}

function paintSmithy(g: Ctx, W: number, H: number, strikes: number) {
  const rng = new RNG(19);
  // ---- back wall, soot-dark above, warmed by the hearth
  stoneWall(g, 0, 0, W, FLOOR + 2, rng);
  g.fillStyle = lin(g, 0, 0, 0, FLOOR, [[0, 'rgba(6,4,3,0.72)'], [0.55, 'rgba(6,4,3,0.3)'], [1, 'rgba(6,4,3,0.15)']]);
  g.fillRect(0, 0, W, FLOOR + 2);
  g.fillStyle = lin(g, 0, 0, W, 0, [[0, 'rgba(6,4,3,0.5)'], [0.5, 'rgba(6,4,3,0.12)'], [1, 'rgba(6,4,3,0)']]);
  g.fillRect(0, 0, W, FLOOR + 2);
  g.save();
  g.globalCompositeOperation = 'soft-light';
  g.fillStyle = rad(g, FIRE_X, FIRE_Y, 10, FIRE_X - 30, FIRE_Y, 230, [[0, 'rgba(255,150,70,0.9)'], [0.5, 'rgba(200,90,40,0.4)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(0, 0, W, H);
  g.restore();

  // ---- floor: packed earth, scale and charcoal
  g.fillStyle = lin(g, 0, FLOOR, 0, H, [[0, '#2a1e16'], [0.4, '#20170f'], [1, '#140e0a']]);
  g.fillRect(0, FLOOR, W, H - FLOOR);
  line(g, 0, FLOOR + 0.5, W, FLOOR + 0.5, 'rgba(0,0,0,0.6)', 1.2);
  for (let i = 0; i < 160; i++) {
    const x = rng.next() * W, y = FLOOR + 2 + Math.pow(rng.next(), 0.8) * (H - FLOOR);
    ellipse(g, x, y, 0.5 + rng.next() * 1.4, 0.3 + rng.next() * 0.5, rgba(rng.next() < 0.6 ? '#0c0806' : '#4a3a2c', 0.5));
  }
  g.fillStyle = rad(g, 318, FLOOR + 14, 4, 318, FLOOR + 14, 110, [[0, 'rgba(255,130,50,0.22)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(0, FLOOR, W, H - FLOOR);

  // ---- tools hanging on the wall
  paintTools(g, rng);

  // ---- the hearth: brick base, stone slab, sooty hood
  // soot-black chimney back behind the fire, and the hearth's shadow on the wall
  g.fillStyle = rad(g, FIRE_X, 80, 6, FIRE_X, 80, 58, [[0, 'rgba(4,2,1,0.7)'], [0.6, 'rgba(4,2,1,0.45)'], [1, 'rgba(4,2,1,0)']]);
  g.fillRect(250, 20, 112, 100);
  g.fillStyle = lin(g, 252, 0, 270, 0, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]);
  g.fillRect(252, 100, 18, FLOOR - 98);
  brickCourses(g, 270, 101, 360, FLOOR + 4, rng);
  g.fillStyle = lin(g, 270, 0, 360, 0, [[0, 'rgba(0,0,0,0.25)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.35)']]);
  g.fillRect(270, 101, 90, FLOOR + 4 - 101);
  g.fillStyle = lin(g, 0, 101, 0, 118, [[0, 'rgba(255,120,50,0.35)'], [1, 'rgba(255,120,50,0)']]);
  g.fillRect(270, 101, 90, 17);
  // slab
  roundRect(g, 264, 96.5, 98, 6, 1.4, lin(g, 0, 96.5, 0, 102.5, [[0, '#8a6a52'], [0.4, '#5a4436'], [1, '#2a1e18']]));
  line(g, 265, 97, 360, 97, 'rgba(255,190,120,0.55)', 0.6);
  // the firepot's dark mouth
  ellipse(g, FIRE_X, FIRE_Y + 1.5, 26, 4.5, '#120a06');
  // hood
  poly(g, [256, 62, 362, 62, 340, 0, 292, 0], lin(g, 256, 0, 362, 0, [[0, '#2e2622'], [0.4, '#3a302a'], [1, '#1c1714']]));
  g.save();
  poly(g, [256, 62, 362, 62, 340, 0, 292, 0]); g.clip();
  for (let i = 0; i < 5; i++) line(g, 262 + i * 22, 62, 294 + i * 11, 0, 'rgba(0,0,0,0.3)', 0.7);
  g.fillStyle = lin(g, 0, 0, 0, 62, [[0, 'rgba(0,0,0,0.5)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(255,120,50,0.15)']]);
  g.fillRect(250, 0, 120, 62);
  g.restore();
  // the hood's iron lip
  roundRect(g, 252, 58, 112, 6, 1.5, lin(g, 0, 58, 0, 64, [[0, IRON[4]], [0.45, IRON[2]], [1, IRON[0]]]));
  for (let x = 258; x < 362; x += 13) rivet(g, x, 61, 0.9);

  // ---- the quench barrel, cut by the right edge
  paintBarrel(g, rng);

  // ---- the stump and the anvil
  paintStump(g, rng);
  paintAnvil(g, rng);

  // ---- the heat gauge
  paintGaugePlate(g);

  // ---- the shaping studs
  const { x0, gap, span } = pipLayout(strikes);
  roundRect(g, x0 - 12, 5.5, span + 24, 13, 6.5, lin(g, 0, 5.5, 0, 18.5, [[0, IRON[5]], [0.25, IRON[4]], [0.6, IRON[2]], [1, IRON[1]]]), '#0a0806', 0.6);
  line(g, x0 - 7, 6.8, x0 + span + 7, 6.8, 'rgba(230,236,242,0.35)', 0.6);
  rivet(g, x0 - 7.5, 12, 1.5, BRASS);
  rivet(g, x0 + span + 7.5, 12, 1.5, BRASS);
  for (let i = 0; i < strikes; i++) {
    const x = x0 + i * gap;
    circle(g, x, 12, 4.2, lin(g, x - 4, 8, x + 4, 16, [[0, BRASS[4]], [0.5, BRASS[2]], [1, BRASS[0]]]));
    circle(g, x, 12, 3.1, rad(g, x + 0.8, 12.8, 0.2, x, 12, 3.2, [[0, '#2a1a10'], [1, '#0c0705']]));
    ellipse(g, x + 0.9, 13.3, 1.2, 0.8, 'rgba(255,220,160,0.12)');
  }

  // ---- a soft darkening at the foot of the picture
  g.fillStyle = lin(g, 0, H - 30, 0, H, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.45)']]);
  g.fillRect(0, H - 30, W, 30);
}

function paintTools(g: Ctx, rng: RNG) {
  // a peg rail
  roundRect(g, 42, 27, 64, 5, 1.2, lin(g, 0, 27, 0, 32, [[0, '#6a4a2e'], [1, '#2e1e12']]));
  for (const x of [52, 70, 88]) { circle(g, x, 29.5, 1.5, '#1c120a'); circle(g, x - 0.3, 29.2, 0.9, '#8a6a44'); }
  // shadows first, down and to the left of the firelight
  g.save();
  g.translate(-2.5, 2.5);
  g.globalAlpha = 0.35;
  tongs(g, 52, 31, 64, true);
  smallHammer(g, 70, 31, true);
  tongs(g, 88, 31, 52, true);
  g.restore();
  tongs(g, 52, 31, 64, false);
  smallHammer(g, 70, 31, false);
  tongs(g, 88, 31, 52, false);
  void rng;
}

function tongs(g: Ctx, x: number, y: number, len: number, shadow: boolean) {
  const c0 = shadow ? '#000' : IRON[4], c1 = shadow ? '#000' : IRON[2];
  const piv = y + len * 0.78;
  // two reins hanging from the peg, crossing at the pivot, then the jaws
  g.lineWidth = 1.5;
  g.strokeStyle = shadow ? '#000' : lin(g, x - 2, 0, x + 2, 0, [[0, c0], [1, c1]]);
  g.beginPath(); g.moveTo(x - 0.8, y); g.quadraticCurveTo(x - 2.4, y + len * 0.4, x + 0.4, piv); g.lineTo(x + 2.4, y + len + 3); g.stroke();
  g.beginPath(); g.moveTo(x + 0.8, y); g.quadraticCurveTo(x + 2.4, y + len * 0.4, x - 0.4, piv); g.lineTo(x - 2.4, y + len + 3); g.stroke();
  if (!shadow) {
    circle(g, x, piv, 1.4, IRON[3]);
    circle(g, x - 0.4, piv - 0.4, 0.6, IRON[6]);
    line(g, x - 1.4, y + 3, x - 1.8, y + len * 0.5, 'rgba(210,220,230,0.35)', 0.5);
    line(g, x + 2.2, y + len * 0.2, x + 1.2, piv - 2, 'rgba(255,150,80,0.35)', 0.5);
  }
}

function smallHammer(g: Ctx, x: number, y: number, shadow: boolean) {
  const len = 36;
  // handle hanging by a leather loop
  g.strokeStyle = shadow ? '#000' : '#3a2616'; g.lineWidth = 0.8;
  g.beginPath(); g.ellipse(x, y + 2, 1.6, 2.4, 0, 0, TAU); g.stroke();
  roundRect(g, x - 1.5, y + 3.5, 3, len, 1.2, shadow ? '#000' : lin(g, x - 1.5, 0, x + 1.5, 0, [[0, '#b08a5a'], [1, '#5a3a20']]));
  roundRect(g, x - 7, y + len + 2, 14, 7, 1.2, shadow ? '#000' : lin(g, 0, y + len + 2, 0, y + len + 9, [[0, IRON[5]], [0.5, IRON[3]], [1, IRON[1]]]));
  if (!shadow) {
    line(g, x - 6, y + len + 2.8, x + 6, y + len + 2.8, 'rgba(230,236,242,0.5)', 0.5);
    line(g, x + 6.8, y + len + 3, x + 6.8, y + len + 8, 'rgba(255,140,60,0.45)', 0.6);
  }
}

function paintBarrel(g: Ctx, rng: RNG) {
  const cx = 340, top = 151, rx = 24, ry = 5.6, bot = 206;
  // shadow on the floor
  g.fillStyle = rad(g, cx - 6, top + 34, 2, cx - 6, top + 34, 36, [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(cx - 50, top + 10, 80, 50);
  // staves
  g.beginPath();
  g.moveTo(cx - rx, top); g.quadraticCurveTo(cx - rx - 3, (top + bot) / 2, cx - rx + 1, bot); g.lineTo(cx + rx - 1, bot); g.quadraticCurveTo(cx + rx + 3, (top + bot) / 2, cx + rx, top);
  g.ellipse(cx, top, rx, ry, 0, 0, Math.PI, true);
  g.closePath();
  g.fillStyle = lin(g, cx - rx, 0, cx + rx, 0, [[0, '#5a3a22'], [0.25, '#7a5232'], [0.55, '#5a3a22'], [1, '#2a1a10']]);
  g.fill();
  g.save(); g.clip();
  for (let i = 1; i < 8; i++) {
    const x = cx - rx + (i * 2 * rx) / 8;
    line(g, x, top, x + (x - cx) * 0.08, bot, 'rgba(20,12,6,0.55)', 0.6);
    line(g, x + 0.7, top, x + 0.7 + (x - cx) * 0.08, bot, 'rgba(255,200,140,0.1)', 0.4);
  }
  for (const y of [top + 10, top + 34]) {
    g.strokeStyle = lin(g, cx - rx, 0, cx + rx, 0, [[0, IRON[4]], [0.3, IRON[5]], [0.6, IRON[2]], [1, IRON[0]]]);
    g.lineWidth = 3;
    g.beginPath(); g.ellipse(cx, y, rx + 1.5, ry, 0, 0, Math.PI); g.stroke();
  }
  g.fillStyle = lin(g, 0, top, 0, bot, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]);
  g.fillRect(cx - rx - 4, top, rx * 2 + 8, bot - top);
  g.restore();
  // rim and water
  ellipse(g, cx, top, rx, ry, lin(g, cx - rx, 0, cx + rx, 0, [[0, '#9a6e44'], [1, '#4a2e1a']]));
  ellipse(g, cx, top + 0.4, rx - 2.4, ry - 1.1, lin(g, 0, top - ry, 0, top + ry, [[0, '#0a1418'], [0.6, '#18303a'], [1, '#27454e']]));
  ellipse(g, cx - 8, top - 0.4, 6, 0.9, 'rgba(200,230,240,0.25)');
  void rng;
}

function paintStump(g: Ctx, rng: RNG) {
  const x0 = 122, x1 = 244, top = 164;
  g.fillStyle = rad(g, 183, top + 6, 4, 183, top + 6, 90, [[0, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(90, top - 10, 190, 50);
  const body = () => {
    g.beginPath();
    g.moveTo(x0, top); g.bezierCurveTo(x0 - 3, top + 12, x0 - 9, top + 26, x0 - 12, 204); g.lineTo(x1 + 12, 204); g.bezierCurveTo(x1 + 9, top + 26, x1 + 3, top + 12, x1, top);
    g.closePath();
  };
  body();
  g.fillStyle = lin(g, x0 - 10, 0, x1 + 10, 0, [[0, '#3a281a'], [0.18, '#5e4230'], [0.45, '#3e2a1c'], [0.85, '#221710'], [1, '#2e1e12']]);
  g.fill();
  g.save(); body(); g.clip();
  // bark: irregular plates split by deep fissures, lit on the left
  for (let col = 0; col < 16; col++) {
    const u = col / 15, xc = lerp(x0 - 10, x1 + 10, u);
    const light = 0.5 - Math.abs(u - 0.2) * 0.9;
    for (let y = top - 2 + rng.next() * 3; y < 204; y += 6 + rng.next() * 8) {
      const w = 2.6 + rng.next() * 3.4, h = 7 + rng.next() * 9;
      const c0 = light > 0 ? lit('#5a3e2a', light * 0.45) : dim('#4a3222', -light * 0.6);
      blobPath(g, xc + (rng.next() - 0.5) * 4, y + h / 2, w / 2, h / 2, rng, 7, 0.22);
      g.fillStyle = rgba(jitterHex(c0, rng), 0.55);
      g.fill();
    }
  }
  g.strokeStyle = 'rgba(12,7,4,0.7)';
  for (let i = 0; i < 18; i++) {
    const x = x0 - 8 + rng.next() * (x1 - x0 + 16);
    g.lineWidth = 0.5 + rng.next() * 0.9;
    g.beginPath(); g.moveTo(x, top + rng.next() * 6);
    for (let y = top + 6; y < 206; y += 6) g.lineTo(x + (rng.next() - 0.5) * 2.4, y);
    g.stroke();
  }
  // an iron hoop against splitting
  g.strokeStyle = lin(g, x0, 0, x1, 0, [[0, IRON[4]], [0.25, IRON[5]], [0.7, IRON[2]], [1, IRON[0]]]);
  g.lineWidth = 3.4;
  g.beginPath(); g.moveTo(x0 - 10, 186); g.quadraticCurveTo(183, 192, x1 + 10, 186); g.stroke();
  g.strokeStyle = 'rgba(230,236,242,0.3)'; g.lineWidth = 0.6;
  g.beginPath(); g.moveTo(x0 - 9, 184.6); g.quadraticCurveTo(160, 189.8, 170, 189.9); g.stroke();
  g.fillStyle = lin(g, 0, top, 0, 204, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0.5)']]);
  g.fillRect(x0 - 14, top, x1 - x0 + 28, 40);
  g.restore();
  // end grain
  ellipse(g, 183, top, (x1 - x0) / 2, 6.5, lin(g, x0, 0, x1, 0, [[0, '#b08858'], [0.5, '#8a6640'], [1, '#5a3e24']]));
  g.strokeStyle = 'rgba(60,36,18,0.45)'; g.lineWidth = 0.5;
  for (const f of [0.35, 0.6, 0.85]) { g.beginPath(); g.ellipse(183, top, (x1 - x0) / 2 * f, 6.5 * f, 0, 0, TAU); g.stroke(); }
  g.strokeStyle = 'rgba(40,24,12,0.8)'; g.lineWidth = 1;
  g.beginPath(); g.ellipse(183, top, (x1 - x0) / 2, 6.5, 0, 0, TAU); g.stroke();
}

function jitterHex(hex: string, rng: RNG) { return mix(hex, rng.next() < 0.5 ? '#1a100a' : '#8a6a4a', rng.next() * 0.25); }

/** The anvil's silhouette, horn tip at the left. */
function anvilPath(g: Ctx) {
  g.beginPath();
  g.moveTo(46, FACE + 5);
  g.quadraticCurveTo(64, FACE + 0.4, AX0, FACE);
  g.lineTo(AX1, FACE);
  g.lineTo(AX1, FACE + 11);
  g.quadraticCurveTo(270, FACE + 12, 252, FACE + 17);
  g.bezierCurveTo(238, FACE + 22, 228, FACE + 26, 226, FACE + 33);
  g.lineTo(226, FACE + 38);
  g.bezierCurveTo(232, FACE + 43, 248, FACE + 44, 256, FACE + 45.5);
  g.lineTo(257, FACE + 48);
  g.lineTo(206, FACE + 48);
  g.quadraticCurveTo(183, FACE + 38.5, 160, FACE + 48);
  g.lineTo(109, FACE + 48);
  g.lineTo(110, FACE + 45.5);
  g.bezierCurveTo(118, FACE + 44, 134, FACE + 43, 140, FACE + 38);
  g.lineTo(140, FACE + 33);
  g.bezierCurveTo(138, FACE + 26, 122, FACE + 22, 104, FACE + 19);
  g.quadraticCurveTo(72, FACE + 14, 46, FACE + 5);
  g.closePath();
}

function paintAnvil(g: Ctx, rng: RNG) {
  // cast shadow on the stump
  ellipse(g, 186, FACE + 48, 78, 4.5, 'rgba(0,0,0,0.6)');
  anvilPath(g);
  g.fillStyle = lin(g, 0, FACE, 0, FACE + 48, [[0, IRON[4]], [0.3, IRON[3]], [0.7, IRON[2]], [1, IRON[1]]]);
  g.fill();
  g.save();
  anvilPath(g);
  g.clip();
  const glowAt = (x: number, y: number, r: number, col: string, a: number) => {
    g.fillStyle = rad(g, x, y, 0, x, y, r, [[0, rgba(col, a)], [0.55, rgba(col, a * 0.4)], [1, rgba(col, 0)]]);
    g.fillRect(x - r, y - r, r * 2, r * 2);
  };
  // modelled in soft pools: key light on the upper left, the waist turning away, firelight on the right flank
  glowAt(104, FACE + 12, 46, '#dfe6ee', 0.26);
  glowAt(64, FACE + 6, 22, '#dfe6ee', 0.2);
  glowAt(150, FACE + 40, 26, '#cfd6de', 0.1);
  glowAt(214, FACE + 34, 34, '#000000', 0.45);
  glowAt(183, FACE + 30, 22, '#000000', 0.25);
  glowAt(266, FACE + 22, 34, '#ff8a3a', 0.32);
  glowAt(246, FACE + 44, 22, '#ff8a3a', 0.2);
  // pitting and hammer marks
  for (let i = 0; i < 120; i++) ellipse(g, 50 + rng.next() * 230, FACE + 4 + rng.next() * 44, 0.3 + rng.next() * 0.8, 0.2 + rng.next() * 0.5, rgba(rng.next() < 0.6 ? '#0c0d0f' : '#9aa0a8', 0.22));
  // the face plate: a hardened band along the top
  g.fillStyle = lin(g, 0, FACE, 0, FACE + 11, [[0, IRON[5]], [0.15, IRON[4]], [0.7, IRON[3]], [1, IRON[2]]]);
  g.fillRect(AX0, FACE, AX1 - AX0, 11);
  g.fillStyle = lin(g, AX0, 0, AX1, 0, [[0, 'rgba(230,236,242,0.12)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(255,140,60,0.18)']]);
  g.fillRect(AX0, FACE, AX1 - AX0, 11);
  line(g, AX0 + 18, FACE + 11.3, AX1, FACE + 11.3, 'rgba(0,0,0,0.6)', 1);
  g.restore();
  // contour light: the horn's belly, the left flank and foot catch the key light; the right flank the fire
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(225,232,240,0.42)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(AX0 + 4, FACE + 2.4); g.quadraticCurveTo(66, FACE + 2.8, 50, FACE + 5.2); g.stroke();
  g.strokeStyle = 'rgba(225,232,240,0.22)'; g.lineWidth = 0.8;
  g.beginPath(); g.moveTo(52, FACE + 6.4); g.quadraticCurveTo(74, FACE + 13.6, 104, FACE + 19.6); g.bezierCurveTo(121, FACE + 22.4, 136, FACE + 26, 138.6, FACE + 32); g.stroke();
  g.beginPath(); g.moveTo(111, FACE + 46); g.bezierCurveTo(119, FACE + 44.6, 132, FACE + 43.4, 138.6, FACE + 39); g.stroke();
  g.strokeStyle = 'rgba(255,150,70,0.5)'; g.lineWidth = 0.9;
  g.beginPath(); g.moveTo(AX1 - 0.5, FACE + 11.5); g.quadraticCurveTo(270, FACE + 12.6, 252, FACE + 17.5); g.bezierCurveTo(238.5, FACE + 22.4, 228.8, FACE + 26.4, 227, FACE + 33); g.stroke();
  g.beginPath(); g.moveTo(227.2, FACE + 38.4); g.bezierCurveTo(233, FACE + 43.2, 247, FACE + 44.2, 255.5, FACE + 45.6); g.stroke();
  // the working face, seen just from above
  roundRect(g, AX0, FACE - 2.4, AX1 - AX0, 2.6, 0.8, lin(g, AX0, 0, AX1, 0, [[0, '#c6ccd2'], [0.35, '#9ea5ad'], [1, '#6c737b']]));
  line(g, AX0 + 2, FACE - 2.1, AX0 + 70, FACE - 2.1, 'rgba(255,255,255,0.45)', 0.5);
  // hardy and pritchel holes at the heel
  g.fillStyle = '#0e0f11';
  g.fillRect(272, FACE - 2.1, 4.2, 2);
  g.beginPath(); g.ellipse(262, FACE - 1.1, 1.3, 0.8, 0, 0, TAU); g.fill();
  anvilPath(g);
  g.strokeStyle = 'rgba(8,6,4,0.8)'; g.lineWidth = 0.7; g.stroke();
  // the timing rail, brass set into the face
  roundRect(g, R0 - 5, RAIL_Y - 1.6, R1 - R0 + 10, RAIL_H + 3.2, 2.2, lin(g, 0, RAIL_Y - 1.6, 0, RAIL_Y + RAIL_H + 1.6, [[0, BRASS[5]], [0.3, BRASS[3]], [0.7, BRASS[2]], [1, BRASS[0]]]), '#1a1208', 0.4);
  roundRect(g, R0 - 2.5, RAIL_Y, R1 - R0 + 5, RAIL_H, 1.4, lin(g, 0, RAIL_Y, 0, RAIL_Y + RAIL_H, [[0, '#070504'], [0.6, '#1c140c'], [1, '#2a1e12']]));
  for (let i = 0; i <= 10; i++) {
    const x = R0 + (i * (R1 - R0)) / 10;
    line(g, x, RAIL_Y + RAIL_H - (i % 5 === 0 ? 3 : 1.8), x, RAIL_Y + RAIL_H - 0.4, rgba(BRASS[3], 0.7), 0.4);
  }
  rivet(g, R0 - 3.4, RAIL_Y + RAIL_H / 2, 1.1, BRASS);
  rivet(g, R1 + 3.4, RAIL_Y + RAIL_H / 2, 1.1, BRASS);
}

function paintGaugePlate(g: Ctx) {
  const x0 = 3, y0 = 8, x1 = 34, y1 = 194;
  // iron backplate with a bevel
  ellipse(g, (x0 + x1) / 2 + 2, y1 - 2, 18, 5, 'rgba(0,0,0,0.4)');
  roundRect(g, x0, y0, x1 - x0, y1 - y0, 4, lin(g, x0, y0, x1, y1, [[0, IRON[4]], [0.4, IRON[3]], [1, IRON[1]]]), '#050404', 0.7);
  roundRect(g, x0 + 1.6, y0 + 1.6, x1 - x0 - 3.2, y1 - y0 - 3.2, 3, undefined, 'rgba(210,218,226,0.22)', 0.5);
  for (const [x, y] of [[x0 + 4, y0 + 4], [x1 - 4, y0 + 4], [x0 + 4, y1 - 4], [x1 - 4, y1 - 4]]) rivet(g, x, y, 1.3);
  // a flame engraved at the top
  g.save();
  g.translate((x0 + x1) / 2, y0 + 10);
  g.beginPath();
  g.moveTo(0, -5); g.quadraticCurveTo(4, -1, 2.6, 2.4); g.quadraticCurveTo(0, 4.2, -2.6, 2.4); g.quadraticCurveTo(-4, -1, 0, -5);
  g.fillStyle = lin(g, 0, -5, 0, 4, [[0, BRASS[5]], [1, BRASS[2]]]);
  g.fill();
  g.beginPath(); g.moveTo(0, -1); g.quadraticCurveTo(1.6, 1, 0.9, 2.4); g.quadraticCurveTo(0, 3, -0.9, 2.4); g.quadraticCurveTo(-1.6, 1, 0, -1);
  g.fillStyle = BRASS[0]; g.fill();
  g.restore();
  // brass surround for the tube and bulb
  const cx = TUBE_X + TUBE_W / 2;
  roundRect(g, TUBE_X - 2.2, TUBE_TOP - 4, TUBE_W + 4.4, TUBE_BOT - TUBE_TOP + 12, (TUBE_W + 4.4) / 2, lin(g, TUBE_X - 2, 0, TUBE_X + TUBE_W + 2, 0, [[0, BRASS[4]], [0.4, BRASS[3]], [1, BRASS[1]]]), '#1a1208', 0.4);
  circle(g, cx, TUBE_BOT + 13, 8.6, lin(g, cx - 8, TUBE_BOT + 5, cx + 8, TUBE_BOT + 21, [[0, BRASS[5]], [0.5, BRASS[3]], [1, BRASS[0]]]));
  // the empty glass
  roundRect(g, TUBE_X, TUBE_TOP - 2, TUBE_W, TUBE_BOT - TUBE_TOP + 14, TUBE_W / 2, lin(g, TUBE_X, 0, TUBE_X + TUBE_W, 0, [[0, '#1a1614'], [0.5, '#0c0a09'], [1, '#040303']]));
  circle(g, cx, TUBE_BOT + 13, 6.4, '#0a0808');
  // ticks and the working band
  for (let i = 0; i <= 10; i++) {
    const y = TUBE_BOT - (i / 10) * (TUBE_BOT - TUBE_TOP);
    line(g, x0 + 2.8, y, x0 + (i % 5 === 0 ? 7.6 : 6), y, rgba('#d8dde2', i % 5 === 0 ? 0.6 : 0.35), 0.5);
  }
  const b0 = TUBE_BOT - 0.9 * (TUBE_BOT - TUBE_TOP), b1 = TUBE_BOT - 0.57 * (TUBE_BOT - TUBE_TOP);
  roundRect(g, TUBE_X + TUBE_W + 1, b0 - 0.8, 2.6, b1 - b0 + 1.6, 1, lin(g, 0, b0, 0, b1, [[0, BRASS[5]], [0.5, BRASS[3]], [1, BRASS[1]]]), '#1a1208', 0.3);
  for (const y of [b0, b1]) poly(g, [TUBE_X + TUBE_W + 1, y - 1.4, TUBE_X + TUBE_W + 5, y, TUBE_X + TUBE_W + 1, y + 1.4], BRASS[4]);
  line(g, TUBE_X + TUBE_W + 4.6, TUBE_BOT - 0.92 * (TUBE_BOT - TUBE_TOP), x1 - 2, TUBE_BOT - 0.92 * (TUBE_BOT - TUBE_TOP), rgba('#fff4d8', 0.35), 0.45);
}
