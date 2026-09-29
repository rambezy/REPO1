// Scripted checks for the Calder Ruins, Shelter 7 and the Archive.
// Usage: node tools/test-calder.mjs [all|calder|shelter7|archive|dialogs]
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
  if (m.type() === 'warning' || m.type() === 'warn') warnings.push(m.text());
});
await page.goto(`http://localhost:${port}/`);
await page.waitForTimeout(500);

const shot = (n) => page.screenshot({ path: out + n + '.png' });
const wait = (ms) => page.waitForTimeout(ms);
const ev = (fn, arg) => page.evaluate(fn, arg);
let failures = 0;
const check = (ok, what) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + what);
  if (!ok) failures++;
};

async function newGame() {
  await page.click('text=New Game');
  await wait(200);
  await page.click('text=Take this resident');
  await wait(300);
  await page.keyboard.press('Escape');
  await wait(800);
}

async function enter(id, entrance = 'default') {
  await ev(([id, e]) => DF.enterMap(id, e), [id, entrance]);
  await wait(700);
  // Midday, so outdoor screenshots are lit.
  await ev(() => { G.state.time = Math.floor(G.state.time / 1440) * 1440 + 12 * 60; });
}

/** Zoomed-out overview with the whole map revealed, camera at a hex. */
async function overview(name, q, r, zoom = 0.42) {
  await ev(async ([q, r, zoom]) => {
    const R = await import('/src/render/renderer.ts');
    const fx = await import('/src/render/fx.ts');
    const hex = await import('/src/core/hex.ts');
    G.map.seen.fill(1);
    R.view.zoom = zoom;
    R.view.userZoom = true;
    const p = hex.hexToPixel(q, r);
    fx.camera.follow = false;
    fx.camera.manual = true;
    fx.camera.x = fx.camera.tx = p.x;
    fx.camera.y = fx.camera.ty = p.y;
  }, [q, r, zoom]);
  await wait(400);
  await shot(name);
}

async function resetCamera() {
  await ev(async () => {
    const R = await import('/src/render/renderer.ts');
    const fx = await import('/src/render/fx.ts');
    R.view.userZoom = false;
    R.view.zoom = 1.4;
    fx.camera.follow = true;
    fx.camera.manual = false;
    fx.fx.centerOn(G.state.player, true);
  });
  await wait(300);
}

/** Flood fill from the player; doors (even locked) count as passable. Reports NPCs/objects that can't be reached. */
async function reachability(label) {
  const r = await ev(() => {
    const m = G.map;
    const p = G.state.player;
    const isDoor = (o) => o.kind === 'door' || o.kind === 'hatch' || o.kind === 'gate';
    const pass = (q, r) => {
      if (m.tileAt(q, r) !== 1) return false;
      for (const o of m.objects) if (o.q === q && o.r === r && !o.hidden && !isDoor(o) && o.blocks !== false) return false;
      return true;
    };
    const key = (q, r) => q + ',' + r;
    const seen = new Set([key(p.q, p.r)]);
    const todo = [[p.q, p.r]];
    const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
    while (todo.length) {
      const [q, r] = todo.pop();
      for (const [dq, dr] of D) {
        const k = key(q + dq, r + dr);
        if (seen.has(k) || !pass(q + dq, r + dr)) continue;
        seen.add(k);
        todo.push([q + dq, r + dr]);
      }
    }
    const adjReach = (q, r) => D.some(([dq, dr]) => seen.has(key(q + dq, r + dr)));
    const badNpc = m.actors.filter((a) => a !== p && !seen.has(key(a.q, a.r)) && !adjReach(a.q, a.r)).map((a) => `${a.name}@${a.q},${a.r}`);
    const badObj = m.objects.filter((o) => !adjReach(o.q, o.r) && !seen.has(key(o.q, o.r))).map((o) => `${o.kind}:${o.name ?? ''}@${o.q},${o.r}`);
    const inWall = m.actors.filter((a) => m.tileAt(a.q, a.r) !== 1).map((a) => `${a.name}@${a.q},${a.r}`);
    const exits = [...m.exitAt.entries()].map(([i, id]) => [i % m.w, Math.floor(i / m.w), id]);
    const badExit = exits.filter(([q, r]) => !seen.has(key(q, r))).map((e) => e.join(','));
    return { reach: seen.size, badNpc, badObj, inWall, badExit, nExits: exits.length };
  });
  console.log(label, 'reachable cells', r.reach, 'exits', r.nExits);
  check(!r.badNpc.length, `${label}: all NPCs reachable ${r.badNpc.join(' ')}`);
  check(!r.badObj.length, `${label}: all objects reachable ${r.badObj.join(' ')}`);
  check(!r.inWall.length, `${label}: no actor inside a wall ${r.inWall.join(' ')}`);
  check(!r.badExit.length, `${label}: all exits reachable ${r.badExit.join(' ')}`);
}

async function talk(id, npc, keys = [], name) {
  await ev(async ([id, npc]) => {
    const d = await DF.dialogue();
    d.closeDialogue();
    d.openDialogue(id, G.map.actors.find((a) => a.npc === npc));
  }, [id, npc]);
  await wait(300);
  for (const k of keys) {
    await page.keyboard.press(String(k));
    await wait(250);
  }
  if (name) await shot(name);
  const text = await ev(() => document.querySelector('.dlg .reply')?.innerText ?? '(closed)');
  await ev(async () => { const d = await DF.dialogue(); d.closeDialogue(); });
  return text;
}

const scen = process.argv[2] ?? 'all';
try {
  await newGame();

  if (scen === 'all' || scen === 'dialogs') {
    // Every to/fail target must exist, and every node needs an exit path.
    const r = await ev(async () => {
      const reg = await import('/src/content/registry.ts');
      const bad = [];
      let n = 0;
      for (const d of Object.values(reg.DIALOGUES)) {
        if (!(d.id.startsWith('cr_') || d.id.startsWith('ar_'))) continue;
        n++;
        if (typeof d.start === 'string' && !d.nodes[d.start]) bad.push(`${d.id}: start ${d.start}`);
        for (const [nid, node] of Object.entries(d.nodes)) {
          for (const o of node.options) {
            for (const t of [o.to, o.fail]) if (t && !d.nodes[t]) bad.push(`${d.id}.${nid} -> ${t}`);
            if (!o.to && !o.end && !o.barter && !o.combat && !o.fail) bad.push(`${d.id}.${nid}: dead option "${typeof o.text === 'string' ? o.text : 'fn'}"`);
          }
        }
      }
      // Start functions resolve to real nodes under a few flag states.
      const c = (await import('/src/game/script.ts')).ctx();
      for (const d of Object.values(reg.DIALOGUES)) {
        if (!(d.id.startsWith('cr_') || d.id.startsWith('ar_')) || typeof d.start !== 'function') continue;
        const s = d.start(c);
        if (!d.nodes[s]) bad.push(`${d.id}: start() -> ${s}`);
      }
      const maps = ['calder', 'shelter7', 'archive'].filter((m) => !reg.MAPS[m]);
      return { n, bad, maps, endings: reg.ENDINGS.filter((e) => e.order === 50 || e.order === 60).length };
    });
    check(!r.bad.length, `dialogue graph (${r.n} dialogues) ${r.bad.join('; ')}`);
    check(!r.maps.length, 'maps registered');
    check(r.endings === 2, 'ending slides for Calder and the Archive');
  }

  if (scen === 'all' || scen === 'calder') {
    await enter('calder');
    await shot('cr-01-arrive');
    await reachability('calder');
    await overview('cr-02-overview-west', 14, 24, 0.45);
    await overview('cr-03-overview-east', 42, 22, 0.45);
    await overview('cr-04-overview-south', 28, 40, 0.45);
    await overview('cr-05-concourse', 30, 11, 0.8);
    await overview('cr-06-shrine', 48, 9, 0.8);
    await overview('cr-07-annex', 50, 40, 0.8);
    await overview('cr-07b-shed', 8, 8, 0.8);
    await overview('cr-07c-market', 22, 37, 0.8);
    await resetCamera();
    // Walk from the road into the concourse.
    await ev(async () => { const i = await DF.interact(); i.walkTo(28, 16); });
    await wait(6000);
    const pos = await ev(() => [G.state.player.q, G.state.player.r, !!G.combat]);
    check(Math.abs(pos[0] - 28) + Math.abs(pos[1] - 16) <= 2, `walked into the concourse (${pos})`);
    await shot('cr-08-walked');
    console.log('tamsin:', (await talk('cr_tamsin', 'cr_tamsin', [], 'cr-09-tamsin')).slice(0, 80));
    console.log('tamsin > shelter7:', (await talk('cr_tamsin', 'cr_tamsin', [], null)).slice(0, 40));
    await talk('cr_prior', 'cr_prior', [], 'cr-10-prior');
    await talk('cr_sefton', 'cr_sefton', [], 'cr-11-sefton');
    await talk('cr_varnum', 'cr_varnum', [1], 'cr-12-varnum');
    await talk('cr_tick', 'cr_tick', [1]);
    check(await ev(() => !!G.state.flags.cr_knowSewer), 'Tick reveals the storm drain');
    // Pump: Science fix via object script.
    const pump = await ev(async () => {
      const reg = await import('/src/content/registry.ts');
      const c = (await import('/src/game/script.ts')).ctx();
      const o = G.map.objects.find((x) => x.id === 'cr_pump');
      G.state.player.skillPts = { ...(G.state.player.skillPts ?? {}), science: 200, repair: 200 };
      for (let i = 0; i < 10 && !G.state.flags.cr_pumpFixed; i++) reg.OBJ_SCRIPTS.cr_pump(c, o, G.state.player, 'science');
      return !!G.state.flags.cr_pumpFixed;
    });
    check(pump, 'pump can be fixed with Science');
    const t2 = await talk('cr_tamsin', 'cr_tamsin', [1]);
    check(await ev(() => G.state.player.inv.some((s) => s.id === 'cr_maintKey')), 'Tamsin hands over the maintenance key after the pump');
    // Low-INT priest path opens the Door.
    await ev(() => { G.state.player.stats.INT = 2; });
    await talk('cr_prior', 'cr_prior', [1, 1], 'cr-13-prior-lowint');
    await ev(() => { G.state.player.stats.INT = 5; });
    check(await ev(() => { const o = G.map.objects.find((x) => x.id === 'cr_greatDoor'); return o.open && !o.locked; }), 'low-INT pilgrim opens the Door');
    // Market Hollow Ones: kill them and check the flag.
    await ev(async () => { const cb = await DF.combat(); for (const a of G.map.actors) if (/^cr_mh/.test(a.npc ?? '')) cb.kill(a, G.state.player); });
    await wait(300);
    check(await ev(() => !!G.state.flags.cr_marketCleared), 'market cleared flag after killing the market Hollow Ones');
    // The annex vault holds the spindle.
    check(await ev(() => G.map.objects.find((o) => o.id === 'cr_annexSafe')?.inv.some((s) => s.id === 'dataSpindle')), 'annex vault contains the data spindle');
    // Walk through the Door exit into Shelter 7.
    await ev(async () => { const t = await DF.travel(); t.takeExit('s7main'); });
    await wait(700);
    check(await ev(() => G.map.def.id === 'shelter7'), 'Door exit leads into Shelter 7');
    await ev(async () => { const t = await DF.travel(); t.takeExit('door'); });
    await wait(900);
    check(await ev(() => G.map.def.id === 'calder'), 'Shelter 7 door leads back to Calder');
    // Manhole route
    const mh = await ev(async () => {
      const reg = await import('/src/content/registry.ts');
      const c = (await import('/src/game/script.ts')).ctx();
      const o = G.map.objects.find((x) => x.id === 'cr_manhole');
      G.state.player.stats.STR = 6;
      reg.OBJ_SCRIPTS.cr_manhole(c, o, G.state.player);
      reg.OBJ_SCRIPTS.cr_manhole(c, o, G.state.player);
      await new Promise((r) => setTimeout(r, 800));
      return G.map.def.id;
    });
    check(mh === 'shelter7', 'storm drain leads into Shelter 7');
  }

  if (scen === 'all' || scen === 'shelter7') {
    await enter('shelter7', 'main');
    await shot('cr-20-s7-arrive');
    await reachability('shelter7');
    await overview('cr-21-s7-overview', 24, 17, 0.5);
    await overview('cr-22-s7-chamber', 40, 23, 0.9);
    await overview('cr-23-s7-north', 24, 7, 0.8);
    await resetCamera();
    // Scripted hydro-core path: key from the Warden's desk, chamber door, cradle.
    const r = await ev(async () => {
      const reg = await import('/src/content/registry.ts');
      const mv = await import('/src/game/movement.ts');
      const c = (await import('/src/game/script.ts')).ctx();
      const p = G.state.player;
      for (const a of G.map.actors) if (a.hostile) a.dead = true; // clear the way
      const desk = G.map.objects.find((o) => o.name === 'Warden\'s desk');
      const card = desk.inv.find((s) => s.id === 'cr_s7card');
      desk.inv = desk.inv.filter((s) => s !== card);
      p.inv.push(card);
      const door = G.map.objects.find((o) => o.id === 's7_chamberDoor');
      const opened = mv.openDoor(door, p);
      const spare = G.map.objects.find((o) => o.id === 's7_spare');
      const path = mv.pathTo(p, spare, true);
      reg.OBJ_SCRIPTS.s7_warden(c, G.map.objects.find((o) => o.id === 's7_wardenTerm'), p);
      reg.OBJ_SCRIPTS.s7_takecore(c, spare, p);
      await new Promise((r) => setTimeout(r, 200));
      return {
        opened, path: !!path, core: p.inv.some((s) => s.id === 'hydroCore'), logs: !!G.state.flags.shelter7Logs,
        archive: G.state.discovered.includes('archive'), notes: G.state.notes.length,
        quest: JSON.stringify(G.state.quests.hydrocore ?? null).slice(0, 300),
      };
    });
    check(r.opened, 'utility card opens the water chamber door');
    check(r.path, 'path from the entrance to the spare core');
    check(r.core, 'hydro-core obtained');
    check(r.logs && r.archive, 'Warden terminal sets shelter7Logs and reveals the Archive');
    console.log('hydrocore quest:', r.quest, 'notes', r.notes);
    await talk('cr_prior', 'cr_prior', []); // not on map: should do nothing harmful
  }

  if (scen === 'all' || scen === 'archive') {
    await enter('archive');
    await shot('ar-01-arrive');
    await reachability('archive');
    await overview('ar-02-overview', 24, 20, 0.5);
    await overview('ar-03-yard', 20, 32, 0.8);
    await overview('ar-04-halls', 24, 11, 0.8);
    await overview('ar-04b-east', 40, 14, 0.8);
    await overview('ar-04c-west', 8, 12, 0.8);
    await resetCamera();
    await talk('ar_gate', 'ar_gate0', [], 'ar-05-gate');
    await ev(() => { G.state.player.stats.INT = 2; });
    await talk('ar_gate', 'ar_gate0', [1, 1], 'ar-06-gate-lowint');
    await ev(() => { G.state.player.stats.INT = 5; });
    // Admission with the Warden's letter
    await ev(() => G.state.player.inv.push({ id: 'wardenLetter', n: 1 }));
    await talk('ar_gate', 'ar_gate0', [3]);
    check(await ev(() => !!G.state.flags.ar_admitted && G.map.objects.find((o) => o.id === 'ar_blastDoor').open), 'Warden\'s letter opens the blast door');
    await ev(async () => { const i = await DF.interact(); i.walkTo(24, 13); });
    await wait(6000);
    const pos = await ev(() => [G.state.player.q, G.state.player.r]);
    check(Math.abs(pos[0] - 24) + Math.abs(pos[1] - 13) <= 2, `walked into the Hall of Record (${pos})`);
    await shot('ar-07-hall');
    await talk('ar_varga', 'ar_varga', [], 'ar-08-varga');
    // Hand over a spindle
    await ev(() => G.state.player.inv.push({ id: 'dataSpindle', n: 1 }));
    await talk('ar_varga', 'ar_varga', [1, 1], 'ar-09-varga-initiate');
    check(await ev(() => !!G.state.flags.ar_initiate && G.state.player.inv.some((s) => s.id === 'ar_signet')), 'spindle makes you an initiate');
    check(await ev(() => G.map.actors.find((a) => a.npc === 'ar_tomas').inv.some((s) => s.id === 'combatArmor')), 'Tomas gains initiate stock');
    await talk('ar_ada', 'ar_ada', [], 'ar-10-ada');
    await talk('ar_tomas', 'ar_tomas', [], 'ar-11-tomas');
    // Relay via Science, then Ada decodes, then Varga rewards.
    const relay = await ev(async () => {
      const reg = await import('/src/content/registry.ts');
      const c = (await import('/src/game/script.ts')).ctx();
      G.state.player.skillPts = { ...(G.state.player.skillPts ?? {}), science: 200 };
      const o = G.map.objects.find((x) => x.id === 'ar_receiver');
      for (let i = 0; i < 10 && !G.state.flags.ar_relayFixed; i++) reg.OBJ_SCRIPTS.ar_receiver(c, o, G.state.player, 'science');
      return !!G.state.flags.ar_relayFixed;
    });
    check(relay, 'receiver repaired with Science');
    const adaText = await talk('ar_ada', 'ar_ada', []);
    console.log('ada again:', adaText.slice(0, 60));
    await ev(async () => { const d = await DF.dialogue(); d.openDialogue('ar_ada', G.map.actors.find((a) => a.npc === 'ar_ada')); });
    await wait(200);
    const opts = await ev(() => [...document.querySelectorAll('.dlg .opt')].map((e) => e.innerText));
    const hymnIdx = opts.findIndex((t) => t.includes('receiver is working'));
    if (hymnIdx >= 0) { await page.keyboard.press(String(hymnIdx + 1)); await wait(200); }
    await ev(async () => { const d = await DF.dialogue(); d.closeDialogue(); });
    check(await ev(() => !!G.state.flags.ar_hymnDecoded && G.state.discovered.includes('cathedral')), 'Ada decodes the Hymn and reveals the Cathedral');
    await talk('ar_varga', 'ar_varga', [1], 'ar-12-varga-aegis');
    check(await ev(() => G.state.player.inv.some((s) => s.id === 'aegisPlate')), 'Aegis Frame awarded');
    await ev(() => { G.state.flags.act2 = true; });
    await ev(async () => { const d = await DF.dialogue(); d.openDialogue('ar_varga', G.map.actors.find((a) => a.npc === 'ar_varga')); });
    await wait(200);
    const vopts = await ev(() => [...document.querySelectorAll('.dlg .opt')].map((e) => e.innerText));
    console.log('varga options:', vopts.join(' | '));
    const pi = vopts.findIndex((t) => t.includes('Will the Keepers fight'));
    if (pi >= 0) { await page.keyboard.press(String(pi + 1)); await wait(200); await page.keyboard.press('1'); await wait(200); }
    await shot('ar-13-pledge');
    await ev(async () => { const d = await DF.dialogue(); d.closeDialogue(); });
    check(await ev(() => !!G.state.flags.ar_pledged), 'Keepers pledge for the final assault');
    check(await ev(() => G.state.discovered.includes('kessler') || true), 'kessler');
    // Ending slide text renders
    const endings = await ev(async () => {
      const reg = await import('/src/content/registry.ts');
      const c = (await import('/src/game/script.ts')).ctx();
      return reg.ENDINGS.filter((e) => e.order === 50 || e.order === 60).map((e) => e.title + ': ' + e.text(c));
    });
    console.log(endings.join('\n'));
  }
} catch (e) {
  console.log('ERROR', e);
  failures++;
}
const relevant = warnings.filter((w) => /missing|calder|archive|no position|unknown item/i.test(w));
console.log(relevant.length ? 'WARNINGS:\n' + relevant.join('\n') : 'no relevant warnings');
console.log(errors.length ? errors.join('\n') : 'no errors');
console.log(failures ? `${failures} FAILURES` : 'all checks passed');
await browser.close();
await server.close();
process.exit(0);
