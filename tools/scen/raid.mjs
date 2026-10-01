// Jumps to the night of the raid and plays through to the start of Act I.
export default async function (g) {
  await g.newGame('Janek');
  await g.auto(true);
  await g.choose('Five more');
  await g.waitFor("o.G.mode === 'play' && !o.G.controlLocked", 30000, 'opening');
  await g.obi("(o.quests.setStage('main_prologue', 'night'), o.S.minutes = 23.3 * 60, true)");
  await g.tp('hb_home', 1, 7);
  await g.use('bed_straw');
  await g.waitFor("!!o.world.findActor('home_merc') && o.G.mode === 'play' && !o.G.controlLocked", 60000, 'house fight');
  await g.shot('r01-housefight');
  await g.obi("(o.world.findActor('home_merc').hp = 1, true)");
  await g.sleep(300);
  await g.key('KeyJ', 60);
  await g.sleep(2500);
  await g.obi("(()=>{ const m = o.world.findActor('home_merc'); if (m && !m.dead) { m.hp = 0; m.dead = true; } return true; })()");
  await g.choose('I\'ll bring Father', 30000);
  await g.waitFor("o.G.map.id === 'overworld' && o.G.mode === 'play' && !o.G.controlLocked", 30000, 'outside');
  await g.sleep(800);
  await g.shot('r02-burning');
  g.log(JSON.stringify(await g.where()), JSON.stringify(await g.quests()));
  await g.tp('overworld', 43, 102);
  await g.waitFor("o.G.controlLocked", 20000, 'father scene');
  await g.sleep(4000);
  await g.shot('r03-green');
  await g.waitFor("o.G.mode === 'play' && !o.G.controlLocked && !!o.world.findActor('dieter_raid')", 60000, 'dieter fight');
  await g.shot('r04-dieter');
  await g.obi("(o.G.player.hp = 3, true)");
  await g.waitFor("o.S.flags.act === 1", 120000, 'act 1');
  await g.sleep(1500);
  await g.shot('r05-act1');
  await g.drain(60000, ['Who were they']);
  await g.shot('r06-ruins');
  g.log(JSON.stringify(await g.where()), JSON.stringify(await g.quests()));
}
