// Rustwater / Crossroads Bazaar checks. Usage: node tools/test-rustwater.mjs [rw|bz|check|quests|all]
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
const warns = [];
page.on('console', (m) => { if (m.type() === 'warning' || /missing/.test(m.text())) warns.push(m.text()); });
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push('console: ' + m.text()); });
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

async function look(q, r, name) {
  await ev(async ([q, r]) => {
    const { fx } = await import('/src/render/fx.ts');
    const p = G.state.player;
    const f = G.map.freeNear({ q, r });
    if (f) { p.q = f.q; p.r = f.r; }
    fx.centerOn(p, true);
  }, [q, r]);
  await wait(350);
  await shot(name);
}

async function talk(id, name, keys = []) {
  await ev(async (id) => {
    const d = await DF.dialogue();
    d.closeDialogue();
    const a = G.map.actors.find((x) => x.npc === id);
    if (!a) { console.warn('no actor ' + id); return; }
    const s = await DF.script(); s.setSpeaker(a);
    d.openDialogue(a.dialog, a);
  }, id);
  await wait(300);
  for (const k of keys) { await page.keyboard.press(k); await wait(250); }
  if (name) await shot(name);
  await ev(async () => { const d = await DF.dialogue(); d.closeDialogue(); });
  await wait(100);
}

async function reach(mapId) {
  return ev(async () => {
    const mv = await import('/src/game/movement.ts');
    const p = G.state.player;
    const bad = [];
    for (const a of G.map.actors) {
      if (a === p || a.dead) continue;
      const path = mv.pathTo(p, a, true);
      if (!path && Math.abs(a.q - p.q) + Math.abs(a.r - p.r) > 1) bad.push('actor ' + (a.npc ?? a.name) + ' @' + a.q + ',' + a.r + (G.map.passable(a.q, a.r) ? '' : ' (non-walkable cell)'));
    }
    for (const o of G.map.objects) {
      if (!o.container && !o.onUse) continue;
      const path = mv.pathTo(p, o, true);
      if (!path) bad.push('object ' + o.kind + ' ' + (o.name ?? o.id) + ' @' + o.q + ',' + o.r);
    }
    return bad;
  });
}

function checkDialogues() {
  return ev(async () => {
    const reg = await import('/src/content/registry.ts');
    const probs = [];
    for (const d of Object.values(reg.DIALOGUES)) {
      if (!/^(rw_|bz_)/.test(d.id)) continue;
      const nodes = Object.keys(d.nodes);
      if (typeof d.start === 'string' && !d.nodes[d.start]) probs.push(d.id + ': bad start ' + d.start);
      for (const [nid, n] of Object.entries(d.nodes)) {
        if (!n.options.some((o) => o.end || o.barter || o.combat || o.any || o.lowInt === undefined)) probs.push(d.id + '.' + nid + ': no exit?');
        for (const o of n.options) {
          if (o.to && !d.nodes[o.to]) probs.push(d.id + '.' + nid + ' -> missing ' + o.to);
          if (o.fail && !d.nodes[o.fail]) probs.push(d.id + '.' + nid + ' fail-> missing ' + o.fail);
          if (!o.to && !o.end && !o.barter && !o.combat && !o.do) probs.push(d.id + '.' + nid + ': dead option ' + (typeof o.text === 'string' ? o.text : 'fn'));
        }
      }
      void nodes;
    }
    // every dialog referenced by an NPC exists
    for (const id of ['rustwater', 'bazaar']) {
      for (const n of reg.MAPS[id].npcs) if (n.dialog && !reg.DIALOGUES[n.dialog]) probs.push(id + ': npc ' + n.id + ' missing dialog ' + n.dialog);
    }
    return probs;
  });
}

try {
  await newGame();
  if (scen === 'check' || scen === 'all') {
    console.log('dialogue problems:', JSON.stringify(await checkDialogues(), null, 1));
  }
  if (scen === 'rw' || scen === 'all') {
    await ev(() => DF.enterMap('rustwater'));
    await wait(800);
    await shot('rw-01-gate');
    console.log('rw unreachable:', JSON.stringify(await reach()));
    await look(17, 10, 'rw-02-sheriff');
    await look(30, 10, 'rw-03-tincup');
    await look(45, 10, 'rw-04-clinic');
    await look(32, 34, 'rw-05-casino');
    await look(17, 36, 'rw-06-tally');
    await look(47, 35, 'rw-07-scrapyard');
    await look(28, 22, 'rw-08-street');
    await talk('grell', 'rw-10-grell');
    await talk('mott', 'rw-11-mott', ['3']);
    await talk('fitch', 'rw-12-fitch');
    await talk('rw_bramble', 'rw-13-bramble');
    await ev(async () => { const p = G.state.player; p.inv.push({ id: 'scrip', n: 500 }); });
    await talk('rw_nico', 'rw-14-dice', ['2']);
    await talk('sato', 'rw-15-sato', ['1']);
    await talk('harl', 'rw-16-harl');
    await talk('corliss', 'rw-17-corliss', ['1']);
    await ev(async () => { const b = await import('/src/ui/barter.ts'); b.openBarter(G.map.actors.find((a) => a.npc === 'wick')); });
    await wait(400);
    await shot('rw-18-barter');
    await page.keyboard.press('Escape');
    await wait(200);
    // Bramble recruit
    await ev(() => { G.state.player.inv.push({ id: 'jerky', n: 2 }); });
    await talk('rw_bramble', null, ['1']);
    await wait(300);
    console.log('bramble companion:', await ev(() => !!G.map.actors.find((a) => a.npc === 'rw_bramble')?.companion));
  }
  if (scen === 'quests' || scen === 'all') {
    // Grell side: warn, proof, confront Mott -> fight.
    await ev(() => DF.enterMap('rustwater'));
    await wait(400);
    const r = await ev(async () => {
      const s = await DF.script(); const c = s.ctx();
      const reg = await import('/src/content/registry.ts');
      const node = (d, n) => reg.DIALOGUES[d].nodes[n];
      node('rw_fitch', 'plot').onEnter(c);
      node('rw_grell', 'warned').onEnter(c);
      c.give('rw_ledger');
      c.take('rw_ledger');
      node('rw_grell', 'proof').onEnter(c);
      const start = reg.DIALOGUES.rw_mott.start(c);
      return { q: c.questState('rw_trouble'), start };
    });
    console.log('grell path:', JSON.stringify(r));
    await talk('mott', 'rw-20-confront');
    // Juno & Bazaar pieces
  }

  if (scen === 'ambush') {
    await ev(() => DF.enterMap('rustwater'));
    await wait(400);
    await ev(async () => {
      const a = await import('/src/game/actors.ts');
      const p = G.state.player;
      p.inv.push({ id: 'smg9', n: 1 }, { id: 'ammo9', n: 200 }, { id: 'jerky', n: 1 }, { id: 'superHypo', n: 5 });
      a.equipById(p, 'smg9'); const c = await DF.combat(); c.reload(p);
      p.hp = 999; p.maxHpBonus = 300; p.skillPts = { ...(p.skillPts ?? {}), smallGuns: 80 };
      const s = await DF.script(); const cx = s.ctx();
      const reg = await import('/src/content/registry.ts');
      reg.DIALOGUES.rw_bramble.nodes.fed.onEnter(cx);
      reg.DIALOGUES.rw_mott.nodes.offer.onEnter(cx);
      reg.DIALOGUES.rw_mott.nodes.accept && (await import('/src/content/rustwater.ts'));
      cx.set('rw_mottJob'); cx.set('rw_warned');
      reg.DIALOGUES.rw_grell.nodes.doubleplay.onEnter(cx);
      const harl = G.map.actors.find((x) => x.npc === 'harl');
      p.q = harl.q + 1; p.r = harl.r - 1;
      const f = G.map.freeNear(p); p.q = f.q; p.r = f.r;
    });
    await wait(500);
    await talk('harl', 'rw-30-harljob');
    await ev(async () => {
      const d = await DF.dialogue();
      const a = G.map.actors.find((x) => x.npc === 'harl');
      const s = await DF.script(); s.setSpeaker(a);
      d.openDialogue('rw_harl', a);
    });
    await wait(300);
    await page.keyboard.press('1');
    await wait(300);
    await shot('rw-31-ambushtext');
    await page.keyboard.press('1');
    await wait(1200);
    console.log('combat?', await ev(() => ({ c: !!G.combat, allies: G.map.actors.filter((a) => a.companion).map((a) => a.npc), hostile: G.map.actors.filter((a) => a.hostile && !a.dead).map((a) => a.npc) })));
    await shot('rw-32-fight');
    const r = await fightAll(60);
    console.log('fight', JSON.stringify(r));
    await wait(8000);
    console.log('after', await ev(() => ({ c: !!G.combat, allies: G.map.actors.filter((a) => a.companion).map((a) => a.npc), dead: G.map.actors.filter((a) => a.dead).map((a) => a.npc), flags: Object.keys(G.state.flags).filter((k) => k.startsWith('rw_') || k.startsWith('dead:')), q: G.state.quests.rw_trouble })));
    await shot('rw-33-after');
  }

  if (scen === 'paths') {
    await ev(() => DF.enterMap('rustwater'));
    await wait(400);
    const out = await ev(async () => {
      const s = await DF.script(); const c = s.ctx();
      const reg = await import('/src/content/registry.ts');
      const D = reg.DIALOGUES;
      const res = {};
      // Mott path: accept, hit, get paid
      D.rw_mott.nodes.offer.onEnter(c);
      D.rw_mott.nodes.offer.options[0].do(c);
      res.harlStart = D.rw_harl.start(c);
      D.rw_harl.nodes.hit.onEnter(c);
      res.grellGone = !G.map.actors.find((a) => a.npc === 'grell');
      res.mottStart = D.rw_mott.start(c);
      D.rw_mott.nodes.paid.onEnter(c);
      res.q = c.questState('rw_trouble');
      res.ending30 = reg.ENDINGS.find((e) => e.order === 30).text(c);
      // Tobin
      D.rw_corliss.nodes.accept.onEnter(c);
      D.rw_fitch.nodes.tobin.onEnter(c);
      c.set('rw_tobinHome');
      res.corlissStart = D.rw_corliss.start(c);
      D.rw_corliss.nodes.home.onEnter(c);
      res.brother = c.questState('rw_brother');
      return res;
    });
    console.log('mott path', JSON.stringify(out, null, 1));
    // Bazaar paths
    await ev(() => DF.enterMap('bazaar'));
    await wait(400);
    const bz = await ev(async () => {
      const s = await DF.script(); const c = s.ctx();
      const reg = await import('/src/content/registry.ts');
      const D = reg.DIALOGUES;
      const res = {};
      D.bz_odessa.nodes.accept.onEnter(c);
      D.bz_ezra.nodes.tell.onEnter(c);
      reg.OBJ_SCRIPTS['use:bz_tape'](c, {}, G.state.player);
      c.set('bz_metOdessa');
      res.odStart = D.bz_odessa.start(c);
      res.ready = D.bz_odessa.nodes.progress.options.filter((o) => !o.if || o.if(c)).map((o) => typeof o.text === 'string' ? o.text : 'fn');
      D.bz_odessa.nodes.deduce.onEnter(c);
      D.bz_odessa.nodes.solve.onEnter(c);
      res.caravans = c.questState('bz_caravans');
      res.kessler = G.state.discovered.includes('kessler');
      // counterfeit via Oswin
      D.bz_provost.nodes.accept.onEnter(c);
      D.bz_hobb.nodes.lead.onEnter(c);
      D.bz_corvin.nodes.uncle.onEnter(c);
      c.set('bz_metOswin');
      res.oswinOpts = D.bz_oswin.nodes.again.options.filter((o) => !o.if || o.if(c)).length;
      D.bz_oswin.nodes.deal.onEnter(c);
      res.cf = c.questState('bz_counterfeit');
      res.junoFree = D.bz_juno.nodes.hire.options[0].if(c);
      res.price = 0;
      res.end40 = reg.ENDINGS.find((e) => e.order === 40).text(c);
      return res;
    });
    console.log('bz paths', JSON.stringify(bz, null, 1));
    await talk('bz_odessa', 'bz-20-odessa-done');
  }
  if (scen === 'bz' || scen === 'all') {
    await ev(() => DF.enterMap('bazaar'));
    await wait(800);
    await shot('bz-01-entry');
    console.log('bz unreachable:', JSON.stringify(await reach()));
    await look(27, 22, 'bz-02-crossroads');
    await look(9, 8, 'bz-03-pell');
    await look(38, 7, 'bz-04-brasswick');
    await look(49, 10, 'bz-05-aqueduct');
    await look(9, 33, 'bz-06-inn');
    await look(43, 36, 'bz-07-longhaul');
    await look(20, 38, 'bz-08-ragrow');
    await talk('bz_odessa', 'bz-10-odessa', ['1']);
    await talk('bz_scout', 'bz-11-scout', ['5']);
    await talk('bz_nessa', 'bz-12-nessa', ['1']);
    await talk('bz_sabine', 'bz-13-sabine', ['1']);
    await talk('bz_juno', 'bz-14-juno', ['2']);
    await talk('bz_keeper', 'bz-15-keeper');
    await talk('rw_tobin', 'bz-16-tobin');
    await ev(async () => { const b = await import('/src/ui/barter.ts'); b.openBarter(G.map.actors.find((a) => a.npc === 'bz_oswin')); });
    await wait(400);
    await shot('bz-17-barter');
    await page.keyboard.press('Escape');
    const q = await ev(async () => {
      const s = await DF.script(); const c = s.ctx();
      return { caravans: c.questState('bz_caravans'), kessler: G.state.discovered.includes('kessler'), calder: G.state.discovered.includes('calder') };
    });
    console.log('bz state:', JSON.stringify(q));
    // water delivery
    const w = await ev(async () => {
      const s = await DF.script(); const c = s.ctx();
      const reg = await import('/src/content/registry.ts');
      c.set('bz_caravansSolved');
      G.state.player.inv.push({ id: 'scrip', n: 800 });
      const before = c.waterDays();
      reg.DIALOGUES.bz_sabine.nodes.deal.onEnter(c);
      return { before, after: c.waterDays(), q: c.questState('water_delivery') };
    });
    console.log('water:', JSON.stringify(w));
  }
} catch (e) {
  console.log('ERROR', e);
}
console.log('warnings:', warns.length ? warns.join('\n') : 'none');
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
await server.close();
process.exit(0);
