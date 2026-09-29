// Synthesised sound effects and a low ambient drone. No audio files.

import { G } from '../game/G';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuf: AudioBuffer | null = null;
let ambient: { stop: () => void; kind: string } | null = null;

function ac(): AudioContext | null {
  if (!ctx) {
    try {
      ctx = new AudioContext();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function unlockAudio() {
  ac();
}

function noise(t0: number, dur: number, freq: number, q: number, vol: number, type: BiquadFilterType = 'bandpass', sweepTo?: number) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t0);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(t0, Math.random());
  src.stop(t0 + dur + 0.05);
}

function tone(t0: number, dur: number, freq: number, vol: number, type: OscillatorType = 'sine', to?: number) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master!);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

export function sfx(id: string) {
  if (!G.settings.sound) return;
  const c = ac();
  if (!c || !master) return;
  const t = c.currentTime + 0.01;
  switch (id) {
    case 'click':
      tone(t, 0.04, 1800, 0.08, 'square');
      break;
    case 'button':
      noise(t, 0.05, 2500, 3, 0.25);
      tone(t, 0.06, 220, 0.12, 'square', 110);
      break;
    case 'pistol':
      noise(t, 0.25, 1200, 0.7, 0.9, 'lowpass', 200);
      tone(t, 0.12, 180, 0.4, 'triangle', 50);
      break;
    case 'rifle':
      noise(t, 0.4, 2000, 0.6, 1, 'lowpass', 150);
      tone(t, 0.18, 140, 0.5, 'triangle', 40);
      break;
    case 'shotgun':
      noise(t, 0.5, 900, 0.5, 1, 'lowpass', 120);
      tone(t, 0.25, 100, 0.6, 'triangle', 35);
      break;
    case 'smg':
    case 'minigun': {
      const n = id === 'minigun' ? 14 : 7;
      for (let i = 0; i < n; i++) noise(t + i * 0.07, 0.09, 1500, 0.8, 0.6, 'lowpass', 300);
      break;
    }
    case 'laser':
      tone(t, 0.3, 1400, 0.25, 'sawtooth', 300);
      tone(t, 0.3, 1410, 0.15, 'square', 290);
      break;
    case 'plasma':
      tone(t, 0.45, 300, 0.3, 'sawtooth', 60);
      noise(t, 0.4, 600, 2, 0.4, 'bandpass', 100);
      break;
    case 'flame':
      noise(t, 0.8, 500, 0.5, 0.7, 'lowpass', 1500);
      break;
    case 'rocket':
      noise(t, 0.6, 400, 0.6, 0.8, 'lowpass', 2000);
      break;
    case 'explode':
      noise(t, 1.2, 800, 0.5, 1, 'lowpass', 60);
      tone(t, 0.8, 70, 0.8, 'sine', 25);
      break;
    case 'swing':
    case 'throw':
      noise(t, 0.2, 800, 2, 0.4, 'bandpass', 3000);
      break;
    case 'punch':
    case 'hit':
      noise(t, 0.12, 300, 1, 0.8, 'lowpass');
      tone(t, 0.1, 90, 0.5, 'sine', 50);
      break;
    case 'miss':
      noise(t, 0.15, 3000, 4, 0.25, 'bandpass', 5000);
      break;
    case 'bite':
      noise(t, 0.1, 1800, 3, 0.4);
      break;
    case 'death':
      tone(t, 0.6, 200, 0.3, 'sawtooth', 60);
      noise(t, 0.3, 400, 1, 0.3, 'lowpass');
      break;
    case 'door':
      tone(t, 0.25, 120, 0.3, 'square', 70);
      noise(t, 0.3, 500, 1, 0.3, 'lowpass');
      break;
    case 'hatch':
      for (let i = 0; i < 6; i++) tone(t + i * 0.18, 0.15, 90 - i * 5, 0.35, 'sawtooth', 60);
      noise(t, 1.4, 300, 0.7, 0.5, 'lowpass', 80);
      break;
    case 'locked':
      tone(t, 0.08, 400, 0.2, 'square');
      tone(t + 0.1, 0.08, 300, 0.2, 'square');
      break;
    case 'pickup':
      tone(t, 0.08, 600, 0.15, 'triangle', 900);
      break;
    case 'drug':
      noise(t, 0.2, 5000, 2, 0.25, 'highpass');
      tone(t + 0.05, 0.15, 900, 0.12, 'sine', 500);
      break;
    case 'levelup':
      [523, 659, 784, 1046].forEach((f, i) => tone(t + i * 0.12, 0.3, f, 0.18, 'square'));
      break;
    case 'quest':
      [392, 523].forEach((f, i) => tone(t + i * 0.15, 0.35, f, 0.15, 'triangle'));
      break;
    case 'geiger':
      for (let i = 0; i < 6; i++) noise(t + Math.random() * 0.4, 0.01, 4000, 1, 0.5, 'highpass');
      break;
    case 'encounter':
      tone(t, 0.5, 220, 0.2, 'sawtooth', 110);
      tone(t + 0.25, 0.5, 207, 0.2, 'sawtooth', 100);
      break;
    case 'step':
      noise(t, 0.06, 300, 1, 0.08, 'lowpass');
      break;
    case 'terminal':
      for (let i = 0; i < 5; i++) tone(t + i * 0.05, 0.04, 800 + Math.random() * 1200, 0.08, 'square');
      break;
    case 'coins':
      for (let i = 0; i < 4; i++) tone(t + i * 0.05, 0.08, 2000 + i * 300, 0.1, 'triangle');
      break;
    case 'crit':
      tone(t, 0.2, 120, 0.5, 'square', 40);
      noise(t, 0.3, 200, 1, 0.8, 'lowpass');
      break;
  }
}

/** Ambient drone per environment: 'wind', 'cave', 'shelter', 'town', 'none'. */
export function setAmbient(kind: string) {
  if (!G.settings.music) kind = 'none';
  if (ambient?.kind === kind) return;
  ambient?.stop();
  ambient = null;
  if (kind === 'none') return;
  const c = ac();
  if (!c || !master) return;
  const out = c.createGain();
  out.gain.value = 0;
  out.gain.linearRampToValueAtTime(0.18, c.currentTime + 3);
  out.connect(master);
  const nodes: AudioScheduledSourceNode[] = [];
  const base = kind === 'cave' ? 55 : kind === 'shelter' ? 60 : kind === 'town' ? 73.4 : 49;
  // Slowly beating detuned drones.
  for (const [mult, det, vol] of [[1, 0, 0.3], [1.5, 3, 0.12], [2, -4, 0.1], [0.5, 1, 0.25]] as const) {
    const o = c.createOscillator();
    o.type = kind === 'shelter' ? 'triangle' : 'sine';
    o.frequency.value = base * mult;
    o.detune.value = det;
    const g = c.createGain();
    g.gain.value = vol;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.05 + Math.random() * 0.1;
    const lg = c.createGain();
    lg.gain.value = vol * 0.8;
    lfo.connect(lg).connect(g.gain);
    o.connect(g).connect(out);
    o.start();
    lfo.start();
    nodes.push(o, lfo);
  }
  if (kind === 'wind' || kind === 'cave') {
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = kind === 'wind' ? 400 : 200;
    f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.value = kind === 'wind' ? 0.35 : 0.15;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.08;
    const lg = c.createGain();
    lg.gain.value = 250;
    lfo.connect(lg).connect(f.frequency);
    src.connect(f).connect(g).connect(out);
    src.start();
    lfo.start();
    nodes.push(src, lfo);
  }
  ambient = {
    kind,
    stop: () => {
      const t = c.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0, t + 1.5);
      setTimeout(() => nodes.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } }), 1700);
    },
  };
}
