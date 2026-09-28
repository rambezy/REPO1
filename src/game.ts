// Game lifecycle: boot, title, new game, load, death, and wiring the UI and
// story systems into the frame loop.

import { G } from './G';
import { Actor } from './world/actor';
import { addActor, enterMap, clearMaps, actors, getMap } from './world/world';
import { S, setState, newState, GameState } from './state';
import { refreshEquipment, addItem, equip } from './systems/inventory';
import { snapCamera } from './engine/renderer';
import { addSystem } from './engine/loop';
import { initUI, UI } from './ui/ui';
import { buildHUD, updateHUD, drawObjectiveOverlay } from './ui/hud';
import { updateBubbles } from './ui/bubbles';
import { updateDialogue, dialogueInput, hideDialogue } from './ui/dialogue';
import { menuHotkeys } from './ui/menu';
import { initInteract } from './systems/interact';
import { updateCrime } from './systems/crime';
import { renderHooks } from './engine/renderer';
import { input } from './engine/input';
import { waitMenu } from './ui/modal';
import { dogCommands } from './systems/companion';
import { showTitle } from './ui/title';
import { showDeath } from './ui/death';
import { on, emit } from './engine/events';
import { saveGame } from './systems/save';
import { registerWorld } from './content/world/overworld';
import { registerVillageInteriors } from './content/world/interiors_village';
import { registerTownInteriors } from './content/world/interiors_town';
import { chunks } from './world/chunks';
import { playMusic } from './audio/music';
import { settleSchedules } from './systems/ai';
import { resetSurvivalWarnings } from './systems/survival';
import { maxHp } from './systems/stats';
import { story } from './content/story/index';
import { updateMusicDirector } from './systems/director';
import { clearFx } from './engine/fx';
import { invalidateHere } from './world/world';
import { TILE } from './engine/util';
import { hideTitle } from './ui/title';

export function makePlayer(): Actor {
  const p = new Actor(S.playerName, 'player');
  p.faction = 'player';
  p.speed = 58;
  p.hp = S.hp;
  p.stamina = S.stamina;
  p.talkable = false;
  return p;
}

let registered = false;

export function boot(ui: HTMLElement) {
  initUI(ui);
  buildHUD();
  initInteract();
  registerWorld();
  registerVillageInteriors();
  registerTownInteriors();
  story.register();

  addSystem('always', 'dialogue', (dt) => { dialogueInput(); updateDialogue(dt); }, 8);
  addSystem('always', 'hud', () => updateHUD(), 80);
  addSystem('always', 'bubbles', () => updateBubbles(), 81);
  addSystem('always', 'menus', () => menuHotkeys(), 7);
  addSystem('always', 'title-cam', (dt) => {
    if (G.mode !== 'title' || !G.map) return;
    G.cam.x += dt * 6;
    if (G.cam.x > 90 * TILE) G.cam.x = 10 * TILE;
  }, 50);
  addSystem('play', 'crime', () => updateCrime(), 40);
  addSystem('play', 'hotkeys', () => {
    if (G.controlLocked) return;
    if (input.pressed('wait')) waitMenu();
    if (input.pressed('dog')) dogCommands();
  }, 45);
  addSystem('world', 'director', (dt) => updateMusicDirector(dt), 70);
  addSystem('world', 'story', (dt) => story.update(dt), 30);
  renderHooks.screen.push(drawObjectiveOverlay);

  if (!registered) {
    registered = true;
    on('load', (st: GameState) => loadGame(st));
    on('title', () => toTitle());
    on('autosave', () => saveGame('auto'));
    on('player:dead', () => {
      G.mode = 'dead';
      hideDialogue();
      setTimeout(() => showDeath((st) => loadGame(st), () => toTitle()), 1400);
    });
  }
  toTitle();
}

function resetWorld() {
  clearMaps();
  actors.length = 0;
  invalidateHere();
  clearFx();
  for (const id of ['overworld']) chunks.forget(id);
  G.cam.follow = null; G.cam.lockX = null; G.cam.lockY = null;
  G.controlLocked = false;
  G.fade = 0;
}

export function toTitle() {
  hideDialogue();
  if (UI.screen) UI.screen.close();
  setState(newState());
  resetWorld();
  S.minutes = 19 * 60 + 10;
  const p = makePlayer();
  p.hidden = true;
  G.player = p;
  addActor(p, 'overworld', 0, 0);
  enterMap('overworld', { x: 30 * TILE, y: 96 * TILE });
  G.cam.x = 12 * TILE; G.cam.y = 84 * TILE;
  G.mode = 'title';
  playMusic('title', 1.5);
  showTitle({ newGame, load: loadGame });
}

export function newGame(name: string, difficulty: 'story' | 'normal' | 'hard') {
  hideTitle();
  setState(newState(name));
  S.difficulty = difficulty;
  resetWorld();
  const p = makePlayer();
  G.player = p;
  addActor(p, 'hb_home', 0, 0);
  for (const id of ['linen_shirt', 'hose', 'russet_vest']) { addItem(id, 1, { quiet: true }); equip(id); }
  addItem('bread', 1, { quiet: true });
  refreshEquipment();
  p.maxHp = maxHp();
  p.hp = p.maxHp;
  resetSurvivalWarnings();
  G.mode = 'play';
  story.newGame();
}

export function loadGame(st: GameState) {
  hideDialogue();
  hideTitle();
  if (UI.screen) UI.screen.close();
  setState(st);
  resetWorld();
  const p = makePlayer();
  G.player = p;
  addActor(p, S.mapId, S.px, S.py);
  refreshEquipment();
  p.maxHp = maxHp();
  p.hp = Math.max(1, S.hp || p.maxHp);
  p.stamina = S.stamina;
  p.combat.bleeding = S.bleeding || 0;
  resetSurvivalWarnings();
  story.onLoad();
  enterMap(S.mapId, { x: S.px, y: S.py }, S.pdir);
  settleSchedules();
  snapCamera();
  G.mode = 'play';
  G.epoch++;
  emit('loaded');
}

export { getMap };
