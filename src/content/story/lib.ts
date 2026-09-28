// Story toolkit: triggers that fire scenes, conversation topics per
// character, story-driven world decorations, and small helpers used by every
// chapter.

import { G } from '../../G';
import { S, flag, setFlag, hourF, dayIndex } from '../../state';
import { Actor } from '../../world/actor';
import { MapObject, GameMap, Interaction } from '../../world/map';
import { getMap, mapBuiltHooks, isBuilt, rebuildMap, enterMap, here, findActor, hasMap } from '../../world/world';
import { chunks } from '../../world/chunks';
import { snapCamera, renderHooks } from '../../engine/renderer';
import { propInfo } from '../../gfx/props';
import { iconCanvas } from '../../gfx/icons';
import { makeCanvas } from '../../gfx/pixel';
import { item } from '../items';
import { TILE, rand } from '../../engine/util';
import { registerTalk, talkHooks } from '../../systems/talk';
import { say, choose, inScene, Choice, lastCheck } from '../../systems/script';
import { openTrade } from '../../ui/trade';
import { notify } from '../../ui/notify';
import { UI } from '../../ui/ui';
import { isTraveling } from '../../systems/transition';
import { settleSchedules } from '../../systems/ai';
import { applyNeeds } from '../../systems/survival';
import { on, emit } from '../../engine/events';
import { card } from '../../ui/cine';
import { charName } from '../characters';
import { rumorFor } from '../rumors';

export { lastCheck };

// ---------------------------------------------------------------- triggers

interface Trig { id: string; when: () => boolean; run: () => Promise<void> | void; repeat?: boolean; cooldown?: number; last?: number }
const TRIGS: Trig[] = [];
let busy = false;
let acc = 0;

/** Runs `run` once (or repeatedly) when `when` becomes true during free play. */
export function trigger(id: string, when: () => boolean, run: () => Promise<void> | void, opts: { repeat?: boolean; cooldown?: number } = {}) {
  TRIGS.push({ id, when, run, ...opts });
}
export const fired = (id: string) => !!S.flags['trig:' + id];
export const unfire = (id: string) => { delete S.flags['trig:' + id]; };

export function canRunScene() {
  return G.mode === 'play' && !G.controlLocked && !inScene() && !isTraveling() && !UI.screen && !!G.player && !G.player.dead;
}

export function updateTriggers(dt: number) {
  acc += dt;
  if (acc < 0.2) return;
  acc = 0;
  if (busy || !canRunScene()) return;
  for (const t of TRIGS) {
    if (!t.repeat && S.flags['trig:' + t.id]) continue;
    if (t.cooldown && t.last && performance.now() - t.last < t.cooldown * 1000) continue;
    let ok = false;
    try { ok = t.when(); } catch (e) { console.error('trigger check failed', t.id, e); }
    if (!ok) continue;
    if (!t.repeat) S.flags['trig:' + t.id] = true;
    t.last = performance.now();
    busy = true;
    Promise.resolve()
      .then(() => t.run())
      .catch((e) => console.error('trigger failed', t.id, e))
      .finally(() => { busy = false; });
    return;
  }
}

/** Resolves once `cond` is true (polled), or false after `timeout` seconds. */
export function waitUntil(cond: () => boolean, timeout = 1e9): Promise<boolean> {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const id = setInterval(() => {
      let ok = false;
      try { ok = cond(); } catch { ok = false; }
      if (ok) { clearInterval(id); resolve(true); }
      else if ((performance.now() - t0) / 1000 > timeout) { clearInterval(id); resolve(false); }
    }, 100);
  });
}

// ---------------------------------------------------------------- topics

export interface Topic {
  id: string;
  text: string | (() => string);
  if?: () => boolean;
  run: (a: Actor) => Promise<void | 'end'>;
  /** disappears once chosen */
  once?: boolean;
  /** runs straight away when the player talks to the character (quest scenes) */
  auto?: boolean;
  /** important enough to wake the character up for */
  urgent?: boolean;
  check?: Choice['check'];
  tag?: string;
  /** lower comes first */
  order?: number;
}

const TOPICS: Record<string, Topic[]> = {};
const GREETS: Record<string, (a: Actor) => Promise<void>> = {};
const BYES: Record<string, () => string> = {};
const registered = new Set<string>();

export function topic(charId: string, t: Topic) {
  (TOPICS[charId] ||= []).push(t);
  ensureTalk(charId);
}
export function greet(charId: string, fn: (a: Actor) => Promise<void>) { GREETS[charId] = fn; ensureTalk(charId); }
export function farewell(charId: string, fn: () => string) { BYES[charId] = fn; }

function ensureTalk(charId: string) {
  if (registered.has(charId)) return;
  registered.add(charId);
  registerTalk(charId, (a) => runTalk(charId, a));
}

const usedKey = (c: string, t: Topic) => `topic:${c}:${t.id}`;
function available(charId: string, t: Topic) {
  if (t.once && S.flags[usedKey(charId, t)]) return false;
  try { return !t.if || t.if(); } catch (e) { console.error('topic check', charId, t.id, e); return false; }
}
export function topicUsed(charId: string, id: string) { return !!S.flags[`topic:${charId}:${id}`]; }

async function runTalk(charId: string, a: Actor) {
  setFlag('met_' + charId);
  const list = (TOPICS[charId] || []).slice().sort((x, y) => (x.order ?? 50) - (y.order ?? 50));
  const auto = list.find((t) => t.auto && available(charId, t));
  if (auto) {
    if (auto.once) S.flags[usedKey(charId, auto)] = true;
    const r = await auto.run(a);
    if (r === 'end') return;
  } else {
    const g = GREETS[charId];
    if (g) await g(a);
    else await say(a, 'neutral', rand.pick(['Yes?', 'Hm?', 'What is it?']));
  }
  let asked = false;
  for (;;) {
    const opts = list.filter((t) => !t.auto && available(charId, t));
    const choices: Choice[] = opts.map((t) => ({ id: t.id, text: typeof t.text === 'function' ? t.text() : t.text, check: t.check, tag: t.tag }));
    if (a.mem.gossip !== false) choices.push({ id: '__news', text: 'Heard anything new?', used: asked });
    if (a.mem.merchant) choices.push({ id: '__trade', text: 'Let\'s trade.' });
    choices.push({ id: '__bye', text: 'Farewell.' });
    const c = await choose(choices);
    if (c === '__bye') {
      const b = BYES[charId];
      await say(a, 'neutral', b ? b() : rand.pick(['God keep you.', 'Mind how you go.', 'Aye. Go on, then.']));
      return;
    }
    if (c === '__trade') { openTrade(a.mem.merchant, a); return; }
    if (c === '__news') {
      asked = true;
      const settlement = G.map.regionAt(a.x, a.y)?.settlement || 'linden';
      await say(a, 'neutral', rumorFor(a, settlement));
      continue;
    }
    const t = opts.find((x) => x.id === c);
    if (!t) return;
    if (t.once) S.flags[usedKey(charId, t)] = true;
    const r = await t.run(a);
    if (r === 'end') return;
  }
}

// ---------------------------------------------------------------- decorations

interface Decor { key: string; map: string; when: () => boolean; make: () => Omit<MapObject, 'id'> }
const DECOR: Decor[] = [];

/** An object that exists on a map while `when()` holds; survives map rebuilds. */
export function decor(d: Decor) {
  DECOR.push(d);
}

function applyDecor(m: GameMap) {
  let changed = false;
  for (const d of DECOR) {
    if (d.map !== m.id) continue;
    const ex = m.objects.find((o) => o.key === d.key && o.data?.decor);
    let want = false;
    try { want = d.when(); } catch (e) { console.error('decor', d.key, e); }
    if (want && !ex) {
      const o = m.add(d.make());
      o.key = d.key;
      o.data = { ...(o.data || {}), decor: true };
      changed = true;
    } else if (!want && ex) { m.remove(ex); changed = true; }
  }
  if (changed) m.markDirty();
}

export function refreshDecor(mapId?: string) {
  const ids = mapId ? [mapId] : [...new Set(DECOR.map((d) => d.map))];
  for (const id of ids) if (isBuilt(id)) applyDecor(getMap(id));
}

/** A prop object (same placement rules as the map builder). */
export function propObj(type: string, tx: number, ty: number, o: { variant?: number; opt?: string; interact?: Interaction; dx?: number; dy?: number; solid?: boolean; name?: string; flip?: boolean } = {}): Omit<MapObject, 'id'> {
  const info = propInfo(type, o.variant ?? 0, o.opt ?? '');
  const x = tx * TILE + 8 + (o.dx ?? 0), y = ty * TILE + 15 + (o.dy ?? 0);
  const solid = o.solid === false || !info.solid ? null : { x: x - info.solid.w / 2, y: y - info.solid.h, w: info.solid.w, h: info.solid.h };
  return {
    kind: 'prop', type, x, y, sprite: info.sprite, solid, flip: o.flip,
    light: info.light ? { ...info.light, ax: 0, ay: 0 } : null, anim: info.anim, flat: info.flat,
    interact: o.interact, name: o.name,
  };
}

const groundIcons = new Map<string, HTMLCanvasElement>();
/** An item's icon lying in the grass: painted at 4 texels per world unit. */
function groundIcon(itemId: string): HTMLCanvasElement {
  let c = groundIcons.get(itemId);
  if (c) return c;
  const src = iconCanvas(item(itemId).icon);
  const k = 4;
  c = makeCanvas(14 * k, 13 * k);
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(k, k);
  const g = ctx.createRadialGradient(7, 11, 0, 7, 11, 6);
  g.addColorStop(0, 'rgba(10,6,4,0.45)');
  g.addColorStop(1, 'rgba(10,6,4,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(7, 11, 6, 2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.drawImage(src, 0, 0, src.width, src.height, 1, 0, 12, 12);
  groundIcons.set(itemId, c);
  return c;
}

/** An item lying on the ground, picked up once (remembered by `key`). */
export function groundItem(key: string, map: string, itemId: string, tx: number, ty: number, o: { count?: number; owner?: string; when?: () => boolean; glint?: boolean; dx?: number; dy?: number } = {}) {
  decor({
    key, map,
    when: () => !S.looted[key] && (!o.when || o.when()),
    make: () => {
      const c = groundIcon(itemId);
      return {
        kind: 'item', type: 'item', x: tx * TILE + 8 + (o.dx ?? 0), y: ty * TILE + 12 + (o.dy ?? 0),
        sprite: { canvas: c, ox: 7, oy: 12, w: 14, h: 13 }, flat: true,
        interact: { type: 'item', item: itemId, count: o.count ?? 1, key, owner: o.owner },
        data: { glint: o.glint ?? true },
      };
    },
  });
}

/** An invisible interaction point. */
export function markerObj(tx: number, ty: number, interact: Interaction, name?: string): Omit<MapObject, 'id'> {
  return { kind: 'marker', type: 'marker', x: tx * TILE + 8, y: ty * TILE + 12, sprite: null, interact, name };
}

function drawGlints(ctx: CanvasRenderingContext2D) {
  if (!G.map) return;
  const x0 = G.cam.x, y0 = G.cam.y;
  for (const o of G.map.queryObjects(x0 - 16, y0 - 16, x0 + G.viewW + 16, y0 + G.viewH + 32)) {
    if (o.hidden || !o.data?.glint) continue;
    const ph = (G.clock * 1.3 + o.id * 0.37) % 2.2;
    if (ph > 0.7) continue;
    const k = Math.sin((ph / 0.7) * Math.PI);
    const x = o.x + 3, y = o.y - 11;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = k;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 4);
    g.addColorStop(0, 'rgba(255,246,216,0.9)');
    g.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = '#fff6d8';
    const r = 1.2 + k * 2.4;
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + 0.35, y - 0.35); ctx.lineTo(x + r, y); ctx.lineTo(x + 0.35, y + 0.35);
    ctx.lineTo(x, y + r); ctx.lineTo(x - 0.35, y + 0.35); ctx.lineTo(x - r, y); ctx.lineTo(x - 0.35, y - 0.35);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- world state

/** Throws away and rebuilds a map (terrain + objects), keeping the player where they stand. */
export function rebuildWorld(mapId = 'overworld') {
  const onIt = !!G.map && G.map.id === mapId;
  const pos = onIt ? { x: G.player.x, y: G.player.y, dir: G.player.dir } : null;
  rebuildMap(mapId);
  chunks.forget(mapId);
  if (onIt && pos) { enterMap(mapId, { x: pos.x, y: pos.y }, pos.dir); snapCamera(); }
}

export function setHollowbrook(state: 'normal' | 'burning' | 'ruined') {
  if ((flag('hb_state') || 'normal') === state) return;
  setFlag('hb_state', state);
  rebuildWorld('overworld');
}

/** Moves the clock forward to the next time it is `hour` o'clock. */
export function skipTo(hour: number, needs = true) {
  let d = hour - hourF();
  if (d < 0) d += 24;
  S.minutes += d * 60;
  if (needs) applyNeeds(d);
  settleSchedules();
}

// ---------------------------------------------------------------- people

export const actorOf = (id: string) => findActor(id);
export const P = () => G.player;

export function put(a: Actor | string | undefined, map: string, tx: number, ty: number, dir?: number) {
  const ac = typeof a === 'string' ? findActor(a) : a;
  if (!ac) return;
  ac.mapId = map;
  ac.x = tx * TILE + 8;
  ac.y = ty * TILE + 12;
  ac.mem.path = null;
  ac.mem.script = null;
  if (dir !== undefined) ac.dir = dir as 0 | 1 | 2 | 3;
  ac.hidden = false;
}
export function putAt(a: Actor | string | undefined, map: string, spot: string, dir?: number) {
  const ac = typeof a === 'string' ? findActor(a) : a;
  if (!ac) return;
  const s = getMap(map).spawns[spot];
  if (!s) { console.warn('putAt: no spot', map, spot); return; }
  ac.mapId = map; ac.x = s.x; ac.y = s.y; ac.mem.path = null; ac.mem.script = null; ac.hidden = false;
  if (dir !== undefined) ac.dir = dir as 0 | 1 | 2 | 3; else if (s.dir !== undefined) ac.dir = s.dir as 0 | 1 | 2 | 3;
}
export function faceEach(a: Actor, b: Actor) { a.face(b.x, b.y); b.face(a.x, a.y); }

export const onMap = (id: string) => !!G.map && G.map.id === id;
export const regionIs = (id: string) => !!G.map && G.map.regionAt(G.player.x, G.player.y)?.id === id;
export const nearTile = (tx: number, ty: number, r = 2, map = 'overworld') => onMap(map) && Math.hypot(G.player.x - (tx * TILE + 8), G.player.y - (ty * TILE + 12)) <= r * TILE;
export const nearActor = (id: string, r = 40) => { const a = findActor(id); return !!a && a.mapId === G.map?.id && !a.hidden && Math.hypot(a.x - G.player.x, a.y - G.player.y) <= r; };

export function hostiles(tag: string) { return here().filter((a) => a.tags.has(tag) && !a.dead && !a.mem.down && !a.hidden && !a.surrendered && a.mapId === G.map.id); }
export function tagged(tag: string) { return here().filter((a) => a.tags.has(tag)); }

/** Keeps the player alive through a scripted fight: at death's door, `onDown` runs instead. */
export function protectPlayer(onDown: () => void): () => void {
  return on('player:dying', () => {
    G.player.hp = Math.max(1, G.player.hp);
    if (G.player.hp <= 1) G.player.hp = 1;
    onDown();
  });
}

// ---------------------------------------------------------------- memory & relationships

export const rel = (id: string) => S.rel[id] || 0;
export function addRel(id: string, n: number, quiet = true) {
  S.rel[id] = (S.rel[id] || 0) + n;
  if (!quiet && n !== 0) notify(`<b>${charName(id)}</b> will remember that.`, 'info', 2600);
}
/** Records a choice for later chapters and the epilogue. */
export function remember(key: string, v: unknown = true) { S.flags['c:' + key] = v; }
export const chose = (key: string) => S.flags['c:' + key];

/** A tutorial or story hint, shown once. */
export function tip(key: string, html: string, ms = 7000) {
  if (S.flags['tip:' + key]) return;
  S.flags['tip:' + key] = true;
  notify(html, 'skill', ms);
}

export function journal(text: string) { S.journal.push({ day: dayIndex(), text }); }

export async function chapter(act: string, title: string, sub = '') {
  await card(title, act, sub, { secs: 5 });
}

export function mapReady(id: string) { return hasMap(id); }

/** Opens a book or letter and resolves when the reader is closed. */
export async function readAndWait(id: string) {
  const { readBook } = await import('../../ui/reader');
  readBook(id);
  await waitUntil(() => !UI.screen, 600);
}

/** Saves to the autosave slot as soon as the player is back in free play. */
let autosavePending = false;
export function autosaveSoon() {
  if (autosavePending) return;
  autosavePending = true;
  waitUntil(() => canRunScene(), 600).then((ok) => {
    autosavePending = false;
    if (ok) emit('autosave', 'story');
  });
}

/** True when a character has a quest scene waiting (used to wake them up for it). */
export function hasUrgentTopic(charId: string) {
  return (TOPICS[charId] || []).some((t) => (t.auto || t.urgent) && available(charId, t));
}

export function initLib() {
  talkHooks.urgent = hasUrgentTopic;
  // a finished task or a new chapter is a good moment to keep the player's progress
  on('quest:done', () => autosaveSoon());
  on('quest', (_id: string, stage: string) => { if (stage === 'start' || stage === 'failed') autosaveSoon(); });
  mapBuiltHooks.push(applyDecor);
  renderHooks.overlay.push(drawGlints);
}
