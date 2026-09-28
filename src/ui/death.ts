// Death screen.

import { UI, el, button } from './ui';
import { latestSlot, readSave } from '../systems/save';
import { GameState } from '../state';
import { rand } from '../engine/util';

const EPITAPHS = [
  'The crows will have their supper, and your sister will wait for a brother who does not come.',
  'Mother always said you rushed at things. She was right.',
  'Somewhere, Crumb whines at an empty road.',
  'Father\'s blade lies unfinished, and now it always will.',
];

export function showDeath(onLoad: (st: GameState) => void, onTitle: () => void) {
  const d = el('div', { id: 'death' });
  d.append(el('h1', { html: 'You Have Fallen' }), el('p', { html: rand.pick(EPITAPHS) }));
  const slot = latestSlot();
  if (slot) d.append(button('Rise again (load last save)', () => { const st = readSave(slot); d.remove(); if (st) onLoad(st); }, 'btn primary'));
  d.append(button('Return to title', () => { d.remove(); onTitle(); }));
  UI.root.appendChild(d);
}
