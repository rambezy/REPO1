// The cast on the map: who is where, doing what, at which point in the story.
// spawnCast() rebuilds the population from the story state; chapters add
// their own situational actors through castHooks.

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
import { qDone, qActive, qAt, qStage } from '../../systems/quests';
import { G } from '../../G';

export type Where = { map: string; x: number; y: number };

/** Position of a named spot on a map (building the map if needed). */
export function at(map: string, spot: string): Where {
  const m = getMap(map);
  const s = m.spawns[spot];
  if (!s) { console.warn('cast: missing spot', map, spot); return { map, x: m.w * 8, y: m.h * 8 }; }
  return { map, x: s.x, y: s.y };
}
export const tile = (map: string, tx: number, ty: number): Where => ({ map, x: tx * TILE + 8, y: ty * TILE + 12 });
export const OW = (tx: number, ty: number) => tile('overworld', tx, ty);

export function sched(from: number, to: number, w: Where, act: Sched['act'], extra: Partial<Sched> = {}): Sched {
  return { from, to, map: w.map, x: w.x, y: w.y, act, ...extra };
}
/** A schedule that keeps someone in one place all day. */
export const always = (w: Where, act: Sched['act'], extra: Partial<Sched> = {}): Sched[] => [sched(0, 24, w, act, extra)];

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
  gossip?: boolean;
}

let keep = new Set<Actor>();

/** Creates (or reconfigures) a named NPC. Dead characters stay dead. */
export function npc(charId: string, where: Where | null, schedule: Sched[] | null, o: CastOpts = {}): Actor | null {
  if (S.deadNpcs[charId]) return null;
  let a = findActor(charId);
  const def = CHARS[charId];
  const saved = S.npcState[charId];
  if (!a) {
    a = new Actor(o.name || def?.name || charId, charId);
    a.charId = charId;
    a.look = o.look || def?.look;
    a.speed = 46;
    const w = where || (schedule && schedule.length ? { map: schedule[0].map, x: schedule[0].x, y: schedule[0].y } : null)
      || (saved?.map ? { map: saved.map as string, x: saved.x as number, y: saved.y as number } : null) || tile('overworld', 1, 1);
    addActor(a, w.map, w.x, w.y);
  }
  if (o.name) a.name = o.name;
  a.brain = makeBrain(o.brain || 'person');
  a.faction = o.faction || 'villager';
  a.mem.schedule = schedule || undefined;
  a.mem.merchant = o.merchant;
  a.mem.barks = o.barks;
  a.mem.gossip = o.gossip;
  a.mem.hold = false;
  a.hostile = false;
  a.essential = o.essential ?? true;
  a.mem.skill = o.skill ?? 3;
  if (o.hp) { a.maxHp = o.hp; a.hp = Math.min(Math.max(a.hp, 1), o.hp); if (a.hp < o.hp * 0.5) a.hp = o.hp; }
  if (o.weapon) a.combat.weapon = { id: o.weapon, ...item(o.weapon).weapon! };
  if (o.armor) a.combat.armor = { ...o.armor, noise: 0, charisma: 0, weight: 0 };
  for (const t of o.tags || []) a.tags.add(t);
  if (where) { a.mapId = where.map; a.x = where.x; a.y = where.y; a.mem.path = null; }
  else if (!schedule && saved?.map) { a.mapId = saved.map as string; a.x = saved.x as number; a.y = saved.y as number; }
  if (a.mem.down && !a.dead) { a.mem.down = false; a.pose = 'idle'; a.hp = Math.max(a.hp, a.maxHp * 0.5); }
  a.hidden = false;
  a.dead = false;
  keep.add(a);
  return a;
}

export function removeNpc(charId: string) {
  const a = findActor(charId);
  if (a) removeActor(a);
}

// ---------- generic people ----------

let genCount = 0;
export interface PersonOpts { role?: string; female?: boolean; child?: boolean; old?: boolean; wander?: number; name?: string; schedule?: Sched[]; settlement?: string; seed?: number; job?: string; barks?: string[]; id?: string; tags?: string[] }
export function person(map: string, x: number, y: number, o: PersonOpts = {}): Actor {
  const seed = o.seed ?? 5000 + genCount++;
  const r = new RNG(seed);
  const female = o.female ?? r.chance(0.5);
  const a = new Actor(o.name || (female ? r.pick(['Anežka', 'Dorota', 'Eliška', 'Kateřina', 'Ludmila', 'Markéta', 'Johana', 'Běta', 'Zdena', 'Magdalena']) : r.pick(['Tonda', 'Honza', 'Vašek', 'Jakub', 'Matouš', 'Petr', 'Ondra', 'Štěpán', 'Martin', 'Bedřich', 'Filip'])), o.id || 'gen' + seed);
  a.look = randomLook(seed, { female, role: o.role, child: o.child, old: o.old });
  a.brain = makeBrain(o.role === 'guard' ? 'guard' : 'person');
  a.faction = o.role === 'guard' ? 'guard' : 'villager';
  a.speed = o.child ? 50 : 44;
  a.mem.wander = o.wander ?? 50;
  a.mem.schedule = o.schedule;
  a.mem.settlement = o.settlement;
  a.mem.job = o.job;
  a.mem.barks = o.barks;
  a.tags.add('generic');
  for (const t of o.tags || []) a.tags.add(t);
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

export type FighterKind = 'bandit' | 'merc' | 'merc_heavy' | 'archer' | 'lothar_guard' | 'deserter';
/** Fighters: bandits, mercenaries, Lothar's garrison. */
export function fighter(map: string, x: number, y: number, kind: FighterKind, o: { id?: string; name?: string; hostile?: boolean; skill?: number; tags?: string[]; knows?: string; seed?: number; weapon?: string; hp?: number } = {}): Actor {
  const seed = o.seed ?? 7000 + genCount++;
  const a = new Actor(o.name || (kind === 'bandit' ? 'Bandit' : kind === 'lothar_guard' ? 'Raven Guard' : kind === 'deserter' ? 'Deserter' : kind === 'archer' ? 'Crossbowman' : 'Mercenary'), o.id || 'f' + seed);
  a.look = randomLook(seed, { role: kind === 'bandit' ? 'bandit' : 'mercenary', female: false });
  if (kind === 'lothar_guard') { a.look.outer = 'tabard'; a.look.outerColor = '#262220'; a.look.trim = '#6e3a5a'; a.look.hat = 'bascinet'; }
  if (kind === 'deserter') { a.look.outer = 'gambeson'; a.look.outerColor = '#4a3a34'; a.look.hat = 'hood'; a.look.hatColor = '#3a3230'; }
  a.brain = makeBrain(kind === 'archer' ? 'archer' : 'fighter');
  a.faction = kind === 'bandit' || kind === 'deserter' ? 'bandit' : kind === 'lothar_guard' ? 'lothar' : 'harrow';
  a.hostile = o.hostile ?? true;
  a.speed = 50;
  const heavy = kind === 'merc_heavy' || kind === 'lothar_guard';
  a.maxHp = a.hp = o.hp ?? (kind === 'bandit' || kind === 'deserter' ? 85 : heavy ? 135 : 110);
  a.mem.skill = o.skill ?? (kind === 'bandit' ? 3 : kind === 'deserter' ? 4 : heavy ? 6 : 4);
  a.mem.courage = kind === 'bandit' ? 0.35 : 0.6;
  const weapons = kind === 'bandit' ? ['club', 'hatchet', 'rusty_sword', 'hunting_knife'] : heavy ? ['longsword', 'mace', 'war_hammer', 'falchion'] : ['arming_sword', 'falchion', 'mace', 'spear', 'rusty_sword'];
  const w = o.weapon || new RNG(seed).pick(weapons);
  a.combat.weapon = { id: w, ...item(w).weapon! };
  if (kind === 'archer') { a.combat.weapon = { id: 'hunting_bow', kind: 'bow', slash: 0, stab: 20, blunt: 0, reach: 150, speed: 1, staminaCost: 5 }; a.mem.arrowDmg = 18; }
  a.combat.armor = kind === 'bandit' || kind === 'deserter' ? { slash: 6, stab: 4, blunt: 6, noise: 0, charisma: 0, weight: 0 } : heavy ? { slash: 24, stab: 18, blunt: 12, noise: 3, charisma: 0, weight: 0 } : { slash: 16, stab: 10, blunt: 8, noise: 2, charisma: 0, weight: 0 };
  const loot = enemyLoot(kind === 'bandit' || kind === 'deserter' ? 'bandit' : 'soldier', a.id);
  a.mem.loot = [{ id: kind === 'archer' ? 'arrow' : w, n: kind === 'archer' ? 8 : 1, cond: 70 }, ...loot.items];
  a.mem.coins = loot.coins;
  a.mem.knows = o.knows;
  for (const t of o.tags || []) a.tags.add(t);
  a.tags.add(kind);
  addActor(a, map, x, y);
  return a;
}

export function animal(map: string, x: number, y: number, look: keyof typeof ANIMAL_LOOKS, o: { id?: string; hostile?: boolean; wander?: number; name?: string } = {}): Actor {
  const lk = ANIMAL_LOOKS[look];
  const a = new Actor(o.name || ({ deer: 'Deer', stag: 'Stag', wolf: 'Wolf', boar: 'Boar', hare: 'Hare', fox: 'Fox', chicken: 'Hen', chicken_brown: 'Hen', goose: 'Goose', cow: 'Cow', sheep: 'Sheep', horse_brown: 'Horse', horse_black: 'Horse', horse_grey: 'Horse', guarddog: 'Hound', crumb: 'Crumb' } as Record<string, string>)[look] || look, o.id);
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
  if (sp === 'chicken' || sp === 'goose' || sp === 'cow' || sp === 'sheep' || sp === 'horse') a.mem.owned = true;
  addActor(a, map, x, y);
  return a;
}

// ---------- the world's population per act ----------

export const ACT = () => (flag('act') || 0) as number;
/** Chapters register extra spawns here (quest enemies, prisoners, visitors). */
export const castHooks: (() => void)[] = [];

export function spawnCast() {
  keep = new Set();
  for (const a of [...actors]) if (a.tags.has('generic') || a.tags.has('wild') || a.tags.has('quest')) removeActor(a);
  const act = ACT();
  if (act === 0) spawnPrologue();
  else spawnActs(act);
  for (const h of castHooks) { try { h(); } catch (e) { console.error('cast hook failed', e); } }
  // named characters who have no place in this chapter leave the stage
  for (const a of [...actors]) if (a.charId && a !== G.player && a.charId !== 'crumb' && !keep.has(a) && !a.tags.has('quest')) removeActor(a);
  if (S.dog.owned) {
    const c = makeCrumb();
    if (!actors.includes(c)) addActor(c, S.dog.map || S.mapId, S.dog.x ?? S.px, S.dog.y ?? S.py);
  } else if (act > 0) removeNpc('crumb');
  settleSchedules();
}

/** Where everyone stands around the midsummer bonfire (tiles). */
export const FEAST: Record<string, [number, number, number]> = {
  radek: [39, 103, 1], marta: [40, 104, 1], lida: [38, 105, 3], marek: [39, 105, 3], pavel: [34, 103, 2], hanka: [35, 105, 2],
  havel: [36, 102, 0], jiri: [40, 102, 0], vojta: [33, 104, 2], bara: [41, 103, 1], tobiah: [34, 102, 2], miller: [32, 103, 2],
  player: [37, 102, 0],
};
export const feastAt = (id: string) => OW(FEAST[id][0], FEAST[id][1]);

function spawnPrologue() {
  const home = (s: string) => at('hb_home', s);
  const F = (id: string) => sched(19, 23.5, feastAt(id), id === 'havel' ? 'sit' : 'stand', { dir: FEAST[id][2] });
  const lidaAtDen = qAt('main_prologue', 'afternoon') && !S.flags['lida_found'];
  npc('radek', null, [
    sched(5, 6.6, home('hearth'), 'stand', { dir: 0 }),
    sched(6.6, 19, at('overworld', 'anvil_spot'), 'work', { dir: 3 }),
    F('radek'),
    sched(23.5, 5, home('bed_radek'), 'sleep'),
  ], { weapon: 'smith_hammer', skill: 6, hp: 150 });
  npc('marta', null, [
    sched(4.5, 12, home('oven'), 'work', { dir: 3 }),
    sched(12, 17, home('table_n'), 'stand', { dir: 0 }),
    sched(17, 19, OW(41, 103), 'wander', { r: 24 }),
    F('marta'),
    sched(23.5, 4.5, home('bed_marta'), 'sleep'),
  ], { merchant: undefined });
  npc('lida', null, lidaAtDen ? always(at('overworld', 'fox_den'), 'sit', { dir: 3 }) : [
    sched(6, 9, home('center'), 'wander', { r: 30 }),
    sched(9, 19, OW(40, 102), 'wander', { r: 60 }),
    F('lida'),
    sched(22, 6, home('bed_lida'), 'sleep'),
  ]);
  npc('pavel', null, [
    sched(6, 19, at('overworld', 'spar'), 'wander', { r: 20 }),
    F('pavel'),
    sched(23.5, 6, at('hb_mill', 'bed'), 'sleep'),
  ], { weapon: 'stick', skill: 3 });
  npc('hanka', null, [
    sched(7, 19, OW(38, 111), 'sit', { dir: 0 }),
    F('hanka'),
    sched(23.5, 7, at('hb_hanka', 'bed'), 'sleep'),
  ]);
  npc('havel', null, [
    sched(5.5, 19, OW(35, 99), 'sit', { dir: 0 }),
    F('havel'),
    sched(23.5, 5.5, at('hb_havel', 'bed'), 'sleep'),
  ]);
  npc('jiri', null, [
    sched(5.5, 12, at('hb_jiri', 'desk'), 'sit', { dir: 0 }),
    sched(12, 19, OW(44, 101), 'wander', { r: 40 }),
    F('jiri'),
    sched(23.5, 5.5, at('hb_jiri', 'bed'), 'sleep'),
  ]);
  npc('vojta', null, [
    sched(9, 19, at('hb_tavern', 'seat1'), 'drink'),
    F('vojta'),
    sched(23.5, 9, at('hb_vojta', 'bed'), 'sleep'),
  ]);
  npc('bara', null, [
    sched(5, 19, OW(48, 109), 'wander', { r: 22 }),
    F('bara'),
    sched(23.5, 6, at('hb_bara', 'bed'), 'sleep'),
  ]);
  npc('marek', null, [
    sched(7.5, 19, OW(40, 102), 'wander', { r: 60 }),
    F('marek'),
    sched(23.5, 7.5, at('hb_bara', 'wheel'), 'sleep'),
  ]);
  npc('tobiah', null, [
    sched(6, 19, at('hb_chapel', 'altar'), 'pray'),
    F('tobiah'),
    sched(23.5, 6, at('hb_chapel', 'pew'), 'sleep'),
  ]);
  npc('miller', null, [
    sched(5, 19, at('hb_mill', 'stone'), 'work', { dir: 3 }),
    F('miller'),
    sched(23.5, 5, at('hb_mill', 'bed'), 'sleep'),
  ], { name: 'Mikuláš' });
  // villagers in the fields and lanes
  const days: [number, number][] = [[60, 90], [64, 105], [36, 114], [58, 88]];
  const nights: [number, number][] = [[41, 101], [33, 102], [42, 104], [32, 105]];
  days.forEach(([x, y], i) => person('overworld', x * TILE, y * TILE, {
    seed: 300 + i, wander: 40, settlement: 'hollowbrook',
    job: ['I work the lord\'s strips, and my own when there\'s light left.', 'Cooper. Barrels, buckets, the odd coffin.', 'I keep bees and a very bad temper.', 'Shepherd. The sheep don\'t talk back. Much.'][i],
    schedule: [sched(6, 19, OW(x, y), 'wander', { r: 50 }), sched(19, 23.5, OW(nights[i][0], nights[i][1]), 'stand'), sched(23.5, 6, OW(x, y), 'hide')],
  }));
  person('overworld', 41 * TILE, 99 * TILE, { seed: 320, child: true, wander: 50, settlement: 'hollowbrook', name: 'Anička' });
  // animals: hens in the pen, a cow and sheep by the barn
  for (let i = 0; i < 4; i++) animal('overworld', (45 + i) * TILE, 112 * TILE, i % 2 ? 'chicken_brown' : 'chicken', { wander: 24 }).tags.add('wild');
  animal('overworld', 57 * TILE, 99 * TILE, 'cow', { wander: 30 }).tags.add('wild');
  animal('overworld', 64 * TILE, 100 * TILE, 'sheep', { wander: 30 }).tags.add('wild');
  animal('overworld', 66 * TILE, 101 * TILE, 'sheep', { wander: 30 }).tags.add('wild');
  if (!S.dog.owned && !flag('raid_started')) {
    const crumb = makeCrumb();
    S.dog.owned = true;
    if (!actors.includes(crumb)) addActor(crumb, 'hb_home', at('hb_home', 'crumb').x, at('hb_home', 'crumb').y);
  }
}

function spawnActs(act: number) {
  const L = (s: string) => at('overworld', s);
  const hbRuined = (flag('hb_state') || 'normal') === 'ruined';

  // ---------- Linden Hill ----------
  npc('bertram', null, [
    sched(7, 12, at('lh_keep', 'throne'), 'sit', { dir: 0 }),
    sched(12, 14, at('lh_keep', 'table'), 'eat'),
    sched(14, 18, L('castle_yard'), 'wander', { r: 40 }),
    sched(18, 22.5, at('lh_keep', 'fire'), 'stand', { dir: 3 }),
    sched(22.5, 7, at('lh_keep', 'bed'), 'sleep'),
  ], { faction: 'town', barks: ['Walk with God.', 'Keep your eyes open, lad.'] });
  npc('lukas', null, [sched(7, 21, at('lh_keep', 'steward'), 'stand', { dir: 0 }), sched(21, 7, at('lh_keep', 'table'), 'sit')], { faction: 'town' });
  npc('ondrej', null, [
    sched(6, 19, L('ondrej_yard'), 'stand', { dir: 0 }),
    sched(19, 23, at('lh_tavern', 'seat5'), 'drink'),
    sched(23, 6, at('lh_barracks', 'bunk'), 'sleep'),
  ], { faction: 'guard', skill: 8, weapon: 'arming_sword', hp: 180, barks: ['Chin up! Shoulders down!', 'Again!', 'My grandmother blocks better than that, and she\'s dead.'] });
  npc('kovar', null, [
    sched(6, 19, at('lh_smithy', 'anvil'), 'work', { dir: 3 }),
    sched(19, 22, at('lh_tavern', 'seat3'), 'drink'),
    sched(22, 6, at('lh_smithy', 'bed'), 'sleep'),
  ], { merchant: 'smith', faction: 'town' });
  npc('dorota', null, [sched(6, 24, at('lh_tavern', 'bar'), 'stand', { dir: 0 }), sched(0, 6, at('lh_tavern', 'dorota_bed'), 'sleep')], { merchant: 'inn', faction: 'town' });
  npc('greta', null, [sched(4, 18, at('lh_bakery', 'counter'), 'stand', { dir: 0 }), sched(18, 4, at('lh_bakery', 'bed'), 'sleep')], { merchant: 'bakery', faction: 'town' });
  npc('aurelius', null, [sched(8, 20, at('lh_apothecary', 'counter'), 'stand', { dir: 0 }), sched(20, 8, at('lh_apothecary', 'bench'), 'sit')], { merchant: 'apothecary', faction: 'town' });
  npc('florian', null, [sched(6, 21, at('lh_church', 'lectern'), 'stand', { dir: 0 }), sched(21, 6, at('lh_church', 'altar'), 'pray')], { faction: 'town' });
  npc('zbynek', null, [sched(7, 19, at('lh_tannery', 'work'), 'work'), sched(19, 23, at('lh_tavern', 'seat4'), 'drink'), sched(23, 7, at('lh_tannery', 'work'), 'sleep')], { merchant: 'tanner', faction: 'town' });
  npc('barber', null, always(at('lh_bath', 'keeper'), 'stand', { dir: 0 }), { faction: 'town' });
  npc('wenceslas', null, [sched(14, 2, at('lh_tavern', 'dice_opp'), 'sit', { dir: 0 }), sched(2, 14, L('market'), 'wander', { r: 60 })], { faction: 'town' });
  if (!flag('miko_adopted')) {
    const home = flag('miko_home');
    npc('miko', null, [sched(6, 21, L('market'), 'wander', { r: 90 }), sched(21, 6, home ? at('lh_tavern', 'fire') : L('market'), home ? 'sleep' : 'hide')], { faction: 'town' });
  } else {
    npc('miko', null, [sched(5, 17, at('lh_bakery', 'oven'), 'work'), sched(17, 21, L('market'), 'wander', { r: 50 }), sched(21, 5, at('lh_tavern', 'room'), 'sleep')], { faction: 'town' });
  }
  // Pavel serves in the garrison, until his folly
  const pavelAway = qAt('main_pavel', 'gone', 'camp', 'rescue') || flag('pavel_prisoner');
  if (!pavelAway && !flag('pavel_dead')) npc('pavel', null, [
    sched(6, 18, L('yard'), 'wander', { r: 30 }),
    sched(18, 23, at('lh_tavern', 'seat2'), 'drink'),
    sched(23, 6, at('lh_barracks', 'table'), 'sleep'),
  ], { faction: 'town', weapon: 'arming_sword', skill: 4, hp: 120 });
  // Brother Tobiah: at the church in Linden Hill in act I, then home at the priory
  if (act <= 1) npc('tobiah', null, [sched(7, 20, at('lh_church', 'pew1'), 'sit', { dir: 3 }), sched(20, 23, at('lh_tavern', 'seat6'), 'drink'), sched(23, 7, at('lh_church', 'pew2'), 'sleep')]);
  else npc('tobiah', null, [sched(7, 13, L('hives'), 'wander', { r: 30 }), sched(13, 20, at('pr_library', 'desk2'), 'sit', { dir: 0 }), sched(20, 7, at('pr_dorm', 'tobiah_bed'), 'sleep')], { merchant: 'priory' });

  // Mother: sick in the far tent, then baking in Linden Hill
  if (!flag('mother_dead')) {
    if (flag('mother_cured')) {
      npc('marta', null, [
        sched(4, 16, at('lh_bakery', 'marta_oven'), 'work', { dir: 3 }),
        sched(16, 20, at('lh_tavern', 'seat6'), 'sit'),
        sched(20, 4, at('lh_tavern', 'room'), 'sleep'),
      ], { merchant: 'mother_bread', faction: 'town' });
    } else {
      const m = npc('marta', at('camp_tent', 'marta_bed'), null, {});
      if (m) { m.pose = 'lie'; m.mem.hold = true; m.mem.faceWhileTalking = false; }
    }
  }

  // town guards and folk
  const gs: [string, number][] = [['gate_guard_s1', 0], ['gate_guard_s2', 0], ['gate_guard_n', 3], ['gate_guard_e', 2]];
  gs.forEach(([sp, dir], i) => {
    const p = L(sp);
    const g = person('overworld', p.x, p.y, { role: 'guard', seed: 900 + i, settlement: 'linden', schedule: always(p, 'guard', { dir }) });
    g.mem.faceDir = dir;
  });
  const pts = [[100, 60], [122, 60], [122, 76], [100, 76]].map(([x, y]) => ({ x: x * TILE, y: y * TILE }));
  for (let i = 0; i < 2; i++) { const g = person('overworld', pts[i * 2].x, pts[i * 2].y, { role: 'guard', seed: 920 + i, settlement: 'linden' }); g.mem.patrol = i ? [...pts].reverse() : pts; g.mem.wander = 0; }
  const homes = ['lh_house1', 'lh_house2', 'lh_house3', 'lh_house4'];
  const jobs = ['I sell eggs at the market. Mostly I sell complaints about the price of eggs.', 'Carter. If it has wheels, I\'ve fixed it. If it has a tongue, I\'ve argued with it.', 'I spin wool for the tailor. My fingers know the work better than my head does.', 'I dig ditches for Sir Bertram. Honest work. Very, very wet work.'];
  for (let i = 0; i < 10; i++) {
    const hm = homes[i % 4];
    const day = OW(100 + (i * 7) % 20, 66 + (i * 5) % 12);
    person('overworld', day.x, day.y, { seed: 1000 + i, settlement: 'linden', job: jobs[i % 4], schedule: [
      sched(7, 20, day, 'wander', { r: 70 }),
      sched(20, 23, at('lh_tavern', `seat${1 + (i % 4)}`), 'drink'),
      sched(23, 7, at(hm, i < 4 ? 'bed' : 'table'), i < 4 ? 'sleep' : 'sit'),
    ] });
  }
  for (let i = 0; i < 3; i++) person('overworld', (104 + i * 6) * TILE, 70 * TILE, { seed: 1100 + i, child: true, wander: 60, settlement: 'linden' });
  ['stall1', 'stall2', 'stall3'].forEach((s, i) => {
    const p = L(s);
    const a = person('overworld', p.x, p.y, { seed: 1200 + i, settlement: 'linden', schedule: [sched(7, 18, p, 'stand', { dir: 0 }), sched(18, 7, at('lh_tavern', 'seat' + (i + 1)), 'drink')] });
    a.mem.merchant = ['butcher', 'tailor', 'armorer'][i];
    a.name = ['Butcher Ruprecht', 'Cloth-seller Věra', 'Armourer Hynek'][i];
    a.mem.job = ['Best sausage in the Lindenmark. The second best is also mine.', 'Linen, wool, a little silk for those who can pay.', 'Mail, padding, helms. I fit them. You fight in them. That\'s the arrangement.'][i];
  });

  // ---------- the refugee camp at the crossroads ----------
  const C = (dx: number, dy: number) => OW(122 + dx, 131 + dy);
  if (!flag('refugees_moved')) {
    npc('jiri', C(-2, 1), always(C(-2, 1), 'sit', { dir: 2 }), { barks: ['...', 'God help us.'] });
    npc('marek', null, [sched(7, 21, C(0, 2), 'wander', { r: 40 }), sched(21, 7, C(-4, 2), 'sleep')]);
    npc('bara', null, always(C(4, 1), 'wander', { r: 16 }));
    npc('vojta', null, [sched(8, 22, C(6, 3), 'sit', { dir: 1 }), sched(22, 8, C(7, 4), 'sleep')]);
    for (let i = 0; i < 5; i++) person('overworld', C(-6 + i * 3, -1).x, C(0, -1).y, { seed: 1300 + i, wander: 36, settlement: 'refugees', job: ['I had a farm on the pass road. I have a blanket now.', 'My husband is on the list by the board. With a cross.', 'We walked all night. The baby didn\'t cry once. I think she knew.', 'Hollowbrook, Lhota, Dubá. They burned them all, one after another.', 'I\'m waiting for my son. He\'s coming. He\'s surely coming.'][i] });
    const anka = person('overworld', C(6, 5).x, C(6, 5).y, { seed: 1310, settlement: 'refugees', name: 'Old Anka', female: true, old: true, wander: 10 });
    anka.mem.merchant = 'refugees';
    anka.mem.job = 'I trade what we have for what we need. Mostly we have nothing, and we need everything.';
  } else {
    // rebuilding Hollowbrook
    npc('jiri', null, [sched(7, 19, OW(44, 101), 'wander', { r: 40 }), sched(19, 7, OW(40, 103), 'sit')]);
    npc('marek', null, [sched(7, 20, OW(40, 102), 'wander', { r: 60 }), sched(20, 7, OW(46, 104), 'sleep')]);
    npc('bara', null, always(OW(48, 109), 'wander', { r: 20 }));
    npc('vojta', null, [sched(8, 22, OW(37, 103), 'sit'), sched(22, 8, OW(36, 104), 'sleep')]);
    for (let i = 0; i < 4; i++) person('overworld', (44 + i * 3) * TILE, 100 * TILE, { seed: 1300 + i, wander: 60, settlement: 'hollowbrook', job: 'We\'re building again. Timber, thatch, stubbornness.' });
  }
  if (hbRuined && flag('bishop_lives') && !flag('refugees_moved')) {
    const b = animal('overworld', C(5, 2).x, C(5, 2).y, 'goose', { id: 'bishop', wander: 20, name: 'The Bishop' });
    b.tags.add('quest');
  }

  // ---------- forest folk ----------
  npc('wenda', null, [sched(6, 21, at('wenda_hut', 'cauldron'), 'work', { dir: 3 }), sched(21, 6, at('wenda_hut', 'bed'), 'sleep')], { merchant: 'wenda' });
  if (!flag('hanka_moved')) npc('hanka', null, [sched(6, 19, at('overworld', 'wenda'), 'wander', { r: 40 }), sched(19, 22, at('wenda_hut', 'hanka'), 'sit'), sched(22, 6, at('wenda_hut', 'hanka'), 'sleep')]);
  else npc('hanka', null, [sched(7, 18, at('lh_apothecary', 'bench'), 'work', { dir: 3 }), sched(18, 22, at('lh_tavern', 'seat6'), 'sit'), sched(22, 7, at('lh_tavern', 'room'), 'sleep')], { faction: 'town' });
  npc('matej', null, [sched(6, 19, L('lodge'), 'wander', { r: 40 }), sched(19, 6, at('lodge', 'bed'), 'sleep')], { merchant: 'hunter' });
  npc('tomas_burner', null, always(L('burners'), 'work'));
  if (qDone('side_charcoal')) npc('vit', null, [sched(6, 20, L('burners'), 'wander', { r: 30 }), sched(20, 6, at('burner_hut', 'table'), 'sleep')]);

  // ---------- priory ----------
  npc('gregor', null, [sched(6, 12, at('pr_church', 'altar'), 'pray'), sched(12, 21, at('pr_abbot', 'desk'), 'sit', { dir: 0 }), sched(21, 6, at('pr_abbot', 'desk'), 'sleep')]);
  npc('anselm', null, [sched(6, 22, at('pr_library', 'desk'), 'sit', { dir: 0 }), sched(22, 6, at('pr_dorm', 'table'), 'sleep')]);
  const cl = L('cloister');
  for (let i = 0; i < 3; i++) person('overworld', cl.x + i * 20, cl.y, { role: 'monk', seed: 1400 + i, wander: 60, settlement: 'priory', female: false, name: ['Brother Pavel', 'Brother Jan', 'Brother Bonifác'][i], job: 'I copy books, and I pray, and some days I do not know which is harder.' });

  // ---------- Silverdale ----------
  if (!flag('vilem_gone')) npc('vilem', null, [sched(8, 20, at('sd_foreman', 'desk'), 'sit', { dir: 0 }), sched(20, 8, at('sd_foreman', 'bed'), 'sleep')], { essential: false, hp: 90 });
  npc('kuba', null, [sched(6, 19, L('mine_mouth'), 'wander', { r: 30 }), sched(19, 6, L('square'), 'wander', { r: 30 })]);
  npc('anna', null, [sched(6, 20, at('sd_anna', 'table'), 'stand', { dir: 0 }), sched(20, 6, at('sd_anna', 'bed'), 'sleep')]);
  npc('storekeep', null, always(at('sd_store', 'counter'), 'stand', { dir: 0 }), { merchant: 'silverdale_store' });
  const mm = L('mine_mouth');
  for (let i = 0; i < 4; i++) person('overworld', mm.x + i * 18, mm.y + 20, { role: 'miner', seed: 1500 + i, wander: 50, settlement: 'silverdale', female: false, job: 'I dig silver for the king, and the king pays me in promises.' });

  // ---------- the peddler walks the roads ----------
  npc('peddler', null, [
    sched(6, 11, OW(90, 91), 'wander', { r: 30 }),
    sched(11, 16, OW(118, 120), 'wander', { r: 30 }),
    sched(16, 21, OW(84, 38), 'wander', { r: 30 }),
    sched(21, 6, at('lh_tavern', 'seat4'), 'sleep'),
  ], { merchant: 'peddler' });

  // ---------- wildlife ----------
  spawnWildlife();
  void qActive; void qStage;
}

export function spawnWildlife() {
  const herds: [number, number, keyof typeof ANIMAL_LOOKS, number][] = [
    [70, 150, 'deer', 3], [120, 162, 'deer', 2], [40, 140, 'hare', 3], [200, 70, 'deer', 3], [90, 60, 'hare', 2], [175, 130, 'boar', 2], [20, 130, 'boar', 1],
    [140, 110, 'hare', 2], [205, 150, 'stag', 1], [60, 45, 'fox', 1], [215, 60, 'boar', 1], [100, 110, 'hare', 2], [30, 60, 'deer', 2],
  ];
  herds.forEach(([x, y, kind, n], hi) => {
    for (let i = 0; i < n; i++) { const a = animal('overworld', (x + i * 2) * TILE, (y + (i % 2) * 2) * TILE, kind, { wander: 90, id: `wild_${hi}_${i}` }); a.tags.add('wild'); }
  });
  if (!qDone('side_wolves')) {
    for (let i = 0; i < 4; i++) { const w = animal('overworld', (148 + i * 2) * TILE, (167 + (i % 2)) * TILE, 'wolf', { wander: 50, id: 'denwolf' + i }); w.tags.add('wild'); w.tags.add('denwolf'); w.mem.aggroRange = 120; }
  }
  for (let i = 0; i < 3; i++) { const w = animal('overworld', (30 + i * 3) * TILE, (150 + i) * TILE, 'wolf', { wander: 80, id: 'wwolf' + i }); w.tags.add('wild'); w.mem.aggroRange = 100; }
}
