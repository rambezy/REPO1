// Headless balance checks of a new band's first fights. Each start's people
// are made as a new game makes them and fight, a dozen times over on open
// ground, what the roads send them in their first days (sim/worldsim
// fitAgainst): the four matchups that matter most are held to a win rate,
// the rest are shown for comparison, and every fight must have both sides
// swinging (no one frozen out of reach) and end in knockouts more often than
// deaths. Each matchup has its own seeds, so the table reads the same every
// run. (Grown from the balance probe of the first review, with its swing
// counts from the duel probes.) More trials give a truer rate.
// Usage: npx tsx tools/balancetest.ts [trials]
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, DAY, HOUR } from '../src/sim/clock';
import { RNG, hashStr } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep, updateActivation } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { structuresIn, townRings } from '../src/sim/structures';
import { Squad } from '../src/sim/squad';
import { makePerson, makeAnimal } from '../src/sim/spawn';
import { makeItem } from '../src/sim/inventory';
import { fitAgainst, levelUnder, playerBand, trimTo, cutToFit } from '../src/sim/worldsim';
import { raidParty, type RaidKind } from '../src/sim/raids';
import { loadoutFor } from '../src/content/loadouts';
import { SCENARIO } from '../src/content/scenarios';
import { ITEM } from '../src/content/items';
import { RACE } from '../src/content/races';
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

const TRIALS = +(process.argv[2] ?? 30); // fewer and a fair matchup fails by the luck of the draw
const DT = 0.1, LIMIT = 300;
const player = new Squad(); player.faction = 'player'; player.kind = 'player'; player.name = 'Test'; W.addSquad(player); W.playerSquads.push(player.id);
let rng = new RNG(1);

/** A start's people, made as a new game makes them (see game/newgame makePlayerPerson). */
function startBand(key: string): Char[] {
  return SCENARIO[key].people.map((p) => {
    const race = p.races ? rng.pick(p.races) : rng.pick(['valefolk', 'valefolk', 'duneborn']);
    const c = makePerson(W, { faction: 'drifters', role: p.role ?? 'wanderer', race, level: p.level, loadout: p.loadout, whole: true }, rng);
    for (const [id, n] of p.kit ?? []) if (ITEM[id]) c.inv.add(id, n);
    if (p.weapon && ITEM[p.weapon] && c.eq.weapon?.id !== p.weapon) { c.eq.weapon2 = c.eq.weapon; c.eq.weapon = makeItem(p.weapon, 1, 1 + Math.floor(rng.next() * 2)); }
    for (const l of p.lost ?? []) { c.body.lost |= 1 << l; c.body.hp[l] = 0; }
    for (const [l, id] of p.prost ?? []) if (ITEM[id]?.limb) { c.body.lost |= 1 << l; c.body.prost[l] = id; c.body.hp[l] = c.body.max[l]; }
    if (!RACE[c.look.race].boots) c.eq.feet = null;
    if (!RACE[c.look.race].helmets) c.eq.head = null;
    c.faction = 'player'; c.role = 'player';
    W.moveToSquad(c, player);
    return c;
  });
}

type Foes = () => Char[];
/** A squad for the other side, past talking (the toll refused, the demand turned down). */
const band = (faction: string, kind: Squad['kind'] = 'raid') => { const s = new Squad(); s.faction = faction; s.kind = kind; s.name = faction; s.spoke = true; s.flags.settled = 0; W.addSquad(s); return s; };
/** `n` of a people's fighters as they come, any day. */
const asTheyCome = (faction: string, role: any, n: number): Foes => () => {
  const sq = band(faction);
  for (let i = 0; i < n; i++) W.moveToSquad(makePerson(W, { faction, role }, rng), sq);
  return sq.members.map((id) => W.char(id)!);
};
/** `n` of a people's fighters as the roads send them against the player's band on `day`, before any are sent home to fit (see fitAgainst). */
const fitted = (faction: string, role: any, n: number, day = 1): Foes => () => {
  const sq = band(faction);
  const fit = fitAgainst(playerBand(), faction, day, rng);
  const key = fit.loadout ?? loadoutFor(faction, role);
  for (let i = 0; i < n; i++) W.moveToSquad(makePerson(W, { faction, role, level: fit.level !== undefined ? levelUnder(key, fit.level, rng) : undefined, loadout: fit.loadout }, rng), sq);
  return sq.members.map((id) => W.char(id)!);
};
/** A whole band of passers-by as the roads send it on `day`: fitted, then trimmed to the band's measure (nobody, if even one is too much). */
const road = (faction: string, role: any, n: [number, number], species?: string, day = 1): Foes => () => {
  const sq = band(species ? 'fauna' : faction, species ? 'herd' : 'raid');
  const fit = fitAgainst(playerBand(), faction, day, rng);
  const key = fit.loadout ?? loadoutFor(faction, role);
  for (let i = Math.min(rng.int(n[0], n[1]), fit.n); i > 0; i--) {
    const c = species ? makeAnimal(W, species, rng) : makePerson(W, { faction, role, level: fit.level !== undefined ? levelUnder(key, fit.level, rng) : undefined, loadout: fit.loadout }, rng);
    W.moveToSquad(c, sq);
  }
  if (!trimTo(sq, fit)) return [];
  return sq.members.map((id) => W.char(id)!);
};
/** A roaming band as the world makes it, any size its kind comes in, cut down as it nears a new band in its first days (see worldsim fitEarly). */
const roaming = (faction: string, role: any, n: [number, number], day = 1): Foes => () => {
  const sq = band(faction);
  for (let i = rng.int(n[0], n[1]); i > 0; i--) W.moveToSquad(makePerson(W, { faction, role }, rng), sq);
  if (!cutToFit(sq, fitAgainst(playerBand(), faction, day, rng))) return [];
  return sq.members.map((id) => W.char(id)!);
};
/** The first raid on the band's base. */
const firstRaid = (kind: RaidKind): Foes => () => raidParty(band(kind.faction), kind, 12, true, rng);

function clear() {
  for (const c of [...W.chars.values()]) W.removeChar(c);
  for (const s of [...W.squads.values()]) if (s !== player) W.squads.delete(s.id);
  player.members.length = 0;
}
const place = (cs: Char[], dx: number) => cs.forEach((c, i) => {
  c.x = ax + dx + (i % 3) * 1.5; c.z = az + Math.floor(i / 3) * 1.5; c.y = T.heightAt(c.x, c.z); c.homeX = c.x; c.homeZ = c.z;
  c.hunger = 300; c.thinkT = rng.next() * 0.6;
});

interface Row { label: string; won: number; routed: number; fought: number; refused: number; t: number; swings: [number, number]; frozen: number; losses: number; deathLosses: number; ourKO: number; ourDead: number; foes: number }

/** Fights a start against what `foes` makes, `TRIALS` times over: each fight up to five minutes, or until one side is down. */
function matchup(label: string, start: string, foes: Foes): Row {
  // each matchup on its own seeds, so the table does not shift when another is added
  rng = new RNG(hashStr(label));
  S.rng = new RNG(hashStr(label) ^ 0x5eed);
  const row: Row = { label, won: 0, routed: 0, fought: 0, refused: 0, t: 0, swings: [0, 0], frozen: 0, losses: 0, deathLosses: 0, ourKO: 0, ourDead: 0, foes: 0 };
  for (let k = 0; k < TRIALS; k++) {
    clear();
    S.clock.t = DAY + 10 * HOUR; // day 1, mid-morning
    const ours = startBand(start);
    const theirs = foes();
    if (!theirs.length) { row.refused++; continue; }
    place(ours, 0);
    place(theirs, 14);
    // both sides spoiling for it: no talk of tolls, and the player's people told to attack
    for (const c of theirs) { c.mem.enemies = ours.map((o) => o.id); c.brain.enemy = ours[0].id; }
    for (const c of ours) c.order = { k: 'attack', id: theirs[0].id };
    updateActivation({ x: ax, z: az });
    const sw = [0, 0], was = new Map<number, string>();
    // won when they are all down, or the rest have broken and run
    const beaten = () => theirs.every((c) => !c.up || (c.brain.flee && !c.brain.enemy));
    let t = 0;
    while (t < LIMIT && ours.some((c) => c.up) && !beaten()) {
      simStep(DT, { x: ax, z: az });
      tickSquads(DT);
      t += DT;
      // a swing is an attack begun; a shot counts as one for those who fight at range
      for (const [side, cs] of [[0, ours], [1, theirs]] as const) for (const c of cs) {
        const now = c.atk ? 'atk' : c.act === 'shoot' ? 'shoot' : '';
        if (now && now !== was.get(c.id)) sw[side]++;
        was.set(c.id, now);
      }
    }
    row.fought++;
    row.t += t;
    row.foes += theirs.length;
    row.swings[0] += sw[0]; row.swings[1] += sw[1];
    if (!sw[0] || !sw[1]) row.frozen++;
    if (ours.some((c) => c.up) && beaten()) { row.won++; if (theirs.some((c) => c.up)) row.routed++; }
    else { row.losses++; if (ours.some((c) => c.status === 'dead')) row.deathLosses++; }
    row.ourKO += ours.filter((c) => c.status === 'ko').length;
    row.ourDead += ours.filter((c) => c.status === 'dead').length;
  }
  return row;
}

const pct = (r: Row) => (r.fought ? Math.round((r.won / r.fought) * 100) : 0);
const results: [string, boolean, string][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok, info]); };
const rows: Row[] = [];
const run = (label: string, start: string, foes: Foes, aim?: [number, number]) => {
  const r = matchup(label, start, foes);
  rows.push(r);
  if (aim) check(`${label}: wins ${aim[1] < 100 ? `${aim[0]}-${aim[1]}` : `at least ${aim[0]}`}%`, r.fought > 0 && pct(r) >= aim[0] && pct(r) <= aim[1], `${r.won}/${r.fought}`);
  return r;
};

const REAVER_RAID: RaidKind = { faction: 'reavers', role: 'bandit', demand: 'tribute', n: [5, 10], name: 'Dust Reavers' };
const STARVELING_RAID: RaidKind = { faction: 'starvelings', role: 'bandit', demand: 'food', n: [6, 14], name: 'Starvelings' };

const t0 = Date.now();
// held to a win rate
run('Wanderer vs one starveling', 'wanderer', asTheyCome('starvelings', 'bandit', 1), [50, 100]);
run('Wanderer vs one day-1 Reaver', 'wanderer', fitted('reavers', 'bandit', 1), [25, 60]);
run('Three Hired Blades vs four day-1 Reavers', 'blades', fitted('reavers', 'bandit', 4), [55, 100]);
run('Horned Pilgrims vs three day-1 Reavers', 'karuk', fitted('reavers', 'bandit', 3), [35, 100]);
run('Deserters vs a roaming starveling band met on day 1', 'deserters', roaming('starvelings', 'bandit', [5, 12]), [50, 100]);
// shown for comparison: what each start meets on its first days' roads, and the first raid on a homestead
run('Wanderer vs day-1 Reavers on the road', 'wanderer', road('reavers', 'bandit', [4, 9]));
run('Wanderer vs day-1 dunehounds on the road', 'wanderer', road('fauna', 'animal', [3, 7], 'dunehound'));
run('Freeholders vs day-1 starvelings on the road', 'freeholders', road('starvelings', 'bandit', [5, 12]));
run('Freeholders vs their first raid (Reavers)', 'freeholders', firstRaid(REAVER_RAID));
run('Freeholders vs their first raid (starvelings)', 'freeholders', firstRaid(STARVELING_RAID));
run('Hired Blades vs day-1 Reavers on the road', 'blades', road('reavers', 'bandit', [4, 9]));
run('Horned Pilgrims vs day-1 Reavers on the road', 'karuk', road('reavers', 'bandit', [4, 9]));
run('Old Iron vs day-1 Sentinels on the road', 'constructs', road('machines', 'construct', [2, 3]));

// mid-game: seasoned bands against what the roads send them later, each fight followed two minutes past
// its end, so that whoever bleeds out or is finished on the ground is counted. Blows land heavier now (see
// combat's BLOW); the dead must stay as rare as they were, which the blows on the fallen and the cap on a
// single blow see to.
const mercs = (level: number, n: number) => Array.from({ length: n }, () => { const c = makePerson(W, { faction: 'drifters', role: 'merc', race: 'valefolk', level, loadout: 'merc', whole: true }, rng); c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, player); return c; });
const reavers = (level: number, n: number) => { const sq = band('reavers'); return Array.from({ length: n }, () => { const c = makePerson(W, { faction: 'reavers', role: 'bandit', race: 'duneborn', level, loadout: 'reavers_bandit' }, rng); W.moveToSquad(c, sq); return c; }); };
interface Mid { label: string; fights: number; withDeath: number; dead: number; deadAfter: number; t: number[] }
function midgame(label: string, mineL: number, mineN: number, foeL: number, foeN: number, trials = TRIALS): Mid {
  const m: Mid = { label, fights: 0, withDeath: 0, dead: 0, deadAfter: 0, t: [] };
  for (let k = 0; k < trials; k++) {
    clear();
    rng = new RNG(hashStr(label + k)); S.rng = new RNG(hashStr(label + k) ^ 0x5eed);
    S.clock.t = DAY + 10 * HOUR;
    const a = mercs(mineL, mineN), b = reavers(foeL, foeN);
    place(a, 0); place(b, 10);
    for (const c of b) { c.mem.enemies = a.map((o) => o.id); c.brain.enemy = a[0].id; }
    for (const c of a) { c.mem.enemies = b.map((o) => o.id); c.order = { k: 'attack', id: b[0].id }; }
    updateActivation({ x: ax, z: az });
    const standing = (cs: Char[]) => cs.some((c) => c.up && !c.brain.flee);
    let t = 0;
    while (t < LIMIT && standing(a) && standing(b)) { simStep(DT, { x: ax, z: az }); tickSquads(DT); t += DT; }
    m.fights++; m.t.push(t);
    const dead = () => [...a, ...b].filter((c) => c.status === 'dead').length;
    m.dead += dead();
    for (let after = 0; after < 120; after += DT) { simStep(DT, { x: ax, z: az }); tickSquads(DT); }
    const d = dead();
    m.deadAfter += d;
    if (d) m.withDeath++;
  }
  return m;
}
const mid = [midgame('Four level-30 mercs vs five level-22 Reavers', 30, 4, 22, 5), midgame('Four level-20 mercs vs four level-20 Reavers', 20, 4, 20, 4)];
check('mid-game losses are knockouts, not deaths: no more than one fight in three has a death, two minutes after', mid.every((m) => m.withDeath <= m.fights / 3), mid.map((m) => `${m.label}: ${m.deadAfter} dead (${m.dead} by the end) in ${m.withDeath} of ${m.fights} fights, median ${[...m.t].sort((p, q) => p - q)[Math.floor(m.t.length / 2)].toFixed(0)} s`).join('; '));
// ...but rare is not never: a lopsided brawl must still leave someone dead, or a later change could quietly
// make death impossible (the floor on blows to the falling, the cap on a single blow, and what the finishers do).
const brawl = midgame('Eight level-32 mercs vs twelve level-18 Reavers', 32, 8, 18, 12, Math.min(TRIALS, 8));
check('a lopsided brawl still kills: at least one of the fallen is dead two minutes after', brawl.deadAfter >= 1, `${brawl.deadAfter} dead (${brawl.dead} by the end) in ${brawl.withDeath} of ${brawl.fights} fights`);
run('Scrap and Sinew vs day-1 rustspiders on the road', 'scrappers', road('fauna', 'animal', [2, 5], 'rustspider'));
run('Deserters vs day-1 Sentinels on the road', 'deserters', road('machines', 'construct', [2, 3]));
run('Deserters vs day-1 Reavers on the road', 'deserters', road('reavers', 'bandit', [4, 9]));
run('Wanderer vs a roaming starveling band met on day 1', 'wanderer', roaming('starvelings', 'bandit', [5, 12]));
run('Wanderer vs one Reaver as they come (camps, later days)', 'wanderer', asTheyCome('reavers', 'bandit', 1));

// stripping off for the road does not make the roads kinder: a band is weighed in the best kit it carries
{
  clear();
  rng = new RNG(hashStr('stripped'));
  const ours = startBand('blades');
  const dressed = fitAgainst(playerBand(), 'reavers', 1, rng).budget;
  let packed = 0;
  for (const c of ours) for (const slot of ['weapon', 'body'] as const) {
    const it = c.eq[slot];
    if (it && c.inv.put(it)) { c.eq[slot] = null; packed++; }
  }
  const worn = ours.reduce((n, c) => n + c.power(), 0);
  const stripped = fitAgainst(playerBand(), 'reavers', 1, rng).budget;
  check('stripping off for the road does not shrink what the roads send', packed >= 4 && stripped >= dressed * 0.99,
    `${packed} weapons and coats packed away; budget ${Math.round(dressed)} dressed, ${Math.round(stripped)} stripped (by what they wear alone it would be ${Math.round(worn * 1.5)})`);
  clear();
}

console.log(`trials per matchup: ${TRIALS}, fights up to ${LIMIT} s on open ground at ${ax}, ${az}\n`);
console.log(`${'matchup'.padEnd(56)} ${'won'.padStart(9)}  ${'foes'.padStart(4)}  ${'avg'.padStart(5)}  swings us:them  KO/dead (ours)  losses by death`);
for (const r of rows) {
  const won = r.fought ? `${r.won}/${r.fought} ${String(pct(r)).padStart(3)}%` : 'never sent';
  const extra = (r.routed ? `  (${r.routed} won by a rout)` : '') + (r.refused ? `  (${r.refused} too much for the band: not sent)` : '');
  console.log(`${r.label.padEnd(56)} ${won.padStart(9)}  ${(r.fought ? (r.foes / r.fought).toFixed(1) : '-').padStart(4)}  ${(r.fought ? `${Math.round(r.t / r.fought)} s` : '-').padStart(5)}  ${`${Math.round(r.swings[0] / Math.max(1, r.fought))}:${Math.round(r.swings[1] / Math.max(1, r.fought))}`.padStart(14)}  ${`${r.ourKO}/${r.ourDead}`.padStart(14)}  ${`${r.deathLosses}/${r.losses}`.padStart(15)}${extra}`);
}
console.log('');
const frozen = rows.reduce((n, r) => n + r.frozen, 0), fights = rows.reduce((n, r) => n + r.fought, 0);
check('both sides swing in every fight', frozen === 0, `${frozen} of ${fights} fights had a side that never swung`);
const bad = rows.filter((r) => r.losses && r.deathLosses * 2 >= r.losses);
check('most losses are knockouts, not deaths', !bad.length, bad.length ? bad.map((r) => `${r.label}: ${r.deathLosses}/${r.losses}`).join('; ') : `${rows.reduce((n, r) => n + r.deathLosses, 0)} of ${rows.reduce((n, r) => n + r.losses, 0)} losses had a death`);
for (const [label, ok, info] of results) console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`);
const failed = results.filter((r) => !r[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed (${((Date.now() - t0) / 1000).toFixed(0)} s).`);
if (failed.length) process.exitCode = 1;
