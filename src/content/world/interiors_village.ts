// Interiors of Hollowbrook, the forest dwellings and the camps.

import { interior } from './interior';
import { T } from '../../world/terrain';
import { CLOTH } from '../../gfx/palette';
import { registerLoot } from '../loot';

export function registerVillageInteriors() {
  // ---------- the family home ----------
  interior('hb_home', 'Home', { w: 12, h: 8, floor: T.WOOD, settlement: 'hollowbrook', music: '' }, (r) => {
    r.wallProp('fireplace', 2, { opt: 'pot', interact: { type: 'script', script: 'hearth', label: 'Warm your hands' } });
    r.window(6);
    r.wallProp('shelf', 8);
    r.window(10);
    r.prop('oven', 10, 0, { dx: 4, interact: { type: 'script', script: 'oven', label: 'Look at the bread oven' } });
    r.prop('table', 5, 3, { opt: 'bread', dx: 8 });
    r.prop('stool', 4, 4);
    r.prop('stool', 7, 4);
    r.prop('bench', 5, 2, { dx: 8, solid: false });
    r.bed(10, 4, 'radek', CLOTH.madder);
    r.bed(0, 3, 'player', CLOTH.russet, true);
    r.bed(2, 6, 'lida', CLOTH.woad);
    r.chest(8, 7, 'hb_home_chest', { owner: 'player', label: 'family chest' });
    r.prop('barrel', 11, 7);
    r.prop('sack', 9, 7, { opt: 'flour' });
    r.prop('rug', 5, 6, { dx: 8, opt: CLOTH.russet });
    r.prop('spinningwheel', 4, 7);
    r.spot('hearth', 3, 1, 3);
    r.spot('oven', 9, 2, 3);
    r.spot('table_n', 5, 2, 0);
    r.spot('table_w', 4, 3, 2);
    r.spot('table_e', 7, 3, 1);
    r.spot('bed_radek', 10, 3.6);
    r.spot('bed_marta', 10.3, 3.9);
    r.spot('bed_player', 0, 2.6);
    r.spot('bed_lida', 2, 5.6);
    r.spot('crumb', 1, 1);
    r.spot('center', 6, 5);
  });
  registerLoot('hb_home_chest', [['linen_shirt', 1], ['hose', 1], ['bandage', 2], ['torch', 2], ['coins', 6], ['reynard', 1]]);

  interior('hb_havel', "Old Havel's House", { w: 8, h: 6, floor: T.STRAW, settlement: 'hollowbrook', owner: 'havel' }, (r) => {
    r.wallProp('fireplace', 1);
    r.window(5);
    r.bed(7, 3, 'havel', CLOTH.grey, true);
    r.prop('table', 3, 3);
    r.prop('stool', 2, 4);
    r.prop('weaponrack', 5, 0, { opt: 'old' });
    r.chest(0, 5, 'hb_havel_chest:peasant', { owner: 'havel' });
    r.spot('chair', 2, 3, 2);
    r.spot('bed', 7, 2.6);
  });
  interior('hb_jiri', "The Reeve's House", { w: 10, h: 7, floor: T.WOOD, settlement: 'hollowbrook', owner: 'jiri' }, (r) => {
    r.wallProp('fireplace', 2);
    r.window(6);
    r.window(8);
    r.prop('table', 5, 3, { opt: 'books', dx: 8 });
    r.prop('chair', 5, 2, { dx: 8 });
    r.bed(9, 4, 'jiri', CLOTH.green);
    r.chest(0, 6, 'hb_rents', { owner: 'jiri', locked: 2, label: 'rent chest' });
    r.wallProp('shelf', 4);
    r.prop('rug', 5, 5, { dx: 8, opt: CLOTH.green });
    r.spot('desk', 5, 2, 0);
    r.spot('bed', 9, 3.6);
  });
  registerLoot('hb_rents', [['coins', 45], ['silver_ring', 1]]);
  interior('hb_vojta', "Vojta's Hovel", { w: 6, h: 5, floor: T.STRAW, settlement: 'hollowbrook', owner: 'vojta' }, (r) => {
    r.bed(0, 2, 'vojta', CLOTH.undyed, true);
    r.prop('barrel', 5, 0);
    r.prop('barrel', 4, 0, { dx: -2 });
    r.prop('stool', 3, 3);
    r.chest(5, 4, 'hb_vojta_chest', { owner: 'vojta' });
    r.spot('bed', 0, 1.6);
    r.spot('stool', 3, 2, 0);
  });
  registerLoot('hb_vojta_chest', [['wine', 2], ['beer', 3], ['dice_set', 1], ['coins', 1]]);
  interior('hb_bara', "Widow Bára's House", { w: 8, h: 6, floor: T.STRAW, settlement: 'hollowbrook', owner: 'bara' }, (r) => {
    r.wallProp('fireplace', 5);
    r.window(2);
    r.bed(0, 3, 'bara', CLOTH.charcoal);
    r.prop('spinningwheel', 3, 2);
    r.prop('table', 5, 4);
    r.chest(7, 5, 'hb_bara_chest:peasant', { owner: 'bara' });
    r.spot('wheel', 3, 3, 0);
    r.spot('bed', 0, 2.6);
  });
  interior('hb_hanka', "Hanka's Family House", { w: 8, h: 6, floor: T.WOOD, settlement: 'hollowbrook', owner: 'hanka' }, (r) => {
    r.wallProp('fireplace', 1);
    r.wallProp('hanging_herbs', 4);
    r.window(6);
    r.bed(7, 3, 'hanka', CLOTH.green);
    r.prop('table', 3, 3, { opt: 'bread' });
    r.prop('dryingrack', 5, 5, { solid: true });
    r.chest(0, 5, 'hb_hanka_chest:herbs', { owner: 'hanka' });
    r.spot('table', 3, 2, 0);
    r.spot('bed', 7, 2.6);
  });
  interior('hb_chapel', 'Chapel of St. John', { w: 8, h: 9, floor: T.FLAGSTONE, wall: T.WALL_STONE, settlement: 'hollowbrook', music: 'priory', ambient: 0.5 }, (r) => {
    r.prop('altar', 3, 0, { dx: 8, interact: { type: 'shrine', label: 'Pray at the altar' } });
    r.prop('candelabra', 1, 0);
    r.prop('candelabra', 6, 0);
    for (let row = 3; row <= 7; row += 2) { r.prop('pew', 2, row, { dx: 0 }); r.prop('pew', 5, row, { dx: 8 }); }
    r.window(1);
    r.window(6);
    r.spot('altar', 4, 1, 3);
    r.spot('pew', 2, 3, 3);
  });
  interior('hb_tavern', 'The Rooster', { w: 12, h: 8, floor: T.WOOD, settlement: 'hollowbrook', music: 'tavern', owner: 'rooster' }, (r) => {
    r.wallProp('fireplace', 9);
    r.window(2);
    r.window(5);
    r.prop('barrelstack', 1, 1);
    r.prop('table_long', 3, 1, { dx: 8 });
    r.prop('table', 3, 5, { opt: 'meal', interact: { type: 'dice', label: 'Play dice' } });
    r.prop('table', 8, 5, { opt: 'meal' });
    r.prop('bench', 3, 6, { solid: false });
    r.prop('bench', 8, 6, { solid: false });
    r.prop('barrel', 11, 7);
    r.spot('bar', 4, 0, 0);
    r.spot('seat1', 3, 6, 3);
    r.spot('seat2', 8, 6, 3);
    r.spot('seat3', 9, 4, 0);
    r.spot('fire', 9, 1, 3);
  });
  interior('hb_mill', 'The Mill', { w: 10, h: 8, floor: T.WOOD, settlement: 'hollowbrook', owner: 'miller' }, (r) => {
    r.prop('millstone', 5, 2, { dx: 8 });
    r.window(1);
    r.window(8);
    for (let i = 0; i < 4; i++) r.prop('sack', 1 + i, 6, { opt: 'flour' });
    r.bed(9, 5, 'miller', CLOTH.undyed, true);
    r.chest(0, 3, 'hb_mill_chest:food', { owner: 'miller' });
    r.prop('barrel', 8, 1);
    r.spot('stone', 5, 4, 3);
    r.spot('bed', 9, 4.6);
  });

  // ---------- forest ----------
  interior('wenda_hut', "Wenda's Hut", { w: 9, h: 6, floor: T.STRAW, wall: T.WALL_WOOD, settlement: 'forest', music: 'forest', owner: 'wenda', ambient: 0.5 }, (r) => {
    r.wallProp('hanging_herbs', 1);
    r.wallProp('hanging_herbs', 6);
    r.window(4);
    r.prop('cauldron', 4, 1, { opt: 'brew' });
    r.prop('alchemy', 7, 2, { interact: { type: 'bench', bench: 'alchemy' } });
    r.prop('shelf', 0, 1);
    r.bed(8, 4, 'wenda', CLOTH.forest, true);
    r.prop('dryingrack', 1, 5, { solid: true });
    r.chest(4, 5, 'wenda_chest:herbs', { owner: 'wenda' });
    r.spot('cauldron', 4, 2, 3);
    r.spot('bench', 7, 3, 3);
    r.spot('bed', 8, 3.6);
    r.spot('hanka', 2, 3, 2);
  });
  interior('lodge', "Hunter's Lodge", { w: 9, h: 6, floor: T.WOOD, wall: T.WALL_WOOD, settlement: 'forest', owner: 'hunter' }, (r) => {
    r.wallProp('fireplace', 1);
    r.wallProp('weaponrack', 6);
    r.bed(8, 3, 'hunter', CLOTH.forest, true);
    r.prop('table', 4, 3, { opt: 'meal' });
    r.chest(0, 5, 'lodge_chest:food', { owner: 'hunter' });
    r.prop('dryingrack', 6, 5, { solid: true });
    r.spot('table', 4, 2, 0);
    r.spot('bed', 8, 2.6);
  });
  interior('burner_hut', "Burners' Hut", { w: 7, h: 5, floor: T.STRAW, wall: T.WALL_WOOD, settlement: 'forest', owner: 'burners' }, (r) => {
    r.bed(0, 2, 'burners', CLOTH.charcoal, true);
    r.bed(6, 2, 'burners', CLOTH.charcoal, true);
    r.prop('table', 3, 2);
    r.chest(3, 4, 'burner_chest:tools', { owner: 'burners' });
    r.spot('table', 3, 1, 0);
  });

  // ---------- camps ----------
  interior('ilse_tent', "The Cook's Tent", { w: 8, h: 6, floor: T.STRAW, wall: T.WALL_WOOD, settlement: 'harrow', music: 'tension', owner: 'ilse', ambient: 0.5 }, (r) => {
    r.prop('cauldron', 3, 1, { opt: 'brew', interact: { type: 'script', script: 'stewpot', label: 'The stew pot' } });
    r.prop('table', 6, 2, { opt: 'bread' });
    r.prop('sack', 0, 4);
    r.prop('sack', 1, 5);
    r.prop('barrel', 7, 5);
    r.bed(7, 3, 'ilse', CLOTH.grey, true);
    r.chest(0, 1, 'ilse_chest', { owner: 'ilse', label: 'Ilse\'s box' });
    r.spot('pot', 3, 2, 3);
    r.spot('table', 5, 3, 2);
  });
  registerLoot('ilse_chest', [['ilse_locket', 1], ['bread', 2], ['bandage', 2]]);
}
