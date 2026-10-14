// Work and causes: what the boards of the lawful towns post, the stories a
// few of the powers of the waste will draw you into, and what happens when
// the foundries wake. Words and numbers only; the rules are in sim/contracts,
// sim/stories and sim/crisis.
import { ITEM, register, type ItemDef } from './items';

// ---------------------------------------------------------------- tiers
/** Better work for those a faction knows better: the standing each tier of work needs. */
export const TIERS = [
  { min: -15, name: 'Odd jobs' },
  { min: 15, name: 'Trusted work' },
  { min: 35, name: 'Valued work' },
  { min: 60, name: 'Sworn work' },
];

/** How much a board's tiers turn up, best first (tier I always has a place). */
export const TIER_ODDS = [0.4, 0.3, 0.19, 0.11];
/** Standing a finished job earns with whoever posted it, and what failing or walking away costs, by tier. */
export const TIER_STANDING = [2, 3, 5, 8];
export const TIER_PENALTY = [3, 5, 8, 12];
/** The odds a job pays an item as well as chits, by tier, and the grade it comes in. */
export const TIER_ITEM = [0.12, 0.25, 0.4, 0.6];
export const TIER_GRADE = [2, 3, 4, 5];
/** What the target of a hunt or a camp should add up to, by tier (in strength, as squads weigh each other). */
export const TIER_THREAT: [number, number][] = [[15, 70], [60, 250], [200, 700], [600, 1800]];
/** The most a haul asks one band to carry, by tier (kg). */
export const TIER_LOAD = [25, 45, 70, 100];
/** How far a job sends you from the board, by tier (metres). */
export const TIER_REACH: [number, number][] = [[500, 2600], [900, 3800], [1500, 5200], [2200, 7500]];
/** How many jobs a band can carry at once. */
export const MAX_ACTIVE = 4;

/**
 * What a haul pays over what a counter short of the goods would give for
 * them: a little, as a plain haul from where they are cheap makes 10-35%
 * (see tools/economytest). The standing it earns is the rest of the sweetener.
 */
export const HAUL_OVER = 1.05;
/** What a walk pays (a delivery, an escort): chits for setting out, and chits a kilometre. */
export const WALK_PAY: Record<'deliver' | 'escort', [number, number]> = { deliver: [75, 60], escort: [100, 90] };
/** ...more for better work, by tier... */
export const TIER_PAY = [1, 1.3, 1.7, 2.2];
/** ...and by the worst country on the way (a region's danger, 1 to 5): a safe walk pays modestly, a dangerous one well. */
export const ROAD_PAY = [0.6, 0.6, 0.8, 1, 1.25, 1.5];

/** What each people tends to post, by weight. */
export const KINDS: Record<string, [string, number][]> = {
  default: [['haul', 3], ['deliver', 3], ['escort', 2], ['hunt', 3], ['camp', 3]],
  concord: [['haul', 3], ['deliver', 4], ['escort', 3], ['hunt', 2], ['camp', 2]],
  ember: [['haul', 2], ['deliver', 3], ['escort', 3], ['hunt', 2], ['camp', 3]],
  karuk: [['haul', 1], ['deliver', 1], ['escort', 1], ['hunt', 5], ['camp', 3]],
  thrum: [['haul', 4], ['deliver', 2], ['escort', 1], ['hunt', 3], ['camp', 2]],
  hollows: [['haul', 3], ['deliver', 2], ['escort', 3], ['hunt', 3], ['camp', 3]],
  delvers: [['haul', 3], ['deliver', 2], ['escort', 4], ['hunt', 2], ['camp', 2]],
  scorched: [['haul', 2], ['deliver', 5], ['escort', 1], ['hunt', 2], ['camp', 1]],
  unchained: [['haul', 3], ['deliver', 2], ['escort', 4], ['hunt', 3], ['camp', 1]],
  chainhouse: [['haul', 2], ['deliver', 2], ['escort', 2], ['hunt', 4], ['camp', 1]],
  ironcoin: [['haul', 2], ['deliver', 1], ['escort', 3], ['hunt', 3], ['camp', 4]],
};
/** What the board calls each kind of job. */
export const KIND_NAME: Record<string, string> = { haul: 'Haul', deliver: 'Delivery', escort: 'Escort', hunt: 'Hunt', camp: 'Camp' };

// ---------------------------------------------------------------- the danger rating
export const DANGER = [
  { word: 'Low', line: 'Your people should walk through it.' },
  { word: 'Fair', line: 'You should win it if you keep your heads.' },
  { word: 'Even', line: 'It could go either way.' },
  { word: 'Hard', line: 'Expect to bleed. More people would help.' },
  { word: 'Deadly', line: 'Bands like yours die doing this.' },
  { word: 'Certain death', line: 'Not with what you have now. Not a chance.' },
];
/** Threat over your band's strength at which each rating starts. */
export const DANGER_AT = [0, 0.35, 0.7, 1.6, 2.6, 4];

// ---------------------------------------------------------------- items
/** Registers an item made for this work, unless something already has its id. */
function item(d: ItemDef) {
  if (ITEM[d.id]) return;
  register(d);
  ITEM[d.id] = d; // the item table is built once; work items join it here
}
item({ id: 'sealed_parcel', name: 'Sealed Parcel', cat: 'misc', w: 2, h: 1, weight: 1.5, value: 40, stack: 1, icon: 'book', desc: 'Wrapped in waxed cloth and tied with a cord that has a seal on every knot. It is not yours to open, and whoever it is for will know if you did.' });
item({ id: 'leaf_parcel', name: 'Sealed Parcel', cat: 'misc', w: 2, h: 1, weight: 1.5, value: 40, stack: 1, icon: 'book', illegal: ['ember'], desc: 'Wrapped in waxed cloth and sealed on every knot. It smells, faintly, of dreamleaf. A Covenant search would open it, and then burn it.' });
item({ id: 'watch_letter', name: 'Watch Letter', cat: 'misc', w: 1, h: 1, weight: 0.1, value: 1, stack: 1, icon: 'book', desc: 'A letter from the Captain of the Crossroad Watch, folded small and sealed with the Watch\'s iron ring. It asks the free towns for something they have never given anyone.' });
item({
  id: 'pyre_tongue', name: 'The Pyre\'s Tongue', cat: 'weapon', w: 1, h: 4, weight: 3.4, value: 7600, stack: 1, graded: true, icon: 'weapon',
  desc: 'A Covenant blade quenched in the Great Pyre itself, its temper line still faintly red. The Inquisitors give one to each Flamebearer, and take it back from the body.',
  weapon: { kind: 'katana', skill: 'katanas', cut: 41, blunt: 5, reach: 1.32, speed: 1.12, weight: 3.4, bleed: 1.3, pierce: 0.05, vsAnimal: 1, vsRobot: 0.95, vsHuman: 1, def: 3, twoHanded: false },
  wvis: { kind: 'katana', length: 0.98, blade: 0xe8a07a, handle: 0xc8a040 },
});
item({ id: 'foundry_heart', name: 'Foundry Heart', cat: 'artifact', w: 2, h: 2, weight: 5, value: 22000, stack: 1, research: 3, icon: 'core', desc: 'The core of the Foundry Mind, still warm. It hums when held, and the hum is a count. The Delvers would sell their mothers for it. The Hollows would ask you, very politely, to bury it.' });

// ---------------------------------------------------------------- who keeps the board
/** What the keeper of a town's board is called on it, by the counter they keep. */
export const KEEPER = { bar: 'barkeep', other: 'trader' };

// ---------------------------------------------------------------- job texts
// {who} {n} {good} {to} {pay} {bond} {due} {target} {species} {count} {band} {camp} {road} {where}
type Lines = Record<string, string[]>;

export const HAUL: Lines = {
  default: ['We\'re short of {good}. Bring me {n} by day {due} and I\'ll pay {pay} chits for the lot. Better than any counter in town.', '{n} {good}, here, by day {due}. {pay} chits, and people remember who kept the shelves full.'],
  concord: ['The House requires {n} {good} at this counter by day {due}. The contract pays {pay} chits. The House does not extend contracts.'],
  ember: ['The Pyre\'s kitchens need {n} {good} by day {due}. The flame pays {pay} chits, and remembers the hand that fed it.'],
  karuk: ['{n} {good}. Here. Before day {due}. {pay} chits. Do not make me count them twice.'],
  thrum: ['*hum* Hive-needs {n} {good}. Bring-by-day-{due}. Hive-gives {pay} chits. Fair-trade.'],
  hollows: ['REQUISITION: {n} {good}, DELIVERED HERE BY DAY {due}. PAYMENT: {pay} CHITS. THANK YOU FOR YOUR COOPERATION.'],
  scorched: ['The Hand wants {n} {good} by day {due}. {pay} chits. Don\'t ask what for.'],
  delvers: ['The expedition\'s out of {good}. {n} of them by day {due}, and {pay} chits are yours.'],
  unchained: ['We\'re short of {good}, and short of everything else. {n} of them by day {due}. We scraped together {pay} chits.'],
};

export const DELIVER: Lines = {
  default: ['This goes to {who} in {to}. Sealed, and it stays sealed. Leave {bond} chits with me as a bond; {who} pays it back, with {pay} on top for your trouble.', 'A parcel for {who}, in {to}, by day {due}. The bond is {bond} chits. Hand it over unopened and {who} pays you {pay} and gives the bond back.'],
  concord: ['A contract for {who} in {to}, under seal. The bond is {bond} chits, returned on delivery with the fee of {pay}. Break the seal and the House will know.'],
  ember: ['A letter of the Covenant for {who} in {to}. The bond is {bond} chits, the fee {pay}. The flame does not forgive a broken seal.'],
  scorched: ['Little package for {who} in {to}. You leave {bond} with me, {who} gives it back with {pay} on top. Don\'t open it.'],
  hollows: ['SEALED MEMORY FOR {who}, {to}. BOND: {bond} CHITS. FEE: {pay} CHITS. DO NOT EXPOSE TO RAIN.'],
};
/** Said of a parcel the Covenant would burn. */
export const CONTRABAND = ' Keep it away from Covenant patrols. They search every pack, and they would burn this one and want to know who gave it to you.';

export const ESCORT: Lines = {
  default: ['{who} has to reach {to}, and the road won\'t let them go alone. They walk when you walk with them: stay close and keep them breathing. {pay} chits when they\'re through the gate.'],
  ember: ['{who} and the faithful walk to {to}. Walk with them. If they reach the flame, the flame pays {pay} chits. If they do not, you will answer for it.'],
  delvers: ['{who} has to get to {to} with their notes and their skin. {pay} chits if both arrive.'],
  hollows: ['ARCHIVIST {who} MUST REACH {to}. ESCORT REQUIRED. THE ARCHIVIST WILL NOT WALK UNACCOMPANIED. PAYMENT ON ARRIVAL: {pay} CHITS.'],
  unchained: ['{who} ran from the Chainhouse fields. Get them to {to} before the catchers do. {pay} chits is all we have.'],
  karuk: ['{who} goes to {to}. Walk with them. If they die, do not come back to tell me. {pay} chits.'],
  concord: ['{who}, a factor of the House, travels to {to}. The House pays {pay} chits for {who} to arrive, and nothing for a body.'],
};

export const HUNT_BEAST: Lines = {
  default: ['{target}, a {species} the size of a cart, has been taking travellers {road}. Kill it. {pay} chits when it\'s done.', 'There\'s a {species} {road} the herders call {target}. It\'s had three caravans this month. {pay} chits for its head.'],
  karuk: ['A {species} the herders call {target} is killing {road}. A good hunt. Bring back the honour, and I will give you {pay} chits.'],
  thrum: ['*click* {target}. {Species}. Eats-workers {road}. Hive-pays {pay} chits for quiet-road.'],
  hollows: ['HOSTILE UNIT DESIGNATED {target} ({species}) IS ACTIVE {road}. TERMINATE. PAYMENT: {pay} CHITS.'],
};
export const HUNT_BAND: Lines = {
  default: ['{target} and {count} {band} are robbing travellers {road}. Bring {who} in, dead or breathing: {pay} chits, and half again if they can still talk.'],
  concord: ['The House has posted a price on {target}, who robs its caravans {road} with {count} {band}. {pay} chits; half again if the magistrate can hang {who} alive.'],
  ember: ['{target} carries sin {road} with {count} {band}. The flame wants it stopped. {pay} chits, and half again if they kneel at the Pyre alive.'],
  karuk: ['{target} and {count} {band} hide {road} and call it a fight. Show them one. {pay} chits.'],
  chainhouse: ['{target} has {count} {band} along {road}, and every one of them is our property. {pay} chits for {who}, half again breathing.'],
  unchained: ['{target} and {count} {band} hunt runaways {road}. Stop them. {pay} chits, and the thanks of everyone they would have taken.'],
};
export const CAMP: Lines = {
  default: ['{camp} sits {where}: {count}. Clear it. All of them. {pay} chits when it\'s quiet.'],
  concord: ['The House will pay {pay} chits to see {camp}, {where}, emptied: {count}. The magistrate is not particular about how.'],
  ember: ['{camp}, {where}, is a nest of the unclean: {count}. Burn it out. {pay} chits, and the flame\'s favour.'],
  karuk: ['{camp}. {where}. {count}. Go there. Kill everything. {pay} chits. Hah.'],
  hollows: ['THE SITE DESIGNATED {camp}, {where}, HOLDS {count}. TERMINATE ALL OF THEM. PAYMENT: {pay} CHITS.'],
};

export const TAKEN = ['Good. Don\'t make me regret it.', 'It\'s yours. Bring proof, or bring nothing.', 'Then go. The day isn\'t getting longer.', 'Done. Don\'t be the one I have to post a job about.'];
export const PAID = ['That\'s the job. Here\'s your money.', 'Done is done. Count it if you like.', 'Good work. There\'ll be more.', 'Hm. Better than I expected. Here.'];
export const NO_WORK = ['Not for you. Not until the {faction} trusts you a little more.', 'I don\'t give work to people the {faction} would sooner see hanged.'];
export const NO_BEASTS = 'The Covenant does not hire beasts. Send someone with a human face.';
export const LOCKED = 'That one is for people the {faction} knows. Come back when your standing with them is {need}.';

/** What the people who receive parcels and walk the roads say. */
export const RECIPIENT = {
  greet: ['{who}. Yes. Who\'s asking?', 'You\'re looking for me? Then you\'ve found me.', 'If it\'s about money, I\'m out. If it\'s about a parcel, I\'m in.'],
  thanks: ['The seal\'s whole. Good. Here\'s your bond, and what you\'re owed.', 'About time. Here: the bond, and your fee.', 'Unopened. You\'re rarer than you look. Here.'],
};
export const TRAVELLER = {
  wait: ['We go when you go. Stay near us and we keep walking. Wander off and we wait where we stand.', 'Lead on. We\'re not walking that road by ourselves.'],
  arrive: ['{to}. We made it. Here, as promised.', 'Walls. Real walls. Thank you. Here\'s your money.', 'I didn\'t think we would. Here. You\'ve earned it.'],
};

// ---------------------------------------------------------------- names
/** Names the herders give the worst of each kind of beast. */
export const BEAST_NAMES: Record<string, string[]> = {
  dunehound: ['Old Gristle', 'Rag-Ear', 'Sandtooth', 'Halfmoon', 'Mother Gnash'],
  skitter: ['the Clicker', 'Ninelegs', 'Old Chitter'],
  brineclaw: ['Saltpincer', 'Old Rust-Shell', 'the Crab King'],
  sandclaw: ['the Dune Widow', 'Glasseye'],
  hookbeak: ['the Butcher Bird', 'Hookmaw', 'Old Gutter'],
  mauler: ['Mudmother', 'Bonebreaker'],
  glassstalker: ['the Green Ghost', 'Shardback'],
  ashjackal: ['Laughing Tom', 'Cinder'],
  rustspider: ['the Spinner', 'Copperleg'],
  sawdrone: ['the Gardener', 'Pruner Nine'],
  warbot: ['the Last Sergeant', 'Old Ironsides'],
  scrapcrawler: ['the Tinker', 'Gutpipe'],
  bloodfly: ['the Red Cloud'],
  carrionbat: ['the Black Rag'],
  default: ['Old Scar'],
};
/** What the road calls the leaders of bands, by their people. */
export const EPITHETS: Record<string, string[]> = {
  reavers: ['the Toll-Taker', 'Knife-Hand', 'Road Captain', 'the Dust King'],
  starvelings: ['Hunger Chief', 'the Gaunt', 'Crust-Eater'],
  scorched: ['the Leaf Runner', 'Smoke-Hand', 'the Sallow'],
  mawkin: ['the Gnawer', 'Bone Mother', 'Cookfire'],
  unchained: ['the Runaway', 'Chainbreaker'],
  chainhouse: ['Chainmaster', 'the Collector'],
  machines: ['Overseer'],
  blackcomb: ['the Black Prince'],
  mistcrawlers: ['the Pale Prince'],
  default: ['the Outlaw'],
};
/** What band a faction's leader leads, as the board says it. */
export const BAND_NAME: Record<string, string> = {
  reavers: 'Dust Reavers', starvelings: 'Starvelings', scorched: 'Scorched Hand runners', mawkin: 'Mawkin hunters', unchained: 'runaways',
  chainhouse: 'Chainhouse catchers', machines: 'Sentinels', blackcomb: 'Blackcomb drones', mistcrawlers: 'Mistcrawlers',
};
/** Which worldsim squad a band of each people comes as. */
export const BAND_SPEC: Record<string, string> = {
  reavers: 'reavers', starvelings: 'starvelings', scorched: 'scorched', mawkin: 'mawkin', unchained: 'unchained', chainhouse: 'slavers',
  machines: 'sentinels', blackcomb: 'blackcomb', mistcrawlers: 'mist',
};
/** Trades of the people parcels go to. */
export const TRADES = ['Ropemaker', 'Cooper', 'Factor', 'Tanner', 'Water-Seller', 'Scribe', 'Midwife', 'Chandler', 'Saltboiler', 'Smith\'s Widow', 'Moneylender', 'Herbalist'];

/** Who walks the roads under escort, by the people who post the job: worldsim squad, what they are called, how many. */
export const TRAVELLERS: Record<string, { spec: string; role: string; title: string; n: [number, number] }> = {
  ember: { spec: 'pilgrims', role: 'resident', title: 'Pilgrim', n: [2, 3] },
  hollows: { spec: 'wanderer', role: 'resident', title: 'Archivist', n: [1, 1] },
  delvers: { spec: 'wanderer', role: 'resident', title: 'Delver', n: [1, 2] },
  unchained: { spec: 'wanderer', role: 'resident', title: 'Runaway', n: [2, 3] },
  thrum: { spec: 'wanderer', role: 'resident', title: 'Hive Envoy', n: [1, 2] },
  karuk: { spec: 'wanderer', role: 'resident', title: 'Horn Pilgrim', n: [1, 2] },
  concord: { spec: 'wanderer', role: 'resident', title: 'Factor', n: [1, 2] },
  default: { spec: 'wanderer', role: 'resident', title: 'Trader', n: [1, 2] },
};

// ---------------------------------------------------------------- rewards
/** Things a faction pays with besides chits: [item, how many]. Weapons and armour come at the job's grade. */
export const REWARD_ITEMS: Record<string, [string, number][]> = {
  drifters: [['watch_xbow', 1], ['dust_coat', 1], ['travel_pack', 1], ['first_aid', 3], ['bolts', 40]],
  concord: [['concord_sabre', 1], ['iron_kasa', 1], ['blade_helm', 1], ['dustwine', 3], ['silk', 2]],
  chainhouse: [['taskmaster_sabre', 1], ['hunter_gambeson', 1], ['first_aid', 2]],
  ember: [['ember_edge', 1], ['vigil_blade', 1], ['white_hood', 1], ['pyre_incense', 6], ['first_aid', 3]],
  karuk: [['horn_sabre', 1], ['crescent', 1], ['horn_helm', 1], ['mesa_moss', 6], ['red_beer', 4]],
  thrum: [['hive_pack', 1], ['chitin_scale', 1], ['resin_salve', 6], ['stinger_spear', 1]],
  delvers: [['delver_pack', 1], ['pry_bar', 1], ['gasmask', 1], ['salvage_axe', 1], ['surgical_kit', 2]],
  unchained: [['lockpick_set', 1], ['thief_pack', 1], ['first_aid', 3]],
  hollows: [['repair_kit', 3], ['solder_tin', 4], ['energy_cell', 20], ['standard_arm', 1]],
  scorched: [['smuggler_pack', 1], ['leafcutter', 1], ['dreamsmoke', 3]],
  ironcoin: [['bolt_thrower', 1], ['chain_shirt', 1], ['first_aid', 4]],
};

// ---------------------------------------------------------------- camps
/**
 * What lives in each kind of camp, to rate one nobody of yours has scouted
 * (populate.ts makes them: these are its numbers). Once it is populated the
 * board counts who is really there.
 */
export const CAMP_FOLK: Record<string, { faction: string; role: string; n: [number, number]; perDanger?: number; level?: [number, number]; beasts?: [string, number][]; name: string }> = {
  camp_reavers: { faction: 'reavers', role: 'bandit', n: [4, 7], perDanger: 1, name: 'Dust Reavers' },
  camp_starvelings: { faction: 'starvelings', role: 'bandit', n: [5, 10], name: 'Starvelings' },
  camp_scorched: { faction: 'scorched', role: 'bandit', n: [4, 8], name: 'Scorched Hand' },
  camp_mawkin: { faction: 'mawkin', role: 'bandit', n: [5, 9], name: 'Mawkin' },
  mist_camp: { faction: 'mistcrawlers', role: 'bandit', n: [5, 10], level: [22, 40], name: 'Mistcrawlers' },
  blackcomb_nest: { faction: 'blackcomb', role: 'bandit', n: [4, 8], level: [20, 34], name: 'Blackcomb drones' },
  warden_post: { faction: 'wardens', role: 'construct', n: [2, 4], level: [36, 52], name: 'Warden Constructs' },
  foundry: { faction: 'machines', role: 'construct', n: [2, 4], level: [22, 36], beasts: [['sawdrone', 2.5], ['warbot', 0.35]], name: 'Sentinels and drones' },
};

// ---------------------------------------------------------------- stories
export type StepKind = 'talk' | 'camp' | 'deliver' | 'defend' | 'hunt' | 'haul' | 'reach' | 'escort' | 'free' | 'duel';

export interface StoryStep {
  kind: StepKind;
  /** the journal's name for the step, and what it asks of you */
  title: string;
  text: string;
  /** what the giver says when it is given (a talk step: the whole conversation) */
  say: string;
  /** what the journal records when it is done */
  done: string;
  /** a site: a settlement or landmark key, or 'foundry' for the foundry nearest the giver */
  at?: string;
  /** where an escort sets out from, if not the giver's town */
  from?: string;
  /** goods to bring; or (a free step) how many to set free */
  good?: string;
  n?: number;
  /** who: a recipient, a traveller, a quarry, or the one to beat */
  who?: string;
  whoTitle?: string;
  faction?: string;
  size?: number;
  level?: number;
  /** a beast to hunt (else a band of the faction's), and how much bigger than the worst of its kind */
  species?: string;
  great?: number;
  /** an escort of those a free step set loose, rather than travellers who wait for you */
  party?: 'freed';
  /** what the one to beat in a duel fights with */
  loadout?: string;
  race?: string;
  /** the road a hunt is on: between two settlements */
  road?: [string, string];
  /** what finishing the step pays */
  pay?: number;
  standing?: [string, number][];
}

/** What opens a story, any one of: jobs done for a people, standing with them, or something done (a game's flags: escaped, freed, pitWins...) at least so often. */
export interface Opens { done?: [string, number][]; standing?: [string, number][]; flags?: [string, number][] }

export interface StoryDef {
  key: string;
  name: string;
  faction: string;
  /** the settlement where the giver stands */
  town: string;
  giver: { name: string; title: string; race: string; female: boolean; loadout: string; level: number; heir: string; known: string };
  /** a line for the journal while it is waiting for you */
  blurb: string;
  /** when the giver will talk to you, in words, and in rules */
  needs: string;
  opens: Opens;
  /** what else you can ask the giver (a choice and its answer; `if`: only if a flag of the game is set) */
  ask?: { t: string; say: string; if?: string }[];
  /** turning them down: what you say, what they say, how they greet you after, and the standing it costs */
  refuse?: { t: string; say: string; back: string; cost: number };
  /** the townsfolk and the road talk of it, while it waits for you (a conversation, by people of these peoples) */
  gossip?: { factions: string[]; lines: string[][] };
  /** the word that comes to you when they will */
  call: string;
  /** the giver's word to someone not yet trusted */
  notYet: string;
  steps: StoryStep[];
  /** the capstone: what changes, said plainly for the journal */
  capstone: string;
  /** the deed it earns (sim/deeds) */
  deed: string;
}

export const STORIES: StoryDef[] = [
  {
    key: 'freeroad', name: 'The Free Road', faction: 'drifters', town: 'crossroad', deed: 'free_road',
    giver: { name: 'Hesk', title: 'Captain of the Watch', race: 'karuk', female: true, loadout: 'drifters_guard', level: 36, heir: 'Dace', known: 'Captain Hesk of the Crossroad Watch' },
    blurb: 'The Dust Reavers toll every road out of Crossroad. The Watch can hold its walls, but not the roads.',
    needs: 'Do a job for one of the free towns, or be well liked by the Drifters (standing 20).',
    opens: { done: [['drifters', 1]], standing: [['drifters', 20]] },
    call: 'Word reaches you from Crossroad: Captain Hesk of the Watch is asking after you.',
    notYet: 'I know your face. I don\'t know your work. Take a job off the board, and then we\'ll talk.',
    ask: [
      { t: 'Why don\'t the free towns hold the roads themselves?', say: 'Because every one of them thinks the road outside its own gate is somebody else\'s problem. Squatter\'s Rest thinks it is too small to matter. Dustwell thinks it is too poor to be worth robbing. They are both wrong.' },
    ],
    refuse: { t: 'The roads aren\'t my problem.', say: 'No. Not until they are. The Watch keeps a list of the ones who said that; most of them are on it twice, once alive.', back: 'Changed your mind about the roads? They haven\'t changed theirs about you.', cost: 2 },
    gossip: { factions: ['drifters'], lines: [
      ['Captain Hesk had the Watch out on the east road again.', 'Against the Den?', 'Against the Den. She lost two.', 'She\'s looking for someone who won\'t get lost.'],
      ['They say Hesk is asking after anyone who\'s worked the boards.', 'Hesk asks after everyone.', 'Not like this.'],
    ] },
    capstone: 'The free towns stand together. A house in Crossroad is yours, a Watch sergeant walks with you, and the Reavers stop marching on the free towns.',
    steps: [
      {
        kind: 'talk', title: 'The Captain\'s offer', text: 'Talk to Captain Hesk of the Watch at Crossroad.',
        say: 'Every road out of this town pays the Reavers a toll. The Watch holds the walls. Nobody holds the roads. I want them held, and I want the Reavers to learn what that costs. It starts with the Den on the east road. It ends with the free towns standing together, for once. Are you in?',
        done: 'Captain Hesk of the Crossroad Watch asked you to break the Reavers\' hold on the free roads.',
      },
      {
        kind: 'camp', at: 'reaverden', title: 'The Den on the east road', text: 'Clear the Reaver Den, east of Crossroad. Every Reaver in it down.',
        say: 'The Den sits on the road east and takes a cut of everything that passes. Empty it.',
        done: 'The Reaver Den is empty.', pay: 800, standing: [['drifters', 5]],
      },
      {
        kind: 'deliver', at: 'squatters', who: 'Ilse', whoTitle: 'Headwoman', title: 'Word to the free towns', text: 'Carry the Captain\'s letter to Headwoman Ilse at Squatter\'s Rest.',
        say: 'Good. Now the hard part: the free towns have never once stood together. This letter asks them to. Take it to Ilse at Squatter\'s Rest. She\'s the one the others listen to.',
        done: 'Headwoman Ilse of Squatter\'s Rest read the Captain\'s letter.', pay: 300, standing: [['drifters', 3]],
      },
      {
        kind: 'defend', at: 'squatters', faction: 'reavers', title: 'The Roost answers', text: 'Hold Squatter\'s Rest against the Reaver raiding party from the Roost.',
        say: 'Reavers. They followed you, or they followed the letter. Either way they\'re coming over the rise, and we have two guards and a well. Stand with us.',
        done: 'The Roost\'s raiders broke at Squatter\'s Rest.', pay: 600, standing: [['drifters', 6]],
      },
      {
        kind: 'talk', title: 'The Free Road', text: 'Go back to Captain Hesk at Crossroad.',
        say: 'Ilse sent word. Squatter\'s Rest stood, and Dustwell says it will stand too, if anyone comes. That\'s the first time in a hundred years the free towns have said that about each other. The Watch owes you. There\'s a house on the east street with nobody in it, and Brannoc has been asking to walk the roads. Take both.',
        done: 'The free towns stand together.',
      },
    ],
  },
  {
    key: 'ashtithe', name: 'The Ash Tithe', faction: 'ember', town: 'pyreswatch', deed: 'flamebearer',
    giver: { name: 'Maren Vosk', title: 'Inquisitor', race: 'valefolk', female: true, loadout: 'ember_guard', level: 40, heir: 'Corwin Ashe', known: 'Inquisitor Maren Vosk' },
    blurb: 'Dreamleaf is coming over the Spine in pilgrims\' packs. The Covenant wants it stopped where it starts.',
    needs: 'Do a job for the Covenant, or be well regarded by it (standing 15). The Inquisitor will not deal with non-humans.',
    opens: { done: [['ember', 1]], standing: [['ember', 15]] },
    call: 'A Covenant rider finds you on the road: Inquisitor Maren Vosk at Pyre\'s Watch would speak with you.',
    notYet: 'The flame does not know you yet. Serve it in some small thing first, and come back.',
    ask: [
      { t: 'What is the Ash Tithe?', say: 'Every tenth of what the waste grows belongs to the flame. The Scorched Hand grows dreamleaf and pays nothing. That is not a debt we forgive. It is a debt we collect.' },
    ],
    refuse: { t: 'I don\'t burn farms for anyone.', say: 'Then you will never be warm. Go.', back: 'You came back to the light. Most do, in the end.', cost: 2 },
    gossip: { factions: ['ember'], lines: [
      ['The Inquisitor is asking for someone to carry the tithe into the Mire.', 'The Mire? The Hand would have their skin.', 'That is why she is asking.'],
    ] },
    capstone: 'You are named a Flamebearer of the Covenant and carry the Pyre\'s Tongue. The Scorched Hand will not forget it.',
    steps: [
      {
        kind: 'talk', title: 'Before the Inquisitor', text: 'Speak with Inquisitor Maren Vosk at Pyre\'s Watch.',
        say: 'The leaf comes up from the Mire in the packs of the faithful, and the faithful smoke it, and the flame goes out in them one by one. I can burn the smokers. I would rather burn the fields. The Hand runs it up the Dustwell road. Stop the runners, bring me their leaf, and then we will talk about the fields.',
        done: 'Inquisitor Vosk set you against the Scorched Hand\'s leaf trade.',
      },
      {
        kind: 'hunt', road: ['dustwell', 'mudwater'], faction: 'scorched', who: 'Teg', whoTitle: 'the Leaf Runner', size: 4, level: 26,
        title: 'Runners on the Dustwell road', text: 'Find Teg the Leaf Runner and his band on the road between Dustwell and Mudwater, and bring Teg down.',
        say: 'Teg runs the leaf. He has three or four with him, and they camp off the road between Dustwell and Mudwater.',
        done: 'Teg the Leaf Runner is down.', pay: 900, standing: [['ember', 4], ['scorched', -10]],
      },
      {
        kind: 'haul', good: 'dreamleaf', n: 10, title: 'Leaf for the Pyre', text: 'Bring ten Dreamleaf to Inquisitor Vosk at Pyre\'s Watch.',
        say: 'Now bring me their leaf. Ten bundles. It burns here, where the faithful can see it burn. If a patrol finds it on you first, tell them it is for me. They will not believe you.',
        done: 'Ten bundles of the Hand\'s leaf burned at Pyre\'s Watch.', pay: 500, standing: [['ember', 3]],
      },
      {
        kind: 'camp', at: 'scorchedcamp', title: 'The Dreamleaf Fields', text: 'Clear the Dreamleaf Fields in the Mire. Every grower and guard down.',
        say: 'The fields, then. They are in the Mire, west of Mudwater, where the Covenant has never found a dry road. Find one.',
        done: 'The Dreamleaf Fields are cleared.', pay: 1200, standing: [['ember', 5], ['scorched', -15]],
      },
      {
        kind: 'talk', title: 'Flamebearer', text: 'Return to Inquisitor Vosk at Pyre\'s Watch.',
        say: 'The fields are ash. The runners are dead or worse. The Hand will remember your face, and so will the flame. Kneel. You rise a Flamebearer of the Covenant, and this is the Pyre\'s Tongue. It was quenched in the Great Pyre. Try to be worthy of it.',
        done: 'You were named a Flamebearer of the Ember Covenant.',
      },
    ],
  },
  {
    key: 'foundry', name: 'The Waking Foundry', faction: 'hollows', town: 'rustward', deed: 'custodian',
    giver: { name: 'Ashkel', title: 'Custodian', race: 'hollow', female: false, loadout: 'hollows_guard', level: 34, heir: 'Index', known: 'Custodian Ashkel' },
    blurb: 'The foundries of the Rustwastes are building again. Not repairing: building.',
    needs: 'Do a job for the Hollows or the Delvers, be known to them (standing 10 with the Hollows, or 20 with the Delvers), or show you know machines (salvage two, or rewire one).',
    opens: { done: [['hollows', 1], ['delvers', 1]], standing: [['hollows', 10], ['delvers', 20]], flags: [['salvaged', 2], ['reprogrammed', 1]] },
    call: 'A Hollow courier finds you: Custodian Ashkel at Rustward asks for someone who knows machines.',
    notYet: 'OUR RECORDS DO NOT YET INCLUDE YOUR WORK. WORK FOR THE ENCLAVE, OR FOR THE DELVERS, AND RETURN.',
    ask: [
      { t: 'Why do you speak like that?', say: 'WE WERE BUILT TO BE HEARD ACROSS A FOUNDRY FLOOR. We can speak softly. It takes effort, and the effort is better spent on the count.' },
    ],
    refuse: { t: 'I don\'t go near foundries.', say: 'A SENSIBLE POLICY. WE NOTE IT. We will ask again when the foundries come near you.', back: 'YOU HAVE RETURNED. THE COUNT HAS NOT STOPPED IN YOUR ABSENCE.', cost: 1 },
    gossip: { factions: ['hollows', 'delvers'], lines: [
      ['The Custodian at Rustward is asking for anyone who knows machines.', 'Knows them how?', 'Knows how to take them apart.'],
    ] },
    capstone: 'The Rust Mill is silent, and a warbot the Custodian rewired walks with you. Something deeper heard it go quiet.',
    steps: [
      {
        kind: 'talk', title: 'The Custodian\'s count', text: 'Speak with Custodian Ashkel at Rustward.',
        say: 'WE HAVE COUNTED FORTY NEW FRAMES ON THE RUST THIS SEASON. The foundries are building again. Not repairing: building. Something is giving them orders, and we would like to know what. Bring us the servo motors of four of the new machines. Their wiring will tell us who wrote it.',
        done: 'Custodian Ashkel asked you to find out what is giving the foundries their orders.',
      },
      {
        kind: 'haul', good: 'servo_motor', n: 4, title: 'Parts of a voice', text: 'Bring four Servo Motors to Custodian Ashkel at Rustward. Strip them from downed machines.',
        say: 'Four servo motors. Strip them from the machines you bring down: Sentinels, drones, anything new.',
        done: 'The Custodian read the wiring of four new machines.', pay: 400, standing: [['hollows', 4]],
      },
      {
        kind: 'reach', at: 'foundry', title: 'Listen at the door', text: 'Go close to the Rust Mill, the foundry nearest Rustward, and listen.',
        say: 'The orders were written at the nearest foundry, the one the Rivet scrappers call the Rust Mill. Go close. Listen. Do not go in.',
        done: 'The Rust Mill hums a note that no machine of yours has ever made.', pay: 300, standing: [['hollows', 3]],
      },
      {
        kind: 'escort', at: 'glassfall', who: 'Senn-4', whoTitle: 'Archivist', faction: 'hollows', title: 'The archivist\'s walk', text: 'See Archivist Senn-4 safe from Rustward to Glassfall.',
        say: 'Archivist Senn-4 will carry what you heard to the Delvers at Glassfall, to compare it with their records. Senn-4 will not walk alone. Neither would we.',
        done: 'Archivist Senn-4 reached Glassfall with the Mill\'s note.', pay: 500, standing: [['hollows', 3], ['delvers', 4]],
      },
      {
        kind: 'camp', at: 'foundry', title: 'Silence the Mill', text: 'Clear the Rust Mill. Every machine in it down.',
        say: 'THE RECORDS MATCH. The Mill is not repairing itself. It is answering. Silence it, before what it answers hears it reply.',
        done: 'The Rust Mill is silent.', pay: 1500, standing: [['hollows', 6], ['delvers', 4]],
      },
      {
        kind: 'talk', title: 'A gift of the enclave', text: 'Return to Custodian Ashkel at Rustward.',
        say: 'THE MILL IS SILENT. We thank you. We rewired one of its warbots while you were walking back; it is yours, and it will not argue. One more thing. The silence lasted a day, and then something under the Glasslands began to count. Be ready.',
        done: 'Custodian Ashkel gave you a rewired warbot, and a warning.',
      },
    ],
  },
  {
    key: 'brokenchain', name: 'The Broken Chain', faction: 'unchained', town: 'brokenchain', deed: 'broken_chain',
    giver: { name: 'Iyabo', title: 'Voice of Brokenchain', race: 'duneborn', female: true, loadout: 'unchained', level: 32, heir: 'Corin', known: 'Iyabo, the Voice of Brokenchain' },
    blurb: 'The Chainhouse fields at Chainfield hold more of the Unchained\'s own than Brokenchain ever will.',
    needs: 'Escape slavery, or free a slave, or do a job for the Unchained, or be known to them (standing 10).',
    opens: { flags: [['escaped', 1], ['freed', 1]], done: [['unchained', 1]], standing: [['unchained', 10]] },
    call: 'A runaway brings word out of the reeds: Iyabo, the Voice of Brokenchain, has heard of you, and wants a word.',
    notYet: 'You walk in here with clean wrists and a full purse. Nobody in these reeds trusts that. Strike somebody\'s irons off, or work for us, and then we talk.',
    ask: [
      { t: 'Who are you?', say: 'Property, for nineteen years. The Chainhouse burned a number into my shoulder. I cut it out with a fish knife the night I ran. Now I\'m the Voice: I decide who we save next, and who we bury.' },
      { t: 'What\'s in it for me?', say: 'Our thanks, which is worth more out here than you\'d think. Whatever the catchers carry. And you sleep better after. Probably.' },
      { t: 'I wore their irons too.', if: 'escaped', say: 'I know. It\'s in how you stand. Then you know the weight, and I don\'t need to tell you why.' },
    ],
    refuse: { t: 'That\'s not my fight.', say: 'Then it isn\'t. Walk away, like everyone else did. The reeds will still be here if you grow a conscience.', back: 'Back again. Was it the conscience, or just curiosity?', cost: 3 },
    gossip: { factions: ['unchained', 'drifters', 'ironcoin'], lines: [
      ['Somebody freed a whole row of the Chainfield pens last month.', 'Unchained?', 'Who else would.', 'They say the Voice in the reeds is looking for more hands like that.'],
      ['Iyabo sent a runner to Hardcoin again.', 'Hiring?', 'Asking. The Unchained don\'t hire. They ask, and they remember who said no.'],
    ] },
    capstone: 'Overseer Varga is gone, and the pens at Chainfield stand open: their slaves walk to Brokenchain, which has people to spare for your band now, and a smith of its own. The Unchained call you Chainbreaker.',
    steps: [
      {
        kind: 'talk', title: 'The Voice in the reeds', text: 'Speak with Iyabo, the Voice of Brokenchain.',
        say: 'The fields at Chainfield hold more of us than this camp ever will. I want them out. Not all at once, or the Chainhouse hangs the lot of them to make a point. A few at a time, from under the overseers\' noses: strike their irons, open their cages. Three, to start. Are you in?',
        done: 'Iyabo, the Voice of Brokenchain, asked you to empty the pens at Chainfield.',
      },
      {
        kind: 'free', at: 'chainfield', n: 3, title: 'Strike the irons', text: 'Free three slaves at Chainfield: pick their shackles, or the locks of their cages. If an overseer sees you at it, the Chainhouse will want your head.',
        say: 'Go at night, and go quiet. Shackles give to patience; cages to a pick. If an overseer sees you at the irons, the whole house comes running.',
        done: 'You freed slaves from the fields of Chainfield.', pay: 300, standing: [['unchained', 4]],
      },
      {
        kind: 'escort', party: 'freed', at: 'brokenchain', from: 'chainfield', who: 'the freed', title: 'The reed road', text: 'See the ones you freed safe to Brokenchain. They walk only with your people beside them.',
        say: 'They won\'t know the way, and the catchers will be out by morning. Walk them in.',
        done: 'The ones you freed walked into Brokenchain.', pay: 300, standing: [['unchained', 4]],
      },
      {
        kind: 'hunt', road: ['chainfield', 'saltmere'], faction: 'chainhouse', who: 'Varga', whoTitle: 'Chief Overseer of Chainfield', size: 5, level: 30, title: 'The catchers\' road', text: 'Bring down Overseer Varga, out on the Saltmere road with her catchers, hunting the runaways.',
        say: 'Varga runs the fields, and she rides out herself when stock goes missing. She\'s on the Saltmere road with her catchers now. While she lives, nobody in those pens stops looking over their shoulder.',
        done: 'Overseer Varga of Chainfield is down.', pay: 600, standing: [['unchained', 5]],
      },
      {
        kind: 'defend', at: 'brokenchain', faction: 'chainhouse', title: 'The reprisal', text: 'Hold Brokenchain when the Chainhouse comes for it.',
        say: 'They know where we are now. They\'ll come with chains and dogs, and they\'ll come soon. Stand with us.',
        done: 'The Chainhouse\'s reprisal broke in Brokenchain\'s reeds.', pay: 800, standing: [['unchained', 6]],
      },
      {
        kind: 'talk', title: 'The pens stand open', text: 'Return to Iyabo at Brokenchain.',
        say: 'Varga is gone, and the reprisal is in the reeds. The overseers at Chainfield are counting what\'s left of their stock, and it isn\'t much: the pens stand open, and our people are walking in by the dozen. Some of them want to walk with you. Take them, and take the name we gave you. Chainbreaker.',
        done: 'Iyabo named you Chainbreaker. The pens at Chainfield stand open.',
      },
    ],
  },
  {
    key: 'horn', name: 'The Horn\'s Challenge', faction: 'karuk', town: 'hornspire', deed: 'horn_sworn',
    giver: { name: 'Ukka', title: 'Horn-Mother', race: 'karuk', female: true, loadout: 'karuk_guard', level: 44, heir: 'Thokk', known: 'Horn-Mother Ukka of Hornspire' },
    blurb: 'The Horn-Mother of Hornspire keeps the old ways. One of them is that the Horn listens only to those who have bled in front of it.',
    needs: 'Win a bout in the Pit at Hornspire, or do a job for the Karuk, or be well liked by them (standing 20).',
    opens: { flags: [['pitWins', 0]], done: [['karuk', 1]], standing: [['karuk', 20]] },
    call: 'A Karuk runner finds you, breathing hard: the Horn-Mother at Hornspire wants a look at you.',
    notYet: 'You have never bled in the Pit. The Horn does not hear people who have not bled in front of it. Win a bout, or serve the Warhost, and come back.',
    ask: [
      { t: 'Who are you?', say: 'The mother of the Horn King, and the only one in Hornspire he is afraid of. I keep the old ways. Somebody has to; the young ones would sell them for a good knife.' },
      { t: 'Why fight your champion?', say: 'Because the Horn does not trust what has not bled in front of it. Gorr has put down every challenger for six winters. If you are standing when he falls, the Horn will listen to you.' },
    ],
    refuse: { t: 'I\'m not fighting your champion for anyone\'s amusement.', say: 'Hah! Then you are wiser than you look, and smaller. The Pit will be here when you grow.', back: 'The soft one, back again. Grown, have we?', cost: 2 },
    gossip: { factions: ['karuk'], lines: [
      ['The Horn-Mother watched the Pit all night again.', 'Looking for someone?', 'Looking for someone to put Gorr on his back. She says he is getting proud.'],
      ['Gorr Stonebrow has not lost a bout in six winters.', 'He has not had a real fight in six winters.', 'Say that in the Pit.'],
    ] },
    capstone: 'Gorr Stonebrow, the Horn\'s champion, walks with you; the Karuk call you Horn-Sworn, and the Horn King\'s own maul is yours.',
    steps: [
      {
        kind: 'talk', title: 'The Horn-Mother\'s eye', text: 'Speak with Horn-Mother Ukka at Hornspire.',
        say: 'You smell of the soft towns, and you stand like someone who has been hit before. Good. The Horn has a champion, Gorr Stonebrow, who has put down every challenger for six winters. Meet him in the Pit, one on one, until one of you stays down. Nobody else of yours steps in, or the Horn calls it forfeit. Well?',
        done: 'Horn-Mother Ukka of Hornspire offered you the Horn\'s Challenge.',
      },
      {
        kind: 'duel', at: 'hornspire', who: 'Gorr Stonebrow', whoTitle: 'Champion of the Horn', race: 'karuk', loadout: 'karuk_guard', level: 46, title: 'One on one', text: 'Beat Gorr Stonebrow in the Pit at Hornspire, one on one. If anyone else of yours joins in, it is forfeit.',
        say: 'Go into the Pit when you are ready. Gorr will come when he sees you there. One of you, one of him; I will be watching.',
        done: 'You put Gorr Stonebrow down in the Pit, one on one.', pay: 500, standing: [['karuk', 6]],
      },
      {
        kind: 'hunt', road: ['hornspire', 'cragfold'], species: 'hookbeak', great: 1.35, who: 'the Old Grey', title: 'The Old Grey', text: 'Bring down the Old Grey, a hookbeak older than Hornspire\'s walls, on the Cragfold road. Not alone: take all your people, and hire spears if they are not enough.',
        say: 'Gorr will live. His pride may not. Now the Horn wants a skull: an old hookbeak the herders call the Old Grey has taken three of them on the Cragfold road this season. This is no duel. Take everyone you have, and hire spears if that is not enough; the Grey does not care how many of you come, only how many are left.',
        done: 'The Old Grey is dead on the Cragfold road.', pay: 900, standing: [['karuk', 6]],
      },
      {
        kind: 'defend', at: 'cragfold', faction: 'blackcomb', title: 'The swarm at Cragfold', text: 'Hold Cragfold when the Blackcomb drones come for its herds.',
        say: 'Blackcomb drones have been stripping the herds at Cragfold, and the herders are too proud to ask for help. Go and hold Cragfold when the swarm comes. Do not tell them I sent you.',
        done: 'The Blackcomb swarm broke on Cragfold\'s walls.', pay: 1000, standing: [['karuk', 8]],
      },
      {
        kind: 'talk', title: 'Horn-Sworn', text: 'Return to Horn-Mother Ukka at Hornspire.',
        say: 'The herders of Cragfold are telling everyone who will listen. So: the Pit, the Grey, the swarm. The Horn has heard you. Kneel, if your knees bend. You rise Horn-Sworn, and Gorr goes with you; he asked to, which he has never done for anyone. And take this maul from my son\'s rack. He will not miss it, and if he does, he will not say so.',
        done: 'Horn-Mother Ukka named you Horn-Sworn of the Karuk.',
      },
    ],
  },
];

export const STORY: Record<string, StoryDef> = Object.fromEntries(STORIES.map((s) => [s.key, s]));

/** Names for the people a capstone sends with you. */
export const SERGEANT = { name: 'Brannoc', title: 'Watch Sergeant' };
export const WARBOT = { name: 'Bulwark', title: 'Gift of the Enclave' };
export const CHAMPION = { name: 'Gorr Stonebrow', title: 'Champion of the Horn', heir: 'Mordu Ashhorn' };
/** Brokenchain's own smith, once the pens stand open, and what the runaways who come there are called. */
export const SMITH = { name: 'Dele', title: 'Chainbreaker\'s Smith', shop: 'The Chain Forge' };
export const RUNAWAY = 'Runaway';

// ---------------------------------------------------------------- the crises
/**
 * A crisis: late in a game, or a while after a story ends, a power of the
 * waste turns on the world. A day's warning; then waves sized to your band,
 * each a little stronger than the last, until you bring down whoever leads
 * them. All of it is said here; sim/crisis is the one engine that runs them,
 * and only one is ever awake and marching at a time.
 */
export interface CrisisDef {
  key: string;
  name: string;
  /** what wakes it: from this day of the game with a base of yours standing; or this long after a story's end */
  wakeDay: number;
  afterStory?: { key: string; days: number };
  /** where its leader waits: a settlement, or the nearest site of a kind to your base (not the one a story had you clear) */
  lair: { key?: string; kind?: string; notStory?: string };
  /** the one to bring down: a beast or a person, made harder than their kind (hit points and skills), and what they carry */
  leader: { name: string; title: string; animal?: string; scale?: number; person?: { faction: string; role: string; loadout: string; level: number; race?: string; female?: boolean }; hp: number; skill: number; items?: [string, number][] };
  /** those who keep the leader */
  guards: { n: number; faction: string; role: string; loadout?: string; level?: number; title: string };
  /**
   * What marches: people (a squad of the world's, by its key) up to so many a wave (a base and a number more
   * each wave), and beasts sent with them, from a wave on (0, the first), up to so many (one only, or a base and more each wave).
   */
  wave: { spec: string; role: string; name: string; townName?: string; folk: [string, string]; people: [number, number]; beasts?: { species: string; from: number; cap: [number, number]; one?: boolean }[] };
  /** what the waves march on: your base (every wave, or every other one); and towns, of these peoples or (with no base) the nearest lawful */
  targets: { base: 'always' | 'alternate'; towns: { factions?: string[]; noBaseOnly?: boolean } };
  /** how long the warning lasts and the days between waves; each wave's strength against your band; the rest it takes once five are spent */
  warnDays: number;
  waveDays: number;
  waves: number[];
  quietDays: number;
  /** how much of a town's own defence a wave on it brings, besides its share of your band (on the first wave; a tenth more each) */
  townShare: number;
  /** and at most how many times the town's own strength it brings, so that a town left alone holds now and then, and your help decides it */
  townCap?: number;
  /** what is said ({lair}, {where}: one of `where`, without a base and with; {nth}, {target}) */
  text: { wake: string; guide: string; wave: string; town?: string; quiet: string; rewake: string; end: string; reward: string; where: [string, string] };
  reward: { money: number; items: [string, number][]; standing: [string, number][]; quiet?: [string, number]; title?: string };
  deed: string;
}

export const CRISES: CrisisDef[] = [
  {
    key: 'foundry', name: 'The Foundry Wakes', wakeDay: 20, afterStory: { key: 'foundry', days: 1 }, deed: 'foundry_sleeps',
    lair: { kind: 'foundry', notStory: 'foundry' },
    leader: { name: 'the Foundry Mind', title: 'It Counts', animal: 'warbot', scale: 1.2, hp: 1.8, skill: 1.3, items: [['power_core', 1], ['maker_optic', 2]] },
    guards: { n: 2, faction: 'machines', role: 'construct', loadout: 'machines_boss', title: 'Keeper of the Count' },
    wave: {
      spec: 'sentinels', role: 'patrol', name: 'Sentinels', townName: 'Foundry war party', folk: ['Sentinel', 'Sentinels'], people: [2, 1],
      beasts: [{ species: 'warbot', from: 2, cap: [1, 0], one: true }, { species: 'sawdrone', from: 0, cap: [2, 2] }],
    },
    targets: { base: 'always', towns: { noBaseOnly: true } },
    warnDays: 1, waveDays: 0.8, waves: [0.75, 1.0, 1.3, 1.6, 2.0], quietDays: 8, townShare: 0,
    text: {
      wake: '{lair} has woken. Sentinels are walking out of it in step, and the Delvers say everything it makes is coming {where}.',
      guide: 'Raise walls and turrets, and keep your people home when the waves come; or march on {lair} and break the Foundry Mind, and it all stops.',
      wave: 'The {nth} wave from {lair} is marching on {target}.',
      quiet: '{lair} has gone quiet, spent. The Foundry Mind still sits in its hall, and until it is broken it will wake again.',
      rewake: '{lair} is counting again.',
      end: 'The Foundry Mind is broken. The machines it made stop where they stand, and the Rustwastes are quiet for the first time in a year.',
      reward: 'The free towns, the Concord and the Delvers send their thanks in chits, and the Mind\'s heart is yours.',
      where: ['for the towns nearby', 'for your base'],
    },
    reward: {
      money: 8000, items: [['foundry_heart', 1], ['relic_core', 1]],
      standing: [['drifters', 10], ['concord', 10], ['delvers', 10], ['hollows', 10], ['karuk', 10], ['thrum', 10], ['ironcoin', 10]],
    },
  },
  {
    key: 'muster', name: 'The Reaver Muster', wakeDay: 25, afterStory: { key: 'freeroad', days: 30 }, deed: 'muster_broken',
    lair: { key: 'reaversroost' },
    leader: { name: 'Grath Ashjaw', title: 'Warlord of the Muster', person: { faction: 'reavers', role: 'boss', loadout: 'reavers_boss', level: 54, race: 'karuk', female: false }, hp: 1.5, skill: 1.15, items: [['redrage', 2]] },
    guards: { n: 3, faction: 'reavers', role: 'bandit', loadout: 'reavers', level: 34, title: 'Muster Guard' },
    wave: { spec: 'reavers', role: 'bandit', name: 'Reaver warband', folk: ['Reaver', 'Reavers'], people: [4, 2], beasts: [{ species: 'dunehound', from: 1, cap: [1, 1] }] },
    targets: { base: 'alternate', towns: { factions: ['drifters'] } },
    warnDays: 1, waveDays: 0.7, waves: [0.6, 0.75, 0.9, 1.05, 1.2], quietDays: 6, townShare: 0.5, townCap: 1.2,
    text: {
      wake: 'War drums at {lair}: Grath Ashjaw has come down out of the Ash and called the muster. Every Reaver on the Flats is answering, and the warbands are coming {where}.',
      guide: 'Help the free towns hold their walls when the warbands come, and keep your own; or go into {lair} and bring down Grath Ashjaw, and the muster breaks.',
      wave: 'A Reaver warband, the {nth} of the muster, is marching from {lair} on {target}.',
      town: 'The free towns call for help: {target} will not hold alone.',
      quiet: 'The muster has spent itself on the walls, for now. Grath Ashjaw still holds {lair}, and the drums will start again.',
      rewake: 'The drums at {lair} have started again.',
      end: 'Grath Ashjaw is down, and the muster breaks. The warbands melt back into the Flats, every chief of them sure the next warlord will be them.',
      reward: 'The free towns pay what they promised, and the roads are quiet for a season.',
      where: ['for the free towns', 'for the free towns and your base'],
    },
    reward: {
      money: 6000, items: [['relic_core', 1]],
      standing: [['drifters', 15], ['ironcoin', 10], ['concord', 5], ['unchained', 5]],
      quiet: ['reavers', 45], title: 'Breaker of the Muster',
    },
  },
];
export const CRISIS_DEF: Record<string, CrisisDef> = Object.fromEntries(CRISES.map((c) => [c.key, c]));
/** The first of them, the Foundry (its numbers, for what still reads them so). */
export const CRISIS = CRISES[0];
