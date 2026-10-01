// The frame loop and the system registry. Systems register update functions
// for the phases they care about; the loop calls them in order.

import { G } from '../G';
import { input } from './input';
import { tickFrame } from '../world/world';
import { S } from '../state';

type Sys = { name: string; fn: (dt: number) => void; order: number };

const phases = {
  /** only while the player is in control */
  play: [] as Sys[],
  /** whenever the world is visible and alive (play, dialogue, cutscene) */
  world: [] as Sys[],
  /** every frame regardless of mode (UI, audio) */
  always: [] as Sys[],
};

export function addSystem(phase: keyof typeof phases, name: string, fn: (dt: number) => void, order = 50) {
  phases[phase].push({ name, fn, order });
  phases[phase].sort((a, b) => a.order - b.order);
}

let renderFn: () => void = () => {};
export function setRenderer(fn: () => void) { renderFn = fn; }

let last = 0;
let errors = 0;

function run(list: Sys[], dt: number) {
  for (const s of list) {
    try {
      s.fn(dt);
    } catch (e) {
      if (errors++ < 20) console.error(`system ${s.name} failed`, e);
    }
  }
}

function frame(now: number) {
  // schedule the next frame first, so no single failure can ever stop the game
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000;
  last = now;
  const dt = Math.min(0.05, Math.max(0, raw));
  G.dt = dt;
  G.clock += dt;
  try {
    input.update();
  } catch (e) {
    if (errors++ < 20) console.error('input failed', e);
  }
  tickFrame();
  if (!G.paused) {
    const worldAlive = G.mode === 'play' || G.mode === 'dialogue' || G.mode === 'cutscene';
    if (G.mode === 'play') {
      S.playSeconds += dt;
      run(phases.play, dt);
    }
    if (worldAlive) run(phases.world, dt);
  }
  run(phases.always, dt);
  try {
    renderFn();
  } catch (e) {
    if (errors++ < 20) console.error('render failed', e);
  }
  input.endFrame();
}

export function startLoop() {
  last = performance.now();
  requestAnimationFrame(frame);
}
