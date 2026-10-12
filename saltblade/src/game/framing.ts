// Bringing what just happened into view: an auto-pause, one of yours going
// down, a conversation (a toll demand among them) starting. The camera eases
// there (cuts, with reduced motion), unless it is already in the middle of
// the picture or the player is busy with the view: a mouse button or a finger
// down on the world, an item in hand, a building being placed. Notices that
// name one of your people can be clicked to look at them.
import { G } from '../state';
import { S } from '../sim/ctx';
import { on } from '../core/events';
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
