// Ambience: looping beds of filtered noise and oscillators (wind, surf, swamp, forest,
// machines, eerie drones, insects, weather, town murmur) with sparse random events,
// crossfaded over about two seconds as the region, hour and weather change.
import { mix } from './core';
import { ac, rnd, irnd, pick, clamp, own, gain, filt, osc, pan, loop, nsrc, lfo, ramp, run, collect, env, hold, tone, hiss, metal, vox, VOW, whir, lead, texture } from './synth';
import { L } from './sfx';

export interface AmbState { region: string; hour: number; weather: string; intensity: number; inTown: boolean; underwater?: boolean }

/** Parameters derived from the state, shared by the beds. */
interface P { region: string; night: number; day: number; wind: number; gust: number; bright: number; whistle: number; grit: number; roar: number; rain: number; acid: number }
interface Bed {
  out: GainNode; // the bed's fader
  wet: GainNode; // its reverb send, for the one-shots
  srcs: AudioScheduledSourceNode[];
  lvl: number;
  off: number; // when it fell silent
  next: number; // time of its next one-shot
  set?: (p: P) => void;
  ev?: (t: number, p: P) => number; // schedules a one-shot at t; returns the gap to the next
}
type Maker = (b: Bed) => Pick<Bed, 'set' | 'ev'>;

// wind, gustiness, whistle, birds, crickets at night, cicadas in heat, the region's own bed
const REG: Record<string, [number, number, number, number, number, number, string?]> = {
  flats: [0.35, 0.4, 0.2, 0.15, 0.7, 0.8],
  salt: [0.55, 0.6, 0.5, 0, 0.25, 0.5],
  vale: [0.2, 0.3, 0.05, 1, 1, 0.5],
  coast: [0.3, 0.4, 0.1, 0.6, 0.5, 0.2, 'surf'],
  ember: [0.35, 0.5, 0.15, 0, 0.4, 1],
  highlands: [0.6, 0.7, 0.6, 0.2, 0.5, 0.2],
  thrumwood: [0.12, 0.2, 0, 0.3, 0.8, 0.3, 'forest'],
  mire: [0.1, 0.2, 0, 0, 0.9, 0, 'swamp'],
  ash: [0.3, 0.4, 0.3, 0, 0, 0, 'eerie'],
  bonesea: [0.6, 0.7, 0.5, 0, 0.2, 0.6],
  rust: [0.3, 0.5, 0.3, 0, 0.3, 0.3, 'machines'],
  glass: [0.3, 0.4, 0.4, 0, 0, 0, 'eerie'],
};
const VOWELS = Object.values(VOW);
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** A panned input for a bed's one-shot, partly sent to the reverb. */
function spot(b: Bed, p: number, g: number, wet = 0.3, to: AudioNode = b.out): GainNode {
  const i = gain(g), pn = pan(p);
  i.connect(pn).connect(to);
  pn.connect(gain(wet)).connect(b.wet);
  return i;
}

// ---------- one-shots ----------

function frogs(o: AudioNode, t: number) {
  const f = rnd(90, 220), n = irnd(2, 5), gap = rnd(0.3, 0.65), len = rnd(0.1, 0.22), end = t + n * gap + 0.3;
  const s = osc('sawtooth', f), am = gain(0.5), e = gain(0);
  lfo(am.gain, rnd(35, 60), 0.5, 'square', t, end); // the rattle of a croak
  s.connect(am).connect(filt('bandpass', f * rnd(3, 5), 4)).connect(e).connect(o);
  for (let k = 0; k < n; k++) {
    const at = t + k * gap * rnd(0.9, 1.1);
    e.gain.setValueAtTime(0, at);
    e.gain.linearRampToValueAtTime(1, at + 0.02);
    e.gain.setTargetAtTime(0, at + len, 0.03);
  }
  run(s, t, end);
}
function bubbles(o: AudioNode, t: number, n: number) {
  for (let i = 0; i < n; i++) { const f = rnd(300, 1100); tone(o, t + rnd(0, 0.6), 'sine', f, f * rnd(1.8, 2.8), 0.003, rnd(0.03, 0.07), rnd(0.2, 0.5)); }
}
function peeps(o: AudioNode, t: number) {
  const f = rnd(2400, 3600);
  for (let i = 0, n = irnd(2, 6); i < n; i++) tone(o, t + i * rnd(0.12, 0.2), 'sine', f, f * 1.2, 0.004, 0.035, 0.25);
}
function chatter(o: AudioNode, t: number) {
  const n = irnd(6, 20), gap = rnd(0.018, 0.045), e = gain(0);
  for (let k = 0; k < n; k++) { e.gain.setValueAtTime(rnd(0.5, 1), t + k * gap); e.gain.setTargetAtTime(0, t + k * gap + 0.001, 0.003); }
  nsrc(t, n * gap + 0.05).connect(filt('bandpass', rnd(3500, 6500), 5)).connect(e).connect(o);
}
function buzz(o: AudioNode, t: number) {
  const d = rnd(0.6, 2), am = gain(0.5);
  lfo(am.gain, rnd(40, 90), 0.5, 'sine', t, t + d + 0.1);
  nsrc(t, d + 0.1).connect(filt('bandpass', rnd(3800, 5200), 4)).connect(am).connect(hold(t, d * 0.3, 0.6, d * 0.6, d * 0.4)).connect(o);
}
function song(o: AudioNode, t: number) {
  const f = rnd(2200, 4200), r = Math.random();
  if (r < 0.45) { // a warble between two notes
    const f2 = f * rnd(1.1, 1.35);
    for (let i = 0, n = irnd(3, 7); i < n; i++) { const g = i % 2 ? f2 : f; tone(o, t + i * rnd(0.07, 0.11), 'sine', g, g * rnd(0.8, 1.2), 0.005, 0.05, 0.5); }
  } else if (r < 0.75) { // a falling two-note whistle
    tone(o, t, 'sine', f * 0.6, f * 0.63, 0.03, 0.22, 0.45);
    tone(o, t + rnd(0.3, 0.4), 'sine', f * 0.5, f * 0.47, 0.03, 0.28, 0.4);
  } else { // a trill
    const s = osc('sine', f), am = gain(0.5);
    s.frequency.setValueAtTime(f, t);
    s.frequency.linearRampToValueAtTime(f * 0.78, t + 0.6);
    lfo(am.gain, rnd(20, 30), 0.5, 'sine', t, t + 0.7);
    s.connect(am).connect(hold(t, 0.03, 0.4, 0.5, 0.1)).connect(o);
    run(s, t, t + 0.7);
  }
}
function gull(o: AudioNode, t: number) {
  const f = rnd(1000, 1400);
  for (let i = 0, n = irnd(1, 3); i < n; i++) {
    const at = t + i * rnd(0.35, 0.5), s = osc('sawtooth', f);
    s.frequency.setValueAtTime(f * 0.8, at);
    s.frequency.linearRampToValueAtTime(f * 1.25, at + 0.08);
    s.frequency.exponentialRampToValueAtTime(f * 0.72, at + 0.36);
    s.connect(filt('bandpass', 1700, 2)).connect(env(at, 0.03, 0.35, 0.3)).connect(o);
    run(s, at, at + 0.45);
  }
}
function hawk(o: AudioNode, t: number) {
  const s = osc('sawtooth', 2700);
  s.frequency.setValueAtTime(2700, t);
  s.frequency.exponentialRampToValueAtTime(1500, t + 0.9);
  lfo(s.frequency, 9, 40, 'sine', t, t + 1.05);
  s.connect(filt('bandpass', 2400, 3)).connect(hold(t, 0.05, 0.3, 0.6, 0.35)).connect(o);
  run(s, t, t + 1.05);
}
function tinkle(o: AudioNode, t: number) {
  for (let i = 0, n = irnd(2, 5); i < n; i++) metal(o, t + rnd(0, 0.7), rnd(2200, 4800), [1, 2.32, 4.25], rnd(0.4, 1.1), rnd(0.3, 0.6));
}
function thunder(o: AudioNode, t: number) {
  hiss(o, t, 'lowpass', 500, 90, 0.08, rnd(0.6, 1), 1, 0.7, mix!.brown); // the crack, far off
  hiss(o, t + rnd(0.2, 0.6), 'lowpass', 260, 60, 0.4, rnd(2.5, 4.5), 1, 0.7, mix!.brown); // rolling away
}
function hammer(o: AudioNode, t: number) {
  const f = rnd(1900, 2700), gap = rnd(0.4, 0.6);
  for (let i = 0, n = irnd(2, 4); i < n; i++) metal(o, t + i * gap, f * rnd(0.98, 1.02), [1, 2.4, 3.9], 0.35, 0.5);
}

// ---------- beds: [trim, maker] ----------

const BEDS: Record<string, [number, Maker]> = {
  // a pink-noise body, a low roar and sand grit through gusting LFOs, plus a whistle
  wind: [1, (b) => {
    const n = loop(mix!.pink), w = loop(mix!.white), gust = gain(1);
    const body = filt('bandpass', 420, 0.8), low = filt('lowpass', 160, 0.7), grit = filt('highpass', 2800, 0.7), whis = filt('bandpass', 950, 16);
    const gb = gain(0), gl = gain(0), gg = gain(0), gw = gain(0);
    n.connect(body).connect(gb).connect(gust);
    n.connect(low).connect(gl).connect(gust);
    w.connect(grit).connect(gg).connect(gust);
    w.connect(whis).connect(gw).connect(b.out);
    gust.connect(b.out);
    const [o1, d1] = lfo(gust.gain, rnd(0.05, 0.08), 0.3), [o2, d2] = lfo(gust.gain, rnd(0.12, 0.17), 0.2);
    lfo(body.frequency, 0.09, 120);
    lfo(whis.frequency, 0.061, 300);
    lfo(grit.frequency, 0.13, 900);
    return {
      set(p) {
        ramp(gb.gain, p.wind * 1.6); ramp(gl.gain, p.roar * 1.1); ramp(gg.gain, p.grit * 0.6); ramp(gw.gain, p.whistle * 0.5);
        ramp(body.frequency, 300 + 450 * p.bright);
        ramp(d1.gain, 0.2 + 0.35 * p.gust); ramp(d2.gain, 0.12 + 0.3 * p.gust);
        ramp(o1.frequency, 0.05 + 0.1 * p.gust); ramp(o2.frequency, 0.12 + 0.25 * p.gust);
      },
    };
  }],
  // waves: a brown-noise swell that rises, breaks into a hiss of foam and draws back
  surf: [0.5, (b) => {
    const lp = filt('lowpass', 420, 0.5), sw = gain(0.15), bp = filt('bandpass', 2500, 0.6), wash = gain(0);
    loop(mix!.brown).connect(lp).connect(sw).connect(b.out);
    loop(mix!.white).connect(bp).connect(wash).connect(b.out);
    return {
      ev(t) {
        const up = rnd(1.6, 2.8), pk = rnd(0.5, 1);
        sw.gain.setTargetAtTime(0.15 + pk, t, up / 3);
        lp.frequency.setTargetAtTime(600 + pk * 900, t, up / 3);
        wash.gain.setTargetAtTime(pk * 0.4, t + up * 0.8, 0.25);
        sw.gain.setTargetAtTime(0.15, t + up, 1.6);
        lp.frequency.setTargetAtTime(420, t + up, 1.8);
        wash.gain.setTargetAtTime(0, t + up + 0.3, 1.1);
        return rnd(5.5, 10);
      },
    };
  }],
  // murky water, a drifting insect whine, frogs, bubbles and peepers
  swamp: [1, (b) => {
    const bp = filt('bandpass', 650, 3), bz = gain(0.012), pn = pan(0);
    loop(mix!.brown).connect(filt('lowpass', 380, 0.6)).connect(gain(0.25)).connect(b.out);
    for (const f of [rnd(200, 215), rnd(218, 232)]) {
      const s = osc('sawtooth', f);
      s.connect(bp);
      run(s, ac().currentTime);
      lfo(s.frequency, rnd(0.15, 0.3), 5);
    }
    bp.connect(bz).connect(pn).connect(b.out);
    lfo(bz.gain, 0.09, 0.01);
    lfo(pn.pan, 0.05, 0.8);
    return {
      ev(t, p) {
        const r = Math.random(), sp = spot(b, rnd(-0.9, 0.9), rnd(0.3, 0.8), 0.35);
        if (r < 0.55) frogs(sp, t);
        else if (r < 0.8) bubbles(sp, t, irnd(2, 5));
        else peeps(sp, t);
        return rnd(0.35, 1.8) * (1.4 - 0.6 * p.night);
      },
    };
  }],
  // the Thrumwood: a low throbbing hive drone, a swarm band and insect chatter
  forest: [1, (b) => {
    const lp = filt('lowpass', 240, 0.9), th = gain(0.05), bp = filt('bandpass', 225, 6), sw = gain(0.8);
    for (const [f, dt] of [[55, -6], [55, 7], [82.4, 3], [110, -4]]) {
      const s = osc('sawtooth', f);
      s.detune.value = dt;
      s.connect(lp);
      run(s, ac().currentTime);
    }
    lp.connect(th).connect(b.out);
    lfo(th.gain, rnd(0.45, 0.7), 0.022);
    lfo(lp.frequency, 0.05, 70);
    loop(mix!.pink).connect(bp).connect(sw).connect(b.out);
    lfo(sw.gain, 0.13, 0.4);
    return {
      ev(t) {
        const sp = spot(b, rnd(-0.9, 0.9), rnd(0.2, 0.5), 0.3);
        if (Math.random() < 0.6) chatter(sp, t); else buzz(sp, t);
        return rnd(0.7, 2.6);
      },
    };
  }],
  // the Rustwastes: mains hum, distant clanks, servos and steam
  machines: [1, (b) => {
    const lp = filt('lowpass', 500, 0.7), hm = gain(0.05);
    for (const [f, v] of [[50, 1], [100.4, 0.5], [150, 0.35]]) {
      const s = osc(f > 120 ? 'sawtooth' : 'sine', f);
      s.connect(gain(v)).connect(lp);
      run(s, ac().currentTime);
    }
    lp.connect(hm).connect(b.out);
    lfo(hm.gain, 0.21, 0.02);
    return {
      ev(t) {
        const r = Math.random(), sp = spot(b, rnd(-0.9, 0.9), rnd(0.15, 0.45), 0.7);
        if (r < 0.5) {
          metal(sp, t, rnd(160, 420), [1, 2.76, 5.4], rnd(0.8, 1.8), 0.5);
          tone(sp, t, 'sine', 90, 50, 0.002, 0.2, 0.5);
          if (Math.random() < 0.4) metal(sp, t + rnd(0.2, 0.5), rnd(200, 500), [1, 2.76], 0.6, 0.3);
        } else if (r < 0.75) whir(sp, t, rnd(0.5, 1.2), rnd(120, 200), 0.4);
        else hiss(sp, t, 'highpass', 2500, 4200, 0.2, rnd(0.8, 1.6), 0.4);
        return rnd(1.8, 6.5);
      },
    };
  }],
  // Ashfields and Glasslands: a dissonant low drone, dry air and glassy tinkles
  eerie: [1, (b) => {
    const lp = filt('lowpass', 420, 0.9), dg = gain(0.045), R = [1, 1.5, 1.06, 2], bp = filt('bandpass', 1300, 1.2), ag = gain(0.5);
    const os = R.map((r, i) => { const s = osc((['sine', 'sawtooth', 'sine', 'triangle'] as const)[i], 50 * r); s.connect(lp); return run(s, ac().currentTime); });
    lfo(os[2].detune, 0.031, 18);
    lfo(dg.gain, 0.07, 0.016);
    lp.connect(dg).connect(b.out);
    loop(mix!.pink).connect(bp).connect(ag).connect(b.out);
    lfo(ag.gain, 0.05, 0.3);
    lfo(bp.frequency, 0.037, 500);
    return {
      set(p) { const f = p.region === 'glass' ? 61.7 : 46.2; os.forEach((s, i) => ramp(s.frequency, f * R[i], 2)); },
      ev(t, p) {
        const glass = p.region === 'glass', sp = spot(b, rnd(-1, 1), glass ? rnd(0.2, 0.5) : rnd(0.1, 0.3), 0.8);
        if (Math.random() < (glass ? 0.75 : 0.4)) tinkle(sp, t);
        else if (glass) lead(sp, t, irnd(76, 88), rnd(1.5, 3), 0.15); // a singing pane
        else nsrc(t, 1.3, texture('crackle')).connect(filt('lowpass', 2500, 0.7)).connect(env(t, 0.2, 0.5, 1)).connect(sp); // embers
        return glass ? rnd(1.2, 4.5) : rnd(3, 8);
      },
    };
  }],
  birds: [1, (b) => ({
    ev(t, p) {
      const sp = spot(b, rnd(-0.9, 0.9), rnd(0.3, 0.7), 0.35);
      if (p.region === 'coast') gull(sp, t);
      else if ((p.region === 'flats' || p.region === 'highlands') && Math.random() < 0.35) hawk(sp, t);
      else song(sp, t);
      return rnd(1.2, 5) / Math.max(0.25, b.lvl);
    },
  })],
  // three crickets: a high tone pulsed ~30 times a second, gated into chirps
  crickets: [1, (b) => {
    for (let i = 0; i < 3; i++) {
      const s = osc('sine', rnd(4300, 5200)), am = gain(0.5), gate = gain(0.5);
      lfo(am.gain, rnd(26, 34), 0.5);
      lfo(gate.gain, rnd(1.4, 2.8), 0.5, 'square');
      s.connect(am).connect(gate).connect(gain(rnd(0.05, 0.09))).connect(pan(rnd(-0.8, 0.8))).connect(b.out);
      run(s, ac().currentTime);
    }
    return {};
  }],
  cicadas: [2, (b) => {
    const am = gain(0.5), sw = gain(0.5);
    lfo(am.gain, rnd(70, 95), 0.5);
    lfo(sw.gain, rnd(0.05, 0.09), 0.45);
    loop(mix!.white).connect(filt('bandpass', rnd(4800, 5600), 5)).connect(am).connect(sw).connect(b.out);
    return {};
  }],
  // hiss plus pre-rendered drips; acid rain adds a sizzle; heavy rain brings thunder
  rain: [1, (b) => {
    const lp = filt('lowpass', 6000, 0.5), hg = gain(0), dg = gain(0), cg = gain(0);
    loop(mix!.white).connect(filt('highpass', 700, 0.5)).connect(lp).connect(hg).connect(b.out);
    loop(texture('drips'), rnd(0.9, 1.1)).connect(dg).connect(b.out);
    loop(texture('crackle'), 2.3).connect(filt('highpass', 3500, 0.7)).connect(cg).connect(b.out);
    return {
      set(p) { ramp(hg.gain, 0.15 + 0.6 * p.rain); ramp(lp.frequency, 3500 + 5000 * p.rain); ramp(dg.gain, 0.2 + 0.5 * p.rain); ramp(cg.gain, p.acid * 1.2); },
      ev(t, p) {
        if (p.rain > 0.55 && Math.random() < 0.35) thunder(spot(b, rnd(-0.6, 0.6), 0.5, 0.6), t);
        return rnd(10, 25);
      },
    };
  }],
  gas: [1, (b) => {
    const g = gain(0.5);
    loop(mix!.pink).connect(filt('bandpass', 750, 0.6)).connect(filt('lowpass', 1800, 0.5)).connect(g).connect(b.out);
    lfo(g.gain, 0.045, 0.2);
    return { ev(t) { hiss(spot(b, rnd(-0.7, 0.7), 0.5, 0.3), t, 'bandpass', 1400, 900, 0.3, rnd(0.8, 1.6), 0.5, 0.8); return rnd(4, 10); } };
  }],
  spores: [1, (b) => ({
    ev(t) { hiss(spot(b, rnd(-0.8, 0.8), 0.5, 0.4), t, 'lowpass', rnd(600, 1100), 250, 0.03, rnd(0.2, 0.45), 0.6); return rnd(0.6, 2.5); },
  })],
  // a murmur of many voices (noise bands with a syllabic flutter), distant talk and smithing
  town: [2, (b) => {
    for (const [f, p] of [[480, -0.5], [900, 0.5]]) {
      const am = gain(0.35);
      loop(mix!.pink).connect(filt('bandpass', f, 1.3)).connect(am).connect(pan(p)).connect(b.out);
      loop(mix!.brown, 0.06).connect(filt('lowpass', 6, 0.5)).connect(gain(1.4)).connect(am.gain);
    }
    const far = filt('lowpass', 1500, 0.5);
    far.connect(b.out);
    return {
      ev(t, p) {
        if (p.day > 0.5 && Math.random() < 0.3) hammer(spot(b, rnd(-0.9, 0.9), 0.25, 0.6), t);
        else {
          const f = rnd(100, 230), d = rnd(0.15, 0.5);
          vox(spot(b, rnd(-0.9, 0.9), 0.12, 0.5, far), t, d, f, f * rnd(0.8, 1.25), pick(VOWELS), pick(VOWELS), 1, 0, 0.1);
        }
        return rnd(0.5, 2.2);
      },
    };
  }],
  under: [1, (b) => {
    const g = gain(0.3);
    loop(mix!.brown).connect(filt('lowpass', 280, 0.7)).connect(g).connect(b.out);
    lfo(g.gain, 0.08, 0.1);
    return { ev(t) { bubbles(spot(b, rnd(-0.6, 0.6), 0.5, 0.2), t, irnd(3, 7)); return rnd(0.8, 3); } };
  }],
};

const beds = new Map<string, Bed>();
let state: AmbState | null = null, params: P | null = null, dirty = false, applied = -9;

export function setAmb(a: AmbState) {
  if (!a || typeof a !== 'object') return;
  state = { ...a };
  dirty = true;
}

function derive(a: AmbState) {
  const R = own(REG, String(a.region)) || REG.flats, k = clamp(+a.intensity || 0, 0, 1), w = a.weather;
  const h = (((+a.hour || 0) % 24) + 24) % 24, night = h < 12 ? 1 - smooth(4.75, 6.25, h) : smooth(18.75, 20.25, h), day = 1 - night;
  const is = (x: string) => (w === x ? k : 0);
  const near = clamp(1 - (L.dist - 60) / 700, 0.2, 1), high = 1 - near; // zoomed out: less ground life, more wind
  const storm = Math.max(is('dust'), is('ash')), rain = Math.max(is('rain'), is('acid'));
  const p: P = {
    region: a.region, night, day, rain, acid: is('acid'),
    wind: (R[0] * (1 + 0.3 * night) + (w === 'overcast' ? 0.06 : 0) + 0.12 * rain + 0.2 * high) * (1 - 0.5 * is('fog')),
    gust: clamp(R[1] + 0.6 * storm + 0.3 * high, 0, 1),
    bright: clamp(0.25 + 0.45 * night + 0.4 * storm, 0, 1),
    whistle: R[2] * (0.35 + 0.65 * night) + 0.25 * is('dust'),
    grit: 0.5 * is('dust') + 0.15 * is('ash'),
    roar: 0.55 * storm,
  };
  const calm = (1 - 0.7 * rain) * (1 - 0.8 * storm); // wildlife keeps quiet in foul weather
  const lv: Record<string, number> = {
    wind: 1,
    birds: R[3] * day * near * calm,
    crickets: R[4] * night * near * calm,
    cicadas: R[5] * is('heat') * day * near,
    rain: rain > 0.01 ? 0.3 + 0.7 * rain : 0,
    gas: is('gas'),
    spores: is('spores') * near,
    town: a.inTown ? (0.4 + 0.6 * day) * near : 0,
  };
  const special = R[6];
  if (special) lv[special] = (special === 'swamp' ? 0.8 + 0.2 * night : 1) * (0.5 + 0.5 * near);
  if (a.underwater) { for (const n in lv) lv[n] *= 0.1; lv.under = 1; }
  return { p, lv, cut: a.underwater ? 500 : 18000 * Math.pow(0.25, is('fog')) };
}

function build(name: string, now: number): Bed {
  const m = mix!, b: Bed = { out: gain(0), wet: gain(0), srcs: [], lvl: 0, off: 0, next: now + rnd(0.5, 3) };
  b.out.connect(m.amb.dry);
  b.wet.connect(m.amb.wet);
  collect(b.srcs);
  try { Object.assign(b, BEDS[name][1](b)); } finally { collect(null); }
  beds.set(name, b);
  return b;
}

function apply(now: number) {
  const { p, lv, cut } = derive(state!);
  params = p;
  for (const name of Object.keys(BEDS)) {
    const lvl = (lv[name] || 0) * BEDS[name][0];
    let b = beds.get(name);
    if (!b) {
      if (lvl < 0.002) continue;
      b = build(name, now);
    }
    b.lvl = lvl;
    ramp(b.out.gain, lvl);
    ramp(b.wet.gain, lvl);
    b.off = lvl < 0.002 ? b.off || now : 0;
    b.set?.(p);
  }
  for (const f of mix!.world) ramp(f.frequency, cut);
}

/** Runs from the audio tick while the context is running. */
export function tickAmb(now: number) {
  if (!state) return;
  if (dirty || now - applied > 0.5) { dirty = false; applied = now; apply(now); }
  for (const [name, b] of beds) {
    if (b.off && now - b.off > 8) { // silent for a while: free it
      for (const s of b.srcs) try { s.stop(); } catch { /* already stopped */ }
      b.out.disconnect();
      b.wet.disconnect();
      beds.delete(name);
      continue;
    }
    if (!b.ev || b.lvl < 0.01) continue;
    if (b.next < now) b.next = now + rnd(0.05, 0.3);
    for (let i = 0; i < 8 && b.next < now + 0.25; i++) b.next += Math.max(0.1, b.ev(b.next, params!));
  }
}
