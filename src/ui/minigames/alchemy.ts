// The alchemy bench: follow a recipe step by step. Pour a base, grind herbs
// in the mortar, add them, boil, and bottle. Mistakes make a Suspicious Brew.
// The bench is painted at the canvas's full display resolution: a cauldron
// over a log fire whose brew takes the colour of what goes into it, steam and
// bubbles while it boils, the mortar showing what is being ground, and an
// hourglass that turns with every boil.

import './minigames.css';
import { openScreen, el, button } from '../ui';
import { S } from '../../state';
import { RECIPES, Step, stepText, Recipe } from '../../content/recipes';
import { item } from '../../content/items';
import { iconURL } from '../../gfx/icons';
import { count, removeItem, addItem } from '../../systems/inventory';
import { addXp, hasPerk, skill } from '../../systems/stats';
import { notify, esc } from '../notify';
import { sfx } from '../../audio/sfx';
import { emit } from '../../engine/events';
import { G } from '../../G';
import { clamp, lerp, hexToRgb, rgbToHex, RNG } from '../../engine/util';
import { newCanvas, lit, dim, mix, rgba, ellipse, circle, roundRect, poly, line, blade, lin, rad, grain, blobPath, type Ctx } from '../../gfx/paint';

function sameSteps(a: Step[], b: Step[]): number {
  // returns number of mismatches (Infinity if lengths differ by more than one)
  if (Math.abs(a.length - b.length) > 1) return Infinity;
  let bad = Math.abs(a.length - b.length);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (x.op !== y.op) { bad++; continue; }
    if (x.op === 'base' && y.op === 'base' && x.liquid !== y.liquid) bad++;
    if (x.op === 'add' && y.op === 'add' && (x.herb !== y.herb || x.n !== y.n || x.ground !== y.ground)) bad++;
  }
  return bad;
}

export function openAlchemy() {
  const log: Step[] = [];
  let mortar: { herb: string; grind: number }[] = [];
  let selected: Recipe | null = RECIPES[S.recipes[0]] || null;
  let bubble = 0;
  let raf = 0;
  openScreen('alchemy', (close) => {
    const m = el('div', { cls: 'vellum mg mg-alch' });
    m.style.width = 'min(1040px, 100%)';
    m.append(el('h2', { html: 'Alchemy' }));
    m.append(el('p', { cls: 'help', html: 'Follow the recipe exactly. Herbs go into the mortar to be ground, or straight into the pot whole. Every step matters, and so does the order.' }));
    const grid = el('div', { cls: 'cols mg-alch-grid' });
    const left = el('div', { cls: 'mg-alch-recipes' }), mid = el('div', { cls: 'mg-alch-bench' }), right = el('div', { cls: 'mg-alch-herbs' });
    grid.append(left, mid, right);
    m.append(grid);
    const cv = document.createElement('canvas');
    cv.className = 'mg-scene mg-alch-scene';
    cv.width = BW; cv.height = BH;
    cv.style.aspectRatio = `${BW} / ${BH}`;
    const scene = new Bench(cv);
    const render = () => {
      // recipes
      left.innerHTML = '<h3>Recipes you know</h3>';
      if (!S.recipes.length) left.append(el('p', { html: '<i>You know no recipes. Someone must teach you, or you must read one.</i>' }));
      for (const id of S.recipes) {
        const r = RECIPES[id];
        if (!r) continue;
        const b = button(esc(r.name), () => { selected = r; render(); }, 'quest-item' + (selected === r ? ' sel' : ''));
        left.append(b);
      }
      if (selected) {
        const ol = el('ol');
        ol.style.paddingLeft = '18px';
        selected.steps.forEach((s, i) => {
          const li = el('li', { html: esc(stepText(s)) });
          if (i < log.length) li.style.color = sameSteps(log.slice(0, i + 1), selected!.steps.slice(0, i + 1)) === 0 ? 'var(--linden)' : 'var(--madder)';
          ol.append(li);
        });
        left.append(el('h3', { html: esc(selected.name) }), ol);
      }
      // bench
      mid.innerHTML = '<h3>The cauldron</h3>';
      mid.append(cv);
      const base = log.find((s) => s.op === 'base') as { op: 'base'; liquid: string } | undefined;
      const boils = log.filter((s) => s.op === 'boil').length;
      mid.append(el('p', { cls: 'meta', html: `Base: ${base ? base.liquid : 'empty'} · Boiled ${boils}× · Steps taken: ${log.length}` }));
      const acts = el('div', { cls: 'actions' });
      acts.append(
        button('Pour water', () => { if (log.length) { notify('Empty the cauldron first.', 'bad', 1500); return; } log.push({ op: 'base', liquid: 'water' }); sfx('splash'); render(); }),
        button(`Pour wine (${count('wine')})`, () => { if (log.length) { notify('Empty the cauldron first.', 'bad', 1500); return; } if (!count('wine')) { notify('You have no wine.', 'bad', 1500); return; } removeItem('wine', 1); log.push({ op: 'base', liquid: 'wine' }); sfx('splash'); render(); }),
        button('Boil', () => { if (!base) { notify('Pour a base first.', 'bad', 1500); return; } log.push({ op: 'boil' }); bubble = 2.5; sfx('fire'); render(); }),
        button('Bottle it', () => bottle(close), 'btn primary'),
        button('Empty the pot', () => { log.length = 0; mortar = []; render(); }),
      );
      mid.append(acts);
      // mortar
      const mt = el('div', { cls: 'perk' });
      mt.append(el('b', { html: 'Mortar & pestle' }));
      if (!mortar.length) mt.append(el('p', { html: '<i>Empty.</i>' }));
      else {
        mt.append(el('p', { html: mortar.map((x) => `${esc(item(x.herb).name)} ${x.grind >= 3 ? '(ground)' : '(' + '·'.repeat(x.grind) + ')'}`).join(', ') }));
        const ma = el('div', { cls: 'actions' });
        ma.append(button('Grind', () => { for (const x of mortar) x.grind = Math.min(3, x.grind + (hasPerk('steady_mortar') ? 2 : 1)); sfx('dice'); render(); }));
        ma.append(button('Add to cauldron', () => {
          if (!base) { notify('Pour a base first.', 'bad', 1500); return; }
          if (mortar.some((x) => x.grind < 3)) { notify('Grind it properly first.', 'bad', 1500); return; }
          for (const x of mortar) pushAdd(x.herb, true);
          mortar = [];
          sfx('splash');
          render();
        }));
        mt.append(ma);
      }
      mid.append(mt);
      // herbs
      right.innerHTML = '<h3>Your herbs</h3>';
      const herbs = S.inv.filter((s) => item(s.id).cat === 'herb');
      if (!herbs.length) right.append(el('p', { html: '<i>You carry no herbs.</i>' }));
      for (const s of herbs) {
        const d = item(s.id);
        const r = el('div', { cls: 'inv-row' });
        r.innerHTML = `<img src="${iconURL(d.icon)}" alt=""><span class="nm">${esc(d.name)}</span><span class="n">×${s.n}</span>`;
        const btns = el('span', { cls: 'actions' });
        btns.append(
          button('Mortar', () => { if (!count(s.id)) return; removeItem(s.id, 1); mortar.push({ herb: s.id, grind: 0 }); render(); }, 'btn'),
          button('Pot', () => { if (!base) { notify('Pour a base first.', 'bad', 1500); return; } if (!count(s.id)) return; removeItem(s.id, 1); pushAdd(s.id, false); sfx('splash'); render(); }, 'btn'),
        );
        r.append(btns);
        right.append(r);
      }
    };
    const pushAdd = (herb: string, ground: boolean) => {
      const last = log[log.length - 1];
      if (last && last.op === 'add' && last.herb === herb && last.ground === ground) last.n++;
      else log.push({ op: 'add', herb, n: 1, ground });
    };
    const bottle = (close: () => void) => {
      if (!log.length) { notify('The cauldron is empty.', 'bad', 1500); return; }
      const done = [...log, { op: 'bottle' } as Step];
      let best: Recipe | null = null, bestBad = Infinity;
      for (const r of Object.values(RECIPES)) {
        const bad = sameSteps(done, r.steps);
        if (bad < bestBad) { bestBad = bad; best = r; }
      }
      const allowed = hasPerk('steady_mortar') ? 1 : 0;
      S.minutes += 20;
      if (best && bestBad <= allowed && skill('alchemy') + 1 >= best.level) {
        let n = best.yields || 1;
        if (hasPerk('double_brew') && Math.random() < 0.3) n++;
        addItem(best.result, n);
        if (!S.recipes.includes(best.id)) { S.recipes.push(best.id); notify(`You discovered <b>${best.name}</b>.`, 'skill'); }
        addXp('alchemy', 6 + best.level * 3);
        sfx('quest_done');
        emit('brewed', best.result);
      } else {
        addItem('suspicious_brew', 1);
        addXp('alchemy', 1);
        sfx('fail');
        notify('That did not go as planned.', 'bad');
      }
      log.length = 0;
      mortar = [];
      render();
    };
    let last = performance.now();
    const draw = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (bubble > 0) bubble -= 1 / 60;
      scene.draw({ log, mortar, bubble }, dt);
      if (G.mode === 'menu' && cv.isConnected) raf = requestAnimationFrame(draw);
    };
    render();
    raf = requestAnimationFrame(draw);
    void raf;
    return m;
  });
}

// ================================================================ the bench

const BW = 320, BH = 220;
const TAU = Math.PI * 2;
const PX = 160;                        // the cauldron's centre line
const RIM_Y = 104, RIM_RX = 53, RIM_RY = 16, MOUTH_RX = 46, MOUTH_RY = 12.6;
const SURF_Y = 107;
const MORTAR_X = 50, MORTAR_Y = 150;   // centre of the mortar's mouth
const GLASS_X = 294, GLASS_Y = 147;    // the hourglass's centre

const IRON = ['#121315', '#1d1f23', '#2b2e33', '#3e4248', '#585d64', '#7d838b', '#b4bac1'];

interface BenchView { log: Step[]; mortar: { herb: string; grind: number }[]; bubble: number }
interface Mote { x: number; y: number; vx: number; vy: number; l: number; l0: number; r: number; col: string; kind: 'steam' | 'drop' | 'ember' | 'bubble' | 'ring' | 'puff' }
interface Bit { x: number; y: number; ang: number; sp: number; rad: number; kind: number; c1: string; c2: string; seed: number; boils: number; ground: boolean }

const smoothstep = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lum = (hex: string) => { const [r, g, b] = hexToRgb(hex); return (0.3 * r + 0.59 * g + 0.11 * b) / 255; };

/** Matches the canvas's backing store to its displayed size x devicePixelRatio (capped at 2); returns device pixels per logical unit. */
function fitCanvas(c: HTMLCanvasElement, W: number, H: number): number {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bw = Math.max(1, Math.round((c.clientWidth || W) * dpr));
  const bh = Math.max(1, Math.round((bw * H) / W));
  if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
  return bw / W;
}

/** The colour a herb lends to a brew (flowers give their petals' colour). */
function herbTint(id: string): [string, string] {
  const ic = item(id).icon;
  const c1 = ic.c1 || '#6a8a3a', c2 = ic.c2 || dim(c1, 0.3);
  return [lum(c1) > 0.78 ? mix(c1, c2, 0.6) : c1, c2];
}

/** The brew's colour after the steps so far, or null for an empty pot. */
function brewColour(log: Step[]): string | null {
  const base = log.find((s) => s.op === 'base') as { op: 'base'; liquid: string } | undefined;
  if (!base) return null;
  let col = base.liquid === 'wine' ? '#5c1426' : '#3b6f86';
  for (const s of log) {
    if (s.op === 'add') {
      const [tint] = herbTint(s.herb);
      col = mix(col, tint, 1 - Math.pow(1 - (s.ground ? 0.36 : 0.15), s.n));
    } else if (s.op === 'boil') {
      // boiling steeps it: deeper, a little toward amber
      col = mix(mix(col, dim(col, 0.35), 0.25), '#7a5420', 0.08);
    }
  }
  return saturate(col, 1.35);
}

/** Pushes a colour's saturation up (k > 1) or down, keeping its lightness. */
function saturate(hex: string, k: number): string {
  const [r, g, b] = hexToRgb(hex);
  const l = (Math.max(r, g, b) + Math.min(r, g, b)) / 2;
  return rgbToHex([clamp(l + (r - l) * k, 0, 255), clamp(l + (g - l) * k, 0, 255), clamp(l + (b - l) * k, 0, 255)]);
}

class Bench {
  private g: Ctx;
  private back: HTMLCanvasElement | null = null;
  private front: HTMLCanvasElement | null = null;
  private k = 0;
  private t = 0;
  private motes: Mote[] = [];
  private bits: Bit[] = [];
  private col: [number, number, number] | null = null;
  private fill = 0;                 // 0 empty .. 1 full, eased
  private lastSig = '';
  private lastBase = '';
  private lastBoils = 0;
  private lastGrind = 0;
  private grindT = 0;
  private flipT = -1;
  private sand = 0;                 // sand left in the upper bulb, 0..1
  private swirl = 0;
  private cloud: { col: string; l: number } | null = null;

  constructor(private c: HTMLCanvasElement) {
    this.g = c.getContext('2d')!;
  }

  draw(v: BenchView, dt: number) {
    const { c, g } = this;
    this.t += dt;
    const t = this.t;
    const k = fitCanvas(c, BW, BH);
    if (!this.back || this.k !== k || this.back.width !== c.width) {
      this.k = k;
      this.back = newCanvas(c.width, c.height);
      this.front = newCanvas(c.width, c.height);
      const bg = this.back.getContext('2d')!, fg = this.front.getContext('2d')!;
      for (const x of [bg, fg]) { x.setTransform(k, 0, 0, k, 0, 0); x.lineCap = 'round'; x.lineJoin = 'round'; }
      paintBack(bg);
      grain(this.back, 7, 29);
      paintFront(fg);
      grain(this.front, 6, 31);
    }
    this.events(v);
    const target = brewColour(v.log);
    const boiling = v.bubble > 0;
    const heat = boiling ? 1 : target ? 0.55 : 0.4;
    // ease the brew's colour and level toward what's in the pot
    if (target) {
      const tc = hexToRgb(target);
      if (!this.col) this.col = [tc[0], tc[1], tc[2]];
      const a = 1 - Math.exp(-dt * 2.2);
      this.col = [lerp(this.col[0], tc[0], a), lerp(this.col[1], tc[1], a), lerp(this.col[2], tc[2], a)];
    }
    this.fill = clamp(this.fill + (target ? dt * 1.6 : -dt * 2.4), 0, 1);
    if (this.fill <= 0) this.col = null;
    const brew = this.col ? rgbToHex(this.col) : null;
    this.swirl += dt * (boiling ? 1.4 : 0.25);
    const flick = 0.9 + Math.sin(t * 9.1) * 0.05 + Math.sin(t * 14.3 + 2) * 0.04 + Math.sin(t * 3.3) * 0.03;

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.drawImage(this.back!, 0, 0, BW, BH);

    this.drawFire(g, heat, flick, t, false);
    this.drawMouth(g, brew, v, t, boiling);
    g.drawImage(this.front!, 0, 0, BW, BH);
    this.drawFire(g, heat, flick, t, true);
    // firelight on the belly and the room
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rad(g, PX, 206, 4, PX, 196, 90, [[0, rgba('#ff9a40', 0.32 * heat * flick)], [0.5, rgba('#ff7a2a', 0.1 * heat)], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(0, 100, BW, BH - 100);
    g.fillStyle = rad(g, PX, 200, 10, PX, 170, 240, [[0, rgba('#ffb060', 0.07 * heat * flick)], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(0, 0, BW, BH);
    g.restore();
    this.updateMotes(g, dt, v, brew, boiling);
    this.drawMortar(g, v, dt, t);
    this.drawHourglass(g, v, dt);

    // vignette
    g.fillStyle = rad(g, BW * 0.5, BH * 0.6, BH * 0.35, BW * 0.5, BH * 0.6, BW * 0.66, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(10,6,3,0.5)']]);
    g.fillRect(0, 0, BW, BH);
  }

  // ------------------------------------------------ what just happened

  private events(v: BenchView) {
    const base = v.log.find((s) => s.op === 'base') as { op: 'base'; liquid: string } | undefined;
    const baseKey = base ? base.liquid : '';
    const sig = v.log.map((s) => (s.op === 'add' ? `a${s.herb}${s.n}${s.ground ? 'g' : ''}` : s.op[0])).join('|');
    const boils = v.log.filter((s) => s.op === 'boil').length;
    if (baseKey && !this.lastBase) this.splash(18, true);
    if (!baseKey && this.lastBase) { this.bits = []; this.cloud = null; }
    if (sig !== this.lastSig && sig.length > this.lastSig.length && baseKey && this.lastBase) {
      const lastStep = v.log[v.log.length - 1];
      if (lastStep && lastStep.op === 'add') {
        this.splash(10, false);
        if (lastStep.ground) this.cloud = { col: herbTint(lastStep.herb)[0], l: 1.8 };
      }
    }
    if (boils > this.lastBoils) { this.flipT = 0; }
    if (!v.log.length) { this.sand = 0; this.flipT = -1; }
    this.lastBase = baseKey;
    this.lastSig = sig;
    this.lastBoils = boils;
    // rebuild the whole herbs floating on the surface
    const want: Bit[] = [];
    let idx = 0;
    v.log.forEach((s, si) => {
      if (s.op !== 'add' || s.ground) return;
      const boilsAfter = v.log.slice(si + 1).filter((x) => x.op === 'boil').length;
      const [c1, c2] = [item(s.herb).icon.c1 || '#6a8a3a', item(s.herb).icon.c2 || '#4a6a2a'];
      for (let i = 0; i < Math.min(3, s.n) * 2; i++) {
        const rng = new RNG(si * 31 + i * 7 + 3);
        const old = this.bits[idx];
        want.push(old && old.seed === si * 100 + i ? { ...old, boils: boilsAfter } : {
          x: 0, y: 0, ang: rng.next() * TAU, sp: (rng.next() - 0.5) * 0.5, rad: 0.25 + rng.next() * 0.6, kind: i % 3, c1, c2, seed: si * 100 + i, boils: boilsAfter, ground: false,
        });
        idx++;
      }
    });
    this.bits = want.slice(0, 14);
    // the mortar
    const grind = v.mortar.reduce((a, x) => a + x.grind, 0);
    if (grind > this.lastGrind) {
      this.grindT = 0.6;
      for (let i = 0; i < 8; i++) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 2;
        const col = v.mortar.length ? herbTint(v.mortar[Math.floor(Math.random() * v.mortar.length)].herb)[0] : '#8a9a6a';
        this.motes.push({ x: MORTAR_X + (Math.random() - 0.5) * 18, y: MORTAR_Y - 1, vx: Math.cos(a) * 14, vy: Math.sin(a) * 18, l: 0.7, l0: 0.7, r: 1.5 + Math.random() * 2, col, kind: 'puff' });
      }
    }
    this.lastGrind = grind;
  }

  private splash(n: number, big: boolean) {
    const col = this.col ? rgbToHex(this.col) : '#3b6f86';
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6, s = (big ? 40 : 28) + Math.random() * (big ? 50 : 30);
      this.motes.push({ x: PX + (Math.random() - 0.5) * (big ? 40 : 16), y: SURF_Y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 0.8, l0: 0.8, r: 0.8 + Math.random() * 1.1, col, kind: 'drop' });
    }
    for (let i = 0; i < (big ? 3 : 2); i++) this.motes.push({ x: PX + (Math.random() - 0.5) * 10, y: SURF_Y + 1, vx: 0, vy: 0, l: 1 + i * 0.25, l0: 1 + i * 0.25, r: 2 + i * 3, col: '#ffffff', kind: 'ring' });
  }

  // ------------------------------------------------ fire

  private drawFire(g: Ctx, heat: number, flick: number, t: number, front: boolean) {
    g.save();
    g.globalCompositeOperation = 'lighter';
    if (!front) {
      g.fillStyle = rad(g, PX, 202, 2, PX, 202, 70, [[0, rgba('#ffc060', 0.55 * flick)], [0.35, rgba('#ff7a2a', 0.25 * heat)], [1, 'rgba(0,0,0,0)']]);
      g.beginPath(); g.ellipse(PX, 200, 74, 34, 0, 0, TAU); g.fill();
    }
    const n = front ? 5 : 10;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const ph = t * (6 + (i % 4) * 1.5) + i * 2.1 + (front ? 1.3 : 0);
      const spread = front ? 58 : 96;
      const x = PX - spread / 2 + u * spread + Math.sin(t * 3 + i) * 1.2;
      const edge = 1 - Math.abs(u - 0.5) * 1.3;
      const h = (front ? 12 : 22 + 18 * heat) * (0.55 + 0.45 * Math.sin(ph)) * (0.5 + 0.5 * edge) * (0.7 + heat * 0.5);
      const w = (front ? 3.2 : 5) * (0.8 + 0.2 * Math.sin(ph * 1.4));
      flameTongue(g, x, front ? 210 : 206, w, h, Math.sin(t * 2.3 + i) * 2.4, front ? 0.55 : 0.7);
    }
    g.restore();
    if (!front && Math.random() < 0.02 + heat * 0.05) {
      this.motes.push({ x: PX + (Math.random() - 0.5) * 60, y: 196, vx: (Math.random() - 0.5) * 12, vy: -24 - Math.random() * 30, l: 1 + Math.random(), l0: 2, r: 0.35 + Math.random() * 0.35, col: '#ffb050', kind: 'ember' });
    }
  }

  // ------------------------------------------------ the brew

  private drawMouth(g: Ctx, brew: string | null, v: BenchView, t: number, boiling: boolean) {
    g.save();
    g.beginPath(); g.ellipse(PX, RIM_Y + 0.6, MOUTH_RX, MOUTH_RY, 0, 0, TAU); g.clip();
    // the pot's dark inside; the far wall catches a little firelight
    g.fillStyle = lin(g, 0, RIM_Y - MOUTH_RY, 0, RIM_Y + MOUTH_RY, [[0, '#2a2622'], [0.45, '#0c0a09'], [1, '#050404']]);
    g.fillRect(PX - MOUTH_RX, RIM_Y - MOUTH_RY, MOUTH_RX * 2, MOUTH_RY * 2 + 2);
    if (brew && this.fill > 0) {
      const f = smoothstep(0, 1, this.fill);
      const sy = lerp(RIM_Y + 8, SURF_Y, f);
      const rx = MOUTH_RX - 1, ry = MOUTH_RY * 0.94;
      g.globalAlpha = Math.min(1, this.fill * 1.5);
      // the surface: deeper at the far edge (reflecting the dark pot), lit near the front
      g.fillStyle = lin(g, 0, sy - ry, 0, sy + ry, [[0, dim(brew, 0.5)], [0.35, dim(brew, 0.15)], [0.75, brew], [1, lit(brew, 0.2)]]);
      g.beginPath(); g.ellipse(PX, sy, rx, ry, 0, 0, TAU); g.fill();
      // a slow swirl of lighter and darker streaks
      g.save();
      g.translate(PX, sy); g.scale(1, ry / rx);
      for (let i = 0; i < 3; i++) {
        const a0 = this.swirl + (i * TAU) / 3;
        g.strokeStyle = rgba(lit(brew, 0.45), 0.18);
        g.lineWidth = 2.2;
        g.beginPath(); g.arc(0, 0, rx * (0.35 + i * 0.18), a0, a0 + 1.4); g.stroke();
        g.strokeStyle = rgba(dim(brew, 0.45), 0.2);
        g.beginPath(); g.arc(0, 0, rx * (0.45 + i * 0.16), a0 + 2.2, a0 + 3.2); g.stroke();
      }
      g.restore();
      // a ground herb clouding into it
      if (this.cloud) {
        const c = this.cloud;
        c.l -= 1 / 60;
        const a = clamp(c.l / 1.8, 0, 1);
        g.save();
        g.translate(PX, sy); g.scale(1, ry / rx);
        for (let i = 0; i < 6; i++) {
          const ang = this.swirl * 2 + i;
          const r = (1 - a) * rx * 0.7 * (0.4 + (i % 3) * 0.3);
          const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
          g.fillStyle = rad(g, x, y, 0, x, y, 10 + (1 - a) * 12, [[0, rgba(c.col, 0.5 * a)], [1, rgba(c.col, 0)]]);
          g.beginPath(); g.arc(x, y, 10 + (1 - a) * 12, 0, TAU); g.fill();
        }
        g.restore();
        if (c.l <= 0) this.cloud = null;
      }
      // whole herbs floating round
      for (const b of this.bits) {
        b.ang += b.sp * (boiling ? 3 : 1) / 60;
        const bob = Math.sin(t * 2 + b.seed) * 0.4;
        const x = PX + Math.cos(b.ang) * rx * b.rad, y = sy + Math.sin(b.ang) * ry * b.rad + bob;
        const cooked = clamp(b.boils * 0.35, 0, 0.7);
        const c1 = mix(b.c1, '#4a3a1a', cooked), c2 = mix(b.c2, '#3a2a12', cooked);
        floatingHerb(g, x, y, b.kind, c1, c2, b.ang * 0.7 + b.seed);
      }
      // bubbling: a rolling surface
      if (boiling) {
        const n = 7;
        for (let i = 0; i < n; i++) {
          const ph = (t * 1.6 + i * 0.37) % 1;
          const rng = new RNG(i * 13 + Math.floor(t * 1.6 + i * 0.37) * 7);
          const bx = PX + (rng.next() - 0.5) * rx * 1.6, by = sy + (rng.next() - 0.5) * ry * 1.4;
          const r = 1 + ph * 3.2;
          if (ph < 0.85) {
            ellipse(g, bx, by, r, r * 0.8, rad(g, bx - r * 0.3, by - r * 0.4, 0.1, bx, by, r, [[0, rgba(lit(brew, 0.7), 0.9)], [0.6, rgba(lit(brew, 0.25), 0.7)], [1, rgba(dim(brew, 0.3), 0.8)]]));
            ellipse(g, bx - r * 0.35, by - r * 0.35, r * 0.28, r * 0.2, 'rgba(255,255,255,0.7)');
          } else {
            g.strokeStyle = rgba(lit(brew, 0.6), (1 - ph) * 5);
            g.lineWidth = 0.6;
            g.beginPath(); g.ellipse(bx, by, r * 1.4, r * 1.1, 0, 0, TAU); g.stroke();
          }
        }
      } else if (Math.sin(t * 0.9) > 0.97) {
        // a lazy simmer bubble now and then
        const bx = PX + Math.sin(t * 7) * rx * 0.5, by = sy + Math.cos(t * 5) * ry * 0.4;
        ellipse(g, bx, by, 1.4, 1.1, rgba(lit(brew, 0.5), 0.7));
      }
      // the firelight's glint on the liquid
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rad(g, PX - rx * 0.35, sy - ry * 0.25, 0, PX - rx * 0.35, sy - ry * 0.25, rx * 0.5, [[0, rgba('#fff4e0', 0.22)], [1, 'rgba(0,0,0,0)']]);
      g.beginPath(); g.ellipse(PX - rx * 0.35, sy - ry * 0.25, rx * 0.5, ry * 0.45, 0, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
    // the rim's shadow falls across the far part of the mouth
    g.fillStyle = lin(g, 0, RIM_Y - MOUTH_RY, 0, RIM_Y - MOUTH_RY + 5, [[0, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(PX - MOUTH_RX, RIM_Y - MOUTH_RY, MOUTH_RX * 2, 5);
    g.restore();
    void v;
  }

  private updateMotes(g: Ctx, dt: number, v: BenchView, brew: string | null, boiling: boolean) {
    // steam rises while there is anything in the pot, billowing when it boils
    if (brew && this.fill > 0.5) {
      const rate = boiling ? 26 : 3.5;
      if (Math.random() < dt * rate) {
        const l = boiling ? 1.6 + Math.random() * 1.2 : 2.2 + Math.random() * 1.4;
        this.motes.push({ x: PX + (Math.random() - 0.5) * 70, y: SURF_Y - 2, vx: (Math.random() - 0.5) * 8, vy: -(boiling ? 20 : 9) - Math.random() * (boiling ? 16 : 6), l, l0: l, r: boiling ? 4 + Math.random() * 5 : 3 + Math.random() * 3, col: mix('#f6f3ee', brew, 0.1), kind: 'steam' });
      }
      if (boiling && Math.random() < dt * 8) {
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.2, s = 20 + Math.random() * 25;
        this.motes.push({ x: PX + (Math.random() - 0.5) * 60, y: SURF_Y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, l: 0.6, l0: 0.6, r: 0.6 + Math.random() * 0.7, col: brew, kind: 'drop' });
      }
    }
    for (let i = this.motes.length - 1; i >= 0; i--) {
      const m = this.motes[i];
      m.l -= dt;
      if (m.l <= 0) { this.motes.splice(i, 1); continue; }
      const a = m.l / m.l0;
      if (m.kind === 'steam') {
        m.x += (m.vx + Math.sin(this.t * 1.5 + i) * 6) * dt; m.y += m.vy * dt; m.r += dt * 5;
        const fade = a * smoothstep(0, 0.3, m.l0 - m.l);
        g.fillStyle = rad(g, m.x, m.y, 0, m.x, m.y, m.r, [[0, rgba(m.col, 0.32 * fade)], [0.55, rgba(m.col, 0.15 * fade)], [1, rgba(m.col, 0)]]);
        g.beginPath(); g.arc(m.x, m.y, m.r, 0, TAU); g.fill();
      } else if (m.kind === 'drop') {
        m.x += m.vx * dt; m.y += m.vy * dt; m.vy += 200 * dt;
        if (m.y > SURF_Y + 2 && m.vy > 0 && Math.abs(m.x - PX) < MOUTH_RX) { this.motes.splice(i, 1); continue; }
        circle(g, m.x, m.y, m.r, rgba(lit(m.col, 0.25), 0.9));
        circle(g, m.x - m.r * 0.3, m.y - m.r * 0.3, m.r * 0.35, 'rgba(255,255,255,0.6)');
      } else if (m.kind === 'ring') {
        const p = 1 - a;
        g.save();
        g.beginPath(); g.ellipse(PX, RIM_Y + 0.6, MOUTH_RX, MOUTH_RY, 0, 0, TAU); g.clip();
        g.strokeStyle = `rgba(255,255,255,${0.35 * a})`;
        g.lineWidth = 0.8;
        g.beginPath(); g.ellipse(m.x, m.y, m.r + p * 30, (m.r + p * 30) * 0.27, 0, 0, TAU); g.stroke();
        g.restore();
      } else if (m.kind === 'ember') {
        m.x += (m.vx + Math.sin(this.t * 3 + i) * 10) * dt; m.y += m.vy * dt;
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = rgba('#ffc070', 0.9 * a);
        g.beginPath(); g.arc(m.x, m.y, m.r, 0, TAU); g.fill();
        g.fillStyle = rad(g, m.x, m.y, 0, m.x, m.y, m.r * 5, [[0, rgba('#ff8a3a', 0.25 * a)], [1, 'rgba(0,0,0,0)']]);
        g.beginPath(); g.arc(m.x, m.y, m.r * 5, 0, TAU); g.fill();
        g.restore();
      } else if (m.kind === 'puff') {
        m.x += m.vx * dt; m.y += m.vy * dt; m.vy += 30 * dt; m.r += dt * 4;
        g.fillStyle = rad(g, m.x, m.y, 0, m.x, m.y, m.r, [[0, rgba(m.col, 0.45 * a)], [1, rgba(m.col, 0)]]);
        g.beginPath(); g.arc(m.x, m.y, m.r, 0, TAU); g.fill();
      }
    }
    void v;
  }

  // ------------------------------------------------ mortar, hourglass, tally

  private drawMortar(g: Ctx, v: BenchView, dt: number, t: number) {
    this.grindT = Math.max(0, this.grindT - dt);
    const x = MORTAR_X, y = MORTAR_Y;
    if (v.mortar.length) {
      g.save();
      g.beginPath(); g.ellipse(x, y + 0.5, 19.5, 5, 0, 0, TAU); g.clip();
      const grind = v.mortar.reduce((a, m) => a + Math.min(3, m.grind), 0) / (v.mortar.length * 3);
      const cols = v.mortar.map((m) => herbTint(m.herb));
      const rng = new RNG(v.mortar.length * 17 + 5);
      // a heap that settles lower and smoother as it is ground
      const heapH = lerp(5.5, 3, grind);
      const mixCol = cols.reduce((a, [c]) => mix(a, c, 0.5), cols[0][0]);
      ellipse(g, x, y + 2.5, 15, heapH, lin(g, 0, y - heapH, 0, y + 4, [[0, lit(mixCol, 0.25)], [1, dim(mixCol, 0.45)]]));
      if (grind < 0.99) {
        // leaves and bits, fewer and smaller as they break down
        const n = Math.round(lerp(14, 5, grind));
        for (let i = 0; i < n; i++) {
          const [c1, c2] = cols[i % cols.length];
          const px = x + (rng.next() - 0.5) * 26, py = y + (rng.next() - 0.3) * 5;
          const len = lerp(7, 2.4, grind) * (0.6 + rng.next() * 0.6);
          blade(g, px, py, len, -Math.PI / 2 + (rng.next() - 0.5) * 2.4, (rng.next() - 0.5) * 2, lerp(2.6, 1.2, grind), rng.next() < 0.5 ? c1 : c2);
        }
      }
      if (grind > 0.3) {
        for (let i = 0; i < 40; i++) {
          const [c1] = cols[i % cols.length];
          ellipse(g, x + (rng.next() - 0.5) * 28, y + 1 + (rng.next() - 0.5) * 5, 0.5, 0.35, rgba(rng.next() < 0.5 ? lit(c1, 0.3) : dim(c1, 0.35), 0.8 * grind));
        }
      }
      g.restore();
    }
    // the pestle, circling while it grinds
    const gr = this.grindT > 0 ? Math.sin((0.6 - this.grindT) * 22) : 0;
    const tipX = x + 5 + gr * 5, tipY = y + 1 + Math.abs(gr) * 0.6;
    const ang = -1.05 + gr * 0.12;
    const L = 34;
    const ex = tipX + Math.cos(ang) * L, ey = tipY + Math.sin(ang) * L;
    g.save();
    g.beginPath(); g.rect(0, 0, BW, y + 6); g.rect(x + 18, 0, 60, BH); g.clip();
    line(g, tipX + 2, tipY + 2, ex + 2, ey + 3, 'rgba(0,0,0,0.3)', 5);
    const nx = -Math.sin(ang), ny = Math.cos(ang);
    g.beginPath();
    g.moveTo(tipX + nx * 3.4, tipY + ny * 3.4);
    g.quadraticCurveTo(tipX - Math.cos(ang) * 4, tipY - Math.sin(ang) * 4, tipX - nx * 3.4, tipY - ny * 3.4);
    g.lineTo(ex - nx * 1.8, ey - ny * 1.8);
    g.quadraticCurveTo(ex + Math.cos(ang) * 2.4, ey + Math.sin(ang) * 2.4, ex + nx * 1.8, ey + ny * 1.8);
    g.closePath();
    g.fillStyle = lin(g, tipX - nx * 3, tipY - ny * 3, tipX + nx * 3, tipY + ny * 3, [[0, '#d8c6a4'], [0.45, '#b09470'], [1, '#6a543a']]);
    g.fill();
    g.strokeStyle = 'rgba(30,20,10,0.5)'; g.lineWidth = 0.4; g.stroke();
    line(g, tipX - nx * 1.6 + Math.cos(ang) * 4, tipY - ny * 1.6 + Math.sin(ang) * 4, ex - nx * 0.8, ey - ny * 0.8, 'rgba(255,248,230,0.45)', 0.6);
    g.restore();
    void t;
  }

  private drawHourglass(g: Ctx, v: BenchView, dt: number) {
    let rot = 0;
    if (this.flipT >= 0) {
      this.flipT += dt / 0.4;
      if (this.flipT >= 1) { this.flipT = -1; this.sand = 1; }
      else rot = Math.PI * (0.5 - 0.5 * Math.cos(Math.PI * this.flipT));
    }
    if (this.flipT < 0 && this.sand > 0) this.sand = Math.max(0, this.sand - dt / 2.2);
    const top = this.flipT >= 0 ? 0 : this.sand, bottom = this.flipT >= 0 ? 1 : 1 - this.sand;
    const x = GLASS_X, y = GLASS_Y, h = 17, w = 8.5;
    ellipse(g, x + 2, y + h + 4.5, 13, 2.4, 'rgba(0,0,0,0.4)');
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    // glass bulbs
    const bulb = (s: number) => {
      g.beginPath();
      g.moveTo(-w, s * (h - 1.5));
      g.bezierCurveTo(-w, s * (h * 0.4), -1.2, s * 3, -0.9, 0);
      g.lineTo(0.9, 0);
      g.bezierCurveTo(1.2, s * 3, w, s * (h * 0.4), w, s * (h - 1.5));
      g.closePath();
    };
    for (const s of [-1, 1]) { bulb(s); g.fillStyle = 'rgba(200,220,230,0.14)'; g.fill(); }
    // sand
    const sandCol = '#d8b870';
    if (top > 0.01) {
      g.save(); bulb(-1); g.clip();
      const lvl = -2 - (h - 3.5) * Math.sqrt(top);
      g.fillStyle = lin(g, 0, lvl, 0, 0, [[0, lit(sandCol, 0.2)], [1, dim(sandCol, 0.2)]]);
      g.fillRect(-w, lvl, w * 2, -lvl);
      g.restore();
    }
    if (bottom > 0.01) {
      g.save(); bulb(1); g.clip();
      const hh = (h - 3) * Math.sqrt(bottom);
      g.fillStyle = lin(g, 0, h - hh, 0, h, [[0, lit(sandCol, 0.15)], [1, dim(sandCol, 0.25)]]);
      g.beginPath(); g.moveTo(-w, h); g.lineTo(-w, h - hh * 0.55); g.quadraticCurveTo(0, h - hh * 1.2, w, h - hh * 0.55); g.lineTo(w, h); g.closePath(); g.fill();
      g.restore();
    }
    if (this.flipT < 0 && top > 0.01) line(g, 0, 0, 0, h - 2 - (h - 3) * Math.sqrt(bottom) * 0.8, rgba(sandCol, 0.9), 0.5);
    for (const s of [-1, 1]) {
      bulb(s);
      g.strokeStyle = 'rgba(230,240,245,0.45)'; g.lineWidth = 0.5; g.stroke();
      g.save(); bulb(s); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(-w + 1.4, s < 0 ? -h + 2 : 4, 1.2, h - 7);
      g.restore();
    }
    // the wooden frame
    for (const s of [-1, 1]) roundRect(g, -w - 3, s * h - (s < 0 ? 3 : 0), w * 2 + 6, 3, 1, lin(g, 0, s * h - 2, 0, s * h + 2, [[0, '#9a6a3e'], [1, '#4a2e18']]));
    for (const px of [-w - 1.6, w + 1.6]) roundRect(g, px - 0.9, -h, 1.8, h * 2, 0.8, lin(g, px - 1, 0, px + 1, 0, [[0, '#b0804c'], [1, '#4a2e18']]));
    g.restore();
    void v;
  }


}

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

/** A whole herb afloat: a leaf, a flower head or a sprig. */
function floatingHerb(g: Ctx, x: number, y: number, kind: number, c1: string, c2: string, rot: number) {
  g.save();
  g.translate(x, y);
  g.scale(1, 0.55);
  g.rotate(rot);
  if (kind === 0) {
    blade(g, -3, 0, 7, 0, 1.2, 3, c1);
    line(g, -3, 0, 3.6, 0.2, rgba(dim(c1, 0.4), 0.6), 0.3);
  } else if (kind === 1) {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ellipse(g, Math.cos(a) * 1.8, Math.sin(a) * 1.8, 1.4, 0.8, c1, a); }
    circle(g, 0, 0, 1, c2);
  } else {
    line(g, -3.5, 0, 3.5, 0, dim(c2, 0.2), 0.5);
    for (const s of [-2, 0, 2]) { blade(g, s, 0, 2.6, -1.2, 0.4, 1.3, c2); blade(g, s, 0, 2.6, 1.2, -0.4, 1.3, c1); }
  }
  g.restore();
}

// ---------------------------------------------------------------- painting the bench (static)

function paintBack(g: Ctx) {
  const rng = new RNG(53);
  // ---- wall: limewashed plaster between dark timbers, warmed by the fire, smoke-browned above
  g.fillStyle = lin(g, 0, 0, 0, 170, [[0, '#6a5640'], [0.45, '#937a5c'], [1, '#8a7054']]);
  g.fillRect(0, 0, BW, 172);
  for (let i = 0; i < 260; i++) {
    const x = rng.next() * BW, y = rng.next() * 170;
    ellipse(g, x, y, 2 + rng.next() * 8, 1 + rng.next() * 3.5, rgba(rng.next() < 0.5 ? '#b09a78' : '#5a4632', 0.12));
  }
  // cracks in the daub
  g.strokeStyle = 'rgba(50,36,22,0.35)'; g.lineWidth = 0.4;
  for (let i = 0; i < 7; i++) {
    let x = rng.next() * BW, y = 20 + rng.next() * 130;
    g.beginPath(); g.moveTo(x, y);
    for (let j = 0; j < 5; j++) { x += (rng.next() - 0.5) * 8; y += 2 + rng.next() * 5; g.lineTo(x, y); }
    g.stroke();
  }
  // the fire's warmth on the wall behind the pot; dark corners
  g.save();
  g.globalCompositeOperation = 'soft-light';
  g.fillStyle = rad(g, PX, 175, 10, PX, 150, 190, [[0, 'rgba(255,170,90,0.95)'], [0.5, 'rgba(200,120,60,0.45)'], [1, 'rgba(20,10,5,0.85)']]);
  g.fillRect(0, 0, BW, 172);
  g.restore();
  const timber = (x: number, y: number, w: number, h: number) => {
    g.fillStyle = lin(g, x, 0, x + w, 0, [[0, '#4a3220'], [0.3, '#3a2616'], [1, '#1e140c']]);
    g.fillRect(x, y, w, h);
    for (let i = 0; i < 6; i++) line(g, x + 1 + rng.next() * (w - 2), y, x + 1 + rng.next() * (w - 2), y + h, rgba('#140c06', 0.35), 0.4);
    line(g, x + 0.5, y, x + 0.5, y + h, 'rgba(255,220,170,0.18)', 0.6);
    g.fillStyle = lin(g, x + w, 0, x + w + 4, 0, [[0, 'rgba(0,0,0,0.3)'], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(x + w, y, 4, h);
  };
  // a fireplace recess of sooty stone behind the pot, under a stone arch
  const fx0 = 105, fx1 = 214, archY = 34;
  const recess = () => {
    g.beginPath();
    g.moveTo(fx0, 172); g.lineTo(fx0, archY + 26);
    g.quadraticCurveTo(fx0 + 2, archY, PX, archY);
    g.quadraticCurveTo(fx1 - 2, archY, fx1, archY + 26);
    g.lineTo(fx1, 172); g.closePath();
  };
  g.save();
  recess(); g.clip();
  g.fillStyle = '#120c08';
  g.fillRect(fx0, archY, fx1 - fx0, 140);
  for (let y = 172 - 9, r = 0; y > archY - 9; y -= 9, r++) {
    let x = fx0 - (r % 2) * 9 - rng.next() * 6;
    while (x < fx1) {
      const w = 13 + rng.next() * 12;
      const col = mix('#3e342c', rng.next() < 0.5 ? '#4e443a' : '#2e2620', rng.next() * 0.7);
      roundRect(g, x + 0.6, y + 0.6, w - 1.2, 7.8, 2, lin(g, x, y, x + w * 0.3, y + 9, [[0, lit(col, 0.15)], [0.5, col], [1, dim(col, 0.4)]]));
      x += w;
    }
  }
  g.fillStyle = lin(g, 0, archY, 0, 172, [[0, 'rgba(6,4,2,0.8)'], [0.55, 'rgba(6,4,2,0.45)'], [1, 'rgba(6,4,2,0.1)']]);
  g.fillRect(fx0, archY, fx1 - fx0, 140);
  g.fillStyle = rad(g, PX, 196, 6, PX, 180, 110, [[0, 'rgba(255,140,60,0.4)'], [0.5, 'rgba(200,90,40,0.15)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(fx0, archY, fx1 - fx0, 140);
  g.fillStyle = lin(g, fx0, 0, fx0 + 10, 0, [[0, 'rgba(0,0,0,0.5)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(fx0, archY, 10, 140);
  g.restore();
  // dressed voussoirs round the arch
  const archPt = (u: number): [number, number, number, number] => {
    // u 0..1 across the two quadratic halves; returns point and outward normal
    const left = u < 0.5, t = left ? u * 2 : (u - 0.5) * 2;
    const P0 = left ? [fx0, archY + 26] : [PX, archY], C = left ? [fx0 + 2, archY] : [fx1 - 2, archY], P1 = left ? [PX, archY] : [fx1, archY + 26];
    const x = (1 - t) * (1 - t) * P0[0] + 2 * (1 - t) * t * C[0] + t * t * P1[0];
    const y = (1 - t) * (1 - t) * P0[1] + 2 * (1 - t) * t * C[1] + t * t * P1[1];
    const dx = 2 * (1 - t) * (C[0] - P0[0]) + 2 * t * (P1[0] - C[0]), dy = 2 * (1 - t) * (C[1] - P0[1]) + 2 * t * (P1[1] - C[1]);
    const l = Math.hypot(dx, dy) || 1;
    return [x, y, dy / l, -dx / l];
  };
  const band = 6.5;
  g.beginPath();
  for (let i = 0; i <= 40; i++) { const [x, y, nx, ny] = archPt(i / 40); if (i) g.lineTo(x + nx * band, y + ny * band); else g.moveTo(x + nx * band, y + ny * band); }
  for (let i = 40; i >= 0; i--) { const [x, y] = archPt(i / 40); g.lineTo(x, y); }
  g.closePath();
  g.fillStyle = lin(g, fx0, archY - 6, fx1, archY + 26, [[0, '#9a8a74'], [0.5, '#7e6e5a'], [1, '#5e5040']]);
  g.fill();
  g.strokeStyle = 'rgba(20,14,8,0.6)'; g.lineWidth = 0.5; g.stroke();
  for (let i = 1; i < 11; i++) {
    const [x, y, nx, ny] = archPt(i / 11);
    line(g, x, y, x + nx * band, y + ny * band, 'rgba(24,16,10,0.7)', 0.6);
    line(g, x + 0.6, y + 0.3, x + nx * band + 0.6, y + ny * band + 0.3, 'rgba(255,240,210,0.18)', 0.4);
  }
  // keystone
  { const [x, y, nx, ny] = archPt(0.5); poly(g, [x - 3.6, y + 0.4, x + 3.6, y + 0.4, x + 4.6 + nx * band, y + ny * band - 1.4, x - 4.6 + nx * band, y + ny * band - 1.4], lin(g, 0, y - band, 0, y, [[0, '#a8987e'], [1, '#6e604e']]), 'rgba(20,14,8,0.6)', 0.5); }
  timber(96, 0, 9, 172);
  timber(214, 0, 9, 172);
  g.fillStyle = lin(g, 0, 0, 0, 12, [[0, '#2a1c10'], [1, '#4a3220']]);
  g.fillRect(0, 0, BW, 11);
  g.fillStyle = lin(g, 0, 11, 0, 16, [[0, 'rgba(0,0,0,0.4)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(0, 11, BW, 5);
  // soot above the fire
  g.fillStyle = rad(g, PX, 20, 6, PX, 20, 70, [[0, 'rgba(30,18,8,0.5)'], [1, 'rgba(30,18,8,0)']]);
  g.fillRect(80, 0, 160, 60);

  // ---- herbs drying from the beam
  herbBundle(g, 26, 11, 34, ['#5c8a3a', '#46702c'], '#c8b8e8', rng);
  herbBundle(g, 52, 11, 28, ['#8a9a5a', '#6a7a3a'], '#f0d060', rng);
  herbBundle(g, 76, 11, 38, ['#4a7a3a', '#3a6a2c'], '#e8e0cc', rng);

  // ---- a shelf of jars, top right
  g.fillStyle = lin(g, 0, 57, 0, 66, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(226, 57, 94, 9);
  roundRect(g, 224, 52, 98, 5, 1, lin(g, 0, 52, 0, 57, [[0, '#8a6038'], [1, '#3e2814']]));
  for (const x of [232, 312]) poly(g, [x - 2, 57, x + 2, 57, x + 1, 66, x - 1, 66], '#3a2414');
  jar(g, 238, 52, 14, 18, '#8a4a2a', rng);
  jar(g, 258, 52, 11, 14, '#6a6a5a', rng);
  flask(g, 276, 52, 11, 19, '#7ab04a', 0.55);
  jar(g, 300, 52, 16, 21, '#a0703a', rng, true);

  // ---- benches either side, cupboards beneath
  bench(g, -6, 96, rng, true);
  bench(g, 224, 330, rng, false);
  // bottles on the right bench
  flask(g, 240, 168, 16, 27, '#6aa04a', 0.6, true);
  flask(g, 258, 168, 9, 34, '#c08a2a', 0.7);
  flask(g, 271, 168, 7, 15, '#a8243a', 0.5);
  // the mortar: a bowl of grey stone
  mortarBowl(g, rng);

  // ---- the hearth's back stones and the logs
  g.fillStyle = rad(g, PX, 205, 10, PX, 205, 80, [[0, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(70, 170, 180, 50);
  for (let i = 0; i < 7; i++) {
    const x = 104 + i * 18 + (rng.next() - 0.5) * 3;
    stone(g, x, 192 + Math.abs(i - 3) * 0.8, 10 + rng.next() * 3, 6 + rng.next() * 2, rng);
  }
  logPiece(g, 118, 206, 204, 198, 5, rng);
  logPiece(g, 202, 207, 122, 199, 4.5, rng);
  // embers bed
  for (let i = 0; i < 26; i++) {
    const x = PX + (rng.next() - 0.5) * 70, y = 203 + rng.next() * 6;
    const r = 1.2 + rng.next() * 2;
    ellipse(g, x, y, r, r * 0.6, rad(g, x, y, 0.1, x, y, r, [[0, rng.next() < 0.5 ? '#ffd080' : '#ff8a3a'], [1, '#6a1a08']]));
  }
}

function paintFront(g: Ctx) {
  const rng = new RNG(67);
  // ---- the cauldron: pot-bellied iron with a thick lip, two lugs and stubby legs
  const body = () => {
    g.beginPath();
    g.moveTo(PX - RIM_RX + 5, RIM_Y + 3);
    g.bezierCurveTo(PX - 50, RIM_Y + 14, PX - 67, RIM_Y + 26, PX - 65, RIM_Y + 48);
    g.bezierCurveTo(PX - 63, RIM_Y + 72, PX - 40, RIM_Y + 87, PX, RIM_Y + 88);
    g.bezierCurveTo(PX + 40, RIM_Y + 87, PX + 63, RIM_Y + 72, PX + 65, RIM_Y + 48);
    g.bezierCurveTo(PX + 67, RIM_Y + 26, PX + 50, RIM_Y + 14, PX + RIM_RX - 5, RIM_Y + 3);
    g.closePath();
  };
  // legs
  for (const [x, s] of [[PX - 34, -1], [PX + 34, 1]] as const) {
    poly(g, [x - 5, RIM_Y + 76, x + 5, RIM_Y + 76, x + 4 + s * 2.5, RIM_Y + 98, x - 2 + s * 2.5, RIM_Y + 98], lin(g, x - 5, 0, x + 5, 0, [[0, IRON[4]], [1, IRON[1]]]));
  }
  body();
  g.fillStyle = rad(g, PX - 30, RIM_Y + 30, 2, PX - 6, RIM_Y + 46, 82, [[0, '#8e959d'], [0.22, '#5c626a'], [0.55, '#33373d'], [0.85, '#1c1e22'], [1, '#121315']]);
  g.fill();
  g.save();
  body(); g.clip();
  // hammered texture
  for (let i = 0; i < 120; i++) {
    const x = PX - 64 + rng.next() * 128, y = RIM_Y + rng.next() * 88, r = 0.8 + rng.next() * 2.2;
    ellipse(g, x, y, r, r * 0.7, rgba('#050506', 0.12));
    ellipse(g, x - r * 0.3, y - r * 0.3, r * 0.6, r * 0.4, rgba('#c8d0d8', 0.06));
  }
  // the shadow under the lip, and the hot, sooty underside that holds the firelight
  g.fillStyle = lin(g, 0, RIM_Y + 2, 0, RIM_Y + 12, [[0, 'rgba(0,0,0,0.6)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(PX - 70, RIM_Y, 140, 12);
  g.fillStyle = lin(g, 0, RIM_Y + 50, 0, RIM_Y + 90, [[0, 'rgba(0,0,0,0)'], [0.55, 'rgba(8,5,3,0.4)'], [1, 'rgba(150,60,20,0.45)']]);
  g.fillRect(PX - 70, RIM_Y + 40, 140, 52);
  // rim light from the fire along both flanks
  g.strokeStyle = 'rgba(255,140,60,0.35)'; g.lineWidth = 2.4;
  body(); g.stroke();
  // a soft specular sheen on the shoulder
  g.save();
  g.translate(PX - 34, RIM_Y + 30); g.rotate(-0.5);
  g.fillStyle = rad(g, 0, 0, 0, 0, 0, 12, [[0, 'rgba(235,242,250,0.45)'], [1, 'rgba(235,242,250,0)']]);
  g.scale(1, 0.45);
  g.beginPath(); g.arc(0, 0, 12, 0, TAU); g.fill();
  g.restore();
  // a seam band round the belly
  g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1.8;
  g.beginPath(); g.ellipse(PX, RIM_Y + 36, 66, 16, 0, 0.05, Math.PI - 0.05); g.stroke();
  g.strokeStyle = 'rgba(200,210,220,0.2)'; g.lineWidth = 0.7;
  g.beginPath(); g.ellipse(PX, RIM_Y + 34.6, 66, 16, 0, 0.12, Math.PI - 0.12); g.stroke();
  g.restore();
  // lugs
  for (const s of [-1, 1]) {
    const x = PX + s * 60, y = RIM_Y + 12;
    g.strokeStyle = lin(g, x - 5, y - 5, x + 5, y + 5, [[0, IRON[5]], [1, IRON[1]]]);
    g.lineWidth = 2.6;
    g.beginPath(); g.ellipse(x + s * 3, y + 2, 4.2, 5.2, 0, 0, TAU); g.stroke();
  }
  // the lip: a ring round the mouth
  g.beginPath();
  g.ellipse(PX, RIM_Y, RIM_RX, RIM_RY, 0, 0, TAU);
  g.ellipse(PX, RIM_Y + 0.6, MOUTH_RX, MOUTH_RY, 0, 0, TAU, true);
  g.fillStyle = lin(g, PX - RIM_RX, RIM_Y - RIM_RY, PX + RIM_RX, RIM_Y + RIM_RY, [[0, IRON[6]], [0.35, IRON[4]], [0.7, IRON[3]], [1, IRON[1]]]);
  g.fill('evenodd');
  g.strokeStyle = 'rgba(8,6,4,0.8)'; g.lineWidth = 0.6;
  g.beginPath(); g.ellipse(PX, RIM_Y, RIM_RX, RIM_RY, 0, 0, TAU); g.stroke();
  g.beginPath(); g.ellipse(PX, RIM_Y + 0.6, MOUTH_RX, MOUTH_RY, 0, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(235,240,245,0.5)'; g.lineWidth = 0.8;
  g.beginPath(); g.ellipse(PX, RIM_Y - 0.4, RIM_RX - 2, RIM_RY - 1.6, 0, Math.PI * 0.95, Math.PI * 1.55); g.stroke();
  // ---- front hearth stones
  for (let i = 0; i < 6; i++) {
    const x = 100 + i * 24 + (rng.next() - 0.5) * 4;
    stone(g, x, 212 + Math.abs(i - 2.5) * 1.4, 13 + rng.next() * 3, 8 + rng.next() * 2, rng);
  }
}

function stone(g: Ctx, x: number, y: number, rx: number, ry: number, rng: RNG) {
  const col = mix('#3e3832', rng.next() < 0.5 ? '#524a42' : '#2e2a26', rng.next() * 0.7);
  ellipse(g, x + 1.5, y + 2, rx, ry * 0.8, 'rgba(0,0,0,0.45)');
  blobPath(g, x, y, rx, ry, rng, 7, 0.28);
  g.fillStyle = rad(g, x - rx * 0.3, y - ry * 0.55, 0.5, x, y, Math.max(rx, ry) * 1.1, [[0, lit(col, 0.25)], [0.5, col], [1, dim(col, 0.55)]]);
  g.fill();
  g.save();
  g.beginPath(); g.ellipse(x, y, rx * 1.1, ry * 1.1, 0, 0, TAU);
  g.clip();
  for (let i = 0; i < 10; i++) ellipse(g, x + (rng.next() - 0.5) * rx * 2, y + (rng.next() - 0.5) * ry * 2, 0.4 + rng.next(), 0.3 + rng.next() * 0.6, rgba(rng.next() < 0.5 ? '#1a1612' : '#9a9086', 0.3));
  g.restore();
  // facets, and the fire's glow on the upper face
  line(g, x - rx * 0.5, y - ry * 0.1, x + rx * 0.2, y - ry * 0.35, rgba('#0c0a08', 0.4), 0.5);
  ellipse(g, x - rx * 0.1, y - ry * 0.5, rx * 0.55, ry * 0.28, rgba('#ff9a4a', 0.16));
}

function logPiece(g: Ctx, x0: number, y0: number, x1: number, y1: number, r: number, rng: RNG) {
  const a = Math.atan2(y1 - y0, x1 - x0), len = Math.hypot(x1 - x0, y1 - y0);
  g.save();
  g.translate(x0, y0); g.rotate(a);
  roundRect(g, 0, -r, len, r * 2, r * 0.6, lin(g, 0, -r, 0, r, [[0, '#6a4a30'], [0.4, '#3e2a1a'], [1, '#140c06']]));
  for (let i = 0; i < 10; i++) line(g, rng.next() * len, (rng.next() - 0.5) * r * 1.5, rng.next() * len, (rng.next() - 0.5) * r * 1.5, rgba('#0c0604', 0.5), 0.4);
  // charred, glowing underside
  g.fillStyle = lin(g, 0, 0, 0, r, [[0, 'rgba(255,120,40,0)'], [1, 'rgba(255,120,40,0.55)']]);
  g.fillRect(len * 0.2, 0, len * 0.6, r);
  ellipse(g, len, 0, r * 0.45, r, rad(g, len, 0, 0.2, len, 0, r, [[0, '#ffb060'], [0.6, '#c04a18'], [1, '#2a120a']]));
  g.restore();
}

function bench(g: Ctx, x0: number, x1: number, rng: RNG, left: boolean) {
  const top = 166;
  // a cupboard of boards under the top, lit on the side toward the fire
  const cx0 = x0 + 4, cx1 = x1 - 4;
  g.fillStyle = '#1e130a';
  g.fillRect(cx0, top + 8, cx1 - cx0, BH - top);
  const n = Math.max(2, Math.round((cx1 - cx0) / 17));
  for (let i = 0; i < n; i++) {
    const bx = cx0 + ((cx1 - cx0) * i) / n, bw = (cx1 - cx0) / n;
    const col = mix('#5a3a20', rng.next() < 0.5 ? '#6a4628' : '#4a2e18', rng.next() * 0.6);
    g.fillStyle = lin(g, bx, 0, bx + bw, 0, [[0, lit(col, 0.12)], [0.3, col], [1, dim(col, 0.35)]]);
    g.fillRect(bx + 0.5, top + 8, bw - 1, BH - top);
    for (let j = 0; j < 4; j++) { const gx = bx + 2 + rng.next() * (bw - 4); line(g, gx, top + 9, gx + (rng.next() - 0.5) * 2, BH, rgba('#1a0e06', 0.3), 0.4); }
  }
  // a batten and an iron ring pull
  g.fillStyle = lin(g, 0, top + 24, 0, top + 29, [[0, '#6a4628'], [1, '#2e1c0e']]);
  g.fillRect(cx0, top + 24, cx1 - cx0, 5);
  const rx = left ? cx1 - 14 : cx0 + 14;
  g.strokeStyle = lin(g, rx - 3, 0, rx + 3, 0, [[0, IRON[5]], [1, IRON[1]]]); g.lineWidth = 1.1;
  g.beginPath(); g.arc(rx, top + 36, 3, 0, TAU); g.stroke();
  circle(g, rx, top + 33, 1.2, IRON[3]);
  // the fire's light on the near edge, shadow toward the wall
  g.fillStyle = left ? lin(g, cx1 - 30, 0, cx1, 0, [[0, 'rgba(255,140,60,0)'], [1, 'rgba(255,140,60,0.22)']]) : lin(g, cx0, 0, cx0 + 30, 0, [[0, 'rgba(255,140,60,0.22)'], [1, 'rgba(255,140,60,0)']]);
  g.fillRect(cx0, top + 8, cx1 - cx0, BH - top);
  g.fillStyle = lin(g, 0, top + 8, 0, top + 16, [[0, 'rgba(0,0,0,0.55)'], [1, 'rgba(0,0,0,0)']]);
  g.fillRect(cx0, top + 8, cx1 - cx0, 8);
  // top: a thick plank seen a little from above
  roundRect(g, x0, top - 3, x1 - x0, 5, 1.2, lin(g, 0, top - 3, 0, top + 2, [[0, '#a07448'], [1, '#7a5432']]));
  roundRect(g, x0, top + 1.5, x1 - x0, 8, 1.2, lin(g, 0, top + 1.5, 0, top + 9.5, [[0, '#6a4628'], [1, '#3a2414']]));
  for (let i = 0; i < 8; i++) {
    const y = top - 2.4 + rng.next() * 4;
    line(g, x0 + rng.next() * 20, y, x1 - rng.next() * 20, y + (rng.next() - 0.5), rgba('#3a2412', 0.35), 0.4);
  }
  line(g, x0, top - 2.6, x1, top - 2.6, 'rgba(255,230,190,0.3)', 0.5);
}

function herbBundle(g: Ctx, x: number, y: number, len: number, greens: string[], flower: string, rng: RNG) {
  // string from the beam, a tied bunch hanging head-down
  line(g, x, y, x, y + 7, '#c8b890', 0.5);
  roundRect(g, x - 2.2, y + 6, 4.4, 3, 1, '#b09860');
  for (let i = 0; i < 9; i++) line(g, x + (i - 4) * 0.5, y + 6, x + (i - 4) * 1.5 + (rng.next() - 0.5) * 2, y + len * 0.85, dim(greens[1], 0.2), 0.45);
  for (let i = 0; i < 26; i++) {
    const t = 0.25 + rng.next() * 0.75;
    const px = x + (rng.next() - 0.5) * 14 * t, py = y + 8 + t * (len - 8);
    blade(g, px, py, 3 + rng.next() * 4, Math.PI / 2 + (rng.next() - 0.5) * 1.8, (rng.next() - 0.5) * 2, 1.6, greens[rng.next() < 0.5 ? 0 : 1]);
  }
  for (let i = 0; i < 10; i++) {
    const px = x + (rng.next() - 0.5) * 12, py = y + len * (0.8 + rng.next() * 0.2);
    circle(g, px, py, 1 + rng.next() * 0.7, rgba(flower, 0.9));
  }
}

function jar(g: Ctx, x: number, yb: number, w: number, h: number, col: string, rng: RNG, cork = false) {
  const bw = w / 2;
  ellipse(g, x + 1.5, yb, bw + 1, 1.6, 'rgba(0,0,0,0.35)');
  g.beginPath();
  g.moveTo(x - bw * 0.7, yb);
  g.bezierCurveTo(x - bw * 1.15, yb - h * 0.3, x - bw * 1.1, yb - h * 0.8, x - bw * 0.6, yb - h * 0.92);
  g.lineTo(x + bw * 0.6, yb - h * 0.92);
  g.bezierCurveTo(x + bw * 1.1, yb - h * 0.8, x + bw * 1.15, yb - h * 0.3, x + bw * 0.7, yb);
  g.closePath();
  g.fillStyle = rad(g, x - bw * 0.4, yb - h * 0.65, 0.3, x, yb - h * 0.45, Math.max(bw, h) * 0.95, [[0, lit(col, 0.4)], [0.5, col], [1, dim(col, 0.5)]]);
  g.fill();
  ellipse(g, x, yb - h * 0.92, bw * 0.65, Math.max(0.8, bw * 0.2), cork ? '#b08a5a' : dim(col, 0.6));
  if (cork) roundRect(g, x - bw * 0.5, yb - h - 2, bw, 3, 0.8, lin(g, 0, yb - h - 2, 0, yb - h + 1, [[0, '#d0a870'], [1, '#8a6038']]));
  else line(g, x - bw * 0.62, yb - h * 0.8, x + bw * 0.62, yb - h * 0.8, rgba('#e8d8b8', 0.5), 0.5);
  ellipse(g, x - bw * 0.45, yb - h * 0.6, bw * 0.14, h * 0.14, 'rgba(255,245,225,0.3)');
  void rng;
}

function flask(g: Ctx, x: number, yb: number, w: number, h: number, liquid: string, fill: number, round = false) {
  const bw = w / 2, neck = h * (round ? 0.42 : 0.38), bh = h - neck;
  ellipse(g, x + 2, yb, bw + 1.5, 1.8, 'rgba(0,0,0,0.4)');
  const body = () => {
    g.beginPath();
    if (round) g.ellipse(x, yb - bh / 2, bw, bh / 2, 0, 0, TAU);
    else {
      g.moveTo(x - bw, yb - 0.5);
      g.lineTo(x - bw, yb - bh + bw * 0.6);
      g.quadraticCurveTo(x - bw, yb - bh, x - w * 0.18, yb - bh - 0.4);
      g.lineTo(x + w * 0.18, yb - bh - 0.4);
      g.quadraticCurveTo(x + bw, yb - bh, x + bw, yb - bh + bw * 0.6);
      g.lineTo(x + bw, yb - 0.5);
      g.quadraticCurveTo(x, yb + 0.6, x - bw, yb - 0.5);
    }
    g.closePath();
  };
  const nw = Math.max(2, w * 0.28);
  g.fillStyle = lin(g, x - nw / 2, 0, x + nw / 2, 0, [[0, 'rgba(210,230,220,0.5)'], [1, 'rgba(90,110,100,0.5)']]);
  g.fillRect(x - nw / 2, yb - h, nw, neck + 1);
  roundRect(g, x - nw / 2 - 0.4, yb - h - 2.6, nw + 0.8, 3.4, 0.8, lin(g, 0, yb - h - 2.6, 0, yb - h + 0.8, [[0, '#d0a870'], [1, '#7a5430']]));
  body();
  g.fillStyle = 'rgba(160,190,180,0.22)';
  g.fill();
  g.save();
  body(); g.clip();
  const top = yb - bh * fill;
  g.fillStyle = lin(g, x - bw, 0, x + bw, 0, [[0, lit(liquid, 0.3)], [0.5, liquid], [1, dim(liquid, 0.5)]]);
  g.fillRect(x - bw, top, w, yb - top + 1);
  ellipse(g, x, top, bw * 0.95, Math.max(0.5, bw * 0.25), rgba(lit(liquid, 0.5), 0.8));
  g.fillStyle = 'rgba(255,255,255,0.45)';
  g.fillRect(x - bw * 0.62, yb - bh * 0.85, Math.max(0.7, w * 0.1), bh * 0.6);
  g.fillStyle = 'rgba(255,190,120,0.25)';
  g.fillRect(x + bw * 0.45, yb - bh * 0.7, Math.max(0.5, w * 0.07), bh * 0.45);
  g.restore();
  body();
  g.strokeStyle = 'rgba(220,240,235,0.35)'; g.lineWidth = 0.5; g.stroke();
}

function mortarBowl(g: Ctx, rng: RNG) {
  const x = MORTAR_X, y = MORTAR_Y;
  ellipse(g, x + 3, 167, 22, 3, 'rgba(0,0,0,0.45)');
  const bowl = () => {
    g.beginPath();
    g.moveTo(x - 24, y);
    g.bezierCurveTo(x - 24, y + 12, x - 14, y + 16, x - 11, y + 16.5);
    g.lineTo(x - 12, y + 18.5);
    g.lineTo(x + 12, y + 18.5);
    g.lineTo(x + 11, y + 16.5);
    g.bezierCurveTo(x + 14, y + 16, x + 24, y + 12, x + 24, y);
    g.closePath();
  };
  const col = '#8a8478';
  bowl();
  g.fillStyle = rad(g, x - 10, y + 2, 1, x, y + 6, 30, [[0, lit(col, 0.35)], [0.5, col], [1, dim(col, 0.55)]]);
  g.fill();
  g.save(); bowl(); g.clip();
  for (let i = 0; i < 90; i++) ellipse(g, x - 24 + rng.next() * 48, y + rng.next() * 19, 0.3 + rng.next() * 0.6, 0.25 + rng.next() * 0.4, rgba(rng.next() < 0.5 ? '#2a2824' : '#d8d2c4', 0.35));
  g.restore();
  // the mouth: rim and the hollow inside
  ellipse(g, x, y, 24, 6.5, lin(g, x - 24, 0, x + 24, 0, [[0, lit(col, 0.45)], [1, dim(col, 0.3)]]));
  ellipse(g, x, y + 0.5, 20, 5, lin(g, 0, y - 5, 0, y + 5, [[0, '#2e2c28'], [1, '#6a665c']]));
}
