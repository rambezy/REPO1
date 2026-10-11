// Screen-space layout of the overlay's labels: name tags, damage floaters
// and speech bubbles are placed in order of priority, and anything that
// would land on top of something more important is left out. Pure functions
// over plain records, so the rules can be tested without a browser.

export type LabelKind = 'tag' | 'floater' | 'bubble';

export interface LabelItem {
  /** stable id, so a label shown last frame can be favoured this frame */
  id: number;
  /** the character the label belongs to: a person's own name, bubble and numbers are stacked by the caller and never collide (their numbers can, and are nudged apart) */
  owner: number;
  kind: LabelKind;
  /** anchor: the box's bottom centre on screen */
  x: number;
  y: number;
  w: number;
  h: number;
  /** higher goes first (see `labelPriority`) */
  priority: number;
  /** how many box heights the label may be nudged up to find room (0: shown in place or not at all) */
  slots: number;
}

export interface LabelOut {
  shown: boolean;
  /** vertical nudge applied (negative is up) */
  dy: number;
}

export interface LayoutOpts {
  /** gap kept between boxes, in pixels */
  pad: number;
  /** only one bubble within this distance of another's anchor */
  bubbleR: number;
}

export const LAYOUT: LayoutOpts = { pad: 2, bubbleR: 110 };

/** Who the label is about. */
export type Importance = 'selected' | 'mine' | 'foe' | 'other';
const IMPORTANCE: Record<Importance, number> = { selected: 30, mine: 20, foe: 10, other: 0 };
const KIND_RANK: Record<LabelKind, number> = { floater: 3, bubble: 2, tag: 1 };

/**
 * A label's priority: who it is about first (your selected people and their
 * targets, then the rest of yours, then hostiles in the fight), then what it
 * is (damage numbers over speech over names), with a little weight given to
 * a label that was already showing so it does not flicker in and out.
 */
export function labelPriority(who: Importance, kind: LabelKind, shownBefore: boolean): number {
  return IMPORTANCE[who] + KIND_RANK[kind] + (shownBefore ? 0.5 : 0);
}

/** How much of a name shows at a camera distance: full up close, gone past about a hundred metres (sooner on a phone-sized view). */
export function nameAlpha(dist: number, important: boolean, viewH = 760): number {
  const far = important ? 170 : 100 * Math.min(1, Math.max(0.7, viewH / 760));
  const near = important ? 60 : 35;
  if (dist <= near) return 1;
  if (dist >= far) return 0;
  const k = 1 - (dist - near) / (far - near);
  return k * k * (3 - 2 * k);
}

const overlaps = (ax0: number, ay0: number, ax1: number, ay1: number, bx0: number, by0: number, bx1: number, by1: number, pad: number) =>
  ax0 < bx1 + pad && ax1 > bx0 - pad && ay0 < by1 + pad && ay1 > by0 - pad;

/**
 * Places the first `n` items. Writes `out[i]` for each (the caller keeps the
 * array between frames) and returns how many are shown. `order` is scratch
 * space for the sort, reused across calls so nothing is allocated per frame.
 */
export function layoutLabels(items: LabelItem[], n: number, out: LabelOut[], opts: LayoutOpts = LAYOUT, order: number[] = []): number {
  order.length = n;
  for (let i = 0; i < n; i++) { order[i] = i; const o = out[i]; if (o) { o.shown = false; o.dy = 0; } else out[i] = { shown: false, dy: 0 }; }
  order.sort((a, b) => items[b].priority - items[a].priority || a - b);
  let shown = 0;
  for (let k = 0; k < n; k++) {
    const i = order[k];
    const it = items[i];
    const hw = it.w / 2;
    let placed = false;
    for (let s = 0; s <= it.slots && !placed; s++) {
      const dy = -s * (it.h + opts.pad);
      const x0 = it.x - hw, x1 = it.x + hw, y1 = it.y + dy, y0 = y1 - it.h;
      let free = true;
      for (let m = 0; m < k && free; m++) {
        const j = order[m];
        const o = out[j];
        if (!o.shown) continue;
        const jt = items[j];
        // a person's own name, bubble and numbers are stacked by the caller; only their numbers can land on each other
        if (jt.owner === it.owner && (jt.kind !== 'floater' || it.kind !== 'floater')) continue;
        if (it.kind === 'bubble' && jt.kind === 'bubble' && Math.hypot(jt.x - it.x, jt.y - it.y) < opts.bubbleR) { free = false; break; }
        const jhw = jt.w / 2;
        if (overlaps(x0, y0, x1, y1, jt.x - jhw, jt.y + o.dy - jt.h, jt.x + jhw, jt.y + o.dy, opts.pad)) free = false;
      }
      if (free) { out[i].shown = true; out[i].dy = dy; placed = true; shown++; }
    }
  }
  return shown;
}
