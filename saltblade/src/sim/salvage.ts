// Scrapping downed machines for parts, and rewriting their orders so they
// serve you instead. Robotics makes a better scavenger and the only kind of
// hacker there is.
import { Char } from './char';
import { S } from './ctx';
import { ITEM } from '../content/items';
import { train, versus } from './train';
import { emit } from '../core/events';
import { machineSay } from './machines';
import { clamp } from '../core/math';

/** What each kind of machine is worth in parts: [item, min, max, chance]. Rare finds grow with robotics. */
const PARTS: Record<string, [string, number, number, number][]> = {
  sentinel: [['servo_motor', 1, 2, 1], ['elec_parts', 1, 2, 1], ['energy_cell', 2, 5, 1], ['iron_plates', 1, 3, 1], ['maker_optic', 1, 1, 0.2], ['sentinel_arm', 1, 1, 0.08]],
  construct: [['servo_motor', 1, 2, 1], ['machine_parts', 1, 3, 1], ['steel_bars', 1, 2, 0.7], ['maker_optic', 1, 1, 0.15], ['warden_arm', 1, 1, 0.04], ['warden_leg', 1, 1, 0.04]],
  hollow: [['servo_motor', 0, 1, 1], ['elec_parts', 1, 1, 1], ['iron_plates', 1, 2, 1]],
  sawdrone: [['servo_motor', 0, 1, 1], ['elec_parts', 1, 1, 1], ['energy_cell', 1, 2, 0.6], ['drone_arm', 1, 1, 0.1]],
  warbot: [['servo_motor', 2, 3, 1], ['machine_parts', 2, 4, 1], ['energy_cell', 3, 8, 1], ['maker_optic', 1, 1, 0.35], ['power_core', 1, 1, 0.25], ['strider_leg', 1, 1, 0.1]],
  rustspider: [['machine_parts', 0, 1, 1], ['iron_plates', 1, 2, 1], ['servo_motor', 1, 1, 0.3]],
  scrapcrawler: [['iron_plates', 0, 1, 1], ['machine_parts', 0, 1, 1], ['servo_motor', 1, 1, 0.2]],
};

/** Robotics needed to rewrite each machine, and the electrical components it takes. */
const HACK: Record<string, [number, number]> = { sawdrone: [10, 1], scrapcrawler: [12, 1], rustspider: [18, 1], sentinel: [25, 2], construct: [40, 2], warbot: [50, 3] };

/** Which kind of machine this is, for salvage and hacking. */
export function machineKind(t: Char): string | null {
  const k = t.animal || t.look.race;
  return PARTS[k] ? k : null;
}

/** A downed (or destroyed) machine not of yours can be stripped. */
export const canSalvage = (t: Char) => t.robot && t.status !== 'up' && t.faction !== 'player' && !!machineKind(t) && !t.carriedBy;
/** Robotics and electrical components a machine takes to rewrite. */
export function hackNeed(t: Char): [number, number] | null { const k = machineKind(t); return k ? HACK[k] ?? null : null; }
/** A machine that is only knocked out, and answers to no people, can be given new orders. */
export const canReprogram = (t: Char) => t.robot && t.status === 'ko' && !!hackNeed(t) && !t.carriedBy && (t.faction === 'machines' || t.faction === 'wardens' || t.faction === 'fauna');

function give(c: Char, id: string, n: number) {
  let left = c.inv.add(id, n);
  if (left && c.eq.back?.inv) left = c.eq.back.inv.add(id, left);
  if (left) emit('world:drop', c.x, c.z, [{ uid: 0, id, q: 2, n: left, x: 0, y: 0 }]);
}

function countParts(c: Char) { return c.inv.count('elec_parts') + (c.eq.back?.inv?.count('elec_parts') ?? 0); }
function takeParts(c: Char, n: number) { n -= c.inv.take('elec_parts', n); if (n > 0) c.eq.back?.inv?.take('elec_parts', n); }

/** One step of stripping a machine: true when it is done. */
export function workSalvage(c: Char, t: Char, dt: number): boolean {
  c.act = 'craft'; c.actDur = 1.4;
  if (c.brain.salvId !== t.id) { c.brain.salvId = t.id; c.brain.salvT = 0; } // a new wreck starts from nothing
  c.brain.salvT = (c.brain.salvT ?? 0) + dt;
  const need = 9 - Math.min(5, c.skill('robotics') * 0.08);
  if (c.brain.salvT < need) {
    if (S.rng.chance(dt * 1.6)) S.fx.burst('sparks', t.x, t.y + 0.35, t.z, 4);
    if (S.rng.chance(dt * 0.9)) S.fx.sound('mine', t.x, t.z, 0.4);
    return false;
  }
  c.brain.salvT = 0;
  const k = machineKind(t)!;
  const skill = c.skill('robotics'), eng = c.skill('engineering');
  const got: string[] = [];
  for (const [id, a, b, p] of PARTS[k]) {
    const chance = p >= 1 ? 1 : Math.min(0.9, p * (1 + skill / 40 + eng / 80));
    if (!S.rng.chance(chance)) continue;
    const n = S.rng.int(a, b) + (p >= 1 && S.rng.chance(skill / 100) ? 1 : 0);
    if (n <= 0) continue;
    give(c, id, n);
    got.push(n > 1 ? `${n} ${ITEM[id].name}` : ITEM[id].name);
  }
  // whatever it carried falls where it lay
  if (t.inv.items.length) emit('world:drop', t.x, t.z, t.inv.items.slice());
  train(c, 'robotics', 1.5, versus(skill, 20));
  train(c, 'engineering', 0.5, 1);
  S.fx.burst('sparks', t.x, t.y + 0.4, t.z, 24);
  S.fx.burst('smoke', t.x, t.y + 0.4, t.z, 8);
  S.fx.sound('robothit', t.x, t.z, 1);
  S.fx.notice(`${c.name} stripped the ${t.name} for parts: ${got.join(', ') || 'nothing worth keeping'}.`, got.length ? 'good' : 'info');
  S.W.flags.salvaged = (S.W.flags.salvaged ?? 0) + 1;
  S.W.removeChar(t);
  return true;
}

/** One step of rewriting a downed machine's orders: true when done, whichever way it went. */
export function workReprogram(c: Char, t: Char, dt: number): boolean {
  const [lvl, parts] = hackNeed(t)!;
  const skill = c.skill('robotics');
  if (skill < lvl) { S.fx.notice(`${c.name} needs Robotics ${lvl} to rewrite the ${t.name} (has ${Math.floor(skill)}).`, 'info'); return true; }
  if (countParts(c) < parts) { S.fx.notice(`Rewriting the ${t.name} takes ${parts} Electrical Components.`, 'info'); return true; }
  c.act = 'craft'; c.actDur = 1.4;
  if (c.brain.hackId !== t.id) { c.brain.hackId = t.id; c.brain.hackT = 0; }
  c.brain.hackT = (c.brain.hackT ?? 0) + dt;
  if (S.rng.chance(dt * 1.5)) S.fx.sound('beep', t.x, t.z, 0.5);
  if (S.rng.chance(dt)) S.fx.burst('sparks', t.x, t.y + 0.5, t.z, 3);
  if (c.brain.hackT < 10) return false;
  c.brain.hackT = 0;
  takeParts(c, parts);
  const p = clamp(0.35 + (skill - lvl) * 0.03, 0.1, 0.95);
  train(c, 'robotics', 2.5, versus(skill, lvl));
  wake(t);
  if (S.rng.chance(p)) join(c, t);
  else {
    // it comes back up with its old orders
    t.lastHitBy = c.id;
    t.lastHitT = S.time;
    S.fx.notice(`The ${t.name} rebooted with its old orders!`, 'bad');
    S.fx.sound('beep', t.x, t.z, 1);
    machineSay(t, 'engage');
  }
  return true;
}

/** Back on its feet, its vitals patched just enough to stay up. */
function wake(t: Char) {
  for (const l of [0, 1, 2]) if (t.body.has(l)) t.body.hp[l] = Math.max(t.body.hp[l], t.body.max[l] * 0.35);
  t.status = 'up';
  t.body.koT = 0;
  t.dirty = true;
}

function join(c: Char, t: Char) {
  const sq = S.W.squadOf(c);
  if (!sq) return;
  t.faction = 'player';
  t.role = t.animal ? 'animal' : 'player';
  t.title = '';
  t.brain = {};
  t.order = null;
  t.mem.reprogrammed = true;
  S.W.moveToSquad(t, sq);
  S.W.flags.reprogrammed = (S.W.flags.reprogrammed ?? 0) + 1;
  S.W.say(`${c.name} rewrote the ${t.name}. It serves ${S.W.factionName} now.`, 'good', S.clock.t);
  S.fx.notice(`${t.name} is yours now.`, 'good');
  machineSay(t, 'friend', true);
  emit('squad');
}
