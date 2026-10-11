// Headless check of the action map and the settings: keys matched by what
// they type and by position, modifiers, layouts that type something other
// than Latin, labels, conflicts (and the situations allowed to share a key),
// bindings kept and sanitised through the settings, the help table, the
// palettes, and old or damaged settings blobs made whole.
// Usage: npx tsx tools/keystest.ts
import { keymap, keyOf, bindingOf, keyLabel, isBinding, sanitizeBindings, setLayout, helpRows, ACTIONS, ACTION, KeyLike } from '../src/core/keys';
import { input } from '../src/core/input';
import { migrateSettings, DEFAULTS, UI_SCALE } from '../src/game/settings';
import { PALETTES, VISIONS, applyPalette, palette, cssVar } from '../src/ui/palette';

const results: [string, boolean, string?][] = [];
function check(name: string, ok: boolean, detail?: string) {
  results.push([name, ok, detail]);
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ` (${detail})` : ''}`);
}

const ev = (key: string, code = '', mods: Partial<KeyLike> = {}): KeyLike => ({ key, code, ...mods });

// ---------------------------------------------------------------- what a key is
check('a letter goes by what it types', keyOf(ev('i', 'KeyI')) === 'i');
check('Shift and Caps Lock make the same letter', keyOf(ev('I', 'KeyI', { shiftKey: true })) === 'i' && keyOf(ev('I', 'KeyI')) === 'i');
check('the space bar is Space', keyOf(ev(' ', 'Space')) === 'Space');
check('named keys keep their names', keyOf(ev('F5', 'F5')) === 'F5' && keyOf(ev('ArrowUp', 'ArrowUp')) === 'ArrowUp');
check('a modifier on its own is nothing', keyOf(ev('Shift', 'ShiftLeft')) === null && keyOf(ev('Control', 'ControlLeft', { ctrlKey: true })) === null);
check('a dead key is nothing', keyOf(ev('Dead', 'Quote')) === null);
check('a Cyrillic layout goes by the QWERTY position', keyOf(ev('ш', 'KeyI')) === 'i' && keyOf(ev('ф', 'KeyA', { ctrlKey: true })) === 'a');
check('a shifted digit is still the digit', keyOf(ev('!', 'Digit1', { shiftKey: true })) === '1');
check('modifiers come first in a binding', bindingOf(ev('a', 'KeyA', { ctrlKey: true })) === 'Ctrl+a' && bindingOf(ev('Enter', 'Enter', { altKey: true })) === 'Alt+Enter' && bindingOf(ev('A', 'KeyA', { shiftKey: true, altKey: true })) === 'Shift+Alt+a');
check('Cmd counts as Ctrl', bindingOf(ev('a', 'KeyA', { metaKey: true })) === 'Ctrl+a');
check('well-formed bindings', ['i', '1', 'F5', 'Space', 'Ctrl+a', 'Alt+Enter', '@KeyW', '@ArrowUp', 'Shift+Ctrl+@KeyA', ','].every(isBinding));
check('malformed bindings', ['', 'ctrl+a', 'Key W', '@', 'a+b', '+', 'x'.repeat(50), 'Ctrl+', 'Meta+a'].every((b) => !isBinding(b)));

// ---------------------------------------------------------------- matching
keymap.reset();
check('every action has a key by default', ACTIONS.every((a) => keymap.bindings[a.id].length > 0));
check('the defaults have no conflicts', keymap.conflicts().length === 0, JSON.stringify(keymap.conflicts()));
check('i opens the character window', keymap.actionFor(ev('i', 'KeyI')) === 'char');
check('Ctrl+A selects everyone, A alone is nothing to press', keymap.actionFor(ev('a', 'KeyA', { ctrlKey: true })) === 'select_all' && keymap.actionFor(ev('a', 'KeyA')) === null);
check('Shift held (the fast-camera key) does not swallow a key: Shift+Space pauses, Shift+3 is speed 3, Shift+I is I', keymap.actionFor(ev(' ', 'Space', { shiftKey: true })) === 'pause' && keymap.actionFor(ev('#', 'Digit3', { shiftKey: true })) === 'speed3' && keymap.actionFor(ev('I', 'KeyI', { shiftKey: true })) === 'char');
check('a Shift chord of its own still wins', (() => { keymap.set('journal', ['Shift+j']); const r = keymap.actionFor(ev('J', 'KeyJ', { shiftKey: true })) === 'journal' && keymap.actionFor(ev('j', 'KeyJ')) === null; keymap.reset(); return r; })());
check('the speeds go by position: AZERTY types & é " \' on that row', keymap.actionFor(ev('&', 'Digit1')) === 'speed1' && keymap.actionFor(ev('"', 'Digit3')) === 'speed3' && keymap.actionFor(ev("'", 'Digit4')) === 'speed4' && keymap.actionFor(ev('1', 'Digit1', { shiftKey: true })) === 'speed1');
check('and are still labelled by their digit', keymap.labels('speed1')[0] === '1' && keymap.labels('speed4')[0] === '4');
check('Ctrl+1 is left to the browser', keymap.actionFor(ev('1', 'Digit1', { ctrlKey: true })) === null && keymap.actionFor(ev('1', 'Digit1')) === 'speed1');
check('the numpad is not the digit row', keymap.actionFor(ev('1', 'Numpad1')) === null);
check('F5 and F9 save and load', keymap.actionFor(ev('F5', 'F5')) === 'quicksave' && keymap.actionFor(ev('F9', 'F9')) === 'quickload');
check('Alt+Enter is fullscreen', keymap.actionFor(ev('Enter', 'Enter', { altKey: true })) === 'fullscreen');
check('J is reserved for the journal', keymap.actionFor(ev('j', 'KeyJ')) === 'journal');
check('Esc is the way back', keymap.actionFor(ev('Escape', 'Escape')) === 'back');
check('R rotates a building first, then means walk', JSON.stringify(keymap.actionsFor(ev('r', 'KeyR'))) === JSON.stringify(['build_rotate', 'walk']));

input.keys.add('KeyA');
check('a held key is read by position', keymap.down('pan_left') && !keymap.down('pan_right'));
input.keys.delete('KeyA');
input.keys.add('ArrowLeft');
check('the arrows pan too', keymap.down('pan_left'));
input.keys.clear();
check('nothing held, nothing down', !keymap.down('pan_left') && !keymap.down('rotate_left'));

// ---------------------------------------------------------------- handlers
{
  const got: string[] = [];
  const off1 = keymap.on('journal', () => { got.push('one'); });
  const off2 = keymap.on('journal', () => { got.push('two'); return false; });
  const took = keymap.dispatch(ev('j', 'KeyJ'));
  check('handlers run newest first, and one that returns false passes the key on', took && got.join(',') === 'two,one');
  off1(); off2();
  check('an unhandled key is not taken', !keymap.dispatch(ev('j', 'KeyJ')) && !keymap.dispatch(ev('z', 'KeyZ')));
  const rot: string[] = [];
  const offR = keymap.on('build_rotate', () => { rot.push('rot'); return false; });
  const offW = keymap.on('walk', () => { rot.push('walk'); });
  keymap.dispatch(ev('r', 'KeyR'));
  check('a situation\'s own action gets first refusal, then the everyday one', rot.join(',') === 'rot,walk');
  offR(); offW();
}

// ---------------------------------------------------------------- labels
check('labels read as people write keys', keyLabel('i') === 'I' && keyLabel('Ctrl+a') === 'Ctrl+A' && keyLabel('Escape') === 'Esc' && keyLabel('Alt+Enter') === 'Alt+Enter' && keyLabel('@KeyW') === 'W' && keyLabel('@ArrowUp') === 'Up' && keyLabel('@PageUp') === 'PgUp' && keyLabel('Delete') === 'Del');
check('the defaults label as expected', keymap.labels('pan_up').join(' ') === 'W Up' && keymap.labels('drop').join(' ') === 'X Del' && keymap.labels('select_all')[0] === 'Ctrl+A');
setLayout(new Map([['KeyW', 'z'], ['KeyA', 'q'], ['KeyQ', 'a'], ['KeyZ', 'w']]));
check('a physical key is labelled by what the layout prints on it', keyLabel('@KeyW') === 'Z' && keyLabel('@KeyS') === 'S');

// ---------------------------------------------------------------- conflicts
keymap.set('char', ['m']);
check('two actions on one key is a conflict', keymap.conflicts().some((c) => c.label === 'M' && c.actions.includes('char') && c.actions.includes('map')));
keymap.set('char', ['z']);
check('a layout name clashes with the position it sits on (Z is W on AZERTY)', keymap.conflicts().some((c) => c.actions.includes('char') && c.actions.includes('pan_up')), JSON.stringify(keymap.conflicts()));
setLayout(null);
check('and not when it does not', keymap.conflicts().length === 0, JSON.stringify(keymap.conflicts()));
keymap.set('sneak', ['r']);
check('a situation\'s key may be shared, an everyday key may not', keymap.conflicts().length === 1 && keymap.conflicts()[0].actions.join(',') === 'sneak,walk', JSON.stringify(keymap.conflicts()));
keymap.set('back', ['q']);
check('the fixed key cannot be rebound', keymap.bindings.back[0] === 'Escape');
keymap.set('char', ['i', 'i', 'Ctrl+@KeyI', 'bad key', 'F7', 'F8']);
check('a set is deduplicated, checked and capped at three', JSON.stringify(keymap.bindings.char) === JSON.stringify(['i', 'Ctrl+@KeyI', 'F7']));
keymap.set('char', []);
check('an action may be left without a key', keymap.bindings.char.length === 0 && keymap.labels('char').length === 0);

// ---------------------------------------------------------------- kept in the settings
keymap.reset();
keymap.set('char', ['p']);
keymap.set('pan_up', ['@KeyW', '@ArrowUp']);
const over = keymap.overrides();
check('only what differs from the defaults is kept', JSON.stringify(over) === JSON.stringify({ char: ['p'] }));
keymap.reset();
keymap.load(over);
check('and comes back the same', keymap.bindings.char[0] === 'p' && keymap.actionFor(ev('p', 'KeyP')) === 'char' && keymap.actionFor(ev('i', 'KeyI')) === null);
keymap.load({ char: ['Ctrl+'], nonsense: ['x'], back: ['q'], map: 'm', pause: ['Space', 7, null, 'Enter'] });
check('junk in the settings is ignored, the rest kept', keymap.bindings.char.length === 0 && keymap.bindings.back[0] === 'Escape' && keymap.bindings.map[0] === 'm' && JSON.stringify(keymap.bindings.pause) === JSON.stringify(['Space', 'Enter']));
check('sanitizeBindings takes only arrays of well-formed keys for known actions', JSON.stringify(sanitizeBindings({ char: ['i', 3], pause: 'Space', nope: ['x'], map: [] })) === JSON.stringify({ char: ['i'], map: [] }) && JSON.stringify(sanitizeBindings('nope')) === '{}' && JSON.stringify(sanitizeBindings([1])) === '{}');
keymap.reset();

// ---------------------------------------------------------------- the help table
const rows = helpRows();
const covered = new Set<string>();
for (const r of rows) for (const d of ACTIONS) if (r.what === d.name || (d.row && r.what.startsWith('Move the camera')) || r.what.startsWith(d.name)) covered.add(d.id);
check('the key table has a line for every action or row of actions', rows.length === ACTIONS.filter((a) => !a.row).length + 4 && ACTIONS.every((a) => covered.has(a.id)));
check('WASD and the arrows share one line', rows.some((r) => r.keys === 'W A S D · Up Left Down Right'));
check('the speeds share one line', rows.some((r) => r.keys === '1 2 3 4' && r.what === 'Game speed'));
keymap.set('pause', ['Escape', 'Shift+Escape', 'p']);
check('Escape can never be bound to anything but the way back', JSON.stringify(keymap.bindings.pause) === JSON.stringify(['p']) && JSON.stringify(sanitizeBindings({ pause: ['Escape'] })) === JSON.stringify({ pause: [] }));
keymap.set('pan_up', ['w', '@KeyW', 'Ctrl+@KeyW']);
check('a held action keeps only keys by position, which are all it reads', JSON.stringify(keymap.bindings.pan_up) === JSON.stringify(['@KeyW']) && JSON.stringify(sanitizeBindings({ pan_up: ['w'] })) === JSON.stringify({ pan_up: [] }));
keymap.reset();
check('a held key never fires as a press', keymap.actionFor(ev('w', 'KeyW')) === null && keymap.actionFor(ev('ArrowUp', 'ArrowUp')) === null);
keymap.set('char', []);
check('an unbound action shows a dash', helpRows().some((r) => r.what === ACTION.char.name && r.keys === '—'));
keymap.reset();

// ---------------------------------------------------------------- settings blobs
const old = migrateSettings({ quality: 'medium', shadows: false, viewDist: 1.2, autosave: 4, uiScale: 1.3, names: 'always', pauseOnKO: false, hints: false, chatter: false, master: 0.5, music: 0.2, sfx: 0.9, ambience: 0.1 });
check('a settings blob from before this version loads', old.quality === 'medium' && !old.shadows && old.viewDist === 1.2 && old.autosave === 4 && old.uiScale === 1.3 && old.names === 'always' && !old.pauseOnKO && !old.hints && !old.chatter && old.master === 0.5);
check('and gets the new keys with their defaults', old.reducedMotion === false && old.colorblind === 'none' && JSON.stringify(old.keys) === '{}' && old.flashWarned === false);
const bad = migrateSettings({ quality: 'ultra', uiScale: 9, viewDist: 'far', autosave: 7, names: 'never', colorblind: 'blue', reducedMotion: 'yes', keys: { char: ['p'], nope: ['x'], back: ['q'] }, master: -2, extra: true, flashWarned: true });
check('bad values fall back to the defaults', bad.quality === DEFAULTS.quality && bad.viewDist === DEFAULTS.viewDist && bad.autosave === DEFAULTS.autosave && bad.names === DEFAULTS.names && bad.colorblind === 'none' && bad.reducedMotion === false);
check('numbers are kept in range', bad.uiScale === UI_SCALE[1] && bad.master === 0);
check('unknown keys are dropped, bindings are checked', !('extra' in bad) && JSON.stringify(bad.keys) === JSON.stringify({ char: ['p'] }) && bad.flashWarned === true);
check('junk is just the defaults', JSON.stringify(migrateSettings(null)) === JSON.stringify(DEFAULTS) && JSON.stringify(migrateSettings('{')) === JSON.stringify(DEFAULTS) && JSON.stringify(migrateSettings(42)) === JSON.stringify(DEFAULTS));
check('the defaults pass through unchanged', JSON.stringify(migrateSettings(DEFAULTS)) === JSON.stringify(DEFAULTS));
check('High chosen before Auto existed becomes Auto, once', migrateSettings({ quality: 'high' }).quality === 'auto' && migrateSettings({ quality: 'high', rev: 1 }).quality === 'high' && migrateSettings({ quality: 'low' }).quality === 'low');
check('every blob comes out at the current format revision', migrateSettings({}).rev === DEFAULTS.rev && migrateSettings({ rev: 0 }).rev === DEFAULTS.rev && migrateSettings({ rev: 99 }).rev === DEFAULTS.rev);

// ---------------------------------------------------------------- palettes
const keys = Object.keys(PALETTES.none);
check('every palette has every colour', VISIONS.every(([v]) => Object.keys(PALETTES[v]).length === keys.length && keys.every((k) => /^#[0-9a-f]{6}$/.test((PALETTES[v] as unknown as Record<string, string>)[k]))));
const lum = (c: string) => { const n = parseInt(c.slice(1), 16); return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255); };
const hue = (c: string) => { const n = parseInt(c.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return (Math.atan2(Math.sqrt(3) * (g - b), 2 * r - g - b) * 180) / Math.PI; };
const apart = (a: string, b: string) => { const d = Math.abs(hue(a) - hue(b)); return Math.min(d, 360 - d) > 60; };
check('friend and foe sit well apart on the colour wheel in every palette', VISIONS.every(([v]) => apart(PALETTES[v].friend, PALETTES[v].foe) && apart(PALETTES[v].good, PALETTES[v].bad) && apart(PALETTES[v].hp, PALETTES[v].hpLow)));
check('the red-green palettes use neither red nor green for friend and foe', (['deuteranopia', 'protanopia'] as const).every((v) => [PALETTES[v].friend, PALETTES[v].foe, PALETTES[v].good, PALETTES[v].bad].every((c) => { const hh = hue(c); return hh > 170 || hh < -140 || (hh > 15 && hh < 60); })));
// How far apart two colours look to a given eye: the colour-blind view simulated (Machado, Oliveira and
// Fernandes 2009, full strength, on linear sRGB), then the CIEDE2000 difference. Around 12 and up is plain
// at a glance; under about 5 two marks pass for one.
type V3 = [number, number, number];
const SIM: Record<string, number[][]> = {
  deuteranopia: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
  protanopia: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
  tritanopia: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
};
const toLab = (hex: string, eye?: string): V3 => {
  const lin = [1, 3, 5].map((i) => { const c = parseInt(hex.slice(i, i + 2), 16) / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  const m = eye ? SIM[eye] : null;
  const [r, g, b] = m ? m.map((row) => Math.min(1, Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]))) : lin;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const X = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = f(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
};
function de2000([L1, a1, b1]: V3, [L2, a2, b2]: V3): number {
  const rad = Math.PI / 180, C7 = (c: number) => Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7));
  const G = 0.5 * (1 - C7((Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2));
  const A1 = a1 * (1 + G), A2 = a2 * (1 + G), C1 = Math.hypot(A1, b1), C2 = Math.hypot(A2, b2);
  const hOf = (a: number, b: number) => { const h = Math.atan2(b, a) / rad; return h < 0 ? h + 360 : h; };
  const h1 = hOf(A1, b1), h2 = hOf(A2, b2);
  let dh = C1 * C2 === 0 ? 0 : h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin((dh / 2) * rad), Lm = (L1 + L2) / 2, Cm = (C1 + C2) / 2;
  let hm = h1 + h2; if (C1 * C2 !== 0) { if (Math.abs(h1 - h2) > 180) hm += hm < 360 ? 360 : -360; hm /= 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.2 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + (0.015 * (Lm - 50) ** 2) / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cm, SH = 1 + 0.015 * Cm * T;
  const RT = -2 * C7(Cm) * Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad);
  const l = (L2 - L1) / SL, c = (C2 - C1) / SC, hh = dH / SH;
  return Math.sqrt(l * l + c * c + hh * hh + RT * c * hh);
}
type PK = keyof typeof PALETTES.none;
/** The closest two of a set of colours, as an eye sees them. */
const closest = (v: (typeof VISIONS)[number][0], ks: PK[], eye?: string) => { let worst = Infinity; for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) worst = Math.min(worst, de2000(toLab(PALETTES[v][ks[i]], eye), toLab(PALETTES[v][ks[j]], eye))); return worst; };
const RINGS: PK[] = ['friend', 'foe', 'attack', 'hover'];
// the move marker is a paler friend on purpose; it only has to differ from the attack marker
const PAIRED: PK[][] = [['move', 'attack'], ['hp', 'hpMid', 'hpLow'], ['good', 'bad'], ['seen', 'hidden'], ['mapMe', 'mapDown']];
const cvd = ['deuteranopia', 'protanopia', 'tritanopia'] as const;
check('the default palette is what the modes are for: its health colours run together for a deuteranope', closest('none', ['hp', 'hpMid'], 'deuteranopia') < 10);
check('each colour-blind palette, as that eye sees it, tells apart the rings: yours, a foe, the one being fought, the hovered', cvd.every((v) => closest(v, RINGS, v) >= 12), cvd.map((v) => `${v} ${closest(v, RINGS, v).toFixed(1)}`).join(', '));
check('and the move and attack markers; health high, middling and low; good and bad; seen and hidden; up and down on the map', cvd.every((v) => PAIRED.every((ks) => closest(v, ks, v) >= 12)), cvd.map((v) => `${v} ${Math.min(...PAIRED.map((ks) => closest(v, ks, v))).toFixed(1)}`).join(', '));
check('and the rings stay apart to an eye without the deficiency too', cvd.every((v) => closest(v, RINGS) >= 12));
check('text colours stay readable on the dark panels', VISIONS.every(([v]) => [PALETTES[v].goodText, PALETTES[v].badText, PALETTES[v].nameFriend, PALETTES[v].nameFoe].every((c) => lum(c) > 110)));
applyPalette('tritanopia');
check('applying a palette changes the live colours in place', palette.hpMid === PALETTES.tritanopia.hpMid && palette.friend === PALETTES.tritanopia.friend);
applyPalette('none');
check('and back', palette.hpMid === PALETTES.none.hpMid);
check('variable names', cssVar('hpLow') === '--c-hp-low' && cssVar('friend') === '--c-friend' && cssVar('nameFoe') === '--c-name-foe');

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
