// Travel speed: a long walk passes at 15×, and drops back the moment anything
// happens: a hostile comes into sight (one who only wants a word, a toll or a
// meal, once they are close), bad news is given (danger, a wound, a loss: news
// that is only news waits in the corner) or an auto-pause fires, someone of yours is hit or hits, falls or bleeds, a
// conversation or a counter opens, or everyone gets where they were going or
// as near as they can. It always says why. It drops back to the speed it was
// started at, or to 1× for trouble. Like the captive card's wait, it sets the
// speed directly, past setSpeed's bookkeeping: travel speed is nothing Space
// should resume at.
import { G } from '../state';
import { S } from '../sim/ctx';
import { on, emit } from '../core/events';
import { keymap } from '../core/keys';
import { canSee } from '../sim/ai';
import { wantsToTalk } from '../sim/encounters';
import { hostile } from '../sim/combat';
import { RATE } from '../sim/clock';
import { WORK_ACTS } from '../sim/move';
import { ANIMAL } from '../content/animals';
import { FACTION } from '../content/factions';
import type { Char } from '../sim/char';

export const TRAVEL_SPEED = 15;
/** how far out a hostile is looked for (whether it is seen is canSee's to say) */
const LOOK = 90;
/** how near a band that only wants a word (a toll, a meal, a look at your papers) may come before it counts as trouble in sight */
const TALK_NEAR = 25;

let travelling = false;
let saying = false; // our own notice is going out: it must not stop us
let before = 1; // the speed travel was started at, to go back to

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

/**
 * A hostile one of yours can see, on its feet and awake, or null. A band that would rather talk first
 * (beggars, toll-takers, slavers sizing you up: see encounters) is no trouble until it is close: it walks
 * up to say its piece, and the conversation stops travel when it starts.
 */
export function hostileInSight(): Char | null {
  let found: Char | null = null;
  for (const c of walkers()) {
    S.W.hash.near(c.x, c.z, LOOK, (o) => {
      if (found || o.faction === 'player' || !o.awake || o.cage || o.carriedBy) return;
      if (!(hostile(o, c) || hostile(c, o)) || !canSee(c, o)) return;
      if (!o.brain.enemy && Math.hypot(o.x - c.x, o.z - c.z) > TALK_NEAR && wantsToTalk(o)) return;
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

/** Back to the speed travel was started at (1× for trouble: `kind` 'bad'), saying why if there is anything to say. */
export function stopTravel(why = '', kind = 'info') {
  if (!travelling) return;
  travelling = false;
  const back = kind === 'bad' ? 1 : before;
  if (G.speed === TRAVEL_SPEED) { G.speed = back; emit('speed'); }
  if (G.lastSpeed === TRAVEL_SPEED) G.lastSpeed = back;
  if (why) say(`Back to ${back === 1 ? 'normal speed' : `${back}×`}: ${why}.`, kind);
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
  before = G.speed && G.speed !== TRAVEL_SPEED ? G.speed : 1;
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

/** What slows someone below their legs' pace: shackles, someone in their arms, too much on their back, a bad leg. */
export function slowedBy(c: Char): string {
  if (c.shackled) return 'in shackles';
  if (c.carrying) return 'carrying someone';
  if (c.load() > 1) return `overloaded (${Math.round(c.carryWeight())} of ${Math.round(c.capacity())} kg)`;
  if (c.legFactor() < 0.85) return 'limping';
  return '';
}

/**
 * One of a group who will fall well behind the rest on a walk (at under three quarters of the others'
 * pace, for a reason: see slowedBy), and why; null if they keep together.
 */
export function laggard(group: Char[]): { c: Char; why: string } | null {
  const ws = group.filter((c) => c.alive && c.up && !c.carriedBy && !c.cage);
  if (ws.length < 2) return null;
  const pace = ws.map((c) => ({ c, v: c.moveSpeed() })).sort((a, b) => a.v - b.v);
  const slow = pace[0], rest = pace[Math.floor(pace.length / 2)];
  if (slow.v >= rest.v * 0.75) return null;
  const why = slowedBy(slow.c);
  return why ? { c: slow.c, why } : null;
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
  // bad news is worth normal speed (danger, a wound, a loss); news that is only news is not (a skill rising, a
  // deed, work posted in a town, a band marching on somewhere else): it waits in the corner, and the walk goes on
  on('notice', (text: string, kind?: string) => { if (travelling && !saying && kind === 'bad') stopTravel(String(text).replace(/[.!\s]+$/, ''), 'bad'); });
  // a blow given or taken by one of yours
  on('fx:hit', (c: Char, by: Char) => { if (travelling && (c.faction === 'player' || by?.faction === 'player')) stopTravel(c.faction === 'player' ? `${c.name} was hit` : `${by.name} is fighting`, 'bad'); });
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
