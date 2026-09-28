# Saltblade

A squad-based open-world sandbox RPG set in the Sundered Waste, a broken
land under a shattered moon. You start with next to nothing: one person and
a road, four settlers and a field, a slave in shackles. What you become is
up to you and the waste. There is no chosen one and no main quest. Towns
trade and quarrel, patrols march, caravans travel, bandits raid, beasts
hunt, and the weather turns, whether you are watching or not.

It is inspired by *Kenshi*, with its own original world. Everything is made
in code: the 12 km terrain, the towns and their buildings, the characters
and their animations, the icons, the music and the sound. The game builds
into a single HTML file.

## The world

- **12 × 12 km** of generated terrain in 12 regions: the Hollow Flats, the
  Salt Barrens, the Verdant Vale, the Ember Lands, the Karuk highlands, the
  Thrumwood, the Mire, the Ashfields, the Bone Sea, the Rustwastes, the
  Glasslands and the Grey Shore. Each has its own ground, plants, beasts,
  ore and weather.
- **24 settlements** built from town plans (walled cities, villages, hives,
  swamp towns on stilts, a slave farm, a bandit fort, a cannibal camp), with
  furnished interiors, shops, bars, prisons, fields and guards.
- **20 landmarks** and about 220 lesser places: Maker ruins full of relics,
  wrecks, bandit and cannibal camps, beast nests, shrines and homesteads.
- **19 factions** with their own laws and attitudes: the slaving merchant
  lords of the Gilded Concord, the fire zealots of the Ember Covenant, the
  horned Karuk, the Thrum hives, Drifters, Delvers, the Chainhouse, the
  Unchained, the Scorched Hand, Reavers, Starvelings, Mawkin and more.
- About **70 squads roam** at once. Far from you they move and fight on the
  map; near you they come alive.

## What you can do

- **Fight** with katanas, sabres, hackers, heavy weapons, blunt weapons,
  polearms, fists and crossbows. Blows land on seven body parts; people
  block, dodge, bleed, get knocked out, lose limbs and die. Carry the fallen
  home, bandage them and put them to bed.
- **Grow** through 33 skills that rise with use. Getting beaten trains
  toughness; carrying heavy loads trains strength; reading teaches science.
- **Recruit** people from bars and cages, including 18 named characters
  with their own stories, prices and conditions. Take them back to the
  places that made them and their stories move on: a runaway finds the
  sister he left in the paddy, a Warden is forgiven by the machine she
  would not burn, a cartographer finishes her map. Hire mercenaries, buy
  slaves, or buy a pack beast or a hound.
- **Trade** in shops that restock over time. Each town sells some goods
  cheap and pays well for others (salt from the Barrens, resin from the
  hives, silk from the Vale, ore from Stonegate), so hauling goods pays.
  Sell loot, mine ore, collect bounties on about two dozen named outlaw
  leaders, or buy a house in town.
- **Fight in the Pit** at Hornspire: pay the Pit Master and take on a
  novice, a veteran and finally the Champion for the purse and the Karuk's
  respect.
- **Break the law** carefully: theft, pickpocketing, lockpicking, sneak
  attacks, freeing slaves. Witnesses report you and guards come for you,
  and a big enough price on your head sends bounty hunters across the
  waste after you. Prison sentences end; slavers carry the beaten off in
  chains.
- **Build a base**: 50 buildings and pieces of furniture, 72 recipes, a
  research tree of 31 topics gated by relics, farms, power, turrets and
  walls. Grow a base big enough and raiders, starvelings and tax
  collectors come calling.
- **Read** 26 books: scripture, histories, field guides, journals, ledgers,
  letters and poems, each with its own voice, not all of them honest.
- **Watch the world move**: war parties march on their enemies' towns and
  sack the weak ones. Fight at a town's gates and it remembers. When a
  faction's leader falls, its war parties stop for a while and its enemies
  warm to whoever did it.
- **Listen**: your people talk among themselves on the road about hunger,
  the weather, the country they cross, the money and the friends they have
  lost. The named characters have their own voices, and some share a past.
  Karuk, Hollows and Thrum each talk their own way, and townsfolk gossip as
  you pass. Chatter can be turned off in the options.
- **Keep a record**: a journal of what happened, 30 deeds to earn, and a
  Codex of the places, regions, factions, people, creatures and books you have
  come across.
- **Survive the weather**: dust storms, fog, rain, ashfall, spore drift,
  scorching heat, poison gas and acid rain, which burns anyone without a
  roof or the right gear.

## Starts

Eight ways to begin: **The Wanderer** (one person, a thousand chits),
**Freeholders** (four settlers with a homestead on the edge of the Vale),
**Hired Blades** (three unpaid mercenaries), **Horned Pilgrims** (three young
Karuk), **Old Iron** (two Hollows with wiped memories), **Deserters** (two
Concord soldiers with prices on their heads), **Chain-Bound** (a slave at
Chainfield) and **Nothing Left** (one-armed, starving and alone in the
Ashfields). The character creator sets each person's name, race, sex and
looks, with a turntable preview.

## Controls

| Input | Action |
| --- | --- |
| Left click, drag a box | Select people (Shift adds) |
| Right click ground | Move there |
| Right click someone or something | Attack a hostile, or a menu: talk, trade, loot, aid, carry, use, buy |
| Double click | Select and follow with the camera |
| WASD or arrows, Q and E, mouse wheel | Move, turn and zoom the camera |
| Middle drag or Alt+drag | Turn and tilt the camera |
| Space, 1 2 3 4 | Pause, game speed |
| T, R, H, F | Sneak, walk, hold position, camera follows |
| I, B, U, M, O, L, K | Character, build, research, map, factions, journal and deeds, Codex |
| Tab | Next squad |
| F5, F9 | Quick save, quick load |
| F3 | Frame timings |
| Esc | Close the top window, or open the menu |

On a touch screen: tap to select, press and hold to move or for a menu,
drag to pan, pinch to zoom, twist with two fingers to turn.

## Saving

Saves are compressed and kept in the browser (IndexedDB, with a
localStorage fallback): five slots, a quick save and an autosave every few
minutes. A save can be copied as text or downloaded, and pasted or opened
in another browser. The land is rebuilt from its seed on load; only what
lives on it is stored.

## Running it

```sh
cd saltblade
npm install
npm run dev          # http://localhost:5180
npm run build        # type-check, then dist/index.html (one file, about 1.3 MB)
node tools/make-artifact.mjs   # dist/artifact.html for publishing as an artifact
```

Adding `#play`, `#fight` or `#start=freeholders` (any start's key) to the
URL skips the title screen. `#debug` exposes `window.__sb` helpers for
testing.

## How it is built

TypeScript, three.js (r186) and Vite with vite-plugin-singlefile. About
21,000 lines.

- `src/world`: terrain generation (warped regions, ridges and passes, the
  river and its fords, lakes, roads routed with A*), towns, sites and
  navigation (a coarse 12 m grid for long paths, lazy 1 m tiles near people,
  with buildings and furniture stamped in).
- `src/sim`: the simulation: bodies and health, skills, combat, AI,
  routines, orders, jobs, crime, dialogue, shops, squads, the world outside
  your sight, raids, weather, bounties, property, named characters, saves.
- `src/render`: chunked terrain with LOD, water, sky and day-night,
  instanced vegetation, weather particles, and one skinned mesh per
  character with gear baked in and procedural animation.
- `src/audio`: procedural sound: synthesised effects placed in the world,
  ambience per region, weather and hour, and a generative score with moods.
- `src/ui`: the HUD, windows, inventory grids, trade, build, research, map,
  factions, dialogue, title screen, character creator and menus.
- `src/content`: the data: regions, factions, races, items, animals,
  buildings, recipes, research, starts, dialogue lines, books and named
  characters.
- `tools`: a world map renderer, screenshot and UI-flow scripts, a soak test
  and the artifact packager, all run against the dev server in headless
  Chromium.
