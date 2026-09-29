// Companions.

import { G } from './G';
import type { Actor } from './types';
import { msg } from './log';
import { bark } from './script';

export function recruit(a: Actor) {
  if (a.companion) return;
  a.companion = true;
  a.hostile = false;
  a.team = 'player';
  a.wander = 0;
  msg(`${a.name} joins you.`);
  if (a.npc) G.state.flags['party:' + a.npc] = true;
}

export function dismiss(a: Actor) {
  if (!a.companion) return;
  a.companion = false;
  a.team = 'neutral';
  a.home = { q: a.q, r: a.r };
  a.wander = 3;
  msg(`${a.name} leaves the party.`);
  if (a.npc) G.state.flags['party:' + a.npc] = false;
  bark(a, 'I\'ll wait here, then.');
}

export function partyMembers(): Actor[] {
  if (G.map) return G.map.actors.filter((a) => a.companion && !a.dead);
  return G.state.party;
}
