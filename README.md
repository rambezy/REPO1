# Of Bread and Iron

A top-down medieval role-playing game about a smith's son, a burned village,
and a little sister somewhere out in the dark. Bohemia, 1409. No magic, no
chosen ones: just bread, iron, grief, and stubborn hope.

It is inspired by *Kingdom Come: Deliverance*: a grounded world with a
day-night cycle, skills that grow by use, hunger and fatigue, reputation
and crime, and hard, readable sword fights. Everything, from the painted
art to the music, is generated in code; the whole game builds into a single
HTML file.

## The story

**Prologue: St. John's Eve.** A whole day in Hollowbrook: deliver your
mother's bread, forge a horseshoe with your father, spar with Pavel, find
your sister Lida watching fox kits in the woods, pick flowers for Hanka,
chase Widow Bára's runaway geese, and jump the midsummer fire. Then the
night comes.

**Act I: Ashes.** Bury your father. Find the unfinished sword and the letter
he left you, which you cannot read yet. Race a three-day fever to save your
mother. Petition Sir Bertram of Linden Hill, train with Sergeant Ondřej, and
follow the riders' trail to the Crow's Stone, where someone has been waiting
for you.

**Act II: The Raven's Feast.** Finish your father's blade beside the smith
who once loved your mother. Follow stolen silver out of the Silverdale
mines. Walk into a mercenary camp in a servant's smock to save your best
friend, and meet a cook who taught your sister to write her name. Hold the
crossroads through a night of fire.

**Act III: Ravenstone.** Raise the valley: miners, charcoal burners,
deserters, hunters and monks, each only if you earned their trust. Bargain
with a mercenary captain, storm or sneak into the castle on the black crag,
face the man in the black helm, and decide what justice means.

The epilogue remembers what you did: who lived, who you spared, whether you
learned to read, whether you danced at the fire.

Side stories include reading lessons with a beekeeping friar, a bread thief
with two little siblings to feed, a card-sharp's lucky die, a wolf pack, a
runaway swarm of bees, a monastery's stolen bell, a lost charcoal-burner's
boy, a dying soldier's last letter, and an old soldier's sword buried "for
the next war".

## Systems

- **Combat**: directional slashes, thrusts and held heavy blows, stamina,
  late *perfect blocks* that stagger, ripostes, dodges, combos, bleeding,
  armour by damage type, surrender and mercy.
- **Skills and perks** that improve by use: sword, blunt, axe, archery,
  defence, stealth, thievery, alchemy, herbalism, smithing, reading,
  houndmaster; plus strength, agility, vitality and speech.
- **Crafts and games**: forging at the anvil, step-by-step alchemy,
  lockpicking, and Farkle-style dice in the taverns.
- **Life**: hunger, fatigue, dirt and charisma, drinking, sleeping to save,
  buffs from your mother's bread.
- **Society**: schedules for every named character, crime with witnesses,
  fines, guards and jail, disguises, and a dog called Crumb who fights beside
  you and sniffs out hidden things.
- **Literacy**: until you learn to read, letters and books render as
  scrambled marks, fewer the better you read.

## Controls

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD / arrow keys | left stick |
| Interact, talk | E | E button |
| Attack (hold for heavy) | Left click / J | sword button |
| Block (late = perfect) | Right click / K | shield button |
| Dodge | Space / L | » button |
| Sprint, sneak | Shift, Ctrl or X | Run, Sneak |
| Inventory, journal, map, character | I, B, M, C | Bag, Book, Map |
| Dog orders, wait, torch, bow | Q, T, F, R | Dog |

Gamepads work too.

## Development

```bash
npm install
npm run dev            # local dev server
npm run build          # single-file build in dist/index.html
npm run typecheck
npm run lint:content   # checks every speaker, item and quest id in the story
npm run test:smoke     # plays the opening of the production build
npm run test:story     # plays the whole story end to end (dev server on :5173)
```

The play-test driver (`tools/drive.mjs`) runs scenarios in a real browser
through a debug handle that is attached in development, or in any build
when the page URL ends in `#debug`.

`tools/make-artifact.mjs` turns the build into page content for hosting in
a page that supplies its own `<html>`, `<head>` and `<body>`.

### How it is drawn

The world is drawn at full screen resolution through a zoom transform, so
the camera glides with sub-pixel smoothness and all game logic stays in
world units (a tile is 16).

- **Ground**: painted, tiling materials (grass tufts, leaf litter, pebbles,
  cobbles, planks, ploughed furrows, wheat) are laid down per chunk in web
  workers, with curved borders between ground types, raised turf edges,
  banks that shade the water, water depth and shallows, and broad colour
  drift so fields never look tiled. Grass, flowers and ferns sway on top.
- **Things**: trees, buildings, props, people, animals, portraits and icons
  are painted with gradients and brush-like strokes at four texels per
  world unit, lazily, the first time they come near the camera. Tree crowns
  bend in the wind.
- **People** are posed every frame from painted parts: a real walk cycle,
  breathing, blinking, arms that reach for where the weapon goes.
- **Light**: the scene is multiplied by a light map that follows the sun
  (gold at dawn and dusk, blue by moonlight) with fires, lanterns and lit
  windows added in; objects cast soft shadows that swing with the time of
  day; clouds drift their shadows across the land; sunbeams slant through
  windows indoors.

`dev/*.html` are preview pages for the art (open them on the dev server).

### Layout

- `src/engine`: loop, input, renderer, lighting, particles
- `src/gfx`: the painting toolkit, people, portraits, ground materials and
  chunk renderer, trees, buildings, props, animals, icons
- `src/world`: maps, chunked terrain, actors, collision, path-finding
- `src/systems`: combat, AI, stats, inventory, crime, survival, quests,
  dialogue scripting, saving
- `src/ui`: HUD, dialogue, menus, journal, map, minigames
- `src/audio`: synthesised instruments, music and sound effects
- `src/content`: items, characters, books, recipes, merchants, the world's
  layout and interiors
- `src/content/story`: the prologue, three acts, side stories, and the
  toolkit they share (triggers, conversation topics, world decorations)
