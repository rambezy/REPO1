// Act III: Ravenstone. Banners, a mercenary's price, the siege, the man in
// the black helm, a lord who sold his friends, and a little girl in a kitchen.
// Then the epilogue, which remembers everything.

import { G } from '../../G';
import { S, flag, setFlag, hourF } from '../../state';
import { Actor } from '../../world/actor';
import { findActor, getMap, removeActor, here, actors } from '../../world/world';
import { defineQuest, startQuest, setStage, completeQuest, failQuest, qAt, qActive, qDone, qFailed } from '../../systems/quests';
import { say, talk, narrate, choose, cutscene, conversation, wait, hold, lastCheck } from '../../systems/script';
import { addItem, removeItem, has, addMoney, disguise } from '../../systems/inventory';
import { addXp, addBuff, skill } from '../../systems/stats';
import { notify } from '../../ui/notify';
import { sfx, sting } from '../../audio/sfx';
import { card, slides } from '../../ui/cine';
import { on } from '../../engine/events';
import { forceMusic } from '../../systems/director';
import { walkTo, flee } from '../../systems/ai';
import { TILE, rand } from '../../engine/util';
import { fadeTo, travel } from '../../systems/transition';
import { lockpick } from '../../ui/minigames/lockpick';
import { kill } from '../../systems/combat';
import { crumbJoins } from '../../systems/companion';
import { makeCanvas } from '../../gfx/pixel';
import { trigger, topic, greet, waitUntil, put, putAt, nearTile, onMap, regionIs, protectPlayer, addRel, rel, remember, chose, tip, P, canRunScene, decor, markerObj, hostiles, readAndWait, refreshDecor, skipTo, setHollowbrook } from './lib';
import { spawnCast, castHooks, npc, fighter, person, OW, always, ACT, at } from './cast';

// ---------------------------------------------------------------- allies

interface Ally { id: string; name: string; can: () => boolean; hint: string; who: string }
const ALLIES: Ally[] = [
  { id: 'miners', name: 'The miners of Silverdale', who: 'kuba', can: () => !!chose('miners_paid') || qDone('side_miners'), hint: 'Their wages must be paid first (The Silver Road).' },
  { id: 'burners', name: 'The charcoal burners', who: 'tomas_burner', can: () => qDone('side_charcoal'), hint: 'Black Tomáš lost his boy in the woods.' },
  { id: 'deserters', name: 'Jirka\'s deserters', who: 'jirka', can: () => !!flag('deserters_allied'), hint: 'Only if you spared Jirka and asked for his help.' },
  { id: 'hunters', name: 'Matěj\'s hunters', who: 'matej', can: () => qDone('side_wolves'), hint: 'Matěj has a wolf problem.' },
  { id: 'priory', name: 'The brothers of St. Aldhelm\'s', who: 'gregor', can: () => qDone('side_bell'), hint: 'The priory bell has been silent since its clapper was stolen.' },
];
export const allyCount = () => ALLIES.filter((a) => flag('ally_' + a.id)).length;

export function registerAct3() {
  defineQuest({
    id: 'main_allies', title: 'Banners', kind: 'main', act: 'Act III',
    summary: 'Sir Bertram has forty men. Lothar has a castle and Harrow\'s Company. Find more.',
    stages: {
      gather: {
        obj: 'Rally allies for the assault on Ravenstone, then report to Sir Bertram.',
        get optional() {
          return [
            ...ALLIES.map((a) => (flag('ally_' + a.id) ? '✓ ' : a.can() ? '· ' : '✗ ') + a.name + (flag('ally_' + a.id) || a.can() ? '' : ` (${a.hint})`)),
            (flag('harrow_left') ? '✓ ' : '· ') + 'Optional: parley with Captain Harrow under a flag of truce',
          ];
        },
        marker: () => ALLIES.filter((a) => !flag('ally_' + a.id) && a.can()).map((a) => ({ actor: a.who })),
        entry: 'Lothar has not answered Sir Bertram\'s challenge. His gates are shut and Harrow\'s Company is camped under his walls. Sir Bertram says forty men cannot take a castle. He is right. I have made friends in this valley, and some of them owe me a favour.' },
      done: { entry: 'Our banners are gathered. Tomorrow, Ravenstone.' },
    },
  });
  defineQuest({
    id: 'main_harrow', title: "The Captain's Price", kind: 'side', act: 'Act III',
    summary: 'Harrow is a mercenary. Mercenaries can be bought, or persuaded that they are about to lose money.',
    stages: {
      start: { obj: 'Go to the war camp under a flag of truce and speak with Captain Harrow.', marker: { actor: 'harrow' },
        entry: 'Ilse says Captain Harrow is a merchant who happens to sell killing. If he believed Lothar\'s cause was lost, or that his pay would not come, he might simply leave. Sir Bertram has given me a white cloth and his leave to try.' },
      done: { entry: 'Harrow is gone, and his Company with him. Only Dieter stayed. Of course Dieter stayed.' },
      failed: { entry: 'Harrow would not be bought or persuaded. The Company will stand with Lothar.' },
    },
  });
  defineQuest({
    id: 'main_siege', title: 'Ravenstone', kind: 'main', act: 'Act III',
    summary: 'The castle on the black crag, and everything this has been for.',
    stages: {
      march: { obj: 'Join Sir Bertram\'s army before the walls of Ravenstone.', marker: { map: 'overworld', x: 194, y: 40 } },
      gate: { obj: 'Break the gate!', marker: { map: 'overworld', x: 194, y: 31 } },
      postern: {
        obj: 'Slip in through the postern gate on the east wall, and open the main gate from inside.',
        optional: ['Ilse\'s plan: "one guard, drinks"', 'The gate winch is inside the gatehouse, by the south gate'],
        marker: () => (flag('postern_in') ? { map: 'overworld', x: 194, y: 29 } : { map: 'overworld', x: 207, y: 23 }),
      },
      bailey: { obj: 'Fight through the bailey.', marker: { map: 'overworld', x: 194, y: 23 } },
      dieter: { obj: 'The man in the black helm.', marker: { actor: 'dieter' } },
      hall: { obj: 'Enter the hall. Sir Lothar is waiting.', marker: { map: 'overworld', x: 194, y: 20 } },
      lida: { obj: 'Find Lida. The kitchens are through the hall.', marker: () => (onMap('rv_kitchen') ? { actor: 'lida' } : { map: 'rv_hall', x: 1, y: 12 }) },
      done: { entry: 'Lida.' },
    },
  });

  registerTalks();
  registerScenes();
  registerCast();
  registerDecor();
}

// ---------------------------------------------------------------- Act III begins

export async function startAct3() {
  setFlag('act', 3);
  spawnCast();
  await card('Ravenstone', 'Act III', '', { secs: 5, bg: '#000' });
  startQuest('main_allies', 'gather', true);
  startQuest('main_harrow', 'start', true);
  notify('Rally your allies across the valley. The journal (<b>B</b>) shows who might answer your call.', 'quest', 7000);
}

// ---------------------------------------------------------------- cast

function registerCast() {
  castHooks.push(() => {
    const act = ACT();
    if (act < 3) return;
    // Ravenstone's garrison and its lord
    if (!qDone('main_siege')) {
      npc('lothar', at('rv_hall', 'throne'), always(at('rv_hall', 'throne'), 'sit', { dir: 0 }), { faction: 'lothar', skill: 6, hp: 160, weapon: 'longsword', armor: { slash: 16, stab: 12, blunt: 8 } });
      npc('rupert', at('rv_hall', 'hall'), always(at('rv_hall', 'hall'), 'stand', { dir: 3 }), { faction: 'lothar', essential: false, hp: 60 });
      npc('berta', at('rv_kitchen', 'hearth'), always(at('rv_kitchen', 'hearth'), 'work', { dir: 3 }), { faction: 'lothar' });
      const l = npc('lida', at('rv_kitchen', 'lida'), always(at('rv_kitchen', 'lida'), 'sit', { dir: 1 }), { faction: 'villager' });
      if (l) l.mem.hold = true;
      if (!flag('dieter_done')) {
        const d = npc('dieter', OW(194, 23), always(OW(194, 23), 'stand', { dir: 0 }), { faction: 'lothar', skill: 9, hp: 320, weapon: 'black_sword', armor: { slash: 26, stab: 20, blunt: 12 }, essential: true });
        if (d) { d.mem.boss = true; d.mem.noSurrender = true; d.mem.nonlethal = true; }
      }
      if (!qAt('main_siege', 'bailey', 'dieter', 'hall', 'lida')) {
        // the garrison on the walls and in the bailey
        const posts: [number, number][] = [[190, 29], [198, 29], [186, 22], [202, 22], [194, 26], [191, 16], [199, 16], [203, 23]];
        posts.forEach(([x, y], i) => {
          if (flag('rvguard_dead_' + i)) return;
          const g = fighter('overworld', x * TILE + 8, y * TILE + 12, i % 3 === 2 ? 'archer' : 'lothar_guard', { id: 'rvguard' + i, hostile: false, tags: ['quest', 'rvguard', 'siege'], seed: 4000 + i });
          g.mem.wander = 20;
          g.mem.watch = true;
          if (i === 7) { g.name = 'Postern Guard'; g.mem.drunk = true; g.mem.sight = 60; g.pose = 'sit'; }
        });
      }
    }
    // allies camp under Ravenstone once gathered
    if (qAt('main_siege', 'march', 'gate', 'postern')) {
      npc('bertram', OW(193, 41), always(OW(193, 41), 'stand', { dir: 3 }), { faction: 'ally', skill: 7, hp: 200, weapon: 'longsword' });
      npc('ondrej', OW(195, 41), always(OW(195, 41), 'stand', { dir: 3 }), { faction: 'ally', skill: 8, hp: 200, weapon: 'arming_sword' });
      if (!flag('pavel_dead')) npc('pavel', OW(191, 42), always(OW(191, 42), 'stand', { dir: 3 }), { faction: 'ally', skill: 5, hp: 140, weapon: 'arming_sword' });
    }
  });
  on('kill', (a: Actor) => { const m = /^rvguard(\d)$/.exec(a.id); if (m) setFlag('rvguard_dead_' + m[1]); });
  // after the war: everyone home in Hollowbrook
  castHooks.push(() => {
    if (ACT() < 4) return;
    const home = (sp: string) => at('hb_home', sp);
    if (!flag('mother_dead')) npc('marta', null, [sched4(4.5, 12, home('oven'), 'work', 3), sched4(12, 19, OW(41, 103), 'wander', 0, 24), sched4(19, 22, home('table_n'), 'stand', 0), sched4(22, 4.5, home('bed_marta'), 'sleep', 0)], { merchant: 'mother_bread' });
    npc('lida', null, [sched4(7, 20, OW(40, 102), 'wander', 0, 60), sched4(20, 7, home('bed_lida'), 'sleep', 0)]);
    if (!flag('pavel_dead')) npc('pavel', null, [sched4(6, 19, at('hb_mill', 'stone'), 'work', 3), sched4(19, 23, at('hb_tavern', 'seat2'), 'drink', 3), sched4(23, 6, at('hb_mill', 'bed'), 'sleep', 0)]);
    npc('hanka', null, [sched4(7, 19, OW(38, 111), 'sit', 0), sched4(19, 7, at('hb_hanka', 'bed'), 'sleep', 0)]);
    npc('jiri', null, [sched4(7, 19, OW(44, 101), 'wander', 0, 40), sched4(19, 7, at('hb_jiri', 'bed'), 'sleep', 0)]);
    npc('bara', null, [sched4(6, 19, OW(48, 109), 'wander', 0, 20), sched4(19, 6, at('hb_bara', 'bed'), 'sleep', 0)]);
    npc('marek', null, [sched4(7, 19, OW(40, 102), 'wander', 0, 60), sched4(19, 7, at('hb_bara', 'wheel'), 'sleep', 0)]);
    npc('tobiah', null, [sched4(8, 19, at('hb_chapel', 'altar'), 'pray', 3), sched4(19, 8, at('hb_chapel', 'pew'), 'sleep', 0)]);
    if (flag('miko_adopted')) npc('miko', null, [sched4(7, 20, OW(42, 104), 'wander', 0, 50), sched4(20, 7, home('center'), 'sleep', 0)]);
  });
}

function sched4(from: number, to: number, w: { map: string; x: number; y: number }, act: 'work' | 'wander' | 'stand' | 'sleep' | 'sit' | 'drink' | 'pray', dir = 0, r = 0) {
  return { from, to, map: w.map, x: w.x, y: w.y, act, dir, r };
}

// the castle gate: a heavy door in the south wall until it is opened
function gateSprite() {
  const c = makeCanvas(64, 40);
  const x = c.getContext('2d')!;
  x.fillStyle = '#2a1c12'; x.fillRect(0, 0, 64, 40);
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#4a3220' : '#553a26'; x.fillRect(i * 8, 2, 8, 38); }
  x.fillStyle = '#6b6b73';
  for (const y of [8, 20, 32]) x.fillRect(0, y, 64, 3);
  for (let i = 4; i < 64; i += 8) for (const y of [9, 21, 33]) { x.fillStyle = '#9a9aa2'; x.fillRect(i, y, 1, 1); }
  x.fillStyle = '#1a120c'; x.fillRect(31, 2, 2, 38);
  return { canvas: c, ox: 32, oy: 40, w: 64, h: 40 };
}

function registerDecor() {
  decor({
    key: 'rv_gate', map: 'overworld', when: () => !flag('rv_gate_open') && !qDone('main_siege'),
    make: () => ({ kind: 'prop', type: 'gate', x: 194 * TILE, y: 32 * TILE, sprite: gateSprite(), solid: { x: 192 * TILE, y: 31 * TILE, w: 64, h: 16 }, interact: { type: 'script', script: 'rv_gate', label: 'The gate of Ravenstone' } }),
  });
  decor({ key: 'rv_winch', map: 'overworld', when: () => !flag('rv_gate_open') && !qDone('main_siege'), make: () => markerObj(191, 30, { type: 'script', script: 'rv_winch', label: 'The gate winch' }) });
}

// ---------------------------------------------------------------- scenes

function registerScenes() {
  on('script:rv_gate', () => conversation(async () => {
    await narrate(qAt('main_siege', 'gate') ? 'Oak a hand thick, bound with iron. Arrows thud into it around you.' : 'The great gate of Ravenstone: oak and iron, shut tight. Somebody on the wall is watching you.');
  }));
  on('script:rv_winch', () => openGateFromInside());
  trigger('a3_march', () => qAt('main_siege', 'march') && nearTile(194, 40, 7), () => councilOfWar());
  trigger('a3_postern_in', () => qAt('main_siege', 'postern') && onMap('overworld') && regionIs('ravenstone') && G.player.x > 200 * TILE && G.player.y < 26 * TILE, () => { setFlag('postern_in'); tip('sneak', 'Crouch (<b>Ctrl</b> or <b>X</b>) to move quietly. Stay out of the guards\' sight, and out of the torchlight.'); });
  trigger('a3_bailey_clear', () => qAt('main_siege', 'bailey') && hostiles('siege').length === 0, () => dieterDuel());
  trigger('a3_hall', () => qAt('main_siege', 'hall') && onMap('rv_hall'), () => lotharScene());
  trigger('a3_kitchen', () => qAt('main_siege', 'lida') && onMap('rv_kitchen'), () => lidaReunion());
  on('read:lothar_letter', () => { setFlag('read_lothar_letter'); });
}

function registerTalks() {
  // allies
  for (const al of ALLIES) {
    topic(al.who, {
      id: 'a3_rally', text: `Will you fight with us at Ravenstone?`, if: () => qAt('main_allies', 'gather') && !flag('ally_' + al.id) && al.can(),
      run: async () => { await rally(al); },
    });
  }
  topic('bertram', {
    id: 'a3_ready', text: 'Our allies are gathered, my lord. We\'re ready.', if: () => qAt('main_allies', 'gather'),
    run: async (a) => { await bertramReady(a); return 'end'; },
  });
  greet('bertram', async (a) => {
    if (ACT() === 3 && qAt('main_allies', 'gather')) await say(a, 'neutral', `Sir {name}. How goes the gathering? We have ${allyCount()} banner${allyCount() === 1 ? '' : 's'} beside our own.`);
    else await say(a, 'neutral', 'Yes? Speak, lad. Sir {name}, I should say. I haven\'t the patience for bowing today.');
  });
  // Harrow
  topic('harrow', {
    id: 'a3_parley', auto: true, text: '', if: () => qAt('main_harrow', 'start'),
    run: async (a) => { await harrowParley(a); return 'end'; },
  });
  greet('harrow', async (a) => { await say(a, 'smirk', 'Ah. The smith\'s son. We keep meeting in such unpleasant places.'); });
  // Lida and the cook, in case the reunion is interrupted
  greet('berta', async (a) => { await say(a, 'worried', 'Don\'t hurt her. Whoever you are, don\'t you touch that child.'); });
}

async function rally(al: Ally) {
  switch (al.id) {
    case 'miners':
      await talk(`
        kuba: Fight? For Sir Bertram? He paid us, you know. Every penny Vilém stole, back in our hands, with a barrel of beer on top.
        kuba: We're not soldiers. But we can dig. We can dig under a wall, or knock a gate off its hinges with a mine-hammer. Twelve of us. Tell your lord Silverdale remembers who paid its wages.
      `);
      addItem('guild_seal', 1);
      break;
    case 'burners':
      await talk(`
        tomas_burner: You brought back my boy. You ask, and the burners come. All of us, with axes, and pitch, and fire if you want fire.
        tomas_burner: We know how to make a gate burn. We know it better than anyone.
      `);
      break;
    case 'deserters':
      await talk(`
        jirka: So. The smith's boy comes to collect. Took you long enough.
        jirka smirk: Four of us, and we know how Harrow's men fight, which is more than your lord's farmers do. And I want to see Dieter's face. I told you that.
      `);
      setFlag('deserters_rallied');
      break;
    case 'hunters':
      await talk(`
        matej: You cleared the wolf den when nobody else would. My boys and I owe you.
        matej: Six bows. We'll put arrows on the walls so thick the guards'll think it's raining. Just tell us where.
      `);
      break;
    case 'priory':
      await talk(`
        gregor: Our bell rang again because of you. It rang the morning after you brought the clapper home, for the first time since Lent. Some of the brothers wept.
        gregor: We are men of peace. We will not fight. But we will ring the bell of St. Aldhelm's when you march, so the whole valley hears it, and we will come behind you with bandages and the sacrament. Brother Tobiah insists on coming. I could not stop him if I tried.
      `);
      break;
  }
  setFlag('ally_' + al.id);
  remember('ally_' + al.id);
  sfx('quest');
  notify(`<b>${al.name}</b> will march with you.`, 'quest', 4500);
}

async function bertramReady(a: Actor) {
  const n = allyCount();
  await talk(`
    bertram: ${n === 0 ? 'None? No one? God help us. Then it will be forty men against a castle, and I will lead them myself.' : n < 3 ? 'It is something. It is more than I had. God bless them for it.' : 'By God. By God, lad, you\'ve raised the whole valley.'}
  `);
  if (flag('harrow_left')) await talk(`
    bertram: And Harrow gone! Half of Lothar's strength marched away in a morning. I don't know what you said to him, and I don't want to.
  `);
  await talk(`
    bertram: We march at dawn. Meet me on the road below Ravenstone crag, where it comes out of the trees. Rest first. Eat. Say whatever prayers you know.
  `);
  const c = await choose([
    { id: 'now', text: 'I\'m ready now, my lord.' },
    { id: 'wait', text: 'I have things to settle first.' },
  ]);
  completeQuest('main_allies');
  startQuest('main_siege', 'march');
  if (c === 'now') await say(a, 'neutral', 'Then ride. I\'ll be there before you.');
  else await say(a, 'neutral', 'Settle them. We will wait for you. We\'ve waited this long.');
  spawnCast();
}

// ---------------------------------------------------------------- Harrow

async function harrowParley(a: Actor) {
  await cutscene(async () => {
    a.face(G.player.x, G.player.y);
    for (const m of here()) if (m.tags.has('camp')) { m.hostile = false; m.mem.target = null; }
    await talk(`
      > Captain Harrow receives you outside his tent, on a folding chair, with a cup of wine and a book. He marks his page with a ribbon before he looks up.
      harrow: A white flag. How civilised. Sit, please. You are the boy from the village. The smith's son. Dieter spoke of you.
      harrow: You have come to ask me to leave. Everyone always does, eventually. Make your case. I have until the end of this chapter.
    `);
    let score = 0;
    const evidence = (has('harrow_orders') ? 1 : 0) + (has('foreman_ledger') || qDone('main_silver') ? 1 : 0) + (has('lothar_letter') ? 2 : 0);
    const c = await choose([
      { id: 'law', text: 'Your paymaster is a traitor to the crown. When Prague hears, every man in your Company hangs.', check: { stat: 'speech', need: Math.max(3, 7 - evidence) } },
      { id: 'money', text: 'The silver road is cut. Vilém is gone. Lothar can\'t pay you any more.', if: () => qDone('main_silver'), check: { stat: 'speech', need: 4 } },
      { id: 'gold', text: 'Sir Bertram will pay you three hundred groschen to be gone by morning.', if: () => S.money >= 300 },
      { id: 'children', text: 'You have children from my village hauling water in your camp. Let them go.' },
      { id: 'threat', text: 'Leave, or I will kill you myself.' },
    ]);
    if ((c === 'law' || c === 'money') && lastCheck) score += 2;
    if (c === 'gold') { addMoney(-300); score += 2; remember('paid_harrow'); }
    if (c === 'children') await talk(`
      harrow: The children. Yes. An ugly business. Dieter's idea, and Lothar's order. I dislike children in a camp. They cry, and then the men become sentimental, and sentimental men fight badly.
    `);
    if (c === 'threat') await talk(`
      harrow smirk: You might, at that. Dieter says you have your father's stubbornness. But you'd be dead a moment later, and I'd be dead, and none of it would get your sister out of that kitchen.
    `);
    if (score < 2) {
      const c2 = await choose([
        { id: 'truth', text: 'Then hear the truth. Lothar sold his oldest friend. What do you think he\'ll do with a hired Swabian when it\'s over?', check: { stat: 'speech', need: 5 } },
        { id: 'give', text: '[Give up]' },
      ]);
      if (c2 === 'truth' && lastCheck) score += 2;
    }
    if (score >= 2) {
      await talk(`
        > Harrow looks at you for a long moment over the rim of his cup. Then he closes his book.
        harrow: You know, I believe you're right. A man who would burn his friend's villages is not a man who pays his debts to strangers.
        harrow: We march at first light. East, over the pass. There's a war in Hungary that has been waiting for us very patiently.
        harrow: The children from your valley will be left at the crossroads with a cart and a week's bread. Consider it a gesture of professional courtesy.
        player: And Dieter?
        harrow sad: Dieter resigned his commission this morning. He's gone up to the castle. He says the smith's son will come, and he means to be there when you do. I'm afraid that one is not mine to command any longer.
      `);
      setFlag('harrow_left');
      setFlag('warcamp_broken');
      setFlag('children_freed');
      remember('harrow_left');
      completeQuest('main_harrow');
    } else {
      await talk(`
        harrow: No. I'm sorry. I have a contract, and I am a man of my word, which is a rare and expensive thing in my profession.
        harrow: Go in peace, under your white flag. The next time we meet, it will be without one.
      `);
      failQuest('main_harrow');
    }
  });
  spawnCast();
}


// ---------------------------------------------------------------- the siege

async function councilOfWar() {
  await cutscene(async () => {
    const b = findActor('bertram');
    if (b) b.face(G.player.x, G.player.y);
    forceMusic('tension');
    if (flag('ally_priory')) { sfx('bell'); await narrate('Far away, over the hills, the bell of St. Aldhelm\'s begins to ring. And then, one by one, the bells of Linden Hill, and Silverdale, and the chapel at the crossroads. The whole valley, ringing.'); }
    await talk(`
      > Below the black crag of Ravenstone, the army of Linden Hill: forty men in green and gold${allyCount() ? ', and beside them, every friend you have made in this valley' : ''}. Banners. Breath smoking in the dawn cold.
      bertram: Lothar hasn't answered my herald. He's shut the gate and manned the walls. So be it.
      ondrej: The gate's oak and iron, a hand thick. A ram will do it, in time. Time costs men.
    `);
    if (flag('ally_miners')) await say('kuba', 'happy', 'Time costs men? Give us the mine-hammers and a quarter hour. That gate\'s coming off its hinges.');
    if (flag('ally_burners')) await say('tomas_burner', 'neutral', 'Or we burn it. Pitch and charcoal. Oak burns like anything, if you know how to ask it.');
    if (has('ravenstone_plan')) await talk(`
      player: There's another way. Ilse's plan. A postern on the east wall, one guard. I could slip in and open the gate from inside.
      bertram worried: Alone? Into Lothar's castle?
      player: Not alone. Crumb's coming.
    `);
    const c = await choose([
      { id: 'storm', text: 'We storm the gate together. I\'ll be first through it.' },
      { id: 'postern', text: 'Let me try the postern. If I fail, storm the gate.', if: () => has('ravenstone_plan') },
    ]);
    if (c === 'postern') {
      await say('bertram', 'tender', 'God go with you, Sir {name}. We\'ll be waiting for the gate.');
      setStage('main_siege', 'postern');
      remember('siege_postern');
    } else {
      await say('bertram', 'angry', 'Then let\'s be about it. For Hollowbrook! For Radek! For the valley!');
      setStage('main_siege', 'gate');
      remember('siege_gate');
    }
  });
  if (qAt('main_siege', 'gate')) gateAssault();
}

async function gateAssault() {
  const strong = flag('ally_miners') || flag('ally_burners');
  await cutscene(async () => {
    forceMusic('battle');
    G.cam.lockX = 194 * TILE; G.cam.lockY = 33 * TILE;
    await narrate(strong ? (flag('ally_miners') ? 'The miners run at the gate with their great hammers under a roof of shields. The sound of it is like the end of the world.' : 'The burners heap pitch and charcoal against the gate and set it ablaze. The oak screams as it burns.') : 'The ram goes forward under a hail of arrows. Once. Twice. Men fall around it. Ten times. Twenty.');
    if (flag('ally_hunters')) await narrate('Matěj\'s hunters stand in the open and shoot, and shoot, and the archers on the walls duck and don\'t come up again.');
    await wait(strong ? 1 : 2);
    sfx('hit_heavy'); G.cam.shake = 6;
    await wait(0.6);
    sfx('hit_heavy'); G.cam.shake = 8;
    await narrate('The gate of Ravenstone gives way.');
    G.cam.lockX = null; G.cam.lockY = null;
  });
  openGate();
}

async function openGateFromInside() {
  if (!qAt('main_siege', 'postern')) { await conversation(async () => { await narrate('A great wooden winch, for raising the gate\'s bar.'); }); return; }
  await cutscene(async () => {
    await narrate('You throw your whole weight on the winch handle. The great bar grinds up out of its brackets. Outside, someone sees the gate shudder, and a roar goes up from the whole army.');
  });
  remember('opened_gate');
  addXp('stealth', 20);
  openGate();
}

function openGate() {
  setFlag('rv_gate_open');
  refreshDecor('overworld');
  setStage('main_siege', 'bailey');
  // everyone charges in
  for (const g of here()) if (g.tags.has('siege')) { g.hostile = true; g.mem.alerted = true; g.mem.aggroRange = 400; g.pose = 'idle'; }
  const allies: Actor[] = [];
  for (const id of ['bertram', 'ondrej', 'pavel', 'jirka', 'matej', 'kuba', 'tomas_burner']) {
    const a = findActor(id);
    if (!a) continue;
    if (['jirka', 'matej', 'kuba', 'tomas_burner'].includes(id)) {
      const flagFor: Record<string, string> = { jirka: 'deserters', matej: 'hunters', kuba: 'miners', tomas_burner: 'burners' };
      if (!flag('ally_' + flagFor[id])) continue;
    }
    put(a, 'overworld', 190 + allies.length * 2, 30, 3);
    a.faction = 'ally'; a.mem.enemies = ['lothar', 'harrow']; a.mem.schedule = undefined; a.mem.hold = false; a.essential = true;
    allies.push(a);
  }
  const extra = allyCount() * 2 + 3;
  for (let i = 0; i < extra; i++) {
    const g = person('overworld', (188 + (i % 8) * 2) * TILE, (32 + Math.floor(i / 8)) * TILE, { role: 'guard', seed: 4100 + i, tags: ['quest'] });
    g.faction = 'ally'; g.mem.enemies = ['lothar', 'harrow']; g.mem.wander = 0; g.mem.aggroRange = 300;
  }
  if (!flag('harrow_left')) for (let i = 0; i < 4; i++) {
    const m = fighter('overworld', (188 + i * 4) * TILE, 24 * TILE, 'merc', { id: 'rvmerc' + i, tags: ['quest', 'siege'], seed: 4200 + i });
    m.mem.aggroRange = 400; m.mem.alerted = true; m.mem.enemies = ['ally'];
  }
  const d = findActor('dieter');
  if (d) { d.hostile = false; d.mem.hold = true; }
}

async function dieterDuel() {
  setStage('main_siege', 'dieter');
  const d = findActor('dieter');
  if (!d) { setStage('main_siege', 'hall'); return; }
  await cutscene(async () => {
    for (const a of here()) if (a.faction === 'ally') { a.mem.hold = true; a.hostile = false; a.mem.target = null; }
    d.face(G.player.x, G.player.y);
    forceMusic('tension');
    await talk(`
      > The bailey is quiet. The dead lie in the mud. And in the middle of it all, waiting, as if he has been waiting a long time: the black helm. The red cloak. The long black sword, held low and easy.
      dieter: Smith's son. I knew you'd come. I told Harrow. He didn't believe me. Harrow believes in contracts. I believe in sons.
      dieter: Tell your friends to stand back. This is between us. It has been since the green.
    `);
    const c = await choose([
      { id: 'yes', text: '[Draw Father\'s sword] Stand back. All of you.' },
      { id: 'all', text: 'I don\'t owe you a fair fight.' },
    ]);
    if (c === 'yes') {
      await talk(`
        bertram worried: {name}—
        player: Please, my lord.
        > Sir Bertram looks at you for a long moment, and then lowers his sword, and steps back. They all step back. A ring of men, like at a fair, like at a wrestling match on a feast day.
      `);
      remember('dieter_fair');
    } else {
      await talk(`
        dieter: No. You don't. But you'll give me one anyway. I've watched you. You're his son.
      `);
    }
    forceMusic('battle');
  });
  d.mem.hold = false;
  d.hostile = true;
  d.mem.target = 'player';
  d.mem.alerted = true;
  d.mem.aggression = 1.1;
  let down = false;
  const off = protectPlayer(() => { down = true; });
  await waitUntil(() => down || d.hp < d.maxHp * 0.12 || !!d.mem.down, 900);
  off();
  d.hostile = false;
  d.mem.target = null;
  G.player.combat.bleeding = 0;
  if (down) {
    await cutscene(async () => {
      await talk(`
        > You go down. The black sword comes up. And then Sir Bertram is there, and Ondřej, and Pavel, all at once, and the black knight is on his knees with three blades at his throat.
        dieter: ...Unfair. But then, I told you. You don't owe me a fair fight.
      `);
    });
    G.player.hp = Math.max(G.player.hp, 25);
  }
  await dieterFate(d, !down);
}

async function dieterFate(d: Actor, won: boolean) {
  await cutscene(async () => {
    d.pose = 'sit';
    d.mem.down = false;
    d.look = { ...(d.look!), hat: undefined };
    d.charId = 'dieter_face';
    forceMusic('sorrow');
    await talk(`
      > He pulls off the black helm and drops it in the mud. Under it is only a man: forty, perhaps, grey at the temples, a broken nose, tired eyes. You had imagined a monster. It would have been easier.
      dieter_face: ${won ? 'Well struck. Your father would have been proud. He was, you know. He said so. At the end.' : 'Your father would have been proud of you, boy. He said so. At the end.'}
      player angry: Don't you talk about him.
      dieter_face: I'll talk about him because nobody else saw it. I've killed a great many fathers. I don't remember their faces. I remember his.
      dieter_face: He had my ankle. Dying, and he held on to my ankle like a man holding a rope over a cliff. "Not the boy," he said. "He's a better smith than me."
      dieter_face: I have never in twenty years spared anyone I was paid to kill. I spared you. I still don't know why. I think I wanted to see what a better smith looked like.
    `);
    sting('sad');
    const c = await choose([
      { id: 'kill', text: '[Kill him] For my father.' },
      { id: 'spare', text: 'Go. Get out of this valley. Live with it, like I have to.' },
      { id: 'trial', text: 'You\'ll hang, in Linden Hill, in front of everyone you burned.' },
    ]);
    if (c === 'kill') {
      await talk(`
        dieter_face: Aye. That's fair. That's the first fair thing in this whole business.
        > He closes his eyes. Your father's sword is very sharp. Kovář saw to that. It is quick.
        > It does not feel like anything at all. You had thought it would feel like something.
      `);
      d.essential = false; d.mem.nonlethal = false;
      kill(d, G.player);
      addItem('black_sallet', 1);
      remember('dieter_fate', 'killed');
    } else if (c === 'spare') {
      await talk(`
        dieter_face: ...Spare me? Me?
        dieter_face: Your father spared me nothing, you know. He broke two of my ribs on the green. I felt them every day since. I think I'll feel this more.
        > He gets up. He leaves the helm where it fell. He walks out through the broken gate, and nobody stops him, and he doesn't look back.
      `);
      d.mem.fleeT = 30; d.mem.fleeFrom = G.player; d.mem.despawnOnFlee = true; d.hostile = false;
      remember('dieter_fate', 'spared');
      addItem('black_sallet', 1);
      addBuff('hope', 1440);
    } else {
      await talk(`
        bertram: Bind him. He'll answer at the king's justice, with Lothar.
        dieter_face: The king's justice. Well. I've never seen it. I'm curious what it looks like.
      `);
      d.mapId = '__prison';
      remember('dieter_fate', 'trial');
    }
    setFlag('dieter_done');
    S.deadNpcs.dieter = c === 'kill';
  });
  setStage('main_siege', 'hall');
  for (const a of here()) if (a.faction === 'ally') { a.mem.hold = false; }
}

async function lotharScene() {
  const l = findActor('lothar');
  if (!l) { setStage('main_siege', 'lida'); return; }
  await cutscene(async () => {
    l.face(G.player.x, G.player.y);
    forceMusic('tension');
    await talk(`
      > The hall of Ravenstone is cold. A long table still laid for a feast nobody ate. Black banners. And on the high seat, alone, with a sword across his knees: Sir Lothar.
      lothar: The smith's boy. Of course. Bertram sends a boy to do what he hasn't the stomach for. He always did. He sent me to tell his wife their son was dead, did you know that? I carried that letter.
      player: You burned my village.
      lothar: I burned a village. Hollowbrook, Lhota, Dubá. Names on a map. It was necessary.
      lothar: This valley was my grandfather's. Margrave of the Lindenmark. Bertram's grandfather took it with a forged charter and a smile, and we've bowed to them for sixty years. Duke Ottmar will give it back. All it cost was some bread and some iron.
    `);
    const c = await choose([
      { id: 'why', text: 'Some bread and some iron. My father. My sister. My mother\'s hands, burned black.' },
      { id: 'where', text: 'Where is my sister?' },
      { id: 'yield', text: 'It\'s over. Yield, and you\'ll live to stand trial.' },
    ]);
    if (c === 'why') await talk(`
      lothar: Yes. I know. I know what it cost. Do you think I sleep? I haven't slept since St. John's Eve.
    `);
    await talk(`
      lothar: Your sister is in my kitchen. She's well. Fed, clothed. She bit my steward, you know. Twice.
      lothar: Listen to me, boy. There is no need for this to end badly for you. Take her. Take her and go, tonight, through the postern. I'll give you a purse of silver: enough for a forge of your own, anywhere you like. Prague. Vienna.
      lothar: And my letters stay in my chest, and I go over the pass to the Duke, and Bertram keeps his valley, and nobody else has to die. Everyone gets something. That's how the world works, when it works.
    `);
    const d2 = await choose([
      { id: 'no', text: 'No. You\'ll answer for Hollowbrook.' },
      { id: 'take', text: '[Take the purse. Take Lida. Go.]' },
    ]);
    if (d2 === 'take') {
      remember('lothar_bargain');
      await talk(`
        lothar: A sensible boy. Your father would have—
        player angry: Don't.
        lothar: ...Quite. The kitchen is through that door. Goodbye, smith.
      `);
      addMoney(300);
      setFlag('lothar_fled');
      l.mapId = '__gone';
      setStage('main_siege', 'lida');
      return;
    }
    await talk(`
      lothar: Then you're a fool, like your father, and you'll die like him.
      > He stands, and draws, and comes down from the high seat. He is old, but he was a knight for forty years, and he moves like one.
    `);
    forceMusic('battle');
  });
  if (flag('lothar_fled')) return;
  l.mem.hold = false;
  l.hostile = true; l.mem.target = 'player'; l.mem.alerted = true; l.mem.nonlethal = true; l.mem.boss = true;
  let down = false;
  const off = protectPlayer(() => { down = true; });
  await waitUntil(() => down || l.hp < l.maxHp * 0.2 || !!l.mem.down, 600);
  off();
  l.hostile = false; l.mem.target = null;
  G.player.combat.bleeding = 0;
  G.player.hp = Math.max(G.player.hp, 20);
  await cutscene(async () => {
    l.pose = 'sit';
    l.mem.down = false;
    if (down) await narrate('He is better than you. He has you down, his sword at your throat, when the door crashes open and Sir Bertram walks in.');
    const b = findActor('bertram');
    if (b) { put(b, 'rv_hall', 8, 9, 3); b.mem.hold = true; }
    await talk(`
      bertram: Lothar.
      lothar: Bertram. Come to gloat?
      bertram sad: No. Come to ask why. Thirty years, Lothar. You held my son at the font.
      lothar: And you held my grandfather's valley. For sixty years. Your family and mine. You never once thought about it, did you? Never once. That's what I could never forgive. That you never even thought about it.
    `);
    const c = await choose([
      { id: 'justice', text: 'He\'s yours, my lord. The king\'s justice.' },
      { id: 'kill', text: '[Kill him] For Hollowbrook.' },
      { id: 'mercy', text: 'Let him live, my lord. Let him live with it.' },
    ]);
    if (c === 'kill') {
      await narrate('Sir Bertram shouts. You don\'t hear him. It is done before anyone can move, and Sir Lothar of Ravenstone dies on the steps of his own high seat.');
      l.essential = false; l.mem.nonlethal = false;
      kill(l, G.player);
      await say('bertram', 'sad', '...God forgive you, lad. God forgive us all. I would have liked to hear him answer the king.');
      remember('lothar_fate', 'killed');
    } else if (c === 'mercy') {
      await talk(`
        bertram: Mercy? For him?
        player: Hollowbrook had enough killing.
        bertram tender: ...Yes. Yes, it did. He goes to Prague in chains, then, and the king may do as he likes. I'll ask for a cell with a window.
      `);
      remember('lothar_fate', 'mercy');
      l.mapId = '__prison';
    } else {
      await say('bertram', 'neutral', 'The king\'s justice, then. Bind him.');
      remember('lothar_fate', 'justice');
      l.mapId = '__prison';
    }
    addItem('key_lothar', 1);
    await narrate('Sir Lothar\'s key hangs at his belt. His chest stands by the wall.');
  });
  setStage('main_siege', 'lida');
}

async function lidaReunion() {
  const lida = findActor('lida');
  await cutscene(async () => {
    forceMusic('lullaby');
    const berta = findActor('berta');
    if (berta) berta.face(G.player.x, G.player.y);
    await talk(`
      > The kitchens of Ravenstone: warm, and dim, and smelling of bread. An old woman in an apron stands in front of the hearth with a bread peel held like a spear.
      berta angry: Stay back. Whoever you are. You stay back from her.
      > And from behind the barrels in the corner, a small, fierce, familiar voice, with a kitchen knife in it:
      lida angry: I'm warning you! I'm a knight! I've got a knife and I know how to use it!
    `);
    if (lida) { lida.mem.hold = false; await walkTo(lida, G.player.x - 10, G.player.y - 6, { timeout: 3 }); lida.face(G.player.x, G.player.y); }
    await talk(`
      lida surprised: ...
      lida: {name}?
      player tender: Hello, little fox.
    `);
    sting('warm');
    await talk(`
      > She drops the knife. She crosses the kitchen in about three steps and hits you in the chest like a thrown sack of flour, and wraps her arms around your neck, and doesn't let go. She is thinner. Her braids are cut short. She is the most beautiful thing you have ever seen.
      lida cry: You came. You came. I told them. I told them all. Every night I told them. "My brother will come. He's slow, but he comes."
      player: I'm sorry I was slow.
      lida cry: You were SO slow.
    `);
    const crumb = findActor('crumb');
    if (crumb && crumb.mapId === G.map.id) await talk(`
      > And then Crumb gets there, and there is no more talking for a while, only a dog going completely out of his mind with joy, and a small girl laughing and crying at the same time with her face in his fur.
    `);
    if (has('wooden_fox')) {
      await talk(`
        > You take the little wooden fox out of your coat, where it has been all this time. Scorched paint. One chewed ear.
        lida tender: ...You found him. You found him! I dropped him by the bridge when the man picked me up. I thought he burned. I cried about him every night. Is that stupid? With everything?
        player: No. It isn't stupid.
      `);
      removeItem('wooden_fox');
      remember('fox_returned');
    }
    if (has('lida_drawing')) await talk(`
      lida: Did you get my picture? From Ilse? I wrote my name. I can write my name now, did you see?
      player: I saw. It's the best thing I own.
      lida smirk: You still can't read, can you.
    `);
    if (skill('reading') >= 2) await talk(`
      player smirk: Actually, I can. Brother Tobiah taught me. I read Father's letter myself.
      lida surprised: ...You learned to READ? Without me? That was my job!
    `);
    await talk(`
      lida sad: Where's Father? {name}? Where's Father?
    `);
    const c = await choose([
      { id: 'truth', text: '[Tell her the truth, gently]' },
      { id: 'later', text: 'Let\'s go home first. Then I\'ll tell you everything.' },
    ]);
    if (c === 'truth') await talk(`
      > You tell her. You kneel on the kitchen floor and hold both her hands and tell her. She doesn't cry at first. She just looks at you with Father's eyes.
      lida cry: He went out to them with his hammer. I saw him go. I wanted him to come back and he didn't come back.
      > Then she cries, and you cry, and Old Berta turns away to the hearth and pretends to be very busy with the fire.
    `);
    else await talk(`
      > She looks at your face for a long moment. She is nine, and she is not stupid, and she has always, always been able to tell when you are lying.
      lida sad: ...All right. Home first. Hold my hand, though. Don't let go.
    `);
    await talk(`
      lida: Is Mother...?
    `);
    if (flag('mother_dead')) await talk(`
      > You shake your head. You can't say it. She understands.
      lida cry: Then it's just us. Just you and me and Crumb.
      player: Just us. We'll manage. We're clever. We're foxes.
    `);
    else await talk(`
      player tender: Mother's in Linden Hill, baking bread for half the valley and scolding the other half. She's waiting for you.
      lida cry: Mother. Mother. Can we go now? Can we go right now?
    `);
    await talk(`
      berta: Go on, then, the both of you. Take the child home. She's been my only company in this cold old place, and she's eaten half my larder, and I'll miss her every day.
    `);
  });
  completeQuest('main_siege');
  await epilogue();
}

// ---------------------------------------------------------------- the epilogue

export async function epilogue() {
  const name = S.playerName;
  const mother = !flag('mother_dead');
  const hanka = rel('hanka') >= 10 && (has('hanka_ribbon') || chose('danced_hanka'));
  const pavelAlive = !flag('pavel_dead');
  const dieterFate = chose('dieter_fate');
  const lotharFate = chose('lothar_fate');
  const read = skill('reading') >= 2;
  await cutscene(async () => {
    forceMusic('hope');
    await fadeTo(1, 2);
    setFlag('act', 4);
    setFlag('refugees_moved');
    setFlag('warcamp_broken');
    setFlag('lida_home');
    setHollowbrook('normal');
    S.dog.owned = true;
    const list: { title?: string; sub?: string; body: string; secs?: number }[] = [];
    list.push({ sub: 'Epilogue', title: 'Of Bread and Iron', body: 'The Lindenmark, in the year of Our Lord 1410.' });
    list.push({ sub: 'Hollowbrook', body: `The people of Hollowbrook went home before the first snow. They built their houses again on the old stones, and they planted a new linden on the green, a little crooked, and argued about whether it was crooked for years.\n\nThe forge rang again by Candlemas. People came from as far as Linden Hill to have their horses shod by the smith's son, who hummed while he worked, though he could never say what the tune was.` });
    if (mother) list.push({ sub: 'Marta', body: `Marta baked in Hollowbrook again, in a new oven built on the old hearth. Every Sunday she baked a honey loaf for Radek, and set it on the shelf, and every Monday ${name} ate it, and she pretended not to notice.${chose('miko_adopted') || flag('miko_adopted') ? '\n\nA dark-eyed boy called Miko lived with her, and stole nothing, and burned the bread only twice.' : ''}` });
    else list.push({ sub: 'Marta', body: `Marta lies by the crossroads shrine, under a stone that ${name} cut himself. Lida brings flowers every Sunday, and tells her all the news, and leaves out nothing, not even the bad parts. Especially not those.` });
    list.push({ sub: 'Lida', body: `Lida learned to read that winter${read ? `, though her brother learned first, which she has never entirely forgiven` : `, and taught her brother, slowly, with enormous patience and a stick for pointing`}.\n\nShe kept the wooden fox on the shelf above her bed until she was grown. She never did become a knight. She became something better: she became the one who watches out for everybody.` });
    if (pavelAlive) list.push({ sub: 'Pavel', body: chose('promised_mill') ? `Pavel rebuilt the mill on the brook, and the smith's son forged its gears. He married the baker's daughter from Linden Hill, the one who laughs like a donkey. On St. John's Eve he still jumps the fire, and still slips on the landing, every year.` : `Pavel stayed in Sir Bertram's garrison, and in time became its sergeant, when Ondřej finally retired to insult the fish in the brook. He was a good sergeant. He never once rode off alone again.` });
    if (hanka) list.push({ sub: 'Hanka', body: `In the spring, under the crooked new linden, ${name} married Hanka, who still had the green ribbon, and so did he. Old Wenda came to the wedding and complained about everything and cried in the church. Crumb ate the wedding cake.` });
    else list.push({ sub: 'Hanka', body: `Hanka became the herb-wife of the valley when Old Wenda died. People called her a witch. She called them idiots. She saved more lives than anyone could count.` });
    list.push({ sub: 'The black helm', body: dieterFate === 'spared' ? `Years later, a traveller in Hungary told of a grey mercenary who would not fight for money any more, only for villages that couldn't pay. He had no helm, and a smith's name he would not explain.` : dieterFate === 'trial' ? `Dieter was hanged at Linden Hill before the whole valley. He climbed the ladder without help, and looked for someone in the crowd, and seemed satisfied when he found him.` : `The black helm hangs on a nail in the forge at Hollowbrook. ${name} never wears it. He doesn't know why he keeps it.` });
    list.push({ sub: 'Ravenstone', body: flag('lothar_fled') ? `Sir Lothar fled over the pass to Duke Ottmar and was never seen again. Sir Bertram never learned what his young knight had been offered in that hall, or why he took it. ${name} carried that silence for the rest of his life. It was heavy.` : lotharFate === 'killed' ? `Sir Lothar was buried at Ravenstone, without a stone. Sir Bertram never spoke his name again, except once, drunk, on St. Wenceslas' Day, when he wept for the boy who had held his son at the font.` : `Sir Lothar went to Prague in chains, with his own letters around his neck. The king's justice was slow, but it came. Ravenstone was given to the crown, and the crown gave it to a knight of Hollowbrook, who never lived there.` });
    if (chose('vojta_died')) list.push({ sub: 'Vojta', body: chose('promised_vojta_song') || chose('vojta_forgiven') ? `${name} finished Vojta's song, the one about the miller's wife. In the last verse, she dances. They sing it in the Rooster every St. John's Eve, badly, and raise a cup to the man who never finished anything but that.` : `They sing Vojta's song in the Rooster every St. John's Eve. It still has no ending. Somebody always stops in the middle, and there's a quiet, and then someone buys a round.` });
    list.push({ sub: 'Crumb', body: 'Crumb lived to be sixteen, which is very old for a dog. He ate a great many honey cakes, and at least one wedding cake, and he slept every night of his life across the doorway, so that nobody could come in without stepping on him.' });
    list.push({ sub: 'Radek', body: `On the anvil in Hollowbrook, if you know where to look, there are letters cut into the iron. ${name} cut them himself, the first winter, and they say, in careful capitals:\n\nNOT BAD.` });
    await slides(list);
    await card('Of Bread and Iron', 'The End', 'Thank you for playing.\n\nThe valley is yours to wander. Hollowbrook is rebuilding, and your family is home.', { secs: 8 });
    spawnCast();
    await travel('overworld', 'green');
    forceMusic(null);
  });
}

export { hourF, disguise, crumbJoins, qActive, qFailed, flee, rand, actors, removeActor, getMap, putAt, readAndWait, canRunScene, skipTo, lockpick, always };
