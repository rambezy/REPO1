// Ways to begin. Each puts a handful of people somewhere in the world with
// whatever they have, and nothing else.

import type { Role } from '../sim/char';

export interface ScenarioPerson {
  role?: Role; // what they were: shapes which skills they start with (default wanderer)
  races?: string[]; // allowed races
  female?: boolean;
  level: number;
  loadout: string;
  kit?: [string, number][];
  lost?: number[]; // limbs already gone (see sim/body LI)
  hurt?: number; // fraction of limb health already lost
  hunger?: number;
  shackled?: boolean;
  enslavedBy?: string;
}

export interface Scenario {
  key: string;
  name: string;
  diff: 'Easy' | 'Normal' | 'Hard' | 'Very hard' | 'Brutal';
  blurb: string;
  desc: string;
  squad: string;
  money: number;
  people: ScenarioPerson[];
  /** where: near a settlement or landmark (offset in metres), or anywhere in a region */
  start: { settlement?: string; landmark?: string; region?: string; off?: [number, number]; inside?: boolean };
  rel?: Record<string, number>;
  bounty?: Record<string, number>;
  homestead?: boolean;
  research?: string[];
  items?: [string, number][]; // put in the first storage, or split among the people
  hidden?: boolean;
}

export const SCENARIOS: Scenario[] = [
  {
    key: 'wanderer', name: 'The Wanderer', diff: 'Normal',
    blurb: 'One person, a thousand chits and a road.',
    desc: 'You walk into Crossroad with a cheap blade, a few days of food and a purse of chits. Nobody here knows your name yet. Find work, find people, find trouble. The world goes on either way.',
    squad: 'Nameless', money: 1000,
    people: [{ level: 8, loadout: 'drifters_wanderer', kit: [['dried_meat', 3], ['bandages', 2]] }],
    start: { settlement: 'crossroad', off: [170, 40] },
  },
  {
    key: 'freeholders', name: 'Freeholders', diff: 'Easy',
    blurb: 'Four settlers with a claim in the Vale, a shack and a field.',
    desc: 'The four of you pooled everything for a patch of green country on the edge of the Vale, a long day\'s walk from Aurum. There is a shack, a wheat field, a well and a food store. The Concord taxes everything that grows on its land, and the Reavers want their share too.',
    squad: 'Freeholders', money: 1500,
    people: [
      { role: 'worker', level: 6, loadout: 'drifters_resident', kit: [['dustbread', 3]] },
      { role: 'worker', level: 6, loadout: 'drifters_resident', kit: [['dustbread', 3]] },
      { role: 'worker', level: 6, loadout: 'drifters_resident', kit: [['dustbread', 3]] },
      { role: 'worker', level: 6, loadout: 'drifters_resident', kit: [['dustbread', 3]] },
    ],
    start: { settlement: 'aurum', region: 'vale', off: [-900, 500] },
    homestead: true,
    items: [['building_mats', 30], ['wheat', 20], ['dustbread', 10], ['bandages', 6]],
  },
  {
    key: 'blades', name: 'Hired Blades', diff: 'Normal',
    blurb: 'Three sell-swords whose employer died owing them wages.',
    desc: 'Your caravan master took a bolt in the throat on the Harrow road. The three of you buried him, took what was left and now answer to nobody. You can fight. Everything else you will have to learn.',
    squad: 'The Unpaid', money: 400,
    people: [
      { role: 'merc', level: 22, loadout: 'merc', kit: [['first_aid', 1], ['dried_meat', 2]] },
      { role: 'merc', level: 20, loadout: 'merc', kit: [['first_aid', 1], ['dried_meat', 2]] },
      { role: 'merc', level: 20, loadout: 'merc', kit: [['bandages', 2], ['dried_meat', 2]] },
    ],
    start: { settlement: 'harrowmarket', off: [-260, 90] },
  },
  {
    key: 'karuk', name: 'Horned Pilgrims', diff: 'Normal',
    blurb: 'Three young Karuk sent out to prove themselves.',
    desc: 'Hornspire sent you out with a blessing and a threat: come back with honour or do not come back. You are strong as rocks and about as quick to learn anything that is not a fight. The Covenant burns your kind on sight.',
    squad: 'Hornborn', money: 600,
    people: [
      { role: 'merc', races: ['karuk'], level: 14, loadout: 'karuk_resident', kit: [['dried_meat', 3]] },
      { role: 'merc', races: ['karuk'], level: 12, loadout: 'karuk_resident', kit: [['dried_meat', 3]] },
      { role: 'merc', races: ['karuk'], level: 12, loadout: 'karuk_resident', kit: [['bandages', 2]] },
    ],
    start: { settlement: 'hornspire', off: [240, 210] },
    rel: { karuk: 30 },
  },
  {
    key: 'constructs', name: 'Old Iron', diff: 'Normal',
    blurb: 'Two Hollows wake in the Rust with no memory of their makers.',
    desc: 'The two of you came online in a ruin at the edge of the Rust, joints grinding, memory wiped. You do not eat and you do not bleed, but you do wear out, and repair kits are dear. The Covenant hunts machines.',
    squad: 'Unmade', money: 250,
    people: [
      { races: ['hollow'], level: 10, loadout: 'hollows_resident', kit: [['repair_kit', 2]] },
      { races: ['hollow'], level: 10, loadout: 'hollows_resident', kit: [['repair_kit', 1]] },
    ],
    start: { settlement: 'rustward', off: [-300, 260] },
  },
  {
    key: 'deserters', name: 'Deserters', diff: 'Hard',
    blurb: 'Two Concord soldiers who threw down their sabres.',
    desc: 'You walked away from the Stonegate garrison with your kit and each other. Now there are posters with your faces on every Concord wall, and patrols that would love to collect. The Drifters might hide you. The Unchained might even welcome you.',
    squad: 'Deserters', money: 300,
    people: [
      { role: 'merc', races: ['valefolk', 'duneborn'], level: 18, loadout: 'concord_guard', kit: [['bandages', 2], ['dried_meat', 2]] },
      { role: 'merc', races: ['valefolk', 'duneborn'], level: 16, loadout: 'concord_guard', kit: [['bandages', 2], ['dried_meat', 2]] },
    ],
    start: { settlement: 'stonegate', off: [-520, 180] },
    bounty: { concord: 3000 },
    rel: { concord: -30, unchained: 20 },
  },
  {
    key: 'chainbound', name: 'Chain-Bound', diff: 'Very hard',
    blurb: 'A slave in the fields of Chainfield, in shackles and rags.',
    desc: 'You were sold to the Chainhouse for a debt that was not yours. The overseers watch the fields by day and the dogs by night. Pick your shackles when nobody is looking, slip out past the guards, or bide your time and wait for a better chance. Runaways are hunted.',
    squad: 'Runaways', money: 0,
    people: [{ level: 5, loadout: 'slave', shackled: true, enslavedBy: 'chainhouse', hunger: 120 }],
    start: { settlement: 'chainfield', off: [0, 0], inside: true },
  },
  {
    key: 'nothing', name: 'Nothing Left', diff: 'Brutal',
    blurb: 'Robbed, beaten and missing an arm in the Ashlands.',
    desc: 'The Reavers took your purse, your boots and your left arm, and left you for the carrion bats. You are hungry, you are bleeding, and the land around you is ash and cinders. Get up.',
    squad: 'Survivor', money: 0,
    people: [{ level: 3, loadout: 'prisoner', lost: [3], hurt: 0.55, hunger: 40 }],
    start: { region: 'ash' },
  },
  {
    key: 'fight', name: 'Proving Ground', diff: 'Normal', hidden: true,
    blurb: 'Three mercenaries, four Reavers and a pack of dunehounds.',
    desc: 'A test of the fighting.',
    squad: 'Wanderers', money: 1000,
    people: [
      { role: 'merc', level: 22, loadout: 'merc', kit: [['first_aid', 2], ['dried_meat', 3]] },
      { role: 'merc', level: 22, loadout: 'merc', kit: [['first_aid', 2], ['dried_meat', 3]] },
      { role: 'merc', level: 22, loadout: 'merc', kit: [['first_aid', 2], ['dried_meat', 3]] },
    ],
    start: { settlement: 'crossroad', off: [260, 80] },
  },
];

export const SCENARIO: Record<string, Scenario> = Object.fromEntries(SCENARIOS.map((s) => [s.key, s]));
