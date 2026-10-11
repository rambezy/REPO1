// The Foundry wakes. Late in a game with a base to its name (day 20 on), or
// a day after the Rust Mill falls silent, a foundry of the old machines
// starts to count. A day's warning; then waves of Sentinels, saw drones and
// warbots march on your base (or, with no base, on the nearest town), each
// sized to your band and a little stronger than the last, until you march on
// the foundry and break the Foundry Mind. Five waves spend it; it goes quiet
// for a while, and then it counts again. Nothing is ever sent that your
// band could not stand up to with walls at its back.
import { S } from './ctx';
import type { Char } from './char';
import { Squad } from './squad';
import { RNG, hash3 } from '../core/rng';
import { makePerson, makeAnimal } from './spawn';
import { playerBase } from './base';
import { spawnRaid } from './raids';
import { playerBand, trimTo, SPECS } from './worldsim';
import { DAY, HOUR } from './clock';
import { CRISIS } from '../content/contracts';
import { FACTION } from '../content/factions';
import { siteById, give, upMine, sendWarParty, rate, campThreat, beastThreat, typicalPower } from './errands';
import type { Site } from '../world/terrain';

export interface CrisisState {
  state: 'none' | 'warning' | 'waves' | 'quiet' | 'resolved';
  /** a waking already coming (after the Hollows' story), and when */
  pending?: number;
  foundry?: number;
  /** when the present state began */
  since?: number;
  /** when the next wave sets out */
  next?: number;
  /** waves sent since it last woke */
  wave: number;
  /** the Foundry Mind */
  mind?: number;
  /** the waves out there now */
  squads: number[];
  /** what the latest wave marches on: a town's id, or 0 for your base */
  target?: number;
  woke: number;
}

const W = () => S.W;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const STATES = new Set(['none', 'warning', 'waves', 'quiet', 'resolved']);
/** Puts the kept state to rights (a broken save may hold anything): what is of the wrong shape is let go. */
function mendCrisis(cs: Record<string, any>) {
  if (!STATES.has(cs.state)) cs.state = 'none';
  if (!Number.isInteger(cs.wave) || cs.wave < 0) cs.wave = 0;
  if (!Number.isInteger(cs.woke) || cs.woke < 0) cs.woke = 0;
  cs.squads = Array.isArray(cs.squads) ? cs.squads.filter((id: unknown) => typeof id === 'number') : [];
  for (const k of ['pending', 'foundry', 'since', 'next', 'mind', 'target']) if (cs[k] !== undefined && !(typeof cs[k] === 'number' && Number.isFinite(cs[k]))) delete cs[k];
}
export function crisisState(): CrisisState {
  const f = W().flags;
  if (!isObj(f.crisis)) f.crisis = { state: 'none', wave: 0, squads: [], woke: 0 };
  const cs = f.crisis;
  // (cheap enough to look at every time)
  if (!STATES.has(cs.state) || !Number.isInteger(cs.wave) || !Number.isInteger(cs.woke) || !Array.isArray(cs.squads) || (cs.foundry !== undefined && typeof cs.foundry !== 'number') || (cs.mind !== undefined && typeof cs.mind !== 'number')) mendCrisis(cs);
  return cs as CrisisState;
}
/** Is the Foundry awake (warning, waves or resting between them)? */
export const crisisOn = () => { const c = crisisState().state; return c === 'warning' || c === 'waves' || c === 'quiet'; };

/** The Hollows' story ends with a warning: the waking comes this soon after, unless it already has. */
export function scheduleCrisis(at: number) {
  const cs = crisisState();
  if (cs.state === 'none') cs.pending = Math.min(cs.pending ?? Infinity, at);
}

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? '');

/** Which foundry wakes: the one nearest your base (or your people), but not the one the Hollows had you silence. */
function chooseFoundry(): Site | undefined {
  const base = playerBase();
  const lead = upMine()[0] ?? W().playerChars()[0];
  const at = base ?? (lead ? { x: lead.x, z: lead.z } : { x: 0, z: 0 });
  const rw = S.T.sites.find((s) => s.key === 'rustward');
  const silenced = rw && W().flags.story?.foundry?.state === 'done' ? S.T.nearestSite(rw.x, rw.z, (s) => s.kind === 'foundry')?.id : undefined;
  return S.T.nearestSite(at.x, at.z, (s) => s.kind === 'foundry' && s.id !== silenced) ?? S.T.nearestSite(at.x, at.z, (s) => s.kind === 'foundry') ?? undefined;
}

/** How much harder than a warbot the Foundry Mind is. */
const MIND_HP = 1.8, MIND_SKILL = 1.3;

/** The Foundry Mind and its two keepers, in the hall of the foundry. */
function placeMind(cs: CrisisState, site: Site) {
  const rng = new RNG(hash3(site.seed, 4049, cs.woke));
  const sq = new Squad();
  sq.faction = 'machines'; sq.kind = 'camp'; sq.name = 'the Foundry Mind'; sq.site = site.id;
  W().addSquad(sq);
  const put = (c: Char, dx: number, dz: number) => {
    const p = S.nav.nearestOpen(site.x + dx, site.z + dz, 14) ?? [site.x, site.z];
    c.x = p[0]; c.z = p[1]; c.y = S.T.heightAt(c.x, c.z); c.homeX = c.x; c.homeZ = c.z; c.site = site.id;
  };
  const mind = makeAnimal(W(), 'warbot', rng, 1.2);
  W().moveToSquad(mind, sq);
  mind.name = CRISIS.mind.name; mind.title = CRISIS.mind.title;
  for (let l = 0; l < 7; l++) { mind.body.max[l] = Math.round(mind.body.max[l] * MIND_HP); mind.body.hp[l] = mind.body.max[l]; }
  mind.body.bloodMax = Math.round(mind.body.bloodMax * MIND_HP); mind.body.blood = mind.body.bloodMax;
  for (let k = 0; k < mind.sk.length; k++) mind.sk[k] = Math.min(100, mind.sk[k] * MIND_SKILL);
  mind.inv.add('power_core', 1);
  mind.inv.add('maker_optic', 2);
  put(mind, 0, 0);
  for (let i = 0; i < 2; i++) {
    const g = makePerson(W(), { faction: 'machines', role: 'construct', loadout: 'machines_boss', whole: true }, rng);
    W().moveToSquad(g, sq);
    g.title = 'Keeper of the Count';
    put(g, i ? 5 : -5, 3);
  }
  cs.mind = mind.id;
}

/** Is the Foundry Mind broken: down, carried off, or stripped for parts? */
function mindDown(cs: CrisisState): boolean {
  if (!cs.mind) return false;
  const m = W().char(cs.mind);
  return !m || m.status !== 'up' || !!m.carriedBy;
}

/** The foundry starts to count. */
export function wakeCrisis(): boolean {
  const cs = crisisState();
  if (cs.state === 'resolved') return false;
  const site = (cs.foundry ? siteById(cs.foundry) : undefined) ?? chooseFoundry();
  if (!site) return false;
  cs.foundry = site.id;
  delete cs.pending;
  if (!cs.mind || !W().char(cs.mind)) placeMind(cs, site);
  const first = cs.woke === 0;
  cs.woke++;
  cs.state = 'warning';
  cs.since = S.clock.t;
  if (first) cs.wave = 0;
  const base = playerBase();
  const words = { foundry: site.name, where: base ? 'for your base' : 'for the towns of the Rust' };
  const text = first ? fill(CRISIS.wake, words) : fill(CRISIS.rewake, words);
  W().say(`${CRISIS.name}: ${text} ${fill(CRISIS.guide, words)}`, 'story', S.clock.t);
  S.fx.notice(`${CRISIS.name}: ${text}`, 'bad');
  const lead = upMine()[0];
  if (lead) S.fx.sound('alarm', lead.x, lead.z, 0.8);
  W().seenSites.add(site.id);
  return true;
}

/** The town a wave marches on when you have no base: the nearest lawful one to the foundry not sacked lately. */
function townTarget(site: Site): Site | undefined {
  return S.T.nearestSite(site.x, site.z, (s) => s.kind === 'town' && !!s.faction && !!FACTION[s.faction]?.lawful && S.clock.t - (W().flags.sacked?.[s.id] ?? -1e12) > DAY * 2) ?? undefined;
}

/**
 * What a wave is made of, to come to its budget: a Sentinel to lead it,
 * from the third wave a warbot if one fits, then Sentinels and saw drones by
 * turns. (Its people are made as they come, so the budget is checked again
 * once they exist.)
 */
function waveOf(wave: number, budget: number): { sentinels: number; drones: number; bots: number } {
  const sentinel = typicalPower('machines', 'construct'), drone = beastThreat('sawdrone'), bot = beastThreat('warbot');
  let left = budget - sentinel, sentinels = 1, drones = 0, bots = 0;
  if (wave >= 2 && left >= bot) { bots = 1; left -= bot; }
  for (let turn = 0; left > 0 && turn < 20; turn++) {
    if (turn % 3 === 0 && left >= sentinel && sentinels < 2 + wave) { sentinels++; left -= sentinel; }
    else if (left >= drone && drones < 2 + wave * 2) { drones++; left -= drone; }
    else if (left < drone) break;
  }
  return { sentinels, drones, bots };
}

/** Adds the foundry's beasts to a wave: saw drones and warbots. */
function addBeasts(sq: Squad, drones: number, bots: number, rng: RNG) {
  const at = W().char(sq.leader);
  for (let i = 0; i < drones + bots; i++) {
    const c = makeAnimal(W(), i < bots ? 'warbot' : 'sawdrone', rng);
    W().moveToSquad(c, sq);
    const p = S.nav.nearestOpen((at?.x ?? sq.x) + rng.range(-6, 6), (at?.z ?? sq.z) + rng.range(-6, 6), 10) ?? [sq.x, sq.z];
    c.x = p[0]; c.z = p[1]; c.y = S.T.heightAt(c.x, c.z); c.homeX = c.x; c.homeZ = c.z;
  }
  // the leader first, then beasts and Sentinels by turns: whoever the budget cuts comes off the end
  const [lead, ...rest] = sq.members;
  const people = rest.filter((id) => !W().char(id)?.animal), beasts = rest.filter((id) => W().char(id)?.animal);
  const mixed: number[] = [lead];
  while (people.length || beasts.length) { if (beasts.length) mixed.push(beasts.shift()!); if (people.length) mixed.push(people.shift()!); }
  sq.members = mixed;
}

/** Sends the next wave, sized to your band: on your base if you have one, else on the nearest town. */
export function sendWave(): Squad | null {
  const cs = crisisState();
  const site = siteById(cs.foundry);
  if (!site) return null;
  const i = cs.wave;
  const band = playerBand();
  const budget = Math.max(60, band.power * CRISIS.waves[Math.min(i, CRISIS.waves.length - 1)]);
  const rng = new RNG(hash3(site.seed, 77 + i, cs.woke));
  const { sentinels, drones, bots } = waveOf(i, budget);
  const base = playerBase();
  let sq: Squad | null = null;
  let target = '';
  if (base) {
    sq = spawnRaid(base.x, base.z, 0, { faction: 'machines', role: 'patrol', demand: 'fight', n: [sentinels, sentinels], name: 'Sentinels' });
    target = 'your base';
    cs.target = 0;
  } else {
    const town = townTarget(site);
    const spec = SPECS.find((s) => s.key === 'sentinels');
    if (town && spec) {
      sq = sendWarParty(spec, sentinels, town, budget);
      if (sq) sq.name = 'Foundry war party';
      target = town.name;
      cs.target = town.id;
    }
  }
  if (!sq) return null;
  addBeasts(sq, drones, bots, rng);
  trimTo(sq, { n: 99, budget, slack: 1.3 });
  sq.flags.crisis = true;
  cs.squads.push(sq.id);
  cs.wave++;
  const folk = sq.members.map((id) => W().char(id)).filter((c): c is Char => !!c);
  const count = (k: string | null) => folk.filter((c) => c.animal === k).length;
  const plural = (n: number, one: string) => (n ? `${n} ${one}${n > 1 ? 's' : ''}` : '');
  const what = [plural(count(null), 'Sentinel'), plural(count('sawdrone'), 'saw drone'), plural(count('warbot'), 'warbot')].filter(Boolean).join(', ');
  const line = `${fill(CRISIS.wave, { nth: ORDINAL[Math.min(i, ORDINAL.length - 1)], foundry: site.name, target })} ${what[0].toUpperCase() + what.slice(1)}.`;
  W().say(line, 'bad', S.clock.t);
  S.fx.notice(line, 'bad');
  return sq;
}

/** Waves that are over turn back to the foundry, and are gone when nobody is watching. */
function homeward(cs: CrisisState, site: Site) {
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

/** The Foundry Mind is broken: the machines turn for home, and the waste pays its thanks. */
export function resolveCrisis(p?: Char) {
  const cs = crisisState();
  if (cs.state === 'resolved') return;
  const site = siteById(cs.foundry);
  cs.state = 'resolved';
  cs.since = S.clock.t;
  delete cs.pending;
  for (const id of cs.squads) { const sq = W().squads.get(id); if (sq) { sq.flags.baseRaid = false; sq.flags.townRaid = 0; } }
  if (site) homeward(cs, site);
  const lead = p ?? upMine()[0] ?? W().playerChars().find((c) => c.alive);
  W().money += 8000;
  if (lead) { give(lead, 'foundry_heart', 1); give(lead, 'relic_core', 1); }
  for (const f of ['drifters', 'concord', 'delvers', 'hollows', 'karuk', 'thrum', 'ironcoin']) if (W().rel.get('player', f) > -50) W().rel.add('player', f, 10);
  W().flags.crisisResolved = S.clock.t;
  W().say(`${CRISIS.name}: ${CRISIS.end} ${CRISIS.reward} (8,000 chits, the Foundry Heart and a relic core.)`, 'story', S.clock.t);
  S.fx.notice(`${CRISIS.name}: the Foundry Mind is broken.`, 'good');
}

let t = 0, lastHour = -1;
export function tickCrisis(dt: number) {
  t -= dt;
  if (t > 0) return;
  t = 2;
  const cs = crisisState();
  if (cs.state === 'resolved') return;
  if (cs.state === 'none') {
    if (cs.pending !== undefined && S.clock.t >= cs.pending) { wakeCrisis(); return; }
    // late in a game, a base draws the foundry's notice (looked at once a game hour: finding a base is not free)
    const hour = Math.floor(S.clock.t / HOUR);
    if (hour === lastHour) return;
    lastHour = hour;
    if (S.clock.day >= 20 && playerBase()) wakeCrisis();
    return;
  }
  const site = siteById(cs.foundry);
  if (!site) { cs.state = 'none'; return; }
  if (!cs.mind) placeMind(cs, site);
  if (mindDown(cs)) { resolveCrisis(); return; }
  homeward(cs, site);
  if (cs.state === 'warning') {
    if (S.clock.t - (cs.since ?? 0) >= CRISIS.warnDays * DAY) { cs.state = 'waves'; cs.next = S.clock.t; }
    return;
  }
  if (cs.state === 'waves') {
    if (waveOut(cs) || S.clock.t < (cs.next ?? 0)) return;
    if (cs.wave >= CRISIS.waves.length) {
      cs.state = 'quiet'; cs.since = S.clock.t;
      const text = fill(CRISIS.quiet, { foundry: site.name });
      W().say(`${CRISIS.name}: ${text}`, 'story', S.clock.t);
      S.fx.notice(text, 'info');
      return;
    }
    if (sendWave()) cs.next = S.clock.t + CRISIS.waveDays * DAY;
    else cs.next = S.clock.t + HOUR; // nowhere to send it from just now: try again within the hour
    return;
  }
  if (cs.state === 'quiet' && S.clock.t - (cs.since ?? 0) >= CRISIS.quietDays * DAY) {
    cs.wave = Math.min(cs.wave, 2); // it comes back where it left off, near enough
    wakeCrisis();
  }
}

/** What the crisis asks of you now, for the tracker and the journal. */
export function crisisGoal(): { text: string; where?: { x: number; z: number }; entry: string } | null {
  const cs = crisisState();
  if (!crisisOn()) return null;
  const site = siteById(cs.foundry);
  if (!site) return null;
  const base = playerBase();
  const out = cs.squads.map((id) => W().squads.get(id)).find((sq) => sq && !sq.flags.homeward && sq.members.some((m) => W().char(m)?.up));
  const entry = 'crisis';
  if (out && base && cs.target === 0) return { text: `${CRISIS.name}: a wave is marching on your base. Hold it.`, where: { x: base.x, z: base.z }, entry };
  if (cs.state === 'warning') return { text: `${CRISIS.name}: the first wave sets out within the day. Ready your base, or break the Foundry Mind at ${site.name}.`, where: { x: site.x, z: site.z }, entry };
  if (cs.state === 'quiet') return { text: `${CRISIS.name}: ${site.name} is quiet. Break the Foundry Mind before it wakes again.`, where: { x: site.x, z: site.z }, entry };
  return { text: `${CRISIS.name}: break the Foundry Mind at ${site.name}, or hold out against its waves.`, where: { x: site.x, z: site.z }, entry };
}

/** The journal's account of the crisis. */
export function crisisView() {
  const cs = crisisState();
  const site = siteById(cs.foundry);
  const mind = cs.mind ? W().char(cs.mind) : undefined;
  const threat = site ? campThreat(site).threat : 0;
  return {
    state: cs.state, site, wave: cs.wave, waves: CRISIS.waves.length,
    next: cs.state === 'waves' ? cs.next : cs.state === 'warning' ? (cs.since ?? 0) + CRISIS.warnDays * DAY : cs.state === 'quiet' ? (cs.since ?? 0) + CRISIS.quietDays * DAY : undefined,
    danger: rate(threat + (mind?.up ? beastThreat('warbot') * (MIND_HP * MIND_SKILL - 1) : 0) + (site && !W().populated.has(site.id) && mind?.up ? beastThreat('warbot') + 2 * typicalPower('machines', 'construct', 46) : 0)),
    guide: site ? fill(CRISIS.guide, { foundry: site.name }) : '',
  };
}
