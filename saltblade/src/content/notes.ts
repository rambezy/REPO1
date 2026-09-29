// Field notes: how the waste's harder trades work, written into the Codex the
// first time your people run into them (see ui/hints).

export interface Note { key: string; title: string; text: string }

export const NOTES: Note[] = [
  {
    key: 'machines', title: 'The Old Machines',
    text: 'Sentinels still enforce the civic code of a city a thousand years dead; saw drones prune orchards that are long gone, politely; warbots have nothing to say but war. They guard the Makers\' foundries in the Rust, the Glass and the Ash, and fire beams that need no ammunition. They do not bleed and they do not heal: knocked down, a machine stays down. Then it can be salvaged for servo motors, energy cells, optics and, now and then, a whole limb (right-click it). With Robotics and a few Electrical Components it can instead be reprogrammed to serve you. Fail, and it wakes with its old orders. Blunt weapons and pry bars hurt machines most.',
  },
  {
    key: 'limbs', title: 'Iron limbs',
    text: 'A lost arm or leg can be replaced. Fitting a prosthetic needs a built Robotics Bench, a robotics shop close by, or a squadmate with some Robotics standing near. A metal limb takes blows like the one it replaced, but its plating turns part of each, it never bleeds, and it is never cut off. Beaten to nothing it is wrecked and useless until someone mends it with a repair kit (First aid, worked by Robotics). Scrap limbs are cheap and clumsy; standard and Warden limbs are better, and need servo motors. Machine Grafting rebuilds the Old Machines\' own limbs from salvage: the Sentinel arm, the drone manipulator, the strider leg. Limbs can be taken off again, yours at a bench and a downed enemy\'s from the loot window, and keep their dents.',
  },
  {
    key: 'drugs', title: 'Leaf, dust and rage',
    text: 'Three crops grow where little else will. Dreamleaf wants wet, rich ground; bloodthorn wants heat and dry sand; glowcaps want damp shade and grow by night. A drug lab (Narcotics) turns them into dreamsmoke, a painkiller that dulls the eyes; glowdust, hours of quick feet and sharp eyes and then a crash; and redrage, strength for an hour and no pain at all, and then everything hurts. Take them from the pack (right-click). Every dose feeds a habit. Leave a habit unfed and it turns to withdrawal: shaking hands, bad eyes, and in the end a craving that takes whatever is in the pack. Habits fade over days without. Bandits carry redrage too, and take it when a fight starts.',
  },
  {
    key: 'law', title: 'The Covenant\'s law',
    text: 'The Ember Covenant burns leaf and those who carry it. Using in front of their watch is a crime. Their patrols stop travellers on the road once a day, and their town watch now and then, to search every pack. What they find goes to a watch house\'s confiscated goods chest, where a thief might get it back, or onto the fire. Then you pay a fine of more than half its worth, or carry a bounty. A smuggler\'s pack hides most of what is in it, and a light-fingered carrier hides more. A gift for the Ember sometimes works; when it does not, they search twice as hard. The Concord bans glowdust and redrage too, and its shops will not buy them.',
  },
];

export const NOTE: Record<string, Note> = Object.fromEntries(NOTES.map((n) => [n.key, n]));
