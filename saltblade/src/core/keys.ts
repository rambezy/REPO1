// The action map: every key the game listens for, by name, with the keys
// bound to it. A binding names what a key types ('i', 'F5', 'Ctrl+a'), so it
// follows the keyboard layout; the camera keys name a position ('@KeyW') so
// WASD stays a cluster under the left hand on AZERTY or Dvorak too. Bindings
// can be changed in the options and are kept with the settings. The title,
// the menus and a conversation keep their own fixed keys.
import { input } from './input';

export type ActionId =
  | 'pan_up' | 'pan_down' | 'pan_left' | 'pan_right' | 'rotate_left' | 'rotate_right' | 'tilt_up' | 'tilt_down' | 'follow'
  | 'pause' | 'speed1' | 'speed2' | 'speed3' | 'speed4' | 'travel'
  | 'select_all' | 'sneak' | 'walk' | 'hold' | 'drop' | 'next_squad'
  | 'char' | 'build' | 'research' | 'map' | 'factions' | 'log' | 'journal' | 'codex' | 'back'
  | 'quicksave' | 'quickload' | 'perf' | 'fullscreen' | 'build_rotate';

export type ActionGroup = 'Camera' | 'Time' | 'Squad' | 'Windows' | 'Game';

export interface ActionDef {
  id: ActionId;
  name: string;
  group: ActionGroup;
  /** the default bindings */
  keys: string[];
  /** read while held, by position; the others fire once on a press */
  hold?: boolean;
  /** cannot be rebound */
  fixed?: boolean;
  /** only means something in this situation, so it may share a key with an everyday action */
  when?: string;
  /** actions shown as one line of the key table (see HELP_ROWS) */
  row?: string;
}

/** The key table merges some actions into one line, under this name. */
export const HELP_ROWS: Record<string, string> = { pan: 'Move the camera', rotate: 'Turn the camera', tilt: 'Tilt the camera', speed: 'Game speed' };

export const ACTIONS: ActionDef[] = [
  { id: 'pan_up', name: 'Camera forward', group: 'Camera', keys: ['@KeyW', '@ArrowUp'], hold: true, row: 'pan' },
  { id: 'pan_left', name: 'Camera left', group: 'Camera', keys: ['@KeyA', '@ArrowLeft'], hold: true, row: 'pan' },
  { id: 'pan_down', name: 'Camera back', group: 'Camera', keys: ['@KeyS', '@ArrowDown'], hold: true, row: 'pan' },
  { id: 'pan_right', name: 'Camera right', group: 'Camera', keys: ['@KeyD', '@ArrowRight'], hold: true, row: 'pan' },
  { id: 'rotate_left', name: 'Turn left', group: 'Camera', keys: ['@KeyQ'], hold: true, row: 'rotate' },
  { id: 'rotate_right', name: 'Turn right', group: 'Camera', keys: ['@KeyE'], hold: true, row: 'rotate' },
  { id: 'tilt_up', name: 'Tilt up', group: 'Camera', keys: ['@PageUp'], hold: true, row: 'tilt' },
  { id: 'tilt_down', name: 'Tilt down', group: 'Camera', keys: ['@PageDown'], hold: true, row: 'tilt' },
  { id: 'follow', name: 'Follow the selected person', group: 'Camera', keys: ['f'] },
  { id: 'pause', name: 'Pause', group: 'Time', keys: ['Space'] },
  // the speeds go by position: on AZERTY the digit row types & é " ' without Shift
  { id: 'speed1', name: 'Normal speed', group: 'Time', keys: ['@Digit1'], row: 'speed' },
  { id: 'speed2', name: 'Fast', group: 'Time', keys: ['@Digit2'], row: 'speed' },
  { id: 'speed3', name: 'Faster', group: 'Time', keys: ['@Digit3'], row: 'speed' },
  { id: 'speed4', name: 'Fastest', group: 'Time', keys: ['@Digit4'], row: 'speed' },
  { id: 'travel', name: 'Travel speed (15× on a long walk, back to 1× when anything happens)', group: 'Time', keys: ['@Digit5'] },
  { id: 'select_all', name: 'Select everyone', group: 'Squad', keys: ['Ctrl+a'] },
  { id: 'sneak', name: 'Sneak', group: 'Squad', keys: ['t'] },
  { id: 'walk', name: 'Walk instead of run', group: 'Squad', keys: ['r'] },
  { id: 'hold', name: 'Hold position', group: 'Squad', keys: ['h'] },
  { id: 'drop', name: 'Put down whoever is carried', group: 'Squad', keys: ['x', 'Delete'] },
  { id: 'next_squad', name: 'Next squad', group: 'Squad', keys: ['Tab'] },
  { id: 'char', name: 'Character: gear, skills, health', group: 'Windows', keys: ['i'] },
  { id: 'build', name: 'Build', group: 'Windows', keys: ['b'] },
  { id: 'research', name: 'Research', group: 'Windows', keys: ['u'] },
  { id: 'map', name: 'Map', group: 'Windows', keys: ['m'] },
  { id: 'factions', name: 'Factions', group: 'Windows', keys: ['o'] },
  { id: 'log', name: 'Log', group: 'Windows', keys: ['l'] },
  { id: 'journal', name: 'Journal', group: 'Windows', keys: ['j'] },
  { id: 'codex', name: 'Codex', group: 'Windows', keys: ['k'] },
  { id: 'back', name: 'Close the top window, or open the menu', group: 'Windows', keys: ['Escape'], fixed: true },
  { id: 'quicksave', name: 'Quick save', group: 'Game', keys: ['F5'] },
  { id: 'quickload', name: 'Quick load', group: 'Game', keys: ['F9'] },
  { id: 'fullscreen', name: 'Fullscreen', group: 'Game', keys: ['Alt+Enter'] },
  { id: 'perf', name: 'Frame timings', group: 'Game', keys: ['F3'] },
  { id: 'build_rotate', name: 'Rotate', group: 'Game', keys: ['r'], when: 'placing a building' },
];

export const ACTION: Record<ActionId, ActionDef> = Object.fromEntries(ACTIONS.map((a) => [a.id, a])) as Record<ActionId, ActionDef>;

/** What a key event needs to carry to be matched (a real KeyboardEvent, or a plain object in tests). */
export interface KeyLike { key: string; code: string; ctrlKey?: boolean; shiftKey?: boolean; altKey?: boolean; metaKey?: boolean; }

const MODS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock', 'OS', 'Hyper', 'Super', 'Symbol']);
const BINDING = /^(?:(?:Ctrl|Shift|Alt)\+)*(?:@[A-Za-z][A-Za-z0-9]*|[^\s+@]|[A-Z][A-Za-z0-9]*)$/;

/** The letter or digit printed on a key, from its position: 'KeyW' is 'w', 'Digit1' is '1'. */
function fromCode(code: string | undefined): string | null {
  if (!code) return null;
  if (code.length === 4 && code.startsWith('Key')) return code[3].toLowerCase();
  if (code.length === 6 && code.startsWith('Digit')) return code[5];
  return null;
}

/**
 * The name of the key an event is for ('i', '1', 'Space', 'F5', 'ArrowUp'), or
 * null for a modifier pressed on its own. A letter is the same key with or
 * without Shift; a key that types something outside Latin (a Cyrillic or Greek
 * layout) goes by its QWERTY position instead.
 */
export function keyOf(e: KeyLike): string | null {
  const k = e.key;
  if (!k || k === 'Dead' || k === 'Unidentified' || k === 'Process' || MODS.has(k)) return null;
  if (k === ' ' || k === 'Spacebar') return 'Space';
  if (k.length !== 1) return k;
  const byCode = fromCode(e.code);
  if (e.shiftKey && byCode) return byCode;
  const lower = k.toLowerCase();
  return lower.charCodeAt(0) < 128 ? lower : byCode ?? lower;
}

/** A binding from its parts: modifiers, then the key. */
function chord(ctrl: boolean, shift: boolean, alt: boolean, key: string): string {
  return (ctrl ? 'Ctrl+' : '') + (shift ? 'Shift+' : '') + (alt ? 'Alt+' : '') + key;
}

/** The binding an event would match for the given key name. */
export function chordOf(e: KeyLike, key: string): string {
  return chord(!!(e.ctrlKey || e.metaKey), !!e.shiftKey, !!e.altKey, key);
}

/** A binding for a press action from an event, or null if only modifiers are down. */
export function bindingOf(e: KeyLike): string | null {
  const k = keyOf(e);
  return k ? chordOf(e, k) : null;
}

export const isBinding = (s: unknown): s is string => typeof s === 'string' && s.length <= 40 && BINDING.test(s);

function split(binding: string): { mods: string; key: string } {
  const i = binding.lastIndexOf('+', binding.length - 2);
  return i < 0 ? { mods: '', key: binding } : { mods: binding.slice(0, i + 1), key: binding.slice(i + 1) };
}

// ---------------------------------------------------------------- labels
const NAMES: Record<string, string> = {
  Space: 'Space', Escape: 'Esc', Delete: 'Del', Backspace: 'Bksp', PageUp: 'PgUp', PageDown: 'PgDn', Insert: 'Ins',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Enter', Tab: 'Tab', Home: 'Home', End: 'End',
};
const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

/** What each physical key types on this keyboard, when the browser can tell us. */
let layout: Map<string, string> | null = null;
export function setLayout(m: Map<string, string> | null) { layout = m; }
export function loadLayout(): Promise<void> {
  const kb = typeof navigator !== 'undefined' ? (navigator as unknown as { keyboard?: { getLayoutMap?: () => Promise<Map<string, string>> } }).keyboard : undefined;
  if (!kb?.getLayoutMap) return Promise.resolve();
  return kb.getLayoutMap().then((m) => { layout = new Map(m); }).catch(() => { /* not allowed here */ });
}

/** The layout name of a physical key: 'KeyW' is 'w' (or 'z' on AZERTY, when the browser says so); a digit key is its digit on every layout. */
function layoutKey(code: string): string {
  if (code.startsWith('Digit')) return fromCode(code) ?? code;
  return layout?.get(code) ?? fromCode(code) ?? code;
}

/** A binding as people read it: 'Ctrl+a' is 'Ctrl+A', '@KeyW' is 'W', 'Escape' is 'Esc'. */
export function keyLabel(binding: string): string {
  const { mods, key } = split(binding);
  const m = MAC ? mods.replace('Ctrl+', 'Cmd+').replace('Alt+', 'Option+') : mods;
  const k = key.startsWith('@') ? layoutKey(key.slice(1)) : key;
  return m + (NAMES[k] ?? (k.length === 1 ? k.toUpperCase() : k));
}

/** A binding resolved to the key it lands on, so a position and a layout name can be compared. */
function resolve(binding: string): string {
  const { mods, key } = split(binding);
  return mods + (key.startsWith('@') ? layoutKey(key.slice(1)) : key).toLowerCase();
}

// ---------------------------------------------------------------- the map
export type Handler = (e?: KeyLike) => boolean | void;
export interface Conflict { label: string; actions: ActionId[]; }

class KeyMap {
  bindings = {} as Record<ActionId, string[]>;
  /** actions on each binding; a situation's own actions come first */
  private index = new Map<string, ActionId[]>();
  /** physical codes read while held, per action (empty for most) */
  private codes = {} as Record<ActionId, string[]>;
  private handlers = new Map<ActionId, Handler[]>();

  constructor() { this.load(); }

  /** Starts from the defaults and lays the given bindings over them; anything malformed is ignored. */
  load(overrides?: unknown) {
    for (const d of ACTIONS) this.bindings[d.id] = d.keys.slice();
    for (const [id, keys] of Object.entries(sanitizeBindings(overrides))) this.bindings[id as ActionId] = keys;
    this.rebuild();
  }

  private rebuild() {
    this.index.clear();
    for (const d of ACTIONS) {
      const keys = this.bindings[d.id];
      this.codes[d.id] = keys.filter((k) => k.startsWith('@')).map((k) => k.slice(1));
      if (d.hold) continue; // read while held (see down), never fired by a press
      for (const k of keys) {
        const list = this.index.get(k) ?? [];
        if (d.when) list.unshift(d.id); else list.push(d.id);
        this.index.set(k, list);
      }
    }
  }

  set(id: ActionId, keys: string[]) {
    if (ACTION[id].fixed) return;
    this.bindings[id] = cleanKeys(ACTION[id], keys);
    this.rebuild();
  }

  reset() { this.load(); }

  /** The bindings that differ from the defaults (what the settings keep). */
  overrides(): Partial<Record<ActionId, string[]>> {
    const out: Partial<Record<ActionId, string[]>> = {};
    for (const d of ACTIONS) {
      const b = this.bindings[d.id];
      if (b.length !== d.keys.length || b.some((k, i) => k !== d.keys[i])) out[d.id] = b.slice();
    }
    return out;
  }

  /** The actions a key press is bound to, a situation's own first. */
  actionsFor(e: KeyLike): ActionId[] {
    const k = keyOf(e), ctrl = !!(e.ctrlKey || e.metaKey), alt = !!e.altKey;
    const list = this.lookup(ctrl, !!e.shiftKey, alt, k, e.code);
    // Shift is also the fast-camera modifier: a key with nothing bound to its Shift chord fires its plain binding
    return list.length || !e.shiftKey ? list : this.lookup(ctrl, false, alt, k, e.code);
  }

  private lookup(ctrl: boolean, shift: boolean, alt: boolean, key: string | null, code: string): ActionId[] {
    const byKey = key ? this.index.get(chord(ctrl, shift, alt, key)) : undefined;
    const byCode = code ? this.index.get(chord(ctrl, shift, alt, '@' + code)) : undefined;
    if (!byKey || !byCode) return byKey ?? byCode ?? [];
    return [...byKey, ...byCode.filter((id) => !byKey.includes(id))].sort((a, b) => Number(!!ACTION[b].when) - Number(!!ACTION[a].when));
  }

  actionFor(e: KeyLike): ActionId | null { return this.actionsFor(e)[0] ?? null; }

  /** Whether a held action's key is down right now (no allocation: called every frame). */
  down(id: ActionId): boolean {
    const codes = this.codes[id];
    for (let i = 0; i < codes.length; i++) if (input.keys.has(codes[i])) return true;
    return false;
  }

  /** Runs on a press of the action's key. Return false to let the key go on to others. */
  on(id: ActionId, fn: Handler): () => void {
    const list = this.handlers.get(id) ?? [];
    list.push(fn);
    this.handlers.set(id, list);
    return () => { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); };
  }

  /** Runs the handlers of an action, newest first, until one takes it. */
  handle(id: ActionId, e?: KeyLike): boolean {
    const list = this.handlers.get(id);
    if (!list) return false;
    for (let i = list.length - 1; i >= 0; i--) if (list[i](e) !== false) return true;
    return false;
  }

  /** Hands a key press to whatever it is bound to; true if something took it. */
  dispatch(e: KeyLike): boolean {
    for (const id of this.actionsFor(e)) if (this.handle(id, e)) return true;
    return false;
  }

  labels(id: ActionId): string[] { return this.bindings[id].map(keyLabel); }

  /** Keys that would fire two actions at once (one everyday action may share a key with a situation's own). */
  conflicts(): Conflict[] {
    const by = new Map<string, { label: string; when: Map<string, ActionId[]> }>();
    for (const d of ACTIONS) for (const b of this.bindings[d.id]) {
      const r = resolve(b);
      const key = by.get(r) ?? { label: keyLabel(b), when: new Map<string, ActionId[]>() };
      by.set(r, key);
      const list = key.when.get(d.when ?? '') ?? [];
      list.push(d.id);
      key.when.set(d.when ?? '', list);
    }
    const out: Conflict[] = [];
    for (const key of by.values()) {
      const actions = [...key.when.values()].filter((l) => l.length > 1).flat();
      if (actions.length) out.push({ label: key.label, actions });
    }
    return out;
  }
}

/**
 * The keys an action may have: well-formed, no duplicates, at most three. Never
 * Escape, which is the way back; a held action only by position, since that is
 * all `down` reads.
 */
function cleanKeys(d: ActionDef, keys: unknown[]): string[] {
  const ok = keys.filter((k): k is string => isBinding(k) && !/(^|\+)Escape$/.test(k) && (!d.hold || k.startsWith('@')));
  return [...new Set(ok)].slice(0, 3);
}

/** The valid part of a bindings record (from the settings or a hand-edited file): known actions, well-formed keys. */
export function sanitizeBindings(raw: unknown): Partial<Record<ActionId, string[]>> {
  const out: Partial<Record<ActionId, string[]>> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, keys] of Object.entries(raw as Record<string, unknown>)) {
    const d = ACTION[id as ActionId];
    if (!d || d.fixed || !Array.isArray(keys)) continue;
    out[d.id] = cleanKeys(d, keys);
  }
  return out;
}

export const keymap = new KeyMap();

/** The key table for How to Play: one line per action, or per row of merged actions, from the live bindings. */
export function helpRows(): { keys: string; what: string }[] {
  const out: { keys: string; what: string }[] = [];
  const done = new Set<string>();
  for (const d of ACTIONS) {
    if (d.row) {
      if (done.has(d.row)) continue;
      done.add(d.row);
      const group = ACTIONS.filter((a) => a.row === d.row);
      const n = Math.max(...group.map((a) => keymap.bindings[a.id].length));
      const sets: string[] = [];
      for (let i = 0; i < n; i++) sets.push(group.map((a) => keymap.bindings[a.id][i]).filter(Boolean).map(keyLabel).join(' '));
      out.push({ keys: sets.filter(Boolean).join(' · '), what: HELP_ROWS[d.row] });
    } else out.push({ keys: keymap.labels(d.id).join(' · ') || '—', what: d.when ? `${d.name} (while ${d.when})` : d.name });
  }
  return out;
}

/** Writes the keys into a text's `{action}` marks (a goal's "Sneak ({sneak})") as the player has them bound. */
export function withKeys(text: string): string {
  return text.replace(/\{(\w+)\}/g, (m, id: string) => (ACTIONS.some((d) => d.id === id) ? keymap.labels(id as ActionId)[0] ?? '—' : m));
}
