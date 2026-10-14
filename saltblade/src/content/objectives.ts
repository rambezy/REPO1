// The first goals of each start: a short chain that walks a new player
// through the handful of things the waste expects them to know (reach a town,
// talk, trade, earn, bandage, recruit, fight). Each goal completes off what
// really happens in the game; nothing here is scripted or forced, and the
// tracker folds away when the chain is done (see ui/objectives.ts).
import type { Role } from '../sim/char';

/** What finishes a goal, checked against the live game. */
export type Trigger =
  | { k: 'reach'; site: string | string[] } // one of yours at a settlement or landmark (by key), or 'town' for any town
  | { k: 'talk'; role?: Role[] } // spoke with someone (of a role)
  | { k: 'deal' } // bought or sold anything at a shop
  | { k: 'sell' } | { k: 'buy'; item?: string } // sold anything; bought anything (or one thing in particular)
  | { k: 'sell_ore' } // sold ore out of your own packs
  | { k: 'mine' } // swung a pick at a rock
  | { k: 'bandage' } // treated a wound (a repair kit on a machine's frame counts)
  | { k: 'clot' } // nobody of yours is bleeding any more
  | { k: 'eat' }
  | { k: 'recruit' } // someone who was not there at the start
  | { k: 'win' } // knocked out or killed an enemy
  | { k: 'loot' } // went through a fallen stranger's pack
  | { k: 'build' } // finished building something
  | { k: 'farm' }
  | { k: 'unshackle' }
  | { k: 'sneak' }
  | { k: 'escape' } // got clear of the slavers (W.flags.escaped)
  | { k: 'salvage' } // stripped a downed machine
  | { k: 'repair' } // mended a prosthetic
  | { k: 'bounty' } // collected a bounty
  | { k: 'clear_bounty'; faction?: string } // no price on any of your heads (and, if named, that people's paid off)
  | { k: 'arena' } // fought a bout in the pit
  | { k: 'money'; n: number }
  | { k: 'road' }; // standing on a road

export interface Reward { money?: number; items?: [string, number][] }

export interface Objective {
  key: string;
  /** the goal, in a few words */
  text: string;
  /** a line of acknowledgement when it is done */
  done: string;
  when: Trigger;
  reward?: Reward;
}

export interface ObjectiveSet {
  title: string;
  goals: Objective[];
  /** said when the last goal is done: the game lets go of your hand */
  outro: string;
}

const REACH_TOWN = (key: string, name: string, done: string): Objective => ({ key: 'reach', text: `Reach ${name}`, done, when: { k: 'reach', site: key } });
const TALK_BARKEEP: Objective = { key: 'barkeep', text: 'Talk to a barkeep', done: 'Barkeeps hear everything. Recruits drink where they pour.', when: { k: 'talk', role: ['barkeep'] } };
const TALK_ANY: Objective = { key: 'talk', text: 'Talk to someone', done: 'People remember how you treat them. So do their factions.', when: { k: 'talk' } };
const DEAL: Objective = { key: 'deal', text: 'Buy or sell something', done: 'Prices follow the trader\'s mood and your standing with their people.', when: { k: 'deal' } };
const SELL: Objective = { key: 'sell', text: 'Sell the spoils', done: 'Chits in hand. Every town pays better for what it lacks.', when: { k: 'sell' } };
const MINE: Objective = { key: 'mine', text: 'Mine some ore (right-click a rock)', done: 'Slow, honest and heavy. Strength and labouring grow with it.', when: { k: 'mine' } };
const SELL_ORE: Objective = { key: 'sell_ore', text: 'Sell the ore', done: 'The rock does not fight back. Smiths always want more.', when: { k: 'sell_ore' } };
const BANDAGE: Objective = { key: 'bandage', text: 'Bandage a wound (First aid)', done: 'Bound wounds stop bleeding and heal faster. Keep the pack stocked.', when: { k: 'bandage' } };
const RECRUIT: Objective = { key: 'recruit', text: 'Recruit someone', done: 'Two is a band. Some join for free; some want paying.', when: { k: 'recruit' } };
const WIN: Objective = { key: 'win', text: 'Win a fight', done: 'Skill comes from blows given and taken. Losing teaches too.', when: { k: 'win' } };
const LOOT: Objective = { key: 'loot', text: 'Loot the fallen', done: 'Whatever they carried is yours now. Weapons sell; so do boots.', when: { k: 'loot' } };
const EAT: Objective = { key: 'eat', text: 'Eat something', done: 'Hungry people fight badly and faint. Food comes from towns, fields and the fallen.', when: { k: 'eat' } };

export const OBJECTIVES: Record<string, ObjectiveSet> = {
  wanderer: {
    title: 'First steps',
    goals: [
      REACH_TOWN('crossroad', 'Crossroad', 'A wall, a well and everyone passing through. Shops are inside; the bar is where the work is.'),
      TALK_BARKEEP,
      DEAL,
      MINE,
      SELL_ORE,
      { ...BANDAGE, reward: { items: [['bandages', 2]] }, done: 'Bound wounds stop bleeding and heal faster. Two spare rolls turn up.' },
      RECRUIT,
      WIN,
    ],
    outro: 'That is the whole trade: walk, earn, bleed, heal, bring people along. The rest of the waste is yours to find. You are on your own now.',
  },
  freeholders: {
    title: 'The claim',
    goals: [
      { key: 'farm', text: 'Farm the wheat field (right-click it)', done: 'Wheat becomes dustbread at a stove. A field fed is a band fed.', when: { k: 'farm' } },
      { key: 'build', text: 'Build something ({build})', done: 'Materials come from your stores. Walls and gates keep the taxman honest.', when: { k: 'build' }, reward: { items: [['building_mats', 10]] } },
      EAT,
      REACH_TOWN('aurum', 'Aurum', 'The Concord\'s city. Real weapons, real armour, real prices.'),
      DEAL,
      BANDAGE,
      { ...RECRUIT, text: 'Recruit a fifth hand' },
      WIN,
    ],
    outro: 'The claim stands and the four of you know how to hold it. Whatever comes up the Vale road now is your problem to solve. You are on your own now.',
  },
  blades: {
    title: 'Unpaid work',
    goals: [
      REACH_TOWN('harrowmarket', 'Harrowmarket', 'Weapons, armour and people who hire blades.'),
      { key: 'guard', text: 'Ask a town guard about bounties', done: 'Guards post prices on heads. Bring the head, or the whole bandit, back alive.', when: { k: 'talk', role: ['guard'] } },
      WIN,
      LOOT,
      SELL,
      { ...BANDAGE, text: 'Use a first aid kit' },
      { ...RECRUIT, text: 'Recruit a fourth blade' },
      { key: 'bounty', text: 'Collect a bounty', done: 'Paid at last. Nobody owes you anything now.', when: { k: 'bounty' } },
    ],
    outro: 'Three blades, paid and fed, with no master to bury. Work is wherever someone is afraid. You are on your own now.',
  },
  karuk: {
    title: 'Honour',
    goals: [
      REACH_TOWN('hornspire', 'Hornspire', 'Home, for now. The pit is where honour is kept.'),
      TALK_ANY,
      { key: 'arena', text: 'Fight a bout in the pit', done: 'The crowd has seen you now. Win and the pit master pays.', when: { k: 'arena' } },
      WIN,
      SELL,
      BANDAGE,
      { ...RECRUIT, text: 'Bring a fourth into the band' },
    ],
    outro: 'Honour enough to go home with, or to keep walking. The Covenant\'s pyres are east; everything else is yours. You are on your own now.',
  },
  constructs: {
    title: 'Wound up',
    goals: [
      REACH_TOWN('rustward', 'Rustward', 'The machines\' enclave. Repair kits, solder, and nobody who stares.'),
      TALK_ANY,
      WIN,
      LOOT,
      SELL,
      { key: 'buy', text: 'Buy a repair kit', done: 'A kit mends a frame the way bandages mend flesh. Never walk without one.', when: { k: 'buy', item: 'repair_kit' } },
      { ...BANDAGE, key: 'mend', text: 'Mend a dent with a repair kit (First aid)', done: 'Metal never bleeds, but it does wear out. Keep a kit in every pack.' },
    ],
    outro: 'Two machines with no makers and no orders. Whatever you were for, you decide now. You are on your own now.',
  },
  scrappers: {
    title: 'Scrap and sinew',
    goals: [
      REACH_TOWN('rustward', 'Rustward', 'Rustward buys servos and cells, and sells the kits that keep your limbs on.'),
      WIN,
      { key: 'salvage', text: 'Salvage a downed machine (right-click it)', done: 'Servos, cells and optics. The Delvers pay best for optics.', when: { k: 'salvage' } },
      SELL,
      { key: 'repair', text: 'Mend a wrecked limb with a repair kit', done: 'Scrap iron takes blows like flesh and never bleeds; a kit puts it right.', when: { k: 'repair' } },
      BANDAGE,
      { ...RECRUIT, text: 'Recruit a third pair of hands' },
    ],
    outro: 'The foundries are full of parts and the parts are full of chits. Mind the machines that still patrol them. You are on your own now.',
  },
  deserters: {
    title: 'Posters',
    goals: [
      { key: 'reach', text: 'Reach a free town: Crossroad or Hardcoin', done: 'Nobody here reads Concord posters. Keep it that way.', when: { k: 'reach', site: ['crossroad', 'hardcoin'] } },
      WIN,
      LOOT,
      SELL,
      BANDAGE,
      RECRUIT,
      { key: 'clear', text: 'Clear your names: pay off the Concord bounty', done: 'Paid in full. The posters come down; the Concord forgets slowly.', when: { k: 'clear_bounty', faction: 'concord' } },
    ],
    outro: 'Two sabres and clean names, or near enough. The Concord\'s roads are open again, and so is everything else. You are on your own now.',
  },
  chainbound: {
    title: 'Runaway',
    goals: [
      { key: 'shackles', text: 'Pick your shackles (right-click yourself)', done: 'Quietly done. Shackled people crawl; you can run now.', when: { k: 'unshackle' } },
      { key: 'sneak', text: 'Sneak ({sneak})', done: 'Low and slow. Sight is short at night; the dogs still smell you. Once clear, {sneak} again to run.', when: { k: 'sneak' } },
      { key: 'escape', text: 'Get 300 m clear of Chainfield', done: 'Out. The Chainhouse hunts runaways, so keep moving west.', when: { k: 'escape' } },
      { key: 'brokenchain', text: 'Find Brokenchain, in the reeds to the west', done: 'The Unchained ask no questions of a runaway.', when: { k: 'reach', site: 'brokenchain' } },
      TALK_ANY,
      EAT,
      { key: 'money', text: 'Earn 50 chits', done: 'Mine a rock, loot a bandit, sell what you find. A purse is a start.', when: { k: 'money', n: 50 } },
    ],
    outro: 'Free, fed and among friends, with chits of your own. The blade and the name are yours to earn. You are on your own now.',
  },
  nothing: {
    title: 'Get up',
    goals: [
      { key: 'clot', text: 'Stop the bleeding', done: 'The blood stops. You are still alive.', when: { k: 'clot' } },
      { key: 'road', text: 'Find a road', done: 'Roads lead to towns and to the people who walk them. Not all of them friendly.', when: { k: 'road' } },
      { key: 'sneak', text: 'Sneak past something hungry ({sneak})', done: 'What cannot see you cannot eat you. {sneak} again to run.', when: { k: 'sneak' } },
      { ...EAT, text: 'Find food' },
      { key: 'town', text: 'Reach a town', done: 'Walls. Beds. People who will sell you a hand, in time.', when: { k: 'reach', site: 'town' } },
      { key: 'money', text: 'Earn 100 chits', done: 'The first hundred is the hardest. Sell what you find; mine what you can.', when: { k: 'money', n: 100 } },
      RECRUIT,
    ],
    outro: 'Up, and still breathing, with a friend and a few chits. The Reavers who left you in the ash are still out there. You are on your own now.',
  },
  fight: {
    title: 'Proving ground',
    goals: [
      WIN,
      LOOT,
      { ...BANDAGE, text: 'Use a first aid kit' },
      REACH_TOWN('crossroad', 'Crossroad', 'Crossroad buys what the Reavers carried.'),
      SELL,
    ],
    outro: 'Proven. You are on your own now.',
  },
};
