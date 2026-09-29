// Shared UI helpers: modals, item rows, quantity picker, toasts.

import { G } from '../game/G';
import { el, esc } from '../core/util';
import { iconURL } from '../render/icons';
import { ITEMS } from '../data/items';
import type { Stack } from '../game/types';
import { sfx } from '../audio/sfx';

export function uiRoot(): HTMLElement {
  return document.getElementById('ui')!;
}

let modalStack: { name: string; el: HTMLElement; onClose?: () => void }[] = [];

export function openModal(name: string, content: HTMLElement, opts: { clear?: boolean; onClose?: () => void; noBackClose?: boolean } = {}): HTMLElement {
  const back = el('div', 'modal-back' + (opts.clear ? ' clear' : ''));
  back.appendChild(content);
  if (!opts.noBackClose) {
    back.addEventListener('pointerdown', (e) => {
      if (e.target === back) closeModal(name);
    });
  }
  uiRoot().appendChild(back);
  modalStack.push({ name, el: back, onClose: opts.onClose });
  G.modal = name;
  return back;
}

export function closeModal(name?: string) {
  const idx = name ? modalStack.map((m) => m.name).lastIndexOf(name) : modalStack.length - 1;
  if (idx < 0) return;
  const [m] = modalStack.splice(idx, 1);
  m.el.remove();
  G.modal = modalStack.length ? modalStack[modalStack.length - 1].name : null;
  m.onClose?.();
}

export function topModal(): string | null {
  return modalStack.length ? modalStack[modalStack.length - 1].name : null;
}

export function closeAllModals() {
  while (modalStack.length) closeModal();
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', 'btn ' + cls, label);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    sfx('button');
    onClick();
  });
  return b;
}

export function itemName(st: Stack): string {
  const d = ITEMS[st.id];
  if (!d) return st.id;
  return d.name;
}

export function itemRow(st: Stack, opts: { price?: number; selected?: boolean; extra?: string } = {}): HTMLElement {
  const d = ITEMS[st.id];
  const row = el('div', 'item' + (opts.selected ? ' sel' : ''));
  const ic = el('div', 'ic');
  ic.style.backgroundImage = `url(${iconURL(d?.icon ?? 'box')})`;
  row.appendChild(ic);
  let sub = '';
  if (st.n > 1) sub += `x${st.n} `;
  if (d?.weapon?.ammo && st.ammo !== undefined) sub += `${st.ammo}/${d.weapon.mag} `;
  if (opts.price !== undefined) sub += `$${opts.price}`;
  if (opts.extra) sub += opts.extra;
  row.appendChild(el('div', 'nm', `${esc(d?.name ?? st.id)}${sub ? `<small>${sub}</small>` : ''}`));
  return row;
}

export function askQuantity(max: number, title: string): Promise<number> {
  return new Promise((res) => {
    if (max <= 1) return res(max);
    const wrap = el('div', 'panel win');
    wrap.appendChild(el('h2', '', esc(title)));
    const val = el('div', 'screen', String(max));
    val.style.cssText = 'font-size:22px;padding:4px 16px;font-family:var(--big)';
    const range = el('input') as HTMLInputElement;
    range.type = 'range';
    range.min = '1';
    range.max = String(max);
    range.value = String(max);
    range.oninput = () => (val.textContent = range.value);
    wrap.append(val, range);
    const row = el('div', 'row');
    row.append(
      button('All', () => {
        range.value = String(max);
        val.textContent = String(max);
      }, 'small'),
      button('OK', () => {
        closeModal('qty');
        res(parseInt(range.value, 10));
      }),
      button('Cancel', () => {
        closeModal('qty');
        res(0);
      }, 'small'),
    );
    wrap.appendChild(row);
    openModal('qty', wrap);
  });
}

let toastTimer = 0;
export function toast(text: string) {
  let t = document.getElementById('toast');
  if (!t) {
    t = el('div', 'toast screen');
    t.id = 'toast';
    uiRoot().appendChild(t);
  }
  t.textContent = text;
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t!.style.display = 'none'), 2200);
}

export function popMenu(x: number, y: number, items: { label: string; fn: () => void }[]) {
  closePopMenu();
  const m = el('div', 'popmenu panel');
  m.id = 'popmenu';
  for (const it of items) {
    m.appendChild(button(it.label, () => {
      closePopMenu();
      it.fn();
    }));
  }
  uiRoot().appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, window.innerWidth - r.width - 4) + 'px';
  m.style.top = Math.min(y, window.innerHeight - r.height - 4) + 'px';
  setTimeout(() => window.addEventListener('pointerdown', onAway, { once: true }), 0);
}

function onAway(e: Event) {
  const m = document.getElementById('popmenu');
  if (m && m.contains(e.target as Node)) {
    window.addEventListener('pointerdown', onAway, { once: true });
    return;
  }
  closePopMenu();
}

export function closePopMenu() {
  document.getElementById('popmenu')?.remove();
}
