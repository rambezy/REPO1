// Looting bodies and containers, and stealing from them.
import { h, openWindow, getWindow } from './dom';
import { GridView, SlotView, acceptsSlot, hideTip, Source } from './grid';
import { S } from '../sim/ctx';
import { Char, EQUIP_SLOTS } from '../sim/char';
import { WObj } from '../sim/objects';
import { Grid, Item, makeItem } from '../sim/inventory';
import { takeProsthetic } from '../sim/health';
import { ITEM, itemValue, EquipSlot } from '../content/items';
import { crime, witness } from '../sim/crime';
import { train, versus } from '../sim/train';
import { emit } from '../core/events';
import { canSee } from '../sim/ai';

let views: (GridView | SlotView)[] = [];

export function openLoot(looterId: number, target: { char?: number; obj?: number; steal?: boolean }) {
  const c = S.W.char(looterId);
  if (!c) return;
  const t = target.char ? S.W.char(target.char) : undefined;
  const o = target.obj ? S.W.objs.get(target.obj) : undefined;
  if (!t && !o) return;
  const title = t ? (target.steal ? `Pickpocketing ${t.name}` : `Looting ${t.name}`) : target.steal ? `Stealing from ${objName(o!)}` : objName(o!);
  const w = openWindow('loot', title, { w: 700, cls: 'lootwin' });
  const close = () => { for (const v of views) v.destroy(); views = []; hideTip(); };
  w.onClose = close;
  const render = () => {
    for (const v of views) v.destroy();
    views = [];
    w.body.innerHTML = '';
    if (Math.hypot(c.x - (t?.x ?? o!.x), c.z - (t?.z ?? o!.z)) > 4) { w.close(); return; }
    const owner = t ? t.faction : o!.owner;
    const stealing = !!target.steal && owner !== 'player';
    const onTake = (it: Item) => {
      if (!stealing) return true;
      return attemptTheft(c, it, owner, t);
    };
    // looter side
    const left = h('div', { class: 'lootside' }, h('div', { class: 'lhead' }, c.name));
    const mk = (g: Grid, label: string) => {
      const v = new GridView(g, {
        label,
        moved: (it, src, dst) => {
          if (dst.kind === 'grid' && (dst.grid === c.inv || dst.grid === c.eq.back?.inv) && stealing) it.stolen = owner;
          setTimeout(render, 0);
        },
      });
      views.push(v);
      left.appendChild(v.el);
    };
    mk(c.inv, 'Inventory');
    if (c.eq.back?.inv) mk(c.eq.back.inv, ITEM[c.eq.back.id].name);
    // target side
    const right = h('div', { class: 'lootside' }, h('div', { class: 'lhead' }, t ? t.name : objName(o!)));
    const grids: Grid[] = [];
    if (t) {
      grids.push(t.inv);
      if (t.eq.back?.inv) grids.push(t.eq.back.inv);
      if (!stealing || t.status !== 'up') {
        const eq = h('div', { class: 'lootslots' });
        for (const slot of EQUIP_SLOTS) {
          if (!t.eq[slot] || ITEM[t.eq[slot]!.id].builtin) continue;
          const sv = new SlotView(slot as EquipSlot, {
            label: slot,
            get: () => t.eq[slot],
            set: (it) => { t.eq[slot] = it; t.dirty = true; return true; },
            accept: acceptsSlot(slot as EquipSlot),
            moved: () => setTimeout(render, 0),
          }, 2, 2);
          views.push(sv);
          eq.appendChild(sv.el);
        }
        right.appendChild(eq);
      }
      // a downed body's prosthetics can be unbolted and carried off
      if (t.status !== 'up' && t.faction !== 'player') for (let l = 3; l < 7; l++) {
        if (!t.body.isProst(l)) continue;
        const d = ITEM[t.body.prost[l]!];
        const wrecked = t.body.hp[l] <= 0 ? ' (wrecked)' : '';
        const b = h('button', { class: 'tog small', title: d.desc }, `Unbolt their ${d.name.toLowerCase()}${wrecked}`);
        b.onclick = () => {
          if (stealing && !attemptTheft(c, makeItem(d.id), owner, t)) { render(); return; }
          const it = takeProsthetic(t, l);
          if (!it) return;
          if (stealing) it.stolen = owner;
          if (!c.inv.put(it) && !c.eq.back?.inv?.put(it)) dropOnGround(c.x, c.z, [it]);
          render();
        };
        right.appendChild(b);
      }
      if (t.money > 0 && (t.status !== 'up' || stealing)) {
        const b = h('button', { class: 'tog small' }, `Take ${t.money} chits`);
        b.onclick = () => {
          if (stealing && !attemptTheft(c, null, owner, t)) { render(); return; }
          S.W.money += t.money;
          emit('sound', 'coin', c.x, c.z, 1);
          t.money = 0;
          render();
        };
        right.appendChild(b);
      }
    } else if (o!.inv) grids.push(o!.inv);
    for (const g of grids) {
      const v = new GridView(g, {
        label: g === t?.inv ? 'Inventory' : g === t?.eq.back?.inv ? 'Pack' : 'Contents',
        canTake: (it) => onTake(it),
        accept: () => !stealing,
        moved: () => setTimeout(render, 0),
      });
      views.push(v);
      right.appendChild(v.el);
    }
    const takeAll = h('button', { class: 'tog' }, 'Take all');
    takeAll.onclick = () => {
      for (const g of grids) {
        for (const it of g.items.slice()) {
          if (stealing && !attemptTheft(c, it, owner, t)) { render(); return; }
          g.remove(it);
          if (stealing) it.stolen = owner;
          if (!c.inv.put(it) && !(c.eq.back?.inv?.put(it))) { g.put(it); break; }
        }
      }
      if (t && t.status === 'dead') for (const slot of EQUIP_SLOTS) {
        const it = t.eq[slot];
        if (it && !ITEM[it.id].builtin && (c.inv.put(it) || c.eq.back?.inv?.put(it))) { t.eq[slot] = null; t.dirty = true; }
      }
      render();
    };
    w.body.append(h('div', { class: 'loot' }, left, right), h('div', { class: 'lootfoot' }, stealing ? h('span', { class: 'bad' }, 'Stealing: every item risks being noticed.') : h('span'), takeAll));
  };
  render();
  const iv = setInterval(() => { if (!getWindow('loot')) clearInterval(iv); else if (Math.hypot(c.x - (t?.x ?? o!.x), c.z - (t?.z ?? o!.z)) > 4) getWindow('loot')!.close(); }, 500);
}

/** A single theft: thievery against the eyes around. */
function attemptTheft(c: Char, it: Item | null, owner: string, victim?: Char): boolean {
  const value = it ? itemValue(ITEM[it.id], it.q) * it.n : 50;
  const skill = c.skill('thievery');
  // the victim themselves notices pickpocketing
  let noticed = false;
  if (victim && victim.status === 'up') {
    const p = Math.max(0.05, Math.min(0.9, 0.5 - (skill - victim.skill('perception')) * 0.015 + value / 4000));
    noticed = S.rng.chance(p);
    train(c, 'thievery', 1.2, versus(skill, victim.skill('perception')));
  } else {
    const w = witness(c, owner, 20);
    if (w) {
      const p = Math.max(0.05, Math.min(0.9, 0.55 - skill * 0.012 + value / 5000));
      noticed = S.rng.chance(p) && canSee(w, c);
    }
    train(c, 'thievery', 0.8, 1 + value / 2000);
  }
  if (noticed) {
    crime(c, victim ? 'pickpocket' : 'theft', owner, Math.max(200, Math.round(value * 1.5)), false);
    if (victim) { victim.lastHitBy = c.id; victim.lastHitT = S.time; }
    return false;
  }
  return true;
}

export function objName(o: WObj) {
  if (o.data?.name) return o.data.name;
  switch (o.kind) {
    case 'pile': return 'Items on the ground';
    case 'counter': return 'Shop counter';
    case 'storage': return 'Storage';
    case 'chest': return 'Chest';
    case 'crate': return 'Crate';
  }
  return o.def;
}

/** Drops items on the ground as a pile (or adds to one nearby). */
export function dropOnGround(x: number, z: number, items: Item[]) {
  let pile: WObj | null = null;
  S.W.objHash.near(x, z, 2, (o) => { if (o.kind === 'pile' && !pile) pile = o; });
  if (!pile) {
    pile = S.W.addObj({ id: 0, kind: 'pile', def: 'pile', x, z, y: S.T.heightAt(x, z), rot: 0, owner: '', site: 0, parent: 0, inv: new Grid(8, 8) });
  }
  for (const it of items) if (!pile.inv!.put(it)) pile.inv!.add(it.id, it.n, it.q);
  emit('objs');
}

export type { Source };
