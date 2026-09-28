// Character AI. Every few tenths of a second each active character decides
// what to do: follow the player's order, fight, flee, help the fallen, carry
// captives, loot, or get on with its routine. The chosen behaviour then runs
// every step.
import { Char } from './char';
import { S } from './ctx';
import { hostile, dist, reach, startAttack, tickAttack, canShoot, shoot, rangedStats, strengthOf } from './combat';
import { goTo, stop, near } from './move';
import { ANIMAL } from '../content/animals';
import { FACTION } from '../content/factions';
import { ITEM } from '../content/items';
import { findMedkit, worstLimb, treatLimb, dropCarried } from './health';
import { angleTo } from '../core/math';
import { LI } from './body';
import { runOrder } from './orders';
import { runRoutine } from './routine';
import { runJobs } from './jobs';
import { wantsToTalk } from './encounters';

export const SIGHT_DAY = 42;
export const SIGHT_NIGHT = 24;

/** How far a character notices others, reduced at night and by sneaking. */
export function canSee(c: Char, o: Char): boolean {
  const d = dist(c, o);
  let r = S.clock.isNight ? SIGHT_NIGHT : SIGHT_DAY;
  if (c.animal) r = Math.max(r, ANIMAL[c.animal].aggro);
  if (o.move === 'sneak' && o.speed < 3 && o.up) {
    const stealth = o.skill('stealth') * (1 - o.armourPenalty('stealth'));
    const per = c.skill('perception') + 10;
    r *= Math.max(0.12, 0.9 - (stealth - per * 0.5) * 0.012);
    // from behind is harder
    const facing = Math.abs(((angleTo(c.x, c.z, o.x, o.z) - c.dir + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (facing > 1.8) r *= 0.55;
  }
  if (!c.awake) r *= 0.15;
  return d <= r;
}

/** Nearest visible enemy within a radius. */
export function findEnemy(c: Char, radius: number): Char | null {
  let best: Char | null = null, bd = Infinity;
  const onlyUp = !(c.animal && ANIMAL[c.animal].eatsDowned);
  S.W.hash.near(c.x, c.z, radius, (o, d2) => {
    if (o === c || !o.alive || o.carriedBy || o.cage) return;
    if (onlyUp && o.status !== 'up') return;
    if (!hostile(c, o)) return;
    if (!canSee(c, o) && o.lastHitBy !== c.id && c.lastHitBy !== o.id) return;
    let d = d2;
    if (o.status !== 'up') d *= 4; // prefer those still fighting
    if (o.id === c.lastHitBy && S.time - c.lastHitT < 8) d *= 0.3;
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}

export function allies(c: Char, radius: number): Char[] {
  const out: Char[] = [];
  S.W.hash.near(c.x, c.z, radius, (o) => {
    if (o !== c && o.up && (o.squad === c.squad || o.faction === c.faction)) out.push(o);
  });
  return out;
}

/** Runs a fight with a target: close in, strike, or shoot. */
export function fight(c: Char, t: Char, dt: number) {
  c.target = t.id;
  c.drawn = true;
  if (c.knockT > 0 || c.stagger > 0) return;
  const d = dist(c, t);
  if (c.atk) return;
  // crossbows at range
  if (!c.animal && canShoot(c) && d > 5 && d < (rangedStats(c)?.range ?? 0) * 0.95) {
    stop(c);
    c.dir = angleTo(c.x, c.z, t.x, t.z);
    if (c.reload <= 0) shoot(c, t);
    return;
  }
  const r = reach(c);
  if (d <= r) {
    stop(c);
    c.dir = angleTo(c.x, c.z, t.x, t.z);
    if (c.atkCD <= 0 && c.canUseWeapon()) startAttack(c, t, !c.animal && c.weaponStats().kind === 'unarmed' && S.rng.chance(0.25));
    else if (c.atkCD <= 0 && !c.canUseWeapon() && !c.animal) startAttack(c, t, true); // kick
  } else if (!c.holdPos || d < 6) {
    // approach to just inside reach
    const a = angleTo(t.x, t.z, c.x, c.z);
    goTo(c, t.x + Math.sin(a) * (r * 0.7), t.z + Math.cos(a) * (r * 0.7));
    c.move = 'run';
  }
}

/** Flee away from a point. */
export function flee(c: Char, fx: number, fz: number) {
  const a = angleTo(fx, fz, c.x, c.z) + S.rng.range(-0.4, 0.4);
  goTo(c, c.x + Math.sin(a) * 40, c.z + Math.cos(a) * 40);
  c.move = 'run';
  c.drawn = false;
}

/** Main per-step AI entry. */
export function tickAI(c: Char, dt: number) {
  if (c.atkCD > 0) c.atkCD -= dt;
  if (c.stagger > 0) c.stagger -= dt;
  if (c.knockT > 0) { c.knockT -= dt; if (c.knockT <= 0) { c.knockT = 0; } }
  if (c.atk) tickAttack(c, dt);
  if (c.status !== 'up' || c.carriedBy || c.cage) return;
  c.thinkT -= dt;
  const think = c.thinkT <= 0;
  if (think) c.thinkT = 0.3 + S.rng.next() * 0.3;
  if (c.faction === 'player') playerAI(c, dt, think);
  else npcAI(c, dt, think);
}

// ---------------------------------------------------------------- player characters
function playerAI(c: Char, dt: number, think: boolean) {
  const B = c.brain;
  if (think) {
    // fight back or engage enemies depending on stance
    const threatR = c.combatMode === 'aggressive' ? 22 : c.combatMode === 'defensive' ? 8 : 0;
    let enemy: Char | null = null;
    const attacker = S.W.char(c.lastHitBy);
    if (attacker && attacker.up && S.time - c.lastHitT < 6 && c.combatMode !== 'passive' && hostileOrProvoked(c, attacker)) enemy = attacker;
    if (!enemy && threatR > 0 && (!c.order || c.order.k === 'hold' || c.order.k === 'follow')) enemy = findEnemy(c, threatR);
    // help squadmates in trouble
    if (!enemy && c.combatMode === 'aggressive' && (!c.order || c.order.k === 'follow' || c.order.k === 'hold')) {
      for (const m of S.W.squadOf(c)?.members ?? []) {
        const a = S.W.char(m);
        if (!a || a === c || !a.up) continue;
        const foe = S.W.char(a.target);
        if (foe && foe.up && a.atk && dist(c, a) < 30) { enemy = foe; break; }
      }
    }
    B.enemy = enemy ? enemy.id : 0;
  }
  const order = c.order;
  if (order && order.k === 'attack') {
    const t = S.W.char(order.id);
    if (!t || !t.alive || (t.status !== 'up' && !B.finish)) { c.order = null; }
    else { fight(c, t, dt); return; }
  }
  const enemy = S.W.char(B.enemy);
  if (enemy && enemy.alive && (enemy.up || (enemy.status === 'ko' && B.finish === enemy.id)) && (!order || order.k === 'hold' || order.k === 'follow' || order.k === 'use' || order.k === 'mine' || order.k === 'build' || order.k === 'operate')) {
    if (c.carrying) dropCarried(c);
    if (order && order.k !== 'hold' && order.k !== 'follow') { c.jobs.length && (B.resumeJob = true); }
    fight(c, enemy, dt);
    return;
  }
  c.target = 0;
  if (!B.enemy && c.drawn && S.time - c.lastHitT > 6) c.drawn = false;
  if (order) { runOrder(c, dt); return; }
  if (c.jobs.length && runJobs(c, dt, think)) return;
  // idle: eat when hungry, patch yourself up
  if (think) idleUpkeep(c);
}

function hostileOrProvoked(c: Char, a: Char) {
  return hostile(c, a) || a.target === c.id || a.lastHitBy !== 0;
}

/** Eating and self-care for idle characters. */
export function idleUpkeep(c: Char) {
  if (c.hunger < 150 && !c.robot && !c.animal) eatSomething(c);
}

export function eatSomething(c: Char): boolean {
  for (const g of [c.inv, c.eq.back?.inv]) {
    if (!g) continue;
    const it = g.first((d) => !!d.food && d.cat === 'food');
    if (it) {
      const d = ITEM[it.id];
      c.hunger = Math.min(300, c.hunger + (d.food ?? 0));
      it.n--;
      if (it.n <= 0) g.remove(it);
      c.act = 'pickup'; c.actT = 0; c.actDur = 0.8;
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------- NPCs
function npcAI(c: Char, dt: number, think: boolean) {
  const B = c.brain;
  const f = FACTION[c.faction];
  if (think) {
    B.enemy = 0;
    const radius = c.animal ? Math.max(20, ANIMAL[c.animal].aggro) : c.role === 'guard' || c.role === 'patrol' ? 36 : 26;
    const e = c.combatMode === 'passive' ? null : findEnemy(c, radius);
    const attacker = S.W.char(c.lastHitBy);
    const provoked = attacker && attacker.alive && attacker.up && S.time - c.lastHitT < 12 ? attacker : null;
    let target = provoked ?? e;
    // some would rather talk (and extort) first
    if (target && !provoked && target.faction === 'player' && wantsToTalk(c)) target = null;
    // animals: grazers flee instead of fighting unless cornered
    if (c.animal && target) {
      const a = ANIMAL[c.animal];
      if (a.diet === 'grazer' && !provoked) { B.flee = target.id; target = null; }
      else if (a.diet === 'grazer' && provoked && c.body.total() < 0.5) { B.flee = provoked.id; target = null; }
    }
    // people: the weak and civilians run from fights
    if (!c.animal && target) {
      const coward = c.role === 'resident' || c.role === 'shopkeeper' || c.role === 'slave' || c.role === 'noble' || c.role === 'trader' || c.role === 'worker' || c.role === 'caravan' || c.role === 'recruit';
      const beaten = c.body.total() < 0.35 && (f?.attitude === 'bandit' || c.role === 'wanderer');
      if ((coward && !provoked) || beaten || (coward && c.body.total() < 0.6)) { B.flee = target.id; target = null; }
    }
    // guards help anyone of theirs who is being attacked nearby
    if (!target && (c.role === 'guard' || c.role === 'patrol' || f?.attitude === 'bandit' || c.animal)) {
      S.W.hash.near(c.x, c.z, 30, (o) => {
        if (target || o === c || o.faction !== c.faction || !o.up) return;
        const foe = S.W.char(o.lastHitBy);
        if (foe && foe.up && S.time - o.lastHitT < 6 && foe.faction !== c.faction) target = foe;
      });
    }
    B.enemy = target ? target.id : 0;
    if (!target && B.flee) {
      const fr = S.W.char(B.flee);
      if (!fr || !fr.up || dist(c, fr) > 45) B.flee = 0;
    }
  }
  const enemy = S.W.char(B.enemy);
  if (enemy && enemy.alive) {
    if (c.carrying) dropCarried(c);
    // beasts that eat the fallen keep at it
    if (enemy.status !== 'up' && !(c.animal && ANIMAL[c.animal].eatsDowned)) B.enemy = 0;
    else { fight(c, enemy, dt); return; }
  }
  c.target = 0;
  if (B.flee) {
    const fr = S.W.char(B.flee);
    if (fr && think) flee(c, fr.x, fr.z);
    if (fr) return;
  }
  if (c.drawn && S.time - c.lastHitT > 8) c.drawn = false;
  // after a fight: help the fallen, loot, capture
  if (think && !c.animal && postFight(c)) return;
  if (B.task && runTask(c, dt)) return;
  runRoutine(c, dt, think);
}

/** Medics patch up friends; slavers and police pick up the defeated. */
function postFight(c: Char): boolean {
  const B = c.brain;
  if (B.task) return false;
  const f = FACTION[c.faction];
  let best: Char | null = null, bd = 30 * 30, kind = '';
  S.W.hash.near(c.x, c.z, 30, (o, d2) => {
    if (o === c || o.carriedBy || o.cage || o.status === 'dead') return;
    if (o.status === 'ko' || o.body.bleeding() > 0.15) {
      if (o.faction === c.faction && o.body.needsAid() && findMedkit(c, o.robot) && d2 < bd) { best = o; bd = d2; kind = 'aid'; return; }
      if (o.status !== 'ko') return;
      if (o.faction !== c.faction && !o.animal) {
        if (f?.captures === 'slavery' && c.role !== 'resident' && d2 < bd && !o.robot) { best = o; bd = d2; kind = 'capture'; }
        else if (f?.captures === 'prison' && (o.bounty[c.faction] ?? 0) > 0 && (c.role === 'guard' || c.role === 'patrol') && d2 < bd) { best = o; bd = d2; kind = 'arrest'; }
        else if (f?.captures === 'eat' && d2 < bd) { best = o; bd = d2; kind = 'eat'; }
        else if (f?.attitude === 'bandit' && !o.mem.lootedBy && d2 < bd) { best = o; bd = d2; kind = 'loot'; }
      }
    }
  });
  if (!best) return false;
  B.task = { k: kind, id: (best as Char).id, t: 0 };
  return true;
}

/** Multi-step tasks (aid, capture, arrest, loot...). */
function runTask(c: Char, dt: number): boolean {
  const B = c.brain;
  const task = B.task;
  const o = S.W.char(task.id);
  task.t += dt;
  if (!o || task.t > 120) { B.task = null; return false; }
  switch (task.k) {
    case 'aid': {
      if (!o.body.needsAid() || o.status === 'dead') { B.task = null; c.act = null; return false; }
      if (!near(c, o.x, o.z, 1.4)) { goTo(c, o.x, o.z); c.move = 'run'; return true; }
      stop(c);
      c.act = 'loot'; c.actDur = 1.2;
      task.w = (task.w ?? 0) + dt;
      if (task.w > 1.2) {
        task.w = 0;
        const kit = findMedkit(c, o.robot);
        if (!kit) { B.task = null; return false; }
        const l = worstLimb(o.body);
        if (l < 0) { B.task = null; return false; }
        const used = treatLimb(c, o, l, kit.def.med!.points * 0.3, kit.def.med!.quality, false);
        (kit.it as any).used = ((kit.it as any).used ?? 0) + used;
        if ((kit.it as any).used >= kit.def.med!.points) { kit.it.n--; (kit.it as any).used = 0; if (kit.it.n <= 0) kit.grid.remove(kit.it); }
      }
      return true;
    }
    case 'loot': {
      if (!near(c, o.x, o.z, 1.3)) { goTo(c, o.x, o.z); c.move = 'walk'; return true; }
      stop(c);
      c.act = 'loot'; c.actDur = 1.5;
      task.w = (task.w ?? 0) + dt;
      if (task.w > 2) {
        // take money and a few valuables
        const take = Math.floor(S.W.money > 0 && o.faction === 'player' ? Math.min(S.W.money * 0.1, 500) : o.money * 0.8);
        if (o.faction === 'player') { S.W.money -= take; if (take > 0) S.fx.notice(`Bandits rob ${take} chits from ${o.name}.`, 'bad'); }
        else o.money -= take;
        c.money += take;
        const best = o.inv.items.slice().sort((a, b) => ITEM[b.id].value - ITEM[a.id].value).slice(0, 2);
        for (const it of best) { o.inv.remove(it); c.inv.put(it) || c.inv.add(it.id, it.n, it.q); }
        o.mem.lootedBy = c.id;
        B.task = null;
      }
      return true;
    }
    case 'capture':
    case 'arrest':
    case 'eat': {
      if (o.carriedBy && o.carriedBy !== c.id) { B.task = null; return false; }
      if (o.status === 'up') { B.task = null; return false; }
      if (!c.carrying) {
        if (!near(c, o.x, o.z, 1.3)) { goTo(c, o.x, o.z); c.move = 'run'; return true; }
        pickUp(c, o);
        if (task.k === 'capture') o.shackled = true;
        const dest = captureDestination(c, task.k);
        task.dx = dest[0]; task.dz = dest[1];
        return true;
      }
      if (!near(c, task.dx, task.dz, 3)) { goTo(c, task.dx, task.dz); c.move = 'walk'; return true; }
      // arrived: hand over
      deliverCaptive(c, o, task.k);
      B.task = null;
      return true;
    }
  }
  B.task = null;
  return false;
}

export function pickUp(c: Char, o: Char) {
  if (c.carrying || o.carriedBy) return false;
  c.carrying = o.id;
  o.carriedBy = c.id;
  o.path = null;
  o.hasGoal = false;
  if (o.bed) { const b = S.W.objs.get(o.bed); if (b) b.occupant = 0; o.bed = 0; }
  return true;
}

/** Where captors take their prisoners. */
function captureDestination(c: Char, kind: string): [number, number] {
  const T = S.T;
  let site = kind === 'capture'
    ? T.nearestSite(c.x, c.z, (s) => s.faction === 'chainhouse' || s.settlement === 'harrowmarket' || s.settlement === 'aurum' || s.faction === 'scorched')
    : kind === 'arrest'
      ? T.nearestSite(c.x, c.z, (s) => s.kind === 'town' && s.faction === c.faction)
      : T.nearestSite(c.x, c.z, (s) => s.faction === c.faction || s.kind === 'camp_mawkin' || s.kind === 'mist_camp');
  if (!site) site = T.nearestSite(c.x, c.z, (s) => s.kind === 'town');
  // aim for a cage in that site if there is one
  const cage = findFreeCage(site!.id, site!.x, site!.z);
  if (cage) return [cage.x, cage.z];
  return [site!.x, site!.z];
}

export function findFreeCage(siteId: number, x: number, z: number) {
  let best = null, bd = Infinity;
  for (const o of S.W.objs.values()) {
    if (o.kind !== 'cage' || o.occupant || (siteId && o.site !== siteId)) continue;
    const d = Math.hypot(o.x - x, o.z - z);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function deliverCaptive(c: Char, o: Char, kind: string) {
  dropCarried(c);
  const cage = findFreeCage(0, c.x, c.z);
  if (cage && Math.hypot(cage.x - c.x, cage.z - c.z) < 8) {
    cage.occupant = o.id;
    o.cage = cage.id;
    o.x = cage.x; o.z = cage.z;
    if (kind === 'arrest') {
      o.mem.jailUntil = S.clock.t + 86400 * (1 + Math.min(4, (o.bounty[c.faction] ?? 0) / 2000));
      o.bounty[c.faction] = 0;
      if (o.faction === 'player') S.fx.notice(`${o.name} has been thrown in a cage.`, 'bad');
    } else if (kind === 'capture') {
      o.mem.enslavedBy = c.faction;
      if (o.faction === 'player') S.fx.notice(`${o.name} has been taken by slavers.`, 'bad');
    }
  }
  if (kind === 'eat' && o.faction === 'player') S.fx.notice(`${o.name} has been dragged off by the ${FACTION[c.faction]?.short ?? 'enemy'}.`, 'bad');
}

/** Forces NPCs in a group to attack a target (demands refused, crimes). */
export function aggro(group: Char[], target: Char) {
  for (const c of group) {
    if (!c.up) continue;
    c.brain.enemy = target.id;
    c.lastHitBy = target.id;
    c.lastHitT = S.time;
    c.mem.enemies = [...(c.mem.enemies ?? []), target.id];
  }
}

export { strengthOf, LI };
