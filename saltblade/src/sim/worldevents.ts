// The powers of the waste at war: war parties march on the towns of their
// enemies, a town that is helped remembers it, and when a leader falls the
// world shifts around the hole they leave.
import { S } from './ctx';
import { Squad } from './squad';
import { Char, Role } from './char';
import { makePerson } from './spawn';
import { RNG } from '../core/rng';
import { strengthOf } from './combat';
import { TOWN_PLANS } from '../content/buildings';
import { SETTLEMENT } from '../content/layout';
import { FACTION } from '../content/factions';
import { DAY } from './clock';
import { kill, knockOut } from './health';
import { Site } from '../world/terrain';
import { shopGrid } from './shops';

const rng = new RNG(31337);
let t = 0;

interface Campaign { key: string; attacker: string; targets: string[]; role: Role; n: [number, number]; name: string; from?: string[]; weight: number; }
const CAMPAIGNS: Campaign[] = [
  { key: 'mawkin', attacker: 'mawkin', targets: ['lowtide', 'lanternrest', 'dustwell', 'brokenchain'], role: 'bandit', n: [8, 14], name: 'Mawkin war party', weight: 2 },
  { key: 'reavers', attacker: 'reavers', targets: ['squatters', 'dustwell', 'harrowmarket'], role: 'bandit', n: [8, 13], name: 'Reaver raiding party', weight: 2, from: ['reaversroost'] },
  { key: 'starvelings', attacker: 'starvelings', targets: ['squatters', 'dustwell', 'lowtide', 'crossroad'], role: 'bandit', n: [10, 16], name: 'Starveling horde', weight: 1.5 },
  { key: 'crusade', attacker: 'ember', targets: ['redmesa', 'humminghollow', 'waxgate', 'rustward'], role: 'patrol', n: [8, 12], name: 'Covenant crusade', weight: 2, from: ['cinderhold', 'pyreswatch', 'brightwater'] },
  { key: 'warband', attacker: 'karuk', targets: ['brightwater', 'pyreswatch'], role: 'patrol', n: [7, 11], name: 'Karuk warband', weight: 2, from: ['hornspire', 'redmesa'] },
  { key: 'swarm', attacker: 'blackcomb', targets: ['humminghollow', 'waxgate'], role: 'bandit', n: [8, 12], name: 'Blackcomb swarm', weight: 1.2, from: ['blackcomb'] },
  { key: 'liberation', attacker: 'unchained', targets: ['chainfield'], role: 'bandit', n: [6, 10], name: 'Unchained war band', weight: 1, from: ['brokenchain'] },
  { key: 'fog', attacker: 'mistcrawlers', targets: ['lowtide'], role: 'bandit', n: [8, 12], name: 'Mistcrawler pack', weight: 1 },
];

const siteBy = (key: string) => S.T.sites.find((s) => s.settlement === key || s.key === key);

/** Campaigns stop for a while when the people who send them lose their leader. */
function suppressed(c: Campaign) {
  const until = S.W.flags.quiet?.[c.attacker] ?? 0;
  return S.clock.t < until;
}

function heard(site: Site) {
  const W = S.W;
  if (W.discovered.has(site.id)) return true;
  return W.playerChars().some((c) => Math.hypot(c.x - site.x, c.z - site.z) < 2500);
}

/** For testing: start a named campaign now. */
export function launchCampaign(key: string) { const c = CAMPAIGNS.find((x) => x.key === key); if (c) launch(c); }

function launch(c: Campaign) {
  const W = S.W;
  const targets = c.targets.map(siteBy).filter((s): s is Site => !!s && !!s.faction && W.rel.hostile(c.attacker, s.faction));
  if (!targets.length) return;
  const target = rng.pick(targets);
  // march from home, or out of the wastes
  let sx = 0, sz = 0;
  const homes = (c.from ?? []).map(siteBy).filter((s): s is Site => !!s && s.faction === c.attacker);
  if (homes.length) {
    const h = homes.sort((a, b) => Math.hypot(a.x - target.x, a.z - target.z) - Math.hypot(b.x - target.x, b.z - target.z))[0];
    const a = Math.atan2(target.x - h.x, target.z - h.z);
    sx = h.x + Math.sin(a) * (h.r + 30); sz = h.z + Math.cos(a) * (h.r + 30);
  } else {
    let ok = false;
    for (let i = 0; i < 30 && !ok; i++) {
      const a = rng.range(0, Math.PI * 2), d = rng.range(1300, 1800);
      sx = target.x + Math.sin(a) * d; sz = target.z + Math.cos(a) * d;
      ok = S.T.heightAt(sx, sz) > 0.4 && !!S.nav.nearestOpen(sx, sz, 10) && !S.T.siteAt(sx, sz, 150);
    }
    if (!ok) return;
  }
  const path = S.nav.coarsePath(sx, sz, target.x, target.z);
  if (!path) return;
  const route: number[] = [];
  for (let i = 0; i < path.length; i += 16) route.push(path[i], path[i + 1]);
  route.push(target.x, target.z);
  const sq = new Squad();
  sq.faction = c.attacker; sq.kind = 'raid'; sq.name = c.name;
  sq.x = sx; sq.z = sz; sq.route = route; sq.ri = 0;
  sq.born = S.clock.t; sq.ttl = S.clock.t + DAY * 3;
  sq.task = { k: 'raid', site: target.id, x: target.x, z: target.z, until: S.clock.t + DAY * 2 };
  sq.flags.spec = 'campaign';
  sq.flags.townRaid = target.id;
  W.addSquad(sq);
  const n = rng.int(c.n[0], c.n[1]);
  for (let i = 0; i < n; i++) {
    const m = makePerson(W, { faction: c.attacker, role: c.role }, rng);
    W.moveToSquad(m, sq);
    const spot = S.nav.nearestOpen(sx + rng.range(-6, 6), sz + rng.range(-6, 6), 12) ?? [sx, sz];
    m.x = spot[0]; m.z = spot[1]; m.y = S.T.heightAt(m.x, m.z);
    m.homeX = m.x; m.homeZ = m.z;
  }
  if (heard(target)) {
    S.W.say(`Word on the road: a ${c.name} is marching on ${target.name}.`, 'info', S.clock.t);
    S.fx.notice(`${c.name[0].toUpperCase() + c.name.slice(1)} is marching on ${target.name}.`.replace(/^/, 'A '), 'info');
  }
}

/** Strength a town can put on its walls: its guards if they exist, else what its plan would give it. */
function defence(site: Site): number {
  const W = S.W;
  if (W.populated.has(site.id)) {
    const guards = [...W.chars.values()].filter((c) => c.site === site.id && (c.role === 'guard' || c.role === 'patrol' || c.role === 'boss') && c.faction === site.faction);
    return strengthOf(guards);
  }
  const def = SETTLEMENT[site.settlement!];
  const plan = def ? TOWN_PLANS[def.tmpl] : undefined;
  return (plan?.guards ?? 4) * 100 * (def?.capital ? 1.3 : 1);
}

/** A fight at a town nobody of yours is watching, settled by strength. */
function settle(sq: Squad, site: Site) {
  const W = S.W;
  const raiders = sq.members.map((id) => W.char(id)).filter((c): c is Char => !!c && c.up);
  if (!raiders.length) { sq.flags.done = true; return; }
  const walls = SETTLEMENT[site.settlement!]?.walls ? 1.25 : 1;
  const att = strengthOf(raiders) * rng.range(0.7, 1.3);
  const def = defence(site) * walls * rng.range(0.8, 1.4);
  const known = heard(site);
  if (att > def) {
    // sacked: the shops are emptied, some of the people are killed or carried off
    for (const sh of W.shops.values()) {
      if (sh.site !== site.id) continue;
      sh.money = Math.round(sh.money * 0.4);
      const g = shopGrid(sh);
      if (g) g.items = g.items.filter(() => rng.chance(0.45));
    }
    if (W.populated.has(site.id)) {
      for (const c of W.chars.values()) {
        if (c.site !== site.id || c.faction !== site.faction || !c.up || c.unique) continue;
        if (rng.chance(0.25)) { if (rng.chance(0.4)) kill(c); else knockOut(c); }
      }
    }
    W.flags.sacked = { ...(W.flags.sacked ?? {}), [site.id]: S.clock.t };
    for (const r of raiders) if (rng.chance(0.2)) kill(r);
    if (known) {
      W.say(`${site.name} was sacked by a ${sq.name}.`, 'bad', S.clock.t);
      S.fx.notice(`${site.name} has been sacked by the ${FACTION[sq.faction]?.short ?? sq.name}.`, 'bad');
    }
  } else {
    for (const r of raiders) if (rng.chance(0.6)) kill(r); else knockOut(r);
    if (known) W.say(`The defenders of ${site.name} drove off a ${sq.name}.`, 'info', S.clock.t);
  }
  sq.flags.done = true;
}

function goHome(sq: Squad) {
  const home = S.T.nearestSite(sq.x, sq.z, (s) => s.faction === sq.faction);
  const a = rng.range(0, Math.PI * 2);
  const tx = home ? home.x : sq.x + Math.sin(a) * 1500, tz = home ? home.z : sq.z + Math.cos(a) * 1500;
  sq.route = [tx, tz];
  sq.ri = 0;
  sq.task = { k: 'travel', to: home?.id ?? 0, x: tx, z: tz, then: 'despawn' };
  sq.flags.townRaid = 0;
}

export function tickWorldEvents(dt: number) {
  t -= dt;
  if (t > 0) return;
  t = 6;
  const W = S.W;
  let active = 0;
  for (const sq of W.squads.values()) {
    if (!sq.flags.townRaid) continue;
    const site = S.T.sites.find((s) => s.id === sq.flags.townRaid);
    const alive = sq.members.some((id) => W.char(id)?.up);
    if (!site || !alive || sq.flags.done || (sq.task.k === 'raid' && S.clock.t > sq.task.until)) { goHome(sq); continue; }
    active++;
    const lead = W.char(sq.leader);
    const there = Math.hypot((lead?.x ?? sq.x) - site.x, (lead?.z ?? sq.z) - site.z) < site.r + 60;
    if (there && !sq.active) settle(sq, site);
  }
  // now and then, somebody marches
  if (active < 2 && rng.chance(0.012)) {
    const list = CAMPAIGNS.filter((c) => !suppressed(c));
    if (list.length) launch(rng.weighted(list.map((c) => [c, c.weight] as const)));
  }
}

/** Killing the enemies of a town at its gates earns that town's goodwill. */
export function creditDefence(victim: Char) {
  const W = S.W;
  const by = W.char(victim.lastHitBy);
  if (!by || by.faction !== 'player' || victim.animal || victim.faction === 'player' || victim.mem.credited) return;
  const town = S.T.nearestSite(victim.x, victim.z, (s) => s.kind === 'town' && !!s.faction);
  if (!town || !town.faction || Math.hypot(town.x - victim.x, town.z - victim.z) > town.r + 250) return;
  if (town.faction === victim.faction || !W.rel.hostile(town.faction, victim.faction)) return;
  victim.mem.credited = true;
  if (W.rel.get('player', town.faction) < 60) W.rel.add('player', town.faction, victim.status === 'dead' ? 1.5 : 1);
}

/** The death of a leader, and what it does to the world. */
export function leaderFell(c: Char) {
  const W = S.W;
  const site = S.T.sites.find((s) => s.id === c.mem.leaderOf);
  if (!site || !site.faction) return;
  delete c.mem.leaderOf;
  const fac = site.faction;
  const byPlayer = W.char(c.lastHitBy)?.faction === 'player' && S.time - c.lastHitT < 30;
  W.flags.leaderless = { ...(W.flags.leaderless ?? {}), [site.id]: S.clock.t };
  // the faction sends no war parties while it chooses who comes next
  W.flags.quiet = { ...(W.flags.quiet ?? {}), [fac]: S.clock.t + DAY * (SETTLEMENT[site.settlement!]?.capital ? 12 : 5) };
  W.say(`${c.name}, ${c.title || 'leader'} of ${site.name}, is dead.`, 'story', S.clock.t);
  S.fx.notice(`${c.name}, ${c.title || 'leader'} of ${site.name}, is dead.`, byPlayer ? 'good' : 'info');
  if (byPlayer) {
    W.rel.add('player', fac, -40);
    // their enemies are glad of it
    for (const f of Object.keys(FACTION)) {
      if (f === fac || f === 'player' || f === 'fauna') continue;
      if (W.rel.get(fac, f) <= -60) W.rel.add('player', f, SETTLEMENT[site.settlement!]?.capital ? 15 : 8);
    }
  }
}

