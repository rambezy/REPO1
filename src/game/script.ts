// The scripting context handed to dialogue and map callbacks.

import type { Actor, Ctx, NpcSpawn } from './types';
import { G, player, nextUid } from './G';
import { stat, skill, maxHp, isPlayer } from './character';
import { chance } from '../core/rng';
import { addItem, countItem, removeItem, makeActor } from './actors';
import { giveXp, addKarma, addRep, questNote, questDone, questFail, questState } from './progress';
import { msg } from './log';
import { aggro, startCombat, kill as killActor } from './combat';
import { heal as healActor, addRads } from './effects';
import { dayNumber, waterDaysLeft, advanceTime } from './time';
import { fx } from '../render/fx';
import { sfx } from '../audio/sfx';
import { ITEMS } from '../data/items';

let currentSpeaker: Actor | undefined;

export function setSpeaker(a: Actor | undefined) {
  currentSpeaker = a;
}

function findNpc(id: string): Actor | undefined {
  if (!G.map) return G.state.party.find((a) => a.npc === id);
  return G.map.actors.find((a) => a.npc === id) ?? G.state.party.find((a) => a.npc === id);
}

export function ctx(): Ctx {
  const s = G.state;
  const p = player();
  const c: Ctx = {
    flag: (n) => s.flags[n],
    set: (n, v = true) => {
      s.flags[n] = v;
    },
    inc: (n, by = 1) => (s.flags[n] = (s.flags[n] ?? 0) + by),
    stat: (k) => stat(p, k),
    skill: (k) => skill(p, k),
    roll: (k, diff = 0) => chance(Math.max(5, Math.min(95, skill(p, k) - diff))),
    has: (id, n = 1) => countItem(p, id) >= n,
    count: (id) => countItem(p, id),
    give: (id, n = 1) => {
      if (id === 'scrip') {
        addItem(p, 'scrip', n);
        msg(`You receive ${n} scrip.`);
        sfx('coins');
        return;
      }
      addItem(p, id, n);
      msg(`You receive ${n > 1 ? n + ' x ' : ''}${ITEMS[id]?.name ?? id}.`);
      sfx('pickup');
    },
    take: (id, n = 1) => {
      if (countItem(p, id) < n) return false;
      removeItem(p, id, n);
      return true;
    },
    scrip: () => countItem(p, 'scrip'),
    pay: (n) => {
      if (countItem(p, 'scrip') < n) return false;
      removeItem(p, 'scrip', n);
      sfx('coins');
      return true;
    },
    xp: (n) => giveXp(n),
    karma: (n) => addKarma(n),
    rep: (a, n) => addRep(a, n),
    quest: (id, note) => questNote(id, note),
    questDone: (id, note) => questDone(id, note),
    questFail: (id, note) => questFail(id, note),
    questState: (id) => questState(id),
    msg: (t) => msg(t),
    bark: (id, t) => {
      const a = findNpc(id);
      if (a) bark(a, t);
    },
    npc: (id) => findNpc(id),
    speaker: () => currentSpeaker,
    hostile: (idOrTeam) => {
      const m = G.map;
      if (!m) return;
      const byId = m.actors.find((a) => a.npc === idOrTeam);
      if (byId) {
        aggro(byId);
        byId.hostile = true;
      } else {
        for (const a of m.actors) if (a.team === idOrTeam && !a.dead) a.hostile = true;
      }
      setTimeout(() => {
        import('../ui/dialogue').then((d) => d.closeDialogue());
        startCombat(byId);
      }, 50);
    },
    remove: (id) => {
      if (!G.map) return;
      G.map.actors = G.map.actors.filter((a) => a.npc !== id);
      s.flags['gone:' + id] = true;
    },
    kill: (id) => {
      const a = findNpc(id);
      if (a) killActor(a, null);
    },
    recruit: (id) => {
      const a = findNpc(id);
      if (!a) return;
      import('./party').then((m) => m.recruit(a));
    },
    dismiss: (id) => {
      const a = findNpc(id);
      if (!a) return;
      import('./party').then((m) => m.dismiss(a));
    },
    heal: (n) => {
      healActor(p, n);
    },
    hurt: (n) => {
      p.hp = Math.max(1, p.hp - n);
    },
    rads: (n) => addRads(p, n),
    time: () => s.time,
    day: () => dayNumber(),
    advance: (m) => advanceTime(m),
    waterDays: () => waterDaysLeft(),
    addWaterDays: (d) => {
      s.waterDeadline += d * 1440;
      msg(`Shelter 29 now has water for ${waterDaysLeft()} more days.`);
    },
    goto: (map, entrance) => {
      import('./travel').then((t) => t.enterMap(map, entrance));
    },
    reveal: (id) => {
      if (!s.discovered.includes(id)) {
        s.discovered.push(id);
        import('../content/registry').then((r) => msg(`${r.LOCATIONS[id]?.name ?? id} has been marked on your map.`));
      }
    },
    endGame: (kind) => {
      import('../ui/endings').then((m) => m.showEnding(kind));
    },
    playerName: () => p.name,
    female: () => !!(p as any).female,
    level: () => p.level,
    karmaValue: () => s.karma,
    obj: (id) => G.map?.objects.find((o) => o.id === id),
    mapId: () => G.map?.def.id ?? '',
    openBarter: (id) => {
      const a = id ? findNpc(id) : currentSpeaker;
      if (a) import('../ui/barter').then((b) => b.openBarter(a));
    },
    startDialog: (dialogId, id) => {
      const a = id ? findNpc(id) : currentSpeaker;
      import('../ui/dialogue').then((d) => d.openDialogue(dialogId, a));
    },
    spawn: (proto, q, r, opts: Partial<NpcSpawn> = {}) => {
      const m = G.map!;
      const free = m.freeNear({ q, r }) ?? { q, r };
      const a = makeActor(proto, {
        uid: nextUid(),
        q: free.q,
        r: free.r,
        name: opts.name,
        npc: opts.id,
        dialog: opts.dialog,
        team: opts.team,
        hostile: opts.hostile,
        wander: opts.wander,
        barter: opts.barter,
        inv: opts.inv,
        equip: opts.equip,
        look: opts.look,
      });
      m.actors.push(a);
      return a;
    },
    random: (n) => Math.floor(Math.random() * n),
    fade: (t) => fx.fade(t),
    sound: (id) => sfx(id),
    partyHas: (id) => !!G.map?.actors.some((a) => a.companion && a.npc === id) || s.party.some((a) => a.npc === id),
  };
  return c;
}

export function bark(a: Actor, text: string, color?: string) {
  a._bark = { text, until: G.now + 2500 + text.length * 60, color };
}

(window as any).__ctx = ctx;

export function hpFraction(a: Actor) {
  return a.hp / maxHp(a);
}

export { isPlayer };
