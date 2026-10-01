// Speech bubbles, name tags and enemy health bars positioned over actors.

import { G } from '../G';
import { UI } from './ui';
import { here } from '../world/world';
import { Actor } from '../world/actor';
import { CHARS } from '../content/characters';
import { esc } from './notify';
import { S } from '../state';

const bubbleEls = new Map<string, HTMLElement>();
const tagEls = new Map<string, HTMLElement>();
const barEls = new Map<string, HTMLElement>();

function pos(a: Actor, dy: number) {
  const canvas = G.canvas.getBoundingClientRect();
  const root = UI.root.getBoundingClientRect();
  const x = (a.x - G.cam.x) * G.scale + canvas.left - root.left;
  const y = (a.y + dy - G.cam.y) * G.scale + canvas.top - root.top;
  return { x, y };
}

export function updateBubbles() {
  const live = new Set<string>();
  const liveTags = new Set<string>();
  const liveBars = new Set<string>();
  const visible = G.mode === 'play' || G.mode === 'dialogue' || G.mode === 'cutscene';
  if (visible && G.map) {
    const p = G.player;
    for (const a of here()) {
      if (a.hidden) continue;
      const onScreen = a.x > G.cam.x - 20 && a.x < G.cam.x + G.viewW + 20 && a.y > G.cam.y - 10 && a.y < G.cam.y + G.viewH + 30;
      if (!onScreen) continue;
      if (a.bark && G.mode !== 'dialogue') {
        live.add(a.id);
        let b = bubbleEls.get(a.id);
        if (!b) { b = document.createElement('div'); b.className = 'bubble'; UI.bubbles.appendChild(b); bubbleEls.set(a.id, b); }
        if (b.dataset.t !== a.bark.text) { b.dataset.t = a.bark.text; b.innerHTML = esc(a.bark.text); }
        const q = pos(a, a.isAnimal ? -20 : -30);
        b.style.left = q.x + 'px';
        b.style.top = q.y + 'px';
        b.style.opacity = String(Math.min(1, a.bark.t * 2));
      }
      if (a === p || a.dead) continue;
      const near = Math.hypot(a.x - p.x, a.y - p.y) < 56;
      if ((a.charId || a.hostile) && near && !a.bark && G.mode === 'play') {
        liveTags.add(a.id);
        let t = tagEls.get(a.id);
        if (!t) { t = document.createElement('div'); t.className = 'nametag'; UI.bubbles.appendChild(t); tagEls.set(a.id, t); }
        const name = a.charId && CHARS[a.charId] && (a.mem.introduced || known(a.charId)) ? CHARS[a.charId].name : a.name;
        if (t.dataset.n !== name) { t.dataset.n = name; t.textContent = name; }
        t.classList.toggle('hostile', a.hostile);
        const q = pos(a, a.isAnimal ? -18 : -28);
        t.style.left = q.x + 'px';
        t.style.top = q.y + 'px';
      }
      if ((a.hostile || a.combat.lastHitBy) && a.hp < a.maxHp && G.mode === 'play' && !a.mem.down) {
        liveBars.add(a.id);
        let hb = barEls.get(a.id);
        if (!hb) { hb = document.createElement('div'); hb.className = 'hpbar'; hb.innerHTML = '<i></i>'; UI.bubbles.appendChild(hb); barEls.set(a.id, hb); }
        const q = pos(a, 3);
        hb.style.left = q.x + 'px';
        hb.style.top = q.y + 'px';
        (hb.firstElementChild as HTMLElement).style.width = `${Math.max(0, (a.hp / a.maxHp) * 100)}%`;
      }
    }
  }
  for (const [id, e] of bubbleEls) if (!live.has(id)) { e.remove(); bubbleEls.delete(id); }
  for (const [id, e] of tagEls) if (!liveTags.has(id)) { e.remove(); tagEls.delete(id); }
  for (const [id, e] of barEls) if (!liveBars.has(id)) { e.remove(); barEls.delete(id); }
}

function known(charId: string) { return !!S.flags['met_' + charId] || ['radek', 'marta', 'lida', 'pavel', 'hanka', 'crumb'].includes(charId); }
