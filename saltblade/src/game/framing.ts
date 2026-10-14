// Bringing what just happened into view: an auto-pause, one of yours going
// down, a conversation (a toll demand among them) starting. The camera eases
// there (cuts, with reduced motion), unless it is already in the middle of
// the picture or the player is busy with the view: a mouse button or a finger
// down on the world, an item in hand, a building being placed. Notices that
// name one of your people can be clicked to look at them.
import { G } from '../state';
import { S } from '../sim/ctx';
import { on, emit } from '../core/events';
import { input } from '../core/input';
import { reducedMotion } from '../render/impact';
import type { Char } from '../sim/char';

/** What else has the player busy with the view (a building being placed, an item in hand): the modules that know say so. */
const holds: (() => boolean)[] = [];
export function holdViewWhile(f: () => boolean) { holds.push(f); }

/** The player has the view in hand: nothing takes it from them. */
const busy = () => input.buttons.some(Boolean) || input.fingers > 0 || holds.some((f) => f());

/** Eases the view to a point that matters (or someone: `who`), if it is not in the middle of the picture already. */
export function frame(x: number, z: number, force = false, who?: Char) {
  const cam = G.cam;
  if (!cam || G.mode !== 'play' || (!force && busy())) return;
  if (!force && Math.hypot(cam.target.x - x, cam.target.z - z) < Math.max(6, cam.dist * 0.3)) return;
  // following someone: the follow keeps it in view when it is about them; otherwise this comes first
  const f = cam.follow?.();
  if (f && Math.hypot(f.x - x, f.z - z) < 8 && !force) return;
  if (f) cam.follow = null;
  cam.glideTo(x, z, reducedMotion(), who && (() => (who.alive ? who : null)));
}

export const frameChar = (c: Char | null | undefined, force = false) => { if (c) frame(c.x, c.z, force, c); };

/** How close the view comes to a fight: about four times its spread, and never nearer or further than this. */
const FIGHT_NEAR = 25, FIGHT_FAR = 40;
/** The fighters of the fight `who` is in (or the one nearest the view): everyone of yours fighting there, whoever they are on and whoever is on them. */
function fighters(who?: Char): Char[] {
  const W = S.W;
  const cam = G.cam;
  const mine = W.playerChars().filter((c) => c.alive && c.up && (c.drawn || c.atk || c === who));
  if (!mine.length) return [];
  // the one fight: the cluster round `who`, or round whoever of yours fighting is nearest the view
  const anchor = who ?? mine.reduce((a, c) => (Math.hypot(c.x - cam.target.x, c.z - cam.target.z) < Math.hypot(a.x - cam.target.x, a.z - cam.target.z) ? c : a));
  const near = (c: Char) => Math.hypot(c.x - anchor.x, c.z - anchor.z) < 40;
  const out = new Set<Char>();
  for (const c of mine) if (near(c)) out.add(c);
  for (const c of W.active) {
    if (c.faction === 'player' || !c.alive || !c.up || !(c.drawn || c.atk) || !c.target || !near(c)) continue;
    const t = W.char(c.target);
    if (t && t.faction === 'player') out.add(c);
  }
  for (const c of [...out]) if (c.target) { const t = W.char(c.target); if (t && t.alive && near(t)) out.add(t); }
  return [...out];
}

/**
 * Brings the fight into view: the view glides to the fighters' middle and keeps with it, and comes in to
 * about four times their spread. The player's hand on the view (a pan, a drag) takes it back, as with any
 * glide. False, with a word, when nobody of yours is fighting.
 */
export function frameFight(who?: Char): boolean {
  const cam = G.cam;
  if (!cam || G.mode !== 'play') return false;
  const fs = fighters(who);
  if (!fs.length) { emit('notice', 'Nobody of yours is in a fight.', 'info'); return false; }
  const ids = fs.map((c) => c.id);
  const middle = () => {
    let x = 0, z = 0, n = 0;
    for (const id of ids) { const c = S.W.char(id); if (c && c.alive) { x += c.x; z += c.z; n++; } }
    return n ? { x: x / n, z: z / n } : null;
  };
  const m = middle()!;
  let r = 3;
  for (const c of fs) r = Math.max(r, Math.hypot(c.x - m.x, c.z - m.z));
  cam.follow = null;
  cam.glideTo(m.x, m.z, reducedMotion(), middle);
  cam.wantDist = Math.min(FIGHT_FAR, Math.max(FIGHT_NEAR, r * 4));
  return true;
}

/** The one of your people a notice is about, by name (the longest name that appears in it). */
export function aboutWhom(text: string): Char | null {
  let best: Char | null = null;
  for (const c of S.W?.playerChars() ?? []) {
    if (!c.name || (best && best.name.length >= c.name.length)) continue;
    const i = text.indexOf(c.name);
    if (i < 0) continue;
    const before = text[i - 1], after = text[i + c.name.length];
    if ((before && /\w/.test(before)) || (after && /\w/.test(after) && after !== 's')) continue;
    best = c;
  }
  return best;
}

export function setupFraming() {
  on('autopause', (_why: string, c?: Char) => frameChar(c));
  on('fx:ko', (c: Char) => { if (c.faction === 'player') frameChar(c); });
  on('ui:talk', (pid: number, nid: number) => {
    const p = S.W.char(pid), n = S.W.char(nid);
    if (p && n) frame((p.x + n.x) / 2, (p.z + n.z) / 2);
  });
}
