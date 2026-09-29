// Crossroads Bazaar: the biggest market in the Basin, where two dead highways cross.
// Pell's Provisions, Brasswick Arms, the Aqueduct Company, Longhaul Caravans,
// Old Nessa's maps, a Keepers recruiter and the mercenary Juno Kale.
//
// Global flags set here (other areas may read them):
//   bz_caravansSolved - the Missing Caravans quest is done (kessler revealed)
//   bz_clueScout      - the caged Grafted named Fort Kessler
//   bz_scoutFreed     - the player freed the caged Grafted
//   bz_waterSent      - the Aqueduct Company water caravan went to Shelter 29
//   bz_corvinArrested / bz_oswinFavour / bz_blackmail - how the counterfeit scrip ended
//   bz_junoHired      - Juno Kale joined the player
//   rw_tobinFound / rw_tobinHome - Tobin Penn (Rustwater quest rw_brother) was found here
// Map generated with a small Python script (rows and coordinates kept in sync).

import { defineMap, defineDialogues, defineQuests, defineObjScripts, defineDeathScripts, defineEndings } from './registry';
import { defineItems } from '../data/items';
import { defineProtos, S } from '../data/protos';
import type { Ctx } from '../game/types';
import { companionOptions, ambientBarks } from './rustwater';

const BZ_ROWS = [
  "..o...v...o.v....v.v.v...v>>>>vvv.....v.o...v.v..v......",
  "..oov...v.vo.....vv..v..ov,,,,..v...ov........o......o..",
  "o......\"\"....\".......\"....,,,,.####M########\"AAAAAAAAAv.",
  "vv#############..AAAAAAAA.,,,,.#___Mttttttt#.AcccccccA.v",
  "..#wwwwwww#www#..AccccccA.,,,,.#___Mttttttt#.AcccccccA.v",
  "..#wwwwwww#www#.sAccccccA.,,,,.#___Mttttttt#.CcccccccAv.",
  "..#wwwwwww#www#..AccccccA.,,,,.#___Mttttttt#.AcccccccA..",
  "v.#wwwwwww##D##..AccccccA.,,,,.MMCMMttttttt#.AcccccccAv.",
  "o.#wwwwwwwwwww#..AccccccA.,,,,.#ttttttttttt#.AAAAAAAAAo.",
  ".v#wwwwwwwwwww#..AccccccA.,,,,.#ttttttttttt#.FFFFFFFFF..",
  "..#wwwwwwwwwww#.\"AccccccA.,,,,.#ttttttttttt#.FsssssssF..",
  "vv#wwwwwwwwwww#..AAACAAAA.,,,,.#ttttttttttt#.FsssssssF.v",
  "..#######D#####...........,,,,.#######C#####.FsssssssF.o",
  ".......s.\"..........\".....,,,,..........\"....FsssssssF..",
  "...%%%%%%%%%...s..........,,,,...............FsssssssFv.",
  "oo.%wwwwwww%.......ppppppp,,,,ppppppp...s....FsssssssF..",
  "v..%wwwwwww%.......ppppppp,,,,ppppppp.\"......FsssssssF..",
  "..s%wwwwwww%..s....ppppppp,,,,ppppppp.\"......FsssssssFvo",
  ".v.%wwwwwww%.......ppppppp,,,,ppppppp..s.....FFF..FFFFvv",
  "...%%%%D%%%%.......ppppppp,,,,ppppppp...................",
  "o..................ppppppp,,,,ppppppp...\"...\"...........",
  ">,,,,,,,,x,,,,,x,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,x,,,,,,>",
  ">,,,,,,,,,,,,,,,,,,,,,,,xx,,,,,,,,,,,,x,,,,,,,,,,x,,,,,>",
  ">,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,x,>",
  ">,,x,,,,,,,,,,,x,,,,,,,,,,,,,,,,,,x,,x,,,,,,,,,,,,,,,,,>",
  "oo...............\".ppppppp,,,,ppppppp..................v",
  "...................ppppppp,,,,ppppppp...................",
  ".o%%%%%%%D%%%%%%%..ppppppp,,,,.FFFFF....FFFFFFFFFFFFFFF.",
  "..%wwwwwwwwwwwww%..ppppppp,,,,.Fsssssssssssss%%%%%%%%%F.",
  "v.%wwwwwwwwwwwww%..ppppppp,,,,.Fsssssssssssss%wwwwwww%F.",
  "..%wwwwwwwwwwwww%..ppppppp,,,,.Fsssssssssssss%wwwwwww%F.",
  "v.%wwwwwwwwwwwww%\"........,,,,.Fsssssssssssss%wwwwwww%F.",
  "..%wwwwwwww%wwww%.........,,,,.Fsssssssssssss%wwwwwww%Fv",
  ".v%wwwwwwwwDwwww%.........,,,,.Fsssssssssssss%%%D%%%%%F.",
  ".v%wwwwwwww%wwww%.........,,,,.FssssssssssssssssssssssF.",
  "..%wwwwwwww%%%%%%..s......,,,,.FssssssssssssssssssssssF.",
  "..%wwwwwwww%wwww%.........,,,,.FFFFFFFFFFsssssssssssssF.",
  ".v%wwwwwwwwDwwww%......\"..,,,,.FssssssssFsssssssssssssFo",
  "..%wwwwwwww%wwww%.....\"...,,,,.FssssssssFsssssssssssssF.",
  "..%%%%%%%%%%%%%%%........s,,,,.Fssssssss+sssssssssssssF.",
  ".o..............\"..\"......,,,,.FssssssssFsssssssssssssF.",
  "...SS+SSSsSS+SSS..........,,,,.FssssssssFsssssssssssssF.",
  "...S....S.S....S......\"...,,,,.FssssssssFsssssssssssssF.",
  "...S....S.S....S..........,,,,.FssssssssFsssssssssssssF.",
  "..vSSSSSS.SSSSSS.v.o.v..v.,,,,.FFFFFFFFFFFFFFFFFFFFFFFF.",
  ".v..v....v..ov..o...vvv...>>>>o..vo..v...v.vv........o..",
];
const BZ: Record<string, [number, number]> = {
  pell: [6, 6],
  pellCounter1: [5, 7],
  pellCounter2: [7, 7],
  pellShelf1: [3, 4],
  pellShelf2: [3, 9],
  pellShelf3: [5, 4],
  pellStockCrate: [11, 4],
  pellStockCrate2: [13, 5],
  pellBarrel: [13, 4],
  pellTill: [8, 4],
  pellCust: [8, 10],
  pellBarrelOut1: [15, 13],
  pellBarrelOut2: [16, 12],
  provost: [20, 6],
  provostDesk: [21, 5],
  provostLocker: [23, 4],
  provostBunk: [18, 9],
  noticeBoard: [22, 13],
  nessa: [6, 16],
  nessaTable: [7, 16],
  nessaShelf: [4, 15],
  nessaShelf2: [9, 15],
  nessaBook: [10, 17],
  keeperTent: [14, 16],
  keeperTable: [16, 17],
  keeper: [16, 18],
  keeperSign: [13, 19],
  oswin: [39, 5],
  corvin: [41, 9],
  armsCounter1: [38, 6],
  armsCounter2: [40, 6],
  armsRack1: [37, 3],
  armsRack2: [42, 3],
  armsRack3: [42, 7],
  armsGuard: [36, 10],
  storeChest: [32, 4],
  storeLocker: [34, 3],
  storeCrate: [32, 6],
  storeBench: [34, 5],
  armsSign: [36, 14],
  sabine: [49, 4],
  aqDesk: [50, 5],
  aqCab: [52, 3],
  aqClerk: [47, 6],
  aqShelf: [46, 3],
  tank1: [47, 11],
  tank2: [50, 11],
  tank3: [47, 14],
  tank4: [51, 14],
  pump: [49, 16],
  aqGuard: [49, 13],
  waterCart: [47, 20],
  stall0: [20, 17],
  stall1: [23, 17],
  stall2: [32, 17],
  stall3: [35, 17],
  stall4: [20, 28],
  stall5: [23, 28],
  stall6: [32, 25],
  stall7: [35, 25],
  stall8: [21, 26],
  stall9: [34, 19],
  hawker0: [20, 16],
  hawker1: [23, 16],
  hawker2: [32, 16],
  hawker3: [35, 16],
  hawker4: [20, 29],
  hawker5: [23, 29],
  hawker6: [32, 26],
  hawker7: [35, 26],
  lamp1: [25, 20],
  lamp2: [30, 20],
  lamp3: [25, 25],
  lamp4: [30, 25],
  lamp5: [10, 20],
  lamp6: [45, 20],
  lamp7: [10, 25],
  lamp8: [45, 25],
  lamp9: [25, 10],
  lamp10: [30, 36],
  preacher: [22, 19],
  juggler: [30, 17],
  kid1: [24, 27],
  kid2: [31, 18],
  guardW: [3, 20],
  guardE: [52, 25],
  guardN: [30, 2],
  guardS: [25, 43],
  guardP1: [19, 20],
  guardP2: [36, 25],
  entry: [3, 22],
  entryE: [52, 22],
  entryN: [27, 3],
  entryS: [28, 42],
  shopper1: [24, 18],
  shopper2: [33, 20],
  shopper3: [21, 25],
  shopper4: [36, 20],
  innkeep: [4, 29],
  innBar1: [5, 30],
  innBar2: [5, 31],
  innBarrel: [3, 28],
  innTbl1: [8, 31],
  innTbl2: [8, 35],
  innTbl3: [5, 36],
  juno: [9, 36],
  ezra: [7, 32],
  drinker: [6, 35],
  teamster: [13, 30],
  innBed1: [15, 33],
  innBed2: [15, 38],
  innChest1: [12, 33],
  innLocker2: [12, 38],
  innFire: [14, 29],
  shack1Bed: [4, 42],
  shack1Bag: [7, 43],
  shack2Box: [14, 42],
  shack2Npc: [12, 43],
  ragTent1: [19, 35],
  ragTent2: [22, 39],
  ragFire: [20, 37],
  beggar: [21, 36],
  ragCrate: [23, 34],
  odessa: [49, 30],
  lhDesk: [50, 29],
  lhCab: [52, 29],
  lhMap: [46, 29],
  lhClerk: [47, 31],
  ox1: [34, 38],
  ox2: [37, 40],
  ox3: [35, 42],
  trough: [33, 41],
  tobin: [42, 38],
  wagon1: [44, 36],
  wagon2: [48, 36],
  emptyWagon: [46, 40],
  wagon3: [51, 39],
  lhCrate1: [33, 29],
  lhCrate2: [34, 29],
  lhCrate3: [33, 30],
  lhBarrel: [43, 29],
  cage: [51, 42],
  cageGuard: [49, 42],
  driver1: [38, 31],
  driver2: [42, 33],
  lhGuard: [37, 28],
  lhFire: [38, 33],
  stallE1: [40, 18],
  stallE2: [43, 18],
  hawkerE1: [40, 17],
  hawkerE2: [43, 17],
  stallW1: [13, 26],
  wreck1: [18, 44],
  wreck2: [52, 19],
  wreck3: [2, 13],
  barrelA: [17, 20],
  barrelB: [38, 25],
  crateA: [16, 14],
  crateB: [44, 14],
};

// ------------------------------------------------------------------ items & protos

defineItems([
  { id: 'bz_tape', name: 'Scorched Holotape', type: 'misc', weight: 0, value: 0, icon: 'holotape', quest: true, use: 'bz_tape', desc: 'A driver\'s log holotape from a Longhaul wagon, the casing half melted. Use it to play it on your wrist-link.' },
  { id: 'bz_collarLink', name: 'Broken Collar Link', type: 'misc', weight: 1, value: 0, icon: 'part', quest: true, desc: 'A thick iron link, still warm-looking with old grease, with a stub of copper wire running through its core. It came off something with a very big neck.' },
  { id: 'bz_fakeScrip', name: 'Counterfeit Scrip', type: 'misc', weight: 0, value: 0, icon: 'scrip', quest: true, desc: 'A scrip token that is a little too heavy. Scratch it and the aluminium paint flakes off grey lead.' },
  { id: 'bz_mould', name: 'Token Mould', type: 'misc', weight: 2, value: 0, icon: 'part', quest: true, desc: 'A two-piece steel mould for casting scrip tokens, with a Bazaar assay stamp cut into it. Crusted with lead.' },
  { id: 'bz_storeKey', name: 'Brasswick Storeroom Key', type: 'key', weight: 0, value: 0, icon: 'key', desc: 'A small steel key on a leather thong, marked with a B.' },
  { id: 'bz_cageKey', name: 'Cage Key', type: 'key', weight: 0, value: 0, icon: 'key', desc: 'The key to the Longhaul yard\'s prisoner cage.' },
]);

defineProtos([
  { id: 'bz_guard', name: 'Bazaar Guard', desc: 'a Bazaar guard in a sun-bleached duster over plate', look: { body: 'human', skin: '#a8764e', hair: '#2a1a10', hairStyle: 'helmet', outfit: '#8a7a5a', outfit2: '#4a4a52' }, stats: S(6, 7, 7, 4, 5, 6, 5), hp: 55, xp: 140, skills: { smallGuns: 78, melee: 65 }, equip: ['huntingRifle', 'metalArmor'], inv: [{ id: 'ammo223', n: 14 }, { id: 'hypo', chance: 30 }], team: 'bazaar', hostile: false },
  { id: 'bz_trader', name: 'Trader', desc: 'a Bazaar trader with a money-belt and a ready smile', look: { body: 'human', skin: '#c08a60', hair: '#2a2a2a', hairStyle: 'short', outfit: '#7a4a3a', outfit2: '#d0b060' }, stats: S(5, 6, 5, 7, 6, 5, 6), xp: 60, skills: { smallGuns: 55, barter: 75 }, equip: ['pistol9'], inv: [{ id: 'ammo9', n: 10 }], team: 'bazaar', hostile: false },
  { id: 'bz_traderF', name: 'Trader', desc: 'a Bazaar trader with a bright head-scarf', look: { body: 'human', female: true, skin: '#8a5a3a', hair: '#1a1a1a', hairStyle: 'hood', outfit: '#3a6a6a', outfit2: '#d0a040' }, stats: S(4, 6, 5, 7, 6, 5, 6), xp: 60, skills: { smallGuns: 50, barter: 75 }, team: 'bazaar', hostile: false },
  { id: 'bz_local', name: 'Bazaar Local', desc: 'a dusty traveller haggling over something', look: { body: 'human', skin: '#b58560', hair: '#4a3020', hairStyle: 'short', outfit: '#8a7458', outfit2: '#5a4a38' }, stats: S(5, 5, 5, 5, 5, 5, 5), xp: 30, skills: { melee: 40 }, equip: ['knife'], team: 'bazaar', hostile: false },
  { id: 'bz_localF', name: 'Bazaar Local', desc: 'a traveller in a wide straw hat', look: { body: 'human', female: true, skin: '#d0a078', hair: '#6a3a1a', hairStyle: 'long', outfit: '#9a6a4a', outfit2: '#5a4a38' }, stats: S(4, 5, 5, 5, 5, 5, 5), xp: 30, team: 'bazaar', hostile: false },
  { id: 'bz_driver', name: 'Caravan Driver', desc: 'a caravan driver with ox-dust caked on everything', look: { body: 'human', skin: '#9a6a44', hair: '#3a2a1a', hairStyle: 'cap', outfit: '#6a5a3a', outfit2: '#8a3a2a' }, stats: S(6, 5, 6, 4, 5, 5, 5), xp: 50, skills: { smallGuns: 55, melee: 50 }, equip: ['shotgun'], inv: [{ id: 'shells', n: 6 }], team: 'bazaar', hostile: false },
  {
    id: 'bz_juno', name: 'Juno Kale', desc: 'Juno Kale, a lean mercenary with a scoped rifle',
    look: { body: 'human', female: true, skin: '#8a5a3a', hair: '#141414', hairStyle: 'short', outfit: '#4a5a3a', outfit2: '#8a6a3a' },
    stats: S(5, 9, 6, 5, 6, 8, 6), hp: 58, xp: 200, skills: { smallGuns: 92, melee: 55, unarmed: 50, sneak: 60, firstAid: 50 },
    equip: ['huntingRifle', 'leatherArmor'], inv: [{ id: 'ammo223', n: 40 }, { id: 'hypo', n: 2 }], team: 'bazaar', hostile: false,
  },
  {
    id: 'bz_captive', name: 'Collared Captive', desc: 'a caged Grafted, huge and grey-green, with an iron collar welded around its neck',
    look: { body: 'grafted', skin: '#7a866a', outfit: '#4a4038', outfit2: '#8a7a50', scale: 1.3 },
    stats: S(10, 5, 9, 3, 4, 5, 4), hp: 80, xp: 300, dt: { normal: 3 }, dr: { normal: 20 }, skills: { unarmed: 80 },
    natural: { name: 'fist', dmg: [6, 14], ap: 4 }, team: 'bz_captive', hostile: false,
  },
]);

defineQuests([
  { id: 'bz_caravans', title: 'Missing Caravans', area: 'bazaar', xp: 1500, desc: 'Caravans keep vanishing on the east road. Odessa Crane of Longhaul Caravans wants to know who, or what, is taking them.' },
  { id: 'bz_counterfeit', title: 'Lead in the Till', area: 'bazaar', xp: 700, desc: 'Somebody is passing counterfeit scrip in the Bazaar: lead tokens painted to look like aluminium. Provost Ilka Brandt wants the source found.' },
]);

// ------------------------------------------------------------------ helpers

function clueCount(c: Ctx) {
  return ['bz_clueSurvivor', 'bz_clueWagon', 'bz_clueTape'].filter((f) => c.flag(f)).length;
}

function caravansReady(c: Ctx) {
  return !!c.flag('bz_clueScout') || clueCount(c) >= 2;
}

function revealKessler(c: Ctx, note: string) {
  c.reveal('kessler');
  if (!c.flag('bz_kesslerNoted')) {
    c.set('bz_kesslerNoted');
    c.quest('bz_caravans', note);
  }
}

function waterPrice(c: Ctx) {
  let p = 1500;
  if (c.flag('rw_grellSaved')) p = Math.min(p, 1350);
  if (c.flag('bz_speechWater')) p = Math.min(p, 1200);
  if (c.flag('bz_barterWater')) p = Math.min(p, 1100);
  if (c.flag('bz_caravansSolved')) p = Math.min(p, 750);
  return p;
}

function hasEvidence(c: Ctx) {
  return c.has('bz_mould');
}

function startCounterfeit(c: Ctx, note: string) {
  c.quest('bz_counterfeit', note);
}

function corvinSuspect(c: Ctx) {
  return !!(c.flag('bz_clueTeamster') || c.flag('bz_clueJuno'));
}

// ------------------------------------------------------------------ map

const STALL_TINTS = ['#a84a3a', '#3a7a6a', '#c8a040', '#6a4a8a', '#4a7a3a', '#b86a2a', '#3a5a8a', '#8a3a5a', '#7a8a3a', '#a83a2a'];

defineMap({
  id: 'bazaar',
  name: 'Crossroads Bazaar',
  area: 'bazaar',
  outdoor: true,
  floor: 'dirt',
  floor2: 'asphalt',
  wall: 'brick',
  wall2: 'wood',
  music: 'town',
  legend: {
    s: { floor: 'sand' },
    v: { floor: 'sand', decor: 'scrub' },
    p: { floor: 'cracked' },
    w: { floor: 'wood' },
    c: { floor: 'concrete' },
    t: { floor: 'tile' },
    x: { floor: 'asphalt', decor: 'oil' },
    F: { wall: 'fence', floor: 'sand' },
    A: { wall: 'adobe' },
    M: { wall: 'metal' },
    S: { wall: 'scrap' },
    D: { floor: 'wood', door: {} },
    C: { floor: 'concrete', door: {} },
    '>': { floor: 'asphalt', exit: 'out' },
  },
  rows: BZ_ROWS,
  entrances: { default: BZ.entry, east: BZ.entryE, north: BZ.entryN, south: BZ.entryS },
  exits: { out: { to: 'world' } },
  objects: [
    // Pell's Provisions
    { kind: 'table', at: BZ.pellCounter1, tint: '#6a4a2a' }, { kind: 'table', at: BZ.pellCounter2, tint: '#6a4a2a' },
    { kind: 'shelf', at: BZ.pellShelf1, inv: [{ id: 'water', n: 1 }] },
    { kind: 'shelf', at: BZ.pellShelf2 },
    { kind: 'shelf', at: BZ.pellShelf3, inv: [{ id: 'rope', n: 1 }] },
    { kind: 'crate', at: BZ.pellStockCrate, name: 'stock crate', locked: 30, inv: [{ id: 'jerky', n: 4 }, { id: 'hypo', n: 1 }] },
    { kind: 'crate', at: BZ.pellStockCrate2, name: 'stock crate', inv: [{ id: 'flare', n: 2 }] },
    { kind: 'barrel', at: BZ.pellBarrel, tint: '#5a4a3a' },
    { kind: 'desk', at: BZ.pellTill, name: 'Pell\'s till', locked: 45, inv: [{ id: 'scrip', n: 70 }, { id: 'bz_fakeScrip', n: 1 }] },
    { kind: 'barrel', at: BZ.pellBarrelOut1, tint: '#6a3a2a' }, { kind: 'barrelc', at: BZ.pellBarrelOut2, inv: [{ id: 'water', n: 1 }] },
    // Provost's post
    { kind: 'desk', at: BZ.provostDesk, name: 'Provost\'s desk', inv: [{ id: 'ammo223', n: 10 }] },
    { kind: 'locker', at: BZ.provostLocker, name: 'confiscation locker', locked: 60, inv: [{ id: 'smg9', n: 1 }, { id: 'ammo9', n: 30 }, { id: 'fury', n: 1 }] },
    { kind: 'bunk', at: BZ.provostBunk },
    { kind: 'sign', at: BZ.noticeBoard, name: 'notice board', tint: '#c8b890', onUse: 'bz_notice' },
    // Old Nessa
    { kind: 'table', at: BZ.nessaTable, tint: '#8a7a5a' },
    { kind: 'bookcase', at: BZ.nessaShelf, name: 'map chest', inv: [{ id: 'flare', n: 1 }] },
    { kind: 'bookcase', at: BZ.nessaShelf2, name: 'rolled maps' },
    { kind: 'shelf', at: BZ.nessaBook, inv: [{ id: 'clarity', n: 1 }] },
    // Keepers recruiter
    { kind: 'tent', at: BZ.keeperTent, tint: '#5a5a6a' },
    { kind: 'table', at: BZ.keeperTable, tint: '#4a4a5a' },
    { kind: 'sign', at: BZ.keeperSign, name: 'Keepers\' placard', tint: '#6a6a7a', onUse: 'bz_keeperSign' },
    // Brasswick Arms
    { kind: 'table', at: BZ.armsCounter1, tint: '#3a3a3a' }, { kind: 'table', at: BZ.armsCounter2, tint: '#3a3a3a' },
    { kind: 'rack', at: BZ.armsRack1, name: 'rifle rack' }, { kind: 'rack', at: BZ.armsRack2, name: 'rifle rack' }, { kind: 'rack', at: BZ.armsRack3, name: 'pistol rack' },
    { kind: 'door', at: [33, 7], id: 'bz_storeDoor', locked: 55, key: 'bz_storeKey' },
    { kind: 'chest', at: BZ.storeChest, name: 'Corvin\'s strongbox', locked: 50, key: 'bz_storeKey', inv: [{ id: 'bz_mould', n: 1 }, { id: 'bz_fakeScrip', n: 3 }, { id: 'scrip', n: 45 }] },
    { kind: 'locker', at: BZ.storeLocker, name: 'powder locker', locked: 40, inv: [{ id: 'dynamite', n: 1 }, { id: 'fragGrenade', n: 2 }, { id: 'ammo44', n: 12 }] },
    { kind: 'crate', at: BZ.storeCrate, name: 'ammunition crate', inv: [{ id: 'ammo9', n: 24 }, { id: 'shells', n: 8 }] },
    { kind: 'table', at: BZ.storeBench, name: 'workbench', tint: '#4a4038' },
    { kind: 'sign', at: BZ.armsSign, name: 'BRASSWICK ARMS', tint: '#8a8a90', onUse: 'bz_armsSign' },
    // Aqueduct Company
    { kind: 'desk', at: BZ.aqDesk, name: 'factor\'s desk', inv: [{ id: 'scrip', n: 30 }] },
    { kind: 'cabinet', at: BZ.aqCab, name: 'contract cabinet', locked: 50, inv: [{ id: 'water', n: 3 }, { id: 'scrip', n: 90 }] },
    { kind: 'shelf', at: BZ.aqShelf, inv: [{ id: 'water', n: 2 }] },
    { kind: 'tank', at: BZ.tank1, name: 'water tank', tint: '#4a6a8a' }, { kind: 'tank', at: BZ.tank2, name: 'water tank', tint: '#4a6a8a' },
    { kind: 'tank', at: BZ.tank3, name: 'water tank', tint: '#5a7a8a' }, { kind: 'tank', at: BZ.tank4, name: 'water tank', tint: '#4a6a8a' },
    { kind: 'generator', at: BZ.pump, name: 'water pump' },
    { kind: 'barrelc', at: BZ.waterCart, name: 'water cart', inv: [{ id: 'water', n: 1 }] },
    // plaza
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => ({ kind: 'stall', at: BZ['stall' + i], tint: STALL_TINTS[i] })),
    { kind: 'stall', at: BZ.stallE1, tint: '#8a6a3a' }, { kind: 'stall', at: BZ.stallE2, tint: '#4a6a4a' },
    { kind: 'stall', at: BZ.stallW1, tint: '#9a4a4a' },
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({ kind: 'lamp', at: BZ['lamp' + i] })),
    { kind: 'barrel', at: BZ.barrelA, tint: '#6a4a2a' }, { kind: 'barrel', at: BZ.barrelB, tint: '#3a5a3a' },
    { kind: 'crate', at: BZ.crateA, inv: [{ id: 'scrapMetal', n: 1 }] }, { kind: 'crate', at: BZ.crateB, inv: [{ id: 'jerky', n: 1 }] },
    { kind: 'car', at: BZ.wreck1, tint: '#6a5a4a' }, { kind: 'car', at: BZ.wreck2, tint: '#4a4a5a' }, { kind: 'car', at: BZ.wreck3, tint: '#7a4a2a' },
    // Tethered Ox
    { kind: 'table', at: BZ.innBar1, tint: '#5a3a22' }, { kind: 'table', at: BZ.innBar2, tint: '#5a3a22' },
    { kind: 'barrel', at: BZ.innBarrel, tint: '#6a4a2a' },
    { kind: 'table', at: BZ.innTbl1 }, { kind: 'table', at: BZ.innTbl2 }, { kind: 'table', at: BZ.innTbl3 },
    { kind: 'bed', at: BZ.innBed1, tint: '#8a6a4a' }, { kind: 'bed', at: BZ.innBed2, tint: '#6a6a8a' },
    { kind: 'footlocker', at: BZ.innChest1, inv: [{ id: 'curePaste', n: 1 }, { id: 'scrip', n: 12 }] },
    { kind: 'locker', at: BZ.innLocker2, locked: 35, inv: [{ id: 'ammo223', n: 12 }, { id: 'superHypo', n: 1 }] },
    { kind: 'campfire', at: BZ.innFire, name: 'hearth' },
    // Rag Row
    { kind: 'bedroll', at: BZ.shack1Bed }, { kind: 'bag', at: BZ.shack1Bag, inv: [{ id: 'jerky', n: 1 }, { id: 'rope', n: 1 }] },
    { kind: 'footlocker', at: BZ.shack2Box, locked: 20, inv: [{ id: 'scrip', n: 18 }, { id: 'antidote', n: 1 }] },
    { kind: 'tent', at: BZ.ragTent1, tint: '#7a6a5a' }, { kind: 'tent', at: BZ.ragTent2, tint: '#6a5a4a' },
    { kind: 'campfire', at: BZ.ragFire },
    { kind: 'crate', at: BZ.ragCrate, inv: [{ id: 'water', n: 1 }] },
    // Longhaul yard
    { kind: 'desk', at: BZ.lhDesk, name: 'Odessa\'s desk', inv: [{ id: 'scrip', n: 25 }] },
    { kind: 'cabinet', at: BZ.lhCab, name: 'route cabinet', locked: 40, inv: [{ id: 'ammo9', n: 20 }, { id: 'hypo', n: 1 }] },
    { kind: 'bookcase', at: BZ.lhMap, name: 'route maps' },
    { kind: 'car', at: BZ.wagon1, name: 'Longhaul wagon', tint: '#7a5a3a' },
    { kind: 'car', at: BZ.wagon2, name: 'Longhaul wagon', tint: '#8a6a3a' },
    { kind: 'car', at: BZ.wagon3, name: 'Longhaul wagon', tint: '#6a4a2a' },
    { kind: 'car', at: BZ.emptyWagon, id: 'bz_emptyWagon', name: 'returned wagon', tint: '#5a3a2a', onUse: 'bz_wagon' },
    { kind: 'crate', at: BZ.lhCrate1, inv: [{ id: 'jerky', n: 2 }] }, { kind: 'crate', at: BZ.lhCrate2 }, { kind: 'crate', at: BZ.lhCrate3, inv: [{ id: 'scrapMetal', n: 2 }] },
    { kind: 'barrel', at: BZ.lhBarrel, tint: '#5a4a2a' },
    { kind: 'barrelc', at: BZ.trough, name: 'water trough' },
    { kind: 'campfire', at: BZ.lhFire },
    { kind: 'cage', at: BZ.cage, id: 'bz_cage', name: 'iron cage', blocks: false, onUse: 'bz_cage' },
  ],
  npcs: [
    // merchants
    { proto: 'bz_trader', id: 'bz_pell', name: 'Ambrose Pell', at: BZ.pell, dialog: 'bz_pell', barter: true, inv: [{ id: 'water', n: 8 }, { id: 'jerky', n: 10 }, { id: 'beer', n: 6 }, { id: 'hypo', n: 4 }, { id: 'curePaste', n: 4 }, { id: 'radPurge', n: 2 }, { id: 'iodine', n: 3 }, { id: 'antidote', n: 2 }, { id: 'rope', n: 3 }, { id: 'flare', n: 5 }, { id: 'lockpicks', n: 1 }, { id: 'toolkit', n: 1 }, { id: 'medkit', n: 1 }, { id: 'geiger', n: 1 }, { id: 'dynamite', n: 1 }, { id: 'leatherJacket', n: 1 }, { id: 'scrip', n: 600 }], look: { hair: '#8a8a80', hairStyle: 'short', beard: true, outfit: '#6a5a3a', outfit2: '#c8b070', skin: '#d8a880' } },
    { proto: 'bz_trader', id: 'bz_oswin', name: 'Oswin Brasswick', at: BZ.oswin, dialog: 'bz_oswin', barter: true, inv: [
      { id: 'pistol9', n: 2 }, { id: 'revolver44', n: 1 }, { id: 'smg9', n: 1 }, { id: 'huntingRifle', n: 2 }, { id: 'shotgun', n: 1 }, { id: 'assaultRifle', n: 1 },
      { id: 'ammo9', n: 120 }, { id: 'ammo44', n: 48 }, { id: 'ammo223', n: 60 }, { id: 'shells', n: 40 }, { id: 'ammo5', n: 60 },
      { id: 'leatherJacket', n: 1 }, { id: 'leatherArmor', n: 2 }, { id: 'metalArmor', n: 1 }, { id: 'combatArmor', n: 1 },
      { id: 'fragGrenade', n: 4 }, { id: 'molotov', n: 3 }, { id: 'throwingKnife', n: 6 }, { id: 'sledge', n: 1 }, { id: 'shockBaton', n: 1 }, { id: 'scrip', n: 1400 },
    ], equip: ['revolver44', 'leatherArmor'], look: { hair: '#ccc', hairStyle: 'bald', beard: true, skin: '#c89a78', outfit: '#3a3a44', outfit2: '#b08a40', scale: 1.05 } },
    { proto: 'bz_trader', id: 'bz_corvin', name: 'Corvin Brasswick', at: BZ.corvin, dialog: 'bz_corvin', inv: [{ id: 'bz_storeKey', n: 1 }, { id: 'bz_fakeScrip', n: 2 }, { id: 'scrip', n: 30 }], look: { hair: '#7a4a2a', hairStyle: 'long', skin: '#e0b898', outfit: '#5a3a5a', outfit2: '#c8a040' } },
    { proto: 'bz_guard', id: 'bz_armsGuard', name: 'Brasswick Guard', at: BZ.armsGuard, team: 'bazaar', inv: [{ id: 'bz_storeKey', n: 1 }] },
    { proto: 'bz_traderF', id: 'bz_sabine', name: 'Factor Sabine Orrow', at: BZ.sabine, dialog: 'bz_sabine', barter: true, inv: [{ id: 'water', n: 20 }, { id: 'scrip', n: 400 }], look: { hairStyle: 'bun', hair: '#1a1a1a', skin: '#5a3420', outfit: '#2a5a7a', outfit2: '#c8c8c8' } },
    { proto: 'bz_local', id: 'bz_aqClerk', name: 'Aqueduct Clerk', at: BZ.aqClerk, dialog: 'bz_aqClerk', equip: [], look: { outfit: '#2a5a7a', outfit2: '#c8c8c8', hairStyle: 'short' } },
    { proto: 'bz_guard', id: 'bz_aqGuard', name: 'Aqueduct Guard', at: BZ.aqGuard, team: 'bazaar', wander: 2, look: { outfit: '#2a5a7a' } },
    { proto: 'bz_localF', id: 'bz_nessa', name: 'Old Nessa', at: BZ.nessa, dialog: 'bz_nessa', look: { hair: '#e0e0e0', hairStyle: 'bun', skin: '#c89468', outfit: '#6a4a6a', outfit2: '#c8a040', scale: 0.9 } },
    { proto: 'bz_localF', id: 'bz_keeper', name: 'Scribe-Initiate Mireille Tan', at: BZ.keeper, dialog: 'bz_keeper', look: { hairStyle: 'hood', hair: '#1a1a1a', skin: '#e0c098', outfit: '#6a6a7a', outfit2: '#b0b0c0' } },
    { proto: 'bz_guard', id: 'bz_provost', name: 'Provost Ilka Brandt', at: BZ.provost, dialog: 'bz_provost', team: 'bazaar', equip: ['assaultRifle', 'metalArmor'], inv: [{ id: 'ammo5', n: 40 }], look: { female: true, hairStyle: 'bun', hair: '#d0b070', skin: '#e0b090' } },
    // inn
    { proto: 'bz_traderF', id: 'bz_marta', name: 'Marta Quell', at: BZ.innkeep, dialog: 'bz_marta', barter: true, inv: [{ id: 'beer', n: 12 }, { id: 'water', n: 6 }, { id: 'jerky', n: 8 }, { id: 'scrip', n: 200 }], look: { hairStyle: 'long', hair: '#8a4a2a', skin: '#d8a880', outfit: '#6a3a2a', outfit2: '#e0d0b0' } },
    { proto: 'bz_juno', id: 'bz_juno', name: 'Juno Kale', at: BZ.juno, dialog: 'bz_juno' },
    { proto: 'bz_local', id: 'bz_ezra', name: 'Ezra Tallow', at: BZ.ezra, dialog: 'bz_ezra', equip: [], look: { hair: '#9a8a70', hairStyle: 'short', outfit: '#5a4a3a', skin: '#c89a78' } },
    { proto: 'bz_driver', id: 'bz_hobb', name: 'Hobb Linden', at: BZ.teamster, dialog: 'bz_hobb', look: { beard: true } },
    { proto: 'bz_local', id: 'bz_drinker', name: 'Sleepy Drover', at: BZ.drinker, look: { hairStyle: 'cap' } },
    // Longhaul
    { proto: 'bz_traderF', id: 'bz_odessa', name: 'Odessa Crane', at: BZ.odessa, dialog: 'bz_odessa', equip: ['huntingRifle'], look: { hairStyle: 'short', hair: '#bbb', skin: '#8a5a3a', outfit: '#7a5a3a', outfit2: '#3a3a3a' } },
    { proto: 'bz_local', id: 'bz_lhClerk', name: 'Longhaul Clerk', at: BZ.lhClerk, dialog: 'bz_lhClerk', equip: [], look: { hairStyle: 'short', outfit: '#7a5a3a' } },
    { proto: 'bz_local', id: 'rw_tobin', name: 'Tobin Penn', at: BZ.tobin, dialog: 'rw_tobin', wander: 2, if: (c) => !c.flag('rw_tobinHome'), equip: [], look: { hair: '#c0602a', hairStyle: 'short', skin: '#e8c0a0', outfit: '#6a6a4a' } },
    { proto: 'bz_captive', id: 'bz_scout', name: 'Collared Captive', at: BZ.cage, dialog: 'bz_scout' },
    { proto: 'bz_guard', id: 'bz_cageGuard', name: 'Longhaul Guard', at: BZ.cageGuard, dialog: 'bz_cageGuard', inv: [{ id: 'bz_cageKey', n: 1 }], look: { outfit: '#7a5a3a' } },
    { proto: 'bz_guard', id: 'bz_lhGuard', name: 'Longhaul Guard', at: BZ.lhGuard, look: { outfit: '#7a5a3a' } },
    { proto: 'bz_driver', id: 'bz_driver1', name: 'Caravan Driver', at: BZ.driver1, wander: 3 },
    { proto: 'bz_driver', id: 'bz_driver2', name: 'Caravan Driver', at: BZ.driver2, wander: 3, look: { female: true, hairStyle: 'bun' } },
    { proto: 'ox', id: 'bz_ox1', name: 'Dust Ox', at: BZ.ox1, wander: 2 },
    { proto: 'ox', id: 'bz_ox2', name: 'Dust Ox', at: BZ.ox2, wander: 2 },
    { proto: 'ox', id: 'bz_ox3', name: 'Dust Ox', at: BZ.ox3, wander: 2 },
    // guards
    { proto: 'bz_guard', id: 'bz_guardW', name: 'Bazaar Guard', at: BZ.guardW, dialog: 'bz_guard' },
    { proto: 'bz_guard', id: 'bz_guardE', name: 'Bazaar Guard', at: BZ.guardE, dialog: 'bz_guard' },
    { proto: 'bz_guard', id: 'bz_guardN', name: 'Bazaar Guard', at: BZ.guardN, dialog: 'bz_guard' },
    { proto: 'bz_guard', id: 'bz_guardS', name: 'Bazaar Guard', at: BZ.guardS, dialog: 'bz_guard' },
    { proto: 'bz_guard', id: 'bz_guardP1', name: 'Bazaar Guard', at: BZ.guardP1, dialog: 'bz_guard', wander: 5 },
    { proto: 'bz_guard', id: 'bz_guardP2', name: 'Bazaar Guard', at: BZ.guardP2, dialog: 'bz_guard', wander: 5, look: { female: true } },
    // stallholders
    { proto: 'bz_trader', id: 'bz_hawker0', name: 'Spice Seller', at: BZ.hawker0, dialog: 'bz_hawker', barter: true, inv: [{ id: 'jerky', n: 6 }, { id: 'curePaste', n: 2 }, { id: 'scrip', n: 80 }] },
    { proto: 'bz_traderF', id: 'bz_hawker1', name: 'Cloth Seller', at: BZ.hawker1, dialog: 'bz_hawker', barter: true, inv: [{ id: 'robe', n: 2 }, { id: 'leatherJacket', n: 1 }, { id: 'scrip', n: 90 }] },
    { proto: 'bz_trader', id: 'bz_hawker2', name: 'Tinker', at: BZ.hawker2, dialog: 'bz_hawker', barter: true, inv: [{ id: 'scrapElectronics', n: 4 }, { id: 'toolkit', n: 1 }, { id: 'cell', n: 20 }, { id: 'geiger', n: 1 }, { id: 'scrip', n: 120 }], look: { hairStyle: 'cap', outfit: '#4a4a3a' } },
    { proto: 'bz_traderF', id: 'bz_hawker3', name: 'Chem Peddler', at: BZ.hawker3, dialog: 'bz_hawker', barter: true, inv: [{ id: 'bulk', n: 2 }, { id: 'clarity', n: 2 }, { id: 'fury', n: 1 }, { id: 'iodine', n: 4 }, { id: 'scrip', n: 150 }], look: { outfit: '#6a2a4a' } },
    { proto: 'bz_trader', id: 'bz_hawker4', name: 'Water Seller', at: BZ.hawker4, dialog: 'bz_hawker', barter: true, inv: [{ id: 'water', n: 10 }, { id: 'scrip', n: 60 }], look: { outfit: '#2a5a7a' } },
    { proto: 'bz_traderF', id: 'bz_hawker5', name: 'Beer Brewer', at: BZ.hawker5, dialog: 'bz_hawker', barter: true, inv: [{ id: 'beer', n: 12 }, { id: 'scrip', n: 50 }] },
    { proto: 'bz_trader', id: 'bz_hawker6', name: 'Scrap Seller', at: BZ.hawker6, dialog: 'bz_hawker', barter: true, inv: [{ id: 'scrapMetal', n: 6 }, { id: 'crowbar', n: 1 }, { id: 'spear', n: 2 }, { id: 'knife', n: 2 }, { id: 'scrip', n: 70 }], look: { hairStyle: 'bald' } },
    { proto: 'bz_traderF', id: 'bz_hawker7', name: 'Charm Seller', at: BZ.hawker7, dialog: 'bz_hawker', barter: true, inv: [{ id: 'flare', n: 4 }, { id: 'rope', n: 2 }, { id: 'scrip', n: 40 }] },
    { proto: 'bz_trader', id: 'bz_hawkerE1', name: 'Grain Merchant', at: BZ.hawkerE1, dialog: 'bz_hawker', barter: true, inv: [{ id: 'jerky', n: 8 }, { id: 'water', n: 2 }, { id: 'scrip', n: 60 }] },
    { proto: 'bz_traderF', id: 'bz_hawkerE2', name: 'Lamp Oil Seller', at: BZ.hawkerE2, dialog: 'bz_hawker', barter: true, inv: [{ id: 'fuel', n: 2 }, { id: 'molotov', n: 2 }, { id: 'flare', n: 3 }, { id: 'scrip', n: 60 }] },
    // crowd
    { proto: 'bz_localF', id: 'bz_preacher', name: 'Sister Calloway', at: BZ.preacher, dialog: 'bz_preacher', look: { hairStyle: 'hood', outfit: '#d8d0b8', outfit2: '#6a8ab0', hair: '#aaa' } },
    { proto: 'bz_local', id: 'bz_juggler', name: 'Juggler', at: BZ.juggler, wander: 2, equip: [], look: { outfit: '#a83a2a', outfit2: '#e0c040', hairStyle: 'mohawk', hair: '#c83a2a' } },
    { proto: 'bz_localF', id: 'bz_kid1', name: 'Market Kid', at: BZ.kid1, wander: 6, look: { scale: 0.72, hairStyle: 'short' } },
    { proto: 'bz_local', id: 'bz_kid2', name: 'Market Kid', at: BZ.kid2, wander: 6, equip: [], look: { scale: 0.72, hairStyle: 'cap' } },
    { proto: 'bz_local', id: 'bz_shopper1', name: 'Shopper', at: BZ.shopper1, wander: 5 },
    { proto: 'bz_localF', id: 'bz_shopper2', name: 'Shopper', at: BZ.shopper2, wander: 5 },
    { proto: 'bz_localF', id: 'bz_shopper3', name: 'Shopper', at: BZ.shopper3, wander: 5, look: { skin: '#6a4028', hair: '#1a1a1a' } },
    { proto: 'bz_local', id: 'bz_shopper4', name: 'Pilgrim', at: BZ.shopper4, wander: 5, look: { hairStyle: 'hood', outfit: '#8a8a7a' } },
    { proto: 'bz_local', id: 'bz_beggar', name: 'Beggar', at: BZ.beggar, dialog: 'bz_beggar', equip: [], look: { outfit: '#5a5048', outfit2: '#3a3228', beard: true, hair: '#8a8a80', hairStyle: 'long' } },
    { proto: 'bz_localF', id: 'bz_shack2', name: 'Rag Row Mother', at: BZ.shack2Npc, look: { hairStyle: 'hood' } },
  ],
  onEnter: (c, first) => {
    if (first) c.msg('The Crossroads Bazaar sprawls where two dead highways cross: awnings in every colour the sun hasn\'t bleached yet, dust oxen lowing in the caravan yards, and a noise like a thousand people haggling at once, because it is.');
    if (c.flag('act2') && !c.flag('bz_act2Seen')) {
      c.set('bz_act2Seen');
      c.msg('The mood in the market has changed. Guards stand in pairs now, and the caravan yards are full of wagons that are not going anywhere.');
    }
  },
  onTick: (c) => ambientBarks(c, [
    ['bz_hawker0', ['Pepper! Salt! Something that is probably cumin!', 'Spice for the pot, spice for the soul!']],
    ['bz_hawker1', ['Cloth by the yard! Not much yard, but good cloth!']],
    ['bz_hawker2', ['Fixes while you wait! Waiting extra!', 'Power cells, almost full!']],
    ['bz_hawker3', ['Feel better, think faster, hit harder! Side effects are between you and your gods.']],
    ['bz_hawker4', ['Water! Clear as a baby\'s conscience!', 'Aqueduct prices, without the Aqueduct!']],
    ['bz_hawker5', ['Dust Ale! Brewed Tuesday! Which Tuesday? Don\'t ask!']],
    ['bz_hawker6', ['Spears, knives, pointy things of all kinds!']],
    ['bz_hawker7', ['Lucky charms! Unlucky charms, for your enemies!']],
    ['bz_preacher', ['The sky is open! Nothing is between you and it! Nothing!', 'The shelters were tombs we built for ourselves. Come out, come out into the light!', 'Look up, friends. Look up!']],
    ['bz_juggler', ['Behold! Three rusty knives! Four! Ow.', 'Coins for the juggler, coins for the juggler!']],
    ['bz_kid1', ['Race you to the well!', 'Mister, your pocket\'s open. Just saying.']],
    ['bz_kid2', ['I seen a Grafted once. It was THIS big.']],
    ['bz_shopper1', ['Robbery. Absolute robbery. I\'ll take two.']],
    ['bz_shopper2', ['Have you seen the prices at Brasswick\'s?']],
    ['bz_guardP1', ['Keep it moving.', 'No drawn steel in the market.']],
    ['bz_driver1', ['Not going east again. Not for double pay.', 'Oxen\'re spooked. They know.']],
    ['bz_driver2', ['Odessa\'s not sleeping. None of us are.']],
    ['bz_beggar', ['Spare a scrip for an old drover?']],
  ], 2),
});

// ------------------------------------------------------------------ object scripts

defineObjScripts({
  bz_notice: (c) => {
    c.msg('The notice board is layered with scraps: "LONGHAUL: DRIVERS WANTED. NOT EASTBOUND." / "REWARD for word of the wagons lost on the east road. See O. Crane." / "BEWARE LEAD SCRIP. Scratch before you accept. By order of the Provost." / "Lost: one dust ox, answers to Mabel."');
    if (c.questState('bz_caravans') === 'none') c.quest('bz_caravans', 'A notice at the Bazaar offers a reward for news of the caravans lost on the east road. See Odessa Crane at Longhaul Caravans, in the south-east yard.');
    return true;
  },
  bz_keeperSign: (c) => {
    c.msg('A neatly lettered placard: "THE KEEPERS OF THE ARCHIVE. We preserve what was, so that it may be again. Enquire within. No weapons at the table, please."');
    return true;
  },
  bz_armsSign: (c) => {
    c.msg('A sheet-steel sign with a crossed pair of rifles: "BRASSWICK ARMS. HONEST IRON SINCE BEFORE YOUR GRANDMOTHER."');
    return true;
  },
  bz_wagon: (c, _o, _u, skill) => {
    c.advance(10);
    if (!c.flag('bz_wagonSeen')) {
      c.set('bz_wagonSeen');
      c.msg('The wagon came back on its own, the drovers say: the oxen walked it home with nobody on the bench. The canvas is slashed, the cargo untouched. There is no blood to speak of. Under the driver\'s bench you find a scorched holotape.');
      c.give('bz_tape');
    }
    if (c.flag('bz_clueWagon')) {
      c.msg('You have learned all this wagon can tell you.');
      return true;
    }
    if (c.stat('PER') >= 7 || (skill === 'outdoorsman' ? c.roll('outdoorsman', -10) : c.roll('outdoorsman', 20))) {
      c.set('bz_clueWagon');
      c.give('bz_collarLink');
      c.xp(100);
      c.msg('You look closer. Deep gouges in the sideboards, too wide apart for human fingers. Drag marks in the dried mud on the wheels, where people dug their heels in and were pulled anyway. And jammed in the axle, a broken link of heavy iron chain with copper wire running through it, like a piece of an enormous collar. The mud on the wheels is the grey-white ash of the crater lands to the north-east.');
      c.quest('bz_caravans', 'The returned wagon shows people being dragged away alive by something with enormous hands. A broken iron collar link was jammed in the axle, and the wheels are caked in grey crater-land ash from the north-east.');
    } else {
      c.msg('Slashed canvas, scuffed boards, dried mud. Something about it bothers you, but you can\'t say what. (A sharper eye, or skill in the outdoors, might read more here.)');
    }
    return true;
  },
  bz_cage: (c) => {
    c.msg(c.flag('bz_scoutFreed') ? 'The cage door hangs open. Its prisoner is long gone.' : 'A cage of welded rebar, bolted to the ground. The Grafted inside barely fits.');
    return true;
  },
  'use:bz_tape': (c) => {
    import('../ui/pda').then((p) => p.addNote('LONGHAUL DRIVER\'S LOG (holotape, damaged)\nDay 3 east of the Bazaar. Radio\'s catching a signal we can\'t tune out. Sounds like singing. Big Ruth says turn it off. It is off.\nDay 4. Shapes on the ridge at dusk. Tall. Too tall. They keep pace with us.\nDay 4, night. They\'re not shooting. Why aren\'t they shooting. Ruth says they want the oxen. They don\'t want the oxen. They\'re walking past the oxen. They want\n[recording ends]'));
    c.msg('The tape crackles: a driver\'s voice, getting quieter and faster, describing tall shapes that walked past the oxen to take the people. It ends mid-word.');
    if (!c.flag('bz_clueTape')) {
      c.set('bz_clueTape');
      c.xp(50);
      c.quest('bz_caravans', 'A driver\'s holotape describes tall shapes that ignored the cargo and the oxen and took the people. A strange singing signal was on the radio.');
    }
    return true;
  },
});

defineDeathScripts({
  bz_odessa: (c) => {
    if (c.questState('bz_caravans') === 'active') c.questFail('bz_caravans', 'Odessa Crane is dead.');
  },
  bz_provost: (c) => {
    c.set('bz_provostDead');
  },
  bz_corvin: (c) => {
    c.set('bz_corvinDead');
    if (c.questState('bz_counterfeit') === 'active') c.questDone('bz_counterfeit', 'Corvin Brasswick, the counterfeiter, is dead. The lead scrip stops.');
  },
  bz_scout: (c) => {
    c.set('bz_scoutDead');
  },
  bz_juno: (c) => {
    c.set('bz_junoDead');
  },
});

// ------------------------------------------------------------------ dialogue

defineDialogues([
  // ----------------------------------------------------------- Odessa Crane
  {
    id: 'bz_odessa',
    start: (c) => {
      if (c.questState('bz_caravans') === 'done') return 'after';
      if (c.questState('bz_caravans') === 'active' && c.flag('bz_metOdessa')) return 'progress';
      return c.flag('bz_metOdessa') ? 'again' : 'hello';
    },
    nodes: {
      hello: {
        onEnter: (c) => c.set('bz_metOdessa'),
        text: 'A grey-haired woman with a drover\'s squint and a rifle leaning within easy reach is marking up a route map with a stub of charcoal, crossing out roads one after another.\n\n"Odessa Crane. Longhaul Caravans. If you want passage, we\'re not running east. If you want work, maybe. If you want to sell me something, the answer is no, whatever it is."',
        options: [
          { text: 'Why aren\'t you running east?', to: 'east' },
          { text: 'Where do your caravans go?', to: 'routes' },
          { text: 'Wagons go where?', lowInt: true, to: 'loweast' },
          { text: 'I\'ll leave you to it.', end: true },
        ],
      },
      again: {
        text: '"Back again. Still not running east."',
        options: [
          { text: 'Why aren\'t you running east?', to: 'east' },
          { text: 'Where do your caravans go?', to: 'routes' },
          { text: 'Wagons go where?', lowInt: true, to: 'loweast' },
          { text: 'Your new ox-hand. Is his name Tobin?', if: (c) => c.questState('rw_brother') === 'active' && !c.flag('rw_tobinFound'), to: 'tobin' },
          { text: 'Goodbye.', end: true },
        ],
      },
      routes: {
        onEnter: (c) => {
          c.reveal('rustwater');
          c.reveal('cinder_creek');
        },
        text: '"West to Rustwater, if you like your water brown and your sheriffs tired. North-west to Cinder Creek for grain, when there is grain. South to the Calder ruins, if you\'re brave or trade with the Withered, which is the same thing. Old Nessa can sell you the roads. I\'ll mark the easy ones."',
        options: [{ text: 'Thanks.', to: 'again' }],
      },
      tobin: {
        onEnter: (c) => {
          c.set('rw_tobinFound');
          c.quest('rw_brother', 'Tobin Penn is working as an ox-hand in the Longhaul Caravans yard at the Crossroads Bazaar.');
        },
        text: '"Red hair, elbows, laughs like a mule? That\'s Tobin. Works the corral for board and a pallet. Good with oxen, terrible with scrip. He\'s out in the yard."',
        options: [{ text: 'Thanks.', to: 'again' }],
      },
      east: {
        text: (c) => c.flag('act2')
          ? '"Because the east road eats wagons, and now I know what\'s doing the eating." She puts the charcoal down. "One of my outriders saw them two weeks back and lived, because she hid in a culvert all night. Grey giants with iron collars, walking the road like they own it. The Grafted. Everyone\'s heard the stories. Nobody in this market wants to say it out loud, because saying it makes it real and real is bad for trade."\n\n"What I don\'t know is where they take my people. And they do take them. We never find bodies."'
          : '"Because in two months I\'ve lost three caravans on the east road. Forty oxen, twenty-two drivers, and not one body." She taps the map. "Raiders leave bodies. Raiders leave the wagons burning and the oxen butchered. This? One wagon walked home on its own, empty. Whatever this is, it\'s tidy. I hate tidy."',
        options: [
          { text: 'I\'ll find out what\'s happening.', if: (c) => c.questState('bz_caravans') !== 'active', to: 'accept' },
          { text: 'Where should I start?', if: (c) => c.questState('bz_caravans') === 'active', to: 'leads' },
          { text: 'Sounds bad. Good luck.', end: true },
        ],
      },
      loweast: {
        text: 'She looks at you for a long moment. "Wagons go east. Wagons don\'t come back. People gone." She speaks slowly, not unkindly. "You find where people go, I pay you. Understand?"',
        options: [
          { text: 'Me find people! Get paid!', lowInt: true, to: 'accept' },
          { text: 'Bye.', lowInt: true, end: true },
        ],
      },
      accept: {
        onEnter: (c) => c.quest('bz_caravans', 'Odessa Crane will pay 500 scrip to learn what is taking her caravans on the east road. Leads: Ezra Tallow, a survivor drinking at the Tethered Ox; the wagon that came back empty in the Longhaul yard; and the thing in the cage by the yard wall.'),
        text: '"Five hundred scrip for an answer I can believe. Not a rumour, an answer." She counts on scarred fingers. "Three places to start. Ezra Tallow, the only driver who came back, is drinking himself stupid at the Tethered Ox. The wagon that walked home is in my yard; nobody\'s touched it. And there\'s the thing in the cage." Her mouth tightens. "My guards caught it near the east road. It hasn\'t said a word. Maybe it will to you."',
        options: [
          { text: 'I\'ll look into it.', end: true },
          { text: 'Me look!', lowInt: true, end: true },
        ],
      },
      leads: {
        text: '"Ezra, at the Tethered Ox, south-west of the crossing. The empty wagon, in the yard here. And the caged one by the back fence. Bring me something I can use."',
        options: [{ text: 'On it.', end: true }],
      },
      progress: {
        text: (c) => `"Well?" Odessa looks up from the map. ${clueCount(c) + (c.flag('bz_clueScout') ? 1 : 0) > 0 ? '"You look like someone with news."' : '"Nothing yet, I take it."'}`,
        options: [
          { text: 'The caged one talked. They take people alive, to Fort Kessler.', if: (c) => !!c.flag('bz_clueScout'), to: 'solve' },
          { text: 'Put it together: giants in iron collars, taking people alive and heading north-east. It\'s the Grafted.', if: (c) => !c.flag('bz_clueScout') && clueCount(c) >= 2, to: 'deduce' },
          { text: 'Grey giants take people! To craters!', lowInt: true, if: (c) => caravansReady(c), to: 'deduce' },
          { text: 'Here\'s what I have so far.', if: (c) => !caravansReady(c) && clueCount(c) > 0, to: 'partial' },
          { text: 'Remind me where to look.', to: 'leads' },
          { text: 'Your new ox-hand. Is his name Tobin?', if: (c) => c.questState('rw_brother') === 'active' && !c.flag('rw_tobinFound'), to: 'tobin' },
          { text: 'Where do your caravans go?', to: 'routes' },
          { text: 'Nothing yet.', end: true },
        ],
      },
      partial: {
        text: (c) => {
          const bits: string[] = [];
          if (c.flag('bz_clueSurvivor')) bits.push('Ezra\'s giants that carried people off alive');
          if (c.flag('bz_clueWagon')) bits.push('the drag marks and the collar link from the wagon');
          if (c.flag('bz_clueTape')) bits.push('the driver\'s tape about the singing on the radio');
          return `Odessa listens to you describe ${bits.join(', and ')}, and nods slowly. "It\'s something. It\'s not enough. Not enough to tell forty families where their people went. Keep digging."`;
        },
        options: [{ text: 'I will.', end: true }],
      },
      deduce: {
        onEnter: (c) => revealKessler(c, 'Odessa connected the clues: the only thing north-east in the crater lands is Fort Kessler, an old military base. That is where the Grafted take their captives.'),
        text: 'Odessa pulls the route map closer and runs her charcoal north-east from the road, past the last well, into the blank where the old maps just say CRATERS. There is one symbol out there, very small.\n\n"Crater ash. Collars. Taking people alive." Her voice is flat. "There\'s one place out there with walls, and it\'s been there since before the war. Fort Kessler. The old army base. I never sent a wagon within twenty miles of it."',
        options: [{ text: 'Then that\'s where they are.', to: 'solve' }],
      },
      solve: {
        onEnter: (c) => {
          revealKessler(c, 'The Grafted take caravan drivers alive, to Fort Kessler in the crater lands north-east of the Bazaar.');
          if (!c.flag('bz_caravansSolved')) {
            c.set('bz_caravansSolved');
            c.give('scrip', 500);
            c.rep('bazaar', 20);
            c.karma(20);
            c.questDone('bz_caravans', 'You told Odessa Crane the truth: the Grafted take drivers alive to Fort Kessler. She rerouted every caravan south.');
          }
        },
        text: (c) => `Odessa is quiet for a long time. Then she counts five hundred scrip onto the desk in neat stacks, the way she probably does everything.\n\n"Fort Kessler. Alive." She says it like she is trying to decide whether that is better or worse. "I'll reroute every wagon south, and I'll tell Sabine at the Aqueduct; her water carts use the same road. As for the ones they already took..." She looks at the map for a while. ${c.flag('act2') ? '"If you\'re going after whoever runs that place, and you look like you are, bring some of my drivers home. Please."' : '"Nobody in this market is going to storm an army base. Not for drivers. Not for anyone."'}`,
        options: [
          { text: 'I\'ll do what I can.', end: true },
          { text: 'Scrip! Thanks!', lowInt: true, end: true },
        ],
      },
      after: {
        text: (c) => `"${c.questState('vats') === 'done' ? 'Word came down the road: the fort at Kessler burned. Two of my drivers walked in last week. Thin, but alive. I owe you more than scrip.' : 'Southern routes are longer, but they come back. Thanks to you.'}"`,
        options: [
          { text: 'Where do your caravans go?', to: 'routes' },
          { text: 'Your new ox-hand. Is his name Tobin?', if: (c) => c.questState('rw_brother') === 'active' && !c.flag('rw_tobinFound'), to: 'tobin' },
          { text: 'Take care, Odessa.', end: true },
        ],
      },
    },
  },
  {
    id: 'bz_lhClerk',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => (c.flag('bz_caravansSolved') ? '"Southern routes, all of them. Longer. Safer. Odessa\'s happier. Well. Less unhappy."' : '"Manifests, manifests. Twenty-two drivers gone. I still write their names on the rosters. Habit."'),
        options: [{ text: 'Goodbye.', end: true }],
      },
    },
  },
  {
    id: 'bz_cageGuard',
    start: 'hello',
    nodes: {
      hello: {
        text: '"Don\'t get close to the bars. It hasn\'t tried anything, but it\'s the size of a door and I don\'t fancy finding out what it\'s thinking." He pats his rifle. "Odessa says it stays in the cage until somebody decides what to do with it."',
        options: [
          { text: 'Has it said anything?', to: 'said' },
          { text: 'I\'ll be careful.', end: true },
        ],
      },
      said: {
        text: '"Not a word. It hums sometimes, at night. Like it\'s listening to something none of us can hear." He shivers. "Gives me the creeps."',
        options: [{ text: 'I\'ll be careful.', end: true }],
      },
    },
  },
  // ----------------------------------------------------------- the caged Grafted
  {
    id: 'bz_scout',
    portrait: { bg: '#2a3a2a' },
    start: (c) => (c.flag('bz_scoutTalked') ? 'again' : 'hello'),
    nodes: {
      hello: {
        text: 'The thing in the cage is at least eight feet tall hunched over, grey-green skin stretched across slabs of muscle that don\'t sit where muscle should. An iron collar is welded shut around a neck like a tree stump, and a copper wire runs from it into the flesh behind one ear.\n\nIt watches you with small, very human eyes.',
        options: [
          { text: 'Can you understand me?', to: 'try' },
          { text: '[Speech] I\'m not one of Odessa\'s people and I\'m not one of yours. Talk to me and I\'ll see you get water.', skill: { key: 'speech', diff: 35 }, to: 'talk', fail: 'silent' },
          { text: 'Give it a canteen of water through the bars.', if: (c) => c.has('water') && !c.flag('bz_scoutWater'), to: 'water', do: (c) => { c.take('water'); c.set('bz_scoutWater'); c.karma(5); } },
          { text: '[Science] Examine the collar and the wire.', skill: { key: 'science', diff: 30 }, to: 'collar', fail: 'collarfail' },
          { text: 'You big. Where you take people?', lowInt: true, to: 'lowtalk' },
          { text: 'Leave it alone.', end: true },
        ],
      },
      try: {
        text: 'The eyes follow you. The huge chest rises and falls. It says nothing, but a muscle in its jaw jumps, as if it is working very hard to keep something inside.',
        options: [
          { text: '[Speech] Try again, gently.', skill: { key: 'speech', diff: 35 }, to: 'talk', fail: 'silent' },
          { text: 'Give it a canteen of water through the bars.', if: (c) => c.has('water') && !c.flag('bz_scoutWater'), to: 'water', do: (c) => { c.take('water'); c.set('bz_scoutWater'); c.karma(5); } },
          { text: 'Leave it alone.', end: true },
        ],
      },
      water: {
        text: 'A hand the size of a shovel takes the canteen from you with surprising delicacy. It drinks everything, slowly. Then it looks at you differently.\n\n"...Thank." The voice is a rockslide in a barrel. "Thank you."',
        options: [
          { text: 'Talk to me. Where do the Grafted take the people from the wagons?', to: 'talk' },
          { text: 'You\'re welcome.', end: true },
        ],
      },
      silent: {
        text: 'It turns its massive head away and hums, low and tuneless, like a man trying not to hear something.',
        options: [
          { text: 'Give it a canteen of water through the bars.', if: (c) => c.has('water') && !c.flag('bz_scoutWater'), to: 'water', do: (c) => { c.take('water'); c.set('bz_scoutWater'); c.karma(5); } },
          { text: 'Leave it alone.', end: true },
        ],
      },
      collar: {
        onEnter: (c) => c.set('bz_collarStudied'),
        text: 'Up close, the collar is not just iron. There is a receiver sealed inside it, pre-war military work, and the copper wire runs into the skull. Someone, somewhere, is broadcasting to this collar. The low hum it makes at night is not the Grafted. It is the Grafted listening.\n\nThe creature watches you study it. "...Hymn," it says quietly. "You hear it. Now."',
        options: [
          { text: 'The Hymn? Tell me about it.', to: 'talk' },
          { text: 'Step back.', end: true },
        ],
      },
      collarfail: {
        text: 'Iron, wire, and a smell of hot copper. Whatever the collar is, it is beyond you. The Grafted watches you fiddle with it, and you get the uncomfortable impression it is amused.',
        options: [{ text: 'Step back.', end: true }],
      },
      lowtalk: {
        onEnter: (c) => {
          c.set('bz_scoutTalked');
          c.set('bz_clueScout');
          revealKessler(c, 'The caged Grafted said: they take people to Fort Kessler, to the vats, to make more like him.');
        },
        text: 'The Grafted stares at you. Something like a smile moves across the ruin of its face. It answers slowly, as if to a friend.\n\n"FORT. KESS-LER." A finger points north-east. "Big pots. People go in small." The finger touches its own chest. "Come out big."',
        options: [
          { text: 'Oh. Bad pots.', lowInt: true, to: 'again' },
          { text: 'Bye big man.', lowInt: true, end: true },
        ],
      },
      talk: {
        onEnter: (c) => {
          c.set('bz_scoutTalked');
          c.set('bz_clueScout');
          c.xp(100);
          revealKessler(c, 'The caged Grafted, who remembers being a man named Ober, said the Grafted take captives alive to Fort Kessler to be dipped in "the vats". A signal he calls the Hymn tells them what to do.');
        },
        text: 'For a long while it says nothing. When the words come, they come one at a time, as if each has to be carried up from somewhere deep.\n\n"Was... Ober. Before. Drove oxen. Like them." It nods at the corral. "Taken. Like them. Kessler. The fort in the glow. Vats. Green, and warm. You go in small. You come out..." It lifts its enormous hands and looks at them.\n\n"Hymn says: bring them. Bring them alive. Hymn is always talking. Always. Here." It touches the collar.',
        options: [
          { text: 'Who sends the Hymn?', to: 'hymn' },
          { text: 'Why take people alive?', to: 'alive' },
          { text: 'Would you like to get out of there?', to: 'free' },
          { text: 'Thank you, Ober.', end: true },
        ],
      },
      alive: {
        text: '"Need people. For vats. More Grafted." It pauses. "Hymn wants... sealed ones most. People from holes. Pure, Hymn says. Pure stock." The small eyes settle on your jumpsuit, and stay there. "You. Hymn would want you."',
        options: [
          { text: 'Who sends the Hymn?', to: 'hymn' },
          { text: 'Good to know.', to: 'again' },
        ],
      },
      hymn: {
        onEnter: (c) => {
          if (c.flag('act2')) {
            c.reveal('cathedral');
            c.quest('grafted', 'The caged Grafted at the Bazaar says the Hymn comes from "the glass place" on the southern cliffs. Old Nessa called it the Glass Cathedral.');
          }
        },
        text: (c) => `"Don't know. Far." It turns its head slowly, like a compass needle, and points south, past the Bazaar, past everything. "South. Glass place, on the cliffs. Sings. Always sings."${c.flag('act2') ? ' It shudders. "The Shepherd. Hymn says Shepherd. Shepherd loves us. Shepherd loves us." It says it twice, the way a child repeats a lesson, and then it is silent.' : ''}`,
        options: [
          { text: 'Would you like to get out of there?', to: 'free' },
          { text: 'Thank you, Ober.', end: true },
        ],
      },
      again: {
        text: (c) => (c.flag('bz_scoutFreed') ? '' : 'Ober watches you from the cage. "...Hymn is loud today," he says.'),
        options: [
          { text: 'Tell me again about Kessler.', to: 'talk' },
          { text: 'Would you like to get out of there?', to: 'free' },
          { text: 'Bye.', end: true },
        ],
      },
      free: {
        text: '"Out." It considers this. "Hymn would call me. Back. To Kessler." A long pause. "But... slowly. Hymn is quiet, far from the road. Maybe I walk west. Maybe the Hymn forgets me." It looks at the lock. "Maybe."',
        options: [
          { text: 'Unlock the cage with the guard\'s key.', if: (c) => c.has('bz_cageKey'), to: 'freed' },
          { text: '[Lockpick] Work the cage lock quietly.', skill: { key: 'lockpick', diff: 30 }, to: 'freed', fail: 'lockfail' },
          { text: 'Not today.', end: true },
        ],
      },
      lockfail: {
        text: 'The lock is old, rusted and stubborn, and your picks slip twice. The cage guard glances your way. You stop, and whistle, and look at the sky.',
        options: [{ text: 'Walk away.', end: true }],
      },
      freed: {
        onEnter: (c) => {
          c.set('bz_scoutFreed');
          c.karma(30);
          c.xp(100);
          c.fade('Later that night, the cage stands open.');
          c.remove('bz_scout');
        },
        text: 'You leave the lock hanging open, and wait until dark. By morning the cage is empty, and there are huge bare footprints in the dust leading west, away from the road, away from everything.\n\nOdessa is going to be furious. Some things are worth it.',
        options: [{ text: 'Good luck, Ober.', any: true, end: true }],
      },
    },
  },
  // ----------------------------------------------------------- Ezra, the survivor
  {
    id: 'bz_ezra',
    start: (c) => (c.flag('bz_clueSurvivor') ? 'again' : 'hello'),
    nodes: {
      hello: {
        text: 'A man with a grubby bandage wound around his head sits with his back to the wall and his face to the door. He flinches when your shadow falls across his table and his hand goes to an empty holster.',
        options: [
          { text: 'You were with the lost caravan?', to: 'ask' },
          { text: 'You scared?', lowInt: true, to: 'lowask' },
          { text: 'Sorry to bother you.', end: true },
        ],
      },
      ask: {
        text: '"Don\'t want to talk about it." He stares into his cup. "Buy a round, or leave me be. Either way, don\'t ask."',
        options: [
          { text: '[Speech] Nobody else believes you, do they? I might.', skill: { key: 'speech', diff: 25 }, to: 'tell', fail: 'refuse' },
          { text: 'Here. Have a Dust Ale on me.', if: (c) => c.has('beer'), to: 'tell', do: (c) => c.take('beer') },
          { text: '[Doctor] That bandage is filthy. Let me see to your head first.', skill: { key: 'doctor', diff: 15 }, to: 'tellDoc', fail: 'refuse' },
          { text: 'I\'ll leave you be.', end: true },
        ],
      },
      lowask: {
        text: 'He looks at you, and something in his face relaxes, maybe because you look as lost as he feels. "Yeah," he says. "Yeah, I\'m scared. You want to know why?"',
        options: [{ text: 'Yes. Tell.', lowInt: true, to: 'tell' }],
      },
      refuse: {
        text: '"I said I don\'t want to talk about it." He turns his shoulder to you.',
        options: [
          { text: 'Here. Have a Dust Ale on me.', if: (c) => c.has('beer'), to: 'tell', do: (c) => c.take('beer') },
          { text: 'Fine.', end: true },
        ],
      },
      tellDoc: {
        onEnter: (c) => c.karma(5),
        text: 'You clean the wound and wrap it properly. He winces, then sighs. "That\'s... better. Thanks." He looks at you properly for the first time. "All right. You want to know what happened. I\'ll tell you."',
        options: [{ text: 'Go on.', to: 'tell' }],
      },
      tell: {
        onEnter: (c) => {
          if (!c.flag('bz_clueSurvivor')) {
            c.set('bz_clueSurvivor');
            c.xp(75);
            c.quest('bz_caravans', 'Ezra Tallow survived by hiding under a wagon: grey giants with collars took the drivers alive, carried them off "like sacks of meal", and walked north-east, toward the craters.');
          }
        },
        text: '"Fourth night out. I was under the lead wagon, fixing a strap, when it went quiet. You know that kind of quiet? The oxen stopped chewing." He drinks. "They came out of the dark. Grey. Big as the wagons, near enough, with iron collars round their necks. No guns out. They didn\'t need guns."\n\n"They picked up Big Ruth like a sack of meal. She was fighting, screaming. They didn\'t hit her. They were... careful. Like she was eggs. They took everyone that way. Then they walked off north-east, toward the craters, carrying them." He puts the cup down. "They didn\'t want our cargo. They wanted us."',
        options: [
          { text: 'Thank you, Ezra. That helps.', to: 'again' },
          { text: 'Did you hear anything? See anything else?', to: 'more' },
        ],
      },
      more: {
        text: '"The radio. We had it off, I swear on my mother, and it was still humming. Like singing, from far away. When they walked off, the singing went with them."',
        options: [{ text: 'Thank you.', end: true }],
      },
      again: {
        text: '"Still here. Still not going east. Ask Odessa if you need to know more; I told you all I\'ve got."',
        options: [{ text: 'Take care, Ezra.', end: true }],
      },
    },
  },
  // ----------------------------------------------------------- Water: Sabine Orrow
  {
    id: 'bz_sabine',
    start: (c) => (c.flag('bz_waterSent') ? 'after' : c.flag('bz_metSabine') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('bz_metSabine'),
        text: 'A tall woman in a blue coat with silver buttons, every one polished, rises from behind a desk covered in contracts. "Factor Sabine Orrow, of the Aqueduct Company. We sell water by the jug, the barrel, the tank, or the caravan. What are you thirsty for?"',
        options: [
          { text: 'I need water hauled to a shelter in the Ember Hills.', to: 'haul' },
          { text: 'Need lots water. For home.', lowInt: true, to: 'haul' },
          { text: 'Just a canteen or two.', barter: true, any: true },
          { text: 'Nothing for now.', end: true },
        ],
      },
      again: {
        text: '"Welcome back. Have you reconsidered our caravan service?"',
        options: [
          { text: 'Let\'s talk about the water caravan.', to: 'haul' },
          { text: 'Need lots water!', lowInt: true, to: 'haul' },
          { text: 'I\'ll buy a canteen or two.', barter: true, any: true },
          { text: 'Goodbye.', end: true },
        ],
      },
      haul: {
        onEnter: (c) => {
          if (c.questState('water_delivery') === 'none') c.quest('water_delivery', 'The Aqueduct Company at the Crossroads Bazaar can send one water caravan to Shelter 29, for 1500 scrip. Factor Sabine Orrow might be talked down, or do it cheaper for a favour.');
        },
        text: (c) => `She unrolls a map, finds the Ember Hills, and whistles softly. "That\'s rough country. Water for four hundred people, sixty days\' worth: that\'s one full caravan, eight tankers, forty oxen, and twelve armed drivers who will want danger money." She writes a figure and turns the paper towards you.\n\n"${waterPrice(c)} scrip. One trip, paid in advance. We don't do credit; the desert doesn't do credit."`,
        options: [
          { text: (c) => `Here\'s ${waterPrice(c)} scrip. Send the caravan.`, if: (c) => c.scrip() >= waterPrice(c), to: 'deal' },
          { text: '[Barter] You\'d be driving empty tankers home either way. The return leg is free for you. Knock off the difference.', if: (c) => !c.flag('bz_barterTried'), skill: { key: 'barter', diff: 45 }, to: 'haggleok', fail: 'hagglefail', do: (c) => c.set('bz_barterTried') },
          { text: '[Speech] Shelter 29 has four hundred people who\'ll need water for years. Here\'s the Warden\'s sealed letter. Think of this as the first contract.', if: (c) => c.has('wardenLetter') && !c.flag('bz_speechTried'), skill: { key: 'speech', diff: 30 }, to: 'letterok', fail: 'letterfail', do: (c) => c.set('bz_speechTried') },
          { text: 'I\'m the one who found out what\'s been taking wagons on the east road.', if: (c) => !!c.flag('bz_caravansSolved') && !c.flag('bz_favourTold'), to: 'favour' },
          { text: 'Sheriff Grell of Rustwater will vouch for me.', if: (c) => !!c.flag('rw_grellSaved') && !c.flag('bz_grellTold'), to: 'grell' },
          { text: 'Me pay water! Here scrip!', lowInt: true, if: (c) => c.scrip() >= waterPrice(c), to: 'deal' },
          { text: 'Too rich for me right now.', end: true },
        ],
      },
      haggleok: {
        onEnter: (c) => c.set('bz_barterWater'),
        text: '"The return leg." She taps her pen against her teeth. "You\'re not wrong, and I dislike people who are not wrong." She crosses out the figure and writes a smaller one. "Eleven hundred. Don\'t tell anyone in the market."',
        options: [{ text: 'Let\'s go over it again.', to: 'haul' }],
      },
      hagglefail: {
        text: '"The oxen drink going home too," she says pleasantly. "And the drivers eat. And the Company\'s shareholders eat very well indeed. The price is the price."',
        options: [{ text: 'Let\'s go over it again.', to: 'haul' }],
      },
      letterok: {
        onEnter: (c) => c.set('bz_speechWater'),
        text: 'She reads the Warden\'s letter twice, then holds it up to the light to look at the seal. "A sealed shelter, opening its doors, looking for a water supplier." You can almost hear her calculating. "Twelve hundred, as a gesture of future friendship. I expect Shelter 29 to remember it."',
        options: [{ text: 'Let\'s go over it again.', to: 'haul' }],
      },
      letterfail: {
        text: '"A very nice letter. I\'m sure your Warden is a very nice woman." She hands it back. "Nice letters don\'t feed oxen."',
        options: [{ text: 'Let\'s go over it again.', to: 'haul' }],
      },
      favour: {
        onEnter: (c) => c.set('bz_favourTold'),
        text: '"Odessa told me." For the first time, her smile looks real. "My water carts run that road too. I lost two tankers and five drivers to whatever it was, and you\'re the reason I\'ll lose no more. Seven hundred and fifty, which is what it costs me. Consider it a favour returned."',
        options: [{ text: 'Let\'s go over it again.', to: 'haul' }],
      },
      grell: {
        onEnter: (c) => c.set('bz_grellTold'),
        text: '"Amos Grell? He\'s the only honest man who ever cost me money." She sighs. "Thirteen hundred and fifty. His word\'s worth that much, and not a scrip more."',
        options: [{ text: 'Let\'s go over it again.', to: 'haul' }],
      },
      deal: {
        onEnter: (c) => {
          const price = waterPrice(c);
          if (!c.pay(price)) return;
          c.set('bz_waterSent');
          c.set('bz_waterPaid', price);
          c.addWaterDays(60);
          c.questDone('water_delivery', `The Aqueduct Company sent a water caravan to Shelter 29, for ${price} scrip. Sixty more days.`);
          c.xp(250);
        },
        text: 'She counts the scrip twice, locks it in a strongbox, and rings a bell. Within the hour the yard is full of shouting drovers, groaning tankers and oxen objecting to everything.\n\n"Sixty days of water to the Ember Hills," she says, signing the manifest with a flourish. "Your people will have it within the week. Pleasure doing business with Shelter 29."',
        options: [{ text: 'Thank you.', end: true }],
      },
      after: {
        text: '"The caravan came back safely, and your Warden sent a very polite receipt. I like her." She folds her hands. "If you need more water, it\'s the jug and barrel price from now on. The Company only does favours once."',
        options: [
          { text: 'I\'ll buy a canteen or two.', barter: true, any: true },
          { text: 'Goodbye.', end: true },
        ],
      },
    },
  },
  {
    id: 'bz_aqClerk',
    start: 'hello',
    nodes: {
      hello: {
        text: '"Aqueduct Company. We bring water from the old reservoir at Silt Hollow, forty miles of pipe and bucket and prayer. If you want to buy, speak to the Factor. If you want to complain, also speak to the Factor. She loves that."',
        options: [{ text: 'Thanks.', end: true }],
      },
    },
  },
  // ----------------------------------------------------------- Old Nessa, maps
  {
    id: 'bz_nessa',
    start: (c) => (c.flag('bz_metNessa') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('bz_metNessa'),
        text: 'A tiny old woman is almost buried under drifts of paper: maps on cloth, maps on hide, maps on the backs of pre-war advertisements for things nobody remembers. "Maps!" she says, before you speak. "Maps of places, maps of places that used to be places, and one map of a place I made up when I was bored. Nobody\'s found out yet. What are you after, dear?"',
        options: [
          { text: 'Show me what you\'ve got.', to: 'again' },
          { text: 'Where big broken city?', lowInt: true, to: 'lowcalder' },
          { text: 'Just browsing.', end: true },
        ],
      },
      again: {
        text: '"Well? What\'ll it be?"',
        options: [
          { text: 'I\'m looking for Calder City. The old one, with a transit station.', if: (c) => !c.flag('bz_nessaCalder'), to: 'calder' },
          { text: 'What other places do you know?', to: 'places' },
          { text: 'Where are the Keepers of the Archive?', if: (c) => !c.flag('bz_nessaArchive'), to: 'archive' },
          { text: 'Have you heard of a glass dome on the southern cliffs?', if: (c) => !!c.flag('act2') && !c.flag('bz_nessaDome'), to: 'dome' },
          { text: 'What about Fort Kessler?', if: (c) => !!c.flag('act2'), to: 'kessler' },
          { text: 'Where big broken city?', lowInt: true, if: (c) => !c.flag('bz_nessaCalder'), to: 'lowcalder' },
          { text: 'Goodbye, Nessa.', end: true },
        ],
      },
      calder: {
        text: '"Calder!" She burrows into a drift and comes up with a square of oilcloth. "South-east of here, three days if your boots are good. Towers snapped off like old teeth. The Withered live there now, in the station concourse. Very good map. Very accurate. One hundred scrip."',
        options: [
          { text: 'Deal. (100 scrip)', if: (c) => c.scrip() >= 100, to: 'calderSold', do: (c) => c.pay(100) },
          { text: '[Barter] A hundred for a map of a ruin everyone knows about? Sixty.', if: (c) => !c.flag('bz_nessaHaggle'), skill: { key: 'barter', diff: 20 }, to: 'calderCheap', fail: 'calderNo', do: (c) => c.set('bz_nessaHaggle') },
          { text: 'Too rich for me.', to: 'again' },
        ],
      },
      calderCheap: {
        text: '"Sixty! Robbery! Highway robbery, and I would know, I have maps of all the highways." She sniffs. "Fine. Sixty. You have an honest face, or at least a face."',
        options: [
          { text: 'Here. (60 scrip)', if: (c) => c.scrip() >= 60, to: 'calderSold', do: (c) => c.pay(60) },
          { text: 'I don\'t have it right now.', to: 'again' },
        ],
      },
      calderNo: {
        text: '"A hundred, dear. Maps don\'t draw themselves. Well, one did, but it was cursed."',
        options: [
          { text: 'Fine. (100 scrip)', if: (c) => c.scrip() >= 100, to: 'calderSold', do: (c) => c.pay(100) },
          { text: 'Maybe later.', to: 'again' },
        ],
      },
      calderSold: {
        onEnter: (c) => {
          c.set('bz_nessaCalder');
          c.reveal('calder');
          if (c.questState('hydrocore') === 'active') c.quest('hydrocore', 'Old Nessa at the Bazaar sold you the way to the Calder Ruins, south-east of the Bazaar. Shelter 7 is supposed to lie beneath the old transit station.');
        },
        text: '"There you are." She traces the road with a fingernail. "Mind the outer streets; there are Withered there who aren\'t right in the head any more. The ones in the concourse are fine, if you\'re polite. Say please. They like please."',
        options: [{ text: 'Thanks, Nessa.', to: 'again' }],
      },
      lowcalder: {
        onEnter: (c) => {
          c.set('bz_nessaCalder');
          c.reveal('calder');
        },
        text: 'She looks at you over her spectacles for a long moment, then her face softens. "Oh, bless you. Here, dear. No charge." She takes your wrist and taps the map into your wrist-link, very slowly, the way you would show a child. "Big broken city. There. Follow the road. Don\'t eat anything that glows."',
        options: [
          { text: 'Thank you, map lady!', lowInt: true, end: true },
        ],
      },
      places: {
        onEnter: (c) => {
          c.reveal('rustwater');
          c.reveal('cinder_creek');
          c.reveal('vultures_roost');
        },
        text: '"Everybody knows Rustwater, west of here, all scrap and rust and a casino that eats people\'s money. And Cinder Creek, the farming village up in the north-west. Those two I\'ll give you for free; I\'d be ashamed to charge." She lowers her voice. "And the raiders\' nest up north, Vultures\' Roost, so you know where not to go. Also free. I\'m sentimental about my customers not dying."',
        options: [{ text: 'Thanks.', to: 'again' }],
      },
      archive: {
        onEnter: (c) => {
          c.set('bz_nessaArchive');
          c.reveal('archive');
        },
        text: '"The book-hoarders? North-east, in a concrete bunker with a door thicker than I am tall. Their recruiter is right outside, dear, she\'d tell you anyway, so I won\'t charge. They\'re frightfully polite. I don\'t trust anyone that polite."',
        options: [{ text: 'Thanks.', to: 'again' }],
      },
      dome: {
        text: '"Oh, you don\'t want to go there." She says it like a fact. "It\'s an old observatory on the southern cliffs, all glass and steel. The caravaners call it the Glass Cathedral, because there\'s singing coming out of it at night, and people who go to listen don\'t come back. I\'ll sell you the way. A hundred and fifty scrip, and I\'ll feel bad about it."',
        options: [
          { text: 'Here. (150 scrip)', if: (c) => c.scrip() >= 150, to: 'domeSold', do: (c) => c.pay(150) },
          { text: 'Not now.', to: 'again' },
        ],
      },
      domeSold: {
        onEnter: (c) => {
          c.set('bz_nessaDome');
          c.reveal('cathedral');
        },
        text: '"South-west, then south, to the cliffs. You\'ll see it glinting from a day away." She looks up at you. "Come back and tell me what\'s inside. I\'d like to know before I die, and I\'d rather not find out the way the others did."',
        options: [{ text: 'I will.', to: 'again' }],
      },
      kessler: {
        text: '"Crater country, north-east of the east road. I don\'t draw maps of places that glow; the ink goes funny." She shivers. "If you need to know what\'s out there, ask Odessa Crane at Longhaul. Her wagons were vanishing out that way."',
        options: [{ text: 'Thanks.', to: 'again' }],
      },
    },
  },
  // ----------------------------------------------------------- Keepers recruiter
  {
    id: 'bz_keeper',
    start: (c) => (c.flag('bz_metKeeper') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('bz_metKeeper'),
        text: 'A young woman in a grey hooded tabard sits very upright behind a folding table stacked with pamphlets, each one hand-copied. "Good day. I am Scribe-Initiate Mireille Tan, of the Keepers of the Archive. We preserve the knowledge of the world that was, so that the world that is might someday deserve it." She says this in one breath, clearly for the hundredth time today.',
        options: [
          { text: 'Who exactly are the Keepers?', to: 'who' },
          { text: 'Book people? Me like pictures.', lowInt: true, to: 'low' },
          { text: 'Not interested.', end: true },
        ],
      },
      again: {
        text: '"Welcome back. Have you considered the Archive\'s offer of enlightenment? It remains open. Our door, however, remains closed, except to those who are invited."',
        options: [
          { text: 'Who exactly are the Keepers?', to: 'who' },
          { text: 'Where is your Archive?', to: 'where' },
          { text: 'How does one join?', to: 'join' },
          { text: 'What do the Keepers know about the Grafted?', if: (c) => !!c.flag('act2'), to: 'grafted' },
          { text: 'Pictures?', lowInt: true, to: 'low' },
          { text: 'Goodbye.', end: true },
        ],
      },
      who: {
        text: '"We are an order of scholars, founded in the second decade after the war by the survivors of a university library. We collect pre-war technology and texts, we repair what can be repaired, and we record what cannot." She hesitates. "We are sometimes accused of hoarding. We prefer \'curating\'."',
        options: [
          { text: 'Where is your Archive?', to: 'where' },
          { text: 'How does one join?', to: 'join' },
        ],
      },
      where: {
        onEnter: (c) => c.reveal('archive'),
        text: '"North-east of the Bazaar, in a bunker built to survive the war, which it did. I have marked it on your device." She peers at your wrist-link with naked professional interest. "That is a Holloway-Brandt personal terminal. Pre-war. Working. May I...? No. Of course not. Forgive me."',
        options: [{ text: 'Thanks.', to: 'again' }],
      },
      join: {
        text: '"Petitioners are received by the Scribe-Commander, who sets a trial. Usually it involves retrieving something the Archive values from somewhere unpleasant." She smiles thinly. "It is always somewhere unpleasant. The pleasant places were looted a long time ago."',
        options: [{ text: 'I see.', to: 'again' }],
      },
      grafted: {
        text: '"I am not senior enough to know much." She lowers her voice anyway. "But I have copied reports for the senior scribes. They are very interested in an old military installation in the crater lands, and in a radio signal from somewhere to the south. They argue about it at night, when they think the initiates are asleep. If you want real answers, go to the Archive. Tell them Initiate Tan sent you. It won\'t help, but it will make me feel important."',
        options: [{ text: 'Thanks, Mireille.', to: 'again' }],
      },
      low: {
        onEnter: (c) => c.reveal('archive'),
        text: 'She blinks. Then, to her credit, she finds a pamphlet with an illustration of a very large building and a very small door and shows it to you. "The Archive. Here." She taps your wrist-link. "Go there. Lots of pictures. Some of them move."',
        options: [{ text: 'Pictures that move!', lowInt: true, end: true }],
      },
    },
  },
  // ----------------------------------------------------------- Juno Kale
  {
    id: 'bz_juno',
    start: (c) => (c.partyHas('bz_juno') ? 'party' : c.flag('bz_junoHired') ? 'rehire' : 'hello'),
    nodes: {
      hello: {
        text: 'A lean woman with close-cropped hair sits with her boots on a table and a long scoped rifle across her knees. There is a bruise going yellow along her jaw. "Juno Kale. I shoot things for money. Not people I\'m drinking with, so relax."',
        options: [
          { text: 'I might be in the market for a rifle.', to: 'hire' },
          { text: 'What happened to your face?', to: 'face' },
          { text: 'You shoot good?', lowInt: true, to: 'lowhire' },
          { text: 'Maybe later.', end: true },
        ],
      },
      face: {
        onEnter: (c) => {
          c.set('bz_clueJuno');
          if (c.questState('bz_counterfeit') !== 'done') startCounterfeit(c, 'Juno Kale at the Tethered Ox was paid in lead scrip for escort work by Corvin Brasswick, of Brasswick Arms. She was beaten for passing it before she knew.');
        },
        text: '"Got paid for a month of escort work by a sweet-faced boy from Brasswick Arms. Corvin. Tipped me extra, even." She touches the bruise. "Spent the tip at a cloth stall. The tip was lead with paint on it. The stallholder\'s cousins explained that to me at length."\n\n"Now the Provost thinks I\'m the one passing it, and I\'m not allowed to leave the Bazaar until somebody finds out who is. So I sit here, and I drink, and I think about Corvin Brasswick\'s sweet face."',
        options: [
          { text: 'I might be in the market for a rifle.', to: 'hire' },
          { text: 'I\'ll see what I can find out.', end: true },
        ],
      },
      hire: {
        text: (c) => `"Four hundred scrip, up front, and I keep what I loot off anything I shoot. I don't do hostages, I don't do children, and I don't do anything involving the Hymn-folk without a very long talk first." ${c.questState('bz_counterfeit') === 'done' && !c.flag('bz_blackmail') ? 'She pauses. "Although. You\'re the one who cleared my name with the Provost. I owe you."' : ''}`,
        options: [
          { text: 'You cleared your debt to me. Come along, no charge.', if: (c) => c.questState('bz_counterfeit') === 'done' && !c.flag('bz_blackmail'), to: 'joinFree' },
          { text: 'Four hundred. Deal.', if: (c) => c.scrip() >= 400, to: 'join', do: (c) => c.pay(400) },
          { text: '[Barter] Three hundred, and first pick of the loot after that.', if: (c) => !c.flag('bz_junoHaggle'), skill: { key: 'barter', diff: 30 }, to: 'haggle', fail: 'nohaggle', do: (c) => c.set('bz_junoHaggle') },
          { text: 'Too rich for me right now.', end: true },
        ],
      },
      haggle: {
        text: '"Three hundred." She considers you. "Fine. You\'ve got the look of someone who gets into interesting trouble, and I\'m bored."',
        options: [
          { text: 'Three hundred. Deal.', if: (c) => c.scrip() >= 300, to: 'join', do: (c) => c.pay(300) },
          { text: 'I\'ll come back with the scrip.', end: true },
        ],
      },
      nohaggle: {
        text: '"Four hundred. My rifle doesn\'t haggle and neither do I."',
        options: [
          { text: 'Four hundred. Deal.', if: (c) => c.scrip() >= 400, to: 'join', do: (c) => c.pay(400) },
          { text: 'Maybe later.', end: true },
        ],
      },
      lowhire: {
        text: 'She smiles, puts a coin on her knee, flicks it into the air, and puts a hole through it before it lands, without seeming to aim. The whole inn jumps. "Yeah. I shoot good. Four hundred scrip and I shoot good for you."',
        options: [
          { text: 'Me pay! Here scrip!', lowInt: true, if: (c) => c.scrip() >= 400, to: 'join', do: (c) => c.pay(400) },
          { text: 'You friend now. Come free?', lowInt: true, if: (c) => c.questState('bz_counterfeit') === 'done' && !c.flag('bz_blackmail'), to: 'joinFree' },
          { text: 'No scrip. Bye.', lowInt: true, end: true },
        ],
      },
      joinFree: {
        onEnter: (c) => {
          c.set('bz_junoFree');
          c.set('bz_junoHired');
          c.recruit('bz_juno');
        },
        text: '"No charge." She swings her boots off the table and slings the rifle. "Don\'t get used to it. And if anybody asks, I charged you double."',
        options: [{ text: 'Welcome aboard.', any: true, end: true }],
      },
      join: {
        onEnter: (c) => {
          c.set('bz_junoHired');
          c.recruit('bz_juno');
        },
        text: '"Pleasure." She pockets the scrip, checks the rifle\'s action, and stands. "Rules: I don\'t walk point, I don\'t carry your junk, and if you tell me to shoot something, I will. So think first."',
        options: [{ text: 'Welcome aboard.', any: true, end: true }],
      },
      party: {
        text: (c) => ['Juno squints at the horizon. "Well? Where are we going?"', 'Juno is cleaning her rifle for the third time today. "What?"', '"You know, most employers don\'t make conversation." Juno doesn\'t look up. "I don\'t hate it."'][c.random(3)],
        options: [
          { text: 'How are you holding up?', to: 'talk' },
          ...companionOptions('bz_juno'),
        ],
      },
      talk: {
        text: (c) => c.flag('act2') ? '"Grafted. Great big collared Grafted." She checks the rifle. "Aim for the collar wire behind the ear. Heard that from a drover. If it\'s not true, aim for the eyes. That\'s always true."' : '"I\'m being paid to walk around in the sun and shoot things. It\'s the dream."',
        options: [{ text: 'Let\'s go.', any: true, end: true }],
      },
      rehire: {
        text: '"Back again? I kept your seat warm. Well. I sat in it."',
        options: [
          { text: 'Come with me again.', any: true, end: true, do: (c) => c.recruit('bz_juno') },
          { text: 'Not now.', end: true },
        ],
      },
    },
  },
  // ----------------------------------------------------------- Pell
  {
    id: 'bz_pell',
    start: (c) => (c.flag('bz_metPell') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('bz_metPell'),
        text: 'A comfortable grey-bearded man in a leather apron beams at you over a counter stacked with tins, jars and coiled rope. "Ambrose Pell, of Pell\'s Provisions! If you can eat it, drink it, tie it, light it or bandage with it, I sell it. If you can shoot it, go next door to Brasswick\'s, and give Oswin my regards. He hates that."',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'What\'s the news in the market?', to: 'rumour' },
          { text: 'Me buy food!', lowInt: true, barter: true },
          { text: 'Maybe later.', end: true },
        ],
      },
      again: {
        text: '"Back again! What can Pell\'s provide?"',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'What\'s the news in the market?', to: 'rumour' },
          { text: 'Where can I go from here?', to: 'places' },
          { text: 'Heard anything about bad scrip?', if: (c) => c.questState('bz_counterfeit') !== 'done' && !c.flag('bz_pellFake'), to: 'fake' },
          { text: 'Goodbye, Pell.', end: true },
        ],
      },
      rumour: {
        text: (c) => {
          const pool = [
            '"Caravans lost on the east road, and Odessa Crane is offering good scrip for answers. Nobody\'s taking the job. That tells you something."',
            '"The Aqueduct Company will haul water anywhere, for a price that will make your eyes water, which is ironic."',
            '"Old Nessa sells maps. Some of them are even of real places."',
            '"The Keepers\' recruiter is back, handing out pamphlets. Nobody reads them but the goats."',
            '"Lead scrip in the market. Scratch every token before you take it; I learned that the hard way."',
            c.flag('act2') ? '"People whisper about the Grafted now. Big grey fellows. You never used to hear the word here. Now you can\'t stop hearing it."' : '"Juno Kale, the mercenary, is sitting in the Tethered Ox with nothing to do. I\'d hire her, if I had anything worth shooting."',
          ];
          return `Pell leans on the counter. ${pool[c.random(pool.length)]}`;
        },
        options: [
          { text: 'Anything else?', to: 'rumour' },
          { text: 'Thanks.', to: 'again' },
        ],
      },
      places: {
        onEnter: (c) => {
          c.reveal('rustwater');
          c.reveal('cinder_creek');
        },
        text: '"Rustwater, west, if you like your water brown. Cinder Creek, north-west, if you like your farmers honest and your beds full of straw. For anywhere farther, see Old Nessa. Her shop\'s just past mine, the one with the paper blowing out the door."',
        options: [{ text: 'Thanks.', to: 'again' }],
      },
      fake: {
        onEnter: (c) => {
          c.set('bz_pellFake');
          c.give('bz_fakeScrip');
          startCounterfeit(c, 'Ambrose Pell gave you a counterfeit scrip token: lead, painted to look like aluminium. He got it from a Longhaul teamster, Hobb Linden, who drinks at the Tethered Ox. Provost Brandt, near the north road, wants the source found.');
        },
        text: '"Bad scrip? I\'ve got a jar of it." He fishes out a token and drops it into your palm; it\'s heavier than it should be. "Scratch it. Lead. Painted lead. Came in with a teamster, Hobb Linden. He swears he got it honest. Hobb drinks at the Tethered Ox, when he isn\'t driving." He shakes his head. "The Provost\'s hunting whoever\'s making it. There\'s a reward, and a market full of people who\'d like a word with the culprit, preferably in an alley."',
        options: [{ text: 'I\'ll look into it.', to: 'again' }],
      },
    },
  },
  // ----------------------------------------------------------- Provost Ilka Brandt
  {
    id: 'bz_provost',
    start: (c) => (c.flag('bz_metProvost') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('bz_metProvost'),
        text: 'A broad-shouldered woman with a blonde braid and an assault rifle hung at her side looks up from a ledger. "Provost Ilka Brandt. I keep the peace in the Bazaar, which means the merchant houses pay me to stop them killing each other. Keep your weapon holstered and your hands out of other people\'s pockets, and we\'ll get along."',
        options: [
          { text: 'Any trouble I can help with?', to: 'trouble' },
          { text: 'What are the rules here?', to: 'rules' },
          { text: 'You boss?', lowInt: true, to: 'low' },
          { text: 'Understood.', end: true },
        ],
      },
      again: {
        text: '"Something I can do for you?"',
        options: [
          { text: 'Any trouble I can help with?', if: (c) => c.questState('bz_counterfeit') === 'none', to: 'trouble' },
          { text: 'Corvin Brasswick is making the lead scrip. Here\'s his mould.', if: (c) => c.questState('bz_counterfeit') === 'active' && hasEvidence(c), to: 'arrest' },
          { text: 'Corvin Brasswick is making the lead scrip.', if: (c) => c.questState('bz_counterfeit') === 'active' && !hasEvidence(c) && corvinSuspect(c), to: 'noproof' },
          { text: 'Me find fake scrip maker! Here thing!', lowInt: true, if: (c) => c.questState('bz_counterfeit') === 'active' && hasEvidence(c), to: 'arrest' },
          { text: 'What are the rules here?', to: 'rules' },
          { text: 'Goodbye.', end: true },
        ],
      },
      low: {
        text: '"Yes. I\'m the boss. Of the guards." She speaks slowly. "No stealing. No hitting. You understand?" You nod. "Good. Somebody\'s making bad scrip. Heavy, grey inside. If you find who, you tell me."',
        options: [
          { text: 'Me find bad scrip man!', lowInt: true, to: 'accept' },
          { text: 'Bye.', lowInt: true, end: true },
        ],
      },
      rules: {
        text: '"No drawn weapons in the market. No theft. No fighting, unless it\'s a formal duel with a merchant house\'s blessing, which nobody\'s asked for in nine years. You hurt somebody here, every guard in the Bazaar will be looking for you, and so will I."',
        options: [{ text: 'Clear enough.', to: 'again' }],
      },
      trouble: {
        text: '"Always." She closes the ledger. "Somebody\'s passing counterfeit scrip. Lead tokens, painted. It\'s poison to a market: once people stop trusting the scrip, they start trusting knives instead. I\'ve arrested two people who were only passing it on, one of them a mercenary who I\'m fairly sure is innocent and entirely sure is annoyed."\n\n"Find me the source. Not a rumour: something I can hold. A hundred and fifty scrip, and the Bazaar\'s gratitude, which is worth more than it sounds."',
        options: [
          { text: 'I\'ll find your counterfeiter.', to: 'accept' },
          { text: 'Not my problem.', to: 'again' },
        ],
      },
      accept: {
        onEnter: (c) => startCounterfeit(c, 'Provost Ilka Brandt wants the source of the counterfeit scrip, with proof. Ambrose Pell has seen some; Juno Kale, at the Tethered Ox, was arrested for passing it.'),
        text: '"Good. Start with Pell, he\'s been complaining loudest. And talk to Juno Kale at the Tethered Ox; she was paid in the stuff, and she\'ll talk to you, because she won\'t talk to me."',
        options: [{ text: 'On it.', end: true }],
      },
      noproof: {
        text: '"Corvin? Oswin Brasswick\'s nephew?" She lets out a long breath. "If I drag a Brasswick through the market on hearsay, the house will have my badge by sundown and my head by Tuesday. Bring me something I can hold. A mould, a press, a sack of blanks."',
        options: [{ text: 'I\'ll find it.', end: true }],
      },
      arrest: {
        onEnter: (c) => {
          c.take('bz_mould');
          c.set('bz_corvinArrested');
          c.remove('bz_corvin');
          c.give('scrip', 150);
          c.karma(10);
          c.rep('bazaar', 15);
          c.questDone('bz_counterfeit', 'You gave Provost Brandt the token mould. Corvin Brasswick was arrested, and the lead scrip stopped.');
        },
        text: 'She turns the mould over in her hands. "A Bazaar assay stamp, cut by somebody who knew exactly what they were doing." Her jaw sets. "Right."\n\nAn hour later, two guards walk Corvin Brasswick through the market in chains, while his uncle stands in the door of Brasswick Arms with a face like a closed fist. The Provost counts out your reward. "You\'ve made an enemy of the house, I\'m afraid. And a friend of every honest stallholder. On balance, I\'d take that trade."',
        options: [{ text: 'So would I.', end: true }],
      },
    },
  },
  // ----------------------------------------------------------- Brasswicks
  {
    id: 'bz_oswin',
    start: (c) => (c.flag('bz_corvinArrested') ? 'cold' : c.flag('bz_metOswin') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('bz_metOswin'),
        text: 'A big bald man with a white beard spread across a leather vest looks you over the way he would inspect a rifle: action, barrel, stock, price. "Oswin Brasswick. Brasswick Arms has sold honest iron in this market for three generations. If it fires, cuts or stops a bullet, I have it, or I know who stole it from me."',
        options: [
          { text: 'Let\'s see your stock.', barter: true, any: true },
          { text: 'Tell me about Brasswick Arms.', to: 'house' },
          { text: 'Me want big gun!', lowInt: true, barter: true },
          { text: 'Just looking.', end: true },
        ],
      },
      again: {
        text: '"Back for more iron?"',
        options: [
          { text: 'Let\'s see your stock.', barter: true, any: true },
          { text: 'Tell me about Brasswick Arms.', to: 'house' },
          { text: 'Your nephew is casting counterfeit scrip. Here\'s his mould. I came to you first.', if: (c) => c.questState('bz_counterfeit') === 'active' && hasEvidence(c), to: 'private' },
          { text: 'Know anything about the lead scrip going around?', if: (c) => c.questState('bz_counterfeit') === 'active' && !hasEvidence(c), to: 'deny' },
          { text: 'Goodbye.', end: true },
        ],
      },
      house: {
        text: '"My grandfather dug a cache of pre-war rifles out of a collapsed armoury and sold them one at a time for forty years. My father added the ammunition trade. I added armour." He glances at a lanky young man restocking shelves. "My nephew Corvin will add... something. Eventually. Possibly."',
        options: [{ text: 'I see.', to: 'again' }],
      },
      deny: {
        text: '"I\'ve heard. Every trader has heard." His face doesn\'t change, but his hand tightens on the counter. "Brasswick Arms pays in good aluminium and always has. If anyone says otherwise, they can say it to me."',
        options: [{ text: 'Understood.', to: 'again' }],
      },
      private: {
        text: 'Oswin looks at the mould for a long time. Then he looks at Corvin, across the shop, who has gone the colour of chalk. Then he looks at you.\n\n"You came to me. Not to the Provost." His voice is very quiet. "Why?"',
        options: [
          { text: 'Because it\'s your family, and your name. Deal with it, destroy the mould, pay back the people he cheated, and the Provost gets told the source is gone.', to: 'deal' },
          { text: 'Because I wanted to see your face. Now I\'m going to the Provost.', to: 'again' },
        ],
      },
      deal: {
        onEnter: (c) => {
          c.take('bz_mould');
          c.set('bz_oswinFavour');
          c.give('scrip', 250);
          c.give('metalArmor');
          c.rep('bazaar', 5);
          c.questDone('bz_counterfeit', 'Oswin Brasswick dealt with his nephew privately, melted the mould, and repaid the stallholders. The Provost was told the source is gone, and she decided to believe it.');
        },
        text: '"Done." Oswin drops the mould into the forge behind the counter and holds it there with tongs until it slumps. "Every cheated stallholder will be paid back, double. Corvin will be scrubbing out powder barrels until his beard goes grey, and he\'ll be grateful he has a beard." He turns back to you and pushes a folded suit of plate across the counter, then a stack of scrip. "Brasswick Arms remembers its friends. That\'s the other thing we\'ve done for three generations."',
        options: [{ text: 'Pleasure.', end: true }],
      },
      cold: {
        text: 'Oswin Brasswick looks at you with no expression at all. "Buy what you need, then leave. Brasswick Arms serves everyone. It doesn\'t have to like them."',
        options: [
          { text: 'Let\'s see your stock.', barter: true, any: true },
          { text: 'Fine.', end: true },
        ],
      },
    },
  },
  {
    id: 'bz_corvin',
    start: (c) => (c.flag('bz_oswinFavour') ? 'scrubbing' : c.flag('bz_blackmail') ? 'paid' : 'hello'),
    nodes: {
      hello: {
        text: 'A lanky young man with long hair and ink-stained fingers is restocking cartridge boxes, badly. He smiles quickly at you, the way people do when they want you to go away. "Corvin Brasswick. Uncle Oswin handles the customers. I handle... boxes."',
        options: [
          { text: '[Speech] Juno Kale says you paid her in lead. Hobb Linden says the same. Want to tell me about it before I tell the Provost?', if: (c) => corvinSuspect(c) && c.questState('bz_counterfeit') === 'active', skill: { key: 'speech', diff: 35 }, to: 'confess', fail: 'deny' },
          { text: 'I found your mould in the storeroom, Corvin.', if: (c) => hasEvidence(c) && c.questState('bz_counterfeit') === 'active', to: 'caught' },
          { text: 'You make bad scrip?', lowInt: true, if: (c) => c.questState('bz_counterfeit') === 'active', to: 'lowask' },
          { text: 'Carry on.', end: true },
        ],
      },
      lowask: {
        text: 'Corvin drops a box of cartridges. They go everywhere. "No! What? Who told you... No." He is sweating. "Go away. Please."',
        options: [{ text: 'Hm.', lowInt: true, end: true, do: (c) => c.set('bz_clueTeamster') }],
      },
      deny: {
        text: '"Lead? I don\'t know what you\'re... Juno Kale is a mercenary. Hobb Linden is a drunk. Who are you going to believe?" His voice cracks on "believe".',
        options: [{ text: 'We\'ll see.', end: true }],
      },
      confess: {
        text: 'Corvin glances at his uncle across the shop, then drags you behind a rifle rack. "All right. All right! I owe money. A lot of money. To Silas Mott, in Rustwater. I played cards at the Rivet, and I lost, and I kept playing to win it back, and..." He swallows. "His collectors said they\'d take fingers. I cut a mould. I\'m good with steel, it\'s the only thing I\'m good at. I thought if I just paid Mott off, nobody would ever know."',
        options: [
          { text: 'Mott is finished. You don\'t owe him anything now.', if: (c) => !!(c.flag('rw_mottDead') || c.flag('rw_mottExiled') || c.flag('rw_mottJailed')), to: 'mottgone' },
          { text: 'Give me the mould. I\'ll decide what happens to you.', to: 'giveMould' },
          { text: 'Pay me two hundred and fifty scrip, and I forget this conversation.', to: 'blackmail' },
          { text: 'Tell your uncle, or I will.', to: 'uncle' },
        ],
      },
      caught: {
        text: 'Corvin looks at the mould in your hand, and all the colour leaves his face. "Oh no. Oh, no no no." He drags you behind a rifle rack. "Please. I owe Silas Mott in Rustwater more than I\'ll earn in five years. His collectors said they\'d take fingers. I only needed to pay him off. Please don\'t take it to the Provost."',
        options: [
          { text: 'Pay me two hundred and fifty scrip, and I forget I found it.', to: 'blackmail' },
          { text: 'That\'s between you, your uncle and the Provost.', end: true },
        ],
      },
      mottgone: {
        text: 'Corvin stares at you. "Finished? Mott\'s... then I don\'t..." He sits down on a crate of cartridges and starts to laugh, or possibly cry. "I don\'t owe anyone anything." He wipes his eyes. "Except everybody I paid in lead. Right. Right. What do you want me to do?"',
        options: [
          { text: 'Give me the mould. I\'ll decide what happens to you.', to: 'giveMould' },
          { text: 'Tell your uncle, or I will.', to: 'uncle' },
        ],
      },
      giveMould: {
        onEnter: (c) => {
          if (!c.has('bz_mould')) c.give('bz_mould');
          c.quest('bz_counterfeit', 'Corvin Brasswick confessed and handed over his token mould. Take it to Provost Brandt, or to his uncle Oswin if you would rather the house dealt with it.');
        },
        text: 'Corvin fetches a heavy two-piece mould from a strongbox in the back room and hands it over as if it burned him. "Whatever you do," he says, "please, do it quickly."',
        options: [{ text: 'We\'ll see.', end: true }],
      },
      uncle: {
        onEnter: (c) => {
          if (!c.has('bz_mould')) c.give('bz_mould');
          c.quest('bz_counterfeit', 'Corvin Brasswick confessed and handed over his mould. Show it to his uncle Oswin, or to Provost Brandt.');
        },
        text: '"Uncle Oswin will kill me." He considers. "Slowly. With a ledger." He fetches a heavy steel mould from the back room and presses it into your hands. "You show him. I can\'t. I\'ll be here. Probably hiding."',
        options: [{ text: 'Fine.', end: true }],
      },
      blackmail: {
        onEnter: (c) => {
          c.set('bz_blackmail');
          c.give('scrip', 250);
          c.karma(-40);
          c.questFail('bz_counterfeit', 'You took Corvin Brasswick\'s hush money. The lead scrip keeps flowing, and Juno Kale stays under suspicion.');
        },
        text: 'Corvin goes very still. Then he counts out two hundred and fifty scrip from a hidden pocket. You scratch every token. They\'re all real. "That\'s everything," he says, in a small flat voice. "I hope you choke on it."',
        options: [{ text: 'Pleasure doing business.', end: true }],
      },
      paid: {
        text: 'Corvin won\'t look at you.',
        options: [{ text: 'Leave.', end: true }],
      },
      scrubbing: {
        text: 'Corvin is scrubbing out a powder barrel with a wire brush, black to the elbows. "Uncle says I\'ll be doing this for a year. It\'s the best thing that\'s ever happened to me." He seems to mean it.',
        options: [{ text: 'Keep scrubbing.', end: true }],
      },
    },
  },
  // ----------------------------------------------------------- the Tethered Ox
  {
    id: 'bz_marta',
    start: 'hello',
    nodes: {
      hello: {
        text: '"Welcome to the Tethered Ox! Beds, beer, and a roof that only leaks when it rains, which is never." Marta Quell wipes the bar with a rag that has seen things. "What can I do you for?"',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'I need a bed for the night. (25 scrip)', if: (c) => c.scrip() >= 25, to: 'sleep', do: (c) => c.pay(25) },
          { text: 'Heard any news?', to: 'news' },
          { text: 'Who\'s the woman with the rifle?', to: 'juno' },
          { text: 'Sleep? Bed?', lowInt: true, if: (c) => c.scrip() >= 25, to: 'sleep', do: (c) => c.pay(25) },
          { text: 'Maybe later.', end: true },
        ],
      },
      sleep: {
        onEnter: (c) => {
          c.fade('You sleep like the dead, which in the Basin is a compliment.');
          c.advance(480);
          c.heal(999);
        },
        text: 'A narrow bed with a straw mattress and, luxury of luxuries, a real pillow. You wake eight hours later feeling almost human.',
        options: [{ text: 'Thanks, Marta.', end: true }],
      },
      news: {
        onEnter: (c) => {
          c.reveal('rustwater');
          c.reveal('cinder_creek');
        },
        text: (c) => ['"Folk from Rustwater say their sheriff and the casino boss are at each other\'s throats. That town\'s west of here, all car bodies and bad water."', '"Farmers from Cinder Creek were in last month, selling their seed corn. That\'s bad. You don\'t sell your seed corn unless you\'ve given up on next year."', '"Ezra Tallow, the drover in the corner, came back from the east road alone. He won\'t talk about it. Not to me, anyway."', '"Hobb Linden drinks on credit and pays in scrip that\'s heavier than it ought to be. Nobody\'s said anything yet."'][c.random(4)],
        options: [
          { text: 'Anything else?', to: 'news' },
          { text: 'Thanks.', to: 'hello' },
        ],
      },
      juno: {
        text: '"Juno Kale. Mercenary. Best shot I\'ve ever seen, and I\'ve seen a lot of people shoot at a lot of things in here." Marta lowers her voice. "The Provost won\'t let her leave the Bazaar. Something about bad scrip. If you want her rifle, you might have to clear her name first. Or pay her. She takes payment."',
        options: [{ text: 'Thanks.', to: 'hello' }],
      },
    },
  },
  {
    id: 'bz_hobb',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A heavy-set teamster with a beard like a bramble hedge nurses a mug of ale. "Hobb Linden. Drove oxen for Longhaul for twenty years. Not driving now. Nobody\'s driving east."',
        options: [
          { text: 'Pell says you paid him in lead scrip.', if: (c) => c.questState('bz_counterfeit') === 'active' && !c.flag('bz_clueTeamster'), to: 'lead' },
          { text: 'Why is nobody driving east?', to: 'east' },
          { text: 'You pay bad scrip?', lowInt: true, if: (c) => c.questState('bz_counterfeit') === 'active' && !c.flag('bz_clueTeamster'), to: 'lead' },
          { text: 'Take care.', end: true },
        ],
      },
      lead: {
        onEnter: (c) => {
          c.set('bz_clueTeamster');
          c.quest('bz_counterfeit', 'Hobb Linden got his lead scrip as escort pay from Brasswick Arms, handed out by Oswin\'s nephew, Corvin Brasswick. Corvin keeps a strongbox in the Brasswick storeroom.');
        },
        text: '"Lead? I never..." He digs in his pocket, takes out a token, and scratches it with a thumbnail. Grey shows through. His face falls. "Well, I\'ll be. That\'s my escort pay, that is. From Brasswick Arms. The young one handed it out, Corvin, the nephew, with a big smile." He scratches another. And another. "All of it. Every scrip of it."\n\n"That boy spends half his day in the Brasswick storeroom with the door locked. I thought he was drinking. Maybe he wasn\'t."',
        options: [{ text: 'Thanks, Hobb.', end: true }],
      },
      east: {
        text: '"Three caravans gone. My brother-in-law was on the second one." He drinks. "Odessa\'s put a price on answers. If you\'re going to try, talk to Ezra in the corner. He saw it. He just won\'t say what."',
        options: [{ text: 'I\'m sorry.', end: true }],
      },
    },
  },
  // ----------------------------------------------------------- Tobin Penn (Rustwater quest)
  {
    id: 'rw_tobin',
    start: (c) => (c.questState('rw_brother') === 'active' ? 'hello' : 'nobody'),
    nodes: {
      nobody: {
        text: 'A red-haired young man is forking hay to the oxen. "Hi. Mind the big one, she kicks. She kicks me, anyway."',
        options: [{ text: 'I\'ll mind her.', end: true }],
      },
      hello: {
        onEnter: (c) => {
          if (!c.flag('rw_tobinFound')) {
            c.set('rw_tobinFound');
            c.quest('rw_brother', 'You found Tobin Penn working as an ox-hand at the Longhaul yard in the Crossroads Bazaar.');
          }
        },
        text: 'The red-haired young man freezes with a forkful of hay in his hands. "You\'re... you\'ve come from Rustwater. Haven\'t you. Corliss sent you." He puts the fork down very carefully. "I can\'t go back. I owe Mott two hundred scrip I don\'t have, and I lost her roof. Our roof. I can\'t look at her."',
        options: [
          { text: '[Speech] She doesn\'t care about the roof. She cares that you\'re breathing. She told me herself.', skill: { key: 'speech', diff: 25 }, to: 'home', fail: 'stubborn' },
          { text: 'Here\'s two hundred scrip. Pay Mott and go home.', if: (c) => c.scrip() >= 200 && !(c.flag('rw_mottDead') || c.flag('rw_mottExiled') || c.flag('rw_mottJailed')), to: 'home', do: (c) => { c.pay(200); c.karma(15); } },
          { text: 'Mott\'s finished. Nobody\'s collecting that debt now.', if: (c) => !!(c.flag('rw_mottDead') || c.flag('rw_mottExiled') || c.flag('rw_mottJailed')), to: 'home' },
          { text: 'Sister sad. Go home.', lowInt: true, to: 'lowhome' },
          { text: 'Suit yourself.', end: true },
        ],
      },
      stubborn: {
        text: '"You don\'t know her. She\'ll say it doesn\'t matter and then she\'ll look at the ceiling every time it rains." He picks up the fork again. "I\'ll send money. When I have it. Tell her that."',
        options: [
          { text: 'Here\'s two hundred scrip. Pay Mott and go home.', if: (c) => c.scrip() >= 200 && !(c.flag('rw_mottDead') || c.flag('rw_mottExiled') || c.flag('rw_mottJailed')), to: 'home', do: (c) => { c.pay(200); c.karma(15); } },
          { text: 'Mott\'s finished. Nobody\'s collecting that debt now.', if: (c) => !!(c.flag('rw_mottDead') || c.flag('rw_mottExiled') || c.flag('rw_mottJailed')), to: 'home' },
          { text: 'I\'ll tell her.', end: true },
        ],
      },
      lowhome: {
        text: 'Tobin looks at you, and his lip wobbles. "She\'s sad?" You nod. "Sad sad? Not angry?" You shake your head, then nod, then shake it again. He laughs, wetly. "Yeah. That\'s Corliss. All right. All right, I\'ll go."',
        options: [{ text: 'Good!', lowInt: true, to: 'home' }],
      },
      home: {
        onEnter: (c) => {
          c.set('rw_tobinHome');
          c.set('rw_tobinFound');
          c.xp(100);
          c.quest('rw_brother', 'Tobin Penn is going home to Rustwater. Corliss will want to see you.');
          c.remove('rw_tobin');
        },
        text: 'Tobin stands there for a moment, blinking hard. Then he hangs the hay fork on its nail, shakes your hand far too long, and goes to tell Odessa he is quitting. By the time you look back, he is already walking west along the road, and not in his good boots.',
        options: [{ text: 'Safe travels, Tobin.', any: true, end: true }],
      },
    },
  },
  // ----------------------------------------------------------- flavour
  {
    id: 'bz_guard',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => [
          '"Provost\'s rules: no drawn weapons, no thieving, no fighting. Break one and you\'ll meet all of us."',
          '"Keep moving, stranger. Market\'s that way. It\'s every way, really."',
          c.flag('act2') ? '"Doubled the watch since the caravans stopped coming back. Can\'t say I blame the Provost."' : '"Quiet day. Only two stabbings, and one was an accident."',
        ][c.random(3)],
        options: [
          { text: 'Where do I find the Provost?', to: 'provost' },
          { text: 'Understood.', end: true },
        ],
      },
      provost: {
        text: '"The adobe post by the north road, near the notice board. Knock first. She hates being surprised."',
        options: [{ text: 'Thanks.', end: true }],
      },
    },
  },
  {
    id: 'bz_hawker',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => ['"Best prices in the Bazaar! Second-best, at worst!"', '"Look, don\'t touch. Unless you\'re buying. Then touch."', '"For you, friend, a special price. It\'s the same price, but I\'ll say it warmly."', '"Everything here is genuine. Genuinely something."'][c.random(4)],
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'Just looking.', end: true },
        ],
      },
    },
  },
  {
    id: 'bz_preacher',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A woman in a sun-bleached white robe spreads her arms wide at the enormous sky. "Sister Calloway, of the Open Sky! Look up, friend. Look UP. For eighty years people cowered in holes and tombs and shelters, afraid of the sky. The sky did nothing to us! We did it to ourselves! Now the sky is open, and nothing stands between us and it."',
        options: [
          { text: 'I came out of one of those holes.', to: 'hole' },
          { text: 'What about the Grafted?', if: (c) => !!c.flag('act2'), to: 'grafted' },
          { text: 'Okay, sky lady.', lowInt: true, end: true },
          { text: 'Excuse me.', end: true },
        ],
      },
      hole: {
        onEnter: (c) => {
          if (!c.flag('bz_calloway')) {
            c.set('bz_calloway');
            c.karma(2);
          }
        },
        text: 'She takes your face in both hands, which is unexpected, and looks into your eyes. "Then welcome, child. Welcome to the world. It\'s very big, and very bright, and it will try to kill you. But it\'s yours." She lets go and beams. "Don\'t go back in."',
        options: [{ text: 'I have to. For a while.', end: true }],
      },
      grafted: {
        text: 'Her smile falters for the first time. "There are people who say there\'s a church on the southern cliffs, all glass, that sings to the grey giants. They say its preacher wants to put everyone in a new skin." She shakes her head. "Every faith gets its heretics. I just never thought ours would come with iron collars."',
        options: [{ text: 'Thank you, Sister.', end: true }],
      },
    },
  },
  {
    id: 'bz_beggar',
    start: 'hello',
    nodes: {
      hello: {
        text: 'An old man with a drover\'s whip coiled around his waist, though he has no oxen, holds out a cracked cup. "Spare a scrip for an old drover? Lost my team on the east road, four years back, before it was fashionable."',
        options: [
          { text: 'Here, take ten scrip.', if: (c) => c.scrip() >= 10, to: 'thanks', do: (c) => { c.pay(10); if (!c.flag('bz_beggarGift')) { c.set('bz_beggarGift'); c.karma(5); } } },
          { text: 'What happened on the east road?', to: 'east' },
          { text: 'Sorry.', end: true },
        ],
      },
      thanks: {
        text: '"Bless you. May your water always be clear and your oxen always stupid enough not to wander." He tucks the scrip away. "Here\'s a tip for free: the returned wagon in Longhaul\'s yard. Look at the wheels, not the wagon. Wheels tell you where a thing has been."',
        options: [{ text: 'Thanks.', end: true }],
      },
      east: {
        text: '"Didn\'t see a thing. Woke up and the oxen were standing there, calm as you like, and my partner was gone. Tracks the size of wagon wheels, going north-east." He shrugs. "Nobody believed me then. They\'re starting to now."',
        options: [{ text: 'I believe you.', end: true }],
      },
    },
  },
]);

// ------------------------------------------------------------------ endings

defineEndings([
  {
    order: 40,
    title: 'Crossroads Bazaar',
    scene: 'city',
    text: (c) => {
      const parts: string[] = [];
      if (c.flag('bz_caravansSolved')) {
        parts.push(c.questState('vats') === 'done'
          ? 'Longhaul Caravans ran the southern roads for a decade. When the fort at Kessler fell, Odessa Crane sent wagons north to bring home the drivers who had survived it, and paid every one of them a full year\'s wages for the time they had been gone.'
          : 'Longhaul Caravans rerouted south and survived, though the east road stayed empty for a generation, and Odessa Crane never stopped writing the names of her lost drivers on the rosters.');
      } else {
        parts.push('The caravans kept vanishing on the east road until the Bazaar\'s merchant houses stopped sending them, and the market shrank by half before anyone learned why.');
      }
      if (c.flag('bz_corvinArrested')) parts.push('Corvin Brasswick served three years breaking rocks for the Provost. Brasswick Arms never forgave the stranger who turned him in, and never again paid in anything but the best aluminium.');
      else if (c.flag('bz_oswinFavour')) parts.push('Oswin Brasswick melted down his nephew\'s mould and repaid every cheated trader double. Corvin, humbled, became the finest gunsmith in the Basin, and the scrip of the Bazaar was trusted from Rustwater to Calder.');
      else if (c.flag('bz_blackmail')) parts.push('The lead scrip kept circulating for another year, until a riot at the cloth stalls left three people dead and Corvin Brasswick hanging from the Longhaul gate.');
      if (c.flag('bz_waterSent')) parts.push('The Aqueduct Company\'s water caravan reached the Ember Hills in good order, and Shelter 29 became its most loyal customer for fifty years.');
      if (c.flag('bz_scoutFreed')) parts.push('Travellers in the western hills spoke for years of a huge grey figure who kept to himself, dug wells for lost drovers, and flinched at the sound of any radio.');
      return parts.join(' ');
    },
  },
  {
    order: 92,
    title: 'Juno Kale',
    scene: 'years',
    text: (c) => {
      if (!c.flag('bz_junoHired')) return null;
      if (c.flag('bz_junoDead') || c.flag('dead:bz_juno')) return 'Juno Kale died with her rifle in her hands, which is how she would have wanted it, though she would have preferred it to happen much later and somewhere with shade.';
      if (c.flag('party:bz_juno')) return 'Juno Kale stayed at your side long after the scrip stopped mattering. When she finally hung up her rifle, it was in the rafters of an inn she bought with her savings at the Bazaar, where she told the story of the Grafted to anyone who would buy her a drink, and improved it every time.';
      return 'Juno Kale went back to selling her rifle to whoever could afford it. She never took a job against Shelter 29, and turned down three that were offered.';
    },
  },
]);
