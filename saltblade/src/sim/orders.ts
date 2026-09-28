// Carrying out the player's orders: walk, follow, talk, loot, carry, heal,
// use furniture, steal, pick locks, knock people out from behind.
import { Char } from './char';
import { S } from './ctx';
import { goTo, stop, near } from './move';
import { emit } from '../core/events';
import { pickUp } from './ai';
import { dropCarried, findMedkit, limbToTreat, treatLimb } from './health';
import { train, versus } from './train';
import { canSee } from './ai';
import { ITEM } from '../content/items';
import { crime } from './crime';
import { knockOut } from './health';
import { angleTo, wrapAngle } from '../core/math';
import { useObject, placeInto } from './use';

const REACH = 1.6;

function walkTo(c: Char, x: number, z: number, r = REACH): boolean {
  if (near(c, x, z, r)) { stop(c); return true; }
  goTo(c, x, z);
  if (c.move !== 'sneak') c.move = c.mem.walk ? 'walk' : 'run';
  return false;
}

export function runOrder(c: Char, dt: number) {
  const o = c.order!;
  switch (o.k) {
    case 'move':
      if (!c.hasGoal && near(c, o.x, o.z, 1.5)) { c.order = null; return; }
      if (!c.hasGoal) { goTo(c, o.x, o.z); if (c.move !== 'sneak') c.move = c.mem.walk ? 'walk' : 'run'; }
      if (c.mem.pathFail) { c.mem.pathFail = 0; c.order = null; S.fx.notice(`${c.name} can't find a way there.`, 'info'); }
      return;
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
      const kit = findMedkit(c, t.robot, t);
      if (!kit) { S.fx.notice(`${c.name} has no ${t.robot ? 'repair kit' : 'medical supplies'}.`, 'info'); c.order = null; return; }
      const l = limbToTreat(t.body, !!kit.def.med?.splint);
      if (l < 0) { c.order = null; c.act = null; S.fx.notice(`${t.name} is patched up.`, 'good'); return; }
      c.act = 'medic' as any; c.act = 'loot'; c.actDur = 1.6;
      c.brain.aidT = (c.brain.aidT ?? 0) + dt;
      const speed = 1.4 - Math.min(0.9, c.skill('medic') * 0.01);
      if (c.brain.aidT > speed) {
        c.brain.aidT = 0;
        const med = kit.def.med!;
        const used = treatLimb(c, t, l, med.points * 0.25, med.quality, !!med.splint);
        const kitIt = kit.it as any;
        kitIt.used = (kitIt.used ?? 0) + used;
        if (kitIt.used >= med.points) { kit.it.n--; kitIt.used = 0; if (kit.it.n <= 0) kit.grid.remove(kit.it); }
      }
      return;
    }
    case 'use': {
      const ob = S.W.objs.get(o.obj);
      if (!ob) { c.order = null; return; }
      if (walkTo(c, ob.x, ob.z, ob.kind === 'bed' || ob.kind === 'turret' ? 1.2 : 2.2)) {
        c.order = null;
        useObject(c, ob);
      }
      return;
    }
    case 'place': {
      const ob = S.W.objs.get(o.obj);
      const t = S.W.char(c.carrying);
      if (!ob || !t) { c.order = null; return; }
      if (walkTo(c, ob.x, ob.z, 1.6)) { c.order = null; placeInto(c, t, ob); }
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
      if (!walkTo(c, ob.x, ob.z, 1.8)) return;
      c.act = 'craft'; c.actDur = 1.5;
      c.brain.lockT = (c.brain.lockT ?? 0) + dt;
      if (c.brain.lockT > 2.5) {
        c.brain.lockT = 0;
        const diff = ob.locked ?? 0;
        const skill = c.skill('lockpicking') + (c.inv.count('lockpick_set') ? 8 : 0);
        const p = Math.max(0.03, Math.min(0.95, 0.35 + (skill - diff) * 0.02));
        train(c, 'lockpicking', 1, versus(skill, diff));
        if (S.rng.chance(p)) {
          ob.locked = 0;
          c.order = null;
          c.act = null;
          S.fx.notice(`${c.name} picked the lock.`, 'good');
          S.fx.sound('unlock', ob.x, ob.z);
          if (ob.kind === 'cage' && ob.occupant) { freeFromCage(ob.occupant); }
          else if (ob.owner !== 'player' && ob.owner) crime(c, 'trespass', ob.owner, 50, true);
        } else if (S.rng.chance(0.08)) {
          S.fx.notice('The lockpick slips. Someone may have heard.', 'info');
          crime(c, 'trespass', ob.owner, 50, true);
        }
      }
      return;
    }
    case 'free': {
      // lock-picking someone's shackles
      const t = S.W.char(o.id);
      if (!t || !t.shackled) { c.order = null; c.act = null; return; }
      if (!walkTo(c, t.x, t.z, 1.4)) return;
      c.act = 'craft'; c.actDur = 1.5;
      c.brain.lockT = (c.brain.lockT ?? 0) + dt;
      if (c.brain.lockT > 3) {
        c.brain.lockT = 0;
        const skill = c.skill('lockpicking');
        train(c, 'lockpicking', 1, versus(skill, 30));
        if (S.rng.chance(Math.max(0.05, Math.min(0.9, 0.3 + (skill - 25) * 0.02)))) {
          t.shackled = false;
          t.dirty = true;
          c.order = null; c.act = null;
          S.fx.notice(`${t.name}'s shackles are off.`, 'good');
          if (t.faction !== 'player' && t.role === 'slave') {
            // freeing someone else's slave: a crime if seen, and a friend made
            const owner = t.mem.enslavedBy ?? t.faction;
            crime(c, 'freeing', owner, 500, true);
            t.mem.freedBy = 'player';
            t.recruitable = true;
            S.W.flags.freed = (S.W.flags.freed ?? 0) + 1;
            S.W.rel.add('player', 'unchained', 3);
            emit('sim:freedSlave', c.id, t.id);
          }
          else if (t.mem.enslavedBy) crime(t, 'runaway', t.mem.enslavedBy, 1000, true);
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
    case 'mine':
    case 'build':
    case 'operate': {
      const ob = S.W.objs.get(o.obj);
      if (!ob) { c.order = null; return; }
      const job = { k: o.k === 'operate' ? 'operate' : o.k, obj: ob.id, label: '' } as any;
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
