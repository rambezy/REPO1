// What people say: greetings by faction and role, talk about themselves and
// their towns, rumours about the world, demands, and short barks.
import type { Char } from '../sim/char';
import { S } from '../sim/ctx';
import { FACTION } from './factions';
import { RACE } from './races';
import { SETTLEMENT, LANDMARKS } from './layout';
import { REGIONS } from '../world/regions';

type Pool = Record<string, string[]>;

export const GREET: Pool = {
  drifters: ['What do you want?', 'Keep your hands where I can see them.', 'Another drifter. Welcome to nowhere.', 'If you\'re buying, talk. If not, walk.', 'Dust on the wind today. Always is.', 'You look like you\'ve walked a long way.', 'Don\'t start trouble and there won\'t be any.', 'Water\'s free if you\'re dying. Otherwise it\'s two chits a cup.', 'Mind the Watch. They\'re honest right up until payday.', 'Reavers were out on the east road this morning. Just so you know.', 'Sit if you like. Nobody here will ask your name.'],
  concord: ['Bow your head when you address a subject of the Concord.', 'State your business, and be brief.', 'Contracts, coin and order. That is the Concord.', 'Mind your step. The Lords see everything.', 'You smell of the road.', 'Show me your papers. No papers? Then your purse will have to speak for you.', 'The Houses thank you for your custom. Move along.', 'Everything in the Concord has a price. My patience is nearly spent.', 'Walk on the left, subject. The middle of the street is for Lords.'],
  chainhouse: ['Looking to buy? Or looking to be bought?', 'Strong back on you. Good price, that.', 'The Chainhouse is licensed by the Lords. Remember that.', 'Travelling alone? Brave. Or foolish. Both fetch a price.', 'Don\'t mind the chains. They\'re not for you. Probably.', 'Every debt gets paid, friend. One way or another.'],
  ember: ['The Ember sees you, stranger.', 'Walk in the light, or do not walk here at all.', 'May the flame judge you kindly.', 'Have you come to confess?', 'The Undying Ember burns for the faithful.', 'Warm yourself at the flame, and tell me truly where you have been.', 'The sun is watching you. So am I.', 'Do you carry dreamleaf? Think carefully before you answer.', 'Blessed is the flame that burns away the ash.'],
  karuk: ['Hah. Small one. Do you fight?', 'Speak plainly or not at all.', 'Show me your hands. Callouses mean honesty.', 'The Horn King welcomes the strong.', 'You walk like prey.', 'You are small. That is not your fault. Being weak would be.', 'Speak or fight. Both are good. Silence is for stones.', 'Horn and blood, stranger.', 'Hah. You have not run yet. A good start.'],
  thrum: ['*hum* ...Visitor. The Queen permits.', 'We-are-many. You-are-one. Hello, one.', '*click* *click* Trade? Trade is good.', 'Sweet resin. Sweet resin for iron?', '*hum-hum* Soft-one-walks-far. Soft-one-must-be-tired.', 'Many-greet-you. *click* That-is-hello.', '*hum* You-smell-of-iron. Good-smell.', 'Queen-hums. We-hum. You-may-hum-also. No? Strange-one.'],
  delvers: ['Found anything interesting out there?', 'Mind the lamps. They\'re older than your grandmother.', 'If you\'ve got relics, we\'re buying.', 'Another survivor of the Bone Sea. Sit, drink.', 'Watch your step. I haven\'t mapped that bit yet.', 'Got a lamp? Never go below ground without a lamp.', 'Tablet, codex or core? If you\'ve got any of the three, we should talk.', 'Came back alive, did you? That\'s the hard part done.'],
  hollows: ['GREETINGS. STATE PURPOSE.', 'You are organic. You are welcome, conditionally.', 'Our records do not include you. That is acceptable.', 'Maintenance is life. Do you require maintenance?', 'GREETINGS, ORGANIC. YOUR JOINTS ARE CREAKING. THIS IS NORMAL FOR YOUR KIND.', 'Please do not touch the pillar. It is older than your language.', 'You are breathing heavily. We will wait while you finish.', 'Query: are you here to buy, to sell, or to be repaired?'],
  unchained: ['You\'re not Chainhouse. Good.', 'Every chain broken is a life returned.', 'Speak quietly. The hunters have ears everywhere.', 'If you pass a hunter on the road, you never saw us.', 'No shackles on you. Good. Keep it that way.', 'We share what we have. It isn\'t much, so don\'t take more than your share.'],
  scorched: ['You lost, friend? Mudwater doesn\'t get lost people back.', 'The Hand sees all. Mind what you do with yours.', 'Leaf? Don\'t say I didn\'t offer.', 'Nice boots. Shame if the swamp took them.', 'Nobody sees anything in Mudwater. That includes you.', 'The Hand is open, friend. Don\'t make it close.'],
  ironcoin: ['Coin first. Talk after.', 'Iron Coin. We fight for whoever pays.', 'Hiring? We\'re the best money can buy. Literally.', 'Our rates are fair and our loyalty is exact.', 'Looking for work, or looking for workers? Either way, it costs.', 'We\'ve fought for everyone and against everyone. Twice.'],
  reavers: ['Well, well. Look what walked onto our road.', 'Toll road, this. Didn\'t you know?', 'Nice day for a robbery. Yours, specifically.', 'Put the pack down slowly and we all go home.', 'A quarter of what you carry, and you keep the rest. We\'re reasonable.'],
  starvelings: ['Food... do you have food...', 'Bread... just a crust...', 'Please... we haven\'t eaten since the last rain...', 'You look well fed. Share. Share, or else.'],
  mawkin: ['*sniffs* ...meat.', '*sniff* ...Soft. Soft and warm.', 'Come closer. The fire is warm. So are you.', '*growls* ...Hungry.'],
  default: ['Hm?', 'Yes?', 'What.', 'Can I help you?', 'Mm?', 'Something you need?', 'Yes, stranger?'],
};

export const ROLE_GREET: Pool = {
  shopkeeper: ['Welcome, welcome! Good prices, better goods.', 'Buying or selling?', 'Look around. Touch nothing you can\'t pay for.', 'Best stock this side of the Spine.'],
  barkeep: ['What\'ll it be?', 'Drink or trouble? Only serving one of them.', 'Grog\'s cheap, rum\'s better, and the dustwine is for people with money.', 'Sit down, you\'re making the regulars nervous.'],
  recruit: ['Looking for someone? Maybe you\'re looking for me.', 'Nothing to do in this town but drink. Got anything better?', 'You\'ve got the look of someone who needs help.', 'Hey. You hiring?'],
  guard: ['Move along.', 'Keep the peace and we\'ll get along.', 'Eyes forward, hands still.', 'I\'m watching you.'],
  patrol: ['Stay out of trouble.', 'Patrol business. Step aside.'],
  noble: ['You may speak. Briefly.', 'Do not touch the silk.', 'How did you get in here?'],
  priest: ['The Ember welcomes the penitent.', 'Kneel, child, and be warmed.', 'Have you brought an offering?'],
  worker: ['Busy. Very busy.', 'No time to talk, the harvest won\'t wait.'],
};

const WHO: Pool = {
  shopkeeper: ['I sell things. You buy things. Simple.', 'Twenty years behind this counter. Seen every kind of fool.', 'I used to walk the roads. Now I sell to those who do.'],
  barkeep: ['I pour. People talk. I listen.', 'I own this place. Well, me and the bank.', 'Every rumour in town passes over this bar sooner or later.'],
  guard: ['I keep the peace here. Mostly by breaking heads.', 'Town guard. Not much pay, less thanks.', 'I\'m the one who throws people like you in the cage.'],
  patrol: ['We walk the streets so the thieves don\'t.'],
  noble: ['I am a Lord of the Houses. That is all you need to know.', 'My family has held these lands for nine generations.'],
  priest: ['I tend the flame. I have tended it for forty years.', 'A servant of the Undying Ember.'],
  worker: ['I work the fields. Sun up to sun down.', 'Farmer. Like my mother. Like hers.'],
  resident: ['Just someone trying to get by.', 'Nobody important.', 'I live here. For my sins.', 'I mend nets, I mend walls, I mend whatever needs it.'],
  default: ['Why do you care?', 'Nobody you\'d have heard of.', 'I\'m just passing through.'],
};

const PLACE_EXTRA: Record<string, string[]> = {
  crossroad: ['Four roads, one ford, and more thieves than both. The Watch keeps order, for a price.', 'Best bar in the Flats is here. Only bar in the Flats, some days.', 'The Reavers camp east of the walls. They leave the town alone. Mostly.', 'The Hungry Camp by the ford begs more than it robs. Give them bread and they\'ll let you be.'],
  aurum: ['The golden city. Keep your eyes down and your purse closed.', 'The Lords sit in the palace and count the world.', 'The Houses don\'t fight each other with swords here. They use contracts. It\'s crueller.'],
  harrowmarket: ['Anything can be bought here. Anything, and anyone.', 'The Iron Coin keeps a hall here. Mercenaries, if you can pay.', 'Chainhouse caravans come up from Chainfield on market days. Keep your people close.'],
  cinderhold: ['The Great Pyre has burned for six hundred years. It will burn for six hundred more.', 'Non-humans are not welcome in the white city. You understand.', 'The reservoir feeds the whole city. The Covenant guards it nearly as closely as the Pyre.'],
  hornspire: ['Fight in the arena, and the Karuk will respect you. Lose, and they will respect your corpse.', 'The Horn King sits in the great hall. Few are invited.', 'The young ones earn their horns at the Proving Ground, south of the city. Most of them come back.'],
  mudwater: ['The Scorched Hand runs this town. Remember that and you\'ll live.', 'Leaf money built these stilts.', 'The Burnt King owns the stilts, the boats and the leaf. The swamp he only rents.'],
  rustward: ['The machines keep the old lights burning here.', 'If you need a new arm, this is where you buy it.', 'The Custodians do not like questions about the Maker\'s Heart. Ask anyway. They are very polite about not answering.'],
  lanternrest: ['Delvers dig the Bone Sea for the past. Some of them even come back.', 'The lamps never go out. The Delvers say it keeps the Mawkin honest.'],
  chainfield: ['Keep walking unless you want to work the fields.', 'Nobody here goes near the reeds to the west. Everybody here knows exactly where they are.'],
  squatters: ['Somebody tried to close the bar once. We buried him by the well.', 'Deepest well in the Flats. The water tastes of iron, and it has never once run dry.'],
  dustwell: ['The palms are older than the village, and the well is older than the palms.', 'Mudwater is south down the road, if you want trouble. The hives are west, if you want honey.'],
  saltmere: ['The salt gets into everything. Your food, your bed, your sleep.', 'The House owns the pans, the cutters, and most of the air.'],
  stonegate: ['Whoever holds Stonegate holds the iron, and the Concord means to keep holding it.', 'Things come down out of the Rust some nights. The garrison sleeps in its boots.'],
  brightwater: ['Every harvest here is a prayer, and the priests collect the tithe before the prayer is finished.', 'The Field of Horns is south of us. On a still day you can hear it.'],
  pyreswatch: ['Nobody crosses the Spine here without being seen by the flame.', 'The Inquisitors keep a list of everyone who passes. Pray you are not on the short one.'],
  redmesa: ['Everything a Karuk needs is here: a wall, a fire, and someone to fight.', 'The pass south of here drops into the Thrumwood. The hives are friendly to the horned.'],
  humminghollow: ['*hum* Hive-is-home. Home-is-hive. Visitor-may-trade. Visitor-may-not-stay.', 'You stop hearing the hum after a few days. That is when you should leave.'],
  waxgate: ['Resin-for-iron. Iron-for-resin. Waxgate-is-fair.', 'West-of-here, stalks-go-dark and hum-goes-wrong. That-is-Blackcomb. Do-not-go-west.'],
  brokenchain: ['Nobody here was born free. Everybody here is free now.', 'If the hunters ever find this camp, we fight. There is nowhere left to run to.'],
  lowtide: ['If someone knocks in the fog, ask them their mother\'s name. If they don\'t answer, don\'t open.', 'The fish are good, the salt is cheap, and the fog takes one of us every winter.'],
  glassfall: ['Every Delver who goes out into the Glasslands chalks a name on the board by the fire. We rub it out when they come back.', 'The cheap hats rot in a week out there. Pay for a good one.'],
  hardcoin: ['The Company settled here because the land was free and the Mawkin are good practice. The recruits find that less funny than the sergeants do.', 'Nobody is born in Hardcoin. People sign on, serve out or get buried, and the graveyard is the only part of town that keeps growing.'],
  cragfold: ['A Karuk child is given a ram to raise before she is given a blade. If the ram lives to be old, so will she. That is the saying.', 'Hornspire calls us goat-herds, as if it were an insult. Come up here in the winter and see who is soft.'],
  ribshade: ['We sell the bone to the carvers in Aurum, the ivory to the Delvers and the shade to anybody who can pay for it.', 'The bones were here before the town and they will be here after it. We try not to take that personally.'],
  relayfour: ['THIS STATION IS FOUR OF NINE. THE OTHER EIGHT DO NOT ANSWER. WE CONTINUE TO ASK.', 'Organics are advised to wear a hood. The rain here will remove your face, and we have no replacement faces in stock.'],
  tithefield: ['Every tenth sheaf goes to the Great Pyre. So does every ninth, when the priests do the counting.', 'Most of the penitents came for one season. Most of them are still here. After a while you stop asking what you did, and just work.'],
  brinewick: ['The Lords in Aurum like our salt because it is not Barrens salt. It is exactly the same salt, and they pay double for it.', 'Keep the pan fires lit and the fog keeps back. Let them go out, and be indoors with the door barred before the smoke clears.'],
  deepleaf: ['Pick it, dry it, bale it and row it to Mudwater. Never smoke the stock. The last picker who smoked the stock is feeding the next crop.', 'The Hand pays in chits, food and not drowning. The chits are the smallest part of it.'],
  rivet: ['Stonegate buys our iron. Cinderhold buys it too, and pays extra for us not to tell Stonegate.', 'Every machine in the Rust is worth money, dead or alive. The live ones are worth more, but they argue about the price.'],
};

export function greeting(n: Char, p: Char): string {
  const race = RACE[p.look.race]?.race;
  if (n.faction === 'ember' && race && race !== 'human') return S.rng.pick(['Abomination. You are not welcome in the light.', 'Your kind is not permitted here.', 'Begone, creature.']);
  if (n.faction === 'karuk' && race === 'karuk') return S.rng.pick(['Horn-kin! Well met.', 'Hah! A true Karuk. Welcome, sibling.']);
  if (race === 'hollow' && n.faction !== 'hollows' && S.rng.chance(0.4)) return S.rng.pick(['A walking machine... does it think?', 'Keep your metal hands to yourself.', 'Hollows. Never trust a thing that doesn\'t sleep.']);
  const rp = ROLE_GREET[n.role];
  if (rp && S.rng.chance(0.65)) return S.rng.pick(rp);
  const fp = GREET[n.faction] ?? GREET.default;
  let g = S.rng.pick(fp);
  if (S.clock.isNight && S.rng.chance(0.25)) g = S.rng.pick(['Bit late to be wandering about.', 'Can\'t sleep either?', 'Night is when the bad ones come out. You one of them?']);
  return g;
}

export function aboutMe(n: Char): string {
  if (n.mem.backstory) return n.mem.backstory;
  const pool = WHO[n.role] ?? WHO.default;
  return S.rng.pick(pool);
}

export function aboutPlace(n: Char): string {
  const site = S.T.siteAt(n.x, n.z, 40);
  if (site && site.kind === 'town') {
    const def = SETTLEMENT[site.settlement!];
    const extra = PLACE_EXTRA[def.key];
    return (extra && S.rng.chance(0.6) ? S.rng.pick(extra) + ' ' : '') + def.desc;
  }
  const reg = S.T.regionAt(n.x, n.z);
  return `This is ${reg.name}. ${reg.desc}`;
}

/** Rumours point at real places and powers in the world. */
export function rumour(n: Char): string {
  const r = S.rng.next();
  if (r < 0.3) {
    const l = S.rng.pick(LANDMARKS);
    const site = S.T.sites.find((s) => s.key === l.key);
    const dir = site ? direction(n.x, n.z, site.x, site.z) : '';
    return S.rng.pick([
      `They say there's a place ${dir} of here called ${l.name}. ${l.desc}`,
      `Heard of ${l.name}? ${l.desc} It's ${dir}, if you're mad enough.`,
      `A Delver told me about ${l.name}, ${dir} of here. ${l.desc}`,
    ]);
  }
  if (r < 0.5) {
    const s = S.rng.pick(Object.values(SETTLEMENT));
    const site = S.T.sites.find((x) => x.key === s.key);
    return `${s.name} lies ${site ? direction(n.x, n.z, site.x, site.z) : 'somewhere'} of here. ${s.desc}`;
  }
  if (r < 0.65) {
    const reg = S.rng.pick(REGIONS);
    return S.rng.pick([`${reg.name}? ${reg.desc}`, `I've been to ${reg.name} once. Never again. ${reg.desc}`]);
  }
  if (r < 0.8) {
    const f = S.rng.pick(['concord', 'ember', 'karuk', 'chainhouse', 'reavers', 'scorched', 'hollows', 'delvers', 'unchained', 'mawkin', 'thrum']);
    const fd = FACTION[f];
    return S.rng.pick([`${fd.name}... ${fd.desc}`, `You want to know about ${fd.short}? ${fd.desc}`]);
  }
  return S.rng.pick(RUMOURS);
}

function direction(x: number, z: number, tx: number, tz: number) {
  const a = Math.atan2(tx - x, -(tz - z)); // north is -z
  const dirs = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
  const i = Math.round(((a + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
  const d = Math.hypot(tx - x, tz - z);
  const far = d > 5000 ? 'far to the ' : d > 2000 ? 'to the ' : 'just ';
  return far + dirs[i];
}

export const RUMOURS = [
  'The Covenant and the Karuk are fighting again on the Field of Horns. When aren\'t they?',
  'A caravan went missing on the Salt Barrens. Chainhouse, I\'d wager.',
  'Somebody saw a light blinking on the Old Signal Tower. Nobody\'s been up there in a hundred years.',
  'Hookbeaks came out of the Bone Sea last season. Took a whole Delver camp.',
  'The Horn King is old. When he dies, there\'ll be blood in Hornspire.',
  'They say the Mawkin keep captives alive for weeks. I don\'t want to know why.',
  'The Hollows of Rustward will fit you with a new arm, if you\'ve lost one. Costs a fortune.',
  'The fog on the Grey Shore isn\'t natural. Something lives in it.',
  'Starvelings are getting bolder on the Crossroad road. Keep food handy; sometimes it\'s enough.',
  'A Lord in Aurum is paying good money for Relic Cores. What he wants them for, nobody knows.',
  'The rain in the Glasslands eats skin. Wear a hat. A good one.',
  'The Unchained raided a Chainhouse caravan and freed thirty slaves. The Lords are furious.',
  'There\'s an old Maker lab buried in the Rustwastes. The machines around it never sleep.',
  'Blackcomb Hive went mad when its Queen died. Stay out of the western forest.',
  'You can mine iron anywhere in the highlands. Stone, too. Build yourself a wall, if you\'re smart.',
  'Dreamleaf fetches three times the price outside Mudwater. Just don\'t get caught by the Covenant with it.',
  'A lone traveller is a gift to the Chainhouse. Travel in a group.',
  'The Karuk respect a fair fight. Challenge one, and even if you lose, you\'ll have their respect.',
  'Swamp maulers bite off legs. Walk around the deep water in the Mire.',
  'Somebody built a camp near the Wending ford and the Reavers burned it to the ground.',
  'The Glass Dome took another Delver team last month. Glassfall is selling their kit cheap, if you\'re not superstitious.',
  'The hermit on the Hermit\'s Rock says the light on the Old Signal Tower is counting down. Mad as a goatling. Still, he\'s never wrong about the weather.',
  'They say the cellars under the palaces of Aurum hum at night. Relic Cores, stacked like firewood, if you believe the servants.',
  'Chainfield doubles the guard on its south fence when the Mawkin come up from the Gnawing Pit. The west side, by the reeds, goes thin. The Unchained know it.',
  'The Wardens at Warden Post Seven haven\'t moved in living memory. Throw a stone at one and see how long that lasts.',
  'Hookbeaks won\'t go near the Ribs of the Colossus. Nobody knows why. Caravans crossing the Bone Sea sleep between the bones for exactly that reason.',
  'Nobody\'s seen the Burnt King outside his stilt-house in Mudwater for years. Some say he\'s dead and the Hand is too scared to say so.',
  'A Karuk who loses in the Hornspire arena walks out. A Karuk who refuses to fight doesn\'t walk out of the city at all.',
  'The Thrum at Waxgate will trade honey resin for iron plates. Best deal in the west, if you\'ve got the iron.',
  'Somebody brought an Old Codex up out of the Drowned Spire. Took nine dives into the black water, and two of the divers stayed down.',
  'The fog sat on Lowtide for four days last month. When it lifted, there were bare footprints on every doorstep.',
  'The Pale Camp up the Grey Shore grows every year. Nobody sees them arrive. There are just more of them.',
  'Rustspiders are made of good iron plate and better parts. Bring a club. Swords just skate off them.',
  'The rain in the Glasslands comes on green and slow. Get under a roof before it thickens, or wear a mask and a good coat.',
  'Gas comes up out of the craters in the Rustwastes. A hat won\'t save you. A mask will. The Hollows walk through it like it\'s nothing.',
  'The Delvers at Lantern Rest pay for relics in water. Out in the Bone Sea, that\'s worth more than chits.',
  'If you\'re looking for Brokenchain, go into the reeds between the Mire and the ash and wait. If the Unchained like your face, they\'ll find you.',
  'The Iron Coin never breaks a contract. It just lets it run out, usually at the worst possible moment.',
  'The slave market at Harrowmarket sells Karuk for near half again the price of a human. The Karuk have noticed.',
  'The old priest at the Shrine of the Last Ember lets anyone sleep by his fire, horns or no horns. Either the Covenant hasn\'t noticed, or it\'s waiting.',
  'There\'s a crater lake in the Rustwastes between Stonegate and Rustward, clear as glass. Don\'t drink it. Nobody who did will say why.',
  'Blackcomb soldiers have been seen as far north as Humming Hollow. The living hives are nervous. You can hear it in the hum.',
  'Squatter\'s Rest has a Karuk cook now. Best stew in the Flats, and nobody dares complain about the portions.',
  'A Covenant Warden threw down her flame rather than burn a Hollow. Last I heard, she was drinking in Crossroad.',
  'The overseers at Saltmere keep an Unchained leader in a cage by the Watch House, as a warning. If you ask me, it\'s a dare.',
  'There\'s a Hollow in a cage at Pyre\'s Watch, waiting for a holy day to be burned. They say it prays better than the Inquisitors.',
  'The Sky-Ship wreck out on the salt still gives up Maker parts. The Reavers from the Roost pick it over, so go armed.',
  'The carrion bats at the Roost, east of Brokenchain, can smell a wound from a long way off. They can\'t fly. They don\'t need to. They just walk until you stop.',
  'The War Chief at Redmesa swears he\'ll take the Field of Horns for good this year. He swears it every year.',
  'A Hollow in Rustward says something in the Maker\'s Heart calls its name at night. The Custodians tell it to be quiet.',
  'The one-eared Reaver boss at the Roost has told the same story for twenty years. The young ones are sick of it. Something will happen up there soon.',
  'They haul wood up to the Great Pyre in Cinderhold every morning. Funny thing: nobody ever seems to haul much ash back down.',
  'Dunehounds hunt the Flats in packs. You can\'t outrun them, so don\'t be the slowest.',
  'Bloodflies in the Mire won\'t kill you outright. The bleeding afterwards will. Bandage early.',
  'The Blades patrol the Harrow road day and night. Safe enough, if your papers are in order and your face isn\'t on a poster.',
  'Stonegate iron goes to the Concord garrison first and everyone else second. If you want good steel, befriend a smith, not a Lord.',
  'The Scorched Hand watch the ford by the Dreamleaf Fields. Cross it at night and you\'ll pay double, if you\'re lucky enough to be asked.',
  'A Delver at Glassfall swears she saw a Warden Prime standing in the door of the Glass Dome, just watching. It didn\'t come out. It didn\'t need to.',
  'The Iron Coin finally bought itself a town, out on the ash south of the Flats. Hardcoin, they call it. It came cheap, because nobody else wanted to live next door to the Mawkin.',
  'There\'s a Hollow station out past Glassfall called Relay Four. The machines stop there on the way to the Maker\'s Heart. The Delvers count them going in, and count again when they come out.',
  'The scrappers at Rivet swear the Fallen Walker twitched last spring. They also swear they were sober, which is how you know they weren\'t.',
  'Tithefield takes in penitents from all over the Emberlands. They go in for a season and come out grey.',
  'The best dreamleaf in the waste comes out of Deepleaf, somewhere in the western Mire. The Covenant would pay a fortune for the road in. The Hand would pay more to keep it lost.',
  'Ribshade charges a chit a cup for water and two for shade. Out in the Bone Sea, people pay both and say thank you.',
  'The Karuk at Cragfold will sell you a crag ram, but not a tame one. They say there\'s no such thing.',
  'The salt boilers at Brinewick ran out of fuel one winter and the pan fires went out. They still won\'t talk about the week after.',
  'A Delver team found the Sand Dome open last spring and went in. The dunes closed it again the next morning. Lantern Rest is still waiting for the wind to change.',
];

export const LINES = {
  tribute: [
    'This road belongs to the Dust Reavers. Pay the toll, or pay in blood.',
    'Hold it! Toll road. Cough up, and nobody gets hurt.',
    'Nice things you\'ve got. Share some with us, or we take all of it.',
    'Chits. Now. Or we cut them out of you.',
  ],
  hungry: [
    'Food! Give us food! Please!',
    'We haven\'t eaten in days. Give us something. Or we\'ll take it.',
    'Bread... anything... we\'re so hungry...',
  ],
  inquisitor: [
    'Halt! Your companions offend the Ember. Leave the Covenant\'s lands, or be cleansed.',
    'Abominations walk with you. The flame demands they burn.',
    'You travel with the unclean. Turn back now.',
  ],
  slaver: [
    'Lost, are we? Don\'t worry. The Chainhouse takes care of lost things.',
    'Strong arms, good teeth. You\'ll fetch a fine price.',
    'Nobody would miss you, out here. Nobody at all.',
  ],
};

export const BARKS: Pool = {
  attack: ['Die!', 'Have at you!', 'Come on then!', 'For the Horn!', 'Burn!', 'You\'re dead!', 'Get them!', 'Take this!', 'Here it comes!', 'On me!', 'Hold the line!', 'Now!'],
  hurt: ['Argh!', 'Ngh—', 'My arm!', 'I\'m bleeding!', 'That hurt!', 'Gah!', 'Ah! Blood!', 'Oof!', 'Not the face!', 'That\'ll scar.'],
  down: ['I can\'t... get up...', 'Help me...', 'No... not like this...', 'Tell them... I tried...', 'Just... a moment...', 'Don\'t leave me... for the bats...'],
  flee: ['Run!', 'I\'m out of here!', 'Not worth it!', 'Retreat!', 'Fall back!', 'Too many of them!', 'Every one for themselves!'],
  win: ['Ha! Stay down!', 'That\'s what you get.', 'Next!', 'Too easy.', 'Stay down this time.', 'Who\'s next?', 'Check their pockets.'],
  ember_attack: ['BURN, HERETIC!', 'The Ember judges you!', 'Into the fire!', 'Kneel to the flame!', 'Be cleansed!'],
  karuk_attack: ['HORN AND BLOOD!', 'Fight me properly!', 'A good death!', 'Stand and fight, small one!', 'Hah! Come!'],
  mawkin_attack: ['Meat! Fresh meat!', 'Hungry... so hungry...', 'Hold it down!', 'Drag it down!', 'Warm meat!'],
  reavers_attack: ['Should\'ve paid the toll!', 'Get their stuff!', 'Nobody passes free!', 'Toll\'s gone up!', 'Take the lot!'],
  greet_pass: ['Afternoon.', 'Watch yourself.', 'Hm.', 'Dusty day.', 'Stay out of trouble.', 'Keep walking.', 'Morning.', 'Evening.', 'Hot one today.', 'Mind the dust.'],
  concord_attack: ['In the name of the Houses!', 'Seize them!', 'For the Concord!'],
  chainhouse_attack: ['Take them alive! Alive sells!', 'Mind the teeth, they\'re worth money!', 'Shackles ready!'],
  thrum_attack: ['*CLICK-CLICK-CLICK*', 'For-the-Queen!', 'Many-strike-as-one!'],
  blackcomb_attack: ['*a screeching hum*', 'Queen-sings! Queen-sings!', '*CLICK* KILL *CLICK*'],
  hollows_attack: ['DEFENSIVE PROTOCOL.', 'You were warned.', 'Hostility noted. Responding.'],
  wardens_attack: ['NOTHING MAY ENTER.', 'INTRUDER. REMOVE.', 'ACCESS DENIED.'],
  scorched_attack: ['The Hand sends its regards!', 'Should\'ve minded your business!', 'Into the mud with them!'],
  starvelings_attack: ['Food! They have food!', 'Get the packs!', 'We eat tonight!'],
  unchained_attack: ['For every chain!', 'No more masters!', 'Break them!'],
  ironcoin_attack: ['Earning our pay!', 'Nothing personal!', 'Company, forward!'],
  drifters_attack: ['Watch! To me!', 'Not in our town!', 'Break their heads!'],
  delvers_attack: ['Protect the finds!', 'Mind the relics!', 'Back to the lamps!'],
  mistcrawlers_attack: ['...', '*a soft, wet breath*'],
  karuk_hurt: ['Hah! Good hit!', 'More!', 'That one I felt!'],
  hollows_hurt: ['Damage sustained.', 'Plating breached.', 'That will need repair.'],
  wardens_hurt: ['DAMAGE NOTED.', 'INTEGRITY FALLING.'],
  karuk_win: ['A good fight!', 'Get up when you are ready. I will wait.', 'Hah! Again, sometime.'],
  ember_win: ['The flame is satisfied.', 'Ash to ash.', 'Judged.'],
  mawkin_win: ['Drag it home!', 'Meat for the fire!', 'Tie it. Carry it.'],
  reavers_win: ['Strip them.', 'Toll paid in full.', 'Told you it was a toll road.'],
  wardens_win: ['THREAT REMOVED.', 'RESUMING WATCH.'],
};

export function bark(kind: string, faction?: string): string | null {
  const pool = (faction && BARKS[`${faction}_${kind}`]) || BARKS[kind];
  return pool ? S.rng.pick(pool) : null;
}
