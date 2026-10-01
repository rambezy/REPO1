// Readable texts. Skill books teach when read; letters carry the story.

export interface BookDef {
  id: string;
  title: string;
  /** reading level needed to read every word */
  level: number;
  teaches?: { skill: string; xp: number };
  recipe?: string[]; // alchemy recipes learned
  hours?: number; // time spent reading
  text: string;
}

export const BOOKS: Record<string, BookDef> = {};
const B = (b: BookDef) => { BOOKS[b.id] = b; };

B({ id: 'fathers_letter', title: 'A Letter, Sealed with a Thumbprint', level: 2, hours: 0.2, text:
`My son,

Your mother is writing this for me, because my hands are better with iron than with a quill. So if the letters are pretty, thank her. If the words are clumsy, blame me.

This blade is yours. I have been working it at night, when you were asleep and thought I was drinking at Jiří's. I was also drinking at Jiří's. The steel is the best I ever bought, and I folded it eleven times. It is not finished, because a man should finish his own sword. I will show you the hilt and the temper, and then it will be yours and nobody else's.

You are going to be a better smith than me. I have known it since you were twelve and you told me my tongs were badly balanced. You were right. I did not tell you that.

I am not a man for words, son. So here are only three.

I am proud.

Radek, son of Ondra, smith of Hollowbrook.

And Marta, who wrote it, who is also proud, and who says you must learn to read so that you can read this yourself, and so that one day you can read to your sister.` });

B({ id: 'primer', title: 'Abecedarium', level: 0, hours: 1, teaches: { skill: 'reading', xp: 12 }, text:
`A is for Adam, the first of all men.
B is for Bread, which is given by God and by bakers.
C is for Cross.
D is for Dog, who is faithful.
E is for Eve.
F is for Fox, who is clever.
G is for God, who sees all things, even what you did behind the barn.
H is for Hand. Wash it.
I is for Iron.
K is for King.
L is for Linden, the tree of our land.
M is for Mother.
N is for Night.
O is for Oak.
P is for Prayer.
R is for Rain.
S is for Sister.
T is for Tree.
V is for Village.
Z is for Zeal, which Brother Tobiah hopes you have, because this took him four winters to copy.` });

B({ id: 'herbal', title: 'The Herbarium of Master Odo', level: 2, hours: 2, teaches: { skill: 'herbalism', xp: 60 }, recipe: ['yarrow_salve', 'comfrey_poultice'], text:
`Of YARROW. It groweth in meadows and by the ways. Achilles, they say, did bind his men's wounds with it, and so it stops blood. Boil the flower heads in water with a little marigold, grind them, and you shall have a salve to close a wound.

Of COMFREY, called Knitbone. Its root is black without and white within. Pounded and laid on flesh it draws the edges of a cut together. Boil it once with nettle, then grind, and bind the paste in clean linen.

Of CHAMOMILE. Sweet as apples. It calms the belly and the temper.

Of VALERIAN. Its root stinks like the feet of a pilgrim, but it bringeth sleep to the sleepless.

Of FEVERFEW. A little daisy. Against the fevers that follow wounds it hath no equal, save perhaps Angelica, which the wise women gather in wet groves at the edge of the forest.

Of BELLADONNA. Touch it not. The berries are black and sweet and they will stop a man's heart. Women put the juice in their eyes to make them large and beautiful, and this is vanity, and sometimes also death.

Of MOONWORT. A small fern. Fools say it opens locks and unshoes horses. It does not. It does, boiled in wine, sharpen the eyes in darkness.` });

B({ id: 'fechtbuch', title: 'The Fencing Book of Liechtenauer', level: 3, hours: 3, teaches: { skill: 'sword', xp: 90 }, text:
`Young knight, learn to love God and honour women, so that your honour grows. Practise knighthood and learn the art that graces you, and brings you honour in wars.

Whoever goes after strikes alone should not rejoice in his art. Strike, and hit, that is his wish; but he who waits for the other to strike, and meets him, has already won.

On the block: hold your guard not long. The body tires, the arm grows heavy. Lift the blade at the last breath before his blow lands, and his sword shall fall off yours like rain off a roof, and he will stand open before you like a door. Then strike, and strike hard: this is the Master Strike.

On many men: never let two stand before you. Move so that one stands behind the other.

On the heavy blow: it breaks the guard, but it opens your own. Use it when he is tired.

On stamina: the man who breathes hardest loses. Let him chase you.` });

B({ id: 'chronicle', title: 'Chronicle of the Lindenmark', level: 2, hours: 2, teaches: { skill: 'reading', xp: 30 }, text:
`In the year of our Lord 1143 the knight Oldřich, called the Linden-Planter, came into this valley with nine men and a sapling, and planted the linden on the hill where the castle now stands, and swore that as long as the tree lived his house would keep the valley. The tree lives yet.

In 1180 the monks of St. Aldhelm built their priory on the river, and taught the valley to keep bees and to read, though only the first was popular.

In 1290 silver was found at Silverdale by a shepherd whose sheep fell into a hole. The shepherd became rich. The sheep did not.

In 1342 the Great Flood took the old bridge and half the priory's books. Brother Konrad, it is written, swam out for the Gospels and came back with a cookery book. He was not permitted to forget this.

The lords of Linden Hill and of Ravenstone have been sworn brothers since the time of Oldřich, and each year on St. Wenceslas' Day they exchange a loaf of bread and a knife, meaning: I will feed you, and I will not cut you. It is a fine custom. God grant it never be broken.

In the year 1407 Jan of Linden, only son of Sir Bertram, died of a fever after the fighting at Kutná, aged nineteen. His father built the chapel in the castle for him and has not smiled since, the servants say, though the servants say a great many things.` });

B({ id: 'saints', title: 'Lives of the Saints', level: 2, hours: 2, teaches: { skill: 'reading', xp: 25 }, text:
`Of Saint Aldhelm. When he found that the people of his parish would not come into the church to hear the Word, but ran home after the Mass to their fields and their ale, Aldhelm went and stood upon the bridge where they must pass, and sang to them the songs of the common people, merry songs and sad ones, until a great crowd had gathered to listen. And when they were gathered, and their hearts were soft, he sang to them of God.

The monks of our priory say that he also sang to the fish in the river, and the fish came up to listen. The monks of our priory have been in the mead again.

Of Saint Ludmila, grandmother of Wenceslas, who taught him his letters and his prayers, and was strangled with her own veil for it. Pray to her for all grandmothers and all children learning to read.

Of Saint Christopher, who carried the Christ child across the river, and found that the child weighed as much as the whole world. Pray to him before you travel.` });

B({ id: 'reynard', title: 'The Tales of Reynard the Fox', level: 1, hours: 1, teaches: { skill: 'reading', xp: 25 }, text:
`How Reynard taught Isengrim the Wolf to fish.

It was winter, and the Wolf was hungry, and the Fox had a basket of eels. "Where did you get those?" said the Wolf. "Why, I fished for them," said the Fox. "Put your tail in the hole in the ice, and wait, and the eels will bite on it. The longer you wait, the more you will catch."

So the Wolf put his tail through the hole in the ice, and he waited, and the water froze around it. "I feel them biting!" said the Wolf. "I have a hundred eels at least!" "Wait a little longer," said the Fox, "and you will have a thousand."

In the morning the village came out with sticks.

The Wolf lost his tail, but he kept his life, and ever after he said that the eels in that river were very large indeed, and very strong.

And Reynard? Reynard ate the eels, and slept warm, and in the spring he went to the King's court and talked his way out of everything.

Somebody has drawn a small fox in the margin, with red crayon. Underneath, in a child's big careful letters: THIS IS ME.` });

B({ id: 'almanac', title: "The Hunter's Almanac", level: 2, hours: 2, teaches: { skill: 'archery', xp: 70 }, text:
`The deer hears better than you, smells better than you, and runs better than you. You have only patience. Use it.

Walk low. Walk slow. Keep the wind in your face.

Draw only when you mean to shoot, for the arm tires and the aim wanders. Loose on the breath out.

The boar does not run from you. The boar runs at you. Have a spear, or a tree, or a priest.

Wolves hunt in threes and fours. Keep your back to a rock and your dog at your side.

On the lord's land every deer is the lord's deer. A poacher loses his hand, if the lord is kind, and his life, if the lord is hungry.` });

B({ id: 'smithing_book', title: 'Theophilus on the Working of Metals', level: 3, hours: 3, teaches: { skill: 'smithing', xp: 80 }, text:
`Of the hardening of iron. Heat the iron until it glows the colour of the dawn, not the colour of the noon; for when it is white it is burnt, and when it is red it is lazy.

Strike while it is dawn-coloured. Strike where it is thick. Turn it, and strike again.

Of quenching. Some quench in water, some in oil, some in the urine of a red-haired boy. The last is superstition, though the boys are always willing.

Of the temper. A blade quenched and not tempered is proud: it will cut, and then it will shatter. Warm it again, gently, until the steel blushes straw and then bronze, and let it cool slowly. So also with young men.` });

B({ id: 'alchemy_book', title: 'The Distillations of Brother Konrad', level: 3, hours: 3, teaches: { skill: 'alchemy', xp: 70 }, recipe: ['bulls_blood', 'owls_eye', 'fox_tongue'], text:
`On the Seven Operations, which are: to steep, to boil, to grind, to add, to stir, to strain, and to pray. The last is optional but advisable.

Bull's Blood. Take strong wine. Add nettle and St. John's wort and boil once. Grind the herbs and add them back. Boil again. Strain into a bottle. It makes the arm strong and the head stupid.

Owl's Eye. Take wine. Add moonwort, boil twice. Add chamomile. Strain. The dark is less dark after.

Fox Tongue. Take honeyed wine, or wine and honey if you are poor. Add sage and mint, grind them first. Boil once. The tongue is loosened, and also, sometimes, the bowels.

Brother Konrad was later made to leave the priory for reasons the chronicle does not record, though it does record that the refectory roof had to be replaced.` });

B({ id: 'tactics', title: 'On Siegecraft', level: 3, hours: 2, teaches: { skill: 'reading', xp: 40 }, text:
`A castle has three enemies: hunger, treason, and the ladder. Of these, the ladder is the least.

Look for the water. Every castle must drink. Where the water comes in, the enemy may come in.

The postern gate is the castle's shame. It is small, and it is guarded by the laziest man.

Miners may bring down a wall by digging beneath it and burning the props. This takes weeks, and much beer.

The defender must hold every wall. The attacker must break only one.` });

// ---------- evidence & letters ----------
B({ id: 'harrow_orders', title: 'Sealed Orders', level: 2, text:
`To Captain R. Harrow, commanding.

The village of Hollowbrook on the pass road is to be made an example. It sends iron and bread to Linden Hill, and its smith has been forging for Bertram's garrison. Let the valley see what loyalty to Bertram costs.

The children may be taken for the baggage train. The rest is at your discretion.

Your guide will meet you at the Crow's Stone before dawn on St. John's Day.

Burn this.

(The seal is a black raven in red wax.)` });

B({ id: 'lothar_letter', title: "Lothar's Letter", level: 2, text:
`To His Grace the Duke Ottmar, greetings from his servant.

Bertram suspects nothing. He still sends me bread on St. Wenceslas' Day and calls me brother. When your Company has broken the villages, Linden Hill will stand alone, and I will open the pass for you.

In return I ask only what was promised: the mines of Silverdale, and the title of Margrave of this valley, which my father should have had and which Bertram's grandfather took.

The foreman Vilém has already begun sending silver north. He is greedy and therefore reliable.

Written at Ravenstone, under the raven.
L.` });

B({ id: 'foreman_ledger', title: "The Foreman's Ledger", level: 1, text:
`Week of St. Margaret. Silver drawn: 40 marks. Silver to Linden Hill, as due: 22 marks. Silver "lost in flooding": 18 marks. Paid to wagoner, north road: 2 marks.

Week of St. James. Silver drawn: 38 marks. Silver to Linden Hill: 20 marks. "Lost": 18 marks.

Miners' wages: held back pending "repairs."

In the margin, in a different ink: R. says the Company will be paid by the feast of the Assumption. Keep the men quiet till then.` });

B({ id: 'soldiers_letter', title: "Tomasz's Letter", level: 1, text:
`Anna, my heart,

I am writing this in a camp by the river with a borrowed pen. I am not badly hurt, only a little, the priest says I will mend, but the priest also said it would not rain today.

If I do not come home, sell the cow, not the goat, the goat is the better milker, whatever your mother says.

Tell little Jakub his father was brave. It will be almost true.

I think of your hands, and the smell of the bread, and the way you sing when you think I am asleep. I was never asleep. I was listening.

Your Tomasz` });

B({ id: 'feverwort_recipe', title: "Wenda's Recipe", level: 0, text:
`(It is not words, exactly. Wenda has scratched pictures into the bark with a knife: a little daisy, a willow leaf, a root with a forked tail. A pot over a fire, with two wavy lines above it. A mortar. Then the daisy and the root again, going into the pot. A bottle.)

You understand it anyway: Feverfew, willow bark and angelica root. Into the pot with water. Boil it twice. Grind the herbs, put them back. Strain it into a bottle.` });

B({ id: 'ravenstone_plan', title: 'Plan of Ravenstone', level: 1, text:
`A rough drawing of the castle on its crag. The main gate faces south, over a ditch. The walls are marked with little crosses where the towers stand.

On the east side, below the kitchen, a small door is drawn and labelled POSTERN. Beside it, in a shaky hand: "one guard, drinks."

A line runs from the castle well down the rock to the stream: "old drain, bricked, bricks rotten."

At the bottom: "The girl is kept in the kitchens with the cook. For God's sake be quick. I."` });

B({ id: 'notice_linden', title: 'Notices', level: 1, text: '' });
