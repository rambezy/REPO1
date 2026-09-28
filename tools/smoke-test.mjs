// Smoke test for the production build: serves dist/index.html, starts a new
// game from the title screen, advances the opening, walks a few steps, opens
// the menus, and fails on any page error.
// Usage: npm run build && node tools/smoke-test.mjs
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const root = path.resolve(import.meta.dirname, '..');
// SMOKE_ARTIFACT=1 tests the artifact content wrapped in a host-like page skeleton
const asArtifact = !!process.env.SMOKE_ARTIFACT;
const file = path.join(root, asArtifact ? 'dist/artifact.html' : 'dist/index.html');
if (!existsSync(file)) { console.error(`${path.relative(root, file)} missing; run npm run build first`); process.exit(1); }
const html = asArtifact
  ? '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px)}body{margin:0;font:14px system-ui;background:#f7f7f5}img{max-width:100%}[hidden]{display:none!important}</style></head><body>' + readFileSync(file, 'utf8') + '</body></html>'
  : readFileSync(file);
const server = createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(html); });
await new Promise((r) => server.listen(0, r));
const url = `http://localhost:${server.address().port}/#debug`;
const out = path.join(root, 'tools/out');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT') && !m.text().includes('fonts.g')) errors.push(m.text()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const step = (s) => console.log('·', s);

try {
  await page.goto(url);
  await page.waitForSelector('#title .btn', { timeout: 15000 });
  step('title screen');
  await page.locator('#title .btn', { hasText: 'New Game' }).click();
  await page.locator('#title .btn', { hasText: 'Begin' }).click();
  await page.waitForFunction(() => window.__obi && window.__obi.G.mode !== 'title', null, { timeout: 15000 });
  step('new game started');
  // advance the opening: cards and dialogue lines, and pick the first choice when offered
  for (let i = 0; i < 80; i++) {
    const s = await page.evaluate(() => ({ mode: window.__obi.G.mode, locked: window.__obi.G.controlLocked, choices: document.querySelectorAll('#dialogue .choice').length }));
    if (s.mode === 'play' && !s.locked) break;
    if (s.choices) await page.keyboard.press('Digit1'); else await page.keyboard.press('KeyE');
    await sleep(350);
  }
  const st = await page.evaluate(() => window.__obi.where());
  if (st.mode !== 'play') throw new Error('opening did not finish: ' + JSON.stringify(st));
  step('opening finished at ' + st.map + ' ' + st.time);
  // walk around a little
  for (const k of ['KeyD', 'KeyS', 'KeyA', 'KeyW']) { await page.keyboard.down(k); await sleep(400); await page.keyboard.up(k); }
  await page.screenshot({ path: path.join(out, 'smoke-play.png') });
  // menus open and close
  for (const k of ['KeyI', 'KeyB', 'KeyM', 'KeyC']) {
    await page.keyboard.press(k);
    await sleep(300);
    const open = await page.evaluate(() => !!document.querySelector('.screen'));
    if (!open) throw new Error('menu did not open for ' + k);
    await page.keyboard.press('Escape');
    await sleep(250);
  }
  step('menus ok');
  // a canvas that is not blank
  const lit = await page.evaluate(() => {
    const c = document.getElementById('game');
    const x = c.getContext('2d');
    const d = x.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 60) n++;
    return n;
  });
  if (lit < 50) throw new Error('canvas looks blank');
  step('canvas renders');
  if (errors.length) throw new Error('page errors:\n' + errors.join('\n'));
  console.log('SMOKE OK');
} catch (e) {
  console.error('SMOKE FAILED:', e.message);
  if (errors.length) console.error(errors.join('\n'));
  await page.screenshot({ path: path.join(out, 'smoke-fail.png') }).catch(() => {});
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
