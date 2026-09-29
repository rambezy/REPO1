// Mouse, touch and keyboard input on the game view.

import { G, player } from '../game/G';
import { hover, screenToHex, screenToWorld, setHoverActor, setZoom, view } from '../render/renderer';
import { hexToPixel, hexDist, type Hex } from '../core/hex';
import type { Actor, MapObject } from '../game/types';
import { attack, currentMode, endPlayerTurn, hitChance, onPlayerSide, startCombat, tryEndCombat, reload, reloadAp, attackModes } from '../game/combat';
import { walkTo, useObject, talkTo, lookText, lootGround, useSkill, cancelOrders, autoEndTurn, objName } from '../game/interact';
import { pathTo } from '../game/movement';
import { msg, emit } from '../game/log';
import { camera } from '../render/fx';
import { closePopMenu, popMenu, topModal, closeModal } from './common';
import { sfx, unlockAudio } from '../audio/sfx';
import type { SkillKey } from '../data/stats';
import { SKILL_INFO } from '../data/stats';
import { el } from '../core/util';

export type CursorMode = 'move' | 'act' | 'look' | 'target' | 'skill';
let mode: CursorMode = 'move';
let pendingSkill: SkillKey | null = null;
let mouse = { x: 0, y: 0, inside: false };
let cursorEl: HTMLCanvasElement;
let tipEl: HTMLElement;

export function setCursorMode(m: CursorMode, skill?: SkillKey) {
  mode = m;
  pendingSkill = skill ?? null;
  drawCursor();
  if (m === 'skill' && skill) msg(`Choose a target for ${SKILL_INFO[skill].name}.`);
}

export function getCursorMode() {
  return mode;
}

function drawCursor() {
  if (!cursorEl) return;
  const c = cursorEl.getContext('2d')!;
  c.clearRect(0, 0, 32, 32);
  c.lineWidth = 2;
  switch (mode) {
    case 'target': {
      c.strokeStyle = '#ff3a2a';
      c.beginPath();
      c.arc(14, 14, 9, 0, 7);
      c.moveTo(14, 1);
      c.lineTo(14, 9);
      c.moveTo(14, 19);
      c.lineTo(14, 27);
      c.moveTo(1, 14);
      c.lineTo(9, 14);
      c.moveTo(19, 14);
      c.lineTo(27, 14);
      c.stroke();
      break;
    }
    case 'look': {
      c.fillStyle = '#60c0ff';
      c.strokeStyle = '#000';
      c.beginPath();
      c.ellipse(14, 12, 12, 7, 0, 0, 7);
      c.fill();
      c.stroke();
      c.fillStyle = '#10304a';
      c.beginPath();
      c.arc(14, 12, 4, 0, 7);
      c.fill();
      break;
    }
    case 'act':
    case 'skill': {
      c.fillStyle = mode === 'skill' ? '#e0d060' : '#f0e0b0';
      c.strokeStyle = '#000';
      c.beginPath();
      c.moveTo(6, 30);
      c.lineTo(6, 12);
      c.lineTo(9, 12);
      c.lineTo(9, 2);
      c.lineTo(13, 2);
      c.lineTo(13, 11);
      c.lineTo(17, 11);
      c.lineTo(21, 12);
      c.lineTo(24, 14);
      c.lineTo(24, 30);
      c.closePath();
      c.fill();
      c.stroke();
      break;
    }
    default: {
      c.fillStyle = '#e8d060';
      c.strokeStyle = '#000';
      c.beginPath();
      c.moveTo(2, 2);
      c.lineTo(20, 12);
      c.lineTo(12, 14);
      c.lineTo(8, 22);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }
}

/** Find the actor under a screen point, using sprite bounds. */
function actorAt(sx: number, sy: number): Actor | null {
  const m = G.map;
  if (!m) return null;
  const w = screenToWorld(sx, sy);
  let best: Actor | null = null;
  let by = -Infinity;
  for (const a of m.actors) {
    const p = hexToPixel(a.q, a.r);
    const sc = (a as any).look?.scale ?? 1;
    const hgt = a.dead ? 10 : 42 * sc;
    const wid = a.dead ? 16 : 11 * sc;
    if (w.x >= p.x - wid && w.x <= p.x + wid && w.y >= p.y - hgt && w.y <= p.y + 6) {
      const score = p.y + (a.dead ? -100 : 0);
      if (score > by) {
        by = score;
        best = a;
      }
    }
  }
  return best;
}

const TALL: Record<string, number> = { locker: 36, bookcase: 34, fridge: 32, terminal: 28, door: 38, hatch: 50, vat: 50, reactor: 44, tank: 40, elevator: 42, ladder: 40, deadtree: 40, lamp: 40, stall: 38 };

function objectAt(sx: number, sy: number): MapObject | null {
  const m = G.map;
  if (!m) return null;
  const w = screenToWorld(sx, sy);
  let best: MapObject | null = null;
  let by = -Infinity;
  for (const o of m.objects) {
    if (o.hidden) continue;
    const interesting = o.container || o.onUse || o.kind === 'door' || o.kind === 'hatch' || o.kind === 'gate' || o.kind === 'terminal' || o.name;
    if (!interesting) continue;
    const p = hexToPixel(o.q, o.r);
    const hgt = TALL[o.kind] ?? 20;
    if (w.x >= p.x - 16 && w.x <= p.x + 16 && w.y >= p.y - hgt && w.y <= p.y + 8) {
      if (p.y > by) {
        by = p.y;
        best = o;
      }
    }
  }
  return best;
}

function updateHover() {
  const m = G.map;
  if (!m || !mouse.inside || G.modal) {
    hover.hex = null;
    setHoverActor(null);
    tipEl.style.display = 'none';
    return;
  }
  const h = screenToHex(mouse.x, mouse.y);
  hover.hex = h;
  const a = actorAt(mouse.x, mouse.y);
  const o = a ? null : objectAt(mouse.x, mouse.y);
  setHoverActor(a);
  const p = player();
  hover.mode = mode === 'move' && a && !a.dead && a !== p && (G.combat ? a.hostile : true) ? (G.combat && a.hostile ? 'target' : 'act') : mode === 'move' && o ? 'act' : mode;
  hover.path = null;
  hover.apCost = undefined;
  hover.valid = true;
  let tip = '';
  if (hover.mode === 'target' && a && a !== p) {
    const md = currentMode(p);
    const pct = hitChance(p, a, md);
    hover.hex = { q: a.q, r: a.r };
    hover.apCost = md.ap;
    hover.valid = !G.combat || (p._ap ?? 0) >= md.ap;
    tip = `${a.name}: ${pct}% to hit`;
  } else if (mode === 'move' && !a && !o) {
    if (G.combat && G.combat.playerTurn && !G.combat.busy) {
      const path = m.walkable(h.q, h.r, { ignoreDoors: true }) ? pathTo(p, h) : null;
      hover.path = path;
      hover.apCost = path ? path.length : undefined;
      hover.valid = !!path && path.length <= (p._ap ?? 0);
    } else {
      hover.valid = m.walkable(h.q, h.r, { ignoreDoors: true });
    }
  } else if (a) {
    tip = a.dead ? `${a.name} (dead)` : a.name;
  } else if (o) {
    tip = objName(o);
  }
  if (tip) {
    tipEl.textContent = tip;
    tipEl.style.display = 'block';
    tipEl.style.left = mouse.x + 18 + 'px';
    tipEl.style.top = mouse.y + 14 + 'px';
  } else tipEl.style.display = 'none';
}

async function doAttack(target: Actor) {
  const p = player();
  if (target === p || target.dead) return;
  let md = currentMode(p);
  let limb: any = 'torso';
  if (md.kind === 'aimed') {
    const { chooseAim } = await import('./aim');
    limb = await chooseAim(target, md);
    if (!limb) return;
  }
  if (!G.combat) {
    // Attacking starts combat, with the player acting first.
    startCombat(p);
    await new Promise((r) => setTimeout(r, 450));
    if (!G.combat) return;
    // Wait until it's our turn.
    for (let i = 0; i < 60 && !(G.combat as any)?.playerTurn; i++) await new Promise((r) => setTimeout(r, 50));
  }
  if (!G.combat?.playerTurn || G.combat.busy) return;
  md = currentMode(p);
  if (hexDist(p, target) > Math.max(1, md.weapon.range)) {
    if (md.weapon.melee) {
      // Walk into melee range first.
      const path = pathTo(p, target, true);
      if (!path) return msg('You cannot reach the target.');
      const steps = path.length;
      if (steps + md.ap > (p._ap ?? 0)) {
        msg('Not enough action points to reach and attack.');
        return;
      }
      G.combat.busy = true;
      const { walk } = await import('../game/movement');
      await walk(p, path, p._ap);
      G.combat.busy = false;
    } else {
      msg('Target out of range.');
      return;
    }
  }
  G.combat.busy = true;
  await attack(p, target, md, limb);
  if (G.combat) G.combat.busy = false;
  emit('hud');
  const { checkCombatOver } = await import('../game/combat');
  if (G.combat && !checkCombatOver()) autoEndTurn();
}

function click(sx: number, sy: number, button: number, shift: boolean) {
  const m = G.map;
  if (!m || G.modal) return;
  closePopMenu();
  unlockAudio();
  if (button === 2) {
    const order: CursorMode[] = G.combat ? ['move', 'target', 'look', 'act'] : ['move', 'act', 'look', 'target'];
    const i = order.indexOf(mode === 'skill' ? 'act' : mode);
    setCursorMode(order[(i + 1) % order.length]);
    return;
  }
  const p = player();
  if (p.dead) return;
  if (G.combat && (!G.combat.playerTurn || G.combat.busy)) return;
  const h = screenToHex(sx, sy);
  const a = actorAt(sx, sy);
  const o = a ? null : objectAt(sx, sy);
  switch (mode) {
    case 'look':
      msg(a ? lookText(a) : o ? lookText(o) : m.groundAt(h.q, h.r).length ? 'You see some items on the ground.' : 'You see nothing of interest.');
      return;
    case 'target':
      if (a && a !== p && !a.dead) doAttack(a);
      else msg('Choose a target.');
      return;
    case 'skill':
      if (pendingSkill) useSkill(pendingSkill, a ?? o ?? null);
      setCursorMode('move');
      return;
    case 'act':
      if (a && a !== p) talkTo(a);
      else if (o) useObject(o);
      else if (m.groundAt(h.q, h.r).length) lootGround(h.q, h.r);
      return;
    default:
      if (a && a !== p) {
        if (G.combat && a.hostile && !a.dead) doAttack(a);
        else talkTo(a);
        return;
      }
      if (o) {
        useObject(o);
        return;
      }
      if (m.groundAt(h.q, h.r).length && !G.combat) {
        lootGround(h.q, h.r);
        return;
      }
      walkTo(h.q, h.r, shift || (G.state.flags._run && !G.state.flags._sneak));
  }
}

function contextMenu(sx: number, sy: number) {
  const a = actorAt(sx, sy);
  const o = a ? null : objectAt(sx, sy);
  const p = player();
  const items: { label: string; fn: () => void }[] = [];
  if (a && a !== p) {
    items.push({ label: 'Look', fn: () => msg(lookText(a)) });
    if (!a.dead) items.push({ label: a.companion ? 'Talk / Orders' : 'Talk', fn: () => talkTo(a) });
    else items.push({ label: 'Search body', fn: () => talkTo(a) });
    if (!a.dead) items.push({ label: 'Attack', fn: () => doAttack(a) });
    if (!a.dead) items.push({ label: 'Steal', fn: () => useSkill('steal', a) });
    items.push({ label: 'First Aid', fn: () => useSkill('firstAid', a) });
  } else if (o) {
    items.push({ label: 'Look', fn: () => msg(lookText(o)) });
    items.push({ label: 'Use', fn: () => useObject(o) });
    if (o.locked) items.push({ label: 'Lockpick', fn: () => useSkill('lockpick', o) });
    items.push({ label: 'Traps', fn: () => useSkill('traps', o) });
    items.push({ label: 'Science', fn: () => useSkill('science', o) });
    items.push({ label: 'Repair', fn: () => useSkill('repair', o) });
  } else if (a === p) {
    items.push({ label: 'Look', fn: () => msg(lookText(p)) });
    items.push({ label: 'First Aid', fn: () => useSkill('firstAid', p) });
    items.push({ label: 'Inventory', fn: () => import('./inventory').then((m) => m.openInventory()) });
  } else {
    const h = screenToHex(sx, sy);
    items.push({ label: 'Walk here', fn: () => walkTo(h.q, h.r) });
    items.push({ label: 'Run here', fn: () => walkTo(h.q, h.r, true) });
    if (G.map?.groundAt(h.q, h.r).length) items.push({ label: 'Pick up', fn: () => lootGround(h.q, h.r) });
  }
  popMenu(sx, sy, items);
}

export function initInput(canvas: HTMLCanvasElement) {
  cursorEl = el('canvas') as HTMLCanvasElement;
  cursorEl.id = 'cursor';
  cursorEl.width = 32;
  cursorEl.height = 32;
  document.body.appendChild(cursorEl);
  tipEl = el('div');
  tipEl.id = 'tip';
  document.body.appendChild(tipEl);
  drawCursor();

  let down: { x: number; y: number; t: number; cx: number; cy: number; moved: boolean; id: number; touch: boolean } | null = null;
  let longTimer = 0;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; z: number } | null = null;

  window.addEventListener('pointermove', (e) => {
    cursorEl.style.left = e.clientX + 'px';
    cursorEl.style.top = e.clientY + 'px';
    const overCanvas = e.target === canvas;
    cursorEl.classList.toggle('hidden', !overCanvas || e.pointerType === 'touch');
    tipEl.style.display = overCanvas ? tipEl.style.display : 'none';
  });

  canvas.addEventListener('pointerdown', (e) => {
    unlockAudio();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.zoom };
      down = null;
      clearTimeout(longTimer);
      return;
    }
    if (e.button === 2) return;
    canvas.setPointerCapture(e.pointerId);
    down = { x: e.clientX, y: e.clientY, t: performance.now(), cx: camera.x, cy: camera.y, moved: false, id: e.pointerId, touch: e.pointerType === 'touch' };
    if (e.pointerType === 'touch') {
      longTimer = window.setTimeout(() => {
        if (down && !down.moved) {
          contextMenu(down.x, down.y);
          down = null;
        }
      }, 520);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    mouse = { x: e.clientX, y: e.clientY, inside: true };
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(pinch.z * (d / pinch.d));
      return;
    }
    if (down) {
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      if (!down.moved && Math.hypot(dx, dy) > (down.touch ? 12 : 8)) {
        down.moved = true;
        clearTimeout(longTimer);
      }
      if (down.moved) {
        camera.manual = true;
        camera.tx = camera.x = down.cx - dx / view.zoom;
        camera.ty = camera.y = down.cy - dy / view.zoom;
      }
    }
  });
  const up = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    clearTimeout(longTimer);
    if (!down || down.id !== e.pointerId) return;
    const d = down;
    down = null;
    if (!d.moved && e.type === 'pointerup') click(e.clientX, e.clientY, e.button, e.shiftKey);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', () => {
    mouse.inside = false;
  });
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!G.map || G.modal) return;
    click(e.clientX, e.clientY, 2, false);
  });
  canvas.addEventListener('dblclick', (e) => {
    // Double-click runs.
    if (mode !== 'move' || G.combat) return;
    const h = screenToHex(e.clientX, e.clientY);
    if (G.map?.walkable(h.q, h.r, { ignoreDoors: true }) && !actorAt(e.clientX, e.clientY)) walkTo(h.q, h.r, true);
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    setZoom(view.zoom * (e.deltaY < 0 ? 1.1 : 0.9));
  }, { passive: false });

  window.addEventListener('keydown', onKey);
  setInterval(updateHover, 60);
}

const scrollKeys = new Set<string>();
window.addEventListener('keyup', (e) => scrollKeys.delete(e.key));

export function updateKeyScroll(dt: number) {
  if (!scrollKeys.size) return;
  const sp = 600 * dt / view.zoom;
  let dx = 0;
  let dy = 0;
  if (scrollKeys.has('ArrowLeft')) dx -= sp;
  if (scrollKeys.has('ArrowRight')) dx += sp;
  if (scrollKeys.has('ArrowUp')) dy -= sp;
  if (scrollKeys.has('ArrowDown')) dy += sp;
  if (dx || dy) {
    camera.manual = true;
    camera.tx = camera.x += dx;
    camera.ty = camera.y += dy;
  }
}

function onKey(e: KeyboardEvent) {
  if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
  const k = e.key;
  if (k === 'Escape') {
    if (topModal()) {
      if (topModal() !== 'dialogue' && topModal() !== 'ending') closeModal();
      return;
    }
    if (mode !== 'move') return setCursorMode('move');
    if (G.screen === 'play') import('./menus').then((m) => m.openOptions());
    return;
  }
  if (G.modal) {
    if (topModal() === 'inventory' && (k === 'i' || k === 'I')) closeModal();
    else if (topModal() === 'character' && (k === 'c' || k === 'C')) closeModal();
    else if (topModal() === 'pda' && (k === 'p' || k === 'P' || k === 'l' || k === 'L')) closeModal();
    else if (topModal() === 'automap' && (k === 'Tab' || k === 'm' || k === 'M')) {
      e.preventDefault();
      closeModal();
    }
    return;
  }
  if (G.screen !== 'play') return;
  if (k.startsWith('Arrow')) {
    scrollKeys.add(k);
    e.preventDefault();
    return;
  }
  const p = player();
  if ((e.ctrlKey || e.metaKey) && (k === 's' || k === 'S')) {
    e.preventDefault();
    import('../game/save').then((s) => s.quickSave());
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (k === 'l' || k === 'L')) {
    e.preventDefault();
    import('../game/save').then((s) => s.quickLoad());
    return;
  }
  switch (k.toLowerCase()) {
    case 'i':
      import('./inventory').then((m) => m.openInventory());
      break;
    case 'c':
      import('./charscreen').then((m) => m.openCharacter());
      break;
    case 'p':
    case 'l':
      import('./pda').then((m) => m.openPda());
      break;
    case 's':
      import('./skilldex').then((m) => m.openSkilldex());
      break;
    case 'tab':
    case 'm':
      e.preventDefault();
      import('./automap').then((m) => m.openAutomap());
      break;
    case 'a':
      setCursorMode(mode === 'target' ? 'move' : 'target');
      break;
    case 'b':
      p.active = p.active === 1 ? 0 : 1;
      sfx('click');
      emit('hud');
      break;
    case 'n': {
      const n = attackModes(p).length;
      p.mode[p.active] = (p.mode[p.active] + 1) % n;
      emit('hud');
      break;
    }
    case 'r':
      if (G.combat) {
        if (G.combat.playerTurn && (p._ap ?? 0) >= reloadAp(p) && reload(p)) {
          p._ap! -= reloadAp(p);
          autoEndTurn();
        }
      } else reload(p);
      emit('hud');
      break;
    case ' ':
      e.preventDefault();
      endPlayerTurn();
      break;
    case 'enter':
      tryEndCombat();
      break;
    case 'f':
    case 'home': {
      const pp = hexToPixel(p.q, p.r);
      camera.tx = pp.x;
      camera.ty = pp.y;
      camera.manual = false;
      break;
    }
    case '=':
    case '+':
      setZoom(view.zoom * 1.15);
      break;
    case '-':
      setZoom(view.zoom / 1.15);
      break;
    case 'x':
      cancelOrders();
      break;
  }
}

export function setPendingSkill(k: SkillKey) {
  setCursorMode('skill', k);
}

export type { Hex };
export { onPlayerSide };
