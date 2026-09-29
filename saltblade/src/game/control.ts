// Mouse and keyboard control of the player's squad: selecting, box select,
// right-click orders, context menus and time controls.
import * as THREE from 'three';
import { G } from '../state';
import { input } from '../core/input';
import { Char, Order } from '../sim/char';
import { WObj } from '../sim/objects';
import { S } from '../sim/ctx';
import { hostile } from '../sim/combat';
import { emit, on } from '../core/events';
import { leaveFurniture } from '../sim/use';
import { dropCarried } from '../sim/health';
import { ANIMAL } from '../content/animals';
import { FACTION } from '../content/factions';
import { ITEM } from '../content/items';
import { buyHouse, houseOf } from '../sim/property';

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const tmp = new THREE.Vector3();

export const sel = new Set<number>();
export let hoverId = 0;
export let hoverObj = 0;

export function selected(): Char[] {
  const out: Char[] = [];
  for (const id of sel) { const c = S.W.char(id); if (c && c.alive) out.push(c); else sel.delete(id); }
  return out;
}

export function selectOnly(c: Char) { sel.clear(); sel.add(c.id); emit('sel'); }

/** Ground point under a screen position (ray-marched against the heightmap). */
export function groundAt(sx: number, sy: number): THREE.Vector3 | null {
  const cam = G.R.camera;
  ndc.set((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, cam);
  const o = ray.ray.origin, d = ray.ray.direction;
  let t = 0, step = 1;
  let prevAbove = true, prevT = 0;
  for (let i = 0; i < 2000 && t < 6000; i++) {
    const x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
    const h = Math.max(G.T.heightAt(x, z), -0.2);
    const above = y > h;
    if (!above && prevAbove && i > 0) {
      // bisect
      let a = prevT, b = t;
      for (let k = 0; k < 18; k++) {
        const m = (a + b) / 2;
        const mx = o.x + d.x * m, my = o.y + d.y * m, mz = o.z + d.z * m;
        if (my > Math.max(G.T.heightAt(mx, mz), -0.2)) a = m; else b = m;
      }
      return tmp.set(o.x + d.x * b, o.y + d.y * b, o.z + d.z * b).clone();
    }
    prevAbove = above; prevT = t;
    step = Math.max(0.5, Math.min(20, (y - h) * 0.5));
    t += step;
  }
  return null;
}

function screenOf(x: number, y: number, z: number): [number, number, number] {
  tmp.set(x, y, z).project(G.R.camera);
  return [(tmp.x * 0.5 + 0.5) * window.innerWidth, (-tmp.y * 0.5 + 0.5) * window.innerHeight, tmp.z];
}

/** Character under the mouse (screen-space proximity to its body). */
export function charAt(sx: number, sy: number): Char | null {
  let best: Char | null = null, bd = Infinity;
  const cp = G.R.camera.position;
  for (const c of S.W.active) {
    if (!c.view || c.carriedBy) continue;
    const h = c.animal ? ANIMAL[c.animal].size * 0.7 : c.status === 'up' && !c.bed ? c.look.height * 0.55 : 0.25;
    const [x, y, z] = screenOf(c.x, c.y + h, c.z);
    if (z > 1) continue;
    const dist = Math.hypot(c.x - cp.x, c.y - cp.y, c.z - cp.z);
    const r = Math.max(12, Math.min(60, 900 / dist)) * (c.animal ? ANIMAL[c.animal].size : 1) * (c.status !== 'up' ? 1.3 : 1);
    const d = Math.hypot(x - sx, (y - sy) * (c.status === 'up' ? 0.6 : 1));
    if (d < r && d + dist * 0.01 < bd) { bd = d + dist * 0.01; best = c; }
  }
  return best;
}

/** How tall things stand, so they can be picked by any part of them: a sign by its board, a turret by its gun. */
const PICK_H: Partial<Record<WObj['kind'], number>> = {
  sign: 1.5, lamp: 2.2, banner: 2.6, post: 1.6, shackle_post: 1.8, turret: 2, machine: 1.6, generator: 1.4, battery: 1.2, research: 1.3,
  bench: 1.1, storage: 1.1, counter: 1.1, cage: 2, stove: 1.2, well: 1, crate: 0.8, chest: 0.7, bed: 0.6, stool: 0.5, table: 0.8,
  throne: 1.5, campfire: 0.4, ore: 1.4, gate: 3, tower: 5, pile: 0.3,
};

/** Distance from a point to a segment on screen. */
function segDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax, vy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / (vx * vx + vy * vy || 1)));
  return Math.hypot(px - ax - vx * t, py - ay - vy * t);
}

export function objAt(sx: number, sy: number): WObj | null {
  let best: WObj | null = null, bd = Infinity;
  const cam = G.R.camera;
  const g = groundAt(sx, sy);
  if (!g) return null;
  const focal = window.innerHeight / (2 * Math.tan(((cam.fov ?? 50) * Math.PI) / 360));
  S.W.objHash.near(g.x, g.z, 8, (o) => {
    if (o.kind === 'building' || o.kind === 'wall' || o.kind === 'decor' || o.hidden) return;
    // the ground under the cursor near its foot, or the cursor on it on screen, whichever is closer
    const r = o.kind === 'ore' ? 2.2 : o.kind === 'farm' ? 5 : o.kind === 'site' ? (o.data?.r ?? 3) : 1.3;
    let score = Math.hypot(o.x - g.x, o.z - g.z) / r;
    const h = PICK_H[o.kind];
    if (h) {
      const [ax, ay, az] = screenOf(o.x, o.y + 0.1, o.z);
      const [bx, by, bz] = screenOf(o.x, o.y + h, o.z);
      if (az < 1 && bz < 1) {
        const dist = Math.hypot(o.x - cam.position.x, o.y + h / 2 - cam.position.y, o.z - cam.position.z);
        const R = Math.max(10, Math.min(40, (focal * 0.45) / dist));
        score = Math.min(score, segDist(sx, sy, ax, ay, bx, by) / R);
      }
    }
    if (score < 1 && score < bd) { bd = score; best = o; }
  });
  return best;
}

// ---------------------------------------------------------------- orders
export function issue(c: Char, o: Order | null, queue = false) {
  if (!c.up && o?.k !== 'drop') return;
  if (c.bed || c.mem.using) leaveFurniture(c);
  c.mem.sit = false;
  c.order = o;
  c.jobs = queue ? c.jobs : c.jobs; // jobs persist; orders take priority
  if (o && o.k === 'move') c.brain.enemy = 0;
  if (o && (o.k === 'move' || o.k === 'attack')) { c.path = null; c.hasGoal = false; }
}

export function moveGroup(chars: Char[], x: number, z: number) {
  if (!chars.length) return;
  let cx = 0, cz = 0;
  for (const c of chars) { cx += c.x; cz += c.z; }
  cx /= chars.length; cz /= chars.length;
  const ang = Math.atan2(x - cx, z - cz);
  const cols = Math.ceil(Math.sqrt(chars.length));
  const sp = 1.5;
  chars.sort((a, b) => a.id - b.id);
  chars.forEach((c, i) => {
    const row = Math.floor(i / cols), col = i % cols;
    const ox = (col - (cols - 1) / 2) * sp, oz = -row * sp;
    const s = Math.sin(ang), co = Math.cos(ang);
    const tx = x + ox * co + oz * s, tz = z - ox * s + oz * co;
    const spot = chars.length > 1 ? G.nav.nearestOpen(tx, tz, 4) ?? [x, z] : [x, z];
    issue(c, { k: 'move', x: spot[0], z: spot[1] });
  });
  G.overlay.markers.push({ x, y: G.T.heightAt(x, z) + 0.1, z, t: 0.8, color: '#a8e08a' });
}

export interface MenuItem { label: string; run: () => void; danger?: boolean; hint?: string; }

/** All actions the selected characters could take on a character. */
export function charActions(t: Char): MenuItem[] {
  const who = selected();
  const out: MenuItem[] = [];
  if (!who.length) return out;
  const lead = who[0];
  const all = (o: () => Order) => () => who.forEach((c) => issue(c, o()));
  const one = (o: Order) => () => issue(lead, o);
  const mine = t.faction === 'player';
  if (t.status === 'up' && !mine) {
    if (!t.animal) {
      out.push({ label: 'Talk', run: one({ k: 'talk', id: t.id }) });
      if (t.shop || t.role === 'shopkeeper' || t.role === 'barkeep' || t.role === 'trader' || t.role === 'caravan') out.push({ label: 'Trade', run: one({ k: 'shop', id: t.id }) });
    }
    out.push({ label: 'Attack', run: all(() => ({ k: 'attack', id: t.id })), danger: !hostile(lead, t) && !t.animal });
    if (!t.animal && lead.move === 'sneak') {
      out.push({ label: 'Knock out (sneak attack)', run: one({ k: 'assassinate', id: t.id }), danger: true });
      out.push({ label: 'Pickpocket', run: one({ k: 'pickpocket', id: t.id }), danger: true });
    }
    if (t.shackled) out.push({ label: 'Pick their shackles', run: one({ k: 'free', id: t.id }), danger: true });
  }
  if (t.status !== 'up' || t.cage) {
    if (!t.cage) {
      out.push({ label: t.status === 'dead' ? 'Loot corpse' : 'Loot', run: one({ k: 'loot', id: t.id }), danger: !mine && t.status !== 'dead' && !t.animal && !hostile(lead, t) });
      if (t.status !== 'dead' || !t.animal) out.push({ label: 'Pick up', run: one({ k: 'pickup', id: t.id }) });
    }
    if (t.status !== 'dead') out.push({ label: t.robot ? 'Repair' : 'First aid', run: one({ k: 'aid', id: t.id }) });
    if (t.status === 'ko' && !mine && !t.animal) out.push({ label: 'Finish them', run: () => { lead.brain.finish = t.id; issue(lead, { k: 'attack', id: t.id }); }, danger: true });
  }
  if (mine && t.status === 'up') {
    out.push({ label: 'Follow', run: () => who.filter((c) => c !== t).forEach((c) => issue(c, { k: 'follow', id: t.id })) });
    if (t.body.needsAid()) out.push({ label: t.robot ? 'Repair' : 'First aid', run: one({ k: 'aid', id: t.id }) });
    if (t.shackled) out.push({ label: t === lead ? 'Pick my shackles' : 'Pick their shackles', run: one({ k: 'free', id: t.id }) });
  }
  if (t.cage && t.status !== 'dead') out.push({ label: 'Pick the cage lock', run: one({ k: 'lockpick', obj: t.cage, id: t.id }), danger: !mine });
  return out;
}

export function objActions(o: WObj): MenuItem[] {
  const who = selected();
  const out: MenuItem[] = [];
  if (!who.length) return out;
  const lead = who[0];
  const one = (ord: Order) => () => issue(lead, ord);
  const mine = o.owner === 'player';
  switch (o.kind) {
    case 'bed':
      if (lead.carrying) out.push({ label: 'Put in bed', run: one({ k: 'place', obj: o.id }) });
      else out.push({ label: o.owner && !mine ? 'Rest here (trespassing)' : 'Rest', run: one({ k: 'use', obj: o.id }), danger: !!o.owner && !mine && o.owner !== 'drifters_inn' });
      break;
    case 'cage':
      if (lead.carrying && !o.occupant) out.push({ label: 'Lock them in the cage', run: one({ k: 'place', obj: o.id }) });
      if (o.occupant) out.push({ label: 'Pick the lock', run: one({ k: 'lockpick', obj: o.id }), danger: !mine });
      break;
    case 'ore':
      out.push({ label: `Mine ${o.def === 'stone' ? 'stone' : o.def + ' ore'}`, run: () => who.forEach((c) => issue(c, { k: 'mine', obj: o.id })) });
      break;
    case 'site':
      out.push({ label: 'Build', run: () => who.forEach((c) => issue(c, { k: 'build', obj: o.id })) });
      break;
    case 'chest': case 'storage': case 'counter': case 'crate': case 'pile':
      if (mine || o.kind === 'pile' || !o.owner) out.push({ label: o.kind === 'pile' ? 'Loot' : 'Open', run: one({ k: 'lootobj', obj: o.id }) });
      else {
        out.push({ label: 'Steal from', run: one({ k: 'steal', obj: o.id }), danger: true });
        if (o.locked) out.push({ label: 'Pick the lock', run: one({ k: 'lockpick', obj: o.id }), danger: true });
      }
      break;
    case 'gate':
      if (mine) out.push({ label: o.open ? 'Close gate' : 'Open gate', run: one({ k: 'use', obj: o.id }) });
      break;
    case 'turret':
      if (mine) out.push({ label: 'Man the turret', run: one({ k: 'use', obj: o.id }) });
      break;
    case 'stool': case 'throne':
      out.push({ label: 'Sit', run: one({ k: 'use', obj: o.id }) });
      break;
    case 'sign':
      if (o.def === 'forsale' && o.data?.price) {
        const house = houseOf(o);
        out.push({ label: `Buy this ${house?.data?.use === 'shack' ? 'shack' : 'house'} (${o.data.price.toLocaleString()} chits)`, run: () => { const err = buyHouse(o); if (err) S.fx.notice(err, 'bad'); } });
      }
      break;
    default:
      if (mine && o.data?.job) out.push({ label: o.data.jobLabel ?? 'Work here', run: () => who.forEach((c) => issue(c, { k: 'operate', obj: o.id })) });
      if (mine) out.push({ label: 'Inspect', run: () => emit('ui:object', lead.id, o.id) });
  }
  if (mine && o.kind !== 'site' && !o.site) out.push({ label: 'Deconstruct', run: () => emit('build:deconstruct', o.id), danger: true });
  return out;
}

// ---------------------------------------------------------------- context menu
let menuEl: HTMLDivElement | null = null;
export function closeMenu() { menuEl?.remove(); menuEl = null; }
export function menuOpen() { return !!menuEl; }
export function openMenu(x: number, y: number, title: string, items: MenuItem[]) {
  closeMenu();
  if (!items.length) return;
  const el = document.createElement('div');
  el.className = 'ctxmenu';
  el.innerHTML = `<div class="ctxtitle">${title}</div>`;
  for (const it of items) {
    const b = document.createElement('button');
    b.className = 'ctxitem' + (it.danger ? ' danger' : '');
    b.textContent = it.label;
    b.onclick = (e) => { e.stopPropagation(); closeMenu(); it.run(); };
    el.appendChild(b);
  }
  document.getElementById('ui')!.appendChild(el);
  const r = el.getBoundingClientRect();
  el.style.left = Math.min(x + 8, window.innerWidth - r.width - 8) + 'px';
  el.style.top = Math.min(y + 8, window.innerHeight - r.height - 8) + 'px';
  menuEl = el;
}

export function setSpeed(s: number) {
  if (s === 0) { if (G.speed) G.lastSpeed = G.speed; G.speed = 0; }
  else { G.speed = s; G.lastSpeed = s; }
  emit('speed');
}

export function attachControl() {
  input.handlers.click = (x, y, e) => {
    closeMenu();
    if (G.placing) { emit('build:click', x, y); return; }
    const c = charAt(x, y);
    if (c && c.faction === 'player') {
      if (e.shiftKey || e.ctrlKey) { if (sel.has(c.id)) sel.delete(c.id); else sel.add(c.id); }
      else { sel.clear(); sel.add(c.id); }
      emit('sel');
      return;
    }
    if (c) { emit('ui:inspect', c.id); return; }
    const o = objAt(x, y);
    if (o) { emit('ui:object', 0, o.id); return; }
    if (!e.shiftKey) { sel.clear(); emit('sel'); }
  };
  input.handlers.dblclick = (x, y) => {
    const c = charAt(x, y);
    if (c && c.faction === 'player') { G.cam.follow = () => (c.alive ? c : null); }
  };
  input.handlers.boxing = (x0, y0, x1, y1) => { G.overlay.box = x0 === x1 && y0 === y1 ? null : [x0, y0, x1, y1]; };
  input.handlers.box = (x0, y0, x1, y1, e) => {
    G.overlay.box = null;
    const lx = Math.min(x0, x1), hx = Math.max(x0, x1), ly = Math.min(y0, y1), hy = Math.max(y0, y1);
    if (!e.shiftKey) sel.clear();
    for (const c of S.W.playerChars()) {
      if (!c.alive || !c.view) continue;
      const [sx, sy, sz] = screenOf(c.x, c.y + 1, c.z);
      if (sz < 1 && sx >= lx && sx <= hx && sy >= ly && sy <= hy) sel.add(c.id);
    }
    emit('sel');
  };
  input.handlers.rclick = (x, y, e) => {
    closeMenu();
    if (G.placing) { emit('build:cancel'); return; }
    const who = selected();
    if (!who.length) return;
    const c = charAt(x, y);
    if (c && !who.includes(c)) {
      const acts = charActions(c);
      // attack hostiles directly unless asking for the menu
      if (c.up && hostile(who[0], c) && !e.ctrlKey && !e.altKey) { acts.find((a) => a.label === 'Attack')?.run(); G.overlay.markers.push({ x: c.x, y: c.y + 0.1, z: c.z, t: 0.8, color: '#f07050' }); return; }
      const title = c.animal ? c.name : `${c.name}${c.title ? ' — ' + c.title : ''} (${FACTION[c.faction]?.short ?? c.faction})`;
      openMenu(x, y, title, acts);
      return;
    }
    const o = objAt(x, y);
    if (o) {
      const acts = objActions(o);
      if (acts.length) { openMenu(x, y, objTitle(o), acts); return; }
    }
    const g = groundAt(x, y);
    if (g) moveGroup(who, g.x, g.z);
  };
  input.handlers.move = (x, y) => {
    const c = charAt(x, y);
    hoverId = c ? c.id : 0;
    hoverObj = c ? 0 : objAt(x, y)?.id ?? 0;
    emit('hover', x, y);
  };
  input.onKey((code, e) => {
    if (code === 'Escape') { closeMenu(); return false; }
    if (code === 'Space') { setSpeed(G.speed ? 0 : G.lastSpeed || 1); return true; }
    if (code === 'Digit1' && !e.ctrlKey) { setSpeed(1); return true; }
    if (code === 'Digit2') { setSpeed(2); return true; }
    if (code === 'Digit3') { setSpeed(3); return true; }
    if (code === 'Digit4') { setSpeed(5); return true; }
    if (code === 'KeyA' && e.ctrlKey) { sel.clear(); for (const c of S.W.playerChars()) if (c.alive) sel.add(c.id); emit('sel'); return true; }
    const who = selected();
    if (code === 'KeyT' && who.length) { const sneak = who.some((c) => c.move !== 'sneak'); who.forEach((c) => (c.move = sneak ? 'sneak' : 'run')); emit('sel'); return true; }
    if (code === 'KeyR' && who.length) { const walk = !who[0].mem.walk; who.forEach((c) => { c.mem.walk = walk; if (c.move !== 'sneak') c.move = walk ? 'walk' : 'run'; }); emit('sel'); return true; }
    if (code === 'KeyH' && who.length) { who.forEach((c) => issue(c, c.order?.k === 'hold' ? null : { k: 'hold' })); emit('sel'); return true; }
    if (code === 'KeyF' && who.length) { const c = who[0]; G.cam.follow = G.cam.follow ? null : () => (c.alive ? c : null); return true; }
    if (code === 'Delete' || code === 'KeyX') { who.forEach((c) => c.carrying && dropCarried(c)); return true; }
    return false;
  });
  on('order', (c: Char, o: Order) => issue(c, o));
}

function objTitle(o: WObj) {
  if (o.def === 'forsale') return 'For sale';
  if (o.kind === 'ore') return o.def === 'stone' ? 'Stone deposit' : `${o.def[0].toUpperCase() + o.def.slice(1)} ore deposit`;
  const n = o.data?.name ?? o.def;
  return n.charAt(0).toUpperCase() + n.slice(1);
}

export { ITEM };
