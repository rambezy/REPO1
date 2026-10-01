// Full-screen cinematic cards: chapter titles, letters, epilogue slides.

import { UI, el } from './ui';
import { input } from '../engine/input';
import { G } from '../G';
import { formatText } from './dialogue';
import { fillText } from '../systems/script';
import { autoAdvance } from './dialogue';

export function card(title: string, sub = '', body = '', opts: { secs?: number; skippable?: boolean; bg?: string } = {}): Promise<void> {
  return new Promise((resolve) => {
    const prevMode = G.mode;
    G.mode = 'cutscene';
    const c = el('div', { id: 'cine' });
    if (opts.bg) c.style.background = opts.bg;
    c.style.opacity = '0';
    c.style.transition = 'opacity 1.2s';
    c.innerHTML = `${sub ? `<div class="s">${formatText(fillText(sub))}</div>` : ''}${title ? `<div class="t">${formatText(fillText(title))}</div>` : ''}${body ? `<div class="p">${formatText(fillText(body)).replace(/\n/g, '<br>')}</div>` : ''}<div class="skip">${opts.skippable === false ? '' : 'Press E or tap to continue'}</div>`;
    UI.root.appendChild(c);
    requestAnimationFrame(() => (c.style.opacity = '1'));
    const start = performance.now();
    const secs = opts.secs ?? 4;
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      c.style.opacity = '0';
      setTimeout(() => { c.remove(); if (G.mode === 'cutscene' && prevMode !== 'cutscene') G.mode = prevMode; resolve(); }, 1200);
    };
    c.addEventListener('click', () => { if (performance.now() - start > 800) end(); });
    const tick = () => {
      if (done) return;
      const t = (performance.now() - start) / 1000;
      if (t > 0.8 && opts.skippable !== false && (input.pressed('confirm') || input.pressed('interact') || (autoAdvance && t > 1.2))) { end(); return; }
      if (t > secs && opts.skippable === false) { end(); return; }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** A sequence of cards, used for the epilogue. */
export async function slides(list: { title?: string; sub?: string; body: string; secs?: number }[]) {
  for (const s of list) await card(s.title || '', s.sub || '', s.body, { secs: s.secs ?? 6 });
}
