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
import { seedWorld } from './world';
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
import { makeItem } from '../sim/inventory';
import { World } from '../sim/world';
import { postBounties } from '../sim/bounties';
import { beginObjectives, firstGoalSite, welcomingTown } from '../ui/objectives';
import { populateTown } from '../sim/populate';
import type { TownInfo } from '../world/towns';
import { clamp } from '../core/math';

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
    const race = p.races ? rng.pick(p.races) : rng.pick(['valefolk', 'valefolk', 'duneborn']);
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
  if (st.region && (st.settlement || st.landmark)) {
    // the nearest good ground of that region to a place
    const s0 = siteBy(st.settlement ?? st.landmark!);
    if (s0) {
      const [ox, oz] = st.off ?? [0, 0];
      const cx = s0.x + ox, cz = s0.z + oz;
      for (let r = 0; r < 3000; r += 40) {
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2 + r * 0.01;
          const x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
          if (G.T.regionAt(x, z).key !== st.region || G.T.siteAt(x, z, 150)) continue;
          if (G.T.heightAt(x, z) < 1 || G.T.slopeAt(x, z) > 0.3) continue;
          const p = G.nav.nearestOpen(x, z, 8);
          if (p) return p;
        }
      }
    }
  }
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
  const c = makePerson(W, { faction: 'drifters', role: p.shackled ? 'slave' : p.role ?? 'wanderer', race: who.look.race, level: p.level, loadout: p.loadout, whole: true }, rng);
  c.look = { ...who.look };
  c.name = who.name.trim() || c.name;
  c.money = 0;
  // nobody begins with a habit: whatever the loadout rolled in the way of drugs stays behind
  for (const g of [c.inv, c.eq.back?.inv]) if (g) for (const it of g.items.filter((i) => ITEM[i.id]?.drug)) g.remove(it);
  for (const [id, n] of p.kit ?? []) if (ITEM[id]) { const left = c.inv.add(id, n); if (left && c.eq.back?.inv) c.eq.back.inv.add(id, left); }
  // a weapon the scenario promises: in hand, whatever the loadout rolled going to the spare slot or the pack
  if (p.weapon && ITEM[p.weapon] && c.eq.weapon?.id !== p.weapon) {
    const had = c.eq.weapon;
    c.eq.weapon = makeItem(p.weapon, 1, 1 + Math.floor(rng.next() * 2));
    if (had) { if (!c.eq.weapon2) c.eq.weapon2 = had; else if (!c.inv.put(had)) c.eq.back?.inv?.put(had); }
  }
  for (const l of p.lost ?? []) { c.body.lost |= 1 << l; c.body.hp[l] = 0; }
  for (const [l, id] of p.prost ?? []) if (ITEM[id]?.limb) { c.body.lost |= 1 << l; c.body.prost[l] = id; c.body.hp[l] = c.body.max[l]; }
  if (p.hurt) for (let l = 0; l < 7; l++) if (c.body.has(l)) c.body.hp[l] = Math.round(c.body.hp[l] * (1 - p.hurt * (l <= LI.chest ? 0.7 : 1)));
  if (p.hurt) c.body.bleed[LI.chest] = 0.25; // a wound that will not close by itself for a good while
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
  seedWorld(); // (and the houses for sale)
  postBounties();
  S.clock.t = DAY + 7.5 * HOUR;
  W.factionName = su.faction.trim() || sc.squad;
  W.money = sc.money;
  W.flags.scenario = sc.key;
  W.flags.hints = []; // the start cards this game has shown (see ui/hints)
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
  if (sc.ally) placeAlly(sc.ally, rng);
  const lead = people[0];
  // a clear first day where you begin, whatever the region had brewing
  S.weather.calm(lead.x, lead.z);
  W.flags.clearAir = S.clock.t + 10 * HOUR; // and clean air, for the first look at the world (see game.ts skyAndWeather)
  openingView(lead, sc);
  beginObjectives(sc.key);
  W.say(`${W.factionName}: ${sc.name}. ${sc.blurb}`, 'story', S.clock.t);
  void SETTLEMENT;
}

/**
 * Someone the start promises at a town's bar (see Scenario ally): the town filled in now (it would be,
 * once they were near), and the one waiting there sat on a stool nobody else has, ready to join.
 */
function placeAlly(a: NonNullable<Scenario['ally']>, rng: RNG) {
  const W = G.W;
  const site = siteBy(a.at);
  const info = site ? (W.towns.get(site.id) as TownInfo | undefined) : undefined;
  if (!site || !info) return;
  populateTown(W, info);
  const seats = info.bars.flatMap((b) => b.seats).filter(([, , , sid]) => !sid || !W.objs.get(sid)?.user);
  const open = G.nav.nearestOpen(site.x, site.z, 20) ?? [site.x, site.z];
  const seat: [number, number, number, number] = seats.length ? rng.pick(seats) : [open[0], open[1], 0, 0];
  const town = [...W.squads.values()].find((q) => q.kind === 'town' && q.site === site.id && q.faction === site.faction);
  const c = makePerson(W, { faction: 'drifters', role: 'recruit', race: a.races ? rng.pick(a.races) : undefined, female: a.female, level: a.level, loadout: a.loadout, whole: true }, rng);
  if (town) W.moveToSquad(c, town);
  const [x, z, rot, sid] = seat;
  c.x = x; c.z = z; c.y = G.T.heightAt(x, z); c.homeX = x; c.homeZ = z; c.dir = rot; c.homeDir = rot;
  const stool = sid ? W.objs.get(sid) : undefined;
  if (stool) { c.mem.sit = true; c.mem.seat = stool.id; c.mem.using = stool.id; stool.user = c.id; }
  c.site = site.id;
  c.recruitable = true;
  c.price = a.price;
  c.mem.backstory = a.story;
}

/**
 * The opening view: the title screen's wandering angle is dropped for a level
 * camera behind your people, looking toward the gate of the town the start's
 * first goal sends them to (else the nearest town they can walk into: not a
 * cannibal village, not one with their faces on its walls), so both they and
 * the way to go are on screen.
 */
function openingView(lead: Char, sc: Scenario) {
  const W = G.W;
  const town = firstGoalSite(sc.key, lead.x, lead.z) ?? G.T.nearestSite(lead.x, lead.z, welcomingTown) ?? G.T.nearestSite(lead.x, lead.z, (s) => s.kind === 'town');
  let gx = town?.x ?? lead.x, gz = town?.z ?? lead.z;
  if (town) {
    let bd = Infinity;
    for (const o of W.objs.values()) {
      if (o.kind !== 'gate' || o.site !== town.id) continue;
      const d = Math.hypot(o.x - lead.x, o.z - lead.z);
      if (d < bd) { bd = d; gx = o.x; gz = o.z; }
    }
  }
  const dx = gx - lead.x, dz = gz - lead.z, d = Math.hypot(dx, dz);
  const cam = G.cam;
  cam.follow = null;
  // the camera sits behind your people (forward is -sin yaw, -cos yaw), looking along the line to the gate
  cam.yaw = cam.wantYaw = d > 1 ? Math.atan2(-dx, -dz) : 0.7;
  // flatter the farther the gate, so it stays under the top of the picture
  cam.pitch = cam.wantPitch = sc.homestead ? 0.56 : clamp(0.5 - d / 2000, 0.42, 0.5);
  const dist = sc.homestead ? 48 : 40;
  cam.dist = cam.wantDist = dist;
  // a near gate pulls the view a little toward itself; a far one leaves your people in the middle, whatever the ground does
  const ahead = d > 1 && d < 200 ? Math.min(8, d * 0.1) : 0;
  cam.lookAt(lead.x + (dx / (d || 1)) * ahead, lead.z + (dz / (d || 1)) * ahead, dist);
  cam.target.y = G.T.heightAt(cam.target.x, cam.target.z);
  // alone, the one person is the story: the view keeps with them until the player moves it
  if (W.playerChars().length === 1) cam.follow = () => (lead.alive ? lead : null);
}
