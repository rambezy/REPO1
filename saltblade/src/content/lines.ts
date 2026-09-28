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
  drifters: ['What do you want?', 'Keep your hands where I can see them.', 'Another drifter. Welcome to nowhere.', 'If you\'re buying, talk. If not, walk.', 'Dust on the wind today. Always is.', 'You look like you\'ve walked a long way.', 'Don\'t start trouble and there won\'t be any.'],
  concord: ['Bow your head when you address a subject of the Concord.', 'State your business, and be brief.', 'Contracts, coin and order. That is the Concord.', 'Mind your step. The Lords see everything.', 'You smell of the road.'],
  chainhouse: ['Looking to buy? Or looking to be bought?', 'Strong back on you. Good price, that.', 'The Chainhouse is licensed by the Lords. Remember that.'],
  ember: ['The Ember sees you, stranger.', 'Walk in the light, or do not walk here at all.', 'May the flame judge you kindly.', 'Have you come to confess?', 'The Undying Ember burns for the faithful.'],
  karuk: ['Hah. Small one. Do you fight?', 'Speak plainly or not at all.', 'Show me your hands. Callouses mean honesty.', 'The Horn King welcomes the strong.', 'You walk like prey.'],
  thrum: ['*hum* ...Visitor. The Queen permits.', 'We-are-many. You-are-one. Hello, one.', '*click* *click* Trade? Trade is good.', 'Sweet resin. Sweet resin for iron?'],
  delvers: ['Found anything interesting out there?', 'Mind the lamps. They\'re older than your grandmother.', 'If you\'ve got relics, we\'re buying.', 'Another survivor of the Bone Sea. Sit, drink.'],
  hollows: ['GREETINGS. STATE PURPOSE.', 'You are organic. You are welcome, conditionally.', 'Our records do not include you. That is acceptable.', 'Maintenance is life. Do you require maintenance?'],
  unchained: ['You\'re not Chainhouse. Good.', 'Every chain broken is a life returned.', 'Speak quietly. The hunters have ears everywhere.'],
  scorched: ['You lost, friend? Mudwater doesn\'t get lost people back.', 'The Hand sees all. Mind what you do with yours.', 'Leaf? Don\'t say I didn\'t offer.'],
  ironcoin: ['Coin first. Talk after.', 'Iron Coin. We fight for whoever pays.', 'Hiring? We\'re the best money can buy. Literally.'],
  reavers: ['Well, well. Look what walked onto our road.', 'Toll road, this. Didn\'t you know?'],
  starvelings: ['Food... do you have food...'],
  mawkin: ['*sniffs* ...meat.'],
  default: ['Hm?', 'Yes?', 'What.', 'Can I help you?'],
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
  crossroad: ['Four roads, one ford, and more thieves than both. The Watch keeps order, for a price.', 'Best bar in the Flats is here. Only bar in the Flats, some days.', 'The Reavers camp east of the walls. They leave the town alone. Mostly.'],
  aurum: ['The golden city. Keep your eyes down and your purse closed.', 'The Lords sit in the palace and count the world.'],
  harrowmarket: ['Anything can be bought here. Anything, and anyone.', 'The Iron Coin keeps a hall here. Mercenaries, if you can pay.'],
  cinderhold: ['The Great Pyre has burned for six hundred years. It will burn for six hundred more.', 'Non-humans are not welcome in the white city. You understand.'],
  hornspire: ['Fight in the arena, and the Karuk will respect you. Lose, and they will respect your corpse.', 'The Horn King sits in the great hall. Few are invited.'],
  mudwater: ['The Scorched Hand runs this town. Remember that and you\'ll live.', 'Leaf money built these stilts.'],
  rustward: ['The machines keep the old lights burning here.', 'If you need a new arm, this is where you buy it.'],
  lanternrest: ['Delvers dig the Bone Sea for the past. Some of them even come back.'],
  chainfield: ['Keep walking unless you want to work the fields.'],
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
  attack: ['Die!', 'Have at you!', 'Come on then!', 'For the Horn!', 'Burn!', 'You\'re dead!', 'Get them!', 'Take this!'],
  hurt: ['Argh!', 'Ngh—', 'My arm!', 'I\'m bleeding!', 'That hurt!', 'Gah!'],
  down: ['I can\'t... get up...', 'Help me...', 'No... not like this...'],
  flee: ['Run!', 'I\'m out of here!', 'Not worth it!', 'Retreat!'],
  win: ['Ha! Stay down!', 'That\'s what you get.', 'Next!', 'Too easy.'],
  ember_attack: ['BURN, HERETIC!', 'The Ember judges you!', 'Into the fire!'],
  karuk_attack: ['HORN AND BLOOD!', 'Fight me properly!', 'A good death!'],
  mawkin_attack: ['Meat! Fresh meat!', 'Hungry... so hungry...', 'Hold it down!'],
  reavers_attack: ['Should\'ve paid the toll!', 'Get their stuff!', 'Nobody passes free!'],
  greet_pass: ['Afternoon.', 'Watch yourself.', 'Hm.', 'Dusty day.', 'Stay out of trouble.', 'Keep walking.'],
};

export function bark(kind: string, faction?: string): string | null {
  const pool = (faction && BARKS[`${faction}_${kind}`]) || BARKS[kind];
  return pool ? S.rng.pick(pool) : null;
}
