// Repeating work for the player's people: mining, hauling, building,
// operating machines, farming, research, manning turrets. The first job in
// a character's list that can be done is done; the rest wait.
import { Char, Job } from './char';
import { S } from './ctx';
import { WObj } from './objects';
import { goTo, stop, near } from './move';
import { train } from './train';
import { ITEM } from '../content/items';

export type JobResult = 'work' | 'done' | 'skip';
export type JobHandler = (c: Char, job: Job, o: WObj, dt: number, think: boolean) => JobResult;

export const JOB_HANDLERS: Partial<Record<Job['k'], JobHandler>> = {};

/** What people do at a job, which holds them in place while it lasts. */
const WORK_ACTS = new Set(['mine', 'build', 'craft', 'farm', 'research']);

export function walkTo(c: Char, x: number, z: number, r = 1.8) {
  if (near(c, x, z, r)) { stop(c); return true; }
  if (c.act && WORK_ACTS.has(c.act)) c.act = null; // put the tools down to walk
  goTo(c, x, z);
  c.move = c.move === 'sneak' ? 'sneak' : 'run';
  return false;
}

/** Storage near someone with room for an item: a store meant for it before a general one. */
export function storeNear(c: Char, id: string): WObj | null {
  let best: WObj | null = null, bd = 220;
  for (const o of S.W.objs.values()) {
    if (o.owner !== 'player' || !o.inv || !o.built) continue;
    if (o.kind !== 'storage' && o.kind !== 'chest') continue;
    const accepts = o.data?.accepts as string[] | undefined;
    if (accepts && !accepts.includes(id) && !accepts.includes(ITEM[id].cat)) continue;
    if (!o.inv.findSpot(ITEM[id]) && !o.inv.items.some((i) => i.id === id && i.n < ITEM[id].stack)) continue;
    const d = Math.hypot(o.x - c.x, o.z - c.z) + (accepts ? 0 : 40);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/** Miners carry this much ore to storage at a time. */
const HAUL_AT = 20;

JOB_HANDLERS.mine = (c, job, o, dt, think) => {
  if (o.kind !== 'ore') return 'skip';
  if ((o.data?.left ?? 1) <= 0) return 'done';
  const oreId = o.def === 'iron' ? 'iron_ore' : o.def === 'copper' ? 'copper_ore' : 'stone';
  const def = ITEM[oreId];
  // a load's worth: haul it to storage; with nowhere to put it, dig on until the pack is full.
  // (only what was dug here: ore fetched for a machine is not the miner's to put away)
  const dug = Math.min(c.brain.dug ?? 0, c.inv.count(oreId));
  const room = !!c.inv.findSpot(def) || c.inv.items.some((i) => i.id === oreId && i.n < def.stack);
  const full = !room || (dug > 0 && c.load() > 0.85); // (heavy gear alone does not stop a miner starting)
  if (full || dug >= HAUL_AT || c.brain.hauling) {
    c.brain.hauling = true;
    const st = dug > 0 ? storeNear(c, oreId) : null;
    if (st) {
      if (!walkTo(c, st.x, st.z, 2.2)) return 'work';
      const moved = dug - st.inv!.add(oreId, dug);
      c.inv.take(oreId, moved);
      c.brain.dug = dug - moved;
      c.brain.hauling = false;
      return 'work';
    }
    c.brain.hauling = false;
    if (full) {
      if (think && !c.mem.fullWarned) { S.fx.notice(`${c.name}'s pockets are full of ore. Build storage, or sell it.`); c.mem.fullWarned = true; }
      return 'skip';
    }
  }
  c.mem.fullWarned = false;
  if (!walkTo(c, o.x, o.z, 1.9)) return 'work';
  c.dir = Math.atan2(o.x - c.x, o.z - c.z);
  c.act = 'mine';
  c.actDur = 1.4;
  c.brain.mineT = (c.brain.mineT ?? 0) + dt * (0.35 + c.skill('labouring') * 0.012 + c.skill('strength') * 0.004);
  if (c.brain.mineT >= 6) {
    c.brain.mineT = 0;
    if (!c.inv.add(oreId, 1)) c.brain.dug = (c.brain.dug ?? 0) + 1;
    if (o.data) o.data.left = (o.data.left ?? 200) - 1;
    train(c, 'labouring', 1, 1);
    train(c, 'strength', 0.35, 1);
    S.fx.sound('mine', o.x, o.z, 0.6);
  }
  return 'work';
};

/** Runs the first workable job. Returns true if the character is busy. */
export function runJobs(c: Char, dt: number, think: boolean): boolean {
  for (let i = 0; i < c.jobs.length; i++) {
    const job = c.jobs[i];
    const o = S.W.objs.get(job.obj);
    // gone (finished by someone else, torn down): drop it, and stop working at it
    if (!o) { c.jobs.splice(i, 1); i--; if (c.act && WORK_ACTS.has(c.act)) c.act = null; continue; }
    const h = JOB_HANDLERS[job.k];
    if (!h) continue;
    const r = h(c, job, o, dt, think);
    if (r === 'work') return true;
    if (r === 'done') { c.jobs.splice(i, 1); i--; if (c.act) c.act = null; continue; }
  }
  if (c.act && WORK_ACTS.has(c.act)) c.act = null;
  return false;
}
