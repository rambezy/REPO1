// Development handle on window.__sb for automated play-testing.
import { G } from './state';

export function attachDebug() {
  const w = window as unknown as Record<string, unknown>;
  w.__sb = {
    G,
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
    log() { return G.W.log.slice(-15).map((l: any) => l.text); },
    info() {
      const r = G.R.gl.info.render;
      return { calls: r.calls, tris: r.triangles, geos: G.R.gl.info.memory.geometries, time: G.clock.str() };
    },
  };
}
