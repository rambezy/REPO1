// Using consumables, timed effects, addiction, radiation and poison.

import type { Actor } from './types';
import { G, player } from './G';
import { msg, emit } from './log';
import { maxHp, hasTrait, perkRank, radResist, isPlayer } from './character';
import { rand, chance } from '../core/rng';
import { removeItem, countItem } from './actors';
import { sfx } from '../audio/sfx';
import { ITEMS } from '../data/items';
import { OBJ_SCRIPTS } from '../content/registry';

export function heal(a: Actor, n: number) {
  const before = a.hp;
  a.hp = Math.min(maxHp(a), a.hp + n);
  return a.hp - before;
}

function addEffect(a: Actor, id: string, minutes: number, e: Partial<import('./types').Effect>) {
  if (hasTrait(a, 'chemBody')) minutes *= 2;
  a.effects = a.effects.filter((x) => x.id !== id);
  a.effects.push({ id, until: G.state.time + minutes, ...e });
}

function maybeAddict(a: Actor, drug: string, pct: number) {
  if (hasTrait(a, 'chemBody')) pct *= 2;
  if (a.effects.some((e) => e.id === 'addict_' + drug)) return;
  if (chance(pct)) {
    a.effects.push({ id: 'addict_' + drug, until: G.state.time + 60 * 24 * 7, mods: drug === 'bulk' ? { STR: -1, AGI: -1 } : drug === 'clarity' ? { INT: -1, CHA: -1 } : { PER: -1, AGI: -1 } });
    if (isPlayer(a)) msg(`You are addicted to ${ITEMS[drug]?.name ?? drug}.`);
  }
}

/** Apply a consumable's effect. Returns false if it could not be used. */
export function useConsumable(user: Actor, target: Actor, id: string): boolean {
  const d = ITEMS[id];
  if (!d?.use) return false;
  const medic = perkRank(user, 'medic') ? 1.25 : 1;
  const you = isPlayer(target);
  const name = you ? 'You' : target.name;
  let used = true;
  switch (d.use) {
    case 'hypo': {
      const h = heal(target, Math.round(rand(10, 20) * medic));
      msg(`${name} ${you ? 'heal' : 'heals'} ${h} hit points.`);
      break;
    }
    case 'superHypo': {
      const h = heal(target, Math.round(rand(50, 70) * medic));
      msg(`${name} ${you ? 'heal' : 'heals'} ${h} hit points.`);
      addEffect(target, 'superHypoAfter', 60, { mods: {} });
      break;
    }
    case 'curePaste': {
      const h = heal(target, Math.round(rand(6, 12) * medic));
      msg(`${name} ${you ? 'heal' : 'heals'} ${h} hit points.`);
      addEffect(target, 'curePaste', 120, { mods: { PER: -1 } });
      break;
    }
    case 'radPurge': {
      const before = target.rads;
      target.rads = Math.max(0, target.rads - rand(40, 60));
      msg(`${name} ${you ? 'feel' : 'feels'} the radiation leaving. (-${before - target.rads} rads)`);
      break;
    }
    case 'iodine':
      addEffect(target, 'iodine', 60 * 24, {});
      msg(`${name} ${you ? 'are' : 'is'} protected against radiation for a while.`);
      break;
    case 'bulk':
      addEffect(target, 'bulk', 60 * 4, { mods: { STR: 2, END: 2 } });
      maybeAddict(target, 'bulk', 20);
      msg(`${name} ${you ? 'feel' : 'feels'} strong and sturdy.`);
      break;
    case 'clarity':
      addEffect(target, 'clarity', 60 * 4, { mods: { INT: 2, PER: 2 } });
      maybeAddict(target, 'clarity', 15);
      msg(`The world snaps into focus.`);
      break;
    case 'fury':
      addEffect(target, 'fury', 60, { ap: 2, dr: 20 });
      maybeAddict(target, 'fury', 25);
      msg(`${name} ${you ? 'feel' : 'feels'} a hot rush of rage.`);
      break;
    case 'antidote':
      target.poison = 0;
      msg(`${name} ${you ? 'are' : 'is'} no longer poisoned.`);
      break;
    case 'water': {
      const h = heal(target, 2);
      msg(`The water is warm and tastes of metal. (+${h} HP)`);
      break;
    }
    case 'food': {
      const h = heal(target, 3);
      msg(`Chewy, salty, filling. (+${h} HP)`);
      break;
    }
    case 'beer':
      addEffect(target, 'beer', 90, { mods: { PER: -1, CHA: 1 } });
      msg(`The ale is sour and warm and exactly what you needed.`);
      break;
    case 'geiger':
      sfx('geiger');
      msg(`The counter reads: ${Math.round(target.rads)} rads absorbed. ${radLevelText(target.rads)}`);
      return true; // not consumed
    case 'flare':
      G.state.flags._flareUntil = G.state.time + 60;
      msg('The flare sputters to life, casting a red glow.');
      break;
    default: {
      const s = OBJ_SCRIPTS['use:' + d.use];
      if (s) {
        const res = s((window as any).__ctx(), { id: id, kind: 'item', q: user.q, r: user.r }, user);
        if (res === false) return false;
        return true; // scripts consume manually
      }
      used = false;
    }
  }
  if (used) {
    sfx('drug');
    emit('hud');
  }
  return used;
}

export function radLevelText(r: number): string {
  if (r < 50) return 'Nothing to worry about.';
  if (r < 150) return 'You feel slightly queasy.';
  if (r < 400) return 'Minor radiation sickness.';
  if (r < 600) return 'Advanced radiation sickness!';
  if (r < 1000) return 'Critical radiation poisoning!';
  return 'Lethal dose.';
}

export function radMods(r: number): Partial<Record<import('../data/stats').StatKey, number>> {
  if (r < 150) return {};
  if (r < 400) return { END: -1 };
  if (r < 600) return { END: -1, AGI: -1, STR: -1 };
  if (r < 1000) return { END: -3, AGI: -2, STR: -2, PER: -1 };
  return { END: -5, AGI: -5, STR: -5, PER: -3 };
}

export function addRads(a: Actor, amount: number) {
  const eff = amount * (1 - radResist(a) / 100);
  const before = a.rads;
  a.rads += eff;
  if (isPlayer(a) && Math.floor(before / 50) !== Math.floor(a.rads / 50)) {
    sfx('geiger');
    if (countItem(a, 'geiger')) msg(`Your rad counter clicks: ${Math.round(a.rads)} rads.`);
    else msg('You feel a strange warmth on your skin.');
  }
  syncRadEffect(a);
}

export function syncRadEffect(a: Actor) {
  a.effects = a.effects.filter((e) => e.id !== 'radsick');
  const m = radMods(a.rads);
  if (Object.keys(m).length) a.effects.push({ id: 'radsick', until: Infinity, mods: m });
}

/** Called every game minute for every actor with effects. */
export function tickEffects(a: Actor, minutes: number) {
  const t = G.state.time;
  const expired = a.effects.filter((e) => e.until <= t);
  if (expired.length) {
    a.effects = a.effects.filter((e) => e.until > t);
    for (const e of expired) {
      if (!isPlayer(a)) continue;
      if (e.id.startsWith('addict_')) msg('You have kicked your addiction.');
      else if (['bulk', 'clarity', 'fury'].includes(e.id)) {
        msg('The drug wears off.');
        // Withdrawal if addicted.
      } else if (e.id === 'superHypoAfter') {
        a.hp = Math.max(1, a.hp - rand(3, 8));
        msg('The surge-hypo leaves your heart pounding. You lose a few hit points.');
      }
    }
  }
  if (a.poison > 0 && !a.dead) {
    const ticks = Math.floor(minutes / 10) + (chance(((minutes % 10) / 10) * 100) ? 1 : 0);
    for (let i = 0; i < ticks && a.poison > 0; i++) {
      a.poison -= 1;
      if (a.hp > 1) a.hp -= 1;
      if (isPlayer(a) && i === 0 && chance(20)) msg('You feel the poison burning in your veins.');
    }
  }
}

export function useItemFromInventory(user: Actor, id: string, target: Actor = user): boolean {
  if (!countItem(user, id)) return false;
  const ok = useConsumable(user, target, id);
  if (ok && ITEMS[id].use !== 'geiger' && !OBJ_SCRIPTS['use:' + ITEMS[id].use]) removeItem(user, id, 1);
  return ok;
}

export function playerRadTick(perMin: number, minutes: number) {
  if (perMin <= 0) return;
  addRads(player(), perMin * minutes);
}
