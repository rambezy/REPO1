// 2D overlay over the 3D view: names, health bars, speech, damage numbers,
// lines from fighters to their targets, the selection marquee and move
// markers. Labels are laid out by priority (see labels.ts) so a brawl does
// not pile into one unreadable blob.
import * as THREE from 'three';
import { Char } from '../sim/char';
import { World } from '../sim/world';
import { FACTION } from '../content/factions';
import { ANIMAL } from '../content/animals';
import { layoutLabels, labelPriority, nameAlpha, LAYOUT, type LabelItem, type LabelOut, type Importance } from './labels';

const v = new THREE.Vector3();
const NAME_FONT = '600 12px "Barlow Condensed", sans-serif';
const SUB_FONT = '500 10px "Barlow Condensed", sans-serif';
const FLOAT_FONT = '700 13px "Barlow Condensed", sans-serif';
const BUBBLE_FONT = '500 12px Barlow, sans-serif';
const BAR_W = 44, BAR_H = 4;

export interface Marker { x: number; y: number; z: number; t: number; color: string; }
interface Floater { id: number; owner: number; x: number; y: number; z: number; text: string; t: number; color: string; rise: number; }

/** A label waiting for layout, with what it needs to draw. Pooled: the same records are reused every frame. */
interface Item extends LabelItem {
  c: Char | null;
  f: Floater | null;
  alpha: number;
  bar: boolean;
  name: string;
  nameA: number; // the name's own fade with distance
  sub: string;
  sneak: number; // 0 none, 1 hidden, 2 seen
  zz: boolean; // asleep
  lines: string[] | null;
}

const blank = (): Item => ({ id: 0, owner: 0, kind: 'tag', x: 0, y: 0, w: 0, h: 0, priority: 0, slots: 0, c: null, f: null, alpha: 1, bar: false, name: '', nameA: 1, sub: '', sneak: 0, zz: false, lines: null });
/** Text widths measured per frame before the rest are estimated (a crowd of new names would otherwise cost a frame). */
const MEASURE_BUDGET = 16;

export class Overlay {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  box: [number, number, number, number] | null = null;
  markers: Marker[] = [];
  floaters: Floater[] = [];
  showAllNames = false;
  /** milliseconds a frame spent drawing the overlay (smoothed) */
  ms = 0;
  /** what the last frame drew, for the debug readout and tests */
  stats = { labels: 0, shown: 0, lines: 0 };
  private items: Item[] = [];
  private n = 0;
  private out: LabelOut[] = [];
  private order: number[] = [];
  private shownNow = new Set<number>();
  private shownBefore = new Set<number>();
  private focus = new Set<number>(); // selected people and their targets
  private widths = new Map<string, Map<string, number>>(); // by font, then text
  private measured = 0;
  private wraps = new Map<string, string[]>();
  private seq = 1;
  private frame = 0;
  private W: World | null = null;
  // scratch results of project()
  private sx = 0;
  private sy = 0;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'overlay';
    this.canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  /** Projects a world point; the screen position lands in sx, sy. False when behind the camera. */
  private project(x: number, y: number, z: number, cam: THREE.Camera, w: number, h: number): boolean {
    v.set(x, y, z).project(cam);
    this.sx = (v.x * 0.5 + 0.5) * w;
    this.sy = (-v.y * 0.5 + 0.5) * h;
    return v.z < 1 && v.z > -1;
  }

  /**
   * A text's width in a font, measured once and remembered; past the frame's
   * budget a guess serves until next frame, unless the caller must have the
   * truth (a wrap is kept, so it is never built on guesses).
   */
  private width(font: string, text: string, exact = false): number {
    let m = this.widths.get(font);
    if (!m) this.widths.set(font, (m = new Map()));
    let w = m.get(text);
    if (w === undefined) {
      if (!exact && this.measured >= MEASURE_BUDGET) return text.length * (font === SUB_FONT ? 4.6 : 6.4);
      this.measured++;
      if (m.size > 3000) m.clear();
      this.ctx.font = font;
      w = this.ctx.measureText(text).width;
      m.set(text, w);
    }
    return w;
  }

  /** Word-wraps a speech line to the bubble width, remembered per text. */
  private wrap(text: string): string[] {
    let lines = this.wraps.get(text);
    if (lines) return lines;
    if (this.wraps.size > 600) this.wraps.clear();
    lines = [];
    let line = '';
    for (const wd of text.split(' ')) {
      const t = line ? line + ' ' + wd : wd;
      if (this.width(BUBBLE_FONT, t, true) > 180 && line) { lines.push(line); line = wd; } else line = t;
    }
    if (line) lines.push(line);
    this.wraps.set(text, lines);
    return lines;
  }

  private item(): Item {
    let it = this.items[this.n];
    if (!it) { it = blank(); this.items[this.n] = it; }
    this.n++;
    it.c = null; it.f = null; it.lines = null; it.sub = ''; it.name = ''; it.nameA = 1; it.sneak = 0; it.zz = false; it.bar = false; it.slots = 0; it.alpha = 1;
    return it;
  }

  /** Drops the item just taken when its box lies wholly off screen: it must not take space from one that shows. */
  private offscreen(it: LabelItem, w: number, h: number): boolean {
    if (it.x + it.w / 2 < 0 || it.x - it.w / 2 > w || it.y < 0 || it.y - it.h > h) { this.n--; return true; }
    return false;
  }

  draw(W: World, cam: THREE.PerspectiveCamera, sel: Set<number>, hover: number, dt: number) {
    const t0 = performance.now();
    this.W = W;
    this.frame++;
    this.measured = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = window.innerWidth, h = window.innerHeight;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    }
    const g = this.ctx;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    const camPos = cam.position;
    g.textAlign = 'center';
    g.lineJoin = 'round';
    // move markers
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.t -= dt;
      if (m.t <= 0) { this.markers.splice(i, 1); continue; }
      if (!this.project(m.x, m.y, m.z, cam, w, h)) continue;
      const k = m.t / 0.8;
      g.strokeStyle = m.color;
      g.globalAlpha = k;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(this.sx, this.sy, 14 * (1.4 - k * 0.4), 6 * (1.4 - k * 0.4), 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    // who matters most this frame: the selected, and whoever they are fighting
    const focus = this.focus;
    focus.clear();
    for (const id of sel) { focus.add(id); const c = W.char(id); if (c && c.target) focus.add(c.target); }
    if (hover) focus.add(hover);
    this.drawLines(W, cam, sel, w, h);

    // gather the labels
    this.n = 0;
    const items = this.items;
    for (const c of W.active) {
      if (!c.view || c.carriedBy) continue;
      const d = Math.hypot(c.x - camPos.x, c.y - camPos.y, c.z - camPos.z);
      if (d > 160) continue;
      const height = c.animal ? ANIMAL[c.animal].size * 1.3 + 0.4 : c.look.height + 0.25;
      const lying = c.status !== 'up' || c.knockT > 0 || c.bed || c.cage;
      if (!this.project(c.x, c.y + (lying ? 0.7 : height), c.z, cam, w, h)) continue;
      const sx = this.sx, sy = this.sy;
      if (sx < -50 || sy < -50 || sx > w + 50 || sy > h + 50) continue;
      const isSel = sel.has(c.id), isHover = hover === c.id, important = focus.has(c.id);
      const hurt = c.body.total() < 0.99 || c.body.bleeding() > 0.01;
      const fighting = c.drawn || !!c.atk;
      const alpha = Math.max(0.25, Math.min(1, 1.4 - d / 120));
      const who: Importance = important ? 'selected' : c.faction === 'player' ? 'mine' : fighting && (W.rel.hostile('player', c.faction) || !!c.target) ? 'foe' : 'other';
      const bar = (hurt || fighting || isSel || isHover) && c.alive && d < 110;
      const nameA = nameAlpha(d, important, h);
      const wantName = (isSel || isHover || this.showAllNames || c.barkT > 0) && nameA > 0.02;
      const sub = wantName && (isHover || isSel) && !c.animal && c.faction !== 'player' ? FACTION[c.faction] : undefined;
      const sneak = c.faction === 'player' && c.move === 'sneak' && c.status === 'up' && c.mem.seenBy !== undefined ? (c.mem.seenBy ? 2 : 1) : 0;
      const zz = c.sleeping && c.status === 'up';
      let it: Item | null = null;
      if (bar || wantName || sneak || zz) {
        it = this.item();
        it.c = c; it.kind = 'tag'; it.id = c.id * 4; it.owner = c.id;
        it.bar = bar;
        it.zz = zz;
        it.alpha = alpha;
        let bw = bar ? BAR_W + 4 : zz ? 30 : 0, bh = bar ? 8 : zz ? 14 : 0;
        if (wantName) {
          it.name = c.status === 'dead' ? `${c.name} (dead)` : c.status === 'ko' ? `${c.name} (unconscious)` : c.name;
          it.nameA = nameA;
          bw = Math.max(bw, this.width(NAME_FONT, it.name) + 8); bh += 16;
          if (sub) { it.sub = c.title ? `${c.title} · ${sub.short}` : sub.short; bw = Math.max(bw, this.width(SUB_FONT, it.sub) + 4); bh += 11; }
        }
        if (sneak) { it.sneak = sneak; bw = Math.max(bw, 24); bh += 20; }
        it.x = sx; it.y = sy + (bar ? 8 : 0); it.w = bw; it.h = bh;
        it.priority = labelPriority(who, 'tag', this.shownBefore.has(it.id)) + (wantName && !bar ? nameA * 0.4 : 0);
        if (this.offscreen(it, w, h)) it = null;
        else { c.view.tagTop = it.y - it.h; c.view.tagFrame = this.frame; }
      }
      if (c.barkT > 0 && c.bark && d < 120) {
        const lines = this.wrap(c.bark);
        const b = this.item();
        b.c = c; b.kind = 'bubble'; b.id = c.id * 4 + 1; b.owner = c.id;
        b.lines = lines;
        let bw = 0;
        for (const l of lines) bw = Math.max(bw, this.width(BUBBLE_FONT, l));
        b.w = bw + 14; b.h = lines.length * 14 + 16;
        b.x = sx; b.y = it ? it.y - it.h - 4 : sy - 4;
        b.alpha = Math.min(1, c.barkT * 2) * alpha;
        b.priority = labelPriority(who, 'bubble', this.shownBefore.has(b.id));
        this.offscreen(b, w, h);
      }
    }
    // floating texts: they fade with distance like names, and sit clear of their own person's name tag
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t -= dt;
      if (f.t <= 0) { this.floaters.splice(i, 1); continue; }
      const c = W.char(f.owner);
      const important = !!c && focus.has(c.id);
      const fade = nameAlpha(Math.hypot(f.x - camPos.x, f.y - camPos.y, f.z - camPos.z), important, h);
      if (fade <= 0.02) continue;
      if (!this.project(f.x, f.y + f.rise + (1.6 - f.t) * 0.6, f.z, cam, w, h)) continue;
      const it = this.item();
      it.f = f; it.kind = 'floater'; it.id = -f.id; it.owner = f.owner;
      it.w = this.width(FLOAT_FONT, f.text) + 4; it.h = 14;
      it.x = this.sx; it.y = this.sy + 3;
      const v = c?.view;
      if (v && v.tagFrame === this.frame && it.y > v.tagTop - 2 && it.y - it.h < v.tagTop + 40) it.y = v.tagTop - 2;
      it.slots = 2;
      it.alpha = Math.min(1, f.t * 2) * fade;
      const who: Importance = !c ? 'other' : important ? 'selected' : c.faction === 'player' ? 'mine' : 'foe';
      it.priority = labelPriority(who, 'floater', this.shownBefore.has(it.id));
      this.offscreen(it, w, h);
    }
    const shown = layoutLabels(items, this.n, this.out, LAYOUT, this.order);
    this.stats.labels = this.n; this.stats.shown = shown;
    // remember who made it on screen, so they are favoured next frame
    const now = this.shownNow;
    now.clear();
    for (let i = 0; i < this.n; i++) if (this.out[i].shown) now.add(items[i].id);
    this.shownNow = this.shownBefore; this.shownBefore = now;

    // draw: tags first, then bubbles over them, then damage numbers over everything
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < this.n; i++) {
        const o = this.out[i];
        if (!o.shown) continue;
        const it = items[i];
        if (pass === 0 && it.kind === 'tag') this.drawTag(g, it, it.y + o.dy);
        else if (pass === 1 && it.kind === 'bubble') { g.globalAlpha = it.alpha; this.bubble(g, it.x, it.y + o.dy, it.lines!); g.globalAlpha = 1; }
        else if (pass === 2 && it.kind === 'floater') {
          const f = it.f!;
          g.globalAlpha = it.alpha;
          g.font = FLOAT_FONT;
          const y = it.y + o.dy - 3;
          g.fillStyle = 'rgba(0,0,0,0.6)';
          g.fillText(f.text, it.x + 1, y + 1);
          g.fillStyle = f.color;
          g.fillText(f.text, it.x, y);
          g.globalAlpha = 1;
        }
      }
    }
    // marquee
    if (this.box) {
      const [x0, y0, x1, y1] = this.box;
      g.strokeStyle = 'rgba(180,230,140,0.9)';
      g.fillStyle = 'rgba(140,200,110,0.12)';
      g.lineWidth = 1;
      g.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      g.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
    this.ms += (performance.now() - t0 - this.ms) * 0.05;
  }

  /** A faint line from each of your fighters to its target, and from enemies to whoever of yours they are on. */
  private drawLines(W: World, cam: THREE.PerspectiveCamera, sel: Set<number>, w: number, h: number) {
    const g = this.ctx;
    let n = 0;
    g.lineWidth = 1.5;
    for (const c of W.active) {
      if (!c.view || !c.target || !c.up || !(c.drawn || c.atk)) continue;
      const t = W.char(c.target);
      if (!t || !t.view || !t.alive || t.carriedBy) continue;
      const ours = c.faction === 'player';
      if (!ours && t.faction !== 'player') continue;
      if (!this.project(c.x, c.y + 0.08, c.z, cam, w, h)) continue;
      const ax = this.sx, ay = this.sy;
      if (!this.project(t.x, t.y + 0.08, t.z, cam, w, h)) continue;
      const bx = this.sx, by = this.sy;
      if ((ax < 0 && bx < 0) || (ax > w && bx > w) || (ay < 0 && by < 0) || (ay > h && by > h)) continue;
      const lead = ours && sel.has(c.id);
      g.strokeStyle = ours ? (lead ? 'rgba(214,244,176,0.75)' : 'rgba(200,236,160,0.45)') : 'rgba(240,96,76,0.55)';
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
      // a dot where it lands, so the direction reads
      g.fillStyle = g.strokeStyle;
      g.beginPath();
      g.arc(bx, by, lead ? 3 : 2.2, 0, Math.PI * 2);
      g.fill();
      n++;
    }
    this.stats.lines = n;
  }

  private drawTag(g: CanvasRenderingContext2D, it: Item, bottom: number) {
    const c = it.c!;
    const sx = it.x;
    let y = bottom - (it.bar ? 8 : 0);
    g.globalAlpha = it.alpha;
    if (it.bar) {
      const vital = Math.max(0, c.body.vital());
      const tot = c.body.total();
      g.fillStyle = 'rgba(10,8,6,0.75)';
      g.fillRect(sx - BAR_W / 2 - 1, y - 1, BAR_W + 2, BAR_H + 2);
      g.fillStyle = '#5a1e14';
      g.fillRect(sx - BAR_W / 2, y, BAR_W, BAR_H);
      g.fillStyle = vital > 0.5 ? '#9cc070' : vital > 0.2 ? '#d8b048' : '#d0583a';
      g.fillRect(sx - BAR_W / 2, y, BAR_W * Math.min(1, tot), BAR_H);
      if (c.body.bleeding() > 0.02 && !c.body.robotic) {
        g.fillStyle = '#e03020';
        g.fillRect(sx - BAR_W / 2, y + BAR_H + 1, BAR_W * Math.min(1, c.body.blood / c.body.bloodMax), 2);
      }
      y -= 6;
    }
    if (it.name) {
      g.font = NAME_FONT;
      g.globalAlpha = it.alpha * it.nameA;
      const col = c.faction === 'player' ? '#d8f0b8' : this.W?.rel.hostile('player', c.faction) || (c.animal && ANIMAL[c.animal].diet !== 'grazer') ? '#f0a088' : '#e8dcc0';
      g.fillStyle = 'rgba(0,0,0,0.55)';
      const tw = this.width(NAME_FONT, it.name);
      g.fillRect(sx - tw / 2 - 4, y - 14, tw + 8, 15);
      g.fillStyle = col;
      g.fillText(it.name, sx, y - 3);
      if (it.sub) {
        g.font = SUB_FONT;
        g.fillStyle = '#b8ac90';
        g.fillText(it.sub, sx, y - 17);
        y -= 11;
      }
      y -= 16;
      g.globalAlpha = it.alpha;
    }
    if (it.sneak) {
      const seen = it.sneak === 2;
      const ex = sx, ey = y - 8;
      g.lineWidth = 1.6;
      g.strokeStyle = seen ? '#f0a050' : '#9cd080';
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath(); g.ellipse(ex, ey, 9, 5.5, 0, 0, Math.PI * 2); g.fill();
      g.beginPath();
      g.moveTo(ex - 7, ey); g.quadraticCurveTo(ex, ey - (seen ? 6 : 1), ex + 7, ey);
      g.quadraticCurveTo(ex, ey + (seen ? 6 : 3), ex - 7, ey);
      g.stroke();
      if (seen) { g.fillStyle = '#f0a050'; g.beginPath(); g.arc(ex, ey, 2, 0, Math.PI * 2); g.fill(); }
      g.font = '600 10px "Barlow Condensed", sans-serif';
      g.fillStyle = seen ? '#f0b070' : '#a8d890';
      g.fillText(seen ? 'SEEN' : 'HIDDEN', ex, ey - 9);
      y -= 20;
    }
    if (it.zz) {
      g.font = 'italic 600 12px Barlow, sans-serif';
      g.fillStyle = '#c8d0e8';
      g.fillText('z z', sx + 12, y - 2 + Math.sin(performance.now() / 400) * 2);
    }
    g.globalAlpha = 1;
  }

  private bubble(g: CanvasRenderingContext2D, x: number, y: number, lines: string[]) {
    g.font = BUBBLE_FONT;
    const lh = 14;
    let bw = 0;
    for (const l of lines) bw = Math.max(bw, this.width(BUBBLE_FONT, l));
    bw += 14;
    const bh = lines.length * lh + 8;
    const bx = x - bw / 2, by = y - bh - 8;
    g.fillStyle = 'rgba(236,228,208,0.94)';
    g.strokeStyle = 'rgba(60,48,32,0.9)';
    g.lineWidth = 1;
    g.beginPath();
    g.roundRect(bx, by, bw, bh, 5);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(x - 5, by + bh); g.lineTo(x, by + bh + 7); g.lineTo(x + 5, by + bh);
    g.fillStyle = 'rgba(236,228,208,0.94)';
    g.fill();
    g.fillStyle = '#2a2218';
    g.textAlign = 'center';
    for (let i = 0; i < lines.length; i++) g.fillText(lines[i], x, by + 16 + i * lh);
  }

  floater(c: Char, text: string, color: string) {
    // numbers landing on the same person in quick succession stack up rather than overprint
    let rise = 0;
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      if (f.owner === c.id) { if (f.t > 1.0) rise = f.rise + 0.3; break; }
    }
    this.floaters.push({ id: this.seq++, owner: c.id, x: c.x, y: c.y + (c.animal ? 1.2 : c.look.height), z: c.z, text, t: 1.4, color, rise });
  }

  /** Screen boxes of the labels shown last frame, for tests. */
  placed(): { id: number; owner: number; kind: string; x0: number; y0: number; x1: number; y1: number }[] {
    const out = [];
    for (let i = 0; i < this.n; i++) {
      const o = this.out[i];
      if (!o.shown) continue;
      const it = this.items[i];
      out.push({ id: it.id, owner: it.owner, kind: it.kind, x0: it.x - it.w / 2, y0: it.y + o.dy - it.h, x1: it.x + it.w / 2, y1: it.y + o.dy });
    }
    return out;
  }
}
