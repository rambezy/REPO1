// Barter screen: two tables, offer when your side is worth at least theirs.

import { G, player } from '../game/G';
import { el, esc } from '../core/util';
import { ITEMS } from '../data/items';
import type { Actor, Stack } from '../game/types';
import { button, closeModal, itemRow, openModal, askQuantity } from './common';
import { stackable, addItem } from '../game/actors';
import { skill } from '../game/character';
import { msg, emit } from '../game/log';
import { sfx } from '../audio/sfx';
import { bark } from '../game/script';

let win: HTMLElement;
let trader: Actor;
let myOffer: Stack[] = [];
let theirOffer: Stack[] = [];

function mult(): { buy: number; sell: number } {
  const pb = skill(player(), 'barter');
  const tb = skill(trader, 'barter');
  const diff = pb - tb;
  const buy = Math.max(1, Math.min(2.2, 1.6 - diff / 150));
  const sell = Math.max(0.2, Math.min(0.9, 0.5 + diff / 300));
  return { buy, sell };
}

function valueOf(st: Stack, side: 'mine' | 'theirs'): number {
  const d = ITEMS[st.id];
  if (st.id === 'scrip') return st.n;
  const m = mult();
  let v = d.value * st.n;
  if (d.weapon?.ammo && st.ammo) v += (ITEMS[d.weapon.ammo]?.value ?? 0) * st.ammo;
  return Math.max(st.n, Math.round(v * (side === 'mine' ? m.sell : m.buy)));
}

export function openBarter(a: Actor) {
  trader = a;
  myOffer = [];
  theirOffer = [];
  win = el('div', 'panel win barter');
  import('./dialogue').then((d) => d.closeDialogue());
  setTimeout(() => {
    openModal('barter', win, { onClose: cancel });
    render();
  }, 30);
}

function cancel() {
  const p = player();
  for (const s of myOffer) put(p.inv, s);
  for (const s of theirOffer) put(trader.inv, s);
  myOffer = [];
  theirOffer = [];
  emit('hud');
}

function put(inv: Stack[], s: Stack) {
  if (stackable(s.id)) addItem({ inv }, s.id, s.n);
  else inv.push(s);
}

async function shift(from: Stack[], to: Stack[], st: Stack) {
  const n = stackable(st.id) && st.n > 1 ? await askQuantity(st.n, ITEMS[st.id].name) : st.n;
  if (!n) return;
  if (ITEMS[st.id].quest && from === player().inv) {
    msg('You shouldn\'t trade that away.');
    return;
  }
  if (n >= st.n) {
    from.splice(from.indexOf(st), 1);
    put(to, st);
  } else {
    st.n -= n;
    put(to, { ...st, n });
  }
  sfx('click');
  render();
}

function column(title: string, items: Stack[], side: 'mine' | 'theirs', onClick: (s: Stack) => void): HTMLElement {
  const col = el('div', 'col');
  col.appendChild(el('h3', '', esc(title)));
  const list = el('div', 'itemlist screen scrolly');
  list.style.flex = '1';
  for (const st of items) {
    const row = itemRow(st, { price: valueOf(st, side) });
    row.onclick = () => onClick(st);
    list.appendChild(row);
  }
  col.appendChild(list);
  return col;
}

function render() {
  const p = player();
  win.innerHTML = '';
  win.appendChild(el('h2', '', 'Barter with ' + esc(trader.name)));
  const body = el('div', 'body');
  const mine = myOffer.reduce((n, s) => n + valueOf(s, 'mine'), 0);
  const theirs = theirOffer.reduce((n, s) => n + valueOf(s, 'theirs'), 0);
  const c1 = column('Your items', p.inv.filter((s) => !ITEMS[s.id]?.quest), 'mine', (s) => shift(p.inv, myOffer, s));
  const c2 = column('Your offer', myOffer, 'mine', (s) => shift(myOffer, p.inv, s));
  c2.appendChild(el('div', 'total screen', `$${mine}`));
  const c3 = column('Their offer', theirOffer, 'theirs', (s) => shift(theirOffer, trader.inv, s));
  c3.appendChild(el('div', 'total screen', `$${theirs}`));
  const c4 = column(trader.name + '\'s goods', trader.inv, 'theirs', (s) => shift(trader.inv, theirOffer, s));
  body.append(c1, c2, c3, c4);
  win.appendChild(body);
  const row = el('div', 'row');
  row.style.justifyContent = 'center';
  row.append(
    button('Offer', () => offer()),
    button('Talk', () => {
      closeModal('barter');
      if (trader.dialog) import('./dialogue').then((d) => d.openDialogue(trader.dialog!, trader));
    }),
    button('Done', () => closeModal('barter')),
  );
  const info = el('div', '', `<small style="color:#c8b890">Your Barter ${skill(p, 'barter')}% vs ${skill(trader, 'barter')}%. Click items to move them.</small>`);
  win.append(row, info);
}

function offer() {
  const p = player();
  const mine = myOffer.reduce((n, s) => n + valueOf(s, 'mine'), 0);
  const theirs = theirOffer.reduce((n, s) => n + valueOf(s, 'theirs'), 0);
  if (!myOffer.length && !theirOffer.length) return;
  if (mine < theirs) {
    bark(trader, 'That\'s not enough.');
    msg(`${trader.name}: "That's not a fair trade."`);
    sfx('locked');
    return;
  }
  for (const s of theirOffer) put(p.inv, s);
  for (const s of myOffer) put(trader.inv, s);
  myOffer = [];
  theirOffer = [];
  sfx('coins');
  msg('The trade is done.');
  bark(trader, 'Pleasure doing business.');
  render();
}
