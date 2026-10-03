// Settlement layouts on the overworld. Hollowbrook has three states: whole,
// burning (the night of the raid) and ruined.

import { MapBuilder } from '../../world/build';
import { T } from '../../world/terrain';
import { BuildingSpec } from '../../gfx/buildings';
import { CLOTH, P } from '../../gfx/palette';
import { LOC } from './layout';
import { flag } from '../../state';
import { TILE } from '../../engine/util';
import { place } from '../places';

type Spec = Omit<BuildingSpec, 'seed'> & { seed?: number };

/** A building; if it has an interior, links the door and creates `<interior>_out` on this map. */
export function house(b: MapBuilder, tx: number, ty: number, spec: Spec, interior?: string, name?: string, opts: { locked?: number; key?: string; owner?: string; night?: boolean; burning?: boolean; dark?: boolean } = {}) {
  const door = interior ? { to: interior, spawn: 'door', locked: opts.locked, key: opts.key, owner: opts.owner, night: opts.night } : undefined;
  const o = b.building(tx, ty, spec, door, { name, key: interior ? 'bld:' + interior : undefined, dark: opts.dark });
  if (interior) b.spawn(interior + '_out', tx + spec.door, ty + spec.h + 1, 0);
  if (opts.burning) o.data = { ...(o.data || {}), burning: true };
  return o;
}

// ---------------------------------------------------------------- Hollowbrook

export function hollowbrook(b: MapBuilder) {
  const state: 'normal' | 'burning' | 'ruined' = flag('hb_state') || 'normal';
  const ruined = state === 'ruined', burning = state === 'burning';
  const X = LOC.hollowbrook.x, Y = LOC.hollowbrook.y;
  // the green and the lanes
  b.blob(38, 101, 6, 4, T.DIRT, 0.35, [T.GRASS, T.MEADOW, T.FOREST]);
  b.blob(38, 101, 4, 2.6, T.GRASS, 0.25);
  b.path([[39, 98], [46, 97]], 1.6, T.DIRT, 0.3);
  b.path([[40, 104], [44, 108]], 1.6, T.DIRT, 0.3);
  b.path([[36, 104], [37, 108]], 1.6, T.DIRT, 0.3);
  b.path([[46, 104], [50, 107]], 1.6, T.DIRT, 0.3);
  // fields
  const fieldT = ruined ? T.BURNT_WHEAT : T.WHEAT;
  const fields: [number, number, number, number, number][] = [
    [56, 86, 11, 8, fieldT], [60, 103, 12, 7, ruined ? T.ASH : T.FIELD], [44, 115, 9, 4, ruined ? T.ASH : T.VEG], [33, 112, 8, 6, fieldT], [66, 91, 8, 6, fieldT],
  ];
  for (const [fx, fy, fw, fh, ft] of fields) { b.fill(fx, fy, fw, fh, ft); b.reserve(fx, fy, fw, fh); }
  if (ruined) b.blob(44, 100, 13, 9, T.ASH, 0.6, [T.GRASS, T.DIRT, T.MEADOW, T.FOREST]);
  const style = (normal: 'cottage' | 'log' | 'stone'): BuildingSpec['style'] => (ruined ? 'burned' : normal);
  const doorOf = (id: string) => (ruined ? undefined : id);
  const burnOpt = { burning };
  // the old linden on the green
  if (ruined) b.tree(38, 101, 'burnt', 3, false); else b.tree(38, 101, 'linden', 7, false);
  b.reserve(37, 100, 3, 3);
  // family home and the forge yard
  const H = LOC.home;
  house(b, H.x, H.y, { w: 5, h: 3, style: style('cottage'), door: 2, chimney: !ruined, roof: 'thatch', tint: CLOTH.green, seed: 11 }, doorOf('hb_home'), 'your home', burnOpt);
  if (ruined) b.spawn('hb_home_out', H.x + 2, H.y + 4, 3);
  const F = LOC.forge;
  b.fill(F.x - 1, F.y - 1, 7, 5, ruined ? T.ASH : T.DIRT);
  b.prop('forge', F.x, F.y, { interact: ruined ? { type: 'script', script: 'hearthstone', label: 'Search the cold forge' } : { type: 'bench', bench: 'forge', label: "Father's forge" }, key: 'hb_forge' });
  b.prop('anvil', F.x + 3, F.y + 1, { key: 'hb_anvil' });
  b.prop('barrel', F.x + 4, F.y - 1, { opt: 'water' });
  b.prop('grindstone', F.x + 5, F.y + 2, { interact: { type: 'bench', bench: 'grindstone' } });
  if (!ruined) { b.prop('woodpile', F.x - 1, F.y + 2); b.prop('weaponrack', F.x + 5, F.y - 1); }
  b.spawn('forge_front', F.x + 1, F.y + 2, 3);
  b.spawn('anvil_spot', F.x + 3, F.y + 2, 3);
  // houses (door columns face the lanes)
  house(b, 16, 90, { w: 4, h: 3, style: style('cottage'), door: 2, chimney: true, seed: 12 }, doorOf('hb_havel'), "Old Havel's house", burnOpt);
  house(b, 32, 90, { w: 6, h: 3, style: style('cottage'), door: 3, chimney: true, roof: ruined ? 'thatch' : 'clay', seed: 13 }, doorOf('hb_jiri'), "the reeve's house", burnOpt);
  house(b, 35, 106, { w: 4, h: 3, style: style('cottage'), door: 1, seed: 14 }, doorOf('hb_hanka'), "Hanka's house", burnOpt);
  house(b, 20, 100, { w: 3, h: 2, style: style('log'), door: 1, seed: 15 }, doorOf('hb_vojta'), "Vojta's hovel", burnOpt);
  house(b, 48, 105, { w: 4, h: 3, style: style('cottage'), door: 1, chimney: true, seed: 16 }, doorOf('hb_bara'), "Widow Bára's house", burnOpt);
  house(b, 41, 105, { w: 5, h: 3, style: style('cottage'), door: 2, chimney: true, sign: 'tavern', seed: 17 }, doorOf('hb_tavern'), 'The Rooster', burnOpt);
  house(b, 35, 82, { w: 4, h: 4, style: ruined ? 'ruin' : 'stone', door: 1, roof: 'shingle', seed: 18 }, doorOf('hb_chapel'), 'the chapel', burnOpt);
  house(b, 54, 108, { w: 4, h: 3, style: style('cottage'), door: 1, seed: 19 }, undefined, 'a cottage', burnOpt);
  house(b, 58, 94, { w: 3, h: 2, style: ruined ? 'burned' : 'barn', door: 1, seed: 20 }, undefined, 'the barn', burnOpt);
  // chapel yard graves, east of the chapel
  for (let i = 0; i < 4; i++) b.prop('grave', 46 + i * 2, 85, { variant: i });
  b.spawn('graveyard', 48, 87, 3);
  b.spawn('radek_grave', 54, 87, 3);
  // geese pen, behind the tavern and Bára's house
  b.fill(43, 110, 10, 5, T.GRASS);
  b.reserve(43, 110, 10, 5);
  if (!ruined) {
    for (let i = 0; i < 6; i++) { b.prop('fence_h', 45 + i, 110); b.prop('fence_h', 45 + i, 114); }
    b.prop('fence_v', 44, 111); b.prop('fence_v', 44, 113); b.prop('fence_v', 51, 111); b.prop('fence_v', 51, 113);
    b.prop('coop', 46, 112);
    b.prop('trough', 49, 113);
  } else {
    b.prop('fence_h_broken', 46, 110); b.prop('fence_h', 48, 114); b.prop('fence_v', 44, 111);
  }
  b.spawn('geese_pen', 48, 112);
  // the fox hollow in the wood's edge above the brook, where Lida watches the kits
  b.blob(57, 120, 3.4, 2.4, T.GRASS, 0.3, [T.FOREST]);
  b.reserve(54, 118, 7, 5);
  b.rock(59, 119, 'big', true);
  b.rock(55, 121, 'small', true);
  b.deco(57, 122, 'flowers');
  b.spawn('fox_den', 57, 121, 3);
  b.region({ id: 'foxhollow', name: 'The Fox Hollow', x: 53, y: 117, w: 9, h: 7 });
  // Pavel's sparring meadow across from the mill
  b.spawn('spar', 27, 80, 1);
  // village furniture
  b.prop('well', 42, 100, { interact: { type: 'water' } });
  if (!ruined) {
    b.prop('haystack', 61, 94);
    b.prop('cart', 62, 97, { opt: 'hay' });
    b.prop('bench', 35, 99);
    b.prop('barrel', 40, 108);
    b.prop('laundry', 50, 91);
    b.prop('bonfire', 37, 104, { key: 'hb_bonfire', hidden: !flag('bonfire_lit') });
    b.prop('skep', 24, 92);
    b.prop('kennel', H.x + 5, H.y + 1);
    for (const [ox, oy] of [[12, 95], [14, 98], [11, 99], [16, 97]]) b.tree(ox, oy, 'apple');
  } else {
    for (const [ox, oy] of [[36, 103], [44, 97], [49, 103], [30, 99], [42, 106]]) b.prop('rubble', ox, oy, { variant: ox + oy });
    b.prop('campfire', 37, 104, { opt: 'cold' });
    for (const [ox, oy] of [[12, 95], [14, 98], [11, 99]]) b.tree(ox, oy, 'burnt');
  }
  b.prop('wayshrine', 60, 101);
  b.prop('signpost', 62, 102, { interact: { type: 'travel', place: 'hollowbrook', label: 'Read the signpost' } });
  b.spawn('hollowbrook', 60, 103, 1);
  b.spawn('green', 40, 102, 3);
  b.spawn('bonfire', 37, 106, 3);
  b.spawn('bridge', 28, 101);
  b.spawn('village_east', 56, 102, 1);
  b.region({ id: 'hollowbrook', name: ruined ? 'Hollowbrook (ruins)' : 'Hollowbrook', x: X - 24, y: Y - 22, w: 52, h: 38, settlement: 'hollowbrook', music: ruined ? 'sorrow' : 'village' });
  // the mill on the brook, its wheel in the water
  const M = LOC.mill;
  house(b, M.x, M.y, { w: 5, h: 4, style: ruined ? 'burned' : 'cottage', door: 3, chimney: !ruined, seed: 21 }, ruined ? undefined : 'hb_mill', 'the mill', burnOpt);
  b.prop('waterwheel', M.x + 6, M.y + 3, { solid: false });
  for (let i = 0; i < 3; i++) b.prop('sack', M.x - 1, M.y + 1 + i, { opt: 'flour' });
  b.spawn('mill', M.x + 3, M.y + 5, 3);
  b.region({ id: 'mill', name: 'The Mill', x: M.x - 4, y: M.y - 3, w: 14, h: 12, settlement: 'hollowbrook' });
  place({ id: 'hollowbrook', name: 'Hollowbrook', x: 60, y: 103, spawn: 'hollowbrook', desc: 'Your village. The smell of bread and charcoal, the sound of the brook.', kind: 'village' });
}

// ---------------------------------------------------------------- Linden Hill

export function lindenHill(b: MapBuilder) {
  const L = LOC.linden;
  const W = L.x1 - L.x0, H = L.y1 - L.y0;
  b.fill(L.x0, L.y0, W, H, T.GRASS);
  b.wallRect(L.x0, L.y0, W, H, [{ side: 's', at: 16, width: 4 }, { side: 'n', at: 16, width: 4 }, { side: 'e', at: 20, width: 4 }]);
  // streets
  b.fill(L.x0 + 16, L.y0 + 3, 4, H - 3, T.COBBLE);
  b.fill(L.x0 + 2, L.y0 + 20, W - 2, 4, T.COBBLE);
  b.fill(L.x0 + 8, L.y0 + 14, 22, 15, T.COBBLE);
  b.fill(L.x0 + 8, L.y0 + 3, 24, 10, T.FLAGSTONE);
  b.fill(L.x0 + 30, L.y0 + 6, 8, 8, T.DIRT); // training yard
  b.reserve(L.x0, L.y0, W, H);
  const cx = L.x0 + 18; // street centre x (110)
  // castle
  house(b, L.x0 + 14, L.y0 + 4, { w: 8, h: 5, style: 'keep', door: 4, tint: CLOTH.green, tint2: P.gold3, seed: 31 }, 'lh_keep', 'the castle keep', { night: false });
  b.tree(L.x0 + 11, L.y0 + 9, 'linden', 9, false);
  b.prop('well', L.x0 + 26, L.y0 + 9, { interact: { type: 'water' } });
  b.prop('flag', L.x0 + 13, L.y0 + 10, { opt: CLOTH.green });
  b.prop('flag', L.x0 + 23, L.y0 + 10, { opt: CLOTH.green });
  // church
  house(b, L.x0 + 2, L.y0 + 4, { w: 6, h: 4, style: 'church', door: 2, seed: 32 }, 'lh_church', 'the Church of St. Wenceslas');
  for (let i = 0; i < 3; i++) b.prop('grave', L.x0 + 3 + i * 2, L.y0 + 10, { variant: i + 4 });
  // barracks & training yard
  house(b, L.x0 + 31, L.y0 + 3, { w: 6, h: 3, style: 'stone', door: 2, roof: 'slate', seed: 33 }, 'lh_barracks', 'the barracks');
  b.prop('dummy', L.x0 + 31, L.y0 + 9, { interact: { type: 'script', script: 'dummy', label: 'Practise on the dummy' } });
  b.prop('dummy', L.x0 + 33, L.y0 + 9, { interact: { type: 'script', script: 'dummy', label: 'Practise on the dummy' } });
  b.prop('target', L.x0 + 36, L.y0 + 8, { interact: { type: 'script', script: 'target', label: 'Archery practice' } });
  b.prop('target', L.x0 + 36, L.y0 + 11, { interact: { type: 'script', script: 'target', label: 'Archery practice' } });
  b.prop('weaponrack', L.x0 + 30, L.y0 + 12);
  b.spawn('yard', L.x0 + 33, L.y0 + 11, 3);
  b.spawn('ondrej_yard', L.x0 + 34, L.y0 + 7, 0);
  // market
  b.prop('fountain', cx, L.y0 + 21, { interact: { type: 'water', wash: true, label: 'Wash at the fountain' } });
  b.prop('noticeboard', L.x0 + 13, L.y0 + 15, { interact: { type: 'notice', board: 'linden' } });
  b.prop('pillory', L.x0 + 24, L.y0 + 15);
  b.building(L.x0 + 9, L.y0 + 16, { w: 3, h: 1, style: 'stall', door: -1, tint: CLOTH.red, seed: 34 });
  b.building(L.x0 + 24, L.y0 + 25, { w: 3, h: 1, style: 'stall', door: -1, tint: CLOTH.woad, seed: 35 });
  b.building(L.x0 + 9, L.y0 + 25, { w: 3, h: 1, style: 'stall', door: -1, tint: CLOTH.green, seed: 36 });
  b.spawn('market', cx, L.y0 + 24, 3);
  b.spawn('stall1', L.x0 + 10, L.y0 + 18, 0);
  b.spawn('stall2', L.x0 + 25, L.y0 + 27, 0);
  b.spawn('stall3', L.x0 + 10, L.y0 + 27, 0);
  // shops
  house(b, L.x0 + 2, L.y0 + 14, { w: 5, h: 3, style: 'townhouse', door: 2, sign: 'smith', chimney: true, seed: 37 }, 'lh_smithy', "Kovář's smithy");
  house(b, L.x0 + 2, L.y0 + 25, { w: 4, h: 3, style: 'townhouse', door: 1, sign: 'bakery', chimney: true, seed: 38 }, 'lh_bakery', "Greta's bakery");
  house(b, L.x0 + 31, L.y0 + 14, { w: 4, h: 3, style: 'townhouse', door: 1, sign: 'apothecary', seed: 39 }, 'lh_apothecary', 'the apothecary');
  house(b, L.x0 + 32, L.y0 + 25, { w: 4, h: 3, style: 'townhouse', door: 1, sign: 'tailor', seed: 40 }, 'lh_tailor', 'the tailor');
  house(b, L.x0 + 8, L.y0 + 32, { w: 4, h: 3, style: 'townhouse', door: 1, sign: 'armorer', seed: 41 }, 'lh_armorer', 'the armourer');
  house(b, L.x0 + 2, L.y0 + 31, { w: 5, h: 3, style: 'townhouse', door: 2, sign: 'bath', chimney: true, seed: 42 }, 'lh_bath', 'the bathhouse');
  house(b, L.x0 + 25, L.y0 + 30, { w: 6, h: 3, style: 'townhouse', door: 2, sign: 'tavern', chimney: true, seed: 43 }, 'lh_tavern', 'the Crooked Linden');
  house(b, L.x0 + 21, L.y0 + 34, { w: 4, h: 3, style: 'townhouse', door: 1, chimney: true, seed: 44 }, 'lh_house1', 'a house');
  house(b, L.x0 + 33, L.y0 + 32, { w: 4, h: 3, style: 'townhouse', door: 1, seed: 45 }, 'lh_house2', 'a house');
  house(b, L.x0 + 13, L.y0 + 34, { w: 4, h: 3, style: 'cottage', door: 1, chimney: true, seed: 46 }, 'lh_house3', 'a house');
  // a tile clear of the town wall, so its door opens onto the street
  house(b, L.x0 + 28, L.y0 + 34, { w: 4, h: 3, style: 'cottage', door: 1, seed: 47 }, 'lh_house4', 'a house');
  // gates: torches and guards
  for (const [x, y] of [[cx - 3, L.y1 - 1], [cx + 2, L.y1 - 1], [cx - 3, L.y0 + 3], [cx + 2, L.y0 + 3], [L.x1 - 3, L.y0 + 19], [L.x1 - 3, L.y0 + 24]]) b.prop('torch', x, y, { solid: false });
  b.spawn('south_gate', cx, L.y1 + 1, 0);
  b.spawn('north_gate', cx, L.y0 - 1, 3);
  b.spawn('east_gate', L.x1 + 1, L.y0 + 21, 2);
  b.spawn('linden', cx, L.y1 + 2, 3);
  b.spawn('castle_yard', cx, L.y0 + 11, 3);
  b.spawn('gate_guard_s1', cx - 2, L.y1, 0);
  b.spawn('gate_guard_s2', cx + 3, L.y1, 0);
  b.spawn('gate_guard_n', cx - 2, L.y0 + 2, 3);
  b.spawn('gate_guard_e', L.x1 - 1, L.y0 + 19, 2);
  b.region({ id: 'linden', name: 'Linden Hill', x: L.x0, y: L.y0, w: W, h: H, settlement: 'linden', music: 'town' });
  b.region({ id: 'linden_castle', name: 'Linden Hill Castle', x: L.x0 + 8, y: L.y0 + 3, w: 24, h: 10, settlement: 'linden', music: 'town' });
  // outside the walls
  b.fill(L.x0 - 12, L.y0 + 8, 10, 12, T.WHEAT);
  b.fill(L.x0 - 12, L.y0 + 22, 10, 10, T.FIELD);
  b.reserve(L.x0 - 12, L.y0 + 8, 10, 24);
  house(b, L.x1 + 3, L.y1 - 6, { w: 5, h: 3, style: 'log', door: 2, seed: 48 }, 'lh_tannery', "Zbyněk's tannery");
  b.prop('dryingrack', L.x1 + 9, L.y1 - 4);
  b.prop('gallows', L.x1 + 4, L.y1 + 4);
  b.prop('wayshrine', cx + 4, L.y1 + 6);
  b.prop('signpost', cx - 3, L.y1 + 3, { interact: { type: 'travel', place: 'linden', label: 'Read the signpost' } });
  b.prop('cart', cx + 6, L.y1 + 2, { opt: 'barrels' });
  b.building(L.x0 - 8, L.y1 + 2, { w: 5, h: 3, style: 'barn', door: 2, seed: 49 });
  place({ id: 'linden', name: 'Linden Hill', x: cx, y: L.y1 + 2, spawn: 'linden', desc: 'Sir Bertram\'s walled market town, under the old linden on the hill.', kind: 'town' });
}

// ---------------------------------------------------------------- Silverdale

export function silverdale(b: MapBuilder) {
  const S = LOC.silverdale;
  b.blob(S.x, S.y + 2, 12, 8, T.GRAVEL, 0.5, [T.GRASS, T.MEADOW, T.FOREST]);
  b.path([[S.x, S.y + 10], [S.x + 2, S.y - 10]], 2, T.DIRT, 0.4);
  const M = LOC.mine;
  b.fill(M.x - 8, M.y - 8, 18, 8, T.ROCK);
  b.prop('mine', M.x, M.y - 1, { solid: false });
  b.marker(M.x * TILE + 8, (M.y - 1) * TILE + 12, { type: 'door', to: 'sd_mine', spawn: 'door', label: 'Enter the mine' }, { key: 'mine_door' });
  b.spawn('sd_mine_out', M.x, M.y + 1, 0);
  house(b, S.x + 6, S.y - 6, { w: 5, h: 3, style: 'townhouse', door: 2, chimney: true, roof: 'slate', seed: 51 }, 'sd_foreman', "the foreman's house", { night: true, owner: 'vilem' });
  house(b, S.x - 6, S.y - 3, { w: 4, h: 3, style: 'log', door: 1, sign: 'shop', seed: 52 }, 'sd_store', 'Silverdale stores');
  house(b, S.x - 2, S.y + 5, { w: 4, h: 3, style: 'log', door: 1, chimney: true, seed: 53 }, 'sd_anna', "Anna's house");
  house(b, S.x + 9, S.y + 3, { w: 4, h: 3, style: 'stone', door: 1, roof: 'shingle', seed: 54 }, 'sd_chapel', "the miners' chapel");
  house(b, S.x - 12, S.y + 4, { w: 4, h: 3, style: 'log', door: 1, seed: 55 });
  house(b, S.x + 3, S.y + 11, { w: 4, h: 2, style: 'log', door: 1, seed: 56 });
  b.prop('orepile', S.x + 4, S.y - 2);
  b.prop('orepile', S.x - 2, S.y - 5);
  b.prop('minecart', S.x + 1, S.y - 3);
  b.prop('cart', S.x - 6, S.y + 2, { opt: 'barrels' });
  b.prop('noticeboard', S.x + 2, S.y + 2, { interact: { type: 'notice', board: 'silverdale' } });
  b.prop('well', S.x - 3, S.y + 1, { interact: { type: 'water' } });
  b.prop('signpost', S.x + 4, S.y + 8, { interact: { type: 'travel', place: 'silverdale', label: 'Read the signpost' } });
  b.spawn('silverdale', S.x + 3, S.y + 9, 3);
  b.spawn('mine_mouth', M.x + 2, M.y + 2, 3);
  b.spawn('square', S.x + 1, S.y + 3, 3);
  b.region({ id: 'silverdale', name: 'Silverdale', x: S.x - 16, y: S.y - 16, w: 32, h: 32, settlement: 'silverdale', music: 'town' });
  place({ id: 'silverdale', name: 'Silverdale', x: S.x + 3, y: S.y + 9, spawn: 'silverdale', desc: 'A mining village under the grey hills. The Lindenmark\'s silver comes out of the ground here.', kind: 'mine' });
}

// ---------------------------------------------------------------- Priory

export function priory(b: MapBuilder) {
  const P0 = LOC.priory;
  const W = P0.x1 - P0.x0, H = P0.y1 - P0.y0;
  b.fill(P0.x0, P0.y0, W, H, T.GRASS);
  b.wallRect(P0.x0, P0.y0, W, H, [{ side: 'w', at: 9, width: 4 }]);
  b.reserve(P0.x0, P0.y0, W, H);
  b.fill(P0.x0 + 2, P0.y0 + 10, W - 4, 3, T.FLAGSTONE);
  house(b, P0.x0 + 9, P0.y0 + 3, { w: 8, h: 5, style: 'church', door: 3, seed: 61 }, 'pr_church', "St. Aldhelm's church");
  house(b, P0.x0 + 3, P0.y0 + 3, { w: 4, h: 3, style: 'stone', door: 1, roof: 'slate', seed: 62 }, 'pr_abbot', "the abbot's lodging");
  house(b, P0.x0 + 3, P0.y0 + 14, { w: 6, h: 3, style: 'stone', door: 2, roof: 'slate', seed: 63 }, 'pr_library', 'the scriptorium');
  house(b, P0.x0 + 14, P0.y0 + 14, { w: 6, h: 3, style: 'stone', door: 2, roof: 'slate', chimney: true, seed: 64 }, 'pr_dorm', 'the dormitory');
  b.fill(P0.x0 + 11, P0.y0 + 18, 10, 2, T.VEG);
  b.prop('well', P0.x0 + 11, P0.y0 + 11, { interact: { type: 'water' } });
  b.prop('statue', P0.x0 + 18, P0.y0 + 11);
  // bee orchard outside the east wall
  for (let i = 0; i < 6; i++) b.prop('skep', P0.x1 + 2 + (i % 3) * 2, P0.y0 + 4 + Math.floor(i / 3) * 3, { interact: i === 0 ? { type: 'script', script: 'skeps', label: 'The hives' } : undefined });
  for (const [dx, dy] of [[4, 2], [7, 5], [3, 9], [8, 11], [5, 14]]) b.tree(P0.x1 + dx, P0.y0 + dy, 'apple');
  b.spawn('priory', P0.x0 - 2, P0.y0 + 11, 2);
  b.spawn('cloister', P0.x0 + 12, P0.y0 + 11, 3);
  b.spawn('hives', P0.x1 + 3, P0.y0 + 7, 1);
  b.prop('signpost', P0.x0 - 4, P0.y0 + 13, { interact: { type: 'travel', place: 'priory', label: 'Read the signpost' } });
  b.region({ id: 'priory', name: "St. Aldhelm's Priory", x: P0.x0 - 4, y: P0.y0 - 2, w: W + 16, h: H + 4, settlement: 'priory', music: 'priory' });
  place({ id: 'priory', name: "St. Aldhelm's Priory", x: P0.x0 - 2, y: P0.y0 + 11, spawn: 'priory', desc: 'Benedictine brothers, bees, a library, and a bell that has fallen silent.', kind: 'priory' });
}

// ---------------------------------------------------------------- Refugee camp

export function refugeeCamp(b: MapBuilder) {
  const C = LOC.camp;
  b.blob(C.x, C.y, 9, 6, T.DIRT, 0.5, [T.GRASS, T.MEADOW, T.FOREST]);
  b.reserve(C.x - 10, C.y - 7, 20, 14);
  const tents: [number, number, string][] = [[-7, -4, '#b8ae94'], [-2, -5, '#a89c7e'], [4, -4, '#b8ae94'], [-8, 2, '#9c9078'], [5, 2, '#a89c7e']];
  for (const [dx, dy, c] of tents) b.building(C.x + dx, C.y + dy, { w: 3, h: 2, style: 'tent', door: -1, tint: c, tint2: '#6a5a44', seed: dx * 7 + dy });
  house(b, C.x + 1, C.y + 3, { w: 3, h: 2, style: 'tent', door: 1, tint: '#d8cfb5', tint2: '#8a7a60', seed: 71 }, 'camp_tent', 'the far tent');
  b.prop('campfire', C.x - 1, C.y);
  b.prop('campfire', C.x + 7, C.y - 1);
  b.prop('cart', C.x - 5, C.y + 5);
  b.prop('noticeboard', C.x + 2, C.y - 1, { interact: { type: 'notice', board: 'camp' } });
  b.prop('wayshrine', LOC.crossroads.x + 3, LOC.crossroads.y - 3);
  b.prop('signpost', LOC.crossroads.x - 2, LOC.crossroads.y - 2, { interact: { type: 'travel', place: 'crossroads', label: 'Read the signpost' } });
  for (let i = 0; i < 3; i++) b.prop('bedroll', C.x - 4 + i * 2, C.y + 2, { opt: [CLOTH.olive, CLOTH.brown, CLOTH.undyed][i] });
  b.spawn('camp', C.x, C.y + 7, 3);
  b.spawn('crossroads', LOC.crossroads.x, LOC.crossroads.y - 1, 3);
  b.spawn('campfire', C.x - 1, C.y + 1, 3);
  b.region({ id: 'camp', name: 'The Refugee Camp', x: C.x - 12, y: C.y - 8, w: 24, h: 17, settlement: 'refugees', music: 'sorrow' });
  place({ id: 'crossroads', name: 'The Crossroads', x: LOC.crossroads.x, y: LOC.crossroads.y - 1, spawn: 'crossroads', desc: 'Where the roads meet, the people who fled the Company have made a camp of sorts.', kind: 'camp' });
}

// ---------------------------------------------------------------- Forest places

export function forestPlaces(b: MapBuilder) {
  // Wenda's hut
  const Wd = LOC.wenda;
  b.blob(Wd.x + 2, Wd.y + 2, 6, 5, T.GRASS, 0.3, [T.FOREST]);
  house(b, Wd.x, Wd.y, { w: 5, h: 3, style: 'log', door: 2, chimney: true, roof: 'thatch', seed: 81 }, 'wenda_hut', "Wenda's hut");
  b.fill(Wd.x + 6, Wd.y + 1, 3, 3, T.VEG);
  b.prop('dryingrack', Wd.x - 2, Wd.y + 3);
  b.prop('skep', Wd.x + 6, Wd.y + 5);
  b.prop('cauldron', Wd.x - 1, Wd.y + 5);
  b.prop('fence_h', Wd.x + 6, Wd.y + 4); b.prop('fence_h', Wd.x + 7, Wd.y + 4); b.prop('fence_h', Wd.x + 8, Wd.y + 4);
  b.spawn('wenda', Wd.x + 2, Wd.y + 5, 3);
  b.region({ id: 'wenda', name: "Wenda's Clearing", x: Wd.x - 5, y: Wd.y - 4, w: 16, h: 13, settlement: 'forest', music: 'forest' });
  place({ id: 'wenda', name: "Wenda's Hut", x: Wd.x + 2, y: Wd.y + 5, spawn: 'wenda', desc: 'The herb-wife\'s hut, deep in the south woods. Smoke and strange smells.', kind: 'wild', hidden: true });
  // charcoal burners
  const Bn = LOC.burners;
  b.blob(Bn.x, Bn.y, 7, 5, T.DIRT, 0.5, [T.FOREST, T.GRASS]);
  house(b, Bn.x - 5, Bn.y - 4, { w: 4, h: 3, style: 'log', door: 1, seed: 82 }, 'burner_hut', "the burners' hut");
  for (const [dx, dy] of [[1, -2], [4, 1], [0, 3]]) {
    const k = b.prop('haystack', Bn.x + dx, Bn.y + dy, { variant: 2 });
    k.smoke = { x: 0, y: -18 };
    k.data = { kiln: true };
  }
  b.prop('woodpile', Bn.x - 3, Bn.y + 2);
  b.prop('woodpile', Bn.x + 6, Bn.y - 3);
  b.spawn('burners', Bn.x - 2, Bn.y + 3, 3);
  b.region({ id: 'burners', name: "Charcoal Burners' Camp", x: Bn.x - 9, y: Bn.y - 7, w: 18, h: 14, settlement: 'forest', music: 'forest' });
  place({ id: 'burners', name: 'Charcoal Burners', x: Bn.x - 2, y: Bn.y + 3, spawn: 'burners', desc: 'Smoking clamps of wood in a clearing. The burners sell charcoal and keep to themselves.', kind: 'wild', hidden: true });
  // bandit camp
  const Bd = LOC.bandits;
  b.blob(Bd.x, Bd.y, 7, 5, T.DIRT, 0.5, [T.FOREST, T.GRASS]);
  for (const [dx, dy] of [[-5, -3], [2, -4], [-4, 2]]) b.building(Bd.x + dx, Bd.y + dy, { w: 3, h: 2, style: 'tent', door: -1, tint: '#5a5040', tint2: '#3a3020', seed: dx + dy * 3 });
  b.prop('campfire', Bd.x, Bd.y);
  b.prop('crate', Bd.x + 4, Bd.y + 1);
  b.prop('barrel', Bd.x + 5, Bd.y + 2);
  b.prop('chest', Bd.x + 3, Bd.y - 1, { interact: { type: 'chest', container: 'bandit_chest', label: 'bandit chest' } });
  for (let i = -6; i <= 6; i += 1) { if (Math.abs(i) > 1) b.prop('fence_h', Bd.x + i, Bd.y + 6, { opt: '', variant: 0 }); }
  b.spawn('bandits', Bd.x, Bd.y + 8, 3);
  b.region({ id: 'bandits', name: 'A Hidden Camp', x: Bd.x - 9, y: Bd.y - 7, w: 18, h: 15, settlement: 'bandits', music: 'tension' });
  // hunter's lodge
  const Lg = LOC.lodge;
  b.blob(Lg.x + 2, Lg.y + 2, 6, 4, T.GRASS, 0.3, [T.FOREST]);
  house(b, Lg.x, Lg.y, { w: 5, h: 3, style: 'log', door: 2, chimney: true, roof: 'shingle', seed: 83 }, 'lodge', "the hunter's lodge");
  b.prop('dryingrack', Lg.x + 6, Lg.y + 2);
  b.prop('target', Lg.x + 7, Lg.y + 5, { interact: { type: 'script', script: 'target', label: 'Archery practice' } });
  b.prop('kennel', Lg.x - 2, Lg.y + 2);
  b.prop('woodpile', Lg.x + 5, Lg.y);
  b.spawn('lodge', Lg.x + 2, Lg.y + 5, 3);
  b.region({ id: 'lodge', name: "The Hunter's Lodge", x: Lg.x - 5, y: Lg.y - 4, w: 16, h: 13, settlement: 'forest', music: 'forest' });
  place({ id: 'lodge', name: "Hunter's Lodge", x: Lg.x + 2, y: Lg.y + 5, spawn: 'lodge', desc: 'Matěj the hunter keeps the lord\'s forest and his own counsel.', kind: 'wild' });
  // angelica grove
  const Ag = LOC.angelicaGrove;
  b.blob(Ag.x, Ag.y, 5, 4, T.MUD, 0.5, [T.FOREST, T.GRASS]);
  b.blob(Ag.x + 1, Ag.y, 2.2, 1.6, T.WATER, 0.3);
  for (const [dx, dy] of [[-4, -2], [3, 3], [-2, 3], [4, -2]]) b.herb(Ag.x + dx, Ag.y + dy, 'angelica', `angelica_${dx}_${dy}`);
  b.tree(Ag.x - 5, Ag.y + 1, 'willow', 2);
  b.tree(Ag.x + 5, Ag.y - 3, 'willow', 5);
  b.region({ id: 'grove', name: 'A Damp Grove', x: Ag.x - 7, y: Ag.y - 6, w: 14, h: 12, music: 'forest' });
  b.spawn('grove', Ag.x - 6, Ag.y + 4, 1);
  // wolf den
  const Wf = LOC.wolfDen;
  b.rock(Wf.x, Wf.y, 'boulder', true);
  b.rock(Wf.x + 3, Wf.y - 1, 'boulder');
  b.rock(Wf.x - 2, Wf.y + 2, 'big', true);
  b.spawn('wolfden', Wf.x, Wf.y + 3);
  b.region({ id: 'wolfden', name: 'Wolf Rocks', x: Wf.x - 8, y: Wf.y - 6, w: 16, h: 12, music: 'tension' });
  // chapel ruin with moonwort
  const Cr = LOC.chapelRuin;
  b.building(Cr.x, Cr.y, { w: 5, h: 4, style: 'ruin', door: -1, seed: 91 });
  for (let i = 0; i < 5; i++) b.prop('grave', Cr.x - 3 + i * 2, Cr.y + 6, { variant: 10 + i });
  for (const [dx, dy] of [[-2, 2], [6, 1], [7, 5], [-3, 7]]) b.herb(Cr.x + dx, Cr.y + dy, 'moonwort', `moonwort_${dx}_${dy}`);
  b.spawn('ruin', Cr.x + 2, Cr.y + 8);
  b.region({ id: 'ruin', name: 'The Old Chapel', x: Cr.x - 6, y: Cr.y - 3, w: 18, h: 14, music: 'night' });
  place({ id: 'ruin', name: 'The Old Chapel', x: Cr.x + 2, y: Cr.y + 8, spawn: 'ruin', desc: 'A roofless chapel on the old pass road. Pale ferns grow among the graves.', kind: 'ruin', hidden: true });
  // Crow's Stone
  const Cs = LOC.crowStone;
  b.rock(Cs.x, Cs.y, 'boulder', true);
  b.prop('campfire', Cs.x + 2, Cs.y + 2, { opt: 'cold' });
  b.marker((Cs.x + 2) * TILE + 8, (Cs.y + 2) * TILE + 10, { type: 'script', script: 'crowstone', label: 'Examine the old campfire' }, { key: 'crowstone_fire' });
  b.spawn('crowstone', Cs.x + 1, Cs.y + 4);
  b.region({ id: 'crowstone', name: "The Crow's Stone", x: Cs.x - 5, y: Cs.y - 4, w: 11, h: 10 });
}

// ---------------------------------------------------------------- Harrow's war camp

export function warCamp(b: MapBuilder) {
  const C = LOC.warcamp;
  const W = C.x1 - C.x0, H = C.y1 - C.y0;
  b.fill(C.x0, C.y0, W, H, T.DIRT);
  b.reserve(C.x0 - 1, C.y0 - 1, W + 2, H + 2);
  // palisade with an opening on the west
  for (let x = C.x0; x < C.x1; x++) { b.prop('fence_h', x, C.y0 - 1); b.prop('fence_h', x, C.y1); }
  for (let y = C.y0; y < C.y1; y += 1) { b.prop('fence_v', C.x1, y); if (y < C.y0 + 7 || y > C.y0 + 10) b.prop('fence_v', C.x0 - 1, y); }
  const tents: [number, number][] = [[2, 2], [7, 2], [12, 2], [2, 8], [2, 13], [12, 12]];
  tents.forEach(([dx, dy], i) => b.building(C.x0 + dx, C.y0 + dy, { w: 3, h: 2, style: 'tent', door: -1, tint: i % 2 ? '#262220' : '#8e2f2f', tint2: i % 2 ? '#8e2f2f' : '#262220', seed: 100 + i }));
  house(b, C.x0 + 8, C.y0 + 11, { w: 4, h: 3, style: 'tent', door: 2, tint: '#b8ae94', tint2: '#6a5a44', seed: 107 }, 'ilse_tent', "the cook's tent");
  b.building(C.x0 + 15, C.y0 + 5, { w: 4, h: 3, style: 'tent', door: -1, tint: '#262220', tint2: '#8e2f2f', seed: 108 }, undefined, { name: "Harrow's tent" });
  b.prop('campfire', C.x0 + 6, C.y0 + 7);
  b.prop('campfire', C.x0 + 14, C.y0 + 10);
  b.prop('cage', C.x0 + 16, C.y0 + 14, { key: 'cage' });
  b.prop('cart', C.x0 + 5, C.y0 + 15, { opt: 'barrels' });
  b.prop('barrelstack', C.x0 + 1, C.y0 + 16);
  b.prop('flag', C.x0 + 1, C.y0 + 6, { opt: CLOTH.black });
  b.prop('flag', C.x0 + 1, C.y0 + 12, { opt: CLOTH.black });
  b.prop('dummy', C.x0 + 10, C.y0 + 7);
  b.building(C.x0 + 4, C.y0 + 5, { w: 3, h: 1, style: 'stall', door: -1, tint: CLOTH.black, tint2: CLOTH.red, seed: 109 });
  b.spawn('warcamp_gate', C.x0 - 3, C.y0 + 8, 2);
  b.spawn('warcamp_in', C.x0 + 3, C.y0 + 9, 2);
  b.spawn('warcamp_cage', C.x0 + 15, C.y0 + 16, 3);
  b.region({ id: 'warcamp', name: "Harrow's War Camp", x: C.x0 - 2, y: C.y0 - 2, w: W + 4, h: H + 4, settlement: 'harrow', music: 'tension', restricted: 'always' });
  place({ id: 'warcamp', name: 'The War Camp', x: C.x0 - 3, y: C.y0 + 8, spawn: 'warcamp_gate', desc: 'Harrow\'s Company, camped in the lee of Ravenstone: smoke, horses, and black banners.', kind: 'camp', hidden: true });
}

// ---------------------------------------------------------------- Ravenstone

export function ravenstone(b: MapBuilder) {
  const R = LOC.ravenstone;
  const W = R.x1 - R.x0, H = R.y1 - R.y0;
  // crag
  b.blob(R.x0 + W / 2, R.y0 + H / 2, W / 2 + 7, H / 2 + 6, T.ROCK, 0.3);
  b.fill(R.x0, R.y0, W, H, T.DIRT);
  b.wallRect(R.x0, R.y0, W, H, [{ side: 's', at: 10, width: 4 }]);
  // approach ramp through the rock
  b.path([[R.x0 + 12, R.y1 + 7], [R.x0 + 12, R.y1 - 1]], 4, T.ROAD, 0.2, true);
  b.fill(R.x0 + 3, R.y0 + 12, W - 6, 4, T.FLAGSTONE);
  house(b, R.x0 + 8, R.y0 + 3, { w: 8, h: 6, style: 'keep', door: 4, tint: CLOTH.black, tint2: CLOTH.purple, seed: 111 }, 'rv_hall', 'the keep of Ravenstone', { locked: 3 });
  b.building(R.x0 + 2, R.y0 + 3, { w: 3, h: 3, style: 'tower', door: -1, seed: 112 });
  b.building(R.x1 - 5, R.y0 + 3, { w: 3, h: 3, style: 'tower', door: -1, seed: 113 });
  b.building(R.x0 + 3, R.y0 + 15, { w: 4, h: 2, style: 'barn', door: 1, seed: 114 });
  b.building(R.x1 - 7, R.y0 + 15, { w: 3, h: 2, style: 'tent', door: -1, tint: '#262220', tint2: '#8e2f2f', seed: 115 });
  b.prop('well', R.x0 + 18, R.y0 + 11, { interact: { type: 'water' } });
  b.prop('flag', R.x0 + 7, R.y0 + 10, { opt: CLOTH.black });
  b.prop('flag', R.x0 + 17, R.y0 + 10, { opt: CLOTH.black });
  for (const [x, y] of [[R.x0 + 9, R.y1 - 1], [R.x0 + 14, R.y1 - 1]]) b.prop('torch', x, y, { solid: false });
  // postern on the east wall (a way in for the careful)
  b.marker((R.x1) * TILE + 8, (R.y0 + 12) * TILE + 10, { type: 'door', to: 'overworld', spawn: 'rv_postern_in', label: 'The postern gate', locked: 2 }, { key: 'rv_postern' });
  // a goat path up through the crag to it (the rock used to wall it off)
  b.path([[R.x1 + 1, R.y0 + 12], [R.x1 + 4, R.y0 + 13], [R.x1 + 9, R.y0 + 15]], 2.2, T.DIRT, 0.3, true, [T.ROCK]);
  b.spawn('rv_postern_in', R.x1 - 3, R.y0 + 12, 1);
  b.spawn('rv_postern_out', R.x1 + 2, R.y0 + 12, 2);
  b.spawn('ravenstone', R.x0 + 12, R.y1 + 8, 3);
  b.spawn('rv_gate_in', R.x0 + 12, R.y1 - 4, 3);
  b.spawn('rv_bailey', R.x0 + 12, R.y0 + 13, 3);
  b.region({ id: 'ravenstone', name: 'Ravenstone', x: R.x0 - 2, y: R.y0 - 2, w: W + 4, h: H + 10, settlement: 'ravenstone', music: 'tension', restricted: 'always' });
  place({ id: 'ravenstone', name: 'Ravenstone', x: R.x0 + 12, y: R.y1 + 8, spawn: 'ravenstone', desc: 'Sir Lothar\'s castle on its black crag, above the pass.', kind: 'castle' });
}
