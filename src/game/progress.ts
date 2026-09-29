// Experience, levels, karma, reputation and quests.

import { G, player } from './G';
import { msg, emit } from './log';
import { xpForLevel } from '../data/stats';
import { maxHp, skillPointsPerLevel, hasTrait } from './character';
import { QUESTS } from '../content/registry';
import { sfx } from '../audio/sfx';

export function giveXp(n: number, silent = false) {
  const p = player();
  n = Math.round(n);
  if (n <= 0) return;
  p.xp += n;
  if (!silent) msg(`You gain ${n} experience points.`);
  while (p.xp >= xpForLevel(p.level + 1)) {
    const before = maxHp(p);
    p.level += 1;
    const gained = maxHp(p) - before;
    p.hp += gained;
    G.state.flags._skillPts = (G.state.flags._skillPts ?? 0) + skillPointsPerLevel(p);
    if (p.level % 3 === 0) G.state.flags._perks = (G.state.flags._perks ?? 0) + 1;
    msg(`You have reached level ${p.level}! (+${gained} hit points)`);
    sfx('levelup');
    emit('levelup');
  }
  emit('hud');
}

export function addKarma(n: number) {
  const p = player();
  if (n > 0 && hasTrait(p, 'kindly')) n = Math.round(n * 1.5);
  G.state.karma += n;
  if (n !== 0) msg(n > 0 ? 'You feel a little better about yourself.' : 'Your conscience twinges.');
}

export function addRep(area: string, n: number) {
  G.state.rep[area] = (G.state.rep[area] ?? 0) + n;
}

export function questState(id: string): 'none' | 'active' | 'done' | 'failed' {
  return G.state.quests[id]?.state ?? 'none';
}

export function questNote(id: string, note?: string) {
  let q = G.state.quests[id];
  const def = QUESTS[id];
  if (!q) {
    q = G.state.quests[id] = { state: 'active', notes: [], t: G.state.time };
    msg(`New task: ${def?.title ?? id}.`);
    sfx('quest');
  }
  if (note && !q.notes.includes(note)) q.notes.push(note);
  emit('quests');
}

export function questDone(id: string, note?: string) {
  questNote(id, note);
  const q = G.state.quests[id];
  if (q.state === 'done') return;
  q.state = 'done';
  const def = QUESTS[id];
  msg(`Task complete: ${def?.title ?? id}.`);
  sfx('quest');
  if (def?.xp) giveXp(def.xp);
  emit('quests');
}

export function questFail(id: string, note?: string) {
  questNote(id, note);
  const q = G.state.quests[id];
  if (q.state !== 'active') return;
  q.state = 'failed';
  msg(`Task failed: ${QUESTS[id]?.title ?? id}.`);
  emit('quests');
}
