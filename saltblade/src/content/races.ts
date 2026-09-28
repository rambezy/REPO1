// Peoples of the waste: humans, Karuk, Thrum and Hollows, and the few things
// that walk on two legs without being any of them.

export interface RaceDef {
  key: string;
  race: 'human' | 'karuk' | 'thrum' | 'hollow' | 'construct' | 'pale';
  name: string;
  desc: string;
  hp: number; // limb HP multiplier
  speed: number; // movement multiplier
  bleed: number; // bleeding multiplier (machines leak nothing)
  hunger: number; // hunger rate multiplier
  heal: number; // natural healing multiplier
  xp: Partial<Record<string, number>>; // skill learning multipliers
  start: Partial<Record<string, number>>; // bonus starting levels
  skin: number[];
  hair: number[];
  eyes: number;
  height: [number, number]; // metres
  bulk: [number, number];
  helmets: boolean; // can wear hats and helmets
  boots: boolean;
  robotic: boolean;
  playable: boolean;
}

export const RACES: RaceDef[] = [
  {
    key: 'valefolk', race: 'human', name: 'Valefolk',
    desc: 'Humans of the greener country: farmers, clerks and survivors. Quick to learn crafts and letters.',
    hp: 1, speed: 1, bleed: 1, hunger: 1, heal: 1,
    xp: { science: 1.2, farming: 1.2, cooking: 1.1, smithing: 1.1, engineering: 1.1 }, start: {},
    skin: [0xe8c4a0, 0xdcb08a, 0xc89a76, 0xf0d0b0, 0xd4a684], hair: [0x2a1e16, 0x4a3222, 0x6a4a2e, 0x8a6a3e, 0xb89a60, 0x1a1410, 0x5a4a44],
    eyes: 0x3a2e24, height: [1.66, 1.88], bulk: [0.9, 1.1], helmets: true, boots: true, robotic: false, playable: true,
  },
  {
    key: 'duneborn', race: 'human', name: 'Duneborn',
    desc: 'Sun-darkened humans of the deep desert, lean and hard, at home with a blade and a long walk.',
    hp: 1.05, speed: 1.03, bleed: 1, hunger: 0.95, heal: 1,
    xp: { athletics: 1.15, melee: 1.1, sabres: 1.1, katanas: 1.1, dexterity: 1.1 }, start: { athletics: 2 },
    skin: [0x8a5a3a, 0x7a4a2e, 0x6a3e26, 0x9a6a46, 0x5a3420], hair: [0x1a1410, 0x241a14, 0x3a2a1e, 0x0e0c0a],
    eyes: 0x2a1e16, height: [1.68, 1.9], bulk: [0.85, 1.05], helmets: true, boots: true, robotic: false, playable: true,
  },
  {
    key: 'karuk', race: 'karuk', name: 'Karuk',
    desc: 'Tall, horned and stone-skinned warriors. Strong and tough beyond any human, slow to learn anything that is not fighting.',
    hp: 1.25, speed: 0.98, bleed: 0.9, hunger: 1.15, heal: 1.1,
    xp: { strength: 1.2, toughness: 1.2, heavy: 1.2, blunt: 1.1, science: 0.6, stealth: 0.7, thievery: 0.7, cooking: 0.8 }, start: { strength: 4, toughness: 4 },
    skin: [0x8a8078, 0x7a6e66, 0x9a8a7a, 0x6e6660, 0xa09080], hair: [0x2a2420, 0x4a4038, 0x6a5a4a, 0xd8d0c0],
    eyes: 0xc89a3a, height: [1.9, 2.1], bulk: [1.1, 1.3], helmets: true, boots: true, robotic: false, playable: true,
  },
  {
    key: 'thrum_worker', race: 'thrum', name: 'Thrum Worker',
    desc: 'The lean worker caste of the hives: fast, tireless labourers who heal quickly and fear nothing. They cannot wear hats or boots.',
    hp: 0.85, speed: 1.12, bleed: 1.1, hunger: 0.9, heal: 1.4,
    xp: { labouring: 1.3, athletics: 1.2, farming: 1.2, strength: 0.9, toughness: 0.8 }, start: { athletics: 4, labouring: 4 },
    skin: [0x8a7a3a, 0x9a8a42, 0x7a6a34, 0xa89444], hair: [0x3a3020],
    eyes: 0x1a1a14, height: [1.55, 1.72], bulk: [0.75, 0.9], helmets: false, boots: false, robotic: false, playable: true,
  },
  {
    key: 'thrum_soldier', race: 'thrum', name: 'Thrum Soldier',
    desc: 'The armoured warrior caste: broad, heavy-carapaced and strong, bred to die for the Queen.',
    hp: 1.3, speed: 0.95, bleed: 1, hunger: 1.2, heal: 1.2,
    xp: { strength: 1.2, toughness: 1.3, melee: 1.1, science: 0.5, stealth: 0.6 }, start: { strength: 6, toughness: 6 },
    skin: [0x6a5a2a, 0x5a4a24, 0x7a6a30], hair: [0x2a2418],
    eyes: 0x1a1410, height: [1.8, 1.95], bulk: [1.15, 1.35], helmets: false, boots: false, robotic: false, playable: true,
  },
  {
    key: 'hollow', race: 'hollow', name: 'Hollow',
    desc: 'An Old Maker automaton: it does not eat, bleed or sleep, and heals only by repair. Machines learn slowly, and people fear them.',
    hp: 1.2, speed: 0.97, bleed: 0, hunger: 0, heal: 0,
    xp: { science: 1.3, engineering: 1.3, robotics: 1.4, cooking: 0.5, farming: 0.6, athletics: 0.8 }, start: { toughness: 5, science: 5 },
    skin: [0x9aa0a8, 0x8a9098, 0xa8a49a, 0x7a8088, 0xb0a890], hair: [0x3a3e44],
    eyes: 0x6ae0ff, height: [1.75, 1.95], bulk: [0.95, 1.15], helmets: true, boots: true, robotic: true, playable: true,
  },
  {
    key: 'construct', race: 'construct', name: 'Warden Construct',
    desc: 'A guardian machine of the Old Makers.',
    hp: 1.6, speed: 0.9, bleed: 0, hunger: 0, heal: 0, xp: {}, start: {},
    skin: [0x5a6670, 0x4e5a64], hair: [0x2a3036], eyes: 0xff5a3a, height: [2.0, 2.3], bulk: [1.2, 1.4], helmets: false, boots: false, robotic: true, playable: false,
  },
  {
    key: 'pale', race: 'pale', name: 'Mistcrawler',
    desc: 'Hairless, pale and silent.',
    hp: 0.9, speed: 1.05, bleed: 1, hunger: 1, heal: 1.2, xp: {}, start: {},
    skin: [0xc8c8c0, 0xd0d0c8, 0xb8bcb8], hair: [0xc8c8c0], eyes: 0x101010, height: [1.6, 1.8], bulk: [0.7, 0.85], helmets: false, boots: false, robotic: false, playable: false,
  },
];

export const RACE: Record<string, RaceDef> = Object.fromEntries(RACES.map((r) => [r.key, r]));
export const isHuman = (k: string) => RACE[k]?.race === 'human';
