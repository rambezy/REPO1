// Called-shot window: pick a body part, showing the chance to hit each.

import { player } from '../game/G';
import { el, esc } from '../core/util';
import { button, closeModal, openModal } from './common';
import type { Actor, Limb } from '../game/types';
import { hitChance, LIMB_INFO, type AttackMode } from '../game/combat';
import { drawActor } from '../render/sprites';
import { lookOf } from '../game/actors';

export function chooseAim(target: Actor, mode: AttackMode): Promise<Limb | null> {
  return new Promise((res) => {
    const w = el('div', 'panel win aim');
    w.appendChild(el('h2', '', 'Aim: ' + esc(target.name)));
    const fig = el('div', 'fig');
    const left = el('div', 'parts');
    const right = el('div', 'parts');
    const cv = el('canvas') as HTMLCanvasElement;
    cv.width = 160;
    cv.height = 220;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#0b140b';
    c.fillRect(0, 0, 160, 220);
    c.save();
    c.scale(4, 4);
    drawActor(c, 20, 52, lookOf(target), { facing: 2, walk: -1, attack: -1, hit: -1, dead: -1, t: 0 });
    c.restore();
    const p = player();
    const part = (l: Limb, side: HTMLElement) => {
      const pct = hitChance(p, target, mode, l);
      const b = el('div', 'part', `<span>${LIMB_INFO[l].name}</span><b>${pct}%</b>`);
      b.onclick = () => {
        closeModal('aim');
        res(l);
      };
      side.appendChild(b);
    };
    (['head', 'larm', 'torso', 'lleg'] as Limb[]).forEach((l) => part(l, left));
    (['eyes', 'rarm', 'groin', 'rleg'] as Limb[]).forEach((l) => part(l, right));
    const scr = el('div', 'screen');
    scr.appendChild(cv);
    fig.append(left, scr, right);
    w.appendChild(fig);
    w.appendChild(button('Cancel', () => {
      closeModal('aim');
      res(null);
    }));
    openModal('aim', w, { onClose: () => res(null) });
  });
}
