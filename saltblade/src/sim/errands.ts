// Errands: what a contract or a step of a story asks of you, out in the
// world. An errand says where to go and what counts as done (goods in hand,
// a parcel handed over, a traveller through a gate, a quarry down, a camp
// emptied), brings in whoever it needs with the world's own spawners, and is
// checked a few times a second. All it keeps is plain JSON: ids and numbers,
// never references, so it rides in the save's flags.
import { S } from './ctx';
import type { Char, Role } from './char';
import { Squad } from './squad';
import { World } from './world';
import { RNG, hash3, hashStr } from '../core/rng';
import { makePerson } from './spawn';
import { SPECS, BEASTS, spawn, threat, playerBand, fitAgainst, trimTo, type Band, type Spec } from './worldsim';
import { stop, toolsDown } from './move';
import { SK } from './skills';
import { emit } from '../core/events';
import { HOUR, DAY } from './clock';
import { ANIMAL } from '../content/animals';
import { FACTION } from '../content/factions';
import { ITEM } from '../content/items';
import { DANGER, DANGER_AT, CAMP_FOLK, BAND_SPEC, BAND_NAME, TRAVELLERS, RUNAWAY } from '../content/contracts';
import type { Site } from '../world/terrain';
import type { TownInfo } from '../world/towns';

export type ErrandKind = 'haul' | 'deliver' | 'escort' | 'hunt' | 'camp' | 'talk' | 'reach' | 'defend' | 'free' | 'duel';

export interface Errand {
  kind: ErrandKind;
  /** the place it is about: where goods or a parcel or a traveller go, the camp, the place to reach or hold */
  site: number;
  /** where a traveller sets out from */
  from?: number;
  /** hunting grounds */
  x?: number;
  z?: number;
  /** goods to bring */
  good?: string;
  n?: number;
  /** what is carried for someone, and the very one handed over */
  item?: string;
  uid?: number;
  /** a recipient, a traveller or a quarry, and what they are called; their id once they exist */
  who?: string;
  title?: string;
  whoId?: number;
  /** a quarry: a beast, or a band of a people; how many come with it; how hard it is */
  species?: string;
  faction?: string;
  size?: number;
  level?: number;
  /** a quarry that is an ordinary one of its kind, not the worst of them (an easy first job); or bigger again than the worst (a story's great beast) */
  plain?: boolean;
  great?: number;
  /** a free step: the ones set loose so far (n: how many it asks) */
  freed?: number[];
  /** travellers who have come where they mean to live, and stay there once walked in */
  settle?: boolean;
  /** a duel: what the one to beat fights with, which of yours fights them, and when it began (sim time) */
  race?: string;
  loadout?: string;
  duelist?: number;
  armedT?: number;
  /** what a band carries, a few each */
  loot?: string;
  /** the squad brought in for it */
  squad?: number;
  /** travellers: everyone who set out (a squad loses the ones carried off) */
  party?: number[];
  /** a traveller's road, and how far along it they are */
  route?: number[];
  ri?: number;
  paused?: boolean;
  /** a defence: when the attack was sent, and when it may come again */
  armed?: number;
  again?: number;
  /** ready: done, to collect or move on from; failed: it cannot be done any more */
  state?: 'open' | 'ready' | 'failed';
  why?: string;
  /** it failed through nobody's fault of yours (the one a parcel was for, dead by another hand) */
  blameless?: boolean;
  /** when a carried parcel went missing, or the last traveller was carried off */
  lostT?: number;
}

const W = () => S.W;
/** Sites by id, for the land in play (looked up every second for every job). */
const sitesOf = new WeakMap<object, Map<number, Site>>();
export function siteById(id: number | undefined): Site | undefined {
  if (!id) return undefined;
  let m = sitesOf.get(S.T);
  if (!m) { m = new Map(S.T.sites.map((s) => [s.id, s])); sitesOf.set(S.T, m); }
  return m.get(id);
}
export const siteByKey = (key: string) => S.T.sites.find((s) => s.key === key || s.settlement === key);
const dist = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- a kept errand put to rights
const NUMBERS = ['from', 'x', 'z', 'n', 'uid', 'whoId', 'size', 'level', 'great', 'duelist', 'armedT', 'squad', 'ri', 'armed', 'again', 'lostT'] as const;
const WORDS = ['good', 'item', 'who', 'title', 'species', 'faction', 'race', 'loadout', 'loot', 'why'] as const;
const FLAGS = ['plain', 'settle', 'paused', 'blameless'] as const;
const LISTS = ['freed', 'party', 'route'] as const;
const STATES = new Set(['open', 'ready', 'failed']);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const numberList = (v: unknown) => Array.isArray(v) && v.every(finite);
/** Whether everything an errand keeps is of the shape the game reads it as (a save broken or edited by hand may hold anything). Cheap: looked at every second. */
export function errandSound(e: Record<string, any>): boolean {
  if (!finite(e.site)) return false;
  for (const k of NUMBERS) if (e[k] !== undefined && !finite(e[k])) return false;
  for (const k of WORDS) if (e[k] !== undefined && typeof e[k] !== 'string') return false;
  for (const k of FLAGS) if (e[k] !== undefined && typeof e[k] !== 'boolean') return false;
  for (const k of LISTS) if (e[k] !== undefined && !numberList(e[k])) return false;
  return e.state === undefined || STATES.has(e.state);
}
/**
 * Puts a kept errand to rights: what is of the wrong shape is let go, and what
 * it cannot go on without is found again or begun afresh (a quarry is its
 * band's leader; a duel missing one of its two is fought again from the start;
 * a walk that lost its road goes straight there).
 */
export function mendErrand(e: Record<string, any>) {
  for (const k of NUMBERS) if (e[k] !== undefined && !finite(e[k])) delete e[k];
  for (const k of WORDS) if (e[k] !== undefined && typeof e[k] !== 'string') delete e[k];
  for (const k of FLAGS) if (e[k] !== undefined && typeof e[k] !== 'boolean') delete e[k];
  for (const k of LISTS) if (e[k] !== undefined && !numberList(e[k])) delete e[k];
  if (e.state !== undefined && !STATES.has(e.state)) e.state = 'open';
  if (e.kind === 'hunt' && e.whoId === undefined && e.squad !== undefined) { const lead = W().squads.get(e.squad)?.leader; if (lead) e.whoId = lead; }
  if (e.kind === 'duel' && e.armedT && (e.whoId === undefined || e.duelist === undefined)) e.armedT = 0;
  if (e.kind === 'escort' && e.squad !== undefined && !e.route?.length) { const to = siteById(e.site); if (to) { e.route = [to.x, to.z]; e.ri = 0; } }
}

// ---------------------------------------------------------------- how dangerous
export interface Rating { level: number; word: string; line: string; ratio: number }

/** What a threat comes to against your band as it stands now: the board's honest word for it. */
export function rate(t: number, band: Band = playerBand()): Rating {
  const ratio = t / Math.max(15, band.power);
  let level = 0;
  for (let i = 0; i < DANGER_AT.length; i++) if (ratio >= DANGER_AT[i]) level = i;
  return { level, ...DANGER[level], ratio };
}

let novice: Band | undefined;
/** A band just setting out: `n` of the people a new game starts with (as the Wanderer comes). The first job on a board is one they can do. */
export function noviceBand(n = 1): Band {
  if (!novice) {
    const c = makePerson(new World(), { faction: 'drifters', role: 'merc', level: 8, loadout: 'drifters_wanderer', whole: true }, new RNG(hash3(8, 77, 5)));
    novice = { n: 1, power: c.power(), level: (c.sk[SK.melee_atk] + c.sk[SK.melee_def] + c.sk[SK.toughness] + c.sk[SK.strength] + c.sk[SK.dexterity]) / 5 };
  }
  return { n, power: novice.power * n, level: novice.level };
}

const powers = new Map<string, number>();
/** How strong one of a people's fighters usually is, as they come or at a level (sampled once, never in the world). */
export function typicalPower(faction: string, role: string, level?: number): number {
  const lv = level === undefined ? -1 : Math.round(level / 4) * 4;
  const key = `${faction}|${role}|${lv}`;
  let v = powers.get(key);
  if (v === undefined) {
    const scratch = new World();
    const rng = new RNG(hash3(hashStr(key), 77, 3));
    let sum = 0;
    for (let i = 0; i < 6; i++) sum += makePerson(scratch, { faction, role: role as Role, level: lv < 0 ? undefined : lv }, rng).power();
    v = sum / 6;
    powers.set(key, v);
  }
  return v;
}

/** A quarry beast is bigger and meaner than the rest of its kind. */
export const BOSS_HP = 1.6, BOSS_SKILL = 1.25;
/** How much of a fight a beast is (see worldsim's threat), the worst of its kind more so. */
export function beastThreat(species: string, boss = false) {
  const a = ANIMAL[species];
  return a ? a.power * Math.max(1, a.hp) * (boss ? BOSS_HP * BOSS_SKILL : 1) : 0;
}
/** How much of a fight a band of a people is, with a leader a little better than the rest. */
export function bandThreat(faction: string, n: number, level?: number) {
  const spec = SPECS.find((s) => s.key === BAND_SPEC[faction]);
  const per = typicalPower(faction, spec?.role ?? 'bandit', level);
  return per * n + typicalPower(faction, spec?.role ?? 'bandit', (level ?? 20) + 8);
}

/** Squads that mean harm to travellers, by the regions they work, and how many come. */
function roadFolk(reg: string): { spec: Spec; n: number; per: (level?: number) => number }[] {
  const out: { spec: Spec; n: number; per: (level?: number) => number }[] = [];
  for (const s of SPECS) if ((s.kind === 'raid' || s.kind === 'slavers') && s.regions?.includes(reg)) out.push({ spec: s, n: (s.n[0] + s.n[1]) / 2, per: (lv) => typicalPower(s.faction, s.role, lv) });
  for (const b of BEASTS) {
    const a = ANIMAL[b.species!];
    if (!b.regions?.includes(reg) || !a || a.diet === 'grazer') continue;
    out.push({ spec: b, n: (b.n[0] + b.n[1]) / 2, per: () => beastThreat(b.species!) });
  }
  return out;
}

/** Regions a straight walk from a to b crosses. */
function regionsBetween(ax: number, az: number, bx: number, bz: number): string[] {
  const out = new Set<string>();
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 250));
  for (let i = 0; i <= n; i++) out.add(S.T.regionAt(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n).key);
  return [...out];
}

/**
 * The worst that is likely to come at your band on the road from a to b:
 * the bands of the regions it crosses, sized as the roads size them against
 * a band like yours (see fitAgainst), never more than they would send.
 */
export function roadThreat(ax: number, az: number, bx: number, bz: number, band: Band = playerBand()): { threat: number; who: string } {
  let best = 0, bestRaw = 0, who = '';
  const fitRng = new RNG(1);
  for (const reg of regionsBetween(ax, az, bx, bz)) {
    for (const f of roadFolk(reg)) {
      const fit = fitAgainst(band, f.spec.faction, S.clock.day, fitRng);
      const raw = Math.min(f.n, fit.n) * f.per(f.spec.species ? undefined : fit.level);
      const t = Math.min(raw, fit.budget);
      // (those the roads cut down to the same size are told apart by what they would be uncut)
      if (t > best || (t === best && raw > bestRaw)) { best = t; bestRaw = raw; who = f.spec.species ? ANIMAL[f.spec.species].plural : BAND_NAME[f.spec.faction] ?? FACTION[f.spec.faction]?.name ?? f.spec.faction; }
    }
  }
  return { threat: best, who };
}

/** The squads that hold a camp (people and beasts), wherever they have wandered. */
function campSquads(siteId: number): Squad[] {
  const out: Squad[] = [];
  for (const sq of W().squads.values()) if (sq.site === siteId && (sq.kind === 'camp' || sq.kind === 'nest')) out.push(sq);
  return out;
}
/** On their feet and nobody's prisoner: not caged, chained or carried off. */
export const free = (c: Char | undefined): c is Char => !!c && c.up && !c.cage && !c.shackled && !c.carriedBy;
/** How many of a camp's people still hold it (on their feet, and free), or -1 if nobody of yours has been near enough to know. */
export function campLeft(siteId: number): number {
  if (!W().populated.has(siteId)) return -1;
  let n = 0;
  for (const sq of campSquads(siteId)) for (const id of sq.members) if (free(W().char(id))) n++;
  return n;
}

/** What usually holds a camp of its kind in its region: the board's estimate, the same every day whatever has happened there. */
export function campEstimate(site: Site): { threat: number; count: number; folk: string } {
  const folk = CAMP_FOLK[site.kind];
  if (!folk) return { threat: 0, count: 0, folk: 'people' };
  const danger = S.T.regionAt(site.x, site.z).danger;
  const n = (folk.n[0] + folk.n[1]) / 2 + (folk.perDanger ?? 0) * danger;
  const lvl = folk.level ? (folk.level[0] + folk.level[1]) / 2 : undefined;
  let t = n * typicalPower(folk.faction, folk.role, lvl), count = n;
  for (const [sp, k] of folk.beasts ?? []) { t += k * beastThreat(sp); count += k; }
  // (an outlaw with a price on their head leads it: the bounty board is posted once, with the world)
  if (W().bountyBoard.some((b) => b.site === site.id)) { t += typicalPower(folk.faction, 'boss', 42); count += 1; }
  return { threat: t, count: Math.round(count), folk: folk.name };
}

/** How strong a camp is: who really holds it if your people have been near it, else what usually lives in one. */
export function campThreat(site: Site): { threat: number; count: number; scouted: boolean; folk: string } {
  const folk = CAMP_FOLK[site.kind];
  if (W().populated.has(site.id)) {
    let t = 0, n = 0;
    for (const sq of campSquads(site.id)) for (const id of sq.members) { const c = W().char(id); if (free(c)) { t += threat(c); n++; } }
    return { threat: t, count: n, scouted: true, folk: folk?.name ?? 'people' };
  }
  return { ...campEstimate(site), scouted: false };
}

/** The worst country a walk crosses: the highest danger (1 to 5) of the regions along its points (x, z pairs). */
export function dangerAlong(pts: number[]): number {
  let worst = 1;
  for (let i = 0; i + 1 < pts.length; i += 2) worst = Math.max(worst, S.T.regionAt(pts[i], pts[i + 1]).danger);
  return worst;
}
/** ...and on a straight walk from a to b, looked at every 250 m. */
export function dangerBetween(ax: number, az: number, bx: number, bz: number): number {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 250));
  let worst = 1;
  for (let i = 0; i <= n; i++) worst = Math.max(worst, S.T.regionAt(ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n).danger);
  return worst;
}

/** Where a duel is fought: a place's ring (Hornspire's Pit), else its middle. */
export function duelRing(site: Site): { x: number; z: number; r: number } {
  for (const o of W().objs.values()) if (o.def === 'arena' && o.site === site.id) return { x: o.x, z: o.z, r: o.data?.r ?? 10 };
  return { x: site.x, z: site.z, r: 10 };
}

// ---------------------------------------------------------------- roads
/** The way from one town to another along the roads (a few hops at most), as waypoints; else across country. */
export function roadRoute(a: Site, b: Site): number[] | null {
  const ka = a.settlement ?? a.key, kb = b.settlement ?? b.key;
  const prev = new Map<string, { k: string; r: number; rev: boolean }>();
  const seen = new Set([ka]);
  let frontier = [ka];
  for (let hop = 0; hop < 4 && frontier.length && !seen.has(kb); hop++) {
    const next: string[] = [];
    for (const k of frontier) S.T.roads.forEach((rd, r) => {
      const other = rd.a === k ? rd.b : rd.b === k ? rd.a : '';
      if (!other || seen.has(other)) return;
      seen.add(other);
      prev.set(other, { k, r, rev: rd.b === k });
      next.push(other);
    });
    frontier = next;
  }
  if (seen.has(kb)) {
    const legs: { r: number; rev: boolean }[] = [];
    for (let k = kb; k !== ka;) { const p = prev.get(k)!; legs.unshift({ r: p.r, rev: p.rev }); k = p.k; }
    const out: number[] = [];
    for (const { r, rev } of legs) {
      const pts = S.T.roads[r].pts, n = pts.length / 2;
      for (let k = 0; k < n; k += 6) { const i = rev ? n - 1 - k : k; out.push(pts[i * 2], pts[i * 2 + 1]); }
      const last = rev ? 0 : n - 1;
      out.push(pts[last * 2], pts[last * 2 + 1]);
    }
    return out;
  }
  const c = S.nav.coarsePath(a.x, a.z, b.x, b.z);
  if (!c) return null;
  const out: number[] = [];
  for (let i = 0; i < c.length; i += 10) out.push(c[i], c[i + 1]);
  out.push(b.x, b.z);
  return out;
}
/** How long a route is, in metres. */
export function routeLength(r: number[]) {
  let d = 0;
  for (let i = 2; i < r.length; i += 2) d += Math.hypot(r[i] - r[i - 2], r[i + 1] - r[i - 1]);
  return d;
}

/** Open ground near a point, off any site: where something can stand. */
function openNear(x: number, z: number, r = 14): [number, number] | null {
  return S.nav.nearestOpen(x, z, r);
}

// ---------------------------------------------------------------- your people and their packs
const packsOf = (c: Char) => [c.inv, c.eq.back?.inv].filter((g): g is NonNullable<typeof g> => !!g);

/** How many of a good your people carry, all of them or only those near a point. */
export function carried(good: string, near?: { x: number; z: number }, r = 40): number {
  let n = 0;
  for (const c of W().playerChars()) {
    if (near && dist(c, near) > r) continue;
    for (const g of packsOf(c)) n += g.count(good);
  }
  return n;
}
/** Takes goods from your people near a point; true if there were enough. */
export function takeGoods(good: string, n: number, near: { x: number; z: number }, r = 40): boolean {
  if (carried(good, near, r) < n) return false;
  for (const c of W().playerChars()) {
    if (n <= 0) break;
    if (dist(c, near) > r) continue;
    for (const g of packsOf(c)) if (n > 0) n -= g.take(good, n);
  }
  return true;
}

/** Where a carried item is: whose pack, or the store or pile it sits in, if it is still yours to reach. */
export function findItem(uid: number): { grid: NonNullable<Char['inv']>; c?: Char } | null {
  for (const c of W().playerChars()) for (const g of packsOf(c)) if (g.items.some((it) => it.uid === uid)) return { grid: g, c };
  for (const o of W().objs.values()) {
    if (!o.inv || (o.owner !== 'player' && o.kind !== 'pile')) continue;
    if (o.inv.items.some((it) => it.uid === uid)) return { grid: o.inv };
  }
  return null;
}
/** Removes a carried item, wherever it is. */
export function dropItem(uid: number) {
  const at = findItem(uid);
  const it = at?.grid.items.find((x) => x.uid === uid);
  if (at && it) at.grid.remove(it);
}

/** Puts something in someone's pack, or at their feet if it will not fit. */
export function give(c: Char, id: string, n: number, q = 2) {
  if (!ITEM[id]) return;
  let left = c.inv.add(id, n, q);
  if (left && c.eq.back?.inv) left = c.eq.back.inv.add(id, left, q);
  if (left) emit('world:drop', c.x, c.z, [{ uid: 0, id, q, n: left, x: 0, y: 0 }]);
}

/** Someone joins your band, beside one of yours. */
export function enlist(c: Char, near: Char) {
  const sq = W().squadOf(near);
  if (!sq) return;
  c.faction = 'player';
  c.role = c.animal ? 'animal' : 'player';
  c.recruitable = false;
  c.brain = {};
  c.order = null;
  c.dirty = true;
  W().moveToSquad(c, sq);
  const p = openNear(near.x + 2, near.z + 1, 8) ?? [near.x, near.z];
  c.x = p[0]; c.z = p[1]; c.y = S.T.heightAt(c.x, c.z);
  c.homeX = c.x; c.homeZ = c.z;
  emit('squad');
}

/** Your people still on their feet. */
export const upMine = () => W().playerChars().filter((c) => c.up && !c.cage && !c.carriedBy);
/** The nearest of your people standing to a point, and how far. */
export function nearestMine(x: number, z: number): [Char | null, number] {
  let best: Char | null = null, bd = Infinity;
  for (const c of upMine()) { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } }
  return [best, bd];
}

// ---------------------------------------------------------------- bringing people in
/** A squad brought in for an errand: the world's spawner, then kept out of the world's own coming and going. */
function bringIn(spec: Spec, n: number, x: number, z: number, level?: number, loadout?: string): Squad | null {
  const sq = spawn({ ...spec, n: [n, n] }, { x, z, route: [x, z], level, loadout });
  if (!sq) return null;
  delete sq.flags.spec; // not a roamer: worldsim neither walks it off nor tidies it away
  sq.route = null;
  sq.ri = 0;
  sq.ttl = 0;
  sq.task = { k: 'hold' };
  return sq;
}

/** Brings a quarry to its hunting grounds: the worst beast of its kind with a few of its pack, or a named outlaw and their band. */
export function spawnQuarry(e: Errand, owner: string): boolean {
  if (e.x === undefined || e.z === undefined) return false;
  const at = openNear(e.x, e.z, 30);
  if (!at) return false;
  let sq: Squad | null = null;
  if (e.species) {
    const spec = BEASTS.find((b) => b.species === e.species) ?? { key: 'beast_' + e.species, faction: 'fauna', kind: 'herd' as const, role: 'animal' as Role, n: [1, 1] as [number, number], weight: 1, species: e.species };
    sq = bringIn(spec, 1 + (e.size ?? 0), at[0], at[1]);
  } else if (e.faction) {
    const spec = SPECS.find((s) => s.key === BAND_SPEC[e.faction!]);
    if (spec) sq = bringIn(spec, 1 + (e.size ?? 2), at[0], at[1], e.level);
  }
  if (!sq) return false;
  const lead = W().char(sq.leader);
  if (!lead) return false;
  lead.name = e.who ?? lead.name;
  lead.title = e.species ? '' : e.title ?? '';
  lead.mem.errand = owner;
  if (lead.animal && e.plain) { /* an ordinary beast: as it comes */ }
  else if (lead.animal) {
    // the worst of its kind; a story's great beast bigger again, and it shows
    const big = BOSS_HP * (e.great ?? 1);
    for (let l = 0; l < 7; l++) { lead.body.max[l] = Math.round(lead.body.max[l] * big); lead.body.hp[l] = lead.body.max[l]; }
    lead.body.bloodMax = Math.round(lead.body.bloodMax * big); lead.body.blood = lead.body.bloodMax;
    for (let k = 0; k < lead.sk.length; k++) lead.sk[k] = Math.min(100, lead.sk[k] * BOSS_SKILL);
    if (e.great) lead.look.bulk = Math.max(lead.look.bulk, 1.1) * (1 + (e.great - 1) * 0.7); // (bigger than the biggest of its kind)
  } else for (const s of ['melee_atk', 'melee_def', 'toughness', 'strength'] as const) lead.sk[SK[s]] = Math.min(100, lead.sk[SK[s]] + 8);
  if (e.loot) for (const id of sq.members) W().char(id)?.inv.add(e.loot, 3);
  sq.name = e.species ? `${e.who}'s pack` : `${e.who}'s band`;
  sq.flags.errand = owner;
  e.squad = sq.id;
  e.whoId = lead.id;
  return true;
}

/** Someone set loose from slavery: nobody's property, of the people who took them in, and called what runaways are called. */
export function unchain(c: Char, faction: string) {
  c.faction = faction;
  c.role = 'wanderer';
  c.title = RUNAWAY;
  c.shackled = false;
  delete c.mem.enslavedBy; delete c.mem.slaveSite; delete c.mem.slaveSpot;
  // (the hoe goes down, and nobody sits in the furrows waiting for an overseer)
  toolsDown(c); delete c.mem.sit;
  c.dirty = true;
}
/** Someone comes to live in a town: one of its people now, at home in its square, and (a runaway) glad to walk with you if asked. */
export function settleAt(c: Char, site: Site, walkIn = false) {
  let sq = [...W().squads.values()].find((q) => q.site === site.id && q.kind === 'town' && q.faction === site.faction);
  if (!sq) { sq = new Squad(); sq.faction = site.faction ?? 'drifters'; sq.kind = 'town'; sq.name = site.name; sq.site = site.id; W().addSquad(sq); }
  if (c.cage) { const o = W().objs.get(c.cage); if (o) o.occupant = 0; c.cage = 0; }
  unchain(c, sq.faction);
  W().moveToSquad(c, sq);
  const info = W().towns.get(site.id) as TownInfo | undefined;
  const plaza = info?.posts.find((p) => p.kind === 'plaza');
  const rng = new RNG(hash3(c.id, site.id, 7));
  const a = rng.range(0, Math.PI * 2), r = rng.range(3, 9);
  const home = S.nav.nearestOpen((plaza?.x ?? site.x) + Math.sin(a) * r, (plaza?.z ?? site.z) + Math.cos(a) * r, 8) ?? [site.x, site.z];
  c.homeX = home[0]; c.homeZ = home[1]; c.homeDir = a;
  // (one coming from far off walks in from the edge of town, toward home; one already there just goes home)
  if (walkIn) {
    const b = Math.atan2(c.x - site.x, c.z - site.z);
    const edge = S.nav.nearestOpen(site.x + Math.sin(b) * site.r * 0.9, site.z + Math.cos(b) * site.r * 0.9, 12) ?? home;
    c.x = edge[0]; c.z = edge[1]; c.y = S.T.heightAt(c.x, c.z);
    c.path = null; c.hasGoal = false;
  }
  c.site = site.id;
  c.role = 'recruit';
  c.recruitable = true;
  c.price = 0;
  c.order = null; c.brain = {};
  delete c.mem.errand;
}

/** Gathers those a free step set loose into a party that walks with you from where they stand to where they will live. */
function gatherTravellers(e: Errand, owner: string): boolean {
  const to = siteById(e.site);
  if (!to) return false;
  const folk = (e.party ?? []).map((id) => W().char(id)).filter((c): c is Char => !!c && c.alive && c.faction !== 'player' && !c.cage && !c.carriedBy);
  if (!folk.length) return false;
  // on the road they are free folk like any other, nothing for the camp they left to fight over, nor the
  // town they walk to; the town takes them in as its own when they get there (settleAt)
  const sq = new Squad();
  sq.faction = 'drifters'; sq.kind = 'wanderers'; sq.name = 'The freed';
  W().addSquad(sq);
  for (const c of folk) {
    W().moveToSquad(c, sq);
    unchain(c, sq.faction);
    c.mem.errand = owner;
    c.recruitable = false; // (they walk with you to the reeds; asked there, they may come further)
    c.order = null; c.brain = {};
  }
  const lead = W().char(sq.leader)!;
  const path = S.nav.coarsePath(lead.x, lead.z, to.x, to.z);
  if (!path) { for (const c of folk) settleAt(c, to); W().squads.delete(sq.id); return false; }
  const route: number[] = [];
  for (let i = 0; i < path.length; i += 10) route.push(path[i], path[i + 1]);
  route.push(to.x, to.z);
  sq.task = { k: 'travel', to: to.id, x: to.x, z: to.z }; // routed: the leader waits rather than wanders
  sq.route = null;
  e.squad = sq.id;
  e.party = folk.map((c) => c.id);
  e.whoId = lead.id;
  e.route = route;
  e.ri = 0;
  e.paused = true;
  e.settle = true;
  return true;
}

/** Brings travellers to the edge of their town, facing the road, to wait for whoever walks them. */
export function spawnTraveller(e: Errand, owner: string): boolean {
  const from = siteById(e.from), to = siteById(e.site);
  if (!from || !to) return false;
  const route = e.route ?? roadRoute(from, to);
  if (!route || route.length < 4) return false;
  // the first point of the road outside the walls
  let k = 0;
  while (k < route.length - 2 && Math.hypot(route[k] - from.x, route[k + 1] - from.z) < from.r + 8) k += 2;
  const at = openNear(route[k], route[k + 1], 16);
  if (!at) return false;
  const kind = TRAVELLERS[e.faction ?? ''] ?? TRAVELLERS.default;
  const base = SPECS.find((s) => s.key === kind.spec);
  if (!base) return false;
  const sq = bringIn({ ...base, faction: e.faction ?? base.faction, role: kind.role as Role }, Math.max(1, e.size ?? 1), at[0], at[1]);
  if (!sq) return false;
  sq.task = { k: 'travel', to: to.id, x: to.x, z: to.z }; // routed: the leader waits rather than wanders
  sq.name = `${e.who}'s party`;
  sq.flags.errand = owner;
  for (const id of sq.members) {
    const c = W().char(id);
    if (!c) continue;
    c.title = kind.title;
    c.mem.errand = owner;
  }
  const lead = W().char(sq.leader)!;
  lead.name = e.who ?? lead.name;
  e.squad = sq.id;
  e.party = [...sq.members];
  e.whoId = lead.id;
  e.route = route.slice(k);
  e.ri = 0;
  e.paused = true;
  return true;
}

/** Brings the person a parcel is for into their town, once there are people in it to stand among. */
function spawnRecipient(e: Errand, owner: string): Char | null {
  const site = siteById(e.site);
  if (!site || !W().populated.has(site.id)) return null;
  const info = W().towns.get(site.id) as TownInfo | undefined;
  const post = info?.posts.find((p) => p.kind === 'plaza');
  const at = openNear(post ? post.x : site.x + 6, post ? post.z : site.z + 4, 10) ?? [site.x, site.z];
  let sq = [...W().squads.values()].find((q) => q.site === site.id && q.kind === 'town' && q.faction === site.faction);
  if (!sq) {
    sq = new Squad();
    sq.faction = site.faction ?? 'drifters'; sq.kind = 'town'; sq.name = site.name; sq.site = site.id;
    W().addSquad(sq);
  }
  const rng = new RNG(hash3(hashStr(owner), site.id, 5));
  const c = makePerson(W(), { faction: sq.faction, role: 'resident', name: e.who }, rng);
  W().moveToSquad(c, sq);
  c.x = at[0]; c.z = at[1]; c.y = S.T.heightAt(c.x, c.z);
  c.homeX = c.x; c.homeZ = c.z; c.homeDir = post?.dir ?? 0;
  c.site = site.id;
  c.title = e.title ?? '';
  c.mem.errand = owner;
  e.whoId = c.id;
  return c;
}

/**
 * Sends a war party of a kind of squad on a town, from out of sight: the
 * world's spawner makes it, `budget` caps its strength (see trimTo), and from
 * then on it is one of the world's war parties (worldevents), marching and
 * fighting like any other.
 */
export function sendWarParty(spec: Spec, n: number, site: Site, budget: number, level?: number, loadout?: string): Squad | null {
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, d = 560 + (i % 3) * 60;
    const x = site.x + Math.sin(a) * d, z = site.z + Math.cos(a) * d;
    if (S.T.heightAt(x, z) < 0.4 || S.T.slopeAt(x, z) > 0.5 || S.T.siteAt(x, z, 100)) continue;
    const at = openNear(x, z, 10);
    if (!at) continue;
    const sq = spawn({ ...spec, n: [n, n] }, { x: at[0], z: at[1], route: [site.x, site.z], level, loadout });
    if (!sq) return null;
    trimTo(sq, { n, budget, slack: 1.5 });
    sq.kind = 'raid';
    sq.flags.spec = 'campaign';
    sq.flags.townRaid = site.id;
    sq.task = { k: 'raid', site: site.id, x: site.x, z: site.z, until: S.clock.t + DAY };
    sq.ttl = S.clock.t + DAY * 2;
    return sq;
  }
  return null;
}

/**
 * The attack a defence is about: a war party of the errand's people, sized
 * to your band as the roads size them (see fitAgainst), and to the town's
 * own guards, who fight beside you.
 */
function sendAttack(e: Errand, site: Site): Squad | null {
  const spec = SPECS.find((s) => s.key === BAND_SPEC[e.faction ?? 'reavers']);
  if (!spec) return null;
  const fit = fitAgainst(playerBand(), spec.faction, S.clock.day);
  let guards = 0;
  for (const c of W().chars.values()) if (c.site === site.id && c.up && (c.role === 'guard' || c.role === 'patrol') && c.faction === site.faction) guards += c.power();
  const sq = sendWarParty(spec, Math.max(4, Math.min(9, fit.n + 4)), site, fit.budget * 1.5 + guards * 0.6, fit.level, fit.loadout);
  if (sq) sq.name = `${BAND_NAME[spec.faction] ?? FACTION[spec.faction]?.short ?? 'Raiding'} raiding party`;
  return sq;
}

// ---------------------------------------------------------------- starting, checking, letting go
/** Sets an errand going: hands over what is to be carried, brings in whoever it needs. False if it cannot be done from here. */
export function startErrand(e: Errand, owner: string, p?: Char): boolean {
  e.state = 'open';
  const site = siteById(e.site);
  if (site && site.kind !== 'town') W().seenSites.add(site.id); // now you know where it is
  switch (e.kind) {
    case 'deliver': {
      const c = p ?? upMine()[0];
      const d = e.item ? ITEM[e.item] : undefined;
      const g = c && d ? packsOf(c).find((x) => x.findSpot(d)) : undefined;
      if (!g) return false; // nowhere to put it
      const before = new Set(g.items.map((it) => it.uid));
      g.add(e.item!, 1);
      const it = g.items.find((x) => x.id === e.item && !before.has(x.uid));
      if (!it) return false;
      e.uid = it.uid;
      return true;
    }
    case 'hunt': return spawnQuarry(e, owner);
    case 'escort': return e.party?.length ? gatherTravellers(e, owner) : spawnTraveller(e, owner);
    case 'free': e.freed = []; return true;
  }
  return true;
}

// ---------------------------------------------------------------- a duel
/** Which of yours fights a duel: the one asked, if they are in the ring, else whoever of yours steps into it first. */
function duelistIn(e: Errand, rg: { x: number; z: number; r: number }): Char | null {
  const inRing = (c: Char) => !c.animal && free(c) && Math.hypot(c.x - rg.x, c.z - rg.z) < rg.r + 3;
  const asked = e.duelist ? W().char(e.duelist) : undefined;
  if (asked && asked.faction === 'player' && inRing(asked)) return asked;
  return W().playerChars().find(inRing) ?? null;
}
/** The one to beat steps into the ring, facing whoever of yours stands in it. */
function summonChampion(e: Errand, owner: string, site: Site, rg: { x: number; z: number; r: number }, p: Char): Char | null {
  // (the same one as last time, if they still stand: a lost duel is fought again against them)
  let c = [...W().chars.values()].find((x) => x.mem.champion === owner && x.alive && x.faction !== 'player') ?? null;
  if (c && c.status !== 'up') return null; // (still down from the last time: wait)
  if (!c) {
    let sq = [...W().squads.values()].find((q) => q.site === site.id && q.kind === 'town' && q.faction === site.faction);
    if (!sq) { sq = new Squad(); sq.faction = site.faction ?? 'karuk'; sq.kind = 'town'; sq.name = site.name; sq.site = site.id; W().addSquad(sq); }
    c = makePerson(W(), { faction: sq.faction, role: 'merc', race: e.race, level: e.level, loadout: e.loadout, name: e.who, whole: true }, new RNG(hash3(hashStr(owner), site.id, 13)));
    W().moveToSquad(c, sq);
    c.title = e.title ?? '';
    c.site = site.id;
    c.mem.champion = owner;
  }
  const a = Math.atan2(p.x - rg.x, p.z - rg.z) + Math.PI;
  const at = S.nav.nearestOpen(rg.x + Math.sin(a) * Math.min(4, rg.r * 0.6), rg.z + Math.cos(a) * Math.min(4, rg.r * 0.6), 5) ?? [rg.x, rg.z];
  c.x = at[0]; c.z = at[1]; c.y = S.T.heightAt(c.x, c.z);
  c.homeX = c.x; c.homeZ = c.z;
  c.path = null; c.hasGoal = false;
  // one on one: the champion fights only them, and nobody else's people join in (see ai: a bout is nobody else's fight)
  c.mem.bout = p.id; c.mem.enemies = [p.id];
  p.mem.bout = c.id;
  p.order = { k: 'attack', id: c.id };
  return c;
}
/** A duel over: both go back to being who they were. */
function endDuel(e: Errand) {
  const c = e.whoId ? W().char(e.whoId) : undefined, p = e.duelist ? W().char(e.duelist) : undefined;
  if (c) { delete c.mem.bout; c.mem.enemies = []; c.brain.enemy = 0; c.homeX = c.x; c.homeZ = c.z; }
  if (p) { delete p.mem.bout; p.brain.enemy = 0; if (p.order?.k === 'attack' && p.order.id === c?.id) p.order = null; }
}

/** Whether a char exists and still stands, free (a quarry caged, chained or carried off is as good as down). */
const standing = (id: number | undefined) => free(id ? W().char(id) : undefined);
/** Taken by someone: caged, chained, or carried by anyone not of yours. */
const captive = (c: Char) => !!c.cage || c.shackled || (!!c.carriedBy && W().char(c.carriedBy)?.faction !== 'player');
/** ...and held by your own people: in a cage of yours, or locked in anyone's by your hands. */
const heldByYou = (c: Char) => !!c.cage && (W().objs.get(c.cage)?.owner === 'player' || c.mem.caughtBy === 'player');
/** Takes someone out of a squad (they go nowhere with it any more). */
function leave(c: Char, sq: Squad) {
  sq.members = sq.members.filter((m) => m !== c.id);
  if (sq.leader === c.id) sq.leader = sq.members[0] ?? 0;
  c.squad = 0;
}

/**
 * Looks at how an errand is going. Returns 'ready' or 'failed' the moment it
 * becomes so, else null. Cheap enough to run every second.
 */
export function checkErrand(e: Errand, owner: string): 'ready' | 'failed' | null {
  if (e.state === 'ready' || e.state === 'failed') return null;
  const site = siteById(e.site);
  const fail = (why: string) => { e.state = 'failed'; e.why = why; return 'failed' as const; };
  switch (e.kind) {
    case 'deliver': {
      // the recipient comes to town with its people
      const who = e.whoId ? W().char(e.whoId) : undefined;
      if (e.whoId === undefined) spawnRecipient(e, owner);
      else if (!who || who.status === 'dead') {
        e.blameless = !who || W().char(who.lastHitBy)?.faction !== 'player';
        return fail(`${e.who} is dead.`);
      }
      // the parcel: in a pack of yours, a store of yours, or on the ground; gone for an hour, it is gone
      if (e.uid !== undefined) {
        if (findItem(e.uid)) delete e.lostT;
        else {
          e.lostT ??= S.clock.t;
          if (S.clock.t - e.lostT > HOUR) return fail('The parcel is gone: lost, taken, or burned.');
        }
      }
      return null;
    }
    case 'escort': {
      const sq = e.squad ? W().squads.get(e.squad) : undefined;
      const alive = (ids: number[]) => ids.map((id) => W().char(id)).filter((c): c is Char => !!c && c.alive);
      if (sq) {
        // whoever is taken goes no further with the party (left in it, a prisoner would hold the rest at the gate)...
        for (const c of alive(sq.members)) if (captive(c)) leave(c, sq);
        // ...and whoever is got back, free and still their own people, walks on with it
        for (const c of alive(e.party ?? [])) if (c.squad !== sq.id && c.faction === sq.faction && free(c)) W().moveToSquad(c, sq);
      }
      const people = sq ? alive(sq.members) : [];
      if (!sq || !people.length) {
        const party = alive(e.party ?? []);
        if (!party.length) return fail(`${e.who} did not live to see ${site?.name ?? 'the road\'s end'}.`);
        // carried off or caged: an hour to get them back, and then the job is lost (yours to answer for only if you hold them)
        e.lostT ??= S.clock.t;
        if (S.clock.t - e.lostT > HOUR) { e.blameless = !party.some(heldByYou); return fail(`${e.who} was carried off, and never reached ${site?.name ?? 'the road\'s end'}.`); }
        return null;
      }
      delete e.lostT;
      if (!people.some((c) => c.id === sq.leader)) sq.leader = people[0].id;
      const lead = W().char(sq.leader) ?? people[0];
      if (site && dist(lead, site) < site.r + 6) { e.state = 'ready'; sq.route = null; return 'ready'; }
      // they walk only with your people beside them
      const [, d] = nearestMine(lead.x, lead.z);
      const near = d < 45;
      if (near && e.paused) { sq.route = e.route ?? null; sq.ri = e.ri ?? 0; e.paused = false; }
      else if (!near && !e.paused) {
        e.ri = sq.ri; sq.route = null; e.paused = true;
        for (const c of people) if (c.up) stop(c);
      } else if (!e.paused) e.ri = sq.ri;
      return null;
    }
    case 'hunt': {
      if (e.whoId === undefined) return null;
      if (!standing(e.whoId)) { e.state = 'ready'; return 'ready'; }
      return null;
    }
    case 'free': {
      if ((e.freed?.length ?? 0) >= (e.n ?? 1)) { e.state = 'ready'; return 'ready'; }
      return null;
    }
    case 'duel': {
      if (!site) return fail('That place is gone.');
      const rg = duelRing(site);
      if (!e.armedT) {
        // it begins when one of yours steps into the ring, and the ring is free
        if (W().flags.bout) return null;
        const p = duelistIn(e, rg);
        if (!p) return null;
        const c = summonChampion(e, owner, site, rg, p);
        if (!c) return null;
        e.whoId = c.id; e.duelist = p.id; e.armedT = S.time;
        W().say(`${c.name}, ${c.title}, stepped into the ring against ${p.name}.`, 'story', S.clock.t);
        S.fx.notice(`${c.name} steps into the ring. One on one: anyone else of yours who joins in forfeits it.`, 'info');
        S.fx.sound('bell', rg.x, rg.z, 1);
        return null;
      }
      const c = e.whoId ? W().char(e.whoId) : undefined, p = e.duelist ? W().char(e.duelist) : undefined;
      if (!c || c.status !== 'up') { endDuel(e); e.state = 'ready'; return 'ready'; }
      const lost = (why: string) => { endDuel(e); e.armedT = 0; return fail(why); };
      if (!p || p.status !== 'up' || p.cage || p.carriedBy) return lost(`${c.name} put ${p?.name ?? 'your fighter'} down.`);
      const by = W().char(c.lastHitBy);
      if (by && by.faction === 'player' && by.id !== p.id && c.lastHitT >= e.armedT) return lost(`${by.name} joined in. The Horn calls it forfeit.`);
      if (Math.hypot(p.x - rg.x, p.z - rg.z) > rg.r + 60) return lost(`${p.name} left the ring.`);
      if (!p.order && !p.brain.enemy) p.order = { k: 'attack', id: c.id }; // (back at it)
      return null;
    }
    case 'camp': {
      if (site && campLeft(site.id) === 0) { e.state = 'ready'; return 'ready'; }
      return null;
    }
    case 'reach': {
      if (!site) return fail('That place is gone.');
      const [, d] = nearestMine(site.x, site.z);
      if (d < site.r + 70) { e.state = 'ready'; return 'ready'; }
      return null;
    }
    case 'defend': {
      if (!site) return fail('That place is gone.');
      const sq = e.squad ? W().squads.get(e.squad) : undefined;
      if (e.squad && sq) {
        const up = sq.members.some((id) => W().char(id)?.up);
        if (!up) { e.state = 'ready'; return 'ready'; }
        // they sacked the town, or went home unbeaten: they will be back
        const sacked = (W().flags.sacked?.[site.id] ?? -1) >= (e.armed ?? 0);
        if (sacked || !sq.flags.townRaid) {
          e.squad = 0; e.again = S.clock.t + DAY / 2;
          W().say(sacked ? `${site.name} was sacked. The raiders will be back for the rest.` : `The raiders pulled back from ${site.name}. They will be back.`, 'bad', S.clock.t);
        }
        return null;
      }
      if (e.squad) { e.squad = 0; e.again = S.clock.t + DAY / 2; }
      // the attack comes once you are there to meet it
      if (S.clock.t < (e.again ?? 0)) return null;
      const [, d] = nearestMine(site.x, site.z);
      if (d > site.r + 200 || !W().populated.has(site.id)) return null;
      const party = sendAttack(e, site);
      if (!party) return null;
      e.squad = party.id; e.armed = S.clock.t;
      W().say(`A ${party.name} is coming for ${site.name}.`, 'bad', S.clock.t);
      S.fx.notice(`${party.members.length} raiders are coming for ${site.name}!`, 'bad');
      S.fx.sound('alarm', site.x, site.z, 1);
      return null;
    }
  }
  return null;
}

/** An errand given up or failed: whoever it brought in goes back to the world, and nothing it handed you stays to confuse the next one. */
export function releaseErrand(e: Errand) {
  const sq = e.squad ? W().squads.get(e.squad) : undefined;
  if (sq && (e.kind === 'hunt' || e.kind === 'escort')) {
    sq.flags.spec = 'released';
    sq.flags.errand = undefined;
    sq.ttl = S.clock.t + DAY;
    const to = siteById(e.site);
    if (e.kind === 'escort' && to) { sq.route = e.route ?? [to.x, to.z]; sq.ri = e.paused ? e.ri ?? 0 : sq.ri; sq.task = { k: 'travel', to: to.id, x: to.x, z: to.z, then: 'despawn' }; }
    else sq.task = { k: 'wander', cx: sq.x || (e.x ?? 0), cz: sq.z || (e.z ?? 0), r: 400 };
    for (const id of sq.members) { const c = W().char(id); if (c) delete c.mem.errand; }
  }
  for (const id of e.party ?? []) { const c = W().char(id); if (c) delete c.mem.errand; } // (those carried off from it too)
  // the freed who have come where they mean to live, stay there
  if (sq && e.kind === 'escort' && e.settle && e.state === 'ready') {
    const to = siteById(e.site);
    if (to) for (const id of [...sq.members]) { const c = W().char(id); if (c?.alive) settleAt(c, to); }
    W().squads.delete(sq.id);
  }
  if (e.kind === 'duel') endDuel(e);
  if (e.kind === 'deliver') {
    if (e.uid !== undefined) dropItem(e.uid);
    const who = e.whoId ? W().char(e.whoId) : undefined;
    if (who && who.faction !== 'player') { delete who.mem.errand; who.mem.leaveAt = S.clock.t + DAY; }
  }
}

/** Those a parcel was for go about their lives elsewhere a day after, once nobody of yours is near to see them go. */
export function sweepErrandFolk() {
  for (const c of W().chars.values()) if (c.mem.leaveAt && S.clock.t > c.mem.leaveAt && !c.active && c.faction !== 'player') W().removeChar(c);
}

/** Where an errand points on the map: the quarry, the travellers, the place. */
export function errandWhere(e: Errand): { x: number; z: number } | null {
  if (e.kind === 'hunt') {
    const c = e.whoId ? W().char(e.whoId) : undefined;
    if (c && c.alive) return { x: c.x, z: c.z };
    return e.x !== undefined && e.z !== undefined ? { x: e.x, z: e.z } : null;
  }
  if (e.kind === 'escort' && e.state !== 'ready') {
    const c = e.whoId ? W().char(e.whoId) : undefined;
    if (c && c.alive) return { x: c.x, z: c.z };
  }
  if (e.kind === 'deliver') {
    const c = e.whoId ? W().char(e.whoId) : undefined;
    if (c && c.alive) return { x: c.x, z: c.z };
  }
  const s = siteById(e.site);
  if (s && e.kind === 'duel') { const rg = duelRing(s); return { x: rg.x, z: rg.z }; }
  return s ? { x: s.x, z: s.z } : null;
}

/** How an errand stands, in a few words for the journal. */
export function errandProgress(e: Errand): string {
  const site = siteById(e.site);
  switch (e.kind) {
    case 'haul': { const have = carried(e.good!); return `Your people carry ${Math.min(have, e.n!)} of ${e.n}.`; }
    case 'deliver': { const what = (ITEM[e.item ?? '']?.name ?? 'parcel').toLowerCase(); return e.lostT !== undefined ? `The ${what} is missing. Find it within the hour.` : `The ${what} is in your packs.`; }
    case 'escort': {
      if (e.state === 'ready') return 'They are through the gate.';
      if (e.lostT !== undefined) return 'Carried off. Get them back within the hour.';
      const sq = e.squad ? W().squads.get(e.squad) : undefined;
      const lead = sq ? W().char(sq.leader) : undefined;
      if (!lead || !site) return '';
      const left = Math.round(dist(lead, site) / 100) / 10;
      return e.paused ? `Waiting for you, ${left} km from ${site.name}.` : `On the road with you, ${left} km to go.`;
    }
    case 'hunt': return e.state === 'ready' ? 'Down.' : '';
    case 'camp': { if (!site) return ''; const left = campLeft(site.id); return left < 0 ? 'Nobody of yours has scouted it.' : left === 0 ? 'Nobody left standing.' : `${left} still standing.`; }
    case 'defend': return e.squad ? 'The raiders are coming.' : 'They will come when you are there to meet them.';
    case 'free': return `${e.freed?.length ?? 0} of ${e.n ?? 1} set free.`;
    case 'duel': return e.armedT ? 'In the ring: one on one.' : `${e.who} will step into the ring when one of yours does.`;
  }
  return '';
}

/**
 * How dangerous what an errand sends you against is, if it is a fight with
 * one in it: a quarry, a camp, or the one to beat in a duel (rated against
 * your best fighter alone, since nobody else may help).
 */
export function errandDanger(e: Errand): (Rating & { what: string }) | null {
  const site = siteById(e.site);
  if (e.kind === 'camp' && site) { const ct = campThreat(site); return { ...rate(ct.threat), what: ct.scouted ? `${ct.count} ${ct.folk} still standing` : `${ct.folk}, about ${ct.count} of them` }; }
  if (e.kind === 'hunt') {
    const sq = e.squad ? W().squads.get(e.squad) : undefined;
    let t = 0;
    if (sq) for (const id of sq.members) { const m = W().char(id); if (free(m)) t += threat(m) * (m.animal && m.id === e.whoId && !e.plain ? BOSS_HP * BOSS_SKILL * (e.great ?? 1) : 1); }
    else if (e.species) t = beastThreat(e.species, true) * (e.great ?? 1) + (e.size ?? 0) * beastThreat(e.species);
    else if (e.faction) t = bandThreat(e.faction, e.size ?? 2, e.level);
    return { ...rate(t), what: e.species ? (e.size ? `${e.who} and ${e.size} of its kind` : `${e.who}, alone`) : `${e.who} and ${e.size ?? 2} ${BAND_NAME[e.faction ?? ''] ?? 'others'}` };
  }
  if (e.kind === 'duel') {
    const c = e.whoId ? W().char(e.whoId) : undefined;
    const t = c && c.alive ? threat(c) : typicalPower(site?.faction ?? 'karuk', 'merc', e.level);
    let best = 0;
    for (const m of upMine()) if (!m.animal) best = Math.max(best, m.power());
    return { ...rate(t, { n: 1, power: best, level: 0 }), what: `${e.who}, against your best alone` };
  }
  return null;
}

/** Which way, and how far, a point is from your people: "2.1 km south-east". */
export function bearing(x: number, z: number, from?: { x: number; z: number }): string {
  const o = from ?? upMine()[0] ?? W().playerChars()[0];
  if (!o) return '';
  const d = Math.hypot(x - o.x, z - o.z);
  if (d < 150) return 'close by';
  const a = Math.atan2(x - o.x, -(z - o.z)); // north is -z on the map
  const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const k = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  return `${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 10) * 10 + ' m'} ${dirs[k]}`;
}
