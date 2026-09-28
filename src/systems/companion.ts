// Crumb: the family dog. Follows, fights, sniffs out herbs, warns of hidden
// enemies, and can be told to stay. He never dies; hurt, he limps away and
// comes back later.

import { G } from '../G';
import { Actor, Brain } from '../world/actor';
import { here, addActor, findActor, removeActor } from '../world/world';
import { S } from '../state';
import { ANIMAL_LOOKS } from '../gfx/animals';
import { rand, dirFromVec } from '../engine/util';
import { startAttack, areHostile, canAct } from './combat';
import { walkTo } from './ai';
import { sfx } from '../audio/sfx';
import { emit as fx } from '../engine/fx';
import { addXp, hasPerk, skill } from './stats';
import { notify } from '../ui/notify';
import { conversation, choose, narrate } from './script';
import { emit } from '../engine/events';

export const isDog = (a: Actor) => a.charId === 'crumb';

class DogBrain implements Brain {
  name = 'dog';
  update(a: Actor, dt: number) {
    if (a.dead) return;
    if (a.mem.hold) return;
    const sc = a.mem.script;
    if (sc) {
      const d = Math.hypot(sc.x - a.x, sc.y - a.y);
      if (d < 6 || (sc.t = (sc.t || 0) + dt) > sc.timeout) { a.mem.script = null; a.pose = 'sit'; sc.resolve(); return; }
      step(a, sc.x, sc.y, dt, sc.run ? 1.8 : 1.1);
      return;
    }
    const p = G.player;
    // limping away when hurt
    if (S.dog.downUntil && S.dog.downUntil > S.minutes) { a.hidden = true; a.solid = false; return; }
    if (a.hidden && S.dog.downUntil) { a.hidden = false; a.solid = true; a.hp = a.maxHp; a.x = p.x + 30; a.y = p.y + 10; S.dog.downUntil = undefined; notify('Crumb comes limping back, tail wagging.', 'info'); sfx('bark', a.x, a.y); }

    // warn about lurking enemies
    a.mem.warnT = (a.mem.warnT || 0) - dt;
    const hostile = nearestHostile(a, 170);
    if (hostile && a.mem.warnT <= 0 && !hostile.mem.alerted) { a.mem.warnT = 6; a.emoteShow('!', 1.2); sfx('growl', a.x, a.y); }

    // fighting
    const mode = S.dog.mode;
    const fightTarget = mode !== 'stay' ? (a.mem.attackTarget ? here().find((x) => x.id === a.mem.attackTarget && !x.dead && !x.mem.down) : null) || (hostile && Math.hypot(hostile.x - p.x, hostile.y - p.y) < 120 && (hostile.mem.alerted || hostile.combat.phase !== 'none') ? hostile : null) : null;
    if (fightTarget) {
      const d = Math.hypot(fightTarget.x - a.x, fightTarget.y - a.y);
      if (d > 14) step(a, fightTarget.x, fightTarget.y, dt, 1.9);
      else {
        a.dir = dirFromVec(fightTarget.x - a.x, fightTarget.y - a.y, a.dir);
        if (canAct(a) && a.combat.cooldown <= 0) {
          a.combat.weapon.slash = 8 + skill('houndmaster') * 1.5 + (hasPerk('good_boy') ? 6 : 0);
          if (startAttack(a, 'bite', Math.atan2(fightTarget.y - a.y, fightTarget.x - a.x), 0.8)) {
            a.combat.cooldown = rand.range(0.8, 1.4);
            sfx('growl', a.x, a.y);
            if (Math.random() < 0.3) addXp('houndmaster', 1);
          }
        }
      }
      return;
    }
    a.mem.attackTarget = null;
    if (mode === 'stay') { a.pose = 'sit'; return; }
    // seek: run to something interesting
    if (a.mem.seek) {
      const s = a.mem.seek as { x: number; y: number; t: number };
      s.t -= dt;
      if (Math.hypot(s.x - a.x, s.y - a.y) > 10 && s.t > 0) { step(a, s.x, s.y, dt, 1.6); return; }
      if (s.t > 0) { a.pose = 'sit'; if (Math.random() < dt) sfx('bark', a.x, a.y); return; }
      a.mem.seek = null;
    }
    // follow
    const d = Math.hypot(p.x - a.x, p.y - a.y);
    if (d > 400 || p.mapId !== a.mapId) { a.mapId = p.mapId; a.x = p.x - 16; a.y = p.y + 6; a.mem.path = null; return; }
    if (d > 30) { step(a, p.x - Math.sign(p.x - a.x) * 12, p.y + 4, dt, d > 90 ? 1.9 : d > 50 ? 1.4 : 1); a.mem.idleT = 0; }
    else {
      a.mem.idleT = (a.mem.idleT || 0) + dt;
      if (a.mem.idleT > 6) a.pose = 'lie';
      else if (a.mem.idleT > 2) a.pose = 'sit';
      else a.pose = 'idle';
      if (a.mem.idleT > 2 && Math.random() < dt * 0.1) a.dir = dirFromVec(p.x - a.x, p.y - a.y, a.dir);
    }
  }
  onHit(a: Actor) {
    if (a.hp < a.maxHp * 0.25) {
      sfx('whine', a.x, a.y);
      S.dog.downUntil = S.minutes + 60 * 3;
      a.hp = a.maxHp * 0.5;
      notify('Crumb yelps and bolts into the bushes. He\'ll find you later.', 'bad');
      a.hidden = true;
    } else if (hasPerk('guardian')) {
      const by = here().find((x) => x.id === a.combat.lastHitBy);
      if (by) a.mem.attackTarget = by.id;
    }
  }
}

function step(a: Actor, x: number, y: number, dt: number, mul: number) {
  const dx = x - a.x, dy = y - a.y;
  const l = Math.hypot(dx, dy) || 1;
  const sp = a.speed * mul;
  const moved = a.move(G.map, (dx / l) * sp * dt, (dy / l) * sp * dt, here());
  if (!moved) a.move(G.map, (-dy / l) * sp * dt, (dx / l) * sp * dt, here());
  a.dir = dirFromVec(dx, dy, a.dir);
  a.pose = 'walk';
  a.running = mul > 1.3;
}

function nearestHostile(a: Actor, r: number): Actor | null {
  let best: Actor | null = null, bd = r;
  for (const o of here()) {
    if (o.dead || o.hidden || o.mem.down || !o.hostile || o.isAnimal && o.animal?.species === 'goose') continue;
    const d = Math.hypot(o.x - a.x, o.y - a.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export function makeCrumb(): Actor {
  let a = findActor('crumb');
  if (a) return a;
  a = new Actor('Crumb', 'crumb');
  a.charId = 'crumb';
  a.animal = ANIMAL_LOOKS.crumb;
  a.faction = 'dog';
  a.speed = 60;
  a.hitW = 10;
  a.hp = a.maxHp = 70;
  a.unkillable = true;
  a.brain = new DogBrain();
  a.combat.weapon = { id: 'teeth', kind: 'fist', slash: 10, stab: 0, blunt: 0, reach: 14, speed: 1.2, staminaCost: 5 };
  a.mem.follow = 'player';
  a.noCollide = true;
  return a;
}

export function crumbJoins(x: number, y: number) {
  const a = makeCrumb();
  S.dog.owned = true;
  addActor(a, G.map.id, x, y);
  return a;
}
export function crumbLeaves() {
  const a = findActor('crumb');
  if (a) removeActor(a);
}

export function petDog(a: Actor) {
  sfx('bark', a.x, a.y);
  for (let i = 0; i < 3; i++) fx('heart', a.x + rand.range(-4, 4), a.y - 16);
  a.pose = 'sit';
  a.mem.idleT = 3;
  S.dog.affection = Math.min(100, S.dog.affection + 2);
  if (!S.flags['pet_today_' + Math.floor(S.minutes / 1440)]) {
    S.flags['pet_today_' + Math.floor(S.minutes / 1440)] = true;
    addXp('houndmaster', 3);
    notify(pick(['Crumb leans his whole weight against your legs.', 'Crumb rolls over, demanding belly rubs as tribute.', 'Crumb licks your hand. It smells of whatever he found in the ditch.', 'His tail thumps the ground like a drum.']), 'info');
  }
  emit('pet');
}
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Dog command menu (Q). */
export async function dogCommands() {
  const a = findActor('crumb');
  if (!a || !S.dog.owned || a.mapId !== G.map.id || a.hidden) { if (S.dog.owned) notify('Crumb isn\'t here.', 'bad', 1800); return; }
  await conversation(async () => {
    await narrate('Crumb looks up at you, ears pricked.');
    const c = await choose([
      { id: 'follow', text: 'Heel, Crumb.' },
      { id: 'stay', text: 'Stay. Good boy.' },
      { id: 'attack', text: 'Get them!', if: () => !!nearestHostile(a, 200) },
      { id: 'seek', text: 'Seek! Find something!', tag: hasPerk('nose') ? undefined : 'Hound 3', tagState: hasPerk('nose') ? undefined : 'fail', locked: !hasPerk('nose') },
      { id: 'never', text: 'Never mind.' },
    ]);
    addXp('houndmaster', 0.5);
    if (c === 'follow') { S.dog.mode = 'follow'; sfx('bark', a.x, a.y); }
    if (c === 'stay') { S.dog.mode = 'stay'; a.pose = 'sit'; }
    if (c === 'attack') { S.dog.mode = 'follow'; const h = nearestHostile(a, 200); if (h) a.mem.attackTarget = h.id; }
    if (c === 'seek') {
      let best: { x: number; y: number } | null = null, bd = 260;
      for (const o of G.map.queryObjects(a.x - 260, a.y - 260, a.x + 260, a.y + 260)) {
        if (o.hidden) continue;
        const interesting = o.kind === 'herb' || o.interact?.type === 'item' || o.interact?.type === 'loot' || o.data?.buried;
        if (!interesting) continue;
        const d = Math.hypot(o.x - a.x, o.y - a.y);
        if (d < bd) { bd = d; best = { x: o.x, y: o.y }; }
      }
      if (best) { a.mem.seek = { ...best, t: 12 }; sfx('bark', a.x, a.y); }
      else notify('Crumb sniffs around and sneezes. Nothing here.', 'info');
    }
  });
}

export { walkTo };
