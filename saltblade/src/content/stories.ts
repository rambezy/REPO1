// Backstories for the people you can hire, pieced together from where they
// came from, what happened to them and what they want now.
import type { Char } from '../sim/char';
import { RNG } from '../core/rng';
import { RACE } from './races';

const ORIGIN: Record<string, string[]> = {
  human: [
    'grew up on a riceweed farm in the Vale, the fourth child of seven',
    'was born in the back room of a Crossroad bar and never knew a father',
    'came of age as a salt-cutter on the Barrens',
    'was raised by the Covenant in a Cinderhold orphanage',
    'spent a childhood scavenging Maker wrecks with an uncle who was always drunk',
    'is the last of a caravan family that used to cross the Bone Sea',
    'was a clerk for a minor Concord House until the House fell',
    'grew up in Mudwater, running leaf for the Scorched Hand',
    'was born a slave on Chainfield and ran at fifteen',
    'herded shellbacks on the edge of the Flats',
  ],
  karuk: [
    'was cast out of Hornspire for refusing a challenge',
    'lost a duel and chose exile over shame',
    'fought in eleven border wars and remembers every one',
    'was a Horn Guard until a dispute about a woman, or a horse, or both',
    'left the highlands to see if the rest of the world was as weak as the stories said',
  ],
  thrum: [
    'woke one morning and could no longer hear the Queen',
    'was sent out of the hive to learn the ways of the soft people',
    'survived when Blackcomb went silent, the only one of a hundred',
    'counts things. Everything. It is how the hive taught it to be useful',
  ],
  hollow: [
    'was switched on in a buried laboratory with no memory of its orders',
    'spent four hundred years standing guard over a door that never opened',
    'was a servant of the Makers and still sets the table for guests who are dust',
    'woke in a scrap heap outside Stonegate with half its memory gone',
  ],
};

const EVENT = [
  'Bandits took everything: the house, the animals, the family',
  'A drought came and did not leave',
  'The Covenant burned the village for hiding a Karuk',
  'A debt to the wrong people came due',
  'The Chainhouse came one night with shackles and a list of names',
  'A fever took the others one by one',
  'A lover left for Aurum and never wrote',
  'A Hookbeak came out of the dunes and nobody else walked away',
  'The mine collapsed with the whole shift inside',
  'A duel went further than it should have',
  'A card game in Harrowmarket ended in a knife fight',
  'The Delvers left them behind in a ruin to die',
  'Gambling, mostly. Also the drinking',
  'The machines in the Rustwastes woke up while they were digging',
];

const WANT = [
  'Now they want to earn enough to never be poor again.',
  'Now they just want to be somewhere that is not here.',
  'Now they want revenge, and do not much care how long it takes.',
  'Now they are looking for someone worth following.',
  'Now they want to see the Glasslands before they die.',
  'Now they will work for food and a bed, and they are good with their hands.',
  'Now they want to learn to fight, properly, so it never happens again.',
  'Now they are drinking, and waiting for something to happen.',
  'Now they want to find the ones who did it.',
  'Now they would like a quiet life, if such a thing exists.',
];

const CAGED = [
  'They were thrown in a cage for something they swear they did not do.',
  'They were caught stealing bread and will be sold before the week is out.',
  'They are waiting to be traded, and they know it.',
  'They say that anyone who opens this cage will have a friend for life.',
];

export function recruitStory(c: Char, rng: RNG): string {
  const race = RACE[c.look.race]?.race ?? 'human';
  const o = rng.pick(ORIGIN[race] ?? ORIGIN.human);
  const e = rng.pick(EVENT);
  const w = c.cage ? rng.pick(CAGED) : rng.pick(WANT);
  return `${c.name} ${o}. ${e}. ${w}`;
}
