// Bounty hunters. A price on one of your people brings someone to collect it:
// the faction that posted it sends a squad of its own. They track their
// quarry across the waste, knock them down and carry them to a cage, or, for
// the slaving powers, to the pens. Pay the bounty, or be caught, and they go
// home.
import { S } from './ctx';
import { Squad } from './squad';
import { Char } from './char';
import { makePerson } from './spawn';
import { RNG } from '../core/rng';
import { FACTION } from '../content/factions';
import { HUNTER_LINES } from '../content/chatter';
import { DAY, HOUR } from './clock';
import { WORLD } from '../world/consts';

const rng = new RNG(8675309);
let lastHour = -1;
let followT = 0;

const NAMES: Record<string, string> = {
  drifters: 'Watch bounty hunters', concord: 'Concord bounty hunters', chainhouse: 'Chainhouse catchers',
  ember: 'Covenant inquisitors', karuk: 'Karuk hunters', thrum: 'Thrum hunters', delvers: 'Delver bounty hunters',
  hollows: 'Hollow wardens', ironcoin: 'Iron Coin collectors', scorched: 'Hand collectors',
};

function hunters(): Squad[] {
  const out: Squad[] = [];
  for (const sq of S.W.squads.values()) if (sq.flags.hunt) out.push(sq);
  return out;
}

/** Whether a squad of a faction is already after someone. */
function hunted(id: number, faction: string) {
  return hunters().some((sq) => sq.flags.hunt === id && sq.faction === faction && sq.members.some((m) => S.W.char(m)?.alive));
}

/** Where a squad can set out from: open ground a long walk from its quarry, away from towns. */
function startPoint(c: Char): [number, number] | null {
  for (let i = 0; i < 30; i++) {
    const a = rng.range(0, Math.PI * 2), d = rng.range(900, 1400);
    const x = c.x + Math.sin(a) * d, z = c.z + Math.cos(a) * d;
    if (x < 60 || z < 60 || x > WORLD - 60 || z > WORLD - 60) continue;
    if (S.T.heightAt(x, z) < 0.4 || S.T.siteAt(x, z, 120)) continue;
    const spot = S.nav.nearestOpen(x, z, 10);
    if (spot) return [spot[0], spot[1]];
  }
  return null;
}

/** Sends a squad after someone. Exported for testing. */
export function dispatchHunters(c: Char, faction: string) {
  const W = S.W;
  const amount = c.bounty[faction] ?? 0;
  const from = startPoint(c);
  if (!from || !FACTION[faction]) return null;
  const sq = new Squad();
  sq.faction = faction; sq.kind = 'bounty'; sq.name = NAMES[faction] ?? `${FACTION[faction].short} bounty hunters`;
  sq.x = from[0]; sq.z = from[1];
  sq.route = [c.x, c.z]; sq.ri = 0;
  sq.born = S.clock.t; sq.ttl = S.clock.t + DAY * 3;
  sq.task = { k: 'hunt', target: c.id };
  sq.flags.spec = 'hunters';
  sq.flags.hunt = c.id;
  W.addSquad(sq);
  const n = Math.min(8, 2 + Math.round(amount / 2500));
  const level = Math.min(50, 12 + amount / 400);
  for (let i = 0; i < n; i++) {
    const m = makePerson(W, { faction, role: 'patrol', level: level * rng.range(0.85, 1.1) }, rng);
    m.title = 'Bounty Hunter';
    m.mem.enemies = [c.id];
    W.moveToSquad(m, sq);
    const spot = S.nav.nearestOpen(from[0] + rng.range(-5, 5), from[1] + rng.range(-5, 5), 12) ?? from;
    m.x = spot[0]; m.z = spot[1]; m.y = S.T.heightAt(m.x, m.z);
    m.homeX = m.x; m.homeZ = m.z;
  }
  W.say(`Word on the road: ${sq.name} are asking after ${c.name}, and the ${amount} chits on their head.`, 'crime', S.clock.t);
  S.fx.notice(`Bounty hunters are after ${c.name}.`, 'bad');
  return sq;
}

/** A hunt that is over: the squad goes home, or out of the waste. */
function giveUp(sq: Squad) {
  const W = S.W;
  sq.flags.hunt = 0;
  for (const id of sq.members) { const m = W.char(id); if (m) m.mem.enemies = []; }
  const home = S.T.nearestSite(sq.x, sq.z, (s) => s.kind === 'town' && s.faction === sq.faction);
  const a = rng.range(0, Math.PI * 2);
  const tx = home ? home.x : sq.x + Math.sin(a) * 1500, tz = home ? home.z : sq.z + Math.cos(a) * 1500;
  sq.route = [tx, tz]; sq.ri = 0;
  sq.task = { k: 'travel', to: home?.id ?? 0, x: tx, z: tz, then: 'despawn' };
}

/** Keeps each squad on the trail, and calls off the hunt when there is nothing left to collect. */
function follow() {
  const W = S.W;
  for (const sq of hunters()) {
    const q = W.char(sq.flags.hunt);
    const owed = q ? q.bounty[sq.faction] ?? 0 : 0;
    if (!q || !q.alive || owed <= 0 || q.cage || (q.shackled && q.mem.enslavedBy)) { giveUp(sq); continue; }
    // beaten: when they can stand again, they go home
    if (sq.members.every((id) => W.char(id)?.status !== 'up')) {
      W.say(`The ${sq.name} who came for ${q.name} were beaten.`, 'good', S.clock.t);
      giveUp(sq);
      continue;
    }
    const end = sq.route && sq.route.length >= 2 ? Math.hypot(sq.route[sq.route.length - 2] - q.x, sq.route[sq.route.length - 1] - q.z) : Infinity;
    if (end > 40) { sq.route = [q.x, q.z]; sq.ri = 0; }
    // the first sight of the quarry
    const lead = W.char(sq.leader);
    if (lead && lead.up && sq.active && !sq.flags.called && Math.hypot(lead.x - q.x, lead.z - q.z) < 35) {
      sq.flags.called = true;
      const line = rng.pick(HUNTER_LINES).replace('{name}', q.name.split(' ')[0]).replace('{faction}', FACTION[sq.faction]?.short ?? 'law').replace('{amount}', String(owed));
      S.fx.say(lead, line);
    }
  }
}

export function tickHunters(dt: number) {
  followT -= dt;
  if (followT <= 0) { followT = 8; follow(); }
  const hour = Math.floor(S.clock.t / HOUR);
  if (hour === lastHour) return;
  lastHour = hour;
  if (S.clock.t < DAY * 2) return; // the first day is your own
  if (hunters().filter((sq) => sq.flags.hunt).length >= 2) return;
  for (const c of S.W.playerChars()) {
    if (!c.alive || c.animal || c.cage || (c.shackled && c.mem.enslavedBy)) continue;
    for (const [f, amount] of Object.entries(c.bounty)) {
      if (amount < 300 || hunted(c.id, f)) continue;
      if (rng.chance(Math.min(0.12, amount / 60000))) { dispatchHunters(c, f); return; }
    }
  }
}
