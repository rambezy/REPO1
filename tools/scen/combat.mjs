// Regression: combat feel.
// - a click with nobody to hit does not swing at the air
// - through a sparring exchange (fists, then a sword) the weapon arm moves
//   continuously: no frame-to-frame jump faster than a real swing
export default async function (g) {
  await g.newGame('Janek');
  await g.auto(true);
  await g.drain(90000);
  await g.obi('(o.state.S.flags.act = 9, o.state.S.minutes = 12*60, true)');
  // somewhere quiet: nobody but the dog within reach
  for (const [x, y] of [[70, 118], [96, 112], [86, 62], [128, 118], [60, 96]]) {
    await g.tp('overworld', x, y);
    await g.sleep(900);
    if ((await g.obi('o.near(80).filter((a) => a.id !== "crumb").length')) === 0) break;
  }

  const click = (dx, dy) => g.page.evaluate(({ dx, dy }) => {
    const G = window.__obi.G, p = G.player, cv = G.canvas;
    const x = (p.x + dx - G.cam.x) * G.scale, y = (p.y + dy - G.cam.y) * G.scale;
    cv.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
    cv.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0, bubbles: true }));
    setTimeout(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0, bubbles: true })), 40);
  }, { dx, dy });

  // nobody near: the click should do nothing
  const near = await g.obi('o.near(80).filter((a) => a.id !== "crumb").length');
  if (near === 0) {
    await click(30, -10);
    await g.sleep(150);
    const phase = await g.obi('o.G.player.combat.phase');
    g.log('empty click ->', phase);
    if (phase !== 'none') throw new Error('swung at the air: ' + phase);
  } else g.log('skipped the empty-click check: someone is near');

  const spar = async (label) => {
    await g.obi(`o.goto('havel')`);
    await g.sleep(300);
    await g.obi(`(() => { const a = o.world.findActor('havel'); const p = o.G.player; a.hostile = true; a.mem.spar = true; a.mem.nonlethal = true; a.mem.target = 'player'; a.mem.alerted = true; a.mem.schedule = undefined; a.hp = a.maxHp = 999; a.x = p.x + 24; a.y = p.y; return true; })()`);
    await g.sleep(300);
    const r = await g.page.evaluate(async () => {
      const o = window.__obi, G = o.G, p = G.player, cv = G.canvas;
      const WP = await import('/src/systems/weaponPose.ts');
      const HANG = Math.PI / 2;
      const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; };
      let prev = null, prevT = 0, worst = 0, worstAt = '', attacks = 0, n = 0, lastPhase = '';
      await new Promise((res) => {
        const f = () => {
          if (n % 16 === 2) {
            const hv = o.world.findActor('havel');
            const x = (hv.x - G.cam.x) * G.scale, y = (hv.y - 12 - G.cam.y) * G.scale;
            cv.dispatchEvent(new MouseEvent('mousemove', { clientX: x, clientY: y, bubbles: true }));
            cv.dispatchEvent(new MouseEvent('mousedown', { clientX: x, clientY: y, button: 0, bubbles: true }));
            setTimeout(() => window.dispatchEvent(new MouseEvent('mouseup', { clientX: x, clientY: y, button: 0, bubbles: true })), 40);
          }
          if (p.combat.phase === 'windup' && lastPhase !== 'windup') attacks++;
          lastPhase = p.combat.phase;
          const wp = WP.weaponPose(p, true);
          const a = wp && wp.armA !== null ? wp.armA : HANG;
          const t = G.clock;
          if (prev !== null && t > prevT) {
            const jump = Math.abs(wrap(a - prev));
            const speed = jump / (t - prevT);
            if (jump > 0.5 && speed > worst) { worst = speed; worstAt = `${p.combat.phase} ${jump.toFixed(2)}rad in ${((t - prevT) * 1000).toFixed(0)}ms`; }
          }
          prev = a; prevT = t;
          if (++n < 150) requestAnimationFrame(f); else res();
        };
        requestAnimationFrame(f);
      });
      return { worst, worstAt, attacks };
    });
    g.log(label, 'attacks', r.attacks, 'fastest arm jump', r.worst.toFixed(1), 'rad/s', r.worstAt);
    if (r.attacks < 2) throw new Error(label + ': the clicks did not attack');
    // the quickest real motion is a heavy strike's arc, about 40 rad/s
    if (r.worst > 60) throw new Error(label + ': the arm snapped: ' + r.worstAt);
  };
  await spar('fists');
  await g.obi(`(o.give('arming_sword', 1), true)`);
  await g.page.evaluate(async () => { const I = await import('/src/systems/inventory.ts'); I.equip('arming_sword'); I.refreshEquipment(); });
  await spar('sword');
}
