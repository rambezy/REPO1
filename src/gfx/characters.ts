// People: the `Look` that describes a person (skin, hair, clothes, armour,
// build), random townsfolk looks, and a frame-based drawing entry point kept
// for older callers. The painting and posing live in person.ts.

import { P, SkinTone, HAIR, CLOTH } from './palette';
import { shade, hashStr, RNG } from '../engine/util';
import { drawPerson, PersonPose } from './person';

export type HairStyle = 'short' | 'messy' | 'long' | 'bald' | 'balding' | 'braids' | 'bun' | 'tonsure' | 'ponytail' | 'curly' | 'none';
export type BeardStyle = 'none' | 'stubble' | 'short' | 'full' | 'long' | 'moustache' | 'goatee';
export type HatStyle = 'none' | 'cap' | 'hood' | 'strawhat' | 'kerchief' | 'wimple' | 'coif' | 'kettle' | 'bascinet' | 'sallet' | 'chaperon' | 'monkhood' | 'circlet' | 'feathercap';
export type OuterStyle = 'none' | 'apron' | 'gambeson' | 'mail' | 'plate' | 'brigandine' | 'tabard' | 'vest' | 'robe' | 'dress' | 'leather' | 'noble';
export type Build = 'normal' | 'broad' | 'thin' | 'fat' | 'child';

export interface Look {
  skin: SkinTone;
  hair: string;
  hairStyle: HairStyle;
  beard?: BeardStyle;
  beardColor?: string;
  eyes?: string;
  hat?: HatStyle;
  hatColor?: string;
  shirt: string;
  outer?: OuterStyle;
  outerColor?: string;
  trim?: string;
  legs: string;
  boots: string;
  belt?: string;
  build?: Build;
  cape?: string;
  female?: boolean;
  old?: boolean;
  apronColor?: string;
  freckles?: boolean;
  scar?: boolean;
  eyepatch?: boolean;
  // Portrait-only details.
  face?: FaceShape;
  portraitBg?: string;
}

export interface FaceShape {
  jaw?: 'round' | 'square' | 'narrow' | 'heavy';
  nose?: 'small' | 'button' | 'long' | 'broad' | 'hooked';
  eyeShape?: 'round' | 'narrow' | 'sleepy' | 'wide';
  brows?: 'thin' | 'thick' | 'bushy';
  mouth?: 'small' | 'wide' | 'full';
  wrinkles?: number; // 0..3
  cheeks?: boolean;
  earrings?: boolean;
}

export const FRAME = { IDLE: 0, WALK_A: 1, WALK_B: 2, WINDUP: 3, STRIKE: 4, BLOCK: 5, HURT: 6, DEAD: 7, SIT: 8, CROUCH: 9, WORK: 10 } as const;
export const FRAME_COUNT = 11;
export const FW = 24, FH = 24;

export function lookKey(look: Look): string {
  return JSON.stringify(look);
}

const FRAME_POSE: PersonPose[] = ['idle', 'walk', 'walk', 'windup', 'strike', 'block', 'hurt', 'dead', 'sit', 'crouch', 'work'];

/** Draws a character with feet at (x,y), from a frame index (older callers). */
export function drawChar(
  ctx: CanvasRenderingContext2D, look: Look, dir: number, frame: number, x: number, y: number,
  opts: { flash?: number; alpha?: number; clipH?: number; t?: number } = {},
) {
  const pose: PersonPose = opts.clipH ? 'sleep' : FRAME_POSE[frame] || 'idle';
  drawPerson(ctx, look, { dir, pose, t: opts.t ?? (frame === FRAME.WALK_B ? 0.26 : 0), flash: opts.flash, alpha: opts.alpha }, x, y);
}

// ---------- random townsfolk looks ----------


export function randomLook(seed: number | string, opts: { female?: boolean; role?: string; child?: boolean; old?: boolean } = {}): Look {
  const r = new RNG(typeof seed === 'string' ? hashStr(seed) : seed);
  const female = opts.female ?? r.chance(0.5);
  const old = opts.old ?? r.chance(0.18);
  const child = opts.child ?? false;
  const skins: SkinTone[] = ['fair', 'fair', 'pale', 'ruddy', 'tan', 'olive'];
  const skin = r.pick(skins);
  const hairCols = old ? [HAIR.grey, HAIR.white, HAIR.saltpepper, HAIR.ash] : [HAIR.black, HAIR.darkbrown, HAIR.brown, HAIR.brown, HAIR.chestnut, HAIR.auburn, HAIR.blond, HAIR.flaxen, HAIR.red];
  const hair = r.pick(hairCols);
  const peasantCloth = [CLOTH.linen, CLOTH.undyed, CLOTH.brown, CLOTH.russet, CLOTH.olive, CLOTH.green, CLOTH.woad, CLOTH.grey, CLOTH.madder, CLOTH.mustard, CLOTH.darkbrown];
  const legsCols = [CLOTH.brown, CLOTH.darkbrown, CLOTH.grey, CLOTH.charcoal, CLOTH.olive, CLOTH.russet, CLOTH.blue];
  const bootCols = [P.wood1, P.wood0, P.dirt0, '#3a2a1e'];
  const look: Look = {
    skin, hair, female, old,
    hairStyle: female ? r.pick(['long', 'bun', 'braids', 'ponytail'] as HairStyle[]) : r.pick(old ? ['balding', 'bald', 'short'] as HairStyle[] : ['short', 'short', 'messy', 'curly', 'long'] as HairStyle[]),
    shirt: r.pick(peasantCloth),
    legs: r.pick(legsCols),
    boots: r.pick(bootCols),
    build: child ? 'child' : r.pick(['normal', 'normal', 'normal', 'thin', 'broad', 'fat'] as Build[]),
    belt: r.pick([P.wood1, P.wood0, '#3a2a1e']),
    face: {
      jaw: r.pick(['round', 'square', 'narrow', 'heavy']),
      nose: r.pick(['small', 'button', 'long', 'broad', 'hooked']),
      eyeShape: r.pick(['round', 'narrow', 'sleepy', 'wide']),
      brows: r.pick(['thin', 'thick', 'bushy']),
      mouth: r.pick(['small', 'wide', 'full']),
      wrinkles: old ? r.int(2, 3) : r.int(0, 1),
    },
    eyes: r.pick(['#3b5a7a', '#4a3322', '#5a6a3a', '#6b4a2a', '#2e2e3a', '#6b7f8f']),
  };
  if (!female && !child && r.chance(old ? 0.8 : 0.45)) {
    look.beard = r.pick(['stubble', 'short', 'full', 'moustache', 'long', 'goatee'] as BeardStyle[]);
    look.beardColor = r.chance(0.2) ? shade(hair, 0.1) : hair;
  }
  if (female) {
    if (!child && r.chance(0.55)) { look.hat = r.pick(['kerchief', 'kerchief', 'wimple'] as HatStyle[]); look.hatColor = r.pick([CLOTH.white, CLOTH.linen, CLOTH.madder, CLOTH.woad, CLOTH.ochre]); }
    look.outer = 'dress';
    look.outerColor = r.pick(peasantCloth);
    if (r.chance(0.5)) look.apronColor = r.pick([CLOTH.linen, CLOTH.white, CLOTH.linenDark]);
    look.face!.cheeks = r.chance(0.5);
  } else if (r.chance(0.25)) {
    look.hat = r.pick(['cap', 'strawhat', 'hood', 'chaperon'] as HatStyle[]);
    look.hatColor = r.pick(peasantCloth);
  }
  if (!female && r.chance(0.3)) { look.outer = r.pick(['vest', 'apron', 'leather'] as OuterStyle[]); look.outerColor = r.pick([CLOTH.brown, CLOTH.darkbrown, CLOTH.russet, CLOTH.olive]); }
  if (child) { delete look.beard; look.hat = undefined; }
  if (r.chance(0.12)) look.freckles = true;

  switch (opts.role) {
    case 'guard':
      look.outer = r.pick(['tabard', 'gambeson', 'mail'] as OuterStyle[]);
      look.outerColor = CLOTH.green;
      look.trim = CLOTH.ochre;
      look.hat = r.pick(['kettle', 'coif', 'kettle', 'bascinet'] as HatStyle[]);
      look.legs = CLOTH.charcoal;
      look.boots = P.wood0;
      look.female = false; look.hairStyle = 'short';
      if (look.outer === 'gambeson') look.outerColor = CLOTH.olive;
      break;
    case 'mercenary':
      look.outer = r.pick(['mail', 'gambeson', 'brigandine', 'leather'] as OuterStyle[]);
      look.outerColor = r.pick([CLOTH.black, CLOTH.charcoal, CLOTH.red, CLOTH.darkbrown]);
      look.hat = r.pick(['kettle', 'coif', 'bascinet', 'none', 'hood'] as HatStyle[]);
      look.hatColor = CLOTH.charcoal;
      look.legs = r.pick([CLOTH.charcoal, CLOTH.red, CLOTH.black]);
      look.boots = P.wood0;
      look.cape = r.chance(0.3) ? CLOTH.black : undefined;
      look.female = false;
      look.scar = r.chance(0.3);
      if (look.hairStyle === 'braids' || look.hairStyle === 'bun') look.hairStyle = 'messy';
      break;
    case 'bandit':
      look.outer = r.pick(['leather', 'gambeson', 'vest', 'none'] as OuterStyle[]);
      look.outerColor = r.pick([CLOTH.brown, CLOTH.darkbrown, CLOTH.olive, CLOTH.forest]);
      look.hat = r.pick(['hood', 'none', 'cap', 'hood'] as HatStyle[]);
      look.hatColor = r.pick([CLOTH.forest, CLOTH.brown, CLOTH.charcoal]);
      look.female = false;
      if (look.hairStyle === 'braids' || look.hairStyle === 'bun') look.hairStyle = 'messy';
      look.scar = r.chance(0.3);
      break;
    case 'monk':
      look.outer = 'robe'; look.outerColor = CLOTH.brown; look.hairStyle = 'tonsure'; look.hat = undefined;
      break;
    case 'noble':
      look.outer = 'noble'; look.outerColor = r.pick([CLOTH.purple, CLOTH.blue, CLOTH.crimson, CLOTH.teal]);
      look.trim = CLOTH.ochre; look.hat = r.chance(0.5) ? 'chaperon' : undefined; look.hatColor = look.outerColor;
      break;
    case 'miner':
      look.outer = 'leather'; look.outerColor = CLOTH.darkbrown; look.hat = 'cap'; look.hatColor = CLOTH.white;
      look.shirt = CLOTH.grey;
      break;
  }
  return look;
}
