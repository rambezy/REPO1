// Crises. Late in a game with a base to its name, or a while after a story
// ends, a power of the waste turns on the world: the Foundry wakes and counts,
// or the Reavers muster. A day's warning; then waves sized to your band, each
// a little stronger than the last, on your base or the towns, until you go to
// where their leader waits and bring them down. Five waves spend it; it rests
// a while, and then it comes again. What each one is (content/contracts:
// CRISES) is data; this is the one engine, and only one crisis is ever awake
// and marching at a time. Nothing is ever sent that your band could not stand
// up to with walls at its back.
import { S } from './ctx';
import type { Char, Role } from './char';
import { Squad } from './squad';
import { RNG, hash3, hashStr } from '../core/rng';
import { makePerson, makeAnimal } from './spawn';
import { playerBase } from './base';
import { spawnRaid } from './raids';
import { playerBand, trimTo, SPECS, threat } from './worldsim';
import { defence } from './worldevents';
import { DAY, HOUR } from './clock';
import { CRISES, CRISIS_DEF, STORY, type CrisisDef } from '../content/contracts';
import { FACTION } from '../content/factions';
import { ANIMAL } from '../content/animals';
import { ITEM } from '../content/items';
import { siteById, siteByKey, give, upMine, sendWarParty, rate, campThreat, campEstimate, beastThreat, typicalPower, free, type Rating } from './errands';
import type { Site } from '../world/terrain';
import type { TownInfo } from '../world/towns';

export interface CrisisState {
  state: 'none' | 'warning' | 'waves' | 'quiet' | 'resolved';
  /** a waking already coming (a while after a story's end), and when */
  pending?: number;
  /** where its leader waits */
  site?: number;
  /** when the present state began */
  since?: number;
  /** when the next wave sets out */
  next?: number;
  /** waves sent since it last woke */
  wave: number;
  /** the one to bring down */
  leader?: number;
  /** the waves out there now */
  squads: number[];
  /** what the latest wave marches on: a town's id, or 0 for your base */
  target?: number;
  woke: number;
  /** the towns its waves have marched on, and how many fell */
  towns?: { hit: number; sacked: number };
  /** a story's end has been counted toward its waking (see afterStory) */
  told?: boolean;
}

const W = () => S.W;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const STATES = new Set(['none', 'warning', 'waves', 'quiet', 'resolved']);
const NUMS = ['pending', 'site', 'since', 'next', 'leader', 'target'];
/** Puts a kept state to rights (a broken save may hold anything; an older one names things as the Foundry did): what is of the wrong shape is let go. */
function mendCrisis(cs: Record<string, any>) {
  // (the Foundry's, kept before there were others, called its site and leader its foundry and its mind)
  if (cs.foundry !== undefined) { cs.site ??= cs.foundry; delete cs.foundry; }
  if (cs.mind !== undefined) { cs.leader ??= cs.mind; delete cs.mind; }
  if (!STATES.has(cs.state)) cs.state = 'none';
  if (!Number.isInteger(cs.wave) || cs.wave < 0) cs.wave = 0;
  if (!Number.isInteger(cs.woke) || cs.woke < 0) cs.woke = 0;
  cs.squads = Array.isArray(cs.squads) ? cs.squads.filter((id: unknown) => typeof id === 'number') : [];
  for (const k of NUMS) if (cs[k] !== undefined && !(typeof cs[k] === 'number' && Number.isFinite(cs[k]))) delete cs[k];
  if (cs.towns !== undefined && !(isObj(cs.towns) && Number.isFinite(cs.towns.hit) && Number.isFinite(cs.towns.sacked))) delete cs.towns;
}
/** Every crisis's state, kept in the flags. An older save kept the one there was (the Foundry's) as flags.crisis: it is moved in. */
function allStates(): Record<string, CrisisState> {
  const f = W().flags;
  if (!isObj(f.crises)) f.crises = {};
  const all = f.crises as Record<string, any>;
  if (f.crisis !== undefined) {
    if (!isObj(all.foundry) && isObj(f.crisis)) all.foundry = f.crisis;
    delete f.crisis;
  }
  return all;
}
/** A crisis's kept state (the Foundry's, if none is named), made the first time it is wanted. */
export function crisisState(key = 'foundry'): CrisisState {
  const all = allStates();
  if (!isObj(all[key])) all[key] = { state: 'none', wave: 0, squads: [], woke: 0 };
  const cs = all[key] as Record<string, any>;
  // (cheap enough to look at every time)
  if (!STATES.has(cs.state) || !Number.isInteger(cs.wave) || !Number.isInteger(cs.woke) || !Array.isArray(cs.squads) || 'foundry' in cs || 'mind' in cs || (cs.site !== undefined && typeof cs.site !== 'number') || (cs.leader !== undefined && typeof cs.leader !== 'number')) mendCrisis(cs);
  return cs as CrisisState;
}
const awake = (s: CrisisState['state']) => s === 'warning' || s === 'waves' || s === 'quiet';
/** The crisis awake and marching now (warning or waves), if one is. */
export function activeCrisis(): CrisisDef | undefined {
  return CRISES.find((d) => { const s = crisisState(d.key).state; return s === 'warning' || s === 'waves'; });
}
/** Is any crisis awake (counting, marching, or resting between musters)? */
export const crisisOn = () => CRISES.some((d) => awake(crisisState(d.key).state));

/** A story's end brings a crisis on this soon after, unless it already came. */
export function scheduleCrisis(key: string, at: number) {
  const cs = crisisState(key);
  cs.told = true;
  if (cs.state === 'none') cs.pending = Math.min(cs.pending ?? Infinity, at);
}

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

/** Where a crisis's leader waits: its settlement, or the site of its kind nearest your base (or your people), not one a story had you clear. */
function chooseLair(d: CrisisDef): Site | undefined {
  if (d.lair.key) return siteByKey(d.lair.key);
  const kind = d.lair.kind!;
  const base = playerBase();
  const lead = upMine()[0] ?? W().playerChars()[0];
  const at = base ?? (lead ? { x: lead.x, z: lead.z } : { x: 0, z: 0 });
  let silenced: number | undefined;
  const story = d.lair.notStory ? STORY[d.lair.notStory] : undefined;
  if (story && W().flags.story?.[story.key]?.state === 'done') {
    // (the site the story's camp step sent you to: for the Hollows, the Rust Mill, the foundry nearest Rustward)
    const town = siteByKey(story.town);
    if (town) silenced = S.T.nearestSite(town.x, town.z, (s) => s.kind === kind)?.id;
  }
  return S.T.nearestSite(at.x, at.z, (s) => s.kind === kind && s.id !== silenced) ?? S.T.nearestSite(at.x, at.z, (s) => s.kind === kind) ?? undefined;
}

/** The leader and their keepers, at the lair. */
function placeLeader(d: CrisisDef, cs: CrisisState, site: Site) {
  const rng = new RNG(hash3(site.seed, hashStr(d.key) + 4049, cs.woke));
  const sq = new Squad();
  sq.faction = d.leader.person?.faction ?? 'machines'; sq.kind = 'camp'; sq.name = d.leader.name; sq.site = site.id;
  W().addSquad(sq);
  // (in a town, out in its square; elsewhere, in the middle of the place)
  const info = site.kind === 'town' ? (W().towns.get(site.id) as TownInfo | undefined) : undefined;
  const plaza = info?.posts.find((p) => p.kind === 'plaza');
  const cx = plaza?.x ?? site.x, cz = plaza?.z ?? site.z;
  const put = (c: Char, dx: number, dz: number) => {
    const p = S.nav.nearestOpen(cx + dx, cz + dz, 14) ?? [cx, cz];
    c.x = p[0]; c.z = p[1]; c.y = S.T.heightAt(c.x, c.z); c.homeX = c.x; c.homeZ = c.z; c.site = site.id;
  };
  const L = d.leader;
  const lead = L.animal ? makeAnimal(W(), L.animal, rng, L.scale ?? 1)
    : makePerson(W(), { faction: L.person!.faction, role: L.person!.role as Role, loadout: L.person!.loadout, level: L.person!.level, race: L.person!.race, female: L.person!.female, name: L.name, whole: true }, rng);
  if (L.animal) lead.faction = sq.faction;
  W().moveToSquad(lead, sq);
  lead.name = L.name; lead.title = L.title;
  for (let l = 0; l < 7; l++) { lead.body.max[l] = Math.round(lead.body.max[l] * L.hp); lead.body.hp[l] = lead.body.max[l]; }
  lead.body.bloodMax = Math.round(lead.body.bloodMax * L.hp); lead.body.blood = lead.body.bloodMax;
  for (let k = 0; k < lead.sk.length; k++) lead.sk[k] = Math.min(100, lead.sk[k] * L.skill);
  for (const [id, n] of L.items ?? []) lead.inv.add(id, n);
  lead.mem.crisis = d.key;
  put(lead, 0, 0);
  const G = d.guards;
  for (let i = 0; i < G.n; i++) {
    const g = makePerson(W(), { faction: G.faction, role: G.role as Role, loadout: G.loadout, level: G.level, whole: true }, rng);
    W().moveToSquad(g, sq);
    g.title = G.title;
    const a = (i / G.n) * Math.PI * 2;
    put(g, Math.sin(a) * 5, Math.cos(a) * 5 + 2);
  }
  cs.leader = lead.id;
}

/** Is the leader brought down: down, carried off, caged, or stripped for parts? */
function leaderDown(cs: CrisisState): boolean {
  if (!cs.leader) return false;
  return !free(W().char(cs.leader));
}

/** A crisis wakes. Another already marching, it waits its turn (unless forced, for testing); false if it cannot. */
export function wakeCrisis(key = 'foundry', force = false): boolean {
  const d = CRISIS_DEF[key];
  if (!d) return false;
  const cs = crisisState(key);
  if (cs.state === 'resolved') return false;
  const other = activeCrisis();
  if (other && other.key !== key && !force) return false;
  const site = (cs.site ? siteById(cs.site) : undefined) ?? chooseLair(d);
  if (!site) return false;
  cs.site = site.id;
  delete cs.pending;
  if (!cs.leader || !W().char(cs.leader)) placeLeader(d, cs, site);
  const first = cs.woke === 0;
  cs.woke++;
  cs.state = 'warning';
  cs.since = S.clock.t;
  if (first) cs.wave = 0;
  const base = playerBase();
  const words = { lair: site.name, where: d.text.where[base ? 1 : 0] };
  const text = first ? fill(d.text.wake, words) : fill(d.text.rewake, words);
  W().say(`${d.name}: ${text} ${fill(d.text.guide, words)}`, 'story', S.clock.t);
  S.fx.notice(`${d.name}: ${text}`, 'bad');
  const lead = upMine()[0];
  if (lead) S.fx.sound('alarm', lead.x, lead.z, 0.8);
  W().seenSites.add(site.id);
  return true;
}

const lately = (s: Site) => S.clock.t - (W().flags.sacked?.[s.id] ?? -1e12) <= DAY * 2;
/** The town a wave marches on: of the peoples it hates, the nearest to its lair in turn; or, with no base, the nearest lawful town. */
function townTarget(d: CrisisDef, cs: CrisisState, lair: Site): Site | undefined {
  const fs = d.targets.towns.factions;
  const ok = (s: Site) => s.kind === 'town' && !!s.faction && (fs ? fs.includes(s.faction) : !!FACTION[s.faction]?.lawful) && !lately(s);
  if (!fs) return S.T.nearestSite(lair.x, lair.z, ok) ?? undefined;
  const near = S.T.sites.filter(ok).sort((a, b) => Math.hypot(a.x - lair.x, a.z - lair.z) - Math.hypot(b.x - lair.x, b.z - lair.z)).slice(0, 3);
  return near.length ? near[cs.wave % near.length] : undefined;
}

/**
 * What a wave is made of, to come to its budget: one of its people to lead
 * it; the beasts that come one at a time, from their wave, if they fit; then
 * people and beasts by turns, each up to its number. (They are made as they
 * come, so the budget is checked again once they exist.)
 */
function waveOf(d: CrisisDef, wave: number, budget: number): { people: number; beasts: [string, number][] } {
  const spec = SPECS.find((s) => s.key === d.wave.spec)!;
  const person = typicalPower(spec.faction, spec.role);
  const cap = (c: [number, number]) => c[0] + c[1] * wave;
  let left = budget - person, people = 1;
  const kinds = (d.wave.beasts ?? []).filter((b) => wave >= b.from).map((b) => ({ ...b, t: beastThreat(b.species), n: 0 }));
  for (const b of kinds) if (b.one && left >= b.t) { b.n = 1; left -= b.t; }
  const more = kinds.filter((b) => !b.one);
  for (let turn = 0; left > 0 && turn < 30; turn++) {
    if ((turn % 3 === 0 || !more.length) && left >= person && people < cap(d.wave.people)) { people++; left -= person; continue; }
    const b = more.find((x) => x.n < cap(x.cap) && left >= x.t);
    if (b) { b.n++; left -= b.t; continue; }
    if (left >= person && people < cap(d.wave.people)) { people++; left -= person; continue; }
    break;
  }
  return { people, beasts: kinds.filter((b) => b.n > 0).map((b) => [b.species, b.n]) };
}

/** Adds a wave's beasts to it, mixed in with its people: whoever the budget cuts comes off the end. */
function addBeasts(sq: Squad, beasts: [string, number][], rng: RNG) {
  const at = W().char(sq.leader);
  for (const [species, n] of beasts) for (let i = 0; i < n; i++) {
    const c = makeAnimal(W(), species, rng);
    c.faction = sq.faction;
    W().moveToSquad(c, sq);
    const p = S.nav.nearestOpen((at?.x ?? sq.x) + rng.range(-6, 6), (at?.z ?? sq.z) + rng.range(-6, 6), 10) ?? [sq.x, sq.z];
    c.x = p[0]; c.z = p[1]; c.y = S.T.heightAt(c.x, c.z); c.homeX = c.x; c.homeZ = c.z;
  }
  const [lead, ...rest] = sq.members;
  const people = rest.filter((id) => !W().char(id)?.animal), animals = rest.filter((id) => W().char(id)?.animal);
  const mixed: number[] = [lead];
  while (people.length || animals.length) { if (animals.length) mixed.push(animals.shift()!); if (people.length) mixed.push(people.shift()!); }
  sq.members = mixed;
}

/** One squad of a wave, on your base (no town) or a town, sized to its budget. */
function march(d: CrisisDef, cs: CrisisState, i: number, budget: number, town: Site | null, rng: RNG): Squad | null {
  const spec = SPECS.find((s) => s.key === d.wave.spec);
  if (!spec) return null;
  const { people, beasts } = waveOf(d, i, budget);
  let sq: Squad | null = null;
  if (!town) {
    const base = playerBase();
    if (!base) return null;
    sq = spawnRaid(base.x, base.z, 0, { faction: spec.faction, role: d.wave.role as 'bandit' | 'patrol', demand: 'fight', n: [people, people], name: d.wave.name });
  } else {
    // (on the wave's own dice, like the rest of it: the same waking of the same lair sends the same war party)
    sq = sendWarParty(spec, people, town, budget, undefined, undefined, rng);
    if (sq) { sq.flags.crisisTown = town.id; sq.flags.sentAt = S.clock.t; }
  }
  if (!sq) return null;
  sq.name = town ? d.wave.townName ?? d.wave.name : d.wave.name;
  addBeasts(sq, beasts, rng);
  trimTo(sq, { n: 99, budget, slack: 1.3 });
  sq.flags.crisis = d.key;
  cs.squads.push(sq.id);
  return sq;
}

/** Sends a crisis's next wave: on your base, and on the towns as it says. The first squad of it, or null if none could be sent. */
export function sendWave(key = 'foundry'): Squad | null {
  const d = CRISIS_DEF[key];
  const cs = crisisState(key);
  const site = d ? siteById(cs.site) : undefined;
  if (!d || !site) return null;
  const i = cs.wave;
  const band = playerBand();
  const share = Math.max(60, band.power * d.waves[Math.min(i, d.waves.length - 1)]);
  const rng = new RNG(hash3(site.seed, 77 + i, cs.woke));
  const base = playerBase();
  const sent: [Squad, string][] = [];
  // the base: every wave, or every other one (the second, the fourth)
  if (base && (d.targets.base === 'always' || i % 2 === 1)) {
    const sq = march(d, cs, i, share, null, rng);
    if (sq) { sent.push([sq, 'your base']); cs.target = 0; }
  }
  // the towns: every wave where it hates them, or (with no base) the nearest lawful one
  if (!d.targets.towns.noBaseOnly || !base) {
    const town = townTarget(d, cs, site);
    if (town) {
      // (on a town it brings a share of the town's own walls besides, more each wave, but never so much more than
      // the town that it cannot hold alone now and then: whether it holds is yours to decide)
      const walls = defence(town);
      let budget = share + (d.townShare ? walls * (d.townShare + 0.1 * i) : 0);
      if (d.townCap) budget = Math.min(budget, Math.max(60, walls * d.townCap));
      const sq = march(d, cs, i, budget, town, rng);
      if (sq) {
        sent.push([sq, town.name]);
        cs.target = town.id;
        cs.towns = { hit: (cs.towns?.hit ?? 0) + 1, sacked: cs.towns?.sacked ?? 0 };
      }
    }
  }
  if (!sent.length) return null;
  cs.wave++;
  for (const [sq, target] of sent) {
    const folk = sq.members.map((id) => W().char(id)).filter((c): c is Char => !!c);
    const people = folk.filter((c) => !c.animal).length;
    const beasts = new Map<string, number>();
    for (const c of folk) if (c.animal) beasts.set(c.animal, (beasts.get(c.animal) ?? 0) + 1);
    const plural = (n: number, one: string, many: string) => (n ? `${n} ${n > 1 ? many : one}` : '');
    const what = [plural(people, d.wave.folk[0], d.wave.folk[1]), ...[...beasts].map(([sp, n]) => plural(n, ANIMAL[sp]?.name.toLowerCase() ?? sp, ANIMAL[sp]?.plural.toLowerCase() ?? sp))].filter(Boolean).join(', ');
    const line = `${fill(d.text.wave, { nth: ORDINAL[Math.min(i, ORDINAL.length - 1)], lair: site.name, target })} ${what[0].toUpperCase() + what.slice(1)}.`;
    W().say(line, 'bad', S.clock.t);
    S.fx.notice(line, 'bad');
    if (target !== 'your base' && d.text.town) S.fx.notice(fill(d.text.town, { target }), 'info');
  }
  return sent[0][0];
}

/** Waves that are over turn back to their lair, and are gone when nobody is watching; a town they marched on is counted held or sacked. */
function homeward(cs: CrisisState, site: Site) {
  for (const id of cs.squads) {
    const sq = W().squads.get(id);
    if (!sq || !sq.flags.crisisTown || sq.flags.counted) continue;
    const town = sq.flags.crisisTown as number;
    if (sq.flags.townRaid && sq.members.some((m) => W().char(m)?.up)) continue;
    sq.flags.counted = true;
    if ((W().flags.sacked?.[town] ?? -1) >= (sq.flags.sentAt ?? 0)) cs.towns = { hit: cs.towns?.hit ?? 1, sacked: (cs.towns?.sacked ?? 0) + 1 };
  }
  cs.squads = cs.squads.filter((id) => W().squads.has(id));
  for (const id of cs.squads) {
    const sq = W().squads.get(id)!;
    if (sq.flags.homeward || (sq.flags.baseRaid && !sq.flags.leaving) || sq.flags.townRaid) continue;
    sq.flags.homeward = true;
    sq.flags.baseRaid = false;
    sq.flags.spec = 'crisis';
    sq.route = [sq.x + (site.x - sq.x) * 0.5, sq.z + (site.z - sq.z) * 0.5, site.x, site.z];
    sq.ri = 0;
    sq.task = { k: 'travel', to: site.id, x: site.x, z: site.z, then: 'despawn' };
    sq.ttl = S.clock.t + DAY;
  }
}
/** Whether a wave is still out there with fight left in it. */
const waveOut = (cs: CrisisState) => cs.squads.some((id) => { const sq = W().squads.get(id); return !!sq && !sq.flags.homeward && sq.members.some((m) => W().char(m)?.up); });

/** The leader is brought down: the waves turn for home, and the waste pays its thanks. */
export function resolveCrisis(key = 'foundry', p?: Char) {
  const d = CRISIS_DEF[key];
  const cs = crisisState(key);
  if (!d || cs.state === 'resolved') return;
  const site = siteById(cs.site);
  cs.state = 'resolved';
  cs.since = S.clock.t;
  delete cs.pending;
  for (const id of cs.squads) { const sq = W().squads.get(id); if (sq) { sq.flags.baseRaid = false; sq.flags.townRaid = 0; } }
  if (site) homeward(cs, site);
  const lead = p ?? upMine()[0] ?? W().playerChars().find((c) => c.alive);
  const R = d.reward;
  W().money += R.money;
  if (lead) for (const [id, n] of R.items) give(lead, id, n);
  for (const [f, v] of R.standing) if (W().rel.get('player', f) > -50) W().rel.add('player', f, v);
  if (R.quiet) W().flags.quiet = { ...(W().flags.quiet ?? {}), [R.quiet[0]]: Math.max(W().flags.quiet?.[R.quiet[0]] ?? 0, S.clock.t + DAY * R.quiet[1]) };
  if (R.title && lead && !lead.animal) lead.title = R.title;
  if (key === 'foundry') W().flags.crisisResolved = S.clock.t;
  const items = R.items.map(([id, n]) => `${n > 1 ? `${n} ` : ''}${ITEM[id]?.name ?? id}`);
  W().say(`${d.name}: ${d.text.end} ${d.text.reward} (${R.money.toLocaleString()} chits${items.length ? `, ${items.join(', ')}` : ''}.)`, 'story', S.clock.t);
  S.fx.notice(`${d.name}: ${d.leader.name[0].toUpperCase() + d.leader.name.slice(1)} is down.`, 'good');
}

/** When a story's end brings a crisis on (an older save, whose story ended before its crisis was counted from it, included). */
function afterStory(d: CrisisDef, cs: CrisisState): number | undefined {
  if (!d.afterStory || cs.told) return undefined;
  const s = W().flags.story?.[d.afterStory.key];
  if (!isObj(s) || s.state !== 'done' || !Array.isArray(s.log) || !s.log.length) return undefined;
  const t = s.log[s.log.length - 1]?.t;
  return typeof t === 'number' ? t + d.afterStory.days * DAY : undefined;
}

let t = 0, lastHour = -1;
export function tickCrisis(dt: number) {
  t -= dt;
  if (t > 0) return;
  t = 2;
  // (wakings are looked at once a game hour: finding a base is not free)
  const hour = Math.floor(S.clock.t / HOUR);
  const hourly = hour !== lastHour;
  lastHour = hour;
  for (const d of CRISES) tickOne(d, hourly);
}

function tickOne(d: CrisisDef, hourly: boolean) {
  const cs = crisisState(d.key);
  if (cs.state === 'resolved') return;
  if (cs.state === 'none') {
    const due = cs.pending ?? afterStory(d, cs);
    // (only one marches at a time: another awake and marching, this one waits its turn)
    if (due !== undefined && S.clock.t >= due && (cs.pending !== undefined || hourly)) { if (!activeCrisis()) wakeCrisis(d.key); return; }
    if (hourly && S.clock.day >= d.wakeDay && !activeCrisis() && playerBase()) wakeCrisis(d.key);
    return;
  }
  const site = siteById(cs.site);
  if (!site) { cs.state = 'none'; return; }
  if (!cs.leader) placeLeader(d, cs, site);
  if (leaderDown(cs)) { resolveCrisis(d.key); return; }
  homeward(cs, site);
  if (cs.state === 'warning') {
    if (S.clock.t - (cs.since ?? 0) >= d.warnDays * DAY) { cs.state = 'waves'; cs.next = S.clock.t; }
    return;
  }
  if (cs.state === 'waves') {
    if (waveOut(cs) || S.clock.t < (cs.next ?? 0)) return;
    if (cs.wave >= d.waves.length) {
      cs.state = 'quiet'; cs.since = S.clock.t;
      const text = fill(d.text.quiet, { lair: site.name });
      W().say(`${d.name}: ${text}`, 'story', S.clock.t);
      S.fx.notice(text, 'info');
      return;
    }
    if (sendWave(d.key)) cs.next = S.clock.t + d.waveDays * DAY;
    else cs.next = S.clock.t + HOUR; // nowhere to send it from just now: try again within the hour
    return;
  }
  if (cs.state === 'quiet' && S.clock.t - (cs.since ?? 0) >= d.quietDays * DAY && !activeCrisis()) {
    cs.wave = Math.min(cs.wave, 2); // it comes back where it left off, near enough
    wakeCrisis(d.key);
  }
}

/** What a crisis asks of you now, for the tracker and the journal (the one marching first, else one resting), with a few words for the map. */
export function crisisGoal(): { text: string; where?: { x: number; z: number }; entry: string; label: string } | null {
  const d = activeCrisis() ?? CRISES.find((x) => crisisState(x.key).state === 'quiet');
  if (!d) return null;
  const cs = crisisState(d.key);
  const site = siteById(cs.site);
  if (!site) return null;
  const base = playerBase();
  const entry = 'crisis:' + d.key;
  const out = cs.squads.map((id) => W().squads.get(id)).filter((sq): sq is Squad => !!sq && !sq.flags.homeward && sq.members.some((m) => W().char(m)?.up));
  const atBase = out.find((sq) => sq.flags.baseRaid);
  const atTown = out.map((sq) => siteById(sq.flags.crisisTown as number)).find((s): s is Site => !!s);
  const leader = cs.leader ? W().char(cs.leader) : undefined;
  const who = leader?.name ?? d.leader.name;
  const at = { x: site.x, z: site.z }, lead = who[0].toUpperCase() + who.slice(1);
  // (a leader far beyond your band is not to be gone after yet: then it is the walls that matter)
  const beyond = lairDanger(d, cs).level >= BEYOND;
  const notYet = `${who} at ${site.name} is beyond your band for now`;
  if (atBase && base) return { text: `${d.name}: a wave is marching on your base. Hold it.`, where: { x: base.x, z: base.z }, entry, label: `${d.wave.name}: your base` };
  if (atTown) return { text: `${d.name}: a ${d.wave.townName ?? d.wave.name} is marching on ${atTown.name}. ${beyond ? `Help them hold; ${notYet}.` : `Help them hold, or bring down ${who} at ${site.name}.`}`, where: { x: atTown.x, z: atTown.z }, entry, label: `${d.wave.townName ?? d.wave.name}: ${atTown.name}` };
  if (cs.state === 'warning') return { text: `${d.name}: the first wave sets out within the day. ${beyond ? `Ready your walls, and the towns'; ${notYet}.` : `Ready your walls, or bring down ${who} at ${site.name}.`}`, where: at, entry, label: lead };
  if (cs.state === 'quiet') return { text: `${d.name}: ${site.name} is quiet. ${beyond ? `Make your band stronger before it wakes again: ${notYet}.` : `Bring down ${who} before it wakes again.`}`, where: at, entry, label: lead };
  return { text: `${d.name}: ${beyond ? `hold out against the waves; ${notYet}.` : `bring down ${who} at ${site.name}, or hold out against the waves.`}`, where: at, entry, label: lead };
}

/** The danger rating from which a crisis's leader is beyond your band for now ('Deadly'). */
const BEYOND = 4;
const lairMemo = new Map<string, { w: object; t: number; r: Rating }>();
/** How hard bringing a crisis's leader down would be for your band as it stands (the tracker asks often: worked out afresh once a game minute). */
function lairDanger(d: CrisisDef, cs: CrisisState): Rating {
  const m = lairMemo.get(d.key);
  if (m && m.w === W() && Math.abs(S.clock.t - m.t) < 60) return m.r;
  const site = siteById(cs.site);
  const leader = cs.leader ? W().char(cs.leader) : undefined;
  // they and their keepers, and whoever else holds the place
  let held = 0;
  if (leader && free(leader)) {
    const sq = W().squadOf(leader);
    for (const id of sq?.members ?? []) { const c = W().char(id); if (free(c)) held += threat(c) * (c === leader ? d.leader.hp * d.leader.skill : 1); }
  }
  const folk = !site ? 0 : site.kind === 'town' ? townFolk(site, leader?.squad) : W().populated.has(site.id) ? Math.max(0, campThreat(site).threat - held) : campEstimate(site).threat;
  const r = rate(held + folk);
  lairMemo.set(d.key, { w: W(), t: S.clock.t, r });
  return r;
}

/** How strong the people of a town are, all told (but a leader's own squad): those there if your people have been near, else what its plan gives it. */
function townFolk(site: Site, but = 0): number {
  if (!W().populated.has(site.id)) return defence(site);
  let t = 0;
  for (const c of W().chars.values()) if (c.site === site.id && c.faction === site.faction && c.squad !== but && free(c) && !c.animal) t += threat(c);
  return t;
}

/** The journal's account of a crisis. */
export function crisisView(key = 'foundry') {
  const d = CRISIS_DEF[key];
  const cs = crisisState(key);
  const site = siteById(cs.site);
  const leader = cs.leader ? W().char(cs.leader) : undefined;
  return {
    def: d, key, state: cs.state, site, leader, wave: cs.wave, waves: d.waves.length, towns: cs.towns,
    next: cs.state === 'waves' ? cs.next : cs.state === 'warning' ? (cs.since ?? 0) + d.warnDays * DAY : cs.state === 'quiet' ? (cs.since ?? 0) + d.quietDays * DAY : undefined,
    danger: lairDanger(d, cs),
    guide: site ? fill(d.text.guide, { lair: site.name }) : '',
  };
}
/** Every crisis that has woken, marching first, for the journal. */
export const crisisViews = () => CRISES.filter((d) => crisisState(d.key).state !== 'none').map((d) => crisisView(d.key)).sort((a, b) => Number(b.state === 'warning' || b.state === 'waves') - Number(a.state === 'warning' || a.state === 'waves'));
