// Draws the world: ground chunks, decals, y-sorted objects and actors,
// particles, lighting and screen effects.

import { G } from '../G';
import { chunks } from '../world/chunks';
import { here } from '../world/world';
import { MapObject } from '../world/map';
import { Actor, EMOTE_COLORS } from '../world/actor';
import { drawSprite, drawSwaying, isPainted, paintNow } from '../gfx/sprite';
import { drawGroundFoliage } from '../gfx/ground/foliage';
import { drawAmbient, drawAmbientShadows } from './ambient';
import { drawParticles, drawFloats, drawDecals, particleLights, emit } from './fx';
import { applyLightMap, drawGlows, drawSunShadows, drawCloudShadows, drawMist, grade, skyLight, roomLight, sunAt, Light, Caster } from './lighting';
import { S, darkness, hourF } from '../state';
import { clamp, TILE, rand } from './util';
import { drawText } from '../gfx/font';
import { weather } from '../systems/weather';

export const renderHooks = {
  /** drawn right before an actor (things held behind the body) */
  beforeActor: [] as ((ctx: CanvasRenderingContext2D, a: Actor) => void)[],
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

/** Paints lazy sprites just outside the view a little each frame, so walking on never stalls. */
export function prewarmSprites(budgetMs = 5) {
  if (!G.map) return;
  const cam = G.cam;
  const t0 = performance.now();
  const mx = G.viewW * 0.9, my = G.viewH * 0.9;
  const objs = G.map.queryObjects(cam.x - mx, cam.y - my, cam.x + G.viewW + mx, cam.y + G.viewH + my + 120);
  for (const o of objs) {
    if (!o.sprite || isPainted(o.sprite)) continue;
    paintNow(o.sprite);
    if (performance.now() - t0 > budgetMs) break;
  }
}

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
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // warm bloom at the base
  const glow = ctx.createRadialGradient(x, y - size * 0.3, 0, x, y - size * 0.3, size * 1.4);
  glow.addColorStop(0, 'rgba(255,130,40,0.35)');
  glow.addColorStop(1, 'rgba(255,130,40,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - size * 1.5, y - size * 1.8, size * 3, size * 3);
  // licking tongues of flame, outer to inner
  const n = size > 8 ? 7 : 4;
  for (let i = 0; i < n; i++) {
    const k = i / (n - 1);
    const ph = t * (8 + i * 1.3) + i * 1.9 + x * 0.3;
    const h = size * (0.65 + 0.35 * Math.sin(ph)) * (1 - Math.abs(k - 0.5) * 0.9) * 1.25;
    const w = size * (0.26 - Math.abs(k - 0.5) * 0.08);
    const ox = x + (k - 0.5) * size * 0.9 + Math.sin(t * 5 + i) * size * 0.05;
    const g = ctx.createLinearGradient(0, y, 0, y - h);
    g.addColorStop(0, 'rgba(230,70,20,0.85)');
    g.addColorStop(0.35, 'rgba(255,150,40,0.8)');
    g.addColorStop(0.75, 'rgba(255,220,120,0.45)');
    g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(ox - w, y);
    ctx.quadraticCurveTo(ox - w * 0.9, y - h * 0.55, ox + Math.sin(ph * 0.7) * w * 0.6, y - h);
    ctx.quadraticCurveTo(ox + w * 0.9, y - h * 0.55, ox + w, y);
    ctx.closePath();
    ctx.fill();
  }
  // white-hot heart
  const core = ctx.createRadialGradient(x, y - size * 0.2, 0, x, y - size * 0.2, size * 0.45);
  core.addColorStop(0, 'rgba(255,250,220,0.8)');
  core.addColorStop(1, 'rgba(255,200,120,0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.ellipse(x, y - size * 0.2, size * 0.45, size * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

type Drawable = { y: number; o?: MapObject; a?: Actor };

/** A little speech bubble with a drawn symbol (world space). */
function drawEmote(ctx: CanvasRenderingContext2D, x: number, y: number, icon: string, pop: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(pop, pop);
  // bubble with a tail
  ctx.fillStyle = 'rgba(20,14,10,0.35)';
  ctx.beginPath(); ctx.ellipse(0.4, 0.6, 6.2, 5.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#f7f1e3';
  ctx.strokeStyle = '#2a1e16';
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.ellipse(0, 0, 6, 5.2, 0, 0, Math.PI * 2);
  ctx.moveTo(-1.6, 4.6); ctx.lineTo(-0.6, 7.6); ctx.lineTo(1.2, 4.4);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f7f1e3';
  ctx.beginPath(); ctx.ellipse(0, 0, 5.6, 4.8, 0, 0, Math.PI * 2); ctx.fill();
  const col = EMOTE_COLORS[icon] || '#2a1e16';
  ctx.fillStyle = col;
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  switch (icon) {
    case '!': case '💢':
      ctx.fillStyle = icon === '💢' ? '#c83a30' : '#d89a1a';
      ctx.beginPath(); ctx.moveTo(-1.1, -3.4); ctx.lineTo(1.1, -3.4); ctx.lineTo(0.5, 1); ctx.lineTo(-0.5, 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 2.6, 0.95, 0, Math.PI * 2); ctx.fill();
      break;
    case '?':
      ctx.strokeStyle = '#3a6aa8'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, -1.3, 1.9, Math.PI * 1.1, Math.PI * 0.45); ctx.quadraticCurveTo(0, 0.2, 0, 1.2); ctx.stroke();
      ctx.fillStyle = '#3a6aa8'; ctx.beginPath(); ctx.arc(0, 3, 0.85, 0, Math.PI * 2); ctx.fill();
      break;
    case '♥':
      ctx.fillStyle = '#d8384a';
      ctx.beginPath(); ctx.moveTo(0, 3); ctx.bezierCurveTo(-5, -0.5, -2.6, -4.6, 0, -1.8); ctx.bezierCurveTo(2.6, -4.6, 5, -0.5, 0, 3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.ellipse(-1.6, -1.6, 0.8, 0.5, -0.6, 0, Math.PI * 2); ctx.fill();
      break;
    case '♪':
      ctx.fillStyle = '#4a8a3a'; ctx.strokeStyle = '#4a8a3a'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.ellipse(-1.2, 2, 1.4, 1, -0.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(0.1, 1.8); ctx.lineTo(0.1, -3.4); ctx.quadraticCurveTo(1.8, -2.6, 2.4, -1.2); ctx.stroke();
      break;
    case 'z':
      ctx.font = 'italic 700 7px Alegreya, Georgia, serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#5a6a9a';
      ctx.fillText('z', -1.3, 0.8);
      ctx.font = 'italic 700 4.5px Alegreya, Georgia, serif';
      ctx.fillText('z', 2.2, -2);
      break;
    default:
      ctx.fillStyle = '#5a4a3a';
      for (const dx of [-2.4, 0, 2.4]) { ctx.beginPath(); ctx.arc(dx, 0.4, 0.8, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

/** Lit windows at night outdoors, and shafts of daylight through windows indoors. */
function drawWindowLight(ctx: CanvasRenderingContext2D, objs: MapObject[], cx: number, cy: number, W: number, H: number, hour: number, outdoor: boolean, dk: number) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  if (outdoor && dk > 0.15) {
    for (const o of objs) {
      if (!o.windows || o.hidden || o.data?.dark) continue;
      for (const w of o.windows) {
        const x = o.x + w.x - cx, y = o.y + w.y - cy;
        if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
        const ww = w.w ?? 5, hh = w.h ?? 6;
        const fl = 0.85 + Math.sin(G.clock * 7 + o.id + w.x) * 0.05 + Math.sin(G.clock * 13 + w.y) * 0.04;
        ctx.globalAlpha = Math.min(1, dk * 1.2) * fl;
        const g = ctx.createRadialGradient(x, y, 0, x, y, Math.max(ww, hh) * 0.75);
        g.addColorStop(0, 'rgba(255,200,120,0.95)');
        g.addColorStop(1, 'rgba(255,140,60,0.35)');
        ctx.fillStyle = g;
        ctx.fillRect(x - ww / 2, y - hh / 2, ww, hh);
        ctx.globalAlpha = Math.min(1, dk) * 0.35 * fl;
        const halo = ctx.createRadialGradient(x, y, 0, x, y, Math.max(ww, hh) * 1.8);
        halo.addColorStop(0, 'rgba(255,170,90,0.6)');
        halo.addColorStop(1, 'rgba(255,170,90,0)');
        ctx.fillStyle = halo;
        ctx.fillRect(x - ww * 2, y - hh * 2, ww * 4, hh * 4);
      }
    }
  } else if (!outdoor) {
    // sunbeams slanting in through the windows by day
    const day = hour > 5.5 && hour < 20.5 ? Math.sin(((hour - 5.5) / 15) * Math.PI) : 0;
    if (day > 0.02) {
      const slant = (hour - 13) * -1.6;
      for (const o of objs) {
        if (!o.data?.window || o.hidden) continue;
        const x = o.x - cx, y = o.y - cy - 4;
        const L = 34 + (1 - day) * 20;
        ctx.globalAlpha = 0.16 * day;
        const g = ctx.createLinearGradient(x, y, x + slant, y + L);
        g.addColorStop(0, 'rgba(255,236,190,0.9)');
        g.addColorStop(1, 'rgba(255,236,190,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(x - 4, y);
        ctx.lineTo(x + 4, y);
        ctx.lineTo(x + 7 + slant, y + L);
        ctx.lineTo(x - 7 + slant, y + L);
        ctx.closePath();
        ctx.fill();
        // dust motes drifting in the beam
        ctx.fillStyle = 'rgba(255,240,210,0.9)';
        for (let k = 0; k < 7; k++) {
          const t = (G.clock * 0.05 + k * 0.37 + o.id * 0.13) % 1;
          const mx = x + (Math.sin(k * 12.9 + G.clock * 0.3) * 5) + slant * t, my = y + t * L;
          ctx.globalAlpha = 0.5 * day * Math.sin(t * Math.PI);
          ctx.beginPath(); ctx.arc(mx, my, 0.35, 0, Math.PI * 2); ctx.fill();
        }
      }
    }
  }
  ctx.restore();
}

/** Sets the canvas transform so one unit is one world unit, with the camera at the top-left. */
export function worldTransform(ctx: CanvasRenderingContext2D, cx: number, cy: number) {
  const k = G.scale * G.dpr;
  ctx.setTransform(k, 0, 0, k, -cx * k, -cy * k);
}
/** Screen-space transform in world-unit sized pixels (0..viewW, 0..viewH). */
export function screenTransform(ctx: CanvasRenderingContext2D) {
  const k = G.scale * G.dpr;
  ctx.setTransform(k, 0, 0, k, 0, 0);
}

export function renderWorld() {
  const ctx = G.ctx;
  const cam = G.cam;
  const map = G.map;
  const W = G.viewW, H = G.viewH;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b0807';
  ctx.fillRect(0, 0, G.canvas.width, G.canvas.height);
  const sx = cam.shake > 0 ? rand.range(-cam.shake, cam.shake) : 0;
  const sy = cam.shake > 0 ? rand.range(-cam.shake, cam.shake) : 0;
  const cx = cam.x + sx, cy = cam.y + sy;
  worldTransform(ctx, cx, cy);
  const x0 = cx, y0 = cy, x1 = cx + W, y1 = cy + H;
  chunks.prepare(map, x0, y0, x1, y1);
  chunks.draw(ctx, map, x0, y0, x1, y1, G.clock);
  drawGroundFoliage(ctx, map, x0, y0, x1, y1, G.clock, weather.wind);
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
      const target = behind ? (o.kind === 'tree' ? 0.42 : 0.38) : 1;
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

  // ---------- sun shadows, under everything that stands ----------
  const hour = hourF();
  const outdoor = map.outdoor;
  const rain = outdoor ? weather.rain : 0;
  const sun = sunAt(hour, rain);
  if (outdoor && sun.strength > 0.02) {
    const casters: Caster[] = [];
    for (const d of list) {
      if (d.o) {
        const s = d.o.sprite;
        if (s && s.h >= 7 && d.o.kind !== 'herb' && d.o.kind !== 'item') casters.push({ sprite: s, x: d.o.x, y: d.o.y, flip: d.o.flip });
      } else if (d.a && d.a.pose !== 'dead' && d.a.pose !== 'lie' && d.a.pose !== 'sleep') {
        casters.push({ x: d.a.x, y: d.a.y, blob: d.a.animal ? { w: Math.min(16, d.a.hitW + 4), h: 12 } : { w: 7, h: d.a.look?.build === 'child' ? 16 : 22 } });
      }
    }
    drawSunShadows(ctx, casters, sun, cx, cy, W, H);
    drawAmbientShadows(ctx, sun.strength);
  }

  for (const d of list) {
    if (d.o) {
      const o = d.o;
      if (o.anim === 'wheel') {
        ctx.save();
        const s = o.sprite!;
        ctx.translate(o.x, o.y - s.oy + s.h / 2);
        ctx.rotate(G.clock * 0.8);
        ctx.drawImage(s.canvas, -s.w / 2, -s.h / 2, s.w, s.h);
        ctx.restore();
      } else if (o.sprite!.parts) {
        const ph = o.x * 0.013 + o.y * 0.007;
        const gust = Math.sin(G.clock * 0.37 + o.x * 0.002) * 0.5 + 0.5;
        const bend = (Math.sin(G.clock * 1.25 + ph) * 0.8 + Math.sin(G.clock * 2.9 + ph * 1.7) * 0.2) * (0.35 + weather.wind * 1.4) * (0.6 + gust * 0.6);
        drawSwaying(ctx, o.sprite!, o.x, o.y, bend, o.alpha ?? 1, o.flip);
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
      for (const h of renderHooks.beforeActor) h(ctx, d.a);
      d.a.draw(ctx);
      for (const h of renderHooks.afterActor) h(ctx, d.a);
    }
  }
  // the player stays faintly visible through foliage and roofs
  if (player && !player.hidden && G.mode !== 'title') {
    let hidden = false;
    for (const d of list) if (d.o && (d.o.alpha ?? 1) < 0.9 && d.o.y > player.y) { hidden = true; break; }
    if (hidden) {
      const a0 = player.alpha;
      player.alpha = 0.45 * a0;
      player.draw(ctx);
      player.alpha = a0;
    }
  }
  drawParticles(ctx);
  drawAmbient(ctx);
  // clouds drifting over the land by day
  if (outdoor) drawCloudShadows(ctx, cx, cy, W, H, G.clock, sun.strength * 0.2);

  // ---------- light (screen space) ----------
  screenTransform(ctx);
  const dk = darkness();
  let ambient = outdoor ? skyLight(hour) : roomLight(hour, map.ambient);
  if (rain > 0) ambient = [ambient[0] * (1 - rain * 0.28), ambient[1] * (1 - rain * 0.24), ambient[2] * (1 - rain * 0.16)];
  const lights: Light[] = [];
  for (const o of objs) {
    if (o.hidden) continue;
    if (o.light) lights.push({ x: o.x + o.light.x, y: o.y + o.light.y, r: o.light.r * 1.25, color: o.light.color, intensity: o.light.intensity ?? 0.8, flicker: o.light.flicker });
    if (o.data?.burning) lights.push({ x: o.x, y: o.y - 20, r: 150, color: '#ff7a2a', intensity: 1.1, flicker: true });
    if (o.windows && outdoor && dk > 0.2 && !o.data?.dark) {
      for (const w of o.windows) lights.push({ x: o.x + w.x, y: o.y + w.y + 10, r: 34, color: '#ffb060', intensity: 0.55 * dk, flicker: true });
    }
  }
  for (const fn of renderHooks.lights) lights.push(...fn());
  lights.push(...particleLights());
  const dim = Math.min(ambient[0], ambient[1], ambient[2]);
  if (dim < 0.97 || lights.length) applyLightMap(ctx, W, H, cx, cy, ambient, lights, G.clock);
  // light that lives on after the light map: glowing windows, sunbeams, fire glow
  drawWindowLight(ctx, objs, cx, cy, W, H, hour, outdoor, dk);
  drawGlows(ctx, W, H, cx, cy, lights, G.clock, Math.max(0.25, 1 - dim));
  // morning mist
  if (outdoor) {
    const mist = hour > 4 && hour < 9 ? Math.sin(((hour - 4) / 5) * Math.PI) * 0.16 : 0;
    drawMist(ctx, cx, cy, W, H, G.clock, mist + rain * 0.06);
  }
  grade(ctx, W, H, hour, outdoor, rain);

  // markers, emotes and floating text stay readable above the light
  worldTransform(ctx, cx, cy);
  // emote bubbles over heads
  for (const a of here()) {
    if (a.hidden || !a.emote) continue;
    const bob = Math.sin(G.clock * 6) * 0.8;
    const pop = Math.min(1, (1.6 - a.emote.t) * 8 + 0.2);
    drawEmote(ctx, a.x, a.y - (a.animal ? 24 : 32) + bob, a.emote.icon, pop);
  }
  for (const h of renderHooks.overlay) h(ctx);
  drawFloats(ctx);
  screenTransform(ctx);
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
  return { x: (x - G.cam.x) * G.scale, y: (y - G.cam.y) * G.scale };
}

export { S };
