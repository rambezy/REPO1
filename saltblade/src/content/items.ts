// Every item in the waste. Weapons and armour come in quality grades.
import type { Vis, WeaponVis, WeaponKind, HatStyle, TorsoStyle, ArmourStyle, BackStyle } from '../sim/look';
import type { Skill } from '../sim/skills';
import { BOOKS } from './lore';

export type ItemCat =
  | 'weapon' | 'ranged' | 'body' | 'shirt' | 'head' | 'legs' | 'feet' | 'back' | 'food' | 'drink' | 'drug' | 'medical' | 'resource'
  | 'trade' | 'artifact' | 'book' | 'blueprint' | 'robotics' | 'tool' | 'misc' | 'ammo';

export type EquipSlot = 'weapon' | 'weapon2' | 'ranged' | 'body' | 'shirt' | 'head' | 'legs' | 'feet' | 'back';

export interface WeaponStats {
  kind: WeaponKind;
  skill: Skill;
  cut: number;
  blunt: number;
  reach: number;
  speed: number; // attacks per second multiplier
  weight: number; // swing weight in kg
  bleed: number;
  pierce: number; // armour penetration 0..1
  vsAnimal: number;
  vsRobot: number;
  vsHuman: number;
  def: number; // bonus to melee defence
  twoHanded?: boolean;
  indoor?: number; // penalty indoors (long weapons)
  knock?: number; // knockdown chance
}

export interface RangedStats {
  skill: Skill;
  cut: number;
  blunt: number;
  range: number;
  reload: number; // seconds
  accuracy: number;
  ammo: string;
}

export interface ArmourStats {
  slot: EquipSlot;
  cover: Partial<Record<'head' | 'chest' | 'stomach' | 'larm' | 'rarm' | 'lleg' | 'rleg', number>>;
  cut: number; // damage resist 0..1
  blunt: number;
  dex: number; // attack speed penalty (fraction)
  stealth: number; // stealth penalty
  athletics?: number;
  martial?: number; // unarmed penalty
  acid?: number; // protection against acid rain / gas
  bonus?: Partial<Record<Skill, number>>;
}

export interface ItemDef {
  id: string;
  name: string;
  cat: ItemCat;
  w: number;
  h: number;
  weight: number;
  value: number;
  stack: number;
  desc: string;
  graded?: boolean; // uses quality grades
  weapon?: WeaponStats;
  ranged?: RangedStats;
  armour?: ArmourStats;
  wvis?: WeaponVis;
  vis?: Vis;
  food?: number; // nutrition
  drink?: { mood: number };
  med?: { points: number; quality: number; splint?: boolean; robot?: boolean };
  pack?: { w: number; h: number; lighten: number; combat: number };
  limb?: { part: 'arm' | 'leg'; quality: number; bonus: Partial<Record<Skill, number>> };
  book?: string; // lore text key
  research?: number; // artifact research tier value
  blueprint?: string; // research key unlocked
  illegal?: string[]; // factions that confiscate it
  tags?: string[];
  icon?: string; // icon shape key
  color?: number;
}

export const GRADES = [
  { name: 'Scrap', dmg: 0.55, arm: 0.55, val: 0.3, col: '#8a8070' },
  { name: 'Worn', dmg: 0.7, arm: 0.7, val: 0.6, col: '#a89a80' },
  { name: 'Standard', dmg: 0.85, arm: 0.85, val: 1, col: '#d8ccb0' },
  { name: 'Tempered', dmg: 1, arm: 1, val: 1.9, col: '#8ec07a' },
  { name: 'Fine', dmg: 1.14, arm: 1.12, val: 3.4, col: '#6aa6d8' },
  { name: 'Masterwork', dmg: 1.3, arm: 1.25, val: 6.5, col: '#c08ae0' },
  { name: 'Relic', dmg: 1.5, arm: 1.4, val: 15, col: '#e8b040' },
];

const I: ItemDef[] = [];
const def = (d: ItemDef) => { I.push(d); return d; };

// ---------------------------------------------------------------- weapons
type WDef = [id: string, name: string, kind: WeaponKind, skill: Skill, cut: number, blunt: number, reach: number, speed: number, weight: number, value: number, desc: string, extra?: Partial<WeaponStats>, vis?: Partial<WeaponVis>];
const W: WDef[] = [
  // katanas
  ['drift_blade', 'Drift Blade', 'katana', 'katanas', 32, 3, 1.25, 1.15, 3, 900, 'A light curved blade, the traveller\'s companion. Fast and cutting.', { bleed: 1.2, def: 2 }, { length: 0.9, blade: 0xc8ccd0 }],
  ['longsliver', 'Longsliver', 'katana', 'katanas', 34, 3, 1.4, 1.05, 3.8, 1400, 'A long, thin katana that keeps enemies at a distance.', { bleed: 1.15, def: 3, indoor: 0.1 }, { length: 1.1, blade: 0xd0d4d8 }],
  ['needleline', 'Needleline', 'katana', 'katanas', 28, 2, 1.15, 1.35, 2.3, 1600, 'Barely heavier than a whip. Cuts faster than you can see.', { bleed: 1.35, def: 1 }, { length: 0.8, blade: 0xb8c0c8, wide: 0.7 }],
  ['ember_edge', 'Ember Edge', 'katana', 'katanas', 36, 5, 1.3, 1.08, 3.6, 2400, 'A Covenant blade with a ruddy temper line, blessed at the Great Pyre.', { bleed: 1.2, def: 3, vsRobot: 0.8 }, { length: 0.95, blade: 0xd8a88a }],
  ['moonfang', 'Moonfang', 'katana', 'katanas', 40, 4, 1.3, 1.18, 3.2, 4800, 'A legendary style of blade, forged in the Maker way. Pale as moonlight.', { bleed: 1.3, def: 4 }, { length: 1.0, blade: 0xe8ecf0 }],
  ['springblade', 'Springblade', 'katana', 'katanas', 27, 3, 1.2, 1.1, 3.2, 450, 'A thin blade ground from a Maker leaf spring. It holds an edge for about a week.', { bleed: 1.15, def: 1 }, { length: 0.85, blade: 0x9a9488 }],
  ['leafcutter', 'Leafcutter', 'katana', 'katanas', 27, 2, 1.15, 1.33, 2.3, 1000, 'A short, thin Scorched Hand blade, made for dreamleaf stalks and quiet throats.', { bleed: 1.35, def: 1 }, { length: 0.75, blade: 0xa8b0a0, wide: 0.8 }],
  ['vigil_blade', 'Vigil Blade', 'katana', 'katanas', 34, 4, 1.3, 1.1, 3.4, 1900, 'A Covenant ceremonial blade, carried through the night watch at the Great Pyre. Sharp beneath the gilt.', { bleed: 1.2, def: 3, vsRobot: 0.85 }, { length: 0.95, blade: 0xe0d0b0, handle: 0xc8a040 }],
  ['glass_edge', 'Glass Edge', 'katana', 'katanas', 42, 3, 1.3, 1.2, 3, 6400, 'A Maker relic blade of dark green glass that never chips. Delvers have killed each other for less.', { bleed: 1.4, def: 4 }, { length: 1.0, blade: 0x5a8a7a }],
  // sabres
  ['scrap_sabre', 'Scrap Sabre', 'sabre', 'sabres', 26, 12, 1.2, 1.0, 5.5, 600, 'A broad blade beaten out of a car door, or whatever the Makers called it.', { bleed: 1.0 }, { length: 0.85, blade: 0x9a8a78 }],
  ['dune_sabre', 'Dune Sabre', 'sabre', 'sabres', 31, 11, 1.2, 1.02, 5, 1100, 'The curved sabre of the Duneborn. Good against flesh.', { vsAnimal: 1.1 }, { length: 0.9, blade: 0xc8c0b0 }],
  ['concord_sabre', 'Concord Sabre', 'sabre', 'sabres', 33, 12, 1.25, 1.0, 5.2, 1800, 'Standard issue for Blades of the Gilded Concord.', { def: 2 }, { length: 0.95, blade: 0xd0d0d4 }],
  ['crescent', 'Karuk Crescent', 'sabre', 'sabres', 37, 16, 1.35, 0.9, 7, 2600, 'A huge Karuk sabre, a half-moon of steel.', { knock: 0.05 }, { length: 1.05, blade: 0xb8b0a8, wide: 1.4 }],
  ['ringsabre', 'Ring Sabre', 'sabre', 'sabres', 35, 14, 1.25, 1.05, 5.4, 3600, 'A ring-hilted sabre prized by duellists.', { def: 4 }, { length: 0.95, blade: 0xe0e0e0 }],
  ['taskmaster_sabre', 'Taskmaster Sabre', 'sabre', 'sabres', 26, 18, 1.2, 0.98, 6, 1000, 'A thick-backed Chainhouse sabre, meant for the flat as often as the edge. Damaged goods sell for less.', { knock: 0.05 }, { length: 0.85, blade: 0x8a8278, wide: 1.2 }],
  ['mandible_blade', 'Mandible Blade', 'sabre', 'sabres', 30, 10, 1.2, 1.08, 4, 1300, 'A curved blade of shed soldier-chitin, ground sharp. Light, and it does not rust.', { bleed: 1.1, vsAnimal: 1.05 }, { length: 0.9, blade: 0x8a7a3a, handle: 0x5a4a24 }],
  ['horn_sabre', 'Horn Sabre', 'sabre', 'sabres', 33, 14, 1.3, 0.95, 6.2, 1600, 'A heavy Karuk sabre, the first blade a young warrior earns at the Proving Ground.', { knock: 0.03 }, { length: 1.0, blade: 0xa8a098, wide: 1.2 }],
  // hackers
  ['cleaver', 'Cleaver', 'hacker', 'hackers', 20, 20, 1.05, 0.95, 7, 500, 'A butcher\'s tool promoted to war.', { pierce: 0.2 }, { length: 0.55, blade: 0x9a9690 }],
  ['iron_hatchet', 'Iron Hatchet', 'hacker', 'hackers', 22, 22, 1.1, 0.95, 7.5, 900, 'A heavy chopping blade that bites through armour.', { pierce: 0.25 }, { length: 0.6, blade: 0xa8a49c }],
  ['bone_chopper', 'Bone Chopper', 'hacker', 'hackers', 25, 24, 1.1, 0.9, 8.5, 1500, 'A thick, square cleaver for splitting joints.', { pierce: 0.3, vsAnimal: 1.1 }, { length: 0.65, blade: 0xb0aca4, wide: 1.2 }],
  ['heater', 'Heater Blade', 'hacker', 'hackers', 28, 26, 1.15, 0.92, 8.5, 2600, 'A Maker cleaver design with a thickened spine.', { pierce: 0.35 }, { length: 0.7, blade: 0xc8c4bc, wide: 1.1 }],
  ['gutting_hook', 'Gutting Hook', 'hacker', 'hackers', 22, 18, 1.1, 1.0, 6.5, 700, 'A hooked Mawkin blade of bone and scrap iron, for dressing kills. Every kind of kill.', { bleed: 1.3, pierce: 0.15 }, { length: 0.55, blade: 0xc8bca0, handle: 0x4a3a2a }],
  ['salvage_axe', 'Salvage Axe', 'hacker', 'hackers', 23, 22, 1.1, 0.95, 7.2, 1000, 'A Delver chopper forged from Maker alloy dug out of the Bone Sea. Opens crates, doors and machines.', { pierce: 0.28, vsRobot: 1.1 }, { length: 0.6, blade: 0x8a9a9c }],
  ['warden_cleaver', 'Warden Cleaver', 'hacker', 'hackers', 31, 28, 1.2, 0.95, 8, 4400, 'A relic cleaver taken from a Warden construct, its edge still bright. It goes through plate like bread.', { pierce: 0.42, vsRobot: 1.1 }, { length: 0.72, blade: 0xa8c8d0, wide: 1.1 }],
  // heavy
  ['slab', 'Slab', 'heavy', 'heavy', 40, 28, 1.6, 0.6, 18, 1600, 'A slab of iron with an edge on it. Knocks people off their feet.', { knock: 0.3, twoHanded: true, indoor: 0.15 }, { length: 1.3, blade: 0x8a8680, wide: 1.2 }],
  ['gravemaker', 'Gravemaker', 'heavy', 'heavy', 46, 32, 1.7, 0.56, 21, 2800, 'A heavy greatblade meant to end fights in one blow.', { knock: 0.35, twoHanded: true, indoor: 0.15 }, { length: 1.45, blade: 0xa0a0a0 }],
  ['hornbreaker', 'Hornbreaker', 'heavy', 'heavy', 42, 40, 1.65, 0.55, 24, 3400, 'A Karuk executioner\'s blade.', { knock: 0.4, twoHanded: true, pierce: 0.2, indoor: 0.15 }, { length: 1.4, blade: 0x9a948c, wide: 1.4 }],
  ['sunderer', 'Sunderer', 'heavy', 'heavy', 52, 34, 1.75, 0.52, 22, 5200, 'A relic greatblade. The metal hums faintly.', { knock: 0.4, twoHanded: true, indoor: 0.15 }, { length: 1.5, blade: 0xd8dce0 }],
  ['girder', 'Girder', 'heavy', 'heavy', 36, 30, 1.55, 0.56, 20, 800, 'A length of Maker girder with one edge ground down. Heavy enough that the edge hardly matters.', { knock: 0.3, twoHanded: true, indoor: 0.15 }, { length: 1.25, blade: 0x7a6e62, wide: 1.1 }],
  ['warhost_blade', 'Warhost Greatblade', 'heavy', 'heavy', 44, 30, 1.65, 0.58, 19.5, 2200, 'The long greatblade of the Karuk Warhost, lacquered red at the hilt.', { knock: 0.32, twoHanded: true, indoor: 0.15 }, { length: 1.4, blade: 0xa09890, handle: 0x7a2a1e }],
  ['mesa_splitter', 'Mesa Splitter', 'heavy', 'heavy', 48, 36, 1.7, 0.52, 23, 3800, 'A Horn Guard blade as wide as a door, forged at Hornspire. Said to split a shellback in one blow.', { knock: 0.4, twoHanded: true, pierce: 0.15, indoor: 0.15 }, { length: 1.4, blade: 0x8a7a70, wide: 1.5 }],
  // blunt
  ['iron_club', 'Iron Club', 'blunt', 'blunt', 0, 38, 1.15, 0.8, 11, 500, 'An iron bar. Honest work.', { vsRobot: 1.25, knock: 0.15 }, { length: 0.8, blade: 0x6a6660, handle: 0x5a4a3a }],
  ['knuckle_mace', 'Knuckle Mace', 'blunt', 'blunt', 0, 44, 1.15, 0.78, 12, 1100, 'A flanged mace that cracks armour.', { vsRobot: 1.3, knock: 0.2, pierce: 0.2 }, { length: 0.8, blade: 0x7a7670, variant: 1 }],
  ['bone_maul', 'Bone Maul', 'blunt', 'blunt', 0, 50, 1.3, 0.62, 16, 1400, 'The leg bone of something enormous.', { vsRobot: 1.2, knock: 0.3, twoHanded: true }, { length: 1.1, blade: 0xd8ccb0, handle: 0xc8bca0, wide: 1.3 }],
  ['foundry_hammer', 'Foundry Hammer', 'blunt', 'blunt', 0, 58, 1.35, 0.6, 20, 2600, 'A smith\'s great hammer, perfect for breaking machines.', { vsRobot: 1.5, knock: 0.35, twoHanded: true, pierce: 0.3 }, { length: 1.2, blade: 0x5a5a5e, wide: 1.5 }],
  ['pry_bar', 'Pry Bar', 'blunt', 'blunt', 4, 32, 1.1, 0.82, 8, 600, 'A Delver\'s hooked iron bar. It opens Maker doors, and Maker machines.', { vsRobot: 1.4, pierce: 0.2, knock: 0.1 }, { length: 0.75, blade: 0x5a5e62, handle: 0x4a4e52, wide: 0.6 }],
  ['jaw_club', 'Jawbone Club', 'blunt', 'blunt', 6, 36, 1.15, 0.8, 11, 800, 'The jaw of a shellback with the teeth left in. Mawkin work.', { bleed: 1.1, knock: 0.2, vsRobot: 1.1 }, { length: 0.8, blade: 0xd8ccb0, handle: 0xc8bca0 }],
  ['censer_mace', 'Censer Mace', 'blunt', 'blunt', 0, 42, 1.2, 0.8, 11, 1500, 'A flanged mace with a censer cage in the head. Covenant Inquisitors carry it into the houses of machines.', { vsRobot: 1.4, knock: 0.2, pierce: 0.15 }, { length: 0.85, blade: 0xc8b890, variant: 1 }],
  ['arena_maul', 'Arena Maul', 'blunt', 'blunt', 0, 54, 1.3, 0.6, 18, 2000, 'A stone-headed maul from the great arena at Hornspire. The Karuk use it to settle questions of honour.', { vsRobot: 1.3, knock: 0.35, twoHanded: true }, { length: 1.15, blade: 0x8a5a44, wide: 1.4 }],
  ['starfall_hammer', 'Starfall Hammer', 'blunt', 'blunt', 0, 64, 1.35, 0.62, 19, 5600, 'A relic hammer with a head of black Maker metal. It weighs less than it should, and hits harder.', { vsRobot: 1.6, knock: 0.4, twoHanded: true, pierce: 0.35 }, { length: 1.2, blade: 0x2e3238, wide: 1.4 }],
  // polearms
  ['spear', 'Spear', 'polearm', 'polearms', 26, 6, 2.2, 0.9, 6, 500, 'A pointed stick with ambitions.', { vsAnimal: 1.3, indoor: 0.3, twoHanded: true }, { length: 1.8, blade: 0xb0aca4 }],
  ['glaive', 'Glaive', 'polearm', 'polearms', 33, 10, 2.3, 0.85, 8.5, 1300, 'A long blade on a long pole.', { vsAnimal: 1.3, indoor: 0.3, twoHanded: true }, { length: 1.9, blade: 0xc0bcb4, wide: 1.4 }],
  ['longreach', 'Longreach', 'polearm', 'polearms', 36, 12, 2.4, 0.86, 9, 2400, 'A curved blade on a pole, a guardian\'s weapon.', { vsAnimal: 1.35, indoor: 0.3, twoHanded: true, def: 2 }, { length: 2.0, blade: 0xd0ccc4 }],
  ['warden_pike', 'Warden Pike', 'polearm', 'polearms', 40, 14, 2.5, 0.84, 10, 4600, 'A relic pike carried by the Maker guardians.', { vsAnimal: 1.35, vsRobot: 1.1, indoor: 0.3, twoHanded: true }, { length: 2.1, blade: 0xa8c8d0 }],
  ['pipe_spear', 'Pipe Spear', 'polearm', 'polearms', 22, 6, 2.1, 0.92, 5, 250, 'A knife lashed to a length of pipe. Starvelings make them by the dozen.', { vsAnimal: 1.25, indoor: 0.3, twoHanded: true }, { length: 1.7, blade: 0x8a8478, handle: 0x5a5a5a }],
  ['stinger_spear', 'Stinger Spear', 'polearm', 'polearms', 30, 6, 2.3, 0.92, 6.5, 1100, 'A Thrum spear tipped with the barbed sting of a soldier caste. It keeps the skitters off the hives.', { vsAnimal: 1.35, bleed: 1.2, pierce: 0.1, indoor: 0.3, twoHanded: true }, { length: 1.9, blade: 0x8a7a3a, handle: 0x6a5a30 }],
  ['sunburst_glaive', 'Sunburst Glaive', 'polearm', 'polearms', 35, 12, 2.35, 0.84, 9.5, 2000, 'A Covenant glaive with a gilt sunburst below the blade. Carried in procession at Cinderhold, and on crusade.', { vsAnimal: 1.3, indoor: 0.3, twoHanded: true, def: 2 }, { length: 2.0, blade: 0xd8c8a0 }],
  // small arms
  ['knife', 'Knife', 'dagger', 'katanas', 16, 2, 0.8, 1.45, 1, 120, 'A knife. Better than nothing, just.', { bleed: 1.3 }, { length: 0.25, blade: 0xa8a8a8 }],
  ['mining_pick', 'Mining Pick', 'pick', 'blunt', 10, 26, 1.1, 0.75, 9, 250, 'For breaking rock. Also skulls, in a pinch.', { pierce: 0.2 }, { length: 0.6, blade: 0x6a6a6a }],
  ['shiv', 'Shiv', 'dagger', 'katanas', 13, 1, 0.75, 1.5, 0.6, 40, 'A sharpened strip of scrap with a rag wound round one end.', { bleed: 1.4 }, { length: 0.2, blade: 0x8a8478, handle: 0x7a6a52 }],
  ['rib_knife', 'Rib Knife', 'dagger', 'katanas', 17, 3, 0.85, 1.42, 1.2, 220, 'A long knife ground from a rib. It knows the way between ribs.', { bleed: 1.45 }, { length: 0.3, blade: 0xd8ccb0, handle: 0x5a4a3a }],
];
for (const [id, name, kind, skill, cut, blunt, reach, speed, weight, value, desc, extra, vis] of W) {
  const heavy = kind === 'heavy' || kind === 'blunt' || kind === 'polearm';
  def({
    id, name, cat: 'weapon', w: 1, h: Math.min(6, Math.max(2, Math.round(reach * 3))), weight, value, stack: 1, desc, graded: true,
    weapon: { kind, skill, cut, blunt, reach, speed, weight, bleed: 1, pierce: 0, vsAnimal: 1, vsRobot: 1, vsHuman: 1, def: 0, twoHanded: false, ...extra },
    wvis: { kind, length: 0.8, blade: 0xb0b0b0, handle: heavy ? 0x4a3a2a : 0x2a2420, ...vis },
    icon: 'weapon',
  });
}

// ---------------------------------------------------------------- crossbows and bolts
const X: [string, string, number, number, number, number, number, number, number, string][] = [
  ['hand_xbow', 'Hand Crossbow', 18, 4, 50, 2.2, 0.8, 1200, 3, 'A light crossbow that fires quickly and hits softly.'],
  ['bolt_thrower', 'Bolt Thrower', 28, 8, 75, 3.2, 0.85, 2800, 6, 'The workhorse crossbow of caravan guards.'],
  ['siege_xbow', 'Siege Crossbow', 44, 14, 95, 5.5, 0.9, 5200, 11, 'A heavy crossbow that punches through plate. Slow to wind.'],
  ['hunter_bow', "Hunter's Crossbow", 24, 5, 85, 2.8, 0.95, 3400, 4, 'Long, accurate and quiet.'],
  ['scrap_xbow', 'Scrap Crossbow', 14, 3, 45, 2.6, 0.72, 500, 3.5, 'Leaf springs bolted to a plank. It shoots, mostly where you point it.'],
  ['watch_xbow', 'Watch Crossbow', 22, 6, 65, 2.8, 0.84, 1900, 4.5, 'A sturdy crossbow made for the Crossroad Watch. Plain, true enough, and easy to mend.'],
];
for (const [id, name, cut, blunt, range, reload, acc, value, weight, desc] of X) {
  def({
    id, name, cat: 'ranged', w: 3, h: 3, weight, value, stack: 1, desc, graded: true,
    ranged: { skill: 'crossbows', cut, blunt, range, reload, accuracy: acc, ammo: 'bolts' },
    wvis: { kind: 'crossbow', length: 0.6, blade: 0x5a4a3a, handle: 0x6a5238 },
    icon: 'crossbow',
  });
}
def({ id: 'bolts', name: 'Crossbow Bolts', cat: 'ammo', w: 1, h: 2, weight: 0.05, value: 4, stack: 60, desc: 'Iron-tipped bolts.', icon: 'bolts' });

// ---------------------------------------------------------------- body armour and clothing
type ADef = [id: string, name: string, cat: ItemCat, value: number, weight: number, desc: string, a: Partial<ArmourStats>, v: Vis, w?: number, h?: number];
const C = (cover: ArmourStats['cover']) => cover;
const TORSO = C({ chest: 1, stomach: 1, larm: 0.3, rarm: 0.3 });
const TORSO_L = C({ chest: 1, stomach: 1, larm: 0.9, rarm: 0.9 });
const TORSO_LEG = C({ chest: 1, stomach: 1, larm: 0.6, rarm: 0.6, lleg: 0.5, rleg: 0.5 });
const LEGS = C({ lleg: 1, rleg: 1, stomach: 0.2 });
const HEAD = C({ head: 1 });
const HEAD_P = C({ head: 0.6 });
const FEET = C({ lleg: 0.25, rleg: 0.25 });
const shirt = (style: TorsoStyle, color: number, sleeves: 0 | 1 | 2, color2?: number, long?: boolean): Vis => ({ torso: { style, color, sleeves, color2, long } });
const armour = (style: ArmourStyle, color: number, color2?: number, shoulders?: boolean, skirt?: boolean): Vis => ({ armour: { style, color, color2, shoulders, skirt } });
const hat = (style: HatStyle, color: number, color2?: number): Vis => ({ head: { style, color, color2 } });
const A: ADef[] = [
  // shirts (worn under armour)
  ['rag_shirt', 'Rag Shirt', 'shirt', 40, 0.5, 'Holes held together with thread.', { slot: 'shirt', cover: TORSO, cut: 0.05, blunt: 0.03, dex: 0, stealth: 0 }, shirt('rags', 0x8a7a62, 1)],
  ['drifter_shirt', 'Drifter Shirt', 'shirt', 120, 0.6, 'A plain, tough cotton shirt.', { slot: 'shirt', cover: TORSO_L, cut: 0.08, blunt: 0.05, dex: 0, stealth: 0 }, shirt('shirt', 0x9a8466, 2)],
  ['farmer_tunic', 'Farmer Tunic', 'shirt', 100, 0.6, 'A loose tunic for working the fields.', { slot: 'shirt', cover: TORSO, cut: 0.06, blunt: 0.05, dex: 0, stealth: 0, bonus: { farming: 3 } }, shirt('tunic', 0x7a8a5a, 1)],
  ['dark_shirt', 'Dark Shirt', 'shirt', 180, 0.5, 'A close-fitting black shirt. Good for nights.', { slot: 'shirt', cover: TORSO_L, cut: 0.07, blunt: 0.04, dex: 0, stealth: -0.05 }, shirt('shirt', 0x2a2826, 2)],
  ['noble_shirt', 'Noble Shirt', 'shirt', 900, 0.4, 'Fine silk with gold thread. Too nice for the waste.', { slot: 'shirt', cover: TORSO_L, cut: 0.05, blunt: 0.03, dex: 0, stealth: 0.05 }, shirt('shirt', 0x7a2e28, 2, 0xc8a040)],
  ['thrum_wrap', 'Resin Wrap', 'shirt', 200, 0.6, 'Thrum cloth, woven and waxed. Smells of honey.', { slot: 'shirt', cover: TORSO, cut: 0.1, blunt: 0.06, dex: 0, stealth: 0 }, shirt('tunic', 0xb0923a, 0)],
  ['sack_shirt', 'Sackcloth Shirt', 'shirt', 15, 0.5, 'A grain sack with holes cut for the head and arms.', { slot: 'shirt', cover: TORSO, cut: 0.03, blunt: 0.02, dex: 0, stealth: 0 }, shirt('rags', 0xa89870, 0)],
  ['concord_tunic', 'Concord Tunic', 'shirt', 260, 0.5, 'The red tunic of House service, gold at the collar. Blades wear it under their lacquer.', { slot: 'shirt', cover: TORSO_L, cut: 0.08, blunt: 0.06, dex: 0, stealth: 0.03 }, shirt('shirt', 0x6e2e24, 2, 0xc8a040)],
  ['digger_shirt', "Digger's Shirt", 'shirt', 220, 0.7, 'Heavy Delver canvas with padded elbows, made for crawling through ruins.', { slot: 'shirt', cover: TORSO_L, cut: 0.1, blunt: 0.07, dex: 0, stealth: 0, bonus: { labouring: 3 } }, shirt('shirt', 0x4a5a5a, 2)],
  // coats and robes (body slot)
  ['dust_coat', 'Dust Coat', 'body', 600, 3, 'A long coat that keeps the grit out. Slight protection from everything.', { slot: 'body', cover: TORSO_LEG, cut: 0.18, blunt: 0.1, dex: 0, stealth: 0.05, acid: 0.1 }, shirt('coat', 0x8a7454, 2, 0x5a4a38, true)],
  ['long_coat', 'Long Coat', 'body', 900, 3.5, 'A heavy leather long coat.', { slot: 'body', cover: TORSO_LEG, cut: 0.22, blunt: 0.12, dex: 0.02, stealth: 0.08, acid: 0.1 }, shirt('coat', 0x4a3a2c, 2, 0x2a2018, true)],
  ['monk_robe', 'Monk Robe', 'body', 300, 2, 'A rough brown robe of the kind wandering ascetics wear.', { slot: 'body', cover: TORSO_LEG, cut: 0.08, blunt: 0.08, dex: 0, stealth: 0, martial: -0.1, bonus: { unarmed: 3 } }, shirt('robe', 0x6a5238, 1)],
  ['ember_robe', 'Ember Robe', 'body', 700, 2.2, 'White robes of the Covenant faithful, hemmed in flame orange.', { slot: 'body', cover: TORSO_LEG, cut: 0.1, blunt: 0.08, dex: 0, stealth: 0.1 }, shirt('robe', 0xe0d8c4, 1, 0xc8642a)],
  ['noble_robe', 'Noble Robe', 'body', 2400, 2, 'The robes of a Concord lord. Worth more than most lives.', { slot: 'body', cover: TORSO_LEG, cut: 0.1, blunt: 0.08, dex: 0, stealth: 0.1 }, shirt('robe', 0x5a2240, 2, 0xd8b040)],
  ['delver_harness', 'Delver Harness', 'body', 1300, 4, 'Leather straps, pockets and plates. Made for crawling in ruins.', { slot: 'body', cover: TORSO_L, cut: 0.26, blunt: 0.14, dex: 0, stealth: 0.02, acid: 0.2, bonus: { lockpicking: 3 } }, armour('leather', 0x5a4a38, 0x3a3228)],
  ['patch_coat', 'Patched Coat', 'body', 200, 2.5, 'More patches than coat. It still keeps off the worst of the dust.', { slot: 'body', cover: TORSO_LEG, cut: 0.12, blunt: 0.07, dex: 0, stealth: 0.03, acid: 0.05 }, shirt('coat', 0x7a6a50, 1, 0x5a4e3e, true)],
  ['inquisitor_coat', 'Inquisitor Coat', 'body', 1700, 4.5, 'A long white coat lined with mail, a flame stitched on the back. The Covenant sends it to ask questions.', { slot: 'body', cover: TORSO_LEG, cut: 0.3, blunt: 0.16, dex: 0.02, stealth: 0.1, acid: 0.1 }, shirt('coat', 0xd8d0bc, 2, 0xa84a22, true)],
  // armour
  ['leather_jerkin', 'Leather Jerkin', 'body', 700, 5, 'Hardened leather over the chest and belly.', { slot: 'body', cover: TORSO, cut: 0.3, blunt: 0.14, dex: 0.02, stealth: 0.05 }, armour('leather', 0x7a5a3e, 0x4a3626)],
  ['padded_vest', 'Padded Vest', 'body', 600, 4, 'Quilted cloth layers. Soaks up blunt blows.', { slot: 'body', cover: TORSO, cut: 0.16, blunt: 0.3, dex: 0, stealth: 0.03 }, armour('padded', 0x9a8a6a, 0x6a5e48)],
  ['scrap_plate', 'Scrap Plate', 'body', 900, 11, 'Metal junk hammered flat and strapped on. Heavy but it works.', { slot: 'body', cover: TORSO, cut: 0.4, blunt: 0.26, dex: 0.08, stealth: 0.2 }, armour('scrap', 0x6a5e52, 0x4a4038, true)],
  ['bone_vest', 'Bone Vest', 'body', 650, 6, 'Ribs of a beast, lashed over hide. Mawkin work.', { slot: 'body', cover: TORSO, cut: 0.34, blunt: 0.18, dex: 0.03, stealth: 0.08 }, armour('bone', 0x6a5a48, 0xd8ccb0)],
  ['chain_shirt', 'Chainmail Shirt', 'body', 2200, 12, 'Rings of iron over padding. Stops cuts cold, lets blunt force through.', { slot: 'body', cover: TORSO_LEG, cut: 0.55, blunt: 0.14, dex: 0.08, stealth: 0.25, martial: 0.3 }, armour('chain', 0x8a8a8c, 0x6a6a6e)],
  ['blade_cuirass', 'Blade Cuirass', 'body', 3600, 10, 'Lacquered lamellar of the Concord Blades.', { slot: 'body', cover: TORSO_L, cut: 0.5, blunt: 0.32, dex: 0.06, stealth: 0.25, martial: 0.3 }, armour('samurai', 0x4a1e1a, 0x2a2826, true, true)],
  ['ember_plate', 'Ember Plate', 'body', 4200, 15, 'Heavy white plate of the Covenant Wardens, a flame on the breast.', { slot: 'body', cover: TORSO_L, cut: 0.6, blunt: 0.4, dex: 0.12, stealth: 0.4, martial: 0.4 }, armour('ember_plate', 0xd8d4c8, 0xa89c80, true)],
  ['plate_harness', 'Plate Harness', 'body', 5200, 17, 'A full harness of forged plate. You will not be quick, but you will be alive.', { slot: 'body', cover: TORSO_L, cut: 0.66, blunt: 0.44, dex: 0.15, stealth: 0.5, martial: 0.45, athletics: 0.1 }, armour('plate', 0x7a7a7e, 0x5a5a5e, true)],
  ['hive_carapace', 'Hive Carapace', 'body', 2400, 7, 'Shed soldier-chitin shaped into armour. Light and very strong.', { slot: 'body', cover: TORSO, cut: 0.48, blunt: 0.34, dex: 0.03, stealth: 0.12 }, armour('hive', 0x7a6a30, 0x5a4a24)],
  ['hollow_shell', 'Hollow Shell', 'body', 6800, 12, 'Plating from a Warden construct, refitted for a living wearer.', { slot: 'body', cover: TORSO_L, cut: 0.6, blunt: 0.5, dex: 0.08, stealth: 0.35, acid: 0.4 }, armour('robo', 0x5a6670, 0x3a4650, true)],
  ['studded_jerkin', 'Studded Jerkin', 'body', 850, 7, 'Hardened leather studded with nails and scrap. Reavers like the look of it.', { slot: 'body', cover: TORSO, cut: 0.36, blunt: 0.18, dex: 0.04, stealth: 0.1 }, armour('leather', 0x5a3e2e, 0x8a8a8a, true)],
  ['hunter_gambeson', "Hunter's Gambeson", 'body', 950, 5, 'Thick quilting in Chainhouse brown. It soaks up the blows of people who do not want to be caught.', { slot: 'body', cover: TORSO, cut: 0.2, blunt: 0.34, dex: 0.01, stealth: 0.05 }, armour('padded', 0x4e3624, 0x2e2620)],
  ['chitin_scale', 'Chitin Scale', 'body', 1400, 5, 'Plates of worker-chitin sewn over hide. Lighter than a soldier\'s carapace, and nearly as tough.', { slot: 'body', cover: TORSO, cut: 0.4, blunt: 0.26, dex: 0.02, stealth: 0.08 }, armour('hive', 0x8a7a3a, 0x6a5a2a)],
  // pants
  ['rag_pants', 'Rag Pants', 'legs', 30, 0.5, 'Barely trousers.', { slot: 'legs', cover: LEGS, cut: 0.04, blunt: 0.02, dex: 0, stealth: 0 }, { legs: { color: 0x7a6a52 } }],
  ['cargo_pants', 'Cargo Trousers', 'legs', 140, 0.8, 'Many pockets. None of them full.', { slot: 'legs', cover: LEGS, cut: 0.08, blunt: 0.05, dex: 0, stealth: 0 }, { legs: { color: 0x5e5646 } }],
  ['dark_pants', 'Dark Trousers', 'legs', 160, 0.7, 'Black cloth, soft soled.', { slot: 'legs', cover: LEGS, cut: 0.06, blunt: 0.04, dex: 0, stealth: -0.05 }, { legs: { color: 0x2a2826 } }],
  ['leather_leggings', 'Leather Leggings', 'legs', 500, 3, 'Hardened leather over the thighs and shins.', { slot: 'legs', cover: LEGS, cut: 0.26, blunt: 0.12, dex: 0, stealth: 0.03, athletics: 0.02 }, { legs: { color: 0x6a4e36, armour: true, color2: 0x4a3626 } }],
  ['chain_leggings', 'Chain Leggings', 'legs', 1600, 8, 'Mail for the legs.', { slot: 'legs', cover: LEGS, cut: 0.5, blunt: 0.12, dex: 0, stealth: 0.2, athletics: 0.06 }, { legs: { color: 0x7a7a7e, armour: true, color2: 0x6a6a6e } }],
  ['blade_greaves', 'Blade Greaves', 'legs', 2200, 6, 'Lamellar skirt and greaves of the Concord Blades.', { slot: 'legs', cover: LEGS, cut: 0.44, blunt: 0.28, dex: 0, stealth: 0.15, athletics: 0.05 }, { legs: { color: 0x2a2826, armour: true, color2: 0x4a1e1a, skirt: true } }],
  ['plate_greaves', 'Plate Greaves', 'legs', 3200, 10, 'Forged plate for the legs.', { slot: 'legs', cover: LEGS, cut: 0.6, blunt: 0.4, dex: 0, stealth: 0.3, athletics: 0.1 }, { legs: { color: 0x5a5a5e, armour: true, color2: 0x7a7a7e } }],
  ['loincloth', 'Loincloth', 'legs', 10, 0.2, 'Modesty, of a kind.', { slot: 'legs', cover: C({ stomach: 0.2 }), cut: 0.01, blunt: 0, dex: 0, stealth: 0 }, { legs: { color: 0x8a7050, skirt: true } }],
  ['hide_trousers', 'Hide Trousers', 'legs', 220, 1.5, 'Rough rawhide laced with sinew. Highland herders live in them.', { slot: 'legs', cover: LEGS, cut: 0.14, blunt: 0.08, dex: 0, stealth: 0.02 }, { legs: { color: 0x6a4a36 } }],
  ['scrap_greaves', 'Scrap Greaves', 'legs', 650, 7, 'Scrap iron strapped over the thighs and shins. Loud and heavy, but it turns a blade.', { slot: 'legs', cover: LEGS, cut: 0.36, blunt: 0.2, dex: 0, stealth: 0.15, athletics: 0.06 }, { legs: { color: 0x5e5446, armour: true, color2: 0x6a5e52 } }],
  ['chitin_greaves', 'Chitin Greaves', 'legs', 1300, 4, 'Overlapping plates of shed chitin, laced to thigh and shin. Thrum soldiers wear them.', { slot: 'legs', cover: LEGS, cut: 0.36, blunt: 0.24, dex: 0, stealth: 0.08, athletics: 0.03 }, { legs: { color: 0x7a6a30, armour: true, color2: 0x5a4a24 } }],
  // boots
  ['foot_wraps', 'Foot Wraps', 'feet', 20, 0.2, 'Strips of cloth.', { slot: 'feet', cover: FEET, cut: 0.02, blunt: 0.02, dex: 0, stealth: -0.02 }, { feet: { color: 0x8a7a60, wraps: true } }],
  ['sandals', 'Sandals', 'feet', 50, 0.4, 'Good for sand, bad for fighting.', { slot: 'feet', cover: FEET, cut: 0.02, blunt: 0.02, dex: 0, stealth: -0.02 }, { feet: { color: 0x6a5038, wraps: true } }],
  ['leather_boots', 'Leather Boots', 'feet', 250, 1.5, 'Sturdy boots.', { slot: 'feet', cover: FEET, cut: 0.15, blunt: 0.1, dex: 0, stealth: 0.03 }, { feet: { color: 0x4a3626 } }],
  ['swamp_boots', 'Swamp Boots', 'feet', 300, 2, 'High waxed boots.', { slot: 'feet', cover: FEET, cut: 0.12, blunt: 0.08, dex: 0, stealth: 0.03, bonus: { swimming: 3 } }, { feet: { color: 0x3a3a2a } }],
  ['iron_boots', 'Iron Boots', 'feet', 900, 4, 'Iron-shod boots. Loud.', { slot: 'feet', cover: FEET, cut: 0.35, blunt: 0.2, dex: 0, stealth: 0.1, athletics: 0.05 }, { feet: { color: 0x5a5a5e, armour: true } }],
  ['war_boots', 'Karuk War Boots', 'feet', 520, 2.5, 'Thick-soled Karuk boots, shod with iron at toe and heel.', { slot: 'feet', cover: FEET, cut: 0.24, blunt: 0.16, dex: 0, stealth: 0.05, athletics: 0.02 }, { feet: { color: 0x5a3e30 } }],
  ['soft_boots', 'Soft Boots', 'feet', 420, 0.8, 'Felt-soled boots that make no sound on boards. Mudwater thieves swear by them.', { slot: 'feet', cover: FEET, cut: 0.08, blunt: 0.06, dex: 0, stealth: -0.08 }, { feet: { color: 0x2e2622 } }],
  // hats and helmets
  ['straw_hat', 'Straw Hat', 'head', 60, 0.3, 'Keeps the sun off. Keeps the acid off, a little.', { slot: 'head', cover: HEAD_P, cut: 0.03, blunt: 0.02, dex: 0, stealth: 0, acid: 0.3 }, hat('straw', 0xd8c080)],
  ['kasa', 'Kasa Hat', 'head', 150, 0.4, 'A wide conical hat of lacquered reed.', { slot: 'head', cover: HEAD_P, cut: 0.05, blunt: 0.03, dex: 0, stealth: 0, acid: 0.35 }, hat('kasa', 0xb89a60, 0x6a5238)],
  ['hood', 'Hood', 'head', 90, 0.3, 'A cloth hood.', { slot: 'head', cover: HEAD, cut: 0.05, blunt: 0.03, dex: 0, stealth: -0.05, acid: 0.2 }, hat('hood', 0x5a5040)],
  ['white_hood', 'White Hood', 'head', 200, 0.3, 'The hood of a Covenant penitent.', { slot: 'head', cover: HEAD, cut: 0.05, blunt: 0.03, dex: 0, stealth: 0.05, acid: 0.2 }, hat('hood_white', 0xe0d8c4)],
  ['bandana', 'Bandana', 'head', 40, 0.1, 'A strip of dyed cloth.', { slot: 'head', cover: HEAD_P, cut: 0.02, blunt: 0.01, dex: 0, stealth: 0 }, hat('bandana', 0x8a3a2a)],
  ['skullcap', 'Leather Cap', 'head', 180, 0.6, 'A snug leather cap.', { slot: 'head', cover: HEAD, cut: 0.15, blunt: 0.08, dex: 0, stealth: 0 }, hat('skullcap', 0x5a4030)],
  ['goggles', 'Dust Goggles', 'head', 350, 0.4, 'Brass-rimmed goggles. Delvers swear by them.', { slot: 'head', cover: HEAD_P, cut: 0.05, blunt: 0.03, dex: 0, stealth: 0, acid: 0.2, bonus: { perception: 3 } }, hat('goggles', 0x8a7040)],
  ['turban', 'Turban', 'head', 160, 0.4, 'Many turns of cloth.', { slot: 'head', cover: HEAD, cut: 0.08, blunt: 0.06, dex: 0, stealth: 0, acid: 0.2 }, hat('turban', 0xd8ccb0, 0xa87840)],
  ['bucket_helm', 'Bucket Helm', 'head', 900, 2.5, 'An iron pot for your head. Very effective, very ugly.', { slot: 'head', cover: HEAD, cut: 0.5, blunt: 0.35, dex: 0, stealth: 0.1, bonus: { perception: -3 } }, hat('bucket', 0x6a6a6e)],
  ['blade_helm', 'Blade Helm', 'head', 1400, 2, 'The flared helmet of a Concord Blade.', { slot: 'head', cover: HEAD, cut: 0.45, blunt: 0.32, dex: 0, stealth: 0.05 }, hat('kabuto', 0x2a2826, 0x4a1e1a)],
  ['ember_helm', 'Ember Helm', 'head', 1600, 2.4, 'A tall white Covenant helm with a flame crest.', { slot: 'head', cover: HEAD, cut: 0.5, blunt: 0.36, dex: 0, stealth: 0.1 }, hat('helm_ember', 0xd8d4c8)],
  ['horncap', 'Horn Cap', 'head', 500, 1, 'A Karuk cap with a single horn.', { slot: 'head', cover: HEAD, cut: 0.2, blunt: 0.12, dex: 0, stealth: 0 }, hat('horncap', 0x6a4a36)],
  ['mask', 'Iron Mask', 'head', 1100, 1.5, 'A blank iron face. Nobody will know you.', { slot: 'head', cover: HEAD_P, cut: 0.3, blunt: 0.2, dex: 0, stealth: 0 }, hat('mask', 0x7a7a74)],
  ['gasmask', 'Gas Mask', 'head', 1800, 1.2, 'A Maker breathing mask. Filters gas and spores.', { slot: 'head', cover: HEAD_P, cut: 0.1, blunt: 0.05, dex: 0, stealth: 0, acid: 0.9 }, hat('gasmask', 0x3a3a38)],
  ['visor_helm', 'Visor Helm', 'head', 3800, 2, 'A relic helm with a dark visor.', { slot: 'head', cover: HEAD, cut: 0.55, blunt: 0.45, dex: 0, stealth: 0.1, acid: 0.6 }, hat('visor', 0x5a6670)],
  ['waxed_hood', 'Waxed Hood', 'head', 380, 0.4, 'A heavy hood of Glassfall canvas, waxed until the green rain runs off it.', { slot: 'head', cover: HEAD, cut: 0.06, blunt: 0.04, dex: 0, stealth: -0.03, acid: 0.45 }, hat('hood', 0x4a5a5a)],
  ['iron_kasa', 'Iron Kasa', 'head', 480, 1, 'A wide lacquered hat on an iron frame. Concord Blades wear it on the road.', { slot: 'head', cover: HEAD_P, cut: 0.2, blunt: 0.12, dex: 0, stealth: 0, acid: 0.35 }, hat('kasa', 0x2a2826, 0x4a1e1a)],
  ['bone_mask', 'Bone Mask', 'head', 450, 0.8, 'A face carved from a skull. The Mawkin wear the faces of what they eat.', { slot: 'head', cover: HEAD_P, cut: 0.22, blunt: 0.14, dex: 0, stealth: 0 }, hat('mask', 0xd8ccb0)],
  ['horn_helm', 'Horn Guard Helm', 'head', 1200, 2, 'An iron war-cap of the Horn Guard with a single forward horn, worn over the wearer\'s own.', { slot: 'head', cover: HEAD, cut: 0.4, blunt: 0.3, dex: 0, stealth: 0.05 }, hat('horncap', 0x6a6260)],
];
for (const [id, name, cat, value, weight, desc, a, v, w, h] of A) {
  const size = cat === 'head' || cat === 'feet' ? [2, 2] : cat === 'legs' ? [2, 3] : [3, 3];
  def({
    id, name, cat, w: w ?? size[0], h: h ?? size[1], weight, value, stack: 1, desc, graded: cat !== 'shirt' && value > 150,
    armour: { slot: cat as EquipSlot, cover: {}, cut: 0, blunt: 0, dex: 0, stealth: 0, ...a } as ArmourStats,
    vis: v, icon: cat,
  });
}

// ---------------------------------------------------------------- backpacks
const P: [string, string, BackStyle, number, number, number, number, number, number, string][] = [
  ['small_pack', 'Small Pack', 'pack', 6, 5, 0.7, 0.05, 300, 0x6a5a44, 'A canvas pack.'],
  ['travel_pack', 'Travel Pack', 'bedroll', 7, 7, 0.6, 0.1, 700, 0x7a6a4a, 'A frame pack with a bedroll.'],
  ['large_pack', 'Large Pack', 'large_pack', 8, 9, 0.5, 0.2, 1500, 0x5a4e3a, 'An enormous pack for hauling. You will not fight well in it.'],
  ['thief_pack', 'Thief Pack', 'thief', 5, 5, 0.6, 0, 1200, 0x2a2826, 'A slim dark pack that does not rattle.'],
  ['medic_pack', 'Medic Pack', 'medic', 6, 6, 0.6, 0.05, 1000, 0x8a8070, 'A pack with a red cross. Improves field medicine.'],
  ['hive_pack', 'Hive Pack', 'hive_pack', 7, 8, 0.4, 0.12, 1600, 0xa08a3a, 'A Thrum carrying sac. Things weigh less in it.'],
  ['basket', 'Carry Basket', 'basket', 6, 6, 0.8, 0.1, 150, 0x9a8456, 'A woven basket.'],
  ['trader_chest', 'Trader Chest', 'chest', 10, 10, 0.4, 0.35, 3200, 0x6a4a2e, 'A box on a harness. Enormous. Ridiculous. Profitable.'],
  ['delver_pack', 'Delver Pack', 'large_pack', 8, 8, 0.55, 0.12, 1300, 0x4a5a5a, 'A padded Delver frame pack with a lamp hook and a tube for maps.'],
  ['smuggler_pack', 'Smuggler Pack', 'thief', 6, 5, 0.55, 0, 1700, 0x3a2622, 'A flat dark pack that sits close to the back. Scorched Hand runners carry leaf past the Covenant in them.'],
];
for (const [id, name, style, w, h, lighten, combat, value, color, desc] of P) {
  def({ id, name, cat: 'back', w: 3, h: 3, weight: 2, value, stack: 1, desc, pack: { w, h, lighten, combat }, vis: { back: { style, color } }, icon: 'back', ...(id === 'medic_pack' ? { tags: ['medic'] } : {}) });
}

// ---------------------------------------------------------------- food, drink and drugs
const F: [string, string, number, number, number, number, string, string?][] = [
  ['dried_meat', 'Dried Meat', 45, 0.4, 60, 20, 'Salted and dried in the sun.'],
  ['raw_meat', 'Raw Meat', 30, 0.6, 30, 10, 'Fresh meat. Cook it, or eat it and regret it.'],
  ['dustbread', 'Dustbread', 40, 0.4, 50, 20, 'Coarse bread with a little sand in every bite.'],
  ['hardtack', 'Hardtack', 50, 0.3, 45, 30, 'A biscuit that will outlive you.'],
  ['porridge', 'Riceweed Porridge', 55, 0.6, 70, 10, 'A thick, bland bowl. Fills the belly.'],
  ['stew', 'Wasteland Stew', 80, 0.8, 120, 10, 'Meat and whatever grew near the pot.'],
  ['honey_resin', 'Honey Resin', 60, 0.3, 110, 20, 'Thrum food: sweet, sticky and strangely filling.'],
  ['cactus_pulp', 'Cactus Pulp', 25, 0.4, 25, 20, 'Wet and bitter.'],
  ['salted_fish', 'Salted Fish', 45, 0.4, 55, 20, 'From the Grey Shore.'],
  ['greenfruit', 'Greenfruit', 30, 0.3, 40, 20, 'A sour green fruit from the Vale.'],
  ['travel_ration', 'Travel Ration', 70, 0.4, 140, 20, 'A packed ration: dried meat, bread and fruit.'],
  ['foodcube', 'Maker Foodcube', 150, 0.2, 400, 10, 'An Old Maker ration still sealed after a thousand years. Tastes of nothing. Keeps you alive for days.'],
  ['pepper_meat', 'Pepper Meat', 55, 0.4, 75, 20, 'Goat dried under the Covenant sun and rubbed with Emberlands pepper. It makes the eyes water.'],
  ['fish_chowder', 'Mire Chowder', 70, 0.8, 90, 10, 'Mire fish and riceweed boiled in a pot that has never been washed. The one dish of Mudwater.'],
  ['waxbread', 'Waxbread', 55, 0.35, 85, 20, 'Hive bread baked with resin in the dough. It keeps for a season.'],
  ['blood_sausage', 'Blood Sausage', 60, 0.5, 75, 20, 'Goat blood and fat packed in gut. The Karuk eat it before a fight, and after.'],
  ['vale_cheese', 'Vale Cheese', 65, 0.4, 100, 20, 'A hard yellow cheese from the longhorn herds of the Vale. Concord lords take it with dustwine.'],
];
for (const [id, name, food, weight, value, stack, desc] of F) def({ id, name, cat: 'food', w: 1, h: 1, weight, value, stack, desc, food, icon: 'food' });
def({ id: 'grog', name: 'Grog', cat: 'drink', w: 1, h: 2, weight: 0.8, value: 60, stack: 10, desc: 'Fermented riceweed. Burns going down.', drink: { mood: 1 }, food: 5, icon: 'bottle' });
def({ id: 'cactus_rum', name: 'Cactus Rum', cat: 'drink', w: 1, h: 2, weight: 0.8, value: 140, stack: 10, desc: 'Sweet, strong, and blue.', drink: { mood: 2 }, food: 5, icon: 'bottle' });
def({ id: 'dustwine', name: 'Dustwine', cat: 'drink', w: 1, h: 2, weight: 0.8, value: 260, stack: 10, desc: 'A Vale wine the colour of sunset.', drink: { mood: 2 }, food: 8, icon: 'bottle' });
def({ id: 'red_beer', name: 'Red Beer', cat: 'drink', w: 1, h: 2, weight: 0.8, value: 80, stack: 10, desc: 'Thick, bitter and red as the mesas. Hornspire brews it in stone vats.', drink: { mood: 1 }, food: 8, icon: 'bottle' });
def({ id: 'hive_mead', name: 'Hive Mead', cat: 'drink', w: 1, h: 2, weight: 0.8, value: 180, stack: 10, desc: 'Resin wine from the Thrumwood hives. The Thrum do not drink it. They sell it.', drink: { mood: 2 }, food: 6, icon: 'bottle' });
def({ id: 'dreamleaf', name: 'Dreamleaf', cat: 'drug', w: 1, h: 1, weight: 0.2, value: 180, stack: 30, desc: 'Scorched Hand leaf. Smoke it to forget. The Covenant burns those who carry it.', illegal: ['ember'], icon: 'leaf' });

// ---------------------------------------------------------------- medicine
def({ id: 'bandages', name: 'Bandages', cat: 'medical', w: 1, h: 1, weight: 0.3, value: 60, stack: 20, desc: 'Rolled cloth strips. Stops bleeding; little else.', med: { points: 40, quality: 0.5 }, icon: 'med' });
def({ id: 'first_aid', name: 'First Aid Kit', cat: 'medical', w: 2, h: 1, weight: 0.8, value: 250, stack: 10, desc: 'Bandages, salves and needles. Treats wounds well.', med: { points: 110, quality: 1 }, icon: 'med' });
def({ id: 'surgical_kit', name: 'Surgical Kit', cat: 'medical', w: 2, h: 1, weight: 1, value: 900, stack: 10, desc: 'Maker-grade medical tools and sealant. The best treatment in the waste.', med: { points: 260, quality: 1.6 }, icon: 'med' });
def({ id: 'splint_kit', name: 'Splint Kit', cat: 'medical', w: 2, h: 1, weight: 1, value: 300, stack: 10, desc: 'Braces a badly broken limb so you can stand on it.', med: { points: 60, quality: 1, splint: true }, icon: 'splint' });
def({ id: 'repair_kit', name: 'Repair Kit', cat: 'medical', w: 2, h: 1, weight: 1.5, value: 600, stack: 10, desc: 'Tools and parts for mending Hollows and prosthetic limbs.', med: { points: 150, quality: 1, robot: true }, icon: 'gear' });
def({ id: 'mesa_moss', name: 'Mesa Moss', cat: 'medical', w: 1, h: 1, weight: 0.2, value: 90, stack: 20, desc: 'Red highland moss, dried and packed into wounds. Karuk healers chew it first.', med: { points: 55, quality: 0.6 }, icon: 'med' });
def({ id: 'resin_salve', name: 'Resin Salve', cat: 'medical', w: 1, h: 1, weight: 0.3, value: 150, stack: 20, desc: 'Hive resin boiled with herbs. It seals a wound and smells of honey.', med: { points: 70, quality: 0.8 }, icon: 'med' });
def({ id: 'solder_tin', name: 'Solder Tin', cat: 'medical', w: 1, h: 1, weight: 0.6, value: 240, stack: 10, desc: 'Solder, oil and spare screws in a Rustward tin. Patches a Hollow or a prosthetic, roughly.', med: { points: 70, quality: 0.6, robot: true }, icon: 'gear' });

// ---------------------------------------------------------------- resources and trade goods
const R: [string, string, ItemCat, number, number, number, string, number][] = [
  ['iron_ore', 'Iron Ore', 'resource', 12, 16, 20, 'Rust-red rock. Refine it into plates.', 0x8a4a3a],
  ['copper_ore', 'Copper Ore', 'resource', 12, 40, 20, 'Green-streaked ore. Sells well; electronics need it.', 0x4a8a7a],
  ['stone', 'Stone', 'resource', 15, 8, 20, 'Rough-cut stone blocks.', 0x9a948a],
  ['iron_plates', 'Iron Plates', 'resource', 8, 60, 20, 'Refined iron sheet.', 0x6a6a70],
  ['steel_bars', 'Steel Bars', 'resource', 6, 180, 20, 'Hard steel stock for weapons.', 0x9aa0a8],
  ['building_mats', 'Building Materials', 'resource', 10, 45, 20, 'Cut stone, mortar and timber.', 0xa89a80],
  ['fabric', 'Fabric', 'resource', 1, 50, 30, 'Woven cloth.', 0xc8b89a],
  ['leather', 'Leather', 'resource', 2, 90, 20, 'Tanned hide.', 0x7a5438],
  ['hide', 'Animal Hide', 'resource', 3, 45, 20, 'A raw hide. Tan it for leather.', 0x8a6a4a],
  ['hemp', 'Hemp', 'resource', 1, 12, 30, 'Plant fibre for weaving.', 0x8a9a5a],
  ['wheat', 'Wheat', 'resource', 1, 12, 30, 'Grain from the fields.', 0xd8c070],
  ['riceweed', 'Riceweed', 'resource', 1, 10, 30, 'A swamp grain. Porridge or grog.', 0xb8b890],
  ['cactus', 'Cactus', 'resource', 2, 10, 30, 'Cactus flesh, for pulp or rum.', 0x6a8a4a],
  ['flour', 'Flour', 'resource', 1, 25, 30, 'Ground wheat.', 0xe8e0d0],
  ['fuel', 'Fuel', 'resource', 3, 60, 20, 'Pressed oil for generators.', 0x3a3024],
  ['elec_parts', 'Electrical Components', 'resource', 1, 220, 20, 'Copper coils and Maker glass. Precious.', 0x4aa0a0],
  ['machine_parts', 'Machine Parts', 'resource', 3, 260, 20, 'Salvaged gears, springs and bearings.', 0x7a7a80],
  ['chitin', 'Chitin', 'resource', 2, 80, 20, 'Shed shell. The Thrum make armour of it.', 0x7a6a30],
  ['bone', 'Bone', 'resource', 2, 15, 20, 'Big bones.', 0xd8ccb0],
  ['resin', 'Hive Resin', 'trade', 1, 70, 20, 'Golden Thrum resin, prized in the cities.', 0xd8a03a],
  ['salt', 'Salt Block', 'trade', 3, 40, 20, 'Salt from the Barrens.', 0xeeeae0],
  ['spice', 'Spice Pouch', 'trade', 0.5, 120, 20, 'Red pepper from the Emberlands.', 0xb84a2a],
  ['silk', 'Silk Bolt', 'trade', 1, 320, 10, 'Vale silk. Nobles pay anything for it.', 0xd8b0c8],
  ['glass_beads', 'Glass Beads', 'trade', 0.5, 90, 30, 'Glassland shards polished into beads.', 0x5aa08a],
  ['ancient_coin', 'Ancient Coin', 'trade', 0.1, 400, 30, 'A coin of the Old Makers. Collectors pay well.', 0xd8b040],
  ['pyre_incense', 'Pyre Incense', 'trade', 0.3, 70, 30, 'Olive resin and temple ash pressed into sticks at Cinderhold. Every Covenant house burns it at dusk.', 0xa84a22],
  ['mire_dye', 'Mirewort Dye', 'trade', 0.5, 110, 20, 'A black-green dye boiled from mire reeds. Concord lacquerers buy all the Hand will sell.', 0x2e4a34],
  ['colossus_ivory', 'Colossus Ivory', 'trade', 2, 260, 10, 'Old bone from the Bone Sea giants, hard as stone and white as salt. City carvers want it.', 0xe8e0c8],
];
for (const [id, name, cat, weight, value, stack, desc, color] of R) def({ id, name, cat, w: weight >= 8 ? 2 : 1, h: weight >= 8 ? 2 : weight >= 2 ? 2 : 1, weight, value, stack, desc, color, icon: cat === 'resource' ? 'ore' : 'trade' });

// ---------------------------------------------------------------- relics, books and blueprints
def({ id: 'maker_tablet', name: 'Maker Tablet', cat: 'artifact', w: 2, h: 2, weight: 2, value: 1500, stack: 10, research: 1, desc: 'A slate covered in Maker diagrams. Researchers can learn from it.', icon: 'tablet' });
def({ id: 'old_codex', name: 'Old Codex', cat: 'artifact', w: 2, h: 2, weight: 3, value: 4000, stack: 10, research: 2, desc: 'A bound Maker book of engineering. Needed for advanced research.', icon: 'book' });
def({ id: 'relic_core', name: 'Relic Core', cat: 'artifact', w: 2, h: 2, weight: 4, value: 12000, stack: 5, research: 3, desc: 'A humming crystal heart from a Maker machine. The most valuable thing a Delver can find.', icon: 'core' });
def({ id: 'memory_shard', name: 'Memory Shard', cat: 'artifact', w: 1, h: 1, weight: 0.1, value: 800, stack: 20, desc: 'A sliver of glass that holds a voice. Hollows pay for these.', icon: 'shard' });
def({ id: 'shackles', name: 'Shackles', cat: 'misc', w: 2, h: 1, weight: 2, value: 120, stack: 10, desc: 'Iron shackles. For prisoners, or for selling people.', icon: 'chain' });
def({ id: 'lockpick_set', name: 'Lockpick Set', cat: 'tool', w: 1, h: 1, weight: 0.2, value: 300, stack: 1, desc: 'Improves lockpicking a little.', icon: 'key' });

// ---------------------------------------------------------------- prosthetics
const L: [string, string, 'arm' | 'leg', number, number, number, Partial<Record<Skill, number>>, string][] = [
  ['scrap_arm', 'Scrap Arm', 'arm', 0.6, 2400, 7, { dexterity: -8, strength: 2 }, 'A crude mechanical arm. Clumsy, but it grips.'],
  ['scrap_leg', 'Scrap Leg', 'leg', 0.6, 2400, 8, { athletics: -10 }, 'A peg and a spring. It will do.'],
  ['standard_arm', 'Standard Arm', 'arm', 1, 6000, 6, { dexterity: 2, strength: 6 }, 'A reliable Hollow-made arm.'],
  ['standard_leg', 'Standard Leg', 'leg', 1, 6000, 7, { athletics: 4 }, 'A reliable Hollow-made leg.'],
  ['warden_arm', 'Warden Arm', 'arm', 1.4, 16000, 6, { dexterity: 8, strength: 14 }, 'A military arm from a Warden construct. Terrifyingly strong.'],
  ['warden_leg', 'Warden Leg', 'leg', 1.4, 16000, 7, { athletics: 16, dodge: 5 }, 'A military leg, fast and sure.'],
];
for (const [id, name, part, quality, value, weight, bonus, desc] of L) def({ id, name, cat: 'robotics', w: part === 'arm' ? 2 : 2, h: part === 'arm' ? 3 : 4, weight, value, stack: 1, desc, limb: { part, quality, bonus }, icon: part });

// books of the waste (see content/lore)
for (const b of BOOKS) def({ id: 'book_' + b.key, name: b.title, cat: 'book', w: 2, h: 2, weight: 0.6, value: b.value, stack: 1, desc: `${b.kind[0].toUpperCase() + b.kind.slice(1)}${b.author && b.author !== 'Unknown' ? ' by ' + b.author : ''}. Right-click to read.`, icon: 'book', book: b.key });

export const ITEMS: ItemDef[] = I;
export const ITEM: Record<string, ItemDef> = Object.fromEntries(I.map((d) => [d.id, d]));

export function gradeName(d: ItemDef, q: number) {
  return d.graded ? `${GRADES[q].name} ${d.name}` : d.name;
}
export function itemValue(d: ItemDef, q = 2) {
  return Math.round(d.value * (d.graded ? GRADES[q].val : 1));
}

/** Equipment slot for an item, if it can be worn. */
export function slotFor(d: ItemDef): EquipSlot | null {
  switch (d.cat) {
    case 'weapon': return 'weapon';
    case 'ranged': return 'ranged';
    case 'body': return 'body';
    case 'shirt': return 'shirt';
    case 'head': return 'head';
    case 'legs': return 'legs';
    case 'feet': return 'feet';
    case 'back': return 'back';
  }
  return null;
}

export const register = def;
