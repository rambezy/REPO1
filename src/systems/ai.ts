// NPC and animal behaviour: schedules, wandering, scripted moves, following,
// perception, melee/ranged combat tactics, surrender and fleeing.

import { G } from '../G';
import { Actor, Brain, Pose } from '../world/actor';
import { here, actors } from '../world/world';
import { findPath, lineOfSight } from '../world/path';
import { S, hourF, darkness } from '../state';
import { rand, angleDiff, dirFromVec, dirFromAngle, TILE, clamp } from '../engine/util';
import { startAttack, startBlock, endBlock, startDodge, areHostile, canAct } from './combat';
import { emit } from '../engine/events';
import { sfx } from '../audio/sfx';
import { playerState } from './player';

export type Activity = 'sleep' | 'work' | 'wander' | 'sit' | 'stand' | 'pray' | 'eat' | 'patrol' | 'guard' | 'drink' | 'dance' | 'hide';
export interface Sched { from: number; to: number; map: string; x: number; y: number; act: Activity; r?: number; dir?: number; pose?: Pose }

export type BrainKind = 'person' | 'guard' | 'fighter' | 'archer' | 'prey' | 'predator' | 'boar' | 'critter' | 'goose';

// ---------- scripted movement API ----------

export function walkTo(a: Actor, x: number, y: number, opts: { run?: boolean; timeout?: number; near?: number } = {}): Promise<void> {
  return new Promise((resolve) => {
    if (a.mem.script?.resolve) a.mem.script.resolve();
    a.mem.script = { x, y, run: !!opts.run, resolve, t: 0, timeout: opts.timeout ?? 20, near: opts.near ?? 4 };
    a.mem.path = null;
  });
}
export function stopScript(a: Actor) {
  if (a.mem.script?.resolve) a.mem.script.resolve();
  a.mem.script = null;
}

export function inSchedule(s: Sched, h: number) {
  return s.from <= s.to ? h >= s.from && h < s.to : h >= s.from || h < s.to;
}
export function currentSched(a: Actor): Sched | null {
  const sch: Sched[] | undefined = a.mem.schedule;
  if (!sch || !sch.length) return null;
  const h = hourF();
  return sch.find((s) => inSchedule(s, h)) || null;
}

/** Places scheduled NPCs where they should be right now (used on map enter / load / time skips). */
export function settleSchedules() {
  for (const a of actors) settleActor(a);
}

/** Puts one scheduled NPC where its schedule says (cheap stand-in for walking there off-screen). */
export function settleActor(a: Actor) {
  if (a === G.player || a.dead || a.mem.follow || a.mem.hold || a.mem.script) return;
  const s = currentSched(a);
  if (!s) return;
  if (a.mapId !== s.map || Math.hypot(a.x - s.x, a.y - s.y) > (s.r || 8) + 40) {
    a.mapId = s.map;
    a.x = s.x + (s.act === 'wander' ? rand.range(-(s.r || 0), s.r || 0) * 0.5 : 0);
    a.y = s.y + (s.act === 'wander' ? rand.range(-(s.r || 0), s.r || 0) * 0.5 : 0);
    a.mem.path = null;
  }
  applyActivityPose(a, s);
}

function applyActivityPose(a: Actor, s: Sched) {
  a.hidden = false;
  a.mem.sleeping = false;
  if (s.act === 'sleep') { a.pose = 'sleep'; a.mem.sleeping = true; }
  else if (s.act === 'sit' || s.act === 'eat' || s.act === 'drink' || s.act === 'pray') a.pose = s.pose || 'sit';
  else if (s.act === 'work') a.pose = s.pose || 'work';
  else a.pose = 'idle';
  if (s.dir !== undefined) a.dir = s.dir as 0 | 1 | 2 | 3;
}

// ---------- perception ----------

export function visibilityOf(t: Actor): number {
  if (t !== G.player) return 1;
  let v = 1;
  if (t.crouching) v *= 0.55;
  const dark = G.map.outdoor ? darkness() : Math.max(0.3, G.map.ambient);
  const lit = !!S.equip.torch;
  if (dark > 0.5 && !lit) v *= S.perks.includes('shadow') ? 0.45 : 0.62;
  if (lit) v *= 1.5;
  return v;
}

export function canSee(a: Actor, t: Actor, range = 150): boolean {
  if (t.hidden || a.dead || a.mapId !== t.mapId) return false;
  const d = Math.hypot(t.x - a.x, t.y - a.y);
  let r = a.mem.sight ?? range;
  if (G.map.outdoor) r *= 1 - darkness() * 0.45;
  r *= visibilityOf(t);
  if (d > r) return false;
  if (!a.mem.alerted && d > 24) {
    const face = [Math.PI / 2, Math.PI, 0, -Math.PI / 2][a.dir];
    if (angleDiff(Math.atan2(t.y - a.y, t.x - a.x), face) > 1.25) return false;
  }
  return lineOfSight(G.map, a.x, a.y - 8, t.x, t.y - 8);
}

// ---------- movement helpers ----------

function moveToward(a: Actor, x: number, y: number, dt: number, run: boolean, near = 4): boolean {
  const d = Math.hypot(x - a.x, y - a.y);
  if (d <= near) { a.pose = a.combat.phase === 'none' ? 'idle' : a.pose; return true; }
  // path-finding with periodic repath
  a.mem.repathT = (a.mem.repathT || 0) - dt;
  const goalMoved = !a.mem.pathGoal || Math.hypot(a.mem.pathGoal.x - x, a.mem.pathGoal.y - y) > 16;
  if ((!a.mem.path || goalMoved || a.mem.repathT <= 0) && d > 20) {
    a.mem.path = findPath(G.map, a.x, a.y, x, y, d > 400 ? 5000 : 2500);
    a.mem.pathIdx = 0;
    a.mem.pathGoal = { x, y };
    a.mem.repathT = 1.5 + Math.random();
  }
  let tx = x, ty = y;
  const path: { x: number; y: number }[] | null = a.mem.path;
  if (path && a.mem.pathIdx < path.length && d > 20) {
    const wp = path[a.mem.pathIdx];
    tx = wp.x; ty = wp.y;
    if (Math.hypot(wp.x - a.x, wp.y - a.y) < 5) a.mem.pathIdx++;
  }
  const dx = tx - a.x, dy = ty - a.y;
  const l = Math.hypot(dx, dy) || 1;
  let sp = a.speed * (run ? a.runMul : 1) * G.map.speedAt(a.x, a.y);
  if (a.mem.speedMul) sp *= a.mem.speedMul;
  a.running = run;
  const moved = a.move(G.map, (dx / l) * sp * dt, (dy / l) * sp * dt, here());
  if (a.combat.phase === 'none' || a.combat.phase === 'recover') {
    if (!a.mem.strafing) a.dir = dirFromVec(dx, dy, a.dir);
    a.pose = moved ? 'walk' : 'idle';
  }
  // stuck detection
  if (!moved) {
    a.mem.stuck = (a.mem.stuck || 0) + dt;
    if (a.mem.stuck > 0.6) { a.mem.path = null; a.mem.repathT = 0; a.mem.stuck = 0; a.move(G.map, rand.range(-6, 6), rand.range(-6, 6), here()); }
  } else a.mem.stuck = 0;
  return false;
}

// ---------- the brain ----------

export class NpcBrain implements Brain {
  kind: BrainKind;
  name = 'npc';
  constructor(kind: BrainKind) { this.kind = kind; }

  update(a: Actor, dt: number) {
    if (a.dead) return;
    if (a.mem.down) { a.pose = 'lie'; return; }
    // scripted movement overrides everything (cutscenes), even a hold
    const sc = a.mem.script;
    if (sc) {
      sc.t += dt;
      if (moveToward(a, sc.x, sc.y, dt, sc.run, sc.near) || sc.t > sc.timeout) {
        if (sc.t > sc.timeout) { a.x = sc.x; a.y = sc.y; }
        a.mem.script = null;
        a.pose = 'idle';
        a.running = false;
        sc.resolve();
      }
      return;
    }
    if (a.mem.hold) {
      if (a.combat.phase === 'none' && a.poseLock <= 0 && a.pose === 'walk') a.pose = 'idle';
      return;
    }
    if (a.surrendered) { this.surrendered(a, dt); return; }

    // fleeing
    if (a.mem.fleeT > 0) {
      a.mem.fleeT -= dt;
      const from = a.mem.fleeFrom as Actor | undefined;
      if (from) {
        const dx = a.x - from.x, dy = a.y - from.y;
        const l = Math.hypot(dx, dy) || 1;
        const sp = a.speed * a.runMul * 1.05;
        a.running = true;
        const moved = a.move(G.map, (dx / l) * sp * dt, (dy / l) * sp * dt, here());
        if (!moved) a.move(G.map, (-dy / l) * sp * dt, (dx / l) * sp * dt, here());
        a.dir = dirFromVec(dx, dy, a.dir);
        a.pose = 'walk';
        if (a.mem.fleeT <= 0 && a.mem.despawnOnFlee && Math.hypot(dx, dy) > 180) { a.hidden = true; a.dead = true; a.mapId = '__gone'; }
      }
      return;
    }

    switch (this.kind) {
      case 'prey': case 'critter': this.prey(a, dt); return;
      case 'goose': this.goose(a, dt); return;
    }

    // acquire combat target
    const target = this.pickTarget(a);
    if (target) { this.fight(a, target, dt); return; }
    if (a.combat.phase === 'block') endBlock(a);
    a.mem.engaged = false;

    if (this.kind === 'predator') { this.roam(a, dt, 120); return; }
    if (this.kind === 'boar') { this.roam(a, dt, 60); return; }

    if (a.mem.follow) { this.follow(a, dt); return; }
    const s = currentSched(a);
    if (s) { this.routine(a, s, dt); return; }
    if (a.mem.patrol) { this.patrol(a, dt); return; }
    if (a.mem.wander) { this.roam(a, dt, a.mem.wander); return; }
    if (a.combat.phase === 'none' && a.poseLock <= 0 && a.pose === 'walk') a.pose = 'idle';
    if (a.mem.faceDir !== undefined) a.dir = a.mem.faceDir;
  }

  onHit(a: Actor, by: Actor | null) {
    if (!by || a.dead) return;
    a.mem.alerted = true;
    a.mem.aware = true;
    if (this.kind === 'prey' || this.kind === 'critter') { flee(a, by, 5); return; }
    if (by === G.player && !a.hostile && !a.mem.noRetaliate) {
      if (this.kind === 'person' && !a.mem.brave) { flee(a, by, 6); a.say(rand.pick(['Help! Murder!', 'Guards! Guards!', 'Mother of God!'])); emit('assault', a, by); return; }
      a.hostile = true;
      emit('assault', a, by);
    }
    if (by !== G.player && !a.mem.target) a.mem.target = by.id;
  }

  private pickTarget(a: Actor): Actor | null {
    // current target still valid?
    const curId = a.mem.target;
    let cur: Actor | null = null;
    if (curId) {
      cur = here().find((x) => x.id === curId) || null;
      if (!cur || cur.dead || cur.mem.down || (cur === G.player && !a.hostile)) { a.mem.target = null; cur = null; }
    }
    if (cur) return cur;
    // hostile to player?
    const p = G.player;
    if (a.hostile && !p.dead && p.mapId === a.mapId) {
      const d = Math.hypot(p.x - a.x, p.y - a.y);
      const aggro = a.mem.aggroRange ?? 150;
      if (a.mem.alerted ? d < aggro * 1.8 : (d < aggro && canSee(a, p))) {
        if (!a.mem.alerted) { a.mem.alerted = true; a.emoteShow('!', 1); emit('spotted', a); if (this.kind === 'predator') sfx('growl', a.x, a.y); }
        a.mem.target = p.id;
        return p;
      }
      // hear the player
      if (d < playerState.noise * 90) { a.mem.alerted = true; a.dir = dirFromVec(p.x - a.x, p.y - a.y, a.dir); }
    }
    // NPC vs NPC enemies (allies of the player, rival factions)
    let best: Actor | null = null, bd = a.mem.aggroRange ?? 150;
    for (const o of here()) {
      if (o === a || o === p || o.dead || o.hidden || o.mem.down) continue;
      if (!areHostile(a, o)) continue;
      const d = Math.hypot(o.x - a.x, o.y - a.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (best) a.mem.target = best.id;
    return best;
  }

  private fight(a: Actor, t: Actor, dt: number) {
    const c = a.combat;
    const d = Math.hypot(t.x - a.x, t.y - a.y);
    const ang = Math.atan2(t.y - a.y, t.x - a.x);
    a.mem.blockAngle = ang;
    const human = !a.isAnimal;
    // lose interest
    if (d > 380) { a.mem.target = null; a.mem.alerted = false; return; }
    // surrender / flee
    if (human && !a.mem.boss && !a.essential && !a.mem.noSurrender && t === G.player && a.hp < a.maxHp * 0.22 && !a.mem.triedSurrender) {
      a.mem.triedSurrender = true;
      const courage = a.mem.courage ?? 0.5;
      if (Math.random() > courage) { surrender(a); return; }
    }
    if (a.isAnimal && a.hp < a.maxHp * 0.3 && this.kind === 'predator') { flee(a, t, 6); sfx('whine', a.x, a.y); return; }

    // attack token: at most two melee attackers press the player at once
    if (!a.mem.engaged) {
      const pressing = here().filter((o) => o !== a && !o.dead && o.mem.engaged && o.mem.target === t.id).length;
      a.mem.engaged = pressing < (t === G.player ? (S.difficulty === 'hard' ? 3 : 2) : 3) || this.kind === 'archer';
    }
    const reach = this.kind === 'archer' ? 110 : c.weapon.reach;
    const want = this.kind === 'archer' ? 90 : a.mem.engaged ? reach * 0.8 : reach + 30;
    // face target during combat
    if (c.phase === 'none' || c.phase === 'block' || c.phase === 'recover') a.dir = dirFromAngle(ang);

    // defensive reaction: block incoming attacks
    const tc = t.combat;
    if (human && this.kind !== 'archer' && (tc.phase === 'windup') && d < tc.weapon.reach + 16 && c.phase !== 'windup' && c.phase !== 'strike') {
      const skill = a.mem.skill ?? 3;
      if (a.mem.blockRoll === undefined) a.mem.blockRoll = Math.random() < 0.15 + skill * 0.07;
      if (a.mem.blockRoll && a.stamina > 10) {
        // skilled fighters time their block late (perfect), novices raise it early
        const late = skill >= 6 && tc.phaseT > tc.phaseLen * 0.55;
        if (skill < 6 || late) startBlock(a);
      } else if (skill >= 5 && Math.random() < dt * 2 && a.stamina > 25) {
        startDodge(a, -Math.cos(ang), -Math.sin(ang));
      }
    } else {
      a.mem.blockRoll = undefined;
      if (c.phase === 'block' && (tc.phase !== 'windup' && tc.phase !== 'strike')) {
        a.mem.blockHold = (a.mem.blockHold || 0) + dt;
        if (a.mem.blockHold > 0.35) { endBlock(a); a.mem.blockHold = 0; }
      }
    }

    // movement: approach / keep distance / circle
    if (c.phase === 'none' || c.phase === 'recover' || c.phase === 'block') {
      a.mem.strafeT = (a.mem.strafeT || 0) - dt;
      if (a.mem.strafeT <= 0) { a.mem.strafeDir = rand.chance(0.5) ? 1 : -1; a.mem.strafeT = rand.range(0.8, 2.2); }
      let mx = 0, my = 0;
      if (d > want + 6) { mx += Math.cos(ang); my += Math.sin(ang); }
      else if (d < want - 10) { mx -= Math.cos(ang) * 0.8; my -= Math.sin(ang) * 0.8; }
      if (human || this.kind === 'predator') {
        const s = a.mem.strafeDir || 1;
        const k = a.mem.engaged ? 0.35 : 0.8;
        mx += -Math.sin(ang) * s * k; my += Math.cos(ang) * s * k;
      }
      if (a.stamina < 20 && human) { mx -= Math.cos(ang) * 0.9; my -= Math.sin(ang) * 0.9; }
      const l = Math.hypot(mx, my);
      if (l > 0.1) {
        let sp = a.speed * (d > want + 40 ? a.runMul : 0.85);
        if (c.phase === 'block') sp *= 0.5;
        a.running = d > want + 40;
        if (d > 120 && a.mem.path !== undefined) moveToward(a, t.x, t.y, dt, true, want);
        else {
          const moved = a.move(G.map, (mx / l) * sp * dt, (my / l) * sp * dt, here());
          if (!moved && d > want) moveToward(a, t.x, t.y, dt, true, want);
          if (c.phase !== 'block') a.pose = moved ? 'walk' : 'idle';
        }
      } else if (c.phase === 'none') a.pose = 'idle';
    }

    // attack
    if (a.mem.engaged && canAct(a) && c.cooldown <= 0 && c.phase !== 'block') {
      if (this.kind === 'archer') {
        if (d < 150 && lineOfSight(G.map, a.x, a.y - 8, t.x, t.y - 8)) {
          if (startAttack(a, 'shoot', ang, 5)) c.cooldown = rand.range(1.8, 3.2);
        }
      } else if (d <= reach + 8) {
        let kind: 'slash' | 'thrust' | 'heavy' | 'bite' | 'charge' = 'slash';
        if (a.isAnimal) kind = this.kind === 'boar' ? 'charge' : 'bite';
        else { const r = Math.random(); kind = r < 0.2 ? 'heavy' : r < 0.45 ? 'thrust' : 'slash'; }
        const skill = a.mem.skill ?? 3;
        const telegraph = a.isAnimal ? 1.6 : clamp(2.4 - skill * 0.15, 1.2, 2.3) * (S.difficulty === 'story' ? 1.4 : S.difficulty === 'hard' ? 0.85 : 1);
        if (startAttack(a, kind, ang, telegraph)) {
          c.cooldown = rand.range(0.7, 1.7) / (a.mem.aggression ?? 1);
          // skilled fighters chain a second blow
          if (skill >= 5 && Math.random() < 0.35) c.cooldown = 0.05;
        }
      } else if (this.kind === 'boar' && d < 90 && Math.random() < dt * 1.2) {
        if (startAttack(a, 'charge', ang, 1.2)) c.cooldown = rand.range(1.5, 2.5);
      }
    }
  }

  private surrendered(a: Actor, dt: number) {
    a.pose = 'block';
    a.dir = dirFromVec(G.player.x - a.x, G.player.y - a.y, a.dir);
    a.mem.surT = (a.mem.surT || 0) + dt;
    if (a.mem.surT > 25 || Math.hypot(G.player.x - a.x, G.player.y - a.y) > 220) {
      a.surrendered = false;
      a.hostile = false;
      flee(a, G.player, 12);
      a.mem.despawnOnFlee = true;
    }
  }

  private routine(a: Actor, s: Sched, dt: number) {
    if (a.mapId !== s.map) {
      // walking to another map: head for the exit if visible, otherwise just go
      const exit = findExit(a.mapId, s.map);
      if (exit && a.mapId === G.map.id && Math.hypot(a.x - G.player.x, a.y - G.player.y) < 320) {
        if (moveToward(a, exit.x, exit.y, dt, false, 8)) { a.mapId = s.map; a.x = s.x; a.y = s.y; a.mem.path = null; }
      } else { a.mapId = s.map; a.x = s.x; a.y = s.y; a.mem.path = null; }
      return;
    }
    const d = Math.hypot(a.x - s.x, a.y - s.y);
    if (s.act === 'wander') {
      if (d > (s.r || 40) + 30) moveToward(a, s.x, s.y, dt, false, 10);
      else this.roam(a, dt, s.r || 40, s.x, s.y);
      return;
    }
    if (s.act === 'patrol' && a.mem.patrol) { this.patrol(a, dt); return; }
    if (d > 6) {
      if (a.pose === 'lie' || a.pose === 'sit' || a.pose === 'sleep') { a.pose = 'idle'; a.mem.sleeping = false; }
      moveToward(a, s.x, s.y, dt, false, 5);
      return;
    }
    applyActivityPose(a, s);
    if (s.act === 'guard' || s.act === 'stand') {
      a.mem.lookT = (a.mem.lookT || 0) - dt;
      if (a.mem.lookT <= 0) { a.mem.lookT = rand.range(2, 6); a.dir = (s.dir !== undefined && Math.random() < 0.6 ? s.dir : rand.int(0, 3)) as 0 | 1 | 2 | 3; }
    }
  }

  private roam(a: Actor, dt: number, radius: number, ax?: number, ay?: number) {
    if (a.mem.anchorX === undefined) { a.mem.anchorX = a.x; a.mem.anchorY = a.y; }
    const cx = ax ?? a.mem.anchorX, cy = ay ?? a.mem.anchorY;
    a.mem.roamT = (a.mem.roamT || 0) - dt;
    if (!a.mem.roamGoal || a.mem.roamT <= 0) {
      a.mem.roamT = rand.range(2, 7);
      if (Math.random() < 0.45) { a.mem.roamGoal = null; a.mem.idleT = rand.range(1.5, 5); }
      else {
        const ang = rand.range(0, Math.PI * 2), r = rand.range(0, radius);
        a.mem.roamGoal = { x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r };
      }
    }
    if (a.mem.roamGoal) {
      const g = a.mem.roamGoal;
      const dx = g.x - a.x, dy = g.y - a.y;
      const l = Math.hypot(dx, dy);
      if (l < 4) { a.mem.roamGoal = null; a.pose = 'idle'; return; }
      const sp = a.speed * 0.6;
      const moved = a.move(G.map, (dx / l) * sp * dt, (dy / l) * sp * dt, here());
      a.dir = dirFromVec(dx, dy, a.dir);
      a.pose = moved ? 'walk' : 'idle';
      if (!moved) a.mem.roamGoal = null;
    } else if (a.pose === 'walk') a.pose = 'idle';
  }

  private patrol(a: Actor, dt: number) {
    const pts: { x: number; y: number }[] = a.mem.patrol;
    if (!pts || !pts.length) return;
    const i = (a.mem.patrolIdx || 0) % pts.length;
    if (a.mem.patrolWait > 0) { a.mem.patrolWait -= dt; a.pose = 'idle'; return; }
    if (moveToward(a, pts[i].x, pts[i].y, dt, false, 6)) { a.mem.patrolIdx = i + 1; a.mem.patrolWait = rand.range(1, 4); }
  }

  private follow(a: Actor, dt: number) {
    const leader = here().find((x) => x.id === a.mem.follow);
    if (!leader) return;
    const d = Math.hypot(leader.x - a.x, leader.y - a.y);
    const dist = a.mem.followDist ?? 26;
    if (d > dist + 10) moveToward(a, leader.x, leader.y, dt, d > dist + 60, dist);
    else if (a.combat.phase === 'none') { a.pose = 'idle'; a.running = false; }
    if (d > 400) { a.x = leader.x; a.y = leader.y + 8; a.mem.path = null; }
  }

  private prey(a: Actor, dt: number) {
    const p = G.player;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    const fear = (a.mem.fear ?? 90) * (p.crouching ? 0.5 : 1) * (p.running ? 1.4 : 1);
    if (d < fear && p.mapId === a.mapId && !p.dead) { flee(a, p, rand.range(2.5, 4)); return; }
    this.roam(a, dt, a.mem.wander || 60);
  }

  private goose(a: Actor, dt: number) {
    const p = G.player;
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (a.hostile && d < 140) {
      // geese chase and nip, honking
      if (d > 12) moveToward(a, p.x, p.y, dt, true, 10);
      if (d < 16 && a.combat.cooldown <= 0) {
        if (startAttack(a, 'bite', Math.atan2(p.y - a.y, p.x - a.x), 1)) a.combat.cooldown = rand.range(0.8, 1.6);
      }
      return;
    }
    this.roam(a, dt, a.mem.wander || 40);
  }
}

export function flee(a: Actor, from: Actor, secs: number) {
  a.mem.fleeT = secs;
  a.mem.fleeFrom = from;
  if (a.combat.phase === 'block') endBlock(a);
}

export function surrender(a: Actor) {
  a.surrendered = true;
  a.hostile = false;
  a.mem.target = null;
  a.combat.phase = 'none';
  a.mem.surT = 0;
  a.say(rand.pick(['Mercy! I yield, I yield!', 'Enough! Please — I have children!', 'Quarter! I beg you, quarter!', 'Don\'t kill me! Take the purse!']), 4);
  emit('surrender', a);
}

const exitCache = new Map<string, { x: number; y: number } | null>();
function findExit(fromMap: string, toMap: string): { x: number; y: number } | null {
  const key = fromMap + '>' + toMap;
  if (exitCache.has(key)) return exitCache.get(key)!;
  let res: { x: number; y: number } | null = null;
  try {
    // imported lazily to avoid a cycle at module load
    const m = G.map && G.map.id === fromMap ? G.map : null;
    if (m) {
      for (const o of m.objects) if (o.interact?.type === 'door' && (o.interact.to === toMap)) { res = { x: o.x, y: o.y + 6 }; break; }
      if (!res) for (const o of m.objects) if (o.interact?.type === 'door') { res = { x: o.x, y: o.y + 6 }; break; }
    }
  } catch { res = null; }
  if (res) exitCache.set(key, res);
  return res;
}

export function makeBrain(kind: BrainKind) { return new NpcBrain(kind); }

export { TILE };
