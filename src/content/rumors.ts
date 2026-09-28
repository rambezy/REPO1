// Rumours townsfolk share. They shift with the story and hint at side quests.

import { Actor } from '../world/actor';
import { S, flag } from '../state';
import { hashStr } from '../engine/util';
import { qActive, qDone } from '../systems/quests';

export function rumorFor(a: Actor, settlement: string): string {
  const pool: string[] = [];
  const act = flag('act') || 0;
  if (act === 0) {
    pool.push('It\'s St. John\'s Eve! Tonight the girls float their wreaths on the brook, and the boys jump the fire like fools.',
      'Riders were seen up on the pass road last week. Strangers, with black cloaks. Probably nothing.',
      'Your father\'s been working late in the forge. My Honza says he\'s making something special.',
      'Vojta owes everyone money. Everyone. The priest. The geese, probably.',
      'Widow Bára\'s geese got loose again. God help whoever meets them.');
  } else {
    pool.push('They say the Company that burned Hollowbrook answers to a captain called Harrow. Swabian. Very polite, they say, while he hangs you.',
      'Sir Bertram hasn\'t slept since the news came. Walks the walls all night, the guards say.',
      'The refugees are camped down at the crossroads. God knows how they\'ll eat come winter.',
      'The apothecary pays good coin for herbs. My cousin picks chamomile by the river and buys beer with it.',
      'Sergeant Ondřej will train anyone who can stand up. Most of them can\'t, after.');
    if (!qDone('side_wolves')) pool.push('Wolves have been taking sheep near the hunter\'s lodge. There\'s a bounty posted on the board by the church.');
    if (!qDone('side_miko')) pool.push('Old Greta\'s bread keeps vanishing off her counter. She says it\'s a ghost. I say it\'s that Miko boy.');
    if (!qDone('side_dice')) pool.push('Lucky Venca\'s been cleaning out everyone at dice in the Crooked Linden. Nobody can beat him. Nobody.');
    if (!qDone('side_bees')) pool.push('Brother Tobiah lost his best swarm. You\'ve never seen a friar so sad. He said a Mass for them.');
    if (!qDone('side_charcoal')) pool.push('The charcoal burners in the south woods are looking for a lost boy. Poor little mite.');
    if (!qDone('side_letter')) pool.push('There\'s a wounded soldier at the refugee camp who keeps asking for someone to carry a letter to Silverdale.');
    if (!qDone('side_miners')) pool.push('The miners at Silverdale haven\'t been paid in weeks. There\'ll be blood if this goes on.');
    if (!qDone('side_havel')) pool.push('Old Havel of Hollowbrook used to brag he\'d buried his old sword under his hearth. For "the next war," he said. Well. It came.');
    if (act >= 2) pool.push('They say Sir Lothar of Ravenstone has shut his gates and won\'t answer Bertram\'s letters.', 'Black riders on the Ravenstone road at night. Carts, too, heavy ones.');
    if (qActive('main_lida') || act >= 2) pool.push('A girl with red braids? No... wait. There was a cart of children on the Ravenstone road. God forgive me, I looked away.');
  }
  if (settlement === 'silverdale') pool.push('The foreman Vilém has a new cloak and a new horse. Funny, on what he pays us.', 'The deep shaft floods every spring. This year it "flooded" in summer too, if you take my meaning.');
  if (settlement === 'priory') pool.push('Brother Anselm keeps the library. He hasn\'t spoken a full sentence since Lent.', 'The abbot says the bell rings true only when the brothers are at peace. It hasn\'t rung since the clapper was stolen.');
  const i = hashStr(a.id + Math.floor(S.minutes / 720)) % pool.length;
  return pool[i];
}
