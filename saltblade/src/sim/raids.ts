// Raids on the player's base. A settlement that grows draws attention:
// bandits after tribute, starvelings after food, cannibals after meat, and
// in Concord lands the tax collectors. They march in from beyond sight,
// make their demands or simply attack, and loot the stores of a base
// left undefended.
import { S } from './ctx';
import { Squad } from './squad';
import { makePerson } from './spawn';
import { RNG } from '../core/rng';
import { playerBase } from './base';
import { HOUR, DAY } from './clock';
import { WORLD } from '../world/consts';
import { Char } from './char';

const rng = new RNG(8181);
let t = 0;

interface RaidKind { faction: string; role: 'bandit' | 'patrol'; demand: 'tribute' | 'food' | 'tax' | 'fight'; n: [number, number]; name: string; }

/** Who comes for a base, by the region it stands in and who rules near it. */
function raidFor(x: number, z: number): RaidKind {
  const reg = S.T.regionAt(x, z).key;
  const town = S.T.nearestSite(x, z, (s) => s.kind === 'town');
  const near = town && Math.hypot(town.x - x, town.z - z) < 2600 ? town.faction : '';
  const opts: [RaidKind, number][] = [];
  if (near === 'concord') opts.push([{ faction: 'concord', role: 'patrol', demand: 'tax', n: [4, 6], name: 'Concord Tax Collectors' }, 3]);
  if (['flats', 'salt', 'highlands', 'vale'].includes(reg)) opts.push([{ faction: 'reavers', role: 'bandit', demand: 'tribute', n: [5, 10], name: 'Dust Reavers' }, 3]);
  if (['flats', 'salt', 'ember', 'vale', 'ash'].includes(reg)) opts.push([{ faction: 'starvelings', role: 'bandit', demand: 'food', n: [6, 14], name: 'Starvelings' }, 2.5]);
  if (['ash', 'bonesea'].includes(reg)) opts.push([{ faction: 'mawkin', role: 'bandit', demand: 'fight', n: [6, 12], name: 'Mawkin Raiders' }, 3]);
  if (['mire', 'thrumwood'].includes(reg)) opts.push([{ faction: 'scorched', role: 'bandit', demand: 'tribute', n: [5, 9], name: 'Scorched Hand' }, 2]);
  if (reg === 'thrumwood') opts.push([{ faction: 'blackcomb', role: 'bandit', demand: 'fight', n: [5, 10], name: 'Blackcomb Swarm' }, 2]);
  if (reg === 'coast') opts.push([{ faction: 'mistcrawlers', role: 'bandit', demand: 'fight', n: [5, 10], name: 'Mistcrawlers' }, 2]);
  if (!opts.length) opts.push([{ faction: 'reavers', role: 'bandit', demand: 'tribute', n: [5, 9], name: 'Dust Reavers' }, 1]);
  return rng.weighted(opts);
}

function activeRaid() {
  for (const sq of S.W.squads.values()) if (sq.flags.baseRaid && sq.members.some((id) => S.W.char(id)?.alive)) return sq;
  return null;
}

export function spawnRaid(bx: number, bz: number, size: number) {
  const W = S.W;
  const kind = raidFor(bx, bz);
  // come in from beyond sight
  let sx = 0, sz = 0, ok = false;
  for (let i = 0; i < 40 && !ok; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(700, 900);
    sx = bx + Math.sin(a) * d; sz = bz + Math.cos(a) * d;
    if (sx < 200 || sz < 200 || sx > WORLD - 200 || sz > WORLD - 200) continue;
    if (S.T.heightAt(sx, sz) < 0.4 || S.T.slopeAt(sx, sz) > 0.6) continue;
    ok = !!S.nav.nearestOpen(sx, sz, 10);
  }
  if (!ok) return;
  const sq = new Squad();
  sq.faction = kind.faction;
  sq.kind = 'raid';
  sq.name = kind.name;
  sq.x = sx; sq.z = sz;
  sq.route = [bx, bz];
  sq.ri = 0;
  sq.born = S.clock.t;
  sq.ttl = S.clock.t + DAY * 1.5;
  sq.task = { k: 'raid', site: 0, x: bx, z: bz, until: S.clock.t + DAY };
  sq.flags.spec = 'baseraid';
  sq.flags.baseRaid = true;
  sq.flags.demand = kind.demand;
  W.addSquad(sq);
  const n = Math.min(18, rng.int(kind.n[0], kind.n[1]) + Math.floor(size / 8));
  const lvlBoost = Math.min(20, (S.clock.day - 1) * 0.6);
  for (let i = 0; i < n; i++) {
    const c = makePerson(W, { faction: kind.faction, role: kind.role, level: kind.faction === 'concord' ? 36 : undefined }, rng);
    if (lvlBoost > 0) for (let k = 0; k < c.sk.length; k++) c.sk[k] = Math.min(100, c.sk[k] + lvlBoost * 0.5);
    W.moveToSquad(c, sq);
    const spot = S.nav.nearestOpen(sx + rng.range(-5, 5), sz + rng.range(-5, 5), 10) ?? [sx, sz];
    c.x = spot[0]; c.z = spot[1]; c.y = S.T.heightAt(c.x, c.z);
    c.homeX = c.x; c.homeZ = c.z;
  }
  if (kind.faction === 'concord') {
    const lead = W.char(sq.leader);
    if (lead) lead.title = 'Tax Collector';
  }
  S.W.flags.lastRaid = S.clock.t;
  const what = kind.demand === 'tax' ? 'coming to collect taxes' : kind.demand === 'fight' ? 'coming for blood' : 'heading your way';
  S.W.say(`Scouts report ${n} ${kind.name} ${what}.`, 'bad', S.clock.t);
  S.fx.notice(`${n} ${kind.name} are ${what}!`, 'bad');
  S.fx.sound('alarm', bx, bz, 1);
}

/** Raids that have made their point, or lost, go home. */
function sendHome(sq: Squad) {
  const home = S.T.nearestSite(sq.x, sq.z, (s) => s.faction === sq.faction) ?? S.T.nearestSite(sq.x, sq.z, (s) => s.kind === 'town');
  const a = rng.range(0, Math.PI * 2);
  const tx = home ? home.x : sq.x + Math.sin(a) * 1500, tz = home ? home.z : sq.z + Math.cos(a) * 1500;
  sq.route = [sq.x + (tx - sq.x) * 0.5, sq.z + (tz - sq.z) * 0.5, tx, tz];
  sq.ri = 0;
  sq.task = { k: 'travel', to: home?.id ?? 0, x: tx, z: tz, then: 'despawn' };
  sq.flags.baseRaid = false;
  sq.flags.leaving = true;
}

/** An undefended base is picked over. */
function lootStores(sq: Squad, raiders: Char[]) {
  let took = 0;
  for (const o of S.W.objs.values()) {
    if (o.owner !== 'player' || !o.inv || !o.inv.items.length) continue;
    if (Math.hypot(o.x - sq.x, o.z - sq.z) > 90) continue;
    for (const it of o.inv.items.slice()) {
      if (!rng.chance(0.4)) continue;
      const carrier = raiders[took % raiders.length];
      o.inv.remove(it);
      if (!carrier.inv.put(it)) carrier.inv.add(it.id, it.n, it.q);
      took++;
    }
  }
  if (took) {
    S.W.say(`The ${sq.name} looted your stores.`, 'bad', S.clock.t);
    S.fx.notice(`The ${sq.name} ransacked your stores and left.`, 'bad');
  }
}

export function tickRaids(dt: number) {
  t -= dt;
  if (t > 0) return;
  t = 5;
  const base = playerBase();
  const W = S.W;
  if (!base) { W.flags.baseSince = 0; return; }
  if (!W.flags.baseSince) W.flags.baseSince = S.clock.t;
  const raid = activeRaid();
  if (raid) {
    const raiders = raid.members.map((id) => W.char(id)).filter((c): c is Char => !!c && c.alive);
    const up = raiders.filter((c) => c.up);
    const lead = W.char(raid.leader);
    const there = lead && Math.hypot(lead.x - base.x, lead.z - base.z) < 70;
    if (!up.length && raid.flags.arrived && !raid.flags.counted) {
      raid.flags.counted = true;
      W.flags.raidsRepelled = (W.flags.raidsRepelled ?? 0) + 1;
      S.W.say(`${W.factionName} beat off the ${raid.name}.`, 'good', S.clock.t);
    }
    if (!up.length || raid.flags.settled || S.clock.t > (raid.task.k === 'raid' ? raid.task.until : 0)) {
      if (up.length && there && (!raid.flags.settled || raid.flags.takeInKind)) lootStores(raid, up);
      sendHome(raid);
      return;
    }
    if (there) {
      raid.flags.arrived = raid.flags.arrived ?? S.clock.t;
      // nobody left standing to defend: help themselves and go
      const defenders = W.playerChars().filter((c) => c.up && Math.hypot(c.x - base.x, c.z - base.z) < 120);
      if (!defenders.length && S.clock.t - raid.flags.arrived > 0.5 * HOUR) {
        lootStores(raid, up);
        sendHome(raid);
      }
    }
    return;
  }
  // a base draws a raid now and then: bigger bases, more often
  const since = S.clock.t - (W.flags.lastRaid ?? W.flags.baseSince);
  if (S.clock.t - W.flags.baseSince < DAY * 1.2 || since < DAY * 1.5) return;
  const perCheck = Math.min(0.02, 0.003 + base.n * 0.0004) * (1 + REGION_DANGER(base.x, base.z) * 0.15);
  if (rng.chance(perCheck)) spawnRaid(base.x, base.z, base.n);
}

function REGION_DANGER(x: number, z: number) { return S.T.regionAt(x, z).danger; }

/** Tax collectors: the Concord's price for living in its lands. */
export function taxFor(): number {
  const b = playerBase();
  return Math.round((200 + (b?.n ?? 0) * 30) / 10) * 10;
}

