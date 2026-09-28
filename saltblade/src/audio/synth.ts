// Building blocks for synthesised sound: enveloped tones and noise bursts, struck
// metal, formant voices, drums, horns, creaks, Karplus-Strong plucks and pads.
import { mix } from './core';

export const ac = () => mix!.ctx;
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const irnd = (a: number, b: number) => Math.floor(rnd(a, b + 1));
export const pick = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)];
export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const hz = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** Own-property lookup, so names like 'toString' never match a table entry. */
export const own = <T>(o: Record<string, T>, k: string): T | undefined => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);

// Sources started while a voice or bed is being built are collected so it can be cut short.
let bag: AudioScheduledSourceNode[] | null = null;
export function collect(b: AudioScheduledSourceNode[] | null) { bag = b; }

/** Starts a source at t0 (stopping at t1 if given) and registers it with the current collector. */
export function run<T extends AudioScheduledSourceNode>(s: T, t0: number, t1?: number, offset?: number): T {
  if (offset !== undefined) (s as unknown as AudioBufferSourceNode).start(t0, offset);
  else s.start(t0);
  if (t1 !== undefined) s.stop(t1);
  bag?.push(s);
  return s;
}

export function gain(v = 1): GainNode { const g = ac().createGain(); g.gain.value = v; return g; }
export function filt(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode {
  const n = ac().createBiquadFilter();
  n.type = type; n.frequency.value = f; n.Q.value = q;
  return n;
}
export function osc(type: OscillatorType, f: number): OscillatorNode {
  const o = ac().createOscillator();
  o.type = type; o.frequency.value = f;
  return o;
}
export function pan(p: number): StereoPannerNode { const n = ac().createStereoPanner(); n.pan.value = clamp(p, -1, 1); return n; }

/** A looping noise or texture source from a random point; runs until its collector stops it. */
export function loop(buf: AudioBuffer, rate = 1): AudioBufferSourceNode {
  const s = ac().createBufferSource();
  s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
  return run(s, ac().currentTime, undefined, Math.random() * buf.duration);
}
/** Noise (white by default) for [t, t + d]. */
export function nsrc(t: number, d: number, buf = mix!.mono): AudioBufferSourceNode {
  const s = ac().createBufferSource();
  s.buffer = buf; s.loop = true;
  return run(s, t, t + d, Math.random() * buf.duration);
}
/** An LFO summed onto a parameter (value +- depth), from t0 until t1 or until collected. */
export function lfo(p: AudioParam, rate: number, depth: number, type: OscillatorType = 'sine', t0 = ac().currentTime, t1?: number): [OscillatorNode, GainNode] {
  const o = osc(type, rate), g = gain(depth);
  o.connect(g).connect(p);
  run(o, t0, t1);
  return [o, g];
}

const lastSet = new WeakMap<AudioParam, number>();
/** Glides a parameter toward v with time constant tc, skipping repeats of the same target. */
export function ramp(p: AudioParam, v: number, tc = 0.6) {
  const was = lastSet.get(p);
  if (!isFinite(v) || (was !== undefined && Math.abs(was - v) <= Math.abs(v) * 1e-3 + 1e-5)) return;
  lastSet.set(p, v);
  p.setTargetAtTime(v, ac().currentTime, tc);
}

/** A gain with a linear attack a, then an exponential decay that has faded out after ~d. */
export function env(t: number, a: number, peak: number, d: number): GainNode {
  const g = gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setTargetAtTime(0, t + a, d / 5);
  return g;
}
/** A gain with a linear attack a, held until t + d, then a linear release r. */
export function hold(t: number, a: number, peak: number, d: number, r: number): GainNode {
  const g = gain(0), h = t + Math.max(a, d);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, h);
  g.gain.linearRampToValueAtTime(0, h + r);
  return g;
}

/** An oscillator blip whose pitch sweeps f0 -> f1. Returns its length. */
export function tone(o: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, a: number, d: number, peak: number): number {
  const s = osc(type, f0);
  if (f1 !== f0) {
    s.frequency.setValueAtTime(f0, t);
    s.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + a + d * 0.5);
  }
  s.connect(env(t, a, peak, d)).connect(o);
  run(s, t, t + a + d * 1.2);
  return a + d * 1.2;
}

/** A burst of noise through a filter sweeping f0 -> f1. Returns its length. */
export function hiss(o: AudioNode, t: number, type: BiquadFilterType, f0: number, f1: number, a: number, d: number, peak: number, q = 1, buf?: AudioBuffer): number {
  const len = a + d * 1.2, f = filt(type, Math.min(f0, 18000), q);
  if (f1 !== f0) {
    f.frequency.setValueAtTime(Math.min(f0, 18000), t);
    f.frequency.exponentialRampToValueAtTime(clamp(f1, 20, 18000), t + a + d);
  }
  nsrc(t, len, buf).connect(f).connect(env(t, a, peak, d)).connect(o);
  return len;
}

/** Struck metal: inharmonic sine partials, the higher ones dying sooner. */
export function metal(o: AudioNode, t: number, base: number, ratios: readonly number[], d: number, peak: number): number {
  let len = 0;
  const ny = ac().sampleRate * 0.45;
  ratios.forEach((r, i) => {
    const f = base * r * rnd(0.994, 1.006);
    if (f < ny) len = Math.max(len, tone(o, t, 'sine', f, f, 0.0015, d / (1 + i * 0.5), peak / (1 + i * 0.6)));
  });
  return len;
}

/** A drum: a sine body with a pitch drop plus a lowpassed noise slap. */
export function drum(o: AudioNode, t: number, f0: number, f1: number, d: number, peak: number, slap = 0.3, slapF = 1200): number {
  tone(o, t, 'sine', f0, f1, 0.002, d, peak);
  if (slap > 0) hiss(o, t, 'lowpass', slapF, slapF * 0.3, 0.001, Math.min(0.12, d * 0.3), peak * slap);
  return d * 1.2;
}

export const VOW = { ah: [730, 1090, 2440], uh: [640, 1190, 2390], oh: [570, 840, 2410], eh: [530, 1840, 2480], oo: [300, 870, 2240] };
/** A buzzing glottal source through three formants gliding from vowel v0 to v1: groans,
 *  grunts, distant talk, snarls and roars. rough adds a growling flutter. */
export function vox(o: AudioNode, t: number, d: number, f0: number, f1: number, v0: readonly number[], v1: readonly number[], peak: number, rough = 0, breath = 0.1): number {
  const s = osc('sawtooth', f0), src = gain(1 - rough * 0.5), e = gain(0);
  s.frequency.setValueAtTime(f0, t);
  s.frequency.exponentialRampToValueAtTime(f1, t + d);
  s.connect(src);
  if (rough > 0) lfo(src.gain, rnd(22, 34), rough * 0.5, 'triangle', t, t + d + 0.05);
  if (breath > 0) nsrc(t, d + 0.05).connect(gain(breath)).connect(src);
  e.gain.setValueAtTime(0, t);
  e.gain.linearRampToValueAtTime(peak, t + Math.min(0.07, d * 0.25));
  e.gain.linearRampToValueAtTime(peak * 0.7, t + d * 0.65);
  e.gain.linearRampToValueAtTime(0, t + d);
  for (let i = 0; i < 3; i++) {
    const bp = filt('bandpass', v0[i], v0[i] / (70 + 50 * i));
    if (v1 !== v0) { bp.frequency.setValueAtTime(v0[i], t); bp.frequency.linearRampToValueAtTime(v1[i], t + d); }
    src.connect(bp).connect(gain([3, 1.6, 0.8][i])).connect(e);
  }
  e.connect(o);
  run(s, t, t + d + 0.05);
  return d + 0.05;
}

/** A brass horn note: detuned saws whose lowpass opens with the breath. */
export function horn(o: AudioNode, t: number, f: number, d: number, peak: number): number {
  const lp = filt('lowpass', f * 1.5, 2), e = hold(t, 0.05, peak, d, 0.1);
  lp.frequency.setValueAtTime(f * 1.5, t);
  lp.frequency.linearRampToValueAtTime(f * 9, t + 0.07);
  lp.frequency.setTargetAtTime(f * 5, t + 0.07, 0.15);
  for (const dt of [-7, 6]) {
    const s = osc('sawtooth', f);
    s.frequency.setValueAtTime(f * 0.94, t);
    s.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    s.detune.value = dt;
    s.connect(lp);
    run(s, t, t + d + 0.15);
  }
  lp.connect(e).connect(o);
  return d + 0.15;
}

/** Stick-slip creak of a hinge or plank: a jittery low buzz through wood resonances. */
export function creak(o: AudioNode, t: number, d: number, f: number, res: number, peak: number): number {
  const n = 16, fc = new Float32Array(n), gc = new Float32Array(n);
  let v = f;
  for (let i = 0; i < n; i++) {
    v = clamp(v * rnd(0.82, 1.22), f * 0.6, f * 1.8);
    fc[i] = v;
    gc[i] = peak * rnd(0.35, 1) * Math.sin((Math.PI * i) / (n - 1));
  }
  const s = osc('sawtooth', fc[0]), g = gain(0), b1 = filt('bandpass', res, 5), b2 = filt('bandpass', res * 2.4, 7);
  s.frequency.setValueCurveAtTime(fc, t, d);
  g.gain.setValueCurveAtTime(gc, t, d);
  s.connect(b1).connect(g);
  s.connect(b2).connect(g);
  g.connect(o);
  run(s, t, t + d + 0.02);
  return d;
}

/** A servo whir: a buzzy tone gliding up and settling, through a resonant band. */
export function whir(o: AudioNode, t: number, d: number, f: number, peak: number): number {
  const s = osc('sawtooth', f), bp = filt('bandpass', f * 5, 3);
  s.frequency.setValueAtTime(f, t);
  s.frequency.exponentialRampToValueAtTime(f * rnd(2, 2.8), t + d * 0.4);
  s.frequency.exponentialRampToValueAtTime(f * rnd(1.4, 1.8), t + d);
  s.connect(bp).connect(hold(t, 0.05, peak, d * 0.8, d * 0.2)).connect(o);
  run(s, t, t + d + 0.05);
  return d;
}

/** A soft bowed or sung sine lead whose vibrato arrives late. */
export function lead(o: AudioNode, t: number, midi: number, d: number, vel: number): number {
  const f = hz(midi), s = osc('sine', f), s2 = osc('triangle', f), vib = osc('sine', rnd(4.2, 5.4)), vg = gain(0), end = t + d + 1.6;
  vg.gain.setValueAtTime(0, t);
  vg.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(1.2, d * 0.6));
  vib.connect(vg);
  vg.connect(s.frequency);
  vg.connect(s2.frequency);
  run(vib, t, end);
  const e = gain(0), att = Math.min(0.9, d * 0.35);
  e.gain.setValueAtTime(0, t);
  e.gain.linearRampToValueAtTime(vel, t + att);
  e.gain.linearRampToValueAtTime(vel * 0.8, t + d);
  e.gain.setTargetAtTime(0, t + d, 0.35);
  s.connect(e);
  s2.connect(gain(0.18)).connect(e);
  e.connect(o);
  run(s, t, end);
  run(s2, t, end);
  return end - t;
}

// ---------- plucked strings (Karplus-Strong), rendered once per note and cached ----------

export type Pluck = 'gtr' | 'oud' | 'mute' | 'twang';
// excitation brightness, decay (T60 at 220 Hz, seconds), pluck position
const PK: Record<Pluck, [number, number, number]> = {
  gtr: [0.42, 3.4, 0.21], oud: [0.7, 1.8, 0.12], mute: [0.33, 0.3, 0.24], twang: [0.9, 0.7, 0.08],
};
const ks = new Map<string, { b: AudioBuffer; f: number }>();

function ksRender(midi: number, kind: Pluck) {
  const id = kind + midi;
  let e = ks.get(id);
  if (e) return e;
  // rendered at half rate: plenty for a warm string, and half the memory
  const c = ac(), sr = Math.round(c.sampleRate / 2), f = hz(midi), [bright, t60b, pos] = PK[kind];
  const t60 = t60b * Math.pow(220 / f, 0.4), N = Math.max(8, Math.round(sr / f - 0.5));
  const len = Math.floor(sr * Math.min(3.2, t60 * 0.8 + 0.05)); // cut about 48 dB down
  const b = c.createBuffer(1, len, sr), out = b.getChannelData(0), ring = new Float32Array(N);
  let lp = 0, peak = 1e-6;
  for (let i = 0; i < N; i++) { lp += (Math.random() * 2 - 1 - lp) * bright; ring[i] = lp; }
  // plucking at a point along the string cancels some harmonics (and any DC)
  const P = Math.max(1, Math.round(N * pos));
  ring.set(ring.map((v, i) => v - ring[(i - P + N) % N]));
  const rho = Math.pow(10, -3 / (t60 * f));
  for (let i = 0, j = 0; i < len; i++) {
    const nx = j + 1 === N ? 0 : j + 1, v = ring[j];
    out[i] = v;
    ring[j] = rho * 0.5 * (v + ring[nx]);
    j = nx;
    if (Math.abs(v) > peak) peak = Math.abs(v);
  }
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < len; i++) out[i] = (out[i] / peak) * (i > len - fade ? (len - i) / fade : 1);
  e = { b, f: sr / (N + 0.5) };
  ks.set(id, e);
  return e;
}

/** A plucked string. Buffers are cached every third semitone and retuned by playback rate;
 *  len damps the note early (palm mute). Returns its length. */
export function pluck(o: AudioNode, t: number, midi: number, vel: number, kind: Pluck = 'gtr', len?: number): number {
  const e = ksRender(Math.round(midi / 3) * 3, kind), s = ac().createBufferSource(), g = gain(vel);
  s.buffer = e.b;
  s.playbackRate.value = hz(midi) / e.f;
  let end = t + e.b.duration / s.playbackRate.value;
  if (len !== undefined && t + len < end) {
    g.gain.setValueAtTime(vel, t + len);
    g.gain.setTargetAtTime(0, t + len, 0.04);
    end = t + len + 0.25;
  }
  s.connect(g).connect(o);
  run(s, t, end);
  return end - t;
}

/** A sustained chord of detuned saws through a slowly breathing lowpass; glides between chords. */
export class Pad {
  private o: OscillatorNode[] = [];
  private n: number;
  constructor(dest: AudioNode, midis: number[], level: number, cutoff: number, t: number, detune = 7) {
    const f = filt('lowpass', cutoff, 0.8), g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + 5);
    f.connect(g).connect(dest);
    for (const m of midis) for (const dt of [-detune, detune]) {
      const s = osc('sawtooth', hz(m));
      s.detune.value = dt + rnd(-2, 2);
      s.connect(f);
      this.o.push(run(s, t));
    }
    this.n = this.o.length;
    this.o.push(lfo(f.frequency, rnd(0.03, 0.06), cutoff * 0.4, 'sine', t)[0], lfo(g.gain, rnd(0.05, 0.09), level * 0.3, 'sine', t)[0]);
  }
  /** Glides to a chord of the same size over roughly glide seconds from t. */
  set(midis: number[], t: number, glide = 3) {
    midis.forEach((m, i) => { for (let k = 0; k < 2 && i * 2 + k < this.n; k++) this.o[i * 2 + k].frequency.setTargetAtTime(hz(m), t, glide / 3); });
  }
  stop(t: number) { for (const s of this.o) try { s.stop(t); } catch { /* already stopped */ } }
}

// ---------- pre-rendered textures ----------

const tex = new Map<string, AudioBuffer>();
/** Loopable stereo textures: 'drips' (rain on the ground) and 'crackle' (fire, sizzling). */
export function texture(kind: 'drips' | 'crackle'): AudioBuffer {
  let b = tex.get(kind);
  if (b) return b;
  const c = ac(), sr = c.sampleRate, len = Math.floor(sr * 3);
  b = c.createBuffer(2, len, sr);
  const L = b.getChannelData(0), R = b.getChannelData(1), drips = kind === 'drips';
  for (let k = 0, n = drips ? 90 : 170; k < n; k++) {
    const at = Math.floor(Math.random() * len), p = Math.random(), gl = Math.sqrt(1 - p), gr = Math.sqrt(p);
    const amp = Math.pow(Math.random(), 3) * 0.9 + 0.05, deep = !drips && Math.random() < 0.2;
    const f = rnd(1200, 4200), tau = (drips ? rnd(0.002, 0.008) : deep ? rnd(0.002, 0.005) : rnd(0.0002, 0.0015)) * sr;
    let lp = 0;
    for (let i = 0, m = Math.floor(tau * 6); i < m; i++) {
      const j = (at + i) % len;
      let x: number;
      if (drips) x = Math.sin((2 * Math.PI * f * (1 + (0.3 * i) / m) * i) / sr);
      else { lp += (Math.random() * 2 - 1 - lp) * (deep ? 0.15 : 1); x = deep ? lp * 3 : lp; }
      x *= Math.exp(-i / tau) * amp;
      L[j] += x * gl;
      R[j] += x * gr;
    }
  }
  tex.set(kind, b);
  return b;
}
