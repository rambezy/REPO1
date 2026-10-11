// A scripted brawl in the browser, three of yours against four Reavers, that
// checks what makes a fight readable: hostile and target rings, target lines,
// labels that never overlap, hit reactions by limb, weapon trails, the impact
// hold and camera kick, the auto-pause rules, and the hurt pulse on low
// quality. Writes screenshots to OUT.
// Usage: URL=http://localhost:5186/#debug,play OUT=tools/out/wp6-fightfeel node tools/brawl.mjs
import { chromium } from 'playwright';
const url = process.env.URL || 'http://localhost:5180/#debug,play';
const out = process.env.OUT || 'tools/out';
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
const errs = [];
page.on('pageerror', (e) => errs.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 4).join('\n')));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errs.push(m.text()); });
await page.goto(url);
await page.waitForFunction(() => window.__sb && window.__sb.G.mode === 'play', null, { timeout: 120000 });
await page.waitForTimeout(1000);
const results = [];
const check = (label, ok, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const sleep = (ms) => page.waitForTimeout(ms);

// the brawl: one Reaver is made sure of a heavy blade, so a trail is on the cards
await page.evaluate(async () => {
  window.__ap = [];
  __sb.on('autopause', (why) => window.__ap.push(why));
  const r = await __sb.brawl(3, 4, 26);
  window.__brawl = r;
  const inv = await import('/src/sim/inventory.ts');
  const c = __sb.G.W.chars.get(r.theirs[0]);
  c.eq.weapon = inv.makeItem('slab', 1, 1);
  c.dirty = true;
  __sb.speed(3);
});

// watch the fight for a while (at normal speed for a stretch in the middle: the impact hold only runs at 1x)
const seen = { rings: 0, target: 0, lines: 0, trails: 0, impacts: 0, shake: 0, overlaps: 0, samples: 0, limbs: new Set(), shown: 0, labels: 0, ms: 0, hits: 0, held: 0 };
let shotMid = false;
for (let i = 0; i < 70; i++) {
  if (i === 12) await page.evaluate(() => __sb.speed(1));
  if (i === 32) await page.evaluate(() => __sb.speed(3));
  await sleep(500);
  const s = await page.evaluate(() => {
    const G = __sb.G;
    const placed = G.overlay.placed();
    let overlaps = 0;
    for (let a = 0; a < placed.length; a++) for (let b = a + 1; b < placed.length; b++) {
      const p = placed[a], q = placed[b];
      if (p.owner === q.owner && (p.kind !== 'floater' || q.kind !== 'floater')) continue;
      if (p.x0 < q.x1 && p.x1 > q.x0 && p.y0 < q.y1 && p.y1 > q.y0) overlaps++;
    }
    const limbs = [];
    for (const v of G.charViews.views.values()) if (v.hitLimb >= 0) limbs.push(v.hitLimb);
    const st = __sb.feel();
    const fighting = G.W.playerChars().filter((c) => c.target || c.atk).length;
    return { ov: G.overlay.stats, rings: G.charViews.ringStats, trails: G.charViews.trails.count, impacts: st.count, held: st.held, shake: G.cam.shake, overlaps, limbs, ms: G.overlay.ms, fighting, up: G.W.playerChars().filter((c) => c.up).length, foes: window.__brawl.theirs.filter((id) => G.W.chars.get(id)?.up).length, time: G.clock.str() };
  });
  seen.samples++;
  seen.rings = Math.max(seen.rings, s.rings.enemy + s.rings.target);
  seen.target = Math.max(seen.target, s.rings.target);
  seen.lines = Math.max(seen.lines, s.ov.lines);
  seen.trails = Math.max(seen.trails, s.trails);
  seen.impacts = Math.max(seen.impacts, s.impacts);
  seen.held = Math.max(seen.held, s.held);
  seen.overlaps += s.overlaps;
  seen.labels = Math.max(seen.labels, s.ov.labels);
  seen.shown = Math.max(seen.shown, s.ov.shown);
  seen.ms = Math.max(seen.ms, s.ms);
  for (const l of s.limbs) seen.limbs.add(l);
  if (!shotMid && s.fighting >= 2 && s.ov.labels >= 6) { await page.screenshot({ path: `${out}/after_mid.png`, timeout: 120000 }); shotMid = true; console.log('shot after_mid at', s.time, JSON.stringify(s.ov), JSON.stringify(s.rings)); }
  if (i === 24) { await page.evaluate(() => { const p = __sb.G.W.playerChars()[0]; __sb.cam(p.x, p.z - 3, 13, 0, 0.6); }); await sleep(600); await page.screenshot({ path: `${out}/after_close.png`, timeout: 120000 }); console.log('shot after_close'); }
  if (s.up === 0 || s.foes === 0) { console.log('fight over at', s.time); break; }
}
if (!shotMid) await page.screenshot({ path: `${out}/after_mid.png`, timeout: 120000 });
check('hostiles get a red ground ring, and the selected person\'s target a brighter one', seen.rings >= 2 && seen.target >= 1, `${seen.rings} rings, ${seen.target} target`);
check('lines run from fighters to their targets', seen.lines >= 2, `${seen.lines} at most`);
check('labels never overlap', seen.overlaps === 0, `${seen.overlaps} overlaps in ${seen.samples} samples; up to ${seen.labels} labels, ${seen.shown} shown`);
check('blows are taken on the part struck', seen.limbs.size >= 2, `limbs ${[...seen.limbs].sort().join(' ')}`);
check('heavy swings leave a trail', seen.trails >= 1, `${seen.trails} at once`);
// the hold's plumbing: fired at normal speed, the frame loop uses it up
// (the kick is read straight off the call: the camera zeroes a small shake within the frame, so sampling misses it)
const kick = await page.evaluate(() => { __sb.speed(1); const st = __sb.feel(1, true); return { rt: __sb.G.realTime, shake: st.shake }; });
for (let i = 0; i < 60; i++) { await sleep(500); if (await page.evaluate((rt0) => __sb.G.realTime - rt0 > 0.25, kick.rt)) break; } // a few frames, however slow the renderer
const held = await page.evaluate(() => { const st = __sb.feel(); __sb.speed(3); return { held: +(st.held * 1000).toFixed(0), left: st.hold }; });
check('big hits nudge the camera, and at normal speed hold the world a beat', seen.impacts >= 1 && kick.shake > 0 && held.held > 0 && held.left === 0, `${seen.impacts} jolts, kick ${kick.shake.toFixed(2)}, ${held.held} ms held`);
console.log(`overlay draw: ${seen.ms.toFixed(2)} ms at worst (software-rendered canvas)`);

// auto-pause: an idle person of yours is attacked (the first blow after a lull), then one of yours goes down
await page.evaluate(() => {
  const G = __sb.G;
  G.settings.pauseOnAttacked = true; G.settings.pauseOnKO = true;
  for (const c of G.W.playerChars()) { c.combatMode = 'passive'; c.order = null; c.target = 0; c.atk = null; c.drawn = false; c.brain.enemy = 0; c.lastHitT = -1e9; for (let l = 0; l < 7; l++) c.body.hp[l] = c.body.max[l]; c.body.blood = c.body.bloodMax; }
  window.__ap.length = 0;
  __sb.speed(3);
  const me = G.W.playerChars().find((c) => c.up), foe = G.W.chars.get(window.__brawl.theirs[0]);
  window.__victim = me.id;
  __sb.hurt(me.id, 1, 6, foe.id); // a first blow out of the blue
});
await sleep(500);
let paused = await page.evaluate(() => ({ why: window.__ap.slice(), speed: __sb.G.speed, t: __sb.G.clock.str() }));
check('attacking an idle person of yours pauses the game', paused.speed === 0 && paused.why.some((w) => w.includes('under attack')), `${paused.why.join('; ')} at ${paused.t}`);
await page.screenshot({ path: `${out}/autopause_attacked.png`, timeout: 120000 });
const more = await page.evaluate(() => {
  const G = __sb.G;
  window.__ap.length = 0;
  __sb.speed(3);
  const foe = G.W.chars.get(window.__brawl.theirs[0]);
  for (let i = 0; i < 5; i++) { G.W.chars.get(window.__victim).lastHitT = G.clock.t; __sb.hurt(window.__victim, 1, 4, foe.id); }
  return { why: window.__ap.slice(), speed: G.speed };
});
check('the blows that follow do not pause it again', more.speed !== 0 && more.why.length === 0, JSON.stringify(more));
// now the knock-out rule: a blow to the head that drops them
await page.evaluate(() => {
  const G = __sb.G;
  G.settings.pauseOnAttacked = false;
  window.__ap.length = 0;
  __sb.speed(3);
  const foe = G.W.chars.get(window.__brawl.theirs[0]);
  __sb.hurt(window.__victim, 0, 400, foe.id);
});
await sleep(500);
paused = await page.evaluate(() => ({ why: window.__ap.slice(), speed: __sb.G.speed, status: __sb.G.W.chars.get(window.__victim).status, t: __sb.G.clock.str() }));
check('one of yours going down pauses the game', paused.speed === 0 && paused.status === 'ko' && paused.why.some((w) => w.includes('is down')), `${paused.why.join('; ')} at ${paused.t}`);
await page.screenshot({ path: `${out}/autopause_down.png`, timeout: 120000 });

// the hurt pulse: watching someone badly hurt drives the renderer's hurt level, which the grade pass draws
// (frames do not run while an evaluate is pending here, so the wait is between calls)
await page.evaluate(() => {
  const G = __sb.G;
  const c = G.W.playerChars().find((p) => p.alive) ?? G.W.playerChars()[0];
  for (let l = 0; l < 7; l++) c.body.hp[l] = c.body.max[l] * 0.15;
  __sb.select([c.id]);
});
await sleep(6000); // the level ramps up over a second of frames, and frames are slow here
const low = await page.evaluate(() => ({ hurt: +__sb.G.R.hurt.toFixed(2), vignette: !!document.getElementById('hurtvignette') }));
check('watching someone badly hurt raises the hurt pulse', low.hurt > 0.1 && !low.vignette, JSON.stringify(low));
const rm = await page.evaluate(() => {
  __sb.G.settings.reducedMotion = true;
  __sb.G.cam.shake = 0;
  __sb.speed(1);
  const before = __sb.feel().count;
  const st = __sb.feel(1);
  return { held: st.hold, shake: st.shake, counted: st.count - before, reduced: st.reduced };
});
check('reduced motion turns the hold and the camera kick off', rm.held === 0 && rm.shake === 0 && rm.counted === 0, JSON.stringify(rm));

if (errs.length) console.log('ERRORS:\n' + errs.slice(0, 6).join('\n---\n'));
const passed = results.filter((r) => r[1]).length;
console.log(`${passed}/${results.length} checks passed`);
await browser.close();
process.exit(passed === results.length && !errs.length ? 0 : 1);
