// Entry point: sets up the canvas, input, systems and the title screen.

import './styles.css';
import { G } from './G';
import { input, buildTouchControls } from './engine/input';
import { startLoop } from './engine/loop';
import { registerCoreSystems } from './engine/systems';
import { initNotify } from './ui/notify';
import { boot } from './game';
import { attachDebug } from './debug';

let lowRes = false;

/** Drops to one device pixel per CSS pixel if a high-density screen can't keep up. */
function watchFrameRate() {
  const times: number[] = [];
  let last = performance.now();
  const tick = (now: number) => {
    times.push(now - last);
    last = now;
    if (times.length >= 150) {
      const sorted = [...times].sort((a, b) => a - b);
      const median = sorted[times.length >> 1];
      times.length = 0;
      if (median > 24 && !lowRes && (window.devicePixelRatio || 1) > 1 && G.mode === 'play') {
        lowRes = true;
        resize();
        return;
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  // The world is drawn at full device resolution; `scale` is how many CSS
  // pixels one world unit covers, chosen so every screen frames about the
  // same stretch of land.
  let scale = Math.min(w / 420, h / 240);
  if (w < 700 || h < 480) scale = Math.max(2, Math.min(w / 210, h / 210));
  scale = Math.max(1.5, scale);
  const dpr = lowRes ? 1 : Math.min(2, window.devicePixelRatio || 1);
  G.scale = scale;
  G.dpr = dpr;
  G.viewW = w / scale;
  G.viewH = h / scale;
  const c = G.canvas;
  c.width = Math.round(w * dpr);
  c.height = Math.round(h * dpr);
  c.style.width = w + 'px';
  c.style.height = h + 'px';
  G.ctx.imageSmoothingEnabled = true;
  G.ctx.imageSmoothingQuality = 'high';
  input.setScale(scale);
}

function start() {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  G.canvas = canvas;
  G.ctx = canvas.getContext('2d', { alpha: false })!;
  resize();
  window.addEventListener('resize', resize);
  input.attach(canvas);
  initNotify(ui);
  buildTouchControls(ui);
  registerCoreSystems();
  boot(ui);
  if (import.meta.env.DEV || location.hash.includes('debug')) attachDebug();
  startLoop();
  watchFrameRate();
}

start();
