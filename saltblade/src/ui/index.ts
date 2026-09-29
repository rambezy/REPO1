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
import { selected, closeMenu, menuOpen } from '../game/control';
import { RACE } from '../content/races';
import { ANIMAL } from '../content/animals';
import { Clock } from '../sim/clock';
import { openDialogue } from './dialogue';
import { openTrade } from './trade';
import { setupBuild } from './build';
import { openMenu as openGameMenu } from './menu';
import { toggleMap } from './map';
import { toggleFactions } from './factions';
import { fitProsthetic } from '../sim/health';
import { setupHints } from './hints';
import { openBook } from './read';
import { DEEDS } from '../sim/deeds';
import { setupCodex, toggleCodex } from './codex';
import { saveGame, loadSlot } from '../game/session';
import { G } from '../state';

export function setupUI() {
  buildHUD();
  setupBuild();
  setupHints();
  setupCodex();
  on('ui:char', () => { if (isOpen('char')) closeWindow('char'); else openCharWindow(); });
  on('ui:loot', (looter: number, target: any) => openLoot(looter, target));
  on('world:drop', (x: number, z: number, items: any[]) => dropOnGround(x, z, items));
  on('ui:inspect', (id: number) => inspect(id));
  on('ui:talk', (pid: number, nid: number) => openDialogue(pid, nid));
  on('ui:trade', (pid: number, nid: number) => { import('./dialogue').then((m) => m.closeDialogue()); openTrade(pid, nid); });
  on('ui:log', () => { if (isOpen('log')) closeWindow('log'); else openLog(); });
  on('gear', () => refreshCharWindow());
  on('ui:menu', () => openGameMenu());
  on('ui:map', () => toggleMap());
  on('ui:factions', () => toggleFactions());
  on('ui:codex', () => toggleCodex());
  on('ui:read', (key: string, cid?: number) => openBook(key, cid));
  on('ui:prosthetic', (cid: number, uid: number) => {
    const c = S.W.char(cid);
    if (!c) return;
    const err = fitProsthetic(c, uid);
    if (err) S.fx.notice(err, 'bad'); else refreshCharWindow();
  });
  on('world:reset', () => { liveKey = ''; });
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
      case 'KeyK': toggleCodex(); return true;
      case 'Escape':
        // a right-click menu first, then the top window, and only then the game menu
        if (menuOpen()) { closeMenu(); return true; }
        if (!closeTop()) emit('ui:menu');
        return true;
      case 'Tab': {
        import('./hud').then((m) => {
          const ids = S.W.playerSquads.filter((id) => (S.W.squads.get(id)?.members.length ?? 0) > 0);
          if (ids.length < 2) return;
          const i = ids.indexOf(G.activeSquad);
          m.switchSquad(ids[(i + 1) % ids.length]);
        });
        return true;
      }
      case 'F3':
        import('./hud').then((m) => m.togglePerf());
        return true;
      case 'F5':
        if (G.mode === 'play') void saveGame('quick');
        return true;
      case 'F9':
        if (G.mode === 'play') void loadSlot('quick').then((err) => { if (err) S.fx.notice(err, 'bad'); });
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

let logTab: 'log' | 'deeds' = 'log';
function openLog() {
  const w = openWindow('log', 'Journal', { w: 480, x: window.innerWidth - 500, y: 104 });
  const render = () => {
    w.body.innerHTML = '';
    const tabs = h('div', { class: 'ftabs' });
    for (const [k, label] of [['log', 'Journal'], ['deeds', 'Deeds']] as const) {
      const b = h('button', { class: 'ftab' + (logTab === k ? ' on' : '') }, label);
      b.onclick = () => { logTab = k; render(); };
      tabs.appendChild(b);
    }
    w.body.appendChild(tabs);
    if (logTab === 'log') {
      const list = h('div', { class: 'loglist' });
      for (const e of S.W.log.slice().reverse().slice(0, 200)) {
        const d = Math.floor(e.t / 86400), hr = Math.floor((e.t / 3600) % 24), mn = Math.floor((e.t / 60) % 60);
        list.appendChild(h('div', { class: 'logrow ' + e.kind }, h('span', { class: 'dim' }, `Day ${d} ${String(hr).padStart(2, '0')}:${String(mn).padStart(2, '0')} `), e.text));
      }
      if (!S.W.log.length) list.appendChild(h('div', { class: 'dim' }, 'Nothing has happened yet. Give it time.'));
      w.body.appendChild(list);
    } else {
      const done: Record<string, number> = S.W.flags.deeds ?? {};
      const n = DEEDS.filter((d) => done[d.key] !== undefined).length;
      const list = h('div', { class: 'deedlist' });
      for (const d of [...DEEDS].sort((a, b) => Number(done[b.key] !== undefined) - Number(done[a.key] !== undefined))) {
        const when = done[d.key];
        list.appendChild(h('div', { class: 'deed' + (when !== undefined ? ' done' : '') },
          h('div', { class: 'deedname' }, d.name, when !== undefined ? h('span', { class: 'dim' }, ` · day ${Math.floor(when / 86400)}`) : null),
          h('div', { class: 'deeddesc' }, d.desc),
        ));
      }
      w.body.append(h('div', { class: 'dim deedcount' }, `${n} of ${DEEDS.length} deeds`), list);
    }
  };
  render();
  void esc; void Clock;
}
