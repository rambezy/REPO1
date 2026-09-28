// Brews the Feverwort Remedy at Wenda's bench through the real alchemy UI.
export default async function (g) {
  await g.newGame('Janek');
  await g.auto(true);
  await g.choose('Get off me');
  await g.waitFor("o.G.mode === 'play' && !o.G.controlLocked", 30000, 'opening');
  await g.obi(`(() => { const S = o.S; S.flags.raid_started = true; o.quests.completeQuest('main_prologue'); S.flags.act = 1;
    o.quests.startQuest('main_mother', 'gather'); S.recipes.push('feverwort_remedy');
    o.give('willow_bark'); o.give('feverfew'); o.give('angelica'); return true; })()`);
  g.log(JSON.stringify(await g.quests()));
  await g.tp('wenda_hut', 7, 7);
  await g.use('alchemy');
  await g.sleep(800);
  const click = async (label, row) => {
    if (row) {
      const r = g.page.locator('.inv-row', { hasText: row });
      await r.locator('button', { hasText: label }).click();
    } else await g.page.locator('.screen button', { hasText: label }).first().click();
    await g.sleep(150);
  };
  await click('Pour water');
  await click('Pot', 'Willow Bark');
  await click('Boil');
  await click('Mortar', 'Feverfew');
  await click('Mortar', 'Angelica');
  for (let i = 0; i < 3; i++) await click('Grind');
  await click('Add to cauldron');
  await click('Boil');
  await g.shot('alch-01');
  await click('Bottle it');
  await g.sleep(500);
  g.log('inventory:', await g.obi("o.S.inv.map(s => s.id + 'x' + s.n).join(',')"), JSON.stringify(await g.quests()));
  const ok = await g.obi("o.S.inv.some(s => s.id === 'feverwort_remedy') && o.S.quests.main_mother.stage === 'give'");
  if (!ok) throw new Error('remedy not brewed or stage not advanced');
}
