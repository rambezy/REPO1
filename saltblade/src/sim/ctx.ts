// Shared simulation context, so systems can reach the world without cycles.
import type { World } from './world';
import type { Terrain } from '../world/terrain';
import type { Nav } from '../world/nav';
import type { Clock } from './clock';
import type { Char } from './char';
import { RNG } from '../core/rng';
import type { Weather } from './weather';

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
    shot(from: Char, x: number, z: number, hit: boolean): void;
    notice(text: string, kind?: string): void;
    died(c: Char): void;
    ko(c: Char): void;
  };
}

export const S = {
  fx: {
    hit() {}, say() {}, sound() {}, shot() {}, notice() {}, died() {}, ko() {},
  },
  rng: new RNG(12345),
  time: 0,
} as unknown as SimCtx;
