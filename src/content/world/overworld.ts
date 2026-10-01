// The Lindenmark: the whole overworld map, assembled from terrain noise,
// rivers, roads, settlements and scattered nature.

import { MapBuilder } from '../../world/build';
import { T } from '../../world/terrain';
import { registerMap } from '../../world/world';
import { fbm, hash2, TILE } from '../../engine/util';
import { OW, LOC, RIVER, BROOK, ROADS } from './layout';
import { hollowbrook, lindenHill, silverdale, priory, refugeeCamp, forestPlaces, warCamp, ravenstone } from './settlements';
import { PLACES } from '../places';
import { interior } from './interior';
import { CLOTH } from '../../gfx/palette';
import { TreeKind } from '../../gfx/nature';

const SEED = 1409;

function nearSettlement(x: number, y: number): number {
  // distance to the nearest settlement centre, used to keep forests back
  const pts: [number, number][] = [[LOC.hollowbrook.x, LOC.hollowbrook.y], [112, 67], [LOC.silverdale.x, LOC.silverdale.y], [192, 103], [LOC.camp.x, LOC.camp.y], [168, 47], [194, 21], [LOC.mill.x, LOC.mill.y]];
  let d = 1e9;
  for (const [px, py] of pts) d = Math.min(d, Math.hypot(px - x, py - y));
  return d;
}

export function buildOverworld() {
  PLACES.length = 0;
  const b = new MapBuilder('overworld', 'The Lindenmark', OW.w, OW.h, T.GRASS, SEED, true);
  const m = b.map;
  m.music = 'village';

  // ---- base terrain ----
  for (let y = 0; y < OW.h; y++) for (let x = 0; x < OW.w; x++) {
    const n = fbm(x * 0.045, y * 0.045, 3, SEED);
    const south = Math.max(0, (y - 118) / 45);
    const west = Math.max(0, (18 - x) / 30);
    const east = x > 205 ? (x - 205) / 40 : 0;
    const settle = Math.max(0, 1 - nearSettlement(x, y) / 22);
    const forest = n * 0.9 + south * 0.65 + west * 0.3 + east * 0.4 - settle * 0.9;
    if (forest > 0.62) b.set(x, y, T.FOREST);
    else if (fbm(x * 0.08, y * 0.08, 2, SEED + 7) > 0.66) b.set(x, y, T.MEADOW);
    // mountains along the north and far west
    const ridge = 7 + fbm(x * 0.06, 0.5, 3, SEED + 3) * 9 - (x > 60 && x < 150 ? 5 : 0);
    if (y < ridge) b.set(x, y, T.ROCK);
    if (x < 3 + fbm(0.5, y * 0.07, 2, SEED + 4) * 4) b.set(x, y, T.ROCK);
    if (y > OW.h - 3 - fbm(x * 0.07, 0.3, 2, SEED + 5) * 3) b.set(x, y, T.FOREST);
  }

  // ---- water ----
  b.river(RIVER, 5);
  b.path(BROOK, 2.2, T.SAND, 0.5, false, [T.GRASS, T.FOREST, T.MEADOW]);
  b.path(BROOK, 1.3, T.WATER, 0.5, true);
  // a ford where the brook meets the southern path, and a pond near Linden Hill
  b.blob(137, 82, 3, 2, T.WATER, 0.3);

  // ---- settlements (before roads so buildings reserve their ground) ----
  lindenHill(b);
  hollowbrook(b);
  silverdale(b);
  priory(b);
  refugeeCamp(b);
  forestPlaces(b);
  warCamp(b);
  ravenstone(b);

  // ---- roads ----
  for (const r of ROADS) b.road(r, 2.2);

  // ---- nature ----
  const forestKinds: TreeKind[] = ['oak', 'oak', 'linden', 'birch', 'pine', 'pine', 'oak'];
  b.forest(0, 0, OW.w, OW.h, 0.34, forestKinds, [T.FOREST]);
  // scattered trees in open country
  b.scatter(0, 0, OW.w, OW.h, 0.012, (x, y) => b.tree(x, y, hash2(x, y, 4) < 0.4 ? 'oak' : hash2(x, y, 5) < 0.5 ? 'linden' : 'birch'), [T.GRASS, T.MEADOW]);
  // willows along the water
  for (const pts of [RIVER, BROOK]) for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
    for (let k = 0; k < 3; k++) {
      const t = (k + 0.5) / 3;
      const x = Math.round(x0 + (x1 - x0) * t + (hash2(i, k, 9) < 0.5 ? -4 : 4)), y = Math.round(y0 + (y1 - y0) * t);
      if (b.get(x, y) === T.GRASS || b.get(x, y) === T.MEADOW || b.get(x, y) === T.SAND) b.tree(x, y, 'willow');
    }
  }
  b.scatter(0, 0, OW.w, OW.h, 0.02, (x, y) => b.deco(x, y, 'flowers'), [T.MEADOW]);
  b.scatter(0, 0, OW.w, OW.h, 0.006, (x, y) => b.bush(x, y, hash2(x, y, 1) < 0.3 ? '#c8302a' : undefined), [T.GRASS, T.MEADOW]);
  b.scatter(0, 0, OW.w, OW.h, 0.004, (x, y) => b.rock(x, y, hash2(x, y, 2) < 0.2 ? 'big' : 'small', hash2(x, y, 3) < 0.4), [T.GRASS, T.MEADOW, T.FOREST]);
  b.scatter(0, 0, OW.w, OW.h, 0.006, (x, y) => b.deco(x, y, hash2(x, y, 4) < 0.5 ? 'stump' : 'log'), [T.FOREST]);
  b.scatter(0, 0, OW.w, OW.h, 0.05, (x, y) => b.deco(x, y, 'reeds'), [T.SAND]);
  // boulders on the mountain skirts
  for (let x = 4; x < OW.w - 4; x += 3) for (let y = 4; y < 34; y++) {
    if (b.get(x, y) !== T.ROCK && b.get(x, y - 1) === T.ROCK && hash2(x, y, 77) < 0.3) b.rock(x, y, hash2(x, y, 7) < 0.5 ? 'boulder' : 'big', true);
  }

  // ---- herbs by biome ----
  const meadowHerbs = ['chamomile', 'yarrow', 'marigold', 'cornflower', 'stjohnswort', 'sage', 'thistle'];
  const forestHerbs = ['comfrey', 'valerian', 'nettle', 'mushroom', 'mushroom', 'wormwood', 'belladonna'];
  b.scatter(0, 0, OW.w, OW.h, 0.009, (x, y) => b.herb(x, y, meadowHerbs[Math.floor(hash2(x, y, 11) * meadowHerbs.length)]), [T.GRASS, T.MEADOW]);
  b.scatter(0, 0, OW.w, OW.h, 0.01, (x, y) => b.herb(x, y, forestHerbs[Math.floor(hash2(x, y, 12) * forestHerbs.length)]), [T.FOREST]);
  b.scatter(0, 0, OW.w, OW.h, 0.03, (x, y) => b.herb(x, y, hash2(x, y, 13) < 0.5 ? 'mint' : 'feverfew'), [T.SAND]);
  // willow bark at willows
  for (const o of m.objects) if (o.kind === 'tree' && o.type === 'willow' && hash2(o.x, o.y, 5) < 0.6) {
    const tx = Math.floor(o.x / TILE) + 1, ty = Math.floor(o.y / TILE);
    b.herb(tx, ty, 'willow_bark', `willow_${tx}_${ty}`);
  }

  // ---- regions for the wilds ----
  b.region({ id: 'wolfwood', name: 'The Wolfwood', x: 0, y: 128, w: 150, h: 52, music: 'forest' });
  b.region({ id: 'pass', name: 'The Pass Road', x: 40, y: 40, w: 60, h: 30, music: 'forest' });
  b.region({ id: 'riverlands', name: 'The Linden River', x: 140, y: 60, w: 30, h: 70 });
  b.region({ id: 'hills', name: 'The Grey Hills', x: 0, y: 0, w: 240, h: 14 });
  b.region({ id: 'bertram_forest', name: 'The Wolfwood', x: 100, y: 128, w: 60, h: 52, owner: 'bertram', music: 'forest' });

  m.spawns.start = m.spawns.hollowbrook;
  return b.done();
}

export function registerWorld() {
  registerMap('overworld', buildOverworld);
  // the refugee tent where mother lies sick
  interior('camp_tent', 'The Far Tent', { w: 7, h: 5, floor: T.STRAW, wall: T.WALL_WOOD, settlement: 'refugees', music: 'sorrow', ambient: 0.5 }, (r) => {
    r.prop('bedroll', 3, 1, { opt: CLOTH.madder });
    r.prop('candle', 5, 1, { solid: false });
    r.prop('stool', 1, 2);
    r.prop('sack', 6, 3);
    r.spot('marta_bed', 3, 1, 0);
    r.spot('beside', 2, 2, 2);
  });
}
