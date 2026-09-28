// Attributes, skills, experience, perks and derived character values.
// Everything improves by doing it: swing a sword to get better with swords.

import { S } from '../state';
import { notify } from '../ui/notify';
import { emit } from '../engine/events';

export const ATTRS = ['strength', 'agility', 'vitality', 'speech'] as const;
export type Attr = (typeof ATTRS)[number];

export const SKILLS: Record<string, { name: string; desc: string }> = {
  sword: { name: 'Swordsmanship', desc: 'Damage and speed with swords and knives.' },
  blunt: { name: 'Maces & Hammers', desc: 'Damage with maces, hammers and clubs.' },
  axe: { name: 'Axes', desc: 'Damage with axes and hatchets.' },
  archery: { name: 'Archery', desc: 'Steadier aim and harder shots with the bow.' },
  defense: { name: 'Defence', desc: 'Blocking costs less stamina; the perfect-block window widens.' },
  stealth: { name: 'Stealth', desc: 'Moving unseen and unheard.' },
  thievery: { name: 'Thievery', desc: 'Lockpicking and light fingers.' },
  alchemy: { name: 'Alchemy', desc: 'Brewing stronger potions with fewer mistakes.' },
  herbalism: { name: 'Herbalism', desc: 'Gathering more from each plant; knowing what grows where.' },
  smithing: { name: 'Smithing', desc: 'Forging, sharpening and mending.' },
  reading: { name: 'Reading', desc: 'Letters. Every book becomes a little clearer.' },
  houndmaster: { name: 'Houndmaster', desc: 'Crumb listens better and bites harder.' },
};
export const SKILL_IDS = Object.keys(SKILLS);

export const ATTR_INFO: Record<Attr, { name: string; desc: string }> = {
  strength: { name: 'Strength', desc: 'Damage, carrying capacity, and heavier weapons.' },
  agility: { name: 'Agility', desc: 'Attack speed, dodging and archery.' },
  vitality: { name: 'Vitality', desc: 'Stamina and resistance to wounds.' },
  speech: { name: 'Speech', desc: 'Persuasion, haggling and the respect of strangers.' },
};

export interface PerkDef { id: string; name: string; desc: string; skill: string; level: number }

export const PERKS: PerkDef[] = [
  // swords
  { id: 'riposte', name: 'Master Strike', desc: 'A perfect block is answered at once with a devastating counter.', skill: 'sword', level: 3 },
  { id: 'bleeder', name: 'Bleeder', desc: 'Your slashes open wounds that keep bleeding.', skill: 'sword', level: 4 },
  { id: 'quick_hands', name: 'Quick Hands', desc: 'Attacks recover 15% faster.', skill: 'sword', level: 6 },
  { id: 'fencer', name: 'Fencer', desc: 'Sword attacks cost 25% less stamina.', skill: 'sword', level: 8 },
  // blunt & axe
  { id: 'bonebreaker', name: 'Bonebreaker', desc: 'Blunt blows ignore a third of the enemy\'s armour.', skill: 'blunt', level: 3 },
  { id: 'stunning', name: 'Bell Ringer', desc: 'Heavy blunt blows stagger for longer.', skill: 'blunt', level: 5 },
  { id: 'woodsman', name: 'Woodsman', desc: '+20% damage with axes.', skill: 'axe', level: 3 },
  { id: 'cleaver', name: 'Cleaver', desc: 'Axe blows break guards more easily.', skill: 'axe', level: 5 },
  // defence
  { id: 'steady_guard', name: 'Steady Guard', desc: 'Blocking costs 25% less stamina.', skill: 'defense', level: 2 },
  { id: 'hawk_eye', name: 'Hawk\'s Eye', desc: 'The perfect-block window is 40% wider.', skill: 'defense', level: 4 },
  { id: 'second_wind', name: 'Second Wind', desc: 'Stamina returns faster in a fight.', skill: 'defense', level: 6 },
  { id: 'iron_skin', name: 'Iron Skin', desc: 'Take 10% less damage from every blow.', skill: 'defense', level: 8 },
  // archery
  { id: 'steady_hand', name: 'Steady Hand', desc: 'Arrows fly truer.', skill: 'archery', level: 2 },
  { id: 'hunter', name: 'Hunter', desc: '+40% damage against animals; hides sell for more.', skill: 'archery', level: 4 },
  { id: 'quick_draw', name: 'Quick Draw', desc: 'Draw the bow a third faster.', skill: 'archery', level: 6 },
  // stealth & thievery
  { id: 'soft_step', name: 'Soft Step', desc: 'You make less noise while sneaking.', skill: 'stealth', level: 2 },
  { id: 'takedown', name: 'Takedown', desc: 'Unaware enemies struck from behind fall senseless.', skill: 'stealth', level: 4 },
  { id: 'shadow', name: 'Shadow', desc: 'You are much harder to see in darkness.', skill: 'stealth', level: 6 },
  { id: 'nimble', name: 'Nimble Fingers', desc: 'Picked locks break fewer picks.', skill: 'thievery', level: 2 },
  { id: 'fence', name: 'Friend of Fences', desc: 'Stolen goods fetch a fair price with fences.', skill: 'thievery', level: 4 },
  // crafts
  { id: 'green_thumb', name: 'Green Thumb', desc: 'Gather an extra herb from each plant.', skill: 'herbalism', level: 2 },
  { id: 'forager', name: 'Forager', desc: 'Nearby herbs show on your minimap.', skill: 'herbalism', level: 4 },
  { id: 'steady_mortar', name: 'Steady Mortar', desc: 'Alchemy steps are more forgiving.', skill: 'alchemy', level: 2 },
  { id: 'double_brew', name: 'Double Brew', desc: 'Sometimes a brew yields two potions.', skill: 'alchemy', level: 4 },
  { id: 'fathers_hands', name: "Father's Hands", desc: 'Forged work comes out better. "You have his hands," they say.', skill: 'smithing', level: 3 },
  { id: 'whetstone_master', name: 'Keen Edge', desc: 'Sharpened blades deal 10% more damage.', skill: 'smithing', level: 5 },
  { id: 'scholar', name: 'Scholar', desc: 'Books teach you twice as much.', skill: 'reading', level: 3 },
  // hound
  { id: 'good_boy', name: 'Good Boy', desc: 'Crumb bites harder and stays in the fight longer.', skill: 'houndmaster', level: 2 },
  { id: 'nose', name: 'Nose to the Ground', desc: 'Crumb can sniff out herbs and hidden things.', skill: 'houndmaster', level: 3 },
  { id: 'guardian', name: 'Guardian', desc: 'Crumb leaps to defend you when you are struck.', skill: 'houndmaster', level: 5 },
  // attributes
  { id: 'packmule', name: 'Packmule', desc: '+40 pounds of carrying capacity.', skill: 'strength', level: 5 },
  { id: 'brawler', name: 'Brawler', desc: 'Fists and heavy blows hit harder.', skill: 'strength', level: 8 },
  { id: 'fleet', name: 'Fleet of Foot', desc: 'Sprinting costs less stamina.', skill: 'agility', level: 5 },
  { id: 'dodger', name: 'Dodger', desc: 'Dodging costs half the stamina.', skill: 'agility', level: 8 },
  { id: 'marathon', name: 'Marathon', desc: 'Stamina regenerates faster.', skill: 'vitality', level: 5 },
  { id: 'iron_stomach', name: 'Iron Stomach', desc: 'Hunger comes slower; raw meat does not sicken you.', skill: 'vitality', level: 8 },
  { id: 'silver_tongue', name: 'Silver Tongue', desc: '+1 to every speech check.', skill: 'speech', level: 5 },
  { id: 'haggler', name: 'Haggler', desc: 'Better prices from every merchant.', skill: 'speech', level: 7 },
];

export function xpToNext(level: number) {
  return Math.round(14 * Math.pow(level + 1, 1.62) + 8);
}

export function level(key: string): number {
  if ((ATTRS as readonly string[]).includes(key)) return S.attrs[key] ?? 1;
  return S.skills[key] ?? 0;
}

export function xpFrac(key: string): number {
  return Math.min(1, (S.xp[key] || 0) / xpToNext(level(key)));
}

const MAX_LEVEL = 20;

/** Adds experience; handles level-ups, perk points and messages. */
export function addXp(key: string, amount: number) {
  if (amount <= 0) return;
  const isAttr = (ATTRS as readonly string[]).includes(key);
  if (!isAttr && S.skills[key] === undefined) return;
  let lv = level(key);
  if (lv >= MAX_LEVEL) return;
  let mult = 1;
  if (key === 'reading' && hasPerk('scholar')) mult = 2;
  S.xp[key] = (S.xp[key] || 0) + amount * mult;
  while (lv < MAX_LEVEL && S.xp[key] >= xpToNext(lv)) {
    S.xp[key] -= xpToNext(lv);
    lv++;
    if (isAttr) S.attrs[key] = lv; else S.skills[key] = lv;
    const nm = isAttr ? ATTR_INFO[key as Attr].name : SKILLS[key].name;
    notify(`<b>${nm}</b> has improved to <b>${lv}</b>.`, 'skill', 5200);
    const perk = PERKS.find((p) => p.skill === key && p.level === lv);
    if (perk || lv % 2 === 0) {
      S.perkPoints[key] = (S.perkPoints[key] || 0) + 1;
      if (PERKS.some((p) => p.skill === key && p.level <= lv && !S.perks.includes(p.id)))
        notify(`A new perk is available for <b>${nm}</b>. Open your character sheet (C).`, 'skill', 6000);
    }
    emit('levelup', key, lv);
  }
}

export function hasPerk(id: string) { return S.perks.includes(id); }

export function availablePerks(skill: string): PerkDef[] {
  return PERKS.filter((p) => p.skill === skill && p.level <= level(skill) && !S.perks.includes(p.id));
}

export function takePerk(id: string): boolean {
  const p = PERKS.find((x) => x.id === id);
  if (!p) return false;
  if ((S.perkPoints[p.skill] || 0) <= 0 || p.level > level(p.skill) || S.perks.includes(id)) return false;
  S.perkPoints[p.skill]--;
  S.perks.push(id);
  notify(`Perk learned: <b>${p.name}</b>.`, 'skill');
  return true;
}

// ---------- buffs ----------
export function buffActive(id: string): { id: string; until: number; power?: number } | undefined {
  return S.buffs.find((b) => b.id === id && b.until > S.minutes);
}
export function addBuff(id: string, minutes: number, power?: number) {
  const b = S.buffs.find((x) => x.id === id);
  if (b) { b.until = Math.max(b.until, S.minutes + minutes); if (power) b.power = power; }
  else S.buffs.push({ id, until: S.minutes + minutes, power });
}
export function pruneBuffs() {
  S.buffs = S.buffs.filter((b) => b.until > S.minutes);
}

export const BUFF_INFO: Record<string, { name: string; good: boolean; desc: string }> = {
  warmth: { name: "Mother's Warmth", good: true, desc: 'Stamina returns faster; you feel braver.' },
  rested: { name: 'Well Rested', good: true, desc: 'Energy drains more slowly.' },
  nightsight: { name: "Owl's Eye", good: true, desc: 'You see further in the dark.' },
  strength: { name: "Bull's Blood", good: true, desc: '+2 Strength.' },
  speech: { name: 'Fox Tongue', good: true, desc: '+2 Speech.' },
  wind: { name: 'Second Breath', good: true, desc: 'Sprinting costs almost nothing.' },
  blessed: { name: 'Blessed', good: true, desc: 'A prayer at the shrine steadies your hand. +1 to all combat skills.' },
  bathed: { name: 'Freshly Bathed', good: true, desc: 'Clean and smelling of lavender. +2 Charisma.' },
  queasy: { name: 'Queasy', good: false, desc: 'Something you ate disagrees with you.' },
  hungover: { name: 'Hungover', good: false, desc: 'Your head pounds. -1 Agility.' },
  grief: { name: 'Grief', good: false, desc: 'It sits on your chest like a stone. Stamina recovers slowly.' },
  hope: { name: 'Hope', good: true, desc: 'Lida is alive. Somewhere, she is alive.' },
  fed_well: { name: 'Well Fed', good: true, desc: 'A proper meal. Health slowly returns.' },
};

// ---------- derived values ----------
export function attr(a: Attr): number {
  let v = S.attrs[a];
  const b = buffActive(a === 'strength' ? 'strength' : a === 'speech' ? 'speech' : '__');
  if (b) v += b.power || 2;
  if (a === 'agility' && buffActive('hungover')) v -= 1;
  if (a === 'agility' && S.drunk > 40) v -= 2;
  if (a === 'speech' && S.drunk > 20 && S.drunk < 60) v += 1; // Dutch courage
  return Math.max(1, v);
}

export function skill(k: string): number {
  let v = S.skills[k] || 0;
  if (buffActive('blessed') && (k === 'sword' || k === 'blunt' || k === 'axe' || k === 'defense' || k === 'archery')) v += 1;
  if (S.drunk > 50 && (k === 'sword' || k === 'defense' || k === 'archery')) v -= 1;
  return Math.max(0, v);
}

export function maxHp() { return 90 + attr('vitality') * 4; }
export function maxStamina() {
  let m = 80 + attr('vitality') * 5 + attr('agility') * 2;
  if (S.hunger < 20) m *= 0.75;
  if (S.energy < 15) m *= 0.7;
  if (buffActive('grief')) m *= 0.9;
  return Math.round(m);
}
export function carryCap() { return 60 + attr('strength') * 6 + (hasPerk('packmule') ? 40 : 0); }
