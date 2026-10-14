// Stories: a few of the powers of the waste have a cause they will draw you
// into once they know your work. Each is a handful of steps (see
// content/contracts) given by one person in one town, each step an errand,
// and at the end something in the world changes for good. The townsfolk talk
// of a story while it waits for you, so it can be found by listening.
import { S } from './ctx';
import type { Char } from './char';
import type { DCtx, DChoice, Tree } from './dialogue';
import { RNG, hash3, hashStr } from '../core/rng';
import { makePerson, makeAnimal } from './spawn';
import { Squad } from './squad';
import { STORIES, STORY, SERGEANT, WARBOT, CHAMPION, SMITH, CRISES, type StoryDef, type StoryStep } from '../content/contracts';
import { FACTION } from '../content/factions';
import { ITEM } from '../content/items';
import { RACE } from '../content/races';
import { rumourHooks } from '../content/lines';
import { emit, on } from '../core/events';
import { DAY, HOUR } from './clock';
import { houseOf } from './property';
import { scheduleCrisis } from './crisis';
import { freeFromCage } from './orders';
import { makeShop } from './shops';
import { Grid } from './inventory';
import { populateTown } from './populate';
import {
  Errand, startErrand, checkErrand, releaseErrand, errandWhere, errandProgress, errandDanger, siteById, siteByKey, carried, takeGoods, give, enlist, upMine, settleAt,
  errandSound, mendErrand, type Rating,
} from './errands';
import type { Site } from '../world/terrain';
import type { TownInfo } from '../world/towns';

export interface StoryState {
  /** locked: they do not know you yet; open: they will talk; active: you are on it; done */
  state: 'locked' | 'open' | 'active' | 'done';
  step: number;
  /** the current step's errand (a talk step has none) */
  e?: Errand;
  /** the step failed: the giver will set it going again */
  retry?: boolean;
  /** the person who gives it */
  giver?: number;
  /** when the giver died, so an heir can come */
  giverLost?: number;
  /** steps done, and when */
  log: { step: number; t: number }[];
  /** when you turned the giver down (the offer stands; they remember) */
  refused?: number;
  /** those a free step set loose, for the walk after it */
  freed?: number[];
}

const W = () => S.W;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const STATES = new Set(['locked', 'open', 'active', 'done']);
/**
 * Puts a story's kept state to rights (an older save has none; a broken one
 * may hold anything): a state it knows, a step it has, and an errand that
 * fits the step. Where the errand is lost the giver sets the step going
 * again, so no story is ever stuck.
 */
function mendStory(d: StoryDef, s: Record<string, any>) {
  if (!STATES.has(s.state)) s.state = 'locked';
  if (!Array.isArray(s.log)) s.log = [];
  else if (!s.log.every(isObj)) s.log = s.log.filter(isObj);
  const last = d.steps.length - 1;
  if (s.state === 'done') s.step = last + 1;
  else if (!Number.isInteger(s.step) || s.step < 0 || s.step > last) {
    // (where it had got to, by the steps it noted done)
    const logged = s.log.map((l: Record<string, any>) => l.step).filter((k: unknown): k is number => Number.isInteger(k));
    s.step = Math.min(last, logged.length ? Math.max(...logged) + 1 : 0);
  }
  if (s.e !== undefined && (!isObj(s.e) || s.state !== 'active' || !fits(d.steps[s.step], s.e) || typeof s.e.site !== 'number' || !Number.isFinite(s.e.site))) {
    delete s.e;
    if (s.state === 'active' && d.steps[s.step].kind !== 'talk') s.retry = true;
  }
  // (an errand's own fields: what is of the wrong shape is let go; a quarry nobody can find again is hunted afresh)
  if (isObj(s.e) && !errandSound(s.e)) {
    mendErrand(s.e);
    if (s.e.kind === 'hunt' && s.e.whoId === undefined) { releaseErrand(s.e as Errand); delete s.e; s.retry = true; }
  }
  if (s.state === 'active' && s.e === undefined && d.steps[s.step].kind !== 'talk') s.retry = true;
  if (typeof s.retry !== 'boolean') delete s.retry;
  if (typeof s.giver !== 'number') delete s.giver;
  if (typeof s.giverLost !== 'number') delete s.giverLost;
  if (typeof s.refused !== 'number') delete s.refused;
  if (s.freed !== undefined && !(Array.isArray(s.freed) && s.freed.every((id: unknown) => typeof id === 'number'))) delete s.freed;
}
/** Whether an errand is the one a step asks for (an escort of the freed may be a walk there, once they are gone or with you). */
const fits = (st: StoryStep | undefined, e: Record<string, any>) => !!st && (e.kind === st.kind || (st.kind === 'escort' && st.party === 'freed' && e.kind === 'reach'));
export function storyStates(): Record<string, StoryState> {
  const f = W().flags;
  if (!isObj(f.story)) f.story = {};
  const all = f.story as Record<string, any>;
  for (const d of STORIES) {
    if (!isObj(all[d.key])) all[d.key] = { state: 'locked', step: 0, log: [] };
    // (cheap enough to look at every time: a few fields of three stories)
    const s = all[d.key];
    if (!STATES.has(s.state) || !Number.isInteger(s.step) || !Array.isArray(s.log) || (s.state !== 'done' && !d.steps[s.step]) || (s.e !== undefined && (!isObj(s.e) || !fits(d.steps[s.step], s.e) || !errandSound(s.e)))) mendStory(d, s);
  }
  return all as Record<string, StoryState>;
}
export const storyState = (key: string) => storyStates()[key];
const owner = (key: string) => 's:' + key;

/** The town the giver stands in. */
const townOf = (d: StoryDef) => siteByKey(d.town);

/** The camps the stories send you to clear: no board posts them, so no camp is paid for twice. */
const campsOf = new WeakMap<object, Set<number>>();
export function storyCamps(): Set<number> {
  let out = campsOf.get(S.T);
  if (!out) {
    out = new Set();
    for (const d of STORIES) for (const st of d.steps) if (st.kind === 'camp') { const site = stepSite(d, st); if (site) out.add(site.id); }
    campsOf.set(S.T, out);
  }
  return out;
}

/** Whether the giver will talk to you yet: any one of the story's rules met (content/contracts: opens). */
function available(d: StoryDef): boolean {
  const flags = W().flags;
  const num = (v: unknown) => (typeof v === 'number' ? v : v ? 1 : -Infinity); // (a flag that is a time, or true, counts once)
  const o = d.opens;
  return (o.done ?? []).some(([f, n]) => num(flags.contracts?.by?.[f]) >= n)
    || (o.standing ?? []).some(([f, n]) => W().rel.get('player', f) >= n)
    || (o.flags ?? []).some(([k, n]) => num(flags[k]) >= n);
}

/** The foundry nearest a place (a story step's 'foundry'). */
function foundryNear(x: number, z: number): Site | undefined {
  return S.T.nearestSite(x, z, (s) => s.kind === 'foundry') ?? undefined;
}
/** Where a step happens. */
function stepSite(d: StoryDef, st: StoryStep): Site | undefined {
  const town = townOf(d);
  if (!st.at) return town;
  if (st.at === 'foundry') return town ? foundryNear(town.x, town.z) : undefined;
  return siteByKey(st.at);
}

/** The errand a step asks for. */
function errandFor(d: StoryDef, st: StoryStep, s: StoryState): Errand | null {
  const town = townOf(d);
  const site = stepSite(d, st);
  if (!town || !site) return null;
  switch (st.kind) {
    case 'free': return { kind: 'free', site: site.id, n: st.n ?? 1 };
    case 'duel': return { kind: 'duel', site: site.id, who: st.who, title: st.whoTitle, level: st.level, loadout: st.loadout, race: st.race };
    case 'camp': return { kind: 'camp', site: site.id };
    case 'reach': return { kind: 'reach', site: site.id };
    case 'defend': return { kind: 'defend', site: site.id, faction: st.faction };
    case 'haul': return { kind: 'haul', site: town.id, good: st.good, n: st.n };
    case 'deliver': return { kind: 'deliver', site: site.id, item: 'watch_letter', who: st.who, title: st.whoTitle };
    case 'escort': {
      if (st.party === 'freed') {
        // those the last step set loose, still free, not of your band and not already there: else (they came with you, or are gone) a walk there
        const party = (s.freed ?? []).filter((id) => { const c = W().char(id); return !!c && c.alive && c.faction !== 'player' && !c.cage && c.site !== site.id; });
        return party.length ? { kind: 'escort', site: site.id, who: st.who, party, settle: true } : { kind: 'reach', site: site.id };
      }
      return { kind: 'escort', site: site.id, from: (st.from ? siteByKey(st.from) : town)?.id, who: st.who, faction: st.faction, size: 1 };
    }
    case 'hunt': {
      // off the road between two places, a little under halfway along
      const a = siteByKey(st.road![0]), b = siteByKey(st.road![1]);
      if (!a || !b) return null;
      const rng = new RNG(hash3(hashStr(d.key), 7, 1));
      const k = rng.range(0.38, 0.5), side = rng.chance(0.5) ? 1 : -1;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const x = a.x + (b.x - a.x) * k + ((b.z - a.z) / len) * 70 * side, z = a.z + (b.z - a.z) * k - ((b.x - a.x) / len) * 70 * side;
      if (st.species) return { kind: 'hunt', site: town.id, x, z, who: st.who, species: st.species, great: st.great, size: (st.size ?? 1) - 1 };
      return { kind: 'hunt', site: town.id, x, z, who: st.who, title: st.whoTitle, faction: st.faction, size: (st.size ?? 3) - 1, level: st.level, loot: st.faction === 'scorched' ? 'dreamleaf' : undefined };
    }
  }
  return null;
}

// ---------------------------------------------------------------- moving on
/** Pays what a step pays, and says so. */
function reward(st: StoryStep, d: StoryDef) {
  const bits: string[] = [];
  if (st.pay) { W().money += st.pay; bits.push(`${st.pay} chits`); }
  for (const [f, v] of st.standing ?? []) { W().rel.add('player', f, v); bits.push(`${v > 0 ? '+' : ''}${v} with the ${FACTION[f]?.short ?? f}`); }
  if (bits.length) S.fx.notice(`${d.name}: ${bits.join(', ')}.`, 'good');
}

/** Sets the current step going: its errand, if it has one. */
function beginStep(d: StoryDef, s: StoryState, p?: Char) {
  const st = d.steps[s.step];
  s.retry = false;
  if (st.kind === 'talk') { s.e = undefined; return; }
  const e = errandFor(d, st, s);
  if (!e) { s.e = undefined; s.retry = true; return; }
  if (e.kind === 'duel' && p && !p.animal) e.duelist = p.id; // (whoever took it on fights it, if they are the one in the ring)
  s.e = e;
  if (!startErrand(e, owner(d.key), p)) { s.e = undefined; s.retry = true; }
}

/** The current step is done: its pay, the journal, and on to the next (or the end). Returns the next step's opening words. */
function advance(d: StoryDef, s: StoryState, p?: Char): string {
  const st = d.steps[s.step];
  if (s.e?.kind === 'free') s.freed = [...(s.e.freed ?? [])]; // (for the walk after it)
  if (s.e) releaseErrand(s.e);
  s.log.push({ step: s.step, t: S.clock.t });
  W().say(`${d.name}: ${st.done}`, 'story', S.clock.t);
  reward(st, d);
  s.e = undefined;
  s.step++;
  if (s.step >= d.steps.length) {
    s.state = 'done';
    capstone(d, p);
    return '';
  }
  const next = d.steps[s.step];
  S.fx.notice(`${d.name}: ${next.title}.`, 'good');
  beginStep(d, s, p);
  return next.say;
}

/** What changes for good at the end of each story. */
function capstone(d: StoryDef, p?: Char) {
  const lead = p ?? upMine()[0];
  const town = townOf(d);
  switch (d.key) {
    case 'freeroad': {
      // a house in Crossroad, a sergeant of the Watch, and the Reavers kept off the free towns
      const sign = [...W().objs.values()].find((o) => o.kind === 'sign' && o.def === 'forsale' && o.site === town?.id && houseOf(o)?.owner !== 'player');
      const house = sign ? houseOf(sign) : undefined;
      if (sign && house) {
        house.owner = 'player';
        delete house.data.forSale;
        for (const o of W().objs.values()) if (o.parent === house.id) o.owner = 'player';
        W().removeObj(sign);
        emit('objs');
        W().say(`The Watch gave ${W().factionName} the deed to a ${house.data.name?.toLowerCase?.() ?? 'house'} in Crossroad.`, 'good', S.clock.t);
      } else { W().money += 4000; W().say('The Watch had no empty house to give, and paid 4,000 chits instead.', 'good', S.clock.t); }
      if (lead) {
        const c = makePerson(W(), { faction: 'drifters', role: 'guard', race: 'valefolk', female: false, level: 30, loadout: 'drifters_guard', name: SERGEANT.name, whole: true }, new RNG(hash3(hashStr('brannoc'), 1, 1)));
        enlist(c, lead);
        c.title = SERGEANT.title;
        W().say(`${c.name}, ${SERGEANT.title}, joined ${W().factionName}.`, 'good', S.clock.t);
        lead.title = 'Warden of the Free Road';
      }
      W().flags.quiet = { ...(W().flags.quiet ?? {}), reavers: S.clock.t + DAY * 30 };
      W().rel.add('player', 'drifters', 20);
      break;
    }
    case 'ashtithe': {
      if (lead) { give(lead, 'pyre_tongue', 1, 5); lead.title = 'Flamebearer'; }
      W().rel.add('player', 'ember', 20);
      W().rel.add('player', 'scorched', -25);
      break;
    }
    case 'foundry': {
      if (lead) {
        const bot = makeAnimal(W(), 'warbot', new RNG(hash3(hashStr('bulwark'), 1, 1)));
        bot.name = WARBOT.name;
        bot.mem.reprogrammed = true;
        enlist(bot, lead);
        bot.title = WARBOT.title;
        W().flags.reprogrammed = (W().flags.reprogrammed ?? 0) + 1;
        W().say(`${WARBOT.name}, a warbot the Custodian rewired, walks with ${W().factionName} now.`, 'good', S.clock.t);
      }
      W().money += 1500;
      W().rel.add('player', 'hollows', 15);
      W().rel.add('player', 'delvers', 10);
      break;
    }
    case 'brokenchain': {
      // the pens at Chainfield stand open: who is in them, and in its fields, walks to Brokenchain
      const cf = siteByKey('chainfield');
      let walked = 0;
      if (cf && town) {
        // (a camp nobody of yours has seen yet has its people all the same: they are the ones who walk out)
        const info = W().towns.get(cf.id) as TownInfo | undefined;
        if (info && !W().populated.has(cf.id)) populateTown(W(), info);
        for (const o of W().objs.values()) {
          if ((o.kind !== 'cage' && o.kind !== 'shackle_post') || o.site !== cf.id) continue;
          const c = o.occupant ? W().char(o.occupant) : undefined;
          if (c && c.faction !== 'player' && c.mem.caughtBy === 'player') continue; // (a captive of yours stays yours)
          if (c?.faction === 'player') freeFromCage(c.id);
          else if (c?.alive) { settleAt(c, town, true); walked++; }
          o.occupant = 0;
          o.locked = 0;
        }
        for (const c of [...W().chars.values()]) if (c.alive && c.role === 'slave' && c.mem.enslavedBy === 'chainhouse' && c.faction !== 'player' && c.site === cf.id) { settleAt(c, town, true); walked++; }
        // (Brokenchain has people to spare for you, whether or not Chainfield's were ever seen)
        for (let i = walked; i < 3; i++) newRunaway(town, i);
        openForge(town);
      }
      if (lead) lead.title = 'Chainbreaker';
      W().rel.add('player', 'unchained', 20);
      W().rel.add('player', 'chainhouse', -30);
      W().say(`The pens at Chainfield stand open. ${walked ? `${walked} of the Chainhouse's slaves are walking to Brokenchain.` : 'Runaways are walking into Brokenchain.'}`, 'good', S.clock.t);
      break;
    }
    case 'horn': {
      if (lead) {
        // the champion you beat asked to go with you (still sore from it, maybe); if he is dead or taken, the next of them goes
        let c = [...W().chars.values()].find((x) => x.mem.champion === owner(d.key) && x.alive && !x.cage && !x.carriedBy && !x.shackled && x.faction !== 'player');
        if (!c) {
          c = makePerson(W(), { faction: 'karuk', role: 'merc', race: 'karuk', level: 46, loadout: 'karuk_guard', name: CHAMPION.heir, whole: true }, new RNG(hash3(hashStr('champion'), 1, 1)));
          const at = S.nav.nearestOpen(lead.x + 2, lead.z, 8) ?? [lead.x, lead.z];
          c.x = at[0]; c.z = at[1]; c.y = S.T.heightAt(c.x, c.z);
        }
        delete c.mem.champion; delete c.mem.bout; c.mem.enemies = [];
        enlist(c, lead);
        c.title = CHAMPION.title;
        W().say(`${c.name}, ${CHAMPION.title}, joined ${W().factionName}.`, 'good', S.clock.t);
        give(lead, 'arena_maul', 1, 5);
        if (!lead.animal) lead.title = 'Horn-Sworn';
      }
      W().rel.add('player', 'karuk', 25);
      break;
    }
  }
  // a story's end can bring a crisis on, a while after (content/contracts: CRISES)
  for (const c of CRISES) if (c.afterStory?.key === d.key) scheduleCrisis(c.key, S.clock.t + c.afterStory.days * DAY);
  W().say(`${d.name}: ${d.capstone}`, 'story', S.clock.t);
  S.fx.notice(`${d.name}: done. ${d.capstone}`, 'good');
}

/** Someone new comes to Brokenchain from the pens, glad of somewhere to belong and someone to walk with. */
function newRunaway(site: Site, i: number) {
  const rng = new RNG(hash3(hashStr('runaway'), site.id, i));
  const c = makePerson(W(), { faction: site.faction ?? 'unchained', role: 'recruit', race: rng.pick(['valefolk', 'duneborn', 'duneborn', 'karuk']), level: rng.int(8, 16) }, rng);
  const a = rng.range(0, Math.PI * 2);
  const at = S.nav.nearestOpen(site.x + Math.sin(a) * site.r, site.z + Math.cos(a) * site.r, 12) ?? [site.x, site.z];
  c.x = at[0]; c.z = at[1]; c.y = S.T.heightAt(c.x, c.z);
  settleAt(c, site);
}

/**
 * Brokenchain's own smith, at a counter in its square: iron that used to be
 * chains, now edges. The counter is one of the town's shops like any other, so
 * if the smith is killed someone takes the forge over in time.
 */
function openForge(site: Site) {
  if (W().flags.forge && W().shops.has(W().flags.forge)) return;
  const info = W().towns.get(site.id) as TownInfo | undefined;
  if (!info) return;
  if (!W().populated.has(site.id)) populateTown(W(), info); // (its own people first, so the forge is not stocked twice)
  const fac = site.faction ?? 'unchained';
  const rng = new RNG(hash3(hashStr('forge'), site.id, 1));
  // a little way out from the middle of the square, facing into it
  const plaza = info.posts.find((p) => p.kind === 'plaza');
  const cx = plaza?.x ?? site.x, cz = plaza?.z ?? site.z;
  const a = rng.range(0, Math.PI * 2), r = Math.max(6, Math.min(12, (info.plazaR || 10) * 0.7));
  const at = S.nav.nearestOpen(cx + Math.sin(a) * r, cz + Math.cos(a) * r, 10) ?? [cx + Math.sin(a) * r, cz + Math.cos(a) * r];
  const face = Math.atan2(cx - at[0], cz - at[1]);
  const counter = W().addObj({ id: 0, kind: 'counter', def: 'counter', x: at[0], z: at[1], y: S.T.heightAt(at[0], at[1]), rot: face, owner: fac, site: site.id, parent: 0, inv: new Grid(12, 10), locked: 40, shop: 'weapons', data: { len: 2 } });
  const spot: [number, number, number] = [at[0] - Math.sin(face) * 1.1, at[1] - Math.cos(face) * 1.1, face];
  info.shops.push({ kind: 'weapons', building: counter, counter, spot });
  const k = makePerson(W(), { faction: fac, role: 'shopkeeper', race: 'karuk', level: 22, name: SMITH.name, whole: true }, rng);
  settleAt(k, site, true);
  k.role = 'shopkeeper'; k.recruitable = false; k.title = SMITH.title;
  k.homeX = spot[0]; k.homeZ = spot[1]; k.homeDir = face;
  k.shop = String(counter.id);
  makeShop(W(), counter.id, 'weapons', fac, site.id, k.id, 0.55, SMITH.shop);
  W().flags.forge = counter.id;
}

// ---------------------------------------------------------------- set free
/** Someone your people set loose (shackles picked, a cage opened): a free step at the place they were held counts them. */
function freedOne(id: number) {
  const c = W().char(id);
  if (!c || c.faction === 'player') return;
  const all = storyStates();
  for (const d of STORIES) {
    const s = all[d.key];
    const e = s.e;
    if (s.state !== 'active' || e?.kind !== 'free') continue;
    const site = siteById(e.site);
    // (the camp's own, its slaves and the prisoners it keeps, not a captive of yours let out again; in the camp or the fields that lie around it)
    const theirs = !!site?.faction && c.mem.caughtBy !== 'player' && (c.mem.enslavedBy === site.faction || c.mem.prisonerOf === site.faction);
    if (!site || !theirs || Math.hypot(c.x - site.x, c.z - site.z) > site.r + 200 || (e.freed ??= []).includes(id)) continue;
    e.freed.push(id);
    S.fx.notice(`${d.name}: ${e.freed.length} of ${e.n ?? 1} set free.`, 'good');
  }
}
on('sim:freedSlave', (_by: number, id: number) => freedOne(id));
on('sim:freedCaptive', (_by: number, id: number) => freedOne(id));

// ---------------------------------------------------------------- talk of it
/** Stories still waiting for you (not yet open, or open and not turned down), whose people talk of them. */
const waiting = () => { const all = storyStates(); return STORIES.filter((d) => all[d.key].state === 'locked' || (all[d.key].state === 'open' && !all[d.key].refused)); };
/** What townsfolk of a people say among themselves about the stories that wait for you (sim/chatter). */
export function storyGossip(faction: string): string[][] {
  const out: string[][] = [];
  for (const d of waiting()) if (d.gossip?.factions.includes(faction)) out.push(...d.gossip.lines);
  return out;
}
/** Asked for news, now and then someone points you at a story that waits for you: who is asking after people like you, and where. */
function storyRumour(n: Char): string | null {
  if (S.rng.next() > 0.3) return null;
  const near = waiting().filter((d) => d.gossip?.factions.includes(n.faction) || d.faction === n.faction);
  const d = near.length ? S.rng.pick(near) : null;
  const town = d ? townOf(d) : undefined;
  if (!d || !town) return null;
  return S.rng.pick([
    `They say ${d.giver.known} has been asking after people like you, at ${town.name}. ${d.blurb}`,
    `If it's work with a reason behind it you want, go and see ${d.giver.known}, at ${town.name}. ${d.blurb}`,
  ]);
}
rumourHooks.push(storyRumour);

// ---------------------------------------------------------------- the givers
/** Brings the giver (or, after a death, whoever speaks for them now) to their town's square. */
function placeGiver(d: StoryDef, s: StoryState) {
  const town = townOf(d);
  if (!town || !W().populated.has(town.id)) return;
  // (a giver already in the world, from before the story's state was kept, is taken up again)
  if (!s.giver) for (const c of W().chars.values()) if (c.mem.story === d.key && c.alive) { s.giver = c.id; return; }
  const c0 = s.giver ? W().char(s.giver) : undefined;
  if (c0 && c0.status !== 'dead') return;
  // a death is mourned for half a day before anyone takes their place
  if (s.giver) {
    s.giverLost ??= S.clock.t;
    if (S.clock.t - s.giverLost < HOUR * 12) return;
  }
  const heir = !!s.giver;
  const info = W().towns.get(town.id) as TownInfo | undefined;
  const posts = info?.posts.filter((p) => p.kind === 'plaza') ?? [];
  const post = posts[posts.length - 1];
  const at = S.nav.nearestOpen(post ? post.x : town.x + 5, post ? post.z : town.z - 5, 10) ?? [town.x, town.z];
  let sq = [...W().squads.values()].find((q) => q.site === town.id && q.kind === 'town' && q.faction === town.faction);
  if (!sq) { sq = new Squad(); sq.faction = town.faction ?? d.faction; sq.kind = 'town'; sq.name = town.name; sq.site = town.id; W().addSquad(sq); }
  const g = d.giver;
  const c = makePerson(W(), { faction: sq.faction, role: 'guard', race: RACE[g.race] ? g.race : undefined, female: g.female, level: g.level, loadout: g.loadout, name: heir ? g.heir : g.name, whole: true }, new RNG(hash3(hashStr(d.key), heir ? 2 : 1, 9)));
  W().moveToSquad(c, sq);
  c.x = at[0]; c.z = at[1]; c.y = S.T.heightAt(c.x, c.z);
  c.homeX = c.x; c.homeZ = c.z; c.homeDir = c.dir = post?.dir ?? 0;
  c.site = town.id;
  c.title = g.title;
  c.mem.story = d.key;
  s.giver = c.id;
  delete s.giverLost;
  if (heir) W().say(`${c.name} speaks for ${g.title === 'Custodian' ? 'the enclave' : `the ${FACTION[d.faction]?.short ?? d.faction}`} in ${town.name} now.`, 'info', S.clock.t);
}

// ---------------------------------------------------------------- the tick
let t = 0;
export function tickStories(dt: number) {
  t -= dt;
  if (t > 0) return;
  t = 1;
  const all = storyStates();
  for (const d of STORIES) {
    const s = all[d.key];
    placeGiver(d, s);
    if (s.state === 'locked' && available(d)) {
      s.state = 'open';
      W().say(d.call, 'story', S.clock.t);
      S.fx.notice(d.call, 'good');
    }
    if (s.state !== 'active' || !s.e) continue;
    const r = checkErrand(s.e, owner(d.key));
    if (r === 'ready' && s.e.kind !== 'haul' && s.e.kind !== 'deliver') advance(d, s);
    else if (r === 'failed') {
      W().say(`${d.name}: ${s.e.why ?? 'That went wrong.'} Go back to ${d.giver.name}.`, 'bad', S.clock.t);
      S.fx.notice(`${d.name}: ${s.e.why ?? 'That went wrong.'}`, 'bad');
      releaseErrand(s.e);
      s.e = undefined;
      s.retry = true;
    }
  }
}

/** The errand a story is on (for whoever it brought in to find their way back to it). */
export function storyErrand(key: string): Errand | undefined { return storyStates()[key]?.e; }

/** A story's errand finished in a conversation (a letter handed over): the story moves on. Returns what is said next. */
export function storyErrandDone(key: string, p?: Char): string {
  const d = STORY[key], s = storyStates()[key];
  if (!d || !s || s.state !== 'active' || !s.e) return '';
  return advance(d, s, p);
}

// ---------------------------------------------------------------- talking to the giver
const BYE: DChoice = { t: 'Goodbye.', end: true };
const ctxStory = (c: DCtx) => { const key = c.n.mem.story as string; return { d: STORY[key], s: storyStates()[key] }; };
const nonHuman = (c: DCtx) => W().playerChars().some((m) => m.alive && !m.animal && RACE[m.look.race]?.race !== 'human' && Math.hypot(m.x - c.p.x, m.z - c.p.z) < 40);
/** The Covenant will not hear a band with beasts or machines in it. */
const refused = (c: DCtx) => ctxStory(c).d?.faction === 'ember' && nonHuman(c);

/** Whether the bring step's goods are here. */
const canHandIn = (c: DCtx) => {
  const { s } = ctxStory(c);
  return s?.state === 'active' && s.e?.kind === 'haul' && carried(s.e.good!, c.n, 40) >= s.e.n!;
};

/** The questions a giver will answer (content/contracts: ask), up to three. */
const askable = (c: DCtx, i: number) => { const { d, s } = ctxStory(c); const a = d?.ask?.[i]; return !!a && !refused(c) && s.state !== 'locked' && (!a.if || !!W().flags[a.if]); };
const ASKS: DChoice[] = [0, 1, 2].map((i) => ({ t: (c: DCtx) => ctxStory(c).d.ask?.[i]?.t ?? '', if: (c: DCtx) => askable(c, i), fx: (c: DCtx) => { c.vars.said = ctxStory(c).d.ask![i].say; }, next: 'answer' }));

/** Turns a story down: the giver says so, the people remember (a little), and the offer stands. */
function turnDown(c: DCtx) {
  const { d, s } = ctxStory(c);
  if (!d.refuse) return;
  s.refused = S.clock.t;
  W().rel.add('player', d.faction, -d.refuse.cost);
  W().say(`${d.name}: you turned ${d.giver.known} down.`, 'info', S.clock.t);
  c.vars.said = d.refuse.say;
}
/** Takes a story on (again, after turning it down). */
function takeOn(c: DCtx) {
  const { d, s } = ctxStory(c);
  delete s.refused;
  s.state = 'active'; s.step = 0;
  c.vars.said = advance(d, s, c.p);
}

const GIVER: Tree = {
  start: {
    t: (c) => {
      const { d, s } = ctxStory(c);
      if (!d) return '...';
      if (refused(c)) return 'The flame does not bargain with beasts and machines. Come back without them.';
      if (s.state === 'locked') return d.notYet;
      if (s.state === 'open') return s.refused && d.refuse ? d.refuse.back : d.steps[0].say;
      if (s.state === 'done') return S.rng.pick(['The roads remember what you did. So do I.', 'You are always welcome here.', 'Still alive? Good. Keep it that way.']);
      const st = d.steps[s.step];
      if (s.retry) return `${st.title}. That went wrong. We try again, then.`;
      if (st.kind === 'talk') return st.say;
      const prog = s.e ? errandProgress(s.e) : '';
      return `${st.text}${prog ? ' ' + prog : ''}`;
    },
    ch: [
      { t: (c) => (ctxStory(c).s.refused ? 'I\'m in, after all.' : 'I\'m in.'), if: (c) => !refused(c) && ctxStory(c).s?.state === 'open', fx: takeOn, next: 'go' },
      { t: (c) => { const e = ctxStory(c).s.e!; return `Here: ${e.n} ${ITEM[e.good!].name}.`; }, if: (c) => !refused(c) && canHandIn(c), fx: (c) => { const { d, s } = ctxStory(c); if (takeGoods(s.e!.good!, s.e!.n!, c.n, 40)) c.vars.said = advance(d, s, c.p); }, next: 'go' },
      { t: (c) => (ctxStory(c).s.step === ctxStory(c).d.steps.length - 1 ? 'Thank you.' : 'What now?'), if: (c) => !refused(c) && ctxStory(c).s?.state === 'active' && !ctxStory(c).s.retry && ctxStory(c).d.steps[ctxStory(c).s.step].kind === 'talk', fx: (c) => { const { d, s } = ctxStory(c); c.vars.said = advance(d, s, c.p); }, next: 'go' },
      { t: 'Let\'s try it again.', if: (c) => !refused(c) && ctxStory(c).s?.state === 'active' && !!ctxStory(c).s.retry, fx: (c) => { const { d, s } = ctxStory(c); beginStep(d, s, c.p); c.vars.said = s.retry ? 'Not now. Come back in a while.' : d.steps[s.step].say; }, next: 'go' },
      ...ASKS,
      { t: (c) => ctxStory(c).d.refuse!.t, if: (c) => !refused(c) && ctxStory(c).s?.state === 'open' && !!ctxStory(c).d.refuse && !ctxStory(c).s.refused, fx: turnDown, next: 'go' },
      { t: 'Not now.', if: (c) => ctxStory(c).s?.state === 'open', end: true },
      BYE,
    ],
  },
  answer: {
    t: (c) => (c.vars.said as string) || '...',
    ch: [{ t: 'Something else.', next: 'start' }, BYE],
  },
  go: {
    t: (c) => (c.vars.said as string) || S.rng.pick(['Go well.', 'Then go.', 'The road is waiting.']),
    ch: [BYE],
  },
};

/** The conversation a story's giver offers, if this is one. */
export function storyTree(n: Char): [Tree, string] | null {
  return n.mem.story && STORY[n.mem.story] ? [GIVER, 'start'] : null;
}

// ---------------------------------------------------------------- for the journal and the map
export interface StoryView { def: StoryDef; s: StoryState; step?: StoryStep; where?: { x: number; z: number }; progress: string; danger: (Rating & { what: string }) | null }
export function storyViews(): StoryView[] {
  const all = storyStates();
  return STORIES.map((def) => {
    const s = all[def.key];
    const step = s.state === 'active' ? def.steps[s.step] : undefined;
    const giver = s.giver ? W().char(s.giver) : undefined;
    const town = townOf(def);
    let where: { x: number; z: number } | undefined;
    if (s.state === 'open' || (step && (step.kind === 'talk' || step.kind === 'haul' || s.retry))) where = giver?.alive ? { x: giver.x, z: giver.z } : town ? { x: town.x, z: town.z } : undefined;
    else if (s.e) where = errandWhere(s.e) ?? undefined;
    return { def, s, step, where, progress: s.e ? errandProgress(s.e) : '', danger: s.e && !s.retry ? errandDanger(s.e) : null };
  });
}

/** The step of a story most worth doing now, as a line for the tracker. */
export function storyGoal(): { text: string; where?: { x: number; z: number }; entry: string } | null {
  for (const v of storyViews()) {
    if (v.s.state !== 'active' || !v.step) continue;
    return { text: `${v.def.name}: ${v.s.retry ? `Go back to ${v.def.giver.known}.` : v.step.text}`, where: v.where, entry: 'story:' + v.def.key };
  }
  // (one you turned down does not nag; the journal still says the offer stands)
  for (const v of storyViews()) if (v.s.state === 'open' && !v.s.refused) return { text: `${v.def.name}: ${v.def.giver.known} wants a word, at ${townOf(v.def)?.name ?? '?'}.`, where: v.where, entry: 'story:' + v.def.key };
  return null;
}

/** For the debug helpers: puts a story at a step, as if the ones before were done. */
export function setStoryStep(key: string, step: number, p?: Char): string {
  const d = STORY[key], s = storyStates()[key];
  if (!d || !s) return 'no such story';
  if (s.e) releaseErrand(s.e);
  s.state = step >= d.steps.length ? 'done' : 'active';
  s.step = Math.max(0, Math.min(step, d.steps.length));
  s.log = [];
  delete s.freed; delete s.refused;
  for (let i = 0; i < s.step; i++) s.log.push({ step: i, t: S.clock.t });
  if (s.state === 'active') beginStep(d, s, p ?? upMine()[0]);
  return s.state === 'active' ? d.steps[s.step].title : 'done';
}
