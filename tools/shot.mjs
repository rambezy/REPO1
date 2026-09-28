// Usage: node tools/shot.mjs <url> <out.png> [waitMs] [width] [height]
import { chromium } from 'playwright';
const [url, out, wait = '800', w = '1280', h = '800'] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${e.stack}`));
await page.goto(url);
await page.waitForTimeout(+wait);
await page.screenshot({ path: out });
console.log(logs.join('\n'));
await browser.close();
