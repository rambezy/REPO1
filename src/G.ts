// Global runtime singletons shared by every system. Only plain data here so
// that any module can import it without circular-initialisation problems.

import type { GameMap } from './world/map';
import type { Actor } from './world/actor';

export type Mode = 'title' | 'play' | 'dialogue' | 'cutscene' | 'menu' | 'minigame' | 'dead' | 'loading' | 'ending';

export interface Camera {
  x: number;
  y: number;
  shake: number;
  zoom: number;
  follow: Actor | null;
  lockX: number | null;
  lockY: number | null;
  speed: number;
}

export const G = {
  mode: 'title' as Mode,
  canvas: null as unknown as HTMLCanvasElement,
  ctx: null as unknown as CanvasRenderingContext2D,
  viewW: 480,
  viewH: 270,
  scale: 3,
  map: null as unknown as GameMap,
  player: null as unknown as Actor,
  cam: { x: 0, y: 0, shake: 0, zoom: 1, follow: null, lockX: null, lockY: null, speed: 8 } as Camera,
  /** real seconds since boot (animation clock) */
  clock: 0,
  dt: 0,
  /** game-time multiplier (1 = normal, higher while sleeping or waiting) */
  timeScale: 1,
  /** fade overlay 0..1 and its colour */
  fade: 0,
  fadeColor: '#000',
  /** screen tint for damage / effects */
  hurtFlash: 0,
  /** while true, the player cannot be controlled (cutscenes) */
  controlLocked: false,
  debug: false,
  paused: false,
  /** incremented when a save/load happens; systems can reset caches */
  epoch: 0,
};
