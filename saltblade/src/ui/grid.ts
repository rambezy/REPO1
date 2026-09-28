// Inventory grids and equipment slots with drag and drop, and item tooltips.
import { h, esc } from './dom';
import { Grid, Item } from '../sim/inventory';
import { ITEM, GRADES, gradeName, itemValue, EquipSlot, slotFor } from '../content/items';
import { iconFor, CELL_PX } from './icons';
import { LIMB_NAMES } from '../sim/body';
import { SKILL_INFO } from '../sim/skills';

export type Source = { kind: 'grid'; grid: Grid; view: GridView } | { kind: 'slot'; slot: EquipSlot; view: SlotView };

interface Drag { item: Item; src: Source; ghost: HTMLElement; ox: number; oy: number; }
let drag: Drag | null = null;
export const dropTargets = new Set<GridView | SlotView>();

// ---------------------------------------------------------------- tooltip
let tip: HTMLDivElement | null = null;
export function showTip(html: string, x: number, y: number) {
  if (!tip) { tip = h('div', { class: 'tip' }); document.body.appendChild(tip); }
  tip.innerHTML = html;
  tip.style.display = 'block';
  const r = tip.getBoundingClientRect();
  tip.style.left = Math.min(window.innerWidth - r.width - 8, x + 16) + 'px';
  tip.style.top = Math.min(window.innerHeight - r.height - 8, y + 12) + 'px';
}
export function hideTip() { if (tip) tip.style.display = 'none'; }

export function itemTip(it: Item, price?: number): string {
  const d = ITEM[it.id];
  const g = d.graded ? GRADES[it.q] : null;
  let s = `<div class="tt-name" style="color:${g ? g.col : '#e8dcc0'}">${esc(gradeName(d, it.q))}${it.n > 1 ? ` <span class="dim">×${it.n}</span>` : ''}</div>`;
  s += `<div class="tt-desc">${esc(d.desc)}</div>`;
  const rows: string[] = [];
  if (d.weapon) {
    const w = d.weapon, k = g ? g.dmg : 1;
    rows.push(`Skill <b>${SKILL_INFO[w.skill].name}</b>`);
    rows.push(`Cut <b>${Math.round(w.cut * k)}</b> · Blunt <b>${Math.round(w.blunt * k)}</b>`);
    rows.push(`Reach <b>${w.reach.toFixed(1)} m</b> · Speed <b>${Math.round(w.speed * 100)}%</b> · Weight <b>${w.weight} kg</b>`);
    const extras: string[] = [];
    if (w.twoHanded) extras.push('two-handed');
    if (w.bleed > 1.05) extras.push(`bleeding ×${w.bleed.toFixed(2)}`);
    if (w.pierce > 0) extras.push(`armour piercing ${Math.round(w.pierce * 100)}%`);
    if (w.vsAnimal > 1) extras.push(`vs animals ×${w.vsAnimal}`);
    if (w.vsRobot > 1) extras.push(`vs machines ×${w.vsRobot}`);
    if (w.vsRobot < 1) extras.push(`vs machines ×${w.vsRobot}`);
    if (w.knock) extras.push('knocks down');
    if (w.indoor) extras.push('clumsy indoors');
    if (w.def) extras.push(`+${w.def} defence`);
    if (extras.length) rows.push(`<span class="dim">${extras.join(' · ')}</span>`);
  }
  if (d.ranged) {
    const r = d.ranged, k = g ? g.dmg : 1;
    rows.push(`Cut <b>${Math.round(r.cut * k)}</b> · Blunt <b>${Math.round(r.blunt * k)}</b> · Range <b>${r.range} m</b>`);
    rows.push(`Reload <b>${r.reload.toFixed(1)} s</b> · Accuracy <b>${Math.round(r.accuracy * 100)}%</b> · Uses bolts`);
  }
  if (d.armour) {
    const a = d.armour, k = g ? g.arm : 1;
    rows.push(`Cut resist <b>${Math.round(a.cut * k * 100)}%</b> · Blunt resist <b>${Math.round(a.blunt * k * 100)}%</b>`);
    const cover = Object.entries(a.cover).filter(([, v]) => v! > 0).map(([l, v]) => `${LIMB_NAMES[['head', 'chest', 'stomach', 'larm', 'rarm', 'lleg', 'rleg'].indexOf(l)]} ${Math.round(v! * 100)}%`);
    if (cover.length) rows.push(`<span class="dim">Covers ${cover.join(', ')}</span>`);
    const pens: string[] = [];
    if (a.dex) pens.push(`attack speed −${Math.round(a.dex * 100)}%`);
    if (a.stealth > 0) pens.push(`stealth −${Math.round(a.stealth * 100)}%`);
    if (a.stealth < 0) pens.push(`stealth +${Math.round(-a.stealth * 100)}%`);
    if (a.athletics) pens.push(`speed −${Math.round(a.athletics * 100)}%`);
    if (a.martial) pens.push(`martial arts −${Math.round(a.martial * 100)}%`);
    if (a.acid) pens.push(`acid protection ${Math.round(a.acid * 100)}%`);
    if (a.bonus) for (const [s, v] of Object.entries(a.bonus)) pens.push(`${SKILL_INFO[s as keyof typeof SKILL_INFO].name} ${v! > 0 ? '+' : ''}${v}`);
    if (pens.length) rows.push(`<span class="dim">${pens.join(' · ')}</span>`);
  }
  if (d.pack) rows.push(`Holds <b>${d.pack.w}×${d.pack.h}</b> · Contents weigh <b>${Math.round(d.pack.lighten * 100)}%</b>${d.pack.combat ? ` · combat −${Math.round(d.pack.combat * 100)}%` : ''}`);
  if (d.food) rows.push(`Nutrition <b>${d.food}</b>`);
  if (d.med) rows.push(`${d.med.robot ? 'Repair' : 'Medical'} points <b>${d.med.points}</b> · quality <b>${d.med.quality}</b>${d.med.splint ? ' · splints broken limbs' : ''}`);
  if (d.limb) rows.push(`Prosthetic ${d.limb.part} · ${Object.entries(d.limb.bonus).map(([s, v]) => `${SKILL_INFO[s as keyof typeof SKILL_INFO].name} ${v! > 0 ? '+' : ''}${v}`).join(', ')}`);
  if (d.research) rows.push(`Research value: <b>tier ${d.research}</b>`);
  if (d.illegal) rows.push(`<span class="bad">Illegal in Covenant lands</span>`);
  if (it.stolen) rows.push(`<span class="bad">Stolen</span>`);
  rows.push(`<span class="dim">Weight ${(d.weight * it.n).toFixed(1)} kg · Value ${itemValue(d, it.q) * it.n}c${price !== undefined ? ` · <b style="color:#e8c060">Price ${price}c</b>` : ''}</span>`);
  return s + rows.map((r) => `<div class="tt-row">${r}</div>`).join('');
}

// ---------------------------------------------------------------- grid view
export interface GridHooks {
  canTake?: (it: Item) => boolean; // may items be dragged out
  accept?: (it: Item, src: Source) => boolean; // may items be dropped in
  moved?: (it: Item, src: Source, dst: Source) => void; // after a successful move
  rclick?: (it: Item, e: MouseEvent) => void;
  price?: (it: Item) => number | undefined;
  label?: string;
}

export class GridView {
  el: HTMLDivElement;
  cells: HTMLDivElement;
  constructor(public grid: Grid, public hooks: GridHooks = {}) {
    this.el = h('div', { class: 'gridwrap' });
    this.cells = h('div', { class: 'grid' });
    this.cells.style.width = grid.w * CELL_PX + 'px';
    this.cells.style.height = grid.h * CELL_PX + 'px';
    if (hooks.label) this.el.appendChild(h('div', { class: 'gridlabel' }, hooks.label));
    this.el.appendChild(this.cells);
    dropTargets.add(this);
    this.render();
  }
  destroy() { dropTargets.delete(this); }
  render() {
    this.cells.innerHTML = '';
    for (const it of this.grid.items) {
      const d = ITEM[it.id];
      const e = h('div', { class: 'item' + (it.stolen ? ' stolen' : '') });
      e.style.left = it.x * CELL_PX + 'px';
      e.style.top = it.y * CELL_PX + 'px';
      e.style.width = d.w * CELL_PX + 'px';
      e.style.height = d.h * CELL_PX + 'px';
      e.style.backgroundImage = `url(${iconFor(it.id)})`;
      if (d.graded) e.style.borderColor = GRADES[it.q].col;
      if (it.n > 1) e.appendChild(h('span', { class: 'cnt' }, String(it.n)));
      const price = this.hooks.price?.(it);
      if (price !== undefined) e.appendChild(h('span', { class: 'price' }, price + 'c'));
      e.onmouseenter = (ev) => showTip(itemTip(it, price), ev.clientX, ev.clientY);
      e.onmousemove = (ev) => showTip(itemTip(it, price), ev.clientX, ev.clientY);
      e.onmouseleave = hideTip;
      e.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); hideTip(); this.hooks.rclick?.(it, ev); };
      e.onmousedown = (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault(); ev.stopPropagation();
        if (this.hooks.canTake && !this.hooks.canTake(it)) return;
        startDrag(it, { kind: 'grid', grid: this.grid, view: this }, ev, e);
      };
      this.cells.appendChild(e);
    }
  }
  /** Grid cell under a screen point. */
  cellAt(x: number, y: number): [number, number] | null {
    const r = this.cells.getBoundingClientRect();
    if (x < r.left || y < r.top || x > r.right || y > r.bottom) return null;
    return [Math.floor((x - r.left) / CELL_PX), Math.floor((y - r.top) / CELL_PX)];
  }
}

// ---------------------------------------------------------------- equipment slot
export interface SlotHooks {
  get: () => Item | null;
  set: (it: Item | null) => boolean;
  accept: (it: Item) => boolean;
  moved?: () => void;
  label: string;
}

export class SlotView {
  el: HTMLDivElement;
  constructor(public slot: EquipSlot, public hooks: SlotHooks, w = 2, hgt = 2) {
    this.el = h('div', { class: 'slot' });
    this.el.style.width = w * CELL_PX + 'px';
    this.el.style.height = hgt * CELL_PX + 'px';
    dropTargets.add(this);
    this.render();
  }
  destroy() { dropTargets.delete(this); }
  render() {
    this.el.innerHTML = '';
    const it = this.hooks.get();
    if (!it) { this.el.appendChild(h('span', { class: 'slotlabel' }, this.hooks.label)); this.el.style.backgroundImage = ''; return; }
    const d = ITEM[it.id];
    this.el.style.backgroundImage = `url(${iconFor(it.id)})`;
    this.el.style.borderColor = d.graded ? GRADES[it.q].col : '';
    this.el.onmouseenter = (ev) => { const i = this.hooks.get(); if (i) showTip(itemTip(i), ev.clientX, ev.clientY); };
    this.el.onmouseleave = hideTip;
    this.el.onmousedown = (ev) => {
      if (ev.button !== 0) return;
      const i = this.hooks.get();
      if (!i) return;
      ev.preventDefault(); ev.stopPropagation();
      startDrag(i, { kind: 'slot', slot: this.slot, view: this }, ev, this.el);
    };
  }
}

function startDrag(it: Item, src: Source, ev: MouseEvent, from: HTMLElement) {
  hideTip();
  const d = ITEM[it.id];
  const ghost = h('div', { class: 'item ghost' });
  ghost.style.width = d.w * CELL_PX + 'px';
  ghost.style.height = d.h * CELL_PX + 'px';
  ghost.style.backgroundImage = `url(${iconFor(it.id)})`;
  document.body.appendChild(ghost);
  const r = from.getBoundingClientRect();
  const ox = Math.min(ev.clientX - r.left, d.w * CELL_PX - 4), oy = Math.min(ev.clientY - r.top, d.h * CELL_PX - 4);
  drag = { item: it, src, ghost, ox, oy };
  const mv = (e: MouseEvent) => {
    ghost.style.left = e.clientX - ox + 'px';
    ghost.style.top = e.clientY - oy + 'px';
  };
  mv(ev);
  const up = (e: MouseEvent) => {
    window.removeEventListener('mousemove', mv);
    window.removeEventListener('mouseup', up);
    ghost.remove();
    const dg = drag!;
    drag = null;
    finishDrop(dg, e.clientX - ox + CELL_PX / 2, e.clientY - oy + CELL_PX / 2, e.clientX, e.clientY);
  };
  window.addEventListener('mousemove', mv);
  window.addEventListener('mouseup', up);
}

function removeFromSource(src: Source, it: Item) {
  if (src.kind === 'grid') src.grid.remove(it);
  else src.view.hooks.set(null);
}

function finishDrop(dg: Drag, gx: number, gy: number, mx: number, my: number) {
  const it = dg.item;
  for (const t of dropTargets) {
    if (t instanceof SlotView) {
      const r = t.el.getBoundingClientRect();
      if (mx < r.left || mx > r.right || my < r.top || my > r.bottom) continue;
      if (dg.src.kind === 'slot' && dg.src.view === t) return;
      if (!t.hooks.accept(it)) return;
      const prev = t.hooks.get();
      removeFromSource(dg.src, it);
      if (!t.hooks.set(it)) { restore(dg); return; }
      // swap the previous item back into the source if possible
      if (prev) {
        if (dg.src.kind === 'grid') { if (!dg.src.grid.put(prev, it.x, it.y) && !dg.src.grid.put(prev)) t.hooks.set(prev); }
        else if (dg.src.view.hooks.accept(prev)) dg.src.view.hooks.set(prev);
      }
      t.hooks.moved?.();
      dg.src.view.render();
      t.render();
      if (dg.src.kind === 'grid') dg.src.view.hooks.moved?.(it, dg.src, { kind: 'slot', slot: t.slot, view: t });
      return;
    }
    const cell = t.cellAt(gx, gy) ?? t.cellAt(mx, my);
    if (!cell) continue;
    if (t.hooks.accept && !t.hooks.accept(it, dg.src)) return;
    const [x, y] = cell;
    if (dg.src.kind === 'grid' && dg.src.grid === t.grid) {
      if (t.grid.put(it, x, y)) { if (it.n <= 0) t.grid.remove(it); t.render(); }
      return;
    }
    // into another grid
    const n0 = it.n;
    removeFromSource(dg.src, it);
    const ok = t.grid.put(it, x, y) || t.grid.put(it);
    if (!ok) {
      if (it.n > 0) restore(dg);
    }
    if (it.n <= 0) t.grid.remove(it);
    if (ok || it.n < n0) {
      t.hooks.moved?.(it, dg.src, { kind: 'grid', grid: t.grid, view: t });
      if (dg.src.kind === 'grid') dg.src.view.hooks.moved?.(it, dg.src, { kind: 'grid', grid: t.grid, view: t });
      else dg.src.view.hooks.moved?.();
    }
    t.render();
    dg.src.view.render();
    return;
  }
}

function restore(dg: Drag) {
  if (dg.src.kind === 'grid') { if (!dg.src.grid.put(dg.item, dg.item.x, dg.item.y)) dg.src.grid.put(dg.item); }
  else dg.src.view.hooks.set(dg.item);
}

export function acceptsSlot(slot: EquipSlot) {
  return (it: Item) => {
    const s = slotFor(ITEM[it.id]);
    return s === slot || (slot === 'weapon2' && s === 'weapon');
  };
}
