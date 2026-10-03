// Scripted play-through driver for development.
// Usage: node tools/drive.mjs <scenario.mjs> [url] [outdir]
// A scenario exports `default async function (g)`; `g` offers helpers for
// starting a game, talking, choosing, waiting on game state and screenshots.
import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const [scenarioPath, url = 'http://localhost:5173/', outdir = '/tmp/claude-0/shots'] = process.argv.slice(2);
mkdirSync(outdir, { recursive: true });
const scenario = (await import(pathToFileURL(path.resolve(scenarioPath)).href)).default;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (m.type() === 'debug' || t.includes('gstatic') || t.includes('[vite]')) return; logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 5).join('\n')}`));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const g = {
  page,
  url,
  logs,
  sleep,
  log: (...a) => console.log('  ·', ...a),
  ev: (fn, arg) => page.evaluate(fn, arg),
  obi: (expr) => page.evaluate(`(() => { const o = window.__obi; return (${expr}); })()`),
  async shot(name) { await page.screenshot({ path: `${outdir}/${name}.png` }); g.log('shot', name); },
  async key(code, ms = 80) { await page.keyboard.down(code); await sleep(ms); await page.keyboard.up(code); },
  async waitFor(expr, timeout = 20000, label = expr) {
    const t0 = Date.now();
    for (;;) {
      const v = await g.obi(expr).catch(() => false);
      if (v) return v;
      if (Date.now() - t0 > timeout) throw new Error('timeout waiting for ' + label);
      await sleep(120);
    }
  },
  async newGame(name = 'Janek', difficulty = 'normal') {
    await page.goto(url);
    await page.waitForSelector('#title .btn');
    await page.locator('#title .btn', { hasText: 'New Game' }).click();
    await page.fill('#player-name', name);
    if (difficulty !== 'normal') await page.locator('#title .btn', { hasText: difficulty === 'story' ? 'Story' : 'Hard' }).click();
    await page.locator('#title .btn', { hasText: 'Begin' }).click();
    await g.waitFor('o && o.G.mode', 10000);
  },
  /** auto-advance dialogue lines; choices must still be picked */
  async auto(on = true) { await g.obi(`o.auto(${on})`); },
  async dialogue() { return g.obi('o.dialogue()'); },
  /** waits for a choice list containing `sub`, and picks it */
  async choose(sub, timeout = 30000) {
    const t0 = Date.now();
    for (;;) {
      const d = await g.dialogue();
      if (d && d.choices && d.choices.length) {
        const ok = await g.obi(`o.pick(${JSON.stringify(sub)})`);
        if (ok) { g.log('chose:', sub); await sleep(250); return; }
        throw new Error(`choice "${sub}" not among: ${d.choices.join(' | ')}`);
      }
      if (Date.now() - t0 > timeout) throw new Error('timeout waiting for choice ' + sub);
      await sleep(150);
    }
  },
  /** picks the first choice whenever choices appear, until the scene ends */
  async drain(timeout = 60000, prefer = [], avoid = []) {
    const t0 = Date.now();
    let idle = 0;
    const picked = new Set();
    for (;;) {
      const d = await g.dialogue();
      const mode = await g.obi('o.G.mode');
      if (d && d.choices && d.choices.length) {
        const clean = d.choices.map((c) => c.replace(/^\d+/, ''));
        const want = prefer.find((p) => clean.some((c) => c.toLowerCase().includes(p.toLowerCase()) && !picked.has(c)));
        let pick = want ? clean.find((c) => c.toLowerCase().includes(want.toLowerCase())) : null;
        if (!pick) pick = clean.find((c) => !picked.has(c) && !/farewell|heard anything|let's trade|leave it|later|never mind|come back/i.test(c) && !avoid.some((a) => c.toLowerCase().includes(a.toLowerCase())));
        if (!pick) pick = clean.find((c) => /farewell|later|come back|leave it/i.test(c)) || clean[0];
        picked.add(pick);
        await g.obi(`o.pick(${JSON.stringify(pick.slice(0, 40))})`);
        g.log('drain chose:', pick.slice(0, 70));
        idle = 0;
      } else if (!d && (mode === 'play') && !(await g.obi('o.G.controlLocked'))) {
        idle++;
        if (idle > 6) return;
      } else idle = 0;
      if (Date.now() - t0 > timeout) throw new Error('drain timeout; mode=' + mode + ' dlg=' + JSON.stringify(d));
      await sleep(200);
    }
  },
  async talk(id) { const ok = await g.obi(`o.talk(${JSON.stringify(id)})`); if (!ok) throw new Error('no actor ' + id); await sleep(300); },
  async use(key) { const ok = await g.obi(`o.use(${JSON.stringify(key)})`); if (!ok) throw new Error('no object ' + key); await sleep(300); },
  async tp(map, tx, ty) { await g.obi(`o.tp(${JSON.stringify(map)}, ${tx}, ${ty})`); await sleep(900); },
  async where() { return g.obi('o.where()'); },
  async quests() { return g.obi('o.quest()'); },
  async state(expr) { return g.obi(expr); },
};

let failed = false;
try {
  await scenario(g);
  console.log('SCENARIO OK');
} catch (e) {
  failed = true;
  console.log('SCENARIO FAILED:', e.message);
  await page.screenshot({ path: `${outdir}/fail.png` }).catch(() => {});
  console.log('where:', JSON.stringify(await g.where().catch(() => null)), 'dialogue:', JSON.stringify(await g.dialogue().catch(() => null)));
}
console.log('--- page log ---\n' + logs.slice(-60).join('\n'));
await browser.close();
process.exit(failed ? 1 : 0);
