// The auto quality ladder: which rung to render at, decided from frame times.
// It is a pure policy with its own clock, fed one frame at a time, so it can
// be tested headlessly with made-up frames and never depends on a GPU.
export type QualityLevel = 'low' | 'medium' | 'high';
export type Quality = QualityLevel | 'auto';

export interface Rung { level: QualityLevel; scale: number; }

/** Each rung cheaper than the one before: never more samples, pixels or shadow texels than the rung above. */
export const RUNGS: Rung[] = [
  { level: 'high', scale: 1 },
  { level: 'high', scale: 0.85 },
  { level: 'medium', scale: 0.85 },
  { level: 'medium', scale: 0.7 },
  { level: 'low', scale: 0.7 },
  { level: 'low', scale: 0.6 },
];
/** A window of frames averaging longer than this is slow (about 42 fps) ... */
export const SLOW_MS = 24;
/** ... and one averaging shorter than this is comfortably at the display's pace (about 55 fps). */
export const GOOD_MS = 18;
/** a step down must cut the window average by this much to be kept */
const PAYS = 0.9;
/** a single hitch (a save, a model build) is capped so it cannot stand in for a slow second; below the cap, frames down to 10 fps still tell the rungs apart */
const HITCH_CAP = 100;
/** A window averaging this near the cap is frames at or past it (10 fps or worse): every rung reads the same there, so a step down cannot prove itself and is kept without proof */
const AT_CAP = HITCH_CAP * 0.9;
const WINDOW_MS = 1000;

export interface RungChange {
  rung: number;
  avg: number;
  /** the rung changed (false when a step down was only confirmed) */
  moved: boolean;
  /** this rung is now known to suit the machine: worth remembering for the next session */
  remember: boolean;
}

/**
 * Windows of about a second decide: a slow window steps down (one is enough
 * during the first probe, two in a row after that), and a run of good windows
 * as long as `hold` seconds steps up. A step up that is followed by a step
 * down within twenty seconds doubles the hold, so a machine on the edge
 * settles instead of flickering.
 *
 * Every step down is a trial: the first full window after it must come in
 * clearly shorter, or the ladder tries one rung more (a frame rate quantised
 * by vsync can need two), and if that does not pay either it goes back up and
 * locks that rung for a while, doubling the lock each time. So frames that do
 * not depend on the rung at all (a 30 Hz display, a simulation that is the
 * bottleneck) never drag the picture to the bottom.
 *
 * Below 10 fps every frame reads as the cap, on every rung, so no step could
 * ever prove itself: windows that sit at the cap step down without proof, one
 * rung a window, until the frames come back under it or the bottom is reached.
 * Such steps are not remembered for the next session.
 */
export class QualityLadder {
  rung: number;
  /** seconds of good windows before a step up is tried */
  hold = 8;
  private t = 0; // its own clock, in ms, advanced by the frames fed to it
  private winT = 0;
  private winSum = 0;
  private winN = 0;
  private settle = 2500; // ms ignored after a change: the view is still being built
  private probe = 6; // windows left in which a single slow window steps down
  private slowWins = 0;
  private goodT = 0;
  private lastUp = -Infinity;
  private trial: { from: number; base: number; extra: boolean } | null = null;
  private lockRung = -1;
  private lockUntil = 0;
  private lockMs = 60000;

  constructor(start = 0) {
    this.rung = Math.min(RUNGS.length - 1, Math.max(0, Math.floor(start) || 0));
  }

  /** Feeds one frame's time in ms; returns what the frame decided, if anything. */
  feed(dt: number): RungChange | null {
    this.t += dt;
    if (this.settle > 0) { this.settle -= dt; return null; }
    // a hitch counts as its capped length on the window's clock too, or the window would close early with an
    // inflated average, and the steady frames after it would pass for a gain
    const d = Math.min(dt, HITCH_CAP);
    this.winSum += d; this.winN++; this.winT += d;
    if (this.winT < WINDOW_MS || this.winN < 2) return null;
    const avg = this.winSum / this.winN;
    this.winT = this.winSum = this.winN = 0;
    if (this.probe > 0) this.probe--;
    // judge the last step down on the first full window after it settled
    if (this.trial) {
      const tr = this.trial;
      if (avg <= tr.base * PAYS) { this.trial = null; return { rung: this.rung, avg, moved: false, remember: true }; }
      // still at the cap, as before the step: there is nothing to judge by, so the step stands and the next is
      // taken; but nothing unproven is remembered for the next session (a long stretch of slow frames, at 15×
      // say, is no proof of the machine)
      if (avg >= AT_CAP && tr.base >= AT_CAP) {
        this.trial = null;
        if (this.rung >= RUNGS.length - 1) return null;
        this.trial = { from: this.rung, base: avg, extra: false };
        return this.move(this.rung + 1, avg, false);
      }
      if (!tr.extra && this.rung < RUNGS.length - 1) { tr.extra = true; return this.move(this.rung + 1, avg); }
      // it did not help: back up, and stay there for a while
      this.trial = null;
      this.lockRung = tr.from;
      this.lockUntil = this.t + this.lockMs;
      this.lockMs = Math.min(600000, this.lockMs * 2);
      return this.move(tr.from, avg);
    }
    if (avg > SLOW_MS) {
      this.goodT = 0;
      if (this.rung === this.lockRung && this.t < this.lockUntil) { this.slowWins = 0; return null; }
      if (++this.slowWins >= (this.probe > 0 ? 1 : 2)) {
        this.slowWins = 0;
        if (this.rung < RUNGS.length - 1) {
          // a step up that did not hold counts once: the next try waits twice as long
          if (this.t - this.lastUp < 20000) { this.hold = Math.min(90, this.hold * 2); this.lastUp = -Infinity; }
          this.trial = { from: this.rung, base: avg, extra: false };
          return this.move(this.rung + 1, avg);
        }
      }
    } else if (avg < GOOD_MS) {
      this.slowWins = 0;
      if (++this.goodT >= this.hold && this.rung > 0) {
        this.goodT = 0;
        this.lastUp = this.t;
        return this.move(this.rung - 1, avg, true);
      }
    } else { this.slowWins = 0; this.goodT = 0; }
    return null;
  }

  private move(i: number, avg: number, remember = false): RungChange {
    this.rung = i;
    this.settle = 1500;
    return { rung: i, avg, moved: true, remember };
  }
}
