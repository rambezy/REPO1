// Carrying out the player's orders: walk, follow, talk, loot, carry, heal,
// use furniture, steal, pick locks, knock people out from behind.
import { Char, Order } from './char';
import { S } from './ctx';
import { goTo, stop, near, toolsDown } from './move';
import { emit } from '../core/events';
import { pickUp } from './ai';
import { dropCarried, treatLimb, aidPlan, needsCare, repairProst, worstLimb, brokenLeg } from './health';
import { train, versus } from './train';
import { canSee } from './ai';
import { ITEM } from '../content/items';
import { crime, witness, reportRunaway } from './crime';
import { knockOut } from './health';
import { angleTo, wrapAngle } from '../core/math';
import { useObject, placeInto, leaveFurniture } from './use';
import { reachOf } from './structures';
import { canSalvage, canReprogram, workSalvage, workReprogram } from './salvage';
import { HOUR } from './clock';

const REACH = 1.6;

/**
 * What a go at a lock teaches: the most when it gives; less with each failure on the same lock, so
 * that a cell is no school. The count is forgotten after an hour away from the lock.
 */
function lockLesson(c: Char, ok: boolean): number {
  const B = c.brain;
  if (S.clock.t - (B.lockTriesT ?? -1e9) > HOUR) B.lockTries = 0;
  B.lockTriesT = S.clock.t;
  if (ok) { B.lockTries = 0; return 1; }
  const tries = B.lockTries ?? 0;
  B.lockTries = tries + 1;
  return 0.25 * Math.pow(0.95, Math.min(60, tries));
}

function walkTo(c: Char, x: number, z: number, r = REACH): boolean {
  if (near(c, x, z, r)) { stop(c); return true; }
  toolsDown(c);
  goTo(c, x, z);
  if (c.move !== 'sneak') c.move = c.mem.walk ? 'walk' : 'run';
  return false;
}

/** Orders that are work in themselves, and keep their own pose while it lasts. */
const WORK_ORDERS = new Set<Order['k']>(['lockpick', 'free', 'salvage', 'reprogram']);

/**
 * A new order, or none: off any furniture, tools down, and a walk planned afresh. Every order the
 * player gives goes through here, so that nobody stays bent over a pick or a lock after being told
 * to go. (Standing jobs are kept: they resume once the order is done.)
 */
export function giveOrder(c: Char, o: Order | null) {
  if (c.bed || c.mem.using) leaveFurniture(c);
  c.mem.sit = false;
  c.order = o;
  delete c.mem.moveTry; // (a new order is a new walk: see 'move' below)
  toolsDown(c);
  if (o && o.k === 'move') c.brain.enemy = 0;
  if (o && (o.k === 'move' || o.k === 'attack')) { c.path = null; c.hasGoal = false; }
}

export function runOrder(c: Char, dt: number) {
  const o = c.order;
  if (!o) return;
  // a pose left over from a job or an earlier order would hold them in place (see tickMove)
  if (!WORK_ORDERS.has(o.k)) toolsDown(c);
  switch (o.k) {
    case 'move': {
      if (!c.hasGoal && near(c, o.x, o.z, 1.5)) { c.order = null; delete c.mem.moveTry; return; }
      if (!c.hasGoal) {
        // a walk that ended short of the spot, and got them no nearer the next time: as near as they can get
        const d = Math.hypot(o.x - c.x, o.z - c.z);
        const tried = c.mem.moveTry as { x: number; z: number; d: number } | undefined;
        if (tried && tried.x === o.x && tried.z === o.z && d > tried.d - 1) { delete c.mem.moveTry; c.order = null; S.fx.notice(`${c.name} can't find a way there.`, 'info'); return; }
        c.mem.moveTry = { x: o.x, z: o.z, d };
        goTo(c, o.x, o.z);
        if (c.move !== 'sneak') c.move = c.mem.walk ? 'walk' : 'run';
      }
      if (c.mem.pathFail) { c.mem.pathFail = 0; delete c.mem.moveTry; c.order = null; S.fx.notice(`${c.name} can't find a way there.`, 'info'); }
      return;
    }
    case 'hold':
      stop(c);
      return;
    case 'follow': {
      const t = S.W.char(o.id);
      if (!t || !t.alive) { c.order = null; return; }
      if (Math.hypot(t.x - c.x, t.z - c.z) > 3) { goTo(c, t.x, t.z); c.move = t.move === 'sneak' ? 'sneak' : t.speed > 2.4 || Math.hypot(t.x - c.x, t.z - c.z) > 10 ? 'run' : 'walk'; }
      else stop(c);
      return;
    }
    case 'talk': {
      const t = S.W.char(o.id);
      if (!t || !t.alive) { c.order = null; return; }
      if (walkTo(c, t.x, t.z, 2.4)) {
        c.order = null;
        c.dir = angleTo(c.x, c.z, t.x, t.z);
        emit('ui:talk', c.id, t.id);
      }
      return;
    }
    case 'shop': {
      const t = S.W.char(o.id);
      if (!t) { c.order = null; return; }
      if (walkTo(c, t.x, t.z, 2.6)) { c.order = null; emit('ui:trade', c.id, t.id); }
      return;
    }
    case 'loot': {
      const t = S.W.char(o.id);
      if (!t) { c.order = null; return; }
      if (walkTo(c, t.x, t.z)) {
        c.order = null;
        c.act = 'loot'; c.actT = 0; c.actDur = 1;
        emit('ui:loot', c.id, { char: t.id });
      }
      return;
    }
    case 'lootobj': {
      const ob = S.W.objs.get(o.obj);
      if (!ob) { c.order = null; return; }
      if (walkTo(c, ob.x, ob.z, 2)) {
        c.order = null;
        if (ob.locked && ob.owner !== 'player') { c.order = { k: 'lockpick', obj: ob.id }; return; }
        c.act = 'loot'; c.actT = 0; c.actDur = 1;
        emit('ui:loot', c.id, { obj: ob.id });
      }
      return;
    }
    case 'pickup': {
      const t = S.W.char(o.id);
      if (!t || t.status === 'up' || t.carriedBy) { c.order = null; return; }
      if (c.carrying) dropCarried(c);
      if (walkTo(c, t.x, t.z, 1.3)) {
        c.order = null;
        if (t.cage) { S.fx.notice('They are locked in a cage.', 'info'); return; }
        pickUp(c, t);
        if (t.faction !== 'player' && t.faction !== 'fauna' && !t.animal) {
          // carrying off a stranger is kidnapping if anyone cares
          if (t.status === 'ko') crime(c, 'kidnap', t.faction, 300);
        }
      }
      return;
    }
    case 'drop':
      dropCarried(c);
      c.order = null;
      return;
    case 'aid': {
      const t = S.W.char(o.id);
      if (!t || t.status === 'dead') { c.order = null; c.act = null; return; }
      if (!walkTo(c, t.x, t.z, 1.4)) return;
      // wounds first, then any dented prosthetic (with a repair kit)
      const plan = aidPlan(c, t);
      if (!plan) {
        c.order = null; c.act = null;
        if (!needsCare(t)) S.fx.notice(`${t.name} is patched up.`, 'good');
        else S.fx.notice(`${c.name} has no ${t.robot || (worstLimb(t.body) < 0 && brokenLeg(t.body) < 0) ? 'repair kit' : 'medical supplies'}.`, 'info');
        return;
      }
      const { kit, l } = plan;
      c.act = 'loot'; c.actDur = 1.6;
      c.brain.aidT = (c.brain.aidT ?? 0) + dt;
      const speed = 1.4 - Math.min(0.9, c.skill(plan.prost ? 'robotics' : 'medic') * 0.01);
      if (c.brain.aidT > speed) {
        c.brain.aidT = 0;
        const med = kit.def.med!;
        if (plan.prost && S.rng.chance(0.5)) S.fx.burst('sparks', t.x, t.y + (l >= 5 ? 0.45 : 1.15), t.z, 5);
        const used = plan.prost ? repairProst(c, t, l, med.points * 0.25, med.quality) : treatLimb(c, t, l, med.points * 0.25, med.quality, !!med.splint);
        const kitIt = kit.it as any;
        kitIt.used = (kitIt.used ?? 0) + used;
        if (kitIt.used >= med.points) { kit.it.n--; kitIt.used = 0; if (kit.it.n <= 0) kit.grid.remove(kit.it); }
      }
      return;
    }
    case 'use': {
      const ob = S.W.objs.get(o.obj);
      if (!ob) { c.order = null; return; }
      if (walkTo(c, ob.x, ob.z, reachOf(ob, ob.kind === 'bed' || ob.kind === 'turret' ? 1.2 : 2.2))) {
        c.order = null;
        useObject(c, ob);
      }
      return;
    }
    case 'place': {
      const ob = S.W.objs.get(o.obj);
      const t = S.W.char(c.carrying);
      if (!ob || !t) { c.order = null; return; }
      if (walkTo(c, ob.x, ob.z, reachOf(ob, 1.6))) { c.order = null; placeInto(c, t, ob); }
      return;
    }
    case 'steal': {
      const ob = S.W.objs.get(o.obj);
      if (!ob) { c.order = null; return; }
      if (walkTo(c, ob.x, ob.z, 2)) {
        c.order = null;
        emit('ui:loot', c.id, { obj: ob.id, steal: true });
      }
      return;
    }
    case 'pickpocket': {
      const t = S.W.char(o.id);
      if (!t) { c.order = null; return; }
      if (walkTo(c, t.x, t.z, 1.2)) {
        c.order = null;
        emit('ui:loot', c.id, { char: t.id, steal: true });
      }
      return;
    }
    case 'lockpick': {
      const ob = S.W.objs.get(o.obj);
      if (!ob) { c.order = null; return; }
      // from inside: a prisoner working at their own cage lock
      const inside = ob.occupant === c.id;
      if (!inside && !walkTo(c, ob.x, ob.z, 1.8)) return;
      c.act = 'craft'; c.actDur = 1.5;
      c.brain.lockT = (c.brain.lockT ?? 0) + dt;
      if (c.brain.lockT > 2.5) {
        c.brain.lockT = 0;
        const diff = ob.locked ?? 0;
        const skill = c.skill('lockpicking') + (c.inv.count('lockpick_set') ? 8 : 0);
        // fingers through the bars are clumsy, and a jailer's eye on you worse
        const watched = ob.owner && ob.owner !== 'player' ? witness(c, ob.owner) : null;
        const p = Math.max(0.03, Math.min(0.95, 0.35 + (skill - diff) * 0.02)) * (inside ? 0.7 : 1) * (watched ? 0.5 : 1);
        const ok = S.rng.chance(p);
        train(c, 'lockpicking', lockLesson(c, ok), versus(skill, diff));
        if (ok) {
          c.order = null;
          c.act = null;
          S.fx.notice(`${c.name} picked the lock.`, 'good');
          S.fx.sound('unlock', ob.x, ob.z);
          if ((ob.kind === 'cage' || ob.kind === 'shackle_post') && ob.occupant) {
            // the door opens; the lock is not broken, and holds the next prisoner as it held this one
            // (a cage an older save left picked open gets a middling lock back)
            if (!ob.locked) ob.locked = 40;
            const held = ob.occupant;
            freeFromCage(held);
            if (!inside) emit('sim:freedCaptive', c.id, held);
            // a sentence walked out on: the law wants them back, if the law saw
            if (inside) { delete c.mem.jailUntil; if (ob.owner && ob.owner !== 'player') crime(c, 'escape', ob.owner, 500, true); }
          } else {
            ob.locked = 0;
            if (ob.owner !== 'player' && ob.owner) crime(c, 'trespass', ob.owner, 50, true);
          }
        } else if (S.rng.chance(watched ? 0.25 : 0.08)) {
          S.fx.notice(watched ? `${c.name} was seen at the lock.` : 'The lockpick slips. Someone may have heard.', 'info');
          crime(c, inside ? 'escape' : 'trespass', ob.owner, inside ? 200 : 50, true);
        }
      }
      return;
    }
    case 'free': {
      // lock-picking someone's shackles, or your own
      const t = S.W.char(o.id);
      if (!t || !t.shackled) { c.order = null; c.act = null; return; }
      const own = t === c;
      if (own) stop(c);
      else if (!walkTo(c, t.x, t.z, 1.4)) return;
      c.act = 'craft'; c.actDur = 1.5;
      c.brain.lockT = (c.brain.lockT ?? 0) + dt;
      if (c.brain.lockT > 3) {
        c.brain.lockT = 0;
        const skill = c.skill('lockpicking') + (c.inv.count('lockpick_set') ? 8 : 0);
        const owner = t.mem.enslavedBy as string | undefined;
        // irons on your own wrists are awkward, and an overseer watching makes it worse; but slave irons
        // are cheap and give to patience, so an unskilled hand has them off in a minute or so unwatched
        // (about one go in seven), and at half that rate under an overseer's eye
        const watched = owner && owner !== 'player' ? witness(t, owner) : null;
        const p = Math.max(own ? 0.25 : 0.04, Math.min(0.9, 0.3 + (skill - 25) * 0.02)) * (own ? 0.6 : 1) * (watched ? 0.5 : 1);
        const ok = S.rng.chance(p);
        train(c, 'lockpicking', lockLesson(c, ok), versus(skill, 30));
        if (ok) {
          t.shackled = false;
          t.dirty = true;
          c.order = null; c.act = null;
          S.fx.notice(own ? `${c.name}'s shackles are off.` : `${t.name}'s shackles are off.`, 'good');
          if (t.faction !== 'player' && t.role === 'slave' && owner !== 'player') {
            // freeing someone else's slave: a crime if seen, and a friend made (your own you may unchain as you like)
            crime(c, 'freeing', owner ?? t.faction, 500, true);
            t.mem.freedBy = 'player';
            t.recruitable = true;
            S.W.flags.freed = (S.W.flags.freed ?? 0) + 1;
            S.W.rel.add('player', 'unchained', 3);
            emit('sim:freedSlave', c.id, t.id);
          }
          else if (owner && owner !== 'player') reportRunaway(t, owner);
        } else if (watched && S.rng.chance(0.12)) {
          // caught fumbling at the irons
          S.fx.notice(`${c.name} was seen at ${own ? 'their' : t.name + '\'s'} shackles.`, 'bad');
          if (t.faction !== 'player' && t.role === 'slave' && owner !== 'player') crime(c, 'freeing', owner ?? t.faction, 500, true);
          else if (owner && owner !== 'player') reportRunaway(t, owner);
        }
      }
      return;
    }
    case 'assassinate': {
      const t = S.W.char(o.id);
      if (!t || t.status !== 'up') { c.order = null; return; }
      c.move = 'sneak';
      // come up behind
      const bx = t.x - Math.sin(t.dir) * 0.9, bz = t.z - Math.cos(t.dir) * 0.9;
      if (!walkTo(c, bx, bz, 0.8)) return;
      c.order = null;
      const behind = Math.abs(wrapAngle(angleTo(t.x, t.z, c.x, c.z) - t.dir)) > 1.9;
      const noticed = t.brain.enemy === c.id || (canSee(t, c) && !behind);
      c.act = 'attack'; c.actT = 0; c.actDur = 0.7; c.actVar = 0;
      const skill = c.skill('assassination');
      const resist = t.skill('toughness') * 0.6 + t.skill('perception') * 0.4;
      const p = Math.max(0.05, Math.min(0.95, (noticed ? 0.1 : 0.55) + (skill - resist) * 0.018));
      train(c, 'assassination', 1.5, versus(skill, resist));
      if (S.rng.chance(p)) {
        knockOut(t, 'knocked out from behind');
        t.body.koT = -S.rng.range(40, 120) - skill;
        S.fx.sound('thud', t.x, t.z);
        if (t.faction !== 'player') crime(c, 'assault', t.faction, 200, true);
      } else {
        t.lastHitBy = c.id; t.lastHitT = S.time;
        S.fx.say(t, S.rng.pick(['What the—!', 'Get off me!', 'Sneaking coward!']));
        if (t.faction !== 'player') crime(c, 'assault', t.faction, 200, false);
      }
      return;
    }
    case 'salvage':
    case 'reprogram': {
      const t = S.W.char(o.id);
      if (!t || !(o.k === 'salvage' ? canSalvage(t) : canReprogram(t))) { c.order = null; c.act = null; return; }
      if (!walkTo(c, t.x, t.z, 1.6)) return;
      c.dir = angleTo(c.x, c.z, t.x, t.z);
      if (o.k === 'salvage' ? workSalvage(c, t, dt) : workReprogram(c, t, dt)) { c.order = null; c.act = null; }
      return;
    }
    case 'mine':
    case 'build':
    case 'operate': {
      const ob = S.W.objs.get(o.obj);
      if (!ob) { c.order = null; return; }
      // the work a thing is for (farm a field, research at a bench, man a turret...), not only machines
      const job = { k: o.k === 'operate' ? ob.data?.job ?? 'operate' : o.k, obj: ob.id, label: o.k === 'operate' ? ob.data?.jobLabel ?? '' : '' } as any;
      if (!c.jobs.some((j) => j.obj === ob.id)) c.jobs.unshift(job);
      c.order = null;
      return;
    }
  }
  c.order = null;
}

export function freeFromCage(id: number) {
  const t = S.W.char(id);
  if (!t) return;
  const ob = S.W.objs.get(t.cage);
  if (ob) { ob.occupant = 0; }
  t.cage = 0;
  const spot = S.nav.nearestOpen(t.x + 1.5, t.z, 5);
  if (spot) { t.x = spot[0]; t.z = spot[1]; }
  if (t.faction !== 'player') t.mem.freedBy = 'player';
  S.fx.notice(`${t.name} is free of the cage.`, 'good');
}

export { ITEM };
