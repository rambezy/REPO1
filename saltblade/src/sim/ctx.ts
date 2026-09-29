// Shared simulation context, so systems can reach the world without cycles.
import type { World } from './world';
import type { Terrain } from '../world/terrain';
import type { Nav } from '../world/nav';
import type { Clock } from './clock';
import type { Char } from './char';
import { RNG } from '../core/rng';
import type { Weather } from './weather';

/** What a shot looks like: a crossbow bolt, a turret's harpoon, a laser, a heavy laser. */
export type ShotKind = 'bolt' | 'harpoon' | 'laser' | 'heavy';
/** Effects the sim can ask for at a point (see render/particles.ts). */
export type BurstKind = 'sparks' | 'embers' | 'flash' | 'smoke' | 'dust' | 'blood' | 'steam' | 'oil' | 'glint';

export interface SimCtx {
  W: World;
  T: Terrain;
  nav: Nav;
  clock: Clock;
  rng: RNG;
  time: number; // sim seconds
  weather: Weather;
  /** hooks the presentation layer fills in */
  fx: {
    hit(c: Char, by: Char, dmg: number, blocked: boolean, limb: number): void;
    say(c: Char, text: string): void;
    sound(name: string, x: number, z: number, vol?: number): void;
    shot(from: Char, x: number, z: number, hit: boolean, kind?: ShotKind): void;
    burst(kind: BurstKind, x: number, y: number, z: number, n?: number): void;
    notice(text: string, kind?: string): void;
    died(c: Char): void;
    ko(c: Char): void;
  };
}

export const S = {
  fx: {
    hit() {}, say() {}, sound() {}, shot() {}, burst() {}, notice() {}, died() {}, ko() {},
  },
  rng: new RNG(12345),
  time: 0,
} as unknown as SimCtx;
