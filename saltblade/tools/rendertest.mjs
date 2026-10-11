// The frame budget in a headless browser (SwiftShader: a slow, software GPU).
// Auto quality is checked by feeding the renderer made-up frame times, since
// live timings depend on how busy the machine is; the live steps and a
// back-to-back high/low ratio are printed for information, with the load
// average beside them. The F3 counters must count every pass, an explicit
// setting must still win, and dusk must cast no shadow wedge (a screenshot).
// Usage: URL=http://localhost:5180 node tools/rendertest.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { loadavg, cpus } from 'node:os';

const base = process.env.URL || 'http://localhost:5180';
const out = process.env.OUT || 'tools/out/touch';
mkdirSync(out, { recursive: true });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'ok ' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };
const load = () => `load ${loadavg()[0].toFixed(1)} on ${cpus().length} cpus`;

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [], steps = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { const t = m.text(); if (t.includes('[render] auto quality')) steps.push(t); else if (m.type() === 'error' && !t.includes('ERR_CERT')) errors.push(t); });
await page.addInitScript(() => { localStorage.setItem('sb-settings', JSON.stringify({ hints: false })); localStorage.removeItem('sb-autoquality'); });
await page.goto(base + '/#debug,play');
await page.waitForFunction(() => window.__sb && window.__sb.G.mode === 'play', null, { timeout: 180000 });
const first = await page.evaluate(() => __sb.info());
check('starts on Auto at the top rung', first.quality === 'auto → high', first.quality);
await page.evaluate(() => { __sb.into('bar'); });
await page.keyboard.press('F3');

// live frames, for information only: what this machine did in its first 20 seconds
await page.waitForTimeout(20000);
console.log(`info live: ${(await page.evaluate(() => __sb.info())).quality} after ${steps.length} steps in 20 s (${load()})`);

// the ladder, fed frames of a known cost per rung (live timings depend on how busy the machine is)
const feed = (model, seconds) => page.evaluate(([model, seconds]) => {
  const SAMPLES = { high: 4, medium: 2, low: 0 }, CAP = { high: 2, medium: 1.5, low: 1 };
  const cost = () => { const R = __sb.G.R; return ((R.scale * CAP[R.level]) / 2) ** 2 * (1 + SAMPLES[R.level] * 0.08) / 1.32; };
  const ms = () => (model === 'gpu70' ? 70 * cost() : model === 'hz30' ? 33.3 : model === 'good' ? 16 : +model);
  for (let t = 0; t < seconds * 1000;) { const dt = ms(); __sb.G.R.feed(dt); t += dt; }
  return { ...__sb.info(), remembered: localStorage.getItem('sb-autoquality') };
}, [model, seconds]);
const restart = () => page.evaluate(() => { __sb.G.R.autoLive = false; localStorage.removeItem('sb-autoquality'); __sb.G.R.setQuality('auto'); });
await restart();
const before = steps.length;
const gpu = await feed('gpu70', 16);
check('a GPU needing 70 ms at the top: Auto settles on medium ×0.7 and remembers it', gpu.quality === 'auto → medium ×0.7' && gpu.remembered === '3', `${gpu.quality}, remembered ${gpu.remembered}`);
check('each step was reported', steps.length - before === 3 && steps.slice(before).every((s) => /auto → (high|medium|low)( ×0\.\d+)? \(frames averaged \d+ ms\)/.test(s)), steps.slice(before).join(' | '));
const midGl = await page.evaluate(() => ({ pr: __sb.G.R.pixelRatio, samples: __sb.G.R.composer.renderTarget1.samples, bloom: !!__sb.G.R.bloom, shadow: __sb.G.R.sun.shadow.mapSize.x, w: __sb.G.R.gl.domElement.width }));
check('that rung renders at 0.7 scale with 2x multisampling, the glow and a 1536 shadow map', midGl.pr === 0.7 && midGl.samples === 2 && midGl.bloom && midGl.shadow === 1536 && midGl.w === Math.round(1280 * 0.7), JSON.stringify(midGl));
const up = await feed('good', 12);
check('fed 12 s of 16 ms frames, Auto climbs one rung', up.quality === 'auto → medium ×0.85', up.quality);
check('a hitch does not step down', (await feed('400', 0.4)).quality === 'auto → medium ×0.85' && (await feed('good', 1)).quality === 'auto → medium ×0.85');
await restart();
const hz30 = await feed('hz30', 12);
check('a 30 Hz display (33 ms whatever the rung): Auto tries, gains nothing, and is back at the top', hz30.quality === 'auto → high' && hz30.remembered === null, `${hz30.quality}, remembered ${hz30.remembered}`);
await page.evaluate(() => { localStorage.setItem('sb-autoquality', '5'); __sb.G.R.setQuality('auto'); });
check('a remembered bottom rung starts no lower than the middle', (await page.evaluate(() => __sb.info().quality)) === 'auto → medium ×0.7');
await page.evaluate(() => { localStorage.removeItem('sb-autoquality'); });

// counters and the F3 line
const info = await page.evaluate(() => ({ ...__sb.info(), perf: document.querySelector('.perf')?.textContent }));
check('F3 counts draw calls and triangles across the passes', info.calls > 20 && info.tris > 20000, `${info.calls} calls, ${info.tris} tris`);
check('F3 names the quality in use', !!info.perf && info.perf.includes('quality auto'), info.perf);
await page.screenshot({ path: `${out}/render_f3.png` });

// an explicit setting replaces Auto (as the options do it: the settings object, then applySettings)
await page.evaluate(() => { __sb.G.R.setQuality('low'); });
const lowGl = await page.evaluate(() => ({ q: __sb.info().quality, pr: __sb.G.R.pixelRatio, samples: __sb.G.R.composer.renderTarget1.samples, bloom: !!__sb.G.R.bloom, shadow: __sb.G.R.sun.shadow.mapSize.x }));
check('an explicit Low replaces Auto: no multisampling, no glow, a 1024 shadow map', lowGl.q === 'low' && lowGl.samples === 0 && !lowGl.bloom && lowGl.shadow === 1024 && lowGl.pr === 1, JSON.stringify(lowGl));
await page.evaluate(() => { __sb.G.R.setQuality('nonsense'); });
check('a quality from nowhere falls back to Auto', (await page.evaluate(() => __sb.info().quality)).startsWith('auto'));

// back to back on the same scene, High, Low, High again: draw time as ratios, since absolute numbers depend on the machine's load
const drawAvg = () => page.evaluate(() => new Promise((res) => { let n = 0, s = 0; const f = () => { if (n > 6) s += __sb.G.R.drawMs; if (++n < 30) requestAnimationFrame(f); else res(s / (n - 7)); }; requestAnimationFrame(f); }));
const at = async (q) => { await page.evaluate((q) => { __sb.G.R.setQuality(q); }, q); await page.waitForTimeout(4000); return drawAvg(); };
const high = await at('high'), low = await at('low'), high2 = await at('high');
console.log(`info draw: high ${high.toFixed(1)} ms, low ${low.toFixed(1)} ms, high again ${high2.toFixed(1)} ms; high/low ${(high / low).toFixed(2)}, high again/low ${(high2 / low).toFixed(2)} (${load()})`);

// dusk over the town: long, faint shadows, no wedge
await page.evaluate(() => { const b = __sb.bld('bar'); __sb.hour(18.4); __sb.cam(b.x, b.z, 60, 0.6, 0.9); });
await page.waitForTimeout(4000);
await page.screenshot({ path: `${out}/render_dusk.png` });
const shadow = await page.evaluate(() => ({ intensity: +__sb.G.R.sun.shadow.intensity.toFixed(2), castY: +(__sb.G.R.sun.position.y - __sb.G.R.sun.target.position.y).toFixed(0), sunY: +__sb.G.daylight.sunDir.y.toFixed(3) }));
check('dusk shadows come from a lifted, faded light', shadow.castY >= 78 && shadow.intensity < 1 && shadow.sunY < 0.2, JSON.stringify(shadow));
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

// a settings store holding null (cleared, or written by hand) must not stop the game from starting
{
  const p2 = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errs2 = [];
  p2.on('pageerror', (e) => errs2.push(e.message));
  await p2.addInitScript(() => { localStorage.setItem('sb-settings', 'null'); });
  await p2.goto(base + '/#debug,play');
  const booted = await p2.waitForFunction(() => window.__sb && window.__sb.G.mode === 'play', null, { timeout: 180000 }).then(() => true, () => false);
  const q = booted ? await p2.evaluate(() => __sb.G.settings.quality) : null;
  check('a settings store holding null still boots, on Auto', booted && q === 'auto' && errs2.length === 0, `${q}${errs2.length ? ' errs: ' + errs2.join(' | ') : ''}`);
  await p2.close();
}
await browser.close();
console.log(`${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
