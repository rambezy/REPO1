// A game session: starting fresh, saving, loading, autosaves and going back
// to the title screen. The land itself never changes; only what lives on it.
import { G } from '../state';
import { S } from '../sim/ctx';
import { World } from '../sim/world';
import { sel } from './control';
import { newGame, NewGameSetup, placeOres } from './newgame';
import { buildStructures } from './world';
import { serialize, apply, writeSave, readSave, SaveMeta, SAVE_VERSION } from '../sim/save';
import { structuresIn } from '../sim/structures';
import { emit } from '../core/events';
import { closeTop } from '../ui/dom';
import { RNG } from '../core/rng';
import { closeDialogue } from '../ui/dialogue';
import { Weather } from '../sim/weather';

/** Throws away the current world and every view of it. */
export function resetWorld() {
  while (closeTop()) { /* close every window */ }
  closeDialogue();
  emit('build:cancel');
  G.cam.follow = null;
  G.W = new World();
  S.W = G.W;
  G.structViews.clear();
  G.structViews.W = G.W;
  G.charViews.clear();
  G.nav.reset();
  G.nav.structures = structuresIn;
  S.weather = new Weather();
  S.weather.seed();
  sel.clear();
  emit('sel');
  emit('world:reset');
  document.getElementById('gameover')?.remove();
}

/** A world with its towns and ruins but nobody of yours in it (the title backdrop). */
export function backdropWorld() {
  resetWorld();
  S.rng = new RNG((Date.now() & 0xffff) + 1);
  placeOres();
  buildStructures();
  G.W.flags.backdrop = true;
}

export function startNewGame(setup: NewGameSetup) {
  resetWorld();
  S.rng = new RNG((Date.now() & 0xffff) + 1);
  newGame(setup);
  G.speed = 1;
  G.lastSpeed = 1;
  G.mode = 'play';
  G.autosaveT = 0;
  emit('game:start');
}

function placeName(): string {
  const c = G.W.playerChars()[0];
  if (!c) return '';
  const s = G.T.nearestSite(c.x, c.z);
  if (!s) return G.T.regionAt(c.x, c.z).name;
  const d = Math.hypot(s.x - c.x, s.z - c.z);
  return d < s.r + 80 ? s.name : `${G.T.regionAt(c.x, c.z).name}, near ${s.name}`;
}

export function saveMeta(): Omit<SaveMeta, 'slot' | 'savedAt'> {
  return { name: G.W.factionName, day: S.clock.day, chars: (G.W as World).playerChars().filter((c) => c.alive).length, money: G.W.money, place: placeName(), seed: G.seed };
}

export async function saveGame(slot: string): Promise<boolean> {
  if (G.mode !== 'play') return false;
  const ok = await writeSave(slot, saveMeta(), sessionExtra());
  S.fx.notice(ok ? (slot === 'auto' ? 'Autosaved.' : 'Game saved.') : 'Could not save: storage is unavailable.', ok ? 'info' : 'bad');
  return ok;
}

export function sessionExtra() {
  return { cam: { x: G.cam.target.x, z: G.cam.target.z, yaw: G.cam.yaw, pitch: G.cam.pitch, dist: G.cam.dist } };
}

/** Replaces the world with a saved one. */
export function loadData(data: any): string | null {
  if (!data || typeof data !== 'object' || !data.chars) return 'That is not a Saltblade save.';
  if (data.v > SAVE_VERSION) return 'That save comes from a newer version of the game.';
  if (data.seed !== G.seed) return 'That save belongs to a different world.';
  resetWorld();
  try {
    apply(data, G.W);
  } catch (e) {
    console.error(e);
    return 'The save is damaged and could not be loaded.';
  }
  G.W.rebuildObjHash();
  G.nav.reset();
  if (data.cam) {
    G.cam.lookAt(data.cam.x, data.cam.z, data.cam.dist);
    G.cam.yaw = G.cam.wantYaw = data.cam.yaw;
    G.cam.pitch = G.cam.wantPitch = data.cam.pitch;
  } else {
    const c = G.W.playerChars()[0];
    if (c) G.cam.lookAt(c.x, c.z, 40);
  }
  G.speed = 1;
  G.lastSpeed = 1;
  G.mode = 'play';
  G.autosaveT = 0;
  emit('game:start');
  S.fx.notice(`Loaded ${G.W.factionName}, day ${S.clock.day}.`, 'good');
  return null;
}

export async function loadSlot(slot: string): Promise<string | null> {
  let data: any;
  try { data = await readSave(slot); } catch { return 'The save could not be read.'; }
  if (!data) return 'There is no save in that slot.';
  return loadData(data);
}

/** Autosave every few real minutes of unpaused play. */
export function tickAutosave(dt: number) {
  if (G.mode !== 'play' || !G.speed || G.settings?.autosave === 0) return;
  G.autosaveT = (G.autosaveT ?? 0) + dt;
  const every = (G.settings?.autosave ?? 8) * 60;
  if (G.autosaveT >= every) {
    G.autosaveT = 0;
    void saveGame('auto');
  }
}

export function snapshot() { return serialize(sessionExtra()); }
