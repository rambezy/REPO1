// Synthesised sound effects. sfx(name, x?, y?) plays a sound, attenuated by
// distance from the player when a world position is given.

import { audio } from './audio';
import { G } from '../G';
import { midiFreq, pluck } from './synth';

function env(g: GainNode, t: number, a: number, peak: number, d: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function noiseBurst(dest: AudioNode, t: number, dur: number, type: BiquadFilterType, f0: number, f1: number, peak: number, q = 1) {
  const ctx = audio.ctx!;
  const s = ctx.createBufferSource();
  s.buffer = audio.noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, Math.min(0.02, dur * 0.2), peak, dur);
  s.connect(f).connect(g).connect(dest);
  s.start(t, Math.random() * 1.5);
  s.stop(t + dur + 0.05);
}

function tone(dest: AudioNode, t: number, type: OscillatorType, f0: number, f1: number, dur: number, peak: number, attack = 0.005) {
  const ctx = audio.ctx!;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  env(g, t, attack, peak, dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + attack + 0.05);
}

function metal(dest: AudioNode, t: number, base: number, dur: number, peak: number) {
  const ratios = [1, 2.76, 5.4, 8.93, 13.3];
  ratios.forEach((r, i) => tone(dest, t, 'sine', base * r, base * r * 0.998, dur / (1 + i * 0.6), peak / (1 + i * 0.9)));
}

let lastPlayed = new Map<string, number>();

export function sfx(name: string, x?: number, y?: number, vol = 1) {
  const ctx = audio.ctx;
  if (!ctx || !audio.sfx) return;
  const nowT = ctx.currentTime;
  // don't stack identical sounds in the same instant
  const lp = lastPlayed.get(name) || 0;
  if (nowT - lp < 0.03) return;
  lastPlayed.set(name, nowT);
  let v = vol;
  let pan = 0;
  if (x !== undefined && y !== undefined && G.player) {
    const dx = x - G.player.x, dy = y - G.player.y;
    const d = Math.hypot(dx, dy);
    if (d > 260) return;
    v *= Math.max(0, 1 - d / 260);
    pan = Math.max(-0.8, Math.min(0.8, dx / 160));
  }
  const out = ctx.createGain();
  out.gain.value = v;
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  out.connect(p).connect(audio.sfx);
  const t = nowT + 0.005;
  switch (name) {
    case 'swing': noiseBurst(out, t, 0.16, 'bandpass', 700, 2600, 0.35, 1.2); break;
    case 'swing_heavy': noiseBurst(out, t, 0.28, 'bandpass', 400, 1600, 0.45, 1.0); break;
    case 'hit': tone(out, t, 'sine', 160, 60, 0.12, 0.6); noiseBurst(out, t, 0.08, 'lowpass', 2500, 600, 0.35); break;
    case 'hit_heavy': tone(out, t, 'sine', 120, 40, 0.22, 0.8); noiseBurst(out, t, 0.14, 'lowpass', 1800, 300, 0.5); break;
    case 'hit_flesh': tone(out, t, 'sine', 140, 70, 0.1, 0.5); noiseBurst(out, t, 0.06, 'lowpass', 1200, 400, 0.25); break;
    case 'block': metal(out, t, 520 + Math.random() * 60, 0.35, 0.18); noiseBurst(out, t, 0.05, 'highpass', 3000, 3000, 0.3); break;
    case 'parry': metal(out, t, 760 + Math.random() * 40, 0.8, 0.22); noiseBurst(out, t, 0.08, 'highpass', 4000, 4000, 0.35); break;
    case 'dodge': noiseBurst(out, t, 0.18, 'bandpass', 1200, 500, 0.18, 0.8); break;
    case 'die': tone(out, t, 'sawtooth', 180, 70, 0.6, 0.08, 0.03); noiseBurst(out, t, 0.3, 'lowpass', 600, 200, 0.12); break;
    case 'animal_die': tone(out, t, 'sawtooth', 700, 200, 0.35, 0.1, 0.01); break;
    case 'bow': tone(out, t, 'triangle', 180, 150, 0.2, 0.3); noiseBurst(out, t, 0.12, 'highpass', 2000, 800, 0.2); break;
    case 'step_grass': noiseBurst(out, t, 0.05, 'bandpass', 1800, 1200, 0.05, 0.8); break;
    case 'step_dirt': noiseBurst(out, t, 0.05, 'lowpass', 900, 400, 0.07); break;
    case 'step_stone': noiseBurst(out, t, 0.04, 'bandpass', 2400, 1800, 0.07, 2); tone(out, t, 'sine', 200, 160, 0.03, 0.04); break;
    case 'step_wood': tone(out, t, 'sine', 180, 120, 0.06, 0.12); noiseBurst(out, t, 0.04, 'lowpass', 1400, 600, 0.05); break;
    case 'step_water': noiseBurst(out, t, 0.12, 'bandpass', 900, 2400, 0.12, 1.5); break;
    case 'coin': metal(out, t, 1900, 0.25, 0.08); metal(out, t + 0.07, 2300, 0.3, 0.07); break;
    case 'pickup': pluck(out, t, 76, 0.5, 'harp'); break;
    case 'herb': noiseBurst(out, t, 0.12, 'bandpass', 3000, 1500, 0.12, 1); pluck(out, t + 0.05, 81, 0.3, 'harp'); break;
    case 'door': tone(out, t, 'sawtooth', 90, 70, 0.35, 0.05, 0.08); noiseBurst(out, t + 0.3, 0.1, 'lowpass', 400, 100, 0.4); break;
    case 'chest': tone(out, t, 'sawtooth', 120, 90, 0.2, 0.04, 0.03); noiseBurst(out, t, 0.08, 'lowpass', 800, 200, 0.25); break;
    case 'ui': pluck(out, t, 72, 0.25, 'lute'); break;
    case 'ui_back': pluck(out, t, 67, 0.22, 'lute'); break;
    case 'page': noiseBurst(out, t, 0.18, 'bandpass', 3500, 2000, 0.1, 0.7); break;
    case 'book': noiseBurst(out, t, 0.12, 'lowpass', 1200, 300, 0.3); break;
    case 'bark': {
      for (let i = 0; i < (Math.random() < 0.5 ? 1 : 2); i++) {
        const tt = t + i * 0.18;
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(520, tt);
        o.frequency.exponentialRampToValueAtTime(260, tt + 0.1);
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 3;
        const g = ctx.createGain();
        env(g, tt, 0.01, 0.35, 0.1);
        o.connect(bp).connect(g).connect(out);
        o.start(tt); o.stop(tt + 0.16);
      }
      break;
    }
    case 'whine': tone(out, t, 'sine', 900, 1300, 0.4, 0.06, 0.08); tone(out, t + 0.35, 'sine', 1200, 800, 0.4, 0.05, 0.05); break;
    case 'growl': noiseBurst(out, t, 0.6, 'lowpass', 300, 200, 0.2); tone(out, t, 'sawtooth', 80, 70, 0.6, 0.05, 0.1); break;
    case 'howl': tone(out, t, 'sine', 380, 520, 0.8, 0.08, 0.3); tone(out, t + 0.8, 'sine', 520, 340, 1.2, 0.07, 0.05); break;
    case 'hammer': metal(out, t, 980 + Math.random() * 80, 0.5, 0.2); tone(out, t, 'sine', 150, 80, 0.08, 0.3); break;
    case 'quench': noiseBurst(out, t, 1.2, 'highpass', 3000, 5000, 0.2); break;
    case 'bellows': noiseBurst(out, t, 0.45, 'lowpass', 500, 900, 0.18); break;
    case 'splash': noiseBurst(out, t, 0.3, 'bandpass', 800, 2400, 0.25, 0.8); break;
    case 'eat': for (let i = 0; i < 3; i++) noiseBurst(out, t + i * 0.13, 0.06, 'bandpass', 1500, 900, 0.14, 1.2); break;
    case 'drink': for (let i = 0; i < 3; i++) tone(out, t + i * 0.16, 'sine', 300, 500, 0.08, 0.1, 0.01); break;
    case 'bell': metal(out, t, 196, 4, 0.25); metal(out, t + 2.2, 196, 4, 0.2); break;
    case 'bell_small': metal(out, t, 660, 1.2, 0.12); break;
    case 'levelup': [72, 76, 79, 84].forEach((m, i) => pluck(out, t + i * 0.09, m, 0.5, 'harp')); break;
    case 'quest': [62, 69, 74].forEach((m, i) => pluck(out, t + i * 0.14, m, 0.5, 'lute')); tone(out, t + 0.28, 'triangle', midiFreq(74), midiFreq(74), 0.6, 0.07, 0.05); break;
    case 'quest_done': [62, 66, 69, 74, 78].forEach((m, i) => pluck(out, t + i * 0.1, m, 0.5, 'harp')); break;
    case 'fail': [64, 61, 57].forEach((m, i) => pluck(out, t + i * 0.16, m, 0.45, 'lute')); break;
    case 'heart': tone(out, t, 'sine', 60, 45, 0.12, 0.5); tone(out, t + 0.22, 'sine', 55, 40, 0.12, 0.35); break;
    case 'crow': tone(out, t, 'sawtooth', 900, 700, 0.18, 0.05, 0.02); tone(out, t + 0.25, 'sawtooth', 850, 650, 0.2, 0.04, 0.02); break;
    case 'bird': { const b = 2400 + Math.random() * 1200; for (let i = 0; i < 3; i++) tone(out, t + i * 0.09, 'sine', b, b * 1.3, 0.06, 0.03, 0.01); break; }
    case 'rooster': tone(out, t, 'sawtooth', 500, 900, 0.3, 0.05, 0.05); tone(out, t + 0.3, 'sawtooth', 900, 600, 0.6, 0.05, 0.02); break;
    case 'thunder': noiseBurst(out, t, 2.5, 'lowpass', 300, 60, 0.8); break;
    case 'fire': noiseBurst(out, t, 0.05, 'highpass', 2000, 2000, 0.05); break;
    case 'lockclick': tone(out, t, 'square', 2200, 2000, 0.02, 0.05); break;
    case 'lockbreak': metal(out, t, 1600, 0.2, 0.1); break;
    case 'unlock': tone(out, t, 'square', 1400, 1400, 0.03, 0.08); tone(out, t + 0.08, 'square', 900, 900, 0.05, 0.08); break;
    case 'dice': for (let i = 0; i < 6; i++) noiseBurst(out, t + i * 0.05 + Math.random() * 0.03, 0.03, 'bandpass', 2200, 1800, 0.18, 3); break;
    case 'gulp': tone(out, t, 'sine', 250, 450, 0.12, 0.15); break;
    case 'sheathe': noiseBurst(out, t, 0.25, 'bandpass', 3000, 5000, 0.12, 4); break;
    case 'alarm': metal(out, t, 880, 0.3, 0.15); metal(out, t + 0.35, 880, 0.3, 0.15); break;
    case 'hmm': tone(out, t, 'triangle', 170, 150, 0.25, 0.08, 0.04); break;
  }
}

/** Short melodic sting for dramatic moments. */
export function sting(kind: 'sad' | 'reveal' | 'danger' | 'warm') {
  const ctx = audio.ctx;
  if (!ctx || !audio.sfx) return;
  const t = ctx.currentTime + 0.02;
  const seqs: Record<string, number[]> = { sad: [62, 65, 69, 67], reveal: [57, 64, 69, 72], danger: [50, 51, 50, 51], warm: [67, 71, 74, 79] };
  seqs[kind].forEach((m, i) => pluck(audio.sfx!, t + i * 0.22, m, 0.5, 'harp'));
}
