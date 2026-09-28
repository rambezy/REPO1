// Moments in the lives of the named people who follow you: going back to the
// places that made them, meeting the people they lost, finding what they went
// looking for. Each happens once, when its conditions are met and the person
// is where you can see them.

/**
 * A short scene. Lines are said in turn by 'who' (the named person), 'with'
 * (a second named person) or 'other' (someone found by the moment's needs,
 * such as Tunde's sister).
 */
export interface Moment {
  key: string;
  who: string; // the named person's key (content/uniques)
  with?: string; // another named person who must be close by
  at?: string; // a settlement or landmark key they must be at
  near?: number; // how close to it, beyond its radius (default 60 m)
  region?: string; // a region key they must be in
  dwell?: number; // game hours the conditions must hold first
  when?: 'night' | 'day';
  weather?: string;
  needs?: string; // a condition worked out in code (sim/personal)
  lines: ['who' | 'with' | 'other', string][];
  log: string; // what the journal records
  effect?: string; // what changes afterwards (sim/personal)
  deed?: string;
}

export const MOMENTS: Moment[] = [
  // Tunde and his sister
  {
    key: 'tunde_chainfield', who: 'tunde_runaway', at: 'chainfield', near: 120,
    lines: [['who', 'The east paddy. She\'s in there. I can see the reeds from here.'], ['who', 'Nine years I cut riceweed in that water. She\'s still cutting it.']],
    log: 'Tunde came back to Chainfield, where his sister Ama is still a slave in the east paddy.',
  },
  {
    key: 'tunde_finds_ama', who: 'tunde_runaway', needs: 'ama_near',
    lines: [['who', 'Ama. Ama, it\'s me.'], ['other', 'Tunde? You ran. You ran, and you lived.'], ['who', 'I said I\'d come back. I came back.'], ['other', 'Then get these chains off me, little brother.']],
    log: 'Tunde found his sister Ama at Chainfield.',
  },
  {
    key: 'tunde_ama_free', who: 'tunde_runaway', needs: 'ama_joined',
    lines: [['other', 'Nine years, and you counted every day. I know you did.'], ['who', 'I stopped counting when I saw you.'], ['other', 'We\'re walking the same way now, you and I.'], ['who', 'Then let\'s go, before I start hoping.']],
    log: 'Tunde and his sister Ama walk free together.',
    deed: 'family',
  },
  // the Warden who would not burn a machine, and the machine
  {
    key: 'echo_shrine', who: 'echo_penitent', at: 'ashshrine',
    lines: [['who', 'Brother Osric\'s fire. It is still lit.'], ['who', 'He taught me four lines of the evening prayer. I did not have time to learn the fifth.']],
    log: 'Echo came back to the Shrine of the Last Ember, where it asked to learn the evening prayer.',
  },
  {
    key: 'echo_ysolde_shrine', who: 'echo_penitent', with: 'ysolde_unburnt', at: 'ashshrine',
    lines: [['with', 'This is where they told me to burn you.'], ['who', 'And this is where you did not.'], ['with', 'I let them take you instead. I should have fought.'], ['who', 'The fifth line of the prayer asks the flame to forgive the ones who hold the torch. I have been saving it for you.'], ['with', '...Say it, then.']],
    log: 'At the Shrine of the Last Ember, Echo said the last line of the evening prayer for Ysolde. She has stopped calling herself the Unburnt.',
    effect: 'absolved',
  },
  {
    key: 'ysolde_pyreswatch', who: 'ysolde_unburnt', at: 'pyreswatch', near: 150,
    lines: [['who', 'They\'ll know my face here. Keep walking. And if I stop, don\'t let me.']],
    log: 'Ysolde walked past Pyre\'s Watch without looking at it.',
  },
  // Lumen and the voice in the Maker's Heart
  {
    key: 'lumen_heart', who: 'lumen_lampkeeper', at: 'makerheart', near: 40,
    lines: [['who', 'The voice. It is here. It is... a recording.'], ['who', 'Her voice, on a loop, for a thousand years. She is saying goodnight. To the house. To the dog. To me.'], ['who', 'I have my answer. I did not know it would be so small. I am glad it is.']],
    log: 'At the Maker\'s Heart, Lumen found the voice that had called her name for eighty years: a woman saying goodnight to her house, kept in a sliver of glass.',
    effect: 'lumen_shard',
  },
  // Cressa's last blank
  {
    key: 'cressa_glass', who: 'cressa_cartographer', region: 'glass', dwell: 10,
    lines: [['who', 'There. The last blank. North-east, and done.'], ['who', 'Every road, every ford, every pass, and every place that eats people. Here. Take it. It\'s yours now.']],
    log: 'Cressa finished her map of the waste in the Glasslands. Every road, ford and pass is drawn.',
    effect: 'cressa_map',
    deed: 'mapmaker',
  },
  // Kamaria and the cage at Saltmere
  {
    key: 'kamaria_saltmere', who: 'kamaria_liberator', at: 'saltmere',
    lines: [['who', 'That\'s the cage. They marched the cutters past me every morning.'], ['who', 'I\'d like to show the overseer the inside of it.']],
    log: 'Kamaria came back to Saltmere and looked at the cage they kept her in.',
  },
  {
    key: 'kamaria_count', who: 'kamaria_liberator', needs: 'freed10',
    lines: [['who', 'Ten more since you let me out. Two hundred and twenty-one.'], ['who', 'The count is going up again. I\'d forgotten how good that feels.']],
    log: 'Kamaria has seen ten more slaves freed since she joined you.',
  },
  // Skarra, Brakka and Hornspire
  {
    key: 'skarra_hornspire', who: 'skarra_ninefights', at: 'hornspire',
    lines: [['who', 'Nine fights. They still bang their shields when I walk in. Hah. Let them.']],
    log: 'Skarra Ninefights walked into Hornspire to the sound of shields.',
  },
  {
    key: 'brakka_squatters', who: 'brakka_cook', at: 'squatters',
    lines: [['who', 'My old kitchen. Somebody has been using too much salt.'], ['who', 'I will not say anything. I will only look at the pot until they feel it.']],
    log: 'Brakka looked in on his old kitchen at Squatter\'s Rest.',
  },
  // the rest of them, at home and not at home
  {
    key: 'halima_chainfield', who: 'halima_needle', at: 'chainfield', near: 120,
    lines: [['who', 'Three hundred hands and one healer. I could tell you which of those slaves have my stitches in them.'], ['who', 'Don\'t let them see my face. Please.']],
    log: 'Halima came back to Chainfield, where she learned to heal.',
  },
  {
    key: 'nettle_gnawbone', who: 'nettle_ashchild', at: 'gnawbone', near: 350,
    lines: [['who', 'The drums. I can hear the drums.'], ['who', 'Don\'t make me go closer. Or do. I don\'t know which is worse.']],
    log: 'Nettle heard the drums of Gnawbone, where she was raised.',
  },
  {
    key: 'vssara_blackcomb', who: 'vssara_hiveless', at: 'blackcomb', near: 300,
    lines: [['who', '*a long, broken hum*'], ['who', 'They still stand over her. One would stand there too, if they let one. ...If they let me.']],
    log: 'Vssara stood at the edge of Blackcomb and listened to the hive that will not answer it.',
  },
  {
    key: 'kesh_roost', who: 'kesh_one_ear', at: 'reaversroost', near: 150,
    lines: [['who', 'Home sweet home. Somebody\'s moved my chair.'], ['who', 'Twenty years I sat in that chair. Now some boy with a sharp knife sits in it. Good luck to him.']],
    log: 'Kesh One-Ear looked up at Reaver\'s Roost, and did not go in.',
  },
  {
    key: 'ledger_aurum', who: 'ledger_accountant', at: 'aurum',
    lines: [['who', 'House Venn\'s counting room is on the third floor. I could walk in and correct their figures, and they would not notice for a fortnight.'], ['who', 'They never did look at the numbers. That was always my job.']],
    log: 'Ledger passed through Aurum, where it kept House Venn\'s books for two hundred and six years.',
  },
  {
    key: 'moth_mudwater', who: 'moth_lockbreaker', at: 'mudwater',
    lines: [['who', 'The Hand\'s watching. Third stilt-house on the left. Don\'t look.'], ['who', 'I said don\'t look.']],
    log: 'Moth came back to Mudwater, and the Scorched Hand saw her come.',
  },
  {
    key: 'wren_fog', who: 'wren_longshot', weather: 'fog',
    lines: [['who', 'Fog\'s in. I should be on my stool.'], ['who', 'Keep close, all of you. And if something walks out of it, get down.']],
    log: 'The fog came in, and Wren counted her bolts.',
  },
  {
    key: 'piet_wheat', who: 'piet_farmer', needs: 'wheat_field',
    lines: [['who', 'Wheat. Proper wheat, in rows. Who planted this? It\'s crooked.'], ['who', 'Give me a hoe and a week, and I\'ll show you what fifty-one harvests are good for.']],
    log: 'Piet took one look at your wheat field and started again.',
    effect: 'piet_farm',
  },
  {
    key: 'dunstan_anvil', who: 'dunstan_smith', needs: 'smithy',
    lines: [['who', 'An anvil. An actual anvil.'], ['who', 'Stand back. And fetch me some iron. All of it.']],
    log: 'Dunstan found an anvil again, in your smithy.',
    effect: 'dunstan_forge',
  },
  {
    key: 'tchikka_why', who: 'tchikka_counter', needs: 'band8',
    lines: [['who', '*hum* Tchikka-counts-eight-soft-people-walking-together. And-Tchikka.'], ['who', 'Soft-people-walk-alone-because-they-have-not-found-each-other-yet. *click* Tchikka-knows-why-now. Tchikka-will-tell-the-Queen.']],
    log: 'Tchikka worked out why the soft people walk alone, and means to tell her Queen.',
  },
  // when the powers that made them fall
  {
    key: 'nettle_drums', who: 'nettle_ashchild', needs: 'fell:gnawbone',
    lines: [['who', 'The drums have stopped. Whoever beat them is dead.'], ['who', 'I thought I would feel more than this. I just feel lighter.']],
    log: 'The chief of Gnawbone is dead, and Nettle says the drums have stopped.',
  },
  {
    key: 'kesh_roost_falls', who: 'kesh_one_ear', needs: 'fell:reaversroost',
    lines: [['who', 'Told you they\'d lose it by winter.'], ['who', 'Twenty years I held that butte. The boy lasted a season. There\'s a lesson in that. I\'m not sure what it is.']],
    log: 'The Reaver Lord of the Roost is dead, and Kesh One-Ear laughed until he coughed.',
  },
  {
    key: 'skarra_king', who: 'skarra_ninefights', needs: 'fell:hornspire',
    lines: [['who', 'The Horn King is dead.'], ['who', 'Hah. Now there will be a real fight in Hornspire, for the hall. I would like to be there. I would like to win.']],
    log: 'Skarra heard that the Horn King is dead.',
  },
  {
    key: 'skarra_brakka', who: 'skarra_ninefights', with: 'brakka_cook', at: 'hornspire',
    lines: [['who', 'Brakka. The kitchen guard. They still tell the story of the three you broke.'], ['with', 'Four. They leave out the fourth. He was the cook.']],
    log: 'Skarra and Brakka came home to Hornspire together.',
  },
];
