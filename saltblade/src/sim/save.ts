// Saving and loading. The land is rebuilt from its seed; everything that
// lives on it (people, squads, objects, shops, standing, research) is
// serialised, gzip-compressed and kept in IndexedDB (localStorage fallback).
import { S } from './ctx';
import { World } from './world';
import { Char } from './char';
import { Squad } from './squad';
import { Body } from './body';
import { Grid, Item, peekUid, setNextUid } from './inventory';
import { WObj } from './objects';
import { Shop } from './shops';
import type { TownInfo } from '../world/towns';
import { TOWN_PLANS } from '../content/buildings';

export const SAVE_VERSION = 3;

const round = (v: number, k = 100) => Math.round(v * k) / k;

function charToJSON(c: Char): any {
  const o: any = {
    id: c.id, name: c.name, title: c.title, animal: c.animal, look: c.look, faction: c.faction, squad: c.squad, role: c.role, rank: c.rank, unique: c.unique,
    x: round(c.x), z: round(c.z), dir: round(c.dir), site: c.site, homeX: round(c.homeX), homeZ: round(c.homeZ), homeDir: round(c.homeDir),
    body: c.body.serialize(), hunger: round(c.hunger), mood: c.mood, sk: Array.from(c.sk, (v) => round(v)),
    inv: c.inv.serialize(), eq: Object.fromEntries(Object.entries(c.eq).map(([k, v]) => [k, v ? itemJSON(v) : null])),
    money: c.money, status: c.status, playDead: c.playDead, carrying: c.carrying, carriedBy: c.carriedBy, bed: c.bed, cage: c.cage, shackled: c.shackled, sleeping: c.sleeping,
    combatMode: c.combatMode, move: c.move, order: c.order, jobs: c.jobs, bounty: c.bounty, mem: c.mem, recruitable: c.recruitable, price: c.price, shop: c.shop, dialogue: c.dialogue, stats: c.stats,
  };
  // the brain keeps a few durable things
  if (c.brain?.bed) o.brainBed = c.brain.bed;
  return o;
}
function itemJSON(it: Item): any { return { ...it, inv: it.inv ? it.inv.serialize() : undefined }; }
function itemFrom(o: any): Item { const it: Item = { ...o, inv: o.inv ? Grid.from(o.inv) : undefined }; setNextUid(it.uid + 1); return it; }

function charFrom(o: any): Char {
  const c = new Char(o.look);
  Object.assign(c, {
    id: o.id, name: o.name, title: o.title, animal: o.animal, faction: o.faction, squad: o.squad, role: o.role, rank: o.rank, unique: o.unique,
    x: o.x, z: o.z, dir: o.dir, site: o.site, homeX: o.homeX, homeZ: o.homeZ, homeDir: o.homeDir, hunger: o.hunger, mood: o.mood,
    money: o.money, status: o.status, playDead: o.playDead, carrying: o.carrying, carriedBy: o.carriedBy, bed: o.bed, cage: o.cage, shackled: o.shackled, sleeping: o.sleeping,
    combatMode: o.combatMode, move: o.move, order: o.order, jobs: o.jobs ?? [], bounty: o.bounty ?? {}, mem: o.mem ?? {}, recruitable: o.recruitable, price: o.price, shop: o.shop, dialogue: o.dialogue, stats: o.stats ?? c.stats,
  });
  c.body = Body.from(o.body);
  c.sk.set(o.sk);
  c.inv = Grid.from(o.inv);
  for (const k of Object.keys(c.eq) as (keyof Char['eq'])[]) c.eq[k] = o.eq?.[k] ? itemFrom(o.eq[k]) : null;
  c.brain = o.brainBed ? { bed: o.brainBed } : {};
  c.y = S.T.heightAt(c.x, c.z);
  c.dirty = true;
  return c;
}

function objToJSON(o: WObj): any {
  const { view, ...rest } = o as any;
  return { ...rest, inv: o.inv ? o.inv.serialize() : undefined };
}
function objFrom(o: any): WObj {
  return { ...o, inv: o.inv ? Grid.from(o.inv) : undefined };
}

function townToJSON(t: TownInfo): any {
  return {
    site: t.site.id, plan: Object.keys(TOWN_PLANS).find((k) => TOWN_PLANS[k] === t.plan), style: t.style, buildings: t.buildings.map((b) => b.id), gates: t.gates, posts: t.posts, patrol: t.patrol,
    beds: t.beds, shops: t.shops.map((s) => ({ kind: s.kind, building: s.building.id, counter: s.counter.id, spot: s.spot })),
    bars: t.bars.map((b) => ({ building: b.building.id, counter: b.counter.id, spot: b.spot, seats: b.seats })), cages: t.cages, fields: t.fields.map((f) => f.id), jobs: t.jobs, plazaR: t.plazaR,
  };
}
function townFrom(o: any, W: World): TownInfo | null {
  const site = S.T.sites.find((s) => s.id === o.site);
  if (!site) return null;
  const obj = (id: number) => W.objs.get(id)!;
  return {
    site, plan: TOWN_PLANS[o.plan], style: o.style, buildings: o.buildings.map(obj).filter(Boolean), gates: o.gates, posts: o.posts, patrol: o.patrol, beds: o.beds,
    shops: o.shops.map((s: any) => ({ kind: s.kind, building: obj(s.building), counter: obj(s.counter), spot: s.spot })).filter((s: any) => s.building && s.counter),
    bars: o.bars.map((b: any) => ({ building: obj(b.building), counter: obj(b.counter), spot: b.spot, seats: b.seats })).filter((b: any) => b.building && b.counter),
    cages: o.cages, fields: o.fields.map(obj).filter(Boolean), jobs: o.jobs, plazaR: o.plazaR,
  };
}

export function serialize(extra: Record<string, any> = {}): any {
  const W = S.W;
  return {
    v: SAVE_VERSION,
    seed: S.T.seed,
    savedAt: Date.now(),
    clock: S.clock.t,
    time: S.time,
    nextId: W.nextId,
    nextUid: peekUid(),
    money: W.money,
    factionName: W.factionName,
    rel: W.rel.serialize(),
    log: W.log.slice(-120),
    flags: W.flags,
    discovered: [...W.discovered],
    research: { done: [...W.research.done], current: W.research.current, progress: W.research.progress },
    playerSquads: W.playerSquads,
    bountyBoard: W.bountyBoard,
    populated: [...W.populated],
    killsBy: W.killsBy,
    weather: S.weather?.serialize(),
    seenSites: [...W.seenSites],
    explored: W.explored ? bytesToB64(W.explored) : null,
    chars: [...W.chars.values()].map(charToJSON),
    squads: [...W.squads.values()].map((s) => s.serialize()),
    objs: [...W.objs.values()].map(objToJSON),
    shops: [...W.shops.values()],
    towns: [...W.towns.entries()].filter(([id]) => !W.populated.has(id)).map(([, t]) => townToJSON(t)),
    ...extra,
  };
}

export function apply(data: any, W: World) {
  S.clock.t = data.clock;
  S.time = data.time;
  W.nextId = data.nextId;
  setNextUid(data.nextUid);
  W.money = data.money;
  W.factionName = data.factionName;
  W.rel.load(data.rel);
  W.log = data.log ?? [];
  W.flags = data.flags ?? {};
  W.discovered = new Set(data.discovered);
  W.research = { done: new Set(data.research.done), current: data.research.current, progress: data.research.progress };
  W.playerSquads = data.playerSquads;
  W.bountyBoard = data.bountyBoard ?? [];
  W.populated = new Set(data.populated);
  W.killsBy = data.killsBy ?? {};
  S.weather?.load(data.weather);
  W.seenSites = new Set(data.seenSites ?? []);
  W.explored = data.explored ? b64ToBytes(data.explored) : null;
  W.active = [];
  W.chars.clear(); W.squads.clear(); W.objs.clear(); W.shops.clear(); W.towns.clear();
  for (const o of data.objs) { const ob = objFrom(o); W.objs.set(ob.id, ob); }
  W.rebuildObjHash();
  for (const s of data.squads) { const sq = Squad.from(s); W.squads.set(sq.id, sq); }
  for (const c of data.chars) { const ch = charFrom(c); W.chars.set(ch.id, ch); }
  for (const sh of data.shops as Shop[]) W.shops.set(sh.id, sh);
  for (const t of data.towns ?? []) { const ti = townFrom(t, W); if (ti) W.towns.set(ti.site.id, ti); }
}

// ---------------------------------------------------------------- storage
async function gzip(s: string): Promise<Blob> {
  if (typeof CompressionStream === 'undefined') return new Blob([s]);
  const cs = new Blob([s]).stream().pipeThrough(new CompressionStream('gzip'));
  return await new Response(cs).blob();
}
async function gunzip(b: Blob): Promise<string> {
  const head = new Uint8Array(await b.slice(0, 2).arrayBuffer());
  if (head[0] !== 0x1f || head[1] !== 0x8b || typeof DecompressionStream === 'undefined') return await b.text();
  const ds = b.stream().pipeThrough(new DecompressionStream('gzip'));
  return await new Response(ds).text();
}

function db(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open('saltblade', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('saves'); r.result.createObjectStore('meta'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function idbPut(store: string, key: string, val: any) {
  const d = await db();
  await new Promise<void>((res, rej) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
}
async function idbGet(store: string, key: string): Promise<any> {
  const d = await db();
  return await new Promise((res, rej) => { const tx = d.transaction(store, 'readonly'); const r = tx.objectStore(store).get(key); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
async function idbDel(store: string, key: string) {
  const d = await db();
  await new Promise<void>((res) => { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).delete(key); tx.oncomplete = () => res(); tx.onerror = () => res(); });
}

export interface SaveMeta { slot: string; name: string; day: number; savedAt: number; chars: number; money: number; place: string; seed: number; }

/** In-memory fallback when no storage is available (still lets the session reload). */
const memory = new Map<string, Blob>();

export async function writeSave(slot: string, meta: Omit<SaveMeta, 'slot' | 'savedAt'>, extra: Record<string, any> = {}): Promise<boolean> {
  const json = JSON.stringify(serialize(extra));
  const blob = await gzip(json);
  const m: SaveMeta = { ...meta, slot, savedAt: Date.now() };
  memory.set(slot, blob);
  try {
    await idbPut('saves', slot, blob);
    await idbPut('meta', slot, m);
    return true;
  } catch {
    try {
      const b64 = await blobToB64(blob);
      localStorage.setItem('sb-save-' + slot, b64);
      localStorage.setItem('sb-meta-' + slot, JSON.stringify(m));
      return true;
    } catch { return false; }
  }
}

export async function readSave(slot: string): Promise<any | null> {
  let blob: Blob | null = memory.get(slot) ?? null;
  if (!blob) { try { blob = (await idbGet('saves', slot)) ?? null; } catch { blob = null; } }
  if (!blob) { try { const b = localStorage.getItem('sb-save-' + slot); if (b) blob = b64ToBlob(b); } catch { /* none */ } }
  if (!blob) return null;
  return JSON.parse(await gunzip(blob));
}

export async function listSaves(): Promise<SaveMeta[]> {
  const out: SaveMeta[] = [];
  for (const slot of ['auto', 'quick', '1', '2', '3', '4', '5']) {
    let m: SaveMeta | null = null;
    try { m = (await idbGet('meta', slot)) ?? null; } catch { m = null; }
    if (!m) { try { const s = localStorage.getItem('sb-meta-' + slot); if (s) m = JSON.parse(s); } catch { /* none */ } }
    if (m) out.push(m);
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

export async function deleteSave(slot: string) {
  memory.delete(slot);
  try { await idbDel('saves', slot); await idbDel('meta', slot); } catch { /* none */ }
  try { localStorage.removeItem('sb-save-' + slot); localStorage.removeItem('sb-meta-' + slot); } catch { /* none */ }
}

function bytesToB64(buf: Uint8Array) {
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBytes(s: string) {
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

async function blobToB64(b: Blob) {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBlob(s: string) {
  const bin = atob(s);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf]);
}

/** Save to a downloadable file. */
export async function exportSave(name: string, extra: Record<string, any> = {}) {
  const blob = await gzip(JSON.stringify(serialize(extra)));
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${name.replace(/[^a-z0-9]+/gi, '_')}.saltblade`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function importSaveFile(f: File): Promise<any> {
  return JSON.parse(await gunzip(f));
}

/** Hands a save across a page reload. */
export async function stashForReload(data: any) {
  const blob = await gzip(JSON.stringify(data));
  memory.set('__reload', blob);
  try { await idbPut('saves', '__reload', blob); } catch { /* ignore */ }
}
export async function takeReloadStash(): Promise<any | null> {
  let blob: Blob | null = null;
  try { blob = (await idbGet('saves', '__reload')) ?? null; await idbDel('saves', '__reload'); } catch { blob = null; }
  if (!blob) return null;
  return JSON.parse(await gunzip(blob));
}

const TEXT_TAG = 'SALTBLADE-SAVE:';
/** The whole game as one line of text, for copying between browsers. */
export async function exportText(extra: Record<string, any> = {}): Promise<string> {
  const blob = await gzip(JSON.stringify(serialize(extra)));
  return TEXT_TAG + (await blobToB64(blob));
}
export async function importText(text: string): Promise<any> {
  const t = text.trim();
  const b64 = t.startsWith(TEXT_TAG) ? t.slice(TEXT_TAG.length) : t;
  return JSON.parse(await gunzip(b64ToBlob(b64.replace(/\s+/g, ''))));
}
