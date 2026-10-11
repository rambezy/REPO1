// A game session: starting fresh, saving, loading, autosaves and going back
// to the title screen. The land itself never changes; only what lives on it.
import { G } from '../state';
import { S } from '../sim/ctx';
import { World } from '../sim/world';
import { sel, setSpeed } from './control';
import { newGame, NewGameSetup, placeOres } from './newgame';
import { buildStructures } from './world';
import { serialize, apply, writeSave, readSave, listSaves, damage, danger, nextAutoSlot, AUTO_SLOTS, SaveMeta, SAVE_VERSION, WORLD_SHAPE } from '../sim/save';
import { structuresIn, townRings } from '../sim/structures';
import { emit } from '../core/events';
import { closeTop } from '../ui/dom';
import { RNG } from '../core/rng';
import { closeDialogue } from '../ui/dialogue';
import { Weather } from '../sim/weather';

/** Puts a world in place of the current one, throwing away every view of the old. */
function installWorld(W: World) {
  while (closeTop()) { /* close every window */ }
  closeDialogue();
  emit('build:cancel');
  G.cam.follow = null;
  G.W = W;
  S.W = W;
  G.structViews.clear();
  G.structViews.W = W;
  G.charViews.clear();
  G.nav.reset();
  G.nav.structures = structuresIn;
  G.nav.rings = townRings;
  sel.clear();
  emit('sel');
  emit('world:reset');
  if (typeof document !== 'undefined') document.getElementById('gameover')?.remove();
}

/** Throws away the current world and every view of it. */
export function resetWorld() {
  installWorld(new World());
  S.weather = new Weather();
  S.weather.seed();
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
  setSpeed(1);
  G.mode = 'play';
  G.autosaveT = 0;
  heldT = 0;
  unsaved = 0;
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

/** A quiet moment: nobody of yours fighting, down or carried off, and no error card waiting for an answer. */
const quiet = () => !danger(G.W) && !G.errorCard;

export function saveMeta(): Omit<SaveMeta, 'slot' | 'savedAt'> {
  return { name: G.W.factionName, day: S.clock.day, t: S.clock.t, chars: (G.W as World).playerChars().filter((c) => c.alive).length, money: G.W.money, place: placeName(), seed: G.seed, safe: quiet() };
}

/** Seconds of unpaused play since the game was last saved, loaded or begun. */
let unsaved = 0;
export const unsavedTime = () => unsaved;

export async function saveGame(slot: string): Promise<boolean> {
  if (G.mode !== 'play') return false;
  const ok = await writeSave(slot, slot === 'emergency' ? { ...saveMeta(), safe: false } : saveMeta(), sessionExtra());
  if (ok && slot !== 'emergency') unsaved = 0;
  if (slot !== 'emergency') S.fx.notice(ok ? (AUTO_SLOTS.includes(slot) ? 'Autosaved.' : 'Game saved.') : 'Could not save: storage is unavailable.', ok ? 'info' : 'bad');
  return ok;
}

/** Saves into whichever of the three autosave slots is due (never over the last good one, from a bad moment). */
export async function autosave(): Promise<boolean> {
  const saves = await listSaves().catch(() => [] as SaveMeta[]);
  return saveGame(nextAutoSlot(saves, quiet()));
}

export function sessionExtra() {
  return { cam: { x: G.cam.target.x, z: G.cam.target.z, yaw: G.cam.yaw, pitch: G.cam.pitch, dist: G.cam.dist } };
}

/**
 * Replaces the world with a saved one. The save is read into a world of its
 * own first and swapped in only when all of it went in: a damaged save leaves
 * the game you are playing as it was.
 */
export function loadData(data: any): string | null {
  if (!data || typeof data !== 'object' || !data.chars) return 'That is not a Saltblade save.';
  if (data.v > SAVE_VERSION) return 'That save comes from a newer version of the game.';
  if (data.seed !== G.seed) return 'That save belongs to a different world.';
  if ((data.shape ?? 1) !== WORLD_SHAPE) return 'That save was made before the waste changed shape (new towns and roads), and no longer fits it.';
  const why = damage(data);
  if (why) { console.error(`Save rejected: ${why}.`); return 'The save is damaged and could not be loaded.'; }
  const W = new World();
  try {
    apply(data, W);
  } catch (e) {
    console.error(e);
    return 'The save is damaged and could not be loaded.';
  }
  installWorld(W);
  W.rebuildObjHash();
  G.nav.reset();
  const cam = data.cam;
  if (cam && [cam.x, cam.z, cam.yaw, cam.pitch, cam.dist].every(Number.isFinite)) {
    G.cam.lookAt(cam.x, cam.z, cam.dist);
    G.cam.yaw = G.cam.wantYaw = cam.yaw;
    G.cam.pitch = G.cam.wantPitch = cam.pitch;
  } else {
    const c = G.W.playerChars()[0];
    if (c) G.cam.lookAt(c.x, c.z, 40);
  }
  setSpeed(1); // (and the speed buttons show it, after a load from the paused menu)
  G.mode = 'play';
  G.autosaveT = 0;
  heldT = 0;
  unsaved = 0;
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

let holdT = 0, heldT = 0;
/** The longest an autosave waits for a quiet moment (a captive can be one for days). */
const HOLD_MAX = 10 * 60;
/**
 * Autosave every few real minutes of unpaused play, into the next of three
 * slots. It waits for a quiet moment (nobody of yours fighting, down or being
 * carried off, no error card unanswered), but not for ever: after another
 * interval, ten minutes at most, it saves anyway. Such a save is marked as
 * made at a bad moment and never takes the place of the last good autosave.
 */
export function tickAutosave(dt: number) {
  if (G.mode !== 'play' || !G.speed) return;
  unsaved += dt;
  if (G.settings?.autosave === 0) return;
  G.autosaveT = (G.autosaveT ?? 0) + dt;
  const every = (G.settings?.autosave ?? 8) * 60;
  if (G.autosaveT < every) return;
  heldT += dt;
  holdT -= dt;
  if (holdT > 0) return;
  holdT = 2;
  if (!quiet() && heldT < Math.min(every, HOLD_MAX)) return;
  G.autosaveT = 0;
  heldT = 0; holdT = 0;
  void autosave();
}

export function snapshot() { return serialize(sessionExtra()); }
