// Looting containers and bodies: two columns, click to move items.

import { openScreen, el, button } from './ui';
import { S, ItemStack } from '../state';
import { item } from '../content/items';
import { iconURL } from '../gfx/icons';
import { container, takeFrom, putInto, sortedInventory, weight, addMoney } from '../systems/inventory';
import { carryCap } from '../systems/stats';
import { Actor } from '../world/actor';
import { commitCrime } from '../systems/crime';
import { esc } from './notify';
import { lootTable } from '../content/loot';
import { emit } from '../engine/events';

function row(s: ItemStack, onClick: () => void, extra = ''): HTMLElement {
  const d = s.id === 'coins' ? { name: 'Groschen', icon: { shape: 'purse' } } : item(s.id);
  const b = el('button', { cls: 'inv-row' + (s.stolen ? ' stolen' : '') });
  b.innerHTML = `<img src="${iconURL(d.icon)}" alt=""><span class="nm">${esc(d.name)}</span><span class="n">${s.n > 1 || s.id === 'coins' ? '×' + s.n : ''}</span><span class="eq">${extra}</span>`;
  b.addEventListener('click', onClick);
  return b;
}

export function openLoot(cid: string, title: string, stealing: boolean) {
  const stock = container(cid, () => lootTable(cid));
  let stoleReported = false;
  openScreen('loot', (close) => {
    const book = el('div', { cls: 'vellum book' });
    const tabs = el('div', { cls: 'tabs' });
    tabs.append(el('button', { cls: 'tab on', html: esc(title) }));
    const x = el('button', { cls: 'close', html: '✕' });
    x.addEventListener('click', close);
    tabs.append(x);
    const page = el('div', { cls: 'page' });
    const cols = el('div', { cls: 'trade' });
    const left = el('div', { cls: 'side' });
    const right = el('div', { cls: 'side' });
    cols.append(left, right);
    page.append(cols);
    book.append(tabs, page);
    const render = () => {
      left.innerHTML = '';
      right.innerHTML = '';
      const h1 = el('h3', { html: `${esc(title)}${stealing ? ' <span class="coins" style="color:var(--madder)">(stealing)</span>' : ''}` });
      const takeAll = button('Take all', () => {
        if (stealing && !stoleReported && stock.length) { stoleReported = true; commitCrime('theft', stock.reduce((v, s) => v + (s.id === 'coins' ? s.n : item(s.id).value * s.n), 0), null); }
        while (stock.length) takeFrom(cid, 0, stealing);
        emit('looted', cid);
        render();
      });
      left.append(h1, takeAll);
      const l1 = el('div', { cls: 'inv-list' });
      if (!stock.length) l1.append(el('p', { html: '<i>Empty.</i>' }));
      stock.forEach((s, i) => l1.append(row(s, () => {
        if (stealing && !stoleReported) { stoleReported = true; commitCrime('theft', s.id === 'coins' ? s.n : item(s.id).value * s.n, null); }
        takeFrom(cid, i, stealing);
        emit('looted', cid);
        render();
      })));
      left.append(l1);
      const w = weight(), cap = carryCap();
      right.append(el('h3', { html: `Your pack <span class="weight ${w > cap ? 'over' : ''}">${w} / ${cap} lb · ${S.money} g</span>` }));
      const l2 = el('div', { cls: 'inv-list' });
      for (const e of sortedInventory()) {
        if (e.def.quest) continue;
        l2.append(row(e.stack, () => { putInto(cid, e.index); render(); }));
      }
      right.append(l2);
    };
    render();
    return book;
  });
}

export function openBodyLoot(a: Actor) {
  const cid = 'body:' + a.id;
  if (!a.mem.looted) {
    a.mem.looted = true;
    const stock = container(cid, () => []);
    if (a.mem.loot) for (const s of a.mem.loot as ItemStack[]) stock.push({ ...s });
    if (a.mem.coins) stock.push({ id: 'coins', n: a.mem.coins });
  }
  openLoot(cid, a.name, false);
}

export { addMoney };
