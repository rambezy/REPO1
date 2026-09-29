// Shops: stock by kind, culture and region, restocking every few days, and
// prices that depend on the shop's markup and how its faction sees you.
import { World } from './world';
import { S } from './ctx';
import { Grid } from './inventory';
import { ITEM, itemValue, ItemDef } from '../content/items';
import { RNG } from '../core/rng';
import { Item } from './inventory';
import { BOOKS } from '../content/lore';
import { MARKETS, Market, CHEAP_BUY, CHEAP_SELL, DEAR_BUY, DEAR_SELL } from '../content/markets';

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
  weapons: [['drift_blade', 3, 1, 2], ['scrap_sabre', 2, 1, 2], ['dune_sabre', 2, 1, 2], ['iron_hatchet', 2, 1, 2], ['cleaver', 2, 1, 2], ['iron_club', 2, 1, 2], ['spear', 2, 1, 2], ['slab', 1, 1, 1], ['glaive', 1, 1, 1], ['knife', 1, 1, 3], ['hand_xbow', 1, 1, 1], ['bolt_thrower', 0.6, 1, 1], ['bolts', 2, 30, 80], ['mining_pick', 1, 1, 2], ['longsliver', 0.6, 1, 1], ['bone_chopper', 0.6, 1, 1], ['knuckle_mace', 0.6, 1, 1], ['springblade', 1.5, 1, 2], ['shiv', 1, 1, 3], ['pipe_spear', 1, 1, 2], ['girder', 0.5, 1, 1], ['pry_bar', 0.6, 1, 1], ['scrap_xbow', 0.8, 1, 1]],
  armour: [['leather_jerkin', 3, 1, 2], ['padded_vest', 2, 1, 2], ['scrap_plate', 1, 1, 1], ['chain_shirt', 1, 1, 1], ['leather_leggings', 2, 1, 2], ['chain_leggings', 1, 1, 1], ['leather_boots', 2, 1, 2], ['iron_boots', 1, 1, 1], ['skullcap', 2, 1, 2], ['bucket_helm', 1, 1, 1], ['long_coat', 1, 1, 1], ['dust_coat', 1, 1, 2], ['mask', 0.4, 1, 1], ['studded_jerkin', 1, 1, 1], ['scrap_greaves', 1, 1, 1], ['patch_coat', 0.8, 1, 2]],
  travel: [['drifter_shirt', 3, 1, 3], ['dark_shirt', 1, 1, 2], ['farmer_tunic', 1, 1, 2], ['cargo_pants', 3, 1, 3], ['dark_pants', 1, 1, 2], ['sandals', 2, 1, 2], ['leather_boots', 2, 1, 2], ['straw_hat', 2, 1, 3], ['hood', 1, 1, 2], ['bandana', 1, 1, 3], ['turban', 1, 1, 2], ['goggles', 0.6, 1, 1], ['dust_coat', 2, 1, 2], ['small_pack', 2, 1, 2], ['travel_pack', 2, 1, 2], ['large_pack', 1, 1, 1], ['thief_pack', 0.5, 1, 1], ['medic_pack', 0.5, 1, 1], ['travel_ration', 2, 2, 6], ['patch_coat', 1, 1, 2]],
  construction: [['building_mats', 3, 10, 30], ['iron_plates', 3, 6, 20], ['fabric', 2, 6, 20], ['leather', 1, 3, 10], ['steel_bars', 1, 3, 8], ['stone', 1, 10, 25], ['fuel', 1, 3, 10], ['elec_parts', 0.5, 1, 4], ['machine_parts', 0.5, 1, 3]],
  robotics: [['scrap_arm', 2, 1, 1], ['scrap_leg', 2, 1, 1], ['standard_arm', 1, 1, 1], ['standard_leg', 1, 1, 1], ['warden_arm', 0.2, 1, 1], ['warden_leg', 0.2, 1, 1], ['repair_kit', 3, 2, 6], ['machine_parts', 2, 2, 6], ['elec_parts', 2, 2, 5], ['memory_shard', 0.5, 1, 2], ['solder_tin', 2, 2, 6]],
  tech: [['maker_tablet', 2, 1, 3], ['old_codex', 1, 1, 2], ['relic_core', 0.3, 1, 1], ['elec_parts', 2, 2, 6], ['machine_parts', 2, 2, 6], ['gasmask', 1, 1, 1], ['goggles', 1, 1, 2], ['surgical_kit', 1, 1, 3], ['foodcube', 1, 1, 4], ['ancient_coin', 1, 1, 4], ['visor_helm', 0.2, 1, 1], ['glass_edge', 0.06, 1, 1], ['warden_cleaver', 0.06, 1, 1], ['starfall_hammer', 0.06, 1, 1]],
  drugs: [['dreamleaf', 4, 10, 30], ['dreamsmoke', 3, 4, 12], ['glowdust', 1.5, 2, 6], ['redrage', 0.8, 1, 3], ['glowcap', 1, 3, 8], ['bloodthorn', 1, 3, 8], ['cactus_rum', 2, 3, 8], ['grog', 1, 3, 8], ['dark_shirt', 1, 1, 2], ['thief_pack', 1, 1, 1], ['smuggler_pack', 0.6, 1, 1], ['lockpick_set', 1, 1, 2]],
  thrum: [['honey_resin', 4, 6, 16], ['resin', 3, 4, 12], ['chitin', 2, 4, 10], ['hive_carapace', 1, 1, 2], ['hive_pack', 1, 1, 2], ['thrum_wrap', 2, 1, 3], ['hemp', 1, 6, 16], ['waxbread', 2, 4, 12], ['hive_mead', 1.5, 2, 6], ['resin_salve', 1.5, 2, 6], ['chitin_scale', 0.8, 1, 2], ['chitin_greaves', 0.8, 1, 2], ['stinger_spear', 0.6, 1, 1], ['mandible_blade', 0.6, 1, 1]],
  slaves: [['shackles', 3, 3, 8], ['rag_shirt', 1, 2, 4], ['rag_pants', 1, 2, 4], ['iron_club', 1, 1, 2], ['sack_shirt', 2, 2, 5], ['taskmaster_sabre', 0.5, 1, 1]],
  animals: [['raw_meat', 2, 4, 10], ['hide', 2, 3, 8], ['leather', 1, 2, 6], ['bone', 1, 4, 10]],
  mercs: [...DRINK.slice(0, 2), ['first_aid', 1, 2, 4]],
  temple: [['bandages', 2, 4, 10], ['first_aid', 1, 2, 4], ['ember_robe', 1, 1, 2], ['white_hood', 1, 1, 2], ['pyre_incense', 2, 3, 8], ['censer_mace', 0.3, 1, 1]],
};

/** Regional and cultural extras layered over the base tables. */
const FLAVOUR: Record<string, Partial<Record<string, Entry[]>>> = {
  concord: { weapons: [['concord_sabre', 3, 1, 2], ['longsliver', 1, 1, 1], ['ringsabre', 0.3, 1, 1]], armour: [['blade_cuirass', 1, 1, 1], ['blade_helm', 1, 1, 1], ['blade_greaves', 1, 1, 1], ['kasa', 2, 1, 2], ['iron_kasa', 1, 1, 2]], travel: [['noble_shirt', 0.4, 1, 1], ['silk', 0.5, 1, 3], ['concord_tunic', 1.5, 1, 2]], general: [['dustwine', 1, 2, 5], ['vale_cheese', 1, 2, 5]], bar: [['vale_cheese', 1, 2, 4]] },
  ember: { weapons: [['ember_edge', 2, 1, 2], ['longreach', 1, 1, 1], ['vigil_blade', 1, 1, 1], ['sunburst_glaive', 0.7, 1, 1], ['censer_mace', 0.8, 1, 1]], armour: [['ember_plate', 0.7, 1, 1], ['ember_helm', 0.7, 1, 1], ['plate_greaves', 0.6, 1, 1], ['white_hood', 2, 1, 2], ['inquisitor_coat', 0.8, 1, 1]], travel: [['ember_robe', 2, 1, 2]], general: [['spice', 2, 2, 6], ['wheat', 1, 6, 16], ['pepper_meat', 2, 3, 8], ['pyre_incense', 1, 2, 6]], bar: [['pepper_meat', 1, 2, 5]] },
  karuk: { weapons: [['crescent', 2, 1, 2], ['hornbreaker', 1, 1, 1], ['gravemaker', 0.5, 1, 1], ['bone_maul', 1, 1, 1], ['horn_sabre', 2, 1, 2], ['warhost_blade', 1, 1, 1], ['mesa_splitter', 0.4, 1, 1], ['arena_maul', 1, 1, 1]], armour: [['bone_vest', 1, 1, 2], ['horncap', 2, 1, 2], ['horn_helm', 0.8, 1, 1], ['war_boots', 1, 1, 2], ['hide_trousers', 1, 1, 2]], bar: [['red_beer', 3, 3, 8], ['blood_sausage', 2, 2, 6]], general: [['blood_sausage', 1, 2, 6], ['mesa_moss', 2, 3, 8]], travel: [['hide_trousers', 1, 1, 2], ['war_boots', 0.6, 1, 1]] },
  hollows: { robotics: [['standard_arm', 1, 1, 2], ['standard_leg', 1, 1, 2], ['warden_arm', 0.5, 1, 1], ['warden_leg', 0.5, 1, 1]], general: [['repair_kit', 2, 2, 5], ['solder_tin', 1, 2, 4]] },
  delvers: { tech: [['relic_core', 0.4, 1, 1], ['old_codex', 1, 1, 2], ['colossus_ivory', 1, 1, 3]], general: [['gasmask', 0.5, 1, 1], ['goggles', 1, 1, 2], ['waxed_hood', 1, 1, 2], ['digger_shirt', 1, 1, 2], ['delver_pack', 0.6, 1, 1], ['pry_bar', 0.6, 1, 1], ['salvage_axe', 0.4, 1, 1], ['colossus_ivory', 1, 1, 3]] },
  scorched: { weapons: [['heater', 1, 1, 1], ['hand_xbow', 1, 1, 1], ['leafcutter', 2, 1, 2]], general: [['dreamleaf', 2, 4, 10], ['dreamsmoke', 1, 2, 5], ['swamp_boots', 1, 1, 2], ['riceweed', 2, 6, 16], ['fish_chowder', 2, 2, 6], ['mire_dye', 1, 2, 6]], bar: [['fish_chowder', 2, 2, 6]], drugs: [['soft_boots', 1, 1, 2], ['smuggler_pack', 0.6, 1, 1], ['mire_dye', 1, 2, 5]] },
  drifters: { general: [['cactus', 1, 4, 10]], weapons: [['watch_xbow', 0.8, 1, 1]] },
  thrum: { general: [['waxbread', 2, 3, 8], ['resin_salve', 1, 2, 5], ['hive_mead', 1, 2, 5], ['stinger_spear', 0.3, 1, 1], ['mandible_blade', 0.3, 1, 1]], travel: [['chitin_greaves', 0.8, 1, 1], ['chitin_scale', 0.8, 1, 1]] },
  chainhouse: { slaves: [['hunter_gambeson', 1, 1, 1]], general: [['sack_shirt', 1, 2, 4]] },
  unchained: { general: [['taskmaster_sabre', 0.4, 1, 1], ['sack_shirt', 1, 1, 3]] },
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

/** The market of the town a shop stands in, if it has one. */
export function marketOf(sh: Shop): Market | undefined {
  const site = sh.site ? S.T.sites.find((s) => s.id === sh.site) : undefined;
  return site?.settlement ? MARKETS[site.settlement] : undefined;
}
const inList = (list: string[], d: ItemDef) => list.includes(d.id) || list.includes(d.cat);
/** 'cheap', 'dear' or '' for an item at this shop's town. */
export function marketFor(sh: Shop, d: ItemDef): 'cheap' | 'dear' | '' {
  const m = marketOf(sh);
  if (!m) return '';
  return inList(m.cheap, d) ? 'cheap' : inList(m.dear, d) ? 'dear' : '';
}

/** Price the shop charges for an item (per unit). */
export function buyPrice(sh: Shop, it: Item | { id: string; q: number; cond?: number }) {
  const d: ItemDef = ITEM[it.id];
  const mk = marketFor(sh, d);
  const local = mk === 'cheap' ? CHEAP_BUY : mk === 'dear' ? DEAR_BUY : 1;
  return Math.max(1, Math.round(itemValue(d, it.q) * (1.15 + sh.markup) * relMod(sh.faction) * local * worn(it.cond)));
}

/** What the shop pays for an item (per unit). */
export function sellPrice(sh: Shop, it: Item) {
  const d = ITEM[it.id];
  let k = 0.5 / relMod(sh.faction);
  if (sh.kind === 'tech' && (d.cat === 'artifact' || d.research)) k = 0.8;
  if (sh.kind === 'robotics' && (d.cat === 'robotics' || d.id === 'machine_parts' || d.id === 'elec_parts')) k = 0.7;
  const mk = marketFor(sh, d);
  if (mk === 'cheap') k *= CHEAP_SELL; else if (mk === 'dear') k *= DEAR_SELL;
  if (it.stolen === sh.faction) k *= 0.3;
  if (d.illegal?.includes(sh.faction)) return 0;
  return Math.max(1, Math.round(itemValue(d, it.q) * k * worn(it.cond)));
}

/** A dented limb is worth less: a wrecked one is scrap and parts. */
const worn = (cond?: number) => (cond === undefined ? 1 : 0.25 + 0.75 * cond);

export function tickShops() {
  const day = S.clock.day;
  for (const sh of S.W.shops.values()) if (day >= sh.restockDay) restock(sh);
}
