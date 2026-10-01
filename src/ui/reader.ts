// Reading books. Illegible words are scrambled until your Reading improves.

import { openScreen, el, button } from './ui';
import { BOOKS } from '../content/books';
import { S } from '../state';
import { hashStr } from '../engine/util';
import { addXp, skill } from '../systems/stats';
import { notify, esc } from './notify';
import { emit } from '../engine/events';
import { waitHours } from '../systems/survival';
import { sfx } from '../audio/sfx';

/** Fraction of words legible at a reading level, relative to the book's difficulty. */
function legibility(level: number, bookLevel: number): number {
  if (level >= bookLevel + 1) return 1;
  if (level <= 0) return bookLevel <= 0 ? 1 : 0;
  const gap = bookLevel - level;
  return gap <= 0 ? 0.93 : gap === 1 ? 0.6 : 0.3;
}

function scramble(word: string): string {
  const letters = word.split('');
  for (let i = letters.length - 1; i > 0; i--) {
    const j = (hashStr(word + i) % (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  return letters.join('');
}

export function renderText(text: string, level: number, bookLevel: number): string {
  const leg = legibility(level, bookLevel);
  let idx = 0;
  return text.split(/(\s+)/).map((tok) => {
    if (/^\s+$/.test(tok) || !tok) return tok;
    idx++;
    const core = tok.replace(/[^A-Za-zÀ-ž]/g, '');
    if (core.length <= 1) return esc(tok);
    const h = (hashStr(core.toLowerCase() + idx) % 1000) / 1000;
    // longer words are harder
    const diff = Math.min(1, h * 0.8 + core.length * 0.035);
    if (diff < leg) return esc(tok);
    return `<span class="scr">${esc(scramble(tok))}</span>`;
  }).join('');
}

export function readBook(id: string) {
  const b = BOOKS[id];
  if (!b) { notify('The pages are blank.', 'bad'); return; }
  const lvl = skill('reading');
  const leg = legibility(lvl, b.level);
  sfx('book');
  openScreen('reader', (close) => {
    const m = el('div', { cls: 'vellum bookread' });
    m.append(el('h2', { html: esc(b.title) }));
    let note = '';
    if (leg <= 0) note = 'The letters crawl across the page like ants. You cannot read a word of it.';
    else if (leg < 0.7) note = 'You pick out a word here and there. Reading is hard work.';
    else if (leg < 1) note = 'Most of it makes sense, if you follow the words with your finger.';
    if (note) m.append(el('p', { cls: 'meta', html: note }));
    m.append(el('div', { cls: 'txt', html: renderText(b.text, lvl, b.level) }));
    const row = el('div', { cls: 'row', style: 'margin-top:14px' } as never);
    (row as HTMLElement).style.display = 'flex';
    (row as HTMLElement).style.gap = '8px';
    (row as HTMLElement).style.justifyContent = 'flex-end';
    const first = !S.booksRead.includes(id);
    if (first && leg > 0 && b.teaches) {
      row.append(button(`Study it (${b.hours ?? 1} h)`, async () => {
        close();
        await waitHours(b.hours ?? 1);
        S.booksRead.push(id);
        const mult = leg >= 1 ? 1 : 0.5;
        addXp(b.teaches!.skill, b.teaches!.xp * mult);
        addXp('reading', 10 + (b.hours ?? 1) * 5);
        if (b.recipe) for (const r of b.recipe) if (!S.recipes.includes(r)) { S.recipes.push(r); notify(`Recipe learned: <b>${r.replace(/_/g, ' ')}</b>.`, 'skill'); }
        emit('studied', id);
      }, 'btn primary'));
    } else if (first && leg > 0) {
      S.booksRead.push(id);
      addXp('reading', 3);
    }
    row.append(button('Close', close));
    m.append(row);
    emit('read:' + id, leg);
    emit('read', id, leg);
    return m;
  });
}
