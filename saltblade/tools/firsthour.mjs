// The first hour, in a browser: every start opens on the "Your people" card
// with the squad on screen in clear weather and its goals up; no hint card
// sits over an open window, menu or conversation at 1280x760 or 390x844; and
// scripted play completes the Wanderer chain, goal by goal, to the outro.
// Needs the dev server. The headless sim runs slowly, so waits are generous.
// Usage: URL=http://localhost:5180 node tools/firsthour.mjs [starts|windows|chain|all]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const base = (process.env.URL || 'http://localhost:5180').replace(/\/?(#.*)?$/, '');
const out = process.env.OUT || 'tools/out/firsthour';
const what = process.argv[2] || 'all';
mkdirSync(out, { recursive: true });
const STARTS = ['wanderer', 'freeholders', 'blades', 'karuk', 'constructs', 'scrappers', 'deserters', 'chainbound', 'nothing'];
const results = [];
const check = (label, ok, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
page.setDefaultTimeout(180000); // a loaded machine draws a frame a second or worse: every wait is patient
const errors = [];
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
page.on('console', (m) => { const t = m.text(); if (m.type() === 'error' && !t.includes('ERR_CERT') && !t.includes('Failed to load resource')) errors.push(`[console] ${t}`); });
await page.goto(`${base}/#debug,play`);
await page.waitForFunction(() => window.__sb && window.__sb.G.mode === 'play', null, { timeout: 180000 });

/** Begins a start in the running page (the world is kept; only what lives on it changes). */
async function start(key) {
  await page.evaluate(async (k) => {
    const s = await import('/src/game/session.ts');
    s.startNewGame({ scenario: k, faction: '', people: [] });
    __sb.G.speed = 1;
  }, key);
  await page.waitForTimeout(500);
}
/** The first hint card to appear, by title (hints tick on game time, which crawls headless). */
// (a loaded machine can leave the game's own clock crawling at a frame a second or worse, so this is patient and never fatal)
const firstCard = () => page.waitForFunction(() => document.querySelector('.hintbox .hinttitle')?.textContent || null, null, { timeout: 240000 }).then((h) => h.jsonValue()).catch(() => null);
const hintVisible = () => page.evaluate(() => { const b = document.querySelector('.hintbox'); return !!b && getComputedStyle(b).display !== 'none' && b.getBoundingClientRect().width > 0; });
const doneGoal = (key, timeout = 150000) => page.waitForFunction((k) => __sb.S.W.flags.objectives?.done?.[k] !== undefined, key, { timeout });
// (a busy headless page can take a long time to paint; a lost screenshot is noted, not fatal)
/** Lets the game step at least one frame of its own (a loaded machine can take seconds per frame), within a bound. */
const stepped = (secs = 0.05) => page.evaluate((s) => new Promise((res) => { const t0 = __sb.G.realTime, t1 = Date.now(); const go = () => (__sb.G.realTime - t0 >= s || Date.now() - t1 > 20000 ? res(__sb.G.realTime - t0) : setTimeout(go, 100)); go(); }), secs);
const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, timeout: 120000 }).catch((e) => console.log(`     screenshot ${name} skipped: ${e.message.split('\n')[0]}`));

// ---------------------------------------------------------------- every start
if (what === 'starts' || what === 'all') {
  for (const key of STARTS) {
    await start(key);
    const title = await firstCard();
    const info = await page.evaluate(async () => {
      const { G, S } = __sb;
      const cam = G.R.camera;
      const V = G.cam.target.constructor;
      const mine = G.W.playerChars().filter((c) => c.alive);
      const on = mine.map((c) => { const v = new V(c.x, c.y + 0.9, c.z); v.project(cam); return [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(3)]; });
      const lead = mine[0];
      const town = G.T.nearestSite(lead.x, lead.z, (s) => s.kind === 'town');
      let gate = null, bd = Infinity;
      for (const o of G.W.objs.values()) if (o.kind === 'gate' && o.site === town?.id) { const d = Math.hypot(o.x - lead.x, o.z - lead.z); if (d < bd) { bd = d; gate = o; } }
      let gateOn = null;
      if (gate) { const v = new V(gate.x, gate.y + 2, gate.z); v.project(cam); gateOn = [+v.x.toFixed(2), +v.y.toFixed(2)]; }
      const w = S.weather.at(lead.x, lead.z);
      const tracker = document.querySelector('.objs');
      const { ITEM } = await import('/src/content/items.ts');
      const drugs = mine.some((c) => [...c.inv.items, ...(c.eq.back?.inv?.items ?? [])].some((i) => !!ITEM[i.id]?.drug));
      return { on, gateOn, gateDist: +bd.toFixed(0), weather: w.kind, intensity: +w.i.toFixed(2), yaw: +G.cam.yaw.toFixed(2), pitch: +G.cam.pitch.toFixed(2), tracker: !!tracker && getComputedStyle(tracker).display !== 'none', goals: tracker ? tracker.querySelectorAll('.obj').length : 0, count: tracker?.querySelector('.objcount')?.textContent, set: S.W.flags.objectives?.set, drugs };
    });
    await shot(`fh_${key}`);
    const onScreen = info.on.every(([x, y, z]) => Math.abs(x) < 0.95 && Math.abs(y) < 0.95 && z < 1);
    check(`${key}: the first card is "Your people"`, title === 'Your people', title);
    check(`${key}: the squad is on screen at the start`, onScreen, `${info.on.length} people at ${JSON.stringify(info.on)}; yaw ${info.yaw}, pitch ${info.pitch}`);
    check(`${key}: day one opens in clear weather`, info.weather === 'clear', `${info.weather} ${info.intensity}`);
    check(`${key}: the goals are up`, info.tracker && info.goals >= 5 && info.set === key, `${info.goals} goals, ${info.count}`);
    check(`${key}: nobody starts with drugs in the pack`, !info.drugs);
    const gateVisible = !!info.gateOn && Math.abs(info.gateOn[0]) < 1 && Math.abs(info.gateOn[1]) < 1;
    console.log(`     nearest gate ${info.gateDist} m away, ${gateVisible ? 'on screen' : 'off screen'} at ${JSON.stringify(info.gateOn)}`);
    if (key === 'chainbound') {
      // the first goal's instruction: right-click yourself, and the menu offers to pick the shackles
      const at = await page.evaluate(() => { const { G } = __sb; const p = G.W.playerChars()[0]; __sb.select([p.id]); const v = new (G.cam.target.constructor)(p.x, p.y + 0.9, p.z); v.project(G.R.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; });
      await page.waitForTimeout(600);
      await page.mouse.click(at[0], at[1], { button: 'right' });
      await page.waitForTimeout(600);
      const items = await page.evaluate(() => [...document.querySelectorAll('.ctxmenu .ctxitem')].map((e) => e.textContent.trim()));
      check('chainbound: right-clicking yourself offers "Pick my shackles"', items.some((t) => /Pick my shackles/.test(t)), items.join(' | ') || 'no menu');
      await page.keyboard.press('Escape');
    }
  }
}

// ---------------------------------------------------------------- no card over an open window
if (what === 'windows' || what === 'all') {
  for (const [w, hgt] of [[1280, 760], [390, 844]]) {
    await page.setViewportSize({ width: w, height: hgt });
    await start('wanderer');
    await firstCard();
    // (offsets, not the client rect: the card is still sliding in for a quarter second)
    const dock = await page.evaluate(() => { const b = document.querySelector('.hintbox'); return [b.offsetLeft, b.offsetTop, b.offsetLeft + b.offsetWidth, b.offsetTop + b.offsetHeight]; });
    check(`${w}x${hgt}: the hint card is docked inside the viewport`, dock[0] >= 0 && dock[1] >= 0 && dock[2] <= w && dock[3] <= hgt, `card at ${dock.join(', ')}`);
    await shot(`fh_card_${w}`);
    // people to open the trade window, a conversation and an inspect window on
    const ids = await page.evaluate(() => {
      const p = __sb.G.W.playerChars()[0];
      const cr = __sb.G.T.sites.find((s) => s.settlement === 'crossroad');
      __sb.tp(cr.x, cr.z);
      const keeper = __sb.npcs('shopkeeper', 400)[0], bark = __sb.npcs('barkeep', 400)[0];
      return { p: p.id, keeper: keeper?.id, bark: bark?.id };
    });
    const windows = [
      ['char', () => page.evaluate(() => __sb.emit('ui:char'))],
      ['build', () => page.evaluate(() => __sb.emit('ui:build'))],
      ['research', () => page.evaluate(() => __sb.emit('ui:research'))],
      ['map', () => page.evaluate(() => __sb.emit('ui:map'))],
      ['factions', () => page.evaluate(() => __sb.emit('ui:factions'))],
      ['log', () => page.evaluate(() => __sb.emit('ui:log'))],
      ['codex', () => page.evaluate(() => __sb.emit('ui:codex'))],
      ['inspect', () => page.evaluate((id) => __sb.emit('ui:inspect', id), ids.keeper)],
      ['trade', () => page.evaluate((ids) => { __sb.near2(ids.keeper); __sb.trade(ids.keeper); }, ids)],
      ['dialogue', () => page.evaluate((ids) => { __sb.near2(ids.bark); __sb.talk(ids.bark); }, ids)],
      ['menu', () => page.evaluate(() => __sb.emit('ui:menu'))],
    ];
    for (const [name, open] of windows) {
      await open();
      await page.waitForTimeout(300);
      await stepped();
      const r = await page.evaluate(() => {
        const rect = (el) => { const b = el.getBoundingClientRect(); return [b.left, b.top, b.right, b.bottom]; };
        const hint = document.querySelector('.hintbox');
        const visible = !!hint && getComputedStyle(hint).display !== 'none' && hint.getBoundingClientRect().width > 0;
        const wins = [...document.querySelectorAll('.win, .dlg, #gmenu .gmcard')].map(rect);
        const hr = hint ? rect(hint) : null;
        const hits = visible && hr ? wins.filter((b) => hr[0] < b[2] && hr[2] > b[0] && hr[1] < b[3] && hr[3] > b[1]).length : 0;
        return { visible, wins: wins.length, hits, queued: !!hint };
      });
      if (['char', 'trade', 'research', 'map', 'dialogue'].includes(name)) await shot(`fh_win_${name}_${w}`);
      check(`${w}x${hgt}: no hint card over the ${name} window`, r.wins > 0 && r.hits === 0, `${r.wins} open, card ${r.visible ? 'visible' : 'hidden'}, ${r.hits} overlapping`);
      // close it again: windows by their close, the conversation and menu by Escape
      if (name === 'dialogue' || name === 'menu') await page.keyboard.press('Escape');
      else await page.evaluate(async () => { const d = await import('/src/ui/dom.ts'); while (d.closeTop()) { /* all */ } });
      await page.waitForTimeout(300);
      await stepped();
    }
    const back = await page.waitForFunction(() => { const b = document.querySelector('.hintbox'); return !!b && getComputedStyle(b).display !== 'none'; }, null, { timeout: 30000 }).then(() => true).catch(() => false);
    check(`${w}x${hgt}: the card comes back once everything is closed`, back);
    await shot(`fh_card_back_${w}`);
  }
  // the tracker keeps clear of the selection panel and the top bars on narrow screens, open or folded
  for (const [w, hgt] of [[760, 1000], [390, 844]]) {
    await page.setViewportSize({ width: w, height: hgt });
    await start('wanderer');
    await page.waitForTimeout(1500);
    for (const unfold of [false, true]) {
      const r = await page.evaluate((unfold) => {
        const p = __sb.G.W.playerChars()[0];
        __sb.select([p.id]);
        p.jobs = [{ k: 'mine', obj: 0, label: 'Mine' }]; // a jobs row makes the panel as tall as it gets
        const objs = document.querySelector('.objs');
        if (objs && objs.classList.contains('fold') === unfold) objs.querySelector('.objhead')?.click();
        return new Promise((res) => setTimeout(() => {
          const rect = (sel) => { const el = document.querySelector(sel); if (!el || getComputedStyle(el).display === 'none') return null; const b = el.getBoundingClientRect(); return b.width && b.height ? [b.left, b.top, b.right, b.bottom] : null; };
          const t = rect('.objs');
          const hits = ['.hud-sel', '.hud-topl', '.hud-topr', '.hud-squad'].filter((s) => { const b = rect(s); return t && b && t[0] < b[2] && t[2] > b[0] && t[1] < b[3] && t[3] > b[1]; });
          res({ t: t && t.map(Math.round), hits, fold: objs?.classList.contains('fold') });
        }, 700));
      }, unfold);
      check(`${w}x${hgt}: the ${r.fold ? 'folded' : 'open'} tracker clears the selection panel and the bars`, !!r.t && r.hits.length === 0, `tracker at ${JSON.stringify(r.t)}${r.hits.length ? ', over ' + r.hits.join(', ') : ''}`);
      await shot(`fh_layout_${w}_${r.fold ? 'pill' : 'open'}`);
    }
    await page.evaluate(() => { const p = __sb.G.W.playerChars()[0]; p.jobs = []; });
  }
  await page.setViewportSize({ width: 1280, height: 760 });
}

// ---------------------------------------------------------------- the Wanderer chain, played
if (what === 'chain' || what === 'all') {
  await start('wanderer');
  await firstCard();
  await page.evaluate(() => { document.querySelector('.hintbox')?.click(); __sb.speed(5); });
  const goals = () => page.evaluate(() => { const st = __sb.S.W.flags.objectives; return { done: Object.keys(st.done), finished: !!st.finished, rows: [...document.querySelectorAll('.objs .obj')].map((e) => (e.classList.contains('done') ? '+' : '-') + e.querySelector('.objtext').textContent) }; });
  // 1. walk up to Crossroad
  await page.evaluate(() => { const cr = __sb.G.T.sites.find((s) => s.settlement === 'crossroad'); __sb.tp(cr.x + cr.r + 4, cr.z); });
  await doneGoal('reach');
  check('chain: reaching Crossroad ticks the first goal', true);
  await shot('fh_chain_1');
  // 2. the barkeep
  await page.evaluate(() => { const b = __sb.npcs('barkeep', 500)[0]; __sb.near2(b.id); __sb.talk(b.id); });
  await doneGoal('barkeep');
  await page.keyboard.press('Escape');
  check('chain: talking to the barkeep ticks the second', true);
  // 3. sell something at a shop: drag a stack of yours onto the shelf, then buy something back with a right-click
  await page.evaluate(async () => { const ev = await import('/src/core/events.ts'); window.__trades = []; ev.on('sim:trade', (kind, sh, it, n, chits) => window.__trades.push(`${kind} ${it.id} x${n} ${chits}c`)); });
  const keeper = await page.evaluate(() => { const k = __sb.npcs('shopkeeper', 500)[0]; __sb.near2(k.id); __sb.trade(k.id); return k.id; });
  await page.waitForSelector('.tradewin .item', { timeout: 30000 });
  {
    const from = await page.locator('.tradewin .loot > :first-child .item').first().boundingBox();
    const shelf = await page.locator('.tradewin .loot > :last-child .grid').first().boundingBox();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(shelf.x + shelf.width - 40, shelf.y + shelf.height - 40, { steps: 12 });
    await page.mouse.up();
  }
  await doneGoal('deal');
  check('chain: a drag-sale ticks "Buy or sell something"', true);
  const money0 = await page.evaluate(() => __sb.S.W.money);
  // right-click buys a whole stack, so pick the cheapest stack on the shelf the purse can cover
  const cheap = await page.evaluate(async (kid) => {
    const { buyPrice, shopGrid } = await import('/src/sim/shops.ts');
    const W = __sb.S.W, sh = W.shops.get(+W.char(kid).shop), stock = shopGrid(sh);
    const it = stock.items.filter((i) => buyPrice(sh, i) * i.n <= W.money).sort((a, b) => buyPrice(sh, a) * a.n - buyPrice(sh, b) * b.n)[0];
    return it ? [it.x * 30, it.y * 30, it.id] : null;
  }, keeper);
  if (cheap) await page.locator(`.tradewin .loot > :last-child .item[style*="left: ${cheap[0]}px"][style*="top: ${cheap[1]}px"]`).first().click({ button: 'right' });
  await page.waitForTimeout(800);
  const trades = await page.evaluate(() => ({ list: window.__trades, money: __sb.S.W.money }));
  check('chain: the counter reports the sale and the right-click purchase', trades.list.some((t) => t.startsWith('sell')) && trades.list.some((t) => t.startsWith('buy')) && trades.money < money0, trades.list.join('; '));
  await page.evaluate(async () => { const d = await import('/src/ui/dom.ts'); d.closeTop(); });
  // 4. mine the nearest rock
  const ore = await page.evaluate(() => {
    const p = __sb.G.W.playerChars()[0];
    const rock = [...__sb.G.W.objs.values()].filter((o) => o.kind === 'ore').sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z))[0];
    __sb.tp(rock.x + 2.5, rock.z);
    __sb.cam(rock.x, rock.z, 18, 0.6, 0.7);
    p.jobs.unshift({ k: 'mine', obj: rock.id, label: 'Mine' });
    return rock.def === 'iron' ? 'iron_ore' : rock.def === 'copper' ? 'copper_ore' : 'stone';
  });
  await doneGoal('mine');
  check('chain: swinging a pick ticks "Mine some ore"', true);
  await page.waitForFunction((id) => __sb.G.W.playerChars()[0].inv.count(id) > 0, ore, { timeout: 150000 });
  await page.evaluate(() => { const p = __sb.G.W.playerChars()[0]; p.jobs.length = 0; p.act = null; });
  // 5. sell the ore: the stack at its place in the pack
  const spot = await page.evaluate(([id, kid]) => { const p = __sb.G.W.playerChars()[0]; const it = p.inv.items.find((i) => i.id === id); __sb.near2(kid); __sb.trade(kid); return [it.x * 30, it.y * 30]; }, [ore, keeper]);
  await page.waitForSelector('.tradewin .item', { timeout: 30000 });
  await page.locator(`.tradewin .loot > :first-child .item[style*="left: ${spot[0]}px"][style*="top: ${spot[1]}px"]`).first().click({ button: 'right' });
  await doneGoal('sell_ore');
  check('chain: selling the ore ticks "Sell the ore"', true);
  await page.evaluate(async () => { const d = await import('/src/ui/dom.ts'); d.closeTop(); });
  await shot('fh_chain_2');
  // 6. a cut arm, bandaged
  await page.evaluate(() => { const p = __sb.G.W.playerChars()[0]; p.body.hp[3] -= 25; p.body.bleed[3] = 0.12; if (!p.inv.count('bandages')) p.inv.add('bandages', 2); __sb.emit('order', p, { k: 'aid', id: p.id }); });
  await doneGoal('bandage');
  check('chain: first aid ticks "Bandage a wound"', true);
  // 7. a recruit from the bar, through the conversation
  const rec = await page.evaluate(() => {
    const W = __sb.G.W;
    const list = __sb.npcs('recruit', 600).filter((n) => n.rec).map((n) => W.chars.get(n.id)).filter((c) => c && !c.cage).sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
    const r = list[0];
    __sb.near2(r.id); __sb.talk(r.id);
    return { id: r.id, name: r.name, price: r.price };
  });
  await page.waitForSelector('.dlgopt', { timeout: 30000 });
  await page.getByText('Join me?', { exact: false }).first().click();
  await page.waitForTimeout(300);
  await page.getByText('elcome aboard', { exact: false }).first().click();
  await doneGoal('recruit');
  await page.keyboard.press('Escape');
  check('chain: a recruit ticks "Recruit someone"', true, `${rec.name}, ${rec.price}c`);
  // 8. a starveling who picked the wrong wanderer, out on the road where no town guard will take the credit
  await page.evaluate(async () => {
    const { makePerson } = await import('/src/sim/spawn.ts');
    const { Squad } = await import('/src/sim/squad.ts');
    const { RNG } = await import('/src/core/rng.ts');
    const W = __sb.G.W, cr = __sb.G.T.sites.find((s) => s.settlement === 'crossroad');
    const mine = W.playerChars();
    mine.forEach((c, i) => { const sp = __sb.G.nav.nearestOpen(cr.x + cr.r + 140 + i * 2, cr.z + 40, 20); c.x = sp[0]; c.z = sp[1]; c.y = __sb.G.T.heightAt(c.x, c.z); c.path = null; c.hasGoal = false; c.order = null; });
    const p = mine[0];
    const foe = makePerson(W, { faction: 'starvelings', role: 'bandit', level: 3, whole: true }, new RNG(7));
    const fs = new Squad(); fs.faction = 'starvelings'; fs.kind = 'raid'; fs.name = 'Starvelings'; W.addSquad(fs); W.moveToSquad(foe, fs);
    const spot = __sb.G.nav.nearestOpen(p.x + 2.5, p.z, 8) ?? [p.x + 2.5, p.z];
    foe.x = spot[0]; foe.z = spot[1]; foe.y = __sb.G.T.heightAt(foe.x, foe.z); foe.homeX = foe.x; foe.homeZ = foe.z;
    for (let l = 0; l < 3; l++) foe.body.hp[l] = 3; // one good blow settles it
    foe.brain.enemy = p.id;
    window.__foe = foe;
    __sb.cam(p.x, p.z, 14, 0.6, 0.7);
    __sb.emit('order', p, { k: 'attack', id: foe.id });
    __sb.speed(5);
  });
  const won = await doneGoal('win', 240000).then(() => true).catch(() => false);
  const fight = await page.evaluate(() => { const p = __sb.G.W.playerChars()[0], f = window.__foe; const kos = __sb.G.W.playerChars().reduce((n, c) => n + c.stats.kos, 0); return `${f.status}, ${Math.hypot(p.x - f.x, p.z - f.z).toFixed(1)} m apart, ${kos} KO${kos === 1 ? '' : 's'} for the band, order ${p.order?.k ?? 'none'}`; });
  check('chain: a knockout ticks "Win a fight"', won, fight);
  await page.waitForTimeout(1500);
  const end = await goals();
  await shot('fh_chain_end');
  check('chain: all eight goals done and the chain finished', end.done.length === 8 && end.finished, end.done.join(', '));
  const outro = await page.evaluate(() => document.querySelector('.objs .objoutro')?.textContent || '');
  check('chain: the tracker ends on "you are on your own now"', /on your own now/.test(outro), outro.slice(0, 60));
  // back to the title: no card and no tracker from the old game
  await page.evaluate(async () => { const t = await import('/src/ui/title.ts'); t.showTitle(); });
  await page.waitForTimeout(2500);
  const title = await page.evaluate(() => ({ mode: __sb.G.mode, card: !!document.querySelector('.hintbox'), tracker: (() => { const o = document.querySelector('.objs'); return !!o && getComputedStyle(o).display !== 'none' && o.getBoundingClientRect().width > 0; })() }));
  check('title: no hint card or tracker lingers over the title screen', title.mode === 'title' && !title.card && !title.tracker, JSON.stringify(title));
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (errors.length) console.log('page errors:\n' + errors.slice(0, 10).join('\n'));
await browser.close();
process.exitCode = failed.length || errors.length ? 1 : 0;
