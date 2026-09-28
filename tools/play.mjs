// Scripted play-test: node tools/play.mjs <url> <outprefix> <steps-json>
// steps: [["wait",ms],["key","KeyD",ms],["shot","name"],["eval","js"],["click",x,y],["mouse",x,y]]
import { chromium } from 'playwright';
const [url, prefix, stepsJson, w = '1280', h = '800'] = process.argv.slice(2);
const steps = JSON.parse(stepsJson);
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
const logs = [];
page.on('console', (m) => { if (m.type() !== 'debug') logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
await page.goto(url);
for (const s of steps) {
  const [op, a, b, c] = s;
  if (op === 'wait') await page.waitForTimeout(a);
  else if (op === 'key') { await page.keyboard.down(a); await page.waitForTimeout(b || 100); await page.keyboard.up(a); }
  else if (op === 'down') await page.keyboard.down(a);
  else if (op === 'up') await page.keyboard.up(a);
  else if (op === 'press') await page.keyboard.press(a);
  else if (op === 'type') await page.keyboard.type(a);
  else if (op === 'shot') await page.screenshot({ path: `${prefix}-${a}.png` });
  else if (op === 'eval') { const r = await page.evaluate(a); if (r !== undefined) logs.push('[eval] ' + JSON.stringify(r)); }
  else if (op === 'click') await page.mouse.click(a, b);
  else if (op === 'mouse') await page.mouse.move(a, b);
  else if (op === 'mdown') { await page.mouse.move(a, b); await page.mouse.down({ button: c || 'left' }); }
  else if (op === 'mup') await page.mouse.up({ button: a || 'left' });
  else if (op === 'clicksel') await page.click(a);
}
console.log(logs.join('\n'));
await browser.close();
