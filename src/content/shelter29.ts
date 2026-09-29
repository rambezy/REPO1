// Shelter 29: the player's home, and the cave outside the great hatch.

import { defineMap, defineDialogues, defineObjScripts, defineEndings } from './registry';
import type { Ctx } from '../game/types';

// --------------------------------------------------------------------- maps

defineMap({
  id: 'shelter29',
  name: 'Shelter 29',
  area: 'shelter29',
  floor: 'shelter',
  wall: 'shelter',
  music: 'shelter',
  legend: {
    H: { floor: 'metal', marker: 'H' },
    '>': { floor: 'metal', exit: 'out' },
  },
  rows: [
    '##############################################',
    '#####.L...l.#........W#.b.....t..#..x........#',
    '#####.......#.........#..........#...........#',
    '#####...a...#....w....#B.........#.......c...#',
    '#####.......#.....e...#....q.....#....n......#',
    '#####k......#.........#..........#...........#',
    '#####.......#.........#..........#...........#',
    '########+########+#########+###########+######',
    '>__#_________________________________________#',
    '>__H__S_______________2__________O___________#',
    '>__#_________________________________________#',
    '########+########+#########+###########+######',
    '#####.y.....#.u...v...#.........#............#',
    '#####.......#.........#..g...G..#...p........#',
    '#####.......#.........#.........#............#',
    '#####.......#....r....#....m....#............#',
    '#####...d...#.........#.........#.......z....#',
    '#####.......#.......V.#.........#............#',
    '#####.......#..f......#..h...j..#.....s......#',
    '#####.....1.#.........#.........#............#',
    '##############################################',
  ],
  entrances: { default: 'S', start: 'S', hatch: 'S' },
  exits: { out: { to: 'shelter29_cave', entrance: 'hatch' } },
  objects: [
    { kind: 'hatch', at: 'H', id: 'hatch29' },
    { kind: 'locker', at: 'L', name: 'armory locker', inv: [{ id: 'ammo9', n: 24 }, { id: 'flare', n: 1 }] },
    { kind: 'locker', at: 'l', name: 'armory locker', locked: 30, inv: [{ id: 'leatherJacket' }, { id: 'hypo', n: 1 }] },
    { kind: 'cabinet', at: 'k', name: 'weapons cabinet', locked: 60, inv: [{ id: 'huntingRifle' }, { id: 'ammo223', n: 10 }] },
    { kind: 'desk', at: 'e', name: 'Warden\'s desk', inv: [{ id: 'clarity', n: 1 }, { id: 'scrip', n: 25 }] },
    { kind: 'bookcase', at: 'W', name: 'records shelf' },
    { kind: 'terminal', at: 't', id: 'records', name: 'shelter records terminal', onUse: 'shelter_records' },
    { kind: 'bookcase', at: 'b', name: 'archive shelves' },
    { kind: 'table', at: 'B' },
    { kind: 'hydrocore', at: 'c', id: 'coreHousing', name: 'hydro-core housing', onUse: 'core_housing' },
    { kind: 'console', at: 'x', name: 'water control console' },
    { kind: 'bed', at: 'y', tint: '#d8d8d0' },
    { kind: 'bed', at: '1', tint: '#d8d8d0' },
    { kind: 'bunk', at: 'u' },
    { kind: 'bunk', at: 'v' },
    { kind: 'bunk', at: 'V' },
    { kind: 'footlocker', at: 'f', name: 'your footlocker', inv: [{ id: 'jerky', n: 2 }, { id: 'water', n: 1 }, { id: 'shelterPhoto', n: 1 }] },
    { kind: 'table', at: 'g', tint: '#8a8e90' },
    { kind: 'table', at: 'G', tint: '#8a8e90' },
    { kind: 'table', at: 'h', tint: '#8a8e90' },
    { kind: 'table', at: 'j', tint: '#8a8e90' },
    { kind: 'generator', at: 'z', name: 'backup generator' },
    { kind: 'toolbox', at: 'p', inv: [{ id: 'toolkit', n: 1 }] },
    { kind: 'shelf', at: 's', inv: [{ id: 'scrapElectronics', n: 2 }, { id: 'flare', n: 1 }] },
    { kind: 'lamp', at: '2' },
    { kind: 'lamp', at: 'O' },
  ],
  npcs: [
    { proto: 'shelteriteF', id: 'warden', name: 'Warden Marrow', at: 'w', dialog: 'warden', essential: true, look: { hair: '#8a8a8a', hairStyle: 'bun', skin: '#c8a080' } },
    { proto: 'shelterite', id: 'quill', name: 'Quartermaster Quill', at: 'a', dialog: 'quill', barter: true, inv: [{ id: 'ammo9', n: 36 }, { id: 'hypo', n: 2 }, { id: 'flare', n: 3 }, { id: 'rope', n: 1 }, { id: 'scrip', n: 120 }], look: { hair: '#5a4030', beard: true, skin: '#b88a60' } },
    { proto: 'shelteriteF', id: 'nell', name: 'Archivist Nell', at: 'q', dialog: 'nell', look: { skin: '#6a4028', hair: '#101010', hairStyle: 'bun' } },
    { proto: 'shelteriteF', id: 'rosa', name: 'Engineer Ferrante', at: 'n', dialog: 'rosa', look: { skin: '#d0a078', hair: '#3a1a10', hairStyle: 'short' } },
    { proto: 'shelterite', id: 'keita', name: 'Doctor Keita', at: 'd', dialog: 'keita', look: { skin: '#5a3420', hair: '#222', hairStyle: 'bald' } },
    { proto: 'shelterite', id: 'duncan', name: 'Duncan Stroud', at: 'r', dialog: 'duncan', wander: 3, look: { hair: '#c8a040', skin: '#e0b898' } },
    { proto: 'shelteriteF', name: 'Resident', at: 'm', wander: 4 },
    { proto: 'shelterite', name: 'Resident', at: 'G', wander: 4 },
    { proto: 'shelteriteF', name: 'Resident', at: 'O', wander: 6 },
    { proto: 'shelterite', id: 'guard29', name: 'Hatch Guard', at: [6, 8], dialog: 'hatchguard', look: { hairStyle: 'cap', outfit2: '#e08a2a' } },
  ],
  onEnter: (c: Ctx, first: boolean) => {
    if (first) {
      c.msg('The great hatch of Shelter 29 looms at the end of the corridor. Everyone you have ever known is behind you.');
      c.bark('guard29', 'Good luck out there.');
    }
    if (c.has('hydroCore') && !c.flag('coreReturned')) c.msg('The water chamber is at the far east end of the shelter.');
  },
});

defineMap({
  id: 'shelter29_cave',
  name: 'Ember Hills Cave',
  area: 'shelter29',
  floor: 'cave',
  wall: 'rock',
  wall2: 'shelter',
  dark: 0.5,
  music: 'cave',
  legend: {
    H: { floor: 'metal', marker: 'H' },
    h: { floor: 'metal', marker: 'h' },
    '<': { floor: 'metal', exit: 'in' },
  },
  rows: [
    '############################################',
    '############################################',
    '###############################..###########',
    '###########################......########%##',
    '########################.......b...#.....%##',
    '#######################..;...............%##',
    '#####################...................hH<#',
    '####################.....................%##',
    '###################.....................#%##',
    '##################......#######.....#####%##',
    '#################............###############',
    '################......#....R.###############',
    '################.....##...R..###############',
    '###############......###.k..################',
    '###########...#.......##...#################',
    '##########....#........#####################',
    '#########..Rj.##.......#####################',
    '#########....###....R..#####################',
    '#########.............######################',
    '#######..............#######################',
    '#####...............########################',
    '####.............###########################',
    '###>....e......#############################',
    '###>.......#################################',
    '###>..######################################',
    '############################################',
  ],
  entrances: { default: 'e', hatch: 'h' },
  exits: { in: { to: 'shelter29', entrance: 'hatch' }, out: { to: 'world' } },
  objects: [
    { kind: 'hatch', at: 'H', id: 'hatchOut', onUse: 'hatch_outside' },
    { kind: 'bones', at: 'b', blocks: false },
    { kind: 'bones', at: 'k', blocks: false },
    { kind: 'bag', at: [26, 13], name: 'rotting pack', inv: [{ id: 'ammo9', n: 8 }, { id: 'curePaste', n: 1 }, { id: 'scrip', n: 12 }] },
    { kind: 'pile', at: 'j', name: 'junk pile', inv: [{ id: 'scrapMetal', n: 2 }, { id: 'rope', n: 1 }] },
  ],
  npcs: [
    { proto: 'rat', at: 'R', count: 1 },
    { proto: 'rat', at: [27, 11] },
    { proto: 'rat', at: [11, 16] },
    { proto: 'rat', at: [20, 17] },
    { proto: 'rat', at: [26, 12] },
  ],
  onEnter: (c, first) => {
    if (first && c.flag('leftShelter') !== true) {
      c.set('leftShelter');
      c.msg('The hatch grinds shut behind you. The air smells of dust and animals. Somewhere ahead, a pale light.');
      const h = c.obj('hatchOut');
      if (h) h.open = false;
    }
  },
});

// --------------------------------------------------------------------- scripts

defineObjScripts({
  shelter_records: (c) => {
    c.sound('terminal');
    import('../ui/pda').then((p) => p.addNote('SHELTER 29 RECORDS\nConstruction contractor: Holloway-Brandt Civil Defense Group.\nSister facilities in region: Shelter 7 (Calder City, transit level), Shelter 12 (location sealed), Shelter 40 (never completed).\nHydro-core: HC-40 Aquifer Regulator, 1 installed, 0 spares. Spares requisition #4471: DENIED (budget).'));
    c.msg('The terminal lists the shelter\'s sister facilities. Shelter 7 was built under Calder City, to the south-east.');
    if (!c.flag('knowsShelter7')) {
      c.set('knowsShelter7');
      c.quest('hydrocore', 'Records say Shelter 7 was built under Calder City, far to the south-east. It may have a spare hydro-core.');
      c.xp(50);
    }
    return true;
  },
  core_housing: (c) => {
    if (c.flag('coreReturned')) {
      c.msg('The new hydro-core hums quietly. Clean water flows again.');
      return true;
    }
    if (c.has('hydroCore')) {
      c.startDialog('rosa', 'rosa');
      return true;
    }
    c.msg('The hydro-core housing. A long crack runs across the core\'s ceramic casing, and a red warning light blinks steadily.');
    return true;
  },
  hatch_outside: (c, o) => {
    if (o.open) return false;
    c.msg('The great hatch rolls aside with a groan of gears.');
    c.sound('hatch');
    o.open = true;
    return true;
  },
});

// --------------------------------------------------------------------- dialogue

defineDialogues([
  {
    id: 'warden',
    start: (c) => {
      if (c.flag('gameWon')) return 'victory';
      if (c.flag('coreReturned') && c.questState('grafted') === 'none') return 'act2';
      if (c.flag('coreReturned')) return 'act2again';
      if (c.has('hydroCore')) return 'hascore';
      return c.flag('metWarden') ? 'again' : 'hello';
    },
    nodes: {
      hello: {
        onEnter: (c) => c.set('metWarden'),
        text: (c) => `Warden Ilse Marrow looks up from a spread of yellowed schematics. Her eyes are red from lack of sleep.\n\n"${c.playerName()}. Good. You've heard the rumours, so I'll give you the truth. The hydro-core is cracked. Ferrante has patched it twice, and it won't take a third. When it goes, we have the reserve tanks, and the reserve tanks hold a hundred and fifty days."`,
        options: [
          { text: 'And you want me to go outside.', to: 'outside' },
          { text: 'Why me?', to: 'whyme' },
          { text: 'Water go away? Bad.', lowInt: true, to: 'dumb' },
        ],
      },
      dumb: {
        text: 'She studies you for a long moment, then speaks slowly. "Yes. Very bad. You... go outside. Find a machine that looks like this." She taps a drawing of a squat cylinder. "Bring it back. Ask people. Understand?"',
        options: [
          { text: 'Find cylinder. Bring back. Okay!', lowInt: true, to: 'go', do: (c) => startQuest(c) },
        ],
      },
      whyme: {
        text: '"Because you scored highest on the survival drills, because your family has one of the smallest water allotments, and because when I asked for volunteers, you were the one who didn\'t look at the floor." She almost smiles. "Also, the council voted. I voted against. I was outvoted."',
        options: [
          { text: 'That\'s reassuring. What exactly am I looking for?', to: 'outside' },
        ],
      },
      outside: {
        text: '"An HC-40 Aquifer Regulator. A hydro-core. About the size of a footlocker, heavy, with a blue indicator window. Every public shelter had at least one. If another shelter survived, or even if it didn\'t, there may be one to salvage. Nell has the old construction records in the archive terminal; start there."',
        options: [
          { text: 'Where should I go first?', to: 'where' },
          { text: 'What\'s out there?', to: 'whatsout' },
          { text: 'I\'ll do it.', to: 'go', do: (c) => startQuest(c) },
        ],
      },
      where: {
        text: '"Before we sealed the hatch for good, eighty years ago, the last scouts reported a settlement by a creek to the south-east, a day\'s walk. Cinder Creek, they called it. If anyone is still alive out there, that\'s where I\'d ask. I\'ve marked it on your wrist-link."',
        options: [
          { text: 'What\'s out there?', to: 'whatsout', do: (c) => c.reveal('cinder_creek') },
          { text: 'I\'ll do it.', to: 'go', do: (c) => { c.reveal('cinder_creek'); startQuest(c); } },
        ],
      },
      whatsout: {
        text: '"Honestly? No one knows. Radiation, certainly, though it should have faded. Animals. Possibly people, and people are the dangerous kind. Quill will issue you a sidearm. Doctor Keita has medicine. Don\'t be proud about using either."',
        options: [
          { text: 'I\'ll do it.', to: 'go', do: (c) => { c.reveal('cinder_creek'); startQuest(c); } },
        ],
      },
      go: {
        text: (c) => `She stands and grips your hand. "One hundred and fifty days, ${c.playerName()}. Your wrist-link will count them down for you. Come home."`,
        options: [{ text: 'I will.', end: true }],
      },
      again: {
        text: (c) => `"${c.waterDays()} days of water left. Is there something you need before you go?"`,
        options: [
          { text: 'Remind me what I\'m looking for.', to: 'outside' },
          { text: 'Can you spare anything to help me?', if: (c) => !c.flag('wardenGift'), to: 'gift' },
          { text: 'I\'m on my way.', end: true },
        ],
      },
      gift: {
        onEnter: (c) => {
          c.set('wardenGift');
          c.give('scrip', 100);
          c.give('wardenLetter');
        },
        text: '"The shelter\'s savings. It isn\'t much, and I have no idea whether it\'s worth anything outside. And a letter with my seal, for whatever an old warden\'s word is worth to strangers."',
        options: [{ text: 'Thank you, Warden.', end: true }],
      },
      hascore: {
        text: '"Is that... it is. It really is." She sits down heavily. "Take it to Ferrante in the water chamber. Now. Please."',
        options: [{ text: 'On my way.', end: true }],
      },
      act2: {
        onEnter: (c) => {
          c.quest('grafted', 'The Warden fears the Grafted will find Shelter 29. Find out where they come from, and who leads them.');
          c.set('act2');
          const s = (window as any).G?.state;
          if (s && !s.armyDeadline) s.armyDeadline = s.time + 180 * 1440;
          c.reveal('bazaar');
        },
        text: '"The water is running clean. You did that." Marrow closes a thick folder marked SHELTER 7. "Ferrante copied the logs from the core you brought back. Shelter 7 wasn\'t emptied by thirst. Something came for them: huge grey men with iron collars, who took the residents away alive. Whoever sent them was looking for people from sealed shelters. People like us."\n\n"If they found Shelter 7, they will find us. I can\'t send the whole shelter out to fight. I can only ask you, again."',
        options: [
          { text: 'I\'ll find out who is behind them.', to: 'act2go' },
          { text: 'I\'ve done enough. Send someone else.', to: 'refuse' },
        ],
      },
      refuse: {
        text: '"I know. I know you have." She doesn\'t look away. "There is no one else. Every scouting party I\'ve sent past the cave hasn\'t come back. You came back."',
        options: [{ text: 'Fine. I\'ll go.', to: 'act2go' }],
      },
      act2go: {
        text: '"The Grafted were seen with caravans near the Crossroads Bazaar; the traders there will know more than we do. Whatever makes them, and whoever commands them, has to be stopped. Our best guess is we have half a year before they find the hills."',
        options: [{ text: 'Understood.', end: true }],
      },
      act2again: {
        text: (c) => {
          const vats = c.questState('vats') === 'done';
          const shep = c.questState('shepherd') === 'done';
          if (vats && shep) return '"You did it. Both of them." Marrow shakes her head in wonder. "Come, the council is waiting for you."';
          return `"Any news?" she asks. ${vats ? '"Ferrante heard about Fort Kessler on the old radio. The vats are gone. That leaves whoever gives the orders."' : shep ? '"With their leader gone, the Grafted are scattered, but if the vats still work, more will come."' : ''}`;
        },
        options: [
          { text: 'It\'s over. The vats and the Shepherd are both gone.', if: (c) => c.questState('vats') === 'done' && c.questState('shepherd') === 'done', to: 'win' },
          { text: 'Not yet.', end: true },
        ],
      },
      win: {
        onEnter: (c) => {
          c.set('gameWon');
          c.questDone('grafted', 'The Grafted threat is ended.');
        },
        text: '"Then Shelter 29 owes you twice over." The Warden takes a breath. "The council met while you were gone. They want to open the hatch for good: trade with Cinder Creek, send people to learn from the Keepers, grow food under the actual sky. They want you on the council, to show them how. Or, if the road is in your blood now, the hatch will always open for you."',
        options: [
          { text: 'I\'ll stay and help open the hatch.', do: (c) => { c.set('endingStay'); c.endGame('victory'); }, end: true },
          { text: 'My place is out there now.', do: (c) => { c.set('endingLeave'); c.endGame('victory'); }, end: true },
        ],
      },
      victory: {
        text: '"The council awaits your decision whenever you\'re ready."',
        options: [
          { text: 'I\'ll stay.', do: (c) => { c.set('endingStay'); c.endGame('victory'); }, end: true },
          { text: 'I\'m leaving.', do: (c) => { c.set('endingLeave'); c.endGame('victory'); }, end: true },
          { text: 'Not yet.', end: true },
        ],
      },
    },
  },
  {
    id: 'quill',
    start: (c) => (c.flag('quillGear') ? 'again' : 'hello'),
    nodes: {
      hello: {
        text: 'Quartermaster Quill pushes a pistol and two boxes of cartridges across the counter. "Standard issue for a surface expedition, which is to say, the only issue there\'s ever been. Nine-millimetre service pistol. Clean it, don\'t drop it in sand, and don\'t shoot anything you\'re going to want to talk to later."',
        options: [
          { text: 'Thanks, Quill.', do: (c) => giveGear(c), to: 'after' },
          { text: 'Gun! Shoot bad things!', lowInt: true, do: (c) => giveGear(c), to: 'after' },
        ],
      },
      after: {
        text: '"Anything else you want, you\'ll have to trade for. I don\'t make the rules. Well. I do make the rules. But I didn\'t make the shortages."',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'How do I use this thing?', to: 'howto' },
          { text: 'See you, Quill.', end: true },
        ],
      },
      howto: {
        text: '"Put it in your hand, point it at trouble, press A or pick the target cursor. If it clicks instead of bangs, press R to reload. Aimed shots cost more time but you can go for the eyes or the legs. And in a fight you get a limited amount of action per turn, so don\'t waste it walking in circles."',
        options: [{ text: 'Got it.', to: 'after' }],
      },
      again: {
        text: '"Back for more? My shelves aren\'t getting any fuller."',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'Never mind.', end: true },
        ],
      },
    },
  },
  {
    id: 'nell',
    start: 'hello',
    nodes: {
      hello: {
        text: 'Archivist Nell peers at you over spectacles held together with wire. "The traveller! The archive terminal has the old construction records, if you want them. I\'ve read them so many times I could recite them, which I will now spare you."',
        options: [
          { text: 'What do the records say about other shelters?', to: 'shelters' },
          { text: 'What do you know about the outside?', to: 'outside' },
          { text: 'Bye.', end: true },
        ],
      },
      shelters: {
        onEnter: (c) => {
          if (!c.flag('knowsShelter7')) {
            c.set('knowsShelter7');
            c.quest('hydrocore', 'Nell says Shelter 7 was built under Calder City, far to the south-east. It may have a spare hydro-core.');
          }
        },
        text: '"The same contractor built at least three others. Shelter 7 is the one that matters: it was dug beneath the transit station in Calder City, south-east of here, past the big market roads. If anywhere still has a working hydro-core, it\'s a shelter that nobody has opened."',
        options: [
          { text: 'How far is Calder City?', to: 'far' },
          { text: 'Thanks.', end: true },
        ],
      },
      far: {
        text: '"Far. Several days on foot at least, and the old maps are older than you and me put together. Ask the surface people for directions; I doubt a city that size has been forgotten."',
        options: [{ text: 'Thanks, Nell.', end: true }],
      },
      outside: {
        text: '"Only what the last scouts wrote eighty years ago. Dust storms. Big lizards. A town made of cars. They described the sky as \'unbearably large\'." She sighs. "I would give a great deal to see it. Tell me about it when you get back?"',
        options: [{ text: 'I promise.', end: true }],
      },
    },
  },
  {
    id: 'rosa',
    start: (c) => (c.flag('coreReturned') ? 'done' : c.has('hydroCore') ? 'install' : 'hello'),
    nodes: {
      hello: {
        text: 'Engineer Ferrante is up to her elbows in a tangle of pipes. "That\'s the problem," she says, pointing a wrench at the cracked cylinder behind her. "HC-40. Ceramic membrane cracked straight through. I\'ve got it running on patch putty and prayer. Find me another one, even a damaged one, and I can make it work."',
        options: [
          { text: 'Anything you can give me for the road?', if: (c) => !c.flag('rosaGift'), to: 'gift' },
          { text: 'I\'ll find one.', end: true },
        ],
      },
      gift: {
        onEnter: (c) => {
          c.set('rosaGift');
          c.give('geiger');
        },
        text: '"Take my rad counter. If it starts chattering, walk the other way. And if you find anything that looks like the core, don\'t let anyone \'fix\' it for you."',
        options: [{ text: 'Thanks, Rosa.', end: true }],
      },
      install: {
        text: '"Is that... give it here. Give it HERE." She practically tears the core from your pack, turning it over in her hands. "Scorched casing, but the membrane is whole. I can have this running in an hour."',
        options: [
          {
            text: 'Do it.',
            do: (c) => {
              c.take('hydroCore');
              c.set('coreReturned');
              c.questDone('hydrocore', 'You brought a working hydro-core home to Shelter 29.');
              c.karma(50);
              c.advance(60);
              const o = c.obj('coreHousing');
              if (o) o.used = true;
              c.msg('An hour later, the red light turns blue. Clean water flows through Shelter 29 again.');
            },
            to: 'installed',
          },
        ],
      },
      installed: {
        text: '"Listen to that." Water gurgles in the pipes overhead. "Go see the Warden. And... thank you. From all four hundred of us."',
        options: [{ text: 'Glad I could help.', end: true }],
      },
      done: {
        text: '"She purrs like a cat. Best water we\'ve had in twenty years."',
        options: [{ text: 'Good to hear.', end: true }],
      },
    },
  },
  {
    id: 'keita',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => `Doctor Keita sets down a tray of instruments. "${c.flag('keitaGift') ? 'Back in one piece, I see. Mostly.' : 'The explorer. I have something for you.'}"`,
        options: [
          { text: 'You said you had something for me?', if: (c) => !c.flag('keitaGift'), to: 'gift' },
          { text: 'Can you patch me up?', to: 'heal' },
          { text: 'Goodbye, Doctor.', end: true },
        ],
      },
      gift: {
        onEnter: (c) => {
          c.set('keitaGift');
          c.give('hypo', 2);
          c.give('radPurge', 1);
        },
        text: '"Two mend-hypos and a bag of rad-purge. Jab the hypo into your thigh, not your heart, whatever you\'ve read in adventure stories. The rad-purge is for when that counter of Ferrante\'s won\'t shut up."',
        options: [{ text: 'Thank you.', to: 'hello' }],
      },
      heal: {
        onEnter: (c) => {
          c.heal(999);
          c.advance(30);
        },
        text: '"Hold still." Half an hour of prodding, cleaning and stitching later, you feel a good deal better.',
        options: [{ text: 'Thanks, Doc.', end: true }],
      },
    },
  },
  {
    id: 'duncan',
    start: (c) => (c.flag('coreReturned') ? 'after' : 'hello'),
    nodes: {
      hello: {
        text: 'Duncan Stroud leans on a bunk, arms folded. You two have competed for everything since the shelter school. "So they picked you. Figures. When you get eaten by a lizard, I\'ll volunteer to go next."',
        options: [
          { text: 'Nice to know you care, Duncan.', to: 'care' },
          { text: '[Speech] You could have volunteered. Why didn\'t you?', skill: { key: 'speech', diff: 0 }, to: 'honest', fail: 'nope' },
          { text: 'You smell like feet.', lowInt: true, to: 'feet' },
          { text: 'Goodbye.', end: true },
        ],
      },
      care: {
        text: '"I don\'t." He looks away. "Just... don\'t die stupidly."',
        options: [{ text: 'I\'ll try.', end: true }],
      },
      honest: {
        onEnter: (c) => {
          if (!c.flag('duncanGift')) {
            c.set('duncanGift');
            c.give('throwingKnife', 3);
          }
        },
        text: 'He is quiet for a moment. "Because I was scared. Happy?" He digs in his footlocker and pushes three balanced knives into your hands. "My grandfather\'s. Throwing knives. He said they never missed. They always missed. Bring them back."',
        options: [{ text: 'I will. Thanks, Duncan.', end: true }],
      },
      nope: {
        text: '"None of your business." He turns his back.',
        options: [{ text: 'Fine.', end: true }],
      },
      feet: {
        text: '"...Yeah, well. You smell like... also feet." He seems satisfied with this exchange.',
        options: [{ text: 'Ha!', lowInt: true, end: true }],
      },
      after: {
        text: '"Everyone\'s talking about you, you know. It\'s unbearable." He almost smiles. "Good job."',
        options: [{ text: 'Thanks, Duncan.', end: true }],
      },
    },
  },
  {
    id: 'hatchguard',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => (c.flag('leftShelter') ? '"Welcome back. Hatch opens from outside with your pass. Just knock loud."' : '"Hatch is open for you. The cave beyond is full of rats; we hear them scratching at night. Once you\'re through, walk toward the light."'),
        options: [{ text: 'Thanks.', end: true }],
      },
    },
  },
  {
    id: 'wandering_trader',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A sun-cracked trader lowers a long rifle when you raise empty hands. "Easy, friend. I\'m just a pair of boots and an ox. Buying, selling?"',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'Heard any news?', to: 'news' },
          { text: 'Safe travels.', end: true },
        ],
      },
      news: {
        text: (c) => ['"Caravans keep going missing on the east roads. The Bazaar\'s put a price on answers."', '"The Withered down in Calder don\'t shoot first. That\'s more than I can say for Rustwater."', '"Raiders up at the Roost have been taking people from Cinder Creek. Sad business."', '"Saw big grey fellows marching north-east, toward the craters. I didn\'t stay to wave."'][c.random(4)],
        options: [{ text: 'Thanks.', to: 'hello' }],
      },
    },
  },
]);

function startQuest(c: Ctx) {
  c.quest('hydrocore', 'The Warden asks you to find an HC-40 hydro-core. Try Cinder Creek first, and check the archive terminal.');
  c.reveal('cinder_creek');
  if (!c.has('shelterPass')) c.give('shelterPass');
}

function giveGear(c: Ctx) {
  if (c.flag('quillGear')) return;
  c.set('quillGear');
  c.give('pistol9');
  c.give('ammo9', 24);
}

// --------------------------------------------------------------------- endings

defineEndings([
  {
    order: 0,
    title: 'Shelter 29',
    scene: 'door',
    text: (c) => c.flag('endingStay')
      ? 'You stayed. Under your guidance the great hatch of Shelter 29 was propped open, and the first crops planted under open sky failed, and the second did not. Children born that year never knew a ceiling.'
      : 'You left. The residents of Shelter 29 opened the hatch for good the next spring, and for years afterward travellers brought stories of a stranger in a teal jumpsuit, always somewhere just over the horizon.',
  },
]);
