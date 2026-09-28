// Skills rise with use. Harder opposition teaches more; high levels come slowly.
export const SKILLS = [
  'strength', 'toughness', 'dexterity', 'perception',
  'melee_atk', 'melee_def', 'dodge', 'unarmed',
  'katanas', 'sabres', 'hackers', 'heavy', 'blunt', 'polearms', 'crossbows', 'precision', 'turrets',
  'stealth', 'lockpicking', 'thievery', 'assassination',
  'athletics', 'swimming',
  'science', 'engineering', 'robotics', 'medic',
  'labouring', 'farming', 'cooking', 'weaponsmith', 'armoursmith', 'bowsmith',
] as const;
export type Skill = (typeof SKILLS)[number];
export const SK: Record<Skill, number> = Object.fromEntries(SKILLS.map((s, i) => [s, i])) as Record<Skill, number>;
export const NSK = SKILLS.length;

export const SKILL_INFO: Record<Skill, { name: string; group: string; desc: string }> = {
  strength: { name: 'Strength', group: 'Attributes', desc: 'Carrying capacity, damage with heavy weapons, swing speed of heavy blades. Trains by carrying heavy loads and swinging heavy weapons.' },
  toughness: { name: 'Toughness', group: 'Attributes', desc: 'Resists damage and lets you stay on your feet at negative health. Trains by being beaten.' },
  dexterity: { name: 'Dexterity', group: 'Attributes', desc: 'Attack speed and cutting damage. Trains with fast weapons.' },
  perception: { name: 'Perception', group: 'Attributes', desc: 'Aim with crossbows and noticing sneaking thieves. Trains by shooting.' },
  melee_atk: { name: 'Melee Attack', group: 'Combat', desc: 'Chance to land blows past a guard.' },
  melee_def: { name: 'Melee Defence', group: 'Combat', desc: 'Chance to block incoming blows.' },
  dodge: { name: 'Dodge', group: 'Combat', desc: 'Chance to step clear of a blow entirely.' },
  unarmed: { name: 'Martial Arts', group: 'Combat', desc: 'Fighting with fists and feet. Very powerful when mastered, useless before.' },
  katanas: { name: 'Katanas', group: 'Weapons', desc: 'Light, fast single-edged blades.' },
  sabres: { name: 'Sabres', group: 'Weapons', desc: 'Broad curved swords, cutting and blunt.' },
  hackers: { name: 'Hackers', group: 'Weapons', desc: 'Cleavers and chopping blades that crush armour.' },
  heavy: { name: 'Heavy Weapons', group: 'Weapons', desc: 'Huge blades that knock enemies down. Need great strength.' },
  blunt: { name: 'Blunt', group: 'Weapons', desc: 'Clubs and maces that break armoured bodies and machines.' },
  polearms: { name: 'Polearms', group: 'Weapons', desc: 'Long reach, good against animals.' },
  crossbows: { name: 'Crossbows', group: 'Ranged', desc: 'Loading and firing crossbows quickly.' },
  precision: { name: 'Precision Shooting', group: 'Ranged', desc: 'Accuracy at range.' },
  turrets: { name: 'Turrets', group: 'Ranged', desc: 'Operating harpoon turrets on walls.' },
  stealth: { name: 'Stealth', group: 'Thievery', desc: 'Moving unseen.' },
  lockpicking: { name: 'Lockpicking', group: 'Thievery', desc: 'Opening locked chests, doors, cages and shackles.' },
  thievery: { name: 'Thievery', group: 'Thievery', desc: 'Stealing from containers and pockets without being noticed.' },
  assassination: { name: 'Assassination', group: 'Thievery', desc: 'Knocking out an unaware target from behind.' },
  athletics: { name: 'Athletics', group: 'Athletic', desc: 'Running speed. Trains by running, faster when carrying weight.' },
  swimming: { name: 'Swimming', group: 'Athletic', desc: 'Speed in deep water.' },
  science: { name: 'Science', group: 'Science', desc: 'Research speed.' },
  engineering: { name: 'Engineering', group: 'Science', desc: 'Construction speed and repairs.' },
  robotics: { name: 'Robotics', group: 'Science', desc: 'Fitting and repairing prosthetic limbs; repairing Hollows.' },
  medic: { name: 'Field Medic', group: 'Science', desc: 'Treating wounds and stopping bleeding.' },
  labouring: { name: 'Labouring', group: 'Trade', desc: 'Mining and hauling.' },
  farming: { name: 'Farming', group: 'Trade', desc: 'Crop yields and harvest speed.' },
  cooking: { name: 'Cooking', group: 'Trade', desc: 'Speed and yield at stoves and brewing.' },
  weaponsmith: { name: 'Weapon Smithing', group: 'Trade', desc: 'Quality of forged weapons.' },
  armoursmith: { name: 'Armour Smithing', group: 'Trade', desc: 'Quality of crafted armour and clothing.' },
  bowsmith: { name: 'Crossbow Smithing', group: 'Trade', desc: 'Quality of crafted crossbows.' },
};

/** How fast a skill rises at a given level. */
export function rateAt(level: number) {
  const k = 1 + level / 11;
  return 0.42 / (k * k);
}
