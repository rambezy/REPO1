// Entry point: sets up the canvas, input, systems and the title screen.

import './styles.css';
import { G } from './G';
import { input, buildTouchControls } from './engine/input';
import { startLoop } from './engine/loop';
import { registerCoreSystems } from './engine/systems';
import { initNotify } from './ui/notify';
import { boot } from './game';

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  let scale = Math.max(1, Math.floor(Math.min(w / 400, h / 228)));
  if (w < 700 || h < 480) scale = Math.max(2, Math.floor(Math.min(w / 220, h / 220)));
  G.scale = scale;
  G.viewW = Math.ceil(w / scale);
  G.viewH = Math.ceil(h / scale);
  const c = G.canvas;
  c.width = G.viewW;
  c.height = G.viewH;
  c.style.width = G.viewW * scale + 'px';
  c.style.height = G.viewH * scale + 'px';
  G.ctx.imageSmoothingEnabled = false;
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
  startLoop();
}

start();
