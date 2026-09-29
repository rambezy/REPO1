# Dustfall: story bible

Dustfall is an original post-atomic RPG in the style of the classic 1997
isometric wasteland games: turn-based hex combat with action points, seven
primary attributes, eighteen skills, traits and perks, a timed main quest, a
world map with random encounters, towns full of dialogue, and ending slides
that remember what you did.

**Everything is original.** Do not reuse names, places, characters, factions,
items, quotes or dialogue from any existing game series. No bottle caps,
no vault numbers from other games, no "war never changes", no power-armoured
knights with a known name, no super mutants or ghouls by those names.

## Setting

The Ember Basin, a dry high desert eighty-six years after a nuclear war that
nobody alive remembers. Year 2177. People trade in **scrip** (stamped
aluminium tokens). Healing comes from **mend-hypos**; radiation is flushed with
**rad-purge**. Two-humped **dust oxen** pull caravans.

Peoples and factions:

- **Shelter dwellers**: the player comes from Shelter 29, sealed for 86 years
  under the Ember Hills. Teal jumpsuits with orange piping.
- **Villagers** of Cinder Creek: farmers, sun-browned, practical.
- **Rustwater**: a walled scrap town run by a sheriff, with a crime boss who
  owns the casino.
- **Crossroads Bazaar**: merchant houses, caravan companies, water sellers.
- **The Withered**: people who survived heavy radiation. Long-lived, skin
  like cracked parchment, sometimes bitter about "smoothskins". A few lose
  their minds and become **Hollow Ones** (feral, hostile).
- **The Keepers of the Archive**: a scholarly order that hoards pre-war
  technology in a fortified bunker. Formal, suspicious, honourable.
- **The Grafted**: huge grey-green brutes with iron collars, made by dipping
  captives into vats of a pre-war mutagen ("the Bloom") at Fort Kessler. Many
  are simple-minded; a few keep their minds. They obey a signal called
  **the Hymn**, broadcast from the Glass Cathedral.
- **The Shepherd**: once a pre-war military scientist named Aurelio Vance,
  now fused to the Cathedral's broadcast machinery, convinced the Grafted are
  humanity's next flock. Wants "pure stock" (shelter dwellers) for the vats.
- **Raiders** of Vultures' Roost.

## Main quest

**Act 1: The Hydro-Core** (150-day water deadline; buying water deliveries at
the Bazaar adds time.)

1. Shelter 29. Warden Ilse Marrow sends you out. Archivist Nell and the records
   terminal say Shelter 7 is under **Calder City** (the Calder Ruins).
   Cinder Creek is revealed on the map.
2. Cinder Creek and the Bazaar give directions and reveal other locations.
   `c.reveal('calder')` should be given by at least two different people
   (e.g. Cinder Creek elder and the Bazaar cartographer) so the player cannot
   get stuck.
3. **Calder Ruins**: the Withered town sits on top of the old transit station.
   Shelter 7's entrance is below. The Withered leader must be persuaded, helped,
   or bypassed to get in. Shelter 7 is dark, partly flooded, full of Hollow
   Ones and a sentry drone or two. Its water chamber holds the **hydroCore**
   item. Shelter 7's terminal logs describe the residents being taken alive by
   "grey giants with iron collars" (the Grafted). Set flag `shelter7Logs`.
4. Return to Shelter 29, install the core (Engineer Ferrante). Act 2 begins:
   `armyDeadline` is set to 180 days; quest `grafted` starts and the Bazaar is
   revealed.

**Act 2: The Grafted**

5. Clues about Fort Kessler and the Glass Cathedral come from: the Bazaar's
   missing-caravan investigation, the Keepers of the Archive, captured or
   talkative Grafted, and Shelter 7's logs. Both `kessler` and `cathedral`
   must be revealable from at least two sources.
6. **Fort Kessler** (quest `vats`): destroy the Bloom vats (demolition charge
   on the reactor, or a Science overload at the control terminal, or Repair to
   sabotage the coolant). Complete with `c.questDone('vats')`.
7. **Glass Cathedral** (quest `shepherd`): reach the Shepherd. Resolutions:
   kill him; Science: silence the Hymn transmitter (frees the Grafted's minds);
   Speech: convince his Grafted lieutenant **Ashgrave**, who kept his mind, to
   turn on him. Complete with `c.questDone('shepherd')`.
8. Return to the Warden to win (`warden` dialogue handles the finale).

## Locations (world map ids)

| id | name | map ids | owner |
|---|---|---|---|
| shelter29 | Shelter 29 | shelter29, shelter29_cave | core |
| cinder_creek | Cinder Creek | cinder_creek, beetle_den | agent A |
| vultures_roost | Vultures' Roost | vultures_roost | agent A |
| rustwater | Rustwater | rustwater | agent B |
| bazaar | Crossroads Bazaar | bazaar | agent B |
| calder | Calder Ruins | calder, shelter7 | agent C |
| archive | The Archive | archive | agent C |
| kessler | Fort Kessler | kessler | agent D |
| cathedral | Glass Cathedral | cathedral | agent D |

World positions are in `src/content/locations.ts` (do not change them).

## Area outlines

### Cinder Creek (agent A)
Adobe farming village around a well that is going dry, fields of stunted
corn, a few dust oxen. Elder **Hattie Voss** (old, sharp). Guard captain
**Dag Oyelaran**. A healer **Mother Pim** who sells root poultices and
antivenom. Quests:
- **Burrowers in the Wells**: burrower beetles are nesting in the dry
  aquifer cave (map `beetle_den`) and attacking the well-diggers. Kill the
  Matriarch. Reward scrip, reputation.
- **Wren's Rescue**: Hattie's granddaughter **Wren** (a young scout, handy
  with a rifle) was taken by raiders to Vultures' Roost. Rescue her; she can
  join as a companion.
- Small: fix the windpump (Repair), treat a sick ox (Doctor), etc.
- Hattie tells you about the Bazaar and Rustwater and reveals them; she has
  heard Calder was "where the old shelters were" and reveals `calder` if asked.

### Vultures' Roost (agent A)
Raider camp in a canyon: tents, a scrap palisade, a cage where Wren is held.
Leader **Mother Kestrel**, a scarred woman who respects strength. Ways in:
fight, sneak and pick the cage, buy Wren (500 scrip, Barter lowers it), or
challenge Kestrel to a one-on-one fight (Unarmed) for Wren's freedom.

### Rustwater (agent B)
Scrap-walled town of car bodies and sheet metal. Sheriff **Amos Grell**
(tired, honest). **Silas Mott** owns the Lucky Rivet casino and runs thugs.
**Doc Imani Sato** (clinic: heals for scrip, sells hypos). Bar: the Tin Cup
(bartender **Fitch**, rumours). Scrapyard dog **Bramble** (feed him dried meat
and he joins you; dog companion). Quests:
- **Trouble in Rustwater**: Mott plans to kill Grell during a staged
  robbery. Side with Grell (warn him, fight Mott's thugs) or with Mott (help
  the hit). Outcome flags feed the ending.
- **Missing Brother** or similar side quest.
- Rustwater folk know the Bazaar and reveal it.

### Crossroads Bazaar (agent B)
The biggest market. **Pell's Provisions** (general goods), **Brasswick
Arms** (guns, ammo, armor), the **Aqueduct Company** water sellers (can send a
water caravan to Shelter 29: +60 days for 1500 scrip, once, or cheaper with a
quest), **Longhaul Caravans** (caravan master **Odessa Crane**), cartographer
**Old Nessa** (sells the location of Calder, reveals `calder`), a Keepers
recruiter. A hireable mercenary **Juno Kale** (sharpshooter companion).
Quests:
- **Missing Caravans** (act 2 key): caravans vanish on the east road. The
  investigation leads to evidence that the Grafted take the drivers alive to
  Fort Kessler: reveals `kessler`.
- **Water for the Shelter** (quest `water_delivery`).
- A thieves' or merchant-house intrigue side quest.

### Calder Ruins (agent C)
Ruined skyscraper stumps; a Withered town built into the transit station
concourse, led by **Tamsin Hale** (Withered, pragmatic). A cult-like group,
**the Sealed**, guard Shelter 7's door as a holy relic. Hollow Ones roam the
radioactive outer streets (use `rads` zones). Getting into Shelter 7: help
Tamsin (e.g. restore the concourse pump with Repair/Science, or clear the
Hollow Ones from the market), persuade the Sealed's priest, or pick the
maintenance hatch lock / sneak through a sewer. Shelter 7 (map `shelter7`):
dark, flooded corridors, Hollow Ones, a sentry drone; the hydro-core sits in
the water chamber; the Warden's-office terminal holds the logs about the
Grafted (`c.set('shelter7Logs')`, reveal `archive`).

### The Archive (agent C)
A concrete bunker with a blast door. The Keepers: **Scribe-Commander Odile
Varga**, weaponsmith **Brother Tomas**, the librarian **Sister Ada**.
They distrust outsiders. Quest: **Trial of the Archive**: retrieve a pre-war
data spindle (put it in the Calder Ruins or a random-looking side room) to
be accepted as an initiate: access to their armory (laser weapons, composite
armor, and eventually the Aegis Frame) and their knowledge: they know about
Fort Kessler (reveal `kessler`) and suspect the Glass Cathedral broadcasts
something (reveal `cathedral`). They may lend Keepers to the final assault
(set a flag the endings read).

### Fort Kessler (agent D)
Pre-war base in the glowing craters (high radiation outside, lower inside).
Perimeter fence, Grafted guards and sentry drones, captives in pens, the vat
hall with bubbling Bloom vats, a reactor, a control room. Grafted guards may
be talked past with a disguise or speech (a Grafted who kept his mind),
or fought. Destroy the vats. Free the captives (karma, ending slide).
Grafted logs reveal the Glass Cathedral.

### Glass Cathedral (agent D)
A domed pre-war observatory on the southern cliffs, turned church of the
Hymn. Robed human acolytes ("the Choir") and Grafted guards. The Shepherd
sits wired into the transmitter under the dome. Lieutenant **Ashgrave**.
Resolutions as above. Then the player returns to the Warden.

## Endings

Each area adds `defineEndings` slides (`order`: 10 Cinder Creek, 20 Vultures'
Roost, 30 Rustwater, 40 Bazaar, 50 Calder, 60 Archive, 70 Kessler, 80
Cathedral, 90 companions). Each slide's `text(c)` returns a paragraph based on
flags, or `null` to skip. Shelter 29's slide (order 0) is already written.
