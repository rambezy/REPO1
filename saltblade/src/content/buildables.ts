// Everything the player can build, what it costs, what it makes, and the
// research that unlocks it.
import type { ObjKind } from '../sim/objects';

export type BuildCat = 'Housing' | 'Furniture' | 'Storage' | 'Production' | 'Crafting' | 'Farming' | 'Power' | 'Defence' | 'Science' | 'Misc';

export interface Recipe {
  key: string;
  name: string;
  in: Record<string, number>;
  out: Record<string, number>;
  time: number; // work seconds at skill ~20
  skill: string;
  graded?: boolean; // output quality depends on skill
  research?: string;
}

export interface Buildable {
  key: string;
  name: string;
  cat: BuildCat;
  kind: ObjKind; // what it becomes when finished
  def: string; // mesh / building / furniture def
  w: number;
  d: number;
  cost: Record<string, number>;
  work: number; // construction work seconds
  research?: string;
  desc: string;
  power?: number; // + produces, - consumes
  store?: { w: number; h: number; accepts?: string[] };
  recipes?: string[]; // production/crafting recipes available
  job?: 'operate' | 'craft' | 'research' | 'farm' | 'turret' | 'cook' | 'watch';
  crop?: string;
  wall?: { len: number; h: number; style: string };
  building?: string; // a BUILDINGS key for enclosed buildings
  style?: string;
}

export const RECIPES: Record<string, Recipe> = {};
const R = (r: Recipe) => { RECIPES[r.key] = r; };
// refining
R({ key: 'iron_plates', name: 'Iron Plates', in: { iron_ore: 2 }, out: { iron_plates: 1 }, time: 40, skill: 'labouring' });
R({ key: 'building_mats', name: 'Building Materials', in: { stone: 2 }, out: { building_mats: 1 }, time: 35, skill: 'labouring' });
R({ key: 'fabric', name: 'Fabric', in: { hemp: 3 }, out: { fabric: 1 }, time: 30, skill: 'armoursmith' });
R({ key: 'leather', name: 'Leather', in: { hide: 1 }, out: { leather: 1 }, time: 40, skill: 'armoursmith' });
R({ key: 'flour', name: 'Flour', in: { wheat: 2 }, out: { flour: 1 }, time: 20, skill: 'cooking' });
R({ key: 'steel_bars', name: 'Steel Bars', in: { iron_plates: 2, fuel: 1 }, out: { steel_bars: 1 }, time: 60, skill: 'weaponsmith', research: 'steel' });
R({ key: 'fuel', name: 'Fuel', in: { hemp: 2 }, out: { fuel: 1 }, time: 30, skill: 'engineering', research: 'fuel' });
R({ key: 'elec_parts', name: 'Electrical Components', in: { copper_ore: 3, iron_plates: 1 }, out: { elec_parts: 1 }, time: 70, skill: 'science', research: 'electronics' });
R({ key: 'machine_parts', name: 'Machine Parts', in: { iron_plates: 2, steel_bars: 1 }, out: { machine_parts: 1 }, time: 80, skill: 'engineering', research: 'machining' });
// kitchen and brewing
R({ key: 'dustbread', name: 'Dustbread', in: { flour: 2 }, out: { dustbread: 3 }, time: 25, skill: 'cooking' });
R({ key: 'dried_meat', name: 'Dried Meat', in: { raw_meat: 2 }, out: { dried_meat: 2 }, time: 25, skill: 'cooking' });
R({ key: 'stew', name: 'Wasteland Stew', in: { raw_meat: 1, wheat: 2 }, out: { stew: 2 }, time: 30, skill: 'cooking', research: 'cooking2' });
R({ key: 'porridge', name: 'Riceweed Porridge', in: { riceweed: 3 }, out: { porridge: 2 }, time: 20, skill: 'cooking' });
R({ key: 'travel_ration', name: 'Travel Ration', in: { dried_meat: 1, dustbread: 1, cactus: 1 }, out: { travel_ration: 2 }, time: 30, skill: 'cooking', research: 'cooking2' });
R({ key: 'grog', name: 'Grog', in: { riceweed: 3 }, out: { grog: 1 }, time: 40, skill: 'cooking' });
R({ key: 'cactus_rum', name: 'Cactus Rum', in: { cactus: 3 }, out: { cactus_rum: 1 }, time: 45, skill: 'cooking' });
// medicine
R({ key: 'bandages', name: 'Bandages', in: { fabric: 1 }, out: { bandages: 2 }, time: 20, skill: 'medic' });
R({ key: 'first_aid', name: 'First Aid Kit', in: { fabric: 2, hemp: 1 }, out: { first_aid: 1 }, time: 40, skill: 'medic', research: 'medicine' });
R({ key: 'splint_kit', name: 'Splint Kit', in: { fabric: 1, iron_plates: 1 }, out: { splint_kit: 1 }, time: 35, skill: 'medic', research: 'medicine' });
R({ key: 'surgical_kit', name: 'Surgical Kit', in: { fabric: 2, steel_bars: 1, elec_parts: 1 }, out: { surgical_kit: 1 }, time: 90, skill: 'medic', research: 'surgery' });
// weapons
R({ key: 'w_cleaver', name: 'Cleaver', in: { iron_plates: 3, fabric: 1 }, out: { cleaver: 1 }, time: 90, skill: 'weaponsmith', graded: true });
R({ key: 'w_drift', name: 'Drift Blade', in: { iron_plates: 4, fabric: 1 }, out: { drift_blade: 1 }, time: 110, skill: 'weaponsmith', graded: true });
R({ key: 'w_spear', name: 'Spear', in: { iron_plates: 2, fabric: 1 }, out: { spear: 1 }, time: 80, skill: 'weaponsmith', graded: true });
R({ key: 'w_club', name: 'Iron Club', in: { iron_plates: 4 }, out: { iron_club: 1 }, time: 80, skill: 'weaponsmith', graded: true });
R({ key: 'w_sabre', name: 'Dune Sabre', in: { iron_plates: 3, steel_bars: 1, fabric: 1 }, out: { dune_sabre: 1 }, time: 130, skill: 'weaponsmith', graded: true, research: 'weapons2' });
R({ key: 'w_hatchet', name: 'Iron Hatchet', in: { iron_plates: 3, steel_bars: 1 }, out: { iron_hatchet: 1 }, time: 120, skill: 'weaponsmith', graded: true, research: 'weapons2' });
R({ key: 'w_glaive', name: 'Glaive', in: { iron_plates: 2, steel_bars: 2, fabric: 1 }, out: { glaive: 1 }, time: 140, skill: 'weaponsmith', graded: true, research: 'weapons2' });
R({ key: 'w_slab', name: 'Slab', in: { iron_plates: 6, steel_bars: 2 }, out: { slab: 1 }, time: 160, skill: 'weaponsmith', graded: true, research: 'weapons2' });
R({ key: 'w_longsliver', name: 'Longsliver', in: { steel_bars: 4, fabric: 1 }, out: { longsliver: 1 }, time: 180, skill: 'weaponsmith', graded: true, research: 'weapons3' });
R({ key: 'w_heater', name: 'Heater Blade', in: { steel_bars: 4, iron_plates: 2 }, out: { heater: 1 }, time: 180, skill: 'weaponsmith', graded: true, research: 'weapons3' });
R({ key: 'w_mace', name: 'Knuckle Mace', in: { steel_bars: 3, iron_plates: 3 }, out: { knuckle_mace: 1 }, time: 170, skill: 'weaponsmith', graded: true, research: 'weapons3' });
R({ key: 'w_gravemaker', name: 'Gravemaker', in: { steel_bars: 6, iron_plates: 4 }, out: { gravemaker: 1 }, time: 220, skill: 'weaponsmith', graded: true, research: 'weapons3' });
R({ key: 'w_longreach', name: 'Longreach', in: { steel_bars: 4, fabric: 2 }, out: { longreach: 1 }, time: 200, skill: 'weaponsmith', graded: true, research: 'weapons3' });
R({ key: 'w_moonfang', name: 'Moonfang', in: { steel_bars: 6, machine_parts: 1, fabric: 1 }, out: { moonfang: 1 }, time: 300, skill: 'weaponsmith', graded: true, research: 'weapons4' });
R({ key: 'w_sunderer', name: 'Sunderer', in: { steel_bars: 8, machine_parts: 2 }, out: { sunderer: 1 }, time: 320, skill: 'weaponsmith', graded: true, research: 'weapons4' });
R({ key: 'w_foundry', name: 'Foundry Hammer', in: { steel_bars: 6, iron_plates: 6 }, out: { foundry_hammer: 1 }, time: 260, skill: 'weaponsmith', graded: true, research: 'weapons4' });
// crossbows
R({ key: 'x_bolts', name: 'Crossbow Bolts', in: { iron_plates: 1 }, out: { bolts: 20 }, time: 40, skill: 'bowsmith' });
R({ key: 'x_hand', name: 'Hand Crossbow', in: { iron_plates: 3, fabric: 2 }, out: { hand_xbow: 1 }, time: 140, skill: 'bowsmith', graded: true });
R({ key: 'x_thrower', name: 'Bolt Thrower', in: { iron_plates: 4, steel_bars: 1, fabric: 2 }, out: { bolt_thrower: 1 }, time: 180, skill: 'bowsmith', graded: true, research: 'crossbows2' });
R({ key: 'x_hunter', name: "Hunter's Crossbow", in: { steel_bars: 3, machine_parts: 1, fabric: 2 }, out: { hunter_bow: 1 }, time: 220, skill: 'bowsmith', graded: true, research: 'crossbows3' });
R({ key: 'x_siege', name: 'Siege Crossbow', in: { steel_bars: 5, machine_parts: 2 }, out: { siege_xbow: 1 }, time: 260, skill: 'bowsmith', graded: true, research: 'crossbows3' });
// armour and clothing
R({ key: 'a_shirt', name: 'Drifter Shirt', in: { fabric: 2 }, out: { drifter_shirt: 1 }, time: 50, skill: 'armoursmith' });
R({ key: 'a_pants', name: 'Cargo Trousers', in: { fabric: 2 }, out: { cargo_pants: 1 }, time: 50, skill: 'armoursmith' });
R({ key: 'a_hood', name: 'Hood', in: { fabric: 1 }, out: { hood: 1 }, time: 30, skill: 'armoursmith' });
R({ key: 'a_straw', name: 'Straw Hat', in: { hemp: 3 }, out: { straw_hat: 1 }, time: 30, skill: 'armoursmith' });
R({ key: 'a_boots', name: 'Leather Boots', in: { leather: 2 }, out: { leather_boots: 1 }, time: 60, skill: 'armoursmith' });
R({ key: 'a_jerkin', name: 'Leather Jerkin', in: { leather: 4, fabric: 1 }, out: { leather_jerkin: 1 }, time: 100, skill: 'armoursmith', graded: true });
R({ key: 'a_leggings', name: 'Leather Leggings', in: { leather: 3 }, out: { leather_leggings: 1 }, time: 90, skill: 'armoursmith', graded: true });
R({ key: 'a_padded', name: 'Padded Vest', in: { fabric: 5 }, out: { padded_vest: 1 }, time: 90, skill: 'armoursmith', graded: true });
R({ key: 'a_cap', name: 'Leather Cap', in: { leather: 2 }, out: { skullcap: 1 }, time: 60, skill: 'armoursmith', graded: true });
R({ key: 'a_dustcoat', name: 'Dust Coat', in: { fabric: 4, leather: 1 }, out: { dust_coat: 1 }, time: 100, skill: 'armoursmith', graded: true });
R({ key: 'a_scrap', name: 'Scrap Plate', in: { iron_plates: 6, leather: 2 }, out: { scrap_plate: 1 }, time: 140, skill: 'armoursmith', graded: true, research: 'armour2' });
R({ key: 'a_chain', name: 'Chainmail Shirt', in: { iron_plates: 8, fabric: 2 }, out: { chain_shirt: 1 }, time: 200, skill: 'armoursmith', graded: true, research: 'armour2' });
R({ key: 'a_chainlegs', name: 'Chain Leggings', in: { iron_plates: 6, fabric: 1 }, out: { chain_leggings: 1 }, time: 170, skill: 'armoursmith', graded: true, research: 'armour2' });
R({ key: 'a_bucket', name: 'Bucket Helm', in: { iron_plates: 4 }, out: { bucket_helm: 1 }, time: 120, skill: 'armoursmith', graded: true, research: 'armour2' });
R({ key: 'a_plate', name: 'Plate Harness', in: { steel_bars: 6, leather: 3, fabric: 2 }, out: { plate_harness: 1 }, time: 300, skill: 'armoursmith', graded: true, research: 'armour3' });
R({ key: 'a_greaves', name: 'Plate Greaves', in: { steel_bars: 4, leather: 2 }, out: { plate_greaves: 1 }, time: 240, skill: 'armoursmith', graded: true, research: 'armour3' });
R({ key: 'a_ironboots', name: 'Iron Boots', in: { iron_plates: 3, leather: 1 }, out: { iron_boots: 1 }, time: 120, skill: 'armoursmith', graded: true, research: 'armour3' });
R({ key: 'a_carapace', name: 'Hive Carapace', in: { chitin: 6, leather: 2 }, out: { hive_carapace: 1 }, time: 220, skill: 'armoursmith', graded: true, research: 'armour3' });
R({ key: 'a_shell', name: 'Hollow Shell', in: { steel_bars: 6, machine_parts: 3, elec_parts: 1 }, out: { hollow_shell: 1 }, time: 360, skill: 'armoursmith', graded: true, research: 'armour4' });
R({ key: 'a_gasmask', name: 'Gas Mask', in: { leather: 2, elec_parts: 1, fabric: 1 }, out: { gasmask: 1 }, time: 150, skill: 'armoursmith', research: 'armour3' });
// packs
R({ key: 'p_small', name: 'Small Pack', in: { fabric: 3 }, out: { small_pack: 1 }, time: 60, skill: 'armoursmith' });
R({ key: 'p_travel', name: 'Travel Pack', in: { fabric: 4, leather: 2 }, out: { travel_pack: 1 }, time: 100, skill: 'armoursmith', research: 'packs' });
R({ key: 'p_large', name: 'Large Pack', in: { fabric: 6, leather: 3, iron_plates: 1 }, out: { large_pack: 1 }, time: 140, skill: 'armoursmith', research: 'packs' });
R({ key: 'p_medic', name: 'Medic Pack', in: { fabric: 5, leather: 2 }, out: { medic_pack: 1 }, time: 120, skill: 'armoursmith', research: 'packs' });
// robotics
R({ key: 'r_repair', name: 'Repair Kit', in: { iron_plates: 2, machine_parts: 1 }, out: { repair_kit: 1 }, time: 90, skill: 'robotics', research: 'robotics1' });
R({ key: 'r_scraparm', name: 'Scrap Arm', in: { iron_plates: 4, machine_parts: 1 }, out: { scrap_arm: 1 }, time: 160, skill: 'robotics', research: 'robotics1' });
R({ key: 'r_scrapleg', name: 'Scrap Leg', in: { iron_plates: 4, machine_parts: 1 }, out: { scrap_leg: 1 }, time: 160, skill: 'robotics', research: 'robotics1' });
R({ key: 'r_arm', name: 'Standard Arm', in: { steel_bars: 3, machine_parts: 2, elec_parts: 1, servo_motor: 1 }, out: { standard_arm: 1 }, time: 260, skill: 'robotics', research: 'robotics2' });
R({ key: 'r_leg', name: 'Standard Leg', in: { steel_bars: 3, machine_parts: 2, elec_parts: 1, servo_motor: 1 }, out: { standard_leg: 1 }, time: 260, skill: 'robotics', research: 'robotics2' });
R({ key: 'r_warm', name: 'Warden Arm', in: { steel_bars: 5, machine_parts: 4, elec_parts: 3, servo_motor: 2 }, out: { warden_arm: 1 }, time: 400, skill: 'robotics', research: 'robotics3' });
R({ key: 'r_wleg', name: 'Warden Leg', in: { steel_bars: 5, machine_parts: 4, elec_parts: 3, servo_motor: 2 }, out: { warden_leg: 1 }, time: 400, skill: 'robotics', research: 'robotics3' });
// the Old Machines' own limbs, rebuilt for people from what salvage turns up
R({ key: 'r_sarm', name: 'Sentinel Arm', in: { iron_plates: 6, servo_motor: 2, energy_cell: 4, elec_parts: 2 }, out: { sentinel_arm: 1 }, time: 380, skill: 'robotics', research: 'grafting' });
R({ key: 'r_darm', name: 'Drone Manipulator', in: { steel_bars: 2, servo_motor: 2, maker_optic: 1, elec_parts: 2 }, out: { drone_arm: 1 }, time: 360, skill: 'robotics', research: 'grafting' });
R({ key: 'r_strider', name: 'Strider Leg', in: { steel_bars: 5, machine_parts: 2, servo_motor: 3, power_core: 1 }, out: { strider_leg: 1 }, time: 440, skill: 'robotics', research: 'grafting' });

const S = (w: number, h: number, accepts?: string[]) => ({ w, h, accepts });

export const BUILDABLES: Buildable[] = [
  // housing
  { key: 'shack', name: 'Shack', cat: 'Housing', kind: 'building', def: 'shack', building: 'shack', style: 'shanty', w: 7, d: 6, cost: { building_mats: 8 }, work: 180, desc: 'A small shelter of scrap and timber. Buildings let you put beds and benches under a roof.' },
  { key: 'house', name: 'Stone House', cat: 'Housing', kind: 'building', def: 'house', building: 'house', style: 'stone', w: 9, d: 8, cost: { building_mats: 16 }, work: 300, research: 'stone_building', desc: 'A solid stone house.' },
  { key: 'big_house', name: 'Great House', cat: 'Housing', kind: 'building', def: 'house_big', building: 'house_big', style: 'stone', w: 12, d: 9, cost: { building_mats: 26, iron_plates: 4 }, work: 480, research: 'stone_building', desc: 'A large house, with room for four beds and more besides.' },
  { key: 'hall', name: 'Workshop Hall', cat: 'Housing', kind: 'building', def: 'warehouse', building: 'warehouse', style: 'shanty', w: 14, d: 10, cost: { building_mats: 24, iron_plates: 6 }, work: 520, research: 'stone_building', desc: 'A big open building for machines and benches, with crates along the walls for storage.' },
  // furniture
  { key: 'bedroll', name: 'Bedroll', cat: 'Furniture', kind: 'bed', def: 'bedroll', w: 1, d: 2, cost: { fabric: 2 }, work: 30, desc: 'A place to sleep. Resting in a bed heals much faster than on the ground, and a proper bed faster still.' },
  { key: 'bed', name: 'Bed', cat: 'Furniture', kind: 'bed', def: 'bed', w: 1.1, d: 2.1, cost: { building_mats: 2, fabric: 2 }, work: 60, research: 'beds', desc: 'A proper bed. Heals faster than a bedroll.' },
  { key: 'bunk', name: 'Bunk Bed', cat: 'Furniture', kind: 'bed', def: 'bunk', w: 1.1, d: 2.1, cost: { building_mats: 3, fabric: 3 }, work: 90, research: 'beds', desc: 'Two sleepers, one footprint.' },
  { key: 'cage', name: 'Prisoner Cage', cat: 'Furniture', kind: 'cage', def: 'cage', w: 2, d: 2, cost: { iron_plates: 6 }, work: 120, desc: 'Keep a prisoner. Carry someone unconscious here and lock them in.' },
  { key: 'campfire', name: 'Campfire', cat: 'Furniture', kind: 'campfire', def: 'firepit', w: 2, d: 2, cost: { building_mats: 1 }, work: 20, recipes: ['dried_meat'], job: 'cook', desc: 'Cook raw meat into dried meat.' },
  { key: 'stove', name: 'Stove', cat: 'Production', kind: 'stove', def: 'stove', w: 1.4, d: 1, cost: { iron_plates: 4, building_mats: 2 }, work: 120, research: 'cooking', recipes: ['dustbread', 'dried_meat', 'porridge', 'stew', 'travel_ration'], job: 'cook', desc: 'Bakes bread and cooks proper meals.' },
  { key: 'table', name: 'Table', cat: 'Furniture', kind: 'table', def: 'table', w: 1.2, d: 0.9, cost: { building_mats: 1 }, work: 20, desc: 'Somewhere to eat: meals at your base go a third further with a table to eat them at.' },
  { key: 'stool', name: 'Stool', cat: 'Furniture', kind: 'stool', def: 'stool', w: 0.5, d: 0.5, cost: { building_mats: 1 }, work: 10, desc: 'Somewhere to sit. Resting on a seat heals a little faster than standing about.' },
  { key: 'lamp', name: 'Lamp', cat: 'Furniture', kind: 'lamp', def: 'lamp', w: 0.4, d: 0.4, cost: { iron_plates: 1 }, work: 20, desc: 'Lights the ground around it at night, so anyone sneaking about there is seen as if by day.' },
  { key: 'dummy', name: 'Training Dummy', cat: 'Furniture', kind: 'bench', def: 'dummy', w: 1, d: 1, cost: { building_mats: 3, fabric: 2 }, work: 60, job: 'operate', desc: 'Hit it with a weapon to train melee skills, up to level 20.' },
  // storage
  { key: 'chest', name: 'Storage Chest', cat: 'Storage', kind: 'storage', def: 'chest', w: 1, d: 0.7, cost: { building_mats: 2 }, work: 30, store: S(8, 6), desc: 'General storage.' },
  { key: 'ore_box', name: 'Ore Storage', cat: 'Storage', kind: 'storage', def: 'crate', w: 1.2, d: 1.2, cost: { building_mats: 3 }, work: 40, store: S(10, 10, ['iron_ore', 'copper_ore', 'stone']), desc: 'Miners haul ore here automatically.' },
  { key: 'food_box', name: 'Food Storage', cat: 'Storage', kind: 'storage', def: 'barrel', w: 1, d: 1, cost: { building_mats: 2 }, work: 30, store: S(8, 8, ['food', 'drink', 'raw_meat', 'wheat', 'riceweed', 'cactus', 'flour']), desc: 'Your people eat from here when hungry.' },
  { key: 'res_box', name: 'Resource Storage', cat: 'Storage', kind: 'storage', def: 'crate', w: 1.2, d: 1.2, cost: { building_mats: 3 }, work: 40, store: S(10, 10, ['resource', 'trade']), desc: 'Plates, fabric, leather and other materials.' },
  { key: 'gear_box', name: 'Equipment Rack', cat: 'Storage', kind: 'storage', def: 'weapon_rack', w: 1.8, d: 0.4, cost: { building_mats: 2, iron_plates: 2 }, work: 40, store: S(10, 8, ['weapon', 'ranged', 'body', 'shirt', 'head', 'legs', 'feet', 'back', 'ammo']), desc: 'Weapons, armour and clothes.' },
  // production
  { key: 'refinery', name: 'Iron Refinery', cat: 'Production', kind: 'machine', def: 'refinery', w: 3, d: 3, cost: { building_mats: 6, iron_plates: 4 }, work: 300, power: -15, research: 'refining', recipes: ['iron_plates'], job: 'operate', desc: 'Smelts iron ore into plates. Needs power and an operator.' },
  { key: 'stonecutter', name: 'Stone Processor', cat: 'Production', kind: 'machine', def: 'stonecutter', w: 3, d: 2.5, cost: { building_mats: 4, iron_plates: 2 }, work: 240, power: -10, recipes: ['building_mats'], job: 'operate', desc: 'Cuts stone into building materials.' },
  { key: 'loom', name: 'Loom', cat: 'Production', kind: 'machine', def: 'loom', w: 2, d: 1.5, cost: { building_mats: 4 }, work: 160, recipes: ['fabric'], job: 'operate', desc: 'Weaves hemp into fabric.' },
  { key: 'tannery', name: 'Tanning Rack', cat: 'Production', kind: 'machine', def: 'tannery', w: 2, d: 1.2, cost: { building_mats: 3 }, work: 120, recipes: ['leather'], job: 'operate', desc: 'Turns hides into leather.' },
  { key: 'mill', name: 'Grain Mill', cat: 'Production', kind: 'machine', def: 'mill', w: 2.2, d: 2.2, cost: { building_mats: 5 }, work: 180, research: 'milling', recipes: ['flour'], job: 'operate', desc: 'Grinds wheat into flour.' },
  { key: 'brewery', name: 'Still', cat: 'Production', kind: 'machine', def: 'still', w: 2, d: 2, cost: { building_mats: 4, iron_plates: 3 }, work: 200, research: 'brewing', recipes: ['grog', 'cactus_rum'], job: 'operate', desc: 'Brews grog or cactus rum (click it to choose), both of which sell well.' },
  { key: 'furnace', name: 'Steel Furnace', cat: 'Production', kind: 'machine', def: 'furnace', w: 3, d: 3, cost: { building_mats: 10, iron_plates: 8 }, work: 420, power: -25, research: 'steel', recipes: ['steel_bars'], job: 'operate', desc: 'Makes steel from iron plates and fuel.' },
  { key: 'fuelpress', name: 'Fuel Press', cat: 'Production', kind: 'machine', def: 'press', w: 2, d: 2, cost: { building_mats: 4, iron_plates: 4 }, work: 220, research: 'fuel', recipes: ['fuel'], job: 'operate', desc: 'Presses hemp into fuel.' },
  { key: 'electronics', name: 'Electronics Bench', cat: 'Production', kind: 'machine', def: 'electronics', w: 2, d: 1, cost: { iron_plates: 6, elec_parts: 1 }, work: 320, power: -20, research: 'electronics', recipes: ['elec_parts'], job: 'operate', desc: 'Makes electrical components from copper.' },
  { key: 'machineshop', name: 'Machine Shop', cat: 'Production', kind: 'machine', def: 'machineshop', w: 3, d: 2, cost: { iron_plates: 8, steel_bars: 4 }, work: 400, power: -25, research: 'machining', recipes: ['machine_parts'], job: 'operate', desc: 'Turns steel into machine parts.' },
  // crafting
  { key: 'weapon_bench', name: 'Weapon Smithy', cat: 'Crafting', kind: 'bench', def: 'anvil_bench', w: 2.4, d: 1.4, cost: { building_mats: 6, iron_plates: 6 }, work: 300, research: 'weapons1', recipes: Object.keys(RECIPES).filter((k) => k.startsWith('w_')), job: 'craft', desc: 'Forge weapons. Better smiths make better blades.' },
  { key: 'armour_bench', name: 'Armour Bench', cat: 'Crafting', kind: 'bench', def: 'workbench', w: 2, d: 1, cost: { building_mats: 4, iron_plates: 2 }, work: 240, research: 'armour1', recipes: Object.keys(RECIPES).filter((k) => k.startsWith('a_') || k.startsWith('p_')), job: 'craft', desc: 'Make clothing, armour and packs.' },
  { key: 'xbow_bench', name: 'Crossbow Bench', cat: 'Crafting', kind: 'bench', def: 'workbench', w: 2, d: 1, cost: { building_mats: 4, iron_plates: 4 }, work: 260, research: 'crossbows1', recipes: Object.keys(RECIPES).filter((k) => k.startsWith('x_')), job: 'craft', desc: 'Make crossbows and bolts.' },
  { key: 'med_bench', name: 'Medical Bench', cat: 'Crafting', kind: 'bench', def: 'workbench', w: 2, d: 1, cost: { building_mats: 3, fabric: 3 }, work: 180, recipes: ['bandages', 'first_aid', 'splint_kit', 'surgical_kit'], job: 'craft', desc: 'Make bandages and medical kits.' },
  { key: 'robo_bench', name: 'Robotics Bench', cat: 'Crafting', kind: 'bench', def: 'research', w: 2, d: 1, cost: { iron_plates: 8, machine_parts: 2, elec_parts: 2 }, work: 400, power: -15, research: 'robotics1', recipes: Object.keys(RECIPES).filter((k) => k.startsWith('r_')), job: 'craft', desc: 'Build prosthetic limbs and repair kits.' },
  // science
  { key: 'research_bench', name: 'Research Bench', cat: 'Science', kind: 'research', def: 'research', w: 2, d: 1, cost: { building_mats: 4, iron_plates: 2 }, work: 200, job: 'research', desc: 'Study technology. Higher tiers need Maker relics.' },
  // farming
  { key: 'farm_hemp', name: 'Hemp Field', cat: 'Farming', kind: 'farm', def: 'hemp', w: 12, d: 8, cost: { building_mats: 2 }, work: 120, crop: 'hemp', job: 'farm', desc: 'Grows hemp for fabric and fuel.' },
  { key: 'farm_wheat', name: 'Wheat Field', cat: 'Farming', kind: 'farm', def: 'wheat', w: 12, d: 8, cost: { building_mats: 2 }, work: 120, research: 'farming', crop: 'wheat', job: 'farm', desc: 'Grows wheat. Needs fertile ground.' },
  { key: 'farm_cactus', name: 'Cactus Field', cat: 'Farming', kind: 'farm', def: 'cactus', w: 12, d: 8, cost: { building_mats: 2 }, work: 120, crop: 'cactus', job: 'farm', desc: 'Cactus grows even in poor, dry ground.' },
  { key: 'farm_riceweed', name: 'Riceweed Paddy', cat: 'Farming', kind: 'farm', def: 'riceweed', w: 12, d: 8, cost: { building_mats: 2 }, work: 120, research: 'farming', crop: 'riceweed', job: 'farm', desc: 'Riceweed loves wet ground.' },
  { key: 'well', name: 'Well', cat: 'Farming', kind: 'well', def: 'well', w: 2.8, d: 2.8, cost: { building_mats: 6 }, work: 200, desc: 'Water makes nearby fields grow faster.' },
  // power
  { key: 'windmill', name: 'Wind Generator', cat: 'Power', kind: 'generator', def: 'windmill', w: 2.5, d: 2.5, cost: { building_mats: 4, iron_plates: 6 }, work: 300, power: 20, research: 'power', desc: 'Makes power from the wind: more in windy country (the Salt Barrens, the Hollow Flats, the Karuk Highlands, the Bone Sea and the Grey Shore).' },
  { key: 'generator', name: 'Fuel Generator', cat: 'Power', kind: 'generator', def: 'generator', w: 2, d: 2, cost: { iron_plates: 8, machine_parts: 1 }, work: 320, power: 45, research: 'fuel', desc: 'Burns fuel for steady power while machines draw on it, filling its tank from your storage nearby.' },
  // defence
  { key: 'wall_wood', name: 'Palisade Wall', cat: 'Defence', kind: 'wall', def: 'palisade', w: 0.8, d: 6, cost: { building_mats: 3 }, work: 90, wall: { len: 6, h: 4, style: 'palisade' }, desc: 'A six-metre stretch of sharpened logs.' },
  { key: 'wall_stone', name: 'Stone Wall', cat: 'Defence', kind: 'wall', def: 'stone', w: 1.4, d: 6, cost: { building_mats: 8 }, work: 220, research: 'stone_building', wall: { len: 6, h: 6, style: 'stone' }, desc: 'A six-metre stretch of stone wall.' },
  { key: 'gate_wood', name: 'Wooden Gate', cat: 'Defence', kind: 'gate', def: 'palisade', w: 1.2, d: 6, cost: { building_mats: 5 }, work: 150, desc: 'A gate you can open and close.' },
  { key: 'gate_stone', name: 'Iron Gate', cat: 'Defence', kind: 'gate', def: 'stone', w: 1.6, d: 6, cost: { building_mats: 10, iron_plates: 6 }, work: 300, research: 'stone_building', desc: 'A heavy gate.' },
  { key: 'turret', name: 'Harpoon Turret', cat: 'Defence', kind: 'turret', def: 'turret', w: 2, d: 2, cost: { iron_plates: 8, building_mats: 4 }, work: 300, research: 'turrets', job: 'turret', desc: 'A manned harpoon turret. Punches through armour at range; it needs a clear line of fire.' },
  { key: 'tower', name: 'Watchtower', cat: 'Defence', kind: 'tower', def: 'palisade', w: 4, d: 4, cost: { building_mats: 10 }, work: 260, job: 'watch', desc: 'A lookout keeping watch up top sees twice as far, raises the alarm when trouble comes, and can shoot a crossbow from it.' },
  // misc
  { key: 'banner', name: 'Banner', cat: 'Misc', kind: 'banner', def: 'banner', w: 0.5, d: 0.5, cost: { fabric: 2 }, work: 20, desc: 'Your colours, flying: your people fight a little better within 25 m of them.' },
  { key: 'shackle_post', name: 'Shackle Post', cat: 'Misc', kind: 'shackle_post', def: 'post', w: 0.5, d: 0.5, cost: { iron_plates: 2 }, work: 40, desc: 'Carry someone who is down here and chain them to it. They stay put until unchained, or until they pick the lock.' },
];
export const BUILDABLE: Record<string, Buildable> = Object.fromEntries(BUILDABLES.map((b) => [b.key, b]));

export interface Tech { key: string; name: string; tier: number; time: number; cost?: Record<string, number>; needs?: string[]; desc: string; }

export const TECHS: Tech[] = [
  { key: 'beds', name: 'Beds', tier: 1, time: 120, desc: 'Proper beds that heal faster.' },
  { key: 'cooking', name: 'Cooking', tier: 1, time: 150, desc: 'The stove: bread, meals and porridge.' },
  { key: 'farming', name: 'Farming', tier: 1, time: 180, desc: 'Wheat and riceweed fields.' },
  { key: 'refining', name: 'Iron Refining', tier: 1, time: 200, desc: 'Refine iron ore into plates.' },
  { key: 'stone_building', name: 'Stonework', tier: 1, time: 220, desc: 'Stone houses, walls and gates.' },
  { key: 'power', name: 'Wind Power', tier: 1, time: 220, desc: 'Wind generators for machines.' },
  { key: 'weapons1', name: 'Weapon Smithing I', tier: 1, time: 240, desc: 'A smithy for simple weapons.' },
  { key: 'armour1', name: 'Armour Smithing I', tier: 1, time: 240, desc: 'An armour bench for leather and cloth.' },
  { key: 'crossbows1', name: 'Crossbows I', tier: 1, time: 240, desc: 'Hand crossbows and bolts.' },
  { key: 'medicine', name: 'Medicine', tier: 1, time: 200, desc: 'First aid kits and splints.' },
  { key: 'milling', name: 'Milling', tier: 1, time: 150, needs: ['farming'], desc: 'Grind wheat into flour.' },
  { key: 'brewing', name: 'Brewing', tier: 2, time: 260, cost: { maker_tablet: 1 }, needs: ['farming'], desc: 'Stills for grog and rum.' },
  { key: 'cooking2', name: 'Fine Cooking', tier: 2, time: 260, cost: { maker_tablet: 1 }, needs: ['cooking'], desc: 'Stews and travel rations.' },
  { key: 'fuel', name: 'Fuel', tier: 2, time: 300, cost: { maker_tablet: 1 }, needs: ['power'], desc: 'Fuel presses and generators.' },
  { key: 'steel', name: 'Steel', tier: 2, time: 320, cost: { maker_tablet: 1 }, needs: ['refining'], desc: 'The steel furnace.' },
  { key: 'weapons2', name: 'Weapon Smithing II', tier: 2, time: 360, cost: { maker_tablet: 1 }, needs: ['weapons1', 'steel'], desc: 'Sabres, hatchets, glaives and slabs.' },
  { key: 'armour2', name: 'Armour Smithing II', tier: 2, time: 360, cost: { maker_tablet: 1 }, needs: ['armour1'], desc: 'Chainmail, scrap plate and bucket helms.' },
  { key: 'crossbows2', name: 'Crossbows II', tier: 2, time: 360, cost: { maker_tablet: 1 }, needs: ['crossbows1'], desc: 'The bolt thrower.' },
  { key: 'packs', name: 'Packs', tier: 2, time: 240, cost: { maker_tablet: 1 }, needs: ['armour1'], desc: 'Travel, large and medic packs.' },
  { key: 'turrets', name: 'Harpoon Turrets', tier: 2, time: 400, cost: { maker_tablet: 2 }, needs: ['crossbows1', 'stone_building'], desc: 'Manned turrets for your walls.' },
  { key: 'electronics', name: 'Electronics', tier: 3, time: 500, cost: { old_codex: 1 }, needs: ['steel', 'power'], desc: 'Make electrical components.' },
  { key: 'machining', name: 'Machining', tier: 3, time: 500, cost: { old_codex: 1 }, needs: ['steel'], desc: 'Make machine parts.' },
  { key: 'weapons3', name: 'Weapon Smithing III', tier: 3, time: 600, cost: { old_codex: 1 }, needs: ['weapons2'], desc: 'Longslivers, heaters, maces and gravemakers.' },
  { key: 'armour3', name: 'Armour Smithing III', tier: 3, time: 600, cost: { old_codex: 1 }, needs: ['armour2'], desc: 'Plate, greaves, iron boots, carapace and gas masks.' },
  { key: 'crossbows3', name: 'Crossbows III', tier: 3, time: 600, cost: { old_codex: 1 }, needs: ['crossbows2', 'machining'], desc: 'Hunter\'s and siege crossbows.' },
  { key: 'robotics1', name: 'Robotics I', tier: 3, time: 600, cost: { old_codex: 1 }, needs: ['machining'], desc: 'Repair kits and scrap limbs.' },
  { key: 'surgery', name: 'Surgery', tier: 3, time: 500, cost: { old_codex: 1 }, needs: ['medicine', 'electronics'], desc: 'Surgical kits.' },
  { key: 'robotics2', name: 'Robotics II', tier: 4, time: 800, cost: { relic_core: 1 }, needs: ['robotics1', 'electronics'], desc: 'Standard prosthetic limbs.' },
  { key: 'weapons4', name: 'Weapon Smithing IV', tier: 4, time: 900, cost: { relic_core: 1 }, needs: ['weapons3', 'machining'], desc: 'Moonfangs, sunderers and foundry hammers.' },
  { key: 'armour4', name: 'Armour Smithing IV', tier: 4, time: 900, cost: { relic_core: 1 }, needs: ['armour3', 'electronics'], desc: 'Hollow shells.' },
  { key: 'robotics3', name: 'Robotics III', tier: 4, time: 1000, cost: { relic_core: 2 }, needs: ['robotics2'], desc: 'Warden-grade limbs.' },
  { key: 'grafting', name: 'Machine Grafting', tier: 4, time: 900, cost: { maker_optic: 1 }, needs: ['robotics2'], desc: 'Study a machine\'s eye to learn how the Makers jointed their limbs: Sentinel arms, drone manipulators and strider legs, built from salvaged servos, optics and cores.' },
];
export const TECH: Record<string, Tech> = Object.fromEntries(TECHS.map((t) => [t.key, t]));
