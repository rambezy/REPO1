// Side stories and the small scripted corners of the world: lessons, lost
// boys, bees, bells, letters, dice, wolves, and the graves we visit.

import { G } from '../../G';
import { S, flag, setFlag, hourF, isNight, dayIndex } from '../../state';
import { Actor } from '../../world/actor';
import { findActor, here } from '../../world/world';
import { defineQuest, startQuest, setStage, completeQuest, qAt, qActive, qDone, qVar } from '../../systems/quests';
import { say, talk, narrate, choose, cutscene, conversation, wait, lastCheck } from '../../systems/script';
import { addItem, removeItem, has, count, addMoney, equip } from '../../systems/inventory';
import { addXp, addBuff, skill, level, xpToNext, hasPerk } from '../../systems/stats';
import { notify } from '../../ui/notify';
import { sfx, sting } from '../../audio/sfx';
import { on } from '../../engine/events';
import { waitHours } from '../../systems/survival';
import { playDice } from '../../ui/minigames/dice';
import { commitCrime } from '../../systems/crime';
import { fadeTo } from '../../systems/transition';
import { TILE, rand } from '../../engine/util';
import { registerLoot } from '../loot';
import { trigger, topic, greet, waitUntil, put, nearTile, onMap, regionIs, protectPlayer, addRel, rel, remember, chose, tip, P, canRunScene, decor, markerObj, propObj, groundItem, hostiles, refreshDecor } from './lib';
import { castHooks, npc, fighter, animal, OW, always, ACT } from './cast';
import { fatherLetterRead } from './act1';

/** Raises a skill to at least `to`, through the normal level-up path. */
export function raiseSkill(key: string, to: number) {
  let guard = 0;
  while (level(key) < to && guard++ < 20) addXp(key, xpToNext(level(key)) - (S.xp[key] || 0) + 0.01);
}

export function registerSides() {
  defineQuests();
  registerReading();
  registerTraining();
  registerMiko();
  registerDice();
  registerWolves();
  registerBees();
  registerBell();
  registerCharcoal();
  registerLetter();
  registerHavel();
  registerHanka();
  registerFamily();
  registerWorldScripts();
  registerCrime();
  registerAmbush();
}

function defineQuests() {
  defineQuest({ id: 'side_reading', title: 'Letters', kind: 'side', summary: 'Brother Tobiah will teach you to read.', stages: {
    start: { obj: 'Take your first reading lesson from Brother Tobiah.', marker: { actor: 'tobiah' }, entry: 'Brother Tobiah says letters are not so hard: "Children do it. Even Pavel could, if he sat still." I have a letter from Father I cannot read. I will learn.' },
    lesson2: { obj: 'Bring Brother Tobiah a beer for your second lesson. ("The price of wisdom," he says.)', marker: { actor: 'tobiah' } },
    lesson3: { obj: 'Brother Tobiah will give you your last lesson tomorrow.', marker: { actor: 'tobiah' } },
    done: { entry: 'I can read. Slowly, with my finger under the words, but I can read. Tobiah says I read like a man walking on ice. At least I am walking.' },
  } });
  defineQuest({ id: 'side_training', title: "Ondřej's School", kind: 'side', summary: 'Sergeant Ondřej will teach anyone who can stand up.', stages: {
    lesson2: { obj: 'Lesson two: land five blows on Ondřej before he lands five on you.', marker: { actor: 'ondrej' } },
    lesson3: { obj: 'Lesson three: a real bout with Ondřej. Beat him.', marker: { actor: 'ondrej' } },
    done: { entry: 'I beat Ondřej. Once. He says it was luck. Then he taught me the riposte, which he says is for people who have stopped relying on luck.' },
  } });
  defineQuest({ id: 'side_miko', title: 'The Bread Thief', kind: 'side', summary: 'Someone is stealing bread from Old Greta\'s bakery.', stages: {
    start: { obj: 'Find out who has been stealing Greta\'s bread. The urchins by the market might know.', marker: { actor: 'miko' }, entry: 'Old Greta says a ghost has been stealing her loaves, a ghost with bare feet and very fast hands. I think I know who she means.' },
    choice: { obj: 'Decide what to do about Miko.', marker: { actor: 'miko' } },
    greta: { obj: 'Settle things with Greta.', marker: { actor: 'greta' } },
    done: { entry: 'Miko won\'t steal bread any more. He won\'t need to.' },
  } });
  defineQuest({ id: 'side_dice', title: 'Lucky Venca', kind: 'side', summary: 'Nobody beats Lucky Venca at dice. Nobody.', stages: {
    start: { obj: 'Beat Lucky Venca at dice in the Crooked Linden.', marker: { actor: 'wenceslas' } },
    done: { entry: 'Lucky Venca\'s luck came in a little bone box, and now it\'s mine.' },
  } });
  defineQuest({ id: 'side_wolves', title: 'The Wolves of the Wolfwood', kind: 'side', summary: 'A pack of wolves is killing sheep near the Hunter\'s Lodge.', stages: {
    start: { obj: 'Talk to Matěj the hunter at his lodge in the south woods.', marker: { actor: 'matej' } },
    hunt: { obj: 'Kill the wolves at Wolf Rocks.', get optional() { return [`Wolves left: ${here().filter((a) => a.tags.has('denwolf') && !a.dead).length || '?'}`]; }, marker: { map: 'overworld', x: 150, y: 167 } },
    back: { obj: 'Tell Matěj the pack is dead.', marker: { actor: 'matej' } },
    done: { entry: 'The wolves of Wolf Rocks are dead. Matěj says the sheep will write songs about me.' },
  } });
  defineQuest({ id: 'side_bees', title: 'The Runaway Swarm', kind: 'side', summary: 'Brother Tobiah\'s best bees have swarmed.', stages: {
    start: { obj: 'Find Tobiah\'s swarm in the priory orchard. Smoke calms bees: carry a lit torch.', marker: { map: 'overworld', x: 213, y: 104 } },
    back: { obj: 'Bring the swarm back to Brother Tobiah.', marker: { actor: 'tobiah' } },
    done: { entry: 'The queen is home. Tobiah wept, gave me honey, and blessed me twice, once for the bees and once, he said, for himself.' },
  } });
  defineQuest({ id: 'side_bell', title: 'The Silent Bell', kind: 'side', summary: 'St. Aldhelm\'s bell has been silent since its clapper was stolen.', stages: {
    start: { obj: 'Find the stolen clapper of St. Aldhelm\'s bell. Robbers took it, the abbot says, "to sell the iron".', marker: () => (has('bell_clapper') ? { actor: 'gregor' } : { map: 'overworld', x: 29, y: 161 }) },
    done: { entry: 'The bell of St. Aldhelm\'s rings again. You can hear it from Linden Hill on a still day.' },
  } });
  defineQuest({ id: 'side_charcoal', title: "The Burner's Boy", kind: 'side', summary: 'Black Tomáš\'s son is lost in the woods.', stages: {
    start: { obj: 'Search the woods north of the burners\' camp for little Vít.', marker: { map: 'overworld', x: 90, y: 150 }, entry: 'Black Tomáš\'s boy, Vít, went out for kindling two days ago and never came back. There are wolves in these woods.' },
    found: { obj: 'Bring Vít home to his father.', marker: { actor: 'tomas_burner' } },
    done: { entry: 'Vít is home. Tomáš didn\'t say anything. He just held the boy, and looked at me over his head, and nodded. It was enough.' },
  } });
  defineQuest({ id: 'side_letter', title: 'A Letter for Anna', kind: 'side', summary: 'A dying soldier\'s last letter.', stages: {
    start: { obj: 'Take Tomasz\'s letter to his wife, Anna, in Silverdale.', marker: { actor: 'anna' } },
    done: { entry: 'I gave Anna her husband\'s letter. I will not forget her face.' },
  } });
  defineQuest({ id: 'side_miners', title: 'Unpaid Wages', kind: 'side', summary: 'The miners of Silverdale have not been paid in weeks.', stages: {
    start: { obj: 'Find out why the Silverdale miners are unpaid. (See: The Silver Road.)', marker: { actor: 'kuba' } },
    done: { entry: 'The miners of Silverdale have been paid, every penny, with a barrel of beer on top.' },
  } });
  defineQuest({ id: 'side_havel', title: 'The Next War', kind: 'side', summary: 'Old Havel buried his sword under his hearth, "for the next war".', stages: {
    start: { obj: 'Dig under Old Havel\'s hearth in the ruins of Hollowbrook. You will need a shovel.', marker: { map: 'overworld', x: 18, y: 92 } },
    kovar: { obj: 'Ask Master Kovář whether Havel\'s sword can be restored.', marker: { actor: 'kovar' } },
    done: { entry: 'Havel\'s sword is whole again. For the next war. God willing, it will be the last.' },
  } });
}

// ---------------------------------------------------------------- Letters

function registerReading() {
  const lesson = async (n: 1 | 2 | 3) => {
    await talk(`
      tobiah happy: Sit, sit. Here, on the bench. Here is a wax tablet, and here is a stylus, which is a stick with ambitions.
    `);
    await waitHours(2);
    const quiz: [string, [string, boolean][]][] = n === 1
      ? [['Tobiah draws a letter: a straight line with two round bellies. "This one begins BREAD. What is it?"', [['B', true], ['D', false], ['P', false]]],
        ['"And this one, like two hills side by side: it begins the word MOTHER. What letter?"', [['M', true], ['W', false], ['N', false]]]]
      : n === 2
        ? [['Tobiah writes a word: M · A · R · T · A. "Read it. Slowly."', [['Marta', true], ['Martin', false], ['Mother', false]]],
          ['"Now this: B · R · E · A · D."', [['Beard', false], ['Bread', true], ['Board', false]]],
          ['"And this one, I think you know it. I think you know it better than anyone: S · M · I · T · H."', [['Smith', true], ['Snitch', false], ['Sith', false]]]]
        : [['Tobiah shows you a page of the Psalter. "The first word, there. It\'s Latin, but the letters are the same."', [['Beatus', true], ['Bestus', false], ['Beaten', false]]],
          ['"Last one. The word over the church door. Every church has it."', [['PAX: Peace', true], ['PAN: Bread', false], ['PAR: Equal', false]]]];
    let right = 0;
    for (const [q, opts] of quiz) {
      const c = await choose(opts.map(([t], i) => ({ id: String(i), text: t })), undefined, q);
      if (opts[+c][1]) { right++; await say('tobiah', 'happy', rand.pick(['Yes! Yes, exactly.', 'Good! Very good.', 'You see? Ants that sit still, and you have tamed them.'])); }
      else await say('tobiah', 'smirk', rand.pick(['No, no. Look again. The bellies face the other way.', 'Close. Close is how everyone begins.', 'Hm. Pavel said that too. Look again.']));
    }
    raiseSkill('reading', n);
    addXp('reading', 6 + right * 3);
    return right;
  };
  topic('tobiah', {
    id: 'rd_offer', text: 'Will you teach me to read, Brother?', if: () => ACT() >= 1 && !qActive('side_reading') && !qDone('side_reading') && skill('reading') < 1,
    run: async () => {
      await talk(`
        tobiah happy: Will I! Nothing would please me more. Well, beer. But nothing else.
        tobiah: Three lessons, if you work. The first today, if you like. Two hours of your time, and I promise you will leave knowing more than you came in with.
      `);
      startQuest('side_reading', 'start');
    },
  });
  topic('tobiah', {
    id: 'rd_1', text: '[First lesson] I\'m ready. (2 hours)', if: () => qAt('side_reading', 'start'),
    run: async () => {
      await lesson(1);
      await talk(`
        tobiah: There. Your first letters. Tomorrow, or whenever you like, your second lesson. Bring me a beer. The price of wisdom is one beer. It always has been; Aristotle just didn't write it down.
      `);
      setStage('side_reading', 'lesson2');
    },
  });
  topic('tobiah', {
    id: 'rd_2', text: '[Second lesson] Here\'s your beer, Brother. (2 hours)', if: () => qAt('side_reading', 'lesson2') && has('beer'),
    run: async () => {
      removeItem('beer');
      await say('tobiah', 'happy', 'Ahh. Bless you. Now. Words. Whole words, today.');
      await lesson(2);
      qVar('side_reading', 'l2day', dayIndex());
      await talk(`
        tobiah: You can read now, {name}. Not well. Not fast. But you can read.
      `);
      if (has('fathers_letter') && !flag('letter_read')) await talk(`
        tobiah tender: I think there is a letter in your coat that has been waiting for you. It is very patient, but I think it has waited long enough.
      `);
      setStage('side_reading', 'lesson3');
    },
  });
  topic('tobiah', {
    id: 'rd_3', text: '[Last lesson] Teach me the rest. (2 hours)', if: () => qAt('side_reading', 'lesson3') && dayIndex() > (qVar('side_reading', 'l2day') ?? 99),
    run: async () => {
      await lesson(3);
      await talk(`
        tobiah: Latin! You're reading Latin, God help us. Your mother will be insufferable. More insufferable.
        tobiah tender: Here. The primer I learned from, fifty years ago. It's yours. Teach someone else, one day. That is the only fee.
      `);
      addItem('primer', 1);
      completeQuest('side_reading');
    },
  });
  topic('tobiah', {
    id: 'rd_3wait', text: 'Can we do the last lesson now?', if: () => qAt('side_reading', 'lesson3') && dayIndex() <= (qVar('side_reading', 'l2day') ?? 99),
    run: async () => { await say('tobiah', 'neutral', 'Tomorrow. Sleep on it. Letters settle in the night, like bread rising.'); },
  });
  // reading Father's letter yourself
  on('read:fathers_letter', (leg: number) => {
    if (leg < 1 || flag('letter_read_scene')) return;
    setFlag('letter_read_scene');
    setTimeout(async () => {
      await waitUntil(() => canRunScene(), 120);
      await cutscene(async () => {
        await fatherLetterRead(false);
        await talk(`
          > You read it again. And again. You read "I am proud" eleven times, one for each fold of the steel.
          > You didn't know that you could cry this hard over three words. You didn't know that three words could hold a whole man.
        `);
        remember('letter_read_self');
        addBuff('warmth', 12 * 60);
      });
    }, 400);
  });
  greet('tobiah', async (a) => {
    await say(a, 'happy', ACT() >= 1 ? rand.pick(['Ah, {name}. Come in, come in. The Lord and I were just discussing you.', 'My son! Sit with an old friar a moment.']) : 'Bless you, my son.');
  });
  topic('tobiah', {
    id: 'rd_grief', text: 'Brother... how do you bear it? All of it?', once: true, if: () => ACT() >= 1,
    run: async () => {
      await talk(`
        tobiah: Bear it? I don't. I carry it, which is different. You don't bear a sack of flour. You carry it, and you put it down sometimes, and then you pick it up again.
        tobiah sad: When I was your age there was plague in Brno. I buried my whole family in a week. I thought God had died too.
        tobiah: He hadn't. He was in the old woman who fed me, and in the monk who taught me to read, and in the bees. Mostly the bees. Look for Him in small things, {name}. He's not in the big ones any more; I think He got tired of shouting.
      `);
      addBuff('hope', 1440);
    },
  });
}

// ---------------------------------------------------------------- Ondřej's school

const lessonState = { on: false, hits: 0, taken: 0 };

export function offerTraining() {
  if (!qActive('side_training') && !qDone('side_training')) startQuest('side_training', 'lesson2', true);
}

function registerTraining() {
  on('hit', (o: Actor, a: Actor | null) => {
    if (!lessonState.on) return;
    if (o.charId === 'ondrej' && a === G.player) lessonState.hits++;
    if (o === G.player && a?.charId === 'ondrej') lessonState.taken++;
  });
  const bout = async (a: Actor, n: 2 | 3) => {
    const prev = S.equip.weapon;
    if (n === 2) { if (!has('stick')) addItem('stick', 1, { quiet: true }); equip('stick'); a.combat.weapon = { id: 'stick', kind: 'stick', slash: 0, stab: 0, blunt: 6, reach: 21, speed: 1.1, staminaCost: 8 }; }
    else a.combat.weapon = { id: 'arming_sword', kind: 'sword', slash: 26, stab: 21, blunt: 5, reach: 23, speed: 1.05, staminaCost: 13 };
    a.mem.nonlethal = true; a.mem.spar = true; a.mem.skill = n === 2 ? 5 : 7; a.mem.schedule = undefined;
    const hp0 = a.hp = a.maxHp = 180;
    lessonState.on = true; lessonState.hits = 0; lessonState.taken = 0;
    let down = false;
    const off = protectPlayer(() => { down = true; });
    a.hostile = true; a.mem.target = 'player'; a.mem.alerted = true;
    await waitUntil(() => canRunScene() || (G.mode === 'play' && !G.controlLocked), 5);
    const won = await new Promise<boolean>((resolve) => {
      waitUntil(() => down || (n === 2 ? lessonState.hits >= 5 || lessonState.taken >= 5 : a.hp < hp0 * 0.35), 240).then(() => {
        resolve(n === 2 ? lessonState.hits >= 5 && !down : a.hp < hp0 * 0.35 && !down);
      });
    });
    off();
    lessonState.on = false;
    a.hostile = false; a.mem.target = null; a.mem.alerted = false; a.mem.spar = false; a.mem.nonlethal = false; a.hp = a.maxHp; a.mem.skill = 8;
    G.player.combat.bleeding = 0;
    G.player.hp = Math.max(G.player.hp, G.player.maxHp * 0.5);
    if (prev) equip(prev);
    return won;
  };
  topic('ondrej', {
    id: 'tr_2', text: '[Lesson two] Teach me more, Sergeant.', if: () => qAt('side_training', 'lesson2'),
    run: async (a) => {
      await talk(`
        ondrej: More? Good. Today: attacking. Everyone thinks attacking is easy. Everyone is wrong.
        ondrej: Chain your blows. Hit, and hit again before I've got my feet back. Five good hits before I land five on you.
      `);
      tip('combo', 'Press attack again as a swing finishes to chain a combo. The third blow in a chain is a thrust.');
      setTimeout(async () => {
        const won = await bout(a, 2);
        await waitUntil(() => canRunScene(), 10);
        await conversation(async () => {
          if (won) { await say('ondrej', 'smirk', 'Hm. Better than the last one. The last one cried.'); addXp('sword', 20); addXp('blunt', 10); setStage('side_training', 'lesson3'); }
          else await say('ondrej', 'neutral', 'No. Again tomorrow. Your feet are asleep. Wake them up.');
        });
      }, 50);
      return 'end';
    },
  });
  topic('ondrej', {
    id: 'tr_3', text: '[Lesson three] A real bout. Steel.', if: () => qAt('side_training', 'lesson3'),
    run: async (a) => {
      await talk(`
        ondrej: Steel, is it? Blunted, mind. I'm not explaining a dead knight to Sir Bertram.
        ondrej: No more lessons after this. After this you're just a man with a sword, and God help us all.
      `);
      setTimeout(async () => {
        const won = await bout(a, 3);
        await waitUntil(() => canRunScene(), 10);
        await conversation(async () => {
          if (won) {
            await talk(`
              ondrej pain: ...Enough. Enough. God's teeth. Where did Radek's boy learn to move like that?
              ondrej: From me, I suppose. Hm. I'm a better teacher than I thought.
              ondrej: One more thing, then, since you've earned it. When you turn a blow perfectly, don't wait. Strike back in the same breath. The riposte. It's the only trick that matters.
            `);
            if (!hasPerk('riposte')) { S.perks.push('riposte'); notify('Perk learned: <b>Riposte</b>. A perfect block is followed by an automatic counter-strike.', 'skill', 7000); }
            addXp('sword', 30); addXp('defense', 20);
            completeQuest('side_training');
          } else await say('ondrej', 'smirk', 'Not yet. Come back when you\'ve stopped leading with your chin.');
        });
      }, 50);
      return 'end';
    },
  });
}

// ---------------------------------------------------------------- Miko

function registerMiko() {
  topic('greta', {
    id: 'mk_start', text: 'You look troubled, Greta.', if: () => ACT() >= 1 && !qActive('side_miko') && !qDone('side_miko'),
    run: async () => {
      await talk(`
        greta: Troubled! A ghost is eating my bread! Three loaves a day, gone off the counter, and nobody sees a thing. Father Florian says to pray. I say to set a trap.
        greta: A ghost with bare feet. I found the prints in the flour. Small ones. Very small ones.
      `);
      startQuest('side_miko');
    },
  });
  topic('miko', {
    id: 'mk_caught', auto: true, text: '', if: () => qAt('side_miko', 'start'),
    run: async () => {
      await talk(`
        miko: What? I didn't do nothing. I'm just standing here. Standing's free.
        player: You've flour on your feet, Miko.
        > He looks down at his feet. He looks at you. He considers running. You can see him consider it, and then see him decide you're faster.
        miko sad: ...There's three of us. Me and Běta and Little Tonda. Our mam died at Easter of the coughing. The landlord put us out.
        miko: Běta's six. Tonda's four. They can't steal. They're rubbish at it. So I do it.
      `);
      setStage('side_miko', 'choice');
      return 'end';
    },
  });
  topic('miko', {
    id: 'mk_choice', auto: true, text: '', if: () => qAt('side_miko', 'choice'),
    run: async () => {
      const c = await choose([
        { id: 'mother', text: 'My mother has a big heart and an empty house. Come and meet her.', if: () => !!flag('mother_cured') && !flag('mother_dead') },
        { id: 'dorota', text: 'Dorota at the inn needs someone to carry water. For bread and a bed by the fire.' },
        { id: 'pay', text: '[Pay Greta for the bread, 10 groschen] Just stop stealing, Miko.', if: () => S.money >= 10 },
        { id: 'guards', text: 'Thieves go to the guards, Miko.' },
      ]);
      if (c === 'guards') {
        await talk(`
          miko cry: Please! Please, sir, they'll put me in the pillory, and Běta and Tonda will—
          > The guard takes him by the ear. He doesn't fight. He just looks back at you all the way across the square.
        `);
        remember('miko_guards');
        S.flags.miko_home = false;
        completeQuest('side_miko');
        return 'end';
      }
      if (c === 'pay') { addMoney(-10); await say('miko', 'surprised', 'You\'d... pay? For us? Nobody pays for us.'); setFlag('miko_paid'); }
      if (c === 'dorota') {
        await talk(`
          dorota: Carry water? The three of them? God love you, I could use six hands, and I've a loft that's warmer than any barn. Send them to me.
        `);
        setFlag('miko_home');
      }
      if (c === 'mother') {
        await talk(`
          > You take Miko to the bakery. Mother looks at him for a long time: at his bare feet, his thin wrists, his flour-white toes.
          marta tender: Three of them, you say? Well. I've a big oven and an empty house, and I've lost one child already this summer. I'll not lose three more to the cold. Bring them.
          miko cry: ...
          > Miko doesn't say anything. He can't. Mother gives him a honey cake, and he eats it in two bites, and then he cries, and she holds him, and flour gets everywhere.
        `);
        setFlag('miko_adopted');
        setFlag('miko_home');
        remember('miko_adopted');
      }
      setStage('side_miko', 'greta');
      return 'end';
    },
  });
  topic('greta', {
    id: 'mk_done', text: 'About your bread ghost...', if: () => qAt('side_miko', 'greta'),
    run: async () => {
      await talk(`
        greta: The ghost? Oh, I know all about the ghost. The whole square knows. Three orphans, and me with more bread than I can sell.
        greta smirk: Tell that boy if he ever steals from me again I'll give him a loaf myself, and see how he likes that.
      `);
      addRel('greta', 4);
      completeQuest('side_miko');
    },
  });
  greet('miko', async (a) => { await say(a, 'smirk', qDone('side_miko') && flag('miko_home') ? 'Oi, it\'s you! I\'ve got a job now. I carry water. I\'m very good at it.' : 'What? I\'m not doing anything.'); });
}

// ---------------------------------------------------------------- dice

function registerDice() {
  topic('wenceslas', {
    id: 'dc_play', text: 'A game, Venca?', if: () => ACT() >= 1,
    run: async (a) => {
      if (!qActive('side_dice') && !qDone('side_dice')) startQuest('side_dice');
      await say(a, 'smirk', rand.pick(['Always! Sit, sit. My dice are hungry.', 'Back for more? I do love a regular.']));
      const c = await choose([
        { id: 'play', text: '[Play dice with Lucky Venca]' },
        { id: 'look', text: '[Watch his hands closely before you play]', check: { stat: 'agility', need: 5 }, if: () => !flag('venca_exposed') && !qDone('side_dice') },
        { id: 'no', text: 'Maybe later.' },
      ]);
      if (c === 'no') return;
      if (c === 'look') {
        if (lastCheck) {
          await talk(`
            > You watch his hands. There. When he picks up his dice he swaps one, quick as a sparrow, for a die from his sleeve: yellowed bone, worn smooth, that rolls a one more often than God intended.
            player smirk: That's a pretty die in your sleeve, Venca.
            wenceslas surprised: ...Keep your voice down! God's teeth. Nobody's ever... Here. Take it. Take it and say nothing, and I'll buy your beer till Michaelmas.
          `);
          addItem('lucky_die', 1);
          setFlag('venca_exposed');
          completeQuest('side_dice');
          return;
        }
        await narrate('You watch his hands. They are just hands. Very fast hands. You see nothing.');
      }
      const net = await playDice({ name: 'Lucky Venca', risk: 0.62, lucky: !flag('venca_exposed'), minBet: 10 });
      if (net > 0 && qActive('side_dice')) {
        await talk(`
          wenceslas surprised: You... you beat me? Nobody beats me. Nobody!
          wenceslas smirk: Well. A bet's a bet. The notice said my lucky die, and Venca pays his debts. Here. Maybe it'll like you better. It's gone off me, the faithless thing.
        `);
        addItem('lucky_die', 1);
        completeQuest('side_dice');
      }
    },
  });
  greet('wenceslas', async (a) => { await say(a, 'happy', 'Venca\'s the name, luck\'s the game!'); });
  // generic dice tables in taverns
  on('dice:table', async () => {
    const opp = here().find((a) => a.pose === 'sit' && !a.isAnimal && a !== G.player && Math.hypot(a.x - G.player.x, a.y - G.player.y) < 60);
    if (!opp) { notify('There is nobody at the table to play with.', 'info'); return; }
    if (opp.charId === 'wenceslas') return;
    await conversation(async () => { await say(opp, 'happy', rand.pick(['Dice? Go on, then. Small stakes.', 'I\'ve a few groschen that want to meet yours.'])); });
    await playDice({ name: opp.name, risk: 0.45 + Math.random() * 0.2, minBet: 3 });
  });
}

// ---------------------------------------------------------------- wolves

function registerWolves() {
  topic('matej', {
    id: 'wf_start', text: 'I hear you have a wolf problem.', if: () => ACT() >= 1 && !qDone('side_wolves') && !qAt('side_wolves', 'hunt', 'back'),
    run: async () => {
      await talk(`
        matej: Problem? I have a war. Four of them, a big grey dog-wolf and his wives. They've had nine of Sir Bertram's sheep and two of my hounds.
        matej: They den up at Wolf Rocks, south-east of here, where the big boulders are. Kill them and the lord pays sixty groschen, and I'll owe you a favour besides.
        matej: Take a spear if you have one. Wolves come at you low, and all together. Keep your back to a rock.
      `);
      if (qActive('side_wolves')) setStage('side_wolves', 'hunt'); else startQuest('side_wolves', 'hunt');
    },
  });
  on('kill:tag:denwolf', () => {
    if (qAt('side_wolves', 'hunt') && here().filter((a) => a.tags.has('denwolf') && !a.dead).length === 0) setStage('side_wolves', 'back');
  });
  topic('matej', {
    id: 'wf_done', auto: true, text: '', if: () => qAt('side_wolves', 'back'),
    run: async () => {
      await talk(`
        matej: The big grey too? You're sure? ...Then the sheep can sleep, and so can I. First time since Whitsun.
        matej: Here's the lord's sixty. And take this. It was my father's. It draws sweeter than mine.
      `);
      addMoney(60);
      addItem('hunting_bow', 1);
      addItem('arrow', 20);
      completeQuest('side_wolves');
    },
  });
  greet('matej', async (a) => { await say(a, 'neutral', 'Quiet. You\'ll scare the hares. ...Well? What?'); });
}

// ---------------------------------------------------------------- bees

function registerBees() {
  decor({ key: 'swarm', map: 'overworld', when: () => ACT() >= 2 && !qDone('side_bees') && !has('queen_skep'), make: () => ({ ...markerObj(213, 104, { type: 'script', script: 'swarm', label: 'A humming swarm of bees' }), data: { glint: true } }) });
  topic('tobiah', {
    id: 'bee_start', text: 'You look sad, Brother. Is it the bees?', if: () => ACT() >= 2 && !qActive('side_bees') && !qDone('side_bees'),
    run: async () => {
      await talk(`
        tobiah sad: It is. My best colony. Swarmed on Sunday. The queen took half the hive with her, off into the orchard, and I'm too old and too fat to climb apple trees.
        tobiah: If you could find them... they'll be hanging in a tree somewhere east of the wall, a great humming beard of them. Smoke calms them. Take a torch, lit, and a sack, and speak softly. Bees like soft voices. And psalms.
      `);
      startQuest('side_bees');
    },
  });
  on('script:swarm', async () => {
    await conversation(async () => {
      if (!qActive('side_bees')) { await narrate('A great humming beard of bees hangs from an apple bough. You leave them well alone.'); return; }
      if (!S.equip.torch && !G.player.mem.torchLit) {
        await narrate('A great humming beard of bees hangs from an apple bough. Without smoke to calm them, reaching in would be madness. You need a lit torch (F).');
        return;
      }
      await narrate('You wave the smoking torch under the bough, slow and gentle, and hum the only psalm you know. The humming changes. It grows drowsy. You shake the bough, once, over the open sack, and the whole swarm drops in with a sound like rain.');
      addItem('queen_skep', 1);
      G.player.hp = Math.max(1, G.player.hp - 3);
      await narrate('One bee stings you on the ear, on principle.');
      setStage('side_bees', 'back');
      refreshDecor('overworld');
    });
  });
  topic('tobiah', {
    id: 'bee_done', auto: true, text: '', if: () => qAt('side_bees', 'back') && has('queen_skep'),
    run: async () => {
      removeItem('queen_skep');
      await talk(`
        tobiah happy: My girls! My beautiful girls! And the queen? Yes, there she is, the old empress, look at her sulk.
        tobiah tender: God bless you, {name}. Twice. Once for the bees, and once for me. Here: honey, and mead from last year's summer. It was a good summer, last year. We didn't know how good.
      `);
      addItem('honey', 2);
      addItem('mead', 2);
      addItem('honey_cake', 3);
      completeQuest('side_bees');
    },
  });
}

// ---------------------------------------------------------------- the bell

function registerBell() {
  registerLoot('bandit_chest', [['bell_clapper', 1], ['coins', 35], ['wine', 2], ['lockpick', 3], ['bandage', 2]]);
  topic('gregor', {
    id: 'bell_start', text: 'Why doesn\'t your bell ring, Father Abbot?', if: () => ACT() >= 1 && !qActive('side_bell') && !qDone('side_bell'),
    run: async () => {
      await talk(`
        gregor: Because it has no tongue. Robbers took the clapper at Easter: cut it down in the night and carried it off to sell for the iron. Deserters, the woodcutters say, camped in the Wolfwood to the south-west.
        gregor sad: A bell without a clapper is a very sad thing, my son. It is a mouth that cannot speak. The brothers have not been at peace since.
      `);
      startQuest('side_bell');
    },
  });
  topic('jirka', {
    id: 'bell_jirka', text: 'The priory\'s bell clapper. Was that you?', if: () => qActive('side_bell') && !has('bell_clapper') && !!flag('jirka_done'),
    run: async () => {
      await talk(`
        jirka: The clapper? Aye, that was us. Iron's iron, and we were hungry. Nobody would buy it, it turns out. Nobody wants to be the man selling a stolen bell.
        jirka smirk: It's in the chest. Take it. Tell the monks we're sorry, and that we'll come and ring it ourselves when we're dead and they have to forgive us.
      `);
      addItem('bell_clapper', 1);
    },
  });
  topic('gregor', {
    id: 'bell_done', auto: true, text: '', if: () => qActive('side_bell') && has('bell_clapper'),
    run: async () => {
      removeItem('bell_clapper');
      await talk(`
        gregor surprised: The clapper! The clapper of St. Aldhelm! Brother Anselm, fetch the rope! Fetch everyone!
      `);
      sfx('bell');
      await narrate('That evening, the bell of St. Aldhelm\'s rings for the first time since Easter. The brothers stand in the cloister with their faces turned up, and not one of them is singing in tune, and it is beautiful.');
      addBuff('blessed', 24 * 60);
      addRel('gregor', 8);
      completeQuest('side_bell');
      S.rep.priory = (S.rep.priory ?? 30) + 25;
    },
  });
  greet('gregor', async (a) => { await say(a, 'neutral', 'Peace be with you, my son.'); });
  greet('anselm', async (a) => { await say(a, 'neutral', '...Shh. Books.'); });
}

// ---------------------------------------------------------------- the burner's boy

function registerCharcoal() {
  groundItem('vit_cap', 'overworld', 'lost_child_cap', 88, 148, { when: () => qActive('side_charcoal') });
  castHooks.push(() => {
    if (ACT() < 1 || !qAt('side_charcoal', 'start')) return;
    const v = npc('vit', OW(84, 152), always(OW(84, 152), 'sit', { dir: 0 }));
    if (v) { v.mem.hold = true; v.pose = 'sit'; v.tags.add('lostboy'); }
    for (let i = 0; i < 2; i++) {
      const w = animal('overworld', (86 + i * 3) * TILE, 155 * TILE, 'wolf', { id: 'vitwolf' + i, wander: 30 });
      w.tags.add('quest'); w.mem.aggroRange = 120;
    }
  });
  topic('tomas_burner', {
    id: 'ch_start', text: 'You look like a man with trouble.', if: () => ACT() >= 1 && !qActive('side_charcoal') && !qDone('side_charcoal'),
    run: async () => {
      await talk(`
        tomas_burner: My boy. Vít. Seven years old. Went for kindling two days ago, north, and didn't come back. We've called till our throats bled.
        tomas_burner: I can't leave the clamps. If the fire gets air, it's a year's work gone, and then we starve anyway. God forgive me, I can't leave the clamps.
        tomas_burner: He has a red cap. His mother sewed it. Please.
      `);
      startQuest('side_charcoal');
    },
  });
  on('item:lost_child_cap', () => { conversation(async () => { await narrate('A child\'s red felt cap, caught on a blackthorn. Beyond it, small footprints go on into the trees, south-west. And bigger prints, with claws, go after them.'); }); });
  topic('vit', {
    id: 'ch_found', auto: true, text: '', if: () => qAt('side_charcoal', 'start'),
    run: async (a) => {
      if (here().some((w) => w.id.startsWith('vitwolf') && !w.dead && Math.hypot(w.x - a.x, w.y - a.y) < 160)) {
        await say(a, 'cry', 'The wolves! The wolves are still there! I\'m not coming down! I\'m not!');
        return 'end';
      }
      await talk(`
        vit cry: Are they gone? Are the wolves gone?
        player: They're gone. Your father sent me. Come on, Vít. Let's go home.
        vit: I lost my cap. Mother made my cap. She'll be angry.
      `);
      if (has('lost_child_cap')) { removeItem('lost_child_cap'); await say(a, 'happy', 'My cap! You found my cap!'); }
      a.mem.hold = false;
      a.mem.follow = 'player';
      a.mem.schedule = undefined;
      setStage('side_charcoal', 'found');
      return 'end';
    },
  });
  topic('tomas_burner', {
    id: 'ch_done', auto: true, text: '', if: () => qAt('side_charcoal', 'found') && !!findActor('vit') && Math.hypot(findActor('vit')!.x - G.player.x, findActor('vit')!.y - G.player.y) < 80,
    run: async () => {
      const v = findActor('vit');
      if (v) v.mem.follow = null;
      await talk(`
        > Black Tomáš doesn't say anything. He gets down on his knees in the ash and holds his son, and looks at you over the boy's head, and nods.
        tomas_burner: ...Anything. Anything you ever need. The burners of the south woods will come. Take this. Show it to any of us.
      `);
      addItem('charcoal_token', 1);
      addItem('charcoal', 5);
      completeQuest('side_charcoal');
      return 'end';
    },
  });
  greet('tomas_burner', async (a) => { await say(a, 'neutral', 'Mind the clamps. Don\'t stand downwind unless you want to be smoked like a ham.'); });
  greet('vit', async (a) => { await say(a, 'happy', 'I\'m not allowed in the woods any more. Ever. Father says.'); });
}

// ---------------------------------------------------------------- a letter for Anna

function registerLetter() {
  castHooks.push(() => {
    if (ACT() !== 1 || flag('tomasz_dead') || flag('refugees_moved')) return;
    const t = npc('tomasz', OW(118, 133), always(OW(118, 133), 'sit', { dir: 0 }));
    if (t) { t.mem.hold = true; t.pose = 'lie'; t.mem.faceWhileTalking = false; }
  });
  topic('tomasz', {
    id: 'lt_give', auto: true, text: '', if: () => !qActive('side_letter') && !qDone('side_letter'),
    run: async (a) => {
      await talk(`
        tomasz pain: You. You've got a kind face. Come here. Closer. I can't... I can't shout any more.
        tomasz: Tomasz. Sir Bertram's levy, from Silverdale. The Company caught us on the Dubá road. The surgeon says... well. The surgeon says a lot of things.
        tomasz: I have a letter. For my wife. Anna. In Silverdale, by the mine. I wrote it... I had a monk write it. She can't read. Nor can I. Will you take it to her?
      `);
      const c = await choose([
        { id: 'yes', text: 'I\'ll put it in her hands myself.' },
        { id: 'you', text: 'You\'ll take it to her yourself. You\'ll mend.' },
      ]);
      if (c === 'you') await say(a, 'tender', 'That\'s kind. You\'re a bad liar. Take it anyway. Please.');
      addItem('soldiers_letter', 1);
      startQuest('side_letter');
      await talk(`
        tomasz tender: Tell her... tell her to sell the cow, not the goat. She'll know. It's in the letter too, but... tell her.
      `);
      setTimeout(() => {
        setFlag('tomasz_dead');
        S.deadNpcs.tomasz = true;
        const t = findActor('tomasz');
        if (t) { t.dead = true; t.pose = 'dead'; t.mem.looted = true; }
      }, 90000);
      return 'end';
    },
  });
  topic('anna', {
    id: 'lt_deliver', auto: true, text: '', if: () => qAt('side_letter', 'start') && has('soldiers_letter'),
    run: async () => {
      await talk(`
        anna: You're not from Silverdale. What... what is that? That's a letter. Who writes to me? Nobody writes to me.
        player: Tomasz. Your husband. I'm sorry, Anna. I'm so sorry.
        > She knows before you say it. People always know. She sits down on the bench by the door, quite slowly, and holds out her hand for the letter.
        anna: I can't read it. He knew I can't read. The fool. The dear fool.
      `);
      const c = await choose([
        { id: 'read', text: '[Read it to her]', if: () => skill('reading') >= 1 },
        { id: 'give', text: '[Give her the letter]' },
      ]);
      removeItem('soldiers_letter');
      if (c === 'read') {
        await talk(`
          > You read it to her, slowly, word by word, with your finger under the lines, the way Tobiah taught you.
          > "I think of your hands, and the smell of the bread, and the way you sing when you think I am asleep. I was never asleep. I was listening."
          > When you finish, she takes the letter from you and folds it very small, and holds it against her heart with both hands.
          anna cry: He was listening. All those years. The fool. The dear, dear fool.
        `);
        remember('read_to_anna');
        addXp('reading', 10);
      } else {
        await talk(`
          > She holds the letter against her heart with both hands, unopened. She will find someone to read it to her. Or perhaps she won't. Perhaps she will just hold it.
          anna cry: Thank you. Thank you for bringing him home to me. Even this much of him.
        `);
      }
      await talk(`
        anna: He said to sell the cow, didn't he. Not the goat. He always said that. The goat is the better milker, whatever my mother says.
      `);
      setFlag('letter_delivered');
      addRel('anna', 8);
      completeQuest('side_letter');
      return 'end';
    },
  });
  greet('anna', async (a) => { await say(a, qDone('side_letter') ? 'tender' : 'worried', qDone('side_letter') ? 'Come in, come in. There\'s milk. From the goat.' : 'Yes? Have you news? Of the levy? Of anyone?'); });
}

// ---------------------------------------------------------------- the next war

function registerHavel() {
  on('item:havel_sword', () => {
    if (!qActive('side_havel')) startQuest('side_havel', 'kovar', true);
    else setStage('side_havel', 'kovar');
  });
  trigger('sd_havel_start', () => ACT() >= 1 && !qActive('side_havel') && !qDone('side_havel') && !!chose('havel_story') && nearTile(18, 93, 5), () => { startQuest('side_havel'); });
  on('quest', (id: string) => {
    if (id === 'side_havel') return;
    if (flag('havel_given') && qActive('side_havel')) completeQuest('side_havel');
  });
  trigger('sd_havel_done', () => !!flag('havel_given') && qActive('side_havel'), () => completeQuest('side_havel'));
}

// ---------------------------------------------------------------- Hanka

function registerHanka() {
  topic('hanka', {
    id: 'hk_walk', text: 'Walk with me this evening, Hanka?', if: () => ACT() >= 2 && !!flag('hanka_moved') && !flag('hanka_walk') && rel('hanka') >= 6 && hourF() >= 17 && hourF() < 23,
    run: async () => {
      setFlag('hanka_walk');
      await cutscene(async () => {
        await fadeTo(1, 1);
        await wait(0.5);
        await fadeTo(0, 1);
        await talk(`
          > You walk down to the river below the town walls, where the willows lean over the water. The swallows are out. The sky is the colour of a bruised plum.
          hanka: I used to think the world was the valley. Hollowbrook, the brook, the woods, Wenda's hut. That was everything. Everything I loved was in a day's walk.
          hanka sad: It still is, I think. What's left of it.
        `);
        const c = await choose([
          { id: 'you', text: 'Everything I love is in a day\'s walk too. Most of it is standing right here.' },
          { id: 'home', text: 'We\'ll rebuild it. All of it. I swear.' },
          { id: 'quiet', text: '[Take her hand]' },
        ]);
        if (c === 'you') {
          await talk(`
            hanka surprised: ...{name}.
            > She looks at you for a long time. Then she stands on her toes and kisses you, very quickly, as if she's afraid she'll lose her nerve.
            hanka tender: You took long enough. Since St. John's Eve. Since before that. Since we were twelve and you gave me a nail you'd made, like it was a jewel.
            player: It was a very good nail.
            hanka laugh: It was a terrible nail. I still have it.
          `);
          addRel('hanka', 6);
          remember('hanka_kiss');
        } else if (c === 'home') {
          await say('hanka', 'tender', 'I know you will. You\'re like your father. Stubborn as iron.');
          addRel('hanka', 3);
        } else {
          await narrate('You take her hand. Her fingers are cold, and quick, and they close around yours and don\'t let go. You walk back through the dusk like that, not talking, and neither of you needs to.');
          addRel('hanka', 4);
        }
      });
    },
  });
  topic('hanka', {
    id: 'hk_before', text: 'We march on Ravenstone soon.', once: true, if: () => ACT() === 3,
    run: async () => {
      await talk(`
        hanka worried: I know. Everyone knows. The whole town is sharpening things.
        hanka: Here. Yarrow salve, the strong one, I made it myself. And a poultice. And... just come back. That's all. You don't have to be brave. Just come back.
      `);
      addItem('yarrow_salve', 3);
      addItem('comfrey_poultice', 2);
      if (rel('hanka') >= 10) await talk(`
        hanka tender: And when you come back, you're going to marry me. I've decided. I'm telling you now so you've got something to come back for.
        player: Is that a proposal?
        hanka smirk: It's an order. From a witch. You'd better obey it.
      `);
    },
  });
  greet('hanka', async (a) => { await say(a, ACT() >= 2 ? 'tender' : 'happy', ACT() >= 2 ? rand.pick(['There you are.', 'Come here. Let me look at you. You\'re not eating.', 'Hello, smith.']) : 'Hello, smith.'); });
}

// ---------------------------------------------------------------- family

function registerFamily() {
  topic('marta', {
    id: 'fm_bread', text: 'How is the baking, Mother?', if: () => ACT() >= 1 && !!flag('mother_cured') && !!flag('mother_moved'),
    run: async () => {
      await talk(`
        marta: Greta's oven pulls to the left and her flour is half chalk, and I told her so, and now we're friends. That's how it works with bakers.
        marta tender: Here. Caraway, with the cross cut in the top. I bake one for you every morning, whether you come or not. Mostly you don't. Mostly the tanner's boys eat it.
      `);
      if (!flag('bread_today_' + dayIndex())) { setFlag('bread_today_' + dayIndex()); addItem('marta_bread', 1); }
    },
  });
  topic('marta', {
    id: 'fm_sword', text: 'Mother, look. Father\'s sword. It\'s finished.', once: true, if: () => has('fathers_sword') && !!flag('mother_cured'),
    run: async () => {
      await talk(`
        > She wipes her hands on her apron, very carefully, before she touches it. She finds the letters near the hilt with her thumb.
        marta tender: I drew these for him. On a scrap of board, by candlelight. He made me do it four times because he said my B looked like a pregnant goose.
        marta cry: He cut them in the steel, every stroke. With those great clumsy hands. For you.
        > She holds you, and the sword between you, and for a long while neither of you says anything at all.
      `);
      sting('sad');
    },
  });
  topic('marta', {
    id: 'fm_lida', text: 'I know where Lida is, Mother. She\'s alive. Ravenstone.', once: true, if: () => !!chose('knows_lida_ravenstone') && !!flag('mother_cured'),
    run: async () => {
      await talk(`
        marta surprised: Alive? Say it again.
        player: Alive. In Sir Lothar's kitchens. A cook there looks after her.
        marta cry: In a kitchen. Of course she's in a kitchen. She's my daughter.
        marta: Bring her home, {name}. You bring her home. And you come home too. You hear me?
      `);
      addBuff('hope', 1440);
    },
  });
}

// ---------------------------------------------------------------- the world's little scripts

function registerWorldScripts() {
  on('script:bath', async () => {
    await conversation(async () => {
      if (S.money < 2) { await narrate('The bath costs two groschen. You haven\'t got two groschen.'); return; }
      const c = await choose([{ id: 'yes', text: 'Take a bath. (2 groschen, 1 hour)' }, { id: 'no', text: 'Not now.' }], undefined, 'Steaming water, a clean linen sheet, and a barber with a razor who talks too much.');
      if (c !== 'yes') return;
      addMoney(-2);
      await waitHours(1);
      S.dirt = 0;
      G.player.combat.bleeding = 0;
      G.player.hp = Math.min(G.player.maxHp, G.player.hp + 15);
      addBuff('bathed', 6 * 60);
      await narrate('You come out pink and new and smelling of lavender. The barber has dressed your cuts and told you everything about his sister-in-law.');
    });
  });
  on('script:hearth', async () => {
    await conversation(async () => {
      if (ACT() === 0) { await narrate('Mother\'s porridge pot hangs over the fire, with the ladle in it. You help yourself. Everyone does.'); S.hunger = Math.min(100, S.hunger + 25); return; }
      await narrate('You hold your hands to the fire until the feeling comes back into them.');
    });
  });
  on('script:oven', async () => {
    await conversation(async () => {
      if (ACT() === 0) await narrate(hourF() < 12 ? 'The oven breathes out heat like a sleeping dragon. The loaves inside are the colour of a good saddle. Mother would skin you alive if you opened it now.' : 'The oven is cooling. It smells of caraway and a hundred years of bread.');
      else await narrate('The old oven. You press your palm flat against the brick. It is warm. Somebody has baked in it today.');
    });
  });
  on('script:dummy', async () => {
    await conversation(async () => {
      const w = S.equip.weapon;
      const kind = w ? (w.includes('sword') || w === 'falchion' || w === 'longsword' ? 'sword' : w.includes('axe') || w === 'hatchet' ? 'axe' : 'blunt') : 'blunt';
      const c = await choose([{ id: 'yes', text: 'Practise for an hour.' }, { id: 'no', text: 'Not now.' }], undefined, 'A straw man on a post, much stabbed, much mended.');
      if (c !== 'yes') return;
      if (S.energy < 15) { await narrate('You are too tired. Your arms feel like wet rope.'); return; }
      await waitHours(1);
      const lv = skill(kind);
      const gain = lv < 6 ? 12 : lv < 10 ? 6 : 2;
      addXp(kind, gain);
      addXp('strength', 2);
      S.energy = Math.max(0, S.energy - 8);
      await narrate(lv < 10 ? 'An hour of cuts and thrusts. Your shoulders burn. Your grip is surer.' : 'The dummy has nothing left to teach you. Only real fights will do that now.');
    });
  });
  on('script:target', async () => {
    await conversation(async () => {
      if (!S.equip.bow || !has('arrow')) { await narrate('A straw target. You need a bow and arrows to practise here.'); return; }
      const c = await choose([{ id: 'yes', text: 'Practise for an hour.' }, { id: 'no', text: 'Not now.' }], undefined, 'A straw target, bristling with old arrows.');
      if (c !== 'yes') return;
      await waitHours(1);
      addXp('archery', skill('archery') < 8 ? 12 : 3);
      addXp('agility', 1);
      await narrate('Arrow after arrow. By the end of the hour, most of them hit the straw.');
    });
  });
  on('script:skeps', async () => {
    await conversation(async () => {
      await narrate(qDone('side_bees') ? 'The hives hum, contented. One of them has a crooked straw cap Tobiah calls "the Empress\'s crown".' : 'Straw skeps, humming. Some of them are quieter than they should be.');
    });
  });
  on('script:radek_grave', () => graveVisit());
}

async function graveVisit() {
  await conversation(async () => {
    const act = ACT();
    await narrate('Father\'s grave, beside the chapel wall. Somebody has been keeping it tidy.');
    const opts = [
      { id: 'talk', text: '[Talk to him]' },
      { id: 'flowers', text: '[Leave flowers]', if: () => has('flowers') || has('cornflower') || has('chamomile') },
      { id: 'sword', text: '[Show him the sword]', if: () => has('fathers_sword') && !flag('grave_sword') },
      { id: 'pray', text: '[Pray]' },
      { id: 'go', text: '[Leave]' },
    ];
    const c = await choose(opts);
    if (c === 'talk') {
      const lines = act <= 1
        ? ['I found Mother, Father. She\'s alive. I\'m going to get Lida back. I promise. Knight\'s promise.', 'I don\'t know what I\'m doing. You never told me what to do. You just did things, and I watched.', 'Vojta found your hammer. He gave it back. Can you believe it? Vojta.']
        : act === 2
          ? ['Kovář says you broke his nose once. He sounded proud of it.', 'I know where Lida is. She\'s alive, Father. She\'s in a kitchen, of all places. Mother says of course she is.', 'I\'m learning. Letters, swords, everything. I wish you could see.']
          : ['Tomorrow, Ravenstone. I\'m going to bring her home. Then I\'m going to come back here and tell you all about it, and you\'re going to say "hm".', 'They made me a knight, Father. A knight. You\'d have walked around the yard three times.'];
      await narrate(`You say: "${rand.pick(lines)}"`);
      await narrate('The wind moves in the grass. It\'s not an answer. It\'s not nothing, either.');
    } else if (c === 'flowers') {
      for (const f of ['flowers', 'cornflower', 'chamomile']) if (has(f)) { removeItem(f); break; }
      setFlag('grave_flowers');
      refreshDecor('overworld');
      await narrate('You lay the flowers on the grave. He never cared for flowers. Mother did. It\'s for both of them, really.');
    } else if (c === 'sword') {
      setFlag('grave_sword');
      await narrate('You kneel and lay the finished sword across the grave, so he can see it. Eleven folds. A good hilt. The letters, black in the steel.');
      await narrate('"Not bad," you say, in his voice. You laugh, and then you don\'t.');
      sting('sad');
    } else if (c === 'pray') {
      await narrate('You don\'t know many prayers. You say the one Mother taught you, and then you just talk, which Tobiah says also counts.');
    }
    if (c !== 'go' && !flag('grave_day_' + dayIndex())) { setFlag('grave_day_' + dayIndex()); addBuff('warmth', 4 * 60); }
  });
}

// ---------------------------------------------------------------- crime and the road

function registerCrime() {
  on('assault', (a: Actor, by: Actor) => {
    if (by !== G.player || a.isAnimal || a.hostile || a.mem.spar) return;
    commitCrime('assault', 10, a);
  });
  on('kill', (o: Actor, by: Actor | null) => {
    if (by !== G.player || o.isAnimal || o.hostile || o.mem.wasHostile || o.surrendered || o.mem.spared) return;
    if (o.faction === 'bandit' || o.faction === 'harrow' || o.faction === 'lothar') return;
    commitCrime('murder', 100, o);
  });
}

function registerAmbush() {
  on('ambush', (tx: number, ty: number) => {
    const kinds = ACT() >= 2 && Math.random() < 0.4 ? 'merc' : 'bandit';
    const n = 2 + (Math.random() < 0.4 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const f = fighter('overworld', (tx + Math.cos(a) * 6) * TILE, (ty + Math.sin(a) * 6) * TILE, kinds as 'merc' | 'bandit', { tags: ['quest', 'ambush'], hostile: true });
      f.mem.alerted = true;
      f.mem.aggroRange = 260;
      f.mem.knows = rand.pick(['There\'s a cart of silver goes up the Ravenstone road every new moon. Guarded. Heavy.', 'The Company pays better than any lord. Paid, I should say. They\'ve stopped paying.', 'They say there\'s a postern on the east side of Ravenstone. One guard, and he drinks.']);
    }
    setTimeout(() => {
      conversation(async () => { await narrate(kinds === 'merc' ? 'Men in black gambesons step out of the trees ahead. "Well, well. A traveller. Purse, boots, and that pretty sword."' : 'Bandits! Three of them, blocking the road, with the look of men who have done this before.'); });
    }, 600);
  });
}

