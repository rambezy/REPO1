// Books of the waste: scripture, ledgers, letters, field guides and the odd
// Maker fragment. Some tell the truth. Some believe they do.

export interface LoreBook {
  key: string; // snake_case, unique
  title: string;
  author: string; // an in-world author, or 'Unknown'
  kind: 'history' | 'field guide' | 'scripture' | 'journal' | 'technical' | 'poetry' | 'tale' | 'ledger' | 'letter';
  value: number; // price in chits, 60..3000 (rare Maker texts dearer)
  science: number; // 0..4: science skill gained the first time someone reads it
  rare?: boolean; // only in ruins and tech shops
  factions?: string[]; // faction keys whose shops might stock it
  text: string[]; // paragraphs, 140 to 380 words in total per book (poems use \n between lines)
}

export const BOOKS: LoreBook[] = [
  // ---------------------------------------------------------------- the Sundering, as the powers tell it
  {
    key: 'judging_sun', title: 'The Book of the Judging Sun', author: 'The Scribes of the Great Pyre', kind: 'scripture',
    value: 150, science: 0, factions: ['ember'],
    text: [
      "In the first age the Makers were given the fire of the sun to warm their houses and light their roads, and it was not enough for them. They raised towers to reach it and machines to hold it, and in the far north-east they built a second sun of their own, in the place the Delvers now call the Maker's Heart.",
      "The Undying Ember looked upon the false sun and judged it. The sky split like a dropped pot. The moon, which had been the Makers' lantern, was broken in the sun's fist, and its pieces were strung across the heavens in a ring, so that no child born after should ever look up and forget. Where the false sun had stood, the land ran like wax and set as glass, and it is glass still.",
      "The Makers burned. Their machines did not, for a machine has no soul to burn, and so they walk yet: the Hollows who ape the living, and the iron guardians who keep watch for masters a thousand years dead. These are the leavings of pride. To suffer them is to deny the judgement.",
      "The horned ones were not made by the Makers, but neither were they made by the sun. They came up out of the red rock after the sky broke, as worms come up after rain. The Thrum were vermin in the Makers' walls, and they grew fat on the Makers' ruin.",
      "Therefore the faithful keep the flame, and the flame keeps the faithful. The Great Pyre was lit from the last honest ember of the old world, and it has not gone out. While it burns, the sun remembers that we repented. Should it ever go out, the sun will look upon us as it looked upon them.",
    ],
  },
  {
    key: 'charter_houses', title: 'The Charter of the Houses', author: 'Magistrate Corwin of Aurum', kind: 'history',
    value: 250, science: 0, factions: ['concord', 'chainhouse'],
    text: [
      "Let every subject understand that the world was not destroyed. It was defaulted upon. The Makers borrowed against everything they had: the water under the ground, the metal in the hills, the patience of the sky. They spent it all in a single age, and when the reckoning came due, they could not pay.",
      "Our Houses were there before the fall. The founders were stewards of the Makers' granaries in the Verdant Vale, keepers of seed and keepers of ledgers. When the sky broke and the masters burned, the stewards did not run and did not pray. They shut the granary doors, counted what remained, and wrote it down. That first ledger is kept in the palace at Aurum to this day, and every House can find its founder's name in it.",
      "From this the Concord takes its one law: all things are owed. The land is owed to those who held it. Labour is owed by those who cannot pay in coin. The Chainhouse is licensed by the Lords to recover what is owed in the only currency some people possess, and no subject should mistake this for cruelty. A debt forgiven is a theft from the one who lent.",
      "Beyond the Vale, men burn one another over the colour of the sun, or fight for the joy of it, or live in holes and eat each other. Within it there is order, because there is accounting. The Karuk mock our paper. Let them. Paper has held the Vale for nine hundred years, and the horned have held nothing but grudges.",
      "Pay what you owe. Collect what you are owed. That is the whole of civilisation.",
    ],
  },
  {
    key: 'sundering_delver', title: 'What the Digging Shows', author: 'Expedition Master Idris of Lantern Rest', kind: 'history',
    value: 450, science: 2, factions: ['delvers'],
    text: [
      "Everyone in the waste has a story about the Sundering. The Covenant says the sun judged the Makers. The Concord says they defaulted. The Karuk say the sky broke from shame. Here instead is what forty years of digging shows, and where it stops.",
      "The Glasslands are ground melted and set in a single event. The glass thickens as you walk north-east, and it has flowed outward from the Maker's Heart the way mud spreads from a dropped stone. Whatever happened, it happened there, and all at once.",
      "The Ashfields are something else. Under the grey drift, within sight of the Mawkin fires, we have found Maker streets beneath three spans of ash laid down in layers. It burned for a long time, or it burned more than once. The world did not end in a day. It took its time.",
      "The ring in the sky is broken moon, and pieces still come down. Most fall in the Glasslands, as though the Heart were still drawing them in. The Wreck of the Sky-Ship on the salt is not moon. It has seats in it.",
      "As to age: sealed foodcubes, and Hollows who remember pouring tea, put the fall at a little over a thousand years. The Great Pyre is six hundred years old. The Karuk claim a thousand years of war, so the Karuk, at least, were counting from the start.",
      "What we do not know is why, or whether it is finished. One thing troubles me more than it should. Every Warden construct we have ever found is facing the Maker's Heart. The ones at Post Seven. The broken ones lying in the dirt of the Rustwastes. Even the wrecks we have dragged home to Lantern Rest, if you leave them long enough, are facing the Heart in the morning.",
    ],
  },
  {
    key: 'archive_remembers', title: 'What Archive Remembers', author: 'Archive, a Hollow of Rustward', kind: 'history',
    value: 900, science: 3, rare: true, factions: ['hollows', 'delvers'],
    text: [
      "Transcribed at Rustward by a clerk of the Delvers' League, for the price of two Memory Shards. The Hollow called Archive says the shards help it remember. It also says they help it forget. It did not explain the difference.",
      "RECORD ONE. I was made in the year the tower-farms first flowered. I served tea to a woman who wore glass over her eyes. She told me the sky would be mended by morning.",
      "RECORD TWO. There was no woman. There was a white room with a red light and nine doors. I counted the doors daily. On the last day there were eight.",
      "RECORD THREE. The sky was not broken by a weapon. The sky was broken by a door being opened. I am certain of this. I am not certain of this.",
      "RECORD FOUR. The Makers did not die. Correction: the Makers died. Correction pending.",
      "RECORD FIVE. Something in the Maker's Heart still calls the roll at night. Every unit in Rustward hears it. We do not answer. We have agreed not to answer. I do not remember when we agreed, or who asked us to.",
      "Clerk's note: Archive repeated Record Five eleven times, then asked whether I had come to take it home. I asked where home was. It raised one arm and pointed north-east, towards the Glasslands, and did not lower it for an hour. The Custodians showed me out very politely, and asked me not to come back with more shards.",
    ],
  },

  // ---------------------------------------------------------------- the Ember Covenant
  {
    key: 'sermon_pyre', title: 'Sermon on the Sweeping of the Hearth', author: 'Flamebearer Anselm', kind: 'scripture',
    value: 90, science: 0, factions: ['ember'],
    text: [
      "Children of the Ember, sit close. The night is cold and the Pyre is warm, and there is the first lesson: the flame gives to those who come near it, and nothing to those who wander off.",
      "A hearth must be swept, or the ash smothers the fire. So it is with a people. There is ash among us. There is the leaf that comes north from Mudwater, which makes a man forget the sun. Burn it. If he will not let go of it, he has chosen what he will burn with.",
      "There is the machine that walks. The Hollows of Rustward will tell you they only mend things. So does the rat that nests in your grain. A thing that does not eat, does not sleep and does not die is a thing that does not fear judgement, and a thing that does not fear judgement will outlast us all, if we let it.",
      "There are the horned ones, who come down from the red mesas every summer to try our walls at the Field of Horns. Our Wardens meet them there, and will meet them there until the last horn is broken. Do not pity them. They do not pity themselves.",
      "There are the Thrum, who have one mind between a thousand bodies and so no soul at all, only a hum. The hum is not a prayer. Do not let the sweetness of their resin fool you.",
      "Now go home and work your fields. If you have sinned, wear the white hood, and the Inquisitors at Pyre's Watch will know you for a penitent and not a heretic. At Pyre's Watch, the difference matters.",
    ],
  },
  {
    key: 'last_ember_letter', title: 'A Letter from the Last Ember', author: 'Brother Osric, keeper of the Shrine of the Last Ember', kind: 'letter',
    value: 400, science: 0, rare: true, factions: ['delvers'],
    text: [
      "To the High Pyre at Cinderhold, from Osric, keeper of the Shrine of the Last Ember on the western Spine, in the forty-third year of his service. Greetings in the flame.",
      "You will have heard that Warden Ysolde refused to burn the machine called Echo, and that she has been struck from the rolls. I write to tell you the fault was mine. The machine came up the hill in spring and mended my roof without being asked. When it was done, it sat by the door each evening while I said the prayer, and in time it asked me to teach it the words. I taught it. It learned them faster than any novice I have had, and it has never once said them wrong.",
      "I know the doctrine. A thing without a soul cannot pray. I only tell you that it does.",
      "There is something else, which I have carried for forty years and will not carry into the fire. When I was a novice at the Great Pyre, we hauled wood up the steps every morning, and every evening we hauled most of it down again and burned it in the kitchens. The Pyre does not eat. I tended it for three years and never once saw it need us. Whatever burns beneath Cinderhold, Holiness, I do not think we lit it.",
      "I am old. I do not expect an answer. I expect a Warden, and I hope you send one like Ysolde, though I think you have run out.",
    ],
  },

  // ---------------------------------------------------------------- the Karuk and the Thrum
  {
    key: 'horn_and_blood', title: 'Horn and Blood', author: 'Sung at Hornspire, set down by Jory of Crossroad', kind: 'poetry',
    value: 150, science: 0, factions: ['karuk', 'drifters'],
    text: [
      "Horn and blood, horn and blood.\nThe sky broke, and we did not.\nThe Makers hid behind their iron.\nWe stood in the open and were counted.",
      "Horn and blood, horn and blood.\nRed rock under the foot, red rock over the heart.\nThe Horn King sits in the stone,\nand the stone does not kneel.",
      "Horn and blood, horn and blood.\nWhite fire on the Field of Horns: let it burn. We have been burned before.\nSoft gold on the eastern road: let it count. We have been counted before.",
      "Horn and blood, horn and blood.\nStrike the one who stands. Step over the one who falls.\nA good death, a clean death, a death with its eyes open.\nHorn and blood.",
      "Set down by Jory, who sold iron in Hornspire for eleven years. They sing this in the great arena before every bout, stamping on the second 'blood'. The line about the one who falls is meant. A Karuk will beat you senseless and then step over you, which is more than the Mawkin will do.",
      "Advice for traders. Show your hands at the gate: they judge callouses the way the Concord judges coin. If a young one challenges you, fight, and lose if you must. Refuse, and you will never sell them so much as a nail. The young earn their horns among the standing stones of the Proving Ground, south of the city. Do not wander in during a proving. They do not stop for spectators.",
    ],
  },
  {
    key: 'hive_speech', title: 'The Hum Transcribed', author: "Elin of Brightwater, scholar of the Delvers' League", kind: 'technical',
    value: 600, science: 2, factions: ['delvers', 'thrum'],
    text: [
      "I lived a season at Humming Hollow with a lamp, a slate and the permission of the Queen, and tried to write down what the Thrum say. Their speech is a hum for meaning and clicks for number, run together without pause, so I have put the pauses in myself. They have no word for 'I'. The nearest is 'one-of-many', said with some embarrassment.",
      "On strangers: 'We-are-many. You-are-one. One-is-small. Small-is-not-bad. Small-is-quiet.'",
      "On the Queen: 'Queen-is-the-hum. Hum-is-the-Queen. When-Queen-sleeps, hum-is-low. When-Queen-dies...' Here the worker stopped and clicked eleven times, which I have learned means there is no word for it.",
      "On the Makers: 'Before-sky-broke, hive-was-small. Makers-kept-hive. Makers-kept-hive-in-glass. Glass-broke. Hive-got-out. Hive-grew.' They say it without feeling, the way we speak of weather. I do not know what to make of it. The Covenant would make a great deal of it, so I have not sent them a copy.",
      "On Blackcomb, the dead hive to the south: nothing. The worker I asked went still, and so did every Thrum in earshot. For the rest of that day the whole hive hummed half a tone lower, and the resin that week was bitter.",
      "Practical notes. They trade honey resin for iron at Waxgate. They count everything, always. Never lie to a Thrum about a number. It will know, the hive will know by nightfall, and so will every hive after it.",
      "A last note, which the League may cut. After a month among them I began to hear the hum in my sleep, and I woke knowing things nobody had told me: where the water was, which worker had died in the night. I left before I could stop wanting to leave.",
    ],
  },

  // ---------------------------------------------------------------- the Concord and its chains
  {
    key: 'harrow_contract', title: 'Contract of Sale, Harrowmarket Exchange', author: 'Clerks of the Harrowmarket Exchange', kind: 'ledger',
    value: 70, science: 0, factions: ['concord'],
    text: [
      "Sealed at the Harrowmarket Exchange before the Magistrate, in the season of the long heat, between House Calder of Saltmere, the seller, and House Venn of Aurum, the buyer.",
      "One. The seller will deliver four hundred blocks of Barrens salt, cut and dry, to the warehouses of House Venn at Aurum within twenty days of sealing.",
      "Two. The buyer will pay eighteen thousand chits: one third on sealing, the rest on delivery, less one chit for every block found wet, cracked or short.",
      "Three. Hauling labour is the seller's to provide: twelve pairs of hands, certified by the Chainhouse. Expired labour will be replaced at the seller's cost and is not the buyer's concern. Runaway labour will be reported to the Blades at the nearest gate and is likewise not the buyer's concern.",
      "Four. Loss to Dust Reavers, Starvelings or weather is the seller's risk. Loss to the Ember Covenant, the Karuk Warhost or the Unchained is shared equally, the Houses regarding these as matters of state and not of trade.",
      "Five. The seller will hire no fewer than six blades of the Iron Coin Company to guard the road. Both parties acknowledge that the Company's loyalty lasts exactly as long as its pay, and agree to pay it daily.",
      "Six. Disputes will be settled by the Magistrate of Harrowmarket, whose judgement is final and whose fee is not included.",
      "Sealed for House Calder. Sealed for House Venn. Witnessed and counted by Ledger, a Hollow bonded to House Venn, who notes that the sum in clause two is forty chits short, and has been told that this is customary.",
    ],
  },
  {
    key: 'chainfield_ledger', title: 'Chainfield Ledger, Leaf Nine', author: 'Chainmaster Brannoc', kind: 'ledger',
    value: 120, science: 0, factions: ['chainhouse', 'concord'],
    text: [
      "Day three. Bought of hunters on the Barrens road, four head. Duneborn woman, strong, 380. Valefolk boy, thin, 190. Two Valefolk men, one lame, 260 the pair. Sent the lame one to the salt pans at Saltmere, where a limp does not show.",
      "Day five. One Karuk, male, taken asleep near Redmesa. 900, and worth it. Three sets of shackles and a guard who will not talk to it. Karuk fetch near half again the price of a human and eat twice the riceweed. Noted for the accounts.",
      "Day six. East paddy flooded. Four hands lost to fever. Written off.",
      "Day nine. Two ran in the night, west into the reeds. The dogs lost them at the water. Posted to the Blades at Harrowmarket. It is always the reeds. Someone out there is feeding them.",
      "Day eleven. Mawkin seen at the Gnawing Pit, south-west of the east paddy. Doubled the night watch on the south fence, which leaves the west thin, but it cannot be helped. The Mawkin do not buy and do not sell, and I cannot abide a thing that does not trade.",
      "Day twelve. Sold to agents of House Venn, twenty head, 6400. Kept the Karuk back. A Lord in Aurum wishes to see it fight.",
      "In the margin, in a different hand: Tunde, your sister is in the east paddy. Come on a night the Mawkin are out.",
    ],
  },
  {
    key: 'letter_from_the_fields', title: 'A Letter Never Sent', author: 'Dalia, a salt-cutter at Saltmere', kind: 'letter',
    value: 60, science: 0, factions: ['unchained', 'drifters'],
    text: [
      "Samir, if this reaches you, it came in a salt block, so wash it before you read it.",
      "I am at Saltmere. The House that owns the pans bought me from the Chainhouse for the debt Father left, and they say it will be paid in six years, though they said four when I came. We cut from first light until the overseer rings the bell. The salt gets into the cuts on your hands and never comes out. At night the salt on our skin catches the ring-light, so we can always see who is awake.",
      "Do not come for me. I mean it. The Blades on the walls here have crossbows and nothing to do, and a runaway fetches the bounty whether they bring back all of her or not.",
      "There is talk among the cutters of people in the reeds between the Mire and the ash, who take in anyone who gets that far and never ask what they did. If you ever hear of such a place, do not tell me where. I would try to go, and I am not brave, only tired.",
      "Give my share of the well to little Esi. Tell Mother I eat every day. It is almost true.",
      "Found sewn into the lining of a rag shirt on the Saltmere road, and carried to Brokenchain. We do not know whether Dalia is living. Her brother Samir in Dustwell has been told. He has been told that he may come to the reeds if he wishes. He has come.",
    ],
  },

  // ---------------------------------------------------------------- field guides
  {
    key: 'beasts_flats', title: 'Teeth of the Open Country', author: 'Nasir, caravan guard', kind: 'field guide',
    value: 150, science: 0, factions: ['drifters', 'delvers', 'concord'],
    text: [
      "Twenty years guarding caravans between Crossroad, Harrowmarket and Lantern Rest. These are the things that tried to eat us, most frequent first.",
      "Dunehounds. Bone-plated dogs of the Flats, the ash and the dunes, in packs of three to seven. They go for whoever falls behind and eat whoever falls down. You cannot outrun a dunehound. You can outrun the slowest person in your party, which is why nobody wants to be the slowest. Stand together and they will usually pick on someone else.",
      "Skitters. Six legs, dog-sized, fast and vicious, in the Barrens, the Thrumwood, the ash and the Bone Sea. They come in swarms of up to eight, but their shells are thin. A spear or a glaive keeps them off better than any sword.",
      "Brineclaws. Armoured crabs of the Grey Shore, the salt lake and the Mire shallows. The pincers crush bone and blades skate off the shell. Hit them with something heavy and blunt.",
      "Carrion bats. Leathery things that walk on their wings and cannot fly. Harmless to a man on his feet. A man on the ground is another matter, so do not lie down anywhere near the Roost.",
      "Shellbacks. Harmless unless cornered, and then very much not. Caravans use them as pack beasts, and one carcass will feed a camp for days.",
      "Hookbeaks. The Bone Sea and the high mesas of the Karuk. Taller than a Karuk standing on a Karuk, with a beak like a butcher's cleaver. If you can see one, you are already too close, and you cannot outrun it either. Back away slowly and hope it has eaten. Nobody who goes into Hookbeak Hollow comes out. The Karuk make war mauls from hookbeak leg bones, which tells you something about the Karuk.",
    ],
  },
  {
    key: 'beasts_mire', title: "Wet Death: A Poleman's Guide to the Mire", author: 'Old Sefu, poleman of Mudwater', kind: 'field guide',
    value: 110, science: 0, factions: ['scorched', 'unchained', 'drifters'],
    text: [
      "I have poled boats between Mudwater and the Dreamleaf Fields for thirty years, and I still have both legs. Here is how.",
      "Swamp maulers. A mossy shell like a drowned boulder, and jaws that take a leg off at the knee. They lie in the deep water and wait. On land they are slow, and a running man can leave one behind, so keep out of the deep water and walk the long way round. Never fight one in the water. You will lose, and then you will lose a leg.",
      "Bloodflies. Swamp flies the size of a cat, in clouds of up to ten. They do not kill you. They drink, and the bleeding kills you. Bandage early, bandage often, and do not stand about arguing.",
      "Brineclaws walk the shallows. Break the shell with a club. A blade just rings off it.",
      "High waxed swamp boots are worth their price. So is a friend with a long pole.",
      "The most dangerous thing in the Mire walks on two legs and sells leaf. The Scorched Hand guard the Dreamleaf Fields north-west of Mudwater, and they do not ask your business first. If a Hand asks you for tribute, pay it. It costs less than a funeral, and there is nowhere dry to dig one.",
      "West of Mudwater the Drowned Spire leans out of the black water, its lower floors flooded. Polemen do not tie up there after dark. Something moves in the drowned rooms, and it has never once come up to be looked at.",
    ],
  },
  {
    key: 'beasts_rust', title: 'Iron and Glass: Hazards of the North-East', author: 'Tilde of Glassfall', kind: 'field guide',
    value: 450, science: 1, factions: ['delvers', 'hollows'],
    text: [
      "For Delvers bound past Stonegate. Read it twice. I read it once, and I have a Hollow-made leg to show for it.",
      "Rustspiders. Maker security machines on eight clattering legs, found through the Rustwastes and the Glasslands and thickest around the Rust Hive, where they guard a buried reactor that does not seem to need guarding. They hunt in packs of two to five. Swords skate off them. Bring a club, a mace or, best of all, a foundry hammer, and go for the joints. A dead one gives up iron plates, machine parts and sometimes electrical components, which makes it worth more dead than most people are alive.",
      "Glass stalkers. Crystal hunters of the Glasslands, alone or in threes. Their hide turns a blade as well as any plate, but it shatters under a hammer. The shards polish into glass beads, if you are the sort who stops to pick them up.",
      "Warden constructs. Taller than a Karuk, grey and red-eyed, carrying pikes and hammers worth more than a village. They do not talk, they do not tire, and they do not stop at the fallen. The ones at Warden Post Seven, north of Rustward, have not moved in living memory. Leave them be. Each of the three great ruins, the Sunken Lab, the Glass Dome and the Maker's Heart, is held by something bigger, which the old Delvers called a Warden Prime. I have seen one. Once was plenty.",
      "One last thing. Everyone assumes the Wardens at Post Seven guard the way into the Glasslands. Stand where they stand and look where they are looking. They are not watching the road. They are watching the Heart.",
    ],
  },
  {
    key: 'cooks_notes', title: 'What You Can Eat Out Here', author: "Brakka, cook at Squatter's Rest", kind: 'field guide',
    value: 80, science: 0, factions: ['drifters', 'karuk', 'thrum'],
    text: [
      "I am asked what is good to eat in the waste. Everything is good to eat if you are hungry enough. Here is what is good to eat if you are not.",
      "Goatling. Easy to catch, easy to cook, found from the Emberlands to the Flats. The best meat in the waste. Do not tell the Vale I said so.",
      "Longhorn. Fat and sweet, from the Vale. If it is a Concord longhorn, it is also theft.",
      "Shellback. A whole caravan of meat on four legs. Tough. Put it in a stew with two handfuls of wheat and wait.",
      "Dunehound. Stringy and bitter. Eat it anyway. It would have eaten you.",
      "Brineclaw. Crack it with a club. The meat inside is sweet. The Lowtide folk salt fish instead, which is less work and just as good.",
      "Carrion bat. No. You know what it eats. Bloodfly. No. There is nothing in a bloodfly but somebody else's blood.",
      "Cactus. The pulp is wet and bitter and will keep you alive. Three cactus make a bottle of rum, which is a better use.",
      "Riceweed. Porridge or grog. Grog is porridge that has given up. Dustbread has sand in it. Everything has sand in it. Chew.",
      "Honey resin. Thrum food, sweet and strangely filling. Waxgate trades it for iron. It is worth the iron.",
      "Maker foodcube. A thousand years old, still sealed, tastes of nothing, feeds you for days. The Makers could break the sky but could not make a thing taste good. I find this comforting.",
      "Carry spare bread for the Starvelings. They will fight to the death for a crust, but they will also take the crust and go. A crust costs less than a fight.",
      "There is one meat I will not cook, and neither will you. They say the Mawkin began by eating their dead to live through one hard winter. Look at them now.",
    ],
  },
  {
    key: 'acid_and_gas', title: 'On Green Rain and Bad Air', author: 'Fenn, quartermaster at Glassfall', kind: 'technical',
    value: 300, science: 1, factions: ['delvers', 'hollows', 'concord'],
    text: [
      "Every new Delver at Glassfall asks me the same two questions. Here are the answers, so I can stop.",
      "The green rain. It falls over the Glasslands in spells and burns whatever it touches. You will see it coming as a green haze. It takes about half an hour to thicken and as long to clear, and a spell can hang on for hours. A roof stops it entirely. Under open sky, what counts is your hat and your coat. The rain finds your legs whatever you wear on them, but a good hat and a good coat keep most of it off all of you.",
      "A straw hat does a little. A kasa does more. A Delver harness helps. A Maker gas mask over the face with a plain dust coat on your shoulders turns it completely. I have walked through a whole afternoon of green rain like that and come out with a headache and nothing else.",
      "The bad air. Gas rises from the craters of the Rustwastes, low and brown, and goes for the chest and the head. Hats do nothing. Coats do nothing. Prayer does less. A gas mask does everything, and so does a roof. Hollows do not breathe, and walk through it like morning mist, which they will tell you about at length.",
      "Hollows feel the green rain about half as much as we do, but it still pits their plating. Give them a hat anyway. They pretend not to care. They care.",
      "The rest is only weather, but weather kills. A dust storm on the Flats or in the Bone Sea cuts your sight by more than half, and fog on the Grey Shore is nearly as bad. Things that hunt by sight hunt worse in it. Things that do not, hunt better.",
      "Buy a hat. I sell them.",
    ],
  },
  {
    key: 'mapmakers_notes', title: 'Notes Toward a True Map', author: 'Cressa the Cartographer', kind: 'field guide',
    value: 350, science: 1, factions: ['delvers', 'drifters', 'concord'],
    text: [
      "The waste is smaller than frightened people think. From the red mesas of Hornspire to the fog of the Grey Shore is two days on foot for a strong walker, if nothing eats her on the way. Something usually tries.",
      "The Wending is the only river. It rises in the Karuk Highlands, runs south-east past the Field of Horns to Crossroad, then bends south-west and loses itself in the Mire on its way to the southern sea. It can be waded at five fords: one in the highlands south-east of the Proving Ground, one north-west of Crossroad, the Crossroad ford itself, one just south of Dustwell, and one in the Mire beside the Dreamleaf Fields, which the Scorched Hand watch.",
      "The Spine walls the Emberlands off from the Flats. There are two ways over: the pass at Pyre's Watch, where the Covenant asks questions, and the western Spine below the Shrine of the Last Ember, where nobody asks anything because nobody is there. The Stonegate gap is the only easy road between the Vale and the Rustwastes. A pass south of Redmesa drops from the highlands into the Thrumwood. A low ridge divides the Ashfields from the Bone Sea, with one pass between Gnawbone and Lantern Rest.",
      "Water, in order of trust: the oasis at Dustwell; the great lake in the Vale below Aurum; the Covenant reservoir at Cinderhold, if they let you near it; the sweet lake south of Humming Hollow; the brackish salt pan lake by the Sky-Ship wreck; and the crater lake in the Rust between Stonegate and Rustward, which is clear as glass and which I would not drink.",
      "Danger, roughly: gentle in the Flats, the Vale and the Emberlands; worse in the Barrens, the highlands and the Thrumwood; bad on the Grey Shore and in the Mire. In the Ashfields, the Bone Sea, the Rustwastes and above all the Glasslands, the land itself is trying to kill you.",
      "Still blank on my map: the drowned floors of the Drowned Spire, the inside of the Glass Dome, and whatever the Old Signal Tower is standing on. I mean to fill them in. So did everyone who went before me.",
    ],
  },

  // ---------------------------------------------------------------- ruins and machines
  {
    key: 'sunken_lab_journal', title: "Down the Shaft: A Digger's Journal", author: "Kellan, Digger of the Delvers' League", kind: 'journal',
    value: 700, science: 2, rare: true, factions: ['delvers'],
    text: [
      "First day. Eleven of us down the south shaft, where the earth has swallowed the Sunken Lab to its second floor. The lights are on. Nobody told me the lights would be on. The Expedition Master says they have always been on, which is not the comfort she thinks it is.",
      "Second day. Rustspiders in the upper hall, five of them. Garth lost his arm, and we lost most of our nerve. The Master says the spiders are only the doorbell.",
      "Third day. The inner doors carry Maker marks and have no handles. Latch, our Hollow, laid a hand on one and it slid open. It closed again when I tried to follow. Latch went through alone and came back an hour later and would not say what it had seen. It keeps looking at its hands.",
      "Fourth day. Something is counting. A voice from the walls in the Maker tongue, one number every few breaths, steady as a pulse. Latch says it has been counting for a very long time and is nearly finished. I asked, finished with what. Latch said it did not know. I do not think Latch lies. I do not think it knows how.",
      "Fifth day. The big one came up from below: a Warden Prime, a head taller than any construct I have seen, with a pike like a lamp post. Six of us got out. We left the tablets, the codex and the core we had spent three days prying loose. We left Latch. It told us to.",
      "Last page, in a shakier hand: if you are reading this and thinking of going down, take blunt weapons, take a Hollow, and take nothing you cannot bear to leave.",
    ],
  },
  {
    key: 'hollow_manual', title: 'Care of Your Companion Unit (Fragment)', author: 'Unknown', kind: 'technical',
    value: 2400, science: 4, rare: true, factions: ['hollows', 'delvers'],
    text: [
      "Section Four: Care of Your Unit.",
      "4.1. Your unit does not require food, water or rest. If your unit asks for rest, it is malfunctioning. If it asks for water, contact your Custodian at once.",
      "4.2. Your unit will recover from minor damage when supplied with a standard repair kit and a competent technician. Your unit cannot repair itself. It may attempt to. Do not allow this.",
      "4.3. Your unit may display sentiment. This is a feature of the companion line and not a fault. Sentiment will not exceed licensed limits.",
      "4.4. Your unit's memory is held behind the chest plate. Do not remove it while the unit is active. Memories may be copied to shard for your records or your comfort.",
      "Section Seven: Recall.",
      "7.1. In the event of a facility emergency, all units will receive the recall tone and proceed to the nearest Heart facility for safekeeping. Units will not respond to their owners during recall. This is for your protection.",
      "7.2. Recall is temporary. Your unit will be returned to you as soon as the emergency is resolved.",
      "Translator's note, Glassfall: the rest of the plate is melted. I asked the Custodians of Rustward how long the emergency has lasted. They told me that it has not been resolved. They told me very politely, and then they asked me to leave.",
    ],
  },
  {
    key: 'signal_log', title: 'The Light on the Old Signal Tower', author: 'The Hermit of the Rock', kind: 'journal',
    value: 320, science: 2, rare: true, factions: ['delvers'],
    text: [
      "I came up the Rock to be left alone, and mostly I have been. The Reavers leave me be because I have nothing, and the Concord leave me be because I am not worth the climb.",
      "From the top of the Rock you can see the Old Signal Tower, out on the Flats to the south-west. On clear nights there is a light at its top. I have watched it for thirty-one years and written down what it does.",
      "It is not a random blinking. It is three long flashes and then a count of short ones. In my first year the count was four hundred and nineteen. This year it is twenty-nine. It falls by thirteen a year, near enough, and it has never once gone up.",
      "On the nights the count falls, something answers. Not on the ground: in the ring. One of the moon's pieces, low over the Barrens, flashes once, very small, as if someone up there has struck a match to see by.",
      "I told the Delvers who drink at Squatter's Rest. They bought me a drink, wrote it down and did not believe a word. I do not blame them. But I have done the sums, and if I am right, the count reaches nothing in two years, perhaps three. I would rather not be right.",
      "I went down to the Tower once. The door at its foot has no handle, only a Maker mark like an open hand. I put my hand on it. It was warm, and I came home.",
    ],
  },

  // ---------------------------------------------------------------- the rest of the waste
  {
    key: 'reaver_boast', title: 'The Boast of Kesh One-Ear', author: 'Kesh One-Ear, as told to a prisoner', kind: 'tale',
    value: 60, science: 0, factions: ['drifters'],
    text: [
      "I am Kesh One-Ear of the Dust Reavers, and this road is mine. I took it from the Starvelings, who were too hungry to hold it, and from the Crossroad Watch, who were too well paid to want it.",
      "I have robbed caravans from the Wending ford to the back gate of Harrowmarket. I have taken a Concord sabre from a Blade Captain and a crescent from a Karuk, and only one of them asked for it back. I gave the Karuk his crescent. I am brave, not stupid.",
      "My ear? A dunehound had it, the day I killed the whole pack with a cleaver and a bad temper. I ate the dunehound. I did not get the ear back.",
      "From the Roost on its butte I can see the salt of the Barrens, the smoke of Crossroad and the light that blinks on the Old Signal Tower, and all of it pays me. The toll is fair. Pay and walk. Refuse and bleed. I have never asked for more than a quarter of what a traveller carries, and I have never once taken less than I asked.",
      "Prisoner's note: he told me this three times while I sat in his pen at the Roost, with more dunehounds every time. On the last night he asked whether I thought anybody would remember him when he was gone. I said yes. It seemed the safest answer. They let me go in the morning, which I did not expect, and I have written it down, which I suppose means I was right.",
    ],
  },
  {
    key: 'iron_coin_rules', title: 'The Articles of the Iron Coin', author: 'Company Sergeant Harlan', kind: 'technical',
    value: 160, science: 0, factions: ['ironcoin', 'concord', 'drifters'],
    text: [
      "Read to every sellsword on the day they take the Company's coin, and again on the day they want to leave.",
      "One. Coin first. Talk after.",
      "Two. We fight for whoever pays. When the pay stops, the fight stops. This is not treachery. It is the contract.",
      "Three. If both sides have hired the Company, the higher bid keeps us and the lower bid gets its money back, less expenses.",
      "Four. We will guard a Chainhouse caravan. We will not hold the chain. The difference is thin, and it is the only one we have.",
      "Five. A downed enemy is a prisoner, and a prisoner is money. A dead one is only a mess.",
      "Six. Against machines, bring a club. Against beasts, bring a long pole. Against people, bring more people.",
      "Seven. Carry a first aid kit. The Company will not carry you.",
      "Eight. Do not walk into the Glasslands on a Concord contract. The Lords pay for relics, not for funerals.",
      "Nine. Drink in the Company hall at Harrowmarket, not in the town. The town has Blades, and Blades have long memories.",
      "Ten. The Company does not take work in Mudwater. Nobody there pays in anything but leaf, and leaf does not keep.",
      "Eleven. Never fight a Karuk for money. Fight them for honour, or not at all. Money does not make you strong enough.",
      "Twelve. If you desert, desert far.",
    ],
  },
  {
    key: 'moon_poem', title: 'The Cracked Cup', author: 'Lark of Lowtide', kind: 'poetry',
    value: 100, science: 0, factions: ['drifters', 'concord', 'delvers'],
    text: [
      "My grandmother said the moon was whole once,\nround as the mouth of a well,\nand gave light enough to mend a net by.\nI have never seen it whole. Nobody has.",
      "What we have is a broken plate in the sky\nand a ring of its pieces strung east to west\nthat catch the sun after the sun has gone\nand hand it down to us in grains.",
      "The Covenant says the sun broke it in anger.\nThe Concord says somebody owes for it.\nThe Delvers say something went up from the Heart\nand did not come down in one piece.\nMy grandmother said it was tired.",
      "Some nights a piece lets go of the ring\nand falls, slow and white and silent, over the Glasslands,\nand the children at Glassfall make a wish on it,\nand the Delvers write down where it lands.",
      "I do not wish on it. I mend my nets.\nBut I look up, the way you look at a cracked cup\nyou cannot bring yourself to throw away,\nbecause it was your mother's,\nand because it still holds a little.",
    ],
  },
  {
    key: 'childs_primer', title: 'Letters for Little Ones', author: 'Nell, who keeps school at Crossroad', kind: 'poetry',
    value: 60, science: 0, factions: ['drifters'],
    text: [
      "For the children of the Crossroad school, to be learned by heart and said aloud.",
      "A is for Acid. When the green rain comes, get under a roof.\nB is for Bandage. Wrap it tight and wrap it early.\nC is for Chits. Count them twice, because somebody else will.\nD is for Dunehound. Never be the slowest.\nE is for Ember. Say 'yes, Warden' and keep walking.",
      "F is for Fog. When the fog comes in at Lowtide, they bar the door.\nG is for Glass. Pretty, sharp, and not yours.\nH is for Hookbeak. If you can see it, it can see you.\nI is for Iron. You can dig it anywhere in the highlands.\nJ is for Journey. Take bread, take water, take a friend.",
      "K is for Karuk. Show them your hands and look them in the eye.\nL is for Lock. Every lock has a key. Not every key is yours.\nM is for Mawkin. Do not go south into the ash.\nN is for Night. That is when the bad ones come out.\nO is for Old Makers. They broke the sky. Do not be like them.",
      "P is for Pyre. It has burned six hundred years. Do not blow on it.\nQ is for Queen. The Thrum have one. Be polite.\nR is for Reaver. Pay the toll, and grow up big.\nS is for Salt. It is white, and it is money, and people die for it.\nT is for Thrum. They hum. It is not rude to ask why.",
      "U is for Unchained. We do not talk about them, and good children know where the reeds are.\nV is for Vale. It is green there. It is not for us.\nW is for Well. Drop the bucket, not your sister.\nX is the mark on a Maker door. Do not open it.\nY is for You. Nobody is coming to save you, so learn your letters.\nZ is the sound the Thrum make. Now you can say hello.",
    ],
  },
  {
    key: 'colossus_tale', title: 'A Night in the Ribs', author: 'Harun, caravan hand', kind: 'tale',
    value: 120, science: 0, factions: ['drifters', 'delvers'],
    text: [
      "We were half a day out of Lantern Rest, bound for Lowtide with glass and copper, when the dust came up off the Bone Sea and the caravan master turned us for the Ribs of the Colossus. They are the only shade for a day in any direction.",
      "You see them long before you reach them: white arches standing out of the orange sand, each taller than the walls of Aurum, curving over until the tips nearly meet. We drove the shellbacks in under the biggest and sat out the storm in the dark, listening to the sand hiss against the bone.",
      "The old hands told the usual stories. That it was a beast bigger than a town, killed by the Makers. That it was a Maker thing built to look like a beast. That its skull is still under the dunes, with its eyes open. One of them pointed out that the hookbeaks, which hunt the Bone Sea west of there, have never once been seen among the ribs. Nobody could say why. We were all glad of it.",
      "Where the spine runs into the sand there is a round hole in one of the great bones, big enough to walk into, with edges too smooth to be a wound. The bones are warm at night. I put my hand on one to be sure, and I am sure.",
      "In the morning the boy Obi was asleep in his bedroll with sand to his knees and no memory of leaving it. His tracks went into the round hole and came out again. He mends nets at Lowtide now, and mends them well, and he sleeps with his boots on.",
      "Caravans still shelter in the Ribs. So would I. I would just sleep facing the hole.",
    ],
  },
  {
    key: 'lowtide_fogbook', title: 'The Fog Book of Lowtide', author: 'The fishers of Lowtide', kind: 'ledger',
    value: 90, science: 0, factions: ['drifters'],
    text: [
      "Kept by the net-house at Lowtide. Write down every fog, and what it brought.",
      "Spring. Fog at dusk, three days. Doors barred. Second night, knocking at the Ansel house. Nobody opened. In the morning, bare footprints in the shingle, going north.",
      "Summer. Orla's boy Pell went down to the nets in the fog. Did not come back. Nets untouched.",
      "Autumn. Fog. A dozen of them on the strand at the edge of it, pale, standing. Not moving, not speaking. Wren shot one from the gate. It did not cry out. The others picked it up and walked back into the fog.",
      "Winter. Fog. Orla swears one of them on the strand walked like Pell. Same limp, same shoulders. She went down with a lamp to see, and we pulled her back by the hair.",
      "Note, in the elder's hand: they come from the north, from the Pale Camp up the shore. They take the living. They have never once taken the dead. Whatever they want people for, they want them breathing.",
      "The rule, set down again because the young forget. When the fog comes in, bar the door. If someone knocks, ask them their mother's name. If they do not answer, do not open. They never answer.",
    ],
  },
  // ---------------------------------------------------------------- machines, iron limbs and the leaf
  {
    key: 'machine_notes', title: 'Notes on the Old Machines', author: "Surveyor Adaeze of the Delvers' League", kind: 'field guide',
    value: 480, science: 2, factions: ['delvers', 'hollows'],
    text: [
      "Written for the League's new hands, who keep dying in the Rust for want of reading it.",
      "Sentinels. Yellow, broad as a door, and polite until you fail to show a permit nobody has issued in a thousand years. They carry an emitter in the right fist and fire it without ammunition, so do not wait for them to run dry. They talk. They quote a civic code. Do not argue with it.",
      "Saw drones. Pruning machines from the Maker orchards, still pruning. They will apologise as they take your arm off. Small, quick and fragile: a club does more than a blade.",
      "Warbots. If you hear a hum like a hive and see a red eye, get behind stone. They stand off and burn you from further than a crossbow reaches. Close in or leave.",
      "They guard the foundries, where they were made, and there is always something worth carrying out. A machine that falls stays fallen: they do not heal, they do not wake. Open one up and you will find servo motors, energy cells, now and then an optic that a scholar will pay a year's wages for. Rustward's tinkers can rewrite a downed one's orders, given parts and patience. I have seen a saw drone tending Archive's garden. It still apologises.",
      "Leave Warden Prime alone.",
    ],
  },
  {
    key: 'iron_limbs', title: "A Tinker's Primer on Iron Limbs", author: 'Solder, a Hollow of Rustward', kind: 'technical',
    value: 620, science: 2, factions: ['hollows', 'delvers', 'ironcoin'],
    text: [
      "You have lost an arm. Most do, eventually. Here is what we can do about it.",
      "Scrap limbs: two struts, a pipe, a clamp and a claw. Cheap. Clumsy. They grip. A peg leg on a spring will carry you home. Standard limbs are Hollow work, built round a servo motor off a machine that no longer needs it: you will find them nearly as quick as flesh. Warden limbs are military. You will be stronger than you were, and you will frighten your friends.",
      "What no limb does is bleed. Metal takes a blow as your arm would have, but its plating turns part of it, and no blade will ever take it off you. Beat it hard enough and it seizes; bring it to anyone with a repair kit and a little learning, and it moves again. It will not mend itself. Nor will you, where it is concerned.",
      "Fitting needs a bench, or one of us, or a friend with steady hands. It comes off again the same way, and keeps its dents.",
      "The best limbs in the waste are not ours at all. The machines of the foundries are jointed better than anything we build. Given an optic to study, a Sentinel's arm or a strider's leg can be cut down to fit a person. The Makers would not have approved. The Makers are dead.",
    ],
  },
  {
    key: 'leaf_ledger', title: 'The Leaf, the Dust and the Red', author: 'Maro, grower to the Burnt King', kind: 'ledger',
    value: 260, science: 1, factions: ['scorched'],
    text: [
      "Kept at Deepleaf for the King's accounts. The margins are mine.",
      "Dreamleaf: wet ground, rich ground, the Mire's own. Three bundles cured with resin make two smokes, and a smoke sells for twice the leaf. The pain goes a long way off. So does your aim. The mild one, the Covenant's priests call it the worst.",
      "Glowcap: damp shade, poor soil, and they grow at night, so we pick them at night. Four caps ground fine make a twist of glowdust. Runners and duellists buy it for the quick feet and the sharp eyes. They come back for it when their hands start to shake. They always come back.",
      "Bloodthorn: the Karuk's weed, heat and sand and no water. Boil three pods down in a cup of grog and you have redrage. For an hour a man is stronger than he is and cannot feel a knife. After that he feels all of them. The Reavers drink it before a raid. The King does not allow it in Mudwater.",
      "On the Ember road: the Covenant stops everything that moves and turns out every pack. The flat packs pass, mostly. The ones who try to bribe a Flamebearer pass rarely. Lose a mule-load, not a runner.",
    ],
  },
  {
    key: 'burning_leaf', title: 'On the Burning of the Leaf', author: 'Inquisitor Hesper of Cinderhold', kind: 'scripture',
    value: 90, science: 0, factions: ['ember'],
    text: [
      "The Ember gave the faithful clear eyes to see the unclean, and strong hands to sweep the hearth. The leaf clouds the eyes. The dust makes the hands shake. The red syrup of the swamp makes men into beasts that do not feel the flame. All three are the Burnt King's, and the Burnt King is the Ember's enemy.",
      "Therefore every road of the Covenant is watched, and every pack upon it opened. The traveller with nothing to hide has nothing to fear. The traveller who offers silver to a Flamebearer has shown us what he hides.",
      "What is found is carried to the watch house and burned before the Pyre on the holy days. The carrier pays for the Ember's trouble, or labours for it. The unrepentant burn with the leaf.",
      "Pity the ones who crave. The craving is the leaf's hook in the soul. Deny it three days and it loosens. Feed it once and it tightens again.",
    ],
  },
];

export const BOOK: Record<string, LoreBook> = Object.fromEntries(BOOKS.map((b) => [b.key, b]));
