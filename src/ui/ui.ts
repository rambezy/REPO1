// UI root: creates overlay layers and manages which full-screen panel is open.

import { G, Mode } from '../G';
import { input } from '../engine/input';
import { sfx } from '../audio/sfx';

export const UI = {
  root: null as unknown as HTMLElement,
  hud: null as unknown as HTMLElement,
  bubbles: null as unknown as HTMLElement,
  layer: null as unknown as HTMLElement, // full screen panels
  screen: null as { el: HTMLElement; close: () => void; name: string; prevMode: Mode; onKey?: (k: string) => boolean } | null,
};

export function initUI(root: HTMLElement) {
  UI.root = root;
  UI.bubbles = el('div', { id: 'bubbles', className: 'passthrough' });
  UI.hud = el('div', { id: 'hud' });
  UI.layer = el('div', { id: 'layer' });
  root.prepend(UI.hud);
  root.prepend(UI.bubbles);
  root.appendChild(UI.layer);
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { cls?: string; html?: string } = {}, children: (Node | string)[] = []): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  const { cls, html, ...rest } = props as Record<string, unknown>;
  Object.assign(e, rest);
  if (cls) e.className = cls as string;
  if (html !== undefined) e.innerHTML = html as string;
  for (const c of children) e.append(c);
  return e;
}

/** Opens a full-screen panel. Returns a close function. */
export function openScreen(name: string, build: (close: () => void) => HTMLElement, opts: { mode?: Mode; onKey?: (k: string) => boolean; dim?: boolean } = {}): () => void {
  if (UI.screen) UI.screen.close();
  const prevMode = G.mode;
  const wrap = el('div', { cls: 'screen' });
  if (opts.dim === false) wrap.style.background = 'transparent';
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.remove();
    if (UI.screen && UI.screen.el === wrap) UI.screen = null;
    if (G.mode === (opts.mode ?? 'menu')) G.mode = prevMode === 'menu' ? 'play' : prevMode;
    document.body.classList.remove('menu-open');
    input.consumeAll();
    sfx('ui_back');
  };
  const content = build(close);
  wrap.appendChild(content);
  // clicking the dim backdrop closes simple panels
  wrap.addEventListener('mousedown', (e) => { if (e.target === wrap && opts.dim !== false) close(); });
  UI.layer.appendChild(wrap);
  UI.screen = { el: wrap, close, name, prevMode, onKey: opts.onKey };
  G.mode = opts.mode ?? 'menu';
  document.body.classList.add('menu-open');
  input.consumeAll();
  sfx('ui');
  return close;
}

export function closeScreen() { if (UI.screen) UI.screen.close(); }
export function screenOpen(name?: string) { return !!UI.screen && (!name || UI.screen.name === name); }

export function button(label: string, onClick: () => void, cls = 'btn', title?: string): HTMLButtonElement {
  const b = el('button', { cls, html: label });
  if (title) b.title = title;
  b.addEventListener('click', (e) => { e.stopPropagation(); sfx('ui'); onClick(); });
  return b;
}
