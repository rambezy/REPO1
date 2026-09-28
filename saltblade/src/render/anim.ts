// Procedural animation for humanoids: gaits, stances, attacks, work loops,
// lying down, carrying and being carried. Poses blend smoothly each frame.
import * as THREE from 'three';
import { B, BONE_COUNT } from './charModel';
import type { WeaponKind } from '../sim/look';

export type Stance =
  | 'idle' | 'combat' | 'down' | 'dead' | 'carry' | 'carried' | 'sit' | 'sleep' | 'crawl' | 'medic' | 'eat' | 'caged' | 'shackled' | 'playdead' | 'bow' | 'sitground';

export type ActionKind =
  | 'attack' | 'hit' | 'block' | 'mine' | 'build' | 'farm' | 'craft' | 'dodge' | 'shoot' | 'reload' | 'pickup' | 'talk' | 'loot' | 'cheer' | 'research' | 'kick';

export interface AnimIn {
  speed: number; // m/s
  run: boolean;
  sneak: boolean;
  stance: Stance;
  action: ActionKind | null;
  t: number; // 0..1 progress through the action
  variant: number;
  weapon: WeaponKind | null;
  drawn: boolean;
  limp: number; // 0 none, 1 left, 2 right
  twoHanded: boolean;
  face: number; // 1 lying on back, -1 face down
  armL: boolean; // has left arm
  armR: boolean;
  swim: boolean;
}

const N = BONE_COUNT;

export class Animator {
  rx = new Float32Array(N);
  ry = new Float32Array(N);
  rz = new Float32Array(N);
  tx = new Float32Array(N);
  ty = new Float32Array(N);
  tz = new Float32Array(N);
  phase = Math.random() * 6;
  rootY = 0; // lift of the root (lying bodies)
  rootX = 0; // pitch of the whole body
  rootZ = 0;
  hipDrop = 0;
  private tRootY = 0;
  private tRootX = 0;
  private tRootZ = 0;
  private tHipDrop = 0;
  private hipBase = 0;
  idleT = Math.random() * 10;
  constructor(public bones: THREE.Bone[]) {
    this.hipBase = bones[B.hips].position.y;
  }

  private set(b: number, x: number, y = 0, z = 0) { this.tx[b] = x; this.ty[b] = y; this.tz[b] = z; }

  update(dt: number, a: AnimIn, distMoved: number) {
    dt = dt > 0 ? Math.min(dt, 0.25) : 0;
    this.tx.fill(0); this.ty.fill(0); this.tz.fill(0);
    this.tRootY = 0; this.tRootX = 0; this.tRootZ = 0; this.tHipDrop = 0;
    this.idleT += dt;
    const stride = a.run ? 2.4 : a.sneak ? 1.0 : 1.45;
    this.phase += (distMoved / stride) * Math.PI * 2;
    const ph = this.phase;
    const moving = a.speed > 0.25;
    let blend = 10;

    switch (a.stance) {
      case 'down':
      case 'dead':
      case 'playdead':
      case 'sleep':
      case 'carried':
        this.lying(a);
        blend = a.stance === 'carried' ? 30 : 5;
        break;
      case 'crawl':
        this.tRootX = 1.35; this.tRootY = 0.22;
        this.set(B.ulL, 0.2 + Math.sin(ph) * 0.3); this.set(B.ulR, 0.2 - Math.sin(ph) * 0.3);
        this.set(B.llL, 0.3); this.set(B.llR, 0.3);
        this.set(B.uaL, -2.4 + Math.sin(ph) * 0.5, 0, 0.3); this.set(B.uaR, -2.4 - Math.sin(ph) * 0.5, 0, -0.3);
        this.set(B.head, -0.9);
        break;
      case 'sit':
      case 'sitground':
        this.tHipDrop = a.stance === 'sit' ? -0.5 : -0.78;
        this.set(B.ulL, -1.45, 0, 0.12); this.set(B.ulR, -1.45, 0, -0.12);
        this.set(B.llL, a.stance === 'sit' ? 1.45 : 1.9); this.set(B.llR, a.stance === 'sit' ? 1.45 : 1.9);
        this.set(B.uaL, -0.35, 0, 0.1); this.set(B.uaR, -0.35, 0, -0.1);
        this.set(B.laL, -0.8); this.set(B.laR, -0.8);
        this.set(B.spine, 0.1 + Math.sin(this.idleT * 1.3) * 0.02);
        this.set(B.head, 0.15);
        break;
      case 'caged':
        this.tHipDrop = -0.78;
        this.set(B.ulL, -1.2, 0, 0.3); this.set(B.ulR, -1.2, 0, -0.3);
        this.set(B.llL, 2.1); this.set(B.llR, 2.1);
        this.set(B.uaL, -0.9, 0, -0.2); this.set(B.uaR, -0.9, 0, 0.2);
        this.set(B.laL, -1.2); this.set(B.laR, -1.2);
        this.set(B.spine, 0.45); this.set(B.head, 0.5);
        break;
      case 'bow':
        this.set(B.spine, 0.5); this.set(B.chest, 0.3); this.set(B.head, 0.3);
        this.set(B.uaL, 0.2); this.set(B.uaR, 0.2);
        break;
      default:
        this.stand(a, moving, ph, dt);
    }

    // actions layer over the body
    if (a.action) this.action(a);

    // arms that are gone stay still
    if (!a.armL) { this.set(B.uaL, 0); this.set(B.laL, 0); }
    if (!a.armR) { this.set(B.uaR, 0); this.set(B.laR, 0); }

    // blend toward targets
    const k = 1 - Math.exp(-dt * (a.action === 'attack' || a.action === 'hit' || a.action === 'dodge' ? 26 : blend));
    const bones = this.bones;
    for (let i = 1; i < N; i++) {
      this.rx[i] += (this.tx[i] - this.rx[i]) * k;
      this.ry[i] += (this.ty[i] - this.ry[i]) * k;
      this.rz[i] += (this.tz[i] - this.rz[i]) * k;
      bones[i].rotation.set(this.rx[i], this.ry[i], this.rz[i]);
    }
    const kr = 1 - Math.exp(-dt * (a.stance === 'carried' ? 30 : 6));
    this.rootX += (this.tRootX - this.rootX) * kr;
    this.rootY += (this.tRootY - this.rootY) * kr;
    this.rootZ += (this.tRootZ - this.rootZ) * kr;
    this.hipDrop += (this.tHipDrop - this.hipDrop) * kr;
    bones[B.root].rotation.set(this.rootX, 0, this.rootZ);
    bones[B.root].position.y = this.rootY;
    bones[B.hips].position.y = this.hipBase + this.hipDrop + this.bob;
  }

  private bob = 0;

  private stand(a: AnimIn, moving: boolean, ph: number, dt: number) {
    const combat = a.stance === 'combat' && a.drawn;
    this.bob = 0;
    if (a.swim) {
      this.tHipDrop = -0.9;
      this.set(B.spine, 0.9); this.set(B.head, -0.8);
      this.set(B.uaL, -2.6 + Math.sin(ph) * 1.2, 0, 0.4); this.set(B.uaR, -2.6 - Math.sin(ph) * 1.2, 0, -0.4);
      this.set(B.ulL, 0.4 + Math.sin(ph * 2) * 0.3); this.set(B.ulR, 0.4 - Math.sin(ph * 2) * 0.3);
      return;
    }
    if (moving) {
      const run = a.run && !a.sneak;
      const A = run ? 0.78 : a.sneak ? 0.45 : 0.5;
      const sL = Math.sin(ph), sR = Math.sin(ph + Math.PI);
      let limpL = 1, limpR = 1;
      if (a.limp === 1) limpL = 0.25; else if (a.limp === 2) limpR = 0.25;
      this.set(B.ulL, -sL * A * limpL + (a.sneak ? -0.45 : 0));
      this.set(B.ulR, -sR * A * limpR + (a.sneak ? -0.45 : 0));
      this.set(B.llL, (Math.max(0, Math.sin(ph - 1.3)) * (run ? 1.4 : 0.7) + 0.08) * limpL + (a.sneak ? 0.8 : 0));
      this.set(B.llR, (Math.max(0, Math.sin(ph + Math.PI - 1.3)) * (run ? 1.4 : 0.7) + 0.08) * limpR + (a.sneak ? 0.8 : 0));
      this.set(B.footL, a.sneak ? -0.3 : 0); this.set(B.footR, a.sneak ? -0.3 : 0);
      this.bob = Math.abs(Math.cos(ph)) * (run ? 0.06 : 0.03) - (run ? 0.03 : 0.01);
      if (a.sneak) this.tHipDrop = -0.2;
      const lean = run ? 0.2 : a.sneak ? 0.45 : 0.04;
      this.set(B.spine, lean * 0.6, Math.sin(ph) * 0.08);
      this.set(B.chest, lean * 0.4, -Math.sin(ph) * 0.1);
      this.set(B.head, -lean * 0.7);
      if (a.limp) this.tRootZ = Math.sin(ph) * 0.05;
      const aa = run ? 0.9 : 0.4;
      if (combat) {
        this.guardArms(a, 0.6);
        this.set(B.uaL, this.tx[B.uaL] + sL * 0.15, this.ty[B.uaL], this.tz[B.uaL]);
      } else {
        this.set(B.uaL, sL * aa, 0, 0.06);
        this.set(B.uaR, sR * aa, 0, -0.06);
        this.set(B.laL, -0.25 - (run ? 1.1 : 0.15));
        this.set(B.laR, -0.25 - (run ? 1.1 : 0.15));
        if (a.sneak) { this.set(B.uaL, -0.5, 0, 0.3); this.set(B.uaR, -0.5, 0, -0.3); this.set(B.laL, -1.1); this.set(B.laR, -1.1); }
      }
    } else {
      const br = Math.sin(this.idleT * 1.6) * 0.025;
      this.set(B.chest, br);
      this.set(B.head, -br * 0.5, Math.sin(this.idleT * 0.37) * 0.25 * (combat ? 0.2 : 1));
      if (combat) {
        // fighting stance: feet apart, knees bent
        this.tHipDrop = -0.08;
        this.set(B.ulL, -0.35, 0, 0.12); this.set(B.ulR, 0.25, 0, -0.1);
        this.set(B.llL, 0.45); this.set(B.llR, 0.35);
        this.set(B.spine, 0.1, -0.25);
        this.guardArms(a, 1);
        this.bob = Math.sin(this.idleT * 3) * 0.012;
      } else if (a.sneak) {
        this.tHipDrop = -0.22;
        this.set(B.ulL, -0.7); this.set(B.ulR, -0.3);
        this.set(B.llL, 1.1); this.set(B.llR, 0.9);
        this.set(B.spine, 0.35);
        this.set(B.uaL, -0.4, 0, 0.2); this.set(B.uaR, -0.4, 0, -0.2); this.set(B.laL, -0.9); this.set(B.laR, -0.9);
      } else {
        this.set(B.uaL, 0.02, 0, 0.06 + br); this.set(B.uaR, 0.02, 0, -0.06 - br);
        this.set(B.laL, -0.12); this.set(B.laR, -0.12);
        if (a.limp) { this.set(a.limp === 1 ? B.ulL : B.ulR, -0.15); this.set(a.limp === 1 ? B.llL : B.llR, 0.35); this.tRootZ = a.limp === 1 ? -0.04 : 0.04; }
      }
    }
    void dt;
  }

  private guardArms(a: AnimIn, k: number) {
    const w = a.weapon;
    if (!w || w === 'unarmed' || w === 'claw') {
      // fists up
      this.set(B.uaL, -0.9 * k, 0, 0.25); this.set(B.laL, -1.9 * k);
      this.set(B.uaR, -0.7 * k, 0, -0.25); this.set(B.laR, -2.0 * k);
      return;
    }
    if (w === 'crossbow') {
      this.set(B.uaR, -1.2, 0, -0.1); this.set(B.laR, -0.4);
      this.set(B.uaL, -1.4, 0, -0.5); this.set(B.laL, -0.3);
      return;
    }
    if (a.twoHanded || w === 'heavy' || w === 'polearm') {
      this.set(B.uaR, -0.7 * k, 0.2, -0.2); this.set(B.laR, -1.2 * k);
      this.set(B.uaL, -0.8 * k, -0.3, 0.45); this.set(B.laL, -1.3 * k);
      return;
    }
    // one-handed blade: raised forward, off hand balanced
    this.set(B.uaR, -0.6 * k, 0.1, -0.15); this.set(B.laR, -1.1 * k);
    this.set(B.uaL, -0.3 * k, 0, 0.35); this.set(B.laL, -0.9 * k);
  }

  private lying(a: AnimIn) {
    const face = a.face >= 0 ? 1 : -1;
    this.tRootX = face > 0 ? -Math.PI / 2 : Math.PI / 2;
    this.tRootY = 0.13;
    const v = (a.variant % 4) * 0.2;
    if (a.stance === 'sleep') {
      this.set(B.uaL, 0.1, 0, 0.1); this.set(B.uaR, 0.1, 0, -0.1);
      this.set(B.laL, -1.2); this.set(B.laR, -0.3);
      this.set(B.ulL, -0.1); this.set(B.llL, 0.2);
      this.set(B.head, 0.1, 0.3);
      return;
    }
    if (a.stance === 'carried') {
      this.tRootX = Math.PI / 2; this.tRootY = 0;
      this.set(B.uaL, 0.4, 0, 0.2); this.set(B.uaR, 0.4, 0, -0.2);
      this.set(B.head, 0.5);
      this.set(B.ulL, -0.4); this.set(B.ulR, -0.4); this.set(B.llL, 0.6); this.set(B.llR, 0.6);
      return;
    }
    // sprawled
    this.set(B.uaL, -0.4 - v, 0, 0.6 + v); this.set(B.uaR, 0.2 + v, 0, -0.9 - v * 0.5);
    this.set(B.laL, -0.5); this.set(B.laR, -0.2 - v);
    this.set(B.ulL, -0.15, 0, 0.12 + v * 0.3); this.set(B.ulR, 0.05, 0, -0.18);
    this.set(B.llL, 0.3 + v); this.set(B.llR, 0.1);
    this.set(B.head, 0, (face > 0 ? 0.5 : -0.4) + v, 0);
    if (a.stance === 'down' || a.stance === 'playdead') {
      // twitch of life
      const br = Math.sin(this.idleT * 1.2) * 0.02;
      this.set(B.chest, br);
    }
  }

  private action(a: AnimIn) {
    const t = a.t;
    switch (a.action) {
      case 'attack': return this.attack(a);
      case 'kick': {
        const s = t < 0.4 ? t / 0.4 : t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
        this.set(B.ulR, -1.4 * s); this.set(B.llR, 0.9 - 0.9 * s);
        this.set(B.spine, -0.25 * s);
        this.set(B.uaL, -0.4, 0, 0.6); this.set(B.uaR, -0.4, 0, -0.6);
        return;
      }
      case 'hit': {
        const s = Math.sin(Math.min(1, t) * Math.PI);
        this.set(B.spine, this.tx[B.spine] - 0.35 * s, this.ty[B.spine] + 0.2 * s);
        this.set(B.head, this.tx[B.head] - 0.4 * s);
        this.set(B.uaL, this.tx[B.uaL] + 0.3 * s, 0, 0.4 * s + this.tz[B.uaL]);
        return;
      }
      case 'block': {
        // weapon held across, braced
        this.set(B.uaR, -1.3, 0.5, -0.4); this.set(B.laR, -1.2, 0.4);
        this.set(B.uaL, -1.1, -0.4, 0.4); this.set(B.laL, -1.3);
        this.set(B.spine, -0.12 - Math.sin(t * Math.PI) * 0.15);
        this.tHipDrop = -0.1;
        return;
      }
      case 'dodge': {
        const s = Math.sin(t * Math.PI);
        this.set(B.spine, 0.2, 0, (a.variant % 2 ? 1 : -1) * 0.6 * s);
        this.tHipDrop = -0.25 * s;
        this.set(B.llL, 0.8 * s); this.set(B.llR, 0.8 * s);
        this.set(B.ulL, -0.6 * s); this.set(B.ulR, -0.6 * s);
        return;
      }
      case 'mine': {
        // pick swing over the shoulder
        const c = t * Math.PI * 2;
        const s = (Math.sin(c) + 1) / 2;
        this.set(B.uaR, -2.6 + s * 2.2, 0, -0.1); this.set(B.laR, -0.6 + s * 0.3);
        this.set(B.uaL, -2.4 + s * 2.1, 0, 0.3); this.set(B.laL, -0.7 + s * 0.3);
        this.set(B.spine, 0.1 + s * 0.4);
        this.set(B.ulL, -0.4); this.set(B.llL, 0.3);
        return;
      }
      case 'build':
      case 'craft':
      case 'research': {
        const c = Math.sin(t * Math.PI * 2 * (a.action === 'build' ? 2 : 1));
        if (a.action === 'build') {
          this.tHipDrop = -0.35;
          this.set(B.ulL, -1.2); this.set(B.llL, 1.9); this.set(B.ulR, -0.3); this.set(B.llR, 1.6);
          this.set(B.spine, 0.5);
          this.set(B.uaR, -1.6 + c * 0.6, 0, -0.1); this.set(B.laR, -0.8 + c * 0.3);
          this.set(B.uaL, -0.9, 0, 0.2); this.set(B.laL, -0.6);
        } else {
          this.set(B.spine, 0.35);
          this.set(B.uaR, -0.9 + c * 0.25, 0, -0.1); this.set(B.laR, -0.9 - c * 0.2);
          this.set(B.uaL, -0.85 - c * 0.2, 0, 0.1); this.set(B.laL, -0.95);
          this.set(B.head, 0.35);
        }
        return;
      }
      case 'farm': {
        const c = Math.sin(t * Math.PI * 2);
        this.tHipDrop = -0.45;
        this.set(B.ulL, -1.4); this.set(B.llL, 2.1); this.set(B.ulR, -0.6); this.set(B.llR, 1.9);
        this.set(B.spine, 0.7); this.set(B.head, 0.2);
        this.set(B.uaR, -0.9 + c * 0.4); this.set(B.laR, -0.3);
        this.set(B.uaL, -0.7 - c * 0.3); this.set(B.laL, -0.4);
        return;
      }
      case 'pickup':
      case 'loot': {
        const s = Math.sin(t * Math.PI);
        this.tHipDrop = -0.45 * s;
        this.set(B.ulL, -1.2 * s); this.set(B.llL, 1.8 * s); this.set(B.ulR, -0.5 * s); this.set(B.llR, 1.5 * s);
        this.set(B.spine, 0.6 * s);
        this.set(B.uaR, -1.0 * s); this.set(B.uaL, -0.8 * s);
        return;
      }
      case 'shoot': {
        this.set(B.uaR, -1.35, 0, -0.1); this.set(B.laR, -0.35);
        this.set(B.uaL, -1.45, 0, -0.55); this.set(B.laL, -0.25);
        this.set(B.head, 0.1);
        this.set(B.spine, -0.05 * Math.max(0, 1 - t * 4));
        return;
      }
      case 'reload': {
        const s = Math.sin(t * Math.PI);
        this.set(B.uaR, -0.9, 0, -0.1); this.set(B.laR, -0.9 - s * 0.6);
        this.set(B.uaL, -0.6 - s * 0.5); this.set(B.laL, -1.2);
        this.set(B.spine, 0.2 * s);
        return;
      }
      case 'talk': {
        const s = Math.sin(this.idleT * 3.3);
        this.set(B.uaR, -0.4 - s * 0.15, 0, -0.1); this.set(B.laR, -1.1 + s * 0.2);
        return;
      }
      case 'cheer': {
        const s = Math.abs(Math.sin(t * Math.PI * 3));
        this.set(B.uaR, -2.8, 0, -0.3 * s); this.set(B.laR, -0.4);
        return;
      }
    }
  }

  private attack(a: AnimIn) {
    const t = a.t;
    // windup 0..0.45, strike 0.45..0.62, recover
    const wu = t < 0.45 ? t / 0.45 : 1;
    const st = t < 0.45 ? 0 : t < 0.62 ? (t - 0.45) / 0.17 : 1;
    const rc = t < 0.62 ? 0 : (t - 0.62) / 0.38;
    const e = (x: number) => x * x * (3 - 2 * x);
    const w = a.weapon;
    const v = a.variant % 4;
    this.tHipDrop = -0.1;
    if (!w || w === 'unarmed' || w === 'claw') {
      // punches: jab / cross / hook / uppercut
      const arm = v % 2 === 0 ? 'R' : 'L';
      const ua = arm === 'R' ? B.uaR : B.uaL, la = arm === 'R' ? B.laR : B.laL, sd = arm === 'R' ? -1 : 1;
      const ext = e(st) * (1 - e(rc));
      this.set(ua, -0.8 - ext * 0.8 + (v === 3 ? -0.5 * ext : 0), (v === 2 ? 0.7 * ext : 0) * -sd, sd * 0.25 * (1 - ext));
      this.set(la, -2.0 + ext * 1.8);
      this.set(B.spine, 0.15, sd * (0.35 * ext - 0.2 * e(wu) * (1 - st)));
      return;
    }
    if (w === 'crossbow') return;
    const two = a.twoHanded || w === 'heavy' || w === 'polearm';
    if (w === 'polearm' || v === 2) {
      // thrust
      const pull = e(wu) * (1 - st), ext = e(st) * (1 - e(rc));
      this.set(B.uaR, -0.7 - ext * 0.6 + pull * 0.4, 0, -0.2);
      this.set(B.laR, -1.4 + ext * 1.3 - pull * 0.3);
      if (two) { this.set(B.uaL, -0.9 - ext * 0.5, -0.3, 0.4); this.set(B.laL, -1.2 + ext * 0.9); }
      this.set(B.spine, 0.1 + ext * 0.25 - pull * 0.15, -0.3 * pull + 0.2 * ext);
      this.set(B.ulL, -0.5 * ext); this.set(B.llL, 0.5 * ext);
      return;
    }
    if (v === 1) {
      // horizontal slash, right to left
      const wind = e(wu) * (1 - st), sw = e(st) * (1 - e(rc));
      this.set(B.chest, 0.05, 0.9 * wind - 0.9 * sw);
      this.set(B.spine, 0.1, 0.3 * wind - 0.3 * sw);
      this.set(B.uaR, -1.3, 0.8 * wind - 0.9 * sw, -1.0 * wind + 0.2);
      this.set(B.laR, -0.6 - 0.5 * wind);
      if (two) { this.set(B.uaL, -1.2, 0.6 * wind - 0.7 * sw, 0.3); this.set(B.laL, -0.9); }
      else { this.set(B.uaL, -0.2, 0, 0.5); this.set(B.laL, -0.7); }
      return;
    }
    // overhead (0) and rising cut (3)
    const up = v === 3 ? -1 : 1;
    const wind = e(wu) * (1 - st), sw = e(st) * (1 - e(rc));
    const armX = up > 0 ? -0.6 - 2.1 * wind + 2.4 * sw * (1 - wind) : -0.2 + 0.6 * wind - 2.2 * sw;
    this.set(B.uaR, armX, 0, -0.15);
    this.set(B.laR, -0.4 - 0.9 * wind + 0.4 * sw);
    if (two) { this.set(B.uaL, armX * 0.95, -0.2, 0.35); this.set(B.laL, -0.5 - 0.8 * wind); }
    else { this.set(B.uaL, -0.3, 0, 0.45); this.set(B.laL, -0.8); }
    this.set(B.spine, -0.2 * wind * up + 0.35 * sw * up, -0.15);
    this.set(B.chest, -0.1 * wind + 0.2 * sw);
    this.set(B.ulL, -0.45 * sw); this.set(B.llL, 0.4 * sw); this.set(B.llR, 0.3);
  }
}
