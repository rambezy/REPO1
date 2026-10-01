// Toast notifications and big location/quest banners.

let notesEl: HTMLElement | null = null;
let bannerEl: HTMLElement | null = null;

export function initNotify(root: HTMLElement) {
  notesEl = document.createElement('div');
  notesEl.className = 'notes passthrough';
  root.appendChild(notesEl);
}

export type NoteKind = 'info' | 'skill' | 'quest' | 'bad' | 'item';

const recent = new Map<string, number>();

export function notify(html: string, kind: NoteKind = 'info', ms = 4200) {
  if (!notesEl) return;
  const now = performance.now();
  const last = recent.get(html);
  if (last && now - last < 1500) return; // swallow duplicate spam
  recent.set(html, now);
  const el = document.createElement('div');
  el.className = `note ${kind}`;
  el.innerHTML = html;
  notesEl.appendChild(el);
  while (notesEl.children.length > 6) notesEl.firstElementChild?.remove();
  setTimeout(() => el.classList.add('fade'), ms);
  setTimeout(() => el.remove(), ms + 700);
}

export function banner(title: string, sub = '', ms = 3200) {
  const root = document.getElementById('ui');
  if (!root) return;
  if (bannerEl) bannerEl.remove();
  const el = document.createElement('div');
  el.className = 'banner passthrough';
  el.innerHTML = `${sub ? `<div class="s">${sub}</div>` : ''}<div class="t">${title}</div>`;
  root.appendChild(el);
  bannerEl = el;
  setTimeout(() => el.classList.add('out'), ms);
  setTimeout(() => { el.remove(); if (bannerEl === el) bannerEl = null; }, ms + 1300);
}

export function esc(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}
