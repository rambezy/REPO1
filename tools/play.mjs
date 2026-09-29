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
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
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

const scen = process.argv[2] ?? 'start';
try {
  await newGame();
  if (scen === 'debug') {
    const r = await ev(async () => {
      const mv = await import('/src/game/movement.ts');
      const p = G.state.player;
      const path = mv.pathTo(p, { q: 1, r: 9 });
      const i = await DF.interact();
      i.walkTo(1, 9);
      return { path, modal: G.modal, screen: G.screen, pp: p._path };
    });
    console.log(JSON.stringify(r));
    await wait(3000);
    console.log(JSON.stringify(await ev(() => ({ map: G.map.def.id, q: G.state.player.q, r: G.state.player.r }))));
  }
  if (scen === 'cave') {
    await ev(() => DF.enterMap('shelter29_cave', 'hatch'));
    await wait(500);
    const r = await ev(async () => {
      const ai = await import('/src/game/ai.ts');
      return { p: [G.state.player.q, G.state.player.r], rats: G.map.actors.filter(a => a.proto.startsWith('rat')).map(a => [a.q, a.r, a.hostile, a.team]), aware: ai.checkAwareness()?.name, combat: !!G.combat };
    });
    console.log(JSON.stringify(r));
    await ev(async () => { const i = await DF.interact(); i.walkTo(28, 7); });
    await wait(3000);
    console.log(JSON.stringify(await ev(() => ({ p: [G.state.player.q, G.state.player.r], combat: !!G.combat, path: G.state.player._path }))));
    await shot('c01');
  }
  if (scen === 'start') {
    await shot('p01-shelter');
    await ev(async () => { const d = await DF.dialogue(); d.openDialogue('warden', G.map.actors.find((a) => a.npc === 'warden')); });
    await wait(400);
    await shot('p02-warden');
    for (let k = 0; k < 4; k++) { await page.keyboard.press('1'); await wait(250); }
    await shot('p03-warden2');
    await page.keyboard.press('1');
    await wait(200);
    await ev(async () => { const d = await DF.dialogue(); d.closeDialogue(); d.openDialogue('quill', G.map.actors.find((a) => a.npc === 'quill')); });
    await wait(200);
    await page.keyboard.press('1');
    await wait(200);
    await ev(async () => { const d = await DF.dialogue(); d.closeDialogue(); });
    // equip pistol
    await ev(async () => { const a = await import('/src/game/actors.ts'); a.equipById(G.state.player, 'pistol9'); const c = await DF.combat(); c.reload(G.state.player); });
    await page.keyboard.press('i');
    await wait(300);
    await shot('p04-inventory');
    await page.keyboard.press('i');
    await page.keyboard.press('c');
    await wait(300);
    await shot('p05-character');
    await page.keyboard.press('c');
    await page.keyboard.press('l');
    await wait(300);
    await shot('p06-pda');
    await page.keyboard.press('l');
    // walk to hatch
    await ev(async () => { const i = await DF.interact(); i.walkTo(0, 9); });
    await wait(5000);
    await shot('p07-hatch');
    const s1 = await ev(() => ({ map: G.map?.def.id, p: [G.state.player.q, G.state.player.r] }));
    console.log('after hatch', JSON.stringify(s1), await ev(() => G.modal));
    // walk into the cave toward the rats
    await ev(async () => { const i = await DF.interact(); i.walkTo(28, 7); });
    for (let k = 0; k < 4; k++) { await wait(500); console.log(JSON.stringify(await ev(() => ({ p: [G.state.player.q, G.state.player.r], path: G.state.player._path?.length, mv: !!G.state.player._move, inMap: G.map.actors.includes(G.state.player), scr: G.screen })))); }
    await wait(2000);
    await ev(async () => { const i = await DF.interact(); i.walkTo(23, 10); });
    await wait(3000);
    await shot('p08-cave');
    console.log('combat?', await ev(() => !!G.combat));
    const r = await fightAll();
    console.log('fight result', JSON.stringify(r), await ev(() => [G.state.player.hp, G.state.player.xp]));
    await shot('p09-afterfight');
    const log = await ev(() => (window).DF && G.state && document.querySelector('#hud .log').innerText);
    console.log(log);
    await ev(async () => { const t = await DF.travel(); t.exitToWorld(); });
    await wait(800);
    await shot('p10-world');
  }
} catch (e) {
  console.log('ERROR', e);
}
console.log(errors.length ? errors.join('\n') : 'no errors');
await browser.close();
await server.close();
process.exit(0);
