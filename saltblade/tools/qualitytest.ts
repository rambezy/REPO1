// The auto quality ladder, fed made-up frame times: no browser, no GPU, no
// clock, so the result is the same on a loaded build machine as anywhere.
// Each case models what a frame costs on each rung, since whether a step
// down pays for itself is the whole question.
import { QualityLadder, RUNGS, SLOW_MS, GOOD_MS } from '../src/render/quality';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'ok ' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };

const SAMPLES = { high: 4, medium: 2, low: 0 };
/** What a rung costs on the GPU against the top one, on a 2x display: pixels, and a little for multisampling. */
const cost = (r: number) => { const R = RUNGS[r]; const dpr = R.level === 'high' ? 2 : R.level === 'medium' ? 1.5 : 1; return (R.scale * dpr / 2) ** 2 * (1 + SAMPLES[R.level] * 0.08) / (1 + 4 * 0.08); };
type Model = (rung: number) => number;
interface Run { path: string[]; at: number[]; share: number[]; remembered: number; }
/** Feeds `seconds` of frames whose length the model sets from the rung, with a little jitter unless told not to. */
function run(L: QualityLadder, model: Model, seconds: number, jitter = true): Run {
  const path: string[] = [], at: number[] = [], share = new Array(RUNGS.length).fill(0);
  let t = 0, remembered = -1;
  while (t < seconds * 1000) {
    const dt = model(L.rung) * (jitter ? 0.97 + (0.06 * ((t * 7919) % 1000)) / 1000 : 1);
    const ch = L.feed(dt);
    t += dt;
    share[L.rung] += dt;
    if (ch?.moved) { path.push(`${ch.rung}@${(t / 1000).toFixed(0)}`); at.push(t / 1000); }
    if (ch?.remember) remembered = ch.rung;
  }
  return { path, at, share: share.map((v: number) => v / t), remembered };
}
const steady = (ms: number): Model => () => ms;
const quantised = (ms: number, hz = 60) => Math.ceil(ms / (1000 / hz) - 1e-9) * (1000 / hz);
const pct = (f: number) => Math.round(f * 100) + '%';

check('rungs never get dearer going down', RUNGS.every((r, i) => i === 0 || (r.scale <= RUNGS[i - 1].scale && ['high', 'medium', 'low'].indexOf(r.level) >= ['high', 'medium', 'low'].indexOf(RUNGS[i - 1].level))));
check('the slow and good lines leave room between them', SLOW_MS > GOOD_MS && GOOD_MS > 1000 / 60);

// frames that do not depend on the rung: a 30 Hz display, or a simulation that is the bottleneck. The ladder tries, sees no gain, and stays up.
{
  const L = new QualityLadder();
  const r = run(L, steady(33.33), 180);
  check('a 30 Hz display ends at the top', L.rung === 0 && r.share[0] >= 0.9, `top ${pct(r.share[0])} of the time; ${r.path.join(' ')}`);
  check('its failed trial is tried one rung further, then undone', r.path[0]?.startsWith('1@') && r.path[1]?.startsWith('2@') && r.path[2]?.startsWith('0@'), r.path.slice(0, 3).join(' '));
  check('and then locked for a minute, doubling each time', r.at[3] - r.at[2] >= 58 && r.at[6] === undefined || (r.at[6] - r.at[5] >= 118), r.path.join(' '));
  check('nothing is remembered from it', r.remembered === -1);
}
{
  const L = new QualityLadder();
  const r = run(L, (rung) => Math.max(28, 6 * cost(rung)), 180);
  check('a CPU-bound game (28 ms of sim, 6 ms of GPU) ends at the top', L.rung === 0 && r.share[0] >= 0.9 && r.remembered === -1, `top ${pct(r.share[0])}; ${r.path.join(' ')}`);
}

// a hitch inside the window that decides the first trial must not inflate its baseline: the steady frames after it are no gain
{
  const L = new QualityLadder();
  let t = 0, remembered = -1, off = 0, hitched = false;
  while (t < 180000) {
    let dt = 33.33 * (0.97 + (0.06 * ((t * 7919) % 1000)) / 1000);
    if (!hitched && t >= 3000) { dt = 1000; hitched = true; }
    const ch = L.feed(dt);
    t += dt;
    if (L.rung > 0) off += dt;
    if (ch?.remember) remembered = ch.rung;
  }
  check('a 30 Hz display with a 1 s hitch before the first trial ends at the top and saves nothing', L.rung === 0 && remembered === -1 && off / t < 0.1, `rung ${L.rung}, remembered ${remembered}, below the top ${pct(off / t)}`);
}

// frames that do depend on the rung: the ladder descends and settles where it pays
{
  const L = new QualityLadder();
  const r = run(L, (rung) => quantised(26 * cost(rung)), 180);
  check('a 60 Hz display with a GPU at 26 ms settles two rungs down (a frame rate quantised by vsync)', L.rung === 2 && r.share[2] >= 0.8 && r.remembered === 2, `rung 2 ${pct(r.share[2])}; ${r.path.join(' ')}`);
}
{
  const L = new QualityLadder();
  const r = run(L, (rung) => 40 * cost(rung), 180);
  check('a GPU at 40 ms settles two rungs down and remembers it', L.rung === 2 && r.share[2] >= 0.8 && r.remembered === 2, `rung 2 ${pct(r.share[2])}; ${r.path.join(' ')}`);
}
{
  const L = new QualityLadder();
  const r = run(L, (rung) => 70 * cost(rung), 180);
  check('a GPU at 70 ms settles three rungs down', L.rung === 3 && r.share[3] >= 0.8 && r.remembered === 3, `rung 3 ${pct(r.share[3])}; ${r.path.join(' ')}`);
}
{
  const L = new QualityLadder();
  const r = run(L, (rung) => 12 * cost(rung), 60);
  check('a healthy machine never steps', r.path.length === 0 && L.rung === 0);
}

// one hitch in good frames is not a slow second; frames between the lines hold
{
  const L = new QualityLadder();
  run(L, steady(16.7), 5, false);
  const ch = [...(L.feed(400) ? [1] : []), ...run(L, steady(16.7), 5, false).path];
  check('a single 400 ms hitch does not step down', ch.length === 0 && L.rung === 0);
}
{
  const L = new QualityLadder(2);
  check('frames between the lines hold the rung', run(L, steady(20), 60, false).path.length === 0 && L.rung === 2);
}

// recovery: after good frames for `hold` seconds, one rung up; a step up that fails doubles the wait, once
{
  const L = new QualityLadder(3);
  const slowAbove: Model = (rung) => (rung >= 3 ? 16 : 40);
  const r = run(L, slowAbove, 60, false);
  check('good frames step up after the hold', r.path[0]?.startsWith('2@') && r.at[0] >= 8 && r.at[0] <= 12, r.path.join(' '));
  check('slow frames right after a step up step back down, and the fall pays', r.path[1]?.startsWith('3@') && r.at[1] - r.at[0] <= 6 && r.remembered === 3, r.path.join(' '));
  check('the next try waits for the doubled hold', L.hold >= 16 && r.path[2]?.startsWith('2@') && r.at[2] - r.at[1] >= 16, `hold ${L.hold}; ${r.path.join(' ')}`);
}

// a remembered rung is where the next session starts, and a nonsense one is clamped
check('starts from the remembered rung', new QualityLadder(4).rung === 4);
check('clamps a nonsense start', new QualityLadder(99).rung === RUNGS.length - 1 && new QualityLadder(NaN).rung === 0);

console.log(`${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
