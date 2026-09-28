// Composed tracks in medieval modes and a look-ahead sequencer that loops
// them with crossfades. Notation: "A4:2 G4:1 | F4:1.5" (note:beats, r = rest).

import { audio } from './audio';
import { pluck, flute, fiddle, drum, choir, drone } from './synth';

type Inst = 'flute' | 'fiddle' | 'harp' | 'lute' | 'flute_bright';
interface Lead { inst: Inst; notes: string; vel?: number; every?: number; offset?: number; alt?: Inst; transpose?: number }
interface Chords { inst: 'lute' | 'harp' | 'choir' | 'bass'; bars: string[]; pattern: [number, number, number][]; vel?: number; base?: number }
interface Track {
  tempo: number;
  bar: number; // beats per bar
  leads: Lead[];
  chords?: Chords[];
  drone?: number[];
  droneVel?: number;
  drums?: [number, 'low' | 'high' | 'tick', number][];
  drumEvery?: number;
}

const NOTE: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function midiOf(n: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(n);
  if (!m) throw new Error('bad note ' + n);
  let v = NOTE[m[1]] + (parseInt(m[3], 10) + 1) * 12;
  if (m[2] === '#') v++;
  if (m[2] === 'b') v--;
  return v;
}
function parseLine(s: string): { beat: number; midi: number | null; dur: number }[] {
  const out: { beat: number; midi: number | null; dur: number }[] = [];
  let beat = 0;
  for (const tok of s.split(/\s+/)) {
    if (!tok || tok === '|') continue;
    const [n, d] = tok.split(':');
    const dur = parseFloat(d);
    out.push({ beat, midi: n === 'r' ? null : midiOf(n), dur });
    beat += dur;
  }
  return out;
}
function chordTones(sym: string, base = 48): number[] {
  const m = /^([A-G])([#b]?)(m?)(7?)$/.exec(sym);
  if (!m) return [base];
  let root = NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  root = base + ((root - (base % 12) + 12) % 12);
  if (root > base + 7) root -= 12;
  const third = m[3] === 'm' ? 3 : 4;
  return [root, root + third, root + 7, root + 12];
}

// ---------- the score ----------

const ARP3: [number, number, number][] = [[0, 0, 0], [0.5, 2, 0], [1, 0, 1], [1.5, 1, 1], [2, 2, 0], [2.5, 1, 1]];
const ARP68: [number, number, number][] = [[0, 0, 0], [1, 2, 0], [2, 0, 1], [3, 1, 1], [4, 2, 0], [5, 0, 1]];
const ARP4: [number, number, number][] = [[0, 0, 0], [0.5, 2, 0], [1, 1, 1], [1.5, 2, 0], [2, 0, 1], [2.5, 2, 0], [3, 1, 1], [3.5, 2, 0]];

export const TRACKS: Record<string, Track> = {
  title: {
    tempo: 64, bar: 3,
    leads: [{ inst: 'flute', notes: 'A4:2 G4:1 | F4:1.5 E4:.5 D4:1 | E4:1 F4:1 G4:1 | A4:3 | C5:2 B4:1 | A4:1.5 G4:.5 F4:1 | G4:1 E4:1 C4:1 | D4:3 | D5:2 C5:1 | A4:2 G4:1 | F4:1 G4:1 A4:1 | E4:3 | F4:1 G4:1 A4:1 | C5:1.5 B4:.5 A4:1 | G4:1 F4:1 E4:1 | D4:3', vel: 0.9 }],
    chords: [{ inst: 'lute', bars: ['Dm', 'Dm', 'C', 'Am', 'C', 'F', 'C', 'Dm', 'Dm', 'F', 'Dm', 'Am', 'F', 'Am', 'C', 'Dm'], pattern: ARP3, vel: 0.7 }],
    drone: [38, 45], droneVel: 0.6,
  },
  village: {
    tempo: 216, bar: 6,
    leads: [{ inst: 'flute_bright', notes: 'D5:2 B4:1 G4:2 A4:1 | B4:2 A4:1 G4:2 D4:1 | E4:2 F4:1 G4:2 A4:1 | B4:3 A4:3 | D5:2 B4:1 G4:2 A4:1 | B4:2 C5:1 D5:2 E5:1 | F5:2 E5:1 D5:2 C5:1 | B4:3 G4:3 | G5:2 F5:1 E5:2 D5:1 | C5:2 D5:1 E5:3 | D5:2 C5:1 B4:2 A4:1 | G4:2 A4:1 B4:3 | C5:2 B4:1 A4:2 G4:1 | F4:2 G4:1 A4:3 | B4:1 C5:1 D5:1 A4:2 F4:1 | G4:6', vel: 0.75, alt: 'fiddle' }],
    chords: [{ inst: 'lute', bars: ['G', 'G', 'C', 'D', 'G', 'G', 'F', 'G', 'C', 'C', 'G', 'G', 'F', 'F', 'Dm', 'G'], pattern: ARP68, vel: 0.65 }],
    drums: [[0, 'low', 0.35], [3, 'tick', 0.25]],
  },
  feast: {
    tempo: 330, bar: 6,
    leads: [{ inst: 'fiddle', notes: 'D5:1 F#5:1 A5:1 A5:1 F#5:1 D5:1 | E5:1 G5:1 B5:1 B5:1 G5:1 E5:1 | D5:1 F#5:1 A5:1 G5:1 F#5:1 E5:1 | D5:3 C5:3 | D5:1 F#5:1 A5:1 A5:1 F#5:1 D5:1 | C5:1 E5:1 G5:1 G5:1 E5:1 C5:1 | D5:1 E5:1 F#5:1 E5:1 C5:1 A4:1 | D5:3 D5:3 | A5:2 B5:1 A5:2 F#5:1 | G5:2 A5:1 G5:2 E5:1 | F#5:2 G5:1 F#5:2 D5:1 | E5:3 C5:3 | A5:2 B5:1 A5:2 F#5:1 | G5:2 A5:1 G5:2 E5:1 | F#5:1 E5:1 D5:1 C5:1 A4:1 C5:1 | D5:6', vel: 0.85 },
      { inst: 'flute_bright', notes: 'r:48 | A5:2 B5:1 A5:2 F#5:1 | G5:2 A5:1 G5:2 E5:1 | F#5:2 G5:1 F#5:2 D5:1 | E5:3 C5:3 | A5:2 B5:1 A5:2 F#5:1 | G5:2 A5:1 G5:2 E5:1 | F#5:1 E5:1 D5:1 C5:1 A4:1 C5:1 | D5:6', vel: 0.45, transpose: -12, every: 2, offset: 1 }],
    chords: [{ inst: 'lute', bars: ['D', 'Em', 'D', 'C', 'D', 'C', 'D', 'D', 'D', 'G', 'D', 'C', 'D', 'G', 'C', 'D'], pattern: [[0, 0, 0], [1, 2, 0], [2, 1, 1], [3, 0, 1], [4, 2, 0], [5, 1, 1]], vel: 0.6 }],
    drone: [50, 57], droneVel: 0.8,
    drums: [[0, 'low', 0.8], [2, 'tick', 0.35], [3, 'high', 0.55], [5, 'tick', 0.35]],
  },
  sorrow: {
    tempo: 50, bar: 3,
    leads: [{ inst: 'flute', notes: 'r:2 A4:1 | D5:2 C5:1 | Bb4:2 A4:1 | G4:1 A4:1 Bb4:1 | A4:3 | F4:2 G4:1 | A4:1.5 G4:.5 F4:1 | E4:2 D4:1 | D4:3 | r:2 D4:1 | F4:2 G4:1 | A4:2 D5:1 | C5:1 Bb4:1 A4:1 | G4:3 | Bb4:2 A4:1 | G4:1.5 F4:.5 E4:1 | F4:1 E4:1 C#4:1 | D4:3', vel: 0.85 }],
    chords: [{ inst: 'harp', bars: ['Dm', 'Dm', 'Gm', 'Gm', 'Dm', 'Bb', 'F', 'A', 'Dm', 'Dm', 'Bb', 'Dm', 'C', 'Gm', 'Gm', 'C', 'A', 'Dm'], pattern: [[0, 0, 0], [1, 2, 0], [2, 1, 1]], vel: 0.6 }],
    drone: [38], droneVel: 0.35,
  },
  town: {
    tempo: 100, bar: 4,
    leads: [{ inst: 'fiddle', notes: 'C5:1 E5:1 D5:1 C5:1 | G4:2 A4:1 B4:1 | C5:1 D5:1 E5:1 F5:1 | G5:2 E5:2 | F5:1 E5:1 D5:1 C5:1 | Bb4:1 A4:1 G4:2 | A4:1 Bb4:1 C5:1 D5:1 | C5:4 | E5:1.5 F5:.5 G5:1 E5:1 | D5:1.5 E5:.5 F5:1 D5:1 | C5:1 D5:1 E5:1 C5:1 | D5:2 G4:2 | E5:1.5 F5:.5 G5:1 E5:1 | F5:1 E5:1 D5:1 Bb4:1 | C5:1 G4:1 A4:1 B4:1 | C5:4', vel: 0.7, alt: 'flute' }],
    chords: [{ inst: 'lute', bars: ['C', 'G', 'C', 'C', 'F', 'Bb', 'F', 'C', 'C', 'Dm', 'C', 'G', 'C', 'Bb', 'G', 'C'], pattern: ARP4, vel: 0.55 }],
    drums: [[0, 'low', 0.35], [2, 'high', 0.22]],
  },
  forest: {
    tempo: 58, bar: 4,
    leads: [{ inst: 'flute', notes: 'E5:2 D5:1 E5:1 | A4:4 | r:2 G4:1 A4:1 | C5:3 B4:1 | A4:4 | r:4 | E5:1 F#5:1 G5:2 | E5:4 | r:4 | D5:2 C5:1 B4:1 | A4:2 G4:2 | E4:4 | r:2 A4:1 B4:1 | C5:2 D5:2 | B4:2 G4:2 | A4:4', vel: 0.55, every: 2 }],
    chords: [{ inst: 'harp', bars: ['Am', 'Am', 'G', 'Am', 'Am', 'D', 'Em', 'Am', 'Am', 'G', 'C', 'Em', 'Am', 'D', 'G', 'Am'], pattern: [[0, 0, 0], [1, 2, 0], [2, 1, 1], [3, 2, 0]], vel: 0.45 }],
    drone: [45], droneVel: 0.3,
  },
  night: {
    tempo: 56, bar: 3,
    leads: [{ inst: 'flute', notes: 'B4:3 | G4:2 A4:1 | B4:2 D5:1 | E5:3 | D5:2 B4:1 | A4:2 G4:1 | F#4:3 | E4:3', vel: 0.45, every: 2, offset: 1 }],
    chords: [{ inst: 'lute', bars: ['Em', 'C', 'D', 'Em', 'Am', 'Em', 'B', 'Em'], pattern: [[0, 0, 0], [1, 2, 0], [1.5, 0, 1], [2, 1, 1]], vel: 0.45 }],
  },
  battle: {
    tempo: 138, bar: 4,
    leads: [{ inst: 'fiddle', notes: 'E4:.5 F4:.5 E4:.5 G4:.5 E4:.5 F4:.5 E4:1 | E4:.5 F4:.5 E4:.5 G4:.5 A4:.5 G4:.5 F4:1 | E4:.5 F4:.5 E4:.5 G4:.5 E4:.5 F4:.5 E4:1 | B4:1 A4:.5 G4:.5 F4:1 E4:1 | E5:1 D5:.5 C5:.5 B4:1 A4:1 | G4:.5 A4:.5 B4:.5 C5:.5 B4:2 | E5:1 D5:.5 C5:.5 B4:1 C5:1 | B4:.5 A4:.5 G4:.5 F4:.5 E4:2', vel: 0.8 }],
    chords: [{ inst: 'bass', bars: ['Em', 'F', 'Em', 'F', 'C', 'Dm', 'C', 'Em'], pattern: [[0, 0, -1], [1, 0, -1], [2, 0, -1], [2.5, 2, -1], [3, 0, -1]], vel: 0.7 }],
    drone: [40, 47], droneVel: 0.7,
    drums: [[0, 'low', 0.9], [1, 'high', 0.5], [1.5, 'low', 0.6], [2, 'low', 0.8], [3, 'high', 0.6], [3.5, 'tick', 0.4]],
  },
  tension: {
    tempo: 60, bar: 4,
    leads: [{ inst: 'harp', notes: 'D3:1 r:3 | Eb3:1 r:3 | D3:1 r:1 A2:1 r:1 | r:4 | F3:1 r:2 Eb3:1 | D3:4 | r:4 | A2:2 r:2', vel: 0.7 }],
    drone: [38, 45], droneVel: 0.5,
    drums: [[0, 'low', 0.45], [0.3, 'low', 0.3]],
  },
  tavern: {
    tempo: 118, bar: 2,
    leads: [{ inst: 'fiddle', notes: 'A4:.5 C#5:.5 E5:.5 C#5:.5 | D5:.5 F#5:.5 E5:1 | C#5:.5 A4:.5 B4:.5 G4:.5 | A4:1 E4:1 | A4:.5 C#5:.5 E5:.5 C#5:.5 | D5:.5 F#5:.5 A5:1 | G5:.5 E5:.5 F#5:.5 D5:.5 | E5:2 | E5:.5 F#5:.5 G5:.5 E5:.5 | D5:.5 E5:.5 F#5:.5 D5:.5 | C#5:.5 D5:.5 E5:.5 C#5:.5 | B4:1 A4:1 | G4:.5 A4:.5 B4:.5 G4:.5 | A4:.5 B4:.5 C#5:.5 E5:.5 | D5:.5 B4:.5 G4:.5 B4:.5 | A4:2', vel: 0.75, alt: 'flute_bright' }],
    chords: [{ inst: 'lute', bars: ['A', 'D', 'A', 'E', 'A', 'D', 'G', 'E', 'Em', 'D', 'A', 'E', 'G', 'A', 'G', 'A'], pattern: [[0, 0, -1], [0.5, 1, 0], [1, 2, -1], [1.5, 1, 0]], vel: 0.6 }],
    drone: [45, 52], droneVel: 0.45,
    drums: [[0, 'low', 0.55], [1, 'high', 0.4]],
  },
  hope: {
    tempo: 76, bar: 3,
    leads: [{ inst: 'flute_bright', notes: 'F#4:1 A4:1 D5:1 | E5:2 D5:1 | C#5:1 B4:1 A4:1 | B4:3 | G4:1 B4:1 D5:1 | F#5:2 E5:1 | D5:1 C#5:1 E5:1 | D5:3 | A5:2 F#5:1 | G5:2 E5:1 | F#5:1 E5:1 D5:1 | E5:3 | D5:2 B4:1 | C#5:2 A4:1 | B4:1 C#5:1 E5:1 | D5:3', vel: 0.8 }],
    chords: [{ inst: 'harp', bars: ['D', 'A', 'D', 'G', 'G', 'D', 'A', 'D', 'D', 'Em', 'D', 'A', 'Bm', 'A', 'A', 'D'], pattern: ARP3, vel: 0.55 }],
    drone: [38, 45], droneVel: 0.35,
  },
  priory: {
    tempo: 50, bar: 4,
    leads: [{ inst: 'flute', notes: 'D4:2 F4:2 | E4:2 G4:2 | F4:1 E4:1 D4:2 | E4:4 | A4:2 G4:2 | F4:2 E4:2 | F4:1 E4:1 C4:2 | D4:4', vel: 0.4, every: 2 }],
    chords: [{ inst: 'choir', bars: ['Dm', 'C', 'Dm', 'Am', 'F', 'C', 'Dm', 'Dm'], pattern: [[0, 0, 0]], vel: 0.9, base: 50 }],
  },
  raid: {
    tempo: 150, bar: 4,
    leads: [{ inst: 'fiddle', notes: 'D5:.5 Eb5:.5 D5:.5 Eb5:.5 D5:.5 Eb5:.5 D5:.5 C5:.5 | D5:.5 Eb5:.5 D5:.5 Eb5:.5 F5:1 Eb5:1 | D5:.5 Eb5:.5 D5:.5 Eb5:.5 D5:.5 Eb5:.5 D5:.5 C5:.5 | Bb4:1 A4:1 D5:2', vel: 0.7 }],
    drone: [38, 39], droneVel: 0.7,
    drums: [[0, 'low', 1], [0.5, 'low', 0.6], [1, 'high', 0.7], [2, 'low', 1], [2.5, 'low', 0.6], [3, 'high', 0.7], [3.5, 'high', 0.5]],
  },
  lullaby: {
    tempo: 60, bar: 3,
    leads: [{ inst: 'harp', notes: 'B5:1 D6:1 G6:1 | F#6:2 D6:1 | E6:1 D6:1 C6:1 | B5:3 | A5:1 B5:1 C6:1 | D6:2 B5:1 | A5:1 G5:1 F#5:1 | G5:3', vel: 0.6, transpose: -12 },
      { inst: 'flute', notes: 'B4:1 D5:1 G5:1 | F#5:2 D5:1 | E5:1 D5:1 C5:1 | B4:3 | A4:1 B4:1 C5:1 | D5:2 B4:1 | A4:1 G4:1 F#4:1 | G4:3', vel: 0.45, every: 2, offset: 1 }],
    chords: [{ inst: 'harp', bars: ['G', 'D', 'C', 'G', 'Am', 'G', 'D', 'G'], pattern: [[0, 0, 0], [1, 2, 0], [2, 1, 1]], vel: 0.4 }],
  },
};

// ---------- sequencer ----------

interface Ev { beat: number; fn: (t: number, dest: AudioNode, loop: number) => void }
interface Playing { name: string; gain: GainNode; events: Ev[]; loopBeats: number; start: number; spb: number; idx: number; loop: number; stopDrone: (w?: number) => void }

let cur: Playing | null = null;
const fading: Playing[] = [];

function playLead(inst: Inst, t: number, dest: AudioNode, midi: number, dur: number, vel: number) {
  switch (inst) {
    case 'flute': flute(dest, t, midi, dur, vel); break;
    case 'flute_bright': flute(dest, t, midi, dur, vel, 0.12, true); break;
    case 'fiddle': fiddle(dest, t, midi, dur, vel); break;
    case 'harp': pluck(dest, t, midi, vel, 'harp', 0.1); break;
    case 'lute': pluck(dest, t, midi, vel, 'lute', 0.1); break;
  }
}

function buildEvents(tr: Track, spb: number): { events: Ev[]; loopBeats: number } {
  const events: Ev[] = [];
  let loopBeats = 0;
  for (const ld of tr.leads) {
    const notes = parseLine(ld.notes);
    const len = notes.reduce((m, n) => Math.max(m, n.beat + n.dur), 0);
    loopBeats = Math.max(loopBeats, len);
    for (const n of notes) {
      if (n.midi === null) continue;
      const midi = n.midi + (ld.transpose || 0);
      events.push({
        beat: n.beat,
        fn: (t, dest, loop) => {
          const every = ld.every || 1;
          if ((loop + (ld.offset || 0)) % every !== 0) return;
          const inst = ld.alt && loop % 2 === 1 ? ld.alt : ld.inst;
          playLead(inst, t, dest, midi, n.dur * spb * 0.95, (ld.vel ?? 0.8) * (0.9 + Math.random() * 0.15));
        },
      });
    }
  }
  for (const ch of tr.chords || []) {
    const barBeats = tr.bar;
    loopBeats = Math.max(loopBeats, ch.bars.length * barBeats);
    ch.bars.forEach((sym, bi) => {
      const tones = chordTones(sym, ch.base ?? 48);
      if (ch.inst === 'choir') {
        events.push({ beat: bi * barBeats, fn: (t, dest) => choir(dest, t, [tones[0], tones[1], tones[2]], barBeats * spb, ch.vel ?? 0.8) });
        return;
      }
      for (const [b, ti, oct] of ch.pattern) {
        const midi = tones[Math.min(3, ti)] + oct * 12;
        events.push({
          beat: bi * barBeats + b,
          fn: (t, dest) => pluck(dest, t, midi, (ch.vel ?? 0.6) * (b === 0 ? 1 : 0.8) * (0.9 + Math.random() * 0.15), ch.inst === 'bass' ? 'bass' : ch.inst === 'harp' ? 'harp' : 'lute', -0.2),
        });
      }
    });
  }
  if (tr.drums) {
    const bars = Math.max(1, Math.round(loopBeats / tr.bar));
    for (let bi = 0; bi < bars; bi++) for (const [b, k, v] of tr.drums) {
      events.push({ beat: bi * tr.bar + b, fn: (t, dest) => drum(dest, t, v * (0.9 + Math.random() * 0.2), k) });
    }
  }
  events.sort((a, b) => a.beat - b.beat);
  return { events, loopBeats: loopBeats || tr.bar * 8 };
}

export function playMusic(name: string | null, fade = 2.5) {
  if (!audio.ctx || !audio.music) { pending = name; return; }
  if (cur && cur.name === name) return;
  const ctx = audio.ctx;
  if (cur) {
    const old = cur;
    old.gain.gain.cancelScheduledValues(ctx.currentTime);
    old.gain.gain.setValueAtTime(old.gain.gain.value, ctx.currentTime);
    old.gain.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
    old.stopDrone(ctx.currentTime + fade * 0.5);
    fading.push(old);
    setTimeout(() => { const i = fading.indexOf(old); if (i >= 0) fading.splice(i, 1); old.gain.disconnect(); }, fade * 1000 + 3000);
    cur = null;
  }
  if (!name) return;
  const tr = TRACKS[name];
  if (!tr) return;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, ctx.currentTime);
  g.gain.linearRampToValueAtTime(1, ctx.currentTime + Math.min(fade, 2));
  g.connect(audio.music);
  const spb = 60 / tr.tempo;
  const { events, loopBeats } = buildEvents(tr, spb);
  const stopDrone = tr.drone ? drone(g, tr.drone, tr.droneVel ?? 0.5) : () => {};
  cur = { name, gain: g, events, loopBeats, start: ctx.currentTime + 0.15 + (fade > 1 ? 0.6 : 0), spb, idx: 0, loop: 0, stopDrone };
}

let pending: string | null = null;
export function currentMusic() { return cur ? cur.name : pending; }

/** Call every frame. Schedules notes slightly ahead of time. */
export function updateMusic() {
  if (!audio.ctx) return;
  if (pending !== null && !cur) { const p = pending; pending = null; playMusic(p, 1); }
  if (!cur) return;
  const ctx = audio.ctx;
  const ahead = ctx.currentTime + 0.25;
  let guard = 0;
  while (guard++ < 200) {
    if (!cur.events.length) break;
    const ev = cur.events[cur.idx];
    const t = cur.start + (cur.loop * cur.loopBeats + ev.beat) * cur.spb;
    if (t > ahead) break;
    if (t >= ctx.currentTime - 0.05) ev.fn(t, cur.gain, cur.loop);
    cur.idx++;
    if (cur.idx >= cur.events.length) { cur.idx = 0; cur.loop++; }
  }
}
