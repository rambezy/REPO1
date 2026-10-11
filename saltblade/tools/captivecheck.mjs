// Browser check of captivity: on the Chain-Bound start, right-clicking
// yourself opens your own menu with "Pick my shackles" (the first-steps hint
// asks for exactly that) and a "Move here"; with nothing to do for yourself,
// a right-click beside you is a step; a typed name in the menu title stays
// text; and with everyone caged the "all held" card appears with a lock to
// pick and time to skip, which leaves the speed Space resumes at alone.
// Screenshots go to OUT.
// Usage: URL=http://localhost:5182 OUT=tools/out/wp2-captivity node tools/captivecheck.mjs
import { chromium } from 'playwright';
const base = (process.env.URL || 'http://localhost:5180').replace(/\/#.*$/, '');
const out = process.env.OUT || 'tools/out';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errs.push(m.text()); });
const results = [];
const check = (label, ok, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
/** Waits for a condition in the page; false on timeout rather than a crash. */
const waitFor = async (fn, ms = 20000) => { try { await page.waitForFunction(fn, null, { timeout: ms }); return true; } catch { return false; } };
const screenPos = () => page.evaluate(() => {
  const V3 = __sb.G.R.camera.position.constructor;
  const c = __sb.G.W.playerChars()[0];
  const v = new V3(c.x, c.y + c.look.height * 0.55, c.z).project(__sb.G.R.camera);
  return { x: (v.x * 0.5 + 0.5) * innerWidth, y: (-v.y * 0.5 + 0.5) * innerHeight, shackled: c.shackled };
});
/** Lets the camera come to rest on the character: their place on screen stops moving. */
const settle = async () => {
  let last = await screenPos();
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(400);
    const now = await screenPos();
    if (Math.hypot(now.x - last.x, now.y - last.y) < 0.5) return now;
    last = now;
  }
  return last;
};
const menu = () => page.evaluate(() => ({ title: document.querySelector('.ctxmenu .ctxtitle')?.textContent ?? null, items: [...document.querySelectorAll('.ctxmenu .ctxitem')].map((b) => b.textContent), order: __sb.G.W.playerChars()[0].order }));
const menuOrOrder = () => waitFor(() => !!document.querySelector('.ctxmenu') || !!__sb.G.W.playerChars()[0].order, 8000);

await page.goto(`${base}/#debug,start=chainbound`);
await page.waitForFunction(() => window.__sb && window.__sb.G.mode === 'play', null, { timeout: 180000 });
await waitFor(() => __sb.G.W.playerChars().length > 0);
// dismiss the hint cards so the menu is in the clear, select the one character and look at them
await page.evaluate(() => { __sb.speed(0); document.querySelectorAll('.hintbox').forEach((b) => b.remove()); const c = __sb.G.W.playerChars()[0]; __sb.select([c.id]); __sb.cam(c.x, c.z, 12, 0.6, 0.6); __sb.G.cam.follow = null; });
let pos = await settle();
check('the Chain-Bound start begins in shackles', pos.shackled);
await page.mouse.click(pos.x, pos.y, { button: 'right' });
await menuOrOrder();
let m = await menu();
check('right-clicking yourself opens your own menu, not a move order', !!m.title && !m.order, JSON.stringify(m));
check('...and it offers "Pick my shackles", and a step', m.items.includes('Pick my shackles') && m.items.includes('Move here'), m.items.join(' | '));
await page.screenshot({ path: `${out}/captive_selfmenu.png` });
await page.getByText('Pick my shackles', { exact: true }).click();
check('choosing it sets them working at their own shackles', await waitFor(() => { const c = __sb.G.W.playerChars()[0]; return c.order && c.order.k === 'free' && c.order.id === c.id; }, 5000));

// a name typed as markup stays text in the menu title
await page.evaluate(() => { const c = __sb.G.W.playerChars()[0]; c.order = null; c.name = '<img src=x onerror="window.__xss=1">Mara'; });
pos = await settle();
await page.mouse.click(pos.x, pos.y, { button: 'right' });
await menuOrOrder();
const xss = await page.evaluate(() => ({ img: !!document.querySelector('.ctxtitle img'), ran: !!window.__xss, title: document.querySelector('.ctxtitle')?.textContent ?? '' }));
check('a name typed as markup is shown as text in the menu title', !xss.img && !xss.ran && xss.title.includes('<img'), xss.title);
await page.screenshot({ path: `${out}/captive_escaped_title.png` });
await page.keyboard.press('Escape');
await waitFor(() => !document.querySelector('.ctxmenu'), 3000);

// with nothing to do for yourself, a right-click just beside you is a step, not a dead menu
await page.evaluate(() => { const c = __sb.G.W.playerChars()[0]; c.name = 'Mara'; c.order = null; c.shackled = false; c.dirty = true; });
pos = await settle();
await page.mouse.click(pos.x + 14, pos.y + 18, { button: 'right' });
await menuOrOrder();
m = await menu();
check('unshackled and whole, a right-click beside yourself is a step', !m.title && m.order?.k === 'move', JSON.stringify(m));
await page.evaluate(() => { const c = __sb.G.W.playerChars()[0]; c.order = null; c.path = null; c.hasGoal = false; c.shackled = true; c.dirty = true; });
pos = await settle();
await page.mouse.click(pos.x + 14, pos.y + 18, { button: 'right' });
await menuOrOrder();
m = await menu();
check('shackled, the same click gives the menu, with the step in it', !!m.title && m.items.includes('Move here'), m.items.join(' | '));
await page.getByText('Move here', { exact: true }).click();
check('..."Move here" is that step', await waitFor(() => __sb.G.W.playerChars()[0].order?.k === 'move', 5000));
await page.evaluate(() => { const c = __sb.G.W.playerChars()[0]; c.order = null; c.path = null; c.hasGoal = false; });

// everyone caged: the card, the lock, the wait
await page.evaluate(() => {
  const W = __sb.G.W; const c = W.playerChars()[0];
  const cage = [...W.objs.values()].find((o) => o.kind === 'cage' && !o.occupant && Math.hypot(o.x - c.x, o.z - c.z) < 400);
  cage.occupant = c.id; c.cage = cage.id; c.x = cage.x; c.z = cage.z; c.y = __sb.G.T.heightAt(c.x, c.z); c.path = null; c.hasGoal = false;
  c.mem.jailUntil = __sb.G.clock.t + 86400 * 2;
  __sb.cam(c.x, c.z, 14, 0.6, 0.6); __sb.G.cam.follow = null; __sb.speed(1);
});
check('with everyone held, the card appears', await waitFor(() => !!document.querySelector('#captive'), 15000));
const card = await page.evaluate(() => { const el = document.querySelector('#captive'); return { text: el?.textContent ?? '', btns: [...(el?.querySelectorAll('button') ?? [])].map((b) => b.textContent) }; });
check('...and says why', /locked in a cage/.test(card.text) && /sentence/.test(card.text), card.text.slice(0, 140));
check('...with a lock to pick and time to skip', card.btns.some((b) => /Pick the lock/.test(b)) && card.btns.some((b) => /Wait/.test(b)), card.btns.join(' | '));
await waitFor(() => getComputedStyle(document.querySelector('#captive')).opacity === '1', 10000); // (the fade-in takes a few of the headless browser's slow frames)
await page.screenshot({ path: `${out}/captive_panel.png` });
await page.getByText('Wait (skip time)', { exact: true }).click();
check('waiting skips time', await waitFor(() => __sb.G.speed === 10, 5000), `speed ${await page.evaluate(() => __sb.G.speed)}`);
await page.getByText('Waiting… (stop)', { exact: true }).click();
check('...and stopping gives the old speed back, and leaves what Space resumes at alone', await waitFor(() => __sb.G.speed === 1 && __sb.G.lastSpeed === 1, 5000), JSON.stringify(await page.evaluate(() => ({ speed: __sb.G.speed, last: __sb.G.lastSpeed }))));
await page.getByText('Hide', { exact: true }).click();
check('hidden, the card folds to one line with a way back', await waitFor(() => { const el = document.querySelector('#captive.capmini'); return !!el && /held/.test(el.textContent) && /Show/.test(el.textContent); }, 5000));
await waitFor(() => getComputedStyle(document.querySelector('#captive')).opacity === '1', 10000);
await page.screenshot({ path: `${out}/captive_hidden.png` });
await page.getByText('Show', { exact: true }).click();
await waitFor(() => !!document.querySelector('#captive:not(.capmini)'), 5000);
await page.getByText('Pick the lock from inside', { exact: true }).click();
check('the lock button sets them working at the lock from inside', await waitFor(() => { const c = __sb.G.W.playerChars()[0]; return c.order?.k === 'lockpick' && c.order.obj === c.cage; }, 5000));
await waitFor(() => /Working at the lock/.test(document.querySelector('#captive')?.textContent ?? ''), 5000);
await page.screenshot({ path: `${out}/captive_picking.png` });
// the card goes when they are out
await page.evaluate(() => { const W = __sb.G.W; const c = W.playerChars()[0]; const cage = W.objs.get(c.cage); cage.occupant = 0; c.cage = 0; c.order = null; c.x += 1.5; });
check('...and the card goes once they are out', await waitFor(() => !document.querySelector('#captive'), 10000));

if (errs.length) console.log('page errors:', errs.slice(0, 5).join('\n'));
const failed = results.filter((x) => !x[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
await browser.close();
if (failed.length || errs.length) process.exitCode = 1;
