// Using furniture and machines: beds, cages, storage, turrets, gates, seats.
import { Char } from './char';
import { S } from './ctx';
import { WObj } from './objects';
import { emit } from '../core/events';
import { dropCarried } from './health';
import { crime } from './crime';

/** How much faster wounds heal in a bed of each kind (resting on the ground heals at 1). */
export const BED_REST: Record<string, number> = { bedroll: 2.4, bed: 3.5, bunk: 3.5, bed_fine: 4.2 };
export function bedRest(o: WObj | undefined) { return o ? BED_REST[o.def] ?? 3.5 : 1; }

/** Is there room in a bed for someone? A bunk has two, one above the other. */
export function bedFree(o: WObj, c?: Char) {
  return !o.occupant || o.occupant === c?.id || (o.def === 'bunk' && (!o.data?.upper || o.data.upper === c?.id));
}

/** Gets into a bed (the top bunk if the bottom is taken). False if there is no room. */
export function takeBed(c: Char, o: WObj): boolean {
  if (!o.occupant || o.occupant === c.id) { o.occupant = c.id; c.mem.upper = false; }
  else if (o.def === 'bunk' && (!o.data?.upper || o.data.upper === c.id)) { (o.data ??= {}).upper = c.id; c.mem.upper = true; }
  else return false;
  c.bed = o.id;
  c.x = o.x; c.z = o.z; c.dir = o.rot;
  return true;
}

/** Gets out of whichever bed (or bunk) someone is in. */
export function leaveBed(c: Char) {
  const b = S.W.objs.get(c.bed);
  if (b) { if (b.occupant === c.id) b.occupant = 0; if (b.data?.upper === c.id) b.data.upper = 0; }
  c.bed = 0;
  c.mem.upper = false;
}

export function leaveFurniture(c: Char) {
  if (c.bed) {
    leaveBed(c);
    c.sleeping = false;
  }
  if (c.mem.using) {
    const o = S.W.objs.get(c.mem.using);
    if (o && o.user === c.id) o.user = 0;
    c.mem.using = 0;
    // down from a watchtower, onto open ground beside it
    if (o?.kind === 'tower') {
      const p = S.nav.nearestOpen(o.x + Math.sin(c.dir) * ((o.data?.r ?? 2) + 1), o.z + Math.cos(c.dir) * ((o.data?.r ?? 2) + 1), 8);
      if (p) { c.x = p[0]; c.z = p[1]; c.y = S.T.heightAt(c.x, c.z); }
    }
  }
}

/** Holds a prisoner: a cage, or a shackle post they are chained to. */
export function holdsPrisoner(o: WObj) { return o.kind === 'cage' || o.kind === 'shackle_post'; }

export function useObject(c: Char, o: WObj) {
  switch (o.kind) {
    case 'bed':
      if (c.carrying) { placeInto(c, S.W.char(c.carrying)!, o); return; }
      if (!bedFree(o, c)) { S.fx.notice(o.def === 'bunk' ? 'Both bunks are taken.' : 'Someone is already in that bed.'); return; }
      leaveFurniture(c);
      takeBed(c, o);
      c.sleeping = S.clock.isNight || c.body.total() < 0.9;
      if (o.owner && o.owner !== 'player' && o.owner !== c.faction) crime(c, 'trespass', o.owner, 20);
      return;
    case 'cage':
    case 'shackle_post':
      if (c.carrying) { placeInto(c, S.W.char(c.carrying)!, o); return; }
      if (o.occupant) { c.order = { k: 'lockpick', obj: o.id }; return; }
      S.fx.notice(o.kind === 'cage' ? 'An empty cage.' : 'Nobody is chained to the post.');
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

/** Puts a carried body into a bed or a cage, or chains them to a shackle post. */
export function placeInto(c: Char, t: Char, o: WObj) {
  if (!t) return;
  if (o.kind === 'bed' ? !bedFree(o, t) : o.occupant) { S.fx.notice('That is occupied.'); return; }
  dropCarried(c);
  if (o.kind === 'bed') takeBed(t, o);
  else if (holdsPrisoner(o)) {
    o.occupant = t.id; t.cage = o.id;
    if (o.kind === 'shackle_post') {
      // sat on the ground with their back to the post
      t.x = o.x + Math.sin(o.rot) * 0.45; t.z = o.z + Math.cos(o.rot) * 0.45; t.dir = o.rot;
    } else { t.x = o.x; t.z = o.z; }
    t.mem.caughtBy = c.faction;
  }
}
