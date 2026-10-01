// Act I from the morning after the raid to the report that opens Act II.
export default async function (g) {
  await g.newGame('Janek');
  await g.auto(true);
  await g.choose('Get off me');
  await g.waitFor("o.G.mode === 'play' && !o.G.controlLocked", 30000, 'opening');
  await g.obi("(o.S.flags.raid_started = true, o.quests.completeQuest('main_prologue'), o.acts.startAct1(), true)");
  await g.drain(60000, ['Who were they']);
  g.log('act1 start', JSON.stringify(await g.quests()));
  // burial
  await g.tp('overworld', 54, 89);
  await g.drain(60000, ['He was a good man']);
  g.log(JSON.stringify(await g.quests()));
  // the forge hearthstone
  await g.tp('overworld', 52, 99);
  await g.use('hb_forge');
  await g.drain(60000, ['myself']);
  g.log(JSON.stringify(await g.quests()), await g.obi("o.S.inv.map(s=>s.id).join(',')"));
  // the fox and apron
  await g.tp('overworld', 30, 103);
  await g.use('hb_fox');
  await g.drain(20000);
  await g.tp('overworld', 60, 110);
  await g.use('hb_apron');
  await g.drain(20000);
  g.log(JSON.stringify(await g.quests()));
  await g.shot('a1-01-ruins');
  // the camp
  await g.tp('overworld', 122, 135);
  await g.drain(60000);
  await g.shot('a1-02-camp');
  g.log(JSON.stringify(await g.quests()));
  await g.obi("o.goto('marta')");
  await g.sleep(500);
  await g.talk('marta');
  await g.drain(60000, ['It\'s me', 'lie']);
  await g.shot('a1-03-tent');
  g.log(JSON.stringify(await g.quests()));
  // Wenda and Hanka
  await g.obi("o.goto('hanka')");
  await g.sleep(500);
  await g.talk('hanka');
  await g.drain(30000);
  await g.obi("o.goto('wenda')");
  await g.sleep(500);
  await g.talk('wenda');
  await g.drain(30000);
  await g.shot('a1-04-wenda');
  g.log(JSON.stringify(await g.quests()));
  // brew (simulated) and give the remedy
  await g.obi("(o.give('feverwort_remedy'), true)");
  await g.sleep(500);
  await g.obi("o.goto('marta')");
  await g.sleep(500);
  await g.talk('marta');
  await g.drain(30000);
  g.log(JSON.stringify(await g.quests()));
  await g.obi("(o.S.minutes += 12 * 60, true)");
  await g.sleep(1500);
  await g.talk('marta');
  await g.drain(60000, ['bring her home']);
  await g.shot('a1-05-mother');
  g.log(JSON.stringify(await g.quests()));
  // leave the tent; Mother moves to Linden Hill
  await g.tp('overworld', 124, 139);
  await g.sleep(1500);
  // Bertram
  await g.tp('lh_keep', 8, 12);
  await g.drain(30000, ['Shout past him']);
  await g.obi("o.goto('bertram')");
  await g.sleep(400);
  await g.talk('bertram');
  await g.drain(60000, ['my sister']);
  await g.shot('a1-06-bertram');
  g.log(JSON.stringify(await g.quests()));
  await g.obi("o.goto('ondrej')");
  await g.sleep(400);
  await g.talk('ondrej');
  await g.drain(20000);
  await g.sleep(1500);
  for (let i = 0; i < 3; i++) await g.obi("(o.emit('perfect_block'), true)");
  await g.sleep(1500);
  await g.drain(30000);
  g.log(JSON.stringify(await g.quests()));
  // Crow's Stone
  await g.tp('overworld', 74, 66);
  await g.use('crowstone_fire');
  await g.drain(60000);
  await g.shot('a1-07-crowstone');
  g.log(JSON.stringify(await g.quests()), 'dog', await g.obi('o.S.dog.owned'));
  // deserters
  await g.tp('overworld', 26, 169);
  await g.sleep(800);
  await g.drain(60000, ['Show the half seal', 'will you fight']);
  await g.shot('a1-08-deserters');
  g.log(JSON.stringify(await g.quests()));
  // report
  await g.obi("o.goto('bertram')");
  await g.sleep(400);
  await g.talk('bertram');
  await g.drain(90000, ['have it']);
  await g.shot('a1-09-act2');
  g.log(JSON.stringify(await g.quests()), 'act', await g.obi('o.S.flags.act'));
}
