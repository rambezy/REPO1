// Inventory grids and equipment slots with drag and drop, and item tooltips.
//
// Everything is driven by pointer events, so a mouse, a pen and a finger all
// work. A mouse drags, as it always has. A finger (or pen) can drag too, but
// the gentler way is to tap an item to pick it up, then tap a cell or a slot
// to put it there; a long press, or a tap on the item being carried, opens an
// action sheet with everything that can be done with it.
import { h, esc } from './dom';
import { Grid, Item } from '../sim/inventory';
import { openSheet, closeSheet, showHoldBar, hideHoldBar, SheetAction, tradeLabel } from './touch';
import { ITEM, GRADES, gradeName, itemValue, EquipSlot, slotFor } from '../content/items';
import { iconFor, CELL_PX } from './icons';
import { LIMB_NAMES } from '../sim/body';
import { SKILL_INFO } from '../sim/skills';
import { DRUG } from '../sim/drugs';
import { FACTION } from '../content/factions';

export type Source = { kind: 'grid'; grid: Grid; view: GridView } | { kind: 'slot'; slot: EquipSlot; view: SlotView };

interface Drag { item: Item; src: Source; }
let drag: Drag | null = null;
export const dropTargets = new Set<GridView | SlotView>();
/** the item picked up by a tap, waiting for a tap on where it should go */
let held: Drag | null = null;
/** what last pressed an item: compatibility mouse events after a tap must not open menus twice or leave tooltips behind */
let lastPointer = 'mouse';
/** how long a finger rests on an item before that is a press rather than a tap */
const PRESS_MS = 450;
export type ItemAction = SheetAction;

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
  if (it.cond !== undefined) rows.push(`<span class="${it.cond < 0.3 ? 'bad' : 'dim'}">Condition ${Math.round(it.cond * 100)}%</span>`);
  const dose = d.drug ? DRUG[d.drug] : undefined;
  if (dose) {
    const skills = (m: Partial<Record<string, number>>) => Object.entries(m).map(([s, v]) => `${SKILL_INFO[s as keyof typeof SKILL_INFO].name} ${v! > 0 ? '+' : ''}${v}`).join(', ');
    rows.push(`${dose.act}: <b>${skills(dose.lift)}</b>${dose.speed ? ` · runs ${Math.round((dose.speed - 1) * 100)}% faster` : ''}${dose.pain ? ' · dulls pain' : ''} for ${dose.hours}h`);
    if (dose.crash) rows.push(`<span class="dim">Then ${dose.crash}h coming down: ${skills(dose.low)}</span>`);
    rows.push(`<span class="${dose.hook >= 12 ? 'bad' : 'dim'}">${dose.hook >= 12 ? 'Hooks fast' : 'Habit-forming'}${dose.food ? ' · turns the stomach' : ''}</span>`);
  }
  if (d.research) rows.push(`Research value: <b>tier ${d.research}</b>`);
  if (d.illegal) rows.push(`<span class="bad">Contraband to the ${d.illegal.map((f) => FACTION[f]?.short ?? f).join(' and the ')}</span>`);
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
  /** what the action sheet calls `rclick` (without it, a label is guessed from the price) */
  rclickLabel?: string;
  /** what the action sheet offers for an item, instead of `rclick` */
  actions?: (it: Item) => ItemAction[];
  price?: (it: Item) => number | undefined;
  note?: (it: Item) => string | undefined; // more tooltip rows (HTML), e.g. where it sells for more
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
    // a tap on an empty cell puts the carried item there (an item's own handlers stop the event first)
    this.cells.addEventListener('pointerup', (ev) => {
      if (ev.pointerType === 'mouse' || !held || (ev.target as HTMLElement).closest('.item')) return;
      ev.preventDefault();
      placeHeld(ev.clientX, ev.clientY);
    });
    dropTargets.add(this);
    this.render();
  }
  destroy() {
    dropTargets.delete(this);
    // the carried item's window may have closed, or only been redrawn: find it again, or let it go
    if (held?.src.view === this) queueMicrotask(resolveHeld);
  }
  render() {
    this.cells.innerHTML = '';
    for (const it of this.grid.items) {
      const d = ITEM[it.id];
      const e = h('div', { class: 'item' + (it.stolen ? ' stolen' : '') + (held?.item === it ? ' held' : '') });
      e.style.left = it.x * CELL_PX + 'px';
      e.style.top = it.y * CELL_PX + 'px';
      e.style.width = d.w * CELL_PX + 'px';
      e.style.height = d.h * CELL_PX + 'px';
      e.style.backgroundImage = `url(${iconFor(it.id)})`;
      e.dataset.item = it.id;
      e.dataset.uid = String(it.uid);
      if (d.graded) e.style.borderColor = GRADES[it.q].col;
      if (it.n > 1) e.appendChild(h('span', { class: 'cnt' }, String(it.n)));
      const price = this.hooks.price?.(it);
      // short enough for a single cell: exact up to 9,999, then in thousands (the tooltip has it exact)
      if (price !== undefined) e.appendChild(h('span', { class: 'price' }, price >= 10000 ? Math.round(price / 1000) + 'k' : price + 'c'));
      // the item being carried keeps its source current across re-renders
      if (held?.item === it) held.src = { kind: 'grid', grid: this.grid, view: this };
      const src = (): Source => ({ kind: 'grid', grid: this.grid, view: this });
      hoverTip(e, () => itemTip(it, price) + (this.hooks.note?.(it) ?? ''));
      e.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); hideTip(); if (lastPointer === 'mouse') this.hooks.rclick?.(it, ev); };
      e.onpointerdown = (ev) => {
        lastPointer = ev.pointerType;
        if (ev.pointerType === 'mouse') {
          if (ev.button !== 0) return;
          ev.preventDefault(); ev.stopPropagation();
          if (this.hooks.canTake && !this.hooks.canTake(it)) return;
          startDrag(it, src(), ev, e);
          return;
        }
        ev.preventDefault(); ev.stopPropagation();
        touchPress(it, src(), ev, e, () => !this.hooks.canTake || this.hooks.canTake(it));
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
  /** what the action sheet offers for the item in the slot */
  actions?: (it: Item) => ItemAction[];
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
  destroy() {
    dropTargets.delete(this);
    if (held?.src.view === this) queueMicrotask(resolveHeld);
  }
  render() {
    this.el.innerHTML = '';
    const it = this.hooks.get();
    this.el.classList.toggle('held', !!it && held?.item === it);
    this.el.onpointerdown = null;
    this.el.oncontextmenu = null;
    // a tap on an empty slot puts the carried item in it
    this.el.onpointerup = (ev) => {
      if (ev.pointerType === 'mouse' || !held || this.hooks.get()) return;
      ev.preventDefault();
      placeHeld(ev.clientX, ev.clientY);
    };
    if (!it) { this.el.appendChild(h('span', { class: 'slotlabel' }, this.hooks.label)); this.el.style.backgroundImage = ''; hoverTip(this.el, null); return; }
    const d = ITEM[it.id];
    this.el.style.backgroundImage = `url(${iconFor(it.id)})`;
    this.el.style.borderColor = d.graded ? GRADES[it.q].col : '';
    if (held?.item === it) held.src = { kind: 'slot', slot: this.slot, view: this };
    hoverTip(this.el, () => { const i = this.hooks.get(); return i ? itemTip(i) : ''; });
    this.el.oncontextmenu = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    this.el.onpointerdown = (ev) => {
      lastPointer = ev.pointerType;
      const i = this.hooks.get();
      if (!i) return;
      if (ev.pointerType === 'mouse') {
        if (ev.button !== 0) return;
        ev.preventDefault(); ev.stopPropagation();
        startDrag(i, { kind: 'slot', slot: this.slot, view: this }, ev, this.el);
        return;
      }
      ev.preventDefault(); ev.stopPropagation();
      touchPress(i, { kind: 'slot', slot: this.slot, view: this }, ev, this.el, () => true);
    };
  }
}

/** Tooltips follow a mouse or a hovering pen: a finger has the action sheet instead. */
function hoverTip(el: HTMLElement, html: (() => string) | null) {
  if (!html) { el.onpointerenter = null; el.onpointermove = null; el.onpointerleave = null; return; }
  const show = (ev: PointerEvent) => { if (ev.pointerType === 'touch' || drag) return; const s = html(); if (s) showTip(s, ev.clientX, ev.clientY); };
  el.onpointerenter = show;
  el.onpointermove = show;
  el.onpointerleave = hideTip;
}

function startDrag(it: Item, src: Source, ev: PointerEvent, from: HTMLElement) {
  hideTip();
  const d = ITEM[it.id];
  const ghost = h('div', { class: 'item ghost' });
  ghost.style.width = d.w * CELL_PX + 'px';
  ghost.style.height = d.h * CELL_PX + 'px';
  ghost.style.backgroundImage = `url(${iconFor(it.id)})`;
  document.body.appendChild(ghost);
  const r = from.getBoundingClientRect();
  const ox = Math.min(ev.clientX - r.left, d.w * CELL_PX - 4), oy = Math.min(ev.clientY - r.top, d.h * CELL_PX - 4);
  drag = { item: it, src };
  const mv = (e: PointerEvent) => {
    if (e.pointerId !== ev.pointerId) return;
    ghost.style.left = e.clientX - ox + 'px';
    ghost.style.top = e.clientY - oy + 'px';
  };
  mv(ev);
  const end = () => {
    window.removeEventListener('pointermove', mv, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
    ghost.remove();
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== ev.pointerId) return;
    e.stopPropagation();
    end();
    const dg = drag!;
    drag = null;
    finishDrop(dg, e.clientX - ox + CELL_PX / 2, e.clientY - oy + CELL_PX / 2, e.clientX, e.clientY);
  };
  const cancel = (e: PointerEvent) => { if (e.pointerId !== ev.pointerId) return; end(); drag = null; };
  // in the capture phase: windows stop mouse events on their way up (see shield), and the drop is
  // usually over a window, so a listener waiting for the event to bubble up would never hear it
  window.addEventListener('pointermove', mv, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
}

/**
 * A finger or pen on an item: a tap picks it up (or, when it is already carried,
 * opens its actions), a press of half a second opens its actions, and sliding
 * sideways drags it just as a mouse would. Sliding up or down is left to the
 * window, which scrolls (the items allow vertical panning).
 */
function touchPress(it: Item, src: Source, ev: PointerEvent, el: HTMLElement, mayTake: () => boolean) {
  const x0 = ev.clientX, y0 = ev.clientY, t0 = ev.timeStamp;
  let done = false, pressed = false;
  const off = () => {
    clearTimeout(timer);
    window.removeEventListener('pointermove', mv, true);
    window.removeEventListener('pointerup', up, true);
    window.removeEventListener('pointercancel', cancel, true);
  };
  // the sheet opens while the finger is still down; the listeners stay, since a hitch can hold back
  // moves that show (by their own clocks) the finger had set off before the press was a press
  const timer = window.setTimeout(() => { pressed = true; openItemSheet(it, src, x0, y0); }, PRESS_MS);
  const mv = (e: PointerEvent) => {
    if (e.pointerId !== ev.pointerId) return;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (Math.hypot(dx, dy) < 10) return;
    if (pressed) {
      if (e.timeStamp - t0 >= PRESS_MS) return; // it really did rest first: the sheet stays
      closeSheet();
      pressed = false;
    }
    done = true; off();
    if (Math.abs(dx) <= Math.abs(dy)) return;
    if (!mayTake()) return;
    if (held) clearHeld();
    startDrag(it, src, e, el);
  };
  const up = (e: PointerEvent) => {
    if (e.pointerId !== ev.pointerId) return;
    e.stopPropagation();
    off();
    if (done) return;
    // the events' own clocks say how long the press was: a busy main thread can run the timer late (a press
    // read as a tap) or run it before a quick release is seen (a tap read as a press)
    const long = e.timeStamp - t0 >= PRESS_MS;
    if (pressed) {
      if (long) return; // the sheet is open, as it should be
      closeSheet();
      pressed = false;
    } else if (long) { openItemSheet(it, src, e.clientX, e.clientY); return; }
    if (held?.item === it) { openItemSheet(it, src, e.clientX, e.clientY); return; }
    if (held) { placeHeld(e.clientX, e.clientY); return; }
    if (mayTake()) pickUp(it, src);
  };
  const cancel = (e: PointerEvent) => { if (e.pointerId === ev.pointerId) off(); };
  window.addEventListener('pointermove', mv, true);
  window.addEventListener('pointerup', up, true);
  window.addEventListener('pointercancel', cancel, true);
}

function pickUp(it: Item, src: Source) {
  hideTip();
  held = { item: it, src };
  for (const e of document.querySelectorAll('.held')) e.classList.remove('held');
  src.view.render();
  showHoldBar(it, () => { const hd = resolveHeld(); if (hd) openItemSheet(hd.item, hd.src); }, clearHeld);
}

export function clearHeld() {
  if (!held) return;
  held = null;
  hideHoldBar();
  for (const e of document.querySelectorAll('.held')) e.classList.remove('held');
}
export const heldItem = () => held?.item ?? null;

/** The carried item's view may have been rebuilt since the tap: find it again, or let go of an item that is gone. */
function resolveHeld(): Drag | null {
  if (!held) return null;
  if (dropTargets.has(held.src.view)) return held;
  for (const t of dropTargets) {
    if (t instanceof GridView && t.grid.items.includes(held.item)) { held.src = { kind: 'grid', grid: t.grid, view: t }; return held; }
    if (t instanceof SlotView && t.hooks.get() === held.item) { held.src = { kind: 'slot', slot: t.slot, view: t }; return held; }
  }
  clearHeld();
  return null;
}

function placeHeld(x: number, y: number) {
  const hd = resolveHeld();
  if (!hd) return;
  // the tapped cell becomes the item's top-left corner
  if (finishDrop(hd, x, y, x, y)) clearHeld();
}

/** The action sheet for an item: its card, then what can be done with it here. */
function openItemSheet(it: Item, src: Source, x?: number, y?: number) {
  hideTip();
  const view = src.view;
  const acts: ItemAction[] = [];
  const carried = held?.item === it;
  if (carried) acts.push({ label: 'Put it back', run: clearHeld });
  // canTake is the take itself (looting while stealing rolls for it), so it runs when the item is picked up, never to decide what to list
  else acts.push({ label: 'Pick up', hint: 'then tap where it should go', run: () => { if (src.kind === 'grid' && src.view.hooks.canTake && !src.view.hooks.canTake(it)) return; pickUp(it, src); } });
  // whatever is done with it, it is no longer being carried
  const own = (a: ItemAction): ItemAction => ({ ...a, run: () => { clearHeld(); a.run(); } });
  let price: number | undefined;
  if (src.kind === 'grid') {
    const hk = src.view.hooks;
    price = hk.price?.(it);
    if (hk.actions) acts.push(...hk.actions(it).map(own));
    else if (hk.rclick) {
      const rc = hk.rclick;
      const label = hk.rclickLabel ? (price !== undefined ? `${hk.rclickLabel} for ${price}c` : hk.rclickLabel) : tradeLabel(src.grid, price);
      acts.push(own({ label, run: () => rc(it, { clientX: x ?? 0, clientY: y ?? 0 } as MouseEvent) }));
    }
  } else if (src.view.hooks.actions) acts.push(...src.view.hooks.actions(it).map(own));
  // the card carries the tooltip's rows, notes included: a finger has no hover
  const note = src.kind === 'grid' ? src.view.hooks.note?.(it) ?? '' : '';
  openSheet({ title: gradeName(ITEM[it.id], it.q), html: itemTip(it, price) + note, actions: acts, x, y, after: () => view.render() });
}

// let go of a carried item with Escape (before the windows close); headless tests import this module without a window
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && held) { e.stopPropagation(); clearHeld(); } }, true);

function removeFromSource(src: Source, it: Item) {
  if (src.kind === 'grid') src.grid.remove(it);
  else src.view.hooks.set(null);
}

/** Drops the item at a screen point; true if it moved (or merged) somewhere. */
function finishDrop(dg: Drag, gx: number, gy: number, mx: number, my: number): boolean {
  const it = dg.item;
  for (const t of dropTargets) {
    if (t instanceof SlotView) {
      const r = t.el.getBoundingClientRect();
      if (mx < r.left || mx > r.right || my < r.top || my > r.bottom) continue;
      if (dg.src.kind === 'slot' && dg.src.view === t) return false;
      if (!t.hooks.accept(it)) return false;
      const prev = t.hooks.get();
      removeFromSource(dg.src, it);
      if (!t.hooks.set(it)) { restore(dg); return false; }
      // swap the previous item back into the source if possible
      if (prev) {
        const back = dg.src.kind === 'grid'
          ? dg.src.grid.put(prev, it.x, it.y) || dg.src.grid.put(prev)
          : dg.src.view.hooks.accept(prev) && dg.src.view.hooks.set(prev);
        // nowhere for what was there to go: undo the swap rather than lose either of them
        if (!back) { t.hooks.set(prev); restore(dg); return false; }
      }
      t.hooks.moved?.();
      dg.src.view.render();
      t.render();
      if (dg.src.kind === 'grid') dg.src.view.hooks.moved?.(it, dg.src, { kind: 'slot', slot: t.slot, view: t });
      return true;
    }
    const cell = t.cellAt(gx, gy) ?? t.cellAt(mx, my);
    if (!cell) continue;
    if (t.hooks.accept && !t.hooks.accept(it, dg.src)) return false;
    const [x, y] = cell;
    if (dg.src.kind === 'grid' && dg.src.grid === t.grid) {
      const ok = t.grid.put(it, x, y);
      if (ok) { if (it.n <= 0) t.grid.remove(it); t.render(); }
      return ok;
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
    return ok || it.n < n0;
  }
  return false;
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
