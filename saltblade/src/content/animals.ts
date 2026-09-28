// Beasts of the waste: predators, grazers, scavengers and machines.
import type { WeaponStats } from './items';

export type Shape = 'hound' | 'shellback' | 'hookbeak' | 'skitter' | 'crab' | 'bat' | 'bovine' | 'goat' | 'spider' | 'turtle' | 'fly' | 'stalker';

export interface AnimalDef {
  key: string;
  name: string;
  plural: string;
  desc: string;
  shape: Shape;
  size: number;
  hp: number;
  armour: [number, number];
  attack: WeaponStats;
  walk: number;
  run: number;
  power: number;
  diet: 'predator' | 'grazer' | 'scavenger' | 'machine';
  aggro: number; // metres at which it attacks (predators) or flees (grazers)
  pack: [number, number];
  loot: [string, number, number][];
  skills: { melee_atk: number; melee_def: number; toughness: number; strength: number; dexterity: number; dodge: number };
  colors: [number, number, number];
  eatsDowned?: boolean;
  robot?: boolean;
  tame?: boolean;
  bleedMul?: number;
}

const bite = (cut: number, blunt: number, reach: number, speed: number, extra: Partial<WeaponStats> = {}): WeaponStats => ({
  kind: 'claw', skill: 'unarmed', cut, blunt, reach, speed, weight: 0, bleed: 1.2, pierce: 0.1, vsAnimal: 1, vsRobot: 0.7, vsHuman: 1, def: 0, ...extra,
});

export const ANIMALS: AnimalDef[] = [
  {
    key: 'dunehound', name: 'Dunehound', plural: 'Dunehounds', shape: 'hound', size: 1,
    desc: 'Bone-plated desert dogs that hunt in packs and drag down anything that falls behind.',
    hp: 0.8, armour: [0.12, 0.05], attack: bite(15, 5, 1.3, 1.2), walk: 1.8, run: 6.8, power: 26, diet: 'predator', aggro: 45, pack: [3, 7],
    loot: [['raw_meat', 1, 2], ['hide', 0, 1], ['bone', 0, 1]], skills: { melee_atk: 14, melee_def: 6, toughness: 10, strength: 8, dexterity: 14, dodge: 10 },
    colors: [0x9a7a56, 0xd8c8a8, 0x1a1410], eatsDowned: true,
  },
  {
    key: 'shellback', name: 'Shellback', plural: 'Shellbacks', shape: 'shellback', size: 1.6,
    desc: 'A slow, armoured grazer with a shell like a hill. Caravans use them as pack beasts.',
    hp: 2.6, armour: [0.35, 0.2], attack: bite(0, 26, 1.8, 0.6), walk: 1.3, run: 3.6, power: 50, diet: 'grazer', aggro: 0, pack: [2, 5],
    loot: [['raw_meat', 3, 6], ['hide', 1, 2], ['chitin', 1, 2]], skills: { melee_atk: 8, melee_def: 4, toughness: 22, strength: 30, dexterity: 4, dodge: 1 },
    colors: [0x7a6a4e, 0xb8a47a, 0x1a1410], tame: true,
  },
  {
    key: 'hookbeak', name: 'Hookbeak', plural: 'Hookbeaks', shape: 'hookbeak', size: 1.8,
    desc: 'A towering long-necked horror with a beak like a cleaver. If you see one, you are already too close.',
    hp: 3.2, armour: [0.2, 0.12], attack: bite(40, 18, 2.6, 0.95, { bleed: 1.6, knock: 0.3 }), walk: 2, run: 7.8, power: 170, diet: 'predator', aggro: 70, pack: [1, 3],
    loot: [['raw_meat', 5, 8], ['hide', 2, 3], ['bone', 2, 3]], skills: { melee_atk: 45, melee_def: 25, toughness: 40, strength: 50, dexterity: 30, dodge: 8 },
    colors: [0x6a6258, 0x3a3630, 0xd83a1a], eatsDowned: true,
  },
  {
    key: 'skitter', name: 'Skitter', plural: 'Skitters', shape: 'skitter', size: 1,
    desc: 'Six-legged hunting insects as big as a dog, fast and vicious.',
    hp: 0.7, armour: [0.25, 0.1], attack: bite(16, 4, 1.2, 1.35), walk: 2.2, run: 7.2, power: 28, diet: 'predator', aggro: 40, pack: [3, 8],
    loot: [['chitin', 0, 1], ['raw_meat', 0, 1]], skills: { melee_atk: 15, melee_def: 8, toughness: 8, strength: 6, dexterity: 20, dodge: 15 },
    colors: [0x4a4a2a, 0x8a8a4a, 0xc83a1a], eatsDowned: true,
  },
  {
    key: 'brineclaw', name: 'Brineclaw', plural: 'Brineclaws', shape: 'crab', size: 1.1,
    desc: 'Armoured shore crabs with pincers that crush bone.',
    hp: 1.2, armour: [0.45, 0.25], attack: bite(8, 20, 1.3, 0.9), walk: 1.4, run: 4.2, power: 30, diet: 'predator', aggro: 25, pack: [2, 6],
    loot: [['raw_meat', 1, 2], ['chitin', 1, 2]], skills: { melee_atk: 12, melee_def: 14, toughness: 18, strength: 16, dexterity: 6, dodge: 2 },
    colors: [0xa8583a, 0xd8a078, 0x1a1a1a],
  },
  {
    key: 'carrionbat', name: 'Carrion Bat', plural: 'Carrion Bats', shape: 'bat', size: 0.9,
    desc: 'Flightless leathery scavengers that walk on their wings and swarm the dying.',
    hp: 0.6, armour: [0.05, 0.05], attack: bite(10, 4, 1.1, 1.3), walk: 1.6, run: 6, power: 12, diet: 'scavenger', aggro: 30, pack: [4, 9],
    loot: [['hide', 0, 1], ['raw_meat', 0, 1]], skills: { melee_atk: 8, melee_def: 4, toughness: 5, strength: 4, dexterity: 12, dodge: 10 },
    colors: [0x4a3a36, 0x6a5450, 0xd8c040], eatsDowned: true,
  },
  {
    key: 'longhorn', name: 'Longhorn', plural: 'Longhorns', shape: 'bovine', size: 1.4,
    desc: 'Shaggy grazing beasts with sweeping horns. Placid, until cornered.',
    hp: 2, armour: [0.1, 0.06], attack: bite(4, 24, 1.8, 0.8, { knock: 0.25 }), walk: 1.4, run: 5.6, power: 36, diet: 'grazer', aggro: 0, pack: [3, 8],
    loot: [['raw_meat', 4, 6], ['hide', 1, 2], ['bone', 1, 1]], skills: { melee_atk: 10, melee_def: 3, toughness: 16, strength: 24, dexterity: 6, dodge: 2 },
    colors: [0x7a5a3a, 0xa88a60, 0x1a1410],
  },
  {
    key: 'goatling', name: 'Goatling', plural: 'Goatlings', shape: 'goat', size: 0.8,
    desc: 'Nimble horned grazers. Good eating.',
    hp: 0.6, armour: [0.05, 0.03], attack: bite(2, 10, 1, 1), walk: 1.5, run: 6.2, power: 8, diet: 'grazer', aggro: 0, pack: [2, 6],
    loot: [['raw_meat', 1, 2], ['hide', 1, 1]], skills: { melee_atk: 4, melee_def: 3, toughness: 4, strength: 4, dexterity: 8, dodge: 12 },
    colors: [0xc8b898, 0x8a7a5a, 0x1a1410],
  },
  {
    key: 'rustspider', name: 'Rustspider', plural: 'Rustspiders', shape: 'spider', size: 1.2,
    desc: 'Maker security machines on eight clattering legs. They still guard what no longer exists.',
    hp: 1.4, armour: [0.5, 0.2], attack: bite(22, 10, 1.4, 1.05), walk: 2, run: 6.2, power: 60, diet: 'machine', aggro: 55, pack: [2, 5],
    loot: [['machine_parts', 0, 1], ['elec_parts', 0, 1], ['iron_plates', 1, 2]], skills: { melee_atk: 24, melee_def: 18, toughness: 20, strength: 18, dexterity: 16, dodge: 6 },
    colors: [0x5a5e62, 0x8a6a4a, 0xff3a1a], robot: true, eatsDowned: true,
  },
  {
    key: 'mauler', name: 'Swamp Mauler', plural: 'Swamp Maulers', shape: 'turtle', size: 1.5,
    desc: 'A snapping swamp beast with a mossy shell and jaws that take limbs.',
    hp: 3, armour: [0.4, 0.3], attack: bite(12, 40, 1.8, 0.7, { knock: 0.3 }), walk: 1.3, run: 3.8, power: 90, diet: 'predator', aggro: 22, pack: [1, 2],
    loot: [['raw_meat', 4, 6], ['chitin', 1, 2], ['hide', 1, 1]], skills: { melee_atk: 26, melee_def: 16, toughness: 36, strength: 40, dexterity: 8, dodge: 1 },
    colors: [0x4a5438, 0x6a6a44, 0xd8a020], eatsDowned: true,
  },
  {
    key: 'bloodfly', name: 'Bloodfly', plural: 'Bloodflies', shape: 'fly', size: 0.7,
    desc: 'Swamp flies the size of a cat. They drink until you fall over.',
    hp: 0.4, armour: [0.02, 0.02], attack: bite(8, 1, 1, 1.5, { bleed: 2.5 }), walk: 3, run: 7, power: 9, diet: 'predator', aggro: 30, pack: [4, 10],
    loot: [], skills: { melee_atk: 10, melee_def: 2, toughness: 2, strength: 2, dexterity: 22, dodge: 25 },
    colors: [0x3a3a2e, 0xa82a1a, 0xc82a1a], eatsDowned: true,
  },
  {
    key: 'glassstalker', name: 'Glass Stalker', plural: 'Glass Stalkers', shape: 'stalker', size: 1.3,
    desc: 'A crystalline predator of the Glasslands. Its hide turns blades.',
    hp: 1.8, armour: [0.55, 0.12], attack: bite(32, 8, 1.6, 1.1, { bleed: 1.4 }), walk: 2, run: 7.4, power: 95, diet: 'predator', aggro: 60, pack: [1, 3],
    loot: [['glass_beads', 1, 3], ['chitin', 0, 1]], skills: { melee_atk: 34, melee_def: 22, toughness: 26, strength: 24, dexterity: 30, dodge: 14 },
    colors: [0x2e4a44, 0x6a9a84, 0x9ae0ff], eatsDowned: true,
  },
  {
    key: 'scrapcrawler', name: 'Scrapcrawler', plural: 'Scrapcrawlers', shape: 'spider', size: 0.8,
    desc: 'Small Maker repair machines on eight thin legs. They still look for faults to mend, and find them in people.',
    hp: 0.9, armour: [0.4, 0.15], attack: bite(12, 8, 1.1, 1.2), walk: 2.2, run: 6.6, power: 32, diet: 'machine', aggro: 40, pack: [3, 6],
    loot: [['iron_plates', 0, 1], ['machine_parts', 0, 1]], skills: { melee_atk: 16, melee_def: 12, toughness: 12, strength: 8, dexterity: 18, dodge: 10 },
    colors: [0x6a5e52, 0x9a7a52, 0xffa020], robot: true,
  },
  {
    key: 'capgrazer', name: 'Capgrazer', plural: 'Capgrazers', shape: 'shellback', size: 1.15,
    desc: 'Squat, shelled grazers that crop the spore-caps of the Thrumwood and the Mire. Slow, placid and good eating.',
    hp: 1.8, armour: [0.3, 0.18], attack: bite(0, 18, 1.4, 0.7), walk: 1.2, run: 3.4, power: 30, diet: 'grazer', aggro: 0, pack: [2, 6],
    loot: [['raw_meat', 2, 3], ['chitin', 1, 1], ['hide', 0, 1]], skills: { melee_atk: 6, melee_def: 3, toughness: 16, strength: 18, dexterity: 4, dodge: 1 },
    colors: [0x6a6a38, 0xa8a060, 0x1a1410],
  },
  {
    key: 'ashjackal', name: 'Ash Jackal', plural: 'Ash Jackals', shape: 'hound', size: 0.85,
    desc: 'Lean grey dogs that trail Mawkin hunts for the scraps. When there are no scraps, they make some.',
    hp: 0.7, armour: [0.08, 0.04], attack: bite(12, 4, 1.2, 1.25), walk: 1.8, run: 6.6, power: 18, diet: 'scavenger', aggro: 35, pack: [3, 6],
    loot: [['raw_meat', 1, 1], ['hide', 0, 1], ['bone', 0, 1]], skills: { melee_atk: 10, melee_def: 5, toughness: 7, strength: 6, dexterity: 14, dodge: 12 },
    colors: [0x6a6660, 0x9a948c, 0xd8a040], eatsDowned: true,
  },
  {
    key: 'cragram', name: 'Crag Ram', plural: 'Crag Rams', shape: 'goat', size: 1.05,
    desc: 'Big-horned rams of the red mesas. Shy until cornered, and then they charge. Young Karuk hunt them to prove they can.',
    hp: 1.1, armour: [0.1, 0.08], attack: bite(4, 22, 1.2, 0.95, { knock: 0.25 }), walk: 1.5, run: 6.4, power: 24, diet: 'grazer', aggro: 0, pack: [2, 5],
    loot: [['raw_meat', 2, 3], ['hide', 1, 1], ['bone', 0, 1]], skills: { melee_atk: 12, melee_def: 6, toughness: 12, strength: 16, dexterity: 10, dodge: 10 },
    colors: [0x8a5a3e, 0xc8a078, 0x1a1410],
  },
  {
    key: 'sandclaw', name: 'Sandclaw', plural: 'Sandclaws', shape: 'crab', size: 1.3,
    desc: 'Sand-coloured crabs that lie buried in the dunes and come up under your feet.',
    hp: 1.6, armour: [0.45, 0.25], attack: bite(14, 24, 1.4, 0.85), walk: 1.4, run: 4.6, power: 48, diet: 'predator', aggro: 20, pack: [1, 3],
    loot: [['raw_meat', 1, 3], ['chitin', 1, 2]], skills: { melee_atk: 20, melee_def: 14, toughness: 24, strength: 24, dexterity: 8, dodge: 2 },
    colors: [0xc89c62, 0xe0c090, 0x1a1a1a],
  },
  {
    key: 'tidegrazer', name: 'Tidegrazer', plural: 'Tidegrazers', shape: 'bovine', size: 1.5,
    desc: 'Fat grey beasts that graze the seagrass at low tide and bellow in the fog. Lowtide hunts them for meat and hide.',
    hp: 2.2, armour: [0.12, 0.1], attack: bite(2, 22, 1.7, 0.75, { knock: 0.2 }), walk: 1.2, run: 4.8, power: 34, diet: 'grazer', aggro: 0, pack: [2, 5],
    loot: [['raw_meat', 4, 6], ['hide', 1, 2], ['bone', 0, 1]], skills: { melee_atk: 8, melee_def: 3, toughness: 18, strength: 22, dexterity: 4, dodge: 1 },
    colors: [0x6a6e6e, 0x9aa0a0, 0x1a1a1a],
  },
];

export const ANIMAL: Record<string, AnimalDef> = Object.fromEntries(ANIMALS.map((a) => [a.key, a]));
