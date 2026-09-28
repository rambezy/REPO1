// Shops: stock by kind, culture and region, restocking every few days, and
// prices that depend on the shop's markup and how its faction sees you.
import { World } from './world';
import { S } from './ctx';
import { Grid } from './inventory';
import { ITEM, itemValue, ItemDef } from '../content/items';
import { RNG } from '../core/rng';
import { Item } from './inventory';
import { BOOKS } from '../content/lore';

export interface Shop {
  id: number; // the counter object that holds the stock
  kind: string;
  faction: string;
  site: number;
  keeper: number;
  money: number;
  restockDay: number;
  markup: number;
  wealth: number; // 0..1 how rich the town is, raises grades
  name: string;
}

type Entry = [id: string, weight: number, min: number, max: number];

const FOOD: Entry[] = [['dustbread', 3, 4, 12], ['dried_meat', 3, 4, 10], ['hardtack', 2, 3, 8], ['porridge', 1, 2, 6], ['travel_ration', 1, 2, 5], ['greenfruit', 1, 2, 6]];
const MED: Entry[] = [['bandages', 3, 3, 10], ['first_aid', 2, 1, 5], ['splint_kit', 1, 1, 3]];
const DRINK: Entry[] = [['grog', 3, 4, 10], ['cactus_rum', 2, 2, 6], ['dustwine', 1, 1, 4]];

const TABLES: Record<string, Entry[]> = {
  general: [...FOOD, ...MED, ['fabric', 1, 4, 10], ['hemp', 1, 5, 15], ['small_pack', 1, 1, 2], ['basket', 1, 1, 2], ['shackles', 1, 1, 3], ['bolts', 1, 20, 60], ['lockpick_set', 0.3, 1, 1], ['salt', 0.5, 2, 5], ['spice', 0.5, 1, 4]],
  bar: [...DRINK, ...FOOD.slice(0, 4), ['stew', 2, 2, 6]],
  weapons: [['drift_blade', 3, 1, 2], ['scrap_sabre', 2, 1, 2], ['dune_sabre', 2, 1, 2], ['iron_hatchet', 2, 1, 2], ['cleaver', 2, 1, 2], ['iron_club', 2, 1, 2], ['spear', 2, 1, 2], ['slab', 1, 1, 1], ['glaive', 1, 1, 1], ['knife', 1, 1, 3], ['hand_xbow', 1, 1, 1], ['bolt_thrower', 0.6, 1, 1], ['bolts', 2, 30, 80], ['mining_pick', 1, 1, 2], ['longsliver', 0.6, 1, 1], ['bone_chopper', 0.6, 1, 1], ['knuckle_mace', 0.6, 1, 1]],
  armour: [['leather_jerkin', 3, 1, 2], ['padded_vest', 2, 1, 2], ['scrap_plate', 1, 1, 1], ['chain_shirt', 1, 1, 1], ['leather_leggings', 2, 1, 2], ['chain_leggings', 1, 1, 1], ['leather_boots', 2, 1, 2], ['iron_boots', 1, 1, 1], ['skullcap', 2, 1, 2], ['bucket_helm', 1, 1, 1], ['long_coat', 1, 1, 1], ['dust_coat', 1, 1, 2], ['mask', 0.4, 1, 1]],
  travel: [['drifter_shirt', 3, 1, 3], ['dark_shirt', 1, 1, 2], ['farmer_tunic', 1, 1, 2], ['cargo_pants', 3, 1, 3], ['dark_pants', 1, 1, 2], ['sandals', 2, 1, 2], ['leather_boots', 2, 1, 2], ['straw_hat', 2, 1, 3], ['hood', 1, 1, 2], ['bandana', 1, 1, 3], ['turban', 1, 1, 2], ['goggles', 0.6, 1, 1], ['dust_coat', 2, 1, 2], ['small_pack', 2, 1, 2], ['travel_pack', 2, 1, 2], ['large_pack', 1, 1, 1], ['thief_pack', 0.5, 1, 1], ['medic_pack', 0.5, 1, 1], ['travel_ration', 2, 2, 6]],
  construction: [['building_mats', 3, 10, 30], ['iron_plates', 3, 6, 20], ['fabric', 2, 6, 20], ['leather', 1, 3, 10], ['steel_bars', 1, 3, 8], ['stone', 1, 10, 25], ['fuel', 1, 3, 10], ['elec_parts', 0.5, 1, 4], ['machine_parts', 0.5, 1, 3]],
  robotics: [['scrap_arm', 2, 1, 1], ['scrap_leg', 2, 1, 1], ['standard_arm', 1, 1, 1], ['standard_leg', 1, 1, 1], ['warden_arm', 0.2, 1, 1], ['warden_leg', 0.2, 1, 1], ['repair_kit', 3, 2, 6], ['machine_parts', 2, 2, 6], ['elec_parts', 2, 2, 5], ['memory_shard', 0.5, 1, 2]],
  tech: [['maker_tablet', 2, 1, 3], ['old_codex', 1, 1, 2], ['relic_core', 0.3, 1, 1], ['elec_parts', 2, 2, 6], ['machine_parts', 2, 2, 6], ['gasmask', 1, 1, 1], ['goggles', 1, 1, 2], ['surgical_kit', 1, 1, 3], ['foodcube', 1, 1, 4], ['ancient_coin', 1, 1, 4], ['visor_helm', 0.2, 1, 1]],
  drugs: [['dreamleaf', 4, 10, 30], ['cactus_rum', 2, 3, 8], ['grog', 1, 3, 8], ['dark_shirt', 1, 1, 2], ['thief_pack', 1, 1, 1], ['lockpick_set', 1, 1, 2]],
  thrum: [['honey_resin', 4, 6, 16], ['resin', 3, 4, 12], ['chitin', 2, 4, 10], ['hive_carapace', 1, 1, 2], ['hive_pack', 1, 1, 2], ['thrum_wrap', 2, 1, 3], ['hemp', 1, 6, 16]],
  slaves: [['shackles', 3, 3, 8], ['rag_shirt', 1, 2, 4], ['rag_pants', 1, 2, 4], ['iron_club', 1, 1, 2]],
  animals: [['raw_meat', 2, 4, 10], ['hide', 2, 3, 8], ['leather', 1, 2, 6], ['bone', 1, 4, 10]],
  mercs: [...DRINK.slice(0, 2), ['first_aid', 1, 2, 4]],
  temple: [['bandages', 2, 4, 10], ['first_aid', 1, 2, 4], ['ember_robe', 1, 1, 2], ['white_hood', 1, 1, 2]],
};

/** Regional and cultural extras layered over the base tables. */
const FLAVOUR: Record<string, Partial<Record<string, Entry[]>>> = {
  concord: { weapons: [['concord_sabre', 3, 1, 2], ['longsliver', 1, 1, 1], ['ringsabre', 0.3, 1, 1]], armour: [['blade_cuirass', 1, 1, 1], ['blade_helm', 1, 1, 1], ['blade_greaves', 1, 1, 1], ['kasa', 2, 1, 2]], travel: [['noble_shirt', 0.4, 1, 1], ['silk', 0.5, 1, 3]], general: [['dustwine', 1, 2, 5]] },
  ember: { weapons: [['ember_edge', 2, 1, 2], ['longreach', 1, 1, 1]], armour: [['ember_plate', 0.7, 1, 1], ['ember_helm', 0.7, 1, 1], ['plate_greaves', 0.6, 1, 1], ['white_hood', 2, 1, 2]], travel: [['ember_robe', 2, 1, 2]], general: [['spice', 2, 2, 6], ['wheat', 1, 6, 16]] },
  karuk: { weapons: [['crescent', 2, 1, 2], ['hornbreaker', 1, 1, 1], ['gravemaker', 0.5, 1, 1], ['bone_maul', 1, 1, 1]], armour: [['bone_vest', 1, 1, 2], ['horncap', 2, 1, 2]] },
  hollows: { robotics: [['standard_arm', 1, 1, 2], ['standard_leg', 1, 1, 2], ['warden_arm', 0.5, 1, 1], ['warden_leg', 0.5, 1, 1]], general: [['repair_kit', 2, 2, 5]] },
  delvers: { tech: [['relic_core', 0.4, 1, 1], ['old_codex', 1, 1, 2]], general: [['gasmask', 0.5, 1, 1], ['goggles', 1, 1, 2]] },
  scorched: { weapons: [['heater', 1, 1, 1], ['hand_xbow', 1, 1, 1]], general: [['dreamleaf', 2, 4, 10], ['swamp_boots', 1, 1, 2], ['riceweed', 2, 6, 16]] },
  drifters: { general: [['cactus', 1, 4, 10]] },
};

const SHOP_MONEY: Record<string, number> = { general: 3000, bar: 1500, weapons: 5000, armour: 5000, travel: 3000, construction: 4000, robotics: 8000, tech: 12000, drugs: 2500, thrum: 2500, slaves: 4000, animals: 1500, mercs: 1500, temple: 800 };

export function makeShop(W: World, counterId: number, kind: string, faction: string, site: number, keeper: number, wealth: number, name: string): Shop {
  const sh: Shop = { id: counterId, kind, faction, site, keeper, money: Math.round((SHOP_MONEY[kind] ?? 2000) * (0.6 + wealth)), restockDay: 0, markup: 0.15 + (1 - wealth) * 0.1, wealth, name };
  W.shops.set(counterId, sh);
  restock(sh);
  return sh;
}

export function shopGrid(sh: Shop): Grid | null {
  return S.W.objs.get(sh.id)?.inv ?? null;
}

/** Books a shop might carry: its own faction's, the common ones, and Maker texts at relic traders. */
function bookEntries(sh: Shop): Entry[] {
  if (sh.kind !== 'general' && sh.kind !== 'tech' && sh.kind !== 'temple' && sh.kind !== 'travel') return [];
  const out: Entry[] = [];
  for (const b of BOOKS) {
    if (b.rare && sh.kind !== 'tech') continue;
    const mine = b.factions?.includes(sh.faction);
    if (sh.kind === 'temple' && !mine) continue;
    if (b.factions?.length && !mine && sh.kind !== 'tech') continue;
    out.push(['book_' + b.key, mine ? 0.5 : b.rare ? 0.25 : 0.2, 1, 1]);
  }
  return out;
}

export function restock(sh: Shop) {
  const g = shopGrid(sh);
  if (!g) return;
  const rng = new RNG((sh.id * 7919 + (S.clock?.day ?? 0) * 104729) >>> 0);
  // keep a little of the old stock, clear the rest
  g.items = g.items.filter(() => rng.chance(0.25));
  const table = [...(TABLES[sh.kind] ?? TABLES.general), ...(FLAVOUR[sh.faction]?.[sh.kind] ?? []), ...bookEntries(sh)];
  const picks = 8 + Math.round(sh.wealth * 8);
  for (let i = 0; i < picks; i++) {
    const [id, , a, b] = rng.weighted(table.map((e) => [e, e[1]] as const));
    if (!ITEM[id]) continue;
    const d = ITEM[id];
    const q = d.graded ? Math.max(0, Math.min(6, Math.round(rng.gauss(1.4 + sh.wealth * 2.6, 0.8)))) : 2;
    g.add(id, rng.int(a, b), q);
  }
  sh.money = Math.max(sh.money, Math.round((SHOP_MONEY[sh.kind] ?? 2000) * (0.6 + sh.wealth)));
  sh.restockDay = (S.clock?.day ?? 0) + rng.int(3, 5);
}

function relMod(faction: string) {
  const r = S.W.rel.get('player', faction);
  return r > 50 ? 0.85 : r > 20 ? 0.93 : r < -20 ? 1.25 : 1;
}

/** Price the shop charges for an item (per unit). */
export function buyPrice(sh: Shop, it: Item | { id: string; q: number }) {
  const d: ItemDef = ITEM[it.id];
  return Math.max(1, Math.round(itemValue(d, it.q) * (1.15 + sh.markup) * relMod(sh.faction)));
}

/** What the shop pays for an item (per unit). */
export function sellPrice(sh: Shop, it: Item) {
  const d = ITEM[it.id];
  let k = 0.5 / relMod(sh.faction);
  if (sh.kind === 'tech' && (d.cat === 'artifact' || d.research)) k = 0.8;
  if (sh.kind === 'robotics' && (d.cat === 'robotics' || d.id === 'machine_parts' || d.id === 'elec_parts')) k = 0.7;
  if (it.stolen === sh.faction) k *= 0.3;
  if (d.illegal?.includes(sh.faction)) return 0;
  return Math.max(1, Math.round(itemValue(d, it.q) * k));
}

export function tickShops() {
  const day = S.clock.day;
  for (const sh of S.W.shops.values()) if (day >= sh.restockDay) restock(sh);
}
