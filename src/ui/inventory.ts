// Inventory screen: item list, paper doll, item actions.

import { G, player } from '../game/G';
import { el, esc } from '../core/util';
import { ITEMS } from '../data/items';
import { button, closeModal, itemRow, openModal, askQuantity } from './common';
import { iconURL } from '../render/icons';
import type { Stack } from '../game/types';
import { armorClass, carryWeight, damageResist, damageThreshold, inventoryWeight, maxHp, stat } from '../game/character';
import { equipStack, unequip, removeStack, stackable, addItem } from '../game/actors';
import { useItemFromInventory } from '../game/effects';
import { msg, emit } from '../game/log';
import { sfx } from '../audio/sfx';
import { attackModes } from '../game/combat';
import { OBJ_SCRIPTS } from '../content/registry';
import { ctx } from '../game/script';
import { autoEndTurn } from '../game/interact';

let sel: Stack | null = null;
let win: HTMLElement;

export function openInventory() {
  if (G.modal) return;
  sel = null;
  win = el('div', 'panel win inv');
  openModal('inventory', win, { onClose: () => emit('hud') });
  render();
}

function useApCost(): number {
  const p = player();
  return p.perks?.quickHands ? 1 : 2;
}

function spendAp(n: number): boolean {
  if (!G.combat) return true;
  const p = player();
  if (!G.combat.playerTurn) return false;
  if ((p._ap ?? 0) < n) {
    msg('Not enough action points.');
    return false;
  }
  p._ap! -= n;
  return true;
}

function render() {
  const p = player();
  win.innerHTML = '';
  win.appendChild(el('h2', '', 'Inventory'));
  win.appendChild(button('X', () => closeModal('inventory'), 'small close'));
  const body = el('div', 'body');

  // Item list
  const list = el('div', 'itemlist screen scrolly');
  const sorted = [...p.inv].sort((a, b) => typeOrder(a) - typeOrder(b));
  for (const st of sorted) {
    const row = itemRow(st, { selected: st === sel });
    row.onclick = () => {
      sel = st;
      render();
    };
    row.ondblclick = () => primaryAction(st);
    list.appendChild(row);
  }
  if (!p.inv.length) list.appendChild(el('div', '', '<i>Nothing.</i>'));

  // Paper doll
  const doll = el('div', 'doll');
  doll.appendChild(slot('Armor', p.armor, () => {
    if (p.armor) {
      if (!spendAp(useApCost())) return;
      unequip(p, 'armor');
      render();
    }
  }));
  doll.appendChild(slot('Left hand' + (p.active === 0 ? ' *' : ''), p.hands[0], () => {
    if (p.hands[0]) {
      unequip(p, 0);
      render();
    } else {
      p.active = 0;
      render();
    }
  }));
  doll.appendChild(slot('Right hand' + (p.active === 1 ? ' *' : ''), p.hands[1], () => {
    if (p.hands[1]) {
      unequip(p, 1);
      render();
    } else {
      p.active = 1;
      render();
    }
  }));
  const stats = el('div', 'statsbox screen');
  const w = inventoryWeight(p);
  const cw = carryWeight(p);
  stats.innerHTML = `
    <div>${esc(p.name)}</div>
    <div><span class="k">HP</span> ${p.hp}/${maxHp(p)} &nbsp; <span class="k">AC</span> ${armorClass(p)}</div>
    <div><span class="k">DT/DR</span> ${damageThreshold(p, 'normal')}/${damageResist(p, 'normal')}% normal</div>
    <div><span class="k">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span> ${damageThreshold(p, 'laser')}/${damageResist(p, 'laser')}% laser</div>
    <div><span class="k">Weight</span> <span style="color:${w > cw ? '#ff4a36' : ''}">${w}/${cw}</span></div>
    <div><span class="k">Scrip</span> ${p.inv.filter((s) => s.id === 'scrip').reduce((n, s) => n + s.n, 0)}</div>
    ${G.combat ? `<div><span class="k">AP</span> ${p._ap}</div>` : ''}`;
  doll.appendChild(stats);

  // Description + actions
  const right = el('div', 'doll');
  const desc = el('div', 'desc screen scrolly');
  desc.style.flex = '1';
  const actions = el('div', 'actions');
  if (sel) {
    const d = ITEMS[sel.id];
    let t = `<b style="color:var(--amber)">${esc(d.name)}</b><br>${esc(d.desc)}<br><br>`;
    if (d.weapon) {
      const wd = d.weapon;
      t += `Damage: ${wd.dmg[0]}-${wd.dmg[1]} ${wd.dmgType !== 'normal' ? '(' + wd.dmgType + ')' : ''}<br>Range: ${wd.range} &nbsp; Min ST: ${wd.minST}<br>`;
      if (wd.ammo) t += `Ammo: ${sel.ammo ?? 0}/${wd.mag} ${esc(ITEMS[wd.ammo]?.name ?? '')}<br>`;
      t += `Hands: ${wd.hands}<br>`;
      if (wd.minST > stat(p, 'STR')) t += `<span style="color:#ff4a36">Too heavy for you to use well.</span><br>`;
    }
    if (d.armor) {
      t += `AC: ${d.armor.ac}<br>`;
      for (const k of ['normal', 'laser', 'fire', 'plasma', 'explode'] as const) t += `${k}: ${d.armor.dt[k] ?? 0}/${d.armor.dr[k] ?? 0}%<br>`;
    }
    t += `Weight: ${d.weight} &nbsp; Value: ${d.value}`;
    desc.innerHTML = t;
    const st = sel;
    if (d.type === 'weapon') {
      actions.append(
        button('Left hand', () => equip(st, 0), 'small'),
        button('Right hand', () => equip(st, 1), 'small'),
      );
      if (d.weapon?.ammo && (st.ammo ?? 0) > 0) actions.append(button('Unload', () => unload(st), 'small'));
    }
    if (d.type === 'armor') actions.append(button('Wear', () => equip(st), 'small'));
    if (d.use) actions.append(button('Use', () => use(st), 'small'));
    if (d.type === 'drug' || d.type === 'misc') {
      actions.append(button('Put in hand', () => equip(st, p.active), 'small'));
    }
    if (d.id !== 'scrip' || true) actions.append(button('Drop', () => drop(st), 'small'));
  } else {
    desc.innerHTML = '<span style="color:var(--green-dim)">Select an item. Double-click to use or equip.</span>';
  }
  right.append(desc, actions);
  body.append(list, doll, right);
  win.appendChild(body);
}

function typeOrder(s: Stack): number {
  const t = ITEMS[s.id]?.type;
  return ['weapon', 'armor', 'ammo', 'drug', 'misc', 'book', 'key'].indexOf(t ?? 'misc') * 1000 + (ITEMS[s.id]?.name.charCodeAt(0) ?? 0);
}

function slot(title: string, st: Stack | null, onClick: () => void): HTMLElement {
  const s = el('div', 'slot screen');
  const ic = el('div', 'ic');
  if (st) ic.style.backgroundImage = `url(${iconURL(ITEMS[st.id]?.icon ?? 'box', 144, 96)})`;
  const cap = el('div', 'cap', `<span>${esc(title)}</span><span>${st ? esc(ITEMS[st.id]?.name ?? '') : '--'}</span>`);
  s.append(ic, cap);
  s.onclick = onClick;
  s.title = st ? 'Click to unequip' : 'Click to make active';
  return s;
}

function primaryAction(st: Stack) {
  const d = ITEMS[st.id];
  if (d.type === 'weapon') equip(st, player().active);
  else if (d.type === 'armor') equip(st);
  else if (d.use) use(st);
}

function equip(st: Stack, hand?: 0 | 1) {
  const p = player();
  const d = ITEMS[st.id];
  if (d.type === 'armor' && !spendAp(useApCost())) return;
  if (d.weapon?.hands === 2 && hand !== undefined) {
    // Two-handed weapons are fine in either slot; just equip.
  }
  equipStack(p, st, hand);
  if (hand !== undefined) p.active = hand;
  sfx('click');
  const modes = attackModes(p);
  p.mode[p.active] = Math.min(p.mode[p.active], modes.length - 1);
  sel = null;
  render();
}

function use(st: Stack) {
  const p = player();
  const d = ITEMS[st.id];
  const custom = d.use ? OBJ_SCRIPTS['use:' + d.use] : undefined;
  if (!spendAp(useApCost())) return;
  if (custom) {
    closeModal('inventory');
    custom(ctx(), { id: st.id, kind: 'item', q: p.q, r: p.r }, p);
    return;
  }
  useItemFromInventory(p, st.id);
  if (!p.inv.includes(st)) sel = null;
  render();
  if (G.combat) autoEndTurn();
}

function unload(st: Stack) {
  const p = player();
  const d = ITEMS[st.id];
  if (!d.weapon?.ammo || !st.ammo) return;
  addItem(p, st.ammoId ?? d.weapon.ammo, st.ammo);
  st.ammo = 0;
  render();
}

async function drop(st: Stack) {
  const p = player();
  const d = ITEMS[st.id];
  if (d.quest) {
    msg('You had better hold on to that.');
    return;
  }
  const n = stackable(st.id) ? await askQuantity(st.n, `Drop ${d.name}`) : 1;
  if (!n || !G.map) return;
  const s = removeStack(p, st, n);
  G.map.dropItem(p.q, p.r, s.id, s.n, s.ammo !== undefined ? { ammo: s.ammo, ammoId: s.ammoId } : {});
  sel = null;
  render();
}
