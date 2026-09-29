// Creature and character templates. Content modules add more via defineProtos().

import type { Stats, SkillKey } from './stats';
import type { DmgType } from './items';

export type BodyKind = 'human' | 'rat' | 'beetle' | 'dog' | 'grafted' | 'withered' | 'robot' | 'crawler' | 'ox' | 'lizard';

export interface Look {
  body: BodyKind;
  skin?: string;
  hair?: string;
  hairStyle?: 'short' | 'long' | 'bald' | 'mohawk' | 'bun' | 'hood' | 'helmet' | 'cap';
  outfit?: string; // primary clothing colour
  outfit2?: string; // accents
  female?: boolean;
  scale?: number;
  beard?: boolean;
}

export interface Proto {
  id: string;
  name: string;
  look: Look;
  stats: Stats;
  hp?: number; // override max HP
  ac?: number; // bonus AC
  ap?: number; // override AP
  skills?: Partial<Record<SkillKey, number>>; // absolute values
  dt?: Partial<Record<DmgType, number>>;
  dr?: Partial<Record<DmgType, number>>;
  // Natural attack for creatures without weapons.
  natural?: { name: string; dmg: [number, number]; ap: number; dmgType?: DmgType; poison?: number; range?: number };
  xp: number;
  inv?: { id: string; n?: number; chance?: number }[];
  equip?: string[]; // item ids to equip (first weapon goes to hand, armor worn)
  team?: string;
  hostile?: boolean;
  fleeAt?: number; // fraction of HP at which it runs
  desc?: string;
  speed?: number; // walk speed multiplier
  deathSound?: string;
}

export const PROTOS: Record<string, Proto> = {};

export function defineProtos(list: Proto[]): void {
  for (const p of list) PROTOS[p.id] = p;
}

export const S = (STR: number, PER: number, END: number, CHA: number, INT: number, AGI: number, LCK: number): Stats => ({ STR, PER, END, CHA, INT, AGI, LCK });

defineProtos([
  { id: 'player', name: 'You', look: { body: 'human' }, stats: S(5, 5, 5, 5, 5, 5, 5), xp: 0 },

  // ---------------------------------------------------------------- critters
  { id: 'rat', name: 'Cave Rat', desc: 'a cave rat, big as a dog and twice as mean', look: { body: 'rat', skin: '#6b5a4d' }, stats: S(2, 5, 2, 1, 1, 6, 4), hp: 6, xp: 25, natural: { name: 'bite', dmg: [1, 3], ap: 3 }, team: 'critter', hostile: true, fleeAt: 0.2, inv: [{ id: 'ratTail', chance: 30 }] },
  { id: 'ratBig', name: 'Pit Rat', desc: 'a bloated pit rat with yellow teeth', look: { body: 'rat', skin: '#4d3f35', scale: 1.3 }, stats: S(4, 5, 4, 1, 1, 6, 4), hp: 14, xp: 50, natural: { name: 'bite', dmg: [2, 6], ap: 3 }, team: 'critter', hostile: true, inv: [{ id: 'ratTail', chance: 60 }] },
  { id: 'beetle', name: 'Burrower', desc: 'a burrower beetle, all chitin and mandibles', look: { body: 'beetle', skin: '#5b4a2a' }, stats: S(5, 4, 6, 1, 1, 5, 3), hp: 22, xp: 90, dt: { normal: 2 }, dr: { normal: 20 }, natural: { name: 'pincer', dmg: [3, 8], ap: 4, poison: 4 }, team: 'critter', hostile: true, inv: [{ id: 'beetleGland', chance: 50 }] },
  { id: 'beetleQueen', name: 'Burrower Matriarch', desc: 'the burrower matriarch, bloated and armored', look: { body: 'beetle', skin: '#6e3a24', scale: 1.6 }, stats: S(8, 5, 8, 1, 1, 5, 3), hp: 60, xp: 300, dt: { normal: 4 }, dr: { normal: 30 }, natural: { name: 'pincer', dmg: [6, 14], ap: 4, poison: 8 }, team: 'critter', hostile: true, inv: [{ id: 'beetleGland', n: 2 }] },
  { id: 'dog', name: 'Dust Hound', desc: 'a feral dust hound, ribs showing', look: { body: 'dog', skin: '#7a6248' }, stats: S(4, 7, 4, 1, 2, 7, 5), hp: 12, xp: 40, natural: { name: 'bite', dmg: [2, 6], ap: 3 }, team: 'critter', hostile: true, fleeAt: 0.25 },
  { id: 'crawler', name: 'Sludge Crawler', desc: 'a sludge crawler, a many-legged thing that smells of rot', look: { body: 'crawler', skin: '#4f5a3a' }, stats: S(5, 4, 5, 1, 1, 6, 3), hp: 30, xp: 110, dr: { normal: 15 }, natural: { name: 'claw', dmg: [4, 10], ap: 4, poison: 2 }, team: 'critter', hostile: true },
  { id: 'lizard', name: 'Ridgeback', desc: 'a ridgeback lizard, long as a man', look: { body: 'lizard', skin: '#6d6a3d' }, stats: S(6, 5, 6, 1, 1, 6, 4), hp: 35, xp: 140, dt: { normal: 2 }, dr: { normal: 15 }, natural: { name: 'bite', dmg: [5, 12], ap: 4 }, team: 'critter', hostile: true },
  { id: 'ox', name: 'Dust Ox', desc: 'a humped dust ox, chewing slowly', look: { body: 'ox', skin: '#8a7358' }, stats: S(7, 3, 7, 1, 1, 3, 5), hp: 40, xp: 20, natural: { name: 'horn', dmg: [3, 9], ap: 5 }, team: 'neutral', hostile: false },

  // ------------------------------------------------------------------ humans
  { id: 'raider', name: 'Raider', desc: 'a raider in patched leathers', look: { body: 'human', skin: '#c8966e', hair: '#2b1d14', hairStyle: 'mohawk', outfit: '#5a4030', outfit2: '#2a2622' }, stats: S(6, 5, 5, 3, 4, 6, 4), xp: 70, skills: { melee: 55, smallGuns: 45, unarmed: 50 }, equip: ['spear', 'leatherJacket'], inv: [{ id: 'scrip', n: 15, chance: 70 }, { id: 'curePaste', chance: 25 }], team: 'raiders', hostile: true, fleeAt: 0.2 },
  { id: 'raiderGun', name: 'Raider', desc: 'a raider cradling a pistol', look: { body: 'human', skin: '#a8764e', hair: '#111', hairStyle: 'short', outfit: '#4a3a30', outfit2: '#2a2622', beard: true }, stats: S(5, 6, 5, 3, 4, 6, 4), xp: 80, skills: { smallGuns: 55, melee: 40 }, equip: ['pistol9', 'leatherJacket'], inv: [{ id: 'ammo9', n: 12 }, { id: 'scrip', n: 20, chance: 70 }], team: 'raiders', hostile: true, fleeAt: 0.2 },
  { id: 'guard', name: 'Guard', desc: 'a town guard with a watchful squint', look: { body: 'human', skin: '#b58560', hair: '#3b2a1a', hairStyle: 'cap', outfit: '#5b5a3c', outfit2: '#3a3a2a' }, stats: S(6, 6, 6, 4, 5, 6, 5), xp: 100, skills: { smallGuns: 70, melee: 60 }, equip: ['huntingRifle', 'leatherArmor'], inv: [{ id: 'ammo223', n: 10 }], team: 'town', hostile: false },
  { id: 'villager', name: 'Villager', desc: 'a sun-browned villager', look: { body: 'human', skin: '#b07850', hair: '#3a2718', hairStyle: 'short', outfit: '#8a7458', outfit2: '#5a4a38' }, stats: S(5, 5, 5, 5, 5, 5, 5), xp: 30, skills: { melee: 40 }, equip: ['knife'], team: 'town', hostile: false },
  { id: 'villagerF', name: 'Villager', desc: 'a villager in a patched dress', look: { body: 'human', female: true, skin: '#c08a60', hair: '#5a3a20', hairStyle: 'bun', outfit: '#7d6a50', outfit2: '#5a4a38' }, stats: S(4, 5, 5, 5, 5, 5, 5), xp: 30, skills: { melee: 35 }, team: 'town', hostile: false },
  { id: 'shelterite', name: 'Shelter Dweller', desc: 'a shelter dweller in a teal jumpsuit', look: { body: 'human', skin: '#d8b090', hair: '#4a3020', hairStyle: 'short', outfit: '#2f7f86', outfit2: '#e08a2a' }, stats: S(5, 5, 5, 5, 5, 5, 5), xp: 0, team: 'shelter', hostile: false },
  { id: 'shelteriteF', name: 'Shelter Dweller', desc: 'a shelter dweller in a teal jumpsuit', look: { body: 'human', female: true, skin: '#e0b898', hair: '#8a5a2a', hairStyle: 'long', outfit: '#2f7f86', outfit2: '#e08a2a' }, stats: S(5, 5, 5, 5, 5, 5, 5), xp: 0, team: 'shelter', hostile: false },
  { id: 'merchant', name: 'Merchant', desc: 'a merchant with quick eyes and quicker hands', look: { body: 'human', skin: '#c89468', hair: '#222', hairStyle: 'short', outfit: '#6a4a6a', outfit2: '#c8a040' }, stats: S(5, 6, 5, 7, 6, 5, 6), xp: 60, skills: { smallGuns: 60, barter: 80 }, equip: ['pistol9'], team: 'town', hostile: false },
  { id: 'thug', name: 'Thug', desc: 'a thug with scarred knuckles', look: { body: 'human', skin: '#9a6a48', hair: '#1a1a1a', hairStyle: 'bald', outfit: '#3a3a44', outfit2: '#222' }, stats: S(7, 5, 6, 3, 4, 5, 4), xp: 90, skills: { unarmed: 70, melee: 65, smallGuns: 50 }, equip: ['brassKnuckles', 'leatherJacket'], team: 'thugs', hostile: false, inv: [{ id: 'scrip', n: 30 }] },

  // ------------------------------------------------------------------ others
  { id: 'withered', name: 'Withered', desc: 'one of the Withered, skin like cracked parchment', look: { body: 'withered', skin: '#8a7a5a', outfit: '#4a4238', outfit2: '#3a3228' }, stats: S(5, 5, 7, 3, 6, 5, 5), xp: 60, skills: { melee: 50, smallGuns: 50 }, dr: { normal: 10 }, equip: ['crowbar'], team: 'withered', hostile: false },
  { id: 'witheredFeral', name: 'Hollow One', desc: 'a Hollow One, a Withered whose mind has gone', look: { body: 'withered', skin: '#6a6a4a', outfit: '#3a3a30', outfit2: '#2a2a22' }, stats: S(6, 4, 7, 1, 1, 6, 3), hp: 25, xp: 80, natural: { name: 'claw', dmg: [3, 9], ap: 3 }, team: 'critter', hostile: true },
  { id: 'grafted', name: 'Grafted', desc: 'a Grafted: a towering, grey-green brute with a metal collar', look: { body: 'grafted', skin: '#7d8a6a', outfit: '#4a4040', outfit2: '#8a7a50', scale: 1.35 }, stats: S(10, 5, 9, 2, 3, 5, 4), hp: 75, xp: 300, dt: { normal: 3 }, dr: { normal: 20 }, skills: { melee: 80, bigGuns: 70, smallGuns: 60 }, equip: ['sledge'], team: 'grafted', hostile: true },
  { id: 'graftedGun', name: 'Grafted', desc: 'a Grafted hefting a rotary cannon', look: { body: 'grafted', skin: '#6f7d62', outfit: '#3a3434', outfit2: '#8a7a50', scale: 1.35 }, stats: S(10, 6, 9, 2, 3, 5, 4), hp: 75, xp: 350, dt: { normal: 3 }, dr: { normal: 20 }, skills: { bigGuns: 75, smallGuns: 70 }, equip: ['minigun'], inv: [{ id: 'ammo5', n: 120 }], team: 'grafted', hostile: true },
  { id: 'sentry', name: 'Sentry Drone', desc: 'a pre-war sentry drone humming on a treaded chassis', look: { body: 'robot', skin: '#6a7078' }, stats: S(8, 8, 8, 1, 4, 5, 5), hp: 50, xp: 250, dt: { normal: 5, laser: 3 }, dr: { normal: 30, laser: 20, explode: 20 }, natural: { name: 'laser', dmg: [10, 20], ap: 5, dmgType: 'laser', range: 15 }, team: 'machines', hostile: true, inv: [{ id: 'scrapElectronics', n: 2 }, { id: 'cell', n: 10, chance: 50 }] },
]);
