// Saves, reloads the page and continues, in the prologue and in Act I.
export default async function (g) {
  await g.newGame('Radka');
  await g.auto(true);
  await g.choose('Get off me');
  await g.waitFor("o.G.mode === 'play' && !o.G.controlLocked", 30000, 'opening');
  await g.sleep(1500);
  const saved = await g.ev(() => !!localStorage.getItem('obi_save_auto'));
  g.log('autosaved after opening:', saved);
  await g.page.reload();
  await g.page.waitForSelector('#title .btn');
  await g.page.locator('#title .btn', { hasText: 'Continue' }).click();
  await g.waitFor("o.G.mode === 'play'", 15000, 'continue');
  await g.auto(true);
  await g.sleep(1000);
  g.log('after load:', JSON.stringify(await g.where()), JSON.stringify(await g.quests()), 'name', await g.obi('o.S.playerName'));
  g.log('marta here:', await g.obi("!!o.world.here().find(a => a.charId === 'marta')"), 'crumb:', await g.obi("!!o.world.findActor('crumb')"));
  await g.shot('sl-01-prologue');
  // into Act I, save, reload
  await g.obi("(o.S.flags.raid_started = true, o.quests.completeQuest('main_prologue'), o.acts.startAct1(), true)");
  await g.drain(60000);
  await g.sleep(2500);
  await g.page.reload();
  await g.page.waitForSelector('#title .btn');
  await g.page.locator('#title .btn', { hasText: 'Continue' }).click();
  await g.waitFor("o.G.mode === 'play'", 15000, 'continue 2');
  await g.sleep(1500);
  g.log('act1 load:', JSON.stringify(await g.where()), JSON.stringify(await g.quests()), 'hb', await g.obi('o.S.flags.hb_state'));
  g.log('tobiah:', await g.obi("!!o.world.findActor('tobiah')"), 'body:', await g.obi("!!o.world.findActor('radek_body')"));
  await g.shot('sl-02-act1');
}
