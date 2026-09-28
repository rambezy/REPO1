// Building types, architectural styles and the town templates that combine
// them. Furniture inside is laid out procedurally from each building's use.

export type Use =
  | 'bar' | 'shop' | 'house' | 'barracks' | 'prison' | 'temple' | 'palace' | 'tower' | 'workshop' | 'warehouse' | 'hut' | 'tent'
  | 'stall' | 'hall' | 'clinic' | 'pen' | 'dome' | 'container' | 'ruin' | 'shrine' | 'farmhouse' | 'boss';

export type Roof = 'flat' | 'gable' | 'hip' | 'dome' | 'cone' | 'shed' | 'none' | 'tent' | 'curved' | 'broken';

export interface Style {
  key: string;
  wall: number[]; // wall colours to pick from
  trim: number; // corners, beams, frames
  roof: number[];
  floor: number;
  roofType: Roof;
  round?: boolean; // round huts/domes
  parapet?: boolean;
  beams?: boolean; // protruding roof beams
  eaves?: boolean; // upturned eaves
  corrugated?: boolean;
  stilts?: number; // raised floor height
  wallH: number;
  thick: number;
  lamp: number; // lamp colour
}

export const STYLES: Record<string, Style> = {
  shanty: { key: 'shanty', wall: [0x8a7458, 0x7a6a56, 0x9a8466, 0x6e5e4c], trim: 0x5a4a38, roof: [0x7a5a44, 0x6a6a68, 0x8a6a4a], floor: 0x6a5a48, roofType: 'shed', corrugated: true, wallH: 3.2, thick: 0.25, lamp: 0xffb060 },
  adobe: { key: 'adobe', wall: [0xc8a878, 0xbc9c6c, 0xd4b488], trim: 0x6a5238, roof: [0xb89868], floor: 0x8a7458, roofType: 'flat', parapet: true, beams: true, wallH: 3.4, thick: 0.45, lamp: 0xffb060 },
  concord: { key: 'concord', wall: [0xd8c8a8, 0xe0d0b0, 0xcfbf9c], trim: 0x4a3426, roof: [0x5a2e24, 0x4a2a22, 0x3e3632], floor: 0x7a6248, roofType: 'hip', eaves: true, beams: false, wallH: 3.6, thick: 0.35, lamp: 0xffc070 },
  ember: { key: 'ember', wall: [0xe8e4dc, 0xdcd8cc, 0xf0ece4], trim: 0xb8a070, roof: [0xe8e4dc, 0xd8c890], floor: 0xa89c88, roofType: 'dome', parapet: true, wallH: 3.8, thick: 0.45, lamp: 0xff9a40 },
  karuk: { key: 'karuk', wall: [0x9a5a42, 0x8a5038, 0xa6664a], trim: 0x4a2e22, roof: [0x6a4a36, 0x7a5a40], floor: 0x6a4a36, roofType: 'flat', parapet: true, wallH: 4, thick: 0.6, lamp: 0xff8a40 },
  karuk_hut: { key: 'karuk_hut', wall: [0x9a5a42, 0x8a5038], trim: 0x4a2e22, roof: [0x8a6a44, 0x7a5a3a], floor: 0x6a4a36, roofType: 'cone', round: true, wallH: 3, thick: 0.5, lamp: 0xff8a40 },
  hive: { key: 'hive', wall: [0xc8a040, 0xb89038, 0xd4ae4a], trim: 0x8a6a2a, roof: [0xd8b04a, 0xc8a040], floor: 0x8a7a3a, roofType: 'dome', round: true, wallH: 3.4, thick: 0.5, lamp: 0xffd060 },
  hive_dead: { key: 'hive_dead', wall: [0x4a4430, 0x3a3628, 0x524a34], trim: 0x2a2618, roof: [0x3e3a2a], floor: 0x3a3424, roofType: 'dome', round: true, wallH: 3.4, thick: 0.5, lamp: 0x806030 },
  delver: { key: 'delver', wall: [0x8a8470, 0x7a7a6a, 0x6a7070], trim: 0x3a3a38, roof: [0x9a9078, 0x8a8a78], floor: 0x5a5448, roofType: 'tent', wallH: 2.8, thick: 0.1, lamp: 0x9ae0ff },
  hollow: { key: 'hollow', wall: [0x6a7078, 0x5a6068, 0x747a80], trim: 0x3a3e44, roof: [0x4a5058, 0x3a4048], floor: 0x4a4e54, roofType: 'shed', wallH: 3.8, thick: 0.3, lamp: 0x6ad0ff },
  swamp: { key: 'swamp', wall: [0x6a5a40, 0x5a4a36, 0x76644a], trim: 0x3a3024, roof: [0x8a7a4a, 0x7a6a40], floor: 0x5a4a36, roofType: 'gable', stilts: 1.4, wallH: 3, thick: 0.2, lamp: 0xffa050 },
  tent: { key: 'tent', wall: [0x8a7a5a, 0x7a6a4e], trim: 0x4a3a2a, roof: [0x8a7a5a, 0x9a8866, 0x6a5a46], floor: 0x5a4a38, roofType: 'tent', wallH: 2.4, thick: 0.08, lamp: 0xff9040 },
  hide: { key: 'hide', wall: [0x6a5a48, 0x5a4a3a], trim: 0xd8ccb0, roof: [0x6a5444, 0x5a4a3a], floor: 0x4a3e32, roofType: 'cone', round: true, wallH: 2.2, thick: 0.08, lamp: 0xff6030 },
  ruin: { key: 'ruin', wall: [0x8a8a86, 0x7a7a76, 0x94928c], trim: 0x5a5a58, roof: [0x6a6a66], floor: 0x6a6660, roofType: 'broken', wallH: 5, thick: 0.6, lamp: 0x9ad0ff },
  stone: { key: 'stone', wall: [0x9a948a, 0x8a8478, 0xa49e92], trim: 0x5a544a, roof: [0x6a5a4a, 0x5a4a3e], floor: 0x7a7266, roofType: 'gable', wallH: 3.6, thick: 0.5, lamp: 0xffb060 },
};

export interface BDef {
  key: string;
  name: string;
  use: Use;
  w: number;
  d: number;
  style?: string; // overrides the town style
  roof?: Roof;
  h?: number;
  floors?: number;
  sign?: string;
}

export const BUILDINGS: Record<string, BDef> = {
  bar: { key: 'bar', name: 'Bar', use: 'bar', w: 16, d: 12, sign: 'bar' },
  bar_small: { key: 'bar_small', name: 'Bar', use: 'bar', w: 12, d: 10, sign: 'bar' },
  shop: { key: 'shop', name: 'Shop', use: 'shop', w: 11, d: 9 },
  shop_big: { key: 'shop_big', name: 'Shop', use: 'shop', w: 14, d: 10 },
  house: { key: 'house', name: 'House', use: 'house', w: 9, d: 8 },
  house_big: { key: 'house_big', name: 'House', use: 'house', w: 12, d: 9, floors: 2 },
  shack: { key: 'shack', name: 'Shack', use: 'house', w: 7, d: 6 },
  barracks: { key: 'barracks', name: 'Barracks', use: 'barracks', w: 16, d: 10 },
  police: { key: 'police', name: 'Watch House', use: 'prison', w: 16, d: 12, sign: 'law' },
  temple: { key: 'temple', name: 'Temple', use: 'temple', w: 18, d: 18, h: 6 },
  great_temple: { key: 'great_temple', name: 'The Great Pyre', use: 'temple', w: 26, d: 26, h: 8 },
  palace: { key: 'palace', name: 'Palace', use: 'palace', w: 24, d: 18, h: 5, floors: 2 },
  hall: { key: 'hall', name: 'Great Hall', use: 'hall', w: 24, d: 16, h: 6 },
  tower: { key: 'tower', name: 'Watchtower', use: 'tower', w: 5, d: 5, h: 9, roof: 'flat' },
  workshop: { key: 'workshop', name: 'Workshop', use: 'workshop', w: 12, d: 9 },
  warehouse: { key: 'warehouse', name: 'Warehouse', use: 'warehouse', w: 14, d: 10 },
  hut: { key: 'hut', name: 'Hut', use: 'hut', w: 7, d: 7, style: 'karuk_hut' },
  tent: { key: 'tent', name: 'Tent', use: 'tent', w: 6, d: 5, style: 'tent' },
  tent_big: { key: 'tent_big', name: 'Tent', use: 'tent', w: 9, d: 7, style: 'tent' },
  stall: { key: 'stall', name: 'Market Stall', use: 'stall', w: 5, d: 4, roof: 'shed' },
  clinic: { key: 'clinic', name: 'Clinic', use: 'clinic', w: 12, d: 9, sign: 'clinic' },
  pen: { key: 'pen', name: 'Slave Pen', use: 'pen', w: 14, d: 10, roof: 'none' },
  dome: { key: 'dome', name: 'Hive Dome', use: 'dome', w: 10, d: 10, style: 'hive' },
  queen_dome: { key: 'queen_dome', name: "Queen's Chamber", use: 'palace', w: 20, d: 20, h: 7, style: 'hive' },
  container: { key: 'container', name: 'Container', use: 'container', w: 7, d: 3.4, style: 'delver', roof: 'flat' },
  farmhouse: { key: 'farmhouse', name: 'Farmhouse', use: 'farmhouse', w: 10, d: 8 },
  boss_hut: { key: 'boss_hut', name: "Boss's Hut", use: 'boss', w: 11, d: 9 },
  ruin_small: { key: 'ruin_small', name: 'Ruin', use: 'ruin', w: 12, d: 10, style: 'ruin' },
  ruin_big: { key: 'ruin_big', name: 'Ruined Hall', use: 'ruin', w: 20, d: 16, style: 'ruin', h: 7 },
  shrine: { key: 'shrine', name: 'Shrine', use: 'shrine', w: 6, d: 6, roof: 'dome' },
};

export interface TownPlan {
  style: string;
  walls: 'none' | 'scrap' | 'stone' | 'palisade' | 'bone' | 'wax' | 'metal' | 'fence';
  buildings: [string, number][]; // building key and count
  fields?: 'wheat' | 'riceweed' | 'cactus' | 'hemp' | 'dreamleaf' | null;
  plaza?: 'well' | 'statue' | 'fire' | 'pyre' | 'arena' | 'tree' | 'totem' | 'pillar';
  guards: number;
  patrol: number;
  residents: number;
  towers?: boolean;
}

export const TOWN_PLANS: Record<string, TownPlan> = {
  freetown: { style: 'shanty', walls: 'scrap', buildings: [['police', 1], ['house', 8], ['shack', 12], ['workshop', 2], ['warehouse', 2], ['stall', 5], ['clinic', 1], ['barracks', 1], ['house_big', 2]], plaza: 'well', guards: 8, patrol: 4, residents: 14, towers: true },
  village: { style: 'adobe', walls: 'none', buildings: [['shack', 7], ['house', 4], ['stall', 2], ['warehouse', 1]], plaza: 'well', guards: 2, patrol: 0, residents: 7 },
  fishing: { style: 'shanty', walls: 'fence', buildings: [['shack', 9], ['house', 2], ['stall', 3], ['warehouse', 1]], plaza: 'fire', guards: 2, patrol: 0, residents: 8 },
  concord_city: { style: 'concord', walls: 'stone', buildings: [['palace', 1], ['police', 1], ['barracks', 2], ['house_big', 10], ['house', 16], ['stall', 8], ['warehouse', 2], ['clinic', 1], ['pen', 1], ['workshop', 2]], plaza: 'statue', fields: 'wheat', guards: 14, patrol: 6, residents: 20, towers: true },
  concord_town: { style: 'concord', walls: 'stone', buildings: [['police', 1], ['barracks', 1], ['house', 11], ['house_big', 3], ['stall', 4], ['warehouse', 1], ['pen', 1], ['workshop', 1]], plaza: 'well', fields: 'wheat', guards: 9, patrol: 4, residents: 12, towers: true },
  slavefarm: { style: 'concord', walls: 'fence', buildings: [['house_big', 1], ['barracks', 1], ['pen', 2], ['warehouse', 1], ['tower', 3]], fields: 'riceweed', plaza: 'well', guards: 8, patrol: 3, residents: 3 },
  ember_city: { style: 'ember', walls: 'stone', buildings: [['great_temple', 1], ['barracks', 2], ['police', 1], ['house', 16], ['house_big', 8], ['stall', 6], ['clinic', 1], ['workshop', 2], ['warehouse', 1]], plaza: 'pyre', fields: 'wheat', guards: 14, patrol: 6, residents: 20, towers: true },
  ember_town: { style: 'ember', walls: 'stone', buildings: [['temple', 1], ['barracks', 1], ['house', 10], ['farmhouse', 3], ['stall', 3], ['warehouse', 1]], plaza: 'pyre', fields: 'wheat', guards: 7, patrol: 3, residents: 12, towers: true },
  ember_fort: { style: 'ember', walls: 'stone', buildings: [['barracks', 2], ['police', 1], ['tower', 2], ['warehouse', 1]], plaza: 'pyre', guards: 12, patrol: 4, residents: 2, towers: true },
  karuk_city: { style: 'karuk', walls: 'stone', buildings: [['hall', 1], ['barracks', 2], ['hut', 16], ['house', 6], ['stall', 4], ['workshop', 2]], plaza: 'arena', guards: 12, patrol: 5, residents: 16, towers: true },
  karuk_fort: { style: 'karuk', walls: 'palisade', buildings: [['barracks', 2], ['hut', 8], ['tower', 2], ['workshop', 1]], plaza: 'fire', guards: 9, patrol: 3, residents: 6 },
  hive: { style: 'hive', walls: 'none', buildings: [['queen_dome', 1], ['dome', 14], ['stall', 2]], plaza: 'totem', fields: 'hemp', guards: 6, patrol: 2, residents: 12 },
  hive_hostile: { style: 'hive_dead', walls: 'none', buildings: [['queen_dome', 1], ['dome', 12]], plaza: 'totem', guards: 14, patrol: 3, residents: 4 },
  swamp_town: { style: 'swamp', walls: 'palisade', buildings: [['house', 9], ['shack', 9], ['warehouse', 2], ['stall', 3], ['barracks', 1]], plaza: 'fire', fields: 'dreamleaf', guards: 9, patrol: 3, residents: 12, towers: true },
  cannibal_village: { style: 'hide', walls: 'bone', buildings: [['tent_big', 4], ['tent', 10], ['pen', 1]], plaza: 'fire', guards: 12, patrol: 3, residents: 8 },
  delver_outpost: { style: 'delver', walls: 'fence', buildings: [['container', 6], ['tent_big', 3], ['tent', 5], ['workshop', 1]], plaza: 'fire', guards: 6, patrol: 2, residents: 6 },
  hollow_enclave: { style: 'hollow', walls: 'metal', buildings: [['workshop', 3], ['warehouse', 3], ['house', 7], ['tower', 2]], plaza: 'pillar', guards: 8, patrol: 3, residents: 8, towers: true },
  hideout: { style: 'tent', walls: 'none', buildings: [['tent_big', 3], ['tent', 7]], plaza: 'fire', guards: 5, patrol: 0, residents: 6 },
  bandit_fort: { style: 'shanty', walls: 'palisade', buildings: [['boss_hut', 1], ['shack', 6], ['tent', 5], ['pen', 1], ['barracks', 1]], plaza: 'fire', guards: 14, patrol: 0, residents: 4, towers: true },
};

/** Which building houses each kind of shop. */
export const SHOP_BUILDING: Record<string, string> = {
  bar: 'bar', general: 'shop_big', weapons: 'shop', armour: 'shop', travel: 'shop', construction: 'warehouse', robotics: 'workshop', slaves: 'pen',
  tech: 'shop', mercs: 'bar_small', animals: 'stall', drugs: 'shop', thrum: 'dome', temple: 'temple',
};

export const SHOP_NAMES: Record<string, string> = {
  bar: 'Bar', general: 'General Goods', weapons: 'Weapon Smith', armour: 'Armour Smith', travel: 'Travel Shop', construction: 'Building Supplies',
  robotics: 'Robotics', slaves: 'Slave Market', tech: 'Relic Trader', mercs: 'Iron Coin Hall', animals: 'Beast Trader', drugs: 'Leaf Den', thrum: 'Resin Trader', temple: 'Temple',
};

/** A few bar names per culture. */
export const BAR_NAMES = {
  shanty: ['The Dry Throat', 'Rusty Cup', 'The Last Drop', 'Scrapheap Inn', 'The Crooked Nail'],
  adobe: ['The Well House', 'Palm Shade', 'The Thirsty Beast'],
  concord: ['The Gilded Lantern', "Lord's Rest", 'The Contract', 'Three Houses'],
  ember: ['House of Water', 'The Humble Cup', 'Pilgrim Rest'],
  karuk: ['The Broken Horn', 'Blood Mead Hall', 'The Proving Cup'],
  swamp: ['The Sinking Ship', 'Leaf and Lantern', 'The Drowned Rat'],
  delver: ['The Buried Lamp', 'Diggers Rest'],
  hollow: ['Charging Bay'],
  tent: ['The Tent'],
  hive: ['The Hum'],
};
