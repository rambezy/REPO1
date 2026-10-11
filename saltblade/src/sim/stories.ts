// Stories: a few of the powers of the waste have a cause they will draw you
// into once they know your work. Each is a handful of steps (see
// content/contracts) given by one person in one town, each step an errand,
// and at the end something in the world changes for good.
import { S } from './ctx';
import type { Char } from './char';
import type { DCtx, DChoice, Tree } from './dialogue';
import { RNG, hash3, hashStr } from '../core/rng';
import { makePerson, makeAnimal } from './spawn';
import { Squad } from './squad';
import { STORIES, STORY, SERGEANT, WARBOT, type StoryDef, type StoryStep } from '../content/contracts';
import { FACTION } from '../content/factions';
import { ITEM } from '../content/items';
import { RACE } from '../content/races';
import { emit } from '../core/events';
import { DAY, HOUR } from './clock';
import { houseOf } from './property';
import { scheduleCrisis } from './crisis';
import { Errand, startErrand, checkErrand, releaseErrand, errandWhere, errandProgress, siteById, siteByKey, carried, takeGoods, give, enlist, upMine } from './errands';
import type { Site } from '../world/terrain';
import type { TownInfo } from '../world/towns';

export interface StoryState {
  /** locked: they do not know you yet; open: they will talk; active: you are on it; done */
  state: 'locked' | 'open' | 'active' | 'done';
  step: number;
  /** the current step's errand (a talk step has none) */
  e?: Errand;
  /** the step failed: the giver will set it going again */
  retry?: boolean;
  /** the person who gives it */
  giver?: number;
  /** when the giver died, so an heir can come */
  giverLost?: number;
  /** steps done, and when */
  log: { step: number; t: number }[];
}

const W = () => S.W;
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const STATES = new Set(['locked', 'open', 'active', 'done']);
/**
 * Puts a story's kept state to rights (an older save has none; a broken one
 * may hold anything): a state it knows, a step it has, and an errand that
 * fits the step. Where the errand is lost the giver sets the step going
 * again, so no story is ever stuck.
 */
function mendStory(d: StoryDef, s: Record<string, any>) {
  if (!STATES.has(s.state)) s.state = 'locked';
  if (!Array.isArray(s.log)) s.log = [];
  else if (!s.log.every(isObj)) s.log = s.log.filter(isObj);
  const last = d.steps.length - 1;
  if (s.state === 'done') s.step = last + 1;
  else if (!Number.isInteger(s.step) || s.step < 0 || s.step > last) {
    // (where it had got to, by the steps it noted done)
    const logged = s.log.map((l: Record<string, any>) => l.step).filter((k: unknown): k is number => Number.isInteger(k));
    s.step = Math.min(last, logged.length ? Math.max(...logged) + 1 : 0);
  }
  if (s.e !== undefined && (!isObj(s.e) || s.state !== 'active' || s.e.kind !== d.steps[s.step]?.kind || typeof s.e.site !== 'number')) {
    delete s.e;
    if (s.state === 'active' && d.steps[s.step].kind !== 'talk') s.retry = true;
  }
  if (s.state === 'active' && s.e === undefined && d.steps[s.step].kind !== 'talk') s.retry = true;
  if (typeof s.retry !== 'boolean') delete s.retry;
  if (typeof s.giver !== 'number') delete s.giver;
  if (typeof s.giverLost !== 'number') delete s.giverLost;
}
export function storyStates(): Record<string, StoryState> {
  const f = W().flags;
  if (!isObj(f.story)) f.story = {};
  const all = f.story as Record<string, any>;
  for (const d of STORIES) {
    if (!isObj(all[d.key])) all[d.key] = { state: 'locked', step: 0, log: [] };
    // (cheap enough to look at every time: a few fields of three stories)
    const s = all[d.key];
    if (!STATES.has(s.state) || !Number.isInteger(s.step) || !Array.isArray(s.log) || (s.state !== 'done' && !d.steps[s.step]) || (s.e !== undefined && (!isObj(s.e) || s.e.kind !== d.steps[s.step]?.kind))) mendStory(d, s);
  }
  return all as Record<string, StoryState>;
}
export const storyState = (key: string) => storyStates()[key];
const owner = (key: string) => 's:' + key;

/** The town the giver stands in. */
const townOf = (d: StoryDef) => siteByKey(d.town);

/** The camps the stories send you to clear: no board posts them, so no camp is paid for twice. */
const campsOf = new WeakMap<object, Set<number>>();
export function storyCamps(): Set<number> {
  let out = campsOf.get(S.T);
  if (!out) {
    out = new Set();
    for (const d of STORIES) for (const st of d.steps) if (st.kind === 'camp') { const site = stepSite(d, st); if (site) out.add(site.id); }
    campsOf.set(S.T, out);
  }
  return out;
}

/** Whether the giver will talk to you yet. */
function available(d: StoryDef): boolean {
  const flags = W().flags;
  const done = (f: string) => { const v = flags.contracts?.by?.[f]; return typeof v === 'number' ? v : 0; };
  const rel = (f: string) => W().rel.get('player', f);
  switch (d.key) {
    case 'freeroad': return done('drifters') >= 1 || rel('drifters') >= 20;
    case 'ashtithe': return done('ember') >= 1 || rel('ember') >= 15;
    case 'foundry': return done('hollows') + done('delvers') >= 1 || rel('hollows') >= 10 || rel('delvers') >= 20 || (flags.salvaged ?? 0) >= 2 || (flags.reprogrammed ?? 0) >= 1;
  }
  return false;
}

/** The foundry nearest a place (a story step's 'foundry'). */
function foundryNear(x: number, z: number): Site | undefined {
  return S.T.nearestSite(x, z, (s) => s.kind === 'foundry') ?? undefined;
}
/** Where a step happens. */
function stepSite(d: StoryDef, st: StoryStep): Site | undefined {
  const town = townOf(d);
  if (!st.at) return town;
  if (st.at === 'foundry') return town ? foundryNear(town.x, town.z) : undefined;
  return siteByKey(st.at);
}

/** The errand a step asks for. */
function errandFor(d: StoryDef, st: StoryStep): Errand | null {
  const town = townOf(d);
  const site = stepSite(d, st);
  if (!town || !site) return null;
  switch (st.kind) {
    case 'camp': return { kind: 'camp', site: site.id };
    case 'reach': return { kind: 'reach', site: site.id };
    case 'defend': return { kind: 'defend', site: site.id, faction: st.faction };
    case 'haul': return { kind: 'haul', site: town.id, good: st.good, n: st.n };
    case 'deliver': return { kind: 'deliver', site: site.id, item: 'watch_letter', who: st.who, title: st.whoTitle };
    case 'escort': return { kind: 'escort', site: site.id, from: (st.from ? siteByKey(st.from) : town)?.id, who: st.who, faction: st.faction, size: 1 };
    case 'hunt': {
      // off the road between two places, a little under halfway along
      const a = siteByKey(st.road![0]), b = siteByKey(st.road![1]);
      if (!a || !b) return null;
      const rng = new RNG(hash3(hashStr(d.key), 7, 1));
      const k = rng.range(0.38, 0.5), side = rng.chance(0.5) ? 1 : -1;
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const x = a.x + (b.x - a.x) * k + ((b.z - a.z) / len) * 70 * side, z = a.z + (b.z - a.z) * k - ((b.x - a.x) / len) * 70 * side;
      return { kind: 'hunt', site: town.id, x, z, who: st.who, title: st.whoTitle, faction: st.faction, size: (st.size ?? 3) - 1, level: st.level, loot: st.faction === 'scorched' ? 'dreamleaf' : undefined };
    }
  }
  return null;
}

// ---------------------------------------------------------------- moving on
/** Pays what a step pays, and says so. */
function reward(st: StoryStep, d: StoryDef) {
  const bits: string[] = [];
  if (st.pay) { W().money += st.pay; bits.push(`${st.pay} chits`); }
  for (const [f, v] of st.standing ?? []) { W().rel.add('player', f, v); bits.push(`${v > 0 ? '+' : ''}${v} with the ${FACTION[f]?.short ?? f}`); }
  if (bits.length) S.fx.notice(`${d.name}: ${bits.join(', ')}.`, 'good');
}

/** Sets the current step going: its errand, if it has one. */
function beginStep(d: StoryDef, s: StoryState, p?: Char) {
  const st = d.steps[s.step];
  s.retry = false;
  if (st.kind === 'talk') { s.e = undefined; return; }
  const e = errandFor(d, st);
  if (!e) { s.e = undefined; s.retry = true; return; }
  s.e = e;
  if (!startErrand(e, owner(d.key), p)) { s.e = undefined; s.retry = true; }
}

/** The current step is done: its pay, the journal, and on to the next (or the end). Returns the next step's opening words. */
function advance(d: StoryDef, s: StoryState, p?: Char): string {
  const st = d.steps[s.step];
  if (s.e) releaseErrand(s.e);
  s.log.push({ step: s.step, t: S.clock.t });
  W().say(`${d.name}: ${st.done}`, 'story', S.clock.t);
  reward(st, d);
  s.e = undefined;
  s.step++;
  if (s.step >= d.steps.length) {
    s.state = 'done';
    capstone(d, p);
    return '';
  }
  const next = d.steps[s.step];
  S.fx.notice(`${d.name}: ${next.title}.`, 'good');
  beginStep(d, s, p);
  return next.say;
}

/** What changes for good at the end of each story. */
function capstone(d: StoryDef, p?: Char) {
  const lead = p ?? upMine()[0];
  const town = townOf(d);
  switch (d.key) {
    case 'freeroad': {
      // a house in Crossroad, a sergeant of the Watch, and the Reavers kept off the free towns
      const sign = [...W().objs.values()].find((o) => o.kind === 'sign' && o.def === 'forsale' && o.site === town?.id && houseOf(o)?.owner !== 'player');
      const house = sign ? houseOf(sign) : undefined;
      if (sign && house) {
        house.owner = 'player';
        delete house.data.forSale;
        for (const o of W().objs.values()) if (o.parent === house.id) o.owner = 'player';
        W().removeObj(sign);
        emit('objs');
        W().say(`The Watch gave ${W().factionName} the deed to a ${house.data.name?.toLowerCase?.() ?? 'house'} in Crossroad.`, 'good', S.clock.t);
      } else { W().money += 4000; W().say('The Watch had no empty house to give, and paid 4,000 chits instead.', 'good', S.clock.t); }
      if (lead) {
        const c = makePerson(W(), { faction: 'drifters', role: 'guard', race: 'valefolk', female: false, level: 30, loadout: 'drifters_guard', name: SERGEANT.name, whole: true }, new RNG(hash3(hashStr('brannoc'), 1, 1)));
        enlist(c, lead);
        c.title = SERGEANT.title;
        W().say(`${c.name}, ${SERGEANT.title}, joined ${W().factionName}.`, 'good', S.clock.t);
        lead.title = 'Warden of the Free Road';
      }
      W().flags.quiet = { ...(W().flags.quiet ?? {}), reavers: S.clock.t + DAY * 30 };
      W().rel.add('player', 'drifters', 20);
      break;
    }
    case 'ashtithe': {
      if (lead) { give(lead, 'pyre_tongue', 1, 5); lead.title = 'Flamebearer'; }
      W().rel.add('player', 'ember', 20);
      W().rel.add('player', 'scorched', -25);
      break;
    }
    case 'foundry': {
      if (lead) {
        const bot = makeAnimal(W(), 'warbot', new RNG(hash3(hashStr('bulwark'), 1, 1)));
        bot.name = WARBOT.name;
        bot.mem.reprogrammed = true;
        enlist(bot, lead);
        bot.title = WARBOT.title;
        W().flags.reprogrammed = (W().flags.reprogrammed ?? 0) + 1;
        W().say(`${WARBOT.name}, a warbot the Custodian rewired, walks with ${W().factionName} now.`, 'good', S.clock.t);
      }
      W().money += 1500;
      W().rel.add('player', 'hollows', 15);
      W().rel.add('player', 'delvers', 10);
      scheduleCrisis(S.clock.t + DAY);
      break;
    }
  }
  W().say(`${d.name}: ${d.capstone}`, 'story', S.clock.t);
  S.fx.notice(`${d.name}: done. ${d.capstone}`, 'good');
}

// ---------------------------------------------------------------- the givers
/** Brings the giver (or, after a death, whoever speaks for them now) to their town's square. */
function placeGiver(d: StoryDef, s: StoryState) {
  const town = townOf(d);
  if (!town || !W().populated.has(town.id)) return;
  // (a giver already in the world, from before the story's state was kept, is taken up again)
  if (!s.giver) for (const c of W().chars.values()) if (c.mem.story === d.key && c.alive) { s.giver = c.id; return; }
  const c0 = s.giver ? W().char(s.giver) : undefined;
  if (c0 && c0.status !== 'dead') return;
  // a death is mourned for half a day before anyone takes their place
  if (s.giver) {
    s.giverLost ??= S.clock.t;
    if (S.clock.t - s.giverLost < HOUR * 12) return;
  }
  const heir = !!s.giver;
  const info = W().towns.get(town.id) as TownInfo | undefined;
  const posts = info?.posts.filter((p) => p.kind === 'plaza') ?? [];
  const post = posts[posts.length - 1];
  const at = S.nav.nearestOpen(post ? post.x : town.x + 5, post ? post.z : town.z - 5, 10) ?? [town.x, town.z];
  let sq = [...W().squads.values()].find((q) => q.site === town.id && q.kind === 'town' && q.faction === town.faction);
  if (!sq) { sq = new Squad(); sq.faction = town.faction ?? d.faction; sq.kind = 'town'; sq.name = town.name; sq.site = town.id; W().addSquad(sq); }
  const g = d.giver;
  const c = makePerson(W(), { faction: sq.faction, role: 'guard', race: RACE[g.race] ? g.race : undefined, female: g.female, level: g.level, loadout: g.loadout, name: heir ? g.heir : g.name, whole: true }, new RNG(hash3(hashStr(d.key), heir ? 2 : 1, 9)));
  W().moveToSquad(c, sq);
  c.x = at[0]; c.z = at[1]; c.y = S.T.heightAt(c.x, c.z);
  c.homeX = c.x; c.homeZ = c.z; c.homeDir = c.dir = post?.dir ?? 0;
  c.site = town.id;
  c.title = g.title;
  c.mem.story = d.key;
  s.giver = c.id;
  delete s.giverLost;
  if (heir) W().say(`${c.name} speaks for ${g.title === 'Custodian' ? 'the enclave' : `the ${FACTION[d.faction]?.short ?? d.faction}`} in ${town.name} now.`, 'info', S.clock.t);
}

// ---------------------------------------------------------------- the tick
let t = 0;
export function tickStories(dt: number) {
  t -= dt;
  if (t > 0) return;
  t = 1;
  const all = storyStates();
  for (const d of STORIES) {
    const s = all[d.key];
    placeGiver(d, s);
    if (s.state === 'locked' && available(d)) {
      s.state = 'open';
      W().say(d.call, 'story', S.clock.t);
      S.fx.notice(d.call, 'good');
    }
    if (s.state !== 'active' || !s.e) continue;
    const r = checkErrand(s.e, owner(d.key));
    if (r === 'ready' && s.e.kind !== 'haul' && s.e.kind !== 'deliver') advance(d, s);
    else if (r === 'failed') {
      W().say(`${d.name}: ${s.e.why ?? 'That went wrong.'} Go back to ${d.giver.name}.`, 'bad', S.clock.t);
      S.fx.notice(`${d.name}: ${s.e.why ?? 'That went wrong.'}`, 'bad');
      releaseErrand(s.e);
      s.e = undefined;
      s.retry = true;
    }
  }
}

/** The errand a story is on (for whoever it brought in to find their way back to it). */
export function storyErrand(key: string): Errand | undefined { return storyStates()[key]?.e; }

/** A story's errand finished in a conversation (a letter handed over): the story moves on. Returns what is said next. */
export function storyErrandDone(key: string, p?: Char): string {
  const d = STORY[key], s = storyStates()[key];
  if (!d || !s || s.state !== 'active' || !s.e) return '';
  return advance(d, s, p);
}

// ---------------------------------------------------------------- talking to the giver
const BYE: DChoice = { t: 'Goodbye.', end: true };
const ctxStory = (c: DCtx) => { const key = c.n.mem.story as string; return { d: STORY[key], s: storyStates()[key] }; };
const nonHuman = (c: DCtx) => W().playerChars().some((m) => m.alive && !m.animal && RACE[m.look.race]?.race !== 'human' && Math.hypot(m.x - c.p.x, m.z - c.p.z) < 40);
/** The Covenant will not hear a band with beasts or machines in it. */
const refused = (c: DCtx) => ctxStory(c).d?.faction === 'ember' && nonHuman(c);

/** Whether the bring step's goods are here. */
const canHandIn = (c: DCtx) => {
  const { s } = ctxStory(c);
  return s?.state === 'active' && s.e?.kind === 'haul' && carried(s.e.good!, c.n, 40) >= s.e.n!;
};

const GIVER: Tree = {
  start: {
    t: (c) => {
      const { d, s } = ctxStory(c);
      if (!d) return '...';
      if (refused(c)) return 'The flame does not bargain with beasts and machines. Come back without them.';
      if (s.state === 'locked') return d.notYet;
      if (s.state === 'open') return d.steps[0].say;
      if (s.state === 'done') return S.rng.pick(['The roads remember what you did. So do I.', 'You are always welcome here.', 'Still alive? Good. Keep it that way.']);
      const st = d.steps[s.step];
      if (s.retry) return `${st.title}. That went wrong. We try again, then.`;
      if (st.kind === 'talk') return st.say;
      const prog = s.e ? errandProgress(s.e) : '';
      return `${st.text}${prog ? ' ' + prog : ''}`;
    },
    ch: [
      { t: 'I\'m in.', if: (c) => !refused(c) && ctxStory(c).s?.state === 'open', fx: (c) => { const { d, s } = ctxStory(c); s.state = 'active'; s.step = 0; c.vars.said = advance(d, s, c.p); }, next: 'go' },
      { t: (c) => { const e = ctxStory(c).s.e!; return `Here: ${e.n} ${ITEM[e.good!].name}.`; }, if: (c) => !refused(c) && canHandIn(c), fx: (c) => { const { d, s } = ctxStory(c); if (takeGoods(s.e!.good!, s.e!.n!, c.n, 40)) c.vars.said = advance(d, s, c.p); }, next: 'go' },
      { t: (c) => (ctxStory(c).s.step === ctxStory(c).d.steps.length - 1 ? 'Thank you.' : 'What now?'), if: (c) => !refused(c) && ctxStory(c).s?.state === 'active' && !ctxStory(c).s.retry && ctxStory(c).d.steps[ctxStory(c).s.step].kind === 'talk', fx: (c) => { const { d, s } = ctxStory(c); c.vars.said = advance(d, s, c.p); }, next: 'go' },
      { t: 'Let\'s try it again.', if: (c) => !refused(c) && ctxStory(c).s?.state === 'active' && !!ctxStory(c).s.retry, fx: (c) => { const { d, s } = ctxStory(c); beginStep(d, s, c.p); c.vars.said = s.retry ? 'Not now. Come back in a while.' : d.steps[s.step].say; }, next: 'go' },
      { t: 'Not now.', if: (c) => ctxStory(c).s?.state === 'open', end: true },
      BYE,
    ],
  },
  go: {
    t: (c) => (c.vars.said as string) || S.rng.pick(['Go well.', 'Then go.', 'The road is waiting.']),
    ch: [BYE],
  },
};

/** The conversation a story's giver offers, if this is one. */
export function storyTree(n: Char): [Tree, string] | null {
  return n.mem.story && STORY[n.mem.story] ? [GIVER, 'start'] : null;
}

// ---------------------------------------------------------------- for the journal and the map
export interface StoryView { def: StoryDef; s: StoryState; step?: StoryStep; where?: { x: number; z: number }; progress: string }
export function storyViews(): StoryView[] {
  const all = storyStates();
  return STORIES.map((def) => {
    const s = all[def.key];
    const step = s.state === 'active' ? def.steps[s.step] : undefined;
    const giver = s.giver ? W().char(s.giver) : undefined;
    const town = townOf(def);
    let where: { x: number; z: number } | undefined;
    if (s.state === 'open' || (step && (step.kind === 'talk' || step.kind === 'haul' || s.retry))) where = giver?.alive ? { x: giver.x, z: giver.z } : town ? { x: town.x, z: town.z } : undefined;
    else if (s.e) where = errandWhere(s.e) ?? undefined;
    return { def, s, step, where, progress: s.e ? errandProgress(s.e) : '' };
  });
}

/** The step of a story most worth doing now, as a line for the tracker. */
export function storyGoal(): { text: string; where?: { x: number; z: number }; entry: string } | null {
  for (const v of storyViews()) {
    if (v.s.state !== 'active' || !v.step) continue;
    return { text: `${v.def.name}: ${v.s.retry ? `Go back to ${v.def.giver.known}.` : v.step.text}`, where: v.where, entry: 'story:' + v.def.key };
  }
  for (const v of storyViews()) if (v.s.state === 'open') return { text: `${v.def.name}: ${v.def.giver.known} wants a word, at ${townOf(v.def)?.name ?? '?'}.`, where: v.where, entry: 'story:' + v.def.key };
  return null;
}

/** For the debug helpers: puts a story at a step, as if the ones before were done. */
export function setStoryStep(key: string, step: number, p?: Char): string {
  const d = STORY[key], s = storyStates()[key];
  if (!d || !s) return 'no such story';
  if (s.e) releaseErrand(s.e);
  s.state = step >= d.steps.length ? 'done' : 'active';
  s.step = Math.max(0, Math.min(step, d.steps.length));
  s.log = [];
  for (let i = 0; i < s.step; i++) s.log.push({ step: i, t: S.clock.t });
  if (s.state === 'active') beginStep(d, s, p ?? upMine()[0]);
  return s.state === 'active' ? d.steps[s.step].title : 'done';
}
