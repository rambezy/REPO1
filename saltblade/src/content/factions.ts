// Factions of the Sundered Waste and how they feel about one another.

export type Attitude = 'civil' | 'bandit' | 'predator' | 'machine' | 'zealot' | 'slaver' | 'hive' | 'player' | 'fauna';

export interface FactionDef {
  key: string;
  name: string;
  short: string;
  color: number;
  attitude: Attitude;
  desc: string;
  races: [string, number][]; // race/subrace keys and weights for generated members
  lawful: boolean;
  /** crimes this faction punishes */
  laws: { theft?: boolean; assault?: boolean; trespass?: boolean; nonHuman?: boolean; hollow?: boolean; runaway?: boolean; drugs?: boolean };
  /** guards will demand tribute/arrest before fighting */
  demands?: 'tribute' | 'food' | 'inspection' | 'tax' | 'none';
  /** attacks knocked-out enemies (cannibals, beasts) */
  finishes?: boolean;
  /** carries captives away (slavers, cannibals) */
  captures?: 'slavery' | 'prison' | 'eat' | 'none';
  playerRel: number;
  hidden?: boolean; // not listed in the factions panel until met
  uniform: { shirt: number[]; armour: number[]; hat?: string[]; cloth: number[] };
  ranks: string[];
}

export const FACTIONS: FactionDef[] = [
  {
    key: 'player', name: 'Nameless', short: 'You', color: 0xe8d9a8, attitude: 'player',
    desc: 'Your people.', races: [['valefolk', 1]], lawful: false, laws: {}, playerRel: 100,
    uniform: { shirt: [0x6b5a44], armour: [0x5a4c3c], cloth: [0x7a6a52] }, ranks: ['Member'],
  },
  {
    key: 'drifters', name: 'Free Drifters', short: 'Drifters', color: 0xc2a87a, attitude: 'civil',
    desc: 'The unaligned folk of the waste: scavengers, traders, squatters and the Watch that keeps a rough peace in the free towns.',
    races: [['valefolk', 3], ['duneborn', 4], ['karuk', 1], ['thrum_worker', 0.6], ['hollow', 0.4]],
    lawful: true, laws: { theft: true, assault: true, trespass: true }, playerRel: 10, demands: 'none', captures: 'prison',
    uniform: { shirt: [0x7a6a52, 0x5e5446, 0x8a7458, 0x6a5e4e], armour: [0x5c5042, 0x6e5e48], cloth: [0x8c7a5c, 0x6e6454], hat: ['straw', 'hood', 'none', 'none', 'bandana'] },
    ranks: ['Drifter', 'Watchman', 'Watch Sergeant', 'Watch Captain'],
  },
  {
    key: 'concord', name: 'The Gilded Concord', short: 'Concord', color: 0xc9a44a, attitude: 'civil',
    desc: 'An empire of noble Houses bound by contract and coin. Its Blades keep order, its merchants keep accounts, and its fields are worked by the chained.',
    races: [['valefolk', 5], ['duneborn', 3]],
    lawful: true, laws: { theft: true, assault: true, trespass: true, runaway: true }, playerRel: 0, demands: 'tax', captures: 'slavery',
    uniform: { shirt: [0x6e2e24, 0x7a3a28], armour: [0x3c3a3e, 0x4a4648], cloth: [0x5a2a22, 0x2e2c30], hat: ['kasa', 'kabuto'] },
    ranks: ['Subject', 'Blade', 'Blade Captain', 'Magistrate', 'Lord'],
  },
  {
    key: 'chainhouse', name: 'The Chainhouse', short: 'Chainhouse', color: 0x8a5a3a, attitude: 'slaver',
    desc: 'Licensed slavers of the Concord. They buy, sell and hunt people along the roads, and they are always looking for the weak and the alone.',
    races: [['valefolk', 3], ['duneborn', 3]],
    lawful: true, laws: { theft: true, assault: true, runaway: true }, playerRel: 0, demands: 'inspection', captures: 'slavery',
    uniform: { shirt: [0x3e3226, 0x4a3a2a], armour: [0x5a3e2a, 0x4e3624], cloth: [0x2e2620], hat: ['hood', 'none', 'kasa'] },
    ranks: ['Hunter', 'Chainmaster', 'Slave Lord'],
  },
  {
    key: 'ember', name: 'The Ember Covenant', short: 'Covenant', color: 0xe07a2a, attitude: 'zealot',
    desc: 'A theocracy of the Undying Ember, the sun that judges. Its Wardens burn heretics, and it counts Hollows, Karuk and Thrum as abominations to be cleansed.',
    races: [['valefolk', 6], ['duneborn', 2]],
    lawful: true, laws: { theft: true, assault: true, trespass: true, nonHuman: true, hollow: true, drugs: true }, playerRel: 0, demands: 'inspection', captures: 'prison',
    uniform: { shirt: [0xd8d0bc, 0xcfc4a8], armour: [0xb8b0a0, 0xc8a050], cloth: [0xe0d8c4, 0xa84a22], hat: ['helm_ember', 'hood_white'] },
    ranks: ['Faithful', 'Warden', 'Flamebearer', 'Inquisitor', 'High Pyre'],
  },
  {
    key: 'karuk', name: 'The Karuk Warhost', short: 'Karuk', color: 0xb05a3a, attitude: 'civil',
    desc: 'The horned warrior people of the highlands. They live for the clean fight and the honourable death, and they have been at war with everyone for a thousand years.',
    races: [['karuk', 1]],
    lawful: true, laws: { theft: true, assault: true }, playerRel: 0, demands: 'none', captures: 'prison',
    uniform: { shirt: [0x6a4a3a, 0x5a3e30], armour: [0x7a5a46, 0x8a6a50], cloth: [0x4a3428, 0x6a4e3a], hat: ['none', 'horncap'] },
    ranks: ['Warrior', 'Horn Guard', 'War Chief', 'Horn King'],
  },
  {
    key: 'thrum', name: 'The Thrum Hives', short: 'Thrum', color: 0xc8a030, attitude: 'hive',
    desc: 'The insect people of the Thrumwood, one mind in many bodies, humming together under their Queens. Peaceful to those who are peaceful.',
    races: [['thrum_worker', 4], ['thrum_soldier', 1]],
    lawful: true, laws: { theft: true, assault: true }, playerRel: 5, demands: 'none', captures: 'prison',
    uniform: { shirt: [0x8a7a4a], armour: [0x6a5a30], cloth: [0x7a6a3a], hat: ['none'] },
    ranks: ['Worker', 'Soldier', 'Prince', 'Queen'],
  },
  {
    key: 'blackcomb', name: 'Blackcomb Hive', short: 'Blackcomb', color: 0x3a3a2a, attitude: 'bandit',
    desc: 'A hive whose Queen went mad and died. Its children still serve her corpse, and strike at anything that moves.',
    races: [['thrum_soldier', 2], ['thrum_worker', 2]],
    lawful: false, laws: {}, playerRel: -100, finishes: true, captures: 'none', hidden: true,
    uniform: { shirt: [0x2e2c24], armour: [0x24221c], cloth: [0x34302a], hat: ['none'] },
    ranks: ['Drone', 'Husk Soldier', 'Black Prince'],
  },
  {
    key: 'delvers', name: "The Delvers' League", short: 'Delvers', color: 0x5aa0a8, attitude: 'civil',
    desc: 'Explorers, scholars and tomb-robbers who dig up the Old Makers. They pay well for relics and better for knowledge.',
    races: [['valefolk', 3], ['duneborn', 3], ['hollow', 1], ['karuk', 1]],
    lawful: true, laws: { theft: true, assault: true }, playerRel: 10, demands: 'none', captures: 'prison',
    uniform: { shirt: [0x4a5a5a, 0x5a6a6a], armour: [0x3a4a4a, 0x4a5050], cloth: [0x6a6a5a], hat: ['goggles', 'hood', 'none'] },
    ranks: ['Digger', 'Delver', 'Expedition Master'],
  },
  {
    key: 'unchained', name: 'The Unchained', short: 'Unchained', color: 0x7aa05a, attitude: 'civil',
    desc: 'Runaway slaves and those who shelter them. They strike at Chainhouse caravans and free whoever they can.',
    races: [['valefolk', 2], ['duneborn', 3], ['karuk', 1], ['thrum_worker', 1]],
    lawful: true, laws: { theft: true, assault: true }, playerRel: 0, demands: 'none', captures: 'none', hidden: true,
    uniform: { shirt: [0x5a6a44, 0x4a5a3a], armour: [0x4a4a3a], cloth: [0x6a6e50], hat: ['bandana', 'none'] },
    ranks: ['Free', 'Liberator', 'Unchained Leader'],
  },
  {
    key: 'hollows', name: 'Hollow Remnants', short: 'Hollows', color: 0x9aa8b0, attitude: 'civil',
    desc: 'Ancient thinking machines who outlived their makers. Some serve, some wander, some remember too much. Rustward is their last enclave.',
    races: [['hollow', 1]],
    lawful: true, laws: { theft: true, assault: true }, playerRel: 0, demands: 'none', captures: 'prison',
    uniform: { shirt: [0x6a7078], armour: [0x5a6068], cloth: [0x4a5058], hat: ['none'] },
    ranks: ['Unit', 'Sentinel', 'Custodian'],
  },
  {
    key: 'wardens', name: 'Warden Constructs', short: 'Constructs', color: 0x5a7a8a, attitude: 'machine',
    desc: 'Guardian machines of the Old Makers, still obeying orders from a dead world: nothing may enter.',
    races: [['construct', 1]],
    lawful: false, laws: {}, playerRel: -100, finishes: true, captures: 'none', hidden: true,
    uniform: { shirt: [0x4a5660], armour: [0x3a4650], cloth: [0x303a42], hat: ['none'] },
    ranks: ['Construct', 'Warden Prime'],
  },
  {
    key: 'reavers', name: 'Dust Reavers', short: 'Reavers', color: 0xa05a3a, attitude: 'bandit',
    desc: 'Bandits of the flats who take what they want from anyone too weak to stop them. Pay the toll, or bleed.',
    races: [['duneborn', 4], ['valefolk', 3], ['karuk', 1]],
    lawful: false, laws: {}, playerRel: -60, demands: 'tribute', captures: 'none',
    uniform: { shirt: [0x6a4a3a, 0x7a5a42, 0x5a4034], armour: [0x5a3e2e, 0x4e3a2c], cloth: [0x5e4636], hat: ['bandana', 'none', 'hood', 'skullcap'] },
    ranks: ['Reaver', 'Reaver Boss', 'Reaver Lord'],
  },
  {
    key: 'starvelings', name: 'Starvelings', short: 'Starvelings', color: 0x8a7a5a, attitude: 'bandit',
    desc: 'Starving bandits in rags who will fight to the death for a crust of bread. Mostly the death.',
    races: [['duneborn', 3], ['valefolk', 3]],
    lawful: false, laws: {}, playerRel: -70, demands: 'food', captures: 'none',
    uniform: { shirt: [0x6a6050, 0x5a5448], armour: [0x4a4438], cloth: [0x5a5446], hat: ['none', 'bandana'] },
    ranks: ['Starveling'],
  },
  {
    key: 'scorched', name: 'The Scorched Hand', short: 'Scorched Hand', color: 0x9a3a2a, attitude: 'bandit',
    desc: 'The swamp syndicate: dreamleaf growers, smugglers and killers. In Mudwater they are the law; outside it they are the storm.',
    races: [['duneborn', 3], ['valefolk', 3], ['karuk', 1]],
    lawful: true, laws: { theft: true, assault: true }, playerRel: -10, demands: 'tribute', captures: 'slavery',
    uniform: { shirt: [0x4a2a24, 0x3e2622], armour: [0x3a2a26, 0x5a2a22], cloth: [0x6a2a22], hat: ['none', 'bandana', 'hood'] },
    ranks: ['Hand', 'Enforcer', 'Knuckle', 'the Burnt King'],
  },
  {
    key: 'mawkin', name: 'The Mawkin', short: 'Mawkin', color: 0x6a5a4a, attitude: 'predator',
    desc: 'The cannibal tribes of the Ashfields. They drag the fallen home to their cookfires.',
    races: [['duneborn', 3], ['valefolk', 3]],
    lawful: false, laws: {}, playerRel: -100, finishes: false, captures: 'eat', hidden: true,
    uniform: { shirt: [0x5a4a3a], armour: [0x6a5a48, 0x4a3e32], cloth: [0x4a3a2e], hat: ['skullcap', 'none'] },
    ranks: ['Mawkin', 'Mawkin Hunter', 'Mawkin Chief'],
  },
  {
    key: 'mistcrawlers', name: 'Mistcrawlers', short: 'Mistcrawlers', color: 0x8a9a9a, attitude: 'predator',
    desc: 'Pale, silent people of the fog. They take the living back into the mist, and nobody knows what happens then.',
    races: [['pale', 1]],
    lawful: false, laws: {}, playerRel: -100, captures: 'eat', hidden: true,
    uniform: { shirt: [0x9aa0a0], armour: [0x8a9090], cloth: [0x7a8080], hat: ['none'] },
    ranks: ['Crawler', 'Mist Prince'],
  },
  {
    key: 'ironcoin', name: 'Iron Coin Company', short: 'Iron Coin', color: 0x8a8a8a, attitude: 'civil',
    desc: 'Mercenaries for hire. Their loyalty lasts exactly as long as your money.',
    races: [['valefolk', 3], ['duneborn', 3], ['karuk', 2], ['hollow', 0.5]],
    lawful: true, laws: { theft: true, assault: true }, playerRel: 5, captures: 'prison',
    uniform: { shirt: [0x4a4a4a, 0x5a5a5a], armour: [0x6a6a6a, 0x5a5a5e], cloth: [0x3a3a3a], hat: ['kabuto', 'none', 'bucket'] },
    ranks: ['Sellsword', 'Company Sergeant'],
  },
  {
    key: 'fauna', name: 'Wildlife', short: 'Wildlife', color: 0x8a7a50, attitude: 'fauna',
    desc: 'The beasts of the waste.', races: [], lawful: false, laws: {}, playerRel: 0, hidden: true,
    uniform: { shirt: [0], armour: [0], cloth: [0] }, ranks: ['Beast'],
  },
];

export const FACTION: Record<string, FactionDef> = Object.fromEntries(FACTIONS.map((f) => [f.key, f]));

/** Initial relations between factions (symmetric), -100..100. Unlisted pairs are 0. */
export const RELATIONS: [string, string, number][] = [
  ['concord', 'chainhouse', 90], ['concord', 'ember', -25], ['concord', 'karuk', -60], ['concord', 'unchained', -80],
  ['chainhouse', 'unchained', -100], ['ember', 'karuk', -85], ['ember', 'thrum', -70], ['ember', 'hollows', -100],
  ['karuk', 'thrum', 15], ['delvers', 'hollows', 25], ['drifters', 'ironcoin', 20], ['concord', 'ironcoin', 10],
  ['unchained', 'karuk', 20], ['scorched', 'drifters', -20], ['scorched', 'concord', -40], ['scorched', 'ember', -80],
  ['karuk', 'drifters', 10], ['delvers', 'drifters', 15],
];

/** Factions hostile to everything that is not themselves. */
export const HOSTILE_ALL = ['wardens', 'mawkin', 'mistcrawlers', 'blackcomb', 'starvelings'];
/** Bandit factions: hostile to lawful factions, mildly to each other. */
export const BANDITS = ['reavers', 'starvelings', 'scorched', 'mawkin'];

export const HOSTILE_AT = -50;
export const UNFRIENDLY_AT = -20;
export const FRIENDLY_AT = 30;
