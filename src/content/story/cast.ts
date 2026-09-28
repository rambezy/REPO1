// The cast on the map: who is where, doing what, at which point in the story.

import { Actor, Faction } from '../../world/actor';
import { addActor, findActor, removeActor, actors, getMap } from '../../world/world';
import { CHARS } from '../characters';
import { makeBrain, Sched, BrainKind, settleSchedules } from '../../systems/ai';
import { S, flag } from '../../state';
import { item } from '../items';
import { randomLook, Look } from '../../gfx/characters';
import { ANIMAL_LOOKS } from '../../gfx/animals';
import { TILE, RNG } from '../../engine/util';
import { makeCrumb } from '../../systems/companion';
import { enemyLoot } from '../loot';
import { qDone, qActive, qAt } from '../../systems/quests';

type Where = { map: string; x: number; y: number };

/** Position of a named spot on a map (building the map if needed). */
export function at(map: string, spot: string): Where {
  const m = getMap(map);
  const s = m.spawns[spot];
  if (!s) { console.warn('cast: missing spot', map, spot); return { map, x: m.w * 8, y: m.h * 8 }; }
  return { map, x: s.x, y: s.y };
}
export const tile = (map: string, tx: number, ty: number): Where => ({ map, x: tx * TILE + 8, y: ty * TILE + 12 });

function sched(from: number, to: number, w: Where, act: Sched['act'], extra: Partial<Sched> = {}): Sched {
  return { from, to, map: w.map, x: w.x, y: w.y, act, ...extra };
}

export interface CastOpts {
  brain?: BrainKind;
  faction?: Faction;
  hp?: number;
  skill?: number;
  weapon?: string;
  armor?: { slash: number; stab: number; blunt: number };
  merchant?: string;
  essential?: boolean;
  barks?: string[];
  look?: Look;
  name?: string;
  tags?: string[];
}

/** Creates (or updates) a named NPC. */
export function npc(charId: string, where: Where | null, schedule: Sched[] | null, o: CastOpts = {}): Actor | null {
  if (S.deadNpcs[charId]) return null;
  let a = findActor(charId);
  const def = CHARS[charId];
  if (!a) {
    a = new Actor(o.name || def?.name || charId, charId);
    a.charId = charId;
    a.look = o.look || def?.look;
    a.brain = makeBrain(o.brain || 'person');
    a.speed = 46;
    actors.push(a);
  }
  a.faction = o.faction || 'villager';
  a.mem.schedule = schedule || undefined;
  a.mem.merchant = o.merchant;
  a.mem.barks = o.barks;
  a.essential = o.essential ?? true;
  a.mem.skill = o.skill ?? 3;
  if (o.hp) { a.maxHp = o.hp; if (a.hp > o.hp || a.hp === 100) a.hp = o.hp; }
  if (o.weapon) a.combat.weapon = { id: o.weapon, ...item(o.weapon).weapon! };
  if (o.armor) a.combat.armor = { ...o.armor, noise: 0, charisma: 0, weight: 0 };
  for (const t of o.tags || []) a.tags.add(t);
  const saved = S.npcState[charId];
  if (where) { a.mapId = where.map; a.x = where.x; a.y = where.y; }
  else if (saved && saved.map && !schedule) { a.mapId = saved.map as string; a.x = saved.x as number; a.y = saved.y as number; }
  a.hidden = false;
  return a;
}

export function removeNpc(charId: string) {
  const a = findActor(charId);
  if (a) removeActor(a);
}

// ---------- generic people ----------

let genCount = 0;
export function person(map: string, x: number, y: number, o: { role?: string; female?: boolean; child?: boolean; wander?: number; name?: string; schedule?: Sched[]; settlement?: string; seed?: number; job?: string; barks?: string[] } = {}): Actor {
  const seed = o.seed ?? 5000 + genCount++;
  const r = new RNG(seed);
  const female = o.female ?? r.chance(0.5);
  const a = new Actor(o.name || (female ? r.pick(['Anežka', 'Dorota', 'Eliška', 'Kateřina', 'Ludmila', 'Markéta', 'Johana', 'Běta', 'Zdena', 'Magdalena']) : r.pick(['Tonda', 'Honza', 'Vašek', 'Jakub', 'Matouš', 'Petr', 'Ondra', 'Štěpán', 'Martin', 'Bedřich', 'Filip'])), 'gen' + seed);
  a.look = randomLook(seed, { female, role: o.role, child: o.child });
  a.brain = makeBrain(o.role === 'guard' ? 'guard' : 'person');
  a.faction = o.role === 'guard' ? 'guard' : 'villager';
  a.speed = o.child ? 50 : 44;
  a.mem.wander = o.wander ?? 50;
  a.mem.schedule = o.schedule;
  a.mem.settlement = o.settlement;
  a.mem.job = o.job;
  a.mem.barks = o.barks;
  a.tags.add('generic');
  if (o.role === 'guard') {
    a.tags.add('guard');
    a.name = 'Guard';
    a.mem.skill = 5;
    a.maxHp = a.hp = 120;
    a.mem.brave = true;
    a.combat.weapon = { id: 'arming_sword', ...item('arming_sword').weapon! };
    a.combat.armor = { slash: 20, stab: 12, blunt: 8, noise: 2, charisma: 0, weight: 0 };
  }
  addActor(a, map, x, y);
  return a;
}

/** Hostile fighters (bandits, mercenaries). */
export function fighter(map: string, x: number, y: number, kind: 'bandit' | 'merc' | 'merc_heavy' | 'archer' | 'lothar_guard', o: { id?: string; name?: string; hostile?: boolean; skill?: number; tags?: string[]; knows?: string; seed?: number } = {}): Actor {
  const seed = o.seed ?? 7000 + genCount++;
  const a = new Actor(o.name || (kind === 'bandit' ? 'Bandit' : kind === 'lothar_guard' ? 'Raven Guard' : 'Mercenary'), o.id || 'f' + seed);
  a.look = randomLook(seed, { role: kind === 'bandit' ? 'bandit' : 'mercenary' });
  if (kind === 'lothar_guard') { a.look.outer = 'tabard'; a.look.outerColor = '#262220'; a.look.trim = '#6e3a5a'; a.look.hat = 'bascinet'; }
  a.brain = makeBrain(kind === 'archer' ? 'archer' : 'fighter');
  a.faction = kind === 'bandit' ? 'bandit' : kind === 'lothar_guard' ? 'lothar' : 'harrow';
  a.hostile = o.hostile ?? true;
  a.speed = 50;
  const heavy = kind === 'merc_heavy' || kind === 'lothar_guard';
  a.maxHp = a.hp = kind === 'bandit' ? 85 : heavy ? 135 : 110;
  a.mem.skill = o.skill ?? (kind === 'bandit' ? 3 : heavy ? 6 : 4);
  a.mem.courage = kind === 'bandit' ? 0.35 : 0.6;
  const weapons = kind === 'bandit' ? ['club', 'hatchet', 'rusty_sword', 'hunting_knife'] : heavy ? ['longsword', 'mace', 'war_hammer', 'falchion'] : ['arming_sword', 'falchion', 'mace', 'spear'];
  const w = new RNG(seed).pick(weapons);
  a.combat.weapon = { id: w, ...item(w).weapon! };
  if (kind === 'archer') { a.combat.weapon = { id: 'hunting_bow', kind: 'bow', slash: 0, stab: 20, blunt: 0, reach: 150, speed: 1, staminaCost: 5 }; a.mem.arrowDmg = 18; }
  a.combat.armor = kind === 'bandit' ? { slash: 6, stab: 4, blunt: 6, noise: 0, charisma: 0, weight: 0 } : heavy ? { slash: 24, stab: 18, blunt: 12, noise: 3, charisma: 0, weight: 0 } : { slash: 16, stab: 10, blunt: 8, noise: 2, charisma: 0, weight: 0 };
  const loot = enemyLoot(kind === 'bandit' ? 'bandit' : 'soldier', a.id);
  a.mem.loot = [{ id: w, n: 1, cond: 70 }, ...loot.items];
  a.mem.coins = loot.coins;
  a.mem.knows = o.knows;
  for (const t of o.tags || []) a.tags.add(t);
  a.tags.add(kind);
  addActor(a, map, x, y);
  return a;
}

export function animal(map: string, x: number, y: number, look: keyof typeof ANIMAL_LOOKS, o: { id?: string; hostile?: boolean; wander?: number } = {}): Actor {
  const lk = ANIMAL_LOOKS[look];
  const a = new Actor(({ deer: 'Deer', stag: 'Stag', wolf: 'Wolf', boar: 'Boar', hare: 'Hare', fox: 'Fox', chicken: 'Hen', chicken_brown: 'Hen', goose: 'Goose', cow: 'Cow', sheep: 'Sheep', horse_brown: 'Horse', horse_black: 'Horse', horse_grey: 'Horse', guarddog: 'Hound', crumb: 'Crumb' } as Record<string, string>)[look] || look, o.id);
  a.animal = lk;
  const sp = lk.species;
  a.brain = makeBrain(sp === 'wolf' ? 'predator' : sp === 'boar' ? 'boar' : sp === 'goose' ? 'goose' : sp === 'dog' ? 'fighter' : (sp === 'deer' || sp === 'hare' || sp === 'fox') ? 'prey' : 'critter');
  a.faction = sp === 'wolf' ? 'predator' : 'animal';
  a.hostile = o.hostile ?? sp === 'wolf';
  a.mem.wander = o.wander ?? 60;
  a.hitW = sp === 'horse' || sp === 'cow' ? 20 : sp === 'hare' || sp === 'chicken' || sp === 'goose' ? 6 : 12;
  a.speed = sp === 'hare' ? 70 : sp === 'deer' ? 64 : sp === 'wolf' ? 62 : sp === 'boar' ? 54 : sp === 'chicken' ? 36 : 40;
  a.maxHp = a.hp = sp === 'wolf' ? 60 : sp === 'boar' ? 120 : sp === 'deer' ? 55 : sp === 'hare' ? 12 : sp === 'goose' ? 25 : sp === 'chicken' ? 10 : 80;
  a.mem.skill = sp === 'wolf' ? 4 : 3;
  a.mem.fear = sp === 'deer' ? 110 : sp === 'hare' ? 70 : 50;
  const bite = sp === 'wolf' ? 14 : sp === 'boar' ? 22 : sp === 'goose' ? 2 : 6;
  a.combat.weapon = { id: 'bite', kind: 'fist', slash: sp === 'boar' ? 0 : bite, stab: 0, blunt: sp === 'boar' ? bite : 0, reach: sp === 'boar' ? 16 : 14, speed: 1, staminaCost: 5 };
  a.tags.add(sp);
  addActor(a, map, x, y);
  return a;
}

// ---------- the world's population per act ----------

const ACT = () => (flag('act') || 0) as number;

export function spawnCast() {
  // remove previous generic population, keep named actors (they are reconfigured below)
  for (const a of [...actors]) if (a.tags.has('generic') || a.tags.has('wild')) removeActor(a);
  if (ACT() === 0) spawnPrologue();
  else spawnActs();
  if (S.dog.owned) {
    const c = makeCrumb();
    if (!actors.includes(c)) addActor(c, S.dog.map || S.mapId, S.dog.x ?? S.px, S.dog.y ?? S.py);
  }
  settleSchedules();
}

function spawnPrologue() {
  const HB = 'overworld';
  const home = (s: string) => at('hb_home', s);
  const feast = (dx: number, dy: number) => tile(HB, 37 + dx, 104 + dy);
  npc('radek', null, [
    sched(5, 7, home('hearth'), 'stand'),
    sched(7, 19, at(HB, 'anvil_spot'), 'work', { dir: 3 }),
    sched(19, 23, feast(-3, 2), 'stand', { dir: 2 }),
    sched(23, 5, home('bed_radek'), 'sleep'),
  ]);
  npc('marta', null, [
    sched(4.5, 11, home('oven'), 'work', { dir: 3 }),
    sched(11, 14, home('table_n'), 'stand'),
    sched(14, 19, tile(HB, 43, 101), 'wander', { r: 30 }),
    sched(19, 23, feast(-2, 2), 'stand', { dir: 2 }),
    sched(23, 4.5, home('bed_marta'), 'sleep'),
  ]);
  npc('lida', null, [
    sched(7.5, 19, tile(HB, 40, 102), 'wander', { r: 60 }),
    sched(19, 22, feast(-1, 3), 'stand', { dir: 3 }),
    sched(22, 7.5, home('bed_lida'), 'sleep'),
  ]);
  npc('pavel', null, [
    sched(6, 19, tile(HB, 24, 88), 'wander', { r: 28 }),
    sched(19, 23.5, feast(2, 2), 'stand', { dir: 1 }),
    sched(23.5, 6, at('hb_mill', 'bed'), 'sleep'),
  ]);
  npc('hanka', null, [
    sched(6, 12, tile(HB, 30, 110), 'wander', { r: 40 }),
    sched(12, 19, at('hb_hanka', 'table'), 'stand'),
    sched(19, 23, feast(3, 0), 'stand', { dir: 1 }),
    sched(23, 6, at('hb_hanka', 'bed'), 'sleep'),
  ]);
  npc('havel', null, [
    sched(8, 19, tile(HB, 35, 99), 'sit', { dir: 0 }),
    sched(19, 22, feast(0, -2), 'sit', { dir: 0 }),
    sched(22, 8, at('hb_havel', 'bed'), 'sleep'),
  ]);
  npc('jiri', null, [
    sched(8, 12, at('hb_jiri', 'desk'), 'sit', { dir: 0 }),
    sched(12, 19, tile(HB, 44, 99), 'wander', { r: 40 }),
    sched(19, 23, feast(1, -2), 'stand', { dir: 0 }),
    sched(23, 8, at('hb_jiri', 'bed'), 'sleep'),
  ]);
  npc('vojta', null, [
    sched(9, 19, at('hb_tavern', 'seat1'), 'drink'),
    sched(19, 23.5, feast(4, 1), 'stand', { dir: 1 }),
    sched(23.5, 9, at('hb_vojta', 'bed'), 'sleep'),
  ], { merchant: undefined });
  npc('bara', null, [
    sched(7, 19, tile(HB, 57, 108), 'wander', { r: 30 }),
    sched(19, 22, feast(-4, 0), 'stand', { dir: 2 }),
    sched(22, 7, at('hb_bara', 'bed'), 'sleep'),
  ]);
  npc('marek', null, [
    sched(7.5, 19, tile(HB, 40, 102), 'wander', { r: 60 }),
    sched(19, 22, feast(0, 3), 'stand', { dir: 3 }),
    sched(22, 7.5, at('hb_bara', 'wheel'), 'sleep'),
  ]);
  npc('tobiah', null, [
    sched(11, 19, at('hb_chapel', 'altar'), 'pray'),
    sched(19, 23, feast(1, 1), 'stand', { dir: 1 }),
    sched(23, 11, at('hb_chapel', 'pew'), 'sleep'),
  ]);
  npc('miller', null, [
    sched(5, 20, at('hb_mill', 'stone'), 'work'),
    sched(20, 23, feast(3, 2), 'stand', { dir: 1 }),
    sched(23, 5, at('hb_mill', 'bed'), 'sleep'),
  ], { name: 'Mikuláš' });
  // villagers in the fields
  const fields: [number, number][] = [[60, 90], [64, 106], [36, 114], [48, 114]];
  fields.forEach(([x, y], i) => person(HB, x * TILE, y * TILE, { seed: 300 + i, wander: 40, settlement: 'hollowbrook', job: 'I work the lord\'s strips, and my own when there\'s light left.', schedule: [
    sched(6, 19, tile(HB, x, y), 'wander', { r: 50 }),
    sched(19, 23, feast(-6 + i * 3, i % 2 ? -3 : 4), 'stand'),
    sched(23, 6, tile(HB, x, y), 'hide'),
  ] }));
  // animals
  for (let i = 0; i < 4; i++) animal(HB, (59 + i) * TILE, 113 * TILE, 'chicken', { wander: 30 });
  for (let i = 0; i < 5; i++) { const g = animal(HB, (61 + i) * TILE, 113 * TILE, 'goose', { id: 'goose' + i, wander: 26 }); g.tags.add('wild'); }
  animal(HB, 66 * TILE, 92 * TILE, 'cow', { wander: 40 });
  animal(HB, 69 * TILE, 95 * TILE, 'sheep', { wander: 40 });
  animal(HB, 70 * TILE, 97 * TILE, 'sheep', { wander: 40 });
  const crumb = makeCrumb();
  crumb.mem.follow = null;
  crumb.brain = makeBrain('critter');
  crumb.mem.wander = 70;
  crumb.mem.fear = 0;
  addActor(crumb, HB, 49 * TILE, 99 * TILE);
}

function spawnActs() {
  const act = ACT();
  const OWm = 'overworld';
  const L = (s: string) => at(OWm, s);
  // ---------- Linden Hill ----------
  npc('bertram', null, bertramSchedule(), { faction: 'town', barks: ['Walk with God.', 'Keep your eyes open, lad.'] });
  npc('lukas', null, [sched(7, 20, at('lh_keep', 'steward'), 'stand'), sched(20, 7, at('lh_keep', 'table'), 'sleep')], { faction: 'town' });
  npc('ondrej', null, [
    sched(6, 19, L('ondrej_yard'), 'stand', { dir: 0 }),
    sched(19, 23, at('lh_tavern', 'seat5'), 'drink'),
    sched(23, 6, at('lh_barracks', 'bunk'), 'sleep'),
  ], { faction: 'guard', skill: 8, weapon: 'arming_sword', barks: ['Chin up! Shoulders down!', 'Again!', 'My grandmother blocks better than that, and she\'s dead.'] });
  npc('kovar', null, [
    sched(6, 19, at('lh_smithy', 'anvil'), 'work', { dir: 3 }),
    sched(19, 22, at('lh_tavern', 'seat3'), 'drink'),
    sched(22, 6, at('lh_smithy', 'bed'), 'sleep'),
  ], { merchant: 'smith', faction: 'town' });
  npc('dorota', null, [sched(6, 24, at('lh_tavern', 'bar'), 'stand', { dir: 0 }), sched(0, 6, at('lh_tavern', 'dorota_bed'), 'sleep')], { merchant: 'inn', faction: 'town' });
  npc('greta', null, [sched(4, 18, at('lh_bakery', 'counter'), 'stand'), sched(18, 4, at('lh_bakery', 'bed'), 'sleep')], { merchant: 'bakery', faction: 'town' });
  npc('aurelius', null, [sched(8, 20, at('lh_apothecary', 'counter'), 'stand'), sched(20, 8, at('lh_apothecary', 'bench'), 'sit')], { merchant: 'apothecary', faction: 'town' });
  npc('florian', null, [sched(6, 21, at('lh_church', 'lectern'), 'stand'), sched(21, 6, at('lh_church', 'altar'), 'pray')], { faction: 'town' });
  npc('zbynek', null, [sched(7, 19, at('lh_tannery', 'work'), 'work'), sched(19, 23, at('lh_tavern', 'seat4'), 'drink'), sched(23, 7, at('lh_tannery', 'work'), 'sleep')], { merchant: 'tanner', faction: 'town' });
  npc('barber', null, [sched(0, 24, at('lh_bath', 'keeper'), 'stand')], { faction: 'town' });
  npc('wenceslas', null, [sched(15, 2, at('lh_tavern', 'dice_opp'), 'sit'), sched(2, 15, L('market'), 'wander', { r: 60 })], { faction: 'town', name: 'Lucky Venca' });
  if (!qDone('side_miko') || flag('miko_adopted') !== true) {
    npc('miko', null, [sched(6, 21, L('market'), 'wander', { r: 90 }), sched(21, 6, flag('miko_home') ? at('lh_tavern', 'fire') : L('market'), flag('miko_home') ? 'sleep' : 'hide')], { faction: 'town' });
  }
  if (act >= 1) {
    const pavelAway = qAt('main_pavel', 'captured', 'rescue', 'search') || flag('pavel_prisoner');
    if (!pavelAway && !S.deadNpcs.pavel) npc('pavel', null, [
      sched(6, 18, L('yard'), 'wander', { r: 30 }),
      sched(18, 23, at('lh_tavern', 'seat2'), 'drink'),
      sched(23, 6, at('lh_barracks', 'table'), 'sleep'),
    ], { faction: 'town', weapon: 'arming_sword', skill: 4 });
    else removeNpc('pavel');
  }
  // Brother Tobiah: at the church in act 1, then home at the priory
  if (act <= 1) npc('tobiah', null, [sched(8, 20, at('lh_church', 'pew1'), 'sit'), sched(20, 8, at('lh_church', 'pew2'), 'sleep')], { merchant: undefined });
  else npc('tobiah', null, [sched(7, 13, L('hives'), 'wander', { r: 30 }), sched(13, 20, at('pr_library', 'desk2'), 'sit'), sched(20, 7, at('pr_dorm', 'tobiah_bed'), 'sleep')], { merchant: 'priory' });
  // Mother
  if (!S.deadNpcs.marta && flag('mother_found')) {
    if (flag('mother_cured')) npc('marta', null, [sched(4, 17, at('lh_bakery', 'marta_oven'), 'work', { dir: 3 }), sched(17, 21, at('lh_tavern', 'seat6'), 'sit'), sched(21, 4, at('lh_tavern', 'room'), 'sleep')], { merchant: 'mother_bread', faction: 'town' });
    else npc('marta', at('camp_tent', 'marta_bed'), null, {});
  } else if (!S.deadNpcs.marta && !flag('mother_found')) {
    npc('marta', at('camp_tent', 'marta_bed'), null, {});
  }
  const mart = findActor('marta');
  if (mart && !flag('mother_cured')) { mart.pose = 'lie'; mart.mem.hold = true; }

  // guards
  const gs: [string, number][] = [['gate_guard_s1', 0], ['gate_guard_s2', 0], ['gate_guard_n', 3], ['gate_guard_e', 2]];
  gs.forEach(([sp, dir], i) => {
    const p = L(sp);
    const g = person(OWm, p.x, p.y, { role: 'guard', seed: 900 + i, settlement: 'linden', schedule: [sched(0, 24, p, 'guard', { dir })] });
    g.mem.faceDir = dir;
  });
  const pts = [[100, 60], [120, 60], [120, 76], [100, 76]].map(([x, y]) => ({ x: x * TILE, y: y * TILE }));
  for (let i = 0; i < 2; i++) { const g = person(OWm, pts[i * 2].x, pts[i * 2].y, { role: 'guard', seed: 920 + i, settlement: 'linden' }); g.mem.patrol = i ? [...pts].reverse() : pts; g.mem.wander = 0; }
  // townsfolk
  const homes = ['lh_house1', 'lh_house2', 'lh_house3', 'lh_house4'];
  for (let i = 0; i < 10; i++) {
    const home = homes[i % 4];
    const day = tile(OWm, 100 + (i * 7) % 20, 62 + (i * 5) % 14);
    person(OWm, day.x, day.y, { seed: 1000 + i, settlement: 'linden', schedule: [
      sched(7, 20, day, 'wander', { r: 70 }),
      sched(20, 23, at('lh_tavern', `seat${1 + (i % 4)}`), 'drink'),
      sched(23, 7, at(home, i < 4 ? 'bed' : 'table'), i < 4 ? 'sleep' : 'sit'),
    ] });
  }
  for (let i = 0; i < 3; i++) person(OWm, (104 + i * 6) * TILE, 70 * TILE, { seed: 1100 + i, child: true, wander: 60, settlement: 'linden' });
  // market stall keepers
  ['stall1', 'stall2', 'stall3'].forEach((s, i) => {
    const p = L(s);
    const a = person(OWm, p.x, p.y, { seed: 1200 + i, settlement: 'linden', schedule: [sched(7, 18, p, 'stand', { dir: 0 }), sched(18, 7, at('lh_tavern', 'seat' + (i + 1)), 'drink')] });
    a.mem.merchant = ['butcher', 'tailor', 'armorer'][i];
    a.name = ['Butcher', 'Cloth Seller', 'Armourer'][i];
  });

  // ---------- refugee camp ----------
  const C = (dx: number, dy: number) => tile(OWm, 122 + dx, 131 + dy);
  if (!flag('refugees_moved')) {
    npc('jiri', C(-1, 2), [sched(0, 24, C(-1, 2), 'sit')], { faction: 'villager', barks: ['...'] });
    npc('marek', C(2, 1), [sched(7, 21, C(0, 1), 'wander', { r: 40 }), sched(21, 7, C(-3, 2), 'sleep')], {});
    npc('bara', C(4, 0), [sched(0, 24, C(5, 1), 'wander', { r: 20 })], {});
    for (let i = 0; i < 4; i++) person(OWm, C(-5 + i * 3, -1).x, C(0, -1).y, { seed: 1300 + i, wander: 40, settlement: 'refugees', job: 'I had a farm on the pass road. I have a blanket now.' });
    const bc = person(OWm, C(6, 4).x, C(6, 4).y, { seed: 1310, settlement: 'refugees', name: 'Old Anka' });
    bc.mem.merchant = 'refugees';
  }

  // ---------- forest ----------
  npc('wenda', null, [sched(6, 21, at('wenda_hut', 'cauldron'), 'work'), sched(21, 6, at('wenda_hut', 'bed'), 'sleep')], { merchant: 'wenda', faction: 'villager' });
  if (!flag('hanka_moved')) npc('hanka', null, [sched(6, 20, act >= 1 ? tile(OWm, 63, 152) : tile(OWm, 63, 152), 'wander', { r: 50 }), sched(20, 6, at('wenda_hut', 'hanka'), 'sleep')], { faction: 'villager' });
  else npc('hanka', null, [sched(6, 18, at('lh_apothecary', 'bench'), 'work'), sched(18, 22, at('lh_tavern', 'seat6'), 'sit'), sched(22, 6, at('lh_tavern', 'room'), 'sleep')], { faction: 'town' });
  npc('matej', null, [sched(6, 19, L('lodge'), 'wander', { r: 40 }), sched(19, 6, at('lodge', 'bed'), 'sleep')], { merchant: 'hunter', faction: 'villager' });
  npc('tomas_burner', null, [sched(0, 24, L('burners'), 'work')], { faction: 'villager', merchant: undefined });
  if (qDone('side_charcoal')) npc('vit', null, [sched(6, 20, L('burners'), 'wander', { r: 30 }), sched(20, 6, at('burner_hut', 'table'), 'sleep')], {});

  // ---------- priory ----------
  npc('gregor', null, [sched(6, 12, at('pr_church', 'altar'), 'pray'), sched(12, 21, at('pr_abbot', 'desk'), 'sit'), sched(21, 6, at('pr_abbot', 'desk'), 'sleep')], { faction: 'villager' });
  npc('anselm', null, [sched(6, 22, at('pr_library', 'desk'), 'sit'), sched(22, 6, at('pr_dorm', 'table'), 'sleep')], { faction: 'villager' });
  for (let i = 0; i < 3; i++) person(OWm, L('cloister').x + i * 20, L('cloister').y, { role: 'monk', seed: 1400 + i, wander: 60, settlement: 'priory', name: ['Brother Pavel', 'Brother Jan', 'Brother Bonifác'][i], job: 'I copy books, and I pray, and some days I do not know which is harder.' });

  // ---------- Silverdale ----------
  npc('vilem', null, [sched(8, 20, at('sd_foreman', 'desk'), 'sit'), sched(20, 8, at('sd_foreman', 'bed'), 'sleep')], { faction: 'villager', essential: false, hp: 90 });
  npc('kuba', null, [sched(6, 19, L('mine_mouth'), 'wander', { r: 30 }), sched(19, 6, L('square'), 'wander', { r: 30 })], { faction: 'villager' });
  npc('anna', null, [sched(6, 20, at('sd_anna', 'table'), 'stand'), sched(20, 6, at('sd_anna', 'bed'), 'sleep')], { faction: 'villager' });
  npc('storekeep', null, [sched(0, 24, at('sd_store', 'counter'), 'stand')], { merchant: 'silverdale_store', faction: 'villager' });
  for (let i = 0; i < 4; i++) person(OWm, L('mine_mouth').x + i * 18, L('mine_mouth').y + 20, { role: 'miner', seed: 1500 + i, wander: 50, settlement: 'silverdale', job: 'I dig silver for the king, and the king pays me in promises.' });

  // ---------- the Company ----------
  if (!flag('warcamp_broken')) {
    const W = (dx: number, dy: number) => tile(OWm, 158 + dx, 38 + dy);
    npc('ilse', null, [sched(5, 21, at('ilse_tent', 'pot'), 'work'), sched(21, 5, at('ilse_tent', 'table'), 'sleep')], { faction: 'harrow', essential: true });
    if (!flag('harrow_left') && act < 3) npc('harrow', W(16, 8), [sched(0, 24, W(16, 9), 'stand', { dir: 0 })], { faction: 'harrow', skill: 8, hp: 200, weapon: 'longsword', armor: { slash: 28, stab: 22, blunt: 14 } });
    for (let i = 0; i < 6; i++) {
      const m = fighter(OWm, W(3 + (i % 3) * 5, 5 + Math.floor(i / 3) * 6).x, W(0, 5 + Math.floor(i / 3) * 6).y, i === 5 ? 'archer' : 'merc', { hostile: false, seed: 1600 + i, tags: ['camp'] });
      m.mem.wander = 60;
      m.mem.watch = true;
      m.tags.add('guard');
      m.faction = 'harrow';
    }
  }
  // ---------- wildlife ----------
  spawnWildlife();
}

export function bertramSchedule(): Sched[] {
  return [
    sched(7, 12, at('lh_keep', 'throne'), 'sit', { dir: 0 }),
    sched(12, 14, at('lh_keep', 'table'), 'eat'),
    sched(14, 18, at('overworld', 'castle_yard'), 'wander', { r: 50 }),
    sched(18, 22, at('lh_keep', 'fire'), 'stand'),
    sched(22, 7, at('lh_keep', 'bed'), 'sleep'),
  ];
}

export function spawnWildlife() {
  const OWm = 'overworld';
  const herds: [number, number, keyof typeof ANIMAL_LOOKS, number][] = [
    [70, 150, 'deer', 3], [120, 162, 'deer', 2], [40, 140, 'hare', 3], [200, 70, 'deer', 3], [90, 60, 'hare', 2], [175, 130, 'boar', 2], [20, 130, 'boar', 1],
    [140, 110, 'hare', 2], [205, 150, 'stag', 1], [60, 45, 'fox', 1], [215, 60, 'boar', 1],
  ];
  herds.forEach(([x, y, kind, n], hi) => {
    for (let i = 0; i < n; i++) { const a = animal(OWm, (x + i * 2) * TILE, (y + (i % 2) * 2) * TILE, kind, { wander: 90 }); a.tags.add('wild'); a.id = `wild_${hi}_${i}`; }
  });
  if (!qDone('side_wolves')) {
    for (let i = 0; i < 4; i++) { const w = animal(OWm, (148 + i * 2) * TILE, (166 + (i % 2)) * TILE, 'wolf', { wander: 70, id: 'denwolf' + i }); w.tags.add('wild'); w.tags.add('denwolf'); w.mem.aggroRange = 130; }
  }
  for (let i = 0; i < 3; i++) { const w = animal(OWm, (30 + i * 3) * TILE, (150 + i) * TILE, 'wolf', { wander: 80, id: 'wwolf' + i }); w.tags.add('wild'); w.mem.aggroRange = 110; }
}

export { qActive };
