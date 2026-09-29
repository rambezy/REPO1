// Rustwater: a walled scrap town. Sheriff Grell, casino boss Silas Mott, Doc Sato's
// clinic, the Tin Cup bar and Bramble the scrapyard dog.
//
// Global flags set here (other areas may read them):
//   rw_grellSaved  - the player sided with the sheriff and Mott's plot was broken
//   rw_grellDead   - Sheriff Grell is dead (the staged robbery, or otherwise)
//   rw_mottDead / rw_mottExiled / rw_mottJailed - how Silas Mott ended up
//   rw_mottJob     - the player took Mott's money for the hit
//   rw_hitDone     - the player helped Mott kill Grell
//   rw_tobinHome   - Tobin Penn went home to his sister (quest rw_brother)
//   rw_brambleFriend - Bramble the dog joined the player
// Map generated with a small Python script (rows and coordinates kept in sync).

import { defineMap, defineDialogues, defineQuests, defineObjScripts, defineDeathScripts, defineEndings } from './registry';
import { defineItems } from '../data/items';
import { defineProtos, S } from '../data/protos';
import type { Ctx, DialogueOption } from '../game/types';
import { G } from '../game/G';

const RW_ROWS = [
  "ssssssssssssssssssssssssssssssssssssssssssssosssssssssss",
  "ssssvssssssssssvssssvsssvsssssvsssssssssssssssvsssssssss",
  "ssssss%####%##%%#######%#####%%#%##%##########%#%##%%#ss",
  "ssssss#..............::.............:::\";............#ss",
  "sssoss#..;...........::.WWWWWWWWWWWW:::..........\"...#ss",
  "ssssss%..BBBBBBBBBBBB::.WwwwWwwwwwwW:::.%%%%%%%%%%%%.#ss",
  "ssssss#.;BccccBcccccB::.WwwwDwwwwwwW:::.%=====%====%.#ss",
  "ssssss%..BccccCcccccB::.WwwwWwwwwwwW:::;%=====%====%.#ss",
  "ssssss#..BccccBcccccB::.WWWWWwwwwwwW:::.%=====%====%.#ss",
  "ssvsos#..BBBBBBcccccB::.WwwwwwwwwwwW:::.%=====%%C%%%.#ss",
  "ssssss#..BccccBcccccB::.WwwwwwwwwwwW:::.%==========%.#sv",
  "ssssss%..BccccBcccccB::\"WwwwwwwwwwwW:::.%==========%.#ss",
  "ssssss#..BccccCcccccB::.WwwwwwwwwwwW:::.%==========%.%vs",
  "ssssss%..BccccBcccccB::.WwwwwwwwwwwW:::.%==========%.#so",
  "ssvsss#..BBBBBBBBCBBB::.WwwwwwwwwwwW:::.%%%%C%%%%%%%.#ss",
  "ssvsss#..............::.WWWWWWDWWWWW:::.............\"#ss",
  "ssssss#......;.......::.............:::..............#ss",
  ">sssss%.....\"........::.............:::.....;........%ss",
  ">sssss#.\"............::...........;.:::..............#ss",
  ">sssss%..............::.............:::..............#ss",
  ">,,,,,,,,,,,x,,,,,,,,,,,,,,,,,,,,,,,,,,,,,x,,,,,,,,,,,ss",
  ">,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,ss",
  ">,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,ss",
  ">,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,ss",
  ">,,,,,,,,,,,,,,,,,,,,,,,,,,,,x,,,,x,x,,,,,,,,,,,,x,,,,ss",
  ">sssss%..;............;.......................\"......#ss",
  ">sssos#..................\".......;.\";................#ss",
  ">vsvss#..\".;..........\"..\".....\"..\".\";.....FFFjjjFFFF#ss",
  "ssssss#.WWWDWW.WWDWWW;..%%%%%%%%K%%%%%%%%%.Fjjjjjjjjj#ss",
  "ssssos%.WwwwwW.WwwwwW...%kkkkkkkkkkkkkkkk%.Fjjjjjjjjj%sv",
  "ssssss#.WwwwwW.WwwwwW.;.%kkkkkkkkkkkkkkkk%.Fjjjjjjjjj%ss",
  "ssssss#.WwwwwW.WwwwwW...%kkkkkkkkkkkkkkkk%.Fjjjjjjjjj#ss",
  "ssssss#.WwwwwW.WwwwwW...%kkkkkkkkkkkkkkkk%.Fjjjjjjjjj#ss",
  "ssssss%.WWWWWW.WWWWWW...%kkkkkkkkkkkkkkkk%.Fjjjjjjjjj%ss",
  "ssssso%.;...............%kkkkkkkkkk%%%%%%%.Fjjjjjjjjj%ss",
  "ssssvs#.######.BBBCBBB.;%kkkkkkkkkk%kkkkk%\"Fjjjjjjjjj#ss",
  "ssssvs%.#wwww#.BcccccB..%kkkkkkkkkk%kkkkk%.Fjjjjjjjjj%ss",
  "ssssss#.#wwwwD.BcccccB..%kkkkkkkkkk%kkkkk%.Fjjjjjjjjj%ss",
  "ssvsss%.#wwww#.BBBCBBB..%kkkkkkkkkkKkkkkk%.FjjjjWWWWW%ss",
  "ssssss%.#wwww#.BcccccB..%kkkkkkkkkk%kkkkk%.FjjjjWwwwW%ss",
  "ssssss#.######.BcccccB..%kkkkkkkkkk%kkkkk%.FjjjjDwwwW#ss",
  "vssvss#..\".....BBBBBBB..%%%%%%%%%%%%%%%%%%;FjjjjWwwwW#ss",
  "ssssss#...........\";.......................FFFFFWWWWW#ss",
  "osssss####%%##%######%######%#%%%######%%#%#####%%#%%#ss",
  "sssssssssssssssvsssvssossssssssssssssssssssssssvssssssss",
  "ssssssssssssssssssssssssvssssssssssssssvvssssssvsssssvss",
];
const RW: Record<string, [number, number]> = {
  grell: [17, 8],
  sheriffDesk: [18, 7],
  sheriffLocker: [19, 6],
  rackS: [15, 6],
  cellBed1: [10, 6],
  cellBed2: [10, 10],
  prisoner: [12, 11],
  deputy: [16, 12],
  cellBucket: [12, 6],
  fitch: [30, 6],
  barCounter1: [29, 7],
  barCounter2: [31, 7],
  barCounter3: [33, 7],
  tbl1: [26, 11],
  tbl2: [31, 11],
  tbl3: [33, 13],
  tbl4: [26, 14],
  drunk: [27, 12],
  miner: [32, 12],
  cardSharp: [25, 13],
  storeCrate: [25, 5],
  storeBarrel: [27, 5],
  storeShelf: [25, 7],
  stillPipe: [34, 5],
  fridgeBar: [34, 9],
  sato: [44, 8],
  clinicBed1: [41, 6],
  clinicBed2: [41, 9],
  clinicBed3: [41, 12],
  patient: [42, 12],
  clinicCab: [45, 6],
  clinicDesk: [49, 7],
  clinicSafe: [50, 6],
  clinicSink: [50, 13],
  nurse: [48, 12],
  well: [37, 17],
  lampN1: [12, 18],
  lampN2: [23, 18],
  lampN3: [33, 18],
  lampN4: [46, 18],
  tank: [44, 17],
  sandbagG1: [8, 18],
  sandbagG2: [8, 26],
  gateGuard1: [8, 19],
  gateGuard2: [8, 25],
  sign: [4, 18],
  entry: [3, 22],
  barrelN1: [19, 16],
  barrelN2: [20, 17],
  crateN1: [25, 17],
  stallJ1: [48, 17],
  stallJ2: [51, 17],
  junkTrader: [49, 16],
  carN1: [9, 16],
  carN2: [40, 16],
  kidsN: [34, 17],
  lampS1: [12, 26],
  lampS2: [23, 26],
  lampS3: [41, 26],
  lampS4: [50, 26],
  carS1: [2, 14],
  carS2: [3, 29],
  carS3: [21, 26],
  shackA_bed: [9, 29],
  shackA_chest: [12, 32],
  shackB_bed: [9, 36],
  shackB_box: [9, 39],
  shackB_npc: [11, 38],
  corliss: [17, 31],
  corlissBed: [19, 29],
  corlissTable: [16, 30],
  harl: [17, 37],
  tallyClerk: [19, 36],
  tallySafe: [16, 40],
  tallyDesk: [20, 39],
  tallyThug: [19, 37],
  mott: [38, 37],
  mottDesk: [39, 36],
  mottSafe: [40, 40],
  mottRug: [38, 38],
  bodyguard: [37, 39],
  diceTbl1: [27, 32],
  diceTbl2: [31, 32],
  cardTbl: [27, 37],
  cardTbl2: [31, 37],
  croupier: [27, 31],
  gambler1: [28, 33],
  gambler2: [30, 33],
  gambler3: [28, 38],
  casinoBar1: [39, 30],
  casinoBar2: [39, 31],
  casinoLamp1: [33, 30],
  casinoLamp2: [25, 35],
  thug1: [33, 34],
  thug2: [26, 29],
  thug3: [33, 27],
  thug4: [30, 27],
  casinoSign: [34, 26],
  mottBack: [36, 36],
  pile1: [45, 30],
  pile2: [50, 29],
  pile3: [44, 36],
  pile4: [51, 34],
  yardCar1: [47, 31],
  yardCar2: [49, 36],
  yardCar3: [45, 40],
  yardCar4: [51, 31],
  wick: [46, 38],
  wickBox: [51, 39],
  wickBed: [50, 41],
  bramble: [47, 34],
  yardBarrel: [44, 29],
  dogBowl: [46, 35],
  barrelS1: [22, 30],
  barrelS2: [22, 31],
  crateS1: [14, 34],
  scav1: [12, 23],
  scav2: [40, 21],
  townie1: [25, 22],
  townie2: [45, 25],
  townieF: [20, 19],
  deputy2: [30, 21],
  kid: [16, 25],
  southCrate: [50, 44],
  lostPack: [1, 40],
  bones1: [2, 35],
};

// ------------------------------------------------------------------ items & protos

defineItems([
  { id: 'rw_ledger', name: 'Mott\'s Black Ledger', type: 'misc', weight: 1, value: 0, icon: 'book', quest: true, desc: 'A fat ledger bound in black oilcloth. Debts, bribes, and one entry that reads: "Tally job. Tin star retires. Roof gun 600."' },
  { id: 'rw_mottKey', name: 'Brass Office Key', type: 'key', weight: 0, value: 0, icon: 'key', desc: 'A heavy brass key stamped with a rivet. Opens Silas Mott\'s office and his safe.' },
  { id: 'rw_tallyNote', name: 'Folded Note', type: 'misc', weight: 0, value: 0, icon: 'letter', quest: true, desc: '"Harl. When the tin star comes through the Tally House door, the roof takes him. Nobody touches the till after, it\'s for show. Burn this. M."' },
  {
    id: 'rw_jaws', name: 'Bramble\'s Jaws', type: 'weapon', weight: 0, value: 0, icon: 'tail', quest: true,
    desc: 'Forty-two teeth and a bad attitude towards strangers. Not transferable.',
    weapon: { skill: 'unarmed', dmg: [6, 13], dmgType: 'normal', range: 1, modes: ['thrust'], ap: 3, minST: 1, hands: 1, melee: true, sound: 'punch', proj: 'none' },
  },
]);

defineProtos([
  { id: 'rw_guard', name: 'Rustwater Guard', desc: 'a Rustwater guard in hubcap armour', look: { body: 'human', skin: '#b07a50', hair: '#2a1a10', hairStyle: 'helmet', outfit: '#6a5a44', outfit2: '#8a8a80' }, stats: S(6, 7, 6, 4, 5, 6, 5), xp: 110, skills: { smallGuns: 72, melee: 60 }, equip: ['huntingRifle', 'leatherArmor'], inv: [{ id: 'ammo223', n: 12 }, { id: 'scrip', n: 10, chance: 50 }], team: 'rustwater', hostile: false },
  { id: 'rw_townie', name: 'Rustwater Local', desc: 'a Rustwater local with grease to the elbows', look: { body: 'human', skin: '#a87450', hair: '#3a2a1a', hairStyle: 'cap', outfit: '#6a5040', outfit2: '#4a4a40' }, stats: S(5, 5, 5, 5, 5, 5, 5), xp: 30, skills: { melee: 40 }, equip: ['knife'], team: 'rustwater', hostile: false, inv: [{ id: 'scrip', n: 8, chance: 50 }] },
  { id: 'rw_townieF', name: 'Rustwater Local', desc: 'a Rustwater local in a patched welding apron', look: { body: 'human', female: true, skin: '#c89468', hair: '#6a3a1a', hairStyle: 'long', outfit: '#5a4a3a', outfit2: '#8a6a4a' }, stats: S(4, 6, 5, 5, 5, 5, 5), xp: 30, skills: { melee: 35 }, team: 'rustwater', hostile: false },
  { id: 'rw_thug', name: 'Rivet Boy', desc: 'one of Silas Mott\'s "Rivet Boys", with a riveted leather collar', look: { body: 'human', skin: '#9a6a48', hair: '#1a1a1a', hairStyle: 'bald', outfit: '#3a2e44', outfit2: '#b08a30' }, stats: S(7, 5, 6, 3, 4, 6, 4), xp: 95, skills: { unarmed: 70, melee: 65, smallGuns: 60 }, equip: ['pistol9', 'leatherJacket'], inv: [{ id: 'ammo9', n: 14 }, { id: 'scrip', n: 25 }], team: 'rw_thugs', hostile: false, fleeAt: 0.15 },
  { id: 'rw_thugHeavy', name: 'Rivet Boy', desc: 'a heavyset Rivet Boy with a sawn-down shotgun', look: { body: 'human', skin: '#7a5238', hair: '#2a1a0a', hairStyle: 'short', outfit: '#2e2a3a', outfit2: '#b08a30', beard: true, scale: 1.08 }, stats: S(8, 5, 7, 3, 4, 5, 4), hp: 45, xp: 120, skills: { smallGuns: 65, melee: 70 }, equip: ['shotgun', 'leatherArmor'], inv: [{ id: 'shells', n: 10 }, { id: 'scrip', n: 30 }], team: 'rw_thugs', hostile: false, fleeAt: 0.1 },
  {
    id: 'rw_bramble', name: 'Bramble', desc: 'Bramble, a big rust-coloured scrapyard dog with a torn ear',
    look: { body: 'dog', skin: '#9a5a2e', scale: 1.25 }, stats: S(7, 8, 7, 3, 3, 8, 6), hp: 48, ap: 9, xp: 80,
    skills: { unarmed: 85, melee: 85, sneak: 70 }, dt: { normal: 1 }, dr: { normal: 10 },
    natural: { name: 'bite', dmg: [6, 13], ap: 3 }, equip: ['rw_jaws'], team: 'neutral', hostile: false, speed: 1.3,
  },
]);

defineQuests([
  { id: 'rw_trouble', title: 'Trouble in Rustwater', area: 'rustwater', xp: 1200, desc: 'Silas Mott, who owns the Lucky Rivet casino, wants Sheriff Amos Grell dead, and has a staged robbery at the Tally House in mind.' },
  { id: 'rw_brother', title: 'The Missing Brother', area: 'rustwater', xp: 450, desc: 'Corliss Penn\'s younger brother Tobin gambled away the family savings at the Lucky Rivet and vanished.' },
]);

// ------------------------------------------------------------------ helpers

function mottGone(c: Ctx) {
  return !!(c.flag('rw_mottDead') || c.flag('rw_mottExiled') || c.flag('rw_mottJailed'));
}

function grellAlive(c: Ctx) {
  return !c.flag('rw_grellDead') && !c.flag('dead:grell');
}

/** Orders shared by companions that have their own dialogue. */
export function companionOptions(id: string, leave = 'Time we parted ways.'): DialogueOption[] {
  return [
    { text: 'Let me see what you\'re carrying.', any: true, end: true, do: (c) => { const a = c.speaker(); if (a) setTimeout(() => import('../ui/loot').then((l) => l.openLoot({ kind: 'body', actor: a })), 60); } },
    { text: 'Wait here.', any: true, end: true, do: (c) => { const a = c.speaker(); if (a) (a as any)._wait = true; } },
    { text: 'Follow me.', any: true, end: true, do: (c) => { const a = c.speaker(); if (a) (a as any)._wait = false; } },
    { text: leave, any: true, end: true, do: (c) => c.dismiss(id) },
  ];
}

/** Random ambient barks from flavour NPCs (called from onTick). */
export function ambientBarks(c: Ctx, lines: [string, string[]][], chance = 3) {
  if (G.combat || G.modal || c.random(chance) !== 0) return;
  const [id, pool] = lines[c.random(lines.length)];
  const a = c.npc(id);
  if (!a || a.dead || a.hostile || a.companion) return;
  const p = G.state.player;
  if (Math.abs(a.q - p.q) + Math.abs(a.r - p.r) > 26) return;
  c.bark(id, pool[c.random(pool.length)]);
}

function startTrouble(c: Ctx, note: string) {
  c.set('rw_heardPlot');
  c.quest('rw_trouble', note);
}

function acceptHit(c: Ctx) {
  if (c.flag('rw_mottJob')) return;
  c.set('rw_mottJob');
  c.set('rw_mottOffer');
  c.set('rw_heardPlot');
  c.give('scrip', 200);
  c.karma(-25);
  c.quest('rw_trouble', 'You took two hundred scrip from Silas Mott to be the "roof gun" when Sheriff Grell answers a staged robbery at the Tally House. Harl, at the Tally House, will start it when you say so.');
}

function doHit(c: Ctx, pulled: boolean) {
  c.set('rw_hitDone');
  c.set('rw_grellDead');
  c.fade(pulled ? 'The bell. The door. One shot.' : 'The bell. The door. Harl\'s gun.');
  c.remove('grell');
  c.karma(pulled ? -150 : -100);
  c.advance(90);
  c.msg('Sheriff Amos Grell is dead. Rustwater will call it a robbery.');
}

function wrapTrouble(c: Ctx) {
  if (c.questState('rw_trouble') === 'done') return;
  c.set('rw_grellSaved');
  c.karma(60);
  c.rep('rustwater', 20);
  c.give('scrip', 350);
  const how = c.flag('rw_mottDead') ? 'Silas Mott is dead' : c.flag('rw_mottJailed') ? 'Silas Mott is in Grell\'s cell' : 'Silas Mott has left Rustwater for good';
  c.questDone('rw_trouble', `${how}, and Sheriff Grell is alive to keep the peace.`);
}

// ------------------------------------------------------------------ dice

function diceChance(c: Ctx) {
  return Math.max(25, Math.min(80, 25 + Math.floor(c.skill('gambling') / 2)));
}

function rollDice(c: Ctx, bet: number, rigged = false) {
  if (!c.pay(bet)) {
    c.set('rw_diceLast', { none: true });
    return;
  }
  const win = rigged || c.random(100) < diceChance(c);
  const d = () => 1 + c.random(6);
  let p1 = d(), p2 = d(), h1 = d(), h2 = d();
  for (let i = 0; i < 200 && (win ? p1 + p2 <= h1 + h2 : p1 + p2 > h1 + h2); i++) {
    p1 = d(); p2 = d(); h1 = d(); h2 = d();
  }
  if (win) {
    c.give('scrip', bet * 2);
    if (c.inc('rw_diceWins') % 3 === 0) c.xp(20);
  }
  const net = c.inc('rw_diceNet', win ? bet : -bet);
  c.set('rw_diceLast', { win, bet, p: [p1, p2], h: [h1, h2] });
  if (net > 900) c.set('rw_diceHot');
}

function diceText(c: Ctx) {
  const r = c.flag('rw_diceLast') ?? {};
  if (r.none) return 'Nico looks at your empty hand, then at you. "Scrip on the felt first, honey. The dice don\'t do credit and neither do I."';
  const pips = (a: number[]) => `${a[0]} and ${a[1]}`;
  const head = `You shake the two steel dice in the cup and throw: ${pips(r.p)}. Nico scoops them up and throws for the house: ${pips(r.h)}.`;
  if (r.win) return `${head}\n\n"Player takes it." She slides ${r.bet * 2} scrip across the felt without a flicker of regret. It isn't her money.`;
  const tie = r.p[0] + r.p[1] === r.h[0] + r.h[1];
  return `${head}\n\n${tie ? '"Tie goes to the house. Tie always goes to the house."' : '"House." The scrip vanishes into her apron.'}`;
}

// ------------------------------------------------------------------ map

defineMap({
  id: 'rustwater',
  name: 'Rustwater',
  area: 'rustwater',
  outdoor: true,
  floor: 'dirt',
  floor2: 'asphalt',
  wall: 'scrap',
  wall2: 'metal',
  music: 'town',
  legend: {
    s: { floor: 'sand' },
    v: { floor: 'sand', decor: 'scrub' },
    w: { floor: 'wood' },
    k: { floor: 'carpet' },
    c: { floor: 'concrete' },
    j: { floor: 'rubble' },
    x: { floor: 'asphalt', decor: 'oil' },
    F: { wall: 'fence', floor: 'rubble' },
    W: { wall: 'wood' },
    B: { wall: 'brick' },
    D: { floor: 'wood', door: {} },
    K: { floor: 'carpet', door: {} },
    C: { floor: 'concrete', door: {} },
    '>': { floor: 'sand', exit: 'out' },
  },
  rows: RW_ROWS,
  entrances: { default: RW.entry },
  exits: { out: { to: 'world' } },
  objects: [
    // gate & yard
    { kind: 'sign', at: RW.sign, name: 'town sign', tint: '#9a7a4a', onUse: 'rw_sign' },
    { kind: 'sandbags', at: RW.sandbagG1 },
    { kind: 'sandbags', at: RW.sandbagG2 },
    { kind: 'well', at: RW.well, name: 'town pump', onUse: 'rw_well' },
    { kind: 'tank', at: RW.tank, name: 'water tank', tint: '#8a4a2a' },
    { kind: 'lamp', at: RW.lampN1 }, { kind: 'lamp', at: RW.lampN2 }, { kind: 'lamp', at: RW.lampN3 }, { kind: 'lamp', at: RW.lampN4 },
    { kind: 'lamp', at: RW.lampS1 }, { kind: 'lamp', at: RW.lampS2 }, { kind: 'lamp', at: RW.lampS3 }, { kind: 'lamp', at: RW.lampS4 },
    { kind: 'barrel', at: RW.barrelN1, tint: '#7a3a22' },
    { kind: 'barrelc', at: RW.barrelN2, name: 'rain barrel', inv: [{ id: 'water', n: 1 }] },
    { kind: 'crate', at: RW.crateN1, inv: [{ id: 'scrapMetal', n: 2 }, { id: 'rope', n: 1 }] },
    { kind: 'stall', at: RW.stallJ1, tint: '#6a7a4a' },
    { kind: 'stall', at: RW.stallJ2, tint: '#8a5a3a' },
    { kind: 'car', at: RW.carN1, tint: '#6a4a3a' },
    { kind: 'car', at: RW.carN2, tint: '#4a5a6a' },
    { kind: 'car', at: RW.carS1, tint: '#7a6a3a' },
    { kind: 'car', at: RW.carS2, tint: '#5a3a2a' },
    { kind: 'car', at: RW.carS3, tint: '#3a4a3a' },
    { kind: 'barrel', at: RW.barrelS1, tint: '#4a5a3a' },
    { kind: 'barrelc', at: RW.barrelS2, inv: [{ id: 'fuel', n: 1 }] },
    { kind: 'crate', at: RW.crateS1, inv: [{ id: 'jerky', n: 1 }, { id: 'scrip', n: 6 }] },
    { kind: 'crate', at: RW.southCrate, name: 'smuggler\'s cache', locked: 35, inv: [{ id: 'ammo44', n: 12 }, { id: 'fury', n: 1 }, { id: 'scrip', n: 60 }] },
    { kind: 'bag', at: RW.lostPack, name: 'sun-bleached pack', inv: [{ id: 'jerky', n: 2 }, { id: 'flare', n: 1 }] },
    { kind: 'bones', at: RW.bones1 },
    // sheriff's office
    { kind: 'desk', at: RW.sheriffDesk, name: 'sheriff\'s desk', inv: [{ id: 'ammo44', n: 6 }, { id: 'beer', n: 1 }] },
    { kind: 'locker', at: RW.sheriffLocker, name: 'evidence locker', locked: 45, inv: [{ id: 'shells', n: 12 }, { id: 'lockpicks', n: 1 }, { id: 'hypo', n: 1 }] },
    { kind: 'rack', at: RW.rackS, name: 'empty gun rack' },
    { kind: 'bed', at: RW.cellBed1, tint: '#6a6a60' },
    { kind: 'bed', at: RW.cellBed2, tint: '#6a6a60' },
    // Tin Cup
    { kind: 'table', at: RW.barCounter1, tint: '#5a3a22' }, { kind: 'table', at: RW.barCounter2, tint: '#5a3a22' }, { kind: 'table', at: RW.barCounter3, tint: '#5a3a22' },
    { kind: 'table', at: RW.tbl1 }, { kind: 'table', at: RW.tbl2 }, { kind: 'table', at: RW.tbl3 }, { kind: 'table', at: RW.tbl4 },
    { kind: 'crate', at: RW.storeCrate, name: 'bar stores', inv: [{ id: 'beer', n: 4 }, { id: 'jerky', n: 2 }] },
    { kind: 'barrel', at: RW.storeBarrel, tint: '#6a4a2a' },
    { kind: 'shelf', at: RW.storeShelf, inv: [{ id: 'water', n: 2 }] },
    { kind: 'pipe', at: RW.stillPipe, name: 'copper still', id: 'rw_still', onUse: 'rw_still' },
    { kind: 'fridge', at: RW.fridgeBar, name: 'dead icebox', inv: [{ id: 'beer', n: 2 }] },
    // clinic
    { kind: 'bed', at: RW.clinicBed1, tint: '#d8d8d0' }, { kind: 'bed', at: RW.clinicBed2, tint: '#d8d8d0' }, { kind: 'bed', at: RW.clinicBed3, tint: '#d8d8d0' },
    { kind: 'cabinet', at: RW.clinicCab, name: 'medicine cabinet', locked: 55, inv: [{ id: 'hypo', n: 2 }, { id: 'antidote', n: 1 }] },
    { kind: 'desk', at: RW.clinicDesk, name: 'Doc Sato\'s desk', inv: [{ id: 'clarity', n: 1 }, { id: 'iodine', n: 1 }] },
    { kind: 'safe', at: RW.clinicSafe, name: 'drug safe', locked: 75, inv: [{ id: 'superHypo', n: 1 }, { id: 'radPurge', n: 1 }, { id: 'scrip', n: 80 }] },
    { kind: 'sink', at: RW.clinicSink },
    // shacks
    { kind: 'bed', at: RW.shackA_bed, tint: '#7a6a50' },
    { kind: 'chest', at: RW.shackA_chest, locked: 25, inv: [{ id: 'scrip', n: 22 }, { id: 'knife', n: 1 }] },
    { kind: 'bedroll', at: RW.shackB_bed },
    { kind: 'footlocker', at: RW.shackB_box, inv: [{ id: 'curePaste', n: 1 }, { id: 'jerky', n: 1 }] },
    { kind: 'bed', at: RW.corlissBed, tint: '#8a6a6a' },
    { kind: 'table', at: RW.corlissTable },
    // Tally House
    { kind: 'safe', at: RW.tallySafe, name: 'Tally House strongbox', locked: 65, inv: [{ id: 'scrip', n: 240 }] },
    { kind: 'desk', at: RW.tallyDesk, name: 'counting desk', inv: [{ id: 'scrip', n: 14 }] },
    // Lucky Rivet
    { kind: 'sign', at: RW.casinoSign, name: 'THE LUCKY RIVET', tint: '#c8a040', onUse: 'rw_casinoSign' },
    { kind: 'table', at: RW.diceTbl1, name: 'dice table', tint: '#2a5a3a' },
    { kind: 'table', at: RW.diceTbl2, name: 'dice table', tint: '#2a5a3a' },
    { kind: 'table', at: RW.cardTbl, name: 'card table', tint: '#3a4a2a' },
    { kind: 'table', at: RW.cardTbl2, name: 'card table', tint: '#3a4a2a' },
    { kind: 'table', at: RW.casinoBar1, tint: '#4a2a1a' }, { kind: 'table', at: RW.casinoBar2, tint: '#4a2a1a' },
    { kind: 'lamp', at: RW.casinoLamp1 }, { kind: 'lamp', at: RW.casinoLamp2 },
    { kind: 'door', at: [35, 38], id: 'rw_officeDoor', locked: 60, key: 'rw_mottKey' },
    { kind: 'rug', at: RW.mottRug },
    { kind: 'desk', at: RW.mottDesk, name: 'Mott\'s desk', inv: [{ id: 'scrip', n: 40 }, { id: 'clarity', n: 1 }] },
    { kind: 'safe', at: RW.mottSafe, name: 'Mott\'s safe', locked: 70, key: 'rw_mottKey', inv: [{ id: 'rw_ledger', n: 1 }, { id: 'scrip', n: 320 }, { id: 'superHypo', n: 1 }] },
    // scrapyard
    { kind: 'pile', at: RW.pile1, name: 'scrap heap', inv: [{ id: 'scrapMetal', n: 3 }, { id: 'scrapElectronics', n: 1 }] },
    { kind: 'pile', at: RW.pile2, name: 'scrap heap', inv: [{ id: 'scrapMetal', n: 2 }] },
    { kind: 'pile', at: RW.pile3, name: 'scrap heap', inv: [{ id: 'crowbar', n: 1 }] },
    { kind: 'pile', at: RW.pile4, name: 'scrap heap', inv: [{ id: 'scrapElectronics', n: 1 }, { id: 'ammo9', n: 6 }] },
    { kind: 'car', at: RW.yardCar1, tint: '#8a3a2a' },
    { kind: 'car', at: RW.yardCar2, tint: '#5a5a5a' },
    { kind: 'car', at: RW.yardCar3, tint: '#6a5a2a' },
    { kind: 'car', at: RW.yardCar4, tint: '#3a4a5a' },
    { kind: 'barrel', at: RW.yardBarrel, tint: '#5a3a1a' },
    { kind: 'bones', at: RW.dogBowl, name: 'well-gnawed bones' },
    { kind: 'toolbox', at: RW.wickBox, inv: [{ id: 'toolkit', n: 1 }, { id: 'scrapElectronics', n: 1 }] },
    { kind: 'bedroll', at: RW.wickBed },
  ],
  npcs: [
    // law
    { proto: 'rw_guard', id: 'grell', name: 'Sheriff Amos Grell', at: RW.grell, dialog: 'rw_grell', team: 'rustwater', equip: ['revolver44', 'leatherArmor'], inv: [{ id: 'ammo44', n: 18 }, { id: 'scrip', n: 40 }], hp: 60, look: { hairStyle: 'short', hair: '#9a9a90', skin: '#c89a70', beard: true, outfit: '#7a6040', outfit2: '#c8b070' } },
    { proto: 'rw_guard', id: 'rw_deputy', name: 'Deputy Ansel Moke', at: RW.deputy, dialog: 'rw_deputy', team: 'rustwater', look: { hairStyle: 'cap', hair: '#c89a50', skin: '#e0b090' } },
    { proto: 'rw_guard', id: 'rw_deputy2', name: 'Deputy Rosalind Achebe', at: RW.deputy2, dialog: 'rw_deputy', team: 'rustwater', wander: 6, look: { female: true, hairStyle: 'bun', hair: '#1a1a1a', skin: '#6a4028' } },
    { proto: 'rw_guard', id: 'rw_gate1', name: 'Gate Guard', at: RW.gateGuard1, dialog: 'rw_gateguard', team: 'rustwater' },
    { proto: 'rw_guard', id: 'rw_gate2', name: 'Gate Guard', at: RW.gateGuard2, dialog: 'rw_gateguard', team: 'rustwater', look: { skin: '#8a5a38', beard: true } },
    { proto: 'rw_townie', id: 'rw_lonny', name: 'Lonny Pike', at: RW.prisoner, dialog: 'rw_lonny', team: 'rustwater', equip: [], look: { hairStyle: 'long', hair: '#8a6a3a', outfit: '#7a6a5a' } },
    // Tin Cup
    { proto: 'rw_townie', id: 'fitch', name: 'Fitch', at: RW.fitch, dialog: 'rw_fitch', team: 'rustwater', barter: true, inv: [{ id: 'beer', n: 12 }, { id: 'jerky', n: 6 }, { id: 'water', n: 5 }, { id: 'molotov', n: 2 }, { id: 'scrip', n: 180 }], look: { hairStyle: 'bald', skin: '#d8a880', outfit: '#8a8070', outfit2: '#ddd', beard: true } },
    { proto: 'rw_townie', id: 'rw_absalom', name: 'Old Absalom', at: RW.drunk, dialog: 'rw_absalom', team: 'rustwater', look: { hair: '#ccc', hairStyle: 'long', beard: true, outfit: '#5a5048' } },
    { proto: 'rw_townieF', id: 'rw_deza', name: 'Deza Rook', at: RW.miner, dialog: 'rw_deza', team: 'rustwater', look: { hairStyle: 'short', hair: '#3a2a1a', skin: '#8a5a3a', outfit: '#5a5a4a' } },
    { proto: 'rw_townie', id: 'rw_tilly', name: 'Tilly Vane', at: RW.cardSharp, dialog: 'rw_tilly', team: 'rustwater', look: { hairStyle: 'short', hair: '#b04a2a', outfit: '#3a3a5a', outfit2: '#c8a040' } },
    // clinic
    { proto: 'rw_townieF', id: 'sato', name: 'Doc Imani Sato', at: RW.sato, dialog: 'rw_sato', team: 'rustwater', barter: true, inv: [{ id: 'hypo', n: 6 }, { id: 'superHypo', n: 1 }, { id: 'radPurge', n: 3 }, { id: 'antidote', n: 3 }, { id: 'curePaste', n: 4 }, { id: 'medkit', n: 1 }, { id: 'iodine', n: 2 }, { id: 'scrip', n: 320 }], look: { skin: '#e0b890', hair: '#1a1a1a', hairStyle: 'bun', outfit: '#d0d0c8', outfit2: '#8a2a2a' } },
    { proto: 'rw_townie', id: 'rw_patient', name: 'Feverish Welder', at: RW.patient, dialog: 'rw_patient', team: 'rustwater', look: { outfit: '#8a8070' } },
    { proto: 'rw_townieF', id: 'rw_juniper', name: 'Orderly Juniper', at: RW.nurse, dialog: 'rw_juniper', team: 'rustwater', wander: 2, look: { outfit: '#c8c8c0', hairStyle: 'bun', hair: '#6a4a2a' } },
    // Lucky Rivet
    { proto: 'rw_thug', id: 'mott', name: 'Silas Mott', at: RW.mott, dialog: 'rw_mott', team: 'rw_thugs', equip: ['revolver44'], inv: [{ id: 'ammo44', n: 12 }, { id: 'rw_mottKey', n: 1 }, { id: 'scrip', n: 150 }], hp: 40, look: { skin: '#e8c8a8', hair: '#d8c8a0', hairStyle: 'short', outfit: '#6a1a2a', outfit2: '#c8a040', scale: 1.02 } },
    { proto: 'rw_thugHeavy', id: 'rw_bodyguard', name: 'Mott\'s Bodyguard', at: RW.bodyguard, team: 'rw_thugs', inv: [{ id: 'rw_mottKey', n: 1 }] },
    { proto: 'rw_thug', id: 'rw_thugA', name: 'Rivet Boy', at: RW.thug1, team: 'rw_thugs', wander: 3 },
    { proto: 'rw_thug', id: 'rw_thugB', name: 'Rivet Boy', at: RW.thug2, team: 'rw_thugs' },
    { proto: 'rw_thugHeavy', id: 'rw_doorman', name: 'Rivet Doorman', at: RW.thug3, team: 'rw_thugs', dialog: 'rw_doorman' },
    { proto: 'rw_thug', id: 'rw_thugC', name: 'Rivet Boy', at: RW.thug4, team: 'rw_thugs', wander: 2 },
    { proto: 'rw_townieF', id: 'rw_nico', name: 'Nico the Croupier', at: RW.croupier, dialog: 'rw_nico', team: 'rw_thugs', look: { hair: '#1a1a1a', hairStyle: 'short', outfit: '#1a1a1a', outfit2: '#c8a040' } },
    { proto: 'rw_townie', id: 'rw_gambler1', name: 'Gambler', at: RW.gambler1, team: 'rustwater' },
    { proto: 'rw_townieF', id: 'rw_gambler2', name: 'Gambler', at: RW.gambler2, team: 'rustwater' },
    { proto: 'rw_townie', id: 'rw_gambler3', name: 'Sore Loser', at: RW.gambler3, team: 'rustwater', look: { hairStyle: 'bald', beard: true } },
    // Tally House
    { proto: 'rw_thug', id: 'harl', name: 'Harl Dobbs', at: RW.harl, dialog: 'rw_harl', team: 'rw_thugs', inv: [{ id: 'rw_tallyNote', n: 1 }, { id: 'scrip', n: 60 }], look: { hairStyle: 'short', hair: '#4a2a1a', beard: true, skin: '#b88660', scale: 1.05 } },
    { proto: 'rw_thug', id: 'rw_tallyThug', name: 'Rivet Boy', at: RW.tallyThug, team: 'rw_thugs' },
    // Penn family
    { proto: 'rw_townieF', id: 'corliss', name: 'Corliss Penn', at: RW.corliss, dialog: 'rw_corliss', team: 'rustwater', look: { hair: '#b0502a', hairStyle: 'bun', skin: '#e8c0a0', outfit: '#6a5a6a' } },
    { proto: 'rw_townie', id: 'rw_tobinHome', name: 'Tobin Penn', at: RW.corlissTable, dialog: 'rw_tobinHome', team: 'rustwater', if: (c) => !!c.flag('rw_tobinHome'), look: { hair: '#c0602a', hairStyle: 'short', skin: '#e8c0a0', outfit: '#6a6a4a' } },
    // scrapyard
    { proto: 'rw_townie', id: 'wick', name: 'Wick Harrow', at: RW.wick, dialog: 'rw_wick', team: 'rustwater', barter: true, inv: [{ id: 'scrapMetal', n: 6 }, { id: 'scrapElectronics', n: 3 }, { id: 'crowbar', n: 1 }, { id: 'sledge', n: 1 }, { id: 'knife', n: 2 }, { id: 'rope', n: 2 }, { id: 'toolkit', n: 1 }, { id: 'jerky', n: 3 }, { id: 'metalArmor', n: 1 }, { id: 'scrip', n: 220 }], look: { hair: '#8a8a80', hairStyle: 'cap', beard: true, outfit: '#4a4030', outfit2: '#8a6a3a' } },
    { proto: 'rw_bramble', id: 'rw_bramble', name: 'Bramble', at: RW.bramble, dialog: 'rw_bramble', wander: 3 },
    // streets
    { proto: 'rw_townie', id: 'rw_scav1', name: 'Scavenger', at: RW.scav1, team: 'rustwater', wander: 5 },
    { proto: 'rw_townieF', id: 'rw_scav2', name: 'Scavenger', at: RW.scav2, team: 'rustwater', wander: 5 },
    { proto: 'rw_townie', id: 'rw_townie1', name: 'Tired Mechanic', at: RW.townie1, team: 'rustwater', wander: 4 },
    { proto: 'rw_townie', id: 'rw_townie2', name: 'Water Carrier', at: RW.townie2, team: 'rustwater', wander: 4 },
    { proto: 'rw_townieF', id: 'rw_townieF', name: 'Tinker', at: RW.townieF, team: 'rustwater', wander: 4 },
    { proto: 'rw_townieF', id: 'rw_kid', name: 'Scrap Kid', at: RW.kid, team: 'rustwater', wander: 6, look: { scale: 0.75, hairStyle: 'short', outfit: '#7a5a4a' } },
    { proto: 'rw_townie', id: 'rw_kid2', name: 'Scrap Kid', at: RW.kidsN, team: 'rustwater', wander: 5, equip: [], look: { scale: 0.72, hairStyle: 'cap', outfit: '#5a6a4a' } },
    { proto: 'rw_townie', id: 'rw_junker', name: 'Parts Hawker', at: RW.junkTrader, team: 'rustwater', dialog: 'rw_junker', barter: true, inv: [{ id: 'ammo9', n: 30 }, { id: 'flare', n: 3 }, { id: 'scrapElectronics', n: 2 }, { id: 'jerky', n: 2 }, { id: 'scrip', n: 90 }], look: { hairStyle: 'hood', outfit: '#5a4a3a' } },
    { proto: 'rw_townieF', id: 'rw_shackB', name: 'Mother Oyelade', at: RW.shackB_npc, dialog: 'rw_oyelade', team: 'rustwater', look: { hair: '#ddd', hairStyle: 'bun', skin: '#5a3420' } },
  ],
  onEnter: (c, first) => {
    if (first) {
      c.msg('Rustwater: a wall of flattened cars and roofing tin around a pump that brings up water the colour of weak tea. Someone has painted "NO SHOOTING" on the gate in letters a yard high.');
      c.bark('rw_gate1', 'Hands where we can see them. Welcome to Rustwater.');
    }
    if (c.flag('rw_hitDone') && !c.flag('rw_hitSeen')) {
      c.set('rw_hitSeen');
      c.msg('A black rag hangs from the sheriff\'s office door. Nobody meets your eyes.');
    }
  },
  onTick: (c) => {
    restoreAllies(c);
    ambientBarks(c, [
      ['rw_scav1', ['Copper\'s up, tin\'s down. Story of my life.', 'Found a whole carburettor yesterday. Whole!', 'Don\'t drink from the pump before noon. Sediment.']],
      ['rw_scav2', ['Mind the scrapyard dog. He\'s got opinions.', 'Wick pays in scrip, Mott pays in trouble.']],
      ['rw_townie1', ['Third fan belt this week.', 'If you break it, I can fix it. If you broke it on purpose, I charge double.']],
      ['rw_townie2', ['Water! Rusty but honest! Two scrip a jug!', 'Boil it twice and it\'s practically wine.']],
      ['rw_townieF', ['Pots mended, knives sharpened, hearts left as they are.', 'Keep walking, stranger, the Rivet boys are counting you.']],
      ['rw_kid', ['Got any scrip? Got any gum? What\'s gum?', 'Bet you can\'t catch me!']],
      ['rw_kid2', ['My dad says the sheriff\'s gonna get it.', 'I seen Bramble eat a whole tyre once.']],
      ['rw_gambler1', ['Seven. Come on, seven.', 'Nico\'s got cold hands and colder dice.']],
      ['rw_gambler3', ['Rigged. It\'s all rigged.', 'One more roll. Just one.']],
      ['rw_thugA', ['Move along.', 'Mister Mott likes new faces. I don\'t.']],
      ['rw_thugB', ['You lost? The door\'s behind you.']],
      ['rw_gate1', ['Eyes on the road.', 'Quiet today. I hate quiet.']],
      ['rw_deputy2', ['Evening. Keep it peaceful.', 'Sheriff\'s in the office if you need him.']],
      ['rw_absalom', ['...and THEN the moon fell on Tuesday...', 'Another! Fitch! Another!']],
    ]);
  },
});

// Grell and his deputies fight beside the player during the Tally House ambush.
function makeAllies(c: Ctx) {
  for (const id of ['grell', 'rw_deputy', 'rw_deputy2']) {
    const a = c.npc(id);
    if (a && !a.dead) {
      a.companion = true;
      (a as any)._rwAlly = true;
    }
  }
  c.set('rw_alliesUp');
}

function restoreAllies(c: Ctx) {
  if (!c.flag('rw_alliesUp') || G.combat || !G.map) return;
  for (const a of G.map.actors) {
    if ((a as any)._rwAlly) {
      a.companion = false;
      a.team = 'rustwater';
      a.hostile = false;
      delete (a as any)._rwAlly;
    }
  }
  c.set('rw_alliesUp', false);
}

// ------------------------------------------------------------------ object scripts

defineObjScripts({
  rw_sign: (c) => {
    c.msg('The sign reads: "RUSTWATER. POP: ENOUGH. NO SHOOTING INSIDE THE WALLS. NO SPITTING IN THE PUMP. BY ORDER, A. GRELL." Underneath, in different paint: "THE LUCKY RIVET - WHERE FORTUNE IS MADE."');
    return true;
  },
  rw_casinoSign: (c) => {
    c.msg('A hubcap sunburst studded with hundreds of polished rivets. Some of them still turn in the wind, which makes the whole sign wink at you.');
    return true;
  },
  rw_well: (c) => {
    if ((c.flag('rw_wellDrink') ?? -9999) > c.time() - 240) {
      c.msg('You have had enough rust for one day.');
      return true;
    }
    c.set('rw_wellDrink', c.time());
    c.msg('You work the pump handle. The water tastes of pennies and old engines, but it is wet.');
    c.heal(3);
    c.rads(2);
    return true;
  },
  rw_still: (c, o, _u, skill) => {
    if (c.flag('rw_stillFixed')) {
      c.msg('The still gurgles contentedly. Fitch has hung a hand-lettered sign on it: "DO NOT TOUCH. THIS MEANS YOU."');
      return true;
    }
    if (skill === 'repair' || skill === 'science') {
      if (c.roll(skill === 'repair' ? 'repair' : 'science', 25)) {
        c.set('rw_stillFixed');
        c.msg('You free a seized float valve with a bit of wire. The still begins to drip again.');
        c.xp(75);
        c.bark('fitch', 'Is that... it\'s dripping! Come here, you!');
      } else {
        c.msg('You poke around the coils and burn your thumb. The float valve stays stuck.');
      }
      return true;
    }
    c.msg('A copper still made from a water heater and a lot of optimism. The float valve looks seized. (Try Repair.)');
    void o;
    return true;
  },
});

// ------------------------------------------------------------------ death scripts

defineDeathScripts({
  mott: (c) => {
    c.set('rw_mottDead');
    if (c.questState('rw_trouble') !== 'active' && c.questState('rw_trouble') !== 'none') return;
    if (!grellAlive(c)) c.questDone('rw_trouble', 'Silas Mott and Sheriff Grell are both dead. Rustwater will have to find its own way.');
    else c.quest('rw_trouble', 'Silas Mott is dead. Sheriff Grell will want to hear it from you.');
  },
  grell: (c) => {
    c.set('rw_grellDead');
    if (c.questState('rw_trouble') === 'done') return;
    if (c.flag('rw_mottDead')) c.questDone('rw_trouble', 'Sheriff Grell fell too. Rustwater has neither its sheriff nor its boss.');
    else if (c.flag('rw_mottJob')) c.quest('rw_trouble', 'Grell is dead. Silas Mott will want to pay you the rest.');
    else if (c.questState('rw_trouble') === 'active') c.questFail('rw_trouble', 'Sheriff Grell is dead, and Silas Mott owns Rustwater.');
  },
  harl: (c) => {
    c.set('rw_harlDead');
  },
  rw_bramble: (c) => {
    c.set('rw_brambleDead');
  },
  corliss: (c) => {
    if (c.questState('rw_brother') === 'active') c.questFail('rw_brother', 'Corliss Penn is dead.');
  },
});

// ------------------------------------------------------------------ dialogue

defineDialogues([
  // ----------------------------------------------------------- Sheriff Grell
  {
    id: 'rw_grell',
    start: (c) => {
      if (c.flag('rw_ambushReady') && !c.flag('rw_ambushDone')) return 'ambushwait';
      if (c.questState('rw_trouble') === 'active' && mottGone(c)) return 'wrapup';
      if (c.flag('rw_proofGiven') && !mottGone(c)) return 'proofwait';
      if (c.questState('rw_trouble') === 'done') return 'after';
      return c.flag('rw_metGrell') ? 'again' : 'hello';
    },
    nodes: {
      hello: {
        onEnter: (c) => c.set('rw_metGrell'),
        text: 'A lean man with a grey moustache looks up from a tin cup of something that steams. The star on his vest has been cut from a hubcap and polished until it is almost a star.\n\n"Sheriff Amos Grell. You\'re new, you\'re armed, and you\'re standing in my office. Two of those I can live with."',
        options: [
          { text: 'Just passing through. What is this place?', to: 'town' },
          { text: 'Who actually runs Rustwater?', to: 'runs' },
          { text: 'Someone is planning to kill you.', if: (c) => !!c.flag('rw_heardPlot') && !c.flag('rw_warned'), to: 'warn' },
          { text: 'You sheriff? Shiny star.', lowInt: true, to: 'lowhello' },
          { text: 'I\'ll keep my gun holstered. Goodbye.', end: true },
        ],
      },
      lowhello: {
        text: '"It\'s a hubcap," he says, not unkindly. "But yes. I\'m the sheriff. You stay out of trouble, friend, and trouble might stay out of you."',
        options: [
          { text: 'Mott bad man. Want you dead. Bang.', lowInt: true, if: (c) => !!c.flag('rw_heardPlot') && !c.flag('rw_warned'), to: 'warnlow' },
          { text: 'Where other towns?', lowInt: true, to: 'directions' },
          { text: 'Okay. Bye, star man.', lowInt: true, end: true },
        ],
      },
      again: {
        text: (c) => `Grell nods at you over his cup. "${c.flag('rw_warned') ? 'Any news about our friend at the Rivet?' : 'Still in one piece. Good. That\'s the town average.'}"`,
        options: [
          { text: 'Tell me about the town.', to: 'town' },
          { text: 'Who actually runs Rustwater?', to: 'runs' },
          { text: 'Someone is planning to kill you.', if: (c) => !!c.flag('rw_heardPlot') && !c.flag('rw_warned'), to: 'warn' },
          { text: 'I\'ve got proof: Mott\'s own ledger.', if: (c) => !!c.flag('rw_warned') && c.has('rw_ledger'), to: 'proof', do: (c) => c.take('rw_ledger') },
          { text: 'I\'ve got proof: a note from Mott to Harl.', if: (c) => !!c.flag('rw_warned') && c.has('rw_tallyNote'), to: 'proof', do: (c) => c.take('rw_tallyNote') },
          { text: 'Harl talked. He\'ll say it to your face.', if: (c) => !!c.flag('rw_warned') && !!c.flag('rw_harlConfessed'), to: 'proof' },
          { text: 'Where would I find proof again?', if: (c) => !!c.flag('rw_warned') && !c.flag('rw_proofGiven'), to: 'proofwhere' },
          { text: 'I took Mott\'s money. Let me play along, and we spring the trap on them.', if: (c) => !!c.flag('rw_warned') && !!c.flag('rw_mottJob') && !c.flag('rw_ambushReady'), to: 'doubleplay' },
          { text: 'Mott bad. Me have paper!', lowInt: true, if: (c) => !!c.flag('rw_warned') && (c.has('rw_ledger') || c.has('rw_tallyNote')), to: 'proof', do: (c) => { c.take('rw_ledger'); c.take('rw_tallyNote'); } },
          { text: 'Mott bad man. Want you dead.', lowInt: true, if: (c) => !!c.flag('rw_heardPlot') && !c.flag('rw_warned'), to: 'warnlow' },
          { text: 'Heard of anyone called Tobin Penn?', if: (c) => c.questState('rw_brother') === 'active', to: 'tobin' },
          { text: 'Where else is there to go around here?', to: 'directions' },
          { text: 'Take care, Sheriff.', end: true },
        ],
      },
      town: {
        text: '"Rustwater. Sixty years ago this was a freeway pile-up and a pump station. Somebody stood the cars on end for a wall, somebody else got the pump working, and here we are. The water\'s rusty, but it\'s wet, and that makes us rich by local standards."\n\n"Doc Sato runs the clinic north of the road. Fitch pours at the Tin Cup. Wick buys scrap in the yard. Don\'t pet his dog."',
        options: [
          { text: 'Who actually runs Rustwater?', to: 'runs' },
          { text: 'Where else is there to go around here?', to: 'directions' },
          { text: 'Thanks.', to: 'again' },
        ],
      },
      runs: {
        text: '"On paper, the Town Board. The Board is three old men who agree with whoever spoke last." He sets the cup down. "In practice, I keep the peace and Silas Mott keeps everything else. He owns the Lucky Rivet, the Tally House, and a good half of the debts in town. We\'ve had an understanding. Lately it\'s been less understanding and more staring."',
        options: [
          { text: 'Anything I can do to help?', to: 'work' },
          { text: 'I see. Thanks.', to: 'again' },
        ],
      },
      work: {
        text: '"I\'ve got two deputies and one of them is asleep most of the time. If you want to help, keep your ears open near the Rivet. Mott\'s boys have started counting my steps." He rubs his eyes. "And Corliss Penn has been at my door every morning about her little brother. I\'ve no one to spare. Maybe you do. Her shack\'s on the south side, by the Tally House."',
        options: [{ text: 'I\'ll keep my eyes open.', to: 'again' }],
      },
      directions: {
        onEnter: (c) => {
          c.reveal('bazaar');
          c.reveal('cinder_creek');
        },
        text: '"East, a few days out, is the Crossroads Bazaar. Every trader in the Basin ends up there eventually, along with every thief who follows traders. North of here is Cinder Creek, farming folk, decent, poor as dirt. I\'ll mark both for you." He squints at your wrist-link. "Whatever that thing is."',
        options: [{ text: 'Thanks, Sheriff.', to: 'again' }],
      },
      tobin: {
        text: '"Corliss\'s brother. Nineteen, red hair, all elbows. He lost the family savings at Mott\'s tables, and a week later he was gone. I asked around; nobody saw a body, which in Rustwater counts as good news. Wick or Fitch might know which way he went. People tell bartenders and junk men things they wouldn\'t tell a badge."',
        options: [{ text: 'I\'ll ask them.', to: 'again' }],
      },
      warn: {
        text: 'Grell doesn\'t move, but the cup stops halfway to his mouth. "Is that so. Who says?"',
        options: [
          { text: 'Mott offered me the job himself. A staged robbery at the Tally House. You come running, a gun on the roof finishes it.', if: (c) => !!c.flag('rw_mottOffer'), to: 'warned' },
          { text: 'Word around the Tin Cup. Mott\'s boys are buying shells and asking about rooftops near the Tally House.', to: 'warned' },
          { text: 'Never mind.', to: 'again' },
        ],
      },
      warnlow: {
        text: 'Grell looks at you for a long moment. "Mott told you that?" You nod enthusiastically. "Wants me dead. Bang." He sighs. "Well. That\'s about as clear as anyone\'s ever put it."',
        options: [{ text: 'Yes. Bang.', lowInt: true, to: 'warned' }],
      },
      warned: {
        onEnter: (c) => {
          c.set('rw_warned');
          c.quest('rw_trouble', 'You warned Sheriff Grell about Mott\'s plan. He needs proof before he can move: Mott\'s ledger (in the safe in his office at the Lucky Rivet), or Harl Dobbs of the Tally House talking.');
        },
        text: '"I believe you." He sets the cup down very carefully. "Believing\'s free. Moving on Mott isn\'t. Half this town owes him scrip and the other half owes him teeth. If I drag him out of the Rivet on a stranger\'s word, I\'m the one who looks crooked, and his boys get to shoot me in daylight with the town\'s blessing."\n\n"I need proof. Something in his handwriting, or one of his men willing to talk."',
        options: [
          { text: 'Where would I find proof?', to: 'proofwhere' },
          { text: 'I took Mott\'s money. Let me play along, and we spring the trap on them.', if: (c) => !!c.flag('rw_mottJob'), to: 'doubleplay' },
          { text: 'Me find paper. Okay.', lowInt: true, to: 'proofwhere' },
        ],
      },
      proofwhere: {
        text: '"Mott keeps a black book. Every debt, every bribe, every favour, because a man like Mott can\'t stand not knowing what he\'s owed. It lives in the safe in his back office at the Rivet. He carries the key, and so does the big fellow who follows him around."\n\n"Or there\'s Harl Dobbs, who runs the Tally House for him. Harl\'s no hero. He\'s the kind who talks if he thinks the rope is closer than the payday."',
        options: [
          { text: 'I\'ll get you your proof.', to: 'again' },
          { text: 'Me get book. Or make Harl talk.', lowInt: true, end: true },
        ],
      },
      doubleplay: {
        onEnter: (c) => {
          c.set('rw_ambushReady');
          c.karma(20);
          c.quest('rw_trouble', 'Grell will let Mott\'s trap spring, on Mott\'s own men. Tell Harl at the Tally House you\'re ready, and be on the right side when the shooting starts.');
        },
        text: 'Grell almost smiles. "You took his money and then walked into my office. That\'s either very honest or very stupid, and I\'ve no time to find out which."\n\n"All right. Let the robbery go ahead. When Harl rings his bell I\'ll come, but not alone and not through the front door. You tell Harl you\'re ready, and when it starts, be standing on my side of it."',
        options: [
          { text: 'Deal.', end: true },
          { text: 'Me on your side. Bang bad men.', lowInt: true, end: true },
        ],
      },
      ambushwait: {
        text: '"Harl\'s waiting on your word. Keep your head down and your gun up, and don\'t shoot anybody wearing a hubcap."',
        options: [{ text: 'Understood.', end: true }],
      },
      proof: {
        onEnter: (c) => {
          c.set('rw_proofGiven');
          c.quest('rw_trouble', 'Grell has his proof. He wants you to go into the Lucky Rivet first and give Mott the chance to come quietly. Grell does not expect him to take it.');
        },
        text: 'Grell reads it, or hears it, twice. His jaw works. "That\'s enough to hang him, and enough for the Board to let me." He takes his gunbelt off the peg.\n\n"I\'ll gather the deputies. Do me a kindness: go into the Rivet ahead of us and tell Mott it\'s over. Give him the chance to walk out in cuffs. He won\'t take it, but I\'d like to be able to say he had it."',
        options: [
          { text: 'I\'ll talk to him.', end: true },
          { text: 'Me tell Mott. He go jail.', lowInt: true, end: true },
        ],
      },
      proofwait: {
        text: '"Mott\'s still sitting in the Rivet. Go tell him it\'s over. We\'ll be right behind you." He checks the cylinder of his revolver for the third time.',
        options: [{ text: 'On my way.', end: true }],
      },
      wrapup: {
        onEnter: (c) => wrapTrouble(c),
        text: (c) => {
          if (c.flag('rw_mottJailed')) return 'Grell hangs the brass key to the cell on a nail above his desk. "Silas Mott, in my jail. The Board voted for a trial, which means the Board is scared of me for once. Here." He counts out scrip. "Town\'s reward. It was going to be for whoever caught the Tally House robbers. Seems fair."';
          if (c.flag('rw_mottExiled')) return '"Walked out the gate with two suitcases and a lot of opinions about me," Grell says. "I\'d rather have hanged him, but I\'ll take a Rustwater without Mott in it. His boys scattered like chickens." He counts out scrip. "Town\'s reward. Don\'t spend it at the Rivet. The Rivet\'s closed."';
          return 'Grell looks older than he did this morning. "Mott\'s dead, and most of his boys with him. I won\'t pretend I\'ll miss him, and I won\'t pretend I like how it went." He counts out scrip. "Town\'s reward. You earned it. The Board will say it was their idea."';
        },
        options: [
          { text: 'Glad to help, Sheriff.', to: 'after' },
          { text: 'Yay! Scrip!', lowInt: true, end: true },
        ],
      },
      after: {
        text: '"The town\'s quieter. I don\'t trust it yet, but I\'m learning to sleep through the night again." He taps the hubcap star. "Anything you need in Rustwater, you ask."',
        options: [
          { text: 'Heard of anyone called Tobin Penn?', if: (c) => c.questState('rw_brother') === 'active', to: 'tobin' },
          { text: 'Where else is there to go around here?', to: 'directions' },
          { text: 'Take care, Sheriff.', end: true },
        ],
      },
    },
  },
  // ----------------------------------------------------------- deputies & guards
  {
    id: 'rw_deputy',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => c.flag('rw_hitDone')
          ? 'The deputy\'s eyes are red. "Sheriff\'s dead. Robbery at the Tally House, they say. Robbers got away clean, they say." A long pause. "Move along."'
          : ['"Deputy. Yes. Awake. What do you need?"', '"If you\'re here to report Mott\'s boys, take a number. The number is always one."', '"Sheriff says be polite to strangers until they give us a reason. So: hello."'][c.random(3)],
        options: [
          { text: 'How\'s the sheriff holding up?', if: (c) => grellAlive(c), to: 'sheriff' },
          { text: 'Nothing. Carry on.', end: true },
        ],
      },
      sheriff: {
        text: '"Tired. Grell\'s been sheriff eighteen years, and he\'s buried two deputies and one wife. Mott thinks that makes him soft." The deputy snorts. "It makes him patient. Not the same thing."',
        options: [{ text: 'Good to know.', end: true }],
      },
    },
  },
  {
    id: 'rw_gateguard',
    start: 'hello',
    nodes: {
      hello: {
        text: '"Rustwater. No shooting inside the walls unless you\'re the sheriff. No spitting in the pump. No fighting in the Rivet, and if you do, do it outside the Rivet." The guard eyes your jumpsuit. "Where\'d you come out of? A tin can?"',
        options: [
          { text: 'Something like that. What\'s worth seeing here?', to: 'see' },
          { text: 'What town is this?', lowInt: true, to: 'low' },
          { text: 'Just passing.', end: true },
        ],
      },
      see: {
        text: '"Clinic\'s north of the road, if you\'re leaking. Tin Cup next to it, if you\'re thirsty. Rivet\'s south, if you\'re rich and want to fix that. Sheriff\'s office by the gate. Scrapyard east. Don\'t pet the dog."',
        options: [{ text: 'Thanks.', end: true }],
      },
      low: {
        text: '"Rust. Water." He points at the pump, then at the rust, then at the water. "Rustwater."',
        options: [{ text: 'Ohhh.', lowInt: true, end: true }],
      },
    },
  },
  {
    id: 'rw_lonny',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A lanky man with a ponytail presses his face to the cell bars. "Hey. Hey, friend. You wouldn\'t happen to have a file? A spoon? A really determined rat?"',
        options: [
          { text: 'What are you in for?', to: 'why' },
          { text: 'Know anything about Mott\'s business?', to: 'mott' },
          { text: 'You stay put.', end: true },
        ],
      },
      why: {
        text: '"A car battery. One! And it wasn\'t even charged, so really, what did I steal? Potential. You can\'t arrest a man for potential." He considers. "Apparently you can."',
        options: [{ text: 'Back to my questions.', to: 'hello' }],
      },
      mott: {
        onEnter: (c) => {
          if (!c.flag('rw_heardPlot')) startTrouble(c, 'Lonny Pike, in Grell\'s jail, says Harl Dobbs of the Tally House has been bragging about a "big night" coming, and about who\'d be "retiring".');
        },
        text: '"Harl Dobbs drinks at the Tin Cup, and Harl Dobbs can\'t hold his drink. Last week he was going on about a big night at the Tally House, and a certain someone with a star \'retiring\'. Then he saw me listening and bought me a beer to forget it." He grins. "I have a very good memory for beer."',
        options: [{ text: 'Interesting. Thanks, Lonny.', end: true }],
      },
    },
  },
  // ----------------------------------------------------------- Fitch & the Tin Cup
  {
    id: 'rw_fitch',
    start: (c) => (c.flag('rw_metFitch') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('rw_metFitch'),
        text: 'The bartender is a bald man with a magnificent beard and a towel he never seems to use for anything. "Welcome to the Tin Cup. Everything we serve comes in a tin cup, which you\'ll appreciate once you\'ve seen what happens to glass round here. I\'m Fitch."',
        options: [
          { text: 'What are you pouring?', to: 'again' },
          { text: 'Beer! Beer please!', lowInt: true, to: 'lowbeer' },
          { text: 'Maybe later.', end: true },
        ],
      },
      again: {
        text: (c) => `"${c.flag('rw_stillFixed') ? 'My still\'s dripping like a spring morning, thanks to you. ' : ''}What\'ll it be?"`,
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'A drink and whatever\'s new. (5 scrip)', if: (c) => c.scrip() >= 5, to: 'rumour', do: (c) => { if (!c.flag('rw_stillFixed')) c.pay(5); c.give('beer'); } },
          { text: 'I hear things get tense around the Rivet.', if: (c) => !c.flag('rw_fitchPlot'), to: 'plot' },
          { text: 'Tell me about the scrapyard dog.', to: 'dog' },
          { text: 'Seen a young man called Tobin Penn?', if: (c) => c.questState('rw_brother') === 'active' && !c.flag('rw_tobinLead'), to: 'tobin' },
          { text: 'Where do your travellers come from?', to: 'places' },
          { text: 'What\'s wrong with the still?', if: (c) => !c.flag('rw_stillFixed'), to: 'still' },
          { text: 'Beer!', lowInt: true, to: 'lowbeer' },
          { text: 'See you, Fitch.', end: true },
        ],
      },
      lowbeer: {
        onEnter: (c) => {
          const ok = !!c.flag('rw_stillFixed') || c.pay(5);
          c.set('rw_fitchBroke', !ok);
          if (ok) c.give('beer');
        },
        text: (c) => (c.flag('rw_fitchBroke') ? 'Fitch looks at your empty hands. "Beer costs five scrip, friend. Come back when you\'ve got some."' : 'Fitch slides a tin cup across. "Don\'t drink it all at once. Actually, do. It\'s better that way."'),
        options: [
          { text: 'Mott bad man?', lowInt: true, to: 'plot' },
          { text: 'Thanks!', lowInt: true, end: true },
        ],
      },
      rumour: {
        text: (c) => {
          const act2 = !!c.flag('act2');
          const pool = [
            '"Caravan drovers say the east road out of the Bazaar is eating wagons whole. No bodies. Just empty wagons, when they come back at all."',
            '"Doc Sato used to work for the Keepers, up at their bunker. She won\'t say why she left. She won\'t say much of anything, for free."',
            '"Mott\'s croupier Nico wins nine rolls in ten. The tenth she lets you win, so you come back."',
            '"Folks in Calder are Withered. Skin like old boots. They don\'t like being stared at, so don\'t."',
            '"Bramble, that dog in the scrapyard, took a piece out of three Rivet boys last winter. Only honest judge of character in town."',
            act2 ? '"There\'s talk of big grey men with iron collars walking the roads at night. I don\'t believe it. I lock the door anyway."' : '"Some raiders up at a place called the Roost have been hitting farms around Cinder Creek. Nasty bunch."',
          ];
          return `Fitch leans on the bar. ${pool[c.random(pool.length)]}`;
        },
        options: [
          { text: 'Another round.', if: (c) => c.scrip() >= 5, to: 'rumour', do: (c) => { if (!c.flag('rw_stillFixed')) c.pay(5); c.give('beer'); } },
          { text: 'Something else.', to: 'again' },
        ],
      },
      plot: {
        onEnter: (c) => {
          c.set('rw_fitchPlot');
          if (!c.flag('rw_heardPlot')) startTrouble(c, 'Fitch at the Tin Cup says Mott\'s men are buying shells and asking which rooftops overlook the Tally House, where Sheriff Grell always answers robbery calls in person.');
        },
        text: 'Fitch polishes a cup that is already clean. "I don\'t hear things. That\'s my whole trade, not hearing things." He sets the cup down. "But if I did hear things, I might have heard Mott\'s boys buying shells by the box. And Harl Dobbs asking which roof has the best view of the Tally House door. And everyone knows Grell answers every robbery himself, because he\'s too stubborn to send a deputy to die in his place."',
        options: [
          { text: 'Sounds like someone should warn the sheriff.', to: 'again' },
          { text: 'Sounds like someone could make money.', to: 'money' },
          { text: 'Uh oh.', lowInt: true, end: true },
        ],
      },
      money: {
        text: '"Somebody could." Fitch looks at you flatly. "Somebody could also drink somewhere else afterwards."',
        options: [{ text: 'Noted.', to: 'again' }],
      },
      dog: {
        text: '"Bramble. Came in over the wall as a pup, stayed because Wick feeds him when he remembers. Won\'t let anyone touch him. But that dog will do anything for dried meat, and I sell dried meat. By coincidence."',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'Something else.', to: 'again' },
        ],
      },
      tobin: {
        onEnter: (c) => {
          c.set('rw_tobinLead');
          c.reveal('bazaar');
          c.quest('rw_brother', 'Fitch says Tobin Penn left Rustwater with an ox caravan heading east to the Crossroads Bazaar, working for his passage.');
        },
        text: '"Tobin? Sure. Sat right there crying into a free beer the night after Mott cleaned him out. Next morning I saw him walking out the gate beside a Longhaul ox train, heading east. Working for his passage, I\'d guess. The Bazaar\'s where everyone goes when they can\'t go home."',
        options: [{ text: 'Thanks, Fitch.', to: 'again' }],
      },
      places: {
        onEnter: (c) => {
          c.reveal('bazaar');
          c.reveal('cinder_creek');
        },
        text: '"Traders, mostly, from the Crossroads Bazaar, east of here. Farmers from Cinder Creek up north, when the crop\'s good enough to sell, which lately it isn\'t. And the odd lost soul in a blue suit." He looks at your jumpsuit. "Present company."',
        options: [{ text: 'Thanks.', to: 'again' }],
      },
      still: {
        text: '"The float valve\'s seized. It\'s a pre-war water heater, and whoever built it didn\'t expect it to make ale for sixty years. If you\'re good with your hands, have a look. Fix it, and you drink here free for life. Or until I forget, which is similar."',
        options: [{ text: 'I\'ll take a look.', to: 'again' }],
      },
    },
  },
  {
    id: 'rw_absalom',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => ['Old Absalom squints at you through a haze of Dust Ale. "You\'re from underground. I can tell. You\'ve got that pale look. Like a mushroom. A nice mushroom."', 'Old Absalom raises his cup. "To the sky! Which is still up there. Checked this morning."', 'Old Absalom whispers: "I was at the Cathedral once. The glass one, on the cliffs. It sings at night. Don\'t go. Or go. I\'m not your mother."'][c.random(3)],
        options: [
          { text: 'Buy him a drink. (5 scrip)', if: (c) => c.scrip() >= 5 && !c.flag('rw_absalomDrink'), to: 'drink', do: (c) => { c.pay(5); c.set('rw_absalomDrink'); } },
          { text: 'Leave him to it.', end: true },
        ],
      },
      drink: {
        text: '"A saint! A saint in a jumpsuit!" He drinks half, then leans in. "Here\'s one for you. There\'s a cache under the south wall, outside, where the smugglers used to come in. Box behind the wall, near the far corner. Nobody remembers it but me, and I barely remember me."',
        options: [{ text: 'Thanks, Absalom.', end: true }],
      },
    },
  },
  {
    id: 'rw_deza',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A broad-shouldered woman with metal dust ground into every line of her hands. "Deza. I pull copper out of the old freeway. You looking for work, I\'m looking for a partner who isn\'t afraid of tunnels. You don\'t look like that, no offence."',
        options: [
          { text: 'None taken. What\'s the freeway like?', to: 'freeway' },
          { text: 'What do you think of Mott?', to: 'mott' },
          { text: 'Good luck with the copper.', end: true },
        ],
      },
      freeway: {
        text: '"Buried half a mile deep in places, all cars and concrete. Warm down there, which is how you know it\'s wrong. I bring a counter and turn back when it starts singing." She taps a rad counter on her belt, repaired with wire.',
        options: [{ text: 'Back to it.', to: 'hello' }],
      },
      mott: {
        text: '"I pay him a tenth of every haul to \'protect\' it, from his own boys mostly." She spits into a tin. "If somebody put Grell in the ground, I\'d pay a third. Some of us remember what this town was before the sheriff."',
        options: [{ text: 'I see.', to: 'hello' }],
      },
    },
  },
  {
    id: 'rw_tilly',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A woman with bright red hair shuffles a deck of cards with one hand. "Tilly Vane. Cards, if you\'re brave. Advice, if you\'re smart. Advice is cheaper."',
        options: [
          { text: 'I\'ll take the advice.', to: 'advice' },
          { text: 'Cards?', to: 'cards' },
          { text: 'No thanks.', end: true },
        ],
      },
      advice: {
        text: '"Never play Nico\'s dice unless you\'ve got a knack for luck, and never, ever get caught palming a die in the Rivet. Mott\'s boys break the hand you did it with, and then ask which one it was." She smiles. "Also: don\'t trust redheads."',
        options: [{ text: 'Noted.', to: 'hello' }],
      },
      cards: {
        text: '"No, sweetheart. I\'ve seen your face. You\'d lose your jumpsuit, and nobody here wants that." She fans the deck. "Try Nico\'s dice at the Rivet if you have to lose money."',
        options: [{ text: 'Fair enough.', end: true }],
      },
    },
  },
  // ----------------------------------------------------------- Doc Sato
  {
    id: 'rw_sato',
    start: (c) => (c.flag('rw_metSato') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('rw_metSato'),
        text: 'A small woman in a spotless white coat, which in Rustwater must take constant effort, looks up from a tray of steaming instruments. "Imani Sato. I\'m the doctor. If you\'re bleeding, sit on the bed. If you\'re selling, I\'m not buying. If you\'re dying, please do it on the concrete, it mops better."',
        options: [
          { text: 'Can you patch me up?', to: 'again' },
          { text: 'Me hurt. Fix?', lowInt: true, to: 'heal' },
          { text: 'Not today, Doctor.', end: true },
        ],
      },
      again: {
        text: (c) => `"${c.flag('rw_grellSaved') ? 'The sheriff says your treatments are on the town. The town doesn\'t know that yet. ' : ''}What do you need?"`,
        options: [
          { text: (c) => `Heal me. (${healCost(c)} scrip)`, if: (c) => c.scrip() >= healCost(c), to: 'heal' },
          { text: 'Flush the radiation out of me. (100 scrip)', if: (c) => c.scrip() >= 100, to: 'rads' },
          { text: 'I\'d like to buy medicine.', barter: true, any: true },
          { text: 'About that patient with the fever...', if: (c) => !c.flag('rw_welderDone'), to: 'patient' },
          { text: 'You worked for the Keepers?', to: 'keepers' },
          { text: 'Me hurt. Fix?', lowInt: true, to: 'heal' },
          { text: 'Goodbye, Doctor.', end: true },
        ],
      },
      heal: {
        onEnter: (c) => {
          const cost = healCost(c);
          if (!c.pay(cost)) {
            c.set('rw_satoNoPay');
            return;
          }
          c.set('rw_satoNoPay', false);
          c.heal(999);
          c.advance(45);
        },
        text: (c) => c.flag('rw_satoNoPay')
          ? '"Scrip first. I don\'t like it either, but the hypos don\'t grow on trees. Nothing grows on trees. There are no trees."'
          : 'Forty-five minutes of stitching, swabbing and one moment where she says "hm" in a way you do not like. You feel a great deal better.',
        options: [{ text: 'Thanks, Doc.', end: true }],
      },
      rads: {
        onEnter: (c) => {
          if (c.pay(100)) {
            c.rads(-(G.state.player.rads));
            c.advance(120);
          }
        },
        text: '"Lie down. This will be unpleasant for you and dull for me." Two hours and an IV bag of chelating fluid later, your rad counter has stopped muttering to itself.',
        options: [{ text: 'Thanks.', end: true }],
      },
      patient: {
        text: '"The welder. Burned his forearm on a cutting torch, didn\'t tell anyone for a week, and now it\'s infected down to the bone. I\'ve cleaned it, but the fever won\'t break, and I\'m out of the good antibiotics. There\'s a stronger option, cutting away the dead tissue, but my hands aren\'t what they were and my orderly faints."',
        options: [
          { text: '[Doctor] Let me assist. I\'ll hold the retractor and you cut.', skill: { key: 'doctor', diff: 20 }, to: 'surgery', fail: 'surgeryfail' },
          { text: 'Give him one of my root poultices.', if: (c) => c.has('curePaste'), to: 'poultice', do: (c) => c.take('curePaste') },
          { text: 'Sorry, I can\'t help.', to: 'again' },
        ],
      },
      surgery: {
        onEnter: (c) => {
          c.set('rw_welderDone');
          c.karma(15);
          c.give('hypo', 2);
          c.advance(60);
        },
        text: 'An hour later the welder is asleep and breathing easily, and Doc Sato is washing her hands for the fourth time. "Steady hands. You were a doctor, down in your hole?" She presses two mend-hypos into your palm. "Payment. Don\'t argue, I\'ve had a long day."',
        options: [{ text: 'Glad to help.', end: true }],
      },
      surgeryfail: {
        onEnter: (c) => c.advance(60),
        text: 'You hold the retractor at the wrong angle and she has to stop twice. It\'s done, eventually, but the welder will lose some grip in that hand. "Not your fault," Sato says tiredly. "It was always going to be bad. Thank you for trying."',
        options: [{ text: 'I\'m sorry.', end: true, do: (c) => c.set('rw_welderDone') }],
      },
      poultice: {
        onEnter: (c) => {
          c.set('rw_welderDone');
          c.karma(10);
          c.give('scrip', 60);
        },
        text: 'Sato sniffs the poultice. "Cinder Creek root mash. Crude, but it pulls infection like nothing else." She applies it herself. "That should break the fever. Here, for your trouble. Don\'t argue."',
        options: [{ text: 'Thanks.', end: true }],
      },
      keepers: {
        text: '"Six years. They took me in, taught me what medicine used to be, and let me read books with pictures of organs in them." Her mouth tightens. "Then they decided their books were worth more than the people outside their door who needed what\'s in them. I disagreed. Loudly. Now I\'m here." She goes back to her instruments. "Their bunker is north of the Bazaar, if you want to meet them. They\'ll be polite. That\'s the worst part."',
        options: [{ text: 'I see.', to: 'again' }],
      },
    },
  },
  {
    id: 'rw_patient',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => (c.flag('rw_welderDone') ? 'The welder is asleep, snoring gently, his bandaged arm propped on a folded blanket.' : 'A sweating man mutters to himself, clutching a bandaged forearm. "Hot... so hot... did anyone feed the chickens? We don\'t have chickens..."'),
        options: [{ text: 'Leave him be.', end: true }],
      },
    },
  },
  {
    id: 'rw_juniper',
    start: 'hello',
    nodes: {
      hello: {
        text: '"I\'m the orderly. I order things. Bandages, mostly. Sometimes people, to lie down." She lowers her voice. "The Doc\'s safe has the good hypos in it. I\'m only telling you so you\'ll know I\'ll notice."',
        options: [{ text: 'Understood.', end: true }],
      },
    },
  },
  // ----------------------------------------------------------- Silas Mott
  {
    id: 'rw_mott',
    start: (c) => {
      if (c.flag('rw_proofGiven') && grellAlive(c)) return 'confront';
      if (c.flag('rw_hitDone') || (c.flag('rw_mottJob') && !grellAlive(c))) return 'paid';
      if (c.flag('rw_mottJob')) return 'jobwait';
      return c.flag('rw_metMott') ? 'again' : 'hello';
    },
    nodes: {
      hello: {
        onEnter: (c) => c.set('rw_metMott'),
        text: 'Silas Mott is a soft, pale man in a waistcoat stitched from an old flag, with rings on every finger and a deck of aluminium cards dancing between them. He looks delighted to see you, the way a cat looks delighted to see a moth.\n\n"A new face! New faces are my favourite. They haven\'t learned the odds yet."',
        options: [
          { text: 'You own this place?', to: 'own' },
          { text: 'What\'s the game here?', to: 'games' },
          { text: 'I\'m looking for work.', to: 'offer' },
          { text: 'Shiny cards!', lowInt: true, to: 'lowhello' },
          { text: 'Just looking.', end: true },
        ],
      },
      again: {
        text: '"Back again. The house always welcomes a return customer. The house insists on it, in fact."',
        options: [
          { text: 'You own this place?', to: 'own' },
          { text: 'What\'s the game here?', to: 'games' },
          { text: 'I\'m looking for work.', if: (c) => !c.flag('rw_mottOffer'), to: 'offer' },
          { text: 'About your offer. I\'m in.', if: (c) => !!c.flag('rw_mottOffer') && grellAlive(c), to: 'accept', do: (c) => acceptHit(c) },
          { text: 'Tobin Penn owes you money?', if: (c) => c.questState('rw_brother') === 'active', to: 'tobin' },
          { text: 'Me want job!', lowInt: true, if: (c) => grellAlive(c), to: 'lowjob' },
          { text: 'Goodbye, Mott.', end: true },
        ],
      },
      lowhello: {
        text: '"They\'re rivets," he says, amused, "stamped into cards. Want to play? No? Then run along, sweetheart, before you swallow one."',
        options: [
          { text: 'Me want job!', lowInt: true, if: (c) => grellAlive(c), to: 'lowjob' },
          { text: 'Bye.', lowInt: true, end: true },
        ],
      },
      lowjob: {
        onEnter: (c) => {
          c.set('rw_mottOffer');
          c.set('rw_heardPlot');
          c.quest('rw_trouble', 'Silas Mott wants you to shoot the man with the star, the sheriff, when he comes running to a robbery at the Tally House.');
        },
        text: 'He weighs you like a sack of scrap. "Can you point a gun where I point my finger?" He points. "See that star on the man by the gate? When he comes to the Tally House, bang. Two hundred now. Four hundred after."',
        options: [
          { text: 'Yes! Point gun! Scrip!', lowInt: true, to: 'accept', do: (c) => acceptHit(c) },
          { text: 'No. Star man nice.', lowInt: true, end: true },
        ],
      },
      own: {
        text: '"I own the Lucky Rivet, the Tally House, most of the debts in Rustwater and a modest collection of hats." He flips a card: the queen of rivets. "The sheriff owns a badge he made himself. We all have our hobbies."',
        options: [{ text: 'Charming.', to: 'again' }],
      },
      games: {
        text: '"Dice, cards, and the eternal human hope that this time will be different. Nico runs the dice table: Rivets and Pins, two dice each, high roll wins. Very honest. Honesty is terrible for business, so I only allow it at the one table."',
        options: [{ text: 'I\'ll take a look.', to: 'again' }],
      },
      offer: {
        onEnter: (c) => {
          c.set('rw_mottOffer');
          startTrouble(c, 'Silas Mott wants to hire you to kill Sheriff Grell. His man Harl will stage a robbery at the Tally House; Grell always answers in person; a "roof gun" does the rest. Six hundred scrip.');
        },
        text: 'Mott\'s smile doesn\'t change, but he leans in. "Work. How refreshing. Most people come in here looking for luck."\n\n"I have a delicate job. The sheriff and I have reached the end of our friendship. In a few days my associate Harl will be tragically robbed at the Tally House. Grell always comes running, alone, because he\'s a hero, and heroes are predictable. I\'d like a steady hand on the roof across the lane when he does. Six hundred scrip. Two hundred now, as a gesture."',
        options: [
          { text: 'I\'m in.', to: 'accept', do: (c) => acceptHit(c) },
          { text: 'You\'re talking about murder.', to: 'murder' },
          { text: '[Speech] Why tell a stranger something like that?', skill: { key: 'speech', diff: 30 }, to: 'why', fail: 'whyfail' },
          { text: 'I\'ll think about it.', to: 'think' },
        ],
      },
      accept: {
        text: '"Splendid." Two hundred scrip appear on the felt as if they grew there. "Harl runs the Tally House, south side, the brick one. When you\'re ready, tell him so, and he\'ll ring the bell. And friend? If you\'re thinking of walking over to the sheriff with this story..." He smiles. "Don\'t. My boys are very bad losers."',
        options: [
          { text: 'Understood.', end: true },
          { text: 'Okay! Bye!', lowInt: true, end: true },
        ],
      },
      murder: {
        text: '"I\'m talking about retirement. Grell simply isn\'t the pension type." He fans his cards. "Think it over. The offer stands, and so does my patience, briefly."',
        options: [{ text: 'I\'ll think about it.', to: 'think' }],
      },
      why: {
        text: '"Because strangers leave. Because my own boys have mothers in this town, and mothers talk." He taps the table. "And because you walked in here like someone who does what needs doing, and then sleeps fine. Was I wrong?"',
        options: [
          { text: 'I\'m in.', to: 'accept', do: (c) => acceptHit(c) },
          { text: 'I\'ll think about it.', to: 'think' },
        ],
      },
      whyfail: {
        text: '"Because I like your face," he says, and it\'s obviously a lie, and he obviously doesn\'t care that you know it.',
        options: [
          { text: 'I\'m in.', to: 'accept', do: (c) => acceptHit(c) },
          { text: 'I\'ll think about it.', to: 'think' },
        ],
      },
      think: {
        text: '"Do. Thinking is free here. Everything else has a price."',
        options: [{ text: 'Goodbye.', end: true }],
      },
      tobin: {
        text: '"Two hundred scrip and change. A sweet boy with no head for numbers. He ran rather than pay, which is disappointing but not surprising." Mott shrugs. "If you see him, remind him that debts don\'t die. They just get more interesting."',
        options: [{ text: 'I\'ll pass it on.', to: 'again' }],
      },
      jobwait: {
        text: '"Harl\'s waiting at the Tally House. He\'s not a patient man, and I\'m even less of one. Go and be useful."',
        options: [
          { text: 'On my way.', end: true },
          { text: 'Okay.', lowInt: true, end: true },
        ],
      },
      paid: {
        onEnter: (c) => {
          if (!c.flag('rw_mottPaid')) {
            c.set('rw_mottPaid');
            c.give('scrip', 400);
            c.questDone('rw_trouble', 'Sheriff Grell is dead, and Silas Mott owns Rustwater. You were paid in full.');
          }
        },
        text: '"Ah. The hero of the hour." Mott counts four hundred scrip onto the felt, slowly, so you can watch. "A terrible tragedy at the Tally House. The Board is heartbroken. They\'ve asked me to keep order until a new sheriff can be found. They\'ll be looking for years, I expect."',
        options: [
          { text: 'Pleasure doing business.', end: true },
          { text: 'Scrip!', lowInt: true, end: true },
        ],
      },
      confront: {
        text: 'Mott doesn\'t look up from his cards. "The sheriff\'s new dog. And by the look on your face: it\'s over, is it?"',
        options: [
          { text: 'It\'s over, Mott. Grell\'s outside. Come quietly.', to: 'refuses' },
          { text: '[Speech] Leave tonight with what you can carry, and nobody dies.', skill: { key: 'speech', diff: 45 }, to: 'exile', fail: 'refuses' },
          { text: '[Gambling] Cut the deck. High card, you walk out in cuffs. Low card, I walk away and you never see me again.', skill: { key: 'gambling', diff: 35 }, to: 'cut', fail: 'cutlose' },
          { text: 'Sheriff say you go jail now.', lowInt: true, to: 'refuses' },
          { text: 'Actually, I\'ll come back.', end: true },
        ],
      },
      refuses: {
        text: '"No," he says pleasantly, and snaps his fingers. Every Rivet Boy in the room stands up at once.',
        options: [{ text: '[Fight]', any: true, combat: true, do: (c) => makeAllies(c) }],
      },
      exile: {
        onEnter: (c) => {
          c.set('rw_mottExiled');
          c.remove('mott');
          c.remove('rw_bodyguard');
          c.karma(25);
          c.quest('rw_trouble', 'Silas Mott has left Rustwater. Tell Sheriff Grell.');
        },
        text: 'Mott studies you for a long time. Then he sweeps his cards into his pocket. "The Bazaar has always had better weather." He stands, shrugs on a coat, and nods to his bodyguard. "You\'ll find the town is very dull without me. Everyone does."\n\nHe walks out of the Rivet and out of Rustwater, and doesn\'t look back once.',
        options: [{ text: 'Goodbye, Mott.', end: true }],
      },
      cut: {
        onEnter: (c) => {
          c.set('rw_mottJailed');
          c.remove('mott');
          c.karma(20);
          c.quest('rw_trouble', 'Silas Mott lost a cut of the deck and walked himself to Grell\'s cell. Tell the sheriff.');
        },
        text: 'He cuts. Four of nails. You cut. The queen of rivets.\n\nMott stares at the card for a long moment. "I\'m a man who pays his debts," he says at last, and holds out his wrists, and somehow that is the most frightening thing he has done.',
        options: [{ text: 'Let\'s go.', end: true }],
      },
      cutlose: {
        text: 'He cuts. The king of rivets. You cut. Two of nails.\n\n"House wins," Mott says softly. "House always wins." He snaps his fingers.',
        options: [{ text: '[Fight]', any: true, combat: true, do: (c) => makeAllies(c) }],
      },
    },
  },
  {
    id: 'rw_doorman',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => (c.flag('rw_diceHot') ? '"You again. Mister Mott says you\'re lucky. Mister Mott doesn\'t like lucky." He cracks his knuckles. "Enjoy the Rivet."' : '"Lucky Rivet. No guns drawn, no fighting, no crying at the tables. Crying\'s bad for business."'),
        options: [{ text: 'Got it.', end: true }],
      },
    },
  },
  // ----------------------------------------------------------- dice
  {
    id: 'rw_nico',
    start: (c) => (c.flag('rw_diceBanned') ? 'banned' : 'hello'),
    nodes: {
      hello: {
        text: (c) => `A sharp-faced woman in black rolls two steel dice across her knuckles. "Rivets and Pins. Two dice each: you throw, I throw, high total takes it. Pays even money. Ties go to the house, because it\'s the house."\n\n(Your Gambling skill: ${c.skill('gambling')}%. You have ${c.scrip()} scrip.)`,
        options: [
          { text: 'Bet 10 scrip.', if: (c) => c.scrip() >= 10, to: 'result', do: (c) => rollDice(c, 10) },
          { text: 'Bet 50 scrip.', if: (c) => c.scrip() >= 50, to: 'result', do: (c) => rollDice(c, 50) },
          { text: 'Bet 200 scrip.', if: (c) => c.scrip() >= 200, to: 'result', do: (c) => rollDice(c, 200) },
          { text: '[Steal] Palm a loaded pair from your sleeve and bet 100.', if: (c) => c.scrip() >= 100 && !c.flag('rw_diceCheated'), skill: { key: 'steal', diff: 30 }, to: 'cheatok', fail: 'cheatcaught', do: (c) => c.set('rw_diceCheated') },
          { text: 'Me roll dice! Ten scrip!', lowInt: true, if: (c) => c.scrip() >= 10, to: 'result', do: (c) => rollDice(c, 10) },
          { text: 'Who taught you to throw like that?', to: 'nico' },
          { text: 'I\'ll sit this one out.', end: true },
        ],
      },
      result: {
        text: (c) => diceText(c),
        options: [
          { text: 'Again, same stakes.', if: (c) => { const r = c.flag('rw_diceLast'); return !!r && !r.none && c.scrip() >= r.bet && !c.flag('rw_diceHot'); }, to: 'result', do: (c) => rollDice(c, c.flag('rw_diceLast').bet) },
          { text: 'Change my bet.', if: (c) => !c.flag('rw_diceHot'), to: 'hello' },
          { text: 'I\'m done for now.', if: (c) => !c.flag('rw_diceHot'), end: true },
          { text: 'Huh?', if: (c) => !!c.flag('rw_diceHot'), to: 'hot', any: true },
        ],
      },
      hot: {
        onEnter: (c) => {
          c.set('rw_diceBanned');
          c.set('rw_diceHot');
        },
        text: 'A heavy hand settles on your shoulder. It belongs to one of the Rivet Boys, and he is smiling with all of his remaining teeth. "Mister Mott says congratulations. Mister Mott says the table is closed. For you. For ever."\n\nNico shrugs apologetically. "House rules, honey. Nobody leaves richer than the house."',
        options: [{ text: 'Fine. I know when I\'m ahead.', end: true }],
      },
      cheatok: {
        onEnter: (c) => rollDice(c, 100, true),
        text: (c) => `You swap the house dice for your own with a flick you practised on a hundred bored evenings. Nobody blinks.\n\n${diceText(c)}\n\nYou swap the honest pair back before Nico reaches for them. Once is luck; twice is a broken hand.`,
        options: [{ text: 'Walk away while you can.', end: true }],
      },
      cheatcaught: {
        onEnter: (c) => {
          c.set('rw_diceBanned');
          c.hurt(8);
          c.karma(-5);
        },
        text: 'Your loaded die bounces off the rail, rolls across the felt, and comes to rest on a six. Then it wobbles, as if thinking about it, and settles on another six. Nico looks at it. Then at you.\n\nTwo Rivet Boys walk you to the door, and one of them teaches your ribs a short lesson on the way. "Come back to drink," Nico calls after you. "Don\'t come back to play."',
        options: [{ text: 'Ow.', any: true, end: true }],
      },
      banned: {
        text: '"Table\'s closed, honey. For you, it\'s closed for ever. Nothing personal. Well, a little personal."',
        options: [{ text: 'Fine.', end: true }],
      },
      nico: {
        text: '"My mother. She ran a table at the Bazaar until someone caught her with a loaded pair and took two of her fingers." Nico holds up both hands, all ten fingers intact. "She taught me to never need a loaded pair."',
        options: [{ text: 'Back to the dice.', to: 'hello' }],
      },
    },
  },
  // ----------------------------------------------------------- Harl
  {
    id: 'rw_harl',
    start: (c) => {
      if (c.flag('rw_ambushDone') || c.flag('rw_hitDone')) return 'after';
      if (c.flag('rw_mottJob') && grellAlive(c)) return 'job';
      return 'hello';
    },
    nodes: {
      hello: {
        text: 'A broad man with a split lip counts scrip behind a steel grille. "Tally House. You changing money, it\'s a tenth to the house. You\'re not changing money, you\'re leaving."',
        options: [
          { text: '[Speech] Mott\'s going to let you hang for Grell. You know that, right?', if: (c) => !!c.flag('rw_warned') && !c.flag('rw_harlConfessed') && !mottGone(c), skill: { key: 'speech', diff: 40 }, to: 'confess', fail: 'clam' },
          { text: '[Strength] Reach through the grille and take a handful of his shirt. "Talk."', if: (c) => !!c.flag('rw_warned') && !c.flag('rw_harlConfessed') && !mottGone(c), stat: { key: 'STR', min: 7 }, to: 'confess' },
          { text: 'A hundred and fifty scrip says you tell me about the "robbery" you\'re planning.', if: (c) => !!c.flag('rw_warned') && !c.flag('rw_harlConfessed') && c.scrip() >= 150 && !mottGone(c), to: 'confess', do: (c) => c.pay(150) },
          { text: 'You plan robbery? For Mott?', lowInt: true, if: (c) => !c.flag('rw_harlConfessed') && !mottGone(c), to: 'lowask' },
          { text: 'I\'m leaving.', end: true },
        ],
      },
      lowask: {
        onEnter: (c) => {
          if (!c.flag('rw_heardPlot')) startTrouble(c, 'Harl Dobbs at the Tally House panicked when you asked about a robbery for Mott. Something is going on.');
        },
        text: 'Harl blinks. "Who told you... I mean, no. No robbery. Get out." He is sweating now. "GET OUT."',
        options: [{ text: 'Okay.', lowInt: true, end: true }],
      },
      clam: {
        text: '"Nice try." Harl spits through the grille. "Mott looks after his own. Now clear off before I remember your face."',
        options: [{ text: 'Fine.', end: true }],
      },
      confess: {
        onEnter: (c) => {
          c.set('rw_harlConfessed');
          c.quest('rw_trouble', 'Harl Dobbs admitted the Tally House "robbery" is a setup to kill Grell. He\'ll say so to the sheriff, if it keeps his neck out of a noose.');
        },
        text: 'Harl\'s eyes flick to the door, then back. The fight goes out of him all at once. "It was his idea. All of it. I just ring the bell and hand over the till, the sheriff comes in, somebody on the roof... I never shot anybody. I count money."\n\n"You tell Grell I talked, and I want it written down that I talked first. You hear me? First."',
        options: [{ text: 'I\'ll tell him.', end: true }],
      },
      job: {
        text: '"You\'re the roof gun. Good." Harl points through the window. "Ladder\'s round the back of the shack across the lane. When I bang the bell, Grell comes running. You take the shot when he\'s in the doorway. Simple." He wipes his hands on his trousers. "You ready or not?"',
        options: [
          { text: 'Ring the bell. Let\'s do it.', if: (c) => !c.flag('rw_ambushReady'), to: 'hit' },
          { text: 'You pull the trigger, I\'ll hold the door.', if: (c) => !c.flag('rw_ambushReady'), to: 'hitHarl' },
          { text: 'Ring the bell. I\'m ready.', if: (c) => !!c.flag('rw_ambushReady'), to: 'ambush' },
          { text: 'Ring bell! Bang!', lowInt: true, to: 'hit', if: (c) => !c.flag('rw_ambushReady') },
          { text: 'Ring bell!', lowInt: true, to: 'ambush', if: (c) => !!c.flag('rw_ambushReady') },
          { text: 'Not yet.', end: true },
        ],
      },
      hit: {
        onEnter: (c) => doHit(c, true),
        text: 'Harl rings the bell and starts shouting about thieves. You lie flat on the hot tin roof across the lane with the sun on your neck.\n\nGrell comes, just as Mott said: alone, fast, gun drawn, too stubborn to send anyone else. He stops in the doorway of the Tally House and looks up, straight at your roof, as if he knew. Maybe he did.\n\nYou don\'t miss.',
        options: [{ text: 'Walk away.', any: true, end: true }],
      },
      hitHarl: {
        onEnter: (c) => doHit(c, false),
        text: 'Harl rings the bell. You stand in the Tally House doorway with your back to the street, and when Grell comes running, you step aside at exactly the right moment.\n\nHarl\'s gun is very loud in the little brick room. Afterwards he is sick in a bucket. You are not.',
        options: [{ text: 'Walk away.', any: true, end: true }],
      },
      ambush: {
        text: 'Harl rings the bell and starts shouting. For a heartbeat nothing happens. Then Grell steps out of the alley, not the street, with both deputies at his back and his revolver already up, and Harl\'s face goes the colour of old paper.\n\n"You sold us," he breathes, staring at you. "You sold us, you..."\n\nAcross town, somebody at the Rivet starts yelling.',
        options: [{
          text: '[Fight]', any: true, do: (c) => {
            c.set('rw_ambushDone');
            c.quest('rw_trouble', 'The ambush is sprung. Mott\'s men are fighting Grell, his deputies, and you.');
            makeAllies(c);
            c.hostile('rw_thugs');
          },
        }],
      },
      after: {
        text: (c) => (c.flag('rw_hitDone') ? 'Harl won\'t look at you. "Go away. Please. Just... go away."' : '"We\'re closed."'),
        options: [{ text: 'Leave.', end: true }],
      },
    },
  },
  // ----------------------------------------------------------- Corliss & Tobin
  {
    id: 'rw_corliss',
    start: (c) => {
      if (c.questState('rw_brother') === 'done') return 'after';
      if (c.flag('rw_tobinHome')) return 'home';
      if (c.questState('rw_brother') === 'active') return 'waiting';
      return 'hello';
    },
    nodes: {
      hello: {
        text: 'A thin woman with a copper-red bun is mending a net of braided wire by the light of the door. She looks up with a hope that she quickly packs away. "You\'re not from here. You travel? Then maybe you\'ve seen my brother. Tobin. Nineteen, red hair like mine, laughs like a mule."',
        options: [
          { text: 'What happened to him?', to: 'story' },
          { text: 'Brother lost?', lowInt: true, to: 'story' },
          { text: 'Sorry, I haven\'t.', end: true },
        ],
      },
      story: {
        text: '"He lost our savings at the Rivet. Every scrip, all of it, the money for the new roof. Two years of my net-mending." She pulls a knot tight, too hard. "Then he was gone. Some people say Mott\'s boys took him to work off the debt. Some say he ran. I don\'t care which. I just want to know he\'s breathing."',
        options: [
          { text: 'I\'ll find him.', to: 'accept' },
          { text: 'Me find brother!', lowInt: true, to: 'accept' },
          { text: 'I can\'t promise anything.', end: true },
        ],
      },
      accept: {
        onEnter: (c) => c.quest('rw_brother', 'Corliss Penn asked you to find her brother Tobin, who lost the family savings at the Lucky Rivet and vanished. Fitch at the Tin Cup or Wick at the scrapyard may know where he went.'),
        text: '"Thank you." She says it like it costs her something. "Ask Fitch at the Tin Cup, Tobin drank there. And Wick, at the scrapyard. Tobin sold him things when we were short. I\'ve nothing to pay you with but I\'ll find something, I swear."',
        options: [{ text: 'I\'ll be back.', end: true }],
      },
      waiting: {
        text: '"Any word of Tobin?"',
        options: [
          { text: 'I found him at the Crossroads Bazaar. He\'s alive and working for a caravan company.', if: (c) => !!c.flag('rw_tobinFound'), to: 'foundnohome' },
          { text: 'Not yet.', end: true },
        ],
      },
      foundnohome: {
        text: '"Alive." She sits down on the bed, hard. "Alive, and not coming home." It isn\'t a question. "Did you tell him... no. Go back, if you can. Tell him I don\'t care about the roof. The roof\'s been leaking for twenty years. I can live under a leak."',
        options: [{ text: 'I\'ll try again.', end: true }],
      },
      home: {
        onEnter: (c) => {
          c.questDone('rw_brother', 'Tobin Penn is home with his sister.');
          c.karma(30);
          c.give('revolver44');
          c.give('ammo44', 12);
        },
        text: 'Corliss has her arms around her brother\'s neck and doesn\'t seem inclined to let go. Over his shoulder she mouths "thank you" twice, then gives up and says it aloud.\n\nLater she presses a cloth bundle into your hands: an old revolver, oiled and wrapped with care. "Our father\'s. Tobin would only lose it at cards."',
        options: [{ text: 'Take care of each other.', end: true }],
      },
      after: {
        text: '"We\'re putting the roof on ourselves. Tobin\'s terrible at it." She\'s smiling. "It\'s wonderful."',
        options: [{ text: 'Good to hear.', end: true }],
      },
    },
  },
  {
    id: 'rw_tobinHome',
    start: 'hello',
    nodes: {
      hello: {
        text: 'Tobin grins sheepishly. "She hasn\'t stopped feeding me. I think it\'s a punishment. It\'s a very good punishment." He lowers his voice. "Thanks. I mean it. I\'m never touching dice again."',
        options: [{ text: 'See that you don\'t.', end: true }],
      },
    },
  },
  // ----------------------------------------------------------- scrapyard
  {
    id: 'rw_wick',
    start: (c) => (c.flag('rw_metWick') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('rw_metWick'),
        text: 'An old man in a welder\'s cap sits on an upturned crate, sorting bolts by size into coffee tins. "Wick Harrow. I buy scrap, I sell scrap, and in between I sit here and think about scrap. Also, that\'s my dog. Well. That\'s the dog. He\'s nobody\'s."',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'Tell me about the dog.', to: 'dog' },
          { text: 'Me buy stuff!', lowInt: true, barter: true },
          { text: 'Goodbye.', end: true },
        ],
      },
      again: {
        text: '"Back again. Scrap\'s the same as yesterday, only rustier."',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'Tell me about the dog.', to: 'dog' },
          { text: 'Did Tobin Penn sell you anything before he left?', if: (c) => c.questState('rw_brother') === 'active' && !c.flag('rw_tobinLead'), to: 'tobin' },
          { text: 'Where does all this scrap come from?', to: 'scrap' },
          { text: 'Goodbye.', end: true },
        ],
      },
      dog: {
        text: (c) => (c.flag('rw_brambleFriend')
          ? '"Well, would you look at that. Bramble picked somebody." Wick blows his nose loudly. "Dust. Look after him. He likes his belly scratched, and he hates men in hats, which is inconvenient for me."'
          : '"Bramble. Came over the wall as a pup six winters back. Took a piece out of three of Mott\'s boys last year and none of anybody else, so I figure he\'s a better judge of people than the Board." He scratches his beard. "Won\'t let you near him, mind. Unless you\'ve got dried meat. Then he\'s anybody\'s for about four seconds."'),
        options: [
          { text: 'Sell me some dried meat, then.', barter: true, any: true },
          { text: 'Back to business.', to: 'again' },
        ],
      },
      tobin: {
        onEnter: (c) => {
          c.set('rw_tobinLead');
          c.reveal('bazaar');
          c.quest('rw_brother', 'Wick says Tobin sold him his good boots for road rations, and said he was going east to the Crossroads Bazaar to find caravan work.');
        },
        text: '"His good boots. Boots! A man doesn\'t sell his boots unless he\'s planning to walk far in bad ones." Wick nods at the east wall. "Said he was going to the Crossroads Bazaar to find caravan work. Said he couldn\'t look his sister in the eye. Silly boy. She\'d have hit him with a frying pan and then made him dinner."',
        options: [{ text: 'Thanks, Wick.', to: 'again' }],
      },
      scrap: {
        onEnter: (c) => c.reveal('cinder_creek'),
        text: '"The freeway, mostly. And farmers up at Cinder Creek bring in busted plough blades. And sometimes people just die with interesting things in their pockets." He shrugs. "I don\'t ask. That\'s the whole secret of the scrap business. Don\'t ask."',
        options: [{ text: 'Sensible.', to: 'again' }],
      },
    },
  },
  {
    id: 'rw_bramble',
    portrait: { bg: '#5a3a24' },
    start: (c) => (c.partyHas('rw_bramble') ? 'party' : c.flag('rw_brambleFriend') ? 'waiting' : 'hello'),
    nodes: {
      hello: {
        text: 'A big, rust-coloured dog with a torn ear watches you from the shade of a car door. He doesn\'t growl. He doesn\'t wag, either. His nose, however, is working very hard in the direction of your pack.',
        options: [
          { text: 'Offer him some dried meat.', if: (c) => c.has('jerky'), any: true, to: 'fed' },
          { text: 'Here, boy. Good dog.', to: 'nope' },
          { text: 'Doggy!', lowInt: true, to: 'lowdog' },
          { text: 'Back away slowly.', end: true },
        ],
      },
      nope: {
        text: 'Bramble looks at your empty outstretched hand. Then at your face. Then, pointedly, at your pack again. He does not move an inch.',
        options: [
          { text: 'Offer him some dried meat.', if: (c) => c.has('jerky'), any: true, to: 'fed' },
          { text: 'Fine, be like that.', end: true },
        ],
      },
      lowdog: {
        text: 'You and Bramble regard each other with perfect mutual understanding. His tail thumps once against the car door. His nose points at your pack.',
        options: [
          { text: 'Give meat!', lowInt: true, if: (c) => c.has('jerky'), to: 'fed' },
          { text: 'No meat. Sorry doggy.', lowInt: true, end: true },
        ],
      },
      fed: {
        onEnter: (c) => {
          c.take('jerky');
          if (!c.flag('rw_brambleFriend')) {
            c.set('rw_brambleFriend');
            c.karma(5);
            c.xp(50);
          }
          c.recruit('rw_bramble');
        },
        text: 'He takes the meat very gently, the way you would take something fragile from a child. It vanishes in two swallows. Then he gets up, walks around you once as if checking your measurements, and leans his whole considerable weight against your leg.\n\nIt appears you have a dog now.',
        options: [{ text: 'Good boy, Bramble.', any: true, end: true }],
      },
      party: {
        text: 'Bramble looks up at you, tongue lolling, ears doing two different things. He smells of engine oil and complete loyalty.',
        options: [
          { text: 'Scratch his ears.', any: true, to: 'scratch' },
          ...companionOptions('rw_bramble', 'Go home, Bramble. Stay.'),
        ],
      },
      scratch: {
        text: 'Bramble leans into it and makes a noise like a small engine turning over. Somewhere, a Rivet Boy feels a chill.',
        options: [{ text: 'Come on, then.', any: true, end: true }],
      },
      waiting: {
        text: 'Bramble thumps his tail and stands up, ready to go wherever you are going.',
        options: [
          { text: 'Come on, boy.', any: true, end: true, do: (c) => c.recruit('rw_bramble') },
          { text: 'Stay here.', any: true, end: true },
        ],
      },
    },
  },
  {
    id: 'rw_junker',
    start: 'hello',
    nodes: {
      hello: {
        text: '"Parts! Rounds! Flares! Wires that probably still carry current! Everything guaranteed until you leave my sight!"',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'No thanks.', end: true },
        ],
      },
    },
  },
  {
    id: 'rw_oyelade',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => (c.flag('rw_oyeladeGift')
          ? '"Mind how you go, child. Keep your water covered and your mouth shut in the Rivet."'
          : 'An old woman sits on a bedroll, shelling dry beans into a tin. "Sit, sit. Nobody sits with me any more. They think old is catching." She looks you up and down. "You\'re thin. You people from the holes are always thin."'),
        options: [
          { text: 'Sit with her a while.', if: (c) => !c.flag('rw_oyeladeGift'), to: 'sit' },
          { text: 'Maybe another time.', end: true },
        ],
      },
      sit: {
        onEnter: (c) => {
          c.set('rw_oyeladeGift');
          c.advance(30);
          c.give('jerky', 2);
          c.karma(5);
        },
        text: 'You sit, and she talks: about a husband who could weld a crack in a water tank with his eyes shut, about the year the pump ran red, about a dog that used to follow her to the gate. When you stand to leave she pushes two strips of dried meat into your hand. "For the road. Or for the big dog in the yard, if you\'re soft. You look soft."',
        options: [{ text: 'Thank you, Mother.', end: true }],
      },
    },
  },
]);

function healCost(c: Ctx) {
  if (c.flag('rw_grellSaved')) return 0;
  return c.flag('rw_welderDone') ? 20 : 35;
}

// ------------------------------------------------------------------ endings

defineEndings([
  {
    order: 30,
    title: 'Rustwater',
    scene: 'city',
    text: (c) => {
      let t: string;
      const grellDead = !grellAlive(c);
      if (c.flag('rw_hitDone')) {
        t = 'Sheriff Amos Grell was buried outside the wall under a hubcap star, the victim of a robbery nobody ever solved. Silas Mott kept order in Rustwater after that, in his way: the gate toll doubled, then doubled again, and people learned to lower their voices in the Tin Cup. Doc Sato packed her instruments and left for the Bazaar within the year.';
      } else if (c.flag('rw_grellSaved')) {
        const mott = c.flag('rw_mottJailed') ? 'Silas Mott served six years in Grell\'s cell and came out a quieter man who ran an honest dice table, or said he did.' : c.flag('rw_mottExiled') ? 'Silas Mott was seen years later dealing cards at the Bazaar under a different name and the same waistcoat.' : 'Silas Mott\'s waistcoat hung in the sheriff\'s office for years, a warning to anyone who fancied his old job.';
        t = `With Mott's plot broken, Sheriff Amos Grell kept the peace in Rustwater for eleven more years. The Lucky Rivet was stripped for sheet metal and became a meeting hall where the Town Board argued, loudly and honestly, for the first time in living memory. ${mott}`;
      } else if (c.flag('rw_mottDead') && grellDead) {
        t = 'With both its sheriff and its crime boss dead, Rustwater tore itself apart for a hard season. When the dust settled, Doc Sato found herself running the Town Board, mostly because she was the only one everybody still owed a favour.';
      } else if (c.flag('rw_mottDead')) {
        t = 'Silas Mott died in his own casino, and Rustwater woke up the next morning without quite knowing who owed what to whom. Sheriff Grell tore up the debt ledgers in front of the Tally House, and the cheer could be heard at the gate.';
      } else if (grellDead) {
        t = 'Sheriff Grell\'s death left Silas Mott the only power in Rustwater. The town endured him, the way towns endure droughts.';
      } else {
        t = 'You left Rustwater\'s quarrel to Rustwater. Within the year Sheriff Grell was shot dead answering a robbery call at the Tally House, and Silas Mott, grieving publicly, took up the duty of keeping order.';
      }
      if (c.questState('rw_brother') === 'done') t += ' Corliss and Tobin Penn finally put the new roof on their shack. It leaked, but only a little, and only over Tobin\'s side.';
      if (c.flag('rw_stillFixed')) t += ' And Fitch\'s still dripped faithfully for another twenty years, as the Tin Cup\'s regulars never tired of toasting.';
      return t;
    },
  },
  {
    order: 91,
    title: 'Bramble',
    scene: 'years',
    text: (c) => {
      if (!c.flag('rw_brambleFriend')) return null;
      if (c.flag('rw_brambleDead') || c.flag('dead:rw_bramble')) return 'Bramble, the scrapyard dog of Rustwater, died as he lived: between his friend and something that meant them harm. Wick Harrow built him a cairn of polished bolts by the yard gate, and nobody in town ever moved it.';
      if (c.flag('party:rw_bramble')) return 'Bramble grew grey around the muzzle but never slow. He slept across the doorway of wherever you slept for the rest of his long life, and to his last day he never let a man in a hat get closer than arm\'s reach.';
      return 'Bramble went back to Rustwater\'s scrapyard, where he grew fat on Wick Harrow\'s dried meat and terrorised three more generations of Rivet Boys. Whenever a traveller in a blue jumpsuit came through the gate, he would stand, sniff, and sit back down, disappointed.';
    },
  },
]);
