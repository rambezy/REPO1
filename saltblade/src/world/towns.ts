// Town layouts: walls with gates where the roads arrive, streets to a
// central plaza, buildings packed along them facing the streets, furniture
// inside each by use, fields outside, and posts for guards.
import { RNG } from '../core/rng';
import { Terrain, Site } from './terrain';
import { SettlementDef } from '../content/layout';
import { TOWN_PLANS, BUILDINGS, SHOP_BUILDING, STYLES, BAR_NAMES, SHOP_NAMES, BDef, TownPlan } from '../content/buildings';
import { World } from '../sim/world';
import { WObj, ObjKind } from '../sim/objects';
import { Grid } from '../sim/inventory';
import { segDist } from '../core/math';

export interface Door { side: 'n' | 's' | 'e' | 'w'; off: number; w: number; }

export interface BuildingData {
  def: string;
  name: string;
  use: string;
  style: string;
  w: number;
  d: number;
  h: number;
  doors: Door[];
  floors: number;
  roof: string;
  stilts: number;
  seed: number;
  shop?: string; // shop kind
  shopId?: number; // shop counter object
  furniture: number[];
  wallCol: number;
  roofCol: number;
}

export interface TownInfo {
  site: Site;
  plan: TownPlan;
  style: string;
  buildings: WObj[];
  gates: { x: number; z: number; a: number }[];
  posts: { x: number; z: number; dir: number; kind: 'gate' | 'tower' | 'door' | 'plaza' }[];
  patrol: { x: number; z: number }[];
  beds: number[];
  shops: { kind: string; building: WObj; counter: WObj; spot: [number, number, number] }[];
  bars: { building: WObj; counter: WObj; spot: [number, number, number]; seats: [number, number, number, number][] }[];
  cages: number[];
  fields: WObj[];
  jobs: { x: number; z: number; dir: number }[];
  plazaR: number;
}

export function toWorld(b: WObj, lx: number, lz: number): [number, number] {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
}

/** OBB overlap test (2D separating axes) with a margin. */
function obbOverlap(a: { x: number; z: number; w: number; d: number; rot: number }, b: typeof a, margin: number) {
  const axes = [a.rot, a.rot + Math.PI / 2, b.rot, b.rot + Math.PI / 2];
  const corners = (o: typeof a) => {
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const hw = o.w / 2 + margin / 2, hd = o.d / 2 + margin / 2;
    return [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([lx, lz]) => [o.x + lx * c + lz * s, o.z - lx * s + lz * c]);
  };
  const ca = corners(a), cb = corners(b);
  for (const ang of axes) {
    const ax = Math.cos(ang), az = -Math.sin(ang);
    let amin = Infinity, amax = -Infinity, bmin = Infinity, bmax = -Infinity;
    for (const [x, z] of ca) { const p = x * ax + z * az; amin = Math.min(amin, p); amax = Math.max(amax, p); }
    for (const [x, z] of cb) { const p = x * ax + z * az; bmin = Math.min(bmin, p); bmax = Math.max(bmax, p); }
    if (amax < bmin || bmax < amin) return false;
  }
  return true;
}

function obj(W: World, kind: ObjKind, def: string, x: number, z: number, y: number, rot: number, owner: string, site: number, parent = 0, extra: Partial<WObj> = {}): WObj {
  return W.addObj({ id: 0, kind, def, x, z, y, rot, owner, site, parent, built: true, ...extra });
}

export function buildTown(W: World, T: Terrain, site: Site, def: SettlementDef, seed: number): TownInfo {
  const rng = new RNG(seed);
  const plan = TOWN_PLANS[def.tmpl];
  const style = plan.style;
  const R = site.r;
  const info: TownInfo = { site, plan, style, buildings: [], gates: [], posts: [], patrol: [], beds: [], shops: [], bars: [], cages: [], fields: [], jobs: [], plazaR: 0 };
  const cx = site.x, cz = site.z;
  const ground = (x: number, z: number) => T.heightAt(x, z);

  // gates where roads arrive
  const angles: number[] = [];
  for (const rd of T.roads) {
    if (rd.a !== def.key && rd.b !== def.key) continue;
    const pts = rd.pts;
    const n = pts.length / 2;
    const fromStart = rd.a === def.key;
    for (let k = 0; k < n; k++) {
      const i = fromStart ? k : n - 1 - k;
      const d = Math.hypot(pts[i * 2] - cx, pts[i * 2 + 1] - cz);
      if (d > R * 0.95) { angles.push(Math.atan2(pts[i * 2] - cx, pts[i * 2 + 1] - cz)); break; }
    }
  }
  if (!angles.length) angles.push(rng.range(0, Math.PI * 2));
  // merge close gates
  angles.sort((a, b) => a - b);
  const gateA: number[] = [];
  for (const a of angles) if (!gateA.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < 0.5)) gateA.push(a);
  const wallR = R * 0.86;
  for (const a of gateA) info.gates.push({ x: cx + Math.sin(a) * wallR, z: cz + Math.cos(a) * wallR, a });

  // streets: from each gate to the plaza, plus a ring for bigger towns
  const plazaR = Math.min(22, 10 + R * 0.06);
  info.plazaR = plazaR;
  const streets: [number, number, number, number][] = [];
  for (const g of info.gates) streets.push([cx, cz, cx + Math.sin(g.a) * (R + 30), cz + Math.cos(g.a) * (R + 30)]);
  if (R > 140) {
    // a cross street
    const a0 = gateA[0] + Math.PI / 2;
    streets.push([cx - Math.sin(a0) * R * 0.8, cz - Math.cos(a0) * R * 0.8, cx + Math.sin(a0) * R * 0.8, cz + Math.cos(a0) * R * 0.8]);
  }
  const streetW = R > 140 ? 5 : 3.8;

  // walls
  const walled = plan.walls !== 'none';
  if (walled) {
    const segs = Math.max(10, Math.round((2 * Math.PI * wallR) / 26));
    const gateGap = 4.6 / wallR;
    for (let i = 0; i < segs; i++) {
      let a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
      // cut out gates
      const parts: [number, number][] = [[a0, a1]];
      for (const g of gateA) {
        for (let p = parts.length - 1; p >= 0; p--) {
          const [s0, s1] = parts[p];
          let ga = g;
          while (ga < s0 - Math.PI) ga += Math.PI * 2;
          while (ga > s1 + Math.PI) ga -= Math.PI * 2;
          const g0 = ga - gateGap, g1 = ga + gateGap;
          if (g1 <= s0 || g0 >= s1) continue;
          parts.splice(p, 1);
          if (g0 > s0) parts.push([s0, g0]);
          if (g1 < s1) parts.push([g1, s1]);
        }
      }
      for (const [s0, s1] of parts) {
        if (s1 - s0 < 0.01) continue;
        const ax = cx + Math.sin(s0) * wallR, az = cz + Math.cos(s0) * wallR;
        const bx = cx + Math.sin(s1) * wallR, bz = cz + Math.cos(s1) * wallR;
        const mx = (ax + bx) / 2, mz = (az + bz) / 2;
        obj(W, 'wall', plan.walls, mx, mz, Math.min(ground(ax, az), ground(bx, bz)), Math.atan2(bx - ax, bz - az), def.faction, site.id, 0, {
          data: { ax, az, bx, bz, len: Math.hypot(bx - ax, bz - az), thick: plan.walls === 'fence' ? 0.4 : plan.walls === 'palisade' || plan.walls === 'bone' ? 0.8 : 1.4, h: plan.walls === 'fence' ? 1.4 : plan.walls === 'stone' ? 6 : 4.5, style: plan.walls },
        });
      }
      if (plan.towers && i % 2 === 0) {
        const a = a0;
        if (!gateA.some((g) => Math.abs(Math.atan2(Math.sin(a - g), Math.cos(a - g))) < gateGap + 0.08)) {
          const tx = cx + Math.sin(a) * wallR, tz = cz + Math.cos(a) * wallR;
          obj(W, 'tower', plan.walls, tx, tz, ground(tx, tz), a, def.faction, site.id, 0, { data: { h: plan.walls === 'stone' ? 9 : 7, r: plan.walls === 'stone' ? 2.6 : 2 } });
          if (i % 4 === 0) info.posts.push({ x: cx + Math.sin(a) * (wallR - 4), z: cz + Math.cos(a) * (wallR - 4), dir: a, kind: 'tower' });
        }
      }
    }
    for (const g of info.gates) {
      const gx = cx + Math.sin(g.a) * wallR, gz = cz + Math.cos(g.a) * wallR;
      obj(W, 'gate', plan.walls, gx, gz, ground(gx, gz), g.a + Math.PI / 2, def.faction, site.id, 0, { open: true, data: { w: wallR * gateGap * 2, style: plan.walls } });
      // gate guards stand just inside, either side of the road
      const inx = cx + Math.sin(g.a) * (wallR - 5), inz = cz + Math.cos(g.a) * (wallR - 5);
      const px = Math.cos(g.a) * 3, pz = -Math.sin(g.a) * 3;
      info.posts.push({ x: inx + px, z: inz + pz, dir: g.a, kind: 'gate' });
      info.posts.push({ x: inx - px, z: inz - pz, dir: g.a, kind: 'gate' });
    }
  }

  // which buildings
  const list: { def: BDef; shop?: string; name?: string }[] = [];
  const barNames = (BAR_NAMES as Record<string, string[]>)[style] ?? BAR_NAMES.shanty;
  for (const sk of def.shops) {
    const bk = SHOP_BUILDING[sk] ?? 'shop';
    const bdef = BUILDINGS[sk === 'bar' && R < 100 ? 'bar_small' : bk];
    list.push({ def: bdef, shop: sk, name: sk === 'bar' ? rng.pick(barNames) : SHOP_NAMES[sk] });
  }
  for (const [bk, n] of plan.buildings) for (let i = 0; i < n; i++) list.push({ def: BUILDINGS[bk] });
  list.sort((a, b) => b.def.w * b.def.d - a.def.w * a.def.d);

  // place
  const placed: { x: number; z: number; w: number; d: number; rot: number }[] = [];
  const reserve = (x: number, z: number, w: number, d: number, rot: number) => placed.push({ x, z, w, d, rot });
  // the plaza
  reserve(cx, cz, plazaR * 2 - 4, plazaR * 2 - 4, 0);
  const inner = walled ? wallR - 6 : R * 0.9;
  for (const item of list) {
    const bd = item.def;
    let ok = false;
    for (let tries = 0; tries < 80 && !ok; tries++) {
      // important buildings go near the plaza
      const important = item.shop || bd.use === 'palace' || bd.use === 'temple' || bd.use === 'hall';
      const dmin = plazaR + Math.max(bd.w, bd.d) / 2 + 1;
      const dmax = Math.max(dmin + 4, inner - Math.max(bd.w, bd.d) / 2 - 1);
      const t = important ? Math.pow(rng.next(), 2) * 0.5 : Math.pow(rng.next(), 1.4);
      const dist = dmin + (dmax - dmin) * t;
      const ang = rng.range(0, Math.PI * 2);
      const x = cx + Math.sin(ang) * dist, z = cz + Math.cos(ang) * dist;
      // face the nearest street, else the centre
      let rot = Math.atan2(cx - x, cz - z);
      let best = Infinity;
      for (const [ax, az, bx, bz] of streets) {
        const d = segDist(x, z, ax, az, bx, bz);
        if (d < best && d < 30) {
          best = d;
          // perpendicular toward the street
          const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
          const tt = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
          rot = Math.atan2(ax + dx * tt - x, az + dz * tt - z);
        }
      }
      if (style === 'hive' || style === 'hive_dead' || style === 'hide') rot = Math.atan2(cx - x, cz - z);
      else rot = Math.round(rot / (Math.PI / 8)) * (Math.PI / 8);
      const cand = { x, z, w: bd.w, d: bd.d, rot };
      if (placed.some((p) => obbOverlap(p, cand, 3))) continue;
      // keep streets clear
      const rad = Math.hypot(bd.w, bd.d) / 2;
      if (streets.some(([ax, az, bx, bz]) => segDist(x, z, ax, az, bx, bz) < rad * 0.72 + streetW)) continue;
      if (T.heightAt(x, z) < 0.3 && !STYLES[bd.style ?? style].stilts) continue;
      reserve(x, z, bd.w, bd.d, rot);
      const b = placeBuilding(W, T, info, bd, item.shop, item.name, x, z, rot, def.faction, site.id, style, rng);
      ok = true;
      void b;
    }
  }

  // plaza feature and patrol loop
  const pf = plan.plaza;
  if (pf) {
    const k: ObjKind = pf === 'well' ? 'well' : 'decor';
    obj(W, k, pf, cx, cz, ground(cx, cz), 0, def.faction, site.id, 0, { data: { r: pf === 'arena' ? plazaR - 3 : pf === 'pyre' ? 2.5 : 1.3 } });
  }
  // lights: lamp posts round the plaza, braziers either side of each gate
  if (style !== 'hive' && style !== 'hive_dead') {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const lx = cx + Math.sin(a) * (plazaR - 0.5), lz = cz + Math.cos(a) * (plazaR - 0.5);
      if (T.roadAt(lx, lz) > 0.5) continue;
      obj(W, 'lamp', 'lamp', lx, lz, ground(lx, lz), a, def.faction, site.id, 0);
    }
    for (const g of info.gates) {
      for (const side of [-1, 1]) {
        const ta = g.a + side * (5.5 / Math.max(20, wallR));
        const r = wallR - 2.2;
        const bx = cx + Math.sin(ta) * r, bz = cz + Math.cos(ta) * r;
        obj(W, 'decor', 'brazier', bx, bz, ground(bx, bz), 0, def.faction, site.id, 0);
      }
    }
  }
  const loopR = Math.max(plazaR + 4, R * 0.55);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng.range(-0.2, 0.2);
    info.patrol.push({ x: cx + Math.sin(a) * loopR, z: cz + Math.cos(a) * loopR });
  }
  for (let i = 0; i < 3; i++) {
    const a = rng.range(0, Math.PI * 2);
    info.posts.push({ x: cx + Math.sin(a) * (plazaR - 2), z: cz + Math.cos(a) * (plazaR - 2), dir: a, kind: 'plaza' });
  }

  // fields outside town
  if (plan.fields && (T.regionAt(cx, cz).fertility > 0.15 || plan.fields === 'riceweed')) { // paddies are flooded, soil or not
    const n = Math.round(3 + R / 40);
    for (let i = 0, tries = 0; i < n && tries < 60; tries++) {
      const a = rng.range(0, Math.PI * 2), d = R + rng.range(14, 70);
      const fx = cx + Math.sin(a) * d, fz = cz + Math.cos(a) * d;
      if (T.slopeAt(fx, fz) > 0.12 || T.heightAt(fx, fz) < 0.4) continue;
      if (T.roadAt(fx, fz) > 0) continue;
      const fw = rng.range(14, 24), fd = rng.range(10, 18), rot = Math.round(a / (Math.PI / 4)) * (Math.PI / 4);
      if (info.fields.some((f) => Math.hypot(f.x - fx, f.z - fz) < 26)) continue;
      const f = obj(W, 'farm', plan.fields, fx, fz, ground(fx, fz), rot, def.faction, site.id, 0, { data: { w: fw, d: fd, growth: rng.range(0.2, 1), crop: plan.fields } });
      info.fields.push(f);
      for (let k = 0; k < 2; k++) info.jobs.push({ x: fx + rng.range(-fw / 3, fw / 3), z: fz + rng.range(-fd / 3, fd / 3), dir: rot });
      i++;
    }
  }
  return info;
}

/** Places a building with its furniture. */
export function placeBuilding(W: World, T: Terrain, info: TownInfo | null, bd: BDef, shop: string | undefined, name: string | undefined, x: number, z: number, rot: number, owner: string, siteId: number, townStyle: string, rng: RNG): WObj {
  const styleKey = bd.style ?? (bd.use === 'hut' && townStyle !== 'karuk' ? townStyle : undefined) ?? townStyle;
  const st = STYLES[styleKey] ?? STYLES.shanty;
  // floor height: highest corner so nothing sinks
  let y = -Infinity;
  const c = Math.cos(rot), s = Math.sin(rot);
  for (const [lx, lz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
    const wx = x + (lx * bd.w) / 2 * c + (lz * bd.d) / 2 * s, wz = z - (lx * bd.w) / 2 * s + (lz * bd.d) / 2 * c;
    y = Math.max(y, T.heightAt(wx, wz));
  }
  y += 0.05 + (st.stilts ?? 0);
  const doors: Door[] = bd.use === 'stall' || bd.use === 'pen' ? [] : [{ side: 's', off: bd.w > 14 ? 0 : rng.range(-bd.w * 0.15, bd.w * 0.15), w: bd.w > 14 ? 2.4 : 1.7 }];
  if (bd.w * bd.d > 200 && bd.use !== 'prison') doors.push({ side: 'n', off: 0, w: 1.7 });
  const data: BuildingData = {
    def: bd.key, name: name ?? bd.name, use: bd.use, style: styleKey, w: bd.w, d: bd.d, h: bd.h ?? st.wallH, doors, floors: bd.floors ?? 1,
    roof: bd.roof ?? (st.round ? (st.roofType === 'cone' ? 'cone' : 'dome') : st.roofType), stilts: st.stilts ?? 0, seed: rng.int(1, 1e9),
    shop, furniture: [], wallCol: rng.pick(st.wall), roofCol: rng.pick(st.roof),
  };
  const b = obj(W, 'building', bd.key, x, z, y, rot, owner, siteId, 0, { data });
  if (info) info.buildings.push(b);
  furnish(W, info, b, data, owner, siteId, rng);
  return b;
}

const lock = (rng: RNG, base: number) => Math.round(base + rng.range(-8, 12));

/** Lays out furniture by building use. */
function furnish(W: World, info: TownInfo | null, b: WObj, d: BuildingData, owner: string, siteId: number, rng: RNG) {
  const hw = d.w / 2 - 0.9, hd = d.d / 2 - 0.9;
  const add = (kind: ObjKind, def: string, lx: number, lz: number, lrot: number, extra: Partial<WObj> = {}) => {
    const [wx, wz] = toWorld(b, lx, lz);
    const o = obj(W, kind, def, wx, wz, b.y, b.rot + lrot, owner, siteId, b.id, extra);
    d.furniture.push(o.id);
    return o;
  };
  const bed = (lx: number, lz: number, lrot: number, def = 'bed') => { const o = add('bed', def, lx, lz, lrot); info?.beds.push(o.id); return o; };
  const spot = (lx: number, lz: number, lrot: number): [number, number, number] => { const [wx, wz] = toWorld(b, lx, lz); return [wx, wz, b.rot + lrot]; };
  switch (d.use) {
    case 'bar': {
      const counter = add('counter', 'bar_counter', 0, -hd + 1.4, 0, { inv: new Grid(12, 10), locked: lock(rng, 40), shop: 'bar', data: { len: d.w * 0.45 } });
      const seats: [number, number, number, number][] = [];
      const tables = Math.max(2, Math.floor((d.w * d.d) / 45));
      for (let i = 0; i < tables; i++) {
        const tx = -hw + 2 + ((i % 3) / 2) * (hw * 2 - 4), tz = -hd + 5 + Math.floor(i / 3) * 3.5;
        if (tz > hd - 1.5) break;
        add('table', 'table', tx, tz, 0);
        for (const [sx, sz] of [[-1, 0], [1, 0]]) {
          const st = add('stool', 'stool', tx + sx * 1.05, tz + sz, sx > 0 ? -Math.PI / 2 : Math.PI / 2);
          seats.push([st.x, st.z, st.rot, st.id]);
        }
      }
      add('crate', 'barrel', hw - 0.3, -hd + 0.3, 0, { inv: new Grid(6, 6), locked: lock(rng, 30) });
      add('lamp', 'lamp', 0, 0, 0);
      if (d.shop) info?.shops.push({ kind: d.shop, building: b, counter, spot: spot(0, -hd + 0.5, 0) });
      info?.bars.push({ building: b, counter, spot: spot(0, -hd + 0.5, 0), seats });
      d.shopId = counter.id;
      break;
    }
    case 'shop':
    case 'stall':
    case 'clinic':
    case 'workshop': {
      const cz = d.use === 'stall' ? 0.6 : -hd + 1.8;
      const counter = add('counter', 'counter', 0, cz, 0, { inv: new Grid(12, 10), locked: lock(rng, 45), shop: d.shop, data: { len: Math.min(4, d.w * 0.5) } });
      if (d.use !== 'stall') {
        for (let i = 0; i < 2; i++) add('decor', 'shelf', -hw + 0.4, -hd + 1 + i * 2.2, Math.PI / 2);
        add('decor', 'shelf', hw - 0.4, -hd + 1.2, -Math.PI / 2);
        add('chest', 'chest', hw - 0.6, -hd + 0.5, 0, { inv: new Grid(8, 6), locked: lock(rng, 50) });
      }
      if (d.use === 'clinic') for (let i = 0; i < 3; i++) bed(-hw + 1 + i * 2.4, hd - 1.2, Math.PI);
      if (d.use === 'workshop') { add('bench', 'workbench', hw - 1.2, hd - 1.2, Math.PI); add('decor', 'anvil', -hw + 1.2, hd - 1.2, 0); }
      if (d.shop) info?.shops.push({ kind: d.shop, building: b, counter, spot: spot(0, cz - 1.1, 0) });
      d.shopId = counter.id;
      if (d.use === 'workshop' && !d.shop) info?.jobs.push({ x: toWorld(b, hw - 1.2, hd - 2)[0], z: toWorld(b, hw - 1.2, hd - 2)[1], dir: b.rot });
      break;
    }
    case 'house':
    case 'farmhouse':
    case 'hut':
    case 'tent':
    case 'dome':
    case 'container': {
      if (d.shop) {
        // a trading dome: a wax counter at the back, one bedroll for the keeper
        const counter = add('counter', 'counter', 0, hd - 1.6, Math.PI, { inv: new Grid(12, 10), locked: lock(rng, 35), shop: d.shop, data: { len: Math.min(3, d.w * 0.35) } });
        info?.shops.push({ kind: d.shop, building: b, counter, spot: spot(0, hd - 2.7, Math.PI) });
        d.shopId = counter.id;
        bed(-hw + 0.8, -hd + 1.2, Math.PI / 2, 'bedroll');
        add('crate', 'crate', hw - 0.5, -hd + 0.6, 0, { inv: new Grid(6, 6), locked: lock(rng, 30) });
        break;
      }
      const beds = d.use === 'container' ? 1 : Math.max(1, Math.min(4, Math.floor((d.w * d.d) / 26)));
      for (let i = 0; i < beds; i++) {
        const lx = -hw + 0.8 + (i % 2) * (hw * 2 - 1.6), lz = -hd + 1.2 + Math.floor(i / 2) * 2.6;
        bed(lx, lz, i % 2 ? -Math.PI / 2 : Math.PI / 2, d.use === 'tent' || d.use === 'hut' || d.use === 'dome' ? 'bedroll' : 'bed');
      }
      if (d.w >= 8) { add('table', 'table', 0, 0.2, 0); add('stool', 'stool', 1, 0.2, -Math.PI / 2); }
      add('chest', 'chest', hw - 0.4, hd - 0.9, Math.PI, { inv: new Grid(6, 6), locked: lock(rng, 25) });
      break;
    }
    case 'barracks': {
      const n = Math.floor((d.w - 2) / 2.2);
      for (let i = 0; i < n; i++) { bed(-hw + 1 + i * 2.2, -hd + 1.1, 0, 'bunk'); if (d.d > 9) bed(-hw + 1 + i * 2.2, hd - 1.8, Math.PI, 'bunk'); }
      add('decor', 'weapon_rack', hw - 0.4, 0, -Math.PI / 2);
      add('chest', 'chest', -hw + 0.5, 0, Math.PI / 2, { inv: new Grid(8, 8), locked: lock(rng, 55) });
      break;
    }
    case 'prison': {
      add('counter', 'desk', 0, hd - 2.4, Math.PI, { data: { len: 2.6 } });
      const n = Math.floor((d.w - 2) / 2.6);
      for (let i = 0; i < n; i++) { const cg = add('cage', 'cage', -hw + 1.2 + i * 2.6, -hd + 1.2, 0, { locked: lock(rng, 50) }); info?.cages.push(cg.id); }
      bed(hw - 0.8, 0, -Math.PI / 2, 'bunk');
      add('chest', 'chest', -hw + 0.5, hd - 1, Math.PI / 2, { inv: new Grid(8, 8), locked: lock(rng, 60), data: { name: 'Confiscated goods' } });
      break;
    }
    case 'pen': {
      const n = Math.floor((d.w - 2) / 2.6);
      for (let i = 0; i < n; i++) { const cg = add('cage', 'cage', -hw + 1.2 + i * 2.6, -hd + 1.4, 0, { locked: lock(rng, 45) }); info?.cages.push(cg.id); }
      for (let i = 0; i < 2; i++) add('shackle_post', 'post', -hw + 2 + i * 4, hd - 2, 0);
      if (d.shop) {
        const counter = add('counter', 'counter', hw - 1.5, hd - 1.5, 0, { inv: new Grid(10, 8), shop: d.shop, data: { len: 2 } });
        info?.shops.push({ kind: d.shop, building: b, counter, spot: spot(hw - 1.5, hd - 2.6, 0) });
        d.shopId = counter.id;
      }
      break;
    }
    case 'temple':
    case 'shrine': {
      add('decor', 'altar', 0, -hd + 1.5, 0);
      if (d.use === 'temple') {
        for (let r = 0; r < 3; r++) for (const sx of [-1, 1]) add('decor', 'pew', sx * hw * 0.45, -hd + 5 + r * 2.8, 0, { data: { len: hw * 0.7 } });
        for (const sx of [-1, 1]) add('decor', 'brazier', sx * (hw - 0.6), -hd + 1.2, 0);
        if (d.shop) {
          const counter = add('counter', 'desk', 0, -hd + 3, 0, { data: { len: 2 }, shop: d.shop, inv: new Grid(8, 6) });
          info?.shops.push({ kind: d.shop, building: b, counter, spot: spot(0, -hd + 2, 0) });
        }
      }
      break;
    }
    case 'palace':
    case 'hall':
    case 'boss': {
      add('throne', 'throne', 0, -hd + 1.3, 0);
      add('decor', 'rug', 0, 0, 0, { data: { w: d.w * 0.3, d: d.d * 0.6 } });
      if (d.use === 'hall') { add('table', 'longtable', -hw * 0.5, 1, Math.PI / 2, { data: { len: d.d * 0.5 } }); add('table', 'longtable', hw * 0.5, 1, Math.PI / 2, { data: { len: d.d * 0.5 } }); add('decor', 'firepit', 0, 2, 0); }
      for (let i = 0; i < (d.use === 'boss' ? 1 : 3); i++) bed(hw - 0.8, -hd + 1.5 + i * 2.6, -Math.PI / 2, 'bed_fine');
      add('chest', 'chest_fine', -hw + 0.6, -hd + 0.8, Math.PI / 2, { inv: new Grid(8, 8), locked: lock(rng, d.use === 'boss' ? 40 : 75), data: { name: 'Treasury', rich: true } });
      break;
    }
    case 'warehouse': {
      for (let i = 0; i < 5; i++) {
        const [lx, lz, r] = [-hw + 1 + (i % 3) * 2.2, -hd + 1 + Math.floor(i / 3) * 2.2, rng.range(0, 1)];
        if (owner === 'player') add('storage', 'crate', lx, lz, r, { inv: new Grid(6, 6), data: { name: 'Crate' } });
        else add('crate', 'crate', lx, lz, r, { inv: new Grid(6, 6), locked: lock(rng, 35) });
      }
      if (d.shop) {
        const counter = add('counter', 'counter', 0, hd - 2, Math.PI, { inv: new Grid(12, 10), shop: d.shop, data: { len: 3 } });
        info?.shops.push({ kind: d.shop, building: b, counter, spot: spot(0, hd - 3.1, Math.PI) });
        d.shopId = counter.id;
      }
      break;
    }
    case 'tower':
      break;
    case 'ruin': {
      for (let i = 0; i < 2; i++) add('crate', 'crate_old', rng.range(-hw + 1, hw - 1), rng.range(-hd + 1, hd - 1), rng.range(0, 3), { inv: new Grid(6, 6), data: { ruin: true } });
      break;
    }
  }
}
