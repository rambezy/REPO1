# Writing content for Dustfall

Content lives in `src/content/*.ts`. Each area is one module that registers
its maps, dialogue, quests, items, creatures and ending slides at import time,
and is imported from `src/content/index.ts`. Read `src/content/shelter29.ts`
first: it is the reference example for everything below.

All names, characters, places and writing must be **original** (see
`docs/STORY.md`).

## Registering things

```ts
import { defineMap, defineDialogues, defineQuests, defineObjScripts, defineDeathScripts, defineEndings } from './registry';
import { defineItems } from '../data/items';
import { defineProtos, S } from '../data/protos';
```

- `defineItems([...])`: new items (see `src/data/items.ts` for the shape and
  the existing catalogue; reuse existing items where possible). Available
  icon ids are listed in `src/render/icons.ts` (`ICONS`): e.g. `key`,
  `keycard`, `holotape`, `book`, `letter`, `core`, `part`, `jewel`, `chip`.
  Quest items use `quest: true`.
- `defineProtos([...])`: creature/character templates (`src/data/protos.ts`).
  `stats: S(STR, PER, END, CHA, INT, AGI, LCK)`. Body kinds: `human`, `rat`,
  `beetle`, `dog`, `grafted`, `withered`, `robot`, `crawler`, `ox`, `lizard`.
  Human looks take `skin`, `hair`, `hairStyle` (`short|long|bald|mohawk|bun|
  hood|helmet|cap`), `outfit`, `outfit2`, `female`, `beard`, `scale`. Armor
  worn (via `equip`) changes the sprite. Teams: `town` (neutral townsfolk),
  `raiders`, `critter`, `grafted`, `machines` (monsters, hostile to everyone
  not on their team), `neutral`, or a custom team name for a faction
  (custom teams are treated like townsfolk). `hostile: true` means hostile to
  the player.
- Prefer a **custom team per town** (e.g. `team: 'rustwater'`) so that
  attacking one townsperson turns that town against you, not every town.
- Named NPCs are usually spawned from a generic proto with overrides in the
  map's `npcs` list (`name`, `look`, `inv`, `equip`, `dialog`, `barter`).

## Maps

```ts
defineMap({
  id: 'cinder_creek',
  name: 'Cinder Creek',
  area: 'cinder_creek',       // world location id
  outdoor: true,              // day/night lighting
  dark: 0.5,                  // for caves/basements (0..1)
  floor: 'sand', floor2: 'dirt', wall: 'adobe', wall2: 'wood',
  music: 'wind',              // 'wind' | 'cave' | 'shelter' | 'town'
  legend: { ... },            // optional extra characters
  rows: [ '....', ... ],
  entrances: { default: 'E', fromDen: 'd' },
  exits: { out: { to: 'world' }, den: { to: 'beetle_den', entrance: 'default' } },
  npcs: [...], objects: [...], items: [...],
  rads: [{ at: 'X', radius: 4, perMin: 2 }],
  onEnter: (c, first) => { ... },
});
```

### The grid

Maps are hex grids in **axial coordinates**: in each row string, the character
index is `q` and the row index is `r`. On screen, each row is shifted half a
hex to the right of the row above, so a rectangle of text is drawn as a
parallelogram leaning to the right (the classic isometric look). Neighbours of
`(q, r)` are `(q±1, r)`, `(q, r±1)`, `(q+1, r-1)` and `(q-1, r+1)`. A
vertical line of `#` in the text is a straight wall running down-right on
screen; a horizontal line of `#` is a wall running left-right. Rooms are
simply rectangles of floor bordered by walls.

Keep maps between about 30x20 and 70x50. Rows may have different lengths
(missing cells are void). **Write maps with a small Python script** (as the
reference maps were) so rows stay aligned, then paste the output.

Default legend:

| char | meaning |
|---|---|
| ` ` | void (black, impassable) |
| `.` | floor (`floor`) |
| `,` | alternate floor (`floor2`) |
| `#` | wall (`wall`) |
| `%` | alternate wall (`wall2`) |
| `~` | water (impassable) |
| `"` | floor with scrub decoration |
| `;` | floor with rubble decoration |
| `=` | tile floor, `_` metal floor, `:` dirt floor |
| `+` | door (closed, unlocked) on floor |
| `o` | rock, `T` dead tree, `Y` cactus (blocking props) |
| `>` | exit grid cell with exit id `out` (walk onto it to leave) |
| anything else | a **marker**: floor underneath, position recorded |

Custom legend entries: `{ floor?, wall?, water?, exit?, decor?, block?,
marker?, door?: { locked?, key? } }`. Decor values: `scrub`, `rubble`,
`grass`, `oil`, `glow`, `stripe`, `track`. Use `marker` together with other
fields to put a marker on a special cell, e.g. `H: { floor: 'metal', marker:
'H' }`.

Floors: `sand dirt cracked scrub asphalt concrete tile metal shelter wood cave
rubble grass mud glow carpet toxic`. Walls: `adobe brick concrete ruin metal
shelter wood scrap rock cliff fence sandbag glass`.

Every map needs an exit back to the world map (`>` cells along an edge for
outdoor maps) unless it is only reachable from another map. Put the default
entrance near that exit.

### Markers, NPCs, objects, items

`at` is a marker character (first occurrence; with `count` > 1, successive
occurrences) or `[q, r]` coordinates.

```ts
npcs: [
  { proto: 'villagerF', id: 'hattie', name: 'Elder Hattie Voss', at: 'h', dialog: 'hattie',
    team: 'cinder', look: { hair: '#ddd', hairStyle: 'bun' }, essential: true },
  { proto: 'villager', name: 'Farmer', at: 'f', wander: 4, team: 'cinder' },
  { proto: 'raider', at: 'R', count: 3 },              // three raiders at R markers
  { proto: 'merchant', id: 'pell', at: 'p', dialog: 'pell', barter: true,
    inv: [{ id: 'hypo', n: 4 }, { id: 'scrip', n: 400 }] },   // merchants trade their inv
  { proto: 'villagerF', id: 'wren', at: 'w', if: (c) => c.flag('wrenFreed') && !c.partyHas('wren') },
],
objects: [
  { kind: 'crate', at: 'c', inv: [{ id: 'ammo9', n: 12 }] },  // container
  { kind: 'locker', at: 'l', locked: 40, inv: [...] },        // lock difficulty (Lockpick skill - locked)
  { kind: 'door', at: 'D', locked: 50, key: 'roostKey' },     // door with lock/key (replaces '+')
  { kind: 'terminal', at: 't', id: 'term1', onUse: 'my_terminal_script' },
  { kind: 'campfire', at: 'f' }, { kind: 'tent', at: 'T2' },
],
items: [{ id: 'jerky', n: 2, at: 'j' }],                      // loose items on the ground
```

`if` on an NPC with an `id` is re-checked every time the map is entered (the
NPC appears/disappears accordingly), which is how characters move between
maps after story events.

Object kinds with painters: `door hatch gate crate footlocker chest locker
cabinet safe fridge desk table chair bed bunk bedroll bookcase shelf toolbox
bag barrel barrelc terminal console rock deadtree cactus scrubbush car
campfire well tent generator vat tank sandbags stall lamp sign cage rack statue
pipe debris pile bones blood rug grate mat sink toilet hydrocore corechip
reactor radsign elevator ladder manhole altar pew crystal`. Containers:
`crate locker desk footlocker fridge bookcase shelf chest safe cabinet barrelc
toolbox bag`. Flat (walkable) kinds: `rug blood bones puddle grate mat bedroll
tracks pile`. Everything else blocks movement unless `blocks: false`.
Use `tint: '#rrggbb'` to recolour some props (tent, stall, locker, car,
barrel, bed, table, vat).

Doors: a `+` in a wall gap. Keep doorways one cell wide inside wall lines.

### Object scripts

```ts
defineObjScripts({
  my_terminal_script: (c, obj, user, skill) => {
    // skill is set when the player used a skill (e.g. 'science', 'repair') on it
    if (skill === 'science') { ...; return true; }
    c.msg('The screen shows...');
    return true;          // handled; return false to fall back to default behaviour
  },
});
```

Items with `use: 'myeffect'` can be scripted with `'use:myeffect'` keys in
`defineObjScripts` (the script must consume the item itself with `c.take`).

## Dialogue

```ts
defineDialogues([{
  id: 'hattie',
  portrait: { bg: '#4a3a2a' },          // optional overrides for the talking head
  start: (c) => (c.flag('metHattie') ? 'again' : 'hello'),
  nodes: {
    hello: {
      onEnter: (c) => c.set('metHattie'),
      text: 'NPC speech. *italics*. \n newlines ok. Can be a function (c) => string.',
      options: [
        { text: 'Player line', to: 'nodeId' },
        { text: 'Ask about X', if: (c) => c.questState('x') === 'active', to: 'x' },
        { text: 'Convince her', skill: { key: 'speech', diff: 20 }, to: 'ok', fail: 'no' },
        { text: 'Only for clever people', stat: { key: 'INT', min: 7 }, to: 'smart' },
        { text: 'Me want water.', lowInt: true, to: 'dumb' },
        { text: 'Let\'s trade.', barter: true, any: true },
        { text: 'Die!', combat: true },
        { text: 'Bye.', end: true },
      ],
    },
  },
}]);
```

- **Low intelligence**: players with INT 3 or less only see options marked
  `lowInt: true`, `any: true`, or `end: true`. Every important NPC should have
  at least one `lowInt` path (usually a funny short line) that still lets the
  player progress the main quest, and every conversation must always have a
  visible exit.
- Skill checks roll `skill - diff` (clamped 5-95) and give XP once on success.
- `do: (c) => ...` runs when the option is chosen, before moving on.
- Use `c.questDone(...)`, `c.give(...)`, `c.xp(...)`, `c.karma(...)` etc.
  (full list in `Ctx` in `src/game/types.ts`).
- NPCs without a dialogue just bark a generic line. Use `c.bark(npcId, text)`
  for floating lines.
- Merchants: `barter: true` on the spawn plus an inventory; the dialogue
  window shows a Barter button automatically.

## Quests

```ts
defineQuests([{ id: 'burrowers', title: 'Burrowers in the Wells', area: 'cinder_creek', xp: 500, desc: '...' }]);
```

`c.quest(id, note)` starts a quest and/or adds a log note; `c.questDone(id,
note)` completes it (awarding `xp`); `c.questFail(id)`. Quest ids must be
unique across the game: prefix with your area if in doubt.

## Flags

`c.flag(name)` / `c.set(name, value = true)` / `c.inc(name)`. Flags are global;
prefix area-specific flags (e.g. `cc_wellFixed`). Engine flags:
`dead:<npcId>` is set when a named NPC dies; `gone:<npcId>` when removed;
`party:<npcId>` true while a companion is in the party. Shared story flags:
`coreReturned`, `act2`, `shelter7Logs`, `gameWon`.

## Death scripts and companions

```ts
defineDeathScripts({ kestrel: (c, a) => { c.set('kestrelDead'); } });
```

Recruit with `c.recruit(npcId)` from dialogue. Companions follow the player,
fight with the combat AI, can be traded with, and travel between maps.
Companions use their proto's skills.

## Ending slides

```ts
defineEndings([{ order: 10, title: 'Cinder Creek', scene: 'dust', text: (c) => c.flag('x') ? '...' : '...' }]);
```

## Testing

- `npx tsc --noEmit` must pass.
- `node tools/play.mjs <scenario>` runs scripted checks in headless Chromium
  (see the file). You can add your own scenario: jump straight to your map with
  `DF.enterMap('your_map')` inside `page.evaluate`, then take screenshots with
  `page.screenshot` and look at them.
- Check that every marker referenced by `at` exists in the rows (the console
  warns `npc marker missing` / `object marker missing` otherwise), that exits
  work, and that every dialogue node referenced by `to`/`fail` exists.
