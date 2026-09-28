// The Pit at Hornspire: pay the Pit Master, step into the ring and fight a
// Karuk until one of you drops. Nobody dies in the Pit if the Master can
// help it. Win and the purse is yours; win enough and the Horn King hears.
import { S } from './ctx';
import { Char } from './char';
import { Squad } from './squad';
import { makePerson } from './spawn';
import { RNG } from '../core/rng';
import type { TownInfo } from '../world/towns';
import type { World } from './world';
import type { Order } from './char';
import { leaveFurniture } from './use';

export interface PitTier { name: string; fee: number; purse: number; level: number; loadout: string; title: string; needs?: number; }
export const PIT_TIERS: PitTier[] = [
  { name: 'A novice bout', fee: 100, purse: 400, level: 16, loadout: 'karuk_resident', title: 'Pit Novice' },
  { name: 'A veteran bout', fee: 300, purse: 1500, level: 32, loadout: 'karuk_guard', title: 'Pit Veteran', needs: 0 },
  { name: 'The Champion of the Pit', fee: 1000, purse: 6000, level: 55, loadout: 'karuk_guard', title: 'Champion of the Pit', needs: 1 },
];

const rng = new RNG((Date.now() ^ 4711) >>> 0); // a different world story each game

/** Gives one of your people an order, as a click would. */
function issue(c: Char, o: Order) {
  if (c.bed || c.mem.using) leaveFurniture(c);
  c.mem.sit = false;
  c.order = o;
  c.path = null;
  c.hasGoal = false;
}
let t = 0;

function pitSite() { return S.T.sites.find((s) => s.settlement === 'hornspire'); }

/** Where the ring is: the arena in the middle of Hornspire. */
export function ring(): { x: number; z: number; r: number } | null {
  const site = pitSite();
  if (!site) return null;
  const arena = [...S.W.objs.values()].find((o) => o.def === 'arena' && o.site === site.id);
  return arena ? { x: arena.x, z: arena.z, r: arena.data?.r ?? 10 } : { x: site.x, z: site.z, r: 10 };
}

/** The Pit Master, placed as Hornspire fills with people. */
export function placePitMaster(W: World, info: TownInfo) {
  if (info.site.settlement !== 'hornspire' || W.flags.pitMaster) return;
  const rg = ring();
  if (!rg) return;
  const m = makePerson(W, { faction: 'karuk', role: 'guard', race: 'karuk', level: 40, loadout: 'karuk_guard' }, rng);
  m.title = 'Pit Master';
  m.dialogue = 'arena';
  m.site = info.site.id;
  const sq = new Squad(); sq.faction = 'karuk'; sq.kind = 'town'; sq.name = 'The Pit'; sq.site = info.site.id; W.addSquad(sq);
  W.moveToSquad(m, sq);
  const spot = S.nav.nearestOpen(rg.x + rg.r + 1.5, rg.z, 6) ?? [rg.x + rg.r + 1.5, rg.z];
  m.x = spot[0]; m.z = spot[1]; m.y = S.T.heightAt(m.x, m.z);
  m.homeX = m.x; m.homeZ = m.z; m.dir = m.homeDir = Math.atan2(rg.x - m.x, rg.z - m.z);
  W.flags.pitMaster = m.id;
}

export const boutRunning = () => !!S.W.flags.bout;
export const pitWins = (): number => S.W.flags.pitWins ?? -1; // highest tier won
export function tierOpen(i: number) { const tr = PIT_TIERS[i]; return tr.needs === undefined || pitWins() >= tr.needs; }

/** Starts a bout for one of your people. Returns why not, or null. */
export function startBout(p: Char, i: number): string | null {
  const W = S.W;
  const tier = PIT_TIERS[i];
  const rg = ring();
  if (!tier || !rg) return 'There is no bout like that.';
  if (boutRunning()) return 'Wait your turn. There is blood in the ring already.';
  if (W.money < tier.fee) return `The entry is ${tier.fee} chits.`;
  if (p.status !== 'up' || p.body.total() < 0.6) return 'Heal first. I do not sell tickets to a funeral.';
  W.money -= tier.fee;
  const o = makePerson(W, { faction: 'karuk', role: 'merc', race: 'karuk', level: tier.level, loadout: tier.loadout }, rng);
  o.title = tier.title;
  const sq = new Squad(); sq.faction = 'karuk'; sq.kind = 'town'; sq.name = 'Pit Fighters'; sq.site = pitSite()?.id ?? 0; W.addSquad(sq);
  W.moveToSquad(o, sq);
  const a = rng.range(0, Math.PI * 2);
  const spot = S.nav.nearestOpen(rg.x + Math.sin(a) * 3, rg.z + Math.cos(a) * 3, 5) ?? [rg.x, rg.z];
  o.x = spot[0]; o.z = spot[1]; o.y = S.T.heightAt(o.x, o.z);
  o.homeX = o.x; o.homeZ = o.z;
  o.mem.bout = p.id;
  o.mem.enemies = [p.id];
  p.mem.bout = o.id;
  W.flags.bout = { p: p.id, o: o.id, tier: i, t0: S.clock.t };
  issue(p, { k: 'move', x: rg.x - Math.sin(a) * 3, z: rg.z - Math.cos(a) * 3 });
  S.W.say(`${p.name} stepped into the Pit against ${o.name}, ${tier.title}.`, 'story', S.clock.t);
  S.fx.notice(`${tier.name}: ${p.name} against ${o.name}. Fight!`, 'info');
  S.fx.sound('bell', rg.x, rg.z, 1);
  return null;
}

function endBout(o: Char | undefined, p: Char | undefined) {
  const W = S.W;
  if (o) { o.mem.enemies = []; delete o.mem.bout; o.brain.enemy = 0; o.mem.leaveAt = S.clock.t + 1800; W.flags.pitLeavers = [...(W.flags.pitLeavers ?? []), o.id]; }
  if (p) { delete p.mem.bout; p.brain.enemy = 0; if (p.order?.k === 'attack') p.order = null; }
  delete W.flags.bout;
}

export function tickArena(dt: number) {
  t -= dt;
  if (t > 0) return;
  t = 0.5;
  const W = S.W;
  // beaten fighters are carried off after a while
  if (W.flags.pitLeavers?.length) {
    W.flags.pitLeavers = W.flags.pitLeavers.filter((id: number) => {
      const c = W.char(id);
      if (!c) return false;
      if (S.clock.t < (c.mem.leaveAt ?? 0)) return true;
      W.removeChar(c);
      return false;
    });
  }
  const b = W.flags.bout;
  if (!b) return;
  const p = W.char(b.p), o = W.char(b.o);
  const tier = PIT_TIERS[b.tier];
  const rg = ring();
  if (!p || !o || !rg) { endBout(o, p); return; }
  if (o.status !== 'up') {
    W.money += tier.purse;
    W.flags.pitWins = Math.max(pitWins(), b.tier);
    W.rel.add('player', 'karuk', 4 + b.tier * 4);
    S.W.say(`${p.name} beat ${o.name} in the Pit and took the purse of ${tier.purse} chits.`, 'good', S.clock.t);
    S.fx.notice(`${p.name} wins! The purse: ${tier.purse} chits.`, 'good');
    S.fx.sound('coin', p.x, p.z, 1);
    if (b.tier === PIT_TIERS.length - 1) {
      p.title = 'Champion of the Pit';
      W.rel.add('player', 'karuk', 10);
      S.fx.notice(`The Horn King has heard of ${p.name}, Champion of the Pit.`, 'good');
    }
    endBout(o, p);
  } else if (p.status !== 'up') {
    S.W.say(`${p.name} was beaten in the Pit by ${o.name}.`, 'bad', S.clock.t);
    S.fx.notice(`${p.name} is beaten. The crowd roars for ${o.name}.`, 'bad');
    W.rel.add('player', 'karuk', 1); // a brave loss is still respected
    endBout(o, p);
  } else if (Math.hypot(p.x - rg.x, p.z - rg.z) > rg.r + 60) {
    S.fx.notice(`${p.name} ran from the Pit. The crowd jeers.`, 'bad');
    W.rel.add('player', 'karuk', -3);
    endBout(o, p);
  } else if (!p.order && !p.brain.enemy && Math.hypot(p.x - rg.x, p.z - rg.z) < rg.r + 2) {
    // in the ring: fight
    issue(p, { k: 'attack', id: o.id });
  }
}
