// Buying and selling. Prices depend on Speech, charisma, reputation and perks.

import { openScreen, el, button } from './ui';
import { S, ItemStack } from '../state';
import { ITEMS, item } from '../content/items';
import { MERCHANTS, MerchantDef } from '../content/merchants';
import { iconURL } from '../gfx/icons';
import { addItem, removeItem, sortedInventory, weight, isEquipped, count } from '../systems/inventory';
import { attr, hasPerk, addXp, carryCap } from '../systems/stats';
import { charisma } from '../systems/script';
import { notify, esc } from './notify';
import { sfx } from '../audio/sfx';
import { Actor } from '../world/actor';
import { emit } from '../engine/events';

const RESTOCK_DAYS = 3;

function stockFor(m: MerchantDef) {
  let st = S.merchants[m.id];
  const day = Math.floor(S.minutes / 1440);
  if (!st || day >= st.restock) {
    const keep = st ? st.stock.filter((s) => !m.sells.some(([id]) => id === s.id)) : [];
    st = { restock: day + RESTOCK_DAYS, stock: [...keep, ...m.sells.filter(([id, n]) => n > 0 && ITEMS[id]).map(([id, n]) => ({ id, n }))], money: Math.max(st?.money ?? 0, m.money) };
    S.merchants[m.id] = st;
  }
  return st;
}

export function haggle(): number {
  let h = (attr('speech') - 3) * 0.02 + charisma() * 0.008;
  if (hasPerk('haggler')) h += 0.08;
  return Math.max(-0.1, Math.min(0.22, h));
}

function repMod(m: MerchantDef) {
  const r = S.rep[m.settlement || 'linden'] ?? 30;
  return 1 - (r - 30) * 0.0015;
}

export function buyPrice(m: MerchantDef, id: string) {
  return Math.max(1, Math.round(item(id).value * (1.25 - haggle()) * (m.markup ?? 1) * repMod(m)));
}
export function sellPrice(m: MerchantDef, s: ItemStack) {
  const d = item(s.id);
  let p = d.value * (0.45 + haggle() * 0.8);
  if (s.cond !== undefined) p *= 0.4 + (s.cond / 100) * 0.6;
  if (s.stolen) p *= hasPerk('fence') ? 0.7 : 0.4;
  if (hasPerk('hunter') && (d.id.endsWith('pelt') || d.id.endsWith('hide'))) p *= 1.3;
  return Math.max(d.value > 0 ? 1 : 0, Math.floor(p));
}

function canBuyFrom(m: MerchantDef, s: ItemStack) {
  const d = item(s.id);
  if (d.quest || d.noSell || d.cat === 'key') return false;
  if (s.stolen && !m.fence) return false;
  return m.buys === 'all' || m.buys.includes(d.cat);
}

export function openTrade(merchantId: string, who?: Actor) {
  const m = MERCHANTS[merchantId];
  if (!m) { notify('They have nothing to sell.', 'bad'); return; }
  const st = stockFor(m);
  emit('trade', merchantId);
  openScreen('trade', (close) => {
    const book = el('div', { cls: 'vellum book' });
    const tabs = el('div', { cls: 'tabs' });
    tabs.append(el('button', { cls: 'tab on', html: esc(m.name) }));
    const x = el('button', { cls: 'close', html: '✕' });
    x.addEventListener('click', close);
    tabs.append(x);
    const page = el('div', { cls: 'page' });
    const grid = el('div', { cls: 'trade' });
    const left = el('div', { cls: 'side' });
    const right = el('div', { cls: 'side' });
    grid.append(left, right);
    page.append(el('p', { cls: 'meta', html: `Click to buy or sell one. Your Speech and appearance affect prices (${haggle() >= 0 ? '+' : ''}${Math.round(haggle() * 100)}%).${m.fence ? ' This merchant does not ask where things come from.' : ''}` }), grid);
    book.append(tabs, page);
    const render = () => {
      left.innerHTML = '';
      right.innerHTML = '';
      left.append(el('h3', { html: `${esc(who?.name || m.name)}'s wares <span class="coins">${st.money} g</span>` }));
      const l1 = el('div', { cls: 'inv-list' });
      st.stock.forEach((s, i) => {
        const d = item(s.id);
        const price = buyPrice(m, s.id);
        const b = el('button', { cls: 'inv-row' });
        b.innerHTML = `<img src="${iconURL(d.icon)}" alt=""><span class="nm" title="${esc(d.desc)}">${esc(d.name)}</span><span class="n">×${s.n}</span><span class="price">${price} g</span>`;
        b.addEventListener('click', () => {
          if (S.money < price) { notify('You cannot afford that.', 'bad', 1800); sfx('fail'); return; }
          if (weight() + d.weight > carryCap() + 20) { notify('You cannot carry any more.', 'bad', 1800); return; }
          S.money -= price;
          st.money += price;
          s.n--;
          if (s.n <= 0) st.stock.splice(i, 1);
          addItem(s.id, 1, { quiet: true });
          sfx('coin');
          addXp('speech', 0.5);
          render();
        });
        l1.append(b);
      });
      if (!st.stock.length) l1.append(el('p', { html: '<i>Sold out. Come back in a few days.</i>' }));
      left.append(l1);
      right.append(el('h3', { html: `Your goods <span class="coins">${S.money} g</span>` }));
      const l2 = el('div', { cls: 'inv-list' });
      for (const e of sortedInventory()) {
        if (!canBuyFrom(m, e.stack)) continue;
        const price = sellPrice(m, e.stack);
        const b = el('button', { cls: 'inv-row' + (e.stack.stolen ? ' stolen' : '') });
        b.innerHTML = `<img src="${iconURL(e.def.icon)}" alt=""><span class="nm">${esc(e.def.name)}${isEquipped(e.stack.id) ? ' <span class="eq">(worn)</span>' : ''}</span><span class="n">${e.stack.n > 1 ? '×' + e.stack.n : ''}</span><span class="price">${price} g</span>`;
        b.addEventListener('click', () => {
          if (st.money < price) { notify(`${m.name} cannot afford that.`, 'bad', 1800); return; }
          if (isEquipped(e.stack.id) && count(e.stack.id) <= 1) { notify('Take it off first.', 'bad', 1800); return; }
          const stolen = !!e.stack.stolen;
          if (e.def.stack) { e.stack.n--; if (e.stack.n <= 0) S.inv.splice(e.index, 1); }
          else S.inv.splice(e.index, 1);
          S.money += price;
          st.money -= price;
          const same = st.stock.find((x) => x.id === e.stack.id);
          if (same) same.n++; else st.stock.push({ id: e.stack.id, n: 1 });
          sfx('coin');
          addXp('speech', 0.5);
          if (stolen) addXp('thievery', 1);
          render();
        });
        l2.append(b);
      }
      right.append(l2);
    };
    render();
    return book;
  });
}

export { removeItem };
