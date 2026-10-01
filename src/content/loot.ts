// Initial contents of containers. Specific containers are registered by the
// story modules; the rest roll from generic tables by id prefix.

import { ItemStack } from '../state';
import { RNG, hashStr } from '../engine/util';

const fixed = new Map<string, ItemStack[]>();
export function registerLoot(cid: string, items: [string, number][]) {
  fixed.set(cid, items.map(([id, n]) => ({ id, n })));
}

const TABLES: Record<string, [string, number, number, number][]> = {
  // [item, min, max, chance]
  peasant: [['bread', 1, 2, 0.5], ['apple', 1, 3, 0.4], ['coins', 1, 8, 0.6], ['linen_shirt', 1, 1, 0.15], ['hose', 1, 1, 0.1], ['bandage', 1, 2, 0.25], ['cheese', 1, 1, 0.25], ['torch', 1, 2, 0.3], ['beer', 1, 2, 0.2]],
  rich: [['coins', 10, 45, 0.9], ['wine', 1, 2, 0.5], ['silver_ring', 1, 1, 0.2], ['fine_hose', 1, 1, 0.15], ['sausage', 1, 2, 0.4], ['chronicle', 1, 1, 0.08], ['candle', 1, 1, 0]],
  food: [['bread', 1, 3, 0.6], ['apple', 1, 4, 0.5], ['cheese', 1, 2, 0.4], ['sausage', 1, 2, 0.3], ['beer', 1, 3, 0.4], ['smoked_fish', 1, 2, 0.3]],
  tools: [['iron_ingot', 1, 2, 0.4], ['charcoal', 1, 3, 0.5], ['whetstone', 1, 1, 0.4], ['lockpick', 1, 2, 0.2], ['repair_kit', 1, 1, 0.15], ['torch', 1, 2, 0.4]],
  bandit: [['coins', 5, 30, 0.9], ['bandage', 1, 3, 0.5], ['lockpick', 1, 3, 0.5], ['rusty_sword', 1, 1, 0.3], ['wine', 1, 2, 0.4], ['arrow', 5, 15, 0.4], ['silver_ring', 1, 1, 0.15], ['yarrow_salve', 1, 1, 0.3], ['hood', 1, 1, 0.2]],
  soldier: [['coins', 8, 40, 0.8], ['bandage', 1, 2, 0.6], ['sausage', 1, 1, 0.4], ['arrow', 5, 12, 0.3], ['whetstone', 1, 1, 0.3], ['wine', 1, 1, 0.3], ['dice_set', 1, 1, 0.1]],
  herbs: [['yarrow', 1, 3, 0.6], ['chamomile', 1, 3, 0.5], ['sage', 1, 2, 0.4], ['comfrey', 1, 2, 0.4], ['valerian', 1, 2, 0.3], ['mint', 1, 3, 0.5], ['bandage', 1, 2, 0.4]],
  church: [['candle', 0, 0, 0], ['coins', 3, 15, 0.7], ['wax', 1, 3, 0.6], ['wine', 1, 2, 0.5], ['saints', 1, 1, 0.2]],
  mine: [['silver_ore', 1, 3, 0.6], ['iron_ingot', 1, 1, 0.3], ['torch', 1, 3, 0.6], ['bread', 1, 1, 0.3]],
  empty: [],
};

export function lootTable(cid: string): ItemStack[] {
  const f = fixed.get(cid);
  if (f) return f.map((s) => ({ ...s }));
  const kind = cid.split(':')[1] || 'peasant';
  const table = TABLES[kind] || TABLES.peasant;
  const rng = new RNG(hashStr(cid));
  const out: ItemStack[] = [];
  for (const [id, mn, mx, ch] of table) {
    if (rng.next() < ch) out.push({ id, n: rng.int(mn, mx) });
  }
  return out.filter((s) => s.n > 0);
}

/** Loot carried by an enemy of a given kind (goes into their body container). */
export function enemyLoot(kind: string, seed: string): { items: ItemStack[]; coins: number } {
  const rng = new RNG(hashStr(seed));
  const table = TABLES[kind] || TABLES.bandit;
  const items: ItemStack[] = [];
  let coins = 0;
  for (const [id, mn, mx, ch] of table) {
    if (rng.next() >= ch * 0.6) continue;
    if (id === 'coins') coins += rng.int(mn, mx);
    else items.push({ id, n: rng.int(Math.max(1, mn), mx) });
  }
  return { items, coins };
}
