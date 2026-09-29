// Headless smoke test: boots the game, starts a new game, walks around and
// takes screenshots. Usage: node tools/smoke.mjs [url] (defaults to a vite preview).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
let server;
let url = process.argv[2];
if (!url) {
  server = spawn('npx', ['vite', '--port', '5199', '--strictPort'], { stdio: 'pipe' });
  await new Promise((res) => {
    server.stdout.on('data', (d) => { if (String(d).includes('5199')) res(); });
    setTimeout(res, 8000);
  });
  url = 'http://localhost:5199/';
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(url);
await page.waitForTimeout(800);
await page.screenshot({ path: out + '01-menu.png' });
await page.click('text=New Game');
await page.waitForTimeout(300);
await page.screenshot({ path: out + '02-select.png' });
await page.click('text=Take this resident');
await page.waitForTimeout(500);
await page.keyboard.press('Escape');
await page.waitForTimeout(1200);
await page.screenshot({ path: out + '03-shelter.png' });
const state = await page.evaluate(() => ({ screen: G.screen, map: G.map?.def.id, p: [G.state.player.q, G.state.player.r] }));
console.log('state', JSON.stringify(state));
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
server?.kill();
