// Vultures' Roost: Mother Kestrel's raider camp in a dry canyon north-east of
// Cinder Creek. Wren Voss is held in a fence pen at the back of the camp.
// Ways to free her: fight the camp, sneak in by the goat track and pick the
// pen lock, buy her from Kestrel (Barter lowers the price), or beat Kestrel
// bare-handed in the ring. Wren then joins as a companion or walks home.

import { defineMap, defineDialogues, defineQuests, defineObjScripts, defineDeathScripts, defineEndings } from './registry';
import { defineItems } from '../data/items';
import { defineProtos, S } from '../data/protos';
import type { Actor, Ctx, DialogueOption, LegendEntry } from '../game/types';
import { G } from '../game/G';
import { hexDist } from '../core/hex';
import { bark } from '../game/script';

// ------------------------------------------------------------------ data

defineProtos([
  {
    id: 'cc_wren', name: 'Wren Voss', desc: 'a wiry young scout with a scoped rifle and a sunburnt nose',
    look: { body: 'human', female: true, skin: '#a8704a', hair: '#7a3a1a', hairStyle: 'short', outfit: '#6a5a3a', outfit2: '#3a4a2a' },
    stats: S(5, 8, 5, 5, 6, 8, 6), hp: 38, xp: 100,
    skills: { smallGuns: 82, sneak: 65, firstAid: 45, melee: 45, unarmed: 45, outdoorsman: 70 },
    equip: ['huntingRifle', 'leatherJacket'], inv: [{ id: 'ammo223', n: 40 }, { id: 'curePaste', n: 2 }, { id: 'hypo', n: 1 }],
    team: 'cinder', hostile: false,
  },
  {
    id: 'vr_kestrel', name: 'Mother Kestrel', desc: 'a rangy woman with a scar from ear to collarbone and knuckles like walnuts',
    look: { body: 'human', female: true, skin: '#b07850', hair: '#9a9a90', hairStyle: 'long', outfit: '#4a2a20', outfit2: '#8a3a2a' },
    stats: S(7, 7, 7, 6, 6, 7, 5), hp: 70, xp: 400,
    skills: { unarmed: 85, smallGuns: 72, melee: 70 },
    equip: ['revolver44', 'leatherArmor'], inv: [{ id: 'vr_cageKey', n: 1 }, { id: 'ammo44', n: 18 }, { id: 'scrip', n: 150 }],
    team: 'roost', hostile: false,
  },
]);

defineItems([
  { id: 'vr_cageKey', name: 'Pen Key', type: 'key', weight: 0, value: 0, icon: 'key', quest: true, desc: 'A heavy iron key on a greasy leather thong. It opens the pen at Vultures\' Roost.' },
]);

defineQuests([
  { id: 'vr_wren', title: 'Wren\'s Rescue', area: 'vultures_roost', xp: 1000, desc: 'Hattie Voss\'s granddaughter Wren is held by the raiders of Vultures\' Roost. Bring her home.' },
]);

// ------------------------------------------------------------------ helpers

const TEAM = 'roost';

function interior(floors: Record<string, string>): Record<string, LegendEntry> {
  const out: Record<string, LegendEntry> = {};
  for (const [ch, floor] of Object.entries(floors)) out[ch] = { floor, marker: ch };
  return out;
}

const roostHostile = (c: Ctx) => !!c.flag('vr_roostHostile') || !!c.flag('hostile:vultures_roost:' + TEAM);

function hourNow() {
  return Math.floor((G.state.time % 1440) / 60);
}

/** Raiders who can see the player right now (for the lockpicking check). */
function watchers(c: Ctx): Actor[] {
  const m = G.map;
  if (!m) return [];
  const p = G.state.player;
  const h = hourNow();
  const night = h >= 21 || h < 5;
  const sneaking = !!G.state.flags._sneak;
  return m.actors.filter((a) => {
    if (a.dead || a.team !== TEAM || a.knockedOut || a.companion) return false;
    if (a.npc === 'vr_coll' && (night || c.flag('vr_collOut'))) return false;
    let range = night ? 5 : 9;
    if (sneaking) range -= Math.floor(c.skill('sneak') / 20);
    range = Math.max(2, range);
    return hexDist(a, p) <= range && m.los(a, p);
  });
}

function cageOpen(c: Ctx): boolean {
  if (c.mapId() !== 'vultures_roost') return false;
  const g = c.obj('vr_cage');
  return !!g && (!g.locked || !!g.open);
}

function openCage(c: Ctx) {
  const g = c.obj('vr_cage');
  if (g) {
    g.locked = 0;
    g.open = true;
    if (G.map) G.map.version++;
  }
}

function freeWren(c: Ctx) {
  if (c.flag('vr_wrenFreed')) return;
  c.set('vr_wrenFreed');
  const method = c.flag('vr_soldWren') ? 'escaped'
    : c.flag('vr_duelWon') ? 'duel'
      : c.flag('vr_boughtWren') ? 'bought'
        : c.flag('dead:kestrel') || roostHostile(c) ? 'fight' : 'sneak';
  c.set('vr_wrenMethod', method);
  if (method === 'sneak') {
    c.xp(250);
    c.karma(10);
  }
  if (c.questState('vr_wren') === 'none') c.quest('vr_wren', 'I found Wren Voss, Hattie\'s granddaughter, caged at Vultures\' Roost, and freed her.');
  if (method !== 'escaped') c.quest('vr_wren', 'Wren is free. I should take her home to Hattie Voss in Cinder Creek.');
  c.karma(15);
}

function sendWrenHome(c: Ctx, silent = false) {
  c.set('vr_wrenHome');
  if (c.mapId() === 'cinder_creek') {
    if (c.partyHas('wren')) c.dismiss('wren');
    return;
  }
  const a = c.npc('wren');
  if (a && G.map) {
    a.companion = false;
    G.map.actors = G.map.actors.filter((x) => x !== a);
  }
  c.set('party:wren', false);
  if (!silent) c.msg('Wren shoulders her rifle and sets off for Cinder Creek.');
}

function wrenOpinion(c: Ctx): string {
  const lines: Record<string, string> = {
    cinder_creek: '"Home. It looks smaller every time I leave it. The well looks lower, too."',
    beetle_den: '"I hate this. I hate the clicking. If one gets on my back, shoot it. Don\'t discuss it with me first, just shoot it."',
    vultures_roost: '"I counted every one of them from that pen. I know which ones sleep on watch. Coll, mostly."',
    rustwater: '"Gran says Rustwater is where good ideas go to get robbed. Keep your hand on your purse."',
    bazaar: '"So many people. How do they all get water? Somebody here is getting very rich off thirst."',
    calder: '"The towers look like burnt candles. Watch the ground; the Withered say the dust here glows at night."',
    shelter7: '"This is where you came from? No. A place like it. It feels like a held breath."',
    shelter29: '"So this is the hole in the hill. It\'s very clean. Is everyone this clean?"',
    shelter29_cave: '"Rats. Just rats. I\'ve eaten worse than rats."',
    archive: '"The Keepers look at my rifle like it\'s a spoon somebody\'s using wrong."',
    kessler: '"Those collars. Those are people, aren\'t they? Were people." She checks her rifle twice.',
    cathedral: '"Do you hear that? Under the wind. Like singing with the words taken out."',
  };
  return lines[c.mapId()] ?? '"Open ground, good sight lines. I like it. Nobody sneaks up on us here without me knowing."';
}

const bye = (t = 'Goodbye.'): DialogueOption => ({ text: t, end: true });

const RING: [number, number][] = [[45, 27], [45, 25], [44, 25], [43, 25], [42, 26], [41, 27], [41, 29], [42, 29], [43, 29], [44, 28]];

const BARKS: Record<string, string[]> = {
  vr_raider: ['Nice boots. Be a shame if they walked off.', 'Mother says be polite to guests. So. Hello.', 'Birds are fat this year.', 'You lost, shelter? You look lost.', 'Wanna see my ear collection? It\'s small. It\'s growing.'],
  vr_gunner: ['Keep walking.', 'Hands where I can see them.', 'I could hit you from here. Just saying.'],
  vr_gate: ['Business or bleeding?', 'Mother\'s in the shack. Don\'t touch anything on the way.'],
  vr_brakk: ['Mother\'s thinking. Don\'t make noise.', '...'],
  vr_knuckles: ['Ring\'s open! Who wants to lose some teeth?', 'Two scrip on the shelter rat!'],
};

function ambientBarks(chance = 0.4) {
  if (G.combat || !G.map || Math.random() > chance) return;
  const p = G.state.player;
  const near = G.map.actors.filter((a) => !a.dead && !a.hostile && a.npc && Object.keys(BARKS).some((k) => a.npc!.startsWith(k)) && hexDist(a, p) <= 12);
  if (!near.length) return;
  const a = near[Math.floor(Math.random() * near.length)];
  if (a._bark && a._bark.until > G.now) return;
  const pool = BARKS[Object.keys(BARKS).find((k) => a.npc!.startsWith(k))!];
  bark(a, pool[Math.floor(Math.random() * pool.length)]);
}

// ------------------------------------------------------------------ map

defineMap({
  id: 'vultures_roost',
  name: 'Vultures\' Roost',
  area: 'vultures_roost',
  outdoor: true,
  floor: 'sand',
  floor2: 'dirt',
  wall: 'cliff',
  wall2: 'scrap',
  music: 'wind',
  legend: {
    '&': { wall: 'fence' },
    '|': { wall: 'wood' },
    '-': { floor: 'wood' },
    ...interior({ "C": 'wood', "D": 'wood', "M": 'wood', "O": 'wood', "P": 'wood', "S": 'wood' }),
  },
  rows: [
    '############################################################',
    '############################################################',
    '############::::::::::::k:::################################',
    '##########::;#############:::::K::##########################',
    '#########:::####################:::::#######################',
    '#########::#########################::######################',
    '#########::########..#...#...#######::############.#########',
    '#########::######....%%.......######::##########.#..########',
    '>##.#####::###"#."...%%..........####::########.......######',
    '>.....#"#::#"........%%.......o.....#::.&&&&&.........######',
    '>.......;.#.........;%%;....o.......::..&,,,&..........#####',
    '>................o...%%;............::..G,w,&..;.......#####',
    '>"...Y.".o...........%%.......t.......z.&,,,&...........####',
    '>..............;...;"%%.................&&&&&...........####',
    '>............T...."..%%...t....;..............||||||||..####',
    '>.;...X....;...Y.....%%................o......|S----O|..####',
    '>..................".%%;....A.......L.........|--M---|..####',
    '>.......;.........b..%%........r;...........h.|------|..####',
    '>....Y.."....".....g.%%...........n...R.......+----C-|..####',
    '>"..............I..;"....r..........o.........|------|..####',
    '>..E."....";.....................f............|-D----|..####',
    '>......o...........g.%%........m............o.|-----P|..####',
    '>."...............B..%%............r..........||||||||..####',
    '>..;.................%%.x....R..........o...............####',
    '>...........c..."....%%.x.......l.......................####',
    '>.....o...X..........%%....t....................yy......####',
    '>.".o............."..%%.............t;............;.....####',
    '>......."".."........%%........t...........Q............####',
    '>..........;.........%%.................o.............;#####',
    '>....................%%;.#................;..;;.......######',
    '>..............".;..#%%.#######......................#######',
    '>..............;#################.#.................########',
    '>......."...#"######################.#..#..........;########',
    '##...#.#.################################;#....;;###########',
    '##############################################.#.###########',
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################',
    '############################################################',
  ],
  entrances: { default: 'E' },
  exits: { out: { to: 'world' } },
  objects: [
    { kind: 'gate', at: 'G', id: 'vr_cage', name: 'pen gate', locked: 40, key: 'vr_cageKey', onUse: 'vr_cage' },
    { kind: 'sandbags', at: 'b' },
    { kind: 'sandbags', at: 'B' },
    { kind: 'sign', at: 'I', name: 'trophy pole', onUse: 'vr_pole', tint: '#6a4a3a', desc: 'a pole hung with caravan badges, ox horns and a single child\'s shoe' },
    { kind: 'bones', at: [6, 15] },
    { kind: 'bones', at: [10, 25] },
    { kind: 'car', at: 'c', tint: '#7a5a3a', name: 'burnt-out car' },
    { kind: 'campfire', at: 'f' },
    { kind: 'tent', at: [26, 14], tint: '#6a5a4a' },
    { kind: 'tent', at: [27, 25], tint: '#5a4a3a' },
    { kind: 'tent', at: [31, 27], tint: '#7a4a3a' },
    { kind: 'tent', at: [30, 12], tint: '#5a5a3a' },
    { kind: 'tent', at: [36, 26], tint: '#6a4a3a' },
    { kind: 'crate', at: [24, 23], name: 'loot crate', inv: [{ id: 'ammo9', n: 24 }, { id: 'jerky', n: 2 }, { id: 'scrip', n: 35 }] },
    { kind: 'crate', at: [24, 24], name: 'loot crate', locked: 35, inv: [{ id: 'shells', n: 12 }, { id: 'molotov', n: 2 }, { id: 'hypo', n: 1 }] },
    { kind: 'barrelc', at: [48, 25], name: 'water barrel', inv: [{ id: 'water', n: 2 }] },
    { kind: 'barrel', at: [49, 25] },
    { kind: 'rack', at: 'A', name: 'weapon rack' },
    { kind: 'lamp', at: 'L' },
    { kind: 'lamp', at: 'l' },
    ...RING.map(([q, r]) => ({ kind: 'sandbags', at: [q, r] as [number, number] })),
    // Kestrel's shack
    { kind: 'footlocker', at: 'O', name: 'Kestrel\'s footlocker', locked: 55, inv: [{ id: 'scrip', n: 220 }, { id: 'hypo', n: 2 }, { id: 'ammo44', n: 12 }, { id: 'fury', n: 1 }, { id: 'metalArmor', n: 1 }] },
    { kind: 'bed', at: 'P', tint: '#5a3a2a' },
    { kind: 'table', at: 'D', tint: '#4a3a2a' },
    { kind: 'rug', at: 'S', tint: '#7a2a2a' },
    { kind: 'chair', at: 'C' },
    // the goat track
    { kind: 'bones', at: 'k', name: 'climber\'s bones', desc: 'someone who took the goat track in the dark' },
    { kind: 'bag', at: 'K', name: 'weathered pack', inv: [{ id: 'ammo223', n: 10 }, { id: 'hypo', n: 1 }, { id: 'rope', n: 1 }] },
  ],
  npcs: [
    { proto: 'vr_kestrel', id: 'kestrel', name: 'Mother Kestrel', at: 'M', dialog: 'kestrel', team: TEAM, hostile: false },
    { proto: 'raiderGun', id: 'vr_brakk', name: 'Brakk', at: 'h', dialog: 'vr_brakk', team: TEAM, hostile: false, hp: 40,
      look: { hairStyle: 'bald', skin: '#6a4028', outfit: '#3a2a22' } },
    { proto: 'raider', id: 'vr_gate', name: 'Gate Raider', at: 'g', count: 2, dialog: 'vr_gate', team: TEAM, hostile: false },
    { proto: 'raider', id: 'vr_raider', name: 'Raider', at: 'r', count: 3, team: TEAM, hostile: false, wander: 3 },
    { proto: 'raiderGun', id: 'vr_gunner', name: 'Raider', at: 'R', count: 2, team: TEAM, hostile: false, wander: 3 },
    { proto: 'raider', id: 'vr_knuckles', name: 'Knuckles', at: 'n', dialog: 'vr_knuckles', team: TEAM, hostile: false,
      look: { hairStyle: 'mohawk', hair: '#c83a2a', skin: '#d8a888' }, equip: ['brassKnuckles', 'leatherJacket'] },
    { proto: 'merchant', id: 'vr_gristle', name: 'Gristle', at: 'm', dialog: 'vr_gristle', team: TEAM, hostile: false, barter: true,
      look: { skin: '#c8966e', hair: '#5a4a3a', hairStyle: 'hood', outfit: '#4a3a2a', outfit2: '#8a6a3a' },
      inv: [{ id: 'ammo9', n: 36 }, { id: 'ammo223', n: 20 }, { id: 'shells', n: 12 }, { id: 'pistol9', n: 1 }, { id: 'shotgun', n: 1 }, { id: 'fury', n: 1 },
        { id: 'bulk', n: 1 }, { id: 'beer', n: 6 }, { id: 'jerky', n: 4 }, { id: 'molotov', n: 3 }, { id: 'leatherJacket', n: 1 }, { id: 'scrip', n: 250 }] },
    { proto: 'raider', id: 'vr_coll', name: 'Sleepy Coll', at: 'z', dialog: 'vr_coll', team: TEAM, hostile: false,
      look: { hairStyle: 'cap', skin: '#e0b898' } },
    { proto: 'cc_wren', id: 'wren', name: 'Wren Voss', at: 'w', dialog: 'wren', team: 'cinder', if: (c) => !c.flag('vr_wrenFreed') },
  ],
  onEnter: (c, first) => {
    c.set('vr_visited');
    if (first) {
      c.msg('The canyon stinks of smoke and carrion. Vultures sit shoulder to shoulder along the cliff tops, waiting with professional patience. A wall of car doors and sheet iron closes off the canyon ahead.');
      c.bark('vr_gate_0', 'Business or bleeding, shelter?');
      if (c.flag('vr_knowsTrack')) c.msg('You spot the crack in the north wall that Hobb described, just west of the palisade.');
    }
  },
  onTick: (c) => {
    if (!c.flag('vr_roostCleared') && G.map && !G.map.actors.some((a) => a.team === TEAM && !a.dead)) {
      c.set('vr_roostCleared');
      c.msg('The canyon is quiet. The vultures begin to drift down from the cliffs.');
    }
    ambientBarks();
  },
});

// ------------------------------------------------------------------ scripts

defineObjScripts({
  vr_cage: (c, o, _u, skill) => {
    if (o.open) return false;
    if (c.flag('vr_wrenReleased') || roostHostile(c) || c.flag('vr_roostCleared')) return false;
    const tampering = skill === 'lockpick' || (!skill && !!o.locked && c.has('vr_cageKey'));
    if (!tampering) {
      if (o.locked) c.msg('The pen gate is shut with a heavy padlock. Kestrel keeps the key, and the lock looks pickable.');
      return !!o.locked;
    }
    const seen = watchers(c);
    if (seen.length) {
      bark(seen[0], 'HEY! Get away from the girl!');
      c.msg('You\'ve been spotted at the pen!');
      c.set('vr_caught');
      c.set('vr_roostHostile');
      c.hostile(TEAM);
      return true;
    }
    return false;
  },
  vr_pole: (c) => {
    c.msg('Caravan badges from the Bazaar houses, ox horns, a Rustwater deputy\'s star, and a child\'s shoe. Someone has carved into the pole: MOTHER PROVIDES.');
    return true;
  },
});

defineDeathScripts({
  kestrel: (c) => {
    c.set('vr_kestrelDead');
    c.msg('Mother Kestrel goes down, and for a moment the whole canyon holds its breath.');
    c.karma(10);
  },
  wren: (c) => {
    if (c.questState('vr_wren') === 'active') c.questFail('vr_wren', 'Wren Voss is dead.');
  },
});

// ------------------------------------------------------------------ dialogue

const duelOpts = (): DialogueOption[] => [
  { text: 'Jab and keep moving.', skill: { key: 'unarmed', diff: 30 }, to: 'land', fail: 'take' },
  { text: 'Close in and grapple.', stat: { key: 'STR', min: 7 }, skill: { key: 'unarmed', diff: 15 }, to: 'land', fail: 'take' },
  { text: 'Feint low, then hit high.', stat: { key: 'AGI', min: 7 }, skill: { key: 'unarmed', diff: 10 }, to: 'land', fail: 'take' },
  { text: 'Crowd her left side, like Knuckles said.', if: (c) => !!c.flag('vr_knuckleTip'), skill: { key: 'unarmed', diff: 0 }, to: 'land', fail: 'take' },
  { text: 'Throw a fistful of grit in her eyes.', if: (c) => !c.flag('vr_duelDirty'), to: 'land', do: (c) => { c.set('vr_duelDirty'); c.karma(-5); } },
  { text: 'Punch! Punch hard!', lowInt: true, skill: { key: 'unarmed', diff: 20 }, to: 'land', fail: 'take' },
];

const HITS = [
  'Your fist finds her jaw with a crack like a snapped branch. The crowd howls.',
  'You slip her swing and drive a knee into her ribs. She staggers back into the sandbags.',
  'You catch her wrist, twist, and put her on one knee in the dust. The raiders go quiet.',
];
const TAKES = [
  'She walks straight through your guard and hits you so hard your teeth rearrange themselves.',
  'Her elbow comes out of nowhere. For a moment the sky is on the wrong side.',
  'She sweeps your legs and lets you fall. The crowd laughs louder than you would like.',
];

defineDialogues([
  // ---------------------------------------------------------------- Kestrel
  {
    id: 'kestrel',
    portrait: { bg: '#3a2420' },
    start: (c) => {
      if (c.flag('vr_soldWren')) return 'afterSold';
      if (c.flag('vr_duelWon')) return 'afterDuel';
      if (c.flag('vr_wrenFreed') && c.flag('vr_wrenMethod') === 'sneak') return 'afterSneak';
      if (c.flag('vr_wrenReleased')) return 'afterDeal';
      return c.flag('vr_metKestrel') ? 'again' : 'hello';
    },
    nodes: {
      hello: {
        onEnter: (c) => c.set('vr_metKestrel'),
        text: 'A rangy woman sits on an upturned ammunition crate, wrapping her knuckles in strips of cloth. A white scar runs from her ear down under her collar. She doesn\'t stand.\n\n"Shelter meat, walking into my canyon on its own legs. That\'s either brave or very, very stupid, and I haven\'t decided which I\'d rather." She ties off the wrap with her teeth. "I\'m Kestrel. They call me Mother, because I feed them. What do you want?"',
        options: [
          { text: 'I\'m here for Wren Voss.', to: 'wren' },
          { text: 'Who are you people?', to: 'who' },
          { text: 'Give girl back. Please?', lowInt: true, to: 'dumbWren' },
          { text: 'I\'m here to end you, raider.', combat: true, do: (c) => c.set('vr_roostHostile') },
          bye('Just passing through.'),
        ],
      },
      who: {
        text: '"We\'re what happens when the caravans get fat and slow. Thirty guns, sixty birds, and one mother." She flexes her hand. "We take a cut. Most of the time we let them keep their teeth. That makes us the gentle ones, out here."\n\n"And before you ask: no, we don\'t go east any more. Lost four of mine on the flats last spring. Grey things, big as doorways, iron round their necks. They took my people alive and walked away with them like sacks of meal. I\'ve fought everything in this basin. I don\'t fight those."',
        options: [
          { text: 'About Wren Voss...', to: 'wren' },
          { text: 'I see.', to: 'again' },
        ],
      },
      wren: {
        text: '"The Voss girl." A thin smile. "She shot Tully and Big Arno before we got a net over her. Tully\'ll live. Arno won\'t walk straight again. Somebody pays for that. Either her grandmother pays, or the girl works it off, or somebody like you makes me an interesting offer."',
        options: [
          { text: 'How much for her?', to: 'price' },
          { text: 'I\'ll fight you for her. You and me, bare hands.', to: 'duelOffer' },
          { text: '[Speech] Hattie Voss has friends. Keeping her granddaughter is bad business.', if: (c) => !c.flag('vr_speechTried'), skill: { key: 'speech', diff: 45 }, to: 'speechOk', fail: 'speechNo' },
          { text: 'Is there some other arrangement we could make?', to: 'deal' },
          { text: 'Let me think about it.', to: 'again' },
        ],
      },
      dumbWren: {
        text: 'Kestrel stares at you, then laughs until she coughs. "Please! It says please!" She wipes her eyes. "All right, little brain. You want the girl, you fight me. Fists. Like this." She shows you a fist. "Or you pay. Five hundred shiny. Understand?"',
        options: [
          { text: 'Me fight!', lowInt: true, to: 'duelOffer' },
          { text: 'Me pay!', lowInt: true, to: 'price' },
          { text: 'Me go.', lowInt: true, end: true },
        ],
      },
      price: {
        text: (c) => `"${(c.flag('vr_price') as number) || 500} scrip. For that you get the girl, her rifle, and my word nobody here puts a bullet in your back on the way out. My word is good. Ask anybody I\'ve given it to. The ones still breathing."`,
        options: [
          { text: (c) => `Here. ${(c.flag('vr_price') as number) || 500} scrip.`, any: true, if: (c) => c.scrip() >= ((c.flag('vr_price') as number) || 500), to: 'bought',
            do: (c) => { c.pay((c.flag('vr_price') as number) || 500); } },
          { text: '[Barter] Five hundred for a girl who shoots your people? She\'s a liability. I\'m doing you a favour.', if: (c) => !c.flag('vr_haggle1'), skill: { key: 'barter', diff: 10 }, to: 'haggle1', fail: 'haggleNo',
            do: (c) => c.set('vr_haggle1') },
          { text: '[Barter] Two-fifty, and I take her off your hands tonight, before she shoots anyone else.', if: (c) => !!c.flag('vr_haggle1') && !c.flag('vr_haggle2') && ((c.flag('vr_price') as number) || 500) <= 400, skill: { key: 'barter', diff: 40 }, to: 'haggle2', fail: 'haggleNo',
            do: (c) => c.set('vr_haggle2') },
          { text: 'That\'s too rich for me.', any: true, to: 'again' },
        ],
      },
      haggle1: {
        onEnter: (c) => c.set('vr_price', Math.min(350, (c.flag('vr_price') as number) || 500)),
        text: '"A favour." She turns the word over like a coin she suspects is fake. "She did chew through two ropes and a guard\'s thumb." A pause. "Three-fifty. Don\'t push your luck."',
        options: [{ text: 'Let\'s talk numbers again.', to: 'price' }],
      },
      haggle2: {
        onEnter: (c) => c.set('vr_price', 250),
        text: '"You\'ve got a mouth on you, shelter." She almost smiles. "Two-fifty. Only because I\'m tired of hearing her sing at night. She sings terribly. On purpose."',
        options: [{ text: 'Let\'s settle it.', to: 'price' }],
      },
      haggleNo: {
        text: '"No. And every time you try that, I think about raising it." She doesn\'t.',
        options: [{ text: 'Back to the price.', to: 'price' }],
      },
      speechOk: {
        onEnter: (c) => { c.set('vr_speechTried'); c.set('vr_price', Math.min(300, (c.flag('vr_price') as number) || 500)); },
        text: '"Friends. Hattie Voss has a captain with eleven spears, and nine of them are farmers." But she\'s listening. "Still. The north road\'s thin this year, and it goes past that village. A long feud with Cinder Creek is a bad trade for one mouthy girl." She drums her fingers. "Three hundred. That\'s me being wise. Don\'t tell anyone."',
        options: [{ text: 'Let\'s settle it.', to: 'price' }],
      },
      speechNo: {
        onEnter: (c) => c.set('vr_speechTried'),
        text: '"Hattie Voss has an old woman\'s spite and a village of farmers." Kestrel yawns. "I\'ve been threatened by better people with bigger guns. Most of their guns are in my rack."',
        options: [{ text: 'Fine. What\'s your price?', to: 'price' }, { text: 'Never mind.', to: 'again' }],
      },
      deal: {
        text: '"Other arrangement." She leans forward, interested for the first time. "Here\'s one. The old woman sent you, yes? Go back and tell her the girl died of fever. Say you saw the grave. She stops sending people; I stop having to kill them; the girl goes south with the next slaver caravan and fetches a good price. I pay you two hundred for the walk. Everyone wins except the girl, and the girl already lost."',
        options: [
          { text: 'Two hundred scrip. Done.', to: 'sold' },
          { text: 'No. Absolutely not.', to: 'wren' },
        ],
      },
      sold: {
        onEnter: (c) => {
          c.set('vr_soldWren');
          c.give('scrip', 200);
          c.karma(-60);
          if (c.questState('vr_wren') === 'none') c.quest('vr_wren', 'Kestrel paid me to tell Hattie Voss that Wren died.');
          c.questFail('vr_wren', 'I sold Wren out to Kestrel for two hundred scrip.');
        },
        text: 'Kestrel counts the scrip into your hand one token at a time, watching your face the whole while. "Look at that. Shelters do make people like us." From across the camp, you hear Wren\'s voice: she has heard every word.',
        options: [bye('...')],
      },
      bought: {
        onEnter: (c) => {
          c.set('vr_boughtWren');
          c.set('vr_wrenReleased');
          openCage(c);
          c.bark('vr_coll', 'All right, all right, I\'m opening it!');
        },
        text: '"Pleasure." The scrip vanishes into her coat without being counted; she\'ll count it later, in front of you, if you ever come back. "COLL! Open the pen. The girl\'s been bought." She looks back at you. "Take her and go. And tell the old woman the price goes up next time."',
        options: [bye('We\'re leaving.')],
      },
      duelOffer: {
        text: '"Ha!" Kestrel is on her feet in one motion. "Somebody finally asks. The ring\'s by the fire. No weapons, no armour, no friends. First one who can\'t get up loses. You win, you take the girl and walk out with my blessing. You lose, you pay for my trouble: three hundred scrip, or whatever you\'ve got."',
        options: [
          { text: 'Let\'s go.', any: true, to: 'duelStart' },
          { text: 'On second thought, no.', any: true, to: 'again' },
        ],
      },
      duelStart: {
        onEnter: (c) => {
          c.set('vr_dW', 0);
          c.set('vr_dL', 0);
          c.set('vr_duelDirty', false);
          c.advance(10);
          c.bark('vr_knuckles', 'RING! Mother\'s fighting!');
        },
        text: 'The camp empties into a ring of sandbags and shouting raiders. Someone is taking bets; you can hear that the odds are not in your favour. Kestrel rolls her neck, raises her wrapped fists and grins.\n\n"Come on, then."',
        options: [{ text: 'Raise your fists.', any: true, to: 'round' }],
      },
      round: {
        text: (c) => {
          const w = (c.flag('vr_dW') as number) || 0;
          const l = (c.flag('vr_dL') as number) || 0;
          if (!w && !l) return 'She circles to your left, loose and patient, and flicks out a jab just to see what you do with it.';
          if (w > l) return 'Kestrel spits red into the dust and grins wider. "Better," she says. "Again."';
          if (l > w) return 'The world rocks a little. Kestrel bounces on her toes, waiting for you to stand straight.';
          return 'You\'re both bleeding now. The crowd has gone quiet except for the bet-taker.';
        },
        options: duelOpts(),
      },
      land: {
        onEnter: (c) => c.inc('vr_dW'),
        text: (c) => (c.flag('vr_duelDirty') && !c.flag('vr_duelDirtyShown')
          ? (c.set('vr_duelDirtyShown'), 'You scoop grit from the ring floor and fling it in her eyes, then hit her while she\'s blind. The crowd boos. Nobody tries to stop it.')
          : HITS[c.random(HITS.length)]),
        options: [
          { text: 'Finish it.', any: true, if: (c) => ((c.flag('vr_dW') as number) || 0) >= 2, to: 'duelWon' },
          { text: 'Circle again.', any: true, if: (c) => ((c.flag('vr_dW') as number) || 0) < 2, to: 'round' },
        ],
      },
      take: {
        onEnter: (c) => { c.inc('vr_dL'); c.hurt(6); },
        text: () => TAKES[Math.floor(Math.random() * TAKES.length)],
        options: [
          { text: 'Try to get up...', any: true, if: (c) => ((c.flag('vr_dL') as number) || 0) >= 2, to: 'duelLost' },
          { text: 'Get back up.', any: true, if: (c) => ((c.flag('vr_dL') as number) || 0) < 2, to: 'round' },
        ],
      },
      duelWon: {
        onEnter: (c) => {
          c.set('vr_duelWon');
          c.set('vr_wrenReleased');
          c.set('vr_duelDirtyShown', false);
          openCage(c);
          c.xp(300);
          c.rep('vultures_roost', 20);
          if (!c.flag('vr_duelDirty')) c.karma(5);
          c.bark('vr_coll', 'Opening it! Opening it!');
        },
        text: (c) => (c.flag('vr_duelDirty')
          ? 'Kestrel goes down and stays down, one eye swollen shut and full of sand. She laughs up at the sky. "Grit. Cheap trick. Cheap tricks are a kind of strength, too." She waves a hand without getting up. "Coll! Open the pen. A deal\'s a deal, and I don\'t break mine. Not even for cheats."'
          : 'Kestrel hits the dust and doesn\'t get up. For a long moment there\'s no sound but the wind. Then she starts to laugh, lying on her back, blood in her teeth.\n\n"Nobody. Nobody\'s put me down since I was sixteen." She holds out a hand, and you pull her up. "COLL! Open the pen! The girl walks." She squeezes your hand hard enough to hurt. "Any time you want to lose your teeth properly, shelter, the ring\'s open."'),
        options: [bye('Pleasure.'), { text: 'Me win!', lowInt: true, end: true }],
      },
      duelLost: {
        onEnter: (c) => {
          c.set('vr_duelLost');
          c.hurt(10);
          const pay = Math.min(300, c.scrip());
          if (pay > 0) c.pay(pay);
          c.set('vr_duelDirtyShown', false);
          c.advance(30);
        },
        text: 'You wake up outside the ring with a mouthful of dust and a lighter purse. Kestrel crouches beside you, unwrapping her knuckles.\n\n"Not bad. Not good, but not bad. Come back when you\'ve grown a little. The ring doesn\'t close."',
        options: [bye('Ugh.')],
      },
      again: {
        text: (c) => (c.flag('vr_duelLost') ? '"Back for more? You\'ve still got my knuckle-print on your cheek."' : '"Still here, shelter? Talk or walk."'),
        options: [
          { text: 'About Wren Voss...', to: 'wren' },
          { text: 'I want a rematch.', if: (c) => !!c.flag('vr_duelLost'), to: 'duelOffer' },
          { text: 'Who are you people?', to: 'who' },
          { text: 'Give girl back. Please?', lowInt: true, to: 'dumbWren' },
          { text: 'I\'m here to end you, raider.', combat: true, do: (c) => c.set('vr_roostHostile') },
          bye(),
        ],
      },
      afterDeal: {
        text: '"We\'re square, shelter. Don\'t make me regret it by standing in my shack all day."',
        options: [bye()],
      },
      afterDuel: {
        text: '"My favourite shelter-rat." She taps her bruised cheek. "Still sore. Come back sometime and we\'ll do it for fun."',
        options: [bye('Maybe.')],
      },
      afterSneak: {
        text: '"The pen was open this morning. Coll was asleep. Somebody walked right through my camp, picked my lock and took my property." Her eyes don\'t leave yours. "I\'d like very much to know who. Wouldn\'t you?"',
        options: [
          { text: 'No idea.', end: true },
          { text: 'It was me. Want to do something about it?', combat: true, do: (c) => c.set('vr_roostHostile') },
        ],
      },
      afterSold: {
        text: '"Our business is done, shelter. Go and tell your lie. Tell it well."',
        options: [bye()],
      },
    },
  },
  // ---------------------------------------------------------------- Wren
  {
    id: 'wren',
    portrait: { bg: '#34402a' },
    start: (c) => {
      if (c.partyHas('wren')) return 'party';
      if (!c.flag('vr_wrenFreed')) {
        if (c.flag('vr_soldWren')) return cageOpen(c) ? 'freeSold' : 'sold';
        return cageOpen(c) ? 'free' : 'caged';
      }
      if (c.flag('vr_soldWren')) return 'coldHome';
      return 'home';
    },
    nodes: {
      caged: {
        text: 'A wiry young woman with a sunburnt nose and a split lip sits cross-legged in the pen, braiding a strand of fence wire into a surprisingly neat bracelet.\n\n"If you\'re buying, I bite. If you\'re selling, I bite harder. If you\'re here to get me out, the lock\'s a padlock and Kestrel wears the key round her neck." She squints at your jumpsuit. "Which is it?"',
        options: [
          { text: 'Your grandmother sent me.', to: 'gran' },
          { text: 'How do I get you out?', to: 'how' },
          { text: 'You Wren? Me help!', lowInt: true, to: 'howDumb' },
          bye('Hang on. I\'ll be back.'),
        ],
      },
      gran: {
        onEnter: (c) => { if (c.questState('vr_wren') === 'none') c.quest('vr_wren', 'Wren Voss is caged at Vultures\' Roost. Her grandmother Hattie is the elder of Cinder Creek.'); },
        text: '"Gran sent a shelter-dweller? She must be desperate." A pause. "Sorry. That came out wrong. Thank you. Really. I\'ve been in here nine days and I\'m out of ways to annoy them."',
        options: [{ text: 'How do I get you out?', to: 'how' }],
      },
      how: {
        onEnter: (c) => c.set('vr_knowsTrack'),
        text: '"I\'ve had nine days to think about it. One: Kestrel sells anything. She\'ll want five hundred for me, but she haggles if you don\'t flinch. Two: she\'s a brawler. Nobody\'s ever beaten her in the ring, and she\'s never turned down a challenge. Three: the lock\'s cheap. Coll\'s meant to watch me, but he\'s asleep by sundown and half asleep before it. Come in over the goat track, the crack in the north wall west of their fence, and nobody\'ll see you."\n\n"Four is you start shooting. I\'d rather you didn\'t, while I\'m in a box in the middle of it."',
        options: [
          { text: 'I\'ll get you out.', end: true },
          { text: 'Tell me about Kestrel.', to: 'kestrel' },
        ],
      },
      howDumb: {
        onEnter: (c) => c.set('vr_knowsTrack'),
        text: 'Wren looks at you, then smiles, surprisingly gently. "Yeah. I\'m Wren. Okay, listen. Lock." She taps the padlock. "Open lock, Wren comes out. Or talk to the lady with the scar. Give her scrip, or punch her. She likes punching."',
        options: [{ text: 'Open lock. Or punch. Okay!', lowInt: true, end: true }],
      },
      kestrel: {
        text: '"She\'s not stupid, which is the worst thing about her. She runs this place on fear and fair shares; nobody goes hungry and nobody talks back. She hit me once, when I spat at her. Just once. I think she liked me a bit after that."',
        options: [{ text: 'I\'ll be back for you.', end: true }],
      },
      free: {
        onEnter: (c) => freeWren(c),
        text: (c) => {
          const m = c.flag('vr_wrenMethod');
          if (m === 'sneak') return 'The gate swings open on greased hinges. Wren is up and out before it stops moving, low and quiet as a cat. "Nice work," she breathes. "Now let\'s not be here."';
          if (m === 'duel') return 'Wren is out of the pen and staring at you. "You beat her. You actually beat her. Gran is going to make you eat until you die."';
          if (m === 'bought') return 'Wren steps out of the pen, rubbing her wrists. "So I\'m bought. I\'ll pay you back. Probably in lizards." She collects her rifle from the rack as she passes, and nobody stops her.';
          return 'Wren steps out of the pen and looks around at the bodies. "Well. That\'s one way." She picks a rifle up from beside a dead raider, checks the bolt and nods. "Mine, actually."';
        },
        options: [
          { text: 'Come with me. I could use a good shot.', to: 'join' },
          { text: 'Go home to your grandmother. She\'s worried sick.', to: 'goHome' },
          { text: 'Come! Go! Together!', lowInt: true, to: 'join' },
        ],
      },
      join: {
        onEnter: (c) => c.recruit('wren'),
        text: '"Gran will want to see me. You can walk me home and collect your reward, and then..." She slings the rifle. "Then I\'m coming with you anyway. I\'ve seen the north ridge a thousand times. I want to see the rest."',
        options: [bye('Let\'s go.')],
      },
      goHome: {
        onEnter: (c) => sendWrenHome(c),
        text: '"I know the way. I could walk it blind." She hesitates, then hugs you, quick and bony. "Come by the house. Gran will want to pay you, and she\'ll be insulted if you don\'t let her."',
        options: [bye('Go safely.')],
      },
      sold: {
        text: 'Wren doesn\'t look up from her braiding. "I heard you. With her. Two hundred." She pulls the wire tight. "Go away."',
        options: [bye('...')],
      },
      freeSold: {
        onEnter: (c) => { c.set('vr_wrenFreed'); c.set('vr_wrenMethod', 'escaped'); sendWrenHome(c, true); },
        text: 'Wren slips out of the open pen and stops just out of reach. "I heard you, with her. Two hundred." She spits in the dust at your feet. "I\'ll find my own way home. And I\'ll tell Gran all of it."',
        options: [bye('...')],
      },
      coldHome: {
        text: '"Get away from our house."',
        options: [bye('...')],
      },
      home: {
        text: (c) => (c.flag('cc_wrenReturned')
          ? 'Wren is cleaning her rifle on the step. "Hey. Need a spotter? I\'m bored of shooting lizards that can\'t shoot back."'
          : 'Wren is sitting with Hattie, eating like she\'s never seen food before. "You came! Gran\'s been waiting to pay you. Talk to her. And then, if you\'re going somewhere, I\'m coming."'),
        options: [
          { text: 'Come with me.', to: 'rejoin' },
          { text: 'Tell me about yourself.', to: 'about' },
          { text: 'Come! Shoot things!', lowInt: true, to: 'rejoin' },
          bye('Just checking on you.'),
        ],
      },
      rejoin: {
        onEnter: (c) => c.recruit('wren'),
        text: '"About time." She\'s already packed.',
        options: [bye('Let\'s move.')],
      },
      party: {
        text: (c) => `Wren falls in beside you, rifle on her shoulder. ${wrenOpinion(c)}`,
        options: [
          { text: 'Let me see what you\'re carrying.', any: true, end: true, do: (c) => { const a = c.npc('wren'); if (a) setTimeout(() => import('../ui/loot').then((l) => l.openLoot({ kind: 'body', actor: a })), 60); } },
          { text: 'Wait here.', any: true, end: true, do: (c) => { const a = c.npc('wren'); if (a) (a as any)._wait = true; c.bark('wren', 'I\'ll keep watch.'); } },
          { text: 'Follow me.', any: true, end: true, do: (c) => { const a = c.npc('wren'); if (a) (a as any)._wait = false; } },
          { text: 'Tell me about yourself.', to: 'about' },
          { text: 'Head back to Cinder Creek for now. I\'ll find you there.', any: true, to: 'partHome' },
          bye('Nothing. Let\'s keep going.'),
        ],
      },
      partHome: {
        onEnter: (c) => sendWrenHome(c),
        text: '"Fine. I\'ll be at Gran\'s, eating her out of beans. Come and get me when you need a better shot than you."',
        options: [bye('See you.')],
      },
      about: {
        text: '"Grandad Harlan taught me to shoot. He never hit a thing in his life, but he knew exactly how you were meant to do it. I scout the north ridge for the village: lizards, raiders, ox thieves. I\'ve never been further than the Roost." She grimaces. "Well. I\'ve been to the Roost twice now."',
        options: [
          { text: 'What do you want out of all this?', to: 'want' },
          { text: 'Let\'s keep moving.', end: true },
        ],
      },
      want: {
        text: '"I want to see if the ocean is real. Anselm says it is. He also says a crow stole his teeth." She shrugs. "And I want Cinder Creek to still be there when I get back. So let\'s make sure of that too."',
        options: [bye('Let\'s.')],
      },
    },
  },
  // ---------------------------------------------------------------- raiders
  {
    id: 'vr_gate',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A raider with a car-spring spear looks you up and down. "Business or bleeding, shelter?"',
        options: [
          { text: 'Business. I want to see Kestrel.', to: 'biz' },
          { text: 'Me see boss lady!', lowInt: true, to: 'biz' },
          bye('Neither. I\'m leaving.'),
        ],
      },
      biz: {
        text: '"Mother\'s shack is at the far end, past the fire. Keep your hands where the birds can see them, don\'t touch the girl in the pen, and don\'t touch anything else either."',
        options: [bye('Understood.')],
      },
    },
  },
  {
    id: 'vr_brakk',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A bald slab of a man stands by the shack door with a pistol held loosely at his side. He looks at you. He continues to look at you.\n\n"Mother\'s inside," he says eventually. "Go in slow."',
        options: [bye('Slow. Got it.')],
      },
    },
  },
  {
    id: 'vr_knuckles',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A red-mohawked raider with plated knuckles is sweeping the ring with a broom made of ox tail. "You fight? You look like you bruise. Bruisers are good for business."',
        options: [
          { text: 'Has anyone ever beaten Kestrel?', to: 'beaten' },
          { text: 'Know any way to beat her?', if: (c) => !c.flag('vr_knuckleTip'), to: 'tip' },
          { text: 'Me fight good!', lowInt: true, to: 'beaten' },
          bye(),
        ],
      },
      beaten: {
        text: '"Beaten Mother? In the ring?" He laughs. "Nobody. Big Arno tried with a rock in his fist and she broke the rock. Her and me go back twelve years and I\'ve never seen her on her back."',
        options: [{ text: 'Any way to beat her?', if: (c) => !c.flag('vr_knuckleTip'), to: 'tip' }, bye()],
      },
      tip: {
        text: '"Maybe. Maybe I know a thing. Things cost."',
        options: [
          { text: 'Here\'s twenty scrip.', if: (c) => c.scrip() >= 20, to: 'tipGiven', do: (c) => { c.pay(20); } },
          { text: '[Speech] Imagine the betting if someone actually lasted a round with her.', skill: { key: 'speech', diff: 25 }, to: 'tipGiven', fail: 'tipNo' },
          bye('Forget it.'),
        ],
      },
      tipGiven: {
        onEnter: (c) => c.set('vr_knuckleTip'),
        text: 'He leans in and lowers his voice. "She had her left knee done in, years back, by a Rustwater deputy with a shovel. Heals fine, but she favours it. Crowd her left side and keep her turning on it." He winks. "You didn\'t hear it from me, and I\'m betting against you anyway."',
        options: [bye('Thanks.')],
      },
      tipNo: {
        text: '"Nice try. Twenty scrip, or go learn it the hard way."',
        options: [{ text: 'Here\'s twenty scrip.', if: (c) => c.scrip() >= 20, to: 'tipGiven', do: (c) => { c.pay(20); } }, bye()],
      },
    },
  },
  {
    id: 'vr_gristle',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A hooded, pock-marked man sits cross-legged on a tarp covered in guns, boots, spoons, and a surprising number of left shoes. "Gristle\'s Honest Goods. Nothing here was stolen from anyone who\'s going to complain."',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'Where does all this come from?', to: 'where' },
          { text: 'Heard anything interesting?', to: 'rumour' },
          bye(),
        ],
      },
      where: {
        text: '"Caravans, mostly. The north road. The Bazaar road, sometimes, if Mother\'s feeling bold." He holds up a single boot. "People are very generous when they\'re lying face-down."',
        options: [{ text: 'Charming.', to: 'hello' }],
      },
      rumour: {
        text: (c) => [
          '"Bought a collar off a man who swore he took it off a dead grey giant. Iron, thick as my wrist, humming. I threw it in the canyon. It hummed all night."',
          '"Mother\'s in a good mood. She broke a man\'s arm this morning and apologised after. That\'s her good mood."',
          '"Rustwater\'s casino man sends somebody up here twice a season to buy what we can\'t sell anywhere else. Pays well. Asks nothing."',
        ][c.random(3)],
        options: [{ text: 'Interesting.', to: 'hello' }],
      },
    },
  },
  {
    id: 'vr_coll',
    start: (c) => (c.flag('vr_collOut') ? 'asleep' : 'hello'),
    nodes: {
      hello: {
        text: 'A slack-jawed raider props himself against the rocks by the pen, yawning so wide you can count his teeth. There are not many to count. "Nobody talks to the girl. Mother\'s orders. You want something?"',
        options: [
          { text: 'You look thirsty. Have an ale on me.', if: (c) => c.has('beer'), to: 'ale', do: (c) => { c.take('beer'); } },
          { text: '[Speech] Kestrel wants you at the fire. Something about the watch roster.', skill: { key: 'speech', diff: 30 }, to: 'sent', fail: 'notSent' },
          { text: 'Nap time?', lowInt: true, to: 'nap' },
          bye('No.'),
        ],
      },
      ale: {
        onEnter: (c) => { c.set('vr_collOut'); c.xp(50); },
        text: 'Coll drains the ale in three swallows, sighs, and slides slowly down the rock until he\'s sitting. "Just resting my eyes," he explains to nobody. Within a minute he is snoring like a saw in wet wood.',
        options: [bye('Sweet dreams.')],
      },
      sent: {
        onEnter: (c) => { c.set('vr_collOut'); c.remove('vr_coll'); c.xp(50); },
        text: '"The roster? I did the roster." He frowns, deeply troubled. "Did I do the roster?" He shambles off toward the fire, muttering.',
        options: [bye('Off you go.')],
      },
      notSent: {
        text: '"Mother never wants me at the fire. She says I put it out by looking at it." He settles back against the rock, more awake than before.',
        options: [bye()],
      },
      nap: {
        text: '"Nap time? Always nap time." He yawns again. "Got anything to drink? Drink helps nap time."',
        options: [
          { text: 'Here, drink!', lowInt: true, if: (c) => c.has('beer'), to: 'ale', do: (c) => { c.take('beer'); } },
          { text: 'No drink.', lowInt: true, end: true },
        ],
      },
      asleep: {
        text: 'Coll is asleep, mouth open, a fly exploring his lower lip.',
        options: [bye('...')],
      },
    },
  },
]);

// ------------------------------------------------------------------ endings

defineEndings([
  {
    order: 20,
    title: 'Vultures\' Roost',
    scene: 'dust',
    text: (c) => {
      if (!c.flag('vr_visited')) return null;
      if (c.flag('vr_soldWren') && !c.flag('vr_wrenFreed')) return 'Mother Kestrel sold Wren Voss to a slaver caravan heading south, and paid for a new rack of rifles with the profit. The Roost remembered the shelter-dweller who could be bought for two hundred scrip, and Kestrel told the story often, always laughing.';
      if (c.flag('vr_roostCleared')) return 'The raiders of Vultures\' Roost were wiped out to the last. For a season the vultures ate well, and then the canyon was empty. Caravans on the north road still slowed down as they passed it, out of habit.';
      if (c.flag('vr_kestrelDead')) return 'Without Mother Kestrel the Roost tore itself apart within a month. Brakk and Knuckles fought over the camp; neither won. What was left of the raiders scattered into smaller, hungrier gangs that plagued the north road for years.';
      if (c.flag('vr_duelWon')) return 'Mother Kestrel told the story of the shelter-dweller who put her in the dust for the rest of her life, and embroidered it a little more each time. The Roost never raided Cinder Creek again. When anyone asked why, she only rubbed her jaw.';
      if (c.flag('vr_boughtWren')) return 'Kestrel spent your scrip on rifles. The Roost grew bolder, and the price of passage on the north road went up for everyone. She kept her word, though: no one from the Roost ever troubled you.';
      if (c.flag('vr_wrenMethod') === 'sneak') return 'Kestrel never learned who emptied her pen under Coll\'s snoring nose. She had Coll staked out on the cliffs for a night as a lesson, and afterwards the Roost kept double watches and trusted no one, which did not make it a happier place.';
      return 'The raiders of Vultures\' Roost kept preying on the north road, taking their cut and, now and then, a person. Mother Kestrel grew older and slower, and nobody ever dared to find out how much.';
    },
  },
  {
    order: 91,
    title: 'Wren Voss',
    scene: 'dust',
    look: { body: 'human', female: true, skin: '#a8704a', hair: '#7a3a1a', hairStyle: 'short', outfit: '#6a5a3a', outfit2: '#3a4a2a' },
    text: (c) => {
      if (c.flag('dead:wren')) return 'Wren Voss died far from the north ridge. Hattie buried an empty coat under the cairn where her granddaughter used to watch for raiders, and never again let anyone call a stranger from the shelters brave.';
      if (!c.flag('vr_wrenFreed')) return null;
      if (c.flag('vr_soldWren')) return 'Wren Voss escaped the Roost on her own and walked home barefoot. She told everyone in Cinder Creek what she had heard, and made sure they never forgot it. Years later she became the village\'s captain, and no shelter-dweller was ever welcome on her watch.';
      if (c.flag('party:wren')) return 'Wren Voss stayed at your side to the end, and then kept going. She saw the ocean in the autumn of 2179; it was real, and grey, and much bigger than Anselm had promised. She wrote Hattie a letter about it that took three caravans and a year to arrive.';
      return 'Wren Voss went back to the north ridge and her rifle. When Dag Oyelaran finally put down his, the village made her captain of the guard. Under her watch no raider came within a mile of Cinder Creek, and she taught every child in the village to shoot, including, eventually, her own.';
    },
  },
]);
