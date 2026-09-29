// World map terrain, travel and random encounters.

import { G, player } from './G';
import { hash2 } from '../core/rng';
import { LOCATIONS, MAPS } from '../content/registry';
import type { MapDef, NpcSpawn } from './types';
import { skill, perkRank } from './character';
import { advanceTime } from './time';
import { chance, pick, rand } from '../core/rng';
import { msg } from './log';

export const WORLD_W = 44;
export const WORLD_H = 34;

export type Terrain = 'desert' | 'mountain' | 'ruins' | 'water' | 'scrub' | 'crater';

let terrainCache: Terrain[] | null = null;

function noise(x: number, y: number, s: number, seed: number): number {
  const xi = Math.floor(x / s);
  const yi = Math.floor(y / s);
  const fx = x / s - xi;
  const fy = y / s - yi;
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function terrainAt(x: number, y: number): Terrain {
  if (!terrainCache) buildTerrain();
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return 'water';
  return terrainCache![y * WORLD_W + x];
}

function buildTerrain() {
  const t: Terrain[] = [];
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const n = noise(x, y, 6, 1) * 0.65 + noise(x, y, 3, 2) * 0.35;
      // Western coast
      const coast = 3 + Math.sin(y * 0.35) * 1.5 + noise(x, y, 4, 9) * 2;
      let ter: Terrain = 'desert';
      if (x < coast) ter = 'water';
      else if (n > 0.66) ter = 'mountain';
      else if (n < 0.28) ter = 'scrub';
      // The ruined city in the south-east.
      if (Math.hypot(x - 33, y - 24) < 5.5 + noise(x, y, 2, 4) * 2) ter = 'ruins';
      // Crater lands in the far north-east.
      if (Math.hypot(x - 38, y - 6) < 3.5 + noise(x, y, 2, 5) * 1.5) ter = 'crater';
      t.push(ter);
    }
  }
  // Ensure every location tile is walkable land.
  for (const l of Object.values(LOCATIONS)) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = (l.y + dy) * WORLD_W + (l.x + dx);
      if (i >= 0 && i < t.length && t[i] === 'water') t[i] = 'desert';
    }
  }
  terrainCache = t;
}

export function travelHours(ter: Terrain): number {
  let h = ter === 'mountain' ? 3.5 : ter === 'ruins' ? 2.5 : ter === 'crater' ? 3 : ter === 'scrub' ? 1.8 : 1.5;
  if (perkRank(player(), 'cartographer')) h *= 0.75;
  h *= 1 - Math.min(0.3, skill(player(), 'outdoorsman') / 400);
  return h;
}

// ---------------------------------------------------------------- explored fog

export function isExplored(x: number, y: number): boolean {
  const e = G.state.explored;
  return e[y * WORLD_W + x] === '1';
}

export function reveal(cx: number, cy: number, r = 1) {
  let e = G.state.explored;
  if (e.length !== WORLD_W * WORLD_H) e = '0'.repeat(WORLD_W * WORLD_H);
  const arr = e.split('');
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx;
    const y = cy + dy;
    if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) continue;
    if (Math.abs(dx) + Math.abs(dy) > r + 1) continue;
    arr[y * WORLD_W + x] = '1';
  }
  G.state.explored = arr.join('');
  // Discover locations that come into view.
  for (const l of Object.values(LOCATIONS)) {
    if (Math.abs(l.x - cx) <= r && Math.abs(l.y - cy) <= r && !G.state.discovered.includes(l.id)) {
      G.state.discovered.push(l.id);
      msg(`You have discovered ${l.name}.`);
    }
  }
}

// ---------------------------------------------------------------- encounters

export interface EncounterSpec {
  id: string;
  text: string; // shown when spotted
  terrain: Terrain[] | 'any';
  minLevel?: number;
  maxLevel?: number;
  weight: number;
  spawns: { proto: string; count: [number, number]; hostile?: boolean; team?: string; dialog?: string; barter?: boolean; name?: string; inv?: { id: string; n?: number }[] }[];
  loot?: { id: string; n?: number }[];
  once?: boolean;
  peaceful?: boolean;
}

export const ENCOUNTERS: EncounterSpec[] = [
  { id: 'rats', text: 'a pack of rats nosing through the dirt', terrain: 'any', maxLevel: 4, weight: 8, spawns: [{ proto: 'rat', count: [3, 6] }] },
  { id: 'dogs', text: 'a pack of feral dust hounds', terrain: ['desert', 'scrub'], weight: 8, spawns: [{ proto: 'dog', count: [3, 5] }] },
  { id: 'beetles', text: 'burrower beetles', terrain: ['desert', 'scrub', 'mountain'], minLevel: 2, weight: 7, spawns: [{ proto: 'beetle', count: [2, 4] }] },
  { id: 'raiders', text: 'a band of raiders', terrain: 'any', minLevel: 2, weight: 8, spawns: [{ proto: 'raider', count: [2, 3] }, { proto: 'raiderGun', count: [1, 2] }] },
  { id: 'lizards', text: 'ridgeback lizards basking in the sun', terrain: ['mountain', 'desert'], minLevel: 4, weight: 5, spawns: [{ proto: 'lizard', count: [2, 3] }] },
  { id: 'crawlers', text: 'sludge crawlers', terrain: ['ruins', 'scrub'], minLevel: 3, weight: 6, spawns: [{ proto: 'crawler', count: [2, 4] }] },
  { id: 'hollow', text: 'Hollow Ones shambling among the ruins', terrain: ['ruins'], weight: 7, spawns: [{ proto: 'witheredFeral', count: [3, 6] }] },
  { id: 'patrol', text: 'a Grafted patrol', terrain: 'any', minLevel: 6, weight: 6, spawns: [{ proto: 'grafted', count: [1, 2] }, { proto: 'graftedGun', count: [0, 1] }] },
  { id: 'drones', text: 'sentry drones on an old patrol route', terrain: ['crater', 'ruins', 'mountain'], minLevel: 5, weight: 4, spawns: [{ proto: 'sentry', count: [1, 2] }] },
  { id: 'trader', text: 'a travelling trader and a pack ox', terrain: ['desert', 'scrub'], weight: 4, peaceful: true, spawns: [{ proto: 'merchant', count: [1, 1], team: 'neutral', hostile: false, barter: true, name: 'Travelling Trader', dialog: 'wandering_trader', inv: [{ id: 'hypo', n: 3 }, { id: 'ammo9', n: 48 }, { id: 'curePaste', n: 4 }, { id: 'water', n: 3 }, { id: 'scrip', n: 150 }, { id: 'shells', n: 24 }] }, { proto: 'ox', count: [1, 1], team: 'neutral', hostile: false }] },
  { id: 'deadcaravan', text: 'the remains of a caravan', terrain: ['desert', 'scrub'], weight: 3, peaceful: true, spawns: [], loot: [{ id: 'scrip', n: 60 }, { id: 'ammo9', n: 20 }, { id: 'jerky', n: 3 }, { id: 'hypo', n: 1 }] },
];

export function pickEncounter(ter: Terrain): EncounterSpec | null {
  const lvl = player().level;
  const list = ENCOUNTERS.filter((e) =>
    (e.terrain === 'any' || e.terrain.includes(ter)) && (e.minLevel ?? 0) <= lvl && (e.maxLevel ?? 99) >= lvl && !(e.once && G.state.flags['enc:' + e.id]));
  if (!list.length) return null;
  let total = list.reduce((n, e) => n + e.weight, 0);
  let r = Math.random() * total;
  for (const e of list) {
    r -= e.weight;
    if (r <= 0) return e;
  }
  return list[0];
}

export function encounterChance(ter: Terrain): number {
  let c = ter === 'ruins' ? 11 : ter === 'mountain' ? 7 : ter === 'crater' ? 10 : 8;
  if (perkRank(player(), 'wanderer')) c *= 0.7;
  if (G.settings.difficulty === 'easy') c *= 0.7;
  return c;
}

/** Build a small random map for an encounter or empty wilderness. */
export function buildEncounterMap(ter: Terrain, enc: EncounterSpec | null): MapDef {
  const W = 40;
  const H = 34;
  const rows: string[] = [];
  const floor = ter === 'mountain' ? 'cracked' : ter === 'ruins' ? 'asphalt' : ter === 'scrub' ? 'scrub' : ter === 'crater' ? 'glow' : 'sand';
  const seed = rand(1, 1e6);
  for (let r = 0; r < H; r++) {
    let row = '';
    for (let q = 0; q < W; q++) {
      const edge = r === 0 || q === 0 || r === H - 1 || q === W - 1;
      if (edge) {
        row += '>';
        continue;
      }
      const h = hash2(q, r, seed);
      const n = noise(q, r, 5, seed);
      if (ter === 'mountain' && n > 0.7) row += '#';
      else if (ter === 'ruins' && n > 0.72 && (q + r) % 5 !== 0) row += '%';
      else if (h < 0.03) row += 'o';
      else if (h < 0.045 && (ter === 'desert' || ter === 'scrub')) row += 'Y';
      else if (h < 0.06 && ter !== 'ruins') row += 'T';
      else if (h < 0.1) row += '"';
      else if (ter === 'ruins' && h < 0.16) row += ';';
      else row += n > 0.55 ? ',' : '.';
    }
    rows.push(row);
  }
  // Clear the centre and the entry point.
  const clear = (cq: number, cr: number, rad: number) => {
    for (let r = cr - rad; r <= cr + rad; r++) {
      if (r <= 0 || r >= H - 1) continue;
      const a = rows[r].split('');
      for (let q = cq - rad; q <= cq + rad; q++) if (q > 0 && q < W - 1) a[q] = '.';
      rows[r] = a.join('');
    }
  };
  clear(20, 17, 3);
  clear(12, 24, 2);
  const setChar = (q: number, r: number, ch: string) => {
    const a = rows[r].split('');
    a[q] = ch;
    rows[r] = a.join('');
  };
  setChar(12, 24, 'P');
  setChar(22, 13, 'E');
  const npcs: NpcSpawn[] = [];
  const items: MapDef['items'] = [];
  if (enc) {
    for (const s of enc.spawns) {
      const n = rand(s.count[0], s.count[1]);
      for (let i = 0; i < n; i++) {
        npcs.push({ proto: s.proto, at: [22 + rand(-4, 4), 13 + rand(-3, 3)], hostile: s.hostile, team: s.team, dialog: s.dialog, barter: s.barter, name: s.name, inv: s.inv, wander: enc.peaceful ? 2 : 3, id: s.dialog ? 'enc_' + s.dialog : undefined });
      }
    }
    for (const l of enc.loot ?? []) items.push({ id: l.id, n: l.n, at: [21 + rand(-2, 2), 14 + rand(-2, 2)] });
  }
  const def: MapDef = {
    id: 'encounter',
    name: enc ? 'Encounter' : 'Wilderness',
    area: 'wild',
    outdoor: true,
    floor,
    floor2: ter === 'scrub' ? 'dirt' : ter === 'ruins' ? 'rubble' : 'dirt',
    wall: ter === 'mountain' ? 'cliff' : 'ruin',
    wall2: 'ruin',
    rows,
    entrances: { default: 'P' },
    npcs,
    items,
    objects: enc?.id === 'deadcaravan' ? [{ kind: 'bones', at: [20, 15] }, { kind: 'bones', at: [23, 16] }, { kind: 'crate', at: [21, 13], inv: [{ id: 'scrip', n: rand(20, 60) }, { id: 'scrapMetal', n: 3 }] }] : [],
    music: 'wind',
  };
  return def;
}

export function startEncounterMap(ter: Terrain, enc: EncounterSpec | null) {
  const def = buildEncounterMap(ter, enc);
  if (enc?.once) G.state.flags['enc:' + enc.id] = true;
  import('./travel').then((t) => {
    if (G.map) t.leaveMap();
    MAPS.encounter = def;
    delete G.state.maps.encounter;
    t.enterMap('encounter');
    if (enc && !enc.peaceful) {
      import('./combat').then((c) => setTimeout(() => c.startCombat(), 700));
    }
  });
}

export { advanceTime, chance, pick };
