// Instruments: Karplus-Strong lute and harp, recorder/flute, fiddle, drone,
// tabor drum and a soft choir. Each schedules itself at an absolute time.

import { audio } from './audio';

export const midiFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

const pluckCache = new Map<string, AudioBuffer>();

/** Pre-renders a plucked string (Karplus-Strong) into a buffer. */
function pluckBuffer(midi: number, kind: 'lute' | 'harp' | 'bass'): AudioBuffer {
  const key = kind + midi;
  let b = pluckCache.get(key);
  if (b) return b;
  const ctx = audio.ctx!;
  const sr = ctx.sampleRate;
  const f = midiFreq(midi);
  const secs = kind === 'harp' ? 3.2 : kind === 'bass' ? 2.2 : 1.8;
  const len = Math.floor(sr * secs);
  b = ctx.createBuffer(1, len, sr);
  const out = b.getChannelData(0);
  const N = Math.max(2, Math.round(sr / f));
  const ring = new Float32Array(N);
  // excitation: filtered noise gives a softer, gut-string pluck
  let prev = 0;
  const bright = kind === 'harp' ? 0.75 : kind === 'bass' ? 0.35 : 0.55;
  for (let i = 0; i < N; i++) {
    const w = Math.random() * 2 - 1;
    prev = prev + (w - prev) * bright;
    ring[i] = prev;
  }
  const damp = kind === 'harp' ? 0.9985 : kind === 'bass' ? 0.997 : 0.9955;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const nxt = (idx + 1) % N;
    const v = ring[idx];
    out[i] = v;
    ring[idx] = (v + ring[nxt]) * 0.5 * damp;
    idx = nxt;
  }
  // fade tail
  for (let i = len - 2000; i < len; i++) out[i] *= (len - i) / 2000;
  pluckCache.set(key, b);
  return b;
}

export function pluck(dest: AudioNode, t: number, midi: number, vel: number, kind: 'lute' | 'harp' | 'bass' = 'lute', pan = 0) {
  const ctx = audio.ctx;
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = pluckBuffer(midi, kind);
  const g = ctx.createGain();
  g.gain.value = vel * (kind === 'bass' ? 0.55 : 0.42);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  src.connect(g).connect(p).connect(dest);
  if (audio.reverbSend) g.connect(audio.reverbSend);
  src.start(t);
  src.stop(t + (kind === 'harp' ? 3.2 : 1.8));
}

export function flute(dest: AudioNode, t: number, midi: number, dur: number, vel: number, pan = 0.1, bright = false) {
  const ctx = audio.ctx;
  if (!ctx) return;
  const f = midiFreq(midi);
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = f;
  const o2 = ctx.createOscillator();
  o2.type = 'triangle';
  o2.frequency.value = f * 2;
  const g2 = ctx.createGain();
  g2.gain.value = bright ? 0.18 : 0.08;
  // vibrato, arriving after the attack
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.2;
  const lg = ctx.createGain();
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(f * 0.006, t + Math.min(0.35, dur * 0.6));
  lfo.connect(lg);
  lg.connect(o.frequency);
  lg.connect(o2.frequency);
  const env = ctx.createGain();
  const peak = vel * 0.2;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.06);
  env.gain.setValueAtTime(peak * 0.85, t + Math.max(0.07, dur - 0.08));
  env.gain.linearRampToValueAtTime(0, t + dur + 0.12);
  // breath
  const nz = ctx.createBufferSource();
  nz.buffer = audio.noise;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f * 2;
  bp.Q.value = 2;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vel * 0.05, t);
  ng.gain.exponentialRampToValueAtTime(0.0008, t + 0.15);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(env);
  o2.connect(g2).connect(env);
  nz.connect(bp).connect(ng).connect(env);
  env.connect(p).connect(dest);
  if (audio.reverbSend) env.connect(audio.reverbSend);
  const end = t + dur + 0.2;
  o.start(t); o2.start(t); lfo.start(t); nz.start(t, Math.random());
  o.stop(end); o2.stop(end); lfo.stop(end); nz.stop(t + 0.2);
}

export function fiddle(dest: AudioNode, t: number, midi: number, dur: number, vel: number, pan = -0.15) {
  const ctx = audio.ctx;
  if (!ctx) return;
  const f = midiFreq(midi);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = f;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = Math.min(3200, f * 5);
  lp.Q.value = 1.2;
  const body = ctx.createBiquadFilter();
  body.type = 'peaking';
  body.frequency.value = 900;
  body.gain.value = 5;
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.6;
  const lg = ctx.createGain();
  lg.gain.setValueAtTime(0, t);
  lg.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.25, dur * 0.5));
  lfo.connect(lg).connect(o.frequency);
  const env = ctx.createGain();
  const peak = vel * 0.075;
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(peak, t + 0.04);
  env.gain.setValueAtTime(peak * 0.8, t + Math.max(0.05, dur - 0.05));
  env.gain.linearRampToValueAtTime(0, t + dur + 0.08);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(lp).connect(body).connect(env).connect(p).connect(dest);
  if (audio.reverbSend) env.connect(audio.reverbSend);
  o.start(t); lfo.start(t);
  o.stop(t + dur + 0.15); lfo.stop(t + dur + 0.15);
}

export function drum(dest: AudioNode, t: number, vel: number, kind: 'low' | 'high' | 'tick' = 'low') {
  const ctx = audio.ctx;
  if (!ctx) return;
  const o = ctx.createOscillator();
  o.type = 'sine';
  const f0 = kind === 'low' ? 120 : kind === 'high' ? 220 : 400;
  const f1 = kind === 'low' ? 48 : kind === 'high' ? 110 : 250;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel * (kind === 'tick' ? 0.12 : 0.5), t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (kind === 'low' ? 0.35 : 0.15));
  const nz = ctx.createBufferSource();
  nz.buffer = audio.noise;
  const lp = ctx.createBiquadFilter();
  lp.type = kind === 'tick' ? 'highpass' : 'lowpass';
  lp.frequency.value = kind === 'tick' ? 3000 : 1400;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(vel * (kind === 'low' ? 0.12 : 0.18), t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(g).connect(dest);
  nz.connect(lp).connect(ng).connect(dest);
  o.start(t); o.stop(t + 0.4);
  nz.start(t, Math.random()); nz.stop(t + 0.1);
}

export function choir(dest: AudioNode, t: number, midis: number[], dur: number, vel: number) {
  const ctx = audio.ctx;
  if (!ctx) return;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(vel * 0.06, t + Math.min(0.8, dur * 0.4));
  env.gain.setValueAtTime(vel * 0.06, t + dur * 0.8);
  env.gain.linearRampToValueAtTime(0, t + dur + 0.6);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 1400;
  env.connect(lp).connect(dest);
  if (audio.reverbSend) lp.connect(audio.reverbSend);
  for (const m of midis) {
    for (const det of [-6, 5]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midiFreq(m);
      o.detune.value = det;
      const vib = ctx.createOscillator();
      vib.frequency.value = 4.3 + Math.random();
      const vg = ctx.createGain();
      vg.gain.value = 3;
      vib.connect(vg).connect(o.detune);
      o.connect(env);
      o.start(t); vib.start(t);
      o.stop(t + dur + 0.7); vib.stop(t + dur + 0.7);
    }
  }
}

/** A sustained drone (hurdy-gurdy / bagpipe). Returns a stop function. */
export function drone(dest: AudioNode, midis: number[], vel: number): (when?: number) => void {
  const ctx = audio.ctx;
  if (!ctx) return () => {};
  const t = ctx.currentTime;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vel * 0.045, t + 2);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  g.connect(lp).connect(dest);
  const oscs: OscillatorNode[] = [];
  for (const m of midis) for (const det of [-4, 4]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midiFreq(m);
    o.detune.value = det;
    o.connect(g);
    o.start(t);
    oscs.push(o);
  }
  return (when?: number) => {
    const s = when ?? ctx.currentTime;
    g.gain.cancelScheduledValues(s);
    g.gain.setValueAtTime(g.gain.value, s);
    g.gain.linearRampToValueAtTime(0, s + 1.5);
    for (const o of oscs) o.stop(s + 1.6);
  };
}
