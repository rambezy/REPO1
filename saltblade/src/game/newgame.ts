// Starting a new game: the player's people, their purse, and the world's
// first inhabitants.
import { G } from '../state';
import { S } from '../sim/ctx';
import { Squad } from '../sim/squad';
import { makePerson, makeAnimal, equip, setSkills } from '../sim/spawn';
import { makeItem } from '../sim/inventory';
import { RNG } from '../core/rng';
import { SETTLEMENT } from '../content/layout';
import { WORLD } from '../world/consts';
import { SK } from '../sim/skills';
import { Char } from '../sim/char';
import { buildStructures } from './world';

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

export function newGame(scenario: string) {
  const W = G.W;
  const rng = new RNG(S.rng.next() * 1e9);
  placeOres();
  buildStructures();
  const cr = SETTLEMENT.crossroad;
  const cx = cr.u * WORLD, cz = cr.v * WORLD;
  const sq = playerSquad();
  if (scenario === 'fight') {
    W.money = 1000;
    const ox = cx + 260, oz = cz + 80;
    for (let i = 0; i < 3; i++) {
      const c = makePerson(W, { faction: 'drifters', role: 'merc', level: 22 }, rng);
      addPlayerChar(sq, c);
      const spot = G.nav.nearestOpen(ox + i * 1.6, oz, 8) ?? [ox, oz];
      c.x = spot[0]; c.z = spot[1]; c.y = G.T.heightAt(c.x, c.z);
      c.inv.add('first_aid', 2);
      c.inv.add('dried_meat', 3);
    }
    // bandits nearby
    const bs = new Squad(); bs.faction = 'reavers'; bs.kind = 'camp'; bs.name = 'Reavers'; W.addSquad(bs);
    for (let i = 0; i < 4; i++) {
      const c = makePerson(W, { faction: 'reavers', role: 'bandit' }, rng);
      W.moveToSquad(c, bs);
      const spot = G.nav.nearestOpen(ox + 30 + i * 2, oz + 10, 8) ?? [ox + 30, oz];
      c.x = spot[0]; c.z = spot[1]; c.y = G.T.heightAt(c.x, c.z);
      c.homeX = c.x; c.homeZ = c.z;
    }
    const hs = new Squad(); hs.faction = 'fauna'; hs.kind = 'herd'; hs.name = 'Dunehounds'; W.addSquad(hs);
    for (let i = 0; i < 4; i++) {
      const c = makeAnimal(W, 'dunehound', rng);
      W.moveToSquad(c, hs);
      const spot = G.nav.nearestOpen(ox - 40 + i * 2, oz + 40, 8) ?? [ox - 40, oz];
      c.x = spot[0]; c.z = spot[1]; c.y = G.T.heightAt(c.x, c.z);
      c.homeX = c.x; c.homeZ = c.z;
    }
    G.cam.lookAt(ox + 10, oz + 5, 40);
    return;
  }
  // the Wanderer: one person, a thousand chits, a road
  W.money = 1000;
  const c = makePerson(W, { faction: 'drifters', role: 'wanderer', race: 'valefolk', level: 8 }, rng);
  addPlayerChar(sq, c);
  const spot = G.nav.nearestOpen(cx + 160, cz + 40, 10) ?? [cx + 160, cz];
  c.x = spot[0]; c.z = spot[1]; c.y = G.T.heightAt(c.x, c.z);
  G.cam.lookAt(c.x, c.z, 30);
  void equip; void makeItem; void setSkills; void SK;
}
