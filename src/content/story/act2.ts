// Act II: The Raven's Feast. A father's sword, a trail of stolen silver, a
// friend's folly, a cook with a dead daughter, and a night of fire at the
// crossroads.

import { G } from '../../G';
import { S, flag, setFlag, hourF } from '../../state';
import { Actor } from '../../world/actor';
import { findActor, getMap, removeActor, here } from '../../world/world';
import { defineQuest, startQuest, setStage, completeQuest, qAt, qActive, qDone, qVar } from '../../systems/quests';
import { say, talk, narrate, choose, cutscene, conversation, wait, hold, lastCheck } from '../../systems/script';
import { addItem, removeItem, has, addMoney, disguise, equip } from '../../systems/inventory';
import { addXp, addBuff, skill } from '../../systems/stats';
import { notify } from '../../ui/notify';
import { sfx, sting } from '../../audio/sfx';
import { card } from '../../ui/cine';
import { on } from '../../engine/events';
import { forceMusic } from '../../systems/director';
import { walkTo, settleSchedules, flee } from '../../systems/ai';
import { TILE, rand } from '../../engine/util';
import { fadeTo, travel } from '../../systems/transition';
import { forge } from '../../ui/minigames/forge';
import { lockpick } from '../../ui/minigames/lockpick';
import { kill } from '../../systems/combat';
import { autosaveSoon, trigger, unfire, topic, greet, waitUntil, put, putAt, nearTile, onMap, regionIs, protectPlayer, addRel, remember, chose, tip, P, canRunScene, decor, propObj, markerObj, groundItem, hostiles, readAndWait, refreshDecor, skipTo } from './lib';
import { spawnCast, castHooks, npc, fighter, person, OW, always, ACT, at, sched } from './cast';
import { startAct3 } from './act3';

export function registerAct2() {
  defineQuest({
    id: 'main_blade', title: "Father's Blade", kind: 'main', act: 'Act II',
    summary: 'A sword with no hilt, and a letter that says it was meant for you.',
    stages: {
      kovar: { obj: 'Take Father\'s unfinished blade to Master Kovář, the smith of Linden Hill.', marker: { actor: 'kovar' },
        entry: 'Father\'s blade needs a hilt and a temper, and I haven\'t the tools or the skill. There is one other smith in the valley: Master Kovář, in Linden Hill. People say he and Father trained together, a lifetime ago, and haven\'t spoken since.' },
      forge: { obj: 'Finish the blade at Kovář\'s forge.', marker: { map: 'lh_smithy', x: 4, y: 3 } },
      done: { entry: 'The sword is finished. Kovář and I finished it together, and I think Father would have grumbled at both of us, and then hummed.' },
    },
  });
  defineQuest({
    id: 'main_silver', title: 'The Silver Road', kind: 'main', act: 'Act II',
    summary: 'Harrow\'s Company is paid by someone. Silver is going missing from the mines of Silverdale.',
    stages: {
      go: { obj: 'Go to Silverdale and find out where the valley\'s silver is going.', marker: { map: 'overworld', x: 43, y: 34 },
        entry: 'Sir Bertram says a company like Harrow\'s costs a king\'s ransom every month. Someone is paying it. Ondřej says the Silverdale mines have "flooded" three times this summer, in the driest summer in memory.' },
      kuba: { obj: 'Ask the miners what is going on. Kuba is the one who talks.', marker: { actor: 'kuba' } },
      ledger: {
        obj: 'Find proof: the foreman keeps his accounts in a strongbox in his house.',
        get optional() { return [(flag('saw_vein') ? '✓ ' : '· ') + 'Look at the "flooded" gallery in the mine (optional)', (has('foreman_ledger') ? '✓ ' : '· ') + 'The foreman\'s ledger']; },
        marker: () => [{ map: 'sd_foreman', x: 1, y: 9 }, ...(flag('saw_vein') ? [] : [{ key: 'mine_vein', map: 'sd_mine' }])],
        entry: 'The miners haven\'t been paid since Easter. Vilém the foreman says the deep shaft is flooded, but Kuba says the carts still go out at night, heavy, north toward the Ravenstone road. Vilém keeps his books in a strongbox.' },
      bertram: { obj: 'Bring the foreman\'s ledger to Sir Bertram.', marker: { actor: 'bertram' },
        entry: 'The ledger has two sets of numbers. Twenty marks of silver a week "lost in flooding". And a note in the margin: "R. says the Company will be paid by the feast of the Assumption."' },
      done: { entry: 'Rupert of Ravenstone is Sir Lothar\'s steward. The silver goes to Ravenstone, and from Ravenstone to Harrow. Sir Bertram says it is not enough to hang a lord, but it is enough to make him afraid.' },
    },
  });
  defineQuest({
    id: 'main_pavel', title: "Pavel's Folly", kind: 'main', act: 'Act II',
    summary: 'Pavel has gone to bring the Hollowbrook children home, alone.',
    stages: {
      gone: { obj: 'Pavel has ridden for the Company\'s war camp under Ravenstone crag. Go after him.', marker: { map: 'overworld', x: 155, y: 46 },
        entry: 'Pavel took a horse and a sword from the barracks last night and rode north-east. He told the stable boy he was going to fetch the Hollowbrook children home himself. That idiot. That brave, stupid idiot.' },
      camp: {
        obj: 'Pavel is caged in the war camp. Get inside, and get him out.',
        optional: ['Walking in as yourself would be suicide. Camp servants wear undyed smocks.', 'The cook\'s tent is by the south palisade.'],
        marker: () => (disguise() === 'servant' || disguise() === 'harrow' ? { map: 'overworld', x: 168, y: 53 } : { map: 'overworld', x: 154, y: 51 }),
        entry: 'I watched the camp from the ridge. Pavel is in a wooden cage by the horse lines, and they have been throwing things at him. I can\'t fight two hundred men. I\'ll have to be cleverer than that.' },
      ilse: {
        obj: 'Ilse\'s plan: put a sleeping draught in the camp\'s stew, then free Pavel after dark.',
        get optional() { return [(has('valerian_draught') || flag('camp_drugged') ? '✓ ' : '· ') + 'A Valerian Draught (Ilse gave you one, or brew your own)', (flag('camp_drugged') || flag('camp_poisoned') ? '✓ ' : '· ') + 'The stew pot in Ilse\'s tent', '· After dark: the cage by the horse lines']; },
        marker: () => (flag('camp_drugged') || flag('camp_poisoned') ? { map: 'overworld', x: 174, y: 53 } : { map: 'ilse_tent', x: 4, y: 4 }),
        entry: 'The cook, Ilse, knew at once I wasn\'t one of her boys. She didn\'t call the guards. She knew Lida. She gave me Lida\'s drawing, and a plan.' },
      escape: { obj: 'Get Pavel out of the camp.', marker: { map: 'overworld', x: 150, y: 46 } },
      report: { obj: 'Bring Pavel home to Linden Hill and report to Sir Bertram.', marker: { actor: 'bertram' } },
      done: { entry: 'Pavel is home. He hasn\'t made a single joke since. I miss them.' },
    },
  });
  defineQuest({
    id: 'main_feast', title: "The Raven's Feast", kind: 'main', act: 'Act II',
    summary: 'Harrow\'s men will want revenge for Pavel. The crossroads camp is defenceless.',
    stages: {
      warn: { obj: 'Ride to the crossroads camp and prepare its defence with Ondřej.', marker: { map: 'overworld', x: 122, y: 131 },
        entry: 'Sir Bertram fears the Company will answer Pavel\'s escape the way it answers everything: with fire. The camp at the crossroads has no walls, no watch, and a hundred people who have already lost everything once.' },
      wait: { obj: 'Wait for nightfall at the camp. (Press T to wait.)', marker: { map: 'overworld', x: 122, y: 128 } },
      battle: { obj: 'Defend the camp!' },
      after: { obj: 'Speak with Sir Bertram in the great hall.', marker: { actor: 'bertram' } },
      done: { entry: 'We held the crossroads. Not everyone lived. In the morning, Sir Bertram sent for me.' },
    },
  });

  registerTalks();
  registerScenes();
  registerCast();
  registerDecor();
}

// ---------------------------------------------------------------- Act II begins

export async function startAct2() {
  setFlag('act', 2);
  S.flags.act2_day = Math.floor(S.minutes / 1440);
  spawnCast();
  await card("The Raven's Feast", 'Act II', '', { secs: 5, bg: '#000' });
  if (has('unfinished_blade') && !qDone('main_blade')) startQuest('main_blade', 'kovar', true);
  startQuest('main_silver', has('foreman_ledger') ? 'bertram' : 'go', true);
  autosaveSoon();
  notify('Two roads lie ahead: Father\'s blade, and the stolen silver. Your journal (<b>B</b>) lists both.', 'quest', 7000);
}

// ---------------------------------------------------------------- the cast

function registerCast() {
  castHooks.push(() => {
    const act = ACT();
    if (act < 1 || act > 3) return;
    // the war camp, until it is broken
    if (!flag('warcamp_broken')) {
      const W = (dx: number, dy: number) => OW(158 + dx, 38 + dy);
      npc('ilse', null, [sched(5, 21, at('ilse_tent', 'pot'), 'work', { dir: 3 }), sched(21, 5, at('ilse_tent', 'table'), 'sleep')], { faction: 'harrow' });
      if (!flag('harrow_left')) npc('harrow', W(16, 9), always(W(16, 9), 'stand', { dir: 0 }), { faction: 'harrow', skill: 8, hp: 220, weapon: 'longsword', armor: { slash: 28, stab: 22, blunt: 14 } });
      const posts: [number, number][] = [[4, 5], [9, 5], [14, 6], [4, 11], [9, 15], [13, 13], [2, 9]];
      posts.forEach(([dx, dy], i) => {
        if (flag('campmerc_dead_' + i) || (flag('camp_poisoned') && i < 4)) return;
        const m = fighter('overworld', W(dx, dy).x, W(dx, dy).y, i === 6 ? 'archer' : i === 2 ? 'merc_heavy' : 'merc', { id: 'campmerc' + i, hostile: false, seed: 1600 + i, tags: ['quest', 'camp'] });
        m.mem.wander = 36;
        m.faction = 'harrow';
        if (flag('camp_drugged') && isDruggedNight()) { m.mem.hold = true; m.pose = 'sleep'; m.mem.sleeping = true; m.mem.sight = 1; }
      });
      if (flag('pavel_prisoner') && !flag('pavel_freed')) {
        const pv = npc('pavel', OW(174, 52), always(OW(174, 52), 'sit', { dir: 0 }), { faction: 'villager' });
        if (pv) { pv.mem.hold = true; pv.pose = 'sit'; pv.tags.add('prisoner'); }
      }
    }
    // Pavel follows you out of the camp
    if (flag('pavel_freed') && qAt('main_pavel', 'escape')) {
      const pv = npc('pavel', null, null, { faction: 'ally', weapon: 'club', skill: 3 });
      if (pv) { pv.mem.follow = 'player'; pv.mem.hold = false; pv.pose = 'idle'; }
    }
  });
  on('kill', (a: Actor) => {
    const m = /^campmerc(\d)$/.exec(a.id);
    if (m) setFlag('campmerc_dead_' + m[1]);
  });
  // a save made in the middle of the crossroads battle starts the night again
  castHooks.push(() => {
    if (qAt('main_feast', 'battle')) { S.quests.main_feast.stage = 'wait'; unfire('a2_feast_night'); }
  });
}

const isDruggedNight = () => { const h = hourF(); return (h >= 21.5 || h < 5) && Math.floor((S.minutes - 5 * 60) / 1440) === (flag('drug_day') ?? -1); };

function registerDecor() {
  groundItem('camp_smock', 'overworld', 'servant_clothes', 154, 51, { when: () => ACT() >= 2 && !flag('warcamp_broken') });
  decor({ key: 'cage_lock', map: 'overworld', when: () => ACT() >= 2 && !!flag('pavel_prisoner') && !flag('pavel_freed'), make: () => markerObj(173, 53, { type: 'script', script: 'cage', label: 'The cage lock' }) });
}

// ---------------------------------------------------------------- scenes

function registerScenes() {
  // Kovář's forge
  on('forge:scripted', () => { if (qAt('main_blade', 'forge') && onMap('lh_smithy')) finishBlade(); });
  // Silverdale
  trigger('a2_silverdale', () => qAt('main_silver', 'go') && regionIs('silverdale'), () => { setStage('main_silver', 'kuba'); });
  on('script:mine_vein', () => mineVein());
  on('script:mine_cache', () => mineCache());
  on('item:foreman_ledger', () => { if (qAt('main_silver', 'go', 'kuba', 'ledger')) setStage('main_silver', 'bertram'); });
  // Pavel's folly begins a day into Act II, once the silver is on its way
  trigger('a2_pavel_gone', () => ACT() === 2 && !qActive('main_pavel') && !qDone('main_pavel') && (qAt('main_silver', 'bertram') || qDone('main_silver') || Math.floor(S.minutes / 1440) >= (flag('act2_day') ?? 0) + 2) && regionIs('linden'), () => pavelGone());
  trigger('a2_overlook', () => qAt('main_pavel', 'gone') && nearTile(155, 46, 12), () => overlook());
  // the camp's rules: strangers are not welcome
  trigger('a2_trespass', () => ACT() >= 1 && ACT() <= 3 && !flag('warcamp_broken') && regionIs('warcamp') && !['servant', 'harrow'].includes(disguise() || '') && !hostiles('camp').length && here().some((a) => a.tags.has('camp') && !a.mem.sleeping), () => trespass(), { repeat: true, cooldown: 4 });
  trigger('a2_ilse_spots', () => qAt('main_pavel', 'camp') && onMap('ilse_tent'), () => ilseSpots());
  on('script:stewpot', () => stewpot());
  on('script:cage', () => cage());
  trigger('a2_escaped', () => qAt('main_pavel', 'escape') && onMap('overworld') && !regionIs('warcamp') && nearTile(150, 46, 14), () => escaped());
  // the feast: begins once Pavel is home and the silver is known
  trigger('a2_feast_start', () => qDone('main_pavel') && qDone('main_silver') && !qActive('main_feast') && !qDone('main_feast') && ACT() === 2 && canRunScene(), () => feastWarning());
  trigger('a2_feast_arrive', () => qAt('main_feast', 'warn') && nearTile(122, 131, 10), () => feastArrive());
  trigger('a2_feast_night', () => qAt('main_feast', 'wait') && (hourF() >= 22 || hourF() < 4) && nearTile(122, 131, 16), () => feastBattle());
}

function registerTalks() {
  // ---------- Kovář ----------
  topic('kovar', {
    id: 'a2_blade', auto: true, text: '', if: () => qAt('main_blade', 'kovar') && has('unfinished_blade'),
    run: async (a) => { await kovarBlade(a); return 'end'; },
  });
  topic('kovar', {
    id: 'a2_forge_wait', auto: true, text: '', if: () => qAt('main_blade', 'forge'),
    run: async (a) => { await say(a, 'neutral', 'The forge is hot. It\'s waiting for you, not for me.'); return 'end'; },
  });
  topic('kovar', {
    id: 'a2_havel', text: 'Can you restore an old sword? It was Havel\'s.', if: () => has('havel_sword') && !flag('havel_restored'),
    run: async () => {
      await talk(`
        kovar: Let me see. Hm. King Charles's wars. Good Passau steel under the rust. Somebody loved this once, and then buried it.
        kovar: Leave it with me overnight. No charge. I knew Havel. He told the same lie about the Marchfeld at my wedding.
      `);
      removeItem('havel_sword');
      setFlag('havel_restored');
      S.flags.havel_ready = S.minutes + 12 * 60;
    },
  });
  topic('kovar', {
    id: 'a2_havel_ready', text: 'Is Havel\'s sword ready?', if: () => !!flag('havel_restored') && !flag('havel_given') && S.minutes > (flag('havel_ready') || 0),
    run: async () => {
      await talk(`
        kovar: Ready. It'll never be pretty, but it'll never break, either. Rather like Havel.
        > The old blade gleams. Kovář has put a new grip on it, and a new edge, and left the crooked letters HAVEL on the steel.
      `);
      addItem('longsword', 1);
      setFlag('havel_given');
      notify('Havel\'s old sword, restored: a <b>Longsword</b>.', 'item');
    },
  });
  greet('kovar', async (a) => { await say(a, 'neutral', rand.pick(['What?', 'If you\'re buying, buy. If you\'re talking, talk fast.', 'Radek\'s boy. Hm.'])); });

  // ---------- Kuba, Vilém, Anna ----------
  topic('kuba', {
    id: 'a2_kuba', auto: true, text: '', if: () => qAt('main_silver', 'kuba', 'go'),
    run: async () => {
      await talk(`
        kuba: You're not a miner. Miners have white faces from the dust and black lungs. You've got a pink face and, I'd guess, pink lungs. What do you want?
        player: Sir Bertram sent me. About the silver.
        kuba: Sir Bertram! Well, well. Tell Sir Bertram we haven't been paid since Easter. Tell him the deep shaft is "flooded".
        kuba: Flooded! There's been no rain since St. George's Day. You know what I think? I think the silver's flowing out of that shaft like water. Only it flows north. At night. In carts.
        kuba: Vilém keeps his accounts in an iron box in his house. He sleeps with the key round his neck. If I could read, and if I were a thief, I'd look in that box.
      `);
      setStage('main_silver', 'ledger');
      if (!qActive('side_miners') && !qDone('side_miners')) startQuest('side_miners', 'start', true);
      return 'end';
    },
  });
  topic('kuba', {
    id: 'a2_key', text: 'How would someone get into Vilém\'s strongbox?', if: () => qAt('main_silver', 'ledger') && !has('foreman_ledger'),
    run: async () => {
      await talk(`
        kuba: Someone? Hm. Someone could pick the lock, if someone had the hands for it. It's a good lock. Nuremberg.
        kuba: Or someone could ask Anna. She cleans for him Tuesdays and Fridays. She says he hides a spare key under the hearthstone, because he's always losing the one round his neck when he's drunk.
        kuba sad: Anna's husband went to fight for Sir Bertram in the spring. She's heard nothing since. She's not been herself.
      `);
      setFlag('anna_key_hint');
    },
  });
  topic('anna', {
    id: 'a2_key', text: 'Kuba says you know where Vilém keeps a spare key.', if: () => !!flag('anna_key_hint') && !has('foreman_ledger') && !flag('anna_key_told'),
    run: async () => {
      if (qDone('side_letter') || flag('letter_delivered')) {
        await talk(`
          anna: For you? After what you did for me, with Tomasz's letter? Anything.
          anna: Under the hearthstone in his hall, left side. Wrapped in a rag. He goes to the alehouse in the evening, God forgive him, till the bell.
        `);
        setFlag('anna_key_told');
      } else {
        await talk(`
          anna worried: I don't know what you mean. I clean his house, that's all. I need the work. My husband is away.
          anna sad: ...I'm sorry. I can't. If he found out, he'd throw me out of this house, and I've nowhere else.
        `);
      }
    },
  });
  topic('vilem', {
    id: 'a2_vilem', auto: true, text: '', if: () => qAt('main_silver', 'bertram') && has('foreman_ledger') && !flag('vilem_confronted'),
    run: async (a) => { await vilemConfront(a); return 'end'; },
  });
  greet('vilem', async (a) => { await say(a, 'neutral', 'Well? I\'m a busy man. The mine doesn\'t run itself. Much.'); });

  // ---------- Bertram ----------
  topic('bertram', {
    id: 'a2_ledger', auto: true, text: '', if: () => qAt('main_silver', 'bertram') && has('foreman_ledger'),
    run: async (a) => { await bertramLedger(a); return 'end'; },
  });
  topic('bertram', {
    id: 'a2_pavel', auto: true, text: '', if: () => qAt('main_pavel', 'report'),
    run: async (a) => { await pavelReport(a); return 'end'; },
  });
  topic('bertram', {
    id: 'a2_knight', auto: true, text: '', if: () => qAt('main_feast', 'after'),
    run: async (a) => { await knighting(a); return 'end'; },
  });

  // ---------- Ondřej ----------
  topic('ondrej', {
    id: 'a2_pavel', auto: true, text: '', if: () => qAt('main_pavel', 'gone') && !flag('ondrej_pavel_told'),
    run: async () => {
      setFlag('ondrej_pavel_told');
      await talk(`
        ondrej angry: Your idiot friend. Took Brown Bess and my second-best sword and rode off in the night. Left me a note. A note! He can't write! He drew it!
        > The note is a drawing of a stick-man on a horse, riding toward a lot of other stick-men, and some small stick-children in a cart.
        ondrej: If he's lucky they'll kill him quick. If he's unlucky they'll keep him. Go on, then. You're going anyway. I can see it on you.
      `);
      return 'end';
    },
  });

  // ---------- Ilse ----------
  topic('ilse', {
    id: 'a2_ilse', auto: true, text: '', if: () => qAt('main_pavel', 'camp'),
    run: async () => { await ilseSpots(true); return 'end'; },
  });
  topic('ilse', {
    id: 'a2_lida', text: 'Tell me about Lida.', if: () => qActive('main_pavel') || qDone('main_pavel'),
    run: async () => {
      await talk(`
        ilse tender: She came in a cart with nine others. The others cried. She didn't. She sat at the back with her arms crossed and told the carter his horse was lame. It was.
        ilse: I gave her extra bread. She gave half of it to the smallest one, a boy from Dubá, and told him it was from the Queen of Bohemia.
        ilse: I taught her to write her name, with charcoal, on a board. She learned it in one evening. She said her mother would be proud because her mother can read. She said her brother can't, and that she would teach him.
      `);
    },
  });
  greet('ilse', async (a) => { await say(a, 'neutral', 'Keep your voice down.'); });

  // ---------- Pavel ----------
  topic('pavel', {
    id: 'a2_cage', auto: true, text: '', if: () => !!flag('pavel_prisoner') && !flag('pavel_freed'),
    run: async () => {
      await talk(`
        pavel pain: {name}? God's teeth, is that you? In that smock?
        player: Keep your voice down. I'm getting you out.
        pavel: ...I'm an idiot. I thought... I thought I'd just ride in and take them. The children. I thought they'd just be sitting in a pen, waiting.
      `);
      return 'end';
    },
  });
  topic('pavel', {
    id: 'a2_after', text: 'How are you, Pavel? Really.', once: true, if: () => qDone('main_pavel'),
    run: async () => {
      await talk(`
        pavel: Really? I keep seeing Father. In the mill. The roof coming down.
        pavel sad: I wanted a war, you know. On St. John's Eve I said I wanted a small one. A polite one. God heard me, didn't He. He's got a terrible sense of humour.
        pavel: I don't want to be a knight any more, {name}. I want to be a miller. I want flour in my beard. I want to be bored.
      `);
      const c = await choose([
        { id: 'mill', text: 'Then when this is over, we\'ll rebuild the mill. I\'ll forge the gears.' },
        { id: 'brave', text: 'You rode into two hundred men for children who aren\'t yours. That\'s a knight, Pavel.' },
      ]);
      if (c === 'mill') { await say('pavel', 'tender', '...Aye. Aye, we will. You and your stupid gears.'); remember('promised_mill'); }
      else await say('pavel', 'sad', 'That\'s an idiot. There\'s a difference. Only just, but there is.');
      addRel('pavel', 4);
    },
  });
}

// ---------------------------------------------------------------- Father's blade

async function kovarBlade(a: Actor) {
  await cutscene(async () => {
    a.face(G.player.x, G.player.y);
    await talk(`
      kovar: Radek's boy. I heard. I'm sorry for it. He was a stubborn, humming, impossible man, and the best smith I ever saw, and I never once told him so.
      player: He left this. For me. It isn't finished.
      > Kovář takes the blade. He turns it to the light. He runs his thumb along the flat, where the folded steel ripples like water in a millrace. He doesn't say anything for a long time.
      kovar: Eleven folds. The mad old goat. Eleven. I told him in Kutná, nobody needs more than seven. He said, "I'll need eleven, one day, for something that matters."
    `);
    const c = await choose([
      { id: 'kutna', text: 'You knew him in Kutná?' },
      { id: 'finish', text: 'Will you finish it? I\'ll pay what I can.' },
    ]);
    if (c === 'kutna') {
      await talk(`
        kovar: We apprenticed together under Master Hynek. Six years. Slept on the same straw, ate from the same pot. He was the better smith and I was the better talker, and between us we were almost one decent man.
        kovar: Then a baker's girl from the Lindenmark came to the Kutná market to sell her mother's bread. Dark hair, a mouth on her like a fishwife, and she could read. She could read!
        player: Mother.
        kovar tender: Marta. We both courted her. I brought her ribbons and poems I paid a monk to write. Your father brought her a nail he'd made, perfectly, and hummed at her.
        kovar smirk: She chose the humming. I never forgave either of them. Thirty years. What a waste of a good friend. What a waste.
      `);
      addRel('kovar', 3);
      remember('kovar_story');
    }
    await talk(`
      kovar: I won't finish it for you.
      player: But—
      kovar: I won't finish it, because it isn't mine to finish. Read his letter, lad. "A man should finish his own sword." He meant it. It's the only thing he ever said to me twice.
      kovar: But I'll stand beside you while you do it. The hilt I have, a good one, I made it years ago and never found a blade that deserved it. The temper and the edge are yours. Come. The forge is hot.
    `);
    setStage('main_blade', 'forge');
    setFlag('forge_script');
  });
  tip('kforge', 'Use Kovář\'s forge to finish the blade.');
}

async function finishBlade() {
  const kovar = findActor('kovar');
  await conversation(async () => {
    await narrate('Kovář works the bellows for you. He doesn\'t say anything. He doesn\'t have to; you can feel him watching every stroke, the way Father used to.');
  });
  const q = await forge({ title: "Father's Blade", strikes: 12, shape: 'sword', help: 'Heat it to <b>orange-gold</b>, never white. Strike only on the target. <b>Quench</b> when the shaping is done, while it is still hot, to set the temper.' });
  S.flags.forge_script = false;
  await cutscene(async () => {
    if (kovar) kovar.face(G.player.x, G.player.y);
    const quality = Math.max(q, 55);
    removeItem('unfinished_blade');
    S.inv.push({ id: 'fathers_sword', n: 1, q: quality, cond: 100 });
    sfx('quest_done');
    if (q >= 80) await talk(`
      kovar: ...
      > Kovář takes the finished sword. He sights down the blade. He flexes it against the anvil and lets it spring back, and it sings, a clear high note that goes on and on.
      kovar tender: Not bad.
      > He says it exactly the way Father did. You don't think he even notices.
    `);
    else if (q > 0) await talk(`
      kovar: Hm. Your quench was late and your third stroke wandered. It's a good sword. It could have been a great one.
      kovar: Your father's first sword was worse. I know because I laughed at it, and he broke my nose.
    `);
    else await talk(`
      > The iron cools while your hands shake. Kovář takes the tongs from you without a word and finishes the temper himself, and the steel hisses in the trough like something alive.
      kovar: There's no shame in it. Your hands were full of your father today. Mine too.
    `);
    await talk(`
      > Near the hilt, where the blade is widest, there are letters. Small, careful, cut into the steel with a graver and then blackened. Father couldn't write. Somebody drew them for him, and he cut them, stroke by stroke, the way you'd copy a drawing.
    `);
    if (skill('reading') >= 1) {
      await talk(`
        > You read it yourself, slowly, your finger under each letter.
        > FOR MY SON, WHO WILL BE BETTER THAN ME.
      `);
      remember('read_blade_self');
    } else {
      await talk(`
        kovar: You can't read it. Can you.
        player: No.
        kovar sad: It says: "For my son, who will be better than me." In your mother's hand, cut by his. The two of them. On one blade.
      `);
    }
    sting('sad');
    await talk(`
      kovar: Take it. Carry it. And, lad? When you've done whatever it is you mean to do with it, come back here and let me teach you the rest of the trade. Radek would want that. I'd want it.
    `);
    addXp('smithing', 25);
    addRel('kovar', 5);
    addBuff('warmth', 8 * 60);
  });
  completeQuest('main_blade');
  equip('fathers_sword');
  notify('<b>Father\'s Sword</b> is in your hand.', 'item', 5000);
}

// ---------------------------------------------------------------- the silver road

async function mineVein() {
  await conversation(async () => {
    if (flag('saw_vein')) { await narrate('The vein in the "flooded" gallery, freshly cut.'); return; }
    await narrate('This is the deep gallery that Vilém says is flooded. There\'s a hand\'s depth of water on the floor, no more, and it has been carried in: you can see the bucket marks on the rock.');
    await narrate('And the vein. A fat seam of grey silver ore, freshly worked, with new pick-marks and fresh props. Someone is mining here, every night, and none of it is going to Linden Hill.');
    setFlag('saw_vein');
    addXp('stealth', 3);
  });
}

async function mineCache() {
  await conversation(async () => {
    if (flag('found_cache')) { await narrate('The empty hole behind the loose stone.'); return; }
    await narrate('Behind the loose stone: a hollow, and in it, wrapped in sacking, four small bars of refined silver. Each one is stamped with a mark: a bird with its wings spread.');
    await narrate('A raven.');
    setFlag('found_cache');
    addItem('silver_ore', 2);
    remember('saw_raven_bars');
  });
}

async function vilemConfront(a: Actor) {
  setFlag('vilem_confronted');
  await talk(`
    vilem worried: That's... where did you get that? That's private property. That's the lord's accounts!
    player: Twenty marks a week, "lost in flooding". In a dry summer.
    vilem: Keep your voice down. Keep it down. Listen. Listen to me, lad. Nobody needs to get hurt. There's money in this. More than you'll see in ten years of shoeing horses.
  `);
  const c = await choose([
    { id: 'who', text: 'Who is "R."?', check: { stat: 'speech', need: 4 } },
    { id: 'bribe', text: 'How much money?' },
    { id: 'arrest', text: 'You\'re coming with me to Linden Hill.' },
  ]);
  if (c === 'bribe') {
    await talk(`
      vilem happy: Now you're talking sense. A hundred groschen. Now. And the ledger goes in the fire.
    `);
    const c2 = await choose([
      { id: 'take', text: '[Take the money. Keep the ledger anyway.]' },
      { id: 'no', text: 'My father died for your silver. Keep your money.' },
    ]);
    if (c2 === 'take') {
      addMoney(100);
      remember('took_vilem_bribe');
      await talk(`
        > You take the purse. And you keep the ledger. Vilém realises it a heartbeat too late, and goes white, and then red.
        vilem angry: You— you thief! You little thief!
      `);
    } else await say(a, 'angry', 'Then you\'re a fool, like your father.');
  }
  if (c === 'who' && lastCheck) {
    await talk(`
      vilem worried: Rupert. Rupert of Ravenstone. Sir Lothar's steward. He comes once a month with the wagons and a purse, and I... I sign what he tells me to sign.
      vilem: It goes to the Company. All of it. To Harrow. For the... the arrangement. I don't ask about the arrangement! I don't want to know!
    `);
    remember('vilem_named_rupert');
  }
  await talk(`
    > Vilém looks at the door. He looks at you. Then he runs, faster than you'd have thought a fat man could, out the door and down the road toward the north, shouting for his horse.
  `);
  setFlag('vilem_gone');
  a.mem.fleeT = 20; a.mem.fleeFrom = G.player; a.mem.despawnOnFlee = true;
  a.essential = false;
}

async function bertramLedger(a: Actor) {
  await cutscene(async () => {
    a.face(G.player.x, G.player.y);
    await talk(`
      bertram: What have you brought me now? You have the look of a dog with a very bad bone.
      > You give him the ledger. He reads it standing up. When he reaches the margin, he reads it again, and his jaw tightens.
      bertram: "R. says the Company will be paid by the feast of the Assumption." R.
    `);
    if (chose('vilem_named_rupert')) await talk(`
      player: Rupert. Vilém named him. Lothar's steward.
    `);
    await talk(`
      bertram: Rupert of Ravenstone. Lothar's steward these twenty years. A careful, bloodless man. Lothar trusts him with everything.
      bertram sad: It's the steward's hand, not the lord's. A court would say a steward can steal from his master as easily as from me. Lothar would say it. He'd weep as he said it.
      bertram angry: But I don't need a court to be afraid, lad. I am afraid. My oldest friend is paying the men who burned my villages, with silver stolen from my mines.
      bertram: I have written to the king's chamberlain in Prague. It will take a month for an answer. Harrow will not give us a month.
    `);
    if (flag('vilem_gone')) await talk(`
      bertram: And Vilém has fled. North, you say? Then Lothar knows what we know by now. God help us. Whatever he meant to do, he'll do it sooner.
    `);
    addMoney(40);
    notify('Sir Bertram rewards you with 40 groschen.', 'item');
    completeQuest('main_silver');
    if (qActive('side_miners')) {
      completeQuest('side_miners');
      remember('miners_paid');
      notify('Sir Bertram orders the Silverdale miners paid in full from the ledger\'s stolen silver.', 'quest', 6000);
    }
    S.rep.silverdale = (S.rep.silverdale ?? 20) + 25;
  });
}

// ---------------------------------------------------------------- Pavel's folly

async function pavelGone() {
  startQuest('main_pavel', 'gone');
  setFlag('pavel_prisoner');
  spawnCast();
  await conversation(async () => {
    await narrate('There\'s shouting in the castle yard. Sergeant Ondřej is bellowing at the stable boy, and the stable boy is crying.');
  });
}

async function overlook() {
  setStage('main_pavel', 'camp');
  await cutscene(async () => {
    G.cam.lockX = 168 * TILE; G.cam.lockY = 48 * TILE;
    forceMusic('tension');
    await wait(1.5);
    await talk(`
      > From the ridge you can see the whole camp: a palisade of sharpened stakes, black and red tents, horse lines, smoke. More men than you can count, and more coming and going on the Ravenstone road.
      > And there, by the horse lines, a wooden cage. Inside it, sitting in the dirt with his knees drawn up, is Pavel. A mercenary walks past and throws a turnip at him. Pavel throws it back.
      player: You idiot. You wonderful idiot.
    `);
    G.cam.lockX = null; G.cam.lockY = null;
    forceMusic(null);
  });
  tip('disguise', 'The Company\'s camp is guarded. Dressed as a camp servant, or in Company colours, you could walk in unchallenged. Change clothes in your inventory (<b>I</b>).', 9000);
}

let warned = 0;
async function trespass() {
  const near = here().filter((a) => a.tags.has('camp') && !a.dead && !a.mem.sleeping).sort((a, b) => Math.hypot(a.x - G.player.x, a.y - G.player.y) - Math.hypot(b.x - G.player.x, b.y - G.player.y))[0];
  if (!near) return;
  if (performance.now() - warned > 20000) {
    warned = performance.now();
    near.say(rand.pick(['Oi! Who are you? You\'re not one of ours!', 'Stranger in the camp! To arms!', 'Stop right there!']), 3);
    near.emoteShow('!', 2);
    notify('You have been seen in the Company\'s camp. Get out, or fight!', 'bad', 4000);
    return;
  }
  for (const a of here()) if (a.tags.has('camp') && !a.mem.sleeping) { a.hostile = true; a.mem.alerted = true; }
}

async function ilseSpots(fromTalk = false) {
  if (!qAt('main_pavel', 'camp')) return;
  const ilse = findActor('ilse');
  if (!ilse) return;
  await cutscene(async () => {
    ilse.face(G.player.x, G.player.y);
    await talk(`
      ilse: You. Put that water down. No, don't put it down, carry it, carry it and come here.
      > The cook is a square, fair woman with forearms like a blacksmith's and eyes the grey of a winter river.
      ilse: You're not one of my boys. My boys have lice and no front teeth. Who are you?
    `);
    const c = await choose([
      { id: 'truth', text: 'I\'m from Hollowbrook. The man in the cage is my friend.' },
      { id: 'lie', text: 'I\'m new. The quartermaster sent me.', check: { stat: 'speech', need: 5 } },
      { id: 'lida', text: 'My sister was brought here in a cart. Red braids. Her name is Lida.' },
    ]);
    if (c === 'lie' && lastCheck) await talk(`
      ilse smirk: The quartermaster can't count to four. He didn't send anybody. But you lie well, for a boy with a clean neck. Now tell me the truth.
    `);
    await talk(`
      player: I'm Radek's son. From Hollowbrook. My sister is Lida.
      > Ilse goes very still. Then she sits down on a sack of turnips, quite suddenly, as if her knees have stopped holding her up.
      ilse tender: Lida. Oh. Oh, she said you'd come. Every night she said it. "My brother will come. He's slow, but he comes."
    `);
    await talk(`
      ilse: She was here nine days. I fed her. I taught her to write her name. Then Dieter sent her up to the castle, to Ravenstone, to Sir Lothar's kitchens. Old Berta cooks there. Berta is kind. It's the best place she could be, God forgive me for saying it.
      ilse: She left this. For you. She said, "Give it to my brother, so he knows I'm clever."
      > A scrap of board with charcoal on it: four stick figures, one tall, one wide, one small, one very small, and a dog. Underneath, in large careful letters: L I D A.
    `);
    addItem('lida_drawing', 1);
    sting('sad');
    addBuff('hope', 3 * 1440);
    await talk(`
      ilse: I had a daughter. Gretl. She had the fever last winter, in a camp like this one, on the Danube. She was seven.
      ilse: I have cooked for this Company for eleven years. I've watched them burn a great many villages. I've never helped anyone. Not once. I think I'd like to.
      ilse: Listen. I serve the evening stew at dusk. Put this in the pot and every man who eats it will sleep like a baby till cock-crow. Then go to the cage. It's a cheap lock. Can you pick a lock?
    `);
    if (!has('valerian_draught')) { addItem('valerian_draught', 1); await narrate('She presses a small bottle of valerian draught into your hand, from her own stores. "For my bad nights," she says. "I have a great many bad nights."'); }
    if (!has('lockpick')) { addItem('lockpick', 3); await narrate('And three bent bits of wire. "My late husband\'s. He was a terrible husband and a wonderful thief."'); }
    await talk(`
      ilse: And take this, too. I drew it for somebody, someday. I didn't know who.
      > A plan of Ravenstone, drawn in charcoal on the back of a flour-merchant's bill. The gate, the towers, the kitchens, a little door marked POSTERN.
    `);
    addItem('ravenstone_plan', 1);
    addRel('ilse', 8);
    setStage('main_pavel', 'ilse');
  });
  void fromTalk;
}

async function stewpot() {
  if (!qAt('main_pavel', 'ilse', 'camp') || flag('camp_drugged') || flag('camp_poisoned')) {
    await conversation(async () => { await narrate('A great iron pot of stew: barley, turnips and something that might once have been a sheep.'); });
    return;
  }
  await conversation(async () => {
    await narrate('The evening stew bubbles in the great iron pot. Ilse is carefully not looking at you.');
    const c = await choose([
      { id: 'sleep', text: '[Pour in the Valerian Draught]', if: () => has('valerian_draught') },
      { id: 'poison', text: '[Pour in the Nightshade]', if: () => has('nightshade') },
      { id: 'no', text: '[Leave it]' },
    ]);
    if (c === 'sleep') {
      removeItem('valerian_draught');
      setFlag('camp_drugged');
      S.flags.drug_day = Math.floor((S.minutes - 5 * 60) / 1440);
      await narrate('The draught vanishes into the stew without a trace. Ilse stirs it, twice, and tastes it, and nods.');
      await say('ilse', 'neutral', 'After dark, when the fires are low. They\'ll snore like a choir of bears. Go to the cage then.');
      remember('camp_drugged');
    } else if (c === 'poison') {
      await talk(`
        ilse angry: What is that? Give me that. That's nightshade. I can smell it from here.
        ilse: Not in my pot. Not poison. There are boys in this camp younger than you who've never burned anything but their fingers. I'll not be a poisoner, not even for Lida.
      `);
      const c2 = await choose([
        { id: 'sorry', text: 'You\'re right. I\'m sorry.' },
        { id: 'do', text: '[Push her aside and pour it in anyway]' },
      ]);
      if (c2 === 'do') {
        removeItem('nightshade');
        setFlag('camp_poisoned');
        S.flags.drug_day = Math.floor((S.minutes - 5 * 60) / 1440);
        addRel('ilse', -20);
        remember('poisoned_camp');
        await talk(`
          > You pour it in. Ilse makes a sound you will hear for a long time afterwards.
          ilse cry: God forgive you. God forgive us both. Take your friend and go, and never come near me again.
        `);
      }
    }
  });
}

async function cage() {
  const pavel = findActor('pavel');
  const drugged = flag('camp_drugged') && isDruggedNight();
  const poisoned = flag('camp_poisoned');
  const watched = !drugged && !poisoned && here().some((a) => a.tags.has('camp') && !a.dead && !a.mem.sleeping && Math.hypot(a.x - G.player.x, a.y - G.player.y) < 120);
  if (watched) {
    await conversation(async () => { await narrate('Too many eyes. There are guards within a stone\'s throw, wide awake. You\'d be seen before the lock gave.'); });
    return;
  }
  let how = '';
  await conversation(async () => {
    await narrate('The cage is shut with a cheap iron padlock. Pavel watches you through the bars, hardly breathing.');
    how = await choose([
      { id: 'pick', text: '[Pick the lock]', if: () => has('lockpick') },
      { id: 'smash', text: '[Break the padlock with a hard blow]', check: { stat: 'strength', need: 4 }, if: () => drugged || poisoned },
      { id: 'leave', text: '[Leave it for now]' },
    ]);
    if (how === 'smash' && !lastCheck) { await narrate('You hit it with everything you have. The padlock only dents. Pavel winces at the noise. Nobody stirs, thank God.'); how = ''; }
    else if (how === 'smash') await narrate('One blow, two. On the third the hasp snaps, loud as a church bell in the quiet. Nobody stirs. Ilse\'s stew has seen to that.');
  });
  if (how === 'pick') { const ok = await lockpick(2); if (!ok) return; }
  else if (how !== 'smash') return;
  setFlag('pavel_freed');
  setStage('main_pavel', 'escape');
  await cutscene(async () => {
    if (pavel) { pavel.mem.hold = false; pavel.pose = 'idle'; pavel.tags.delete('prisoner'); }
    if (poisoned) await narrate('The camp is quiet, horribly quiet. Men lie where they fell around the cooking fires. Some of them are very young.');
    else if (drugged) await narrate('All around the camp, men are snoring by the fires, bowls still in their laps.');
    await talk(`
      pavel: {name}. I... thank you. I thought I'd die in there. I thought it was what I deserved.
      player: Later. Walk. Don't run. Don't look at anyone.
    `);
  });
  spawnCast();
  const pv = findActor('pavel');
  if (pv) { pv.mem.follow = 'player'; pv.faction = 'ally'; pv.mem.hold = false; }
}

async function escaped() {
  await cutscene(async () => {
    const pv = findActor('pavel');
    if (pv) pv.face(G.player.x, G.player.y);
    await talk(`
      > You don't stop until the camp is a smudge of smoke behind the ridge. Then Pavel sits down in the heather and puts his face in his hands.
      pavel cry: They laughed at me. I rode in shouting, sword up, like in Havel's stories. They pulled me off the horse with a hook. They didn't even bother to hit me very hard.
      pavel: And the children, {name}. I saw them. Hauling water. Mucking the horses. Little Jana from Lhota, carrying a bucket bigger than she is. And I couldn't do anything. I couldn't do one thing.
    `);
    const c = await choose([
      { id: 'brave', text: 'You went. Nobody else did. That counts for something.' },
      { id: 'fool', text: 'You nearly got yourself killed for nothing, you fool.' },
      { id: 'sit', text: '[Sit beside him]' },
    ]);
    if (c === 'brave') await say('pavel', 'sad', '...Does it? I don\'t know what it counts for. Ask me when I stop shaking.');
    else if (c === 'fool') await say('pavel', 'sad', 'I know. I know. Say it again. I deserve it.');
    else await narrate('You sit beside him in the heather. After a while, his shoulder leans against yours. You stay like that until the shaking stops.');
    addRel('pavel', 4);
    if (flag('camp_poisoned')) await talk(`
      pavel worried: The camp... all those men, lying there. That was you? That was...
      > He doesn't finish. He doesn't look at you for a long while after that.
    `);
    await talk(`
      pavel: Let's go home. Linden Hill, I mean. I haven't got a home. Neither of us has. Let's go to Linden Hill.
    `);
    if (pv) { pv.mem.follow = null; pv.faction = 'town'; }
  });
  setFlag('pavel_prisoner', false);
  setStage('main_pavel', 'report');
  spawnCast();
}

async function pavelReport(a: Actor) {
  await cutscene(async () => {
    a.face(G.player.x, G.player.y);
    await talk(`
      bertram: So. The prodigal returns, with his rescuer. Pavel, you're a disgrace to my garrison, and if you ever take one of my horses again I'll have you whipped.
      bertram tender: ...And you'll never know how glad I am to see you breathing.
      pavel sad: Yes, my lord. Thank you, my lord.
      bertram: And you, {name}. The Company's camp. You walked in and out of Harrow's camp in a servant's smock.
    `);
    if (has('ravenstone_plan')) await talk(`
      player: The cook there gave me this. Ilse. It's Ravenstone. Every wall, and a postern gate. She says my sister is in the castle kitchens.
      bertram: A cook from the Company's own train? Then even the Company's kitchen knows where its silver comes from.
    `);
    await talk(`
      bertram worried: But listen to me. Harrow will not let this go. A man escapes his camp, it makes him look weak, and a company that looks weak doesn't get paid. He'll answer it. He'll answer it with fire, and the nearest thing to hand.
      bertram: The crossroads. A hundred people with no walls and no watch.
    `);
  });
  completeQuest('main_pavel');
}

// ---------------------------------------------------------------- the Raven's Feast

async function feastWarning() {
  startQuest('main_feast', 'warn');
  await conversation(async () => {
    await talk(`
      ondrej: Lad! Sir Bertram's orders. Every man who can hold a spear rides to the crossroads tonight. I'll be there. So will Pavel, God help us. Go on ahead, and tell them to be ready.
    `);
  });
}

async function feastArrive() {
  await cutscene(async () => {
    const jiri = findActor('jiri');
    if (jiri) jiri.face(G.player.x, G.player.y);
    await talk(`
      jiri worried: Soldiers? Tonight? God in heaven. We've nothing. We've carts and cooking pots and old women.
      player: Then we use the carts. Pull them into a ring. Put the children and the old in the middle. Anyone who can swing something stands in the gaps.
      jiri: ...You sound like your father, when the mill-dam broke. Very well. Very well! Carts! Everyone! Carts!
    `);
    const v = findActor('vojta');
    if (v && !S.deadNpcs.vojta) await talk(`
      vojta: I'll stand in a gap. I've no sword, mind. I've a frying pan. It's seen worse than soldiers. It's seen my cooking.
    `);
  });
  setStage('main_feast', 'wait');
  tip('wait2', 'Press <b>T</b> to wait until nightfall. Make sure you are ready: bandages, food, a sharp blade.', 7000);
}

async function feastBattle() {
  setStage('main_feast', 'battle');
  const C = (dx: number, dy: number) => ({ x: (122 + dx) * TILE + 8, y: (131 + dy) * TILE + 12 });
  // allies
  const allies: Actor[] = [];
  const ond = findActor('ondrej');
  if (ond) { put(ond, 'overworld', 120, 127, 3); ond.faction = 'ally'; ond.mem.schedule = undefined; ond.mem.enemies = ['harrow']; allies.push(ond); }
  const pv = findActor('pavel');
  if (pv) { put(pv, 'overworld', 124, 127, 3); pv.faction = 'ally'; pv.mem.schedule = undefined; pv.mem.enemies = ['harrow']; pv.combat.weapon = { id: 'arming_sword', kind: 'sword', slash: 26, stab: 21, blunt: 5, reach: 23, speed: 1.05, staminaCost: 13 }; allies.push(pv); }
  for (let i = 0; i < 3; i++) {
    const g = person('overworld', C(-4 + i * 4, -3).x, C(0, -3).y, { role: 'guard', seed: 950 + i, tags: ['quest'] });
    g.faction = 'ally'; g.mem.enemies = ['harrow']; g.mem.wander = 0; allies.push(g);
  }
  await cutscene(async () => {
    forceMusic('tension');
    G.cam.lockX = 122 * TILE; G.cam.lockY = 124 * TILE;
    await talk(`
      > Midnight. The fires are banked. Behind the ring of carts, a hundred people pretend to sleep.
      > Then, on the road from the north: torches. Twenty. Thirty. And the sound of horses, which you will never again hear without your heart turning over.
      ondrej: Here they come. Shields up, you farmers! Nobody runs! Nobody!
    `);
    G.cam.lockX = null; G.cam.lockY = null;
  });
  forceMusic('battle');
  const raiders: Actor[] = [];
  const spots: [number, number][] = [[-6, -12], [-2, -13], [2, -12], [6, -13], [-4, -15], [4, -15], [0, -16], [8, -11]];
  spots.forEach(([dx, dy], i) => {
    const r = fighter('overworld', C(dx, dy).x, C(dx, dy).y, i === 6 ? 'merc_heavy' : i === 7 ? 'archer' : 'merc', { id: 'feastraider' + i, tags: ['quest', 'feastraid'], hostile: true, seed: 3100 + i, name: i === 6 ? 'Ulrich the Red' : undefined });
    r.mem.aggroRange = 400; r.mem.alerted = true; r.mem.enemies = ['ally', 'villager', 'refugees'];
    if (i === 6) { r.mem.boss = true; r.maxHp = r.hp = 200; r.mem.skill = 7; }
    raiders.push(r);
  });
  // the deserters keep their word
  if (flag('deserters_allied')) setTimeout(() => {
    const j = findActor('jirka');
    for (let i = 0; i < 3; i++) {
      const d = fighter('overworld', C(-14, -6 + i * 2).x, C(-14, 0).y, 'deserter', { id: 'feastdes' + i, tags: ['quest'], hostile: false, seed: 3200 + i });
      d.faction = 'ally'; d.mem.enemies = ['harrow'];
    }
    if (j) { put(j, 'overworld', 108, 127, 2); j.faction = 'ally'; j.mem.enemies = ['harrow']; j.mem.schedule = undefined; }
    notify('Jirka One-Ear and his deserters come out of the dark, shouting!', 'quest', 5000);
  }, 25000);
  let down = false;
  const off = protectPlayer(() => { down = true; });
  await waitUntil(() => down || raiders.every((r) => r.dead || r.mem.down || r.surrendered || r.hidden || r.mapId !== 'overworld'), 600);
  off();
  for (const r of raiders) if (!r.dead) { r.hostile = false; flee(r, G.player, 15); r.mem.despawnOnFlee = true; }
  await feastAftermath(down);
}

async function feastAftermath(playerFell: boolean) {
  await cutscene(async () => {
    forceMusic('sorrow');
    if (playerFell) await narrate('You go down under a mercenary\'s boot, and for a while the world is mud and noise. When you get up, the noise is different. The raiders are running. Ondřej is roaring at their backs.');
    await talk(`
      > It is over. The raiders are gone back into the dark, those that can still go anywhere. Carts are burning. Someone is screaming for a surgeon. Someone else is laughing, high and wild, the way people laugh when they have lived through something they should not have.
    `);
    const vojta = findActor('vojta');
    if (vojta && !S.deadNpcs.vojta) {
      put(vojta, 'overworld', 121, 133, 0);
      vojta.pose = 'lie';
      vojta.mem.hold = true;
      await talk(`
        > Vojta is lying by the ring of carts with Little Marek in his arms. The boy is unhurt. Vojta is not.
        marek cry: He jumped in front of me. The man had a spear and Vojta jumped in front of me. With a frying pan.
        vojta pain: ♪ ...Oh the miller's wife had a wooden leg... ♪
        vojta pain: I never... I never finished that song, you know. It hasn't got an ending. I kept meaning to make one up.
      `);
      const c = await choose([
        { id: 'end', text: 'Then I\'ll finish it for you, Vojta. I promise.' },
        { id: 'hand', text: '[Hold his hand]' },
      ]);
      if (c === 'end') {
        remember('promised_vojta_song');
        await talk(`
          vojta tender: Make it... a happy one. The miller's wife. Let her dance.
        `);
      }
      await talk(`
        vojta: Tell your father... no. You can't, can you. I'll tell him myself. Three groschen. I'll pay him. Eventually. In the fullness of...
        > He doesn't finish that either.
      `);
      vojta.dead = true; vojta.pose = 'dead'; S.deadNpcs.vojta = true;
      remember('vojta_died');
      sting('sad');
    }
    await fadeTo(1, 2);
    skipTo(8, false);
    for (const a of [...here()]) if (a.tags.has('feastraid') && a.dead) removeActor(a);
    await fadeTo(0, 1.5);
    await talk(`
      > In the morning, Sir Bertram rides down to the crossroads with every man he has left. He walks the camp on foot. He speaks to everyone. He helps dig the graves himself, with his own hands, in his good cloak.
      bertram: Come to the hall this evening, {name}. There is something I must do, and I should like to do it properly.
    `);
  });
  setStage('main_feast', 'after');
  spawnCast();
}

async function knighting(a: Actor) {
  await cutscene(async () => {
    forceMusic('priory');
    const p = P();
    put(a, 'lh_keep', 8, 5, 0);
    put(p, 'lh_keep', 8, 7, 3);
    G.cam.lockX = a.x; G.cam.lockY = a.y + 12;
    await talk(`
      > The great hall is full. Townsfolk, guards, refugees in borrowed clothes. Pavel, with a bandage round his head. Ondřej, scowling at everyone to hide something that is almost a smile.
    `);
    if (!flag('mother_dead')) await talk(`
      > Mother is there, near the front, in a clean apron. She has flour on her cheek. Nobody has told her.
    `);
    await talk(`
      bertram: Kneel.
      > You kneel. The flagstones are cold through your hose.
      bertram: Two summers ago, I buried my only son. I did not think I would ever again look at a young man and feel proud of him.
      bertram: This young man is the son of Radek the smith. He has walked into Harrow's camp and out again with his friend on his arm. He found the stolen silver. He held the crossroads. He has done everything I asked, and several things I specifically told him not to.
      > Laughter. Pavel laughs loudest.
    `);
    const has_sword = has('fathers_sword');
    await talk(`
      > Sir Bertram draws his sword${has_sword ? '. Then he stops, and looks at the sword at your side, and puts his own back in its scabbard. "May I?" he says. You give him your father\'s blade' : ''}.
      > He lays the flat of it on your right shoulder, then your left.
      bertram: Be brave, that God may love you. Be true, that men may trust you. Be kind, that the weak may not fear you.
      bertram: Rise, Sir {name} of Hollowbrook.
    `);
    sfx('bell');
    setFlag('knighted');
    remember('knighted');
    await talk(`
      > The hall roars. Pavel whoops like a boy at a fair. Somebody is crying, and it takes you a moment to understand that it is you.
    `);
    if (!flag('mother_dead')) await talk(`
      marta tender: Your father would say "not bad". And then he'd go outside and walk around the yard three times, so nobody would see his face.
    `);
    await talk(`
      bertram: And now, Sir {name}, we go to war. Tomorrow I send my challenge to Ravenstone. Lothar will not answer it. So we will need an army.
    `);
  });
  addItem('linden_tabard', 1);
  addItem('kettle_hat', 1);
  addMoney(100);
  notify('You are given a <b>Linden Tabard over Mail</b>, a <b>Kettle Hat</b> and 100 groschen.', 'item', 6000);
  completeQuest('main_feast');
  await startAct3();
}

