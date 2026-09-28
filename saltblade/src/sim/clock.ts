// Game time. The sim runs in real seconds (scaled by game speed); the clock
// runs RATE times faster, so a full day passes in 40 minutes at 1x.
import { pad2 } from '../core/math';

export const RATE = 36;
export const HOUR = 3600;
export const DAY = 86400;

export class Clock {
  t = DAY + 7.5 * HOUR; // game seconds since the world began (day 1, 07:30)
  get day() { return Math.floor(this.t / DAY); }
  get hour() { return (this.t / HOUR) % 24; }
  get isNight() { const h = this.hour; return h < 5.5 || h > 19.5; }
  advance(simDt: number) { this.t += simDt * RATE; }
  str() {
    const h = Math.floor(this.hour), m = Math.floor((this.hour - h) * 60);
    return `Day ${this.day}, ${pad2(h)}:${pad2(m)}`;
  }
  /** game hours between two clock readings */
  static hours(a: number, b: number) { return (b - a) / HOUR; }
}
