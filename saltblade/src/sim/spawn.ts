// Making people and beasts: appearance, skills scaled to a level, and gear.
import { Char, Role } from './char';
import { World } from './world';
import { RNG } from '../core/rng';
import { RACE } from '../content/races';
import { FACTION } from '../content/factions';
import { LOADOUTS, loadoutFor } from '../content/loadouts';
import { ITEM, slotFor } from '../content/items';
import { ANIMAL } from '../content/animals';
import { personName, titleFor } from '../content/names';
import { SK, SKILLS, Skill } from './skills';
import { makeItem, Item } from './inventory';
import type { Look } from './look';

const FIGHTERS = new Set<Role>(['guard', 'patrol', 'bandit', 'merc', 'boss', 'slaver', 'hunter', 'construct']);

export function randomLook(race: string, rng: RNG, female?: boolean): Look {
  const r = RACE[race];
  const fem = female ?? (r.race === 'human' ? rng.chance(0.42) : r.race === 'karuk' ? rng.chance(0.4) : false);
  const h = rng.range(r.height[0], r.height[1]) * (fem && r.race === 'human' ? 0.95 : 1);
  return {
    race,
    female: fem,
    height: h,
    bulk: rng.range(r.bulk[0], r.bulk[1]),
    skin: rng.pick(r.skin),
    hair: rng.pick(r.hair),
    hairStyle: r.race === 'human' ? (fem ? rng.pick([1, 2, 2, 3, 3, 5, 8, 7]) : rng.pick([0, 1, 1, 1, 4, 5, 6, 7, 3])) : r.race === 'karuk' ? rng.pick([0, 0, 1, 5, 8, 2]) : 0,
    beard: r.race === 'human' && !fem ? rng.pick([0, 0, 1, 1, 2, 3, 4]) : r.race === 'karuk' && !fem ? rng.pick([0, 2, 3]) : 0,
    face: rng.int(0, 3),
    paint: r.race === 'karuk' && rng.chance(0.4) ? rng.pick([0xa83a2a, 0xe8e0d0, 0x2a2a2a]) : 0,
    scars: rng.chance(0.25) ? 1 : 0,
  };
}

/** Sets skills around a level, emphasising what the role does. */
export function setSkills(c: Char, level: number, role: Role, rng: RNG) {
  const fighter = FIGHTERS.has(role);
  const r = RACE[c.look.race];
  for (const s of SKILLS) {
    let v: number;
    const combat = ['melee_atk', 'melee_def', 'strength', 'toughness', 'dexterity'].includes(s);
    if (fighter) v = combat ? level : s === 'athletics' ? level * 0.7 : s === 'dodge' ? level * 0.5 : s === 'perception' ? level * 0.6 : level * 0.2;
    else v = combat ? level * 0.55 : s === 'athletics' ? level * 0.6 : ['farming', 'labouring', 'cooking'].includes(s) ? level * 0.9 : level * 0.3;
    v *= rng.range(0.75, 1.2);
    v += r?.start[s] ?? 0;
    c.sk[SK[s]] = Math.max(1, Math.min(100, v));
  }
}

export function equip(c: Char, it: Item) {
  const d = ITEM[it.id];
  const slot = slotFor(d);
  if (!slot) return false;
  if (slot === 'head' && !RACE[c.look.race]?.helmets) return false;
  if (slot === 'feet' && !RACE[c.look.race]?.boots) return false;
  c.eq[slot] = it;
  c.dirty = true;
  return true;
}

export function giveLoadout(c: Char, key: string, rng: RNG) {
  const L = LOADOUTS[key];
  if (!L) return;
  const [g0, g1] = L.grade ?? [2, 2];
  const pick = (arr?: string[]) => (arr && arr.length ? rng.pick(arr) : '');
  const put = (id: string, graded = true) => {
    if (!id || !ITEM[id]) return;
    const q = graded ? rng.int(g0, g1) : rng.int(1, 3);
    equip(c, makeItem(id, 1, q));
  };
  put(pick(L.weapon));
  put(pick(L.ranged));
  put(pick(L.body), false);
  put(pick(L.shirt), false);
  put(pick(L.head), false);
  put(pick(L.legs), false);
  put(pick(L.feet), false);
  put(pick(L.back), false);
  for (const [id, a, b] of L.items ?? []) {
    const n = rng.int(a, b);
    if (n > 0 && ITEM[id]) {
      const left = c.inv.add(id, n);
      if (left && c.eq.back?.inv) c.eq.back.inv.add(id, left);
    }
  }
  if (L.money) c.money = rng.int(L.money[0], L.money[1]);
  // weapon skill to match the weapon
  const w = c.weaponStats();
  c.sk[SK[w.skill]] = Math.max(c.sk[SK[w.skill]], c.sk[SK.melee_atk] * rng.range(0.8, 1.1));
  if (c.eq.ranged) c.sk[SK.crossbows] = Math.max(c.sk[SK.crossbows], c.sk[SK.melee_atk] * 0.9);
}

export interface PersonOpts {
  faction: string;
  role: Role;
  race?: string;
  female?: boolean;
  level?: number;
  loadout?: string;
  name?: string;
}

export function makePerson(W: World, o: PersonOpts, rng: RNG): Char {
  const f = FACTION[o.faction];
  const race = o.race ?? (f?.races.length ? rng.weighted(f.races) : 'valefolk');
  const look = randomLook(race, rng, o.female);
  const c = new Char(look);
  c.faction = o.faction;
  c.role = o.role;
  c.name = o.name ?? personName(race, look.female, rng);
  c.title = titleFor(o.role, o.faction);
  const key = o.loadout ?? loadoutFor(o.faction, o.role);
  const lvl = o.level ?? (LOADOUTS[key]?.level ? rng.range(LOADOUTS[key].level![0], LOADOUTS[key].level![1]) : 10);
  setSkills(c, lvl, o.role, rng);
  c.body.init(race, c.sk[SK.toughness]);
  giveLoadout(c, key, rng);
  if (o.role === 'slave') c.shackled = true;
  c.hunger = rng.range(160, 280);
  if (RACE[race].hunger === 0) c.hunger = 300;
  W.addChar(c);
  return c;
}

export function makeAnimal(W: World, species: string, rng: RNG, level = 1): Char {
  const a = ANIMAL[species];
  const look: Look = { race: 'valefolk', female: false, height: a.size, bulk: rng.range(0.9, 1.1), skin: a.colors[0], hair: a.colors[1], hairStyle: 0, beard: 0, face: rng.int(0, 3), paint: 0, scars: 0 };
  const c = new Char(look);
  c.animal = species;
  c.faction = 'fauna';
  c.role = 'animal';
  c.name = a.name;
  const sc = rng.range(0.85, 1.2) * level;
  for (const s of SKILLS) c.sk[SK[s]] = 1;
  for (const [s, v] of Object.entries(a.skills)) c.sk[SK[s as Skill]] = Math.max(1, v * sc);
  c.sk[SK.athletics] = 20;
  c.body.init('valefolk', c.sk[SK.toughness]);
  for (let i = 0; i < 7; i++) { c.body.max[i] = Math.round(c.body.max[i] * a.hp); c.body.hp[i] = c.body.max[i]; }
  c.body.bloodMax = Math.round(100 * a.hp);
  c.body.blood = c.body.bloodMax;
  c.body.robotic = !!a.robot;
  for (const [id, lo, hi] of a.loot) {
    const n = rng.int(lo, hi);
    if (n > 0) c.inv.add(id, n);
  }
  c.hunger = 300;
  W.addChar(c);
  return c;
}
