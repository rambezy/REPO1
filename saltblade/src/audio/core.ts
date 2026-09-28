// Audio context, mixer buses (sfx, ambience, music, ui), the shared reverb and
// music echo, cached noise buffers, and volumes persisted to localStorage.

export type Vols = { master: number; sfx: number; music: number; ambience: number };
/** A category fader pair: dry toward the master, wet into the shared reverb. */
export interface Bus { dry: GainNode; wet: GainNode }
export interface Mix {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
  world: BiquadFilterNode[]; // lowpass on in-world sound, dry and wet (fog, underwater)
  sfx: Bus;
  amb: Bus;
  mus: Bus;
  ui: GainNode;
  echo: GainNode; // send into the music's feedback delay
  white: AudioBuffer; // stereo, loopable
  pink: AudioBuffer;
  brown: AudioBuffer;
  mono: AudioBuffer; // mono white noise for one-shots
}

export let mix: Mix | null = null;
export const vols: Vols = { master: 0.8, sfx: 0.8, music: 0.5, ambience: 0.6 };
const KEY = 'saltblade.volumes';
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
// sliders map to gain through a squared taper so equal steps sound roughly even
const taper = (v: number) => v * v;

export function loadVols() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (o && typeof o === 'object') {
      for (const k of Object.keys(vols) as (keyof Vols)[]) if (typeof o[k] === 'number' && isFinite(o[k])) vols[k] = clamp01(o[k]);
    }
  } catch { /* storage blocked or corrupt: keep defaults */ }
}

export function setVols(v: Partial<Vols>) {
  for (const k of Object.keys(vols) as (keyof Vols)[]) {
    const x = v[k];
    if (typeof x === 'number' && isFinite(x)) vols[k] = clamp01(x);
  }
  applyVols();
  try { localStorage.setItem(KEY, JSON.stringify(vols)); } catch { /* storage blocked */ }
}

function applyVols() {
  const m = mix;
  if (!m) return;
  const t = m.ctx.currentTime;
  const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, t, 0.04);
  set(m.master, taper(vols.master));
  for (const g of [m.sfx.dry, m.sfx.wet, m.ui]) set(g, taper(vols.sfx));
  for (const g of [m.amb.dry, m.amb.wet]) set(g, taper(vols.ambience));
  for (const g of [m.mus.dry, m.mus.wet]) set(g, taper(vols.music));
}

/** Builds the context and mixer. Returns null when Web Audio is unavailable. */
export function createMix(): Mix | null {
  if (mix) return mix;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const AC = w.AudioContext || w.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const g = (v: number) => { const n = ctx.createGain(); n.gain.value = v; return n; };
  const lp = (f: number) => { const n = ctx.createBiquadFilter(); n.type = 'lowpass'; n.frequency.value = f; n.Q.value = 0.5; return n; };
  const master = g(taper(vols.master));
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 6;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  master.connect(limiter).connect(ctx.destination);
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, 2.6);
  verb.connect(g(0.8)).connect(master);
  const world = [lp(20000), lp(20000)];
  world[0].connect(master);
  world[1].connect(verb);
  const bus = (dry: AudioNode, wet: AudioNode, v: number): Bus => {
    const b = { dry: g(v), wet: g(v) };
    b.dry.connect(dry);
    b.wet.connect(wet);
    return b;
  };
  const sfx = bus(world[0], world[1], taper(vols.sfx));
  const amb = bus(world[0], world[1], taper(vols.ambience));
  const mus = bus(master, verb, taper(vols.music));
  const ui = g(taper(vols.sfx));
  ui.connect(master);
  // the guitar's echo: a darkening feedback delay that feeds the music bus
  const echo = g(1), dl = ctx.createDelay(2), elp = lp(2600), ehp = ctx.createBiquadFilter();
  ehp.type = 'highpass';
  ehp.frequency.value = 220;
  dl.delayTime.value = 0.46;
  echo.connect(dl).connect(elp).connect(ehp);
  ehp.connect(g(0.34)).connect(dl);
  ehp.connect(mus.dry);
  ehp.connect(mus.wet);
  mix = {
    ctx, master, limiter, world, sfx, amb, mus, ui, echo,
    white: noise(ctx, 'white', 2, 3), pink: noise(ctx, 'pink', 2, 4), brown: noise(ctx, 'brown', 2, 4), mono: noise(ctx, 'white', 1, 2),
  };
  return mix;
}

/** Loopable noise normalised to an RMS of 0.3; the tail is crossfaded into the head. */
function noise(ctx: BaseAudioContext, kind: 'white' | 'pink' | 'brown', chans: number, secs: number): AudioBuffer {
  const sr = ctx.sampleRate, len = Math.floor(sr * secs), X = Math.floor(sr * 0.05);
  const buf = ctx.createBuffer(chans, len, sr), tmp = new Float32Array(len + X);
  for (let c = 0; c < chans; c++) {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, ss = 0;
    for (let i = 0; i < tmp.length; i++) {
      const w = Math.random() * 2 - 1;
      let v = w;
      if (kind === 'pink') { // Paul Kellet's pinking filter
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        v = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
      } else if (kind === 'brown') v = b0 = (b0 + 0.02 * w) / 1.02;
      tmp[i] = v;
      ss += v * v;
    }
    const k = 0.3 / Math.sqrt(ss / tmp.length), d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (i < X ? tmp[i] * (i / X) + tmp[len + i] * (1 - i / X) : tmp[i]) * k;
  }
  return buf;
}

/** A wide open-air reverb tail: stereo noise that decays and darkens. */
function impulse(ctx: BaseAudioContext, secs: number): AudioBuffer {
  const sr = ctx.sampleRate, len = Math.floor(sr * secs), pre = Math.floor(sr * 0.015);
  const buf = ctx.createBuffer(2, len, sr);
  const e = [0, 0];
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const x = (i - pre) / (len - pre);
      lp += (Math.random() * 2 - 1 - lp) * (0.85 - 0.7 * x);
      d[i] = lp * Math.exp(-5.5 * x) * (1 - x);
      e[c] += d[i] * d[i];
    }
  }
  // equal energy in both ears so the tail does not lean to one side
  const k = Math.sqrt(e[0] / e[1]), d = buf.getChannelData(1);
  for (let i = 0; i < len; i++) d[i] *= k;
  return buf;
}
