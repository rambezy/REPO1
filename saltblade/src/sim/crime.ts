// Crime and the law. Witnesses report crimes to their faction; guards come
// for anyone with a bounty. Bounties are per faction and per person.
import { Char, Order } from './char';
import { S } from './ctx';
import { FACTION } from '../content/factions';
import { canSee, enslave } from './ai';
import { freeFromCage } from './orders';
import { HOUR } from './clock';
import { hostile } from './combat';

export type CrimeKind = 'theft' | 'assault' | 'murder' | 'trespass' | 'kidnap' | 'runaway' | 'freeing' | 'drugs' | 'heresy' | 'pickpocket' | 'escape';

const NAMES: Record<CrimeKind, string> = {
  theft: 'theft', assault: 'assault', murder: 'murder', trespass: 'trespassing', kidnap: 'kidnapping', runaway: 'escaping slavery',
  freeing: 'freeing slaves', drugs: 'carrying dreamleaf', heresy: 'heresy', pickpocket: 'pickpocketing', escape: 'breaking out of a cage',
};

/** Finds a witness of a faction (or its allies) who sees the culprit. The chained and the caged tell nobody anything. */
export function witness(c: Char, faction: string, r = 26): Char | null {
  let w: Char | null = null;
  S.W.hash.near(c.x, c.z, r, (o) => {
    if (w || o === c || !o.awake || o.animal || o.cage || o.role === 'slave' || o.role === 'prisoner') return;
    if (o.faction !== faction && S.W.rel.get(o.faction, faction) < 60) return;
    if (canSee(o, c)) w = o;
  });
  return w;
}

/** Commits a crime. Returns true if someone saw it. */
export function crime(c: Char, kind: CrimeKind, faction: string, amount: number, needWitness = true): boolean {
  const f = FACTION[faction];
  if (!f || !f.lawful || faction === 'player') return false;
  const w = needWitness ? witness(c, faction) : null;
  if (needWitness && !w) return false;
  c.bounty[faction] = (c.bounty[faction] ?? 0) + amount;
  S.W.rel.add('player', faction, -Math.min(10, amount / 100));
  if (w) { S.fx.say(w, shout(kind)); S.fx.sound('alarm', w.x, w.z, 0.7); }
  if (c.faction === 'player') S.W.say(`${c.name} was seen ${NAMES[kind]} by the ${f.short}. Bounty: ${c.bounty[faction]} chits.`, 'crime', S.clock.t);
  S.fx.notice(`${f.short}: ${c.name} is wanted for ${NAMES[kind]} (${c.bounty[faction]}c)`, 'bad');
  return true;
}

function shout(k: CrimeKind) {
  switch (k) {
    case 'theft': case 'pickpocket': return S.rng.pick(['Thief! Stop, thief!', 'Guards! We have a thief!', 'Put that back!']);
    case 'assault': case 'murder': return S.rng.pick(['Murderer!', 'Guards! Guards!', 'They attacked us!']);
    case 'kidnap': return 'They are taking someone! Stop them!';
    case 'runaway': return 'A runaway! Seize them!';
    case 'escape': return 'The prisoner is loose! Seize them!';
    case 'freeing': return 'Slave thief!';
    default: return 'You there! Stop!';
  }
}

export function totalBounty(c: Char) {
  let t = 0;
  for (const v of Object.values(c.bounty)) t += v;
  return t;
}

/** A slave seen loose, leaving, or at their irons: reported to their owners once, not again within the hour. */
export function reportRunaway(c: Char, owner: string): boolean {
  if (S.clock.t - (c.mem.runawayT ?? -1e9) < HOUR) return false;
  if (!crime(c, 'runaway', owner, 1000, true)) return false;
  c.mem.runawayT = S.clock.t;
  return true;
}

let slaveT = 0;
/** Slaves of yours: an unshackled slave in the camp, or any slave outside it, is a runaway if seen. Far enough away, they are free. */
/** How far past a camp's edge a runaway slave has to get to be free of it (its fields reach 130 m out). */
export const ESCAPE_M = 300;

export function tickRunaways(dt: number) {
  slaveT -= dt;
  if (slaveT > 0) return;
  slaveT = 1;
  for (const c of S.W.playerChars()) {
    // a cage that is no longer there holds nobody
    if (c.cage && !S.W.objs.get(c.cage)) c.cage = 0;
    // jailers feed what they hold: thin gruel, enough to stand
    if (c.cage && c.mem.jailUntil && c.hunger < 90 && !c.robot && !c.animal) c.hunger = 90;
    // sentences served
    if (c.cage && c.mem.jailUntil && S.clock.t >= c.mem.jailUntil) {
      delete c.mem.jailUntil;
      freeFromCage(c.id);
      c.shackled = false;
      c.dirty = true;
      S.W.say(`${c.name} served their sentence and was let out.`, 'info', S.clock.t);
      S.fx.notice(`${c.name} has been released from prison.`, 'good');
      continue;
    }
    // caged by their owners with no sentence (older saves): nobody is kept in a hole with no way out; they go to the fields
    const cage = c.cage ? S.W.objs.get(c.cage) : undefined;
    if (cage && !c.mem.jailUntil && c.mem.enslavedBy && cage.owner === c.mem.enslavedBy && c.status === 'up') {
      cage.occupant = 0;
      c.cage = 0;
      const site = (cage.site ? S.T.sites.find((s) => s.id === cage.site) : null) ?? S.T.nearestSite(c.x, c.z) ?? null;
      enslave(c, c.mem.enslavedBy, site);
      continue;
    }
    const fac = c.mem.enslavedBy as string | undefined;
    if (!fac || !c.alive || !c.mem.slaveSite) continue;
    const site = S.T.sites.find((s) => s.id === c.mem.slaveSite);
    if (!site) continue;
    const d = Math.hypot(c.x - site.x, c.z - site.z);
    if (d > site.r + ESCAPE_M) {
      // free: nobody's slave any more, whatever irons they still wear
      delete c.mem.slaveSite;
      delete c.mem.slaveSpot;
      delete c.mem.enslavedBy;
      S.W.say(`${c.name} escaped ${site.name}.`, 'story', S.clock.t);
      // clear of the camp: no more creeping, up and running (they can sneak again if they like)
      const crept = c.move === 'sneak';
      if (crept) standUp(c);
      // ({sneak} is written in as the player has it bound, where the notice is shown)
      S.fx.notice(`${c.name} has escaped ${site.name}!${crept ? ' Up and running now ({sneak} to sneak again).' : ''}`, 'good');
      if (!S.W.flags.escaped) S.W.flags.escaped = S.clock.t;
      continue;
    }
    // the overseers feed the chained in their fields, enough to work
    if (d <= site.r + 130 && c.shackled && c.hunger < 90 && !c.robot && !c.animal) c.hunger = 90;
    if ((c.bounty[fac] ?? 0) > 0 || c.status !== 'up') continue;
    // the camp includes its fields, which lie outside the fence
    if (d > site.r + 130 || !c.shackled) reportRunaway(c, fac);
  }
}

export type CaptiveKind = 'dead' | 'down' | 'carried' | 'caged' | 'slave' | 'free';
export interface Captivity {
  kind: CaptiveKind;
  /** what holds them, in plain words */
  text: string;
  /** what they could do about it themselves, if anything */
  order?: Order;
  /** it passes by itself: the body wakes, the captor arrives, the sentence runs out */
  passes: boolean;
}

/** Why one of yours cannot act freely, and what they could do about it. Nobody is ever left with nothing. */
export function captivity(c: Char): Captivity {
  if (!c.alive) return { kind: 'dead', text: 'dead', passes: false };
  const siteName = (id: number) => S.T.sites.find((s) => s.id === id)?.name ?? 'somewhere in the waste';
  if (c.carriedBy) {
    const k = S.W.char(c.carriedBy);
    const who = k ? FACTION[k.faction]?.short ?? k.name : 'someone';
    return { kind: 'carried', text: `being carried off by the ${who}: whoever it is will put them down somewhere, in time`, passes: true };
  }
  if (c.status === 'ko') return { kind: 'down', text: c.body.bleeding() > 0.03 ? 'unconscious and bleeding: people wake when their wounds allow' : 'unconscious: people wake when their wounds allow', passes: true };
  if (c.cage) {
    const cage = S.W.objs.get(c.cage);
    const where = cage?.site ? siteName(cage.site) : siteName(S.T.nearestSite(c.x, c.z)?.id ?? 0);
    const left = c.mem.jailUntil ? Math.max(0, (c.mem.jailUntil - S.clock.t) / HOUR) : 0;
    const sentence = c.mem.jailUntil ? (left >= 24 ? `${Math.ceil(left / 24)} days of a sentence left` : `${Math.ceil(left)} hours of a sentence left`) : 'held with no sentence';
    return { kind: 'caged', text: `locked in a cage at ${where}, ${sentence}; the lock can be worked from inside`, order: { k: 'lockpick', obj: c.cage, id: c.id }, passes: !!c.mem.jailUntil };
  }
  if (c.shackled && c.mem.enslavedBy) {
    const where = c.mem.slaveSite ? ` at ${siteName(c.mem.slaveSite)}` : '';
    return { kind: 'slave', text: `a slave${where}: shackled, slow and watched; pick the shackles when nobody is looking, or walk away from the fields`, order: { k: 'free', id: c.id }, passes: false };
  }
  return { kind: 'free', text: 'free to act', passes: false };
}

let sneakT = 0;
/** Seconds of sneaking with nobody about (no one to see, nothing hostile near) before your people stand up and run again. */
export const SNEAK_QUIET = 45;
/** Marks your sneaking people as seen or hidden, so the view can show it; those with nobody about for a while stand up. */
export function tickStealth(dt: number) {
  sneakT -= dt;
  if (sneakT > 0) return;
  const step = 0.4 - sneakT;
  sneakT = 0.4;
  const stood: Char[] = [];
  for (const c of S.W.playerChars()) {
    if (c.move !== 'sneak' || c.status !== 'up') { if (c.mem.seenBy !== undefined) delete c.mem.seenBy; delete c.mem.quietT; continue; }
    let by = 0, about = false;
    S.W.hash.near(c.x, c.z, 120, (o, d2) => {
      if (o.faction === 'player' || !o.alive || !o.up) return;
      // anyone awake who could see them, a sleeper close enough to wake, anything hostile in a wider ring: they stay low
      if (o.animal ? hostile(o, c) : (o.awake && d2 < 80 * 80) || d2 < 30 * 30 || hostile(o, c)) about = true;
      if (!by && d2 < 48 * 48 && !o.animal && o.awake && canSee(o, c)) by = o.id;
    });
    c.mem.seenBy = by;
    c.mem.quietT = about ? 0 : (c.mem.quietT ?? 0) + step;
    if (c.mem.quietT >= SNEAK_QUIET) { standUp(c); stood.push(c); }
  }
  // (good news, not a warning: it does not end travel speed)
  if (stood.length) S.fx.notice(`${names(stood)} ${stood.length > 1 ? 'have' : 'has'} had nobody about for a while and stand${stood.length > 1 ? '' : 's'} up to run ({sneak} to sneak again).`, 'good');
}

/** Back on their feet at a run, from sneaking. */
function standUp(c: Char) {
  c.move = 'run';
  delete c.mem.quietT;
  delete c.mem.seenBy;
  c.dirty = true;
}
const names = (cs: Char[]) => (cs.length < 3 ? cs.map((c) => c.name).join(' and ') : `${cs.slice(0, -1).map((c) => c.name).join(', ')} and ${cs[cs.length - 1].name}`);
