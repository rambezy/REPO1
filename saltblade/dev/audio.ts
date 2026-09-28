// Audio bench: audition every world sound, UI sound, ambience bed and music mood.
// Run `npx vite` in saltblade/ and open /dev/audio.html (port 5180 by default).
import { initAudio, setListener, setAmbience, setMusicMood, setVolumes, getVolumes, uiSound, type MusicMood, type UiSound } from '../src/audio';
import { mix } from '../src/audio/core';
import { voiceCount } from '../src/audio/sfx';
import { emit } from '../src/core/events';

const WORLD = ['clang', 'cut', 'blunt', 'thud', 'whiff', 'sever', 'twang', 'unlock', 'gate', 'mine', 'build', 'coin', 'eat', 'door', 'death', 'ko', 'alarm', 'craft', 'splash', 'fire', 'bite', 'growl', 'roar', 'machine', 'bell'];
const UI: UiSound[] = ['click', 'open', 'close', 'coin', 'error', 'levelup', 'build', 'notify', 'pause'];
const REGIONS = ['flats', 'salt', 'vale', 'coast', 'ember', 'highlands', 'thrumwood', 'mire', 'ash', 'bonesea', 'rust', 'glass'];
const WEATHER = ['clear', 'overcast', 'dust', 'rain', 'fog', 'acid', 'gas', 'ash', 'spores', 'heat'];
const MOODS: MusicMood[] = ['explore', 'combat', 'town', 'night', 'danger', 'silence'];
const BRAWL = ['clang', 'clang', 'cut', 'blunt', 'whiff', 'whiff', 'thud', 'ko', 'sever', 'twang'];

const amb = { region: 'flats', hour: 12, weather: 'clear', intensity: 0.6, inTown: false, underwater: false };
const lis = { x: 1000, z: 1000, dist: 40, yaw: 0 };
const place = { dist: 8, bearing: 0, vol: 1 };

function el<K extends keyof HTMLElementTagNameMap>(tag: K, parent: HTMLElement, text = '', cls = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (text) e.textContent = text;
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
}
function section(title: string, hint = '') {
  const s = el('section', document.getElementById('bench')!);
  el('h2', s, title);
  if (hint) el('p', s, hint, 'hint');
  return s;
}
/** A row of buttons; when `current` is given, the last one pressed stays lit. */
function buttons(parent: HTMLElement, names: readonly string[], fn: (n: string) => void, current?: string) {
  const bs = names.map((n) => {
    const b = el('button', parent, n);
    if (n === current) b.classList.add('on');
    b.onclick = () => {
      if (current !== undefined) for (const x of bs) x.classList.toggle('on', x === b);
      fn(n);
    };
    return b;
  });
}
function slider(parent: HTMLElement, label: string, min: number, max: number, step: number, value: number, fn: (v: number) => void, fmt = (v: number) => String(v)) {
  const row = el('label', parent, '', 'row');
  el('span', row, label);
  const r = el('input', row), out = el('span', row, fmt(value));
  Object.assign(r, { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value) });
  r.oninput = () => { const v = +r.value; out.textContent = fmt(v); fn(v); };
}
function check(parent: HTMLElement, label: string, value: boolean, fn: (v: boolean) => void) {
  const l = el('label', parent, '', 'check'), c = el('input', l);
  c.type = 'checkbox';
  c.checked = value;
  c.onchange = () => fn(c.checked);
  el('span', l, label);
}

/** World position `place.dist` metres from the listener at `place.bearing` (0 ahead, 90 right). */
function spot() {
  const b = (place.bearing * Math.PI) / 180, s = Math.sin(lis.yaw), c = Math.cos(lis.yaw);
  const fx = -s, fz = -c, rx = c, rz = -s;
  return { x: lis.x + place.dist * (Math.cos(b) * fx + Math.sin(b) * rx), z: lis.z + place.dist * (Math.cos(b) * fz + Math.sin(b) * rz) };
}
const sound = (n: string, x: number, z: number, v: number) => emit('sound', n, x, z, v);
const pushAmb = () => setAmbience({ ...amb });

let brawlT = 0;
function brawl() {
  clearInterval(brawlT);
  const t0 = performance.now();
  brawlT = window.setInterval(() => {
    if (performance.now() - t0 > 4000) return clearInterval(brawlT);
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 30;
      sound(BRAWL[Math.floor(Math.random() * BRAWL.length)], lis.x + Math.cos(a) * r, lis.z + Math.sin(a) * r, 0.5 + Math.random() * 0.5);
    }
  }, 25);
}

initAudio();

let s = section('World sounds', 'Emitted on the event bus exactly as the sim does, at the position set below.');
buttons(s, WORLD, (n) => { const p = spot(); sound(n, p.x, p.z, place.vol); });
el('br', s);
buttons(s, ['brawl (4 s, 120 hits/s)'], brawl);
slider(s, 'distance', 0, 400, 1, place.dist, (v) => (place.dist = v), (v) => v + ' m');
slider(s, 'bearing', -180, 180, 5, place.bearing, (v) => (place.bearing = v), (v) => v + '°');
slider(s, 'vol', 0, 1, 0.05, place.vol, (v) => (place.vol = v), (v) => v.toFixed(2));

s = section('Listener', 'Camera zoom distance and yaw; far or zoomed-out sounds are quieter, duller and wetter.');
slider(s, 'camDist', 3, 1400, 1, lis.dist, (v) => (lis.dist = v), (v) => v + ' m');
slider(s, 'yaw', -180, 180, 5, 0, (v) => (lis.yaw = (v * Math.PI) / 180), (v) => v + '°');

s = section('UI sounds');
buttons(s, UI, (n) => uiSound(n as UiSound));

s = section('Music mood', 'Combat fades in over ~1 s and out over ~4 s; others crossfade over ~3 s.');
buttons(s, MOODS, (n) => setMusicMood(n as MusicMood), '');

s = section('Ambience: region');
buttons(s, REGIONS, (n) => { amb.region = n; pushAmb(); }, amb.region);
check(s, 'in town', amb.inTown, (v) => { amb.inTown = v; pushAmb(); });
check(s, 'underwater', amb.underwater, (v) => { amb.underwater = v; pushAmb(); });

s = section('Ambience: weather and time');
buttons(s, WEATHER, (n) => { amb.weather = n; pushAmb(); }, amb.weather);
slider(s, 'intensity', 0, 1, 0.05, amb.intensity, (v) => { amb.intensity = v; pushAmb(); }, (v) => v.toFixed(2));
slider(s, 'hour', 0, 24, 0.25, amb.hour, (v) => { amb.hour = v; pushAmb(); }, (v) => `${Math.floor(v)}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}`);

s = section('Volumes', 'Saved to localStorage.');
const vol = getVolumes();
for (const k of ['master', 'sfx', 'music', 'ambience'] as const) slider(s, k, 0, 1, 0.05, vol[k], (v) => setVolumes({ [k]: v }), (v) => v.toFixed(2));

// the game calls these every frame and twice a second
pushAmb();
setInterval(pushAmb, 500);
let an: AnalyserNode | null = null, buf: Float32Array<ArrayBuffer> | null = null, hold = 0;
const $ = (id: string) => document.getElementById(id)!;
function frame() {
  setListener(lis.x, lis.z, lis.dist, lis.yaw);
  const m = mix;
  if (m) {
    if (!an) {
      an = m.ctx.createAnalyser();
      an.fftSize = 2048;
      buf = new Float32Array(an.fftSize);
      m.limiter.connect(an);
    }
    an.getFloatTimeDomainData(buf!);
    let p = 0;
    for (const v of buf!) p = Math.max(p, Math.abs(v));
    hold = Math.max(p, hold * 0.95);
    const db = 20 * Math.log10(hold + 1e-9);
    $('st').textContent = m.ctx.state;
    $('vc').textContent = String(voiceCount());
    $('pk').textContent = db < -90 ? '-inf dB' : db.toFixed(1) + ' dB';
    ($('mt') as HTMLElement).style.width = Math.max(0, Math.min(100, (db + 60) * (100 / 60))) + '%';
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// a handle for automated checks
(window as unknown as Record<string, unknown>).__bench = { sound, uiSound, setMusicMood, setAmbience, setListener, setVolumes, getVolumes, amb, lis, place, mix: () => mix, voices: voiceCount };
