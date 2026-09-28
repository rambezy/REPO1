// What to do with an enemy who yields. Mercy is remembered.

import { Actor } from '../world/actor';
import { say, choose, narrate } from './script';
import { S, addStat } from '../state';
import { rand } from '../engine/util';
import { addItem, addMoney } from './inventory';
import { kill } from './combat';
import { flee } from './ai';
import { G } from '../G';
import { emit } from '../engine/events';
import { addXp } from './stats';

export async function spareDialogue(a: Actor) {
  await say(a, 'pain', rand.pick([
    'Please... I only took the Company\'s coin because my children were hungry.',
    'I yield! I yield. God\'s wounds, don\'t kill me.',
    'Mercy, friend. I\'ve no quarrel with you. Not anymore.',
  ]));
  const c = await choose([
    { id: 'spare', text: 'Go. And don\'t let me see you again.' },
    { id: 'rob', text: 'Your purse. Then go.' },
    { id: 'ask', text: 'Tell me what you know first.', if: () => !!a.mem.knows },
    { id: 'kill', text: '[Kill them]' },
  ]);
  if (c === 'ask') {
    await say(a, 'worried', a.mem.knows as string);
    emit('interrogate', a);
    const c2 = await choose([{ id: 'spare', text: 'Go.' }, { id: 'kill', text: '[Kill them]' }]);
    if (c2 === 'kill') { await doKill(a); return; }
    return doSpare(a, false);
  }
  if (c === 'kill') { await doKill(a); return; }
  doSpare(a, c === 'rob');
}

function doSpare(a: Actor, rob: boolean) {
  a.surrendered = false;
  a.hostile = false;
  a.mem.spared = true;
  a.mem.noRetaliate = true;
  if (rob) {
    const coins = rand.int(3, 25);
    addMoney(coins);
  } else {
    addStat('mercy');
    S.stats.mercy_points = (S.stats.mercy_points || 0) + 1;
  }
  addXp('speech', 2);
  a.say(rob ? 'Take it. Take it all.' : 'God bless you. God bless you.', 3);
  flee(a, G.player, 14);
  a.mem.despawnOnFlee = true;
  emit('spared', a);
  emit('spared:' + (a.charId || a.id), a);
}

async function doKill(a: Actor) {
  a.surrendered = false;
  addStat('executions');
  kill(a, G.player);
  await narrate('It is quick. It does not feel like justice.');
}

export { addItem };
