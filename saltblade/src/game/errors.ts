// When something breaks. The main loop carries on regardless: each part of
// it runs guarded, and a part that keeps failing is switched off (unless the
// game cannot run without it) until the next load. The player is told, with a
// way back to their last autosave and the details to pass on, and a copy of
// the game as it stood goes to its own Emergency slot. Also here: a browser
// that cannot draw the world at all, and a graphics device that goes away.
import './errors.css';
import { version } from '../../package.json';
import { G } from '../state';
import { S } from '../sim/ctx';
import { h, ui, shield } from '../ui/dom';
import { on } from '../core/events';
import { listSaves, AUTO_SLOTS, fitsWorld, saveWhen, slotLabel, stashForReload, SaveMeta } from '../sim/save';
import { loadSlot, saveGame, snapshot } from './session';
import { setSpeed } from './control';
import { hideTitle } from '../ui/title';

// ---------------------------------------------------------------- guarded parts of the loop
export interface System {
  name: string;
  /** the game cannot go on without it, so it is never switched off */
  vital: boolean;
  off: boolean;
  fails: number;
  /** recent failures, fading over a few seconds */
  heat: number;
  at: number;
  /** (tests) throw this many more times */
  inject: number;
  /** times it has been switched back on after a quiet spell */
  rearmed: number;
}

const systems: System[] = [];
/** Failures close together that switch a part off. */
const SWITCH_OFF = 5;
/** A switched-off part gets another go after this long without trouble, a few times a game. */
const REARM_AFTER = 30000, REARM_MAX = 3;

export function system(name: string, vital = false): System {
  const s: System = { name, vital, off: false, fails: 0, heat: 0, at: 0, inject: 0, rearmed: 0 };
  systems.push(s);
  return s;
}

/** Runs one part of the loop; an error is caught, counted and shown, and the loop goes on. */
export function guard<A>(s: System, fn: (a: A) => void, a: A) {
  if (s.off) {
    // a passing upset should not cost the names over people's heads for the rest of the game
    if (s.rearmed >= REARM_MAX || performance.now() - s.at < REARM_AFTER) return;
    s.off = false; s.heat = 0; s.rearmed++;
    console.info(`[${s.name}] switched back on (${s.rearmed} of ${REARM_MAX})`);
  }
  try {
    if (import.meta.env.DEV && s.inject > 0) { s.inject--; throw new Error(`A test failure in ${s.name}`); }
    fn(a);
  } catch (e) { failed(s, e); }
}

export function failed(s: System, e: unknown) {
  const now = performance.now();
  s.fails++;
  s.heat = s.heat * Math.exp(-(now - s.at) / 4000) + 1;
  s.at = now;
  const off = !s.vital && s.heat >= SWITCH_OFF;
  if (off) s.off = true;
  report(e, s.name, off);
}

/** (dev builds) Makes a part of the loop throw the next n times it runs. */
export function injectFailure(name: string, n = 1) {
  const s = systems.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (s) s.inject = n;
  return s ? s.name : `no such part; try one of: ${systems.map((x) => x.name).join(', ')}`;
}

/** The parts switched off, and how often each part has failed. */
export const systemReport = () => systems.filter((s) => s.fails).map((s) => ({ name: s.name, fails: s.fails, off: s.off }));

// ---------------------------------------------------------------- what went wrong
interface Incident { key: string; where: string; message: string; stack: string; count: number; off: boolean; }
const incidents = new Map<string, Incident>();
/** what the player chose to play on through: the same error again does not bring the card back */
const muted = new Set<string>();

/** Catches what nothing else did: errors in event handlers and promises nobody waited on. */
export function installErrorHandlers() {
  window.addEventListener('error', (e) => {
    const msg = e.message ?? '';
    if (/ResizeObserver loop/.test(msg)) return; // the browser's own, harmless
    if (!e.error && msg === 'Script error.') { console.warn('An error in a script from elsewhere.'); return; } // nothing to go on
    report(e.error ?? new Error(msg), 'The interface');
  });
  window.addEventListener('unhandledrejection', (e) => report(e.reason, 'A background task'));
  on('game:start', fresh);
}

/** A new or loaded game: everything gets another chance. */
function fresh() {
  for (const s of systems) { s.off = false; s.heat = 0; s.inject = 0; s.rearmed = 0; }
  incidents.clear();
  muted.clear();
  copyKept = false; copyTries = 0; copyAgain = 0;
  closeCard();
}

export function report(e: unknown, where: string, off = false) {
  const err = e instanceof Error ? e : new Error(typeof e === 'string' ? e : (e as any)?.message ?? String(e));
  const message = err.message || err.name || 'Unknown error';
  const key = `${where}|${message}`;
  let x = incidents.get(key);
  if (!x) {
    if (incidents.size >= 20) { console.error(`[${where}]`, e); return; } // (enough to go on)
    x = { key, where, message, stack: err.stack || `${err.name}: ${message}`, count: 0, off: false };
    incidents.set(key, x);
  }
  x.count++;
  x.off ||= off;
  // the console gets the first few in full, then a line now and then
  if (x.count <= 3) console.error(`[${where}]`, e);
  else if (x.count % 200 === 0) console.error(`[${where}] ${message} (${x.count} times)`);
  if (muted.has(key) && !off) return;
  try {
    showCard();
    keepCopy();
  } catch (e2) { console.error('The error card itself failed:', e2); }
}

// ---------------------------------------------------------------- the card
let card: HTMLDivElement | null = null;
let cardBody: HTMLDivElement;
let saveLine: HTMLParagraphElement;
let detailText: HTMLTextAreaElement;
let loadBtn: HTMLButtonElement;
let drawnAt = 0, drawSoon = 0;

function closeCard() {
  card?.remove();
  card = null;
  G.errorCard = false;
}

function showCard() {
  if (!card) buildCard();
  // a part failing every frame should not redraw the card every frame
  const now = performance.now();
  if (now - drawnAt < 250) { drawSoon ||= window.setTimeout(() => { drawSoon = 0; drawCard(); }, 260); return; }
  drawCard();
}

function buildCard() {
  card = h('div', { class: 'errcard', role: 'alertdialog', 'aria-label': 'Something went wrong' });
  cardBody = h('div', { class: 'errbody' });
  saveLine = h('p', { class: 'errsave' });
  detailText = h('textarea', { class: 'errtext', readonly: 'true', spellcheck: 'false', rows: '7', 'aria-label': 'Error details' }) as HTMLTextAreaElement;
  loadBtn = h('button', { class: 'tbtn small primary' }, 'Load last autosave') as HTMLButtonElement;
  loadBtn.onclick = () => void loadBack();
  const keep = h('button', { class: 'tbtn small' }, G.mode === 'play' ? 'Keep playing' : 'Close');
  keep.onclick = () => { for (const k of incidents.keys()) muted.add(k); closeCard(); };
  const copy = h('button', { class: 'tbtn small' }, 'Copy details');
  copy.onclick = async () => {
    try { await navigator.clipboard.writeText(detailText.value); copy.textContent = 'Copied'; }
    catch { detailText.focus(); detailText.select(); copy.textContent = 'Selected: copy it with Ctrl+C'; }
  };
  card.append(
    h('div', { class: 'errtitle' }, 'Something went wrong'),
    cardBody,
    saveLine,
    h('div', { class: 'errbtns' }, keep, loadBtn),
    h('details', { class: 'errmore' }, h('summary', {}, 'Details for a bug report'), detailText, h('div', { class: 'errbtns' }, copy)),
  );
  shield(card);
  ui().appendChild(card);
  G.errorCard = true; // (autosaves wait until the player has seen it)
  void offerLoad();
}

function drawCard() {
  if (!card) return;
  drawnAt = performance.now();
  const list = [...incidents.values()].filter((x) => !muted.has(x.key) || x.off);
  const last = list[list.length - 1] ?? [...incidents.values()].pop();
  if (!last) return;
  cardBody.innerHTML = '';
  cardBody.append(
    h('p', {}, h('b', {}, last.where), ' hit an error it did not expect: ', h('i', {}, last.message), last.count > 1 ? ` (${last.count} times)` : '', '.'),
    h('p', {}, G.mode === 'play' ? 'The game is still running. Keep playing, or go back to your last autosave.' : 'The game is still running.'),
  );
  for (const x of list) if (x.off) cardBody.append(h('p', { class: 'erroff' }, `${x.where} kept failing, so it is switched off for now (it is tried again after a quiet spell, and on a load).`));
  if (list.length > 1) cardBody.append(h('p', { class: 'dim' }, `${list.length - 1} other ${list.length === 2 ? 'error' : 'errors'} too (see the details).`));
  detailText.value = details();
}

function details() {
  const lines = [
    `Saltblade ${version} · ${G.mode}${G.mode === 'play' && S.clock ? ` · ${S.clock.str()}` : ''} · speed ${G.speed ?? 0}`,
    navigator.userAgent,
    ...systemReport().map((s) => `${s.name}: failed ${s.fails} time${s.fails === 1 ? '' : 's'}${s.off ? ', switched off' : ''}`),
  ];
  for (const x of incidents.values()) lines.push('', `[${x.where}]${x.count > 1 ? ` ×${x.count}` : ''}`, x.stack.includes(x.message) ? x.stack : `${x.message}\n${x.stack}`);
  return lines.join('\n');
}

/** The newest autosave (or failing that, the newest save of any kind but the emergency one). */
async function lastSave(): Promise<SaveMeta | undefined> {
  const saves = (await listSaves().catch(() => [] as SaveMeta[])).filter(fitsWorld);
  return saves.find((m) => AUTO_SLOTS.includes(m.slot)) ?? saves.find((m) => m.slot !== 'emergency');
}

async function offerLoad() {
  const m = await lastSave();
  if (!card) return;
  loadBtn.innerHTML = '';
  if (!m) { loadBtn.append('No save to go back to'); loadBtn.disabled = true; loadBtn.hidden = G.mode !== 'play'; return; }
  loadBtn.disabled = false;
  loadBtn.append(AUTO_SLOTS.includes(m.slot) ? 'Load last autosave' : 'Load last save', h('small', {}, `${slotLabel(m.slot)} · ${saveWhen(m)}`));
}

async function loadBack() {
  const m = await lastSave();
  if (!m) return;
  loadBtn.disabled = true;
  const err = await loadSlot(m.slot);
  if (!err) { hideTitle(); return; } // (the load itself closes the card)
  loadBtn.disabled = false;
  saveLine.textContent = err;
}

// ---------------------------------------------------------------- the emergency copy
let copyKept = false, keeping = false, copyTries = 0, copyAgain = 0;
/** Tries at the emergency copy in one game, a minute apart and then longer. */
const COPY_TRIES = 3;
/**
 * Keeps a copy of the game as it stood when the trouble began, in a slot of
 * its own (never one of the autosaves the card offers to go back to). Only
 * while a game is being played, once per game, and only if the world can
 * still be written out whole. Writing it out takes a moment, so it is done
 * after the frame that failed (not inside it, where the world is half
 * stepped), and a copy that failed is not tried again in every failing frame.
 */
function keepCopy() {
  if (G.mode !== 'play' || keeping || !card) return;
  if (copyKept) { saveLine.textContent = 'A copy of the game as it stood when this began is in the Emergency save slot.'; return; }
  if (copyTries >= COPY_TRIES || performance.now() < copyAgain) return;
  keeping = true;
  copyTries++;
  saveLine.textContent = 'Keeping a copy of the game as it stands…';
  setTimeout(async () => {
    let ok = false;
    try { ok = G.mode === 'play' && await saveGame('emergency'); } catch (e) { console.error('No emergency copy:', e); }
    keeping = false;
    copyKept = ok;
    if (!ok) copyAgain = performance.now() + 60000 * 2 ** (copyTries - 1);
    if (card) saveLine.textContent = ok ? 'A copy of the game as it stood is in the Emergency save slot.' : 'A copy of the game could not be kept.';
  }, 0);
}

// ---------------------------------------------------------------- graphics
/** Can this browser draw the world at all? (three.js needs WebGL 2.) */
export function hasWebGL2(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // give the test context back
    return !!gl;
  } catch { return false; }
}

/** A screen in place of the game, for when it cannot run at all. */
export function showFatal(title: string, paras: string[], detail = '') {
  document.getElementById('loading')?.remove();
  const reload = h('button', { class: 'tbtn small primary' }, 'Try again');
  reload.onclick = () => location.reload();
  const box = h('div', { class: 'fatalcard' }, h('div', { class: 'errtitle' }, title), ...paras.map((p) => h('p', {}, p)));
  if (detail) box.append(h('details', { class: 'errmore' }, h('summary', {}, 'Details for a bug report'), h('textarea', { class: 'errtext', readonly: 'true', rows: '6' }, detail)));
  box.append(h('div', { class: 'errbtns' }, reload));
  ui().appendChild(h('div', { class: 'fatal', role: 'alert' }, box));
}

export function noWebGL() {
  showFatal('Saltblade cannot draw the world here', [
    'The game draws its world with WebGL 2, and this browser either does not have it or has it switched off.',
    'Turning on hardware (graphics) acceleration in the browser\'s settings and restarting the browser fixes this most often. Updating the browser or the graphics drivers helps too, or try a recent Chrome, Edge, Firefox or Safari.',
  ]);
}

/**
 * A graphics device can go away (a driver update, a laptop waking, too much
 * at once) and come back. While it is gone the game pauses and says so.
 */
export function watchGraphics(canvas: HTMLCanvasElement) {
  let note: HTMLDivElement | null = null, resume = 0;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // (we want it back)
    G.glLost = true;
    document.body.classList.add('gl-lost');
    if (G.mode === 'play' && G.speed) { resume = G.speed; setSpeed(0); }
    note?.remove();
    const reload = h('button', { class: 'tbtn small' }, 'Reload the game');
    reload.onclick = async () => {
      reload.textContent = 'Reloading…';
      if (G.mode === 'play') { try { await stashForReload(snapshot()); } catch { /* the last save will have to do */ } }
      location.reload();
    };
    note = h('div', { class: 'errcard glcard', role: 'alert' },
      h('div', { class: 'errtitle' }, 'The picture has gone'),
      h('p', {}, 'The graphics device was reset. The game is paused, and carries on by itself as soon as the picture comes back.'),
      h('p', { class: 'dim' }, 'If it does not come back, reload: the game is kept and picks up where you are.'),
      h('div', { class: 'errbtns' }, reload));
    shield(note);
    ui().appendChild(note);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    G.glLost = false;
    document.body.classList.remove('gl-lost');
    note?.remove();
    note = null;
    G.R?.resize();
    if (resume && G.mode === 'play' && !G.speed) setSpeed(resume);
    resume = 0;
  });
}
