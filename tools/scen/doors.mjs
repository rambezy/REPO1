// Regression: nobody arrives inside furniture or a wall, and every door can
// be walked to. Checks every map the world can build:
// - each room's arrival spot (and each "_out" spot outside) is clear ground
// - from the arrival spot the way out can be walked to
// - the Ravenstone postern (an Act III route) can be reached on foot
export default async function (g) {
  await g.page.goto(g.url);
  await g.page.waitForSelector('#title .btn');
  await g.sleep(1500);
  const problems = await g.page.evaluate(() => {
    const W = window.__obi.world, out = [];
    const clear = (m, x, y) => !m.blocked(x - 5, y - 6, x + 5, y);
    // breadth-first walk with the player's own collision box on a 4-unit lattice
    const walk = (m, sx, sy, tx, ty, reach, box) => {
      const S = 4, key = (i, j) => i * 100003 + j;
      const start = m.nearestFree(sx, sy, 5, 6, 8) || { x: sx, y: sy };
      const q = [[Math.round(start.x / S), Math.round(start.y / S)]], seen = new Set([key(...q[0])]);
      for (let h = 0; h < q.length && h < 200000; h++) {
        const [i, j] = q[h];
        if (Math.hypot(i * S - tx, j * S - ty) <= reach) return true;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ni = i + di, nj = j + dj, k = key(ni, nj);
          if (seen.has(k)) continue;
          seen.add(k);
          const x = ni * S, y = nj * S;
          if (box && (x < box[0] || y < box[1] || x > box[2] || y > box[3])) continue;
          if (clear(m, x, y)) q.push([ni, nj]);
        }
      }
      return false;
    };
    const at = (x, y) => `${(x / 16).toFixed(1)},${(y / 16).toFixed(1)}`;
    for (const id of W.mapIds()) {
      const m = W.getMap(id);
      const doors = m.objects.filter((o) => o.interact && o.interact.type === 'door' && !o.hidden);
      if (!m.outdoor && m.spawns.door) {
        const d = m.spawns.door;
        if (!clear(m, d.x, d.y)) out.push(`${id}: you arrive inside ${m.solidsOverlapping(d.x - 5, d.y - 6, d.x + 5, d.y).map((o) => o.type || o.kind).join(', ') || 'a wall'} at ${at(d.x, d.y)}`);
        for (const x of doors) if (!walk(m, d.x, d.y, x.x, x.y - 4, 26)) out.push(`${id}: the way out at ${at(x.x, x.y)} cannot be walked to`);
      }
      for (const [name, sp] of Object.entries(m.spawns)) {
        if (name.endsWith('_out') && !clear(m, sp.x, sp.y)) out.push(`${id}: leaving by '${name}' puts you inside ${m.solidsOverlapping(sp.x - 5, sp.y - 6, sp.x + 5, sp.y).map((o) => o.type || o.kind).join(', ') || 'a wall'} at ${at(sp.x, sp.y)}`);
      }
    }
    // the postern route into Ravenstone, from where the army gathers
    const ow = W.getMap('overworld');
    const post = ow.objects.find((o) => o.key === 'rv_postern');
    const from = ow.spawns.ravenstone;
    if (!post || !from) out.push('overworld: the postern or the Ravenstone approach is missing');
    else if (!walk(ow, from.x, from.y, post.x + 10, post.y - 4, 22, [160 * 16, 0, 230 * 16, 60 * 16])) out.push(`overworld: the postern at ${at(post.x, post.y)} cannot be reached on foot`);
    return out;
  });
  for (const p of problems) g.log(p);
  if (problems.length) throw new Error(problems.length + ' door problem(s)');
  g.log('every door clear and reachable');
}
