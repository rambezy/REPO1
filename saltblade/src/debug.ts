// Development handle on window.__sb for automated play-testing.
import { G } from './state';
import { S } from './sim/ctx';
import { saveGame, loadSlot, snapshot } from './game/session';
import { spawnRaid } from './sim/raids';
import { launchCampaign } from './sim/worldevents';
import { playerBase } from './sim/base';
import { chatNow } from './sim/chatter';
import { dispatchHunters } from './sim/hunters';

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
    campaign(key: string) { launchCampaign(key); const sq = [...G.W.squads.values()].filter((s: any) => s.flags.townRaid).pop(); return sq ? { name: sq.name, n: sq.members.length, target: G.T.sites.find((s: any) => s.id === sq.flags.townRaid)?.name } : null; },
    raid() { const b = playerBase(); if (!b) return 'no base'; spawnRaid(b.x, b.z, b.n); return b; },
    load: (slot = '1') => loadSlot(slot),
    chat() { chatNow(); return true; },
    /**
     * Stands a row of people in front of the camera to look at their models:
     * each entry is 'race' or 'race:loadout' (add '/f' for a woman).
     */
    async lineup(list: string[] = ['valefolk:drifters_wanderer', 'duneborn:merc/f', 'karuk:karuk_guard', 'thrum_worker:thrum_resident', 'hollow:hollows_guard', 'valefolk:concord_guard', 'valefolk:ember_guard/f'], dist = 3.2, pitch = 0.12) {
      const { makePerson } = await import('./sim/spawn');
      const { Squad } = await import('./sim/squad');
      const { RNG } = await import('./core/rng');
      const W = G.W as any;
      const p = W.playerChars()[0];
      const sq = new Squad(); sq.faction = 'drifters'; sq.kind = 'town'; sq.name = 'Lineup'; W.addSquad(sq);
      const rng = new RNG(4242);
      const out: string[] = [];
      list.forEach((spec, i) => {
        const [rl, fem] = spec.split('/');
        const [race, loadout] = rl.split(':');
        const c: any = makePerson(W, { faction: 'drifters', role: 'guard', race, loadout, female: fem === 'f' } as any, rng);
        W.moveToSquad(c, sq);
        c.x = p.x + (i - (list.length - 1) / 2) * 0.95; c.z = p.z - 6; c.y = G.T.heightAt(c.x, c.z);
        c.homeX = c.x; c.homeZ = c.z; c.dir = c.homeDir = 0; c.mem.lineup = true;
        out.push(c.name + ' ' + race);
      });
      G.cam.follow = null;
      G.cam.lookAt(p.x, p.z - 6, dist); G.cam.dist = dist; G.cam.target.x = p.x; G.cam.target.z = p.z - 6;
      G.cam.yaw = G.cam.wantYaw = 0; G.cam.pitch = G.cam.wantPitch = pitch;
      p.x += 3; p.z -= 12;
      return out;
    },
    /** Looks at the i-th person of the lineup from `dist` metres at height h, turned by yaw (no argument: back to the game camera). */
    closeup(i?: number, dist = 1.1, h = 1.55, yaw = 0) {
      const cam = G.cam as any;
      if (i === undefined) { delete cam.apply; return true; }
      const c: any = [...G.W.chars.values()].filter((c: any) => c.mem.lineup)[i];
      if (!c) return false;
      cam.apply = (pc: any) => {
        pc.position.set(c.x + Math.sin(yaw) * dist, c.y + h, c.z + Math.cos(yaw) * dist);
        pc.lookAt(c.x, c.y + h - 0.03, c.z);
        if (pc.near !== 0.05) { pc.near = 0.05; pc.updateProjectionMatrix(); }
      };
      cam.target.x = c.x; cam.target.z = c.z;
      return c.name + ' ' + c.race;
    },
    /** Sends bounty hunters after the first of your people with a price on their head. */
    hunt() { const c = G.W.playerChars().find((p: any) => Object.values(p.bounty).some((v: any) => v > 0)); if (!c) return 'nobody is wanted'; const f = Object.keys(c.bounty).find((k) => c.bounty[k] > 0)!; const sq = dispatchHunters(c, f); return sq ? { name: sq.name, n: sq.members.length, d: Math.round(Math.hypot(sq.x - c.x, sq.z - c.z)) } : 'no start'; },
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
