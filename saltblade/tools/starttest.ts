// Headless check of the first hours of the starts, each a new game as the
// new-game screen makes it, run through the sim. The Wanderer, the
// Freeholders and the Deserters each have a fight named for "Win a fight"
// within half an hour of it opening, a short walk off (the Deserters' on
// the way to Hardcoin), and the band is in it within two hours of the start,
// and done with it before long; who wins is the balance test's to hold to a
// rate. Setting off for Hardcoin at once instead, the Deserters find the
// fight waiting on the way they walk, and meet it before they get there. The Deserters find a fellow deserter at Hardcoin's bar who joins for
// nothing. Chain-Bound and Nothing Left, who have no fight to win, are sent
// none; walking into Brokenchain starving, with no food and no chits, they
// are fed once by the Unchained, whoever of them they ask (a drinker, Tunde
// the Runaway, Iyabo herself), and eat.
// Usage: npx tsx tools/starttest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, DAY, HOUR } from '../src/sim/clock';
import { RNG } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { structuresIn, townRings } from '../src/sim/structures';
import { G } from '../src/state';
import { newGame } from '../src/game/newgame';
import { tickPopulation } from '../src/game/world';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { tickEncounters } from '../src/sim/encounters';
import { tickWorld, beatableNear } from '../src/sim/worldsim';
import { tickHunters } from '../src/sim/hunters';
import { giveOrder } from '../src/sim/orders';
import { treeFor, choose, starving, say, type DCtx } from '../src/sim/dialogue';
import { makeItem } from '../src/sim/inventory';
import { tickStories } from '../src/sim/stories';
import { recruit } from '../src/sim/dialogue';
import { setupObjectives, tickObjectives, objectiveView } from '../src/ui/objectives';
import { OBJECTIVES } from '../src/content/objectives';
import type { Char } from '../src/sim/char';

// storage: none here, and none needed, but the game's settings look for it
const store = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, String(v)), removeItem: (k: string) => void store.delete(k) } });

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
nav.structures = structuresIn;
nav.rings = townRings;
// just enough of the game around the world for a new game to begin in
const cam = { target: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0.6, dist: 40, wantYaw: 0, wantPitch: 0, wantDist: 40, follow: null as unknown, lookAt(x: number, z: number, d: number) { cam.target.x = x; cam.target.z = z; cam.dist = d; } };
const notices: string[] = [];

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const hm = (t: number) => (t < 0 ? 'never' : `${Math.floor((t % DAY) / HOUR)}:${String(Math.floor((t % HOUR) / 60)).padStart(2, '0')}`);
const mins = (a: number, b: number) => Math.round((b - a) / 60);

let wired = false;
/** A new game of a start, with the goals named done as a player who got there would have done them. */
function begin(key: string, done: string[] = [], seed = 7) {
  const W = new World();
  Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(seed), time: 0 });
  S.weather = new Weather();
  S.weather.seed();
  S.fx = { ...S.fx, notice: (t: string) => { notices.push(t); }, say: () => {}, sound: () => {}, burst: () => {}, hit: (d: Char, a: Char) => { if (firstBlow < 0 && (d?.faction === 'player' || a?.faction === 'player') && d !== a) { firstBlow = S.clock.t; firstFoe = d?.faction === 'player' ? a : d; } }, shot: () => {}, died: () => {}, ko: () => {} } as typeof S.fx;
  Object.assign(G, { T, nav, W, seed: 1337, mode: 'play', speed: 1, lastSpeed: 1, settings: {}, cam, structViews: { clear() {}, W }, charViews: { clear() {} } });
  newGame(key);
  if (!wired) { setupObjectives(); wired = true; }
  for (const k of done) W.flags.objectives.done[k] = S.clock.t;
  firstBlow = -1; firstFoe = null;
  return W;
}
let firstBlow = -1, firstFoe = null as Char | null;
const DT = 0.1;
/** Runs the game for up to `secs` of game time, or until `stop` says so. */
function play(secs: number, stop: () => boolean = () => false) {
  const until = S.clock.t + secs;
  for (let i = 0; S.clock.t < until; i++) {
    const l = S.W.playerChars().find((c) => c.alive && c.up) ?? S.W.playerChars()[0];
    simStep(DT, { x: l.x, z: l.z });
    tickSquads(DT);
    tickEncounters(DT);
    tickWorld(DT);
    tickHunters(DT); // (as the game runs them: their squads and the road's share a world)
    if (i % 5 === 0) { tickPopulation(0.5); tickObjectives(); if (stop()) return true; }
  }
  return stop();
}
const up = () => S.W.playerChars().filter((c) => c.alive && c.up);
const done = (k: string) => S.W.flags.objectives?.done?.[k] !== undefined;

// ---------------------------------------------------------------- the first fight of the starts that have one to win
const FIGHTS: [string, string, string[]][] = [
  ['wanderer', 'The Wanderer', ['reach', 'barkeep']],
  ['freeholders', 'Freeholders', ['farm', 'build', 'eat']],
  ['deserters', 'Deserters', []],
];
for (const [key, name, before] of FIGHTS) {
  const W = begin(key, before);
  const t0 = S.clock.t;
  const lead = up()[0];
  const hardcoin = T.sites.find((s) => s.settlement === 'hardcoin')!;
  // the tracker's line, as a player reads it
  let named = null as ReturnType<typeof beatableNear>;
  play(40 * 60, () => { named = beatableNear(); return !!named && named.why === 'near' && !!W.flags.fightOffer; });
  const tn = S.clock.t;
  const offer = W.flags.fightOffer ? W.squads.get(W.flags.fightOffer) : undefined;
  const foes = offer ? offer.members.map((id) => W.char(id)).filter((c): c is Char => !!c && c.up) : [];
  const off = foes[0] ? Math.hypot(foes[0].x - lead.x, foes[0].z - lead.z) : 0;
  const ahead = foes[0] && key === 'deserters' ? ((foes[0].x - lead.x) * (hardcoin.x - lead.x) + (foes[0].z - lead.z) * (hardcoin.z - lead.z)) / (off * Math.hypot(hardcoin.x - lead.x, hardcoin.z - lead.z)) : 1;
  check(`${name}: "Win a fight" names a fight within half an hour, a short walk off${key === 'deserters' ? ', on the way to Hardcoin' : ''}`,
    !!named && !!offer && mins(t0, tn) <= 30 && off >= 200 && off <= 520 && ahead > 0.5,
    named ? `${hm(tn)}: ${named!.n} ${named!.name}, ${Math.round(off)} m off${key === 'deserters' ? `, ${Math.round(Math.acos(Math.min(1, ahead)) * 57.3)}° off the way to Hardcoin` : ''}` : `nothing by ${hm(tn)}`);
  // the player clicks the line and sends everyone at them
  for (const c of up()) giveOrder(c, { k: 'attack', id: foes[0]?.id ?? 0 });
  const won = play(3 * HOUR, () => done('win') || !up().length || (foes.every((c) => !c.up) && !up().some((c) => c.order?.k === 'attack')));
  const ours = W.playerChars().map((c) => `${c.status} ${c.body.total().toFixed(2)}`).join(', ');
  check(`${name}: ...and the band is in the fight within two hours of the start, and done with it before long`,
    firstBlow > 0 && firstBlow - t0 <= 2 * HOUR && (won || !up().length) && S.clock.t - firstBlow <= 2 * HOUR,
    `first blow ${hm(firstBlow)}, ${done('win') ? 'won' : up().length ? 'not won' : 'lost'} at ${hm(S.clock.t)}; ours ${ours}`);
  // "Bandage a wound" comes after the fight: a wound from it is bandaged from what they carry (the Freeholders' too, far from their chest)
  if (OBJECTIVES[key].goals.some((g) => g.when.k === 'bandage')) {
    const hurt = up().find((c) => c.body.needsAid());
    const medic = up().find((c) => c !== hurt) ?? hurt;
    if (hurt && medic && !done('bandage')) giveOrder(medic, { k: 'aid', id: hurt.id });
    const ok = !hurt || play(HOUR, () => done('bandage'));
    check(`${name}: ...and a wound from it is bandaged from their own packs, and "Bandage a wound" is done`, ok && (!hurt || done('bandage')),
      hurt ? `${medic!.name} patched ${hurt.name}${done('bandage') ? '' : ': the goal still open'}` : 'nobody hurt, nothing to bandage');
  }
}

// ---------------------------------------------------------------- on the march: the Deserters set off for Hardcoin at once, and the road's fight waits on their way, face to face
{
  const W = begin('deserters');
  const t0 = S.clock.t;
  const hc = T.sites.find((s) => s.settlement === 'hardcoin')!;
  up().forEach((c, i) => { const s = nav.nearestOpen(hc.x + i * 1.5, hc.z, 8) ?? [hc.x, hc.z]; giveOrder(c, { k: 'move', x: s[0], z: s[1] }); });
  const there = () => up().some((c) => Math.hypot(c.x - hc.x, c.z - hc.z) < hc.r);
  // where the offer waited, how far off the way the lead had still to walk, and how far on along it
  let sent = '', off = Infinity, on = 0;
  play(4 * HOUR, () => {
    if (!sent && W.flags.fightOffer) {
      const q = W.squads.get(W.flags.fightOffer)!, f = W.char(q.members[0])!, l = up()[0];
      const way = l.path ? [l.x, l.z, ...l.path.pts.slice(l.path.idx * 2), ...l.path.coarse.slice(l.path.cidx * 2)] : [];
      for (let i = 0, run = 0; i + 3 < way.length; i += 2) {
        const ax = way[i], az = way[i + 1], bx = way[i + 2], bz = way[i + 3], len = Math.hypot(bx - ax, bz - az) || 1;
        const k = Math.max(0, Math.min(1, ((f.x - ax) * (bx - ax) + (f.z - az) * (bz - az)) / (len * len)));
        const d = Math.hypot(ax + (bx - ax) * k - f.x, az + (bz - az) * k - f.z);
        if (d < off) { off = d; on = run + k * len; }
        run += len;
      }
      sent = `${hm(S.clock.t)}: ${q.members.length} ${q.name}, ${Math.round(off)} m off their way, ${Math.round(on)} m on along it`;
    }
    return firstBlow > 0 || there();
  });
  const foe = firstFoe;
  const theirs = foe && W.flags.fightOffer && W.squadOf(foe)?.id === W.flags.fightOffer;
  check('Deserters, setting off for Hardcoin at once: the road\'s fight waits on the way they walk, out of sight a short walk on, and they meet it face to face before they get there, within two hours of the start',
    !!sent && off <= 10 && on >= 250 && on <= 520 && firstBlow > 0 && !!theirs && !there() && firstBlow - t0 <= 2 * HOUR,
    `${sent || 'nothing sent'}; ${firstBlow > 0 ? `first blow ${hm(firstBlow)}${foe ? ` with ${foe.name} (${foe.faction}${theirs ? ', the offer' : ''})` : ''}` : there() ? 'at Hardcoin, no fight on the way' : 'no fight'}`);
  // set upon, the player turns everyone on them
  if (foe) for (const c of up()) giveOrder(c, { k: 'attack', id: foe.id });
  const q = theirs ? W.squads.get(W.flags.fightOffer)! : undefined;
  const foes = q ? q.members.map((id) => W.char(id)).filter((c): c is Char => !!c) : [];
  const over = play(3 * HOUR, () => {
    if (done('win') || !up().length) return true;
    // the one they were sent at down: on the next, as the player would
    const next = foes.find((c) => c.up);
    if (!next) return !up().some((c) => c.order?.k === 'attack');
    for (const c of up()) if (c.order?.k !== 'attack') giveOrder(c, { k: 'attack', id: next.id });
    return false;
  });
  check('...and turning on them, they are done with it before long', over && (done('win') || !up().length), `${done('win') ? 'won' : up().length ? 'not won' : 'lost'} at ${hm(S.clock.t)}`);
}

// ---------------------------------------------------------------- the Deserters' recruit: three hundred chits hire nobody in Hardcoin
{
  const W = begin('deserters', ['reach', 'win', 'loot', 'sell', 'bandage']);
  const hardcoin = T.sites.find((s) => s.settlement === 'hardcoin')!;
  const ally = [...W.chars.values()].find((c) => c.recruitable && c.site === hardcoin.id && c.price === 0 && c.mem.backstory?.includes('Stonegate'));
  const bar = ally ? [...W.objs.values()].find((o) => o.kind === 'building' && o.site === hardcoin.id && Math.hypot(o.x - ally.x, o.z - ally.z) < Math.max(o.data?.w ?? 0, o.data?.d ?? 0)) : undefined;
  check('Deserters: a fellow deserter drinks at Hardcoin\'s bar on day one, sat on a stool of their own, and asks nothing to join',
    !!ally && !!ally.mem.using && W.objs.get(ally.mem.using)?.user === ally.id && !!bar,
    ally ? `${ally.name}, ${Math.round(Math.hypot(ally.x - hardcoin.x, ally.z - hardcoin.z))} m from the centre${bar ? ` in a ${bar.data?.name ?? bar.def}` : ''}` : 'nobody');
  const money = W.money;
  const p = up()[0];
  if (ally) { const [tree, at] = treeFor(ally, p); check('...the conversation is a recruit\'s, for free', at === 'start' && !!tree.ask && ally.price === 0); recruit({ p, n: ally, vars: {} }); }
  tickObjectives(); tickObjectives();
  check('...and joining them completes "Recruit someone" with the 300 chits still in the purse', done('recruit') && W.money === money && money === 300, `${W.money} chits`);
}

// ---------------------------------------------------------------- no fight to win, none sent; and at Brokenchain, fed once
for (const [key, name, hunger] of [['chainbound', 'Chain-Bound', 57], ['nothing', 'Nothing Left', 1]] as const) {
  const W = begin(key);
  play(HOUR);
  check(`${name}: with no fight yet the next goal (shackled, or bleeding in the ash), the road sends none`, !W.flags.fightOffer && W.flags.offerAt === undefined);
  // walked into the reeds at last, starving, with nothing to eat and nothing to pay with
  const bc = T.sites.find((s) => s.settlement === 'brokenchain')!;
  const p = up()[0];
  const spot = nav.nearestOpen(bc.x + 4, bc.z + 4, 30)!;
  p.x = spot[0]; p.z = spot[1]; p.y = T.heightAt(p.x, p.z); p.path = null; p.hasGoal = false;
  p.shackled = false; delete p.mem.enslavedBy; delete p.mem.slaveSite; p.bounty = {};
  p.hunger = hunger; W.money = 0;
  for (const g of [p.inv, p.eq.back?.inv]) if (g) g.items.length = 0;
  play(5 * 60); // (the camp fills in as they come near, and they stand among its people)
  p.hunger = hunger; for (const g of [p.inv, p.eq.back?.inv]) if (g) g.items.length = 0;
  const local = [...W.chars.values()].filter((c) => c.faction === 'unchained' && c.alive && c.up && c.site === bc.id && !c.recruitable).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
  const n = local[0];
  const talk = (who: Char) => { const [tree, at] = treeFor(who, p); const ctx: DCtx = { p, n: who, vars: {} }; return { tree, ctx, ch: (tree[at].ch ?? []).find((c) => (!c.if || c.if(ctx)) && /nothing to eat/i.test(say(c.t, ctx))) }; };
  const first = n ? talk(n) : null;
  check(`${name}: starving at Brokenchain with no food and no chits, the Unchained can be asked for a meal`, starving() && !!first?.ch, n ? `${n.name}, ${n.role}${first?.ch ? '' : ': no such choice'}` : 'nobody about');
  // whoever of them is asked, whatever else they would talk about: a runaway who would join, the Voice with her story
  tickStories(2);
  const tunde = [...W.chars.values()].find((c) => c.unique === 'tunde_runaway' && c.alive && c.faction === 'unchained');
  const voice = [...W.chars.values()].find((c) => c.mem.story === 'brokenchain' && c.alive);
  check('...and so can Tunde the Runaway, and Iyabo, the Voice of Brokenchain', !!tunde && !!talk(tunde).ch && !!voice && !!talk(voice).ch,
    `${tunde ? `${tunde.name}: ${talk(tunde).ch ? 'yes' : 'no such choice'}` : 'no Tunde'}; ${voice ? `${voice.name}: ${talk(voice).ch ? 'yes' : 'no such choice'}` : 'no Voice'}`);
  let said = '';
  if (first?.ch) { const next = choose(first.tree, first.ch, first.ctx); said = next ? say(first.tree[next].t, first.ctx) : ''; }
  const bread = p.inv.count('dustbread') + (p.eq.back?.inv?.count('dustbread') ?? 0);
  check('...and they are fed, in Iyabo\'s name, with a word that beasts are meat', bread === 3 && /Iyabo/.test(said) && /meat/.test(said), `${bread} dustbread: "${said.slice(0, 60)}..."`);
  const ate = play(20 * 60, () => done('eat'));
  check('...which they eat, and "Eat something" is done', ate && p.hunger >= hunger + 30, `hunger ${hunger} -> ${Math.round(p.hunger)}${ate ? ', eaten' : ', the goal still open'}`);
  for (const g of [p.inv, p.eq.back?.inv]) if (g) g.items.length = 0;
  p.hunger = hunger;
  const again = [...local, tunde, voice].filter((c): c is Char => !!c).map((c) => talk(c)).some((t) => !!t.ch);
  check('...once: hungry again, nobody there feeds them a second time', starving() && !again);
  void objectiveView;
}

// ---------------------------------------------------------------- the hunt: Chain-Bound and Nothing Left have a first fight too
// "Hunt something to eat", once it is the next goal: the road brings a lame beast with meat on it, a short walk
// off; the hunter goes after it, and brought down, cuts it open (who wins is the balance test's to hold to a
// rate). Chain-Bound free and fed at Brokenchain, with the spear the Unchained gave with the meal; Nothing Left
// in the ash, one-armed and bare-handed, the bleeding stopped.
for (const [key, name, before] of [['chainbound', 'Chain-Bound', ['shackles', 'sneak', 'escape', 'brokenchain', 'talk', 'eat']], ['nothing', 'Nothing Left', ['clot', 'road', 'sneak']]] as const) {
  const W = begin(key, [...before]);
  const p = up()[0];
  p.shackled = false; delete p.mem.enslavedBy; delete p.mem.slaveSite; p.bounty = {};
  p.body.bleed.fill(0);
  if (key === 'chainbound') {
    const bc = T.sites.find((x) => x.settlement === 'brokenchain')!;
    const spot = nav.nearestOpen(bc.x + 4, bc.z + 4, 30)!;
    p.x = spot[0]; p.z = spot[1]; p.y = T.heightAt(p.x, p.z); p.path = null; p.hasGoal = false;
    p.eq.weapon = makeItem('spear', 1);
  }
  const t0 = S.clock.t;
  let named = null as ReturnType<typeof beatableNear>;
  play(HOUR, () => { named = beatableNear(300, 900, true); return !!named && !!W.flags.fightOffer; });
  const offer = W.flags.fightOffer ? W.squads.get(W.flags.fightOffer) : undefined;
  const beast = offer ? W.char(offer.members[0]) : undefined;
  const off = beast ? Math.hypot(beast.x - p.x, beast.z - p.z) : 0;
  check(`${name}: once "Hunt something to eat" is next, the tracker names a lame beast with meat on it within the hour, a short walk off`,
    !!beast?.animal && !!named?.one?.startsWith('lame') && beast.inv.count('raw_meat') > 0 && mins(t0, S.clock.t) <= 60 && off >= 200 && off <= 520,
    beast ? `${hm(S.clock.t)}: a ${named?.one ?? beast.name}, ${Math.round(off)} m off, ${beast.inv.count('raw_meat')} raw meat on it` : `nothing by ${hm(S.clock.t)}`);
  // the player clicks the line, and goes after it; brought down, they cut it open
  if (beast) giveOrder(p, { k: 'attack', id: beast.id });
  const down = !!beast && play(3 * HOUR, () => !beast.up || !p.up);
  if (beast && !beast.up && p.up) giveOrder(p, { k: 'loot', id: beast.id });
  const cut = !!beast && !beast.up && p.up && play(30 * 60, () => done('hunt'));
  check(`${name}: ...is at it within two hours of the hunt opening, and done with it before long: brought down, cut open, and "Hunt something to eat" done (or the hunter beaten)`,
    down && firstBlow > 0 && firstBlow - t0 <= 2 * HOUR && (beast!.up ? !p.up : cut), `first blow ${hm(firstBlow)}; ${!beast ? 'no beast' : beast.up ? (p.up ? 'not brought down' : 'the hunter went down') : done('hunt') ? `down, butchered by ${hm(S.clock.t)}` : 'down, not butchered'}`);
}

const failed = results.filter((x) => !x[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
