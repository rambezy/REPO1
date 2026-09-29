// The painted features of a face (eyes, brows, lips, stubble, lines, scars,
// war paint), worked out once per person from their looks and drawn per
// pixel by the character material, so they stay sharp however close the
// camera comes. The head's shape (human.ts) uses the same eye and mouth
// positions for its sockets and lips. Distances are in metres on the face,
// across and up from the centre of the head.
import type { Look } from '../sim/look';
import { RACE } from '../content/races';
import { RGB, rgb, mix, shade, prng } from './skin';

export interface Face {
  /** eye centre (across, up), half-width, half-height of the opening */
  eye: [number, number, number, number];
  iris: RGB;
  /** brow: height above the eye centre, half-thickness, arch, lift at the inner end */
  brow: [number, number, number, number];
  browC: RGB;
  hairC: RGB;
  /** mouth: height of the lip line, half-width, upper lip, lower lip */
  mouth: [number, number, number, number];
  lipC: RGB;
  /** stubble 0..1, age 0..1, all-black eyes, war paint */
  misc: [number, number, number, number];
  paintC: RGB;
  /** up to three scars: centre across, up, angle, half-length */
  scars: [number, number, number, number][];
}

export type HeadKind = 'human' | 'karuk' | 'thrum' | 'hollow' | 'construct' | 'pale';

/** Eye and mouth positions in unit-head terms, which the sculpt needs before it knows the head's size. */
export interface FaceShape { ex: number; ey: number; my: number }

export function faceShape(look: Look): FaceShape {
  const r = prng(look.face * 1553 + look.skin * 7 + look.hair * 3 + (look.female ? 29 : 0) + 11);
  return { ex: 0.39 + (r() - 0.5) * 0.05, ey: 0.12 + (r() - 0.5) * 0.04, my: -0.43 + (r() - 0.5) * 0.03 };
}

/** The painted face of a person with a head of radii Rx (across) and Ry (up). Null for faces without skin (Hollow, Thrum). */
export function faceOf(look: Look, kind: HeadKind, Rx: number, Ry: number): Face | null {
  if (kind === 'hollow' || kind === 'construct' || kind === 'thrum') return null;
  const fem = look.female;
  const sh = faceShape(look);
  const r = prng(look.face * 4099 + look.skin * 13 + look.hairStyle * 5 + look.beard * 17 + (fem ? 7 : 0) + 3);
  const kx = Rx / 0.078;
  const SKIN = rgb(look.skin), HAIR = rgb(look.hair);
  const karuk = kind === 'karuk', pale = kind === 'pale';

  let ew = (0.0122 + r() * 0.0018) * kx * (fem ? 1.05 : 1);
  let eh = (0.0041 + r() * 0.0012) * (fem ? 1.08 : 1) * (karuk ? 0.82 : 1);
  if (pale) { ew *= 1.12; eh *= 1.35; }
  const eye: Face['eye'] = [sh.ex * Rx, sh.ey * Ry, ew, eh];

  const browH = (fem ? 0.0165 : 0.0145) + r() * 0.004 - (karuk ? 0.002 : 0);
  const browT = pale ? 0 : fem ? 0.0015 + r() * 0.0006 : 0.0022 + r() * 0.0011 + (karuk ? 0.0008 : 0);
  const brow: Face['brow'] = [browH, browT, (fem ? 0.0028 : 0.0012) + r() * 0.0022, (r() - 0.35) * 0.0022];

  const mw = (0.021 + r() * 0.0045) * kx;
  const ul = fem ? 0.0042 + r() * 0.0014 : 0.0028 + r() * 0.0014;
  const ll = fem ? 0.0056 + r() * 0.0016 : 0.0042 + r() * 0.0016;
  const mouth: Face['mouth'] = [sh.my * Ry, mw, ul * (karuk ? 0.8 : 1), ll * (karuk ? 0.85 : 1)];
  const lipC = pale ? shade(SKIN, 0.78) : mix(SKIN, [SKIN[0] * 0.78, SKIN[1] * 0.42, SKIN[2] * 0.42], fem ? 0.58 : 0.42);

  const stubble = fem || pale ? 0 : look.beard === 1 ? 0.9 : look.beard >= 2 ? 0.55 : r() < 0.35 ? 0.35 : 0;
  const age = Math.pow(r(), 1.6) * 0.8;
  const iris = pale ? [0.01, 0.01, 0.01] as RGB : rgb(RACE[look.race]?.eyes ?? [0x3a2a1e, 0x4a3422, 0x2e2a22, 0x4a5a3a, 0x3a4a5a, 0x5a4a2a][Math.floor(r() * 6)]);
  const scars: Face['scars'] = [];
  for (let i = 0; i < Math.min(3, look.scars); i++) {
    scars.push([(r() - 0.5) * 0.09 * kx, (r() - 0.45) * 0.1, r() * Math.PI, 0.008 + r() * 0.016]);
  }
  return {
    eye, iris, brow, browC: shade(HAIR, 0.78), hairC: HAIR, mouth, lipC,
    misc: [stubble, age, pale ? 1 : 0, look.paint ? 1 : 0],
    paintC: look.paint ? rgb(look.paint) : [0, 0, 0],
    scars,
  };
}
