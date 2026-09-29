// What a character looks like, and how their gear shows on their body.
// The renderer builds meshes from these; the sim derives them from items.

export interface Look {
  race: string; // race/subrace key
  female: boolean;
  height: number; // metres
  bulk: number; // 0.7..1.4
  skin: number;
  hair: number;
  hairStyle: number; // 0..8
  beard: number; // 0..4
  face: number; // 0..3 variants
  paint: number; // 0 none, else war-paint colour
  scars: number; // 0..3
}

export type HatStyle =
  | 'straw' | 'kasa' | 'hood' | 'hood_white' | 'bandana' | 'kabuto' | 'bucket' | 'skullcap' | 'goggles' | 'helm_ember'
  | 'horncap' | 'turban' | 'mask' | 'crown' | 'gasmask' | 'visor' | 'none';
export type TorsoStyle = 'shirt' | 'rags' | 'robe' | 'coat' | 'vest' | 'tunic' | 'dress';
export type ArmourStyle = 'leather' | 'plate' | 'chain' | 'samurai' | 'ember_plate' | 'bone' | 'scrap' | 'padded' | 'hive' | 'robo';
export type BackStyle = 'pack' | 'large_pack' | 'basket' | 'bedroll' | 'thief' | 'medic' | 'hive_pack' | 'chest';

export interface Vis {
  head?: { style: HatStyle; color: number; color2?: number };
  torso?: { style: TorsoStyle; color: number; color2?: number; sleeves: 0 | 1 | 2; long?: boolean };
  armour?: { style: ArmourStyle; color: number; color2?: number; shoulders?: boolean; skirt?: boolean };
  legs?: { color: number; color2?: number; armour?: boolean; skirt?: boolean };
  feet?: { color: number; armour?: boolean; wraps?: boolean };
  back?: { style: BackStyle; color: number };
  hands?: { color: number };
  mask?: { color: number };
  shackles?: boolean;
}

export type WeaponKind = 'katana' | 'sabre' | 'hacker' | 'heavy' | 'blunt' | 'polearm' | 'crossbow' | 'laser' | 'dagger' | 'unarmed' | 'pick' | 'claw';

export interface WeaponVis {
  kind: WeaponKind;
  length: number; // blade/head length in metres
  blade: number; // colour
  handle: number;
  wide?: number; // blade width multiplier
  variant?: number;
}

/** Limb loss flags, one bit per limb (see sim/body). */
export type LostMask = number;
