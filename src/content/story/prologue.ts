// Prologue: St. John's Eve in Hollowbrook. A whole day of chores, friends and
// family, so that the player knows exactly what is lost when the night comes.

import { G } from '../../G';
import { S, flag, setFlag, hourF } from '../../state';
import { Actor } from '../../world/actor';
import { findActor, getMap } from '../../world/world';
import { defineQuest, startQuest, setStage, completeQuest, qAt, qActive, qDone, qStage, qVar, failQuest } from '../../systems/quests';
import { say, talk, narrate, choose, cutscene, conversation, wait, go, hold, camTo, camFollow, lastCheck } from '../../systems/script';
import { addItem, removeItem, has, count, addMoney, equip, unequip } from '../../systems/inventory';
import { addXp } from '../../systems/stats';
import { notify } from '../../ui/notify';
import { sfx, sting } from '../../audio/sfx';
import { forge } from '../../ui/minigames/forge';
import { playDice } from '../../ui/minigames/dice';
import { card } from '../../ui/cine';
import { on, emit } from '../../engine/events';
import { weather } from '../../systems/weather';
import { forceMusic } from '../../systems/director';
import { walkTo } from '../../systems/ai';
import { rand, TILE } from '../../engine/util';
import { enterMap } from '../../world/world';
import { snapCamera } from '../../engine/renderer';
import { fadeTo } from '../../systems/transition';
import { trigger, topic, greet, farewell, waitUntil, put, putAt, nearTile, nearActor, onMap, protectPlayer, addRel, remember, tip, P, skipTo, decor, markerObj, canRunScene } from './lib';
import { spawnCast, animal, FEAST, castHooks } from './cast';
import { feast } from './raid';

const SIDE_GEESE = ['gertruda', 'kunhuta', 'matylda', 'bohuslava', 'bishop'];
const GOOSE_NAMES: Record<string, string> = { gertruda: 'Gertruda', kunhuta: 'Kunhuta', matylda: 'Matylda', bohuslava: 'Bohuslava', bishop: 'The Bishop' };
const GOOSE_SPOTS: Record<string, [number, number]> = { gertruda: [33, 98], kunhuta: [24, 94], matylda: [59, 97], bohuslava: [37, 113], bishop: [36, 88] };

const delivered = (who: string) => !!flag('bread_' + who);
const allDelivered = () => delivered('havel') && delivered('bara') && delivered('jiri');
const sparDone = () => !!flag('spar_done');
const lidaFound = () => !!flag('lida_found');

export function registerPrologue() {
  // ---------------------------------------------------------------- quests
  defineQuest({
    id: 'main_prologue', title: "St. John's Eve", kind: 'main', act: 'Prologue',
    summary: 'The longest day of the year, and the village is getting ready for the midsummer fire.',
    stages: {
      wake: { obj: 'Get up and see Mother at the oven.', marker: { actor: 'marta' },
        entry: 'St. John\'s Eve. Lida woke me by sitting on me, which is how she wakes everyone. Mother has been at the oven since before the birds.' },
      bread: {
        obj: 'Deliver Mother\'s bread to Old Havel, Widow Bára and the reeve.',
        get optional() { return [['havel', 'Old Havel (on his bench by the green)'], ['bara', 'Widow Bára (by the geese pen)'], ['jiri', 'Jiří the reeve (at his house)']].map(([k, t]) => (delivered(k) ? '✓ ' : '· ') + t); },
        marker: () => (['havel', 'bara', 'jiri'].filter((k) => !delivered(k)).map((k) => ({ actor: k }))),
        entry: 'Mother gave me a basket of loaves for the neighbours. "And don\'t eat any," she said, which is what she always says, and I always do.',
      },
      forge: { obj: 'Go and help Father at the forge.', marker: { actor: 'radek' },
        entry: 'Bread delivered, mostly. Now Father wants me at the forge. He said "come when you\'re done", which from Father is practically a speech.' },
      afternoon: {
        obj: 'Spend the afternoon: spar with Pavel, and bring Lida home.',
        get optional() {
          return [
            (sparDone() ? '✓ ' : '· ') + 'Spar with Pavel in the meadow by the mill',
            (lidaFound() ? '✓ ' : '· ') + 'Find Lida. She ran off after a fox again',
            (qDone('side_wreath') ? '✓ ' : '· ') + 'Hanka wanted a word (optional)',
          ];
        },
        marker: () => {
          const m: { actor: string }[] = [];
          if (!sparDone()) m.push({ actor: 'pavel' });
          if (!lidaFound()) m.push({ actor: 'lida' });
          return m;
        },
        entry: 'Father let me go for the afternoon. Pavel has been waiting all day to hit me with a stick, and Lida has gone chasing foxes in the woods again. Mother will skin us both if she isn\'t back for the fire.',
      },
      dusk: { obj: 'Join the village at the bonfire on the green.', marker: { map: 'overworld', x: 37, y: 102 },
        entry: 'The sun is going down. Everyone will be at the green for the fire: the whole of Hollowbrook, drinking and singing and pretending not to watch who dances with whom.' },
      feast: { obj: 'Enjoy the feast.' },
      night: { obj: 'Go home to bed.', marker: { map: 'hb_home', x: 1, y: 5 },
        entry: 'The best St. John\'s Eve I can remember. Father said he has something to show me at the forge in the morning. He wouldn\'t say what. He was smiling.' },
      raid: { obj: 'Find Father!', marker: { map: 'overworld', x: 52, y: 98 } },
      done: { entry: 'I don\'t want to write about that night. I have to. They came at the dark end of the night and they burned everything.' },
    },
  });

  defineQuest({
    id: 'side_geese', title: "The Bishop's Revolt", kind: 'side', act: 'Prologue',
    summary: 'Widow Bára\'s geese have escaped, led by a gander called the Bishop.',
    stages: {
      start: {
        obj: 'Catch Bára\'s five runaway geese and bring them home.',
        get optional() { return SIDE_GEESE.map((g) => (flag('goose_' + g) ? '✓ ' : '· ') + GOOSE_NAMES[g]); },
        marker: () => SIDE_GEESE.filter((g) => !flag('goose_' + g)).map((g) => ({ actor: 'goose_' + g })),
        entry: 'Widow Bára\'s geese have broken out again, led, as always, by the Bishop. She wants all five of them home before the fire. Geese bite.',
      },
      back: { obj: 'Tell Bára her geese are home.', marker: { actor: 'bara' } },
      done: { entry: 'All five geese home, and I only bled a little. Bára says the Bishop respects me now. The Bishop hissed at me on the way out.' },
    },
  });

  defineQuest({
    id: 'side_vojta', title: 'Three Groschen', kind: 'side', act: 'Prologue',
    summary: 'Vojta owes Father for a mended scythe.',
    stages: {
      start: { obj: 'Collect Vojta\'s debt: three groschen. He\'ll be in the Rooster.', marker: { actor: 'vojta' },
        entry: 'Father says Vojta still owes three groschen for the scythe he mended in spring. "Don\'t let him sing at you," Father said. Vojta always sings at you.' },
      paid: { obj: 'Give Father his three groschen.', marker: { actor: 'radek' } },
      done: { entry: 'The scythe money is settled, one way or another.' },
    },
  });

  defineQuest({
    id: 'side_wreath', title: 'A Wreath for St. John', kind: 'side', act: 'Prologue',
    summary: 'Hanka needs flowers for her midsummer wreath.',
    stages: {
      start: {
        obj: 'Pick flowers for Hanka\'s wreath: cornflower, chamomile and St. John\'s wort.',
        get optional() { return [['cornflower', 'Cornflower'], ['chamomile', 'Chamomile'], ['stjohnswort', 'St. John\'s wort']].map(([id, n]) => (has(id) ? '✓ ' : '· ') + n + ' (meadows)'); },
        entry: 'Hanka asked me to pick flowers for her wreath: blue cornflower, chamomile, and St. John\'s wort, which has to be picked today or it doesn\'t count. The girls float their wreaths on the brook tonight. Whoever fishes a wreath out of the water... well. It\'s just a custom.',
      },
      back: { obj: 'Bring the flowers to Hanka.', marker: { actor: 'hanka' } },
      done: { entry: 'Hanka tied a green ribbon around my wrist. She says it keeps away the evil eye. She went very red, and so did I, and Pavel will never, ever let me forget it.' },
    },
  });

  registerTalks();
  registerScenes();
  registerGeese();
  castHooks.push(() => {
    if ((flag('act') || 0) !== 0) return;
    spawnGeese();
    if (!lidaFound()) {
      const den = getMap('overworld').spawns.fox_den;
      const fox = animal('overworld', den.x + 30, den.y - 18, 'fox', { id: 'den_fox', wander: 12, name: 'Vixen' });
      fox.tags.add('quest');
      fox.mem.fear = 0;
    }
  });
}

// ---------------------------------------------------------------- the long day

/** St. John's Eve does not end until its chores are done: the clock is held
 * back before dusk, and the night cannot pass until the player goes to bed. */
export function prologueUpdate() {
  if ((flag('act') || 0) !== 0 || !qActive('main_prologue')) return;
  const day0 = Math.floor(S.minutes / 1440) === 0;
  const h = hourF();
  if (qAt('main_prologue', 'wake', 'bread', 'forge', 'afternoon')) {
    if (!day0 || h > 18.6) {
      S.minutes = 18.5 * 60;
      tip('longday', 'The sun hangs low and golden over the valley. The longest day of the year is in no hurry to end.');
    }
  } else if (qAt('main_prologue', 'dusk', 'feast')) {
    if (!day0 || h > 23.5) S.minutes = 23.4 * 60;
  }
}

// ---------------------------------------------------------------- the opening

export async function startPrologue() {
  S.minutes = 6 * 60 + 20;
  weather.forced = 0;
  setFlag('act', 0);
  setFlag('hb_state', 'normal');
  spawnCast();
  const p = P();
  enterMap('hb_home', 'bed_player', 0);
  p.x -= 2;
  p.pose = 'sleep';
  p.poseLock = 9999;
  const lida = findActor('lida');
  const radek = findActor('radek');
  const marta = findActor('marta');
  const crumb = findActor('crumb');
  putAt(radek, 'hb_home', 'hearth', 3);
  putAt(marta, 'hb_home', 'oven', 3);
  put(lida, 'hb_home', 2, 6, 1);
  put(crumb, 'hb_home', 2, 4, 1);
  for (const a of [lida, radek, marta, crumb]) if (a) hold(a, true);
  if (marta) { marta.pose = 'work'; marta.poseLock = 9999; }
  snapCamera();
  G.fade = 1;
  startQuest('main_prologue', 'wake', true);
  cutscene(async () => {
    forceMusic('lullaby');
    await card('Of Bread and Iron', 'Hollowbrook, in the Kingdom of Bohemia', 'The eve of the Feast of St. John the Baptist,\nin the year of Our Lord 1409.', { secs: 6 });
    await fadeTo(0, 2.2);
    await wait(0.8);
    sfx('rooster');
    await wait(1.2);
    if (lida) { await walkTo(lida, p.x + 12, p.y + 2); lida.face(p.x, p.y); }
    await talk(`
      lida happy: {name}. {NAME}.
      lida smirk: I know you're awake. Your eye moved.
      > You keep your eyes shut. There is a nine-year-old sitting on your legs. Her braids smell of woodsmoke and stolen honey.
      lida: Mother says if you're not up by the time the loaves are out, she'll feed yours to Crumb.
    `);
    if (crumb) { sfx('bark', crumb.x, crumb.y); crumb.emoteShow('♥', 1.5); }
    const c = await choose([
      { id: 'up', text: 'I\'m up. I\'m up! Get off me, you little fox.' },
      { id: 'five', text: 'Five more minutes...' },
      { id: 'knight', text: 'Halt! Who dares disturb the sleep of a knight?' },
    ]);
    if (c === 'five') {
      await talk(`
        lida smirk: Five minutes is how long it takes Crumb to eat a loaf. I timed it.
        > Crumb, hearing his name, jumps onto the bed. There is no longer any sleeping.
      `);
    } else if (c === 'knight') {
      await talk(`
        lida laugh: You're not a knight. You're a smith. I'm going to be the knight.
        lida: Sir Lida of Hollowbrook. I'll have a white horse and a sword and everyone will have to bow.
        player smirk: Even me?
        lida happy: Especially you.
      `);
      addRel('lida', 2);
    } else {
      await talk(`
        lida laugh: Little fox! Father calls me that. You're not allowed.
        player smirk: Then get off my legs, Sir Lida.
        lida happy: ...That's allowed.
      `);
      addRel('lida', 1);
    }
    p.poseLock = 0;
    p.pose = 'idle';
    p.x += 12;
    await wait(0.4);
    if (radek) radek.face(p.x, p.y);
    await talk(`
      radek: Morning.
      > That is your father's entire conversation before noon. He finishes his bread, touches your mother's shoulder on the way past, and ducks out to the forge.
    `);
    if (radek) { hold(radek, false); }
    if (lida) hold(lida, false);
    if (crumb) { hold(crumb, false); crumb.mem.follow = 'player'; }
    await talk(`
      marta: {name}! Come here. I've a job for you before you vanish with that Pavel.
    `);
    forceMusic(null);
  }).then(() => {
    tip('controls', 'Move with <b>WASD</b>. Press <b>E</b> to talk and interact. Your journal (<b>B</b>) keeps your tasks, and <b>H</b> shows the controls.', 9000);
  });
}

// ---------------------------------------------------------------- conversations

function registerTalks() {
  const pro = () => (flag('act') || 0) === 0;

  // ---------- Marta ----------
  topic('marta', {
    id: 'pro_wake', auto: true, text: '', if: () => qAt('main_prologue', 'wake'),
    run: async (a) => {
      a.poseLock = 0;
      await talk(`
        marta happy: There he is. The sun's been up an hour and so has everyone useful.
        marta: Here. Four loaves for the neighbours: Old Havel, Widow Bára, and the reeve gets two, because the reeve always gets two.
        marta smirk: And don't eat any.
      `);
      const c = await choose([
        { id: 'eat', text: 'Would I ever?' },
        { id: 'why', text: 'Why does Jiří always get two?' },
        { id: 'ok', text: 'Havel, Bára, the reeve. I\'ll go now.' },
      ]);
      if (c === 'eat') await talk(`
        marta smirk: Every year since you had teeth.
        marta tender: There's one for you on the table. Eat that, and leave the neighbours theirs.
      `);
      else if (c === 'why') await talk(`
        marta smirk: Because he's the reeve, and he counts our rent, and a man with a full belly counts slower.
        marta laugh: Don't tell your father I said so. He thinks I'm a saint.
      `);
      else await say(a, 'happy', 'That\'s my good boy. And come straight back. Your father wants you at the forge after.');
      await talk(`
        marta tender: Oh, and {name}? It's St. John's Eve. Wash behind your ears. There might be girls at the fire.
        player: Mother!
        marta laugh: Go on! Go!
      `);
      addItem('bread_basket', 1);
      addItem('bread', 1, { quiet: true });
      setStage('main_prologue', 'bread');
      tip('bread', 'The people you need are marked on your screen edge and on the map (<b>M</b>). Talk to them with <b>E</b>.');
    },
  });
  topic('marta', {
    id: 'pro_chat', text: 'How are the loaves?', once: true, if: pro,
    run: async () => {
      await talk(`
        marta: Rising like the dead on Judgement Day. Rye with caraway for the fire tonight, and a honey loaf for your father, which he'll pretend he doesn't want.
        marta tender: My mother baked in that oven, and her mother before her. When you have a wife, she'll bake in it too, if she can stand the heat. And me.
      `);
    },
  });
  topic('marta', {
    id: 'pro_letters', text: 'You read, don\'t you? Could you teach me sometime?', once: true, if: pro,
    run: async () => {
      await talk(`
        marta surprised: Teach you your letters? Now? After I spent your whole childhood trying?
        marta smirk: You said letters were "just ants that sit still."
        marta tender: ...Aye. I'll teach you. After the harvest, when the evenings are long. Your father says a smith doesn't need to read. Your father is wrong about that, and about his singing.
      `);
      remember('asked_letters');
      addRel('marta', 2);
    },
  });
  topic('marta', {
    id: 'pro_evening', text: 'Is there anything else you need?', if: () => pro() && (qAt('main_prologue', 'afternoon') || qAt('main_prologue', 'forge')),
    run: async () => {
      if (!lidaFound() && qAt('main_prologue', 'afternoon')) await talk(`
        marta worried: Your sister. She went off after that fox again. If she's not back by dusk I'll give her such a hiding. Find her for me, will you?
        marta: She'll be down by the brook, where the woods start. She thinks I don't know about the fox hollow. I know about everything.
      `);
      else await say('marta', 'happy', 'Only that you enjoy yourself tonight. You work too hard, like your father. Dance with someone. Dance with Hanka.');
    },
  });
  greet('marta', async (a) => {
    if (pro()) await say(a, 'happy', rand.pick(['What is it, love? My hands are in the dough.', 'If you\'re hungry, there\'s bread. There\'s always bread.']));
    else await say(a, 'tender', 'My boy.');
  });
  farewell('marta', () => (pro() ? 'Go on with you.' : 'God keep you, my heart.'));

  // ---------- deliveries ----------
  const deliver = (who: string, run: (a: Actor) => Promise<void>) => topic(who, {
    id: 'pro_bread', auto: true, text: '', if: () => qAt('main_prologue', 'bread') && !delivered(who),
    run: async (a) => {
      setFlag('bread_' + who);
      await run(a);
      sfx('pickup');
      if (allDelivered()) {
        removeItem('bread_basket', 1);
        setStage('main_prologue', 'forge');
      }
    },
  });

  deliver('havel', async (a) => {
    await talk(`
      havel happy: Ah! The smith's boy, bearing gifts, like one of the Magi. Only younger, and I expect you smell worse.
      player: Mother's bread, Havel.
      havel: Your mother's a saint. Sit a moment. An old man is owed a listener on the longest day of the year.
    `);
    const c = await choose([
      { id: 'story', text: '[Sit] Tell me about the war again.' },
      { id: 'busy', text: 'I can\'t, Havel. Father\'s waiting.' },
    ]);
    if (c === 'story') {
      await talk(`
        havel: Which one? I've fought for three kings and a bishop, and only one of them paid me.
        havel: ...The Marchfeld, then. I was younger than you. The Hungarian horse came across the field like a wall. You know what saved me?
        player: Your sword?
        havel laugh: My feet! I ran like a hare. When a big man swings at you, lad, don't be there. That's all the fencing anybody needs.
        havel sad: The ones who stood still are still in that field. Good lads. I can't remember their faces any more. That's the worst of it.
        havel: My old sword's under my hearth, wrapped in a greased cloth. For the next war, I tell people. God willing it rusts there.
      `);
      addXp('speech', 3);
      addRel('havel', 3);
      remember('havel_story');
      tip('dodge', 'Havel\'s advice: in a fight, <b>Space</b> dodges out of the way of a blow.');
    } else {
      await say(a, 'smirk', 'Always running. Well, good. Keep running, lad. It served me.');
    }
  });

  deliver('bara', async () => {
    await talk(`
      bara angry: Is that bread? Put it on the step. Have you seen them?
      player: Seen who?
      bara angry: My geese! The Bishop pecked the latch open at dawn, the black-hearted heretic, and he's taken the others with him. Gertruda, Kunhuta, Matylda, Bohuslava. All over the village!
      bara worried: If they're not in the pen by tonight, the fire will frighten them into the brook and I'll never see them again.
    `);
    const c = await choose([
      { id: 'yes', text: 'I\'ll round them up for you, Bára.' },
      { id: 'later', text: 'I\'ll see what I can do.' },
    ]);
    await say('bara', c === 'yes' ? 'happy' : 'neutral', c === 'yes' ? 'Bless you. Grab them firm by the neck and don\'t let the Bishop see fear in your eyes. He can smell it.' : 'Don\'t "see". Do. They bite, mind.');
    startQuest('side_geese');
  });

  deliver('jiri', async () => {
    await talk(`
      jiri: Two loaves. Good. And the crust? Let me see the crust. Hm. Acceptable.
      jiri: Tell your mother the reeve is grateful, and that the St. Wenceslas rents are due in eleven weeks. Graciously. Tell her graciously.
    `);
    const c = await choose([
      { id: 'riders', text: 'Any news from the pass road?' },
      { id: 'bye', text: 'I\'ll tell her. Graciously.' },
    ]);
    if (c === 'riders') {
      await talk(`
        jiri worried: Riders. Up by the Crow's Stone, three nights running. Cloaks, no banners.
        jiri: Sir Lothar of Ravenstone's men, hunting, most likely. Lords hunt at night, sometimes. For the... atmosphere.
        jiri: I've written to Sir Bertram. Twice. Nobody reads a reeve's letters.
      `);
      remember('heard_riders');
    }
  });

  // ---------- Radek ----------
  topic('radek', {
    id: 'pro_forge', auto: true, text: '', if: () => qAt('main_prologue', 'forge') && !flag('forge_done'),
    run: async (a) => {
      await talk(`
        radek: You came.
        player: You said to.
        radek: I did.
        > He hands you the tongs without looking. That's how you know he's glad.
        radek: The reeve's mare threw a shoe. Make her a new one. You know how.
      `);
      const c = await choose([
        { id: 'how', text: 'Remind me how. Humour me.' },
        { id: 'know', text: 'I know how.' },
        { id: 'what', text: 'What are you working on? You were here till midnight.' },
      ]);
      if (c === 'how') {
        await talk(`
          radek: Bellows till it glows like the sun coming up. Not white. White is ruined. Orange-gold.
          radek: Strike where it needs striking, not where it's easy. Then into the water while it's still angry.
          radek smirk: And don't hum. That's my job.
        `);
      } else if (c === 'what') {
        await talk(`
          radek: ...Something.
          player: Something?
          radek smirk: Something that's none of your business until tomorrow. Tomorrow at first light. Then I'll show you.
          > He looks at you for a long moment, like he is measuring a bar of iron. Then he nods to the forge.
        `);
        remember('asked_secret');
      } else await say(a, 'neutral', 'Good. Show me.');
      setFlag('forge_script');
      tip('forge', 'Use your father\'s forge (<b>E</b> at the forge) to make the horseshoe.');
      return 'end';
    },
  });
  topic('radek', {
    id: 'pro_forge_wait', auto: true, text: '', if: () => qAt('main_prologue', 'forge') && !!flag('forge_script'),
    run: async (a) => { await say(a, 'neutral', 'The forge is hot. Go on.'); return 'end'; },
  });
  topic('radek', {
    id: 'pro_debt', text: 'Here are Vojta\'s three groschen.', if: () => qAt('side_vojta', 'paid'),
    run: async () => {
      await talk(`
        radek surprised: He paid? Vojta? With money?
        radek smirk: There'll be a comet. Keep one. For your trouble.
      `);
      addMoney(-2);
      addRel('radek', 2);
      completeQuest('side_vojta');
    },
  });
  topic('radek', {
    id: 'pro_talk', text: 'Can I ask you something, Father?', once: true, if: () => pro() && !qAt('main_prologue', 'wake', 'bread', 'forge'),
    run: async () => {
      await talk(`
        radek: You just did.
        player: Were you ever afraid? When you were my age?
        radek: ...Of your mother's father. He was built like an oven and twice as hot.
        radek tender: Of being ordinary. Of making ordinary things. Horseshoes, nails, hinges. Sixty years of hinges.
        radek: Then you were born. You were very loud. I stopped being afraid of that, after.
      `);
      addRel('radek', 3);
      remember('father_talk');
    },
  });
  greet('radek', async (a) => { await say(a, 'neutral', rand.pick(['Hm.', 'Son.', 'Mm?'])); });
  farewell('radek', () => 'Mind the fire.');

  // ---------- Lida ----------
  topic('lida', {
    id: 'pro_fox', auto: true, text: '', if: () => qAt('main_prologue', 'afternoon') && !lidaFound(),
    run: async (a) => { await lidaAtDen(a); return 'end'; },
  });
  topic('lida', {
    id: 'pro_knight', text: 'So, Sir Lida. What will your first quest be?', once: true, if: pro,
    run: async () => {
      await talk(`
        lida happy: To kill a dragon. No, wait. To find a dragon, and then be its friend, and then ride it to Prague and knock over the king's tower.
        player smirk: That's treason.
        lida: Not if the dragon does it.
      `);
    },
  });
  greet('lida', async (a) => { await say(a, 'happy', rand.pick(['What? I didn\'t do it.', 'Did you bring anything sweet?', '{name}! Watch me do a cartwheel. ...Don\'t tell Mother about my dress.'])); });
  farewell('lida', () => 'Bye, slowcoach!');

  // ---------- Pavel ----------
  topic('pavel', {
    id: 'pro_spar', auto: true, text: '', if: () => pro() && !sparDone() && qAt('main_prologue', 'afternoon'),
    run: async (a) => { await pavelSpar(a); return 'end'; },
  });
  topic('pavel', {
    id: 'pro_early', auto: true, text: '', once: true, if: () => pro() && qAt('main_prologue', 'wake', 'bread', 'forge'),
    run: async () => {
      await talk(`
        pavel happy: There he is! I've cut us two sparring sticks, and one of them is only slightly cursed.
        pavel: Come back when your mother's done with you. I'll be here, getting better while you get older.
      `);
    },
  });
  topic('pavel', {
    id: 'pro_dream', text: 'What will you do, Pavel? When your father\'s gone and the mill\'s yours?', once: true, if: () => pro() && sparDone(),
    run: async () => {
      await talk(`
        pavel: The mill? Never. I'm going to be a man-at-arms. Sir Bertram's garrison, a sword, a green tabard. Maybe a war.
        player: You want a war?
        pavel happy: A small one! A polite one! Just enough to come home with a scar and a story. Old Havel's got forty stories and all of them are lies.
        pavel: ...And there's a girl in Linden Hill, the baker's daughter. She laughs like a donkey. I love her.
      `);
      addRel('pavel', 2);
    },
  });
  greet('pavel', async (a) => { await say(a, 'happy', rand.pick(['Smith\'s boy!', 'Ho! The terror of Hollowbrook!', 'You look like a man who needs hitting with a stick.'])); });
  farewell('pavel', () => 'Don\'t fall in the brook.');

  // ---------- Hanka ----------
  topic('hanka', {
    id: 'pro_wreath', auto: true, text: '', once: true, if: () => pro() && !qActive('side_wreath') && !qDone('side_wreath'),
    run: async () => {
      await talk(`
        hanka happy: {name}! You have legs, don't you? Two of them, I've seen them.
        player: Last I checked.
        hanka: I need flowers for my wreath and I'm stuck here weaving everyone else's. Cornflower, chamomile, and St. John's wort. It has to be picked today, before the fire, or it doesn't work.
        player smirk: Doesn't work for what?
        hanka smirk: For... keeping off evil. And lightning. And... other things. Will you or won't you?
      `);
      const c = await choose([
        { id: 'yes', text: 'For you? I\'ll pick the whole meadow.' },
        { id: 'ok', text: 'Cornflower, chamomile, St. John\'s wort. Fine.' },
        { id: 'no', text: 'I\'m busy today, Hanka.' },
      ]);
      if (c === 'yes') { await say('hanka', 'tender', 'Just three will do. ...The whole meadow. Honestly.'); addRel('hanka', 3); }
      else if (c === 'ok') await say('hanka', 'happy', 'The meadows by the brook have all three. St. John\'s wort is the yellow one. Don\'t bring me buttercups again.');
      else { await say('hanka', 'sad', 'Oh. Well. If you find the time.'); addRel('hanka', -1); }
      startQuest('side_wreath');
      tip('herbs', 'Herbs grow wild in the meadows. Walk up to one and press <b>E</b> to pick it.');
    },
  });
  topic('hanka', {
    id: 'pro_flowers', text: 'I brought your flowers.', if: () => qActive('side_wreath') && has('cornflower') && has('chamomile') && has('stjohnswort'),
    run: async () => {
      removeItem('cornflower'); removeItem('chamomile'); removeItem('stjohnswort');
      await talk(`
        hanka surprised: You actually... and it's the right yellow! {name}, I could kiss you.
        > She does not kiss you. She looks at you. Then she looks at the flowers, very intently.
        hanka: Hold out your wrist.
        > She ties a green ribbon around it. Her fingers are cold and quick and careful.
        hanka tender: It keeps off the evil eye. That's all. It's a custom. Don't take it off.
      `);
      const c = await choose([
        { id: 'never', text: 'I won\'t. Ever.' },
        { id: 'tease', text: 'Is this what the wreath is for? Catching smiths?' },
        { id: 'thanks', text: 'Thank you, Hanka.' },
      ]);
      if (c === 'never') { await say('hanka', 'tender', '...Good.'); addRel('hanka', 4); remember('hanka_never'); }
      else if (c === 'tease') { await talk(`
        hanka laugh: Catching? You'd be a poor catch. You smell of charcoal and you can't dance.
        hanka smirk: ...Which is why you'll dance with me tonight. So I can teach you. As a kindness.
      `); addRel('hanka', 3); remember('hanka_dance_promise'); }
      else { await say('hanka', 'happy', 'Save me a dance at the fire. If your feet can manage it.'); addRel('hanka', 2); }
      addItem('hanka_ribbon', 1);
      completeQuest('side_wreath');
    },
  });
  topic('hanka', {
    id: 'pro_herbs', text: 'What are you learning from Old Wenda?', once: true, if: pro,
    run: async () => {
      await talk(`
        hanka: Everything nobody else wants to know. Which root stops bleeding, which one stops your heart. They're often cousins.
        hanka smirk: People call her a witch. She calls them idiots. She has saved more lives in this valley than Father Florian and his Latin put together.
        hanka: She says I have good hands. Nobody ever said anything good about my hands before.
      `);
      addRel('hanka', 1);
    },
  });
  greet('hanka', async (a) => { await say(a, 'happy', rand.pick(['Oh! It\'s you.', 'If you\'ve come to watch me weave, you can hold the thread.', 'Hello, smith.'])); });
  farewell('hanka', () => 'Don\'t be late for the fire.');

  // ---------- Vojta ----------
  topic('vojta', {
    id: 'pro_debt', auto: true, text: '', if: () => qAt('side_vojta', 'start'),
    run: async (a) => { await vojtaDebt(a); return 'end'; },
  });
  greet('vojta', async (a) => { await say(a, 'happy', rand.pick(['♪ Oh the miller\'s wife had a wooden leg... ♪ Oh. Hello.', 'The smith\'s boy! Sit, sit. Buy me a beer and I\'ll tell you a secret.', 'I\'m not drunk. I\'m celebrating in advance.'])); });
  farewell('vojta', () => '♪ ...and she danced on it every Sunday... ♪');

  // ---------- Bára, Jiří, Havel, Marek, Tobiah, the miller ----------
  topic('bara', {
    id: 'pro_geese_done', auto: true, text: '', if: () => qAt('side_geese', 'back'),
    run: async () => {
      await talk(`
        bara happy: All five! Even the Bishop! Look at him, sulking in the corner like a priest who's lost at dice.
        bara: You've a good heart, boy. My Tonda was the same. Forty years he chased those birds' grandmothers around this village.
        bara tender: Here. It was his. St. Christopher, for travellers. He never went further than Linden Hill, God rest him. Maybe you'll go further.
      `);
      addItem('st_christopher', 1);
      addRel('bara', 4);
      completeQuest('side_geese');
    },
  });
  greet('bara', async (a) => { await say(a, qActive('side_geese') ? 'worried' : 'neutral', qActive('side_geese') ? 'Any sign of them? The Bishop was heading for the chapel, the blasphemer.' : 'Mind the geese. They\'re in a mood.'); });
  greet('jiri', async (a) => { await say(a, 'neutral', rand.pick(['Yes, yes, what is it? The rents don\'t count themselves.', 'Ah, the smith\'s son. Is your father well? Is he... paying his dues this quarter?'])); });
  greet('havel', async (a) => { await say(a, 'happy', rand.pick(['Sit, sit. I\'ve a story for you.', 'The sun on my old bones. Better than wine. Almost.'])); });
  topic('marek', {
    id: 'pro_marek', text: 'Have you seen Lida?', if: () => pro() && qAt('main_prologue', 'afternoon') && !lidaFound(),
    run: async () => {
      await talk(`
        marek: She said I couldn't come because I'm too loud for foxes.
        marek sad: I'm not too loud. I'm a normal amount of loud.
        marek: She went down to the brook, past the geese, into the trees. The fox has babies. She wasn't supposed to tell anyone. She told me, so it's a secret.
      `);
    },
  });
  greet('marek', async (a) => { await say(a, 'happy', rand.pick(['Is Lida coming out?', 'I found a beetle as big as my thumb!', 'Grandmother says I\'m not to talk to you because you\'ll be a bad influence. What\'s an influence?'])); });
  greet('tobiah', async (a) => {
    await say(a, 'happy', rand.pick(['Bless you, my son. And bless whoever brews the Rooster\'s beer.', 'Ah! A young man with a question. I can tell. It\'s in the eyebrows.']));
  });
  topic('tobiah', {
    id: 'pro_who', text: 'You\'re not our priest. Who are you?', once: true, if: pro,
    run: async () => {
      await talk(`
        tobiah: Brother Tobiah, of the priory of St. Aldhelm's, over the hills. Friar, beekeeper, and the worst singer in three dioceses.
        tobiah happy: I walk the valley in summer, saying Mass for villages without a priest, and teaching letters to anyone who'll sit still. Very few sit still.
        tobiah smirk: In return I am given beer. It is a fair trade and the Lord approves of it, I checked.
      `);
    },
  });
  greet('miller', async (a) => { await say(a, 'neutral', rand.pick(['If you\'re looking for my son, try anywhere work isn\'t.', 'Flour in my beard, flour in my bed. That\'s milling.'])); });
}

// ---------------------------------------------------------------- scenes

function registerScenes() {
  // the scripted forging of the horseshoe
  on('forge:scripted', () => { if (qAt('main_prologue', 'forge')) forgeHorseshoe(); });

  // Lida follows you home from the fox hollow
  trigger('lida_home', () => lidaFound() && !!findActor('lida')?.mem.follow && nearTile(42, 104, 7), async () => {
    const lida = findActor('lida');
    if (!lida) return;
    lida.mem.follow = null;
    await conversation(async () => {
      await talk(`
        lida happy: I'll tell Mother I was with you all along. She won't be cross if I was with you.
        player smirk: She'll be cross with both of us.
        lida: Yes, but mostly with you. You're older.
      `);
    });
    spawnCast();
  });

  // afternoon done: the sun goes down
  trigger('pro_dusk', () => qAt('main_prologue', 'afternoon') && sparDone() && lidaFound() && !findActor('lida')?.mem.follow, async () => {
    setStage('main_prologue', 'dusk');
    if (hourF() < 17.5) notify('The afternoon passes. When you are ready, go to the green for the bonfire. (Press <b>T</b> to wait.)', 'info', 7000);
  });

  // the feast begins when you reach the green at dusk
  trigger('pro_feast', () => qAt('main_prologue', 'dusk') && nearTile(37, 103, 6), () => feast());

  // gathering reminder for the wreath
  on('gather', () => {
    if (qAt('side_wreath', 'start') && has('cornflower') && has('chamomile') && has('stjohnswort')) setStage('side_wreath', 'back');
  });

  // Vojta can be found by the dice table in the Rooster
  on('talk:radek', () => {
    if ((flag('act') || 0) === 0 && flag('forge_done') && !qActive('side_vojta') && !qDone('side_vojta') && !flag('vojta_offered')) setFlag('vojta_offered');
  });

}

async function forgeHorseshoe() {
  const radek = findActor('radek');
  await conversation(async () => {
    await narrate('The coals are already white at the heart. Father has laid out an iron bar for you, and his second-best hammer.');
  });
  const q = await forge({ title: 'A Horseshoe for the Reeve\'s Mare', strikes: 5, shape: 'horseshoe', easy: true, help: 'Pump the <b>bellows</b> until the iron glows orange-gold. Press <b>Strike</b> when the hammer mark is over the bright target. When the shape is done, quench it while it is still hot.' });
  S.flags.forge_script = false;
  S.flags.forge_done = true;
  await conversation(async () => {
    if (radek) radek.face(G.player.x, G.player.y);
    if (q >= 75) {
      await talk(`
        > Your father turns the shoe over in his big scarred hands. He holds it up to the light. He sets it down.
        radek: Not bad.
        > From Father, "not bad" is a hymn with choirs. You try very hard not to grin, and fail.
      `);
      addRel('radek', 3);
      remember('horseshoe_good');
    } else if (q > 0) {
      await talk(`
        radek: Hm. The mare will limp. But she'll limp proudly.
        radek smirk: Again, tomorrow. Everything's again, tomorrow.
      `);
    } else {
      await talk(`
        radek: Let it go cold, did you. Happens. Happened to me for a year.
        > He takes the tongs and in six blows makes the shoe you meant to make. It is annoying how easy he makes it look.
      `);
    }
    await talk(`
      radek: Keep it. Your first proper one. My father nailed mine above the door. Didn't bring him luck, but it held the door up.
      radek: Now go. Pavel's been waving a stick at the sky since breakfast. And if you see Vojta, he owes me three groschen for the scythe. Don't let him sing at you.
      radek tender: And... tonight. After the fire. Come by the forge, first thing tomorrow. I've something to show you.
      player: What is it?
      radek smirk: Tomorrow.
    `);
    addItem('horseshoe', 1);
    addXp('smithing', 8);
    startQuest('side_vojta');
    setStage('main_prologue', 'afternoon');
    setFlag('lida_ran');
    spawnCast();
  });
}

async function pavelSpar(a: Actor) {
  await talk(`
    pavel happy: At last! I've been standing here so long the cows have started to trust me.
    pavel: Here. Ash sticks, peeled, balanced, blessed by nobody. First to yield buys the beer tonight.
  `);
  const c = await choose([
    { id: 'go', text: 'You\'re on.' },
    { id: 'teach', text: 'Remind me how this works. It\'s been a while.' },
  ]);
  if (c === 'teach') {
    await talk(`
      pavel: God's teeth, you've forgotten everything. All right. Listen to your master.
      pavel: Swing: left click, or J. Hold it and you swing hard, but slow, and I'll see it coming.
      pavel: Block: right click, or K. Raise it just as my blow lands, not before, and you'll turn it aside so clean I'll stumble. That's a perfect block. Sergeant Ondřej in Linden Hill says it's the only thing that matters.
      pavel smirk: Or roll out of the way with Space, like a coward. Like Old Havel.
    `);
  }
  tip('combat', 'Attack: <b>Left click / J</b> (hold for a heavy blow). Block: <b>Right click / K</b>. Block just before a blow lands for a <b>perfect block</b>. Dodge: <b>Space</b>.', 10000);
  // equip the sticks
  const prevWeapon = S.equip.weapon;
  if (!has('stick')) addItem('stick', 1, { quiet: true });
  equip('stick');
  a.combat.weapon = { id: 'stick', kind: 'stick', slash: 0, stab: 0, blunt: 8, reach: 21, speed: 1.15, staminaCost: 9 };
  a.hp = a.maxHp = 90;
  a.mem.nonlethal = true;
  a.mem.noSurrender = true;
  a.mem.spar = true;
  a.mem.skill = 3;
  a.mem.schedule = undefined;
  await say(a, 'smirk', 'Ready? Try not to cry. Your mother will blame me.');
  const p = G.player;
  p.hp = p.maxHp;
  let playerDown = false;
  const off = protectPlayer(() => { playerDown = true; });
  a.hostile = true;
  a.mem.alerted = true;
  a.mem.target = 'player';
  // the fight runs in play mode; wait for an outcome
  setTimeout(async () => {
    await waitUntil(() => playerDown || a.hp < a.maxHp * 0.35 || p.hp < p.maxHp * 0.3 || a.mem.down, 180);
    off();
    a.hostile = false;
    a.mem.spar = false;
    a.mem.target = null;
    a.mem.alerted = false;
    a.mem.down = false;
    a.pose = 'idle';
    a.combat.phase = 'none';
    const won = a.hp < a.maxHp * 0.35 || !!a.mem.down;
    a.hp = a.maxHp;
    await waitUntil(() => canRunScene(), 5);
    await conversation(async () => {
      if (won) {
        await talk(`
          pavel pain: Ow! Enough, enough! I yield! God's wounds, where did you learn that?
          player smirk: From Old Havel. Don't be there.
          pavel laugh: I'm buying the beer, then. Watered, for you.
        `);
        remember('spar_won');
        addXp('sword', 6);
      } else {
        await talk(`
          pavel laugh: Ha! Yield, you ox! Yield!
          player pain: I yield! I yield. You've been practising.
          pavel happy: Every day, behind the mill. When Father thinks I'm cleaning the millrace. You're buying the beer.
        `);
        addXp('sword', 3);
      }
      await talk(`
        pavel: ...Seriously, though. You're good. Better than me, if you'd bother to practise. You should come to Linden Hill with me in the autumn. Ondřej takes on anyone who can stand up.
        pavel: Imagine it. You and me in green and gold. Sir Pavel and Sir {name}. Your father could forge our swords.
      `);
      const c2 = await choose([
        { id: 'dream', text: 'Sir {name}. It does have a ring to it.' },
        { id: 'forge', text: 'My place is at the forge, Pavel.' },
      ]);
      if (c2 === 'dream') { await say('pavel', 'happy', 'It does! It rings like a bell. Like a bell in a church, and we\'re the ones being blessed.'); remember('dream_knight'); }
      else await say('pavel', 'sad', 'Your place is wherever you put it. That\'s what I think. Still. Your father\'s swords are better than anyone\'s knights.');
      addRel('pavel', 3);
    });
    G.player.hp = Math.max(G.player.hp, G.player.maxHp * 0.6);
    if (prevWeapon) equip(prevWeapon); else unequip('weapon');
    setFlag('spar_done');
    spawnCast();
    if (!lidaFound()) notify('Now to find Lida. Marek or Mother might know where she went.', 'quest', 5000);
  }, 50);
  return;
}

async function lidaAtDen(a: Actor) {
  const fox = findActor('den_fox');
  await talk(`
    lida worried: Shh! Get down! You'll frighten them.
    > You crouch beside her in the ferns. Across the hollow, under the big rock, a vixen watches you with gold eyes. Behind her, three bundles of red fur tumble over each other in the dust.
    lida tender: She's got three. I named them. That one's Radek because he's the biggest, and that one's Marta because she's bossy, and that one's you.
    player: Which one's me?
    lida smirk: The one that fell over.
  `);
  if (fox) { fox.emoteShow('?', 2); }
  const c = await choose([
    { id: 'which', text: 'Why don\'t you have one?' },
    { id: 'mother', text: 'Mother\'s been looking for you everywhere.' },
    { id: 'quiet', text: '[Watch the foxes with her in silence.]' },
  ]);
  if (c === 'which') {
    await talk(`
      lida: I'm the vixen. Obviously. I'm the one who watches out for all of them.
      lida tender: When I'm a knight, that's what I'll do. Watch out for everyone. Even you, even though you're big and stupid.
    `);
    addRel('lida', 3);
  } else if (c === 'mother') {
    await talk(`
      lida sad: I know. I just wanted to see them one more time before... The fire will scare them. They'll move.
      lida: Foxes always move when people come. Father says so. He says that's why they're clever.
    `);
  } else {
    await talk(`
      > Neither of you says anything for a long time. The kits wrestle. The vixen yawns. The brook talks to itself below the trees.
      > Lida leans against your arm. She is warm and smells of grass. You will remember this afternoon for the rest of your life, though you do not know that yet.
    `);
    addRel('lida', 4);
    remember('fox_silence');
  }
  await talk(`
    > Lida pulls something from her apron: a little wooden fox, its paint worn away by love, one ear chewed.
    lida: Father made it when I was four. Crumb ate the ear. I'm going to put it by the fire tonight so it can see the dancing.
    lida happy: Come on, then. Race you home. Loser gets kissed by the Bishop.
  `);
  setFlag('lida_found');
  hold(a, false);
  a.mem.schedule = undefined;
  a.mem.follow = 'player';
  a.mem.followDist = 22;
  if (fox) { fox.mem.fear = 400; }
  addXp('stealth', 2);
}

async function vojtaDebt(a: Actor) {
  await talk(`
    vojta happy: ♪ Oh the smith's son came a-walking, a-walking, a-walking... ♪
    player: Three groschen, Vojta. For the scythe.
    vojta surprised: The scythe! The scythe. What a scythe it is. It cuts like a lawyer.
    vojta sad: The thing is, my friend, my purse and I have had a falling out. We're not speaking.
  `);
  for (;;) {
    const c = await choose([
      { id: 'talk', text: 'Father fixed it for nothing but a promise. Keep yours.', check: { stat: 'speech', need: 4 } },
      { id: 'lean', text: '[Lean over him] Three groschen. Now.', check: { stat: 'strength', need: 4 } },
      { id: 'dice', text: 'Dice you for it. Double or nothing.', if: () => S.money >= 3 },
      { id: 'forgive', text: 'Keep it. Buy yourself something to eat that isn\'t beer.' },
      { id: 'later', text: 'I\'ll come back later.' },
    ]);
    if (c === 'later') { await say(a, 'happy', 'Later is my favourite time. Everything is possible, later.'); return; }
    if (c === 'talk') {
      if (lastCheck) {
        await talk(`
          vojta sad: ...He did, didn't he. He did it at night, so nobody saw me beg. Your father's a good man.
          > Vojta counts out three coins from his boot. They are warm, and slightly damp.
          vojta: Tell him Vojta pays his debts. Eventually. In the fullness of time.
        `);
        addMoney(3);
        addXp('speech', 4);
        setStage('side_vojta', 'paid');
        return;
      }
      await say(a, 'smirk', 'A fine speech! I\'m moved. Not to paying, but moved.');
      continue;
    }
    if (c === 'lean') {
      if (lastCheck) {
        await talk(`
          vojta worried: All right! All right. Smiths. All arms and no poetry.
          > He fishes three coins out of his boot and slaps them into your hand.
        `);
        addMoney(3);
        addRel('vojta', -2);
        setStage('side_vojta', 'paid');
        return;
      }
      await say(a, 'laugh', 'Ha! You lean like a haystack in a breeze, lad.');
      continue;
    }
    if (c === 'dice') {
      await say(a, 'happy', 'Now you\'re speaking my language! Sit, sit. First to two thousand. If I win, the debt\'s forgiven. If you win, I pay double.');
      tip('dice', 'Dice: throw, keep the scoring dice (ones, fives, triples...), and bank before you throw a bust.', 9000);
      const net = await playDice({ name: 'Vojta', risk: 0.55, minBet: 3 });
      if (net > 0) {
        await talk(`
          vojta sad: The dice betray me! As they always do. As everyone does.
          vojta: Here. Six. No, don't count it. Counting is for reeves.
        `);
        addMoney(3);
        setStage('side_vojta', 'paid');
        return;
      }
      if (net < 0) {
        await talk(`
          vojta laugh: Ha! Debt forgiven! By the dice, which are the voice of God, or at least His cousin.
          > You have also lost three groschen of your own. Father must never know.
        `);
        remember('vojta_diced');
        completeQuest('side_vojta');
        return;
      }
      continue;
    }
    if (c === 'forgive') {
      await talk(`
        vojta surprised: You... what?
        > For a moment the song goes out of his face, and he looks like what he is: a thin man, alone, who drinks because the nights are long.
        vojta tender: ...God bless you, lad. I won't forget that. Vojta doesn't forget. He forgets everything else, but not that.
      `);
      remember('vojta_forgiven');
      addRel('vojta', 6);
      completeQuest('side_vojta');
      return;
    }
  }
}

// ---------------------------------------------------------------- geese

function spawnGeese() {
  const pen = getMap('overworld').spawns.geese_pen;
  for (const g of SIDE_GEESE) {
    if (flag('goose_' + g) || qDone('side_geese') || flag('raid_started')) {
      if (flag('hb_state') === 'burning' || flag('hb_state') === 'ruined') continue;
      const a = animal('overworld', pen.x + (SIDE_GEESE.indexOf(g) - 2) * 14, pen.y + (SIDE_GEESE.indexOf(g) % 2) * 8, 'goose', { id: 'goose_' + g, wander: 18, name: GOOSE_NAMES[g] });
      a.tags.add('wild');
      continue;
    }
    const [x, y] = GOOSE_SPOTS[g];
    const a = animal('overworld', x * TILE + 8, y * TILE + 12, 'goose', { id: 'goose_' + g, wander: 30, name: GOOSE_NAMES[g] });
    a.tags.add('quest');
    a.charId = 'goose_' + g;
    a.mem.label = `Catch ${GOOSE_NAMES[g]}`;
    if (g === 'bishop') { a.maxHp = a.hp = 40; a.scale = 1.1; }
  }
}

function registerGeese() {
  for (const g of SIDE_GEESE) {
    topic('goose_' + g, {
      id: 'catch', auto: true, text: '', if: () => true,
      run: async (a) => {
        if (!qActive('side_geese')) {
          await narrate(`${GOOSE_NAMES[g]} regards you with one flat, furious eye. This is Widow Bára's goose, and it is none of your business. Yet.`);
          return 'end';
        }
        const need = g === 'bishop' ? 5 : 3;
        const c = await choose([
          { id: 'grab', text: `[Grab ${GOOSE_NAMES[g]}]`, check: { stat: 'agility', need } },
          { id: 'coax', text: g === 'bishop' ? '[Offer the Bishop some bread]' : '[Coax her with a crust]', if: () => has('bread') || has('marta_bread') || has('roll') },
          { id: 'leave', text: '[Leave it be, for now]' },
        ], undefined, g === 'bishop' ? 'The Bishop draws himself up to his full height and hisses like a kettle full of snakes.' : `${GOOSE_NAMES[g]} honks at you, suspicious.`);
        if (c === 'leave') return 'end';
        let ok = c === 'coax' || lastCheck;
        if (c === 'coax') {
          if (has('bread')) removeItem('bread'); else if (has('roll')) removeItem('roll'); else removeItem('marta_bread');
          ok = g !== 'bishop' || Math.random() < 0.6;
        }
        if (!ok) {
          await narrate(g === 'bishop' ? 'The Bishop strikes like the wrath of God. You have been bitten in a place you will not be describing to anyone.' : `${GOOSE_NAMES[g]} slips out of your hands in a storm of feathers and bites you on the way.`);
          G.player.hp = Math.max(1, G.player.hp - 4);
          sfx('hit_flesh');
          a.hostile = true;
          setTimeout(() => { a.hostile = false; }, 4000);
          addXp('agility', 1);
          return 'end';
        }
        await narrate(g === 'bishop' ? 'You seize the Bishop around his great white neck, tuck him under your arm, and hold on while he curses you in goose. You march him home to the pen. The village children cheer.' : `You scoop ${GOOSE_NAMES[g]} up, wings and all, and carry her, honking, back to the pen.`);
        setFlag('goose_' + g);
        addXp('agility', 2);
        const pen = getMap('overworld').spawns.geese_pen;
        a.x = pen.x + rand.range(-24, 24);
        a.y = pen.y + rand.range(-6, 6);
        a.mem.anchorX = a.x; a.mem.anchorY = a.y;
        a.mem.wander = 18;
        a.mem.label = undefined;
        a.charId = null;
        a.tags.delete('quest');
        a.tags.add('wild');
        if (SIDE_GEESE.every((x) => flag('goose_' + x))) setStage('side_geese', 'back');
        return 'end';
      },
    });
  }
}

export { spawnGeese };
