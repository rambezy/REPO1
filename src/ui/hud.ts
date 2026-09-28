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
import { makeCanvas } from '../gfx/pixel';
import { tdef, T } from '../world/terrain';
import { here } from '../world/world';
import { TILE } from '../engine/util';
import { input } from '../engine/input';
import { drawText } from '../gfx/font';

let els: Record<string, HTMLElement> = {};
const cache: Record<string, string> = {};
function setHTML(k: string, v: string) { if (cache[k] !== v) { cache[k] = v; els[k].innerHTML = v; } }
function setStyle(k: string, prop: string, v: string) { const key = k + '.' + prop; if (cache[key] !== v) { cache[key] = v; (els[k].style as unknown as Record<string, string>)[prop] = v; } }
function setShow(k: string, on: boolean) { const key = k + '.show'; const v = on ? '1' : '0'; if (cache[key] !== v) { cache[key] = v; els[k].hidden = !on; } }

let mini: HTMLCanvasElement;
let miniBase: { mapId: string; version: number; canvas: HTMLCanvasElement } | null = null;

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
  mini = makeCanvas(96, 96);
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
  if (!miniBase || miniBase.mapId !== m.id || miniBase.version !== m.version) {
    const c = makeCanvas(m.w, m.h);
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
    miniBase = { mapId: m.id, version: m.version, canvas: c };
  }
  const ctx = mini.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const p = G.player;
  const R = 48; // tiles shown across
  const zoom = mini.width / R;
  const px = p.x / TILE, py = p.y / TILE;
  ctx.fillStyle = '#0b0807';
  ctx.fillRect(0, 0, mini.width, mini.height);
  ctx.drawImage(miniBase.canvas, px - R / 2, py - R / 2, R, R, 0, 0, mini.width, mini.height);
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
    const sx = mk.x - Math.round(cam.x), sy = mk.y - Math.round(cam.y);
    const on = sx > 6 && sy > 6 && sx < G.viewW - 6 && sy < G.viewH - 6;
    const bob = Math.sin(G.clock * 4) * 2;
    if (on) {
      const y = sy - 30 + bob;
      ctx.fillStyle = '#1b1410';
      ctx.beginPath(); ctx.moveTo(sx - 5, y - 1); ctx.lineTo(sx + 5, y - 1); ctx.lineTo(sx, y + 7); ctx.fill();
      ctx.fillStyle = mk.far ? '#d8c8a0' : '#f0c040';
      ctx.beginPath(); ctx.moveTo(sx - 3, y); ctx.lineTo(sx + 3, y); ctx.lineTo(sx, y + 5); ctx.fill();
    } else {
      const px = G.player.x - Math.round(cam.x), py = G.player.y - 10 - Math.round(cam.y);
      const ang = Math.atan2(sy - py, sx - px);
      const m = 14;
      const ex = Math.max(m, Math.min(G.viewW - m, px + Math.cos(ang) * 1000));
      const ey = Math.max(m, Math.min(G.viewH - m, py + Math.sin(ang) * 1000));
      // clamp along the ray
      const kx = Math.cos(ang) !== 0 ? ((Math.cos(ang) > 0 ? G.viewW - m : m) - px) / Math.cos(ang) : Infinity;
      const ky = Math.sin(ang) !== 0 ? ((Math.sin(ang) > 0 ? G.viewH - m : m) - py) / Math.sin(ang) : Infinity;
      const k = Math.min(kx, ky);
      const ax = px + Math.cos(ang) * k, ay = py + Math.sin(ang) * k;
      ctx.save();
      ctx.translate(Math.round(ax || ex), Math.round(ay || ey));
      ctx.rotate(ang);
      ctx.fillStyle = '#1b1410';
      ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-5, -6); ctx.lineTo(-5, 6); ctx.fill();
      ctx.fillStyle = '#f0c040';
      ctx.beginPath(); ctx.moveTo(5, 0); ctx.lineTo(-3, -4); ctx.lineTo(-3, 4); ctx.fill();
      ctx.restore();
      const d = Math.round(Math.hypot(mk.x - G.player.x, mk.y - G.player.y) / TILE);
      drawText(ctx, String(d), Math.round(ax - Math.cos(ang) * 14), Math.round(ay - Math.sin(ang) * 14) - 3, '#f0c040', '#1b1410', 1, 'center');
    }
  }
}

export { buffActive };
