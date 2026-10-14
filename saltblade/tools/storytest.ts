// Headless check of the stories and the crises added for breadth. The Broken
// Chain (Brokenchain) and the Horn's Challenge (Hornspire) are each driven
// from what opens them to their capstones through the game's own systems:
// shackles picked and a cage opened at Chainfield (seen at it, and the law
// wants you), the freed walking with you to the reeds and staying there, a
// named overseer on the road, a reprisal held; a duel in the Pit lost, then
// forfeited when someone else of yours joins in, then won (and your other
// people do not jump in on their own), a great beast on the Cragfold road, a
// swarm held at Cragfold. On the way: the givers' questions and the refusal,
// the townsfolk's gossip and the rumours that point at a giver, a giver's
// death and the heir who speaks for them, the journal's and the tracker's
// view, and a save and load in the middle of each story, as the game saves
// (told against what the land's seed makes). Then the Reaver Muster: woken a
// month after the Free Road, waiting its turn behind the Foundry, warbands on
// the free towns and every other wave on your base, a town counted held or
// sacked, saved and loaded with its waves out, and over when its warlord is
// brought down; and an older save's Foundry, kept the old way, still read.
// Usage: npx tsx tools/storytest.ts
import { generateWorld } from '../src/world/gen';
import { Nav } from '../src/world/nav';
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock, HOUR, DAY } from '../src/sim/clock';
import { RNG } from '../src/core/rng';
import { Weather } from '../src/sim/weather';
import { simStep } from '../src/sim/sim';
import { tickSquads } from '../src/sim/squads';
import { tickWorldEvents, defence } from '../src/sim/worldevents';
import { tickRaids } from '../src/sim/raids';
import { structuresIn, townRings } from '../src/sim/structures';
import { buildSeedWorld } from '../src/world/seedworld';
import { peekUid } from '../src/sim/inventory';
import { serialize, apply, markBase } from '../src/sim/save';
import { populateTown } from '../src/sim/populate';
import { placeSite, finishSite, playerBase } from '../src/sim/base';
import { BUILDABLE } from '../src/content/buildables';
import { Squad } from '../src/sim/squad';
import { makePerson } from '../src/sim/spawn';
import { kill, knockOut } from '../src/sim/health';
import { treeFor, choose, say, type DCtx } from '../src/sim/dialogue';
import { rumour } from '../src/content/lines';
import { DEEDS } from '../src/sim/deeds';
import { FACTION } from '../src/content/factions';
import { STORY, CRISIS_DEF, RUNAWAY, CHAMPION, SMITH } from '../src/content/contracts';
import { tickContracts, currentGoal, goalMarks } from '../src/sim/contracts';
import { storyState, storyViews, storyGoal, storyGossip, tickStories, setStoryStep } from '../src/sim/stories';
import { crisisState, crisisView, crisisViews, wakeCrisis, sendWave, tickCrisis, activeCrisis } from '../src/sim/crisis';
import { siteById, siteByKey, duelRing } from '../src/sim/errands';
import { ANIMAL } from '../src/content/animals';
import { SK } from '../src/sim/skills';
import { threat } from '../src/sim/worldsim';
import { placeInto } from '../src/sim/use';
import { freeFromCage } from '../src/sim/orders';
import { emit } from '../src/core/events';
import type { TownInfo } from '../src/world/towns';
import type { Char } from '../src/sim/char';
import type { Site } from '../src/world/terrain';

const T = await generateWorld(1337, () => {});
const nav = new Nav(T);
let W = new World();
Object.assign(S, { W, T, nav, clock: new Clock(), rng: new RNG(5150), time: 0 });
S.clock.t = DAY + 9 * HOUR;
S.weather = new Weather();
S.weather.seed();
nav.structures = structuresIn;
nav.rings = townRings;
const notices: string[] = [];
S.fx = { ...S.fx, notice: (t: string) => { notices.push(t); }, say: () => {}, sound: () => {}, burst: () => {}, hit: () => {}, shot: () => {}, died: () => {}, ko: () => {} } as typeof S.fx;
// the world as a new game makes it, remembered as the base its saves are told against
const id0 = W.nextId, uid0 = peekUid();
buildSeedWorld(W, T);
markBase(W, id0, uid0);

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const copy = (d: any) => JSON.parse(JSON.stringify(d));
/** A save as the game makes it, read back into a world of its own, which becomes the world. */
function reload(): { data: any; w: World } {
  const data = copy(serialize());
  const w = new World();
  apply(data, w);
  w.rebuildObjHash();
  S.W = W = w;
  return { data, w };
}

// ---------------------------------------------------------------- a band, and the helpers
const sq = new Squad(); sq.faction = 'player'; sq.kind = 'player'; sq.name = 'Test'; W.addSquad(sq); W.playerSquads.push(sq.id);
const rng = new RNG(31);
const put = (c: Char, x: number, z: number) => { const p = nav.nearestOpen(x, z, 30) ?? [x, z]; c.x = p[0]; c.z = p[1]; c.y = T.heightAt(c.x, c.z); c.path = null; c.hasGoal = false; };
function mine(level: number, x: number, z: number): Char {
  const c = makePerson(W, { faction: 'drifters', role: 'merc', level, loadout: 'merc', race: 'valefolk', whole: true }, rng);
  c.faction = 'player'; c.role = 'player'; W.moveToSquad(c, W.squads.get(W.playerSquads[0])!);
  put(c, x, z); c.hunger = 280;
  return c;
}
const site = (k: string) => siteByKey(k)!;
const bc = site('brokenchain'), cf = site('chainfield'), hs = site('hornspire'), cg = site('cragfold'), roost = site('reaversroost'), cr = site('crossroad');
let lead = mine(40, bc.x + bc.r + 40, bc.z);
let second = mine(30, lead.x + 2, lead.z + 1);
W.money = 5000;
const me = () => W.char(lead.id)!;
const step = (secs: number, focus: { x: number; z: number }) => {
  for (let i = 0; i < secs / 0.1; i++) { simStep(0.1, focus); tickSquads(0.1); tickRaids(0.1); tickContracts(0.1); }
};
const populate = (s: Site) => { if (!W.populated.has(s.id)) populateTown(W, W.towns.get(s.id)!); };
/** A conversation, as the dialogue window runs it: a node's effect when shown, then its words and choices. */
function talk(n: Char, p: Char) {
  const [tree, start] = treeFor(n, p);
  const ctx: DCtx = { p, n, vars: {} };
  let node = start;
  tree[node].fx?.(ctx);
  const live = () => (tree[node]?.ch ?? []).filter((c) => !c.if || c.if(ctx));
  return {
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
const giverOf = (key: string) => { const id = storyState(key).giver; return id ? W.char(id) : undefined; };
const standing = (f: string) => W.rel.get('player', f);
const ticks = (n = 1) => { for (let i = 0; i < n; i++) tickStories(1.1); };

// ================================================================ The Broken Chain
const bk = STORY.brokenchain;
ticks();
check('the Broken Chain waits until you have done something for the chained', storyState('brokenchain').state === 'locked');
// the townsfolk talk of it while it waits, and someone asked for news points at its giver
const gossip = storyGossip('unchained');
const asked = makePerson(W, { faction: 'unchained', role: 'resident', race: 'duneborn' }, rng); put(asked, bc.x, bc.z);
let pointed = '';
for (let i = 0; i < 60 && !pointed; i++) { const r = rumour(asked); if (r.includes('Iyabo')) pointed = r; }
check('...the townsfolk talk of it, and someone asked for news points you at its giver', gossip.length >= 2 && gossip.some((l) => l.join(' ').includes('Voice')) && !!pointed, pointed.slice(0, 90));
W.removeChar(asked);
W.flags.freed = 1; // (a slave set loose, somewhere)
ticks();
check('...a slave set free and it opens, and word comes to you', storyState('brokenchain').state === 'open' && notices.some((n) => n === bk.call), notices[notices.length - 1]);
populate(bc);
ticks();
const iyabo = giverOf('brokenchain')!;
check('its giver stands in Brokenchain', !!iyabo && iyabo.name === bk.giver.name && iyabo.site === bc.id && iyabo.title === bk.giver.title, `${iyabo?.name}, ${iyabo?.title}`);
put(me(), iyabo.x + 1.2, iyabo.z + 1.2);
let tk = talk(iyabo, me());
const opts0 = tk.opts();
check('...and has something to say for herself, with real choices: questions, yes, and no', tk.text() === bk.steps[0].say && opts0.some((o) => o.includes('Who are you?')) && opts0.some((o) => o.includes('What\'s in it for me?')) && opts0.some((o) => o.includes('That\'s not my fight')) && opts0.some((o) => o.includes('I\'m in')) && !opts0.some((o) => o.includes('I wore their irons')), opts0.join(' / '));
tk.pick('Who are you?');
check('...she answers, and the talk goes on', tk.node() === 'answer' && tk.text().includes('nineteen years') && tk.pick('Something else.') && tk.node() === 'start');
const un0 = standing('unchained');
tk.pick('That\'s not my fight.');
const bs = storyState('brokenchain');
check('turning her down costs a little standing; the offer stands, and the tracker stops nagging', !!bs.refused && bs.state === 'open' && standing('unchained') === un0 - bk.refuse!.cost && storyGoal()?.entry !== 'story:brokenchain', `${un0} -> ${standing('unchained')}`);
tk = talk(iyabo, me());
check('...come back, and she remembers', tk.text() === bk.refuse!.back && tk.opts().some((o) => o.includes('I\'m in, after all')), tk.text());
tk.pick('I\'m in, after all.');
check('...take it on after all, and the first step is set going: set three free at Chainfield', bs.state === 'active' && bs.step === 1 && bs.e?.kind === 'free' && bs.e.site === cf.id && !bs.refused && storyGoal()?.text.includes('Chainfield') === true, storyGoal()?.text);

// ---------------------------------------------------------------- at Chainfield: shackles, and a cage
populate(cf);
const slaves = [...W.chars.values()].filter((c) => c.site === cf.id && c.role === 'slave' && c.shackled && c.alive);
const lp = me();
lp.sk[SK.lockpicking] = 95;
// a count kept broken (a save edited by hand) is mended, not tripped over every second
(bs.e as any).freed = 'x';
let threw = '';
try { ticks(2); storyViews(); currentGoal(); goalMarks(); } catch (err: any) { threw = String(err?.message ?? err); }
check('a free step\'s count kept broken is put to rights, not thrown over every second', !threw && bs.e?.kind === 'free' && (bs.e.freed === undefined || Array.isArray(bs.e.freed)), threw);
// your own captives are not the camp's to free: one of yours let out of a Chainfield pen, a slave of yours unchained beside it
{
  const pen0 = [...W.objs.values()].find((o) => o.kind === 'cage' && o.site === cf.id && !o.occupant)!;
  const bandit = makePerson(W, { faction: 'reavers', role: 'bandit', level: 30 }, rng); put(bandit, pen0.x, pen0.z);
  placeInto(lp, bandit, pen0);
  freeFromCage(bandit.id); emit('sim:freedCaptive', lp.id, bandit.id);
  const mine2 = makePerson(W, { faction: 'drifters', role: 'slave', level: 30 }, rng);
  mine2.shackled = true; mine2.mem.enslavedBy = 'player'; put(mine2, cf.x + cf.r + 60, cf.z + 90);
  const freed0 = W.flags.freed, un2 = standing('unchained');
  put(lp, mine2.x + 1, mine2.z); lp.order = { k: 'free', id: mine2.id };
  for (let u = 0; u < 300 && mine2.shackled; u += 0.5) step(0.5, lp);
  check('...your own captive let out of a Chainfield pen, and your own slave unchained beside it, count for nothing (and win no friends)', (bs.e?.freed?.length ?? 0) === 0 && !mine2.shackled && W.flags.freed === freed0 && standing('unchained') === un2 && !(lp.bounty.chainhouse > 0), `freed ${bs.e?.freed?.length ?? 0}; flags.freed ${freed0} -> ${W.flags.freed}`);
  W.removeChar(bandit); W.removeChar(mine2); lp.order = null;
}
// one freed under an overseer's eye: the law wants you for it
const [s1, s2] = slaves;
const overseer = [...W.chars.values()].find((c) => c.site === cf.id && c.faction === 'chainhouse' && (c.role === 'guard' || c.role === 'patrol') && c.up)!;
const quiet = (c: Char) => { put(c, cf.x + cf.r + 120, cf.z + 40); };
quiet(s1); put(lp, s1.x + 1, s1.z);
put(overseer, s1.x + 4, s1.z + 2); overseer.dir = Math.atan2(lp.x - overseer.x, lp.z - overseer.z); overseer.homeX = overseer.x; overseer.homeZ = overseer.z;
lp.order = { k: 'free', id: s1.id };
let t = 0;
for (; t < 300 && s1.shackled; t += 0.5) step(0.5, lp);
check('pick a slave\'s shackles under an overseer\'s eye, and they go free, and the Chainhouse wants you for it', !s1.shackled && (lp.bounty.chainhouse ?? 0) > 0 && (bs.e?.freed ?? []).includes(s1.id), `${t.toFixed(0)} s; bounty ${lp.bounty.chainhouse ?? 0}`);
lp.bounty = {}; for (const c of W.chars.values()) if (c.faction === 'chainhouse') { c.brain.enemy = 0; c.target = 0; }
put(overseer, cf.x, cf.z);
// one quietly, out in the fields
put(s2, cf.x + cf.r + 110, cf.z - 70); put(lp, s2.x + 1, s2.z);
lp.order = { k: 'free', id: s2.id };
for (t = 0; t < 300 && s2.shackled; t += 0.5) step(0.5, lp);
check('...one more, unseen in the fields, and nobody is the wiser', !s2.shackled && !(lp.bounty.chainhouse > 0) && bs.e?.freed?.length === 2, `${t.toFixed(0)} s`);
// and a captive in one of the pens, waiting to be sold
const pen = [...W.objs.values()].find((o) => o.kind === 'cage' && o.site === cf.id && !o.occupant)!;
const captive = makePerson(W, { faction: 'drifters', role: 'wanderer', race: 'valefolk' }, rng);
put(captive, pen.x, pen.z); pen.occupant = captive.id; captive.cage = pen.id; captive.mem.prisonerOf = 'chainhouse';
for (const c of W.chars.values()) if (c.faction === 'chainhouse' && Math.hypot(c.x - pen.x, c.z - pen.z) < 40 && c !== captive) put(c, cf.x + 60, cf.z + 60);
put(lp, pen.x + 1.5, pen.z);
lp.order = { k: 'lockpick', obj: pen.id };
for (t = 0; t < 300 && captive.cage; t += 0.5) step(0.5, lp);
ticks();
check('...and a captive let out of a pen: three set free, and the step is done', !captive.cage && bs.step === 2 && bs.log.length === 2, `${t.toFixed(0)} s; step ${bs.step}`);
const freed = [s1, s2, captive];

// ---------------------------------------------------------------- the reed road
const ee = bs.e!;
const party = W.squads.get(ee.squad!);
check('the ones you freed gather to walk to Brokenchain with you, nobody\'s property now', ee.kind === 'escort' && !!party && freed.every((c) => party.members.includes(c.id) && c.title === RUNAWAY && !c.shackled && !c.mem.enslavedBy) && ee.paused === true, `${party?.members.length} of them`);
check('...free folk of the road now, nothing for the camp to fight over on their way out', freed.every((c) => c.faction === 'drifters' && !W.rel.hostile('chainhouse', c.faction) && !W.rel.hostile('unchained', c.faction)), freed.map((c) => c.faction).join(', '));
(ee as any).party = 'x';
threw = '';
try { ticks(2); storyViews(); currentGoal(); } catch (err: any) { threw = String(err?.message ?? err); }
check('...a walk\'s party kept broken is put to rights, and the walk goes on', !threw && bs.e === ee && ee.party === undefined && W.squads.has(party!.id), threw);
const pl = W.char(party!.leader)!;
const d0 = Math.hypot(pl.x - bc.x, pl.z - bc.z);
put(lp, pl.x + 2, pl.z + 2); lp.order = { k: 'follow', id: pl.id };
for (t = 0; t < 90; t += 2) { step(2, pl); if (Math.hypot(lp.x - pl.x, lp.z - pl.z) > 30) { put(lp, pl.x + 2, pl.z + 2); lp.order = { k: 'follow', id: pl.id }; } }
const d1 = Math.hypot(pl.x - bc.x, pl.z - bc.z);
check('...they walk with your people beside them', ee.paused === false && d1 < d0 - 30, `${Math.round(d0)} -> ${Math.round(d1)} m from Brokenchain`);
// (the one from the pens catches the others up, out past the overseers)
for (let u = 0; u < 300 && Math.hypot(captive.x - pl.x, captive.z - pl.z) > 30; u += 2) { step(2, pl); if (Math.hypot(lp.x - pl.x, lp.z - pl.z) > 30) { put(lp, pl.x + 2, pl.z + 2); lp.order = { k: 'follow', id: pl.id }; } }
check('...the one from the pens with them, out past the overseers, unharmed', captive.up && !captive.carriedBy && !captive.shackled && captive.squad === party!.id && Math.hypot(captive.x - pl.x, captive.z - pl.z) < 40, `${captive.status}, ${Math.round(Math.hypot(captive.x - cf.x, captive.z - cf.z) - cf.r)} m past the camp's edge, ${Math.round(Math.hypot(captive.x - pl.x, captive.z - pl.z))} m from the others`);
lp.order = null; put(lp, pl.x + 400, pl.z + 400);
step(4, pl);
check('...and wait where they are when you leave them', ee.paused === true);
// (the rest of the road, walked a little nearer the reeds)
const nearX = bc.x + (pl.x - bc.x) * (90 / d1), nearZ = bc.z + (pl.z - bc.z) * (90 / d1);
for (const id of party!.members) put(W.char(id)!, nearX, nearZ);
put(lp, nearX + 2, nearZ + 2);
ee.ri = ee.route!.length / 2 - 1;
lp.order = { k: 'follow', id: pl.id };
for (t = 0; t < 240 && bs.step === 2; t += 2) step(2, pl);
const settled = freed.filter((c) => c.site === bc.id && c.recruitable && c.faction === 'unchained' && !c.mem.errand);
check('...walked into Brokenchain, they stay: its people now, glad to walk with you if asked', bs.step === 3 && settled.length === 3 && !W.squads.has(party!.id), `${t} s; ${settled.length} settled`);
check('...and one asked will come', treeFor(settled[0], lp)[1] === 'start' && talk(settled[0], lp).opts().some((o) => o.includes('Join me')));

// ---------------------------------------------------------------- saved on the catchers' road, and loaded
const varga0 = bs.e!.whoId!;
const before = { step: bs.step, kind: bs.e!.kind, varga: W.char(varga0)?.name };
const { data } = reload();
const bs2 = storyState('brokenchain');
const varga = W.char(bs2.e?.whoId ?? 0);
check('a save on the Saltmere road (told against the seed\'s base) and a load: the story, Varga and her catchers are all there', !!data.base && data.objs.length < 400 && bs2.step === before.step && bs2.e?.kind === 'hunt' && varga?.name === 'Varga' && varga.title === bk.steps[3].whoTitle && W.squadOf(varga)!.members.length === 5, `${data.objs.length} things told against the base; Varga and ${W.squadOf(varga!)!.members.length - 1}`);
lead = W.char(lead.id)!; second = W.char(second.id)!;
check('...and the freed are still Brokenchain\'s, and still glad to walk with you', freed.every((c) => { const x = W.char(c.id); return !!x && x.site === bc.id && x.recruitable && x.faction === 'unchained'; }));
(bs2.e as any).whoId = 'x';
ticks();
check('...a quarry kept broken is found again: the leader of her band', bs2.step === 3 && bs2.e?.kind === 'hunt' && bs2.e.whoId === varga!.id && !bs2.retry);
const roadOk = Math.hypot(varga!.x - cf.x, varga!.z - cf.z) < Math.hypot(site('saltmere').x - cf.x, site('saltmere').z - cf.z);
knockOut(varga!);
ticks();
check('Overseer Varga, out on the road between Chainfield and Saltmere, down: the next step is the reprisal', roadOk && bs2.step === 4 && bs2.e?.kind === 'defend' && bs2.e.site === bc.id);

// ---------------------------------------------------------------- the giver's death, and the heir
const iy = W.char(bs2.giver!)!;
kill(iy);
ticks();
check('the Voice of Brokenchain killed: nobody speaks for her at once', bs2.giver === iy.id && !!bs2.giverLost);
S.clock.t += 13 * HOUR;
ticks();
const corin = giverOf('brokenchain')!;
check('...but half a day on, her heir does, and the story goes on with them', !!corin && corin.id !== iy.id && corin.name === bk.giver.heir && corin.title === bk.giver.title && corin.alive && talk(corin, me()).text().includes(bk.steps[4].text), `${corin?.name}, ${corin?.title}`);

// ---------------------------------------------------------------- the reprisal, and the end
put(me(), bc.x + 8, bc.z + 8);
ticks();
const rep = W.squads.get(bs2.e!.squad ?? 0);
check('...the reprisal comes once you are there to meet it: Chainhouse catchers, from out of sight', !!rep && rep.faction === 'chainhouse' && rep.flags.townRaid === bc.id && rep.members.every((id) => Math.hypot(W.char(id)!.x - bc.x, W.char(id)!.z - bc.z) > 400), `${rep?.members.length} of them`);
for (const id of rep!.members) kill(W.char(id)!);
ticks();
check('...beaten, the story asks you back', bs2.step === 5 && bk.steps[5].kind === 'talk');
const cfSlaves = [...W.chars.values()].filter((c) => c.site === cf.id && c.role === 'slave' && c.alive).length;
const pens = [...W.objs.values()].filter((o) => (o.kind === 'cage' || o.kind === 'shackle_post') && o.site === cf.id);
const band0 = W.playerChars().length, un1 = standing('unchained'), ch1 = standing('chainhouse');
put(me(), corin.x + 1.2, corin.z + 1.2);
tk = talk(corin, me());
tk.pick('Thank you.');
const runaways = [...W.chars.values()].filter((c) => c.site === bc.id && c.alive && c.recruitable && c.title === RUNAWAY);
const forge = [...W.shops.values()].find((sh) => sh.site === bc.id && sh.kind === 'weapons');
const smith = forge ? W.char(forge.keeper) : undefined;
check('the capstone: the pens at Chainfield stand open, and their people walk to Brokenchain', bs2.state === 'done' && pens.every((o) => !o.occupant && !o.locked) && [...W.chars.values()].filter((c) => c.site === cf.id && c.role === 'slave' && c.alive).length === 0 && runaways.length >= 3 + cfSlaves, `${cfSlaves} from the fields; ${runaways.length} runaways in Brokenchain; ${pens.length} pens`);
check('...Brokenchain has a smith of its own now', !!forge && !!smith && smith.site === bc.id && treeFor(smith, me())[0] !== treeFor(runaways[0], me())[0], forge?.name);
check('...the Unchained call you Chainbreaker; the Chainhouse remembers too; and its deed', me().title === 'Chainbreaker' && standing('unchained') > un1 && standing('chainhouse') < ch1 && W.playerChars().length === band0 && DEEDS.find((d) => d.key === 'broken_chain')!.check(W, W.playerChars()));
{
  const { data: d4 } = reload();
  lead = W.char(lead.id)!; second = W.char(second.id)!;
  const fid = W.flags.forge as number;
  const counter = W.objs.get(fid), sh = W.shops.get(fid), info = W.towns.get(bc.id) as TownInfo;
  check('the Chain Forge is a counter in Brokenchain\'s square, one of its shops, through a save and load', !!d4.base && counter?.kind === 'counter' && counter.site === bc.id && Math.hypot(counter.x - bc.x, counter.z - bc.z) < bc.r && info.shops.some((x) => x.counter.id === fid) && W.char(sh?.keeper ?? 0)?.name === SMITH.name, `${sh?.name}, kept by ${W.char(sh?.keeper ?? 0)?.name}`);
  kill(W.char(sh!.keeper)!);
  for (let h = 0; h < 30; h++) { S.clock.t += HOUR; tickWorldEvents(6.1); }
  const k2 = W.char(W.shops.get(fid)?.keeper ?? 0);
  check('...and with Dele killed, someone keeps the forge again a day on', !!k2 && k2.alive && k2.name !== SMITH.name && k2.shop === String(fid) && !W.flags.shut?.[fid], `${k2?.name}, ${k2?.title}`);
}

// ================================================================ The Horn's Challenge
const hk = STORY.horn;
W.flags.pitWins = 0; // (a bout won in the Pit)
ticks();
check('the Horn\'s Challenge opens with a bout won in the Pit', storyState('horn').state === 'open' && notices.includes(hk.call));
populate(hs);
ticks();
const ukka = giverOf('horn')!;
put(me(), ukka.x + 1.2, ukka.z + 1.2);
tk = talk(ukka, me());
check('Horn-Mother Ukka, at Hornspire, with her own questions, yes, and no', ukka.name === hk.giver.name && tk.opts().some((o) => o.includes('Why fight your champion?')) && tk.opts().some((o) => o.includes('not fighting your champion')), tk.opts().join(' / '));
tk.pick('I\'m in.');
const hsS = storyState('horn');
check('...take it on: a duel in the Pit, one on one', hsS.state === 'active' && hsS.e?.kind === 'duel' && hsS.e.duelist === me().id && storyGoal()?.text.includes('Gorr') === true);
const rg = duelRing(hs);
// a duel lost: tried again
put(me(), rg.x + 1, rg.z);
ticks();
const gorr = W.char(hsS.e!.whoId ?? 0)!;
check('step into the ring and Gorr Stonebrow steps in to meet you', !!gorr && gorr.name === CHAMPION.name && gorr.mem.bout === me().id && me().mem.bout === gorr.id && Math.hypot(gorr.x - rg.x, gorr.z - rg.z) < rg.r + 2, `${gorr?.name}, ${gorr?.title}`);
const armed0 = hsS.e!.armedT!;
step(1, rg);
(hsS.e as any).whoId = 'x';
ticks();
check('...a duel kept broken mid-fight is fought again from the start, not handed to you', hsS.step === 1 && !hsS.retry && hsS.e?.kind === 'duel' && hsS.e.state === 'open' && hsS.e.whoId === gorr.id && (hsS.e.armedT ?? 0) > armed0 && gorr.mem.bout === me().id && me().mem.bout === gorr.id, `begun at ${armed0.toFixed(1)}, again at ${hsS.e?.armedT?.toFixed(1)}`);
knockOut(me());
ticks();
check('...lose, and it fails; the Horn-Mother lets you try again', hsS.retry === true && !hsS.e && !gorr.mem.bout && !me().mem.bout && notices.some((n) => n.includes('put') && n.includes('down')), notices[notices.length - 1]);
me().status = 'up'; me().body.koT = 0; for (let l = 0; l < 7; l++) me().body.hp[l] = me().body.max[l];
put(me(), ukka.x + 1.2, ukka.z + 1.2);
tk = talk(ukka, me());
tk.pick('Let\'s try it again.');
put(me(), rg.x + 1, rg.z);
ticks();
const gorr2 = W.char(hsS.e!.whoId ?? 0)!;
check('...the same champion steps in again', gorr2?.id === gorr.id);
// your other people stay out of it on their own, even the eager ones
const sec = W.char(second.id)!;
sec.combatMode = 'aggressive'; put(sec, rg.x + rg.r + 4, rg.z); sec.order = null;
// (the two of them kept on their feet while we watch: the fight is not the point here)
// (their vitals ten times their measure for the while, so no single blow of the champion's puts anyone down inside a step)
const mend = (c: Char) => { for (let l = 0; l < 7; l++) c.body.hp[l] = c.body.max[l]; c.body.blood = c.body.bloodMax; };
const brace = (c: Char, k: number) => { for (let l = 0; l < 3; l++) c.body.max[l] *= k; mend(c); };
brace(gorr, 10); brace(me(), 10);
let joinedIn = false;
for (let i = 0; i < 24; i++) { mend(gorr); mend(me()); step(0.5, rg); if (sec.brain.enemy === gorr.id || gorr.lastHitBy === sec.id) joinedIn = true; }
brace(gorr, 0.1); brace(me(), 0.1);
ticks();
// (blows come slower than they did: whether the champion has been hit by now is the dice's; that it was not the second is the point)
check('...your eager ones do not jump in on their own: a duel is nobody else\'s fight', !joinedIn && !hsS.retry && gorr.lastHitBy !== sec.id && me().up && gorr.up, `Gorr last hit by ${W.char(gorr.lastHitBy)?.name ?? 'nobody'}; ${sec.name} ${sec.combatMode}, ${Math.round(Math.hypot(sec.x - gorr.x, sec.z - gorr.z))} m off`);
// ...but one sent in forfeits it
gorr.lastHitBy = sec.id; gorr.lastHitT = S.time;
ticks();
check('...one of them sent in, and the Horn calls it forfeit', hsS.retry === true && notices.some((n) => n.includes('calls it forfeit')), notices[notices.length - 1]);
put(me(), ukka.x + 1.2, ukka.z + 1.2);
talk(ukka, me()).pick('Let\'s try it again.');
put(sec, ukka.x + 30, ukka.z + 30); sec.combatMode = 'defensive';
put(me(), rg.x + 1, rg.z);
ticks();
knockOut(W.char(hsS.e!.whoId!)!);
ticks();
check('...one on one, and Gorr goes down: the next step is a great beast', hsS.step === 2 && hsS.e?.kind === 'hunt' && hsS.e.species === 'hookbeak');

// ---------------------------------------------------------------- the Old Grey, saved and loaded on the way
const grey0 = W.char(hsS.e!.whoId!)!;
const plain = makePerson(W, { faction: 'drifters', role: 'merc' }, rng); W.removeChar(plain);
const { data: d2 } = reload();
const hs2 = storyState('horn');
const grey = W.char(hs2.e!.whoId!)!;
const kind = ANIMAL.hookbeak;
check('the Old Grey: a hookbeak on the Cragfold road, bigger than the worst of its kind, and it shows (through a save and load)', !!d2.base && grey?.name === 'the Old Grey' && grey.animal === 'hookbeak' && grey.look.bulk >= 1.36 && grey.body.max[1] === grey0.body.max[1] && Math.hypot(grey.x - hs.x, grey.z - hs.z) < Math.hypot(cg.x - hs.x, cg.z - hs.z), `bulk ${grey?.look.bulk.toFixed(2)}, ${kind.name}`);
const dv = storyViews().find((v) => v.def.key === 'horn')!;
check('...and the journal says plainly how hard it is, and to bring help', !!dv.danger && dv.danger.word.length > 0 && dv.danger.what.includes('Old Grey') && /hire spears/.test(dv.step?.text ?? ''), `${dv.danger?.word}: ${dv.danger?.what}`);
kill(grey);
ticks();
check('...brought down, the next step is Cragfold, against the swarm', hs2.step === 3 && hs2.e?.kind === 'defend' && hs2.e.site === cg.id);
populate(cg);
put(me(), cg.x + 6, cg.z + 6);
ticks();
const swarm = W.squads.get(hs2.e!.squad ?? 0)!;
check('...the Blackcomb swarm comes for Cragfold', !!swarm && swarm.faction === 'blackcomb' && swarm.flags.townRaid === cg.id);
for (const id of swarm.members) kill(W.char(id)!);
ticks();
const kr0 = standing('karuk'), band1 = W.playerChars().length, gorrId = gorr.id;
put(me(), W.char(hs2.giver!)!.x + 1.2, W.char(hs2.giver!)!.z + 1.2);
talk(W.char(hs2.giver!)!, me()).pick('Thank you.');
const joined = W.playerChars().find((c) => c.title === CHAMPION.title);
check('the capstone: Gorr Stonebrow, the one you beat, walks with you; Horn-Sworn; the Horn King\'s maul; and its deed', hs2.state === 'done' && W.playerChars().length === band1 + 1 && joined?.id === gorrId && me().title === 'Horn-Sworn' && W.playerChars().some((c) => c.inv.items.some((it) => it.id === 'arena_maul' && it.q === 5)) && standing('karuk') >= Math.min(100, kr0 + 20) && DEEDS.find((d) => d.key === 'horn_sworn')!.check(W, W.playerChars()), joined?.name);

// ---------------------------------------------------------------- the journal, the tracker and the map, with every story
const views = storyViews();
check('the journal lists all five stories, each saying where it stands', views.length === 5 && views.find((v) => v.def.key === 'brokenchain')?.s.state === 'done' && views.find((v) => v.def.key === 'horn')?.s.state === 'done', views.map((v) => `${v.def.key} ${v.s.state}`).join(', '));

// ---------------------------------------------------------------- every step, as the debug helper jumps to it
for (const key of ['brokenchain', 'horn']) {
  const d = STORY[key], st = storyState(key);
  const got: string[] = [];
  let ok = true;
  for (let i = 1; i < d.steps.length; i++) {
    setStoryStep(key, i, me());
    // (a walk with the freed, jumped to with nobody freed, is a walk there)
    const want = d.steps[i].kind === 'talk' ? undefined : d.steps[i].kind === 'escort' && d.steps[i].party ? 'reach' : d.steps[i].kind;
    got.push(`${i} ${st.e?.kind ?? 'talk'}`);
    ok &&= st.state === 'active' && st.step === i && st.e?.kind === want && !st.retry && !!storyViews().find((v) => v.def.key === key)?.step;
  }
  setStoryStep(key, d.steps.length);
  check(`the debug helper sets ${d.name} going at any step`, ok && st.state === 'done' && !st.e, got.join(', '));
}

// ================================================================ The Reaver Muster
const md = CRISIS_DEF.muster;
// the Free Road done (a month of quiet bought on the roads): the muster comes after it
setStoryStep('freeroad', 99, me());
const fr = storyState('freeroad');
fr.log = [{ step: 4, t: S.clock.t }];
const doneAt = S.clock.t;
S.clock.t = doneAt + 29 * DAY;
tickCrisis(2.1);
check('the Reaver Muster does not come while the Free Road\'s month of quiet lasts', crisisState('muster').state === 'none');
// ...and waits its turn while the Foundry marches
wakeCrisis('foundry', true);
S.clock.t = doneAt + 31 * DAY;
tickCrisis(2.1); tickCrisis(2.1);
check('...nor while another crisis is awake and marching: only one at a time', crisisState('muster').state === 'none' && activeCrisis()?.key === 'foundry');
const fcs = crisisState('foundry');
fcs.state = 'quiet'; fcs.since = S.clock.t;
S.clock.t += HOUR + 60;
tickCrisis(2.1);
const mcs = crisisState('muster');
const grath = W.char(mcs.leader ?? 0)!;
check('...once it rests, the drums start at Reaver\'s Roost: a warning, and Grath Ashjaw with his guards', mcs.state === 'warning' && mcs.site === roost.id && grath?.name === md.leader.name && grath.title === md.leader.title && grath.faction === 'reavers' && Math.hypot(grath.x - roost.x, grath.z - roost.z) < roost.r && W.squadOf(grath)!.members.length === 1 + md.guards.n && notices.some((n) => n.startsWith(md.name)), `${grath?.name} at ${siteById(mcs.site)?.name}`);
check('...the tracker and the journal say what to do, and how hard breaking him would be (for a band this size: hold)', /Grath Ashjaw/.test(currentGoal()?.text ?? '') && /beyond your band/.test(currentGoal()?.text ?? '') && currentGoal()?.entry === 'crisis:muster' && crisisViews()[0]?.key === 'muster' && crisisView('muster').danger.level >= 3 && goalMarks().some((m) => m.kind === 'crisis' && m.label.includes('Grath')), `${currentGoal()?.text}; breaking him: ${crisisView('muster').danger.word}`);
tickCrisis(2.1);
check('...no warband in the warning day', mcs.squads.length === 0);
S.clock.t += DAY + 60;
tickCrisis(2.1); tickCrisis(2.1);
const wb1 = W.squads.get(mcs.squads[0]!)!;
const town1 = siteById(wb1?.flags.townRaid);
check('then the first warband marches on a free town, and the free towns call for help', mcs.state === 'waves' && !!wb1 && !!town1 && town1.faction === 'drifters' && wb1.faction === 'reavers' && wb1.members.every((id) => W.char(id)!.faction === 'reavers') && notices.some((n) => n.includes('call for help')), `${wb1?.name}: ${wb1?.members.length} on ${town1?.name}`);
check('...and the tracker sends you there', currentGoal()?.where?.x === town1?.x && /marching on/.test(currentGoal()!.text), currentGoal()?.text);
const wbT = wb1.members.reduce((a, id) => a + threat(W.char(id)!), 0), walls1 = defence(town1!);
check('...a warband strong enough to take a town, but not so much stronger than its walls that it cannot hold alone now and then', wbT <= walls1 * 1.2 + 1 && wbT >= walls1 * 0.5, `${Math.round(wbT)} against ${Math.round(walls1)}`);
// a town left to itself: held or sacked, it is counted
const wl = W.char(wb1.leader)!;
for (const id of wb1.members) put(W.char(id)!, town1!.x + 20, town1!.z + 20);
for (const c of W.playerChars()) put(c, roost.x - 3000, roost.z - 3000);
for (let i = 0; i < 4; i++) tickWorldEvents(6.1);
for (let i = 0; i < 3; i++) tickCrisis(2.1);
check('...a town left to hold alone is counted, held or sacked', (mcs.towns?.hit ?? 0) === 1 && wb1.flags.counted === true, `${town1!.name}: ${mcs.towns?.sacked ? 'sacked' : 'held'}${wl ? '' : ''}`);
// a base of yours: every other wave comes for it too
const bx = cr.x + 900, bz = cr.z + 700;
const [hx, hz] = nav.nearestOpen(bx, bz, 60)!;
for (const [k, dx, dz] of [['shack', 0, 0], ['chest', 8, 0], ['bedroll', -6, 4], ['campfire', 4, 8]] as [string, number, number][]) {
  const at = nav.nearestOpen(hx + dx, hz + dz, 12)!;
  if (BUILDABLE[k]) finishSite(placeSite(BUILDABLE[k], at[0], at[1], 0), true);
}
for (const c of W.playerChars()) put(c, hx + 3, hz + 3);
for (const id of mcs.squads) for (const m of W.squads.get(id)?.members ?? []) { const c = W.char(m); if (c?.up) kill(c); }
for (let i = 0; i < 3; i++) tickCrisis(2.1);
S.clock.t = (mcs.next ?? S.clock.t) + 60;
const n0 = mcs.squads.length;
tickCrisis(2.1); tickCrisis(2.1);
const wave2 = mcs.squads.slice(n0).map((id) => W.squads.get(id)!).filter(Boolean);
check('...with a base of yours, the second wave comes for it as well as a free town', !!playerBase() && wave2.length === 2 && wave2.some((q) => q.flags.baseRaid) && wave2.some((q) => !!q.flags.townRaid) && wave2.some((q) => q.members.some((id) => W.char(id)?.animal === 'dunehound')), wave2.map((q) => `${q.name} ${q.flags.baseRaid ? 'on your base' : `on ${siteById(q.flags.townRaid)?.name}`} (${q.members.length})`).join('; '));
// saved with the warbands out, and loaded
const out0 = mcs.squads.length, w0 = mcs.wave;
const { data: d3 } = reload();
const m2 = crisisState('muster');
const grath2 = W.char(m2.leader ?? 0);
check('a save with the warbands out, and a load: the muster, its warlord and its warbands are all found again', !!d3.base && m2.state === 'waves' && m2.wave === w0 && m2.squads.length === out0 && m2.squads.every((id) => W.squads.has(id)) && grath2?.name === md.leader.name && (m2.towns?.hit ?? 0) >= 2, `${m2.squads.length} warbands out, wave ${m2.wave}`);
threw = '';
try { for (let i = 0; i < 5; i++) tickCrisis(2.1); currentGoal(); goalMarks(); crisisViews(); } catch (e: any) { threw = String(e?.stack ?? e); }
check('...and it goes on from there', !threw, threw.split('\n')[0]);
// the warlord brought down
const money0 = W.money, quiet0 = W.flags.quiet?.reavers ?? 0;
knockOut(grath2!);
tickCrisis(2.1);
check('bring Grath Ashjaw down, and the muster breaks: its reward, the roads quiet for a season, a name, and its deed', m2.state === 'resolved' && W.money === money0 + md.reward.money && (W.flags.quiet?.reavers ?? 0) >= S.clock.t + 44 * DAY && (W.flags.quiet?.reavers ?? 0) > quiet0 && W.playerChars().some((c) => c.title === md.reward.title) && W.playerChars().some((c) => c.inv.count('relic_core') > 0) && DEEDS.find((d) => d.key === 'muster_broken')!.check(W, W.playerChars()), `+${W.money - money0}`);
check('...and its warbands turn for home', m2.squads.every((id) => { const q = W.squads.get(id); return !q || q.flags.homeward || !q.members.some((m) => W.char(m)?.up); }));

// ================================================================ an older save's Foundry, kept the old way
{
  const mind = makePerson(W, { faction: 'machines', role: 'construct' }, rng);
  const fsite = [...T.sites].find((s) => s.kind === 'foundry')!;
  delete W.flags.crises.foundry;
  W.flags.crisis = { state: 'quiet', foundry: fsite.id, mind: mind.id, since: S.clock.t, wave: 5, squads: [], woke: 1 };
  const data = copy(serialize());
  data.flags.crisis = copy(W.flags.crisis); delete data.flags.crises; // (as a save from before kept it)
  const w = new World(); apply(data, w); w.rebuildObjHash(); S.W = W = w;
  const fcs2 = crisisState('foundry');
  check('an older save\'s Foundry (kept the old way, as flags.crisis) is read: where it is, its Mind, resting', fcs2.state === 'quiet' && fcs2.site === fsite.id && fcs2.leader === mind.id && fcs2.wave === 5 && W.flags.crisis === undefined && crisisState('muster').state === 'none', `${siteById(fcs2.site)?.name}`);
  S.clock.t += CRISIS_DEF.foundry.quietDays * DAY + HOUR;
  tickCrisis(2.1);
  check('...and it wakes again when its rest is over, as it always did', fcs2.state === 'warning' && fcs2.wave === 2, fcs2.state);
  W.flags.crisis = { state: 'resolved' }; delete W.flags.crises;
  check('...and a Foundry broken in an older save still counts for its deed', DEEDS.find((d) => d.key === 'foundry_sleeps')!.check(W, W.playerChars()));
}

// ================================================================ the capstone with Chainfield never seen
{
  const w = new World();
  S.W = W = w;
  buildSeedWorld(w, T);
  const sq2 = new Squad(); sq2.faction = 'player'; sq2.kind = 'player'; sq2.name = 'Test'; w.addSquad(sq2); w.playerSquads.push(sq2.id);
  const p = mine(40, bc.x + 8, bc.z + 8);
  populate(bc);
  W.flags.freed = 1;
  ticks();
  setStoryStep('brokenchain', STORY.brokenchain.steps.length - 1, p);
  ticks();
  const g = giverOf('brokenchain')!;
  put(p, g.x + 1.2, g.z + 1.2);
  const unseen = !W.populated.has(cf.id);
  talk(g, p).pick('Thank you.');
  const pens = [...W.objs.values()].filter((o) => (o.kind === 'cage' || o.kind === 'shackle_post') && o.site === cf.id);
  const left = [...W.chars.values()].filter((c) => c.site === cf.id && c.alive && (c.role === 'slave' || c.cage)).length;
  const came = [...W.chars.values()].filter((c) => c.site === bc.id && c.alive && c.title === RUNAWAY).length;
  populate(cf); // (seen at last: nothing comes back)
  const after = [...W.chars.values()].filter((c) => c.site === cf.id && c.alive && (c.role === 'slave' || c.cage)).length;
  check('the capstone with Chainfield never seen: its people are found all the same and walk out, and seeing it later brings none back', unseen && storyState('brokenchain').state === 'done' && W.populated.has(cf.id) && left === 0 && after === 0 && pens.every((o) => !o.occupant && !o.locked) && came >= 6, `${came} runaways in Brokenchain; ${pens.length} pens open; ${after} held at Chainfield after`);
}

const failed = results.filter((x) => !x[1]);
console.log(`\n${results.length - failed.length}/${results.length} checks passed.`);
if (failed.length) process.exitCode = 1;
