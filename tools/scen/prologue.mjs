// Plays the prologue from the title screen to the raid.
export default async function (g) {
  await g.newGame('Janek');
  await g.auto(true);
  await g.choose('Get off me');
  await g.waitFor("o.G.mode === 'play' && !o.G.controlLocked", 30000, 'opening scene end');
  await g.shot('p01-home');
  await g.talk('marta');
  await g.drain(20000, ['Havel, Bára']);
  for (const who of ['havel', 'bara', 'jiri']) {
    await g.obi(`o.goto('${who}')`);
    await g.sleep(500);
    await g.talk(who);
    await g.drain(30000, ['Tell me about the war', 'round them up', 'news from the pass']);
  }
  g.log(JSON.stringify(await g.quests()));
  await g.tp('overworld', 52, 100);
  await g.shot('p02-village');
  await g.talk('radek');
  await g.drain(20000, ['What are you working on']);
  await g.use('hb_forge');
  await g.sleep(1200);
  await g.shot('p03-forge');
  await g.key('Escape');
  await g.sleep(600);
  await g.drain(20000);
  g.log(JSON.stringify(await g.quests()), JSON.stringify(await g.where()));
  // Hanka's wreath
  await g.obi("o.goto('hanka')");
  await g.sleep(400);
  await g.talk('hanka');
  await g.drain(20000, ['whole meadow']);
  await g.obi("(o.inventory.addItem('cornflower'), o.inventory.addItem('chamomile'), o.inventory.addItem('stjohnswort'), o.emit('gather', 'stjohnswort'), true)");
  await g.talk('hanka');
  await g.drain(20000, ['brought your flowers', 'Ever']);
  // spar
  await g.obi("o.goto('pavel')");
  await g.sleep(400);
  await g.talk('pavel');
  await g.drain(20000, ['on']);
  await g.sleep(1500);
  await g.shot('p04-spar');
  await g.obi("(o.world.findActor('pavel').hp = 10, true)");
  await g.sleep(1500);
  await g.drain(20000, ['ring to it']);
  // Lida
  await g.obi("o.goto('lida')");
  await g.sleep(600);
  await g.shot('p05-foxden');
  await g.talk('lida');
  await g.drain(20000, ['Watch the foxes']);
  await g.tp('overworld', 43, 104);
  await g.sleep(2500);
  await g.drain(20000);
  g.log(JSON.stringify(await g.quests()), JSON.stringify(await g.where()));
  // dusk and the feast
  await g.waitFor("o.S.quests.main_prologue.stage === 'dusk'", 10000, 'dusk stage');
  await g.tp('overworld', 37, 101);
  await g.sleep(1500);
  await g.shot('p06-feast');
  await g.drain(90000, ['Take a run', 'Dance with Hanka', 'Sit with your family']);
  await g.shot('p07-afterfeast');
  g.log(JSON.stringify(await g.quests()), JSON.stringify(await g.where()));
  // bed and the raid
  await g.tp('hb_home', 1, 7);
  await g.use('bed');
  await g.sleep(1000);
  await g.drain(60000, ['Get off']);
  await g.shot('p08-raid-home');
  g.log(JSON.stringify(await g.where()));
}
