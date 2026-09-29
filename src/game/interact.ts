// Player interactions: walking, using objects, talking, looting, skills.

import { G, player } from './G';
import type { Actor, MapObject } from './types';
import { hexDist, type Hex } from '../core/hex';
import { pathTo, walk, openDoor, stopWalking } from './movement';
import { msg, emit } from './log';
import { ctx, setSpeaker, bark } from './script';
import { OBJ_SCRIPTS } from '../content/registry';
import { PROTOS } from '../data/protos';
import { ITEMS } from '../data/items';
import { skill, stat, maxHp, isPlayer, inventoryWeight, carryWeight } from './character';
import { chance, rand } from '../core/rng';
import { giveXp } from './progress';
import { heal } from './effects';
import { aggro, startCombat, woundText, nameOf } from './combat';
import { addItem, countItem } from './actors';
import { sfx } from '../audio/sfx';
import { advanceTime } from './time';
import { cap } from '../core/util';
import type { SkillKey } from '../data/stats';

let busyToken = 0;

/** Walk next to a target (or onto it), then run `then`. Cancels previous orders. */
async function approach(target: Hex, adjacent: boolean, then?: () => void, reach = 1) {
  const p = player();
  const token = ++busyToken;
  if (hexDist(p, target) <= reach && adjacent) {
    then?.();
    return;
  }
  if (inventoryWeight(p) > carryWeight(p)) {
    msg('You are carrying too much to move. Drop something.');
    return;
  }
  const path = pathTo(p, target, adjacent);
  if (!path) {
    msg('You cannot get there.');
    return;
  }
  if (G.combat) {
    if (!G.combat.playerTurn || G.combat.busy) return;
    if ((p._ap ?? 0) <= 0) return;
    G.combat.busy = true;
    await walk(p, path, p._ap);
    G.combat.busy = false;
    emit('hud');
    if (token === busyToken && hexDist(p, target) <= reach && adjacent) then?.();
    autoEndTurn();
    return;
  }
  const ok = await walk(p, path);
  if (token !== busyToken) return;
  if (ok || (adjacent && hexDist(p, target) <= reach)) then?.();
}

export function autoEndTurn() {
  const p = player();
  if (G.combat?.playerTurn && !G.combat.busy && (p._ap ?? 0) <= 0) {
    import('./combat').then((c) => c.endPlayerTurn());
  }
}

export function cancelOrders() {
  busyToken++;
  stopWalking(player());
}

export function walkTo(q: number, r: number, run = false) {
  const m = G.map;
  if (!m) return;
  (player() as any)._run = run;
  if (!m.walkable(q, r, { ignoreDoors: true })) {
    msg('You can\'t go there.');
    return;
  }
  approach({ q, r }, false);
}

// ----------------------------------------------------------------- objects

export function objName(o: MapObject): string {
  if (o.name) return o.name;
  const n: Record<string, string> = {
    door: 'door', hatch: 'blast hatch', gate: 'gate', crate: 'crate', locker: 'locker', desk: 'desk', footlocker: 'footlocker',
    fridge: 'old refrigerator', bookcase: 'bookcase', shelf: 'shelf', chest: 'chest', safe: 'safe', cabinet: 'cabinet',
    terminal: 'computer terminal', bed: 'bed', table: 'table', chair: 'chair', barrel: 'barrel', rock: 'rock', deadtree: 'dead tree',
    cactus: 'cactus', car: 'rusted car', campfire: 'campfire', toolbox: 'toolbox', bag: 'sack', barrelc: 'barrel', well: 'well',
  };
  return n[o.kind] ?? o.kind.replace(/_/g, ' ');
}

export function lookText(target: Actor | MapObject | { q: number; r: number }): string {
  if ('uid' in target) {
    const a = target as Actor;
    if (isPlayer(a)) return `That's you. You are ${woundText(a)}.`;
    const p = PROTOS[a.proto];
    const desc = a.npc ? a.name : p?.desc ?? a.name.toLowerCase();
    if (a.dead) return `You see: the body of ${a.npc ? a.name : desc}.`;
    return `You see: ${desc}. ${cap(a.npc ? 'they are' : 'it is')} ${woundText(a)}.`;
  }
  if ('kind' in target) {
    const o = target as MapObject;
    let t = `You see: ${o.desc ?? 'a ' + objName(o)}.`;
    if ((o.kind === 'door' || o.kind === 'hatch' || o.kind === 'gate') && o.locked) t += ' It is locked.';
    if (o.container && o.locked) t += ' It is locked.';
    return t;
  }
  return 'You see nothing of interest.';
}

export function useObject(o: MapObject) {
  const reach = o.kind === 'terminal' || o.blocks !== false ? 1 : 0;
  approach(o, reach > 0, () => doUseObject(o), reach);
}

function doUseObject(o: MapObject) {
  const p = player();
  if (G.combat) {
    if ((p._ap ?? 0) < 3) {
      msg('Not enough action points.');
      return;
    }
    p._ap! -= 3;
    emit('hud');
  }
  const script = o.onUse ? OBJ_SCRIPTS[o.onUse] : undefined;
  if (script && script(ctx(), o, p) !== false) return;
  if (o.trap) {
    triggerTrap(o);
    return;
  }
  if (o.kind === 'door' || o.kind === 'hatch' || o.kind === 'gate') {
    if (o.open) {
      if (G.map!.actorAt(o.q, o.r) || G.map!.groundAt(o.q, o.r).length) {
        msg('Something is in the way.');
        return;
      }
      o.open = false;
      sfx('door');
      G.map!.version++;
    } else openDoor(o, p);
    return;
  }
  if (o.container) {
    if (o.locked) {
      if (o.key && countItem(p, o.key)) {
        o.locked = 0;
        msg('You unlock it with your key.');
      } else {
        msg(`The ${objName(o)} is locked.`);
        sfx('locked');
        return;
      }
    }
    o.open = true;
    import('../ui/loot').then((l) => l.openLoot({ kind: 'object', obj: o }));
    return;
  }
  msg(lookText(o));
}

function triggerTrap(o: MapObject) {
  const dmg = rand(8, 20) + (o.trap ?? 0) / 5;
  msg(`A trap goes off! You take ${Math.round(dmg)} damage.`);
  sfx('explode');
  o.trap = 0;
  const p = player();
  p.hp -= Math.round(dmg);
  if (p.hp <= 0) import('./combat').then((c) => c.kill(p, null, 'explode'));
  emit('hud');
}

// ----------------------------------------------------------------- actors

export function talkTo(a: Actor) {
  if (a.dead) {
    approach(a, true, () => import('../ui/loot').then((l) => l.openLoot({ kind: 'body', actor: a })));
    return;
  }
  if (G.combat) {
    msg('No time for talk now!');
    return;
  }
  if (a.hostile) {
    msg(`${nameOf(a, true)} doesn't look interested in talking.`);
    return;
  }
  approach(a, true, () => {
    a.facing = dirFrom(a, player());
    player().facing = dirFrom(player(), a);
    stopWalking(a);
    if (a.dialog) {
      setSpeaker(a);
      import('../ui/dialogue').then((d) => d.openDialogue(a.dialog!, a));
    } else if (a.companion) {
      import('../ui/dialogue').then((d) => d.openCompanionMenu(a));
    } else {
      bark(a, genericBark(a));
    }
  }, 3);
}

import { dirTo } from '../core/hex';
function dirFrom(a: Hex, b: Hex) {
  return dirTo(a, b);
}

function genericBark(a: Actor): string {
  const p = PROTOS[a.proto];
  const lines: Record<string, string[]> = {
    human: ['Hot one today.', 'Keep your hands where I can see them.', 'Seen any water sellers?', 'Move along, stranger.', 'Nice jumpsuit.', 'Don\'t cause trouble.'],
    withered: ['Don\'t stare. It\'s rude.', 'Smoothskin. Hm.', 'We were here first, you know.'],
    ox: ['Mrrrph.'],
  };
  const body = p?.look.body ?? 'human';
  const pool = lines[body] ?? ['...'];
  return pool[Math.floor(Math.random() * pool.length)];
}

export function lootGround(q: number, r: number) {
  approach({ q, r }, false, () => {
    const items = G.map!.groundAt(q, r);
    if (!items.length) return;
    import('../ui/loot').then((l) => l.openLoot({ kind: 'ground', q, r }));
  });
}

export function pickUpAllAt(q: number, r: number) {
  const m = G.map!;
  const items = m.groundAt(q, r);
  const p = player();
  for (const g of items) {
    if (g.stack.ammo !== undefined || !['misc', 'drug', 'ammo', 'key', 'book'].includes(ITEMS[g.stack.id]?.type ?? '')) p.inv.push(g.stack);
    else addItem(p, g.stack.id, g.stack.n);
    msg(`You pick up ${g.stack.n > 1 ? g.stack.n + ' x ' : ''}${ITEMS[g.stack.id]?.name}.`);
  }
  m.ground = m.ground.filter((g) => !items.includes(g));
  sfx('pickup');
}

// ----------------------------------------------------------------- skills

const USES_PER_DAY = 3;

export function useSkill(k: SkillKey, target: Actor | MapObject | null) {
  const p = player();
  if (k === 'sneak') {
    G.state.flags._sneak = !G.state.flags._sneak;
    msg(G.state.flags._sneak ? 'You begin sneaking.' : 'You stop sneaking.');
    emit('hud');
    return;
  }
  if (!target) {
    if (k === 'firstAid' || k === 'doctor') return healSkill(k, p);
    msg('Choose a target for the skill.');
    return;
  }
  if ('uid' in target) {
    const a = target as Actor;
    if (k === 'firstAid' || k === 'doctor') {
      if (a === p) return healSkill(k, a);
      return approach(a, true, () => healSkill(k, a));
    }
    if (k === 'steal') return approach(a, true, () => steal(a));
    if (k === 'science' || k === 'repair') {
      if (a.proto === 'sentry' && !a.dead) {
        return approach(a, true, () => {
          if (chance(skill(p, k) - 60)) {
            msg('You find the maintenance panel and shut the drone down.');
            import('./combat').then((c) => c.kill(a, p, 'laser'));
          } else {
            msg('You fumble with the panel. The drone notices!');
            aggro(a);
            startCombat(a);
          }
        });
      }
    }
    msg('That doesn\'t seem to do anything.');
    return;
  }
  const o = target as MapObject;
  approach(o, true, () => {
    const script = o.onUse ? OBJ_SCRIPTS[o.onUse] : undefined;
    const handled = script ? script(ctx(), o, p, k) !== false : false;
    if (handled && k !== 'lockpick' && !(k === 'traps' && o.trap)) return;
    if (k === 'lockpick') return pickLock(o);
    if (k === 'traps') return disarm(o);
    if (script) return;
    msg('That doesn\'t seem to do anything.');
  });
}

function pickLock(o: MapObject) {
  const p = player();
  if (!o.locked) {
    msg('It isn\'t locked.');
    return;
  }
  const bonus = countItem(p, 'lockpicks') ? 20 : 0;
  const pct = skill(p, 'lockpick') + bonus - o.locked;
  if (chance(Math.max(5, Math.min(95, pct)))) {
    o.locked = 0;
    msg('You pick the lock.');
    sfx('click');
    giveXp(25);
  } else {
    msg('You fail to pick the lock.');
    sfx('locked');
    if (pct < 0 && chance(20)) msg('This lock is beyond your skill.');
  }
  advanceTime(1);
}

function disarm(o: MapObject) {
  const p = player();
  if (!o.trap) {
    msg('You find no traps.');
    return;
  }
  if (chance(skill(p, 'traps') - o.trap)) {
    msg('You disarm the trap.');
    o.trap = 0;
    giveXp(50);
  } else {
    triggerTrap(o);
  }
}

function healSkill(k: 'firstAid' | 'doctor', a: Actor) {
  const p = player();
  const uses = k === 'firstAid' ? G.state.firstAidUses : G.state.doctorUses;
  const day = Math.floor(G.state.time / 1440);
  if (uses.t !== day) {
    uses.t = day;
    uses.n = 0;
  }
  if (uses.n >= USES_PER_DAY) {
    msg('You have used that skill enough for today.');
    return;
  }
  const bonus = countItem(p, 'medkit') ? 20 : 0;
  if (k === 'doctor') {
    const limbs = Object.keys(a.crippled).filter((l) => (a.crippled as any)[l]);
    if (!limbs.length && a.hp >= maxHp(a)) {
      msg('Nothing to treat.');
      return;
    }
    uses.n++;
    if (chance(skill(p, 'doctor') + bonus)) {
      if (limbs.length) {
        delete (a.crippled as any)[limbs[0]];
        msg(`You set the injured ${limbs[0].replace('l', 'left ').replace('r', 'right ')}.`.replace('left eft', 'left').replace('right ight', 'right'));
      }
      const h = heal(a, rand(4, 10));
      msg(`${nameOf(a, true)} ${isPlayer(a) ? 'heal' : 'heals'} ${h} hit points.`);
      giveXp(50);
    } else msg('You fail to do any good.');
    advanceTime(60);
    return;
  }
  if (a.hp >= maxHp(a)) {
    msg(isPlayer(a) ? 'You are not hurt.' : `${a.name} is not hurt.`);
    return;
  }
  uses.n++;
  if (chance(skill(p, 'firstAid') + bonus)) {
    const h = heal(a, rand(1, 10));
    msg(`${nameOf(a, true)} ${isPlayer(a) ? 'heal' : 'heals'} ${h} hit points.`);
    giveXp(25);
  } else msg('You fail to do any good.');
  advanceTime(30);
}

function steal(a: Actor) {
  if (a.dead) return;
  import('../ui/loot').then((l) => l.openLoot({ kind: 'steal', actor: a }));
}

export function stealRoll(a: Actor, value: number, weight: number): boolean {
  const p = player();
  const facingAway = Math.abs(((a.facing - dirTo(a, p) + 6) % 6)) >= 2;
  let pct = skill(p, 'steal') - value / 20 - weight * 3 + (facingAway ? 20 : 0) - stat(a, 'PER') * 2 + (G.state.flags._sneak ? 10 : 0);
  if (a.knockedOut) pct = 95;
  const ok = chance(Math.max(5, Math.min(95, pct)));
  if (ok) giveXp(10);
  return ok;
}
