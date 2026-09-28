// Skill training: effort times a difficulty factor, slowed at high levels.
import { Char } from './char';
import { SK, Skill, rateAt, SKILL_INFO } from './skills';
import { RACE } from '../content/races';
import { S } from './ctx';

export function train(c: Char, s: Skill, effort: number, difficulty = 1) {
  if (c.animal) return;
  const i = SK[s];
  const lvl = c.sk[i];
  if (lvl >= 100) return;
  const race = RACE[c.look.race]?.xp[s] ?? 1;
  const diff = Math.max(0.2, Math.min(3, difficulty));
  const before = Math.floor(lvl);
  c.sk[i] = Math.min(100, lvl + effort * rateAt(lvl) * race * diff);
  const after = Math.floor(c.sk[i]);
  if (after > before && c.faction === 'player' && (after % 5 === 0 || after <= 10)) {
    S.fx.notice(`${c.name}'s ${SKILL_INFO[s].name} rose to ${after}.`, 'good');
  }
  if (s === 'toughness' && after > before) c.body.rescale(c.look.race, c.sk[i]);
}

/** Difficulty of an opposed action: how much stronger the other side is. */
export function versus(mine: number, theirs: number) {
  return Math.max(0.2, Math.min(3, (theirs + 5) / (mine + 5)));
}
