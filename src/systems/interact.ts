// Everything that happens when the player presses Interact.

import { G } from '../G';
import { Actor } from '../world/actor';
import { MapObject } from '../world/map';
import { interactHooks, Target } from './player';
import { travel } from './transition';
import { S, isNight } from '../state';
import { notify, esc } from '../ui/notify';
import { item } from '../content/items';
import { addItem, count, has, addMoney } from './inventory';
import { addXp, hasPerk, skill, addBuff } from './stats';
import { sfx } from '../audio/sfx';
import { emit } from '../engine/events';
import { openLoot, openBodyLoot } from '../ui/loot';
import { sleepMenu, messageBox } from '../ui/modal';
import { readBook } from '../ui/reader';
import { talkTo, hasTalk } from './talk';
import { commitCrime, isOwnedByOther } from './crime';
import { lockpick } from '../ui/minigames/lockpick';
import { openBench } from './benches';
import { petDog, isDog } from './companion';
import { openTravel } from '../ui/worldmap';
import { openNotice } from '../content/notices';
import { conversation, narrate } from './script';

export const HERB_REGROW_MIN = 60 * 24 * 2; // two days

/** Story hooks: return true to take over the interaction. */
export const storyHooks = {
  bed: null as null | ((owner?: string) => boolean),
};

function objLabel(o: MapObject): { label: string; crime?: boolean } | null {
  const it = o.interact!;
  switch (it.type) {
    case 'door': {
      if (it.locked && !S.flags['unlocked:' + (o.key || o.id)] && !(it.key && has(it.key))) return { label: `${it.label || 'Door'} (locked)`, crime: !!it.owner };
      return { label: it.label || (o.name ? `Enter ${o.name}` : 'Open door') };
    }
    case 'chest': {
      const owned = isOwnedByOther(it.owner);
      const locked = it.locked && !S.flags['unlocked:' + it.container];
      return { label: `${owned ? 'Steal from' : 'Open'} ${it.label || 'chest'}${locked ? ' (locked)' : ''}`, crime: owned };
    }
    case 'bed': {
      const owned = isOwnedByOther(it.owner) && !it.free;
      return { label: owned ? `${it.label || 'Bed'} (not yours)` : it.label || 'Sleep', crime: owned };
    }
    case 'herb': {
      if (S.picked[it.key] && S.picked[it.key] > S.minutes) return null;
      return { label: `Pick ${item(it.herb).name}` };
    }
    case 'sign': return { label: it.label || 'Read sign' };
    case 'script': return { label: it.label };
    case 'bench': return { label: it.label || ({ alchemy: 'Use alchemy bench', grindstone: 'Sharpen blade', forge: 'Work the forge', anvil: 'Use anvil' } as Record<string, string>)[it.bench] };
    case 'water': return { label: it.label || (it.wash ? 'Wash' : 'Drink') };
    case 'shrine': return { label: it.label || 'Pray' };
    case 'travel': return { label: it.label || 'Travel' };
    case 'item': {
      if (it.key && S.looted[it.key]) return null;
      const owned = isOwnedByOther(it.owner);
      return { label: `${owned ? 'Steal' : 'Take'} ${item(it.item).name}${it.count > 1 ? ` ×${it.count}` : ''}`, crime: owned };
    }
    case 'sit': return { label: it.label || 'Sit' };
    case 'read': return { label: it.label || 'Read' };
    case 'dice': return { label: it.label || 'Play dice' };
    case 'notice': return { label: it.label || 'Read notices' };
    case 'loot': return { label: it.label || 'Search' };
  }
  return null;
}

function actorLabel(a: Actor): { label: string; crime?: boolean } | null {
  if (a === G.player || !a.talkable && !a.dead) return null;
  if (isDog(a) && !a.dead) return { label: `Pet ${a.name}` };
  if (a.dead || a.mem.down) {
    if (a.isAnimal) {
      if (a.mem.skinned) return null;
      return { label: `Skin ${a.name}` };
    }
    if (a.mem.looted && !(S.containers['body:' + a.id]?.length)) return null;
    return { label: `Search ${a.name}`, crime: !a.hostile && !a.mem.wasHostile && !a.dead };
  }
  if (a.surrendered) return { label: `Spare ${a.name}` };
  if (a.hostile) return null;
  if (a.mem.label) return { label: a.mem.label };
  if (a.mem.sleeping || a.pose === 'sleep') return { label: `Wake ${a.name}` };
  if (a.charId && hasTalk(a.charId)) return { label: `Talk to ${a.mem.introduced || S.flags['met_' + a.charId] || ['radek', 'marta', 'lida', 'pavel', 'hanka'].includes(a.charId) ? a.name : a.mem.stranger || a.name}` };
  if (a.isAnimal) return null;
  return { label: `Talk to ${a.name}` };
}

async function runTarget(t: Target) {
  if (t.kind === 'actor') return interactActor(t.a);
  return interactObj(t.o);
}

async function interactActor(a: Actor) {
  if (isDog(a) && !a.dead) { petDog(a); return; }
  if (a.dead || a.mem.down) {
    if (a.isAnimal) { skinAnimal(a); return; }
    if (!a.dead && !a.hostile && !a.mem.wasHostile) commitCrime('robbery', 25, a);
    openBodyLoot(a);
    return;
  }
  if (a.surrendered) {
    await conversation(async () => {
      const { spareDialogue } = await import('./mercy');
      await spareDialogue(a);
    });
    return;
  }
  a.face(G.player.x, G.player.y);
  G.player.face(a.x, a.y);
  await talkTo(a);
}

function skinAnimal(a: Actor) {
  a.mem.skinned = true;
  const sp = a.animal!.species;
  const drops: Record<string, [string, number][]> = {
    deer: [['deer_hide', 1], ['raw_meat', 2]], wolf: [['wolf_pelt', 1]], boar: [['boar_hide', 1], ['raw_meat', 3]],
    hare: [['hare_pelt', 1], ['raw_meat', 1]], fox: [['hare_pelt', 1]], sheep: [['raw_meat', 2]], cow: [['raw_meat', 4]],
    chicken: [['raw_meat', 1], ['feather', 3]], goose: [['raw_meat', 1], ['feather', 5]],
  };
  for (const [id, n] of drops[sp] || []) addItem(id, n, { stolen: !!a.mem.owned });
  if (a.animal?.antlers) addItem('antlers', 1);
  addXp('herbalism', 1);
  sfx('hit_flesh');
  a.hidden = true;
  if (a.mem.poached || (sp === 'deer' || sp === 'boar') && G.map.regionAt(a.x, a.y)?.owner === 'bertram') {
    commitCrime('poaching', 20, null);
  }
}

async function interactObj(o: MapObject) {
  const it = o.interact!;
  switch (it.type) {
    case 'door': {
      const lockedKey = 'unlocked:' + (o.key || o.id);
      if (it.locked && !S.flags[lockedKey]) {
        if (it.key && has(it.key)) { S.flags[lockedKey] = true; sfx('unlock'); }
        else {
          if (!has('lockpick')) { notify('It is locked. You would need a key, or a lockpick.', 'bad'); sfx('lockclick'); return; }
          const ok = await lockpick(it.locked);
          if (!ok) return;
          S.flags[lockedKey] = true;
          if (it.owner) commitCrime('trespass', 10, null);
        }
      }
      if (it.night && isNight() && it.owner && !S.flags[lockedKey]) { notify('The door is barred for the night.', 'bad'); return; }
      emit('door', it.to, o);
      await travel(it.to, it.spawn, undefined, { sound: 'door' });
      return;
    }
    case 'chest': {
      if (it.locked && !S.flags['unlocked:' + it.container] && !(it.key && has(it.key))) {
        if (!has('lockpick')) { notify('The chest is locked.', 'bad'); sfx('lockclick'); return; }
        const ok = await lockpick(it.locked);
        if (!ok) return;
        S.flags['unlocked:' + it.container] = true;
      }
      sfx('chest');
      openLoot(it.container, it.label || 'Chest', isOwnedByOther(it.owner));
      return;
    }
    case 'bed': {
      if (storyHooks.bed && storyHooks.bed(it.owner)) return;
      if (isOwnedByOther(it.owner) && !it.free) {
        notify('This is not your bed. Sleeping here would be trespassing.', 'bad');
        return;
      }
      sleepMenu(it.owner === 'inn' ? 1.05 : it.owner === 'player' ? 1 : 0.85);
      return;
    }
    case 'herb': {
      if (S.picked[it.key] && S.picked[it.key] > S.minutes) return;
      let n = 1;
      if (hasPerk('green_thumb')) n++;
      if (skill('herbalism') >= 6 && Math.random() < 0.3) n++;
      addItem(it.herb, n, { quiet: true });
      notify(`Gathered <b>${esc(item(it.herb).name)}</b>${n > 1 ? ` ×${n}` : ''}.`, 'item', 2200);
      sfx('herb');
      addXp('herbalism', 2);
      S.picked[it.key] = S.minutes + HERB_REGROW_MIN;
      o.hidden = true;
      emit('gather', it.herb);
      return;
    }
    case 'sign': await conversation(() => narrate(it.text)); return;
    case 'script': emit('script:' + it.script, o, it.arg); return;
    case 'bench': openBench(it.bench); return;
    case 'water': {
      if (it.wash) {
        S.dirt = Math.max(0, S.dirt - 60);
        G.player.combat.bleeding = 0;
        notify('You scrub the dirt and blood from your face and hands.', 'info');
        sfx('splash');
      } else {
        S.drunk = Math.max(0, S.drunk - 15);
        G.player.stamina = G.player.maxStamina;
        notify('Cold water. You feel clearer.', 'info', 2000);
        sfx('drink');
      }
      return;
    }
    case 'shrine': {
      addBuff('blessed', 240);
      notify('You kneel and pray. <b>Blessed</b>: a steadier hand for a while.', 'skill');
      emit('pray');
      return;
    }
    case 'travel': openTravel(it.place); return;
    case 'item': {
      if (it.key && S.looted[it.key]) return;
      const owned = isOwnedByOther(it.owner);
      if (owned && !commitCrime('theft', item(it.item).value * it.count, null, true)) { /* seen */ }
      if (it.item === 'coins') addMoney(it.count); else addItem(it.item, it.count, { stolen: owned });
      if (it.key) S.looted[it.key] = true;
      o.hidden = true;
      return;
    }
    case 'sit': {
      const p = G.player;
      p.x = o.x; p.y = o.y + 2;
      p.pose = 'sit';
      p.poseLock = 2;
      notify('You sit a while.', 'info', 1500);
      return;
    }
    case 'read': readBook(it.book); return;
    case 'dice': emit('dice:table', o); return;
    case 'notice': openNotice(it.board); return;
    case 'loot': openLoot('obj:' + (o.key || o.id), it.label || 'Search', false); return;
  }
}

export function initInteract() {
  interactHooks.objLabel = objLabel;
  interactHooks.actorLabel = actorLabel;
  interactHooks.run = (t) => { runTarget(t); };
}

export { messageBox, count };
