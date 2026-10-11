// Contract boards. Every lawful town keeps one: whoever keeps the bar, or the
// general store where there is no bar, has a few jobs posted each day, drawn
// from the town's own seed and the day. Hauls priced from the markets, sealed
// parcels, travellers who will not walk alone, beasts and outlaws on the
// roads, camps to empty. Each says honestly how dangerous it is for your band,
// what it pays, how long you have, and what failing costs; better work is
// kept for those the town's people know better. Also the stories and the
// crisis are ticked from here, and currentGoal() says what to do next.
import { S } from './ctx';
import type { Char } from './char';
import type { DCtx, DChoice, Tree } from './dialogue';
import { RNG, hash3 } from '../core/rng';
import { DAY, HOUR } from './clock';
import { FACTION } from '../content/factions';
import { ITEM, gradeName } from '../content/items';
import { ANIMAL } from '../content/animals';
import { RACE } from '../content/races';
import { MARKETS, DEAR_SELL } from '../content/markets';
import { personName } from '../content/names';
import { SETTLEMENT } from '../content/layout';
import { aboutMe } from '../content/lines';
import {
  TIERS, TIER_ODDS, TIER_STANDING, TIER_PENALTY, TIER_ITEM, TIER_GRADE, TIER_THREAT, TIER_REACH, TIER_LOAD, MAX_ACTIVE, KINDS, KIND_NAME, KEEPER,
  HAUL_OVER, WALK_PAY, TIER_PAY, ROAD_PAY,
  HAUL, DELIVER, CONTRABAND, ESCORT, HUNT_BEAST, HUNT_BAND, CAMP, TAKEN, PAID, NO_WORK, NO_BEASTS, LOCKED, RECIPIENT, TRAVELLER,
  BEAST_NAMES, EPITHETS, BAND_NAME, BAND_SPEC, TRADES, TRAVELLERS, REWARD_ITEMS, CAMP_FOLK,
} from '../content/contracts';
import { SPECS, threat } from './worldsim';
import { findFreeCage } from './ai';
import { dropCarried } from './health';
import {
  Errand, Rating, rate, roadThreat, campThreat, campEstimate, campLeft, beastThreat, bandThreat, BOSS_HP, BOSS_SKILL, roadRoute, routeLength, siteById, carried, takeGoods,
  findItem, dropItem, give, startErrand, checkErrand, releaseErrand, errandWhere, errandProgress, bearing, upMine, nearestMine, sweepErrandFolk, dangerAlong, dangerBetween,
} from './errands';
import { tickStories, storyTree, storyErrand, storyErrandDone, storyGoal, storyViews, storyCamps } from './stories';
import { tickCrisis, crisisGoal, crisisState } from './crisis';
import type { Site } from '../world/terrain';

export type ContractKind = 'haul' | 'deliver' | 'escort' | 'hunt' | 'camp';

export interface Contract {
  id: string;
  kind: ContractKind;
  /** 0..3: odd jobs to sworn work (see TIERS) */
  tier: number;
  /** the town whose board posted it, and the people who pay */
  from: number;
  issuer: string;
  title: string;
  /** what the keeper says about it */
  brief: string;
  pay: number;
  standing: number;
  /** an item it pays as well: id, how many, grade */
  item?: [string, number, number];
  /** chits left as surety (a parcel), given back on delivery */
  bond: number;
  days: number;
  /** standing lost if it fails or you walk away */
  penalty: number;
  /** the strength of what it sends you against (a hunt's quarry); camps and roads are weighed when you look */
  threat: number;
  contraband?: boolean;
  e: Errand;
  taken?: number;
  due?: number;
  state?: 'active' | 'ready' | 'done' | 'failed' | 'abandoned';
}

export interface Board { day: number; list: Contract[]; taken: string[] }
export interface PastJob { id: string; title: string; kind: ContractKind; from: number; issuer: string; state: 'done' | 'failed' | 'abandoned'; t: number; note: string }
/**
 * What the save keeps: the jobs you hold, the history, the tallies, and the
 * ids of the jobs taken off today's boards. The boards themselves are drawn
 * again from each town's seed and the day whenever they are wanted.
 */
interface ContractsState { taken: string[]; takenDay: number; active: Contract[]; past: PastJob[]; done: number; failed: number; abandoned: number; by: Record<string, number>; hinted?: boolean }

const W = () => S.W;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const JOB_KINDS = new Set<string>(['haul', 'deliver', 'escort', 'hunt', 'camp']);
const JOB_NUMBERS = ['from', 'pay', 'standing', 'bond', 'days', 'penalty', 'threat'] as const;
/** Whether a job kept in the flags is whole enough to run (a save broken or edited by hand may hold anything). */
function sound(c: unknown): c is Contract {
  if (!isObj(c) || !isObj(c.e) || typeof c.id !== 'string' || !JOB_KINDS.has(c.kind) || c.e.kind !== c.kind || !finite(c.e.site)) return false;
  if (typeof c.issuer !== 'string' || typeof c.title !== 'string' || (c.state !== 'active' && c.state !== 'ready') || !Number.isInteger(c.tier) || !TIERS[c.tier]) return false;
  for (const k of JOB_NUMBERS) if (!finite(c[k])) return false;
  return c.due === undefined || finite(c.due);
}
const pastOk = (p: unknown) => isObj(p) && typeof p.title === 'string' && typeof p.state === 'string';
const mended = new WeakSet<object>();
/** Puts the kept state to rights once (an older save, or a broken one): anything of the wrong shape is set back to nothing. */
function mend(st: Record<string, any>) {
  // (saves from before the boards were drawn afresh kept them whole: only what was taken off today's matters)
  if (st.boards !== undefined) {
    const taken: string[] = [];
    if (isObj(st.boards)) for (const b of Object.values(st.boards)) if (isObj(b) && b.day === S.clock.day && Array.isArray(b.taken)) taken.push(...b.taken);
    st.taken = taken; st.takenDay = S.clock.day;
    delete st.boards;
  }
  st.taken = Array.isArray(st.taken) ? st.taken.filter((x: unknown) => typeof x === 'string') : [];
  if (!finite(st.takenDay)) st.takenDay = -1;
  st.past = Array.isArray(st.past) ? st.past.filter(pastOk) : [];
  if (!isObj(st.by)) st.by = {};
  for (const k of Object.keys(st.by)) if (!finite(st.by[k])) delete st.by[k];
  for (const k of ['done', 'failed', 'abandoned']) if (!finite(st[k])) st[k] = 0;
  if (typeof st.hinted !== 'boolean') delete st.hinted;
}
/** The contracts kept in the save's flags, made the first time they are needed (an older save has none). */
export function contractsState(): ContractsState {
  const f = W().flags;
  if (!isObj(f.contracts)) f.contracts = {};
  const st = f.contracts;
  if (!mended.has(st)) { mend(st); mended.add(st); }
  // (the jobs are looked at every second: a broken one is dropped rather than tripped over)
  if (!Array.isArray(st.active)) st.active = [];
  else if (!st.active.every(sound)) st.active = st.active.filter(sound);
  if (!Array.isArray(st.past)) st.past = [];
  if (!Array.isArray(st.taken)) st.taken = [];
  return st as ContractsState;
}
export const activeContracts = () => contractsState().active;
const owner = (c: Contract) => 'c:' + c.id;
const fill = (s: string, v: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const round10 = (v: number) => Math.max(10, Math.round(v / 10) * 10);
const lawful = (s: Site) => s.kind === 'town' && !!s.faction && !!FACTION[s.faction]?.lawful;
const short = (f: string) => FACTION[f]?.short ?? f;

// ---------------------------------------------------------------- who keeps the board
/** The counter whose keeper keeps a town's board: the bar, else the general store, else any. */
function keeperShop(siteId: number) {
  let best: { id: number; kind: string; keeper: number } | null = null, rank = 9;
  for (const sh of W().shops.values()) {
    if (sh.site !== siteId) continue;
    const r = sh.kind === 'bar' ? 0 : sh.kind === 'general' ? 1 : 2;
    if (r < rank) { rank = r; best = sh; }
  }
  return best;
}
/** The town whose board someone keeps, if they keep one. */
export function boardTownOf(n: Char): Site | undefined {
  if (!n.shop || n.faction === 'player') return undefined;
  const sh = W().shops.get(+n.shop);
  const site = sh ? siteById(sh.site) : undefined;
  if (!site || !lawful(site) || keeperShop(site.id)?.id !== sh!.id) return undefined;
  return site;
}
/** What the board calls its keeper: "the barkeep at Crossroad". */
export function keeperWord(site: Site): string {
  // (before a town has people in it there is no counter to look at: its plan says whether it has a bar)
  const sh = keeperShop(site.id);
  const bar = sh ? sh.kind === 'bar' : !!SETTLEMENT[site.settlement ?? '']?.shops.includes('bar');
  return `the ${bar ? KEEPER.bar : KEEPER.other} at ${site.name}`;
}

// ---------------------------------------------------------------- posting the day's jobs
/**
 * Makes a job of a kind for a town's board, or null. A maker looks only at
 * the land, the markets and the peoples' standing with each other (none of
 * which change), the day and its dice: never at what has happened since, so
 * a board drawn again (after a load, say) is the same board.
 */
type Maker = (site: Site, tier: number, rng: RNG, used: Set<string>, day: number) => Omit<Contract, 'id' | 'tier' | 'from' | 'issuer' | 'standing' | 'penalty' | 'item'> | null;

function lawfulTowns(): Site[] { return S.T.sites.filter(lawful); }
const inReach = (a: Site, b: { x: number; z: number }, tier: number) => { const d = Math.hypot(a.x - b.x, a.z - b.z); return d >= TIER_REACH[tier][0] && d <= TIER_REACH[tier][1]; };
/** Towns a faction would send people or parcels to. */
const friendlyTo = (f: string, s: Site) => s.faction !== undefined && FACTION[s.faction]?.lawful && W().rel.get(f, s.faction) > -50;

/** "Kesh the Toll-Taker", "Bran, Hunger Chief". */
export const named = (who: string, title?: string) => (!title ? who : title.startsWith('the ') ? `${who} ${title}` : `${who}, ${title}`);

/** Someone of a people, named. */
function someone(faction: string, rng: RNG): string {
  const f = FACTION[faction];
  const race = f?.races.length ? rng.weighted(f.races) : 'valefolk';
  return personName(race, rng.chance(0.45), rng);
}

const makeHaul: Maker = (site, tier, rng, used, day) => {
  const m = MARKETS[site.settlement ?? ''];
  if (!m) return null;
  // goods this town wants that some town within reach has too much of
  const cands: [string, Site][] = [];
  for (const other of lawfulTowns()) {
    if (other === site || Math.hypot(other.x - site.x, other.z - site.z) > TIER_REACH[tier][1]) continue;
    for (const id of MARKETS[other.settlement ?? '']?.cheap ?? []) {
      const d = ITEM[id];
      if (!d || used.has('good:' + id) || d.illegal?.includes(site.faction!) || !(m.dear.includes(id) || m.dear.includes(d.cat))) continue;
      cands.push([id, other]);
    }
  }
  if (!cands.length) return null;
  const [good, src] = rng.pick(cands);
  const d = ITEM[good];
  // what a counter here, short of them, would pay for the load (and then a little more: see HAUL_OVER)
  const each = d.value * 0.5 * DEAR_SELL;
  const want = [450, 1000, 2000, 3600][tier] * rng.range(0.8, 1.25);
  // a load one band can carry: heavy cheap goods make small hauls, and are no work for the trusted
  const n = Math.min(Math.round(want / each), Math.floor(TIER_LOAD[tier] / Math.max(0.1, d.weight)));
  if (n < 3 || each * n < want * 0.5) return null;
  used.add('good:' + good);
  const pay = round10(each * n * HAUL_OVER);
  const days = 2 + tier + (Math.hypot(src.x - site.x, src.z - site.z) > 3000 ? 1 : 0);
  const lines = HAUL[site.faction!] ?? HAUL.default;
  return {
    kind: 'haul', title: `${d.name} ×${n} for ${site.name}`, pay, bond: 0, days, threat: 0,
    brief: fill(rng.pick(lines), { n, good: d.name, pay, due: day + days }) + ` You'll find ${d.name} cheap in ${src.name}.`,
    e: { kind: 'haul', site: site.id, good, n },
  };
};

/** What a walk pays: setting out, the distance, the tier, and the worst country on the way. */
const walkPay = (kind: 'deliver' | 'escort', metres: number, tier: number, danger: number) =>
  (WALK_PAY[kind][0] + (WALK_PAY[kind][1] * metres) / 1000) * TIER_PAY[tier] * ROAD_PAY[Math.max(1, Math.min(5, danger))];

const makeDeliver: Maker = (site, tier, rng, _used, day) => {
  const f = site.faction!;
  const dests = lawfulTowns().filter((s) => s !== site && friendlyTo(f, s) && inReach(site, s, tier));
  if (!dests.length) return null;
  const to = rng.pick(dests);
  const d = Math.hypot(to.x - site.x, to.z - site.z);
  const contraband = to.faction !== 'ember' && f !== 'ember' && (f === 'scorched' || (tier > 0 && rng.chance(0.15)));
  const who = someone(to.faction!, rng);
  const trade = to.faction === 'hollows' ? 'Archivist' : to.faction === 'thrum' ? 'Hive Factor' : rng.pick(TRADES);
  const pay = round10(walkPay('deliver', d, tier, dangerBetween(site.x, site.z, to.x, to.z)) * (contraband ? 1.8 : 1));
  const bond = round10(pay * 0.6);
  const days = Math.max(2, Math.ceil(d / 2500) + 1 + (tier >= 2 ? 1 : 0));
  const lines = DELIVER[f] ?? DELIVER.default;
  return {
    kind: 'deliver', title: `A sealed parcel for ${who} in ${to.name}`, pay, bond, days, threat: 0, contraband,
    brief: fill(rng.pick(lines), { who, to: to.name, pay, bond, due: day + days }) + (contraband ? CONTRABAND : ''),
    e: { kind: 'deliver', site: to.id, item: contraband ? 'leaf_parcel' : 'sealed_parcel', who, title: trade },
  };
};

const makeEscort: Maker = (site, tier, rng) => {
  const f = site.faction!;
  const dests = lawfulTowns().filter((s) => s !== site && friendlyTo(f, s) && inReach(site, s, tier));
  rng.shuffle(dests);
  for (const to of dests.slice(0, 4)) {
    const route = roadRoute(site, to);
    if (!route) continue;
    const len = routeLength(route);
    if (len > TIER_REACH[tier][1] * 1.6 || throughHostileTown(route, f)) continue;
    const kind = TRAVELLERS[f] ?? TRAVELLERS.default;
    const who = someone(f, rng);
    const size = rng.int(kind.n[0], kind.n[1]);
    const pay = round10(walkPay('escort', len, tier, dangerAlong(route)));
    const days = Math.max(2, Math.ceil(len / 2500) + 1);
    const lines = ESCORT[f] ?? ESCORT.default;
    return {
      kind: 'escort', title: `See ${who} safe to ${to.name}`, pay, bond: 0, days, threat: 0,
      brief: fill(rng.pick(lines), { who, to: to.name, pay }),
      e: { kind: 'escort', site: to.id, from: site.id, who, faction: f, size },
    };
  }
  return null;
};

/** Whether a road passes through a town whose people would set on travellers of a faction. */
function throughHostileTown(route: number[], f: string): boolean {
  for (let i = 0; i < route.length; i += 8) {
    const s = S.T.siteAt(route[i], route[i + 1], 10);
    if (s?.kind === 'town' && s.faction && W().rel.hostile(f, s.faction)) return true;
  }
  return false;
}

/** Hunting grounds: just off a road out of town, a walk away. */
function huntGround(site: Site, tier: number, rng: RNG): { x: number; z: number; other: Site } | null {
  const key = site.settlement ?? site.key;
  const roads = S.T.roads.filter((r) => r.a === key || r.b === key);
  if (!roads.length) return null;
  for (let tries = 0; tries < 8; tries++) {
    const rd = rng.pick(roads);
    const other = S.T.sites.find((s) => (s.settlement ?? s.key) === (rd.a === key ? rd.b : rd.a));
    if (!other) continue;
    const n = rd.pts.length / 2, fromStart = rd.a === key;
    const want = rng.range(Math.max(450, TIER_REACH[tier][0] * 0.6), Math.min(2600, TIER_REACH[tier][1] * 0.7));
    for (let k = 0; k < n; k += 4) {
      const i = fromStart ? k : n - 1 - k;
      const px = rd.pts[i * 2], pz = rd.pts[i * 2 + 1];
      if (Math.hypot(px - site.x, pz - site.z) < want) continue;
      const a = rng.range(0, Math.PI * 2), off = rng.range(40, 90);
      const x = px + Math.sin(a) * off, z = pz + Math.cos(a) * off;
      if (S.T.heightAt(x, z) < 0.4 || S.T.slopeAt(x, z) > 0.5 || S.T.siteAt(x, z, 120)) break;
      return { x, z, other };
    }
  }
  return null;
}

const makeHunt: Maker = (site, tier, rng, used) => {
  const g = huntGround(site, tier, rng);
  if (!g) return null;
  const reg = S.T.regionAt(g.x, g.z);
  const [lo, hi] = TIER_THREAT[tier];
  const f = site.faction!;
  const road = `on the road to ${g.other.name}`;
  // a band of outlaws (not before tier II), or the worst of a kind of beast with some of its pack
  const bands = tier === 0 ? [] : Object.keys(BAND_SPEC).filter((b) => b !== f && SPECS.find((s) => s.key === BAND_SPEC[b])?.regions?.includes(reg.key) && W().rel.get(f, b) < -20);
  if (bands.length && rng.chance(0.5)) {
    const b = rng.pick(bands);
    const level = [12, 18, 26, 36][tier];
    let size = 1;
    while (size < 7 && bandThreat(b, size + 1, level) <= hi) size++;
    const threat = bandThreat(b, size, level);
    if (threat <= hi * 1.3) {
      const who = someone(b, rng), title = rng.pick(EPITHETS[b] ?? EPITHETS.default);
      if (used.has('who:' + who)) return null;
      used.add('who:' + who);
      const pay = round10(threat * [3.2, 3.6, 4, 4.5][tier] + 100);
      return {
        kind: 'hunt', title: `${named(who, title)} and their band`, pay, bond: 0, days: 3 + (tier >= 2 ? 1 : 0), threat,
        brief: fill(rng.pick(HUNT_BAND[f] ?? HUNT_BAND.default), { target: named(who, title), who, count: size, band: BAND_NAME[b] ?? short(b), road, pay }),
        e: { kind: 'hunt', site: site.id, x: g.x, z: g.z, who, title, faction: b, size, level },
      };
    }
  }
  const kinds = reg.fauna.map(([sp]) => sp).filter((sp) => ANIMAL[sp] && ANIMAL[sp].diet !== 'grazer' && !used.has('beast:' + sp));
  // fit a kind of beast, and the size of its pack, to the tier
  const fits: [string, number][] = [];
  for (const sp of kinds) for (let k = 0; k <= 4; k++) {
    const t = beastThreat(sp, true) + k * beastThreat(sp);
    if (t >= lo && t <= hi) fits.push([sp, k]);
  }
  if (!fits.length) return null;
  const [sp, k] = rng.pick(fits);
  used.add('beast:' + sp);
  const threat = beastThreat(sp, true) + k * beastThreat(sp);
  const who = rng.pick(BEAST_NAMES[sp] ?? BEAST_NAMES.default);
  const pay = round10(threat * [3.2, 3.6, 4, 4.5][tier] + 100);
  return {
    kind: 'hunt', title: `${who}, a ${ANIMAL[sp].name.toLowerCase()}`, pay, bond: 0, days: 3 + (tier >= 2 ? 1 : 0), threat,
    brief: fill(rng.pick(HUNT_BEAST[f] ?? HUNT_BEAST.default), { target: who, species: ANIMAL[sp].name.toLowerCase(), Species: ANIMAL[sp].name, road, pay }),
    e: { kind: 'hunt', site: site.id, x: g.x, z: g.z, who, species: sp, size: k },
  };
};

/** Camps a board might post: those of a kind that holds people the towns want gone. */
const campsOf = new WeakMap<object, Site[]>();
function campSites(): Site[] {
  let list = campsOf.get(S.T);
  if (!list) campsOf.set(S.T, (list = S.T.sites.filter((s) => !!CAMP_FOLK[s.kind])));
  return list;
}

const makeCamp: Maker = (site, tier, rng, used) => {
  if (tier === 0) return null; // camps are not odd jobs
  const f = site.faction!;
  const [lo, hi] = TIER_THREAT[tier];
  const stories = storyCamps(); // (a story's camp is the story's to pay for)
  const cands: Site[] = [];
  for (const s of campSites()) {
    if (used.has('camp:' + s.id) || stories.has(s.id) || Math.hypot(s.x - site.x, s.z - site.z) > TIER_REACH[tier][1]) continue;
    const folk = CAMP_FOLK[s.kind];
    if (folk.faction === f || W().rel.get(f, folk.faction) > -20) continue;
    // (a camp is what it is: the tier only says how hard a one to post, and the danger rating says the rest)
    const t = campEstimate(s).threat;
    if (t >= lo * 0.5 && t <= hi * 1.6) cands.push(s);
  }
  if (!cands.length) return null;
  const camp = rng.pick(cands);
  used.add('camp:' + camp.id);
  // (priced on what the town reckons holds it; what your people find there is for the danger rating to say)
  const ct = campEstimate(camp);
  const pay = round10(ct.threat * [3, 3.2, 3.6, 4.2][tier] + 200);
  const where = `${bearing(camp.x, camp.z, site)} of here`;
  return {
    kind: 'camp', title: `Clear ${camp.name}`, pay, bond: 0, days: 4, threat: ct.threat,
    brief: fill(rng.pick(CAMP[f] ?? CAMP.default), { camp: camp.name, where, count: `${ct.folk}, about ${ct.count} of them`, pay }),
    e: { kind: 'camp', site: camp.id },
  };
};

const MAKERS: Record<ContractKind, Maker> = { haul: makeHaul, deliver: makeDeliver, escort: makeEscort, hunt: makeHunt, camp: makeCamp };

/** A town's jobs for a day, from its own seed and the day (never the world's dice); `posted` holds the camps other boards already have. */
function postJobs(site: Site, day: number, posted: Set<string>): Contract[] {
  const rng = new RNG(hash3(site.seed, day, 0xb0a2d));
  const f = site.faction!;
  const out: Contract[] = [];
  const used = new Set<string>(posted);
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const tier = i === 0 ? 0 : rng.weighted(TIER_ODDS.map((w, k) => [k, w] as [number, number]));
    const weights = (KINDS[f] ?? KINDS.default).map(([k, w]) => [k, w] as [string, number]);
    for (let tries = 0; tries < 5 && weights.length; tries++) {
      const kind = rng.weighted(weights) as ContractKind;
      weights.splice(weights.findIndex(([k]) => k === kind), 1);
      const made = MAKERS[kind](site, tier, rng, used, day);
      if (!made) continue;
      const pool = REWARD_ITEMS[f];
      const item: [string, number, number] | undefined = pool && rng.chance(TIER_ITEM[tier]) ? (() => { const [id, k] = rng.pick(pool); return [id, k, TIER_GRADE[tier]] as [string, number, number]; })() : undefined;
      out.push({ ...made, title: cap(made.title), brief: cap(made.brief), id: `${site.id}.${day}.${i}`, tier, from: site.id, issuer: f, standing: TIER_STANDING[tier], penalty: TIER_PENALTY[tier], item });
      if (made.kind === 'camp') posted.add('camp:' + made.e.site);
      break;
    }
  }
  return out;
}

/**
 * Today's boards. They are all posted together the first time any is
 * wanted (a few milliseconds), town by town, so a camp one board has posted
 * is on no other. The order turns with the day, so every town gets its turn
 * to post first; another day, or another world, and they are drawn again.
 */
let posted = new WeakMap<object, { day: number; boards: Map<number, Contract[]> }>();
/** A town's board for today, and the ids of the jobs taken off today's boards. */
export function boardFor(site: Site): Board {
  const st = contractsState();
  const day = S.clock.day;
  if (st.takenDay !== day) { st.takenDay = day; st.taken = []; }
  let today = posted.get(W());
  if (!today || today.day !== day) {
    posted.set(W(), (today = { day, boards: new Map() }));
    const camps = new Set<string>(), towns = lawfulTowns();
    for (let i = 0; i < towns.length; i++) { const town = towns[(i + day) % towns.length]; today.boards.set(town.id, postJobs(town, day, camps)); }
  }
  return { day, list: today.boards.get(site.id) ?? [], taken: st.taken }; // (outlaws post nothing)
}
/** Takes today's boards down, to be drawn again (for the tests). */
export function forgetBoards() { posted = new WeakMap(); }

/** Whether a camp is already yours to clear, and why you cannot take it again: one camp, one job. */
function campHeld(siteId: number): string {
  return activeContracts().some((x) => x.kind === 'camp' && x.e.site === siteId) ? 'You already hold a job for that camp.' : '';
}
/** The jobs still on offer on a board (a camp that is empty, or already yours to clear, is no job). */
export const openJobs = (site: Site) => {
  const b = boardFor(site);
  return b.list.filter((c) => !b.taken.includes(c.id) && !(c.kind === 'camp' && (campLeft(c.e.site) === 0 || campHeld(c.e.site))));
};

// ---------------------------------------------------------------- weighing a job
/** How dangerous a job is for your band as it is now, and what the danger is. */
export function dangerOf(c: Contract): Rating & { what: string } {
  const e = c.e;
  if (c.kind === 'camp') { const s = siteById(e.site); const ct = s ? campThreat(s) : { threat: c.threat, count: 0, scouted: false, folk: '' }; return { ...rate(ct.threat), what: ct.scouted ? `${ct.count} ${ct.folk} still standing` : `${ct.folk}, about ${ct.count} of them` }; }
  if (c.kind === 'hunt') {
    const sq = e.squad ? W().squads.get(e.squad) : undefined;
    let t = c.threat;
    if (sq) { t = 0; for (const id of sq.members) { const m = W().char(id); if (m?.up) t += threat(m) * (m.animal && m.id === e.whoId ? BOSS_HP * BOSS_SKILL : 1); } }
    return { ...rate(t), what: e.species ? `${e.who}${e.size ? ` and ${e.size} of its pack` : ''}` : `${e.who} and ${e.size} ${BAND_NAME[e.faction!] ?? ''}` };
  }
  // on the road: what works the regions between here and there
  const a = siteById(c.kind === 'haul' ? e.site : c.from), b = siteById(e.site);
  const from = c.kind === 'haul' ? nearestCheap(c) ?? a : a;
  if (!from || !b) return { ...rate(0), what: '' };
  const r = roadThreat(from.x, from.z, b.x, b.z);
  return { ...rate(r.threat), what: r.who ? `${r.who} work that road` : 'a quiet road' };
}
/** Where a haul's goods are cheap, nearest first. */
function nearestCheap(c: Contract): Site | undefined {
  const to = siteById(c.e.site);
  if (!to) return undefined;
  let best: Site | undefined, bd = Infinity;
  for (const s of lawfulTowns()) {
    if (s === to || !MARKETS[s.settlement ?? '']?.cheap.includes(c.e.good!)) continue;
    const d = Math.hypot(s.x - to.x, s.z - to.z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** The pay in words: "640 chits, +3 with the Drifters, and a Fine Dust Coat". */
export function rewardText(c: Contract): string {
  const parts = [`${c.pay.toLocaleString()} chits`, `+${c.standing} with the ${short(c.issuer)}`];
  if (c.item) { const [id, n, q] = c.item; const d = ITEM[id]; if (d) parts.push(n > 1 ? `${n} ${d.name}` : gradeName(d, q)); }
  return parts.length > 2 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts.join(' and ');
}
/** What failing costs, in words. */
export function costText(c: Contract): string {
  return `${c.penalty} standing with the ${short(c.issuer)}${c.bond ? `, and the ${c.bond}-chit bond` : ''}`;
}
/** When it is due, in words: "by day 7 (1 day 4 hours left)". */
export function dueText(c: Contract): string {
  const due = c.due ?? S.clock.t + c.days * DAY;
  const left = due - S.clock.t;
  const d = Math.floor(left / DAY), h = Math.floor((left % DAY) / HOUR);
  const rest = left <= 0 ? ' (overdue)' : left < HOUR ? ' (under an hour left)' : ` (${d ? `${d} day${d > 1 ? 's' : ''} ` : ''}${h ? `${h} hour${h === 1 ? '' : 's'} ` : ''}left)`;
  return `by day ${Math.floor(due / DAY)}${c.due ? rest : ''}`;
}

/** Why your band cannot take a job now, or '' if it can. */
export function whyNot(c: Contract): string {
  const rel = W().rel.get('player', c.issuer);
  if (rel < TIERS[0].min) return fill(S.rng.pick(NO_WORK), { faction: FACTION[c.issuer]?.name ?? c.issuer });
  if (rel < TIERS[c.tier].min) return fill(LOCKED, { faction: FACTION[c.issuer]?.name ?? c.issuer, need: TIERS[c.tier].min });
  if (activeContracts().filter((x) => x.state === 'active' || x.state === 'ready').length >= MAX_ACTIVE) return `You already carry ${MAX_ACTIVE} jobs. Finish one first.`;
  if (c.kind === 'camp') {
    if (campLeft(c.e.site) === 0) return 'Nobody holds that camp any more.';
    const held = campHeld(c.e.site);
    if (held) return held;
  }
  if (c.bond > W().money) return `The bond is ${c.bond} chits. You don't have it.`;
  return '';
}

// ---------------------------------------------------------------- taking, finishing, failing
/** Takes a job off a board. Returns why not, or '' when it is yours. */
export function takeContract(c: Contract, p: Char): string {
  const st = contractsState();
  const why = whyNot(c);
  if (why) return why;
  const from = siteById(c.from);
  const b = from ? boardFor(from) : undefined;
  if (!b || !b.list.some((x) => x.id === c.id)) return 'That one has come down. Ask what\'s posted today.';
  if (b.taken.includes(c.id)) return 'Someone else has taken that one.';
  const job: Contract = JSON.parse(JSON.stringify(c));
  if (!startErrand(job.e, owner(job), p)) { releaseErrand(job.e); return job.kind === 'deliver' ? 'Make room in your pack for the parcel first.' : 'Not today. Ask again tomorrow.'; }
  W().money -= job.bond;
  job.taken = S.clock.t;
  job.due = S.clock.t + job.days * DAY;
  job.state = 'active';
  st.active.push(job);
  b.taken.push(c.id);
  const to = siteById(job.e.site);
  if (to) W().seenSites.add(to.id);
  W().say(`Took a job from ${keeperWord(siteById(c.from)!)}: ${job.title}. Due ${dueText(job)}.`, 'info', S.clock.t);
  S.fx.notice(`New job: ${job.title}.`, 'info');
  return '';
}

function retire(c: Contract, state: PastJob['state'], note: string) {
  const st = contractsState();
  c.state = state;
  st.active = st.active.filter((x) => x !== c);
  st.past.unshift({ id: c.id, title: c.title, kind: c.kind, from: c.from, issuer: c.issuer, state, t: S.clock.t, note });
  if (st.past.length > 40) st.past.length = 40;
}

/** A job done: the pay, the standing, the item, and the bond back. `bonus` is the half again for an outlaw brought in alive. */
function complete(c: Contract, p?: Char, bonus = 1): string {
  const st = contractsState();
  const pay = Math.round(c.pay * bonus);
  W().money += pay + c.bond;
  W().rel.add('player', c.issuer, c.standing);
  const lead = p ?? upMine()[0];
  if (c.item && lead) give(lead, c.item[0], c.item[1], c.item[2]);
  releaseErrand(c.e);
  st.done++;
  st.by[c.issuer] = (st.by[c.issuer] ?? 0) + 1;
  const what = `${pay.toLocaleString()} chits${c.bond ? ` and the ${c.bond}-chit bond` : ''}${c.item ? `, ${c.item[1] > 1 ? `${c.item[1]} ${ITEM[c.item[0]].name}` : gradeName(ITEM[c.item[0]], c.item[2])}` : ''}`;
  retire(c, 'done', what);
  // a camp is paid for once: any other job held for it (an older save could hold two) comes down, at no cost
  if (c.kind === 'camp') for (const twin of st.active.filter((x) => x.kind === 'camp' && x.e.site === c.e.site)) {
    releaseErrand(twin.e);
    retire(twin, 'failed', 'Paid for once already, under another job.');
  }
  W().say(`Job done: ${c.title}. Paid ${what}; +${c.standing} with the ${short(c.issuer)}.`, 'good', S.clock.t);
  S.fx.notice(`Job done: ${c.title}. +${pay.toLocaleString()} chits.`, 'good');
  if (lead) S.fx.sound('coin', lead.x, lead.z);
  return what;
}

/** A job failed: the standing it costs, and the bond is kept. A death you had no hand in costs nothing but the job. */
function failContract(c: Contract, why: string, fault = true) {
  const st = contractsState();
  releaseErrand(c.e);
  if (fault) W().rel.add('player', c.issuer, -c.penalty);
  else W().money += c.bond;
  st.failed++;
  retire(c, 'failed', why);
  W().say(`Job failed: ${c.title}. ${why}${fault ? ` (-${c.penalty} with the ${short(c.issuer)}${c.bond ? `; the ${c.bond}-chit bond is lost` : ''})` : ''}`, 'bad', S.clock.t);
  S.fx.notice(`Job failed: ${c.title}.`, 'bad');
}

/** You walk away from a job: it costs what failing costs. */
export function abandonContract(id: string): boolean {
  const st = contractsState();
  const c = st.active.find((x) => x.id === id);
  if (!c) return false;
  releaseErrand(c.e);
  W().rel.add('player', c.issuer, -c.penalty);
  st.abandoned++;
  retire(c, 'abandoned', `Walked away (-${c.penalty} with the ${short(c.issuer)}${c.bond ? `, bond lost` : ''}).`);
  W().say(`Walked away from a job: ${c.title}. -${c.penalty} with the ${short(c.issuer)}.`, 'bad', S.clock.t);
  return true;
}

/** Jobs that can be handed in to the keeper of this town now: goods here, quarries down, camps empty. */
function handIns(site: Site, keeper: Char): Contract[] {
  return activeContracts().filter((c) => c.from === site.id && ((c.kind === 'haul' && c.state === 'active' && carried(c.e.good!, keeper, 40) >= c.e.n!) || c.state === 'ready'));
}
/** Hands in what can be handed in; returns what was paid, in words. */
function handIn(site: Site, keeper: Char, p: Char): string {
  const out: string[] = [];
  for (const c of handIns(site, keeper)) {
    if (c.state !== 'active' && c.state !== 'ready') continue; // (come down as the twin of one just paid)
    if (c.kind === 'haul' && !takeGoods(c.e.good!, c.e.n!, keeper, 40)) continue;
    // an outlaw carried in alive pays half again, and goes to the cage
    let bonus = 1;
    const q = c.e.whoId ? W().char(c.e.whoId) : undefined;
    const carrier = q && q.alive && !q.animal ? W().playerChars().find((m) => m.carrying === q.id && Math.hypot(m.x - keeper.x, m.z - keeper.z) < 40) : undefined;
    if (q && carrier) {
      bonus = 1.5;
      dropCarried(carrier);
      const cage = findFreeCage(0, keeper.x, keeper.z);
      if (cage && Math.hypot(cage.x - keeper.x, cage.z - keeper.z) < 150) {
        // out of their band, which goes back to the road without them
        const band = W().squadOf(q);
        if (band) { band.members = band.members.filter((m) => m !== q.id); if (band.leader === q.id) band.leader = band.members[0] ?? 0; }
        q.squad = 0;
        cage.occupant = q.id; q.cage = cage.id; q.x = cage.x; q.z = cage.z; q.mem.jailUntil = S.clock.t + DAY * 20;
      } else W().removeChar(q);
    }
    out.push(`${c.title}: ${complete(c, p, bonus)}`);
  }
  return out.join('. ');
}

/** A parcel handed to whoever it was for: the job is done, or the story moves on. Returns what is said. */
function deliverTo(n: Char, p: Char): string {
  const key = n.mem.errand as string | undefined;
  if (!key) return '';
  const e = errandOf(key);
  if (!e || e.kind !== 'deliver' || e.uid === undefined || !findItem(e.uid)) return '';
  dropItem(e.uid);
  delete n.mem.errand;
  if (key.startsWith('s:')) return storyErrandDone(key.slice(2), p) || S.rng.pick(RECIPIENT.thanks);
  const c = activeContracts().find((x) => owner(x) === key);
  if (!c) return '';
  const what = complete(c, p);
  return `${S.rng.pick(RECIPIENT.thanks)} (${what}.)`;
}
/** The errand someone was brought in for, whoever it belongs to. */
function errandOf(key: string): Errand | undefined {
  if (key.startsWith('s:')) return storyErrand(key.slice(2));
  return activeContracts().find((c) => owner(c) === key)?.e;
}
/** Whether one of your people near someone carries the parcel meant for them. */
function hasParcelFor(n: Char, p: Char): boolean {
  const e = n.mem.errand ? errandOf(n.mem.errand) : undefined;
  if (!e || e.kind !== 'deliver' || e.uid === undefined || n.id !== e.whoId) return false;
  const at = findItem(e.uid);
  return !!at?.c && Math.hypot(at.c.x - p.x, at.c.z - p.z) < 30;
}

// ---------------------------------------------------------------- the tick
let t = 0, hintT = 0, sweeps = 0;
/** Called every step in play: jobs a second at a time, then the stories and the crisis on their own clocks. */
export function tickContracts(dt: number) {
  t -= dt;
  if (t <= 0) {
    t = 1;
    for (const c of activeContracts().slice()) {
      if (c.state !== 'active') continue;
      const r = checkErrand(c.e, owner(c));
      if (r === 'failed') failContract(c, c.e.why ?? 'It could not be done.', !c.e.blameless);
      else if (r === 'ready') {
        if (c.kind === 'escort') {
          const sq = c.e.squad ? W().squads.get(c.e.squad) : undefined;
          const lead = sq ? W().char(sq.leader) : undefined;
          if (lead) S.fx.say(lead, fill(S.rng.pick(TRAVELLER.arrive), { to: siteById(c.e.site)?.name ?? '' }));
          complete(c);
        } else {
          c.state = 'ready';
          const from = siteById(c.from);
          W().say(`${c.title}: done. Collect from ${from ? keeperWord(from) : 'the board'}.`, 'good', S.clock.t);
          S.fx.notice(`${c.title}: done. Collect your pay at ${from?.name ?? 'the board'}.`, 'good');
        }
      } else if (c.due && S.clock.t > c.due) failContract(c, 'Out of time.');
    }
  }
  hintT -= dt;
  if (hintT <= 0) { hintT = 5; firstBoard(); if (++sweeps % 12 === 0) sweepErrandFolk(); }
  tickStories(dt);
  tickCrisis(dt);
}

/** The first time your people walk into a town with a board, they hear of it. */
function firstBoard() {
  const st = contractsState();
  if (st.hinted || st.done || st.active.length) return;
  for (const c of upMine()) {
    const s = S.T.siteAt(c.x, c.z, 10);
    if (!s || !lawful(s) || !W().populated.has(s.id) || !keeperShop(s.id)) continue;
    st.hinted = true;
    S.fx.notice(`Work is posted in ${s.name}. Ask ${keeperWord(s).replace(` at ${s.name}`, '')} (J for your journal).`, 'info');
    return;
  }
}

// ---------------------------------------------------------------- talking about work
const BYE: DChoice = { t: 'Goodbye.', end: true };
const jobsOf = (c: DCtx) => (c.vars.jobs as Contract[] | undefined) ?? [];
const pickedJob = (c: DCtx) => jobsOf(c).find((x) => x.id === c.vars.job);
const nonHumanNear = (p: Char) => W().playerChars().some((m) => m.alive && !m.animal && RACE[m.look.race]?.race !== 'human' && Math.hypot(m.x - p.x, m.z - p.z) < 40);

/** One line for a job on the board. */
function jobLine(c: Contract): string {
  const locked = W().rel.get('player', c.issuer) < TIERS[c.tier].min;
  return `${locked ? `[${TIERS[c.tier].name}: standing ${TIERS[c.tier].min}] ` : ''}${KIND_NAME[c.kind]}: ${c.title}. ${c.pay.toLocaleString()} chits. Danger: ${dangerOf(c).word}.`;
}
/** A warning, if the job sends you among people who would set on you. */
function hostileAt(c: Contract): string {
  const to = siteById(c.e.site);
  if (!to?.faction || to.kind !== 'town' || to.id === c.from || !W().rel.hostile('player', to.faction)) return '';
  return `Be warned: the ${FACTION[to.faction]?.name ?? to.faction} of ${to.name} would set on your people.`;
}

/** Everything a board says about a job. */
export function jobText(c: Contract): string {
  const d = dangerOf(c);
  return [
    c.brief,
    `${KIND_NAME[c.kind]}, ${TIERS[c.tier].name.toLowerCase()} for the ${FACTION[c.issuer]?.name ?? c.issuer}.`,
    `Pay: ${rewardText(c)}${c.bond ? `. You leave a bond of ${c.bond} chits, returned on delivery` : ''}.`,
    `Danger: ${d.word}${c.kind === 'haul' || c.kind === 'deliver' || c.kind === 'escort' ? ' on the road' : ''}${d.what ? ` (${d.what})` : ''}. ${d.line}`,
    `Time: ${c.days} day${c.days > 1 ? 's' : ''}, ${dueText(c)}.`,
    `Fail or walk away and it costs ${costText(c)}.`,
    hostileAt(c),
  ].filter(Boolean).join('\n');
}

/** The choices a board's keeper adds to their conversation. */
export const WORK_CHOICES: DChoice[] = [
  { t: 'Any work going?', if: (c) => !!boardTownOf(c.n), next: 'work' },
  { t: 'I\'ve finished a job for you.', if: (c) => { const s = boardTownOf(c.n); return !!s && handIns(s, c.n).length > 0; }, fx: (c) => { const s = boardTownOf(c.n); c.vars.paid = s ? handIn(s, c.n, c.p) : ''; }, next: 'paid' },
];
const slotChoice = (i: number): DChoice => ({ t: (c) => jobLine(jobsOf(c)[i]), if: (c) => !!jobsOf(c)[i], fx: (c) => { c.vars.job = jobsOf(c)[i].id; }, next: 'job' });

/** The keeper's side of it: the board, a job, taking it. */
export const WORK_NODES: Tree = {
  work: {
    fx: (c) => {
      const s = boardTownOf(c.n);
      c.vars.refuse = !s ? 'Nothing posted.'
        : FACTION[s.faction!]?.laws.nonHuman && nonHumanNear(c.p) ? NO_BEASTS
          : W().rel.get('player', s.faction!) < TIERS[0].min ? fill(S.rng.pick(NO_WORK), { faction: FACTION[s.faction!]?.name ?? '' }) : '';
      c.vars.jobs = s && !c.vars.refuse ? openJobs(s) : [];
    },
    t: (c) => {
      const s = boardTownOf(c.n);
      if (c.vars.refuse || !s) return c.vars.refuse as string;
      const mine = activeContracts().filter((x) => x.from === s.id && x.state === 'active').length;
      return jobsOf(c).length ? `Here's what's posted today, day ${S.clock.day}.${mine ? ` You're already on ${mine} of ours.` : ''} Your standing with the ${short(s.faction!)}: ${Math.round(W().rel.get('player', s.faction!))}.` : 'That\'s everything for today. Come back tomorrow.';
    },
    ch: [0, 1, 2, 3, 4].map(slotChoice).concat([{ t: 'Nothing for me today.', next: 'start' }, BYE]),
  },
  job: {
    fx: (c) => { const j = pickedJob(c); c.vars.why = j ? whyNot(j) : ''; },
    t: (c) => { const j = pickedJob(c); return j ? `${jobText(j)}${c.vars.why ? `\n\n${c.vars.why}` : ''}` : 'That one\'s gone.'; },
    ch: [
      { t: 'I\'ll take it.', if: (c) => !!pickedJob(c) && !c.vars.why, fx: (c) => { const j = pickedJob(c)!; c.vars.why = takeContract(j, c.p); return c.vars.why ? 'job' : 'taken'; } },
      { t: 'Something else.', next: 'work' },
      BYE,
    ],
  },
  taken: { t: () => S.rng.pick(TAKEN), ch: [{ t: 'Anything else?', next: 'work' }, BYE] },
  paid: { t: (c) => `${S.rng.pick(PAID)} (${c.vars.paid}.)`, ch: [{ t: 'Any more work?', next: 'work' }, BYE] },
};

const RECIPIENT_TREE: Tree = {
  start: {
    t: (c) => fill(S.rng.pick(RECIPIENT.greet), { who: c.n.name }),
    ch: [
      { t: 'A parcel for you, sealed.', if: (c) => hasParcelFor(c.n, c.p), fx: (c) => { c.vars.said = deliverTo(c.n, c.p); }, next: 'thanks' },
      { t: 'Who are you?', next: 'who' },
      BYE,
    ],
  },
  thanks: { t: (c) => (c.vars.said as string) || S.rng.pick(RECIPIENT.thanks), ch: [BYE] },
  who: { t: (c) => aboutMe(c.n), ch: [BYE] },
};
const TRAVELLER_TREE: Tree = {
  start: { t: () => S.rng.pick(TRAVELLER.wait), ch: [{ t: 'Let\'s go.', end: true }, BYE] },
};

/** The conversation someone a job or a story brought in offers, if they are such a one. */
export function contractTree(n: Char): [Tree, string] | null {
  const story = storyTree(n);
  if (story) return story;
  const key = n.mem.errand as string | undefined;
  if (!key || n.faction === 'player') return null;
  const e = errandOf(key);
  if (!e) return null;
  if (e.kind === 'deliver' && n.id === e.whoId) return [RECIPIENT_TREE, 'start'];
  if (e.kind === 'escort') return [TRAVELLER_TREE, 'start'];
  return null;
}

// ---------------------------------------------------------------- what to do next
export interface Goal {
  text: string;
  where?: { x: number; z: number };
  /** the journal entry it comes from: 'job:<id>', 'story:<key>', 'crisis', or 'work' (no job yet: the boards) */
  entry?: string;
}

/** Where a job sends you now: the quarry, the travellers, the place; back to the board when it is done. */
export function contractWhere(c: Contract): { x: number; z: number } | null {
  if (c.state === 'ready' || (c.kind === 'haul' && carried(c.e.good!) >= c.e.n!)) { const s = siteById(c.from); return s ? { x: s.x, z: s.z } : null; }
  return errandWhere(c.e);
}
/** A job's next step, as a line. */
export function contractStep(c: Contract): string {
  const from = siteById(c.from), to = siteById(c.e.site);
  const keeper = from ? keeperWord(from) : 'the board';
  if (c.state === 'ready') return `Collect your pay from ${keeper}.`;
  switch (c.kind) {
    case 'haul': { const have = carried(c.e.good!); return have >= c.e.n! ? `Bring the ${ITEM[c.e.good!].name} to ${keeper}.` : `Get ${c.e.n} ${ITEM[c.e.good!].name} (you carry ${have}) and bring them to ${keeper}.`; }
    case 'deliver': return `Take the parcel to ${c.e.who} in ${to?.name ?? '?'}.`;
    case 'escort': return `See ${c.e.who} safe to ${to?.name ?? '?'}. They walk only with your people beside them.`;
    case 'hunt': return `Bring down ${c.e.who}, ${c.e.species ? `a ${ANIMAL[c.e.species]?.name.toLowerCase()}` : c.e.title}, ${bearing(c.e.x!, c.e.z!)} of your people.`;
    case 'camp': return `Clear ${to?.name ?? 'the camp'}, ${to ? bearing(to.x, to.z) : ''} of your people.`;
  }
  return c.title;
}

/**
 * The most pressing thing to do now, for the objective tracker: the crisis
 * if a wave is coming, a job about to run out, pay waiting to be collected,
 * the next step of a story, any job; failing all that, where work is posted.
 */
export function currentGoal(): Goal | null {
  if (!S.W || !S.T) return null;
  const cs = crisisState();
  const crisis = crisisGoal();
  if (crisis && (cs.state === 'warning' || cs.squads.length)) return crisis;
  const act = activeContracts().filter((c) => c.state === 'active' || c.state === 'ready');
  const soon = act.filter((c) => c.state === 'active' && (c.due ?? Infinity) - S.clock.t < DAY / 2).sort((a, b) => (a.due ?? 0) - (b.due ?? 0))[0];
  if (soon) return { text: `${contractStep(soon)} Due ${dueText(soon)}.`, where: contractWhere(soon) ?? undefined, entry: 'job:' + soon.id };
  const ready = act.find((c) => c.state === 'ready');
  if (ready) return { text: `${ready.title}: ${contractStep(ready)}`, where: contractWhere(ready) ?? undefined, entry: 'job:' + ready.id };
  const story = storyViews().find((v) => v.s.state === 'active');
  if (story) return storyGoal();
  if (crisis) return crisis;
  const next = act.sort((a, b) => (a.due ?? 0) - (b.due ?? 0))[0];
  if (next) return { text: `${contractStep(next)} Due ${dueText(next)}.`, where: contractWhere(next) ?? undefined, entry: 'job:' + next.id };
  const open = storyGoal();
  if (open) return open;
  // nothing on: the nearest board your people know of
  const lead = upMine()[0];
  if (!lead) return null;
  const town = S.T.nearestSite(lead.x, lead.z, (s) => lawful(s) && (W().discovered.has(s.id) || W().seenSites.has(s.id) || W().populated.has(s.id)));
  return town ? { text: `Ask ${keeperWord(town)} for work: every lawful town keeps a board.`, where: { x: town.x, z: town.z }, entry: 'work' } : null;
}

/** Everything worth marking on the map: jobs, story steps, the crisis. */
export function goalMarks(): { x: number; z: number; label: string; kind: 'job' | 'story' | 'crisis'; done?: boolean }[] {
  const out: { x: number; z: number; label: string; kind: 'job' | 'story' | 'crisis'; done?: boolean }[] = [];
  for (const c of activeContracts()) {
    if (c.state !== 'active' && c.state !== 'ready') continue;
    const w = contractWhere(c);
    if (w) out.push({ ...w, label: c.state === 'ready' ? `Collect: ${c.title}` : c.title, kind: 'job', done: c.state === 'ready' });
  }
  for (const v of storyViews()) if (v.where && (v.s.state === 'active' || v.s.state === 'open')) out.push({ ...v.where, label: `${v.def.name}: ${v.step?.title ?? v.def.giver.name}`, kind: 'story' });
  const cg = crisisGoal();
  if (cg?.where) out.push({ ...cg.where, label: 'The Foundry Mind', kind: 'crisis' });
  return out;
}

export { errandProgress, nearestMine };
