// A character: person or beast. Body, skills, gear, orders and AI state.
import { Body, LI } from './body';
import { Grid, Item } from './inventory';
import { NSK, SK, Skill, SKILLS } from './skills';
import { ITEM, ItemDef, EquipSlot, GRADES, WeaponStats } from '../content/items';
import { RACE } from '../content/races';
import type { Look, Vis, WeaponVis } from './look';
import type { Path } from '../world/nav';
import type { ActionKind } from '../render/anim';
import { ANIMAL } from '../content/animals';

export type Status = 'up' | 'ko' | 'dead';
export type MoveMode = 'walk' | 'run' | 'sneak';
export type CombatMode = 'aggressive' | 'defensive' | 'passive';
export type Role =
  | 'player' | 'guard' | 'patrol' | 'shopkeeper' | 'barkeep' | 'resident' | 'noble' | 'slave' | 'bandit' | 'recruit' | 'trader'
  | 'animal' | 'boss' | 'hunter' | 'slaver' | 'priest' | 'worker' | 'merc' | 'prisoner' | 'wanderer' | 'construct' | 'caravan';

export type Order =
  | { k: 'move'; x: number; z: number }
  | { k: 'attack'; id: number }
  | { k: 'follow'; id: number }
  | { k: 'talk'; id: number }
  | { k: 'loot'; id: number }
  | { k: 'lootobj'; obj: number }
  | { k: 'pickup'; id: number }
  | { k: 'drop' }
  | { k: 'aid'; id: number }
  | { k: 'use'; obj: number }
  | { k: 'place'; obj: number } // put a carried body in a bed or cage
  | { k: 'steal'; obj: number }
  | { k: 'pickpocket'; id: number }
  | { k: 'lockpick'; obj: number; id?: number }
  | { k: 'assassinate'; id: number }
  | { k: 'mine'; obj: number }
  | { k: 'build'; obj: number }
  | { k: 'operate'; obj: number }
  | { k: 'free'; id: number }
  | { k: 'shoot'; id: number }
  | { k: 'shop'; id: number }
  | { k: 'salvage'; id: number } // strip a downed machine for parts
  | { k: 'reprogram'; id: number } // give a downed machine new orders
  | { k: 'hold' };

export type JobKind = 'mine' | 'build' | 'operate' | 'haul' | 'farm' | 'research' | 'craft' | 'turret' | 'repair' | 'medic' | 'guard' | 'cook' | 'watch';
export interface Job { k: JobKind; obj: number; label: string; }

export const EQUIP_SLOTS: EquipSlot[] = ['weapon', 'weapon2', 'ranged', 'head', 'shirt', 'body', 'legs', 'feet', 'back'];
const INV_W = 6, INV_H = 8;

export class Char {
  id = 0;
  name = '';
  title = '';
  animal: string | null = null;
  look: Look;
  faction = 'drifters';
  squad = 0;
  role: Role = 'resident';
  rank = 0;
  unique = '';
  // place
  x = 0;
  z = 0;
  y = 0;
  dir = 0;
  vx = 0;
  vz = 0;
  speed = 0;
  site = 0;
  homeX = 0;
  homeZ = 0;
  homeDir = 0;
  // body and needs
  body = new Body();
  hunger = 240;
  mood = 0;
  sk = new Float32Array(NSK);
  inv = new Grid(INV_W, INV_H);
  eq: Record<EquipSlot, Item | null> = { weapon: null, weapon2: null, ranged: null, head: null, shirt: null, body: null, legs: null, feet: null, back: null };
  money = 0;
  status: Status = 'up';
  playDead = false;
  carrying = 0;
  carriedBy = 0;
  bed = 0;
  cage = 0;
  shackled = false;
  sleeping = false;
  // combat
  target = 0;
  atk: { t: number; dur: number; variant: number; hit: boolean; target: number; kick?: boolean } | null = null;
  atkCD = 0;
  blockT = 0;
  stagger = 0;
  knockT = 0; // knocked flat, still conscious
  drawn = false;
  lastHitBy = 0;
  lastHitT = -999;
  combatMode: CombatMode = 'aggressive';
  holdPos = false;
  reload = 0;
  // movement
  path: Path | null = null;
  goalX = 0;
  goalZ = 0;
  hasGoal = false;
  move: MoveMode = 'run';
  stuckT = 0;
  swim = false;
  // control
  order: Order | null = null;
  jobs: Job[] = [];
  jobIdx = 0;
  brain: any = {};
  // presentation
  act: ActionKind | null = null;
  actT = 0;
  actDur = 1;
  actVar = 0;
  bark = '';
  barkT = 0;
  dirty = true; // gear changed: rebuild model
  active = false;
  view: any = null;
  // social
  bounty: Record<string, number> = {};
  mem: Record<string, any> = {};
  recruitable = false;
  price = 0;
  shop = '';
  dialogue = '';
  stats = { kills: 0, kos: 0, downed: 0, dist: 0, days: 0 };
  thinkT = Math.random();
  visKey = '';

  constructor(look: Look) {
    this.look = look;
  }

  get isPerson() { return !this.animal; }
  get up() { return this.status === 'up'; }
  get alive() { return this.status !== 'dead'; }
  get awake() { return this.status === 'up' && !this.sleeping; }
  get raceDef() { return RACE[this.look.race]; }
  /** a machine: a Hollow, a Warden, a Sentinel, or a beast of steel (a rustspider, a drone) */
  get robot() { return !!this.raceDef?.robotic || !!this.body?.robotic; }

  base(s: Skill) { return this.sk[SK[s]]; }
  /** Effective skill with gear, limbs, hunger and injuries. */
  skill(s: Skill): number {
    let v = this.sk[SK[s]];
    for (const slot of EQUIP_SLOTS) {
      const it = this.eq[slot];
      if (!it) continue;
      const a = ITEM[it.id].armour;
      if (a?.bonus?.[s]) v += a.bonus[s]!;
    }
    for (let l = 3; l < 7; l++) {
      // a wrecked limb gives nothing but its weight
      if (this.body.prostOK(l)) v += ITEM[this.body.prost[l]!]?.limb?.bonus[s] ?? 0;
    }
    if (this.hunger < 60 && !this.robot && !this.animal) v *= 0.8;
    return Math.max(0, v);
  }

  weapon(): ItemDef | null {
    const it = this.eq.weapon;
    return it ? ITEM[it.id] : null;
  }
  weaponStats(): WeaponStats {
    if (this.animal) return ANIMAL[this.animal].attack;
    const d = this.weapon();
    if (d?.weapon) return d.weapon;
    return UNARMED;
  }
  weaponGrade() { return this.eq.weapon ? GRADES[this.eq.weapon.q].dmg : 1; }

  /** Worn armour resistances for a limb: [cut, blunt] reductions 0..0.9 */
  armourAt(limb: number): [number, number] {
    const name = ['head', 'chest', 'stomach', 'larm', 'rarm', 'lleg', 'rleg'][limb] as keyof NonNullable<ItemDef['armour']>['cover'];
    let cut = 0, blunt = 0;
    for (const slot of ['head', 'shirt', 'body', 'legs', 'feet'] as EquipSlot[]) {
      const it = this.eq[slot];
      if (!it) continue;
      const a = ITEM[it.id].armour;
      if (!a) continue;
      const c = a.cover[name] ?? 0;
      if (!c) continue;
      const g = ITEM[it.id].graded ? GRADES[it.q].arm : 1;
      cut = 1 - (1 - cut) * (1 - a.cut * g * c);
      blunt = 1 - (1 - blunt) * (1 - a.blunt * g * c);
    }
    if (this.animal) {
      const an = ANIMAL[this.animal];
      cut = 1 - (1 - cut) * (1 - an.armour[0]);
      blunt = 1 - (1 - blunt) * (1 - an.armour[1]);
    } else if (this.raceDef?.armour) {
      // a machine's own plating
      cut = 1 - (1 - cut) * (1 - this.raceDef.armour[0]);
      blunt = 1 - (1 - blunt) * (1 - this.raceDef.armour[1]);
    }
    // a prosthetic limb is metal already
    const plate = this.body.isProst(limb) ? ITEM[this.body.prost[limb]!]?.limb?.plate : undefined;
    if (plate) {
      cut = 1 - (1 - cut) * (1 - plate[0]);
      blunt = 1 - (1 - blunt) * (1 - plate[1]);
    }
    return [Math.min(0.9, cut), Math.min(0.9, blunt)];
  }
  armourPenalty(k: 'dex' | 'stealth' | 'athletics' | 'martial'): number {
    let p = 0;
    for (const slot of ['head', 'shirt', 'body', 'legs', 'feet'] as EquipSlot[]) {
      const it = this.eq[slot];
      if (!it) continue;
      const a = ITEM[it.id].armour;
      if (a) p += (a[k] ?? 0);
    }
    const pack = this.eq.back ? ITEM[this.eq.back.id].pack : null;
    if (pack && (k === 'dex' || k === 'martial')) p += pack.combat;
    return p;
  }
  acidProtection() {
    let p = 0;
    for (const slot of ['head', 'body'] as EquipSlot[]) {
      const it = this.eq[slot];
      if (it) p += ITEM[it.id].armour?.acid ?? 0;
    }
    return Math.min(1, p) * (this.robot ? 0.5 : 1) + (this.robot ? 0.5 : 0);
  }

  carryWeight(): number {
    let w = this.inv.weight();
    for (const slot of EQUIP_SLOTS) {
      const it = this.eq[slot];
      if (!it) continue;
      const d = ITEM[it.id];
      w += d.weight * (slot === 'body' || slot === 'head' || slot === 'legs' || slot === 'feet' || slot === 'shirt' ? 0.5 : 1);
      if (it.inv) w += it.inv.weight() * (d.pack?.lighten ?? 1);
    }
    return w;
  }
  capacity() { return 22 + this.skill('strength') * 1.1; }
  load() { return this.carryWeight() / this.capacity(); }

  /** Metres per second for the current movement mode. */
  moveSpeed(mode: MoveMode = this.move): number {
    const race = this.raceDef?.speed ?? 1;
    if (this.animal) {
      const a = ANIMAL[this.animal];
      return (mode === 'walk' ? a.walk : a.run) * (0.6 + 0.4 * this.legFactor());
    }
    let s: number;
    if (this.swim) s = 0.9 + this.skill('swimming') * 0.03;
    else if (mode === 'walk') s = 1.75;
    else if (mode === 'sneak') s = 1.1 + this.skill('stealth') * 0.013;
    else s = 3.8 + this.skill('athletics') * 0.036;
    const ld = this.load();
    const enc = ld <= 1 ? 1 : ld < 2 ? 1 - (ld - 1) * 0.5 : 0.35;
    const armour = 1 - this.armourPenalty('athletics');
    const carry = this.carrying ? 0.62 : 1;
    const shack = this.shackled ? 0.6 : 1;
    return s * race * enc * armour * carry * shack * this.legFactor();
  }
  legFactor(): number {
    const b = this.body;
    let f = 1;
    for (const l of [5, 6] as const) {
      // a good prosthetic leg is nearly as quick as the one it replaced; a wrecked one drags
      if (!b.has(l)) { f *= b.prostOK(l) ? 0.75 + 0.1 * (ITEM[b.prost[l]!]?.limb?.quality ?? 1) : b.prost[l] ? 0.35 : 0.4; continue; }
      const r = b.hp[l] / b.max[l];
      if (r < 0.5) f *= 0.7 + 0.6 * Math.max(0, r);
      if (r <= 0) f *= b.splint & (1 << l) ? 0.65 : 0.3;
    }
    return f;
  }

  /** Seconds per attack with the current weapon. */
  attackTime(): number {
    const w = this.weaponStats();
    const dex = this.skill('dexterity');
    let speed = w.speed * (0.72 + dex * 0.0055);
    if (!this.animal) {
      const str = this.skill('strength');
      const need = w.weight * 2.2;
      if (str < need) speed *= 0.6 + 0.4 * (str / need);
      speed *= 1 - this.armourPenalty('dex');
      if (w.kind === 'unarmed') speed *= 1 + this.skill('unarmed') * 0.006;
    }
    return Math.max(0.45, 1.25 / speed);
  }

  hasArms() { return this.body.armOK(LI.larm) || this.body.armOK(LI.rarm); }
  canUseWeapon() {
    const w = this.weaponStats();
    if (w.twoHanded) return this.body.armOK(LI.larm) && this.body.armOK(LI.rarm);
    return this.body.armOK(LI.rarm) || this.body.armOK(LI.larm);
  }

  /** Visual description for the renderer, derived from gear. */
  vis(): Vis {
    const v: Vis = {};
    for (const slot of ['shirt', 'body', 'head', 'legs', 'feet', 'back'] as EquipSlot[]) {
      const it = this.eq[slot];
      if (!it) continue;
      const iv = ITEM[it.id].vis;
      if (!iv) continue;
      if (slot === 'body') {
        if (iv.torso) {
          // a coat or robe over a shirt
          v.torso = { ...iv.torso };
        } else Object.assign(v, iv);
      } else if (slot === 'shirt') {
        if (!v.torso) v.torso = iv.torso;
      } else Object.assign(v, iv);
    }
    // a coat worn over armour: shirt shows through as sleeves
    if (this.eq.body && this.eq.shirt) {
      const bv = ITEM[this.eq.body.id].vis;
      if (bv?.armour && ITEM[this.eq.shirt.id].vis?.torso) v.torso = ITEM[this.eq.shirt.id].vis!.torso;
    }
    if (this.shackled) v.shackles = true;
    return v;
  }
  weaponVis(): WeaponVis | null {
    const it = this.eq.weapon;
    if (!it) return null;
    return ITEM[it.id].wvis ?? null;
  }
  rangedVis(): WeaponVis | null {
    const it = this.eq.ranged;
    return it ? ITEM[it.id].wvis ?? null : null;
  }

  /** Overall combat rating, for AI decisions and squad strength. */
  power(): number {
    if (this.animal) return ANIMAL[this.animal].power * (0.5 + 0.5 * this.body.total());
    const w = this.weaponStats();
    const att = this.skill('melee_atk') + this.skill(w.skill) * 0.8 + this.skill('strength') * 0.3;
    const def = this.skill('melee_def') + this.skill('toughness') * 0.6;
    const [ac] = this.armourAt(1);
    return (att + def) * (1 + ac) * (0.4 + 0.6 * this.body.total()) * (w.cut + w.blunt) / 40 + 5;
  }

  displayName() {
    return this.title ? `${this.name}, ${this.title}` : this.name;
  }
}

export const UNARMED: WeaponStats = {
  kind: 'unarmed', skill: 'unarmed', cut: 0, blunt: 14, reach: 1.0, speed: 1.3, weight: 0, bleed: 0, pierce: 0,
  vsAnimal: 1, vsRobot: 0.6, vsHuman: 1, def: 0,
};

export const SKILL_KEYS = SKILLS;
