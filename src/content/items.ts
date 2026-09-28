// Item database. Prices are in groschen (g). Weights in pounds.

import { IconSpec } from '../gfx/icons';
import { WeaponStats } from '../world/actor';
import { CLOTH, P } from '../gfx/palette';

export type ItemCat = 'weapon' | 'armor' | 'food' | 'potion' | 'herb' | 'material' | 'book' | 'key' | 'quest' | 'misc' | 'tool' | 'ammo';
export type Slot = 'weapon' | 'head' | 'body' | 'legs' | 'hands' | 'torch' | 'bow';

export interface ItemDef {
  id: string;
  name: string;
  cat: ItemCat;
  desc: string;
  value: number;
  weight: number;
  icon: IconSpec;
  stack?: boolean;
  weapon?: Omit<WeaponStats, 'id'>;
  str?: number; // strength requirement
  slot?: Slot;
  armor?: { slash: number; stab: number; blunt: number; noise: number; charisma: number };
  disguise?: string; // faction this lets you pass as
  food?: number;
  heal?: number;
  stamina?: number;
  energy?: number;
  alcohol?: number;
  buff?: { id: string; minutes: number; power?: number };
  cures?: ('bleeding' | 'poison' | 'fever' | 'drunk')[];
  book?: string;
  quest?: boolean;
  noSell?: boolean;
  light?: number;
  ranged?: { dmg: number; draw: number; spread: number };
  cond?: boolean; // has condition (weapons/armour)
}

const W = (o: Partial<ItemDef> & Pick<ItemDef, 'id' | 'name' | 'desc' | 'value' | 'weight' | 'icon'> & { weapon: Omit<WeaponStats, 'id'> }): ItemDef => ({ cat: 'weapon', slot: 'weapon', cond: true, ...o });
const A = (o: Partial<ItemDef> & Pick<ItemDef, 'id' | 'name' | 'desc' | 'value' | 'weight' | 'icon' | 'slot' | 'armor'>): ItemDef => ({ cat: 'armor', cond: true, ...o });
const F = (o: Partial<ItemDef> & Pick<ItemDef, 'id' | 'name' | 'desc' | 'value' | 'weight' | 'icon'>): ItemDef => ({ cat: 'food', stack: true, ...o });
const H = (id: string, name: string, desc: string, value: number, c1: string, c2?: string): ItemDef => ({ id, name, cat: 'herb', desc, value, weight: 0.1, stack: true, icon: { shape: id === 'mushroom' ? 'mushroom' : 'herb', c1, c2 } });
const POT = (id: string, name: string, desc: string, value: number, c1: string, extra: Partial<ItemDef>): ItemDef => ({ id, name, cat: 'potion', desc, value, weight: 0.4, stack: true, icon: { shape: 'potion', c1 }, ...extra });

export const ITEMS: Record<string, ItemDef> = {};
function reg(...defs: ItemDef[]) { for (const d of defs) ITEMS[d.id] = d; }

// ---------- weapons ----------
reg(
  W({ id: 'stick', name: 'Sparring Stick', desc: 'A peeled ash branch. Good for bruises, not for killing.', value: 1, weight: 1, icon: { shape: 'stick' }, weapon: { kind: 'stick', slash: 0, stab: 0, blunt: 8, reach: 21, speed: 1.15, staminaCost: 9 } }),
  W({ id: 'smith_hammer', name: "Radek's Hammer", desc: "Father's forging hammer. The handle is worn smooth where his hand held it for twenty years.", value: 25, weight: 3, icon: { shape: 'hammer', c1: P.metal2 }, weapon: { kind: 'hammer', slash: 0, stab: 0, blunt: 17, reach: 16, speed: 0.95, staminaCost: 14 }, noSell: true }),
  W({ id: 'hunting_knife', name: 'Hunting Knife', desc: 'A short knife for skinning and, at need, for worse.', value: 18, weight: 0.8, icon: { shape: 'dagger' }, weapon: { kind: 'dagger', slash: 10, stab: 13, blunt: 0, reach: 13, speed: 1.35, staminaCost: 8 } }),
  W({ id: 'hatchet', name: 'Hatchet', desc: 'A woodsman\'s hatchet. It splits kindling and skulls alike.', value: 22, weight: 2.5, icon: { shape: 'axe' }, weapon: { kind: 'axe', slash: 17, stab: 0, blunt: 6, reach: 17, speed: 1.0, staminaCost: 13 } }),
  W({ id: 'woodaxe', name: "Woodcutter's Axe", desc: 'Long-hafted and heavy. Slow, but it bites deep.', value: 40, weight: 5, str: 5, icon: { shape: 'axe', c1: P.metal2 }, weapon: { kind: 'axe', slash: 25, stab: 0, blunt: 9, reach: 21, speed: 0.8, staminaCost: 18, twoHanded: true } }),
  W({ id: 'club', name: 'Cudgel', desc: 'A knotted club favoured by bandits and drunk millers.', value: 6, weight: 3, icon: { shape: 'mace', c1: P.wood2 }, weapon: { kind: 'mace', slash: 0, stab: 0, blunt: 20, reach: 18, speed: 0.95, staminaCost: 15 } }),
  W({ id: 'rusty_sword', name: 'Rusty Sword', desc: 'Pitted, notched and still sharp enough to matter.', value: 45, weight: 3, icon: { shape: 'sword', c1: '#8a7a6a' }, weapon: { kind: 'sword', slash: 18, stab: 12, blunt: 4, reach: 22, speed: 1.0, staminaCost: 13 } }),
  W({ id: 'arming_sword', name: 'Arming Sword', desc: 'A soldier\'s sword: straight, reliable, well balanced.', value: 190, weight: 3, str: 4, icon: { shape: 'sword' }, weapon: { kind: 'sword', slash: 26, stab: 21, blunt: 5, reach: 23, speed: 1.05, staminaCost: 13 } }),
  W({ id: 'falchion', name: 'Falchion', desc: 'A heavy single-edged blade that cleaves like a cleaver.', value: 160, weight: 3.5, str: 5, icon: { shape: 'sword', c1: P.metal2 }, weapon: { kind: 'sword', slash: 33, stab: 11, blunt: 7, reach: 22, speed: 0.95, staminaCost: 15 } }),
  W({ id: 'longsword', name: 'Longsword', desc: 'A hand-and-a-half sword of good Nuremberg steel.', value: 420, weight: 4, str: 7, icon: { shape: 'longsword' }, weapon: { kind: 'sword', slash: 34, stab: 29, blunt: 6, reach: 28, speed: 0.92, staminaCost: 17, twoHanded: true } }),
  W({ id: 'fathers_sword', name: "Father's Sword", desc: 'The blade Radek began and you finished. Near the hilt, in letters you can now read: "For my son, who will be better than me."', value: 900, weight: 3.2, icon: { shape: 'fathersword' }, weapon: { kind: 'sword', slash: 38, stab: 32, blunt: 8, reach: 25, speed: 1.1, staminaCost: 12 }, noSell: true }),
  W({ id: 'mace', name: 'Flanged Mace', desc: 'Iron flanges that dent helmets and the heads inside them.', value: 150, weight: 4, str: 6, icon: { shape: 'mace' }, weapon: { kind: 'mace', slash: 0, stab: 4, blunt: 31, reach: 19, speed: 0.9, staminaCost: 16 } }),
  W({ id: 'war_hammer', name: 'War Hammer', desc: 'A beak and a hammer on a long haft. Armour is no comfort against it.', value: 310, weight: 5, str: 8, icon: { shape: 'hammer' }, weapon: { kind: 'hammer', slash: 0, stab: 15, blunt: 37, reach: 22, speed: 0.8, staminaCost: 19, twoHanded: true } }),
  W({ id: 'spear', name: 'Boar Spear', desc: 'Long reach and a crossbar to stop a charging boar.', value: 70, weight: 4, icon: { shape: 'spear' }, weapon: { kind: 'spear', slash: 8, stab: 30, blunt: 4, reach: 33, speed: 0.9, staminaCost: 14, twoHanded: true } }),
  W({ id: 'black_sword', name: "Dieter's Blade", desc: 'A blackened longsword. You know exactly where it has been.', value: 480, weight: 4, str: 7, icon: { shape: 'longsword', c1: '#4a4a52' }, weapon: { kind: 'sword', slash: 36, stab: 30, blunt: 7, reach: 28, speed: 0.95, staminaCost: 16, twoHanded: true } }),
);
// bows
reg(
  { id: 'hunting_bow', name: 'Hunting Bow', cat: 'weapon', slot: 'bow', desc: 'A yew-backed hunting bow. Hold to draw, release to loose.', value: 60, weight: 1.5, icon: { shape: 'bow', c2: P.wood3 }, ranged: { dmg: 24, draw: 0.8, spread: 0.12 }, cond: true },
  { id: 'longbow', name: 'Longbow', cat: 'weapon', slot: 'bow', desc: 'Taller than a man. Needs a strong back and rewards it.', value: 180, weight: 2, str: 6, icon: { shape: 'bow', c2: P.wood2 }, ranged: { dmg: 34, draw: 1.0, spread: 0.1 }, cond: true },
  { id: 'arrow', name: 'Arrows', cat: 'ammo', desc: 'Goose-fletched arrows with iron heads.', value: 1, weight: 0.05, stack: true, icon: { shape: 'arrows' } },
);

// ---------- armour ----------
const arm = (slash: number, stab: number, blunt: number, noise = 0, charisma = 0) => ({ slash, stab, blunt, noise, charisma });
reg(
  A({ id: 'linen_cap', name: 'Linen Cap', slot: 'head', desc: 'Keeps the sun off and the hair tidy.', value: 3, weight: 0.2, icon: { shape: 'cap', c1: CLOTH.linen }, armor: arm(0, 0, 1, 0, 1) }),
  A({ id: 'hood', name: 'Hunter\'s Hood', slot: 'head', desc: 'A green hood. Good for keeping out of sight.', value: 14, weight: 0.4, icon: { shape: 'hood', c1: CLOTH.forest }, armor: arm(1, 1, 1, -1, -1) }),
  A({ id: 'padded_coif', name: 'Padded Coif', slot: 'head', desc: 'Quilted linen worn under a helm, or instead of one.', value: 22, weight: 0.8, icon: { shape: 'coif', c1: CLOTH.linenDark }, armor: arm(4, 3, 6, 0, -1) }),
  A({ id: 'mail_coif', name: 'Mail Coif', slot: 'head', desc: 'Riveted rings over head and neck.', value: 90, weight: 3, icon: { shape: 'coif' }, armor: arm(11, 6, 3, 2, 0) }),
  A({ id: 'kettle_hat', name: 'Kettle Hat', slot: 'head', desc: 'A wide-brimmed iron hat that sheds blows from above.', value: 120, weight: 3, icon: { shape: 'kettle' }, armor: arm(12, 9, 9, 1, 0) }),
  A({ id: 'bascinet', name: 'Bascinet', slot: 'head', desc: 'A knight\'s helm with a mail aventail.', value: 320, weight: 4, icon: { shape: 'bascinet' }, armor: arm(17, 14, 11, 2, 2) }),
  A({ id: 'black_sallet', name: 'Black Sallet', slot: 'head', desc: 'Dieter\'s helm. People look away when you wear it.', value: 380, weight: 4, icon: { shape: 'bascinet', c1: '#3a3a42' }, armor: arm(18, 16, 12, 1, -4) }),
  A({ id: 'linen_shirt', name: 'Linen Shirt', slot: 'body', desc: 'Undyed linen, mended at both elbows.', value: 4, weight: 0.5, icon: { shape: 'tunic', c1: CLOTH.linen }, armor: arm(0, 0, 1) }),
  A({ id: 'russet_vest', name: 'Russet Jerkin', slot: 'body', desc: 'A sleeveless jerkin your mother dyed with madder root.', value: 12, weight: 1, icon: { shape: 'tunic', c1: CLOTH.russet }, armor: arm(2, 1, 2, 0, 1) }),
  A({ id: 'fine_doublet', name: 'Fine Doublet', slot: 'body', desc: 'Blue wool with brass buttons. People listen to a man in a doublet like this.', value: 140, weight: 1.2, icon: { shape: 'tunic', c1: CLOTH.woad, c2: P.gold2 }, armor: arm(1, 1, 2, 0, 5) }),
  A({ id: 'smith_apron', name: 'Leather Apron', slot: 'body', desc: 'Scorched and stiff. It smells of the forge.', value: 10, weight: 2, icon: { shape: 'tunic', c1: P.wood2 }, armor: arm(3, 1, 3, 0, 0) }),
  A({ id: 'gambeson', name: 'Gambeson', slot: 'body', desc: 'Layers of quilted linen. Warm, heavy and surprisingly hard to cut.', value: 85, weight: 4, icon: { shape: 'gambeson', c1: CLOTH.olive }, armor: arm(9, 7, 11, 0, 0) }),
  A({ id: 'leather_jerkin', name: 'Leather Jerkin', slot: 'body', desc: 'Boiled leather, laced at the front.', value: 60, weight: 3, icon: { shape: 'tunic', c1: CLOTH.darkbrown }, armor: arm(6, 5, 5, 0, 1) }),
  A({ id: 'mail_hauberk', name: 'Mail Hauberk', slot: 'body', desc: 'Thirty thousand rings, each one riveted by some patient smith.', value: 350, weight: 9, icon: { shape: 'mail' }, armor: arm(19, 11, 5, 3, 1) }),
  A({ id: 'linden_tabard', name: 'Linden Tabard over Mail', slot: 'body', desc: 'Green and gold, the colours of Linden Hill, over good mail.', value: 420, weight: 9.5, icon: { shape: 'body', c1: CLOTH.green, c2: CLOTH.ochre }, armor: arm(20, 12, 7, 3, 3), disguise: 'guard' }),
  A({ id: 'brigandine', name: 'Brigandine', slot: 'body', desc: 'Steel plates riveted inside a cloth coat.', value: 520, weight: 10, icon: { shape: 'body', c1: CLOTH.crimson, c2: P.metal3 }, armor: arm(23, 17, 11, 2, 2) }),
  A({ id: 'harrow_brigandine', name: 'Black Brigandine', slot: 'body', desc: 'Black cloth over plates: the livery of Harrow\'s Company.', value: 480, weight: 10, icon: { shape: 'body', c1: CLOTH.black, c2: CLOTH.red }, armor: arm(21, 15, 10, 2, -2), disguise: 'harrow' }),
  A({ id: 'plate_cuirass', name: 'Plate Cuirass', slot: 'body', desc: 'A breastplate from a Milanese workshop, polished like a mirror.', value: 900, weight: 12, icon: { shape: 'plate' }, armor: arm(29, 23, 15, 4, 3) }),
  A({ id: 'monk_robe', name: 'Friar\'s Habit', slot: 'body', desc: 'Undyed wool and a rope belt. No one questions a friar.', value: 20, weight: 1.5, icon: { shape: 'robe', c1: CLOTH.brown }, armor: arm(1, 1, 2, 0, 2), disguise: 'clergy' }),
  A({ id: 'servant_clothes', name: 'Camp Servant\'s Smock', slot: 'body', desc: 'A grubby smock of the kind worn by the boys who haul water in a war camp.', value: 5, weight: 0.8, icon: { shape: 'tunic', c1: CLOTH.undyed }, armor: arm(0, 0, 1, 0, -2), disguise: 'servant' }),
  A({ id: 'hose', name: 'Woollen Hose', slot: 'legs', desc: 'Brown hose, patched at the knee.', value: 4, weight: 0.5, icon: { shape: 'legs', c1: CLOTH.brown }, armor: arm(0, 0, 1) }),
  A({ id: 'fine_hose', name: 'Parti-coloured Hose', slot: 'legs', desc: 'One leg red, one leg green. Townsmen think it very fine.', value: 45, weight: 0.5, icon: { shape: 'legs', c1: CLOTH.crimson }, armor: arm(0, 0, 1, 0, 3) }),
  A({ id: 'padded_chausses', name: 'Padded Chausses', slot: 'legs', desc: 'Quilted leg defences.', value: 40, weight: 2, icon: { shape: 'legs', c1: CLOTH.olive }, armor: arm(5, 4, 6) }),
  A({ id: 'mail_chausses', name: 'Mail Chausses', slot: 'legs', desc: 'Mail leggings laced to the belt.', value: 170, weight: 5, icon: { shape: 'legs', c1: P.metal2 }, armor: arm(12, 7, 3, 2, 0) }),
  A({ id: 'plate_greaves', name: 'Plate Legs', slot: 'legs', desc: 'Cuisses, knees and greaves of bright steel.', value: 380, weight: 6, icon: { shape: 'legs', c1: P.metal3, c2: P.metal4 }, armor: arm(17, 13, 9, 3, 1) }),
  A({ id: 'work_gloves', name: 'Work Gloves', slot: 'hands', desc: 'Leather gloves, burnt through at one fingertip.', value: 5, weight: 0.3, icon: { shape: 'gloves', c1: P.wood2 }, armor: arm(1, 1, 2) }),
  A({ id: 'leather_gloves', name: 'Riding Gloves', slot: 'hands', desc: 'Soft leather with a stiff cuff.', value: 25, weight: 0.4, icon: { shape: 'gloves', c1: P.wood3 }, armor: arm(3, 2, 3, 0, 1) }),
  A({ id: 'mail_mittens', name: 'Mail Mittens', slot: 'hands', desc: 'Mail over the backs of the hands.', value: 70, weight: 1, icon: { shape: 'gloves', c1: P.metal2 }, armor: arm(7, 4, 2, 1, 0) }),
  A({ id: 'gauntlets', name: 'Hourglass Gauntlets', slot: 'hands', desc: 'Plate gauntlets. Your fingers feel very far away.', value: 190, weight: 1.5, icon: { shape: 'gloves', c1: P.metal3 }, armor: arm(10, 8, 6, 1, 1) }),
);

// ---------- food & drink ----------
reg(
  F({ id: 'bread', name: 'Rye Bread', desc: 'A dense round loaf, dark and sour.', value: 2, weight: 0.8, icon: { shape: 'bread' }, food: 22 }),
  F({ id: 'marta_bread', name: "Mother's Bread", desc: 'Marta\'s loaf, with caraway and a cross cut in the crust. It tastes like home.', value: 4, weight: 0.8, icon: { shape: 'bread', c1: P.bread3 }, food: 30, heal: 12, buff: { id: 'warmth', minutes: 240 } }),
  F({ id: 'roll', name: 'Wheat Roll', desc: 'White bread for Sundays and feast days.', value: 2, weight: 0.3, icon: { shape: 'roll' }, food: 10 }),
  F({ id: 'apple', name: 'Apple', desc: 'Small and tart.', value: 1, weight: 0.2, icon: { shape: 'apple', c1: '#c8302a' }, food: 6 }),
  F({ id: 'pear', name: 'Pear', desc: 'Sweet and bruised.', value: 1, weight: 0.2, icon: { shape: 'apple', c1: '#b8b040' }, food: 7 }),
  F({ id: 'cheese', name: 'Sheep Cheese', desc: 'Salty and crumbly.', value: 4, weight: 0.5, icon: { shape: 'cheese' }, food: 15 }),
  F({ id: 'sausage', name: 'Smoked Sausage', desc: 'Garlic, pepper and a good deal of fat.', value: 5, weight: 0.4, icon: { shape: 'sausage' }, food: 20 }),
  F({ id: 'raw_meat', name: 'Raw Venison', desc: 'Fresh meat. Cook it at a fire before you eat it.', value: 6, weight: 1, icon: { shape: 'meat', c1: '#b85a4a' }, food: 8, buff: { id: 'queasy', minutes: 120 } }),
  F({ id: 'cooked_meat', name: 'Roast Venison', desc: 'Charred outside, pink within.', value: 10, weight: 0.8, icon: { shape: 'meat', c1: '#7a4a2a' }, food: 34, heal: 5 }),
  F({ id: 'stew', name: 'Bowl of Stew', desc: 'Turnips, barley and a suggestion of mutton.', value: 4, weight: 0.8, icon: { shape: 'bowl', c1: '#8a5a3a' }, food: 36, heal: 6 }),
  F({ id: 'honey_cake', name: 'Honey Cake', desc: 'Brother Tobiah\'s honey, baked into a sticky cake.', value: 5, weight: 0.3, icon: { shape: 'roll', c1: '#e8a830' }, food: 14, heal: 4, stamina: 20 }),
  F({ id: 'smoked_fish', name: 'Smoked Trout', desc: 'Caught in the Linden brook and smoked over alder.', value: 4, weight: 0.4, icon: { shape: 'fish' }, food: 16 }),
  F({ id: 'beer', name: 'Beer', desc: 'Brown and bitter.', value: 1, weight: 1, icon: { shape: 'mug' }, food: 5, alcohol: 18, stamina: 10 }),
  F({ id: 'wine', name: 'Wine', desc: 'Moravian red. Goes to the head.', value: 6, weight: 1, icon: { shape: 'bottle', c1: '#6a1a2a' }, food: 3, alcohol: 30 }),
  F({ id: 'mead', name: 'Mead', desc: 'Honey wine from the priory cellars.', value: 5, weight: 1, icon: { shape: 'bottle', c1: '#d8a030' }, food: 6, alcohol: 24, heal: 3 }),
  F({ id: 'water', name: 'Waterskin', desc: 'Clean well water. Clears the head.', value: 1, weight: 1, icon: { shape: 'waterskin' }, food: 1, cures: ['drunk'] }),
  { id: 'honey', name: 'Jar of Honey', cat: 'material', desc: 'Dark forest honey, thick as sin.', value: 8, weight: 0.6, stack: true, icon: { shape: 'honey' } },
);

// ---------- potions ----------
reg(
  POT('yarrow_salve', 'Yarrow Salve', 'Closes wounds and eases pain. Restores health over a short while.', 30, '#b8302a', { heal: 45, cures: ['bleeding'] }),
  POT('comfrey_poultice', 'Comfrey Poultice', 'Knits torn flesh. Stops bleeding at once.', 18, '#7a8a3a', { heal: 15, cures: ['bleeding'] }),
  POT('feverwort_remedy', 'Feverwort Remedy', 'Old Wenda\'s cure for wound-fever: feverfew, willow and angelica.', 60, '#e8e0a0', { cures: ['fever'], quest: true }),
  POT('valerian_draught', 'Valerian Draught', 'A bitter sleeping draught. You wake more rested.', 22, '#a07ab8', { energy: 30, buff: { id: 'rested', minutes: 480 } }),
  POT('owls_eye', "Owl's Eye", 'Moonwort tincture. The night seems less deep for a while.', 35, '#5a7ab8', { buff: { id: 'nightsight', minutes: 180 } }),
  POT('bulls_blood', "Bull's Blood", 'Nettle and St. John\'s wort in strong wine. Strength runs hot in the arms.', 40, '#8a1a1a', { buff: { id: 'strength', minutes: 120, power: 2 } }),
  POT('fox_tongue', 'Fox Tongue', 'Sage and mint in honeyed wine. Words come easily.', 38, '#6ab04a', { buff: { id: 'speech', minutes: 120, power: 2 } }),
  POT('wind_tonic', 'Wind Tonic', 'Chamomile and mint. Your lungs feel wide as a church.', 26, '#d8d060', { stamina: 100, buff: { id: 'wind', minutes: 90 } }),
  POT('wormwood_tonic', 'Wormwood Tonic', 'Bitter as a mother-in-law. Cures drunkenness and a sour stomach.', 16, '#8a9a70', { cures: ['drunk', 'poison'] }),
  POT('nightshade', 'Nightshade Poison', 'Belladonna, reduced to a black syrup. A few drops in a pot of stew would fell a man.', 45, '#2a1a3a', {}),
  POT('suspicious_brew', 'Suspicious Brew', 'Something went wrong. It smells of feet.', 1, '#6a5a3a', { heal: -5 }),
);

// ---------- herbs ----------
reg(
  H('yarrow', 'Yarrow', 'White flower heads. Staunches bleeding.', 2, '#efe8d4', '#d8ccb0'),
  H('chamomile', 'Chamomile', 'Smells of apples. Calms the belly.', 1, '#f6f2e4', '#f0c040'),
  H('nettle', 'Nettle', 'Stings the hand that picks it. Strengthens the blood.', 1, P.leaf4, P.leaf2),
  H('sage', 'Sage', 'Grey-green and fragrant. Sharpens the tongue.', 2, '#a8b89a', '#7e9474'),
  H('comfrey', 'Comfrey', 'Knitbone, the old women call it.', 2, '#8a70b8', '#6a5098'),
  H('valerian', 'Valerian', 'Pink blossoms, roots that smell of old socks.', 2, '#f0d0e0', '#d0a0c0'),
  H('feverfew', 'Feverfew', 'Little daisies that break a fever.', 3, '#f6f2e4', '#e8c030'),
  H('belladonna', 'Belladonna', 'Deadly nightshade. Beautiful, black-berried, lethal.', 5, '#3a2a4a', '#6a3a6a'),
  H('poppy', 'Poppy', 'Its milk dulls pain and brings dreams.', 3, '#d8302a', '#2a1a1a'),
  H('stjohnswort', "St. John's Wort", 'Picked on St. John\'s Eve, it keeps evil away.', 2, '#f0c020', '#c89010'),
  H('mint', 'Mint', 'Freshens the breath and the mind.', 1, '#6ab04a', '#4a8a3a'),
  H('thistle', 'Thistle', 'Prickly purple heads.', 1, '#b070c0', '#7a4a8a'),
  H('marigold', 'Marigold', 'Bright orange. Soothes the skin.', 2, '#f08a20', '#d06a10'),
  H('angelica', 'Angelica Root', 'Rare. Grows in damp shady groves. Wenda swears by it for fevers.', 12, '#e8e8c8', '#b8c890'),
  H('wormwood', 'Wormwood', 'Silvery and very bitter.', 2, '#b8c8b0', '#8a9a88'),
  H('moonwort', 'Moonwort', 'A pale fern that some say only shows itself by moonlight.', 10, '#c8d8f0', '#8aa8d8'),
  H('mushroom', 'Penny Bun', 'A fat brown mushroom. Good in stew.', 2, '#b85a3a', '#efe0c8'),
  H('cornflower', 'Cornflower', 'Blue as a Madonna\'s mantle.', 1, '#4a7ad8', '#2a5ab8'),
  H('willow_bark', 'Willow Bark', 'Chewed for aches since before the Romans.', 2, P.wood3, P.wood2),
);
ITEMS.willow_bark.icon = { shape: 'wood' };
ITEMS.mushroom.food = 5;
ITEMS.apple.cat = 'food';

// ---------- materials, tools, misc ----------
reg(
  { id: 'wolf_pelt', name: 'Wolf Pelt', cat: 'material', desc: 'Grey fur, thick with the smell of the forest.', value: 22, weight: 2, stack: true, icon: { shape: 'pelt', c1: '#6e6a66' } },
  { id: 'deer_hide', name: 'Deer Hide', cat: 'material', desc: 'A good hide. The tanner will want it.', value: 18, weight: 2.5, stack: true, icon: { shape: 'pelt', c1: '#8a5a34' } },
  { id: 'boar_hide', name: 'Boar Hide', cat: 'material', desc: 'Bristly and tough.', value: 20, weight: 3, stack: true, icon: { shape: 'pelt', c1: '#4a3a2e' } },
  { id: 'hare_pelt', name: 'Hare Pelt', cat: 'material', desc: 'Soft brown fur.', value: 5, weight: 0.4, stack: true, icon: { shape: 'pelt', c1: '#8a7250' } },
  { id: 'antlers', name: 'Antlers', cat: 'material', desc: 'A fine rack. Hunters brag about these.', value: 25, weight: 2, stack: true, icon: { shape: 'bone' } },
  { id: 'iron_ingot', name: 'Iron Bar', cat: 'material', desc: 'Bloomery iron, hammered into a bar.', value: 12, weight: 2, stack: true, icon: { shape: 'ingot', c1: P.metal2 } },
  { id: 'steel_ingot', name: 'Steel Bar', cat: 'material', desc: 'Good steel, carburised and folded.', value: 30, weight: 2, stack: true, icon: { shape: 'ingot', c1: P.metal4 } },
  { id: 'charcoal', name: 'Charcoal', cat: 'material', desc: 'A sack of beech charcoal for the forge.', value: 2, weight: 3, stack: true, icon: { shape: 'charcoal' } },
  { id: 'silver_ore', name: 'Silver Ore', cat: 'material', desc: 'Grey rock veined with silver.', value: 15, weight: 2, stack: true, icon: { shape: 'ore', c1: P.metal5 } },
  { id: 'linen_cloth', name: 'Linen Cloth', cat: 'material', desc: 'A bolt of bleached linen.', value: 6, weight: 1, stack: true, icon: { shape: 'cloth', c1: CLOTH.white } },
  { id: 'wax', name: 'Beeswax', cat: 'material', desc: 'For candles and for sealing letters.', value: 3, weight: 0.3, stack: true, icon: { shape: 'honey' } },
  { id: 'bandage', name: 'Bandage', cat: 'tool', desc: 'Clean linen. Use it to stop bleeding.', value: 3, weight: 0.1, stack: true, icon: { shape: 'bandage' }, cures: ['bleeding'], heal: 6 },
  { id: 'lockpick', name: 'Lockpick', cat: 'tool', desc: 'A bent bit of wire. Owning one is not a crime; using one usually is.', value: 5, weight: 0.05, stack: true, icon: { shape: 'lockpick' } },
  { id: 'whetstone', name: 'Whetstone', cat: 'tool', desc: 'Restores the edge of a blade a little.', value: 4, weight: 0.3, stack: true, icon: { shape: 'ore', c1: P.stone3 } },
  { id: 'repair_kit', name: 'Armourer\'s Kit', cat: 'tool', desc: 'Rings, rivets and leather straps for mending armour.', value: 25, weight: 1, stack: true, icon: { shape: 'tool' } },
  { id: 'torch', name: 'Torch', cat: 'tool', slot: 'torch', desc: 'Pitch-soaked rags on a stick. Press F to light it.', value: 2, weight: 0.5, stack: true, icon: { shape: 'torch' }, light: 70 },
  { id: 'lantern', name: 'Lantern', cat: 'tool', slot: 'torch', desc: 'Horn panes around a tallow candle. Steadier than a torch.', value: 30, weight: 1, icon: { shape: 'lantern' }, light: 85 },
  { id: 'shovel', name: 'Shovel', cat: 'tool', desc: 'For digging graves, and for less honest digging.', value: 8, weight: 3, icon: { shape: 'tool' } },
  { id: 'dice_set', name: 'Bone Dice', cat: 'misc', desc: 'Six dice carved from sheep knucklebone.', value: 6, weight: 0.1, icon: { shape: 'dice' } },
  { id: 'lucky_die', name: 'Lucky Die', cat: 'misc', desc: 'A die that seems to favour the one. Replaces one of your dice at the table.', value: 60, weight: 0.05, icon: { shape: 'dice', c1: P.gold3 } },
  { id: 'weighted_die', name: 'Weighted Die', cat: 'misc', desc: 'Suspiciously fond of fives.', value: 50, weight: 0.05, icon: { shape: 'dice', c1: '#b8a080' } },
  { id: 'st_christopher', name: 'St. Christopher Medal', cat: 'misc', desc: 'A pewter medal of the patron of travellers.', value: 12, weight: 0.1, icon: { shape: 'amulet', c1: P.metal3 } },
  { id: 'silver_ring', name: 'Silver Ring', cat: 'misc', desc: 'A plain silver band.', value: 45, weight: 0.05, icon: { shape: 'ring', c1: P.metal4 } },
  { id: 'garnet_ring', name: 'Garnet Ring', cat: 'misc', desc: 'Silver set with a Bohemian garnet, red as a heart.', value: 120, weight: 0.05, icon: { shape: 'ring', c1: P.metal4, c2: '#a0182a' } },
  { id: 'flowers', name: 'Wildflowers', cat: 'misc', desc: 'A handful of cornflowers and poppies.', value: 1, weight: 0.1, stack: true, icon: { shape: 'flower', c1: '#4a7ad8' } },
  { id: 'feather', name: 'Goose Feather', cat: 'material', desc: 'For fletching arrows, or for writing.', value: 1, weight: 0.01, stack: true, icon: { shape: 'feather' } },
  { id: 'candle', name: 'Beeswax Candle', cat: 'misc', desc: 'A good church candle. Burns clean and smells of summer.', value: 2, weight: 0.2, stack: true, icon: { shape: 'honey', c1: '#f0e0a0' } },
  { id: 'horseshoe_sale', name: 'Set of Horseshoes', cat: 'misc', desc: 'Four shoes of your own forging. Any smith or stable will pay for them.', value: 7, weight: 2, stack: true, icon: { shape: 'ring', c1: P.metal3 } },
  { id: 'bone', name: 'Soup Bone', cat: 'misc', desc: 'A meaty bone. Crumb would sell his soul for it.', value: 1, weight: 0.4, stack: true, icon: { shape: 'bone' } },
);

// ---------- books ----------
const BK = (id: string, name: string, desc: string, value: number, c1: string): ItemDef => ({ id, name, cat: 'book', desc, value, weight: 0.8, icon: { shape: 'book', c1, c3: P.gold3 }, book: id });
reg(
  BK('primer', 'Abecedarium', 'A child\'s primer of letters, well thumbed. Brother Tobiah\'s.', 8, CLOTH.woad),
  BK('herbal', 'The Herbarium of Master Odo', 'Illustrated leaves and their virtues. Readers learn herbalism and two recipes.', 90, CLOTH.green),
  BK('fechtbuch', 'The Fencing Book of Liechtenauer', 'Verses and drawings of the long sword. Readers learn sword craft.', 140, CLOTH.crimson),
  BK('chronicle', 'Chronicle of the Lindenmark', 'The lords, wars and floods of this valley, set down by the monks of St. Aldhelm.', 40, CLOTH.brown),
  BK('saints', 'Lives of the Saints', 'Including the curious life of St. Aldhelm, who sang to the fish.', 30, CLOTH.purple),
  BK('reynard', 'The Tales of Reynard the Fox', 'A clever fox outwits wolves and kings. Lida\'s favourite, though she could never read it.', 35, CLOTH.orange),
  BK('almanac', "The Hunter's Almanac", 'On deer, boar and the patience of the bow. Readers learn archery.', 70, CLOTH.forest),
  BK('smithing_book', "Theophilus on the Working of Metals", 'Monkish notes on steel, quenching and temper. Readers learn smithing.', 110, CLOTH.charcoal),
  BK('alchemy_book', 'The Distillations of Brother Konrad', 'On the Seven Operations. Readers learn alchemy and a recipe.', 120, '#5a3470'),
  BK('tactics', 'On Siegecraft', 'Vegetius, badly copied. Walls, ladders and patience.', 80, CLOTH.grey),
);

// ---------- keys ----------
const K = (id: string, name: string, desc: string): ItemDef => ({ id, name, cat: 'key', desc, value: 0, weight: 0, icon: { shape: 'key' }, noSell: true });
reg(
  K('key_home', 'Key to Home', 'The iron key to your family\'s house. Mother tied it with a red thread.'),
  K('key_forge_box', 'Small Brass Key', 'Found wrapped with father\'s tools.'),
  K('key_foreman', "Foreman's Key", 'Opens the strongbox in the foreman\'s house in Silverdale.'),
  K('key_cell', 'Cell Key', 'A heavy key to the cells beneath Ravenstone.'),
  K('key_lothar', "Lothar's Key", 'An ornate key taken from Sir Lothar\'s belt.'),
  K('key_tavern_room', 'Room Key', 'The key to a rented room at the Crooked Linden.'),
);

// ---------- quest items ----------
const Q = (id: string, name: string, desc: string, icon: IconSpec, extra: Partial<ItemDef> = {}): ItemDef => ({ id, name, cat: 'quest', desc, value: 0, weight: 0.2, icon, quest: true, noSell: true, ...extra });
reg(
  Q('wooden_fox', 'Wooden Fox', 'Father carved it for Lida when she was four. One ear is chewed; that was Crumb. You found it in the ashes by the bridge.', { shape: 'fox' }),
  Q('unfinished_blade', 'Unfinished Blade', 'A sword with no hilt, still dark with forge-scale. Father hid it under the hearthstone. It was meant for you.', { shape: 'sword', c1: '#5a5a62' }, { weight: 2.5 }),
  Q('fathers_letter', "Father's Letter", 'A folded letter sealed with a thumbprint of red wax. You cannot read it. Yet.', { shape: 'letter', c1: '#a82020' }, { book: 'fathers_letter' }),
  Q('bread_basket', 'Basket of Loaves', 'Mother\'s morning bread, still warm, for the neighbours.', { shape: 'bread' }, { weight: 3 }),
  Q('debt_coins', "Vojta's Debt", 'Three groschen, owed to your father for a mended scythe.', { shape: 'purse' }),
  Q('wreath', 'Midsummer Wreath', 'Flowers woven into a crown for St. John\'s Eve.', { shape: 'wreath' }),
  Q('horseshoe', 'Horseshoe', 'Your first proper horseshoe. Father said it was "not bad," which from him is a hymn.', { shape: 'ring', c1: P.metal2 }),
  Q('mothers_apron', "Mother's Apron", 'Flour-white, singed at the hem. Found on the path out of the village. There was no body.', { shape: 'cloth', c1: CLOTH.white }),
  Q('lida_drawing', "Lida's Drawing", 'Charcoal on a scrap of board: four stick figures and a dog. Underneath, in careful letters: L I D A.', { shape: 'drawing' }),
  Q('half_seal', 'Half a Seal', 'Red wax, half-melted, from the ashes at the Crow\'s Stone: a black bird with its wings spread.', { shape: 'seal', c1: '#8e2f2f' }),
  Q('harrow_orders', 'Sealed Orders', 'Orders bearing a raven seal: the mark of Ravenstone.', { shape: 'letter', c1: '#2a2a3a' }, { book: 'harrow_orders' }),
  Q('lothar_letter', "Lothar's Letter", 'A letter in Sir Lothar\'s hand to the usurper\'s captain, promising the silver of Silverdale.', { shape: 'scroll' }, { book: 'lothar_letter' }),
  Q('foreman_ledger', "Foreman's Ledger", 'Two sets of numbers. Only one of them is honest.', { shape: 'book', c1: CLOTH.brown }, { book: 'foreman_ledger' }),
  Q('soldiers_letter', "Tomasz's Letter", 'A letter from a dying soldier to his wife Anna in Silverdale.', { shape: 'letter', c1: CLOTH.woad }, { book: 'soldiers_letter' }),
  Q('feverwort_recipe', "Wenda's Recipe", 'Scratched on bark: Feverfew. Willow. Angelica root. Boil twice, grind, strain.', { shape: 'scroll' }, { book: 'feverwort_recipe' }),
  Q('queen_skep', 'Swarm in a Sack', 'An angry, humming sack of bees. Brother Tobiah\'s queen is somewhere inside.', { shape: 'honey' }),
  Q('havel_sword', "Old Havel's Sword", 'A battered old sword from the wars of King Charles, dug out from under a burned house.', { shape: 'sword', c1: '#7a7a72' }, { weight: 3 }),
  Q('lost_child_cap', "Little Wit's Cap", 'A child\'s felt cap, found on a thorn.', { shape: 'cap', c1: CLOTH.red }),
  Q('bell_clapper', 'Bell Clapper', 'The iron tongue of the priory bell.', { shape: 'mace', c1: P.metal1 }),
  Q('hanka_ribbon', "Hanka's Ribbon", 'A green ribbon she tied around your wrist on St. John\'s Eve. You never took it off.', { shape: 'cloth', c1: CLOTH.green }),
  Q('ilse_locket', "Ilse's Locket", 'A tin locket with a lock of fair hair inside.', { shape: 'amulet', c1: P.metal3 }),
  Q('ravenstone_plan', 'Plan of Ravenstone', 'The layout of the castle, the postern gate, and the old drain.', { shape: 'scroll' }, { book: 'ravenstone_plan' }),
  Q('guild_seal', 'Miners\' Guild Seal', 'Proof of the miners\' pledge to Sir Bertram.', { shape: 'seal', c1: P.metal3 }),
  Q('charcoal_token', 'Charcoal Token', 'A blackened wooden token: the charcoal burners will answer your call.', { shape: 'seal', c1: '#2a2624' }),
  Q('deserter_token', 'Broken Badge', 'Harrow\'s badge, snapped in two. Jirka\'s deserters will come when you need them.', { shape: 'seal', c1: CLOTH.red }),
);

export function item(id: string): ItemDef {
  const d = ITEMS[id];
  if (!d) {
    console.warn('unknown item', id);
    return { id, name: id, cat: 'misc', desc: '???', value: 0, weight: 0, icon: { shape: 'box', c1: '#ff00ff' } };
  }
  return d;
}
