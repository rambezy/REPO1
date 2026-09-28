// Encounters on the road: bandits who demand a toll, starving raiders who
// beg for food, zealots who order non-humans away, slavers sizing up the
// weak. Their leader walks up and talks before anyone draws steel.
import { S } from './ctx';
import { Char } from './char';
import { FACTION } from '../content/factions';
import { RACE } from '../content/races';
import { canSee } from './ai';
import { goTo, stop } from './move';
import { emit } from '../core/events';
import { strengthOf } from './combat';

let t = 0;

/** Would this NPC's squad rather talk than fight the player right now? */
export function wantsToTalk(c: Char): boolean {
  const sq = S.W.squadOf(c);
  if (!sq || sq.spoke || sq.faction === 'player') return false;
  if (sq.flags.settled && S.clock.t - sq.flags.settled < 86400) return false;
  const f = FACTION[c.faction];
  if (!f) return false;
  if (sq.flags.demand === 'tax') return true;
  if (c.faction === 'reavers' || c.faction === 'starvelings') return sq.kind !== 'town' || c.faction === 'reavers';
  if (c.faction === 'ember' && (c.role === 'patrol' || c.role === 'guard') && playerHasNonHumans()) return true;
  if (c.faction === 'chainhouse' && sq.kind !== 'town' && playerLooksWeak()) return true;
  return false;
}

function playerHasNonHumans() {
  return S.W.playerChars().some((p) => p.alive && RACE[p.look.race]?.race !== 'human');
}
function playerLooksWeak() {
  const pcs = S.W.playerChars().filter((p) => p.up);
  return pcs.length <= 2 && strengthOf(pcs) < 60;
}

export function tickEncounters(dt: number) {
  t -= dt;
  if (t > 0) return;
  t = 0.5;
  for (const sq of S.W.squads.values()) {
    if (sq.faction === 'player' || sq.spoke) continue;
    const L = S.W.char(sq.leader);
    if (!L || !L.active || !L.up || L.brain.enemy) continue;
    if (!wantsToTalk(L)) continue;
    // nearest visible player character
    let best: Char | null = null, bd = 34;
    for (const p of S.W.playerChars()) {
      if (!p.up) continue;
      const d = Math.hypot(p.x - L.x, p.z - L.z);
      if (d < bd && canSee(L, p)) { bd = d; best = p; }
    }
    if (!best) continue;
    L.brain.talkTo = best.id;
    if (bd > 3) { goTo(L, best.x, best.z); L.move = 'run'; continue; }
    stop(L);
    sq.spoke = true;
    emit('ui:talk', best.id, L.id);
  }
}
