// Title screen with new game, continue, load and controls.

import { UI, el, button } from './ui';
import { hasSaves, latestSlot, readSave, listSaves } from '../systems/save';
import { initAudio, loadVolumes } from '../audio/audio';
import { playMusic } from '../audio/music';
import { controlsHTML } from './menu';
import { GameState } from '../state';
import { esc } from './notify';

export interface TitleHandlers {
  newGame: (name: string, difficulty: 'story' | 'normal' | 'hard') => void;
  load: (st: GameState) => void;
}

let root: HTMLElement | null = null;

export function showTitle(h: TitleHandlers) {
  hideTitle();
  loadVolumes();
  root = el('div', { id: 'title' });
  const kicker = el('div', { cls: 'kicker', html: 'The Lindenmark · Anno Domini 1409' });
  const h1 = el('h1', { html: 'Of Bread <span class="amp">&amp;</span> Iron' });
  const sub = el('div', { cls: 'sub', html: 'A smith\'s son, a burned village, and a little sister somewhere out in the dark. A tale of grief and stubborn hope.' });
  const menu = el('div', { cls: 'menu' });
  const foot = el('div', { cls: 'foot', html: 'Best with sound on · Keyboard & mouse, gamepad or touch' });
  root.append(kicker, h1, sub, menu, foot);
  UI.root.appendChild(root);
  const startAudio = () => { if (initAudio()) playMusic('title', 1); };

  const mainMenu = () => {
    menu.innerHTML = '';
    if (hasSaves()) {
      menu.append(button('Continue', () => {
        startAudio();
        const slot = latestSlot();
        const st = slot ? readSave(slot) : null;
        if (st) { hideTitle(); h.load(st); }
      }, 'btn primary'));
    }
    menu.append(button('New Game', () => { startAudio(); newGameMenu(); }, hasSaves() ? 'btn' : 'btn primary'));
    if (hasSaves()) menu.append(button('Load', () => { startAudio(); loadMenu(); }));
    menu.append(button('Controls', () => { startAudio(); controls(); }));
  };
  const newGameMenu = () => {
    menu.innerHTML = '';
    const box = el('div', { cls: 'namebox' });
    const label = el('label', { html: 'Your name', htmlFor: 'player-name' } as never);
    const input = el('input', { id: 'player-name', value: 'Janek', maxLength: 16, autocomplete: 'off' } as never) as HTMLInputElement;
    let diff: 'story' | 'normal' | 'hard' = 'normal';
    const diffRow = el('div', { cls: 'diff' });
    const renderDiff = () => {
      diffRow.innerHTML = '';
      for (const [d, lab, desc] of [['story', 'Story', 'gentler fights'], ['normal', 'Normal', 'as intended'], ['hard', 'Hard', 'unforgiving']] as const) {
        const b = button(`${lab}<small>${desc}</small>`, () => { diff = d; renderDiff(); }, diff === d ? 'btn sel' : 'btn');
        diffRow.append(b);
      }
    };
    renderDiff();
    const begin = button('Begin', () => {
      const name = (input.value || 'Janek').trim().replace(/[<>&"]/g, '').slice(0, 16) || 'Janek';
      hideTitle();
      h.newGame(name, diff);
    }, 'btn primary');
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') begin.click(); e.stopPropagation(); });
    box.append(label, input, el('label', { html: 'Difficulty' }), diffRow, begin, button('Back', mainMenu));
    menu.append(box);
    setTimeout(() => input.focus(), 50);
  };
  const loadMenu = () => {
    menu.innerHTML = '';
    for (const s of listSaves().sort((a, b) => b.savedAt - a.savedAt)) {
      menu.append(button(`${s.slot === 'auto' ? 'Autosave' : 'Slot ' + s.slot}: ${esc(s.name)}, day ${s.day}, ${esc(s.place)}`, () => {
        const st = readSave(s.slot);
        if (st) { hideTitle(); h.load(st); }
      }));
    }
    menu.append(button('Back', mainMenu));
  };
  const controls = () => {
    menu.innerHTML = '';
    const c = el('div', { cls: 'sub', html: controlsHTML() });
    c.style.fontStyle = 'normal';
    c.style.textAlign = 'left';
    menu.append(c, button('Back', mainMenu));
  };
  mainMenu();
}

export function hideTitle() {
  if (root) { root.remove(); root = null; }
}
