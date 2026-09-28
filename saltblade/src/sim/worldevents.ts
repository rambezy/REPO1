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
import type { TownInfo } from '../world/towns';
import type { WObj } from './objects';
import type { World } from './world';

const rng = new RNG((Date.now() ^ 31337) >>> 0); // a different world story each game
let t = 0;

interface Campaign { key: string; attacker: string; targets: string[]; role: Role; n: [number, number]; name: string; from?: string[]; weight: number; }
const CAMPAIGNS: Campaign[] = [
  { key: 'mawkin', attacker: 'mawkin', targets: ['lowtide', 'lanternrest', 'dustwell', 'brokenchain', 'hardcoin', 'ribshade'], role: 'bandit', n: [8, 14], name: 'Mawkin war party', weight: 2 },
  { key: 'reavers', attacker: 'reavers', targets: ['squatters', 'dustwell', 'harrowmarket'], role: 'bandit', n: [8, 13], name: 'Reaver raiding party', weight: 2, from: ['reaversroost'] },
  { key: 'starvelings', attacker: 'starvelings', targets: ['squatters', 'dustwell', 'lowtide', 'crossroad', 'tithefield', 'brinewick'], role: 'bandit', n: [10, 16], name: 'Starveling horde', weight: 1.5 },
  { key: 'crusade', attacker: 'ember', targets: ['redmesa', 'humminghollow', 'waxgate', 'rustward', 'cragfold', 'relayfour'], role: 'patrol', n: [8, 12], name: 'Covenant crusade', weight: 2, from: ['cinderhold', 'pyreswatch', 'brightwater'] },
  { key: 'warband', attacker: 'karuk', targets: ['brightwater', 'pyreswatch', 'tithefield'], role: 'patrol', n: [7, 11], name: 'Karuk warband', weight: 2, from: ['hornspire', 'redmesa', 'cragfold'] },
  { key: 'swarm', attacker: 'blackcomb', targets: ['humminghollow', 'waxgate', 'deepleaf'], role: 'bandit', n: [8, 12], name: 'Blackcomb swarm', weight: 1.2, from: ['blackcomb'] },
  { key: 'liberation', attacker: 'unchained', targets: ['chainfield'], role: 'bandit', n: [6, 10], name: 'Unchained war band', weight: 1, from: ['brokenchain'] },
  { key: 'fog', attacker: 'mistcrawlers', targets: ['lowtide', 'brinewick'], role: 'bandit', n: [8, 12], name: 'Mistcrawler pack', weight: 1 },
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
  const lately = (s: Site) => S.clock.t - (W.flags.sacked?.[s.id] ?? -1e12) < DAY * 4; // nothing left to take
  const targets = c.targets.map(siteBy).filter((s): s is Site => !!s && !!s.faction && W.rel.hostile(c.attacker, s.faction) && !lately(s));
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
  // towns mend, an hour at a time
  const hour = Math.floor(S.clock.t / 3600);
  if (hour !== lastHour) { lastHour = hour; for (const info of W.towns.values()) recover(W, info); }
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
  // now and then, somebody marches: one or two war parties a day
  if (active < 2 && rng.chance(0.003)) {
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
  W.flags.fell = { ...(W.flags.fell ?? {}), [site.key]: S.clock.t }; // remembered, for the people it matters to
  // the faction sends no war parties while it chooses who comes next
  W.flags.quiet = { ...(W.flags.quiet ?? {}), [fac]: S.clock.t + DAY * (SETTLEMENT[site.settlement!]?.capital ? 12 : 5) };
  W.say(`${c.name}, ${c.title || 'leader'} of ${site.name}, is dead.`, 'story', S.clock.t);
  S.fx.notice(`${c.name}, ${c.title || 'leader'} of ${site.name}, is dead.`, byPlayer ? 'good' : 'info');
  if (byPlayer) {
    W.flags.leadersKilled = (W.flags.leadersKilled ?? 0) + 1;
    W.rel.add('player', fac, -40);
    // their enemies are glad of it
    for (const f of Object.keys(FACTION)) {
      if (f === fac || f === 'player' || f === 'fauna') continue;
      if (W.rel.get(fac, f) <= -60) W.rel.add('player', f, SETTLEMENT[site.settlement!]?.capital ? 15 : 8);
    }
  }
}


// ---------------------------------------------------------------- recovery

let lastHour = -1;
const guardRole = (fac: string): Role => (fac === 'mawkin' || fac === 'reavers' || fac === 'blackcomb' ? 'bandit' : 'guard');

function townSquad(W: World, site: Site, kind: 'guard' | 'town') {
  for (const sq of W.squads.values()) if (sq.site === site.id && sq.kind === kind && sq.faction === site.faction) return sq;
  return null;
}

/**
 * Someone new comes to town: through a gate if your people are near enough
 * to see them arrive, straight to their place if not.
 */
function newcomer(W: World, info: TownInfo, spec: { faction: string; role: Role; level?: number; race?: string; loadout?: string }, sq: Squad, home: [number, number, number]): Char {
  const c = makePerson(W, spec, rng);
  W.moveToSquad(c, sq);
  const site = info.site;
  const watched = W.playerChars().some((p) => Math.hypot(p.x - site.x, p.z - site.z) < site.r + 400);
  let x = home[0], z = home[1];
  if (watched) {
    const g = info.gates.length ? rng.pick(info.gates) : null;
    const a = g ? g.a : rng.range(0, Math.PI * 2);
    x = (g ? g.x : site.x + Math.sin(a) * site.r * 0.85) + Math.sin(a) * 6;
    z = (g ? g.z : site.z + Math.cos(a) * site.r * 0.85) + Math.cos(a) * 6;
  }
  const spot = S.nav.nearestOpen(x, z, 12) ?? [x, z];
  c.x = spot[0]; c.z = spot[1]; c.y = S.T.heightAt(c.x, c.z);
  c.homeX = home[0]; c.homeZ = home[1]; c.homeDir = c.dir = home[2];
  c.site = site.id;
  return c;
}

/** Where the leader of a town sits, and what they are called. */
function seatOf(info: TownInfo): { role: Role; title: string; guard: boolean; b: WObj; back: number; race?: string; level?: number; loadout?: string } | null {
  const fac = info.site.faction!;
  const def = SETTLEMENT[info.site.settlement!];
  if (!def) return null;
  for (const b of info.buildings) {
    const use = b.data.use;
    if (use === 'palace' && fac === 'concord') return { role: 'noble', title: def.key === 'aurum' ? 'Lord of the Gilded Seat' : 'Lord', guard: false, b, back: 0, race: 'valefolk' };
    if (use === 'temple' && fac === 'ember' && def.capital && !info.shops.some((s) => s.building === b)) return { role: 'priest', title: 'the High Flame', guard: false, b, back: b.data.d / 2 - 3 };
    if (use === 'boss' || (use === 'hall' && fac === 'karuk')) {
      const title = fac === 'karuk' ? (def.capital ? 'the Horn King' : 'War Chief') : fac === 'reavers' ? 'Reaver Lord' : 'Chief';
      return { role: 'boss', title, guard: true, b, back: b.data.d / 2 - 2.5, level: 50, loadout: fac === 'reavers' ? 'reavers_boss' : undefined };
    }
  }
  return null;
}

const SHOP_TITLE: Record<string, string> = { bar: 'Barkeep', temple: 'Priest', slaves: 'Slave Trader', mercs: 'Company Clerk' };

/** A town makes good its losses: guards for empty posts, traders for dead ones, and in time a new leader. */
function recover(W: World, info: TownInfo) {
  const site = info.site;
  const def = SETTLEMENT[site.settlement!];
  if (!W.populated.has(site.id) || !site.faction || !def || def.faction !== site.faction) return;
  if (S.clock.t - (W.flags.sacked?.[site.id] ?? -1e12) < DAY) return; // still counting who is missing
  const known = W.discovered.has(site.id);
  // guards
  const gs = townSquad(W, site, 'guard');
  if (gs && rng.chance(0.15)) {
    const up = gs.members.map((id) => W.char(id)).filter((c): c is Char => !!c && c.alive && c.role !== 'boss');
    const want = gs.flags.size ?? info.plan.guards;
    if (up.length < want) {
      const free = info.posts.filter((p) => !up.some((c) => Math.hypot(c.homeX - p.x, c.homeZ - p.z) < 2));
      const post = free.length ? rng.pick(free) : null;
      const home: [number, number, number] = post ? [post.x, post.z, post.dir] : [site.x + rng.range(-8, 8), site.z + rng.range(-8, 8), rng.range(0, Math.PI * 2)];
      newcomer(W, info, { faction: site.faction, role: guardRole(site.faction) }, gs, home);
    }
  }
  // traders
  const town = townSquad(W, site, 'town');
  const shut: Record<number, number> = W.flags.shut ?? (W.flags.shut = {});
  for (const sh of W.shops.values()) {
    if (sh.site !== site.id) continue;
    const k = W.char(sh.keeper);
    if (k && k.status !== 'dead' && k.faction !== 'player') { delete shut[sh.id]; continue; }
    if (shut[sh.id] === undefined) { shut[sh.id] = S.clock.t; continue; }
    const spot = info.shops.find((x) => x.counter.id === sh.id);
    if (S.clock.t - shut[sh.id] < DAY || !spot || !town) continue;
    const role: Role = sh.kind === 'bar' ? 'barkeep' : sh.kind === 'temple' ? 'priest' : 'shopkeeper';
    const c = newcomer(W, info, { faction: site.faction === 'mawkin' ? 'drifters' : site.faction, role }, town, spot.spot);
    c.shop = String(sh.id);
    c.title = SHOP_TITLE[sh.kind] ?? 'Trader';
    sh.keeper = c.id;
    delete shut[sh.id];
    if (known) W.say(`${c.name} has taken over ${sh.name} in ${site.name}.`, 'info', S.clock.t);
  }
  // a new leader, once the old one is mourned or forgotten
  const since = W.flags.leaderless?.[site.id];
  if (since !== undefined && S.clock.t - since > DAY * (def.capital ? 10 : 4)) {
    const clear = () => { const l = { ...W.flags.leaderless }; delete l[site.id]; W.flags.leaderless = l; };
    const seat = seatOf(info);
    const sq = seat ? townSquad(W, site, seat.guard ? 'guard' : 'town') : null;
    if (!seat || !sq) { clear(); return; }
    const b = seat.b;
    const home: [number, number, number] = [b.x - Math.sin(b.rot) * seat.back, b.z - Math.cos(b.rot) * seat.back, b.rot];
    const c = newcomer(W, info, { faction: site.faction, role: seat.role, race: seat.race, level: seat.level, loadout: seat.loadout }, sq, home);
    c.title = seat.title;
    c.mem.leaderOf = site.id;
    clear();
    if (known || heard(site)) {
      W.say(`${c.name} is the new ${seat.title.replace(/^the /, '')} of ${site.name}.`, 'story', S.clock.t);
      S.fx.notice(`${site.name} has a new leader: ${c.name}, ${seat.title}.`, 'info');
    }
  }
}
