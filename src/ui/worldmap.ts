// The world map (a tab in the book, and fast travel from signposts).

import { el, button, openScreen } from './ui';
import { G } from '../G';
import { getMap, hasMap, here } from '../world/world';
import { PLACES, placeById, Place } from '../content/places';
import { S, isNight, flag } from '../state';
import { makeCanvas } from '../gfx/pixel';
import { T, tdef } from '../world/terrain';
import { TILE, rand } from '../engine/util';
import { markerPositions, resolveMarker, QUESTS } from '../systems/quests';
import { notify, esc } from './notify';
import { travel } from '../systems/transition';
import { applyNeeds } from '../systems/survival';
import { emit } from '../engine/events';
import { overweight } from '../systems/inventory';

const PX = 3; // screen pixels per tile on the map canvas
let baseCache: { version: number; canvas: HTMLCanvasElement } | null = null;

function colorFor(t: number, x: number, y: number): [number, number, number] {
  const n = ((x * 7 + y * 13) % 5) - 2;
  const c = (r: number, g: number, b: number): [number, number, number] => [r + n * 3, g + n * 3, b + n * 2];
  switch (t) {
    case T.WATER: case T.DEEP: return c(96, 126, 150);
    case T.FORD: return c(120, 146, 160);
    case T.ROAD: case T.DIRT: case T.GRAVEL: case T.BRIDGE: case T.BRIDGE_V: return c(150, 112, 70);
    case T.COBBLE: case T.FLAGSTONE: return c(140, 128, 112);
    case T.FOREST: return c(92, 110, 64);
    case T.FIELD: case T.VEG: return c(170, 140, 96);
    case T.WHEAT: return c(196, 170, 104);
    case T.SAND: return c(200, 180, 130);
    case T.ASH: case T.BURNT_WHEAT: return c(90, 80, 72);
    case T.MUD: return c(120, 96, 70);
    default:
      if (t === T.ROCK) return c(132, 124, 116);
      if (tdef(t).wall) return c(96, 86, 76);
      return c(158, 164, 104);
  }
}

function mapCanvas(): HTMLCanvasElement {
  const m = getMap('overworld');
  if (baseCache && baseCache.version === m.version) return baseCache.canvas;
  const c = makeCanvas(m.w * PX, m.h * PX);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(m.w * PX, m.h * PX);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const [r, g, b] = colorFor(m.ground[y * m.w + x], x, y);
    for (let j = 0; j < PX; j++) for (let i = 0; i < PX; i++) {
      const k = ((y * PX + j) * m.w * PX + x * PX + i) * 4;
      img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // trees as dark dots, buildings as ink blocks
  for (const o of m.objects) {
    if (o.kind === 'tree') { ctx.fillStyle = 'rgba(52,70,38,0.8)'; ctx.fillRect(Math.floor(o.x / TILE) * PX, Math.floor(o.y / TILE) * PX - PX, PX, PX); }
    if (o.kind === 'building' && o.solid) { ctx.fillStyle = '#4a3a2a'; ctx.fillRect((o.solid.x / TILE) * PX, (o.solid.y / TILE) * PX, (o.solid.w / TILE) * PX, (o.solid.h / TILE) * PX); }
  }
  // parchment tone and vignette
  ctx.fillStyle = 'rgba(233,210,160,0.18)';
  ctx.fillRect(0, 0, c.width, c.height);
  baseCache = { version: m.version, canvas: c };
  return c;
}

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
  let zoom = 1;
  const onOver = G.map.id === 'overworld';
  const px = onOver ? G.player.x / TILE : (S.flags.lastOverX ?? m.w / 2);
  const py = onOver ? G.player.y / TILE : (S.flags.lastOverY ?? m.h / 2);
  let ox = 0, oy = 0; // pan offset in canvas px
  let hover: Place | null = null;
  const draw = () => {
    const W = wrap.clientWidth || 800, H = wrap.clientHeight || 500;
    view.width = W; view.height = H;
    view.style.width = W + 'px'; view.style.height = H + 'px';
    const ctx = view.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
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
    const W = view.width, H = view.height;
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
  view.addEventListener('wheel', (e) => { zoom = Math.max(0.6, Math.min(3, zoom * (e.deltaY < 0 ? 1.15 : 0.87))); draw(); }, { passive: true });
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
