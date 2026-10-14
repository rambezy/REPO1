// Travel speed: a long walk passes at 15×, and drops back to 1× the moment
// anything happens: a hostile comes into sight, a notice (other than good
// news) or an auto-pause fires, someone of yours is hit or hits, falls or
// bleeds, a conversation or a counter opens, or everyone gets where they were
// going or as near as they can. It always says why. Like the captive card's
// wait, it sets the speed directly, past setSpeed's bookkeeping: travel speed
// is nothing Space should resume at.
import { G } from '../state';
import { S } from '../sim/ctx';
import { on, emit } from '../core/events';
import { keymap } from '../core/keys';
import { canSee } from '../sim/ai';
import { hostile } from '../sim/combat';
import { RATE } from '../sim/clock';
import { WORK_ACTS } from '../sim/move';
import { ANIMAL } from '../content/animals';
import { FACTION } from '../content/factions';
import type { Char } from '../sim/char';

export const TRAVEL_SPEED = 15;
/** how far out a hostile is looked for (whether it is seen is canSee's to say) */
const LOOK = 90;

let travelling = false;
let saying = false; // our own notice is going out: it must not stop us

export const isTravelling = () => travelling && G.speed === TRAVEL_SPEED;

/** Yours who can walk anywhere at all. */
const walkers = (): Char[] => S.W.playerChars().filter((c) => c.alive && c.up && !c.cage && !c.carriedBy && !c.sleeping);

/** How far a walk to a job or a task must still have to go to be worth travel speed (a base's to-and-fro is not a journey). */
const FAR = 50;
/** Seconds of sim (sim time) under a walking pace before someone on the way is taken to be stuck short of it. */
const STALL = 3;
/** On the way somewhere: a move order, or a walk of some length to whatever they were told to do or set to work at (not there and at it, or fighting). */
const onTheWay = (c: Char) => c.order?.k === 'move' || (c.hasGoal && (!!c.order || c.jobs.length > 0) && !c.atk && !(c.act && WORK_ACTS.has(c.act)) && Math.hypot(c.goalX - c.x, c.goalZ - c.z) > FAR);
/** When each of yours was last seen walking (sim time). */
const lastMoved = new Map<number, number>();
/** On the way, and not stood stuck short of it these few seconds. */
const going = (c: Char) => {
  if (!onTheWay(c)) return false;
  if (c.speed >= 0.3 || !lastMoved.has(c.id)) { lastMoved.set(c.id, S.time); return true; }
  return S.time - lastMoved.get(c.id)! < STALL;
};
/** Someone of yours is on the way somewhere. */
export function anyMoving(): boolean {
  return walkers().some(onTheWay);
}
/** One of yours down, or bleeding: no time to skip. */
function hurt(): string {
  for (const c of S.W.playerChars()) {
    if (!c.alive || c.cage) continue;
    if (c.status === 'ko') return `${c.name} is down`;
    if (c.body.bleeding() > 0.05) return `${c.name} is bleeding`;
  }
  return '';
}

/** A hostile one of yours can see, on its feet and awake, or null. */
export function hostileInSight(): Char | null {
  let found: Char | null = null;
  for (const c of walkers()) {
    S.W.hash.near(c.x, c.z, LOOK, (o) => {
      if (found || o.faction === 'player' || !o.awake || o.cage || o.carriedBy) return;
      if (!(hostile(o, c) || hostile(c, o)) || !canSee(c, o)) return;
      found = o;
    });
    if (found) break;
  }
  return found;
}

/** "a dunehound", "Rolf of the Starvelings" */
const whatIs = (o: Char) => (o.animal ? `a ${ANIMAL[o.animal]?.name.toLowerCase() ?? 'beast'}` : FACTION[o.faction]?.short ? `${o.name} of the ${FACTION[o.faction].short}` : o.name);

function say(text: string, kind = 'info') {
  saying = true;
  try { emit('notice', text, kind); } finally { saying = false; }
}

/** Back to normal speed (1×), saying why if there is anything to say. */
export function stopTravel(why = '', kind = 'info') {
  if (!travelling) return;
  travelling = false;
  if (G.speed === TRAVEL_SPEED) { G.speed = 1; emit('speed'); }
  if (G.lastSpeed === TRAVEL_SPEED) G.lastSpeed = 1;
  if (why) say(`Back to normal speed: ${why}.`, kind);
}

/** Starts travel speed if a walk is under way and nothing is in sight; says why not otherwise. */
export function startTravel(): boolean {
  if (G.mode !== 'play' || travelling) return false;
  if (!anyMoving()) { say('Travel speed is for a long walk: send your people somewhere first.'); return false; }
  const why = hurt();
  if (why) { say(`Not now: ${why}.`, 'bad'); return false; }
  const foe = hostileInSight();
  if (foe) { say(`Not with ${whatIs(foe)} in sight.`, 'bad'); return false; }
  if (G.speed && G.speed !== TRAVEL_SPEED) G.lastSpeed = G.speed;
  lastMoved.clear();
  travelling = true;
  G.speed = TRAVEL_SPEED;
  emit('speed');
  return true;
}

export function toggleTravel() {
  if (travelling) stopTravel();
  else startTravel();
}

/** What travel watches for between frames: one of yours hurt, hostiles coming into sight, the walk ending or stuck. */
export function tickTravel() {
  if (!travelling) return;
  if (G.mode !== 'play' || G.speed !== TRAVEL_SPEED) { travelling = false; if (G.lastSpeed === TRAVEL_SPEED) G.lastSpeed = 1; return; }
  const why = hurt();
  if (why) { stopTravel(why, 'bad'); return; }
  const foe = hostileInSight();
  if (foe) { stopTravel(`${whatIs(foe)} in sight`, 'bad'); return; }
  const ws = walkers();
  if (ws.some(going)) return;
  // (on the way, but stood still short of it: there is no getting there from here)
  const stuck = ws.find(onTheWay);
  stopTravel(stuck ? `${stuck.name} can't get there` : 'your people are where they were going', stuck ? 'bad' : 'info');
}

/** Metres left on someone's way (rough: the planned path, or the straight line with a little over). */
export function wayLeft(c: Char): number {
  const p = c.path;
  if (c.hasGoal && p) {
    let d = 0, x = c.x, z = c.z;
    for (let i = p.idx; i < p.pts.length / 2; i++) { const px = p.pts[i * 2], pz = p.pts[i * 2 + 1]; d += Math.hypot(px - x, pz - z); x = px; z = pz; }
    for (let i = p.cidx; i < p.coarse.length / 2; i++) { const px = p.coarse[i * 2], pz = p.coarse[i * 2 + 1]; d += Math.hypot(px - x, pz - z); x = px; z = pz; }
    return d + Math.hypot(c.goalX - x, c.goalZ - z);
  }
  if (c.hasGoal) return Math.hypot(c.goalX - c.x, c.goalZ - c.z) * 1.2;
  const o = c.order;
  return o?.k === 'move' ? Math.hypot(o.x - c.x, o.z - c.z) * 1.2 : 0;
}

/** Game minutes someone's walk has left at their pace, or null if they are not going anywhere. */
export function walkMinutes(c: Char): number | null {
  if (!(c.order?.k === 'move' || c.hasGoal) || !c.up) return null;
  const d = wayLeft(c);
  if (d < 1) return null;
  return (d / Math.max(0.3, c.moveSpeed())) * RATE / 60;
}

/** "~40 min", "~2.5 h". */
export function minutesText(m: number): string {
  if (m < 90) return `~${Math.max(1, Math.round(m / (m < 15 ? 1 : 5)) * (m < 15 ? 1 : 5))} min`;
  const h = m / 60;
  return `~${h < 10 ? Math.round(h * 2) / 2 : Math.round(h)} h`;
}

let wired = false;
/** Wires the key, the events that end a journey, and the look round between frames. */
export function setupTravel(poll = true) {
  if (wired) return;
  wired = true;
  keymap.on('travel', () => { toggleTravel(); });
  // anything worth a notice is worth normal speed, but good news (a skill rising, a deed) is no reason to stop
  on('notice', (text: string, kind?: string) => { if (travelling && !saying && kind !== 'good') stopTravel(String(text).replace(/[.!\s]+$/, ''), kind === 'bad' ? 'bad' : 'info'); });
  // a blow given or taken by one of yours
  on('fx:hit', (c: Char, by: Char) => { if (travelling && (c.faction === 'player' || by?.faction === 'player')) stopTravel(c.faction === 'player' ? `${c.name} was hit` : `${by.name} is fighting`); });
  // anything else that changes the speed ends it: a speed key or button, a pause, an auto-pause, a load
  on('speed', () => {
    if (travelling && G.speed !== TRAVEL_SPEED) { travelling = false; if (G.lastSpeed === TRAVEL_SPEED) G.lastSpeed = 1; }
    // the menu, a conversation or an error card that paused travel hands back its 15× on closing: that is 1× now
    else if (!travelling && G.speed === TRAVEL_SPEED) { G.speed = 1; if (G.lastSpeed === TRAVEL_SPEED) G.lastSpeed = 1; emit('speed'); }
  });
  on('autopause', () => { travelling = false; if (G.lastSpeed === TRAVEL_SPEED) G.lastSpeed = 1; });
  // there: a conversation, a counter or a body to search is no thing to do at 15×
  for (const [ev, why] of [['ui:talk', 'a conversation'], ['ui:trade', 'trading'], ['ui:loot', 'searching']] as const) on(ev, () => { if (travelling) stopTravel(why); });
  // the frames a 15× world takes say nothing about the machine: the auto quality ladder waits (see renderer)
  if (G.R) G.R.ladderHold = () => G.speed >= TRAVEL_SPEED;
  on('world:reset', () => { travelling = false; });
  if (poll) setInterval(tickTravel, 200);
}
