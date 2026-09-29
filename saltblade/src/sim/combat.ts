// Melee and crossbow combat. Blows are blocked or dodged by skill, land on a
// body part, are reduced by armour and toughness, and cause bleeding,
// knockdowns and knock-outs. Everyone learns from every exchange.
import { Char } from './char';
import { LI, HIT_WEIGHTS } from './body';
import { ANIMAL } from '../content/animals';
import { RACE, isHuman } from '../content/races';
import { ITEM, GRADES } from '../content/items';
import { FACTION, MACHINE_KIN } from '../content/factions';
import { S } from './ctx';
import { train, versus } from './train';
import { severLimb, isKOCondition, knockOut } from './health';
import { angleTo, wrapAngle, clamp } from '../core/math';
import { buildingAt } from './structures';

export const RADIUS = 0.38;

export function dist(a: Char, b: Char) { return Math.hypot(a.x - b.x, a.z - b.z); }

export function reach(c: Char) {
  const w = c.weaponStats();
  let r = w.reach + RADIUS * 2;
  if (c.animal) r = ANIMAL[c.animal].attack.reach * (0.7 + 0.3 * ANIMAL[c.animal].size) + RADIUS * 2;
  return r;
}

/** Would a think this b is an enemy right now? */
export function hostile(a: Char, b: Char): boolean {
  if (a === b || !b.alive) return false;
  if (a.faction === b.faction) return false;
  const W = S.W;
  // wild beasts (tame ones take their owner's side, below)
  if (a.animal && a.faction !== 'player') {
    const d = ANIMAL[a.animal];
    if (b.animal) return false;
    if (d.diet === 'machine' && MACHINE_KIN.includes(b.faction)) return false; // the Makers' machines keep to their own
    return d.diet === 'predator' || d.diet === 'machine' || d.diet === 'scavenger' ? true : !!a.mem.provoked;
  }
  if (b.animal && b.faction !== 'player') {
    const d = ANIMAL[b.animal];
    if (d.diet === 'machine' && MACHINE_KIN.includes(a.faction)) return false;
    return d.diet === 'predator' || d.diet === 'machine' || (d.diet === 'scavenger' && !!b.mem.provoked) || !!b.mem.provoked;
  }
  if (a.animal || b.animal) return W.rel.hostile(a.faction, b.faction) || (!!a.mem.enemies && a.mem.enemies.includes(b.id));
  // named people will talk before they fight
  if (a.unique && b.faction === 'player' && !(a.mem.enemies && a.mem.enemies.includes(b.id))) return false;
  if (b.unique && a.faction === 'player' && !(b.mem.enemies && b.mem.enemies.includes(a.id)) && b.lastHitBy !== a.id) return false;
  if (W.rel.hostile(a.faction, b.faction)) return true;
  // the Covenant does not suffer machines, and hunts other peoples on its own land
  if (a.faction === 'ember' && a.role !== 'slave' && !a.unique) {
    if (b.robot) return true;
    const br = RACE[b.look.race]?.race;
    if ((br === 'karuk' || br === 'thrum') && a.mem.zealous !== false) {
      const reg = S.T.regionAt(b.x, b.z).key;
      if (reg === 'ember') return true;
    }
  }
  // law: guards chase wanted people
  if ((a.role === 'guard' || a.role === 'patrol') && (b.bounty[a.faction] ?? 0) > 0) return true;
  // personal grudges
  if (a.mem.enemies && a.mem.enemies.includes(b.id)) return true;
  if (b.mem.enemies && b.mem.enemies.includes(a.id) && a.squad === b.squad) return false;
  return false;
}

export function canBlock(d: Char, a: Char) {
  if (!d.up || d.knockT > 0 || d.stagger > 0.2 || d.animal) return false;
  if (d.atk && d.atk.t > 0.25) return false;
  if (!d.hasArms()) return false;
  const facing = Math.abs(wrapAngle(angleTo(d.x, d.z, a.x, a.z) - d.dir));
  if (facing > 1.9) return false;
  const w = d.weaponStats();
  if (w.kind === 'unarmed' && d.skill('unarmed') < 15) return false;
  return true;
}

export function startAttack(c: Char, t: Char, kick = false) {
  const dur = c.attackTime() * (kick ? 1.1 : 1) * (1 + cramped(c));
  c.atk = { t: 0, dur, variant: S.rng.int(0, 3), hit: false, target: t.id, kick };
  c.drawn = true;
  c.dir = angleTo(c.x, c.z, t.x, t.z);
  // a metal limb whirs as it drives the blow
  const b = c.body;
  if (kick ? b.prostOK(LI.rleg) || b.prostOK(LI.lleg) : b.prostOK(LI.rarm) || b.prostOK(LI.larm)) S.fx.sound('servo', c.x, c.z, 0.45);
}

/** Advances an attack in progress; resolves the blow at the strike moment. */
export function tickAttack(c: Char, dt: number) {
  const a = c.atk;
  if (!a) return;
  a.t += dt / a.dur;
  const t = S.W.char(a.target);
  if (t && a.t < 0.5) c.dir = turn(c.dir, angleTo(c.x, c.z, t.x, t.z), dt * 8);
  if (!a.hit && a.t >= 0.5) {
    a.hit = true;
    if (t && t.alive && dist(c, t) <= reach(c) + 0.5) resolveBlow(c, t, a.variant, !!a.kick);
    else S.fx.sound('whiff', c.x, c.z, 0.5);
  }
  if (a.t >= 1) {
    c.atk = null;
    c.atkCD = S.rng.range(0.05, 0.35);
  }
}

function turn(a: number, b: number, step: number) {
  const d = wrapAngle(b - a);
  return Math.abs(d) <= step ? b : a + Math.sign(d) * step;
}

function pickLimb(d: Char, variant: number, attacker: Char): number {
  const w = HIT_WEIGHTS.slice();
  if (variant === 0) { w[0] *= 1.8; w[1] *= 1.3; }
  if (variant === 3) { w[5] *= 1.6; w[6] *= 1.6; }
  if (attacker.animal && ANIMAL[attacker.animal].size < 1.1) { w[5] *= 2; w[6] *= 2; w[0] *= 0.5; }
  if (d.status !== 'up' || d.knockT > 0) { w[1] *= 1.5; w[0] *= 1.2; }
  for (let l = 0; l < 7; l++) if (!d.body.has(l) && !d.body.prost[l]) w[l] = 0; // a prosthetic takes blows like the limb it replaced
  let tot = 0;
  for (const x of w) tot += x;
  let r = S.rng.next() * tot;
  for (let l = 0; l < 7; l++) { r -= w[l]; if (r <= 0) return l; }
  return 1;
}

/** Within 25 m of their own faction's banner, people fight a little better. */
export const BANNER_R = 25;
export function colours(c: Char) {
  if (c.animal) return 0;
  let near = false;
  S.W.objHash.near(c.x, c.z, BANNER_R, (o) => { if (!near && o.kind === 'banner' && o.owner === c.faction && Math.hypot(o.x - c.x, o.z - c.z) < BANNER_R) near = true; });
  return near ? 5 : 0;
}

/** Long and heavy weapons are clumsy inside a building: their `indoor` penalty, or nothing. */
export function cramped(c: Char) {
  const w = c.weaponStats();
  return w.indoor && buildingAt(c.x, c.z) ? w.indoor : 0;
}

export function resolveBlow(a: Char, d: Char, variant: number, kick = false) {
  const w = a.weaponStats();
  const wskill = a.animal ? a.skill('melee_atk') : a.skill(w.skill);
  const att = (a.skill('melee_atk') * 0.6 + wskill * 0.4 + colours(a)) * (1 - cramped(a));
  const dw = d.weaponStats();
  let def = d.skill('melee_def') * 0.7 + (d.animal ? d.skill('melee_def') * 0.3 : d.skill(dw.skill) * 0.3) + (dw.def ?? 0) + colours(d);
  if (d.combatMode === 'defensive') def += 8;
  if (d.eq.back && ITEM[d.eq.back.id].pack) def -= ITEM[d.eq.back.id].pack!.combat * 40;
  const downed = d.status !== 'up' || d.knockT > 0;
  // block
  if (!downed && canBlock(d, a)) {
    const p = clamp(0.5 + (def - att) * 0.018, 0.05, 0.9);
    if (S.rng.chance(p)) {
      d.act = 'block'; d.actT = 0; d.actDur = 0.45;
      d.blockT = 0.4;
      train(d, 'melee_def', 1, versus(def, att));
      train(a, 'melee_atk', 0.5, versus(att, def));
      // some force still comes through a block
      const leak = w.blunt * 0.12 * GRADESMUL(a) + w.cut * 0.03;
      if (leak > 1) applyDamage(d, S.rng.chance(0.5) ? LI.larm : LI.rarm, 0, leak, a, 1, false);
      S.fx.hit(d, a, 0, true, -1);
      S.fx.sound(w.kind === 'claw' ? 'thud' : 'clang', d.x, d.z);
      if (w.knock && S.rng.chance(w.knock * 0.3 * (a.skill('strength') / Math.max(10, d.skill('strength'))))) d.stagger = 0.5;
      return;
    }
  }
  // dodge
  if (!downed) {
    const dodge = d.skill('dodge') * 0.003 * (1 - d.armourPenalty('dex')) + (d.weaponStats().kind === 'unarmed' ? d.skill('unarmed') * 0.002 : 0) + (d.animal ? d.skill('dodge') * 0.003 : 0);
    if (S.rng.chance(Math.min(0.45, dodge))) {
      d.act = 'dodge'; d.actT = 0; d.actDur = 0.5; d.actVar = S.rng.int(0, 1);
      train(d, 'dodge', 1, versus(d.skill('dodge'), att));
      S.fx.sound('whiff', d.x, d.z, 0.6);
      return;
    }
  }
  // it lands
  const limb = pickLimb(d, variant, a);
  const g = GRADESMUL(a);
  let cut = w.cut * g, blunt = w.blunt * g;
  if (a.animal) {
    const s = 0.6 + a.skill('melee_atk') * 0.008 + a.skill('dexterity') * 0.002;
    cut *= s; blunt *= s * (0.8 + a.skill('strength') * 0.006);
  } else if (w.kind === 'unarmed') {
    const m = (0.3 + a.skill('unarmed') * 0.028) * (1 - a.armourPenalty('martial'));
    blunt = 14 * m * (kick ? 1.3 : 1);
    cut = 0;
  } else {
    const heavy = w.weight > 10;
    cut *= 0.58 + wskill * 0.008 + a.skill('dexterity') * (heavy ? 0.001 : 0.003);
    blunt *= 0.58 + wskill * 0.006 + a.skill('strength') * (heavy ? 0.006 : 0.003);
  }
  // who is being hit
  // steel beasts count as machines, not animals
  if (d.robot) { cut *= w.vsRobot; blunt *= w.vsRobot; }
  else if (d.animal) { cut *= w.vsAnimal; blunt *= w.vsAnimal; }
  else { cut *= w.vsHuman; blunt *= w.vsHuman; }
  if (downed && !a.animal) { cut *= 1.2; blunt *= 1.2; }
  applyDamage(d, limb, cut, blunt, a, w.bleed, true, w.pierce);
  // learning
  const dif = versus(att, def);
  if (!a.animal) {
    if (w.kind === 'unarmed') train(a, 'unarmed', 1.2, dif);
    else train(a, w.skill, 1, dif);
    train(a, 'melee_atk', 0.7, dif);
    if (w.weight > 8) train(a, 'strength', 0.5, dif); else train(a, 'dexterity', 0.4, dif);
  }
  // knockdown
  if (w.knock && d.status === 'up' && !downed) {
    const p = w.knock * (0.6 + a.skill('strength') / 100) * (1 - d.skill('toughness') / 220);
    if (S.rng.chance(p)) {
      d.knockT = S.rng.range(1.8, 3.2);
      d.atk = null;
      S.fx.sound('thud', d.x, d.z);
    }
  }
  if (d.status === 'up') {
    d.act = 'hit'; d.actT = 0; d.actDur = 0.35;
    if (d.atk && d.atk.t < 0.45 && S.rng.chance(0.5)) d.atk = null; // interrupted
    d.stagger = 0.25;
  }
  // provoke beasts and remember who hit
  d.lastHitBy = a.id;
  d.lastHitT = S.time;
  if (d.animal) d.mem.provoked = true;
}

function GRADESMUL(a: Char) {
  if (a.animal || !a.eq.weapon) return 1;
  return GRADES[a.eq.weapon.q].dmg;
}

/** Applies damage to a body part after armour and toughness. */
/** The most one body part can bleed, in blood a second. */
const BLEED_CAP = 0.9;

export function applyDamage(d: Char, limb: number, cut: number, blunt: number, by: Char | null, bleedMul = 1, fx = true, pierce = 0) {
  const b = d.body;
  const [ac, ab] = d.armourAt(limb);
  const cutIn = cut * (1 - ac * (1 - pierce));
  const stopped = cut - cutIn;
  let bl = blunt * (1 - ab * (1 - pierce * 0.5)) + stopped * 0.3;
  let ct = cutIn;
  const tough = 1 - Math.min(0.5, d.skill('toughness') * 0.003);
  ct *= tough; bl *= tough;
  const dmg = ct + bl;
  const prost = b.isProst(limb);
  const was = b.hp[limb];
  b.hp[limb] -= dmg;
  // wounds on one part run together: past a point more cuts there tear the same flesh, not new veins
  if (!b.robotic && !prost) b.bleed[limb] = Math.min(BLEED_CAP, b.bleed[limb] + ct * 0.013 * bleedMul * (RACE[d.look.race]?.bleed ?? 1) * (d.animal ? ANIMAL[d.animal].bleedMul ?? 1 : 1));
  // toughness grows from punishment
  if (!d.animal && dmg > 2) train(d, 'toughness', dmg / 14 * (prost ? 0.5 : 1), by ? versus(d.skill('toughness'), by.skill('strength') + 10) : 1);
  if (prost) {
    // metal does not come off: it buckles, seizes and stops until someone mends it
    b.hp[limb] = Math.max(b.hp[limb], -b.max[limb]);
    if (was > 0 && b.hp[limb] <= 0) {
      S.fx.notice(`${d.name}'s ${ITEM[b.prost[limb]!]?.name.toLowerCase() ?? 'prosthetic'} is wrecked!`, d.faction === 'player' ? 'bad' : 'combat');
      S.fx.sound('powerdown', d.x, d.z, 0.7);
      S.fx.burst('sparks', d.x, d.y + (limb >= 5 ? 0.45 : 1.15), d.z, 18);
      S.fx.burst('smoke', d.x, d.y + (limb >= 5 ? 0.45 : 1.15), d.z, 4);
      d.dirty = true;
    }
  } else if (limb >= 3 && b.hp[limb] <= -b.max[limb]) {
    // severing: a limb beaten past its maximum can come off
    b.hp[limb] = -b.max[limb];
    const heavy = by && (by.weaponStats().weight > 12 || (by.animal && ANIMAL[by.animal].power > 80));
    if (S.rng.chance(heavy ? 0.35 : ct > 20 ? 0.18 : 0.04)) severLimb(d, limb);
  }
  if (limb < 3) b.hp[limb] = Math.max(b.hp[limb], -b.max[limb] * 1.05);
  if (fx) {
    S.fx.hit(d, by ?? d, dmg, false, limb);
    S.fx.sound(by?.animal && by.weaponStats().kind === 'claw' ? 'bite' : ct > bl ? 'cut' : 'blunt', d.x, d.z, Math.min(1, 0.4 + dmg / 30));
  }
  if (d.status === 'up' && isKOCondition(d)) {
    knockOut(d);
    if (by) {
      by.stats.kos++;
      onKnockedOut(d, by);
    }
  }
}

/** Relations shift when people are hurt. */
function onKnockedOut(d: Char, by: Char) {
  if (by.faction === 'player' && d.faction !== 'player' && !d.animal) {
    const f = FACTION[d.faction];
    if (f && f.attitude !== 'bandit' && f.attitude !== 'predator' && f.attitude !== 'machine') S.W.rel.add('player', d.faction, -2);
  }
}

// ---------------------------------------------------------------- crossbows
/** Ammunition for the ranged weapon in hand: bolts, energy cells, or nothing at all for a machine's own emitter. */
export function hasBolts(c: Char) {
  const r = c.eq.ranged ? ITEM[c.eq.ranged.id].ranged : null;
  if (r && !r.ammo) return true;
  const ammo = r?.ammo ?? 'bolts';
  return c.inv.count(ammo) > 0 || (c.eq.back?.inv?.count(ammo) ?? 0) > 0;
}

export function canShoot(c: Char) {
  return !!c.eq.ranged && hasBolts(c) && c.hasArms() && c.body.armOK(LI.larm) && c.body.armOK(LI.rarm);
}

export function rangedStats(c: Char) {
  return c.eq.ranged ? ITEM[c.eq.ranged.id].ranged! : null;
}

/** Fires at a target if loaded; returns true if a shot was taken. `from` is where the line of fire starts (a tower's edge). */
export function shoot(c: Char, t: Char, from?: [number, number]): boolean {
  const r = rangedStats(c);
  if (!r || c.reload > 0 || !hasBolts(c)) return false;
  const d = dist(c, t);
  if (d > r.range) return false;
  if (!S.nav.clearLine(from?.[0] ?? c.x, from?.[1] ?? c.z, t.x, t.z)) return false;
  if (r.ammo) (c.inv.take(r.ammo, 1) || c.eq.back?.inv?.take(r.ammo, 1));
  c.dir = angleTo(c.x, c.z, t.x, t.z);
  c.act = 'shoot'; c.actT = 0; c.actDur = 0.4;
  const g = GRADES[c.eq.ranged!.q].dmg;
  const skill = c.skill('precision') * 0.005 + c.skill('perception') * 0.002;
  const moving = t.speed > 1 ? 0.8 : 1;
  const p = clamp(r.accuracy * (0.45 + skill) * (1 - (d / r.range) * 0.5) * moving * (t.status === 'up' ? 1 : 1.3), 0.05, 0.95);
  const hit = S.rng.chance(p);
  S.fx.shot(c, t.x, t.z, hit, r.energy ? 'laser' : 'bolt');
  S.fx.sound(r.energy ? 'laser' : 'twang', c.x, c.z);
  train(c, 'precision', 0.6, d / 30);
  train(c, 'perception', 0.3, 1);
  c.reload = r.reload * (1.45 - c.skill('crossbows') * 0.0065) * (c.skill('strength') < 20 ? 1.2 : 1);
  if (hit) {
    const k = 0.7 + c.skill('crossbows') * 0.004;
    // a beam burns through armour and sears the wound it makes
    applyDamage(t, pickLimb(t, 0, c), r.cut * g * k, r.blunt * g * k, c, r.energy ? 0.4 : 1.1, true, r.energy ? 0.35 : 0.15);
    t.lastHitBy = c.id;
    t.lastHitT = S.time;
    if (t.animal) t.mem.provoked = true;
  }
  return true;
}

/** A machine beast's beam: no ammunition, only a recharge. True if it fired. */
export function beastLaser(c: Char, t: Char): boolean {
  const L = c.animal ? ANIMAL[c.animal].laser : undefined;
  if (!L || c.reload > 0) return false;
  const d = dist(c, t);
  if (d > L.range || !S.nav.clearLine(c.x, c.z, t.x, t.z)) return false;
  c.dir = angleTo(c.x, c.z, t.x, t.z);
  const moving = t.speed > 1 ? 0.8 : 1;
  const p = clamp(L.acc * (0.55 + c.skill('dexterity') * 0.004) * (1 - (d / L.range) * 0.45) * moving * (t.status === 'up' ? 1 : 1.3), 0.05, 0.95);
  const hit = S.rng.chance(p);
  S.fx.shot(c, t.x, t.z, hit, L.heavy ? 'heavy' : 'laser');
  S.fx.sound('laser', c.x, c.z, L.heavy ? 1 : 0.7);
  c.reload = L.reload * S.rng.range(0.9, 1.15);
  if (hit) {
    applyDamage(t, pickLimb(t, 0, c), L.cut, 0, c, 0.4, true, 0.35);
    t.lastHitBy = c.id;
    t.lastHitT = S.time;
  }
  return true;
}

export function tickReload(c: Char, dt: number) {
  if (c.reload > 0) {
    const before = c.reload;
    c.reload = Math.max(0, c.reload - dt);
    if (c.animal) return; // a beast's beam recharging: nothing to wind, nothing to learn
    if (before > 0.3 && c.reload <= 0.3) { c.act = 'reload'; c.actT = 0; c.actDur = 0.5; }
    if (c.reload === 0) train(c, 'crossbows', 0.4, 1);
  }
}

/** Squad strength for decisions about attacking, fleeing and demanding. */
export function strengthOf(chars: Char[]) {
  let s = 0;
  for (const c of chars) if (c.up) s += c.power();
  return s;
}

export const humanLike = (c: Char) => !c.animal && isHuman(c.look.race);
