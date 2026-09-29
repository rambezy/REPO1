// World and interface sound effects. World sounds are placed relative to the camera:
// quieter, duller and wetter with distance, panned by bearing, rate-limited and voice-capped.
import { mix } from './core';
import { ac, rnd, irnd, pick, clamp, hz, own, collect, gain, filt, pan, nsrc, env, tone, hiss, metal, vox, VOW, horn, creak, whir, pluck, texture } from './synth';
import { key, deg } from './music';

/** The listener: camera target on the ground, zoom distance and yaw. */
export const L = { x: 0, z: 0, dist: 60, yaw: 0 };

type Fx = (o: AudioNode, t: number) => number; // builds a sound into o at t, returns its length
interface Voice { out: GainNode; srcs: AudioScheduledSourceNode[]; end: number; g: number }
const MAX_VOICES = 24, REF = 10;
const voices: Voice[] = [];
const last = new Map<string, number>();
let burstAt = 0, burst = 0; // at most 10 new world sounds per 100 ms, whatever their names
export const voiceCount = () => voices.length;

function click(o: AudioNode, t: number, f: number, pk: number) {
  hiss(o, t, 'bandpass', f, f, 0.0005, 0.012, pk, 3);
  tone(o, t, 'sine', f * 1.3, f * 1.3, 0.0005, 0.02, pk * 0.3);
}
const cut: Fx = (o, t) => {
  hiss(o, t, 'bandpass', rnd(2600, 4200), rnd(1100, 1600), 0.002, rnd(0.07, 0.11), 2.6, 1.4); // the slice
  hiss(o, t + 0.012, 'bandpass', rnd(900, 1300), rnd(280, 420), 0.008, rnd(0.12, 0.2), 1.8, 5); // wet
  tone(o, t, 'sine', rnd(120, 160), 55, 0.002, 0.09, 0.25);
  return 0.3;
};
const coins: Fx = (o, t) => {
  let at = t;
  for (let i = 0, n = irnd(3, 5); i < n; i++, at += rnd(0.03, 0.09)) metal(o, at, rnd(2800, 4200), [1, 1.52, 2.7], rnd(0.12, 0.3), rnd(0.25, 0.5));
  return at - t + 0.3;
};

// name: [level, reverb send, synth]
const W: Record<string, [number, number, Fx]> = {
  clang: [0.45, 0.22, (o, t) => {
    const b = rnd(750, 1400);
    hiss(o, t, 'highpass', 4000, 4000, 0.0005, 0.03, 0.8); // contact
    hiss(o, t + 0.004, 'bandpass', rnd(3000, 4500), rnd(5500, 7500), 0.004, rnd(0.1, 0.22), 0.35, 4); // edges scraping
    tone(o, t, 'triangle', b * 0.5, b * 0.48, 0.001, 0.08, 0.3);
    return metal(o, t, b, [1, 2.76 * rnd(0.97, 1.03), 5.4 * rnd(0.97, 1.03), 8.93, 1.02], rnd(0.45, 0.9), 0.5);
  }],
  cut: [0.75, 0.08, cut],
  blunt: [0.7, 0.06, (o, t) => {
    const f = rnd(110, 160);
    tone(o, t, 'sine', f, f * 0.45, 0.002, rnd(0.12, 0.18), 0.7);
    hiss(o, t, 'lowpass', rnd(1300, 2000), 220, 0.001, 0.07, 2);
    hiss(o, t, 'bandpass', rnd(1400, 2200), 1100, 0.001, 0.025, 1.4, 1.2); // slap
    return 0.25;
  }],
  thud: [0.75, 0.08, (o, t) => {
    tone(o, t, 'sine', rnd(85, 105), 38, 0.004, rnd(0.2, 0.3), 1);
    hiss(o, t, 'lowpass', 700, 110, 0.003, 0.25, 1.6);
    hiss(o, t + 0.02, 'bandpass', 950, 450, 0.02, 0.32, 0.7, 0.8); // dust and gear
    if (Math.random() < 0.6) tone(o, t + rnd(0.08, 0.15), 'sine', 95, 45, 0.003, 0.1, 0.4); // a limb settles
    return 0.5;
  }],
  whiff: [0.4, 0.05, (o, t) => {
    const d = rnd(0.16, 0.28), f = filt('bandpass', 450, rnd(1.2, 2.4)), g = gain(0);
    f.frequency.setValueAtTime(rnd(350, 500), t);
    f.frequency.exponentialRampToValueAtTime(rnd(1400, 2400), t + d * 0.45);
    f.frequency.exponentialRampToValueAtTime(rnd(450, 650), t + d);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(3.2, t + d * 0.45);
    g.gain.linearRampToValueAtTime(0, t + d);
    nsrc(t, d + 0.02).connect(f).connect(g).connect(o);
    return d;
  }],
  sever: [0.8, 0.12, (o, t) => {
    for (let i = 0; i < 4; i++) hiss(o, t + i * rnd(0.008, 0.02), 'bandpass', rnd(1400, 3000), 900, 0.0005, rnd(0.015, 0.035), rnd(2, 3), 2); // crunch
    tone(o, t, 'square', rnd(260, 420), 80, 0.0005, 0.03, 0.2); // snap
    hiss(o, t + 0.03, 'bandpass', 800, 240, 0.02, rnd(0.3, 0.42), 1.6, 5);
    tone(o, t, 'sine', 115, 48, 0.002, 0.16, 0.4);
    cut(o, t + 0.012);
    return 0.55;
  }],
  twang: [0.55, 0.15, (o, t) => {
    pluck(o, t, rnd(40, 47), 1, 'twang');
    tone(o, t, 'triangle', rnd(150, 200), 80, 0.001, 0.12, 0.5); // the limbs snap forward
    hiss(o, t, 'highpass', 3000, 3000, 0.0005, 0.015, 0.7); // trigger
    hiss(o, t + 0.02, 'bandpass', 2600, 1100, 0.01, 0.14, 0.3, 1.5); // the bolt leaves
    return 1;
  }],
  unlock: [0.6, 0.05, (o, t) => {
    click(o, t, rnd(2600, 3400), 0.8);
    click(o, t + rnd(0.06, 0.09), rnd(2000, 2800), 0.7);
    tone(o, t + 0.15, 'triangle', 420, 290, 0.002, 0.07, 0.6); // the bolt slides
    hiss(o, t + 0.15, 'bandpass', 1700, 900, 0.002, 0.05, 0.5, 2);
    return 0.35;
  }],
  gate: [0.65, 0.25, (o, t) => {
    const d = rnd(1.1, 1.7);
    metal(o, t, rnd(1300, 1700), [1, 2.7], 0.25, 0.15); // latch
    creak(o, t + 0.05, d, rnd(30, 48), rnd(450, 750), 3);
    tone(o, t + d, 'sine', 80, 40, 0.004, 0.32, 0.6); // swings to a stop
    hiss(o, t + d, 'lowpass', 700, 150, 0.003, 0.22, 0.6);
    return d + 0.45;
  }],
  mine: [0.5, 0.15, (o, t) => {
    metal(o, t, rnd(1700, 2600), [1, 1.73, 2.61], rnd(0.06, 0.12), 0.6);
    hiss(o, t, 'bandpass', rnd(1400, 2400), 850, 0.001, 0.06, 0.8, 1.2);
    tone(o, t, 'sine', 170, 85, 0.001, 0.05, 0.4);
    for (let i = 0, n = irnd(1, 3); i < n; i++) click(o, t + rnd(0.07, 0.3), rnd(2500, 5000), rnd(0.08, 0.2)); // chips
    return 0.45;
  }],
  build: [0.55, 0.15, (o, t) => {
    const n = irnd(2, 3), gap = rnd(0.28, 0.38);
    for (let i = 0; i < n; i++) {
      const at = t + i * gap * rnd(0.9, 1.1);
      tone(o, at, 'sine', rnd(250, 360), 140, 0.001, 0.08, 0.8);
      hiss(o, at, 'bandpass', rnd(900, 1400), 600, 0.001, 0.04, 0.7, 1.5);
      if (Math.random() < 0.5) metal(o, at, rnd(2200, 3000), [1, 2.4], 0.12, 0.15); // a nail
    }
    return n * gap + 0.25;
  }],
  coin: [0.5, 0.1, coins],
  eat: [0.45, 0.02, (o, t) => {
    const n = irnd(3, 4);
    for (let i = 0; i < n; i++) {
      const at = t + i * rnd(0.16, 0.22);
      hiss(o, at, 'bandpass', rnd(900, 1800), 600, 0.01, rnd(0.05, 0.09), 2.2, 1.4);
      hiss(o, at, 'lowpass', 500, 300, 0.01, 0.06, 1.2);
    }
    return n * 0.22 + 0.1;
  }],
  door: [0.5, 0.15, (o, t) => {
    click(o, t, 2200, 0.5);
    creak(o, t + 0.03, rnd(0.35, 0.6), rnd(60, 110), rnd(700, 1100), 1.8);
    const at = t + rnd(0.45, 0.7);
    tone(o, at, 'sine', 140, 70, 0.002, 0.12, 0.6);
    hiss(o, at, 'lowpass', 900, 200, 0.001, 0.08, 0.7);
    return 0.95;
  }],
  death: [0.6, 0.15, (o, t) => {
    const f = rnd(95, 150), d = rnd(0.7, 1.05);
    vox(o, t, d, f, f * rnd(0.55, 0.7), VOW.ah, VOW.oh, 1, 0.15, 0.12);
    hiss(o, t + d * 0.7, 'lowpass', 900, 300, 0.1, 0.4, 0.15); // the last breath
    return d + 0.45;
  }],
  ko: [0.55, 0.08, (o, t) => {
    const f = rnd(110, 175), d = rnd(0.18, 0.3);
    hiss(o, t, 'bandpass', 1200, 700, 0.005, 0.08, 0.3, 1);
    vox(o, t + 0.03, d, f, f * 0.75, VOW.uh, pick([VOW.uh, VOW.oh]), 1, 0.3, 0.2);
    return d + 0.15;
  }],
  alarm: [0.4, 0.35, (o, t) => {
    const f = rnd(200, 240);
    horn(o, t, f, 0.42, 0.7);
    horn(o, t + 0.5, f * 1.335, 0.62, 0.7);
    return 1.3;
  }],
  craft: [0.5, 0.1, (o, t) => {
    const n = irnd(2, 4);
    for (let i = 0; i < n; i++) hiss(o, t + i * 0.16, 'bandpass', rnd(2500, 4000), rnd(1800, 2500), 0.04, 0.1, 1.2, 2.5); // saw strokes
    const at = t + n * 0.16 + 0.05;
    tone(o, at, 'sine', rnd(500, 700), 350, 0.001, 0.05, 0.6); // a tap
    if (Math.random() < 0.6) metal(o, at + rnd(0.12, 0.25), rnd(1600, 2400), [1, 2.3, 3.6], 0.15, 0.2); // a tool set down
    return n * 0.16 + 0.5;
  }],
  splash: [0.5, 0.12, (o, t) => {
    const f = filt('bandpass', 700, 0.8), e = env(t, 0.02, 2.5, 0.4);
    f.frequency.setValueAtTime(700, t);
    f.frequency.exponentialRampToValueAtTime(rnd(2200, 3000), t + 0.08);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.45);
    nsrc(t, 0.55).connect(f).connect(e).connect(o);
    hiss(o, t, 'lowpass', 400, 150, 0.005, 0.2, 1.2); // the plunge
    for (let i = 0, n = irnd(3, 5); i < n; i++) { const b = rnd(500, 1400); tone(o, t + rnd(0.08, 0.45), 'sine', b, b * 2.2, 0.002, 0.04, rnd(0.2, 0.4)); }
    return 0.6;
  }],
  fire: [0.4, 0.08, (o, t) => {
    const d = rnd(0.8, 1.2), hp = filt('highpass', 1200, 0.7);
    nsrc(t, d + 0.1, texture('crackle')).connect(hp).connect(env(t, 0.05, 1.6, d)).connect(o);
    hiss(o, t, 'lowpass', 500, 300, 0.1, d, 0.6); // the roar
    return d + 0.1;
  }],
  bite: [0.7, 0.06, (o, t) => {
    const f = rnd(140, 260), at = t + rnd(0.18, 0.26);
    vox(o, t, rnd(0.2, 0.3), f, f * 1.2, VOW.ah, VOW.eh, 0.8, 0.8, 0.3); // snarl
    hiss(o, at, 'bandpass', 2500, 1500, 0.0005, 0.03, 0.9, 1.5); // the jaws snap
    tone(o, at, 'sine', 200, 90, 0.001, 0.06, 0.6);
    return 0.45;
  }],
  growl: [0.6, 0.12, (o, t) => {
    const f = rnd(65, 100), d = rnd(0.8, 1.3);
    return vox(o, t, d, f * 0.9, f * 0.8, VOW.oh, VOW.uh, 1, 0.9, 0.35);
  }],
  roar: [0.6, 0.3, (o, t) => {
    const f = rnd(55, 85), d = rnd(1.3, 2);
    vox(o, t, d, f, f * 0.7, VOW.ah, VOW.oh, 1, 0.7, 0.5);
    vox(o, t + 0.02, d, f * 1.51, f * 1.02, VOW.eh, VOW.ah, 0.5, 0.6, 0.2); // a rougher upper throat
    hiss(o, t, 'lowpass', 700, 200, 0.15, d, 0.8, 1, mix!.pink); // breath from the chest
    return d + 0.1;
  }],
  machine: [0.5, 0.15, (o, t) => {
    const d = rnd(0.4, 0.7);
    whir(o, t, d, rnd(140, 220), 0.6);
    hiss(o, t, 'highpass', 3000, 5000, 0.02, 0.15, 0.3); // pneumatics
    metal(o, t + d, rnd(300, 500), [1, 2.9, 4.4], 0.2, 0.5); // clank
    tone(o, t + d, 'sine', 120, 60, 0.001, 0.08, 0.6);
    return d + 0.4;
  }],
  // ---- the old machines
  laser: [0.55, 0.22, (o, t) => {
    // a hard zap: a falling whistle, a buzzing saw under it, a crackle of static
    tone(o, t, 'sine', rnd(2300, 2900), rnd(280, 420), 0.001, 0.24, 0.8);
    tone(o, t, 'sawtooth', rnd(800, 1000), rnd(160, 220), 0.001, 0.2, 0.22);
    hiss(o, t, 'highpass', 5200, 2600, 0.001, 0.12, 0.45);
    return 0.32;
  }],
  sizzle: [0.5, 0.18, (o, t) => {
    // a beam striking home: burning static and a dull thump
    hiss(o, t, 'bandpass', rnd(2600, 3400), 1100, 0.002, rnd(0.3, 0.45), 1.3, 2);
    tone(o, t, 'sine', 190, 60, 0.001, 0.12, 0.5);
    for (let i = 0; i < 5; i++) click(o, t + rnd(0.02, 0.3), rnd(3000, 6000), rnd(0.1, 0.25));
    return 0.5;
  }],
  robothit: [0.5, 0.2, (o, t) => {
    // steel plate struck: a ringing clang and a spray of sparks
    metal(o, t, rnd(520, 820), [1, 2.43, 3.91, 5.3], rnd(0.3, 0.45), 0.75);
    tone(o, t, 'sine', 140, 70, 0.001, 0.08, 0.5);
    for (let i = 0; i < 6; i++) click(o, t + rnd(0.01, 0.22), rnd(3500, 7000), rnd(0.1, 0.3));
    return 0.55;
  }],
  beep: [0.4, 0.15, (o, t) => {
    // a machine's chirps
    let at = t;
    for (let i = 0, n = irnd(2, 4); i < n; i++, at += rnd(0.07, 0.12)) { const f = pick([880, 1175, 1320, 1568, 1760]); tone(o, at, 'square', f, f, 0.002, 0.055, 0.14); }
    return at - t + 0.1;
  }],
  robovoice: [0.55, 0.18, (o, t) => {
    // clipped machine speech: a monotone buzz of syllables, a chirp at the end
    const f = rnd(100, 124);
    const vs = [VOW.ah, VOW.eh, VOW.oh, VOW.oo, VOW.uh];
    let at = t;
    for (let i = 0, n = irnd(4, 7); i < n; i++) {
      const d = rnd(0.07, 0.12);
      vox(o, at, d, f, f, pick(vs), pick(vs), 0.5, 0.75, 0);
      at += d + rnd(0.015, 0.04);
    }
    const c = pick([1320, 1568]);
    tone(o, at, 'square', c, c, 0.002, 0.06, 0.12);
    return at - t + 0.1;
  }],
  powerdown: [0.55, 0.3, (o, t) => {
    // a machine going dark: a sagging whine, a last crackle
    tone(o, t, 'sawtooth', rnd(520, 640), 38, 0.01, 1.1, 0.3);
    tone(o, t, 'sine', rnd(900, 1100), 60, 0.01, 0.9, 0.25);
    hiss(o, t + 0.2, 'bandpass', 2400, 700, 0.01, 0.6, 0.4, 2);
    for (let i = 0; i < 4; i++) click(o, t + rnd(0.05, 0.9), rnd(2500, 5000), rnd(0.1, 0.3));
    return 1.3;
  }],
  bell: [0.5, 0.45, (o, t) => {
    const f = rnd(190, 240);
    for (let k = 0, at = t; k < 2; k++, at += rnd(1.6, 2)) {
      // hum, prime, minor third, fifth, nominal and upper partials of a cast bell
      [[0.5, 5, 0.5], [1, 3.5, 0.6], [1.19, 3, 0.45], [1.5, 2.5, 0.25], [2, 2, 0.6], [2.52, 1.2, 0.2], [3.01, 1, 0.15]].forEach(([r, d, a]) => tone(o, at, 'sine', f * r, f * r, 0.002, d, a * 0.8));
      hiss(o, at, 'bandpass', 3000, 2000, 0.001, 0.03, 0.3, 2);
    }
    return 6.5;
  }],
};

const UI_LEVEL: Record<string, number> = { coin: 0.4, build: 0.6, pause: 0.7, levelup: 0.9 };
const UI: Record<string, Fx> = {
  click: (o, t) => { tone(o, t, 'triangle', 1500, 1000, 0.001, 0.03, 0.35); return hiss(o, t, 'highpass', 5000, 5000, 0.0005, 0.01, 0.1); },
  open: (o, t) => { hiss(o, t, 'bandpass', 500, 2200, 0.06, 0.12, 0.3, 1.5); return pluck(o, t + 0.04, deg(4, key.root + 12), 0.35, 'oud'); },
  close: (o, t) => { hiss(o, t, 'bandpass', 2000, 500, 0.04, 0.1, 0.25, 1.5); return pluck(o, t + 0.02, deg(0, key.root + 12), 0.3, 'oud'); },
  coin: coins,
  error: (o, t) => { tone(o, t, 'triangle', 196, 185, 0.004, 0.09, 0.4); return 0.12 + tone(o, t + 0.12, 'triangle', 147, 139, 0.004, 0.16, 0.4); },
  levelup: (o, t) => {
    [0, 2, 4, 7, 9].forEach((d, i) => pluck(o, t + i * 0.085, deg(d, key.root + 12), 0.45, 'oud'));
    return 0.4 + metal(o, t + 0.4, hz(deg(7, key.root + 24)), [1, 2.01, 3.02], 1.2, 0.15);
  },
  build: (o, t) => { tone(o, t, 'sine', 300, 140, 0.001, 0.1, 0.7); hiss(o, t, 'bandpass', 1200, 700, 0.001, 0.05, 0.6, 1.5); return metal(o, t + 0.02, 2600, [1, 2.4], 0.15, 0.12); },
  notify: (o, t) => { metal(o, t, hz(deg(4, key.root + 24)), [1, 2.01, 3.02], 0.6, 0.2); return 0.12 + metal(o, t + 0.12, hz(deg(7, key.root + 24)), [1, 2.01, 3.02], 0.8, 0.2); },
  pause: (o, t) => { tone(o, t, 'sine', 240, 180, 0.005, 0.18, 0.4); return pluck(o, t, deg(0, key.root), 0.35, 'mute', 0.25); },
};

function prune(now: number) {
  for (let i = voices.length - 1; i >= 0; i--) if (voices[i].end < now) { voices[i].out.disconnect(); voices.splice(i, 1); }
}
/** Silences a voice quickly to make room for a louder one. */
function steal(v: Voice, now: number) {
  v.out.gain.cancelScheduledValues(now);
  v.out.gain.setTargetAtTime(0, now, 0.012);
  for (const s of v.srcs) try { s.stop(now + 0.08); } catch { /* already stopped */ }
  voices.splice(voices.indexOf(v), 1);
}

function play(fx: Fx, g: number, p: number, dry: AudioNode, wet: AudioNode, send: number, cut: number, world: boolean) {
  const now = ac().currentTime;
  prune(now);
  if (world && voices.length >= MAX_VOICES) {
    let q = voices[0];
    for (const v of voices) if (v.g < q.g) q = v;
    if (q.g >= g) return; // everything playing is louder: drop this one
    steal(q, now);
  }
  const out = gain(g), pn = pan(p), head: AudioNode = cut ? out.connect(filt('lowpass', cut, 0.5)) : out;
  head.connect(pn).connect(dry);
  if (send > 0) pn.connect(gain(send)).connect(wet);
  const v: Voice = { out, srcs: [], end: now + 1, g };
  collect(v.srcs);
  try { v.end = now + 0.12 + fx(out, now + 0.01); } catch { v.end = now + 0.5; } finally { collect(null); }
  if (world) voices.push(v);
}

/** A sound at world position (x, z). UI names (e.g. 'click') also work, placed in the world;
 *  unknown names are ignored. */
export function playWorld(name: string, x: number, z: number, vol: number) {
  const m = mix, ui = own(UI, name), def = own(W, name) ?? (ui && ([0.6 * (UI_LEVEL[name] ?? 1), 0.05, ui] as [number, number, Fx]));
  if (!m || !def || m.ctx.state !== 'running') return;
  const now = m.ctx.currentTime;
  if (now - (last.get(name) ?? -1) < 0.03) return;
  const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz), R = 120 + L.dist * 0.5;
  if (!(d < R)) return;
  // heard from a little above and behind the target, the higher the camera the farther
  const h = L.dist * 0.35, eff = Math.hypot(d, h), edge = d < R * 0.6 ? 1 : 1 - Math.pow((d - R * 0.6) / (R * 0.4), 2);
  const v = typeof vol === 'number' && isFinite(vol) ? clamp(vol, 0, 1) : 1;
  const g = def[0] * v * edge * (REF / (REF + 0.6 * Math.max(0, eff - REF))) * rnd(0.9, 1.05);
  if (g < 0.003) return;
  if (now - burstAt > 0.1) { burstAt = now; burst = 0; }
  if (++burst > 10) return;
  last.set(name, now);
  const s = Math.sin(L.yaw), c = Math.cos(L.yaw);
  const p = clamp((dx * c - dz * s) / Math.hypot(d, h + 4), -1, 1) * 0.9;
  const cutoff = eff > 40 ? clamp(24000 * Math.exp(-eff / 170), 1500, 20000) : 0;
  play(def[2], g, p, m.sfx.dry, m.sfx.wet, def[1] + clamp((eff - 10) / 250, 0, 0.45), cutoff, true);
}

export function playUi(name: string) {
  const m = mix, fx = own(UI, name);
  if (!m || !fx || m.ctx.state !== 'running') return;
  const now = m.ctx.currentTime;
  if (now - (last.get('ui:' + name) ?? -1) < 0.03) return;
  last.set('ui:' + name, now);
  play(fx, 0.8 * (UI_LEVEL[name] ?? 1), 0, m.ui, m.sfx.wet, 0.12, 0, false);
}
