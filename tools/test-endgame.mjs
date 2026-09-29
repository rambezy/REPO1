// Scripted checks for the endgame areas (Fort Kessler, Glass Cathedral).
// Usage: node tools/test-endgame.mjs <scenario>
//   scenarios: dialogs | kessler | coolant | cathedral | ashgrave | lowint | endings | all
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdirSync } from 'node:fs';

const out = new URL('./out/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const port = 5200 + Math.floor(Math.random() * 300);
const server = await createServer({ server: { port, strictPort: true }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
const warnings = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push('console: ' + m.text());
  if (m.type() === 'warning' || m.text().includes('missing')) warnings.push(m.text());
});
// Other areas may be mid-edit while this runs: STUB=calder,archive replaces
// those content modules with empty ones so the endgame can still be tested.
for (const name of (process.env.STUB ?? '').split(',').filter(Boolean)) {
  await page.route(new RegExp(`/src/content/${name}\\.ts`), (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'export {};' }));
}
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(500);

const shot = (n) => page.screenshot({ path: out + n + '.png' });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
const log = (...a) => console.log(...a);

async function newGame() {
  await page.click('text=New Game');
  await wait(200);
  await page.click('text=Take this resident');
  await wait(300);
  await page.keyboard.press('Escape');
  await wait(800);
}

async function gearUp(opts = {}) {
  await ev(async (o) => {
    const a = await import('/src/game/actors.ts');
    const p = G.state.player;
    p.level = 10;
    p.maxHpBonus = o.tank ? 600 : 60;
    for (const [id, n] of [['combatArmor', 1], ['plasmaRifle', 1], ['fusion', 60], ['hypo', 6], ['superHypo', 3], ['dynamite', 1], ['lockpicks', 1], ['geiger', 1]]) a.addItem(p, id, n);
    a.equipById(p, 'combatArmor');
    a.equipById(p, 'plasmaRifle');
    const c = await DF.combat();
    c.reload(p);
    p.skillPts = { ...(p.skillPts ?? {}), traps: 150, science: 150, repair: 150, speech: 150, energy: 120, lockpick: 100, sneak: 100 };
    p.hp = 9999;
    const ch = await import('/src/game/character.ts');
    p.hp = ch.maxHp(p);
    G.state.flags.act2 = true;
    G.state.flags.coreReturned = true;
  }, opts);
}

async function goTo(q, r) {
  await ev(async ([q, r]) => {
    const p = G.state.player;
    const f = G.map.freeNear({ q, r }) ?? { q, r };
    p.q = f.q; p.r = f.r; p._path = undefined;
    const fx = await import('/src/render/fx.ts');
    fx.fx.centerOn(p, true);
  }, [q, r]);
  await wait(350);
}

async function talk(dialog, npcId) {
  await ev(async ([d, id]) => {
    const dl = await DF.dialogue();
    const a = id ? G.map.actors.find((x) => x.npc === id) : undefined;
    dl.openDialogue(d, a);
  }, [dialog, npcId]);
  await wait(300);
}

async function choose(text) {
  const opt = page.locator('.dlg .opt', { hasText: text }).first();
  if (!(await opt.count())) {
    const all = await page.locator('.dlg .opt').allInnerTexts();
    log(`  !! option not found: "${text}". Visible:`, JSON.stringify(all));
    return false;
  }
  await opt.click();
  await wait(250);
  return true;
}

async function dlgText() {
  return (await page.locator('.dlg .reply').first().innerText().catch(() => '')).slice(0, 160).replace(/\n/g, ' ');
}

async function closeAll() {
  await ev(async () => { const cm = await import('/src/ui/common.ts'); cm.closeAllModals(); });
  await wait(150);
}

async function state(keys) {
  return ev((ks) => Object.fromEntries(ks.map((k) => [k, k.startsWith('q:') ? G.state.quests[k.slice(2)]?.state ?? 'none' : G.state.flags[k]])), keys);
}

async function advance(minutes) {
  for (let i = 0; i < minutes; i++) {
    await ev(async () => { const t = await import('/src/game/time.ts'); t.advanceTime(1); });
    await wait(120);
  }
}

async function endCombat() {
  await ev(async () => { const c = await DF.combat(); if (G.combat) c.endCombat(); });
}

async function fightAll(maxRounds = 40) {
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
        if (m.weapon.ammo && m.stack && !m.stack.ammo) c.reload(p);
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
    await wait(120);
  }
  return ev(() => ({ c: !!G.combat }));
}

// ------------------------------------------------------------------ scenarios

async function dialogs() {
  const r = await ev(async () => {
    const reg = await import('/src/content/registry.ts');
    const probs = [];
    const mine = Object.values(reg.DIALOGUES).filter((d) => d.id.startsWith('kf_') || d.id.startsWith('ct_'));
    for (const d of mine) {
      if (typeof d.start === 'string' && !d.nodes[d.start]) probs.push(`${d.id}: start ${d.start}`);
      for (const [nid, n] of Object.entries(d.nodes)) {
        const exits = n.options.filter((o) => o.end || o.to || o.combat || o.barter);
        if (!exits.length) probs.push(`${d.id}.${nid}: no way forward`);
        for (const o of n.options) {
          for (const k of ['to', 'fail']) if (o[k] && !d.nodes[o[k]]) probs.push(`${d.id}.${nid}: ${k} -> ${o[k]} missing`);
        }
      }
    }
    // start functions: collect returned node names by source text
    for (const d of mine) {
      if (typeof d.start === 'function') {
        for (const m of d.start.toString().matchAll(/'([A-Za-z0-9_]+)'/g)) {
          if (!d.nodes[m[1]] && !m[1].includes('_') && !['INT'].includes(m[1])) probs.push(`${d.id}: start may return missing node ${m[1]}`);
        }
      }
    }
    // map markers
    for (const id of ['kessler', 'kessler_labs', 'cathedral', 'cathedral_dome']) {
      const m = reg.MAPS[id];
      for (const e of Object.values(m.entrances)) if (typeof e === 'string' && !m.rows.some((row) => row.includes(e))) probs.push(`${id}: entrance marker ${e} missing`);
    }
    return { n: mine.length, probs };
  });
  log('dialogues checked:', r.n);
  for (const p of r.probs) log('  ', p);
}

async function reach() {
  // Flood-fill each map from its default entrance (doors count as passable)
  // and list floor cells that cannot be reached.
  for (const id of ['kessler', 'kessler_labs', 'cathedral', 'cathedral_dome']) {
    await ev((id) => DF.enterMap(id), id);
    await wait(300);
    const r = await ev(async () => {
      const m = G.map;
      const hex = await import('/src/core/hex.ts');
      const p = G.state.player;
      const seen = new Set([p.q + ',' + p.r]);
      const q = [{ q: p.q, r: p.r }];
      while (q.length) {
        const c = q.pop();
        for (const n of hex.neighbors(c)) {
          const k = n.q + ',' + n.r;
          if (seen.has(k) || !m.walkable(n.q, n.r, { ignoreDoors: true })) continue;
          if (m.objects.some((o) => o.q === n.q && o.r === n.r && ['door', 'gate'].includes(o.kind) && !o.hidden)) { seen.add(k); q.push(n); continue; }
          seen.add(k); q.push(n);
        }
      }
      // locked doors/gates are walkable only via ignoreDoors when unlocked; treat all as passable
      const bad = [];
      for (let r = 0; r < m.h; r++) for (let qq = 0; qq < m.w; qq++) {
        if (m.walkable(qq, r, { ignoreDoors: true }) && !seen.has(qq + ',' + r)) bad.push(qq + ',' + r);
      }
      const exits = [...m.exitAt.keys()].map((i) => (i % m.w) + ',' + Math.floor(i / m.w)).filter((k) => !seen.has(k));
      const npcsStuck = m.actors.filter((a) => a !== p && !seen.has(a.q + ',' + a.r)).map((a) => a.name + '@' + a.q + ',' + a.r);
      return { map: m.def.id, unreachable: bad.length, sample: bad.slice(0, 12), exitsUnreached: exits, npcsStuck };
    });
    log(JSON.stringify(r));
  }
}

async function kessler() {
  await gearUp({ tank: true });
  await ev(() => DF.enterMap('kessler'));
  await wait(700);
  await shot('kf-01-arrive');
  log('vats quest:', JSON.stringify(await state(['q:vats'])));
  const hostile = await ev(() => G.map.actors.filter((a) => a.team === 'kessler' && a.hostile).length);
  log('hostile garrison before passage:', hostile);
  // courier satchel
  await ev(async () => { const a = await import('/src/game/actors.ts'); a.addItem(G.state.player, 'kf_writ', 1); });
  await goTo(13, 22);
  await talk('kf_gate', 'kf_gatekeeper');
  await shot('kf-02-gate');
  log(' gate:', await dlgText());
  await choose('Here is my writ');
  log(' gate:', await dlgText());
  await choose('Thank you');
  const s1 = await ev(() => ({ passage: G.state.flags.kf_passage, gateOpen: G.map.objects.find((o) => o.id === 'kf_gate')?.open, hostile: G.map.actors.filter((a) => a.team === 'kessler' && a.hostile).length }));
  log('after writ:', JSON.stringify(s1));
  await goTo(24, 18); await shot('kf-03-yard');
  await goTo(25, 9); await shot('kf-04-barracks');
  await goTo(44, 12); await shot('kf-05-motorpool');
  await goTo(46, 23); await shot('kf-06-bunker');
  await goTo(28, 33); await shot('kf-07-pens');
  await goTo(10, 10); await shot('kf-08-crater');
  await goTo(34, 1); await shot('kf-09-breach');
  // Sabel
  await goTo(37, 34);
  await talk('kf_sabel', 'kf_sabel');
  await shot('kf-10-sabel');
  log(' sabel:', await dlgText());
  await choose('get those people out');
  log(' sabel:', await dlgText());
  await choose('I\'ll do it');
  await choose('Is there a way into the control room');
  await choose('Thank you');
  await choose('Later');
  log('sabel flags:', JSON.stringify(await state(['kf_sabelAlly', 'kf_sabelMet'])), await ev(() => G.state.player.inv.filter((s) => s.id.startsWith('kf_')).map((s) => s.id)));
  // open the pen and free the captives
  await goTo(23, 29);
  await ev(() => { const d = G.map.objects.find((o) => o.id === 'kf_penDoor'); d.locked = 0; d.open = true; });
  await goTo(23, 32);
  await talk('kf_mireille', 'kf_mireille');
  await shot('kf-11-mireille');
  await choose('Yes. Who are you');
  await choose('getting you out');
  log(' mireille:', await dlgText());
  await choose('Make for the Bazaar');
  await closeAll();
  log('captives:', JSON.stringify(await state(['kf_captivesFreed', 'kf_captivesSaved'])), await ev(() => G.map.actors.filter((a) => a.proto === 'kfCaptive').length));
  // down to the labs
  await ev(() => DF.enterMap('kessler_labs'));
  await wait(700);
  await shot('kf-12-labs-lobby');
  await goTo(15, 9); await shot('kf-13-control');
  await talk('kf_records');
  await choose('Operations log'); log(' records:', await dlgText());
  await choose('Back'); await choose('Intake registry'); await choose('Copy record');
  await closeAll();
  log('reveal cathedral:', await ev(() => G.state.discovered.includes('cathedral')), 'intake file:', await ev(() => G.state.player.inv.some((s) => s.id === 'kf_intakeFile')));
  await goTo(30, 26); await shot('kf-14-vathall');
  await goTo(25, 11); await shot('kf-15-armory');
  await goTo(46, 26); await shot('kf-16-pumps');
  await goTo(39, 12); await shot('kf-17-reactor');
  await talk('kf_reactor');
  await shot('kf-18-reactor-dlg');
  await choose('Wire a demolition charge');
  log(' reactor:', await dlgText());
  await choose('Run');
  log('doom:', JSON.stringify(await state(['kf_doomAt', 'kf_doomKind', 'kf_alarm'])), 'time', await ev(() => G.state.time));
  await endCombat();
  await goTo(5, 17);
  await endCombat();
  await advance(3);
  await shot('kf-19-countdown');
  await endCombat();
  await advance(3);
  await wait(1500);
  await shot('kf-20-boom');
  log('after boom:', JSON.stringify(await state(['q:vats', 'kf_vatsDestroyed', 'kf_vatsHow', 'kf_labsCollapsed'])), 'vats used:', await ev(() => G.map.objects.filter((o) => o.kind === 'vat' && o.used).length), 'hp', await ev(() => G.state.player.hp), 'dead', await ev(() => G.state.player.dead));
  await endCombat();
  await ev(() => DF.enterMap('kessler', 'fromLabs'));
  await wait(500);
  await ev(() => DF.enterMap('kessler_labs'));
  await wait(800);
  log('bounced back to:', await ev(() => G.map?.def.id));
  await endCombat();
  await ev(() => { G.map.actors.forEach((a) => { if (a.team === 'kessler') a.hostile = false; }); });
  await goTo(37, 34);
  await talk('kf_sabel', 'kf_sabel');
  log(' sabel after:', await dlgText());
  await shot('kf-21-sabel-after');
  await closeAll();
}

async function surrender() {
  await gearUp({ tank: true });
  await ev(() => DF.enterMap('kessler'));
  await wait(500);
  await goTo(14, 23);
  await shot('kf-50-gate-closed');
  await talk('kf_gate', 'kf_gatekeeper');
  await choose('I\'m stock');
  await choose('Lead the way');
  await wait(1500);
  log(' sabel:', await dlgText());
  await shot('kf-51-surrender');
  await choose('Thanks');
  await closeAll();
  log('surrender:', JSON.stringify(await state(['kf_passage', 'kf_surrenderDone'])), await ev(() => [G.state.player.q, G.state.player.r, G.map.objects.find((o) => o.id === 'kf_penDoor').open]));
}

async function coolant() {
  await gearUp({ tank: true });
  await ev(() => { G.state.flags.kf_passage = true; });
  await ev(() => DF.enterMap('kessler_labs'));
  await wait(600);
  await goTo(45, 24);
  await talk('kf_coolant');
  await shot('kf-30-coolant');
  await choose('Reverse the coolant');
  log(' coolant:', await dlgText());
  await closeAll();
  log('doom:', JSON.stringify(await state(['kf_doomKind', 'kf_alarm'])));
  await advance(4);
  log('after:', JSON.stringify(await state(['q:vats', 'kf_vatsHow', 'kf_labsCollapsed'])));
  await goTo(30, 26);
  await shot('kf-31-vats-dead');
  // overload terminal still reads dead
  await goTo(18, 6);
  await talk('kf_control');
  log(' control:', await dlgText());
  await closeAll();
}

async function cathedral() {
  await gearUp({ tank: true });
  await ev(() => DF.enterMap('cathedral'));
  await wait(700);
  await shot('ct-01-arrive');
  log('shepherd quest:', JSON.stringify(await state(['q:shepherd'])));
  await goTo(8, 18); await shot('ct-02-camp');
  await goTo(18, 16); await shot('ct-03-courtyard');
  await goTo(33, 23); await shot('ct-04-nave');
  await goTo(35, 9); await shot('ct-05-dorm');
  await goTo(47, 36); await shot('ct-06-shed');
  await goTo(17, 34); await shot('ct-07-cantor-house');
  await goTo(21, 23);
  await talk('ct_cantor', 'ct_cantor');
  await shot('ct-08-cantor');
  log(' cantor:', await dlgText());
  await choose('see the Shepherd');
  log(' cantor:', await dlgText());
  await closeAll();
  log('audience:', JSON.stringify(await state(['ct_audience'])), 'door locked:', await ev(() => G.map.objects.find((o) => o.id === 'ct_domeDoor').locked));
  await goTo(48, 23); await shot('ct-09-vestibule');
  await ev(() => DF.enterMap('cathedral_dome'));
  await wait(700);
  await shot('ct-10-dome');
  log('dome hostile:', await ev(() => G.map.actors.filter((a) => a.hostile).map((a) => a.name)));
  await goTo(20, 12); await shot('ct-11-throne');
  await goTo(18, 17);
  await talk('ct_shepherd', 'ct_shepherd');
  await shot('ct-12-shepherd');
  await choose('What is the Hymn');
  log(' shepherd:', await dlgText());
  await shot('ct-13-hymn');
  await choose('Agreement without choice');
  await choose('think of something');
  await choose('How do you keep the carrier');
  log(' shepherd:', await dlgText());
  await closeAll();
  await goTo(24, 17);
  await talk('ct_transmitter');
  await shot('ct-14-transmitter');
  await choose('[Science]');
  log(' transmitter:', await dlgText());
  await closeAll();
  await wait(500);
  log('after silence:', JSON.stringify(await state(['q:shepherd', 'ct_hymnSilenced', 'ct_shepherdDead', 'ct_shepherdKilled', 'ct_shepherdSilenced'])), await ev(() => G.map.actors.filter((a) => !a.dead && a.team !== 'player').map((a) => `${a.name}:${a.team}:${a.hostile}`)));
  await shot('ct-15-silent');
  await talk('ct_ashgrave', 'ct_ashgrave');
  log(' ashgrave:', await dlgText());
  await choose('Go north');
  await closeAll();
  await ev(() => DF.enterMap('cathedral', 'fromDome'));
  await wait(600);
  log('choir left outside:', await ev(() => G.map.actors.filter((a) => !a.dead && a.team === 'choir').length), 'grafted neutral:', await ev(() => G.map.actors.filter((a) => a.team === 'neutral').map((a) => a.name)));
  await shot('ct-16-after');
}

async function ashgrave() {
  await gearUp({ tank: true });
  await ev(async () => { const a = await import('/src/game/actors.ts'); a.addItem(G.state.player, 'kf_intakeFile', 1); G.state.flags.ct_audience = true; G.state.quests.vats = { state: 'done', notes: [], t: 0 }; });
  await ev(() => DF.enterMap('cathedral_dome'));
  await wait(600);
  await goTo(23, 13);
  await talk('ct_ashgrave', 'ct_ashgrave');
  await shot('ct-20-ashgrave');
  await choose('retune you');
  log(' ashgrave:', await dlgText());
  await shot('ct-21-turn');
  await choose('Together');
  await wait(600);
  log('combat:', await ev(() => !!G.combat), 'ashgrave companion:', await ev(() => G.map.actors.find((a) => a.npc === 'ct_ashgrave')?.companion));
  const r = await fightAll(60);
  log('ASHLOG', await ev(async () => { const l = await DF.log(); return l.LOG.filter((x) => /Ashgrave/.test(x)).slice(-25).join('\n'); }));
  log('ash state:', await ev(() => { const a = G.map.actors.find((x) => x.npc === 'ct_ashgrave'); return a && { dead: a.dead, comp: a.companion, team: a.team, hp: a.hp }; }), JSON.stringify(await state(['party:ct_ashgrave', 'ct_ashgraveDead'])));
  log('fight:', JSON.stringify(r), JSON.stringify(await state(['q:shepherd', 'ct_shepherdKilled', 'ct_ashgraveTurned', 'ct_shepherdDead', 'kf_toldGoHome'])));
  await shot('ct-22-after-fight');
  await talk('ct_ashgrave', 'ct_ashgrave');
  log(' ashgrave:', await dlgText());
  await shot('ct-23-farewell');
  await choose('Go well');
  await closeAll();
  log('ashgrave leads:', JSON.stringify(await state(['ct_ashgraveLeads'])));
}

async function lowint() {
  await gearUp({ tank: true });
  await ev(() => { G.state.player.stats.INT = 2; G.state.flags.ct_audience = true; });
  await ev(() => DF.enterMap('kessler'));
  await wait(500);
  await goTo(13, 22);
  await talk('kf_gate', 'kf_gatekeeper');
  await shot('kf-40-lowint-gate');
  await choose('Me Grafted too');
  log(' gate:', await dlgText());
  await closeAll();
  await goTo(37, 34);
  await talk('kf_sabel', 'kf_sabel');
  log(' sabel:', await dlgText());
  await closeAll();
  await ev(() => DF.enterMap('cathedral_dome'));
  await wait(600);
  await goTo(18, 17);
  await talk('ct_shepherd', 'ct_shepherd');
  await shot('ct-40-lowint-shepherd');
  await choose('Stop song');
  log(' shepherd:', await dlgText());
  await closeAll();
  await goTo(24, 17);
  await talk('ct_transmitter');
  await choose('Pull red cable');
  log(' transmitter:', await dlgText());
  await closeAll();
  log('lowint:', JSON.stringify(await state(['q:shepherd', 'ct_lowIntSilence', 'ct_hymnSilenced'])));
}

async function endings() {
  const r = await ev(async () => {
    const reg = await import('/src/content/registry.ts');
    const s = await import('/src/game/script.ts');
    const f = G.state.flags;
    const out = [];
    const combos = [
      { kf_vatsDestroyed: true, kf_vatsHow: 'charge', kf_captivesFreed: true, kf_sabelMet: true, ct_shepherdDead: true, ct_hymnSilenced: true, ct_shepherdSilenced: true, ct_cantorTurned: true },
      { kf_vatsDestroyed: true, kf_vatsHow: 'coolant', ct_shepherdDead: true, ct_shepherdKilled: true, ct_ashgraveTurned: true, ct_ashgraveLeads: true, kf_sabelDead: true },
      { kf_vatsDestroyed: true, kf_vatsHow: 'overload', ct_shepherdDead: true, ct_shepherdKilled: true, ct_lowIntSilence: true, ct_hymnSilenced: true },
    ];
    for (const cmb of combos) {
      for (const k of Object.keys(f)) if (k.startsWith('kf_') || k.startsWith('ct_')) delete f[k];
      Object.assign(f, cmb);
      for (const e of reg.ENDINGS.filter((e) => e.order >= 70 && e.order <= 85).sort((a, b) => a.order - b.order)) out.push(`[${e.order} ${e.title}] ${e.text(s.ctx())}`);
      out.push('---');
    }
    return out;
  });
  for (const l of r) log(l);
  await ev(async () => { const e = await import('/src/ui/endings.ts'); e.showEnding('victory'); });
  await wait(600);
  await page.mouse.click(640, 400); await wait(300);
  await shot('ct-50-ending-slide');
}

const scen = process.argv[2] ?? 'all';
try {
  await newGame();
  if (scen === 'dialogs' || scen === 'all') await dialogs();
  if (scen === 'reach' || scen === 'all') await reach();
  if (scen === 'kessler' || scen === 'all') await kessler();
  if (scen === 'coolant') await coolant();
  if (scen === 'surrender') await surrender();
  if (scen === 'cathedral' || scen === 'all') await cathedral();
  if (scen === 'ashgrave') await ashgrave();
  if (scen === 'lowint') await lowint();
  if (scen === 'endings' || scen === 'all') await endings();
  const logText = await ev(() => document.querySelector('#hud .log')?.innerText ?? '');
  log('--- last log lines ---\n' + logText.split('\n').slice(-12).join('\n'));
} catch (e) {
  console.log('ERROR', e);
}
console.log(warnings.length ? 'WARNINGS:\n' + warnings.join('\n') : 'no warnings');
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
await server.close();
process.exit(0);
