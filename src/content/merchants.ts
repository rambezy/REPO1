// Merchants: what they sell, what they buy, and how much coin they carry.

import { ItemCat } from './items';

export interface MerchantDef {
  id: string;
  name: string;
  sells: [string, number][]; // item, stock quantity per restock
  buys: ItemCat[] | 'all';
  money: number;
  fence?: boolean;
  markup?: number; // multiplier on buy prices
  settlement?: string;
  greeting?: string;
}

export const MERCHANTS: Record<string, MerchantDef> = {};
const M = (m: MerchantDef) => { MERCHANTS[m.id] = m; };

M({ id: 'bakery', name: "Greta's Bakery", sells: [['bread', 12], ['roll', 10], ['honey_cake', 4]], buys: ['food'], money: 60, settlement: 'linden' });
M({ id: 'inn', name: 'The Crooked Linden', sells: [['stew', 8], ['beer', 20], ['wine', 6], ['mead', 4], ['sausage', 6], ['cheese', 5], ['bread', 6], ['water', 6]], buys: ['food'], money: 120, settlement: 'linden' });
M({ id: 'butcher', name: 'The Butcher', sells: [['sausage', 8], ['cooked_meat', 4], ['raw_meat', 6], ['bone', 5]], buys: ['food', 'material'], money: 90, settlement: 'linden' });
M({ id: 'tanner', name: "Zbyněk's Tannery", sells: [['leather_jerkin', 1], ['hood', 2], ['leather_gloves', 2], ['work_gloves', 2], ['lockpick', 6], ['hunting_knife', 1]], buys: ['material', 'misc', 'weapon', 'armor', 'food', 'herb', 'tool'], money: 220, fence: true, settlement: 'linden' });
M({ id: 'apothecary', name: "Aurelius' Apothecary", sells: [['yarrow_salve', 3], ['comfrey_poultice', 4], ['bandage', 10], ['valerian_draught', 2], ['wormwood_tonic', 3], ['owls_eye', 1], ['wind_tonic', 2], ['feverfew', 3], ['sage', 4], ['mint', 5], ['herbal', 1], ['alchemy_book', 1], ['wine', 4]], buys: ['herb', 'potion'], money: 200, markup: 1.1, settlement: 'linden' });
M({ id: 'smith', name: "Kovář's Smithy", sells: [['hunting_knife', 2], ['hatchet', 2], ['arming_sword', 1], ['falchion', 1], ['mace', 1], ['whetstone', 5], ['repair_kit', 2], ['iron_ingot', 6], ['steel_ingot', 2], ['charcoal', 10]], buys: ['weapon', 'material'], money: 400, settlement: 'linden' });
M({ id: 'armorer', name: 'The Armourer', sells: [['padded_coif', 1], ['mail_coif', 1], ['kettle_hat', 1], ['gambeson', 1], ['mail_hauberk', 1], ['padded_chausses', 1], ['mail_chausses', 1], ['mail_mittens', 1], ['repair_kit', 3]], buys: ['armor'], money: 500, settlement: 'linden' });
M({ id: 'tailor', name: 'The Tailor', sells: [['linen_shirt', 3], ['russet_vest', 1], ['fine_doublet', 1], ['hose', 3], ['fine_hose', 1], ['linen_cap', 2], ['leather_gloves', 1], ['linen_cloth', 4]], buys: ['armor', 'material'], money: 250, settlement: 'linden' });
M({ id: 'priory', name: "Brother Tobiah's Stores", sells: [['honey', 4], ['mead', 5], ['honey_cake', 6], ['wax', 4], ['primer', 1], ['saints', 1], ['chronicle', 1], ['reynard', 1], ['st_christopher', 2]], buys: ['book', 'herb', 'food'], money: 150, settlement: 'priory' });
M({ id: 'silverdale_store', name: 'Silverdale Stores', sells: [['torch', 8], ['lantern', 1], ['shovel', 2], ['bread', 6], ['beer', 10], ['sausage', 4], ['bandage', 4], ['smoked_fish', 4]], buys: 'all', money: 180, settlement: 'silverdale' });
M({ id: 'wenda', name: "Wenda's Hut", sells: [['yarrow', 4], ['comfrey', 3], ['valerian', 3], ['feverfew', 2], ['willow_bark', 4], ['belladonna', 1], ['yarrow_salve', 2], ['comfrey_poultice', 2], ['bandage', 4]], buys: ['herb', 'potion'], money: 90, settlement: 'forest' });
M({ id: 'hunter', name: "Hunter's Lodge", sells: [['hunting_bow', 1], ['arrow', 60], ['hunting_knife', 1], ['hood', 1], ['almanac', 1], ['cooked_meat', 3]], buys: ['material', 'food'], money: 200, settlement: 'forest' });
M({ id: 'peddler', name: 'Travelling Peddler', sells: [['bread', 4], ['bandage', 4], ['torch', 3], ['lockpick', 3], ['st_christopher', 1], ['dice_set', 1], ['weighted_die', 1], ['wine', 2], ['apple', 6]], buys: 'all', money: 140 });
M({ id: 'refugees', name: 'Camp Barter', sells: [['bread', 2], ['apple', 4], ['water', 4], ['bandage', 2], ['linen_shirt', 1]], buys: ['food', 'herb', 'potion', 'material'], money: 30, settlement: 'refugees' });
M({ id: 'quartermaster', name: 'Company Quartermaster', sells: [['sausage', 6], ['wine', 6], ['arrow', 40], ['bandage', 6], ['gambeson', 1], ['kettle_hat', 1], ['harrow_brigandine', 0]], buys: 'all', money: 300, settlement: 'harrow' });
M({ id: 'mother_bread', name: "Marta's Bread", sells: [['marta_bread', 6], ['roll', 6], ['honey_cake', 2]], buys: ['food', 'herb'], money: 40, settlement: 'linden' });
