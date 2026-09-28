// Painted animals. Each species is a small 3D armature -- a torso of
// overlapping masses, legs solved with inverse kinematics, a neck, a head
// with muzzle, ears and eyes, and a tail -- posed per frame and seen through
// the game's 3/4 camera from four directions. The parts are painted back to
// front at high resolution: every mass gets the coat's light-to-shade
// gradient plus its own form shading, and casts a soft shadow onto what lies
// behind it; fur is then brushed on with short strokes that follow the body
// and pick up the local colour, and eyes, noses, antlers and tack are laid on
// last. Each frame is painted into its own small canvas the first time it is
// drawn, so only the poses actually seen cost time and memory.

import { RNG, clamp, lerp, smooth, hashStr, hexToRgb } from '../engine/util';
import { ART, newCanvas, lit, dim, mix, rgba, blade, Ctx } from './paint';

export type Species = 'dog' | 'wolf' | 'deer' | 'boar' | 'hare' | 'horse' | 'cow' | 'sheep' | 'chicken' | 'goose' | 'fox';

export interface AnimalLook {
  species: Species;
  coat: string;
  coat2?: string; // patches / belly
  eye?: string;
  variant?: number;
  saddle?: string; // horses
  antlers?: boolean;
}

export const AFRAME = { IDLE: 0, WALK_A: 1, WALK_B: 2, ATTACK: 3, DEAD: 4, SIT: 5, LIE: 6 } as const;
/** Frames in the smooth walk cycle drawn when `drawAnimal` is given a walk `phase`. */
export const WALK_FRAMES = 8;

// sheet columns
const C_IDLE = 0, C_ATTACK = 1, C_DEAD = 2, C_SIT = 3, C_LIE = 4, C_WALK = 5;
const NCOL = C_WALK + WALK_FRAMES;
type Kind = 'idle' | 'walk' | 'attack' | 'dead' | 'sit' | 'lie';
function colKind(col: number): { kind: Kind; ph: number } {
  if (col >= C_WALK) return { kind: 'walk', ph: (col - C_WALK) / WALK_FRAMES };
  return { kind: (['idle', 'attack', 'dead', 'sit', 'lie'] as Kind[])[col], ph: 0 };
}

// ================================================================ math

type V3 = [number, number, number];
type M3 = number[];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const len3 = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const nrm3 = (a: V3): V3 => { const l = len3(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function mv(m: M3, v: V3): V3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
function mm(a: M3, b: M3): M3 {
  const r: M3 = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return r;
}
const I3: M3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const DEG = Math.PI / 180;
/** Roll about the forward axis (positive lifts the left side). */
function rotX(a: number): M3 { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
/** Pitch about the left axis (positive raises the nose). */
function rotY(a: number): M3 { const c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; }
/** Yaw about the up axis (positive turns left). */
function rotZ(a: number): M3 { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
interface Frame { o: V3; R: M3 }
const at = (f: Frame, p: V3): V3 => add(f.o, mv(f.R, p));
const dirIn = (f: Frame, v: V3): V3 => mv(f.R, v);

// ================================================================ camera
// Animal space: x forward, y to the animal's left, z up; the ground point
// under the animal is the origin. The camera looks down at 30 degrees.

const CK = 0.5, CC = Math.sqrt(1 - CK * CK);
const VIEWS: M3[] = [
  [0, 1, 0, 1, 0, 0, 0, 0, 1], // facing the camera
  [-1, 0, 0, 0, 1, 0, 0, 0, 1], // facing left
  [1, 0, 0, 0, -1, 0, 0, 0, 1], // facing right
  [0, -1, 0, -1, 0, 0, 0, 0, 1], // facing away
];
/** Bodies read better a little wider than life in front and back views. */
const LAT = 1.16;
const VIEWW: M3[] = VIEWS.map((m) => [m[0], m[1] * LAT, m[2], m[3], m[4] * LAT, m[5], m[6], m[7] * LAT, m[8]]);
interface P2 { x: number; y: number; d: number }
function proj(dir: number, p: V3): P2 {
  const w = mv(VIEWW[dir], p);
  return { x: w[0], y: w[1] * CK - w[2] * CC, d: w[1] * CC + w[2] * CK };
}
/** Unit vector toward the camera, in animal space. */
function camVec(dir: number): V3 {
  const m = VIEWS[dir];
  return [m[3] * CC + m[6] * CK, m[4] * CC + m[7] * CK, m[5] * CC + m[8] * CK];
}
// light comes from the upper left of the screen
const LX = -0.55, LY = -0.835;

// ================================================================ scene description

type FurStyle = 'fur' | 'short' | 'wool' | 'bristle' | 'feather' | 'hard' | 'skin';
interface Mat { col: string; style: FurStyle; fur: number; dens: number; tuft: number; gloss: number }
const mat = (col: string, style: FurStyle = 'skin', fur = 0, dens = 0, tuft = 0, gloss = 0): Mat => ({ col, style, fur, dens, tuft, gloss });

interface PrimB { t: 'b'; c: V3; r: V3; R: M3; col?: string; flow?: V3; tuft?: boolean }
interface PrimT { t: 't'; a: V3; b: V3; ra: number; rb: number; col?: string; flow?: V3; tuft?: boolean }
/** A flat leaf (ear, wing): base-front, control, tip, control, base-back, base control. */
interface PrimL { t: 'l'; p: V3[]; n: V3; col?: string; inner?: string; flow?: V3; tuft?: boolean }
type Prim = PrimB | PrimT | PrimL;
interface Mark { c: V3; r: V3; R: M3; col: string; soft: number; n: V3 | null; a: number }
interface Strand { p: V3[]; w: number; col: string }
interface Layer {
  id: string; mat: Mat; prims: Prim[]; marks: Mark[]; strands: Strand[];
  bias: number; ao: number; sided: boolean; topShade: number;
  /** shade the layer as one smooth mass (torso, neck) with only faint per-part modelling */
  smooth: number;
  /** strength of the thin contour line the layer draws over what lies behind it */
  line: number;
}
type EyeKind = 'dog' | 'wolf' | 'prey' | 'boar' | 'bird' | 'goat';
type Detail =
  | { k: 'eye'; owner: string; p: V3; n: V3; fwd: V3; r: number; col: string; shut: boolean; kind: EyeKind; skin: string; ignore?: string[] }
  | { k: 'line'; owner: string; pts: V3[]; n: V3 | null; col: string; w: number; ignore?: string[] }
  | { k: 'dot'; owner: string; p: V3; n: V3 | null; r: number; col: string; hi?: boolean; ignore?: string[] }
  | { k: 'band'; owner: string; c: V3; u: V3; v: V3; a: number; b: number; w: number; col: string; ring?: string; ignore?: string[] }
  | { k: 'teeth'; owner: string; pts: V3[]; up: V3; n: V3 | null; r: number; ignore?: string[] };
interface Scene { layers: Layer[]; details: Detail[]; lying: number; ref: V3 }

class Rig {
  layers: Layer[] = [];
  details: Detail[] = [];
  L(id: string, m: Mat, o: Partial<Layer> = {}): Layer {
    const l: Layer = { id, mat: m, prims: [], marks: [], strands: [], bias: 0, ao: 0.3, sided: false, topShade: 0, smooth: 0, line: 0.32, ...o };
    this.layers.push(l);
    return l;
  }
}
const ball = (L: Layer, c: V3, r: V3, R: M3 = I3, o: Partial<PrimB> = {}) => { L.prims.push({ t: 'b', c, r, R, ...o }); };
const tube = (L: Layer, a: V3, ra: number, b: V3, rb: number, o: Partial<PrimT> = {}) => { L.prims.push({ t: 't', a, b, ra, rb, ...o }); };
const leaf = (L: Layer, p: V3[], n: V3, o: Partial<PrimL> = {}) => { L.prims.push({ t: 'l', p, n, ...o }); };
const mark = (L: Layer, c: V3, r: V3, R: M3, col: string, soft = 0.55, n: V3 | null = null, a = 1) => { L.marks.push({ c, r, R, col, soft, n, a }); };

// ================================================================ quadrupeds

interface TailSpec { base: [number, number]; a0: number; curl: number; seg: number; r: number[]; tuft: boolean; wag: number }
interface Quad {
  /** torso masses from rump to chest: [x, z, rx, ry, rz] in the pelvis frame */
  torso: number[][];
  sh: [number, number]; hp: [number, number]; ly: number;
  fb: [number, number, number]; hb: [number, number, number];
  fr: [number, number, number, number]; hr: [number, number, number, number];
  foot: 'paw' | 'hoof' | 'cloven'; footH: number;
  nb: [number, number]; neckLen: number; neckAng: number; neckR: [number, number];
  headPitch: number;
  tail: TailSpec;
  gait: 'trot' | 'walk' | 'bound'; stride: number; lift: number; bob: number;
  style: FurStyle; fur: number; dens: number; tuft: number; gloss: number;
  sits: boolean;
}

const Q: Record<string, Quad> = {
  dog: {
    torso: [[0, 0, 2.6, 2.2, 2.4], [3.6, -0.1, 2.9, 2.15, 2.1], [7.0, 0.35, 2.8, 2.4, 2.55]],
    sh: [7.3, 0.9], hp: [0.2, 0.3], ly: 1.4,
    fb: [3.0, 2.9, 1.8], hb: [3.0, 2.9, 2.2],
    fr: [1.45, 0.92, 0.6, 0.52], hr: [1.95, 1.08, 0.6, 0.52],
    foot: 'paw', footH: 0.55,
    nb: [8.1, 1.7], neckLen: 3.0, neckAng: 60, neckR: [2.0, 1.6],
    headPitch: -8,
    tail: { base: [-2.3, 1.25], a0: 34, curl: 10, seg: 1.08, r: [0.75, 1.0, 1.08, 1.0, 0.78, 0.4], tuft: true, wag: 22 },
    gait: 'trot', stride: 2.8, lift: 1.2, bob: 0.22,
    style: 'fur', fur: 1.45, dens: 0.85, tuft: 1.05, gloss: 0, sits: true,
  },
  mastiff: {
    torso: [[0, 0, 2.8, 2.45, 2.65], [3.9, -0.05, 3.0, 2.45, 2.45], [7.5, 0.45, 3.0, 2.8, 2.9]],
    sh: [7.8, 1.0], hp: [0.2, 0.3], ly: 1.65,
    fb: [3.2, 3.2, 1.9], hb: [3.2, 3.1, 2.4],
    fr: [1.8, 1.15, 0.74, 0.62], hr: [2.2, 1.28, 0.7, 0.62],
    foot: 'paw', footH: 0.62,
    nb: [8.7, 1.8], neckLen: 2.9, neckAng: 52, neckR: [2.55, 2.05],
    headPitch: -6,
    tail: { base: [-2.5, 1.3], a0: -30, curl: 10, seg: 1.45, r: [0.62, 0.55, 0.46, 0.36, 0.24], tuft: false, wag: 14 },
    gait: 'trot', stride: 3.0, lift: 1.2, bob: 0.22,
    style: 'short', fur: 1.0, dens: 0.55, tuft: 0.3, gloss: 0.5, sits: true,
  },
  wolf: {
    torso: [[0, 0, 2.5, 2.05, 2.35], [3.9, 0.1, 3.1, 2.05, 2.15], [7.6, 0.55, 3.0, 2.4, 2.9]],
    sh: [7.9, 1.05], hp: [0.2, 0.35], ly: 1.3,
    fb: [3.1, 3.5, 2.1], hb: [3.2, 3.4, 2.7],
    fr: [1.5, 0.88, 0.55, 0.5], hr: [1.9, 1.02, 0.55, 0.5],
    foot: 'paw', footH: 0.52,
    nb: [8.8, 1.7], neckLen: 3.1, neckAng: 42, neckR: [2.5, 1.9],
    headPitch: -10,
    tail: { base: [-2.3, 1.2], a0: -58, curl: 7, seg: 1.5, r: [0.78, 1.12, 1.28, 1.24, 1.0, 0.45], tuft: true, wag: 10 },
    gait: 'trot', stride: 3.4, lift: 1.3, bob: 0.22,
    style: 'fur', fur: 1.7, dens: 0.9, tuft: 1.3, gloss: 0, sits: true,
  },
  fox: {
    torso: [[0, 0, 2.0, 1.5, 1.7], [2.9, 0.02, 2.4, 1.5, 1.55], [5.7, 0.25, 2.2, 1.7, 1.95]],
    sh: [5.9, 0.55], hp: [0.1, 0.2], ly: 1.0,
    fb: [2.1, 2.2, 1.3], hb: [2.3, 2.2, 1.75],
    fr: [1.05, 0.6, 0.4, 0.37], hr: [1.38, 0.7, 0.4, 0.37],
    foot: 'paw', footH: 0.4,
    nb: [6.6, 1.15], neckLen: 2.3, neckAng: 46, neckR: [1.55, 1.25],
    headPitch: -8,
    tail: { base: [-1.9, 0.9], a0: -26, curl: 3, seg: 1.3, r: [0.6, 1.1, 1.45, 1.55, 1.4, 1.0, 0.35], tuft: true, wag: 12 },
    gait: 'trot', stride: 2.2, lift: 1.0, bob: 0.18,
    style: 'fur', fur: 1.25, dens: 1.0, tuft: 0.9, gloss: 0, sits: true,
  },
  deer: {
    torso: [[0, 0, 2.9, 2.15, 2.55], [4.6, -0.2, 3.4, 2.3, 2.5], [8.8, 0.35, 2.9, 2.25, 2.9]],
    sh: [9.1, 1.05], hp: [0.3, 0.45], ly: 1.25,
    fb: [3.4, 4.4, 3.4], hb: [3.8, 4.4, 4.2],
    fr: [1.55, 0.8, 0.48, 0.43], hr: [2.15, 1.08, 0.52, 0.43],
    foot: 'cloven', footH: 1.05,
    nb: [10.0, 1.9], neckLen: 5.0, neckAng: 62, neckR: [2.15, 1.25],
    headPitch: -32,
    tail: { base: [-2.6, 1.4], a0: -28, curl: -12, seg: 1.0, r: [0.72, 0.7, 0.42], tuft: false, wag: 20 },
    gait: 'walk', stride: 4.2, lift: 1.9, bob: 0.3,
    style: 'short', fur: 0.9, dens: 0.45, tuft: 0, gloss: 0.6, sits: false,
  },
  stag: {
    torso: [[0, 0, 3.1, 2.35, 2.75], [4.8, -0.15, 3.6, 2.5, 2.75], [9.2, 0.45, 3.1, 2.5, 3.2]],
    sh: [9.5, 1.15], hp: [0.3, 0.5], ly: 1.35,
    fb: [3.6, 4.6, 3.5], hb: [4.0, 4.6, 4.4],
    fr: [1.7, 0.88, 0.52, 0.46], hr: [2.3, 1.15, 0.56, 0.46],
    foot: 'cloven', footH: 1.1,
    nb: [10.4, 2.1], neckLen: 5.0, neckAng: 58, neckR: [2.7, 1.6],
    headPitch: -30,
    tail: { base: [-2.8, 1.5], a0: -28, curl: -12, seg: 1.0, r: [0.75, 0.72, 0.42], tuft: false, wag: 18 },
    gait: 'walk', stride: 4.4, lift: 2.0, bob: 0.3,
    style: 'short', fur: 1.0, dens: 0.45, tuft: 0.3, gloss: 0.6, sits: false,
  },
  boar: {
    torso: [[0, 0, 2.7, 2.3, 2.55], [3.9, 0.3, 3.1, 2.6, 2.95], [7.4, 0.75, 3.2, 2.8, 3.45]],
    sh: [7.6, 0.4], hp: [0.3, 0.1], ly: 1.5,
    fb: [2.2, 2.3, 1.3], hb: [2.5, 2.2, 1.6],
    fr: [1.7, 0.95, 0.6, 0.5], hr: [2.05, 1.05, 0.55, 0.5],
    foot: 'cloven', footH: 0.8,
    nb: [9.1, 1.3], neckLen: 1.7, neckAng: 14, neckR: [3.0, 2.45],
    headPitch: -18,
    tail: { base: [-2.5, 1.2], a0: -62, curl: -8, seg: 1.0, r: [0.34, 0.27, 0.22, 0.3], tuft: false, wag: 30 },
    gait: 'trot', stride: 2.6, lift: 1.0, bob: 0.2,
    style: 'bristle', fur: 1.5, dens: 0.95, tuft: 1.0, gloss: 0, sits: false,
  },
  hare: {
    torso: [[0, 0, 1.85, 1.5, 1.85], [1.7, 0.3, 1.6, 1.38, 1.55], [3.1, 0.6, 1.35, 1.28, 1.5]],
    sh: [3.2, -0.1], hp: [0.35, -0.25], ly: 0.92,
    fb: [1.3, 1.35, 0.7], hb: [1.8, 1.7, 2.2],
    fr: [0.62, 0.4, 0.3, 0.27], hr: [1.45, 0.72, 0.36, 0.3],
    foot: 'paw', footH: 0.32,
    nb: [3.75, 1.05], neckLen: 1.2, neckAng: 58, neckR: [1.2, 1.0],
    headPitch: -6,
    tail: { base: [-1.75, 0.55], a0: 10, curl: 0, seg: 0.5, r: [0.7, 0.75], tuft: true, wag: 0 },
    gait: 'bound', stride: 3.4, lift: 1.7, bob: 1.6,
    style: 'fur', fur: 0.95, dens: 1.25, tuft: 0.55, gloss: 0, sits: true,
  },
  horse: {
    torso: [[0, 0, 4.0, 3.1, 4.0], [5.8, -0.4, 4.4, 3.35, 4.3], [10.8, 0.45, 3.9, 3.1, 4.5]],
    sh: [11.0, 1.2], hp: [0.6, 0.9], ly: 1.75,
    fb: [4.4, 4.9, 4.0], hb: [4.9, 5.1, 4.6],
    fr: [2.3, 1.2, 0.72, 0.68], hr: [2.9, 1.5, 0.8, 0.68],
    foot: 'hoof', footH: 1.6,
    nb: [12.0, 2.2], neckLen: 8.0, neckAng: 57, neckR: [3.0, 1.8],
    headPitch: -50,
    tail: { base: [-3.6, 2.6], a0: -35, curl: -10, seg: 1.4, r: [1.0, 0.85, 0.7], tuft: false, wag: 8 },
    gait: 'walk', stride: 5.0, lift: 2.1, bob: 0.35,
    style: 'short', fur: 0.8, dens: 0.3, tuft: 0, gloss: 1, sits: false,
  },
  cow: {
    torso: [[0, 0, 3.6, 3.0, 3.35], [5.2, -0.5, 4.2, 3.7, 3.95], [9.8, 0.25, 3.5, 3.1, 3.8]],
    sh: [10.1, 0.8], hp: [0.5, 0.65], ly: 1.9,
    fb: [3.4, 3.6, 2.2], hb: [3.8, 3.6, 2.8],
    fr: [2.05, 1.25, 0.78, 0.7], hr: [2.75, 1.35, 0.78, 0.7],
    foot: 'cloven', footH: 1.0,
    nb: [11.6, 1.75], neckLen: 3.5, neckAng: 20, neckR: [3.1, 2.25],
    headPitch: -38,
    tail: { base: [-3.3, 1.9], a0: -78, curl: 3, seg: 1.75, r: [0.42, 0.3, 0.26, 0.24, 0.24], tuft: false, wag: 12 },
    gait: 'walk', stride: 3.6, lift: 1.4, bob: 0.25,
    style: 'short', fur: 0.9, dens: 0.35, tuft: 0, gloss: 0.5, sits: false,
  },
  sheep: {
    torso: [[0, 0, 2.9, 2.75, 2.75], [3.3, 0.1, 3.1, 2.95, 2.95], [6.3, 0.3, 2.8, 2.75, 2.9]],
    sh: [6.5, -0.2], hp: [0.4, -0.2], ly: 1.3,
    fb: [2.3, 2.4, 1.4], hb: [2.5, 2.3, 1.85],
    fr: [1.1, 0.52, 0.4, 0.38], hr: [1.45, 0.58, 0.4, 0.38],
    foot: 'cloven', footH: 0.8,
    nb: [8.0, 1.0], neckLen: 2.6, neckAng: 28, neckR: [2.2, 1.35],
    headPitch: -24,
    tail: { base: [-2.7, 0.9], a0: -40, curl: -8, seg: 1.0, r: [0.9, 0.8, 0.55], tuft: false, wag: 16 },
    gait: 'walk', stride: 2.6, lift: 1.1, bob: 0.2,
    style: 'wool', fur: 0, dens: 0, tuft: 0, gloss: 0, sits: false,
  },
};

// ---------------------------------------------------------------- pose

interface LegP { r: V3; a: V3; b: V3; f: V3; toe: V3; front: boolean; side: number }
interface QPose {
  body: Frame;
  legs: LegP[];
  neck: number; headPitch: number; headRoll: number; headYaw: number;
  jaw: number; tongue: boolean; ears: number; shut: boolean;
  tailA: number; tailCurl: number; tailWag: number;
  lying: boolean; dead: boolean;
}

const GAIT_OFF: Record<string, number[]> = { trot: [0, 0.5, 0.5, 0], walk: [0.25, 0.75, 0, 0.5], bound: [0, 0.07, 0.5, 0.57] };
const GAIT_DUTY: Record<string, number> = { trot: 0.55, walk: 0.64, bound: 0.42 };

function footCycle(p: number, S: number, H: number, duty: number): [number, number] {
  if (p < duty) return [S / 2 - (S * p) / duty, 0];
  const u = (p - duty) / (1 - duty);
  return [-S / 2 + S * smooth(u), H * Math.sin(Math.PI * u)];
}

/** Two-bone leg: `root` to `a` along `ang`, then IK from `a` to `foot` bending forward (+1) or back (-1). */
function chain(root: V3, ang: number, b1: number, b2: number, b3: number, foot: V3, bend: number): { a: V3; b: V3; f: V3 } {
  const a: V3 = [root[0] + Math.cos(ang) * b1, root[1], root[2] + Math.sin(ang) * b1];
  let dx = foot[0] - a[0], dz = foot[2] - a[2];
  let d = Math.hypot(dx, dz) || 0.001;
  const dmax = b2 + b3 - 0.02, dmin = Math.abs(b2 - b3) + 0.1;
  let f = foot;
  if (d > dmax || d < dmin) {
    const k = clamp(d, dmin, dmax) / d;
    f = [a[0] + dx * k, foot[1], a[2] + dz * k];
    dx *= k; dz *= k; d = Math.hypot(dx, dz);
  }
  const th = Math.atan2(dz, dx);
  const al = Math.acos(clamp((b2 * b2 + d * d - b3 * b3) / (2 * b2 * d), -1, 1));
  const b: V3 = [a[0] + Math.cos(th + bend * al) * b2, lerp(a[1], f[1], 0.5), a[2] + Math.sin(th + bend * al) * b2];
  return { a, b, f };
}

function standHeight(q: Quad): number {
  const zf = q.footH + (q.fb[1] + q.fb[2]) * 0.965 + q.fb[0] * Math.sin(100 * DEG) - q.sh[1];
  const hx = q.hb[0] * Math.cos(62 * DEG) + 0.3;
  const reach = (q.hb[1] + q.hb[2]) * 0.9;
  const zh = q.footH + Math.sqrt(Math.max(0, reach * reach - hx * hx)) + q.hb[0] * Math.sin(62 * DEG) - q.hp[1];
  return Math.min(zf, zh);
}

function torsoBottom(q: Quad): number {
  let m = 0;
  for (const t of q.torso) m = Math.max(m, t[4] - t[1]);
  return m;
}

function quadPose(q: Quad, sp: Species, kind: Kind, ph: number, dir: number, crumb: boolean): QPose {
  const x0 = -(q.sh[0] + q.hp[0]) / 2;
  const H = standHeight(q);
  const P: QPose = {
    body: { o: [x0, 0, H], R: I3 }, legs: [],
    neck: q.neckAng, headPitch: q.headPitch, headRoll: 0, headYaw: 0,
    jaw: 0, tongue: false, ears: 0, shut: false,
    tailA: q.tail.a0, tailCurl: q.tail.curl, tailWag: 0,
    lying: false, dead: false,
  };
  const canid = sp === 'dog' || sp === 'wolf' || sp === 'fox';
  const legRoot = (i: number, body: Frame): V3 => {
    const front = i < 2, side = i % 2 === 0 ? 1 : -1;
    return at(body, [front ? q.sh[0] : q.hp[0], side * q.ly, front ? q.sh[1] : q.hp[1]]);
  };
  const gaitLegs = (body: Frame, pitch: number, walking: boolean, fOff = [0, 0, 0, 0], fLift = [0, 0, 0, 0]) => {
    for (let i = 0; i < 4; i++) {
      const front = i < 2, side = i % 2 === 0 ? 1 : -1;
      const root = legRoot(i, body);
      const restX = x0 + (front ? q.sh[0] + 0.25 : q.hp[0] - 0.3);
      let dx = fOff[i], dz = fLift[i];
      if (walking) {
        const [cx, cz] = footCycle((ph + GAIT_OFF[q.gait][i]) % 1, q.stride, q.lift, GAIT_DUTY[q.gait]);
        dx += cx; dz += cz;
      }
      const foot: V3 = [restX + dx, side * q.ly * 0.94, q.footH + dz];
      const sw = clamp(dx / (q.stride / 2), -1.5, 1.5);
      const ang = (front ? -100 + 16 * sw : -62 + 14 * sw) * DEG + pitch;
      const bones = front ? q.fb : q.hb;
      const c = chain(root, ang, bones[0], bones[1], bones[2], foot, front ? 1 : -1);
      const tip = -clamp(dz / Math.max(0.1, q.lift), 0, 1) * 55 * DEG;
      P.legs.push({ r: root, a: c.a, b: c.b, f: c.f, toe: [Math.cos(tip), 0, Math.sin(tip)], front, side });
    }
  };
  switch (kind) {
    case 'idle':
    case 'walk': {
      const walking = kind === 'walk';
      let pitch = 0, z = H;
      if (walking) {
        if (q.gait === 'bound') {
          pitch = -15 * DEG * Math.sin(2 * Math.PI * ph);
          z += q.bob * Math.max(0, Math.sin(2 * Math.PI * (ph - 0.12)));
        } else {
          z += q.bob * Math.cos(4 * Math.PI * ph);
          pitch = 1.2 * DEG * Math.sin(2 * Math.PI * ph);
        }
        P.tailWag = q.tail.wag * Math.sin(2 * Math.PI * ph) * (crumb ? 1.4 : 1);
        if (sp === 'horse' || sp === 'deer' || sp === 'cow') P.headPitch += 4 * Math.sin(4 * Math.PI * ph);
      } else if (crumb) P.tailWag = 26;
      else if (sp === 'fox') P.tailWag = 22;
      // a raised tail seen from the front would stand up like a stalk: facing
      // the viewer, a dog carries it swept to one side
      if (sp === 'dog' && q.tail.a0 > 0 && dir === 0) P.tailWag += 34;
      if (sp === 'hare' && !walking) { pitch = 8 * DEG; z = H - 0.5; }
      const body: Frame = { o: [x0, 0, z], R: rotY(pitch) };
      P.body = body;
      gaitLegs(body, pitch, walking);
      break;
    }
    case 'attack': {
      if (sp === 'horse') {
        const pitch = 30 * DEG;
        const body: Frame = { o: [x0 - 1.2, 0, H - 1.6], R: rotY(pitch) };
        P.body = body;
        for (let i = 0; i < 4; i++) {
          const front = i < 2, side = i % 2 === 0 ? 1 : -1;
          const root = legRoot(i, body);
          if (front) {
            const e = i === 0 ? 0 : 12;
            const a: V3 = add(root, [Math.cos((-55 + e) * DEG) * q.fb[0], 0, Math.sin((-55 + e) * DEG) * q.fb[0]]);
            const b: V3 = add(a, [Math.cos((5 + e) * DEG) * q.fb[1], 0, Math.sin((5 + e) * DEG) * q.fb[1]]);
            const f: V3 = add(b, [Math.cos((-105 + e) * DEG) * q.fb[2], 0, Math.sin((-105 + e) * DEG) * q.fb[2]]);
            P.legs.push({ r: root, a, b, f, toe: [0.2, 0, -1], front, side });
          } else {
            const foot: V3 = [x0 + q.hp[0] + 1.2, side * q.ly, q.footH];
            const c = chain(root, -45 * DEG + pitch, q.hb[0], q.hb[1], q.hb[2], foot, -1);
            P.legs.push({ r: root, a: c.a, b: c.b, f: c.f, toe: [1, 0, 0], front, side });
          }
        }
        P.neck = q.neckAng - 18; P.headPitch = q.headPitch + 10; P.ears = 1; P.jaw = 10;
        P.tailA = -60;
        break;
      }
      const lunge = canid ? 1 : 0.5;
      const pitch = (canid ? -7 : -4) * DEG;
      const body: Frame = { o: [x0 + 1.0 * lunge, 0, H - 0.4], R: rotY(pitch) };
      P.body = body;
      const S = q.stride;
      if (canid) gaitLegs(body, pitch, false, [S * 0.75, S * 0.45, -S * 0.5, -S * 0.3], [q.lift * 0.8, 0, 0, 0.3]);
      else gaitLegs(body, pitch, false, [S * 0.35, S * 0.15, -S * 0.35, -S * 0.2], [0, 0, 0, 0]);
      if (canid) { P.neck = q.neckAng - 26; P.headPitch = q.headPitch + 16; P.jaw = 30; P.ears = 1; P.tailA = 4; P.tailCurl = 0; }
      else if (sp === 'boar') { P.neck = q.neckAng - 18; P.headPitch = q.headPitch - 16; P.ears = 1; P.tailA = 30; P.jaw = 12; }
      else if (sp === 'hare') { P.neck = q.neckAng + 10; P.ears = -1; }
      else { P.neck = q.neckAng - (sp === 'deer' ? 44 : 26); P.headPitch = q.headPitch - (sp === 'deer' ? 30 : 22); P.ears = 1; }
      break;
    }
    case 'sit':
    case 'lie': {
      if (kind === 'sit' && q.sits) {
        const pitch = (sp === 'hare' ? 24 : 36) * DEG;
        const hr = q.torso[0][4];
        const body: Frame = { o: [x0 + 0.4, 0, hr * 0.92 + 0.1], R: rotY(pitch) };
        P.body = body;
        for (let i = 0; i < 4; i++) {
          const front = i < 2, side = i % 2 === 0 ? 1 : -1;
          const root = legRoot(i, body);
          if (front) {
            const foot: V3 = [root[0] + 0.4, side * q.ly * 0.9, q.footH];
            const c = chain(root, -122 * DEG, q.fb[0], q.fb[1], q.fb[2], foot, 1);
            P.legs.push({ r: root, a: c.a, b: c.b, f: c.f, toe: [1, 0, 0], front, side });
          } else {
            const a: V3 = add(root, [Math.cos(-10 * DEG) * q.hb[0], side * 0.35, Math.sin(-10 * DEG) * q.hb[0]]);
            const b: V3 = [root[0] - 0.45, side * (q.ly + 0.45), q.hr[2] + 0.05];
            const f: V3 = [a[0] + 0.55, side * (q.ly + 0.3), q.footH];
            P.legs.push({ r: root, a, b, f, toe: [1, 0, 0], front, side });
          }
        }
        P.neck = 80 - 36; P.headPitch = -4 - 36;
        if (sp === 'hare') { P.neck = 70 - 24; P.headPitch = -2 - 24; }
        P.tailA = -80; P.tailCurl = 26; P.tailWag = crumb ? 38 : 20;
        if (crumb) { P.tongue = true; P.headRoll = 11 * DEG; }
        break;
      }
      // lying down on the belly
      P.lying = true;
      const tb = torsoBottom(q);
      const pitch = (canid || sp === 'hare' ? 3 : 0) * DEG;
      const body: Frame = { o: [x0, 0, tb + (canid ? 0.1 : 0.35)], R: rotY(pitch) };
      P.body = body;
      for (let i = 0; i < 4; i++) {
        const front = i < 2, side = i % 2 === 0 ? 1 : -1;
        const root = legRoot(i, body);
        if (canid || sp === 'hare') {
          if (front) {
            const a: V3 = [root[0] - 0.6, side * (q.ly + 0.15), 1.0];
            const b: V3 = [a[0] + q.fb[1] * 0.95, side * q.ly, 0.6];
            const f: V3 = [b[0] + q.fb[2] * 0.75, side * q.ly * 0.95, q.footH * 0.9];
            P.legs.push({ r: root, a, b, f, toe: [1, 0, 0], front, side });
          } else {
            const a: V3 = [root[0] + q.hb[0] * 0.85, side * (q.ly + 0.95), 1.5];
            const b: V3 = [root[0] - 0.9, side * (q.ly + 0.75), 0.6];
            const f: V3 = [a[0] + 0.35, side * (q.ly + 0.6), q.footH];
            P.legs.push({ r: root, a, b, f, toe: [1, 0, 0], front, side });
          }
        } else if (front) {
          const a: V3 = [root[0] - 0.3, side * q.ly, 1.45];
          const b: V3 = [a[0] + q.fb[1] * 0.72, side * q.ly * 0.92, 0.6];
          const f: V3 = [b[0] - q.fb[2] * 0.85, side * q.ly * 0.8, 0.55];
          P.legs.push({ r: root, a, b, f, toe: [-1, 0, 0.2], front, side });
        } else {
          const a: V3 = [root[0] + q.hb[0] * 0.8, side * (q.ly + 0.95), 1.7];
          const b: V3 = [root[0] - 0.8, side * (q.ly + 1.05), 0.7];
          const f: V3 = [b[0] + q.hb[2] * 0.85, side * (q.ly + 0.95), 0.55];
          P.legs.push({ r: root, a, b, f, toe: [1, 0, 0], front, side });
        }
      }
      P.neck = canid ? 44 : q.neckAng + 6; P.headPitch = canid ? -12 : q.headPitch;
      P.tailA = canid ? -14 : q.tail.a0 - 10; P.tailCurl = canid ? 4 : q.tail.curl; P.tailWag = canid ? 70 : 0;
      break;
    }
    case 'dead': {
      P.lying = true; P.dead = true; P.shut = true;
      let ry = 0;
      for (const t of q.torso) ry = Math.max(ry, t[3]);
      const roll = (dir === 2 ? -90 : 90) * DEG;
      const body: Frame = { o: [x0, 0, ry + 0.05], R: rotX(roll) };
      P.body = body;
      for (let i = 0; i < 4; i++) {
        const front = i < 2, side = i % 2 === 0 ? 1 : -1;
        const rootL: V3 = [front ? q.sh[0] : q.hp[0], side * q.ly, front ? q.sh[1] : q.hp[1]];
        const bones = front ? q.fb : q.hb;
        const base = (front ? -62 : -118) + (side > 0 ? 0 : 8);
        const a1 = base * DEG, a2 = (base + (front ? -12 : 10)) * DEG, a3 = (base + (front ? -4 : 2)) * DEG;
        const aL: V3 = add(rootL, [Math.cos(a1) * bones[0], 0, Math.sin(a1) * bones[0]]);
        const bL: V3 = add(aL, [Math.cos(a2) * bones[1], 0, Math.sin(a2) * bones[1]]);
        const fL: V3 = add(bL, [Math.cos(a3) * bones[2], 0, Math.sin(a3) * bones[2]]);
        P.legs.push({ r: at(body, rootL), a: at(body, aL), b: at(body, bL), f: at(body, fL), toe: dirIn(body, [Math.cos(a3 + 60 * DEG), 0, Math.sin(a3 + 60 * DEG)]), front, side });
      }
      P.neck = 8; P.headPitch = -6;
      P.tailA = -2; P.tailCurl = 0;
      break;
    }
  }
  return P;
}

// ---------------------------------------------------------------- coat colours

interface Coat {
  c: string; c2: string; eye: string; nose: string; hoof: string;
  muzzle: string; ear: string; earIn: string; legLow: string; legMid: string; tailTip: string; mane: string;
  breed: string;
  /** white face marking (horses) */
  face: 'none' | 'star' | 'blaze';
}

function lum(hex: string) { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
const lumCache = new Map<string, number>();
function lumC(hex: string) {
  let v = lumCache.get(hex);
  if (v === undefined) { v = hex.startsWith('#') ? lum(hex) : 0.5; lumCache.set(hex, v); }
  return v;
}

function coatOf(look: AnimalLook): Coat {
  const c = look.coat, c2 = look.coat2 || lit(c, 0.35);
  const sp = look.species;
  const k: Coat = {
    c, c2, eye: look.eye || '#2a1a10', nose: '#1c1512', hoof: '#2e241c',
    muzzle: c, ear: dim(c, 0.12), earIn: mix(c2, '#c88878', 0.45), legLow: c, legMid: c, tailTip: c, mane: look.coat2 || dim(c, 0.4), breed: sp, face: 'none',
  };
  if (sp === 'dog') {
    const cr = ANIMAL_LOOKS.crumb;
    if (look.coat === cr.coat && look.coat2 === cr.coat2) k.breed = 'crumb';
    else if (look.variant === 1 || (look.variant === undefined && lum(c) < 0.26)) k.breed = 'mastiff';
    else k.breed = 'farm';
    if (k.breed === 'mastiff') {
      k.c2 = lit(c2, 0.22);
      k.muzzle = mix(c, '#0e0a09', 0.3); k.legLow = mix(c, k.c2, 0.8); k.legMid = mix(c, k.c2, 0.25); k.ear = dim(c, 0.15); k.earIn = dim(c, 0.35); k.eye = look.eye || '#4a2c12';
    } else {
      k.muzzle = mix(c2, c, 0.12); k.legLow = c2; k.legMid = c; k.tailTip = c2; k.ear = dim(c, 0.38); k.earIn = dim(c, 0.5); k.eye = look.eye || '#2c1a10';
    }
  } else if (sp === 'wolf') {
    k.muzzle = mix(c, c2, 0.35); k.legLow = mix(c, c2, 0.5); k.legMid = mix(c, c2, 0.2); k.tailTip = dim(c, 0.55); k.ear = dim(c, 0.1); k.earIn = mix(c2, '#8a7a70', 0.3); k.eye = look.eye || '#d9a13a';
  } else if (sp === 'fox') {
    k.muzzle = c; k.legLow = '#241a16'; k.legMid = mix(c, '#241a16', 0.55); k.tailTip = c2; k.ear = c; k.earIn = mix(c2, '#e8c0a8', 0.4); k.eye = look.eye || '#c98b22';
  } else if (sp === 'deer') {
    k.muzzle = mix(c, '#2a1e16', 0.25); k.ear = c; k.earIn = mix(c2, '#c8a090', 0.35); k.eye = look.eye || '#18100c'; k.legLow = mix(c, c2, 0.15);
  } else if (sp === 'boar') {
    k.muzzle = mix(c, c2, 0.3); k.nose = '#a07a70'; k.ear = dim(c, 0.2); k.earIn = mix(dim(c, 0.2), '#8a5a50', 0.4); k.eye = look.eye || '#20140e'; k.legLow = dim(c, 0.25); k.hoof = '#241c16';
  } else if (sp === 'hare') {
    k.muzzle = mix(c, c2, 0.25); k.nose = '#8a5a50'; k.ear = c; k.earIn = mix(c2, '#d8a8a0', 0.45); k.eye = look.eye || '#2a1a0c'; k.tailTip = c2; k.legLow = mix(c, c2, 0.3);
  } else if (sp === 'horse') {
    const light = lum(c) > 0.45;
    k.face = light ? 'none' : lum(c) < 0.2 ? 'star' : 'blaze';
    k.mane = look.coat2 || dim(c, 0.4);
    k.muzzle = light ? mix(c, '#5a5250', 0.35) : mix(c, '#1a1412', 0.3);
    k.legLow = light ? mix(c, '#4a4440', 0.25) : mix(c, k.mane, 0.65); k.legMid = light ? c : mix(c, k.mane, 0.15);
    k.ear = dim(c, 0.1); k.earIn = dim(c, 0.4); k.eye = look.eye || '#1a100c'; k.hoof = light ? '#4a423c' : '#262019';
  } else if (sp === 'cow') {
    k.muzzle = c2; k.nose = '#d49a90'; k.ear = c; k.earIn = mix(c2, '#d0a090', 0.4); k.eye = look.eye || '#1c120e'; k.legLow = c2; k.tailTip = dim(c, 0.4);
  } else if (sp === 'sheep') {
    const face = dim(look.coat2 || '#b8b0a0', 0.42);
    k.muzzle = face; k.ear = face; k.earIn = mix(face, '#c89080', 0.3); k.legLow = face; k.legMid = face; k.eye = look.eye || '#3a2a14';
  }
  return k;
}

// ---------------------------------------------------------------- building a quadruped

function specOf(look: AnimalLook, k: Coat): Quad {
  if (k.breed === 'mastiff') return Q.mastiff;
  if (look.species === 'deer' && look.antlers) return Q.stag;
  return Q[look.species];
}

function quadScene(look: AnimalLook, col: number, dir: number): Scene {
  const sp = look.species;
  const k = coatOf(look);
  const q = specOf(look, k);
  const { kind, ph } = colKind(col);
  const P = quadPose(q, sp, kind, ph, dir, k.breed === 'crumb');
  const rig = new Rig();
  const body = P.body;

  // ---- torso: masses along the spine with in-betweens for a smooth line
  const T = rig.L('torso', mat(k.c, q.style, q.fur, q.dens, q.tuft, q.gloss), { ao: 0.25, smooth: 0.75 });
  const ms = q.torso;
  const masses: number[][] = [];
  for (let i = 0; i < ms.length; i++) {
    masses.push(ms[i]);
    if (i < ms.length - 1) {
      const a = ms[i], b = ms[i + 1];
      masses.push(a.map((v, j) => lerp(v, b[j], 0.5) * (j >= 2 ? 0.97 : 1)));
    }
  }
  const back: V3 = dirIn(body, [-1, 0, -0.32]);
  masses.forEach((m, i) => ball(T, at(body, [m[0], 0, m[1]]), [m[2], m[3], m[4]], body.R, { flow: back, tuft: i >= 2 }));
  const chestM = ms[ms.length - 1], hipM = ms[0], midM = ms[1];
  const tc = at(body, [(hipM[0] + chestM[0]) / 2, 0, midM[1]]);
  const facing = (p: V3) => nrm3(sub(p, tc));
  // markings on the body
  const bodyMark = (x: number, y: number, z: number, rx: number, ry: number, rz: number, c: string, soft = 0.55, a = 1) => {
    const p = at(body, [x, y, z]);
    mark(T, p, [rx, ry, rz], body.R, c, soft, facing(p), a);
  };
  if (sp === 'dog') {
    if (k.breed === 'mastiff') {
      bodyMark(chestM[0] + 1.6, 0, chestM[1] - 1.4, 1.8, 1.7, 2.2, k.legLow, 0.5);
    } else {
      bodyMark(chestM[0] + 1.2, 0, chestM[1] - 1.1, 2.2, 2.2, 2.6, k.c2, 0.45);
      bodyMark(midM[0], 0, midM[1] - 2.2, 3.6, 1.8, 1.1, k.c2, 0.5, 0.9);
    }
  } else if (sp === 'wolf') {
    bodyMark(chestM[0] + 1.0, 0, chestM[1] - 1.3, 2.3, 2.1, 2.5, k.c2, 0.5, 0.95);
    bodyMark(midM[0], 0, midM[1] - 2.0, 4.0, 1.8, 1.2, k.c2, 0.55, 0.9);
    bodyMark(midM[0] - 0.5, 0, midM[1] + 2.2, 4.2, 1.7, 1.2, dim(k.c, 0.3), 0.6, 0.7);
  } else if (sp === 'fox') {
    bodyMark(chestM[0] + 1.0, 0, chestM[1] - 0.9, 1.7, 1.5, 1.9, k.c2, 0.4);
    bodyMark(midM[0], 0, midM[1] - 1.5, 3.0, 1.2, 0.8, k.c2, 0.5, 0.9);
  } else if (sp === 'deer') {
    bodyMark(midM[0], 0, midM[1] - 2.4, 4.2, 1.6, 1.0, k.c2, 0.5);
    bodyMark(hipM[0] - 2.2, 0, hipM[1] + 0.2, 1.2, 1.7, 1.9, k.c2, 0.45);
    bodyMark(chestM[0] + 1.6, 0, chestM[1] - 1.2, 1.4, 1.2, 1.6, k.c2, 0.5, 0.75);
  } else if (sp === 'hare') {
    bodyMark(midM[0] + 0.6, 0, midM[1] - 1.3, 2.4, 1.1, 0.8, k.c2, 0.55);
    bodyMark(chestM[0] + 0.8, 0, chestM[1] - 0.6, 1.0, 1.0, 1.2, k.c2, 0.5, 0.8);
  } else if (sp === 'boar') {
    bodyMark(chestM[0] - 1.2, 0, chestM[1] + 2.4, 3.6, 1.8, 1.6, lit(k.c, 0.12), 0.7, 0.6);
  } else if (sp === 'cow') {
    const rng = new RNG(hashStr(look.coat + (look.coat2 || '')) + (look.variant || 0));
    const spots: number[][] = [[hipM[0] + 0.5, 1, 1.8, 2.4], [midM[0] + 0.6, -1, 0.6, 2.8], [chestM[0] - 0.4, 1, 2.2, 2.2], [midM[0] - 1.8, 1, -1.6, 1.6], [chestM[0] + 0.4, -1, -0.8, 2.0], [hipM[0] - 0.4, -1, 2.3, 1.8]];
    for (const [x, sgn, z, r] of spots) {
      const y = sgn * (2.6 + rng.next() * 0.8);
      // each patch is a clump of blobs so its edge is irregular
      for (let j = 0; j < 4; j++) {
        const a = rng.next() * Math.PI * 2, d = r * (j === 0 ? 0 : 0.55 + rng.next() * 0.3);
        const rr = r * (j === 0 ? 0.85 : 0.45 + rng.next() * 0.3);
        bodyMark(x + Math.cos(a) * d, y, z + Math.sin(a) * d * 0.8, rr * 1.1, rr * 1.2, rr * 0.9, k.c2, 0.22);
      }
    }
    bodyMark(midM[0] + 0.5, 0, midM[1] - 3.2, 4.0, 2.6, 1.2, k.c2, 0.25);
  }
  if (look.saddle) {
    const top = midM[1] + midM[4] - 0.2;
    const sx = midM[0] + 1.8;
    const trim = lum(look.saddle) < 0.3 ? '#c9a24a' : '#e2d6b0';
    bodyMark(sx, 0, top + 0.4, 3.9, 4.6, 3.9, trim, 0);
    bodyMark(sx, 0, top + 0.55, 3.6, 4.6, 3.6, look.saddle, 0);
    bodyMark(sx - 0.1, 0, top + 0.1, 3.2, 4.6, 3.0, lit(look.saddle, 0.12), 0.8, 0.6);
  }

  // upper legs (shoulder and thigh) belong to the body mass so they merge with it
  for (const L of P.legs) {
    const r = L.front ? q.fr : q.hr;
    tube(T, L.r, r[0], L.a, r[1] * 1.05, { col: sp === 'sheep' ? k.c : undefined, flow: nrm3(sub(L.a, L.r)), tuft: !L.front && (sp === 'wolf' || sp === 'dog' || sp === 'fox') });
  }

  // ---- legs
  P.legs.forEach((L, i) => legLayer(rig, q, L, k, sp, 'leg' + i));

  // ---- neck and head
  const nb = at(body, [q.nb[0], 0, q.nb[1]]);
  const na = P.neck * DEG;
  const hc = add(nb, dirIn(body, [Math.cos(na) * q.neckLen, 0, Math.sin(na) * q.neckLen]));
  const head: Frame = { o: hc, R: mm(body.R, mm(rotZ(P.headYaw), mm(rotY(P.headPitch * DEG), rotX(P.headRoll)))) };
  const N = rig.L('neck', mat(k.c, q.style, q.fur, q.dens, q.tuft * 0.8, q.gloss), { ao: 0.28, smooth: 0.6 });
  const neckTop = at(head, [-0.9, 0, -0.5]);
  tube(N, nb, q.neckR[0], neckTop, q.neckR[1], { flow: nrm3(sub(nb, neckTop)), tuft: sp === 'wolf' || sp === 'boar' });
  if (sp === 'wolf') {
    ball(N, lerp3(nb, neckTop, 0.45), [2.2, 2.4, 2.4], body.R, { flow: back, tuft: true });
    mark(N, add(lerp3(nb, neckTop, 0.55), dirIn(body, [0.8, 0, -1.2])), [1.8, 1.8, 1.9], body.R, k.c2, 0.5, dirIn(body, [1, 0, -0.6]));
  }
  if (sp === 'deer') {
    // the pale throat patch under the jaw
    mark(N, add(lerp3(nb, neckTop, 0.86), dirIn(body, [0.4, 0, -0.5])), [1.0, 1.05, 1.1], body.R, mix(k.c2, '#fffaf0', 0.45), 0.45, dirIn(body, [1, 0, -0.3]));
  }
  if (sp === 'fox' || (sp === 'dog' && k.breed !== 'mastiff') || sp === 'deer' || sp === 'hare') {
    const throat = add(lerp3(nb, neckTop, 0.55), dirIn(body, [0.5, 0, -0.8]));
    mark(N, throat, [q.neckR[1] * 0.9, q.neckR[1] * 0.85, q.neckR[0] * 0.9], body.R, k.c2, 0.5, dirIn(body, [1, 0, -0.5]));
  }
  if (sp === 'boar') {
    // bristly crest along the nape
    for (let j = 0; j < 7; j++) {
      const t = j / 6;
      const p = at(body, [lerp(q.nb[0] - 0.5, q.torso[1][0], t), 0, lerp(q.nb[1] + 2.7, q.torso[1][1] + q.torso[1][4] + 0.2, t)]);
      ball(N, p, [1.0, 0.7, 0.9], body.R, { flow: dirIn(body, [-0.6, 0, 1]), tuft: true });
    }
  }
  if (sp === 'horse' || sp === 'deer' || (sp === 'cow')) {
    // a smooth crest between the withers and the neck
    const w = at(body, [q.sh[0] - 1.8, 0, q.torso[2][1] + q.torso[2][4] - 2.1]);
    tube(N, w, q.neckR[0] * 0.74, lerp3(nb, neckTop, 0.6), (q.neckR[0] + q.neckR[1]) * 0.36, { flow: nrm3(sub(w, neckTop)) });
  }
  if (sp === 'cow') {
    // dewlap
    ball(N, add(lerp3(nb, neckTop, 0.4), dirIn(body, [0.4, 0, -1.6])), [1.9, 1.3, 1.8], body.R, {});
  }
  if (k.breed === 'mastiff') {
    // a guard dog's leather collar with an iron ring
    const cc = lerp3(nb, neckTop, 0.3);
    rig.details.push({ k: 'band', owner: 'neck', c: cc, u: dirIn(body, [0, 1, 0]), v: nrm3(sub(neckTop, nb)), a: q.neckR[0] * 0.95, b: q.neckR[0] * 0.95, w: 0.7, col: '#3a2418', ring: '#b8bcc0' });
  }

  buildHead(rig, look, k, sp, head, P);
  if (sp === 'horse') {
    // the mane falls to the side that faces the viewer
    const Mn = rig.L('mane', mat(k.mane, 'hard'), { ao: 0.3, bias: dir === 0 ? -1.5 : 0.6 });
    const side = dir === 2 ? -1 : 1;
    const poll = at(head, [-1.9, 0, 1.55]);
    const wither = at(body, [q.sh[0] - 2.6, 0, q.torso[2][1] + q.torso[2][4] - 0.3]);
    const out = dirIn(body, [0, side, 0]);
    const rng = new RNG(17);
    const n = 18;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const base = lerp3(poll, wither, t);
      base[2] += Math.sin(Math.PI * t) * 1.0 + 0.2;
      const len = 2.2 + Math.sin(Math.PI * t) * 1.6 + rng.next() * 0.8;
      let pts: V3[];
      if (P.dead) {
        // lying on its side: the mane spills back along the crest
        const p1 = add(base, dirIn(body, [-0.35 * len, 0, 0.35 * len]));
        pts = [base, p1, add(p1, dirIn(body, [-0.4 * len, 0, 0.25 * len]))];
      } else {
        const p1 = add(base, add(scl(out, 0.55), [0, 0, 0.3]));
        const p2 = add(p1, add(scl(out, 0.5), [-0.2, 0, -len * 0.5]));
        pts = [base, p1, p2, add(p2, add(scl(out, 0.12), [-0.35 - rng.next() * 0.4, 0, -len * 0.5]))];
      }
      Mn.strands.push({ p: pts, w: 0.8 + rng.next() * 0.35, col: rng.next() < 0.3 ? lit(k.mane, 0.22) : rng.next() < 0.5 ? dim(k.mane, 0.15) : k.mane });
    }
  }

  // ---- tail
  tailLayer(rig, q, P, k, sp, body);

  // ---- tack
  if (look.saddle) saddle(rig, q, body, head);
  if (sp === 'cow') {
    const U = rig.L('udder', mat('#d8a0a0', 'skin'), { ao: 0.25 });
    const up = at(body, [q.torso[0][0] + 2.4, 0, q.torso[0][1] - 2.6]);
    ball(U, up, [1.3, 1.2, 0.95], body.R);
    for (const [tx, ty] of [[0.6, 0.55], [0.6, -0.55], [-0.5, 0.55], [-0.5, -0.55]]) tube(U, at(body, [q.torso[0][0] + 2.4 + tx, ty, q.torso[0][1] - 3.1]), 0.24, at(body, [q.torso[0][0] + 2.4 + tx, ty, q.torso[0][1] - 3.8]), 0.17, { col: '#c88888' });
  }
  return { layers: rig.layers, details: rig.details, lying: P.lying ? 1 : 0, ref: tc };
}

function legLayer(rig: Rig, q: Quad, L: LegP, k: Coat, sp: Species, id: string) {
  const m = mat(k.c, q.style === 'wool' ? 'short' : q.style, q.fur * 0.8, q.dens, q.tuft * 0.6, q.gloss * 0.6);
  const lay = rig.L(id, m, { sided: true, ao: 0.3, topShade: 0.45 });
  const r = L.front ? q.fr : q.hr;
  const hoofed = q.foot !== 'paw';
  const colMid = k.legMid, colLow = k.legLow;
  tube(lay, L.a, r[1], L.b, r[2], { col: colMid, tuft: !L.front && (sp === 'wolf' || sp === 'dog' || sp === 'fox') });
  tube(lay, L.b, r[2], L.f, r[3], { col: colLow });
  const toe = L.toe;
  if (hoofed) {
    // fetlock, pastern and hoof
    const cor = add(L.f, add(scl(toe, 0.38 * (sp === 'horse' ? 1.3 : 1)), [0, 0, -(q.footH - 0.55) * (Math.abs(toe[2]) > 0.5 ? 0.3 : 1)]));
    ball(lay, L.f, [r[3] * 1.12, r[3] * 1.05, r[3] * 1.1], I3, { col: colLow });
    tube(lay, L.f, r[3] * 0.95, cor, r[3] * 0.85, { col: colLow });
    const hb = add(cor, add(scl(toe, 0.3), [0, 0, -0.42]));
    tube(lay, cor, r[3] * (q.foot === 'hoof' ? 0.95 : 0.78), hb, r[3] * (q.foot === 'hoof' ? 1.1 : 0.8), { col: k.hoof });
    if (sp === 'horse') {
      // a little feathering at the fetlock
      ball(lay, add(L.f, [-0.25, 0, -0.35]), [0.75, 0.7, 0.7], I3, { col: colLow, tuft: true });
    }
  } else {
    const pc = add(L.f, scl(toe, 0.28));
    const yaw = Math.atan2(toe[1], toe[0]), pit = Math.asin(clamp(toe[2], -1, 1));
    ball(lay, pc, [r[3] * 1.45, r[3] * 1.12, r[3] * 0.85], mm(rotZ(yaw), rotY(pit)), { col: colLow, flow: toe });
    if (sp === 'hare' && !L.front) {
      const toeEnd = add(L.f, scl(toe, 0.9));
      tube(lay, L.f, r[3], toeEnd, r[3] * 0.9, { col: colLow });
    }
  }
}

function tailLayer(rig: Rig, q: Quad, P: QPose, k: Coat, sp: Species, body: Frame) {
  const t = q.tail;
  if (sp === 'horse') {
    const L = rig.L('tail', mat(k.mane, 'hard'), { ao: 0.3 });
    const p0 = at(body, [t.base[0], 0, t.base[1]]);
    const a = (P.tailA) * DEG;
    const w = P.tailWag * DEG;
    const d0 = dirIn(body, mv(rotZ(w), [-Math.cos(a), 0, Math.sin(a)]));
    const p1 = add(p0, scl(d0, 2.2));
    tube(L, p0, 1.0, p1, 0.85, { col: k.mane });
    const rng = new RNG(7);
    const n = 16;
    for (let s = 0; s < n; s++) {
      const u = s / (n - 1);
      const spread = (u - 0.5) * 1.6;
      const start = lerp3(p0, p1, 0.3 + rng.next() * 0.7);
      const pts: V3[] = [start];
      let p = start;
      const lenT = P.dead ? 7 : 8.5 + rng.next() * 3;
      for (let j = 1; j <= 5; j++) {
        const f = j / 5;
        const dd: V3 = P.dead ? dirIn(body, [-1, spread * 0.2, -0.1 * f]) : add(scl(d0, 1 - f * 0.9), [spread * 0.25 * f, spread * 0.4 * f, -f * 1.2]);
        p = add(p, scl(nrm3(dd), lenT / 5));
        if (p[2] < 0.3) p[2] = 0.3;
        pts.push(p);
      }
      L.strands.push({ p: pts, w: 0.55 + rng.next() * 0.35, col: rng.next() < 0.3 ? lit(k.mane, 0.18) : rng.next() < 0.5 ? dim(k.mane, 0.2) : k.mane });
    }
    return;
  }
  const L = rig.L('tail', mat(k.c, q.style === 'wool' ? 'wool' : q.style, q.fur, q.dens * 1.2, t.tuft ? q.tuft * 1.2 : 0), { ao: 0.28, sided: false });
  let p = at(body, [t.base[0], 0, t.base[1]]);
  const n = t.r.length - 1;
  const tipCol = k.tailTip;
  if (sp === 'hare') {
    ball(L, add(p, dirIn(body, [-0.3, 0, 0.3])), [0.8, 0.75, 0.8], body.R, { col: k.c2, tuft: true, flow: dirIn(body, [-1, 0, 0]) });
    return;
  }
  for (let i = 0; i < n; i++) {
    const a = (P.tailA + P.tailCurl * i) * DEG;
    const w = (P.tailWag * (i + 1)) / n * DEG;
    const d = dirIn(body, mv(rotZ(w), [-Math.cos(a), 0, Math.sin(a)]));
    let p2 = add(p, scl(d, t.seg));
    if (p2[2] < t.r[i + 1] + 0.05) p2 = [p2[0], p2[1], t.r[i + 1] + 0.05];
    const col = i >= n - 2 && tipCol !== k.c ? (i === n - 1 ? tipCol : mix(k.c, tipCol, 0.5)) : k.c;
    tube(L, p, t.r[i], p2, t.r[i + 1], { col, tuft: t.tuft, flow: nrm3(sub(p2, p)) });
    p = p2;
  }
  if (sp === 'cow' || sp === 'boar') {
    ball(L, p, [0.55, 0.5, 0.75], I3, { col: k.tailTip, tuft: true, flow: [0, 0, -1] });
  }
}

// ---------------------------------------------------------------- heads

function buildHead(rig: Rig, look: AnimalLook, k: Coat, sp: Species, H: Frame, P: QPose) {
  const hp = (x: number, y: number, z: number) => at(H, [x, y, z]);
  const hd = (x: number, y: number, z: number) => dirIn(H, [x, y, z]);
  const HR = H.R;
  const backF = hd(-1, 0, -0.25);
  const q = specOf(look, k);
  const hm = (c: string) => mat(c, q.style === 'wool' ? 'short' : q.style, q.fur * 0.75, q.dens * 1.1, q.tuft * 0.6, q.gloss);
  const eyeKind: EyeKind = sp === 'wolf' || sp === 'fox' ? 'wolf' : sp === 'dog' ? 'dog' : sp === 'boar' ? 'boar' : sp === 'sheep' ? 'goat' : 'prey';
  const jawA = P.jaw * DEG;
  const earBack = P.ears;

  // proportions per species: skull radii, muzzle [x0, z0, r0, x1, z1, r1], nose [x, z, r], eye [x, y, z, r]
  let skull: V3, mz: number[], nose: number[], eye: number[];
  switch (k.breed === 'mastiff' ? 'mastiff' : sp) {
    case 'mastiff': skull = [2.35, 2.1, 2.05]; mz = [1.1, -0.65, 1.55, 2.95, -0.95, 1.3]; nose = [3.65, -0.4, 0.62]; eye = [1.55, 1.0, 0.55, 0.5]; break;
    case 'dog': skull = [2.15, 1.95, 1.95]; mz = [1.1, -0.55, 1.25, 3.05, -0.85, 0.95]; nose = [3.72, -0.52, 0.55]; eye = [1.5, 0.98, 0.5, 0.52]; break;
    case 'wolf': skull = [2.15, 1.75, 1.75]; mz = [1.1, -0.5, 1.15, 3.8, -0.85, 0.78]; nose = [4.3, -0.5, 0.52]; eye = [1.45, 0.92, 0.5, 0.44]; break;
    case 'fox': skull = [1.7, 1.42, 1.42]; mz = [0.9, -0.45, 0.85, 3.0, -0.75, 0.45]; nose = [3.35, -0.62, 0.36]; eye = [1.1, 0.75, 0.42, 0.38]; break;
    case 'deer': skull = [1.8, 1.35, 1.45]; mz = [0.8, -0.35, 1.2, 3.7, -0.9, 0.78]; nose = [4.3, -0.75, 0.5]; eye = [0.9, 1.05, 0.45, 0.55]; break;
    case 'boar': skull = [2.4, 1.9, 2.15]; mz = [1.3, -0.55, 1.55, 4.6, -1.3, 0.88]; nose = [4.95, -1.3, 0.95]; eye = [0.95, 1.4, 0.55, 0.36]; break;
    case 'hare': skull = [1.35, 1.1, 1.2]; mz = [0.62, -0.28, 0.78, 1.45, -0.42, 0.55]; nose = [1.92, -0.32, 0.26]; eye = [0.6, 0.82, 0.3, 0.44]; break;
    case 'horse': skull = [2.45, 1.7, 2.05]; mz = [1.0, -0.25, 1.62, 5.6, -0.6, 1.22]; nose = [6.2, -0.72, 1.38]; eye = [1.0, 1.52, 0.6, 0.58]; break;
    case 'cow': skull = [2.45, 2.1, 2.1]; mz = [1.2, -0.7, 1.9, 4.2, -1.3, 1.62]; nose = [5.0, -1.1, 1.35]; eye = [1.0, 1.8, 0.6, 0.58]; break;
    default: skull = [1.75, 1.35, 1.55]; mz = [0.8, -0.55, 1.15, 2.75, -1.15, 0.85]; nose = [3.15, -1.1, 0.75]; eye = [0.8, 1.12, 0.5, 0.44]; break; // sheep
  }

  if (k.breed === 'crumb') {
    // a little bigger-headed than life: he is meant to be adored
    const g = 1.1;
    skull = scl(skull, g); mz = [1.1, -0.62, 1.3, 2.75, -0.9, 1.0].map((v) => v * g); nose = [3.4, -0.55, 0.56].map((v) => v * g); eye = [eye[0] * g, eye[1] * g, eye[2] * g, 0.56];
  }
  // ---- skull
  const S = rig.L('head', hm(k.c), { ao: 0.32 });
  ball(S, hp(0, 0, 0), skull, HR, { flow: backF, tuft: sp === 'wolf' });
  if (sp === 'wolf' || sp === 'fox') {
    for (const s of [1, -1]) ball(S, hp(-0.35, s * skull[1] * 0.72, -0.55), [1.3, 1.0, 1.1], HR, { flow: hd(-0.6, s * 0.6, -0.4), tuft: true });
  }
  if (sp === 'horse') ball(S, hp(-0.3, 0, -1.35), [1.95, 1.55, 1.6], HR, { flow: backF });
  if (sp === 'boar') ball(S, hp(-0.6, 0, 0.6), [2.2, 1.7, 1.8], HR, { flow: hd(-0.6, 0, 0.8), tuft: true });
  if (sp === 'sheep') ball(S, hp(-0.5, 0, 0.8), [1.45, 1.25, 1.1], HR, { col: look.coat });
  const hmark = (x: number, y: number, z: number, r: V3, c: string, soft = 0.5, a = 1) => mark(S, hp(x, y, z), r, HR, c, soft, hd(x, y, z), a);
  if (k.breed === 'crumb' || k.breed === 'farm') {
    hmark(1.55, 0, 0.55, [0.7, 0.42, 1.35], k.c2, 0.55);
    for (const s of [1, -1]) hmark(1.35, s * 0.72, 1.05, [0.38, 0.3, 0.26], k.c2, 0.4, 0.85);
  } else if (k.breed === 'mastiff') {
    for (const s of [1, -1]) hmark(1.45, s * 0.75, 1.05, [0.42, 0.34, 0.28], k.legLow, 0.4);
    for (const s of [1, -1]) hmark(1.2, s * 1.3, -0.9, [0.7, 0.6, 0.6], k.legLow, 0.5, 0.8);
  } else if (sp === 'wolf') {
    for (const s of [1, -1]) hmark(0.6, s * 1.25, -0.75, [1.0, 0.8, 0.8], k.c2, 0.5);
    for (const s of [1, -1]) hmark(1.35, s * 0.75, 0.95, [0.35, 0.3, 0.2], k.c2, 0.45, 0.8);
    hmark(-0.4, 0, 1.4, [1.2, 0.9, 0.7], dim(k.c, 0.25), 0.6, 0.7);
  } else if (sp === 'fox') {
    for (const s of [1, -1]) hmark(0.55, s * 1.05, -0.65, [1.05, 0.75, 0.75], k.c2, 0.4);
  } else if (sp === 'deer') {
    for (const s of [1, -1]) hmark(0.95, s * 1.05, 0.45, [0.62, 0.35, 0.55], lit(k.c2, 0.1), 0.5, 0.75);
    hmark(0.2, 0, -1.2, [1.2, 1.0, 0.6], k.c2, 0.55, 0.8);
  } else if (sp === 'hare') {
    for (const s of [1, -1]) hmark(0.6, s * 0.82, 0.3, [0.62, 0.3, 0.55], k.c2, 0.5, 0.85);
  } else if (sp === 'horse' && lum(k.c) < 0.45) {
    hmark(1.4, 0, 1.25, [0.55, 0.4, 0.55], lit(k.c, 0.5), 0.5, 0.5);
  } else if (sp === 'cow') {
    hmark(1.2, 0, 0.3, [1.5, 1.25, 2.1], k.c2, 0.25);
  }

  // ---- ears
  earLayers(rig, k, sp, H, P);

  // ---- muzzle / face
  const M = rig.L('muzzle', hm(sp === 'horse' ? k.c : k.muzzle), { ao: 0.3 });
  const m0 = hp(mz[0], 0, mz[1]), m1 = hp(mz[3], 0, mz[4]);
  tube(M, m0, mz[2], m1, mz[5], { flow: nrm3(sub(m0, m1)) });
  if (sp === 'horse') {
    ball(M, hp(nose[0], 0, nose[1]), [nose[2] * 1.05, nose[2] * 0.95, nose[2]], HR, { col: mix(k.c, k.muzzle, 0.5) });
    mark(M, hp(nose[0] + 0.3, 0, nose[1] - 0.2), [nose[2] * 0.9, nose[2] * 1.0, nose[2] * 0.95], HR, k.muzzle, 0.5, hd(1, 0, -0.4));
    // a white blaze down the face of a bay, a star on a black
    if (k.face === 'blaze') {
      mark(M, hp((mz[0] + mz[3]) / 2 + 0.2, 0, lerp(mz[1], mz[4], 0.5) + mz[2] * 0.8), [(mz[3] - mz[0]) * 0.55, 0.45, 0.5], HR, '#ece6da', 0.35, hd(0, 0, 1));
      mark(S, hp(1.3, 0, 1.2), [0.9, 0.5, 0.75], HR, '#ece6da', 0.35, hd(0.6, 0, 0.8));
    } else if (k.face === 'star') mark(S, hp(1.35, 0, 1.15), [0.5, 0.42, 0.5], HR, '#e2dcd2', 0.4, hd(0.6, 0, 0.8));
  }
  if (sp === 'wolf' || sp === 'dog') mark(M, hp((mz[0] + mz[3]) / 2, 0, mz[4] - mz[5] * 0.9), [(mz[3] - mz[0]) * 0.6, mz[5] * 0.95, mz[5] * 0.7], HR, k.breed === 'mastiff' ? k.muzzle : k.c2, 0.5, hd(0.3, 0, -1));
  if (sp === 'fox') mark(M, hp((mz[0] + mz[3]) / 2, 0, mz[4] - 0.3), [(mz[3] - mz[0]) * 0.65, 0.9, 0.55], HR, k.c2, 0.4, hd(0.2, 0, -1));
  if (sp === 'deer') mark(M, hp(mz[3] - 0.3, 0, mz[4] - 0.2), [0.7, 0.85, 0.8], HR, k.c2, 0.4, hd(1, 0, -0.3));
  if (k.breed === 'mastiff') for (const s of [1, -1]) ball(M, hp(mz[3] - 0.7, s * 0.85, mz[4] - 0.9), [1.0, 0.7, 0.85], HR, { col: k.muzzle });

  // lower jaw & mouth (open)
  if (jawA > 0.01) {
    const hinge = hp(mz[0] - 0.4, 0, mz[1] - mz[2] * 0.35);
    const jawDir: V3 = mv(rotY(-jawA), [1, 0, -0.08]);
    const jawLen = mz[3] - mz[0] + 0.1;
    const Jin = rig.L('mouth', mat('#5a1c1a', 'skin'), { ao: 0, bias: -0.05, line: 0 });
    const jt = add(hinge, dirIn(H, scl(jawDir, jawLen * 0.95)));
    ball(Jin, lerp3(hp(mz[3] - 0.5, 0, mz[4] - mz[5] * 0.6), jt, 0.5), [jawLen * 0.42, mz[5] * 0.8, (mz[5] + 0.3) * 0.8], HR, { col: '#4a1414' });
    const J = rig.L('jaw', hm(sp === 'wolf' || sp === 'dog' ? (k.breed === 'mastiff' ? k.muzzle : k.c2) : k.muzzle), { ao: 0.25 });
    tube(J, hinge, mz[2] * 0.72, jt, mz[5] * 0.62, { flow: nrm3(sub(hinge, jt)) });
    if (sp === 'wolf' || sp === 'dog' || sp === 'fox') {
      const up = hd(0, 0, 1);
      rig.details.push({ k: 'teeth', owner: 'muzzle', pts: [hp(mz[3] - 0.25, 0.45, mz[4] - mz[5] * 0.8), hp(mz[3] - 0.25, -0.45, mz[4] - mz[5] * 0.8)], up: scl(up, -1), n: null, r: 0.34 });
      const jl = dirIn(H, scl(jawDir, jawLen * 0.85));
      rig.details.push({ k: 'teeth', owner: 'jaw', pts: [add(add(hinge, jl), hd(0, 0.42, 0.25)), add(add(hinge, jl), hd(0, -0.42, 0.25))], up, n: null, r: 0.3 });
      const tg = rig.L('tongue', mat('#c85060', 'skin'), { ao: 0.2 });
      ball(tg, lerp3(hinge, jt, 0.62), [jawLen * 0.3, mz[5] * 0.55, 0.3], HR, { col: '#c85a66' });
    }
  }
  // ---- nose
  if (sp === 'wolf' || sp === 'dog' || sp === 'fox') {
    const Nz = rig.L('nose', mat(k.nose, 'hard'), { ao: 0.2 });
    ball(Nz, hp(nose[0], 0, nose[1]), [nose[2] * 0.9, nose[2] * 1.18, nose[2] * 0.82], HR);
    for (const s of [1, -1]) rig.details.push({ k: 'dot', owner: 'nose', p: hp(nose[0] + nose[2] * 0.72, s * nose[2] * 0.45, nose[1] - nose[2] * 0.1), n: hd(1, s * 0.5, 0), r: nose[2] * 0.2, col: '#050303' });
    rig.details.push({ k: 'dot', owner: 'nose', p: hp(nose[0] + nose[2] * 0.2, nose[2] * 0.25, nose[1] + nose[2] * 0.62), n: null, r: nose[2] * 0.26, col: 'rgba(255,255,255,0.75)', hi: true });
  } else if (sp === 'boar') {
    const Nz = rig.L('nose', mat(k.nose, 'skin'), { ao: 0.2 });
    const dR = mm(HR, rotY(-62 * DEG));
    ball(Nz, hp(nose[0], 0, nose[1]), [0.42, nose[2] * 1.05, nose[2] * 0.92], dR, { col: k.nose });
    for (const s of [1, -1]) rig.details.push({ k: 'dot', owner: 'nose', p: hp(nose[0] + 0.25, s * 0.38, nose[1] - 0.2), n: hd(1, 0, -0.6), r: 0.24, col: '#3a2220' });
  } else if (sp === 'cow' || sp === 'horse' || sp === 'hare' || sp === 'deer' || sp === 'sheep') {
    const nc = sp === 'cow' ? dim(k.nose, 0.45) : sp === 'hare' ? k.nose : sp === 'deer' ? '#1e1612' : sp === 'sheep' ? dim(k.muzzle, 0.35) : dim(k.muzzle, 0.4);
    for (const s of [1, -1]) {
      const p = hp(nose[0] + nose[2] * 0.55, s * nose[2] * 0.5, nose[1] + nose[2] * 0.05);
      rig.details.push({ k: 'dot', owner: 'muzzle', p, n: hd(0.9, s * 0.45, 0.1), r: nose[2] * (sp === 'hare' ? 0.3 : 0.22), col: nc });
    }
    if (sp === 'deer' || sp === 'cow') {
      const Nz = rig.L('nose', mat(sp === 'cow' ? k.nose : '#241a14', sp === 'cow' ? 'skin' : 'hard'), { ao: 0.12 });
      ball(Nz, hp(mz[3] + mz[5] * 0.45, 0, mz[4] + 0.05), [mz[5] * 0.62, mz[5] * (sp === 'cow' ? 0.85 : 0.95), mz[5] * (sp === 'cow' ? 0.72 : 0.8)], HR);
    }
  }
  // mouth line
  if (jawA < 0.01) {
    const lipY = mz[5] * 0.75;
    for (const s of [1, -1]) {
      const pts: V3[] = [hp(mz[3] + mz[5] * 0.4, 0, mz[4] - mz[5] * 0.78), hp(mz[3] - 0.2, s * lipY * 0.7, mz[4] - mz[5] * 0.8), hp(mz[0] + 0.35, s * lipY, mz[1] - mz[2] * 0.62)];
      rig.details.push({ k: 'line', owner: 'muzzle', pts, n: hd(0, s, -0.3), col: 'rgba(24,14,10,0.7)', w: sp === 'horse' || sp === 'cow' ? 0.22 : 0.18 });
    }
  }
  if (P.tongue) {
    const tg = rig.L('tongue', mat('#d06070', 'skin'), { ao: 0.25, bias: 0.05 });
    const tp = hp(mz[3] - 0.35, 0, mz[4] - mz[5] - 0.45);
    ball(tg, tp, [0.5, 0.42, 0.7], mm(HR, rotY(-25 * DEG)), { col: '#d8687a' });
    rig.details.push({ k: 'line', owner: 'tongue', pts: [hp(mz[3] - 0.3, 0, mz[4] - mz[5] - 0.1), hp(mz[3] - 0.45, 0, mz[4] - mz[5] - 0.9)], n: null, col: 'rgba(120,30,40,0.6)', w: 0.12 });
  }

  // ---- horns, tusks, antlers
  if (sp === 'boar') {
    const Tk = rig.L('tusks', mat('#ece2cc', 'hard'), { ao: 0.2 });
    for (const s of [1, -1]) {
      const a = hp(mz[3] - 0.9, s * (mz[5] + 0.05), mz[4] - 0.35);
      const b = hp(mz[3] - 0.5, s * (mz[5] + 0.35), mz[4] + 0.55);
      const c = hp(mz[3] - 1.0, s * (mz[5] + 0.45), mz[4] + 1.1);
      tube(Tk, a, 0.3, b, 0.22);
      tube(Tk, b, 0.22, c, 0.08);
    }
  }
  if (sp === 'cow') {
    const Hn = rig.L('horns', mat('#e0d4b4', 'hard'), { ao: 0.2 });
    for (const s of [1, -1]) {
      const a = hp(-0.3, s * 1.6, 1.5), b = hp(-0.15, s * 2.9, 2.05), c = hp(0.45, s * 3.35, 3.35);
      tube(Hn, a, 0.5, b, 0.38, { col: '#e2d6b6' });
      tube(Hn, b, 0.38, lerp3(b, c, 0.6), 0.24, { col: '#d4c6a0' });
      tube(Hn, lerp3(b, c, 0.6), 0.24, c, 0.1, { col: '#5a4a3a' });
    }
  }
  if (look.antlers) {
    const A = rig.L('antlers', mat('#c8b08a', 'hard'), { ao: 0.25, bias: 0.02 });
    for (const s of [1, -1]) {
      const base = hp(-0.3, s * 0.65, 1.2);
      const beam = (t: number): V3 => hp(-0.3 - t * 2.4 + t * t * 1.9, s * (0.65 + t * 3.1 - t * t * 0.9), 1.2 + t * 6.0);
      let prev = base;
      for (let i = 1; i <= 6; i++) {
        const t = i / 6;
        const p = beam(t);
        tube(A, prev, 0.46 - t * 0.28, p, 0.44 - t * 0.28, { col: i < 2 ? '#6a4e34' : i < 4 ? '#9a7e58' : '#d8c8a4' });
        prev = p;
      }
      for (const [t, dx, dy, dz, l] of [[0.14, 1.3, 0.2, 0.45, 2.1], [0.34, 1.1, 0.25, 0.8, 1.9], [0.62, 0.7, 0.35, 1.2, 1.9], [0.84, 0.25, 0.7, 1.1, 1.5], [0.9, -0.5, 0.4, 1.0, 1.2]]) {
        const o = beam(t);
        const tip = add(o, scl(nrm3(hd(dx, s * dy, dz)), l));
        tube(A, o, 0.26, tip, 0.08, { col: t < 0.3 ? '#b89c74' : '#e2d4b2' });
      }
    }
    for (const s of [1, -1]) rig.details.push({ k: 'dot', owner: 'antlers', p: hp(-0.3, s * 0.65, 1.2), n: null, r: 0.38, col: '#5a4430' });
  }
  if (sp === 'sheep') {
    // woolly cap between the ears
    const W = rig.L('poll', mat(look.coat, 'wool'), { ao: 0.2 });
    ball(W, hp(-0.9, 0, 1.05), [1.05, 1.1, 0.8], HR, { col: look.coat });
  }
  if (sp === 'horse') {
    // forelock
    const F = rig.L('forelock', mat(k.mane, 'hard'), { ao: 0.25, bias: 0.4 });
    const rng = new RNG(11);
    for (let s = 0; s < 7; s++) {
      const off = (s - 3) * 0.2;
      const p0 = hp(-1.0, off, 1.7);
      const pts: V3[] = [p0, hp(0.0, off * 1.4, 1.75), hp(0.9, off * 1.5 + (rng.next() - 0.5) * 0.3, 1.45), hp(1.6, off * 1.2, 1.0)];
      F.strands.push({ p: pts, w: 0.5, col: s % 3 === 0 ? lit(k.mane, 0.2) : k.mane });
    }
    // bridle
    if (look.saddle) {
      const strap = '#2a1a12';
      const nb2 = mz[3] - 1.4;
      rig.details.push({ k: 'band', owner: 'muzzle', c: hp(nb2, 0, lerp(mz[1], mz[4], 0.75)), u: hd(0, 1, 0), v: hd(0, 0, 1), a: lerp(mz[2], mz[5], 0.75) * 1.02, b: lerp(mz[2], mz[5], 0.75) * 1.02, w: 0.42, col: strap, ring: '#c8b060' });
      for (const s of [1, -1]) rig.details.push({ k: 'line', owner: 'head', pts: [hp(-1.2, s * 1.3, 1.2), hp(-0.2, s * 1.55, -0.3), hp(nb2 - 0.2, s * 1.35, lerp(mz[1], mz[4], 0.75))], n: hd(0, s, 0.2), col: strap, w: 0.35 });
      rig.details.push({ k: 'band', owner: 'head', c: hp(-1.1, 0, 0.9), u: hd(0, 1, 0), v: hd(0.5, 0, 0.85), a: 1.6, b: 1.7, w: 0.35, col: strap });
    }
  }

  // ---- eyes
  const eyeCol = k.eye;
  for (const s of [1, -1]) {
    const p = hp(eye[0], s * eye[1], eye[2]);
    const n = nrm3(hd(sp === 'horse' || sp === 'cow' || sp === 'deer' || sp === 'hare' || sp === 'sheep' || sp === 'boar' ? 0.35 : 0.72, s * 0.7, 0.18));
    rig.details.push({ k: 'eye', owner: 'head', p, n, fwd: hd(1, 0, 0), r: eye[3], col: eyeCol, shut: P.shut, kind: eyeKind, skin: k.c, ignore: ['muzzle', 'nose', 'jaw', 'mouth', 'tongue', 'tusks', 'forelock', 'poll'] });
  }
}

function earLayers(rig: Rig, k: Coat, sp: Species, H: Frame, P: QPose) {
  const hp = (x: number, y: number, z: number) => at(H, [x, y, z]);
  const hd = (x: number, y: number, z: number) => dirIn(H, [x, y, z]);
  const back = P.ears; // 1 = pinned back, -1 = perked
  for (const s of [1, -1]) {
    const L = rig.L('ear' + (s > 0 ? 'L' : 'R'), mat(k.ear, 'fur', 0.9, 0.9, 0.5), { ao: 0.25, sided: true, bias: 0.02, line: 0.55 });
    let pts: number[][];
    let n: V3;
    const breed = k.breed;
    if (sp === 'dog' && breed !== 'mastiff') {
      const flop = breed === 'crumb' ? (s > 0 ? 0 : 0.35) : 0.2;
      pts = [[0.6, 1.0, 1.6], [1.35, 1.95 + flop * 0.3, 0.3], [0.35 + flop, 2.35, -1.55 + flop * 0.6], [-1.15, 2.1, -0.3], [-0.95, 1.25, 1.2], [-0.15, 1.05, 2.0]];
      if (back > 0) pts = pts.map(([x, y, z], i) => (i === 0 || i === 4 || i === 5 ? [x, y, z] : [x - 1.3, y - 0.2, z + 0.4]));
      n = [0.1, s, 0.25];
    } else if (breed === 'mastiff' && sp === 'dog') {
      pts = [[0.25, 1.15, 1.65], [0.35, 2.0, 1.45], [-0.55, 2.35, 0.45], [-1.15, 1.9, 0.9], [-0.9, 1.35, 1.35], [-0.35, 1.2, 1.95]];
      n = [0.3, s, 0.3];
    } else {
      // an upright ear: a cupped leaf from its base on the skull to the tip,
      // opening toward `n`
      const E: Record<string, [V3, V3, number, V3]> = {
        wolf: [[-0.35, 0.95, 1.4], [-0.6, 1.4, 3.3], 1.5, [0.9, 0.35, 0.15]],
        dog: [[-0.35, 0.95, 1.4], [-0.6, 1.4, 3.1], 1.5, [0.9, 0.35, 0.15]],
        fox: [[-0.3, 0.82, 1.1], [-0.6, 1.6, 3.55], 1.85, [0.9, 0.42, 0.12]],
        deer: [[-0.55, 0.85, 1.2], [-0.85, 2.8, 2.75], 2.15, [0.72, 0.5, 0.48]],
        horse: [[-1.1, 0.72, 1.75], [-1.35, 1.0, 3.6], 1.05, [0.9, 0.3, 0.15]],
        boar: [[-1.2, 1.1, 1.9], [-1.75, 2.05, 3.25], 1.4, [0.8, 0.5, 0.25]],
        hare: [[-0.3, 0.45, 1.0], [-0.95, 0.95, 4.25], 1.2, [0.85, 0.45, 0]],
        cow: [[-0.55, 1.75, 0.7], [-0.45, 3.5, 0.5], 1.5, [0.6, 0.15, 0.8]],
        sheep: [[-0.55, 1.1, 0.6], [-0.45, 2.65, 0.3], 1.15, [0.55, 0.15, 0.82]],
      };
      const [b0, t0, w, n0] = E[sp] || E.wolf;
      const base: V3 = [b0[0], b0[1], b0[2]];
      let tip: V3 = [t0[0], t0[1], t0[2]];
      const Lr = len3(sub(tip, base));
      if (back > 0) tip = add(tip, [-Lr * 0.55, -Lr * 0.05, -Lr * 0.3]);
      else if (back < 0) tip = add(tip, [Lr * 0.15, 0, 0.1]);
      if (sp === 'hare' && back === 0) tip = add(tip, [-0.45, 0, -0.15]);
      const ax = nrm3(sub(tip, base));
      const u = nrm3(cross(nrm3(n0), ax));
      const mid = lerp3(base, tip, 0.42);
      const cup = scl(nrm3(n0), -0.12 * w);
      pts = [
        add(base, scl(u, w * 0.34)),
        add(add(mid, scl(u, w * 0.85)), cup),
        tip,
        add(add(mid, scl(u, -w * 0.85)), cup),
        add(base, scl(u, -w * 0.34)),
        add(base, scl(ax, -Lr * 0.14)),
      ];
      n = [n0[0], n0[1] * s, n0[2]];
    }
    const es = k.breed === 'crumb' ? 1.1 : 1;
    const P3 = pts.map(([x, y, z]) => hp(x * es, s * y * es, z * es));
    const nn = nrm3(hd(n[0], n[1], n[2]));
    const inner = sp === 'dog' && k.breed !== 'mastiff' ? undefined : k.earIn;
    leaf(L, P3, nn, { inner, flow: nrm3(sub(P3[2], P3[0])) });
    if (sp === 'fox' || sp === 'hare') {
      // black ear tips
      const tip = P3[2], base = lerp3(P3[0], P3[4], 0.5);
      mark(L, lerp3(base, tip, 0.9), [0.9, 0.9, 0.9], I3, '#1e1614', 0.35);
    }
  }
}

function saddle(rig: Rig, q: Quad, body: Frame, head: Frame) {
  const mid = q.torso[1];
  const top = mid[1] + mid[4] - 0.1;
  const sx = mid[0] + 1.8;
  const S = rig.L('saddle', mat('#4a2c1a', 'hard'), { ao: 0.35, bias: 0.3 });
  const leather = '#4e2e1a';
  ball(S, at(body, [sx, 0, top + 0.2]), [2.5, 2.1, 0.75], body.R, { col: leather });
  ball(S, at(body, [sx + 2.1, 0, top + 0.75]), [0.7, 1.3, 0.8], body.R, { col: '#5a3820' });
  ball(S, at(body, [sx - 2.0, 0, top + 0.8]), [0.6, 1.5, 0.95], body.R, { col: '#5a3820' });
  // girth
  rig.details.push({ k: 'band', owner: 'torso', c: at(body, [sx + 0.9, 0, mid[1] - 0.1]), u: dirIn(body, [0, 1, 0]), v: dirIn(body, [0, 0, 1]), a: mid[3] + 0.05, b: mid[4] + 0.05, w: 0.6, col: '#3a2416' });
  // stirrups
  for (const s of [1, -1]) {
    const a = at(body, [sx, s * (mid[3] + 0.1), top - 0.4]);
    const b = at(body, [sx - 0.2, s * (mid[3] + 0.35), top - 4.4]);
    rig.details.push({ k: 'line', owner: 'torso', pts: [a, b], n: dirIn(body, [0, s, 0]), col: '#2e1c12', w: 0.35 });
    rig.details.push({ k: 'dot', owner: 'torso', p: b, n: dirIn(body, [0, s, 0]), r: 0.5, col: '#9aa0a6' });
  }
  // reins from the bit to the pommel
  const bit = at(head, [3.9, 0, -1.2]);
  const pom = at(body, [sx + 2.1, 0, top + 1.0]);
  rig.details.push({ k: 'line', owner: 'saddle', pts: [bit, lerp3(bit, pom, 0.5), pom], n: null, col: '#2a1a12', w: 0.28 });
}

// ================================================================ birds

function birdScene(look: AnimalLook, col: number, dir: number): Scene {
  const goose = look.species === 'goose';
  const { kind, ph } = colKind(col);
  const rig = new Rig();
  const c = look.coat;
  const white = lum(c) > 0.7;
  const walking = kind === 'walk';
  const s2 = Math.sin(2 * Math.PI * ph);
  let z0 = goose ? 4.3 : 3.9;
  let pitch = goose ? 6 : 12;
  let roll = 0;
  let neckF = 0, headDip = 0;
  let wings = 0; // 0 folded .. 1 spread
  let open = 0;
  const dead = kind === 'dead';
  const low = kind === 'sit' || kind === 'lie';
  if (walking) { z0 += 0.25 * Math.abs(Math.cos(2 * Math.PI * ph)); roll = (goose ? 6 : 3) * s2; neckF = goose ? 0 : 0.6 * Math.sin(4 * Math.PI * ph); }
  if (kind === 'attack') { pitch = goose ? -8 : 20; wings = 1; open = 1; neckF = goose ? 1 : 0.4; headDip = goose ? 1 : 0; }
  if (low) { z0 = goose ? 2.5 : 2.3; }
  if (dead) { z0 = goose ? 2.2 : 2.0; }
  const R = dead ? mm(rotX((dir === 2 ? -90 : 90) * DEG), rotY(-4 * DEG)) : mm(rotX(roll * DEG), rotY(pitch * DEG));
  const body: Frame = { o: [goose ? -0.3 : -0.2, 0, z0], R };
  const B = rig.L('torso', mat(c, 'feather', 0.9, 1.1, 0.5), { ao: 0.25 });
  const back = dirIn(body, [-1, 0, 0.1]);
  const cream = goose ? mix(c, '#fffdf6', 0.4) : lit(c, 0.2);
  if (goose) {
    ball(B, at(body, [0, 0, 0]), [3.6, 2.35, 2.25], R, { flow: back, tuft: true });
    ball(B, at(body, [2.0, 0, 0.35]), [1.9, 2.0, 2.0], R, { flow: back });
    ball(B, at(body, [-3.1, 0, 0.55]), [1.35, 1.2, 0.9], mm(R, rotY(18 * DEG)), { flow: back });
    mark(B, at(body, [0.3, 0, -1.8]), [3.0, 1.9, 1.0], R, mix(c, '#d8d4cc', 0.5), 0.6, dirIn(body, [0, 0, -1]), 0.8);
  } else {
    ball(B, at(body, [0, 0, 0]), [2.9, 2.15, 2.35], R, { flow: back, tuft: true });
    ball(B, at(body, [1.5, 0, 0.3]), [1.7, 1.9, 2.0], R, { flow: back });
    mark(B, at(body, [1.8, 0, -0.3]), [1.4, 1.6, 1.8], R, cream, 0.6, dirIn(body, [1, 0, 0]), 0.6);
  }
  // tail
  const Tl = rig.L('tail', mat(goose ? c : dim(c, 0.15), 'feather', 1.0, 1.0, 0.6), { ao: 0.25 });
  if (goose) {
    ball(Tl, at(body, [-3.7, 0, 0.9]), [1.0, 0.95, 0.6], mm(R, rotY(26 * DEG)), { flow: back, tuft: true });
  } else {
    const Tr = mm(R, rotY(52 * DEG));
    ball(Tl, at(body, [-2.5, 0, 1.5]), [1.1, 1.05, 2.1], Tr, { col: dim(c, 0.08), flow: dirIn(body, [-0.5, 0, 1]), tuft: true });
    for (const s of [0.45, -0.45]) {
      const a = at(body, [-2.3, s, 2.4]);
      const pts: V3[] = [a, at(body, [-3.2, s * 1.3, 4.2]), at(body, [-4.3, s * 1.4, 4.2]), at(body, [-4.7, s * 1.2, 3.0])];
      // sickle feathers: white on a white hen, glossy dark on a coloured one
      Tl.strands.push({ p: pts, w: 1.1, col: white ? '#f2ece2' : '#20303a' });
    }
  }
  // wings
  for (const s of [1, -1]) {
    const W = rig.L('wing' + (s > 0 ? 'L' : 'R'), mat(goose ? mix(c, '#c8c8cc', 0.3) : dim(c, 0.12), 'feather', 1.1, 1.1, 0.5), { ao: 0.3, sided: true });
    if (wings > 0.5) {
      const sh = at(body, [0.9, s * 1.9, 0.9]);
      const G = goose ? 1 : 0.72;
      const pts: V3[] = [sh, at(body, [1.4 * G, s * 3.6 * G, 4.4 * G]), at(body, [-2.4 * G, s * 4.8 * G, 6.2 * G]), at(body, [-5.0 * G, s * 3.2 * G, 2.8 * G]), at(body, [-1.8, s * 2.2, 0.6]), at(body, [0.2, s * 1.9, 0.6])];
      leaf(W, pts, dirIn(body, [0, s, 0.4]), { flow: nrm3(sub(pts[2], pts[0])) });
      for (let f = 0; f < 7; f++) {
        const u = f / 6;
        const root = lerp3(at(body, [0.2, s * 2.6, 2.2]), at(body, [-1.8, s * 2.4, 1.2]), u);
        const tip = lerp3(pts[2], pts[3], u);
        W.strands.push({ p: [root, lerp3(root, tip, 0.6), tip], w: 0.75, col: goose ? (f % 2 ? '#e8e8ea' : '#cfd2d6') : dim(c, 0.3 + (f % 2) * 0.1) });
      }
    } else {
      ball(W, at(body, [-0.4, s * (goose ? 1.95 : 1.75), goose ? 0.45 : 0.35]), [goose ? 2.9 : 2.2, 0.55, goose ? 1.35 : 1.3], mm(R, rotY(-8 * DEG)), { flow: back });
      mark(W, at(body, [-1.6, s * 2.1, 0.0]), [1.6, 0.8, 0.9], R, goose ? '#b8bcc4' : dim(c, 0.35), 0.4, dirIn(body, [0, s, 0]), 0.8);
    }
  }
  // legs
  if (!low) {
    for (const s of [1, -1]) {
      const L = rig.L('leg' + (s > 0 ? 'L' : 'R'), mat(goose ? '#e8902a' : '#e0a838', 'skin'), { ao: 0.2, sided: true });
      const lift = walking ? Math.max(0, Math.sin(2 * Math.PI * (ph + (s > 0 ? 0 : 0.5)))) : 0;
      const sw = walking ? Math.cos(2 * Math.PI * (ph + (s > 0 ? 0 : 0.5))) : 0;
      const hip = at(body, [0.2, s * 0.9, -1.4]);
      let foot: V3 = [0.4 + sw * 0.9, s * 1.0, 0.25 + lift * 0.9];
      if (dead) foot = at(body, [0.8, s * 0.9, -4.2]);
      const knee = lerp3(hip, foot, 0.5);
      knee[0] -= 0.25;
      tube(L, hip, goose ? 0.55 : 0.5, knee, 0.3, { col: dead ? dim(c, 0.1) : c });
      tube(L, knee, 0.26, foot, 0.22);
      const fwd: V3 = dead ? dirIn(body, [0.5, 0, -1]) : [1, 0, 0];
      if (goose) {
        const web = rig.L('foot' + (s > 0 ? 'L' : 'R'), mat('#e8902a', 'skin'), { ao: 0.15, sided: true });
        ball(web, add(foot, scl(fwd, 0.55)), [0.9, 0.7, 0.2], I3);
      } else {
        for (const a of [-35, 0, 35]) {
          const d = mv(rotZ(a * DEG), fwd);
          tube(L, foot, 0.14, add(foot, scl(d, 0.9)), 0.1);
        }
        tube(L, foot, 0.14, add(foot, scl(fwd, -0.6)), 0.1);
      }
    }
  }
  // neck and head
  const neckBase = at(body, [goose ? 2.4 : 1.6, 0, goose ? 1.0 : 1.2]);
  let headP: V3;
  let neckMid: V3;
  if (goose) {
    const f = neckF;
    neckMid = at(body, [3.5 + f * 1.8, 0, 4.2 - f * 2.6]);
    headP = at(body, [3.2 + f * 5.2, 0, 7.4 - f * 6.8 - headDip * 0.5]);
  } else {
    neckMid = at(body, [2.0 + neckF * 0.5, 0, 2.6]);
    headP = at(body, [2.4 + neckF, 0, 4.0 - (kind === 'attack' ? 0.6 : 0)]);
  }
  if (dead) headP = at(body, [goose ? 5.6 : 3.4, 0, goose ? 1.8 : 2.4]);
  if (low && goose) { neckMid = at(body, [3.0, 0, 3.4]); headP = at(body, [2.9, 0, 5.4]); }
  const hPitch = kind === 'attack' && goose ? -10 : goose ? -2 : 4;
  const H: Frame = { o: headP, R: mm(body.R, rotY(hPitch * DEG)) };
  const Nk = rig.L('neck', mat(c, 'feather', 0.8, 1.0, 0.35), { ao: 0.28 });
  tube(Nk, neckBase, goose ? 1.25 : 1.3, neckMid, goose ? 0.85 : 1.05, { flow: nrm3(sub(neckBase, neckMid)) });
  tube(Nk, neckMid, goose ? 0.85 : 1.05, add(headP, dirIn(H, [-0.3, 0, -0.3])), goose ? 0.78 : 0.9, { flow: nrm3(sub(neckMid, headP)) });
  if (!goose && !white) {
    // golden hackles on a brown hen
    mark(Nk, lerp3(neckMid, headP, 0.2), [1.3, 1.2, 1.5], body.R, lit(c, 0.32), 0.55, null, 0.8);
  }
  const Hd = rig.L('head', mat(c, 'feather', 0.6, 1.2, 0), { ao: 0.3 });
  ball(Hd, headP, goose ? [1.25, 0.95, 1.0] : [1.05, 0.9, 1.05], H.R, { flow: dirIn(H, [-1, 0, 0]) });
  const hp = (x: number, y: number, z: number) => at(H, [x, y, z]);
  const hd = (x: number, y: number, z: number) => dirIn(H, [x, y, z]);
  // beak
  const Bk = rig.L('beak', mat(goose ? '#ea8c2a' : '#e8b030', 'hard'), { ao: 0.15 });
  if (goose) {
    tube(Bk, hp(0.9, 0, -0.1), 0.52, hp(2.3, 0, -0.45 - open * 0.1), 0.3);
    ball(Bk, hp(2.3, 0, -0.42 - open * 0.1), [0.28, 0.28, 0.2], H.R, { col: '#3a2a20' });
    if (open) tube(Bk, hp(0.9, 0, -0.35), 0.4, hp(2.0, 0, -1.0), 0.22, { col: '#d87a22' });
    rig.details.push({ k: 'line', owner: 'beak', pts: [hp(0.95, 0, 0.35), hp(0.75, 0, 0.0)], n: null, col: 'rgba(40,30,20,0.6)', w: 0.18 });
  } else {
    tube(Bk, hp(0.8, 0, 0.0), 0.38, hp(1.65, 0, -0.35 - open * 0.1), 0.08);
    if (open) tube(Bk, hp(0.8, 0, -0.25), 0.28, hp(1.45, 0, -0.75), 0.06, { col: '#d89a28' });
    // comb and wattles
    const Cb = rig.L('comb', mat('#c8302a', 'skin'), { ao: 0.2, bias: 0.05 });
    for (const [x, z, r] of [[-0.4, 1.0, 0.42], [0.05, 1.15, 0.5], [0.5, 1.0, 0.45], [0.85, 0.7, 0.35]]) ball(Cb, hp(x, 0, z), [r * 0.8, 0.28, r], H.R, { col: '#d0342c' });
    const Wt = rig.L('wattle', mat('#c8302a', 'skin'), { ao: 0.2 });
    for (const s of [1, -1]) ball(Wt, hp(0.85, s * 0.22, -0.85), [0.3, 0.2, 0.42], H.R, { col: '#c02c28' });
  }
  for (const s of [1, -1]) {
    rig.details.push({ k: 'eye', owner: 'head', p: hp(goose ? 0.45 : 0.35, s * (goose ? 0.72 : 0.68), goose ? 0.25 : 0.2), n: nrm3(hd(0.3, s, 0.15)), fwd: hd(1, 0, 0), r: goose ? 0.26 : 0.27, col: goose ? '#1a1a22' : '#d88a1a', shut: dead, kind: 'bird', skin: c, ignore: ['beak', 'comb', 'wattle'] });
  }
  return { layers: rig.layers, details: rig.details, lying: dead || low ? 1 : 0, ref: at(body, [0, 0, 0]) };
}

// ================================================================ projection to the screen

interface S2 {
  k: 'e' | 'c' | 'l';
  x: number; y: number; rx: number; ry: number; rot: number; // ellipse, or capsule start (rx = start radius)
  x1: number; y1: number; r1: number; // capsule end
  pts: number[]; // leaf: b1, c1, tip, c2, b2, c3
  d: number; col?: string; fx: number; fy: number; tuft: boolean; seed: number;
  inner?: string; innerVis: boolean;
  poly?: number[]; // leaf outline as a polygon, made on first use
}
interface L2 { L: Layer; shapes: S2[]; d: number; far: number; marks: { s: S2; col: string; soft: number; a: number }[]; strands: { pts: number[]; w: number; col: string }[]; c3: V3 }
interface Scene2 { layers: L2[]; details: Detail[]; dir: number; lying: number; box: number[] }

function projEll(dir: number, c: V3, r: V3, R: M3): { x: number; y: number; rx: number; ry: number; rot: number; d: number } {
  const M = mm(VIEWW[dir], R);
  let s00 = 0, s01 = 0, s11 = 0;
  for (let k = 0; k < 3; k++) {
    const wx = M[k] * r[k], wy = M[3 + k] * r[k], wz = M[6 + k] * r[k];
    const bx = wx, by = wy * CK - wz * CC;
    s00 += bx * bx; s01 += bx * by; s11 += by * by;
  }
  const tr = (s00 + s11) / 2, df = (s00 - s11) / 2;
  const qq = Math.sqrt(df * df + s01 * s01);
  const p = proj(dir, c);
  return { x: p.x, y: p.y, rx: Math.sqrt(tr + qq), ry: Math.sqrt(Math.max(1e-4, tr - qq)), rot: 0.5 * Math.atan2(2 * s01, s00 - s11), d: p.d };
}

function flow2(dir: number, c: V3, f: V3): [number, number] {
  const a = proj(dir, c), b = proj(dir, add(c, f));
  return [b.x - a.x, b.y - a.y];
}

function projScene(sc: Scene, dir: number): Scene2 {
  const cam = camVec(dir);
  const camH = nrm3([cam[0], cam[1], 0]);
  const out: L2[] = [];
  for (const L of sc.layers) {
    const shapes: S2[] = [];
    let dmax = -1e9, cx = 0, cy = 0, cz = 0, n = 0;
    const base = hashStr(L.id) % 100000;
    L.prims.forEach((p, i) => {
      const seed = base * 31 + i * 977 + 7;
      if (p.t === 'b') {
        const e = projEll(dir, p.c, p.r, p.R);
        const f = p.flow ? flow2(dir, p.c, p.flow) : [0, 0.3];
        shapes.push({ k: 'e', x: e.x, y: e.y, rx: e.rx, ry: e.ry, rot: e.rot, x1: 0, y1: 0, r1: 0, pts: [], d: e.d, col: p.col, fx: f[0], fy: f[1], tuft: !!p.tuft, seed, innerVis: false });
        dmax = Math.max(dmax, e.d); cx += p.c[0]; cy += p.c[1]; cz += p.c[2]; n++;
      } else if (p.t === 't') {
        const a = proj(dir, p.a), b = proj(dir, p.b);
        const f = p.flow ? flow2(dir, lerp3(p.a, p.b, 0.5), p.flow) : [b.x - a.x, b.y - a.y];
        shapes.push({ k: 'c', x: a.x, y: a.y, rx: p.ra, ry: p.ra, rot: 0, x1: b.x, y1: b.y, r1: p.rb, pts: [], d: (a.d + b.d) / 2, col: p.col, fx: f[0], fy: f[1], tuft: !!p.tuft, seed, innerVis: false });
        dmax = Math.max(dmax, (a.d + b.d) / 2); const m = lerp3(p.a, p.b, 0.5); cx += m[0]; cy += m[1]; cz += m[2]; n++;
      } else {
        const pts: number[] = [];
        let dd = 0;
        for (const q of p.p) { const pp = proj(dir, q); pts.push(pp.x, pp.y); dd += pp.d; }
        dd /= p.p.length;
        const vis = dot3(p.n, cam) > 0.05;
        const f = p.flow ? flow2(dir, p.p[0], p.flow) : [0, 1];
        shapes.push({ k: 'l', x: pts[0], y: pts[1], rx: 0, ry: 0, rot: 0, x1: 0, y1: 0, r1: 0, pts, d: dd, col: p.col, fx: f[0], fy: f[1], tuft: !!p.tuft, seed, inner: p.inner, innerVis: vis });
        const b0 = p.p[0];
        dmax = Math.max(dmax, dd); cx += b0[0]; cy += b0[1]; cz += b0[2]; n++;
      }
    });
    for (const s of L.strands) {
      let dd = -1e9;
      for (const q of s.p) dd = Math.max(dd, proj(dir, q).d);
      dmax = Math.max(dmax, dd);
      cx += s.p[0][0]; cy += s.p[0][1]; cz += s.p[0][2]; n++;
    }
    if (!n) continue;
    const c3: V3 = [cx / n, cy / n, cz / n];
    const marks = L.marks.map((m) => {
      const e = projEll(dir, m.c, m.r, m.R);
      const vis = m.n ? clamp((dot3(m.n, cam) + 0.25) * 2.2, 0, 1) : 1;
      return { s: { k: 'e' as const, x: e.x, y: e.y, rx: e.rx, ry: e.ry, rot: e.rot, x1: 0, y1: 0, r1: 0, pts: [], d: e.d, fx: 0, fy: 0, tuft: false, seed: 0, innerVis: false }, col: m.col, soft: m.soft, a: m.a * vis };
    }).filter((m) => m.a > 0.02);
    const strands = L.strands.map((s) => {
      const pts: number[] = [];
      for (const q of s.p) { const pp = proj(dir, q); pts.push(pp.x, pp.y); }
      return { pts, w: s.w, col: s.col };
    });
    out.push({ L, shapes, d: dmax + L.bias, far: 0, marks, strands, c3 });
  }
  // far-side darkening for limbs and ears
  const ref = sc.ref;
  for (const l of out) {
    if (!l.L.sided) continue;
    const rel = dot3(sub(l.c3, ref), camH);
    l.far = clamp(-rel * 0.16, 0, 0.3);
  }
  out.sort((a, b) => a.d - b.d);
  const box = [1e9, 1e9, -1e9, -1e9];
  for (const l of out) for (const s of l.shapes) {
    const b = boundsS(s);
    box[0] = Math.min(box[0], b[0]); box[1] = Math.min(box[1], b[1]); box[2] = Math.max(box[2], b[2]); box[3] = Math.max(box[3], b[3]);
  }
  return { layers: out, details: sc.details, dir, lying: sc.lying, box };
}

// ---------------------------------------------------------------- 2D shape helpers

function capsulePath(g: Ctx, x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) {
  const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
  if (d + Math.min(r0, r1) <= Math.max(r0, r1) + 1e-3) {
    const big = r0 >= r1;
    g.moveTo(big ? x0 + r0 : x1 + r1, big ? y0 : y1);
    g.arc(big ? x0 : x1, big ? y0 : y1, big ? r0 : r1, 0, Math.PI * 2);
    return;
  }
  const phi = Math.atan2(dy, dx);
  const be = Math.acos(clamp((r0 - r1) / d, -1, 1));
  g.arc(x0, y0, r0, phi + be, phi + Math.PI * 2 - be, false);
  g.arc(x1, y1, r1, phi - be, phi + be, false);
  g.closePath();
}
function pathS(g: Ctx, s: S2) {
  g.beginPath();
  if (s.k === 'e') g.ellipse(s.x, s.y, Math.max(0.01, s.rx), Math.max(0.01, s.ry), s.rot, 0, Math.PI * 2);
  else if (s.k === 'c') capsulePath(g, s.x, s.y, s.rx, s.x1, s.y1, s.r1);
  else {
    const p = s.pts;
    g.moveTo(p[0], p[1]);
    g.quadraticCurveTo(p[2], p[3], p[4], p[5]);
    g.quadraticCurveTo(p[6], p[7], p[8], p[9]);
    g.quadraticCurveTo(p[10], p[11], p[0], p[1]);
    g.closePath();
  }
}
function leafPoly(s: S2): number[] {
  if (s.poly) return s.poly;
  const p = s.pts;
  const m = (a: number, c: number, b: number) => [0.25 * p[a] + 0.5 * p[c] + 0.25 * p[b], 0.25 * p[a + 1] + 0.5 * p[c + 1] + 0.25 * p[b + 1]];
  s.poly = [p[0], p[1], ...m(0, 2, 4), p[4], p[5], ...m(4, 6, 8), p[8], p[9], ...m(8, 10, 0)];
  return s.poly;
}
function inPoly(poly: number[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-9) + xi) inside = !inside;
  }
  return inside;
}
function insideS(s: S2, x: number, y: number, pad = 0): boolean {
  if (s.k === 'e') {
    const c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
    const dx = x - s.x, dy = y - s.y;
    const u = dx * c - dy * sn, v = dx * sn + dy * c;
    const rx = s.rx + pad, ry = s.ry + pad;
    return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1;
  }
  if (s.k === 'c') {
    const dx = s.x1 - s.x, dy = s.y1 - s.y, l2 = dx * dx + dy * dy || 1e-9;
    const t = clamp(((x - s.x) * dx + (y - s.y) * dy) / l2, 0, 1);
    const px = s.x + dx * t, py = s.y + dy * t, r = lerp(s.rx, s.r1, t) + pad;
    return (x - px) ** 2 + (y - py) ** 2 <= r * r;
  }
  return inPoly(leafPoly(s), x, y);
}
function boundsS(s: S2): number[] {
  if (s.k === 'e') {
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const hw = Math.sqrt((s.rx * c) ** 2 + (s.ry * sn) ** 2), hh = Math.sqrt((s.rx * sn) ** 2 + (s.ry * c) ** 2);
    return [s.x - hw, s.y - hh, s.x + hw, s.y + hh];
  }
  if (s.k === 'c') return [Math.min(s.x - s.rx, s.x1 - s.r1), Math.min(s.y - s.rx, s.y1 - s.r1), Math.max(s.x + s.rx, s.x1 + s.r1), Math.max(s.y + s.rx, s.y1 + s.r1)];
  const b = [1e9, 1e9, -1e9, -1e9];
  for (let i = 0; i < s.pts.length; i += 2) { b[0] = Math.min(b[0], s.pts[i]); b[1] = Math.min(b[1], s.pts[i + 1]); b[2] = Math.max(b[2], s.pts[i]); b[3] = Math.max(b[3], s.pts[i + 1]); }
  return b;
}
function areaS(s: S2): number {
  if (s.k === 'e') return Math.PI * s.rx * s.ry;
  if (s.k === 'c') return Math.hypot(s.x1 - s.x, s.y1 - s.y) * (s.rx + s.r1) + Math.PI * ((s.rx + s.r1) / 2) ** 2;
  const p = leafPoly(s);
  let a = 0;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) a += p[j] * p[i + 1] - p[i] * p[j + 1];
  return Math.abs(a) / 2;
}
/** A point inside the shape, from two random numbers (stable per shape). */
function sampleS(s: S2, u: number, v: number): [number, number] {
  if (s.k === 'e') {
    const a = u * Math.PI * 2, r = Math.sqrt(v) * 0.96;
    const lx = Math.cos(a) * r * s.rx, ly = Math.sin(a) * r * s.ry;
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    return [s.x + lx * c - ly * sn, s.y + lx * sn + ly * c];
  }
  if (s.k === 'c') {
    const dx = s.x1 - s.x, dy = s.y1 - s.y, l = Math.hypot(dx, dy) || 1e-6;
    const nx = -dy / l, ny = dx / l;
    const r = lerp(s.rx, s.r1, u);
    const w = (v * 2 - 1) * r * 0.92;
    return [s.x + dx * u + nx * w, s.y + dy * u + ny * w];
  }
  const b = boundsS(s);
  return [lerp(b[0], b[2], u), lerp(b[1], b[3], v)];
}
/** A point on the outline with its outward normal. */
function edgeS(s: S2, u: number, side: number): [number, number, number, number] {
  if (s.k === 'e') {
    const a = u * Math.PI * 2;
    const lx = Math.cos(a) * s.rx, ly = Math.sin(a) * s.ry;
    let nx = Math.cos(a) / s.rx, ny = Math.sin(a) / s.ry;
    const c = Math.cos(s.rot), sn = Math.sin(s.rot);
    const gx = nx * c - ny * sn, gy = nx * sn + ny * c;
    const l = Math.hypot(gx, gy) || 1;
    nx = gx / l; ny = gy / l;
    return [s.x + lx * c - ly * sn, s.y + lx * sn + ly * c, nx, ny];
  }
  if (s.k === 'c') {
    const dx = s.x1 - s.x, dy = s.y1 - s.y, l = Math.hypot(dx, dy) || 1e-6;
    const nx = (-dy / l) * side, ny = (dx / l) * side;
    const r = lerp(s.rx, s.r1, u);
    return [s.x + dx * u + nx * r, s.y + dy * u + ny * r, nx, ny];
  }
  const p = s.pts;
  const t = u;
  // along the front edge b1 -> tip
  const x = (1 - t) * (1 - t) * p[0] + 2 * (1 - t) * t * p[2] + t * t * p[4];
  const y = (1 - t) * (1 - t) * p[1] + 2 * (1 - t) * t * p[3] + t * t * p[5];
  const tx = 2 * (1 - t) * (p[2] - p[0]) + 2 * t * (p[4] - p[2]), ty = 2 * (1 - t) * (p[3] - p[1]) + 2 * t * (p[5] - p[3]);
  const l = Math.hypot(tx, ty) || 1;
  return [x, y, (ty / l) * side, (-tx / l) * side];
}

// ================================================================ painting

interface Cell { c: HTMLCanvasElement; g: Ctx }
const works = new Map<string, Cell>();
/**
 * A cleared scratch canvas at least w x h texels, reused between cells. All
 * of them are CPU-backed: they feed one another (and pixel reads) many times
 * per cell, which would mean GPU round trips otherwise.
 */
function work(name: string, w: number, h: number): Cell {
  let cell = works.get(name);
  if (!cell || cell.c.width < w || cell.c.height < h) {
    const c = newCanvas(Math.max(w, cell?.c.width || 0), Math.max(h, cell?.c.height || 0));
    const g = c.getContext('2d', { willReadFrequently: true }) as Ctx;
    cell = { c, g };
    works.set(name, cell);
  }
  const g = cell.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = 'source-over';
  g.globalAlpha = 1;
  g.imageSmoothingEnabled = true;
  g.clearRect(0, 0, w + 2, h + 2);
  return cell;
}

function coatGrad(g: Ctx, col: string, box: number[]): CanvasGradient {
  const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
  const R = Math.hypot(box[2] - box[0], box[3] - box[1]) / 2;
  const gr = g.createLinearGradient(cx + LX * R, cy + LY * R, cx - LX * R, cy - LY * R);
  // dark coats need a stronger sheen to show their form
  const dk = clamp((0.3 - lumC(col)) / 0.18, 0, 1);
  gr.addColorStop(0, lit(col, 0.34 + dk * 0.18));
  gr.addColorStop(0.42, lit(col, 0.06 + dk * 0.1));
  gr.addColorStop(0.62, col);
  gr.addColorStop(1, dim(col, 0.36 - dk * 0.12));
  return gr;
}

function formShade(g: Ctx, s: S2, col: string, style: FurStyle, gloss: number, k = 1) {
  const hi = lit(col, 0.55), sh = dim(col, 0.62);
  const hard = style === 'hard';
  const ha = (hard ? 0.55 : 0.2 + gloss * 0.12) * k;
  const da = 0.5 * k;
  if (s.k === 'e') {
    g.save();
    g.translate(s.x, s.y);
    g.rotate(s.rot);
    g.scale(Math.max(0.01, s.rx), Math.max(0.01, s.ry));
    const c = Math.cos(-s.rot), sn = Math.sin(-s.rot);
    let ux = (LX * c - LY * sn) / Math.max(0.01, s.rx), uy = (LX * sn + LY * c) / Math.max(0.01, s.ry);
    const l = Math.hypot(ux, uy) || 1;
    ux = (ux / l) * 0.42; uy = (uy / l) * 0.42;
    const gr = g.createRadialGradient(ux, uy, 0, ux * 0.6, uy * 0.6, 1.42);
    gr.addColorStop(0, rgba(hi, ha));
    gr.addColorStop(hard ? 0.16 : 0.3, rgba(hi, hard ? 0.1 : ha * 0.35));
    gr.addColorStop(0.5, rgba(hi, 0));
    gr.addColorStop(0.66, rgba(sh, 0));
    gr.addColorStop(1, rgba(sh, da));
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
    return;
  }
  let x0: number, y0: number, x1: number, y1: number, r: number;
  if (s.k === 'c') { x0 = s.x; y0 = s.y; x1 = s.x1; y1 = s.y1; r = Math.max(s.rx, s.r1); }
  else {
    const p = s.pts;
    x0 = (p[0] + p[8]) / 2; y0 = (p[1] + p[9]) / 2; x1 = p[4]; y1 = p[5];
    r = Math.hypot(p[0] - p[8], p[1] - p[9]) / 2 + 0.3;
  }
  const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1e-6;
  let nx = -dy / l, ny = dx / l;
  if (nx * LX + ny * LY < 0) { nx = -nx; ny = -ny; }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const gr = g.createLinearGradient(mx + nx * r, my + ny * r, mx - nx * r, my - ny * r);
  gr.addColorStop(0, rgba(hi, ha));
  gr.addColorStop(hard ? 0.2 : 0.32, rgba(hi, 0));
  gr.addColorStop(0.55, rgba(sh, 0));
  gr.addColorStop(1, rgba(sh, da));
  g.fillStyle = gr;
  pathS(g, s);
  g.fill();
}

/** One ball-like modelling pass over a whole layer, from its bounding box. */
function massShade(g: Ctx, l: L2, col: string, gloss: number) {
  const b = [1e9, 1e9, -1e9, -1e9];
  for (const s of l.shapes) {
    const q = boundsS(s);
    b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]);
  }
  const hi = lit(col, 0.55), sh = dim(col, 0.62);
  g.save();
  g.translate((b[0] + b[2]) / 2, (b[1] + b[3]) / 2);
  g.scale((b[2] - b[0]) / 2 + 0.3, (b[3] - b[1]) / 2 + 0.3);
  const gr = g.createRadialGradient(-0.3, -0.42, 0, -0.18, -0.25, 1.45);
  gr.addColorStop(0, rgba(hi, 0.26 + gloss * 0.1));
  gr.addColorStop(0.32, rgba(hi, 0.06));
  gr.addColorStop(0.52, rgba(hi, 0));
  gr.addColorStop(0.7, rgba(sh, 0));
  gr.addColorStop(1, rgba(sh, 0.5));
  g.fillStyle = gr;
  g.fillRect(-2, -2, 4, 4);
  g.restore();
}

function paintLayer(g: Ctx, l: L2, box: number[]) {
  const m = l.L.mat;
  for (const s of l.shapes) {
    pathS(g, s);
    g.fillStyle = coatGrad(g, s.col || m.col, box);
    g.fill();
  }
  if (l.strands.length) paintStrands(g, l, box);
  g.globalCompositeOperation = 'source-atop';
  for (const mk of l.marks) {
    const s = mk.s;
    g.save();
    g.globalAlpha = mk.a;
    g.translate(s.x, s.y);
    g.rotate(s.rot);
    g.scale(Math.max(0.01, s.rx), Math.max(0.01, s.ry));
    if (mk.soft > 0) {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1);
      const inner = clamp(1 - mk.soft, 0, 0.95);
      gr.addColorStop(0, mk.col);
      gr.addColorStop(inner, mk.col);
      gr.addColorStop(1, rgba(mk.col, 0));
      g.fillStyle = gr;
    } else g.fillStyle = mk.col;
    g.beginPath();
    g.arc(0, 0, 1, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }
  // markings take the same light as the coat
  if (l.marks.length) {
    const cx = (box[0] + box[2]) / 2, cy = (box[1] + box[3]) / 2;
    const R = Math.hypot(box[2] - box[0], box[3] - box[1]) / 2;
    const gr = g.createLinearGradient(cx + LX * R, cy + LY * R, cx - LX * R, cy - LY * R);
    gr.addColorStop(0, 'rgba(255,244,214,0.16)');
    gr.addColorStop(0.5, 'rgba(255,244,214,0)');
    gr.addColorStop(0.6, 'rgba(10,12,30,0)');
    gr.addColorStop(1, 'rgba(10,12,30,0.18)');
    g.fillStyle = gr;
    for (const mk of l.marks) { pathS(g, mk.s); g.fill(); }
  }
  if (l.L.smooth > 0) massShade(g, l, m.col, m.gloss);
  for (const s of l.shapes) formShade(g, s, s.col || m.col, m.style, m.gloss, l.L.smooth > 0 ? 1 - l.L.smooth : 1);
  // inner ears
  for (const s of l.shapes) {
    if (s.k !== 'l' || !s.inner || !s.innerVis) continue;
    const p = s.pts;
    const cx = (p[0] + p[4] + p[8]) / 3, cy = (p[1] + p[5] + p[9]) / 3;
    const k = 0.62;
    const q = p.map((v, i) => (i % 2 === 0 ? cx + (v - cx) * k : cy + (v - cy) * k));
    // slide the inner shape toward the base
    const bx = (p[0] + p[8]) / 2 - cx, by = (p[1] + p[9]) / 2 - cy;
    for (let i = 0; i < q.length; i += 2) { q[i] += bx * 0.18; q[i + 1] += by * 0.18; }
    const ss: S2 = { ...s, pts: q, poly: undefined };
    pathS(g, ss);
    const gr = g.createLinearGradient((p[0] + p[8]) / 2, (p[1] + p[9]) / 2, p[4], p[5]);
    gr.addColorStop(0, dim(s.inner, 0.45));
    gr.addColorStop(0.6, s.inner);
    gr.addColorStop(1, lit(s.inner, 0.15));
    g.fillStyle = gr;
    g.fill();
  }
  // shade where a limb meets the body
  if (l.L.topShade > 0 && l.shapes.length) {
    const s = l.shapes[0];
    if (s.k === 'c') {
      const gr = g.createLinearGradient(s.x, s.y, s.x1, s.y1);
      gr.addColorStop(0, rgba('#120c10', l.L.topShade));
      gr.addColorStop(0.7, rgba('#120c10', 0));
      g.fillStyle = gr;
      pathS(g, s);
      g.fill();
    }
  }
  if (l.far > 0) {
    g.fillStyle = rgba('#1a1c2a', l.far);
    g.fillRect(-500, -500, 1000, 1000);
  }
  g.globalCompositeOperation = 'source-over';
}

function strandPath(g: Ctx, pts: number[], w0: number, w1: number) {
  const n = pts.length / 2;
  const left: number[] = [], right: number[] = [];
  for (let i = 0; i < n; i++) {
    const i0 = Math.max(0, i - 1), i1 = Math.min(n - 1, i + 1);
    const dx = pts[i1 * 2] - pts[i0 * 2], dy = pts[i1 * 2 + 1] - pts[i0 * 2 + 1];
    const l = Math.hypot(dx, dy) || 1e-6;
    const w = lerp(w0, w1, i / (n - 1)) / 2;
    left.push(pts[i * 2] - (dy / l) * w, pts[i * 2 + 1] + (dx / l) * w);
    right.push(pts[i * 2] + (dy / l) * w, pts[i * 2 + 1] - (dx / l) * w);
  }
  g.beginPath();
  g.moveTo(left[0], left[1]);
  for (let i = 1; i < n; i++) {
    const mx = (left[(i - 1) * 2] + left[i * 2]) / 2, my = (left[(i - 1) * 2 + 1] + left[i * 2 + 1]) / 2;
    g.quadraticCurveTo(left[(i - 1) * 2], left[(i - 1) * 2 + 1], mx, my);
  }
  g.lineTo(left[(n - 1) * 2], left[(n - 1) * 2 + 1]);
  g.lineTo(right[(n - 1) * 2], right[(n - 1) * 2 + 1]);
  for (let i = n - 2; i >= 0; i--) {
    const mx = (right[(i + 1) * 2] + right[i * 2]) / 2, my = (right[(i + 1) * 2 + 1] + right[i * 2 + 1]) / 2;
    g.quadraticCurveTo(right[(i + 1) * 2], right[(i + 1) * 2 + 1], mx, my);
  }
  g.lineTo(right[0], right[1]);
  g.closePath();
}

function paintStrands(g: Ctx, l: L2, box: number[]) {
  for (const s of l.strands) {
    strandPath(g, s.pts, s.w * 1.25, 0.08);
    g.fillStyle = coatGrad(g, s.col, box);
    g.fill();
  }
  for (const s of l.strands) {
    strandPath(g, s.pts, s.w * 0.35, 0.02);
    g.fillStyle = rgba(lit(s.col, 0.5), 0.35);
    g.fill();
  }
}

/**
 * Lays the layer over the cell: first its soft shadow and a thin contour
 * line are cast onto what is already there (so overlapping parts of one
 * colour stay distinct), then the layer itself. Everything happens inside
 * the layer's own rectangle `r` (texels: x, y, w, h).
 */
function composite(fc: Ctx, lay: HTMLCanvasElement, ao: number, line: number, r: number[]) {
  const [x, y, w, h] = r;
  if (w <= 0 || h <= 0) return;
  fc.save();
  fc.setTransform(1, 0, 0, 1, 0, 0);
  fc.imageSmoothingEnabled = true;
  if (ao > 0 || line > 0) {
    // the layer's silhouette in a dark tint
    const S = work('sil', w, h);
    S.g.drawImage(lay, x, y, w, h, 0, 0, w, h);
    S.g.globalCompositeOperation = 'source-in';
    S.g.fillStyle = '#140c08';
    S.g.fillRect(0, 0, w, h);
    fc.globalCompositeOperation = 'source-atop';
    if (ao > 0) {
      // blurred cheaply: shrink 4x and stretch back, offset away from the light
      const T = work('shadow', Math.ceil(w / 4) + 1, Math.ceil(h / 4) + 1);
      T.g.drawImage(S.c, 0, 0, w, h, 0, 0, w / 4, h / 4);
      fc.globalAlpha = ao;
      fc.drawImage(T.c, 0, 0, w / 4, h / 4, x + 0.45 * ART, y + 0.75 * ART, w, h);
    }
    if (line > 0) {
      fc.globalAlpha = line;
      for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) fc.drawImage(S.c, 0, 0, w, h, x + dx, y + dy, w, h);
    }
  }
  fc.globalAlpha = 1;
  fc.globalCompositeOperation = 'source-over';
  fc.drawImage(lay, x, y, w, h, x, y, w, h);
  fc.restore();
}

/** The texel rectangle a layer paints into, padded for its shadow. */
function layerRect(l: L2, ax: number, ay: number, cw: number, ch: number): number[] {
  const b = [1e9, 1e9, -1e9, -1e9];
  for (const s of l.shapes) {
    const q = boundsS(s);
    b[0] = Math.min(b[0], q[0]); b[1] = Math.min(b[1], q[1]); b[2] = Math.max(b[2], q[2]); b[3] = Math.max(b[3], q[3]);
  }
  for (const st of l.strands) for (let i = 0; i < st.pts.length; i += 2) {
    b[0] = Math.min(b[0], st.pts[i] - st.w); b[2] = Math.max(b[2], st.pts[i] + st.w);
    b[1] = Math.min(b[1], st.pts[i + 1] - st.w); b[3] = Math.max(b[3], st.pts[i + 1] + st.w);
  }
  const pad = 8;
  const x0 = clamp(Math.floor((b[0] + ax) * ART) - pad, 0, cw), y0 = clamp(Math.floor((b[1] + ay) * ART) - pad, 0, ch);
  const x1 = clamp(Math.ceil((b[2] + ax) * ART) + pad, 0, cw), y1 = clamp(Math.ceil((b[3] + ay) * ART) + pad, 0, ch);
  return [x0, y0, x1 - x0, y1 - y0];
}

function occluded(layers: L2[], from: number, x: number, y: number, ignore?: string[]): boolean {
  for (let j = from + 1; j < layers.length; j++) {
    const l = layers[j];
    if (ignore && ignore.includes(l.L.id)) continue;
    for (const s of l.shapes) if (insideS(s, x, y)) return true;
  }
  return false;
}

function strokeCol(r: number, g: number, b: number, t: number, alpha: number): string {
  if (t >= 0) return `rgba(${Math.round(r + (255 - r) * t * 0.9)},${Math.round(g + (244 - g) * t * 0.9)},${Math.round(b + (214 - b) * t * 0.8)},${alpha})`;
  const k = 1 + t;
  return `rgba(${Math.round(r * k * 0.94)},${Math.round(g * k * 0.95)},${Math.round(b * k + 16 * -t)},${alpha})`;
}

function furPass(g: Ctx, sc: Scene2, img: ImageData, ax: number, ay: number) {
  const W = img.width, H = img.height, d = img.data;
  const at2 = (x: number, y: number): number => {
    const px = Math.floor((x + ax) * ART), py = Math.floor((y + ay) * ART);
    if (px < 0 || py < 0 || px >= W || py >= H) return -1;
    const i = (py * W + px) * 4;
    return d[i + 3] < 40 ? -1 : i;
  };
  sc.layers.forEach((l, li) => {
    const m = l.L.mat;
    if (m.style === 'hard' || m.style === 'skin') return;
    for (const s of l.shapes) {
      const rng = new RNG(s.seed);
      const area = areaS(s);
      const fl = Math.hypot(s.fx, s.fy) || 1e-6;
      const fdx = s.fx / fl, fdy = s.fy / fl, flen = Math.min(1, fl);
      if (m.style === 'wool') {
        const n = Math.round(area * 1.35);
        for (let k = 0; k < n; k++) {
          const [x, y] = sampleS(s, rng.next(), rng.next());
          const r = 0.55 + rng.next() * 0.45;
          if (occluded(sc.layers, li, x, y)) continue;
          const i = at2(x, y);
          if (i < 0) continue;
          const R = d[i], G = d[i + 1], B = d[i + 2];
          g.fillStyle = strokeCol(R, G, B, -0.22, 0.9);
          g.beginPath(); g.arc(x + 0.12, y + 0.16, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = strokeCol(R, G, B, 0.12 + rng.next() * 0.12, 0.95);
          g.beginPath(); g.arc(x - 0.06, y - 0.08, r * 0.82, 0, Math.PI * 2); g.fill();
          g.fillStyle = strokeCol(R, G, B, 0.42, 0.7);
          g.beginPath(); g.arc(x - r * 0.3, y - r * 0.32, r * 0.32, 0, Math.PI * 2); g.fill();
        }
        // bumpy fleece outline
        const e = Math.round(Math.sqrt(area) * 5);
        for (let k = 0; k < e; k++) {
          const [x, y, nx, ny] = edgeS(s, rng.next(), rng.next() < 0.5 ? 1 : -1);
          const i = at2(x - nx * 0.5, y - ny * 0.5);
          if (i < 0) continue;
          if (occluded(sc.layers, li, x, y)) continue;
          let inOwn = false;
          for (const o of l.shapes) if (o !== s && insideS(o, x + nx * 0.3, y + ny * 0.3)) { inOwn = true; break; }
          if (inOwn) continue;
          const r = 0.55 + rng.next() * 0.35;
          const R = d[i], G = d[i + 1], B = d[i + 2];
          g.fillStyle = strokeCol(R, G, B, 0.05, 1);
          g.beginPath(); g.arc(x - nx * 0.15, y - ny * 0.15, r, 0, Math.PI * 2); g.fill();
          g.fillStyle = strokeCol(R, G, B, 0.3, 0.8);
          g.beginPath(); g.arc(x - nx * 0.15 - r * 0.3, y - ny * 0.15 - r * 0.3, r * 0.4, 0, Math.PI * 2); g.fill();
        }
        continue;
      }
      const dens = m.dens * (m.style === 'short' ? 0.7 : 1);
      const n = m.fur > 0 ? Math.round(area * dens) : 0;
      const cx = s.k === 'c' ? (s.x + s.x1) / 2 : s.k === 'e' ? s.x : (s.pts[0] + s.pts[4]) / 2;
      const cy = s.k === 'c' ? (s.y + s.y1) / 2 : s.k === 'e' ? s.y : (s.pts[1] + s.pts[5]) / 2;
      const rr = s.k === 'e' ? Math.max(s.rx, s.ry) : s.k === 'c' ? Math.max(s.rx, s.r1) * 1.5 : 2;
      for (let k = 0; k < n; k++) {
        const u = rng.next(), v = rng.next(), q1 = rng.next(), q2 = rng.next(), q3 = rng.next();
        const [x, y] = sampleS(s, u, v);
        if (s.k === 'l' && !insideS(s, x, y)) continue;
        if (occluded(sc.layers, li, x, y)) continue;
        const i = at2(x, y);
        if (i < 0) continue;
        let dx = fdx * (0.35 + flen), dy = fdy * (0.35 + flen);
        if (s.k === 'e') { dx += ((x - cx) / rr) * 0.5; dy += ((y - cy) / rr) * 0.5 + 0.25; }
        const dl = Math.hypot(dx, dy) || 1;
        dx /= dl; dy /= dl;
        const ang = Math.atan2(dy, dx) + (q1 - 0.5) * 0.5;
        const L = m.fur * (0.65 + q2 * 0.6) * (m.style === 'short' ? 0.6 : 1);
        const lp = clamp(((x - cx) * LX + (y - cy) * LY) / rr, -1, 1);
        const tone = lp * 0.3 + (q3 - 0.5) * 0.24;
        const wdt = m.style === 'bristle' ? 0.42 : m.style === 'feather' ? 0.55 : m.style === 'short' ? 0.26 : 0.34;
        const col = strokeCol(d[i], d[i + 1], d[i + 2], m.style === 'bristle' ? tone - 0.12 : tone, m.style === 'short' ? 0.5 : 0.78);
        blade(g, x - Math.cos(ang) * L * 0.3, y - Math.sin(ang) * L * 0.3, L, ang, (q1 - 0.5) * 0.5, wdt, col);
      }
      // tufts along the outline
      if (m.tuft > 0 && s.tuft) {
        const per = s.k === 'e' ? Math.PI * (s.rx + s.ry) : 2 * Math.hypot(s.x1 - s.x, s.y1 - s.y) + Math.PI * (s.rx + s.r1);
        const nt = Math.round(per * 1.6);
        for (let k = 0; k < nt; k++) {
          const [x, y, nx, ny] = edgeS(s, rng.next(), rng.next() < 0.5 ? 1 : -1);
          const q1 = rng.next(), q2 = rng.next();
          // tufts grow along the flow and down, not toward the light
          const along = nx * fdx + ny * fdy;
          if (along < -0.2 && ny < 0.3) continue;
          let inOwn = false;
          for (const o of l.shapes) if (o !== s && insideS(o, x + nx * 0.4, y + ny * 0.4)) { inOwn = true; break; }
          if (inOwn) continue;
          if (occluded(sc.layers, li, x - nx * 0.3, y - ny * 0.3)) continue;
          const i = at2(x - nx * 0.45, y - ny * 0.45);
          if (i < 0) continue;
          let dx = nx * 0.4 + fdx * 0.8, dy = ny * 0.4 + fdy * 0.8 + 0.3;
          const dl = Math.hypot(dx, dy) || 1;
          dx /= dl; dy /= dl;
          const ang = Math.atan2(dy, dx) + (q1 - 0.5) * 0.35;
          const L = m.tuft * (0.45 + q2 * 0.5);
          const col = strokeCol(d[i], d[i + 1], d[i + 2], (q1 - 0.55) * 0.25, 1);
          blade(g, x - nx * 0.55, y - ny * 0.55, L + 0.55, ang, (q2 - 0.5) * 0.5, 0.5, col);
        }
      }
    }
  });
}

function eyeShape(g: Ctx, x: number, y: number, rx: number, ry: number, ang: number) {
  g.beginPath();
  g.ellipse(x, y, Math.max(0.02, rx), Math.max(0.02, ry), ang, 0, Math.PI * 2);
}

function detailPass(g: Ctx, sc: Scene2) {
  const dir = sc.dir;
  const cam = camVec(dir);
  const idx = new Map<string, number>();
  sc.layers.forEach((l, i) => idx.set(l.L.id, i));
  const hidden = (owner: string, x: number, y: number, ignore?: string[]) => {
    const i = idx.get(owner);
    if (i === undefined) return false;
    return occluded(sc.layers, i, x, y, ignore);
  };
  for (const dt of sc.details) {
    if (!idx.has(dt.owner)) continue;
    if (dt.k === 'eye') {
      const v = dot3(dt.n, cam);
      if (v < 0.02) continue;
      const p = proj(dir, dt.p);
      if (hidden(dt.owner, p.x, p.y, dt.ignore)) continue;
      const f = flow2(dir, dt.p, dt.fwd);
      const fl = Math.hypot(f[0], f[1]);
      const ang = fl > 0.45 ? Math.atan2(f[1], f[0]) : 0;
      const r = dt.r * (0.72 + 0.28 * Math.min(1, v * 1.4));
      const rx = r * (0.95 + 0.2 * Math.min(1, fl)), ry = r * 0.86;
      // socket
      eyeShape(g, p.x + 0.05, p.y + 0.08, rx * 1.28, ry * 1.25, ang);
      g.fillStyle = rgba(dim(dt.skin, 0.55), dt.kind === 'bird' ? 0.2 : 0.28);
      g.fill();
      if (dt.shut) {
        g.strokeStyle = rgba('#140c08', 0.85);
        g.lineWidth = 0.22;
        g.beginPath();
        const ca = Math.cos(ang), sa = Math.sin(ang);
        g.moveTo(p.x - ca * rx, p.y - sa * rx);
        g.quadraticCurveTo(p.x - sa * ry * 0.6, p.y + ca * ry * 0.6, p.x + ca * rx, p.y + sa * rx);
        g.stroke();
        continue;
      }
      const iris = dt.col;
      const light = lum(iris) > 0.3;
      eyeShape(g, p.x, p.y, rx, ry, ang);
      const gr = g.createRadialGradient(p.x + r * 0.25, p.y + r * 0.35, 0, p.x, p.y, r * 1.05);
      gr.addColorStop(0, lit(iris, light ? 0.3 : 0.45));
      gr.addColorStop(0.55, iris);
      gr.addColorStop(1, dim(iris, 0.7));
      g.fillStyle = gr;
      g.fill();
      if (light || dt.kind === 'wolf' || dt.kind === 'bird' || dt.kind === 'goat') {
        const pr = dt.kind === 'goat' ? 0 : r * (dt.kind === 'bird' ? 0.5 : 0.48);
        if (dt.kind === 'goat') {
          g.fillStyle = '#0a0706';
          g.fillRect(p.x - rx * 0.6, p.y - ry * 0.16, rx * 1.2, ry * 0.32);
        } else {
          g.fillStyle = '#0a0706';
          g.beginPath(); g.arc(p.x + r * 0.04, p.y + r * 0.02, pr, 0, Math.PI * 2); g.fill();
        }
      }
      // dark rim
      eyeShape(g, p.x, p.y, rx, ry, ang);
      g.strokeStyle = rgba('#0c0806', 0.8);
      g.lineWidth = dt.kind === 'wolf' ? 0.2 : 0.14;
      g.stroke();
      // glints
      g.fillStyle = 'rgba(255,255,250,0.95)';
      g.beginPath(); g.arc(p.x - r * 0.3, p.y - r * 0.32, r * (dt.kind === 'dog' ? 0.36 : 0.3), 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,250,0.6)';
      g.beginPath(); g.arc(p.x + r * 0.32, p.y + r * 0.3, r * 0.13, 0, Math.PI * 2); g.fill();
    } else if (dt.k === 'dot') {
      if (dt.n && dot3(dt.n, cam) < 0.05) continue;
      const p = proj(dir, dt.p);
      if (hidden(dt.owner, p.x, p.y, dt.hi ? undefined : dt.ignore)) continue;
      g.fillStyle = dt.col;
      g.beginPath(); g.arc(p.x, p.y, dt.r, 0, Math.PI * 2); g.fill();
      if (!dt.hi && lumC(dt.col) > 0.4) {
        g.fillStyle = 'rgba(255,255,255,0.5)';
        g.beginPath(); g.arc(p.x - dt.r * 0.3, p.y - dt.r * 0.3, dt.r * 0.35, 0, Math.PI * 2); g.fill();
      }
    } else if (dt.k === 'line') {
      if (dt.n && dot3(dt.n, cam) < 0.0) continue;
      const pts = dt.pts.map((q) => proj(dir, q));
      const mid = pts[Math.floor(pts.length / 2)];
      if (hidden(dt.owner, mid.x, mid.y, dt.ignore)) continue;
      g.strokeStyle = dt.col;
      g.lineWidth = dt.w;
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 3) g.quadraticCurveTo(pts[1].x, pts[1].y, pts[2].x, pts[2].y);
      else for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
      g.stroke();
    } else if (dt.k === 'band') {
      const n = 28;
      let prev: P2 | null = null;
      g.lineWidth = dt.w;
      g.lineCap = 'round';
      for (let i = 0; i <= n; i++) {
        const t = (i / n) * Math.PI * 2;
        const off = add(scl(dt.u, Math.cos(t) * dt.a), scl(dt.v, Math.sin(t) * dt.b));
        const nrm = nrm3(off);
        const pt = add(dt.c, off);
        const p = proj(dir, pt);
        const vis = dot3(nrm, cam) > -0.05 && !hidden(dt.owner, p.x, p.y, dt.ignore);
        if (vis && prev) {
          const shadeK = clamp(dot3(nrm, [-0.4, 0.3, 0.85]) * 0.5 + 0.5, 0, 1);
          g.strokeStyle = shadeK > 0.55 ? lit(dt.col, (shadeK - 0.55) * 0.9) : dim(dt.col, (0.55 - shadeK) * 0.9);
          g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(p.x, p.y); g.stroke();
        }
        prev = vis ? p : null;
      }
      if (dt.ring) {
        // tag / ring at the lowest point of the band
        let best: V3 | null = null, bz = 1e9;
        for (let i = 0; i < 16; i++) {
          const t = (i / 16) * Math.PI * 2;
          const o = add(scl(dt.u, Math.cos(t) * dt.a), scl(dt.v, Math.sin(t) * dt.b));
          const pt = add(dt.c, o);
          if (pt[2] < bz) { bz = pt[2]; best = pt; }
        }
        if (best) {
          const nrm = nrm3(sub(best, dt.c));
          const p = proj(dir, best);
          if (dot3(nrm, cam) > -0.2 && !hidden(dt.owner, p.x, p.y + 0.4, dt.ignore)) {
            g.fillStyle = dim(dt.ring, 0.3);
            g.beginPath(); g.arc(p.x + 0.05, p.y + 0.55, 0.42, 0, Math.PI * 2); g.fill();
            g.fillStyle = dt.ring;
            g.beginPath(); g.arc(p.x, p.y + 0.48, 0.34, 0, Math.PI * 2); g.fill();
            g.fillStyle = 'rgba(255,255,240,0.8)';
            g.beginPath(); g.arc(p.x - 0.1, p.y + 0.38, 0.12, 0, Math.PI * 2); g.fill();
          }
        }
      }
    } else if (dt.k === 'teeth') {
      const up = flow2(dir, dt.pts[0], dt.up);
      for (const q of dt.pts) {
        const p = proj(dir, q);
        if (hidden(dt.owner, p.x, p.y, ['jaw', 'mouth', 'tongue', 'muzzle', 'nose'])) continue;
        const l = Math.hypot(up[0], up[1]) || 1;
        const ux = (up[0] / l) * dt.r * 1.6, uy = (up[1] / l) * dt.r * 1.6;
        g.fillStyle = '#f4efe2';
        g.beginPath();
        g.moveTo(p.x - dt.r * 0.5, p.y);
        g.lineTo(p.x + dt.r * 0.5, p.y);
        g.lineTo(p.x + ux * 0.9, p.y + uy * 0.9);
        g.closePath();
        g.fill();
      }
    }
  }
}

/**
 * Finishes a painted cell: warm light along the upper-left edge of the
 * silhouette, fine grain, and a thin dark rim just outside it. Returns the
 * canvas holding the result (cw x ch at the origin).
 */
function finish(A: Cell, cw: number, ch: number, seed: number): HTMLCanvasElement {
  const S = work('edge', cw + 2, ch + 2);
  S.g.drawImage(A.c, 0, 0, cw, ch, 0, 0, cw, ch);
  S.g.globalCompositeOperation = 'source-in';
  S.g.fillStyle = '#fff2d2';
  S.g.fillRect(0, 0, cw, ch);
  S.g.globalCompositeOperation = 'destination-out';
  S.g.drawImage(A.c, 0, 0, cw, ch, 2, 2, cw, ch);
  A.g.setTransform(1, 0, 0, 1, 0, 0);
  A.g.globalCompositeOperation = 'source-atop';
  A.g.globalAlpha = 0.28;
  A.g.drawImage(S.c, 0, 0, cw, ch, 0, 0, cw, ch);
  A.g.globalAlpha = 1;
  A.g.globalCompositeOperation = 'source-over';
  // grain
  const img = A.g.getImageData(0, 0, cw, ch);
  const d = img.data;
  const rng = new RNG(seed);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const n = (rng.next() - 0.5) * 5;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n * 0.8, 0, 255);
  }
  A.g.putImageData(img, 0, 0);
  // rim
  const R = work('rim', cw, ch);
  R.g.drawImage(A.c, 0, 0, cw, ch, 0, 0, cw, ch);
  R.g.globalCompositeOperation = 'source-in';
  R.g.fillStyle = '#140d08';
  R.g.fillRect(0, 0, cw, ch);
  const O = work('out', cw, ch);
  O.g.globalAlpha = 0.5;
  for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]]) O.g.drawImage(R.c, 0, 0, cw, ch, dx, dy, cw, ch);
  O.g.globalAlpha = 1;
  O.g.drawImage(A.c, 0, 0, cw, ch, 0, 0, cw, ch);
  return O.c;
}

// ================================================================ sheets

export interface AnimalSheet {
  canvas: HTMLCanvasElement;
  flash: HTMLCanvasElement;
  /** Cell size in world units. */
  fw: number; fh: number;
}

interface Sheet {
  look: AnimalLook;
  /** painted frames, one small canvas each (index dir * NCOL + col), made on first use */
  cells: (HTMLCanvasElement | null)[];
  flashes: (HTMLCanvasElement | null)[];
  cw: number; ch: number; // cell size in texels
  fw: number; fh: number; // cell size in world units
  ax: number; ay: number; // ground point inside the cell, world units
  lieShadow: number[]; // per column: half-length of a lying body's shadow (0 = none)
  seed: number;
}

const cache = new Map<string, Sheet>();
const isBird = (s: Species) => s === 'chicken' || s === 'goose';

function sceneFor(look: AnimalLook, col: number, dir: number): Scene {
  return isBird(look.species) ? birdScene(look, col, dir) : quadScene(look, col, dir);
}
function paintDir(col: number, dir: number) {
  return col === C_DEAD && (dir === 0 || dir === 3) ? (dir === 0 ? 1 : 2) : dir;
}

function sheetFor(look: AnimalLook): Sheet {
  const key = JSON.stringify(look);
  const hit = cache.get(key);
  if (hit) return hit;
  // measure every pose in every direction to size the cells
  const box = [1e9, 1e9, -1e9, -1e9];
  const lieShadow: number[] = new Array(NCOL).fill(0);
  for (let col = 0; col < NCOL; col++) {
    for (let dir = 0; dir < 4; dir++) {
      const pd = paintDir(col, dir);
      const s2 = projScene(sceneFor(look, col, pd), pd);
      let pad = 0;
      for (const l of s2.layers) pad = Math.max(pad, l.L.mat.tuft + 0.5);
      for (const l of s2.layers) {
        for (const s of l.shapes) {
          const b = boundsS(s);
          box[0] = Math.min(box[0], b[0] - pad); box[1] = Math.min(box[1], b[1] - pad); box[2] = Math.max(box[2], b[2] + pad); box[3] = Math.max(box[3], b[3] + pad);
        }
        for (const st of l.strands) for (let i = 0; i < st.pts.length; i += 2) {
          box[0] = Math.min(box[0], st.pts[i] - 1); box[2] = Math.max(box[2], st.pts[i] + 1);
          box[1] = Math.min(box[1], st.pts[i + 1] - 1); box[3] = Math.max(box[3], st.pts[i + 1] + 1);
        }
      }
      if (s2.lying) lieShadow[col] = Math.max(lieShadow[col], (s2.box[2] - s2.box[0]) / 2);
    }
  }
  const pad = 0.75;
  const cw = Math.ceil((box[2] - box[0] + pad * 2) * ART), ch = Math.ceil((box[3] - box[1] + pad * 2) * ART);
  const sh: Sheet = {
    look, cells: new Array(NCOL * 4).fill(null), flashes: new Array(NCOL * 4).fill(null), cw, ch, fw: cw / ART, fh: ch / ART, ax: -box[0] + pad, ay: -box[1] + pad,
    lieShadow, seed: hashStr(key) % 10007,
  };
  cache.set(key, sh);
  return sh;
}

function paintCell(sh: Sheet, dir: number, col: number) {
  const i = dir * NCOL + col;
  if (sh.cells[i]) return;
  try {
    paintCellNow(sh, dir, col, i);
  } catch (e) {
    // never take the game down over one frame of art: leave it blank
    console.error('animal frame failed to paint', sh.look, dir, col, e);
    sh.cells[i] = newCanvas(sh.cw, sh.ch);
  }
}

function paintCellNow(sh: Sheet, dir: number, col: number, i: number) {
  const pd = paintDir(col, dir);
  const sc = projScene(sceneFor(sh.look, col, pd), pd);
  const { cw, ch, ax, ay } = sh;
  const A = work('cell', cw, ch), B = work('layer', cw, ch);
  const fc = A.g, lg = B.g;
  for (const l of sc.layers) {
    const r = layerRect(l, ax, ay, cw, ch);
    lg.setTransform(1, 0, 0, 1, 0, 0);
    lg.clearRect(r[0], r[1], r[2], r[3]);
    lg.save();
    lg.beginPath();
    lg.rect(r[0], r[1], r[2], r[3]);
    lg.clip();
    lg.setTransform(ART, 0, 0, ART, ax * ART, ay * ART);
    paintLayer(lg, l, sc.box);
    lg.restore();
    composite(fc, B.c, l.L.ao, l.L.line, r);
  }
  const img = fc.getImageData(0, 0, cw, ch);
  fc.setTransform(ART, 0, 0, ART, ax * ART, ay * ART);
  furPass(fc, sc, img, ax, ay);
  detailPass(fc, sc);
  const out = finish(A, cw, ch, sh.seed + i);
  const cell = newCanvas(cw, ch);
  cell.getContext('2d')!.drawImage(out, 0, 0, cw, ch, 0, 0, cw, ch);
  sh.cells[i] = cell;
}

const FLASH = '#fff8ee';

/** The white hit-flash silhouette of a painted cell, made the first time it is needed. */
function flashCell(sh: Sheet, i: number): HTMLCanvasElement | null {
  let f = sh.flashes[i];
  const src = sh.cells[i];
  if (!f && src) {
    f = newCanvas(sh.cw, sh.ch);
    const g = f.getContext('2d')!;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = FLASH;
    g.fillRect(0, 0, sh.cw, sh.ch);
    sh.flashes[i] = f;
  }
  return f;
}

function columnOf(frame: number, phase?: number): number {
  if (phase !== undefined && Number.isFinite(phase) && (frame === AFRAME.IDLE || frame === AFRAME.WALK_A || frame === AFRAME.WALK_B)) {
    const p = ((phase % 1) + 1) % 1;
    return C_WALK + (Math.floor(p * WALK_FRAMES) % WALK_FRAMES);
  }
  switch (frame) {
    case AFRAME.WALK_A: return C_WALK;
    case AFRAME.WALK_B: return C_WALK + WALK_FRAMES / 2;
    case AFRAME.ATTACK: return C_ATTACK;
    case AFRAME.DEAD: return C_DEAD;
    case AFRAME.SIT: return C_SIT;
    case AFRAME.LIE: return C_LIE;
    default: return C_IDLE;
  }
}

/**
 * The complete sheet for a look (every cell painted): rows are directions
 * (down, left, right, up); columns are IDLE, ATTACK, DEAD, SIT, LIE and then
 * the WALK_FRAMES frames of the walk cycle.
 */
export function getAnimalSheet(look: AnimalLook): AnimalSheet {
  const sh = sheetFor(look);
  const canvas = newCanvas(sh.cw * NCOL, sh.ch * 4), flash = newCanvas(sh.cw * NCOL, sh.ch * 4);
  const g = canvas.getContext('2d')!, fg = flash.getContext('2d')!;
  for (let d = 0; d < 4; d++) for (let c = 0; c < NCOL; c++) {
    paintCell(sh, d, c);
    const i = d * NCOL + c;
    g.drawImage(sh.cells[i]!, c * sh.cw, d * sh.ch);
    fg.drawImage(flashCell(sh, i)!, c * sh.cw, d * sh.ch);
  }
  return { canvas, flash, fw: sh.fw, fh: sh.fh };
}

/**
 * Draws an animal standing on the ground point (x, y), in world units.
 * `phase` (optional, 0..1) is the position in the walk cycle: when given
 * with an IDLE or WALK frame the animal is drawn from the smooth
 * WALK_FRAMES-frame cycle instead of the two-step WALK_A / WALK_B.
 */
export function drawAnimal(ctx: CanvasRenderingContext2D, look: AnimalLook, dir: number, frame: number, x: number, y: number, flash = 0, alpha = 1, phase?: number) {
  if (alpha <= 0) return;
  const sh = sheetFor(look);
  const d = clamp(Math.round(dir) || 0, 0, 3);
  const col = columnOf(frame, phase);
  paintCell(sh, d, col);
  const a0 = ctx.globalAlpha;
  const lie = sh.lieShadow[col];
  if (lie > 0) {
    // lying bodies get a soft shadow of their own (standing ones use the actor's)
    const rx = lie * (d === 0 || d === 3 ? (col === C_DEAD ? 0.95 : 0.6) : 0.95), ry = Math.min(4, 1.2 + lie * 0.22);
    const gr = ctx.createRadialGradient(x, y, 0, x, y, rx);
    gr.addColorStop(0, 'rgba(12,8,6,0.34)');
    gr.addColorStop(1, 'rgba(12,8,6,0)');
    ctx.globalAlpha = a0 * alpha;
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const i = d * NCOL + col;
  ctx.globalAlpha = a0 * alpha;
  ctx.drawImage(sh.cells[i]!, x - sh.ax, y - sh.ay, sh.fw, sh.fh);
  if (flash > 0) {
    ctx.globalAlpha = a0 * Math.min(1, flash) * alpha;
    ctx.drawImage(flashCell(sh, i)!, x - sh.ax, y - sh.ay, sh.fw, sh.fh);
  }
  ctx.globalAlpha = a0;
}

export const ANIMAL_LOOKS: Record<string, AnimalLook> = {
  crumb: { species: 'dog', coat: '#8a5a32', coat2: '#e8dcc8', eye: '#2a1810' },
  guarddog: { species: 'dog', coat: '#3a3230', coat2: '#6a5a4a' },
  wolf: { species: 'wolf', coat: '#6e6a66', coat2: '#b0aaa0' },
  deer: { species: 'deer', coat: '#8a5a34', coat2: '#d8c0a0' },
  stag: { species: 'deer', coat: '#7a4a2a', coat2: '#d0b890', antlers: true },
  boar: { species: 'boar', coat: '#4a3a2e', coat2: '#6a5646' },
  hare: { species: 'hare', coat: '#8a7250', coat2: '#d8ccb4' },
  fox: { species: 'fox', coat: '#c86a2a', coat2: '#f0e6d8' },
  horse_brown: { species: 'horse', coat: '#6b4226', coat2: '#2a1c14' },
  horse_black: { species: 'horse', coat: '#2a2220', coat2: '#141010', saddle: '#6a1a1a' },
  horse_grey: { species: 'horse', coat: '#a8a4a0', coat2: '#e8e4e0', saddle: '#3a5a2a' },
  cow: { species: 'cow', coat: '#8a6a4a', coat2: '#e8e0d0' },
  sheep: { species: 'sheep', coat: '#d8d0c0', coat2: '#b8b0a0' },
  chicken: { species: 'chicken', coat: '#e8e0d0' },
  chicken_brown: { species: 'chicken', coat: '#a8683a' },
  goose: { species: 'goose', coat: '#f0ece4' },
};
