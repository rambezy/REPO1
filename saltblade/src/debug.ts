// Development handle on window.__sb for automated play-testing.
import { G } from './state';
import { S } from './sim/ctx';
import { saveGame, loadSlot, snapshot } from './game/session';
import { spawnRaid } from './sim/raids';
import { playerBase } from './sim/base';

export function attachDebug() {
  const w = window as unknown as Record<string, unknown>;
  w.__sb = {
    G,
    S,
    cam(x: number, z: number, dist = 80, yaw?: number, pitch?: number) {
      G.cam.lookAt(x, z, dist);
      G.cam.dist = dist;
      if (yaw !== undefined) { G.cam.yaw = G.cam.wantYaw = yaw; }
      if (pitch !== undefined) { G.cam.pitch = G.cam.wantPitch = pitch; }
      G.cam.follow = null;
      return true;
    },
    hour(h: number) { const d = G.clock.day; G.clock.t = d * 86400 + h * 3600; return G.clock.str(); },
    pc() { return G.W.playerChars().map((c: any) => ({ id: c.id, name: c.name, x: +c.x.toFixed(1), z: +c.z.toFixed(1), st: c.status, hp: +c.body.total().toFixed(2), blood: +c.body.blood.toFixed(0), tgt: c.target, act: c.act, atk: !!c.atk })); },
    near(r = 60) {
      const p = G.W.playerChars()[0];
      return G.W.active.filter((c: any) => Math.hypot(c.x - p.x, c.z - p.z) < r).map((c: any) => ({ id: c.id, n: c.name, f: c.faction, st: c.status, hp: +c.body.total().toFixed(2), tgt: c.target, d: +Math.hypot(c.x - p.x, c.z - p.z).toFixed(1) }));
    },
    focus(dist = 14, yaw?: number, pitch = 0.5) {
      const p = G.W.playerChars()[0];
      G.cam.lookAt(p.x, p.z, dist); G.cam.dist = dist; G.cam.target.x = p.x; G.cam.target.z = p.z;
      if (yaw !== undefined) G.cam.yaw = G.cam.wantYaw = yaw;
      G.cam.pitch = G.cam.wantPitch = pitch;
      return true;
    },
    speed(s: number) { G.speed = s; return s; },
    give(id: string, n = 1, q = 2) { const c = G.W.playerChars()[0]; return c.inv.add(id, n, q); },
    async site(key: string, dx = 6, dz = 0, rot = 0) {
      const base = await import('./sim/base');
      const { BUILDABLE } = await import('./content/buildables');
      const c = G.W.playerChars()[0];
      const b = BUILDABLE[key];
      const x = c.x + dx, z = c.z + dz;
      const ok = base.canPlace(b, x, z, rot);
      if (!ok.ok) return ok.why;
      const s = base.placeSite(b, x, z, rot);
      c.jobs.unshift({ k: 'build', obj: s.id, label: 'Build' });
      return s.id;
    },
    objs(kind?: string, r = 50) { const c = G.W.playerChars()[0]; return [...G.W.objs.values()].filter((o: any) => (!kind || o.kind === kind) && Math.hypot(o.x - c.x, o.z - c.z) < r).map((o: any) => ({ id: o.id, kind: o.kind, def: o.def, p: o.progress, built: o.built })); },
    unlockAll() { import('./content/buildables').then((m) => m.TECHS.forEach((t: any) => G.W.research.done.add(t.key))); return true; },
    npcs(role?: string, r = 200) {
      const p = G.W.playerChars()[0];
      return [...G.W.chars.values()].filter((c: any) => c.faction !== 'player' && (!role || c.role === role) && Math.hypot(c.x - p.x, c.z - p.z) < r).slice(0, 20).map((c: any) => ({ id: c.id, n: c.name, role: c.role, f: c.faction, shop: c.shop, rec: c.recruitable, x: +c.x.toFixed(1), z: +c.z.toFixed(1) }));
    },
    talk(id: number) { import('./core/events').then((m) => m.emit('ui:talk', G.W.playerChars()[0].id, id)); return true; },
    trade(id: number) { import('./core/events').then((m) => m.emit('ui:trade', G.W.playerChars()[0].id, id)); return true; },
    near2(id: number) { const c = G.W.chars.get(id); const p = G.W.playerChars()[0]; p.x = c.x + 1.2; p.z = c.z + 1.2; p.path = null; p.hasGoal = false; (window as any).__sb.cam(c.x, c.z, 10, 0.6, 0.7); return true; },
    tp(x: number, z: number) { const c = G.W.playerChars()[0]; c.x = x; c.z = z; c.path = null; c.hasGoal = false; return true; },
    bld(use: string, near = 'crossroad') {
      const site = G.T.sites.find((s: any) => s.key === near);
      const bs = [...G.W.objs.values()].filter((o: any) => o.kind === 'building' && o.data.use === use && (!site || o.site === site.id));
      const b: any = bs[0];
      if (!b) return null;
      return { id: b.id, x: b.x, z: b.z, rot: b.rot, name: b.data.name, shop: b.data.shop };
    },
    into(use: string, near = 'crossroad') {
      const b = (window as any).__sb.bld(use, near);
      if (!b) return 'none';
      const c = G.W.playerChars()[0];
      c.x = b.x; c.z = b.z; c.path = null; c.hasGoal = false;
      (window as any).__sb.cam(b.x, b.z, 16, b.rot + 0.5, 1.0);
      import('./game/control').then((m) => { m.sel.clear(); m.sel.add(c.id); });
      return b;
    },
    log() { return G.W.log.slice(-15).map((l: any) => l.text); },
    save: (slot = '1') => saveGame(slot),
    emit(...args: any[]) { import('./core/events').then((e) => (e.emit as any)(...args)); return true; },
    select(ids: number[]) { import('./game/control').then((m) => { m.sel.clear(); for (const i of ids) m.sel.add(i); import('./core/events').then((e) => e.emit('sel')); }); return ids.length; },
    raid() { const b = playerBase(); if (!b) return 'no base'; spawnRaid(b.x, b.z, b.n); return b; },
    load: (slot = '1') => loadSlot(slot),
    saveSize() { const j = JSON.stringify(snapshot()); return j.length; },
    /** Forces the weather in the camera's region. */
    weather(kind: string, i = 1) {
      const S = (window as any).__sb.S;
      const sp = S.weather.at(G.cam.target.x, G.cam.target.z);
      sp.kind = kind; sp.i = i; sp.target = i; sp.until = G.clock.t + 3600 * 6;
      G.weatherFx.kind = kind; G.weatherFx.i = i;
      return true;
    },
    info() {
      const r = G.R.gl.info.render;
      return { calls: r.calls, tris: r.triangles, geos: G.R.gl.info.memory.geometries, time: G.clock.str() };
    },
  };
}
