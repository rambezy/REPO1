// Player inventory, equipment, consumables and containers.

import { S, ItemStack } from '../state';
import { ITEMS, item, ItemDef, Slot } from '../content/items';
import { G } from '../G';
import { notify, esc } from '../ui/notify';
import { Look } from '../gfx/characters';
import { CLOTH, HAIR, P } from '../gfx/palette';
import { addBuff, addXp, carryCap, maxHp, BUFF_INFO } from './stats';
import { sfx } from '../audio/sfx';
import { emit } from '../engine/events';
import { defaultCombat } from '../world/actor';
import { readBook } from '../ui/reader';

export function count(id: string): number {
  return S.inv.filter((s) => s.id === id).reduce((n, s) => n + s.n, 0);
}
export const has = (id: string, n = 1) => count(id) >= n;

export function addItem(id: string, n = 1, opts: { stolen?: boolean; quiet?: boolean; q?: number } = {}) {
  const d = ITEMS[id];
  if (!d) { console.warn('addItem unknown', id); return; }
  if (id === 'coins') { addMoney(n, opts.quiet); return; }
  if (d.stack) {
    const s = S.inv.find((x) => x.id === id && !!x.stolen === !!opts.stolen);
    if (s) s.n += n; else S.inv.push({ id, n, stolen: opts.stolen || undefined });
  } else {
    for (let i = 0; i < n; i++) S.inv.push({ id, n: 1, stolen: opts.stolen || undefined, cond: d.cond ? 100 : undefined, q: opts.q });
  }
  if (!opts.quiet) notify(`Received <b>${esc(d.name)}</b>${n > 1 ? ` ×${n}` : ''}.`, 'item');
  sfx('pickup');
  emit('item', id, n);
  emit('item:' + id, n);
}

export function removeItem(id: string, n = 1): boolean {
  if (count(id) < n) return false;
  let left = n;
  for (let i = S.inv.length - 1; i >= 0 && left > 0; i--) {
    const s = S.inv[i];
    if (s.id !== id) continue;
    const take = Math.min(left, s.n);
    s.n -= take;
    left -= take;
    if (s.n <= 0) {
      // unequip if needed
      for (const k of Object.keys(S.equip)) if (S.equip[k] === id && count(id) - take <= 0) S.equip[k] = null;
      S.inv.splice(i, 1);
    }
  }
  refreshEquipment();
  return true;
}

export function addMoney(n: number, quiet = false) {
  S.money = Math.max(0, S.money + n);
  if (!quiet && n !== 0) notify(n > 0 ? `+${n} groschen` : `${n} groschen`, 'item', 2400);
  if (n > 0) sfx('coin');
}

export function weight(): number {
  let w = 0;
  for (const s of S.inv) w += item(s.id).weight * s.n;
  return Math.round(w * 10) / 10;
}
export const overweight = () => weight() > carryCap();

// ---------- equipment ----------

export function equip(id: string) {
  const d = item(id);
  const slot = d.slot;
  if (!slot || !has(id)) return;
  if (slot === 'weapon' && d.ranged) S.equip.bow = id;
  else S.equip[slot] = id;
  sfx(slot === 'weapon' ? 'sheathe' : 'pickup');
  refreshEquipment();
  emit('equip', id);
}
export function unequip(slot: Slot) {
  S.equip[slot] = null;
  refreshEquipment();
}
export function isEquipped(id: string) {
  return Object.values(S.equip).includes(id);
}

export const BASE_LOOK: Look = {
  skin: 'fair', hair: HAIR.brown, hairStyle: 'messy', shirt: CLOTH.linen, legs: CLOTH.brown, boots: P.wood1,
  eyes: '#4a6a3a', face: { jaw: 'round', nose: 'small', brows: 'thick', mouth: 'wide' }, portraitBg: '#6b5a44',
};

/** Builds the player's appearance from what they are wearing. */
export function playerLook(): Look {
  const look: Look = JSON.parse(JSON.stringify(BASE_LOOK));
  const body = S.equip.body, head = S.equip.head, legs = S.equip.legs;
  switch (body) {
    case 'russet_vest': look.outer = 'vest'; look.outerColor = CLOTH.russet; break;
    case 'fine_doublet': look.outer = 'noble'; look.outerColor = CLOTH.woad; look.trim = CLOTH.ochre; break;
    case 'smith_apron': look.outer = 'apron'; look.apronColor = P.wood2; break;
    case 'gambeson': look.outer = 'gambeson'; look.outerColor = CLOTH.olive; break;
    case 'leather_jerkin': look.outer = 'leather'; look.outerColor = CLOTH.darkbrown; break;
    case 'mail_hauberk': look.outer = 'mail'; break;
    case 'linden_tabard': look.outer = 'tabard'; look.outerColor = CLOTH.green; look.trim = CLOTH.ochre; break;
    case 'brigandine': look.outer = 'brigandine'; look.outerColor = CLOTH.crimson; break;
    case 'harrow_brigandine': look.outer = 'brigandine'; look.outerColor = CLOTH.black; look.cape = undefined; break;
    case 'plate_cuirass': look.outer = 'plate'; break;
    case 'monk_robe': look.outer = 'robe'; look.outerColor = CLOTH.brown; break;
    case 'servant_clothes': look.shirt = CLOTH.undyed; break;
    case 'linen_shirt': look.shirt = CLOTH.linen; break;
    case null: case undefined: look.shirt = CLOTH.linen; break;
  }
  switch (head) {
    case 'linen_cap': look.hat = 'cap'; look.hatColor = CLOTH.linen; break;
    case 'hood': look.hat = 'hood'; look.hatColor = CLOTH.forest; break;
    case 'padded_coif': look.hat = 'hood'; look.hatColor = CLOTH.linenDark; break;
    case 'mail_coif': look.hat = 'coif'; break;
    case 'kettle_hat': look.hat = 'kettle'; break;
    case 'bascinet': look.hat = 'bascinet'; break;
    case 'black_sallet': look.hat = 'sallet'; look.hatColor = '#2a2a30'; break;
  }
  if (body === 'monk_robe' && !head) { look.hat = 'monkhood'; look.hatColor = CLOTH.brown; }
  switch (legs) {
    case 'fine_hose': look.legs = CLOTH.crimson; break;
    case 'padded_chausses': look.legs = CLOTH.olive; break;
    case 'mail_chausses': look.legs = P.metal2; break;
    case 'plate_greaves': look.legs = P.metal3; look.boots = P.metal2; break;
    case 'hose': look.legs = CLOTH.brown; break;
  }
  if (S.dirt > 60) look.shirt = mix(look.shirt, '#5a4a3a', 0.3);
  return look;
}

function mix(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + [r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Recomputes weapon, armour, look and max values on the player actor. */
export function refreshEquipment() {
  const p = G.player;
  if (!p) return;
  const c = defaultCombat();
  const wid = S.equip.weapon;
  if (wid && has(wid)) {
    const d = item(wid);
    if (d.weapon) c.weapon = { id: wid, ...d.weapon };
  }
  if (p.mem.bowMode && S.equip.bow && has(S.equip.bow)) {
    const d = item(S.equip.bow);
    c.weapon = { id: S.equip.bow, kind: 'bow', slash: 0, stab: d.ranged!.dmg, blunt: 0, reach: 200, speed: 1, staminaCost: 6 };
  }
  for (const slot of ['head', 'body', 'legs', 'hands'] as const) {
    const id = S.equip[slot];
    if (!id || !has(id)) continue;
    const a = item(id).armor;
    if (!a) continue;
    c.armor.slash += a.slash; c.armor.stab += a.stab; c.armor.blunt += a.blunt; c.armor.noise += a.noise; c.armor.charisma += a.charisma;
    c.armor.weight += item(id).weight;
  }
  // preserve transient combat state
  const old = p.combat;
  c.phase = old.phase; c.phaseT = old.phaseT; c.phaseLen = old.phaseLen; c.bleeding = old.bleeding; c.invuln = old.invuln;
  c.attackKind = old.attackKind; c.attackAngle = old.attackAngle; c.combo = old.combo; c.blockT = old.blockT;
  p.combat = c;
  p.look = playerLook();
  p.maxHp = maxHp();
}

export function disguise(): string | null {
  const b = S.equip.body;
  return b ? item(b).disguise || null : null;
}

// ---------- using items ----------

export function useItem(id: string): boolean {
  const d = item(id);
  if (!has(id)) return false;
  if (d.slot) { if (isEquipped(id)) { unequip(d.slot === 'weapon' && d.ranged ? 'bow' : d.slot); } else equip(id); return true; }
  if (d.book) { readBook(d.book); return true; }
  if (d.cat === 'food' || d.cat === 'potion' || id === 'bandage') {
    if (d.food && S.hunger >= 99 && !d.heal && !d.alcohol) { notify('You couldn\'t eat another bite.', 'bad'); return false; }
    removeItem(id, 1);
    consume(d);
    return true;
  }
  if (id === 'torch' || id === 'lantern') { S.equip.torch = isEquipped(id) ? null : id; return true; }
  notify(`You turn the ${esc(d.name.toLowerCase())} over in your hands.`, 'info', 2200);
  return false;
}

export function consume(d: ItemDef) {
  const p = G.player;
  if (d.food) {
    const before = S.hunger;
    S.hunger = Math.min(110, S.hunger + d.food);
    if (before > 95 && S.hunger > 100) notify('You are stuffed. Moving feels like work.', 'bad', 2800);
    if (d.food >= 25) addBuff('fed_well', 90);
  }
  if (d.cat === 'potion') sfx('gulp'); else if (d.alcohol) sfx('drink'); else if (d.food) sfx('eat');
  if (d.heal) p.hp = Math.max(1, Math.min(p.maxHp, p.hp + d.heal));
  if (d.stamina) p.stamina = Math.min(p.maxStamina, p.stamina + d.stamina);
  if (d.energy) S.energy = Math.min(100, S.energy + d.energy);
  if (d.alcohol) { S.drunk = Math.min(100, S.drunk + d.alcohol); if (S.drunk > 70) notify('The world tilts pleasantly.', 'info'); }
  if (d.cures) {
    for (const c of d.cures) {
      if (c === 'bleeding' && p.combat.bleeding > 0) { p.combat.bleeding = 0; notify('The bleeding stops.', 'info'); }
      if (c === 'drunk') S.drunk = Math.max(0, S.drunk - 50);
      if (c === 'poison') S.buffs = S.buffs.filter((b) => b.id !== 'queasy');
    }
  }
  if (d.buff) {
    if (d.buff.id === 'queasy' && S.perks.includes('iron_stomach')) { /* immune */ }
    else { addBuff(d.buff.id, d.buff.minutes, d.buff.power); const bi = BUFF_INFO[d.buff.id]; if (bi) notify(`<b>${bi.name}</b>: ${bi.desc}`, bi.good ? 'skill' : 'bad'); }
  }
  if (d.cat === 'potion') addXp('alchemy', 0.5);
  emit('consume', d.id);
}

// ---------- containers ----------

export function container(id: string, init?: () => ItemStack[]): ItemStack[] {
  if (!S.containers[id]) S.containers[id] = init ? init() : [];
  return S.containers[id];
}

export function takeFrom(cid: string, index: number, stolen: boolean) {
  const c = S.containers[cid];
  if (!c || !c[index]) return;
  const s = c[index];
  c.splice(index, 1);
  if (s.id === 'coins') { addMoney(s.n); return; }
  const d = item(s.id);
  if (d.stack) addItem(s.id, s.n, { stolen: stolen || s.stolen, quiet: true });
  else { S.inv.push({ ...s, stolen: stolen || s.stolen || undefined }); emit('item', s.id, s.n); emit('item:' + s.id, s.n); }
  sfx('pickup');
}

export function putInto(cid: string, invIndex: number) {
  const s = S.inv[invIndex];
  if (!s) return;
  const d = item(s.id);
  if (d.quest) { notify('You should keep that.', 'bad'); return; }
  if (isEquipped(s.id) && count(s.id) <= 1) {
    for (const k of Object.keys(S.equip)) if (S.equip[k] === s.id) S.equip[k] = null;
  }
  S.inv.splice(invIndex, 1);
  const c = container(cid);
  const same = d.stack ? c.find((x) => x.id === s.id) : null;
  if (same) same.n += s.n; else c.push(s);
  refreshEquipment();
}

export function sortedInventory(): { stack: ItemStack; index: number; def: ItemDef }[] {
  const order: Record<string, number> = { quest: 0, weapon: 1, armor: 2, ammo: 3, food: 4, potion: 5, herb: 6, tool: 7, book: 8, key: 9, material: 10, misc: 11 };
  return S.inv.map((stack, index) => ({ stack, index, def: item(stack.id) }))
    .sort((a, b) => (order[a.def.cat] ?? 20) - (order[b.def.cat] ?? 20) || a.def.name.localeCompare(b.def.name));
}
