// The in-game menu (Esc): save, load, options, help, back to the title.
import { h, ui, ask } from './dom';
import { G } from '../state';
import { S } from '../sim/ctx';
import { input } from '../core/input';
import { saveGame, loadSlot, loadData, saveMeta, sessionExtra } from '../game/session';
import { listSaves, exportSave, exportText, SaveMeta } from '../sim/save';
import { renderLoadList, renderOptions, renderHelp, showTitle } from './title';
import { setSpeed } from '../game/control';
import { uiSound } from '../audio';

let root: HTMLDivElement | null = null;
let unKey: (() => void) | null = null;
let resume = 1;

export const menuOpen = () => !!root;

export function openMenu() {
  if (root || G.mode !== 'play') return;
  resume = G.speed || G.lastSpeed || 1;
  setSpeed(0);
  root = h('div', { id: 'gmenu' });
  const side = h('div', { class: 'gmside' });
  const body = h('div', { class: 'gmbody' });
  const card = h('div', { class: 'gmcard' }, side, body);
  root.appendChild(card);
  ui().appendChild(root);
  for (const ev of ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu']) root.addEventListener(ev, (e) => e.stopPropagation());
  root.addEventListener('mousedown', (e) => { if (e.target === root) closeMenu(); });
  unKey = input.onKey((code) => { if (code === 'Escape') closeMenu(); return true; });
  const tab = (label: string, run: () => void) => {
    const b = h('button', { class: 'gmtab' }, label);
    b.onclick = () => { uiSound('click'); for (const x of side.querySelectorAll('.gmtab')) x.classList.remove('on'); b.classList.add('on'); run(); };
    return b;
  };
  const tResume = h('button', { class: 'gmtab primary' }, 'Resume');
  tResume.onclick = () => closeMenu();
  const tSave = tab('Save game', () => savePanel(body));
  side.append(
    h('div', { class: 'gmlogo' }, 'SALTBLADE'),
    h('div', { class: 'gmwho dim' }, `${G.W.factionName} · ${S.clock.str()}`),
    tResume,
    tSave,
    tab('Load game', () => {
      body.innerHTML = '';
      const box = h('div', {});
      body.append(h('h2', {}, 'Load a game'), h('p', { class: 'dim' }, 'Anything since your last save will be lost.'), box);
      renderLoadList(box, async (slot) => { const err = await loadSlot(slot); if (err) warn(body, err); else closeMenu(true); }, (data) => { const err = loadData(data); if (err) warn(body, err); else closeMenu(true); });
    }),
    tab('Options', () => { body.innerHTML = ''; const box = h('div', { class: 'opts' }); body.append(h('h2', {}, 'Options'), box); renderOptions(box); }),
    tab('How to play', () => { body.innerHTML = ''; const box = h('div', { class: 'help' }); body.append(h('h2', {}, 'How to play'), box); renderHelp(box); }),
    tab('Quit to title', () => {
      body.innerHTML = '';
      const yes = h('button', { class: 'tbtn primary' }, 'Quit to the title');
      yes.onclick = () => { closeMenu(true); showTitle(); };
      const saveQuit = h('button', { class: 'tbtn' }, 'Save, then quit');
      saveQuit.onclick = async () => { await saveGame('auto'); closeMenu(true); showTitle(); };
      body.append(h('h2', {}, 'Quit to the title?'), h('p', { class: 'dim' }, 'Anything since your last save will be lost.'), h('div', { class: 'gmrow' }, saveQuit, yes));
    }),
  );
  tSave.click();
}

export function closeMenu(keepPaused = false) {
  if (!root) return;
  root.remove(); root = null;
  unKey?.(); unKey = null;
  if (!keepPaused && G.mode === 'play') setSpeed(resume);
}

function warn(body: HTMLElement, text: string) {
  const el = h('div', { class: 'gmwarn' }, text);
  body.prepend(el);
  setTimeout(() => el.remove(), 5000);
}

async function savePanel(body: HTMLElement) {
  body.innerHTML = '';
  const saves = await listSaves().catch(() => [] as SaveMeta[]);
  const by = new Map(saves.map((m) => [m.slot, m]));
  const list = h('div', { class: 'savelist' });
  const meta = saveMeta();
  for (const slot of ['1', '2', '3', '4', '5', 'quick']) {
    const m = by.get(slot);
    const row = h('div', { class: 'saverow' },
      h('div', { class: 'svslot' }, slot === 'quick' ? 'Quick' : 'Slot ' + slot),
      m ? h('div', { class: 'svinfo' }, h('b', {}, m.name), h('div', { class: 'dim' }, `Day ${m.day} · ${m.place} · ${new Date(m.savedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}`)) : h('div', { class: 'svinfo dim' }, 'Empty'),
    );
    const b = h('button', { class: 'tbtn small primary' }, m ? 'Overwrite' : 'Save here');
    const doSave = async () => {
      b.textContent = 'Saving…';
      const ok = await saveGame(slot);
      if (ok) uiSound('build');
      savePanel(body);
    };
    b.onclick = () => {
      if (m && m.name !== meta.name) ask(`Overwrite "${m.name}, day ${m.day}"?`, 'Overwrite', () => void doSave());
      else void doSave();
    };
    row.appendChild(b);
    list.appendChild(row);
  }
  const exp = h('button', { class: 'tbtn small' }, 'Download a save file');
  exp.onclick = () => void exportSave(`${meta.name} day ${meta.day}`, sessionExtra());
  const copy = h('button', { class: 'tbtn small' }, 'Copy save as text');
  copy.onclick = async () => {
    const text = await exportText(sessionExtra());
    try { await navigator.clipboard.writeText(text); copy.textContent = 'Copied'; }
    catch {
      // no clipboard here: show it to select by hand
      const area = h('textarea', { class: 'tin pastearea', readonly: 'true', id: 'save-text' }) as HTMLTextAreaElement;
      area.value = text;
      body.appendChild(area);
      area.select();
      copy.textContent = 'Select the text below and copy it';
    }
  };
  body.append(h('h2', {}, 'Save the game'), h('p', { class: 'dim' }, `${meta.name} · day ${meta.day} · ${meta.place}`), list,
    h('div', { class: 'svfoot' }, copy, exp),
    h('p', { class: 'dim small' }, 'Saves live in this browser. To move a game to another browser, copy it as text and paste it into Load game there.'));
}
