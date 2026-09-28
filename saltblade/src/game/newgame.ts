// Starting a new game: a fresh world, the player's people and whatever the
// chosen start gives them.
import { G } from '../state';
import { S } from '../sim/ctx';
import { Squad } from '../sim/squad';
import { makePerson, makeAnimal, randomLook } from '../sim/spawn';
import { RNG } from '../core/rng';
import { SETTLEMENT } from '../content/layout';
import { WORLD } from '../world/consts';
import { Char } from '../sim/char';
import { buildStructures } from './world';
import { SCENARIO, Scenario, ScenarioPerson } from '../content/scenarios';
import { Look } from '../sim/look';
import { RACE } from '../content/races';
import { BUILDABLE } from '../content/buildables';
import { canPlace, placeSite, finishSite } from '../sim/base';
import { personName } from '../content/names';
import { LI } from '../sim/body';
import { DAY, HOUR } from '../sim/clock';
import { Site } from '../world/terrain';
import { ITEM } from '../content/items';
import { World } from '../sim/world';
import { postBounties } from '../sim/bounties';

export function placeOres() {
  for (const o of G.T.ores) {
    G.W.addObj({ id: 0, kind: 'ore', def: o.kind, x: o.x, z: o.z, y: o.y, rot: o.rot, owner: '', site: 0, parent: 0, data: { left: Math.round(300 * o.size), size: o.size } });
  }
}

export function playerSquad(name = 'Wanderers'): Squad {
  const s = new Squad();
  s.faction = 'player';
  s.kind = 'player';
  s.name = name;
  G.W.addSquad(s);
  G.W.playerSquads.push(s.id);
  return s;
}

export function addPlayerChar(s: Squad, c: Char) {
  c.faction = 'player';
  c.role = 'player';
  c.title = '';
  G.W.moveToSquad(c, s);
  return c;
}

/** Everything the new-game screen decides. */
export interface NewGameSetup {
  scenario: string;
  faction: string;
  people: { name: string; look: Look; char?: Char }[];
}

/** The default people for a start: random looks the player can then edit. */
export function defaultPeople(sc: Scenario, rng: RNG): { name: string; look: Look }[] {
  return sc.people.map((p) => {
    const race = p.races?.[0] ?? rng.pick(['valefolk', 'valefolk', 'duneborn']);
    const look = randomLook(race, rng, p.female);
    return { name: personName(race, look.female, rng), look };
  });
}

function siteBy(key: string): Site | undefined {
  return G.T.sites.find((s) => s.settlement === key || s.key === key);
}

/** Finds the spot a start begins at. */
function startPoint(sc: Scenario, rng: RNG): [number, number] {
  const st = sc.start;
  if (st.region) {
    for (let i = 0; i < 4000; i++) {
      const x = rng.range(400, WORLD - 400), z = rng.range(400, WORLD - 400);
      if (G.T.regionAt(x, z).key !== st.region) continue;
      if (G.T.siteAt(x, z, 200)) continue;
      if (G.T.heightAt(x, z) < 1 || G.T.slopeAt(x, z) > 0.5) continue;
      const p = G.nav.nearestOpen(x, z, 10);
      if (p) return p;
    }
  }
  const s = siteBy(st.settlement ?? st.landmark ?? 'crossroad') ?? siteBy('crossroad')!;
  const [ox, oz] = st.off ?? [0, 0];
  let x = s.x + ox, z = s.z + oz;
  if (st.inside) {
    // among the fields, where the slaves work
    const f = [...G.W.objs.values()].find((o) => o.kind === 'farm' && o.site === s.id);
    if (f) { x = f.x + 3; z = f.z + 3; }
  }
  return G.nav.nearestOpen(x, z, 30) ?? [x, z];
}

/** A shack, a field, a well and some stores on a flat piece of ground. */
function buildHomestead(x0: number, z0: number, rng: RNG) {
  const rot = rng.range(0, Math.PI * 2);
  const put = (key: string, lx: number, lz: number, r = rot) => {
    const b = BUILDABLE[key];
    if (!b) return null;
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let tries = 0; tries < 30; tries++) {
      const jx = lx + (tries ? rng.range(-3, 3) * (1 + tries / 6) : 0), jz = lz + (tries ? rng.range(-3, 3) * (1 + tries / 6) : 0);
      const x = x0 + jx * c + jz * s, z = z0 - jx * s + jz * c;
      if (!canPlace(b, x, z, r).ok) continue;
      const site = placeSite(b, x, z, r);
      return finishSite(site, true);
    }
    return null;
  };
  put('shack', 0, 0);
  put('farm_wheat', 15, 2);
  put('well', -8, 5);
  const store = put('chest', 3, 7);
  const food = put('food_box', 5, 7);
  put('campfire', -2, 11);
  for (let i = 0; i < 4; i++) put('bedroll', -6 + i * 1.8, 14, rot + Math.PI / 2);
  return { store, food };
}

/** Looks for a flat, open, unclaimed spot near a point. */
function homesteadSpot(x: number, z: number, rng: RNG): [number, number] {
  const b = BUILDABLE.shack;
  for (let r = 0; r < 400; r += 12) {
    for (let k = 0; k < 10; k++) {
      const a = rng.range(0, Math.PI * 2);
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (G.T.slopeAt(px, pz) > 0.18 || G.T.roadAt(px, pz) > 0) continue;
      if (canPlace(b, px, pz, 0).ok && canPlace(BUILDABLE.farm_wheat, px + 15, pz, 0).ok) return [px, pz];
    }
  }
  return [x, z];
}

/** One of the player's starting people, made into a world (a scratch one for the creator's preview). */
export function makePlayerPerson(p: ScenarioPerson, who: { name: string; look: Look }, rng: RNG, W: World = G.W): Char {
  const c = makePerson(W, { faction: 'drifters', role: p.shackled ? 'slave' : 'wanderer', race: who.look.race, level: p.level, loadout: p.loadout }, rng);
  c.look = { ...who.look };
  c.name = who.name.trim() || c.name;
  c.money = 0;
  for (const [id, n] of p.kit ?? []) if (ITEM[id]) { const left = c.inv.add(id, n); if (left && c.eq.back?.inv) c.eq.back.inv.add(id, left); }
  for (const l of p.lost ?? []) { c.body.lost |= 1 << l; c.body.hp[l] = 0; }
  if (p.hurt) for (let l = 0; l < 7; l++) if (c.body.has(l)) c.body.hp[l] = Math.round(c.body.hp[l] * (1 - p.hurt * (l <= LI.chest ? 0.7 : 1)));
  if (p.hurt) c.body.bleed[LI.chest] = 0.05;
  if (p.hunger !== undefined && RACE[c.look.race].hunger > 0) c.hunger = p.hunger;
  c.shackled = !!p.shackled;
  if (p.enslavedBy) c.mem.enslavedBy = p.enslavedBy;
  if (!RACE[c.look.race].boots) c.eq.feet = null;
  if (!RACE[c.look.race].helmets) c.eq.head = null;
  c.dirty = true;
  return c;
}

export function newGame(setup: NewGameSetup | string) {
  const W = G.W;
  const su: NewGameSetup = typeof setup === 'string' ? { scenario: setup, faction: SCENARIO[setup]?.squad ?? 'Nameless', people: [] } : setup;
  const sc = SCENARIO[su.scenario] ?? SCENARIO.wanderer;
  const rng = new RNG(S.rng.next() * 1e9);
  if (!su.people.length) su.people = defaultPeople(sc, rng);
  placeOres();
  buildStructures();
  postBounties();
  S.clock.t = DAY + 7.5 * HOUR;
  W.factionName = su.faction.trim() || sc.squad;
  W.money = sc.money;
  W.flags.scenario = sc.key;
  for (const [f, v] of Object.entries(sc.rel ?? {})) W.rel.add('player', f, v);
  for (const r of sc.research ?? []) W.research.done.add(r);
  const sq = playerSquad(W.factionName);
  let [sx, sz] = startPoint(sc, rng);
  let stores: { store: any; food: any } | null = null;
  if (sc.homestead) {
    [sx, sz] = homesteadSpot(sx, sz, rng);
    stores = buildHomestead(sx, sz, rng);
  }
  const people: Char[] = [];
  sc.people.forEach((p, i) => {
    const who = su.people[i] ?? defaultPeople(sc, rng)[0];
    let c: Char;
    if (who.char && who.char.look.race === who.look.race) {
      // the very person from the creator's preview, gear and all
      c = who.char;
      c.id = 0;
      c.look = { ...who.look };
      c.name = who.name.trim() || c.name;
      c.view = null;
      c.dirty = true;
      W.addChar(c);
    } else c = makePlayerPerson(p, who, rng);
    addPlayerChar(sq, c);
    for (const [f, v] of Object.entries(sc.bounty ?? {})) c.bounty[f] = v;
    const a = (i / Math.max(1, sc.people.length)) * Math.PI * 2;
    const spot = G.nav.nearestOpen(sx + (sc.homestead ? 4 : 0) + Math.cos(a) * (i ? 1.8 : 0), sz + (sc.homestead ? 12 : 0) + Math.sin(a) * (i ? 1.8 : 0), 12) ?? [sx, sz];
    c.x = spot[0]; c.z = spot[1]; c.y = G.T.heightAt(c.x, c.z);
    c.dir = rng.range(0, Math.PI * 2);
    people.push(c);
  });
  if (sc.people.some((p) => p.enslavedBy)) {
    const s = siteBy(sc.start.settlement!);
    for (const c of people) { c.mem.slaveSite = s?.id ?? 0; c.title = ''; }
  }
  // starting goods: into the stores if there are any, else carried
  for (const [id, n] of sc.items ?? []) {
    const d = ITEM[id];
    if (!d) continue;
    const box = d.food && stores?.food ? stores.food : stores?.store;
    let left = n;
    if (box?.inv) left = box.inv.add(id, left);
    for (const c of people) if (left > 0) left = c.inv.add(id, left);
  }
  if (sc.key === 'fight') {
    // test skirmish: Reavers and a pack of hounds nearby
    const bs = new Squad(); bs.faction = 'reavers'; bs.kind = 'camp'; bs.name = 'Reavers'; W.addSquad(bs);
    for (let i = 0; i < 4; i++) {
      const c = makePerson(W, { faction: 'reavers', role: 'bandit' }, rng);
      W.moveToSquad(c, bs);
      const spot = G.nav.nearestOpen(sx + 30 + i * 2, sz + 10, 8) ?? [sx + 30, sz];
      c.x = spot[0]; c.z = spot[1]; c.y = G.T.heightAt(c.x, c.z);
      c.homeX = c.x; c.homeZ = c.z;
    }
    const hs = new Squad(); hs.faction = 'fauna'; hs.kind = 'herd'; hs.name = 'Dunehounds'; W.addSquad(hs);
    for (let i = 0; i < 4; i++) {
      const c = makeAnimal(W, 'dunehound', rng);
      W.moveToSquad(c, hs);
      const spot = G.nav.nearestOpen(sx - 40 + i * 2, sz + 40, 8) ?? [sx - 40, sz];
      c.x = spot[0]; c.z = spot[1]; c.y = G.T.heightAt(c.x, c.z);
      c.homeX = c.x; c.homeZ = c.z;
    }
  }
  const lead = people[0];
  G.cam.lookAt(lead.x, lead.z, sc.homestead ? 45 : 30);
  W.say(`${W.factionName}: ${sc.name}. ${sc.blurb}`, 'story', S.clock.t);
  void SETTLEMENT;
}
