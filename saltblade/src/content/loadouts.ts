// What each kind of person carries: weapons, clothes, armour, packs, purse.
// Entries are item ids; arrays are random choices; "" means nothing.

export interface Loadout {
  weapon?: string[];
  grade?: [number, number];
  ranged?: string[];
  body?: string[];
  shirt?: string[];
  head?: string[];
  legs?: string[];
  feet?: string[];
  back?: string[];
  items?: [string, number, number][]; // id, min, max
  money?: [number, number];
  level?: [number, number];
}

const PEASANT = { shirt: ['drifter_shirt', 'rag_shirt', 'farmer_tunic'], legs: ['cargo_pants', 'rag_pants'], feet: ['sandals', 'foot_wraps', 'leather_boots'] };

export const LOADOUTS: Record<string, Loadout> = {
  // free towns
  drifters_guard: { weapon: ['scrap_sabre', 'iron_hatchet', 'dune_sabre', 'spear', 'iron_club'], grade: [1, 3], ranged: ['', '', 'watch_xbow'], body: ['leather_jerkin', 'padded_vest', 'scrap_plate', ''], shirt: ['drifter_shirt'], head: ['skullcap', 'bucket_helm', 'straw_hat', ''], legs: ['cargo_pants', 'leather_leggings'], feet: ['leather_boots'], items: [['bandages', 0, 2], ['dustbread', 0, 2], ['bolts', 10, 25]], money: [40, 200], level: [16, 32] },
  drifters_resident: { ...PEASANT, head: ['straw_hat', '', '', 'bandana'], weapon: ['', '', 'knife', 'cleaver', 'shiv'], grade: [0, 2], items: [['dustbread', 0, 2], ['dried_meat', 0, 1]], money: [10, 120], level: [3, 12] },
  drifters_wanderer: { ...PEASANT, body: ['dust_coat', 'patch_coat', '', ''], head: ['straw_hat', 'hood', 'kasa', ''], weapon: ['drift_blade', 'scrap_sabre', 'cleaver', 'spear', 'springblade', 'pipe_spear'], grade: [0, 2], back: ['small_pack', 'travel_pack', ''], items: [['dried_meat', 1, 3], ['bandages', 0, 2]], money: [20, 300], level: [6, 20] },
  shopkeeper: { shirt: ['drifter_shirt', 'noble_shirt', 'farmer_tunic'], body: ['dust_coat', 'long_coat', ''], legs: ['cargo_pants'], feet: ['leather_boots', 'sandals'], weapon: ['knife', ''], grade: [2, 3], money: [800, 3000], level: [5, 15] },
  barkeep: { shirt: ['drifter_shirt', 'farmer_tunic'], legs: ['cargo_pants'], feet: ['leather_boots'], weapon: ['iron_club'], grade: [2, 3], money: [600, 2000], level: [12, 24] },
  recruit: { ...PEASANT, head: ['', 'bandana', 'straw_hat'], weapon: ['', 'knife', 'scrap_sabre', 'cleaver', 'shiv', 'springblade'], grade: [0, 1], money: [0, 60], level: [2, 10] },
  merc: { weapon: ['concord_sabre', 'iron_hatchet', 'glaive', 'drift_blade', 'slab', 'horn_sabre', 'warhost_blade'], grade: [2, 4], body: ['chain_shirt', 'leather_jerkin', 'scrap_plate', 'studded_jerkin'], shirt: ['drifter_shirt'], head: ['bucket_helm', 'skullcap', 'blade_helm'], legs: ['leather_leggings', 'chain_leggings'], feet: ['leather_boots', 'iron_boots'], items: [['first_aid', 1, 2]], money: [50, 200], level: [28, 45] },
  caravan: { shirt: ['drifter_shirt'], body: ['dust_coat'], head: ['straw_hat', 'turban'], legs: ['cargo_pants'], feet: ['leather_boots'], back: ['trader_chest', 'large_pack'], weapon: ['knife', 'drift_blade'], grade: [2, 3], money: [400, 2000], level: [8, 18] },
  // Concord
  concord_guard: { weapon: ['concord_sabre', 'drift_blade', 'longsliver', 'glaive'], grade: [2, 4], body: ['blade_cuirass'], shirt: ['concord_tunic', 'concord_tunic', 'drifter_shirt'], head: ['blade_helm', 'kasa', 'iron_kasa'], legs: ['blade_greaves'], feet: ['leather_boots'], items: [['bandages', 0, 2]], money: [60, 250], level: [28, 46] },
  concord_resident: { ...PEASANT, head: ['kasa', 'straw_hat', ''], items: [['dustbread', 0, 2], ['vale_cheese', 0, 1]], money: [20, 200], level: [3, 12] },
  concord_noble: { shirt: ['noble_shirt'], body: ['noble_robe'], head: ['', 'crown_none'], legs: ['cargo_pants'], feet: ['leather_boots'], weapon: ['ringsabre'], grade: [4, 5], items: [['dustwine', 0, 2], ['vale_cheese', 0, 1]], money: [2000, 8000], level: [12, 30] },
  chainhouse: { weapon: ['iron_club', 'knuckle_mace', 'concord_sabre', 'taskmaster_sabre', 'taskmaster_sabre'], grade: [1, 3], ranged: ['', '', 'bolt_thrower'], body: ['padded_vest', 'leather_jerkin', 'hunter_gambeson', 'hunter_gambeson'], shirt: ['dark_shirt', 'drifter_shirt'], head: ['hood', 'kasa', ''], legs: ['leather_leggings', 'cargo_pants'], feet: ['leather_boots'], items: [['shackles', 1, 2], ['bolts', 20, 30]], money: [80, 400], level: [22, 38] },
  slave: { legs: ['rag_pants', 'loincloth'], shirt: ['', 'rag_shirt', 'sack_shirt'], money: [0, 0], level: [2, 10] },
  // Covenant
  ember_guard: { weapon: ['ember_edge', 'longreach', 'concord_sabre', 'vigil_blade', 'sunburst_glaive'], grade: [2, 4], body: ['ember_plate'], shirt: ['drifter_shirt'], head: ['ember_helm'], legs: ['plate_greaves', 'chain_leggings'], feet: ['iron_boots', 'leather_boots'], items: [['bandages', 0, 2]], money: [40, 200], level: [30, 48] },
  ember_resident: { body: ['ember_robe'], head: ['white_hood', '', 'straw_hat'], legs: ['cargo_pants'], feet: ['sandals', 'leather_boots'], items: [['pepper_meat', 0, 1]], money: [10, 150], level: [3, 12] },
  ember_priest: { body: ['ember_robe', 'ember_robe', 'inquisitor_coat'], head: ['white_hood'], legs: ['cargo_pants'], feet: ['sandals'], weapon: ['iron_club', 'censer_mace'], grade: [2, 3], items: [['pyre_incense', 0, 3]], money: [100, 600], level: [10, 24] },
  // Karuk
  karuk_guard: { weapon: ['crescent', 'hornbreaker', 'slab', 'bone_maul', 'glaive', 'horn_sabre', 'warhost_blade', 'mesa_splitter', 'arena_maul'], grade: [2, 4], body: ['chain_shirt', 'leather_jerkin', 'bone_vest'], head: ['horncap', 'horn_helm', ''], legs: ['leather_leggings', 'chain_leggings'], feet: ['leather_boots', 'war_boots'], items: [['blood_sausage', 0, 2], ['mesa_moss', 0, 2]], money: [30, 150], level: [32, 52] },
  karuk_resident: { shirt: ['', 'drifter_shirt'], body: ['', 'leather_jerkin'], legs: ['leather_leggings', 'cargo_pants', 'hide_trousers'], feet: ['leather_boots', 'foot_wraps'], weapon: ['iron_club', '', 'cleaver'], grade: [1, 3], items: [['blood_sausage', 0, 1]], money: [10, 120], level: [12, 26] },
  // Thrum
  thrum_guard: { weapon: ['glaive', 'iron_hatchet', 'bone_chopper', '', 'stinger_spear', 'mandible_blade'], grade: [2, 3], body: ['hive_carapace', 'chitin_scale'], legs: ['', 'chitin_greaves'], money: [0, 30], level: [26, 42] },
  thrum_resident: { shirt: ['thrum_wrap'], back: ['', '', 'hive_pack'], items: [['waxbread', 0, 2]], money: [0, 40], level: [4, 14] },
  blackcomb: { weapon: ['', 'iron_hatchet', 'spear', 'mandible_blade'], grade: [0, 2], body: ['', 'hive_carapace', 'chitin_scale'], level: [20, 36] },
  // Delvers and Hollows
  delvers_guard: { weapon: ['drift_blade', 'heater', 'longreach', 'salvage_axe'], grade: [2, 4], ranged: ['hunter_bow', 'bolt_thrower'], body: ['delver_harness', 'chain_shirt'], shirt: ['drifter_shirt', 'digger_shirt'], head: ['goggles', 'gasmask', 'skullcap', 'waxed_hood'], legs: ['leather_leggings'], feet: ['leather_boots'], items: [['bolts', 20, 40], ['first_aid', 1, 2]], money: [80, 300], level: [26, 42] },
  delvers_resident: { shirt: ['drifter_shirt', 'digger_shirt'], body: ['delver_harness', 'dust_coat'], head: ['goggles', 'hood', 'waxed_hood'], legs: ['cargo_pants'], feet: ['leather_boots'], back: ['large_pack', 'small_pack', 'delver_pack'], weapon: ['knife', 'drift_blade', 'pry_bar'], grade: [1, 3], money: [60, 400], level: [8, 20] },
  hollows_guard: { weapon: ['foundry_hammer', 'warden_pike', 'knuckle_mace'], grade: [3, 5], body: ['', 'hollow_shell'], legs: ['plate_greaves', ''], items: [['solder_tin', 0, 1]], money: [0, 100], level: [34, 50] },
  hollows_resident: { weapon: ['', 'iron_club'], grade: [2, 3], items: [['solder_tin', 0, 1]], money: [0, 200], level: [8, 22] },
  // outlaws
  reavers: { weapon: ['scrap_sabre', 'iron_club', 'cleaver', 'spear', 'iron_hatchet', 'slab', 'springblade', 'girder'], grade: [0, 2], ranged: ['', '', '', 'scrap_xbow'], body: ['leather_jerkin', 'scrap_plate', 'bone_vest', '', 'studded_jerkin', 'studded_jerkin'], shirt: ['rag_shirt', 'drifter_shirt', ''], head: ['bandana', 'skullcap', '', 'hood'], legs: ['rag_pants', 'cargo_pants', 'leather_leggings', 'scrap_greaves'], feet: ['foot_wraps', 'leather_boots'], items: [['dried_meat', 0, 2], ['bandages', 0, 1], ['bolts', 5, 15]], money: [0, 150], level: [12, 28] },
  reavers_boss: { weapon: ['crescent', 'gravemaker', 'heater'], grade: [2, 4], body: ['scrap_plate', 'chain_shirt'], shirt: ['drifter_shirt'], head: ['bucket_helm', 'mask'], legs: ['leather_leggings', 'scrap_greaves'], feet: ['leather_boots'], items: [['first_aid', 0, 1]], money: [200, 900], level: [34, 50] },
  starvelings: { weapon: ['cleaver', 'iron_club', 'knife', 'spear', '', 'shiv', 'pipe_spear'], grade: [0, 1], shirt: ['rag_shirt', '', 'sack_shirt'], legs: ['rag_pants'], feet: ['foot_wraps', ''], money: [0, 15], level: [4, 14] },
  scorched: { weapon: ['dune_sabre', 'drift_blade', 'heater', 'hand_xbow_none', 'leafcutter', 'leafcutter'], grade: [1, 3], body: ['long_coat', 'leather_jerkin'], shirt: ['dark_shirt'], head: ['', 'bandana', 'hood'], legs: ['dark_pants', 'leather_leggings'], feet: ['swamp_boots', 'leather_boots', 'soft_boots'], back: ['', '', '', 'smuggler_pack'], items: [['dreamleaf', 0, 3], ['mire_dye', 0, 1]], money: [30, 300], level: [20, 36] },
  mawkin: { weapon: ['bone_maul', 'spear', 'cleaver', 'bone_chopper', 'jaw_club', 'gutting_hook', 'rib_knife'], grade: [0, 2], body: ['bone_vest', ''], legs: ['loincloth', 'rag_pants', 'hide_trousers'], head: ['skullcap', '', 'bone_mask'], items: [['raw_meat', 0, 2]], money: [0, 20], level: [16, 34] },
  mistcrawlers: { level: [22, 40] },
  wardens: { weapon: ['warden_pike', 'warden_pike', 'foundry_hammer', 'foundry_hammer', 'sunderer', 'sunderer', 'warden_cleaver', 'starfall_hammer'], grade: [3, 5], level: [40, 60] },
  unchained: { weapon: ['dune_sabre', 'drift_blade', 'spear', 'taskmaster_sabre'], grade: [1, 3], body: ['leather_jerkin', 'padded_vest'], shirt: ['drifter_shirt', 'rag_shirt', 'sack_shirt'], head: ['bandana', ''], legs: ['cargo_pants'], feet: ['leather_boots', 'sandals'], money: [0, 60], level: [18, 32] },
  prisoner: { shirt: ['rag_shirt', 'sack_shirt'], legs: ['rag_pants'], money: [0, 0], level: [6, 24] },
};

/** Loadout key for a faction and role. */
export function loadoutFor(faction: string, role: string): string {
  const k = `${faction}_${role}`;
  if (LOADOUTS[k]) return k;
  if (role === 'guard' || role === 'patrol' || role === 'boss') {
    if (LOADOUTS[`${faction}_guard`]) return `${faction}_guard`;
  }
  if (role === 'shopkeeper' || role === 'trader') return 'shopkeeper';
  if (role === 'barkeep') return 'barkeep';
  if (role === 'recruit') return 'recruit';
  if (role === 'merc') return 'merc';
  if (role === 'caravan') return 'caravan';
  if (role === 'slave') return 'slave';
  if (role === 'prisoner') return 'prisoner';
  if (role === 'priest') return 'ember_priest';
  if (role === 'noble') return 'concord_noble';
  if (role === 'slaver') return 'chainhouse';
  if (role === 'wanderer') return 'drifters_wanderer';
  if (LOADOUTS[faction]) return faction;
  if (LOADOUTS[`${faction}_resident`]) return `${faction}_resident`;
  return 'drifters_resident';
}
