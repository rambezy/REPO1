// Using furniture and machines: beds, cages, storage, turrets, gates, seats.
import { Char } from './char';
import { S } from './ctx';
import { WObj } from './objects';
import { emit } from '../core/events';
import { dropCarried } from './health';
import { crime } from './crime';

export function leaveFurniture(c: Char) {
  if (c.bed) {
    const b = S.W.objs.get(c.bed);
    if (b && b.occupant === c.id) b.occupant = 0;
    c.bed = 0;
    c.sleeping = false;
  }
  if (c.mem.using) {
    const o = S.W.objs.get(c.mem.using);
    if (o && o.user === c.id) o.user = 0;
    c.mem.using = 0;
  }
}

export function useObject(c: Char, o: WObj) {
  switch (o.kind) {
    case 'bed':
      if (o.occupant && o.occupant !== c.id) { S.fx.notice('Someone is already in that bed.'); return; }
      if (c.carrying) { placeInto(c, S.W.char(c.carrying)!, o); return; }
      leaveFurniture(c);
      o.occupant = c.id;
      c.bed = o.id;
      c.x = o.x; c.z = o.z; c.dir = o.rot;
      c.sleeping = S.clock.isNight || c.body.total() < 0.9;
      if (o.owner && o.owner !== 'player' && o.owner !== c.faction) crime(c, 'trespass', o.owner, 20);
      return;
    case 'cage':
      if (c.carrying) { placeInto(c, S.W.char(c.carrying)!, o); return; }
      if (o.occupant) { c.order = { k: 'lockpick', obj: o.id }; return; }
      S.fx.notice('An empty cage.');
      return;
    case 'chest':
    case 'storage':
    case 'counter':
    case 'crate':
    case 'pile':
      if (o.owner && o.owner !== 'player' && o.kind !== 'pile') { emit('ui:loot', c.id, { obj: o.id, steal: true }); return; }
      emit('ui:loot', c.id, { obj: o.id });
      return;
    case 'gate':
      if (o.owner === 'player') { toggleGate(o); return; }
      S.fx.notice('The gate is not yours to open.');
      return;
    case 'stool':
    case 'throne':
      leaveFurniture(c);
      o.user = c.id;
      c.mem.using = o.id;
      c.mem.sit = true;
      c.x = o.x; c.z = o.z; c.dir = o.rot;
      return;
    case 'ore':
      c.jobs.unshift({ k: 'mine', obj: o.id, label: 'Mine' });
      return;
    case 'site':
      c.jobs.unshift({ k: 'build', obj: o.id, label: 'Build' });
      return;
    case 'turret':
      c.jobs.unshift({ k: 'turret', obj: o.id, label: 'Man turret' });
      return;
    default:
      if (o.data?.job) c.jobs.unshift({ k: o.data.job, obj: o.id, label: o.data.jobLabel ?? 'Work' });
      else emit('ui:object', c.id, o.id);
  }
}

export function toggleGate(o: WObj) {
  o.open = !o.open;
  const r = 8;
  S.nav.invalidate(o.x - r, o.z - r, o.x + r, o.z + r);
  S.fx.sound('gate', o.x, o.z);
}

/** Puts a carried body into a bed or cage. */
export function placeInto(c: Char, t: Char, o: WObj) {
  if (!t) return;
  if (o.occupant) { S.fx.notice('That is occupied.'); return; }
  dropCarried(c);
  if (o.kind === 'bed') {
    o.occupant = t.id; t.bed = o.id;
    t.x = o.x; t.z = o.z; t.dir = o.rot;
  } else if (o.kind === 'cage') {
    o.occupant = t.id; t.cage = o.id;
    t.x = o.x; t.z = o.z;
    t.mem.caughtBy = c.faction;
  }
}
