// Melee and ranged combat: attack phases, hit detection, blocking with a
// timing-based perfect block, master strikes, dodges, damage vs armour,
// bleeding, staggers, and arrows.

import { G } from '../G';
import { Actor, CombatState } from '../world/actor';
import { here } from '../world/world';
import { angleDiff, clamp, dirFromAngle, rand, TILE, wrapAngle } from '../engine/util';
import { emit as fx, floatText, addDecal } from '../engine/fx';
import { emit } from '../engine/events';
import { S, addStat } from '../state';
import { addXp, hasPerk, skill, attr } from './stats';
import { sfx } from '../audio/sfx';
import { P } from '../gfx/palette';
import { weaponPose } from './weaponPose';

export const PB_BASE = 0.17;

export type AttackKind = CombatState['attackKind'];

/** Timings (seconds) per attack kind, before speed modifiers. */
const TIMING: Record<AttackKind, { windup: number; strike: number; recover: number; arc: number; reachMul: number; dmg: number; stam: number }> = {
  slash: { windup: 0.2, strike: 0.12, recover: 0.22, arc: 1.9, reachMul: 1, dmg: 1, stam: 1 },
  thrust: { windup: 0.24, strike: 0.1, recover: 0.24, arc: 0.8, reachMul: 1.25, dmg: 1.05, stam: 1 },
  heavy: { windup: 0.1, strike: 0.15, recover: 0.38, arc: 2.2, reachMul: 1.05, dmg: 1.75, stam: 1.7 },
  bite: { windup: 0.28, strike: 0.12, recover: 0.4, arc: 1.4, reachMul: 1, dmg: 1, stam: 0.6 },
  charge: { windup: 0.5, strike: 0.5, recover: 0.6, arc: 1.2, reachMul: 1, dmg: 1, stam: 0.5 },
  shoot: { windup: 0.1, strike: 0.05, recover: 0.3, arc: 0, reachMul: 0, dmg: 1, stam: 0.3 },
};

export function isPlayer(a: Actor) { return a === G.player; }

function weaponSkillKey(a: Actor): string {
  switch (a.combat.weapon.kind) {
    case 'sword': case 'dagger': return 'sword';
    case 'mace': case 'hammer': case 'stick': case 'fist': return 'blunt';
    case 'axe': return 'axe';
    case 'spear': return 'sword';
    case 'bow': return 'archery';
  }
}

/** Effective combat skill level for any actor (players use real skills, NPCs use mem.skill). */
export function combatSkill(a: Actor, key?: string): number {
  if (isPlayer(a)) return skill(key || weaponSkillKey(a));
  return a.mem.skill ?? 3;
}

function speedMul(a: Actor): number {
  let m = a.combat.weapon.speed;
  if (isPlayer(a)) {
    m *= 1 + (attr('agility') - 3) * 0.025 + skill(weaponSkillKey(a)) * 0.015;
    if (hasPerk('quick_hands')) m *= 1.12;
    if (S.stamina < 15) m *= 0.8;
  } else {
    m *= 0.85 + (a.mem.skill ?? 3) * 0.03;
  }
  return m;
}

export function canAct(a: Actor) {
  const c = a.combat;
  return !a.dead && c.phase !== 'stagger' && c.stunned <= 0 && c.phase !== 'windup' && c.phase !== 'strike' && c.phase !== 'dodge';
}

export function startAttack(a: Actor, kind: AttackKind, angle: number, telegraph = 1): boolean {
  const c = a.combat;
  if (a.dead || c.phase === 'stagger' || c.stunned > 0 || c.phase === 'windup' || c.phase === 'strike' || c.phase === 'dodge') return false;
  if (c.phase === 'recover' && c.comboWindow <= 0) return false;
  const t = TIMING[kind];
  let cost = c.weapon.staminaCost * t.stam;
  if (isPlayer(a) && hasPerk('fencer') && c.weapon.kind === 'sword') cost *= 0.75;
  if (a.stamina < cost * 0.35) {
    if (isPlayer(a)) floatText('TIRED', a.x, a.y - 30, '#e8c040');
    return false;
  }
  a.stamina -= cost;
  // chain combos
  if (c.phase === 'recover' && c.comboWindow > 0) c.combo = Math.min(3, c.combo + 1);
  else c.combo = 1;
  c.phase = 'windup';
  c.attackKind = kind;
  c.attackAngle = angle;
  c.phaseT = 0;
  c.phaseLen = (t.windup / speedMul(a)) * telegraph * (c.combo > 1 ? 0.7 : 1);
  c.hitThisSwing.clear();
  c.comboWindow = 0;
  a.dir = dirFromAngle(angle);
  a.pose = 'windup';
  if (kind === 'charge') { a.mem.chargeVx = Math.cos(angle); a.mem.chargeVy = Math.sin(angle); }
  if (!isPlayer(a)) a.emoteShow('!', c.phaseLen + 0.1);
  return true;
}

export function startBlock(a: Actor) {
  const c = a.combat;
  if (a.dead || c.phase === 'stagger' || c.phase === 'strike' || c.phase === 'dodge') return;
  if (c.phase === 'windup' && c.attackKind !== 'heavy') return;
  if (c.phase !== 'block') { c.phase = 'block'; c.blockT = 0; c.phaseT = 0; }
  a.pose = 'block';
}
export function endBlock(a: Actor) {
  if (a.combat.phase === 'block') { a.combat.phase = 'none'; a.pose = 'idle'; }
}

export function startDodge(a: Actor, vx: number, vy: number): boolean {
  const c = a.combat;
  if (!canAct(a) && c.phase !== 'block' && c.phase !== 'recover') return false;
  let cost = 18;
  if (isPlayer(a) && hasPerk('dodger')) cost = 9;
  if (a.stamina < cost) return false;
  a.stamina -= cost;
  const l = Math.hypot(vx, vy) || 1;
  c.dodgeVx = (vx / l) * 190;
  c.dodgeVy = (vy / l) * 190;
  c.phase = 'dodge';
  c.phaseT = 0;
  c.phaseLen = 0.24;
  c.invuln = 0.17;
  if (isPlayer(a)) addXp('agility', 1);
  fx('dust', a.x, a.y);
  sfx('dodge');
  return true;
}

export function stagger(a: Actor, secs: number) {
  const c = a.combat;
  c.phase = 'stagger';
  c.phaseT = 0;
  c.phaseLen = secs;
  a.pose = 'hurt';
}

// ---------- per-frame ----------

export function updateActorCombat(a: Actor, dt: number) {
  const c = a.combat;
  if (a.dead) return;
  c.phaseT += dt;
  if (c.invuln > 0) c.invuln -= dt;
  if (c.cooldown > 0) c.cooldown -= dt;
  if (c.comboWindow > 0) c.comboWindow -= dt;
  if (c.stunned > 0) c.stunned -= dt;
  if (c.phase === 'block') c.blockT += dt;

  switch (c.phase) {
    case 'windup':
      a.pose = 'windup';
      if (c.phaseT >= c.phaseLen) {
        c.phase = 'strike';
        c.phaseT = 0;
        const t = TIMING[c.attackKind];
        c.phaseLen = t.strike;
        a.pose = 'strike';
        if (c.attackKind === 'shoot') { fireArrow(a, c.attackAngle); }
        else sfx(c.attackKind === 'heavy' ? 'swing_heavy' : 'swing');
        // small lunge forward
        const lunge = c.attackKind === 'thrust' ? 5 : c.attackKind === 'heavy' ? 4 : 2;
        a.move(G.map, Math.cos(c.attackAngle) * lunge, Math.sin(c.attackAngle) * lunge, here());
      }
      break;
    case 'strike':
      a.pose = 'strike';
      if (c.attackKind === 'charge') {
        a.move(G.map, (a.mem.chargeVx || 0) * 160 * dt, (a.mem.chargeVy || 0) * 160 * dt, here());
      }
      if (c.attackKind !== 'shoot') detectHits(a);
      if (c.phaseT >= c.phaseLen) {
        c.phase = 'recover';
        c.phaseT = 0;
        c.phaseLen = TIMING[c.attackKind].recover / speedMul(a);
        c.comboWindow = c.phaseLen + 0.18;
      }
      break;
    case 'recover':
      a.pose = c.phaseT < 0.08 ? 'strike' : 'idle';
      if (c.phaseT >= c.phaseLen) { c.phase = 'none'; a.pose = 'idle'; }
      break;
    case 'stagger':
      a.pose = 'hurt';
      if (c.phaseT >= c.phaseLen) { c.phase = 'none'; a.pose = 'idle'; }
      break;
    case 'dodge': {
      const k = 1 - c.phaseT / c.phaseLen;
      a.move(G.map, c.dodgeVx * dt * k, c.dodgeVy * dt * k, here());
      if (c.phaseT >= c.phaseLen) { c.phase = 'none'; a.pose = 'idle'; }
      break;
    }
  }

  // bleeding (paused for the player while a scene has control)
  if (c.bleeding > 0 && !(isPlayer(a) && (G.controlLocked || G.mode === 'cutscene' || G.mode === 'dialogue'))) {
    const b = c.bleeding * dt;
    a.hp -= b;
    c.bleeding = Math.max(0, c.bleeding - dt * (isPlayer(a) ? 0.03 : 0.06));
    if (Math.random() < dt * c.bleeding * 2) addDecal('blood', a.x + rand.range(-3, 3), a.y + rand.range(-1, 1));
    if (a.hp <= 0) kill(a, null);
  }

  // stamina regeneration (player regen handled with survival modifiers in player.ts)
  if (!isPlayer(a)) {
    if (c.phase === 'none' || c.phase === 'recover') a.stamina = Math.min(a.maxStamina, a.stamina + dt * 22);
  }
}

function detectHits(a: Actor) {
  const c = a.combat;
  const t = TIMING[c.attackKind];
  const reach = c.weapon.reach * t.reachMul + 6;
  for (const o of here()) {
    if (o === a || o.dead || o.hidden || c.hitThisSwing.has(o.id)) continue;
    if (!areHostile(a, o) && !(isPlayer(a) && o.hostile) && !(o === G.player && a.hostile)) {
      // players can still strike neutrals (it's a crime), NPCs only hit enemies
      if (!isPlayer(a)) continue;
    }
    const dx = o.x - a.x, dy = (o.y - 4) - (a.y - 4);
    const d = Math.hypot(dx, dy);
    if (d > reach + o.hitW / 2) continue;
    const ang = Math.atan2(dy, dx);
    if (d > 6 && angleDiff(ang, c.attackAngle) > t.arc / 2) continue;
    c.hitThisSwing.add(o.id);
    resolveHit(a, o, ang);
    if (c.attackKind === 'charge') { c.phaseT = c.phaseLen; }
  }
}

export function areHostile(a: Actor, b: Actor): boolean {
  if (a.dead || b.dead) return false;
  if (a === G.player) return b.hostile;
  if (b === G.player) return a.hostile;
  // NPC vs NPC (sparring partners only fight the player)
  if (a.mem.spar || b.mem.spar) return false;
  const allyOfPlayer = (x: Actor) => x.faction === 'ally' || x.faction === 'dog' || x.mem.follow === G.player.id;
  if (allyOfPlayer(a) && b.hostile) return true;
  if (allyOfPlayer(b) && a.hostile) return true;
  if (a.mem.enemies?.includes(b.faction) || b.mem.enemies?.includes(a.faction)) return true;
  if (a.mem.target === b.id || b.mem.target === a.id) return true;
  return false;
}

function pbWindow(defender: Actor): number {
  let w = PB_BASE;
  if (isPlayer(defender)) {
    w += skill('defense') * 0.012;
    if (hasPerk('hawk_eye')) w *= 1.4;
    if (S.difficulty === 'story') w *= 1.5;
    if (S.difficulty === 'hard') w *= 0.8;
  } else {
    w += (defender.mem.skill ?? 3) * 0.01;
  }
  return w;
}

function resolveHit(a: Actor, o: Actor, ang: number) {
  const c = a.combat;
  const oc = o.combat;
  if (oc.invuln > 0 || oc.phase === 'dodge') {
    floatText('DODGE', o.x, o.y - 28, '#d8d0c0');
    return;
  }
  // blocked?
  const facingToAttacker = Math.atan2(a.y - o.y, a.x - o.x);
  const blockFacing = o.mem.blockAngle ?? facingToAttacker;
  const inFront = angleDiff(facingToAttacker, blockFacing) < 1.3;
  if (oc.phase === 'block' && inFront && c.attackKind !== 'charge') {
    const perfect = oc.blockT <= pbWindow(o) && c.attackKind !== 'heavy';
    if (perfect) {
      sfx('parry');
      for (let i = 0; i < 10; i++) fx('spark', (a.x + o.x) / 2, (a.y + o.y) / 2 - 10);
      stagger(a, 0.75);
      G.cam.shake = Math.max(G.cam.shake, 2);
      if (isPlayer(o)) {
        addXp('defense', 4);
        addXp('agility', 1);
        floatText('PERFECT', o.x, o.y - 32, '#f0d060');
        addStat('perfect_blocks');
        emit('perfect_block');
        if (hasPerk('riposte') || (S.difficulty === 'story' && skill('defense') >= 2)) masterStrike(o, a);
      } else if ((o.mem.skill ?? 3) >= 6 && Math.random() < 0.5) {
        masterStrike(o, a);
      }
      return;
    }
    // normal block
    const raw = rawDamage(a, o);
    let cost = raw * 1.1;
    if (isPlayer(o)) {
      cost *= 1 - skill('defense') * 0.035;
      if (hasPerk('steady_guard')) cost *= 0.75;
      addXp('defense', 1.5);
    }
    if (c.attackKind === 'heavy') cost *= 1.8;
    if (isPlayer(a) && hasPerk('cleaver') && c.weapon.kind === 'axe') cost *= 1.3;
    o.stamina -= cost;
    sfx('block');
    for (let i = 0; i < 4; i++) fx('spark', (a.x + o.x) / 2, (a.y + o.y) / 2 - 10);
    o.move(G.map, Math.cos(ang) * 4, Math.sin(ang) * 4, here());
    if (o.stamina <= 0) {
      o.stamina = 0;
      stagger(o, 0.9);
      floatText('GUARD BROKEN', o.x, o.y - 30, '#e87050');
      applyDamage(o, a, raw * 0.35, ang, { quiet: true });
    } else if (!isPlayer(a)) {
      // AI attackers recoil a little from a solid block
      a.combat.cooldown = Math.max(a.combat.cooldown, 0.2);
    }
    if (!isPlayer(o) && o.brain?.onHit) o.brain.onHit(o, a);
    return;
  }
  // backstab / sneak bonuses
  let mult = 1;
  const behind = angleDiff(ang, Math.atan2(Math.sin(dirAngleOf(o)), Math.cos(dirAngleOf(o)))) < 0.9;
  if (behind) mult *= 1.35;
  if (isPlayer(a) && !o.hostile && !o.mem.alerted && o.mem.aware === false) {
    mult *= 2.5;
    if (hasPerk('takedown') && !o.essential && !o.mem.boss) {
      floatText('TAKEDOWN', o.x, o.y - 30, '#f0d060');
      o.mem.knockedOut = true;
      applyDamage(o, a, o.hp + 1, ang, { quiet: false, nonlethal: true });
      addXp('stealth', 8);
      return;
    }
    addXp('stealth', 4);
  }
  if (c.combo >= 3 && isPlayer(a) && hasPerk('combo_' + c.weapon.kind)) mult *= 1.5;
  const dmg = finalDamage(a, o, mult);
  applyDamage(o, a, dmg.total, ang, { slash: dmg.slash, heavy: c.attackKind === 'heavy' });
  if (isPlayer(a)) {
    addXp(weaponSkillKey(a), 2.5);
    addXp('strength', c.attackKind === 'heavy' ? 2 : 1);
  }
  if (isPlayer(o)) addXp('vitality', 1.5);
}

function dirAngleOf(a: Actor) {
  return [Math.PI / 2, Math.PI, 0, -Math.PI / 2][a.dir];
}

function rawDamage(a: Actor, o: Actor): number {
  const w = a.combat.weapon;
  const t = TIMING[a.combat.attackKind];
  return (w.slash + w.stab + w.blunt) * 0.8 * t.dmg;
}

export function finalDamage(a: Actor, o: Actor, mult = 1) {
  const w = a.combat.weapon;
  const kind = a.combat.attackKind;
  const t = TIMING[kind];
  let sl = w.slash, st = w.stab, bl = w.blunt;
  if (kind === 'thrust') { sl *= 0.2; bl *= 0.3; }
  else if (kind === 'slash') { st *= 0.3; }
  let m = t.dmg * mult;
  if (isPlayer(a)) {
    const sk = skill(weaponSkillKey(a));
    m *= 1 + sk * 0.06 + (attr('strength') - 3) * 0.04;
    if (w.kind === 'axe' && hasPerk('woodsman')) m *= 1.2;
    if (w.kind === 'fist' && hasPerk('brawler')) m *= 1.5;
    if (hasPerk('whetstone_master') && (w.kind === 'sword' || w.kind === 'axe' || w.kind === 'dagger')) m *= 1.1;
    if (o.isAnimal && hasPerk('hunter')) m *= 1.2;
    if (S.difficulty === 'story') m *= 1.3;
  } else {
    m *= 0.75 + (a.mem.skill ?? 3) * 0.05;
    if (isPlayer(o)) {
      m *= 0.72;
      if (S.difficulty === 'story') m *= 0.6;
      if (S.difficulty === 'hard') m *= 1.3;
      if (hasPerk('iron_skin')) m *= 0.9;
    }
  }
  const ar = o.combat.armor;
  let blArmor = ar.blunt;
  if (isPlayer(a) && hasPerk('bonebreaker') && (w.kind === 'mace' || w.kind === 'hammer')) blArmor *= 0.66;
  const dsl = (sl * m * 20) / (20 + ar.slash);
  const dst = (st * m * 20) / (20 + ar.stab);
  const dbl = (bl * m * 20) / (20 + blArmor);
  return { total: dsl + dst + dbl, slash: dsl };
}

function masterStrike(o: Actor, a: Actor) {
  // o counters a
  const ang = Math.atan2(a.y - o.y, a.x - o.x);
  o.dir = dirFromAngle(ang);
  o.pose = 'strike';
  o.combat.phase = 'recover';
  o.combat.phaseT = 0;
  o.combat.phaseLen = 0.25;
  const saved = o.combat.attackKind;
  o.combat.attackKind = 'heavy';
  const dmg = finalDamage(o, a, 1.35);
  o.combat.attackKind = saved;
  floatText('MASTER STRIKE', o.x, o.y - 40, '#ffd070');
  sfx('hit_heavy');
  G.cam.shake = Math.max(G.cam.shake, 4);
  hitStop(0.09);
  applyDamage(a, o, dmg.total, ang, { slash: dmg.slash, heavy: true });
  if (isPlayer(o)) { addXp('sword', 6); addStat('master_strikes'); }
}

let stopT = 0;
export function hitStop(t: number) { stopT = Math.max(stopT, t); }
export function consumeHitStop(dt: number): boolean {
  if (stopT > 0) { stopT -= dt; return true; }
  return false;
}

export interface DmgOpts { slash?: number; heavy?: boolean; quiet?: boolean; nonlethal?: boolean; arrow?: boolean }

export function applyDamage(o: Actor, a: Actor | null, amount: number, ang: number, opts: DmgOpts = {}) {
  if (o.dead) return;
  amount = Math.max(1, amount);
  o.hp -= amount;
  o.flash = 1;
  o.combat.lastHitBy = a ? a.id : null;
  if (!opts.quiet) {
    sfx(opts.heavy ? 'hit_heavy' : o.isAnimal ? 'hit_flesh' : 'hit');
    for (let i = 0; i < Math.min(12, 3 + amount / 3); i++) fx('blood', o.x, o.y - 10);
    if (Math.random() < 0.5) addDecal('blood', o.x + rand.range(-4, 4), o.y + rand.range(-2, 2), 3);
  }
  floatText(String(Math.round(amount)), o.x + rand.range(-4, 4), o.y - 26, isPlayer(o) ? '#ff7a6a' : '#f4efe4');
  // knockback
  const kb = opts.heavy ? 9 : 4;
  o.move(G.map, Math.cos(ang) * kb, Math.sin(ang) * kb, here());
  // bleeding
  if ((opts.slash || 0) > 6) {
    let bleed = (opts.slash || 0) * 0.05;
    if (a && isPlayer(a) && hasPerk('bleeder')) bleed *= 2;
    o.combat.bleeding = Math.min(6, o.combat.bleeding + bleed);
  }
  if (o.combat.phase === 'windup' && (opts.heavy || amount > 18)) stagger(o, opts.heavy ? (a && isPlayer(a) && hasPerk('stunning') ? 0.9 : 0.55) : 0.3);
  else if (o.combat.phase !== 'stagger' && opts.heavy) stagger(o, 0.4);
  else if (o.combat.phase === 'none') { o.pose = 'hurt'; o.poseLock = 0.12; }
  if (isPlayer(o)) {
    G.hurtFlash = 1;
    G.cam.shake = Math.max(G.cam.shake, opts.heavy ? 4 : 2);
    emit('player:hurt', a);
  } else {
    hitStop(opts.heavy ? 0.06 : 0.035);
  }
  if (o.brain?.onHit) o.brain.onHit(o, a);
  emit('hit', o, a, amount);
  if (o.hp <= 0) {
    if (opts.nonlethal || o.mem.nonlethal || (o.unkillable && !isPlayer(o))) {
      o.hp = 1;
      knockOut(o);
    } else kill(o, a);
  }
}

export function knockOut(o: Actor) {
  o.pose = 'lie';
  o.mem.down = true;
  o.combat.phase = 'none';
  o.combat.bleeding = 0;
  o.hostile = false;
  emit('knockout', o);
  emit('knockout:' + (o.charId || o.id), o);
}

export function kill(o: Actor, by: Actor | null) {
  if (o.dead) return;
  if (isPlayer(o)) {
    emit('player:dying', by);
    if (o.hp > 0) return; // a listener saved the player (scripted fights)
    o.dead = true;
    o.pose = 'dead';
    emit('player:dead', by);
    return;
  }
  if (o.essential || o.unkillable) {
    o.hp = 1;
    knockOut(o);
    return;
  }
  o.dead = true;
  o.hp = 0;
  o.pose = 'dead';
  o.combat.phase = 'none';
  o.combat.bleeding = 0;
  o.solid = false;
  sfx(o.isAnimal ? 'animal_die' : 'die');
  for (let i = 0; i < 10; i++) fx('blood', o.x, o.y - 8);
  if (by && isPlayer(by)) {
    addStat('kills');
    if (!o.isAnimal) addStat('kills_human');
  }
  if (o.charId) S.deadNpcs[o.charId] = true;
  emit('kill', o, by);
  emit('kill:' + (o.charId || o.id), o, by);
  for (const tg of o.tags) emit('kill:tag:' + tg, o, by);
}

// ---------- arrows ----------

export interface Arrow { x: number; y: number; vx: number; vy: number; dmg: number; owner: Actor; life: number; z: number }
export const arrows: Arrow[] = [];
export const stuckArrows: { x: number; y: number; ang: number; life: number }[] = [];

export function fireArrow(a: Actor, ang: number, dmgOverride?: number) {
  let spread = a.mem.bowSpread ?? 0.08;
  if (isPlayer(a)) {
    spread = 0.16 - skill('archery') * 0.012 - (hasPerk('steady_hand') ? 0.03 : 0);
    const draw = clamp(a.mem.drawT / (a.mem.drawTime || 0.8), 0, 1);
    spread *= 1.6 - draw * 0.8;
    spread = Math.max(0.01, spread);
  }
  const ang2 = ang + rand.range(-spread, spread);
  const speed = 330;
  const dmg = dmgOverride ?? a.mem.arrowDmg ?? 20;
  arrows.push({ x: a.x + Math.cos(ang2) * 8, y: a.y - 10 + Math.sin(ang2) * 8, vx: Math.cos(ang2) * speed, vy: Math.sin(ang2) * speed, dmg, owner: a, life: 1.2, z: 10 });
  sfx('bow');
}

export function updateArrows(dt: number) {
  for (let i = arrows.length - 1; i >= 0; i--) {
    const r = arrows[i];
    r.life -= dt;
    const nx = r.x + r.vx * dt, ny = r.y + r.vy * dt;
    let hit: Actor | null = null;
    for (const o of here()) {
      if (o === r.owner || o.dead || o.hidden) continue;
      if (!isPlayer(r.owner) && !areHostile(r.owner, o)) continue;
      const dx = o.x - nx, dy = (o.y - 10) - ny;
      if (Math.abs(dx) < o.hitW / 2 + 3 && Math.abs(dy) < 12) { hit = o; break; }
    }
    if (hit) {
      const ang = Math.atan2(r.vy, r.vx);
      if (hit.combat.phase === 'block' && angleDiff(Math.atan2(r.owner.y - hit.y, r.owner.x - hit.x), ang + Math.PI) < 0.5 && hit.combat.armor.slash > 8) {
        sfx('block');
      } else {
        const ar = hit.combat.armor;
        let dmg = (r.dmg * 20) / (20 + ar.stab);
        if (isPlayer(r.owner)) {
          dmg *= 1 + skill('archery') * 0.07;
          if (hit.isAnimal && hasPerk('hunter')) dmg *= 1.4;
          if (!hit.hostile && hit.mem.aware === false) dmg *= 2;
          addXp('archery', 3);
          addXp('agility', 1);
        }
        applyDamage(hit, r.owner, dmg, ang, { arrow: true });
      }
      arrows.splice(i, 1);
      continue;
    }
    if (r.life <= 0 || G.map.tileSolid(Math.floor(nx / TILE), Math.floor(ny / TILE)) && !isWaterTile(nx, ny)) {
      stuckArrows.push({ x: nx, y: ny, ang: Math.atan2(r.vy, r.vx), life: 30 });
      if (stuckArrows.length > 40) stuckArrows.shift();
      arrows.splice(i, 1);
      continue;
    }
    r.x = nx; r.y = ny;
  }
  for (let i = stuckArrows.length - 1; i >= 0; i--) { stuckArrows[i].life -= dt; if (stuckArrows[i].life <= 0) stuckArrows.splice(i, 1); }
}

function isWaterTile(x: number, y: number) {
  const t = G.map.get(Math.floor(x / TILE), Math.floor(y / TILE));
  return t === 10 || t === 11;
}

function arrowShape(ctx: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.strokeStyle = '#8a6a44';
  ctx.lineWidth = 0.55;
  ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(0, 0); ctx.stroke();
  ctx.fillStyle = '#c8cfd6';
  ctx.beginPath(); ctx.moveTo(1.8, 0); ctx.lineTo(-0.3, -0.8); ctx.lineTo(-0.3, 0.8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#e8e2d2';
  for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(-len, 0); ctx.lineTo(-len - 1.2, s * 1.1); ctx.lineTo(-len + 1.8, s * 0.3); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}

export function drawArrows(ctx: CanvasRenderingContext2D) {
  for (const r of arrows) arrowShape(ctx, r.x, r.y, Math.atan2(r.vy, r.vx), 8);
  for (const s of stuckArrows) arrowShape(ctx, s.x, s.y - 1, s.ang, 5, Math.min(1, s.life / 3));
}

// ---------- weapon drawing ----------

const STEEL: [string, string, string] = ['#eef2f5', '#aab4be', '#56606a'];

function blade(ctx: CanvasRenderingContext2D, from: number, to: number, w: number, tip: number) {
  const g = ctx.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, STEEL[0]);
  g.addColorStop(0.45, STEEL[1]);
  g.addColorStop(1, STEEL[2]);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(from, -w);
  ctx.lineTo(to - tip, -w * 0.85);
  ctx.lineTo(to, 0);
  ctx.lineTo(to - tip, w * 0.85);
  ctx.lineTo(from, w);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(40,46,52,0.55)';
  ctx.lineWidth = 0.18;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 0.14;
  ctx.beginPath(); ctx.moveTo(from + 0.5, -w * 0.25); ctx.lineTo(to - tip * 1.2, -w * 0.2); ctx.stroke();
}

function haft(ctx: CanvasRenderingContext2D, from: number, to: number, w: number, col = '#6b4526') {
  const g = ctx.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, '#a87444');
  g.addColorStop(0.5, col);
  g.addColorStop(1, '#3a2416');
  ctx.fillStyle = g;
  ctx.fillRect(from, -w, to - from, w * 2);
}

/** Draws the weapon of an actor from its hand during fights and at the ready (render hook). */
export function drawWeapon(ctx: CanvasRenderingContext2D, a: Actor) {
  const wp = weaponPose(a, isPlayer(a));
  if (!wp || !wp.show) return;
  const c = a.combat;
  const w = c.weapon;
  const hand = (a.mem.hand as { x: number; y: number } | undefined) ?? { x: a.x, y: a.y - 11 };
  if (w.kind === 'bow') { drawBow(ctx, a, wp.A); return; }
  const A = wp.A, len = wp.len;
  // swing trail
  if (wp.trail) {
    const [a0, a1] = wp.trail;
    const cx = a.x, cy = a.y - 13, R = len + 5;
    ctx.save();
    ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      ctx.strokeStyle = `rgba(255,250,235,${0.16 + k * 0.1})`;
      ctx.lineWidth = 2.6 - k * 0.8;
      ctx.beginPath();
      const from = a0 + (a1 - a0) * (k * 0.25);
      ctx.arc(cx, cy, R - k * 0.6, Math.min(from, a1), Math.max(from, a1));
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.save();
  ctx.translate(hand.x, hand.y);
  ctx.rotate(A);
  ctx.lineCap = 'round';
  switch (w.kind) {
    case 'sword': case 'dagger': {
      const dagger = w.kind === 'dagger';
      const L = dagger ? Math.min(len, 7) : len;
      haft(ctx, -2.4, 0.2, 0.55, '#4a2e1a');
      ctx.fillStyle = '#c79a2c';
      ctx.beginPath(); ctx.arc(-2.7, 0, 0.8, 0, Math.PI * 2); ctx.fill();
      blade(ctx, 0.6, L, dagger ? 0.65 : 0.72, dagger ? 1.6 : 2.2);
      const g = ctx.createLinearGradient(0, -2.6, 0, 2.6);
      g.addColorStop(0, '#f6e39a'); g.addColorStop(1, '#8a6a18');
      ctx.fillStyle = g;
      ctx.fillRect(0.1, dagger ? -1.8 : -2.6, 0.9, dagger ? 3.6 : 5.2);
      break;
    }
    case 'axe': {
      haft(ctx, -2, len, 0.5);
      const g = ctx.createLinearGradient(len - 3, -3.6, len - 3, 1);
      g.addColorStop(0, STEEL[0]); g.addColorStop(0.5, STEEL[1]); g.addColorStop(1, STEEL[2]);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(len - 3.5, -0.6); ctx.lineTo(len - 4.6, -3.8); ctx.quadraticCurveTo(len - 2.2, -3.4, len - 0.8, -4.2);
      ctx.quadraticCurveTo(len + 0.6, -1.5, len - 0.6, 0.8); ctx.lineTo(len - 3.5, 0.6); ctx.closePath(); ctx.fill();
      break;
    }
    case 'mace': case 'hammer': {
      haft(ctx, -2, len - 1, 0.5);
      if (w.kind === 'mace') {
        const g = ctx.createRadialGradient(len - 0.8, -0.8, 0.2, len, 0, 2.4);
        g.addColorStop(0, STEEL[0]); g.addColorStop(0.6, STEEL[1]); g.addColorStop(1, STEEL[2]);
        ctx.fillStyle = g;
        for (let k = 0; k < 6; k++) { const q = (k / 6) * Math.PI * 2; ctx.beginPath(); ctx.moveTo(len, 0); ctx.lineTo(len + Math.cos(q) * 2.4, Math.sin(q) * 2.4); ctx.lineTo(len + Math.cos(q + 0.5) * 1.4, Math.sin(q + 0.5) * 1.4); ctx.closePath(); ctx.fill(); }
        ctx.beginPath(); ctx.arc(len, 0, 1.4, 0, Math.PI * 2); ctx.fill();
      } else {
        const g = ctx.createLinearGradient(0, -2.6, 0, 2.6);
        g.addColorStop(0, STEEL[0]); g.addColorStop(0.5, '#6f7882'); g.addColorStop(1, '#34393f');
        ctx.fillStyle = g;
        ctx.fillRect(len - 2.2, -2.6, 3.2, 5.2);
      }
      break;
    }
    case 'spear': {
      haft(ctx, -6, len, 0.45, '#8a5c33');
      blade(ctx, len - 0.3, len + 3.4, 0.9, 2.2);
      break;
    }
    case 'stick': {
      haft(ctx, -2.5, len, 0.5, '#8a6a44');
      ctx.fillStyle = '#6b4526';
      ctx.beginPath(); ctx.ellipse(len * 0.6, -0.5, 0.6, 0.3, 0.6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    default:
      haft(ctx, -2, len, 0.5);
  }
  // telegraph glint for enemies about to strike
  if (c.phase === 'windup' && !isPlayer(a) && wp.t > 0.45) {
    const s = 1.2 + wp.t * 2.4;
    ctx.fillStyle = '#fff8d0';
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(len - s, 0); ctx.lineTo(len, -0.35); ctx.lineTo(len + s, 0); ctx.lineTo(len, 0.35); ctx.closePath();
    ctx.moveTo(len, -s); ctx.lineTo(len + 0.35, 0); ctx.lineTo(len, s); ctx.lineTo(len - 0.35, 0); ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawBow(ctx: CanvasRenderingContext2D, a: Actor, ang: number) {
  const hand = (a.mem.hand as { x: number; y: number } | undefined) ?? { x: a.x, y: a.y - 11 };
  const hx = hand.x, hy = hand.y;
  const draw = a.mem.drawT ? clamp(a.mem.drawT / (a.mem.drawTime || 0.8), 0, 1) : 0;
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(ang);
  ctx.lineCap = 'round';
  // limbs
  ctx.strokeStyle = '#6b4526';
  ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(-1.5 - draw * 0.8, -8); ctx.quadraticCurveTo(2.6, 0, -1.5 - draw * 0.8, 8); ctx.stroke();
  ctx.strokeStyle = '#a87444';
  ctx.lineWidth = 0.4;
  ctx.beginPath(); ctx.moveTo(-1.3 - draw * 0.8, -7.6); ctx.quadraticCurveTo(2.2, 0, -1.3 - draw * 0.8, 7.6); ctx.stroke();
  // string pulled back
  const nx = -1.5 - draw * 5.5;
  ctx.strokeStyle = 'rgba(230,222,205,0.9)';
  ctx.lineWidth = 0.22;
  ctx.beginPath(); ctx.moveTo(-1.5 - draw * 0.8, -8); ctx.lineTo(nx, 0); ctx.lineTo(-1.5 - draw * 0.8, 8); ctx.stroke();
  ctx.restore();
  if (draw > 0) arrowShape(ctx, hx + Math.cos(ang) * 3, hy + Math.sin(ang) * 3, ang, 8 - (1 - draw) * 2);
}

export { wrapAngle };
