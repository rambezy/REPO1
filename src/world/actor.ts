// Actors: the player, people and animals. Handles movement with collision,
// animation state, and drawing. Combat and AI live in their own systems and
// operate on these fields.

import { Dir, DIR_VEC, dirFromVec, clamp, TILE } from '../engine/util';
import { Look, FRAME } from '../gfx/characters';
import { drawPerson, PersonPose } from '../gfx/person';
import { weaponPose } from '../systems/weaponPose';
import { G } from '../G';
import { AnimalLook, drawAnimal, AFRAME } from '../gfx/animals';
import { GameMap } from './map';
import { P } from '../gfx/palette';

export type Faction = 'player' | 'villager' | 'town' | 'guard' | 'bandit' | 'harrow' | 'lothar' | 'animal' | 'predator' | 'ally' | 'dog' | 'neutral';
export type Pose = 'idle' | 'walk' | 'windup' | 'strike' | 'block' | 'hurt' | 'dead' | 'sit' | 'crouch' | 'work' | 'lie' | 'sleep';

export interface WeaponStats {
  id: string;
  kind: 'fist' | 'sword' | 'axe' | 'mace' | 'spear' | 'dagger' | 'bow' | 'hammer' | 'stick';
  slash: number; stab: number; blunt: number;
  reach: number; // px
  speed: number; // multiplier on attack timings (higher = faster)
  staminaCost: number;
  twoHanded?: boolean;
}

export interface ArmorStats { slash: number; stab: number; blunt: number; noise: number; charisma: number; weight: number }

export interface CombatState {
  weapon: WeaponStats;
  armor: ArmorStats;
  phase: 'none' | 'windup' | 'strike' | 'recover' | 'block' | 'stagger' | 'dodge' | 'draw';
  phaseT: number;
  phaseLen: number;
  attackKind: 'slash' | 'thrust' | 'heavy' | 'bite' | 'charge' | 'shoot';
  attackAngle: number;
  combo: number;
  comboWindow: number;
  blockT: number; // time block has been held (for perfect block timing)
  hitThisSwing: Set<string>;
  target: Actor | null;
  cooldown: number;
  bleeding: number;
  lastHitBy: string | null;
  invuln: number;
  aggro: number; // for AI: how eager to attack
  dodgeVx: number; dodgeVy: number;
  queued: boolean;
  charge: number; // heavy attack charge
  stunned: number;
}

export function defaultCombat(): CombatState {
  return {
    weapon: { id: 'fists', kind: 'fist', slash: 0, stab: 0, blunt: 6, reach: 14, speed: 1.2, staminaCost: 8 },
    armor: { slash: 0, stab: 0, blunt: 0, noise: 0, charisma: 0, weight: 0 },
    phase: 'none', phaseT: 0, phaseLen: 0, attackKind: 'slash', attackAngle: 0, combo: 0, comboWindow: 0, blockT: 0,
    hitThisSwing: new Set(), target: null, cooldown: 0, bleeding: 0, lastHitBy: null, invuln: 0, aggro: 0.5,
    dodgeVx: 0, dodgeVy: 0, queued: false, charge: 0, stunned: 0,
  };
}

export interface Emote { icon: string; t: number }

let nextActorId = 1;

export class Actor {
  id: string;
  name: string;
  x = 0;
  y = 0;
  mapId = '';
  dir: Dir = 0;
  vx = 0;
  vy = 0;
  look?: Look;
  animal?: AnimalLook;
  pose: Pose = 'idle';
  poseLock = 0; // seconds a scripted pose is held
  animT = 0;
  flash = 0;
  alpha = 1;
  hitW = 10;
  hitH = 6;
  solid = true;
  speed = 56;
  runMul = 1.75;
  running = false;
  crouching = false;
  hp = 100;
  maxHp = 100;
  stamina = 100;
  maxStamina = 100;
  faction: Faction = 'neutral';
  hostile = false;
  dead = false;
  surrendered = false;
  unkillable = false;
  essential = false;
  combat: CombatState = defaultCombat();
  tags = new Set<string>();
  emote: Emote | null = null;
  bark: { text: string; t: number } | null = null;
  /** character id for named NPCs (dialogue, portraits) */
  charId: string | null = null;
  /** arbitrary data for AI/brains */
  mem: Record<string, any> = {};
  brain: Brain | null = null;
  scale = 1;
  hidden = false;
  noCollide = false;
  lastStepT = 0;
  moved = 0; // distance moved this frame (for anims/sounds)
  carrying: string | null = null;
  sitting: { x: number; y: number } | null = null;
  talkable = true;

  constructor(name: string, id?: string) {
    this.name = name;
    this.id = id || 'a' + nextActorId++;
  }

  get isAnimal() { return !!this.animal; }
  get alive() { return !this.dead; }

  setPos(x: number, y: number) { this.x = x; this.y = y; }

  face(tx: number, ty: number) {
    this.dir = dirFromVec(tx - this.x, ty - this.y, this.dir);
  }
  faceDir(d: Dir) { this.dir = d; }

  emoteShow(icon: string, t = 1.6) { this.emote = { icon, t }; }
  say(text: string, t = 3.5) { this.bark = { text, t }; }

  /** Moves with collision against the map and other solid actors. Returns true if moved at all. */
  move(map: GameMap, dx: number, dy: number, others: Actor[]): boolean {
    const hw = this.hitW / 2;
    const box = (x: number, y: number) => ({ x0: x - hw, y0: y - this.hitH, x1: x + hw, y1: y });
    const hitsActor = (x: number, y: number) => {
      if (this.noCollide) return false;
      const b = box(x, y);
      for (const o of others) {
        if (o === this || !o.solid || o.dead || o.hidden || o.noCollide || o.mapId !== this.mapId) continue;
        const ohw = o.hitW / 2;
        if (b.x1 > o.x - ohw && b.x0 < o.x + ohw && b.y1 > o.y - o.hitH && b.y0 < o.y) {
          // allow moving away from an overlapping actor
          const before = Math.hypot(this.x - o.x, this.y - o.y);
          const after = Math.hypot(x - o.x, y - o.y);
          if (after < before) return true;
        }
      }
      return false;
    };
    const free = (x: number, y: number) => {
      const b = box(x, y);
      return !map.blocked(b.x0, b.y0, b.x1, b.y1) && !hitsActor(x, y);
    };
    const sx = this.x, sy = this.y;
    // Move in small steps so fast movement cannot tunnel through thin walls.
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
    const stx = dx / steps, sty = dy / steps;
    for (let i = 0; i < steps; i++) {
      if (stx !== 0) {
        if (free(this.x + stx, this.y)) this.x += stx;
        else if (sty === 0) {
          // corner assist: nudge vertically to slide around corners
          for (const n of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
            if (free(this.x + stx, this.y + n) && free(this.x, this.y + Math.sign(n))) { this.y += Math.sign(n) * Math.min(Math.abs(stx), 1); break; }
          }
        }
      }
      if (sty !== 0) {
        if (free(this.x, this.y + sty)) this.y += sty;
        else if (stx === 0) {
          for (const n of [1, -1, 2, -2, 3, -3, 4, -4, 5, -5]) {
            if (free(this.x + n, this.y + sty) && free(this.x + Math.sign(n), this.y)) { this.x += Math.sign(n) * Math.min(Math.abs(sty), 1); break; }
          }
        }
      }
    }
    this.x = clamp(this.x, 4, map.w * TILE - 4);
    this.y = clamp(this.y, 6, map.h * TILE - 1);
    this.moved = Math.hypot(this.x - sx, this.y - sy);
    return this.moved > 0.01;
  }

  updateAnim(dt: number) {
    this.animT += dt;
    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt * 5);
    if (this.emote) { this.emote.t -= dt; if (this.emote.t <= 0) this.emote = null; }
    if (this.bark) { this.bark.t -= dt; if (this.bark.t <= 0) this.bark = null; }
    if (this.poseLock > 0) this.poseLock -= dt;
  }

  frameIndex(): number {
    if (this.animal) {
      switch (this.pose) {
        case 'dead': return AFRAME.DEAD;
        case 'sit': return AFRAME.SIT;
        case 'lie': return AFRAME.LIE;
        case 'strike': case 'windup': return AFRAME.ATTACK;
        case 'walk': {
          const f = Math.floor(this.animT * (this.running ? 12 : 7)) % 4;
          return f === 0 ? AFRAME.WALK_A : f === 2 ? AFRAME.WALK_B : AFRAME.IDLE;
        }
        default: return AFRAME.IDLE;
      }
    }
    switch (this.pose) {
      case 'dead': return FRAME.DEAD;
      case 'sit': return FRAME.SIT;
      case 'lie': return FRAME.DEAD;
      case 'windup': return FRAME.WINDUP;
      case 'strike': return FRAME.STRIKE;
      case 'block': return FRAME.BLOCK;
      case 'hurt': return FRAME.HURT;
      case 'crouch': return FRAME.CROUCH;
      case 'work': return Math.floor(this.animT * 3) % 2 === 0 ? FRAME.WINDUP : FRAME.STRIKE;
      case 'walk': {
        const rate = this.running ? 11 : this.crouching ? 5 : 7.5;
        const f = Math.floor(this.animT * rate) % 4;
        if (this.crouching) return FRAME.CROUCH;
        return f === 0 ? FRAME.WALK_A : f === 2 ? FRAME.WALK_B : FRAME.IDLE;
      }
      default: return FRAME.IDLE;
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.hidden) return;
    const lying = this.pose === 'dead' || this.pose === 'lie' || this.pose === 'sleep';
    // soft contact shadow under the feet
    if (!lying) {
      const w = this.animal ? Math.min(22, this.hitW + 8) : 13 * (this.look?.build === 'child' ? 0.75 : 1);
      const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, w / 2);
      g.addColorStop(0, 'rgba(12,8,6,0.42)');
      g.addColorStop(1, 'rgba(12,8,6,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(this.x, this.y, w / 2, 3.2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.animal) {
      const f = this.frameIndex();
      drawAnimal(ctx, this.animal, this.pose === 'dead' ? 1 : this.dir, f, this.x, this.y, this.flash, this.alpha);
      return;
    }
    if (!this.look) return;
    const wp = weaponPose(this, this === G.player);
    const fighting = !!wp && !wp.rest;
    const hand = (this.mem.hand ||= { x: this.x, y: this.y - 11 });
    let seed = this.mem.animSeed as number | undefined;
    if (seed === undefined) { seed = 0; for (let i = 0; i < this.id.length; i++) seed = (seed * 31 + this.id.charCodeAt(i)) % 997; this.mem.animSeed = seed; }
    const pose: PersonPose = this.pose === 'walk' && this.crouching ? 'walk' : (this.pose as PersonPose);
    drawPerson(ctx, this.look, {
      dir: lying ? 0 : this.dir,
      pose,
      t: this.animT,
      running: this.running,
      crouching: this.crouching,
      aim: fighting ? wp!.A : null,
      reach: wp?.reach,
      flash: this.flash,
      alpha: this.alpha,
      seed,
      hand,
    }, this.x, this.y + (lying ? 2 : 0));
  }

  /** Point in front of the actor at distance d. */
  front(d: number) {
    const v = DIR_VEC[this.dir];
    return { x: this.x + v[0] * d, y: this.y - 4 + v[1] * d };
  }

  get cx() { return this.x; }
  get cy() { return this.y - 8; }
}

export interface Brain {
  update(a: Actor, dt: number): void;
  /** Called when the actor is hit or threatened. */
  onHit?(a: Actor, by: Actor | null): void;
  name?: string;
}

export const EMOTE_COLORS: Record<string, string> = { '!': '#e8c040', '?': '#8ab0e0', '♥': '#e05060', '…': '#d8d0c0', 'z': '#a0b0d0', '♪': '#90d070', '💢': '#e05050' };

export { P };
