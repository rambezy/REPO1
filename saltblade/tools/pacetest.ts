// Headless checks of how a fight runs: two evenly matched beginners settle it
// in a readable number of blows and a reasonable time, blows reel and fell,
// nobody dies of a fair duel, and three against four spread into a ring of
// separate figures rather than a knot (sim/combat's weight and beat, sim/ai's
// lanes and sidesteps). Each fight is on open ground, a dozen times over, on
// fixed seeds, so the numbers read the same every run.
// Usage: npx tsx tools/pacetest.ts [trials]
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, DAY, HOUR, RATE } from '../src/sim/clock';
import { RNG, hashStr } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep, updateActivation } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { structuresIn, townRings } from '../src/sim/structures';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import type { Char } from '../src/sim/char';

let pass = 0, fail = 0;
const check = (name: string, ok: boolean, extra = '') => { if (ok) pass++; else fail++; console.log(`${ok ? 'ok ' : 'FAIL'} ${name}${extra ? ' · ' + extra : ''}`); };

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(99), time: 0 });
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const counts = { hits: 0, blocks: 0, dmg: 0 };
S.fx = { ...S.fx, notice: () => {}, say: () => {}, hit: (_c: Char, _by: Char, dmg: number, blocked: boolean) => { if (blocked) counts.blocks++; else if (dmg > 0) { counts.hits++; counts.dmg += dmg; } }, sound: () => {} } as typeof S.fx;

// flat, open ground well away from anywhere
let ax = 0, az = 0;
search: for (let z = 1500; z < 14000; z += 400) for (let x = 1500; x < 14000; x += 400) {
  if (T.heightAt(x, z) < 2 || T.slopeAt(x, z) > 0.15 || !T.sites.every((s) => Math.hypot(s.x - x, s.z - z) > s.r + 500)) continue;
  let open = true;
  for (let dx = -30; dx <= 30 && open; dx += 3) for (let dz = -30; dz <= 30 && open; dz += 3) open = nav.walkable(x + dx, z + dz) && T.slopeAt(x + dx, z + dz) < 0.3;
  if (open) { ax = x; az = z; break search; }
}
if (!ax) throw new Error('no open ground');

const TRIALS = +(process.argv[2] ?? 12);
const DT = 0.1, LIMIT = 600;
const player = new Squad(); player.faction = 'player'; player.kind = 'player'; player.name = 'Test'; W.addSquad(player); W.playerSquads.push(player.id);
let rng = new RNG(1);
const band = (faction: string) => { const s = new Squad(); s.faction = faction; s.kind = 'raid'; s.name = faction; s.spoke = true; s.flags.settled = 0; W.addSquad(s); return s; };
function clear() {
  for (const c of [...W.chars.values()]) W.removeChar(c);
  for (const s of [...W.squads.values()]) if (s !== player) W.squads.delete(s.id);
  player.members.length = 0;
}
const place = (cs: Char[], dx: number) => cs.forEach((c, i) => { c.x = ax + dx + (i % 3) * 1.5; c.z = az + Math.floor(i / 3) * 1.5; c.y = T.heightAt(c.x, c.z); c.homeX = c.x; c.homeZ = c.z; c.hunger = 300; c.thinkT = rng.next() * 0.6; });
const mine = (level: number, loadout: string, n: number) => { const out: Char[] = []; for (let i = 0; i < n; i++) { const c = makePerson(W, { faction: 'drifters', role: 'wanderer', race: 'valefolk', level, loadout, whole: true }, rng); c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, player); out.push(c); } return out; };
const theirs = (level: number, loadout: string, n: number) => { const sq = band('reavers'); const out: Char[] = []; for (let i = 0; i < n; i++) { const c = makePerson(W, { faction: 'reavers', role: 'bandit', race: 'duneborn', level, loadout }, rng); W.moveToSquad(c, sq); out.push(c); } return out; };
const med = (xs: number[]) => { const s = [...xs].sort((p, q) => p - q); return s[Math.floor(s.length / 2)]; };
const gameMin = (s: number) => (s * RATE / 60).toFixed(1);

interface Stats { firstKO: number[]; ends: number[]; swings: number[]; hits: number[]; dmg: number[]; knockdowns: number; staggers: number[]; deaths: number; nearest: number[]; }
/** Fights `ours` against `foes` TRIALS times; the nearest-neighbour distance among those on their feet is averaged over the fight. */
function fight(label: string, ours: () => Char[], foes: () => Char[]): Stats {
  rng = new RNG(hashStr(label)); S.rng = new RNG(hashStr(label) ^ 0x5eed);
  const st: Stats = { firstKO: [], ends: [], swings: [], hits: [], dmg: [], knockdowns: 0, staggers: [], deaths: 0, nearest: [] };
  for (let k = 0; k < TRIALS; k++) {
    clear();
    S.clock.t = DAY + 10 * HOUR;
    const a = ours(), b = foes();
    place(a, 0); place(b, 10);
    for (const c of b) { c.mem.enemies = a.map((o) => o.id); c.brain.enemy = a[0].id; }
    for (const c of a) c.order = { k: 'attack', id: b[0].id };
    updateActivation({ x: ax, z: az });
    counts.hits = counts.blocks = counts.dmg = 0;
    let t = 0, ko = -1, swings = 0, stag = 0, nearSum = 0, nearN = 0;
    const was = new Map<number, boolean>(), down = new Map<number, number>(), reeling = new Map<number, boolean>();
    const beaten = () => b.every((c) => !c.up || (c.brain.flee && !c.brain.enemy));
    while (t < LIMIT && a.some((c) => c.up) && !beaten()) {
      simStep(DT, { x: ax, z: az }); tickSquads(DT); t += DT;
      const all = [...a, ...b];
      for (const c of all) {
        const now = !!c.atk; if (now && !was.get(c.id)) swings++; was.set(c.id, now);
        if (c.knockT > 0 && !(down.get(c.id)! > 0)) st.knockdowns++; down.set(c.id, c.knockT);
        const r = c.stagger > 0; if (r && !reeling.get(c.id)) stag++; reeling.set(c.id, r);
        if (ko < 0 && c.status !== 'up') ko = t;
      }
      // how close the fighters stand, once the sides have met
      const up = all.filter((c) => c.up && c.drawn);
      if (up.length >= 4 && Math.round(t * 10) % 5 === 0) {
        for (const c of up) { let best = Infinity; for (const o of up) if (o !== c) best = Math.min(best, Math.hypot(o.x - c.x, o.z - c.z)); if (best < Infinity) { nearSum += best; nearN++; } }
      }
    }
    if ([...a, ...b].some((c) => c.status === 'dead')) st.deaths++;
    st.firstKO.push(ko < 0 ? t : ko); st.ends.push(t); st.swings.push(swings); st.hits.push(counts.hits); st.dmg.push(counts.hits ? counts.dmg / counts.hits : 0); st.staggers.push(stag);
    if (nearN) st.nearest.push(nearSum / nearN);
  }
  console.log(`${label}: first KO ${med(st.firstKO).toFixed(0)} s (${gameMin(med(st.firstKO))} game min), end ${med(st.ends).toFixed(0)} s; per fight ${med(st.swings)} swings, ${med(st.hits)} hits, ${med(st.dmg).toFixed(1)} damage a hit, ${med(st.staggers)} reels; ${st.knockdowns} knockdowns in ${TRIALS}; fights with a death ${st.deaths}${st.nearest.length ? `; nearest other fighter ${med(st.nearest).toFixed(2)} m` : ''}`);
  return st;
}

const duel = fight('two beginners (level 8, a wanderer\'s kit)', () => mine(8, 'drifters_wanderer', 1), () => theirs(8, 'drifters_wanderer', 1));
check('two beginners settle it in under a minute of the sim, and not in a flash', med(duel.firstKO) >= 12 && med(duel.firstKO) <= 60, `${med(duel.firstKO).toFixed(0)} s`);
check('...on no more than twenty-six landed blows (a flurry would not read)', med(duel.hits) <= 26, `${med(duel.hits)} hits`);
check('...each of which is felt: eighteen or more damage a blow', med(duel.dmg) >= 18, `${med(duel.dmg).toFixed(1)}`);
check('a blow reels its target', med(duel.staggers) >= med(duel.hits) * 0.7, `${med(duel.staggers)} reels for ${med(duel.hits)} hits`);
check('a fair duel puts someone down, never in the ground', duel.deaths === 0, `${duel.deaths} deaths`);
const vets = fight('two veterans (level 25, a bandit\'s kit)', () => mine(25, 'reavers_bandit', 1), () => theirs(25, 'reavers_bandit', 1));
check('veterans in armour take longer, and still nobody dies', med(vets.firstKO) >= med(duel.firstKO) * 0.8 && vets.deaths === 0, `${med(vets.firstKO).toFixed(0)} s, ${vets.deaths} deaths`);
const brawl = fight('three level-14 against four level-10 bandits', () => mine(14, 'reavers_bandit', 3), () => theirs(10, 'reavers_bandit', 4));
// (1.07 m before the fight's elbow room, lanes and sidesteps; a knot of seven stands nearer than a metre)
check('in a brawl the fighters keep more than a metre and a tenth from their nearest neighbour, on average', med(brawl.nearest) >= 1.1, `${med(brawl.nearest).toFixed(2)} m`);
check('a brawl has knockdowns in it', brawl.knockdowns >= TRIALS / 4, `${brawl.knockdowns} in ${TRIALS} fights`);
console.log(`${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
