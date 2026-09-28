// Reading a book: the text in a window, and a little learning the first
// time each of your people reads it.
import { h, openWindow } from './dom';
import { S } from '../sim/ctx';
import { BOOK } from '../content/lore';
import { SK } from '../sim/skills';

export function openBook(key: string, readerId?: number) {
  const b = BOOK[key];
  if (!b) return;
  const w = openWindow('book', b.title, { w: 520, cls: 'bookwin' });
  w.body.innerHTML = '';
  const c = readerId ? S.W.char(readerId) : undefined;
  let learned = '';
  if (c && !c.animal) {
    const read: string[] = c.mem.read ?? (c.mem.read = []);
    if (!read.includes(key)) {
      read.push(key);
      if (b.science > 0 && !c.robot) {
        const before = c.sk[SK.science];
        c.sk[SK.science] = Math.min(100, before + b.science * (before < 20 ? 1.5 : before < 50 ? 1 : 0.5));
        learned = `${c.name} learned something. Science ${Math.floor(before)} → ${Math.floor(c.sk[SK.science])}.`;
        S.fx.notice(learned, 'good');
      }
      S.W.say(`${c.name} read ${b.title}.`, 'info', S.clock.t);
    }
  }
  w.body.append(
    h('div', { class: 'bookhead' },
      h('div', { class: 'bookkind' }, b.kind),
      h('div', { class: 'booktitle' }, b.title),
      h('div', { class: 'bookauthor' }, b.author && b.author !== 'Unknown' ? b.author : 'Author unknown'),
    ),
    h('div', { class: 'booktext' + (b.kind === 'poetry' ? ' poem' : '') }, ...b.text.map((p) => h('p', {}, p))),
  );
  if (learned) w.body.append(h('div', { class: 'booklearn' }, learned));
}
