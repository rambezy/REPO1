// Turn-based combat: attack modes, to-hit, damage, criticals and the turn loop.

import { G, player } from './G';
import type { Actor, Limb, Stack } from './types';
import { ITEMS, item, type AttackKind, type DmgType, type WeaponDef } from '../data/items';
import { PROTOS } from '../data/protos';
import { SKILL_INFO, type SkillKey } from '../data/stats';
import {
  armorClass, critChance, damageResist, damageThreshold, hasTrait, isPlayer, maxAp, maxHp, meleeDamage,
  perkRank, sequence, skill, stat,
} from './character';
import { hexDist, hexLine, hexesInRange, dirTo } from '../core/hex';
import { chance, clamp, pick, rand } from '../core/rng';
import { msg, emit } from './log';
import { sfx } from '../audio/sfx';
import { fx } from '../render/fx';
import { wait, cap } from '../core/util';
import { giveXp, addKarma } from './progress';
import { removeItem, addItem } from './actors';
import { DEATH_SCRIPTS } from '../content/registry';
import { ctx } from './script';

// ------------------------------------------------------------------ helpers

export const MONSTER_TEAMS = new Set(['critter', 'raiders', 'grafted', 'machines', 'hostile']);

export function onPlayerSide(a: Actor): boolean {
  return isPlayer(a) || !!a.companion;
}

/** Whether a would attack b. */
export function hostileTo(a: Actor, b: Actor): boolean {
  if (a === b || a.dead || b.dead) return false;
  const pa = onPlayerSide(a);
  const pb = onPlayerSide(b);
  if (pa && pb) return false;
  if (pa) return b.hostile;
  if (pb) return a.hostile;
  if (a.team === b.team) return false;
  const ma = MONSTER_TEAMS.has(a.team);
  const mb = MONSTER_TEAMS.has(b.team);
  if (a.team === 'neutral' || b.team === 'neutral') return false;
  return ma !== mb || (ma && mb && (a.team === 'critter' || b.team === 'critter') && a.team !== b.team);
}

export function nameOf(a: Actor, capital = false): string {
  if (isPlayer(a)) return capital ? 'You' : 'you';
  const p = PROTOS[a.proto];
  const generic = a.name === p?.name && !a.npc;
  const n = generic ? 'the ' + a.name.toLowerCase() : a.name;
  return capital ? cap(n) : n;
}

export interface AttackMode {
  kind: AttackKind;
  ap: number;
  label: string;
  weapon: WeaponDef;
  stack: Stack | null;
  natural?: boolean;
}

const UNARMED_PUNCH: WeaponDef = { skill: 'unarmed', dmg: [1, 2], dmgType: 'normal', range: 1, modes: ['punch', 'kick'], ap: 3, minST: 1, hands: 1, melee: true, sound: 'punch', proj: 'none' };

export function weaponFor(a: Actor, hand: 0 | 1 = a.active): { w: WeaponDef; stack: Stack | null; natural: boolean } {
  const st = a.hands[hand];
  const d = st ? ITEMS[st.id] : null;
  if (d?.weapon) return { w: d.weapon, stack: st, natural: false };
  const nat = PROTOS[a.proto]?.natural;
  if (nat && !isPlayer(a)) {
    return {
      w: { skill: 'unarmed', dmg: nat.dmg, dmgType: nat.dmgType ?? 'normal', range: nat.range ?? 1, modes: ['punch'], ap: nat.ap, minST: 1, hands: 1, melee: (nat.range ?? 1) <= 1, sound: nat.dmgType === 'laser' ? 'laser' : 'punch', proj: nat.dmgType === 'laser' ? 'laser' : 'none' },
      stack: null,
      natural: true,
    };
  }
  return { w: UNARMED_PUNCH, stack: null, natural: false };
}

export function apCost(a: Actor, w: WeaponDef, kind: AttackKind): number {
  let ap = w.ap;
  if (kind === 'burst') ap = w.burstAp ?? w.ap + 1;
  if (kind === 'kick') ap = w.ap + 1;
  if (kind === 'aimed') ap += 1;
  const ranged = !w.melee;
  if (ranged && hasTrait(a, 'triggerHappy')) ap -= 1;
  if ((kind === 'single' || kind === 'aimed') && perkRank(a, 'gunslinger')) ap -= 1;
  return Math.max(1, ap);
}

const MODE_LABEL: Record<AttackKind, string> = {
  single: 'Single', aimed: 'Aimed', burst: 'Burst', swing: 'Swing', thrust: 'Thrust', throw: 'Throw', punch: 'Punch', kick: 'Kick',
};

export function attackModes(a: Actor, hand: 0 | 1 = a.active): AttackMode[] {
  const { w, stack, natural } = weaponFor(a, hand);
  let kinds = [...w.modes];
  if (hasTrait(a, 'triggerHappy')) kinds = kinds.filter((k) => k !== 'aimed');
  // Melee weapons and unarmed attacks can also be aimed.
  if (w.melee && !natural && !hasTrait(a, 'triggerHappy') && !kinds.includes('aimed')) kinds.push('aimed');
  return kinds.map((k) => ({ kind: k, ap: apCost(a, w, k), label: MODE_LABEL[k], weapon: w, stack, natural }));
}

export function currentMode(a: Actor): AttackMode {
  const modes = attackModes(a);
  return modes[Math.min(a.mode[a.active], modes.length - 1)] ?? modes[0];
}

export const LIMB_INFO: Record<Limb, { name: string; pen: number; crit: number }> = {
  head: { name: 'head', pen: 40, crit: 25 },
  eyes: { name: 'eyes', pen: 60, crit: 35 },
  torso: { name: 'torso', pen: 0, crit: 0 },
  larm: { name: 'left arm', pen: 30, crit: 10 },
  rarm: { name: 'right arm', pen: 30, crit: 10 },
  groin: { name: 'groin', pen: 30, crit: 20 },
  lleg: { name: 'left leg', pen: 20, crit: 10 },
  rleg: { name: 'right leg', pen: 20, crit: 10 },
};

export function inRange(a: Actor, t: { q: number; r: number }, w: WeaponDef): boolean {
  const d = hexDist(a, t);
  return d <= Math.max(1, w.range);
}

export function hitChance(att: Actor, tgt: Actor, mode: AttackMode, limb: Limb = 'torso'): number {
  const w = mode.weapon;
  const sk: SkillKey = w.skill;
  let c = skill(att, sk);
  let ac = armorClass(tgt);
  if (mode.stack?.ammoId) ac += ITEMS[mode.stack.ammoId]?.ammo?.acMod ?? 0;
  c += 30 - Math.max(0, ac);
  const d = hexDist(att, tgt);
  if (!w.melee) {
    const per = stat(att, 'PER') + (perkRank(att, 'eagleEye') ? 2 : 0);
    c -= 3 * Math.max(0, d - 1);
    c += (per - 5) * 3;
    if (G.map && !G.map.los(att, tgt)) c -= 30;
    if (tgt.knockedOut) c += 20;
  }
  if (att.crippled.eyes) c -= 25;
  if ((att.crippled.larm || att.crippled.rarm) && item(mode.stack?.id ?? 'knife').weapon?.hands === 2) c -= 20;
  if (mode.stack && w.minST > stat(att, 'STR')) c -= 20 * (w.minST - stat(att, 'STR'));
  if (mode.kind === 'burst') c -= 10;
  c -= LIMB_INFO[limb].pen;
  if (isPlayer(att) && G.settings.difficulty === 'easy') c += 10;
  if (!onPlayerSide(att) && G.settings.difficulty === 'hard') c += 10;
  return clamp(Math.round(c), 5, 95);
}

// ------------------------------------------------------------------ damage

interface HitResult {
  dmg: number;
  crit: boolean;
  critText?: string;
}

function rollDamage(att: Actor, tgt: Actor, mode: AttackMode, limb: Limb, crit: boolean): HitResult {
  const w = mode.weapon;
  let raw = rand(w.dmg[0], w.dmg[1]);
  if (w.melee) raw += meleeDamage(att);
  if (mode.kind === 'kick') raw += 1;
  if (mode.kind === 'thrust') raw += 1;
  const ammo = mode.stack?.ammoId ? ITEMS[mode.stack.ammoId]?.ammo : undefined;
  if (ammo) raw = Math.round((raw * ammo.mult) / ammo.div);
  let dt = damageThreshold(tgt, w.dmgType);
  let dr = damageResist(tgt, w.dmgType) + (ammo?.drMod ?? 0);
  let mult = 1;
  let critText: string | undefined;
  if (crit) {
    const roll = rand(1, 100) + (hasTrait(att, 'heavyHands') && w.melee ? -30 : 0) + (perkRank(att, 'sharpshooter') && !w.melee ? 10 : 0);
    const tough = !onPlayerSide(tgt) ? 0 : 0;
    const r = roll + tough;
    if (r > 90) {
      mult = 3;
      dt = 0;
      dr = Math.floor(dr / 2);
      critText = limb === 'head' || limb === 'eyes' ? 'in a devastating blow to the head' : 'bypassing the armor';
      if ((limb === 'head' || limb === 'eyes') && chance(50)) tgt.knockedOut = 1;
    } else if (r > 70) {
      mult = 2.5;
      dt = Math.floor(dt / 2);
      critText = 'with a vicious hit';
      applyLimbCrit(tgt, limb);
    } else if (r > 40) {
      mult = 2;
      critText = 'with a solid hit';
      if (limb !== 'torso' && limb !== 'groin') applyLimbCrit(tgt, limb);
      else if (chance(40)) tgt.knockedOut = 1;
    } else {
      mult = 1.5;
      critText = 'with a well-placed hit';
    }
  }
  const dmg = Math.max(0, Math.round((raw * mult - dt) * (1 - clamp(dr, 0, 90) / 100)));
  return { dmg, crit, critText };
}

function applyLimbCrit(t: Actor, limb: Limb) {
  if (limb === 'torso' || limb === 'groin') return;
  if (limb === 'head') {
    t.knockedOut = 1;
    return;
  }
  t.crippled[limb] = true;
  if (hasTrait(t, 'slightFrame')) t.hp -= 3;
}

function limbCripText(t: Actor, limb: Limb): string {
  if (!t.crippled[limb]) return '';
  switch (limb) {
    case 'eyes': return ' and is blinded';
    case 'larm': case 'rarm': return ' and the arm is crippled';
    case 'lleg': case 'rleg': return ' and the leg is crippled';
    default: return '';
  }
}

export function damageActor(t: Actor, dmg: number, source: Actor | null, type: DmgType = 'normal') {
  if (t.dead) return;
  t.hp -= dmg;
  t._flash = G.now;
  if (dmg > 0) fx.blood(t, Math.min(3, Math.ceil(dmg / 8)));
  if (t.hp <= 0) kill(t, source, type, dmg);
  emit('hud');
}

export function kill(t: Actor, source: Actor | null, type: DmgType = 'normal', dmg = 0) {
  if (t.dead) return;
  t.hp = Math.min(t.hp, 0);
  t.dead = true;
  t._path = undefined;
  t._move = undefined;
  const violent = type === 'explode' || type === 'plasma' || (type === 'normal' && dmg > 40);
  t._anim = { kind: 'die', t: G.now, dur: 600, data: { violent, fire: type === 'fire', laser: type === 'laser' || type === 'plasma' } };
  sfx('death');
  if (isPlayer(t)) {
    msg('You have died.');
    import('../ui/endings').then((m) => setTimeout(() => m.showEnding('death'), 1600));
    return;
  }
  msg(`${nameOf(t, true)} ${isPlayer(t) ? 'are' : 'is'} dead.`);
  if (source && isPlayer(source)) {
    const xp = PROTOS[t.proto]?.xp ?? 0;
    if (xp) giveXp(xp);
    G.state.kills[t.proto] = (G.state.kills[t.proto] ?? 0) + 1;
    if (!t.hostile && !MONSTER_TEAMS.has(t.team) && t.team !== 'critter') addKarma(-15);
    if (t.hostile && t.team === 'raiders') G.state.karma += 2;
  }
  if (t.companion) {
    G.state.flags['dead:' + t.npc] = true;
    t.companion = false;
  }
  if (t.npc) {
    G.state.flags['dead:' + t.npc] = true;
    const s = DEATH_SCRIPTS[t.npc];
    if (s) s(ctx(), t);
  }
  // Drop weapons in hands into inventory so they can be looted.
  for (let h = 0; h < 2; h++) {
    const st = t.hands[h];
    if (st) {
      t.inv.push(st);
      t.hands[h] = null;
    }
  }
  if (t.armor && !isPlayer(t)) {
    t.inv.push(t.armor);
    // Keep wearing it visually but lootable.
    (t as any)._wore = t.armor.id;
    t.armor = null;
  }
  if (G.combat) {
    // Removal from order handled by the loop.
  }
}

/** Make a whole team (on this map) hostile to the player. */
export function aggro(a: Actor) {
  if (onPlayerSide(a)) return;
  const wasHostile = a.hostile;
  a.hostile = true;
  if (G.map && !MONSTER_TEAMS.has(a.team)) {
    for (const o of G.map.actors) if (o.team === a.team && !o.dead && !o.companion) o.hostile = true;
  }
  if (!wasHostile && !MONSTER_TEAMS.has(a.team) && a.team !== 'critter' && a.team !== 'neutral') {
    G.state.flags['hostile:' + (G.map?.def.id ?? '') + ':' + a.team] = true;
  }
}

// ------------------------------------------------------------------ attacks

function consumeAmmo(att: Actor, mode: AttackMode, rounds: number): number {
  const st = mode.stack;
  if (!mode.weapon.ammo || !st) return rounds;
  const have = st.ammo ?? 0;
  const used = Math.min(have, rounds);
  st.ammo = have - used;
  return used;
}

export function needsReload(a: Actor, mode: AttackMode): boolean {
  if (!mode.weapon.ammo || !mode.stack) return false;
  return (mode.stack.ammo ?? 0) <= 0;
}

export function reload(a: Actor, hand: 0 | 1 = a.active): boolean {
  const st = a.hands[hand];
  if (!st) return false;
  const w = ITEMS[st.id]?.weapon;
  if (!w?.ammo || !w.mag) return false;
  const need = w.mag - (st.ammo ?? 0);
  if (need <= 0) return false;
  // Accept any matching ammo type (only one per caliber for now).
  const ammoId = w.ammo;
  const have = a.inv.filter((s) => s.id === ammoId).reduce((n, s) => n + s.n, 0);
  if (have <= 0) return false;
  const take = Math.min(need, have);
  removeItem(a, ammoId, take);
  st.ammo = (st.ammo ?? 0) + take;
  st.ammoId = ammoId;
  if (isPlayer(a)) msg(`You reload the ${ITEMS[st.id].name.toLowerCase()}.`);
  sfx('click');
  return true;
}

export function reloadAp(a: Actor): number {
  return perkRank(a, 'quickHands') ? 1 : 2;
}

/**
 * Perform an attack. Spends AP (in combat), animates and resolves.
 * `target` may be an actor or, for thrown explosives, a hex.
 */
export async function attack(att: Actor, tgt: Actor, mode: AttackMode, limb: Limb = 'torso'): Promise<boolean> {
  const w = mode.weapon;
  if (att.dead || tgt.dead) return false;
  if (!inRange(att, tgt, w)) {
    if (isPlayer(att)) msg('Target out of range.');
    return false;
  }
  if (!w.melee && G.map && !G.map.los(att, tgt)) {
    if (isPlayer(att)) msg('You cannot see a clear shot.');
    return false;
  }
  if (needsReload(att, mode)) {
    if (isPlayer(att)) msg('Out of ammo. Reload first.');
    return false;
  }
  if (G.combat) {
    if ((att._ap ?? 0) < mode.ap) {
      if (isPlayer(att)) msg('Not enough action points.');
      return false;
    }
    att._ap! -= mode.ap;
  }
  att.facing = dirTo(att, tgt);
  if (!G.combat && !onPlayerSide(tgt)) {
    aggro(tgt);
  }
  if (!onPlayerSide(tgt) && onPlayerSide(att)) aggro(tgt);
  if (onPlayerSide(tgt) && !onPlayerSide(att)) att.hostile = true;

  const speed = G.settings.combatSpeed;
  att._anim = { kind: w.melee ? 'melee' : w.thrown ? 'throw' : 'shoot', t: G.now, dur: 350 / speed };
  sfx(w.sound ?? 'punch');
  await wait(180 / speed);

  if (mode.kind === 'throw' && w.thrown) return throwAt(att, tgt, mode);

  const bullets = mode.kind === 'burst' ? consumeAmmo(att, mode, w.burst ?? 5) : consumeAmmo(att, mode, 1);
  if (bullets <= 0) return false;

  const pChance = hitChance(att, tgt, mode, limb);
  const cc = critChance(att) + LIMB_INFO[limb].crit + (limb !== 'torso' ? 5 : 0);

  if (w.proj && w.proj !== 'none') await fx.projectile(att, tgt, w.proj, mode.kind === 'burst');

  if (mode.kind === 'burst') {
    let hits = 0;
    let total = 0;
    let crits = 0;
    const bystanders = G.map!.livingActors().filter((o) => o !== att && o !== tgt && hexDist(o, tgt) <= 1);
    for (let i = 0; i < bullets; i++) {
      if (tgt.dead) break;
      if (chance(pChance)) {
        const crit = chance(cc / 2);
        const r = rollDamage(att, tgt, mode, 'torso', crit);
        total += r.dmg;
        hits++;
        if (crit) crits++;
      } else if (bystanders.length && chance(25)) {
        const b = pick(bystanders);
        const r = rollDamage(att, b, mode, 'torso', false);
        if (r.dmg > 0) {
          msg(`${nameOf(b, true)} ${isPlayer(b) ? 'are' : 'is'} caught in the burst for ${r.dmg} hit points.`);
          if (!onPlayerSide(b) && onPlayerSide(att)) aggro(b);
          damageActor(b, r.dmg, att, w.dmgType);
        }
      }
    }
    if (hits === 0) {
      sfx('miss');
      msg(`${nameOf(att, true)} ${isPlayer(att) ? 'miss' : 'misses'} ${nameOf(tgt)}.`);
    } else {
      sfx(crits ? 'crit' : 'hit');
      msg(`${nameOf(att, true)} ${isPlayer(att) ? 'hit' : 'hits'} ${nameOf(tgt)} ${hits} time${hits > 1 ? 's' : ''} for ${total} hit points${crits ? ', critically' : ''}.`);
      tgt._anim = { kind: 'hit', t: G.now, dur: 300 };
      damageActor(tgt, total, att, w.dmgType);
    }
    await wait(250 / speed);
    return true;
  }

  // Shotgun pellets: modest extra damage roll.
  const roll = rand(1, 100);
  const hit = roll <= pChance;
  if (!hit) {
    const fumble = roll > 95 && chance(Math.max(5, 30 - stat(att, 'LCK') * 3) + (hasTrait(att, 'lucky') ? 15 : 0));
    sfx('miss');
    if (fumble && G.combat) {
      att._ap = 0;
      msg(`${nameOf(att, true)} ${isPlayer(att) ? 'fumble' : 'fumbles'} the attack and ${isPlayer(att) ? 'lose' : 'loses'} the rest of the turn.`);
    } else {
      msg(`${nameOf(att, true)} ${isPlayer(att) ? 'miss' : 'misses'} ${nameOf(tgt)}.`);
    }
    // Stray shots may hit someone else on the line.
    if (!w.melee && G.map) {
      const line = hexLine(att, tgt);
      for (let i = 1; i < line.length - 1; i++) {
        const o = G.map.actorAt(line[i].q, line[i].r);
        if (o && chance(30)) {
          const r = rollDamage(att, o, mode, 'torso', false);
          msg(`The stray shot hits ${nameOf(o)} for ${r.dmg} hit points.`);
          if (!onPlayerSide(o) && onPlayerSide(att)) aggro(o);
          damageActor(o, r.dmg, att, w.dmgType);
          break;
        }
      }
    }
    await wait(200 / speed);
    return true;
  }
  const crit = chance(cc) || (tgt.knockedOut ? chance(30) : false);
  const r = rollDamage(att, tgt, mode, limb, crit);
  if (w.spread) r.dmg += rand(0, w.spread * 2);
  const where = limb !== 'torso' ? ` in the ${LIMB_INFO[limb].name}` : '';
  const verb = isPlayer(att) ? 'hit' : 'hits';
  let text: string;
  if (r.crit) {
    text = `${nameOf(att, true)} critically ${verb} ${nameOf(tgt)}${where} ${r.critText} for ${r.dmg} hit points${limbCripText(tgt, limb)}.`;
    sfx('crit');
    fx.shake(4);
  } else if (r.dmg <= 0) {
    text = `${nameOf(att, true)} ${verb} ${nameOf(tgt)}${where}, but the blow glances off harmlessly.`;
    sfx('hit');
  } else {
    text = `${nameOf(att, true)} ${verb} ${nameOf(tgt)}${where} for ${r.dmg} hit points.`;
    sfx('hit');
  }
  if (tgt.knockedOut && r.crit && !tgt.dead) text += ` ${nameOf(tgt, true)} ${isPlayer(tgt) ? 'are' : 'is'} knocked down.`;
  msg(text);
  tgt._anim = { kind: 'hit', t: G.now, dur: 300 };
  fx.float(tgt, String(r.dmg), r.crit ? '#ff5a3a' : '#ffd24a');
  // Venom from natural attacks.
  const nat = PROTOS[att.proto]?.natural;
  if (mode.natural && nat?.poison && r.dmg > 0 && !chance(stat(tgt, 'END') * 5)) {
    tgt.poison += nat.poison;
    if (isPlayer(tgt)) msg('You have been poisoned!');
  }
  damageActor(tgt, r.dmg, att, w.dmgType);
  if (w.radius && G.map) await explode(att, tgt, mode);
  await wait(200 / speed);
  return true;
}

async function throwAt(att: Actor, tgt: Actor, mode: AttackMode): Promise<boolean> {
  const w = mode.weapon;
  const st = mode.stack!;
  const id = st.id;
  // Consume the thrown item from hand (stackable in inventory refills the hand).
  const more = att.inv.find((s) => s.id === id);
  if (more) {
    removeItem(att, id, 1);
  } else {
    att.hands[att.active] = null;
  }
  const pChance = hitChance(att, tgt, mode);
  const hit = chance(pChance);
  let land = { q: tgt.q, r: tgt.r };
  if (!hit) {
    const around = hexesInRange(tgt, 2).filter((h) => G.map!.walkable(h.q, h.r));
    land = around.length ? pick(around) : land;
  }
  await fx.projectile(att, land, 'thrown', false, id);
  if (w.radius) {
    await explodeAt(att, land, mode);
    return true;
  }
  if (hit) {
    const r = rollDamage(att, tgt, mode, 'torso', chance(critChance(att)));
    msg(`${nameOf(att, true)} ${isPlayer(att) ? 'hit' : 'hits'} ${nameOf(tgt)} for ${r.dmg} hit points.`);
    damageActor(tgt, r.dmg, att, w.dmgType);
  } else {
    msg(`${nameOf(att, true)} ${isPlayer(att) ? 'miss' : 'misses'} ${nameOf(tgt)}.`);
  }
  G.map!.dropItem(land.q, land.r, id, 1);
  return true;
}

async function explode(att: Actor, tgt: Actor, mode: AttackMode) {
  await explodeAt(att, { q: tgt.q, r: tgt.r }, mode, tgt);
}

export async function explodeAt(att: Actor | null, at: { q: number; r: number }, mode: { weapon: WeaponDef; stack: Stack | null } & Partial<AttackMode>, skip?: Actor) {
  const w = mode.weapon;
  const radius = w.radius ?? 1;
  sfx(w.dmgType === 'fire' ? 'flame' : 'explode');
  fx.shake(8);
  await fx.explosion(at, radius, w.dmgType === 'fire');
  for (const o of G.map!.livingActors()) {
    if (o === skip) continue;
    const d = hexDist(o, at);
    if (d > radius) continue;
    let raw = rand(w.dmg[0], w.dmg[1]);
    if (d > 0) raw = Math.round(raw * (1 - d / (radius + 1)));
    const dt = damageThreshold(o, w.dmgType);
    const dr = damageResist(o, w.dmgType);
    const dmg = Math.max(0, Math.round((raw - dt) * (1 - dr / 100)));
    msg(`${nameOf(o, true)} ${isPlayer(o) ? 'are' : 'is'} caught in the blast for ${dmg} hit points.`);
    if (att && !onPlayerSide(o) && onPlayerSide(att)) aggro(o);
    damageActor(o, dmg, att, w.dmgType);
  }
}

// ------------------------------------------------------------------ combat flow

let playerTurnResolve: (() => void) | null = null;

export function inCombat(): boolean {
  return !!G.combat;
}

function combatants(): Actor[] {
  const p = player();
  const m = G.map!;
  const out: Actor[] = [];
  for (const a of m.livingActors()) {
    if (onPlayerSide(a)) {
      out.push(a);
      continue;
    }
    if (hexDist(a, p) > 30) continue;
    // Any actor hostile to someone on the player's side, or to another combatant.
    if (a.hostile) out.push(a);
    else if (m.livingActors().some((b) => b !== a && hostileTo(a, b) && hexDist(a, b) < 16 && (b.hostile || onPlayerSide(b)))) out.push(a);
  }
  return out;
}

export function startCombat(initiator?: Actor) {
  if (G.combat || !G.map) return;
  const p = player();
  if (p.dead) return;
  const order = combatants();
  if (!order.some((a) => !onPlayerSide(a) && order.some((b) => hostileTo(a, b)))) return;
  for (const a of order) {
    a._path = undefined;
    a._ap = maxAp(a);
    a._acBonus = hasTrait(a, 'deliberate') ? 5 : 0;
  }
  order.sort((a, b) => sequence(b) - sequence(a) + (Math.random() - 0.5) * 0.1);
  if (initiator) {
    const i = order.indexOf(initiator);
    if (i > 0) {
      order.splice(i, 1);
      order.unshift(initiator);
    }
  }
  G.combat = { order, turn: 0, round: 1, busy: false, playerTurn: false };
  msg('Combat!');
  sfx('encounter');
  emit('combat', true);
  runCombat();
}

async function runCombat() {
  const c = G.combat!;
  await wait(400);
  while (G.combat === c) {
    const a = c.order[c.turn];
    if (a && !a.dead && G.map?.actors.includes(a)) {
      a._ap = maxAp(a);
      a._acBonus = 0;
      emit('turn', a);
      if (a.knockedOut) {
        a.knockedOut = 0;
        a._ap = Math.floor(a._ap / 2);
        msg(`${nameOf(a, true)} ${isPlayer(a) ? 'get' : 'gets'} back up.`);
      }
      if (isPlayer(a)) {
        c.playerTurn = true;
        emit('hud');
        fx.focus(a);
        await new Promise<void>((res) => (playerTurnResolve = res));
        playerTurnResolve = null;
        c.playerTurn = false;
      } else {
        const { aiTurn } = await import('./ai');
        await aiTurn(a);
      }
      a._acBonus = Math.max(0, a._ap ?? 0);
      emit('hud');
    }
    if (G.combat !== c) return;
    if (checkCombatOver()) return;
    c.turn++;
    if (c.turn >= c.order.length) {
      c.turn = 0;
      c.round++;
      // Pull in newly involved actors, drop the dead.
      const fresh = combatants().filter((x) => !c.order.includes(x));
      for (const f of fresh) {
        f._ap = maxAp(f);
        c.order.push(f);
      }
      c.order = c.order.filter((x) => !x.dead && G.map?.actors.includes(x));
      advanceCombatTime();
    }
  }
}

function advanceCombatTime() {
  import('./time').then((t) => t.advanceTime(0.1));
}

export function endPlayerTurn() {
  if (G.combat?.playerTurn && !G.combat.busy && playerTurnResolve) playerTurnResolve();
}

/** True when no one on the map is still fighting the player's side. */
export function enemiesRemain(): boolean {
  if (!G.map) return false;
  const p = player();
  return G.map.livingActors().some((a) => {
    if (onPlayerSide(a)) return false;
    if (!a.hostile && !G.combat?.order.includes(a)) return false;
    if (!a.hostile) {
      // Neutral fighting monsters: combat continues while they fight nearby.
      return G.map!.livingActors().some((b) => hostileTo(a, b) && hexDist(a, b) < 12 && G.combat?.order.includes(b));
    }
    const d = hexDist(a, p);
    return d < 20 && (G.map!.los(a, p) || d < 8);
  });
}

export function checkCombatOver(): boolean {
  if (!G.combat) return true;
  if (player().dead) {
    G.combat = null;
    emit('combat', false);
    return true;
  }
  if (!enemiesRemain()) {
    endCombat();
    return true;
  }
  return false;
}

export function endCombat() {
  if (!G.combat) return;
  for (const a of G.combat.order) {
    a._acBonus = 0;
    a._ap = undefined;
    a.knockedOut = 0;
  }
  G.combat = null;
  playerTurnResolve?.();
  playerTurnResolve = null;
  msg('Combat is over.');
  emit('combat', false);
  emit('hud');
}

export function tryEndCombat() {
  if (!G.combat?.playerTurn) return;
  if (enemiesRemain()) {
    msg('You cannot end combat with enemies nearby.');
    return;
  }
  endCombat();
}

/** Hit points as a word, like looking at someone. */
export function woundText(a: Actor): string {
  const f = a.hp / maxHp(a);
  if (a.dead) return 'dead';
  if (f >= 1) return 'unhurt';
  if (f > 0.75) return 'slightly wounded';
  if (f > 0.5) return 'wounded';
  if (f > 0.25) return 'severely wounded';
  return 'almost dead';
}

export function giveNaturalAmmo(a: Actor) {
  // Reload NPC weapons from inventory, or give a mag so they can shoot once.
  for (const h of [0, 1] as const) {
    const st = a.hands[h];
    const w = st && ITEMS[st.id]?.weapon;
    if (st && w?.ammo && (st.ammo ?? 0) === 0) {
      if (!reload(a, h)) {
        addItem(a, w.ammo, Math.min(w.mag ?? 6, 12));
        reload(a, h);
      }
    }
  }
}
