// Moments in the lives of your named people (content/personal): watched for
// every few seconds, played once as a short scene when the person is on
// screen, and written in the journal.
import { S } from './ctx';
import type { Char } from './char';
import type { World } from './world';
import type { WObj } from './objects';
import { MOMENTS, Moment } from '../content/personal';
import { scene, chatter, playing } from './chatter';
import { REGIONS } from '../world/regions';
import { SK, Skill } from './skills';
import { emit } from '../core/events';
import { HOUR, RATE } from './clock';

let t = 0;
const EVERY = 3; // seconds between checks

const up = (c: Char) => c.status === 'up' && !c.sleeping && !c.carriedBy && !c.target && !c.atk;
const seen = (c: Char) => !chatter.needView || !!c.view;
const close = (a: { x: number; z: number }, b: { x: number; z: number }, r: number) => Math.hypot(a.x - b.x, a.z - b.z) < r;

/** Tunde's sister, wherever she is. */
function ama(W: World): Char | undefined {
  for (const c of W.chars.values()) if (c.mem.sister === 'tunde_runaway' && c.alive) return c;
  return undefined;
}

function ownBuilt(W: World, near: Char, test: (o: WObj) => boolean) {
  for (const o of W.objs.values()) if (o.owner === 'player' && o.kind !== 'site' && test(o) && close(o, near, 45)) return true;
  return false;
}

/** Conditions worked out in code. A Char result is the 'other' of the scene. */
const NEEDS: Record<string, (W: World, who: Char, mine: Char[]) => Char | boolean> = {
  ama_near: (W, who) => { const a = ama(W); return !!a && a.faction !== 'player' && up(a) && close(a, who, 14) ? a : false; },
  ama_joined: (W, who) => { const a = ama(W); return !!a && a.faction === 'player' && up(a) && close(a, who, 25) ? a : false; },
  freed10: (W, who) => (W.flags.freed ?? 0) - (who.mem.freedAtJoin ?? 0) >= 10,
  wheat_field: (W, who) => ownBuilt(W, who, (o) => o.kind === 'farm' && o.def === 'wheat'),
  smithy: (W, who) => ownBuilt(W, who, (o) => o.data?.bkey === 'weapon_bench'),
  band8: (W, who, mine) => mine.filter((c) => !c.animal && c.alive).length >= 8,
};

function bump(c: Char, s: Skill, by: number) { c.sk[SK[s]] = Math.min(100, c.sk[SK[s]] + by); }

/** What changes afterwards. */
const EFFECTS: Record<string, (W: World, who: Char, other?: Char) => void> = {
  absolved: (W, who, other) => { if (other) other.title = 'the Absolved'; },
  lumen_shard: (W, who) => { who.inv.add('memory_shard', 1, 2); },
  cressa_map: () => { emit('map:reveal'); },
  piet_farm: (W, who) => { bump(who, 'farming', 12); },
  dunstan_forge: (W, who) => { bump(who, 'weaponsmith', 10); bump(who, 'armoursmith', 5); },
};

/** Whether a moment can happen now, and who else is in it. */
function ready(W: World, m: Moment, who: Char, named: Char[], mine: Char[]): { other?: Char; with?: Char } | null {
  const out: { other?: Char; with?: Char } = {};
  if (m.with) {
    const w = named.find((c) => c.unique === m.with && up(c) && close(c, who, 25));
    if (!w) return null;
    out.with = w;
  }
  if (m.at) {
    const site = S.T.sites.find((s) => s.key === m.at);
    if (!site || !close(site, who, site.r + (m.near ?? 60))) return null;
  }
  if (m.region && REGIONS[S.T.regionIdAt(who.x, who.z)]?.key !== m.region) return null;
  if (m.when === 'night' && !S.clock.isNight) return null;
  if (m.when === 'day' && S.clock.isNight) return null;
  if (m.weather) { const sp = S.weather.at(who.x, who.z); if (sp.kind !== m.weather || sp.i < 0.4) return null; }
  if (m.needs) {
    const r = NEEDS[m.needs]?.(W, who, mine);
    if (!r) return null;
    if (typeof r === 'object') out.other = r;
  }
  return out;
}

export function tickPersonal(dt: number) {
  t -= dt;
  if (t > 0) return;
  t = EVERY;
  const W = S.W;
  const mine = W.playerChars();
  const named = mine.filter((c) => !!c.unique && c.alive);
  if (!named.length || playing()) return;
  const done: Record<string, number> = W.flags.moments ?? (W.flags.moments = {});
  const hold: Record<string, number> = W.flags.momentHold ?? (W.flags.momentHold = {});
  for (const c of named) if (c.mem.freedAtJoin === undefined) c.mem.freedAtJoin = W.flags.freed ?? 0;
  for (const m of MOMENTS) {
    if (done[m.key] !== undefined) continue;
    const who = named.find((c) => c.unique === m.who);
    if (!who || !up(who)) continue;
    const r = ready(W, m, who, named, mine);
    if (!r) { delete hold[m.key]; continue; }
    if (m.dwell) {
      hold[m.key] = (hold[m.key] ?? 0) + (EVERY * RATE) / HOUR;
      if (hold[m.key] < m.dwell) continue;
    }
    const cast = { who, with: r.with, other: r.other };
    const parts = m.lines.map(([s, text]) => [cast[s], text] as [Char | undefined, string]).filter((p): p is [Char, string] => !!p[0]);
    if (!parts.every(([c]) => seen(c))) continue; // wait until you can see it happen
    done[m.key] = S.clock.t;
    delete hold[m.key];
    scene(parts);
    W.say(m.log, 'story', S.clock.t);
    if (m.effect) EFFECTS[m.effect]?.(W, who, r.with ?? r.other);
    return; // one moment at a time
  }
}
