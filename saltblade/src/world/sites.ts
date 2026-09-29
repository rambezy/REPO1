// Structures and loot for lesser sites: ruins full of Maker relics, bandit
// camps, homesteads, wrecks, shrines and standing stones.
import { RNG } from '../core/rng';
import { Terrain, Site } from './terrain';
import { World } from '../sim/world';
import { BUILDINGS } from '../content/buildings';
import { placeBuilding } from './towns';
import { Grid } from '../sim/inventory';
import { REGIONS } from './regions';
import { ObjKind } from '../sim/objects';
import { BOOKS } from '../content/lore';

const RELICS: [string, number, number, number][] = [
  ['machine_parts', 4, 1, 3], ['elec_parts', 3, 1, 2], ['ancient_coin', 3, 1, 4], ['memory_shard', 2, 1, 2], ['foodcube', 2, 1, 3], ['maker_tablet', 2, 1, 1],
  ['iron_plates', 2, 2, 5], ['steel_bars', 1, 1, 3], ['old_codex', 0.5, 1, 1], ['repair_kit', 1, 1, 1], ['surgical_kit', 0.6, 1, 1], ['gasmask', 0.4, 1, 1],
];
const OLD_GEAR: [string, number][] = [['moonfang', 0.3], ['sunderer', 0.3], ['warden_pike', 0.4], ['heater', 1], ['longsliver', 1], ['visor_helm', 0.3], ['hollow_shell', 0.2], ['siege_xbow', 0.4], ['hunter_bow', 0.6], ['ringsabre', 0.5]];
/** What a foundry's stores hold: cells, servos, parts, and now and then a beam gun. */
const MACHINE_LOOT: [string, number, number, number][] = [
  ['energy_cell', 4, 3, 10], ['servo_motor', 3, 1, 2], ['elec_parts', 3, 1, 3], ['machine_parts', 3, 1, 3], ['maker_optic', 1, 1, 1],
  ['repair_kit', 1, 1, 1], ['iron_plates', 2, 2, 4], ['laser_pistol', 0.3, 1, 1], ['laser_rifle', 0.12, 1, 1],
];
const CAMP_LOOT: [string, number, number, number][] = [['dried_meat', 3, 2, 6], ['grog', 2, 1, 4], ['bandages', 2, 1, 4], ['hide', 1, 1, 3], ['iron_plates', 1, 1, 3], ['dreamleaf', 1, 1, 4], ['shackles', 1, 1, 2], ['first_aid', 1, 1, 2], ['bolts', 1, 10, 30]];

function fill(g: Grid, table: [string, number, number, number][], n: number, rng: RNG) {
  for (let i = 0; i < n; i++) {
    const [id, , a, b] = rng.weighted(table.map((e) => [e, e[1]] as const));
    g.add(id, rng.int(a, b));
  }
}

export function buildSite(W: World, T: Terrain, site: Site, rng: RNG) {
  const reg = REGIONS[site.region];
  const add = (kind: ObjKind, def: string, x: number, z: number, rot = 0, extra: any = {}) => W.addObj({ id: 0, kind, def, x, z, y: T.heightAt(x, z), rot, owner: extra.owner ?? '', site: site.id, parent: 0, built: true, ...extra });
  const around = (r: number) => { const a = rng.range(0, 6.28), d = rng.range(r * 0.3, r); return [site.x + Math.sin(a) * d, site.z + Math.cos(a) * d] as [number, number]; };
  const k = site.kind;
  const style = reg.key === 'mire' ? 'swamp' : 'tent';
  switch (k) {
    case 'ruin':
    case 'ruin_tower':
    case 'ruin_dome':
    case 'ruin_lab':
    case 'glass_ruin': {
      const big = k === 'ruin_lab' || k === 'ruin_dome' || site.landmark;
      const n = big ? rng.int(2, 3) : rng.int(1, 2);
      for (let i = 0; i < n; i++) {
        const [x, z] = i === 0 ? [site.x, site.z] : around(site.r * 0.7);
        const b = placeBuilding(W, T, null, BUILDINGS[i === 0 && big ? 'ruin_big' : 'ruin_small'], undefined, site.name, x, z, rng.range(0, 6.28), '', site.id, 'ruin', rng);
        for (const fid of b.data.furniture) {
          const f = W.objs.get(fid);
          if (f?.inv) {
            const rich = k === 'ruin_lab' ? 3 : big ? 2 : 1;
            fill(f.inv, RELICS, rng.int(1, 2 + rich), rng);
            if (rng.chance(0.12 * rich)) { const [id] = rng.weighted(OLD_GEAR.map((g) => [g, g[1]] as const)); f.inv.add(id, 1, rng.int(3, 5)); }
            if (k === 'ruin_lab' && rng.chance(0.5)) f.inv.add('relic_core', 1);
            if (k === 'ruin_lab') f.inv.add('old_codex', 1);
            if (rng.chance(0.18 * rich)) { const rare = BOOKS.filter((bk) => bk.rare || bk.kind === 'journal' || bk.kind === 'technical'); f.inv.add('book_' + rng.pick(rare).key, 1); }
            if (k === 'glass_ruin' && rng.chance(0.4)) f.inv.add('old_codex', 1);
          }
        }
      }
      break;
    }
    case 'wreck': {
      for (let i = 0; i < rng.int(4, 8); i++) { const [x, z] = around(site.r); add('decor', 'wreckage', x, z, rng.range(0, 6.28), { data: { s: rng.range(1, 3) } }); }
      for (let i = 0; i < rng.int(1, 3); i++) { const [x, z] = around(site.r * 0.6); const c = add('crate', 'crate_old', x, z, rng.range(0, 6), { inv: new Grid(6, 6) }); fill(c.inv!, RELICS, rng.int(1, 3), rng); }
      break;
    }
    case 'camp_reavers':
    case 'camp_starvelings':
    case 'camp_scorched':
    case 'camp_mawkin':
    case 'mist_camp':
    case 'caravan':
    case 'blackcomb_nest': {
      const owner = k === 'caravan' ? 'drifters' : k === 'camp_mawkin' ? 'mawkin' : k === 'mist_camp' ? 'mistcrawlers' : k === 'blackcomb_nest' ? 'blackcomb' : k.replace('camp_', '');
      add('decor', 'firepit', site.x, site.z, 0, { owner });
      const tents = rng.int(2, 4);
      for (let i = 0; i < tents; i++) {
        const a = (i / tents) * 6.28 + rng.range(-0.3, 0.3), d = rng.range(7, 11);
        const x = site.x + Math.sin(a) * d, z = site.z + Math.cos(a) * d;
        placeBuilding(W, T, null, BUILDINGS[i === 0 ? 'tent_big' : 'tent'], undefined, undefined, x, z, Math.atan2(site.x - x, site.z - z), owner, site.id, k === 'camp_mawkin' || k === 'mist_camp' ? 'hide' : k === 'blackcomb_nest' ? 'hive_dead' : style, rng);
      }
      const chest = add('chest', 'chest', site.x + 3, site.z + 2, rng.range(0, 6), { inv: new Grid(6, 6), owner, locked: 20 });
      fill(chest.inv!, CAMP_LOOT, rng.int(2, 5), rng);
      if (k === 'camp_reavers' || k === 'camp_mawkin') {
        for (let i = 0; i < rng.int(0, 2); i++) { const [x, z] = around(site.r * 0.8); add('cage', 'cage', x, z, rng.range(0, 6), { owner, locked: 30 }); }
      }
      break;
    }
    case 'homestead': {
      const b = placeBuilding(W, T, null, BUILDINGS.farmhouse, undefined, 'Homestead', site.x, site.z, rng.range(0, 6.28), 'drifters', site.id, reg.key === 'vale' ? 'concord' : reg.key === 'ember' ? 'ember' : 'adobe', rng);
      const fx = site.x + Math.sin(b.rot) * 16, fz = site.z + Math.cos(b.rot) * 16;
      add('farm', reg.fertility > 0.6 ? 'wheat' : 'cactus', fx, fz, b.rot, { owner: 'drifters', data: { w: 18, d: 12, growth: rng.range(0.3, 1), crop: reg.fertility > 0.6 ? 'wheat' : 'cactus' } });
      break;
    }
    case 'shack':
    case 'hermit':
      placeBuilding(W, T, null, BUILDINGS.shack, undefined, site.name, site.x, site.z, rng.range(0, 6.28), 'drifters', site.id, reg.key === 'mire' ? 'swamp' : 'shanty', rng);
      break;
    case 'shrine':
      placeBuilding(W, T, null, BUILDINGS.shrine, undefined, site.name, site.x, site.z, rng.range(0, 6.28), 'ember', site.id, 'ember', rng);
      break;
    case 'monolith':
      for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.28; add('decor', 'standing_stone', site.x + Math.sin(a) * site.r * 0.6, site.z + Math.cos(a) * site.r * 0.6, a, { data: { r: 1 } }); }
      break;
    case 'warden_post': {
      placeBuilding(W, T, null, BUILDINGS.ruin_small, undefined, site.name, site.x, site.z, rng.range(0, 6.28), '', site.id, 'ruin', rng);
      add('decor', 'pillar', site.x + 6, site.z, 0);
      break;
    }
    case 'foundry': {
      // a factory hall among the hulks of half-built machines, lit by pillars that still hum
      placeBuilding(W, T, null, BUILDINGS.ruin_big, undefined, site.name, site.x, site.z, rng.range(0, 6.28), '', site.id, 'ruin', rng);
      for (let i = 0; i < rng.int(1, 2); i++) { const [x, z] = around(site.r); placeBuilding(W, T, null, BUILDINGS.ruin_small, undefined, site.name, x, z, rng.range(0, 6.28), '', site.id, 'ruin', rng); }
      for (let i = 0; i < rng.int(5, 9); i++) { const [x, z] = around(site.r * 1.1); add('decor', 'wreckage', x, z, rng.range(0, 6.28), { data: { s: rng.range(1.2, 2.6) } }); }
      for (let i = 0; i < rng.int(2, 3); i++) { const [x, z] = around(site.r * 0.8); add('decor', 'pillar', x, z, 0); }
      for (let i = 0; i < rng.int(2, 4); i++) { const [x, z] = around(site.r * 0.7); const c = add('crate', 'crate_old', x, z, rng.range(0, 6), { inv: new Grid(6, 6) }); fill(c.inv!, MACHINE_LOOT, rng.int(2, 4), rng); }
      break;
    }
  }
}
