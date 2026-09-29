// Primary attributes, skills, traits and perks.

export const STAT_KEYS = ['STR', 'PER', 'END', 'CHA', 'INT', 'AGI', 'LCK'] as const;
export type StatKey = (typeof STAT_KEYS)[number];
export type Stats = Record<StatKey, number>;

export const STAT_INFO: Record<StatKey, { name: string; desc: string }> = {
  STR: { name: 'Strength', desc: 'Raw physical power. Governs carry weight, melee damage and hit points, and the minimum needed to wield heavy weapons.' },
  PER: { name: 'Perception', desc: 'Senses and awareness. Affects ranged accuracy at distance, combat sequence, and noticing things others miss.' },
  END: { name: 'Endurance', desc: 'Stamina and toughness. Adds hit points and resistance to poison and radiation, and speeds natural healing.' },
  CHA: { name: 'Charisma', desc: 'Presence and charm. Improves speech and bartering, and how strangers first react to you.' },
  INT: { name: 'Intelligence', desc: 'Knowledge and reasoning. Grants skill points each level and opens up dialogue. Below 4, conversation gets... simpler.' },
  AGI: { name: 'Agility', desc: 'Coordination and speed. Determines action points, armor class and most combat skills.' },
  LCK: { name: 'Luck', desc: 'Fate. Raises critical hit chance and nudges nearly everything a little in your favour.' },
};

export function statLabel(v: number): string {
  const labels = ['--', 'V.Bad', 'Bad', 'Poor', 'Fair', 'Avrge', 'Good', 'V.Good', 'Great', 'Excel.', 'Heroic'];
  return labels[Math.max(0, Math.min(10, v))];
}

export const SKILL_KEYS = [
  'smallGuns', 'bigGuns', 'energy', 'unarmed', 'melee', 'throwing',
  'firstAid', 'doctor', 'sneak', 'lockpick', 'steal', 'traps',
  'science', 'repair', 'speech', 'barter', 'gambling', 'outdoorsman',
] as const;
export type SkillKey = (typeof SKILL_KEYS)[number];

export const SKILL_INFO: Record<SkillKey, { name: string; desc: string; base: (s: Stats) => number; active?: boolean }> = {
  smallGuns: { name: 'Small Guns', desc: 'Pistols, rifles, shotguns and submachine guns.', base: (s) => 5 + 4 * s.AGI },
  bigGuns: { name: 'Big Guns', desc: 'Flamers, miniguns, rocket tubes and other heavy weapons.', base: (s) => 2 * s.AGI },
  energy: { name: 'Energy Weapons', desc: 'Laser and plasma weapons from before the fall.', base: (s) => 2 * s.AGI },
  unarmed: { name: 'Unarmed', desc: 'Punches, kicks and knuckle weapons.', base: (s) => 30 + 2 * (s.AGI + s.STR) },
  melee: { name: 'Melee Weapons', desc: 'Knives, clubs, spears and sledges.', base: (s) => 20 + 2 * (s.AGI + s.STR) },
  throwing: { name: 'Throwing', desc: 'Grenades, throwing knives and rocks.', base: (s) => 4 * s.AGI },
  firstAid: { name: 'First Aid', desc: 'Patch minor wounds. Heals a little, a few times a day.', base: (s) => 2 * (s.PER + s.INT), active: true },
  doctor: { name: 'Doctor', desc: 'Treat serious injuries, including crippled limbs.', base: (s) => 5 + s.PER + s.INT, active: true },
  sneak: { name: 'Sneak', desc: 'Move without being noticed. Needed for stealing unseen.', base: (s) => 5 + 3 * s.AGI, active: true },
  lockpick: { name: 'Lockpick', desc: 'Open locked doors and containers without the key.', base: (s) => 10 + s.PER + s.AGI, active: true },
  steal: { name: 'Steal', desc: 'Lift items from pockets, or plant them.', base: (s) => 3 * s.AGI, active: true },
  traps: { name: 'Traps', desc: 'Find and disarm traps, and set explosives.', base: (s) => 10 + s.PER + s.AGI, active: true },
  science: { name: 'Science', desc: 'Computers, chemistry and old-world machines.', base: (s) => 4 * s.INT, active: true },
  repair: { name: 'Repair', desc: 'Fix and jury-rig mechanical and electronic devices.', base: (s) => 3 * s.INT, active: true },
  speech: { name: 'Speech', desc: 'Persuade, bluff and talk your way out of trouble.', base: (s) => 5 * s.CHA },
  barter: { name: 'Barter', desc: 'Get better prices when trading.', base: (s) => 4 * s.CHA },
  gambling: { name: 'Gambling', desc: 'Games of chance, and knowing when to fold.', base: (s) => 5 * s.LCK },
  outdoorsman: { name: 'Outdoorsman', desc: 'Survive the wastes: travel faster and avoid or seek out encounters.', base: (s) => 2 * (s.END + s.INT) },
};

export interface TraitDef {
  id: string;
  name: string;
  desc: string;
}

// Traits: optional, up to two, each with a benefit and a drawback.
export const TRAITS: TraitDef[] = [
  { id: 'heavyHands', name: 'Brick Fists', desc: 'Your blows land hard: +4 melee and unarmed damage. But your critical hits are clumsy and do less.' },
  { id: 'triggerHappy', name: 'Trigger Happy', desc: 'Ranged attacks cost 1 less AP. You never take the time to line up aimed shots.' },
  { id: 'slightFrame', name: 'Slight Frame', desc: '+1 Agility, but you carry 30% less and take extra damage from crippling hits.' },
  { id: 'deliberate', name: 'Deliberate', desc: '+5 Armor Class at the start of combat, but -5 Sequence: you always go last.' },
  { id: 'nightOwl', name: 'Night Owl', desc: '+1 Perception and +1 Intelligence between 18:00 and 06:00, -1 of each during the day.' },
  { id: 'lucky', name: 'Born Under a Bad Sign', desc: 'Criticals happen more often, for you and everyone around you. Critical failures too.' },
  { id: 'bookish', name: 'Bookish', desc: '+10% to Science, Repair, First Aid and Doctor. -10% to all combat skills.' },
  { id: 'unkempt', name: 'Roughneck', desc: '+10% to Unarmed and Melee, and people take you seriously in a fight. -1 Charisma.' },
  { id: 'chemBody', name: 'Chem Metabolism', desc: 'Drugs last twice as long, but you are twice as likely to get hooked.' },
  { id: 'kindly', name: 'Soft Touch', desc: 'Karma rises faster and people like you, but -10% to all combat skills.' },
  { id: 'jack', name: 'Jack of Nothing', desc: 'All skills +10%, but tagged skills gain nothing extra from tagging.' },
  { id: 'fastHeal', name: 'Quick Mender', desc: 'Heal twice as fast. -10 Radiation Resistance.' },
];

export interface PerkDef {
  id: string;
  name: string;
  desc: string;
  level: number; // minimum character level
  ranks: number;
  req?: Partial<Stats>;
  skillReq?: Partial<Record<SkillKey, number>>;
}

export const PERKS: PerkDef[] = [
  { id: 'toughHide', name: 'Tough Hide', desc: '+10% to all damage resistances.', level: 3, ranks: 2, req: { END: 5 } },
  { id: 'eagleEye', name: 'Hawk Sight', desc: '+2 Perception for ranged accuracy and Sequence.', level: 3, ranks: 1, req: { PER: 6 } },
  { id: 'packMule', name: 'Pack Mule', desc: '+50 carry weight.', level: 3, ranks: 1, req: { STR: 5 } },
  { id: 'swift', name: 'Fleet of Foot', desc: '+1 action point per combat turn.', level: 3, ranks: 1, req: { AGI: 5 } },
  { id: 'mender', name: 'Mender', desc: '+2 healing rate.', level: 3, ranks: 3, req: { END: 6 } },
  { id: 'scrounger', name: 'Scrounger', desc: 'Find more ammunition in containers and on bodies.', level: 3, ranks: 1, req: { LCK: 6 } },
  { id: 'smoothTalk', name: 'Silver Tongue', desc: '+15% to Speech and Barter.', level: 3, ranks: 2, req: { CHA: 5 } },
  { id: 'cartographer', name: 'Pathfinder', desc: 'World map travel is 25% faster.', level: 3, ranks: 1, req: { END: 6 } },
  { id: 'bonebreaker', name: 'Bonebreaker', desc: '+2 melee and unarmed damage.', level: 3, ranks: 3, req: { STR: 6, AGI: 6 } },
  { id: 'quickHands', name: 'Quick Hands', desc: 'Reloading and using items cost 1 AP.', level: 6, ranks: 1, req: { AGI: 6 } },
  { id: 'sharpshooter', name: 'Deadeye', desc: '+10% critical chance with ranged weapons.', level: 6, ranks: 2, req: { PER: 6, LCK: 5 } },
  { id: 'readyStance', name: 'Ready Stance', desc: '+2 Sequence per rank.', level: 3, ranks: 3, req: { PER: 5 } },
  { id: 'medic', name: 'Field Surgeon', desc: '+15% First Aid and Doctor; healing items restore more.', level: 6, ranks: 1, req: { INT: 5 } },
  { id: 'tinkerer', name: 'Tinkerer', desc: '+15% Science and Repair.', level: 6, ranks: 1, req: { INT: 6 } },
  { id: 'nimble', name: 'Nimble', desc: '+10% to Sneak, Lockpick, Steal and Traps.', level: 6, ranks: 1, req: { AGI: 6 } },
  { id: 'lifeForce', name: 'Iron Constitution', desc: '+4 hit points per level, applied retroactively.', level: 9, ranks: 1, req: { END: 4 } },
  { id: 'gunslinger', name: 'Gunslinger', desc: 'Single-shot attacks cost 1 less AP.', level: 9, ranks: 1, req: { AGI: 7 }, skillReq: { smallGuns: 80 } },
  { id: 'grimReaper', name: 'Reaper\'s Due', desc: 'Kill a foe on your turn and regain the AP you spent on the killing blow.', level: 12, ranks: 1, req: { AGI: 8, LCK: 6 } },
  { id: 'educated', name: 'Studious', desc: '+2 skill points every level.', level: 6, ranks: 2, req: { INT: 6 } },
  { id: 'lucky7', name: 'Lucky Streak', desc: '+10% to Gambling and a bit more loot in containers.', level: 3, ranks: 1, req: { LCK: 7 } },
  { id: 'wanderer', name: 'Wasteland Born', desc: '+20% Outdoorsman and fewer unwanted encounters.', level: 3, ranks: 1, req: { END: 5 } },
  { id: 'intense', name: 'Intense Training', desc: '+1 to a primary statistic of your choice.', level: 3, ranks: 10 },
];

export function perkById(id: string): PerkDef | undefined {
  return PERKS.find((p) => p.id === id);
}

export function traitById(id: string): TraitDef | undefined {
  return TRAITS.find((t) => t.id === id);
}

/** Experience needed to reach `level` (level 1 = 0). */
export function xpForLevel(level: number): number {
  return (level * (level - 1) / 2) * 1000;
}

export const KARMA_TITLES: [number, string][] = [
  [-1000, 'Scourge of the Basin'],
  [-500, 'Wasteland Predator'],
  [-100, 'Drifter With a Grudge'],
  [100, 'Wanderer'],
  [500, 'Good Samaritan'],
  [1000, 'Hope of the Basin'],
  [Infinity, 'Living Legend'],
];

export function karmaTitle(k: number): string {
  for (const [lim, t] of KARMA_TITLES) if (k < lim) return t;
  return 'Living Legend';
}
