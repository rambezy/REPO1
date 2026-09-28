import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errs.push(m.text()); });
await page.goto('http://localhost:5180/#debug,play');
await page.waitForFunction(() => window.__sb && window.__sb.G.mode === 'play', null, { timeout: 120000 });
await page.waitForTimeout(1500);
const ev = (js) => page.evaluate(js);
// move to open ground away from town
await ev("__sb.tp(__sb.G.W.playerChars()[0].x + 260, __sb.G.W.playerChars()[0].z - 60); __sb.unlockAll(); __sb.give('building_mats', 60); __sb.give('iron_plates', 20)");
await page.waitForTimeout(500);
console.log('chest', await ev("__sb.site('chest', 5, 0)"));
console.log('shack', await ev("__sb.site('shack', -8, 6, 0.3)"));
console.log('refinery', await ev("__sb.site('refinery', 4, -8)"));
console.log('wall', await ev("__sb.site('wall_wood', 14, 0, 0)"));
console.log('farm', await ev("__sb.site('farm_cactus', -4, -16, 0)"));
await ev("__sb.focus(24, 0.8, 0.8); __sb.speed(5)");
for (let i = 0; i < 12; i++) {
  await page.waitForTimeout(5000);
  const o = await ev("__sb.objs(undefined, 30)");
  console.log(JSON.stringify(o.filter((x) => x.kind !== 'ore')), JSON.stringify(await ev("__sb.pc()[0].act")));
}
await page.screenshot({ path: 'tools/out/base1.png' });
console.log(errs.slice(0, 10).join('\n'));
await browser.close();
