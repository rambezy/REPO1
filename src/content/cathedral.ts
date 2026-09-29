// The Glass Cathedral: a domed observatory on the southern cliffs where the
// Shepherd broadcasts the Hymn. Maps: `cathedral` (compound, outdoors) and
// `cathedral_dome` (the transmitter hall). Quest `shepherd`.

import { defineMap, defineDialogues, defineObjScripts, defineDeathScripts, defineEndings } from './registry';
import { defineItems } from '../data/items';
import { defineProtos, S, PROTOS } from '../data/protos';
import type { Ctx, ObjSpawn, NpcSpawn, Actor } from '../game/types';
import { G } from '../game/G';
import { kill } from '../game/combat';
import { recruit, dismiss } from '../game/party';
import { endgameCheck } from './kessler';

// --------------------------------------------------------------------- items & protos

defineItems([
  { id: 'ct_domeKey', name: 'Dome Key', type: 'key', weight: 0, value: 0, icon: 'key', desc: 'A long brass key engraved with a hollow circle. It opens the door from the nave of the Glass Cathedral into the dome.' },
  { id: 'ct_badge', name: 'Longhaul Guard Badge', type: 'misc', weight: 0, value: 20, icon: 'jewel', desc: 'A tarnished tin badge: LONGHAUL CARAVANS / GUARD / G. ASH. Someone has polished it so often the lettering is nearly gone.' },
]);

defineProtos([
  { id: 'ctAcolyte', name: 'Choir Acolyte', desc: 'an acolyte of the Choir in a pale robe, humming under her breath', look: { body: 'human', skin: '#c8a080', hair: '#3a2a1a', hairStyle: 'hood', outfit: '#cfc6b0', outfit2: '#7a8ca0' }, stats: S(5, 6, 5, 5, 5, 6, 5), xp: 90, skills: { melee: 60, unarmed: 55 }, equip: ['knife', 'robe'], inv: [{ id: 'hypo', chance: 40 }, { id: 'scrip', n: 12, chance: 60 }], team: 'choir', hostile: false, fleeAt: 0.2 },
  { id: 'ctAcolyteLaser', name: 'Choir Warden', desc: 'a Choir warden, robe belted over a holstered beam pistol', look: { body: 'human', skin: '#b08060', hair: '#1a1a1a', hairStyle: 'hood', outfit: '#b8ae98', outfit2: '#4a5a70' }, stats: S(5, 7, 6, 5, 5, 7, 5), xp: 150, skills: { energy: 75, melee: 55 }, equip: ['laserPistol', 'robe'], inv: [{ id: 'cell', n: 20 }, { id: 'hypo', chance: 50 }], team: 'choir', hostile: false, fleeAt: 0.15 },
  {
    id: 'ctShepherd', name: 'the Shepherd', desc: 'the Shepherd: what is left of Aurelio Vance, grown huge and grey and wired into the transmitter',
    look: { body: 'human', skin: '#a8a898', hairStyle: 'bald', outfit: '#d8d0c0', outfit2: '#3a6a8a', scale: 1.6 },
    stats: S(8, 8, 9, 9, 10, 3, 6), hp: 260, ap: 8, xp: 2000, dt: { normal: 5, laser: 4, plasma: 3 }, dr: { normal: 30, laser: 30, plasma: 20, explode: 25 },
    natural: { name: 'Hymn lash', dmg: [14, 28], ap: 4, dmgType: 'laser', range: 12 }, team: 'choir', hostile: false,
  },
  {
    id: 'ctAshgrave', name: 'Ashgrave', desc: 'Ashgrave, the Shepherd\'s lieutenant: a Grafted taller than the rest, with a polished collar',
    look: { body: 'grafted', skin: '#6f7a66', outfit: '#5a2a2a', outfit2: '#b09040', scale: 1.5 },
    stats: S(10, 6, 9, 5, 7, 6, 5), hp: 180, xp: 800, dt: { normal: 4 }, dr: { normal: 25, laser: 15 },
    skills: { melee: 95, bigGuns: 80, unarmed: 90 }, equip: ['sledge'], inv: [{ id: 'hypo', n: 4 }], team: 'choir', hostile: false,
  },
]);

// --------------------------------------------------------------------- helpers

const ALARM_FLAGS = ['ct_alarm', 'hostile:cathedral:choir', 'hostile:cathedral_dome:choir'];

function choirAlarmed(c: Ctx): boolean {
  return ALARM_FLAGS.some((f) => !!c.flag(f));
}

function isGrafted(a: Actor): boolean {
  return PROTOS[a.proto]?.look.body === 'grafted';
}

/** Set Choir hostility on the current map from the story flags. */
function syncChoir(c: Ctx) {
  const m = G.map;
  if (!m || (m.def.id !== 'cathedral' && m.def.id !== 'cathedral_dome')) return;
  const alarm = choirAlarmed(c);
  const silenced = !!c.flag('ct_hymnSilenced');
  for (const a of m.actors) {
    if (a.dead || a.companion || a.team !== 'choir') continue;
    if (silenced && isGrafted(a)) {
      calmGrafted(a);
      continue;
    }
    if (m.def.id === 'cathedral_dome' && !alarm) {
      const guard = !!a.npc && (a.npc.startsWith('ct_domeGuard') || a.npc.startsWith('ct_domeAcolyte'));
      a.hostile = guard && !c.flag('ct_audience');
    } else a.hostile = alarm;
  }
}

function calmGrafted(a: Actor) {
  a.team = 'neutral';
  a.hostile = false;
  a.wander = a.wander || 3;
  a.home = { q: a.q, r: a.r };
}

/** After the Shepherd falls, the human Choir scatters from the compound. */
function scatterChoir(c: Ctx) {
  const m = G.map;
  if (!m) return;
  const before = m.actors.length;
  m.actors = m.actors.filter((a) => !(a.team === 'choir' && !a.dead && !isGrafted(a) && !a.companion));
  if (m.actors.length !== before) c.msg('The Choir has scattered. Robed figures are streaming away down the cliff roads, some of them weeping, some of them laughing, one of them still singing, badly.');
}

function unlockDome() {
  const d = G.map?.objects.find((o) => o.id === 'ct_domeDoor') ?? G.state.maps.cathedral?.objects.find((o) => o.id === 'ct_domeDoor');
  if (d) d.locked = 0;
}

function grantAudience(c: Ctx) {
  c.set('ct_audience');
  unlockDome();
  syncChoir(c);
}

function doSilence(c: Ctx, how: 'science' | 'repair' | 'cable') {
  if (c.flag('ct_hymnSilenced')) return;
  c.set('ct_silencing');
  c.set('ct_hymnSilenced');
  c.set('ct_silencedBy', how);
  const m = G.map;
  const s = c.npc('ct_shepherd');
  if (s && !s.dead) {
    c.set('ct_shepherdSilenced');
    c.msg('The Hymn stops. In the silence, the Shepherd lets out one long breath, like a bellows emptying, and does not draw another.');
    kill(s, null, 'laser');
  } else {
    c.questDone('shepherd', 'You silenced the Hymn transmitter. The Grafted are free of it.');
  }
  if (m) {
    for (const a of m.actors) {
      if (a.dead || a.companion) continue;
      if (a.team === 'choir' && isGrafted(a)) calmGrafted(a);
    }
    m.actors = m.actors.filter((a) => !(a.team === 'choir' && !a.dead && !isGrafted(a)));
  }
  c.msg('The Grafted in the dome stop where they stand. One sits down on the floor and puts its head in its hands. None of them look at you.');
  c.xp(750);
  c.karma(50);
  endgameCheck(c);
}

function turnAshgrave(c: Ctx) {
  c.set('ct_ashgraveTurned');
  const a = c.npc('ct_ashgrave');
  if (a) recruit(a);
  c.set('ct_alarm');
  // The Doorwards hear two masters at once, and freeze.
  let n = 0;
  for (const x of G.map?.actors ?? []) {
    if (!x.dead && x.team === 'choir' && isGrafted(x) && x !== a) {
      calmGrafted(x);
      n++;
    }
  }
  if (n) c.msg('The Grafted Doorwards look from their lieutenant to the throne and back, and do nothing at all.');
  c.hostile('ct_shepherd');
}

function ashgraveLeaves(c: Ctx) {
  c.set('ct_ashgraveLeads');
  const a = c.npc('ct_ashgrave');
  if (a && a.companion) dismiss(a);
  c.remove('ct_ashgrave');
  c.msg('Ashgrave walks out of the dome without looking back.');
}

function hasEvidence(c: Ctx): boolean {
  return c.has('kf_intakeFile') || !!c.flag('ct_knowsRetune') || c.has('ct_badge');
}

// --------------------------------------------------------------------- maps

// BEGIN GENERATED (tools: scratchpad mapgen.py)
const CT_ROWS = [
  "KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "K......T...\"o..\".\"....\".....\"............\"..\".\".\"....K",
  "K.\"...\"\"...................\"..........\".............\"K",
  "K...\"..........\"........\".\"..\"..\".......\"...........\"K",
  "K\"..\".\".......#######################################K",
  "K.............#...........###%##%#####%##%####......#K",
  "K.\".......\"o\".#....\".\"..\".#,,,,,,,,,,,,,,,,,,#..\"\"..#K",
  "K\"....\".......#\"..\"...\"...#,,,,,,,,,,,,,,,,,,#......#K",
  ">............\"#.......\"...#,,,,,,,,,,,,,,,,,,#......#K",
  ">.....................\"...#,,,,,,,,,,,,,,,,,,#....\".#K",
  ">::E::::::::::.=========..#,,,,,,,,,,,,,,,,,,#\"\".\"..#K",
  ">:::::::::::::.=========..#,,,,,,,,,,,,,,,,,,#......#K",
  ">..\"....\".o\"...\"..==....\".#########+##########...\"..#K",
  "K..\"..........#\"..==.......\".........\"\".........\"...#K",
  "K........\"\"...#...==....#%%%%%%%%%%#%%%%%%%%%%#.....#K",
  "K\".\"..........#...==....%=====================%.....#K",
  "K.............#...==....%=====================%.....#K",
  "KT............#...==....%=====================%.....#K",
  "K.............#...==....%=====================%.....#K",
  "K.....\"...\"..\"#...==....%=====================#######K",
  "KT..T....\"\"...#..\"==....%=====================#,,,,,#K",
  "K........\".\"..#...==....%=====================#,,,,D#K",
  "K...\".........#...======%kkkkkkkkkkkkkkkkkkkkk#,,,,D#K",
  "K........\"....#...======+kkkkkkkkkkkkkkkkkkkkk+,N,,D#K",
  "K.........\".\".#...======%kkkkkkkkkkkkkkkkkkkkk#,,,,D#K",
  "K.\"....\"....o\"#...==....%=====================#,,,,D#K",
  "K.............#..\"==....%=====================#,,,,,#K",
  "K..........\"..#...==..==%=====================#######K",
  "K.\"......\"T...########==%=====================%.\".\".#K",
  "K..\".\"...\"\".o.##kkkkk#==%=====================%.....#K",
  "K.......o.\"..\"##kkkkk#==%=====================%\"....#K",
  "K..........T\".##kkkkk#==%=====================%..\"\".#K",
  "K.\"o........\".##kkkkk+==#%%%%%%%%%%#%%%%%%%%%%#.....#K",
  "K.............##kkkkk#==...\"...\"......\".....#########K",
  "Ko.........\"..##kkkkk#==..........\".........#,,,,,,##K",
  "K.............##kkkkk#==........\".........\".#,,,,,M##K",
  "K.............########==.......\"...\"\".......+,,m,,M##K",
  "K\"...\"........#.......==..\"...............\".#,,,,,M##K",
  "K...\"\"......\".#.....\"...\".....\"...\".\".......#,,,,,,##K",
  "K.............#....\"\"........\".............\"#########K",
  "K.\"...........#######################################K",
  "K............KKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKKK",
  "K...........K",
  "K..........KK",
  "KKKKKKKKKKK",
  "",
];
const CT_OBJS: ObjSpawn[] = [
  { kind: "pew", at: [27, 16] },
  { kind: "pew", at: [30, 16] },
  { kind: "pew", at: [33, 16] },
  { kind: "pew", at: [36, 16] },
  { kind: "pew", at: [39, 16] },
  { kind: "pew", at: [27, 18] },
  { kind: "pew", at: [30, 18] },
  { kind: "pew", at: [33, 18] },
  { kind: "pew", at: [36, 18] },
  { kind: "pew", at: [39, 18] },
  { kind: "pew", at: [27, 20] },
  { kind: "pew", at: [30, 20] },
  { kind: "pew", at: [33, 20] },
  { kind: "pew", at: [36, 20] },
  { kind: "pew", at: [39, 20] },
  { kind: "pew", at: [27, 26] },
  { kind: "pew", at: [30, 26] },
  { kind: "pew", at: [33, 26] },
  { kind: "pew", at: [36, 26] },
  { kind: "pew", at: [39, 26] },
  { kind: "pew", at: [27, 28] },
  { kind: "pew", at: [30, 28] },
  { kind: "pew", at: [33, 28] },
  { kind: "pew", at: [36, 28] },
  { kind: "pew", at: [39, 28] },
  { kind: "pew", at: [27, 30] },
  { kind: "pew", at: [30, 30] },
  { kind: "pew", at: [33, 30] },
  { kind: "pew", at: [36, 30] },
  { kind: "pew", at: [39, 30] },
  { kind: "altar", at: [43, 20], name: "altar of the Hymn" },
  { kind: "altar", at: [43, 26], name: "altar of the Hymn" },
  { kind: "crystal", at: [44, 17] },
  { kind: "crystal", at: [44, 29] },
  { kind: "crystal", at: [26, 15] },
  { kind: "crystal", at: [26, 31] },
  { kind: "rug", at: [42, 23], tint: "#6a2a3a" },
  { kind: "lamp", at: [30, 15] },
  { kind: "lamp", at: [40, 15] },
  { kind: "lamp", at: [30, 31] },
  { kind: "lamp", at: [40, 31] },
  { kind: "door", at: [46, 23], id: "ct_domeDoor", name: "door to the dome", locked: 85, key: "ct_domeKey" },
  { kind: "statue", at: [49, 20], name: "statue of a listening man" },
  { kind: "statue", at: [49, 26], name: "statue of a listening man" },
  { kind: "bunk", at: [27, 6], tint: "#b8b0a0" },
  { kind: "bunk", at: [30, 6], tint: "#b8b0a0" },
  { kind: "bunk", at: [33, 6], tint: "#b8b0a0" },
  { kind: "bunk", at: [36, 6], tint: "#b8b0a0" },
  { kind: "bunk", at: [39, 6], tint: "#b8b0a0" },
  { kind: "bunk", at: [42, 6], tint: "#b8b0a0" },
  { kind: "footlocker", at: [28, 11], inv: [{ id: "hypo", n: 1 }, { id: "robe" }] },
  { kind: "footlocker", at: [34, 11], inv: [{ id: "hypo", n: 1 }, { id: "robe" }] },
  { kind: "footlocker", at: [40, 11], inv: [{ id: "hypo", n: 1 }, { id: "robe" }] },
  { kind: "footlocker", at: [31, 11], inv: [{ id: "cell", n: 20 }] },
  { kind: "table", at: [43, 9], tint: "#8a7a60" },
  { kind: "chair", at: [42, 9] },
  { kind: "rug", at: [35, 9], tint: "#5a3a4a" },
  { kind: "desk", at: [17, 30], name: "Cantor's desk", inv: [{ id: "clarity", n: 1 }, { id: "scrip", n: 150 }] },
  { kind: "bookcase", at: [16, 33], name: "hymnals" },
  { kind: "bed", at: [20, 29], tint: "#8a3a4a" },
  { kind: "cabinet", at: [20, 35], name: "Cantor's cabinet", locked: 55, inv: [{ id: "laserRifle" }, { id: "cell", n: 40 }, { id: "superHypo", n: 1 }] },
  { kind: "altar", at: [18, 32], name: "small altar" },
  { kind: "door", at: [44, 36], id: "ct_shedDoor", name: "service shed door", locked: 45 },
  { kind: "manhole", at: [49, 34], name: "service shaft" },
  { kind: "generator", at: [47, 38], name: "relay generator" },
  { kind: "toolbox", at: [45, 34], inv: [{ id: "toolkit" }, { id: "scrapElectronics", n: 2 }] },
  { kind: "crystal", at: [20, 15] },
  { kind: "crystal", at: [21, 18] },
  { kind: "crystal", at: [16, 17] },
  { kind: "crystal", at: [16, 21] },
  { kind: "crystal", at: [21, 26] },
  { kind: "crystal", at: [48, 16] },
  { kind: "crystal", at: [50, 30] },
  { kind: "crystal", at: [38, 36] },
  { kind: "statue", at: [19, 7], name: "statue of the Shepherd, arms open" },
  { kind: "lamp", at: [17, 9] },
  { kind: "lamp", at: [23, 9] },
  { kind: "lamp", at: [17, 13] },
  { kind: "lamp", at: [23, 13] },
  { kind: "lamp", at: [22, 25] },
  { kind: "lamp", at: [22, 21] },
  { kind: "well", at: [30, 37], name: "cistern" },
  { kind: "stall", at: [33, 36], tint: "#6a4a6a", name: "offering table" },
  { kind: "bones", at: [40, 38] },
  { kind: "sign", at: [27, 35], name: "sign", desc: "hand-painted letters: BE STILL AND LISTEN" },
  { kind: "tent", at: [6, 16], tint: "#8a6a4a" },
  { kind: "tent", at: [10, 17], tint: "#6a5a4a" },
  { kind: "campfire", at: [8, 19] },
  { kind: "bedroll", at: [5, 20] },
  { kind: "bag", at: [11, 20], inv: [{ id: "water", n: 2 }, { id: "jerky", n: 2 }] },
  { kind: "sign", at: [12, 8], name: "sign", desc: "a painted board: THE GLASS CATHEDRAL. ALL WHO WOULD BE QUIET ARE WELCOME" },
];
const CT_NPCS: NpcSpawn[] = [
  { proto: "ctAcolyte", at: [20, 23], id: "ct_cantor", name: "Cantor Idris Moll", dialog: "ct_cantor", look: { hair: "#aaa", hairStyle: "bald", skin: "#c8a080" }, team: "choir" },
  { proto: "ctAcolyte", at: [30, 24], name: "Choir Acolyte", dialog: "ct_acolyte", wander: 4, team: "choir" },
  { proto: "ctAcolyte", at: [38, 22], name: "Choir Acolyte", dialog: "ct_acolyte", wander: 4, look: { female: true }, team: "choir" },
  { proto: "ctAcolyte", at: [34, 9], name: "Choir Acolyte", dialog: "ct_acolyte", wander: 3, look: { female: true, skin: "#8a5a38" }, team: "choir" },
  { proto: "ctAcolyteLaser", at: [28, 38], name: "Choir Warden", wander: 3, team: "choir" },
  { proto: "ctAcolyteLaser", at: [44, 22], name: "Choir Warden", team: "choir" },
  { proto: "grafted", at: [45, 25], name: "Grafted Doorward", team: "choir" },
  { proto: "grafted", at: [16, 11], name: "Grafted Doorward", team: "choir" },
  { proto: "graftedGun", at: [40, 35], wander: 3, team: "choir" },
  { proto: "villager", at: [9, 18], id: "ct_pilgrim", name: "Pilgrim Tobiah", dialog: "ct_pilgrim", team: "neutral", look: { hairStyle: "hood", outfit: "#7a6a5a" } },
  { proto: "villagerF", at: [7, 21], name: "Pilgrim", team: "neutral", wander: 2 },
];
const CT_ITEMS: { id: string; n?: number; at: [number, number] }[] = [
];

const CTD_ROWS = [
  "",
  "                    #%%%%%%%%%%%%%%%#",
  "                   %,,,,,,,,,,,,,,,,%",
  "                  %,,,,,,,,,,,,,,,,,%",
  "                 %,,,,,,,,,,,,,,,,,,%",
  "                %,,,,,,,,,,,,,,,,,,,%",
  "               %,,,,,,,,,,,,,,,,,,,,%",
  "              %,,,,,,,,,,,,,,,,,,,,,%",
  "             %,,,,,,,,,,,,,,,,,,,,,,%",
  "            %,,,,,,,,,,,,,,,,,,,,,,,%",
  "           %,,,,,,,,,,,,,,,,,,,,,,,,%",
  "          %,,,,,,,,,kkkkkkk,,,,,,,,,%",
  "         %,,,,,,,,,kkkkkkkk,,,,,,,,,%",
  "        %,,,,,,,,,kkkkkkkkk,,,,,,,,,%",
  "       %,,,,,,,,,kkk____kkk,,,,,,,,,%",
  "##### %,,,,,,,,,kkk_____kkk,,,,,,,,,%",
  "#W__#%,,,,,,,,,kkk______kkk,,,,,,,,,%",
  "#W__+,,N,,,,,,kkk_______kkk,,,,,,,,,#",
  "#W__#,,,,,,,,,kkk______kkk,,,,,,,,,%",
  "#####,,,,,,,,,kkk_____kkk,,,,,,,,,%",
  "    %,,,,,,,,,kkk____kkk,,,,,,,,,%",
  "    %,,,,,,,,,kkkkkkkkk,,,,,,,,,%",
  "    %,,,,,,,,,kkkkkkkk,,,,,,,,,%",
  "    %,,,,,,,,,kkkkkkk,,,,,,,,,%",
  "    %,,,,,,,,,,,,,,,,,,,,,,,,%",
  "    %,,,,,,,,,,,,,,,,,,,,,,,%",
  "    %,,,,,,,,,,,,,,,,,,,,,,%",
  "    %,,,,,,,,,,,,,,,,,,,,,%",
  "    %,,,,,,,,,,,,,,,,,,,,%",
  "    %,,,,,,,,,,,,,,,,,,,%",
  "    %,,,,,,,,,,,,,,,,,,%",
  "    %,,,,,,,,,,,,,,,m,%",
  "    %,,,,,,,,,,,,,,,,%",
  "    #%%%%%%%%%%%%%%%+",
  "                   SSS",
];
const CTD_OBJS: ObjSpawn[] = [
  { kind: "console", at: [20, 16], name: "transmitter housing" },
  { kind: "console", at: [21, 16], name: "transmitter housing" },
  { kind: "console", at: [19, 18], name: "transmitter housing" },
  { kind: "console", at: [20, 18], name: "transmitter housing" },
  { kind: "terminal", at: [23, 17], id: "ct_transmitter", name: "Hymn modulator", onUse: "ct_transmitter" },
  { kind: "pipe", at: [22, 14] },
  { kind: "pipe", at: [18, 20] },
  { kind: "pipe", at: [17, 16] },
  { kind: "pipe", at: [23, 19] },
  { kind: "generator", at: [24, 14], name: "carrier generator" },
  { kind: "generator", at: [16, 20], name: "carrier generator" },
  { kind: "crystal", at: [20, 7] },
  { kind: "crystal", at: [25, 7] },
  { kind: "crystal", at: [30, 7] },
  { kind: "crystal", at: [17, 10] },
  { kind: "crystal", at: [30, 12] },
  { kind: "crystal", at: [12, 15] },
  { kind: "crystal", at: [30, 17] },
  { kind: "crystal", at: [10, 20] },
  { kind: "crystal", at: [25, 22] },
  { kind: "crystal", at: [10, 25] },
  { kind: "crystal", at: [11, 27] },
  { kind: "crystal", at: [16, 27] },
  { kind: "lamp", at: [20, 5] },
  { kind: "lamp", at: [32, 5] },
  { kind: "lamp", at: [8, 29] },
  { kind: "lamp", at: [20, 29] },
  { kind: "lamp", at: [32, 17] },
  { kind: "lamp", at: [8, 17] },
  { kind: "pew", at: [12, 17] },
  { kind: "pew", at: [12, 19] },
  { kind: "pew", at: [27, 15] },
  { kind: "pew", at: [27, 17] },
  { kind: "altar", at: [20, 9], name: "lectern of the Hymn" },
  { kind: "altar", at: [20, 25], name: "lectern of the Hymn" },
  { kind: "bookcase", at: [10, 12], name: "score shelves" },
  { kind: "cabinet", at: [30, 22], inv: [{ id: "fusion", n: 20 }, { id: "superHypo", n: 2 }] },
  { kind: "bed", at: [29, 9], tint: "#6a2a2a", name: "Ashgrave's cot" },
  { kind: "footlocker", at: [28, 9], name: "Ashgrave's footlocker", inv: [{ id: "ct_badge" }, { id: "combatArmor" }] },
];
const CTD_NPCS: NpcSpawn[] = [
  { proto: "ctShepherd", at: [20, 17], id: "ct_shepherd", name: "the Shepherd", dialog: "ct_shepherd", team: "choir" },
  { proto: "ctAshgrave", at: [23, 15], id: "ct_ashgrave", name: "Ashgrave", dialog: "ct_ashgrave", team: "choir" },
  { proto: "grafted", at: [8, 15], id: "ct_domeGuard0", name: "Grafted Doorward", team: "choir" },
  { proto: "grafted", at: [8, 19], id: "ct_domeGuard1", name: "Grafted Doorward", team: "choir" },
  { proto: "graftedGun", at: [26, 24], id: "ct_domeGuard2", name: "Grafted Doorward", team: "choir" },
  { proto: "ctAcolyteLaser", at: [14, 12], id: "ct_domeAcolyte0", name: "Choir Warden", team: "choir" },
  { proto: "ctAcolyte", at: [15, 23], id: "ct_domeAcolyte1", name: "Choir Acolyte", dialog: "ct_acolyte", team: "choir" },
];
const CTD_ITEMS: { id: string; n?: number; at: [number, number] }[] = [
];
// END GENERATED

defineMap({
  id: 'cathedral',
  name: 'Glass Cathedral',
  area: 'cathedral',
  outdoor: true,
  floor: 'dirt',
  floor2: 'tile',
  wall: 'concrete',
  wall2: 'glass',
  music: 'wind',
  legend: {
    K: { wall: 'cliff' },
    k: { floor: 'carpet' },
    D: { floor: 'tile', exit: 'dome' },
    M: { floor: 'metal', exit: 'maint' },
    N: { floor: 'tile', marker: 'N' },
    m: { floor: 'metal', marker: 'm' },
    E: { floor: 'dirt', marker: 'E' },
  },
  rows: CT_ROWS,
  entrances: { default: 'E', fromDome: 'N', fromMaint: 'm' },
  exits: { out: { to: 'world' }, dome: { to: 'cathedral_dome', entrance: 'default' }, maint: { to: 'cathedral_dome', entrance: 'fromMaint' } },
  objects: CT_OBJS,
  npcs: CT_NPCS,
  items: CT_ITEMS,
  onEnter: (c: Ctx, first: boolean) => {
    if (c.questState('shepherd') === 'none') c.quest('shepherd', 'The Glass Cathedral stands on the southern cliffs. The one who commands the Grafted is inside, under the dome.');
    if (first) c.msg('The Glass Cathedral rises from the cliff top: a hall of old glass panes and a great cracked dome, glittering in the sea wind. Somewhere inside, many voices are humming one note.');
    if (c.flag('ct_shepherdDead') && !c.flag('ct_choirScattered')) {
      c.set('ct_choirScattered');
      scatterChoir(c);
    }
    syncChoir(c);
  },
});

defineMap({
  id: 'cathedral_dome',
  name: 'The Dome',
  area: 'cathedral',
  floor: 'tile',
  floor2: 'tile',
  wall: 'concrete',
  wall2: 'glass',
  dark: 0.1,
  music: 'shelter',
  legend: {
    k: { floor: 'carpet' },
    W: { floor: 'metal', exit: 'nave' },
    S: { floor: 'metal', exit: 'maint' },
    N: { floor: 'tile', marker: 'N' },
    m: { floor: 'metal', marker: 'm' },
  },
  rows: CTD_ROWS,
  entrances: { default: 'N', fromMaint: 'm' },
  exits: { nave: { to: 'cathedral', entrance: 'fromDome' }, maint: { to: 'cathedral', entrance: 'fromMaint' } },
  objects: CTD_OBJS,
  npcs: CTD_NPCS,
  items: CTD_ITEMS,
  onEnter: (c: Ctx, first: boolean) => {
    if (first) {
      c.msg('The dome. Sea light falls through a thousand cracked panes onto a floor of pale tile. At the centre, under a lens as wide as a pond, something enormous sits among the machines, and hums.');
      c.quest('shepherd', 'You have reached the dome. The Shepherd is wired into the transmitter at its centre; his lieutenant Ashgrave stands beside him.');
    }
    syncChoir(c);
  },
});

// --------------------------------------------------------------------- object scripts

defineObjScripts({
  ct_transmitter: (c) => {
    c.sound('terminal');
    c.startDialog('ct_transmitter');
    return true;
  },
});

// --------------------------------------------------------------------- dialogue

defineDialogues([
  // ---------------------------------------------------------------- the Cantor
  {
    id: 'ct_cantor',
    start: (c) => (c.stat('INT') <= 3 && !c.flag('ct_metCantor') ? 'dumb' : c.flag('ct_metCantor') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('ct_metCantor'),
        text: 'A lean man in a pale robe turns from the lamp he is trimming. His gloves are grey, his voice soft and very even: the voice of someone who has practised never being startled.\n\n"Welcome to the Cathedral, pilgrim. Be still, and listen." He tilts his head. "Ah. You have the look of the deep places. Too pale, and you stand too straight, like someone raised under a low ceiling. You\'re from a shelter." Something eager crosses his face and is smoothed away. "He has been waiting for one of you for a long time."',
        options: [
          { text: 'Who has?', to: 'shepherd' },
          { text: 'What is this place?', to: 'place' },
          { text: 'What is the Hymn?', to: 'hymn' },
          { text: 'I would like to see the Shepherd.', to: 'audience' },
          { text: '[Speech] Do you know what happens at Fort Kessler?', if: (c) => !c.flag('ct_cantorDoubtFail'), skill: { key: 'speech', diff: 40 }, to: 'doubt', fail: 'doubtFail' },
          { text: 'Goodbye.', end: true },
        ],
      },
      again: {
        text: (c) => (c.flag('ct_audience') ? '"The door to the dome is open to you, pilgrim. He is waiting."' : '"Be still, pilgrim. Have you come to listen?"'),
        options: [
          { text: 'Tell me about the Shepherd.', to: 'shepherd' },
          { text: 'What is the Hymn?', to: 'hymn' },
          { text: 'I would like to see the Shepherd.', if: (c) => !c.flag('ct_audience'), to: 'audience' },
          { text: '[Speech] Do you know what happens at Fort Kessler?', if: (c) => !c.flag('ct_cantorDoubt') && !c.flag('ct_cantorDoubtFail'), skill: { key: 'speech', diff: 40 }, to: 'doubt', fail: 'doubtFail' },
          { text: 'Goodbye.', end: true },
        ],
      },
      shepherd: {
        text: '"The Shepherd was a man of the old world, a scientist. When the world ended, he stayed with the ones he had made, because no one else would. When his body began to fail, he gave it to the transmitter, so the Hymn would never stop." The Cantor\'s gloved hands fold. "He keeps the Grafted, who would otherwise be lost. And he keeps us, who were lost in a different way."',
        options: [
          { text: 'Lost how?', to: 'lost' },
          { text: 'I would like to see him.', if: (c) => !c.flag('ct_audience'), to: 'audience' },
          { text: 'I see.', to: 'again' },
        ],
      },
      lost: {
        text: '"Everyone out there is shouting, pilgrim. About water, about scrip, about whose grandfather shot whose. I was a tax collector in Rustwater. I was very good at it and I hated every hour." He smiles faintly. "Here, nobody shouts. That is worth a great deal."',
        options: [{ text: 'I suppose it is.', to: 'again' }],
      },
      place: {
        text: '"Harrow Point Observatory. Before the war they used the great lens to listen to the stars. The stars had nothing to say. Now we listen to him instead." He gestures at the glass hall. "The Choir keeps the lamps, the glass and the Doorwards. The Shepherd keeps the song."',
        options: [{ text: 'I see.', to: 'again' }],
      },
      hymn: {
        text: '"You can\'t hear it. We can\'t, not with our ears. The Grafted can: it lives in their collars. But sit in the nave long enough and you\'ll feel it in your teeth. A kind of..." he searches for the word, "...agreement. As though the whole world had finally stopped arguing with itself."',
        options: [{ text: 'Sounds peaceful. And a little horrible.', to: 'again' }],
      },
      audience: {
        onEnter: (c) => grantAudience(c),
        text: '"Of course. Of course." He takes a long brass key from his sleeve and walks you through the nave, past the pews and the humming acolytes, to the east door. He unlocks it with a small, reverent twist. "The Doorwards will let you pass. Go gently. He tires easily, these days, and he has so much to say."\n\nHe does not ask you your name. You notice that only later.',
        options: [{ text: 'Thank you, Cantor.', end: true }],
      },
      doubt: {
        onEnter: (c) => c.set('ct_cantorDoubt'),
        text: '"Kessler." He says it the way people name a sickness. "The Shepherd says the vats are a threshold. That the Grafted are happier, afterwards. That they no longer suffer." He looks down at his gloves. "I have never been to Kessler. I have never asked to go."',
        options: [
          { text: '[Speech] Then ask yourself why you never asked.', skill: { key: 'speech', diff: 30 }, to: 'turned', fail: 'doubtFail' },
          { text: 'Never mind.', to: 'again' },
        ],
      },
      turned: {
        onEnter: (c) => {
          c.set('ct_cantorTurned');
          grantAudience(c);
          c.karma(15);
        },
        text: 'He is quiet for a long while. Around you the acolytes hum their one note.\n\n"If you are right," he says at last, "then I have spent eleven years singing lullabies in a slaughterhouse." He unlocks the dome door himself and presses the key into the lock so it stays. "Whatever you mean to do in there, I will not stand in your way. The Doorwards will obey my word. And afterwards... someone will have to tell the Choir. I suppose it had better be me."',
        options: [{ text: 'Thank you, Cantor.', end: true }],
      },
      doubtFail: {
        onEnter: (c) => c.set('ct_cantorDoubtFail'),
        text: '"Pilgrim, many people come here with stories." The eagerness has gone out of his face, and something harder has replaced it. "Some of them are even true. Be still, and listen."',
        options: [{ text: 'Fine.', to: 'again' }],
      },
      dumb: {
        onEnter: (c) => {
          c.set('ct_metCantor');
          grantAudience(c);
        },
        text: 'A man in a pale robe turns to greet you, and stops. His eyes go wide, then soft with something like delight.\n\n"Oh. Oh, what a quiet mind you have. Not a single note in there." He takes your hand in his gloved one. "He will want to meet you. He will want that very much. Come, come, the door is this way."',
        options: [{ text: 'Me meet shiny man!', lowInt: true, end: true }, { text: 'Okay.', end: true }],
      },
    },
  },

  // ---------------------------------------------------------------- the Choir and pilgrims
  {
    id: 'ct_acolyte',
    start: (c) => (c.flag('ct_hymnSilenced') ? 'silent' : 'hello'),
    nodes: {
      hello: {
        text: (c) => ['The acolyte smiles without opening her eyes. "Can you hear it? No? You will. Everyone does, in the end."', '"Be still, pilgrim." The acolyte goes back to humming a single note, over and over.', '"I used to have such terrible dreams," the acolyte confides. "Now I don\'t dream at all. Isn\'t it wonderful?"', '"The Shepherd sees few. If the Cantor says you may go in, you may go in. Otherwise the Doorwards will... discourage you."'][c.random(4)],
        options: [{ text: 'Right.', end: true }, { text: 'Hmm.', lowInt: true, end: true }],
      },
      silent: {
        text: 'The acolyte stares at nothing, mouth open, as if listening very hard for something that is no longer there.',
        options: [{ text: 'Leave them be.', end: true }],
      },
    },
  },
  {
    id: 'ct_pilgrim',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A pilgrim in a dusty hood warms his hands at the fire. "Tobiah. From Cinder Creek, a long time ago." He nods at the glass hall. "I came to stop hearing myself think. My thoughts are poor company. The Choir haven\'t let me in yet. They say I am too loud inside."',
        options: [
          { text: 'Seen anything strange around here?', to: 'shed' },
          { text: '[Speech] You should go home, Tobiah. This place eats people.', if: (c) => !c.flag('ct_tobiahLeft'), skill: { key: 'speech', diff: 20 }, to: 'home', fail: 'stay' },
          { text: 'You loud? Me quiet!', lowInt: true, to: 'shed' },
          { text: 'Good luck.', end: true },
        ],
      },
      shed: {
        onEnter: (c) => c.set('ct_knowsShed'),
        text: '"Strange? The Choir\'s tinkers go in and out of that shed on the cliff edge, the south-east corner, and never once through the nave. There\'s a ladder in there; I\'ve seen it through the door. Goes down, then under." He shrugs. "Under the dome, I\'d guess. Lock\'s an old one."',
        options: [{ text: 'Thanks, Tobiah.', end: true }],
      },
      home: {
        onEnter: (c) => {
          c.set('ct_tobiahLeft');
          c.karma(10);
        },
        text: 'He looks at the glass hall for a long time. "Eats people." He laughs, not happily. "Yes. I suppose I knew that." He starts rolling up his bedroll. "Cinder Creek it is. My sister will be surprised. Probably not pleased. But surprised."',
        options: [{ text: 'Safe travels.', end: true }],
      },
      stay: {
        text: '"Everyone has somewhere to go home to, friend. Some of us have gone home already, and found it wasn\'t there." He stays by the fire.',
        options: [{ text: 'Suit yourself.', end: true }],
      },
    },
  },

  // ---------------------------------------------------------------- the Shepherd
  {
    id: 'ct_shepherd',
    portrait: { bg: '#1a2430' },
    start: (c) => (c.stat('INT') <= 3 ? 'dumb' : c.flag('ct_metShepherd') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('ct_metShepherd'),
        text: 'At the heart of the dome, under a lens the size of a pond, sits what is left of Aurelio Vance. He is enormous the way a tree root is enormous: grown, not built. Cables run from his spine into the transmitter housings around him, and his skin has the grey sheen of old Bloom tissue. His eyes are clouded and very kind.\n\n"A clean one. Come closer, my eyes are not what they were." The voice comes from him and from the machines at once, a chord instead of a note. "Eighty-six years under a hill, and not one song in your head. Do you know how rare you are?"',
        options: [
          { text: 'Who are you?', to: 'who' },
          { text: 'What is the Hymn?', to: 'hymn' },
          { text: 'Why do you want people from the shelters?', to: 'clean' },
          { text: '[Science] That transmitter is older than both of us. How do you keep the carrier stable?', if: (c) => !c.flag('ct_knowsCarrier'), skill: { key: 'science', diff: 30 }, to: 'carrier', fail: 'carrierFail' },
          { text: '[Speech] Tell me about Ashgrave.', if: (c) => !c.flag('ct_knowsRetune'), skill: { key: 'speech', diff: 35 }, to: 'retune', fail: 'ashFail' },
          { text: 'I destroyed your vats at Kessler.', if: (c) => c.flag('kf_vatsDestroyed'), to: 'vatsGone' },
          { text: 'This ends now, Vance.', to: 'fight' },
          { text: 'I need to think.', end: true },
        ],
      },
      again: {
        text: '"You came back." The chord of his voice warms. "Sit. Everyone sits, eventually."',
        options: [
          { text: 'What is the Hymn, really?', to: 'hymn' },
          { text: 'Why the shelters?', to: 'clean' },
          { text: '[Science] How do you keep the carrier stable?', if: (c) => !c.flag('ct_knowsCarrier') && !c.flag('ct_carrierFail'), skill: { key: 'science', diff: 30 }, to: 'carrier', fail: 'carrierFail' },
          { text: '[Speech] Tell me about Ashgrave.', if: (c) => !c.flag('ct_knowsRetune') && !c.flag('ct_ashFail'), skill: { key: 'speech', diff: 35 }, to: 'retune', fail: 'ashFail' },
          { text: 'I destroyed your vats at Kessler.', if: (c) => c.flag('kf_vatsDestroyed') && !c.flag('ct_toldVats'), to: 'vatsGone' },
          { text: 'This ends now, Vance.', to: 'fight' },
          { text: 'Goodbye.', end: true },
        ],
      },
      who: {
        text: '"Vance. Aurelio Vance. Director of the morphogenic program at Fort Kessler, back when there were directors of things." A cable at his temple twitches. "We were asked to make a soldier who could walk through fallout. We did. The committee didn\'t like how quiet they were. Then the committee was vaporised, which settled the argument. My subjects waited in their vats for someone to tell them what to do. So I told them. I have been telling them ever since."',
        options: [
          { text: 'And you wired yourself into this machine.', to: 'wired' },
          { text: 'What is the Hymn?', to: 'hymn' },
        ],
      },
      wired: {
        text: '"My heart was failing. The Bloom would have mended it, and taken my mind for the price, and then who would sing to them? So I made the transmitter my mind instead. It thinks slowly, but it never tires." He smiles, and several machines hum along. "I am not the singer, you understand. I am only the throat the song passes through."',
        options: [{ text: 'Go on.', to: 'again' }],
      },
      hymn: {
        text: '"Every catastrophe in history was a disagreement. Two men, one well. Two nations, one sky. Eighty-six years ago the disagreement got so loud the sky caught fire." The clouded eyes find you. "The Hymn is the end of disagreement. One chord. Each of them is a note in it, and none of them is ever alone, or afraid, or wrong. I don\'t make them obey, whatever the Keepers tell you. I make them *agree*."',
        options: [
          { text: 'Agreement without choice is just obedience with better manners.', to: 'manners' },
          { text: 'Go on.', to: 'again' },
        ],
      },
      manners: {
        text: '"Ha!" The laugh rattles the lens above. "Yes. Good. You should have been on my committee. They never managed a line like that." He sobers. "And what has choice given the Basin? Raiders. Slavers. Thirst. Show me one thing your free choices built out there that is better than a quiet mind, and I will switch myself off."',
        options: [{ text: 'I\'ll think of something.', to: 'again' }],
      },
      clean: {
        text: '"The Bloom takes most cleanly in people who have never been sung to. Out here everyone is full of noise: fear, hunger, old grudges. It fights the Bloom and it wastes it. You in your hills have been... resting. A clean string holds a tune." He sighs happily. "Shelter 7 gave me forty-one fine voices. Your shelter will be the finest choir the world has ever heard."',
        options: [
          { text: 'Over my dead body.', to: 'deadBody' },
          { text: 'I see.', to: 'again' },
        ],
      },
      deadBody: {
        text: '"That is certainly one of the options," he agrees gently. "Not my favourite."',
        options: [{ text: 'Back to business.', to: 'again' }],
      },
      carrier: {
        onEnter: (c) => c.set('ct_knowsCarrier'),
        text: 'His face lights up like a teacher\'s. "Oh, a *technical* question! It\'s the modulator: pre-war, phase-locked, temperamental as a cat. Drifts a hair and every collar in the Basin gets a headache. I nudge it back a thousand times a day." He chuckles. "If some vandal reversed its phase, the carrier would cancel itself. Dead air. Not a sound." A pause. "Now why did I tell you that?"',
        options: [{ text: 'Because nobody else asks you anything.', to: 'again' }],
      },
      carrierFail: {
        onEnter: (c) => c.set('ct_carrierFail'),
        text: '"Carefully," he says, and smiles, and that is all he says about it.',
        options: [{ text: 'Right.', to: 'again' }],
      },
      retune: {
        onEnter: (c) => c.set('ct_knowsRetune'),
        text: '"Ashgrave. My right hand. My best note." Fondness, and something under it. "But he remembers too much. A road. A rifle. Oxen. He doesn\'t argue with me, not yet, but I can hear him *considering* it, the way you hear weather coming." He sighs. "Next season I\'ll retune him. Turn the Hymn up until the old life is too faint to trouble him. He\'ll be happier. They always are."',
        options: [{ text: 'Does he know that?', to: 'retune2' }],
      },
      retune2: {
        text: '"Of course not. What a cruel thing that would be, to tell him."',
        options: [{ text: 'Of course.', to: 'again' }],
      },
      ashFail: {
        onEnter: (c) => c.set('ct_ashFail'),
        text: '"Ashgrave is Ashgrave," he says. "Ask him yourself, if you like. He\'s standing right there."',
        options: [{ text: 'Right.', to: 'again' }],
      },
      vatsGone: {
        onEnter: (c) => c.set('ct_toldVats'),
        text: 'For a long moment the only sound is the dome humming. When he speaks again, the chord of his voice has gone thin.\n\n"Then the choir I have is the only choir there will ever be. It will get quieter every year, until one day it is only me, singing to an empty hall." He turns his clouded eyes toward the lens. "How cruel of you. I do hope you\'re pleased."',
        options: [{ text: 'I am.', to: 'again' }, { text: 'It had to be done.', to: 'again' }],
      },
      fight: {
        text: '"Ah." He does not sound surprised, only tired. Around the dome, the Doorwards turn toward you as one. "Well. Somebody always wants to end the song. Come on, then, clean one. Let\'s disagree."',
        options: [
          { text: '[Attack]', combat: true, do: (c) => c.set('ct_alarm') },
          { text: 'On second thought...', to: 'again' },
        ],
      },
      dumb: {
        onEnter: (c) => c.set('ct_metShepherd'),
        text: 'Something huge and grey sits among the machines, with wires coming out of its back. Its cloudy eyes find you, and it goes very still.\n\n"Oh," it says, in a voice like a lot of people humming. "Oh, listen to that. Nothing. You\'re so *quiet* in there." It sounds almost jealous.',
        options: [
          { text: 'Your song make head hurt. Stop song?', lowInt: true, to: 'dumb2' },
          { text: 'You big. Why wires?', lowInt: true, to: 'dumb3' },
          { text: 'Me hit you now.', lowInt: true, to: 'fight' },
          { text: 'Bye.', end: true },
        ],
      },
      dumb2: {
        onEnter: (c) => c.set('ct_lowIntHint'),
        text: '"Mine too, sometimes." He sighs, and the machines sigh with him. "It all goes out through the red cable, you see, there, by the little screen with the green light. If someone pulled it..." A laugh like a bellows. "But no one would. Who would pull a cable they didn\'t understand?"',
        options: [{ text: 'Hmm.', lowInt: true, end: true }, { text: 'Bye.', end: true }],
      },
      dumb3: {
        text: '"So I never have to stop singing." He says it the way you might tell a child a bedtime story. "You would make a lovely note, you know. A nice deep one. Very simple." He seems to think about it. "No. No, I think you would just be... furniture. Run along, quiet one."',
        options: [{ text: 'Song make head hurt. Stop song?', lowInt: true, to: 'dumb2' }, { text: 'Bye.', end: true }],
      },
    },
  },

  // ---------------------------------------------------------------- Ashgrave
  {
    id: 'ct_ashgrave',
    start: (c) => {
      if (c.partyHas('ct_ashgrave')) return c.flag('ct_shepherdDead') ? 'farewell' : 'ally';
      if (c.flag('ct_shepherdDead')) return 'after';
      if (c.stat('INT') <= 3) return 'dumb';
      return c.flag('ct_metAshgrave') ? 'again' : 'hello';
    },
    nodes: {
      hello: {
        onEnter: (c) => c.set('ct_metAshgrave'),
        text: 'The Grafted beside the throne is taller than the rest, and his collar has been polished until it shines. Pinned to the leather strap across his chest is a tin badge, green with age. He rests both hands on the haft of a demolition hammer.\n\n"Pilgrim. Stand where I can see your hands, and we will get along."',
        options: [
          { text: 'Who are you?', to: 'who' },
          { text: 'What\'s the badge?', to: 'badge' },
          { text: 'Do you know what happens at Fort Kessler?', to: 'kessler' },
          { text: '[Speech] He is going to retune you. Erase whatever you still remember.', if: (c) => hasEvidence(c) && !c.flag('ct_ashRefused'), skill: { key: 'speech', diff: 10 }, to: 'turn', fail: 'refuse' },
          { text: '[Speech] You don\'t belong to him. You never did.', if: (c) => !hasEvidence(c) && !c.flag('ct_ashRefused'), skill: { key: 'speech', diff: 60 }, to: 'turn', fail: 'refuse' },
          { text: 'Goodbye.', end: true },
        ],
      },
      again: {
        text: '"Pilgrim." Ashgrave inclines his great head a fraction.',
        options: [
          { text: 'Who were you, before?', to: 'who' },
          { text: 'Do you know what happens at Fort Kessler?', to: 'kessler' },
          { text: 'Here. Your intake record, from Kessler. Read the director\'s note.', if: (c) => c.has('kf_intakeFile'), to: 'evidence' },
          { text: '[Speech] He is going to retune you. Erase whatever you still remember.', if: (c) => hasEvidence(c) && !c.flag('ct_ashRefused'), skill: { key: 'speech', diff: 10 }, to: 'turn', fail: 'refuse' },
          { text: '[Speech] You don\'t belong to him. You never did.', if: (c) => !hasEvidence(c) && !c.flag('ct_ashRefused'), skill: { key: 'speech', diff: 60 }, to: 'turn', fail: 'refuse' },
          { text: 'Goodbye.', end: true },
        ],
      },
      who: {
        text: '"Ashgrave." A pause. "Before that... Garran Ash, I think. I rode guard for Longhaul Caravans. I remember the weight of a rifle, and the smell of oxen in the rain, and a woman who laughed at my jokes. Not her face." His hands tighten on the hammer. "The Hymn gave me back a reason to stand up in the morning. That is not nothing."',
        options: [{ text: 'It isn\'t. But it isn\'t yours, either.', to: 'again' }, { text: 'I see.', to: 'again' }],
      },
      badge: {
        text: '"Longhaul. The guard\'s badge." He touches it with one fingertip, very carefully, as if it might break. "I keep it polished. The Director says that is sentiment, and that sentiment passes. It hasn\'t yet."',
        options: [{ text: 'Maybe it won\'t.', to: 'again' }],
      },
      kessler: {
        text: '"The vats." His jaw works. "The Director says it is a threshold. That on the other side is peace. I went through it. I remember the peace." A long pause. "I also remember screaming. He says that part is not important."',
        options: [{ text: 'He\'s lying to you.', to: 'again' }],
      },
      evidence: {
        onEnter: (c) => c.set('ct_ashSawFile'),
        text: 'Ashgrave takes the holotape and slots it into a reader on his gauntlet. His lips move as he reads. You see the moment he reaches the last line: *He is beginning to remember. Retune at next cycle.*\n\nHe reads it again. Then a third time. Behind him, the Shepherd hums contentedly, eyes half closed.',
        options: [
          { text: '[Speech] He means to take the rest of you, Garran. The road, the rifle, the laughing woman. All of it.', skill: { key: 'speech', diff: 0 }, to: 'turn', fail: 'refuse' },
          { text: 'Let him think about it.', to: 'again' },
        ],
      },
      turn: {
        text: 'Ashgrave looks at the throne for a long time. The Shepherd\'s clouded eyes open, as though he has heard a wrong note.\n\n"Director," Ashgrave says. He unslings the hammer. "I would like my name back."\n\nThe dome goes very, very quiet.',
        options: [{ text: 'Together, then.', do: (c) => turnAshgrave(c), end: true }],
      },
      refuse: {
        onEnter: (c) => c.set('ct_ashRefused'),
        text: '"Enough." He does not raise his voice. He does not need to. "I have heard every argument the Keepers ever sent. I serve the Hymn, pilgrim. Speak to the Director, or leave."',
        options: [{ text: 'Fine.', end: true }],
      },
      dumb: {
        onEnter: (c) => c.set('ct_metAshgrave'),
        text: 'A very big grey man with a shiny collar and a big hammer looks down at you. "Pilgrim. Stand where I can see your hands."\n\nYou show him your hands. Both of them. He seems unsure what to do about this.',
        options: [
          { text: 'Me found paper. Your face. Man say fix your head. Bad fix!', lowInt: true, if: (c) => hasEvidence(c), to: 'dumbTurn' },
          { text: 'You big. Nice hammer.', lowInt: true, to: 'dumbHammer' },
          { text: 'Bye.', end: true },
        ],
      },
      dumbHammer: {
        text: '"...Thank you." He looks at the hammer as though seeing it for the first time. "It was a gift. I think. I don\'t remember."',
        options: [{ text: 'Bye.', end: true }],
      },
      dumbTurn: {
        text: 'You hold up the tape and point at it, then at his head, then at the big grey man in the wires, and make a face that means *bad*.\n\nAshgrave takes the tape. Reads it. Reads it again. Something in his face comes loose.\n\n"Out of the mouths of..." He stops. "No. Out of anyone\'s mouth, it would be true." He unslings the hammer and turns toward the throne. "Director. I would like my name back."',
        options: [{ text: 'Hit him!', lowInt: true, do: (c) => turnAshgrave(c), end: true }, { text: 'Together.', do: (c) => turnAshgrave(c), end: true }],
      },
      ally: {
        text: '"Stay close. His Hymn is loud in here, and I have spent a long time doing as it says."',
        options: [{ text: 'Let\'s finish it.', end: true }],
      },
      farewell: {
        text: (c) => `Ashgrave stands over what is left of the Director, breathing hard. The badge on his chest catches the sea light.\n\n"Garran Ash," he says, trying it out. "It fits worse than I hoped. Better than I feared." He looks at you. "${c.flag('ct_hymnSilenced') ? 'The Hymn is gone. The others will wake slowly, and badly. Someone they trust should be there when they do.' : 'The others still hear the last of his song. Someone should lead them somewhere it can\'t reach.'} I will take them north, away from people, before someone decides the simplest thing is to shoot us all."`,
        options: [
          { text: 'Go well, Garran.', do: (c) => ashgraveLeaves(c), end: true },
          { text: 'Take care of them.', lowInt: true, do: (c) => ashgraveLeaves(c), end: true },
        ],
      },
      after: {
        text: (c) => (c.flag('ct_hymnSilenced')
          ? 'Ashgrave sits on the floor beside the dead machines, turning the tin badge over and over in his fingers. "It\'s so quiet," he says. "I had forgotten what my own thoughts sounded like. They are not very good company." He looks up. "I will take the others north, when they can walk. Leave us be."'
          : 'Ashgrave stands over the Director\'s body with his hammer hanging from one hand. "You killed him." He does not seem to know whether he is angry. "The song is still going. One note, over and over. It will drive the others mad." He turns away. "Go, pilgrim. Before I decide what I think of you."'),
        options: [
          { text: 'Go north, Garran. Take them away from people.', do: (c) => ashgraveLeaves(c), end: true },
          { text: 'I\'m going.', end: true },
        ],
      },
    },
  },

  // ---------------------------------------------------------------- the transmitter
  {
    id: 'ct_transmitter',
    name: 'Hymn Modulator',
    portrait: { body: 'robot', skin: '#6a7a8a', bg: '#101820' },
    start: (c) => (c.flag('ct_hymnSilenced') ? 'dead' : 'main'),
    nodes: {
      main: {
        text: (c) => `A waist-high cabinet of pre-war electronics, tied into the transmitter by a trunk of cables. A thick red one runs from its back straight into the housings around the throne. A small green screen shows a waveform, rolling steadily: the Hymn.${c.flag('ct_shepherdDead') ? '\n\nThe waveform has flattened into one endless, unchanging note.' : ''}`,
        options: [
          { text: '[Science] Reverse the modulator\'s phase and cancel the carrier.', if: (c) => !!c.flag('ct_knowsCarrier'), skill: { key: 'science', diff: 15 }, to: 'silence', fail: 'fail' },
          { text: '[Science] Work out how the modulator drives the carrier, and kill it.', if: (c) => !c.flag('ct_knowsCarrier'), skill: { key: 'science', diff: 45 }, to: 'silence', fail: 'fail' },
          { text: '[Repair] Tear out the modulator boards.', skill: { key: 'repair', diff: 50 }, to: 'silenceRepair', fail: 'fail' },
          { text: 'Pull red cable.', lowInt: true, if: (c) => !!c.flag('ct_lowIntHint'), to: 'cable' },
          { text: 'Poke wires.', lowInt: true, if: (c) => !c.flag('ct_lowIntHint'), to: 'zap' },
          { text: 'Leave it.', end: true },
        ],
      },
      silence: {
        onEnter: (c) => doSilence(c, 'science'),
        text: 'You find the phase lock, walk it back one careful step at a time, and then flip it. On the little screen the waveform folds in on itself and cancels out, peak into trough, until there is only a flat green line.\n\nThe hum you had stopped noticing is gone. The dome is suddenly, enormously silent.',
        options: [{ text: 'Done.', end: true }],
      },
      silenceRepair: {
        onEnter: (c) => doSilence(c, 'repair'),
        text: 'You pry off the cover and start pulling boards. Sparks, a smell of hot dust, one board that fights like a live thing. The waveform on the screen stutters, shrinks, and dies.\n\nThe dome is suddenly, enormously silent.',
        options: [{ text: 'Done.', end: true }],
      },
      cable: {
        onEnter: (c) => {
          c.set('ct_lowIntSilence');
          doSilence(c, 'cable');
        },
        text: 'You take hold of the big red cable with both hands, plant your feet, and pull. It does not want to come. You pull harder. It comes out all at once with a bang and a shower of blue sparks, and you sit down very hard on the floor.\n\nIt is quiet. Very quiet. You like it.',
        options: [{ text: 'Heh. Quiet.', lowInt: true, end: true }, { text: 'Done.', end: true }],
      },
      zap: {
        onEnter: (c) => {
          c.hurt(6);
          c.sound('hit');
        },
        text: 'You poke a wire. The wire pokes back. (6 damage.) There are too many wires, and they are all the same colour except the big red one.',
        options: [{ text: 'Ow.', lowInt: true, end: true }, { text: 'Ow.', end: true }],
      },
      fail: {
        onEnter: (c) => {
          const s = c.npc('ct_shepherd');
          if (s && !s.dead) {
            c.set('ct_alarm');
            c.hostile('ct_shepherd');
          } else c.hurt(5);
        },
        text: (c) => (c.npc('ct_shepherd') && !c.npc('ct_shepherd')!.dead
          ? 'The waveform jumps. Every Grafted in the dome flinches at once, and the Shepherd\'s head turns toward you with a slow grinding of cables. "Now that," he says, "was rude."'
          : 'Something arcs across the boards and bites your fingers (5 damage). The waveform rolls on, unbothered.'),
        options: [{ text: 'Uh oh.', end: true }],
      },
      dead: {
        text: 'The little screen shows a flat green line. Nothing is broadcasting. Nothing will again.',
        options: [{ text: 'Good.', end: true }],
      },
    },
  },
]);

// --------------------------------------------------------------------- death scripts

defineDeathScripts({
  ct_shepherd: (c) => {
    c.set('ct_shepherdDead');
    if (!c.flag('ct_silencing')) c.set('ct_shepherdKilled');
    const how = c.flag('ct_hymnSilenced')
      ? 'You silenced the Hymn, and the Shepherd died with it.'
      : c.flag('ct_ashgraveTurned')
        ? 'Ashgrave turned on the Shepherd, and together you ended him. The transmitter still whines out one last note.'
        : 'You killed the Shepherd. The transmitter still whines out one last, unchanging note; silencing it would free the Grafted completely.';
    c.questDone('shepherd', how);
    if (c.partyHas('ct_ashgrave')) setTimeout(() => c.bark('ct_ashgrave', 'It\'s done. It\'s done, Director.'), 400);
    endgameCheck(c);
  },
  ct_ashgrave: (c) => c.set('ct_ashgraveDead'),
  ct_cantor: (c) => c.set('ct_cantorDead'),
});

// --------------------------------------------------------------------- endings

defineEndings([
  {
    order: 80,
    title: 'The Glass Cathedral',
    scene: 'dust',
    text: (c) => {
      if (!c.flag('ct_shepherdDead')) return null;
      let t: string;
      if (c.flag('ct_lowIntSilence')) t = 'The Shepherd had spent a century wondering whether anyone could end his song. In the end it was someone who did not understand it at all: a single hard pull on a red cable, and a hundred years of the Hymn went out like a candle.';
      else if (c.flag('ct_shepherdSilenced')) t = 'When the Hymn stopped, Aurelio Vance stopped with it. He had made the transmitter his mind, and there was nothing left in the grey body to hold it together. The lens above the dome still gathers the sea light, and pilgrims say the silence under it is the deepest in the Basin.';
      else if (c.flag('ct_ashgraveTurned') && c.flag('ct_ashgraveDead')) t = 'Aurelio Vance was struck down by his own best note. Ashgrave turned on the throne and died doing it, and the Shepherd died arguing with him, which his old committee would have found very funny. The Grafted buried their lieutenant on the cliff top, under a cairn of broken glass.';
      else if (c.flag('ct_ashgraveTurned')) t = 'Aurelio Vance was struck down by his own best note. Ashgrave\'s hammer broke the throne, and the Shepherd died arguing, which his old committee would have found very funny.';
      else t = 'The Shepherd died under his lens, still trying to explain. For weeks afterward the transmitter whined out his final chord, one note with no end, until the generators ran dry.';
      if (c.flag('ct_cantorTurned') && !c.flag('ct_cantorDead')) t += ' Cantor Idris Moll walked the Choir down the cliff roads himself and spent the rest of his life knocking on doors in Kessler\'s shadow, asking the families of the taken to forgive him. Not all of them did.';
      else t += ' The Choir scattered. Some drifted back to the towns they had fled; a few still gather at the cliff top on still evenings, humming a note that nothing answers.';
      if (c.flag('ct_tobiahLeft')) t += ' Tobiah the pilgrim went home to Cinder Creek, and his sister was, in the end, pleased.';
      return t;
    },
  },
  {
    order: 85,
    title: 'The Grafted',
    scene: 'dust',
    text: (c) => {
      if (!c.flag('ct_shepherdDead') && !c.flag('kf_vatsDestroyed')) return null;
      let t: string;
      if (c.flag('ct_hymnSilenced')) {
        t = 'Without the Hymn, the Grafted woke slowly, like men after a long fever. Many never woke much at all. But some remembered names, and roads, and the faces of people they had loved, and a few of them went looking.';
        if (c.flag('ct_ashgraveLeads') && !c.flag('ct_ashgraveDead')) t += ' Garran Ash led those who would follow into the northern hills, where they built a walled village of their own and called it Stillwater. Caravans learned that its huge, careful people paid fairly and did not like to be stared at.';
      } else {
        t = 'The Shepherd\'s last chord rang in their collars for years. The Grafted drifted across the Basin like sleepwalkers, dangerous and lost, and caravan guards learned to shoot first. It was not a kind time to be large and grey.';
        if (c.flag('ct_ashgraveLeads') && !c.flag('ct_ashgraveDead')) t += ' Only those who followed Ashgrave north found any peace; he cut the collars off them one by one with a smith\'s chisel, and not all of them survived it.';
      }
      if (c.flag('kf_vatsDestroyed')) t += ' No more were ever made. They grew old, as everyone does, and they were the last of their kind.';
      else t += ' And under Fort Kessler, the vats kept bubbling, waiting for someone new to sing to them.';
      if (!c.flag('kf_sabelDead') && c.flag('kf_sabelMet')) t += ' Sabel the drover, who had kept his mind by counting, taught the ones who were willing to count as well.';
      return t;
    },
  },
]);
