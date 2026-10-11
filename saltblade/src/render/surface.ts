// Procedural surfaces, drawn in the fragment shader so buildings, furniture and
// plants read as boards, sheet metal, stone, plaster, tiles, cloth and bark with
// no texture images. Each vertex carries a surface id (the `surf` attribute).
//
// Every surface is the same small pattern with its own settings: courses of
// units (boards, blocks, tiles, sheets) with seams, a tint per unit, a grain
// noise, a broad mottling, a weathering feature (rust, lichen, stains) and one
// special touch (corrugation, rivets, knots, tie holes, spalled plaster...).
// The vertex shader looks the settings up once per vertex and hands them on
// unchanged (flat), so a pixel works out one pattern rather than choosing
// between many: GPUs without real branching (software renderers among them)
// would otherwise pay for every pattern on every pixel. Fine detail fades out
// once it is smaller than a few pixels; far away a cheaper version (SB_LQ)
// shows only what the pattern averages out to.
import * as THREE from 'three';

/** Surface ids for the `surf` vertex attribute. */
export const SURF = {
  plain: 0,
  plank: 1, // upright boards
  siding: 2, // lapped horizontal boards
  corrugated: 3,
  stone: 4, // dressed blocks
  plaster: 5, // adobe and lime wash, cracked and spalled
  tile: 6, // clay roof tiles
  thatch: 7,
  cloth: 8, // canvas and hide
  metal: 9, // riveted plates
  floor: 10, // floor boards
  flag: 11, // flagstones
  earth: 12, // packed earth
  rug: 13,
  wax: 14, // hive comb
  bark: 15,
  rock: 16,
  leaf: 17,
  glass: 18,
  rubble: 19, // rough fieldstone
  bone: 20,
  shingle: 21, // wooden shingles
  cactus: 22,
  soil: 23, // tilled earth
  grass: 24, // blades and leaves of small plants
  concrete: 25, // the Makers' cast panels
  awning: 26, // striped canvas
} as const;
export type SurfId = (typeof SURF)[keyof typeof SURF];

/**
 * A wall surface that knows its inside from its outside: the outside shows
 * `outer`, the face toward the building's centre shows `inner` with a skirting
 * board and a darker band below the dado rail.
 */
export function wallSurf(outer: number, inner: number) {
  return outer + inner * 32;
}

/** Hash, value noise, fbm and cell noise shared by the world's shaders. */
export const NOISE_GLSL = /* glsl */ `
// integer hashes: cheap, and the same on every GPU
float sbH1(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334677u, 3812015801u);
  return float((q.x ^ q.y) * 1597334677u) * 2.3283064e-10;
}
vec2 sbH2(vec2 p) {
  uvec2 q = uvec2(ivec2(floor(p))) * uvec2(1597334677u, 3812015801u);
  uint n = (q.x ^ q.y) * 1597334677u;
  return vec2(float(n), float(n * 747796405u)) * 2.3283064e-10;
}
float sbN(vec2 p) {
  vec2 i = floor(p), f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  uvec2 q = uvec2(ivec2(i)) * uvec2(1597334677u, 3812015801u);
  uvec2 q1 = q + uvec2(1597334677u, 3812015801u);
  vec4 h = vec4(uvec4((q.x ^ q.y), (q1.x ^ q.y), (q.x ^ q1.y), (q1.x ^ q1.y)) * 1597334677u) * 2.3283064e-10;
  return mix(mix(h.x, h.y, u.x), mix(h.z, h.w, u.x), u.y);
}
float sbF(vec2 p) { return sbN(p) * 0.55 + sbN(p * 2.13 + 7.1) * 0.3 + sbN(p * 4.37 - 3.3) * 0.15; }
// cells: x = distance to the nearest point, y = margin to the second nearest (small on edges), z = cell id
vec3 sbCell(vec2 p) {
  vec2 n = floor(p), f = fract(p);
  float d1 = 9.0, d2 = 9.0, id = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + sbH2(n + g) * 0.8 + 0.1 - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = sbH1(n + g + 31.0); } else if (d < d2) { d2 = d; }
  }
  d1 = sqrt(d1); d2 = sqrt(d2);
  return vec3(d1, d2 - d1, id);
}
// a cheap stand-in for sin(x): a parabola each half period (shaders here run on CPUs too)
float sbSin(float x) { float t = fract(x * 0.15915494) * 2.0 - 1.0; return -4.0 * t * (1.0 - abs(t)); }
// how much of a pattern with this period survives at px metres per pixel
float sbAA(float period, float px) { return clamp(period / (px * 3.0) - 0.35, 0.0, 1.0); }
// a dark line of width w at distance d, widened to the pixel and faded to keep its average
float sbLine(float d, float w, float px) { float ww = w + px * 1.5; return (1.0 - smoothstep(0.0, ww, d)) * min(1.0, w * 1.5 / ww); }
// tilts a view-space normal by a height field's screen-space slope (heights in metres)
vec3 sbBump(vec3 pos, vec3 n, float h, float face) {
  vec3 sx = dFdx(pos), sy = dFdy(pos);
  vec2 dh = vec2(dFdx(h), dFdy(h));
  vec3 r1 = cross(sy, n), r2 = cross(n, sx);
  float det = dot(sx, r1) * face;
  vec3 g = sign(det) * (dh.x * r1 + dh.y * r2);
  // thin geometry seen edge-on has no area on screen: keep the normal rather than divide by nothing
  vec3 b = abs(det) * n - g;
  float l = length(b);
  return l > 1e-12 ? b / l : n;
}
`;

/** Special touches, one per surface (see the fragment pass). */
const K = { none: 0, boards: 1, siding: 2, corrugated: 3, tiles: 4, shingles: 5, thatch: 6, rubble: 7, plaster: 8, rock: 9, metal: 10, concrete: 11, rug: 12, wax: 13, glass: 14, awning: 15 } as const;

/** The settings of one surface. Lengths in metres; colours are multipliers of the vertex colour. */
interface SurfSpec {
  /** units along a course (board segments, blocks, tiles, sheets) and the course height; none: no grid */
  unit?: number; course?: number;
  /** units each course is shifted by, and a random shift per course (in units) */
  stagger?: number; rand?: number;
  /** courses run up the surface (upright boards, plate columns) rather than across it */
  swap?: boolean;
  /** units vary in length per course by this fraction */
  jit?: number;
  /** seam width, the colour in the seams, the unit tint spread and how far units stand proud of the seams */
  seam?: number; seamDark?: number; tint?: number; seamH?: number;
  /** grain noise: scale along and across the courses, colour amplitude and height */
  gs?: [number, number]; gAmp?: number; gH?: number;
  /** broad mottling */
  macro?: number;
  /** the weathering feature: threshold, amount, how much it follows vertical streaks rather than blotches, colour */
  fTh?: number; fAmt?: number; fSrc?: number; fCol?: [number, number, number];
  /** the feature colour multiplies the surface's own (lichen, stains) rather than replacing it (rust) */
  fRel?: boolean;
  /** the feature only on faces turned up / gathers along seams / gathers low in each course */
  fUp?: boolean; fSeam?: boolean; fRow?: boolean;
  gloss?: number;
  /** dirt splashed up the foot and streaks below the eaves (buildings only) */
  weather?: boolean;
  /** mapped from the world position (rock, foliage) rather than the surface's own */
  world?: boolean;
  kind?: number;
}

const NONE = 1000; // a "unit" so long there is no grid
const SPECS: SurfSpec[] = [];
SPECS[SURF.plain] = { gs: [2.3, 2.3], gAmp: 0.12, macro: 0.08, weather: true };
SPECS[SURF.plank] = { swap: true, unit: 2.6, course: 0.23, rand: 3, seam: 0.008, seamDark: 0.38, tint: 0.38, seamH: 0.012, gs: [1.3, 17], gAmp: 0.28, gH: 0.003, macro: 0.06, kind: K.boards, weather: true };
SPECS[SURF.siding] = { unit: 3.1, course: 0.21, rand: 3, seam: 0.008, seamDark: 0.45, tint: 0.38, seamH: 0.006, gs: [1.3, 17], gAmp: 0.28, gH: 0.003, macro: 0.06, kind: K.siding, weather: true };
SPECS[SURF.corrugated] = { unit: 0.86, course: 1.9, stagger: 0.5, seam: 0.02, seamDark: 0.7, tint: 0.14, gs: [0.8, 6], gAmp: 0.06, macro: 0.06, fTh: 0.56, fAmt: 0.8, fSrc: 0.5, fCol: [0.3, 0.12, 0.045], fRow: true, gloss: 0.45, kind: K.corrugated, weather: true };
SPECS[SURF.stone] = { unit: 0.875, jit: 0.26, course: 0.42, rand: 2.3, seam: 0.022, seamDark: 0.55, tint: 0.34, seamH: 0.02, gs: [3.1, 3.1], gAmp: 0.25, gH: 0.004, macro: 0.06, weather: true };
SPECS[SURF.plaster] = { gs: [1.3, 1.3], gAmp: 0.07, gH: 0.004, macro: 0.2, kind: K.plaster, weather: true };
SPECS[SURF.tile] = { unit: 0.27, course: 0.24, stagger: 0.5, tint: 0.34, gs: [6, 6], macro: 0.05, fTh: 0.6, fAmt: 0.55, fCol: [0.16, 0.17, 0.09], kind: K.tiles, weather: true };
SPECS[SURF.thatch] = { unit: NONE, course: 0.38, gs: [26, 1.1], gAmp: 0.45, gH: 0.02, macro: 0.3, kind: K.thatch, weather: true };
SPECS[SURF.cloth] = { unit: 1.25, course: NONE, seam: 0.012, seamDark: 0.7, tint: 0.12, gs: [3, 3], gAmp: 0.05, macro: 0.3 };
SPECS[SURF.metal] = { swap: true, unit: 0.9, course: 1.2, stagger: 0.37, seam: 0.006, seamDark: 0.5, tint: 0.3, seamH: 0.006, gs: [1.2, 38], gAmp: 0.15, macro: 0.05, fTh: 0.52, fAmt: 0.5, fCol: [0.26, 0.11, 0.05], fSeam: true, gloss: 0.55, kind: K.metal, weather: true };
SPECS[SURF.floor] = { unit: 2.3, course: 0.19, rand: 3, seam: 0.008, seamDark: 0.38, tint: 0.38, seamH: 0.012, gs: [1.3, 17], gAmp: 0.28, gH: 0.003, macro: 0.06, kind: K.boards };
SPECS[SURF.flag] = { unit: 0.7, jit: 0.28, course: 0.55, rand: 4.3, seam: 0.025, seamDark: 0.5, tint: 0.36, seamH: 0.01, gs: [7, 7], gAmp: 0.04, macro: 0.06 };
SPECS[SURF.earth] = { gs: [7, 7], gAmp: 0.12, gH: 0.004, macro: 0.32 };
SPECS[SURF.rug] = { gs: [3, 3], gAmp: 0.05, macro: 0.25, kind: K.rug };
SPECS[SURF.wax] = { gs: [3, 3], gAmp: 0.25, macro: 0.08, gloss: 0.35, kind: K.wax, weather: true };
SPECS[SURF.bark] = { gs: [16, 1.4], gAmp: 0.5, gH: 0.012, macro: 0.15 };
SPECS[SURF.rock] = { world: true, gs: [0.8, 0.8], gAmp: 0.36, gH: 0.05, macro: 0.1, fTh: 0.55, fAmt: 0.55, fCol: [1.19, 1.31, 0.78], fRel: true, fUp: true, kind: K.rock };
SPECS[SURF.leaf] = { world: true, gs: [1.7, 1.7], gAmp: 0.55, gH: 0.03, fTh: 0.62, fAmt: 0.5, fCol: [1.25, 1.18, 0.7], fRel: true };
SPECS[SURF.glass] = { gloss: 1, kind: K.glass };
SPECS[SURF.rubble] = { unit: 0.445, jit: 0.28, course: 0.3, rand: 4.5, tint: 0.4, gs: [9, 9], macro: 0.06, kind: K.rubble, weather: true };
SPECS[SURF.bone] = { gs: [9, 9], gAmp: 0.16, macro: 0.05 };
SPECS[SURF.shingle] = { unit: 0.23, jit: 0.22, course: 0.3, stagger: 0.37, seam: 0.01, seamDark: 0.5, tint: 0.4, gs: [30, 2], gAmp: 0.2, macro: 0.06, kind: K.shingles, weather: true };
SPECS[SURF.cactus] = { gs: [22, 1.6], gAmp: 0.3, gH: 0.006 };
SPECS[SURF.soil] = { gs: [9.8, 9.8], gAmp: 0.12, gH: 0.004, macro: 0.32 };
SPECS[SURF.grass] = { world: true, gs: [3, 3], gAmp: 0.25 };
SPECS[SURF.concrete] = { unit: 2.4, course: 1.5, seam: 0.012, seamDark: 0.58, tint: 0.22, seamH: 0.008, gs: [6, 6], gAmp: 0.06, macro: 0.2, fTh: 0.5, fAmt: 0.22, fSrc: 1, fCol: [0, 0, 0], fRel: true, kind: K.concrete, weather: true };
SPECS[SURF.awning] = { unit: 1.25, course: NONE, seam: 0.012, seamDark: 0.7, gs: [3, 3], gAmp: 0.05, macro: 0.2, kind: K.awning, weather: true };

/** Six vec4 per surface id, as the vertex shader reads them (see SURFACE_VERT). */
const NP = 6;
const NSURF = 27;
const PARAMS = new Float32Array(NSURF * NP * 4);
for (let id = 0; id < NSURF; id++) {
  const s = SPECS[id] ?? SPECS[SURF.plain];
  const flags = (s.swap ? 1 : 0) + (s.world ? 2 : 0) + (s.weather ? 4 : 0) + (s.fUp ? 8 : 0) + (s.fSeam ? 16 : 0) + (s.fRow ? 32 : 0) + (s.fRel ? 64 : 0);
  const fc = s.fCol ?? [1, 1, 1];
  const v = [
    s.unit ?? NONE, s.course ?? NONE, s.stagger ?? 0, s.rand ?? 0,
    s.seam ?? 0, s.seamDark ?? 1, s.tint ?? 0, s.seamH ?? 0,
    s.gs?.[0] ?? 1, s.gs?.[1] ?? 1, s.gAmp ?? 0, s.gH ?? 0,
    s.fTh ?? 2, s.fAmt ?? 0, s.fSrc ?? 0, s.macro ?? 0,
    fc[0], fc[1], fc[2], s.gloss ?? 0,
    s.kind ?? 0, flags, s.jit ?? 0, 0,
  ];
  PARAMS.set(v, id * NP * 4);
}

// per vertex: the settings for this face (inside or outside of a wall), and where its pattern lies
const SURFACE_VERT = /* glsl */ `
  vSbL = transformed;
  {
    vec3 sn = normalize(objectNormal);
    float sid = floor(surf + 0.5);
    float sIn = floor(sid / 32.0);
    float sOut = sid - sIn * 32.0;
    // the face toward the building's middle shows the inner finish
    float inner = (sIn > 0.5 && dot(sn.xz, transformed.xz) < 0.0 && abs(sn.y) < 0.4) ? 1.0 : 0.0;
    int pi = int(mix(sOut, sIn, inner)) * ${NP};
    vP0 = uSbP[pi]; vP1 = uSbP[pi + 1]; vP2 = uSbP[pi + 2]; vP3 = uSbP[pi + 3]; vP4 = uSbP[pi + 4]; vP5 = uSbP[pi + 5];
    vP5.y += inner * 128.0;
    if (mod(floor(vP5.y * 0.5), 2.0) > 0.5) {
      // rock and foliage: from the world position, on the plane the face most nearly lies in
      vec4 wp = vec4(transformed, 1.0);
      vec3 wn = objectNormal;
      #ifdef USE_INSTANCING
        wp = instanceMatrix * wp;
        wn = mat3(instanceMatrix) * wn;
      #endif
      wp = modelMatrix * wp;
      wn = abs(mat3(modelMatrix) * wn);
      vSbUv = wn.y > max(wn.x, wn.z) * 0.8 ? wp.xz : (wn.x > wn.z ? wp.zy : wp.xy);
    } else if (abs(sn.y) > 0.9) {
      vSbUv = transformed.xz;
    } else {
      // walls and slopes: across the face, and up it (or down the slope)
      vec2 d = normalize(sn.xz + vec2(1e-5, 0.0));
      float a = dot(transformed.xz, vec2(-d.y, d.x));
      vSbUv = abs(sn.y) < 0.4 ? vec2(a, transformed.y) : vec2(a, -dot(transformed.xz, d) / max(abs(sn.y), 0.25));
    }
  }
`;

/**
 * The surface pass for the fragment shader, after vertex colours: works out
 * sbH (bump height) and sbGloss, and changes diffuseColor.
 */
const SURFACE_FRAG = /* glsl */ `
  vec3 sbP = vSbL;
  vec2 sbUv = vSbUv;
  float sbDist = length(vViewPosition);
  float sbH = 0.0, sbGloss = 0.0;
  vec3 sbCol = diffuseColor.rgb;
  // the flags
  float sbFl = vP5.y;
  float fInner = step(127.5, sbFl); sbFl -= fInner * 128.0;
  float fRel = step(63.5, sbFl); sbFl -= fRel * 64.0;
  float fRow = step(31.5, sbFl); sbFl -= fRow * 32.0;
  float fSeam = step(15.5, sbFl); sbFl -= fSeam * 16.0;
  float fUp = step(7.5, sbFl); sbFl -= fUp * 8.0;
  float fWeather = step(3.5, sbFl) * (1.0 - fInner); sbFl -= step(3.5, sbFl) * 4.0;
  sbFl -= step(1.5, sbFl) * 2.0;
  float fSwap = step(0.5, sbFl);
  float sbKind = vP5.x;
  #define SB_K(k) (1.0 - min(abs(sbKind - k), 1.0))
  // how much a face looks up (lichen grows there)
  vec3 sbUpV = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  float sbUpness = dot(normalize(vNormal), sbUpV) * (gl_FrontFacing ? 1.0 : -1.0);
  // broad mottling, and the vertical streaks rain leaves
  float sbV = sbN(sbUv * 0.7);
  // inside faces of walls: the inner finish, skirting and dado
  if (fInner > 0.5) {
    sbCol = mix(sbCol, vec3(0.5, 0.4, 0.28), 0.45);
    float dado = smoothstep(0.98, 1.0, sbP.y) - smoothstep(1.06, 1.08, sbP.y);
    sbCol *= mix(0.72, 1.0, smoothstep(0.95, 1.0, sbP.y)) * (1.0 + 0.25 * dado);
    sbCol *= mix(0.55, 1.0, smoothstep(0.13, 0.15, sbP.y));
    sbH += dado * 0.01 + (1.0 - smoothstep(0.13, 0.15, sbP.y)) * 0.008;
  }
  vec3 sbFCol = mix(vP4.rgb, sbCol * vP4.rgb, fRel);
  #ifdef SB_LQ
    // far away: what the pattern averages out to, and a little variation
    sbCol *= 0.86 + 0.16 * sbV;
    sbCol *= 1.0 - (1.0 - vP1.y) * min(1.0, 2.0 * vP1.x / min(vP0.x, vP0.y));
    sbCol = mix(sbCol, vec3(0.62, 0.55, 0.42), 0.45 * SB_K(15.0));
    sbCol *= 1.0 - 0.4 * SB_K(14.0);
    sbCol = mix(sbCol, sbFCol, vP3.y * 0.35 * smoothstep(vP3.x - 0.25, vP3.x + 0.3, sbV));
  #else
    float sbPx = max(max(fwidth(sbUv.x), fwidth(sbUv.y)), 1e-4);
    float sbS = sbN(vec2(sbUv.x * 2.4, sbUv.y * 0.3 + 3.0));
    // courses of units: u runs along a course, v across them
    vec2 cu = mix(sbUv, sbUv.yx, fSwap);
    float gv = cu.y / vP0.y;
    float row = floor(gv), fy = gv - row;
    float rr = sbH1(vec2(row, 9.0));
    float unitL = vP0.x * (1.0 + vP5.z * (rr - 0.5) * 2.0);
    float gu = cu.x / unitL + row * vP0.z + rr * vP0.w;
    float ui = floor(gu), fx = gu - ui;
    float r = sbH1(vec2(ui, row + 37.0));
    float edge = min(min(fx, 1.0 - fx) * unitL, min(fy, 1.0 - fy) * vP0.y);
    float aa = sbAA(min(vP0.y, unitL), sbPx);
    float seam = sbLine(edge, vP1.x, sbPx);
    #ifdef SB_MID
      // a little further off: coarse grain borrows the mottling, fine grain is too small to see
      float grain = 1.0 / max(vP2.x, vP2.y) > 0.45 ? sbV : 0.5;
    #else
      float grain = sbN(vec2(cu.x * vP2.x + r * 31.0, cu.y * vP2.y + r * 17.0));
    #endif
    float gAA = sbAA(1.0 / max(vP2.x, vP2.y), sbPx);
    sbCol *= mix(1.0, 1.0 + (r - 0.5) * vP1.z, aa);
    sbCol *= 1.0 + (grain - 0.5) * vP2.z * gAA;
    sbCol *= 1.0 + (sbV - 0.5) * vP3.w;
    sbCol *= mix(1.0, vP1.y, seam * aa);
    sbH += (1.0 - seam) * vP1.w * aa + grain * vP2.w * gAA + sbV * 0.006 * vP3.w;
    // the special touches
    {
      #ifndef SB_MID
        // knots in boards
        float kn = (1.0 - smoothstep(0.0, 0.035, length(vec2((fy - 0.5) * vP0.y, (fx - fract(r * 7.0)) * unitL * 0.6)))) * step(0.6, r);
        sbCol *= 1.0 - 0.35 * kn * aa * (SB_K(1.0) + SB_K(2.0));
      #endif
      // lapped siding
      float kS = SB_K(2.0) * aa;
      sbCol *= mix(1.0, 0.75 + 0.3 * fy, kS);
      sbH += fy * 0.012 * kS;
      // corrugation
      #ifndef SB_MID
        float cs = sbSin(cu.x * 57.1) * sbAA(0.11, sbPx) * SB_K(3.0);
        sbCol *= 1.0 + 0.18 * cs;
        sbH += cs * 0.012;
      #endif
      // tiles: rounded across, shadowed under the next course
      float kT = SB_K(4.0) * aa;
      float crown = 4.0 * fx * (1.0 - fx);
      sbCol *= mix(1.0, (0.8 + 0.2 * crown) * mix(1.0, 0.55, smoothstep(0.78, 1.0, fy)), kT);
      sbH += ((1.0 - fy) * 0.03 + crown * 0.018) * kT;
      // shingles: shadowed under the next course
      float kSh = SB_K(5.0) * aa;
      sbCol *= mix(1.0, mix(1.0, 0.6, smoothstep(0.8, 1.0, fy)), kSh);
      sbH += (1.0 - fy) * 0.02 * kSh;
      // thatch courses
      float kTh = SB_K(6.0) * aa;
      sbCol *= mix(1.0, mix(0.62, 1.0, smoothstep(0.0, 0.3, fy)), kTh);
      sbH += (1.0 - fy) * 0.03 * kTh;
      // fieldstone: rounded stones in dark mortar
      float kR = SB_K(7.0) * aa;
      float rd = length(vec2(fx - 0.5, fy - 0.5) * 2.0) + (grain - 0.5) * 0.3;
      float rm = 1.0 - smoothstep(0.78, 1.05, rd);
      sbCol *= mix(1.0, mix(0.42, 1.0, rm), kR);
      sbH += rm * (1.0 - rd * rd * 0.8) * 0.035 * kR;
      // plaster: hairline cracks along a ridge of the grain, and spalls that show the mud brick
      float kP = SB_K(8.0);
      #ifndef SB_MID
        float crack = (1.0 - smoothstep(0.0, 0.035, abs(grain - 0.5))) * smoothstep(0.62, 0.75, sbV) * sbAA(0.15, sbPx) * (kP + 0.45 * SB_K(9.0));
        sbCol *= 1.0 - 0.5 * crack;
        sbH -= crack * 0.006;
      #endif
      float sp = smoothstep(0.78, 0.82, sbV * 0.85 + grain * 0.2) * sbAA(0.4, sbPx) * kP;
      float by = cu.y / 0.11, bx = cu.x / 0.26 + floor(by) * 0.5;
      float bm = smoothstep(0.0, 0.1, min(fract(by), 1.0 - fract(by))) * smoothstep(0.0, 0.06, min(fract(bx), 1.0 - fract(bx)));
      sbCol = mix(sbCol, sbCol * vec3(0.78, 0.62, 0.48) * (0.85 + 0.3 * sbH1(vec2(bx, by))) * mix(0.6, 1.0, bm), sp);
      sbH -= sp * (0.012 - bm * 0.004);
      // rock: strata
      sbCol *= 1.0 + SB_K(9.0) * 0.16 * (0.5 + 0.5 * sbSin(sbP.y * 11.0 + sbV * 6.0) - 0.6);
      #ifndef SB_MID
      // rivets along the plate seams
      float kM = SB_K(10.0) * aa;
      float rv = 1.0 - smoothstep(0.008, 0.014, length(vec2(mod(cu.x + cu.y, 0.16) - 0.08, edge - 0.045)));
      sbCol *= 1.0 + 0.25 * rv * kM;
      sbH += rv * 0.004 * kM;
      #endif
      // rug: bands and a lozenge motif
      float kRg = SB_K(12.0);
      float rb = fract(cu.y * 0.8 + 0.25);
      float band = smoothstep(0.08, 0.12, rb) * (1.0 - smoothstep(0.88, 0.92, rb));
      float dm = abs(fract(cu.x * 1.4) - 0.5) + abs(fract(cu.y * 1.4) - 0.5);
      float motif = smoothstep(0.28, 0.32, dm) * (1.0 - smoothstep(0.48, 0.52, dm));
      sbCol *= mix(1.0, mix(0.62, 1.0, band) * (1.0 + 0.35 * motif * band), kRg);
      #ifndef SB_MID
      // wax comb
      float kW = SB_K(13.0) * sbAA(0.24, sbPx);
      vec2 hq = cu * 4.2, hs = vec2(1.0, 1.732), hh = hs * 0.5;
      vec2 ha = mod(hq, hs) - hh, hb = mod(hq - hh, hs) - hh;
      vec2 hg = abs(dot(ha, ha) < dot(hb, hb) ? ha : hb);
      float rim = smoothstep(0.42, 0.48, max(dot(hg, vec2(0.5, 0.866)), hg.x));
      sbCol *= mix(1.0, mix(0.9, 1.15, rim), kW);
      sbH += rim * 0.01 * kW;
      #endif
      // glass: dark, with streaks of reflected sky
      float gg = cu.y * 0.6 + cu.x * 0.25;
      sbCol = mix(sbCol, sbCol * 0.55 + vec3(0.05, 0.06, 0.07) * (0.6 + 0.6 * fract(gg * 1.7)) * step(0.5, fract(gg * 1.3 + 0.2)), SB_K(14.0));
      // awning stripes
      sbCol = mix(sbCol, vec3(0.62, 0.55, 0.42) * (0.86 + 0.2 * sbV), step(0.5, fract(cu.x / 0.46)) * 0.85 * SB_K(15.0));
      // the feature: rust, lichen, stains
      float fin = mix(sbV, sbS, vP3.z) * 0.8 + grain * 0.2 + fSeam * seam * 0.3 + fRow * (1.0 - fy) * 0.12;
      float fm = smoothstep(vP3.x, vP3.x + 0.3, fin) * vP3.y * mix(1.0, smoothstep(0.45, 0.85, sbUpness), fUp);
      sbCol = mix(sbCol, sbFCol * (0.85 + 0.3 * grain), fm);
      sbGloss = vP4.w * (1.0 - fm);
      #ifndef SB_MID
      // tie holes in cast panels, bleeding rust
      float kC = SB_K(11.0) * aa;
      vec2 tq = vec2(fract(cu.x / 1.2) - 0.5, fract(cu.y / 0.75) - 0.5) * vec2(1.2, 0.75);
      float tie = (1.0 - smoothstep(0.018, 0.03, length(tq))) * kC;
      float bleed = (1.0 - smoothstep(0.0, 0.03, abs(tq.x))) * smoothstep(0.0, 0.3, -tq.y) * step(-0.36, tq.y) * smoothstep(0.45, 0.95, sbS) * kC;
      sbCol = mix(sbCol, vec3(0.3, 0.14, 0.06) * (0.7 + 0.5 * grain), clamp(tie * 0.35 + bleed * 0.45, 0.0, 1.0));
      sbH -= tie * 0.006;
      #endif
    }
  #endif
  #ifdef SB_WEATHER
    // dirt splashed up the foot of the walls, and streaks run down from the eaves
    float foot = 1.0 - smoothstep(-0.3, 0.75 + 0.55 * sbV, sbP.y);
    sbCol = mix(sbCol, sbCol * vec3(0.62, 0.52, 0.4), foot * 0.75 * fWeather);
    #ifndef SB_LQ
      float stk = smoothstep(0.55, 0.92, sbS) * smoothstep(0.6, 2.4, sbP.y) * (1.0 - step(0.5, abs(sbUpness)));
      sbCol *= 1.0 - 0.2 * stk * fWeather;
    #endif
  #endif
  diffuseColor.rgb = sbCol;
  // (the bump is gone by the distance the middle version takes over: see structView)
  sbH *= 1.0 - smoothstep(35.0, 80.0, sbDist);
`;

/** Uniforms every surface material shares (set once a frame). */
export const surfU = {
  uNight: { value: 0 },
  /** lamp brightness inside buildings: a little by day, full at night */
  uLampK: { value: 0.3 },
  uSbP: { value: PARAMS },
};

export interface SurfMatOpts {
  /** buildings: lamp light inside from the `lamp` attribute, and weathering */
  arch?: boolean;
  /** always the cheap distant version, whatever the quality setting */
  far?: boolean;
  /** the middle-distance version: no fine grain, knots, rivets, cracks or bump */
  mid?: boolean;
  side?: THREE.Side;
  /** further shader edits (after the surface pass is in) */
  patch?: (sh: THREE.WebGLProgramParametersWithUniforms) => void;
  key?: string;
}

const made: THREE.Material[] = [];
let lowQuality = false;

/**
 * Notes the quality setting. Nothing is recompiled: on low quality the views
 * put meshes on the far versions of their materials (lodTwin), which are
 * separate materials compiled once.
 */
export function setSurfaceQuality(low: boolean) {
  lowQuality = low;
}
export const surfaceLow = () => lowQuality;
/** Keeps a procedural material for warmSurfaces. */
export function registerSurface<T extends THREE.Material>(m: T): T {
  made.push(m);
  return m;
}

/** A Lambert material with vertex colours and procedural surfaces. */
export function surfaceMaterial(o: SurfMatOpts = {}) {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: o.side ?? THREE.FrontSide });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNight = surfU.uNight;
    sh.uniforms.uLampK = surfU.uLampK;
    sh.uniforms.uSbP = surfU.uSbP;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float surf;
        uniform vec4 uSbP[${NSURF * NP}];
        varying vec3 vSbL;
        varying vec2 vSbUv;
        flat varying vec4 vP0;
        flat varying vec4 vP1;
        flat varying vec4 vP2;
        flat varying vec4 vP3;
        flat varying vec4 vP4;
        flat varying vec4 vP5;
        #ifdef SB_LAMP
          attribute vec4 lamp;
          flat varying vec4 vSbLamp;
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${SURFACE_VERT}
        #ifdef SB_LAMP
          // the room's lamp, where the camera sees it
          vSbLamp = vec4((modelViewMatrix * vec4(lamp.xyz, 1.0)).xyz, lamp.w);
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uNight;
        uniform float uLampK;
        varying vec3 vSbL;
        varying vec2 vSbUv;
        flat varying vec4 vP0;
        flat varying vec4 vP1;
        flat varying vec4 vP2;
        flat varying vec4 vP3;
        flat varying vec4 vP4;
        flat varying vec4 vP5;
        #ifdef SB_LAMP
          flat varying vec4 vSbLamp;
        #endif
        ${NOISE_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        ${SURFACE_FRAG}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        #if !defined(SB_LQ) && !defined(SB_MID)
          normal = sbBump(-vViewPosition, normal, sbH, faceDirection);
        #endif`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #ifdef SB_LAMP
          {
            // lamplight in the room: warm, or cold blue (radius + 1000) in the old places
            float sbCool = step(500.0, vSbLamp.w);
            float sbR = max(vSbLamp.w - sbCool * 1000.0, 1e-3);
            vec3 sbL = vSbLamp.xyz + vViewPosition;
            float sbD = length(sbL);
            float sbA = clamp(1.0 - sbD / sbR, 0.0, 1.0) * step(1.5, vSbLamp.w);
            float sbNL = max(dot(normal, sbL / max(sbD, 0.01)), 0.0);
            vec3 sbLc = mix(vec3(1.0, 0.6, 0.28), vec3(0.45, 0.8, 1.0), sbCool);
            totalEmissiveRadiance += diffuseColor.rgb * sbLc * (sbA * sbA * (0.35 + 0.65 * sbNL) * uLampK);
          }
        #endif`)
      .replace('#include <envmap_fragment>', `#include <envmap_fragment>
        #if NUM_DIR_LIGHTS > 0 && !defined(SB_LQ)
          {
            // a glint of the sun on metal, glass and wax, in shadow where the light is
            vec3 sbLd = directionalLights[0].direction;
            vec3 sbVd = normalize(vViewPosition);
            float sbSp = max(dot(normal, normalize(sbLd + sbVd)), 0.0);
            sbSp *= sbSp; sbSp *= sbSp; sbSp *= sbSp; sbSp *= sbSp; sbSp *= sbSp;
            float sbLit = clamp(dot(reflectedLight.directDiffuse, vec3(0.333)) / max(1e-4, dot(diffuseColor.rgb * directionalLights[0].color, vec3(0.333)) * max(dot(normal, sbLd), 0.0) * RECIPROCAL_PI), 0.0, 1.0);
            outgoingLight += directionalLights[0].color * sbSp * sbGloss * 0.12 * sbLit;
          }
        #endif`);
    o.patch?.(sh);
  };
  mat.defines = { ...(o.arch ? { SB_LAMP: '', SB_WEATHER: '' } : {}), ...(o.far ? { SB_LQ: '' } : {}), ...(o.mid ? { SB_MID: '' } : {}) };
  mat.userData.far = !!o.far;
  mat.customProgramCacheKey = () => 'sbsurf' + (o.arch ? 'A' : 'N') + (o.key ?? '') + (o.far ? 'F' : o.mid ? 'M' : 'H');
  surfOpts.set(mat, o);
  return registerSurface(mat);
}

const surfOpts = new WeakMap<THREE.Material, SurfMatOpts>();
const twins = new WeakMap<THREE.Material, THREE.Material[]>();
/**
 * A surface material's version for a distance: 0 itself, 1 the middle distance
 * (SB_MID), 2 far away (SB_LQ). Anything else comes back unchanged.
 */
export function lodTwin(m: THREE.Material, level: number): THREE.Material {
  const o = surfOpts.get(m);
  if (!o || o.far || o.mid || !level) return m;
  let t = twins.get(m);
  if (!t) twins.set(m, (t = []));
  return (t[level] ??= surfaceMaterial({ ...o, mid: level === 1, far: level === 2 }));
}
/** The cheap distant version of a surface material. */
export const farTwin = (m: THREE.Material) => lodTwin(m, 2);

/**
 * Compiles every version of every procedural material (and any extra ones
 * given) before they are first needed, so moving the camera never waits on a
 * shader. `instanced` names the material keys drawn as instanced meshes.
 */
export function warmSurfaces(gl: THREE.WebGLRenderer, camera: THREE.Camera, scene: THREE.Scene, extra: THREE.Material[] = []) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute([1, 1, 1, 1, 1, 1, 1, 1, 1], 3));
  g.setAttribute('surf', new THREE.Float32BufferAttribute([0, 0, 0], 1));
  const group = new THREE.Group();
  const mats = new Set<THREE.Material>(extra);
  const keyOf = (m: THREE.Material) => String((m as THREE.MeshLambertMaterial).customProgramCacheKey?.() ?? '');
  // (plants are only ever drawn near or far)
  for (const m of [...made]) for (const l of /prop/.test(keyOf(m)) ? [0, 2] : [0, 1, 2]) mats.add(lodTwin(m, l));
  for (const m of mats) {
    const instanced = /cover|prop/.test(keyOf(m));
    let o: THREE.Mesh;
    if (instanced) {
      const im = new THREE.InstancedMesh(g, m, 1);
      im.setColorAt(0, new THREE.Color(1, 1, 1));
      o = im;
    } else o = new THREE.Mesh(g, m);
    o.receiveShadow = true;
    o.frustumCulled = false;
    group.add(o);
  }
  gl.compile(group, camera, scene);
  for (const o of group.children) if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
  g.dispose();
  return mats.size;
}
