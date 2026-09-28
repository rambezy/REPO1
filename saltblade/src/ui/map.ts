// The world map: the land as your people know it. Places appear once found,
// the unexplored waste stays pale, and you can send your squad across it.
import { h, openWindow, isOpen, closeWindow } from './dom';
import { G } from '../state';
import { S } from '../sim/ctx';
import { REGIONS } from '../world/regions';
import { N, CELL, WORLD } from '../world/consts';
import { FACTION } from '../content/factions';
import { SETTLEMENT } from '../content/layout';
import { selected, issue } from '../game/control';
import { playerBase } from '../sim/base';
import { emit, on } from '../core/events';

const MAP = 1024; // base image resolution
export const EXP = 128; // exploration grid
const EXP_M = WORLD / EXP;
let base: HTMLCanvasElement | null = null;

/** Paints the whole world once: region colours, hillshade, water and roads. */
function paintBase(): HTMLCanvasElement {
  const T = G.T;
  const cv = document.createElement('canvas');
  cv.width = cv.height = MAP;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(MAP, MAP);
  const px = img.data;
  const step = N / MAP;
  const S1 = N + 1;
  const cols = REGIONS.map((r) => [(r.ground[0] >> 16) & 255, (r.ground[0] >> 8) & 255, r.ground[0] & 255]);
  for (let j = 0; j < MAP; j++) {
    for (let i = 0; i < MAP; i++) {
      const gi = Math.min(N, Math.round(i * step)), gj = Math.min(N, Math.round(j * step));
      const k = gj * S1 + gi;
      const hgt = T.h[k];
      const hl = T.h[Math.max(0, gj - 2) * S1 + Math.max(0, gi - 2)];
      const c = cols[T.reg[k]] ?? cols[0];
      let r = c[0], g = c[1], b = c[2];
      const shade = Math.max(0.55, Math.min(1.35, 1 + (hgt - hl) * 0.06));
      r *= shade; g *= shade; b *= shade;
      const e = Math.min(1, Math.max(0, hgt / 260));
      r = r * (1 - e * 0.35) + 240 * e * 0.35; g = g * (1 - e * 0.35) + 232 * e * 0.35; b = b * (1 - e * 0.35) + 220 * e * 0.35;
      if (hgt < 0) {
        const d = Math.min(1, -hgt / 5);
        r = 92 - d * 42; g = 118 - d * 40; b = 122 - d * 22;
        if (-hgt < 0.9) { r += 30; g += 30; b += 22; }
      }
      // paper tone
      r = r * 0.86 + 34; g = g * 0.86 + 28; b = b * 0.86 + 18;
      const o = (j * MAP + i) * 4;
      px[o] = r; px[o + 1] = g; px[o + 2] = b; px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // roads
  ctx.strokeStyle = 'rgba(96,62,34,0.75)';
  ctx.lineWidth = 1.6;
  ctx.lineJoin = 'round';
  const sc = MAP / WORLD;
  for (const rd of T.roads) {
    ctx.beginPath();
    for (let p = 0; p < rd.pts.length; p += 2) {
      const x = rd.pts[p] * sc, y = rd.pts[p + 1] * sc;
      if (p === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return cv;
}

// a finished map (Cressa's) shows the whole waste
on('map:reveal', () => {
  S.W.explored = new Uint8Array(EXP * EXP).fill(1);
  S.fx.notice('Every road, ford and pass of the waste is on your map now.', 'good');
});

/** Marks the land around your people as explored (called every couple of seconds). */
export function tickExplore() {
  const W = S.W;
  if (!W.explored) W.explored = new Uint8Array(EXP * EXP);
  const E = W.explored;
  for (const c of W.playerChars()) {
    if (!c.alive) continue;
    const r = 6; // cells, ~570 m
    const ci = Math.floor(c.x / EXP_M), cj = Math.floor(c.z / EXP_M);
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj;
      if (i < 0 || j < 0 || i >= EXP || j >= EXP) continue;
      const d = Math.hypot(di, dj);
      if (d > r) continue;
      const v = d < r - 1.5 ? 255 : 150;
      if (E[j * EXP + i] < v) E[j * EXP + i] = v;
    }
  }
}

function known(siteId: number) {
  const s = G.T.sites.find((x) => x.id === siteId);
  if (!s) return false;
  if (S.W.discovered.has(s.id) || S.W.seenSites.has(s.id)) return true;
  if (s.kind === 'town' && SETTLEMENT[s.settlement!]?.capital) return true; // everyone has heard of the capitals
  return false;
}

interface View { cx: number; cz: number; zoom: number; }
const view: View = { cx: WORLD / 2, cz: WORLD / 2, zoom: 1 };

export function toggleMap() {
  if (isOpen('map')) { closeWindow('map'); return; }
  openMap();
}

export function openMap() {
  if (!base) base = paintBase();
  const size = Math.min(window.innerHeight - 120, window.innerWidth - 80, 900);
  const w = openWindow('map', 'Map of the Sundered Waste', { w: size + 24, y: 50, cls: 'mapwin' });
  w.body.innerHTML = '';
  const cv = h('canvas', { class: 'mapcv', width: String(size), height: String(size) }) as HTMLCanvasElement;
  const tip = h('div', { class: 'maptip' });
  const legend = h('div', { class: 'maplegend' });
  w.body.append(h('div', { class: 'mapbox' }, cv, tip), legend);
  const ctx = cv.getContext('2d')!;
  // start centred on your people
  const pc = S.W.playerChars().find((c) => c.alive);
  if (pc && view.zoom === 1) { view.cx = pc.x; view.cz = pc.z; }
  view.cx = G.cam.target.x; view.cz = G.cam.target.z;
  if (view.zoom < 1) view.zoom = 1;
  const fog = document.createElement('canvas');
  fog.width = fog.height = EXP;
  const fctx = fog.getContext('2d')!;
  const paintFog = () => {
    const E: Uint8Array = S.W.explored ?? new Uint8Array(EXP * EXP);
    const id = fctx.createImageData(EXP, EXP);
    for (let k = 0; k < EXP * EXP; k++) { id.data[k * 4] = 226; id.data[k * 4 + 1] = 214; id.data[k * 4 + 2] = 188; id.data[k * 4 + 3] = 150 - Math.round((E[k] / 255) * 150); }
    fctx.putImageData(id, 0, 0);
  };
  paintFog();

  const worldPerPx = () => WORLD / (size * view.zoom);
  const toScreen = (x: number, z: number): [number, number] => [(x - view.cx) / worldPerPx() + size / 2, (z - view.cz) / worldPerPx() + size / 2];
  const toWorld = (sx: number, sy: number): [number, number] => [(sx - size / 2) * worldPerPx() + view.cx, (sy - size / 2) * worldPerPx() + view.cz];
  const clampView = () => {
    const half = WORLD / view.zoom / 2;
    view.cx = Math.max(half, Math.min(WORLD - half, view.cx));
    view.cz = Math.max(half, Math.min(WORLD - half, view.cz));
  };
  clampView();

  const draw = () => {
    if (!isOpen('map')) return;
    ctx.fillStyle = '#1a1612';
    ctx.fillRect(0, 0, size, size);
    const span = WORLD / view.zoom;
    const x0 = view.cx - span / 2, z0 = view.cz - span / 2;
    const bs = MAP / WORLD;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base!, x0 * bs, z0 * bs, span * bs, span * bs, 0, 0, size, size);
    const fs = EXP / WORLD;
    ctx.drawImage(fog, x0 * fs, z0 * fs, span * fs, span * fs, 0, 0, size, size);
    // region names where explored
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of REGIONS) {
      const [u, v] = r.seeds[0];
      const [sx, sy] = toScreen(u * WORLD, v * WORLD);
      if (sx < -100 || sy < -40 || sx > size + 100 || sy > size + 40) continue;
      const ei = Math.floor((u * WORLD) / EXP_M), ej = Math.floor((v * WORLD) / EXP_M);
      const seen = (S.W.explored?.[ej * EXP + ei] ?? 0) > 0;
      ctx.font = `italic ${Math.round(13 + view.zoom * 2)}px Cinzel, Georgia, serif`;
      ctx.fillStyle = seen ? 'rgba(60,44,28,0.55)' : 'rgba(60,44,28,0.22)';
      ctx.fillText(seen ? r.name : '?', sx, sy);
    }
    // places
    for (const s of G.T.sites) {
      if (!known(s.id)) continue;
      const [sx, sy] = toScreen(s.x, s.z);
      if (sx < -20 || sy < -20 || sx > size + 20 || sy > size + 20) continue;
      const found = S.W.discovered.has(s.id);
      if (s.kind === 'town') {
        const col = '#' + (FACTION[s.faction!]?.color ?? 0xcccccc).toString(16).padStart(6, '0');
        const r = SETTLEMENT[s.settlement!]?.capital ? 6 : 4.5;
        ctx.fillStyle = found ? col : 'rgba(120,110,90,0.6)';
        ctx.strokeStyle = '#2a2016';
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.rect(sx - r, sy - r, r * 2, r * 2); ctx.fill(); ctx.stroke();
        if (view.zoom >= 1.4 || SETTLEMENT[s.settlement!]?.capital) label(s.name + (found ? '' : ' ?'), sx, sy + r + 9, found ? '#2a1c10' : 'rgba(42,28,16,0.6)', 12);
      } else if (s.landmark) {
        ctx.fillStyle = '#6a3a8a';
        ctx.beginPath(); ctx.moveTo(sx, sy - 5); ctx.lineTo(sx + 5, sy); ctx.lineTo(sx, sy + 5); ctx.lineTo(sx - 5, sy); ctx.closePath(); ctx.fill();
        if (view.zoom >= 2) label(s.name, sx, sy + 13, '#3a2050', 11);
      } else {
        ctx.fillStyle = 'rgba(90,50,30,0.8)';
        ctx.beginPath(); ctx.arc(sx, sy, 2.5, 0, Math.PI * 2); ctx.fill();
        if (view.zoom >= 3) label(s.name, sx, sy + 10, 'rgba(60,34,20,0.85)', 10);
      }
    }
    // bounties you have heard about
    for (const b of S.W.bountyBoard) {
      if (b.status !== 'open' || !(S.W.seenSites.has(b.site) || S.W.discovered.has(b.site))) continue;
      const s = G.T.sites.find((x) => x.id === b.site);
      if (!s) continue;
      const [sx, sy] = toScreen(s.x, s.z);
      if (sx < -20 || sy < -20 || sx > size + 20 || sy > size + 20) continue;
      ctx.strokeStyle = '#b02a1a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(sx - 4, sy - 4); ctx.lineTo(sx + 4, sy + 4); ctx.moveTo(sx + 4, sy - 4); ctx.lineTo(sx - 4, sy + 4); ctx.stroke();
      if (view.zoom >= 1.4) label(`${b.name}: ${b.reward.toLocaleString()}c`, sx, sy - 14, '#7a1a0e', 11);
    }
    // your base
    const pb = playerBase();
    if (pb) {
      const [sx, sy] = toScreen(pb.x, pb.z);
      ctx.fillStyle = '#e8d9a8'; ctx.strokeStyle = '#2a2016'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(sx, sy - 8); ctx.lineTo(sx + 7, sy - 1); ctx.lineTo(sx + 5, sy + 6); ctx.lineTo(sx - 5, sy + 6); ctx.lineTo(sx - 7, sy - 1); ctx.closePath(); ctx.fill(); ctx.stroke();
      label(S.W.factionName, sx, sy + 16, '#2a1c10', 11);
    }
    // your people
    for (const c of S.W.playerChars()) {
      if (!c.alive) continue;
      const [sx, sy] = toScreen(c.x, c.z);
      ctx.fillStyle = c.status === 'up' ? '#5ec23a' : '#c05a3a';
      ctx.strokeStyle = '#102008';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(sx, sy, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      if (c.hasGoal && c.faction === 'player') {
        const [gx, gy] = toScreen(c.goalX, c.goalZ);
        ctx.strokeStyle = 'rgba(40,90,20,0.6)'; ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(gx, gy); ctx.stroke(); ctx.setLineDash([]);
      }
    }
    // the camera
    const [cx, cy] = toScreen(G.cam.target.x, G.cam.target.z);
    const cr = Math.max(4, (G.cam.dist * 1.2) / worldPerPx());
    ctx.strokeStyle = 'rgba(255,250,230,0.9)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, cr, 0, Math.PI * 2); ctx.stroke();
    // scale bar
    const km = worldPerPx() * 100;
    const nice = km > 2000 ? 2000 : km > 1000 ? 1000 : km > 500 ? 500 : 250;
    const bl = nice / worldPerPx();
    ctx.fillStyle = 'rgba(30,24,18,0.8)'; ctx.fillRect(12, size - 22, bl, 4);
    label(nice >= 1000 ? `${nice / 1000} km` : `${nice} m`, 12 + bl / 2, size - 30, '#1a120a', 11);
    requestAnimationFrame(draw);
  };
  const label = (t: string, x: number, y: number, col: string, px: number) => {
    ctx.font = `600 ${px}px "Barlow Condensed", sans-serif`;
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(236,226,200,0.8)';
    ctx.strokeText(t, x, y);
    ctx.fillStyle = col; ctx.fillText(t, x, y);
  };

  // interaction
  let drag: [number, number, number, number] | null = null, moved = false;
  cv.addEventListener('mousedown', (e) => { if (e.button === 0) { drag = [e.clientX, e.clientY, view.cx, view.cz]; moved = false; } });
  const onMove = (e: MouseEvent) => {
    if (drag) {
      const dx = e.clientX - drag[0], dy = e.clientY - drag[1];
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      view.cx = drag[2] - dx * worldPerPx(); view.cz = drag[3] - dy * worldPerPx();
      clampView();
    }
  };
  const onUp = () => { drag = null; };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  w.onClose = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  cv.addEventListener('click', (e) => {
    if (moved) return;
    const r = cv.getBoundingClientRect();
    const [x, z] = toWorld(e.clientX - r.left, e.clientY - r.top);
    G.cam.follow = null;
    G.cam.lookAt(x, z);
  });
  cv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const [x, z] = toWorld(e.clientX - r.left, e.clientY - r.top);
    const who = selected();
    if (!who.length) { tip.textContent = 'Select someone first.'; return; }
    who.forEach((c, i) => issue(c, { k: 'move', x: x + (i % 3) * 1.5, z: z + Math.floor(i / 3) * 1.5 }));
    emit('notice', `${who.length === 1 ? who[0].name : who.length + ' people'} set off.`, 'info');
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const [wx, wz] = toWorld(e.clientX - r.left, e.clientY - r.top);
    view.zoom = Math.max(1, Math.min(10, view.zoom * (e.deltaY < 0 ? 1.25 : 0.8)));
    // keep the point under the cursor fixed
    const [nx, nz] = toWorld(e.clientX - r.left, e.clientY - r.top);
    view.cx += wx - nx; view.cz += wz - nz;
    clampView();
  }, { passive: false });
  cv.addEventListener('mousemove', (e) => {
    const r = cv.getBoundingClientRect();
    const [x, z] = toWorld(e.clientX - r.left, e.clientY - r.top);
    if (x < 0 || z < 0 || x > WORLD || z > WORLD) { tip.textContent = ''; return; }
    const ei = Math.floor(x / EXP_M), ej = Math.floor(z / EXP_M);
    const seen = (S.W.explored?.[ej * EXP + ei] ?? 0) > 0;
    let best = null as null | (typeof G.T.sites)[0], bd = 14 * worldPerPx();
    for (const s of G.T.sites) { if (!known(s.id)) continue; const d = Math.hypot(s.x - x, s.z - z); if (d < bd) { bd = d; best = s; } }
    const reg = seen ? G.T.regionAt(x, z).name : 'Unexplored';
    tip.textContent = best ? `${best.name}${best.faction ? ' · ' + (FACTION[best.faction]?.short ?? '') : ''} · ${reg}` : reg;
  });
  // legend: factions of places you know
  const facs = new Set<string>();
  for (const s of G.T.sites) if (s.kind === 'town' && S.W.discovered.has(s.id) && s.faction) facs.add(s.faction);
  legend.append(
    ...[...facs].map((f) => h('span', { class: 'lg' }, h('i', { style: { background: '#' + FACTION[f].color.toString(16).padStart(6, '0') } }), FACTION[f].short)),
    h('span', { class: 'lg' }, h('i', { class: 'me' }), 'Your people'),
    h('span', { class: 'dim hint' }, 'Wheel to zoom · drag to pan · click to look · right-click to send the selected'),
  );
  requestAnimationFrame(draw);
  void CELL;
}
