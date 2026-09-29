// Scripted play-through checks. Usage: node tools/play.mjs <scenario>
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 5200 + Math.floor(Math.random() * 300);
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const mobile = process.argv[3] === 'mobile';
const page = await browser.newPage(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push('console: ' + m.text()); });
// Other areas are written in parallel; stub any listed in STUB (comma list) so
// a half-finished module elsewhere doesn't stop this test from loading.
for (const m of (process.env.STUB ?? '').split(',').filter(Boolean)) {
  await page.route(new RegExp(`/src/content/${m}\\.ts`), (r) => r.fulfill({ contentType: 'application/javascript', body: 'export {};' }));
}
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(500);

export const ctx = { page, out, errors };
const shot = (n) => page.screenshot({ path: out + n + '.png' });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);

async function newGame() {
  await page.click('text=New Game');
  await wait(200);
  await page.click('text=Take this resident');
  await wait(300);
  await page.keyboard.press('Escape');
  await wait(800);
}

async function fightAll(maxRounds = 40) {
  // Player attacks nearest hostile each turn until combat ends.
  for (let i = 0; i < maxRounds * 10; i++) {
    const st = await ev(() => ({ c: !!G.combat, pt: G.combat?.playerTurn, busy: G.combat?.busy, dead: G.state.player.dead }));
    if (!st.c || st.dead) return st;
    if (st.pt && !st.busy) {
      await ev(async () => {
        const c = await DF.combat();
        const p = G.state.player;
        const foes = G.map.actors.filter((a) => !a.dead && a.hostile);
        foes.sort((a, b) => (Math.abs(a.q - p.q) + Math.abs(a.r - p.r)) - (Math.abs(b.q - p.q) + Math.abs(b.r - p.r)));
        const t = foes[0];
        if (!t) return c.endPlayerTurn();
        const m = c.currentMode(p);
        if (m.weapon.ammo && m.stack && !m.stack.ammo) { if (!c.reload(p)) {} }
        G.combat.busy = true;
        const d = Math.max(Math.abs(t.q - p.q), Math.abs(t.r - p.r), Math.abs(t.q + t.r - p.q - p.r));
        if (d > m.weapon.range || !G.map.los(p, t)) {
          const mv = await import('/src/game/movement.ts');
          const path = mv.pathTo(p, t, true);
          if (path) await mv.walk(p, path, Math.max(1, (p._ap ?? 0) - m.ap));
        }
        let ok = true;
        while (G.combat && (p._ap ?? 0) >= c.currentMode(p).ap && !t.dead && ok) ok = await c.attack(p, t, c.currentMode(p));
        if (G.combat) G.combat.busy = false;
        if (G.combat && G.combat.playerTurn) c.endPlayerTurn();
      });
    }
    await wait(150);
  }
  return ev(() => ({ c: !!G.combat }));
}


const scen = process.argv[2] ?? 'all';
const warns = [];
page.on('console', (m) => { if (m.type() === 'warning' || /marker missing/.test(m.text())) warns.push(m.text()); });

async function talk(id) {
  await ev(async (id) => { const d = await DF.dialogue(); d.closeDialogue(); const a = G.map.actors.find((x) => x.npc === id); d.openDialogue(a?.dialog ?? id, a); }, id);
  await wait(300);
}
async function closeD() { await ev(async () => { const d = await DF.dialogue(); d.closeDialogue(); }); await wait(100); }
async function center(q, r) {
  await ev(async ([q, r]) => { const fx = (await import('/src/render/fx.ts')).fx; const p = G.state.player; const f = G.map.freeNear({ q, r }) ?? { q, r }; p.q = f.q; p.r = f.r; p._path = undefined; fx.centerOn(p, true); }, [q, r]);
  await wait(300);
}
async function walk(q, r, ms = 4000) {
  await ev(async ([q, r]) => { const i = await DF.interact(); i.walkTo(q, r); }, [q, r]);
  await wait(ms);
  return ev(() => [G.state.player.q, G.state.player.r, G.map.def.id, !!G.combat]);
}

try {
  await newGame();
  // ---- static checks: dialogue node references
  const bad = await ev(async () => {
    const reg = await import('/src/content/registry.ts');
    const out = [];
    const mine = ['hattie', 'dag', 'pim', 'cc_', 'kestrel', 'wren', 'vr_'];
    for (const [id, d] of Object.entries(reg.DIALOGUES)) {
      if (!mine.some((p) => id === p || id.startsWith(p))) continue;
      const st = typeof d.start === 'string' ? [d.start] : [];
      for (const s of st) if (!d.nodes[s]) out.push(id + ': bad start ' + s);
      for (const [nid, n] of Object.entries(d.nodes)) {
        for (const o of n.options) {
          if (o.to && !d.nodes[o.to]) out.push(`${id}.${nid}: to ${o.to}`);
          if (o.fail && !d.nodes[o.fail]) out.push(`${id}.${nid}: fail ${o.fail}`);
          if (!o.to && !o.end && !o.barter && !o.combat) out.push(`${id}.${nid}: dead option ${typeof o.text === 'string' ? o.text : '(fn)'}`);
        }
      }
      // Low-INT walk: from every node nothing links to (possible start nodes)
      // plus the string start, follow only options a low-INT player sees.
      const incoming = new Set();
      for (const n of Object.values(d.nodes)) for (const o of n.options) { if (o.to) incoming.add(o.to); if (o.fail) incoming.add(o.fail); }
      const seeds = Object.keys(d.nodes).filter((k) => !incoming.has(k) || k === d.start);
      const seen = new Set(seeds);
      const q = [...seeds];
      while (q.length) {
        const k = q.pop();
        const n = d.nodes[k];
        const vis = n.options.filter((o) => o.end || o.lowInt || o.any);
        if (!vis.length || vis.every((o) => o.if)) out.push(`${id}.${k}: low-INT may have no option`);
        for (const o of vis) for (const t of [o.to, o.fail]) if (t && d.nodes[t] && !seen.has(t)) { seen.add(t); q.push(t); }
      }
    }
    // npc dialog ids exist
    for (const mid of ['cinder_creek', 'beetle_den', 'vultures_roost']) {
      const m = reg.MAPS[mid];
      for (const n of m.npcs ?? []) if (n.dialog && !reg.DIALOGUES[n.dialog]) out.push(mid + ': missing dialog ' + n.dialog);
      for (const o of m.objects ?? []) if (o.onUse && !reg.OBJ_SCRIPTS[o.onUse]) out.push(mid + ': missing script ' + o.onUse);
      const w = Math.max(...m.rows.map((r) => r.length));
      if (m.rows.some((r) => r.length !== w)) out.push(mid + ': ragged rows (ok if intended)');
    }
    return out;
  });
  console.log('dialogue check:', bad.length ? '\n  ' + bad.join('\n  ') : 'ok');

  if (scen === 'all' || scen === 'cc') {
    await ev(() => DF.enterMap('cinder_creek'));
    await wait(800);
    await shot('cc-01-arrive');
    console.log('arrive', await walk(24, 16, 5000));
    await shot('cc-02-plaza');
    await center(26, 9); await shot('cc-03-hattie-house');
    await center(46, 12); await shot('cc-04-fields');
    await center(48, 27); await shot('cc-05-pen');
    await center(26, 30); await shot('cc-06-south');
    await center(8, 4); await shot('cc-07-denmouth');
    await talk('hattie'); await shot('cc-08-hattie');
    await page.keyboard.press('3'); await wait(300); await shot('cc-09-hattie-worry');
    await page.keyboard.press('1'); await wait(300); await shot('cc-10-hattie-go');
    await talk('dag'); await page.keyboard.press('1'); await wait(300); await shot('cc-11-dag');
    await page.keyboard.press('1'); await wait(300);
    await talk('cc_marta'); await shot('cc-12-marta');
    await closeD();
    console.log('quests', await ev(() => JSON.stringify(Object.keys(G.state.quests)) + ' disc ' + JSON.stringify(G.state.discovered)));
    // den
    await ev(() => DF.enterMap('beetle_den'));
    await wait(800);
    await shot('cc-13-den');
    await center(28, 20); await shot('cc-14-den-hall');
    await center(40, 10); await shot('cc-15-den-brood');
    console.log('den', await ev(() => G.map.actors.filter((a) => a.proto.startsWith('beetle')).map((a) => [a.proto, a.q, a.r].join(':')).join(' ')));
    await ev(() => { G.state.flags.x = 1; const q = G.map.actors.find((a) => a.npc === 'cc_matriarch'); import('/src/game/combat.ts').then((c) => c.kill(q, G.state.player)); });
    await wait(300);
    console.log('matriarch dead flag', await ev(() => G.state.flags.cc_matriarchDead));
    // exit den back to the village
    await ev(async () => { const cb = await DF.combat(); for (const a of G.map.actors) if (a.hostile && !a.dead) cb.kill(a, null); if (G.combat) cb.endCombat(); const p = G.state.player; p.q = 4; p.r = 32; });
    await wait(500);
    const ex = await walk(3, 33, 2500);
    console.log('den exit ->', ex);
    await wait(500);
    await shot('cc-16-back');
  }
  if (scen === 'all' || scen === 'vr') {
    await ev(() => DF.enterMap('vultures_roost'));
    await wait(800);
    await shot('cc-20-roost');
    console.log('roost walk', await walk(18, 20, 6000));
    await shot('cc-21-roost-gate');
    await center(34, 19); await shot('cc-22-roost-camp');
    await center(46, 14); await shot('cc-23-roost-cage');
    await center(20, 4); await shot('cc-24-goattrack');
    await talk('kestrel'); await shot('cc-25-kestrel');
    await page.keyboard.press('1'); await wait(300);
    await page.keyboard.press('2'); await wait(300); await shot('cc-26-duel-offer');
    await page.keyboard.press('1'); await wait(300); await page.keyboard.press('1'); await wait(300); await shot('cc-27-duel-round');
    for (let i = 0; i < 6; i++) { await page.keyboard.press('1'); await wait(250); }
    await shot('cc-28-duel-end');
    await closeD();
    console.log('duel', await ev(() => [G.state.flags.vr_dW, G.state.flags.vr_dL, G.state.flags.vr_duelWon, G.state.flags.vr_duelLost]));
    // force release, free Wren
    await ev(() => { G.state.flags.vr_wrenReleased = true; const g = G.map.objects.find((o) => o.id === 'vr_cage'); g.locked = 0; g.open = true; });
    await talk('wren'); await shot('cc-29-wren-free');
    await page.keyboard.press('1'); await wait(300); await closeD();
    await wait(500);
    console.log('wren', await ev(() => [G.state.flags.vr_wrenFreed, G.state.flags.vr_wrenMethod, G.state.flags['party:wren']]));
    await talk('wren'); await shot('cc-30-wren-party'); await closeD();
    await ev(async () => { const t = await DF.travel(); t.exitToWorld(); });
    await wait(600);
    await ev(() => DF.enterMap('cinder_creek'));
    await wait(800);
    await talk('hattie'); await shot('cc-31-hattie-reward'); await closeD();
    console.log('after', await ev(() => [G.state.quests.vr_wren?.state, G.state.karma, G.map.actors.filter((a) => a.npc === 'wren').length]));
  }
  if (scen === 'sneak') {
    await ev(() => DF.enterMap('vultures_roost'));
    await wait(600);
    const path = await ev(async () => { const mv = await import('/src/game/movement.ts'); const p = G.state.player; p.q = 9; p.r = 10; const a = mv.pathTo(p, { q: 37, r: 10 }); return a ? a.length : null; });
    console.log('goat track path length', path);
    // night, sneaking, next to the pen gate
    await ev(() => { G.state.time = Math.floor(G.state.time / 1440) * 1440 + 23 * 60; G.state.flags._sneak = true; const p = G.state.player; p.skillPts = { ...(p.skillPts ?? {}), lockpick: 90, sneak: 60 }; p.q = 39; p.r = 11; });
    for (let i = 0; i < 12; i++) {
      const r = await ev(async () => { const i = await DF.interact(); const g = G.map.objects.find((o) => o.id === 'vr_cage'); i.useSkill('lockpick', g); await new Promise((res) => setTimeout(res, 400)); return [g.locked, !!G.combat, G.state.flags.vr_caught]; });
      console.log('lockpick', i, r); if (!r[0] || r[1]) break;
    }
    await talk('wren'); await shot('cc-40-sneak-free');
    await page.keyboard.press('2'); await wait(300); await closeD();
    console.log('sneak result', await ev(() => [G.state.flags.vr_wrenFreed, G.state.flags.vr_wrenMethod, G.state.flags.vr_wrenHome, G.map.actors.some((a) => a.npc === 'wren')]));
    await ev(() => DF.enterMap('cinder_creek'));
    await wait(600);
    console.log('wren at home', await ev(() => G.map.actors.filter((a) => a.npc === 'wren').map((a) => [a.q, a.r, a.companion])));
    await talk('wren'); await shot('cc-41-wren-home');
    await closeD();
  }
  if (scen === 'caught') {
    await ev(() => DF.enterMap('vultures_roost'));
    await wait(600);
    const r = await ev(async () => { const p = G.state.player; p.skillPts = { ...(p.skillPts ?? {}), lockpick: 90 }; p.q = 39; p.r = 11; const i = await DF.interact(); const g = G.map.objects.find((o) => o.id === 'vr_cage'); i.useSkill('lockpick', g); await new Promise((res) => setTimeout(res, 800)); return [g.locked, !!G.combat, G.state.flags.vr_caught, G.map.actors.filter((a) => a.team === 'roost' && a.hostile).length]; });
    console.log('caught', r);
    await shot('cc-42-caught');
  }
} catch (e) {
  console.log('ERROR', e);
}
console.log('warnings:', warns.length ? warns.join('\n') : 'none');
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
await server.close();
process.exit(0);
