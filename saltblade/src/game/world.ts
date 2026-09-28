// Building the world's structures at the start of a game, and filling
// places with people as the player approaches.
import { G } from '../state';
import { S } from '../sim/ctx';
import { buildTown } from '../world/towns';
import { buildSite } from '../world/sites';
import { SETTLEMENT } from '../content/layout';
import { RNG, hash3 } from '../core/rng';
import { populateTown, populateSite } from '../sim/populate';
import { structuresIn, townRings } from '../sim/structures';
import { anchors } from '../sim/sim';
import { tickExplore } from '../ui/map';
import { emit } from '../core/events';
import type { Char } from '../sim/char';

export function buildStructures() {
  const W = G.W, T = G.T;
  G.nav.structures = structuresIn;
  G.nav.rings = townRings;
  for (const site of T.sites) {
    const rng = new RNG(hash3(site.seed, 1234, 5));
    if (site.kind === 'town') {
      const def = SETTLEMENT[site.settlement!];
      const info = buildTown(W, T, site, def, hash3(site.seed, 4321, 1));
      W.towns.set(site.id, info);
    } else buildSite(W, T, site, rng);
  }
  W.rebuildObjHash();
}

/** Rebuilds town layouts after loading a save (they are deterministic). */
export function rebuildTownInfo() {
  // Town layouts live in the saved objects; TownInfo is only needed to populate.
}

let popT = 0;
export function tickPopulation(dt: number) {
  popT -= dt;
  if (popT > 0) return;
  popT = 1.5;
  const W = G.W;
  if (G.mode === 'play') tickExplore();
  const pts = anchors.length ? anchors : [{ x: G.cam.target.x, z: G.cam.target.z }];
  for (const site of G.T.sites) {
    if (W.populated.has(site.id)) continue;
    let near = false;
    for (const a of pts) if (Math.hypot(site.x - a.x, site.z - a.z) < site.r + 520) { near = true; break; }
    if (!near) continue;
    if (site.kind === 'town') {
      const info = W.towns.get(site.id);
      if (info) populateTown(W, info);
    } else populateSite(W, site);
  }
  // factions you have come across
  const mine = W.playerChars();
  for (const o of W.active) {
    if (o.faction === 'player' || o.animal || W.rel.met.has(o.faction)) continue;
    for (const c of mine) if (Math.abs(c.x - o.x) < 60 && Math.abs(c.z - o.z) < 60) { W.rel.met.add(o.faction); break; }
  }
  // discover places your people see
  const regions: number[] = W.flags.regionsSeen ?? (W.flags.regionsSeen = []);
  for (const c of mine) {
    if (!c.alive) continue;
    const s = G.T.siteAt(c.x, c.z, 60);
    if (s && !W.discovered.has(s.id)) {
      W.discovered.add(s.id);
      if (s.kind === 'town' || s.landmark) S.fx.notice(`Discovered ${s.name}.`, 'good');
    }
    // a region seen for the first time
    const r = G.T.regionIdAt(c.x, c.z);
    if (!regions.includes(r)) {
      regions.push(r);
      if (regions.length > 1 || W.log.length > 1) emit('region:enter', r);
    }
  }
  // named people your people have met
  const people: string[] = W.flags.peopleMet ?? (W.flags.peopleMet = []);
  for (const o of W.active) {
    if (!o.unique || people.includes(o.unique)) continue;
    if (o.faction === 'player' || mine.some((c: Char) => Math.abs(c.x - o.x) < 14 && Math.abs(c.z - o.z) < 14)) people.push(o.unique);
  }
  // creatures your people have seen
  const beasts: string[] = W.flags.beastsSeen ?? (W.flags.beastsSeen = []);
  for (const o of W.active) {
    if (!o.animal || beasts.includes(o.animal)) continue;
    if (mine.some((c: Char) => Math.abs(c.x - o.x) < 50 && Math.abs(c.z - o.z) < 50)) beasts.push(o.animal);
  }
}
