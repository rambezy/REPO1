// Heads-up display: time, bars, needs, objective, minimap, quick slots,
// interaction prompt and stealth indicator. Minimises DOM writes.

import { G } from '../G';
import { UI, el } from './ui';
import { S, clockString, dateString, hourName, darkness } from '../state';
import { playerState } from '../systems/player';
import { objectiveFor, markerPositions } from '../systems/quests';
import { BUFF_INFO, buffActive } from '../systems/stats';
import { item } from '../content/items';
import { iconURL } from '../gfx/icons';
import { count } from '../systems/inventory';
import { newCanvas } from '../gfx/paint';
import { tdef, T } from '../world/terrain';
import { here } from '../world/world';
import { TILE } from '../engine/util';
import { input } from '../engine/input';
import { drawText } from '../gfx/font';
import { paintedMap } from './worldmap';

let els: Record<string, HTMLElement> = {};
const cache: Record<string, string> = {};
function setHTML(k: string, v: string) { if (cache[k] !== v) { cache[k] = v; els[k].innerHTML = v; } }
function setStyle(k: string, prop: string, v: string) { const key = k + '.' + prop; if (cache[key] !== v) { cache[key] = v; (els[k].style as unknown as Record<string, string>)[prop] = v; } }
function setShow(k: string, on: boolean) { const key = k + '.show'; const v = on ? '1' : '0'; if (cache[key] !== v) { cache[key] = v; els[k].hidden = !on; } }

let mini: HTMLCanvasElement;
let miniBase: { mapId: string; version: number; canvas: HTMLCanvasElement; scale: number } | null = null;

export function buildHUD() {
  const h = UI.hud;
  h.innerHTML = '';
  els = {};
  for (const k of Object.keys(cache)) delete cache[k];
  const time = el('div', { cls: 'hud-time' });
  els.clock = el('div', { cls: 'clock' });
  els.date = el('div', { cls: 'date' });
  els.place = el('div', { cls: 'place' });
  time.append(els.clock, els.date, els.place);
  const bars = el('div', { cls: 'hud-bars' });
  els.hpbar = el('div', { cls: 'bar hp' });
  els.hp = el('i');
  els.hpbar.appendChild(els.hp);
  els.stbar = el('div', { cls: 'bar st' });
  els.st = el('i');
  els.stbar.appendChild(els.st);
  els.needs = el('div', { cls: 'hud-needs' });
  bars.append(els.hpbar, els.stbar, els.needs);
  els.obj = el('div', { cls: 'hud-obj' });
  const mm = el('div', { cls: 'hud-minimap' });
  mini = newCanvas(192, 192);
  mm.appendChild(mini);
  els.mini = mm;
  els.quick = el('div', { cls: 'hud-quick' });
  els.prompt = el('div', { cls: 'hud-prompt' });
  els.stealth = el('div', { cls: 'hud-stealth', html: '<div class="eye"><i></i></div>' });
  h.append(time, bars, els.obj, mm, els.quick, els.prompt, els.stealth);
}

export function updateHUD() {
  if (!els.clock) return;
  const show = G.mode === 'play' || G.mode === 'dialogue';
  UI.hud.style.display = show && !document.body.classList.contains('cutscene') ? '' : 'none';
  if (!show || !G.player) return;
  const p = G.player;
  setHTML('clock', `${clockString()} <span style="font-size:13px;color:var(--wheat-dim)">${hourName()}</span>`);
  setHTML('date', dateString());
  const reg = G.map.regionAt(p.x, p.y);
  setHTML('place', reg ? reg.name : G.map.name);
  setStyle('hp', 'width', `${Math.max(0, (p.hp / p.maxHp) * 100).toFixed(1)}%`);
  setStyle('st', 'width', `${Math.max(0, (p.stamina / p.maxStamina) * 100).toFixed(1)}%`);
  const bleed = p.combat.bleeding > 0.05;
  if (cache.bleed !== String(bleed)) { cache.bleed = String(bleed); els.hpbar.classList.toggle('bleed', bleed); }
  // needs line
  const needs: string[] = [];
  if (bleed) needs.push('<span class="crit">Bleeding</span>');
  if (S.hunger < 12) needs.push('<span class="crit">Starving</span>'); else if (S.hunger < 30) needs.push('<span class="warn">Hungry</span>'); else if (S.hunger > 100) needs.push('<span class="warn">Overfed</span>');
  if (S.energy < 10) needs.push('<span class="crit">Exhausted</span>'); else if (S.energy < 25) needs.push('<span class="warn">Tired</span>');
  if (S.drunk > 60) needs.push('<span class="warn">Drunk</span>'); else if (S.drunk > 25) needs.push('Tipsy');
  if (S.dirt > 70) needs.push('<span class="warn">Filthy</span>');
  for (const b of S.buffs) if (b.until > S.minutes && BUFF_INFO[b.id]) needs.push(BUFF_INFO[b.id].good ? BUFF_INFO[b.id].name : `<span class="warn">${BUFF_INFO[b.id].name}</span>`);
  if (p.crouching) needs.push('Sneaking');
  if (S.equip.torch) needs.push('Torch lit');
  setHTML('needs', needs.join(' · '));
  // objective
  const o = S.trackedQuest ? objectiveFor(S.trackedQuest) : null;
  if (o) {
    const mk = markerPositions()[0];
    const dist = mk ? Math.round(Math.hypot(mk.x - p.x, mk.y - p.y) / TILE) : null;
    setHTML('obj', `<div class="q">${o.title}</div><div class="o">${o.obj}</div>${dist !== null && dist > 3 ? `<div class="dist">${dist} paces${mk && mk.far ? ' · through the door' : ''}</div>` : ''}`);
  } else setHTML('obj', '');
  // quick slots
  const qs = S.quick.map((id, i) => {
    if (!id) return `<div class="slot"><b>${i + 1}</b></div>`;
    const n = count(id);
    return `<div class="slot" title="${item(id).name}"><b>${i + 1}</b><img src="${iconURL(item(id).icon)}" alt=""><em>${n}</em></div>`;
  }).join('');
  setHTML('quick', qs);
  // prompt
  const t = playerState.target;
  if (t) {
    const key = input.isTouch() ? 'E' : input.lastDevice === 'gamepad' ? 'A' : 'E';
    setHTML('prompt', `<span class="kbd">${key}</span><span class="${t.crime ? 'steal' : ''}">${t.label}</span>`);
    setShow('prompt', true);
  } else setShow('prompt', false);
  // stealth eye
  if (p.crouching) {
    setShow('stealth', true);
    const seen = here().some((a) => a.mem.seesPlayer);
    const vis = seen ? 1 : Math.min(1, playerState.visibility);
    const eye = els.stealth.firstElementChild as HTMLElement;
    const h = Math.round(4 + vis * 14);
    setStyle('stealth', 'opacity', '1');
    eye.style.height = h + 'px';
    eye.style.borderColor = seen ? '#ff8060' : '#efe6d2';
  } else setShow('stealth', false);
  drawMinimap();
}

function terrainColor(t: number): string {
  switch (t) {
    case T.WATER: case T.DEEP: return '#3a6a98';
    case T.FORD: return '#5a8ab8';
    case T.ROAD: case T.DIRT: case T.GRAVEL: return '#a8845a';
    case T.COBBLE: case T.FLAGSTONE: return '#8e8e94';
    case T.FOREST: return '#2e5226';
    case T.FIELD: case T.VEG: return '#7a5a38';
    case T.WHEAT: return '#c8a452';
    case T.SAND: return '#c8b07a';
    case T.ASH: case T.BURNT_WHEAT: return '#3a3634';
    case T.WOOD: case T.BRIDGE: case T.BRIDGE_V: return '#8a5c33';
    case T.STRAW: return '#9a7a50';
    case T.CARPET: return '#8a2a26';
    case T.MUD: return '#4d3a28';
    default:
      if (tdef(t).wall) return t === T.ROCK ? '#5b5b63' : '#2a221c';
      return '#4b7d33';
  }
}

function drawMinimap() {
  const m = G.map;
  if (m.id === 'overworld' && (!miniBase || miniBase.mapId !== m.id || miniBase.version !== m.version)) {
    // the overworld uses the painted parchment map, at 6 pixels to the tile
    miniBase = { mapId: m.id, version: m.version, canvas: paintedMap(), scale: 6 };
  } else if (!miniBase || miniBase.mapId !== m.id || miniBase.version !== m.version) {
    const c = newCanvas(m.w, m.h);
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(m.w, m.h);
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const col = terrainColor(m.ground[y * m.w + x]);
      const n = parseInt(col.slice(1), 16);
      const i = (y * m.w + x) * 4;
      img.data[i] = (n >> 16) & 255; img.data[i + 1] = (n >> 8) & 255; img.data[i + 2] = n & 255; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    ctx.fillStyle = '#6a4a30';
    for (const o of m.objects) {
      if (o.kind === 'building' && o.solid) ctx.fillRect(Math.floor(o.solid.x / TILE), Math.floor(o.solid.y / TILE), Math.ceil(o.solid.w / TILE), Math.ceil(o.solid.h / TILE));
      if (o.kind === 'tree') { ctx.fillStyle = '#1f3a1c'; ctx.fillRect(Math.floor(o.x / TILE), Math.floor(o.y / TILE), 1, 1); ctx.fillStyle = '#6a4a30'; }
    }
    miniBase = { mapId: m.id, version: m.version, canvas: c, scale: 1 };
  }
  const ctx = mini.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const p = G.player;
  const R = 48; // tiles shown across
  const zoom = mini.width / R;
  const px = p.x / TILE, py = p.y / TILE;
  ctx.fillStyle = '#0b0807';
  ctx.fillRect(0, 0, mini.width, mini.height);
  const ms = miniBase.scale;
  ctx.drawImage(miniBase.canvas, (px - R / 2) * ms, (py - R / 2) * ms, R * ms, R * ms, 0, 0, mini.width, mini.height);
  // darken at night
  const dk = m.outdoor ? darkness() * 0.45 : 0;
  if (dk > 0) { ctx.fillStyle = `rgba(8,10,30,${dk})`; ctx.fillRect(0, 0, mini.width, mini.height); }
  // actors
  for (const a of here()) {
    if (a === p || a.hidden || a.dead) continue;
    const ax = (a.x / TILE - px) * zoom + mini.width / 2, ay = (a.y / TILE - py) * zoom + mini.height / 2;
    if (ax < 0 || ay < 0 || ax > mini.width || ay > mini.height) continue;
    ctx.fillStyle = a.hostile ? '#e05040' : a.charId ? '#e8c860' : a.isAnimal ? '#b0a080' : '#d8d0c0';
    ctx.fillRect(Math.round(ax) - 1, Math.round(ay) - 1, 2, 2);
  }
  // herbs with forager
  if (S.perks.includes('forager')) {
    ctx.fillStyle = '#8fdc6a';
    for (const o of m.queryObjects(p.x - 400, p.y - 400, p.x + 400, p.y + 400)) {
      if (o.kind !== 'herb' || o.hidden) continue;
      const ax = (o.x / TILE - px) * zoom + mini.width / 2, ay = (o.y / TILE - py) * zoom + mini.height / 2;
      ctx.fillRect(Math.round(ax), Math.round(ay), 1, 1);
    }
  }
  // quest markers
  for (const mk of markerPositions()) {
    let ax = (mk.x / TILE - px) * zoom + mini.width / 2, ay = (mk.y / TILE - py) * zoom + mini.height / 2;
    const dx = ax - mini.width / 2, dy = ay - mini.height / 2;
    const d = Math.hypot(dx, dy), lim = mini.width / 2 - 5;
    if (d > lim) { ax = mini.width / 2 + (dx / d) * lim; ay = mini.height / 2 + (dy / d) * lim; }
    ctx.fillStyle = '#1b1410';
    ctx.fillRect(Math.round(ax) - 3, Math.round(ay) - 3, 7, 7);
    ctx.fillStyle = mk.far ? '#d8c8a0' : '#f0c040';
    ctx.fillRect(Math.round(ax) - 2, Math.round(ay) - 2, 5, 5);
  }
  // player arrow
  ctx.fillStyle = '#fff';
  const cx = mini.width / 2, cy = mini.height / 2;
  ctx.beginPath();
  const ang = [Math.PI / 2, Math.PI, 0, -Math.PI / 2][p.dir];
  ctx.moveTo(cx + Math.cos(ang) * 4, cy + Math.sin(ang) * 4);
  ctx.lineTo(cx + Math.cos(ang + 2.4) * 3, cy + Math.sin(ang + 2.4) * 3);
  ctx.lineTo(cx + Math.cos(ang - 2.4) * 3, cy + Math.sin(ang - 2.4) * 3);
  ctx.fill();
}

/** In-world objective marker and off-screen arrow (screen-space hook). */
export function drawObjectiveOverlay(ctx: CanvasRenderingContext2D) {
  if (G.mode !== 'play' || !G.player) return;
  const cam = G.cam;
  for (const mk of markerPositions()) {
    const sx = mk.x - cam.x, sy = mk.y - cam.y;
    const on = sx > 6 && sy > 6 && sx < G.viewW - 6 && sy < G.viewH - 6;
    const bob = Math.sin(G.clock * 3.2) * 1.6;
    const gold = mk.far ? '#d8c8a0' : '#f0c040';
    if (on) {
      // a gilded diamond hovering over the goal, with a soft glow
      const y = sy - 30 + bob;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const glow = ctx.createRadialGradient(sx, y, 0, sx, y, 9);
      glow.addColorStop(0, 'rgba(255,210,110,0.45)');
      glow.addColorStop(1, 'rgba(255,210,110,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(sx - 10, y - 10, 20, 20);
      ctx.restore();
      ctx.fillStyle = 'rgba(20,14,10,0.85)';
      ctx.beginPath(); ctx.moveTo(sx, y - 7); ctx.lineTo(sx + 5.5, y); ctx.lineTo(sx, y + 8); ctx.lineTo(sx - 5.5, y); ctx.closePath(); ctx.fill();
      const g = ctx.createLinearGradient(sx - 4, y - 5, sx + 4, y + 6);
      g.addColorStop(0, '#fff2b8'); g.addColorStop(0.5, gold); g.addColorStop(1, '#a8741c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(sx, y - 5.6); ctx.lineTo(sx + 4.2, y); ctx.lineTo(sx, y + 6.4); ctx.lineTo(sx - 4.2, y); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.moveTo(sx, y - 4.4); ctx.lineTo(sx + 1.4, y - 1); ctx.lineTo(sx - 1.6, y - 0.6); ctx.closePath(); ctx.fill();
    } else {
      const px = G.player.x - cam.x, py = G.player.y - 10 - cam.y;
      const ang = Math.atan2(sy - py, sx - px);
      const m = 16;
      const kx = Math.cos(ang) !== 0 ? ((Math.cos(ang) > 0 ? G.viewW - m : m) - px) / Math.cos(ang) : Infinity;
      const ky = Math.sin(ang) !== 0 ? ((Math.sin(ang) > 0 ? G.viewH - m : m) - py) / Math.sin(ang) : Infinity;
      const k = Math.min(kx, ky);
      const ax = px + Math.cos(ang) * k, ay = py + Math.sin(ang) * k;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = 'rgba(20,14,10,0.85)';
      ctx.beginPath(); ctx.moveTo(8, 0); ctx.lineTo(-5, -7); ctx.lineTo(-2, 0); ctx.lineTo(-5, 7); ctx.closePath(); ctx.fill();
      const g = ctx.createLinearGradient(-4, -5, 6, 5);
      g.addColorStop(0, '#fff2b8'); g.addColorStop(0.5, gold); g.addColorStop(1, '#a8741c');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-3.6, -5.2); ctx.lineTo(-1.2, 0); ctx.lineTo(-3.6, 5.2); ctx.closePath(); ctx.fill();
      ctx.restore();
      const d = Math.round(Math.hypot(mk.x - G.player.x, mk.y - G.player.y) / TILE);
      drawText(ctx, String(d), ax - Math.cos(ang) * 15, ay - Math.sin(ang) * 15 - 4, '#f0d070', '#1b1410', 1, 'center');
    }
  }
}

export { buffActive };
