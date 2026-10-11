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
export type StepKind = 'talk' | 'camp' | 'deliver' | 'defend' | 'hunt' | 'haul' | 'reach' | 'escort';

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
  /** goods to bring */
  good?: string;
  n?: number;
  /** who: a recipient, a traveller, or a quarry */
  who?: string;
  whoTitle?: string;
  faction?: string;
  size?: number;
  level?: number;
  /** the road a hunt is on: between two settlements */
  road?: [string, string];
  /** what finishing the step pays */
  pay?: number;
  standing?: [string, number][];
}

export interface StoryDef {
  key: string;
  name: string;
  faction: string;
  /** the settlement where the giver stands */
  town: string;
  giver: { name: string; title: string; race: string; female: boolean; loadout: string; level: number; heir: string; known: string };
  /** a line for the journal while it is waiting for you */
  blurb: string;
  /** when the giver will talk to you, in words */
  needs: string;
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
    call: 'Word reaches you from Crossroad: Captain Hesk of the Watch is asking after you.',
    notYet: 'I know your face. I don\'t know your work. Take a job off the board, and then we\'ll talk.',
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
    call: 'A Covenant rider finds you on the road: Inquisitor Maren Vosk at Pyre\'s Watch would speak with you.',
    notYet: 'The flame does not know you yet. Serve it in some small thing first, and come back.',
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
    call: 'A Hollow courier finds you: Custodian Ashkel at Rustward asks for someone who knows machines.',
    notYet: 'OUR RECORDS DO NOT YET INCLUDE YOUR WORK. WORK FOR THE ENCLAVE, OR FOR THE DELVERS, AND RETURN.',
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
];

export const STORY: Record<string, StoryDef> = Object.fromEntries(STORIES.map((s) => [s.key, s]));

/** Names for the people a capstone sends with you. */
export const SERGEANT = { name: 'Brannoc', title: 'Watch Sergeant' };
export const WARBOT = { name: 'Bulwark', title: 'Gift of the Enclave' };

// ---------------------------------------------------------------- the crisis
export const CRISIS = {
  name: 'The Foundry Wakes',
  /** how long the warning lasts, and the days between waves (game days) */
  warnDays: 1,
  waveDays: 0.8,
  /** how strong each wave is against your band (see sim/crisis) */
  waves: [0.75, 1.0, 1.3, 1.6, 2.0],
  /** how long the foundry stays quiet once it has spent itself, before it wakes again */
  quietDays: 8,
  wake: '{foundry} has woken. Sentinels are walking out of it in step, and the Delvers say everything it makes is coming {where}.',
  guide: 'Raise walls and turrets, and keep your people home when the waves come; or march on {foundry} and break the Foundry Mind, and it all stops.',
  wave: 'The {nth} wave from {foundry} is marching on {target}.',
  quiet: '{foundry} has gone quiet, spent. The Foundry Mind still sits in its hall, and until it is broken it will wake again.',
  rewake: '{foundry} is counting again.',
  end: 'The Foundry Mind is broken. The machines it made stop where they stand, and the Rustwastes are quiet for the first time in a year.',
  reward: 'The free towns, the Concord and the Delvers send their thanks in chits, and the Mind\'s heart is yours.',
  mind: { name: 'the Foundry Mind', title: 'It Counts' },
};
