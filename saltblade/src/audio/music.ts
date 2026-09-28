// Generative score: drones and a sparse plucked guitar or oud in minor and phrygian
// modes, a bowed sine at night, hand drums in town and taiko in combat. Each mood is a
// layer scheduled a little ahead on the audio clock; moods crossfade.
import { mix } from './core';
import { rnd, irnd, pick, clamp, gain, pluck, lead, drum, hiss, tone, Pad, Pluck } from './synth';

export type Mood = 'explore' | 'combat' | 'town' | 'night' | 'danger' | 'silence';

const MODES = [
  [0, 2, 3, 5, 7, 8, 10], // aeolian
  [0, 1, 4, 5, 7, 8, 10], // phrygian dominant
  [0, 1, 3, 5, 7, 8, 10], // phrygian
  [0, 2, 3, 5, 7, 9, 10], // dorian
  [0, 2, 3, 5, 7, 8, 11], // harmonic minor
];
/** The current key, shared by every mood (and the UI chimes) so changes stay consonant. */
export const key = { root: 50, mode: MODES[0], age: 0 };
/** MIDI note of scale degree d (any integer; 7 is an octave up) above base. */
export function deg(d: number, base = key.root): number {
  const s = key.mode, o = Math.floor(d / s.length);
  return base + s[d - o * s.length] + 12 * o;
}
/** Every few phrases, perhaps move to a related key or another mode. */
function modulate() {
  if (++key.age < 5 || Math.random() > 0.3) return;
  key.age = 0;
  let r = key.root + pick([5, 7, -5, -7, 3, -2]);
  while (r > 53) r -= 12;
  while (r < 45) r += 12;
  key.root = r;
  key.mode = pick(MODES);
}
// chord moves between scale degrees: i, bII, iv, v, VI, VII
const NEXT: Record<number, number[]> = { 0: [5, 3, 6, 1, 4], 1: [0, 0, 6], 3: [0, 4, 5], 4: [0, 5], 5: [3, 6, 0], 6: [0, 5, 3] };
const triad = (c: number, base: number) => [deg(c, base), deg(c + 4, base), deg(c + 2, base + 12)];

type Motif = [number, number][]; // [scale degree, beats]
/** An arched phrase of about `beats` that comes to rest, held, on a chord tone. */
function compose(beats: number, lo: number, hi: number, durs: readonly number[], chord: number): Motif {
  const m: Motif = [], peak = rnd(0.3, 0.7);
  let d = chord + pick([0, 2, 4]), sum = 0;
  while (sum < beats) {
    const b = pick(durs);
    m.push([d, b]);
    sum += b;
    d = clamp(d + pick(sum / beats < peak ? [1, 1, 2, -1, 0, 3] : [-1, -1, -2, 1, 0, -3]), lo, hi);
  }
  return cadence(m, chord);
}
function cadence(m: Motif, chord: number): Motif {
  const last = m[m.length - 1];
  let best = chord;
  for (const o of [-7, 0, 7]) for (const k of [0, 2, 4]) if (Math.abs(chord + k + o - last[0]) < Math.abs(best - last[0])) best = chord + k + o;
  last[0] = best;
  last[1] = Math.max(last[1], 2);
  return m;
}
/** A variation: the motif moved along the scale, or one note bent. */
function vary(m: Motif, chord: number): Motif {
  const v = m.map(([d, b]) => [d, b] as [number, number]), s = pick([-2, -1, 1, 2]);
  if (Math.random() < 0.5) for (const n of v) n[0] += s;
  else v[Math.floor(Math.random() * v.length)][0] += Math.sign(s);
  return cadence(v, chord);
}

interface Style { kind: Pluck; base: number; beat: number; vel: number; grace: number; dyad: number; trem: number }
/** Plays a motif from t with loose timing, grace notes, double stops and tremolo. */
function perform(o: AudioNode, t: number, m: Motif, s: Style): number {
  let at = t;
  m.forEach(([d, b], i) => {
    const n = deg(d, s.base), v = s.vel * (i === 0 ? 1 : rnd(0.62, 0.9)), h = at + rnd(-0.015, 0.015), len = b * s.beat;
    if (i > 0 && Math.random() < s.grace) pluck(o, h - 0.075, deg(d + 1, s.base), v * 0.55, s.kind);
    if (len > s.beat * 1.4 && Math.random() < s.trem) for (let k = 0; k < 6; k++) pluck(o, h + k * 0.075, n, v * (1 - k * 0.1), s.kind);
    else pluck(o, h, n, v, s.kind);
    if (Math.random() < s.dyad) pluck(o, h + 0.012, deg(d - pick([2, 4]), s.base), v * 0.6, s.kind);
    at += len;
  });
  return at - t;
}

const MAQSUM = [2, 1, 0, 1, 2, 0, 1, 0]; // dum / tek over eighth notes
function handDrum(o: AudioNode, t: number, beat: number) {
  for (let i = 0; i < 16; i++) {
    const k = MAQSUM[i % 8], at = t + (i * beat) / 2 + rnd(-0.008, 0.008);
    if (k === 2) drum(o, at, 125, 80, 0.28, 0.22, 0.15, 700);
    else if (k === 1 || Math.random() < 0.12) {
      const v = k ? rnd(0.16, 0.22) : 0.06;
      hiss(o, at, 'bandpass', 3200, 2300, 0.001, 0.045, v, 1.5);
      tone(o, at, 'sine', 640, 480, 0.001, 0.035, v * 0.5);
    }
  }
}
// combat: ostinati in semitones over the root, taiko patterns (3 big, 2 mid, 1 rim)
const OST = [[0, 0, 1, 0, 0, 7, 0, 1], [0, 0, 3, 0, 1, 0, 7, 6], [0, 12, 0, 1, 0, 7, 0, 3]];
const DRUMS = [[3, 0, 0, 2, 0, 0, 2, 0], [3, 0, 2, 0, 3, 0, 1, 1], [3, 0, 0, 2, 3, 0, 2, 2]];
const FILL = [3, 1, 2, 1, 3, 2, 3, 3];

interface Layer {
  mood: Mood;
  pl: GainNode; // leads: dry, reverb and echo
  bed: GainNode; // pads and drums: dry and reverb
  next: number;
  on: boolean;
  off: number;
  stop: (t: number) => void;
  chunk: (t: number) => number; // schedules from t; returns when it wants to be called again
}

const PLAYERS: Record<Exclude<Mood, 'silence'>, (L: Layer, t: number) => void> = {
  // a soft pad under sparse guitar phrases with long silences between them
  explore(L, t) {
    let chord = 0, motif: Motif | null = null;
    const pad = new Pad(L.bed, triad(0, key.root - 12), 0.045, 650, t);
    L.stop = (s) => pad.stop(s);
    L.chunk = (t0) => {
      modulate();
      chord = pick(NEXT[chord] || [0]);
      pad.set(triad(chord, key.root - 12), t0, 6);
      if (Math.random() < 0.35) pluck(L.pl, t0, deg(chord, key.root - 12), 0.5);
      motif = motif && Math.random() < 0.4 ? vary(motif, chord) : compose(pick([4, 6, 8]), -2, 9, [1, 1, 1.5, 2, 0.5], chord);
      const len = perform(L.pl, t0 + 0.3, motif, { kind: 'gtr', base: key.root + 12, beat: 60 / rnd(60, 70), vel: 0.55, grace: 0.18, dyad: 0.15, trem: 0.08 });
      return t0 + 0.3 + len + rnd(4, 14);
    };
  },
  // warmer: a bourdon, oud tunes with tremolo and a soft hand drum
  town(L, t) {
    let chord = 0, motif: Motif | null = null, bars = 0;
    const bourdon = () => [deg(0, key.root - 12), deg(4, key.root - 12)];
    const pad = new Pad(L.bed, bourdon(), 0.03, 900, t);
    L.stop = (s) => pad.stop(s);
    L.chunk = (t0) => {
      const beat = 60 / 96;
      if (bars++ % 4 === 0) { modulate(); pad.set(bourdon(), t0, 2); chord = 0; } else chord = pick(NEXT[chord] || [0]);
      if (Math.random() < 0.85) handDrum(L.bed, t0, beat);
      if (Math.random() < 0.7) {
        motif = motif && Math.random() < 0.5 ? vary(motif, chord) : compose(6, 0, 9, [0.5, 0.5, 1, 1, 1.5], chord);
        perform(L.pl, t0, motif, { kind: 'oud', base: key.root + 12, beat, vel: 0.5, grace: 0.25, dyad: 0.1, trem: 0.35 });
      }
      return t0 + 8 * beat;
    };
  },
  // darker and sparser: long bowed notes or a few low plucks
  night(L, t) {
    let chord = 0;
    const pad = new Pad(L.bed, triad(0, key.root - 12), 0.035, 420, t);
    L.stop = (s) => pad.stop(s);
    L.chunk = (t0) => {
      modulate();
      chord = pick(NEXT[chord] || [0]);
      pad.set(triad(chord, key.root - 12), t0, 8);
      let at = t0 + 0.5;
      if (Math.random() < 0.6) {
        let d = chord + pick([0, 2, 4]);
        for (let i = 0, n = irnd(2, 4); i < n; i++) {
          const len = rnd(1.6, 3.8);
          lead(L.pl, at, deg(d, key.root), len, 0.14);
          at += len * rnd(0.85, 1);
          d = clamp(d + pick([-1, -1, 1, -2, 2]), -3, 7);
        }
      } else at += perform(L.pl, at, compose(pick([3, 4, 5]), -3, 6, [1.5, 2, 3], chord), { kind: 'gtr', base: key.root, beat: 60 / 54, vel: 0.45, grace: 0.1, dyad: 0.2, trem: 0 });
      return at + rnd(8, 18);
    };
  },
  // taiko, a palm-muted phrygian ostinato and a low drone, bar by bar
  combat(L, t) {
    const r = key.root - 12, drone = new Pad(L.bed, [r, r + 7], 0.05, 380, t, 12);
    let bar = 0, shift = 0, ost = OST[0];
    L.stop = (s) => drone.stop(s);
    L.chunk = (t0) => {
      const e = 60 / 126 / 2;
      if (bar % 4 === 0) { shift = pick([0, 0, 1, -2, 5]); ost = pick(OST); drone.set([r + shift, r + shift + 7], t0, 0.4); }
      const pat = bar % 4 === 3 ? FILL : pick(DRUMS);
      for (let i = 0; i < 8; i++) {
        const at = t0 + i * e;
        if (pat[i] === 3) drum(L.bed, at, 95, 42, 0.55, 0.42, 0.4, 700);
        else if (pat[i] === 2) drum(L.bed, at, 150, 72, 0.3, 0.26, 0.35, 1200);
        else if (pat[i] === 1) hiss(L.bed, at, 'bandpass', 2400, 1800, 0.001, 0.03, 0.22, 2);
        pluck(L.pl, at, r + 12 + shift + ost[i], i % 4 === 0 ? 0.55 : 0.36, 'mute', e * 0.9);
      }
      if (bar % 8 === 4) lead(L.pl, t0, r + 24 + shift + pick([1, 6, 13]), 3.5, 0.05);
      bar++;
      return t0 + 8 * e;
    };
  },
  // an uneasy drone (root, tritone, minor ninth) with distant drums and stray notes
  danger(L, t) {
    const r = key.root - 12, pad = new Pad(L.bed, [r, r + 6, r + 13], 0.05, 300, t, 14);
    L.stop = (s) => pad.stop(s);
    L.chunk = (t0) => {
      const x = Math.random();
      if (x < 0.35) {
        drum(L.bed, t0, 80, 38, 0.8, 0.5, 0.2, 500);
        if (Math.random() < 0.5) drum(L.bed, t0 + 0.42, 80, 38, 0.8, 0.35, 0.2, 500);
      } else if (x < 0.65) {
        pluck(L.pl, t0, r + 12, 0.45);
        pluck(L.pl, t0 + rnd(0.6, 1.2), r + 13, 0.4);
      } else if (x < 0.85) lead(L.pl, t0, r + 30 + pick([0, 1, 6]), rnd(3, 5), 0.05);
      return t0 + rnd(4, 9);
    };
  },
};

const LEVEL: Record<Mood, number> = { explore: 1.3, town: 1.25, night: 1.2, combat: 1, danger: 1.15, silence: 0 };
const layers = new Map<Mood, Layer>();
let want: Mood = 'silence', cur: Mood = 'silence';

export function setMood(m: Mood) { if (m in LEVEL) want = m; }

function makeLayer(mood: Exclude<Mood, 'silence'>, t: number): Layer {
  const m = mix!, pl = gain(0), bed = gain(0);
  const send = (from: AudioNode, to: AudioNode, v: number) => from.connect(gain(v)).connect(to);
  pl.connect(m.mus.dry);
  send(pl, m.mus.wet, 0.5);
  send(pl, m.echo, 0.28);
  bed.connect(m.mus.dry);
  send(bed, m.mus.wet, 0.35);
  const L: Layer = { mood, pl, bed, next: t + (mood === 'combat' ? 0.05 : rnd(1.5, 3)), on: false, off: 0, stop: () => {}, chunk: (x) => x + 1 };
  PLAYERS[mood](L, t);
  return L;
}

function fade(L: Layer, v: number, secs: number, now: number) {
  for (const g of [L.pl, L.bed]) {
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.setTargetAtTime(v, now, secs / 3);
  }
}

/** Runs from the audio tick while the context is running: applies mood changes and
 *  schedules each playing layer about half a second ahead. */
export function tickMusic(now: number) {
  if (want !== cur) {
    const was = cur, to = want;
    cur = to;
    for (const L of layers.values()) {
      if (L.on && L.mood !== to) { L.on = false; L.off = now; fade(L, 0, was === 'combat' ? 4 : to === 'combat' ? 1.2 : 3, now); }
    }
    if (to !== 'silence') {
      let L = layers.get(to);
      if (!L) layers.set(to, (L = makeLayer(to, now)));
      if (!L.on) { L.on = true; fade(L, LEVEL[to], to === 'combat' ? 1 : 3, now); }
    }
  }
  for (const [k, L] of layers) {
    if (!L.on) {
      if (now - L.off > 14) { L.stop(now); L.pl.disconnect(); L.bed.disconnect(); layers.delete(k); }
      continue;
    }
    for (let i = 0; i < 4 && L.next < now + 0.5; i++) {
      if (L.next < now - 0.1) L.next = now + 0.05;
      L.next = Math.max(L.next + 0.1, L.chunk(L.next));
    }
  }
}
