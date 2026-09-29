// Regression: trading from a conversation must hand control back afterwards
// (closing the wares used to leave the game stuck in dialogue mode).
export default async function (g) {
  await g.newGame('Janek');
  await g.auto(true);
  await g.drain(90000);
  await g.obi('(o.state.S.flags.act = 9, o.state.S.minutes = 12*60, true)');
  await g.obi(`o.goto('matej')`);
  await g.sleep(800);
  await g.auto(false);
  await g.talk('matej');
  // advance lines until the choice list appears, then pick trade
  for (let i = 0; i < 40; i++) {
    const d = await g.dialogue();
    if (d && d.choices && d.choices.length) break;
    await g.page.keyboard.press('KeyE');
    await g.sleep(300);
  }
  g.log('choices', JSON.stringify((await g.dialogue())?.choices));
  const ok = await g.obi(`o.pick("Let's trade")`);
  g.log('picked trade', ok);
  await g.sleep(800);
  g.log('while trading', JSON.stringify(await g.obi('({ mode: o.G.mode, locked: o.G.controlLocked, screen: !!document.querySelector(".screen") })')));
  await g.page.keyboard.press('Escape');
  await g.sleep(800);
  const st = await g.obi('({ mode: o.G.mode, locked: o.G.controlLocked, screen: !!document.querySelector(".screen") })');
  g.log('after closing', JSON.stringify(st));
  const x0 = await g.obi('o.G.player.x');
  await g.page.keyboard.down('KeyD'); await g.sleep(700); await g.page.keyboard.up('KeyD');
  const x1 = await g.obi('o.G.player.x');
  g.log('moved', (x1 - x0).toFixed(1));
  if (Math.abs(x1 - x0) < 2) throw new Error('player frozen after trade');
}
