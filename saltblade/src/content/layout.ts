// Where things are: every settlement and landmark in the Sundered Waste, and
// the roads between them. Positions are normalised (0..1) across the world.

export type TownTemplate =
  | 'freetown' | 'village' | 'fishing' | 'concord_city' | 'concord_town' | 'slavefarm' | 'ember_city' | 'ember_town' | 'ember_fort'
  | 'karuk_city' | 'karuk_fort' | 'hive' | 'hive_hostile' | 'swamp_town' | 'cannibal_village' | 'delver_outpost' | 'hollow_enclave'
  | 'hideout' | 'bandit_fort';

export interface SettlementDef {
  key: string;
  name: string;
  faction: string;
  tmpl: TownTemplate;
  u: number;
  v: number;
  r: number; // radius in metres
  pop: number; // rough resident count
  shops: string[]; // shop kinds
  desc: string;
  walls?: boolean;
  capital?: boolean;
}

export const SETTLEMENTS: SettlementDef[] = [
  {
    key: 'crossroad', name: 'Crossroad', faction: 'drifters', tmpl: 'freetown', u: 0.415, v: 0.505, r: 150, pop: 34, walls: true,
    shops: ['bar', 'general', 'weapons', 'armour', 'travel', 'construction', 'robotics'],
    desc: 'A free town where four old roads meet by the Wending ford. Its walls are scrap, its Watch is bribable, and nobody asks where you came from.',
  },
  {
    key: 'squatters', name: "Squatter's Rest", faction: 'drifters', tmpl: 'village', u: 0.53, v: 0.43, r: 80, pop: 12,
    shops: ['bar', 'general'], desc: 'A handful of shacks around a deep well, and a bar that never closes.',
  },
  {
    key: 'dustwell', name: 'Dustwell', faction: 'drifters', tmpl: 'village', u: 0.318, v: 0.6, r: 90, pop: 14,
    shops: ['bar', 'general', 'travel', 'animals'], desc: 'An oasis village of mud-brick and palm-shade, where caravans water their beasts.',
  },
  {
    key: 'aurum', name: 'Aurum', faction: 'concord', tmpl: 'concord_city', u: 0.8, v: 0.355, r: 230, pop: 60, walls: true, capital: true,
    shops: ['bar', 'general', 'weapons', 'armour', 'travel', 'slaves', 'tech', 'construction', 'bar'],
    desc: 'The golden capital of the Concord. The Lords of the Houses look down from their palaces on streets swept by slaves.',
  },
  {
    key: 'harrowmarket', name: 'Harrowmarket', faction: 'concord', tmpl: 'concord_town', u: 0.655, v: 0.5, r: 160, pop: 38, walls: true,
    shops: ['bar', 'general', 'weapons', 'armour', 'slaves', 'mercs', 'animals'],
    desc: 'The great market of the Concord frontier, where anything, and anyone, can be bought.',
  },
  {
    key: 'saltmere', name: 'Saltmere', faction: 'concord', tmpl: 'concord_town', u: 0.69, v: 0.7, r: 130, pop: 26, walls: true,
    shops: ['bar', 'general', 'construction'], desc: 'A salt-mining town on the Barrens, white with dust, run by an overseer House.',
  },
  {
    key: 'chainfield', name: 'Chainfield', faction: 'chainhouse', tmpl: 'slavefarm', u: 0.57, v: 0.735, r: 130, pop: 28,
    shops: ['slaves', 'general'], desc: 'The Chainhouse slave farm. Fields of riceweed, cages, and the crack of the lash.',
  },
  {
    key: 'stonegate', name: 'Stonegate', faction: 'concord', tmpl: 'concord_town', u: 0.705, v: 0.275, r: 130, pop: 26, walls: true,
    shops: ['bar', 'general', 'weapons', 'construction'], desc: 'A mining town wedged in the gap between the Vale and the Rustwastes.',
  },
  {
    key: 'cinderhold', name: 'Cinderhold', faction: 'ember', tmpl: 'ember_city', u: 0.42, v: 0.13, r: 220, pop: 56, walls: true, capital: true,
    shops: ['bar', 'general', 'weapons', 'armour', 'travel', 'temple'],
    desc: 'The white city of the Ember Covenant, crowned by the Great Pyre, where the flame has not gone out in six hundred years.',
  },
  {
    key: 'brightwater', name: 'Brightwater', faction: 'ember', tmpl: 'ember_town', u: 0.29, v: 0.19, r: 130, pop: 26, walls: true,
    shops: ['bar', 'general', 'armour'], desc: 'A pious farming town of the Covenant, its fields fed by the young Wending.',
  },
  {
    key: 'pyreswatch', name: "Pyre's Watch", faction: 'ember', tmpl: 'ember_fort', u: 0.503, v: 0.292, r: 95, pop: 20, walls: true,
    shops: ['general'], desc: 'A Covenant fortress guarding the pass through the Spine. Non-believers are questioned. Non-humans are not.',
  },
  {
    key: 'hornspire', name: 'Hornspire', faction: 'karuk', tmpl: 'karuk_city', u: 0.12, v: 0.15, r: 190, pop: 44, walls: true, capital: true,
    shops: ['bar', 'general', 'weapons', 'armour', 'travel'], desc: 'The seat of the Horn King, carved into a red mesa. Karuk warriors test themselves in the great arena.',
  },
  {
    key: 'redmesa', name: 'Redmesa', faction: 'karuk', tmpl: 'karuk_fort', u: 0.19, v: 0.385, r: 110, pop: 20, walls: true,
    shops: ['bar', 'weapons', 'animals'], desc: 'A Karuk war-camp on the southern edge of the highlands.',
  },
  {
    key: 'humminghollow', name: 'Humming Hollow', faction: 'thrum', tmpl: 'hive', u: 0.11, v: 0.49, r: 120, pop: 26,
    shops: ['general', 'thrum', 'travel'], desc: 'A living hive village of wax and resin. The hum never stops.',
  },
  {
    key: 'waxgate', name: 'Waxgate', faction: 'thrum', tmpl: 'hive', u: 0.215, v: 0.635, r: 100, pop: 20,
    shops: ['general', 'thrum'], desc: 'A small hive at the forest edge that trades honey-resin for iron.',
  },
  {
    key: 'blackcomb', name: 'Blackcomb', faction: 'blackcomb', tmpl: 'hive_hostile', u: 0.06, v: 0.67, r: 110, pop: 22,
    shops: [], desc: 'A dead hive. Its soldiers still guard their dead Queen.',
  },
  {
    key: 'mudwater', name: 'Mudwater', faction: 'scorched', tmpl: 'swamp_town', u: 0.255, v: 0.855, r: 130, pop: 30,
    shops: ['bar', 'general', 'weapons', 'drugs'], desc: 'A stilt town over black water, where the Scorched Hand sells dreamleaf and nobody sees anything.',
  },
  {
    key: 'gnawbone', name: 'Gnawbone', faction: 'mawkin', tmpl: 'cannibal_village', u: 0.44, v: 0.905, r: 100, pop: 24,
    shops: [], desc: 'Hide tents, bone fences and cookfires that never go cold.',
  },
  {
    key: 'lanternrest', name: 'Lantern Rest', faction: 'delvers', tmpl: 'delver_outpost', u: 0.665, v: 0.84, r: 95, pop: 16,
    shops: ['tech', 'general', 'bar'], desc: 'A Delver outpost in the Bone Sea, lit day and night, where relics are traded for water.',
  },
  {
    key: 'rustward', name: 'Rustward', faction: 'hollows', tmpl: 'hollow_enclave', u: 0.81, v: 0.13, r: 120, pop: 20,
    shops: ['robotics', 'tech', 'general'], desc: 'The last enclave of the thinking machines, humming with old power.',
  },
  {
    key: 'brokenchain', name: 'Brokenchain', faction: 'unchained', tmpl: 'hideout', u: 0.352, v: 0.765, r: 75, pop: 14,
    shops: ['general'], desc: 'A hidden camp of runaway slaves in the reeds between the Mire and the ash.',
  },
  {
    key: 'lowtide', name: 'Lowtide', faction: 'drifters', tmpl: 'fishing', u: 0.905, v: 0.72, r: 85, pop: 14,
    shops: ['bar', 'general'], desc: 'A fishing village on the Grey Shore. They bar their doors when the fog comes in.',
  },
  {
    key: 'glassfall', name: 'Glassfall', faction: 'delvers', tmpl: 'delver_outpost', u: 0.865, v: 0.215, r: 80, pop: 12,
    shops: ['tech', 'general'], desc: 'The last Delver camp before the Glasslands. Buy a hat. The rain here bites.',
  },
  {
    key: 'reaversroost', name: "Reaver's Roost", faction: 'reavers', tmpl: 'bandit_fort', u: 0.55, v: 0.585, r: 90, pop: 22,
    shops: [], desc: 'A scrap fortress on a butte where the Dust Reavers count their loot.',
  },
  {
    key: 'hardcoin', name: 'Hardcoin', faction: 'ironcoin', tmpl: 'freetown', u: 0.465, v: 0.75, r: 140, pop: 30, walls: true,
    shops: ['bar', 'mercs', 'weapons', 'armour', 'general'],
    desc: 'The walled hall-town of the Iron Coin Company, raised on the ash because nobody else wanted the land. Every sword in it is for hire, and the day rates are painted on the gate.',
  },
  {
    key: 'cragfold', name: 'Cragfold', faction: 'karuk', tmpl: 'karuk_fort', u: 0.09, v: 0.33, r: 100, pop: 18, walls: true,
    shops: ['bar', 'animals', 'general'], desc: 'A Karuk herding village on the western mesas, where the crag rams outnumber the Karuk three to one. The rams have the worse tempers, but only just.',
  },
  {
    key: 'ribshade', name: 'Ribshade', faction: 'drifters', tmpl: 'village', u: 0.805, v: 0.795, r: 100, pop: 14,
    shops: ['bar', 'general', 'travel'], desc: 'A scavenger town built inside the ribcage of a dead giant, where drifters dig bone and ivory out of the dunes. The well under the skull is the only water for a day in any direction.',
  },
  {
    key: 'relayfour', name: 'Relay Four', faction: 'hollows', tmpl: 'hollow_enclave', u: 0.925, v: 0.185, r: 100, pop: 16,
    shops: ['bar', 'general', 'robotics'], desc: 'An old Maker relay station deep in the Glasslands, where Hollows stop to be mended on the road to the Maker\'s Heart. Fewer of them stop on the way back.',
  },
  {
    key: 'tithefield', name: 'Tithefield', faction: 'ember', tmpl: 'ember_town', u: 0.3, v: 0.085, r: 120, pop: 24, walls: true,
    shops: ['bar', 'general', 'animals'], desc: 'A Covenant farming village where penitents work the tithe fields of the Great Pyre until the flame forgives them. The flame is in no hurry.',
  },
  {
    key: 'brinewick', name: 'Brinewick', faction: 'drifters', tmpl: 'fishing', u: 0.925, v: 0.41, r: 85, pop: 12,
    shops: ['bar', 'general'], desc: 'A salt-boiling hamlet on the northern Grey Shore that sells sea salt and salt fish to the kitchens of Aurum. The pan fires burn all night, because the fog does not like them.',
  },
  {
    key: 'deepleaf', name: 'Deepleaf', faction: 'scorched', tmpl: 'swamp_town', u: 0.11, v: 0.79, r: 120, pop: 24,
    shops: ['bar', 'general', 'drugs'], desc: 'The Burnt King\'s own leaf farm, hidden in the western Mire where the Covenant has never found a dry road. The best dreamleaf in the waste grows here, and every bale is weighed twice.',
  },
  {
    key: 'rivet', name: 'Rivet', faction: 'drifters', tmpl: 'freetown', u: 0.64, v: 0.18, r: 120, pop: 24, walls: true,
    shops: ['bar', 'general', 'construction', 'robotics'], desc: 'A scrap town in the western Rustwastes, walled with the plating of dead machines. Drifters cut up the Old Makers here and sell them by the pound.',
  },
];

export const SETTLEMENT: Record<string, SettlementDef> = Object.fromEntries(SETTLEMENTS.map((s) => [s.key, s]));

/** Roads between settlements. The generator routes each over the terrain. */
export const ROADS: [string, string][] = [
  ['crossroad', 'squatters'], ['squatters', 'harrowmarket'], ['harrowmarket', 'aurum'], ['crossroad', 'dustwell'],
  ['dustwell', 'waxgate'], ['dustwell', 'mudwater'], ['crossroad', 'pyreswatch'], ['pyreswatch', 'cinderhold'],
  ['cinderhold', 'brightwater'], ['brightwater', 'hornspire'], ['brightwater', 'redmesa'], ['redmesa', 'crossroad'],
  ['redmesa', 'humminghollow'], ['humminghollow', 'waxgate'], ['harrowmarket', 'saltmere'], ['saltmere', 'chainfield'],
  ['chainfield', 'harrowmarket'], ['harrowmarket', 'stonegate'], ['stonegate', 'aurum'], ['stonegate', 'rustward'],
  ['rustward', 'glassfall'], ['saltmere', 'lanternrest'], ['aurum', 'lowtide'], ['lowtide', 'saltmere'],
  ['cinderhold', 'stonegate'], ['mudwater', 'brokenchain'], ['squatters', 'pyreswatch'], ['crossroad', 'reaversroost'],
  ['hardcoin', 'chainfield'], ['hardcoin', 'dustwell'], ['cragfold', 'hornspire'], ['cragfold', 'redmesa'], ['ribshade', 'lanternrest'],
  ['ribshade', 'lowtide'], ['relayfour', 'glassfall'], ['tithefield', 'cinderhold'], ['brinewick', 'aurum'], ['deepleaf', 'mudwater'],
  ['rivet', 'stonegate'], ['rivet', 'cinderhold'],
];

export type POIKind =
  | 'ruin' | 'ruin_tower' | 'ruin_dome' | 'ruin_lab' | 'camp_reavers' | 'camp_starvelings' | 'camp_scorched' | 'camp_mawkin'
  | 'nest_dunehound' | 'nest_skitter' | 'nest_hookbeak' | 'nest_brineclaw' | 'nest_rustspider' | 'nest_mauler' | 'nest_bloodfly'
  | 'wreck' | 'shack' | 'homestead' | 'skeleton' | 'monolith' | 'caravan' | 'battlefield' | 'warden_post' | 'hermit' | 'shrine'
  | 'mist_camp' | 'blackcomb_nest' | 'bat_roost' | 'glass_ruin' | 'foundry';

export interface LandmarkDef {
  key: string;
  name: string;
  kind: POIKind;
  u: number;
  v: number;
  r: number;
  desc: string;
  boss?: string;
}

/** Hand-placed landmarks; the generator adds many more lesser sites. */
export const LANDMARKS: LandmarkDef[] = [
  { key: 'sunkenlab', name: 'The Sunken Lab', kind: 'ruin_lab', u: 0.655, v: 0.075, r: 70, boss: 'warden_prime', desc: 'A Maker laboratory half-swallowed by the earth. Something inside still keeps the lights on.' },
  { key: 'makerheart', name: "The Maker's Heart", kind: 'ruin_lab', u: 0.935, v: 0.11, r: 90, boss: 'warden_prime', desc: 'At the centre of the Glasslands, the crater where the world broke.' },
  { key: 'colossus', name: 'Ribs of the Colossus', kind: 'skeleton', u: 0.78, v: 0.915, r: 110, desc: 'The skeleton of a beast the size of a town, half-buried in orange sand.' },
  { key: 'drownedspire', name: 'The Drowned Spire', kind: 'ruin_tower', u: 0.11, v: 0.89, r: 60, desc: 'An ancient tower leaning out of the swamp, its lower floors under black water.' },
  { key: 'signaltower', name: 'Old Signal Tower', kind: 'ruin_tower', u: 0.475, v: 0.645, r: 50, desc: 'A Maker tower on the flats. On clear nights, a light still blinks at its top.' },
  { key: 'glassdome', name: 'The Glass Dome', kind: 'ruin_dome', u: 0.9, v: 0.3, r: 70, boss: 'warden_prime', desc: 'A dome of fused glass. The Delvers who went in did not come out.' },
  { key: 'hornarena', name: 'The Proving Ground', kind: 'monolith', u: 0.16, v: 0.24, r: 45, desc: 'Standing stones where young Karuk fight their first real battle.' },
  { key: 'ashshrine', name: 'Shrine of the Last Ember', kind: 'shrine', u: 0.34, v: 0.27, r: 40, desc: 'A Covenant shrine on the western Spine, tended by a single old priest.' },
  { key: 'reaverden', name: 'Reaver Den', kind: 'camp_reavers', u: 0.47, v: 0.555, r: 45, desc: 'A Reaver camp watching the Crossroad road.' },
  { key: 'mawkinpit', name: 'The Gnawing Pit', kind: 'camp_mawkin', u: 0.52, v: 0.8, r: 50, desc: 'A Mawkin hunting camp.' },
  { key: 'hookbeakvale', name: 'Hookbeak Hollow', kind: 'nest_hookbeak', u: 0.63, v: 0.93, r: 60, desc: 'Nobody who goes in comes out. Bones everywhere.' },
  { key: 'mistcamp', name: 'The Pale Camp', kind: 'mist_camp', u: 0.955, v: 0.52, r: 55, desc: 'Silent pale figures in the fog.' },
  { key: 'wreckfield', name: 'The Wreck of the Sky-Ship', kind: 'wreck', u: 0.61, v: 0.6, r: 80, desc: 'The shattered hull of something that once flew, lying across the salt.' },
  { key: 'starvelingcamp', name: 'Hungry Camp', kind: 'camp_starvelings', u: 0.37, v: 0.47, r: 40, desc: 'A starveling camp near the Crossroad ford.' },
  { key: 'rustnest', name: 'The Rust Hive', kind: 'nest_rustspider', u: 0.75, v: 0.08, r: 60, desc: 'A nest of machine spiders around a buried reactor.' },
  { key: 'scorchedcamp', name: 'Dreamleaf Fields', kind: 'camp_scorched', u: 0.2, v: 0.76, r: 60, desc: 'Scorched Hand growers and their guards.' },
  { key: 'battlefield', name: 'The Field of Horns', kind: 'battlefield', u: 0.3, v: 0.29, r: 70, desc: 'Where the Covenant and the Karuk still bleed each other.' },
  { key: 'hermit', name: "The Hermit's Rock", kind: 'hermit', u: 0.58, v: 0.47, r: 25, desc: 'A lone tower of rock with a single shack on top.' },
  { key: 'wardenpost', name: 'Warden Post Seven', kind: 'warden_post', u: 0.85, v: 0.06, r: 45, desc: 'Guardian machines on eternal watch.' },
  { key: 'batroost', name: 'The Roost', kind: 'bat_roost', u: 0.4, v: 0.78, r: 40, desc: 'Carrion bats nest in the dead trees.' },
  { key: 'ashbell', name: 'The Ash Bell', kind: 'ruin_tower', u: 0.37, v: 0.87, r: 50, desc: 'The bell tower of a town the ash buried, standing up out of the drifts. When the wind is right it still rings, and the Mawkin come to see who is calling.' },
  { key: 'unpaidfield', name: 'The Unpaid Field', kind: 'battlefield', u: 0.5, v: 0.85, r: 70, desc: 'Where a whole company of the Iron Coin fell to the Mawkin. The Company still sends the Chainhouse a bill for them every year.' },
  { key: 'sanddome', name: 'The Sand Dome', kind: 'ruin_dome', u: 0.87, v: 0.88, r: 70, boss: 'warden_prime', desc: 'A Maker dome that the dunes uncover every few years and bury again. Delvers race the sand to get inside, and not all of them race it back out.' },
  { key: 'lighthouse', name: 'The Blind Lighthouse', kind: 'ruin_tower', u: 0.94, v: 0.9, r: 45, desc: 'A Maker lighthouse on the last point of the Grey Shore. Its lamp went out a thousand years ago, but the pale folk in the fog still walk towards it at night.' },
  { key: 'singingglass', name: 'The Singing Glass', kind: 'glass_ruin', u: 0.945, v: 0.255, r: 55, desc: 'A thicket of towers melted into glass where they stood. They hum when the acid wind blows through them, and Hollows come a long way to listen.' },
  { key: 'carvedstair', name: 'The Carved Stair', kind: 'ruin', u: 0.075, v: 0.24, r: 45, desc: 'A stair cut into a red mesa by whoever lived here before the Karuk. It climbs three hundred steps to a doorway that the Karuk will not go through.' },
  { key: 'wallow', name: 'The Wallow', kind: 'nest_mauler', u: 0.08, v: 0.735, r: 55, desc: 'A drowned meadow of warm black mud where the swamp maulers sleep. Walk softly, or better, walk somewhere else.' },
  { key: 'fallenwalker', name: 'The Fallen Walker', kind: 'wreck', u: 0.62, v: 0.12, r: 80, desc: 'A Maker walking machine the size of a hill, lying on its side among the craters. The scrappers of Rivet have been cutting it up for forty years and have not finished the first leg.' },
  { key: 'hereticcell', name: "The Heretic's Cell", kind: 'hermit', u: 0.55, v: 0.2, r: 30, desc: 'A hut in the eastern hills where a Covenant priest has lived for thirty years since he stopped believing. The Inquisitors have never found him, because they have never looked.' },
  { key: 'lastwell', name: 'The Last Well', kind: 'caravan', u: 0.79, v: 0.62, r: 45, desc: 'A caravan stop around the only sweet well on the eastern salt. By long custom nobody fights at the rope, and even the Chainhouse waits its turn.' },
];
