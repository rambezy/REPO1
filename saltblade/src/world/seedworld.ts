// What the land's seed makes of the world: its ore, its towns and the places
// between them, and the houses the towns have for sale. A new game builds it;
// a load builds it again, the same to the last crate, and the save carries
// only what has changed since (sim/save.ts). Both go through here, so they
// cannot drift apart. Nothing here draws on the game's own dice (S.rng): every
// choice comes from the seed.
import type { World } from '../sim/world';
import type { Terrain } from './terrain';
import { buildTown } from './towns';
import { buildSite } from './sites';
import { SETTLEMENT } from '../content/layout';
import { RNG, hash3 } from '../core/rng';
import { markHousesForSale } from '../sim/property';

export function buildSeedWorld(W: World, T: Terrain) {
  for (const o of T.ores) {
    W.addObj({ id: 0, kind: 'ore', def: o.kind, x: o.x, z: o.z, y: o.y, rot: o.rot, owner: '', site: 0, parent: 0, data: { left: Math.round(300 * o.size), size: o.size } });
  }
  for (const site of T.sites) {
    if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
    else buildSite(W, T, site, new RNG(hash3(site.seed, 1234, 5)));
  }
  markHousesForSale(W, T);
  W.rebuildObjHash();
}
