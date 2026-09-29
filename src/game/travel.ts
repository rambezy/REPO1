// Moving between maps and the world map.

import { G, player } from './G';
import { loadMap } from './map';
import { ctx } from './script';
import { emit, msg } from './log';
import { LOCATIONS, MAPS } from '../content/registry';
import { setAmbient } from '../audio/sfx';
import { endCombat } from './combat';
import { stopWalking } from './movement';
import { fx } from '../render/fx';
import { hexDist } from '../core/hex';
import { closeWorldMap } from '../ui/worldmap';

export function stashParty() {
  const m = G.map;
  if (!m) return;
  const comps = m.actors.filter((a) => a.companion && !a.dead);
  G.state.party = comps;
  for (const c of comps) stopWalking(c);
  m.actors = m.actors.filter((a) => a.uid !== 'player' && !(a.companion && !a.dead));
}

/** Leave the current map (saving its state). */
export function leaveMap() {
  const m = G.map;
  if (!m) return;
  if (G.combat) endCombat();
  stopWalking(player());
  // Companions that are too far away (or waiting) are left behind? Keep it simple: all follow.
  stashParty();
  m.save();
  G.map = null;
}

export function enterMap(id: string, entrance = 'default', opts: { restore?: boolean } = {}) {
  const def = MAPS[id];
  if (!def) {
    msg(`[missing map ${id}]`);
    return;
  }
  if (G.map && !opts.restore) leaveMap();
  closeWorldMap();
  const firstVisit = !G.state.maps[id];
  const m = loadMap(id);
  G.map = m;
  G.state.mapId = id;
  const p = player();
  p._path = undefined;
  p._move = undefined;
  if (!opts.restore) {
    const ent = def.entrances[entrance] ?? def.entrances.default;
    const pos = (ent ? m.pos(ent) : null) ?? { q: Math.floor(m.w / 2), r: Math.floor(m.h / 2) };
    const free = m.freeNear(pos) ?? pos;
    p.q = free.q;
    p.r = free.r;
  }
  m.actors = m.actors.filter((a) => a.uid !== 'player');
  m.actors.push(p);
  for (const c of G.state.party) {
    c._path = undefined;
    c._move = undefined;
    if (!opts.restore || hexDist(c, p) > 20 || !m.passable(c.q, c.r)) {
      const f = m.freeNear({ q: p.q + 1, r: p.r }) ?? m.freeNear(p);
      if (f) {
        c.q = f.q;
        c.r = f.r;
      }
    }
    m.actors.push(c);
  }
  G.state.party = [];
  G.screen = 'play';
  const area = LOCATIONS[def.area];
  if (area && !G.state.discovered.includes(area.id)) G.state.discovered.push(area.id);
  if (area && !G.state.visitedLoc.includes(area.id)) G.state.visitedLoc.push(area.id);
  if (area) G.state.world = { x: area.x, y: area.y };
  setAmbient(def.music ?? (def.outdoor ? 'wind' : def.dark ? 'cave' : 'shelter'));
  fx.centerOn(p, true);
  emit('mapchange');
  emit('hud');
  if (!opts.restore) {
    msg(firstVisit ? `You arrive at ${def.name}.` : `You return to ${def.name}.`);
    def.onEnter?.(ctx(), firstVisit);
  }
}

/** Walk off the map onto the world map. */
export function exitToWorld() {
  const m = G.map;
  if (!m) return;
  const area = LOCATIONS[m.def.area];
  leaveMap();
  G.state.mapId = null;
  if (area) G.state.world = { x: area.x, y: area.y };
  G.screen = 'world';
  setAmbient('wind');
  emit('mapchange');
  import('../ui/worldmap').then((w) => w.openWorldMap());
}

export function takeExit(exitId: string) {
  const m = G.map;
  if (!m) return;
  const ex = m.def.exits?.[exitId] ?? (exitId === 'out' ? { to: 'world' } : null);
  if (!ex) return;
  if (G.combat) {
    msg('You cannot leave during combat.');
    return;
  }
  if (ex.to === 'world') exitToWorld();
  else enterMap(ex.to, ex.entrance ?? 'default');
}
