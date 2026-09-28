export default async function (g) {
  await g.newGame('Janek');
  await g.auto(true);
  await g.choose('Get off me');
  await g.waitFor("o.G.mode === 'play' && !o.G.controlLocked", 30000, 'opening');
  await g.obi("(o.S.flags.raid_started = true, o.quests.completeQuest('main_prologue'), o.acts.startAct1(), true)");
  await g.drain(60000);
  await g.obi("(o.quests.startQuest('main_crowstone', 'trail'), o.give('half_seal'), true)");
  await g.tp('overworld', 26, 172);
  for (let i = 0; i < 12; i++) {
    const st = await g.obi("({ hp: Math.round(o.G.player.hp), mode: o.G.mode, near: o.near(220).map(a => a.id + (a.hostile ? '!' : '') + '@' + a.tx + ',' + a.ty).join(' '), dlg: o.dialogue() && o.dialogue().text })");
    g.log(JSON.stringify(st));
    if (st.dlg) break;
    await g.sleep(700);
  }
  await g.tp('overworld', 26, 168);
  for (let i = 0; i < 8; i++) {
    const st = await g.obi("({ hp: Math.round(o.G.player.hp), mode: o.G.mode, near: o.near(220).map(a => a.id + (a.hostile ? '!' : '') + '@' + a.tx + ',' + a.ty).join(' '), dlg: o.dialogue() && o.dialogue().text, trig: o.S.flags['trig:a1_deserters'] })");
    g.log(JSON.stringify(st));
    await g.sleep(700);
  }
}
