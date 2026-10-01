// Act III: allies, Harrow, the siege, Dieter, Lothar, Lida and the epilogue.
export default async function (g) {
  await g.newGame('Janek');
  await g.auto(true);
  await g.choose('Get off me');
  await g.waitFor("o.G.mode === 'play' && !o.G.controlLocked", 30000, 'opening');
  await g.obi(`(() => {
    const S = o.S; S.flags.raid_started = true; o.quests.completeQuest('main_prologue');
    Object.assign(S.flags, { act: 2, hb_state: 'ruined', father_buried: true, mother_found: true, mother_cured: true, mother_moved: true, hanka_moved: true, crumb_found: true, knighted: true, deserters_allied: true, jirka_done: true, 'c:miners_paid': true, 'c:danced_hanka': true });
    S.dog.owned = true;
    for (const q of ['main_ashes','main_mother','main_bertram','main_crowstone','main_blade','main_silver','main_pavel','main_feast','side_charcoal','side_wolves','side_bell','side_miners']) o.quests.completeQuest(q);
    o.give('fathers_sword'); o.inventory.equip('fathers_sword'); o.give('ravenstone_plan'); o.give('wooden_fox'); o.give('lida_drawing'); o.give('foreman_ledger'); o.give('harrow_orders');
    S.rel.hanka = 14;
    o.world.rebuildMap('overworld'); o.world.enterMap('overworld', 'linden');
    o.acts.startAct3(); return true; })()`);
  await g.sleep(3000);
  g.log('act3', JSON.stringify(await g.quests()));
  for (const who of ['kuba', 'tomas_burner', 'jirka', 'matej', 'gregor']) {
    await g.obi(`o.goto('${who}')`); await g.sleep(500);
    await g.talk(who);
    await g.drain(30000, ['Will you fight with us']);
  }
  g.log('allies', await g.obi("['miners','burners','deserters','hunters','priory'].map(k => k + ':' + !!o.S.flags['ally_' + k]).join(' ')"));
  // Harrow
  await g.obi("o.goto('harrow')"); await g.sleep(600);
  await g.talk('harrow');
  await g.drain(60000, ['traitor to the crown', 'Then hear the truth']);
  g.log(JSON.stringify(await g.quests()), 'harrow_left', await g.obi('o.S.flags.harrow_left'));
  // Bertram: ready
  await g.obi("o.goto('bertram')"); await g.sleep(500);
  await g.talk('bertram');
  await g.drain(30000, ['Our allies are gathered', 'ready now']);
  g.log(JSON.stringify(await g.quests()));
  // the march
  await g.tp('overworld', 194, 42);
  await g.sleep(2500);
  await g.drain(60000, ['storm the gate']);
  await g.sleep(2000);
  await g.shot('a3-01-gate');
  g.log(JSON.stringify(await g.quests()));
  // clear the bailey
  await g.obi("(o.world.here().filter(a => a.tags.has('siege')).forEach(a => { a.hp = 0; a.dead = true; a.pose = 'dead'; }), true)");
  await g.tp('overworld', 194, 26);
  await g.sleep(2500);
  await g.drain(60000, ['Stand back']);
  await g.shot('a3-02-dieter');
  await g.obi("(o.world.findActor('dieter').hp = 5, true)");
  await g.sleep(2500);
  await g.drain(60000, ['Go. Get out of this valley']);
  g.log(JSON.stringify(await g.quests()));
  // the hall
  await g.tp('rv_hall', 8, 12);
  await g.sleep(2500);
  await g.drain(60000, ['answer for Hollowbrook']);
  await g.sleep(1500);
  await g.obi("(o.world.findActor('lothar').hp = 10, true)");
  await g.sleep(2500);
  await g.drain(60000, ["justice"]);
  await g.shot('a3-03-lothar');
  g.log(JSON.stringify(await g.quests()));
  // the kitchen
  await g.tp('rv_kitchen', 6, 8);
  await g.sleep(2500);
  await g.shot('a3-04-lida');
  await g.drain(180000, ['Tell her the truth']);
  await g.sleep(3000);
  await g.shot('a3-05-epilogue');
  g.log(JSON.stringify(await g.quests()), 'act', await g.obi('o.S.flags.act'), JSON.stringify(await g.where()));
}
