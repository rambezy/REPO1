// Runs the game at high speed for a while and reports errors and frame stats.
import { chromium } from 'playwright';
const secs = +(process.argv[2] ?? 60);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errs.push(m.text()); });
await page.goto(process.env.URL || 'http://localhost:5180/#debug');
await page.waitForFunction(() => window.__sb && window.__sb.G.mode === 'play', null, { timeout: 120000 });
await page.evaluate(() => { __sb.speed(5); });
const t0 = Date.now();
while (Date.now() - t0 < secs * 1000) {
  await page.waitForTimeout(5000);
  const st = await page.evaluate(() => ({ t: __sb.G.clock.str(), chars: __sb.G.W.chars.size, active: __sb.G.W.active.length, squads: __sb.G.W.squads.size, views: __sb.G.charViews.count, info: __sb.info(), log: __sb.log().slice(-3) }));
  console.log(JSON.stringify(st));
  if (errs.length) break;
}
await page.screenshot({ path: 'tools/out/soak.png' });
console.log(errs.length ? 'ERRORS:\n' + errs.slice(0, 8).join('\n---\n') : 'no errors');
await browser.close();
