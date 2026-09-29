// Small DOM helpers and draggable windows.
import { uiSound } from '../audio';

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, ...kids: (Node | string | null | undefined | false)[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') (el as any)[k.toLowerCase()] = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== undefined && kid !== false) el.append(kid);
  return el;
}

export const ui = () => document.getElementById('ui')!;

export function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

/** Stops mouse events reaching the game view. */
export function shield(el: HTMLElement) {
  for (const ev of ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu']) el.addEventListener(ev, (e) => e.stopPropagation());
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

const openWins = new Map<string, Win>();
let zTop = 20;

export interface Win {
  el: HTMLDivElement;
  body: HTMLDivElement;
  title: HTMLDivElement;
  close(): void;
  onClose?: () => void;
  key: string;
}

/** A draggable panel with a title bar. Re-opening the same key brings it to front. */
export function openWindow(key: string, title: string, opts: { w?: number; x?: number; y?: number; cls?: string } = {}): Win {
  const old = openWins.get(key);
  if (old) { old.el.style.zIndex = String(++zTop); old.title.firstChild!.textContent = title; return old; }
  const el = h('div', { class: 'win ' + (opts.cls ?? '') });
  const t = h('div', { class: 'wintitle' }, title);
  const x = h('button', { class: 'winx', title: 'Close (Esc)' }, '×');
  t.appendChild(x);
  const body = h('div', { class: 'winbody' });
  el.append(t, body);
  el.style.zIndex = String(++zTop);
  if (opts.w) el.style.width = opts.w + 'px';
  ui().appendChild(el);
  shield(el);
  const r = el.getBoundingClientRect();
  const saved = winPos[key];
  el.style.left = Math.max(4, Math.min(window.innerWidth - r.width - 4, saved?.[0] ?? opts.x ?? (window.innerWidth - r.width) / 2)) + 'px';
  el.style.top = Math.max(4, Math.min(window.innerHeight - 80, saved?.[1] ?? opts.y ?? 90)) + 'px';
  el.addEventListener('mousedown', () => { el.style.zIndex = String(++zTop); });
  // drag by title
  t.addEventListener('mousedown', (e) => {
    if (e.target === x) return;
    const sx = e.clientX, sy = e.clientY;
    const ox = el.offsetLeft, oy = el.offsetTop;
    const mv = (ev: MouseEvent) => {
      el.style.left = Math.max(0, Math.min(window.innerWidth - 60, ox + ev.clientX - sx)) + 'px';
      el.style.top = Math.max(0, Math.min(window.innerHeight - 30, oy + ev.clientY - sy)) + 'px';
    };
    const up = () => { window.removeEventListener('mousemove', mv, true); window.removeEventListener('mouseup', up, true); winPos[key] = [el.offsetLeft, el.offsetTop]; };
    // capture: the button comes up over this window, which shields its events from bubbling
    window.addEventListener('mousemove', mv, true);
    window.addEventListener('mouseup', up, true);
  });
  const w: Win = {
    el, body, title: t, key,
    close() { el.remove(); openWins.delete(key); w.onClose?.(); },
  };
  x.onclick = () => { uiSound('close'); w.close(); };
  openWins.set(key, w);
  uiSound('open');
  return w;
}
const winPos: Record<string, [number, number]> = {};

export function closeWindow(key: string) { openWins.get(key)?.close(); }
export function isOpen(key: string) { return openWins.has(key); }
export function getWindow(key: string) { return openWins.get(key); }
/** Closes the top-most window; returns false if none were open. */
export function closeTop(): boolean {
  let top: Win | null = null, z = -1;
  for (const w of openWins.values()) { const zz = +w.el.style.zIndex; if (zz > z) { z = zz; top = w; } }
  if (top) { top.close(); return true; }
  return false;
}
export function anyOpen() { return openWins.size > 0; }

export function bar(frac: number, cls = '') {
  const b = h('div', { class: 'bar ' + cls });
  const i = h('i');
  i.style.width = Math.max(0, Math.min(100, frac * 100)) + '%';
  b.appendChild(i);
  return b;
}

/** An in-page yes/no question (the browser's confirm() is not available everywhere). */
export function ask(text: string, yes: string, onYes: () => void, no = 'Cancel', danger = false) {
  const back = h('div', { class: 'askback' });
  const ok = h('button', { class: 'tbtn small ' + (danger ? 'danger' : 'primary') }, yes);
  const cancel = h('button', { class: 'tbtn small' }, no);
  const box = h('div', { class: 'askbox', role: 'dialog' }, h('div', { class: 'asktext' }, text), h('div', { class: 'askbtns' }, cancel, ok));
  back.appendChild(box);
  const close = () => { back.remove(); document.removeEventListener('keydown', key, true); };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); }
    if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); close(); onYes(); }
  };
  document.addEventListener('keydown', key, true);
  ok.onclick = () => { close(); onYes(); };
  cancel.onclick = close;
  back.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.target === back) close(); });
  for (const ev of ['click', 'wheel', 'contextmenu', 'mouseup']) back.addEventListener(ev, (e) => e.stopPropagation());
  ui().appendChild(back);
  ok.focus();
}

/** An in-page text prompt. */
export function askText(title: string, value: string, onOk: (v: string) => void, max = 28) {
  const back = h('div', { class: 'askback' });
  const input = h('input', { class: 'tin', value, maxlength: String(max), spellcheck: 'false', id: 'ask-text' }) as HTMLInputElement;
  const ok = h('button', { class: 'tbtn small primary' }, 'OK');
  const cancel = h('button', { class: 'tbtn small' }, 'Cancel');
  const box = h('div', { class: 'askbox', role: 'dialog' }, h('div', { class: 'asktext' }, title), input, h('div', { class: 'askbtns' }, cancel, ok));
  back.appendChild(box);
  const close = () => back.remove();
  const done = () => { const v = input.value.trim(); close(); if (v) onOk(v); };
  input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') done(); if (e.key === 'Escape') close(); });
  ok.onclick = done;
  cancel.onclick = close;
  back.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.target === back) close(); });
  for (const ev of ['click', 'wheel', 'contextmenu', 'mouseup']) back.addEventListener(ev, (e) => e.stopPropagation());
  ui().appendChild(back);
  input.focus();
  input.select();
}

/** An in-page box to paste text into. */
export function askPaste(title: string, onText: (v: string) => void) {
  const back = h('div', { class: 'askback' });
  const area = h('textarea', { class: 'tin pastearea', id: 'ask-paste', spellcheck: 'false', placeholder: 'Paste here' }) as HTMLTextAreaElement;
  const ok = h('button', { class: 'tbtn small primary' }, 'Load');
  const cancel = h('button', { class: 'tbtn small' }, 'Cancel');
  const box = h('div', { class: 'askbox', role: 'dialog' }, h('div', { class: 'asktext' }, title), area, h('div', { class: 'askbtns' }, cancel, ok));
  back.appendChild(box);
  const close = () => back.remove();
  area.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Escape') close(); });
  ok.onclick = () => { const v = area.value.trim(); close(); if (v) onText(v); };
  cancel.onclick = close;
  back.addEventListener('mousedown', (e) => { e.stopPropagation(); if (e.target === back) close(); });
  for (const ev of ['click', 'wheel', 'contextmenu', 'mouseup']) back.addEventListener(ev, (e) => e.stopPropagation());
  ui().appendChild(back);
  area.focus();
}
