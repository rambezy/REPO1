// Touch helpers for the windows: the action sheet (what can be done with an
// item, for a finger that has no right button), the bar that names the item a
// tap picked up, and the stylesheet that fits the windows to a phone.
import './touch.css';
import { h, ui } from './dom';
import { S } from '../sim/ctx';
import { Grid, Item } from '../sim/inventory';
import { ITEM } from '../content/items';
import { iconFor } from './icons';
import { uiSound } from '../audio';

export interface SheetAction { label: string; run: () => void; danger?: boolean; hint?: string; }

let sheet: HTMLElement | null = null;
let keyOff: (() => void) | null = null;

export const sheetOpen = () => !!sheet;
export function closeSheet() { sheet?.remove(); sheet = null; keyOff?.(); keyOff = null; }

/** A sheet of actions: up from the bottom of a phone screen, or a popover by the pointer on a wide one. */
export function openSheet(opts: { title: string; html?: string; actions: SheetAction[]; x?: number; y?: number; after?: () => void }) {
  closeSheet();
  const back = h('div', { class: 'sheetback' });
  const pop = window.innerWidth > 820 && opts.x !== undefined && opts.y !== undefined;
  const box = h('div', { class: 'sheet' + (pop ? ' pop' : ''), role: 'dialog' }, h('div', { class: 'sheettitle' }, opts.title));
  if (opts.html) box.appendChild(h('div', { class: 'sheetcard', html: opts.html }));
  // the sheet opens under the finger that is still pressing the item, and that finger's release lands a
  // click on whatever row is there: a button acts only on a click that a fresh press inside the sheet
  // (or the keyboard) led to
  let armed = false;
  const fresh = (e: MouseEvent) => armed || e.detail === 0;
  const list = h('div', { class: 'sheetacts' });
  for (const a of opts.actions) {
    const b = h('button', { class: 'sheetbtn' + (a.danger ? ' danger' : '') }, a.label, a.hint ? h('small', {}, a.hint) : null);
    b.onclick = (e) => { if (!fresh(e)) return; closeSheet(); uiSound('click'); a.run(); opts.after?.(); };
    list.appendChild(b);
  }
  const cancel = h('button', { class: 'sheetbtn cancel' }, 'Cancel');
  cancel.onclick = (e) => { if (fresh(e)) closeSheet(); };
  list.appendChild(cancel);
  box.appendChild(list);
  back.appendChild(box);
  // a fresh press outside the sheet closes it; one inside arms its buttons
  back.addEventListener('pointerdown', (e) => { if (e.target === back) closeSheet(); else armed = true; });
  for (const ev of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu']) back.addEventListener(ev, (e) => e.stopPropagation());
  back.addEventListener('contextmenu', (e) => e.preventDefault());
  const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeSheet(); } };
  document.addEventListener('keydown', key, true);
  keyOff = () => document.removeEventListener('keydown', key, true);
  ui().appendChild(back);
  sheet = back;
  if (pop) {
    const r = box.getBoundingClientRect();
    box.style.left = Math.max(4, Math.min(window.innerWidth - r.width - 4, opts.x! + 6)) + 'px';
    box.style.top = Math.max(4, Math.min(window.innerHeight - r.height - 4, opts.y! + 6)) + 'px';
  }
  uiSound('open');
}

let bar: HTMLElement | null = null;
/** Names the item a tap picked up, and says what to do with it. */
export function showHoldBar(it: Item, onActions: () => void, onCancel: () => void) {
  hideHoldBar();
  const d = ITEM[it.id];
  bar = h('div', { class: 'holdbar' },
    h('img', { class: 'holdicon', src: iconFor(it.id), alt: '' }),
    h('div', { class: 'holdtext' }, h('b', {}, d.name + (it.n > 1 ? ` ×${it.n}` : '')), h('span', { class: 'dim' }, 'Tap a cell or a slot to put it there')),
    h('button', { class: 'tog small', onclick: onActions }, 'Actions'),
    h('button', { class: 'tog small', onclick: onCancel }, 'Cancel'),
  );
  ui().appendChild(bar);
}
export function hideHoldBar() { bar?.remove(); bar = null; }

/**
 * The one action a shop grid offers by right-click: selling from the player's
 * own grids, buying from the shop's. The trade window sets no label of its own,
 * so it is read off the price and whose grid it is.
 */
export function tradeLabel(grid: Grid, price?: number) {
  if (price === undefined) return 'Use';
  const mine = S.W?.playerChars().some((c) => c.inv === grid || c.eq.back?.inv === grid);
  return `${mine ? 'Sell' : 'Buy'} for ${price}c`;
}
