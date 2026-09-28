// Crime and the law. Witnesses report crimes to their faction; guards come
// for anyone with a bounty. Bounties are per faction and per person.
import { Char } from './char';
import { S } from './ctx';
import { FACTION } from '../content/factions';
import { canSee } from './ai';

export type CrimeKind = 'theft' | 'assault' | 'murder' | 'trespass' | 'kidnap' | 'runaway' | 'freeing' | 'drugs' | 'heresy' | 'pickpocket';

const NAMES: Record<CrimeKind, string> = {
  theft: 'theft', assault: 'assault', murder: 'murder', trespass: 'trespassing', kidnap: 'kidnapping', runaway: 'escaping slavery',
  freeing: 'freeing slaves', drugs: 'carrying dreamleaf', heresy: 'heresy', pickpocket: 'pickpocketing',
};

/** Finds a witness of a faction (or its allies) who sees the culprit. */
export function witness(c: Char, faction: string, r = 26): Char | null {
  let w: Char | null = null;
  S.W.hash.near(c.x, c.z, r, (o) => {
    if (w || o === c || !o.awake || o.animal) return;
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
  if (w) S.fx.say(w, shout(kind));
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
    case 'freeing': return 'Slave thief!';
    default: return 'You there! Stop!';
  }
}

export function totalBounty(c: Char) {
  let t = 0;
  for (const v of Object.values(c.bounty)) t += v;
  return t;
}
