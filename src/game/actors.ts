// Creating actors, inventory helpers and equipment.

import { PROTOS, type Look } from '../data/protos';
import { ITEMS, item } from '../data/items';
import type { Actor, Stack } from './types';
import { maxHp } from './character';
import { chance } from '../core/rng';

export interface MakeOpts {
  uid: string;
  q: number;
  r: number;
  name?: string;
  npc?: string;
  dialog?: string;
  team?: string;
  hostile?: boolean;
  wander?: number;
  barter?: boolean;
  inv?: { id: string; n?: number }[];
  equip?: string[];
  facing?: number;
  essential?: boolean;
  look?: Partial<Look>;
  hp?: number;
}

export function makeActor(protoId: string, o: MakeOpts): Actor {
  const p = PROTOS[protoId];
  if (!p) throw new Error('Unknown proto ' + protoId);
  const a: Actor = {
    uid: o.uid,
    proto: protoId,
    name: o.name ?? p.name,
    q: o.q,
    r: o.r,
    facing: o.facing ?? 2,
    stats: { ...p.stats },
    level: 1,
    xp: 0,
    hp: 1,
    inv: [],
    hands: [null, null],
    active: 1,
    mode: [0, 0],
    armor: null,
    team: o.team ?? p.team ?? 'neutral',
    hostile: o.hostile ?? p.hostile ?? false,
    dead: false,
    crippled: {},
    rads: 0,
    poison: 0,
    effects: [],
    npc: o.npc,
    dialog: o.dialog,
    home: { q: o.q, r: o.r },
    wander: o.wander,
    barter: o.barter,
    essential: o.essential,
  };
  if (o.look) (a as any).look = o.look;
  if (o.hp) a.maxHpBonus = o.hp - maxHp(a);
  for (const s of p.inv ?? []) {
    if (s.chance !== undefined && !chance(s.chance)) continue;
    addItem(a, s.id, s.n ?? 1);
  }
  for (const s of o.inv ?? []) addItem(a, s.id, s.n ?? 1);
  for (const id of o.equip ?? p.equip ?? []) {
    addItem(a, id, 1);
    equipById(a, id);
  }
  a.hp = maxHp(a);
  return a;
}

/** Actor look: proto look merged with per-actor overrides. */
export function lookOf(a: Actor): Look {
  const base = PROTOS[a.proto]?.look ?? { body: 'human' };
  const extra = (a as any).look as Partial<Look> | undefined;
  return extra ? { ...base, ...extra } : base;
}

export function stackable(id: string): boolean {
  const d = ITEMS[id];
  return !!d && d.type !== 'weapon' && d.type !== 'armor';
}

export function addItem(a: { inv: Stack[] }, id: string, n = 1, extra: Partial<Stack> = {}) {
  if (!ITEMS[id]) {
    console.warn('addItem: unknown item', id);
    return;
  }
  if (stackable(id)) {
    const s = a.inv.find((x) => x.id === id);
    if (s) {
      s.n += n;
      return;
    }
    a.inv.push({ id, n, ...extra });
    return;
  }
  for (let i = 0; i < n; i++) {
    const w = ITEMS[id].weapon;
    const st: Stack = { id, n: 1, ...extra };
    if (w?.ammo && st.ammo === undefined) {
      st.ammo = 0;
      st.ammoId = w.ammo;
    }
    a.inv.push(st);
  }
}

export function countItem(a: Actor, id: string): number {
  let n = 0;
  for (const s of a.inv) if (s.id === id) n += s.n;
  for (const h of a.hands) if (h?.id === id) n += h.n;
  if (a.armor?.id === id) n += 1;
  return n;
}

/** Remove up to n of an item; returns how many were removed. */
export function removeItem(a: Actor, id: string, n = 1): number {
  let left = n;
  for (let i = a.inv.length - 1; i >= 0 && left > 0; i--) {
    const s = a.inv[i];
    if (s.id !== id) continue;
    const take = Math.min(left, s.n);
    s.n -= take;
    left -= take;
    if (s.n <= 0) a.inv.splice(i, 1);
  }
  for (let h = 0; h < 2 && left > 0; h++) {
    const s = a.hands[h];
    if (s?.id === id) {
      a.hands[h] = null;
      left -= 1;
    }
  }
  if (left > 0 && a.armor?.id === id) {
    a.armor = null;
    left -= 1;
  }
  return n - left;
}

export function removeStack(a: Actor, st: Stack, n = st.n): Stack {
  const i = a.inv.indexOf(st);
  if (n >= st.n) {
    if (i >= 0) a.inv.splice(i, 1);
    for (let h = 0; h < 2; h++) if (a.hands[h] === st) a.hands[h] = null;
    if (a.armor === st) a.armor = null;
    return st;
  }
  st.n -= n;
  return { ...st, n };
}

export function equipById(a: Actor, id: string) {
  const st = a.inv.find((s) => s.id === id);
  if (!st) return;
  equipStack(a, st);
}

export function equipStack(a: Actor, st: Stack, hand?: 0 | 1) {
  const d = item(st.id);
  const i = a.inv.indexOf(st);
  if (d.type === 'armor') {
    if (i >= 0) a.inv.splice(i, 1);
    if (a.armor) a.inv.push(a.armor);
    a.armor = st.n > 1 ? { ...st, n: 1 } : st;
    if (st.n > 1) {
      st.n -= 1;
      a.inv.splice(i, 0, st);
    }
    return;
  }
  const h = hand ?? a.active;
  let one = st;
  if (st.n > 1) {
    st.n -= 1;
    one = { ...st, n: 1 };
  } else if (i >= 0) a.inv.splice(i, 1);
  const prev = a.hands[h];
  if (prev) addBack(a, prev);
  a.hands[h] = one;
  a.mode[h] = 0;
}

function addBack(a: Actor, st: Stack) {
  if (stackable(st.id)) addItem(a, st.id, st.n);
  else a.inv.push(st);
}

export function unequip(a: Actor, slot: 'armor' | 0 | 1) {
  if (slot === 'armor') {
    if (a.armor) addBack(a, a.armor);
    a.armor = null;
  } else {
    const s = a.hands[slot];
    if (s) addBack(a, s);
    a.hands[slot] = null;
  }
}

export function activeWeapon(a: Actor): Stack | null {
  return a.hands[a.active];
}

/** For NPCs: equip the best usable weapon from inventory if hands empty. */
export function autoEquip(a: Actor) {
  if (!a.hands[a.active]) {
    const w = a.inv.find((s) => ITEMS[s.id]?.type === 'weapon');
    if (w) equipStack(a, w);
  }
  if (!a.armor) {
    const ar = a.inv.find((s) => ITEMS[s.id]?.type === 'armor');
    if (ar) equipStack(a, ar);
  }
}
