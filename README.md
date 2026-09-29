# Dustfall

An original, turn-based, isometric post-atomic role-playing game in the
tradition of the classic wasteland RPGs of 1997. Everything (maps, sprites,
portraits, sounds, story and dialogue) is generated in code, and the whole game
builds into a single HTML file.

## The story

Eighty-six years after the sky turned white, Shelter 29 lies sealed under the
Ember Hills. Its hydro-core, the machine that purifies the shelter's water, has
cracked, and the reserve tanks hold one hundred and fifty days. The Warden
sends one resident through the great hatch to find a replacement.

Out in the Ember Basin you will find farming villages and scrap towns, a vast
caravan bazaar, the Withered of the Calder Ruins, the Keepers of the Archive,
and the Grafted: huge grey brutes with iron collars, made in vats by someone
who wants shelter dwellers for his flock.

## Systems

- **Character**: seven attributes (Strength, Perception, Endurance, Charisma,
  Intelligence, Agility, Luck), eighteen skills with three tagged, twelve
  traits, perks every three levels, karma, and three premade residents or a
  point-buy creator.
- **Combat**: hex grid, sequence order, action points, single, aimed, burst and
  thrown attacks, called shots to eight body locations, criticals that cripple,
  blind and knock down, armor class plus damage threshold and resistance per
  damage type, ammunition and reloading, explosives, companions.
- **World**: a fog-covered world map with travel time, terrain and random
  encounters, a 150-day water deadline, day and night, radiation, poison,
  drugs and addiction, natural healing and resting.
- **Talking**: branching dialogue with skill and stat checks, a special path
  for low-Intelligence characters, bartering with skill-based prices, stealing.
- **Interface**: the classic bottom bar with message log, active item, action
  point lights, HP/AC counters, skill book, automap, a wrist computer with tasks
  and archives, save slots.

## Controls

Click to walk or act. Right-click cycles the cursor between walk, use, look
and attack. `A` target, `R` reload, `B` switch hands, `N` change attack mode,
`I` inventory, `C` character, `L` wrist-link, `S` skills, `M` automap,
`Space` end turn, `Enter` end combat, arrow keys scroll, mouse wheel zooms,
`Ctrl+S` / `Ctrl+L` quick save and load. On touch screens: tap to act,
long-press for a context menu, drag to pan, pinch to zoom.

## Development

```sh
npm install
npm run dev          # local dev server
npm run build        # typecheck and build dist/index.html (single file)
node tools/play.mjs start   # scripted headless play-through with screenshots
```

Content lives in `src/content/`. See `docs/CONTENT_GUIDE.md` for the map,
dialogue and scripting format, and `docs/STORY.md` for the story bible.
