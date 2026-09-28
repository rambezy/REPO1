// What each settlement has too much of, and what it cannot get enough of.
// Entries are item ids or item categories. Cheap goods sell for less and
// fetch less; dear goods cost more and fetch more. Carry salt to the Vale
// and silk to the Barrens and you will not stay poor.

export interface Market { cheap: string[]; dear: string[]; }

export const MARKETS: Record<string, Market> = {
  crossroad: { cheap: ['dried_meat', 'bandages'], dear: ['iron_plates', 'building_mats', 'steel_bars'] },
  squatters: { cheap: ['cactus'], dear: ['food', 'drink', 'fabric'] },
  dustwell: { cheap: ['cactus', 'fabric', 'hemp'], dear: ['salt', 'spice', 'iron_ore'] },
  aurum: { cheap: ['silk', 'wheat', 'flour'], dear: ['resin', 'spice', 'glass_beads', 'ancient_coin', 'artifact', 'book'] },
  harrowmarket: { cheap: ['salt', 'iron_ore', 'shackles'], dear: ['silk', 'resin', 'spice'] },
  saltmere: { cheap: ['salt', 'stone'], dear: ['food', 'wheat', 'fabric', 'medical'] },
  chainfield: { cheap: ['riceweed', 'shackles'], dear: ['food', 'drink'] },
  stonegate: { cheap: ['iron_ore', 'copper_ore', 'stone', 'iron_plates'], dear: ['food', 'fabric', 'leather', 'drink'] },
  cinderhold: { cheap: ['wheat', 'flour', 'spice'], dear: ['steel_bars', 'iron_plates', 'salt'] },
  brightwater: { cheap: ['wheat', 'spice', 'flour'], dear: ['salt', 'leather', 'iron_ore'] },
  pyreswatch: { cheap: ['spice'], dear: ['food', 'medical', 'bolts'] },
  hornspire: { cheap: ['leather', 'hide', 'bone'], dear: ['steel_bars', 'spice', 'drink', 'silk'] },
  redmesa: { cheap: ['hide', 'bone', 'leather'], dear: ['medical', 'drink', 'food'] },
  humminghollow: { cheap: ['resin', 'hemp', 'chitin'], dear: ['iron_plates', 'iron_ore', 'salt'] },
  waxgate: { cheap: ['resin', 'hemp'], dear: ['iron_ore', 'iron_plates', 'copper_ore'] },
  mudwater: { cheap: ['dreamleaf', 'riceweed'], dear: ['salt', 'weapon', 'medical'] },
  lanternrest: { cheap: ['glass_beads'], dear: ['food', 'drink', 'fuel', 'artifact'] },
  rustward: { cheap: ['machine_parts', 'elec_parts', 'repair_kit'], dear: ['copper_ore', 'artifact', 'book'] },
  brokenchain: { cheap: ['riceweed'], dear: ['food', 'medical', 'weapon'] },
  lowtide: { cheap: ['raw_meat', 'salt'], dear: ['wheat', 'fabric', 'fuel'] },
  glassfall: { cheap: ['glass_beads'], dear: ['food', 'drink', 'medical'] },
};

export const CHEAP_BUY = 0.72, CHEAP_SELL = 0.7;
export const DEAR_BUY = 1.3, DEAR_SELL = 1.45;
