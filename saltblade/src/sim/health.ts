// Bleeding, knock-outs, death, natural healing, hunger and first aid.
import { Char } from './char';
import { Body, LI, LIMB_NAMES } from './body';
import { RACE } from '../content/races';
import { ITEM } from '../content/items';
import { RATE } from './clock';
import { S } from './ctx';
import { train } from './train';
import type { Grid, Item } from './inventory';
import { bedRest } from './use';
import { machineSay } from './machines';

export function koThreshold(c: Char, limb: number) {
  const t = c.skill('toughness');
  return -c.body.max[limb] * Math.min(0.85, t / 115);
}

export function isKOCondition(c: Char) {
  const b = c.body;
  for (let l = 0; l < 3; l++) if (b.hp[l] < koThreshold(c, l)) return true;
  if (b.blood < b.bloodMax * 0.3 && !b.robotic) return true;
  return false;
}

export function isDeadCondition(c: Char) {
  const b = c.body;
  if (b.hp[LI.head] <= -b.max[LI.head] || b.hp[LI.chest] <= -b.max[LI.chest]) return true;
  if (b.blood <= 0 && !b.robotic) return true;
  return false;
}

export function knockOut(c: Char, why = '') {
  if (c.status !== 'up') return;
  c.status = 'ko';
  c.body.koT = 0;
  c.atk = null;
  c.act = null;
  c.path = null;
  c.hasGoal = false;
  c.sleeping = false;
  c.stats.downed++;
  if (c.carrying) dropCarried(c);
  S.fx.ko(c);
  machineSay(c, 'down');
  if (c.faction === 'player') S.W.say(`${c.name} is down${why ? ' (' + why + ')' : ''}.`, 'bad', S.clock.t);
}

export function kill(c: Char, by?: Char) {
  if (c.status === 'dead') return;
  c.status = 'dead';
  c.atk = null;
  c.act = null;
  c.path = null;
  c.hasGoal = false;
  c.sleeping = false;
  if (c.carrying) dropCarried(c);
  if (by) by.stats.kills++;
  if (c.faction === 'player') S.W.say(`${c.name} has died.`, 'bad', S.clock.t);
  S.fx.died(c);
}

export function dropCarried(c: Char) {
  const o = S.W.char(c.carrying);
  c.carrying = 0;
  if (!o) return;
  o.carriedBy = 0;
  const a = c.dir + Math.PI / 2;
  const nx = c.x + Math.sin(a) * 0.9, nz = c.z + Math.cos(a) * 0.9;
  const spot = S.nav.nearestOpen(nx, nz, 4);
  o.x = spot ? spot[0] : c.x; o.z = spot ? spot[1] : c.z;
  o.y = S.T.heightAt(o.x, o.z);
  o.dir = c.dir;
}

/** Per-step body upkeep. */
export function tickHealth(c: Char, dt: number) {
  const b = c.body;
  if (c.status === 'dead') return;
  const race = RACE[c.look.race];
  const gameH = (dt * RATE) / 3600; // game hours this step
  // hunger
  if (!b.robotic && !c.animal) {
    c.hunger = Math.max(0, c.hunger - 6 * gameH * (race?.hunger ?? 1) * (c.sleeping ? 0.7 : 1));
    if (c.hunger <= 0) {
      b.hp[LI.stomach] -= 2 * gameH;
      b.blood -= 1.5 * gameH;
    }
  }
  // bleeding
  let bleeding = 0;
  if (!b.robotic) {
    // the unconscious bleed slower and clot sooner (a slow heart), and everyone bleeds slower as the
    // blood runs low: a beaten band mostly wakes up again, hurt, unless the wounds are dreadful
    const out = c.status === 'ko';
    const clot = (0.004 + c.skill('toughness') * 0.00005) * dt * (out ? 2.5 : 1);
    for (let l = 0; l < 7; l++) {
      if (b.bleed[l] <= 0) continue;
      const k = b.treated[l] > 0 ? 6 : 1;
      b.bleed[l] = Math.max(0, b.bleed[l] - clot * k);
      bleeding += b.bleed[l];
    }
    const pressure = 0.35 + 0.65 * Math.max(0, b.blood / b.bloodMax);
    b.blood -= bleeding * dt * (race?.bleed ?? 1) * (out ? 0.35 : 1) * pressure;
    if (bleeding < 0.001 && c.hunger > 40 && b.blood < b.bloodMax) b.blood = Math.min(b.bloodMax, b.blood + 5 * gameH);
  }
  // healing
  const heal = b.robotic ? 0 : (race?.heal ?? 1); // machines mend only by repair
  if (heal > 0 && c.hunger > 30) {
    // a proper bed heals faster than a bedroll; a seat is a little better than standing about
    const bed = c.bed ? bedRest(S.W.objs.get(c.bed)) : c.sleeping ? 1.6 : c.mem.sit && c.mem.using ? 1.5 : 1;
    const rate = 4 * gameH * heal * bed;
    for (let l = 0; l < 7; l++) {
      if (!b.has(l) || b.hp[l] >= b.max[l]) continue;
      const tr = 1 + b.treated[l] * 1.6;
      b.hp[l] = Math.min(b.max[l], b.hp[l] + rate * tr);
      if (b.hp[l] >= b.max[l] * 0.98) b.treated[l] = 0;
    }
  }
  // status transitions
  if (isDeadCondition(c)) { kill(c, S.W.char(c.lastHitBy)); return; }
  if (c.status === 'up' && isKOCondition(c)) knockOut(c, b.blood < b.bloodMax * 0.3 ? 'blood loss' : '');
  else if (c.status === 'ko') {
    b.koT += dt;
    if (!c.carriedBy && !c.playDead && b.koT > 10 && !isKOCondition(c)) {
      // coming round
      const margin = Math.min(b.hp[0] - koThreshold(c, 0), b.hp[1] - koThreshold(c, 1), b.hp[2] - koThreshold(c, 2));
      if (margin > 4) {
        c.status = 'up';
        c.act = null;
        if (c.faction === 'player') S.W.say(`${c.name} gets back up.`, 'info', S.clock.t);
      }
    }
  }
  // a limp right arm drops its weapon's use; a lost arm drops it entirely
  if (c.eq.weapon && !b.has(LI.rarm) && !b.has(LI.larm) && !b.prost[LI.rarm] && !b.prost[LI.larm]) {
    if (!ITEM[c.eq.weapon.id].builtin) c.inv.add(c.eq.weapon.id, 1, c.eq.weapon.q); // a machine's fist goes with its arm
    c.eq.weapon = null;
    c.dirty = true;
  }
}

export function severLimb(c: Char, l: number) {
  const b = c.body;
  if (l < 3 || !b.has(l)) return;
  b.lost |= 1 << l;
  b.hp[l] = 0;
  b.bleed[l] += 1.4;
  c.dirty = true;
  S.fx.notice(`${c.name} lost their ${LIMB_NAMES[l].toLowerCase()}!`, c.faction === 'player' ? 'bad' : 'combat');
  S.fx.sound('sever', c.x, c.z);
}

/** Treats one limb using a medical item's points. Returns points used. */
export function treatLimb(medic: Char, patient: Char, l: number, pts: number, quality: number, splint: boolean): number {
  const b = patient.body;
  if (!b.has(l)) { if (b.bleed[l] > 0) { const u = Math.min(pts, b.bleed[l] * 60); b.bleed[l] = Math.max(0, b.bleed[l] - u / 60); return u; } return 0; }
  const skill = medic.skill('medic');
  // bandaging yourself is awkward work
  const eff = quality * (0.5 + skill * 0.012) * (medic === patient ? 0.75 : 1);
  let used = 0;
  if (b.bleed[l] > 0) {
    const u = Math.min(pts, b.bleed[l] * 40);
    b.bleed[l] = Math.max(0, b.bleed[l] - (u / 40) * eff * 1.5);
    used += u;
    pts -= u;
  }
  const missing = b.max[l] - b.hp[l];
  if (missing > 0 && pts > 0) {
    const heal = Math.min(missing, pts * eff * 0.45);
    b.hp[l] += heal;
    used += heal / (eff * 0.45);
  }
  b.treated[l] = Math.max(b.treated[l], Math.min(1, eff));
  if (splint && l >= 5 && b.hp[l] <= 0) b.splint |= 1 << l;
  train(medic, 'medic', used / 25, 1 + (missing > 40 ? 0.5 : 0));
  return used;
}

/** Most urgent limb to treat. */
export function worstLimb(b: Body): number {
  let best = -1, score = 0;
  for (let l = 0; l < 7; l++) {
    const s = b.bleed[l] * 200 + (b.has(l) ? Math.max(0, (b.max[l] - b.hp[l]) / b.max[l]) * (b.treated[l] > 0.5 ? 10 : 100) : 0) + (l < 3 && b.hp[l] < 0 ? 60 : 0);
    if (s > score) { score = s; best = l; }
  }
  return score > 5 ? best : -1;
}

/** A leg broken past standing and not yet splinted, or -1. */
export function brokenLeg(b: Body): number {
  for (const l of [LI.lleg, LI.rleg]) if (b.has(l) && b.hp[l] <= 0 && !(b.splint & (1 << l))) return l;
  return -1;
}

/**
 * Finds a medical item in a character's inventory (or pack) suited for the
 * patient: a splint for a broken leg, otherwise dressings or repair kits.
 */
export function findMedkit(c: Char, robot: boolean, patient?: Char) {
  const wantSplint = !!patient && !robot && brokenLeg(patient.body) >= 0;
  let dressing: { grid: Grid; it: Item; def: (typeof ITEM)[string] } | null = null;
  for (const g of [c.inv, c.eq.back?.inv]) {
    if (!g) continue;
    if (wantSplint) {
      const s = g.first((d) => !!d.med?.splint);
      if (s) return { grid: g, it: s, def: ITEM[s.id] };
    }
    if (!dressing) {
      const it = g.first((d) => !!d.med && !!d.med.robot === robot && !d.med.splint);
      if (it) dressing = { grid: g, it, def: ITEM[it.id] };
    }
  }
  return dressing;
}

/** Which limb to treat with a kit: the broken leg for a splint, else the worst. */
export function limbToTreat(b: Body, splint: boolean): number {
  const leg = splint ? brokenLeg(b) : -1;
  return leg >= 0 ? leg : worstLimb(b);
}

/**
 * Fits a prosthetic limb from someone's inventory to a missing arm or leg.
 * Needs a robotics bench or shop close by, or a squadmate who knows robotics.
 * Returns an explanation if it cannot be done.
 */
export function fitProsthetic(c: Char, uid: number): string | null {
  const grids = [c.inv, c.eq.back?.inv].filter((g): g is Grid => !!g);
  let item: Item | null = null, grid: Grid | null = null;
  for (const g of grids) { const it = g.items.find((i) => i.uid === uid); if (it) { item = it; grid = g; break; } }
  if (!item || !grid) return 'That limb is not in their pack.';
  const d = ITEM[item.id];
  if (!d.limb) return 'That is not a limb.';
  const slots = d.limb.part === 'arm' ? [LI.rarm, LI.larm] : [LI.rleg, LI.lleg];
  const l = slots.find((s) => !c.body.has(s) && !c.body.prost[s]);
  if (l === undefined) return `${c.name} has no missing ${d.limb.part} to fit it to.`;
  let help = false;
  S.W.objHash.near(c.x, c.z, 14, (o) => { if (o.data?.bkey === 'robo_bench' && o.owner === 'player') help = true; });
  for (const sh of S.W.shops.values()) {
    if (sh.kind !== 'robotics') continue;
    const o = S.W.objs.get(sh.id);
    if (o && Math.hypot(o.x - c.x, o.z - c.z) < 30) help = true;
  }
  for (const m of S.W.playerChars()) if (m !== c && m.up && m.skill('robotics') >= 15 && Math.hypot(m.x - c.x, m.z - c.z) < 6) help = true;
  if (!help) return 'Fitting a limb needs a robotics bench, a robotics shop nearby, or a squadmate with some skill in robotics standing close.';
  grid.remove(item);
  c.body.prost[l] = item.id;
  S.W.flags.prosthetics = (S.W.flags.prosthetics ?? 0) + 1;
  c.body.bleed[l] = 0;
  c.dirty = true;
  S.W.say(`${c.name} was fitted with a ${d.name.toLowerCase()}.`, 'good', S.clock.t);
  S.fx.notice(`${c.name} now has a ${d.name.toLowerCase()}.`, 'good');
  S.fx.sound('craft', c.x, c.z);
  return null;
}
