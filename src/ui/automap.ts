// Overhead map of the current area.

import { G, player } from '../game/G';
import { el, esc } from '../core/util';
import { button, closeModal, openModal } from './common';
import { hexToPixel } from '../core/hex';
import { T_WALL, T_FLOOR, T_WATER } from '../game/map';

export function openAutomap() {
  if (G.modal || !G.map) return;
  const m = G.map;
  const w = el('div', 'panel win');
  w.style.width = 'min(900px, 100vw)';
  w.appendChild(el('h2', '', esc(m.def.name)));
  const scr = el('div', 'screen');
  scr.style.padding = '8px';
  const cv = el('canvas') as HTMLCanvasElement;
  const maxX = m.w * 32 + m.h * 16;
  const maxY = m.h * 16;
  const scale = Math.min(860 / maxX, (window.innerHeight - 180) / maxY, 1);
  cv.width = Math.max(100, Math.round(maxX * scale));
  cv.height = Math.max(60, Math.round(maxY * scale));
  cv.style.cssText = 'display:block;max-width:100%;margin:auto';
  const c = cv.getContext('2d')!;
  c.scale(scale, scale);
  for (let r = 0; r < m.h; r++) for (let q = 0; q < m.w; q++) {
    const t = m.tileAt(q, r);
    if (t === 0) continue;
    const { x, y } = hexToPixel(q, r);
    c.fillStyle = t === T_WALL ? '#4cff5c' : t === T_WATER ? '#1a4a5a' : '#0f2a12';
    c.fillRect(x - 16, y - 8, 33, 17);
  }
  for (const o of m.objects) {
    const { x, y } = hexToPixel(o.q, o.r);
    if (o.kind === 'door' || o.kind === 'hatch' || o.kind === 'gate') {
      c.fillStyle = '#c8a040';
      c.fillRect(x - 10, y - 6, 20, 12);
    }
  }
  for (const [idx] of m.exitAt) {
    const { x, y } = hexToPixel(idx % m.w, Math.floor(idx / m.w));
    c.fillStyle = '#3a7a9a';
    c.fillRect(x - 16, y - 8, 33, 17);
  }
  for (const a of m.actors) {
    if (a.dead) continue;
    const { x, y } = hexToPixel(a.q, a.r);
    c.fillStyle = a.uid === 'player' ? '#ffffff' : a.companion ? '#60c0ff' : a.hostile ? '#ff4030' : '#e0d060';
    c.beginPath();
    c.arc(x, y, a.uid === 'player' ? 24 : 14, 0, 7);
    c.fill();
  }
  scr.appendChild(cv);
  w.appendChild(scr);
  w.appendChild(el('div', '', '<small style="color:#c8b890">White: you &nbsp; Blue: companions &nbsp; Yellow: people &nbsp; Red: hostile &nbsp; Teal: exits</small>'));
  w.appendChild(button('Close', () => closeModal('automap')));
  openModal('automap', w);
}

export { T_FLOOR, player };
