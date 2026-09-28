// The world map (a tab in the book, and fast travel from signposts).

import { el, button, openScreen } from './ui';
import { G } from '../G';
import { getMap, hasMap, here } from '../world/world';
import { PLACES, placeById, Place } from '../content/places';
import { S, isNight, flag } from '../state';
import { makeCanvas } from '../gfx/pixel';
import { newCanvas } from '../gfx/paint';
import { T, tdef } from '../world/terrain';
import { TILE, rand } from '../engine/util';
import { markerPositions, resolveMarker, QUESTS } from '../systems/quests';
import { notify, esc } from './notify';
import { travel } from '../systems/transition';
import { applyNeeds } from '../systems/survival';
import { emit } from '../engine/events';
import { overweight } from '../systems/inventory';

const PX = 6; // canvas pixels per tile on the painted map
let baseCache: { version: number; canvas: HTMLCanvasElement } | null = null;

const WASH: Partial<Record<number, [string, number]>> = {
  [T.MEADOW]: ['#9aae5a', 0.22], [T.GRASS]: ['#b4b870', 0.1], [T.FOREST]: ['#5e7a3a', 0.42],
  [T.FIELD]: ['#c89a5a', 0.35], [T.VEG]: ['#b89050', 0.35], [T.WHEAT]: ['#d8b050', 0.42],
  [T.WATER]: ['#5a86a8', 0.75], [T.DEEP]: ['#46749a', 0.85], [T.FORD]: ['#7aa0b8', 0.6],
  [T.SAND]: ['#e0c890', 0.4], [T.MUD]: ['#8a6a48', 0.35], [T.ASH]: ['#6a625a', 0.5], [T.BURNT_WHEAT]: ['#5a524a', 0.5],
  [T.ROCK]: ['#9a9084', 0.5], [T.ROAD]: ['#a07a4e', 0.0], [T.COBBLE]: ['#9a8e7e', 0.45], [T.FLAGSTONE]: ['#9a8e7e', 0.45],
};

/** The overworld painted as an old parchment map: washes, inked trees and peaks, roads, rivers, towns. */
function mapCanvas(): HTMLCanvasElement {
  const m = getMap('overworld');
  if (baseCache && baseCache.version === m.version) return baseCache.canvas;
  const W = m.w * PX, H = m.h * PX;
  const c = newCanvas(W, H);
  const g = c.getContext('2d')!;
  const at = (x: number, y: number) => m.ground[Math.max(0, Math.min(m.h - 1, y)) * m.w + Math.max(0, Math.min(m.w - 1, x))];
  // parchment
  g.fillStyle = '#e6d6ac';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = 30 + Math.random() * 140;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${Math.random() < 0.5 ? '150,110,60' : '255,245,215'},${0.05 + Math.random() * 0.06})`);
    gr.addColorStop(1, 'rgba(150,110,60,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // watercolour washes, tile by tile as soft dabs
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const w = WASH[at(x, y)];
    if (!w || w[1] <= 0) continue;
    g.fillStyle = w[0];
    g.globalAlpha = w[1] * 0.55;
    g.beginPath();
    g.arc((x + 0.5) * PX, (y + 0.5) * PX, PX * 0.95, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  // riverbanks inked
  g.strokeStyle = 'rgba(40,70,100,0.55)';
  g.lineWidth = 1;
  const isW = (t: number) => t === T.WATER || t === T.DEEP || t === T.FORD;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    if (!isW(at(x, y))) continue;
    const X = x * PX, Y = y * PX;
    g.beginPath();
    if (!isW(at(x, y - 1))) { g.moveTo(X, Y); g.lineTo(X + PX, Y); }
    if (!isW(at(x, y + 1))) { g.moveTo(X, Y + PX); g.lineTo(X + PX, Y + PX); }
    if (!isW(at(x - 1, y))) { g.moveTo(X, Y); g.lineTo(X, Y + PX); }
    if (!isW(at(x + 1, y))) { g.moveTo(X + PX, Y); g.lineTo(X + PX, Y + PX); }
    g.stroke();
    if ((x * 7 + y * 13) % 23 === 0 && isW(at(x + 1, y)) && isW(at(x - 1, y))) {
      g.strokeStyle = 'rgba(230,240,245,0.6)';
      g.beginPath(); g.moveTo(X - 2, Y + 3); g.quadraticCurveTo(X + 1, Y, X + 4, Y + 3); g.quadraticCurveTo(X + 7, Y + 6, X + 10, Y + 3); g.stroke();
      g.strokeStyle = 'rgba(40,70,100,0.55)';
    }
  }
  // roads: brown ink trails
  g.fillStyle = 'rgba(122,84,44,0.75)';
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = at(x, y);
    if (t !== T.ROAD && t !== T.BRIDGE && t !== T.BRIDGE_V && t !== T.DIRT) continue;
    g.globalAlpha = t === T.DIRT ? 0.35 : 0.8;
    g.beginPath(); g.arc((x + 0.5) * PX, (y + 0.5) * PX, t === T.DIRT ? PX * 0.4 : PX * 0.36, 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 1;
  // mountains: inked peaks along the rock
  for (let y = 0; y < m.h; y += 2) for (let x = 0; x < m.w; x += 3) {
    if (at(x, y) !== T.ROCK || ((x * 31 + y * 17) % 3 === 0)) continue;
    const X = (x + 0.5) * PX + ((y * 5) % 3), Y = (y + 1) * PX;
    const h = PX * (1.6 + ((x * 13 + y * 7) % 5) * 0.25);
    g.fillStyle = 'rgba(245,235,210,0.9)';
    g.beginPath(); g.moveTo(X - h * 0.7, Y); g.lineTo(X, Y - h); g.lineTo(X + h * 0.7, Y); g.closePath(); g.fill();
    g.fillStyle = 'rgba(110,96,80,0.55)';
    g.beginPath(); g.moveTo(X, Y - h); g.lineTo(X + h * 0.7, Y); g.lineTo(X + h * 0.1, Y); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(70,56,40,0.85)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(X - h * 0.7, Y); g.lineTo(X, Y - h); g.lineTo(X + h * 0.7, Y); g.stroke();
  }
  // forests: little inked trees
  for (const o of m.objects) {
    if (o.kind !== 'tree') continue;
    const X = (o.x / TILE) * PX, Y = (o.y / TILE) * PX;
    const pine = o.type === 'pine';
    g.strokeStyle = 'rgba(58,44,28,0.8)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(X, Y); g.lineTo(X, Y - 3); g.stroke();
    g.fillStyle = o.type === 'burnt' || o.type === 'dead' ? 'rgba(90,80,70,0.8)' : pine ? 'rgba(62,92,60,0.9)' : 'rgba(92,120,62,0.9)';
    g.beginPath();
    if (pine) { g.moveTo(X - 3, Y - 2); g.lineTo(X, Y - 9); g.lineTo(X + 3, Y - 2); g.closePath(); }
    else g.arc(X, Y - 5, 3.2, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = 'rgba(40,52,28,0.8)'; g.stroke();
  }
  // buildings and walls
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const t = at(x, y);
    if (t === T.WALL_STONE) { g.fillStyle = 'rgba(80,72,64,0.9)'; g.fillRect(x * PX, y * PX, PX, PX); }
  }
  for (const o of m.objects) {
    if (o.kind !== 'building' || !o.solid) continue;
    const bx = (o.solid.x / TILE) * PX, by = (o.solid.y / TILE) * PX, bw = (o.solid.w / TILE) * PX, bh = (o.solid.h / TILE) * PX;
    const burned = o.type === 'burned' || o.type === 'ruin';
    g.fillStyle = burned ? 'rgba(60,54,50,0.85)' : o.type === 'tent' ? 'rgba(200,180,140,0.9)' : o.type === 'church' || o.type === 'keep' || o.type === 'tower' || o.type === 'stone' ? 'rgba(120,112,104,0.95)' : 'rgba(160,82,56,0.9)';
    g.fillRect(bx + 1, by + 1, bw - 2, bh - 2);
    g.strokeStyle = 'rgba(40,28,18,0.9)'; g.lineWidth = 1.2;
    g.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
  }
  // paper grain and a burnt edge
  const img = g.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n * 0.8;
  }
  g.putImageData(img, 0, 0);
  const edge = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
  edge.addColorStop(0, 'rgba(120,80,40,0)');
  edge.addColorStop(1, 'rgba(90,56,24,0.45)');
  g.fillStyle = edge;
  g.fillRect(0, 0, W, H);
  baseCache = { version: m.version, canvas: c };
  return c;
}

/** The painted overworld map (6 px per tile), shared with the minimap. */
export function paintedMap(): HTMLCanvasElement { return mapCanvas(); }

export function discovered(p: Place) {
  if (S.discovered.includes(p.id)) return true;
  return !p.hidden && p.kind !== 'wild' && !!flag('map_known');
}

/** Builds the map panel. `travelFrom` enables fast travel. */
export function mapPanel(travelFrom?: string, onClose?: () => void): HTMLElement {
  const wrap = el('div', { cls: 'mapwrap' });
  if (!hasMap('overworld')) { wrap.append(el('p', { html: 'No map.' })); return wrap; }
  const base = mapCanvas();
  const view = makeCanvas(10, 10);
  wrap.append(view);
  const legend = el('div', { cls: 'maplegend', html: travelFrom ? 'Click a place you have visited to travel there.' : 'Drag to move · wheel to zoom' });
  wrap.append(legend);
  const tip = el('div', { cls: 'maptip' });
  tip.hidden = true;
  wrap.append(tip);
  const m = getMap('overworld');
  let zoom = 0.6;
  const onOver = G.map.id === 'overworld';
  const px = onOver ? G.player.x / TILE : (S.flags.lastOverX ?? m.w / 2);
  const py = onOver ? G.player.y / TILE : (S.flags.lastOverY ?? m.h / 2);
  let ox = 0, oy = 0; // pan offset in canvas px
  let hover: Place | null = null;
  const draw = () => {
    const W = wrap.clientWidth || 800, H = wrap.clientHeight || 500;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    view.width = Math.round(W * dpr); view.height = Math.round(H * dpr);
    view.style.width = W + 'px'; view.style.height = H + 'px';
    const ctx = view.getContext('2d')!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.fillStyle = '#c9b890';
    ctx.fillRect(0, 0, W, H);
    const s = zoom;
    const cx = W / 2 - px * PX * s + ox, cy = H / 2 - py * PX * s + oy;
    ctx.drawImage(base, cx, cy, base.width * s, base.height * s);
    // places
    ctx.font = '600 13px "Alegreya SC", Georgia, serif';
    ctx.textAlign = 'center';
    for (const p of PLACES) {
      if (!discovered(p)) continue;
      const x = cx + (p.x + 0.5) * PX * s, y = cy + (p.y + 0.5) * PX * s;
      ctx.fillStyle = p === hover ? '#8e2f2f' : '#1b1410';
      ctx.beginPath(); ctx.arc(x, y, p.kind === 'town' || p.kind === 'castle' ? 6 : 4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#f4efe4';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(233,223,198,0.8)';
      const tw = ctx.measureText(p.name).width;
      ctx.fillRect(x - tw / 2 - 4, y - 24, tw + 8, 16);
      ctx.fillStyle = '#1b1410';
      ctx.fillText(p.name, x, y - 12);
    }
    // quest marker
    const tq = S.trackedQuest;
    if (tq && QUESTS[tq]) {
      const def = QUESTS[tq];
      const st = def.stages[S.quests[tq]?.stage];
      let mk = st?.marker;
      if (typeof mk === 'function') mk = mk() || undefined;
      const list = mk ? (Array.isArray(mk) ? mk : [mk]) : [];
      for (const k of list) {
        let tx: number | null = null, ty: number | null = null;
        if ('map' in k && !('key' in k) && k.map === 'overworld') { tx = k.x; ty = k.y; }
        else {
          const r = resolveMarker(k);
          if (r && (r.map === 'overworld' || G.map.id === 'overworld')) { const pos = r.map === 'overworld' ? r : null; if (pos) { tx = pos.x / TILE; ty = pos.y / TILE; } }
          const interior = 'map' in k ? k.map : null;
          if (tx === null && interior && hasMap(interior)) {
            const im = getMap(interior);
            if (im.parent === 'overworld') for (const o of m.objects) if (o.interact?.type === 'door' && o.interact.to === interior) { tx = o.x / TILE; ty = o.y / TILE; }
          }
        }
        if (tx === null || ty === null) continue;
        const x = cx + tx * PX * s, y = cy + ty * PX * s;
        ctx.fillStyle = '#1b1410';
        ctx.beginPath(); ctx.moveTo(x, y - 14); ctx.lineTo(x + 7, y - 7); ctx.lineTo(x, y); ctx.lineTo(x - 7, y - 7); ctx.fill();
        ctx.fillStyle = '#e0a020';
        ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 5, y - 7); ctx.lineTo(x, y - 2); ctx.lineTo(x - 5, y - 7); ctx.fill();
      }
    }
    // player
    const pxs = cx + px * PX * s, pys = cy + py * PX * s;
    ctx.fillStyle = '#8e2f2f';
    ctx.beginPath(); ctx.arc(pxs, pys, 5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#f4efe4'; ctx.lineWidth = 2; ctx.stroke(); ctx.lineWidth = 1;
    // compass rose
    ctx.fillStyle = '#3a2c1e';
    ctx.font = '700 16px "Grenze Gotisch", Georgia, serif';
    ctx.fillText('N', W - 30, 34);
    ctx.beginPath(); ctx.moveTo(W - 30, 38); ctx.lineTo(W - 25, 60); ctx.lineTo(W - 35, 60); ctx.fill();
  };
  requestAnimationFrame(draw);
  let drag: { x: number; y: number; ox: number; oy: number; moved: boolean } | null = null;
  const placeAt = (clientX: number, clientY: number): Place | null => {
    const r = view.getBoundingClientRect();
    const W = r.width, H = r.height;
    const cx = W / 2 - px * PX * zoom + ox, cy = H / 2 - py * PX * zoom + oy;
    const mx = clientX - r.left, my = clientY - r.top;
    let best: Place | null = null, bd = 14;
    for (const p of PLACES) {
      if (!discovered(p)) continue;
      const x = cx + (p.x + 0.5) * PX * zoom, y = cy + (p.y + 0.5) * PX * zoom;
      const d = Math.hypot(x - mx, y - my);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  };
  view.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, ox, oy, moved: false }; view.setPointerCapture(e.pointerId); });
  view.addEventListener('pointermove', (e) => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      ox = drag.ox + dx; oy = drag.oy + dy;
      draw();
    } else {
      const h = placeAt(e.clientX, e.clientY);
      if (h !== hover) { hover = h; draw(); }
      if (h) {
        const r = wrap.getBoundingClientRect();
        tip.hidden = false;
        tip.style.left = e.clientX - r.left + 'px';
        tip.style.top = e.clientY - r.top + 'px';
        tip.textContent = h.name + (travelFrom ? ' · travel' : '');
      } else tip.hidden = true;
    }
  });
  view.addEventListener('pointerup', (e) => {
    const d = drag;
    drag = null;
    if (d && !d.moved && travelFrom) {
      const p = placeAt(e.clientX, e.clientY);
      if (p) { onClose?.(); fastTravel(p); }
    }
  });
  view.addEventListener('wheel', (e) => { zoom = Math.max(0.3, Math.min(1.8, zoom * (e.deltaY < 0 ? 1.15 : 0.87))); draw(); }, { passive: true });
  window.addEventListener('resize', draw, { once: true });
  return wrap;
}

export function canFastTravel(): string | null {
  if (flag('no_travel')) return 'Not now. You have somewhere to be.';
  if (G.map.id !== 'overworld') return 'You must be out on the roads to travel.';
  if (here().some((a) => a.hostile && !a.dead && Math.hypot(a.x - G.player.x, a.y - G.player.y) < 300)) return 'Not with enemies nearby.';
  if (overweight()) return 'You are carrying too much to travel.';
  return null;
}

export function openTravel(fromPlace: string) {
  const reason = canFastTravel();
  if (reason) { notify(reason, 'bad'); return; }
  openScreen('travel', (close) => {
    const b = el('div', { cls: 'vellum book' });
    const tabs = el('div', { cls: 'tabs' });
    tabs.append(el('button', { cls: 'tab on', html: 'Travel' }));
    const x = el('button', { cls: 'close', html: '✕' });
    x.addEventListener('click', close);
    tabs.append(x);
    const page = el('div', { cls: 'page' });
    page.style.padding = '8px';
    page.append(mapPanel(fromPlace, close));
    b.append(tabs, page);
    return b;
  });
}

export async function fastTravel(p: Place) {
  const reason = canFastTravel();
  if (reason) { notify(reason, 'bad'); return; }
  const dist = Math.hypot(p.x - G.player.x / TILE, p.y - G.player.y / TILE);
  if (dist < 8) { notify('You are already there.', 'info'); return; }
  const hours = Math.max(0.3, dist / 45);
  S.minutes += hours * 60;
  applyNeeds(hours);
  // ambushes on the road
  const chance = (isNight() ? 0.28 : 0.12) * Math.min(1, dist / 80);
  const ambush = (flag('act') || 0) >= 1 && Math.random() < chance;
  if (ambush) {
    const t = rand.range(0.35, 0.65);
    const mx = G.player.x / TILE + (p.x - G.player.x / TILE) * t, my = G.player.y / TILE + (p.y - G.player.y / TILE) * t;
    await travel('overworld', { x: mx * TILE, y: my * TILE }, undefined, { fade: 0.6 });
    emit('ambush', mx, my);
    return;
  }
  await travel('overworld', p.spawn, undefined, { fade: 0.6, hold: 250 });
  notify(`You arrive at <b>${esc(p.name)}</b> after ${hours < 1 ? 'less than an hour' : Math.round(hours) + ' hours'} on the road.`, 'info');
}

export { placeById, markerPositions };
