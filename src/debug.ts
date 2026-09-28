// Development handle: exposes game internals on window.__obi for automated
// play-testing. Only attached in dev builds or when the URL hash says #debug.

import { G } from './G';
import * as state from './state';
import * as world from './world/world';
import * as quests from './systems/quests';
import * as inventory from './systems/inventory';
import * as transition from './systems/transition';
import { emit } from './engine/events';
import { input } from './engine/input';
import { TILE } from './engine/util';
import { setAutoAdvance } from './ui/dialogue';
import { talkTo } from './systems/talk';
import { interactHooks } from './systems/player';

export function attachDebug() {
  const w = window as unknown as Record<string, unknown>;
  w.__obi = {
    G, state, world, quests, inventory, transition, emit, input, TILE,
    get S() { return state.S; },
    /** teleport the player to a tile on a map */
    tp(map: string, tx: number, ty: number) { return transition.travel(map, { x: tx * TILE + 8, y: ty * TILE + 12 }); },
    where() {
      const p = G.player;
      return { map: G.map?.id, tx: +(p.x / TILE).toFixed(1), ty: +(p.y / TILE).toFixed(1), mode: G.mode, locked: G.controlLocked, time: state.clockString(), region: G.map?.regionAt(p.x, p.y)?.id };
    },
    near(r = 160) {
      const p = G.player;
      return world.here().filter((a) => a !== p && Math.hypot(a.x - p.x, a.y - p.y) < r).map((a) => ({ id: a.id, name: a.name, tx: +(a.x / TILE).toFixed(1), ty: +(a.y / TILE).toFixed(1), hostile: a.hostile, dead: a.dead, pose: a.pose }));
    },
    quest() { return Object.fromEntries(Object.entries(state.S.quests).map(([k, q]) => [k, q.stage + ':' + q.status])); },
    dialogue() {
      const box = document.querySelector('#dialogue');
      if (!box) return null;
      return { who: (box.querySelector('.who') as HTMLElement | null)?.innerText, text: (box.querySelector('.text') as HTMLElement | null)?.innerText, choices: [...box.querySelectorAll('.choice')].map((c) => (c as HTMLElement).innerText) };
    },
    /** clicks the first dialogue choice containing the text */
    pick(sub: string) {
      const b = [...document.querySelectorAll('#dialogue .choice')].find((c) => (c as HTMLElement).innerText.toLowerCase().includes(sub.toLowerCase())) as HTMLElement | undefined;
      if (b) b.click();
      return !!b;
    },
    auto: setAutoAdvance,
    /** starts a conversation with an actor by id or character id */
    talk(id: string) {
      const a = world.here().find((x) => x.id === id || x.charId === id) || world.findActor(id);
      if (!a) return false;
      talkTo(a);
      return true;
    },
    /** uses an object on the current map by key (or nearest of a type) */
    use(keyOrType: string) {
      const p = G.player;
      const objs = G.map.objects.filter((o) => (o.key === keyOrType || o.type === keyOrType || (o.interact && (o.interact as { script?: string }).script === keyOrType)) && o.interact && !o.hidden);
      objs.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
      const o = objs[0];
      if (!o) return false;
      interactHooks.run({ kind: 'obj', o, label: '' });
      return true;
    },
    /** moves the player next to an actor, facing them */
    goto(id: string) {
      const a = world.findActor(id);
      if (!a) return false;
      if (a.mapId !== G.map.id) world.enterMap(a.mapId, { x: a.x, y: a.y + 14 });
      G.player.x = a.x; G.player.y = a.y + 14; G.player.dir = 3;
      return true;
    },
  };
}
