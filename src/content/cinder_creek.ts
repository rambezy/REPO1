// Cinder Creek: the adobe farming village around a failing well, and the
// burrower cave the well-diggers broke into. Quests: Burrowers in the Wells,
// the windpump, the sick ox, venom glands for Mother Pim. Wren's Rescue is
// given here by Elder Hattie Voss and resolved at Vultures' Roost.

import { defineMap, defineDialogues, defineQuests, defineObjScripts, defineDeathScripts, defineEndings } from './registry';
import { defineItems } from '../data/items';
import type { Ctx, LegendEntry, DialogueOption } from '../game/types';
import { G } from '../game/G';

// ------------------------------------------------------------------ items

defineItems([
  { id: 'cc_bearing', name: 'Sealed Pump Bearing', type: 'misc', weight: 1, value: 60, icon: 'part', quest: true, desc: 'A greased steel bearing in a waxed-paper sleeve, marked in pencil: "ODELL - SPARE - HANDS OFF".' },
  { id: 'cc_stew', name: 'Bowl of Corn Stew', type: 'drug', weight: 0.5, value: 6, icon: 'food', use: 'food', desc: 'Thin corn stew with a suspicion of ox. Restores a few hit points.' },
]);

// ------------------------------------------------------------------ quests

defineQuests([
  { id: 'cc_burrowers', title: 'Burrowers in the Wells', area: 'cinder_creek', xp: 600, desc: 'Burrower beetles are nesting in the dry aquifer cave under Cinder Creek. Kill their Matriarch.' },
  { id: 'cc_windpump', title: 'The Windpump', area: 'cinder_creek', xp: 250, desc: 'Odell Fenn\'s windpump has chewed its bearing. Without it the fields go dry.' },
  { id: 'cc_ox', title: 'Old Marta', area: 'cinder_creek', xp: 200, desc: 'Tobiah Reyes\' best ox is down in the pen and won\'t get up.' },
  { id: 'cc_glands', title: 'Venom for Mother Pim', area: 'cinder_creek', xp: 150, desc: 'Mother Pim needs burrower venom glands to brew antivenom.' },
]);

// ------------------------------------------------------------------ helpers

const TEAM = 'cinder';

/** Interior marker cells keep the room's floor instead of the map default. */
function interior(floors: Record<string, string>): Record<string, LegendEntry> {
  const out: Record<string, LegendEntry> = {};
  for (const [ch, floor] of Object.entries(floors)) out[ch] = { floor, marker: ch };
  return out;
}

function hattieReveal(c: Ctx) {
  c.reveal('rustwater');
  c.reveal('bazaar');
}

function wrenBackHome(c: Ctx) {
  return !!c.flag('vr_wrenFreed') && (c.partyHas('wren') || !!c.flag('vr_wrenHome')) && !c.flag('dead:wren');
}

/** Random ambient lines from named villagers near the player. */
function ambientBarks(c: Ctx, pools: Record<string, string[]>, chance = 0.45) {
  if (G.combat || !G.map || Math.random() > chance) return;
  const p = G.state.player;
  const near = G.map.actors.filter((a) => {
    if (a.dead || a.hostile || a.companion || !a.npc) return false;
    const key = Object.keys(pools).find((k) => a.npc!.startsWith(k));
    if (!key) return false;
    const dq = a.q - p.q;
    const dr = a.r - p.r;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 <= 12;
  });
  if (!near.length) return;
  const a = near[Math.floor(Math.random() * near.length)];
  if (a._bark && a._bark.until > G.now) return;
  const key = Object.keys(pools).find((k) => a.npc!.startsWith(k))!;
  const pool = pools[key];
  c.bark(a.npc!, pool[Math.floor(Math.random() * pool.length)]);
}

const BARKS: Record<string, string[]> = {
  cc_kid: ['Are you from the sky?', 'Bet you can\'t catch me!', 'My ma says don\'t touch strangers.', 'Is that a real jumpsuit?', 'I found a beetle leg! It\'s mine!'],
  cc_farmer: ['Corn\'s coming up the colour of rope again.', 'Rain\'s late. Rain\'s always late.', 'Mind the rows, stranger.', 'Sun\'ll have us all for breakfast.'],
  cc_villager: ['Water ration\'s down to a cup and a half.', 'Afternoon.', 'You staying long? Don\'t drink the trough water.', 'Elder\'s house is the big one north of the well.'],
  cc_guard: ['Keep it holstered.', 'Quiet day. I hate quiet days.', 'If you see a beetle, shout. Then run.'],
  cc_ox: ['Mrrrph.', 'Hrrrnnh.', '*chews thoughtfully*'],
  hobb: ['To the well! May it outlive us all.', 'Anyone buying? I\'m buying. Nobody\'s selling.', '*hic*'],
  cc_cook: ['Stew\'s on. Stew\'s always on.', 'Wash your hands. With what, I don\'t know.'],
};

// ------------------------------------------------------------------ maps

defineMap({
  id: 'cinder_creek',
  name: 'Cinder Creek',
  area: 'cinder_creek',
  outdoor: true,
  floor: 'sand',
  floor2: 'grass',
  wall: 'adobe',
  wall2: 'fence',
  music: 'town',
  legend: {
    '-': { floor: 'wood' },
    '@': { wall: 'rock' },
    '&': { floor: 'dirt', decor: 'grass' },
    '^': { floor: 'mud' },
    '<': { floor: 'dirt', exit: 'den' },
    ...interior({ "!": 'wood', "0": 'wood', "1": 'wood', "2": 'wood', "3": 'wood', "4": 'wood', "5": 'dirt', "6": 'dirt', "7": 'dirt', "8": 'wood', "9": 'wood', "A": 'dirt', "C": 'wood', "F": 'dirt', "G": 'wood', "H": 'dirt', "J": 'wood', "M": 'wood', "U": 'dirt', "V": 'dirt', "X": 'wood', "Z": 'wood', "a": 'dirt', "b": 'wood', "e": 'wood', "f": 'dirt', "h": 'wood', "i": 'dirt', "k": 'wood', "n": 'dirt', "p": 'dirt', "r": 'wood', "u": 'dirt', "v": 'dirt', "x": 'wood', "z": 'wood' }),
  },
  rows: [
    '@@@<<<@@@@.........""".."......;.......;............"...',
    '@@@:::@@@................................Y""..o.."......',
    '@@@:::@@."....."........"...o."....o..."...........;....',
    '@@@:::@......(.Y.........T"..."....."T...o.."&&&&&&&&&&.',
    '@@@::::"..$.............;.;........T......"."::::::::::"',
    '@@@@@......./......##############.........;."&&&&&&&&&&.',
    '...."d..?..........#2------#----#..########."::::::::::.',
    '.."........."....."#----3C-#--1-#."#5::::6#."&&w&&&&&&&"',
    '.."..Y..#########..#--h----#----#."#:::p::#."::::::::::.',
    '........#8-----9#..#-------+----#..#::::::#."&&&&&&&&&&.',
    '......o.#---b---#..#-------#----#..#:7:::i#."::::::::::.',
    '........#--0-J--#..#M------#r--4#..#::::::#."&&&&N&&&&&.',
    '..".....#-------#..####+#########..###+####."::::::::::.',
    '.....o..#------Z#......:......."......:....."&&&&&&&&&&.',
    '...T....####+####"..;"":....:::::::"..:....""::::::w:::.',
    '..........".:......".......::::::::....."..."&&&&&&&&&&.',
    '>..o.....o..:.........."..:::::s:::..Y."...."::::::::::.',
    '>..".I.....":.""....o..L.:::::::m::..."..P.."&&&&&&&&&&.',
    '>"..........:...."......:::::::::::.....;.q."::::::::::.',
    '>::::::::::::::::::::::::::::::::S:.."..O........"......',
    '>::E::::::::::::::::::::::::W::::::..""....o"...........',
    '>:::::::::::::::::::::::::::::::::....o................"',
    '>..."".....:..........::::::::D::..."....o."............',
    '>.""..B....:........".::K:::::::.l............%%%%%%%%%%',
    '>"..Y..."..:..........:::c:::::.......:.......%,,,,,,,,%',
    '...........:........:.::::Q:::".......:.......%,,j,,,R,%',
    ';.".Y..####+####..".:.:::::::...T.####+######.%,,,,,,,,%',
    '..o....#a:::::A#"".":.......:...""#G------k-#"g,,,,,,,,%',
    '......;#:::::::#..##+###....:.....#--------e#.%,,,t,,,,%',
    '.o"....#:::n:::#..#::::#".##+###..#--x--X---#y%,,,,,j,,%',
    '".."...#:::::::#..#::f:#..#::::#..+---------#"%,,,,,,,,%',
    '.......#u:::::U#..#::::#..#:F::#..#--z---!--#.%,,,,,,,,%',
    '.......#########."#v:::#..#::::#".#---------#.%%%%%%%%%%',
    '..".............".######..#H::V#..###########........"."',
    '.....;..........".".......######."....".."..............',
    '..^,.,.."^,.,...^,.,.".^,.,.;.^,.,"..^,.,.."^,.,...^,.,.',
    '^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
    '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~',
  ],
  entrances: { default: 'E', fromDen: 'd' },
  exits: { out: { to: 'world' }, den: { to: 'beetle_den', entrance: 'default' } },
  objects: [
    { kind: 'well', at: 'W', id: 'cc_well', name: 'the village well', onUse: 'cc_well' },
    { kind: 'campfire', at: 'c' },
    { kind: 'stall', at: 's', tint: '#a0522d', name: 'water stall' },
    { kind: 'stall', at: 'S', tint: '#6a7a3a', name: 'corn stall' },
    { kind: 'lamp', at: 'L' },
    { kind: 'lamp', at: 'l' },
    { kind: 'sign', at: 'I', name: 'village sign', onUse: 'cc_sign', desc: 'a sun-bleached sign on a post' },
    // Hattie's house
    { kind: 'bookcase', at: '2', name: 'Hattie\'s shelf', inv: [{ id: 'jerky', n: 2 }] },
    { kind: 'table', at: '3', tint: '#7a5a3a' },
    { kind: 'chair', at: 'C' },
    { kind: 'bed', at: '1', tint: '#b89a70' },
    { kind: 'chest', at: '4', name: 'Hattie\'s chest', locked: 40, inv: [{ id: 'scrip', n: 80 }, { id: 'hypo', n: 1 }, { id: 'ammo44', n: 12 }] },
    { kind: 'rug', at: 'M' },
    // Mother Pim's hut
    { kind: 'shelf', at: '5', name: 'shelf of remedies', inv: [{ id: 'curePaste', n: 2 }, { id: 'beetleGland', n: 1 }] },
    { kind: 'bed', at: '6', tint: '#8a7a60' },
    { kind: 'table', at: '7', tint: '#6a5038' },
    // trade post
    { kind: 'shelf', at: '8', name: 'display shelf', inv: [{ id: 'scrapMetal', n: 2 }, { id: 'rope', n: 1 }] },
    { kind: 'crate', at: '9', name: 'stock crate', locked: 30, inv: [{ id: 'ammo9', n: 12 }, { id: 'flare', n: 2 }, { id: 'scrip', n: 30 }] },
    { kind: 'table', at: '0', tint: '#5a4028' },
    { kind: 'table', at: 'J', tint: '#5a4028' },
    { kind: 'barrelc', at: 'Z', inv: [{ id: 'water', n: 1 }] },
    // guardhouse
    { kind: 'footlocker', at: 'a', name: 'guard footlocker', locked: 25, inv: [{ id: 'ammo223', n: 10 }, { id: 'hypo', n: 1 }] },
    { kind: 'rack', at: 'A', name: 'spear rack' },
    { kind: 'bunk', at: 'u' },
    { kind: 'bunk', at: 'U' },
    // family huts
    { kind: 'bed', at: 'v', tint: '#9a8a70' },
    { kind: 'bed', at: 'V', tint: '#9a8a70' },
    { kind: 'crate', at: 'H', inv: [{ id: 'jerky', n: 2 }, { id: 'scrip', n: 8 }] },
    // commons
    { kind: 'table', at: 'x', tint: '#6a4a2e' },
    { kind: 'table', at: 'X', tint: '#6a4a2e' },
    { kind: 'table', at: '!', tint: '#6a4a2e' },
    { kind: 'chair', at: 'z' },
    { kind: 'barrelc', at: 'e', name: 'ale barrel', inv: [{ id: 'beer', n: 3 }] },
    // fields, pump and pen
    { kind: 'sign', at: 'N', name: 'scarecrow', tint: '#6a5a3a', desc: 'a scarecrow in a pre-war traffic vest. The crows here are not impressed' },
    { kind: 'tank', at: 'P', id: 'cc_windpump', name: 'windpump', onUse: 'cc_windpump', desc: 'a tall windpump over a cistern. Its vanes turn, but the rod does not move' },
    { kind: 'pipe', at: 'q', name: 'irrigation pipe' },
    { kind: 'gate', at: 'g', name: 'pen gate' },
    { kind: 'barrel', at: 'R', name: 'water trough', tint: '#6a6a60' },
    // diggers' camp by the den
    { kind: 'tent', at: '$', tint: '#8a7a5a', name: 'diggers\' tent' },
    { kind: 'toolbox', at: '/', name: 'diggers\' toolbox', inv: [{ id: 'rope', n: 1 }, { id: 'flare', n: 1 }] },
    { kind: 'pile', at: '(', name: 'spoil heap', inv: [{ id: 'scrapMetal', n: 1 }] },
    { kind: 'sign', at: [7, 3], name: 'warning sign', onUse: 'cc_densign', tint: '#9a4a2a', desc: 'a board nailed to a stake by the shaft' },
    { kind: 'debris', at: [8, 2] },
  ],
  npcs: [
    { proto: 'villagerF', id: 'hattie', name: 'Elder Hattie Voss', at: 'h', dialog: 'hattie', team: TEAM, essential: true,
      look: { hair: '#d8d4cc', hairStyle: 'bun', skin: '#9a6a44', outfit: '#6a5040', outfit2: '#c8a060' } },
    { proto: 'guard', id: 'dag', name: 'Captain Dag Oyelaran', at: 'D', dialog: 'dag', team: TEAM,
      look: { skin: '#4a2c1a', hair: '#111', hairStyle: 'bald', beard: true, outfit: '#5a5a3a' } },
    { proto: 'villagerF', id: 'pim', name: 'Mother Pim', at: 'p', dialog: 'pim', team: TEAM, barter: true,
      look: { skin: '#b07850', hair: '#8a8a80', hairStyle: 'hood', outfit: '#4a5a3a', outfit2: '#8a6a3a' },
      inv: [{ id: 'curePaste', n: 6 }, { id: 'antidote', n: 3 }, { id: 'hypo', n: 2 }, { id: 'radPurge', n: 1 }, { id: 'iodine', n: 1 }, { id: 'scrip', n: 180 }] },
    { proto: 'merchant', id: 'brannoc', name: 'Brannoc Tull', at: 'b', dialog: 'cc_brannoc', team: TEAM, barter: true,
      look: { skin: '#c89468', hair: '#8a4a20', beard: true, hairStyle: 'short', outfit: '#5a4a3a', outfit2: '#a08050' },
      inv: [{ id: 'ammo9', n: 48 }, { id: 'ammo223', n: 20 }, { id: 'shells', n: 12 }, { id: 'knife', n: 1 }, { id: 'spear', n: 1 }, { id: 'shotgun', n: 1 },
        { id: 'leatherArmor', n: 1 }, { id: 'jerky', n: 6 }, { id: 'water', n: 4 }, { id: 'rope', n: 2 }, { id: 'flare', n: 3 }, { id: 'toolkit', n: 1 }, { id: 'molotov', n: 2 }, { id: 'scrip', n: 400 }] },
    { proto: 'villagerF', id: 'lulah', name: 'Lulah Brisk', at: 'm', dialog: 'cc_lulah', team: TEAM, barter: true,
      look: { skin: '#d0a078', hair: '#2a1a10', hairStyle: 'long', outfit: '#8a5a3a' },
      inv: [{ id: 'water', n: 6 }, { id: 'jerky', n: 5 }, { id: 'beer', n: 4 }, { id: 'cc_stew', n: 3 }, { id: 'scrip', n: 90 }] },
    { proto: 'villager', id: 'odell', name: 'Odell Fenn', at: 'O', dialog: 'cc_odell', team: TEAM,
      look: { skin: '#e0b898', hair: '#c8c0b0', hairStyle: 'cap', outfit: '#4a5a6a' } },
    { proto: 'villager', id: 'tobiah', name: 'Tobiah Reyes', at: 'y', dialog: 'cc_tobiah', team: TEAM,
      look: { skin: '#8a5a38', hair: '#222', hairStyle: 'cap', outfit: '#7a6a4a', beard: true } },
    { proto: 'ox', id: 'cc_marta', name: 'Old Marta', at: 't', dialog: 'cc_marta', wander: 0, hp: 18 },
    { proto: 'ox', id: 'cc_ox', name: 'Dust Ox', at: 'j', count: 3, wander: 2 },
    { proto: 'villager', id: 'ezra', name: 'Ezra Quint', at: '?', dialog: 'cc_ezra', team: TEAM,
      look: { skin: '#6a4028', hair: '#3a2a1a', hairStyle: 'short', outfit: '#5a4a38', beard: true } },
    { proto: 'villager', id: 'jory', name: 'Jory the digger', at: 'i', dialog: 'cc_jory', team: TEAM, wander: 0, hp: 12,
      look: { skin: '#c08a60', hair: '#6a4020', outfit: '#6a5a48' } },
    { proto: 'villager', id: 'anselm', name: 'Grandfather Anselm', at: 'G', dialog: 'cc_anselm', team: TEAM,
      look: { skin: '#a07048', hair: '#eeeeee', hairStyle: 'bald', beard: true, outfit: '#5a4a5a' } },
    { proto: 'villagerF', id: 'cc_cook', name: 'Sabeen the cook', at: 'k', dialog: 'cc_cook', team: TEAM,
      look: { skin: '#8a5838', hair: '#1a1a1a', hairStyle: 'bun', outfit: '#9a8a6a', outfit2: '#d0c8b0' } },
    { proto: 'villager', id: 'hobb', name: 'Hobb Ashby', at: 'Q', dialog: 'cc_hobb', team: TEAM, wander: 2,
      look: { skin: '#d8a888', hair: '#8a6a4a', hairStyle: 'long', outfit: '#6a4a3a', beard: true } },
    { proto: 'guard', id: 'cc_gateguard', name: 'Guard Ines', at: 'B', dialog: 'cc_gateguard', team: TEAM,
      look: { female: true, skin: '#b58560', hair: '#3a2010', hairStyle: 'cap' } },
    { proto: 'guard', id: 'cc_guard', name: 'Village Guard', at: 'n', team: TEAM, wander: 3 },
    { proto: 'villager', id: 'cc_kid', name: 'Village Kid', at: 'K', count: 2, team: TEAM, wander: 6, look: { scale: 0.72, hairStyle: 'short' } },
    { proto: 'villager', id: 'cc_farmer', name: 'Farmer', at: 'w', count: 2, team: TEAM, wander: 4, look: { hairStyle: 'cap' } },
    { proto: 'villagerF', id: 'cc_villager', name: 'Villager', at: 'f', team: TEAM, wander: 2 },
    { proto: 'villager', id: 'cc_villager2', name: 'Villager', at: 'F', team: TEAM, wander: 2 },
    { proto: 'villagerF', id: 'cc_villager3', name: 'Villager', at: 'L', team: TEAM, wander: 5 },
    { proto: 'cc_wren', id: 'wren', name: 'Wren Voss', at: 'r', dialog: 'wren', team: TEAM,
      if: (c) => !!c.flag('vr_wrenHome') && !c.flag('party:wren') && !c.flag('dead:wren') },
  ],
  onEnter: (c, first) => {
    if (first) {
      c.msg('Adobe huts crouch around a stone well. Beyond them, rows of stunted corn rattle in a dry wind. Someone is ringing a bell for water rations.');
      c.bark('cc_gateguard', 'Hold up, jumpsuit. Weapon down, then welcome.');
    }
    if (c.flag('cc_matriarchDead') && !c.flag('cc_diggersBack')) {
      c.set('cc_diggersBack');
      c.msg('Word has spread: the well-diggers are packing their tools again.');
    }
    if (c.flag('vr_wrenHome') && !c.flag('party:wren') && c.questState('vr_wren') === 'active') c.bark('hattie', 'You! Get in here!');
  },
  onTick: (c) => ambientBarks(c, BARKS),
});

defineMap({
  id: 'beetle_den',
  name: 'Burrower Den',
  area: 'cinder_creek',
  floor: 'cave',
  wall: 'rock',
  dark: 0.6,
  music: 'cave',
  legend: {
    '*': { floor: 'cave', decor: 'glow' },
  },
  rows: [
    '##################################################',
    '##################################################',
    '##################################################',
    '#########################..#.#############.#.#####',
    '#########################...###########;......####',
    '########################d....##########.....;..###',
    '#######################...c.##########......n.####',
    '###############....#........########;.n.......####',
    '############........##..*.##########......Q....###',
    '#########..........#####.#########....;.......####',
    '#######...........#################..........#####',
    '######k.~~*.....###################....E...F.#####',
    '######.~~~....####################.......;..######',
    '#####..~~.....####################.........#######',
    '#####.....;y*###################..........########',
    '####..*....;.###############....;...##.;##########',
    '####..;.;.....#############........###############',
    '####..........############.z..;...################',
    '#####.#####;...##########..;;.o...################',
    '###########....########...........################',
    '###########.;..#######....o.o.....################',
    '############.......##..........z..################',
    '############.......#.....z........################',
    '#############x*...;...............;###############',
    '#############...b.......*....*#.....##############',
    '############**....x..##.......#.......############',
    '##########..l....B####..###..####*........########',
    '#######.......t;.#################.........#######',
    '######......;..;.##################....v....######',
    '####............#####################......#######',
    '###........###########################...s########',
    '###..*.....###########################...#########',
    '##...e...#############################.#.#########',
    '##>>...;.#########################################',
    '##>>...###########################################',
    '##.##;.###########################################',
    '##################################################',
    '##################################################',
  ],
  entrances: { default: 'e' },
  exits: { out: { to: 'cinder_creek', entrance: 'fromDen' } },
  objects: [
    { kind: 'bones', at: 'b', name: 'digger\'s remains', desc: 'what the burrowers left of a well-digger. A boot, mostly' },
    { kind: 'bones', at: 'B' },
    { kind: 'bones', at: 'd' },
    { kind: 'blood', at: [15, 25] },
    { kind: 'toolbox', at: 't', name: 'digging crew\'s toolbox', inv: [{ id: 'cc_bearing', n: 1 }, { id: 'scrip', n: 15 }, { id: 'rope', n: 1 }] },
    { kind: 'lamp', at: 'l', name: 'dropped lantern' },
    { kind: 'crate', at: 'k', name: 'mouldy supply crate', inv: [{ id: 'water', n: 2 }, { id: 'jerky', n: 1 }, { id: 'ammo9', n: 10 }] },
    { kind: 'safe', at: 'c', name: 'pre-war pump-station strongbox', locked: 45, inv: [{ id: 'scrip', n: 120 }, { id: 'clarity', n: 1 }, { id: 'ammo223', n: 15 }, { id: 'scrapElectronics', n: 2 }] },
    { kind: 'pile', at: 'E', id: 'cc_eggs1', name: 'burrower egg clutch', onUse: 'cc_eggs', desc: 'a heap of leathery, pulsing eggs the size of fists' },
    { kind: 'pile', at: 'F', id: 'cc_eggs2', name: 'burrower egg clutch', onUse: 'cc_eggs', desc: 'a heap of leathery, pulsing eggs the size of fists' },
    { kind: 'bag', at: 's', name: 'digger\'s pack', inv: [{ id: 'lockpicks', n: 1 }, { id: 'hypo', n: 1 }, { id: 'scrip', n: 40 }] },
  ],
  npcs: [
    { proto: 'beetle', at: 'x', count: 2 },
    { proto: 'beetle', at: 'y' },
    { proto: 'beetle', at: 'z', count: 3 },
    { proto: 'beetle', at: 'n', count: 2 },
    { proto: 'beetle', at: 'v' },
    { proto: 'beetleQueen', id: 'cc_matriarch', name: 'Burrower Matriarch', at: 'Q' },
  ],
  onEnter: (c, first) => {
    if (first) {
      c.msg('The shaft opens into a cave the size of a barn. The walls are scored with fresh tunnels, and something is clicking in the dark.');
      if (!c.flag('cc_burrowersGiven')) c.msg('This must be where the well-diggers broke through.');
    }
  },
});

// ------------------------------------------------------------------ scripts

defineObjScripts({
  cc_well: (c) => {
    if (c.flag('cc_matriarchDead')) c.msg('You haul up the bucket. The water is cloudy, but there is more of it than yesterday. Down in the shaft you hear the diggers singing.');
    else c.msg('You haul up the bucket. A finger of brown water sloshes in the bottom. The rope is stamped with dates; the most recent marks are far down.');
    return true;
  },
  cc_densign: (c) => {
    c.msg('Painted in red: "WELL SHAFT. CLOSED. BEETLES." Underneath, smaller: "Kell and Barro, we will come back for you."');
    return true;
  },
  cc_sign: (c) => {
    c.msg('The sign reads: "CINDER CREEK. WATER FOR WORK. NO GUNS DRAWN. NO BEETLES." Someone has added in charcoal: "(beetles welcome to try)".');
    return true;
  },
  cc_windpump: (c, o, _u, skill) => {
    if (c.flag('cc_pumpFixed')) {
      c.msg('The windpump creaks and clanks. Water coughs into the cistern in steady gulps.');
      return true;
    }
    if (c.has('cc_bearing')) {
      c.take('cc_bearing');
      fixPump(c, 'You fit Odell\'s spare bearing into the gearbox and bolt the housing shut.');
      return true;
    }
    if (skill === 'repair') {
      const bonus = c.has('toolkit') ? 20 : 0;
      c.advance(30);
      if (c.roll('repair', 45 - bonus)) {
        fixPump(c, 'You strip the gearbox, file the scored shaft true, pack it with grease and wrap the worn race in a sleeve cut from a can. It\'s ugly. It turns.');
      } else {
        c.msg('You spend half an hour elbow-deep in grease. The shaft is too scored to seat the old bearing. A spare would make it easy.');
        if (c.questState('cc_windpump') === 'none') c.quest('cc_windpump', 'The windpump needs a new bearing, or better hands than mine.');
      }
      return true;
    }
    c.msg('The vanes spin freely in the wind, but the pump rod hangs still. Something in the gearbox is grinding itself to powder. (Use the Repair skill, or find a replacement bearing.)');
    return true;
  },
  cc_eggs: (c, o) => {
    if (o.used) {
      c.msg('A blackened, stinking crust. Nothing in there will ever hatch.');
      return true;
    }
    const burn = c.has('molotov') ? 'molotov' : c.has('flare') ? 'flare' : c.has('fuel') ? 'fuel' : null;
    if (!burn) {
      c.msg('The eggs twitch. Stamping on them would take all day and most of your boots. Fire would do it: a flare, or a fire bottle.');
      return true;
    }
    c.take(burn);
    o.used = true;
    o.name = 'burnt egg clutch';
    c.sound('flame');
    c.msg(`You set the clutch alight with ${burn === 'flare' ? 'a road flare' : burn === 'molotov' ? 'a fire bottle' : 'a splash of fuel'}. The eggs pop and hiss like fat on a skillet.`);
    c.xp(50);
    const both = G.map?.objects.filter((x) => x.onUse === 'cc_eggs').every((x) => x.used);
    if (both && !c.flag('cc_eggsBurned')) {
      c.set('cc_eggsBurned');
      c.quest('cc_burrowers', 'I burned the burrowers\' egg clutches. Captain Dag will want to hear that.');
    }
    return true;
  },
});

function fixPump(c: Ctx, text: string) {
  c.msg(text);
  c.msg('With a shudder the pump rod starts to rise and fall. Water gushes into the cistern.');
  c.set('cc_pumpFixed');
  c.sound('click');
  if (c.questState('cc_windpump') === 'none') c.quest('cc_windpump', 'I found the windpump broken and fixed it.');
  c.quest('cc_windpump', 'The windpump is running again. Odell Fenn should hear about it.');
  c.bark('odell', 'Is that... listen to her go!');
}

defineDeathScripts({
  cc_matriarch: (c) => {
    c.set('cc_matriarchDead');
    c.quest('cc_burrowers', 'The Burrower Matriarch is dead. Captain Dag will want to know.');
    c.msg('The Matriarch shudders and folds in on herself. Across the cave, the clicking stops.');
  },
  hattie: (c) => {
    if (c.questState('vr_wren') === 'active' && !c.flag('vr_wrenFreed')) c.quest('vr_wren', 'Hattie Voss is dead. Wren is still at the Roost.');
  },
  cc_marta: (c) => {
    if (!c.flag('cc_oxSaved') && !c.flag('cc_oxPutDown')) c.set('cc_oxPutDown');
  },
});

// ------------------------------------------------------------------ dialogue

const bye = (t = 'Goodbye.'): DialogueOption => ({ text: t, end: true });

defineDialogues([
  // ---------------------------------------------------------------- Hattie
  {
    id: 'hattie',
    portrait: { bg: '#4a3a2a' },
    start: (c) => {
      if (c.flag('vr_soldWren') && c.flag('vr_wrenHome')) return 'betrayed';
      if (c.flag('dead:wren') && c.questState('vr_wren') !== 'done') return 'wrenDead';
      if (c.flag('vr_soldWren')) return 'grief';
      if (c.questState('vr_wren') === 'active' && wrenBackHome(c)) return 'wrenBack';
      return c.flag('cc_metHattie') ? 'again' : 'hello';
    },
    nodes: {
      hello: {
        onEnter: (c) => c.set('cc_metHattie'),
        text: (c) => `An old woman with a white bun and a face like a dry riverbed looks up from shelling beans. She does not stop shelling.\n\n"Shelter folk. The last one who came down out of those hills, I was nine. He asked us if the war was over. We told him it was. He cried, and then he asked for a bath." A bean hits the bowl. "I'm Hattie Voss. I'm what passes for an elder here, on account of being older than everybody. What do you want, ${c.female() ? 'girl' : 'boy'}?"`,
        options: [
          { text: 'I\'m looking for a machine. A hydro-core, from another shelter.', to: 'core' },
          { text: 'Tell me about Cinder Creek.', to: 'village' },
          { text: 'You look like you\'ve got bigger worries than beans.', to: 'worry' },
          { text: 'Hi! Me from hole in hill!', lowInt: true, to: 'dumb' },
          bye('Just passing through.'),
        ],
      },
      dumb: {
        text: 'Hattie looks at you for a long, long while. Then she sets down the bowl.\n\n"Hello, hole person." She speaks slowly, kindly. "My Wren is gone. Bad men took her. North-east, to the canyon with the birds. You bring her back, I give you scrip. Scrip is shiny. You like shiny?"',
        options: [
          { text: 'Me like shiny! Me bring Wren!', lowInt: true, to: 'dumbOk', do: (c) => startWren(c) },
          { text: 'Where other holes? Like mine?', lowInt: true, to: 'dumbCalder' },
          { text: 'Bye bye.', lowInt: true, end: true },
        ],
      },
      dumbOk: {
        text: '"Good. North-east. Look for birds that don\'t fly away. Don\'t get eaten." She pats your hand. "Don\'t get eaten," she repeats, to be sure.',
        options: [{ text: 'No eat. Okay!', lowInt: true, end: true }],
      },
      dumbCalder: {
        onEnter: (c) => { c.reveal('calder'); hattieReveal(c); },
        text: '"Other holes? Calder. Big broken town, far south-east. That\'s where the old shelters were." She taps your wrist-link with a bony finger until it beeps. "There. Now your little box knows too. And there\'s Rustwater, south, and the Bazaar, east, if you want to buy things with your shiny."',
        options: [
          { text: 'Box beeped! Thank you!', lowInt: true, to: 'dumb' },
        ],
      },
      core: {
        text: '"Hydro-core." She tries the word like a bad tooth. "Never heard of it. But I know where the old shelters were, if that\'s what you\'re after. My grandmother used to say the city people at Calder had one dug under the train station, and when the sky went white the doors closed with folk still banging on them."',
        options: [
          { text: 'Where is Calder?', to: 'calder' },
          { text: 'Any other places I should know about?', to: 'places' },
          { text: 'Thank you.', to: 'again' },
        ],
      },
      calder: {
        onEnter: (c) => {
          c.reveal('calder');
          if (!c.flag('cc_hattieCalder')) {
            c.set('cc_hattieCalder');
            c.quest('hydrocore', 'Hattie Voss of Cinder Creek says the old shelter at Calder was under the train station. Calder is far to the south-east.');
          }
        },
        text: '"South-east, a long walk past the Bazaar. Big stumps of buildings, all melted at the top like candles. The Withered live there now, the burnt folk. They\'re not so bad if you don\'t stare." She reaches over and pokes your wrist-link until it beeps. "There. Don\'t say I never gave you anything."',
        options: [
          { text: 'And the other places?', to: 'places' },
          { text: 'Thanks, Hattie.', to: 'again' },
        ],
      },
      places: {
        onEnter: (c) => hattieReveal(c),
        text: '"Rustwater\'s south: a town made out of dead cars and bad decisions. There\'s a sheriff who tries and a card-sharp who doesn\'t. The Crossroads Bazaar is east, where the caravan roads cross. If a thing exists, someone at the Bazaar sells it. If it doesn\'t exist, someone sells a map to it."',
        options: [
          { text: 'Where\'s Calder again?', to: 'calder' },
          { text: 'Thanks.', to: 'again' },
        ],
      },
      village: {
        text: '"Forty-one souls, sixty head of oxen, one well, and it\'s going dry. Our diggers were deepening it into the old aquifer and they broke into a cave full of burrowers. Beetles the size of wheelbarrows. We lost two men. Dag, that\'s our captain, is trying to find someone mad enough to go down there. You\'ll find him by the well, looking at it like it owes him money."',
        options: [
          { text: 'Something else is bothering you.', to: 'worry' },
          { text: 'I\'ll talk to Dag.', to: 'again' },
        ],
      },
      worry: {
        text: '"Hm. Sharp eyes." She finally stops shelling. "My granddaughter, Wren. She scouts the north ridge for us, shoots lizards, keeps the ox thieves honest. Nine days ago she didn\'t come home. Raiders from Vultures\' Roost took her; they left a feather on the ridge cairn so we\'d know. Their mother hen is a woman called Kestrel. She\'ll sell Wren or keep her or worse, depending on her mood."',
        options: [
          { text: 'I\'ll bring her back.', to: 'wrenGo', do: (c) => startWren(c) },
          { text: 'What\'s it worth to you?', to: 'reward' },
          { text: '[Barter] A rescue from a raider camp costs more than that. Double it.', if: (c) => !!c.flag('cc_hattieOffered') && !c.flag('cc_hattieHaggled'), skill: { key: 'barter', diff: 20 }, to: 'haggleOk', fail: 'haggleNo' },
          { text: 'Sorry. That\'s not my problem.', to: 'notMine' },
        ],
      },
      reward: {
        onEnter: (c) => c.set('cc_hattieOffered'),
        text: '"Three hundred scrip, which is most of what this house has. And my late husband\'s revolver, which he never once hit anything with. Maybe you\'ll have better luck."',
        options: [
          { text: 'Deal. I\'ll bring her back.', to: 'wrenGo', do: (c) => startWren(c) },
          { text: '[Barter] A rescue from a raider camp costs more than that. Double it.', if: (c) => !c.flag('cc_hattieHaggled'), skill: { key: 'barter', diff: 20 }, to: 'haggleOk', fail: 'haggleNo' },
          { text: 'I\'ll think about it.', to: 'again' },
        ],
      },
      haggleOk: {
        onEnter: (c) => { c.set('cc_hattieHaggled'); c.set('cc_hattieDouble'); c.karma(-5); },
        text: 'Her mouth thins. "Six hundred, then. I\'ll sell the good ox." She doesn\'t look at you again while she says it. "Just bring her back."',
        options: [{ text: 'You have a deal.', to: 'wrenGo', do: (c) => startWren(c) }],
      },
      haggleNo: {
        onEnter: (c) => c.set('cc_hattieHaggled'),
        text: '"Double? I\'m old, not simple. Three hundred is everything. If that\'s not enough, the road\'s behind you."',
        options: [
          { text: 'Fine. Three hundred.', to: 'wrenGo', do: (c) => startWren(c) },
          { text: 'Then I\'ll pass.', to: 'notMine' },
        ],
      },
      notMine: {
        text: '"No. It never is." She goes back to her beans. "Dag might have work for you. He pays less than I would, but he doesn\'t make you feel bad about it."',
        options: [
          { text: 'Wait. I\'ll go after her.', to: 'wrenGo', do: (c) => startWren(c) },
          bye(),
        ],
      },
      wrenGo: {
        text: '"The Roost is north-east of here, in a dry canyon. You\'ll know it by the birds. They like it there; the raiders are generous with leftovers." She grips your wrist. "Kestrel respects two things: strength and scrip. Wren shot two of her boys before they netted her, so Kestrel will want to be paid for them, one way or another. And my Wren is clever. If there\'s a way out, she\'ll already have found it; she\'s just waiting for someone to open the door."',
        options: [
          { text: 'I\'ll be back with her.', end: true },
          { text: 'Tell me about Calder before I go.', if: (c) => !c.flag('cc_hattieCalder'), to: 'calder' },
        ],
      },
      again: {
        text: (c) => {
          if (c.questState('vr_wren') === 'active') return '"Well? Is she... no. You\'d have said." Hattie turns back to her beans, but her hands are shaking.';
          if (c.questState('vr_wren') === 'done') return '"Our favourite stranger. Wren says you snore. Don\'t take it personally; she says that about everyone she likes."';
          return '"Still here? Sit, if you want. Standing makes me tired just looking at it."';
        },
        options: [
          { text: 'Tell me about Calder and the old shelters.', to: 'calder' },
          { text: 'Where else can I go around here?', to: 'places' },
          { text: 'About Wren...', if: (c) => c.questState('vr_wren') === 'none', to: 'worry' },
          { text: 'Remind me about the Roost.', if: (c) => c.questState('vr_wren') === 'active', to: 'wrenGo' },
          { text: 'How is the village doing?', to: 'village2' },
          { text: 'Wren? Me find Wren?', lowInt: true, if: (c) => c.questState('vr_wren') === 'none', to: 'dumb' },
          { text: 'Where other holes? Like mine?', lowInt: true, to: 'dumbCalder' },
          bye(),
        ],
      },
      village2: {
        text: (c) => {
          const bits: string[] = [];
          bits.push(c.flag('cc_matriarchDead') ? 'The diggers are back in the shaft, thanks to you. The water\'s still thin, but it\'s coming.' : 'The well is still dropping. Dag\'s beetles are still down there.');
          bits.push(c.flag('cc_pumpFixed') ? 'Odell\'s pump is running and the east rows are green for the first time since spring.' : 'Odell\'s windpump is broken again, so the corn is drinking dust.');
          if (c.flag('cc_oxSaved')) bits.push('Tobiah\'s old Marta is up and bullying the other oxen. He\'s unbearable about it.');
          return `"${bits.join(' ')}"`;
        },
        options: [{ text: 'I see.', to: 'again' }],
      },
      wrenBack: {
        onEnter: (c) => {
          const double = !!c.flag('cc_hattieDouble');
          c.questDone('vr_wren', 'Wren is home. Hattie Voss paid me for bringing her back.');
          c.give('scrip', double ? 600 : 300);
          c.give('revolver44');
          c.give('ammo44', 12);
          c.karma(25);
          c.rep('cinder_creek', 15);
          c.set('cc_wrenReturned');
        },
        text: (c) => `Hattie is on her feet before you're through the door, and she hugs ${c.partyHas('wren') ? 'Wren' : 'the girl'} hard enough to crack a rib. When she lets go her eyes are wet and furious.\n\n"Nine days. Nine days I shelled beans." She pushes a heavy cloth bundle at you: a long-barrelled revolver and a pouch of scrip. "${c.flag('cc_hattieDouble') ? 'Six hundred, like I promised. The good ox goes to market Tuesday.' : 'Three hundred, like I said.'} And Harlan\'s gun. Don\'t argue."${c.partyHas('wren') ? '\n\n"And she tells me she\'s going with you. Of course she is. Bring her back again, you hear me? Twice is a habit."' : ''}`,
        options: [
          { text: 'She did most of the work.', to: 'again' },
          { text: 'Glad she\'s home.', end: true },
          { text: 'Shiny! Thank you!', lowInt: true, end: true },
        ],
      },
      grief: {
        text: '"You told me she was dead of fever. Fine. I heard you." Hattie doesn\'t look up from the beans. There are no beans in the bowl. "Go away now."',
        options: [bye('...')],
      },
      betrayed: {
        text: '"Wren came home on her own. She told me who she heard laughing with Kestrel over the price of her." Hattie\'s voice is very quiet. "Get out of my house. Get out of my village. If Dag sees you after sundown he has my blessing."',
        options: [bye('...')],
      },
      wrenDead: {
        onEnter: (c) => {
          if (c.questState('vr_wren') === 'active') c.questFail('vr_wren', 'Wren Voss is dead.');
        },
        text: '"I know. People talk; bad news travels on better roads than good." Hattie holds a folded hunting cap in her lap. "You tried. That\'s more than most. Leave me be a while."',
        options: [bye('I\'m sorry.')],
      },
    },
  },
  // ---------------------------------------------------------------- Dag
  {
    id: 'dag',
    portrait: { bg: '#3a3a2a' },
    start: (c) => {
      if (c.questState('cc_burrowers') === 'active' && c.flag('cc_matriarchDead')) return 'report';
      return c.flag('cc_metDag') ? 'again' : 'hello';
    },
    nodes: {
      hello: {
        onEnter: (c) => c.set('cc_metDag'),
        text: 'A broad man with a shaved head and a rifle slung across his back is staring into the well as though it owes him money. He looks up.\n\n"Captain Dag Oyelaran. Village guard, such as it is. You\'re either lost or selling something. Which?"',
        options: [
          { text: 'Neither. I heard you have a beetle problem.', to: 'beetles' },
          { text: 'What can you tell me about the raiders at the Roost?', to: 'raiders' },
          { text: 'Where can I get supplies?', to: 'supplies' },
          { text: 'Me kill bugs? For scrip?', lowInt: true, to: 'dumbBugs' },
          bye('Just looking around.'),
        ],
      },
      dumbBugs: {
        text: '"You? Kill bugs?" He looks you over, sighs, and points north-west. "Hole in the ground by the tent. Big bug at the bottom, the mama. Kill mama, come back, get scrip. Don\'t get stung. If you get stung, go see Mother Pim."',
        options: [{ text: 'Kill mama bug. Okay!', lowInt: true, do: (c) => startBurrowers(c), end: true }],
      },
      beetles: {
        text: '"Burrowers. Our diggers were sinking the well deeper, into the old aquifer, and the floor of the shaft fell into a cave. The cave was full of burrowers. Chitin like a cooking pot, mandibles like shears, and a sting that turns your leg into a sausage. We lost Kell and Barro down there. Jory made it out, just."\n\n"There\'s a Matriarch at the bottom of it somewhere, laying eggs. Kill her and the rest will scatter or starve."',
        options: [
          { text: 'I\'ll do it. What does it pay?', to: 'pay', do: (c) => startBurrowers(c) },
          { text: 'Why don\'t your guards handle it?', to: 'guards' },
          { text: 'Not today.', to: 'again' },
        ],
      },
      guards: {
        text: '"I have eleven guards. Nine of them are farmers who own a spear. The other two are me and Ines, and Ines is the one who keeps the raiders from walking in the front. If I send them into that hole, I\'ll be burying farmers, and then who grows the corn?"',
        options: [
          { text: 'Fair enough. I\'ll go.', to: 'pay', do: (c) => startBurrowers(c) },
          { text: 'I\'ll think about it.', to: 'again' },
        ],
      },
      pay: {
        text: '"Two hundred scrip, and you eat at the commons free as long as there\'s food. The shaft\'s by the diggers\' tent, north-west edge of the village. Ezra Quint\'s camped there; he\'ll tell you what he saw. And if you find eggs, burn them. Otherwise we\'ll be doing this again by spring."',
        options: [
          { text: '[Barter] Two hundred for a nest of giant beetles? Make it three.', if: (c) => !c.flag('cc_dagHaggled'), skill: { key: 'barter', diff: 10 }, to: 'payMore', fail: 'payNo' },
          { text: 'Deal.', to: 'again' },
        ],
      },
      payMore: {
        onEnter: (c) => { c.set('cc_dagHaggled'); c.set('cc_dagPay', 300); },
        text: '"Three. Fine. It comes out of the guard\'s ale fund, so don\'t expect them to wave when you pass."',
        options: [{ text: 'Deal.', to: 'again' }],
      },
      payNo: {
        onEnter: (c) => c.set('cc_dagHaggled'),
        text: '"Two hundred is what the village has. You want three, go find a richer village with bigger beetles."',
        options: [{ text: 'Two hundred it is.', to: 'again' }],
      },
      report: {
        onEnter: (c) => {
          const pay = (c.flag('cc_dagPay') as number) || 200;
          const eggs = !!c.flag('cc_eggsBurned');
          c.questDone('cc_burrowers', eggs ? 'The Matriarch is dead and her eggs are burned. The well-diggers can go back to work.' : 'The Matriarch is dead. The well-diggers can go back to work.');
          c.give('scrip', pay + (eggs ? 100 : 0));
          c.rep('cinder_creek', 10);
          c.karma(15);
          c.set('cc_burrowersDone');
          if (eggs) c.xp(150);
        },
        text: (c) => `Dag listens to the whole story without interrupting, which you suspect is rare.\n\n"Huh. Figured we'd be sending the next stranger down to look for your boots." He counts out scrip into your palm. ${c.flag('cc_eggsBurned') ? '"And the eggs too. That\'s another hundred, and don\'t tell the guards where it came from."' : '"Pity about the eggs. We\'ll keep a watch on the shaft."'} "Ezra will have the crew back down there by tomorrow. You did Cinder Creek a real good turn."`,
        options: [
          { text: 'Happy to help.', to: 'again' },
          { text: 'Bug dead! Scrip!', lowInt: true, to: 'again' },
        ],
      },
      raiders: {
        onEnter: (c) => { c.reveal('vultures_roost'); c.reveal('rustwater'); },
        text: '"Vultures\' Roost. A dry canyon a day north-east. Thirty-odd raiders under a woman called Mother Kestrel. They take a cut of every caravan on the north road, and lately they take people." His jaw works. "They have Hattie\'s granddaughter. I\'d go in myself, but I\'d go in alone, and I\'d come out in a sack.\n\nIf you want more guns than I can give you, Rustwater\'s south of here. They sell anything that goes bang, and some things that go bang when they shouldn\'t."',
        options: [
          { text: 'Any advice for dealing with Kestrel?', to: 'kestrel' },
          { text: 'Thanks.', to: 'again' },
        ],
      },
      kestrel: {
        text: '"She\'s a brawler. Runs the camp with her fists, not her gun. Nobody in that canyon has ever put her on her back, and they\'ve all tried. If you can\'t out-fight her, out-sneak her. The north wall of that canyon is all cracks and goat tracks. Hobb used to graze goats up there before the raiders; buy him a drink and he\'ll draw you a map on the table with it."',
        options: [{ text: 'Good to know.', to: 'again' }],
      },
      supplies: {
        text: '"Brannoc\'s trade post is on the west side, by the road. He\'s honest, mostly, and I check. Lulah sells water and food from the stall by the well. Mother Pim, east of the Elder\'s house, sells remedies and antivenom. If you get stung, go to Pim before you go anywhere else."',
        options: [{ text: 'Thanks.', to: 'again' }],
      },
      again: {
        text: (c) => (c.flag('cc_burrowersDone') ? '"Our beetle-killer. What do you need?"' : '"Something else?"'),
        options: [
          { text: 'About the beetles...', if: (c) => c.questState('cc_burrowers') === 'none', to: 'beetles' },
          { text: 'Where exactly is the den?', if: (c) => c.questState('cc_burrowers') === 'active', to: 'pay' },
          { text: 'Tell me about the Roost.', to: 'raiders' },
          { text: 'Where can I get supplies?', to: 'supplies' },
          { text: 'Anything else need doing around here?', to: 'odd' },
          { text: 'Bugs? Where bugs?', lowInt: true, if: (c) => c.questState('cc_burrowers') === 'none', to: 'dumbBugs' },
          bye(),
        ],
      },
      odd: {
        text: (c) => {
          const t: string[] = [];
          if (!c.flag('cc_pumpFixed')) t.push('Odell\'s windpump by the east fields is broken again. If you know a wrench from a spoon, he\'d be grateful.');
          if (!c.flag('cc_oxSaved') && !c.flag('cc_oxPutDown')) t.push('Tobiah\'s got an ox down in the pen, east side. He\'s fretting like it\'s his mother.');
          if (c.questState('cc_glands') !== 'done') t.push('Mother Pim always needs burrower glands for her antivenom, and you\'ll find plenty down that hole.');
          return t.length ? `"${t.join(' ')}"` : '"Not that I know of. You\'ve done more than enough."';
        },
        options: [{ text: 'I\'ll see what I can do.', to: 'again' }],
      },
    },
  },
  // ---------------------------------------------------------------- Pim
  {
    id: 'pim',
    portrait: { bg: '#2e3a2a' },
    start: (c) => (c.flag('cc_metPim') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('cc_metPim'),
        text: 'A small, hooded woman is grinding something that smells like burnt licorice. Bundles of root and dried flowers hang from every beam of the hut.\n\n"Mother Pim. I mend what I can with roots and patience, and what I can\'t mend I make comfortable. You look healthy. That\'s rare. Enjoy it."',
        options: [
          { text: 'What do you sell?', to: 'sell' },
          { text: 'Can you heal me?', to: 'heal' },
          { text: 'Who\'s the man on the cot?', to: 'jory' },
          { text: 'Me hurt. Fix?', lowInt: true, to: 'heal' },
          bye(),
        ],
      },
      sell: {
        text: '"Root poultices: they\'ll close a cut and dull your wits for a while, so don\'t use them before you need to think. Antivenom, when I have glands to make it. A couple of shelter-style hypos I took off a trader who couldn\'t pay for his gout."',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'Glands?', to: 'glands' },
          { text: 'Something else.', to: 'again' },
        ],
      },
      heal: {
        text: (c) => `She looks you over with a professional squint. ${c.flag('cc_burrowersDone') ? '"For the one who cleared the den, no charge. Sit."' : '"Thirty scrip, and I\'ll put you right. Sit."'}`,
        options: [
          { text: 'Please.', if: (c) => !!c.flag('cc_burrowersDone'), to: 'healed', do: (c) => { c.heal(999); c.advance(30); } },
          { text: 'Here\'s thirty scrip.', if: (c) => !c.flag('cc_burrowersDone') && c.scrip() >= 30, to: 'healed', do: (c) => { c.pay(30); c.heal(999); c.advance(30); } },
          { text: 'Give scrip. Fix me.', lowInt: true, if: (c) => !c.flag('cc_burrowersDone') && c.scrip() >= 30, to: 'healed', do: (c) => { c.pay(30); c.heal(999); c.advance(30); } },
          { text: 'Maybe later.', any: true, to: 'again' },
        ],
      },
      healed: {
        text: 'Half an hour of poultices, a bitter tea and a lecture about eating properly later, you feel much better.',
        options: [{ text: 'Thank you, Mother Pim.', to: 'again' }, bye()],
      },
      jory: {
        text: '"Jory. One of the well-diggers. A burrower got him through the calf. He\'ll keep the leg, which is more than I promised him, but he\'ll walk like a heron for the rest of his life. He won\'t stop talking about the big one down there. The mother."',
        options: [{ text: 'I see.', to: 'again' }],
      },
      glands: {
        onEnter: (c) => { if (c.questState('cc_glands') === 'none') c.quest('cc_glands', 'Mother Pim wants three burrower venom glands to brew antivenom.'); },
        text: '"Burrower venom glands. The sacs under the tail. Bring me three and I\'ll give you two doses of antivenom and fifty scrip. Cut them out whole; if you pop one, wash your hands before you touch your face. Or anyone else\'s."',
        options: [
          { text: 'I have three glands for you.', if: (c) => c.count('beetleGland') >= 3, to: 'glandsDone' },
          { text: 'I\'ll keep an eye out.', to: 'again' },
        ],
      },
      glandsDone: {
        onEnter: (c) => {
          c.take('beetleGland', 3);
          c.give('antidote', 2);
          c.give('scrip', 50);
          c.questDone('cc_glands', 'I brought Mother Pim three venom glands.');
        },
        text: '"Oh, lovely. Look at the size of that one." She holds a gland up to the light like a jeweller. "Two doses, as promised. And fifty scrip. And I\'ll buy any more you bring, at a fair price."',
        options: [{ text: 'Pleasure doing business.', to: 'again' }],
      },
      again: {
        text: '"Back again? Sit, sit. Mind the jars."',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'Can you heal me?', to: 'heal' },
          { text: 'About those glands...', if: (c) => c.questState('cc_glands') !== 'done', to: 'glands' },
          { text: 'Any advice for a sick ox?', if: (c) => !c.flag('cc_oxSaved') && !c.flag('cc_oxPutDown'), to: 'ox' },
          { text: 'Who\'s the man on the cot?', to: 'jory' },
          { text: 'Me hurt. Fix?', lowInt: true, to: 'heal' },
          bye(),
        ],
      },
      ox: {
        text: '"Tobiah\'s Marta? I haven\'t looked. I treat people; oxen have worse manners. But if her leg\'s swollen hard and hot, I\'d wager a burrower got her. They\'ve been coming up through the pen floor at night. A dose of antivenom would do it, or a steady hand with a knife to drain the wound."',
        options: [{ text: 'Thanks.', to: 'again' }],
      },
    },
  },
  // ---------------------------------------------------------------- Brannoc
  {
    id: 'cc_brannoc',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => (c.flag('cc_metBrannoc')
          ? '"Back again. Brannoc Tull\'s never closed, only occasionally asleep."'
          : 'A ginger-bearded man behind a counter made from a pre-war door grins at you.\n\n"Welcome to Tull\'s. Ammunition, oil, rope, and the finest used spears north of Rustwater. Everything\'s for sale except my wife, my ox and my opinions, and the opinions are negotiable."'),
        options: [
          { text: 'Let\'s trade.', barter: true, any: true, do: (c) => c.set('cc_metBrannoc') },
          { text: 'Heard any news?', to: 'news', do: (c) => c.set('cc_metBrannoc') },
          { text: 'Where do you get your stock?', to: 'stock', do: (c) => c.set('cc_metBrannoc') },
          { text: 'Buy stuff!', lowInt: true, barter: true },
          bye(),
        ],
      },
      news: {
        text: (c) => [
          '"Caravan from the Bazaar\'s two weeks late. That happens. It\'s been happening more."',
          '"Some trader swore he saw grey giants walking the east road at dusk, big as ox-carts, with iron round their necks. He also swore his ox could count, so."',
          '"Kestrel\'s crew hit a salt train last month and let the drivers walk home naked. That\'s her idea of mercy."',
          '"Rustwater\'s sheriff is looking for deputies again. Nobody lasts long in that job."',
        ][c.random(4)],
        options: [{ text: 'Anything else?', to: 'news' }, { text: 'Thanks.', to: 'hello' }],
      },
      stock: {
        onEnter: (c) => c.reveal('bazaar'),
        text: '"Crossroads Bazaar, east of here, where the caravan roads meet. Twice a season I take the ox and a cart and come back with less money and more bullets. Biggest market in the Basin. Mind your purse there; the pickpockets have a guild and the guild has a pension plan."',
        options: [{ text: 'Good to know.', to: 'hello' }],
      },
    },
  },
  // ---------------------------------------------------------------- Lulah
  {
    id: 'cc_lulah',
    start: 'hello',
    nodes: {
      hello: {
        text: '"Water, stew, jerky, ale. Water\'s dear because the well\'s low; ale\'s cheap because nobody sensible drinks it. What\'ll it be?"',
        options: [
          { text: 'Let\'s trade.', barter: true, any: true },
          { text: 'Why is ale cheaper than water?', to: 'ale' },
          { text: 'Water! Me thirsty!', lowInt: true, barter: true },
          bye('Nothing for now.'),
        ],
      },
      ale: {
        text: '"Because Hobb brews it out of corn husks and resentment. Try it. Everybody does once."',
        options: [{ text: 'Maybe later.', to: 'hello' }],
      },
    },
  },
  // ---------------------------------------------------------------- Odell
  {
    id: 'cc_odell',
    start: (c) => (c.flag('cc_pumpFixed') ? (c.questState('cc_windpump') === 'done' ? 'done' : 'fixed') : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => { if (c.questState('cc_windpump') === 'none') c.quest('cc_windpump', 'Odell Fenn\'s windpump by the east fields needs a new bearing. He thinks the diggers took his spare down into the den.'); },
        text: 'A wiry old man in a pre-war cap is glaring up at the windpump as if it had insulted his mother.\n\n"Odell Fenn. That\'s my pump. Built her from a tractor gearbox and a water tower\'s ghost. She\'s chewed her bearing to powder, and without her the east rows get nothing but dust. I had a spare, sealed and greased, but Ezra\'s crew borrowed it for their winch when they went down that shaft. It\'s down there with the beetles."',
        options: [
          { text: 'Let me take a look at the gearbox.', to: 'look' },
          { text: 'I\'ll keep an eye out for your bearing.', to: 'ok' },
          { text: 'Here, is this your bearing?', if: (c) => c.has('cc_bearing'), to: 'bearing' },
          { text: 'Pump broke? Me hit it!', lowInt: true, to: 'hit' },
          bye(),
        ],
      },
      look: {
        text: '"Be my guest. Use your Repair on her. If you can make her turn without a new bearing, I\'ll eat this cap."',
        options: [{ text: 'I\'ll try.', end: true }],
      },
      ok: {
        text: '"Obliged. It\'s in a waxed paper sleeve with my name on it. If a beetle ate it, bring me the beetle."',
        options: [bye()],
      },
      hit: {
        text: 'You give the windpump a solid thump. It groans. Odell groans louder.\n\n"No! No hitting! You want to help? Go in the beetle hole, find a little metal ring in paper with my name on. Bring it here. Understand? Ring. Paper. Here."',
        options: [{ text: 'Ring. Paper. Here. Okay.', lowInt: true, end: true }],
      },
      bearing: {
        onEnter: (c) => {
          c.take('cc_bearing');
          fixPump(c, 'Odell snatches the bearing, climbs the pump like a man half his age and has it seated in ten minutes.');
        },
        text: '"That\'s her! That\'s my bearing!" He is up the ladder before you can blink. Clanks. Swearing. More clanks. Then the rod begins to pump, and water coughs into the cistern.',
        options: [{ text: 'She sounds healthy.', to: 'fixed' }],
      },
      fixed: {
        onEnter: (c) => {
          if (c.questState('cc_windpump') !== 'done') {
            c.questDone('cc_windpump', 'The windpump is running and the east fields have water.');
            c.give('scrip', 100);
            c.give('toolkit');
            c.karma(10);
            c.rep('cinder_creek', 5);
          }
        },
        text: '"Listen to her. Listen!" Odell wipes his eyes and claims it\'s the grease. "Here. A hundred scrip, and my second-best tool roll. Don\'t tell anyone I gave away a tool roll; they\'ll think I\'m dying."',
        options: [bye('Take care of her.')],
      },
      done: {
        text: '"She\'s singing. Hear her? Best sound in the Basin."',
        options: [bye()],
      },
    },
  },
  // ---------------------------------------------------------------- Tobiah and Old Marta
  {
    id: 'cc_tobiah',
    start: (c) => {
      if (c.questState('cc_ox') === 'active' && (c.flag('cc_oxSaved') || c.flag('cc_oxPutDown'))) return 'result';
      if (c.questState('cc_ox') === 'done') return 'after';
      return 'hello';
    },
    nodes: {
      hello: {
        text: 'A heavy man with a tired face leans on the pen fence. Inside, a big grey-humped ox lies on her side, breathing hard.\n\n"That\'s Old Marta. Best puller I ever had. Two days she\'s been down. Her back leg\'s swollen like a waterskin and she won\'t eat. I don\'t know what to do for her, and I can\'t afford to lose her."',
        options: [
          { text: 'Let me have a look at her.', to: 'look', do: (c) => { if (c.questState('cc_ox') === 'none') c.quest('cc_ox', 'Tobiah Reyes\' ox, Old Marta, is down with a swollen leg. Take a look at her in the pen.'); } },
          { text: 'Can\'t Mother Pim help?', to: 'pim' },
          { text: 'Cow sick? Me look!', lowInt: true, to: 'look', do: (c) => { if (c.questState('cc_ox') === 'none') c.quest('cc_ox', 'Look at the sick cow in the pen.'); } },
          bye('Sorry to hear it.'),
        ],
      },
      pim: {
        text: '"Pim says she treats people, not livestock. I pointed out most people are livestock with opinions. She didn\'t laugh."',
        options: [
          { text: 'I\'ll look at the ox.', to: 'look', do: (c) => { if (c.questState('cc_ox') === 'none') c.quest('cc_ox', 'Tobiah Reyes\' ox, Old Marta, is down with a swollen leg. Take a look at her in the pen.'); } },
          bye(),
        ],
      },
      look: {
        text: '"Gate\'s just there. Go gentle; she kicks when she\'s scared, and she\'s scared."',
        options: [bye('Right.')],
      },
      result: {
        onEnter: (c) => {
          if (c.flag('cc_oxSaved')) {
            c.questDone('cc_ox', 'Old Marta is back on her feet.');
            c.give('scrip', 75);
            c.give('jerky', 3);
            c.karma(10);
            c.rep('cinder_creek', 5);
          } else {
            c.questDone('cc_ox', 'I put Old Marta out of her misery.');
            c.give('scrip', 20);
          }
        },
        text: (c) => (c.flag('cc_oxSaved')
          ? '"She\'s up! She ate half a basket of husks and then she kicked me!" Tobiah beams. "Seventy-five scrip, and some of the good jerky. Not from her. Different ox."'
          : 'Tobiah is quiet a long while. "Better than lying there two more days, I suppose." He pays you a little. "For your trouble. I\'ll... I\'ll see to her."'),
        options: [bye()],
      },
      after: {
        text: (c) => (c.flag('cc_oxSaved') ? '"Marta\'s pulling the plough again. She says thank you. Well. She says mrrrph. It\'s the same thing."' : '"Morning."'),
        options: [bye()],
      },
    },
  },
  {
    id: 'cc_marta',
    name: 'Old Marta',
    portrait: { body: 'ox', bg: '#4a3a24' },
    start: (c) => (c.flag('cc_oxSaved') ? 'well' : 'sick'),
    nodes: {
      sick: {
        text: 'The ox lies in the straw, flanks heaving. Her left hind leg is swollen tight and shiny, hot to the touch, with a small black puncture above the hock. She rolls a big, wet eye at you.',
        options: [
          { text: '[Doctor] Lance the wound and drain the venom.', skill: { key: 'doctor', diff: 10 }, to: 'cured', fail: 'botched' },
          { text: '[First Aid] Clean and bind the wound.', skill: { key: 'firstAid', diff: 30 }, to: 'cured', fail: 'botched' },
          { text: 'Give her a dose of antivenom.', if: (c) => c.has('antidote'), to: 'cured', do: (c) => { c.take('antidote'); } },
          { text: 'Put her out of her misery.', to: 'mercy' },
          { text: 'Pet cow. Nice cow.', lowInt: true, to: 'pet' },
          bye('Leave her be.'),
        ],
      },
      pet: {
        text: 'You pat the ox. She huffs warm breath at you. She seems to appreciate it. She does not get any better.',
        options: [bye('...')],
      },
      botched: {
        onEnter: (c) => c.advance(20),
        text: 'You work at the wound for a while. Marta bellows and kicks the fence hard enough to crack a rail. The swelling doesn\'t go down. Maybe with antivenom, or a steadier hand.',
        options: [bye('Leave her be.')],
      },
      cured: {
        onEnter: (c) => {
          c.set('cc_oxSaved');
          c.advance(30);
          c.xp(100);
          if (c.questState('cc_ox') === 'none') c.quest('cc_ox', 'I treated the sick ox in the pen.');
          c.quest('cc_ox', 'Old Marta should recover. Tobiah Reyes will want to know.');
          const a = c.npc('cc_marta');
          if (a) a.wander = 2;
        },
        text: 'A burrower sting, sure enough. You work the venom out, and within the half hour the swelling softens. Marta heaves herself up onto four legs, shakes like a wet dog, and immediately tries to eat your sleeve.',
        options: [bye('You\'re welcome.')],
      },
      mercy: {
        text: 'You draw your blade. Marta watches you with one calm eye.',
        options: [
          { text: 'Do it quickly.', do: (c) => { c.set('cc_oxPutDown'); c.kill('cc_marta'); if (c.questState('cc_ox') === 'none') c.quest('cc_ox', 'I put the sick ox down.'); }, end: true },
          { text: 'No. Not yet.', to: 'sick' },
        ],
      },
      well: {
        text: 'Old Marta chews, regards you, and chews some more. She seems to have forgiven you for the knife.',
        options: [bye('Good ox.')],
      },
    },
  },
  // ---------------------------------------------------------------- Ezra, Jory
  {
    id: 'cc_ezra',
    start: (c) => (c.flag('cc_matriarchDead') ? 'after' : 'hello'),
    nodes: {
      hello: {
        text: 'A digger with a bandaged forearm sits on an upturned bucket by the shaft, watching it like a cat at a hole.\n\n"Ezra Quint. Crew boss. What\'s left of the crew." He spits. "They came up through the floor of the shaft. Kell went first. Barro went back for him. Jory got stung and I dragged him out by the collar. Nobody\'s been down since."',
        options: [
          { text: 'What\'s down there?', to: 'down' },
          { text: 'Got anything that might help me?', if: (c) => !c.flag('cc_ezraGift'), to: 'gift' },
          { text: 'Big bugs down hole?', lowInt: true, to: 'dumb' },
          bye(),
        ],
      },
      down: {
        text: '"A cave, big as a barn, then tunnels. Wet, in places; there\'s a seep off to the north side, which is why we were digging here in the first place. We only got as far as the first chamber. But you can hear her. The big one. Somewhere east, deep. Sounds like somebody shaking a bag of knives."\n\n"If you find our kit down there, there\'s a toolbox with Odell\'s bearing in it. He\'s been impossible."',
        options: [{ text: 'Thanks.', to: 'hello' }],
      },
      gift: {
        onEnter: (c) => { c.set('cc_ezraGift'); c.give('flare', 2); },
        text: '"Flares. Two. It\'s black as a boot down there, and burrowers hate fire. Their eggs burn like tallow, too, if you find any. Don\'t leave any unburnt."',
        options: [{ text: 'Thanks, Ezra.', to: 'hello' }],
      },
      dumb: {
        text: '"Big bugs. Very big. Very bitey." He hands you a flare and mimes striking it. "Fire. Bugs hate fire. Eggs go whoosh."',
        options: [{ text: 'Whoosh!', lowInt: true, end: true, do: (c) => { if (!c.flag('cc_ezraGift')) { c.set('cc_ezraGift'); c.give('flare', 2); } } }],
      },
      after: {
        text: '"The clicking\'s stopped. First night I\'ve slept since." He\'s already sorting ropes. "We go back down tomorrow. We\'ll name the new shaft after you, if you like. Well. After Kell and Barro, and then you."',
        options: [bye('That\'s fair.')],
      },
    },
  },
  {
    id: 'cc_jory',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => (c.flag('cc_matriarchDead')
          ? 'Jory grins weakly from the cot. "They say you killed the mother. Did she scream? Tell me she screamed."'
          : 'A young man lies on the cot with his leg wrapped in poultice. His eyes are too bright.\n\n"She\'s big. The mother. Big as a cart, and red, like rust. She sits in the dark at the back and the little ones bring her things. They brought her Kell."'),
        options: [bye('Rest easy.')],
      },
    },
  },
  // ---------------------------------------------------------------- Anselm, cook, Hobb, gate guard
  {
    id: 'cc_anselm',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A very old man sits with his back to the wall, a cup of something steaming in his hands. "Sit, sit. Nobody listens to me any more. They\'ve heard it all. You haven\'t, have you?"',
        options: [
          { text: 'Tell me about the war.', to: 'war' },
          { text: 'Do you know anything about the old shelters?', to: 'shelters' },
          { text: 'Any strange stories lately?', to: 'giants' },
          { text: 'Story! Tell story!', lowInt: true, to: 'war' },
          bye('Maybe another time.'),
        ],
      },
      war: {
        text: '"My father was a boy when it happened. He said the sky went white, then the colour of a bruise, then nothing at all for a week. After that it rained ash, and after that it didn\'t rain at all for three years. He never knew who started it. Nobody did. He said that was the worst part: you couldn\'t even hate anybody properly."',
        options: [{ text: 'And the shelters?', any: true, to: 'shelters' }, { text: 'Thank you.', any: true, to: 'hello' }],
      },
      shelters: {
        onEnter: (c) => c.reveal('calder'),
        text: '"The city ones, you mean. At Calder, south-east, there was a great hole under the train station with a door as thick as this hut. My father saw it close. He said the people outside just stood there afterwards, all afternoon, waiting for it to open again." He sips. "It never did, that I heard. Maybe it\'s still shut. Maybe they\'re still in there, eating tinned peaches."',
        options: [{ text: 'Maybe.', any: true, to: 'hello' }],
      },
      giants: {
        text: '"A caravan man sat right where you\'re sitting, last season. Said he saw grey men walking the eastern flats at dusk, taller than doorways, with iron collars round their necks, carrying a cage between them. Something in the cage was still moving." He shrugs. "He was drunk. But he was scared-drunk, and I know the difference."',
        options: [{ text: 'I\'ll keep my eyes open.', any: true, to: 'hello' }],
      },
    },
  },
  {
    id: 'cc_cook',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => `A broad woman stirs a pot the size of a bathtub. "${c.flag('cc_burrowersDone') ? 'The beetle-killer! Sit, you eat free.' : 'Stew\'s five scrip a bowl. It\'s corn and something. Don\'t ask what the something is.'}"`,
        options: [
          { text: 'I\'ll have a bowl.', if: (c) => !!c.flag('cc_burrowersDone') || c.scrip() >= 5, to: 'eat', do: (c) => { if (!c.flag('cc_burrowersDone')) c.pay(5); c.heal(10); c.advance(15); } },
          { text: 'Food! Food!', lowInt: true, if: (c) => !!c.flag('cc_burrowersDone') || c.scrip() >= 5, to: 'eat', do: (c) => { if (!c.flag('cc_burrowersDone')) c.pay(5); c.heal(10); c.advance(15); } },
          { text: 'What\'s the something?', to: 'something' },
          bye('No thanks.'),
        ],
      },
      eat: {
        text: 'The stew is hot, thin and faintly smoky. It\'s the best thing you\'ve eaten since the shelter, which says something about the shelter.',
        options: [bye('Thanks, Sabeen.')],
      },
      something: {
        text: '"Ox, mostly. Lizard, when the hunters are lucky. Beetle, once, and never again. Tasted like a wet coin."',
        options: [{ text: 'Good to know.', to: 'hello' }],
      },
    },
  },
  {
    id: 'cc_hobb',
    start: 'hello',
    nodes: {
      hello: {
        text: 'A long-haired man with an ale-stained beard toasts you with an empty cup. "A new face! To new faces! May they all be buying."',
        options: [
          { text: 'I\'ll buy you a drink. (5 scrip)', if: (c) => c.scrip() >= 5, to: 'drink', do: (c) => { c.pay(5); } },
          { text: '[Speech] Dag says you know the Roost\'s north wall.', skill: { key: 'speech', diff: 20 }, if: (c) => !c.flag('vr_knowsTrack'), to: 'track', fail: 'nope' },
          { text: 'Drink! Drink together!', lowInt: true, if: (c) => c.scrip() >= 5, to: 'drink', do: (c) => { c.pay(5); } },
          bye('Not now.'),
        ],
      },
      nope: {
        text: '"Might. Might not. My memory works better wet, friend."',
        options: [
          { text: 'I\'ll buy you a drink. (5 scrip)', if: (c) => c.scrip() >= 5, to: 'drink', do: (c) => { c.pay(5); } },
          bye(),
        ],
      },
      drink: {
        text: 'Hobb drinks half the cup in one swallow and wipes his beard. "A gentle soul. What do you want to know? I know everything. Mostly about goats."',
        options: [
          { text: 'Tell me about Vultures\' Roost.', to: 'track' },
          { text: 'Any gossip?', to: 'gossip' },
          bye('Just being friendly.'),
        ],
      },
      track: {
        onEnter: (c) => c.set('vr_knowsTrack'),
        text: '"Ahh, the Roost. I grazed goats on those cliffs for twenty years before the vultures moved in. Two-legged ones." He draws in spilled ale on the table. "Canyon opens west. Their fence runs across it, here. But the north wall, west of the fence, there\'s a crack goes up. Follow it over the top, keep the drop on your right, and it comes down behind their camp. Right by where they keep the cages." He smiles sadly. "Used to keep my goats there. Now it\'s people."',
        options: [{ text: 'Thanks, Hobb. That could save a life.', to: 'hello' }],
      },
      gossip: {
        text: (c) => [
          '"Brannoc waters his ammunition. Not really. But it\'s a good rumour, isn\'t it? I made it up just now."',
          '"Lulah\'s sweet on Dag. Dag\'s sweet on the well. The well\'s sweet on nobody."',
          '"Old Anselm says there are grey giants in the east. Old Anselm also says his teeth were stolen by a crow."',
        ][c.random(3)],
        options: [{ text: 'Ha.', to: 'hello' }],
      },
    },
  },
  {
    id: 'cc_gateguard',
    start: 'hello',
    nodes: {
      hello: {
        text: '"Welcome to Cinder Creek. Keep your weapon holstered and your hands off the corn and we\'ll get along." She jerks a thumb over her shoulder. "Elder Hattie\'s house is the big one north of the well. Captain Dag\'s by the well. Mother Pim east of the Elder\'s. Trade post\'s the first door on your left."',
        options: [
          { text: 'Thanks.', end: true },
          { text: 'What\'s the hole in the rocks to the north-west?', to: 'den' },
          { text: 'Hi! Nice hat!', lowInt: true, to: 'hat' },
        ],
      },
      den: {
        text: '"Well shaft. Was. Now it\'s a beetle nest with a rope ladder. Talk to Dag before you go poking it."',
        options: [bye('Thanks.')],
      },
      hat: {
        text: '"...Thanks. It keeps the sun off." She considers you. "Stay near the well, all right? Nothing bites near the well."',
        options: [{ text: 'Okay!', lowInt: true, end: true }],
      },
    },
  },
]);

function startWren(c: Ctx) {
  if (c.questState('vr_wren') === 'none') c.quest('vr_wren', 'Hattie Voss\'s granddaughter Wren was taken by raiders to Vultures\' Roost, a canyon north-east of Cinder Creek. Their leader is Mother Kestrel.');
  c.reveal('vultures_roost');
}

function startBurrowers(c: Ctx) {
  if (c.questState('cc_burrowers') === 'none') {
    c.quest('cc_burrowers', 'Captain Dag wants the Burrower Matriarch killed. The den is under the old well shaft on the north-west edge of Cinder Creek.');
    c.set('cc_burrowersGiven');
  }
}

// ------------------------------------------------------------------ endings

defineEndings([
  {
    order: 10,
    title: 'Cinder Creek',
    scene: 'dust',
    text: (c) => {
      if (c.flag('hostile:cinder_creek:' + TEAM)) {
        return 'Cinder Creek remembered the stranger from the shelter who turned a gun on its farmers. They buried their dead by the dry well and put a spear across the road, and for a generation no one in a teal jumpsuit was given water there.';
      }
      const parts: string[] = [];
      if (c.flag('cc_matriarchDead')) {
        parts.push('With the burrower nest cleared, Ezra Quint\'s diggers broke through to the old aquifer that winter. Cinder Creek\'s well ran sweet again, and the village doubled in ten years.');
        if (!c.flag('cc_eggsBurned')) parts.push('Burrowers returned to the shaft two springs later, but the village was ready for them.');
      } else {
        parts.push('The well at Cinder Creek dropped a hand\'s width every month. In the dry season of 2179 the last families loaded their oxen and walked south, and the adobe huts slowly melted back into the sand.');
      }
      if (c.flag('cc_pumpFixed') && c.flag('cc_matriarchDead')) parts.push('Odell Fenn\'s windpump kept the east fields green until the day he died, and he died on top of it, adjusting something.');
      if (c.flag('cc_oxSaved')) parts.push('Old Marta pulled the plough for six more years and was buried with honours.');
      if (c.flag('dead:hattie')) parts.push('Nobody replaced Elder Hattie. People just kept asking what she would have said.');
      return parts.join(' ');
    },
  },
]);
