// Draws the current map: floor, walls, props, actors, effects and lighting.

import { G, player } from '../game/G';
import { HEX_W, ROW_H, hexToPixel, pixelToHex, hexDist, type Hex } from '../core/hex';
import { T_FLOOR, T_VOID, T_WALL, T_WATER, type MapRuntime } from '../game/map';
import { FLOORS, WALLS, floorColor, shade, type WallMat } from './materials';
import { hash2 } from '../core/rng';
import { drawActor, type Pose } from './sprites';
import { drawProp, drawDoor } from './props';
import { camera, fxState, updateCamera } from './fx';
import { lookOf } from '../game/actors';
import { ITEMS } from '../data/items';
import { drawIcon } from './icons';
import type { Actor, MapObject } from '../game/types';
import { nightness } from '../game/time';

export const view = { w: 800, h: 600, zoom: 1.5, dpr: 1, hudH: 0 };

let canvas: HTMLCanvasElement;
let c: CanvasRenderingContext2D;
let floorCache: { map: MapRuntime; version: number; canvas: HTMLCanvasElement; ox: number; oy: number } | null = null;
let lightCanvas: HTMLCanvasElement;

export function initRenderer(cv: HTMLCanvasElement) {
  canvas = cv;
  c = cv.getContext('2d')!;
  lightCanvas = document.createElement('canvas');
  resize();
  window.addEventListener('resize', resize);
}

export function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  view.dpr = dpr;
  view.w = w;
  view.h = h;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  lightCanvas.width = Math.ceil(w / 2);
  lightCanvas.height = Math.ceil(h / 2);
  const hud = document.getElementById('hud');
  view.hudH = hud ? hud.offsetHeight : 0;
  if (!(view as any).userZoom) view.zoom = Math.max(1, Math.min(2.4, Math.min(w / 820, (h - view.hudH) / 520) * 1.12));
}

export function setZoom(z: number) {
  view.zoom = Math.max(0.8, Math.min(3, z));
  (view as any).userZoom = true;
}

/** Screen (CSS px) to world pixel coordinates. */
export function screenToWorld(sx: number, sy: number) {
  const cx = view.w / 2;
  const cy = (view.h - view.hudH) / 2;
  return { x: (sx - cx) / view.zoom + camera.x, y: (sy - cy) / view.zoom + camera.y };
}

export function worldToScreen(wx: number, wy: number) {
  const cx = view.w / 2;
  const cy = (view.h - view.hudH) / 2;
  return { x: (wx - camera.x) * view.zoom + cx, y: (wy - camera.y) * view.zoom + cy };
}

export function screenToHex(sx: number, sy: number): Hex {
  const w = screenToWorld(sx, sy);
  return pixelToHex(w.x, w.y);
}

// ----------------------------------------------------------------- floor cache

function cellPoly(ctx: CanvasRenderingContext2D, x: number, y: number, grow = 0.6) {
  const hw = HEX_W / 2 + grow;
  const hb = ROW_H / 2 + grow * 0.5;
  const sk = HEX_W / 4;
  ctx.beginPath();
  ctx.moveTo(x - hw - sk, y - hb);
  ctx.lineTo(x + hw - sk, y - hb);
  ctx.lineTo(x + hw + sk, y + hb);
  ctx.lineTo(x - hw + sk, y + hb);
  ctx.closePath();
}

function buildFloor(m: MapRuntime) {
  const minX = -HEX_W;
  const maxX = m.w * HEX_W + m.h * (HEX_W / 2) + HEX_W;
  const minY = -ROW_H;
  const maxY = m.h * ROW_H + ROW_H;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(maxX - minX);
  cv.height = Math.ceil(maxY - minY);
  const f = cv.getContext('2d')!;
  f.translate(-minX, -minY);
  for (let r = 0; r < m.h; r++) {
    for (let q = 0; q < m.w; q++) {
      const t = m.tile[r * m.w + q];
      if (t === T_VOID) continue;
      const { x, y } = hexToPixel(q, r);
      const mat = t === T_WATER ? 'water' : m.floorMat[r * m.w + q];
      f.fillStyle = floorColor(mat, q, r);
      cellPoly(f, x, y);
      f.fill();
    }
  }
  // Detail pass (on top so edges blend).
  for (let r = 0; r < m.h; r++) {
    for (let q = 0; q < m.w; q++) {
      const i = r * m.w + q;
      const t = m.tile[i];
      if (t === T_VOID) continue;
      const { x, y } = hexToPixel(q, r);
      const mat = FLOORS[t === T_WATER ? 'water' : m.floorMat[i]] ?? FLOORS.sand;
      if (mat.speck) {
        f.fillStyle = `rgb(${mat.speck.join(',')})`;
        const n = mat.speckDensity ?? 4;
        for (let k = 0; k < n; k++) {
          const px = x + (hash2(q, r, k * 3 + 1) - 0.5) * HEX_W * 1.1 + (hash2(q, r, k * 5 + 2) - 0.5) * 8;
          const py = y + (hash2(q, r, k * 7 + 3) - 0.5) * ROW_H;
          f.fillRect(px, py, 1 + (k % 2), 1);
        }
      }
      if (mat.tiles && t === T_FLOOR) {
        f.strokeStyle = mat.grout ?? 'rgba(0,0,0,0.3)';
        f.lineWidth = 1;
        cellPoly(f, x, y, -0.5);
        f.stroke();
        if (mat.plates) {
          f.fillStyle = 'rgba(255,255,255,0.06)';
          f.fillRect(x - 6, y - 4, 3, 1);
          f.fillStyle = 'rgba(0,0,0,0.25)';
          f.fillRect(x + 6, y + 2, 1.5, 1.5);
          f.fillRect(x - 8, y + 2, 1.5, 1.5);
        }
      }
      if (mat.cracks && hash2(q, r, 99) < mat.cracks * 0.4) {
        f.strokeStyle = 'rgba(30,20,10,0.35)';
        f.lineWidth = 1;
        f.beginPath();
        const a = hash2(q, r, 5) * Math.PI;
        f.moveTo(x - Math.cos(a) * 10, y - Math.sin(a) * 4);
        f.lineTo(x + (hash2(q, r, 6) - 0.5) * 6, y + (hash2(q, r, 8) - 0.5) * 4);
        f.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 5);
        f.stroke();
      }
      if (t === T_WATER) {
        f.strokeStyle = 'rgba(160,200,190,0.25)';
        f.beginPath();
        f.moveTo(x - 8, y);
        f.quadraticCurveTo(x - 2, y - 3, x + 4, y);
        f.stroke();
      }
      const decor = m.decor[i];
      if (decor === 'scrub') {
        f.fillStyle = hash2(q, r, 11) > 0.5 ? '#6a6a3a' : '#7a6e44';
        for (let k = 0; k < 4; k++) {
          f.beginPath();
          f.arc(x + (hash2(q, r, k + 20) - 0.5) * 16, y + (hash2(q, r, k + 30) - 0.5) * 8 - 2, 2 + hash2(q, r, k) * 2.5, 0, 7);
          f.fill();
        }
      } else if (decor === 'rubble') {
        for (let k = 0; k < 5; k++) {
          f.fillStyle = k % 2 ? '#6a625a' : '#857b70';
          f.fillRect(x + (hash2(q, r, k + 40) - 0.5) * 20, y + (hash2(q, r, k + 50) - 0.5) * 8, 3 + hash2(q, r, k) * 4, 2 + hash2(q, r, k + 3) * 2);
        }
      } else if (decor === 'grass') {
        f.strokeStyle = '#6a7a3a';
        for (let k = 0; k < 6; k++) {
          const px = x + (hash2(q, r, k + 60) - 0.5) * 20;
          const py = y + (hash2(q, r, k + 70) - 0.5) * 8;
          f.beginPath();
          f.moveTo(px, py);
          f.lineTo(px + 1, py - 4);
          f.stroke();
        }
      } else if (decor === 'oil') {
        f.fillStyle = 'rgba(20,18,16,0.5)';
        f.beginPath();
        f.ellipse(x, y, 12, 5, 0.3, 0, 7);
        f.fill();
      } else if (decor === 'glow') {
        f.fillStyle = 'rgba(140,220,80,0.35)';
        f.beginPath();
        f.ellipse(x, y, 10, 4, 0, 0, 7);
        f.fill();
      } else if (decor === 'stripe') {
        f.fillStyle = 'rgba(220,180,40,0.55)';
        cellPoly(f, x, y, -5);
        f.fill();
      } else if (decor === 'track') {
        f.fillStyle = 'rgba(60,50,40,0.5)';
        f.fillRect(x - 12, y - 3, 24, 1.5);
        f.fillRect(x - 12, y + 2, 24, 1.5);
      }
    }
  }
  // Void edge darkening
  floorCache = { map: m, version: m.version, canvas: cv, ox: minX, oy: minY };
}

// ----------------------------------------------------------------- walls

function drawWall(ctx: CanvasRenderingContext2D, m: MapRuntime, q: number, r: number, alpha: number, cut: boolean) {
  const i = r * m.w + q;
  const mat: WallMat = WALLS[m.wallMat[i]] ?? WALLS.concrete;
  const { x, y } = hexToPixel(q, r);
  let H = mat.height;
  if (mat.jag) H = H * (0.75 + hash2(q, r, 17) * 0.45);
  if (cut) H = Math.min(H, 10);
  const hw = HEX_W / 2;
  const hb = ROW_H / 2;
  const sk = HEX_W / 4;
  const TL = { x: x - hw - sk, y: y - hb };
  const TR = { x: x + hw - sk, y: y - hb };
  const BR = { x: x + hw + sk, y: y + hb };
  const BL = { x: x - hw + sk, y: y + hb };
  const up = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - H });
  ctx.globalAlpha = alpha;
  const below = m.tileAt(q, r + 1) === T_WALL;
  const left = m.tileAt(q - 1, r) === T_WALL;
  // left face
  if (!left) {
    ctx.fillStyle = mat.side;
    fillPoly(ctx, [TL, BL, up(BL), up(TL)]);
    patternFace(ctx, mat, TL, BL, H, q, r, true);
  }
  if (!below) {
    ctx.fillStyle = mat.face;
    fillPoly(ctx, [BL, BR, up(BR), up(BL)]);
    patternFace(ctx, mat, BL, BR, H, q, r, false);
  }
  ctx.fillStyle = mat.top;
  fillPoly(ctx, [up(TL), up(TR), up(BR), up(BL)]);
  if (mat.jag) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    fillPoly(ctx, [up(TL), up(TR), { x: up(TR).x - 6, y: up(TR).y + 4 }]);
  }
  ctx.globalAlpha = 1;
}

function fillPoly(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[]) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
  ctx.closePath();
  ctx.fill();
}

function patternFace(ctx: CanvasRenderingContext2D, mat: WallMat, a: { x: number; y: number }, b: { x: number; y: number }, H: number, q: number, r: number, side: boolean) {
  if (!mat.line && mat.pattern !== 'rock') return;
  ctx.strokeStyle = mat.line ?? 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  const lerp = (t: number, h: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t - h });
  ctx.beginPath();
  switch (mat.pattern) {
    case 'brick':
    case 'block': {
      const rowH = mat.pattern === 'brick' ? 6 : 12;
      for (let h = rowH, k = 0; h < H; h += rowH, k++) {
        const p0 = lerp(0, h);
        const p1 = lerp(1, h);
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        const off = (k + q + r) % 2 ? 0.5 : 0;
        for (const t of mat.pattern === 'brick' ? [off, off + 0.5] : [off]) {
          if (t <= 0 || t >= 1) continue;
          const v0 = lerp(t, h - rowH);
          const v1 = lerp(t, h);
          ctx.moveTo(v0.x, v0.y);
          ctx.lineTo(v1.x, v1.y);
        }
      }
      break;
    }
    case 'panel':
    case 'shelter': {
      for (const t of [0.02, 0.98]) {
        const v0 = lerp(t, 0);
        const v1 = lerp(t, H);
        ctx.moveTo(v0.x, v0.y);
        ctx.lineTo(v1.x, v1.y);
      }
      for (const h of mat.pattern === 'shelter' ? [8, H - 10] : [H / 2]) {
        const p0 = lerp(0, h);
        const p1 = lerp(1, h);
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
      }
      break;
    }
    case 'plank':
      for (let t = 0.25; t < 1; t += 0.25) {
        const v0 = lerp(t, 0);
        const v1 = lerp(t, H);
        ctx.moveTo(v0.x, v0.y);
        ctx.lineTo(v1.x, v1.y);
      }
      break;
    case 'adobe':
      for (let k = 0; k < 3; k++) {
        const t = hash2(q, r, k + (side ? 50 : 0));
        const h = hash2(q, r, k + 9) * H;
        const p = lerp(t, h);
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + 3, p.y + 1);
      }
      break;
    case 'fence':
      for (let t = 0.1; t < 1; t += 0.2) {
        const v0 = lerp(t, 0);
        const v1 = lerp(t, H);
        ctx.moveTo(v0.x, v0.y);
        ctx.lineTo(v1.x, v1.y);
      }
      break;
    case 'scrap': {
      const colors = ['rgba(120,60,30,0.35)', 'rgba(90,90,90,0.3)', 'rgba(60,80,60,0.3)'];
      ctx.stroke();
      for (let k = 0; k < 2; k++) {
        ctx.fillStyle = colors[Math.floor(hash2(q, r, k + (side ? 7 : 3)) * 3)];
        const t = hash2(q, r, k + 20) * 0.6;
        const h0 = hash2(q, r, k + 30) * H * 0.6;
        const p0 = lerp(t, h0);
        const p1 = lerp(t + 0.4, h0);
        fillPoly(ctx, [p0, p1, { x: p1.x, y: p1.y - H * 0.35 }, { x: p0.x, y: p0.y - H * 0.35 }]);
      }
      ctx.beginPath();
      break;
    }
    case 'rock':
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      for (let k = 0; k < 3; k++) {
        const t = hash2(q, r, k + (side ? 60 : 70));
        const h = hash2(q, r, k + 80) * H;
        const p = lerp(t, h);
        ctx.moveTo(p.x - 3, p.y);
        ctx.lineTo(p.x + 4, p.y + 2);
      }
      break;
  }
  ctx.stroke();
}

// ----------------------------------------------------------------- frame

export interface HoverInfo {
  hex: Hex | null;
  path: Hex[] | null;
  mode: 'move' | 'act' | 'look' | 'target' | 'skill';
  apCost?: number;
  valid?: boolean;
}

export const hover: HoverInfo = { hex: null, path: null, mode: 'move' };

function actorPixel(a: Actor, now: number): { x: number; y: number; walk: number } {
  const to = hexToPixel(a.q, a.r);
  if (a._move) {
    const t = Math.min(1, (now - a._move.t) / a._move.dur);
    const from = hexToPixel(a._move.fq, a._move.fr);
    return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, walk: t * Math.PI + (a.uid.length % 2) * Math.PI + (a.q + a.r) * Math.PI };
  }
  return { x: to.x, y: to.y, walk: -1 };
}

function poseOf(a: Actor, now: number, walk: number): Pose {
  const w = a.hands[a.active];
  const wd = w ? ITEMS[w.id] : null;
  const armor = a.armor ? ITEMS[a.armor.id]?.armor : (a as any)._wore ? ITEMS[(a as any)._wore]?.armor : undefined;
  let attack = -1;
  let hit = -1;
  let dead = -1;
  let attackKind: string | undefined;
  let violent = false;
  if (a._anim) {
    const t = (now - a._anim.t) / a._anim.dur;
    if (a._anim.kind === 'die') {
      dead = Math.min(1, t);
      violent = !!a._anim.data?.violent;
    } else if (t < 1) {
      if (a._anim.kind === 'hit') hit = t;
      else {
        attack = t;
        attackKind = a._anim.kind;
      }
    } else a._anim = undefined;
  }
  if (a.dead && dead < 0) {
    dead = 1;
    violent = !!(a as any)._violent;
  }
  if (a.knockedOut && !a.dead) dead = 0.9;
  return {
    facing: a.facing,
    walk,
    attack,
    attackKind,
    hit,
    dead,
    weapon: wd?.icon,
    armor: armor?.look,
    armorTint: armor?.tint,
    flash: !!a._flash && now - a._flash < 120,
    t: now / 1000,
    sneaking: a.uid === 'player' && !!G.state.flags._sneak,
    violent,
  };
}

let lastT = 0;

export function render(now: number) {
  const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0.016;
  lastT = now;
  const m = G.map;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.fillStyle = '#000';
  c.fillRect(0, 0, canvas.width, canvas.height);
  if (!m) return;
  updateCamera(dt);
  const p = player();
  if (!camera.manual) {
    const pp = actorPixel(p, now);
    // Follow the player loosely outside combat.
    if (!G.combat) {
      camera.tx = pp.x;
      camera.ty = pp.y;
    }
  }
  if (!floorCache || floorCache.map !== m) buildFloor(m);
  const z = view.zoom * view.dpr;
  const cx = (view.w / 2) * view.dpr;
  const cy = ((view.h - view.hudH) / 2) * view.dpr;
  const shx = camera.shake ? (Math.random() - 0.5) * camera.shake : 0;
  const shy = camera.shake ? (Math.random() - 0.5) * camera.shake : 0;
  c.setTransform(z, 0, 0, z, cx - camera.x * z + shx, cy - camera.y * z + shy);
  c.imageSmoothingEnabled = true;
  // Floor
  c.drawImage(floorCache!.canvas, floorCache!.ox, floorCache!.oy);

  // Visible bounds in world px
  const tl = screenToWorld(0, 0);
  const br = screenToWorld(view.w, view.h);
  const rMin = Math.max(0, Math.floor(tl.y / ROW_H) - 2);
  const rMax = Math.min(m.h - 1, Math.ceil(br.y / ROW_H) + 6);
  const t = now / 1000;

  // Exit grids
  for (const [idx] of m.exitAt) {
    const q = idx % m.w;
    const r = Math.floor(idx / m.w);
    if (r < rMin || r > rMax) continue;
    const { x, y } = hexToPixel(q, r);
    c.fillStyle = `rgba(90,200,120,${0.12 + Math.sin(t * 2 + q * 0.3) * 0.05})`;
    cellPoly(c, x, y, -2);
    c.fill();
  }

  // Blood splats on this map
  for (const s of fxState.splats) {
    if (s.map !== m.def.id) continue;
    const { x, y } = hexToPixel(s.q, s.r);
    c.fillStyle = 'rgba(100,10,6,0.6)';
    c.beginPath();
    c.ellipse(x + s.ox, y + s.oy, s.s, s.s * 0.45, 0, 0, 7);
    c.fill();
  }

  // Hover hex + path
  drawHover(m);

  // Collect drawables per row.
  const rows: { q: number; kind: number; o: any; x: number; y: number }[][] = [];
  for (let r = rMin; r <= rMax; r++) rows[r] = [];
  for (const o of m.objects) {
    if (o.hidden || o.r < rMin || o.r > rMax) continue;
    const { x, y } = hexToPixel(o.q, o.r);
    const flat = o.blocks === false && o.kind !== 'door' && o.kind !== 'hatch' && o.kind !== 'gate';
    rows[o.r].push({ q: o.q, kind: flat ? -2 : 1, o, x, y });
  }
  for (const g of m.ground) {
    if (g.r < rMin || g.r > rMax) continue;
    const { x, y } = hexToPixel(g.q, g.r);
    rows[g.r].push({ q: g.q, kind: -1, o: g, x, y });
  }
  for (const a of m.actors) {
    const pos = actorPixel(a, now);
    // Sort moving actors by the lower of their two cells.
    const sr = a._move ? Math.max(a.r, a._move.fr) : a.r;
    if (sr < rMin || sr > rMax) continue;
    rows[sr].push({ q: a.q + (a.dead ? -0.5 : 0.1), kind: a.dead ? 0 : 2, o: a, x: pos.x, y: pos.y });
  }

  const pr = p.r;
  const pq = p.q;
  const ppx = hexToPixel(pq, pr);
  for (let r = rMin; r <= rMax; r++) {
    const list = rows[r];
    // Flat things first, then walls/objects/actors by q.
    list.sort((a, b) => (a.kind < 0 ? a.kind - 10 : 0) - (b.kind < 0 ? b.kind - 10 : 0) || a.q - b.q || a.kind - b.kind);
    let li = 0;
    while (li < list.length && list[li].kind < 0) {
      drawItem(list[li], t, now);
      li++;
    }
    const rowStart = Math.max(0, Math.floor((tl.x - r * (HEX_W / 2)) / HEX_W) - 2);
    const rowEnd = Math.min(m.w - 1, Math.ceil((br.x - r * (HEX_W / 2)) / HEX_W) + 2);
    for (let q = rowStart; q <= rowEnd; q++) {
      while (li < list.length && list[li].q < q) {
        drawItem(list[li], t, now);
        li++;
      }
      if (m.tile[r * m.w + q] === T_WALL) {
        // See-through near the player: walls in front of the player fade.
        let alpha = 1;
        let cut = false;
        const dr = r - pr;
        if (dr > 0 && dr <= 6) {
          const wx = hexToPixel(q, r).x;
          const dx = Math.abs(wx - ppx.x);
          if (dx < 36 + dr * 14) {
            alpha = 0.35 + Math.min(0.5, (dx / (36 + dr * 14)) * 0.5);
            cut = dr <= 2 && dx < 30;
          }
        }
        drawWall(c, m, q, r, alpha, cut && alpha < 0.5);
        // Doors in walls? (doors are objects on floor cells)
      }
    }
    while (li < list.length) {
      drawItem(list[li], t, now);
      li++;
    }
  }

  drawProjectiles(now);
  drawBlasts(now);
  drawLighting(m, now);
  // Barks and floaters on top of lighting.
  c.setTransform(z, 0, 0, z, cx - camera.x * z + shx, cy - camera.y * z + shy);
  for (const a of m.actors) {
    if (a._bark && a._bark.until > now) drawBark(a, now);
    else if (a._bark) a._bark = undefined;
  }
  drawFloaters(now);
  c.setTransform(1, 0, 0, 1, 0, 0);
  drawFade(now);
}

function drawItem(d: { kind: number; o: any; x: number; y: number }, t: number, now: number) {
  if (d.kind === -1) {
    c.save();
    c.translate(d.x, d.y - 2);
    c.scale(0.45, 0.45);
    drawIcon(c, ITEMS[d.o.stack.id]?.icon ?? 'box', -24, -16, 48, 32);
    c.restore();
    return;
  }
  if (d.kind === -2 || d.kind === 1) {
    const o = d.o as MapObject;
    if (o.kind === 'door' || o.kind === 'hatch' || o.kind === 'gate') {
      const m = G.map!;
      const wmat = WALLS[m.wallMat[m.idx(o.q + (o.vertical ? 0 : 1), o.r + (o.vertical ? 1 : 0))] || m.def.wall] ?? WALLS.concrete;
      drawDoor(c, o, d.x + (o.vertical ? -8 : 0), d.y + (o.vertical ? 0 : 8), wmat.height, wmat.face);
      return;
    }
    drawProp(c, o, d.x, d.y, t);
    return;
  }
  const a = d.o as Actor;
  const pose = poseOf(a, now, actorPixelWalk(a, now));
  if (a === hoverActor && !a.dead) {
    c.strokeStyle = a.hostile ? 'rgba(255,60,40,0.8)' : 'rgba(120,255,120,0.7)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.ellipse(d.x, d.y, 12, 5, 0, 0, 7);
    c.stroke();
  }
  if (G.combat && G.combat.order[G.combat.turn] === a && !a.dead) {
    c.strokeStyle = 'rgba(255,220,80,0.8)';
    c.lineWidth = 1;
    c.beginPath();
    c.ellipse(d.x, d.y, 13, 5.5, 0, 0, 7);
    c.stroke();
  }
  drawActor(c, d.x, d.y, lookOf(a), pose);
}

function actorPixelWalk(a: Actor, now: number) {
  if (!a._move) return -1;
  const t = Math.min(1, (now - a._move.t) / a._move.dur);
  return (t + (a.q + a.r) % 2) * Math.PI;
}

export let hoverActor: Actor | null = null;
export function setHoverActor(a: Actor | null) {
  hoverActor = a;
}

function drawHover(m: MapRuntime) {
  if (!hover.hex || G.modal) return;
  const { q, r } = hover.hex;
  if (m.tileAt(q, r) === T_VOID) return;
  const { x, y } = hexToPixel(q, r);
  const color = hover.mode === 'target' ? '#ff4030' : hover.mode === 'look' ? '#60c0ff' : hover.mode === 'act' || hover.mode === 'skill' ? '#e0d060' : hover.valid === false ? '#c04030' : '#e0c040';
  if (G.combat && hover.path && hover.mode === 'move') {
    c.fillStyle = 'rgba(255,220,80,0.15)';
    for (const h of hover.path) {
      const pp = hexToPixel(h.q, h.r);
      cellPoly(c, pp.x, pp.y, -3);
      c.fill();
    }
  }
  c.strokeStyle = color;
  c.lineWidth = 1.5;
  // Hex outline
  c.beginPath();
  for (let k = 0; k < 6; k++) {
    const ang = (Math.PI / 3) * k + Math.PI / 6;
    const px = x + Math.cos(ang) * 17;
    const py = y + Math.sin(ang) * 10;
    if (k === 0) c.moveTo(px, py);
    else c.lineTo(px, py);
  }
  c.closePath();
  c.stroke();
  if (hover.apCost !== undefined && G.combat) {
    c.font = 'bold 11px monospace';
    c.textAlign = 'center';
    c.fillStyle = hover.valid === false ? '#ff5040' : '#ffe060';
    c.fillText(String(hover.apCost), x, y + 4);
  }
}

function drawProjectiles(now: number) {
  const list = fxState.projectiles;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    const t = (now - p.t0) / p.dur;
    if (t >= 1) {
      list.splice(i, 1);
      p.done();
      continue;
    }
    const x = p.from.x + (p.to.x - p.from.x) * t;
    const y = p.from.y + (p.to.y - p.from.y) * t - (p.kind === 'thrown' ? Math.sin(t * Math.PI) * 30 : 0);
    switch (p.kind) {
      case 'laser':
      case 'plasma': {
        const col = p.kind === 'laser' ? 'rgba(255,60,40,' : 'rgba(120,255,100,';
        c.strokeStyle = col + (1 - t) + ')';
        c.lineWidth = p.kind === 'laser' ? 2 : 4;
        c.beginPath();
        c.moveTo(p.from.x, p.from.y);
        c.lineTo(p.kind === 'laser' ? p.to.x : x, p.kind === 'laser' ? p.to.y : y);
        c.stroke();
        break;
      }
      case 'flame': {
        for (let k = 0; k < 6; k++) {
          const tt = Math.max(0, t - k * 0.06);
          const fx = p.from.x + (p.to.x - p.from.x) * tt;
          const fy = p.from.y + (p.to.y - p.from.y) * tt;
          c.fillStyle = `rgba(255,${120 + k * 20},30,${0.8 - k * 0.1})`;
          c.beginPath();
          c.arc(fx, fy, 4 + k * 1.5, 0, 7);
          c.fill();
        }
        break;
      }
      case 'rocket':
        c.fillStyle = '#ddd';
        c.fillRect(x - 3, y - 1.5, 6, 3);
        c.fillStyle = 'rgba(255,160,60,0.8)';
        c.beginPath();
        c.arc(x - (p.to.x - p.from.x) * 0.02, y, 3, 0, 7);
        c.fill();
        break;
      case 'thrown':
        c.save();
        c.translate(x, y);
        c.rotate(t * 12);
        c.scale(0.3, 0.3);
        drawIcon(c, ITEMS[p.item ?? '']?.icon ?? 'grenade', -24, -16, 48, 32);
        c.restore();
        break;
      default: {
        // Bullets: short tracer streaks (several for bursts).
        const n = p.burst ? 5 : 1;
        for (let k = 0; k < n; k++) {
          const tt = Math.min(1, t * (p.burst ? 1.4 : 1) - k * 0.08);
          if (tt < 0) continue;
          const bx = p.from.x + (p.to.x - p.from.x) * tt + (p.burst ? (Math.sin(k * 7) * 4) : 0);
          const by = p.from.y + (p.to.y - p.from.y) * tt + (p.burst ? (Math.cos(k * 5) * 3) : 0);
          c.strokeStyle = 'rgba(255,230,160,0.9)';
          c.lineWidth = 1.5;
          const dx = (p.to.x - p.from.x) * 0.03;
          const dy = (p.to.y - p.from.y) * 0.03;
          c.beginPath();
          c.moveTo(bx - dx, by - dy);
          c.lineTo(bx, by);
          c.stroke();
        }
      }
    }
  }
}

function drawBlasts(now: number) {
  const list = fxState.blasts;
  for (let i = list.length - 1; i >= 0; i--) {
    const b = list[i];
    const t = (now - b.t0) / b.dur;
    if (t >= 1) {
      list.splice(i, 1);
      continue;
    }
    const R = (b.radius + 0.7) * HEX_W * (0.3 + t * 0.7);
    const g = c.createRadialGradient(b.x, b.y - 10, 0, b.x, b.y - 10, R);
    g.addColorStop(0, `rgba(255,240,180,${1 - t})`);
    g.addColorStop(0.4, b.fire ? `rgba(255,120,20,${0.9 - t})` : `rgba(255,140,40,${0.9 - t})`);
    g.addColorStop(1, 'rgba(60,40,30,0)');
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(b.x, b.y - 10, R, R * 0.7, 0, 0, 7);
    c.fill();
  }
}

function drawLighting(m: MapRuntime, now: number) {
  let dark = m.def.dark ?? 0;
  if (m.def.outdoor) dark = Math.max(dark, nightness() * 0.62);
  if (dark <= 0.01) return;
  const lc = lightCanvas.getContext('2d')!;
  const W = lightCanvas.width;
  const H = lightCanvas.height;
  lc.setTransform(1, 0, 0, 1, 0, 0);
  lc.globalCompositeOperation = 'source-over';
  lc.clearRect(0, 0, W, H);
  lc.fillStyle = m.def.outdoor ? `rgba(8,10,30,${dark})` : `rgba(0,0,0,${dark})`;
  lc.fillRect(0, 0, W, H);
  lc.globalCompositeOperation = 'destination-out';
  const light = (wx: number, wy: number, radius: number, strength: number) => {
    const s = worldToScreen(wx, wy);
    const sx = s.x / 2;
    const sy = s.y / 2;
    const R = (radius * view.zoom) / 2;
    const g = lc.createRadialGradient(sx, sy, 0, sx, sy, R);
    g.addColorStop(0, `rgba(0,0,0,${strength})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    lc.fillStyle = g;
    lc.fillRect(sx - R, sy - R, R * 2, R * 2);
  };
  const p = player();
  const pp = actorPixel(p, now);
  const flare = (G.state.flags._flareUntil ?? 0) > G.state.time;
  light(pp.x, pp.y - 16, flare ? 260 : 150, flare ? 1 : 0.85);
  for (const o of m.objects) {
    if (o.kind === 'campfire' || o.kind === 'lamp' || o.kind === 'reactor' || o.kind === 'vat' || o.kind === 'terminal' || o.light) {
      const { x, y } = hexToPixel(o.q, o.r);
      const flick = o.kind === 'campfire' ? Math.sin(now / 90) * 8 : 0;
      light(x, y - 16, (o.light ?? (o.kind === 'campfire' ? 150 : o.kind === 'lamp' ? 130 : 70)) + flick, 0.9);
    }
  }
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(lightCanvas, 0, 0, canvas.width, canvas.height);
}

function drawBark(a: Actor, now: number) {
  const pos = actorPixel(a, now);
  const text = a._bark!.text;
  c.font = '10px "Share Tech Mono", monospace';
  c.textAlign = 'center';
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if ((cur + ' ' + w).length > 26 && cur) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? cur + ' ' + w : w;
  }
  if (cur) lines.push(cur);
  const top = pos.y - 52 - lines.length * 11;
  lines.forEach((l, i) => {
    c.fillStyle = 'rgba(0,0,0,0.8)';
    c.fillText(l, pos.x + 1, top + i * 11 + 1);
    c.fillStyle = a._bark!.color ?? (a.hostile ? '#ff6a50' : '#7cff6a');
    c.fillText(l, pos.x, top + i * 11);
  });
}

function drawFloaters(now: number) {
  const list = fxState.floaters;
  for (let i = list.length - 1; i >= 0; i--) {
    const f = list[i];
    const t = (now - f.t0) / 1100;
    if (t >= 1) {
      list.splice(i, 1);
      continue;
    }
    c.font = 'bold 12px monospace';
    c.textAlign = 'center';
    c.globalAlpha = 1 - t * t;
    c.fillStyle = '#000';
    c.fillText(f.text, f.x + 1, f.y - t * 20 + 1);
    c.fillStyle = f.color;
    c.fillText(f.text, f.x, f.y - t * 20);
    c.globalAlpha = 1;
  }
}

function drawFade(now: number) {
  if (fxState.fade <= 0) return;
  const t = (now - fxState.fadeT0) / 1800;
  const a = t < 0.3 ? t / 0.3 : t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
  if (t >= 1) {
    fxState.fade = 0;
    return;
  }
  c.fillStyle = `rgba(0,0,0,${a})`;
  c.fillRect(0, 0, canvas.width, canvas.height);
  if (fxState.fadeText) {
    c.font = `${16 * view.dpr}px "Share Tech Mono", monospace`;
    c.textAlign = 'center';
    c.fillStyle = `rgba(200,220,160,${a})`;
    c.fillText(fxState.fadeText, canvas.width / 2, canvas.height / 2);
  }
}

export function invalidateFloor() {
  floorCache = null;
}

export { T_FLOOR, hexDist };
