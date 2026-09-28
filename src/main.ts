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
/**
 * Watches the frame rate while playing and, on a machine that can't keep up,
 * steps down one rung at a time: device resolution first, then swaying
 * trees, ground cover and mist, then sun shadows.
 */
function watchFrameRate() {
  const rungs: (() => boolean)[] = [
    () => {
      if (lowRes || (window.devicePixelRatio || 1) <= 1) return false;
      lowRes = true;
      resize();
      return true;
    },
    () => { for (const k of ['sway', 'foliage', 'mist']) G.skip.add(k); return true; },
    () => { G.skip.add('shadows'); return true; },
  ];
  let rung = 0;
  const times: number[] = [];
  let last = performance.now();
  const tick = (now: number) => {
    if (G.mode === 'play') times.push(now - last);
    last = now;
    if (times.length >= 150) {
      const sorted = [...times].sort((a, b) => a - b);
      const median = sorted[times.length >> 1];
      times.length = 0;
      if (median > 26) {
        while (rung < rungs.length && !rungs[rung++]());
      }
    }
    if (rung < rungs.length) requestAnimationFrame(tick);
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
  // art is painted at 4 texels per unit: plain bilinear holds up down to 2 px
  // per unit and costs a fraction of mipmapped or bicubic sampling
  G.ctx.imageSmoothingQuality = scale * dpr >= 2 ? 'low' : 'medium';
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
  // scripted play-tests run in a slow headless browser: keep full quality there
  if (!location.hash.includes('debug')) watchFrameRate();
}

start();
