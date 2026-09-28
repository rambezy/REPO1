// Unified input: keyboard, mouse, gamepad and on-screen touch controls all
// feed one set of named actions that the rest of the game reads.

export type Action =
  | 'up' | 'down' | 'left' | 'right'
  | 'interact' | 'attack' | 'block' | 'dodge' | 'sprint' | 'crouch'
  | 'inventory' | 'journal' | 'map' | 'character' | 'menu' | 'dog' | 'wait'
  | 'quick1' | 'quick2' | 'quick3' | 'quick4'
  | 'confirm' | 'cancel' | 'help' | 'torch' | 'swap';

const KEYMAP: Record<string, Action[]> = {
  KeyW: ['up'], ArrowUp: ['up'],
  KeyS: ['down'], ArrowDown: ['down'],
  KeyA: ['left'], ArrowLeft: ['left'],
  KeyD: ['right'], ArrowRight: ['right'],
  KeyE: ['interact', 'confirm'],
  Enter: ['confirm'],
  NumpadEnter: ['confirm'],
  KeyJ: ['attack'],
  KeyK: ['block'],
  Space: ['dodge', 'confirm'],
  KeyL: ['dodge'],
  ShiftLeft: ['sprint'], ShiftRight: ['sprint'],
  ControlLeft: ['crouch'], KeyX: ['crouch'],
  KeyI: ['inventory'], Tab: ['inventory'],
  KeyB: ['journal'],
  KeyM: ['map'],
  KeyC: ['character'],
  Escape: ['menu', 'cancel'],
  Backspace: ['cancel'],
  KeyQ: ['dog'], KeyG: ['dog'],
  KeyT: ['wait'],
  KeyH: ['help'], F1: ['help'],
  KeyF: ['torch'], KeyR: ['swap'],
  Digit1: ['quick1'], Digit2: ['quick2'], Digit3: ['quick3'], Digit4: ['quick4'],
};

class Input {
  private keys = new Set<string>();
  private actDown = new Map<Action, boolean>();
  private actPrev = new Map<Action, boolean>();
  private virtual = new Map<Action, boolean>(); // from touch / gamepad
  private pressedQueue = new Set<Action>(); // actions triggered between frames

  mouseX = 0; // logical canvas px
  mouseY = 0;
  mouseInside = false;
  mouseMoved = false;
  lastDevice: 'keyboard' | 'mouse' | 'touch' | 'gamepad' = 'keyboard';
  touchMove = { x: 0, y: 0 };
  padMove = { x: 0, y: 0 };
  padAim = { x: 0, y: 0 };
  wheel = 0;
  enabled = true;
  typedChars: string[] = [];

  private canvas!: HTMLCanvasElement;
  private scale = 1;

  attach(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', (e) => {
      if (isTypingTarget(e.target)) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'F1' || e.code === 'Backspace') e.preventDefault();
      if (!e.repeat) {
        const acts = KEYMAP[e.code];
        if (acts) for (const a of acts) this.pressedQueue.add(a);
      }
      this.keys.add(e.code);
      this.lastDevice = 'keyboard';
      if (e.key.length === 1) this.typedChars.push(e.key);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseButtons.clear();
    });
    canvas.addEventListener('mousemove', (e) => this.onMouse(e));
    canvas.addEventListener('mouseenter', () => (this.mouseInside = true));
    canvas.addEventListener('mouseleave', () => (this.mouseInside = false));
    canvas.addEventListener('mousedown', (e) => {
      this.onMouse(e);
      this.mouseButtons.add(e.button);
      if (e.button === 0) this.pressedQueue.add('attack');
      if (e.button === 2) this.pressedQueue.add('block');
      this.lastDevice = 'mouse';
    });
    window.addEventListener('mouseup', (e) => this.mouseButtons.delete(e.button));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
  }

  private mouseButtons = new Set<number>();

  setScale(s: number) { this.scale = s; }

  private onMouse(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.mouseX = (e.clientX - r.left) / this.scale;
    this.mouseY = (e.clientY - r.top) / this.scale;
    this.mouseInside = true;
    this.mouseMoved = true;
    if (this.lastDevice !== 'touch') this.lastDevice = 'mouse';
  }

  setVirtual(a: Action, on: boolean) {
    if (on && !this.virtual.get(a)) this.pressedQueue.add(a);
    this.virtual.set(a, on);
  }

  private raw(a: Action): boolean {
    if (this.virtual.get(a)) return true;
    for (const code of this.keys) {
      const acts = KEYMAP[code];
      if (acts && acts.includes(a)) return true;
    }
    if (a === 'attack' && this.mouseButtons.has(0)) return true;
    if (a === 'block' && this.mouseButtons.has(2)) return true;
    return false;
  }

  /** Called once per frame before game logic. */
  update() {
    this.pollGamepad();
    const all: Action[] = ['up', 'down', 'left', 'right', 'interact', 'attack', 'block', 'dodge', 'sprint', 'crouch',
      'inventory', 'journal', 'map', 'character', 'menu', 'dog', 'wait', 'quick1', 'quick2', 'quick3', 'quick4',
      'confirm', 'cancel', 'help', 'torch', 'swap'];
    for (const a of all) {
      this.actPrev.set(a, this.actDown.get(a) || false);
      this.actDown.set(a, this.raw(a) || this.pressedQueue.has(a));
    }
    this.frameQueue = this.pressedQueue;
    this.pressedQueue = new Set();
  }
  private frameQueue = new Set<Action>();

  /** Call at end of frame. */
  endFrame() {
    this.wheel = 0;
    this.mouseMoved = false;
    this.typedChars.length = 0;
  }

  down(a: Action) { return this.enabled && (this.actDown.get(a) || false); }
  pressed(a: Action) {
    return this.enabled && (this.frameQueue.has(a) || ((this.actDown.get(a) || false) && !this.actPrev.get(a)));
  }
  released(a: Action) { return this.enabled && !this.actDown.get(a) && (this.actPrev.get(a) || false); }
  /** Consume a press so later readers in the same frame don't see it. */
  consume(a: Action) {
    this.frameQueue.delete(a);
    this.actPrev.set(a, true);
  }
  consumeAll() {
    this.frameQueue.clear();
    for (const [k, v] of this.actDown) this.actPrev.set(k, v);
  }

  moveVec(): { x: number; y: number } {
    if (!this.enabled) return { x: 0, y: 0 };
    let x = 0, y = 0;
    if (this.raw('left')) x -= 1;
    if (this.raw('right')) x += 1;
    if (this.raw('up')) y -= 1;
    if (this.raw('down')) y += 1;
    if (x !== 0 || y !== 0) {
      const l = Math.hypot(x, y);
      return { x: x / l, y: y / l };
    }
    const t = Math.hypot(this.touchMove.x, this.touchMove.y) > 0.15 ? this.touchMove : this.padMove;
    const l = Math.hypot(t.x, t.y);
    if (l < 0.15) return { x: 0, y: 0 };
    const m = Math.min(1, l);
    return { x: (t.x / l) * m, y: (t.y / l) * m };
  }

  isTouch() { return this.lastDevice === 'touch'; }

  // ---------- gamepad ----------
  private padPrev: boolean[] = [];
  /** Embedded pages may forbid the gamepad feature; then we stop asking. */
  private padBlocked = !gamepadAllowed();
  private pollGamepad() {
    if (this.padBlocked || !navigator.getGamepads) return;
    let pads: (Gamepad | null)[];
    try {
      pads = Array.from(navigator.getGamepads());
    } catch {
      this.padBlocked = true;
      return;
    }
    const gp = pads.find((p) => p && p.connected);
    if (!gp) return;
    const b = (i: number) => !!gp.buttons[i] && gp.buttons[i].pressed;
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    this.padMove = { x: ax, y: ay };
    this.padAim = { x: gp.axes[2] || 0, y: gp.axes[3] || 0 };
    const map: [number, Action][] = [
      [0, 'interact'], [0, 'confirm'], [2, 'attack'], [1, 'dodge'], [1, 'cancel'], [4, 'block'], [6, 'block'],
      [5, 'sprint'], [7, 'attack'], [3, 'dog'], [9, 'menu'], [8, 'map'], [10, 'crouch'],
      [12, 'up'], [13, 'down'], [14, 'left'], [15, 'right'],
    ];
    let any = Math.hypot(ax, ay) > 0.3;
    const states = new Map<Action, boolean>();
    for (const [i, a] of map) {
      const on = b(i);
      if (on) any = true;
      states.set(a, (states.get(a) || false) || on);
    }
    for (const [a, on] of states) {
      const prev = this.virtual.get(a) || false;
      if (on !== prev) this.setVirtual(a, on);
    }
    if (any) this.lastDevice = 'gamepad';
    this.padPrev = gp.buttons.map((x) => x.pressed);
  }
}

/** False when the page's permissions policy forbids gamepads (as in sandboxed embeds). */
function gamepadAllowed(): boolean {
  const d = document as unknown as { permissionsPolicy?: { allowsFeature?: (f: string) => boolean }; featurePolicy?: { allowsFeature?: (f: string) => boolean } };
  const policy = d.permissionsPolicy || d.featurePolicy;
  try {
    if (policy?.allowsFeature) return policy.allowsFeature('gamepad');
  } catch { /* unknown feature name: assume allowed and let the try/catch decide */ }
  return true;
}

function isTypingTarget(t: EventTarget | null) {
  if (!(t instanceof HTMLElement)) return false;
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
}

export const input = new Input();

// ---------- on-screen touch controls ----------

export function buildTouchControls(root: HTMLElement) {
  const wrap = document.createElement('div');
  wrap.id = 'touch';
  wrap.innerHTML = `
    <div class="t-stick" id="t-stick"><div class="t-knob" id="t-knob"></div></div>
    <div class="t-buttons">
      <button class="t-btn t-attack" data-act="attack" aria-label="Attack">⚔</button>
      <button class="t-btn t-block" data-act="block" aria-label="Block">⛨</button>
      <button class="t-btn t-dodge" data-act="dodge" aria-label="Dodge">»</button>
      <button class="t-btn t-use" data-act="interact" aria-label="Interact">E</button>
    </div>
    <div class="t-top">
      <button class="t-small" data-act="sprint" data-toggle="1" aria-label="Sprint">Run</button>
      <button class="t-small" data-act="crouch" aria-label="Sneak">Sneak</button>
      <button class="t-small" data-act="dog" aria-label="Dog">Dog</button>
      <button class="t-small" data-act="inventory" aria-label="Inventory">Bag</button>
      <button class="t-small" data-act="journal" aria-label="Journal">Book</button>
      <button class="t-small" data-act="map" aria-label="Map">Map</button>
      <button class="t-small" data-act="menu" aria-label="Menu">☰</button>
    </div>`;
  root.appendChild(wrap);

  const stick = wrap.querySelector('#t-stick') as HTMLElement;
  const knob = wrap.querySelector('#t-knob') as HTMLElement;
  let stickId: number | null = null;
  let cx = 0, cy = 0;
  const R = 44;
  const setKnob = (dx: number, dy: number) => {
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  stick.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    stickId = t.identifier;
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
    input.lastDevice = 'touch';
    onMoveTouch(t);
  }, { passive: false });
  const onMoveTouch = (t: Touch) => {
    let dx = t.clientX - cx, dy = t.clientY - cy;
    const l = Math.hypot(dx, dy);
    if (l > R) { dx = (dx / l) * R; dy = (dy / l) * R; }
    setKnob(dx, dy);
    input.touchMove = { x: dx / R, y: dy / R };
  };
  window.addEventListener('touchmove', (e) => {
    for (const t of Array.from(e.changedTouches)) if (t.identifier === stickId) onMoveTouch(t);
  }, { passive: true });
  const end = (e: TouchEvent) => {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === stickId) {
        stickId = null;
        setKnob(0, 0);
        input.touchMove = { x: 0, y: 0 };
      }
    }
  };
  window.addEventListener('touchend', end);
  window.addEventListener('touchcancel', end);

  const sprintState = { on: false };
  wrap.querySelectorAll<HTMLButtonElement>('button[data-act]').forEach((btn) => {
    const act = btn.dataset.act as Action;
    const toggle = btn.dataset.toggle === '1';
    btn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      input.lastDevice = 'touch';
      if (toggle) {
        sprintState.on = !sprintState.on;
        btn.classList.toggle('on', sprintState.on);
        input.setVirtual(act, sprintState.on);
      } else {
        btn.classList.add('on');
        input.setVirtual(act, true);
      }
    }, { passive: false });
    const up = (e: Event) => {
      e.preventDefault();
      if (!toggle) {
        btn.classList.remove('on');
        input.setVirtual(act, false);
      }
    };
    btn.addEventListener('touchend', up);
    btn.addEventListener('touchcancel', up);
    // Mouse fallback so the buttons also work when tapped with a mouse.
    btn.addEventListener('mousedown', (e) => { e.preventDefault(); if (!toggle) input.setVirtual(act, true); });
    btn.addEventListener('mouseup', (e) => { e.preventDefault(); if (!toggle) input.setVirtual(act, false); });
  });

  const detect = () => {
    const touchy = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    document.body.classList.toggle('has-touch', touchy);
  };
  detect();
  window.addEventListener('touchstart', () => document.body.classList.add('touch-active'), { once: true, passive: true });
  return wrap;
}
