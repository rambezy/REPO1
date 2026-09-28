// Draws the world: ground chunks, decals, y-sorted objects and actors,
// particles, lighting and screen effects.

import { G } from '../G';
import { chunks } from '../world/chunks';
import { here } from '../world/world';
import { MapObject } from '../world/map';
import { Actor, EMOTE_COLORS } from '../world/actor';
import { drawSprite } from '../gfx/sprite';
import { drawParticles, drawFloats, drawDecals, particleLights, emit } from './fx';
import { renderLighting, gradeForHour, Light } from './lighting';
import { S, darkness, hourF } from '../state';
import { clamp, TILE, rand } from './util';
import { drawText } from '../gfx/font';
import { weather } from '../systems/weather';

export const renderHooks = {
  /** drawn right after an actor (weapons, carried items) */
  afterActor: [] as ((ctx: CanvasRenderingContext2D, a: Actor) => void)[],
  /** world-space overlays drawn above everything (markers, prompts) */
  overlay: [] as ((ctx: CanvasRenderingContext2D) => void)[],
  /** extra lights (held torches etc.) */
  lights: [] as (() => Light[])[],
  /** screen-space overlays after lighting */
  screen: [] as ((ctx: CanvasRenderingContext2D) => void)[],
};

export function updateCamera(dt: number) {
  const cam = G.cam;
  const map = G.map;
  const f = cam.follow || G.player;
  let tx = (cam.lockX ?? f.x) - G.viewW / 2;
  let ty = (cam.lockY ?? f.y - 10) - G.viewH / 2;
  const mw = map.w * TILE, mh = map.h * TILE;
  if (mw <= G.viewW) tx = (mw - G.viewW) / 2; else tx = clamp(tx, 0, mw - G.viewW);
  if (mh <= G.viewH) ty = (mh - G.viewH) / 2; else ty = clamp(ty, 0, mh - G.viewH);
  const k = 1 - Math.exp(-cam.speed * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt * 18);
}

export function snapCamera() {
  const cam = G.cam;
  cam.x = G.player.x - G.viewW / 2;
  cam.y = G.player.y - 10 - G.viewH / 2;
  updateCamera(10);
}

let smokeT = 0;

/** Per-frame effects for objects (smoke, embers). Called from the update loop. */
export function updateObjectFx(dt: number) {
  smokeT += dt;
  const cam = G.cam;
  const objs = G.map.queryObjects(cam.x - 48, cam.y - 32, cam.x + G.viewW + 48, cam.y + G.viewH + 160);
  for (const o of objs) {
    if (o.hidden) continue;
    if (o.smoke && Math.random() < dt * 2.2) emit('smoke', o.x + o.smoke.x + rand.range(-1, 1), o.y + o.smoke.y);
    if (o.anim === 'bigfire') {
      if (Math.random() < dt * 14) emit('ember', o.x + rand.range(-8, 8), o.y - 10);
      if (Math.random() < dt * 4) emit('smoke', o.x + rand.range(-6, 6), o.y - 30);
    } else if (o.anim === 'fire' && Math.random() < dt * 1.5 && o.light) {
      emit('ember', o.x + o.light.x + rand.range(-3, 3), o.y + o.light.y);
    }
    if (o.data?.burning && Math.random() < dt * 6) {
      emit('ember', o.x + rand.range(-20, 20), o.y - rand.range(10, 40));
      if (Math.random() < 0.4) emit('smoke', o.x + rand.range(-20, 20), o.y - 40, { color: '#4a4440', size: 3 });
    }
  }
}

function drawFire(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const t = G.clock;
  const cols = ['#b83a1a', '#f07a24', '#ffc24a', '#fff3b0'];
  for (let i = 0; i < 4; i++) {
    const h = size * (1 - i * 0.22) * (0.85 + Math.sin(t * 13 + i * 2.1 + x) * 0.15);
    const w = size * 0.55 * (1 - i * 0.2);
    ctx.fillStyle = cols[i];
    ctx.beginPath();
    ctx.moveTo(x - w, y);
    ctx.quadraticCurveTo(x - w * 0.6, y - h * 0.6, x + Math.sin(t * 7 + i) * w * 0.3, y - h);
    ctx.quadraticCurveTo(x + w * 0.6, y - h * 0.6, x + w, y);
    ctx.closePath();
    ctx.fill();
  }
}

type Drawable = { y: number; o?: MapObject; a?: Actor };

export function renderWorld() {
  const ctx = G.ctx;
  const cam = G.cam;
  const map = G.map;
  const W = G.viewW, H = G.viewH;
  ctx.fillStyle = '#0b0807';
  ctx.fillRect(0, 0, W, H);
  const sx = cam.shake > 0 ? Math.round(rand.range(-cam.shake, cam.shake)) : 0;
  const sy = cam.shake > 0 ? Math.round(rand.range(-cam.shake, cam.shake)) : 0;
  const cx = Math.round(cam.x) + sx, cy = Math.round(cam.y) + sy;
  ctx.save();
  ctx.translate(-cx, -cy);
  const x0 = cx, y0 = cy, x1 = cx + W, y1 = cy + H;
  chunks.prepare(map, x0, y0, x1, y1);
  chunks.draw(ctx, map, x0, y0, x1, y1, G.clock);
  drawDecals(ctx);

  const objs = map.queryObjects(x0 - 64, y0 - 16, x1 + 64, y1 + 180);
  const list: Drawable[] = [];
  const player = G.player;
  for (const o of objs) {
    if (o.hidden || !o.sprite) continue;
    const s = o.sprite;
    const left = o.x - s.ox, top = o.y - s.oy;
    if (left > x1 || left + s.w < x0 || top > y1 || top + s.h < y0) continue;
    if (o.flat) { drawSprite(ctx, s, o.x, o.y, o.alpha ?? 1, o.flip); continue; }
    // fade occluders when the player walks behind them
    if (o.occluder || o.kind === 'tree') {
      const behind = player.y < o.y - 2 && player.y > top + 6 && player.x > left + 2 && player.x < left + s.w - 2;
      const target = behind ? (o.kind === 'tree' ? 0.55 : 0.42) : 1;
      o.alpha = (o.alpha ?? 1) + (target - (o.alpha ?? 1)) * Math.min(1, G.dt * 8);
    }
    list.push({ y: o.y, o });
  }
  for (const a of here()) {
    if (a.hidden) continue;
    if (a.x < x0 - 32 || a.x > x1 + 32 || a.y < y0 - 8 || a.y > y1 + 40) continue;
    list.push({ y: a.mem.sortY ?? (a.pose === 'dead' || a.pose === 'lie' ? a.y - 6 : a.pose === 'sleep' ? a.y + 20 : a.y), a });
  }
  list.sort((p, q) => p.y - q.y);
  for (const d of list) {
    if (d.o) {
      const o = d.o;
      if (o.anim === 'wheel') {
        ctx.save();
        const s = o.sprite!;
        ctx.translate(Math.round(o.x), Math.round(o.y - s.oy + s.h / 2));
        ctx.rotate(G.clock * 0.8);
        ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2);
        ctx.restore();
      } else {
        drawSprite(ctx, o.sprite!, o.x, o.y, o.alpha ?? 1, o.flip);
      }
      if (o.anim === 'bigfire') drawFire(ctx, o.x, o.y - 6, 18);
      else if ((o.anim === 'fire') && o.light) drawFire(ctx, o.x + o.light.x, o.y + o.light.y + 5, 5);
      else if (o.anim === 'candle' && o.light && o.type === 'candle') drawFire(ctx, o.x, o.y - 7, 2);
      if (o.data?.burning) {
        for (let i = 0; i < 5; i++) drawFire(ctx, o.x - 22 + i * 11 + Math.sin(i * 3.1) * 3, o.y - 6 - (i % 2) * 14, 10 + (i % 3) * 3);
      }
    } else if (d.a) {
      d.a.draw(ctx);
      for (const h of renderHooks.afterActor) h(ctx, d.a);
    }
  }
  drawParticles(ctx);
  // emotes & bark markers
  for (const a of here()) {
    if (a.hidden) continue;
    if (a.emote) {
      const bob = Math.sin(G.clock * 6) * 1;
      const yy = a.y - (a.animal ? 22 : 30) + bob;
      ctx.fillStyle = '#f4efe4';
      ctx.fillRect(Math.round(a.x - 5), Math.round(yy - 1), 11, 10);
      ctx.fillStyle = '#1b1410';
      ctx.fillRect(Math.round(a.x - 5), Math.round(yy - 1), 11, 1);
      ctx.fillRect(Math.round(a.x - 5), Math.round(yy + 8), 11, 1);
      ctx.fillRect(Math.round(a.x - 6), Math.round(yy), 1, 8);
      ctx.fillRect(Math.round(a.x + 6), Math.round(yy), 1, 8);
      ctx.fillStyle = '#f4efe4';
      ctx.fillRect(Math.round(a.x - 1), Math.round(yy + 9), 2, 2);
      drawText(ctx, a.emote.icon === '💢' ? '!' : a.emote.icon === '…' ? '.' : a.emote.icon, Math.round(a.x - 2), Math.round(yy), EMOTE_COLORS[a.emote.icon] ? '#1b1410' : '#1b1410', null);
    }
  }
  for (const h of renderHooks.overlay) h(ctx);
  drawFloats(ctx);
  ctx.restore();

  // ---------- lighting ----------
  const hour = hourF();
  let dark = map.outdoor ? darkness() * 0.86 : Math.max(map.ambient, darkness() * 0.55 + map.ambient * 0.6);
  if (G.map.outdoor && weather.rain > 0) dark = Math.min(0.92, dark + weather.rain * 0.12);
  const lights: Light[] = [];
  if (dark > 0.02) {
    for (const o of objs) {
      if (o.hidden) continue;
      if (o.light) lights.push({ x: o.x + o.light.x, y: o.y + o.light.y, r: o.light.r, color: o.light.color, intensity: o.light.intensity ?? 0.8, flicker: o.light.flicker });
      if (o.data?.burning) lights.push({ x: o.x, y: o.y - 20, r: 120, color: '#ff7a2a', intensity: 1, flicker: true });
      if (o.windows && map.outdoor && darkness() > 0.2 && !o.data?.dark) {
        for (const w of o.windows) lights.push({ x: o.x + w.x, y: o.y + w.y + 6, r: 26, color: '#ffb060', intensity: 0.6, flicker: true });
      }
    }
    for (const fn of renderHooks.lights) lights.push(...fn());
    lights.push(...particleLights());
    const tint = map.outdoor ? (hour > 4 && hour < 8 ? '#1a1a3a' : '#080c22') : '#0c0806';
    renderLighting(ctx, W, H, cx, cy, dark, tint, lights, G.clock);
  }
  gradeForHour(ctx, W, H, hour, map.outdoor, map.outdoor ? weather.rain : 0);
  for (const h of renderHooks.screen) h(ctx);

  // hurt flash & vignette
  const hpFrac = G.player ? G.player.hp / G.player.maxHp : 1;
  if (G.hurtFlash > 0 || hpFrac < 0.35) {
    const a = Math.max(G.hurtFlash * 0.4, hpFrac < 0.35 ? (0.35 - hpFrac) * (0.8 + Math.sin(G.clock * 5) * 0.25) : 0);
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, 'rgba(120,0,0,0)');
    g.addColorStop(1, `rgba(120,0,0,${Math.min(0.7, a)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
  // subtle permanent vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(10,6,4,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
  if (G.fade > 0) {
    ctx.globalAlpha = Math.min(1, G.fade);
    ctx.fillStyle = G.fadeColor;
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  }
}

export function worldToScreen(x: number, y: number): { x: number; y: number } {
  return { x: (x - Math.round(G.cam.x)) * G.scale, y: (y - Math.round(G.cam.y)) * G.scale };
}

export { S };
