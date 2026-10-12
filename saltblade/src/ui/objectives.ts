// The objective tracker: a start's first goals (content/objectives), ticked
// off as the game sees them happen. Progress lives in W.flags.objectives, so
// it is saved with the game; a save from before the tracker simply has none.
// Once the goals are done, or in a game that never had any, it keeps one
// quiet line: what to do next, as the journal has it (sim/contracts).
// The checks read the world and the sim's own events and need no document, so
// the headless test (tools/objtest.ts) drives them too; only mountObjectives
// touches the DOM.
import { h, shield } from './dom';
import { withKeys } from '../core/keys';
import { beatableNear } from '../sim/worldsim';
import { bearing } from '../sim/errands';
import { frame } from '../game/framing';
import { G } from '../state';
import { S } from '../sim/ctx';
import { on, emit } from '../core/events';
import { uiSound } from '../audio';
import { OBJECTIVES, Objective, ObjectiveSet, Reward, Trigger } from '../content/objectives';
import { ITEM } from '../content/items';
import { FACTION, HOSTILE_ALL } from '../content/factions';
import { totalBounty } from '../sim/crime';
import type { Char } from '../sim/char';
import type { Site } from '../world/terrain';
import { makeItem, type Item } from '../sim/inventory';
import { currentGoal, type Goal } from '../sim/contracts';

interface ObjState {
  set: string;
  done: Record<string, number>; // goal key -> game time it was done
  ids0: number[]; // who was there at the start
  id0?: number; // the next object id when the chain began: only things made after it count as built
  stats0?: Record<string, [number, number]>; // the knockouts and kills each of yours already had
  objs0?: number; // (older saves) things of yours standing at the start
  paid?: number; // when a bounty was last paid off by you
  paidTo?: string[]; // whose bounties you have paid off
  hidden?: boolean;
  finished?: number;
}

const ORES = ['iron_ore', 'copper_ore', 'stone'];
const FADE_MS = 12000; // a done goal stays, ticked, this long
const OUTRO_MS = 30000;

// what things looked like last time round, for the goals that watch a change
const hunger = new Map<number, number>();
const prost = new Map<number, number>();
let primed = false;
// real time of each completion, for the tick-and-fade; what each reward came to; and the last goal
const recent = new Map<string, number>();
const rewardNote = new Map<string, string>();
let finishedAt = 0;
let wired = false;

/** The saved chain, or null when this game has none (or carries something that is not one). */
function state(): ObjState | null {
  const st = S.W?.flags?.objectives;
  if (!st || typeof st !== 'object' || typeof st.set !== 'string' || !st.done || typeof st.done !== 'object' || !Array.isArray(st.ids0)) return null;
  return st as ObjState;
}
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Starts a start's chain of goals (a new game; saves from before carry none). */
export function beginObjectives(setKey: string) {
  const W = S.W;
  if (!OBJECTIVES[setKey]) { delete W.flags.objectives; return; }
  const mine = W.playerChars();
  const st: ObjState = { set: setKey, done: {}, ids0: mine.map((c) => c.id), id0: W.nextId, stats0: {} };
  for (const c of mine) st.stats0![c.id] = [c.stats.kos, c.stats.kills];
  W.flags.objectives = st;
  recent.clear();
  rewardNote.clear();
  finishedAt = 0;
  primed = false;
}

/** The goals as they stand: null when this game has no tracker. */
export function objectiveView(): { set: ObjectiveSet; open: Objective[]; done: Objective[]; finished: boolean; hidden: boolean } | null {
  const st = state();
  const set = st && OBJECTIVES[st.set];
  if (!st || !set) return null;
  return { set, open: set.goals.filter((g) => st.done[g.key] === undefined), done: set.goals.filter((g) => st.done[g.key] !== undefined), finished: !!st.finished, hidden: !!st.hidden };
}

/** Whether you have put up anything since the chain began (ids only grow), without copying the world's objects. */
function builtSince(id0: number): boolean {
  for (const o of S.W.objs.values()) if (o.owner === 'player' && o.kind !== 'site' && o.id >= id0) return true;
  return false;
}

/** A town your people can walk into: not one hostile to everyone, run by bandits or slavers, and not one that wants them. */
export function welcomingTown(s: Site): boolean {
  if (s.kind !== 'town' || !s.faction) return false;
  if (HOSTILE_ALL.includes(s.faction) || FACTION[s.faction]?.attitude === 'bandit' || FACTION[s.faction]?.captures === 'slavery') return false;
  if (S.W.rel.get('player', s.faction) <= -50) return false;
  const f = s.faction;
  return !S.W.playerChars().some((c) => (c.bounty[f] ?? 0) > 0);
}

/** Where a chain first sends you (its first "reach" goal), nearest to a point; null if it has none. */
export function firstGoalSite(setKey: string, x: number, z: number): Site | null {
  const when = OBJECTIVES[setKey]?.goals.map((g) => g.when).find((w) => w.k === 'reach');
  if (!when || when.k !== 'reach') return null;
  let best: Site | null = null, bd = Infinity;
  for (const s of sitesFor(when.site)) {
    if (when.site === 'town' && !welcomingTown(s)) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** Listens for the goals that are events rather than states. Safe to call more than once. */
export function setupObjectives() {
  if (wired) return;
  wired = true;
  on('keys', () => { lastKey = ''; }); // a rebound key is written into the goals afresh
  on('game:start', () => { primed = false; recent.clear(); rewardNote.clear(); finishedAt = 0; hunger.clear(); prost.clear(); lastKey = ''; });
  on('ui:talk', (pid: number, nid: number) => {
    const p = S.W.char(pid), n = S.W.char(nid);
    if (!p || !n || p.faction !== 'player') return;
    fire((t) => t.k === 'talk' && (!t.role || t.role.includes(n.role)));
  });
  on('ui:loot', (looter: number, target: { char?: number }) => {
    const t = target?.char ? S.W.char(target.char) : null;
    if (t && t.faction !== 'player') fire((x) => x.k === 'loot');
  });
  // goods settled at a shop's counter (sim/shops): slaves, beasts and hired blades are not goods
  on('sim:trade', (kind: 'buy' | 'sell', _sh: unknown, it: Item) => {
    if (kind === 'sell') fire((t) => t.k === 'sell' || t.k === 'deal' || (t.k === 'sell_ore' && ORES.includes(it.id)));
    else fire((t) => t.k === 'deal' || (t.k === 'buy' && (!t.item || t.item === it.id)));
  });
  on('sim:bountyPaid', (c: Char, faction: string) => {
    const st = state();
    if (!st || c.faction !== 'player') return;
    st.paid = S.clock.t;
    if (typeof faction === 'string' && !(st.paidTo ??= []).includes(faction)) st.paidTo.push(faction);
  });
}

/** Checks the goals that are states of the world. Call every half second or so while playing. */
export function tickObjectives() {
  const W = S.W;
  const st = state();
  const set = st && OBJECTIVES[st.set];
  if (!st || !set || st.finished) { refresh(); return; }
  const mine = W.playerChars();
  const alive = mine.filter((c) => c.alive);
  // someone who joined since brings their old fights with them: only new ones count
  const stats0 = (st.stats0 ??= {});
  for (const c of mine) if (!stats0[c.id]) stats0[c.id] = [c.stats.kos, c.stats.kills];
  if (primed) {
    for (const g of set.goals) {
      if (st.done[g.key] !== undefined) continue;
      let ok = false;
      try { ok = polled(g.when, st, mine, alive); } catch { ok = false; }
      if (ok) complete(g);
    }
  }
  // remember how things stand, so only a change counts next time
  for (const c of mine) { hunger.set(c.id, c.hunger); prost.set(c.id, prostHp(c)); }
  primed = true;
  refresh();
}

function polled(t: Trigger, st: ObjState, mine: Char[], alive: Char[]): boolean {
  const W = S.W;
  switch (t.k) {
    case 'reach': {
      const near = t.site === 'town' ? sitesFor(t.site).filter(welcomingTown) : sitesFor(t.site);
      return alive.some((c) => near.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < s.r + 15));
    }
    case 'mine': return mine.some((c) => c.act === 'mine');
    case 'farm': return mine.some((c) => c.act === 'farm');
    case 'bandage': return mine.some((c) => c.body.treated.some((v) => v > 0));
    case 'clot': return alive.length > 0 && alive.every((c) => c.body.bleeding() < 0.001);
    case 'eat': return mine.some((c) => !c.robot && hunger.has(c.id) && c.hunger > hunger.get(c.id)! + 5);
    case 'recruit': return mine.some((c) => !c.animal && !st.ids0.includes(c.id));
    case 'win': return mine.some((c) => { const b = st.stats0?.[c.id]; return !!b && (c.stats.kos > b[0] || c.stats.kills > b[1]); });
    case 'build': return st.id0 !== undefined ? builtSince(st.id0) : standing() > (st.objs0 ?? 0);
    case 'unshackle': return alive.length > 0 && alive.every((c) => !c.shackled);
    case 'sneak': return alive.some((c) => c.move === 'sneak');
    case 'escape': return !!W.flags.escaped;
    case 'salvage': return (W.flags.salvaged ?? 0) > 0;
    case 'repair': return mine.some((c) => prost.has(c.id) && prostHp(c) > prost.get(c.id)! + 0.5);
    case 'bounty': return (W.flags.bounties ?? 0) > 0;
    case 'clear_bounty': return !!st.paid && (!t.faction || !!st.paidTo?.includes(t.faction)) && alive.length > 0 && alive.every((c) => totalBounty(c) <= 0 && free(c));
    case 'arena': return !!W.flags.bout || (W.flags.pitWins ?? -1) >= 0;
    case 'money': return W.money >= t.n;
    case 'road': return alive.some((c) => S.T.roadAt(c.x, c.z) > 0);
    default: return false; // an event, not a state
  }
}

/** Completes every open goal whose trigger passes the test. */
function fire(test: (t: Trigger) => boolean) {
  const st = state();
  const set = st && OBJECTIVES[st.set];
  if (!st || !set || st.finished) return;
  for (const g of set.goals) if (st.done[g.key] === undefined && test(g.when)) complete(g);
}

function complete(g: Objective) {
  const st = state();
  const set = st && OBJECTIVES[st.set];
  if (!st || !set || st.done[g.key] !== undefined) return;
  const W = S.W;
  st.done[g.key] = S.clock.t;
  recent.set(g.key, now());
  const note = g.reward ? give(g.reward) : '';
  if (note) rewardNote.set(g.key, note);
  W.say(`${withKeys(g.text)}: done. ${g.done}${note ? ` (${note})` : ''}`, 'story', S.clock.t);
  uiSound('notify');
  if (set.goals.every((x) => st.done[x.key] !== undefined)) {
    st.finished = S.clock.t;
    finishedAt = now();
    W.say(set.outro, 'story', S.clock.t);
    S.fx.notice(set.outro, 'good');
  }
  lastKey = '';
  refresh();
}

/** Hands out a reward: chits to the purse, things to whoever has room, the rest at the lead's feet. Says what came of it. */
function give(r: Reward): string {
  const W = S.W;
  const bits: string[] = [];
  if (r.money) { W.money += r.money; bits.push(`+${r.money}c`); }
  const mine = W.playerChars().filter((c) => c.alive && !c.animal);
  const lead = mine[0];
  const loose: Item[] = [];
  for (const [id, n] of r.items ?? []) {
    const d = ITEM[id];
    if (!d) continue;
    let left = n;
    for (const c of mine) {
      for (const g of [c.inv, c.eq.back?.inv]) if (g && left > 0) left = g.add(id, left);
      if (!left) break;
    }
    if (left > 0) loose.push(makeItem(id, left));
    const feet = lead ? `${lead.name}'s feet` : 'your feet';
    bits.push(left === 0 ? `+${n} ${d.name}` : left === n ? `${n} ${d.name} at ${feet}` : `+${n - left} ${d.name}, ${left} at ${feet}`);
  }
  if (loose.length && lead) emit('world:drop', lead.x, lead.z, loose);
  return bits.join(', ');
}

// ---------------------------------------------------------------- what the checks look at
let siteCache: { key: string; list: Site[] } | null = null;
function sitesFor(site: string | string[]): Site[] {
  const keys = Array.isArray(site) ? site : [site];
  const k = keys.join('|');
  if (siteCache?.key === k) return siteCache.list;
  const list = S.T.sites.filter((s) => (keys.includes('town') && s.kind === 'town') || keys.includes(s.key) || (!!s.settlement && keys.includes(s.settlement)));
  siteCache = { key: k, list };
  return list;
}
/** Things of yours that stand built (not sites still going up). */
function standing() {
  let n = 0;
  for (const o of S.W.objs.values()) if (o.owner === 'player' && o.kind !== 'site') n++;
  return n;
}
/** Not caged, carried, chained or anyone's slave. */
const free = (c: Char) => !c.cage && !c.carriedBy && !c.shackled && !c.mem.enslavedBy;
function prostHp(c: Char) {
  let n = 0;
  for (let l = 3; l < 7; l++) if (c.body.isProst(l)) n += c.body.hp[l];
  return n;
}

// ---------------------------------------------------------------- what to do next
/** Whether the tracker is hidden for this game: the chain's own flag, or (a game with none) the Next line's. */
const isHidden = (st: ObjState | null) => (st ? !!st.hidden : !!S.W?.flags?.nextHidden);

/**
 * The line the tracker shows once a start's goals are all done, or in a game
 * that never had any (an older save): the next thing to do, as the journal
 * has it. Null while goals are still open, once hidden, or with nothing to say.
 */
export function trackerNext(): Goal | null {
  if (!S.W || !S.T) return null;
  const st = state();
  if (st && OBJECTIVES[st.set] && !st.finished) return null;
  if (isHidden(st)) return null;
  return currentGoal();
}

/** Hides the tracker for this game (its ×): the goals and the Next line alike. */
export function hideTracker() {
  const st = state();
  if (st) st.hidden = true;
  else S.W.flags.nextHidden = true;
  lastKey = '';
  refresh();
}

// ---------------------------------------------------------------- the tracker
let root: HTMLDivElement | null = null;
let fold = false;
let lastKey = '';
let nextText: HTMLSpanElement | null = null;
/** "Win a fight", while it is open: the nearest band your people could beat, and which way (see beatableNear). */
let aimText: HTMLSpanElement | null = null;
let aimAt: { x: number; z: number } | null = null;
function aimLine() {
  if (!aimText) return;
  const b = beatableNear();
  aimAt = b;
  const t = b ? `${b.n === 1 ? 'one' : b.n} ${b.name}, ${bearing(b.x, b.z)}: a fight you can win` : '';
  if (aimText.textContent !== t) aimText.textContent = t;
  aimText.parentElement?.classList.toggle('aimed', !!b);
}

/** Builds the tracker (mounted by the HUD) and starts its checks. */
export function mountObjectives(): HTMLDivElement {
  setupObjectives();
  root = h('div', { class: 'objs', style: { display: 'none' } });
  shield(root);
  try {
    const saved = localStorage.getItem('sb-objfold');
    fold = saved !== null ? saved === '1' : matchMedia('(max-width: 560px)').matches; // phones start folded
  } catch { fold = false; }
  setInterval(() => { if (G.mode === 'play') tickObjectives(); else if (root) { root.style.display = 'none'; lastKey = ''; } }, 500);
  return root;
}

function setFold(v: boolean) {
  fold = v;
  try { localStorage.setItem('sb-objfold', v ? '1' : '0'); } catch { /* private mode */ }
  lastKey = '';
  refresh();
}

function refresh() {
  if (!root) return;
  const st = state();
  const set = st && OBJECTIVES[st.set];
  const t = now();
  const fresh = set ? set.goals.filter((g) => st!.done[g.key] !== undefined && recent.has(g.key) && t - recent.get(g.key)! < FADE_MS) : [];
  const outro = !!st?.finished && finishedAt > 0 && t - finishedAt < OUTRO_MS;
  const open = set ? set.goals.filter((g) => st!.done[g.key] === undefined) : [];
  const listing = !!st && !!set && !st.hidden && (!st.finished || outro || fresh.length > 0);
  // once the goals are done (or there never were any): the next thing to do
  const next = trackerNext();
  const visible = listing || !!next;
  const key = JSON.stringify([visible, fold, open.map((g) => g.key), fresh.map((g) => g.key), outro, next ? next.entry ?? '-' : '']);
  if (key === lastKey) {
    // (the line's words move with the clock and the road: changed in place, nothing built again)
    if (next && nextText && nextText.textContent !== next.text) nextText.textContent = next.text;
    aimLine();
    return;
  }
  lastKey = key;
  aimText = null;
  root.style.display = visible ? '' : 'none';
  root.classList.toggle('fold', fold);
  root.innerHTML = '';
  nextText = null;
  if (!visible) return;
  const n = set ? set.goals.length : 0, d = n - open.length;
  const goalsLeft = !!st && !!set && !st.finished;
  const foldBtn = h('button', { class: 'objfold', title: fold ? 'Show the goals' : 'Fold the goals away' }, fold ? '+' : '−');
  const x = h('button', { class: 'objx', title: 'Hide the goals for this game' }, '×');
  const head = h('div', { class: 'objhead' }, h('span', { class: 'objtitle' }, set ? set.title : 'Goals'), set ? h('span', { class: 'objcount' }, `${d}/${n}`) : null, foldBtn, x);
  head.onclick = () => setFold(!fold);
  x.onclick = (e) => {
    e.stopPropagation();
    hideTracker();
    S.fx.notice(goalsLeft ? 'Goals hidden for this game. They still go in the Log (L) as you do them.' : 'Hidden for this game. What to do next is always at the top of the Journal (J).', 'info');
  };
  root.append(head);
  if (listing && st && set) {
    const list = h('div', { class: 'objlist' });
    for (const g of set.goals) {
      const done = st.done[g.key] !== undefined;
      if (done && !fresh.includes(g)) continue;
      const note = rewardNote.get(g.key);
      const ack = g.done + (note ? ` (${note})` : '');
      // a done row's fade carries on from where it was if the list is drawn again
      const style = done ? { animationDelay: `-${Math.round(t - recent.get(g.key)!)}ms` } : undefined;
      const row = h('div', { class: 'obj' + (done ? ' done' : ''), style }, h('i', { class: 'objmark' }), h('span', { class: 'objtext' }, withKeys(g.text)), done ? h('span', { class: 'objack' }, ack) : null);
      if (g.when.k === 'win' && !done) {
        // pointed at a band they could beat: a click looks at it
        aimText = h('span', { class: 'objaim' });
        row.appendChild(aimText);
        row.title = 'Look at them';
        row.onclick = (e) => { e.stopPropagation(); if (aimAt) frame(aimAt.x, aimAt.z, true); };
      }
      list.appendChild(row);
    }
    if (outro) list.appendChild(h('div', { class: 'objoutro' }, set.outro));
    root.append(list);
    aimLine();
  }
  if (next) {
    nextText = h('span', { class: 'objnextt' }, next.text);
    const line = h('div', { class: 'objnext', title: 'Open the journal at it (J)' }, h('span', { class: 'objnextk' }, 'Next'), nextText);
    line.onclick = () => emit('ui:journal', next.entry ?? 'work');
    root.append(line);
  }
}
