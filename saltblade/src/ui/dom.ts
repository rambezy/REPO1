// Small DOM helpers and draggable windows.

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
    const up = () => { window.removeEventListener('mousemove', mv); window.removeEventListener('mouseup', up); winPos[key] = [el.offsetLeft, el.offsetTop]; };
    window.addEventListener('mousemove', mv);
    window.addEventListener('mouseup', up);
  });
  const w: Win = {
    el, body, title: t, key,
    close() { el.remove(); openWins.delete(key); w.onClose?.(); },
  };
  x.onclick = () => w.close();
  openWins.set(key, w);
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
