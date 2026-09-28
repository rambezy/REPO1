// Act I: Ashes. Burying a father, nursing a mother, and finding out who
// paid for the fire.

import { G } from '../../G';
import { S, flag, setFlag, hourF, dayIndex } from '../../state';
import { Actor } from '../../world/actor';
import { findActor, getMap, removeActor, addActor } from '../../world/world';
import { CHARS } from '../characters';
import { kill } from '../../systems/combat';
import { emit as fx } from '../../engine/fx';
import { defineQuest, startQuest, setStage, completeQuest, failQuest, qAt, qActive, qDone, qVar, qStage } from '../../systems/quests';
import { say, talk, narrate, choose, cutscene, conversation, wait, hold, lastCheck } from '../../systems/script';
import { addItem, removeItem, has, count, addMoney, equip } from '../../systems/inventory';
import { addXp, addBuff, skill } from '../../systems/stats';
import { notify } from '../../ui/notify';
import { sfx, sting } from '../../audio/sfx';
import { card } from '../../ui/cine';
import { on } from '../../engine/events';
import { weather } from '../../systems/weather';
import { forceMusic } from '../../systems/director';
import { walkTo, settleSchedules } from '../../systems/ai';
import { TILE } from '../../engine/util';
import { fadeTo } from '../../systems/transition';
import { crumbJoins, crumbLeaves, makeCrumb } from '../../systems/companion';
import { readBook } from '../../ui/reader';
import { trigger, topic, greet, farewell, waitUntil, put, nearTile, onMap, protectPlayer, addRel, remember, chose, tip, P, setHollowbrook, canRunScene, decor, propObj, groundItem, hostiles, rel, refreshDecor, unfire, readAndWait } from './lib';
import { offerTraining } from './sides';
import { spawnCast, castHooks, npc, fighter, OW, always, ACT, at } from './cast';
import { startAct2 } from './act2';

const DAY = 1440;

export function registerAct1() {
  // ---------------------------------------------------------------- quests
  defineQuest({
    id: 'main_ashes', title: 'Ashes', kind: 'main', act: 'Act I',
    summary: 'Hollowbrook is gone.',
    stages: {
      wake: { obj: 'Get up.' },
      bury: { obj: 'Carry Father to the chapel yard and bury him.', marker: { map: 'overworld', x: 54, y: 87 },
        entry: 'I woke on the green in the rain. Brother Tobiah was holding my head. He didn\'t say anything for a long time, and then he didn\'t have to.' },
      forge: { obj: 'Search Father\'s forge. "Under the hearthstone," Tobiah said.', marker: { key: 'hb_forge', map: 'overworld' },
        entry: 'We buried Father beside the chapel. Tobiah says Father talked about me all evening at the fire, and that he had something hidden at the forge. Something for me.' },
      search: {
        obj: 'Search the ruins for any sign of Mother and Lida.',
        get optional() { return [(has('mothers_apron') ? '✓ ' : '· ') + 'The road out of the village, east', (has('wooden_fox') ? '✓ ' : '· ') + 'Down by the footbridge']; },
        marker: () => [!has('mothers_apron') ? { map: 'overworld', x: 60, y: 109 } : null, !has('wooden_fox') ? { map: 'overworld', x: 30, y: 102 } : null].filter(Boolean) as { map: string; x: number; y: number }[],
        entry: 'Father\'s last work was a sword, and a letter I cannot read. Mother and Lida were not among the dead. Tobiah says some of the village got away east, to the crossroads.',
      },
      crossroads: { obj: 'Follow the survivors to the crossroads below Linden Hill.', marker: { map: 'overworld', x: 122, y: 134 },
        entry: 'Mother\'s apron, on the road east. No blood on it. No body. The survivors went east, to the crossroads. So did she. She must have.' },
      done: { entry: 'The crossroads. The living are here, what\'s left of them.' },
    },
  });

  defineQuest({
    id: 'main_mother', title: 'The Far Tent', kind: 'main', act: 'Act I',
    summary: 'Mother is alive, but the fever is in her wound.',
    stages: {
      find: { obj: 'Find Mother. Jiří says she is in the far tent.', marker: { map: 'overworld', x: 124, y: 136 } },
      wenda: {
        get obj() { return `Find Old Wenda, the herb-wife, in the south woods. ${hoursLeft()}`; },
        marker: { map: 'overworld', x: 62, y: 152 },
        entry: 'Mother has the wound-fever. Jiří has seen it before. Three days, he says, and then it takes you. Hanka\'s teacher, Old Wenda, lives in the woods south of the crossroads. If anyone can help, she can.',
      },
      gather: {
        get obj() { return `Gather what the remedy needs. ${hoursLeft()}`; },
        get optional() {
          return [['feverfew', 'Feverfew (sandy stream banks, or Wenda sells it)'], ['willow_bark', 'Willow bark (from willow trees by the water)'], ['angelica', 'Angelica root (the damp grove, west of Wenda\'s hut)']].map(([id, t]) => (has(id) ? '✓ ' : '· ') + t);
        },
        marker: () => (has('angelica') ? null : { map: 'overworld', x: 78, y: 138 }),
        entry: 'Wenda gave me her recipe, scratched on bark: feverfew, willow bark and angelica root. Boil twice, grind, strain. She says I brew it myself or not at all.',
      },
      brew: { get obj() { return `Brew the Feverwort Remedy at Wenda's alchemy bench. ${hoursLeft()}`; }, marker: { map: 'wenda_hut', x: 8, y: 5 } },
      give: { get obj() { return `Bring the remedy to Mother in the far tent. ${hoursLeft()}`; }, marker: { actor: 'marta' } },
      rest: { obj: 'Let Mother sleep. Come back to the far tent tomorrow.', marker: { map: 'overworld', x: 124, y: 136 } },
      talk: { obj: 'Mother is awake. Go to her.', marker: { actor: 'marta' } },
      done: { entry: 'Mother is going to live. She sat up and ate soup and scolded me for my boots. I have never been so glad to be scolded.' },
      failed: { entry: 'Mother died in the night, in the far tent, while I was gone. She asked for Father. She asked for Lida. She asked for me.' },
    },
  });

  defineQuest({
    id: 'main_bertram', title: 'The Lord of Linden Hill', kind: 'main', act: 'Act I',
    summary: 'Sir Bertram is lord of this valley. He owes his people justice.',
    stages: {
      go: { obj: 'Go to Linden Hill and seek an audience with Sir Bertram in the castle keep.', marker: { map: 'lh_keep', x: 8, y: 6 },
        entry: 'Jiří says Sir Bertram must hear what happened from someone who saw it. Hollowbrook was his village. We were his people.' },
      audience: { obj: 'Speak with Sir Bertram.', marker: { actor: 'bertram' } },
      train: { obj: 'Report to Sergeant Ondřej in the castle training yard.', marker: { actor: 'ondrej' },
        entry: 'Sir Bertram will not ride out against two hundred mercenaries on my word. But he took me into his service, and he wants to know who the riders met at the Crow\'s Stone. First, Ondřej is to teach me which end of a sword to hold.' },
      done: { entry: 'Ondřej says I block like a drunk ox. Then he said "better," which I think is the nicest thing he has ever said to anyone.' },
    },
  });

  defineQuest({
    id: 'main_crowstone', title: "The Crow's Stone", kind: 'main', act: 'Act I',
    summary: 'The riders who burned Hollowbrook were seen at the Crow\'s Stone before the raid.',
    stages: {
      go: { obj: 'Search the Crow\'s Stone on the old pass road for signs of the riders.', marker: { key: 'crowstone_fire', map: 'overworld' } },
      trail: { obj: 'Follow the three riders who broke away south-west, into the Wolfwood.', marker: { map: 'overworld', x: 26, y: 166 },
        entry: 'At the Crow\'s Stone: the ashes of a big camp, and half of a red wax seal with a black bird on it. Most of the horses went north, toward Ravenstone. Three went south-west into the Wolfwood. Deserters, maybe. Deserters talk.' },
      deserters: { obj: 'Deal with the deserters in their hidden camp.', marker: { map: 'overworld', x: 26, y: 164 } },
      report: { obj: 'Bring what you have learned to Sir Bertram.', marker: { actor: 'bertram' },
        entry: 'Jirka One-Ear, deserter, gave me the orders for the raid. The seal is a raven. And Lida is alive. She was sent to Ravenstone, to Sir Lothar\'s kitchens. She is alive.' },
      done: { entry: 'Sir Bertram will not believe it. Lothar stood godfather to his son. He wants proof that a court would accept. Very well. I\'ll bring him proof.' },
    },
  });

  registerTalks();
  registerScenes();
  registerCast();
  registerDecor();
}

function hoursLeft(): string {
  const d = qVar('main_mother', 'deadline') as number | undefined;
  if (!d) return '';
  const h = Math.max(0, Math.round((d - S.minutes) / 60));
  return h > 30 ? `(Mother has about ${Math.round(h / 24 * 2) / 2} days.)` : `(Mother has about ${h} hours.)`;
}

// ---------------------------------------------------------------- Act I begins

export async function startAct1() {
  setFlag('act', 1);
  setFlag('war_news');
  setFlag('map_known');
  S.dog.owned = false;
  crumbLeaves();
  S.minutes = DAY + 9.6 * 60;
  weather.forced = 0.5;
  setHollowbrook('ruined');
  startQuest('main_ashes', 'wake', true);
  const p = P();
  p.dead = false;
  p.combat.bleeding = 0;
  p.hp = Math.max(p.hp, p.maxHp * 0.45);
  S.hunger = Math.max(S.hunger, 35);
  S.energy = Math.max(S.energy, 40);
  spawnCast();
  put(p, 'overworld', 39, 103, 0);
  p.pose = 'lie';
  p.poseLock = 9999;
  addBuff('grief', 3 * DAY);
  await cutscene(async () => {
    G.fade = 1;
    G.cam.lockX = p.x; G.cam.lockY = p.y - 10;
    forceMusic('sorrow');
    await card('Ashes', 'Act I', '', { secs: 4, bg: '#000' });
    await fadeTo(0, 3);
    await wait(1);
    await talk(`
      > Rain. Cold rain on your face, and the smell of wet ash, which is a smell you will never be able to forget, and someone's hand under your head.
      tobiah worried: Easy. Easy, lad. Don't try to stand yet.
      player pain: Father...
      > Brother Tobiah's face is black with soot. He has been crying and hasn't stopped to wipe it away.
      tobiah sad: I'm sorry. I'm so sorry, {name}.
    `);
    p.poseLock = 0;
    p.pose = 'idle';
    await wait(0.6);
    await talk(`
      > The green is ash. The old linden is a black pillar, still smoking. Every roof in Hollowbrook is gone. Your father lies where he fell, under a horse-blanket. Someone has folded his hands on his chest.
      tobiah: They came three hours before dawn. Two hundred horse, more. Black cloaks, no banners. They fired the roofs, and they took the livestock, and... and the children, {name}. They took the children.
      player: Lida. Mother.
      tobiah: Your mother isn't among the dead. I looked. I looked at every face. Some of the village got away east, to the crossroads. Jiří the reeve, Bára, some others.
      tobiah worried: Lida... they took the children north, in carts. I heard them go. I hid in the chapel crypt with Mikuláš's baby and I held my hand over her mouth, and I heard them go.
    `);
    const c = await choose([
      { id: 'why', text: 'Why? Why us? We\'re nothing. We\'re bread and horseshoes.' },
      { id: 'who', text: 'Who were they?' },
      { id: 'silent', text: '[Say nothing. Look at your father.]' },
    ]);
    if (c === 'why') await talk(`
      tobiah sad: I don't know, lad. I have been asking God since the sun came up, and He hasn't answered me yet.
      tobiah: But someone paid for this. Two hundred horse don't ride over the hills to burn a village of bakers for fun. Someone paid.
    `);
    else if (c === 'who') await talk(`
      tobiah: Soldiers. Hired men. I heard German and Czech and something I didn't know. One of them, a big one in a black helm, gave the orders.
      player angry: The black helm. He killed Father. He was standing over me.
      tobiah: And yet here you are. God alone knows why.
    `);
    else await narrate('The rain runs off the blanket in little streams. You can see the shape of his hands under it. His big smith\'s hands.');
    await talk(`
      tobiah: We must bury him. Before... We must bury him. I've dug the grave beside the chapel. I dug a good many this morning. Help me carry him, and then we'll say the words.
    `);
    G.cam.lockX = null; G.cam.lockY = null;
    setStage('main_ashes', 'bury', true);
  });
  tip('act1', 'Your journal (<b>B</b>) now holds several tasks. The tracked one shows on screen; pick another from the journal at any time.', 8000);
}

// ---------------------------------------------------------------- cast for Act I

function registerCast() {
  castHooks.push(() => {
    if (ACT() !== 1) return;
    // the morning after: Tobiah in the ruins, Father on the green
    if (qAt('main_ashes', 'wake', 'bury', 'forge', 'search')) {
      npc('tobiah', null, always(qAt('main_ashes', 'wake', 'bury') ? OW(40, 103) : OW(53, 88), 'stand', { dir: 1 }));
      if (!flag('father_buried')) {
        const body = new Actor('Radek', 'radek_body');
        body.look = CHARS.radek.look;
        body.pose = 'dead';
        body.dead = true;
        body.solid = false;
        body.talkable = false;
        body.tags.add('quest');
        addActor(body, 'overworld', 38 * TILE + 8, 103 * TILE + 10);
      }
    }
    // the far tent: Hanka nursing, Mother recovering
    if (qAt('main_mother', 'give', 'rest', 'talk') || (flag('mother_cured') && !flag('mother_moved'))) {
      npc('hanka', at('camp_tent', 'beside'), always(at('camp_tent', 'beside'), 'stand', { dir: 1 }));
    }
    if (flag('mother_cured') && !flag('mother_moved') && !flag('mother_dead')) {
      const m = npc('marta', at('camp_tent', 'marta_bed'), always(at('camp_tent', 'marta_bed'), 'sit', { dir: 0 }));
      if (m) m.mem.faceWhileTalking = false;
    }
    // Crumb waits at the Crow's Stone
    if (!flag('crumb_found') && qAt('main_crowstone', 'go')) {
      const c = makeCrumb();
      c.mem.follow = null;
      c.pose = 'lie';
      c.mem.hold = true;
      c.tags.add('quest');
      addActor(c, 'overworld', 75 * TILE, 65 * TILE);
    }
    // deserters in the Wolfwood (they stay on as allies if spared and asked)
    if ((!flag('jirka_done') || flag('deserters_allied')) && !flag('deserters_dead') && !flag('deserters_rallied')) {
      const j = npc('jirka', OW(26, 161), always(OW(26, 161), 'stand', { dir: 0 }), { faction: 'bandit', essential: true, skill: 5, weapon: 'falchion', hp: 110 });
      if (j) { j.mem.noSurrender = true; j.tags.add('deserter_boss'); }
      const spots: [number, number][] = [[23, 163], [29, 163], [25, 159]];
      spots.forEach(([x, y], i) => {
        if (flag('deserter_dead_' + i)) return;
        const d = fighter('overworld', x * TILE + 8, y * TILE + 12, 'deserter', { id: 'deserter' + i, tags: ['quest', 'deserters'], hostile: false, seed: 2200 + i });
        d.mem.wander = 30;
        d.mem.courage = 0.4;
      });
    }
  });
  on('kill', (a: Actor) => {
    const m = /^deserter(\d)$/.exec(a.id);
    if (m) setFlag('deserter_dead_' + m[1]);
  });
}


// ---------------------------------------------------------------- world objects

function registerDecor() {
  decor({ key: 'radek_grave', map: 'overworld', when: () => !!flag('father_buried'), make: () => propObj('grave_fresh', 54, 85, { opt: flag('grave_flowers') ? 'flowers' : '', interact: { type: 'script', script: 'radek_grave', label: "Father's grave" } }) });
  decor({ key: 'havel_grave', map: 'overworld', when: () => !!flag('father_buried'), make: () => propObj('grave_fresh', 56, 85, { variant: 2 }) });
  decor({ key: 'miller_grave', map: 'overworld', when: () => !!flag('father_buried'), make: () => propObj('grave_fresh', 58, 85, { variant: 3 }) });
  groundItem('hb_apron', 'overworld', 'mothers_apron', 60, 109, { when: () => ACT() >= 1 });
  groundItem('hb_fox', 'overworld', 'wooden_fox', 30, 102, { when: () => ACT() >= 1 });
  decor({ key: 'havel_hearth', map: 'overworld', when: () => ACT() >= 1 && (flag('hb_state') === 'ruined') && !flag('havel_sword_found'), make: () => ({ ...propObj('rubble', 18, 92, { variant: 7, solid: false }), interact: { type: 'script', script: 'havel_hearth', label: 'Old Havel\'s hearth' } }) });
}

// ---------------------------------------------------------------- scenes

function registerScenes() {
  // the burial
  trigger('a1_bury', () => qAt('main_ashes', 'bury') && nearTile(54, 87, 4), () => burial());

  // Father's forge: the hearthstone
  on('script:hearthstone', () => {
    if (qAt('main_ashes', 'forge')) hearthstone();
    else conversation(async () => {
      await narrate(flag('blade_found') ? 'Father\'s forge, cold and black. The hearthstone lies where you left it. The rain is filling the hole.' : 'The forge is cold. Rain hisses on the black iron.');
    });
  });

  // the ruins give up their small things
  on('item:mothers_apron', () => {
    conversation(async () => {
      await narrate('Mother\'s apron, trodden into the mud of the east road. Flour-white, singed at the hem. You turn it over and over in your hands. No blood. Not a drop.');
      await narrate('She came this way. She was running east. She was alive.');
    }).then(() => { addBuff('hope', DAY); checkSearch(); });
  });
  on('item:wooden_fox', () => {
    conversation(async () => {
      await narrate('Down by the footbridge, in the trampled mud where the carts went by: Lida\'s wooden fox. Its paint is scorched. The chewed ear is still chewed.');
      await narrate('She would never have let go of it. Not unless someone pulled her hands open.');
      if (chose('knights_promise')) await narrate('Knight\'s promise, you told her. You close your fist around the little fox until the wood bites.');
    }).then(() => checkSearch());
  });

  // arriving at the camp
  trigger('a1_camp', () => qAt('main_ashes', 'crossroads') && nearTile(122, 133, 9), () => arriveCamp());

  // the fever clock
  on('hour', () => {
    const d = qVar('main_mother', 'deadline') as number | undefined;
    if (!d || !qAt('main_mother', 'wenda', 'gather', 'brew', 'give')) return;
    const left = (d - S.minutes) / 60;
    if (left <= 0) motherDies();
    else if (left < 24 && !flag('fever_warn1')) { setFlag('fever_warn1'); notify('Mother has less than a day left. Hurry.', 'bad', 6000); }
  });
  on('gather', () => { if (qAt('main_mother', 'gather') && has('feverfew') && has('willow_bark') && has('angelica')) setStage('main_mother', 'brew'); });
  on('item:angelica', () => { if (qAt('main_mother', 'gather') && has('feverfew') && has('willow_bark') && has('angelica')) setStage('main_mother', 'brew'); });
  on('item:feverfew', () => { if (qAt('main_mother', 'gather') && has('feverfew') && has('willow_bark') && has('angelica')) setStage('main_mother', 'brew'); });
  on('item:willow_bark', () => { if (qAt('main_mother', 'gather') && has('feverfew') && has('willow_bark') && has('angelica')) setStage('main_mother', 'brew'); });
  on('brewed', (id: string) => { if (id === 'feverwort_remedy' && qAt('main_mother', 'wenda', 'gather', 'brew')) setStage('main_mother', 'give'); });
  on('item:feverwort_remedy', () => { if (qAt('main_mother', 'wenda', 'gather', 'brew')) setStage('main_mother', 'give'); });

  // Mother wakes
  trigger('a1_mother_wakes', () => qAt('main_mother', 'rest') && S.minutes > (qVar('main_mother', 'given') as number) + 10 * 60, () => { setStage('main_mother', 'talk'); });
  // the death, discovered
  trigger('a1_mother_grave', () => !!flag('mother_dead') && !flag('mother_mourned') && nearTile(122, 133, 8), () => motherMourned());

  // once the player leaves the tent, Mother and Hanka go to Linden Hill
  trigger('a1_mother_moves', () => !!flag('mother_cured') && !flag('mother_moved') && !onMap('camp_tent'), () => { setFlag('mother_moved'); spawnCast(); });
  // the steward at the keep door
  trigger('a1_steward', () => qAt('main_bertram', 'go') && onMap('lh_keep'), () => stewardGate());

  // Ondřej's first lesson
  on('perfect_block', () => { if (lesson.on) lesson.blocks++; });

  // the Crow's Stone
  on('script:crowstone', () => {
    if (qAt('main_crowstone', 'go')) crowStone();
    else conversation(async () => { await narrate(flag('crumb_found') ? 'The cold campfire where the riders waited. Crumb growls at it, low and steady.' : 'Old ashes, and the prints of many horses. Somebody camped here, not long ago.'); });
  });

  // the deserters' camp
  trigger('a1_deserters', () => qAt('main_crowstone', 'trail', 'deserters') && !flag('jirka_done') && nearTile(26, 163, 11) && !!findActor('jirka'), () => desertersParley());
  trigger('a1_deserters_beaten', () => !!flag('deserters_fight') && !flag('jirka_done') && (!!findActor('jirka')?.mem.down || hostiles('deserters').length === 0 && !findActor('jirka')?.hostile), () => jirkaYields(), { repeat: true, cooldown: 2 });

  // Havel's buried sword
  on('script:havel_hearth', () => havelHearth());
}

function checkSearch() {
  if (qAt('main_ashes', 'search') && has('mothers_apron')) setStage('main_ashes', 'crossroads');
}

async function burial() {
  await cutscene(async () => {
    const p = P();
    await fadeTo(1, 1);
    const body = findActor('radek_body');
    if (body) removeActor(body);
    setFlag('father_buried');
    refreshDecor('overworld');
    const tob = findActor('tobiah');
    put(tob, 'overworld', 53, 87, 0);
    put(p, 'overworld', 55, 87, 3);
    G.cam.lockX = 54 * TILE + 8; G.cam.lockY = 86 * TILE;
    forceMusic('sorrow');
    await wait(0.8);
    await fadeTo(0, 2);
    await talk(`
      > He is heavier than you thought a man could be. You carry him between you, Tobiah at his shoulders and you at his feet, the way he once carried you home asleep from the fair at Linden Hill.
      > You lower him in. Tobiah says the words in Latin, and then again in Czech, so that you will understand them.
      tobiah: I am the resurrection and the life. He who believes in me, though he die, yet shall he live.
      tobiah sad: ...I only knew him two summers, {name}. He mended the priory gate for nothing, and wouldn't take so much as a jar of honey for it. Would you say something? He would want to hear it from you.
    `);
    const c = await choose([
      { id: 'good', text: 'He was a good man. He never said much. He never had to.' },
      { id: 'vow', text: 'I\'ll find them, Father. Mother and Lida. I swear it on your grave.' },
      { id: 'kill', text: 'I\'ll find the man in the black helm. And I\'ll kill him.' },
      { id: 'shoe', text: '[Say nothing. Lay your first horseshoe on the grave.]', if: () => has('horseshoe') },
    ]);
    if (c === 'good') {
      await talk(`
        player: He never said much. He'd hum. When the iron was right, he'd hum, and you knew. That was him telling you.
        player sad: He told me "not bad" yesterday. For a horseshoe. That was... that was a lot, from him.
        tobiah tender: It was everything, from him.
      `);
      remember('eulogy', 'good');
    } else if (c === 'vow') {
      await talk(`
        tobiah: A vow on a grave is a heavy thing to carry, lad.
        player: Then I'll carry it.
      `);
      remember('eulogy', 'vow');
    } else if (c === 'kill') {
      await talk(`
        tobiah worried: Vengeance is mine, saith the Lord.
        player angry: The Lord wasn't here last night.
        > Tobiah doesn't answer that. He just puts his hand on your shoulder, and leaves it there.
      `);
      remember('eulogy', 'vengeance');
    } else {
      removeItem('horseshoe');
      setFlag('grave_flowers');
      await talk(`
        > You set the horseshoe on the raw earth, where his heart is. "Not bad," he said. Only yesterday. It feels like a hundred years ago.
        tobiah tender: ...That's the finest eulogy I ever heard. And I've heard bishops.
      `);
      remember('eulogy', 'horseshoe');
    }
    sting('sad');
    await talk(`
      tobiah: I buried Old Havel this morning, and Mikuláš the miller, and the Novák children. I ran out of prayers around dawn. God will have to make do with my tears.
      tobiah: {name}... your father talked about you all evening at the fire. When you'd gone off to dance. "The boy's got the hands for it," he said. "Better than mine."
      tobiah: And he said he'd hidden something for you. At the forge. "Under the hearthstone," he said, and he winked at me like a boy stealing apples. I'd never seen him wink.
    `);
    setStage('main_ashes', 'forge');
    G.cam.lockX = null; G.cam.lockY = null;
  });
}

async function hearthstone() {
  await cutscene(async () => {
    await talk(`
      > The forge is cold. You find the hearthstone, the big flat one Father always stood on, and you lever it up with a bar from the ruins.
      > Underneath, wrapped in oiled leather and then again in linen: a sword. A sword with no hilt, still dark with forge-scale, the steel rippled like water where it has been folded and folded again.
      > Tied to the blade with a red thread is a letter, folded small, sealed with a thumbprint of red wax. His thumb. You would know it anywhere; it has burned scars you watched heal.
    `);
    addItem('unfinished_blade', 1);
    addItem('fathers_letter', 1);
    setFlag('blade_found');
    const tob = findActor('tobiah');
    if (tob) { put(tob, 'overworld', 50, 99, 2); }
    await talk(`
      tobiah: That's his seal, right enough. He had your mother write it for him, I expect. He was proud of her letters.
      tobiah: Shall I... can you read it, lad? I can read it to you, if you like.
    `);
    const canRead = skill('reading') >= 2;
    const c = await choose([
      { id: 'read', text: '[Read it yourself]', if: () => canRead },
      { id: 'you', text: 'Read it to me. Please.', if: () => !canRead },
      { id: 'self', text: 'No. I want to read it myself. With my own eyes.', if: () => !canRead },
      { id: 'later', text: 'Not now. I can\'t. Not now.' },
    ]);
    if (c === 'read') { await readAndWait('fathers_letter'); remember('letter_read_self'); }
    else if (c === 'you') {
      await talk(`
        > Tobiah breaks the seal very gently, as if it might hurt. He reads it slowly. His voice cracks twice, and the second time he has to stop.
      `);
      await fatherLetterRead(true);
    } else if (c === 'self') {
      await talk(`
        tobiah tender: ...Yes. Yes, I think that's right. Some words ought to be read with your own eyes.
        tobiah: Then come to me, lad. I'm going to Linden Hill to help with the wounded; I'll be at the church there. I'll teach you your letters. Every day, if you like. It's not so hard. Children do it. Even Pavel could do it, if he sat still.
      `);
      setFlag('reading_offered');
      remember('letter_waits');
    } else {
      await say('tobiah', 'sad', 'Keep it close, then. It will wait for you. Letters are patient. More patient than people.');
      setFlag('reading_offered');
    }
    await talk(`
      tobiah: Now. Your mother and sister. They aren't among the dead, and they aren't in the village. Look around the ruins, lad. Look for anything. Then go east, to the crossroads. The ones who got away went that way.
    `);
    setStage('main_ashes', 'search');
    if (has('mothers_apron')) setStage('main_ashes', 'crossroads');
  });
}

/** The letter, read aloud or read at last. */
export async function fatherLetterRead(byTobiah: boolean) {
  await card('', byTobiah ? 'Tobiah reads' : 'You read, slowly, one word at a time', '"My son,\n\nYour mother is writing this for me, because my hands are better with iron than with a quill. So if the letters are pretty, thank her. If the words are clumsy, blame me.\n\nThis blade is yours. I have been working it at night, when you were asleep and thought I was drinking at Jiří\'s. I was also drinking at Jiří\'s.\n\nYou are going to be a better smith than me.\n\nI am not a man for words, son. So here are only three.\n\nI am proud."', { secs: 20 });
  S.flags.letter_read = true;
  sting('sad');
  addBuff('warmth', 6 * 60);
}

async function arriveCamp() {
  completeQuest('main_ashes');
  await cutscene(async () => {
    const jiri = findActor('jiri');
    if (jiri) { hold(jiri, true); jiri.face(G.player.x, G.player.y); }
    forceMusic('sorrow');
    await talk(`
      > The crossroads below Linden Hill. Carts, lean-tos, a few tents, cookfires smoking in the rain. Perhaps a hundred people from four villages. Hollowbrook, Lhota, Dubá. Faces you know, smudged and hollow.
      jiri sad: {name}? {name}! Merciful God. We thought... when we saw the green burning...
      > Jiří the reeve, who counted the rents and complained about the crusts, is sitting in the mud with no hat and no shoes. He takes your hand in both of his and doesn't let go.
      jiri: My Anežka is dead. The roof. I couldn't... She's dead. But your mother! {name}, your mother is here! She's alive!
    `);
    await talk(`
      jiri worried: She's in the far tent, with the wounded. She took a sword-cut across the side, trying to pull Lida off a horse. They say she ran after it for half a mile. Bleeding. Screaming your sister's name.
      jiri: She's feverish, lad. Go to her. Go.
    `);
    if (jiri) hold(jiri, false);
  });
  startQuest('main_mother', 'find');
}

// ---------------------------------------------------------------- the far tent

function registerTalks() {
  const act1 = () => ACT() === 1;
  // ---------- Tobiah, Act I opening ----------
  topic('tobiah', {
    id: 'a1_ruins', auto: true, text: '', if: () => qAt('main_ashes', 'bury', 'forge', 'search'),
    run: async () => {
      if (qAt('main_ashes', 'bury')) await say('tobiah', 'sad', 'The grave is ready, beside the chapel. East of the door. Come when you\'re ready. There\'s no hurry. There\'s no hurry any more.');
      else if (qAt('main_ashes', 'forge')) await say('tobiah', 'neutral', 'Under the hearthstone, he said. The big flat stone he stood on.');
      else await say('tobiah', 'neutral', 'Look for anything, lad. Anything of theirs. Then go east, to the crossroads.');
      return 'end';
    },
  });

  // ---------- Marta, feverish ----------
  topic('marta', {
    id: 'a1_fever', auto: true, text: '', if: () => qAt('main_mother', 'find'),
    run: async (a) => { await feverScene(a); return 'end'; },
  });
  topic('marta', {
    id: 'a1_sick', auto: true, text: '', if: () => qAt('main_mother', 'wenda', 'gather', 'brew') && !has('feverwort_remedy'),
    run: async () => {
      await talk(`
        > Mother is asleep, or something like it. Her breath rattles. Her forehead is burning. Someone has put a wet cloth on it and it has already dried.
        marta sleep: ...the loaves... Radek, the loaves are burning...
      `);
      return 'end';
    },
  });
  topic('marta', {
    id: 'a1_cure', auto: true, text: '', if: () => qAt('main_mother', 'wenda', 'gather', 'brew', 'give') && has('feverwort_remedy'),
    run: async () => {
      removeItem('feverwort_remedy');
      await talk(`
        > You lift her head and hold the bottle to her lips. She fights you at first, turning her face away the way Lida does with medicine, and then she drinks. All of it.
        > It smells of willow and bitter earth. Within the hour her breathing is quieter. By evening her skin is cool and damp, and she is sleeping properly, deeply, the way people sleep when they intend to wake up.
        hanka tender: That's the fever breaking. That's good. That's so good, {name}.
      `);
      qVar('main_mother', 'given', S.minutes);
      setStage('main_mother', 'rest');
      addXp('alchemy', 10);
      addXp('herbalism', 6);
      return 'end';
    },
  });
  topic('marta', {
    id: 'a1_resting', auto: true, text: '', if: () => qAt('main_mother', 'rest'),
    run: async () => { await narrate('Mother is sleeping. Her face has colour in it again. Let her rest. Come back tomorrow.'); return 'end'; },
  });
  topic('marta', {
    id: 'a1_awake', auto: true, text: '', if: () => qAt('main_mother', 'talk'),
    run: async (a) => { await motherAwake(a); return 'end'; },
  });

  // ---------- Jiří at the camp ----------
  topic('jiri', {
    id: 'a1_wenda', text: 'Is there nothing we can do for her fever?', if: () => qAt('main_mother', 'wenda'),
    run: async () => {
      await talk(`
        jiri: The barber in Linden Hill would bleed her, and she'd die of it. The priest would pray, and she'd die of that.
        jiri: But there's Old Wenda. The herb-wife, in the south woods, past the Hunter's Lodge road. People say she's a witch. My Anežka went to her for the coughing sickness, and she came home cured.
        jiri: Hanka, the Svobodas' girl, was Wenda's apprentice. She got away, they say. Went into the woods.
      `);
    },
  });
  topic('jiri', {
    id: 'a1_bertram', text: 'What now, Jiří? What happens to all of us?', if: () => act1() && qDone('main_ashes') && !qActive('main_bertram') && !qDone('main_bertram'),
    run: async () => {
      await talk(`
        jiri: Now? Now the lord must be told. Sir Bertram in Linden Hill. We were his village. We paid his rents, fought his wars, baked his bread. He owes us justice, and bread, and roofs before winter.
        jiri sad: I sent a boy yesterday. They didn't let him past the gate. Look at us. Who'd let us past a gate?
        jiri: But you. You saw it. You saw the man who led them. Go to the castle, {name}. Make him hear it.
      `);
      startQuest('main_bertram', 'go');
    },
  });
  greet('jiri', async (a) => { await say(a, 'sad', act1() ? 'I keep counting. Heads, carts, loaves. It\'s all I know how to do. Counting.' : 'Ah. The smith\'s son.'); });

  // ---------- Vojta at the camp ----------
  topic('vojta', {
    id: 'a1_hammer', auto: true, text: '', once: true, if: () => act1() && qDone('main_ashes'),
    run: async () => {
      await talk(`
        > Vojta is sober. You have never seen Vojta sober. It makes him look like somebody else, somebody older and much more frightened.
        vojta sad: Lad. I've something of yours.
        > He unwraps a sack. Inside is your father's hammer, the handle worn smooth where his hand held it for twenty years.
      `);
      if (chose('vojta_forgiven')) await talk(`
        vojta: I found it on the green, in the ashes, before the others came back. I knew it straight off.
        vojta tender: I owed him three groschen, and you told me to keep them. I owe your family a good deal more than three groschen now. Take it. Please.
      `);
      else await talk(`
        vojta: I found it on the green, in the ashes. God forgive me, my first thought was what the tanner would give me for the iron.
        vojta sad: My second thought was your father, mending my scythe at midnight so nobody would see me beg. Take it. It's his. It's yours.
      `);
      addItem('smith_hammer', 1);
      addRel('vojta', 3);
      tip('equip', 'Open your inventory (<b>I</b>) to equip Father\'s hammer. It hits hard.');
      return 'end';
    },
  });
  greet('vojta', async (a) => { await say(a, 'sad', act1() ? 'No songs today, lad. I can\'t find a single one.' : '♪ ...and the moon came down to drink... ♪'); });

  // ---------- Bára and Marek ----------
  topic('bara', {
    id: 'a1_bara', auto: true, once: true, text: '', if: () => act1() && qDone('main_ashes'),
    run: async () => {
      if (qDone('side_geese')) {
        setFlag('bishop_lives');
        await talk(`
          bara: The Bishop woke me. Honking like the Last Trump, an hour before the fire reached my roof. I'd not have woken else.
          bara tender: I carried him all the way here under my arm. He bit me eleven times. God bless that wicked bird.
          > Behind her, the Bishop regards you with a flat black eye. He does not hiss. Perhaps he remembers you.
        `);
        spawnCast();
      } else {
        await talk(`
          bara sad: My geese are gone. All of them. Even the Bishop. They took them for the pot, I suppose. Forty years of geese.
          bara: It's stupid, to weep for geese. With everything. With Tonda's grave burned and the Novák children... It's stupid.
          > She weeps for the geese. You let her.
        `);
      }
      return 'end';
    },
  });
  topic('marek', {
    id: 'a1_marek', auto: true, once: true, text: '', if: () => act1() && qDone('main_ashes'),
    run: async () => {
      await talk(`
        marek sad: They took Lida. They put her on a horse and she kicked the man in the face. She kicked him really hard.
        marek cry: She said she was going to teach me to fight. She promised. When's she coming back?
      `);
      const c = await choose([
        { id: 'bring', text: 'I\'m going to bring her back, Marek.' },
        { id: 'dunno', text: 'I don\'t know, Marek.' },
      ]);
      if (c === 'bring') { await say('marek', 'sad', 'Promise? ...Lida says you always keep promises. She says you\'re annoying but you keep promises.'); remember('promised_marek'); }
      else await say('marek', 'cry', 'Grown-ups always know. Why don\'t you know?');
      return 'end';
    },
  });

  // ---------- Hanka at Wenda's ----------
  topic('hanka', {
    id: 'a1_reunion', auto: true, once: true, text: '', if: () => act1(),
    run: async () => { await hankaReunion(); return 'end'; },
  });
  topic('hanka', {
    id: 'a1_where', text: 'Where does angelica grow?', if: () => qAt('main_mother', 'gather'),
    run: async () => {
      await talk(`
        hanka: In the damp grove where the brook pools, north-west of here, past the old woodcutters' track. It likes its feet wet and its head in the shade, like Vojta.
        hanka: The root is the part you want. Pale, forked, smells like celery and church incense. Willow you'll find along any water. Feverfew likes the sandy banks.
      `);
    },
  });
  greet('hanka', async (a) => { await say(a, act1() ? 'tender' : 'happy', act1() ? 'I\'m here. What do you need?' : 'Hello, smith.'); });

  // ---------- Wenda ----------
  topic('wenda', {
    id: 'a1_recipe', auto: true, text: '', if: () => qAt('main_mother', 'wenda'),
    run: async () => {
      await talk(`
        wenda: So you're the smith's boy. Hanka talks about you when she thinks I can't hear. I can always hear.
        player: My mother has the wound-fever. They say you can cure it.
        wenda: They say a lot of things. They say I eat children. I've tried, and they're very stringy.
        wenda: Wound-fever. Hot skin, rattling breath, talking to the dead? How long?
        player: Two days now. Nearly.
        wenda: Then you've not long. Listen, because I don't say things twice.
      `);
      addItem('feverwort_recipe', 1);
      if (!S.recipes.includes('feverwort_remedy')) S.recipes.push('feverwort_remedy');
      await talk(`
        wenda: Feverfew. Willow bark. Angelica root. Feverfew and willow you can find by any water, or buy from me for more than they're worth. Angelica grows in the damp grove, north-west, where the brook pools. Only there.
        wenda: Then you brew it on my bench. You. Not me. I don't brew for people who have hands of their own.
        wenda: Water. The bark goes in whole, and you boil it. Then the feverfew and the root, ground fine, and you boil it again. Then you bottle it, and you run.
        hanka worried: I'll come to the camp when it's brewed, Wenda. I'll dress her wound properly.
        wenda smirk: You'll do as you like. You always do. It's why I kept you.
      `);
      if (!has('feverfew')) { addItem('feverfew', 1); await narrate('Hanka presses a bunch of feverfew into your hand. "One less thing to find," she whispers.'); }
      setStage('main_mother', 'gather');
      if (has('feverfew') && has('willow_bark') && has('angelica')) setStage('main_mother', 'brew');
      tip('alchemy', 'At an alchemy bench, follow the recipe\'s steps in order: base liquid, herbs (whole or ground), boiling, bottling. Read Wenda\'s bark recipe in your inventory if you forget.', 9000);
      return 'end';
    },
  });
  greet('wenda', async (a) => { await say(a, 'neutral', 'Mind the drying herbs. And the cat. There isn\'t a cat. Mind it anyway.'); });

  // ---------- Bertram ----------
  topic('bertram', {
    id: 'a1_audience', auto: true, text: '', if: () => qAt('main_bertram', 'audience', 'go'),
    run: async (a) => { await audience(a); return 'end'; },
  });
  topic('bertram', {
    id: 'a1_report', auto: true, text: '', if: () => qAt('main_crowstone', 'report') && has('harrow_orders'),
    run: async (a) => { await reportOrders(a); return 'end'; },
  });
  greet('bertram', async (a) => { await say(a, 'neutral', 'Yes? Speak, lad. I haven\'t the patience for bowing today.'); });

  // ---------- Lukáš ----------
  greet('lukas', async (a) => { await say(a, 'neutral', 'The steward\'s office is for matters of the household. Is this a matter of the household?'); });

  // ---------- Ondřej ----------
  topic('ondrej', {
    id: 'a1_lesson', auto: true, text: '', if: () => qAt('main_bertram', 'train'),
    run: async (a) => { await lessonOne(a); return 'end'; },
  });
  greet('ondrej', async (a) => { await say(a, 'smirk', 'You again. Still alive? Good. The dead make terrible recruits.'); });

  // ---------- Jirka ----------
  topic('jirka', {
    id: 'a1_jirka', auto: true, text: '', if: () => !flag('jirka_done') && !flag('deserters_fight'),
    run: async () => { await desertersParley(true); return 'end'; },
  });
  greet('jirka', async (a) => { await say(a, 'neutral', 'Smith\'s boy. Still breathing. So am I. Funny old world.'); });
}

async function feverScene(a: Actor) {
  await cutscene(async () => {
    forceMusic('sorrow');
    await talk(`
      > The far tent smells of blood and vinegar. Mother lies on a bedroll, grey as ash, her hair loose and dark with sweat. You have never seen her hair loose in daylight.
      marta pain: Radek? Radek, you're back. Did you bar the door?
      marta cry: They took her, Radek. I held on. I held on to her foot, her little foot, and the horse... the horse just kept going...
    `);
    const c = await choose([
      { id: 'me', text: 'Mother. It\'s me. It\'s {name}.' },
      { id: 'hand', text: '[Take her hand]' },
    ]);
    if (c === 'me') await talk(`
      marta pain: {name}? My boy... my good boy. You're all over mud. Where's your father? He went out... he went out to them with his hammer...
    `);
    else await talk(`
      > Her hand is burning hot, and it grips yours as hard as it ever did when you were small and crossing the brook on the stepping stones.
      marta pain: {name}. My boy. Where's your father? He went out to them. He went out with his hammer...
    `);
    const t = await choose([
      { id: 'truth', text: 'Father is dead, Mother. I\'m sorry. He\'s dead.' },
      { id: 'lie', text: 'He\'s... resting, Mother. You rest too.' },
      { id: 'silent', text: '[Say nothing. Hold her hand.]' },
    ]);
    if (t === 'truth') {
      await talk(`
        > She looks at you for a long moment, and you see her understand it, and then you see the fever take the understanding away again, like a wave taking a footprint.
        marta pain: ...No. No, he's at the forge. He's always at the forge. Tell him to come to bed.
      `);
      remember('told_mother', 'truth');
    } else if (t === 'lie') {
      await talk(`
        marta tender: Resting. Good. He works too hard. Tell him... tell him the honey loaf's on the shelf. He'll pretend he doesn't want it.
        > You tell her you will. You tell her he'll eat it all. Your voice sounds strange to you, like someone else's.
      `);
      remember('told_mother', 'lie');
    } else {
      await narrate('You hold her hand until she sleeps. It takes a long time. Once she says Lida\'s name, and once yours, and once, very softly, something you have never heard her say before: the name she called Father when they were young.');
      remember('told_mother', 'silent');
    }
    await talk(`
      > Outside, Jiří is waiting.
      jiri worried: It's the wound-fever. I've seen it in soldiers. It gets into the blood. Three days, lad, from when it starts. Sometimes four.
      jiri: If anyone can help, it's Old Wenda, the herb-wife. In the south woods, down the forest track toward the Hunter's Lodge. Go. Go now.
    `);
    forceMusic(null);
  });
  qVar('main_mother', 'deadline', S.minutes + 3 * DAY - 6 * 60);
  setFlag('mother_found');
  setStage('main_mother', 'wenda');
  if (!S.discovered.includes('wenda')) S.discovered.push('wenda');
}

async function hankaReunion() {
  await cutscene(async () => {
    const h = findActor('hanka');
    if (h) h.face(G.player.x, G.player.y);
    await talk(`
      hanka surprised: {name}?
      > She drops a basket of roots and runs at you, and then she is holding on to you so hard it hurts your burned shoulder, and you don't care at all.
      hanka cry: I saw the smoke from the hill. The whole sky. I thought everybody... I thought you...
    `);
    if (has('hanka_ribbon')) await talk(`
      > She pulls back. She takes your wrist and turns it over. The green ribbon is black with soot, but it's there.
      hanka tender: You kept it on.
      player: You said not to take it off.
      hanka: Idiot. Oh, you idiot.
    `);
    await talk(`
      hanka sad: I ran when the screaming started. Out the back, through the wheat, into the brook. I stayed in the water till morning. I didn't help anyone. I just ran.
      hanka: Wenda found me at dawn, walking in circles. She gave me a blanket and a job, which is her idea of kindness.
    `);
    const c = await choose([
      { id: 'right', text: 'You did right, Hanka. If you had stayed, you would be dead.' },
      { id: 'me', text: 'I didn\'t save anyone either. I tried. I didn\'t.' },
      { id: 'hold', text: '[Hold her]' },
    ]);
    if (c === 'right') await say('hanka', 'sad', 'Maybe. It doesn\'t feel right. It feels like the brook is still running over me.');
    else if (c === 'me') await say('hanka', 'tender', '...Then we\'ll both have to do better. From now on. Both of us.');
    else { await narrate('You hold her. The forest drips around you. For a while, neither of you has to be brave.'); addRel('hanka', 3); }
    addRel('hanka', 3);
    if (qAt('main_mother', 'wenda')) await say('hanka', 'worried', 'Your mother? Is she... what\'s happened? Come inside. Tell Wenda. Quickly.');
  });
}

function motherDies() {
  if (flag('mother_dead')) return;
  setFlag('mother_dead');
  S.deadNpcs.marta = true;
  const m = findActor('marta');
  if (m) removeActor(m);
  failQuest('main_mother');
  sting('sad');
  notify('A cold feeling, like a door closing somewhere far away.', 'bad', 6000);
}

async function motherMourned() {
  setFlag('mother_mourned');
  await cutscene(async () => {
    forceMusic('sorrow');
    await talk(`
      > Jiří sees you coming, and he gets up from the fire, and you know from the way he gets up.
      jiri sad: She went in the night, lad. Quietly, at the end. The fever broke just before, and she was clear, for a little while.
      jiri: She asked for Radek. And for Lida. And for you. I told her you'd gone for medicine. She said, "Of course he has. He's a good boy." Then she slept.
      jiri: We buried her by the crossroads shrine. Tobiah said the words. I'm sorry. God, I'm so sorry.
    `);
    await narrate('There is a mound of fresh earth by the wayside shrine, with a cross of two sticks bound with a strip of flour-white cloth. It is very small. She was never small.');
    addBuff('grief', 2 * DAY);
    remember('mother_died');
  });
}

async function motherAwake(a: Actor) {
  await cutscene(async () => {
    a.pose = 'sit';
    forceMusic('hope');
    await talk(`
      > Mother is sitting up, propped against a sack of meal, holding a bowl of Hanka's soup in both hands. Her face is thin and grey and she is scowling at the soup, and she is the most beautiful thing you have ever seen.
      marta tender: There he is. Look at your boots. Did you walk through every bog in the Lindenmark?
      player: Most of them.
      marta: Come here. Come here, my heart.
      > She holds you, and she smells of sickness and herbs and underneath it, faintly, still, of bread.
    `);
    const told = chose('told_mother');
    if (told === 'lie') await talk(`
      marta sad: You told me he was resting. In the fever. I remember that.
      marta tender: I knew. I knew when you said it. You were always a terrible liar, {name}. Since you were three and told me the dog ate the honey cake. Thank you for trying.
    `);
    else if (told === 'truth') await talk(`
      marta sad: You told me. In the fever. I thought it was a dream. I kept waking up and trying to make it be a dream. It wouldn't be.
    `);
    else await talk(`
      marta sad: Jiří told me. About your father. About the green.
    `);
    await talk(`
      marta cry: Twenty-two years. I used to tell him he smelled like a chimney. I used to tell him to stop humming. God forgive me, I'd give anything to hear him hum.
      > She weeps, and you hold her, and the rain comes and goes on the canvas.
      marta: ...And Lida. Oh, my little fox. My little fox, on that horse. She was reaching back for me. I had her foot, {name}. I had her.
    `);
    const c = await choose([
      { id: 'bring', text: 'I\'ll bring her home, Mother. Whatever it takes.' },
      { id: 'alive', text: 'She\'s alive. They took the children. You don\'t take a child to kill her.' },
    ]);
    if (c === 'bring') await talk(`
      marta: Don't you promise me that. Don't you dare. I can't lose you as well. I can't.
      marta tender: ...Promise me you'll come back. Both of you. Promise me that one instead.
      player: I promise.
    `);
    else await talk(`
      marta: Alive. Say it again.
      player: She's alive, Mother.
      marta tender: ...Alive. Yes. She bit a man once, you know, at the fair, for kicking Crumb. She'll be biting them all. God help them.
    `);
    remember('promised_mother');
    await talk(`
      marta: Listen. When I can stand, I'm going to Linden Hill. Old Greta at the bakery has been after me for years to come and bake for her. I'll bake. It's what I know how to do. My hands know it even when my head doesn't.
      marta tender: You'll always have bread, {name}. Wherever you go. You'll always have bread.
    `);
    addBuff('hope', 2 * DAY);
    addBuff('warmth', 8 * 60);
  });
  setFlag('mother_cured');
  setFlag('hanka_moved');
  completeQuest('main_mother');
  spawnCast();
  if (!qActive('main_bertram') && !qDone('main_bertram')) startQuest('main_bertram', 'go');
}

// ---------------------------------------------------------------- Linden Hill

async function stewardGate() {
  const lukas = findActor('lukas');
  if (!lukas) { setStage('main_bertram', 'audience'); return; }
  await conversation(async () => {
    lukas.face(G.player.x, G.player.y);
    await talk(`
      lukas: Halt. You. Yes, you. Where do you imagine you're going?
      player: To see Sir Bertram.
      lukas: Sir Bertram hears petitions on Tuesdays, after Terce, from persons who have been announced. You have not been announced. You have been rolled in a fireplace.
    `);
    for (;;) {
      const clean = S.dirt < 35;
      const c = await choose([
        { id: 'hb', text: 'I\'m from Hollowbrook. I saw the man who burned it. He\'ll want to hear me.', check: { stat: 'speech', need: 4 } },
        { id: 'loud', text: '[Shout past him] SIR BERTRAM! HOLLOWBROOK IS BURNED!' },
        { id: 'clean', text: '[You have washed] I\'ve come as a petitioner, properly. Announce me.', if: () => clean },
        { id: 'later', text: 'I\'ll come back.' },
      ]);
      if (c === 'later') { await say(lukas, 'neutral', 'Wash first. There\'s a bathhouse by the south gate. Two groschen. The lord\'s nose is very sensitive.'); tip('bath', 'Charisma counts: bathe at the bathhouse, or wash at a fountain, and dress well.'); return; }
      if (c === 'hb' && !lastCheck) { await say(lukas, 'angry', 'Everyone has seen something. Out.'); continue; }
      if (c === 'loud') {
        await talk(`
          bertram angry: Lukáš! What in God's name is that noise? Let the lad through!
          lukas: ...My lord.
        `);
        addRel('lukas', -3);
        break;
      }
      await say(lukas, 'worried', c === 'clean' ? 'Hmph. Very well. You may approach. Bow. Don\'t touch anything.' : '...Hollowbrook. God\'s mercy. Very well. Go in. Bow when you reach the dais.');
      break;
    }
    setStage('main_bertram', 'audience');
  });
}

async function audience(a: Actor) {
  if (qAt('main_bertram', 'go')) setStage('main_bertram', 'audience', true);
  await cutscene(async () => {
    a.face(G.player.x, G.player.y);
    await talk(`
      > Sir Bertram of Linden Hill is older than you expected, and thinner. He sits very straight, as if his back remembers armour. His eyes have the look of a man who does not sleep.
      bertram: Hollowbrook, Lukáš says. You were there?
      player: I'm the smith's son. Radek's son. I was on the green when they killed him.
      bertram sad: Radek. I knew your father. He shod my destrier for twenty years and never once let me pay him what the work was worth.
      bertram: Tell me. All of it. Leave nothing out.
    `);
    await narrate('You tell him. The fire, the green, the black helm. Your father\'s hand on the black knight\'s ankle. The carts going north with the children. When you finish, the hall is very quiet.');
    await talk(`
      bertram angry: Two hundred horse. In my valley. Burning my people.
      bertram: A company of hired swords. Harrow's, from the description. The Swabian. They've been burning their way along the border all summer for whoever will pay them.
      bertram sad: And I have forty men, lad. Forty men and a wall. If I ride out against Harrow in the open, I lose my forty men, and then Linden Hill burns too, and every soul in it.
    `);
    const c = await choose([
      { id: 'justice', text: 'Then what do you give us, my lord? Our dead want justice.' },
      { id: 'lida', text: 'They have my sister. They took the children north.' },
      { id: 'serve', text: 'Then let me help. I\'ll do anything.' },
    ]);
    if (c === 'justice') await talk(`
      bertram: Justice. Yes. Justice needs a guilty party, and a court, and an army to enforce it. I have the court. I lack the rest.
      bertram: But I will not sit on my hands, lad. I promise you that.
    `);
    else if (c === 'lida') await talk(`
      bertram sad: ...I buried my son two summers ago. At Kutná. He was twenty. They sent me his sword and his ring.
      bertram: Your sister is alive until we learn otherwise. Hold on to that. It is more than most get.
    `);
    else await talk(`
      bertram: Anything is a large word. Men who say it usually mean "something dramatic." I have plenty of drama. I need eyes.
    `);
    await talk(`
      bertram: Here is what I will do. The people at the crossroads will be fed from my granary, from today. Lukáš, see to it.
      lukas worried: My lord, the granary is—
      bertram angry: From today, Lukáš.
      bertram: And here is what you will do. Someone paid Harrow. Companies like his don't burn villages for sport; they burn them for coin. Jiří's letters spoke of riders at the Crow's Stone before the raid. They met someone there. I want to know who.
      bertram: But first you'll see Sergeant Ondřej in the training yard. I will not send the son of my smith to his death because he doesn't know which end of a sword to hold.
    `);
    addMoney(15);
    notify('Sir Bertram gives you 15 groschen "for boots, and bread".', 'item', 4000);
    setFlag('bertram_service');
    S.rep.linden = Math.max(S.rep.linden, 40);
    setStage('main_bertram', 'train');
  });
}

const lesson = { on: false, blocks: 0 };

async function lessonOne(a: Actor) {
  await talk(`
    ondrej: So you're the smith's boy. Sir Bertram says I'm to make a soldier of you. Sir Bertram says a lot of things.
    ondrej smirk: Let's see what we're working with. Take this stick. I'm going to hit you with mine. Your job is to stop me.
    ondrej: Not by blocking early, like a frightened virgin. By blocking late. Right at the last moment, when my stick is about to kiss your ear. Do that and I'll stumble, and you'll own me.
    ondrej: Three perfect blocks. Then we talk.
  `);
  tip('pblock', 'Hold <b>Block</b> (Right click / K) just <i>before</i> his blow lands. A glint shows when he is about to strike.', 9000);
  const prev = S.equip.weapon;
  if (!has('stick')) addItem('stick', 1, { quiet: true });
  equip('stick');
  a.combat.weapon = { id: 'stick', kind: 'stick', slash: 0, stab: 0, blunt: 6, reach: 21, speed: 1, staminaCost: 8 };
  a.mem.nonlethal = true;
  a.mem.spar = true;
  a.mem.skill = 3;
  a.mem.aggression = 0.7;
  a.mem.schedule = undefined;
  lesson.on = true;
  lesson.blocks = 0;
  let down = false;
  const off = protectPlayer(() => { down = true; });
  a.hostile = true; a.mem.target = 'player'; a.mem.alerted = true;
  setTimeout(async () => {
    await waitUntil(() => lesson.blocks >= 3 || down || a.hp < a.maxHp * 0.4, 150);
    off();
    lesson.on = false;
    a.hostile = false; a.mem.target = null; a.mem.alerted = false; a.hp = a.maxHp;
    a.mem.nonlethal = false; a.mem.spar = false; a.mem.skill = 8;
    await waitUntil(() => canRunScene(), 5);
    await conversation(async () => {
      if (lesson.blocks >= 3) {
        await talk(`
          ondrej: ...Better. Much better. You've got your father's wrists. I once saw him hold a horse's hoof for an hour while it tried to kick his head off.
          ondrej: Keep practising on the dummies. And come back when you want more. There's a great deal more.
        `);
        addXp('defense', 10);
      } else if (a.hp < a.maxHp * 0.4) {
        await talk(`
          ondrej pain: Ow. Well. That wasn't the lesson. But it's a lesson, I suppose. For me.
          ondrej: Next time block, then hit. The hitting you seem to have covered.
        `);
        addXp('blunt', 6);
      } else {
        await talk(`
          ondrej: On your feet. You blocked like a drunk ox, but you kept getting up. That's half of soldiering. The other half is blocking.
          ondrej smirk: Go on. Sir Bertram's waiting on you. Come back for the other half when you're ready.
        `);
        addXp('defense', 5);
      }
      await talk(`
        ondrej: Now. The Crow's Stone. It's up the old pass road, north-west of here, past the chapel ruin turning. Big grey rock, looks like a crow if you've been drinking. Take a torch if you go at night.
      `);
    });
    if (prev) equip(prev);
    G.player.hp = Math.max(G.player.hp, G.player.maxHp * 0.7);
    completeQuest('main_bertram');
    startQuest('main_crowstone', 'go');
    spawnCast();
    offerTraining();
  }, 50);
}

// ---------------------------------------------------------------- the Crow's Stone

async function crowStone() {
  await cutscene(async () => {
    const crumb = findActor('crumb');
    await talk(`
      > A big cold campfire, ringed with stones. Horse dung, a great deal of it. Twenty horses, thirty? Wheel ruts. A smashed wine jar.
      > In the ashes, a lump of red wax, half-melted. You pick it out. It's a seal, or half of one: a black bird with its wings spread. Somebody burned a letter here and didn't wait for it to finish burning.
    `);
    await wait(0.4);
    if (crumb) { crumb.pose = 'idle'; crumb.emoteShow('!', 1.5); sfx('whine', crumb.x, crumb.y); }
    await talk(`
      > A sound behind the rock. A thin, broken whine you would know anywhere, in any crowd, at the bottom of any well.
      player surprised: ...Crumb?
    `);
    if (crumb) {
      crumb.mem.hold = false;
      await walkTo(crumb, G.player.x + 10, G.player.y + 2, { run: true, timeout: 4 });
      crumb.face(G.player.x, G.player.y);
      for (let i = 0; i < 5; i++) fx('heart', crumb.x + (i - 2) * 3, crumb.y - 16);
      sfx('bark', crumb.x, crumb.y);
    }
    forceMusic('hope');
    await talk(`
      > He is filthy, and thin as a rake, and limping on one back leg, and there is dried blood on his muzzle that isn't his. He throws himself against your legs and cries like a puppy.
      > Something is knotted in the fur of his collar: a strip of red cloth. A girl's hair ribbon. Lida's ribbon.
      player tender: You followed them. You followed her all the way here. Oh, you good boy. You good, good boy.
      > She tied it there. She must have. Her hands were tied or held, and she got one hand free long enough to tie her ribbon to the dog, so that someone would know. Clever little fox.
    `);
    remember('ribbon_found');
    setFlag('crumb_found');
    S.dog.owned = true;
    S.dog.hp = 40;
    if (crumb) { crumb.tags.delete('quest'); crumb.mem.follow = 'player'; }
    else crumbJoins(G.player.x + 12, G.player.y);
    await talk(`
      > The tracks are easy to read now that you know how to look. Most of the horses went north, toward the Ravenstone road, with the carts.
      > Three riders broke away. Their tracks go south-west, down toward the Wolfwood. Stragglers. Deserters, maybe.
      > Crumb sniffs the tracks, and growls, low and steady.
    `);
    forceMusic(null);
  });
  addItem('half_seal', 1);
  setStage('main_crowstone', 'trail');
  tip('dog', 'Crumb is with you again. Press <b>Q</b> to give him orders. He fights at your side and can sniff out hidden things.', 8000);
}

async function desertersParley(fromTalk = false) {
  if (flag('jirka_done') || flag('deserters_fight')) return;
  const j = findActor('jirka');
  if (!j) return;
  if (!qActive('main_crowstone') || qAt('main_crowstone', 'go')) {
    // not here on business yet: a warning
    j.face(G.player.x, G.player.y);
    await talk(`
      jirka: That's far enough, friend. There's nothing in this camp worth dying for, and three good reasons for you to turn around.
    `);
    void fromTalk;
    return;
  }
  setStage('main_crowstone', 'deserters', true);
  await cutscene(async () => {
    j.face(G.player.x, G.player.y);
    for (const d of hostiles('deserters')) d.face(G.player.x, G.player.y);
    await talk(`
      > Three men get up from the fire as you come out of the trees. They wear black gambesons with the badges torn off. Their hands go to their weapons.
      > The fourth doesn't get up. He's red-haired, and one of his ears is a ragged stump.
      jirka: Stop there. Company or Bertram's?
      player: Hollowbrook.
      > A silence. One of the men swears softly and looks away.
      jirka: ...Ah. Well. That's a word we don't say in this camp.
    `);
  });
  await conversation(async () => {
    const seal = has('half_seal');
    const c = await choose([
      { id: 'talk', text: 'I\'m not here for your purses. I want to know who paid for Hollowbrook.', check: { stat: 'speech', need: 4 } },
      { id: 'seal', text: '[Show the half seal] I know it was bought. I want the name.', if: () => seal, check: { stat: 'speech', need: 2 } },
      { id: 'threat', text: 'Talk, or I tell Sir Bertram exactly where you sleep.', check: { stat: 'strength', need: 5 } },
      { id: 'fight', text: '[Draw your weapon] You were there. That\'s enough.' },
    ]);
    if (c === 'fight' || !lastCheck) {
      if (c !== 'fight') await say('jirka', 'angry', 'No. I don\'t think I will. Lads.');
      else await say('jirka', 'angry', 'Aye. We were. Come on, then, and get it over with.');
      setFlag('deserters_fight');
      const jj = findActor('jirka');
      if (jj) { jj.hostile = true; jj.mem.nonlethal = true; }
      for (const d of [...hostiles('deserters')]) { d.hostile = true; d.mem.alerted = true; }
      return;
    }
    await jirkaTalk(false);
  });
}

async function jirkaYields() {
  if (flag('jirka_done')) return;
  const j = findActor('jirka');
  for (const d of hostiles('deserters')) { d.hostile = false; d.mem.target = null; d.surrendered = false; }
  if (j) { j.hostile = false; j.mem.target = null; j.mem.down = false; j.pose = 'idle'; j.hp = Math.max(j.hp, 30); }
  await conversation(async () => { await jirkaTalk(true); });
}

async function jirkaTalk(beaten: boolean) {
  setFlag('jirka_done');
  if (beaten) await talk(`
    jirka pain: Enough! Enough, God damn it. You fight like your father. I saw him on the green, you know. He killed two of ours with a hammer.
    jirka: You want to know who paid? Fine. I'll tell you. I'd have told you anyway, you stubborn bastard.
  `);
  await talk(`
    jirka: We were told it was a rebel village. Rebels. Hollowbrook. Rebels with bread ovens and geese.
    jirka sad: I've done bad things for the Company. I've burned barns, I've taken what wasn't mine. But children in carts... I watched Dieter put a little girl on a horse like a sack of turnips, and I thought, that's it. That's the line. I didn't know I had a line until I saw it.
    jirka: So we left. Me and the lads. Took what we were owed, and a little extra.
  `);
  await talk(`
    jirka: Here. The extra.
    > He takes a folded paper from inside his gambeson. It is sealed with red wax. A black raven, wings spread. The same bird as your half-seal, whole.
    jirka: Dieter's orders. I took them from his saddlebag the night after. Insurance, you might say. If the Company ever came for me, I'd have something to sell to whoever was hanging me.
  `);
  addItem('harrow_orders', 1);
  await talk(`
    player: The children. Where did they take the children?
    jirka: The baggage train. The Company's camp, under Ravenstone crag. Carrying water, mucking horses. Most of them.
    jirka: But the red-haired girl... she bit Dieter's hand to the bone when he lifted her. He laughed. Said she had spirit. Said Sir Lothar liked a lively kitchen. They sent her up to the castle. To Ravenstone.
    player: She's my sister.
    jirka tender: ...Then she's alive, lad. She was alive the last I saw her, spitting at Dieter from the back of a cart. She's alive.
  `);
  addBuff('hope', 3 * DAY);
  remember('knows_lida_ravenstone');
  const c = await choose([
    { id: 'spare', text: 'Go, then. And don\'t let me see you in this valley again.' },
    { id: 'ally', text: 'If Sir Bertram marches on Harrow, will you fight?' },
    { id: 'kill', text: 'You were there. You helped. [Kill him]' },
  ]);
  if (c === 'kill') {
    await narrate('He doesn\'t run. He just looks at you, and nods, as if he expected it, and it is done. His men scatter into the trees.');
    const j = findActor('jirka');
    if (j) { j.essential = false; kill(j, G.player); }
    for (const d of hostiles('deserters')) { d.mem.fleeT = 20; d.mem.fleeFrom = G.player; d.mem.despawnOnFlee = true; }
    setFlag('deserters_dead');
    remember('killed_jirka');
  } else if (c === 'ally') {
    await talk(`
      jirka: Fight Harrow? You're madder than your father.
      jirka smirk: ...Aye. If it's for a pardon, and a meal, and the chance to see Dieter's face when we come over the hill. Send word to the Wolfwood, and Jirka One-Ear will come.
      > He snaps his Company badge in two and gives you half.
    `);
    addItem('deserter_token', 1);
    setFlag('deserters_allied');
    remember('spared_jirka');
  } else {
    await say('jirka', 'neutral', 'Fair. More than fair. God keep your sister, smith. I mean that.');
    remember('spared_jirka');
  }
  setStage('main_crowstone', 'report');
}

async function reportOrders(a: Actor) {
  await cutscene(async () => {
    a.face(G.player.x, G.player.y);
    await talk(`
      bertram: You're back. And that look on your face. What have you found?
      > You tell him: the Crow's Stone, the half seal, the deserters. Then you give him the orders.
    `);
    if (skill('reading') >= 2) {
      await readAndWait('harrow_orders');
      await narrate('You read it yourself, every word. "The children may be taken for the baggage train." You read it twice. It doesn\'t get better.');
    } else {
      await talk(`
        > Sir Bertram breaks nothing; the seal is already broken. He reads. His lips move. Then he reads it aloud, in a flat voice, as if reading out a bill of sale.
        bertram: "The village of Hollowbrook on the pass road is to be made an example. It sends iron and bread to Linden Hill, and its smith has been forging for Bertram's garrison. Let the valley see what loyalty to Bertram costs."
        bertram: "The children may be taken for the baggage train. The rest is at your discretion. Your guide will meet you at the Crow's Stone." ...Burn this.
      `);
    }
    await talk(`
      > He turns the letter over. He looks at the seal for a long time. The black raven, wings spread.
      bertram: This is Lothar's seal.
      player: Sir Lothar of Ravenstone. They sent my sister to his kitchens.
      bertram angry: Lothar stood godfather to my son! He carried the boy to the font in his own arms. We were squires together. He has sat at my table every St. Wenceslas for thirty years!
      bertram: A seal can be stolen. A seal can be copied. A deserter will say anything to save his neck.
      player angry: My father died because of that seal.
      bertram sad: ...I know, lad. I know.
    `);
    await talk(`
      bertram: Listen to me. If I accuse the lord of Ravenstone of treason, I must stand before the king's court and prove it. If I am wrong, I am the traitor, and Linden Hill is forfeit, and every soul in it.
      bertram: And if I am right... God help me, if I am right, then Harrow's Company is not a band of robbers. It is Lothar's army. And Lothar holds the only castle between the pass and my walls.
      bertram: Bring me proof, {name}. Proof a court would accept. Not a seal. A ledger, a witness, a letter in his own hand. Find me that, and I will ride to Ravenstone myself.
    `);
    const c = await choose([
      { id: 'yes', text: 'You\'ll have it, my lord.' },
      { id: 'lida', text: 'And my sister? Every day she\'s in that castle...' },
    ]);
    if (c === 'lida') await talk(`
      bertram: Every day she is in that castle, she is alive, because Lothar has a use for her. If I break down his gates without proof, he will have no use for anyone.
      bertram tender: I know what I'm asking. I'm asking you to be patient with your heart in your mouth. I've done it. I did it for two years, waiting for a letter from Kutná. It is the hardest thing there is.
    `);
    await talk(`
      bertram: Lukáš will give you a room at the Crooked Linden, at my expense. Rest. Then find me my proof.
    `);
  });
  addItem('key_tavern_room', 1);
  setFlag('owns:inn');
  completeQuest('main_crowstone');
  await startAct2();
}

// ---------------------------------------------------------------- side: Havel's sword

async function havelHearth() {
  await conversation(async () => {
    if (!has('shovel')) {
      await narrate('Old Havel\'s house is a black square of ash and a chimney. "My old sword\'s under my hearth," he said, "for the next war." The hearthstones are cracked and heavy. You would need a shovel to dig under them.');
      if (!flag('havel_hint')) { setFlag('havel_hint'); tip('shovel', 'Shovels are sold at the Silverdale stores, or by the peddler on the roads.'); }
      return;
    }
    await narrate('You dig under the cracked hearthstones. A hand\'s depth down, your shovel strikes something that rings. A long bundle in greased leather, just as he said.');
    await narrate('An old sword, broad and plain, from the wars of King Charles. There\'s a name scratched on the blade in crooked letters. HAVEL. For the next war, he said. God willing it rusts there.');
    await narrate('It didn\'t rust. The next war came to him instead, on his own bench, on St. John\'s Eve.');
    addItem('havel_sword', 1);
    setFlag('havel_sword_found');
    refreshDecor('overworld');
  });
}
