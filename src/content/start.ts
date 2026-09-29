// Premade characters and the initial game state.

import type { SaveState } from '../game/G';
import { makeActor, addItem, equipById } from '../game/actors';
import type { Stats, SkillKey } from '../data/stats';
import type { Look } from '../data/protos';
import { maxHp } from '../game/character';
import { START_MINUTE } from '../game/time';
import { WORLD_W, WORLD_H } from '../game/world';

export interface Premade {
  name: string;
  female: boolean;
  blurb: string;
  stats: Stats;
  tags: SkillKey[];
  traits: string[];
  look: Partial<Look>;
}

export const PREMADES: Premade[] = [
  {
    name: 'Ren Okafor',
    female: false,
    blurb: 'Top marksman on the shelter\'s air-rifle range three years running, and a steady hand in the infirmary. Not much of a talker.',
    stats: { STR: 6, PER: 7, END: 6, CHA: 4, INT: 5, AGI: 7, LCK: 5 },
    tags: ['smallGuns', 'unarmed', 'firstAid'],
    traits: [],
    look: { skin: '#7a4a2e', hair: '#141010', hairStyle: 'short' },
  },
  {
    name: 'Mira Castellanos',
    female: true,
    blurb: 'Shelter council clerk and the only resident who has read every book in the archive twice. She believes most fights can be talked down.',
    stats: { STR: 4, PER: 6, END: 4, CHA: 8, INT: 8, AGI: 5, LCK: 5 },
    tags: ['speech', 'barter', 'science'],
    traits: ['bookish'],
    look: { skin: '#c89468', hair: '#2a1a10', hairStyle: 'long', female: true },
  },
  {
    name: 'Tobias Lund',
    female: false,
    blurb: 'Maintenance tech, lock tinkerer and occasional borrower of other people\'s things. Quick on his feet and hard to pin down.',
    stats: { STR: 4, PER: 6, END: 5, CHA: 5, INT: 6, AGI: 8, LCK: 6 },
    tags: ['sneak', 'lockpick', 'smallGuns'],
    traits: ['slightFrame'],
    look: { skin: '#e0b898', hair: '#b07830', hairStyle: 'short' },
  },
];

export function newGameState(premade: number): SaveState {
  const p = makeActor('player', { uid: 'player', q: 0, r: 0 });
  p.team = 'player';
  const pre = premade >= 0 ? PREMADES[premade] : null;
  p.name = pre?.name ?? 'Wanderer';
  if (pre) {
    Object.assign(p.stats, pre.stats);
    p.tags = [...pre.tags];
    p.traits = [...pre.traits];
    (p as any).female = pre.female;
    (p as any).look = { ...pre.look, outfit: '#2f7f86', outfit2: '#e08a2a' };
  } else {
    p.tags = [];
    p.traits = [];
    (p as any).female = false;
    (p as any).look = { skin: '#c89468', hair: '#3a2a1a', hairStyle: 'short', outfit: '#2f7f86', outfit2: '#e08a2a' };
  }
  p.skillPts = {};
  p.perks = {};
  addItem(p, 'shelterSuit');
  equipById(p, 'shelterSuit');
  addItem(p, 'knife');
  equipById(p, 'knife');
  p.active = 1;
  // Left hand: nothing; knife in right.
  addItem(p, 'hypo', 2);
  addItem(p, 'flare', 2);
  addItem(p, 'water', 1);
  addItem(p, 'scrip', 40);
  p.hp = maxHp(p);
  const state: SaveState = {
    version: 1,
    player: p,
    party: [],
    time: START_MINUTE,
    waterDeadline: START_MINUTE + 150 * 1440,
    armyDeadline: 0,
    flags: {},
    quests: {},
    karma: 0,
    rep: {},
    mapId: null,
    world: { x: 0, y: 0 },
    discovered: [],
    visitedLoc: [],
    explored: '0'.repeat(WORLD_W * WORLD_H),
    maps: {},
    kills: {},
    notes: [],
    uidSeq: 0,
    lastHeal: 0,
    firstAidUses: { t: 0, n: 0 },
    doctorUses: { t: 0, n: 0 },
  };
  return state;
}
