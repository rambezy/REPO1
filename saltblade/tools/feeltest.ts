// Headless checks of how a fight feels (render/impact.ts, render/anim.ts,
// render/charView.ts, game/autopause.ts): the impact hold stays within its
// budget and never runs above normal speed, the hold is used up by fractions
// of a frame, reduced motion switches it off; a fall buckles from standing
// only and a lying body never rises; a blow to the head turns the face away;
// the fall direction is chosen once, from the blow that did it; and the
// attacked auto-pause fires on the first blow after a lull, not every swing.
// Usage: npx tsx tools/feeltest.ts
import * as THREE from 'three';
import { G } from '../src/state';
import { S } from '../src/sim/ctx';
import { DEFAULTS } from '../src/game/settings';
import { impact, impactScale, impactState, resetImpact } from '../src/render/impact';
import { Animator, type AnimIn } from '../src/render/anim';
import { makeRig, makeBones, B } from '../src/render/charModel';
import { CharView } from '../src/render/charView';
import { Char } from '../src/sim/char';
import { LI } from '../src/sim/body';
import { World } from '../src/sim/world';
import { randomLook } from '../src/sim/spawn';
import { RNG } from '../src/core/rng';
import { hitRule, resetAutopause } from '../src/game/autopause';
import { on } from '../src/core/events';

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };
const deg = (r: number) => Math.round((r * 180) / Math.PI);

Object.assign(G, { mode: 'play', speed: 1, lastSpeed: 1, realTime: 0, settings: { ...DEFAULTS }, cam: { shake: 0, target: { x: 0, z: 0 } } });

// ---------------------------------------------------------------- the impact hold
/** Frames at `fps` for `secs`, a big hit every `every` seconds: the share of sim time lost to the hold. */
function brawl(fps: number, speed: number, secs: number, every = 0.1) {
  resetImpact();
  G.speed = speed; G.cam.shake = 0;
  const dt = 1 / fps;
  let t = 0, next = 0, lost = 0, partial = 0;
  for (let i = 0; i < secs * fps; i++) {
    if (t >= next) { impact(1); next += every; }
    const sc = impactScale(dt);
    lost += (1 - sc) * dt;
    if (sc > 0 && sc < 1) partial++;
    t += dt;
  }
  return { lost: lost / secs, partial, count: impactState().count, shake: G.cam.shake };
}
{
  const a = brawl(60, 1, 40);
  check('a brawl of big hits at 60 fps loses no more than a twentieth of the time to the hold', a.lost > 0.02 && a.lost <= 0.055, `${(a.lost * 100).toFixed(1)}%, ${a.count} jolts`);
  const b = brawl(15, 1, 40);
  check('...and at 15 fps, where a hold is shorter than a frame and is used up by fractions', b.lost > 0.02 && b.lost <= 0.055 && b.partial > 0, `${(b.lost * 100).toFixed(1)}%, ${b.partial} part-held frames`);
  const c = brawl(60, 3, 20);
  check('above normal speed the camera is nudged but the world is never held', c.lost === 0 && c.count > 0 && c.shake > 0, `${c.count} jolts, shake ${c.shake.toFixed(2)}`);
  G.settings.reducedMotion = true;
  const d = brawl(60, 1, 10);
  G.settings.reducedMotion = false;
  check('reduced motion turns the hold and the kick off', d.lost === 0 && d.count === 0 && d.shake === 0);
  resetImpact(); G.speed = 1;
  impact(1);
  const s1 = impactScale(1 / 30), s2 = impactScale(1 / 30), s3 = impactScale(1 / 30), s4 = impactScale(1 / 30);
  const used = (1 - s1 + 1 - s2 + 1 - s3 + 1 - s4) / 30;
  check('a 70 ms hold is used up exactly, the last frame in part', s1 === 0 && s2 === 0 && s3 > 0 && s3 < 1 && s4 === 1 && Math.abs(used - 0.07) < 1e-9, `scales ${s1} ${s2} ${s3.toFixed(2)} ${s4}`);
  resetImpact();
  impact(1); impact(1);
  check('jolts come at most once a second', impactState().count === 1);
}

// ---------------------------------------------------------------- falls and reactions
const look = randomLook('valefolk', new RNG(3));
const mk = () => new Animator(makeBones(makeRig(look)));
const base = (o: Partial<AnimIn>): AnimIn => ({ speed: 0, run: false, sneak: false, stance: 'idle', action: null, t: 0, variant: 0, weapon: 'unarmed', drawn: false, limp: 0, twoHanded: false, face: 1, armL: true, armR: true, swim: false, ...o });
const dt = 1 / 60;
const run = (an: Animator, a: AnimIn, secs: number, track?: (t: number) => void) => { for (let i = 0; i < secs / dt; i++) { an.update(dt, a, 0); track?.(i * dt); } };
{
  // already lying: no buckle, no rise
  for (const [from, face] of [['carried', -1], ['sleep', 1], ['sleep', -1], ['crawl', -1]] as const) {
    const an = mk();
    run(an, base({ stance: from, face }), 2);
    let minAbs = 9;
    run(an, base({ stance: 'down', face }), 1.5, () => { minAbs = Math.min(minAbs, Math.abs(an.rootX)); });
    check(`${from} -> down keeps the body flat`, minAbs > 1.2, `nearest upright ${deg(minAbs)} deg`);
  }
  // from standing: the knees go first, then the topple
  const an = mk();
  run(an, base({ stance: 'idle' }), 1);
  let at015 = 0, at06 = 0, hipMin = 0;
  run(an, base({ stance: 'down', face: 1 }), 0.7, (t) => { if (Math.abs(t - 0.15) < dt / 2) at015 = an.rootX; if (Math.abs(t - 0.6) < dt / 2) at06 = an.rootX; hipMin = Math.min(hipMin, an.hipDrop); });
  check('standing -> down buckles at the knees before it topples', Math.abs(at015) < 0.35 && hipMin < -0.15 && Math.abs(at06) > 1.4, `pitch ${deg(at015)} deg at 0.15 s, ${deg(at06)} deg at 0.6 s, hips ${hipMin.toFixed(2)}`);
  // a blow to the head turns the face away from where it came
  const face = (dir: number) => {
    const bones = makeBones(makeRig(look));
    const a = new Animator(bones);
    a.update(dt, base({ action: 'hit', t: 0.22, hitLimb: LI.head, hitDir: dir }), 0);
    bones[0].updateMatrixWorld(true);
    return new THREE.Vector3(0, 0, 1).applyQuaternion(bones[B.head].getWorldQuaternion(new THREE.Quaternion())).x;
  };
  check('a blow to the head from the left turns the face to the right, and the other way about', face(Math.PI / 2) < -0.2 && face(-Math.PI / 2) > 0.2, `${face(Math.PI / 2).toFixed(2)} / ${face(-Math.PI / 2).toFixed(2)}`);
  // a missing arm stays still
  const am = mk();
  let maxUa = 0;
  for (let k = 0; k < 30; k++) { am.update(dt, base({ stance: 'combat', drawn: true, action: 'hit', t: k / 30, hitLimb: LI.larm, hitDir: 0.5, armL: false }), 0); maxUa = Math.max(maxUa, Math.abs(am.rx[B.uaL]), Math.abs(am.rz[B.uaL])); }
  check('a blow to a missing arm moves nothing', maxUa === 0);
}

// ---------------------------------------------------------------- the fall's direction, chosen once
{
  const W = new World();
  Object.assign(S, { W, time: 100 });
  const rng = new RNG(9);
  const person = (x: number, z: number, faction = 'drifters') => { const c = new Char(randomLook('valefolk', rng)); c.body.init('valefolk', 10); c.faction = faction; c.x = x; c.z = z; W.addChar(c); return c; };
  const me = person(0, 0, 'player'); me.dir = 0; // facing +z
  const front = person(0, 2), behind = person(0, -2);
  const v = new CharView(me, 0);
  v.update(dt, W);
  v.hit(LI.chest, front); v.fall();
  check('knocked down from the front you land on your back', v.fallFace === 1);
  v.hit(LI.chest, behind); v.fall();
  check('...from behind, on your face', v.fallFace === -1);
  S.time += 2; v.fall();
  check('with no blow this moment the fall is left to chance', v.fallFace === 0);
  v.hit(LI.head, front); v.fall();
  me.status = 'ko'; v.update(dt, W);
  v.hit(LI.head, behind); v.fall();
  check('a body already down keeps its side when it dies', v.stance === 'down' && v.fallFace === 1);
  me.status = 'up'; v.update(dt, W);
  v.hit(LI.head, behind); v.fall();
  check('...and chooses afresh once it has got up', v.fallFace === -1);
}

// ---------------------------------------------------------------- the attacked auto-pause
{
  const W = new World();
  Object.assign(S, { W, time: 500 });
  const rng = new RNG(11);
  const person = (faction: string) => { const c = new Char(randomLook('valefolk', rng)); c.body.init('valefolk', 10); c.faction = faction; c.name = faction; W.addChar(c); return c; };
  const me = person('player'), foe = person('reavers');
  G.settings.pauseOnAttacked = true;
  const pauses: string[] = [];
  on('autopause', (why: string) => pauses.push(why));
  resetAutopause();
  const blow = () => { const r = hitRule(me, foe); me.lastHitT = S.time; return r; }; // the sim records the blow after the hook
  const first = blow();
  check('the first blow on an idle person of yours pauses the game', first && G.speed === 0, pauses.join('; '));
  G.speed = 1;
  let again = false;
  for (let i = 0; i < 20; i++) { S.time += 1.5; if (blow()) again = true; }
  check('the blows that follow do not, however long the beating goes on', !again && G.speed === 1, `${pauses.length} pause in 30 s of blows`);
  S.time += 12;
  check('a new attack after a lull does', blow() && G.speed === 0);
  G.speed = 1; S.time += 12;
  me.status = 'ko';
  check('someone already down is not an idle person under attack', !blow());
}

const passed = results.filter((r) => r[1]).length;
console.log(`${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exit(1);
