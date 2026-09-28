// The regions of the Sundered Waste. Each has its own ground, weather,
// wildlife, vegetation and the shape of its land.

export type TerrainKind = 'flats' | 'salt' | 'hills' | 'ember' | 'mesa' | 'forest' | 'swamp' | 'ash' | 'dunes' | 'craters' | 'glass' | 'coast';
export type WeatherKind = 'clear' | 'overcast' | 'dust' | 'rain' | 'fog' | 'acid' | 'gas' | 'ash' | 'spores' | 'heat';

export interface VegSpec {
  kind: string; // prop kind in render/props
  density: number; // per 10,000 m^2
  cluster?: number; // 0..1, how much it clumps
  minSlope?: number;
  maxSlope?: number;
}

export interface RegionDef {
  id: number;
  key: string;
  name: string;
  seeds: [number, number, number][]; // u, v, scale
  terrain: TerrainKind;
  base: number;
  ground: [number, number, number]; // three ground tones (sRGB hex)
  rock: number;
  shore: number;
  water: number;
  veg: VegSpec[];
  rocks: number; // boulder density per 10,000 m^2
  fauna: [string, number][];
  weather: [WeatherKind, number][];
  danger: number;
  fog: number;
  haze: number; // sRGB fog tint
  fertility: number; // 0..1 for farming
  water_table: number; // 0..1 for wells
  ores: [string, number][]; // resource node kinds and relative density
  desc: string;
  ambience: 'wind' | 'swamp' | 'forest' | 'machines' | 'surf' | 'eerie';
}

export const REGIONS: RegionDef[] = [
  {
    id: 0, key: 'flats', name: 'The Hollow Flats',
    seeds: [[0.42, 0.5, 1.2], [0.5, 0.58, 0.9], [0.35, 0.44, 0.9]],
    terrain: 'flats', base: 18,
    ground: [0xb8a47c, 0xa89468, 0xc4b28a], rock: 0x8b7a62, shore: 0x9c8a64, water: 0x4d6a6c,
    veg: [{ kind: 'shrub', density: 5, cluster: 0.4 }, { kind: 'deadtree', density: 0.35 }, { kind: 'cactus', density: 0.6, cluster: 0.5 }, { kind: 'grassdry', density: 24, cluster: 0.7 }],
    rocks: 1.2,
    fauna: [['dunehound', 3], ['shellback', 3], ['carrionbat', 1], ['goatling', 2]],
    weather: [['clear', 6], ['overcast', 2], ['dust', 2], ['heat', 1]],
    danger: 1, fog: 1, haze: 0xd8c9a8, fertility: 0.35, water_table: 0.4,
    ores: [['iron', 3], ['stone', 3], ['copper', 1]],
    desc: 'A broad pale desert of cracked earth and wind-carved buttes. Drifters, scavengers and the desperate make their homes here, far from the great powers.',
    ambience: 'wind',
  },
  {
    id: 1, key: 'salt', name: 'The Salt Barrens',
    seeds: [[0.64, 0.64, 1.0], [0.55, 0.72, 0.7]],
    terrain: 'salt', base: 6,
    ground: [0xdcd8cc, 0xcfcabc, 0xe6e2d8], rock: 0x9e988c, shore: 0xbab4a2, water: 0x6d8a8c,
    veg: [{ kind: 'saltcrystal', density: 1.6, cluster: 0.8 }, { kind: 'grassdry', density: 1.5, cluster: 0.9 }],
    rocks: 0.3,
    fauna: [['brineclaw', 2], ['skitter', 1], ['shellback', 1]],
    weather: [['clear', 6], ['heat', 3], ['dust', 1]],
    danger: 2, fog: 0.7, haze: 0xe8e2d4, fertility: 0.05, water_table: 0.15,
    ores: [['stone', 2], ['copper', 2]],
    desc: 'A blinding white crust that stretches to the horizon. The Concord works its salt pans here with chained hands, and the Chainhouse hunts the lonely.',
    ambience: 'wind',
  },
  {
    id: 2, key: 'vale', name: 'The Verdant Vale',
    seeds: [[0.8, 0.38, 1.05], [0.72, 0.44, 0.7]],
    terrain: 'hills', base: 20,
    ground: [0x7f9352, 0x6c8045, 0x98a25e], rock: 0x847866, shore: 0x6a7048, water: 0x4a6e6a,
    veg: [{ kind: 'grass', density: 60, cluster: 0.5 }, { kind: 'tree', density: 2.2, cluster: 0.8 }, { kind: 'shrub', density: 4 }, { kind: 'flowers', density: 6, cluster: 0.8 }],
    rocks: 0.5,
    fauna: [['longhorn', 4], ['goatling', 2], ['dunehound', 1]],
    weather: [['clear', 5], ['overcast', 3], ['rain', 2]],
    danger: 1, fog: 0.8, haze: 0xc9d0b8, fertility: 0.95, water_table: 0.9,
    ores: [['stone', 2], ['iron', 1]],
    desc: 'Rolling green hills, rare as rain in this world. The noble Houses of the Gilded Concord hold them with steel and paper.',
    ambience: 'wind',
  },
  {
    id: 3, key: 'coast', name: 'The Grey Shore',
    seeds: [[0.945, 0.6, 0.5], [0.94, 0.8, 0.45], [0.95, 0.42, 0.4]],
    terrain: 'coast', base: 4,
    ground: [0xa29d90, 0x8e8a7e, 0xb2ad9e], rock: 0x6d6b65, shore: 0x7c796e, water: 0x56696e,
    veg: [{ kind: 'seagrass', density: 22, cluster: 0.8 }, { kind: 'driftwood', density: 0.8 }],
    rocks: 1.5,
    fauna: [['brineclaw', 4], ['carrionbat', 1]],
    weather: [['fog', 6], ['overcast', 3], ['rain', 2]],
    danger: 3, fog: 2.8, haze: 0xa8b0b0, fertility: 0.3, water_table: 0.9,
    ores: [['stone', 2], ['copper', 1]],
    desc: 'A cold, fog-drowned strand of shingle and bone. Things walk in the mist here that were people once.',
    ambience: 'surf',
  },
  {
    id: 4, key: 'ember', name: 'The Emberlands',
    seeds: [[0.4, 0.16, 1.0], [0.27, 0.21, 0.8], [0.5, 0.2, 0.7]],
    terrain: 'ember', base: 30,
    ground: [0xa58c5e, 0x928a56, 0xb49a6a], rock: 0x9a6a4e, shore: 0x8a7a55, water: 0x4d6a66,
    veg: [{ kind: 'shrub', density: 4 }, { kind: 'olive', density: 0.9, cluster: 0.6 }, { kind: 'grassdry', density: 28, cluster: 0.6 }],
    rocks: 0.8,
    fauna: [['goatling', 3], ['shellback', 2], ['dunehound', 1]],
    weather: [['clear', 7], ['heat', 3], ['overcast', 1]],
    danger: 1, fog: 0.8, haze: 0xe3cfa6, fertility: 0.7, water_table: 0.6,
    ores: [['iron', 2], ['stone', 3]],
    desc: 'Sun-baked farmland under the eye of the Ember Covenant, where every field is a prayer and every stranger is a question.',
    ambience: 'wind',
  },
  {
    id: 5, key: 'highlands', name: 'The Karuk Highlands',
    seeds: [[0.13, 0.17, 1.0], [0.22, 0.33, 0.75], [0.07, 0.3, 0.6]],
    terrain: 'mesa', base: 45,
    ground: [0xa66a4a, 0xb67d56, 0x96603f], rock: 0x8a5440, shore: 0x7e5a44, water: 0x4c6566,
    veg: [{ kind: 'redgrass', density: 26, cluster: 0.7 }, { kind: 'shrub', density: 2.5 }, { kind: 'deadtree', density: 0.3 }],
    rocks: 1.8,
    fauna: [['shellback', 2], ['hookbeak', 0.6], ['goatling', 2], ['dunehound', 2]],
    weather: [['clear', 5], ['dust', 3], ['overcast', 1]],
    danger: 2, fog: 0.9, haze: 0xd8b69a, fertility: 0.3, water_table: 0.35,
    ores: [['iron', 4], ['stone', 3], ['copper', 2]],
    desc: 'Red mesas and wind-cut canyons. The horned Karuk hold this land and honour only strength, and a fair fight.',
    ambience: 'wind',
  },
  {
    id: 6, key: 'thrumwood', name: 'The Thrumwood',
    seeds: [[0.12, 0.52, 1.0], [0.18, 0.63, 0.7]],
    terrain: 'forest', base: 20,
    ground: [0x7e7a40, 0x8c8242, 0x6c6a38], rock: 0x6d6450, shore: 0x5e5a38, water: 0x485c42,
    veg: [{ kind: 'stalk', density: 4, cluster: 0.6 }, { kind: 'fungus', density: 3, cluster: 0.7 }, { kind: 'grass', density: 36, cluster: 0.5 }, { kind: 'shrub', density: 3 }],
    rocks: 0.6,
    fauna: [['skitter', 3], ['goatling', 1], ['carrionbat', 1]],
    weather: [['spores', 4], ['overcast', 3], ['clear', 3], ['rain', 1]],
    danger: 2, fog: 1.6, haze: 0xc9b87a, fertility: 0.6, water_table: 0.7,
    ores: [['stone', 2], ['copper', 2]],
    desc: 'A humming forest of giant stalks and spore-caps. The Thrum hives sing here, and strangers who respect the Queen may trade.',
    ambience: 'forest',
  },
  {
    id: 7, key: 'mire', name: 'The Mire',
    seeds: [[0.2, 0.84, 1.0], [0.31, 0.79, 0.65], [0.1, 0.78, 0.6]],
    terrain: 'swamp', base: 1.2,
    ground: [0x545638, 0x5e5c3a, 0x4a4c32], rock: 0x545046, shore: 0x46482f, water: 0x3a4630,
    veg: [{ kind: 'swamptree', density: 2, cluster: 0.6 }, { kind: 'reeds', density: 30, cluster: 0.8 }, { kind: 'fungus', density: 0.8 }, { kind: 'grass', density: 10, cluster: 0.6 }],
    rocks: 0.2,
    fauna: [['mauler', 2], ['bloodfly', 3], ['brineclaw', 1]],
    weather: [['rain', 4], ['fog', 3], ['overcast', 3]],
    danger: 3, fog: 2.0, haze: 0x9ea48a, fertility: 0.8, water_table: 1,
    ores: [['copper', 1], ['stone', 1]],
    desc: 'A drowned green country of sucking mud and warm rain. The Scorched Hand grows dreamleaf here and trusts no one.',
    ambience: 'swamp',
  },
  {
    id: 8, key: 'ash', name: 'The Ashfields',
    seeds: [[0.45, 0.87, 1.0], [0.38, 0.93, 0.6]],
    terrain: 'ash', base: 12,
    ground: [0x7c7874, 0x6a6662, 0x8a8480], rock: 0x55504c, shore: 0x5e5a56, water: 0x4a5250,
    veg: [{ kind: 'blacktree', density: 1.1, cluster: 0.6 }, { kind: 'ashgrass', density: 14, cluster: 0.7 }],
    rocks: 0.9,
    fauna: [['carrionbat', 2], ['dunehound', 2], ['skitter', 1]],
    weather: [['ash', 4], ['overcast', 4], ['clear', 2]],
    danger: 4, fog: 1.5, haze: 0x9a9690, fertility: 0.2, water_table: 0.3,
    ores: [['iron', 2], ['stone', 2], ['copper', 1]],
    desc: 'Grey ash drifts over a buried country. The Mawkin hunt here, and they are always hungry.',
    ambience: 'eerie',
  },
  {
    id: 9, key: 'bonesea', name: 'The Bone Sea',
    seeds: [[0.72, 0.86, 1.05], [0.6, 0.92, 0.7], [0.83, 0.9, 0.6]],
    terrain: 'dunes', base: 14,
    ground: [0xc89c62, 0xba8c56, 0xd6ae76], rock: 0x9c7550, shore: 0xa7865c, water: 0x557070,
    veg: [{ kind: 'bones', density: 0.2, cluster: 0.3 }, { kind: 'grassdry', density: 2.5, cluster: 0.9 }],
    rocks: 0.4,
    fauna: [['hookbeak', 1.5], ['skitter', 2], ['dunehound', 1]],
    weather: [['clear', 4], ['dust', 4], ['heat', 3]],
    danger: 4, fog: 1.1, haze: 0xe6c696, fertility: 0.05, water_table: 0.1,
    ores: [['iron', 1], ['copper', 3]],
    desc: 'An ocean of orange dunes, ribbed with the skeletons of things too large to have lived. The Delvers dig here for the past.',
    ambience: 'wind',
  },
  {
    id: 10, key: 'rust', name: 'The Rustwastes',
    seeds: [[0.72, 0.14, 1.0], [0.79, 0.24, 0.7], [0.62, 0.1, 0.6]],
    terrain: 'craters', base: 42,
    ground: [0x8a6a50, 0x7a5c46, 0x967660], rock: 0x6a5e56, shore: 0x6a5446, water: 0x55574a,
    veg: [{ kind: 'scrap', density: 2.5, cluster: 0.6 }, { kind: 'grassdry', density: 6, cluster: 0.8 }, { kind: 'deadtree', density: 0.2 }],
    rocks: 1.0,
    fauna: [['rustspider', 2], ['skitter', 1]],
    weather: [['gas', 2], ['overcast', 4], ['dust', 2], ['clear', 2]],
    danger: 4, fog: 1.2, haze: 0xb49c86, fertility: 0.1, water_table: 0.3,
    ores: [['iron', 4], ['copper', 3]],
    desc: 'Cratered wastes strewn with the rusting bones of the Old Makers. Some of the machines still wake, and still remember their orders.',
    ambience: 'machines',
  },
  {
    id: 11, key: 'glass', name: 'The Glasslands',
    seeds: [[0.92, 0.08, 1.0], [0.95, 0.2, 0.55]],
    terrain: 'glass', base: 50,
    ground: [0x4d5c5c, 0x3e4c4e, 0x5c6a66], rock: 0x2f3a3c, shore: 0x3a4646, water: 0x4c6a52,
    veg: [{ kind: 'crystal', density: 3, cluster: 0.7 }, { kind: 'ashgrass', density: 2, cluster: 0.9 }],
    rocks: 1.4,
    fauna: [['warden', 1], ['rustspider', 2], ['glassstalker', 1]],
    weather: [['acid', 4], ['overcast', 3], ['clear', 1]],
    danger: 5, fog: 1.3, haze: 0x9fb4a8, fertility: 0, water_table: 0.2,
    ores: [['copper', 2], ['iron', 2]],
    desc: 'Land melted into black-green glass by the weapons that sundered the world. The rain here eats flesh. The ruins here hold wonders.',
    ambience: 'eerie',
  },
];

export const REGION_BY_KEY: Record<string, RegionDef> = Object.fromEntries(REGIONS.map((r) => [r.key, r]));

/** Region pairs that are divided by mountains, with ridge height (m). */
export const MOUNTAIN_PAIRS: [string, string, number][] = [
  ['ember', 'flats', 210],
  ['ember', 'vale', 180],
  ['rust', 'vale', 150],
  ['rust', 'ember', 110],
  ['highlands', 'thrumwood', 130],
  ['highlands', 'ember', 70],
  ['ash', 'bonesea', 70],
  ['glass', 'rust', 120],
  ['thrumwood', 'flats', 45],
];

/** Mountain passes (normalised u, v, radius m). */
export const PASSES: [number, number, number][] = [
  [0.505, 0.305, 320], // Pyre's Watch, the Spine pass
  [0.31, 0.335, 260], // western Spine
  [0.72, 0.305, 280], // Stonegate gap
  [0.57, 0.17, 260],
  [0.16, 0.42, 300], // Redmesa to the Thrumwood
  [0.56, 0.87, 280],
  [0.86, 0.14, 240],
  [0.24, 0.47, 260],
  [0.62, 0.36, 300],
];

/** The Wending: the one great river, from the highlands to the southern sea. */
export const RIVER: [number, number][] = [
  [0.17, 0.25], [0.21, 0.31], [0.27, 0.38], [0.33, 0.45], [0.355, 0.53], [0.33, 0.61], [0.29, 0.68], [0.24, 0.75], [0.21, 0.83], [0.19, 0.91], [0.2, 1.02],
];
/** Shallow fords across the river (u, v). */
export const FORDS: [number, number][] = [[0.3, 0.415], [0.353, 0.525], [0.31, 0.645], [0.225, 0.79], [0.2, 0.285]];

/** Lakes and oases (u, v, radius m, depth m). */
export const LAKES: [number, number, number, number][] = [
  [0.3, 0.58, 170, 3], // Dustwell oasis
  [0.84, 0.46, 420, 6], // Vale lake
  [0.49, 0.12, 200, 3], // Cinderhold reservoir
  [0.6, 0.66, 260, 1.5], // salt pan lake
  [0.12, 0.56, 150, 2],
  [0.76, 0.2, 230, 4], // Rustwastes crater lake
];
