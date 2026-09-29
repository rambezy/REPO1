// Skill selector for active skills (like the classic skill book).

import { G, player } from '../game/G';
import { el } from '../core/util';
import { button, closeModal, openModal } from './common';
import { SKILL_INFO, type SkillKey } from '../data/stats';
import { skill } from '../game/character';
import { useSkill } from '../game/interact';
import { setPendingSkill } from './input';

const ACTIVE: SkillKey[] = ['sneak', 'lockpick', 'steal', 'traps', 'firstAid', 'doctor', 'science', 'repair'];

export function openSkilldex() {
  if (G.modal) return;
  const w = el('div', 'panel win skilldex');
  w.appendChild(el('h2', '', 'Skills'));
  const p = player();
  for (const k of ACTIVE) {
    const b = button('', () => {
      closeModal('skilldex');
      if (k === 'sneak') useSkill('sneak', null);
      else setPendingSkill(k);
    });
    b.innerHTML = `<span>${SKILL_INFO[k].name}${k === 'sneak' && G.state.flags._sneak ? ' (on)' : ''}</span><span>${skill(p, k)}%</span>`;
    w.appendChild(b);
  }
  w.appendChild(button('Cancel', () => closeModal('skilldex'), 'small'));
  openModal('skilldex', w);
}
