// Combat AI for NPCs and companions, plus idle wandering outside combat.

import { G, player } from './G';
import type { Actor } from './types';
import { attack, attackModes, hostileTo, inRange, needsReload, reload, reloadAp, onPlayerSide, nameOf, giveNaturalAmmo } from './combat';
import { hexDist, neighbors, type Hex } from '../core/hex';
import { maxHp, isPlayer } from './character';
import { pathTo, walk } from './movement';
import { PROTOS } from '../data/protos';
import { ITEMS } from '../data/items';
import { wait } from '../core/util';
import { msg } from './log';
import { rand, chance } from '../core/rng';
import { useItemFromInventory } from './effects';
import { fx } from '../render/fx';

function pickTarget(a: Actor): Actor | null {
  const m = G.map!;
  let best: Actor | null = null;
  let bs = Infinity;
  for (const o of m.livingActors()) {
    if (!hostileTo(a, o)) continue;
    if (G.combat && !G.combat.order.includes(o) && !onPlayerSide(o)) continue;
    let s = hexDist(a, o);
    if (!m.los(a, o)) s += 8;
    if (isPlayer(o)) s -= 1;
    if (s < bs) {
      bs = s;
      best = o;
    }
  }
  return best;
}

function bestMode(a: Actor, t: Actor) {
  const modes = attackModes(a).filter((m) => m.kind !== 'aimed' || chance(15));
  // Prefer burst when available and enough AP, else primary.
  const burst = modes.find((m) => m.kind === 'burst');
  if (burst && (a._ap ?? 0) >= burst.ap && hexDist(a, t) > 1) return burst;
  return modes.find((m) => m.kind !== 'aimed') ?? modes[0];
}

export async function aiTurn(a: Actor) {
  const speed = G.settings.combatSpeed;
  const m = G.map!;
  fx.focus(a, true);
  giveNaturalAmmo(a);
  // Companions and NPCs heal themselves when badly hurt.
  if (a.hp < maxHp(a) * 0.35 && a.inv.some((s) => s.id === 'hypo') && (a._ap ?? 0) >= 2) {
    useItemFromInventory(a, 'hypo');
    a._ap! -= 2;
    msg(`${nameOf(a, true)} uses a mend-hypo.`);
    await wait(300 / speed);
  }
  const proto = PROTOS[a.proto];
  const flee = proto?.fleeAt ?? 0;
  let guard = 0;
  while ((a._ap ?? 0) > 0 && !a.dead && G.combat && guard++ < 20) {
    const t = pickTarget(a);
    if (!t) break;
    if (!onPlayerSide(a) && a.hp < maxHp(a) * flee) {
      // Run away from the target.
      const away = fleeHex(a, t);
      if (!away) break;
      const path = pathTo(a, away);
      if (!path?.length) break;
      if (!(a as any)._fledMsg) {
        (a as any)._fledMsg = true;
        msg(`${nameOf(a, true)} tries to flee.`);
      }
      await walk(a, path, a._ap);
      break;
    }
    let mode = bestMode(a, t);
    if (needsReload(a, mode)) {
      if ((a._ap ?? 0) >= reloadAp(a) && reload(a)) {
        a._ap! -= reloadAp(a);
        await wait(250 / speed);
        continue;
      }
      // Switch to the other hand or bare fists.
      a.active = a.active === 1 ? 0 : 1;
      mode = bestMode(a, t);
      if (needsReload(a, mode)) break;
    }
    if (inRange(a, t, mode.weapon) && (mode.weapon.melee || m.los(a, t))) {
      if ((a._ap ?? 0) < mode.ap) break;
      await attack(a, t, mode);
      await wait(150 / speed);
      continue;
    }
    // Approach
    const path = pathTo(a, t, true);
    if (!path || !path.length) {
      // Try to get closer anyway.
      break;
    }
    // Ranged units stop once in range with LOS.
    let steps = path.length;
    if (!mode.weapon.melee) {
      for (let i = 0; i < path.length; i++) {
        if (hexDist(path[i], t) <= mode.weapon.range && m.los(path[i], t)) {
          steps = i + 1;
          break;
        }
      }
    }
    const before = { q: a.q, r: a.r };
    await walk(a, path, Math.min(steps, a._ap ?? 0));
    if (a.q === before.q && a.r === before.r) break;
  }
  await wait(120 / speed);
}

function fleeHex(a: Actor, t: Actor): Hex | null {
  const m = G.map!;
  let best: Hex | null = null;
  let bd = hexDist(a, t);
  for (let i = 0; i < 20; i++) {
    const h = { q: a.q + rand(-8, 8), r: a.r + rand(-8, 8) };
    if (!m.passable(h.q, h.r)) continue;
    const d = hexDist(h, t);
    if (d > bd) {
      bd = d;
      best = h;
    }
  }
  return best;
}

/** Idle behaviour outside combat: wander around home. */
export function updateIdle(now: number) {
  const m = G.map;
  if (!m || G.combat || G.modal) return;
  for (const a of m.actors) {
    if (a.dead || a.companion || isPlayer(a) || a._path || a._move) continue;
    if (!a.wander) continue;
    if ((a._next ?? 0) > now) continue;
    a._next = now + 3000 + Math.random() * 7000;
    const home = a.home ?? { q: a.q, r: a.r };
    const cand = { q: home.q + rand(-a.wander, a.wander), r: home.r + rand(-a.wander, a.wander) };
    if (!m.passable(cand.q, cand.r) || hexDist(cand, home) > a.wander) continue;
    if (m.exitAt.has(m.idx(cand.q, cand.r))) continue;
    // Don't wander through closed doors.
    const path = pathTo(a, cand);
    if (path && path.length < a.wander * 2 && !path.some((h) => m.objects.some((o) => o.q === h.q && o.r === h.r && o.kind === 'door'))) {
      walk(a, path);
    }
  }
}

/** Detect the player: hostile actors with line of sight start combat. */
export function checkAwareness(): Actor | null {
  const m = G.map;
  if (!m || G.combat) return null;
  const p = player();
  if (p.dead) return null;
  const sneaking = !!G.state.flags._sneak;
  for (const a of m.livingActors()) {
    if (onPlayerSide(a)) continue;
    const wantsFight = a.hostile || m.livingActors().some((b) => onPlayerSide(b) && hostileTo(a, b));
    if (!wantsFight) continue;
    const per = PROTOS[a.proto]?.stats.PER ?? 5;
    let range = 6 + per;
    if (sneaking) range = Math.max(2, range - Math.floor(skillSneak() / 12));
    if (G.map?.def.outdoor) {
      const { nightness } = timeMod;
      range -= Math.round(nightness() * 4);
    }
    const d = hexDist(a, p);
    if (d <= range && m.los(a, p)) return a;
    // Companions spotted also trigger it.
    for (const c of m.actors) {
      if (c.companion && !c.dead && hexDist(a, c) <= range - 2 && m.los(a, c)) return a;
    }
  }
  return null;
}

import * as timeMod from './time';
import { skill } from './character';
function skillSneak() {
  return skill(player(), 'sneak');
}

export function neighborsFree(h: Hex): Hex[] {
  return neighbors(h).filter((n) => G.map!.passable(n.q, n.r));
}

export { ITEMS };
