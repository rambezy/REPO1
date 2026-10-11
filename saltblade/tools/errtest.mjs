// Browser check that nothing stops the game. An error in a part of the sim
// shows the error card while the clock keeps running; the same error again
// after "Keep playing" stays quiet; a part that keeps failing is switched off;
// errors outside the main loop are caught too; a copy of the game goes to the
// Emergency slot; "Load last autosave" works; the picture can go away and come
// back; and a browser without WebGL is told so instead of hanging.
// Usage: with the dev server running, node tools/errtest.mjs
//   (URL=http://localhost:5180/ by default; OUT=tools/out for the screenshots)
import { chromium } from 'playwright';
const base = (process.env.URL || 'http://localhost:5180/').replace(/#.*$/, '');
const out = process.env.OUT || 'tools/out';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const results = [];
const check = (label, ok, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
await page.goto(`${base}#debug,play`);
await page.waitForFunction(() => window.__sb && window.__sb.G.mode === 'play', null, { timeout: 180000 });
await page.evaluate(async () => { window.__sb.speed(2); await (await import('/src/game/session.ts')).autosave(); });
/** how far the game has got: real time through the loop, and the game's own clock */
const progress = () => page.evaluate(() => ({ real: window.__sb.G.realTime, clock: window.__sb.S.clock.t }));
/** waits until the loop has run on for a while (the headless browser draws a frame or two a second) */
async function runsOn(from, secs = 0.3) {
  for (let i = 0; i < 60; i++) {
    const p = await progress();
    if (p.real - from.real >= secs && p.clock > from.clock) return p;
    await wait(500);
  }
  return progress();
}
const cardText = () => page.evaluate(() => document.querySelector('.errcard:not(.glcard)')?.innerText ?? '');

// ---------------------------------------------------------------- an error in a sim tick
let p0 = await progress();
await page.evaluate(() => window.__sb.fail('Squads', 1));
await page.waitForSelector('.errcard', { timeout: 60000 });
let p1 = await runsOn(p0, 0.5);
check('an error in a sim tick shows the card', /Squads/.test(await cardText()));
check('...and the clock keeps running', p1.real - p0.real >= 0.5 && p1.clock > p0.clock, `real +${(p1.real - p0.real).toFixed(1)} s, clock +${(p1.clock - p0.clock).toFixed(0)} game s`);
await page.waitForFunction(() => /Emergency save slot|could not be kept/.test(document.querySelector('.errsave')?.textContent ?? ''), null, { timeout: 60000 });
const emergency = await page.evaluate(async () => (await (await import('/src/sim/save.ts')).listSaves()).find((m) => m.slot === 'emergency'));
check('a copy of the game is kept in the Emergency slot, never offered as a safe one', !!emergency && emergency.safe === false && emergency.chars > 0);
await page.click('.errmore summary');
const details = await page.evaluate(() => document.querySelector('.errtext')?.value ?? '');
check('the details hold the error and where it came from, ready to copy', /A test failure in Squads/.test(details) && /\bat\b/.test(details) && /Saltblade \d/.test(details));
await page.screenshot({ path: `${out}/err_card.png`, timeout: 120000 });

// ---------------------------------------------------------------- keep playing
const holding = await page.evaluate(() => window.__sb.G.errorCard === true);
await page.click('.errcard button:has-text("Keep playing")');
check('"Keep playing" puts the card away (autosaves wait while it is up, and go on after)', !(await page.$('.errcard')) && holding && !(await page.evaluate(() => window.__sb.G.errorCard)));
p0 = await progress();
await page.evaluate(() => window.__sb.fail('Squads', 1));
p1 = await runsOn(p0, 0.3);
check('...and the same error again does not bring it back', !(await page.$('.errcard')));

// ---------------------------------------------------------------- a part that keeps failing
p0 = await progress();
await page.evaluate(() => window.__sb.fail('Chatter', 8));
await page.waitForFunction(() => window.__sb.failures().some((s) => s.name === 'Chatter' && s.off), null, { timeout: 90000 });
p1 = await runsOn(p0, 0.5);
check('a part that keeps failing is switched off, and the game goes on without it', /Chatter kept failing/.test(await cardText()) && p1.clock > p0.clock, `real +${(p1.real - p0.real).toFixed(1)} s`);
await page.screenshot({ path: `${out}/err_off.png`, timeout: 120000 });
// the simulation itself is never switched off: it fails a few times, then carries on
await page.evaluate(() => window.__sb.fail('Simulation', 12));
await page.waitForFunction(() => window.__sb.failures().find((s) => s.name === 'Simulation')?.fails >= 12, null, { timeout: 90000 });
p0 = await progress();
p1 = await runsOn(p0, 0.3);
check('the simulation is never switched off, and runs again once the errors stop', !(await page.evaluate(() => window.__sb.failures().find((s) => s.name === 'Simulation').off)) && p1.clock > p0.clock);
// the reviewers' case: one bad frame in drawing the names
await page.evaluate(() => { const G = window.__sb.G, draw = G.overlay.draw; let once = true; G.overlay.draw = function (...a) { if (once) { once = false; throw new Error('one bad frame'); } return draw.apply(this, a); }; });
p0 = await progress();
p1 = await runsOn(p0, 0.5);
check('one bad frame drawing the names does not stop the loop', p1.real - p0.real >= 0.5, `real +${(p1.real - p0.real).toFixed(1)} s`);

// ---------------------------------------------------------------- errors outside the loop
await page.evaluate(() => { setTimeout(() => { throw new Error('A test error in a click'); }, 0); void Promise.reject(new Error('A test rejection')); });
await wait(1500);
const all = await page.evaluate(() => document.querySelector('.errtext')?.value ?? '');
check('errors in event handlers and lost promises are caught and shown too', /The interface\][\s\S]*A test error in a click/.test(all) && /A background task\][\s\S]*A test rejection/.test(all));

// a part switched off by a passing upset is tried again after a quiet spell
await page.waitForFunction(() => window.__sb.failures().some((s) => s.name === 'Chatter' && !s.off), null, { timeout: 120000 }).catch(() => {});
check('...and after a quiet spell it is switched back on', await page.evaluate(() => window.__sb.failures().some((s) => s.name === 'Chatter' && !s.off)));

// ---------------------------------------------------------------- back to the last autosave
await page.waitForFunction(() => !document.querySelector('.errcard button.primary')?.disabled, null, { timeout: 30000 });
const label = await page.evaluate(() => document.querySelector('.errcard button.primary')?.innerText ?? '');
await page.click('.errcard button.primary');
await page.waitForFunction(() => !document.querySelector('.errcard') && window.__sb.G.mode === 'play', null, { timeout: 120000 });
const after = await page.evaluate(() => ({ off: window.__sb.failures().filter((s) => s.off).length, notices: [...document.querySelectorAll('.notice')].map((n) => n.textContent) }));
check('"Load last autosave" loads it, and switched-off parts get another chance', /Load last autosave/.test(label) && after.off === 0 && after.notices.some((n) => /^Loaded /.test(n)), label.replace(/\n/g, ' '));
await page.screenshot({ path: `${out}/err_loaded.png`, timeout: 120000 });
// the card over the paused game menu: loading from it closes the menu, and the game runs
await page.keyboard.press('Escape');
await page.waitForSelector('#gmenu', { timeout: 20000 });
await page.evaluate(() => window.__sb.fail('Hints', 1));
await page.waitForSelector('.errcard button.primary:not([disabled])', { timeout: 60000 });
await page.click('.errcard button.primary');
await page.waitForFunction(() => !document.querySelector('.errcard') && window.__sb.G.mode === 'play', null, { timeout: 120000 });
const menuAfter = await page.evaluate(() => ({ menu: !!document.querySelector('#gmenu'), speed: window.__sb.G.speed }));
check('loading from the card over the paused menu closes the menu, and the game runs', !menuAfter.menu && menuAfter.speed === 1, JSON.stringify(menuAfter));

// ---------------------------------------------------------------- the picture goes, and comes back
await page.evaluate(() => { window.__lose = window.__sb.G.R.gl.getContext().getExtension('WEBGL_lose_context'); window.__lose.loseContext(); });
await page.waitForSelector('.glcard', { timeout: 60000 });
const lost = await page.evaluate(() => ({ speed: window.__sb.G.speed, lost: window.__sb.G.glLost }));
check('when the graphics device goes, the game pauses and says so', lost.speed === 0 && lost.lost === true);
await page.screenshot({ path: `${out}/gl_lost.png`, timeout: 120000 });
await page.evaluate(() => window.__lose.restoreContext());
await page.waitForFunction(() => !document.querySelector('.glcard'), null, { timeout: 60000 });
p0 = await progress();
p1 = await runsOn(p0, 0.3);
check('...and carries on when it comes back', p1.clock > p0.clock && !(await page.evaluate(() => window.__sb.G.glLost)));
await wait(3000);
await page.screenshot({ path: `${out}/gl_back.png`, timeout: 120000 });
const escaped = pageErrors.filter((m) => !/A test error in a click|A test rejection|one bad frame/.test(m));
check('no error escaped to the page but the ones thrown on purpose', escaped.length === 0, escaped.slice(0, 3).join(' | '));
await page.close();

// ---------------------------------------------------------------- no WebGL at all
const bare = await browser.newPage({ viewport: { width: 1280, height: 760 } });
await bare.addInitScript(() => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...a) { return /webgl/.test(kind) ? null : get.call(this, kind, ...a); };
});
await bare.goto(base);
await bare.waitForSelector('.fatal', { timeout: 60000 });
const msg = await bare.evaluate(() => document.querySelector('.fatal')?.innerText ?? '');
check('a browser without WebGL is told what to do instead of hanging on the loading bar', /WebGL/.test(msg) && /hardware/.test(msg) && !(await bare.$('#loading')));
await bare.screenshot({ path: `${out}/no_webgl.png`, timeout: 120000 });
await bare.close();
// WebGL 2 is there, but will not draw for the game's own canvas
const balky = await browser.newPage({ viewport: { width: 1280, height: 760 } });
await balky.addInitScript(() => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (kind, ...a) { return this.id === 'view' && /webgl/.test(kind) ? null : get.call(this, kind, ...a); };
});
await balky.goto(base);
await balky.waitForSelector('.fatal', { timeout: 180000 });
check('...as is one whose WebGL will not draw for the game', /WebGL/.test(await balky.evaluate(() => document.querySelector('.fatal')?.innerText ?? '')) && !(await balky.$('#loading')));
await balky.close();

await browser.close();
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
