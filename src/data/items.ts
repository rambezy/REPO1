// Item definitions. Content modules may add more with defineItems().

import type { SkillKey } from './stats';

export type DmgType = 'normal' | 'laser' | 'fire' | 'plasma' | 'explode';
export const DMG_TYPES: DmgType[] = ['normal', 'laser', 'fire', 'plasma', 'explode'];

export type AttackKind = 'single' | 'aimed' | 'burst' | 'swing' | 'thrust' | 'throw' | 'punch' | 'kick';

export interface WeaponDef {
  skill: SkillKey;
  dmg: [number, number];
  dmgType: DmgType;
  range: number; // hexes
  modes: AttackKind[]; // primary first
  ap: number; // base AP for single/swing/thrust/throw/punch
  burstAp?: number;
  burst?: number; // rounds per burst
  ammo?: string; // ammo item id
  mag?: number;
  minST: number;
  hands: 1 | 2;
  melee?: boolean;
  thrown?: boolean; // item consumed when thrown
  radius?: number; // explosion radius
  sound?: 'pistol' | 'rifle' | 'shotgun' | 'smg' | 'laser' | 'plasma' | 'flame' | 'minigun' | 'rocket' | 'swing' | 'punch' | 'throw';
  proj?: 'bullet' | 'laser' | 'plasma' | 'flame' | 'rocket' | 'thrown' | 'none';
  spread?: number; // shotgun pellets
}

export interface ArmorDef {
  ac: number;
  dt: Partial<Record<DmgType, number>>;
  dr: Partial<Record<DmgType, number>>;
  look: 'leather' | 'metal' | 'robe' | 'combat' | 'power' | 'jacket' | 'rags';
  tint?: string;
}

export interface AmmoDef {
  acMod: number;
  drMod: number;
  mult: number;
  div: number;
  pack: number; // rounds per stack when found/bought
}

export type ItemType = 'weapon' | 'armor' | 'ammo' | 'drug' | 'misc' | 'key' | 'book';

export interface ItemDef {
  id: string;
  name: string;
  type: ItemType;
  weight: number;
  value: number;
  desc: string;
  icon: string; // icon painter id
  weapon?: WeaponDef;
  armor?: ArmorDef;
  ammo?: AmmoDef;
  use?: string; // effect id in game/effects.ts, or custom handled by scripts
  quest?: boolean; // cannot be sold or dropped carelessly
}

export const ITEMS: Record<string, ItemDef> = {};

export function defineItems(list: ItemDef[]): void {
  for (const it of list) ITEMS[it.id] = it;
}

export function item(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) throw new Error('Unknown item ' + id);
  return d;
}

const W = (o: Omit<ItemDef, 'type'> & { weapon: WeaponDef }): ItemDef => ({ ...o, type: 'weapon' });
const A = (o: Omit<ItemDef, 'type'> & { armor: ArmorDef }): ItemDef => ({ ...o, type: 'armor' });

defineItems([
  // ---------------------------------------------------------------- weapons
  W({ id: 'knife', name: 'Knife', weight: 1, value: 40, icon: 'knife', desc: 'A plain utility knife, sharpened on a whetstone until it whispers.',
    weapon: { skill: 'melee', dmg: [1, 6], dmgType: 'normal', range: 1, modes: ['swing', 'thrust'], ap: 3, minST: 2, hands: 1, melee: true, sound: 'swing', proj: 'none' } }),
  W({ id: 'crowbar', name: 'Crowbar', weight: 5, value: 60, icon: 'crowbar', desc: 'Pry bar, door opener, and argument ender.',
    weapon: { skill: 'melee', dmg: [3, 10], dmgType: 'normal', range: 1, modes: ['swing'], ap: 4, minST: 5, hands: 1, melee: true, sound: 'swing', proj: 'none' } }),
  W({ id: 'spear', name: 'Spear', weight: 4, value: 80, icon: 'spear', desc: 'A long pole with a sharpened car-spring blade lashed on. Reaches two hexes.',
    weapon: { skill: 'melee', dmg: [3, 10], dmgType: 'normal', range: 2, modes: ['thrust'], ap: 4, minST: 4, hands: 2, melee: true, sound: 'swing', proj: 'none' } }),
  W({ id: 'sledge', name: 'Sledgehammer', weight: 12, value: 120, icon: 'sledge', desc: 'A demolition hammer. Slow, heavy, final.',
    weapon: { skill: 'melee', dmg: [4, 16], dmgType: 'normal', range: 1, modes: ['swing'], ap: 5, minST: 6, hands: 2, melee: true, sound: 'swing', proj: 'none' } }),
  W({ id: 'shockBaton', name: 'Shock Baton', weight: 3, value: 450, icon: 'baton', desc: 'A security baton with a crackling capacitor tip. Hits with an electric jolt.',
    weapon: { skill: 'melee', dmg: [8, 18], dmgType: 'laser', range: 1, modes: ['swing', 'thrust'], ap: 4, minST: 4, hands: 1, melee: true, sound: 'swing', proj: 'none' } }),
  W({ id: 'brassKnuckles', name: 'Knuckle Plates', weight: 1, value: 50, icon: 'knuckles', desc: 'Riveted steel plates worn over the fingers. Punches hurt more.',
    weapon: { skill: 'unarmed', dmg: [2, 6], dmgType: 'normal', range: 1, modes: ['punch'], ap: 3, minST: 1, hands: 1, melee: true, sound: 'punch', proj: 'none' } }),
  W({ id: 'powerFist', name: 'Piston Gauntlet', weight: 7, value: 1400, icon: 'gauntlet', desc: 'A pneumatic gauntlet that drives a punch with the force of a hydraulic ram.',
    weapon: { skill: 'unarmed', dmg: [12, 24], dmgType: 'normal', range: 1, modes: ['punch'], ap: 3, minST: 1, hands: 1, melee: true, sound: 'punch', proj: 'none' } }),
  W({ id: 'throwingKnife', name: 'Throwing Knife', weight: 1, value: 20, icon: 'tknife', desc: 'Balanced for throwing. Retrieve it afterwards, if you can.',
    weapon: { skill: 'throwing', dmg: [3, 8], dmgType: 'normal', range: 8, modes: ['throw'], ap: 4, minST: 3, hands: 1, thrown: true, sound: 'throw', proj: 'thrown' } }),
  W({ id: 'fragGrenade', name: 'Frag Grenade', weight: 1, value: 150, icon: 'grenade', desc: 'A pre-war fragmentation grenade. Pull the pin, then do not hold on.',
    weapon: { skill: 'throwing', dmg: [20, 35], dmgType: 'explode', range: 12, modes: ['throw'], ap: 4, minST: 3, hands: 1, thrown: true, radius: 2, sound: 'throw', proj: 'thrown' } }),
  W({ id: 'molotov', name: 'Fire Bottle', weight: 1, value: 50, icon: 'molotov', desc: 'Fuel, a rag and a bottle. Burns everything near where it lands.',
    weapon: { skill: 'throwing', dmg: [10, 25], dmgType: 'fire', range: 10, modes: ['throw'], ap: 4, minST: 3, hands: 1, thrown: true, radius: 1, sound: 'throw', proj: 'thrown' } }),

  W({ id: 'pistol9', name: '9mm Service Pistol', weight: 3, value: 250, icon: 'pistol', desc: 'A worn but reliable semi-automatic sidearm. Holds 12 rounds.',
    weapon: { skill: 'smallGuns', dmg: [5, 12], dmgType: 'normal', range: 20, modes: ['single', 'aimed'], ap: 5, ammo: 'ammo9', mag: 12, minST: 3, hands: 1, sound: 'pistol', proj: 'bullet' } }),
  W({ id: 'revolver44', name: '.44 Revolver', weight: 5, value: 700, icon: 'revolver', desc: 'A heavy six-shot revolver. Loud and hard-hitting.',
    weapon: { skill: 'smallGuns', dmg: [12, 22], dmgType: 'normal', range: 22, modes: ['single', 'aimed'], ap: 5, ammo: 'ammo44', mag: 6, minST: 5, hands: 1, sound: 'pistol', proj: 'bullet' } }),
  W({ id: 'smg9', name: '9mm Sub-Machinegun', weight: 6, value: 1000, icon: 'smg', desc: 'Compact automatic weapon. Burst fire sprays 8 rounds.',
    weapon: { skill: 'smallGuns', dmg: [5, 12], dmgType: 'normal', range: 18, modes: ['single', 'burst'], ap: 4, burstAp: 5, burst: 8, ammo: 'ammo9', mag: 30, minST: 4, hands: 2, sound: 'smg', proj: 'bullet' } }),
  W({ id: 'huntingRifle', name: 'Hunting Rifle', weight: 9, value: 900, icon: 'rifle', desc: 'A bolt-action rifle with a scratched scope. Good at long range.',
    weapon: { skill: 'smallGuns', dmg: [8, 20], dmgType: 'normal', range: 40, modes: ['single', 'aimed'], ap: 5, ammo: 'ammo223', mag: 10, minST: 5, hands: 2, sound: 'rifle', proj: 'bullet' } }),
  W({ id: 'shotgun', name: 'Double-Barrel Shotgun', weight: 8, value: 800, icon: 'shotgun', desc: 'Two barrels of close-range persuasion.',
    weapon: { skill: 'smallGuns', dmg: [12, 22], dmgType: 'normal', range: 12, modes: ['single', 'aimed'], ap: 5, ammo: 'shells', mag: 2, minST: 4, hands: 2, sound: 'shotgun', proj: 'bullet', spread: 3 } }),
  W({ id: 'assaultRifle', name: 'Assault Rifle', weight: 10, value: 1600, icon: 'arifle', desc: 'A military rifle with select fire. Burst fires 5 rounds.',
    weapon: { skill: 'smallGuns', dmg: [8, 20], dmgType: 'normal', range: 35, modes: ['single', 'burst'], ap: 5, burstAp: 6, burst: 5, ammo: 'ammo223', mag: 24, minST: 5, hands: 2, sound: 'rifle', proj: 'bullet' } }),
  W({ id: 'laserPistol', name: 'Laser Pistol', weight: 4, value: 1500, icon: 'laserpistol', desc: 'A pre-war beam sidearm. Silent but for a hum, and utterly precise.',
    weapon: { skill: 'energy', dmg: [10, 22], dmgType: 'laser', range: 30, modes: ['single', 'aimed'], ap: 5, ammo: 'cell', mag: 12, minST: 3, hands: 1, sound: 'laser', proj: 'laser' } }),
  W({ id: 'laserRifle', name: 'Laser Carbine', weight: 9, value: 3800, icon: 'laserrifle', desc: 'A military beam carbine. Burns clean holes through armor.',
    weapon: { skill: 'energy', dmg: [20, 42], dmgType: 'laser', range: 40, modes: ['single', 'aimed'], ap: 5, ammo: 'cell', mag: 20, minST: 6, hands: 2, sound: 'laser', proj: 'laser' } }),
  W({ id: 'plasmaRifle', name: 'Plasma Lance', weight: 12, value: 5500, icon: 'plasmarifle', desc: 'Throws bolts of superheated plasma. Nothing organic enjoys it.',
    weapon: { skill: 'energy', dmg: [30, 55], dmgType: 'plasma', range: 35, modes: ['single', 'aimed'], ap: 5, ammo: 'fusion', mag: 10, minST: 6, hands: 2, sound: 'plasma', proj: 'plasma' } }),
  W({ id: 'flamer', name: 'Flame Projector', weight: 20, value: 2000, icon: 'flamer', desc: 'A backpack tank and a nozzle. Hoses a cone of burning fuel.',
    weapon: { skill: 'bigGuns', dmg: [25, 50], dmgType: 'fire', range: 5, modes: ['single'], ap: 6, ammo: 'fuel', mag: 5, minST: 6, hands: 2, sound: 'flame', proj: 'flame' } }),
  W({ id: 'minigun', name: 'Rotary Cannon', weight: 28, value: 3800, icon: 'minigun', desc: 'Six spinning barrels. Burst fires 40 rounds of 5mm.',
    weapon: { skill: 'bigGuns', dmg: [7, 12], dmgType: 'normal', range: 30, modes: ['burst'], ap: 6, burstAp: 6, burst: 40, ammo: 'ammo5', mag: 120, minST: 7, hands: 2, sound: 'minigun', proj: 'bullet' } }),
  W({ id: 'rocketTube', name: 'Rocket Tube', weight: 15, value: 2500, icon: 'rocket', desc: 'A shoulder-fired rocket launcher. Blast radius 2.',
    weapon: { skill: 'bigGuns', dmg: [35, 70], dmgType: 'explode', range: 30, modes: ['single'], ap: 6, ammo: 'rocketAmmo', mag: 1, minST: 6, hands: 2, radius: 2, sound: 'rocket', proj: 'rocket' } }),

  // ------------------------------------------------------------------- ammo
  { id: 'ammo9', name: '9mm Rounds', type: 'ammo', weight: 0.02, value: 2, icon: 'ammo', desc: 'Standard pistol cartridges.', ammo: { acMod: 0, drMod: 0, mult: 1, div: 1, pack: 24 } },
  { id: 'ammo44', name: '.44 Magnum Rounds', type: 'ammo', weight: 0.04, value: 5, icon: 'ammo', desc: 'Heavy revolver cartridges.', ammo: { acMod: 0, drMod: -5, mult: 1, div: 1, pack: 12 } },
  { id: 'ammo223', name: '.223 Rounds', type: 'ammo', weight: 0.03, value: 4, icon: 'ammo', desc: 'Rifle cartridges.', ammo: { acMod: -5, drMod: -10, mult: 1, div: 1, pack: 20 } },
  { id: 'shells', name: '12ga Shells', type: 'ammo', weight: 0.05, value: 4, icon: 'shells', desc: 'Buckshot shotgun shells.', ammo: { acMod: -10, drMod: 0, mult: 1, div: 1, pack: 12 } },
  { id: 'ammo5', name: '5mm Rounds', type: 'ammo', weight: 0.01, value: 1, icon: 'ammo', desc: 'Small rounds for rotary guns.', ammo: { acMod: 0, drMod: -10, mult: 1, div: 1, pack: 60 } },
  { id: 'cell', name: 'Power Cell', type: 'ammo', weight: 0.05, value: 12, icon: 'cell', desc: 'Rechargeable energy cell for beam weapons.', ammo: { acMod: 0, drMod: 0, mult: 1, div: 1, pack: 20 } },
  { id: 'fusion', name: 'Fusion Cartridge', type: 'ammo', weight: 0.08, value: 25, icon: 'cell', desc: 'Dense power source for plasma weapons.', ammo: { acMod: 0, drMod: 0, mult: 1, div: 1, pack: 10 } },
  { id: 'fuel', name: 'Flamer Fuel', type: 'ammo', weight: 0.5, value: 25, icon: 'fuel', desc: 'Jellied fuel canister.', ammo: { acMod: 0, drMod: 0, mult: 1, div: 1, pack: 5 } },
  { id: 'rocketAmmo', name: 'Rocket', type: 'ammo', weight: 3, value: 150, icon: 'rocketammo', desc: 'A high-explosive rocket.', ammo: { acMod: 0, drMod: -10, mult: 1, div: 1, pack: 2 } },

  // ------------------------------------------------------------------ armor
  A({ id: 'shelterSuit', name: 'Shelter Jumpsuit', weight: 2, value: 10, icon: 'jumpsuit', desc: 'Your shelter-issue jumpsuit, teal with orange piping. Warm, sturdy, not armor.',
    armor: { ac: 0, dt: {}, dr: {}, look: 'jacket' } }),
  A({ id: 'leatherJacket', name: 'Leather Jacket', weight: 5, value: 250, icon: 'jacket', desc: 'A heavy leather jacket. A little protection, a lot of attitude.',
    armor: { ac: 8, dt: { normal: 0 }, dr: { normal: 20, laser: 20, fire: 10, plasma: 10, explode: 20 }, look: 'jacket', tint: '#3a2a20' } }),
  A({ id: 'leatherArmor', name: 'Hide Armor', weight: 8, value: 700, icon: 'leather', desc: 'Cured ox-hide panels stitched over padding.',
    armor: { ac: 15, dt: { normal: 2, laser: 0, fire: 0, plasma: 0, explode: 0 }, dr: { normal: 25, laser: 20, fire: 20, plasma: 10, explode: 20 }, look: 'leather', tint: '#6b4a2e' } }),
  A({ id: 'metalArmor', name: 'Plate Scrap Armor', weight: 35, value: 1100, icon: 'metal', desc: 'Hammered sheet metal over a padded frame. Heavy, but it turns bullets.',
    armor: { ac: 10, dt: { normal: 4, laser: 6, fire: 4, plasma: 4, explode: 4 }, dr: { normal: 30, laser: 75, fire: 10, plasma: 20, explode: 25 }, look: 'metal', tint: '#7d7f82' } }),
  A({ id: 'combatArmor', name: 'Composite Armor', weight: 20, value: 6500, icon: 'combat', desc: 'Pre-war military composite plates. The best non-powered protection there is.',
    armor: { ac: 20, dt: { normal: 5, laser: 8, fire: 4, plasma: 4, explode: 6 }, dr: { normal: 40, laser: 60, fire: 30, plasma: 50, explode: 40 }, look: 'combat', tint: '#3d4535' } }),
  A({ id: 'aegisPlate', name: 'Aegis Frame', weight: 42, value: 12500, icon: 'power', desc: 'A self-powered armored exoskeleton. +3 Strength while worn.',
    armor: { ac: 25, dt: { normal: 12, laser: 18, fire: 12, plasma: 10, explode: 20 }, dr: { normal: 40, laser: 80, fire: 60, plasma: 40, explode: 50 }, look: 'power', tint: '#5a5e62' } }),
  A({ id: 'robe', name: 'Cloth Robe', weight: 2, value: 30, icon: 'robe', desc: 'A long hooded robe of stitched canvas.',
    armor: { ac: 5, dt: {}, dr: { normal: 20, fire: 10 }, look: 'robe', tint: '#6e5f4a' } }),

  // ------------------------------------------------------------------ drugs
  { id: 'hypo', name: 'Mend-Hypo', type: 'drug', weight: 0, value: 175, icon: 'hypo', desc: 'An auto-injector of cell-knitting serum. Heals 10-20 hit points.', use: 'hypo' },
  { id: 'superHypo', name: 'Surge-Hypo', type: 'drug', weight: 0, value: 350, icon: 'superhypo', desc: 'A military-grade healing injector. Heals 50-70 hit points, but hurts a little afterward.', use: 'superHypo' },
  { id: 'curePaste', name: 'Root Poultice', type: 'drug', weight: 0, value: 20, icon: 'paste', desc: 'A tribal paste of dried roots and ash. Heals 6-12 hit points, but dulls the senses (-1 PER for a while).', use: 'curePaste' },
  { id: 'radPurge', name: 'Rad-Purge', type: 'drug', weight: 0, value: 150, icon: 'bag', desc: 'An IV bag of chelating agents. Flushes radiation from the body over time.', use: 'radPurge' },
  { id: 'iodine', name: 'Iodine Tabs', type: 'drug', weight: 0, value: 80, icon: 'pills', desc: 'Blocks uptake of radioactive isotopes. +40% radiation resistance for a day.', use: 'iodine' },
  { id: 'bulk', name: 'Bulk', type: 'drug', weight: 0, value: 200, icon: 'pills', desc: 'Black-market steroids. +2 Strength, +2 Endurance for a few hours. Addictive.', use: 'bulk' },
  { id: 'clarity', name: 'Clarity', type: 'drug', weight: 0, value: 280, icon: 'pills', desc: 'Focus tablets. +2 Intelligence, +2 Perception for a few hours. Addictive.', use: 'clarity' },
  { id: 'fury', name: 'Fury', type: 'drug', weight: 0, value: 400, icon: 'hypo', desc: 'Combat stimulant. +2 action points and +20% damage resistance for an hour. Addictive.', use: 'fury' },
  { id: 'antidote', name: 'Antivenom', type: 'drug', weight: 0, value: 150, icon: 'vial', desc: 'Neutralises venom from beetles and crawlers.', use: 'antidote' },
  { id: 'water', name: 'Canteen of Water', type: 'drug', weight: 1, value: 10, icon: 'canteen', desc: 'Clean water. Restores 2 hit points. Precious.', use: 'water' },
  { id: 'jerky', name: 'Dried Meat', type: 'drug', weight: 0.5, value: 8, icon: 'food', desc: 'Strips of dried ox. Chewy. Restores 3 hit points.', use: 'food' },
  { id: 'beer', name: 'Dust Ale', type: 'drug', weight: 1, value: 5, icon: 'bottle', desc: 'Cloudy home-brewed ale. -1 PER, +1 CHA for a while.', use: 'beer' },

  // ------------------------------------------------------------------- misc
  { id: 'scrip', name: 'Scrip', type: 'misc', weight: 0, value: 1, icon: 'scrip', desc: 'Stamped aluminium tokens, the common currency of the basin.' },
  { id: 'flare', name: 'Road Flare', type: 'misc', weight: 1, value: 5, icon: 'flare', desc: 'A red flare. Lights up the darkness for a while.', use: 'flare' },
  { id: 'rope', name: 'Rope', type: 'misc', weight: 3, value: 10, icon: 'rope', desc: 'Thirty feet of braided nylon rope.' },
  { id: 'lockpicks', name: 'Lock Picks', type: 'misc', weight: 0.5, value: 150, icon: 'picks', desc: 'A roll of tension wrenches and rakes. +20% Lockpick when used.' },
  { id: 'medkit', name: 'Field Kit', type: 'misc', weight: 2, value: 250, icon: 'medkit', desc: 'Bandages, splints and sutures. +20% First Aid and Doctor when used.' },
  { id: 'toolkit', name: 'Tool Roll', type: 'misc', weight: 3, value: 250, icon: 'tools', desc: 'Wrenches, pliers and a soldering iron. +20% Repair when used.' },
  { id: 'geiger', name: 'Rad Counter', type: 'misc', weight: 2, value: 250, icon: 'geiger', desc: 'Clicks when radiation is near. Use it to read your current dose.', use: 'geiger' },
  { id: 'dynamite', name: 'Demolition Charge', type: 'misc', weight: 3, value: 300, icon: 'dynamite', desc: 'A timed demolition charge. Use it with the Traps skill to set it.', use: 'explosive' },
  { id: 'scrapElectronics', name: 'Salvaged Circuitry', type: 'misc', weight: 1, value: 40, icon: 'chip', desc: 'Circuit boards pried from dead machines. Merchants buy it.' },
  { id: 'scrapMetal', name: 'Scrap Metal', type: 'misc', weight: 3, value: 8, icon: 'scrap', desc: 'Useful to somebody, somewhere.' },
  { id: 'ratTail', name: 'Rat Tail', type: 'misc', weight: 0.1, value: 1, icon: 'tail', desc: 'Disgusting. Some folks pay for these.' },
  { id: 'beetleGland', name: 'Burrower Venom Gland', type: 'misc', weight: 0.5, value: 25, icon: 'gland', desc: 'The venom sac of a burrower beetle. Healers make antivenom from these.' },
]);
