// Headless check of the goals that pull you forward: every lawful town posts
// three to five jobs a day from its own seed, rated honestly against your
// band and tiered by standing; a job of each kind can be taken and finished
// (goods handed in, a parcel delivered, travellers walked to their gate, a
// quarry brought down or carried in, a camp emptied); deadlines, losses and
// walking away cost what the board said; the stories move step by step to
// their capstones; the Foundry wakes, sends fitted waves and is put to sleep;
// all of it survives a save, an older save without it still plays, and the
// land itself is built exactly as before.
// Usage: npx tsx tools/contracttest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR, DAY } from '../src/sim/clock';
import { RNG, hash3 } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { tickWorld, playerBand, threat } from '../src/sim/worldsim';
import { tickWorldEvents } from '../src/sim/worldevents';
import { tickRaids } from '../src/sim/raids';
import { structuresIn, townRings } from '../src/sim/structures';
import { buildTown } from '../src/world/towns';
import { buildSite } from '../src/world/sites';
import { SETTLEMENT } from '../src/content/layout';
import { populateTown, populateSite } from '../src/sim/populate';
import { postBounties } from '../src/sim/bounties';
import { markHousesForSale } from '../src/sim/property';
import { placeSite, finishSite, playerBase } from '../src/sim/base';
import { BUILDABLE } from '../src/content/buildables';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import { kill, knockOut } from '../src/sim/health';
import { pickUp } from '../src/sim/ai';
import { placeInto } from '../src/sim/use';
import { treeFor, choose, say, type DCtx } from '../src/sim/dialogue';
import { serialize, apply } from '../src/sim/save';
import { DEEDS } from '../src/sim/deeds';
import { ITEM } from '../src/content/items';
import { FACTION } from '../src/content/factions';
import { MARKETS } from '../src/content/markets';
import { TIERS, TIER_REACH, STORY, CRISIS } from '../src/content/contracts';
import { buyPrice, sellPrice, type Shop } from '../src/sim/shops';
import {
  openJobs, boardFor, forgetBoards, takeContract, abandonContract, tickContracts, activeContracts, contractsState, dangerOf, whyNot, currentGoal, goalMarks, boardTownOf,
  walkOf, FIRST_JOB_M, type Contract,
} from '../src/sim/contracts';
import { storyState, storyStates, setStoryStep, tickStories, storyViews } from '../src/sim/stories';
import { crisisState, wakeCrisis, sendWave, tickCrisis } from '../src/sim/crisis';
import { campLeft, findItem, siteById, sweepErrandFolk, roadRoute, routeLength, dangerAlong, dangerBetween, noviceBand } from '../src/sim/errands';
import { search } from '../src/sim/inspect';
import type { Char } from '../src/sim/char';
import type { Site } from '../src/world/terrain';

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
const W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(99), time: 0 });
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const notices: string[] = [];
S.fx = { ...S.fx, notice: (t: string) => { notices.push(t); }, say: () => {}, sound: () => {}, burst: () => {}, hit: () => {} } as typeof S.fx;
for (const site of T.sites) {
  if (site.kind === 'town') W.towns.set(site.id, buildTown(W, T, site, SETTLEMENT[site.settlement!], hash3(site.seed, 4321, 1)));
  else buildSite(W, T, site, new RNG(hash3(site.seed, 1234, 5)));
}
W.rebuildObjHash();

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };

// ---------------------------------------------------------------- the land is built exactly as before
/** A fold of the land and everything built on it (the same as the base commit's, recorded below). */
function worldHash(): number {
  let h = 2166136261 >>> 0;
  const mix = (v: number) => { h = Math.imul(h ^ (Math.round(v * 100) | 0), 16777619) >>> 0; };
  const mixS = (s: string) => { for (let i = 0; i < s.length; i++) mix(s.charCodeAt(i)); };
  for (const s of T.sites) { mix(s.id); mixS(s.key); mixS(s.kind); mix(s.x); mix(s.z); mix(s.r); mixS(s.faction ?? ''); }
  for (const r of T.roads) { mixS(r.a); mixS(r.b); mix(r.pts.length); for (let i = 0; i < r.pts.length; i += 37) mix(r.pts[i]); }
  for (let i = 0; i < T.h.length; i += 997) mix(T.h[i]);
  for (const o of [...W.objs.values()].filter((o) => o.id <= BUILT)) { mix(o.id); mixS(o.kind); mixS(o.def); mix(o.x); mix(o.z); }
  return h;
}
/** The hash the base commit's world builds to (seed 1337, before any of this existed). */
const BASE_HASH = 3150086283;
const BUILT = W.nextId - 1;
const hash0 = worldHash();
check('the land and its towns are built exactly as before (world hash matches the base commit)', hash0 === BASE_HASH && T.sites.length === 270 && T.roads.length === 40 && W.objs.size === 6780, `${hash0} vs ${BASE_HASH}, ${T.sites.length} sites, ${W.objs.size} objects`);

postBounties();
markHousesForSale();

// ---------------------------------------------------------------- helpers
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Test'; W.addSquad(sq); W.playerSquads.push(sq.id);
const rng = new RNG(11);
const site = (k: string) => T.sites.find((s) => s.key === k || s.settlement === k)!;
const towns = T.sites.filter((s) => s.kind === 'town');
const lawfulTowns = towns.filter((s) => FACTION[s.faction!]?.lawful);
const put = (c: Char, x: number, z: number) => { const p = nav.nearestOpen(x, z, 30) ?? [x, z]; c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z); c.path = null; c.hasGoal = false; };
function mine(level: number, x: number, z: number, loadout = 'merc'): Char {
  const c = makePerson(W, { faction: 'drifters', role: 'merc', level, loadout, whole: true }, rng);
  c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, sq);
  put(c, x, z); c.hunger = 280;
  return c;
}
const cr = site('crossroad');
const lead = mine(8, cr.x + 12, cr.z, 'drifters_wanderer');
W.money = 1000;
let focus = { x: lead.x, z: lead.z };
function step(secs: number, world = false) {
  for (let i = 0; i < secs / 0.1; i++) {
    simStep(0.1, focus); tickSquads(0.1);
    if (world) { tickWorld(0.1); tickWorldEvents(0.1); }
    tickRaids(0.1); tickContracts(0.1);
  }
}
const until = (cond: () => boolean, max: number, world = false) => { let t = 0; while (!cond() && t < max) { step(2, world); t += 2; } return cond() ? t : -1; };
const keeperOf = (s: Site): Char => {
  const info = W.towns.get(s.id);
  if (info && !W.populated.has(s.id)) populateTown(W, info);
  return [...W.chars.values()].find((c) => c.alive && boardTownOf(c)?.id === s.id)!;
};
/** A conversation, as the dialogue window runs it: a node's effect when shown, then its words and choices. */
function talk(n: Char, p: Char) {
  const [tree, start] = treeFor(n, p);
  const ctx: DCtx = { p, n, vars: {} };
  let node = start;
  tree[node].fx?.(ctx);
  const live = () => (tree[node]?.ch ?? []).filter((c) => !c.if || c.if(ctx));
  return {
    ctx,
    node: () => node,
    text: () => (tree[node] ? say(tree[node].t, ctx) : ''),
    opts: () => live().map((c) => say(c.t, ctx)),
    pick(t: string): boolean {
      const ch = live().find((c) => say(c.t, ctx).includes(t));
      if (!ch) return false;
      const next = choose(tree, ch, ctx);
      if (next === null) { node = ''; return true; }
      node = next;
      tree[node].fx?.(ctx);
      return true;
    },
  };
}
const standing = (f: string) => W.rel.get('player', f);
const jobsOf = (kind: string) => lawfulTowns.flatMap((s) => openJobs(s)).filter((c) => c.kind === kind);
const stats = () => contractsState();

// ---------------------------------------------------------------- every lawful town posts work
let n0 = 0, short = 0, bad = '';
const kinds = new Map<string, number>(), tiers = [0, 0, 0, 0];
for (const s of towns) {
  const jobs = openJobs(s);
  if (!FACTION[s.faction!]?.lawful) { if (jobs.length) bad = `${s.name} (outlaws) posts ${jobs.length}`; continue; }
  n0 += jobs.length;
  if (jobs.length < 3 || jobs.length > 5) short++;
  for (const j of jobs) {
    kinds.set(j.kind, (kinds.get(j.kind) ?? 0) + 1); tiers[j.tier]++;
    if (!j.title || !j.brief || j.pay <= 0 || j.days < 1 || j.penalty <= 0 || /\{\w+\}|undefined|NaN/.test(j.brief + j.title)) bad = `${s.name}: ${j.title} / ${j.brief}`;
  }
}
check('every lawful town posts three to five jobs, and the outlaws post none', short === 0 && !bad && lawfulTowns.length === 29, `${n0} jobs on ${lawfulTowns.length} boards${bad ? '; ' + bad : ''}`);
check('...of every kind', ['haul', 'deliver', 'escort', 'hunt', 'camp'].every((k) => (kinds.get(k) ?? 0) > 0), [...kinds].map(([k, v]) => `${k} ${v}`).join(', '));
check('...and of every tier, odd jobs most', tiers.every((v) => v > 0) && tiers[0] >= tiers[3], tiers.join('/'));
const firstIds = openJobs(cr).map((c) => c.id + c.title + c.pay).join('|');
delete W.flags.contracts;
forgetBoards();
check('a board is drawn from the town\'s seed and the day: drawn again, it is the same', openJobs(cr).map((c) => c.id + c.title + c.pay).join('|') === firstIds);
S.clock.t += DAY;
const nextDay = openJobs(cr).map((c) => c.id + c.title + c.pay).join('|');
check('...and the next day it is a new one', nextDay !== firstIds && boardFor(cr).day === S.clock.day, `${openJobs(cr).length} jobs on day ${S.clock.day}`);
{
  // the first job on every board is one a band of one or two just setting out can do: near, and rated Fair or better
  const firsts = lawfulTowns.map((s) => boardFor(s).list[0]);
  const forTwo = firsts.filter((c) => c.tier === 0 && dangerOf(c, noviceBand(2)).level <= 1 && walkOf(c) <= FIRST_JOB_M);
  const forOne = firsts.filter((c) => dangerOf(c, noviceBand(1)).level <= 1);
  const atCr = boardFor(cr).list[0];
  check('every board\'s first job is short and rated Fair or better for a pair of beginners (and for one alone wherever the land has a beast that small: two towns in five, Crossroad among them)',
    forTwo.length === firsts.length && forOne.length >= firsts.length * 0.4 && dangerOf(atCr).level <= 1,
    `${forTwo.length}/${firsts.length} for two, ${forOne.length} for one; Crossroad: ${atCr.title}, ${dangerOf(atCr).word} for a new Wanderer, ${Math.round(walkOf(atCr))} m out`);
  const names = firsts.filter((c) => c.kind === 'hunt').map((c) => c.e.who);
  check('...and no two boards are after the same named beast that day', new Set(names).size === names.length, `${names.length} beasts, ${names.length - new Set(names).size} names twice`);
}
S.clock.t -= DAY;
delete W.flags.contracts;

// ---------------------------------------------------------------- what the boards pay, over ten days
{
  const median = (a: number[]) => { const v = [...a].sort((x, y) => x - y); return v.length ? v[v.length >> 1] : NaN; };
  const counter = (s: Site, wealth: number) => ({ id: 0, kind: 'general', faction: s.faction!, site: s.id, keeper: 0, money: 1e9, restockDay: 0, markup: 0.15 + (1 - wealth) * 0.1, wealth, name: s.name } as unknown as Shop);
  const t0 = S.clock.t;
  let dupCamps = 0, campPosts = 0;
  const pays: Record<string, number[]> = { haul: [], deliver: [], escort: [], hunt: [], camp: [] };
  const margins: number[] = [], overSale: number[] = [];
  const walks: { kind: string; pay: number; perKm: number; danger: number }[] = [];
  for (let day = 0; day < 10; day++) {
    S.clock.t = t0 + day * DAY;
    const posted = new Set<number>();
    for (const s of lawfulTowns) for (const c of boardFor(s).list) {
      pays[c.kind].push(c.pay);
      if (c.kind === 'camp') { campPosts++; if (posted.has(c.e.site)) dupCamps++; posted.add(c.e.site); }
      if (c.kind === 'haul') {
        const it = { id: c.e.good!, q: 2 }, d = ITEM[c.e.good!];
        // bought where it is cheapest within the job's reach, at the richest counter: the best a plain haul does
        let cost = Infinity;
        for (const o of lawfulTowns) {
          if (o === s || Math.hypot(o.x - s.x, o.z - s.z) > TIER_REACH[c.tier][1] || !MARKETS[o.settlement ?? '']?.cheap.some((k) => k === d.id || k === d.cat)) continue;
          cost = Math.min(cost, buyPrice(counter(o, 1), it) * c.e.n!);
        }
        if (cost < Infinity) margins.push(c.pay / cost - 1);
        overSale.push(c.pay / (sellPrice(counter(s, 1), it) * c.e.n!));
      }
      if (c.kind === 'deliver' || c.kind === 'escort') {
        const from = siteById(c.from)!, to = siteById(c.e.site)!;
        const route = c.kind === 'escort' ? roadRoute(from, to)! : [from.x, from.z, to.x, to.z];
        const km = (c.kind === 'escort' ? routeLength(route) : Math.hypot(to.x - from.x, to.z - from.z)) / 1000;
        const pay = c.pay / (c.contraband ? 1.8 : 1); // (leaf pays for the risk of the Covenant, not the road)
        walks.push({ kind: c.kind, pay, perKm: pay / km, danger: c.kind === 'escort' ? dangerAlong(route) : dangerBetween(from.x, from.z, to.x, to.z) });
      }
    }
  }
  S.clock.t = t0;
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  check('no camp is on two boards on the same day (the boards go up together, and the first to post a camp keeps it)', dupCamps === 0 && campPosts >= 50, `${campPosts} camps posted over 10 days`);
  check('a haul pays a little over what the town\'s own counter would give for the load (standing is the rest of it)', median(overSale) >= 1.0 && median(overSale) <= 1.1 && Math.max(...overSale) <= 1.15, `pay over a sale at its counter: median ${median(overSale).toFixed(2)}x, max ${Math.max(...overSale).toFixed(2)}x`);
  check('...so bought where it is cheap it makes what a plain haul makes (10-35% at standing 0), never half again', margins.length > 0 && median(margins) >= 0.1 && Math.max(...margins) <= 0.35, `margin min ${pct(Math.min(...margins))}, median ${pct(median(margins))}, max ${pct(Math.max(...margins))} over ${margins.length} hauls`);
  const of = (k: string, f: (w: (typeof walks)[number]) => boolean = () => true) => walks.filter((w) => w.kind === k && f(w));
  const mid = (k: string) => `median ${Math.round(median(of(k).map((w) => w.pay)))} chits, ${Math.round(median(of(k).map((w) => w.perKm)))} a km`;
  check('a walk pays for the walk, modestly: deliveries and escorts at about half what they paid', median(of('deliver').map((w) => w.pay)) <= 300 && median(of('escort').map((w) => w.pay)) <= 420 && median(of('escort').map((w) => w.pay)) > median(of('deliver').map((w) => w.pay)), `deliveries ${mid('deliver')}; escorts ${mid('escort')}`);
  const safe = (k: string) => median(of(k, (w) => w.danger <= 2).map((w) => w.perKm)), wild = (k: string) => median(of(k, (w) => w.danger >= 4).map((w) => w.perKm));
  check('...and through dangerous country it pays well, where a safe road pays little', safe('deliver') < wild('deliver') && safe('escort') < wild('escort'), `a km on safe roads / dangerous: deliveries ${Math.round(safe('deliver'))} / ${Math.round(wild('deliver'))}, escorts ${Math.round(safe('escort'))} / ${Math.round(wild('escort'))}`);
  console.log(`     (median pay over 10 days: ${Object.entries(pays).map(([k, v]) => `${k} ${median(v)}`).join(', ')})`);
}

// standing tiers
const tiered = lawfulTowns.flatMap((s) => openJobs(s)).find((c) => c.tier >= 2)!;
W.rel.set('player', tiered.issuer, 0);
const locked = whyNot(tiered);
W.rel.set('player', tiered.issuer, TIERS[tiered.tier].min);
check('better work is kept for those a faction knows better (tiers at standing -15/15/35/60)', /standing/.test(locked) && whyNot(tiered) === '' && TIERS.map((t) => t.min).join() === '-15,15,35,60', `${tiered.title}, tier ${tiered.tier + 1}: "${locked}"`);
W.rel.set('player', tiered.issuer, -40);
check('...and a faction that would sooner see you hanged gives you no work at all', whyNot(openJobs(siteById(tiered.from)!)[0]) !== '');
W.rel.set('player', tiered.issuer, FACTION[tiered.issuer].playerRel);

// the danger rating is honest against the band
const camp = jobsOf('camp')[0];
const alone = dangerOf(camp);
const veterans = [mine(45, lead.x + 2, lead.z + 2), mine(45, lead.x + 3, lead.z + 2), mine(45, lead.x + 4, lead.z + 2), mine(45, lead.x + 5, lead.z + 2)];
const withBand = dangerOf(camp);
check('a camp is rated deadly for a lone beginner, and says so plainly', alone.level >= 4, `${camp.title}: ${alone.word} (${alone.ratio.toFixed(1)}x): ${alone.line}`);
check('...and much less so for four veterans', withBand.level < alone.level, `${withBand.word} (${withBand.ratio.toFixed(2)}x) with band power ${Math.round(playerBand().power)}`);
for (const v of veterans) W.removeChar(v);

// ---------------------------------------------------------------- haul: goods brought to the board
const raise = (f: string) => W.rel.set('player', f, 65);
const haul = jobsOf('haul').sort((a, b) => a.e.n! - b.e.n!)[0];
const haulTown = siteById(haul.from)!;
raise(haul.issuer);
const keeper = keeperOf(haulTown);
put(lead, keeper.x + 1.5, keeper.z + 1.5);
let talkT = talk(keeper, lead);
check('the keeper of the board offers work', talkT.opts().some((o) => o.includes('Any work going?')), `${keeper.name}, ${keeper.title} at ${haulTown.name}`);
talkT.pick('Any work going?');
const line = talkT.opts().find((o) => o.includes(haul.title));
check('...and the board lists the job with its pay and its danger', !!line && /chits/.test(line) && /Danger: \w+/.test(line), line ?? talkT.opts().join(' / '));
talkT.pick(haul.title);
check('...and spells out pay, danger, time and what failing costs', /Pay: .*chits/.test(talkT.text()) && /Danger: /.test(talkT.text()) && /Time: \d+ days?/.test(talkT.text()) && /Fail or walk away/.test(talkT.text()), talkT.text().split('\n').slice(1).join(' | '));
const money0 = W.money;
talkT.pick('I\'ll take it.');
const hj = activeContracts().find((c) => c.title === haul.title)!;
check('a haul can be taken', !!hj && hj.state === 'active' && talkT.node() === 'taken' && boardFor(haulTown).taken.includes(haul.id), hj?.title);
const had = lead.inv.count(haul.e.good!);
lead.inv.add(haul.e.good!, haul.e.n!);
const st0 = standing(haul.issuer);
talkT = talk(keeper, lead);
check('...and handed in when the goods are there', talkT.pick('I\'ve finished a job for you.') && hj.state === 'done' && lead.inv.count(haul.e.good!) === had && W.money === money0 + hj.pay, `${money0} -> ${W.money} for ${haul.e.n} ${ITEM[haul.e.good!].name}`);
check('...paying its standing, and a little over a plain sale', standing(haul.issuer) === Math.min(100, st0 + hj.standing) && hj.pay > haul.e.n! * ITEM[haul.e.good!].value * 0.5 * 1.74, `+${hj.standing}; ${hj.pay}c for ${haul.e.n} ${ITEM[haul.e.good!].name}`);
check('the first job done earns a deed', DEEDS.find((d) => d.key === 'contract')!.check(W, W.playerChars()));

// ---------------------------------------------------------------- deliver: a sealed parcel to a named person
const del = jobsOf('deliver').filter((c) => !c.contraband).sort((a, b) => Math.hypot(siteById(a.from)!.x - siteById(a.e.site)!.x, 0) - Math.hypot(siteById(b.from)!.x - siteById(b.e.site)!.x, 0))[0];
raise(del.issuer);
W.money = 5000;
const m1 = W.money;
check('a delivery can be taken, for a bond', takeContract(del, lead) === '' && W.money === m1 - del.bond);
const dj = activeContracts().find((c) => c.id === del.id)!;
check('...and the parcel goes into your pack', dj.e.uid !== undefined && lead.inv.items.some((it) => it.uid === dj.e.uid && it.id === 'sealed_parcel'));
const dest = siteById(dj.e.site)!;
put(lead, dest.x + 8, dest.z + 8);
populateTown(W, W.towns.get(dest.id)!);
focus = { x: lead.x, z: lead.z };
step(2);
const who = dj.e.whoId ? W.char(dj.e.whoId) : undefined;
check('the person it is for is in their town when you get there', !!who && who.name === dj.e.who && who.site === dest.id, `${dj.e.who}, ${who?.title} at ${dest.name}`);
put(lead, who!.x + 1.2, who!.z + 1.2);
talkT = talk(who!, lead);
const m2 = W.money;
check('...and takes it: the fee and the bond back', talkT.pick('A parcel for you') && dj.state === 'done' && W.money === m2 + dj.pay + dj.bond && !findItem(dj.e.uid!), `${talkT.text()}`);

// a day after, whoever it was for goes about their life elsewhere, unseen
const whoId = who!.id;
S.clock.t += DAY + HOUR;
who!.active = false;
sweepErrandFolk();
check('...and a day later, with nobody of yours near, they are gone from the town', !W.chars.has(whoId));
S.clock.t -= DAY + HOUR;

// a full pack: no room for the parcel, no parcel dropped, no bond taken
const full = jobsOf('deliver')[0];
raise(full.issuer);
const keepInv = lead.inv.items.slice(), keepBack = lead.eq.back;
lead.eq.back = null;
while (lead.inv.findSpot(ITEM.sealed_parcel)) lead.inv.add('bandages', 1);
const piles0 = [...W.objs.values()].filter((o) => o.kind === 'pile').length, m9a = W.money;
const refused = takeContract(full, lead);
check('a parcel with no room for it in the pack is refused, and nothing is dropped', /room/.test(refused) && [...W.objs.values()].filter((o) => o.kind === 'pile').length === piles0 && W.money === m9a && !activeContracts().some((c) => c.id === full.id), refused);
lead.inv.items = keepInv; lead.eq.back = keepBack;

// a parcel lost: gone for an hour, the job is gone
const del2 = jobsOf('deliver').find((c) => c.id !== del.id)!;
raise(del2.issuer);
takeContract(del2, lead);
const dj2 = activeContracts().find((c) => c.id === del2.id)!;
const it2 = lead.inv.items.find((it) => it.uid === dj2.e.uid)!;
lead.inv.remove(it2);
const s2 = standing(del2.issuer), m3 = W.money;
tickContracts(1.1);
S.clock.t += HOUR * 1.2;
tickContracts(1.1);
check('a parcel gone for an hour fails the job, and costs the standing and the bond', dj2.state === 'failed' && standing(del2.issuer) === s2 - dj2.penalty && W.money === m3, dj2.e.why);

// walking away costs what failing costs
const del3 = jobsOf('deliver').find((c) => c.id !== del.id && c.id !== del2.id)!;
raise(del3.issuer);
const m4 = W.money;
takeContract(del3, lead);
const dj3 = activeContracts().find((c) => c.id === del3.id)!;
const s3 = standing(del3.issuer);
abandonContract(dj3.id);
check('walking away from a job costs its standing and its bond, and the parcel is gone from your pack', dj3.state === 'abandoned' && standing(del3.issuer) === s3 - dj3.penalty && W.money === m4 - dj3.bond && !findItem(dj3.e.uid!), `-${dj3.penalty}, bond ${dj3.bond}`);

// a parcel the Covenant would burn, searched on the road
const leafJob = { ...jobsOf('deliver').find((c) => c.id !== del.id)!, id: 'test.leaf', contraband: true } as Contract;
leafJob.e = { ...leafJob.e, item: 'leaf_parcel' };
boardFor(siteById(leafJob.from)!).list.push(leafJob);
raise(leafJob.issuer);
takeContract(leafJob, lead);
const lj0 = activeContracts().find((c) => c.id === 'test.leaf')!;
const es = new Squad(); es.faction = 'ember'; es.kind = 'patrol'; W.addSquad(es);
const warden = makePerson(W, { faction: 'ember', role: 'patrol', race: 'valefolk' } as any, new RNG(8)); W.moveToSquad(warden, es);
put(warden, lead.x + 2, lead.z);
const found = search(warden);
check('the Covenant searches a parcel that smells of leaf, and takes it', found.found.some(([id]) => id === 'leaf_parcel') && !findItem(lj0.e.uid!), found.found.map(([id, n]) => `${n} ${id}`).join(', '));
tickContracts(1.1);
S.clock.t += HOUR * 1.2;
tickContracts(1.1);
check('...and the job is lost with it', lj0.state === 'failed', lj0.e.why);
W.removeChar(warden);
// the Covenant hires no beasts
const ember = lawfulTowns.find((s) => s.faction === 'ember')!;
const ek = keeperOf(ember);
const horned = mine(20, ek.x + 2, ek.z + 2);
horned.look.race = 'karuk';
put(lead, ek.x + 1.5, ek.z);
talkT = talk(ek, lead);
talkT.pick('Any work going?');
const refusal = talkT.text();
check('the Covenant\'s boards hire no beasts', /does not hire beasts/.test(refusal) && !talkT.opts().some((o) => /Danger/.test(o)), refusal);
W.removeChar(horned);
talkT = talk(ek, lead);
talkT.pick('Any work going?');
check('...and a band of humans is shown the work', talkT.opts().some((o) => /Danger/.test(o)), `${talkT.opts().length - 2} jobs at ${ember.name}`);

// ---------------------------------------------------------------- the deadline
const late = jobsOf('haul').find((c) => c.id !== haul.id)!;
raise(late.issuer);
takeContract(late, lead);
const lj = activeContracts().find((c) => c.id === late.id)!;
const s4 = standing(late.issuer);
S.clock.t = lj.due! + 60;
tickContracts(1.1);
check('a job not done by its day fails, and costs what the board said', lj.state === 'failed' && /time/i.test(stats().past[0].note) && standing(late.issuer) === s4 - lj.penalty, `${stats().past[0].note}`);
S.clock.t = DAY + 10 * HOUR;

// ---------------------------------------------------------------- hunt: a named beast on the road
const hunt = jobsOf('hunt').find((c) => !!c.e.species && !c.e.plain)!;
raise(hunt.issuer);
check('a beast hunt can be taken', takeContract(hunt, lead) === '');
const hb = activeContracts().find((c) => c.id === hunt.id)!;
const beast = W.char(hb.e.whoId!);
check('...and the beast is out on its hunting grounds, named, bigger than the rest of its kind', !!beast && beast.animal === hunt.e.species && beast.name === hunt.e.who && Math.hypot(beast.x - hunt.e.x!, beast.z - hunt.e.z!) < 40 && beast.body.max[1] > 1.4 * W.char(W.squadOf(beast)!.members.find((id) => id !== beast.id) ?? beast.id)!.body.max[1] / (beast.squad && W.squadOf(beast)!.members.length > 1 ? 1 : 1.6), `${beast?.name} at ${Math.round(beast?.x ?? 0)}, ${Math.round(beast?.z ?? 0)}`);
kill(beast!);
tickContracts(1.1);
check('...and once it is down the job waits to be paid for', hb.state === 'ready' && currentGoal()?.text.includes('Collect') === true, currentGoal()?.text);
const hkeeper = keeperOf(siteById(hb.from)!);
put(lead, hkeeper.x + 1.5, hkeeper.z);
const m5 = W.money;
talkT = talk(hkeeper, lead);
check('...back at the board', talkT.pick('I\'ve finished a job for you.') && hb.state === 'done' && W.money === m5 + hb.pay, `+${W.money - m5}`);
{
  // a first job's beast is an ordinary one of its kind, as the board rated it
  const easy = jobsOf('hunt').find((c) => !!c.e.plain)!;
  const before = dangerOf(easy);
  raise(easy.issuer);
  const took = takeContract(easy, lead) === '';
  const eb = activeContracts().find((c) => c.id === easy.id)!;
  const q = eb?.e.whoId ? W.char(eb.e.whoId) : undefined;
  const after = eb ? dangerOf(eb) : before;
  check('a first job\'s beast is an ordinary one of its kind, and rates as the board said', took && !!q && q.animal === easy.e.species && after.level === before.level && Math.abs(after.ratio - before.ratio) < 0.25 * before.ratio,
    `${easy.title}: ${before.word} (${before.ratio.toFixed(2)}) on the board, ${after.word} (${after.ratio.toFixed(2)}) out there`);
  if (q) kill(q);
  tickContracts(1.1);
  const k2 = keeperOf(siteById(eb.from)!);
  put(lead, k2.x + 1.5, k2.z);
  talk(k2, lead).pick('I\'ve finished a job for you.');
}

// a band hunt, the leader carried in alive for half again
const bandJob = jobsOf('hunt').find((c) => !!c.e.faction)!;
raise(bandJob.issuer);
check('an outlaw band can be hunted', takeContract(bandJob, lead) === '');
const bj = activeContracts().find((c) => c.id === bandJob.id)!;
const boss = W.char(bj.e.whoId!)!;
check('...the outlaw leading it, named, with their band around them', boss.name === bandJob.e.who && boss.title === bandJob.e.title && W.squadOf(boss)!.members.length === 1 + bandJob.e.size!, `${boss.name} ${boss.title} and ${W.squadOf(boss)!.members.length - 1}`);
knockOut(boss);
tickContracts(1.1);
const bkeeper = keeperOf(siteById(bj.from)!);
put(lead, bkeeper.x + 1.5, bkeeper.z);
put(boss, lead.x + 1, lead.z);
pickUp(lead, boss);
const m6 = W.money;
talkT = talk(bkeeper, lead);
talkT.pick('I\'ve finished a job for you.');
check('...and brought in breathing pays half again', bj.state === 'done' && W.money === m6 + Math.round(bj.pay * 1.5) && !lead.carrying, `${W.money - m6} for ${bj.pay}`);

// ---------------------------------------------------------------- camp: empty it
const campJob = jobsOf('camp').sort((a, b) => a.threat - b.threat)[0];
raise(campJob.issuer);
check('a camp can be taken', takeContract(campJob, lead) === '');
const cj = activeContracts().find((c) => c.id === campJob.id)!;
const campSite = siteById(cj.e.site)!;
check('...and nobody of yours knows how many hold it until they go', campLeft(campSite.id) === -1);
populateSite(W, campSite);
const holders = [...W.squads.values()].filter((q) => q.site === campSite.id && (q.kind === 'camp' || q.kind === 'nest')).flatMap((q) => q.members.map((id) => W.char(id)!));
tickContracts(1.1);
check('...while anyone in it stands, it is not cleared', cj.state === 'active' && campLeft(campSite.id) === holders.filter((c) => c.up).length && holders.length > 0, `${holders.length} at ${campSite.name}`);
for (const c of holders) if (c.up) (c === holders[0] ? knockOut(c) : kill(c));
tickContracts(1.1);
check('...and with all of them down, knocked out or dead, it is done', cj.state === 'ready');
const ckeeper = keeperOf(siteById(cj.from)!);
put(lead, ckeeper.x + 1.5, ckeeper.z);
const m7 = W.money;
talkT = talk(ckeeper, lead);
talkT.pick('I\'ve finished a job for you.');
check('...and paid for at the board', cj.state === 'done' && W.money === m7 + cj.pay);
check('...and an emptied camp is offered on no board after', !lawfulTowns.some((s) => openJobs(s).some((c) => c.kind === 'camp' && c.e.site === campSite.id)) && /Nobody holds/.test(whyNot({ ...campJob, id: 'test.empty' } as Contract)));

// one camp, one job: a camp already yours is no job on another board
const campJob2 = jobsOf('camp').filter((c) => c.e.site !== campSite.id).sort((a, b) => a.threat - b.threat)[0];
raise(campJob2.issuer);
check('another camp can be taken', takeContract(campJob2, lead) === '', campJob2.title);
const cj2 = activeContracts().find((c) => c.id === campJob2.id)!;
const other = lawfulTowns.find((s) => s.id !== campJob2.from && s.faction !== campJob2.issuer)!;
const twinOffer = { ...campJob2, id: 'test.twin', from: other.id, issuer: other.faction! } as Contract;
boardFor(other).list.push(twinOffer);
raise(other.faction!);
const twinRefusal = takeContract(twinOffer, lead);
check('...and the same camp on another board is no job: not offered, and refused', !openJobs(other).some((c) => c.id === 'test.twin') && /already hold a job for that camp/.test(twinRefusal) && activeContracts().filter((c) => c.kind === 'camp' && c.e.site === campJob2.e.site).length === 1, `${other.name}: "${twinRefusal}"`);
// (a save from before could hold the same camp twice: it is paid for once)
const twin = { ...JSON.parse(JSON.stringify(cj2)), id: 'test.twin2', from: other.id, issuer: other.faction } as Contract;
stats().active.push(twin);
// the last of them taken alive and caged far off, the rest dead: nobody holds it now
const camp2 = siteById(cj2.e.site)!;
populateSite(W, camp2);
const holders2 = [...W.squads.values()].filter((q) => q.site === camp2.id && (q.kind === 'camp' || q.kind === 'nest')).flatMap((q) => q.members.map((id) => W.char(id)!)).filter((c) => c.up);
const farCage = [...W.objs.values()].filter((o) => o.kind === 'cage' && !o.occupant).sort((a, b) => Math.hypot(b.x - camp2.x, b.z - camp2.z) - Math.hypot(a.x - camp2.x, a.z - camp2.z))[0];
const caught = holders2.find((c) => !c.animal) ?? holders2[0];
for (const c of holders2) if (c !== caught) kill(c);
farCage.occupant = caught.id; caught.cage = farCage.id; caught.x = farCage.x; caught.z = farCage.z;
tickContracts(1.1);
check('a camp whose last holder sits in a cage far away is cleared', caught.up && campLeft(camp2.id) === 0 && cj2.state === 'ready', `${caught.name} caged ${Math.round(Math.hypot(farCage.x - camp2.x, farCage.z - camp2.z))} m away; ${campLeft(camp2.id)} left`);
const k2 = keeperOf(siteById(cj2.from)!);
put(lead, k2.x + 1.5, k2.z);
const m7b = W.money, s7b = standing(other.faction!);
talkT = talk(k2, lead);
talkT.pick('I\'ve finished a job for you.');
check('...and a camp held twice is paid for once; the other job comes down at no cost', cj2.state === 'done' && twin.state === 'failed' && W.money === m7b + cj2.pay && standing(other.faction!) === s7b && !activeContracts().includes(twin), `${W.money - m7b} paid; the twin ${twin.state}: ${stats().past.find((p) => p.id === twin.id)?.note}`);
farCage.occupant = 0; caught.cage = 0; kill(caught);

// ---------------------------------------------------------------- escort: walk them to their gate
const escorts = jobsOf('escort');
const esc = escorts.sort((a, b) => Math.hypot(siteById(a.from)!.x - siteById(a.e.site)!.x, siteById(a.from)!.z - siteById(a.e.site)!.z) - Math.hypot(siteById(b.from)!.x - siteById(b.e.site)!.x, siteById(b.from)!.z - siteById(b.e.site)!.z))[0];
raise(esc.issuer);
const from = siteById(esc.from)!, to = siteById(esc.e.site)!;
put(lead, from.x, from.z);
check('an escort can be taken', takeContract(esc, lead) === '', `${esc.title}, ${Math.round(Math.hypot(from.x - to.x, from.z - to.z))} m`);
const ej = activeContracts().find((c) => c.id === esc.id)!;
const party = W.squads.get(ej.e.squad!)!;
const walker = W.char(party.leader)!;
check('...and the travellers wait at the edge of town for whoever walks them', !!walker && walker.name === esc.e.who && Math.hypot(walker.x - from.x, walker.z - from.z) < from.r + 60 && ej.e.paused === true, `${party.members.length} of them`);
// out of reach of your people, they stay where they are
put(lead, walker.x + 300, walker.z + 300);
focus = { x: walker.x, z: walker.z };
const w0 = { x: walker.x, z: walker.z };
step(20);
check('...and without your people beside them they do not set off', Math.hypot(walker.x - w0.x, walker.z - w0.z) < 4 && ej.e.paused === true);
put(lead, walker.x + 3, walker.z + 3);
lead.order = { k: 'follow', id: walker.id };
lead.move = 'walk';
let tEsc = 0;
for (; tEsc < 3600 && ej.state === 'active'; tEsc += 2) {
  focus = { x: walker.x, z: walker.z };
  step(2);
  if (Math.hypot(lead.x - walker.x, lead.z - walker.z) > 40) { put(lead, walker.x + 3, walker.z + 3); lead.order = { k: 'follow', id: walker.id }; }
}
check('...walked with, they reach their gate, and pay', ej.state === 'done' && Math.hypot(walker.x - to.x, walker.z - to.z) < to.r + 10, `${tEsc} s to ${to.name}, ${ej.state}`);
lead.order = null;

// an escort lost: the travellers dead
const esc2 = escorts.find((c) => c.id !== esc.id)!;
raise(esc2.issuer);
put(lead, siteById(esc2.from)!.x, siteById(esc2.from)!.z);
takeContract(esc2, lead);
const ej2 = activeContracts().find((c) => c.id === esc2.id)!;
for (const id of W.squads.get(ej2.e.squad!)!.members) kill(W.char(id)!);
const s5 = standing(esc2.issuer);
tickContracts(1.1);
check('travellers who die on your watch fail the job', ej2.state === 'failed' && standing(esc2.issuer) === s5 - ej2.penalty, ej2.e.why);

// an escort lost another way: the travellers knocked down and caged far off by someone else
const esc3 = escorts.find((c) => c.id !== esc.id && c.id !== esc2.id)!;
raise(esc3.issuer);
put(lead, siteById(esc3.from)!.x, siteById(esc3.from)!.z);
takeContract(esc3, lead);
const ej3 = activeContracts().find((c) => c.id === esc3.id)!;
const taken3 = W.squads.get(ej3.e.squad!)!.members.map((id) => W.char(id)!);
const cells = [...W.objs.values()].filter((o) => o.kind === 'cage' && !o.occupant && o.owner !== 'player' && Math.hypot(o.x - lead.x, o.z - lead.z) > 1500);
taken3.forEach((c, i) => { knockOut(c); const cage = cells[i]; cage.occupant = c.id; c.cage = cage.id; c.x = cage.x; c.z = cage.z; });
const s6 = standing(esc3.issuer);
tickContracts(1.1);
const within = ej3.state === 'active';
S.clock.t += HOUR * 1.2;
tickContracts(1.1);
check('travellers carried off and caged elsewhere: an hour to get them back, then the job is lost, at no cost', within && ej3.state === 'failed' && standing(esc3.issuer) === s6, `${taken3.length} caged; ${ej3.e.why}`);
for (const c of taken3) { const cage = W.objs.get(c.cage); if (cage) cage.occupant = 0; c.cage = 0; }
S.clock.t -= HOUR * 1.2;
// ...but locked up by your own hands, even in a town's cage, the job is lost at its full cost
const esc4 = escorts.find((c) => ![esc.id, esc2.id, esc3.id].includes(c.id))!;
raise(esc4.issuer);
put(lead, siteById(esc4.from)!.x, siteById(esc4.from)!.z);
takeContract(esc4, lead);
const ej4 = activeContracts().find((c) => c.id === esc4.id)!;
const taken4 = W.squads.get(ej4.e.squad!)!.members.map((id) => W.char(id)!);
const townCells = [...W.objs.values()].filter((o) => o.kind === 'cage' && !o.occupant && o.owner !== 'player');
taken4.forEach((c, i) => { knockOut(c); put(c, lead.x + 1, lead.z); pickUp(lead, c); placeInto(lead, c, townCells[i]); });
const s7 = standing(esc4.issuer);
tickContracts(1.1);
S.clock.t += HOUR * 1.2;
tickContracts(1.1);
check('...but travellers your own people lock up, even in a town\'s cage, fail it at its full cost', taken4.every((c) => c.cage && c.mem.caughtBy === 'player') && ej4.state === 'failed' && standing(esc4.issuer) === s7 - ej4.penalty, `${taken4.length} caged by you; -${s7 - standing(esc4.issuer)}`);
for (const c of taken4) { const cage = W.objs.get(c.cage); if (cage) cage.occupant = 0; c.cage = 0; }
S.clock.t -= HOUR * 1.2;

// ---------------------------------------------------------------- the stories
const fr = STORY.freeroad;
W.rel.set('player', 'drifters', 25);
tickStories(1.1);
check('a story opens when its people know your work, and word comes to you', storyState('freeroad').state === 'open' && notices.some((n) => n.includes('Captain Hesk')), notices.find((n) => n.includes('Hesk')));
put(lead, cr.x + 5, cr.z + 5);
populateTown(W, W.towns.get(cr.id)!);
tickStories(1.1);
const hesk = W.char(storyState('freeroad').giver!)!;
check('...its giver stands in their town', !!hesk && hesk.name === fr.giver.name && hesk.site === cr.id, `${hesk?.name}, ${hesk?.title}`);
put(lead, hesk.x + 1.2, hesk.z + 1.2);
talkT = talk(hesk, lead);
check('...and tells you what it is about', talkT.text() === fr.steps[0].say && talkT.pick('I\'m in.'), talkT.text().slice(0, 60));
const frs = storyState('freeroad');
check('...the first step, a camp to clear, is set going', frs.state === 'active' && frs.step === 1 && frs.e?.kind === 'camp' && siteById(frs.e.site)?.key === 'reaverden');
const den = siteById(frs.e!.site)!;
populateSite(W, den);
for (const q of [...W.squads.values()].filter((q) => q.site === den.id)) for (const id of q.members) kill(W.char(id)!);
const m8 = W.money;
tickStories(1.1);
check('...cleared, the story moves on, and pays the step', frs.step === 2 && frs.e?.kind === 'deliver' && W.money === m8 + (fr.steps[1].pay ?? 0) && !!findItem(frs.e.uid!), `step ${frs.step}: ${fr.steps[frs.step].title}`);
const sqr = siteById(frs.e!.site)!;
put(lead, sqr.x + 6, sqr.z + 6);
populateTown(W, W.towns.get(sqr.id)!);
tickStories(1.1);
const ilse = W.char(frs.e!.whoId!)!;
put(lead, ilse.x + 1.2, ilse.z + 1.2);
talkT = talk(ilse, lead);
talkT.pick('A parcel for you');
check('...the letter delivered, the next step is a defence', frs.step === 3 && frs.e?.kind === 'defend' && talkT.text() === fr.steps[3].say, talkT.text().slice(0, 50));
focus = { x: sqr.x, z: sqr.z };
tickStories(1.1);
const raid = W.squads.get(frs.e!.squad!)!;
const raiders = raid?.members.map((id) => W.char(id)!) ?? [];
check('...and the raiders come once you are there to meet them, from out of sight', !!raid && raiders.length >= 2 && raiders.every((c) => Math.hypot(c.x - sqr.x, c.z - sqr.z) > 450) && raid.flags.townRaid === sqr.id, `${raiders.length} ${raid?.name}, ${Math.round(Math.min(...raiders.map((c) => Math.hypot(c.x - sqr.x, c.z - sqr.z))))} m out`);
for (const c of raiders) kill(c);
tickStories(1.1);
check('...beaten, the story asks you back to its giver', frs.step === 4 && fr.steps[4].kind === 'talk');
put(lead, hesk.x + 1.2, hesk.z + 1.2);
const band0 = W.playerChars().length;
const houses0 = [...W.objs.values()].filter((o) => o.kind === 'building' && o.owner === 'player' && o.site === cr.id).length;
talkT = talk(hesk, lead);
talkT.pick('Thank you.');
const houses1 = [...W.objs.values()].filter((o) => o.kind === 'building' && o.owner === 'player' && o.site === cr.id).length;
check('the capstone changes the world: a house in Crossroad, a sergeant who joins, the Reavers kept off the free towns', frs.state === 'done' && houses1 === houses0 + 1 && W.playerChars().length === band0 + 1 && W.playerChars().some((c) => c.name === 'Brannoc') && (W.flags.quiet?.reavers ?? 0) > S.clock.t + DAY * 20 && lead.title === 'Warden of the Free Road', `${houses1} house, ${W.playerChars().length} people`);
check('...and its deed', DEEDS.find((d) => d.key === 'free_road')!.check(W, W.playerChars()));

// the Hollows' story, step by step to its end, which wakes the Foundry
const fd = STORY.foundry;
setStoryStep('foundry', 1, lead);
const fs = storyState('foundry');
const rw = site('rustward');
put(lead, rw.x + 5, rw.z + 5);
populateTown(W, W.towns.get(rw.id)!);
tickStories(1.1);
const ash = W.char(fs.giver!)!;
lead.inv.add('servo_motor', 4);
put(lead, ash.x + 1.2, ash.z + 1.2);
talkT = talk(ash, lead);
check('a story\'s bring step is handed in to its giver', talkT.pick('Here: 4 Servo Motor') && fs.step === 2 && fs.e?.kind === 'reach' && lead.inv.count('servo_motor') === 0, fd.steps[fs.step].title);
const mill = siteById(fs.e!.site)!;
put(lead, mill.x + mill.r + 30, mill.z);
tickStories(1.1);
check('...a reach step is done by going there', fs.step === 3 && fs.e?.kind === 'escort', `${mill.name}`);
const senn = W.char(fs.e!.whoId!)!;
const sennCage = [...W.objs.values()].find((o) => o.kind === 'cage' && !o.occupant && o.owner !== 'player')!;
knockOut(senn); sennCage.occupant = senn.id; senn.cage = sennCage.id; senn.x = sennCage.x; senn.z = sennCage.z;
tickStories(1.1);
S.clock.t += HOUR * 1.2;
tickStories(1.1);
check('...and with the archivist caged and not got back within the hour, the Custodian sets it going again', fs.step === 3 && fs.retry === true && !fs.e && notices.some((n) => n.includes('Senn-4 was carried off')), notices.find((n) => n.includes('carried off')));
sennCage.occupant = 0; senn.cage = 0;
S.clock.t -= HOUR * 1.2;
setStoryStep('foundry', 5, lead);
const sAsh = W.playerChars().length;
put(lead, ash.x + 1.2, ash.z + 1.2);
talkT = talk(ash, lead);
talkT.pick('Thank you.');
check('...and its capstone: a rewired warbot joins you, and the Foundry will wake', fs.state === 'done' && W.playerChars().length === sAsh + 1 && W.playerChars().some((c) => c.animal === 'warbot' && c.name === 'Bulwark') && (crisisState().pending ?? 0) > S.clock.t, `pending in ${(((crisisState().pending ?? 0) - S.clock.t) / HOUR).toFixed(0)} h`);
delete crisisState().pending; // the crisis is checked from its own trigger below

// the Covenant's story: the runners on the Dustwell road carry the leaf it wants burned
W.rel.set('player', 'ember', 30);
setStoryStep('ashtithe', 1, lead);
const at = storyState('ashtithe');
const teg = W.char(at.e!.whoId!)!;
const runners = W.squadOf(teg)!.members.map((id) => W.char(id)!);
const dw = site('dustwell'), mw = site('mudwater');
const along = ((teg.x - dw.x) * (mw.x - dw.x) + (teg.z - dw.z) * (mw.z - dw.z)) / ((mw.x - dw.x) ** 2 + (mw.z - dw.z) ** 2);
check('the Covenant\'s story sends you after Teg the Leaf Runner, on the road between Dustwell and Mudwater', teg.name === 'Teg' && teg.faction === 'scorched' && along > 0.25 && along < 0.65 && runners.length === STORY.ashtithe.steps[1].size, `${runners.length} runners, ${(along * 100).toFixed(0)}% of the way to Mudwater`);
check('...who carry the leaf it wants', runners.reduce((a, c) => a + c.inv.count('dreamleaf'), 0) >= (STORY.ashtithe.steps[2].n ?? 10));
knockOut(teg);
tickStories(1.1);
check('...and with Teg down, it asks for their leaf', at.step === 2 && at.e?.kind === 'haul' && at.e.good === 'dreamleaf');
setStoryStep('ashtithe', 4, lead);
const pyre = site('pyreswatch');
put(lead, pyre.x + 5, pyre.z + 5);
populateTown(W, W.towns.get(pyre.id)!);
tickStories(1.1);
const vosk = W.char(at.giver!)!;
put(lead, vosk.x + 1.2, vosk.z + 1.2);
const kv = W.playerChars().filter((c) => c.alive && !c.animal && c !== lead);
for (const c of kv) put(c, lead.x + 200, lead.z + 200); // (a Hollow or a Karuk in earshot and the Inquisitor will not speak)
talkT = talk(vosk, lead);
talkT.pick('Thank you.');
check('...and its end: a Flamebearer, with the Pyre\'s Tongue', at.state === 'done' && lead.title === 'Flamebearer' && W.playerChars().some((c) => c.inv.items.some((it) => it.id === 'pyre_tongue' && it.q === 5)) && DEEDS.find((d) => d.key === 'flamebearer')!.check(W, W.playerChars()), lead.title);

// ---------------------------------------------------------------- save and load keep it all
const keep = activeContracts().length;
const haulJob = jobsOf('haul').find((c) => !activeContracts().some((a) => a.id === c.id))!;
raise(haulJob.issuer);
takeContract(haulJob, lead);
const del4 = jobsOf('deliver').find((c) => !activeContracts().some((a) => a.id === c.id))!;
raise(del4.issuer);
takeContract(del4, lead);
const haulTown2 = siteById(haulJob.from)!;
const boardBefore = boardFor(haulTown2).list.map((c) => c.id + c.title + c.pay).join('|');
const done0 = stats().done;
const data = JSON.parse(JSON.stringify(serialize()));
const w2 = new World();
const live = S.W;
apply(data, w2);
S.W = w2;
const st2 = contractsState();
const parcel2 = st2.active.find((c) => c.id === del4.id);
check('a save keeps the jobs, the stories and the history', st2.active.length === keep + 2 && !!parcel2 && !!findItem(parcel2.e.uid!) && storyState('freeroad').state === 'done' && st2.done === done0, `${st2.active.length} jobs, ${st2.done} done, ${st2.past.length} in the history`);
const kept = JSON.stringify(data.flags.contracts).length;
check('...but not the boards: drawn again the same, with what was taken off them still taken', data.flags.contracts.boards === undefined && kept < 30000 && boardFor(haulTown2).list.map((c) => c.id + c.title + c.pay).join('|') === boardBefore && !openJobs(haulTown2).some((c) => c.id === haulJob.id) && st2.taken.includes(del4.id), `${(kept / 1024).toFixed(1)} KB of work in the save`);
let threw = '';
try { for (let i = 0; i < 30; i++) tickContracts(0.5); currentGoal(); goalMarks(); } catch (e: any) { threw = e?.stack ?? String(e); }
check('...and the game goes on from it', !threw, threw.split('\n').slice(0, 3).join(' '));
S.W = live;

// an older save, from before any of this
const old = JSON.parse(JSON.stringify(data));
delete old.flags.contracts; delete old.flags.story; delete old.flags.crises;
const w3 = new World();
apply(old, w3);
S.W = w3;
threw = '';
let goal = null as ReturnType<typeof currentGoal>;
try { for (let i = 0; i < 30; i++) tickContracts(0.5); goal = currentGoal(); openJobs(cr); } catch (e: any) { threw = e?.stack ?? String(e); }
check('an older save without any of it loads and plays: boards post, and the tracker has somewhere to send you', !threw && openJobs(cr).length >= 3 && !!goal?.where && storyState('freeroad').state !== undefined && [...w3.chars.values()].filter((c) => c.mem.story === 'freeroad' && c.alive).length === 1, threw ? threw.split('\n').slice(0, 3).join(' ') : goal?.text);
S.W = live;

// a save from before the boards were drawn afresh kept them whole: what was taken off today's stays taken
{
  const keepC = W.flags.contracts;
  const first = boardFor(cr).list[0];
  const elsewhere = lawfulTowns.find((s) => s.id !== cr.id)!;
  W.flags.contracts = { boards: { [cr.id]: { day: S.clock.day, list: [first], taken: [first.id] }, [elsewhere.id]: { day: S.clock.day - 1, list: [], taken: [`${elsewhere.id}.${S.clock.day - 1}.0`] } }, active: [], past: [], done: 0, failed: 0, abandoned: 0, by: {} };
  const st = contractsState() as unknown as Record<string, unknown>;
  check('a save that kept whole boards loads: they are let go, and what was taken off today\'s stays taken', st.boards === undefined && !openJobs(cr).some((c) => c.id === first.id) && (st.taken as string[]).join() === first.id, `taken: ${(st.taken as string[]).join()}`);
  W.flags.contracts = keepC;
}

// ---------------------------------------------------------------- a broken save never stops the game
{
  const keepFlags = JSON.parse(JSON.stringify({ c: W.flags.contracts, s: W.flags.story, k: W.flags.crises }));
  const shapes: [string, () => void][] = [
    ['contracts = "abc"', () => { W.flags.contracts = 'abc'; }],
    ['contracts = []', () => { W.flags.contracts = []; }],
    ['contracts = { active: "x" }', () => { W.flags.contracts = { active: 'x' }; }],
    ['contracts = { active: [null, 5, {}] }', () => { W.flags.contracts = { active: [null, 5, {}] }; }],
    ['contracts = { active: [{ state: "active", e: null }] }', () => { W.flags.contracts = { active: [{ state: 'active', e: null }] }; }],
    ['an escort with no squad, a broken due, boards "x", past 5', () => { W.flags.contracts = { active: [{ id: 'q', state: 'active', kind: 'escort', e: { kind: 'escort', squad: 'x', site: 'y' }, due: NaN }], boards: 'x', past: 5 }; }],
    ['story = "abc"', () => { W.flags.story = 'abc'; }],
    ['story = { freeroad: "x" }', () => { W.flags.story = { freeroad: 'x' }; }],
    ['story = { freeroad: { state: "active", step: 99, e: 7, log: "x" } }', () => { W.flags.story = { freeroad: { state: 'active', step: 99, e: 7, log: 'x' } }; }],
    // (an older save's one crisis, flags.crisis, is moved in to flags.crises: as broken as it may be)
    ['crisis = "abc"', () => { W.flags.crisis = 'abc'; }],
    ['crisis = { state: "waves", squads: "x", foundry: "y", wave: "z" }', () => { W.flags.crisis = { state: 'waves', squads: 'x', foundry: 'y', wave: 'z' }; }],
    ['crisis = { state: "waves", squads: [null, "a"], foundry: 99999, mind: "m", wave: NaN }', () => { W.flags.crisis = { state: 'waves', squads: [null, 'a'], foundry: 99999, mind: 'm', wave: NaN }; }],
    ['crises = "abc"', () => { W.flags.crises = 'abc'; }],
    ['crises = { foundry: 7, muster: { state: "waves", towns: "x", leader: "y", site: [1] } }', () => { W.flags.crises = { foundry: 7, muster: { state: 'waves', towns: 'x', leader: 'y', site: [1] } }; }],
  ];
  const bad: string[] = [];
  for (const [name, set] of shapes) {
    delete W.flags.contracts; delete W.flags.story; delete W.flags.crisis; delete W.flags.crises;
    set();
    let threw = 0, first = '';
    const tryIt = (f: () => unknown) => { try { f(); } catch (e: any) { threw++; first ||= String(e?.message ?? e).slice(0, 80); } };
    for (let i = 0; i < 4; i++) tryIt(() => tickContracts(1.1));
    tryIt(() => currentGoal()); tryIt(() => goalMarks()); tryIt(() => storyViews());
    // ...and the game goes on from it: boards post, a story can be told, the crisis can wake
    tryIt(() => { if (openJobs(cr).length < 3 || !Array.isArray(stats().past) || storyStates().freeroad.log.length === undefined || typeof crisisState().wave !== 'number' || !Array.isArray(crisisState().squads) || typeof crisisState('muster').wave !== 'number' || W.flags.crisis !== undefined) throw new Error('not put to rights'); });
    if (threw) bad.push(`${name}: ${threw} (${first})`);
  }
  W.flags.contracts = keepFlags.c; W.flags.story = keepFlags.s; W.flags.crises = keepFlags.k; delete W.flags.crisis;
  check('a broken save (work, stories or crisis of the wrong shape) never trips the game, and it plays on', bad.length === 0, bad.join(' | ') || `${shapes.length} shapes, none threw`);
  W.flags.story = { freeroad: { state: 'active', step: 99, e: 7, log: [{ step: 0, t: 1 }, { step: 1, t: 2 }] } };
  const fr2 = storyState('freeroad');
  check('...a story of the wrong shape picks up where its notes say it got to, its giver ready to set the step going again', fr2.state === 'active' && fr2.step === 2 && fr2.retry === true && fr2.e === undefined, `step ${fr2.step}, retry ${fr2.retry}`);
  W.flags.story = keepFlags.s;
}

// ---------------------------------------------------------------- the Foundry wakes
for (const c of activeContracts().slice()) abandonContract(c.id);
const bx = cr.x + 900, bz = cr.z - 700;
const [hx, hz] = nav.nearestOpen(bx, bz, 60)!;
for (const [k, dx, dz] of [['shack', 0, 0], ['chest', 8, 0], ['bedroll', -6, 4], ['bedroll', -6, 7], ['campfire', 4, 8]] as [string, number, number][]) {
  const at = nav.nearestOpen(hx + dx, hz + dz, 12)!;
  if (BUILDABLE[k]) finishSite(placeSite(BUILDABLE[k], at[0], at[1], 0), true);
}
const base = playerBase();
for (const c of W.playerChars()) if (c.alive) put(c, hx + 3, hz + 3);
focus = { x: hx, z: hz };
S.clock.t = 19 * DAY + 12 * HOUR;
tickCrisis(2.1);
check('the Foundry does not wake before day 20', crisisState().state === 'none' && !!base, `base of ${base?.n} pieces`);
S.clock.t = 20 * DAY + 13 * HOUR;
tickCrisis(2.1);
const cs = crisisState();
const foundry = siteById(cs.site)!;
const mind = W.char(cs.leader!)!;
check('from day 20, with a base, it wakes: a warning, and the Foundry Mind in its hall', cs.state === 'warning' && foundry?.kind === 'foundry' && !!mind && mind.name === CRISIS.leader.name && Math.hypot(mind.x - foundry.x, mind.z - foundry.z) < 40, `${foundry?.name}, ${Math.round(Math.hypot(foundry.x - hx, foundry.z - hz))} m from the base`);
check('...the journal says what to do', /Foundry Mind/.test(currentGoal()?.text ?? ''), currentGoal()?.text);
tickCrisis(2.1);
check('...no wave comes in the warning day', cs.state === 'warning' && cs.squads.length === 0);
S.clock.t += DAY + 60;
tickCrisis(2.1);
tickCrisis(2.1);
const w1 = W.squads.get(cs.squads[0])!;
const bandPower = playerBand().power;
const wave1 = w1 ? w1.members.map((id) => W.char(id)!).filter(Boolean) : [];
const wt1 = wave1.reduce((a, c) => a + threat(c), 0);
check('then the first wave marches on the base, sized to the band', cs.state === 'waves' && !!w1 && w1.flags.baseRaid && wave1.length >= 1 && wt1 <= bandPower * CRISIS.waves[0] * 1.3 + 1, `${wave1.length} machines, strength ${Math.round(wt1)} against ${Math.round(bandPower)}`);
check('...from out of sight, so nobody careful is caught in their beds', wave1.every((c) => Math.hypot(c.x - hx, c.z - hz) > 600), `${Math.round(Math.min(...wave1.map((c) => Math.hypot(c.x - hx, c.z - hz))))} m out`);
const waves: number[] = [wt1];
for (let i = 1; i < CRISIS.waves.length + 1; i++) {
  for (const id of cs.squads) for (const m of W.squads.get(id)?.members ?? []) { const c = W.char(m); if (c?.up) kill(c); }
  tickRaids(5.1);
  S.clock.t = (cs.next ?? S.clock.t) + 60;
  tickCrisis(2.1);
  tickCrisis(2.1);
  const last = W.squads.get(cs.squads[cs.squads.length - 1]);
  if (i < CRISIS.waves.length && last) waves.push(last.members.reduce((a, id) => a + threat(W.char(id)!), 0));
}
check('...each wave a little stronger, never more than its share of the band', waves.length === CRISIS.waves.length && waves.every((t, i) => t <= Math.max(60, bandPower * CRISIS.waves[i]) * 1.3 + 1) && waves[4] >= waves[0], waves.map(Math.round).join(', '));
check('...and five waves spend it: it goes quiet, the Mind still waiting', cs.state === 'quiet' && mind.up, cs.state);
const m9 = W.money;
kill(mind);
tickCrisis(2.1);
check('breaking the Foundry Mind ends it, with a big reward', cs.state === 'resolved' && W.money === m9 + 8000 && W.playerChars().some((c) => c.inv.count('foundry_heart') > 0), `+${W.money - m9}`);
check('...and its deed', DEEDS.find((d) => d.key === 'foundry_sleeps')!.check(W, W.playerChars()));
check('...and nothing more comes', (() => { const n = cs.squads.length; S.clock.t += DAY * 3; tickCrisis(2.1); tickCrisis(2.1); return cs.squads.length <= n && cs.state === 'resolved'; })());

// the debug hook wakes it without the wait (a fresh state)
delete W.flags.crises.foundry;
check('the crisis can be woken and sent on its way at once (for testing)', wakeCrisis('foundry', true) && !!sendWave() && crisisState().squads.length === 1);

// ---------------------------------------------------------------- what the tracker says
check('currentGoal points somewhere real', (() => { const g = currentGoal(); return !!g && !!g.text && (!g.where || (g.where.x > 0 && g.where.z > 0)); })(), currentGoal()?.text);
check('the land is still exactly as it was built, after all of this', worldHash() === BASE_HASH);

const failed = results.filter((x) => !x[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
