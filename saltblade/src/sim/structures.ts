// Buildings, walls and furniture as far as movement is concerned: what
// blocks, where the doorways are, and which floor a character stands on.
import { S } from './ctx';
import { WObj } from './objects';
import type { StructPrim, Ring } from '../world/nav';
import type { BuildingData, Door } from '../world/towns';

/** Footprints of furniture that blocks movement: half width, half depth. */
export const FURN: Record<string, [number, number]> = {
  bed: [0.5, 1.05], bed_fine: [0.75, 1.1], bunk: [0.5, 1.05], bedroll: [0.45, 1.0], counter: [0, 0.4], bar_counter: [0, 0.45], desk: [0, 0.45],
  table: [0.6, 0.45], longtable: [0.5, 0], shelf: [0.9, 0.25], chest: [0.45, 0.3], chest_fine: [0.55, 0.35], crate: [0.55, 0.55], crate_old: [0.5, 0.5],
  barrel: [0.4, 0.4], cage: [0.95, 0.95], altar: [1.2, 0.6], pew: [0, 0.3], throne: [0.6, 0.5], weapon_rack: [0.9, 0.2], workbench: [1, 0.5], anvil: [0.4, 0.3],
  well: [1.3, 1.3], post: [0.2, 0.2], brazier: [0.35, 0.35], firepit: [1, 1], storage: [0.6, 0.6], research: [1, 0.5], stove: [0.6, 0.5], generator: [0.9, 0.9],
  turret: [0.8, 0.8], statue: [1.5, 1.5], pyre: [2.5, 2.5], totem: [0.8, 0.8], pillar: [1, 1], tree: [1, 1],
};

/** Local-space door rectangles for a building side. */
function wallRects(d: BuildingData): { lx: number; lz: number; hx: number; hz: number }[] {
  const t = 0.35;
  const hw = d.w / 2, hd = d.d / 2;
  const out: { lx: number; lz: number; hx: number; hz: number }[] = [];
  const side = (s: Door['side'], len: number, fixed: number, horiz: boolean) => {
    const doors = d.doors.filter((x) => x.side === s).sort((a, b) => a.off - b.off);
    let from = -len / 2;
    const push = (a: number, b: number) => {
      if (b - a < 0.05) return;
      const c = (a + b) / 2, h = (b - a) / 2;
      if (horiz) out.push({ lx: c, lz: fixed, hx: h, hz: t / 2 });
      else out.push({ lx: fixed, lz: c, hx: t / 2, hz: h });
    };
    for (const dr of doors) { push(from, dr.off - dr.w / 2); from = dr.off + dr.w / 2; }
    push(from, len / 2);
  };
  side('s', d.w, hd - t / 2, true);
  side('n', d.w, -hd + t / 2, true);
  side('e', d.d, hw - t / 2, false);
  side('w', d.d, -hw + t / 2, false);
  return out;
}

function toW(b: WObj, lx: number, lz: number): [number, number] {
  const c = Math.cos(b.rot), s = Math.sin(b.rot);
  return [b.x + lx * c + lz * s, b.z - lx * s + lz * c];
}

export function primsFor(o: WObj, out: StructPrim[]) {
  switch (o.kind) {
    case 'building': {
      const d = o.data as BuildingData;
      if (d.use === 'stall') {
        out.push({ kind: 'floor', x: o.x, z: o.z, hx: d.w / 2, hz: d.d / 2, rot: o.rot });
        return;
      }
      out.push({ kind: 'floor', x: o.x, z: o.z, hx: d.w / 2 - 0.1, hz: d.d / 2 - 0.1, rot: o.rot });
      if (d.use === 'pen' || d.roof === 'broken') {
        // fences and ruins: walls with generous gaps
      }
      for (const r of wallRects(d)) {
        const [x, z] = toW(o, r.lx, r.lz);
        out.push({ kind: 'rect', x, z, hx: r.hx, hz: r.hz, rot: o.rot });
      }
      for (const dr of d.doors) {
        const hw = d.w / 2, hd = d.d / 2;
        const [lx, lz] = dr.side === 's' ? [dr.off, hd] : dr.side === 'n' ? [dr.off, -hd] : dr.side === 'e' ? [hw, dr.off] : [-hw, dr.off];
        const [x, z] = toW(o, lx, lz);
        const across = dr.side === 's' || dr.side === 'n';
        out.push({ kind: 'open', x, z, hx: across ? dr.w / 2 - 0.1 : 1.3, hz: across ? 1.3 : dr.w / 2 - 0.1, rot: o.rot });
      }
      return;
    }
    case 'wall': {
      const w = o.data;
      out.push({ kind: 'rect', x: o.x, z: o.z, hx: w.thick / 2, hz: w.len / 2 + 0.3, rot: o.rot });
      return;
    }
    case 'gate':
      if (!o.open) out.push({ kind: 'rect', x: o.x, z: o.z, hx: 0.6, hz: o.data.w / 2 + 0.4, rot: o.rot });
      return;
    case 'tower':
      out.push({ kind: 'circle', x: o.x, z: o.z, r: o.data.r });
      return;
    case 'farm':
    case 'ore':
    case 'pile':
    case 'lamp':
    case 'stool':
    case 'sign':
    case 'banner':
      return;
    case 'site':
      return;
    default: {
      let f = FURN[o.def];
      if (!f) return;
      let [hx, hz] = f;
      if (o.def === 'counter' || o.def === 'bar_counter' || o.def === 'desk') hx = (o.data?.len ?? 2) / 2;
      if (o.def === 'longtable') hz = (o.data?.len ?? 4) / 2;
      if (o.def === 'pew') hx = (o.data?.len ?? 3) / 2;
      if (o.def === 'arena') return; // a ring of thin posts: people walk in and out
      if (o.kind === 'decor' && o.data?.r) { out.push({ kind: 'circle', x: o.x, z: o.z, r: o.data.r }); return; }
      if (o.def === 'rug') return;
      out.push({ kind: 'rect', x: o.x, z: o.z, hx, hz, rot: o.rot });
    }
  }
}

/** Nav provider: every blocking primitive overlapping an area. */
export function structuresIn(x0: number, z0: number, x1: number, z1: number): StructPrim[] {
  const out: StructPrim[] = [];
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const r = Math.hypot(x1 - x0, z1 - z0) / 2 + 36;
  S.W.objHash.near(cx, cz, r, (o) => { if (o.built !== false || o.kind === 'site') primsFor(o, out); });
  return out;
}

/** The building whose footprint contains a point, if any. */
export function buildingAt(x: number, z: number, pad = 0): WObj | null {
  let found: WObj | null = null;
  S.W.objHash.near(x, z, 20, (o) => {
    if (found || o.kind !== 'building') return;
    const d = o.data as BuildingData;
    const dx = x - o.x, dz = z - o.z;
    const c = Math.cos(o.rot), s = Math.sin(o.rot);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) <= d.w / 2 + pad && Math.abs(lz) <= d.d / 2 + pad) found = o;
  });
  return found;
}

/** Height of whatever floor is underfoot: a building floor or the ground. */
export function floorAt(x: number, z: number): number {
  const g = S.T.heightAt(x, z);
  const b = buildingAt(x, z, 0);
  if (b) return Math.max(g, b.y);
  return g;
}

/** Invalidate navigation around an object after it changes. */
/**
 * How near someone must get to use a thing (lie in a bed, man a turret, put someone in a cage):
 * just past its edge, since it blocks the ground it stands on.
 */
export function reachOf(o: WObj, least = 1.2) {
  const f = FURN[o.def];
  return f ? Math.max(least, Math.hypot(f[0], f[1]) + 0.75) : least;
}

export function navDirty(o: WObj) {
  const r = o.kind === 'building' ? Math.hypot(o.data.w, o.data.d) / 2 + 2 : o.kind === 'wall' ? o.data.len / 2 + 2 : 4;
  S.nav.invalidate(o.x - r, o.z - r, o.x + r, o.z + r);
}

let ringsOf: unknown = null, ringsN = -1, rings: Ring[] = [];
/** The walls of walled towns as rings with gates, for planning long routes. */
export function townRings(): Ring[] {
  const W = S.W;
  if (W !== ringsOf || W.towns.size !== ringsN) {
    ringsOf = W; ringsN = W.towns.size; rings = [];
    for (const t of W.towns.values()) {
      if (t.plan.walls === 'none' || !t.gates.length) continue;
      const g = t.gates[0];
      rings.push({ x: t.site.x, z: t.site.z, r: Math.hypot(g.x - t.site.x, g.z - t.site.z), gates: t.gates });
    }
  }
  return rings;
}
