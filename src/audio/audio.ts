// Audio context, mixer buses and settings. Audio starts only after a user
// gesture (browsers require it), which the title screen provides.

export const audio = {
  ctx: null as AudioContext | null,
  master: null as GainNode | null,
  music: null as GainNode | null,
  sfx: null as GainNode | null,
  ambience: null as GainNode | null,
  reverb: null as ConvolverNode | null,
  reverbSend: null as GainNode | null,
  vol: { master: 0.8, music: 0.55, sfx: 0.8, ambience: 0.5 },
  started: false,
  noise: null as AudioBuffer | null,
};

export function initAudio(): boolean {
  if (audio.started) {
    if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
    return true;
  }
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
    const ctx = new Ctx();
    audio.ctx = ctx;
    audio.master = ctx.createGain();
    audio.master.gain.value = audio.vol.master;
    // gentle master compression keeps sums from clipping
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    comp.attack.value = 0.01;
    comp.release.value = 0.2;
    audio.master.connect(comp);
    comp.connect(ctx.destination);
    audio.music = ctx.createGain();
    audio.music.gain.value = audio.vol.music;
    audio.sfx = ctx.createGain();
    audio.sfx.gain.value = audio.vol.sfx;
    audio.ambience = ctx.createGain();
    audio.ambience.gain.value = audio.vol.ambience;
    audio.music.connect(audio.master);
    audio.sfx.connect(audio.master);
    audio.ambience.connect(audio.master);
    // a small room reverb for music
    audio.reverb = ctx.createConvolver();
    audio.reverb.buffer = makeImpulse(ctx, 2.2, 2.8);
    audio.reverbSend = ctx.createGain();
    audio.reverbSend.gain.value = 0.28;
    audio.reverbSend.connect(audio.reverb);
    audio.reverb.connect(audio.music);
    // white noise buffer shared by instruments
    const n = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    audio.noise = n;
    audio.started = true;
    return true;
  } catch (e) {
    console.warn('audio unavailable', e);
    return false;
  }
}

function makeImpulse(ctx: AudioContext, secs: number, decay: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * secs);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
  }
  return buf;
}

export function setVolume(bus: 'master' | 'music' | 'sfx' | 'ambience', v: number) {
  audio.vol[bus] = v;
  const node = audio[bus];
  if (node && audio.ctx) node.gain.setTargetAtTime(v, audio.ctx.currentTime, 0.05);
  try { localStorage.setItem('obi_vol', JSON.stringify(audio.vol)); } catch { /* storage unavailable */ }
}

export function loadVolumes() {
  try {
    const v = localStorage.getItem('obi_vol');
    if (v) Object.assign(audio.vol, JSON.parse(v));
  } catch { /* storage unavailable */ }
}

export const now = () => (audio.ctx ? audio.ctx.currentTime : 0);
