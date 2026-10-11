// Presentation hooks for the sim: speech, floating text, notices, sounds, the
// particle effects that sell a hit (sparks off steel, blood off flesh, the
// streak of a bolt and the beam of a laser), the body's reaction to the blow,
// the jolt of a big one, and the auto-pause rules.
import { S, ShotKind } from '../sim/ctx';
import { G } from '../state';
import { emit, on } from '../core/events';
import { Char } from '../sim/char';
import { leaderFell, creditDefence } from '../sim/worldevents';
import { ANIMAL } from '../content/animals';
import { ITEM } from '../content/items';
import { impact } from '../render/impact';
import { hitRule, koRule, limbRule, resetAutopause } from './autopause';

/** Height of someone's middle, for effects. */
function midY(c: Char) { return c.y + (c.animal ? ANIMAL[c.animal].size * 0.55 : c.status === 'up' ? (c.look?.height ?? 1.8) * 0.62 : 0.3); }
const metal = (c: Char) => c.robot || c.body.robotic;
/** Laser colours: the Makers' red, a salvaged rifle's blue. */
export const LASER_RGB: Record<string, [number, number, number]> = { red: [9, 0.9, 0.5], blue: [0.8, 3.5, 9], green: [1.2, 9, 1.5] };
/** Is this one of the player's fights, close enough to the camera to be felt? */
function felt(c: Char, by: Char) {
  if (c.faction !== 'player' && by.faction !== 'player') return false;
  const t = G.cam?.target;
  return !t || Math.hypot(c.x - t.x, c.z - t.z) < 70;
}
/** The blow that just landed on `c`, as the view saw it, if it was this moment's (a bleed-out has none). */
function freshBlow(c: Char): Char | null {
  const v = c.view;
  if (!v || S.time - (v.hitAt ?? -1e9) > 0.5) return null;
  return S.W.char(v.hitBy) ?? null;
}

export function setupFx() {
  on('game:start', resetAutopause);
  on('world:reset', resetAutopause);
  S.fx = {
    hit(c: Char, by: Char, dmg: number, blocked: boolean, limb?: number) {
      if (!c.view) return;
      // a blow on a prosthetic strikes metal, low on a leg
      const prost = limb !== undefined && c.body.isProst(limb);
      const y = prost && limb! >= 5 && c.status === 'up' ? c.y + 0.5 : midY(c), L = Math.hypot(c.x - by.x, c.z - by.z) || 1, dir: [number, number] = [(c.x - by.x) / L, (c.z - by.z) / L];
      if (blocked) G.particles?.burst('sparks', (c.x + by.x) / 2, y, (c.z + by.z) / 2, 7, dir); // steel on steel
      else if ((metal(c) || prost) && dmg > 1) {
        G.particles?.burst('sparks', c.x, y, c.z, 8 + Math.min(16, dmg / 3), dir);
        G.particles?.burst('oil', c.x, y, c.z, 3, dir);
        emit('sound', 'robothit', c.x, c.z, Math.min(1, 0.4 + dmg / 40));
      } else if (dmg > 3) G.particles?.burst('blood', c.x, y, c.z, 3 + Math.min(10, dmg / 6), dir);
      if (!blocked && dmg > 3 && !c.robot && !c.body.robotic && !prost) G.decals?.splat(c.x + (Math.random() - 0.5) * 0.8, c.y, c.z + (Math.random() - 0.5) * 0.8, 0.22 + Math.min(0.45, dmg / 50), S.clock.t);
      if (blocked) G.overlay.floater(c, 'blocked', '#c8c0a8');
      else if (dmg > 0.5 && (c.faction === 'player' || by.faction === 'player')) G.overlay.floater(c, String(Math.round(dmg)), c.faction === 'player' ? '#f08868' : '#f8e0a0');
      if (!blocked && by !== c) {
        c.view.hit?.(limb ?? -1, by);
        // a heavy blow is felt: the world holds a beat and the camera is nudged
        if (dmg >= 16 && felt(c, by)) impact(Math.min(1, (dmg - 16) / 30));
        hitRule(c, by);
      }
      emit('fx:hit', c, by, dmg, blocked);
    },
    say(c: Char, text: string) {
      c.bark = text;
      c.barkT = 3 + text.length * 0.05;
    },
    sound(name: string, x: number, z: number, vol = 1) { emit('sound', name, x, z, vol); },
    shot(from: Char, x: number, z: number, hit: boolean, kind?: ShotKind) {
      emit('fx:shot', from, x, z, hit);
      const P = G.particles;
      if (!P) return;
      const k: ShotKind = kind ?? (from.eq.ranged && ITEM[from.eq.ranged.id].ranged?.energy ? 'laser' : 'bolt');
      // from the muzzle, a little ahead of the shooter, to the target's middle (or past it, on a miss)
      const an = from.animal ? ANIMAL[from.animal] : undefined;
      const sy = from.y + (an ? (an.laser?.muzzle ?? 0.75) * an.size : 1.35);
      const sx = from.x + Math.sin(from.dir) * 0.45, sz = from.z + Math.cos(from.dir) * 0.45;
      let tx = x, tz = z, ty = S.T.heightAt(x, z) + 1.05;
      if (!hit) {
        const d = Math.hypot(x - sx, z - sz) || 1;
        tx = x + ((x - sx) / d) * 6 + (Math.random() - 0.5) * 2.5; tz = z + ((z - sz) / d) * 6 + (Math.random() - 0.5) * 2.5;
        ty = S.T.heightAt(tx, tz) + 0.05;
      }
      if (k === 'laser' || k === 'heavy') {
        const col = LASER_RGB[from.mem?.laserColor ?? (from.faction === 'player' ? 'blue' : 'red')] ?? LASER_RGB.red;
        P.beam(sx, sy, sz, tx, ty, tz, col, k === 'heavy' ? 0.13 : 0.07, k === 'heavy' ? 0.28 : 0.18);
        if (!hit) P.burst('dust', tx, ty, tz, 5);
        else emit('sound', 'sizzle', tx, tz, 0.8);
      } else {
        // a bolt or harpoon is a quick dark streak, with a puff of dust where a miss lands
        P.beam(sx, sy, sz, tx, ty, tz, k === 'harpoon' ? [1.6, 1.4, 1.1] : [1.1, 1, 0.85], k === 'harpoon' ? 0.05 : 0.025, 0.09);
        if (!hit) P.burst('dust', tx, ty, tz, 4);
      }
    },
    burst(kind, x, y, z, n) { G.particles?.burst(kind, x, y, z, n); },
    notice(text: string, kind = 'info') { emit('notice', text, kind); },
    died(c: Char) {
      if (c.view) {
        G.overlay.floater(c, 'dead', '#d05040');
        c.view.fall?.();
        const by = freshBlow(c);
        if (by && felt(c, by)) impact(1);
      }
      if (c.view && metal(c)) { const y = midY(c); G.particles?.burst('sparks', c.x, y, c.z, 24); G.particles?.burst('smoke', c.x, y, c.z, 10); emit('sound', 'powerdown', c.x, c.z, 1); }
      emit('fx:died', c);
      if (c.mem.leaderOf) leaderFell(c);
      creditDefence(c);
    },
    ko(c: Char) {
      if (c.view) {
        G.overlay.floater(c, 'down', '#e0a050');
        c.view.fall?.();
        const by = freshBlow(c);
        if (by && felt(c, by)) impact(0.7);
      }
      if (c.view && metal(c)) { const y = midY(c); G.particles?.burst('sparks', c.x, y, c.z, 14); G.particles?.burst('smoke', c.x, y, c.z, 6); emit('sound', 'powerdown', c.x, c.z, 0.7); }
      emit('fx:ko', c);
      creditDefence(c);
      // one notice: the pause says why, or the plain word if there is no pause
      if (c.faction === 'player' && G.mode === 'play' && !koRule(c)) emit('notice', `${c.name} is down!`, 'bad');
    },
    limbLost(c: Char, limb: number, by?: Char | null) {
      emit('fx:limb', c, limb);
      if (!by) return; // not a blow (a limb taken off at a bench): nothing to feel, nothing to stop for
      if (c.view && felt(c, by)) impact(1);
      if (G.mode === 'play') limbRule(c);
    },
  };
}
