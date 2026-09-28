// UI wiring: builds the HUD and opens windows in response to events and keys.
import { h, openWindow, closeTop, isOpen, closeWindow, esc } from './dom';
import { buildHUD } from './hud';
import { openCharWindow, refreshCharWindow } from './charwin';
import { openLoot, dropOnGround } from './loot';
import { on, emit } from '../core/events';
import { input } from '../core/input';
import { S } from '../sim/ctx';
import { FACTION } from '../content/factions';
import { ITEM, gradeName } from '../content/items';
import { portrait } from '../render/portrait';
import { selected, closeMenu } from '../game/control';
import { RACE } from '../content/races';
import { ANIMAL } from '../content/animals';
import { Clock } from '../sim/clock';
import { openDialogue } from './dialogue';
import { openTrade } from './trade';
import { setupBuild } from './build';

export function setupUI() {
  buildHUD();
  setupBuild();
  on('ui:char', () => { if (isOpen('char')) closeWindow('char'); else openCharWindow(); });
  on('ui:loot', (looter: number, target: any) => openLoot(looter, target));
  on('world:drop', (x: number, z: number, items: any[]) => dropOnGround(x, z, items));
  on('ui:inspect', (id: number) => inspect(id));
  on('ui:talk', (pid: number, nid: number) => openDialogue(pid, nid));
  on('ui:trade', (pid: number, nid: number) => { import('./dialogue').then((m) => m.closeDialogue()); openTrade(pid, nid); });
  on('ui:log', () => { if (isOpen('log')) closeWindow('log'); else openLog(); });
  on('gear', () => refreshCharWindow());
  on('sel', () => { if (isOpen('char')) { const c = selected()[0]; if (c) openCharWindow(c); } });
  setInterval(() => { if (isOpen('char')) refreshLive(); }, 1000);
  input.onKey((code) => {
    switch (code) {
      case 'KeyI': emit('ui:char'); return true;
      case 'KeyL': emit('ui:log'); return true;
      case 'KeyM': emit('ui:map'); return true;
      case 'KeyB': emit('ui:build'); return true;
      case 'KeyU': emit('ui:research'); return true;
      case 'KeyO': emit('ui:factions'); return true;
      case 'Escape':
        closeMenu();
        if (!closeTop()) emit('ui:menu');
        return true;
    }
    return false;
  });
}

let liveKey = '';
function refreshLive() {
  // redraw the character window when health changes meaningfully
  const c = selected()[0];
  if (!c) return;
  const k = JSON.stringify([Math.round(c.body.total() * 50), Math.round(c.body.blood), c.inv.items.length, c.status]);
  if (k !== liveKey) { liveKey = k; refreshCharWindow(); }
}

function inspect(id: number) {
  const c = S.W.char(id);
  if (!c) return;
  const w = openWindow('inspect', c.name, { w: 330, x: window.innerWidth - 350, y: 80, cls: 'inspect' });
  const render = () => {
    const f = FACTION[c.faction];
    const rel = S.W.rel.get('player', c.faction);
    const relTxt = c.animal ? (ANIMAL[c.animal].diet === 'grazer' ? 'Timid' : 'Dangerous') : rel <= -50 ? 'Hostile' : rel < -20 ? 'Unfriendly' : rel > 30 ? 'Friendly' : 'Neutral';
    const gear: string[] = [];
    for (const slot of ['weapon', 'ranged', 'body', 'head'] as const) {
      const it = c.eq[slot];
      if (it) gear.push(gradeName(ITEM[it.id], it.q));
    }
    const st = c.status === 'dead' ? 'Dead' : c.status === 'ko' ? 'Unconscious' : c.cage ? 'Caged' : c.sleeping ? 'Asleep' : c.drawn ? 'Fighting' : 'Up';
    w.body.innerHTML = '';
    w.body.append(
      h('div', { class: 'insp' },
        h('img', { src: portrait(c), class: 'iport' }),
        h('div', {},
          h('div', { class: 'ititle' }, c.name),
          h('div', { class: 'dim' }, c.animal ? ANIMAL[c.animal].name : `${RACE[c.look.race]?.name ?? ''}${c.title ? ' · ' + c.title : ''}`),
          h('div', {}, c.animal ? '' : f?.name ?? '', ' ', h('span', { class: rel <= -50 ? 'bad' : rel > 30 ? 'good' : 'dim' }, `(${relTxt})`)),
          h('div', {}, `${st} · health ${Math.round(Math.max(0, c.body.total()) * 100)}%`),
        ),
      ),
      c.animal ? h('p', { class: 'dim' }, ANIMAL[c.animal].desc) : h('div', { class: 'dim' }, gear.length ? gear.join(' · ') : 'Unarmed'),
      c.animal ? '' : h('p', { class: 'dim' }, f?.desc ?? ''),
    );
  };
  render();
}

function openLog() {
  const w = openWindow('log', 'Journal', { w: 460, x: window.innerWidth - 480, y: 80 });
  const list = h('div', { class: 'loglist' });
  for (const e of S.W.log.slice().reverse().slice(0, 150)) {
    const d = Math.floor(e.t / 86400), hr = Math.floor((e.t / 3600) % 24), mn = Math.floor((e.t / 60) % 60);
    list.appendChild(h('div', { class: 'logrow ' + e.kind }, h('span', { class: 'dim' }, `Day ${d} ${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')} `), e.text));
  }
  if (!S.W.log.length) list.appendChild(h('div', { class: 'dim' }, 'Nothing has happened yet. Give it time.'));
  w.body.appendChild(list);
  void esc; void Clock;
}
