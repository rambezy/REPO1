// Chatter: your people talk among themselves on the road, about hunger, the
// weather, the country, the money and the dead; named people have their own
// things to say; townsfolk gossip as you pass. None of it changes the world.
// It only makes it sound lived in.
import { S } from './ctx';
import type { Char } from './char';
import type { World } from './world';
import type { Squad } from './squad';
import { CHAT, RACE_CHAT, REGION_CHAT, UNIQUE_CHAT, CONVOS, TOWN_TALK, Speaker } from '../content/chatter';
import { REGIONS } from '../world/regions';
import { ANIMAL } from '../content/animals';
import { totalBounty } from './crime';
import { playerBase } from './base';
import { DAY } from './clock';
import { rng } from '../core/rng';

/** on: set from the options; needView: only people on screen talk (off in tests). */
export const chatter = { on: true, needView: true };

type Vars = Record<string, string>;
interface Line { id: number; text: string; at: number; convo: number; group: number }

let world: World | null = null;
let queue: Line[] = [];
let convoSeq = 0;
const nextAt = new Map<number, number>(); // squad id → sim time of its next idle line
const fights = new Map<number, { from: number; last: number }>(); // squad id → fight span
const seen = new Map<number, string>(); // char id → last status seen
const recent: string[] = [];
let t = 0;
let townT = 12;

const first = (name: string) => name.split(' ')[0];
const fighting = (c: Char) => c.status === 'up' && (!!c.target || !!c.atk);
const visible = (c: Char) => !chatter.needView || !!c.view;
const canTalk = (c: Char) => c.status === 'up' && !c.animal && !c.sleeping && !c.carriedBy && !c.playDead && !c.mem.bout && !fighting(c) && !(c.barkT > 0.5);

/** How someone talks: plainly, like a machine, or like a hive. */
function voice(c: Char): 'plain' | 'machine' | 'hive' {
  const r = c.raceDef?.race;
  return r === 'hollow' || r === 'construct' ? 'machine' : r === 'thrum' ? 'hive' : 'plain';
}

/** A pool of lines for someone, in their own voice. */
function pool(key: string, c: Char): string[] | undefined {
  const v = voice(c);
  return v === 'plain' ? CHAT[key] : CHAT[`${key}.${v}`];
}

function fill(text: string, v: Vars): string | null {
  let ok = true;
  const out = text.replace(/\{(\w+)\}/g, (_, k: string) => {
    const s = v[k];
    if (s === undefined) ok = false;
    return s ?? '';
  });
  return ok ? out.replace(/(^|[.!?]\s+)the /g, '$1The ') : null;
}

function remember(l: string) {
  recent.push(l);
  if (recent.length > 80) recent.shift();
}

function pickLine(lines: string[] | undefined, v: Vars): string | null {
  if (!lines?.length) return null;
  const fresh = lines.filter((l) => !recent.includes(l));
  for (const l of rng.shuffle([...(fresh.length ? fresh : lines)])) {
    const s = fill(l, v);
    if (s) { remember(l); return s; }
  }
  return null;
}

function say(c: Char, lines: string[] | undefined, v: Vars): boolean {
  const s = pickLine(lines, v);
  if (!s) return false;
  S.fx.say(c, s);
  return true;
}

function members(W: World, sq: Squad): Char[] {
  const out: Char[] = [];
  for (const id of sq.members) { const c = W.char(id); if (c) out.push(c); }
  return out;
}

function townAt(x: number, z: number) {
  for (const s of S.T.sites) if (s.kind === 'town' && Math.hypot(s.x - x, s.z - z) < s.r + 15) return s;
  return null;
}

function beastName(b: Char) {
  const a = b.animal ? ANIMAL[b.animal] : undefined;
  if (!a) return b.name;
  return b.name.includes('\'s ') || b.name === a.name ? 'the ' + a.name.toLowerCase() : b.name;
}

/** Someone of yours who died lately, and whether it is still raw. */
function fallen(W: World): { name: string; fresh: boolean } | null {
  const list: { name: string; t: number }[] = (W.flags.fallen ?? []).filter((f: { t: number }) => S.clock.t - f.t < DAY * 12);
  if (!list.length) return null;
  const f = rng.pick(list);
  return { name: f.name, fresh: S.clock.t - f.t < DAY * 3 };
}

function varsFor(W: World, c: Char, people: Char[], extra: Vars = {}): Vars {
  const v: Vars = { money: W.money.toLocaleString('en') };
  const others = people.filter((o) => o !== c && !o.animal);
  if (others.length) v.name = first(rng.pick(others).name);
  const reg = REGIONS[S.T.regionIdAt(c.x, c.z)];
  if (reg) v.region = reg.name;
  const town = townAt(c.x, c.z);
  if (town) v.town = town.name;
  const sq = W.squads.get(c.squad);
  const beast = sq ? members(W, sq).find((m) => m.animal && m.alive) : undefined;
  if (beast) v.beast = beastName(beast);
  const f = fallen(W);
  if (f) v.dead = f.name;
  return { ...v, ...extra };
}

function reset() {
  queue = [];
  nextAt.clear();
  fights.clear();
  seen.clear();
  recent.length = 0;
  townT = 12;
}

/** Makes every squad, and the townsfolk, say something at the next chance (for testing). */
export function chatNow() {
  for (const k of nextAt.keys()) nextAt.set(k, 0);
  townT = 0;
}

export function tickChatter(dt: number) {
  const W = S.W;
  if (W !== world) { reset(); world = W; }
  if (queue.length) flush(W);
  t -= dt;
  if (t > 0) return;
  t = 0.5;
  watch(W);
  if (!chatter.on) return;
  for (const id of W.playerSquads) {
    const sq = W.squads.get(id);
    if (sq) idle(W, sq);
  }
  townT -= 0.5;
  if (townT <= 0) {
    townT = rng.range(14, 32);
    townTalk(W);
  }
}

/** Says the lines of a conversation that are due, and drops the rest of one that was cut short. */
function flush(W: World) {
  const now = S.time;
  const due = queue.filter((q) => q.at <= now);
  if (!due.length) return;
  queue = queue.filter((q) => q.at > now);
  for (const q of due) {
    const c = W.char(q.id);
    if (!c || c.status !== 'up' || c.sleeping || fighting(c)) { queue = queue.filter((x) => x.convo !== q.convo); continue; }
    S.fx.say(c, q.text);
  }
}

function run(lines: string[], who: Char[], group: number, v: Vars) {
  const id = ++convoSeq;
  let at = S.time;
  lines.forEach((l, i) => {
    const s = fill(l, v) ?? l.replace(/\{\w+\}/g, '');
    queue.push({ id: who[i % who.length].id, text: s, at, convo: id, group });
    at += Math.max(2.4, 1.1 + s.length * 0.055);
  });
}

const talking = (group: number) => queue.some((q) => q.group === group);

/** Whether a scene (a personal moment) is still being played. */
export const playing = () => queue.some((q) => q.group === -2);

/** Plays a short scene: each person says their line in turn. */
export function scene(parts: [Char, string][]) {
  const id = ++convoSeq;
  let at = S.time;
  for (const [c, text] of parts) {
    queue.push({ id: c.id, text, at, convo: id, group: -2 });
    at += Math.max(2.8, 1.3 + text.length * 0.06);
  }
}

/** Watches your people: who went down, who died, and when a fight ends. */
function watch(W: World) {
  for (const c of W.playerChars()) {
    const prev = seen.get(c.id);
    seen.set(c.id, c.status);
    if (prev === undefined || prev === c.status || c.animal) continue;
    if (c.status === 'dead') {
      const list = (W.flags.fallen ?? []).filter((f: { name: string }) => f.name !== first(c.name));
      list.push({ name: first(c.name), t: S.clock.t });
      W.flags.fallen = list.slice(-6);
      if (chatter.on) react(W, c, 'ally_dead', { dead: first(c.name) });
    } else if (c.status === 'ko' && prev === 'up' && chatter.on) react(W, c, 'ally_down', { name: first(c.name) });
  }
  for (const id of W.playerSquads) {
    const sq = W.squads.get(id);
    if (!sq) continue;
    const all = members(W, sq);
    const f = fights.get(id);
    if (all.some(fighting)) {
      if (f) f.last = S.time; else fights.set(id, { from: S.time, last: S.time });
    } else if (f && S.time - f.last > 5) {
      fights.delete(id);
      nextAt.set(id, Math.max(nextAt.get(id) ?? 0, S.time + 30));
      if (chatter.on && f.last - f.from > 3) afterFight(W, all);
    }
  }
}

function react(W: World, victim: Char, key: string, v: Vars) {
  const sq = W.squads.get(victim.squad);
  if (!sq) return;
  const near = members(W, sq).filter((c) => c !== victim && c.status === 'up' && !c.animal && !c.sleeping && Math.hypot(c.x - victim.x, c.z - victim.z) < 30);
  if (!near.some(visible) || !rng.chance(key === 'ally_dead' ? 0.9 : 0.6)) return;
  const c = rng.pick(near);
  say(c, pool(key, c), varsFor(W, c, near, v));
}

function afterFight(W: World, all: Char[]) {
  const people = all.filter(canTalk);
  if (!people.some(visible)) return;
  const c = rng.pick(people);
  const v = varsFor(W, c, people);
  const down = all.filter((m) => m.status === 'ko' && !m.animal);
  if (down.length && say(c, pool('after_fight_hurt', c), { ...v, name: first(rng.pick(down).name) })) return;
  const win = c.unique ? UNIQUE_CHAT[c.unique]?.win : undefined;
  if (win && rng.chance(0.6) && say(c, win, v)) return;
  const alone = all.filter((m) => !m.animal && m.alive).length === 1;
  if (rng.chance(0.6)) say(c, pool(alone ? 'after_fight_alone' : 'after_fight', c), v);
}

function idle(W: World, sq: Squad) {
  const now = S.time;
  const at = nextAt.get(sq.id);
  if (at === undefined) { nextAt.set(sq.id, now + rng.range(30, 80)); return; }
  if (now < at) return;
  const all = members(W, sq);
  const people = all.filter(canTalk);
  const later = (s: number) => { nextAt.set(sq.id, now + s); };
  if (!people.some(visible)) return later(6);
  if (fights.has(sq.id) || talking(sq.id) || playing()) return later(8);
  const spoke = idleLine(W, sq, all, people);
  const n = people.length;
  later(spoke ? rng.range(80, 170) * (n === 1 ? 1.7 : n >= 5 ? 0.8 : 1) : 20);
}

/** Picks something worth saying from what is going on, and says it. */
function idleLine(W: World, sq: Squad, all: Char[], people: Char[]): boolean {
  const cands: [() => boolean, number][] = [];
  const add = (w: number, f: () => boolean) => { if (w > 0) cands.push([f, w]); };
  const onScreen = people.filter(visible);
  const anyone = () => rng.pick(onScreen.length ? onScreen : people);
  const line = (c: Char, lines: string[] | undefined) => say(c, lines, varsFor(W, c, people));
  const plain = (c: Char) => voice(c) === 'plain';
  const lead = anyone();
  for (const c of onScreen) {
    const v = voice(c);
    const karuk = c.raceDef?.race === 'karuk';
    if (!c.robot && c.hunger < 40) add(5, () => line(c, pool('starving', c)));
    else if (!c.robot && c.hunger < 100) add(2, () => line(c, pool('hungry', c)));
    if (c.body.total() < 0.6) add(3, () => line(c, pool('hurt', c)));
    if (c.load() > 1 && v === 'plain') add(2, () => line(c, CHAT.heavy));
    if (c.shackled && v === 'plain') add(3, () => line(c, CHAT.shackled));
    if (v === 'plain' && totalBounty(c) > 0) add(1, () => line(c, CHAT.wanted));
    if (c.unique && UNIQUE_CHAT[c.unique]) add(4, () => line(c, UNIQUE_CHAT[c.unique].idle));
    const race = c.raceDef?.race;
    if (race && RACE_CHAT[race]) add(karuk ? 2.5 : 3, () => line(c, RACE_CHAT[race]));
  }
  const speaker = (want: (c: Char) => boolean) => { const l = onScreen.filter(want); return l.length ? rng.pick(l) : null; };
  const sayAs = (w: number, want: (c: Char) => boolean, lines: (c: Char) => string[] | undefined) => {
    add(w, () => { const c = speaker(want); return !!c && line(c, lines(c)); });
  };
  const anyVoice = () => true;
  // weather, hour, country
  const sp = S.weather?.at(lead.x, lead.z);
  if (sp && sp.kind !== 'clear' && sp.i > 0.35) sayAs(4, anyVoice, (c) => (plain(c) ? CHAT['weather_' + sp.kind] : pool('weather', c)));
  const h = S.clock.hour;
  if (S.clock.isNight) sayAs(1.5, anyVoice, (c) => pool('night', c));
  else if (h >= 5.5 && h < 7.5) sayAs(1.5, plain, () => CHAT.dawn);
  const reg = REGIONS[S.T.regionIdAt(lead.x, lead.z)];
  const moving = people.some((c) => c.mem.moved);
  if (reg && REGION_CHAT[reg.key]) sayAs(moving ? 2.5 : 1, plain, () => REGION_CHAT[reg.key]);
  // where we are
  const town = townAt(lead.x, lead.z);
  const base = playerBase();
  if (town) {
    const sackedAt = W.flags.sacked?.[town.id];
    if (sackedAt && S.clock.t - sackedAt < DAY * 5) sayAs(3, plain, () => CHAT.sacked);
    else if (town.faction && W.rel.hostile('player', town.faction)) sayAs(3, plain, () => CHAT.hostile_town);
    else sayAs(2, anyVoice, (c) => pool('town', c));
  } else if (base && Math.hypot(base.x - lead.x, base.z - lead.z) < 70) sayAs(2, anyVoice, (c) => pool('base', c));
  // purse, beasts and the dead
  if (W.money < 60) sayAs(1.5, anyVoice, (c) => pool('poor', c));
  else if (W.money > 25000) sayAs(1, plain, () => CHAT.rich);
  if (all.some((m) => m.animal && m.alive)) sayAs(1, plain, () => CHAT.beast);
  const f = fallen(W);
  if (f) sayAs(f.fresh ? 4 : 1.2, anyVoice, (c) => pool('mourn', c));
  // talk to each other, or to yourself
  if (people.length >= 2) add(4, () => convo(W, sq, people));
  if (people.length === 1) sayAs(1.5, anyVoice, (c) => pool('alone', c));
  else sayAs(2, plain, () => CHAT.idle);
  for (let i = 0; i < 4 && cands.length; i++) {
    const pick = rng.weighted(cands);
    if (pick()) return true;
    cands.splice(cands.findIndex((c) => c[0] === pick), 1);
  }
  return false;
}

function matches(c: Char, s?: Speaker) {
  if (!s) return voice(c) === 'plain';
  if (s.unique && c.unique !== s.unique) return false;
  if (s.race && c.raceDef?.race !== s.race) return false;
  return true;
}

function convo(W: World, sq: Squad, people: Char[]): boolean {
  const lead = people[0];
  const sp = S.weather?.at(lead.x, lead.z);
  const town = !!townAt(lead.x, lead.z);
  const ctx: Record<string, boolean> = {
    night: S.clock.isNight, day: !S.clock.isNight,
    hungry: people.some((c) => !c.robot && c.hunger < 100),
    poor: W.money < 200, rich: W.money > 20000,
    rain: !!sp && sp.kind === 'rain' && sp.i > 0.3,
    hurt: people.some((c) => c.body.total() < 0.7),
    town, wild: !town,
  };
  const options: [{ lines: string[]; a: Char; b: Char }, number][] = [];
  for (const cv of CONVOS) {
    if ((cv.when && !ctx[cv.when]) || recent.includes(cv.lines[0])) continue;
    for (const a of rng.shuffle(people.filter((c) => matches(c, cv.a)))) {
      const bs = people.filter((c) => c !== a && matches(c, cv.b) && Math.hypot(c.x - a.x, c.z - a.z) < 14);
      if (!bs.length) continue;
      const named = cv.a?.unique || cv.b?.unique ? 4 : 1;
      options.push([{ lines: cv.lines, a, b: rng.pick(bs) }, named * (cv.a?.race || cv.b?.race ? 1.5 : 1) * (cv.when ? 1.5 : 1)]);
      break;
    }
  }
  if (!options.length) return false;
  const o = rng.weighted(options);
  remember(o.lines[0]);
  run(o.lines, [o.a, o.b], sq.id, varsFor(W, o.a, people));
  return true;
}

const QUIET = new Set(['blackcomb', 'wardens', 'mistcrawlers', 'fauna', 'player']);

/** Townsfolk near your people talk to each other. */
function townTalk(W: World) {
  const mine = W.playerChars().filter((c) => c.status === 'up' && !c.animal && visible(c));
  for (const p of rng.shuffle(mine)) {
    if (!townAt(p.x, p.z)) continue;
    const near: Char[] = [];
    W.hash.near(p.x, p.z, 28, (o: Char) => {
      if (o.faction !== 'player' && !QUIET.has(o.faction) && canTalk(o) && !o.cage && !o.shackled && visible(o)) near.push(o);
    });
    const pairs: [Char, Char][] = [];
    for (let i = 0; i < near.length; i++) for (let j = i + 1; j < near.length; j++) {
      const a = near[i], b = near[j];
      if (a.faction === b.faction && Math.hypot(a.x - b.x, a.z - b.z) < 5) pairs.push([a, b]);
    }
    if (!pairs.length) continue;
    const [a, b] = rng.pick(pairs);
    const own = TOWN_TALK[a.faction] ?? [];
    const talks = a.faction === 'drifters' || !own.length ? [...own, ...TOWN_TALK.default] : own;
    const fresh = talks.filter((x) => !recent.includes(x[0]));
    if (!fresh.length) continue;
    const lines = rng.pick(fresh);
    remember(lines[0]);
    run(lines, [a, b], -1, {});
    return;
  }
}
