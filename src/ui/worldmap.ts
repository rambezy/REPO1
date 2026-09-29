// World map screen: terrain, fog, locations, travel and encounters.

import { G, player } from '../game/G';
import { el, esc } from '../core/util';
import { button, uiRoot, openModal, closeModal } from './common';
import { LOCATIONS } from '../content/registry';
import { WORLD_W, WORLD_H, terrainAt, isExplored, reveal, travelHours, encounterChance, pickEncounter, startEncounterMap, type Terrain } from '../game/world';
import { hash2 } from '../core/rng';
import { advanceTime, fmtDate, fmtTime, waterDaysLeft } from '../game/time';
import { skill } from '../game/character';
import { chance } from '../core/rng';
import { msg } from '../game/log';
import { sfx, setAmbient } from '../audio/sfx';
import { showHud } from './hud';

let root: HTMLElement | null = null;
let canvas: HTMLCanvasElement;
let infoEl: HTMLElement;
let clockEl: HTMLElement;
let target: { x: number; y: number; loc?: string } | null = null;
let pos = { x: 0, y: 0 }; // fractional position in tiles
let raf = 0;
let lastT = 0;
let tile = 24;
let ox = 0;
let oy = 0;
let terrainImg: HTMLCanvasElement | null = null;
let pausedForEncounter = false;

const TER_COLORS: Record<Terrain, [number, number, number]> = {
  desert: [168, 136, 92],
  scrub: [136, 128, 82],
  mountain: [120, 98, 74],
  ruins: [110, 104, 96],
  water: [40, 62, 70],
  crater: [120, 128, 80],
};

export function openWorldMap() {
  if (root) return;
  G.screen = 'world';
  showHud(false);
  pos = { x: G.state.world.x + 0.5, y: G.state.world.y + 0.5 };
  reveal(G.state.world.x, G.state.world.y, 2);
  target = null;
  root = el('div', 'panel');
  root.id = 'worldmap';
  const wrap = el('div', 'mapwrap screen');
  canvas = el('canvas') as HTMLCanvasElement;
  wrap.appendChild(canvas);
  const side = el('div', 'side panel');
  clockEl = el('div', 'screen');
  clockEl.style.cssText = 'padding:6px;text-align:center;font-family:var(--big);font-size:20px;line-height:20px';
  side.appendChild(clockEl);
  const towns = el('div', 'towns');
  side.appendChild(el('div', 'label', 'Locations'));
  for (const id of G.state.discovered) {
    const l = LOCATIONS[id];
    if (!l) continue;
    const t = el('div', 'town', `<span class="dot"></span><span>${esc(l.name)}</span>`);
    t.onclick = () => setTarget(l.x + 0.5, l.y + 0.5, l.id);
    towns.appendChild(t);
  }
  side.appendChild(towns);
  infoEl = el('div', 'info screen', '');
  side.appendChild(infoEl);
  const row = el('div', 'row');
  row.style.flexWrap = 'wrap';
  row.append(
    button('Enter', () => enterHere(), 'small'),
    button('Stop', () => (target = null), 'small'),
    button('Link', () => import('./pda').then((m) => m.openPda()), 'small'),
    button('Inv', () => import('./inventory').then((m) => m.openInventory()), 'small'),
    button('Cha', () => import('./charscreen').then((m) => m.openCharacter()), 'small'),
    button('Opt', () => import('./menus').then((m) => m.openOptions()), 'small'),
  );
  side.appendChild(row);
  root.append(wrap, side);
  uiRoot().appendChild(root);
  canvas.addEventListener('pointerdown', onClick);
  window.addEventListener('resize', sizeCanvas);
  sizeCanvas();
  setAmbient('wind');
  lastT = performance.now();
  raf = requestAnimationFrame(loop);
  updateInfo();
}

export function closeWorldMap() {
  if (!root) return;
  cancelAnimationFrame(raf);
  window.removeEventListener('resize', sizeCanvas);
  root.remove();
  root = null;
  showHud(true);
}

function sizeCanvas() {
  const r = canvas.parentElement!.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  tile = Math.max(12, Math.min(canvas.width / WORLD_W, canvas.height / WORLD_H));
  ox = (canvas.width - tile * WORLD_W) / 2;
  oy = (canvas.height - tile * WORLD_H) / 2;
  terrainImg = null;
}

function buildTerrainImage() {
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(tile * WORLD_W);
  cv.height = Math.ceil(tile * WORLD_H);
  const c = cv.getContext('2d')!;
  const px = Math.max(2, Math.floor(tile / 8));
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      const ter = terrainAt(x, y);
      const [r, g, b] = TER_COLORS[ter];
      for (let sy = 0; sy < tile; sy += px) {
        for (let sx = 0; sx < tile; sx += px) {
          const n = (hash2(x * 64 + sx, y * 64 + sy, 3) - 0.5) * 22;
          c.fillStyle = `rgb(${r + n},${g + n},${b + n * 0.8})`;
          c.fillRect(x * tile + sx, y * tile + sy, px + 0.5, px + 0.5);
        }
      }
      if (ter === 'mountain') {
        c.fillStyle = 'rgba(60,44,30,0.6)';
        for (let k = 0; k < 2; k++) {
          const mx = x * tile + hash2(x, y, k) * tile * 0.7;
          const my = y * tile + tile * 0.8;
          c.beginPath();
          c.moveTo(mx, my);
          c.lineTo(mx + tile * 0.2, my - tile * 0.45);
          c.lineTo(mx + tile * 0.4, my);
          c.fill();
        }
      } else if (ter === 'ruins') {
        c.fillStyle = 'rgba(50,48,44,0.7)';
        for (let k = 0; k < 3; k++) c.fillRect(x * tile + hash2(x, y, k + 5) * tile * 0.8, y * tile + hash2(x, y, k + 9) * tile * 0.6, tile * 0.18, tile * 0.3);
      } else if (ter === 'water') {
        c.strokeStyle = 'rgba(150,190,190,0.25)';
        c.beginPath();
        c.moveTo(x * tile + 2, y * tile + tile / 2);
        c.quadraticCurveTo(x * tile + tile / 2, y * tile + tile / 2 - 3, x * tile + tile - 2, y * tile + tile / 2);
        c.stroke();
      } else if (ter === 'crater') {
        c.fillStyle = 'rgba(160,220,90,0.25)';
        c.beginPath();
        c.arc(x * tile + tile / 2, y * tile + tile / 2, tile * 0.3, 0, 7);
        c.fill();
      }
    }
  }
  // Grid lines
  c.strokeStyle = 'rgba(0,0,0,0.12)';
  c.lineWidth = 1;
  for (let x = 0; x <= WORLD_W; x += 4) {
    c.beginPath();
    c.moveTo(x * tile, 0);
    c.lineTo(x * tile, cv.height);
    c.stroke();
  }
  for (let y = 0; y <= WORLD_H; y += 4) {
    c.beginPath();
    c.moveTo(0, y * tile);
    c.lineTo(cv.width, y * tile);
    c.stroke();
  }
  terrainImg = cv;
}

function draw(now: number) {
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#050805';
  c.fillRect(0, 0, canvas.width, canvas.height);
  if (!terrainImg) buildTerrainImage();
  c.drawImage(terrainImg!, ox, oy);
  // Fog of war
  for (let y = 0; y < WORLD_H; y++) {
    for (let x = 0; x < WORLD_W; x++) {
      if (isExplored(x, y)) continue;
      const nearby = isExplored(x - 1, y) || isExplored(x + 1, y) || isExplored(x, y - 1) || isExplored(x, y + 1);
      c.fillStyle = nearby ? 'rgba(6,8,6,0.82)' : 'rgba(6,8,6,0.97)';
      c.fillRect(ox + x * tile - 0.5, oy + y * tile - 0.5, tile + 1, tile + 1);
    }
  }
  // Locations
  c.textAlign = 'center';
  for (const id of G.state.discovered) {
    const l = LOCATIONS[id];
    if (!l) continue;
    const x = ox + (l.x + 0.5) * tile;
    const y = oy + (l.y + 0.5) * tile;
    const rad = tile * (0.35 + (l.size ?? 1) * 0.25);
    c.strokeStyle = '#4cff5c';
    c.lineWidth = 2;
    c.fillStyle = 'rgba(76,255,92,0.18)';
    c.beginPath();
    c.arc(x, y, rad, 0, 7);
    c.fill();
    c.stroke();
    c.font = `${Math.max(11, tile * 0.5)}px "Share Tech Mono", monospace`;
    c.fillStyle = '#000';
    c.fillText(l.name, x + 1, y + rad + tile * 0.55 + 1);
    c.fillStyle = '#c8ffb8';
    c.fillText(l.name, x, y + rad + tile * 0.55);
  }
  // Target line
  if (target) {
    c.strokeStyle = 'rgba(255,80,50,0.8)';
    c.setLineDash([4, 4]);
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(ox + pos.x * tile, oy + pos.y * tile);
    c.lineTo(ox + target.x * tile, oy + target.y * tile);
    c.stroke();
    c.setLineDash([]);
    c.strokeStyle = '#ff5030';
    c.beginPath();
    c.arc(ox + target.x * tile, oy + target.y * tile, tile * 0.25, 0, 7);
    c.stroke();
  }
  // Player marker
  const px = ox + pos.x * tile;
  const py = oy + pos.y * tile;
  const pulse = 0.6 + Math.sin(now / 200) * 0.4;
  c.fillStyle = `rgba(255,60,40,${pulse})`;
  c.beginPath();
  c.arc(px, py, tile * 0.28, 0, 7);
  c.fill();
  c.strokeStyle = '#ffd24a';
  c.lineWidth = 2;
  c.beginPath();
  c.arc(px, py, tile * 0.42, 0, 7);
  c.stroke();
}

function loop(now: number) {
  if (!root) return;
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  if (target && !G.modal && !pausedForEncounter) step(dt);
  draw(now);
  clockEl.innerHTML = `${fmtDate(G.state.time)}<br>${fmtTime(G.state.time)}` + (!G.state.flags.coreReturned ? `<br><span style="font-size:15px;color:${waterDaysLeft() < 10 ? '#ff4a36' : 'var(--amber)'}">Water: ${waterDaysLeft()} days</span>` : '');
  raf = requestAnimationFrame(loop);
}

function step(dt: number) {
  if (!target) return;
  const dx = target.x - pos.x;
  const dy = target.y - pos.y;
  const d = Math.hypot(dx, dy);
  const speed = 3.2; // tiles per real second
  const move = Math.min(d, speed * dt);
  const tx = Math.floor(pos.x);
  const ty = Math.floor(pos.y);
  const ter = terrainAt(tx, ty);
  let nx = pos.x + (dx / (d || 1)) * move;
  let ny = pos.y + (dy / (d || 1)) * move;
  if (terrainAt(Math.floor(nx), Math.floor(ny)) === 'water') {
    target = null;
    msg('You cannot cross the water.');
    return;
  }
  pos.x = nx;
  pos.y = ny;
  // Time passes in proportion to distance and terrain.
  advanceTime(Math.round(move * travelHours(ter) * 60));
  if (G.state.ended || G.screen === 'end') {
    target = null;
    return;
  }
  const ntx = Math.floor(pos.x);
  const nty = Math.floor(pos.y);
  G.state.world = { x: ntx, y: nty };
  if (ntx !== tx || nty !== ty) {
    reveal(ntx, nty, 1);
    updateInfo();
    // Encounter roll once per tile.
    const t2 = terrainAt(ntx, nty);
    const nearTown = Object.values(LOCATIONS).some((l) => Math.abs(l.x - ntx) <= 1 && Math.abs(l.y - nty) <= 1);
    if (!nearTown && chance(encounterChance(t2))) {
      const enc = pickEncounter(t2);
      if (enc) {
        encounter(t2, enc);
        return;
      }
    }
  }
  if (d <= move + 0.001) {
    const loc = target.loc;
    target = null;
    if (loc) arrive(loc);
  }
}

function encounter(ter: Terrain, enc: ReturnType<typeof pickEncounter>) {
  if (!enc) return;
  pausedForEncounter = true;
  sfx('encounter');
  const w = el('div', 'panel win');
  w.style.width = 'min(420px, 100vw)';
  w.appendChild(el('h2', '', 'Encounter'));
  const spotted = chance(skill(player(), 'outdoorsman'));
  const text = spotted
    ? `You spot ${enc.text} before they notice you.`
    : `You stumble upon ${enc.text}!`;
  w.appendChild(el('div', 'screen', `<div style="padding:10px">${esc(text)}</div>`));
  const row = el('div', 'row');
  row.style.justifyContent = 'center';
  const go = () => {
    closeModal('encounter');
    pausedForEncounter = false;
    target = null;
    closeWorldMap();
    startEncounterMap(ter, enc);
  };
  row.appendChild(button(spotted ? 'Approach' : 'Continue', go));
  if (spotted) {
    row.appendChild(button('Avoid', () => {
      closeModal('encounter');
      pausedForEncounter = false;
      msg('You slip past unseen.');
    }));
  }
  w.appendChild(row);
  openModal('encounter', w, { noBackClose: true });
}

function arrive(locId: string) {
  const l = LOCATIONS[locId];
  if (!l) return;
  closeWorldMap();
  import('../game/travel').then((t) => t.enterMap(l.map, l.entrance ?? 'default'));
}

function enterHere() {
  const x = Math.floor(pos.x);
  const y = Math.floor(pos.y);
  const loc = Object.values(LOCATIONS).find((l) => G.state.discovered.includes(l.id) && Math.abs(l.x - x) <= (l.size ?? 1) - 1 + 0 && Math.abs(l.y - y) <= (l.size ?? 1) - 1 + 0) ??
    Object.values(LOCATIONS).find((l) => G.state.discovered.includes(l.id) && l.x === x && l.y === y);
  if (loc) return arrive(loc.id);
  closeWorldMap();
  startEncounterMap(terrainAt(x, y), null);
}

function setTarget(x: number, y: number, loc?: string) {
  target = { x, y, loc };
  sfx('click');
}

function onClick(e: PointerEvent) {
  if (G.modal) return;
  const r = canvas.getBoundingClientRect();
  const dpr = canvas.width / r.width;
  const mx = ((e.clientX - r.left) * dpr - ox) / tile;
  const my = ((e.clientY - r.top) * dpr - oy) / tile;
  if (mx < 0 || my < 0 || mx >= WORLD_W || my >= WORLD_H) return;
  // Clicking a known location targets it.
  for (const id of G.state.discovered) {
    const l = LOCATIONS[id];
    if (l && Math.hypot(l.x + 0.5 - mx, l.y + 0.5 - my) < 0.5 + (l.size ?? 1) * 0.3) {
      setTarget(l.x + 0.5, l.y + 0.5, l.id);
      return;
    }
  }
  setTarget(mx, my);
}

function updateInfo() {
  if (!infoEl) return;
  const x = Math.floor(pos.x);
  const y = Math.floor(pos.y);
  const ter = terrainAt(x, y);
  const names: Record<Terrain, string> = { desert: 'Open desert', scrub: 'Scrubland', mountain: 'Broken hills', ruins: 'Ruined city', water: 'Water', crater: 'Glowing craters' };
  infoEl.innerHTML = `${names[ter]}<br><small>Click the map to travel. Click a location to go there.</small>`;
}
