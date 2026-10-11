// Mouse drag and drop, as it has always worked: pack to a storage chest and
// back, within a grid, into an equipment slot and back, buying and selling by
// drag, a window by its title, and a drop let go over the game view.
// Usage: URL=http://localhost:5180 node tools/dragtest.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.URL || 'http://localhost:5180';
const out = process.env.OUT || 'tools/out/touch';
mkdirSync(out, { recursive: true });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'ok ' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) process.on(sig, () => { console.log(`stopped by ${sig}`); process.exit(2); });
let finished = false;
browser.on('disconnected', () => { if (!finished) console.log('the browser went away'); });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push(m.text()); });
await page.addInitScript(() => { localStorage.setItem('sb-settings', JSON.stringify({ hints: false })); });
await page.goto(base + '/#debug,play');
await page.waitForFunction(() => window.__sb && window.__sb.G.mode === 'play', null, { timeout: 180000 });
await page.waitForTimeout(1500);
await page.evaluate(() => __sb.speed(0));

const centre = async (sel) => { const r = await page.locator(sel).first().boundingBox(); if (!r) throw new Error('not found: ' + sel); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const drag = async (from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 8, from.y + 8);
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(500);
};
const cellOf = (label, x, y) => page.evaluate(([label, x, y]) => {
  const wrap = [...document.querySelectorAll('.gridwrap')].find((w) => w.querySelector('.gridlabel')?.textContent === label);
  const r = wrap.querySelector('.grid').getBoundingClientRect();
  return { x: r.left + x * 30 + 15, y: r.top + y * 30 + 15 };
}, [label, x, y]);
const ghosts = () => page.evaluate(() => document.querySelectorAll('.ghost').length);
// the headless GPU is slow, and slower still on a loaded machine: a window may take a while to appear
const waitWin = (cls) => page.waitForFunction((cls) => !!document.querySelector(cls ? '.win.' + cls : '.win'), cls, { timeout: 60000, polling: 500 });

// --- a chest of the player's own, and the object window with both grids
const chest = await page.evaluate(() => {
  const p = __sb.G.W.playerChars()[0];
  const Grid = p.inv.constructor;
  p.inv.items.length = 0;
  p.inv.add('salt', 2);
  const o = __sb.G.W.addObj({ id: 0, kind: 'storage', def: 'chest', x: p.x + 1.5, z: p.z, y: __sb.G.T.heightAt(p.x + 1.5, p.z), rot: 0, owner: 'player', site: 0, parent: 0, inv: new Grid(6, 6) });
  __sb.select([p.id]);
  setTimeout(() => __sb.emit('ui:object', 0, o.id), 100);
  return o.id;
});
// wait for this window's own grids, not just any window: something else may be open already
await page.waitForFunction(() => {
  const labels = [...document.querySelectorAll('.gridlabel')].map((e) => e.textContent);
  return labels.includes('Contents') && labels.some((t) => t.endsWith("'s inventory"));
}, null, { timeout: 60000, polling: 500 });
await page.waitForTimeout(300);
const salt = await page.evaluate(() => __sb.G.W.playerChars()[0].inv.items[0].uid);
const invLabel = await page.evaluate(() => [...document.querySelectorAll('.gridlabel')].map((e) => e.textContent).find((t) => t.endsWith("'s inventory")));
check('object window shows the chest and the pack', !!invLabel && (await page.locator('.gridlabel:has-text("Contents")').count()) > 0, invLabel);
await drag(await centre(`.item[data-uid="${salt}"]`), await cellOf('Contents', 2, 2));
let where = await page.evaluate((id) => ({ inChest: __sb.G.W.objs.get(id).inv.items.length, inPack: __sb.G.W.playerChars()[0].inv.items.length }), chest);
check('pack to chest by drag', where.inChest === 1 && where.inPack === 0, JSON.stringify(where));
await drag(await centre(`.item[data-uid="${salt}"]`), await cellOf(invLabel, 3, 1));
where = await page.evaluate((id) => ({ inChest: __sb.G.W.objs.get(id).inv.items.length, inPack: __sb.G.W.playerChars()[0].inv.items.length, at: __sb.G.W.playerChars()[0].inv.items[0] && [__sb.G.W.playerChars()[0].inv.items[0].x, __sb.G.W.playerChars()[0].inv.items[0].y] }), chest);
check('chest to pack by drag, at the dropped cell', where.inChest === 0 && where.inPack === 1 && where.at?.[0] === 3 && where.at?.[1] === 1, JSON.stringify(where));
// within a grid
await drag(await centre(`.item[data-uid="${salt}"]`), await cellOf(invLabel, 0, 0));
where = await page.evaluate(() => { const i = __sb.G.W.playerChars()[0].inv.items[0]; return [i.x, i.y]; });
check('within a grid by drag', where[0] === 0 && where[1] === 0, JSON.stringify(where));
// a drop let go over the game view moves nothing and leaves no ghost behind
await drag(await centre(`.item[data-uid="${salt}"]`), { x: 1100, y: 600 });
check('a drop over the view moves nothing and lets go', (await ghosts()) === 0 && (await page.evaluate(() => __sb.G.W.playerChars()[0].inv.items.length)) === 1);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// --- equipment slot and back
await page.evaluate(() => { __sb.give('straw_hat'); __sb.emit('ui:char'); });
await waitWin('charwin');
await page.waitForTimeout(800);
await drag(await centre('.item[data-item="straw_hat"]'), await centre('.slotbox.s-head .slot'));
check('pack to head slot by drag', (await page.evaluate(() => __sb.G.W.playerChars()[0].eq.head?.id)) === 'straw_hat');
await drag(await centre('.slotbox.s-head .slot'), await cellOf('Inventory', 4, 4));
check('head slot to pack by drag', (await page.evaluate(() => !__sb.G.W.playerChars()[0].eq.head && __sb.G.W.playerChars()[0].inv.items.some((i) => i.id === 'straw_hat'))));
// the window by its title
const t = await centre('.charwin .wintitle');
const pos0 = await page.evaluate(() => { const e = document.querySelector('.charwin'); return [e.offsetLeft, e.offsetTop]; });
await drag({ x: t.x - 80, y: t.y }, { x: t.x + 120, y: t.y + 90 });
// the window may hit the bottom edge first: then it stops there
const pos1 = await page.evaluate(() => { const e = document.querySelector('.charwin'); const r = e.getBoundingClientRect(); return [e.offsetLeft, e.offsetTop, r.right <= innerWidth && r.bottom <= innerHeight, Math.round(innerHeight - r.height)]; });
check('window dragged by its title and kept on screen', pos1[0] === pos0[0] + 200 && pos1[1] === Math.min(pos0[1] + 90, pos1[3]) && pos1[2], JSON.stringify([pos0, pos1]));
await page.screenshot({ path: `${out}/desk_drag_char.png` });
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

// --- buying and selling by drag
await page.evaluate(() => {
  const p = __sb.G.W.playerChars()[0];
  const keepers = [...__sb.G.W.chars.values()].filter((c) => c.faction !== 'player' && c.shop && c.alive && __sb.G.W.shops.get(+c.shop));
  keepers.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  __sb.near2(keepers[0].id);
  __sb.G.W.money = 5000;
  __sb.trade(keepers[0].id);
});
await waitWin('tradewin');
await page.waitForTimeout(800);
const pick = await page.evaluate(() => {
  const wrap = [...document.querySelectorAll('.gridwrap')].find((w) => w.querySelector('.gridlabel')?.textContent === 'For sale');
  const items = [...wrap.querySelectorAll('.item')].map((e) => ({ id: e.dataset.item, uid: +e.dataset.uid, price: +(e.querySelector('.price')?.textContent ?? '0') }));
  return items.find((i) => i.price > 0 && i.price < 600) ?? items[0];
});
const money0 = await page.evaluate(() => __sb.G.W.money);
await drag(await centre(`.item[data-uid="${pick.uid}"]`), await cellOf('Inventory', 5, 5));
let m = await page.evaluate((uid) => ({ have: __sb.G.W.playerChars()[0].inv.items.some((i) => i.uid === uid), money: __sb.G.W.money }), pick.uid);
check('buy by drag', m.have && m.money < money0, `${pick.id}, ${money0 - m.money}c`);
await drag(await centre(`.item[data-uid="${salt}"]`), await cellOf('For sale', 0, 0));
const m2 = await page.evaluate((uid) => ({ gone: !__sb.G.W.playerChars()[0].inv.items.some((i) => i.uid === uid), money: __sb.G.W.money }), salt);
check('sell by drag', m2.gone && m2.money > m.money, `+${m2.money - m.money}c`);
await page.screenshot({ path: `${out}/desk_drag_trade.png` });

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
finished = true;
await browser.close();
console.log(`${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
