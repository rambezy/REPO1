// Headless checks of the body and combat model, somewhere quiet in the
// waste: a duel to the knockout, wounds that bleed, blood loss, a limb cut
// off, a knockout slept off, crossbow fire, skills that grow from use, a
// faction that sours when its people are beaten, and bandits that go for
// the player's people on sight.
// Usage: npx tsx tools/combattest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR } from '../src/sim/clock';
import { RNG } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { structuresIn, townRings } from '../src/sim/structures';
import { applyDamage, shoot } from '../src/sim/combat';
import { LI } from '../src/sim/body';
import { SK } from '../src/sim/skills';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import type { Char } from '../src/sim/char';

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(99), time: 0 });
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
S.fx = { ...S.fx, notice: () => {}, say: () => {} } as typeof S.fx;

// flat, open ground well away from anywhere
let ax = 0, az = 0;
search: for (let z = 1500; z < 14000; z += 400) for (let x = 1500; x < 14000; x += 400) {
  if (T.heightAt(x, z) < 2 || T.slopeAt(x, z) > 0.15 || !T.sites.every((s) => Math.hypot(s.x - x, s.z - z) > s.r + 500)) continue;
  let open = true;
  for (let dx = -30; dx <= 30 && open; dx += 3) for (let dz = -30; dz <= 30 && open; dz += 3) open = nav.walkable(x + dx, z + dz) && T.slopeAt(x + dx, z + dz) < 0.3;
  if (open) { ax = x; az = z; break search; }
}
if (!ax) throw new Error('no open ground');
console.log(`arena at ${ax}, ${az} in ${T.regionAt(ax, az).key}`);

const player = new Squad(); player.faction = 'player'; player.kind = 'player'; player.name = 'Test'; W.addSquad(player); W.playerSquads.push(player.id);
const rng = new RNG(5);
function person(faction: string, role: any, dx: number, dz: number, extra: Record<string, unknown> = {}): Char {
  const c = makePerson(W, { faction: faction === 'player' ? 'drifters' : faction, role, level: 30, ...extra } as any, rng);
  if (faction === 'player') { c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, player); }
  c.x = ax + dx; c.z = az + dz; c.y = T.heightAt(c.x, c.z); c.homeX = c.x; c.homeZ = c.z;
  c.hunger = 300;
  return c;
}
const dt = 0.1;
const step = (secs: number) => { for (let i = 0; i < secs / dt; i++) { simStep(dt, { x: ax, z: az }); tickSquads(dt); } };
const results: [string, boolean, string][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok, info]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const hurt = (c: Char) => [...c.body.max].reduce((n, m, i) => n + Math.max(0, m - c.body.hp[i]), 0);
const clearArena = () => { for (const c of [...W.chars.values()]) if (c.faction !== 'player' || c.squad === player.id) W.removeChar(c); player.members.length = 0; };

// 1. a duel to the knockout, and what the fighters learn from it
{
  const a = person('player', 'player', 0, 0, { loadout: 'merc' });
  const b = person('reavers', 'bandit', 2.5, 0);
  const before = [SK.melee_atk, SK.melee_def, SK.toughness].map((k) => a.sk[k]);
  let bled = 0, t = 0;
  while (a.up && b.up && t < 600) { step(1); t++; bled = Math.max(bled, a.body.bleeding(), b.body.bleeding()); }
  const loser = a.up ? b : a;
  check('a melee duel ends in a knockout or a death', !a.up || !b.up, `${Math.round(t)} s; ${loser.name} ${loser.status}, ${hurt(loser).toFixed(0)} damage taken`);
  check('blows land on the body parts and open bleeding wounds', hurt(a) + hurt(b) > 40 && bled > 0, `worst bleeding ${bled.toFixed(2)}/s`);
  const after = [SK.melee_atk, SK.melee_def, SK.toughness].map((k) => a.sk[k]);
  check('fighting trains attack, defence and toughness', after.some((v, i) => v > before[i]), `atk ${before[0].toFixed(1)} -> ${after[0].toFixed(1)}, def ${before[1].toFixed(1)} -> ${after[1].toFixed(1)}, tough ${before[2].toFixed(1)} -> ${after[2].toFixed(1)}`);
  clearArena();
}

// 2. an untreated wound drains blood until it clots, or the bleeder dies
{
  const c = person('drifters', 'resident', 0, 0);
  applyDamage(c, LI.stomach, 55, 0, null, 1.6, false);
  applyDamage(c, LI.larm, 40, 0, null, 1.6, false);
  const blood0 = c.body.blood, bleed0 = c.body.bleeding();
  let t = 0;
  while (c.alive && c.body.bleeding() > 0.01 && t < 6 * HOUR) { step(10); t += 10; }
  check('open wounds bleed and the bleeding stops (clotting) or kills', bleed0 > 0 && c.body.blood < blood0 && (c.body.bleeding() <= 0.01 || !c.alive),
    `bled ${(blood0 - c.body.blood).toFixed(0)} of ${blood0.toFixed(0)} blood over ${(t / 60).toFixed(0)} min; now ${c.status}`);
  clearArena();
}

// ...while a light cut clots by itself
{
  const c = person('drifters', 'resident', 0, 0);
  applyDamage(c, LI.larm, 14, 0, null, 1, false);
  const blood0 = c.body.blood, bleed0 = c.body.bleeding();
  let t = 0;
  while (c.alive && c.body.bleeding() > 0.005 && t < 2 * HOUR) { step(5); t += 5; }
  check('a light cut stops bleeding on its own', bleed0 > 0 && c.alive && c.body.bleeding() <= 0.005, `bleeding ${bleed0.toFixed(2)}/s at first; lost ${(blood0 - c.body.blood).toFixed(0)} blood; ${c.status} after ${(t / 60).toFixed(1)} min`);
  clearArena();
}

// 3. a limb hacked past its limit comes off
{
  const c = person('drifters', 'resident', 0, 0);
  let hits = 0;
  while (!(c.body.lost & (1 << LI.rarm)) && hits < 200) { applyDamage(c, LI.rarm, 60, 10, null, 0, false); hits++; }
  check('a limb beaten past its maximum can be severed', !!(c.body.lost & (1 << LI.rarm)), `${hits} blows; arm ${c.body.lost & (1 << LI.rarm) ? 'lost' : 'still on'}; now ${c.status}`);
  clearArena();
}

// 4. a knockout from blunt blows is slept off
{
  const c = person('drifters', 'resident', 0, 0);
  let hits = 0;
  while (c.up && hits < 50) { applyDamage(c, LI.head, 0, 20, null, 0, false); hits++; }
  const ko = c.status;
  let t = 0;
  while (c.status === 'ko' && t < 4 * HOUR) { step(10); t += 10; }
  check('a knockout wears off and the person gets up', ko === 'ko' && c.status === 'up', `knocked out after ${hits} blows, up again after ${(t / 60).toFixed(0)} min`);
  clearArena();
}

// 5. crossbow fire: bolts spent, hits taken, the shooter learns
{
  const s = person('player', 'player', 0, 0, { loadout: 'merc' });
  s.eq.ranged = { uid: 9001, id: 'bolt_thrower', q: 2, n: 1, x: 0, y: 0 } as any;
  s.inv.add('bolts', 30);
  const target = person('drifters', 'resident', 0, 22);
  target.combatMode = 'passive';
  const bolts0 = s.inv.count('bolts'), prec0 = s.sk[SK.precision], hp0 = hurt(target);
  let shots = 0, t = 0;
  while (shots < 8 && target.up && t < 400) { if (s.reload <= 0 && shoot(s, target)) shots++; step(0.5); t += 0.5; }
  check('a crossbow shoots, spends bolts and wounds its target', shots > 0 && s.inv.count('bolts') === bolts0 - shots && hurt(target) > hp0, `${shots} shots, ${(hurt(target) - hp0).toFixed(0)} damage`);
  check('shooting trains precision', s.sk[SK.precision] > prec0, `${prec0.toFixed(1)} -> ${s.sk[SK.precision].toFixed(1)}`);
  clearArena();
}

// 6. beating a faction's people sours it
{
  const a = person('player', 'player', 0, 0, { loadout: 'merc' });
  const v = person('concord', 'resident', 1.5, 0);
  const r0 = W.rel.get('player', 'concord');
  let hits = 0;
  while (v.up && hits < 60) { applyDamage(v, LI.chest, 0, 25, a, 0, false); hits++; }
  check('knocking out a faction member lowers its regard for you', W.rel.get('player', 'concord') < r0, `concord ${r0} -> ${W.rel.get('player', 'concord')}`);
  clearArena();
}

// 7. bandits go for the player's people on sight
{
  const p = person('player', 'player', 0, 0, { loadout: 'merc' });
  const band = new Squad(); band.faction = 'reavers'; band.kind = 'raid'; band.name = 'Reavers'; W.addSquad(band);
  const bandits = [0, 1, 2].map((i) => { const c = person('reavers', 'bandit', 14 + i * 1.5, 4); W.moveToSquad(c, band); return c; });
  let t = 0;
  while (t < 60 && !bandits.some((b) => b.brain.enemy === p.id || b.target === p.id)) { step(1); t++; }
  const engaged = bandits.filter((b) => b.brain.enemy === p.id || b.target === p.id).length;
  step(20);
  check('bandits in sight pick a fight with the player', engaged > 0 && (hurt(p) > 0 || !p.up), `${engaged}/3 engaged within ${t} s; ${p.name} took ${hurt(p).toFixed(0)} damage`);
}

const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
