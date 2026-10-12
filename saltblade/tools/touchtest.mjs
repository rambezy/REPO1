// Touch run on a phone-sized screen (iPhone 13 emulation: a touch screen, no
// mouse): buys an item, equips a hat, sells a stack, loots a body and drags a
// window, all by taps, presses and swipes. Then the same windows on a desktop
// screen. Every window must stay inside the viewport on both.
// Usage: URL=http://localhost:5180 node tools/touchtest.mjs
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = process.env.URL || 'http://localhost:5180';
const out = process.env.OUT || 'tools/out/touch';
mkdirSync(out, { recursive: true });
let pass = 0, fail = 0;
let tracing = null; // the page whose event trace a failed check prints
const check = (name, ok, extra = '') => {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'ok ' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`);
  if (!ok && tracing) tracing.evaluate(() => window.__ptr).then((t) => console.log('   (the page saw ' + JSON.stringify(t) + ')'), () => {});
};

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const errors = [];
let mouseEvents = 0;

async function newPage(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push(m.text()); });
  // no hints in the way, and a settings file from before Auto quality existed
  await page.addInitScript(() => { localStorage.setItem('sb-settings', JSON.stringify({ hints: false, quality: 'medium' })); });
  await page.goto(base + '/#debug,play');
  await page.waitForFunction(() => window.__sb && window.__sb.G.mode === 'play', null, { timeout: 180000 });
  await page.waitForTimeout(1500);
  tracing = page;
  await page.evaluate(() => {
    __sb.speed(0);
    // a trace of pointer events and of the sheet and hold bar coming and going, for a press that opens no sheet
    window.__ptr = [];
    const note = (what) => { window.__ptr.push(what); if (window.__ptr.length > 14) window.__ptr.shift(); };
    for (const ev of ['pointerdown', 'pointerup', 'pointercancel']) window.addEventListener(ev, (e) => note([ev, (e.target.className || e.target.tagName || '').toString().slice(0, 12), Math.round(e.timeStamp), Math.round(performance.now())]), true);
    new MutationObserver((muts) => { for (const m of muts) { for (const n of m.addedNodes) if (n.className === 'sheetback' || n.className === 'holdbar') note(['+' + n.className, Math.round(performance.now())]); for (const n of m.removedNodes) if (n.className === 'sheetback' || n.className === 'holdbar') note(['-' + n.className, Math.round(performance.now())]); } }).observe(document.getElementById('ui'), { childList: true });
  });
  return { ctx, page };
}

const centre = async (page, sel) => {
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded();
  const r = await loc.boundingBox();
  if (!r) throw new Error('not found: ' + sel);
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
// Every touch event carries the finger's own clock. The DevTools session stamps an event only once the
// renderer has acknowledged the one before, so on a busy machine a tap would read as a press and a swipe as
// a rest; the game judges presses by the events' timestamps, as it must on a phone that hitches.
const touch = (cdp, type, pts, at) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts, timestamp: at });
const tapAt = async (cdp, page, x, y) => { const t = Date.now() / 1000; await touch(cdp, 'touchStart', [{ x, y }], t); await touch(cdp, 'touchEnd', [], t + 0.05); await page.waitForTimeout(400); };
const tap = async (page, sel) => { const c = await centre(page, sel); await tapAt(page.__cdp, page, c.x, c.y); };
const press = async (cdp, page, sel, ms = 650) => {
  const c = await centre(page, sel);
  const t = Date.now() / 1000;
  await touch(cdp, 'touchStart', [{ x: c.x, y: c.y }], t);
  await page.waitForTimeout(ms);
  await touch(cdp, 'touchEnd', [], t + ms / 1000);
  await page.waitForTimeout(400);
  const seen = await page.evaluate(() => ({ sheet: !!document.querySelector('.sheet'), held: !!document.querySelector('.held'), ptr: window.__ptr }));
  if (!seen.sheet) console.log(`   (press on ${sel} opened no sheet; held ${seen.held}; the page saw ${JSON.stringify(seen.ptr)})`);
};
// a finger path: down at the first point, through the rest a step at a time, up at the last
const swipePath = async (cdp, page, pts, step = 12) => {
  let t = Date.now() / 1000;
  await touch(cdp, 'touchStart', [{ x: pts[0].x, y: pts[0].y }], t);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step));
    for (let k = 1; k <= n; k++) { t += 0.016; await touch(cdp, 'touchMove', [{ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }], t); }
  }
  await touch(cdp, 'touchEnd', [], t + 0.016);
  await page.waitForTimeout(400);
};
const swipe = (cdp, page, from, to, steps = 8) => swipePath(cdp, page, [from, to], Math.hypot(to.x - from.x, to.y - from.y) / steps);
// the headless GPU is slow: a window may take a while to appear
const waitWin = (page, cls) => page.waitForFunction((cls) => !!document.querySelector('.win.' + cls), cls, { timeout: 60000, polling: 500 });
const winsFit = (page) => page.evaluate(() => [...document.querySelectorAll('.win')].map((w) => { const r = w.getBoundingClientRect(); return { t: w.querySelector('.wintitle')?.textContent, fits: r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5, w: Math.round(r.width), h: Math.round(r.height) }; }));
// an empty spot for an item of the element's size in the player's inventory grid, in screen space
const freeCell = (page, sel, label = 'Inventory') => page.evaluate(([sel, label]) => {
  const el = document.querySelector(sel);
  const w = Math.round(el.offsetWidth / 30), hh = Math.round(el.offsetHeight / 30);
  const p = __sb.G.W.playerChars()[0], g = p.inv;
  const wrap = [...document.querySelectorAll('.gridwrap')].find((x) => x.querySelector('.gridlabel')?.textContent === label);
  const r = wrap.querySelector('.grid').getBoundingClientRect();
  for (let y = 0; y + hh <= g.h; y++) for (let x = 0; x + w <= g.w; x++) {
    let ok = true;
    for (let j = 0; j < hh && ok; j++) for (let i = 0; i < w && ok; i++) if (g.itemAt(x + i, y + j)) ok = false;
    if (ok) return { x: r.left + x * 30 + 15, y: r.top + y * 30 + 15 };
  }
  return null;
}, [sel, label]);

// ---------------------------------------------------------------- phone
{
  const { ctx, page } = await newPage({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  await page.exposeFunction('__mouseSeen', () => { mouseEvents++; });
  // a tap also fires mouse events for old pages' sake; only ones from a real mouse count
  await page.evaluate(() => { for (const ev of ['mousedown', 'mouseup']) window.addEventListener(ev, (e) => { if (e.isTrusted && !e.sourceCapabilities?.firesTouchEvents) window.__mouseSeen(); }, true); });
  const cdp = await ctx.newCDPSession(page);
  page.__cdp = cdp;
  const vp = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, touch: navigator.maxTouchPoints }));
  check('phone viewport 390x844 with touch', vp.w === 390 && vp.h === 844 && vp.touch > 0, JSON.stringify(vp));

  // --- buy: tap a stock item, tap a free cell of the pack
  const shop = await page.evaluate(() => {
    const p = __sb.G.W.playerChars()[0];
    const keepers = [...__sb.G.W.chars.values()].filter((c) => c.faction !== 'player' && c.shop && c.alive && __sb.G.W.shops.get(+c.shop));
    keepers.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    const k = keepers[0];
    __sb.near2(k.id);
    __sb.G.W.money = 5000;
    p.inv.add('salt', 3);
    __sb.trade(k.id);
    return { id: k.id, name: k.name };
  });
  await waitWin(page, 'tradewin');
  await page.waitForTimeout(800);
  const pick = await page.evaluate(() => {
    const wrap = [...document.querySelectorAll('.gridwrap')].find((w) => w.querySelector('.gridlabel')?.textContent === 'For sale');
    const items = [...wrap.querySelectorAll('.item')].map((e) => ({ id: e.dataset.item, uid: +e.dataset.uid, price: +(e.querySelector('.price')?.textContent ?? '0') }));
    return items.find((i) => i.price > 0 && i.price < 600) ?? items[0];
  });
  const money0 = await page.evaluate(() => __sb.G.W.money);
  await tap(page, `.item[data-uid="${pick.uid}"]`);
  check('tap picks up a stock item', await page.evaluate(() => !!document.querySelector('.item.held') && !!document.querySelector('.holdbar')));
  const cell = await freeCell(page, `.item[data-uid="${pick.uid}"]`);
  await tapAt(cdp, page, cell.x, cell.y);
  await page.waitForTimeout(400);
  const bought = await page.evaluate((uid) => ({ have: __sb.G.W.playerChars()[0].inv.items.some((i) => i.uid === uid), money: __sb.G.W.money, held: !!document.querySelector('.item.held') }), pick.uid);
  check('tap on a cell buys it', bought.have && bought.money < money0 && !bought.held, `${pick.id} for ${money0 - bought.money}c from ${shop.name}`);

  // --- sell: a long press on the salt opens its sheet, which offers to sell it
  const saltUid = await page.evaluate(() => __sb.G.W.playerChars()[0].inv.items.find((i) => i.id === 'salt')?.uid);
  await press(cdp, page, `.item[data-uid="${saltUid}"]`);
  const sheetBtns = await page.evaluate(() => [...document.querySelectorAll('.sheetbtn')].map((b) => b.textContent));
  check('long press opens the action sheet: sell one, or all', sheetBtns.some((t) => t.startsWith('Sell 1 (')) && sheetBtns.some((t) => t.startsWith('Sell all 3 (')), sheetBtns.join(' | '));
  await page.screenshot({ path: `${out}/phone_trade_sheet.png` });
  const money1 = await page.evaluate(() => __sb.G.W.money);
  await tap(page, '.sheetbtn:has-text("Sell all")');
  await page.waitForTimeout(600);
  const sold = await page.evaluate(() => ({ gone: !__sb.G.W.playerChars()[0].inv.items.some((i) => i.id === 'salt'), money: __sb.G.W.money }));
  check('sheet sells the stack', sold.gone && sold.money > money1, `+${sold.money - money1}c`);
  // --- buy one off a stack through the sheet
  const meat = await page.evaluate(async () => {
    const { shopGrid } = await import('/src/sim/shops.ts');
    const { makeItem } = await import('/src/sim/inventory.ts');
    const { ITEM } = await import('/src/content/items.ts');
    const W = __sb.G.W, p = W.playerChars()[0];
    const k = [...W.chars.values()].filter((c) => c.faction !== 'player' && c.shop && c.alive && W.shops.get(+c.shop)).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    const stock = shopGrid(W.shops.get(+k.shop)), it = makeItem('dried_meat', 8), at = stock.findSpot(ITEM.dried_meat);
    stock.put(it, at[0], at[1]);
    __sb.trade(k.id);
    return { uid: it.uid, had: p.inv.count('dried_meat') + (p.eq.back?.inv?.count('dried_meat') ?? 0) };
  });
  await page.waitForTimeout(500);
  await press(cdp, page, `.item[data-uid="${meat.uid}"]`);
  const buyBtns = await page.evaluate(() => [...document.querySelectorAll('.sheetbtn')].map((b) => b.textContent));
  await tap(page, '.sheetbtn:has-text("Buy 1 (")');
  await page.waitForTimeout(500);
  const got = await page.evaluate(() => { const p = __sb.G.W.playerChars()[0]; return p.inv.count('dried_meat') + (p.eq.back?.inv?.count('dried_meat') ?? 0); });
  check('a stock stack\'s sheet offers one or all, and "Buy 1" buys one', buyBtns.some((t) => t.startsWith('Buy all 8 (')) && got - meat.had === 1, `${buyBtns.join(' | ')}; got ${got - meat.had}`);
  await page.screenshot({ path: `${out}/phone_trade.png` });
  for (const w of await winsFit(page)) check(`window fits the phone: ${w.t}`, w.fits, `${w.w}x${w.h}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // --- equip: tap the hat, tap the head slot
  await page.evaluate(() => { __sb.give('straw_hat'); __sb.emit('ui:char'); });
  await waitWin(page, 'charwin');
  await page.waitForTimeout(600);
  await tap(page, '.item[data-item="straw_hat"]');
  await tap(page, '.slotbox.s-head .slot');
  const worn = await page.evaluate(() => __sb.G.W.playerChars()[0].eq.head?.id);
  check('tap hat, tap head slot: equipped', worn === 'straw_hat', String(worn));
  await page.screenshot({ path: `${out}/phone_char.png` });
  for (const w of await winsFit(page)) check(`window fits the phone: ${w.t}`, w.fits, `${w.w}x${w.h}`);
  // and back off again through the slot's sheet
  await press(cdp, page, '.slotbox.s-head .slot');
  await tap(page, '.sheetbtn:has-text("Take off")');
  const off = await page.evaluate(() => ({ head: __sb.G.W.playerChars()[0].eq.head, inPack: __sb.G.W.playerChars()[0].inv.items.some((i) => i.id === 'straw_hat') }));
  check('slot sheet takes the hat off', !off.head && off.inPack);
  // a swipe that sets off sideways drags the item (here one cell right and four down); one straight down is the window scrolling, and moves nothing
  const hatAt = () => page.evaluate(() => { const i = __sb.G.W.playerChars()[0].inv.items.find((i) => i.id === 'straw_hat'); return [i.x, i.y]; });
  const h0 = await hatAt();
  let c = await centre(page, '.item[data-item="straw_hat"]');
  await swipePath(cdp, page, [c, { x: c.x + 40, y: c.y }, { x: c.x + 40, y: c.y + 120 }]);
  const h1 = await hatAt();
  check('a sideways swipe drags the item', h1[0] === h0[0] + 1 && h1[1] === h0[1] + 4, `${h0} -> ${h1}`);
  c = await centre(page, '.item[data-item="straw_hat"]');
  await swipePath(cdp, page, [c, { x: c.x, y: c.y - 90 }]);
  const h2 = await hatAt();
  check('an up-and-down swipe leaves it where it is', h2[0] === h1[0] && h2[1] === h1[1] && (await page.evaluate(() => document.querySelectorAll('.ghost').length)) === 0, `${h1} -> ${h2}`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  // --- loot: knock someone out, press their bandages, take them; then tap-move a second item
  const body = await page.evaluate(async () => {
    const H = await import('/src/sim/health.ts');
    const p = __sb.G.W.playerChars()[0];
    const t = [...__sb.G.W.chars.values()].filter((c) => c.faction !== 'player' && !c.animal && !c.robot && c.status === 'up' && !c.carriedBy && !c.cage).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    if (!t) return null;
    H.knockOut(t);
    t.inv.add('bandages', 2);
    t.inv.add('salt', 1);
    __sb.near2(t.id);
    __sb.emit('ui:loot', p.id, { char: t.id });
    return { id: t.id, name: t.name, uids: t.inv.items.map((i) => i.uid) };
  });
  check('a body to loot', !!body, body?.name);
  await waitWin(page, 'lootwin');
  await page.waitForTimeout(600);
  // (taken stacks merge into the pack's own, so count by kind rather than by id)
  const counts = () => page.evaluate((id) => { const p = __sb.G.W.playerChars()[0], t = __sb.G.W.char(id); return { mine: p.inv.count('bandages') + p.inv.count('salt'), theirs: t.inv.count('bandages') + t.inv.count('salt') }; }, body.id);
  const c0 = await counts();
  await press(cdp, page, `.item[data-uid="${body.uids[0]}"]`);
  await page.screenshot({ path: `${out}/phone_loot_sheet.png` });
  await tap(page, '.sheetbtn:has-text("Take")');
  await page.waitForTimeout(500);
  const c1 = await counts();
  check('loot sheet takes the item', c1.mine === c0.mine + 2 && c1.theirs === c0.theirs - 2, JSON.stringify([c0, c1]));
  await tap(page, `.item[data-uid="${body.uids[1]}"]`);
  const cell2 = await freeCell(page, `.item[data-uid="${body.uids[1]}"]`);
  await tapAt(cdp, page, cell2.x, cell2.y);
  await page.waitForTimeout(200);
  const c2 = await counts();
  check('tap-move loots the second item', c2.mine === c0.mine + 3 && c2.theirs === 0, JSON.stringify(c2));
  await page.screenshot({ path: `${out}/phone_loot.png` });
  for (const w of await winsFit(page)) check(`window fits the phone: ${w.t}`, w.fits, `${w.w}x${w.h}`);
  // drag a small window by its title with a finger: down 120, and further right than fits
  await page.evaluate(() => { const p = __sb.G.W.playerChars()[0]; __sb.emit('ui:inspect', p.id); });
  await waitWin(page, 'inspect');
  await page.waitForTimeout(500);
  const title = await centre(page, '.inspect .wintitle');
  const pos0 = await page.evaluate(() => { const e = document.querySelector('.inspect'); return [e.offsetLeft, e.offsetTop]; });
  await swipe(cdp, page, { x: title.x - 40, y: title.y }, { x: title.x + 300, y: title.y + 120 });
  const after = await page.evaluate(() => { const e = document.querySelector('.inspect'); const r = e.getBoundingClientRect(); return { left: e.offsetLeft, top: e.offsetTop, fits: r.bottom <= innerHeight && r.top >= 0 && r.right <= innerWidth && r.left >= 0 }; });
  check('finger drags the window and it stays on screen', after.top === pos0[1] + 120 && after.left > pos0[0] && after.fits, JSON.stringify([pos0, after]));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  check('no mouse events were used', mouseEvents === 0, `${mouseEvents} seen`);
  await ctx.close();
}

// ---------------------------------------------------------------- desktop
{
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 760 } });
  await page.evaluate(() => {
    const p = __sb.G.W.playerChars()[0];
    const keepers = [...__sb.G.W.chars.values()].filter((c) => c.faction !== 'player' && c.shop && c.alive && __sb.G.W.shops.get(+c.shop));
    keepers.sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    __sb.near2(keepers[0].id);
    __sb.trade(keepers[0].id);
  });
  await waitWin(page, 'tradewin');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/desk_trade.png` });
  await page.evaluate(() => { __sb.give('straw_hat'); __sb.emit('ui:char'); });
  await waitWin(page, 'charwin');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/desk_char.png` });
  await page.evaluate(async () => {
    const H = await import('/src/sim/health.ts');
    const p = __sb.G.W.playerChars()[0];
    const t = [...__sb.G.W.chars.values()].filter((c) => c.faction !== 'player' && !c.animal && !c.robot && c.status === 'up' && !c.carriedBy && !c.cage).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    H.knockOut(t); t.inv.add('bandages', 2); __sb.near2(t.id); __sb.emit('ui:loot', p.id, { char: t.id });
  });
  await waitWin(page, 'lootwin');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${out}/desk_loot.png` });
  for (const w of await winsFit(page)) check(`window fits the desktop: ${w.t}`, w.fits, `${w.w}x${w.h}`);
  await ctx.close();
}

check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
