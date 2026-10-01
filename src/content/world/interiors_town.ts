// Interiors of Linden Hill, St. Aldhelm's Priory, Silverdale and Ravenstone.

import { interior } from './interior';
import { T } from '../../world/terrain';
import { CLOTH } from '../../gfx/palette';
import { registerLoot } from '../loot';
import { registerMap } from '../../world/world';
import { MapBuilder } from '../../world/build';
import { TILE } from '../../engine/util';

export function registerTownInteriors() {
  // ---------- Linden Hill ----------
  interior('lh_keep', 'The Great Hall', { w: 16, h: 12, floor: T.FLAGSTONE, wall: T.WALL_STONE, settlement: 'linden', music: '', ambient: 0.4, owner: 'bertram' }, (r) => {
    r.b.fill(r.X(7), r.Y(0), 2, 12, T.CARPET);
    r.prop('throne', 7, 1, { dx: 8 });
    r.wallProp('banner', 5, { opt: CLOTH.green });
    r.wallProp('banner', 10, { opt: CLOTH.green });
    r.wallProp('fireplace', 1);
    r.wallProp('fireplace', 13);
    r.window(4);
    r.window(11);
    r.prop('table_long', 3, 5, { opt: 'feast', dx: 0 });
    r.prop('table_long', 11, 5, { opt: 'feast', dx: 8 });
    r.prop('bench', 2, 6, { solid: false }); r.prop('bench', 4, 6, { solid: false });
    r.prop('bench', 11, 6, { solid: false }); r.prop('bench', 13, 6, { solid: false });
    r.prop('candelabra', 6, 3); r.prop('candelabra', 9, 3);
    r.prop('candelabra', 1, 9); r.prop('candelabra', 14, 9);
    r.bed(15, 9, 'bertram', CLOTH.green);
    r.chest(0, 11, 'lh_keep_chest:rich', { owner: 'bertram', locked: 3 });
    r.prop('weaponrack', 14, 2);
    r.spot('throne', 7.5, 2, 0);
    r.spot('beside_throne', 9, 2.5, 0);
    r.spot('hall', 8, 8, 3);
    r.spot('table', 3, 4, 0);
    r.spot('fire', 13, 1, 3);
    r.spot('bed', 15, 8.6);
    r.spot('steward', 5, 2, 0);
  });
  registerLoot('lh_keep_chest:rich', [['coins', 120], ['garnet_ring', 1], ['wine', 2], ['chronicle', 1]]);

  interior('lh_church', 'Church of St. Wenceslas', { w: 10, h: 13, floor: T.FLAGSTONE, wall: T.WALL_STONE, settlement: 'linden', music: 'priory', ambient: 0.52 }, (r) => {
    r.prop('altar', 4, 0, { dx: 8, interact: { type: 'shrine', label: 'Pray' } });
    r.prop('candelabra', 2, 0); r.prop('candelabra', 7, 0);
    r.prop('lectern', 7, 2, { interact: { type: 'read', book: 'saints', label: 'Read the Lives of the Saints' } });
    for (let row = 4; row <= 10; row += 2) { r.prop('pew', 2, row); r.prop('pew', 7, row, { dx: 8 }); }
    r.window(1); r.window(8);
    r.spot('altar', 5, 1, 3);
    r.spot('lectern', 6, 2, 0);
    r.spot('pew1', 2, 4, 3); r.spot('pew2', 7, 4, 3); r.spot('pew3', 2, 6, 3); r.spot('pew4', 7, 6, 3); r.spot('pew5', 2, 8, 3); r.spot('pew6', 7, 8, 3);
  });

  interior('lh_tavern', 'The Crooked Linden', { w: 15, h: 10, floor: T.WOOD, settlement: 'linden', music: 'tavern', owner: 'dorota', ambient: 0.35 }, (r) => {
    r.wallProp('fireplace', 11);
    r.window(3); r.window(7);
    r.prop('barrelstack', 1, 1);
    r.prop('table_long', 4, 1, { dx: 8, opt: 'meal' });
    r.prop('table', 3, 5, { opt: 'meal', interact: { type: 'dice', label: 'Play dice' } });
    r.prop('table', 8, 5, { opt: 'meal' });
    r.prop('table', 12, 5, { opt: 'meal' });
    r.prop('bench', 3, 6, { solid: false }); r.prop('bench', 8, 6, { solid: false }); r.prop('bench', 12, 6, { solid: false });
    // rooms to rent at the back right
    r.b.fill(r.X(12), r.Y(7), 1, 3, T.WALL_PLASTER);
    r.bed(13, 7, 'inn', CLOTH.madder);
    r.bed(14, 7, 'inn', CLOTH.woad);
    r.prop('barrel', 0, 9);
    r.prop('candle', 8, 5, { dx: 4, dy: -12, solid: false });
    r.spot('bar', 5, 0, 0);
    r.spot('dice', 3, 6, 3);
    r.spot('dice_opp', 3, 4, 0);
    r.spot('seat1', 8, 6, 3); r.spot('seat2', 12, 6, 3); r.spot('seat3', 8, 4, 0); r.spot('seat4', 12, 4, 0); r.spot('seat5', 4, 2.2, 0); r.spot('seat6', 7, 2.2, 0);
    r.spot('fire', 11, 1, 3);
    r.spot('room', 13, 8);
    r.spot('dorota_bed', 14, 6.6);
  });

  interior('lh_smithy', "Kovář's Smithy", { w: 10, h: 7, floor: T.STRAW, settlement: 'linden', music: '', owner: 'kovar' }, (r) => {
    r.prop('forge', 2, 0, { dx: 8, interact: { type: 'bench', bench: 'forge' } });
    r.prop('anvil', 5, 2, { interact: { type: 'bench', bench: 'anvil' } });
    r.prop('barrel', 6, 0, { opt: 'water' });
    r.prop('grindstone', 8, 2, { interact: { type: 'bench', bench: 'grindstone' } });
    r.wallProp('weaponrack', 8);
    r.bed(9, 5, 'kovar', CLOTH.grey, true);
    r.chest(0, 6, 'lh_smithy_chest:tools', { owner: 'kovar' });
    r.prop('woodpile', 4, 6);
    r.spot('anvil', 5, 3, 3);
    r.spot('forge', 3, 2, 3);
    r.spot('bed', 9, 4.6);
  });
  interior('lh_bakery', "Greta's Bakery", { w: 8, h: 6, floor: T.WOOD, settlement: 'linden', owner: 'greta' }, (r) => {
    r.prop('oven', 1, 0, { dx: 8 });
    r.prop('table', 5, 2, { opt: 'bread' });
    r.prop('sack', 7, 0, { opt: 'flour' }); r.prop('sack', 7, 1, { opt: 'flour' });
    r.wallProp('shelf', 4);
    r.bed(7, 4, 'greta', CLOTH.brown);
    r.chest(0, 5, 'lh_bakery_chest:food', { owner: 'greta' });
    r.spot('counter', 5, 3, 3);
    r.spot('oven', 2, 2, 3);
    r.spot('bed', 7, 3.6);
    r.spot('marta_oven', 1, 2, 3);
  });
  interior('lh_apothecary', 'The Apothecary', { w: 8, h: 6, floor: T.WOOD, settlement: 'linden', owner: 'aurelius', ambient: 0.45 }, (r) => {
    r.prop('alchemy', 2, 1, { dx: 8, interact: { type: 'bench', bench: 'alchemy', label: 'Rent the alchemy bench' } });
    r.wallProp('shelf', 5); r.wallProp('shelf', 6);
    r.wallProp('hanging_herbs', 0);
    r.prop('bookshelf', 7, 3);
    r.prop('table', 4, 4, { opt: 'books' });
    r.chest(0, 5, 'lh_apoth_chest:herbs', { owner: 'aurelius', locked: 2 });
    r.spot('counter', 4, 3, 3);
    r.spot('bench', 3, 2, 3);
  });
  interior('lh_bath', 'The Bathhouse', { w: 12, h: 8, floor: T.FLAGSTONE, settlement: 'linden', owner: 'bath', ambient: 0.38 }, (r) => {
    r.prop('tub', 2, 2, { interact: { type: 'script', script: 'bath', label: 'Take a bath (2 g)' } });
    r.prop('tub', 6, 2, { interact: { type: 'script', script: 'bath', label: 'Take a bath (2 g)' } });
    r.prop('tub', 10, 2, { interact: { type: 'script', script: 'bath', label: 'Take a bath (2 g)' } });
    r.wallProp('fireplace', 5);
    r.prop('bench', 3, 6, { solid: false });
    r.prop('bench', 9, 6, { solid: false });
    r.prop('cauldron', 0, 6);
    r.spot('keeper', 6, 5, 3);
  });
  interior('lh_barracks', 'Barracks', { w: 11, h: 7, floor: T.WOOD, settlement: 'linden', owner: 'garrison' }, (r) => {
    for (let i = 0; i < 4; i++) r.bed(1 + i * 2, 0, 'garrison', CLOTH.olive, true);
    r.wallProp('weaponrack', 9);
    r.prop('table', 5, 4, { opt: 'meal' });
    r.chest(10, 6, 'lh_armory', { owner: 'garrison', locked: 3, label: 'armoury chest' });
    r.bed(10, 3, 'player_barracks', CLOTH.green, true);
    r.spot('table', 5, 3, 0);
    r.spot('bunk', 1, 0.6);
  });
  registerLoot('lh_armory', [['padded_coif', 1], ['arrow', 30], ['bandage', 4], ['whetstone', 2]]);
  interior('lh_tailor', 'The Tailor', { w: 8, h: 6, floor: T.WOOD, settlement: 'linden', owner: 'tailor' }, (r) => {
    r.prop('loom', 2, 1);
    r.prop('spinningwheel', 6, 1);
    r.wallProp('shelf', 4);
    r.prop('table', 4, 4);
    r.bed(7, 4, 'tailor', CLOTH.plum);
    r.chest(0, 5, 'lh_tailor_chest:rich', { owner: 'tailor', locked: 2 });
    r.spot('counter', 4, 3, 3);
  });
  interior('lh_armorer', 'The Armourer', { w: 8, h: 6, floor: T.STRAW, settlement: 'linden', owner: 'armorer' }, (r) => {
    r.prop('dummy', 1, 1, { opt: 'armored' });
    r.prop('dummy', 3, 1, { opt: 'armored' });
    r.wallProp('weaponrack', 6);
    r.prop('anvil', 5, 3);
    r.prop('table', 3, 4);
    r.chest(7, 5, 'lh_armorer_chest:tools', { owner: 'armorer', locked: 3 });
    r.spot('counter', 3, 3, 3);
  });
  for (let i = 1; i <= 4; i++) {
    interior('lh_house' + i, 'A House', { w: 7, h: 5, floor: i % 2 ? T.WOOD : T.STRAW, settlement: 'linden', owner: 'townsfolk' + i }, (r) => {
      r.wallProp('fireplace', i % 2 ? 1 : 4);
      r.window(i % 2 ? 5 : 1);
      r.bed(6, 2, 'townsfolk' + i, [CLOTH.madder, CLOTH.woad, CLOTH.olive, CLOTH.russet][i - 1], i % 2 === 0);
      r.prop('table', 3, 3);
      r.chest(0, 4, `lh_house${i}_chest:peasant`, { owner: 'townsfolk' + i });
      r.spot('table', 3, 2, 0);
      r.spot('bed', 6, 1.6);
    });
  }
  interior('lh_tannery', "Zbyněk's Tannery", { w: 8, h: 6, floor: T.STRAW, settlement: 'linden', owner: 'zbynek', ambient: 0.5 }, (r) => {
    r.prop('dryingrack', 2, 1, { solid: true });
    r.prop('tub', 5, 2);
    r.prop('barrel', 7, 0);
    r.bed(7, 4, 'zbynek', CLOTH.brown, true);
    r.chest(0, 5, 'lh_tannery_chest:bandit', { owner: 'zbynek', locked: 3 });
    r.spot('work', 4, 4, 3);
  });

  // ---------- priory ----------
  interior('pr_church', "St. Aldhelm's Church", { w: 12, h: 14, floor: T.FLAGSTONE, wall: T.WALL_STONE, settlement: 'priory', music: 'priory', ambient: 0.5 }, (r) => {
    r.b.fill(r.X(5), r.Y(2), 2, 12, T.CARPET);
    r.prop('altar', 5, 0, { dx: 8, interact: { type: 'shrine', label: 'Pray' } });
    r.prop('candelabra', 3, 0); r.prop('candelabra', 8, 0);
    r.prop('statue', 1, 1); r.prop('statue', 10, 1);
    for (let row = 4; row <= 11; row += 2) { r.prop('pew', 2, row, { dx: 4 }); r.prop('pew', 9, row, { dx: 4 }); }
    r.window(2); r.window(9);
    r.spot('altar', 6, 1, 3);
    r.spot('choir1', 3, 2, 1); r.spot('choir2', 8, 2, 2);
  });
  interior('pr_library', 'The Scriptorium', { w: 12, h: 8, floor: T.WOOD, wall: T.WALL_STONE, settlement: 'priory', music: 'priory', owner: 'priory', ambient: 0.45 }, (r) => {
    for (let i = 0; i < 4; i++) r.prop('bookshelf', 1 + i * 3, 0);
    r.prop('lectern', 2, 3, { interact: { type: 'read', book: 'chronicle', label: 'Read the Chronicle' } });
    r.prop('lectern', 6, 3, { interact: { type: 'read', book: 'herbal', label: 'Read the Herbarium' } });
    r.prop('lectern', 10, 3, { interact: { type: 'read', book: 'fechtbuch', label: 'Read the Fencing Book' } });
    r.prop('table', 3, 6, { opt: 'books' });
    r.prop('table', 8, 6, { opt: 'books' });
    r.prop('candelabra', 11, 6);
    r.chest(0, 7, 'pr_archive', { owner: 'priory', locked: 3, label: 'archive chest' });
    r.spot('desk', 3, 5, 0);
    r.spot('desk2', 8, 5, 0);
  });
  registerLoot('pr_archive', [['tactics', 1], ['saints', 1], ['wax', 3]]);
  interior('pr_dorm', 'The Dormitory', { w: 12, h: 7, floor: T.STRAW, wall: T.WALL_STONE, settlement: 'priory', owner: 'priory' }, (r) => {
    for (let i = 0; i < 5; i++) r.bed(1 + i * 2, 0, 'monks', CLOTH.brown, true);
    r.bed(11, 3, 'tobiah', CLOTH.brown, true);
    r.prop('table', 5, 4, { opt: 'bread' });
    r.prop('barrelstack', 0, 5);
    r.chest(10, 6, 'pr_dorm_chest:food', { owner: 'priory' });
    r.spot('tobiah_bed', 11, 2.6);
    r.spot('table', 5, 3, 0);
  });
  interior('pr_abbot', "The Abbot's Lodging", { w: 8, h: 6, floor: T.WOOD, wall: T.WALL_STONE, settlement: 'priory', owner: 'gregor' }, (r) => {
    r.wallProp('fireplace', 1);
    r.prop('table', 4, 2, { opt: 'books' });
    r.prop('chair', 4, 1);
    r.prop('bookshelf', 7, 1);
    r.bed(7, 4, 'gregor', CLOTH.white);
    r.chest(0, 5, 'pr_abbot_chest:church', { owner: 'gregor', locked: 3 });
    r.spot('desk', 4, 1, 0);
  });

  // ---------- Silverdale ----------
  interior('sd_foreman', "The Foreman's House", { w: 10, h: 7, floor: T.WOOD, settlement: 'silverdale', owner: 'vilem', restricted: 'night' }, (r) => {
    r.wallProp('fireplace', 2);
    r.window(6);
    r.prop('table', 5, 2, { opt: 'books' });
    r.prop('chair', 5, 1);
    r.bed(9, 4, 'vilem', CLOTH.crimson);
    r.chest(0, 6, 'sd_strongbox', { owner: 'vilem', locked: 4, key: 'key_foreman', label: 'strongbox' });
    r.prop('rug', 5, 5, { opt: CLOTH.crimson });
    r.spot('desk', 5, 1, 0);
    r.spot('bed', 9, 3.6);
  });
  registerLoot('sd_strongbox', [['foreman_ledger', 1], ['coins', 60], ['silver_ore', 3]]);
  interior('sd_store', 'Silverdale Stores', { w: 8, h: 6, floor: T.WOOD, settlement: 'silverdale', owner: 'store' }, (r) => {
    r.wallProp('shelf', 2); r.wallProp('shelf', 5);
    r.prop('table', 4, 3);
    r.prop('barrel', 0, 5); r.prop('crate', 7, 5);
    r.spot('counter', 4, 2, 0);
  });
  interior('sd_anna', "Anna's House", { w: 7, h: 5, floor: T.STRAW, settlement: 'silverdale', owner: 'anna' }, (r) => {
    r.wallProp('fireplace', 1);
    r.bed(6, 2, 'anna', CLOTH.woad);
    r.prop('table', 3, 3);
    r.prop('spinningwheel', 5, 4);
    r.spot('table', 3, 2, 0);
    r.spot('bed', 6, 1.6);
  });
  interior('sd_chapel', 'Miners\' Chapel', { w: 7, h: 7, floor: T.FLAGSTONE, wall: T.WALL_STONE, settlement: 'silverdale', music: 'priory', ambient: 0.5 }, (r) => {
    r.prop('altar', 2, 0, { dx: 8, interact: { type: 'shrine', label: 'Pray to St. Barbara' } });
    r.prop('pew', 3, 3, { dx: 0 });
    r.prop('pew', 3, 5, { dx: 0 });
    r.spot('altar', 3, 1, 3);
  });
  registerMap('sd_mine', buildMine);

  // ---------- Ravenstone ----------
  interior('rv_hall', 'Hall of Ravenstone', { w: 16, h: 12, floor: T.FLAGSTONE, wall: T.WALL_STONE, settlement: 'ravenstone', music: 'tension', ambient: 0.5, owner: 'lothar' }, (r) => {
    r.b.fill(r.X(7), r.Y(0), 2, 12, T.CARPET);
    r.prop('throne', 7, 1, { dx: 8 });
    r.wallProp('banner', 5, { opt: CLOTH.black });
    r.wallProp('banner', 10, { opt: CLOTH.black });
    r.wallProp('fireplace', 1);
    r.prop('table_long', 11, 5, { opt: 'feast', dx: 8 });
    r.prop('candelabra', 6, 3); r.prop('candelabra', 9, 3);
    r.chest(15, 1, 'rv_lothar_chest', { owner: 'lothar', locked: 4, key: 'key_lothar' });
    // internal doors: kitchens (left) and cells (right, down stairs)
    r.interact(0, 9, { type: 'door', to: 'rv_kitchen', spawn: 'door', label: 'To the kitchens' }, 'rv_hall:kitchen');
    r.interact(15, 9, { type: 'door', to: 'rv_cells', spawn: 'door', label: 'Down to the cells', locked: 3, key: 'key_cell' }, 'rv_hall:cells');
    r.prop('stairs_down', 15, 10);
    r.spot('throne', 7.5, 2, 0);
    r.spot('hall', 8, 8, 3);
    r.spot('rv_kitchen_out', 1, 9, 2);
    r.spot('rv_cells_out', 14, 9, 1);
  });
  registerLoot('rv_lothar_chest', [['lothar_letter', 1], ['coins', 200], ['garnet_ring', 1]]);
  interior('rv_kitchen', 'Kitchens of Ravenstone', { w: 12, h: 8, floor: T.STRAW, wall: T.WALL_STONE, settlement: 'ravenstone', music: 'tension', ambient: 0.45, parent: 'rv_hall' }, (r) => {
    r.wallProp('fireplace', 2, { opt: 'pot' });
    r.prop('oven', 8, 0, { dx: 8 });
    r.prop('table_long', 5, 4, { opt: 'bread', dx: 8 });
    r.prop('barrelstack', 10, 6);
    r.prop('sack', 0, 6); r.prop('sack', 1, 7);
    r.prop('bed_straw', 11, 3, { opt: CLOTH.woad });
    r.spot('hearth', 3, 1, 3);
    r.spot('lida', 11, 2, 1);
    r.spot('table', 5, 3, 0);
  });
  interior('rv_cells', 'The Cells', { w: 12, h: 7, floor: T.STRAW, wall: T.WALL_STONE, settlement: 'ravenstone', music: 'tension', ambient: 0.7, parent: 'rv_hall' }, (r) => {
    // cell partitions
    for (const x of [3, 7]) r.b.fill(r.X(x), r.Y(0), 1, 4, T.WALL_STONE);
    r.prop('torch', 5, 0, { dy: -2, solid: false });
    r.prop('bed_straw', 1, 1, { opt: CLOTH.undyed });
    r.prop('bed_straw', 9, 1, { opt: CLOTH.undyed });
    r.spot('cell1', 1, 2, 0);
    r.spot('cell2', 5, 2, 0);
    r.spot('cell3', 9, 2, 0);
    r.spot('guard', 6, 5, 3);
  });
}

function buildMine() {
  const W = 44, H = 32;
  const b = new MapBuilder('sd_mine', 'The Silver Mine', W, H, T.WALL_CAVE, 777, false);
  const m = b.map;
  m.ambient = 0.82;
  m.parent = 'overworld';
  m.music = 'tension';
  // tunnels
  b.path([[22, 30], [22, 22], [14, 18], [8, 10], [6, 4]], 3.2, T.GRAVEL, 0.8, false);
  b.path([[22, 22], [32, 16], [38, 8]], 3, T.GRAVEL, 0.8, false);
  b.path([[14, 18], [16, 8], [24, 6]], 2.6, T.GRAVEL, 0.8, false);
  b.blob(38, 7, 4, 3, T.GRAVEL, 0.3);
  b.blob(7, 5, 4, 3, T.GRAVEL, 0.3);
  b.blob(25, 6, 3, 2, T.FORD, 0.2); // flooded gallery
  b.fill(21, 29, 3, 3, T.GRAVEL);
  b.marker(22 * TILE + 8, (H - 1) * TILE + 6, { type: 'door', to: 'overworld', spawn: 'sd_mine_out', label: 'Climb out' }, { key: 'sd_mine:exit' });
  b.spawn('door', 22, 29, 3);
  b.region({ id: 'sd_mine', name: 'The Silver Mine', x: 0, y: 0, w: W, h: H, settlement: 'silverdale', indoor: true });
  for (const [x, y] of [[22, 25], [16, 17], [30, 17], [9, 9], [36, 9], [20, 7]]) b.prop('torch', x, y, { solid: false });
  b.prop('minecart', 23, 21);
  b.prop('orepile', 37, 6);
  b.prop('orepile', 6, 4);
  b.prop('crate', 8, 6, { interact: { type: 'loot', label: 'Search the crate' } });
  b.marker(38 * TILE + 8, 5 * TILE + 8, { type: 'script', script: 'mine_vein', label: 'Examine the rich vein' }, { key: 'mine_vein' });
  b.marker(6 * TILE + 8, 3 * TILE + 8, { type: 'script', script: 'mine_cache', label: 'A loose stone' }, { key: 'mine_cache' });
  b.spawn('deep', 7, 6);
  b.spawn('vein', 36, 8);
  return b.done();
}
