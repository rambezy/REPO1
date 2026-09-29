// Derived statistics: effective attributes, skills, HP, AP, AC, resistances.

import { SKILL_INFO, SKILL_KEYS, STAT_KEYS, type SkillKey, type StatKey, type Stats } from '../data/stats';
import { ITEMS, type DmgType } from '../data/items';
import { PROTOS } from '../data/protos';
import type { Actor } from './types';
import { G } from './G';

export function hasTrait(a: Actor, id: string): boolean {
  return !!a.traits?.includes(id);
}

export function perkRank(a: Actor, id: string): number {
  return a.perks?.[id] ?? 0;
}

export function isPlayer(a: Actor): boolean {
  return a.uid === 'player';
}

function isNight(): boolean {
  const h = Math.floor((G.state.time % 1440) / 60);
  return h >= 18 || h < 6;
}

/** Effective primary statistic including traits, drugs, armor and cripples. */
export function stat(a: Actor, k: StatKey): number {
  let v = a.stats[k];
  if (hasTrait(a, 'slightFrame') && k === 'AGI') v += 1;
  if (hasTrait(a, 'unkempt') && k === 'CHA') v -= 1;
  if (hasTrait(a, 'nightOwl') && (k === 'PER' || k === 'INT')) v += isNight() ? 1 : -1;
  for (const e of a.effects) v += e.mods?.[k] ?? 0;
  if (k === 'STR' && a.armor?.id === 'aegisPlate') v += 3;
  if (k === 'PER' && a.crippled.eyes) v -= 3;
  return Math.max(1, Math.min(10, v));
}

export function allStats(a: Actor): Stats {
  const s = {} as Stats;
  for (const k of STAT_KEYS) s[k] = stat(a, k);
  return s;
}

const COMBAT_SKILLS: SkillKey[] = ['smallGuns', 'bigGuns', 'energy', 'unarmed', 'melee', 'throwing'];

/** Skill value for an actor, as a percentage. */
export function skill(a: Actor, k: SkillKey): number {
  const proto = PROTOS[a.proto];
  if (!isPlayer(a) && !a.companion) {
    const base = proto?.skills?.[k];
    if (base !== undefined) return base;
    return Math.max(0, SKILL_INFO[k].base(allStats(a)));
  }
  let v = SKILL_INFO[k].base(allStats(a));
  const tagged = a.tags?.includes(k);
  if (tagged && !hasTrait(a, 'jack')) v += 20;
  v += a.skillPts?.[k] ?? 0;
  if (hasTrait(a, 'jack')) v += 10;
  if (hasTrait(a, 'bookish')) {
    if (['science', 'repair', 'firstAid', 'doctor'].includes(k)) v += 10;
    if (COMBAT_SKILLS.includes(k)) v -= 10;
  }
  if (hasTrait(a, 'kindly') && COMBAT_SKILLS.includes(k)) v -= 10;
  if (hasTrait(a, 'unkempt') && (k === 'unarmed' || k === 'melee')) v += 10;
  if ((k === 'speech' || k === 'barter')) v += 15 * perkRank(a, 'smoothTalk');
  if ((k === 'firstAid' || k === 'doctor') && perkRank(a, 'medic')) v += 15;
  if ((k === 'science' || k === 'repair') && perkRank(a, 'tinkerer')) v += 15;
  if (['sneak', 'lockpick', 'steal', 'traps'].includes(k) && perkRank(a, 'nimble')) v += 10;
  if (k === 'gambling' && perkRank(a, 'lucky7')) v += 10;
  if (k === 'outdoorsman' && perkRank(a, 'wanderer')) v += 20;
  if (a.companion && proto?.skills?.[k] !== undefined) v = Math.max(v, proto.skills[k]!);
  return Math.max(0, Math.min(300, v));
}

export function maxHp(a: Actor): number {
  const proto = PROTOS[a.proto];
  if (proto?.hp && !isPlayer(a)) return proto.hp + (a.maxHpBonus ?? 0);
  const st = a.stats.STR;
  const en = a.stats.END;
  const base = 15 + st + 2 * en;
  const per = 2 + Math.floor(en / 2) + (perkRank(a, 'lifeForce') ? 4 : 0);
  return base + per * (a.level - 1) + (a.maxHpBonus ?? 0);
}

export function maxAp(a: Actor): number {
  const proto = PROTOS[a.proto];
  let ap = proto?.ap ?? 5 + Math.floor(stat(a, 'AGI') / 2);
  ap += perkRank(a, 'swift');
  for (const e of a.effects) ap += e.ap ?? 0;
  if (a.crippled.lleg) ap -= 1;
  if (a.crippled.rleg) ap -= 1;
  return Math.max(1, ap);
}

export function armorClass(a: Actor): number {
  const proto = PROTOS[a.proto];
  let ac = stat(a, 'AGI') + (proto?.ac ?? 0);
  if (a.armor) ac += ITEMS[a.armor.id]?.armor?.ac ?? 0;
  ac += a._acBonus ?? 0;
  return ac;
}

export function carryWeight(a: Actor): number {
  let c = 25 + 25 * stat(a, 'STR');
  if (hasTrait(a, 'slightFrame')) c = Math.floor(c * 0.7);
  c += 50 * perkRank(a, 'packMule');
  return c;
}

export function meleeDamage(a: Actor): number {
  let d = Math.max(1, stat(a, 'STR') - 5);
  if (hasTrait(a, 'heavyHands')) d += 4;
  d += 2 * perkRank(a, 'bonebreaker');
  return d;
}

export function sequence(a: Actor): number {
  let s = 2 * stat(a, 'PER') + 2 * perkRank(a, 'readyStance') + (perkRank(a, 'eagleEye') ? 4 : 0);
  if (hasTrait(a, 'deliberate')) s -= 5;
  return s;
}

export function healingRate(a: Actor): number {
  let h = Math.max(1, Math.floor(stat(a, 'END') / 3));
  h += 2 * perkRank(a, 'mender');
  if (hasTrait(a, 'fastHeal')) h *= 2;
  return h;
}

export function critChance(a: Actor): number {
  let c = stat(a, 'LCK');
  if (hasTrait(a, 'lucky')) c += 10;
  return c;
}

export function radResist(a: Actor): number {
  let r = 2 * stat(a, 'END');
  if (hasTrait(a, 'fastHeal')) r -= 10;
  for (const e of a.effects) if (e.id === 'iodine') r += 40;
  if (a.armor) {
    const look = ITEMS[a.armor.id]?.armor?.look;
    if (look === 'power') r += 40;
    else if (look === 'combat') r += 20;
    else if (look === 'metal') r += 10;
  }
  return Math.max(0, Math.min(95, r));
}

export function poisonResist(a: Actor): number {
  return Math.min(95, 5 * stat(a, 'END'));
}

export function damageThreshold(a: Actor, t: DmgType): number {
  const proto = PROTOS[a.proto];
  let v = proto?.dt?.[t] ?? 0;
  if (a.armor) v += ITEMS[a.armor.id]?.armor?.dt[t] ?? 0;
  return v;
}

export function damageResist(a: Actor, t: DmgType): number {
  const proto = PROTOS[a.proto];
  let v = proto?.dr?.[t] ?? 0;
  if (a.armor) v += ITEMS[a.armor.id]?.armor?.dr[t] ?? 0;
  v += 10 * perkRank(a, 'toughHide');
  for (const e of a.effects) v += e.dr ?? 0;
  return Math.max(0, Math.min(90, v));
}

export function inventoryWeight(a: Actor): number {
  let w = 0;
  const add = (s: { id: string; n: number } | null) => {
    if (s) w += (ITEMS[s.id]?.weight ?? 0) * s.n;
  };
  a.inv.forEach(add);
  add(a.hands[0]);
  add(a.hands[1]);
  add(a.armor);
  return Math.round(w * 10) / 10;
}

export function skillPointsPerLevel(a: Actor): number {
  return 5 + 2 * a.stats.INT + 2 * perkRank(a, 'educated');
}

/** Points needed to raise a skill by 1% from its current value. */
export function skillCost(v: number): number {
  if (v < 100) return 1;
  if (v < 125) return 2;
  if (v < 150) return 3;
  if (v < 175) return 4;
  if (v < 200) return 5;
  return 6;
}

export function allSkills(a: Actor): Record<SkillKey, number> {
  const o = {} as Record<SkillKey, number>;
  for (const k of SKILL_KEYS) o[k] = skill(a, k);
  return o;
}
