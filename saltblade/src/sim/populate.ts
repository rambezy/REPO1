// Filling towns and sites with people the first time the player comes near.
import { World } from './world';
import { S } from './ctx';
import { Squad, SquadKind } from './squad';
import { Char, Role } from './char';
import { makePerson, makeAnimal } from './spawn';
import { makeShop } from './shops';
import { RNG, hash3 } from '../core/rng';
import { SETTLEMENT, LANDMARKS } from '../content/layout';
import { FACTION } from '../content/factions';
import { ANIMAL } from '../content/animals';
import { REGIONS } from '../world/regions';
import type { TownInfo } from '../world/towns';
import type { Site } from '../world/terrain';
import { SHOP_NAMES } from '../content/buildings';
import { recruitStory } from '../content/stories';
import { bountyAt, markWanted } from './bounties';

function squad(W: World, faction: string, kind: SquadKind, name: string, site: number): Squad {
  const s = new Squad();
  s.faction = faction; s.kind = kind; s.name = name; s.site = site;
  W.addSquad(s);
  return s;
}

function place(c: Char, x: number, z: number, dir = 0) {
  const spot = S.nav.nearestOpen(x, z, 6) ?? [x, z];
  c.x = spot[0]; c.z = spot[1]; c.y = S.T.heightAt(c.x, c.z);
  c.homeX = c.x; c.homeZ = c.z; c.homeDir = dir; c.dir = dir;
}

const WEALTH: Record<string, number> = {
  aurum: 1, harrowmarket: 0.8, cinderhold: 0.9, hornspire: 0.7, stonegate: 0.6, saltmere: 0.5, rustward: 0.8, lanternrest: 0.6, glassfall: 0.6,
  crossroad: 0.45, mudwater: 0.5, brightwater: 0.5, pyreswatch: 0.5, redmesa: 0.5, humminghollow: 0.5, waxgate: 0.4,
};

export function populateTown(W: World, info: TownInfo) {
  const site = info.site;
  if (W.populated.has(site.id)) return;
  W.populated.add(site.id);
  const def = SETTLEMENT[site.settlement!];
  const rng = new RNG(hash3(site.seed, 99, 7));
  const fac = def.faction;
  const plan = info.plan;
  const wealth = WEALTH[def.key] ?? 0.35;
  const guardRole: Role = fac === 'mawkin' || fac === 'reavers' || fac === 'blackcomb' ? 'bandit' : 'guard';
  // guards at their posts
  const gs = squad(W, fac, 'guard', `${def.name} Guard`, site.id);
  const posts = info.posts.slice();
  rng.shuffle(posts);
  const nGuards = Math.min(posts.length, plan.guards);
  for (let i = 0; i < nGuards; i++) {
    const p = posts[i];
    const c = makePerson(W, { faction: fac, role: guardRole }, rng);
    W.moveToSquad(c, gs);
    place(c, p.x, p.z, p.dir);
    c.site = site.id;
  }
  // extra guards stand at building doors
  for (let i = nGuards; i < plan.guards; i++) {
    const b = rng.pick(info.buildings);
    const d = b.data;
    const [x, z] = [b.x + Math.sin(b.rot) * (d.d / 2 + 2), b.z + Math.cos(b.rot) * (d.d / 2 + 2)];
    const c = makePerson(W, { faction: fac, role: guardRole }, rng);
    W.moveToSquad(c, gs);
    place(c, x + rng.range(-2, 2), z + rng.range(-2, 2), b.rot);
    c.site = site.id;
  }
  // a patrol walking the streets
  if (plan.patrol > 0 && info.patrol.length) {
    const ps = squad(W, fac, 'patrol', `${def.name} Patrol`, site.id);
    ps.task = { k: 'patrol', sites: [], i: 0 };
    ps.flags.loop = info.patrol.map((p) => [p.x, p.z]);
    for (let i = 0; i < plan.patrol; i++) {
      const c = makePerson(W, { faction: fac, role: fac === 'blackcomb' || fac === 'mawkin' ? 'bandit' : 'patrol' }, rng);
      W.moveToSquad(c, ps);
      place(c, info.patrol[0].x + i, info.patrol[0].z, 0);
      c.site = site.id;
    }
  }
  // shopkeepers and their shops
  const town = squad(W, fac, 'town', `${def.name}`, site.id);
  for (const sh of info.shops) {
    const role: Role = sh.kind === 'bar' ? 'barkeep' : sh.kind === 'temple' ? 'priest' : 'shopkeeper';
    const race = fac === 'drifters' && rng.chance(0.3) ? rng.pick(['valefolk', 'duneborn', 'karuk', 'hollow']) : undefined;
    const c = makePerson(W, { faction: fac === 'mawkin' ? 'drifters' : fac, role, race }, rng);
    W.moveToSquad(c, town);
    place(c, sh.spot[0], sh.spot[1], sh.spot[2]);
    c.site = site.id;
    c.shop = String(sh.counter.id);
    const name = sh.building.data.name || SHOP_NAMES[sh.kind] || 'Shop';
    makeShop(W, sh.counter.id, sh.kind, fac, site.id, c.id, wealth, name);
    c.title = sh.kind === 'bar' ? 'Barkeep' : sh.kind === 'temple' ? 'Priest' : sh.kind === 'slaves' ? 'Slave Trader' : sh.kind === 'mercs' ? 'Company Clerk' : 'Trader';
    // a guard for rich shops
    if (wealth > 0.6 && sh.kind !== 'bar' && rng.chance(0.6)) {
      const g = makePerson(W, { faction: fac, role: 'guard' }, rng);
      W.moveToSquad(g, gs);
      const b = sh.building;
      place(g, b.x + Math.sin(b.rot) * (b.data.d / 2 - 1.5) + Math.cos(b.rot) * 2, b.z + Math.cos(b.rot) * (b.data.d / 2 - 1.5) - Math.sin(b.rot) * 2, b.rot + Math.PI);
      g.site = site.id;
    }
  }
  // bar patrons and people looking for work
  for (const bar of info.bars) {
    const seats = rng.shuffle(bar.seats.slice());
    const patrons = Math.min(seats.length, rng.int(2, 5));
    for (let i = 0; i < patrons; i++) {
      const recruit = (fac === 'drifters' || fac === 'scorched' || fac === 'karuk' || fac === 'hollows' || fac === 'delvers') ? rng.chance(0.4) : rng.chance(0.15);
      const pf = recruit ? 'drifters' : fac;
      const race = recruit ? rng.pick(['valefolk', 'duneborn', 'duneborn', 'valefolk', 'karuk', 'thrum_worker', 'hollow']) : undefined;
      const c = makePerson(W, { faction: pf, role: recruit ? 'recruit' : 'resident', race: pf === 'ember' || pf === 'concord' ? undefined : race }, rng);
      W.moveToSquad(c, town);
      const [sx, sz, sr, sid] = seats[i];
      c.x = sx; c.z = sz; c.y = S.T.heightAt(sx, sz); c.homeX = sx; c.homeZ = sz; c.dir = sr; c.homeDir = sr;
      c.mem.sit = true;
      const stool = sid ? W.objs.get(sid) : undefined;
      if (stool) { c.mem.seat = stool.id; c.mem.using = stool.id; stool.user = c.id; }
      c.site = site.id;
      if (recruit) {
        c.recruitable = true;
        const lvl = Object.values(c.sk).reduce((a, b) => a + b, 0) / c.sk.length;
        c.price = rng.chance(0.55) ? 0 : Math.round((lvl * 90 + rng.int(0, 600)) / 50) * 50;
        c.mem.backstory = recruitStory(c, rng);
      }
    }
  }
  // residents
  const beds = rng.shuffle(info.beds.slice());
  for (let i = 0; i < plan.residents; i++) {
    const role: Role = fac === 'mawkin' || fac === 'reavers' ? 'bandit' : fac === 'thrum' || fac === 'blackcomb' ? 'worker' : 'resident';
    const c = makePerson(W, { faction: fac, role }, rng);
    W.moveToSquad(c, town);
    const bed = beds[i] ? W.objs.get(beds[i]) : null;
    if (bed) { c.brain.bed = bed.id; place(c, bed.x + rng.range(-3, 3), bed.z + rng.range(-3, 3)); }
    else { const a = rng.range(0, 6.28), d = rng.range(info.plazaR, site.r * 0.7); place(c, site.x + Math.sin(a) * d, site.z + Math.cos(a) * d); }
    if (role === 'worker' && info.jobs.length) { const j = rng.pick(info.jobs); place(c, j.x, j.z, j.dir); }
    c.site = site.id;
  }
  // field workers: slaves on Concord and Chainhouse land, farmers elsewhere
  const slavers = fac === 'concord' || fac === 'chainhouse' || (fac === 'scorched' && rng.chance(0.5));
  for (const j of info.jobs) {
    const c = makePerson(W, { faction: slavers ? fac : fac, role: slavers ? 'slave' : 'worker', race: slavers ? rng.pick(['valefolk', 'duneborn', 'duneborn', 'karuk', 'thrum_worker']) : undefined }, rng);
    W.moveToSquad(c, town);
    place(c, j.x, j.z, j.dir);
    c.site = site.id;
    if (slavers) { c.title = 'Slave'; c.mem.enslavedBy = fac; }
  }
  // nobles and priests
  for (const b of info.buildings) {
    const use = b.data.use;
    if (use === 'palace' && fac === 'concord') {
      const n = makePerson(W, { faction: fac, role: 'noble', race: 'valefolk' }, rng);
      W.moveToSquad(n, town);
      place(n, b.x, b.z, b.rot);
      n.title = def.key === 'aurum' ? 'Lord of the Gilded Seat' : 'Lord';
      n.site = site.id;
      for (let i = 0; i < 2; i++) { const g = makePerson(W, { faction: fac, role: 'guard', level: 45 }, rng); W.moveToSquad(g, gs); place(g, b.x + (i ? 3 : -3), b.z, b.rot); g.site = site.id; }
    }
    if (use === 'temple' && fac === 'ember' && !info.shops.some((s) => s.building === b)) {
      const p = makePerson(W, { faction: fac, role: 'priest' }, rng);
      W.moveToSquad(p, town);
      place(p, b.x - Math.sin(b.rot) * (b.data.d / 2 - 3), b.z - Math.cos(b.rot) * (b.data.d / 2 - 3), b.rot);
      p.site = site.id;
    }
    if ((use === 'boss' || (use === 'hall' && fac === 'karuk')) ) {
      const bs = makePerson(W, { faction: fac, role: 'boss', loadout: fac === 'reavers' ? 'reavers_boss' : undefined, level: 50 }, rng);
      W.moveToSquad(bs, gs);
      place(bs, b.x - Math.sin(b.rot) * (b.data.d / 2 - 2.5), b.z - Math.cos(b.rot) * (b.data.d / 2 - 2.5), b.rot);
      bs.title = fac === 'karuk' ? (def.capital ? 'the Horn King' : 'War Chief') : fac === 'reavers' ? 'Reaver Lord' : 'Chief';
      bs.site = site.id;
      const wanted = bountyAt(site.id);
      if (wanted) markWanted(bs, wanted);
    }
  }
  // prisoners in cages
  for (const cg of info.cages) {
    if (!rng.chance(fac === 'mawkin' ? 0.8 : 0.4)) continue;
    const o = W.objs.get(cg);
    if (!o) continue;
    const pf = fac === 'mawkin' || fac === 'reavers' ? rng.pick(['drifters', 'delvers', 'concord', 'karuk']) : rng.pick(['reavers', 'starvelings', 'scorched', 'drifters', 'unchained']);
    const c = makePerson(W, { faction: pf, role: 'prisoner' }, rng);
    W.moveToSquad(c, town);
    c.x = o.x; c.z = o.z; c.y = S.T.heightAt(o.x, o.z); c.homeX = o.x; c.homeZ = o.z;
    c.cage = o.id; o.occupant = c.id;
    c.title = 'Prisoner';
    c.mem.prisonerOf = fac;
    c.recruitable = true;
    c.mem.backstory = recruitStory(c, rng);
    c.site = site.id;
  }
  // a few shellbacks and goats in farm towns
  if (plan.fields && rng.chance(0.6) && fac !== 'mawkin') {
    const hs = squad(W, 'fauna', 'herd', 'Livestock', site.id);
    for (let i = 0; i < rng.int(1, 3); i++) {
      const a = makeAnimal(W, rng.pick(['shellback', 'goatling', 'longhorn']), rng);
      a.faction = 'fauna';
      W.moveToSquad(a, hs);
      const f = rng.pick(info.fields);
      place(a, f.x + rng.range(-6, 6), f.z + rng.range(-6, 6));
      a.mem.livestock = fac;
    }
  }
}

/** Camps, nests, ruins and other lesser sites. */
export function populateSite(W: World, site: Site) {
  if (W.populated.has(site.id)) return;
  W.populated.add(site.id);
  const rng = new RNG(hash3(site.seed, 77, 3));
  const reg = REGIONS[site.region];
  const k = site.kind;
  const lm = site.landmark ? LANDMARKS.find((l) => l.key === site.key) : undefined;
  const people = (fac: string, role: Role, n: number, lvl?: [number, number], name?: string) => {
    const sq = squad(W, fac, 'camp', name ?? FACTION[fac]?.short ?? fac, site.id);
    for (let i = 0; i < n; i++) {
      const c = makePerson(W, { faction: fac, role, level: lvl ? rng.range(lvl[0], lvl[1]) : undefined }, rng);
      W.moveToSquad(c, sq);
      const a = rng.range(0, 6.28), d = rng.range(2, site.r * 0.7);
      place(c, site.x + Math.sin(a) * d, site.z + Math.cos(a) * d, a);
      c.site = site.id;
    }
    return sq;
  };
  const beasts = (species: string, n: number) => {
    const sq = squad(W, 'fauna', 'nest', ANIMAL[species].plural, site.id);
    for (let i = 0; i < n; i++) {
      const c = makeAnimal(W, species, rng, 1 + reg.danger * 0.08);
      W.moveToSquad(c, sq);
      const a = rng.range(0, 6.28), d = rng.range(2, site.r * 0.8);
      place(c, site.x + Math.sin(a) * d, site.z + Math.cos(a) * d, a);
      c.site = site.id;
    }
    return sq;
  };
  // a camp's leader: always there if someone has put a price on them
  const boss = (sq: Squad, fac: string, loadout: string, title: string, anyway: boolean) => {
    const wanted = bountyAt(site.id);
    if (!wanted && !anyway) return;
    const b = makePerson(W, { faction: fac, role: 'boss', loadout, level: rng.range(34, 50), race: wanted?.race }, rng);
    b.title = title;
    W.moveToSquad(b, sq);
    place(b, site.x, site.z);
    b.site = site.id;
    if (wanted) markWanted(b, wanted);
  };
  const danger = reg.danger;
  switch (k) {
    case 'camp_reavers': { const sq = people('reavers', 'bandit', rng.int(4, 7) + danger, undefined, 'Dust Reavers'); boss(sq, 'reavers', 'reavers_boss', 'Reaver Boss', rng.chance(0.5)); break; }
    case 'camp_starvelings': { const sq = people('starvelings', 'bandit', rng.int(5, 10), undefined, 'Starvelings'); boss(sq, 'starvelings', 'starvelings', 'Hunger Chief', false); break; }
    case 'camp_scorched': { const sq = people('scorched', 'bandit', rng.int(4, 8), undefined, 'Scorched Hand'); boss(sq, 'scorched', 'scorched', 'Leaf Baron', false); break; }
    case 'camp_mawkin': { const sq = people('mawkin', 'bandit', rng.int(5, 9), undefined, 'Mawkin Hunters'); boss(sq, 'mawkin', 'mawkin', 'Pit Chief', false); break; }
    case 'mist_camp': people('mistcrawlers', 'bandit', rng.int(5, 10), [22, 40], 'Mistcrawlers'); break;
    case 'blackcomb_nest': people('blackcomb', 'bandit', rng.int(4, 8), [20, 34], 'Blackcomb Drones'); break;
    case 'warden_post': people('wardens', 'construct', rng.int(2, 4), [36, 52], 'Warden Constructs'); break;
    case 'nest_dunehound': beasts('dunehound', rng.int(4, 8)); break;
    case 'nest_skitter': beasts('skitter', rng.int(4, 9)); break;
    case 'nest_hookbeak': beasts('hookbeak', rng.int(1, 3)); break;
    case 'nest_brineclaw': beasts('brineclaw', rng.int(3, 7)); break;
    case 'nest_rustspider': beasts('rustspider', rng.int(3, 6)); break;
    case 'nest_mauler': beasts('mauler', rng.int(1, 3)); break;
    case 'nest_bloodfly': beasts('bloodfly', rng.int(5, 10)); break;
    case 'bat_roost': beasts('carrionbat', rng.int(5, 10)); break;
    case 'caravan': { const sq = people('drifters', 'caravan', rng.int(1, 2), undefined, 'Traders'); people('ironcoin', 'merc', rng.int(2, 4), undefined, 'Caravan Guard'); void sq; break; }
    case 'shack':
    case 'hermit':
    case 'homestead': people('drifters', k === 'homestead' ? 'worker' : 'wanderer', rng.int(1, 3), undefined, 'Locals'); break;
    case 'shrine': people('ember', 'priest', 1, undefined, 'Shrine'); break;
    case 'battlefield': {
      // the dead of both sides, and scavengers
      for (let i = 0; i < rng.int(4, 9); i++) {
        const c = makePerson(W, { faction: rng.pick(['ember', 'karuk', 'reavers', 'concord']), role: 'guard' }, rng);
        const a = rng.range(0, 6.28), d = rng.range(2, site.r);
        place(c, site.x + Math.sin(a) * d, site.z + Math.cos(a) * d, a);
        c.status = 'dead';
        c.body.hp[1] = -c.body.max[1];
        c.site = site.id;
      }
      if (rng.chance(0.6)) beasts('carrionbat', rng.int(3, 6));
      break;
    }
    case 'ruin':
    case 'ruin_tower':
    case 'ruin_dome':
    case 'ruin_lab':
    case 'glass_ruin':
    case 'wreck':
      if (lm?.boss || k === 'ruin_lab') people('wardens', 'construct', rng.int(3, 6), [45, 65], 'Warden Constructs');
      else if (rng.chance(0.35 + danger * 0.08)) {
        if (reg.key === 'rust' || reg.key === 'glass' || k === 'wreck') beasts('rustspider', rng.int(2, 4));
        else if (rng.chance(0.5)) people(rng.pick(['reavers', 'starvelings']), 'bandit', rng.int(3, 6));
        else beasts(rng.pick(reg.fauna.map((f) => f[0]).filter((f) => ANIMAL[f]).concat(['dunehound'])), rng.int(2, 5));
      }
      break;
  }
}

export const _unused = SETTLEMENT;
