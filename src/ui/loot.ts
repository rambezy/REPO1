// Transfer screen for containers, bodies, ground piles and stealing.

import { G, player } from '../game/G';
import { el, esc } from '../core/util';
import { ITEMS } from '../data/items';
import type { Actor, MapObject, Stack } from '../game/types';
import { button, closeModal, itemRow, openModal, askQuantity } from './common';
import { stackable, addItem } from '../game/actors';
import { msg, emit } from '../game/log';
import { sfx } from '../audio/sfx';
import { stealRoll, objName } from '../game/interact';
import { aggro, startCombat, nameOf } from '../game/combat';
import { inventoryWeight, carryWeight } from '../game/character';

export type LootTarget =
  | { kind: 'object'; obj: MapObject }
  | { kind: 'body'; actor: Actor }
  | { kind: 'ground'; q: number; r: number }
  | { kind: 'steal'; actor: Actor };

let win: HTMLElement;
let target: LootTarget;

function otherInv(): Stack[] {
  switch (target.kind) {
    case 'object':
      return (target.obj.inv ??= []);
    case 'body':
    case 'steal':
      return target.actor.inv;
    case 'ground':
      return G.map!.groundAt(target.q, target.r).map((g) => g.stack);
  }
}

function title(): string {
  switch (target.kind) {
    case 'object': return objName(target.obj);
    case 'body': return target.actor.name;
    case 'ground': return 'Ground';
    case 'steal': return target.actor.name + ' (stealing)';
  }
}

export function openLoot(t: LootTarget) {
  if (G.modal) return;
  target = t;
  win = el('div', 'panel win loot');
  openModal('loot', win, { onClose: () => emit('hud') });
  render();
}

function render() {
  const p = player();
  win.innerHTML = '';
  win.appendChild(el('h2', '', esc(title())));
  win.appendChild(button('X', () => closeModal('loot'), 'small close'));
  const body = el('div', 'body');
  const left = el('div', 'col');
  const right = el('div', 'col');
  left.appendChild(el('h3', '', 'You'));
  right.appendChild(el('h3', '', esc(title())));
  const ll = el('div', 'itemlist screen scrolly');
  const rl = el('div', 'itemlist screen scrolly');
  ll.style.flex = rl.style.flex = '1';
  for (const st of p.inv) {
    const row = itemRow(st);
    row.onclick = () => move(st, 'put');
    ll.appendChild(row);
  }
  for (const st of otherInv()) {
    const row = itemRow(st);
    row.onclick = () => move(st, 'take');
    rl.appendChild(row);
  }
  if (!otherInv().length) rl.appendChild(el('div', '', '<i>Empty.</i>'));
  left.appendChild(ll);
  right.appendChild(rl);
  left.appendChild(el('div', '', `<small>Weight ${inventoryWeight(p)}/${carryWeight(p)}</small>`));
  body.append(left, right);
  win.appendChild(body);
  const row = el('div', 'row');
  row.style.justifyContent = 'center';
  if (target.kind !== 'steal') row.appendChild(button('Take all', () => takeAll()));
  row.appendChild(button('Done', () => closeModal('loot')));
  win.appendChild(row);
}

async function move(st: Stack, dir: 'take' | 'put') {
  const p = player();
  const n = stackable(st.id) && st.n > 1 ? await askQuantity(st.n, (dir === 'take' ? 'Take ' : 'Put ') + ITEMS[st.id].name) : st.n;
  if (!n) return;
  if (target.kind === 'steal') {
    const a = target.actor;
    const d = ITEMS[st.id];
    const ok = stealRoll(a, d.value * n, d.weight * n);
    if (!ok) {
      msg(`${nameOf(a, true)} catches you ${dir === 'take' ? 'stealing' : 'planting something'}!`);
      closeModal('loot');
      aggro(a);
      a.hostile = true;
      startCombat(a);
      return;
    }
  }
  if (dir === 'take' && !canCarry(st, n)) {
    msg('You cannot carry that much.');
    return;
  }
  if (dir === 'take') transfer(otherInv(), p.inv, st, n, true);
  else transfer(p.inv, otherInv(), st, n, false);
  sfx('pickup');
  render();
}

function transfer(from: Stack[], to: Stack[], st: Stack, n: number, taking: boolean) {
  const isGround = target.kind === 'ground';
  let moved: Stack;
  if (n >= st.n) {
    moved = st;
    if (isGround && taking) G.map!.ground = G.map!.ground.filter((g) => g.stack !== st);
    else {
      const i = from.indexOf(st);
      if (i >= 0) from.splice(i, 1);
    }
  } else {
    st.n -= n;
    moved = { ...st, n };
  }
  if (isGround && !taking) {
    G.map!.dropItem(target.kind === 'ground' ? target.q : 0, target.kind === 'ground' ? target.r : 0, moved.id, moved.n, moved.ammo !== undefined ? { ammo: moved.ammo, ammoId: moved.ammoId } : {});
    return;
  }
  if (stackable(moved.id)) addItem({ inv: to }, moved.id, moved.n);
  else to.push(moved);
}

function canCarry(st: Stack, n: number): boolean {
  const p = player();
  const w = (ITEMS[st.id]?.weight ?? 0) * n;
  return w <= 0 || inventoryWeight(p) + w <= carryWeight(p);
}

function takeAll() {
  const p = player();
  let full = false;
  for (const st of [...otherInv()]) {
    if (!canCarry(st, st.n)) {
      full = true;
      continue;
    }
    transfer(otherInv(), p.inv, st, st.n, true);
  }
  if (full) msg('You cannot carry everything.');
  sfx('pickup');
  closeModal('loot');
}
