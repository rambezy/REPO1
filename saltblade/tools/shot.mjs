// Screenshots of the running dev server at given camera spots.
// Usage: node tools/shot.mjs <name> "<js to run before shot>" [...more name/js pairs]
import { chromium } from 'playwright';
const url = process.env.URL || 'http://localhost:5180/#debug,play';
const mode = process.env.MODE || 'play';
const out = process.env.OUT || 'tools/out';
const args = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (!t.includes('[vite]') && !t.includes('fonts.g')) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
const t0 = Date.now();
await page.waitForFunction((m) => window.__sb && window.__sb.G.mode === m, mode, { timeout: 120000 });
console.log('loaded in', Date.now() - t0, 'ms');
await page.waitForTimeout(1200);
for (let i = 0; i < args.length; i += 2) {
  const name = args[i], js = args[i + 1] || '';
  if (js) { const r = await page.evaluate(js); if (r !== undefined && r !== true) console.log(name, '->', JSON.stringify(r)); }
  await page.waitForTimeout(+(process.env.WAIT || 2500));
  await page.screenshot({ path: `${out}/${name}.png` });
  const info = await page.evaluate(() => window.__sb.info && window.__sb.info());
  console.log('shot', name, JSON.stringify(info));
}
if (logs.length) console.log(logs.slice(0, 30).join('\n'));
await browser.close();
