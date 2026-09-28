// Mouse and keyboard state for the world view. UI elements stop propagation
// of their own events, so only clicks on the canvas reach the game.

export interface PointerHandlers {
  click?: (x: number, y: number, e: MouseEvent) => void;
  dblclick?: (x: number, y: number, e: MouseEvent) => void;
  rclick?: (x: number, y: number, e: MouseEvent) => void;
  box?: (x0: number, y0: number, x1: number, y1: number, e: MouseEvent) => void;
  boxing?: (x0: number, y0: number, x1: number, y1: number) => void;
  rdrag?: (x0: number, y0: number, x1: number, y1: number, done: boolean, e: MouseEvent) => void;
  move?: (x: number, y: number) => void;
}

class Input {
  keys = new Set<string>();
  mx = 0;
  my = 0;
  buttons = [false, false, false];
  wheel = 0;
  rotDX = 0;
  rotDY = 0;
  panDX = 0; // screen pixels dragged with a finger
  panDY = 0;
  touch = false; // a touch screen has been used
  shift = false;
  ctrl = false;
  alt = false;
  handlers: PointerHandlers = {};
  keyHandlers: ((code: string, e: KeyboardEvent) => boolean | void)[] = [];
  private downAt: [number, number, number][] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  private dragging = false;
  private rdragging = false;
  private lastClick = 0;
  mouseInWindow = true;
  typing = () => {
    const a = document.activeElement as HTMLElement | null;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable);
  };

  attach(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (this.typing()) return;
      this.mods(e);
      if (!e.repeat) {
        for (let i = this.keyHandlers.length - 1; i >= 0; i--) {
          if (this.keyHandlers[i](e.code, e)) { e.preventDefault(); return; }
        }
      }
      this.keys.add(e.code);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => { this.mods(e); this.keys.delete(e.code); });
    window.addEventListener('blur', () => { this.keys.clear(); this.buttons = [false, false, false]; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('mousedown', (e) => {
      this.mods(e);
      this.buttons[e.button] = true;
      this.downAt[e.button] = [e.clientX, e.clientY, performance.now()];
      if (e.button === 1) e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      this.mods(e);
      const dx = e.clientX - this.mx, dy = e.clientY - this.my;
      this.mx = e.clientX; this.my = e.clientY;
      this.mouseInWindow = true;
      if (this.buttons[1] || (this.buttons[0] && this.alt)) { this.rotDX += dx; this.rotDY += dy; return; }
      if (this.buttons[0]) {
        const [x0, y0] = this.downAt[0];
        if (!this.dragging && Math.hypot(e.clientX - x0, e.clientY - y0) > 6) this.dragging = true;
        if (this.dragging) this.handlers.boxing?.(x0, y0, e.clientX, e.clientY);
      }
      if (this.buttons[2]) {
        const [x0, y0] = this.downAt[2];
        if (!this.rdragging && Math.hypot(e.clientX - x0, e.clientY - y0) > 12) this.rdragging = true;
        if (this.rdragging) this.handlers.rdrag?.(x0, y0, e.clientX, e.clientY, false, e);
      }
      this.handlers.move?.(e.clientX, e.clientY);
    });
    document.addEventListener('mouseleave', () => { this.mouseInWindow = false; });
    window.addEventListener('mouseup', (e) => {
      this.mods(e);
      const was = this.buttons[e.button];
      this.buttons[e.button] = false;
      if (!was) return;
      const [x0, y0] = this.downAt[e.button];
      if (e.button === 0) {
        if (this.alt) { this.dragging = false; return; }
        if (this.dragging) {
          this.dragging = false;
          this.handlers.boxing?.(0, 0, 0, 0);
          this.handlers.box?.(x0, y0, e.clientX, e.clientY, e);
        } else if (e.target === canvas) {
          const now = performance.now();
          if (now - this.lastClick < 320) this.handlers.dblclick?.(e.clientX, e.clientY, e);
          else this.handlers.click?.(e.clientX, e.clientY, e);
          this.lastClick = now;
        }
      } else if (e.button === 2) {
        if (this.rdragging) { this.rdragging = false; this.handlers.rdrag?.(x0, y0, e.clientX, e.clientY, true, e); }
        else if (e.target === canvas) this.handlers.rclick?.(e.clientX, e.clientY, e);
      }
    });
    canvas.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 60 + 0.5); e.preventDefault(); }, { passive: false });
    this.attachTouch(canvas);
  }

  /**
   * Touch: tap selects, double-tap follows, press-and-hold is a right click,
   * one finger drags the view, two fingers pinch to zoom and twist to turn.
   */
  private attachTouch(canvas: HTMLCanvasElement) {
    let start: { x: number; y: number; t: number } | null = null;
    let moved = false, held = false, holdTimer = 0, lastTap = 0;
    let two: { d: number; a: number; y: number } | null = null;
    const fake = (x: number, y: number, button = 0) => ({ clientX: x, clientY: y, button, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false, target: canvas, preventDefault() {}, stopPropagation() {} }) as unknown as MouseEvent;
    const pair = (t: TouchList) => {
      const a = t[0], b = t[1];
      return { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), a: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX), y: (a.clientY + b.clientY) / 2 };
    };
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.touch = true;
      if (e.touches.length === 1) {
        const t = e.touches[0];
        start = { x: t.clientX, y: t.clientY, t: performance.now() };
        moved = false; held = false;
        this.mx = t.clientX; this.my = t.clientY;
        clearTimeout(holdTimer);
        holdTimer = window.setTimeout(() => {
          if (!moved && start) { held = true; this.handlers.rclick?.(start.x, start.y, fake(start.x, start.y, 2)); }
        }, 480);
      } else if (e.touches.length === 2) {
        clearTimeout(holdTimer);
        start = null;
        two = pair(e.touches);
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      if (e.touches.length === 1 && start) {
        const t = e.touches[0];
        if (!moved && Math.hypot(t.clientX - start.x, t.clientY - start.y) > 10) { moved = true; clearTimeout(holdTimer); }
        if (moved) { this.panDX += t.clientX - this.mx; this.panDY += t.clientY - this.my; }
        this.mx = t.clientX; this.my = t.clientY;
      } else if (e.touches.length === 2 && two) {
        const p = pair(e.touches);
        if (p.d > 0 && two.d > 0) this.wheel += Math.log(two.d / p.d) * 6;
        let da = p.a - two.a;
        if (da > Math.PI) da -= Math.PI * 2;
        if (da < -Math.PI) da += Math.PI * 2;
        this.rotDX -= da * 170;
        this.rotDY += (p.y - two.y) * 0.8;
        two = p;
      }
    }, { passive: false });
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      clearTimeout(holdTimer);
      if (e.touches.length === 0) {
        if (start && !moved && !held) {
          const now = performance.now();
          if (now - lastTap < 320) this.handlers.dblclick?.(start.x, start.y, fake(start.x, start.y));
          else this.handlers.click?.(start.x, start.y, fake(start.x, start.y));
          lastTap = now;
        }
        start = null; two = null;
      } else if (e.touches.length === 1) {
        two = null;
        const t = e.touches[0];
        start = { x: t.clientX, y: t.clientY, t: performance.now() };
        moved = true; // the rest of this gesture only drags
        this.mx = t.clientX; this.my = t.clientY;
      }
    }, { passive: false });
    canvas.addEventListener('touchcancel', () => { clearTimeout(holdTimer); start = null; two = null; });
  }
  takePan() { const p = [this.panDX, this.panDY]; this.panDX = 0; this.panDY = 0; return p; }
  private mods(e: KeyboardEvent | MouseEvent) {
    this.shift = e.shiftKey; this.ctrl = e.ctrlKey || e.metaKey; this.alt = e.altKey;
  }
  down(code: string) { return this.keys.has(code); }
  takeWheel() { const w = this.wheel; this.wheel = 0; return w; }
  takeRot() { const r = [this.rotDX, this.rotDY]; this.rotDX = 0; this.rotDY = 0; return r; }
  onKey(fn: (code: string, e: KeyboardEvent) => boolean | void) {
    this.keyHandlers.push(fn);
    return () => { const i = this.keyHandlers.indexOf(fn); if (i >= 0) this.keyHandlers.splice(i, 1); };
  }
}

export const input = new Input();
