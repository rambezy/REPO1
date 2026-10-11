// Scene objects for characters: a skinned body per person or beast, weapons
// in hand or sheathed, ground rings (selection, hover, hostiles and the
// target of the selected), weapon trails, and per-frame pose updates.
import * as THREE from 'three';
import { Char } from '../sim/char';
import { World } from '../sim/world';
import { makeRig, makeBones, prostLooks, B, BONE_COUNT } from './charModel';
import { buildWeapon } from './weapon';
import { buildHuman } from './human';
import { charMaterial } from './charMat';
import type { Face } from './face';
import { Animator, AnimIn, Stance } from './anim';
import { buildAnimal, AnimalRig, AnimalAnimator } from './animalModel';
import { ANIMAL } from '../content/animals';
import { LI } from '../sim/body';
import { ITEM } from '../content/items';
import { hostile } from '../sim/combat';
import { S } from '../sim/ctx';
import { angleTo, wrapAngle } from '../core/math';
import { Trails } from './trails';
import type { WeaponKind } from '../sim/look';

const bodyMat = charMaterial();
const animalMat = bodyMat;
const weaponMat = bodyMat;

const ringGeo = new THREE.RingGeometry(0.55, 0.7, 28).rotateX(-Math.PI / 2);
// (no fog on the rings: their colours must read at night and in a dust storm)
const ringMats = {
  sel: new THREE.MeshBasicMaterial({ color: 0x9ce07a, transparent: true, opacity: 0.85, depthWrite: false, fog: false }),
  hover: new THREE.MeshBasicMaterial({ color: 0xe8e0c8, transparent: true, opacity: 0.5, depthWrite: false, fog: false }),
  enemy: new THREE.MeshBasicMaterial({ color: 0xe0503a, transparent: true, opacity: 0.6, depthWrite: false, fog: false }),
  target: new THREE.MeshBasicMaterial({ color: 0xff7a48, transparent: true, opacity: 0.95, depthWrite: false, fog: false }),
};
export type RingKind = keyof typeof ringMats | 'none';

/** How far from your people a hostile gets a ring without a fight on. */
const THREAT_R = 32;
const tA = new THREE.Vector3(), tB = new THREE.Vector3();

/** Where a weapon's business end runs, up its +Y: the stretch of blade (or the club's head) that leaves a trail. */
function bladeSpan(kind: WeaponKind, L: number): [number, number] {
  switch (kind) {
    case 'heavy': return [0.1 + L * 0.3, 0.1 + L];
    case 'blunt': return [L - 0.15, L + 0.12];
    case 'polearm': return [0.45 * L - 0.04, 0.45 * L + 0.67];
    default: return [0.08 + L * 0.35, 0.08 + L];
  }
}

const weaponGeoCache = new Map<string, THREE.BufferGeometry>();
function weaponGeo(key: string, make: () => THREE.BufferGeometry) {
  let g = weaponGeoCache.get(key);
  if (!g) { g = make(); weaponGeoCache.set(key, g); }
  return g;
}

export class CharView {
  root = new THREE.Group();
  mesh!: THREE.SkinnedMesh;
  bones!: THREE.Bone[];
  anim: Animator | null = null;
  aanim: AnimalAnimator | null = null;
  weapon: THREE.Mesh | null = null;
  ranged: THREE.Mesh | null = null;
  weaponKey = '';
  rangedKey = '';
  ring: THREE.Mesh;
  ringKind: RingKind = 'none';
  key = '';
  rigKey = '';
  animal = false;
  lastSeen = 0;
  /** the last blow: which body part, where it came from (angle from the facing), who, and when (sim time) */
  hitLimb = -1;
  hitDir = 0;
  hitBy = 0;
  hitAt = -1e9;
  /** which way to fall when knocked down: 1 on the back, -1 face down, 0 not decided (by id) */
  fallFace = 0;
  /** the pose this frame, so a fall is only chosen when going down from standing */
  stance: Stance = 'idle';
  /** where the overlay put this person's name tag this frame (its top edge), so their numbers can be stacked clear of it */
  tagTop = 0;
  tagFrame = -1;
  /** is this a hostile the player should see a ring on (refreshed a few times a second) */
  threat = false;
  private threatT = 0;
  /** this person's own material, with their face, while seen close */
  private faceMat: THREE.MeshStandardMaterial | null = null;

  constructor(public c: Char, public detail = 1) {
    this.ring = new THREE.Mesh(ringGeo, ringMats.sel);
    this.ring.visible = false;
    this.ring.renderOrder = 3;
    this.build();
  }

  private visKey() {
    const c = this.c;
    return JSON.stringify([c.look, c.vis(), c.body.lost, c.body.prost, this.detail]);
  }

  build() {
    const c = this.c;
    const key = this.visKey();
    if (this.mesh && key === this.key) { c.dirty = false; return; }
    this.key = key;
    c.dirty = false;
    if (c.animal) {
      this.animal = true;
      if (!this.mesh) {
        const r: AnimalRig = buildAnimal(ANIMAL[c.animal], c.look);
        this.bones = r.bones;
        this.mesh = new THREE.SkinnedMesh(r.geo, animalMat);
        this.mesh.add(r.bones[0]);
        this.mesh.updateMatrixWorld(true);
        this.mesh.bind(new THREE.Skeleton(r.bones));
        this.mesh.castShadow = true;
        this.mesh.frustumCulled = true;
        this.aanim = new AnimalAnimator(r);
        this.root.add(this.mesh);
      }
      return;
    }
    const rig = makeRig(c.look);
    const rigKey = JSON.stringify(c.look);
    const geo = buildHuman(c.look, c.vis(), c.body.lost, rig, prostLooks(c.body.prost), this.detail);
    this.faceMat?.dispose();
    const face = geo.userData.face as Face | null;
    this.faceMat = face ? charMaterial(face) : null;
    const mat = this.faceMat ?? bodyMat;
    if (!this.mesh || rigKey !== this.rigKey) {
      if (this.mesh) { this.root.remove(this.mesh); this.mesh.geometry.dispose(); }
      this.rigKey = rigKey;
      this.bones = makeBones(rig);
      this.mesh = new THREE.SkinnedMesh(geo, mat);
      this.mesh.add(this.bones[0]);
      this.mesh.updateMatrixWorld(true);
      this.mesh.bind(new THREE.Skeleton(this.bones));
      this.mesh.castShadow = true;
      this.anim = new Animator(this.bones);
      this.root.add(this.mesh);
      this.weaponKey = '';
      this.rangedKey = '';
    } else {
      this.mesh.geometry.dispose();
      this.mesh.geometry = geo;
      this.mesh.material = mat;
    }
  }

  private attachWeapons(drawn: boolean) {
    const c = this.c;
    const wv = c.weaponVis();
    const wk = wv ? JSON.stringify(wv) + (drawn ? 'd' : 's') : '';
    if (wk !== this.weaponKey) {
      this.weaponKey = wk;
      if (this.weapon) { this.weapon.parent?.remove(this.weapon); this.weapon = null; }
      if (wv) {
        const g = weaponGeo(JSON.stringify(wv), () => buildWeapon(wv));
        const m = new THREE.Mesh(g, weaponMat);
        m.castShadow = true;
        if (drawn && c.body.armOK(LI.rarm)) {
          const hand = this.bones[B.handR];
          m.position.set(0, -0.07, 0.01);
          m.rotation.set(Math.PI / 2 + 0.3, 0, 0);
          if (wv.kind === 'crossbow') m.rotation.set(0, 0, 0);
          hand.add(m);
        } else {
          // sheathed: long weapons on the back, blades at the hip
          const chest = this.bones[B.chest];
          const back = wv.kind === 'heavy' || wv.kind === 'polearm' || wv.kind === 'blunt' || wv.kind === 'pick';
          if (back) { m.position.set(0.05, 0.05, -0.2); m.rotation.set(0.1, 0, Math.PI * 0.8); }
          else { m.position.set(0.2, -0.28, -0.05); m.rotation.set(-0.4, 0.2, Math.PI + 0.35); }
          chest.add(m);
        }
        this.weapon = m;
      }
    }
    const rv = c.rangedVis();
    const rk = rv ? JSON.stringify(rv) + (c.act === 'shoot' || c.act === 'reload' || (c.drawn && !wv) ? 'd' : 's') : '';
    if (rk !== this.rangedKey) {
      this.rangedKey = rk;
      if (this.ranged) { this.ranged.parent?.remove(this.ranged); this.ranged = null; }
      if (rv) {
        const g = weaponGeo('r' + JSON.stringify(rv), () => buildWeapon(rv));
        const m = new THREE.Mesh(g, weaponMat);
        m.castShadow = true;
        if (rk.endsWith('d')) { m.position.set(0, -0.1, 0); m.rotation.set(Math.PI / 2, 0, 0); this.bones[B.handR].add(m); }
        else { m.position.set(-0.05, 0.1, -0.22); m.rotation.set(0.2, 0, 1.2); this.bones[B.chest].add(m); }
        this.ranged = m;
      }
    }
  }

  update(dt: number, W: World) {
    const c = this.c;
    if (c.dirty) this.build();
    const carrier = c.carriedBy ? W.char(c.carriedBy) : null;
    this.root.position.set(c.x, c.y, c.z);
    this.root.rotation.y = c.dir;
    const moved = c.mem.moved ?? 0;
    let stance: Stance = 'idle';
    if (c.status === 'dead') stance = 'dead';
    else if (carrier) stance = 'carried';
    else if (c.status === 'ko') stance = 'down';
    else if (c.knockT > 0) stance = 'down';
    else if (c.cage) stance = 'caged';
    else if (c.bed) stance = 'sleep';
    else if (c.sleeping) stance = 'sleep';
    else if (!c.body.canWalk() && !c.animal) stance = 'crawl';
    else if (c.mem.sit && c.speed < 0.2) stance = c.mem.using ? 'sit' : 'sitground';
    else if (c.drawn) stance = 'combat';
    if (this.stance === 'carried' && (stance === 'down' || stance === 'dead')) this.fallFace = -1; // dropped from, or dying in, a carry: face down as carried, no roll
    this.stance = stance;
    if (this.animal && this.aanim) {
      this.aanim.update(dt, { speed: c.speed, run: c.move === 'run', stance, attacking: !!c.atk, atkT: c.atk?.t ?? 0, hit: c.act === 'hit', actT: c.actT, variant: c.id % 4 }, moved);
      if (carrier) {
        this.root.position.set(carrier.x, carrier.y + 1.2, carrier.z);
      }
      return;
    }
    this.attachWeapons(c.drawn || !!c.atk);
    const w = c.weaponStats();
    const a: AnimIn = {
      speed: c.speed,
      run: c.move === 'run',
      sneak: c.move === 'sneak',
      stance,
      action: c.atk ? (c.atk.kick ? 'kick' : 'attack') : c.act,
      t: c.atk ? c.atk.t : c.actT,
      variant: c.atk ? c.atk.variant : c.actVar || (c.id % 4),
      weapon: c.eq.weapon ? w.kind : 'unarmed',
      drawn: c.drawn,
      limp: c.body.limp(),
      twoHanded: !!w.twoHanded,
      face: this.fallFace || (c.id % 3 === 0 ? -1 : 1),
      armL: c.body.has(LI.larm) || !!c.body.prost[LI.larm],
      armR: c.body.has(LI.rarm) || !!c.body.prost[LI.rarm],
      swim: c.swim,
      hitLimb: this.hitLimb,
      hitDir: this.hitDir,
    };
    this.anim!.update(dt, a, moved);
    if (carrier) {
      // over the carrier's shoulder
      const s = Math.sin(carrier.dir), co = Math.cos(carrier.dir);
      this.root.position.set(carrier.x + co * -0.05 + s * 0.05, carrier.y + carrier.look.height * 0.72, carrier.z - s * -0.05 + co * 0.05);
      this.root.rotation.y = carrier.dir + Math.PI / 2;
    }
    if (c.cage) this.root.position.y += 0.05;
    if (c.bed) this.root.position.y += c.mem.upper ? 1.5 : 0.45;
    if (c.mem.using) {
      const t = W.objs.get(c.mem.using);
      if (t?.kind === 'tower' && Math.hypot(c.x - t.x, c.z - t.z) < 0.6) this.root.position.y += t.data?.style === 'stone' || t.data?.style === 'metal' ? (t.data?.h ?? 7) + 0.25 : (t.data?.h ?? 7) - 0.875;
    }
  }

  setRing(kind: RingKind) {
    this.ringKind = kind;
    this.ring.visible = kind !== 'none';
    if (kind !== 'none') this.ring.material = ringMats[kind];
  }

  /** A blow has landed: remember the part, the side it came from and who, for the reaction and the fall. */
  hit(limb: number, by: Char) {
    this.hitLimb = limb;
    const c = this.c;
    this.hitDir = by === c ? 0 : wrapAngle(angleTo(c.x, c.z, by.x, by.z) - c.dir);
    this.hitBy = by.id;
    this.hitAt = S.time;
  }

  /**
   * Going down. The direction is chosen once, from standing: knocked from the
   * front you land on your back, from behind on your face; a bleed-out falls
   * however it falls. A body already lying (knocked out, asleep, carried)
   * stays as it is when it dies.
   */
  fall() {
    const st = this.stance;
    if (st === 'down' || st === 'dead' || st === 'playdead' || st === 'sleep' || st === 'carried' || st === 'caged') return;
    if (st === 'crawl') { this.fallFace = -1; return; }
    this.fallFace = S.time - this.hitAt < 0.5 ? (Math.abs(this.hitDir) < Math.PI / 2 ? 1 : -1) : 0;
  }

  /**
   * Refreshes whether this is a hostile worth a ring: someone who would fight
   * your people, and either fighting now or close to them.
   */
  updateThreat(dt: number, players: Char[], W: World) {
    const c = this.c;
    if (c.faction === 'player' || !c.alive) { this.threat = false; return; }
    this.threatT -= dt;
    if (this.threatT > 0) return;
    this.threatT = 0.2 + (c.id % 5) * 0.03;
    let near: Char | null = null, bd = 80 * 80;
    for (const p of players) {
      if (!p.alive) continue;
      const d2 = (p.x - c.x) ** 2 + (p.z - c.z) ** 2;
      if (d2 < bd) { bd = d2; near = p; }
    }
    if (!near || !c.up) { this.threat = false; return; }
    const target = c.target ? W.char(c.target) : null;
    const onYours = !!target && target.faction === 'player';
    const fighting = c.drawn || !!c.atk || !!c.target;
    this.threat = onYours || ((fighting || bd < THREAT_R * THREAT_R) && hostile(c, near));
  }

  /** Leaves a ribbon behind a heavy weapon through the strike. */
  sampleTrail(trails: Trails) {
    const c = this.c;
    const a = c.atk;
    if (!a || a.kick || !this.weapon || !this.weaponKey.endsWith('d')) return;
    if (a.t < 0.3 || a.t > 0.78) return;
    const w = c.weaponStats();
    if (!(w.weight >= 9 || w.kind === 'heavy' || w.kind === 'polearm')) return;
    const wv = c.weaponVis();
    if (!wv) return;
    const [b, t] = bladeSpan(wv.kind, wv.length);
    // the weapon hangs off the hand: bring its chain of matrices up to date for this frame's pose
    this.weapon.updateWorldMatrix(true, false);
    this.weapon.localToWorld(tA.set(0, b, 0));
    this.weapon.localToWorld(tB.set(0, t, 0));
    trails.push(c.id, tA.x, tA.y, tA.z, tB.x, tB.y, tB.z);
  }

  dispose() {
    this.mesh.geometry.dispose();
    this.faceMat?.dispose();
    this.root.removeFromParent();
    this.ring.removeFromParent();
  }
}

export class CharViews {
  group = new THREE.Group();
  rings = new THREE.Group();
  views = new Map<number, CharView>();
  trails = new Trails();
  range = 420;
  /** At most this many bodies built a frame, and no more once this many milliseconds have gone on it. */
  buildBudget = 6;
  buildMs = 7;
  /** Within this distance of the camera people get the detailed body (a little further before they lose it). */
  nearLod = 42;
  /** rings drawn last frame, for the debug readout and tests */
  ringStats = { enemy: 0, target: 0 };
  private want: { c: Char; d: number; v?: CharView }[] = [];
  private targets = new Set<number>(); // whoever the selected are fighting
  private players: Char[] = [];

  constructor() {
    this.group.add(this.trails.mesh);
  }

  update(dt: number, W: World, cam: THREE.Vector3, focus: THREE.Vector3, sel: Set<number>, hover: number) {
    const r2 = this.range * this.range, near2 = this.nearLod * this.nearLod;
    const seen = new Set<number>();
    const want = this.want;
    want.length = 0;
    this.players = W.playerChars();
    const targets = this.targets;
    targets.clear();
    for (const id of sel) { const c = W.char(id); if (c && c.target && (c.drawn || c.atk)) targets.add(c.target); }
    this.ringStats.enemy = 0; this.ringStats.target = 0;
    for (const c of W.active) {
      const dx = c.x - focus.x, dz = c.z - focus.z;
      const inRange = dx * dx + dz * dz < r2 || c.faction === 'player';
      if (!inRange) continue;
      const v = this.views.get(c.id);
      const cd2 = (c.x - cam.x) ** 2 + (c.y - cam.y) ** 2 + (c.z - cam.z) ** 2;
      if (!v) { want.push({ c, d: cd2 }); continue; }
      seen.add(c.id);
      // swap between the detailed and the light body as the camera comes and goes
      if (!c.animal && (cd2 < (v.detail ? near2 * 1.69 : near2) ? 1 : 0) !== v.detail) want.push({ c, d: cd2, v });
      this.tick(v, dt, W, sel, hover);
    }
    // new bodies first, nearest the camera first, then the detail swaps
    if (want.length) {
      want.sort((a, b) => (a.v ? 1 : 0) - (b.v ? 1 : 0) || a.d - b.d);
      const t0 = performance.now();
      for (let i = 0; i < want.length && i < this.buildBudget; i++) {
        if (i > 0 && performance.now() - t0 > this.buildMs) break;
        const { c, d } = want[i];
        let v = want[i].v;
        if (v) { v.detail = v.detail ? 0 : 1; v.build(); continue; }
        v = new CharView(c, c.animal || d < near2 ? 1 : 0);
        this.views.set(c.id, v);
        this.group.add(v.root);
        this.rings.add(v.ring);
        c.view = v;
        seen.add(c.id);
        this.tick(v, dt, W, sel, hover);
      }
      want.length = 0;
    }
    for (const [id, v] of this.views) {
      if (!seen.has(id)) {
        v.dispose();
        this.views.delete(id);
        v.c.view = null;
      }
    }
    this.trails.update(dt);
  }

  private tick(v: CharView, dt: number, W: World, sel: Set<number>, hover: number) {
    const c = v.c;
    v.update(dt, W);
    v.updateThreat(dt, this.players, W);
    v.sampleTrail(this.trails);
    const kind: RingKind = sel.has(c.id) ? 'sel' : hover === c.id ? 'hover' : this.targets.has(c.id) && c.alive ? 'target' : v.threat ? 'enemy' : 'none';
    v.setRing(kind);
    if (v.ring.visible) {
      if (kind === 'enemy') this.ringStats.enemy++; else if (kind === 'target') this.ringStats.target++;
      const s = (c.animal ? ANIMAL[c.animal].size * 1.1 : c.look.bulk) * (kind === 'target' ? 1.15 : 1);
      v.ring.scale.setScalar(s);
      v.ring.position.set(c.x, c.y + 0.06, c.z);
    }
  }

  get count() { return this.views.size; }

  /** Drops every view (after loading a save the characters are new objects). */
  clear() {
    for (const v of this.views.values()) { v.dispose(); v.c.view = null; }
    this.views.clear();
  }
}

export { BONE_COUNT, ITEM };
