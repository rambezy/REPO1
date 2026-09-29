// World map locations and the main-quest definitions shared across areas.

import { defineLocations, defineQuests } from './registry';
import { defineItems } from '../data/items';

defineLocations([
  { id: 'shelter29', name: 'Shelter 29', x: 8, y: 8, map: 'shelter29_cave', entrance: 'default', size: 1, known: true, desc: 'Home. A sealed fallout shelter dug into the Ember Hills.' },
  { id: 'cinder_creek', name: 'Cinder Creek', x: 13, y: 12, map: 'cinder_creek', size: 1, desc: 'A farming village of adobe huts around a failing well.' },
  { id: 'vultures_roost', name: "Vultures' Roost", x: 20, y: 5, map: 'vultures_roost', size: 1, desc: 'A raider camp in a dry canyon.' },
  { id: 'rustwater', name: 'Rustwater', x: 13, y: 21, map: 'rustwater', size: 2, desc: 'A walled town built out of scrap and car bodies.' },
  { id: 'bazaar', name: 'Crossroads Bazaar', x: 24, y: 16, map: 'bazaar', size: 2, desc: 'The biggest market in the Basin, where the caravan roads meet.' },
  { id: 'calder', name: 'Calder Ruins', x: 33, y: 24, map: 'calder', size: 2, desc: 'The shattered remains of Calder City, home to the Withered.' },
  { id: 'archive', name: 'The Archive', x: 30, y: 9, map: 'archive', size: 1, desc: 'A fortified bunker held by the Keepers of the Archive.' },
  { id: 'kessler', name: 'Fort Kessler', x: 38, y: 5, map: 'kessler', size: 1, desc: 'A pre-war military base in the glowing crater lands.' },
  { id: 'cathedral', name: 'Glass Cathedral', x: 9, y: 28, map: 'cathedral', size: 1, desc: 'A domed observatory on the southern cliffs, now a place of worship.' },
]);

defineItems([
  { id: 'hydroCore', name: 'HC-40 Hydro-Core', type: 'misc', weight: 6, value: 5000, icon: 'core', quest: true, desc: 'A water purification core module, stamped "HC-40 AQUIFER REGULATOR". The thing Shelter 29 needs to survive.' },
  { id: 'wardenLetter', name: 'Warden\'s Letter', type: 'misc', weight: 0, value: 0, icon: 'letter', quest: true, desc: 'A letter of introduction signed by Warden Marrow of Shelter 29.' },
  { id: 'shelterPhoto', name: 'Faded Photograph', type: 'misc', weight: 0, value: 1, icon: 'letter', desc: 'Your family in front of the shelter garden lamps. Everyone is squinting.' },
  { id: 'shelterPass', name: 'Shelter 29 Pass', type: 'key', weight: 0, value: 0, icon: 'keycard', quest: true, desc: 'Opens the great hatch of Shelter 29 from outside.' },
]);

defineQuests([
  { id: 'hydrocore', title: 'Find a new hydro-core', area: 'shelter29', xp: 2000, desc: 'The shelter will run out of water. Find a replacement HC-40 hydro-core and bring it home.' },
  { id: 'grafted', title: 'Stop the Grafted', area: 'shelter29', xp: 3000, desc: 'The Grafted are taking people. Find where they are made and who commands them.' },
  { id: 'vats', title: 'Destroy the vats at Fort Kessler', area: 'kessler', xp: 5000, desc: 'The Grafted are made in vats at Fort Kessler.' },
  { id: 'shepherd', title: 'Deal with the Shepherd', area: 'cathedral', xp: 5000, desc: 'The one who commands the Grafted waits in the Glass Cathedral.' },
  { id: 'water_delivery', title: 'Buy time for the shelter', area: 'bazaar', desc: 'Water merchants could haul water to Shelter 29.' },
]);
