// The player's outposts: placing construction sites, hauling materials,
// building, running machines on a power budget, crafting, research, farms
// and turrets.
import { S } from './ctx';
import { WObj } from './objects';
import { Char } from './char';
import { Grid, Item, makeItem } from './inventory';
import { BUILDABLE, Buildable, RECIPES, TECH, Recipe } from '../content/buildables';
import { BUILDINGS } from '../content/buildings';
import { ITEM, GRADES } from '../content/items';
import { JOB_HANDLERS, walkTo } from './jobs';
import { goTo, stop } from './move';
import { train } from './train';
import { placeBuilding } from '../world/towns';
import { navDirty, buildingAt, reachOf } from './structures';
import { RNG } from '../core/rng';
import { SK, Skill } from './skills';
import { emit } from '../core/events';
import { findEnemy, tableBonus } from './ai';
import { applyDamage, dist, canShoot, shoot } from './combat';
import { RATE, HOUR } from './clock';
import { leaveFurniture } from './use';
import { freeFromCage } from './orders';

const rng = new RNG((Date.now() ^ 777) >>> 0); // a different world story each game

// ---------------------------------------------------------------- placement
export function canPlace(b: Buildable, x: number, z: number, rot: number): { ok: boolean; why: string } {
  const T = S.T;
  const town = T.siteAt(x, z, 30);
  if (town && town.kind === 'town') {
    // only furniture, and only inside a house of your own
    const home = buildingAt(x, z);
    if (!home || home.owner !== 'player' || b.kind === 'building' || b.kind === 'farm' || b.wall) return { ok: false, why: home?.owner === 'player' ? 'Only furniture fits in there.' : `You can't build inside ${town.name}, except in a house of your own.` };
  }
  const c = Math.cos(rot), s = Math.sin(rot);
  let minH = Infinity, maxH = -Infinity;
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
    const wx = x + (lx * b.w) / 2 * c + (lz * b.d) / 2 * s, wz = z - (lx * b.w) / 2 * s + (lz * b.d) / 2 * c;
    const h = T.heightAt(wx, wz);
    minH = Math.min(minH, h); maxH = Math.max(maxH, h);
  }
  if (minH < 0.2 && b.crop !== 'riceweed' && b.crop !== 'dreamleaf') return { ok: false, why: 'Too wet to build here.' };
  const tol = b.kind === 'building' ? 3.6 : b.kind === 'farm' ? 2.2 : b.kind === 'wall' || b.kind === 'gate' || b.kind === 'tower' ? 4.5 : 1.6;
  if (maxH - minH > tol) return { ok: false, why: 'The ground is too steep.' };
  // overlaps
  const inside = buildingAt(x, z);
  if (b.kind === 'building' && inside) return { ok: false, why: 'Something is in the way.' };
  const r = Math.hypot(b.w, b.d) / 2;
  let blocked = '';
  S.W.objHash.near(x, z, r + 16, (o) => {
    if (blocked) return;
    if (o.kind === 'farm' && b.kind !== 'farm' && b.kind !== 'building') return;
    const [ow, od] = footprint(o);
    if (!ow) return;
    if (b.kind !== 'building' && o.kind === 'building') return; // furniture may go inside buildings
    if (obb(x, z, b.w, b.d, rot, o.x, o.z, ow, od, o.rot, b.kind === 'building' || o.kind === 'building' ? 0.6 : 0.1)) blocked = 'Something is in the way.';
  });
  if (blocked) return { ok: false, why: blocked };
  return { ok: true, why: '' };
}

export function footprint(o: WObj): [number, number] {
  if (o.kind === 'building') return [o.data.w, o.data.d];
  if (o.kind === 'site') return [o.data.w, o.data.d];
  if (o.kind === 'farm') return [o.data.w, o.data.d];
  if (o.kind === 'wall') return [o.data.thick ?? 1, o.data.len];
  if (o.kind === 'gate') return [1.2, o.data.w ?? 6];
  if (o.kind === 'ore') return [2.2, 2.2];
  const b = BUILDABLE[o.data?.bkey];
  if (b) return [b.w, b.d];
  if (o.kind === 'pile' || o.kind === 'lamp') return [0, 0];
  return [1, 1];
}

function obb(ax: number, az: number, aw: number, ad: number, ar: number, bx: number, bz: number, bw: number, bd: number, br: number, m: number) {
  const axes = [ar, ar + Math.PI / 2, br, br + Math.PI / 2];
  const corners = (x: number, z: number, w: number, d: number, r: number) => {
    const c = Math.cos(r), s = Math.sin(r), hw = w / 2 + m / 2, hd = d / 2 + m / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [x + lx * c + lz * s, z - lx * s + lz * c]);
  };
  const ca = corners(ax, az, aw, ad, ar), cb = corners(bx, bz, bw, bd, br);
  for (const ang of axes) {
    const ux = Math.cos(ang), uz = -Math.sin(ang);
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const [x, z] of ca) { const p = x * ux + z * uz; a0 = Math.min(a0, p); a1 = Math.max(a1, p); }
    for (const [x, z] of cb) { const p = x * ux + z * uz; b0 = Math.min(b0, p); b1 = Math.max(b1, p); }
    if (a1 < b0 || b1 < a0) return false;
  }
  return true;
}

export function unlocked(b: Buildable) { return !b.research || S.W.research.done.has(b.research); }

export function placeSite(b: Buildable, x: number, z: number, rot: number): WObj {
  const o = S.W.addObj({
    id: 0, kind: 'site', def: b.key, x, z, y: S.T.heightAt(x, z), rot, owner: 'player', site: 0, parent: buildingAt(x, z)?.id ?? 0, built: false, progress: 0,
    data: { bkey: b.key, name: b.name, need: { ...b.cost }, have: {}, work: 0, w: b.w, d: b.d, r: Math.max(b.w, b.d) / 2 + 1 },
  });
  emit('objs');
  return o;
}

function missing(site: WObj): [string, number] | null {
  for (const [id, n] of Object.entries(site.data.need as Record<string, number>)) {
    const have = site.data.have[id] ?? 0;
    if (have < n) return [id, n - have];
  }
  return null;
}

/** Player storage holding an item, nearest first (never `except`, the place it is wanted). */
export function storageWith(id: string, x: number, z: number, r = 260, except?: WObj): WObj | null {
  let best: WObj | null = null, bd = r;
  for (const o of S.W.objs.values()) {
    if (o.owner !== 'player' || !o.inv || o.kind === 'site' || o === except) continue;
    if (!o.inv.count(id)) continue;
    const d = Math.hypot(o.x - x, o.z - z);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function carryCount(c: Char, id: string) { return c.inv.count(id) + (c.eq.back?.inv?.count(id) ?? 0); }
function takeFrom(c: Char, id: string, n: number) {
  let got = c.inv.take(id, n);
  if (got < n && c.eq.back?.inv) got += c.eq.back.inv.take(id, n - got);
  return got;
}
function giveTo(c: Char, id: string, n: number) {
  let left = c.inv.add(id, n);
  if (left && c.eq.back?.inv) left = c.eq.back.inv.add(id, left);
  return n - left;
}

/**
 * Fetch-and-deliver: brings `n` of an item to `to` from the worker's own pack or
 * the nearest store (not `to` itself, which would only move it round in a circle).
 */
function fetch(c: Char, id: string, n: number, to: WObj, deliver: (k: number) => void): 'busy' | 'none' {
  const have = carryCount(c, id);
  if (have > 0) {
    if (!walkTo(c, to.x, to.z, 2.2)) return 'busy';
    const k = takeFrom(c, id, Math.min(n, have));
    deliver(k);
    return 'busy';
  }
  const st = storageWith(id, c.x, c.z, 260, to);
  if (!st) return 'none';
  if (!walkTo(c, st.x, st.z, 2)) return 'busy';
  const d = ITEM[id];
  const room = Math.max(1, Math.floor((c.capacity() - c.carryWeight()) / Math.max(0.5, d.weight)));
  const k = st.inv!.take(id, Math.min(n, room, 40));
  const got = giveTo(c, id, k);
  if (got < k) st.inv!.add(id, k - got);
  return 'busy';
}

// ---------------------------------------------------------------- construction
JOB_HANDLERS.build = (c, job, o, dt, think) => {
  if (o.kind !== 'site') return 'done';
  const miss = missing(o);
  if (miss) {
    const r = fetch(c, miss[0], miss[1], o, (k) => { o.data.have[miss[0]] = (o.data.have[miss[0]] ?? 0) + k; });
    if (r === 'none') {
      if (think && !c.mem.warnMat) { S.fx.notice(`${c.name} needs ${miss[1]} × ${ITEM[miss[0]].name} to build the ${o.data.name}.`); c.mem.warnMat = true; }
      return 'skip';
    }
    c.mem.warnMat = false;
    return 'work';
  }
  if (!walkTo(c, o.x, o.z, Math.max(1.8, o.data.r - 0.5))) return 'work';
  c.dir = Math.atan2(o.x - c.x, o.z - c.z);
  c.act = 'build';
  c.actDur = 1;
  const rate = 0.55 + c.skill('engineering') * 0.018 + c.skill('labouring') * 0.004;
  o.data.work += dt * rate;
  o.progress = o.data.work / BUILDABLE[o.data.bkey].work;
  if (Math.floor(o.data.work) % 12 === 0 && Math.random() < dt) train(c, 'engineering', 0.6, 1);
  if (rng.chance(dt * 0.7)) S.fx.sound('build', o.x, o.z, 0.5);
  if (o.progress >= 1) { finishSite(o); return 'done'; }
  return 'work';
};

export function finishSite(site: WObj, quiet = false) {
  const b = BUILDABLE[site.data.bkey];
  S.W.removeObj(site);
  let o: WObj;
  if (b.kind === 'building') {
    o = placeBuilding(S.W, S.T, null, BUILDINGS[b.building!], undefined, b.name, site.x, site.z, site.rot, 'player', 0, b.style ?? 'shanty', rng);
    o.data.bkey = b.key;
  } else {
    const data: any = { bkey: b.key, name: b.name };
    if (b.recipes) { data.recipes = b.recipes; data.recipe = b.job === 'craft' ? '' : b.recipes[0]; data.prog = 0; data.queue = []; }
    if (b.job) { data.job = b.job; data.jobLabel = b.job === 'operate' ? `Operate ${b.name}` : b.job === 'craft' ? `Craft at ${b.name}` : b.job === 'research' ? 'Research' : b.job === 'farm' ? `Farm ${b.name}` : b.job === 'turret' ? 'Man turret' : b.job === 'watch' ? 'Keep watch' : `Cook at ${b.name}`; }
    if (b.power) data.power = b.power;
    if (b.crop) { data.crop = b.crop; data.growth = 0; data.w = b.w; data.d = b.d; }
    if (b.wall) { Object.assign(data, { len: b.wall.len, h: b.wall.h, thick: b.w, style: b.wall.style, ax: site.x - Math.sin(site.rot) * b.d / 2, az: site.z - Math.cos(site.rot) * b.d / 2, bx: site.x + Math.sin(site.rot) * b.d / 2, bz: site.z + Math.cos(site.rot) * b.d / 2 }); }
    if (b.kind === 'gate') { data.w = b.d - 1.2; data.style = b.def; }
    if (b.kind === 'tower') { data.h = 7; data.r = 2; }
    const inv = b.store ? new Grid(b.store.w, b.store.h) : b.recipes ? new Grid(6, 6) : b.key === 'generator' ? new Grid(4, 4) : undefined;
    if (b.store?.accepts) data.accepts = b.store.accepts;
    o = S.W.addObj({ id: 0, kind: b.kind, def: b.def, x: site.x, z: site.z, y: site.y, rot: b.kind === 'wall' || b.kind === 'gate' ? site.rot : site.rot, owner: 'player', site: 0, parent: site.parent, built: true, inv, data, open: b.kind === 'gate' ? true : undefined });
    if (b.kind === 'wall' || b.kind === 'gate') o.y = Math.min(S.T.heightAt(data.ax ?? site.x, data.az ?? site.z), S.T.heightAt(data.bx ?? site.x, data.bz ?? site.z));
    if (o.parent) {
      const p = S.W.objs.get(o.parent);
      if (p?.kind === 'building') { p.data.furniture.push(o.id); p.data.v = (p.data.v ?? 0) + 1; o.y = p.y; }
    }
  }
  navDirty(o);
  S.W.rebuildObjHash();
  clearFootprint(o);
  emit('objs');
  if (!quiet) {
    S.fx.notice(`${b.name} finished.`, 'good');
    S.fx.sound('build', o.x, o.z, 1);
  }
  return o;
}

/** Steps anyone standing where something has just gone up out onto open ground. */
function clearFootprint(o: WObj) {
  const [w, d] = footprint(o);
  const r = Math.hypot(w, d) / 2 + 0.6;
  for (const c of S.W.active) {
    if (c.carriedBy || c.cage || c.bed || Math.hypot(c.x - o.x, c.z - o.z) > r || S.nav.walkable(c.x, c.z)) continue;
    const p = S.nav.nearestOpen(c.x, c.z, r + 3);
    if (p) { c.x = p[0]; c.z = p[1]; c.path = null; }
  }
}

/** Lets go of whoever is held by, lying in or sitting on something that is going: a prisoner walks out of a torn-down cage. */
function release(o: WObj) {
  for (const c of S.W.chars.values()) {
    if (c.cage === o.id) freeFromCage(c.id);
    if (c.bed === o.id || c.mem.using === o.id) { leaveFurniture(c); c.mem.sit = false; }
    if (c.mem.seat === o.id) c.mem.seat = 0;
  }
  o.occupant = 0;
  o.user = 0;
}

/** Who sits locked in a cage or chained to a post: this one, or any in a building. */
export function prisonersIn(o: WObj): Char[] {
  const held = (f: WObj | undefined) => (f && (f.kind === 'cage' || f.kind === 'shackle_post') ? S.W.char(f.occupant ?? 0) : undefined);
  const all = [o, ...(o.kind === 'building' ? (o.data.furniture ?? []).map((id: number) => S.W.objs.get(id)) : [])];
  return all.map(held).filter((c): c is Char => !!c);
}

/** Tears something down, returning half its materials on the ground and letting go of anyone in or on it. */
export function deconstruct(o: WObj) {
  const b = BUILDABLE[o.data?.bkey] ?? BUILDABLE[o.def];
  const refund: Record<string, number> = {};
  if (o.kind === 'site') for (const [id, n] of Object.entries(o.data.have as Record<string, number>)) refund[id] = n;
  else if (b) for (const [id, n] of Object.entries(b.cost)) refund[id] = Math.floor(n / 2);
  const items = o.inv ? o.inv.items.slice() : [];
  release(o);
  if (o.kind === 'building') for (const fid of o.data.furniture ?? []) { const f = S.W.objs.get(fid); if (f) { release(f); if (f.inv) items.push(...f.inv.items); S.W.objs.delete(fid); } }
  S.W.removeObj(o);
  // out of the building it stood in, so the building redraws without it
  const p = o.parent ? S.W.objs.get(o.parent) : undefined;
  if (p?.kind === 'building' && p.data.furniture) { p.data.furniture = p.data.furniture.filter((id: number) => id !== o.id); p.data.v = (p.data.v ?? 0) + 1; }
  const g = new Grid(10, 10);
  for (const [id, n] of Object.entries(refund)) if (n > 0) g.add(id, n);
  emit('world:drop', o.x, o.z, [...g.items, ...items]);
  navDirty(o);
  emit('objs');
}

// ---------------------------------------------------------------- machines and cooking
function recipeReady(o: WObj, r: Recipe) {
  for (const [id, n] of Object.entries(r.in)) if ((o.inv?.count(id) ?? 0) < n) return [id, n - (o.inv?.count(id) ?? 0)] as [string, number];
  return null;
}

function outputsFull(o: WObj) {
  if (!o.inv) return false;
  for (const it of o.inv.items) if (!RECIPES[o.data.recipe]?.in[it.id] && it.n >= 10) return true;
  return o.inv.items.length >= 10;
}

/** Your storage nearest a workshop that takes an item and still has room for it. */
function storeFor(it: Item, near: WObj): WObj | null {
  const d = ITEM[it.id];
  let best: WObj | null = null, bd = Infinity;
  for (const s of S.W.objs.values()) {
    if (s.owner !== 'player' || s.kind !== 'storage' || !s.inv) continue;
    const accepts = s.data?.accepts as string[] | undefined;
    if (accepts && !accepts.includes(it.id) && !accepts.includes(d.cat)) continue;
    if (!s.inv.findSpot(d) && !s.inv.items.some((x) => x.id === it.id && x.q === it.q && x.stolen === it.stolen && x.n < d.stack)) continue;
    const dd = Math.hypot(s.x - near.x, s.z - near.z);
    if (dd < bd) { bd = dd; best = s; }
  }
  return best;
}

/** Something told apart from others of its kind (a grade, wear, a stolen mark, a pack's contents): it travels as itself. */
const oneOfAKind = (it: Item) => !!ITEM[it.id].graded || ITEM[it.id].stack <= 1 || it.cond !== undefined || !!it.stolen || !!it.inv;

/** How many of a kind someone carries unmarked, and taking some of those: plain stock, all alike. */
function plainCount(c: Char, id: string) {
  let n = 0;
  for (const g of [c.inv, c.eq.back?.inv]) for (const it of g?.items ?? []) if (it.id === id && !it.stolen) n += it.n;
  return n;
}
function takePlain(c: Char, id: string, n: number) {
  let got = 0;
  for (const g of [c.inv, c.eq.back?.inv]) for (const it of g?.items.slice() ?? []) {
    if (got >= n || it.id !== id || it.stolen) continue;
    const k = Math.min(n - got, it.n);
    it.n -= k; got += k;
    if (it.n <= 0) g!.remove(it);
  }
  return got;
}

/**
 * Carries what a workshop has made to storage. A thing with a grade or wear
 * travels as itself, by its uid, so its grade survives; plain stock (plates,
 * bandages) goes by kind and count, folded into the hauler's own stacks if need
 * be. Either way only what was picked up is put down: nothing of the hauler's.
 */
function haulOutputs(c: Char, o: WObj): boolean {
  const job = c.brain.haul as { id: string; uid?: number; n?: number; to: number } | null;
  if (!job) {
    const r = RECIPES[o.data.recipe];
    const out = o.inv!.items.find((it) => !r || !r.in[it.id]);
    if (!out) return false;
    const st = storeFor(out, o);
    if (!st) return false;
    if (!walkTo(c, o.x, o.z, 2)) return true;
    const d = ITEM[out.id];
    const packs = [c.inv, d.pack ? undefined : c.eq.back?.inv].filter(Boolean) as Grid[];
    if (oneOfAKind(out)) {
      // a cell of its own: folded into a stack of the hauler's it would lose itself
      const pack = packs.find((g) => g.findSpot(d));
      if (!pack) return false;
      const [x, y] = pack.findSpot(d)!;
      o.inv!.remove(out);
      pack.put(out, x, y);
      c.brain.haul = { id: out.id, uid: out.uid, to: st.id };
      return true;
    }
    const n0 = out.n;
    o.inv!.remove(out);
    const placed = packs.some((g) => g.put(out));
    if (!placed) o.inv!.put(out); // what the hauler cannot carry stays in the workshop
    const k = placed ? n0 : n0 - out.n;
    if (k <= 0) return false;
    c.brain.haul = { id: out.id, n: k, to: st.id };
    return true;
  }
  const dest = S.W.objs.get(job.to);
  if (!dest?.inv) { c.brain.haul = null; return false; }
  let full = false;
  if (job.uid === undefined) {
    const n = Math.min(job.n ?? 0, plainCount(c, job.id));
    if (!n) { c.brain.haul = null; return false; }
    if (!walkTo(c, dest.x, dest.z, 2)) return true;
    const left = dest.inv.add(job.id, takePlain(c, job.id, n));
    if (left) {
      giveTo(c, job.id, left);
      // another store with room takes the rest
      const mine = [c.inv, c.eq.back?.inv].flatMap((g) => g?.items ?? []).find((x) => x.id === job.id && !x.stolen);
      const next = mine ? storeFor(mine, dest) : null;
      if (next && next !== dest) { c.brain.haul = { id: job.id, n: left, to: next.id }; return true; }
      full = true;
    }
  } else {
    const pack = [c.inv, c.eq.back?.inv].find((g) => g?.items.some((x) => x.uid === job.uid));
    const it = pack?.items.find((x) => x.uid === job.uid);
    if (!pack || !it) { c.brain.haul = null; return false; }
    if (!walkTo(c, dest.x, dest.z, 2)) return true;
    pack.remove(it);
    if (!dest.inv.put(it)) {
      pack.put(it);
      const next = storeFor(it, dest);
      if (next && next !== dest) { c.brain.haul = { ...job, to: next.id }; return true; }
      full = true;
    }
  }
  // the store filled up on the way and no other has room: what is left stays with the hauler
  if (full && !c.mem.warnFull) S.fx.notice(`The ${dest.data?.name ?? 'storage'} is full.`);
  c.mem.warnFull = full;
  c.brain.haul = null;
  return true;
}

function workMachine(c: Char, o: WObj, dt: number, think: boolean, anim: 'craft' | 'build' | 'mine'): 'work' | 'skip' | 'done' {
  const r = RECIPES[o.data.recipe];
  if (!r) return 'skip';
  if (c.brain.haul || outputsFull(o)) { if (haulOutputs(c, o)) return 'work'; }
  const need = recipeReady(o, r);
  if (need) {
    const res = fetch(c, need[0], need[1] * 3, o, (k) => { o.inv!.add(need[0], k); });
    if (res === 'none') {
      if (think && !c.mem.warnIn) { S.fx.notice(`${o.data.name} needs ${ITEM[need[0]].name}.`); c.mem.warnIn = true; }
      return 'skip';
    }
    c.mem.warnIn = false;
    return 'work';
  }
  if (!walkTo(c, o.x, o.z, 2)) return 'work';
  c.dir = Math.atan2(o.x - c.x, o.z - c.z);
  c.act = anim;
  c.actDur = 1.2;
  const power = o.data.power && o.data.power < 0 ? (o.data.powerOK ?? 0) : 1;
  if (power <= 0.05) { if (think && !c.mem.warnPow) { S.fx.notice(`${o.data.name} has no power. Build a generator.`); c.mem.warnPow = true; } return 'skip'; }
  c.mem.warnPow = false;
  const skill = c.skill(r.skill as Skill);
  o.data.prog += dt * (0.55 + skill * 0.02) * power;
  if (o.data.prog >= r.time) {
    o.data.prog = 0;
    for (const [id, n] of Object.entries(r.in)) o.inv!.take(id, n);
    for (const [id, n] of Object.entries(r.out)) {
      const q = r.graded ? craftGrade(skill) : 2;
      // what will not fit in the workshop goes on the ground beside it: only that, not the whole batch again
      const left = o.inv!.add(id, n, q);
      if (left) emit('world:drop', o.x, o.z, [makeItem(id, left, q)]);
    }
    train(c, r.skill as Skill, 1.2, 1);
    S.fx.sound('craft', o.x, o.z, 0.6);
    return 'work';
  }
  return 'work';
}

export function craftGrade(skill: number) {
  const g = Math.round(0.4 + skill / 18 + rng.gauss(0, 0.6));
  return Math.max(0, Math.min(5, g));
}

JOB_HANDLERS.operate = (c, job, o, dt, think) => {
  if (o.def === 'dummy') {
    if (!walkTo(c, o.x, o.z, 1.6)) return 'work';
    c.dir = Math.atan2(o.x - c.x, o.z - c.z);
    c.drawn = true;
    if (!c.atk && c.atkCD <= 0) { c.atk = { t: 0, dur: c.attackTime(), variant: rng.int(0, 3), hit: true, target: 0 }; }
    const w = c.weaponStats();
    if (c.atk && c.atk.t < 0.05) {
      if (c.sk[SK.melee_atk] < 20) train(c, 'melee_atk', 0.25, 0.6);
      if (c.sk[SK[w.skill]] < 20) train(c, w.skill, 0.25, 0.6);
      if (c.sk[SK.melee_def] < 20) train(c, 'melee_def', 0.12, 0.6);
    }
    return 'work';
  }
  if (!o.inv) return 'skip';
  return workMachine(c, o, dt, think, 'craft');
};

JOB_HANDLERS.cook = (c, job, o, dt, think) => {
  if (!o.inv) return 'skip';
  // pick whatever recipe we have ingredients for
  const recs = (o.data.recipes as string[]).filter((k) => !RECIPES[k].research || S.W.research.done.has(RECIPES[k].research!));
  if (!o.data.recipe) o.data.recipe = recs[0];
  for (const k of recs) {
    const r = RECIPES[k];
    const haveAll = Object.entries(r.in).every(([id, n]) => (o.inv!.count(id) + (storageWith(id, o.x, o.z, 260, o) ? 99 : 0)) >= n);
    if (haveAll) { o.data.recipe = k; break; }
  }
  return workMachine(c, o, dt, think, 'craft');
};

JOB_HANDLERS.craft = (c, job, o, dt, think) => {
  if (!o.inv) return 'skip';
  const q = o.data.queue as { r: string; n: number }[];
  while (q.length && q[0].n <= 0) q.shift();
  if (!q.length) { if (think && !c.mem.warnQ) { S.fx.notice(`Nothing queued at the ${o.data.name}. Click it to choose what to make.`); c.mem.warnQ = true; } return 'skip'; }
  c.mem.warnQ = false;
  if (o.data.recipe !== q[0].r) { o.data.recipe = q[0].r; o.data.prog = 0; }
  const before = o.data.prog;
  const res = workMachine(c, o, dt, think, 'craft');
  if (before > 0 && o.data.prog === 0 && res === 'work') q[0].n--;
  return res;
};

// ---------------------------------------------------------------- research
/** Techs whose relics are spent but which are not learned yet. Kept in the saved flags, so none is ever charged twice. */
function paidTechs(): string[] {
  return (S.W.flags.researchPaid ??= []) as string[];
}

/** Whether a tech's relics are already paid: it costs nothing, it was paid for before, or it is the one under way. */
export function researchPaid(key: string): boolean {
  return !TECH[key]?.cost || paidTechs().includes(key) || S.W.research.current === key;
}

/** How many of an item your people carry and your storage holds. */
export function countOwned(id: string) {
  let n = 0;
  for (const o of S.W.objs.values()) if (o.owner === 'player' && o.inv) n += o.inv.count(id);
  for (const c of S.W.playerChars()) n += c.inv.count(id) + (c.eq.back?.inv?.count(id) ?? 0);
  return n;
}
function takeOwned(id: string, n: number) {
  for (const c of S.W.playerChars()) { n -= c.inv.take(id, n); if (n <= 0) return; if (c.eq.back?.inv) n -= c.eq.back.inv.take(id, n); if (n <= 0) return; }
  for (const o of S.W.objs.values()) if (o.owner === 'player' && o.inv) { n -= o.inv.take(id, n); if (n <= 0) return; }
}

/**
 * Sets your researchers on a tech. Its relics come out of your packs and
 * storage the first time only: switching topics loses the progress made, never
 * what was paid, and going back to a paid tech costs nothing. Returns why not, or ''.
 */
export function startResearch(key: string): string {
  const R = S.W.research, t = TECH[key];
  if (!t) return 'There is no such research.';
  if (R.done.has(key)) return `${t.name} is already known.`;
  const before = (t.needs ?? []).filter((k) => !R.done.has(k));
  if (before.length) return `Research ${before.map((k) => TECH[k].name).join(' and ')} first.`;
  if (R.current === key) return '';
  if (!researchPaid(key)) {
    for (const [id, n] of Object.entries(t.cost!)) if (countOwned(id) < n) return `You need ${n} ${ITEM[id].name} in storage to research this.`;
    for (const [id, n] of Object.entries(t.cost!)) takeOwned(id, n);
    paidTechs().push(key);
  }
  // the topic being dropped keeps its relics paid (in an older save it was paid for when it started)
  if (R.current && TECH[R.current]?.cost && !paidTechs().includes(R.current)) paidTechs().push(R.current);
  R.current = key;
  R.progress = 0;
  emit('research');
  return '';
}

JOB_HANDLERS.research = (c, job, o, dt, think) => {
  const R = S.W.research;
  const tech = TECH[R.current];
  if (!tech) { if (think && !c.mem.warnR) { S.fx.notice('Choose something to research (U).'); c.mem.warnR = true; } return 'skip'; }
  c.mem.warnR = false;
  if (!walkTo(c, o.x, o.z, 1.8)) return 'work';
  c.dir = Math.atan2(o.x - c.x, o.z - c.z);
  c.act = 'research';
  c.actDur = 2;
  R.progress += dt * (0.4 + c.skill('science') * 0.022);
  if (rng.chance(dt * 0.1)) train(c, 'science', 1, tech.tier);
  if (R.progress >= tech.time) {
    R.done.add(tech.key);
    S.W.flags.researchPaid = paidTechs().filter((k) => k !== tech.key);
    R.current = '';
    R.progress = 0;
    S.fx.notice(`Research complete: ${tech.name}.`, 'good');
    S.W.say(`Researched ${tech.name}.`, 'good', S.clock.t);
    emit('research');
  }
  return 'work';
};

JOB_HANDLERS.farm = (c, job, o, dt, think) => {
  if (o.kind !== 'farm') return 'done';
  const d = o.data;
  if ((d.growth ?? 0) >= 1) {
    if (!walkTo(c, o.x, o.z, Math.max(d.w, d.d) / 2)) return 'work';
    c.act = 'farm'; c.actDur = 2;
    d.harvest = (d.harvest ?? 0) + dt;
    if (d.harvest > 6) {
      d.harvest = 0;
      const yieldN = Math.round((d.w * d.d) / 8 * (0.5 + c.skill('farming') * 0.012) * (S.T.regionAt(o.x, o.z).fertility * 0.7 + 0.3));
      const got = giveTo(c, d.crop, yieldN);
      c.brain.reaped = (c.brain.reaped ?? 0) + got;
      if (got < yieldN) emit('world:drop', c.x, c.z, [makeItem(d.crop, yieldN - got)]);
      d.growth = 0;
      train(c, 'farming', 2, 1);
      S.fx.notice(`${c.name} harvested ${yieldN} ${ITEM[d.crop].name}.`, 'good');
      emit('objs');
    }
    return 'work';
  }
  // carry the harvest away (only what was reaped: a crop fetched for a loom or stove stays with the one using it)
  const held = Math.min(c.brain.reaped ?? 0, carryCount(c, d.crop));
  if (held > 0) {
    const st = [...S.W.objs.values()].filter((s) => s.owner === 'player' && s.kind === 'storage' && s.inv && (!s.data?.accepts || s.data.accepts.includes(d.crop) || s.data.accepts.includes('resource')))
      .sort((a, b) => Math.hypot(a.x - c.x, a.z - c.z) - Math.hypot(b.x - c.x, b.z - c.z))[0];
    if (st) {
      if (!walkTo(c, st.x, st.z, 2)) return 'work';
      const n = takeFrom(c, d.crop, held);
      const left = st.inv!.add(d.crop, n);
      if (left) giveTo(c, d.crop, left);
      c.brain.reaped = Math.max(0, (c.brain.reaped ?? 0) - (n - left));
      return 'work';
    }
  }
  // tend the crop every hour and a half or so while it grows; in between, the farmer's other work comes first
  const due = S.clock.t - (d.tended ?? -1e9) > 1.5 * HOUR;
  if (!due && c.brain.tending !== o.id) return 'skip';
  if (!walkTo(c, o.x + Math.sin(S.time * 0.05) * d.w * 0.3, o.z, Math.max(d.w, d.d) / 2)) return 'work';
  c.brain.tending = o.id;
  c.act = 'farm'; c.actDur = 3;
  c.brain.tendT = (c.brain.tendT ?? 0) + dt;
  if (c.brain.tendT > 30) {
    d.tended = S.clock.t;
    c.brain.tendT = 0;
    c.brain.tending = 0;
    train(c, 'farming', 0.5, 1);
    return 'skip';
  }
  return 'work';
};

JOB_HANDLERS.turret = (c, job, o, dt, think) => {
  const reach = reachOf(o);
  if (!walkTo(c, o.x, o.z, reach + 0.4)) return 'work';
  c.brain.post = o.id; // at their post: the fight comes to them (see playerAI)
  const e = findEnemy(c, 70);
  o.data.reload = Math.max(0, (o.data.reload ?? 0) - dt);
  if (e) o.rot = Math.atan2(e.x - o.x, e.z - o.z);
  // the gunner works it from behind, opposite where it points (in eighths of a turn, not every twitch)
  const a = Math.round(o.rot / (Math.PI / 4)) * (Math.PI / 4);
  const sx = o.x - Math.sin(a) * (reach - 0.25), sz = o.z - Math.cos(a) * (reach - 0.25);
  if (Math.hypot(c.x - sx, c.z - sz) > 0.6 && S.nav.walkable(sx, sz)) { goTo(c, sx, sz); c.move = 'walk'; }
  else stop(c);
  c.dir = o.rot;
  if (e) {
    // the line of fire starts at the muzzle, clear of the turret's own frame
    const mx = o.x + Math.sin(o.rot) * 1.3, mz = o.z + Math.cos(o.rot) * 1.3;
    if (o.data.reload <= 0 && S.nav.clearLine(mx, mz, e.x, e.z)) {
      const d = dist(c, e);
      const p = Math.max(0.1, Math.min(0.9, 0.35 + c.skill('turrets') * 0.008 - d / 200));
      const hit = rng.chance(p);
      S.fx.shot(c, e.x, e.z, hit, 'harpoon');
      S.fx.sound('twang', o.x, o.z);
      if (hit) applyDamage(e, rng.pick([1, 2, 1, 3, 4, 5, 6]), 55, 25, c, 1.4, true, 0.4);
      o.data.reload = 5.5 - c.skill('turrets') * 0.03;
      train(c, 'turrets', 1, 1 + d / 50);
    }
  }
  return 'work';
};

/** Keeping watch from a tower: twice the sight (see canSee), the alarm raised, a crossbow used from up there. */
JOB_HANDLERS.watch = (c, job, o, dt, think) => {
  if (c.mem.using !== o.id) {
    if (o.user && o.user !== c.id && S.W.char(o.user)?.mem.using === o.id) return 'skip'; // one lookout at a time
    if (!walkTo(c, o.x, o.z, reachOf(o))) return 'work';
    leaveFurniture(c);
    c.mem.using = o.id; o.user = c.id;
    c.x = o.x; c.z = o.z;
  }
  stop(c);
  c.brain.post = o.id;
  if (!think) return 'work';
  const e = findEnemy(c, 120);
  if (!e) return 'work';
  c.dir = Math.atan2(e.x - c.x, e.z - c.z);
  // a crossbow from the platform: the line of fire starts at its edge
  if (canShoot(c)) {
    const r = (o.data?.r ?? 2) + 0.6;
    shoot(c, e, [o.x + Math.sin(c.dir) * r, o.z + Math.cos(c.dir) * r]);
  }
  // the alarm, once for each band that turns up
  const sq = S.W.squadOf(e);
  const key = sq?.id ?? e.id;
  if (c.brain.alarm !== key || S.time - (c.brain.alarmT ?? -1e9) > 300) {
    c.brain.alarm = key; c.brain.alarmT = S.time;
    const who = sq && sq.members.length > 1 ? `${sq.members.length} ${sq.name ?? 'strangers'}` : e.animal ? e.name.toLowerCase() : e.name;
    S.fx.notice(`${c.name} spots ${who} to the ${compass(o.x, o.z, e.x, e.z)}!`, 'bad');
    S.fx.sound('alarm', o.x, o.z, 1);
    // wake the base
    for (const p of S.W.playerChars()) if (p.sleeping && Math.hypot(p.x - o.x, p.z - o.z) < 120) { p.sleeping = false; if (p.bed) leaveFurniture(p); }
  }
  return 'work';
};

function compass(x0: number, z0: number, x1: number, z1: number) {
  const a = Math.atan2(x1 - x0, -(z1 - z0)); // 0 = north (towards -z), clockwise
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}

// ---------------------------------------------------------------- upkeep
let upT = 0;

/** How well a crop takes to the ground: fertile soil for most, water for riceweed and dreamleaf, poor ground for cactus and the drug crops of the dry and the dark. */
export function cropFitness(crop: string, fert: number, wet: number): number {
  switch (crop) {
    case 'cactus': return 0.6 + (1 - fert) * 0.4;
    case 'riceweed': return wet;
    case 'dreamleaf': return fert * 0.5 + wet * 0.5;
    case 'glowcap': return 0.35 + wet * 0.45 + (1 - fert) * 0.2;
    case 'bloodthorn': return 0.4 + (1 - wet) * 0.4 + (1 - fert) * 0.2;
    default: return fert;
  }
}

export function tickBase(dt: number) {
  upT -= dt;
  if (upT > 0) return;
  upT = 3;
  const W = S.W;
  // power: generators within 120 m of a consumer supply it
  const gens: WObj[] = [], users: WObj[] = [];
  for (const o of W.objs.values()) {
    if (o.owner !== 'player' || !o.data?.power) continue;
    if (o.data.power > 0) gens.push(o); else users.push(o);
  }
  const out = new Map<number, number>();
  for (const g of gens) out.set(g.id, users.some((u) => Math.hypot(g.x - u.x, g.z - u.z) < 150) ? genOutput(g) : 0);
  for (const u of users) {
    let supply = 0, demand = 0;
    for (const g of gens) if (Math.hypot(g.x - u.x, g.z - u.z) < 150) supply += out.get(g.id)!;
    for (const v of users) if (Math.hypot(v.x - u.x, v.z - u.z) < 150) demand += -v.data.power;
    u.data.powerOK = demand > 0 ? Math.min(1, supply / demand) : 1;
  }
  // crops grow
  const hours = (3 * RATE) / 3600;
  for (const o of W.objs.values()) {
    if (o.kind !== 'farm' || o.owner !== 'player') continue;
    const d = o.data;
    if (d.growth >= 1) continue;
    const reg = S.T.regionAt(o.x, o.z), fert = reg.fertility, wet = reg.water_table;
    const cropFit = cropFitness(d.crop, fert, wet);
    let water = 1;
    S.W.objHash.near(o.x, o.z, 40, (w) => { if (w.kind === 'well' && w.owner === 'player') water = 1.35; });
    const tended = S.clock.t - (d.tended ?? -1e9) < 7200 ? 1.2 : 0.75;
    const sky = S.weather?.at(o.x, o.z);
    // rain helps most crops and heat hurts them; bloodthorn is the other way about
    let rain = sky && sky.kind === 'rain' ? 1 + 0.4 * sky.i : sky && sky.kind === 'heat' ? 1 - 0.3 * sky.i : 1;
    if (d.crop === 'bloodthorn') rain = 2 - rain;
    // glowcaps grow in the dark
    const night = d.crop === 'glowcap' ? (S.clock.isNight ? 1.5 : 0.7) : 1;
    const before = d.growth;
    d.growth = Math.min(1, d.growth + (hours / 44) * Math.max(0.1, cropFit) * water * tended * rain * night);
    if (Math.floor(before * 5) !== Math.floor(d.growth * 5)) emit('objs');
    if (before < 1 && d.growth >= 1) S.fx.notice(`The ${d.name ?? 'crop'} is ready to harvest.`, 'good');
  }
  // hungry people eat from food storage nearby
  for (const c of W.playerChars()) {
    if (!c.up || c.robot || c.hunger > 120 || c.atk) continue;
    const has = c.inv.first((d) => d.cat === 'food') || c.eq.back?.inv?.first((d) => d.cat === 'food');
    if (has) continue;
    for (const o of W.objs.values()) {
      if (o.owner !== 'player' || o.kind !== 'storage' || !o.inv) continue;
      if (Math.hypot(o.x - c.x, o.z - c.z) > 60) continue;
      const f = o.inv.first((d) => d.cat === 'food');
      if (!f) continue;
      // at the base: with a table to sit at, the same food goes further
      c.hunger = Math.min(300, c.hunger + (ITEM[f.id].food ?? 0) * tableBonus(o.x, o.z, 40));
      f.n--; if (f.n <= 0) o.inv.remove(f);
      break;
    }
  }
}

function genOutput(g: WObj) {
  const b = BUILDABLE[g.data.bkey];
  if (!b) return 0;
  if (b.key === 'windmill') {
    const reg = S.T.regionAt(g.x, g.z).key;
    const windy = reg === 'salt' || reg === 'highlands' || reg === 'bonesea' || reg === 'flats' || reg === 'coast' ? 1.2 : 0.8;
    return b.power! * windy * (0.7 + 0.3 * Math.sin(S.time * 0.01 + g.id));
  }
  if (b.key === 'generator') {
    // burns fuel from its tank (a can lasts about six hours), and tops the tank up from storage nearby
    if (!g.inv) g.inv = new Grid(4, 4);
    if (g.inv.count('fuel') < 2) {
      const st = storeWith('fuel', g.x, g.z, FUEL_REACH);
      if (st) g.inv.add('fuel', st.inv!.take('fuel', 3 - g.inv.count('fuel')));
    }
    g.data.fuelT = (g.data.fuelT ?? 0) - 3;
    if (g.data.fuelT <= 0) {
      if (g.inv.take('fuel', 1)) g.data.fuelT = 600;
      else {
        g.data.fuelT = 0;
        if (!g.data.dry) { g.data.dry = true; S.fx.notice(`The ${g.data.name ?? 'generator'} is out of fuel. Put fuel in it or in storage nearby.`); }
        return 0;
      }
    }
    g.data.dry = false;
    return b.power!;
  }
  return b.power ?? 0;
}

/** How far a fuel generator reaches for fuel in your storage. */
export const FUEL_REACH = 40;

/** The nearest of your storage boxes holding an item (not a machine's own stock). */
function storeWith(id: string, x: number, z: number, r: number): WObj | null {
  let best: WObj | null = null, bd = r;
  for (const o of S.W.objs.values()) {
    if (o.owner !== 'player' || (o.kind !== 'storage' && o.kind !== 'crate') || !o.inv?.count(id)) continue;
    const d = Math.hypot(o.x - x, o.z - z);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/** Where the player's base is, if they have one. */
/** Part of a town: its own buildings and furniture, or something built inside a house bought there. */
export function inTown(o: WObj) {
  return !!o.site || !!(o.parent && S.W.objs.get(o.parent)?.site);
}

export function playerBase(): { x: number; z: number; n: number } | null {
  let x = 0, z = 0, n = 0;
  // houses bought in towns are not a base, however well furnished: the town keeps the raiders off
  for (const o of S.W.objs.values()) if (o.owner === 'player' && o.kind !== 'pile' && o.kind !== 'site' && !inTown(o)) { x += o.x; z += o.z; n++; }
  return n >= 4 ? { x: x / n, z: z / n, n } : null;
}

export { GRADES };
