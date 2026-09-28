// Notice boards: bounties and requests that start side quests.

import { openScreen, el, button } from '../ui/ui';
import { skill } from '../systems/stats';
import { renderText } from '../ui/reader';
import { startQuest, qActive, qDone, QUESTS } from '../systems/quests';
import { flag } from '../state';
import { esc } from '../ui/notify';

interface Notice { id: string; title: string; text: string; quest?: string; if?: () => boolean }

const BOARDS: Record<string, Notice[]> = {
  linden: [
    { id: 'wolves', title: 'BOUNTY: WOLVES', quest: 'side_wolves', text: 'Wolves have killed nine sheep near the Hunter\'s Lodge in the south woods. Sir Bertram offers 60 groschen for the pack. Speak to Hunter Matěj at the lodge.', if: () => (flag('act') || 0) >= 1 },
    { id: 'bath', title: 'The Bathhouse', text: 'Hot water, clean linen, and wounds dressed by a proper barber. Two groschen. Your mother would want you clean.' },
    { id: 'venca', title: 'A CHALLENGE', quest: 'side_dice', text: 'Any man who beats Lucky Venca at dice in the Crooked Linden wins his lucky die. Bring your own coin. Bring a lot of it.', if: () => (flag('act') || 0) >= 1 },
    { id: 'recruits', title: 'SIR BERTRAM SEEKS MEN', text: 'Able-bodied men who can hold a spear are wanted for the garrison of Linden Hill. Food, a bed, and a groschen a day. Speak to Sergeant Ondřej in the training yard.', if: () => (flag('act') || 0) >= 1 },
    { id: 'lost', title: 'LOST', text: 'A brown and white dog answering to CRUMB. Chewed ear. Very good boy. If found, please tell the smith\'s son from Hollowbrook, who is lodging at the castle.', if: () => (flag('act') || 0) >= 1 && !flag('crumb_found') },
  ],
  silverdale: [
    { id: 'wages', title: 'NOTICE TO MINERS', text: 'Wages are delayed on account of flooding in the deep shaft. Any man who stops work will be dismissed. By order of the foreman, Vilém.', quest: 'side_miners' },
    { id: 'widow', title: 'Seeking news', text: 'Anna, wife of Tomasz the soldier, asks any traveller for news of her husband, who went with Sir Bertram\'s men in the spring.', if: () => true },
  ],
  camp: [
    { id: 'names', title: 'THE LIVING', text: 'Scratched onto a plank by many hands: names of the living, so that families might find each other. Jiří the reeve. Little Marek. Bára. Tonda the cooper. Marta the baker (sick, in the far tent). Some names have a cross beside them. Many do.' },
  ],
};

export function openNotice(board: string) {
  const list = (BOARDS[board] || []).filter((n) => !n.if || n.if());
  const lvl = skill('reading');
  openScreen('notice', (close) => {
    const m = el('div', { cls: 'vellum modal' });
    m.append(el('h2', { html: 'Notice Board' }));
    if (lvl <= 0) m.append(el('p', { cls: 'meta', html: 'You cannot read. The notices are just marks on paper. Perhaps someone could read them to you, or teach you.' }));
    for (const n of list) {
      const d = el('div', { cls: 'perk' });
      d.append(el('b', { html: renderText(n.title, lvl, 1) }), el('p', { html: renderText(n.text, lvl, 1) }));
      if (n.quest && lvl > 0 && !qActive(n.quest) && !qDone(n.quest) && QUESTS[n.quest]) {
        d.append(button('Take this on', () => { startQuest(n.quest!); close(); }));
      }
      m.append(d);
    }
    if (!list.length) m.append(el('p', { html: '<i>Nothing posted.</i>' }));
    const row = el('div', { cls: 'row' });
    row.append(button('Close', close));
    m.append(row);
    return m;
  });
}

export { esc };
