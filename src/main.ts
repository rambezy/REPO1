// Entry point: boot, main loop, and game start.

import './styles.css';
import { G, player } from './game/G';
import { initRenderer, render, resize } from './render/renderer';
import { initInput, updateKeyScroll } from './ui/input';
import { initHud, showHud, refreshHud } from './ui/hud';
import { showMainMenu, loadSettings, playIntro } from './ui/menus';
import { updateMovement, followParty, setArriveHook } from './game/movement';
import { updateIdle, checkAwareness } from './game/ai';
import { startCombat } from './game/combat';
import { advanceTime } from './game/time';
import { takeExit, enterMap } from './game/travel';
import { msg, clearLog } from './game/log';
import './content/index';

let started = false;
let last = performance.now();
let timeAcc = 0;
let awareAcc = 0;

function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  G.now = now;
  if (G.screen === 'play' && G.map) {
    updateKeyScroll(dt);
    updateMovement(now);
    if (!G.modal) {
      updateIdle(now);
      followParty();
      // Game clock: 10 game seconds per real second while exploring.
      if (!G.combat) {
        timeAcc += dt * 10;
        if (timeAcc >= 60) {
          timeAcc -= 60;
          advanceTime(1);
        }
      }
      awareAcc += dt;
      if (awareAcc > 0.25) {
        awareAcc = 0;
        const spotter = checkAwareness();
        if (spotter) startCombat(spotter);
      }
    }
    render(now);
  }
  requestAnimationFrame(frame);
}

setArriveHook((a) => {
  const m = G.map;
  if (!m) return;
  if (a.uid === 'player' && !G.combat) {
    const ex = m.exitAt.get(m.idx(a.q, a.r));
    if (ex) {
      a._path = undefined;
      setTimeout(() => takeExit(ex), 0);
    }
  }
});

/** Show the in-game UI (after new game or load). */
export function startPlaying() {
  if (!started) {
    initHud();
    started = true;
  }
  showHud(true);
  resize();
  refreshHud();
}

export function startNewGame() {
  clearLog();
  startPlaying();
  const { flags } = G.state;
  flags._run = false;
  playIntro(() => {
    enterMap('shelter29', 'start');
    msg(`Welcome to the Ember Basin, ${player().name}.`);
    msg('Click to move. Right-click cycles the cursor between walk, use, look and attack.');
  });
}

function boot() {
  loadSettings();
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  initRenderer(canvas);
  initInput(canvas);
  showMainMenu();
  requestAnimationFrame(frame);
  (window as any).G = G;
  // Debug hooks used by the automated play tests.
  (window as any).DF = {
    enterMap,
    msg,
    travel: () => import('./game/travel'),
    interact: () => import('./game/interact'),
    combat: () => import('./game/combat'),
    dialogue: () => import('./ui/dialogue'),
    save: () => import('./game/save'),
    world: () => import('./ui/worldmap'),
    progress: () => import('./game/progress'),
    script: () => import('./game/script'),
    log: () => import('./game/log'),
  };
}

boot();
