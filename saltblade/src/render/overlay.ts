// 2D overlay over the 3D view: names, health bars, speech, the selection
// marquee and move markers.
import * as THREE from 'three';
import { Char } from '../sim/char';
import { World } from '../sim/world';
import { FACTION } from '../content/factions';
import { ANIMAL } from '../content/animals';

const v = new THREE.Vector3();

export interface Marker { x: number; y: number; z: number; t: number; color: string; }

export class Overlay {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  box: [number, number, number, number] | null = null;
  markers: Marker[] = [];
  floaters: { x: number; y: number; z: number; text: string; t: number; color: string }[] = [];
  showAllNames = false;

  constructor(parent: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'overlay';
    this.canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;';
    parent.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d')!;
  }

  project(x: number, y: number, z: number, cam: THREE.Camera, w: number, h: number): [number, number, boolean] {
    v.set(x, y, z).project(cam);
    return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h, v.z < 1 && v.z > -1];
  }

  draw(W: World, cam: THREE.PerspectiveCamera, sel: Set<number>, hover: number, dt: number) {
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
    // move markers
    for (let i = this.markers.length - 1; i >= 0; i--) {
      const m = this.markers[i];
      m.t -= dt;
      if (m.t <= 0) { this.markers.splice(i, 1); continue; }
      const [sx, sy, ok] = this.project(m.x, m.y, m.z, cam, w, h);
      if (!ok) continue;
      const k = m.t / 0.8;
      g.strokeStyle = m.color;
      g.globalAlpha = k;
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(sx, sy, 14 * (1.4 - k * 0.4), 6 * (1.4 - k * 0.4), 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;
    }
    for (const c of W.active) {
      if (!c.view || c.carriedBy) continue;
      const d = Math.hypot(c.x - camPos.x, c.y - camPos.y, c.z - camPos.z);
      if (d > 160) continue;
      const height = c.animal ? ANIMAL[c.animal].size * 1.3 + 0.4 : c.look.height + 0.25;
      const lying = c.status !== 'up' || c.knockT > 0 || c.bed || c.cage;
      const [sx, sy, ok] = this.project(c.x, c.y + (lying ? 0.7 : height), c.z, cam, w, h);
      if (!ok || sx < -50 || sy < -50 || sx > w + 50 || sy > h + 50) continue;
      const isSel = sel.has(c.id), isHover = hover === c.id;
      const hurt = c.body.total() < 0.99 || c.body.bleeding() > 0.01;
      const fighting = c.drawn || !!c.atk;
      const alpha = Math.max(0.25, Math.min(1, 1.4 - d / 120));
      g.globalAlpha = alpha;
      let y = sy;
      // health bar
      if ((hurt || fighting || isSel || isHover) && c.alive && d < 110) {
        const bw = 44, bh = 4;
        const vital = Math.max(0, c.body.vital());
        const tot = c.body.total();
        g.fillStyle = 'rgba(10,8,6,0.75)';
        g.fillRect(sx - bw / 2 - 1, y - 1, bw + 2, bh + 2);
        g.fillStyle = '#5a1e14';
        g.fillRect(sx - bw / 2, y, bw, bh);
        g.fillStyle = vital > 0.5 ? '#9cc070' : vital > 0.2 ? '#d8b048' : '#d0583a';
        g.fillRect(sx - bw / 2, y, bw * Math.min(1, tot), bh);
        if (c.body.bleeding() > 0.02 && !c.body.robotic) {
          g.fillStyle = '#e03020';
          g.fillRect(sx - bw / 2, y + bh + 1, bw * Math.min(1, c.body.blood / c.body.bloodMax), 2);
        }
        y -= 6;
      }
      // name
      if (isSel || isHover || this.showAllNames || c.barkT > 0) {
        g.font = '600 12px "Barlow Condensed", sans-serif';
        const f = FACTION[c.faction];
        const col = c.faction === 'player' ? '#d8f0b8' : W.rel.hostile('player', c.faction) || (c.animal && ANIMAL[c.animal].diet !== 'grazer') ? '#f0a088' : '#e8dcc0';
        const label = c.status === 'dead' ? `${c.name} (dead)` : c.status === 'ko' ? `${c.name} (unconscious)` : c.name;
        g.fillStyle = 'rgba(0,0,0,0.55)';
        const tw = g.measureText(label).width;
        g.fillRect(sx - tw / 2 - 4, y - 14, tw + 8, 15);
        g.fillStyle = col;
        g.fillText(label, sx, y - 3);
        if ((isHover || isSel) && f && !c.animal && c.faction !== 'player') {
          g.font = '500 10px "Barlow Condensed", sans-serif';
          g.fillStyle = '#b8ac90';
          g.fillText(c.title ? `${c.title} · ${f.short}` : f.short, sx, y - 17);
          y -= 11;
        }
        y -= 16;
      }
      if (c.faction === 'player' && c.move === 'sneak' && c.status === 'up' && c.mem.seenBy !== undefined) {
        const seen = !!c.mem.seenBy;
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
      if (c.sleeping && c.status === 'up') {
        g.font = 'italic 600 12px Barlow, sans-serif';
        g.fillStyle = '#c8d0e8';
        g.fillText('z z', sx + 12, y - 2 + Math.sin(performance.now() / 400) * 2);
      }
      // speech
      if (c.barkT > 0 && c.bark) {
        g.globalAlpha = Math.min(1, c.barkT * 2) * alpha;
        this.bubble(g, sx, y - 4, c.bark);
      }
      g.globalAlpha = 1;
    }
    // floating texts
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.t -= dt;
      if (f.t <= 0) { this.floaters.splice(i, 1); continue; }
      const [sx, sy, ok] = this.project(f.x, f.y + (1.6 - f.t) * 0.6, f.z, cam, w, h);
      if (!ok) continue;
      g.globalAlpha = Math.min(1, f.t * 2);
      g.font = '700 13px "Barlow Condensed", sans-serif';
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillText(f.text, sx + 1, sy + 1);
      g.fillStyle = f.color;
      g.fillText(f.text, sx, sy);
      g.globalAlpha = 1;
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
  }

  private bubble(g: CanvasRenderingContext2D, x: number, y: number, text: string) {
    g.font = '500 12px Barlow, sans-serif';
    const words = text.split(' ');
    const lines: string[] = [];
    let line = '';
    for (const wd of words) {
      const t = line ? line + ' ' + wd : wd;
      if (g.measureText(t).width > 180 && line) { lines.push(line); line = wd; } else line = t;
    }
    if (line) lines.push(line);
    const lh = 14;
    const bw = Math.max(...lines.map((l) => g.measureText(l).width)) + 14;
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
    lines.forEach((l, i) => g.fillText(l, x, by + 16 + i * lh));
  }

  floater(c: Char, text: string, color: string) {
    this.floaters.push({ x: c.x, y: c.y + (c.animal ? 1.2 : c.look.height), z: c.z, text, t: 1.4, color });
  }
}
