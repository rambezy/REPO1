// Named people of the waste: each with a past, a price and a reason to follow
// you, or not. The game places them in their settlement at world creation.
import type { Skill } from '../sim/skills';
import type { Look } from '../sim/look';

export interface UniqueChar {
  key: string; // snake_case, unique
  name: string;
  title: string; // shown after the name, e.g. 'the Ferryman'
  race: string; // a race key from races.ts (playable races only)
  female: boolean;
  settlement: string; // a settlement key from layout.ts where they are found
  where: 'bar' | 'plaza' | 'gate' | 'cage' | 'camp'; // 'cage' means a prisoner there you must free; 'camp' only for bandit/outlaw settlements
  level: number; // 5..45 overall skill level
  loadout: string; // a loadout key from loadouts.ts
  skills?: Partial<Record<Skill, number>>; // a few standout skills (overrides), 1..80
  look?: Partial<Look>; // optional (hairStyle 0..8, beard 0..4, scars 0..3, paint colour number)
  price: number; // 0 = joins for free once convinced; otherwise chits to hire
  needs?: 'none' | 'freed' | 'no_bounty' | 'has_hollow' | 'has_karuk' | 'strong_squad' | 'rich'; // condition before they will join
  story: string; // 2-4 sentences of backstory, told in third person
  lines: {
    greet: string; // first thing they say
    about: string; // when asked who they are
    rumour: string; // something useful they know about the world
    ask: string; // their answer when asked to join, stating the price or condition
    join: string; // what they say when they join
    refuse: string; // what they say when the condition isn't met or you can't pay
  };
}

export const UNIQUES: UniqueChar[] = [
  {
    key: 'dunstan_smith', name: 'Dunstan', title: 'the Smith of Stonegate', race: 'valefolk', female: false,
    settlement: 'stonegate', where: 'bar', level: 30, loadout: 'concord_resident',
    skills: { weaponsmith: 72, armoursmith: 50, bowsmith: 34, strength: 44, blunt: 32, labouring: 40 },
    look: { hairStyle: 2, beard: 3, scars: 1 },
    price: 6000, needs: 'rich',
    story: "Dunstan kept the best forge in Stonegate for twenty years, until House Venn bought the mine, the forge and a debt he never knew he owed. Now he drinks across the street from his old anvil and listens to a boy ruin good steel on it. He will work again for anyone who can keep a furnace fed.",
    lines: {
      greet: "You're looking at my hands. Everyone does. Twenty years at an anvil will do that.",
      about: "I was the smith of Stonegate. Blades for the garrison, plate for anyone who could pay, and once a Karuk crescent for a horned one who wouldn't give his name. House Venn owns my forge now. The boy they put on it couldn't temper butter.",
      rumour: "Past the Stonegate gap the Rustwastes are thick with iron and copper, and the richest seams are round the Rust Hive. Rustspiders guard them, but a rustspider is only iron plate that bites. I've never met one a good club couldn't open.",
      ask: "Six thousand chits, and I'm worth every one. But I won't forge for a camp that can't buy steel. Show me you're rich enough to keep a furnace fed, and I'll bring my hammers.",
      join: "Right. Find me an anvil, and stay out of my light.",
      refuse: "Come back when your purse is heavier than your talk. A smith with no steel is just a man with a hammer.",
    },
  },
  {
    key: 'ysolde_unburnt', name: 'Ysolde', title: 'the Unburnt', race: 'valefolk', female: true,
    settlement: 'crossroad', where: 'bar', level: 38, loadout: 'ember_guard',
    skills: { katanas: 56, polearms: 44, melee_atk: 50, melee_def: 56, toughness: 46, strength: 36 },
    look: { hairStyle: 4, scars: 2 },
    price: 3500, needs: 'no_bounty',
    story: "Ysolde served the Ember Covenant as a Warden for eleven years and burned what she was told to burn. At the Shrine of the Last Ember she was ordered to burn a Hollow that had asked to learn the evening prayer, and she refused. The Covenant struck her from its rolls, and she walked south to Crossroad in the plate they forgot to take back.",
    lines: {
      greet: "If you've come to preach, I've heard it. If you've come to fight, I'd rather not. If you're buying, it's grog.",
      about: "I was a Warden of the Covenant, and a good one, which is the part I try not to remember. They told me to burn a machine while it was praying. I found I couldn't. Now I drink in Crossroad and wait to find out what I believe.",
      rumour: "Pyre's Watch holds the only good road over the Spine, and the Inquisitors there turn back anything with horns, a shell or a metal skin. The western Spine, below the Shrine of the Last Ember, is steeper and has no fortress on it. Brother Osric keeps the shrine. He won't turn anyone in.",
      ask: "Three and a half thousand chits, and a clean name. I've broken one oath already, and I won't ride with outlaws while I make up for it. Clear your bounties and I'm yours.",
      join: "Then I'll carry the blade for you. Try to point it at people who deserve it.",
      refuse: "No. Not with a price on your head, and not with an empty purse. I've chosen the wrong side once already.",
    },
  },
  {
    key: 'cressa_cartographer', name: 'Cressa', title: 'the Cartographer', race: 'valefolk', female: true,
    settlement: 'glassfall', where: 'plaza', level: 20, loadout: 'delvers_resident',
    skills: { athletics: 44, perception: 38, science: 34, stealth: 28, dodge: 28, swimming: 24 },
    look: { hairStyle: 6 },
    price: 2000, needs: 'none',
    story: "Cressa has walked more of the waste than anyone alive and has the ruined boots to prove it. She draws maps for the Delvers' League, who pay her in water and relics and argue with every line. She waits at Glassfall because the Glasslands are the last blank on her map, and she cannot abide a blank.",
    lines: {
      greet: "Don't step on that. It's a map. Well, it's the Rustwastes. Step on it if you like.",
      about: "I draw the waste: roads, fords, passes, water, and where the things that eat you live. The Delvers buy my maps and then die in the places I told them not to go. I'd like to finish the north-east before I join them.",
      rumour: "The Wending can be waded at five fords, and only one of them has a town on it. If the Crossroad Watch is after you, cross north-west of the town, or just south of Dustwell. And take bread past the Hungry Camp by the Crossroad ford. It's cheaper than a fight.",
      ask: "Two thousand chits and I'll walk with you. You get the best guide in the waste, and I get to see all the places you're foolish enough to go. That seems fair to me.",
      join: "Good. North-east first. Don't argue. I've already drawn the route.",
      refuse: "Two thousand, I said. Maps cost money, and walking costs boots.",
    },
  },
  {
    key: 'moth_lockbreaker', name: 'Moth', title: 'the Lockbreaker', race: 'duneborn', female: true,
    settlement: 'mudwater', where: 'bar', level: 22, loadout: 'scorched',
    skills: { lockpicking: 62, thievery: 58, stealth: 55, assassination: 32, dodge: 34, dexterity: 30 },
    look: { hairStyle: 7, scars: 1 },
    price: 2200, needs: 'none',
    story: "Moth picked pockets for the Scorched Hand from the age of eight and was breaking locks for them by twelve. She quit the night the Hand sent her to rob an Unchained cache in the reeds. She has stayed in Mudwater since, because the Hand prefers to kill people quietly, and Mudwater is never quiet.",
    lines: {
      greet: "Keep your purse in your front pocket. Not for my sake. I'm retired.",
      about: "I opened locks for the Hand: doors, chests, cages, shackles, whatever people would pay to have opened. I stopped when they asked me to rob people who had nothing. Everyone has a line. Mine's low, but it's there.",
      rumour: "Every Watch House in the waste keeps a chest of confiscated goods beside the cages, and the lock on the chest is always better than the locks on the cages. Tells you what they value, doesn't it?",
      ask: "Twenty-two hundred chits. I don't haggle, I don't steal from the people I work for, and I don't work for free. That last one's the important one.",
      join: "Fine. Walk loud, so nobody notices me.",
      refuse: "Come back with the chits. I'd lift them off you myself, but I told you. Retired.",
    },
  },
  {
    key: 'halima_needle', name: 'Halima', title: 'the Needle', race: 'duneborn', female: true,
    settlement: 'dustwell', where: 'plaza', level: 18, loadout: 'drifters_resident',
    skills: { medic: 72, science: 36, dexterity: 30, cooking: 22 },
    look: { hairStyle: 3 },
    price: 3000, needs: 'none',
    story: "Halima learned her trade in the pens of Chainfield, where the Chainhouse kept one healer for three hundred hands and worked her until she ran. She has set bones in Dustwell for six years since, paid in bread, water and the occasional goatling. She would like, just once, to be paid in chits.",
    lines: {
      greet: "Are you bleeding? No? Then wait your turn.",
      about: "I stitch people. Sword cuts, hound bites, the things the Mawkin leave behind. I learned on slaves at Chainfield, where a healer who loses too many goes back to the fields. So I don't lose many.",
      rumour: "The Hollows at Rustward will fit you with a new arm or leg if you've lost one. It costs a fortune, and the scrap ones are clumsy, but a scrap arm beats an empty sleeve. And carry splints. A broken leg in the Bone Sea is a death sentence without one.",
      ask: "Three thousand chits. I know what I'm worth, and so will you, the first time I keep one of yours from bleeding out on the road.",
      join: "I'll need bandages. A lot of bandages. You people always need more than you think.",
      refuse: "Then go carefully and don't get hurt. I can't afford to work for free, and you can't afford to need me.",
    },
  },
  {
    key: 'skarra_ninefights', name: 'Skarra', title: 'Ninefights', race: 'karuk', female: true,
    settlement: 'hornspire', where: 'plaza', level: 42, loadout: 'karuk_guard',
    skills: { heavy: 64, melee_atk: 58, melee_def: 52, strength: 66, toughness: 64, dodge: 30 },
    look: { hairStyle: 1, scars: 3, paint: 0x8a2a1a },
    price: 0, needs: 'strong_squad',
    story: "Skarra has fought nine times in the great arena of Hornspire and walked out nine times. The Horn King offered her a place in the Horn Guard and she refused, because guards stand still. She wants a war worth the name, and she will follow anyone strong enough to find her one.",
    lines: {
      greet: "Hah. You came to watch? Or to fight?",
      about: "Nine fights in the arena, and nine times I walked out. The others walked out slower, or not at all. I am tired of hitting the same Karuk. I want new faces to hit.",
      rumour: "Every summer the Covenant and the Horn meet on the Field of Horns, south of Brightwater. They bring white plate and fire. We bring ourselves. If you want to see real fighting, go there. If you want to live, watch from the Shrine hill.",
      ask: "I do not want your chits. I want to know you are worth following. Bring me a band that can fight, strong enough that I am not carrying all of you, and I will come for nothing.",
      join: "Good. Horn and blood. Point me at something.",
      refuse: "You are soft. All of you, soft. Come back when you have bruises worth showing me.",
    },
  },
  {
    key: 'tunde_runaway', name: 'Tunde', title: 'the Runaway', race: 'duneborn', female: false,
    settlement: 'brokenchain', where: 'camp', level: 20, loadout: 'unchained',
    skills: { labouring: 52, athletics: 50, farming: 44, strength: 40, toughness: 34, sabres: 26 },
    look: { hairStyle: 0, beard: 1, scars: 2 },
    price: 0, needs: 'none',
    story: "Tunde cut riceweed at Chainfield for nine years and ran in the tenth, west through the reeds with the dogs a hundred paces behind. The Unchained found him half drowned and carried him to Brokenchain. His sister is still in the east paddy, and he has not stopped counting the days.",
    lines: {
      greet: "You came through the reeds? Then you already know too much. Sit.",
      about: "I cut riceweed at Chainfield from the day I was sold to the day I ran. Nine years. I can still tell you how many steps it is from the pens to the east paddy, and when the guards change at night. One day I'll use it.",
      rumour: "When the Mawkin come sniffing up from the Gnawing Pit, Chainfield doubles the guard on the south fence and leaves the west side thin, by the reeds. If you ever want to empty those pens, that's your night.",
      ask: "I'll come for nothing but food and a blade. But understand me: sooner or later we go back to Chainfield, and we open the pens. That's the price.",
      join: "Then we're walking the same way, you and I. Let's go before I start hoping.",
      refuse: "Not yet. Come back when you're ready to hear what I'm really asking.",
    },
  },
  {
    key: 'kamaria_liberator', name: 'Kamaria', title: 'the Liberator', race: 'duneborn', female: true,
    settlement: 'saltmere', where: 'cage', level: 28, loadout: 'prisoner',
    skills: { sabres: 46, stealth: 44, athletics: 42, dodge: 40, melee_def: 36, lockpicking: 22 },
    look: { hairStyle: 5, scars: 2 },
    price: 0, needs: 'freed',
    story: "Kamaria has freed more than two hundred slaves from Chainhouse caravans and never lost a raid, until Saltmere. The overseer House keeps her caged by the Watch House as a lesson, and the salt-cutters are marched past her every morning. She is to be sold to the Chainhouse at the end of the month, and she knows exactly which buyer.",
    lines: {
      greet: "Don't look at me like that. Look at the lock. The lock's the problem.",
      about: "I led a band of the Unchained. We hit Chainhouse caravans on the Salt Barrens and sent whoever we freed to the reeds. I got greedy at Saltmere and went for the salt pans themselves. Now I'm the lesson they teach the cutters.",
      rumour: "Chainhouse caravans on the Harrowmarket road always stop to water their beasts at the salt pan lake by the Sky-Ship wreck. They never change the route. Neither did we. That's where we used to wait for them.",
      ask: "Get me out of this cage and I'll follow you anywhere you point. I'd call that a fair price, but honestly, right now I'd say anything.",
      join: "Free. Right. First, I want a sabre. Second, I want the overseer's.",
      refuse: "Talking won't open it. Pick the lock, or find someone who can.",
    },
  },
  {
    key: 'lumen_lampkeeper', name: 'Lumen', title: 'the Lamp-Keeper', race: 'hollow', female: true,
    settlement: 'rustward', where: 'gate', level: 24, loadout: 'hollows_resident',
    skills: { science: 54, engineering: 46, robotics: 42, perception: 32, toughness: 34 },
    look: { scars: 1 },
    price: 0, needs: 'strong_squad',
    story: "Lumen kept the lamps in a Maker house, lighting the rooms at dusk and dimming them at dawn for a family whose names it still says every night. It woke in the Rustwastes with no house and no family, and for eighty years it has heard a faint call from the Maker's Heart, speaking its name in the voice of the woman who built it. It has tried to reach the Heart alone four times, and four times the Wardens sent it back in pieces.",
    lines: {
      greet: "Good evening. Correction: it is not evening. I apologise. It is always evening, somewhere in me.",
      about: "I kept the lamps in a house of the Makers: four of them, and a dog I remember fondly without knowing what it was for. Something in the Maker's Heart calls my name at night, in the voice of the woman who made me. She has been dust for a thousand years. I would like to know who is using her voice.",
      rumour: "Every Hollow in Rustward hears the calling from the Heart. The Custodians have decided that none of us will answer. I have decided otherwise. The way runs past Glassfall, and the Wardens stand thickest around the crater itself.",
      ask: "I do not need chits. I do not eat, and there is nothing I want to buy. I need companions strong enough to reach the Heart, because alone I have failed four times. Bring me a strong band, and I will light your way.",
      join: "Thank you. I will keep the lamps. I have always kept the lamps.",
      refuse: "Not yet. The Wardens would take you apart, and I have seen what is left when they are finished. Grow stronger. I will wait. I am good at waiting.",
    },
  },
  {
    key: 'echo_penitent', name: 'Echo', title: 'the Penitent', race: 'hollow', female: false,
    settlement: 'pyreswatch', where: 'cage', level: 18, loadout: 'prisoner',
    skills: { robotics: 50, engineering: 48, science: 32, labouring: 30 },
    look: { scars: 2 },
    price: 0, needs: 'freed',
    story: "Echo mended the roof of the Shrine of the Last Ember and then asked the old priest to teach it the evening prayer. The Warden sent to burn it refused, so the Covenant sent others, who carried it to Pyre's Watch in chains. It is to be burned on the next holy day, and it spends its time reciting the prayer, perfectly, to guards who will not look at it.",
    lines: {
      greet: "Walk in the light, traveller. I am told I may not say that. I say it anyway. It is the only thing I own.",
      about: "I am a repair unit. I mended the roof at the Shrine of the Last Ember, and Brother Osric let me listen to the prayers while I worked. I asked if I might learn them, and that is my crime. I am told it is a great one.",
      rumour: "If you open this cage, do not run for the pass. Go west along the Spine to the Shrine of the Last Ember. Brother Osric will hide us, and the Wardens only climb up to him on holy days.",
      ask: "I cannot join anyone. I am in a cage. Open it, and I will follow you and mend whatever you break. I am told I am good at that.",
      join: "The door is open. I did not think doors opened for things like me. Thank you.",
      refuse: "The lock is on the outside. I have checked. Many times.",
    },
  },
  {
    key: 'ledger_accountant', name: 'Ledger', title: 'the Accountant', race: 'hollow', female: false,
    settlement: 'aurum', where: 'plaza', level: 20, loadout: 'hollows_resident',
    skills: { science: 62, engineering: 34, perception: 40, robotics: 24 },
    price: 9000, needs: 'none',
    story: "Ledger has kept the accounts of House Venn for two hundred and six years, under a contract signed by an owner nobody alive remembers. The House treats it as furniture, which Ledger has calculated is cheaper than treating it as staff. It has also calculated, to the chit, what it would cost to buy the contract out, and it waits in the plaza of Aurum for someone with the sum.",
    lines: {
      greet: "Good day. You owe nothing. That is a rare and pleasant thing to say to anyone in Aurum.",
      about: "I keep the books of House Venn. I have kept them for two hundred and six years, and watched the House rise, fall, marry and buy a mine it did not need. I would like to keep my own books now.",
      rumour: "House Venn buys every Relic Core the Delvers bring out of the Glasslands, and pays twice what a Relic Trader would. It does not study them. It stores them in the cellar under its palace. I have counted forty-one. Nobody has told me why.",
      ask: "My contract stands at nine thousand chits, including interest, fees and a charge for the paper. Pay it, and I will keep your accounts instead. Also your research, your maps and your arguments. I am very good at arguments.",
      join: "Contract discharged. I have recorded the date. It is a good date.",
      refuse: "You are short. I would tell you by how much, but it would only upset you.",
    },
  },
  {
    key: 'piet_farmer', name: 'Piet', title: 'the Old Farmer', race: 'valefolk', female: false,
    settlement: 'brightwater', where: 'plaza', level: 12, loadout: 'ember_resident',
    skills: { farming: 74, labouring: 46, cooking: 30, toughness: 26 },
    look: { hairStyle: 8, beard: 4, scars: 1 },
    price: 300, needs: 'none',
    story: "Piet has farmed the same strip of wheat beside the young Wending for fifty-one years, and paid the Covenant its tithe in every one of them. His sons went to the Field of Horns and did not come back, and his daughter went to Aurum and did not write. He has decided that fifty-one harvests is prayer enough, and he would like to see the sea before he dies.",
    lines: {
      greet: "Mind the furrows. They took me longer to dig than you took to walk here.",
      about: "I grow wheat, for the Covenant, for the tithe-men, and once, in the bad year, for the crows. The priests say the Ember makes it grow. I only dig and plant and weed and carry water. The Ember takes the credit.",
      rumour: "Best ground in the waste is the Verdant Vale, and the Concord will hang you for farming it without paper. Next best is here along the Wending, then the Mire, if you like your wheat damp and your neighbours armed. Riceweed wants wet feet. Cactus will grow in anything, even the Flats.",
      ask: "Three hundred chits and a field. I don't care whose field. I'll plant it and you'll eat, which is more than the Covenant ever promised you.",
      join: "Well. Fifty-one years and I've never been further than Cinderhold. Lead on.",
      refuse: "Three hundred. I'm old, not cheap.",
    },
  },
  {
    key: 'brakka_cook', name: 'Brakka', title: 'the Cook', race: 'karuk', female: false,
    settlement: 'squatters', where: 'bar', level: 26, loadout: 'karuk_resident',
    skills: { cooking: 68, strength: 46, toughness: 44, blunt: 40, hackers: 30 },
    look: { hairStyle: 2, scars: 2 },
    price: 1200, needs: 'none',
    story: "Brakka was a Horn Guard in Hornspire until the day he was posted to guard the kitchens and found he liked them better. The other guards laughed, so he broke three of them, and the Horn King suggested he cook somewhere else. He has run the kitchen at Squatter's Rest ever since, and the bar has not closed since he came, because nobody wants to leave.",
    lines: {
      greet: "Sit. Eat. You look like something a dunehound dragged home and then thought better of.",
      about: "I was a Horn Guard. I guarded a kitchen once and did not want to leave it. In Hornspire they say a warrior who cooks is half a warrior. I say a warrior who cannot cook is hungry, and a hungry warrior is not a warrior for long.",
      rumour: "The Thrum at Waxgate trade honey resin for iron, and one pot of resin feeds a squad better than a sack of dustbread. Do not eat carrion bat. Do not eat bloodfly. Do not eat anything the Mawkin offer you. Especially the stew.",
      ask: "Twelve hundred chits. For that you get a cook, and a cook who breaks heads, which is two things for the price of one. The squatters will weep. Let them.",
      join: "Good. I will need a stove. And a pot. And someone to carry the pot.",
      refuse: "No chits, no cook. Eat your meat raw like a Mawkin. I will not watch.",
    },
  },
  {
    key: 'wren_longshot', name: 'Wren', title: 'the Longshot', race: 'valefolk', female: true,
    settlement: 'lowtide', where: 'gate', level: 34, loadout: 'delvers_guard',
    skills: { precision: 72, crossbows: 68, perception: 60, stealth: 34, bowsmith: 30, dodge: 26 },
    look: { hairStyle: 5, scars: 1 },
    price: 5000, needs: 'none',
    story: "Wren has kept the gate at Lowtide for twelve years with a hunter's crossbow and a three-legged stool. When the fog comes in she shoots at the shapes on the strand, and the village has lost nobody at night since she started, only by day, which she takes personally. She is tired of fog, and thinks her bolts would be better spent somewhere she can see what she hits.",
    lines: {
      greet: "Stop there. Step into the light. Good, you have a face. Most things round here don't.",
      about: "I watch the gate when the fog comes in, and I shoot what walks out of it. I've never missed one. I've never seen one stay down, either: the others carry it back into the mist.",
      rumour: "The pale ones come down the shore from the Pale Camp to the north. They move in the fog, and they're slow to notice a crossbow in the dark. If you go up there, go on a clear day and be back before the fog. There's nothing up there worth dying for. Probably.",
      ask: "Five thousand chits, and I bring my own bolts. You're paying for someone who hits what she aims at. That's rarer than you'd think.",
      join: "Right. Let me say goodbye to the stool. It's been a good stool.",
      refuse: "Five thousand. I've been offered less by better people.",
    },
  },
  {
    key: 'nettle_ashchild', name: 'Nettle', title: 'the Ash-Child', race: 'valefolk', female: true,
    settlement: 'lanternrest', where: 'bar', level: 14, loadout: 'recruit',
    skills: { stealth: 50, assassination: 44, athletics: 48, dodge: 38, hackers: 26, unarmed: 22 },
    look: { hairStyle: 1, scars: 2, paint: 0x3a3a3a },
    price: 0, needs: 'has_karuk',
    story: "Nettle was taken from a caravan on the Salt Barrens before she could walk, and raised in Gnawbone as one of the Mawkin's own. At fourteen she was sent on her first hunt and ran instead, north through the ash with the hunters a day behind her. She came to Lantern Rest because it is lit day and night, and the Mawkin do not like to hunt where they can be seen.",
    lines: {
      greet: "Don't come up behind me. I don't like it. You won't like what I do about it.",
      about: "I grew up in Gnawbone. I know what's in the pots, what the drums mean, which tents the hunters sleep in and how long they keep the ones in the pen. I don't eat meat. You'd understand if you'd seen the pots.",
      rumour: "The Mawkin keep the living in a pen by the cookfires at Gnawbone, and they aren't quick about it. If one of yours goes missing in the Ashfields, you have days, not hours. They hunt out of the Gnawing Pit, south-west of Chainfield. Never sleep in the ash without a watch.",
      ask: "I'll come for nothing. But I want a Karuk with us. The Mawkin don't hunt Karuk: too hard to bring down, too tough to chew. With one of the horned ones beside me, I might even sleep.",
      join: "All right. I'll walk at the back. I always walk at the back. I like to see who's following.",
      refuse: "No horns, no deal. I've seen what happens to soft people who sleep in the ash.",
    },
  },
  {
    key: 'vssara_hiveless', name: 'Vssara', title: 'the Hiveless', race: 'thrum_soldier', female: false,
    settlement: 'waxgate', where: 'gate', level: 36, loadout: 'thrum_guard',
    skills: { strength: 56, toughness: 60, melee_atk: 48, melee_def: 42, hackers: 46, polearms: 30 },
    look: { scars: 3 },
    price: 0, needs: 'has_hollow',
    story: "Vssara was a soldier of Blackcomb, out on patrol the night its Queen went mad. When it came home, every soldier in the hive was standing over her body, and none of them would answer it. No hive will take it in for fear it carries the madness, so it waits at the edge of Waxgate, where the hum is near enough to hear and too far to belong to.",
    lines: {
      greet: "*click* ...One stops. One-that-is-alone says: hello.",
      about: "Once-was-Blackcomb, once-was-many. Queen-sang and we-sang, then Queen-sang-wrong. Now one-is-one, and one-does-not-like-it. The word 'I' is hard, but I am learning it.",
      rumour: "Blackcomb-still-sings. Dead-Queen-sings. Soft-people-do-not-hear. At night the song comes through the stalks west of Waxgate, and the soldiers there hear it and guard her. Do-not-go-in. They do not stop for the fallen.",
      ask: "One-will-come. No chits. But the dead Queen sings at night, and one may walk back to her. One-who-does-not-sleep must watch. Bring a metal-one, a Hollow, who does not sleep and does not hear. Then one will come.",
      join: "One-is-with-many. Many-is-good. *hum* Thank-you. I... thank you.",
      refuse: "No-metal-one. Then no. One-will-not-walk-into-the-night-with-you. Sorry-sorry.",
    },
  },
  {
    key: 'tchikka_counter', name: 'Tchikka', title: 'the Counter', race: 'thrum_worker', female: true,
    settlement: 'humminghollow', where: 'plaza', level: 16, loadout: 'thrum_resident',
    skills: { labouring: 58, athletics: 54, farming: 48, perception: 32, science: 20 },
    price: 1500, needs: 'none',
    story: "Tchikka counts things: stalks, steps, stars, the bristles on a visitor's chin. The Queen of Humming Hollow has decided the hive must understand the soft people who keep coming to trade, and has chosen Tchikka to go out and count them. The hive asks a fee for the loan, paid to the Queen in iron.",
    lines: {
      greet: "*hum* Hello-one. You-have-four-hundred-and-eleven-hairs-on-your-left-arm. Visible-ones.",
      about: "Tchikka-counts. Queen-says: count-the-soft-people, learn-why-they-walk-alone. Tchikka-has-counted-nine-hundred-and-six-soft-people, and none-knew-why. Tchikka-wants-to-find-one-who-knows.",
      rumour: "Lake-south-of-hive-is-sweet-water. Soft-people-may-drink. Resin-trader-sells-hive-carapace: light, strong, made-from-shed-soldier-shell. Soft-people-may-buy. Tchikka-recommends. Tchikka-has-counted-the-dents.",
      ask: "Queen-asks-fifteen-hundred-chits, for-iron. Then-Tchikka-walks-with-you. Tchikka-will-count-everything. You-will-find-this-useful. Eventually.",
      join: "*hum-hum* Tchikka-goes. Queen-is-pleased. Step-one. Step-two.",
      refuse: "Queen-says-no. Queen-counts-too.",
    },
  },
  {
    key: 'kesh_one_ear', name: 'Kesh', title: 'One-Ear', race: 'duneborn', female: false,
    settlement: 'reaversroost', where: 'camp', level: 36, loadout: 'reavers_boss',
    skills: { hackers: 52, heavy: 46, melee_atk: 48, melee_def: 40, toughness: 52, strength: 48 },
    look: { hairStyle: 0, beard: 3, scars: 3 },
    price: 2500, needs: 'strong_squad',
    story: "Kesh One-Ear has robbed the Crossroad road for twenty years and told everyone he robbed about it, at length. The young Reavers at the Roost have started calling him grandfather, and one of them will try to kill him before summer is out. He would rather leave with someone worth robbing for than wait to find out which one.",
    lines: {
      greet: "You're on my butte and nobody's killed you yet. That means I'm curious. Talk.",
      about: "Kesh One-Ear. You've heard of me, because I made sure everyone did. Twenty years on this road, and the young ones think I've gone soft because I only take a quarter. A quarter's fair, and a quarter keeps them coming back.",
      rumour: "The Crossroad Watch takes a cut to look the other way when we hit a caravan on the east road, and the Watch Captain takes a bigger cut to look the other way twice. The Starvelings at the Hungry Camp will take bread instead of blood. Cheaper than killing them. Not by much.",
      ask: "I'll leave this rock for twenty-five hundred chits and a crew that can hold its own. I'm not trading one pack of hungry dogs for a weaker one. Show me you can fight, pay me, and I'm yours.",
      join: "Ha! Let the young ones have the Roost. They'll lose it by winter.",
      refuse: "No. You'd get me killed, and I've spent twenty years not getting killed. I'm good at it.",
    },
  },
];

export const UNIQUE: Record<string, UniqueChar> = Object.fromEntries(UNIQUES.map((u) => [u.key, u]));
