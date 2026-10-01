// Lockpicking: rotate the pick to find the sweet spot, then turn the lock.
// Straining in the wrong place bends the pick until it snaps.
// The lock is painted at the canvas's full display resolution: an iron
// escutcheon on an oak door, a brass plug turned by the tension wrench, the
// pick itself (which bends and shakes as it strains) and, in the corners, the
// pick's strength and the spares left in the pouch.

import './minigames.css';
import { openScreen, el, button } from '../ui';
import { input } from '../../engine/input';
import { skill, hasPerk, addXp } from '../../systems/stats';
import { removeItem, count } from '../../systems/inventory';
import { sfx } from '../../audio/sfx';
import { notify } from '../notify';
import { rand, clamp, lerp, RNG } from '../../engine/util';
import { G } from '../../G';
import { newCanvas, lit, dim, mix, rgba, ellipse, circle, roundRect, line, lin, rad, grain, type Ctx } from '../../gfx/paint';

export function lockpick(difficulty: number): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const W = 320, H = 220;
    const sweet = rand.range(-Math.PI * 0.85, -Math.PI * 0.15);
    const width = Math.max(0.07, 0.36 - difficulty * 0.055 + skill('thievery') * 0.022);
    let pick = -Math.PI / 2;
    let turn = 0; // 0..1
    let strain = 0;
    let hp = hasPerk('nimble') ? 1.6 : 1;
    let dragging = false;
    let turning = false;
    let done = false;
    let raf = 0;
    const close = openScreen('lockpick', (closeFn) => {
      const m = el('div', { cls: 'vellum mg mg-lock' });
      m.append(el('h2', { html: 'Picking the Lock' }));
      m.append(el('p', { cls: 'help', html: 'Move the pick around the lock with the mouse, drag, or ←/→. Hold <span class="kbd">Space</span> (or the Turn button) to turn. If the pick strains, you are in the wrong place. Difficulty: ' + '●'.repeat(difficulty) + '○'.repeat(Math.max(0, 5 - difficulty)) }));
      const c = document.createElement('canvas');
      c.className = 'mg-scene';
      c.width = W; c.height = H;
      c.style.maxWidth = '560px';
      c.style.alignSelf = 'center';
      c.style.aspectRatio = `${W} / ${H}`;
      m.append(c);
      const info = el('p', { cls: 'meta mg-caption', html: '' });
      m.append(info);
      const row = el('div', { cls: 'row', style: 'display:flex;gap:8px;justify-content:flex-end' } as never);
      const turnBtn = button('Turn (hold)', () => {});
      turnBtn.addEventListener('mousedown', () => (turning = true));
      turnBtn.addEventListener('touchstart', (e) => { e.preventDefault(); turning = true; }, { passive: false });
      const stop = () => (turning = false);
      turnBtn.addEventListener('mouseup', stop); turnBtn.addEventListener('mouseleave', stop); turnBtn.addEventListener('touchend', stop);
      row.append(button('Give up', () => { finish(false); }), turnBtn);
      m.append(row);
      const scene = new LockScene(c, W, H);
      const setFromPointer = (clientX: number, clientY: number) => {
        const r = c.getBoundingClientRect();
        const x = ((clientX - r.left) / r.width) * W - W / 2, y = ((clientY - r.top) / r.height) * H - 120;
        const a = Math.atan2(y, x);
        pick = Math.max(-Math.PI, Math.min(0, a));
      };
      c.addEventListener('mousemove', (e) => setFromPointer(e.clientX, e.clientY));
      c.addEventListener('touchstart', (e) => { dragging = true; setFromPointer(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
      c.addEventListener('touchmove', (e) => { if (dragging) setFromPointer(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
      c.addEventListener('touchend', () => (dragging = false));
      let last = performance.now();
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        result = ok;
        cancelAnimationFrame(raf);
        closeFn();
        resolve(ok);
      };
      const frame = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (input.down('left')) pick = Math.max(-Math.PI, pick - dt * 1.4);
        if (input.down('right')) pick = Math.min(0, pick + dt * 1.4);
        const holding = turning || input.down('dodge') || input.down('attack') || input.down('confirm');
        const off = Math.abs(pick - sweet);
        const maxTurn = off < width ? 1 : Math.max(0, 1 - (off - width) * 1.6);
        if (holding) {
          turn = Math.min(maxTurn, turn + dt * 1.1);
          if (turn >= maxTurn - 0.01 && maxTurn < 1) {
            strain += dt;
            hp -= dt * (0.55 + difficulty * 0.08);
            if (Math.random() < dt * 6) sfx('lockclick');
            if (hp <= 0) {
              sfx('lockbreak');
              removeItem('lockpick', 1);
              notify(count('lockpick') > 0 ? `The pick snaps. ${count('lockpick')} left.` : 'Your last pick snaps.', 'bad', 2200);
              if (count('lockpick') <= 0) { finish(false); return; }
              hp = hasPerk('nimble') ? 1.6 : 1;
              turn = 0;
            }
          } else strain = Math.max(0, strain - dt);
        } else {
          turn = Math.max(0, turn - dt * 2);
          strain = 0;
        }
        if (turn >= 0.999) {
          sfx('unlock');
          addXp('thievery', 4 + difficulty * 2);
          finish(true);
          return;
        }
        // draw
        if (c.isConnected) scene.draw({ pick, turn, strain, hp, maxHp: hasPerk('nimble') ? 1.6 : 1, picks: count('lockpick'), holding }, dt);
        info.textContent = `Lockpicks: ${count('lockpick')}`;
        if (!done && G.mode === 'menu') raf = requestAnimationFrame(frame);
        else if (!done) finish(false);
      };
      raf = requestAnimationFrame(frame);
      return m;
    });
    void close;
    void result;
  });
}

// ================================================================ the lock

interface LockView { pick: number; turn: number; strain: number; hp: number; maxHp: number; picks: number; holding: boolean }
interface Bit { x: number; y: number; vx: number; vy: number; a: number; va: number; l: number; l0: number; kind: 'glint' | 'shard' | 'pick' }

const TAU = Math.PI * 2;
const CX = 160, CY = 120;       // the lock's centre; the pointer maths above uses the same point
const R_HOUSING = 80, R_BEZEL = 66, R_PLUG = 53;
const PICK_TIP = 5, PICK_SHAFT = 94, PICK_END = 132;
const GX = 5, GY = 190;          // the strength gauge (bottom left)
const PX = 262, PY = 150;        // the pouch of spare picks (bottom right)

const IRON = ['#121315', '#1d1f23', '#2b2e33', '#3e4248', '#585d64', '#7d838b', '#b4bac1'];
const BRASS = ['#3a2a0e', '#6a4c18', '#9c7428', '#c49a40', '#e2c26c', '#f6e6ae'];
const OAK = '#5e3e24';

/** Matches the canvas's backing store to its displayed size x devicePixelRatio (capped at 2); returns device pixels per logical unit. */
function fitCanvas(c: HTMLCanvasElement, W: number, H: number): number {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const bw = Math.max(1, Math.round((c.clientWidth || W) * dpr));
  const bh = Math.max(1, Math.round((bw * H) / W));
  if (c.width !== bw || c.height !== bh) { c.width = bw; c.height = bh; }
  return bw / W;
}

class LockScene {
  private g: Ctx;
  private bg: HTMLCanvasElement | null = null;
  private k = 0;
  private t = 0;
  private bits: Bit[] = [];
  private lastHp = -1;
  private lastPick = 0;
  private snapT = 0;

  constructor(private c: HTMLCanvasElement, private W: number, private H: number) {
    this.g = c.getContext('2d')!;
  }

  draw(v: LockView, dt: number) {
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
      paintDoorAndPlate(bg, W, H);
      grain(this.bg, 7, 23);
    }
    // a snapped pick: the old one's outer half drops away
    if (this.lastHp >= 0 && v.hp > this.lastHp + 0.3) this.snap(this.lastPick);
    this.lastHp = v.hp;
    this.lastPick = v.pick;
    this.snapT = Math.max(0, this.snapT - dt);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.drawImage(this.bg!, 0, 0, W, H);

    const straining = v.strain > 0;
    const jitter = straining ? (Math.random() - 0.5) * 0.02 : 0;
    const ang = v.turn * Math.PI / 2 + jitter;
    this.drawTurnArc(g, v.turn);
    this.drawPlug(g, ang);
    wrench(g, ang, v.holding);
    // the pick: bends under strain, and more as it weakens
    const wear = 1 - clamp(v.hp / v.maxHp, 0, 1);
    const bend = (straining ? Math.min(1, v.strain * 2.2) * 5 : 0) + wear * 2.4;
    const sx = straining ? (Math.random() - 0.5) * 4 : 0, sy = straining ? (Math.random() - 0.5) * 4 : 0;
    const cracked = wear > 0.55;
    if (this.snapT <= 0.12) pickTool(g, CX, CY, v.pick, bend, sx, sy, wear, cracked, t);
    if (straining && Math.random() < dt * (10 + v.strain * 20)) {
      const a = v.pick + (Math.random() - 0.5) * 0.6;
      for (let i = 0; i < 2; i++) {
        const s = 20 + Math.random() * 50, d = a + Math.PI + (Math.random() - 0.5) * 2;
        this.bits.push({ x: CX + Math.cos(v.pick) * 7, y: CY + Math.sin(v.pick) * 7, vx: Math.cos(d) * s, vy: Math.sin(d) * s, a: 0, va: 0, l: 0.14, l0: 0.14, kind: 'glint' });
      }
    }
    this.updateBits(g, dt, wear);

    this.drawStrengthGauge(g, v, t);
    this.drawRoll(g, v.picks);

    // candlelight flickers across the door; strain darkens the edges with red
    const fl = 0.5 + 0.5 * Math.sin(t * 3.1) * Math.sin(t * 1.7 + 1);
    g.fillStyle = rad(g, 40, 10, 10, 60, 40, 260, [[0, rgba('#ffcf8a', 0.06 + 0.03 * fl)], [1, 'rgba(0,0,0,0)']]);
    g.fillRect(0, 0, W, H);
    if (straining) {
      const a = Math.min(0.32, v.strain * 0.35) * (0.8 + 0.2 * Math.sin(t * 30));
      g.fillStyle = rad(g, CX, CY, 60, CX, CY, 220, [[0, 'rgba(120,10,0,0)'], [1, rgba('#7a1206', a)]]);
      g.fillRect(0, 0, W, H);
    }
    if (this.snapT > 0) {
      g.fillStyle = rgba('#ffffff', this.snapT * 0.8);
      g.fillRect(0, 0, W, H);
    }
    g.fillStyle = rad(g, W * 0.5, H * 0.52, H * 0.4, W * 0.5, H * 0.52, W * 0.7, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(8,4,2,0.55)']]);
    g.fillRect(0, 0, W, H);
  }

  private snap(a: number) {
    this.snapT = 0.2;
    const ux = Math.cos(a), uy = Math.sin(a);
    // the handle half falls away, spinning; a few shards of steel
    this.bits.push({ x: CX + ux * 40, y: CY + uy * 40, vx: ux * 30 + (Math.random() - 0.5) * 20, vy: uy * 30 - 40, a, va: (Math.random() < 0.5 ? -1 : 1) * (3 + Math.random() * 3), l: 1.2, l0: 1.2, kind: 'pick' });
    for (let i = 0; i < 7; i++) {
      const d = Math.random() * TAU, s = 30 + Math.random() * 70;
      this.bits.push({ x: CX + ux * 30, y: CY + uy * 30, vx: Math.cos(d) * s, vy: Math.sin(d) * s - 30, a: Math.random() * TAU, va: (Math.random() - 0.5) * 20, l: 0.6 + Math.random() * 0.4, l0: 1, kind: 'shard' });
    }
  }

  private updateBits(g: Ctx, dt: number, wear: number) {
    for (let i = this.bits.length - 1; i >= 0; i--) {
      const b = this.bits[i];
      b.l -= dt;
      if (b.l <= 0) { this.bits.splice(i, 1); continue; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
      if (b.kind !== 'glint') b.vy += 260 * dt;
      const a = clamp(b.l / b.l0, 0, 1);
      if (b.kind === 'glint') {
        g.save();
        g.globalCompositeOperation = 'lighter';
        g.strokeStyle = rgba('#fff6e0', 0.9 * a);
        g.lineWidth = 0.6;
        g.beginPath(); g.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03); g.lineTo(b.x, b.y); g.stroke();
        g.restore();
      } else if (b.kind === 'shard') {
        g.save();
        g.translate(b.x, b.y); g.rotate(b.a);
        g.globalAlpha = Math.min(1, a * 2);
        g.fillStyle = lin(g, -1.5, 0, 1.5, 0, [[0, '#e8edf2'], [1, '#5a6068']]);
        g.fillRect(-1.6, -0.4, 3.2, 0.8);
        g.restore();
      } else {
        // the broken-off half of the pick: handle and a stub of shaft
        g.save();
        g.globalAlpha = Math.min(1, a * 2.5);
        g.translate(b.x, b.y); g.rotate(b.a);
        pickHalf(g, wear);
        g.restore();
      }
    }
  }

  // ------------------------------------------------ the plug and the travel it has made

  private drawTurnArc(g: Ctx, turn: number) {
    if (turn <= 0.005) return;
    // a thread of light along the bezel shows how far the plug has turned
    const r = (R_BEZEL + R_PLUG) / 2 + 3.5;
    const a0 = -Math.PI / 2, a1 = a0 + turn * Math.PI / 2;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = rgba('#ffd98a', 0.3 + 0.4 * turn);
    g.lineWidth = 2.2;
    g.beginPath(); g.arc(CX, CY, r, a0, a1); g.stroke();
    g.strokeStyle = rgba('#fff4d0', 0.7);
    g.lineWidth = 0.7;
    g.beginPath(); g.arc(CX, CY, r, a0, a1); g.stroke();
    g.restore();
  }

  private drawPlug(g: Ctx, ang: number) {
    // shaded in place (the light doesn't turn with it); the cut details turn
    circle(g, CX, CY, R_PLUG + 1.6, '#0a0806');
    circle(g, CX, CY, R_PLUG, rad(g, CX - 18, CY - 22, 3, CX + 4, CY + 4, R_PLUG * 1.08, [[0, BRASS[5]], [0.3, BRASS[4]], [0.7, BRASS[2]], [1, BRASS[1]]]));
    g.save();
    g.translate(CX, CY);
    g.rotate(ang);
    // turned rings
    for (const r of [R_PLUG - 7, R_PLUG - 17]) {
      g.strokeStyle = rgba(BRASS[0], 0.55); g.lineWidth = 0.7;
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
      g.strokeStyle = rgba(BRASS[5], 0.35); g.lineWidth = 0.5;
      g.beginPath(); g.arc(0.5, 0.6, r, Math.PI * 0.1, Math.PI * 0.9); g.stroke();
    }
    // the index mark at the top, and two pins
    g.fillStyle = BRASS[0];
    g.beginPath(); g.moveTo(-2.4, -R_PLUG + 0.5); g.lineTo(2.4, -R_PLUG + 0.5); g.lineTo(0, -R_PLUG + 6); g.closePath(); g.fill();
    for (const [x, y] of [[-28, 22], [28, 22]]) {
      circle(g, x, y, 3, rad(g, x - 1, y - 1, 0.2, x, y, 3, [[0, BRASS[4]], [1, BRASS[1]]]));
      line(g, x - 2, y, x + 2, y, rgba(BRASS[0], 0.8), 0.7);
    }
    // the keyhole, with its lower-right inner wall catching the light
    keyholePath(g, 1.8);
    g.fillStyle = rgba(BRASS[5], 0.4);
    g.fill();
    keyholePath(g, 0);
    g.fillStyle = rad(g, 0, -4, 1, 0, 0, 20, [[0, '#040303'], [1, '#150f0a']]);
    g.fill();
    g.restore();
    // the keyhole's lit lip, placed in screen space so the light stays put
    g.save();
    g.translate(CX, CY); g.rotate(ang);
    g.save(); keyholePath(g, 0); g.clip();
    g.rotate(-ang);
    g.fillStyle = lin(g, -8, -8, 8, 8, [[0, 'rgba(0,0,0,0)'], [0.75, 'rgba(0,0,0,0)'], [1, rgba(BRASS[3], 0.55)]]);
    g.fillRect(-20, -30, 40, 60);
    g.restore();
    g.restore();
    // a soft sheen on the brass
    g.fillStyle = rad(g, CX - 20, CY - 24, 0, CX - 20, CY - 24, 26, [[0, 'rgba(255,248,220,0.35)'], [1, 'rgba(255,248,220,0)']]);
    g.beginPath(); g.arc(CX, CY, R_PLUG, 0, TAU); g.fill();
    // the plug sits a little below the bezel
    g.strokeStyle = 'rgba(10,6,2,0.55)'; g.lineWidth = 2.2;
    g.beginPath(); g.arc(CX + 0.6, CY + 0.8, R_PLUG - 0.8, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  }

  // ------------------------------------------------ the pick's strength and the spares

  private drawStrengthGauge(g: Ctx, v: LockView, t: number) {
    const x0 = GX + 25, y0 = GY + 8.5, w = 34, h = 7;
    const f = clamp(v.hp / v.maxHp, 0, 1);
    const weak = f < 0.4;
    const col = f > 0.6 ? mix('#c8d4de', '#9fb4c8', (1 - f) * 2) : f > 0.4 ? mix('#e8b050', '#c8d4de', (f - 0.4) * 5) : mix('#d8402a', '#e8a040', f / 0.4);
    if (f > 0) {
      g.save();
      roundRect(g, x0, y0, w, h, h / 2); g.clip();
      g.fillStyle = lin(g, 0, y0, 0, y0 + h, [[0, lit(col, 0.5)], [0.45, col], [1, dim(col, 0.45)]]);
      g.fillRect(x0, y0, w * f, h);
      // a bright end, like the tip of a drawn spring
      g.fillStyle = lin(g, x0 + w * f - 3, 0, x0 + w * f, 0, [[0, 'rgba(255,255,255,0)'], [1, 'rgba(255,255,255,0.55)']]);
      g.fillRect(x0 + w * f - 3, y0, 3, h);
      g.restore();
    }
    if (weak) {
      const p = 0.5 + 0.5 * Math.sin(t * 9);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.fillStyle = rad(g, x0 + w * 0.3, y0 + h / 2, 0, x0 + w * 0.3, y0 + h / 2, 26, [[0, rgba('#ff5a2a', 0.18 + 0.2 * p)], [1, 'rgba(0,0,0,0)']]);
      g.fillRect(x0 - 26, y0 - 20, w + 52, h + 40);
      g.restore();
    }
    // the glass over it
    g.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(g, x0 + 2, y0 + 0.9, w - 4, 1.4, 0.7); g.fill();
  }

  private drawRoll(g: Ctx, n: number) {
    // spare picks in the pouch: handles up, one per pick left (up to six)
    const shown = Math.min(n, 6);
    for (let i = 0; i < shown; i++) {
      const x = PX + 8 + i * 6.8, y = PY + 3 - (i % 2) * 2.5;
      g.save();
      g.translate(x, y);
      g.rotate(-0.08 + (i % 3) * 0.06);
      roundRect(g, -1.9, -14, 3.8, 13, 1.6, lin(g, -1.9, 0, 1.9, 0, [[0, '#b07a48'], [0.5, '#8a5a32'], [1, '#3e2412']]), '#1a0c04', 0.3);
      for (let yy = -10; yy < -3; yy += 1.4) line(g, -1.8, yy, 1.8, yy + 0.7, 'rgba(40,24,12,0.55)', 0.45);
      roundRect(g, -1.6, -1.6, 3.2, 2.2, 0.6, lin(g, 0, -1.6, 0, 0.6, [[0, BRASS[5]], [1, BRASS[1]]]));
      g.restore();
    }
    // the pouch's front lip over them
    roundRect(g, PX, PY + 2, 50, 7, 3, lin(g, 0, PY + 2, 0, PY + 9, [[0, '#9a6a40'], [1, '#5a3a20']]), '#140a04', 0.5);
    g.setLineDash([1.2, 1.2]);
    line(g, PX + 3, PY + 7, PX + 47, PY + 7, 'rgba(240,210,160,0.5)', 0.4);
    g.setLineDash([]);
    if (n > 6) {
      g.fillStyle = '#f0dcb0';
      g.font = '600 8px Georgia, serif';
      g.textAlign = 'center';
      g.fillText('+' + (n - 6), PX + 25, PY + 36);
      g.textAlign = 'start';
    }
  }

}

// ---------------------------------------------------------------- tools

/** The keyhole, round head up, in plug coordinates; `grow` widens it (for the lip). */
function keyholePath(g: Ctx, grow: number) {
  const r = 8.4 + grow;
  const a = Math.asin(Math.min(0.99, (3.1 + grow) / r));
  g.beginPath();
  g.arc(0, -11, r, Math.PI / 2 + a, Math.PI / 2 - a + TAU);
  g.lineTo(6.6 + grow, 17 + grow);
  g.quadraticCurveTo(0, 18.4 + grow, -6.6 - grow, 17 + grow);
  g.closePath();
}

/** The tension wrench, seated in the bottom of the keyhole, turning with the plug. */
function wrench(g: Ctx, ang: number, holding: boolean) {
  g.save();
  g.translate(CX, CY);
  g.rotate(ang);
  // shadow on the plug and plate
  g.save();
  g.translate(1.4, 2);
  g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 3.4;
  g.beginPath(); g.moveTo(0, 10); g.lineTo(0, 17); g.quadraticCurveTo(0, 21, 4, 24); g.lineTo(40, 58); g.stroke();
  g.restore();
  const steel = lin(g, -6, 0, 40, 60, [[0, '#9aa6b4'], [0.4, '#5d6a78'], [1, '#2c333c']]);
  g.strokeStyle = steel; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, 10); g.lineTo(0, 17); g.quadraticCurveTo(0, 21, 4, 24); g.lineTo(40, 58); g.stroke();
  g.strokeStyle = 'rgba(230,238,246,0.55)'; g.lineWidth = 0.7;
  g.beginPath(); g.moveTo(-0.8, 11); g.lineTo(-0.8, 17); g.quadraticCurveTo(-0.6, 21.6, 3.2, 24.6); g.lineTo(39, 58.4); g.stroke();
  // a thumb-tab at the end, pressed while turning
  g.save();
  g.translate(40, 58);
  g.rotate(Math.atan2(34, 36));
  roundRect(g, -2, -3.6, 10, 7.2, 2.4, lin(g, 0, -3.6, 0, 3.6, [[0, holding ? '#c8d0da' : '#98a4b2'], [1, '#2c333c']]), '#0c0e10', 0.4);
  line(g, 1, -2, 6, -2, 'rgba(255,255,255,0.4)', 0.5);
  g.restore();
  g.restore();
}

/** The pick from the keyhole outward at angle a: steel shaft with a hook, bound wooden handle. */
function pickTool(g: Ctx, cx: number, cy: number, a: number, bend: number, sx: number, sy: number, wear: number, cracked: boolean, t: number) {
  const ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  const tx = cx + ux * PICK_TIP, ty = cy + uy * PICK_TIP;
  const ex = cx + ux * PICK_SHAFT + sx, ey = cy + uy * PICK_SHAFT + sy;
  const mx = (tx + ex) / 2 + nx * bend, my = (ty + ey) / 2 + ny * bend;
  // shadow
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2.2;
  g.beginPath(); g.moveTo(tx + 1.5, ty + 2); g.quadraticCurveTo(mx + 1.5, my + 2, ex + 1.5, ey + 2); g.stroke();
  // the shaft; a strained pick turns faintly blue-hot where it bends
  const shaft = mix('#c9d2dc', '#8a96a6', wear);
  g.strokeStyle = lin(g, tx, ty, ex, ey, [[0, '#dfe6ee'], [0.5, shaft], [1, '#7a848f']]);
  g.lineWidth = 1.8;
  g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(mx, my, ex, ey); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.5;
  g.beginPath(); g.moveTo(tx - nx * 0.5, ty - ny * 0.5); g.quadraticCurveTo(mx - nx * 0.5, my - ny * 0.5, ex - nx * 0.5, ey - ny * 0.5); g.stroke();
  // the hook at the tip
  g.strokeStyle = '#dfe6ee'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(tx + ux * 1.5, ty + uy * 1.5); g.quadraticCurveTo(tx - ux * 1, ty - uy * 1, tx - ux * 0.5 - nx * 3.2, ty - uy * 0.5 - ny * 3.2); g.stroke();
  if (cracked) {
    // a hairline crack where it keeps bending
    const cxk = lerp(tx, ex, 0.42) + nx * bend * 0.9, cyk = lerp(ty, ey, 0.42) + ny * bend * 0.9;
    const pulse = 0.6 + 0.4 * Math.sin(t * 12);
    g.strokeStyle = rgba('#200808', 0.85); g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(cxk - nx * 1.1, cyk - ny * 1.1); g.lineTo(cxk + ux * 0.6 + nx * 0.2, cyk + uy * 0.6 + ny * 0.2); g.lineTo(cxk + nx * 1.1, cyk + ny * 1.1); g.stroke();
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = rad(g, cxk, cyk, 0, cxk, cyk, 5, [[0, rgba('#ff6a3a', 0.35 * pulse * wear)], [1, 'rgba(0,0,0,0)']]);
    g.beginPath(); g.arc(cxk, cyk, 5, 0, TAU); g.fill();
    g.restore();
  }
  // the handle
  g.save();
  g.translate(ex, ey);
  g.rotate(Math.atan2(ey - my, ex - mx));
  handle(g);
  g.restore();
}

function handle(g: Ctx) {
  const L = PICK_END - PICK_SHAFT;
  ellipse(g, L / 2 + 1.5, 2.4, L / 2 + 2, 3.4, 'rgba(0,0,0,0.35)');
  // brass ferrule
  roundRect(g, -1, -2.6, 5, 5.2, 1, lin(g, 0, -2.6, 0, 2.6, [[0, BRASS[5]], [0.4, BRASS[3]], [1, BRASS[0]]]));
  // wood, bound with cord
  roundRect(g, 3.5, -3.2, L - 3.5, 6.4, 3, lin(g, 0, -3.2, 0, 3.2, [[0, '#b07a48'], [0.35, '#8a5a32'], [1, '#3e2412']]));
  for (let x = 7; x < 17; x += 1.7) line(g, x, -3.1, x + 1.1, 3.1, 'rgba(40,24,12,0.6)', 0.55);
  for (let x = 7.4; x < 17; x += 1.7) line(g, x, -2.8, x + 0.6, 0.2, 'rgba(230,200,150,0.4)', 0.4);
  line(g, 19, -1.6, L - 3, -1.6, 'rgba(255,230,190,0.28)', 0.6);
  circle(g, L - 3, 0, 1.2, '#2a180c');
}

function pickHalf(g: Ctx, wear: number) {
  // shaft stub then the handle, along +x from the break
  line(g, -40 + PICK_TIP + 36, 0, 0, 0, mix('#c9d2dc', '#8a96a6', wear), 1.8);
  g.save();
  g.translate(PICK_SHAFT - 40, 0);
  handle(g);
  g.restore();
}

// ---------------------------------------------------------------- painting the door and the lock (static)

function rivet(g: Ctx, x: number, y: number, r: number, pal: string[] = IRON) {
  ellipse(g, x + r * 0.35, y + r * 0.5, r, r, 'rgba(6,4,2,0.55)');
  circle(g, x, y, r, rad(g, x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r, [[0, pal[5]], [0.5, pal[3]], [1, pal[1]]]));
}

function paintDoorAndPlate(g: Ctx, W: number, H: number) {
  const rng = new RNG(41);
  // ---- oak planks
  g.fillStyle = '#1a100a';
  g.fillRect(0, 0, W, H);
  let x = -12;
  while (x < W) {
    const w = 38 + rng.next() * 16;
    const col = mix(OAK, rng.next() < 0.5 ? '#6e4a2c' : '#4a3020', rng.next() * 0.6);
    g.fillStyle = lin(g, x, 0, x + w, 0, [[0, lit(col, 0.12)], [0.2, col], [0.85, dim(col, 0.2)], [1, dim(col, 0.45)]]);
    g.fillRect(x + 0.8, 0, w - 1.6, H);
    g.save();
    g.beginPath(); g.rect(x + 0.8, 0, w - 1.6, H); g.clip();
    for (let i = 0; i < 18; i++) {
      const gx = x + 2 + rng.next() * (w - 4), amp = 0.4 + rng.next() * 1.4, ph = rng.next() * TAU, fr = 0.02 + rng.next() * 0.03;
      g.strokeStyle = rgba(rng.next() < 0.7 ? dim(col, 0.5) : lit(col, 0.35), 0.18 + rng.next() * 0.2);
      g.lineWidth = 0.3 + rng.next() * 0.5;
      g.beginPath();
      for (let y = -4; y <= H + 4; y += 6) { const xx = gx + Math.sin(y * fr + ph) * amp; if (y < 0) g.moveTo(xx, y); else g.lineTo(xx, y); }
      g.stroke();
    }
    if (rng.next() < 0.6) {
      const kx = x + 6 + rng.next() * (w - 12), ky = 20 + rng.next() * (H - 40);
      ellipse(g, kx, ky, 3.2, 5.5, rgba(dim(col, 0.5), 0.6));
      ellipse(g, kx, ky, 1.6, 3, dim(col, 0.65));
      g.strokeStyle = rgba(dim(col, 0.45), 0.35); g.lineWidth = 0.5;
      for (const s of [1.8, 2.6]) { g.beginPath(); g.ellipse(kx, ky, 3.2 * s * 0.6, 5.5 * s * 0.6, 0, 0, TAU); g.stroke(); }
    }
    g.restore();
    // clench nails where the ledges run behind
    for (const ny of [18, 202]) rivet(g, x + w / 2, ny + (rng.next() - 0.5) * 2, 2, IRON);
    x += w;
  }
  // ---- warm light from the upper left, dark lower right
  g.save();
  g.globalCompositeOperation = 'soft-light';
  g.fillStyle = rad(g, 30, 10, 10, 90, 60, 330, [[0, 'rgba(255,200,130,0.9)'], [0.5, 'rgba(120,80,40,0.3)'], [1, 'rgba(0,0,0,0.9)']]);
  g.fillRect(0, 0, W, H);
  g.restore();

  // ---- the escutcheon: an iron plate with an engraved border
  const px0 = 72, py0 = 30, px1 = 248, py1 = 210, pr = 20;
  roundRect(g, px0 + 3, py0 + 5, px1 - px0, py1 - py0, pr, 'rgba(0,0,0,0.5)');
  roundRect(g, px0, py0, px1 - px0, py1 - py0, pr, lin(g, px0, py0, px1, py1, [[0, IRON[5]], [0.25, IRON[4]], [0.6, IRON[3]], [1, IRON[1]]]), '#050404', 0.8);
  g.save();
  roundRect(g, px0, py0, px1 - px0, py1 - py0, pr); g.clip();
  for (let i = 0; i < 260; i++) ellipse(g, px0 + rng.next() * (px1 - px0), py0 + rng.next() * (py1 - py0), 0.3 + rng.next() * 1.1, 0.2 + rng.next() * 0.7, rgba(rng.next() < 0.6 ? '#0c0d0f' : '#9aa0a8', 0.2));
  // bevelled edge: light on the upper left, dark on the lower right
  g.strokeStyle = 'rgba(220,228,236,0.35)'; g.lineWidth = 2.4;
  roundRect(g, px0 + 1.2, py0 + 1.2, px1 - px0 - 2.4, py1 - py0 - 2.4, pr - 1); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2.4;
  roundRect(g, px0 + 2.6, py0 + 2.6, px1 - px0 - 2.4, py1 - py0 - 2.4, pr - 1); g.stroke();
  g.restore();
  // engraved border and corner scrolls
  const eng = (path: () => void) => {
    g.save(); g.translate(0.5, 0.6); path(); g.strokeStyle = 'rgba(200,210,220,0.3)'; g.lineWidth = 0.6; g.stroke(); g.restore();
    path(); g.strokeStyle = 'rgba(6,6,8,0.8)'; g.lineWidth = 0.7; g.stroke();
  };
  eng(() => roundRect(g, px0 + 9, py0 + 9, px1 - px0 - 18, py1 - py0 - 18, pr - 7));
  for (const [cx0, cy0, sxx, syy] of [[px0 + 9, py0 + 9, 1, 1], [px1 - 9, py0 + 9, -1, 1], [px0 + 9, py1 - 9, 1, -1], [px1 - 9, py1 - 9, -1, -1]]) {
    eng(() => {
      g.beginPath();
      g.moveTo(cx0 + sxx * 8, cy0 + syy * 30);
      g.bezierCurveTo(cx0 + sxx * 10, cy0 + syy * 14, cx0 + sxx * 16, cy0 + syy * 10, cx0 + sxx * 30, cy0 + syy * 8);
      g.moveTo(cx0 + sxx * 14, cy0 + syy * 22);
      g.bezierCurveTo(cx0 + sxx * 14, cy0 + syy * 15, cx0 + sxx * 20, cy0 + syy * 13, cx0 + sxx * 22, cy0 + syy * 17);
      g.bezierCurveTo(cx0 + sxx * 23, cy0 + syy * 20, cx0 + sxx * 19, cy0 + syy * 21, cx0 + sxx * 18, cy0 + syy * 19);
    });
  }
  for (const [rx, ry] of [[px0 + 14, py0 + 14], [px1 - 14, py0 + 14], [px0 + 14, py1 - 14], [px1 - 14, py1 - 14], [CX, py0 + 8], [CX, py1 - 8], [px0 + 8, CY], [px1 - 8, CY]]) rivet(g, rx, ry, 2.6);

  // ---- the housing ring
  circle(g, CX + 2, CY + 3, R_HOUSING + 1, 'rgba(0,0,0,0.5)');
  circle(g, CX, CY, R_HOUSING, lin(g, CX - R_HOUSING, CY - R_HOUSING, CX + R_HOUSING, CY + R_HOUSING, [[0, IRON[5]], [0.45, IRON[3]], [1, IRON[1]]]));
  circle(g, CX, CY, R_HOUSING - 5, lin(g, CX - R_HOUSING, CY - R_HOUSING, CX + R_HOUSING, CY + R_HOUSING, [[0, IRON[2]], [0.5, IRON[3]], [1, IRON[4]]]));
  g.strokeStyle = 'rgba(4,4,6,0.85)'; g.lineWidth = 0.8;
  g.beginPath(); g.arc(CX, CY, R_HOUSING, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(230,236,242,0.45)'; g.lineWidth = 0.8;
  g.beginPath(); g.arc(CX, CY, R_HOUSING - 1.2, Math.PI * 0.95, Math.PI * 1.6); g.stroke();
  g.strokeStyle = 'rgba(4,4,6,0.6)'; g.lineWidth = 0.7;
  g.beginPath(); g.arc(CX, CY, R_HOUSING - 5, 0, TAU); g.stroke();
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const sxp = CX + Math.cos(a) * (R_HOUSING - 7.5), syp = CY + Math.sin(a) * (R_HOUSING - 7.5);
    circle(g, sxp, syp, 2.3, rad(g, sxp - 0.8, syp - 0.8, 0.1, sxp, syp, 2.3, [[0, IRON[6]], [1, IRON[2]]]));
    line(g, sxp - Math.cos(a + 0.8) * 1.7, syp - Math.sin(a + 0.8) * 1.7, sxp + Math.cos(a + 0.8) * 1.7, syp + Math.sin(a + 0.8) * 1.7, IRON[0], 0.6);
  }

  // ---- the brass bezel with its marks: shut at the top, open a quarter turn round
  circle(g, CX, CY, R_BEZEL, lin(g, CX - R_BEZEL, CY - R_BEZEL, CX + R_BEZEL, CY + R_BEZEL, [[0, BRASS[5]], [0.35, BRASS[3]], [0.75, BRASS[2]], [1, BRASS[0]]]));
  g.strokeStyle = rgba(BRASS[0], 0.8); g.lineWidth = 0.7;
  g.beginPath(); g.arc(CX, CY, R_BEZEL - 0.5, 0, TAU); g.stroke();
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * TAU, long = i % 9 === 0;
    const r0 = R_BEZEL - (long ? 7 : 4), r1 = R_BEZEL - 1.8;
    line(g, CX + Math.cos(a) * r0, CY + Math.sin(a) * r0, CX + Math.cos(a) * r1, CY + Math.sin(a) * r1, rgba(BRASS[0], long ? 0.9 : 0.6), long ? 0.9 : 0.5);
  }
  // shut: a small engraved bar; open: a diamond
  g.fillStyle = BRASS[0];
  g.fillRect(CX - 3, CY - R_BEZEL + 1.6, 6, 2.2);
  g.beginPath(); g.moveTo(CX + R_BEZEL - 1.6, CY); g.lineTo(CX + R_BEZEL - 5, CY - 3); g.lineTo(CX + R_BEZEL - 8.4, CY); g.lineTo(CX + R_BEZEL - 5, CY + 3); g.closePath(); g.fill();
  g.fillStyle = rgba(BRASS[5], 0.6);
  g.beginPath(); g.moveTo(CX + R_BEZEL - 2.6, CY); g.lineTo(CX + R_BEZEL - 5, CY - 2); g.lineTo(CX + R_BEZEL - 5, CY); g.closePath(); g.fill();
  // the recess the plug turns in
  circle(g, CX, CY, R_PLUG + 3, lin(g, CX - R_PLUG, CY - R_PLUG, CX + R_PLUG, CY + R_PLUG, [[0, '#1a1208'], [1, BRASS[2]]]));

  // ---- the pick's strength gauge, bottom left: a brass-framed slot on a leather tag
  roundRect(g, GX + 1.5, GY + 2.5, 64, 22, 5, 'rgba(0,0,0,0.4)');
  roundRect(g, GX, GY, 64, 22, 5, lin(g, 0, GY, 0, GY + 22, [[0, '#6e4a2c'], [1, '#3a2414']]), '#140a04', 0.6);
  g.setLineDash([1.2, 1.2]);
  roundRect(g, GX + 2.4, GY + 2.4, 59.2, 17.2, 3.5, undefined, 'rgba(230,200,150,0.5)', 0.4);
  g.setLineDash([]);
  roundRect(g, GX + 23, GY + 7, 38, 10, 4, lin(g, 0, GY + 7, 0, GY + 17, [[0, BRASS[5]], [0.4, BRASS[3]], [1, BRASS[1]]]), '#1a1208', 0.4);
  roundRect(g, GX + 25, GY + 8.5, 34, 7, 3.5, lin(g, 0, GY + 8.5, 0, GY + 15.5, [[0, '#070504'], [1, '#1e160e']]));
  // a little pick, painted, as the label
  g.save();
  g.translate(GX + 5, GY + 14);
  g.rotate(-0.4);
  roundRect(g, 0, -1.8, 7, 3.6, 1.4, lin(g, 0, -1.8, 0, 1.8, [[0, '#b07a48'], [1, '#4a2c16']]));
  line(g, 7, 0, 15, 0, IRON[6], 0.9);
  line(g, 15, 0, 16.2, -1.4, IRON[6], 0.8);
  g.restore();
  // ---- the leather pouch for spare picks, bottom right
  const bx = PX, by = PY;
  roundRect(g, bx + 2, by + 3, 50, 58, 7, 'rgba(0,0,0,0.45)');
  roundRect(g, bx, by, 50, 58, 7, lin(g, bx, by, bx + 50, by + 58, [[0, '#8a5c36'], [0.5, '#6a4426'], [1, '#3a2414']]), '#140a04', 0.6);
  g.setLineDash([1.3, 1.3]);
  roundRect(g, bx + 3, by + 3, 44, 52, 5, undefined, 'rgba(240,210,160,0.45)', 0.45);
  g.setLineDash([]);
  g.save();
  roundRect(g, bx, by, 50, 58, 7); g.clip();
  for (let i = 0; i < 40; i++) ellipse(g, bx + rng.next() * 50, by + rng.next() * 58, 0.5 + rng.next() * 1.6, 0.4 + rng.next() * 1, rgba(rng.next() < 0.5 ? '#2a180c' : '#b08050', 0.15));
  g.restore();
  // the pouch hangs from a nail by a thong
  g.strokeStyle = '#3a2414'; g.lineWidth = 1.1;
  g.beginPath(); g.moveTo(bx + 12, by + 1); g.quadraticCurveTo(bx + 25, by - 12, bx + 38, by + 1); g.stroke();
  rivet(g, bx + 25, by - 8.5, 2);
}
