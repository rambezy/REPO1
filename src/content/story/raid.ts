// St. John's Eve, part two: the midsummer fire, and the night that ends the
// world the player grew up in.

import { G } from '../../G';
import { S, flag, setFlag, hourF } from '../../state';
import { Actor } from '../../world/actor';
import { findActor, getMap, here, removeActor, actors } from '../../world/world';
import { setStage, completeQuest, qAt, qDone } from '../../systems/quests';
import { say, talk, narrate, choose, cutscene, conversation, wait, hold, camTo, camFollow, lastCheck } from '../../systems/script';
import { addItem, has, equip } from '../../systems/inventory';
import { addXp, addBuff } from '../../systems/stats';
import { notify } from '../../ui/notify';
import { sfx, sting } from '../../audio/sfx';
import { card } from '../../ui/cine';
import { weather } from '../../systems/weather';
import { forceMusic } from '../../systems/director';
import { walkTo, settleSchedules } from '../../systems/ai';
import { TILE, rand } from '../../engine/util';
import { fadeTo, travel } from '../../systems/transition';
import { kill } from '../../systems/combat';
import { storyHooks } from '../../systems/interact';
import { emit as fx } from '../../engine/fx';
import { trigger, waitUntil, put, putAt, nearTile, onMap, protectPlayer, addRel, remember, P, setHollowbrook, canRunScene, tip, hostiles } from './lib';
import { spawnCast, fighter, person, FEAST, castHooks } from './cast';
import { startAct1 } from './act1';

const nightStage = () => qAt('main_prologue', 'night');

export function registerRaid() {
  // no sleeping through St. John's Eve; at night, sleeping starts the raid
  storyHooks.bed = (owner?: string) => {
    if ((flag('act') || 0) !== 0) return false;
    if (nightStage() && onMap('hb_home')) {
      if (owner !== 'player') notify('You climb into your own bed, in the corner by the wall.', 'info', 2500);
      startRaidNight();
      return true;
    }
    if (!qAt('main_prologue', 'night', 'raid')) {
      notify('Sleep? On St. John\'s Eve, with the whole village getting ready for the fire? Mother would never forgive you.', 'info', 4000);
      return true;
    }
    return false;
  };
  // if the player stays out all night, exhaustion takes them home
  trigger('raid_late', () => nightStage() && hourF() > 1.5 && hourF() < 5 && canRunScene(), async () => {
    await conversation(async () => { await narrate('You are so tired the stars are swimming. You stumble home and fall into bed with your boots on.'); });
    await travel('hb_home', 'bed_player');
    startRaidNight();
  });
  // the raid: finding Father
  trigger('raid_green', () => qAt('main_prologue', 'raid') && nearTile(38, 102, 8), () => fatherLast());
  // a game loaded mid-raid puts the burning village back as it was
  castHooks.push(() => {
    if (!qAt('main_prologue', 'raid') || flag('father_scene')) return;
    const radek = findActor('radek');
    if (radek) { put(radek, 'overworld', 38, 102, 1); hold(radek, true); radek.mem.schedule = undefined; }
    for (const id of ['marta', 'lida']) { const a = findActor(id); if (a) { a.mapId = '__away'; a.mem.schedule = undefined; } }
    spawnRaiders();
  });
}

// ---------------------------------------------------------------- the feast

export async function feast() {
  setStage('main_prologue', 'feast', true);
  await cutscene(async () => {
    if (hourF() < 20.3) {
      await fadeTo(1, 1);
      S.minutes = Math.floor(S.minutes / 1440) * 1440 + 20.5 * 60;
      await narrate('The sun goes down behind the western hills, slow and red. One by one, the people of Hollowbrook come to the green.');
    }
    setFlag('bonfire_lit');
    const bf = getMap('overworld').byKey('hb_bonfire');
    if (bf) { bf.hidden = false; getMap('overworld').markDirty(); }
    spawnCast();
    settleSchedules();
    for (const id of Object.keys(FEAST)) {
      if (id === 'player') continue;
      const a = findActor(id);
      if (!a) continue;
      put(a, 'overworld', FEAST[id][0], FEAST[id][1], FEAST[id][2]);
      hold(a, true);
      if (id === 'havel') a.pose = 'sit';
    }
    const crumb = findActor('crumb');
    if (crumb) { put(crumb, 'overworld', 36, 104, 2); crumb.mem.follow = null; hold(crumb, true); crumb.pose = 'sit'; }
    const p = P();
    put(p, 'overworld', FEAST.player[0], FEAST.player[1], 0);
    p.mapId = 'overworld';
    forceMusic('feast');
    G.cam.lockX = 37 * TILE + 8; G.cam.lockY = 102 * TILE;
    await fadeTo(0, 1.4);
    await wait(1);
    await talk(`
      > Tobiah lights the bonfire with a taper from the chapel. It catches with a roar. Sparks go up into the violet sky like a flight of burning bees, and everyone cheers.
      tobiah happy: In the name of St. John, who baptised Our Lord in the river Jordan, and who would, I think, have enjoyed a good fire!
      jiri: And in the name of Sir Bertram, our lord and protector! And of the St. Wenceslas rents, which are due in eleven weeks!
      > Somebody throws a turnip at the reeve. It is a wonderful evening.
    `);
    S.hunger = 100;
    addBuff('fed_well', 6 * 60);
    await narrate('There is roast pork, and Mother\'s caraway bread, and honey cakes, and beer from the Rooster. You eat until you can barely move.');
    // Vojta's song
    await talk(`
      vojta happy: ♪ Oh the smith of Hollowbrook, he has arms like oak... ♪
      vojta: ♪ He can bend a bar of iron, but he can't take a joke! ♪
      radek smirk: I can take a joke. I can take you, too, and throw you in the brook.
      > Laughter. Your father almost smiles. Your mother definitely does.
    `);
    // Pavel's dare
    await talk(`
      pavel happy: {name}! The fire! Every man in Hollowbrook jumps the fire on St. John's Eve. For luck. Unless he's a coward.
      marta worried: Pavel, don't you dare put ideas in his head.
      pavel: Too late, Mistress Marta. It's all ideas in there. Nothing else fits.
    `);
    const c = await choose([
      { id: 'jump', text: '[Take a run at the fire and jump]', check: { stat: 'agility', need: 4 } },
      { id: 'you', text: 'You first, miller\'s boy.' },
    ]);
    if (c === 'jump') {
      sfx('dodge');
      if (lastCheck) {
        await talk(`
          > You run, you jump, and for one long heartbeat you are flying over the flames with the heat on your face and the whole village shouting your name.
          > You land clean on the far side. Lida screams with joy. Hanka claps her hands over her mouth.
          radek: Hm.
          > It is the proudest "hm" of your life.
        `);
        addXp('agility', 4);
        addRel('radek', 2);
        remember('jumped_fire');
      } else {
        await talk(`
          > You run, you jump, your foot catches a log, and you sail through the edge of the fire in a shower of sparks.
          > You land in a heap. Your hose is smouldering. Pavel beats it out with his hat, laughing so hard he can't breathe.
          marta worried: Holy Mother of God! Is he burned? Is he burned?
          player pain: Only my pride.
          havel laugh: Pride grows back, lad. Eyebrows too, eventually.
        `);
        remember('singed');
      }
    } else {
      await talk(`
        pavel smirk: Watch and learn!
        > Pavel takes a mighty run, leaps, clears the fire with a hand's breadth to spare, lands, slips on a cabbage leaf, and rolls into the reeve.
        jiri angry: The rents, boy! The rents!
      `);
    }
    // the wreaths and Hanka
    if (qDone('side_wreath')) {
      await talk(`
        > The girls carry their wreaths down to the brook. Hanka's has cornflowers woven through it, blue as a Madonna's mantle. You picked those.
        > When she comes back she stands beside you and says nothing, and then, very quietly:
        hanka tender: Well? You promised to dance badly with me.
      `);
      const d = await choose([
        { id: 'dance', text: '[Dance with Hanka]' },
        { id: 'shy', text: 'I... can\'t dance, Hanka.' },
      ]);
      if (d === 'dance') {
        await talk(`
          > Vojta finds his fiddle. You take Hanka's hands. You step on her feet four times. She laughs every time, and never lets go.
          > Around and around the fire. Her ribbon on your wrist. Her hair smelling of chamomile. The whole world is firelight and music.
          hanka tender: You're terrible at this.
          player happy: I know.
          hanka: Don't stop.
        `);
        addRel('hanka', 6);
        remember('danced_hanka');
      } else {
        await talk(`
          hanka smirk: Nobody can dance. That's not the point of dancing.
          > She dances with Pavel instead, and Pavel steps on her feet more than you would have. You watch her the whole time. She knows.
        `);
        addRel('hanka', 1);
      }
    } else {
      await talk(`
        > The girls carry their wreaths down to the brook to float them, laughing and singing. Hanka's wreath is plain, only daisies. She looks at you once, as she passes, and then looks away.
        > Later, she dances with Pavel. You find you don't much like watching it.
      `);
    }
    // Havel's last story
    await talk(`
      havel: When I was a boy, we'd jump the fire and then run up the Crow's Stone to see the sun rise. The whole valley, gold. Every roof. Every field.
      havel sad: I've seen a lot of the world, you know. Vienna. Buda. The sea, once. Nothing like this valley in the morning. Nothing.
      havel: Remember that, all you young ones. When you're off seeking your fortunes. Nothing's like home.
    `);
    // the family
    await talk(`
      > The fire burns lower. Lida has fallen asleep with her head on Father's knee, the wooden fox clutched in her fist. Mother sits beside them with her shawl around both.
      > Your father is humming. Nobody has ever been able to tell what the tune is. Your mother says he only hums when the iron sings right, or when he is happy.
      marta tender: Come. Sit with us a while.
    `);
    const f = await choose([
      { id: 'sit', text: '[Sit with your family]' },
      { id: 'ask', text: 'Father. What is it you want to show me tomorrow?' },
    ]);
    if (f === 'ask') {
      await talk(`
        radek smirk: You'll see.
        marta smirk: He's been impossible about it for months. Up half the night. Singing to himself. I thought he had a mistress.
        radek: I do. She's made of steel. She's very demanding.
        marta laugh: Radek!
      `);
    }
    await talk(`
      > You sit on the grass beside them. Nobody says much. The fire ticks and settles. Somewhere Vojta is still singing, off-key, about a miller's wife.
      radek: {name}.
      player: Father?
      radek tender: ...First light. The forge. Don't be late.
      > He puts his hand on the back of your neck, the way he did when you were small, and leaves it there. His palm is rough as a rasp and warm as bread.
    `);
    remember('last_evening');
    await fadeTo(1, 2.5);
    S.minutes = Math.floor(S.minutes / 1440) * 1440 + 23.2 * 60;
    for (const id of Object.keys(FEAST)) { const a = findActor(id); if (a) hold(a, false); }
    if (crumb) { hold(crumb, false); crumb.mem.follow = 'player'; }
    settleSchedules();
    G.cam.lockX = null; G.cam.lockY = null;
    forceMusic(null);
    await fadeTo(0, 1.5);
    setStage('main_prologue', 'night');
  });
  tip('bed', 'Go home and sleep in your bed (inside the house, on the left).');
}

// ---------------------------------------------------------------- the raid

let raidBusy = false;

export async function startRaidNight() {
  if (raidBusy) return;
  raidBusy = true;
  setFlag('raid_started');
  setFlag('no_travel');
  const p = P();
  await cutscene(async () => {
    await fadeTo(1, 1.5);
    forceMusic('lullaby');
    // everyone home in bed
    S.minutes = (Math.floor(S.minutes / 1440) + (hourF() > 12 ? 1 : 0)) * 1440 + 3 * 60 + 10;
    spawnCast();
    settleSchedules();
    putAt(p, 'hb_home', 'bed_player', 0);
    p.x -= 2;
    p.pose = 'sleep';
    p.poseLock = 9999;
    const crumb = findActor('crumb');
    if (crumb) { crumb.mem.follow = null; put(crumb, 'hb_home', 2, 5, 0); hold(crumb, true); crumb.pose = 'sit'; }
    await card('', 'Night', 'The fire burns down to embers.\nThe village sleeps.', { secs: 4 });
    await fadeTo(0.55, 2);
    await wait(1);
    if (crumb) { crumb.pose = 'idle'; sfx('growl', crumb.x, crumb.y); crumb.emoteShow('!', 2); }
    await wait(1.2);
    if (crumb) sfx('bark', crumb.x, crumb.y);
    await wait(0.5);
    if (crumb) sfx('bark', crumb.x, crumb.y);
    await narrate('Crumb is barking. Crumb never barks at night.');
    sfx('alarm');
    forceMusic('raid');
    setHollowbrook('burning');
    G.cam.shake = 2;
    await fadeTo(0, 0.6);
    const radek = findActor('radek'), marta = findActor('marta'), lida = findActor('lida');
    for (const a of [radek, marta, lida]) if (a) { hold(a, true); a.pose = 'idle'; a.mem.sleeping = false; }
    if (radek) putAt(radek, 'hb_home', 'bed_radek', 0);
    if (radek) radek.y += 10;
    if (marta) { putAt(marta, 'hb_home', 'table_e', 1); }
    if (lida) { put(lida, 'hb_home', 7, 5, 1); }
    await talk(`
      > Orange light at the window. Too much orange, too early. Then the screaming starts.
      radek: Up. {name}, up. Now.
    `);
    p.poseLock = 0;
    p.pose = 'idle';
    p.x += 12;
    await talk(`
      > Your father is already dressed, his hammer in his hand. You have never seen his face like this.
      radek: Riders. Twenty, more. They've fired the barn and Jiří's roof.
      marta worried: Radek, Radek, who are they? What do they want?
      radek: Doesn't matter. Bar the door behind me. Keep the children inside.
      player: I'm coming with you.
      radek angry: You'll stay with your mother. That's not a request.
      > He puts his big hand on your face, just for a moment. Then he is gone, out into the red dark, and the door bangs behind him.
    `);
    if (radek) { radek.mapId = 'overworld'; put(radek, 'overworld', 38, 102, 1); }
    await wait(0.6);
    await talk(`
      lida cry: {name}! Where's Father going? Where's Father going?
      marta: Hush, hush, my little fox. Hush now. {name}, the bar. Put the bar across the door.
    `);
    // the door breaks
    sfx('hit_heavy');
    G.cam.shake = 5;
    await wait(0.3);
    const m = fighter('hb_home', 7 * TILE + 8, 10 * TILE + 8, 'merc', { id: 'home_merc', tags: ['quest', 'raider'], hostile: true, hp: 70, skill: 2, weapon: 'club' });
    m.mem.aggroRange = 300;
    m.mem.noSurrender = true;
    await talk(`
      > The door bursts inward. A man in a black brigandine fills the doorway, a cudgel in his hand, and behind him the whole world is on fire.
      merc: Well, well. A nest.
      marta: Get out! Get out of my house!
    `);
    addItem('hatchet', 1, { quiet: true });
    equip('hatchet');
    await narrate('Your hand closes on the hatchet from the woodbox by the hearth. You don\'t remember reaching for it.');
    if (marta) { marta.mem.hold = true; }
    if (lida) { put(lida, 'hb_home', 10, 8, 0); }
    if (marta) { put(marta, 'hb_home', 9, 8, 0); }
  });
  tip('raidfight', 'Fight! <b>Left click / J</b> to strike, <b>Right click / K</b> to block.', 5000);
  // the fight in the house
  const m = findActor('home_merc');
  let down = false;
  const off = protectPlayer(() => { down = true; });
  await waitUntil(() => down || !m || m.dead || !!m.mem.down || m.surrendered, 240);
  off();
  await cutscene(async () => {
    const marta = findActor('marta'), lida = findActor('lida');
    if (m && !m.dead) {
      if (down) {
        await talk(`
          > The cudgel catches you across the shoulder and the floor comes up to meet you. The mercenary raises his club again —
          > — and your mother hits him over the head with the bread peel. Hard. Twice. He goes down like a sack of flour.
          marta angry: Not. My. Children.
        `);
        G.player.hp = Math.max(G.player.hp, 40);
      }
      if (!m.dead) { m.hostile = false; kill(m, null); }
    } else {
      await narrate('The mercenary crashes to the floor and does not get up. Your hands are shaking. There is blood on the hatchet. You have never hurt anyone before.');
      addXp('axe', 6);
    }
    await talk(`
      marta worried: {name}. Listen to me. Listen! Your father is out there alone.
      marta: I'll take Lida to the chapel. Brother Tobiah is there, and the chapel is stone, it won't burn. Go and find your father. Bring him to the chapel. Go!
      lida cry: I want to go with {name}!
    `);
    const c = await choose([
      { id: 'promise', text: 'Lida. Go with Mother. I\'ll bring Father. I promise.' },
      { id: 'go', text: '[Go]' },
    ]);
    if (c === 'promise') {
      await talk(`
        lida cry: You promise? Knight's promise?
        player: Knight's promise.
        > She throws her arms around your neck. Then Mother pulls her away, and they're gone into the smoke.
      `);
      remember('knights_promise');
    } else await narrate('You go.');
    if (marta) marta.mapId = '__away';
    if (lida) lida.mapId = '__away';
    setStage('main_prologue', 'raid');
  });
  // outside: the burning village
  await travel('overworld', 'hb_home_out', 0, { sound: 'door' });
  spawnRaiders();
  notify('Find Father! He went toward the green.', 'quest', 5000);
  raidBusy = false;
  // if the player falls outside, the story carries them to the green
  const off2 = protectPlayer(() => {
    off2();
    if (!flag('father_scene')) { G.player.hp = 30; fatherLast(true); }
  });
  setFlag('raid_guard');
  const unsub = () => off2();
  setTimeout(() => { if (flag('father_scene')) unsub(); }, 600000);
}

function spawnRaiders() {
  const spots: [number, number][] = [[44, 101], [48, 104], [41, 97], [33, 100]];
  spots.forEach(([x, y], i) => {
    const f = fighter('overworld', x * TILE + 8, y * TILE + 12, 'merc', { id: 'raider' + i, tags: ['quest', 'raider'], hostile: true, hp: 80, skill: 3 });
    f.mem.aggroRange = 110;
    f.mem.enemies = ['villager'];
  });
  // the dead and the fleeing
  const dead: [number, number, number][] = [[35, 100, 330], [43, 103, 331], [46, 98, 332]];
  for (const [x, y, s] of dead) {
    const a = person('overworld', x * TILE + 8, y * TILE + 12, { seed: s, wander: 0, tags: ['quest'] });
    a.dead = true; a.pose = 'dead'; a.solid = false; a.talkable = false; a.mem.looted = true;
  }
  const havel = findActor('havel');
  if (havel) { put(havel, 'overworld', 35, 99, 0); havel.dead = true; havel.pose = 'dead'; havel.solid = false; havel.mem.schedule = undefined; havel.mem.looted = true; S.deadNpcs.havel = true; }
  for (let i = 0; i < 2; i++) {
    const r = person('overworld', (40 + i * 6) * TILE, 106 * TILE, { seed: 340 + i, tags: ['quest'] });
    r.mem.fleeT = 30; r.mem.fleeFrom = findActor('raider0') || G.player; r.mem.despawnOnFlee = true;
  }
}

async function fatherLast(fromDown = false) {
  if (flag('father_scene')) return;
  setFlag('father_scene');
  for (const r of here().filter((a) => a.tags.has('raider'))) { r.hostile = false; r.mem.target = null; r.hidden = true; r.mapId = '__gone'; }
  await cutscene(async () => {
    const p = P();
    if (fromDown) {
      await fadeTo(1, 0.4);
      await narrate('A blow from behind. The ground. Mud and ash in your mouth. You crawl, because there is nothing else to do, towards the green, towards the sound of a hammer on steel.');
      put(p, 'overworld', 41, 102, 1);
      await fadeTo(0, 0.8);
    }
    let radek = findActor('radek');
    if (!radek) return;
    radek.mapId = 'overworld';
    put(radek, 'overworld', 37, 102, 2);
    hold(radek, true);
    radek.mem.schedule = undefined;
    radek.combat.weapon = { id: 'smith_hammer', kind: 'hammer', slash: 0, stab: 0, blunt: 17, reach: 16, speed: 0.95, staminaCost: 14 };
    const dieter = fighter('overworld', 35 * TILE + 8, 102 * TILE + 12, 'merc_heavy', { id: 'dieter_raid', name: 'The Black Helm', tags: ['quest'], hostile: false, hp: 400, skill: 9, weapon: 'longsword' });
    dieter.look = { ...(dieter.look!), outer: 'brigandine', outerColor: '#1a1a1e', hat: 'sallet', hatColor: '#2a2a30', cape: '#8e2f2f', legs: '#1a1a1e', build: 'broad' };
    dieter.charId = 'blackhelm';
    dieter.essential = true;
    dieter.mem.boss = true;
    hold(dieter, true);
    const thug = fighter('overworld', 36 * TILE + 8, 104 * TILE + 12, 'merc', { id: 'green_merc', tags: ['quest'], hostile: false, hp: 60 });
    hold(thug, true);
    G.cam.lockX = 37 * TILE; G.cam.lockY = 102 * TILE;
    forceMusic('raid');
    await wait(0.8);
    await narrate('The green. The old linden is burning like a torch, and under it your father stands with his hammer, and the dead lie around him.');
    // Father fells the thug
    thug.face(radek.x, radek.y);
    radek.face(thug.x, thug.y);
    radek.pose = 'windup';
    await wait(0.35);
    radek.pose = 'strike';
    sfx('hit_heavy', radek.x, radek.y);
    G.cam.shake = 4;
    kill(thug, radek);
    await wait(0.5);
    radek.pose = 'idle';
    radek.face(dieter.x, dieter.y);
    await talk(`
      > The last of them steps out of the smoke: tall, in a black helm with a narrow slit for eyes, a long sword held low and easy. A red cloak, like a butcher's apron.
      radek angry: You. You're the one giving the orders.
      blackhelm: I'm the one carrying them out, smith. There's a difference, though I admit it rarely matters to anyone.
      radek: Take what you want and go. There are children here.
      blackhelm: I know. That's rather the point.
    `);
    // the duel
    for (let i = 0; i < 3; i++) {
      dieter.pose = 'windup'; radek.pose = 'block';
      await wait(0.3);
      dieter.pose = 'strike'; sfx(i === 1 ? 'parry' : 'block', radek.x, radek.y);
      fx('spark', radek.x - 4, radek.y - 14);
      await wait(0.25);
      dieter.pose = 'idle'; radek.pose = 'windup';
      await wait(0.3);
      radek.pose = 'strike'; sfx('swing_heavy', radek.x, radek.y);
      await wait(0.25);
      radek.pose = 'idle';
      await wait(0.2);
    }
    await walkTo(p, 40 * TILE + 8, 102 * TILE + 12, { run: true, timeout: 3 });
    await talk(`
      player: FATHER!
      radek surprised: {name}! No! Get back!
    `);
    // the moment
    dieter.pose = 'windup';
    await wait(0.25);
    dieter.pose = 'strike';
    sfx('hit_flesh', radek.x, radek.y);
    for (let i = 0; i < 16; i++) fx('blood', radek.x, radek.y - 10);
    G.cam.shake = 3;
    radek.pose = 'hurt';
    await wait(0.6);
    radek.pose = 'lie';
    sting('sad');
    forceMusic('sorrow');
    await wait(1.2);
    await narrate('Your father looked away from his enemy for one heartbeat, to look at you. That was all it took.');
    // the player's fight
    dieter.face(p.x, p.y);
    await talk(`
      blackhelm: Ah. The son.
    `);
  });
  // the hopeless fight
  const dieter = findActor('dieter_raid');
  if (!dieter) return;
  hold(dieter, false);
  dieter.hostile = true;
  dieter.mem.alerted = true;
  dieter.mem.target = 'player';
  dieter.mem.aggression = 0.8;
  let down = false;
  const off = protectPlayer(() => { down = true; });
  G.cam.lockX = null; G.cam.lockY = null;
  await waitUntil(() => down, 45);
  off();
  dieter.hostile = false;
  dieter.mem.target = null;
  G.player.combat.bleeding = 0;
  G.player.hp = Math.max(G.player.hp, 12);
  await cutscene(async () => {
    const p = P();
    const radek = findActor('radek');
    p.pose = 'lie';
    p.poseLock = 9999;
    G.player.hp = Math.max(1, G.player.hp);
    dieter.combat.phase = 'none';
    dieter.face(p.x, p.y);
    if (!down) await narrate('He is faster than anything you have ever seen. His blade flicks your hatchet out of your hand, and his boot takes your legs, and you are on your back in the ashes.');
    else await narrate('You are on your back in the ashes. You can\'t remember falling.');
    await talk(`
      > He stands over you. Behind the slit of the helm, nothing. He raises the long sword, point down, the way a man spears a fish.
      > And your father, who is dying, puts out his hand and takes hold of the black knight's ankle.
      radek pain: Not... the boy.
      radek pain: Please. He's just a boy. He's... he's a good smith. Better than me.
      > The black helm turns down to look at him. For a long moment nobody moves. The linden burns. Sparks come down like snow.
      blackhelm: ...Hm.
    `);
    await wait(0.6);
    dieter.pose = 'strike';
    sfx('hit_heavy');
    G.cam.shake = 6;
    G.hurtFlash = 1;
    await fadeTo(1, 0.15);
    forceMusic(null);
    await wait(1.5);
    await narrate('Darkness. Then, from very far off, horses. The creak of carts. And a girl\'s voice, calling your name, over and over, getting further and further away.');
    await narrate('{NAME}! {NAME}!');
    await wait(1.5);
    if (radek) { radek.essential = false; radek.unkillable = false; kill(radek, dieter); radek.pose = 'dead'; }
    removeActor(dieter);
    for (const a of [...actors]) if (a.tags.has('raider')) removeActor(a);
    await card('Of Bread and Iron', '', '', { secs: 5, bg: '#000' });
  });
  completeQuest('main_prologue');
  await startAct1();
}

