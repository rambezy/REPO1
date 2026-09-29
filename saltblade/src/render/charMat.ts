// The material for people and beasts: vertex colours, with roughness,
// metalness and surface kind per vertex (the 'surf' attribute from skin.ts).
// The shader adds a little grain for each kind (weave for cloth, blotches for
// leather, strands for hair, brushing for metal), worked out from the rest
// pose so it stays on the body as it moves, and road dust on the feet and
// shins, as on everyone in the waste. Glowing parts (Hollow eyes) light up.
// A person seen close has their own copy with their face (face.ts): eyes,
// brows, lips, stubble, lines, scars and paint, drawn per pixel on the skin
// of the head from the 'face' attribute.
import * as THREE from 'three';
import type { Face } from './face';

const NOISE = /* glsl */ `
varying vec3 vSurf;
varying vec3 vRest;
varying vec4 vFace;
uniform float uFaceOn;
uniform vec3 uHairC;
uniform vec4 uEye;
uniform vec3 uIris;
uniform vec4 uBrow;
uniform vec3 uBrowC;
uniform vec4 uMouth;
uniform vec3 uLipC;
uniform vec4 uMisc;
uniform vec3 uPaintC;
uniform vec4 uScar[3];
float sbH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sbN(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sbH(i), sbH(i + vec3(1.0, 0.0, 0.0)), f.x), mix(sbH(i + vec3(0.0, 1.0, 0.0)), sbH(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(sbH(i + vec3(0.0, 0.0, 1.0)), sbH(i + vec3(1.0, 0.0, 1.0)), f.x), mix(sbH(i + vec3(0.0, 1.0, 1.0)), sbH(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float sbSq(float x) { return x * x; }
float sbSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }
float sbGloss = 0.0;
float sbHair = 0.0;
// a height for bumping the normal: folds in cloth, creases in leather, strands of hair
float sbBumpH = 0.0;
float sbBumpA = 0.0;
vec3 sbBump(vec3 pos, vec3 n, float h, float amp) {
  vec3 dpdx = dFdx(pos), dpdy = dFdy(pos);
  float dhx = dFdx(h) * amp, dhy = dFdy(h) * amp;
  vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
  float det = dot(dpdx, r1);
  vec3 g = sign(det) * (dhx * r1 + dhy * r2);
  return normalize(abs(det) * n - g);
}
`;

const PATTERN = /* glsl */ `
{
  float kind = floor(vSurf.z + 0.5);
  vec3 q = vRest;
  float c1 = sbN(q * 13.0);
  float c2 = sbN(q * 47.0 + 7.1);
  float k = 1.0;
  // how big a pixel is here, to fade detail that would only shimmer
  float foot = length(fwidth(q));
  vec2 fwF = fwidth(vFace.xy); // (derivatives outside any branch)
  if (kind < 0.5) k = 0.95 + 0.07 * c1 + 0.03 * c2;
  else if (kind < 1.5) {
    float fold = sbN(vec3(q.x * 26.0, q.y * 4.5, q.z * 26.0)) * 0.75 + sbN(vec3(q.x * 70.0, q.y * 14.0, q.z * 70.0)) * 0.25;
    k = (0.8 + 0.3 * fold) * (0.93 + 0.1 * c2);
    sbBumpH = fold; sbBumpA = 0.012 * (1.0 - smoothstep(0.004, 0.02, foot));
  }
  else if (kind < 2.5) {
    float cr = sbN(q * 36.0 + 3.0) * 0.7 + sbN(q * 110.0) * 0.3;
    k = 0.8 + 0.26 * c1 + 0.07 * c2;
    sbBumpH = cr; sbBumpA = 0.0011 * (1.0 - smoothstep(0.003, 0.012, foot));
  }
  else if (kind < 3.5) {
    k = 0.84 + 0.18 * c1 + 0.08 * sbN(q * vec3(96.0, 9.0, 96.0));
    sbBumpH = sbN(q * 38.0 + 9.0); sbBumpA = 0.002 * (1.0 - smoothstep(0.004, 0.02, foot));
  }
  else if (kind < 4.5) {
    float st = sbN(q * vec3(150.0, 11.0, 150.0));
    k = 0.78 + 0.32 * st;
    sbBumpH = st; sbBumpA = 0.0015 * (1.0 - smoothstep(0.002, 0.008, foot));
  }
  else if (kind < 5.5) k = 0.84 + 0.22 * c1;
  else if (kind < 6.5) k = 0.8 + 0.3 * sbN(q * vec3(70.0, 70.0, 7.0));
  else if (kind < 7.5) k = 0.9 + 0.14 * c1;
  diffuseColor.rgb *= k;
  // the dust of the road gathers on feet and shins
  if (kind < 7.5 && kind != 3.0) {
    float dust = (1.0 - smoothstep(0.06, 0.62, q.y)) * 0.3;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.33, 0.28, 0.21) * (0.85 + 0.3 * c1), dust);
  }
  // the face, on the skin of the head
  if (uFaceOn > 0.5 && vFace.z > 0.5 && kind < 0.5) {
    vec2 f = vFace.xy;
    float dz = vFace.z - 2.0;
    float front = smoothstep(0.25, 0.55, dz);
    float ax = abs(f.x);
    float px = max(fwF.x, fwF.y) * 0.75 + 1e-5;
    vec3 col = diffuseColor.rgb;
    // hollows: eye sockets, beside the nose, under the lower lip
    vec2 so = vec2((ax - uEye.x) / (uEye.z * 1.55), (f.y - uEye.y - 0.0015) / (uEye.w * 3.4));
    col *= 1.0 - 0.2 * exp(-dot(so, so) * 1.4) * front;
    float fold = sbSeg(vec2(ax, f.y), vec2(0.0145, uMouth.x + 0.021), vec2(uMouth.y + 0.005, uMouth.x - 0.007));
    col *= 1.0 - (0.07 + 0.16 * uMisc.y) * exp(-sbSq(fold / 0.0024)) * front;
    // nostrils
    vec2 nd = vec2((ax - 0.0082) / 0.004, (f.y - uMouth.x - 0.0175) / 0.0022);
    col *= 1.0 - 0.45 * exp(-dot(nd, nd) * 1.3) * front;
    // lines with age: across the forehead, and crow's feet
    if (uMisc.y > 0.05) {
      float fh = smoothstep(uEye.y + 0.028, uEye.y + 0.036, f.y) * smoothstep(uEye.y + 0.075, uEye.y + 0.058, f.y) * smoothstep(0.045, 0.02, ax);
      float ln = pow(0.5 + 0.5 * sin(f.y * 1500.0 + sin(f.x * 80.0) * 1.6), 6.0);
      col *= 1.0 - 0.2 * uMisc.y * fh * ln * front;
      vec2 cf = vec2(ax - uEye.x - uEye.z * 1.25, f.y - uEye.y);
      float crow = pow(0.5 + 0.5 * sin(atan(cf.y, cf.x) * 9.0), 5.0) * smoothstep(0.009, 0.003, length(cf)) * step(0.0, cf.x);
      col *= 1.0 - 0.18 * uMisc.y * crow * front;
    }
    // war paint: a band across the eyes
    if (uMisc.w > 0.5) {
      float band = 1.0 - smoothstep(0.0085 - px, 0.0085 + px, abs(f.y - uEye.y - 0.0008));
      col = mix(col, uPaintC, band * 0.9 * smoothstep(-0.3, 0.1, dz));
    }
    // stubble along the jaw, chin and lip
    float lipM = 0.0;
    float mt = ax / uMouth.y;
    if (mt < 1.15) {
      float shp = sqrt(max(0.0, 1.0 - mt * mt));
      float bow = 1.0 - 0.3 * exp(-mt * mt * 50.0);
      float top = uMouth.x + uMouth.z * shp * bow, bot = uMouth.x - uMouth.w * shp;
      lipM = smoothstep(bot - px, bot + px, f.y) * (1.0 - smoothstep(top - px, top + px, f.y)) * front;
    }
    if (uMisc.x > 0.0) {
      float top = uMouth.x + 0.017 + 0.05 * smoothstep(0.03, 0.075, ax);
      float zone = smoothstep(top + 0.004, top - 0.004, f.y) * smoothstep(-0.45, -0.1, dz) * (1.0 - lipM);
      zone *= 1.0 - exp(-sbSq(ax / 0.012)) * smoothstep(uMouth.x + 0.004, uMouth.x + 0.012, f.y) * 0.5;
      float sp = sbN(vec3(f * 2600.0, 3.0));
      col = mix(col, uBrowC * 0.7, zone * uMisc.x * (0.18 + 0.4 * smoothstep(0.45, 0.8, sp)));
    }
    // brows, thick at the inner end and thinning outward
    if (uBrow.y > 0.0) {
      float x0 = uEye.x - uEye.z * 0.95, x1 = uEye.x + uEye.z * 1.22;
      float bt = (ax - x0) / (x1 - x0);
      float btc = clamp(bt, 0.0, 1.0);
      float cy = uEye.y + uBrow.x + uBrow.z * sin(btc * 2.5) - uBrow.w * (1.0 - btc) - 0.002 * btc * btc;
      float th = uBrow.y * mix(1.2, 0.4, btc);
      float bm = (1.0 - smoothstep(th - px, th + px, abs(f.y - cy))) * smoothstep(-0.06, 0.04, bt) * (1.0 - smoothstep(0.9, 1.02, bt));
      bm *= 0.7 + 0.3 * sbN(vec3(f.x * 1400.0, f.y * 420.0, 5.0));
      col = mix(col, uBrowC, bm * 0.9 * front);
    }
    // lips, and the line between them
    col = mix(col, uLipC * (f.y > uMouth.x ? 0.86 : 1.0), lipM);
    float line = (1.0 - smoothstep(0.0, 0.0005 + px, abs(f.y - uMouth.x))) * smoothstep(1.08, 0.75, mt);
    col *= 1.0 - 0.6 * line * front;
    col *= 1.0 - 0.14 * exp(-sbSq((f.y - uMouth.x + uMouth.w + 0.003) / 0.0028)) * smoothstep(1.1, 0.5, mt) * front;
    // eyes: an almond opening, white, iris and pupil, the lash line above
    vec2 e = vec2((ax - uEye.x) / uEye.z, (f.y - uEye.y) / uEye.w);
    float ex2 = clamp(1.0 - e.x * e.x, 0.0, 1.0);
    float tilt = 0.22 * e.x;
    float lidU = sqrt(ex2) * 1.0 + tilt, lidL = -sqrt(ex2) * 0.72 + tilt * 0.5;
    float edge = px / uEye.w;
    float inside = smoothstep(lidL - edge, lidL + edge, e.y) * (1.0 - smoothstep(lidU - edge, lidU + edge, e.y)) * (1.0 - smoothstep(1.0 - edge, 1.0, abs(e.x))) * front;
    if (inside > 0.0) {
      float r = length(vec2(ax - uEye.x, f.y - uEye.y + uEye.w * 0.08));
      float ri = uEye.w * 1.08;
      vec3 white = vec3(0.52, 0.48, 0.43) * (0.7 + 0.3 * ex2);
      float im = 1.0 - smoothstep(ri - px, ri + px, r);
      float pm = 1.0 - smoothstep(ri * 0.42 - px, ri * 0.42 + px, r);
      vec3 ir = uIris * (0.65 + 0.6 * smoothstep(ri, ri * 0.5, r)) * (0.85 + 0.3 * sbN(vec3(atan(f.y - uEye.y, ax - uEye.x) * 6.0, r * 3000.0, 1.0)));
      vec3 ec = mix(white, ir, im);
      ec = mix(ec, vec3(0.008), pm);
      if (uMisc.z > 0.5) ec = vec3(0.012);
      ec *= 0.5 + 0.5 * smoothstep(lidU + 0.1, lidU - 0.8, e.y);
      col = mix(col, ec, inside);
      sbGloss = inside;
    }
    float lash = (1.0 - smoothstep(0.0, 0.3 + edge, abs(e.y - lidU - 0.1))) * smoothstep(1.2, 0.8, abs(e.x) - 0.1 * step(0.0, e.x)) * front;
    col = mix(col, vec3(0.02, 0.016, 0.014), lash * 0.85);
    float lower = (1.0 - smoothstep(0.0, 0.25 + edge, abs(e.y - lidL + 0.12))) * smoothstep(1.0, 0.6, abs(e.x)) * front;
    col *= 1.0 - 0.3 * lower;
    float crease = (1.0 - smoothstep(0.0, 0.35 + edge, abs(e.y - lidU - 0.95))) * smoothstep(1.0, 0.5, abs(e.x)) * front;
    col *= 1.0 - 0.14 * crease;
    // scars
    for (int i = 0; i < 3; i++) {
      vec4 sc = uScar[i];
      if (sc.w <= 0.0) continue;
      vec2 dir = vec2(cos(sc.z), sin(sc.z));
      vec2 qq = f - sc.xy;
      float along = dot(qq, dir), across = abs(dot(qq, vec2(-dir.y, dir.x)));
      float m = (1.0 - smoothstep(sc.w * 0.7, sc.w, abs(along))) * (1.0 - smoothstep(0.0007, 0.0012 + px, across)) * smoothstep(0.1, 0.4, dz);
      col = mix(col, col * vec3(1.12, 0.74, 0.72), m);
    }
    // hair on the scalp and the beard, with a ragged edge
    if (vFace.w > 0.01) {
      float n = sbN(vRest * vec3(420.0, 90.0, 420.0));
      float hm = smoothstep(0.4, 0.6, vFace.w + (n - 0.5) * 0.45);
      vec3 hc = uHairC * (0.68 + 0.45 * sbN(vRest * vec3(320.0, 26.0, 320.0)));
      col = mix(col, hc, hm);
      sbHair = hm;
      sbBumpH = mix(sbBumpH, sbN(vRest * vec3(320.0, 26.0, 320.0)), hm); sbBumpA = max(sbBumpA, 0.0012 * hm * (1.0 - smoothstep(0.002, 0.008, foot)));
    }
    diffuseColor.rgb = col;
  }
}
`;

function uniforms(face: Face | null) {
  const v4 = (a?: number[]) => new THREE.Vector4(...((a ?? [0, 0, 0, 0]) as [number, number, number, number]));
  const v3 = (a?: number[]) => new THREE.Vector3(...((a ?? [0, 0, 0]) as [number, number, number]));
  return {
    uFaceOn: { value: face ? 1 : 0 },
    uHairC: { value: v3(face?.hairC) },
    uEye: { value: v4(face?.eye) },
    uIris: { value: v3(face?.iris) },
    uBrow: { value: v4(face?.brow) },
    uBrowC: { value: v3(face?.browC) },
    uMouth: { value: v4(face?.mouth ?? [0, 1, 0, 0]) },
    uLipC: { value: v3(face?.lipC) },
    uMisc: { value: v4(face?.misc) },
    uPaintC: { value: v3(face?.paintC) },
    uScar: { value: [0, 1, 2].map((i) => v4(face?.scars[i])) },
  };
}

function patch(m: THREE.MeshStandardMaterial, face: Face | null) {
  const u = uniforms(face);
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 surf;\nattribute vec4 face;\nvarying vec3 vSurf;\nvarying vec3 vRest;\nvarying vec4 vFace;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = surf;\nvRest = position;\nvFace = face;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + NOISE)
      .replace('#include <color_fragment>', '#include <color_fragment>\n' + PATTERN)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(mix(vSurf.x, 0.74, sbHair), 0.12, sbGloss);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vSurf.y;')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = sbBump(-vViewPosition, normal, sbBumpH, sbBumpA);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vSurf.z > 8.5) totalEmissiveRadiance += diffuseColor.rgb * 2.2;');
  };
  m.customProgramCacheKey = () => 'saltblade-char';
  return m;
}

/** The shared material for skinned bodies (two-sided: coats, hoods and brims are open shells). With a face, a person's own copy. */
export function charMaterial(face: Face | null = null): THREE.MeshStandardMaterial {
  return patch(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide }), face);
}
