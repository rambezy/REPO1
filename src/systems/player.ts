// Player control: movement, sprinting, sneaking, combat input, interaction
// targeting, torch and weapon swapping.

import { G } from '../G';
import { input } from '../engine/input';
import { Actor } from '../world/actor';
import { here, actorsNear } from '../world/world';
import { MapObject } from '../world/map';
import { S } from '../state';
import { dirFromVec, dirFromAngle, DIR_VEC, rand } from '../engine/util';
import { startAttack, startBlock, endBlock, startDodge, isPlayer, areHostile } from './combat';
import { addXp, hasPerk, buffActive, maxStamina, maxHp } from './stats';
import { overweight, has, refreshEquipment, useItem } from './inventory';
import { sfx } from '../audio/sfx';
import { emit as fx, floatText } from '../engine/fx';
import { item } from '../content/items';
import { notify } from '../ui/notify';
import { emit } from '../engine/events';

export type Target = { kind: 'actor'; a: Actor; label: string; crime?: boolean } | { kind: 'obj'; o: MapObject; label: string; crime?: boolean };

export const playerState = {
  target: null as Target | null,
  noise: 0, // 0..1.5 how loud the player is right now
  visibility: 1, // 0..1 how visible
  stepT: 0,
  attackHeld: 0,
  combatNear: false,
  lockTarget: null as Actor | null,
  lastHostileT: 0,
};

/** Hooks other modules use to describe interactables (set by interact.ts). */
export const interactHooks = {
  labelFor: (_t: Target): string | null => null,
  actorLabel: (_a: Actor): { label: string; crime?: boolean } | null => null,
  objLabel: (_o: MapObject): { label: string; crime?: boolean } | null => null,
  run: (_t: Target) => {},
};

export function aimAngle(p: Actor): number {
  if (input.lastDevice === 'mouse' && input.mouseInside) {
    const wx = input.mouseX + Math.round(G.cam.x), wy = input.mouseY + Math.round(G.cam.y);
    return Math.atan2(wy - (p.y - 10), wx - p.x);
  }
  if (Math.hypot(input.padAim.x, input.padAim.y) > 0.4) return Math.atan2(input.padAim.y, input.padAim.x);
  const lock = playerState.lockTarget;
  if (lock && !lock.dead && Math.hypot(lock.x - p.x, lock.y - p.y) < 110) return Math.atan2(lock.y - p.y, lock.x - p.x);
  const v = DIR_VEC[p.dir];
  return Math.atan2(v[1], v[0]);
}

function nearestHostile(p: Actor, r: number): Actor | null {
  let best: Actor | null = null, bd = r;
  for (const a of here()) {
    if (a === p || a.dead || a.hidden || !areHostile(p, a) || a.mem.down) continue;
    const d = Math.hypot(a.x - p.x, a.y - p.y);
    if (d < bd) { bd = d; best = a; }
  }
  return best;
}

export function updatePlayer(dt: number) {
  const p = G.player;
  if (!p || p.dead) return;
  const c = p.combat;
  p.maxHp = maxHp();
  p.maxStamina = maxStamina();
  if (p.stamina > p.maxStamina) p.stamina = p.maxStamina;

  const locked = G.controlLocked || G.mode !== 'play';
  const mv = locked ? { x: 0, y: 0 } : input.moveVec();
  const moving = Math.hypot(mv.x, mv.y) > 0.1;

  // lock-on to nearby hostiles
  const hostile = nearestHostile(p, 120);
  playerState.lockTarget = hostile;
  playerState.combatNear = !!hostile;
  p.mem.combatReady = !!hostile || c.phase !== 'none';
  if (hostile) playerState.lastHostileT = G.clock;

  if (!locked) {
    if (input.pressed('crouch')) { p.crouching = !p.crouching; }
    if (input.pressed('torch')) toggleTorch();
    if (input.pressed('swap')) swapWeapon();
    for (let i = 0; i < 4; i++) if (input.pressed(('quick' + (i + 1)) as 'quick1')) { const id = S.quick[i]; if (id && has(id)) useItem(id); }
  }

  const ang = aimAngle(p);
  const bowMode = c.weapon.kind === 'bow';

  // ---- combat input ----
  if (!locked) {
    if (input.down('block') && !bowMode) {
      p.mem.blockAngle = ang;
      if (c.phase === 'none' || c.phase === 'recover' || c.phase === 'block') startBlock(p);
    } else if (c.phase === 'block') endBlock(p);

    if (bowMode) {
      if (input.down('attack') && (c.phase === 'none' || c.phase === 'draw')) {
        c.phase = 'draw';
        p.mem.drawTime = (S.equip.bow ? item(S.equip.bow).ranged!.draw : 0.8) * (hasPerk('quick_draw') ? 0.67 : 1);
        p.mem.drawT = (p.mem.drawT || 0) + dt;
        c.attackAngle = ang;
        p.dir = dirFromAngle(ang);
        p.pose = 'windup';
        if (p.mem.drawT > p.mem.drawTime) p.stamina -= dt * 6;
      } else if (c.phase === 'draw') {
        if ((p.mem.drawT || 0) > 0.25 && has('arrow')) {
          c.attackAngle = ang;
          startAttackShoot(p, ang);
        } else if (!has('arrow')) notify('You have no arrows.', 'bad');
        if (c.phase === 'draw') { c.phase = 'none'; p.pose = 'idle'; }
        p.mem.drawT = 0;
      }
    } else if (input.pressed('attack') && c.phase !== 'block') {
      if (startAttack(p, c.combo >= 2 && c.comboWindow > 0 ? 'thrust' : 'slash', ang)) playerState.attackHeld = 0;
      else if (c.phase === 'windup' || c.phase === 'strike') c.queued = true;
    }
    if (!bowMode && input.down('attack') && c.phase === 'windup' && c.attackKind === 'slash') {
      playerState.attackHeld += dt;
      if (playerState.attackHeld > 0.16 && c.phaseT >= c.phaseLen * 0.8) {
        // holding converts the swing into a heavy blow
        c.attackKind = 'heavy';
        c.phaseLen += 0.28;
        p.stamina -= c.weapon.staminaCost * 0.7;
        fx('spark', p.x, p.y - 20, { vz: 20, color: '#fff3b0' });
      }
    }
    if (c.queued && c.phase === 'recover' && c.comboWindow > 0) {
      c.queued = false;
      startAttack(p, c.combo >= 2 ? 'thrust' : 'slash', ang);
    }
    if (input.pressed('dodge') && (playerState.combatNear || c.phase !== 'none')) {
      const dx = moving ? mv.x : -Math.cos(ang), dy = moving ? mv.y : -Math.sin(ang);
      startDodge(p, dx, dy);
    }
  }

  // ---- movement ----
  const canMove = !locked && c.phase !== 'windup' && c.phase !== 'strike' && c.phase !== 'stagger' && c.phase !== 'dodge' && p.poseLock <= 0 && !p.sitting;
  let speed = p.speed * G.map.speedAt(p.x, p.y);
  const wantRun = input.down('sprint') && moving && !p.crouching && c.phase !== 'block';
  if (wantRun && p.stamina > (p.running ? 2 : 12)) p.running = true;
  else p.running = false;
  if (p.running) {
    speed *= p.runMul;
    let drain = hasPerk('fleet') ? 9 : 14;
    if (buffActive('wind')) drain = 3;
    p.stamina -= drain * dt;
    if (Math.random() < dt * 0.6) addXp('vitality', 0.5);
  }
  if (p.crouching) speed *= 0.55;
  if (c.phase === 'block' || c.phase === 'draw') speed *= 0.5;
  if (c.phase === 'recover') speed *= 0.6;
  if (overweight()) { speed *= 0.55; p.running = false; }
  if (S.hunger > 100) speed *= 0.9;
  if (S.drunk > 60) speed *= 0.9;

  let didMove = false;
  if (canMove && moving) {
    let mx = mv.x, my = mv.y;
    if (S.drunk > 55) { mx += Math.sin(G.clock * 1.7) * 0.25; my += Math.cos(G.clock * 1.3) * 0.25; }
    didMove = p.move(G.map, mx * speed * dt, my * speed * dt, here());
    const inStance = c.phase === 'block' || c.phase === 'draw' || (playerState.combatNear && input.lastDevice === 'mouse');
    if (!inStance) p.dir = dirFromVec(mv.x, mv.y, p.dir);
  }
  if (c.phase === 'block' || c.phase === 'draw' || (playerState.combatNear && c.phase === 'none' && input.lastDevice === 'mouse')) p.dir = dirFromAngle(ang);

  if (c.phase === 'none' && p.poseLock <= 0 && !p.sitting) p.pose = didMove ? 'walk' : (p.crouching ? 'crouch' : 'idle');
  if (p.crouching && c.phase === 'none' && didMove) p.pose = 'walk';

  // ---- stamina regeneration ----
  if (!p.running && c.phase !== 'block' && c.phase !== 'windup' && c.phase !== 'strike' && c.phase !== 'draw') {
    let regen = 26;
    if (hasPerk('marathon')) regen += 8;
    if (hasPerk('second_wind') && playerState.combatNear) regen += 8;
    if (buffActive('warmth')) regen += 6;
    if (S.hunger < 20 || S.energy < 15) regen *= 0.5;
    if (buffActive('grief')) regen *= 0.8;
    p.stamina = Math.min(p.maxStamina, p.stamina + regen * dt);
  }
  if (p.stamina < 0) p.stamina = 0;

  // ---- footsteps & noise ----
  let noise = 0;
  if (didMove) {
    noise = p.running ? 1.2 : p.crouching ? (hasPerk('soft_step') ? 0.12 : 0.22) : 0.55;
    noise += c.armor.noise * 0.08;
    playerState.stepT -= dt;
    if (playerState.stepT <= 0) {
      playerState.stepT = p.running ? 0.24 : p.crouching ? 0.5 : 0.36;
      const snd = G.map.soundAt(p.x, p.y);
      if (snd !== 'none') sfx('step_' + snd, undefined, undefined, p.crouching ? 0.35 : 1);
      if (snd === 'water' && Math.random() < 0.6) fx('splash', p.x, p.y);
      if (p.running && (snd === 'dirt' || snd === 'grass') && Math.random() < 0.5) fx('dust', p.x, p.y);
    }
    if (p.crouching && Math.random() < dt * 0.8) addXp('stealth', 0.4);
  }
  if (c.phase === 'strike') noise = Math.max(noise, 1.1);
  playerState.noise = noise;

  // ---- interaction ----
  playerState.target = locked ? null : findTarget(p);
  if (!locked && input.pressed('interact') && playerState.target) {
    input.consume('interact');
    input.consume('confirm');
    interactHooks.run(playerState.target);
  }
  // carry weight warning
  if (overweight() && Math.random() < dt * 0.05) notify('You are carrying too much.', 'bad', 2000);
}

function startAttackShoot(p: Actor, ang: number) {
  const c = p.combat;
  c.phase = 'none';
  if (startAttack(p, 'shoot', ang, 0.2)) {
    // consume an arrow
    const i = S.inv.findIndex((s) => s.id === 'arrow');
    if (i >= 0) { S.inv[i].n--; if (S.inv[i].n <= 0) S.inv.splice(i, 1); }
    p.mem.arrowDmg = S.equip.bow ? item(S.equip.bow).ranged!.dmg : 20;
  }
}

function findTarget(p: Actor): Target | null {
  const v = DIR_VEC[p.dir];
  const fx0 = p.x + v[0] * 10, fy0 = p.y - 4 + v[1] * 10;
  let best: Target | null = null;
  let bd = 999;
  for (const a of actorsNear(p.x, p.y, 40)) {
    if (a === p) continue;
    const lab = interactHooks.actorLabel(a);
    if (!lab) continue;
    const d = Math.hypot(a.x - fx0, (a.y - 6) - fy0);
    if (d < 24 && d < bd) { bd = d; best = { kind: 'actor', a, label: lab.label, crime: lab.crime }; }
  }
  const objs = G.map.queryObjects(p.x - 60, p.y - 60, p.x + 60, p.y + 60);
  for (const o of objs) {
    if (!o.interact || o.hidden) continue;
    const lab = interactHooks.objLabel(o);
    if (!lab) continue;
    const ox = o.ix ?? o.x, oy = o.iy ?? o.y - 4;
    const d = Math.hypot(ox - fx0, oy - fy0);
    const reach = o.interact.type === 'door' ? 20 : 22;
    if (d < reach && d < bd) { bd = d; best = { kind: 'obj', o, label: lab.label, crime: lab.crime }; }
  }
  return best;
}

export function toggleTorch() {
  const t = S.equip.torch;
  if (t) {
    S.equip.torch = null;
    notify('You put out the light.', 'info', 1500);
    return;
  }
  const id = has('lantern') ? 'lantern' : has('torch') ? 'torch' : null;
  if (!id) { notify('You have no torch or lantern.', 'bad', 2000); return; }
  S.equip.torch = id;
  sfx('fire');
}

export function swapWeapon() {
  const p = G.player;
  if (!S.equip.bow || !has(S.equip.bow)) { notify('You have no bow equipped.', 'bad', 2000); return; }
  p.mem.bowMode = !p.mem.bowMode;
  refreshEquipment();
  sfx('sheathe');
  floatText(p.mem.bowMode ? 'BOW' : 'MELEE', p.x, p.y - 30, '#d8d0c0');
}

/** Light from a held torch/lantern (render hook). */
export function playerLights() {
  const p = G.player;
  const t = S.equip.torch;
  if (!p || !t || !has(t)) return [];
  const r = item(t).light || 70;
  return [{ x: p.x + 4, y: p.y - 14, r, color: t === 'lantern' ? '#ffd08a' : '#ffa04a', intensity: 0.9, flicker: t !== 'lantern' }];
}

export function emitPlayerNoise() {
  emit('noise', G.player.x, G.player.y, playerState.noise);
}

export { isPlayer, rand };
