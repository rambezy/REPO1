// The named cast: appearance, portrait background and a few details used by
// dialogue and the codex. Schedules and dialogue live in the story modules.

import { Look } from '../gfx/characters';
import { CLOTH, HAIR, P } from '../gfx/palette';

export interface CharDef {
  id: string;
  name: string;
  title?: string; // shown under the name in dialogue
  look: Look;
  codex?: string;
  female?: boolean;
}

export const CHARS: Record<string, CharDef> = {};
function c(d: CharDef) { CHARS[d.id] = d; }

// ---------- family ----------
c({ id: 'radek', name: 'Radek', title: 'your father, the smith', look: { skin: 'ruddy', hair: HAIR.darkbrown, hairStyle: 'short', beard: 'full', beardColor: HAIR.saltpepper, shirt: CLOTH.linenDark, outer: 'apron', apronColor: P.wood2, legs: CLOTH.charcoal, boots: P.wood0, build: 'broad', eyes: '#4a3a2a', face: { jaw: 'heavy', nose: 'broad', brows: 'bushy', wrinkles: 2, mouth: 'wide' }, portraitBg: '#7a4a2a' },
  codex: 'Smith of Hollowbrook. Twenty years at the anvil, and he still hums when the iron sings right. He says little. He means all of it.' });
c({ id: 'marta', name: 'Marta', title: 'your mother', female: true, look: { skin: 'fair', hair: HAIR.chestnut, hairStyle: 'bun', female: true, hat: 'kerchief', hatColor: CLOTH.white, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.madder, apronColor: CLOTH.white, legs: CLOTH.brown, boots: P.wood1, eyes: '#5a4a2a', face: { jaw: 'round', nose: 'small', mouth: 'full', wrinkles: 1, cheeks: true }, portraitBg: '#8a6a44' },
  codex: 'Your mother bakes the best bread between here and Prague, and will tell you so. She learned her letters from the nuns as a girl and never let anyone forget it either.' });
c({ id: 'lida', name: 'Lida', title: 'your sister', female: true, look: { skin: 'pale', hair: HAIR.red, hairStyle: 'braids', female: true, freckles: true, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.woad, legs: CLOTH.brown, boots: P.wood1, build: 'child', eyes: '#3b6a8a', portraitBg: '#5a7a9a' },
  codex: 'Nine years old, red-braided, and certain she will be a knight. Father calls her Little Fox. She has never once lost an argument with you, and she knows it.' });
c({ id: 'crumb', name: 'Crumb', title: 'the family dog', look: { skin: 'tan', hair: '#8a5a32', hairStyle: 'none', shirt: '#8a5a32', legs: '#8a5a32', boots: '#8a5a32', portraitBg: '#6b5a44' } });

// ---------- Hollowbrook ----------
c({ id: 'pavel', name: 'Pavel', title: "the miller's son", look: { skin: 'ruddy', hair: HAIR.blond, hairStyle: 'curly', shirt: CLOTH.woad, legs: CLOTH.brown, boots: P.wood1, eyes: '#3b5a7a', face: { jaw: 'square', nose: 'button', mouth: 'wide' }, portraitBg: '#4a5a7a' },
  codex: 'Your oldest friend and your worst influence. Pavel wants glory, a sword, and the baker\'s daughter in Linden Hill, in roughly that order.' });
c({ id: 'hanka', name: 'Hanka', title: "the herb-wife's apprentice", female: true, look: { skin: 'fair', hair: HAIR.flaxen, hairStyle: 'long', female: true, freckles: true, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.green, legs: CLOTH.brown, boots: P.wood1, eyes: '#4a7a5a', face: { jaw: 'narrow', nose: 'button', mouth: 'full', cheeks: true }, portraitBg: '#5a7a4a' },
  codex: 'Hanka laughs at your jokes, which is suspicious, and knows the name of every weed in the valley, which is useful. She is learning herb-lore from Old Wenda in the woods.' });
c({ id: 'havel', name: 'Old Havel', title: 'the village storyteller', look: { skin: 'tan', hair: HAIR.white, hairStyle: 'balding', beard: 'long', beardColor: HAIR.white, shirt: CLOTH.undyed, outer: 'vest', outerColor: CLOTH.darkbrown, legs: CLOTH.grey, boots: P.wood1, old: true, eyes: '#6b7f8f', face: { jaw: 'narrow', nose: 'long', wrinkles: 3, brows: 'bushy' }, portraitBg: '#5a5a48' },
  codex: 'He fought for old King Charles, or says he did. He has a story for every scar and three for the ones he doesn\'t have.' });
c({ id: 'jiri', name: 'Jiří', title: 'the reeve of Hollowbrook', look: { skin: 'fair', hair: HAIR.brown, hairStyle: 'balding', beard: 'moustache', beardColor: HAIR.brown, shirt: CLOTH.woad, outer: 'noble', outerColor: CLOTH.olive, trim: CLOTH.ochre, legs: CLOTH.brown, boots: P.wood0, build: 'fat', face: { jaw: 'round', nose: 'broad', wrinkles: 1 }, portraitBg: '#6a6440' },
  codex: 'The reeve collects the lord\'s rents and his own opinions, both with great enthusiasm.' });
c({ id: 'vojta', name: 'Vojta', title: 'the village drunk', look: { skin: 'ruddy', hair: HAIR.ash, hairStyle: 'messy', beard: 'stubble', shirt: CLOTH.undyed, legs: CLOTH.grey, boots: P.wood1, build: 'thin', face: { jaw: 'narrow', nose: 'long', wrinkles: 1, eyeShape: 'sleepy' }, portraitBg: '#5a4a48' },
  codex: 'Vojta owes money to everyone in Hollowbrook and a song to anyone who\'ll listen.' });
c({ id: 'bara', name: 'Widow Bára', title: 'keeper of geese', female: true, look: { skin: 'tan', hair: HAIR.grey, hairStyle: 'bun', female: true, hat: 'wimple', shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.charcoal, apronColor: CLOTH.linenDark, legs: CLOTH.brown, boots: P.wood1, old: true, face: { jaw: 'narrow', nose: 'hooked', wrinkles: 3 }, portraitBg: '#4a4a52' },
  codex: 'A widow with eleven geese, each with a name and a worse temper than the last.' });
c({ id: 'marek', name: 'Little Marek', title: "Lida's friend", look: { skin: 'fair', hair: HAIR.brown, hairStyle: 'messy', shirt: CLOTH.russet, legs: CLOTH.brown, boots: P.wood1, build: 'child', freckles: true, portraitBg: '#6a5a44' } });
c({ id: 'tobiah', name: 'Brother Tobiah', title: 'friar and beekeeper', look: { skin: 'ruddy', hair: HAIR.grey, hairStyle: 'tonsure', shirt: CLOTH.brown, outer: 'robe', outerColor: CLOTH.brown, legs: CLOTH.brown, boots: P.wood1, build: 'fat', eyes: '#4a6a8a', face: { jaw: 'round', nose: 'broad', wrinkles: 2, cheeks: true }, portraitBg: '#6a6440' },
  codex: 'A friar of St. Aldhelm\'s who keeps bees, brews mead, and teaches letters to anyone patient enough to learn them. He likes his beer and he likes people, in that order on Fridays.' });

// ---------- Linden Hill ----------
c({ id: 'bertram', name: 'Sir Bertram', title: 'lord of Linden Hill', look: { skin: 'fair', hair: HAIR.grey, hairStyle: 'short', beard: 'moustache', beardColor: HAIR.white, shirt: CLOTH.blue, outer: 'noble', outerColor: CLOTH.green, trim: CLOTH.ochre, legs: CLOTH.charcoal, boots: P.wood0, cape: CLOTH.green, old: true, eyes: '#5a6a7a', face: { jaw: 'square', nose: 'long', wrinkles: 3, brows: 'thick' }, portraitBg: '#3e5a4a' },
  codex: 'Lord of Linden Hill and the lands around it. He buried his only son at Kutná two summers ago and has not laughed since.' });
c({ id: 'ondrej', name: 'Sergeant Ondřej', title: 'master-at-arms', look: { skin: 'tan', hair: HAIR.saltpepper, hairStyle: 'bald', beard: 'short', beardColor: HAIR.saltpepper, eyepatch: true, scar: true, shirt: CLOTH.olive, outer: 'gambeson', outerColor: CLOTH.olive, legs: CLOTH.charcoal, boots: P.wood0, build: 'broad', face: { jaw: 'heavy', nose: 'broad', brows: 'bushy', wrinkles: 2 }, portraitBg: '#5a5a40' },
  codex: 'He lost the eye at Nicopolis, he says, to a Turk "who is still looking for it." He trains Linden Hill\'s garrison by insulting them until they improve.' });
c({ id: 'kovar', name: 'Master Kovář', title: 'smith of Linden Hill', look: { skin: 'tan', hair: HAIR.black, hairStyle: 'short', beard: 'short', beardColor: HAIR.saltpepper, shirt: CLOTH.grey, outer: 'apron', apronColor: P.wood1, legs: CLOTH.charcoal, boots: P.wood0, build: 'broad', face: { jaw: 'square', nose: 'hooked', wrinkles: 2 }, portraitBg: '#6a4a30' },
  codex: 'Apprenticed alongside your father in Kutná, a lifetime ago. They quarrelled over a girl, your mother as it turns out, and never quite made it up.' });
c({ id: 'dorota', name: 'Dorota', title: 'innkeeper of the Crooked Linden', female: true, look: { skin: 'ruddy', hair: HAIR.auburn, hairStyle: 'bun', female: true, hat: 'kerchief', hatColor: CLOTH.ochre, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.forest, apronColor: CLOTH.white, legs: CLOTH.brown, boots: P.wood1, build: 'fat', face: { jaw: 'round', nose: 'button', cheeks: true, wrinkles: 1 }, portraitBg: '#6a4a30' },
  codex: 'She feeds half of Linden Hill and mothers the other half, whether they like it or not.' });
c({ id: 'miko', name: 'Miko', title: 'a street urchin', look: { skin: 'olive', hair: HAIR.black, hairStyle: 'messy', shirt: CLOTH.undyed, legs: CLOTH.grey, boots: '#3a2a1e', build: 'child', face: { jaw: 'narrow', nose: 'small' }, portraitBg: '#4a4a52' },
  codex: 'An orphan with quick hands and quicker feet. Nobody knows where he sleeps.' });
c({ id: 'greta', name: 'Old Greta', title: 'the baker', female: true, look: { skin: 'fair', hair: HAIR.white, hairStyle: 'bun', female: true, hat: 'kerchief', hatColor: CLOTH.white, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.brown, apronColor: CLOTH.white, legs: CLOTH.brown, boots: P.wood1, old: true, build: 'fat', face: { jaw: 'round', nose: 'small', wrinkles: 3, cheeks: true }, portraitBg: '#8a6a44' } });
c({ id: 'lukas', name: 'Steward Lukáš', title: 'steward of Linden Hill', look: { skin: 'pale', hair: HAIR.black, hairStyle: 'short', shirt: CLOTH.charcoal, outer: 'noble', outerColor: CLOTH.black, trim: P.metal3, legs: CLOTH.black, boots: P.wood0, build: 'thin', hat: 'chaperon', hatColor: CLOTH.black, face: { jaw: 'narrow', nose: 'long', eyeShape: 'narrow' }, portraitBg: '#3a3a42' } });
c({ id: 'florian', name: 'Father Florian', title: 'priest of Linden Hill', look: { skin: 'pale', hair: HAIR.ash, hairStyle: 'tonsure', shirt: CLOTH.black, outer: 'robe', outerColor: CLOTH.black, legs: CLOTH.black, boots: P.wood0, build: 'thin', face: { jaw: 'narrow', nose: 'long', wrinkles: 2 }, portraitBg: '#3a3a4a' } });
c({ id: 'zbynek', name: 'Zbyněk', title: 'the tanner', look: { skin: 'olive', hair: HAIR.darkbrown, hairStyle: 'messy', beard: 'goatee', shirt: CLOTH.brown, outer: 'apron', apronColor: CLOTH.darkbrown, legs: CLOTH.charcoal, boots: P.wood0, face: { jaw: 'narrow', nose: 'hooked', eyeShape: 'narrow' }, portraitBg: '#4a4030' } });
c({ id: 'aurelius', name: 'Master Aurelius', title: 'apothecary', look: { skin: 'pale', hair: HAIR.white, hairStyle: 'long', beard: 'long', beardColor: HAIR.white, shirt: CLOTH.purple, outer: 'robe', outerColor: CLOTH.plum, legs: CLOTH.black, boots: P.wood0, hat: 'cap', hatColor: CLOTH.purple, old: true, face: { jaw: 'narrow', nose: 'long', wrinkles: 3 }, portraitBg: '#4a3a5a' } });
c({ id: 'wenceslas', name: 'Lucky Venca', title: 'dice player', look: { skin: 'fair', hair: HAIR.red, hairStyle: 'short', beard: 'moustache', shirt: CLOTH.crimson, outer: 'vest', outerColor: CLOTH.black, legs: CLOTH.crimson, boots: P.wood0, hat: 'feathercap', hatColor: CLOTH.crimson, face: { jaw: 'square', nose: 'small', eyeShape: 'narrow' }, portraitBg: '#6a3030' } });

// ---------- forest & priory & mines ----------
c({ id: 'wenda', name: 'Old Wenda', title: 'the herb-wife', female: true, look: { skin: 'tan', hair: HAIR.white, hairStyle: 'long', female: true, hat: 'hood', hatColor: CLOTH.forest, shirt: CLOTH.brown, outer: 'dress', outerColor: CLOTH.darkbrown, legs: CLOTH.brown, boots: P.wood1, old: true, face: { jaw: 'narrow', nose: 'hooked', wrinkles: 3 }, portraitBg: '#3a4a3a' },
  codex: 'Some call her a witch. She calls them idiots. She has saved more lives in this valley than any priest, and buried fewer.' });
c({ id: 'gregor', name: 'Abbot Gregor', title: "abbot of St. Aldhelm's", look: { skin: 'fair', hair: HAIR.white, hairStyle: 'tonsure', shirt: CLOTH.white, outer: 'robe', outerColor: CLOTH.white, legs: CLOTH.white, boots: P.wood1, old: true, face: { jaw: 'square', nose: 'long', wrinkles: 3, brows: 'bushy' }, portraitBg: '#5a5a6a' } });
c({ id: 'anselm', name: 'Brother Anselm', title: 'librarian', look: { skin: 'pale', hair: HAIR.brown, hairStyle: 'tonsure', shirt: CLOTH.brown, outer: 'robe', outerColor: CLOTH.brown, legs: CLOTH.brown, boots: P.wood1, build: 'thin', face: { jaw: 'narrow', nose: 'small', eyeShape: 'narrow' }, portraitBg: '#5a5040' } });
c({ id: 'vilem', name: 'Master Vilém', title: 'mine foreman of Silverdale', look: { skin: 'fair', hair: HAIR.brown, hairStyle: 'short', beard: 'full', beardColor: HAIR.brown, shirt: CLOTH.grey, outer: 'leather', outerColor: CLOTH.darkbrown, legs: CLOTH.charcoal, boots: P.wood0, hat: 'cap', hatColor: CLOTH.white, build: 'fat', face: { jaw: 'heavy', nose: 'broad', eyeShape: 'narrow' }, portraitBg: '#4a4a52' } });
c({ id: 'anna', name: 'Anna', title: 'a miner\'s widow', female: true, look: { skin: 'fair', hair: HAIR.brown, hairStyle: 'ponytail', female: true, hat: 'kerchief', hatColor: CLOTH.woad, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.grey, legs: CLOTH.brown, boots: P.wood1, face: { jaw: 'narrow', nose: 'small', cheeks: true }, portraitBg: '#4a5a6a' } });
c({ id: 'kuba', name: 'Kuba', title: 'a miner', look: { skin: 'olive', hair: HAIR.black, hairStyle: 'short', beard: 'stubble', shirt: CLOTH.grey, outer: 'leather', outerColor: CLOTH.darkbrown, legs: CLOTH.charcoal, boots: P.wood0, hat: 'cap', hatColor: CLOTH.white, face: { jaw: 'square', nose: 'broad' }, portraitBg: '#4a4a40' } });
c({ id: 'tomas_burner', name: 'Black Tomáš', title: 'charcoal burner', look: { skin: 'tan', hair: HAIR.black, hairStyle: 'messy', beard: 'full', beardColor: HAIR.black, shirt: CLOTH.charcoal, outer: 'leather', outerColor: CLOTH.black, legs: CLOTH.charcoal, boots: P.wood0, build: 'broad', face: { jaw: 'heavy', nose: 'broad', brows: 'bushy' }, portraitBg: '#3a3430' } });
c({ id: 'jirka', name: 'Jirka One-Ear', title: 'deserter', look: { skin: 'ruddy', hair: HAIR.ginger, hairStyle: 'messy', beard: 'short', beardColor: HAIR.ginger, shirt: CLOTH.red, outer: 'gambeson', outerColor: CLOTH.charcoal, legs: CLOTH.red, boots: P.wood0, scar: true, face: { jaw: 'square', nose: 'broad', wrinkles: 1 }, portraitBg: '#5a3a30' } });

c({ id: 'matej', name: 'Matěj', title: 'the hunter', look: { skin: 'tan', hair: HAIR.darkbrown, hairStyle: 'long', beard: 'short', beardColor: HAIR.darkbrown, shirt: CLOTH.forest, outer: 'leather', outerColor: CLOTH.brown, legs: CLOTH.brown, boots: P.wood0, hat: 'hood', hatColor: CLOTH.forest, face: { jaw: 'narrow', nose: 'long', eyeShape: 'narrow' }, portraitBg: '#3a4a30' },
  codex: 'Keeper of Sir Bertram\'s forest. He talks to his dogs more than to people, and the dogs seem to prefer it.' });
c({ id: 'miller', name: 'Mikuláš', title: 'the miller', look: { skin: 'ruddy', hair: HAIR.blond, hairStyle: 'balding', beard: 'full', beardColor: HAIR.flaxen, shirt: CLOTH.linen, outer: 'apron', apronColor: CLOTH.white, legs: CLOTH.brown, boots: P.wood1, build: 'fat', face: { jaw: 'round', nose: 'broad', cheeks: true, wrinkles: 2 }, portraitBg: '#6a6440' } });
c({ id: 'vit', name: 'Little Vít', title: 'the burner\'s boy', look: { skin: 'tan', hair: HAIR.black, hairStyle: 'messy', shirt: CLOTH.charcoal, legs: CLOTH.brown, boots: P.wood1, build: 'child', hat: 'cap', hatColor: CLOTH.red, portraitBg: '#3a3430' } });
c({ id: 'barber', name: 'Barber Kryštof', title: 'bathhouse keeper and surgeon', look: { skin: 'pale', hair: HAIR.chestnut, hairStyle: 'short', beard: 'goatee', shirt: CLOTH.white, outer: 'apron', apronColor: CLOTH.linen, legs: CLOTH.charcoal, boots: P.wood0, build: 'thin', face: { jaw: 'narrow', nose: 'long' }, portraitBg: '#4a5a6a' } });
c({ id: 'storekeep', name: 'Ludmila', title: 'shopkeeper of Silverdale', female: true, look: { skin: 'fair', hair: HAIR.brown, hairStyle: 'bun', female: true, hat: 'kerchief', hatColor: CLOTH.ochre, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.olive, apronColor: CLOTH.white, legs: CLOTH.brown, boots: P.wood1, build: 'fat', face: { jaw: 'round', cheeks: true, wrinkles: 1 }, portraitBg: '#5a5a40' } });
c({ id: 'peddler', name: 'Wandering Ota', title: 'a peddler', look: { skin: 'olive', hair: HAIR.saltpepper, hairStyle: 'short', beard: 'full', beardColor: HAIR.saltpepper, shirt: CLOTH.mustard, outer: 'vest', outerColor: CLOTH.russet, legs: CLOTH.brown, boots: P.wood0, hat: 'strawhat', face: { jaw: 'round', nose: 'broad', wrinkles: 2 }, portraitBg: '#6a5a40' } });

// ---------- enemies ----------
c({ id: 'dieter', name: 'Black Dieter', title: "Harrow's lieutenant", look: { skin: 'tan', hair: HAIR.black, hairStyle: 'short', shirt: CLOTH.black, outer: 'brigandine', outerColor: CLOTH.black, legs: CLOTH.black, boots: P.wood0, hat: 'sallet', hatColor: '#2a2a30', cape: CLOTH.red, build: 'broad', portraitBg: '#4a2020' },
  codex: 'The man in the black helm who killed your father. His men call him the Black One. They mean it as a compliment.' });
c({ id: 'dieter_face', name: 'Dieter', title: 'unhelmed', look: { skin: 'tan', hair: HAIR.black, hairStyle: 'short', beard: 'stubble', beardColor: HAIR.saltpepper, scar: true, shirt: CLOTH.black, outer: 'brigandine', outerColor: CLOTH.black, legs: CLOTH.black, boots: P.wood0, cape: CLOTH.red, build: 'broad', face: { jaw: 'heavy', nose: 'hooked', wrinkles: 2, brows: 'thick', eyeShape: 'narrow' }, eyes: '#5a4a3a', portraitBg: '#4a2020' } });
c({ id: 'harrow', name: 'Captain Harrow', title: 'captain of the Company', look: { skin: 'fair', hair: HAIR.blond, hairStyle: 'long', beard: 'goatee', beardColor: HAIR.blond, shirt: CLOTH.red, outer: 'plate', legs: CLOTH.red, boots: P.metal2, cape: CLOTH.black, face: { jaw: 'narrow', nose: 'long', eyeShape: 'narrow', wrinkles: 1 }, eyes: '#6b7f8f', portraitBg: '#3a2020' },
  codex: 'A Swabian captain who sells his company to whoever pays. He is polite, educated, and has burned eleven villages this summer.' });
c({ id: 'lothar', name: 'Sir Lothar', title: 'lord of Ravenstone', look: { skin: 'pale', hair: HAIR.black, hairStyle: 'short', beard: 'goatee', beardColor: HAIR.black, shirt: CLOTH.black, outer: 'noble', outerColor: CLOTH.purple, trim: P.metal4, legs: CLOTH.black, boots: P.wood0, cape: CLOTH.black, face: { jaw: 'narrow', nose: 'hooked', eyeShape: 'narrow', wrinkles: 1 }, eyes: '#2e2e3a', portraitBg: '#2a2a3a' },
  codex: 'Lord of Ravenstone, Sir Bertram\'s neighbour and oldest friend. His seal is a black raven.' });
c({ id: 'ilse', name: 'Ilse', title: 'the Company\'s cook', female: true, look: { skin: 'fair', hair: HAIR.flaxen, hairStyle: 'bun', female: true, hat: 'kerchief', hatColor: CLOTH.linenDark, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.grey, apronColor: CLOTH.linenDark, legs: CLOTH.brown, boots: P.wood1, face: { jaw: 'square', nose: 'small', wrinkles: 1 }, eyes: '#4a6a8a', portraitBg: '#4a4a40' },
  codex: 'A camp follower from Swabia who cooks for Harrow\'s Company. She had a daughter once.' });

// generic speakers used by scripts
c({ id: 'guard', name: 'Guard', look: { skin: 'fair', hair: HAIR.brown, hairStyle: 'short', shirt: CLOTH.green, outer: 'tabard', outerColor: CLOTH.green, trim: CLOTH.ochre, legs: CLOTH.charcoal, boots: P.wood0, hat: 'kettle', portraitBg: '#3e5a4a' } });
c({ id: 'merc', name: 'Mercenary', look: { skin: 'tan', hair: HAIR.black, hairStyle: 'short', beard: 'stubble', shirt: CLOTH.black, outer: 'brigandine', outerColor: CLOTH.black, legs: CLOTH.red, boots: P.wood0, hat: 'kettle', scar: true, portraitBg: '#4a2020' } });

export function charName(id: string): string {
  return CHARS[id]?.name || id;
}
