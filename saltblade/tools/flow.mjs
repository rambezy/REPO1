// Clicks through UI flows and takes screenshots.
// Usage: node tools/flow.mjs step... where a step is shot:name | click:text | sel:css | wait:ms | js:code | key:Code
import { chromium } from 'playwright';
const url = process.env.URL || 'http://localhost:5180/#debug';
const out = process.env.OUT || 'tools/out';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const logs = [];
page.on('console', (m) => { const t = m.text(); if (!t.includes('[vite]') && !t.includes('fonts.g') && !t.includes('ERR_CERT')) logs.push(`[${m.type()}] ${t}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
page.on('dialog', (d) => d.accept());
await page.goto(url);
await page.waitForFunction(() => window.__sb && (window.__sb.G.mode === 'title' || window.__sb.G.mode === 'play'), null, { timeout: 120000 });
await page.waitForTimeout(800);
for (const step of process.argv.slice(2)) {
  const i = step.indexOf(':');
  const k = step.slice(0, i), v = step.slice(i + 1);
  try {
    if (k === 'shot') { await page.screenshot({ path: `${out}/${v}.png` }); console.log('shot', v); }
    else if (k === 'click') await page.getByText(v, { exact: false }).first().click();
    else if (k === 'sel') await page.locator(v).first().click();
    else if (k === 'wait') await page.waitForTimeout(+v);
    else if (k === 'key') await page.keyboard.press(v);
    else if (k === 'js') { const r = await page.evaluate(v); if (r !== undefined) console.log('js ->', JSON.stringify(r)); }
    else if (k === 'until') await page.waitForFunction(v, null, { timeout: 120000 });
  } catch (e) { console.log('step failed', step, e.message.split('\n')[0]); }
}
if (logs.length) console.log(logs.slice(0, 40).join('\n'));
await browser.close();
