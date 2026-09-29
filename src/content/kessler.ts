// Fort Kessler: the pre-war base in the crater lands where the Grafted are made.
// Maps: `kessler` (the fenced base, outdoors) and `kessler_labs` (the vat complex
// under the bunker). Quest `vats`.

import { defineMap, defineDialogues, defineObjScripts, defineDeathScripts, defineEndings, OBJ_SCRIPTS } from './registry';
import { defineItems } from '../data/items';
import { defineProtos, S } from '../data/protos';
import type { Ctx, ObjSpawn, NpcSpawn, MapObject } from '../game/types';
import { G, player } from '../game/G';
import { on, msg } from '../game/log';
import { explodeAt, kill } from '../game/combat';
import { ctx } from '../game/script';
import { fx } from '../render/fx';
import { sfx } from '../audio/sfx';
import { hexDist } from '../core/hex';

// --------------------------------------------------------------------- items & protos

defineItems([
  { id: 'kf_writ', name: 'Choir Transfer Writ', type: 'misc', weight: 0, value: 5, icon: 'letter', desc: 'A square of vellum stamped with a hollow circle, the mark of the Choir. "Bearer escorts stock to Kessler. Let no collar hinder." The courier who carried it will not be needing it.' },
  { id: 'kf_penKey', name: 'Pen Key', type: 'key', weight: 0, value: 0, icon: 'key', desc: 'A heavy iron key on a loop of wire. It opens the captive pens at Fort Kessler.' },
  { id: 'kf_codes', name: 'Handler\'s Code Card', type: 'key', weight: 0, value: 0, icon: 'keycard', desc: 'A laminated pre-war code card, re-stamped with the Choir\'s circle. Opens the Kessler armory and unlocks the vat control terminal.' },
  { id: 'kf_intakeFile', name: 'Intake Record 0117', type: 'misc', weight: 0, value: 0, icon: 'holotape', quest: true, desc: 'A copy of a Kessler intake record. Subject 0117: Garran Ash, Longhaul caravan guard. Current designation: ASHGRAVE. Director\'s annotation: "He is beginning to remember. Retune at next cycle."' },
]);

defineProtos([
  { id: 'kfCaptive', name: 'Captive', desc: 'a hollow-eyed captive in the rags of a traveller', look: { body: 'human', skin: '#b88a60', hair: '#3a2718', hairStyle: 'short', outfit: '#6a6258', outfit2: '#4a443c' }, stats: S(4, 5, 4, 5, 5, 5, 5), hp: 20, xp: 10, team: 'neutral', hostile: false },
  { id: 'kfTender', name: 'Choir Tender', desc: 'a Choir tender in a stained grey robe, humming to himself', look: { body: 'human', skin: '#c8a080', hair: '#222', hairStyle: 'hood', outfit: '#6a6a70', outfit2: '#3a3a40' }, stats: S(5, 6, 5, 4, 6, 6, 5), xp: 120, skills: { energy: 70, melee: 50 }, equip: ['laserPistol', 'robe'], inv: [{ id: 'cell', n: 20 }, { id: 'hypo', chance: 50 }], team: 'kessler', hostile: true, fleeAt: 0.25 },
]);

// --------------------------------------------------------------------- helpers

const HOSTILE_FLAGS = ['kf_alarm', 'hostile:kessler:kessler', 'hostile:kessler_labs:kessler'];

function alarmed(c: Ctx): boolean {
  return HOSTILE_FLAGS.some((f) => !!c.flag(f));
}

/** Garrison hostility on the current map follows the passage and alarm flags. */
function syncGarrison(c: Ctx) {
  const m = G.map;
  if (!m || (m.def.id !== 'kessler' && m.def.id !== 'kessler_labs')) return;
  const hostile = alarmed(c) || !c.flag('kf_passage');
  for (const a of m.actors) {
    if (a.team !== 'kessler' || a.dead || a.companion) continue;
    a.hostile = a.npc === 'kf_gatekeeper' ? alarmed(c) : hostile;
  }
}

function raiseAlarm(c: Ctx, text?: string) {
  if (!c.flag('kf_alarm')) {
    c.set('kf_alarm');
    if (text) c.msg(text);
  }
  syncGarrison(c);
}

function mapObjects(mapId: string): MapObject[] | undefined {
  if (G.map?.def.id === mapId) return G.map.objects;
  return G.state.maps[mapId]?.objects;
}

function openGate() {
  const o = mapObjects('kessler')?.find((x) => x.id === 'kf_gate');
  if (o) {
    o.locked = 0;
    o.open = true;
  }
  if (G.map) G.map.version++;
}

function grantPassage(c: Ctx) {
  if (!c.flag('kf_passage')) c.msg('The garrison of Fort Kessler will let you pass, for now.');
  c.set('kf_passage');
  openGate();
  syncGarrison(c);
}

function penOpen(c: Ctx): boolean {
  const d = mapObjects('kessler')?.find((o) => o.id === 'kf_penDoor');
  return !!d && (!!d.open || !d.locked);
}

function canLeave(c: Ctx): boolean {
  const m = G.map;
  const clear = !!m && !m.actors.some((a) => a.team === 'kessler' && !a.dead && a.hostile);
  return clear || !!c.flag('kf_sabelAlly') || (!!c.flag('kf_passage') && !alarmed(c));
}

const CAPTIVES = ['kf_mireille', 'kf_captive0', 'kf_captive1', 'kf_captive2', 'kf_captive3'];

function freeCaptives(c: Ctx) {
  if (c.flag('kf_captivesFreed')) return;
  c.set('kf_captivesFreed');
  let n = 0;
  for (const id of CAPTIVES) {
    const a = c.npc(id);
    if (a && !a.dead) {
      n++;
      c.remove(id);
    }
  }
  c.set('kf_captivesSaved', n);
  c.karma(60);
  c.xp(500);
  c.rep('bazaar', 15);
  c.quest('vats', `You got ${n} captives out of the Kessler pens. They are making for the Crossroads Bazaar.`);
}

/** Tell the player to go home once both endgame quests are done. */
export function endgameCheck(c: Ctx) {
  if (c.questState('vats') === 'done' && c.questState('shepherd') === 'done' && !c.flag('kf_toldGoHome')) {
    c.set('kf_toldGoHome');
    c.quest('grafted', 'The vats are gone and the Shepherd is finished. Return to Warden Marrow at Shelter 29.');
    c.msg('The vats are destroyed and the Shepherd is finished. It is time to go home to Shelter 29 and tell the Warden.');
  }
}

function vatsDestroyed(c: Ctx, how: 'charge' | 'overload' | 'coolant') {
  if (c.flag('kf_vatsDestroyed')) return;
  c.set('kf_vatsDestroyed');
  c.set('kf_vatsHow', how);
  c.set('kf_doomAt', null);
  for (const o of mapObjects('kessler_labs') ?? []) {
    if (o.kind === 'vat') o.used = true;
    if (o.id === 'kf_reactor' && how === 'charge') o.used = true;
    if (o.id === 'kf_control' && how !== 'coolant') o.used = true;
  }
  const note = how === 'charge'
    ? 'The reactor under Fort Kessler went up and took the vat hall with it. No more Grafted will come out of Kessler.'
    : how === 'overload'
      ? 'You ran the vat heaters past their limits. The Bloom boiled and the vats split. No more Grafted will come out of Kessler.'
      : 'You reversed the coolant. The vats cooked themselves quietly and the Bloom turned to grey sludge. No more Grafted will come out of Kessler.';
  c.questDone('vats', note);
  c.karma(40);
  endgameCheck(c);
}

function startDoom(c: Ctx, kind: 'charge' | 'overload' | 'coolant', minutes: number) {
  c.set('kf_doomKind', kind);
  c.set('kf_doomAt', c.time() + minutes);
  c.set('kf_doomTick', minutes);
}

const DOOM_TEXT: Record<string, (n: number) => string> = {
  charge: (n) => `The demolition charge on the reactor: ${n} minute${n === 1 ? '' : 's'} left.`,
  overload: (n) => `Klaxons. The vat heaters are running away: about ${n} minute${n === 1 ? '' : 's'} until the vats split.`,
  coolant: (n) => `Pipes knock and shudder. The vats are heating: about ${n} minute${n === 1 ? '' : 's'} to go.`,
};

const BLAST: any = {
  weapon: { skill: 'traps', dmg: [90, 160], dmgType: 'explode', range: 0, modes: ['single'], ap: 0, minST: 0, hands: 1, radius: 7 },
  stack: null,
};

let resolving = false;

async function resolveDoom() {
  const c = ctx();
  const kind = c.flag('kf_doomKind') as 'charge' | 'overload' | 'coolant';
  const here = G.map?.def.id;
  if (kind === 'charge') {
    c.set('kf_labsCollapsed');
    if (here === 'kessler_labs' && G.map) {
      const r = G.map.objects.find((o) => o.id === 'kf_reactor');
      msg('The charge goes off. For an instant the reactor hall is brighter than the sun.');
      if (r) {
        r.used = true;
        await explodeAt(null, { q: r.q, r: r.r }, BLAST);
      }
      fx.shake(16);
      const m = G.map;
      if (m) {
        for (const a of m.livingActors()) {
          if (a === player() || a.companion) continue;
          if (a.team === 'kessler') kill(a, null, 'explode');
        }
      }
      const p = player();
      if (!p.dead) {
        const d = r ? hexDist(p, r) : 20;
        const hurt = d < 15 ? 30 : 12;
        p.hp = Math.max(1, p.hp - hurt);
        msg(`The ceiling comes down in slabs. You are battered by falling concrete (${hurt} damage). Get out!`);
      }
    } else if (here === 'kessler') {
      sfx('explode');
      fx.shake(14);
      msg('The ground heaves under Fort Kessler. A column of fire punches up through the bunker roof, and the lift shaft vomits smoke.');
    } else {
      msg('Behind you, far off, a dull thump rolls across the wastes. A column of smoke rises over the crater lands.');
    }
  } else if (kind === 'overload') {
    if (here === 'kessler_labs') {
      sfx('explode');
      fx.shake(8);
      msg('From the vat hall comes a sound like a giant cracking its knuckles, then the wet crash of glass. The Bloom is boiling out across the floor.');
    } else msg('Somewhere below Fort Kessler, the vats burst.');
  } else {
    if (here === 'kessler_labs') {
      sfx('hit');
      msg('A long sigh of steam from the vat hall. The green in the vats has gone the colour of dishwater, then of ash.');
    } else msg('Somewhere below Fort Kessler, the vats go quiet.');
  }
  vatsDestroyed(c, kind);
  if (G.map?.def.id === 'kessler' || G.map?.def.id === 'kessler_labs') syncGarrison(c);
}

on('time', () => {
  const s = G.state;
  if (!s || s.ended || resolving) return;
  const at = s.flags.kf_doomAt;
  if (typeof at !== 'number' || s.flags.kf_vatsDestroyed) return;
  const left = at - s.time;
  if (left <= 0) {
    resolving = true;
    resolveDoom().finally(() => {
      resolving = false;
    });
    return;
  }
  const whole = Math.ceil(left);
  if (s.flags.kf_doomTick !== whole) {
    s.flags.kf_doomTick = whole;
    const where = G.map?.def.id;
    if (where === 'kessler' || where === 'kessler_labs') msg(DOOM_TEXT[s.flags.kf_doomKind]?.(whole) ?? '');
  }
});

// --------------------------------------------------------------------- maps

// BEGIN GENERATED (tools: scratchpad mapgen.py)
const KF_ROWS = [
  "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
  "R.........o.......o..................o.o...........o...R",
  "R............o........o................................R",
  "R.....;;;;;;....##################;;##################.R",
  "RR...;ggggg;.\"..#,.,,,,,,,,.,,.,.,,,,,,,,,,,,,,,.,,,;#.R",
  "R.\".;gggggg;....#,,%%%%%%%%%%%%%%,,..BBBBBBBBBBBBBBB,#.R",
  "R..;ggggggg;....#,,%cccccccccccc%,,,,B,,,,,,,,,,,,,B,#.R",
  "RR;gggggggg;..\".#.;%cccccccccccc%,,,,B,,,,,,,,,,,,,B,#.R",
  "R;ggggggggg;....#,.%cccccccccccc%,,,,B,,,,,,,,,,,,,B,#.R",
  "RRgggggggg;.....#,,%cccccccccccc%,,,,B,,,,,,,,,,,,,B.#.R",
  "R;ggggggg;.o....#,,%cccccccccccc%,,,,B,,,,,,,,,,,,,B,#.R",
  "RRgggggg;.......#,,%cccccccccccc%,,,,B,,,,,,,,,,,,,B,#.R",
  "RRggggg;........#,,%cccccccccccc%,,,,B,,,,,,,,,,,,,B,#.R",
  "R;;;;;;.........#,,%%%%%%+%%%%%%%,,,,B,,,,,,,,,,,,,B,#.R",
  "R....\"..........#,,,,,,,,,,,,,,,,,,,,BBBBBB,,,BBBBBB;#.R",
  "RR..............#,,,,,,,,,,,,..,,,,,,,,,,,,,,,,,,,,,,#.R",
  "RR..............#,,,,,BB,,,,,,,,.,,,,,,,,,,,,,,,,.,,,#.R",
  "R............\"..#,,,,B.c,,.,,,.,,,,,,,;,,,,,,,,,,,,,,#.R",
  "R............\"o.#,,,,BB,,.,,,,,,,,,,.,,,,%%%%%%%%%%%,#.R",
  "R\"...\"...\"......#,,,,,,,,,,,,.,,,.,,,,,,,%______t__%,#.R",
  ">,,;,,;,,;,,;BB;#ssssssssssssssssssssssss%______t__%,#.R",
  ">,,,,,,,,,,,,,,,#cccccccccccccccccccccccc%______t__%,#.R",
  ">,,E,,,,,,,,,,,,,cccccccccccccccccccccccc%______t_X%,#.R",
  ">,,,,,,,,,,,,,,,#cccccccccccccccccccccccc+_____L__X%,#.R",
  ">R.......\".\".BB.#ssssssssssssssssssssssss%______t_X%,#.R",
  "RR..........o...#.,,,,,,,,,,,,,,,,,,.,,,,%______t__%,#.R",
  "RR\"....;;.......#,,,,,,,,,,,,,,,,,,,,,,,,%______t__%,#.R",
  "RR..\"...........#;,,,,,,,,,,,,,,,,,BB,,,.%______t__%,#.R",
  "R.........;;;;..#,,,,,,,,.;,,.,,,,B.c,,,,%%%%%%%%%%%,#.R",
  "RR.......;ggg;..#,,,,,;.,,,,,,,,,,BB,,,,,.,,,,,,,,,,,#.R",
  "R.......;gggg;..#.,,,,,,,.,,,,,,,,.,,,,,,,.,,,,,,,,,,#.R",
  "R...\";;;;;;;g;o.#,,####+#######+###,,,,,,,,,,,,,,,,,,#.R",
  "R...;gggggg;;...#,,#:::::::#::::::#,,BBBBBB,,,.BB,,,,#.R",
  "R..;ggggggg;..\".#,.#:::::::#::::::#,,B....B,,,B,c,,,,#.R",
  "RR;gggggggg;....#,,#::::::;#::::::#,,.....B;,,BB,.,,,#.R",
  "RRggggggggg;....#,,#:::;:::#::::::#,,B....B.,,.,,,,,,#.R",
  "RRggggggggg;..\".#,,#:::::;:#::::::#,,BBBBBB,,,,,,,,,,#.R",
  "Rgggggggggg;....#,,#:::::::#::::::#.,,,,.,,,,,,,,,,,,#.R",
  "Rggggggggg;.....#,,#:;:::;:#::::::#,,,,,,,,,,,,,,,,,,#.R",
  "RRggggggg;......#,,#::::::;#::::::#,,,,,,,,,,.,.,,,,,#.R",
  "Rggggggg;.......#,,################,,,,,,,.,,,,.,,,,,#.R",
  "Rgggggg;o.......#,,,,,,,,,,,,,,,,,.,,,,,,,,,,,,,,.,,,#.R",
  "RRgggg;.........######################################.R",
  "R;;;;;\"..................;gggg;........................R",
  "R.......................;gggg..........................R",
  "RRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRRR",
];
const KF_OBJS: ObjSpawn[] = [
  { kind: "gate", at: [16, 22], id: "kf_gate", locked: 80, name: "perimeter gate" },
  { kind: "radsign", at: [12, 19] },
  { kind: "sign", at: [15, 25], name: "sign", desc: "a stencilled sign: FORT KESSLER. MORPHOGENIC RESEARCH DIVISION. AUTHORISED PERSONNEL ONLY" },
  { kind: "debris", at: [33, 2], name: "torn fence" },
  { kind: "bunk", at: [20, 6] },
  { kind: "footlocker", at: [20, 7], inv: [{ id: "hypo", n: 1 }, { id: "ammo5", n: 40 }] },
  { kind: "bunk", at: [22, 6] },
  { kind: "bunk", at: [24, 6] },
  { kind: "footlocker", at: [24, 7], id: "kf_sergeantLocker", name: "sergeant's footlocker", locked: 30, inv: [{ id: "kf_penKey" }, { id: "ammo223", n: 20 }, { id: "scrip", n: 60 }] },
  { kind: "bunk", at: [26, 6] },
  { kind: "bunk", at: [28, 6] },
  { kind: "footlocker", at: [28, 7], inv: [{ id: "hypo", n: 1 }, { id: "ammo5", n: 40 }] },
  { kind: "bunk", at: [30, 6] },
  { kind: "table", at: [25, 10], tint: "#6a6e60" },
  { kind: "chair", at: [24, 10] },
  { kind: "chair", at: [26, 11] },
  { kind: "locker", at: [31, 10], name: "weapons locker", locked: 50, inv: [{ id: "assaultRifle" }, { id: "ammo223", n: 40 }, { id: "fragGrenade", n: 2 }] },
  { kind: "rack", at: [31, 8] },
  { kind: "barrel", at: [20, 11] },
  { kind: "toolbox", at: [20, 12], inv: [{ id: "toolkit" }] },
  { kind: "car", at: [39, 7], tint: "#4a5238", name: "military truck" },
  { kind: "car", at: [43, 7], tint: "#4a5238", name: "burned-out truck" },
  { kind: "tank", at: [49, 7], name: "fuel tank" },
  { kind: "tank", at: [49, 10], name: "fuel tank" },
  { kind: "generator", at: [40, 12], name: "field generator" },
  { kind: "crate", at: [46, 8], id: "kf_demoCrate", name: "munitions crate", locked: 40, inv: [{ id: "dynamite", n: 2 }, { id: "fragGrenade", n: 2 }] },
  { kind: "crate", at: [46, 9], inv: [{ id: "ammo5", n: 60 }, { id: "scrapMetal", n: 3 }] },
  { kind: "barrel", at: [47, 12] },
  { kind: "barrel", at: [48, 12], tint: "#6a3a2a" },
  { kind: "barrelc", at: [38, 12], inv: [{ id: "fuel", n: 5 }] },
  { kind: "toolbox", at: [42, 11], inv: [{ id: "scrapElectronics", n: 2 }] },
  { kind: "door", at: [41, 23], id: "kf_bunkerDoor", name: "bunker door" },
  { kind: "elevator", at: [50, 21], name: "freight lift" },
  { kind: "elevator", at: [50, 25], name: "freight lift" },
  { kind: "radsign", at: [43, 19] },
  { kind: "locker", at: [44, 27], inv: [{ id: "radPurge" }, { id: "iodine", n: 2 }] },
  { kind: "lamp", at: [46, 19] },
  { kind: "lamp", at: [46, 27] },
  { kind: "lamp", at: [20, 19] },
  { kind: "lamp", at: [22, 25] },
  { kind: "lamp", at: [28, 19] },
  { kind: "lamp", at: [30, 25] },
  { kind: "lamp", at: [36, 19] },
  { kind: "lamp", at: [38, 25] },
  { kind: "door", at: [23, 31], id: "kf_penDoor", name: "pen gate", locked: 50, key: "kf_penKey" },
  { kind: "door", at: [31, 31], id: "kf_penDoor2", name: "pen gate", locked: 50, key: "kf_penKey" },
  { kind: "bedroll", at: [20, 33] },
  { kind: "bedroll", at: [20, 36] },
  { kind: "bedroll", at: [21, 39] },
  { kind: "bedroll", at: [25, 39] },
  { kind: "bedroll", at: [26, 34] },
  { kind: "pile", at: [24, 37], name: "heap of rags", inv: [{ id: "jerky", n: 1 }] },
  { kind: "barrel", at: [26, 32], name: "water barrel" },
  { kind: "bones", at: [30, 36] },
  { kind: "bones", at: [32, 38] },
  { kind: "blood", at: [29, 34] },
  { kind: "cage", at: [33, 33] },
  { kind: "campfire", at: [40, 34] },
  { kind: "bedroll", at: [41, 33] },
  { kind: "bag", at: [39, 35], name: "Sabel's sack", inv: [{ id: "jerky", n: 3 }, { id: "water", n: 1 }] },
  { kind: "tank", at: [46, 38], name: "water tower" },
  { kind: "generator", at: [49, 38] },
  { kind: "crate", at: [44, 39], inv: [{ id: "hypo", n: 2 }, { id: "ammo9", n: 30 }] },
  { kind: "crate", at: [51, 40], inv: [{ id: "cell", n: 20 }] },
  { kind: "barrel", at: [50, 36] },
  { kind: "crate", at: [18, 27], inv: [{ id: "scrapMetal", n: 2 }] },
  { kind: "barrel", at: [18, 28] },
  { kind: "car", at: [6, 27], tint: "#6a5a4a", name: "wrecked cart" },
  { kind: "bones", at: [8, 27], name: "courier's remains" },
  { kind: "bag", at: [8, 26], name: "courier's satchel", inv: [{ id: "kf_writ" }, { id: "robe" }, { id: "radPurge" }, { id: "scrip", n: 40 }] },
  { kind: "blood", at: [9, 26] },
  { kind: "radsign", at: [12, 33] },
  { kind: "radsign", at: [10, 13] },
];
const KF_NPCS: NpcSpawn[] = [
  { proto: "grafted", at: [15, 21], id: "kf_gatekeeper", name: "Collar Forty-One", dialog: "kf_gate", team: "kessler", look: { skin: "#83906e" } },
  { proto: "grafted", at: [24, 22], wander: 4, team: "kessler" },
  { proto: "grafted", at: [33, 17], wander: 3, team: "kessler" },
  { proto: "grafted", at: [29, 29], wander: 4, team: "kessler" },
  { proto: "graftedGun", at: [39, 23], team: "kessler" },
  { proto: "sentry", at: [22, 17], team: "kessler" },
  { proto: "sentry", at: [47, 33], team: "kessler" },
  { proto: "grafted", at: [44, 10], wander: 3, team: "kessler" },
  { proto: "grafted", at: [38, 33], id: "kf_sabel", name: "Sabel", dialog: "kf_sabel", team: "neutral", hostile: false, look: { skin: "#8a9478", outfit: "#5a4a38" } },
  { proto: "kfCaptive", at: [23, 33], id: "kf_mireille", name: "Mireille Oka", dialog: "kf_mireille", look: { female: true, skin: "#a0704a", hair: "#222", hairStyle: "bun" } },
  { proto: "kfCaptive", at: [21, 35], id: "kf_captive0", name: "Captive", dialog: "kf_captive", wander: 1, look: { female: true, hair: "#6a3a1a", hairStyle: "long" } },
  { proto: "kfCaptive", at: [24, 36], id: "kf_captive1", name: "Captive", dialog: "kf_captive", wander: 1, look: { skin: "#6a4028", hairStyle: "bald" } },
  { proto: "kfCaptive", at: [22, 38], id: "kf_captive2", name: "Captive", dialog: "kf_captive", wander: 1, look: { skin: "#d8b090", hair: "#aa8844" } },
  { proto: "kfCaptive", at: [25, 34], id: "kf_captive3", name: "Captive", dialog: "kf_captive", wander: 1, look: { female: true, skin: "#8a5a38", hairStyle: "short" } },
];
const KF_ITEMS: { id: string; n?: number; at: [number, number] }[] = [
];

const KFL_ROWS = [
  "",
  "",
  "                             %%%%%%%%%%%%%%%%%%%%%%",
  "         #############       %,,,,,,,,,,,,,,,,,,,,%",
  "         #...........#       %,,,,,,,,,,,,,,,,,,,,%",
  "         #...........#       %,,,,,,,,,gggg,,,,,,,%",
  "         #...........#       %,,,,,,,,ggggg,,,,,,,%",
  "         #...........#       %,,,,,,,gggggg,,,,,,,%",
  "         #...........%%%%%%%%%,,,,,,ggggggg,,,,,,,%",
  "         #...........%,,,,,,,%,,,,,,gggggg,,,,,,,,%",
  "         #...........%,,,,,,,%,,,,,,ggggg,,,,,,,,,%",
  "         #...........%,,,,,,,%,,,,,,gggg,,,,,,,,,,%",
  "         #...........%,,,,,,,%,,,,,,,,,,,,,,,,,,,,%",
  "##########...........%,,,,,,,%,,,,,,,,,,,,,,,,,,,,%",
  "#,,,,,,,##...........%,,,,,,,%,,,,,,,,,,,,,,,,,,,,%",
  "#X,,,,,,#######+#####%%%%+%%%%%%%%%%%%%+%%%%%%%%%%%",
  "#X,,,,,,#s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s,s#",
  "#X,,U,,,+,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#",
  "#X,,,,,,#,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,,#",
  "#X,,,,,,######+#####%%%%%%%%%%+%%%%%%%%%%####+#####",
  "#,,,,,,,##==========%,,,,,,,,,,,,,,,,,,,,#,,,,,,,,#",
  "##########==========%,xxxxxxxxxxxxxxxxxx,#,,,,,,,,#",
  "         #==========%,xxxxxxxxxxxxxxxxxx,#,,,,,,,,#",
  "         #==========%,xxxxxxxxxxxxxxxxxx,#,,,,,,,,#",
  "         #==========%,xxxxxxxxxxxxxxxxxx,#,,,,,,,,#",
  "         #==========%,,,,,,,,,,,,,,,,,,,,#,,,,,,,,#",
  "         #==========+s,s,s,s,s,s,s,s,s,s,+,,,,,,,,#",
  "         #==========%,,,,,,,,,,,,,,,,,,,,#,,,,,,,,#",
  "         #==========%,xxxxxxxxxxxxxxxxxx,#,,,,,,,,#",
  "         #==========%,xxxxxxxxxxxxxxxxxx,#,,,,,,,,#",
  "         #==========%,xxxxxxxxxxxxxxxxxx,#,,,,,,,,#",
  "         ###########%,xxxxxxxxxxxxxxxxxx,##########",
  "                    %,,,,,,,,,,,,,,,,,,,,%",
  "                    %,,,,,,,,,,,,,,,,,,,,%",
  "                    %%%%%%%%%%%%%%%%%%%%%%",
  "",
];
const KFL_OBJS: ObjSpawn[] = [
  { kind: "elevator", at: [1, 14], name: "freight lift" },
  { kind: "elevator", at: [1, 20], name: "freight lift" },
  { kind: "radsign", at: [6, 14] },
  { kind: "locker", at: [6, 20], inv: [{ id: "iodine", n: 1 }, { id: "flare", n: 2 }] },
  { kind: "door", at: [25, 15], id: "kf_armoryDoor", name: "armory door", locked: 70, key: "kf_codes" },
  { kind: "terminal", at: [11, 4], id: "kf_records", name: "records terminal", onUse: "kf_records" },
  { kind: "console", at: [14, 4], name: "monitoring console" },
  { kind: "console", at: [16, 4], name: "monitoring console" },
  { kind: "terminal", at: [19, 4], id: "kf_control", name: "vat control terminal", onUse: "kf_control" },
  { kind: "desk", at: [12, 9], name: "handler's desk", inv: [{ id: "clarity", n: 1 }, { id: "cell", n: 20 }] },
  { kind: "chair", at: [13, 9] },
  { kind: "table", at: [18, 10], tint: "#7a7e80" },
  { kind: "chair", at: [17, 10] },
  { kind: "bookcase", at: [10, 13], name: "binders shelf" },
  { kind: "cabinet", at: [20, 13], inv: [{ id: "superHypo", n: 1 }] },
  { kind: "rug", at: [15, 8], tint: "#3a4a3a" },
  { kind: "rack", at: [22, 9] },
  { kind: "rack", at: [24, 9] },
  { kind: "locker", at: [27, 9], name: "armory locker", inv: [{ id: "plasmaRifle" }, { id: "fusion", n: 30 }] },
  { kind: "locker", at: [28, 12], name: "armory locker", inv: [{ id: "combatArmor" }, { id: "superHypo", n: 2 }] },
  { kind: "crate", at: [22, 13], inv: [{ id: "dynamite", n: 1 }, { id: "fragGrenade", n: 3 }] },
  { kind: "reactor", at: [39, 8], id: "kf_reactor", name: "Kessler reactor", onUse: "kf_reactor" },
  { kind: "pipe", at: [33, 4] },
  { kind: "pipe", at: [45, 4] },
  { kind: "pipe", at: [33, 12] },
  { kind: "pipe", at: [46, 12] },
  { kind: "generator", at: [31, 7], name: "step-down transformer" },
  { kind: "generator", at: [31, 10], name: "step-down transformer" },
  { kind: "tank", at: [48, 7], name: "heavy-water tank" },
  { kind: "tank", at: [48, 10], name: "heavy-water tank" },
  { kind: "radsign", at: [36, 13] },
  { kind: "console", at: [43, 3], name: "reactor console" },
  { kind: "toolbox", at: [42, 14], inv: [{ id: "toolkit" }, { id: "radPurge" }] },
  { kind: "table", at: [12, 22], tint: "#b0b8b8", name: "surgical table" },
  { kind: "table", at: [12, 26], tint: "#b0b8b8", name: "surgical table" },
  { kind: "cabinet", at: [17, 21], name: "medical cabinet", inv: [{ id: "hypo", n: 3 }, { id: "medkit" }] },
  { kind: "cabinet", at: [18, 21], name: "collar cabinet", inv: [{ id: "scrapElectronics", n: 3 }] },
  { kind: "sink", at: [11, 29] },
  { kind: "bed", at: [18, 29], tint: "#8a9090" },
  { kind: "blood", at: [15, 24] },
  { kind: "cage", at: [16, 28] },
  { kind: "fridge", at: [14, 30], inv: [{ id: "antidote", n: 2 }, { id: "radPurge", n: 1 }] },
  { kind: "vat", at: [24, 22], id: "kf_vat0", name: "Bloom vat", tint: "#5aa060", onUse: "kf_vat" },
  { kind: "vat", at: [28, 22], id: "kf_vat1", name: "Bloom vat", tint: "#5aa060", onUse: "kf_vat" },
  { kind: "vat", at: [32, 22], id: "kf_vat2", name: "Bloom vat", tint: "#5aa060", onUse: "kf_vat" },
  { kind: "vat", at: [36, 22], id: "kf_vat3", name: "Bloom vat", tint: "#5aa060", onUse: "kf_vat" },
  { kind: "vat", at: [24, 30], id: "kf_vat4", name: "Bloom vat", tint: "#5aa060", onUse: "kf_vat" },
  { kind: "vat", at: [28, 30], id: "kf_vat5", name: "Bloom vat", tint: "#5aa060", onUse: "kf_vat" },
  { kind: "vat", at: [32, 30], id: "kf_vat6", name: "Bloom vat", tint: "#5aa060", onUse: "kf_vat" },
  { kind: "vat", at: [36, 30], id: "kf_vat7", name: "Bloom vat", tint: "#5aa060", onUse: "kf_vat" },
  { kind: "lamp", at: [22, 20] },
  { kind: "lamp", at: [39, 20] },
  { kind: "lamp", at: [22, 33] },
  { kind: "lamp", at: [39, 33] },
  { kind: "pipe", at: [30, 33] },
  { kind: "pipe", at: [26, 33] },
  { kind: "pipe", at: [34, 33] },
  { kind: "generator", at: [46, 24], id: "kf_coolant", name: "coolant manifold", onUse: "kf_coolant" },
  { kind: "pipe", at: [43, 21] },
  { kind: "pipe", at: [47, 21] },
  { kind: "tank", at: [43, 29], name: "coolant tank" },
  { kind: "tank", at: [47, 29], name: "coolant tank" },
  { kind: "console", at: [49, 25], name: "pump console" },
  { kind: "grate", at: [42, 24] },
  { kind: "shelf", at: [49, 22], inv: [{ id: "toolkit" }, { id: "scrapMetal", n: 2 }] },
];
const KFL_NPCS: NpcSpawn[] = [
  { proto: "grafted", at: [26, 26], wander: 4, team: "kessler" },
  { proto: "grafted", at: [35, 26], wander: 4, team: "kessler" },
  { proto: "graftedGun", at: [33, 17], team: "kessler" },
  { proto: "sentry", at: [42, 10], team: "kessler" },
  { proto: "kfTender", at: [15, 11], name: "Choir Tender", wander: 2, team: "kessler" },
  { proto: "kfTender", at: [18, 25], name: "Choir Tender", wander: 2, team: "kessler" },
];
const KFL_ITEMS: { id: string; n?: number; at: [number, number] }[] = [
];
// END GENERATED

const captiveIf = (c: Ctx) => !c.flag('kf_captivesFreed');
for (const n of KF_NPCS) if (n.id && CAPTIVES.includes(n.id)) n.if = captiveIf;

defineMap({
  id: 'kessler',
  name: 'Fort Kessler',
  area: 'kessler',
  outdoor: true,
  floor: 'cracked',
  floor2: 'asphalt',
  wall: 'fence',
  wall2: 'concrete',
  music: 'wind',
  legend: {
    B: { wall: 'sandbag' },
    R: { wall: 'rock' },
    g: { floor: 'glow' },
    c: { floor: 'concrete' },
    s: { floor: 'asphalt', decor: 'stripe' },
    t: { floor: 'metal', decor: 'stripe' },
    X: { floor: 'metal', exit: 'labs' },
    L: { floor: 'metal', marker: 'L' },
    E: { floor: 'asphalt', marker: 'E' },
  },
  rows: KF_ROWS,
  entrances: { default: 'E', fromLabs: 'L' },
  exits: { out: { to: 'world' }, labs: { to: 'kessler_labs', entrance: 'default' } },
  objects: KF_OBJS,
  npcs: KF_NPCS,
  items: KF_ITEMS,
  rads: [
    { at: [6, 8], radius: 6, perMin: 4 },
    { at: [5, 37], radius: 7, perMin: 4 },
    { at: [10, 31], radius: 3, perMin: 2 },
    { at: [27, 44], radius: 3, perMin: 2 },
    { at: [8, 22], radius: 8, perMin: 0.6 },
  ],
  onEnter: (c: Ctx, first: boolean) => {
    if (c.questState('vats') === 'none') c.quest('vats', 'Fort Kessler squats in the glowing crater lands. Somewhere inside are the vats that make the Grafted. Destroy them.');
    if (first) {
      c.msg('Fort Kessler: a chain fence around a grey yard, a squat bunker, the smell of hot metal and something sweeter underneath. Your skin prickles. The craters out here are still hot.');
      if (!c.has('geiger')) c.msg('Without a rad counter you can only guess how much of the crater dust you are breathing.');
    }
    if (c.flag('kf_passage')) openGate();
    syncGarrison(c);
    if (c.flag('kf_labsCollapsed')) c.msg('Smoke still leaks from the bunker. The vats below are gone.');
  },
});

defineMap({
  id: 'kessler_labs',
  name: 'Kessler Vat Complex',
  area: 'kessler',
  floor: 'concrete',
  floor2: 'metal',
  wall: 'concrete',
  wall2: 'metal',
  dark: 0.25,
  music: 'shelter',
  legend: {
    g: { floor: 'glow' },
    x: { floor: 'toxic' },
    s: { floor: 'metal', decor: 'stripe' },
    X: { floor: 'metal', exit: 'up' },
    U: { floor: 'metal', marker: 'U' },
  },
  rows: KFL_ROWS,
  entrances: { default: 'U' },
  exits: { up: { to: 'kessler', entrance: 'fromLabs' } },
  objects: KFL_OBJS,
  npcs: KFL_NPCS,
  items: KFL_ITEMS,
  rads: [{ at: [39, 8], radius: 6, perMin: 3 }, { at: [30, 26], radius: 10, perMin: 0.4 }],
  onEnter: (c: Ctx, first: boolean) => {
    if (c.flag('kf_labsCollapsed') && !c.flag('kf_doomAt')) {
      c.msg('The lift drops a few yards and grinds to a halt against a wall of smoking rubble. There is nothing down there any more. You climb back out.');
      c.goto('kessler', 'fromLabs');
      return;
    }
    if (first) c.msg('The freight lift rattles down into warm, wet air. Somewhere ahead, liquid bubbles in a slow rhythm, like breathing.');
    syncGarrison(c);
  },
});

// --------------------------------------------------------------------- object scripts

const prevExplosive = OBJ_SCRIPTS['use:explosive'];

defineObjScripts({
  kf_reactor: (c) => {
    c.startDialog('kf_reactor');
    return true;
  },
  kf_control: (c) => {
    c.sound('terminal');
    c.startDialog('kf_control');
    return true;
  },
  kf_records: (c) => {
    c.sound('terminal');
    c.startDialog('kf_records');
    return true;
  },
  kf_coolant: (c) => {
    c.startDialog('kf_coolant');
    return true;
  },
  kf_vat: (c, o, _u, skill) => {
    if (o.used) {
      c.msg('The vat is dark. Grey sludge has settled at the bottom, and nothing moves in it.');
      return true;
    }
    if (skill) {
      c.msg('The vats are armoured glass on a steel frame, fed from the reactor and the control room. Breaking one would just mean they filled another. Go for the source.');
      return true;
    }
    c.msg(['A tall vat of green fluid, lit from below. Something the size of a man hangs in it, curled, and very slowly turns.', 'Bubbles climb the green column. Through the glass you can see an iron collar, already fitted, on a neck that is still growing.', 'The vat is labelled in stencil: BLOOM K-7 / CURING. Someone has scratched a name under it, then scratched the name out.'][c.random(3)]);
    return true;
  },
  'use:explosive': (c, o, user, skill) => {
    if (G.map?.def.id === 'kessler_labs') {
      const r = c.obj('kf_reactor');
      if (r && hexDist(user, r) <= 3) {
        c.startDialog('kf_reactor');
        return true;
      }
    }
    if (prevExplosive) return prevExplosive(c, o, user, skill);
    c.msg('The charge needs something worth destroying, and a steady hand to wire it (Traps). This is not the place.');
    return true;
  },
});

// --------------------------------------------------------------------- dialogue

const TERMINAL_LOOK = { body: 'robot' as const, skin: '#5a6468', bg: '#16221a' };

defineDialogues([
  // ---------------------------------------------------------------- gatekeeper
  {
    id: 'kf_gate',
    start: (c) => (c.flag('kf_passage') ? 'passed' : c.flag('kf_metGate') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('kf_metGate'),
        text: 'The Grafted by the gate is the size of a door and about as talkative. His iron collar has a number punched into it: 41. He turns his head toward you with the slow care of a man who has been told to be careful.\n\n"STOCK GOES TO THE PENS," he says, in a voice like a barrel rolling downhill. "HANDLERS SHOW WRIT. WHICH."',
        options: [
          { text: 'I\'m a handler. Here is my writ.', if: (c) => c.has('kf_writ'), to: 'writ' },
          { text: '[Speech] I\'m a handler. The Choir sent me. My writ blew away in the craters.', skill: { key: 'speech', diff: 45 }, to: 'bluff', fail: 'bluffFail' },
          { text: 'I\'m stock. Take me to the pens.', to: 'surrender' },
          { text: 'Me Grafted too. Just small.', lowInt: true, to: 'small' },
          { text: 'Who are you?', to: 'who' },
          { text: 'Neither. Step aside or I go through you.', combat: true, do: (c) => raiseAlarm(c) },
          { text: 'Never mind.', end: true },
        ],
      },
      again: {
        text: '"WHICH," says Forty-One, as if you had never left.',
        options: [
          { text: 'I\'m a handler. Here is my writ.', if: (c) => c.has('kf_writ'), to: 'writ' },
          { text: '[Speech] I\'m a handler. The Choir sent me.', if: (c) => !c.flag('kf_bluffFailed'), skill: { key: 'speech', diff: 45 }, to: 'bluff', fail: 'bluffFail' },
          { text: 'I\'m stock. Take me to the pens.', to: 'surrender' },
          { text: 'Me Grafted too. Just small.', lowInt: true, to: 'small' },
          { text: 'Never mind.', end: true },
        ],
      },
      who: {
        text: '"FORTY-ONE." A long pause, as if he is listening to something far away. "GATE." Another pause. "THE HYMN SAYS: GATE." He seems satisfied that this covers it.',
        options: [
          { text: 'What happens to the stock?', to: 'stock' },
          { text: 'Right. About getting in...', to: 'again' },
        ],
      },
      stock: {
        text: '"PENS. THEN DOWN." He points a finger like a fence post at the bunker. "THEN THEY COME UP BIG. LIKE ME." Something moves behind his eyes and goes away again. "IT IS GOOD. THE HYMN SAYS IT IS GOOD."',
        options: [{ text: 'I see.', to: 'again' }],
      },
      writ: {
        onEnter: (c) => grantPassage(c),
        text: 'Forty-One takes the writ between two enormous fingers and holds it very close to his face. He studies the Choir\'s hollow circle for a long time. Then he hands it back with surprising gentleness.\n\n"HANDLER. PASS." He hauls the gate open on its screaming track.',
        options: [{ text: 'Thank you, Forty-One.', end: true }],
      },
      bluff: {
        onEnter: (c) => grantPassage(c),
        text: 'You talk. You mention the Choir, the Cathedral, the Shepherd\'s great patience and the terrible state of the east road. Forty-One\'s brow furrows under the weight of so many words. Finally it smooths out, which seems to be a relief to both of you.\n\n"HANDLER. PASS." The gate screeches open.',
        options: [{ text: 'Much obliged.', end: true }],
      },
      bluffFail: {
        onEnter: (c) => c.set('kf_bluffFailed'),
        text: '"NO WRIT," he says. "NO PASS." He does not seem angry. He does not seem anything. He simply puts himself in front of the gate, which is roughly as effective as a second gate.',
        options: [
          { text: 'I\'m stock, then. Take me to the pens.', to: 'surrender' },
          { text: 'Fine. I\'m going.', end: true },
        ],
      },
      small: {
        onEnter: (c) => grantPassage(c),
        text: 'Forty-One looks down at you. You look up at Forty-One. Something enormous and slow happens inside his head.\n\n"SMALL," he says at last. "VAT MADE A SMALL ONE." He pats you on the head, which drives you an inch into the ground. "PASS, SMALL ONE. THE HYMN LOVES ALL SIZES." The gate grinds open.',
        options: [{ text: 'Thanks, big one!', lowInt: true, end: true }, { text: 'Thanks.', end: true }],
      },
      surrender: {
        text: '"STOCK." He nods, pleased to have one thing in the world settled. His hand closes over your shoulder like a bench vice. "PENS."',
        options: [
          { text: 'Lead the way.', end: true, do: (c) => surrender(c) },
          { text: 'On second thought... no.', to: 'again' },
        ],
      },
      passed: {
        text: '"HANDLER," Forty-One says, and goes back to listening to whatever only he can hear.',
        options: [{ text: 'Carry on.', end: true }],
      },
    },
  },

  // ---------------------------------------------------------------- Sabel
  {
    id: 'kf_sabel',
    start: (c) => {
      if (c.flag('kf_surrendered') && !c.flag('kf_surrenderDone')) return 'pen';
      if (c.flag('kf_vatsDestroyed') && !c.flag('kf_sabelThanked')) return 'vatsDone';
      if (c.stat('INT') <= 3 && !c.flag('kf_sabelMet')) return 'dumb';
      return c.flag('kf_sabelMet') ? 'again' : 'hello';
    },
    nodes: {
      hello: {
        onEnter: (c) => c.set('kf_sabelMet'),
        text: 'A Grafted sits on an upturned bucket beside the pens, whittling. The knife is lost in his fist; the thing he is carving is a tiny ox. When he speaks, the voice is gravel in a barrel, but the words come out whole and in the right order.\n\n"You\'re not stock, and you\'re not Choir. So you\'re either lost, or you\'re trouble." He blows dust off the ox. "I\'m hoping for trouble."',
        options: [
          { text: 'You can talk. Properly.', to: 'mind' },
          { text: 'Who are you?', to: 'who' },
          { text: 'Tell me about the vats.', to: 'vats' },
          { text: 'Who gives the orders here?', to: 'hymn' },
          { text: 'I\'m here to get those people out.', to: 'captives' },
          { text: 'I\'m leaving.', end: true },
        ],
      },
      again: {
        text: (c) => `Sabel looks up from his carving. ${c.flag('kf_vatsDestroyed') ? '"Still here? The Choir will come to see what happened. Don\'t be standing about when they do."' : '"Trouble. Good. What do you need?"'}`,
        options: [
          { text: 'How do you keep your mind?', to: 'mind' },
          { text: 'Tell me about the vats again.', if: (c) => !c.flag('kf_vatsDestroyed'), to: 'vats' },
          { text: 'Is there a way into the control room?', if: (c) => !c.has('kf_codes') && !c.flag('kf_vatsDestroyed'), to: 'codes' },
          { text: 'Where does the Hymn come from?', to: 'hymn' },
          { text: 'About the captives...', if: (c) => !c.flag('kf_captivesFreed'), to: 'captives' },
          { text: 'Can you get the guards off my back?', if: (c) => !c.flag('kf_passage') && !alarmed(c), to: 'vouch' },
          { text: 'What will you do when this is over?', to: 'after' },
          { text: 'Later, Sabel.', end: true },
        ],
      },
      who: {
        text: '"Sabel. Sabel Oduya, once. I drove oxen for Longhaul Caravans: Bazaar to the east settlements and back, twice a season, eleven years." He turns the little ox in his fingers. "Three summers ago the Grafted took my whole train on the east road. They dipped me in the Bloom with the rest. It takes most of you. It left me my arithmetic and my temper."',
        options: [
          { text: 'How did you keep your mind?', to: 'mind' },
          { text: 'I\'m sorry.', to: 'sorry' },
        ],
      },
      sorry: {
        text: '"So am I. Mostly for the oxen. They were good oxen." He almost smiles. "What do you want, trouble?"',
        options: [
          { text: 'Tell me about the vats.', to: 'vats' },
          { text: 'Who gives the orders here?', to: 'hymn' },
          { text: 'I want the captives out.', to: 'captives' },
        ],
      },
      mind: {
        text: '"The Hymn." He taps his collar, which rings dully. "Picture a choir in the next room, singing, always. Most of them go and sit in that room, and they never come out. It\'s warm in there. It tells you what to do and that it\'s good." He shrugs, a small landslide. "I count. Primes. Ox weights. Debts I\'m owed. You can\'t sing and count at the same time. So I stay out here, in the cold, with my sums."',
        options: [
          { text: 'Are there others like you?', to: 'others' },
          { text: 'Tell me about the vats.', to: 'vats' },
        ],
      },
      others: {
        text: '"A few. Most of them don\'t say so, because the Choir retunes the ones who talk back. Retunes." He spits. "Means they turn the Hymn up until you stop being in the way of it. The biggest of us is Ashgrave, the Shepherd\'s right hand, down at the Cathedral. Kept his mind like me. But he loves the Hymn. Or he thinks he does. Hard to tell the difference, from inside."',
        options: [{ text: 'Where is this Cathedral?', to: 'hymn' }],
      },
      vats: {
        text: '"Down the lift in the bunker. Eight vats of the Bloom in a hall that stinks like cut grass and pennies. The reactor feeds the heaters; the control room runs the cycle; the pump room keeps them cool." He counts on fingers as thick as tent pegs. "Three ways I\'ve thought of, in the long nights. Enough explosive on the reactor, and there\'s no more Kessler. Or a clever head at the control terminal runs the heaters until the Bloom cooks. Or someone handy with a wrench turns the coolant around, and the vats stew themselves nice and quiet." He looks at his hands. "That\'s the one I\'d pick, if my fingers still fit a valve."',
        options: [
          { text: 'Where would I find explosives?', to: 'boom' },
          { text: 'Is there a way into the control room?', if: (c) => !c.has('kf_codes'), to: 'codes' },
          { text: 'What about the people in the vats?', to: 'inside' },
          { text: 'Thanks.', to: 'again' },
        ],
      },
      boom: {
        text: '"Motor pool, north-east of the yard. There\'s a munitions crate by the trucks; the lock\'s a joke. And the armory downstairs, if you can get the door open." He grins, which is not a pretty thing on a Grafted face. "Set it and run. Don\'t stop to admire it."',
        options: [{ text: 'Got it.', to: 'again' }],
      },
      codes: {
        onEnter: (c) => {
          if (!c.has('kf_codes')) c.give('kf_codes');
        },
        text: '"Here." He fishes in a pouch and holds out a laminated card on the flat of his palm. "Belonged to a handler named Ostrow. Ostrow slipped on the vat catwalk last winter. Terrible thing. Nobody saw." He looks at you blandly. "It opens the armory, and it\'ll make the control terminal a sight more polite."',
        options: [{ text: 'Thank you, Sabel.', to: 'again' }],
      },
      inside: {
        text: '"There\'s no one in there you could save. Not by the time they\'re in the vats." His voice goes flat and careful, the voice of a man walking past a grave. "Whatever you do down there, it\'s a mercy. I\'d want it done for me."',
        options: [{ text: 'All right.', to: 'again' }],
      },
      hymn: {
        onEnter: (c) => {
          c.set('kf_sabelToldHymn');
          c.reveal('cathedral');
        },
        text: '"South. All the way south, where the land ends at the sea cliffs. There\'s a glass dome up there, an old star-watching place. The Choir calls it the Cathedral. The Hymn comes out of it, day and night." He touches his collar again. "The one who sings it, they call him the Shepherd. I\'ve never seen him. I\'ve felt him think, though. It\'s like standing near a furnace."',
        options: [{ text: 'I\'ll pay him a visit.', to: 'again' }],
      },
      captives: {
        onEnter: (c) => {
          if (!c.flag('kf_sabelAlly')) {
            c.set('kf_sabelAlly');
            if (!c.has('kf_penKey')) c.give('kf_penKey');
            c.karma(10);
          }
        },
        text: '"They\'re mine, in a way. I bring them water. I tell them the vats are a rumour." He puts the little ox away very carefully. "Here: the pen key. Mireille speaks for them. When you open the gate, I\'ll walk them out the north breach. The collars don\'t look twice at me."',
        options: [{ text: 'I\'ll do it.', to: 'again' }],
      },
      vouch: {
        text: '"I can tell Forty-One you\'re a handler. He\'ll believe me. He believes everything, it\'s the kindest thing about him. The others follow the gate." He considers you. "But I want to know what kind of trouble you are, first."',
        options: [
          { text: 'The kind that ends this place.', to: 'vouchOk' },
          { text: '[Speech] The kind that gets you and your captives home.', skill: { key: 'speech', diff: 20 }, to: 'vouchOk', fail: 'vouchNo' },
        ],
      },
      vouchOk: {
        onEnter: (c) => grantPassage(c),
        text: 'Sabel heaves himself up off the bucket and lumbers toward the gate. You hear a short exchange in two very different registers. When he comes back he sits down again without comment. None of the Grafted in the yard turn their heads your way any more.',
        options: [{ text: 'Thanks, Sabel.', to: 'again' }],
      },
      vouchNo: {
        text: '"Hm. Everyone says that." He goes back to his whittling. "Show me first."',
        options: [{ text: 'Fair enough.', to: 'again' }],
      },
      dumb: {
        onEnter: (c) => {
          c.set('kf_sabelMet');
          c.set('kf_sabelAlly');
          if (!c.has('kf_penKey')) c.give('kf_penKey');
          c.reveal('cathedral');
          grantPassage(c);
        },
        text: 'A Grafted sits on a bucket by the pens, carving a tiny wooden ox. He looks at you for a long moment, and something in his great ugly face softens.\n\n"Ah. You and me both, friend, once I\'ve had a bad night." He holds out the little ox and a big iron key. "Key\'s for the pens. Let the people out. And the bad pots are downstairs in the big box building. Find the hot humming thing down there and make it go boom. Or turn the big wheel in the pipe room the wrong way. Yes?"',
        options: [
          { text: 'Boom! Yes!', lowInt: true, to: 'dumb2' },
          { text: 'Bye.', end: true },
        ],
      },
      dumb2: {
        text: '"Good. And the one who sings in our heads lives south, by the sea, in a glass bowl. I\'ve marked it on that bracelet of yours." He taps your wrist-link with a fingertip the size of a thumb. "Go on, trouble."',
        options: [{ text: 'Me go!', lowInt: true, end: true }, { text: 'Goodbye.', end: true }],
      },
      pen: {
        onEnter: (c) => {
          c.set('kf_surrenderDone');
          c.set('kf_sabelMet');
          const d = c.obj('kf_penDoor');
          if (d) {
            d.locked = 0;
            d.open = true;
          }
          grantPassage(c);
        },
        text: 'You have been sitting in the pen for most of an hour, listening to the captives breathe, when the gate clanks. A Grafted with a carving knife and a tired face looks in at you.\n\n"Well. That\'s one way in." He swings the gate open. "I\'m Sabel. I work the pens. As far as Forty-One knows, you\'re on my work detail now, so nobody will crush you until you give them a reason." He lowers his voice. "Please don\'t give them a reason."',
        options: [
          { text: 'Who are you, really?', to: 'who' },
          { text: 'Tell me about the vats.', to: 'vats' },
          { text: 'Thanks. I\'ll take it from here.', end: true },
        ],
      },
      vatsDone: {
        onEnter: (c) => {
          c.set('kf_sabelThanked');
          c.set('kf_sabelMet');
          c.xp(200);
        },
        text: '"I felt it go." Sabel is standing, for once, and his collar is buzzing faintly. "The whole Hymn skipped a beat, like a song when the needle jumps. Every collar in the yard felt it." He lets out a breath he may have been holding for three summers. "No more. No more of us. Thank you, trouble."',
        options: [
          { text: 'Help me get the captives out.', if: (c) => !c.flag('kf_captivesFreed'), to: 'captives' },
          { text: 'What will you do now?', to: 'after' },
          { text: 'Take care of yourself, Sabel.', end: true },
        ],
      },
      after: {
        text: (c) => c.flag('kf_captivesFreed')
          ? '"Walk them to the Bazaar, see they get there. Then... I don\'t know. There\'s a caravan company that owes me eleven years\' back wages." He snorts. "I\'d like to see their faces."'
          : '"Stay with the stock until someone gets them out. After that, I don\'t know. Somewhere without a fence."',
        options: [{ text: 'Good luck.', end: true }],
      },
    },
  },

  // ---------------------------------------------------------------- captives
  {
    id: 'kf_mireille',
    start: (c) => (c.flag('kf_metMireille') ? 'again' : 'hello'),
    nodes: {
      hello: {
        onEnter: (c) => c.set('kf_metMireille'),
        text: 'A woman in the rags of a Longhaul driver\'s coat grips the pen fence with both hands. Her knuckles are raw. "You\'re not one of them. And you\'re not Choir, the Choir never look at us." She swallows. "Are you here to get us out? Please say yes."',
        options: [
          { text: 'Yes. Who are you?', to: 'who' },
          { text: 'I\'m getting you out.', to: 'out' },
          { text: 'Me open door. You go.', lowInt: true, to: 'out' },
          { text: 'Hang on.', end: true },
        ],
      },
      again: {
        text: '"Is it time?" Mireille is on her feet before you finish walking up.',
        options: [
          { text: 'It\'s time.', to: 'out' },
          { text: 'Go now!', lowInt: true, to: 'out' },
          { text: 'Where did they take the others?', to: 'others' },
          { text: 'Not yet.', end: true },
        ],
      },
      who: {
        text: '"Mireille Oka. I drove the Longhaul east route. They hit us at the dry ford, eleven of us, and marched us here. Four of us are left." She looks at the bunker. "The rest went downstairs. People who go downstairs come back up big, and they don\'t know your name any more."',
        options: [
          { text: 'I\'m getting you out.', to: 'out' },
          { text: 'Where did they take the others?', to: 'others' },
        ],
      },
      others: {
        text: '"Down the lift. The Choir tenders come up with clipboards and point. There\'s one Grafted, Sabel, who brings us water and tells us it\'s a rumour. He\'s a bad liar. I like him for trying."',
        options: [{ text: 'I\'ll get you out.', to: 'out' }],
      },
      out: {
        text: (c) => {
          if (!penOpen(c)) return '"The gate\'s locked. Sabel has a key; so does their sergeant, in the barracks. Or if you know locks..." She rattles the fence. "Hurry."';
          if (!canLeave(c)) return '"Past those things?" She points at the yard, where collared shapes pace between the lamps. "They\'d have us back in here in a minute, or worse. Clear the yard, or find someone who can walk us out."';
          return '"Then we go. Now, while we still have legs." She turns to the others. "Up. Up! We\'re going home."';
        },
        options: [
          { text: 'Go. Make for the Bazaar.', if: (c) => penOpen(c) && canLeave(c), to: 'go' },
          { text: 'I\'ll deal with it.', if: (c) => !(penOpen(c) && canLeave(c)), end: true },
        ],
      },
      go: {
        onEnter: (c) => freeCaptives(c),
        text: (c) => `Mireille grips your hand hard enough to hurt. "Longhaul will hear about this. The whole Bazaar will." ${c.flag('kf_sabelAlly') ? 'Sabel is already at the gate, herding them toward the north breach like oxen.' : 'They slip out of the pen and away along the fence line, keeping low.'} In a minute they are gone into the glow and the dust.`,
        options: [{ text: 'Good luck.', end: true }],
      },
    },
  },
  {
    id: 'kf_captive',
    start: 'hello',
    nodes: {
      hello: {
        text: (c) => ['A thin man with burned hands stares past you. "Mireille does the talking. Talk to Mireille."', 'A woman hugs her knees and rocks. "They took my brother downstairs. He\'ll come back. He\'ll come back big."', '"Water?" a boy asks. Then, seeing your face: "Oh. You\'re not the water."', '"Don\'t go near the lift," someone whispers. "Nobody who goes near the lift comes back small."'][c.random(4)],
        options: [{ text: 'Hang on. I\'ll get you out.', end: true }, { text: 'Me help.', lowInt: true, end: true }],
      },
    },
  },

  // ---------------------------------------------------------------- terminals and machines
  {
    id: 'kf_records',
    name: 'Kessler Records Terminal',
    portrait: TERMINAL_LOOK,
    start: 'main',
    nodes: {
      main: {
        text: 'KESSLER MORPHOGENIC RESEARCH DIVISION // RECORDS\n\nThe screen is scored with old burn-in. Someone has kept this terminal running for a very long time, and has added newer files in a different, careful hand.',
        options: [
          { text: 'Project summary: BLOOM', to: 'bloom' },
          { text: 'Operations log (current)', to: 'ops' },
          { text: 'Director\'s personal log', to: 'j1' },
          { text: 'Intake registry', to: 'intake' },
          { text: 'Look at glowy words.', lowInt: true, to: 'dumb' },
          { text: 'Log off.', end: true },
        ],
      },
      bloom: {
        onEnter: (c) => c.set('kf_readBloom'),
        text: 'PROJECT BLOOM. MORPHOGENIC AGENT K-7.\nObjective: an infantryman able to operate in contaminated terrain without protective equipment.\nEffects: accelerated tissue growth. Radiation-tolerant cell lines. Dermal thickening. Skeletal loading +40%.\nSide effects: cortical thinning. Loss of initiative. Marked suggestibility.\n\nDirector\'s annotation: "The committee calls the side effects a failure. They are a feature. A soldier who does not argue is a soldier who does not panic."',
        options: [{ text: 'Back.', to: 'main' }],
      },
      ops: {
        onEnter: (c) => {
          c.set('kf_readOps');
          c.reveal('cathedral');
          c.quest('shepherd', 'Kessler\'s logs say the Grafted are steered by a broadcast called the Hymn, sent from the Glass Cathedral on the southern cliffs.');
        },
        text: 'OPERATIONS // CYCLE 212 (Choir hand)\nReceived six stock from the east road. Two unsuitable (age). Vat 3 yield: one viable.\nCollars fitted and tuned to the carrier from the Glass Cathedral, Harrow Point. New Grafted will not rise from the table until they hear the Hymn; without it they lie there and breathe.\nThe Shepherd reminds us that stock from the sealed shelters takes the Bloom most cleanly. Shelter 7 intake complete (41). The Shepherd asks that we find the others.',
        options: [{ text: 'Back.', to: 'main' }],
      },
      j1: {
        text: 'PERSONAL LOG // A. VANCE, DIRECTOR\n"They are shutting us down. The committee used the word *abomination* three times in one sentence, which I think is a record even for them. I told them: you already build weapons that end cities. I am building a man who can walk into the ashes afterwards and pick up the pieces."',
        options: [{ text: 'Next entry.', to: 'j2' }, { text: 'Back.', to: 'main' }],
      },
      j2: {
        text: '"The bombs fell on a Tuesday. I had always assumed it would be a Monday.\nFourteen subjects survived in the vats. They wait for instructions. They are so patient. If no one speaks to them, they simply sit down wherever they are and stop. I have been speaking to them for three weeks and my voice is going."',
        options: [{ text: 'Next entry.', to: 'j3' }, { text: 'Back.', to: 'main' }],
      },
      j3: {
        onEnter: (c) => {
          c.set('kf_readJournal');
          c.reveal('cathedral');
        },
        text: '"The observatory at Harrow Point has the only transmitter with the reach. My heart is not good. The Bloom would mend it, but the Bloom would make me quiet, and then who would speak to them?\nUnless the transmitter did the speaking. Unless I *were* the transmitter.\nI am going to try something foolish and very beautiful. If you are reading this and I am still alive, I suppose it worked."',
        options: [{ text: 'Back.', to: 'main' }],
      },
      intake: {
        text: 'INTAKE REGISTRY. Nine hundred and some entries, most of them only numbers. A handful are flagged in red:\n\n0117 // ASH, GARRAN. Longhaul Caravans, guard. RETAINED COGNITION. Current designation: ASHGRAVE, attached to Cathedral. Director: "He is beginning to remember. Retune at next cycle."\n0342 // ODUYA, SABEL. Longhaul Caravans, drover. RETAINED COGNITION. "Harmless. Useful with stock. Leave him be."',
        options: [
          { text: 'Copy record 0117 to a holotape.', if: (c) => !c.has('kf_intakeFile'), to: 'copied' },
          { text: 'Back.', to: 'main' },
        ],
      },
      copied: {
        onEnter: (c) => {
          c.give('kf_intakeFile');
          c.set('kf_copiedIntake');
        },
        text: 'The terminal whirs and spits out a holotape with a slightly offended click.',
        options: [{ text: 'Back.', to: 'main' }],
      },
      dumb: {
        onEnter: (c) => {
          c.reveal('cathedral');
          if (!c.has('kf_intakeFile')) c.give('kf_intakeFile');
        },
        text: 'Lots of words. Too many words. But one word is big and you know it: CATHEDRAL. There is a picture of a glass bowl on a cliff by the sea, with a man inside it. He is smiling.\n\nYou press a button because it is there. The terminal spits out a little tape with a picture of a very big man on it.',
        options: [{ text: 'Ooh. Glass bowl.', lowInt: true, to: 'main' }, { text: 'Bye.', end: true }],
      },
    },
  },
  {
    id: 'kf_control',
    name: 'Vat Control Terminal',
    portrait: TERMINAL_LOOK,
    start: (c) => (c.flag('kf_vatsDestroyed') ? 'dead' : c.flag('kf_doomAt') ? 'running' : 'main'),
    nodes: {
      main: {
        text: 'VAT CONTROL // HEATING CYCLE: NOMINAL\nVATS 1-8: OCCUPIED (3) CURING (2) READY (3)\nOPERATOR CODE REQUIRED FOR MANUAL OVERRIDE.',
        options: [
          { text: '[Science] Use the handler\'s code card and override the heating cycle.', if: (c) => c.has('kf_codes'), skill: { key: 'science', diff: 10 }, to: 'overload', fail: 'lockout' },
          { text: '[Science] Bypass the operator lock and override the heating cycle.', if: (c) => !c.has('kf_codes'), skill: { key: 'science', diff: 45 }, to: 'overload', fail: 'lockout' },
          { text: 'Press big red button.', lowInt: true, stat: { key: 'LCK', min: 6 }, to: 'dumbOk' },
          { text: 'Hit screen.', lowInt: true, to: 'dumbHit' },
          { text: 'Check vat status.', to: 'status' },
          { text: 'Log off.', end: true },
        ],
      },
      status: {
        text: 'VAT 1: READY. VAT 2: CURING. VAT 3: OCCUPIED, DAY 9. VAT 4: READY. VAT 5: OCCUPIED, DAY 2. ...\nNext to each occupied vat there is a line for a name. The lines are all blank.',
        options: [{ text: 'Back.', to: 'main' }],
      },
      overload: {
        onEnter: (c) => {
          startDoom(c, 'overload', 2);
          raiseAlarm(c, 'Klaxons start howling through the complex. The garrison knows something is wrong.');
        },
        text: 'HEATER LIMITS: DISABLED.\nThe status column fills with red, one vat at a time. Somewhere behind the wall a relay clacks, then another. A recorded voice, very calm and very old, advises all personnel to evacuate the vat hall.\n\nYou have perhaps two minutes before the Bloom boils and the vats split.',
        options: [{ text: 'Time to go.', end: true }],
      },
      lockout: {
        onEnter: (c) => raiseAlarm(c, 'The terminal shrieks an intruder alert. The garrison is coming.'),
        text: 'LOCKOUT. INTRUDER ALERT. INTRUDER ALERT.\nThe screen goes red and stays red. Somewhere in the complex, heavy feet start moving.',
        options: [{ text: 'Try again.', to: 'main' }, { text: 'Run.', end: true }],
      },
      dumbOk: {
        onEnter: (c) => {
          startDoom(c, 'overload', 2);
          raiseAlarm(c, 'Klaxons start howling through the complex.');
        },
        text: 'You press the big red button. Nothing happens. You press it again, harder, and hold it, and then lean on it for good measure.\n\nHEATER LIMITS: DISABLED, says the screen, in a tone that suggests it has given up arguing. Red lights come on everywhere. It is very pretty. Then the sirens start, and it is less pretty.',
        options: [{ text: 'Uh oh. Run!', lowInt: true, end: true }, { text: 'Run.', end: true }],
      },
      dumbHit: {
        onEnter: (c) => raiseAlarm(c, 'The terminal shrieks an intruder alert.'),
        text: 'You hit the screen. The screen does not like being hit. It goes red and makes a noise like an angry goose, and somewhere in the complex, heavy feet start moving.',
        options: [{ text: 'Oops.', lowInt: true, end: true }, { text: 'Oops.', end: true }],
      },
      running: {
        text: 'The screen is a solid wall of red. Whatever you started down here is already happening.',
        options: [{ text: 'Log off.', end: true }],
      },
      dead: {
        text: 'VAT CONTROL // ALL VATS: NO SIGNAL.\nThe cursor blinks patiently, waiting for something that will not come.',
        options: [{ text: 'Log off.', end: true }],
      },
    },
  },
  {
    id: 'kf_reactor',
    name: 'Kessler Reactor',
    portrait: { body: 'robot', skin: '#6a5048', bg: '#2a1810' },
    start: (c) => (c.flag('kf_vatsDestroyed') ? 'dead' : c.flag('kf_doomAt') ? 'armed' : 'main'),
    nodes: {
      main: {
        text: 'The reactor is a squat steel drum twice your height, warm as a sleeping animal. A trunk of cables thick as your leg runs from it through the wall toward the vat hall. A stencil on the jacket reads: HEATER FEED. DO NOT INTERRUPT DURING CURE CYCLE.',
        options: [
          { text: '[Traps] Wire a demolition charge to the coolant jacket and set the timer.', if: (c) => c.has('dynamite'), skill: { key: 'traps', diff: 25 }, to: 'arm', fail: 'armFail' },
          { text: 'Stick boom-stick on hot thing.', lowInt: true, if: (c) => c.has('dynamite'), skill: { key: 'traps', diff: 35 }, to: 'arm', fail: 'armFail' },
          { text: 'I need explosives for this.', if: (c) => !c.has('dynamite'), to: 'noBoom' },
          { text: 'Need boom-stick.', lowInt: true, if: (c) => !c.has('dynamite'), to: 'noBoom' },
          { text: 'Leave it.', end: true },
        ],
      },
      noBoom: {
        text: 'Your bare hands will not do much to a pre-war reactor. A demolition charge might. The garrison must keep munitions somewhere: a motor pool, an armory.',
        options: [{ text: 'Right.', end: true }],
      },
      armFail: {
        text: 'The detonator wire will not seat, and the timer keeps resetting to zero in a way you do not like at all. You pull everything off before it can decide to do something rash. Better try that again, slowly.',
        options: [{ text: 'Try again.', to: 'main' }, { text: 'Leave it for now.', end: true }],
      },
      arm: {
        onEnter: (c) => {
          c.take('dynamite');
          startDoom(c, 'charge', 5);
          raiseAlarm(c, 'Klaxons start howling through the complex. The whole garrison is awake now.');
        },
        text: 'You pack the charge into the gap between the coolant jacket and the housing, run the wire, and set the timer. The red digits read 5:00, then 4:59. Somewhere above, a klaxon starts to howl.\n\nThe lift is at the west end of the complex. Get to it.',
        options: [{ text: 'Run.', end: true }],
      },
      armed: {
        text: 'The charge clings to the reactor jacket, its timer counting down. You should not be standing here.',
        options: [{ text: 'Run!', end: true }],
      },
      dead: {
        text: 'The reactor is cold, cracked, and silent.',
        options: [{ text: 'Leave.', end: true }],
      },
    },
  },
  {
    id: 'kf_coolant',
    name: 'Coolant Manifold',
    portrait: { body: 'robot', skin: '#4a6a78', bg: '#101c22' },
    start: (c) => (c.flag('kf_vatsDestroyed') ? 'dead' : c.flag('kf_doomAt') ? 'running' : 'main'),
    nodes: {
      main: {
        text: 'A bank of valves, pumps and gauges feeds chilled coolant through jackets around the vats next door. The pipes sweat. A stencil, much repainted: NEVER REVERSE FLOW WHILE VATS ARE OCCUPIED.',
        options: [
          { text: '[Repair] Reverse the coolant flow.', skill: { key: 'repair', diff: 25 }, to: 'ok', fail: 'fail' },
          { text: 'Turn big wheel other way.', lowInt: true, skill: { key: 'repair', diff: 40 }, to: 'ok', fail: 'fail' },
          { text: '[Science] Read the gauges first.', to: 'gauges' },
          { text: 'Leave it.', end: true },
        ],
      },
      gauges: {
        text: 'The vats are held a few degrees above body temperature, and the Bloom is fussy about it. Reverse the flow and the jackets would pump the reactor\'s waste heat into the vats instead of away. Nothing would explode. Everything would simply cook.',
        options: [{ text: 'Back.', to: 'main' }],
      },
      ok: {
        onEnter: (c) => startDoom(c, 'coolant', 3),
        text: 'You bleed the pressure, swap the feed and return lines, and open the valves again the wrong way round. For a moment nothing happens. Then the pipes begin to knock, softly at first, like someone patient at a door.\n\nNo alarm. Just heat, going where it should not.',
        options: [{ text: 'Good.', end: true }],
      },
      fail: {
        onEnter: (c) => {
          c.hurt(8);
          c.sound('hit');
        },
        text: 'A seal gives with a shriek and a jet of scalding steam catches your arm. (8 damage.) You slam the valve shut again. The gauges settle back to normal. Nobody seems to have heard.',
        options: [{ text: 'Try again.', to: 'main' }, { text: 'Leave it.', end: true }],
      },
      running: {
        text: 'The pipes are knocking harder now, and the paint on them has begun to blister.',
        options: [{ text: 'Leave.', end: true }],
      },
      dead: {
        text: 'The manifold is silent. The pipes tick as they cool.',
        options: [{ text: 'Leave.', end: true }],
      },
    },
  },
]);

function surrender(c: Ctx) {
  c.set('kf_surrendered');
  c.fade('The pens');
  c.advance(60);
  const m = G.map;
  const p = player();
  if (m) {
    const spot = m.freeNear({ q: 22, r: 35 });
    if (spot) {
      p.q = spot.q;
      p.r = spot.r;
      p._path = undefined;
      fx.centerOn(p, true);
    }
    const s = c.npc('kf_sabel');
    const near = m.freeNear({ q: 23, r: 30 });
    if (s && !s.dead && near) {
      s.q = near.q;
      s.r = near.r;
      s.home = { q: near.q, r: near.r };
    }
  }
  c.msg('Forty-One marches you across the yard and shoves you into the captive pen. The gate clangs shut behind you.');
  if (c.npc('kf_sabel') && !c.npc('kf_sabel')!.dead) setTimeout(() => c.startDialog('kf_sabel', 'kf_sabel'), 700);
}

defineDeathScripts({
  kf_sabel: (c) => c.set('kf_sabelDead'),
  kf_mireille: (c) => c.set('kf_mireilleDead'),
});

// --------------------------------------------------------------------- endings

defineEndings([
  {
    order: 70,
    title: 'Fort Kessler',
    scene: 'dust',
    text: (c) => {
      if (!c.flag('kf_vatsDestroyed')) return null;
      const how = c.flag('kf_vatsHow');
      let t = how === 'charge'
        ? 'The reactor under Fort Kessler burned for nine days. When the fires went out, the vat hall was a crater inside a crater, and the crater lands had one more hot spot for travellers to steer around.'
        : how === 'overload'
          ? 'The vats of Fort Kessler split open one after another as the heaters ran wild, and the Bloom boiled away into a grey crust that no chemist in the Basin could ever bring back to life.'
          : 'No one heard the vats of Fort Kessler die. The coolant ran backwards for a night and a day, and when the Choir\'s tenders finally came down the lift, they found eight tanks of grey sludge and a manifold turned neatly the wrong way round.';
      if (c.flag('kf_captivesFreed')) {
        t += ` ${c.flag('kf_mireilleDead') ? 'The captives' : 'Mireille Oka and the other captives'} reached the Crossroads Bazaar, and Longhaul Caravans stopped sending wagons down the east road until it had armed guards to spare.`;
      } else {
        t += ' The captives in the pens were never seen again. The Choir, it is said, had other uses for them.';
      }
      if (c.flag('kf_sabelDead')) t += ' Sabel, the drover who counted to keep his mind, was buried by no one.';
      else if (c.flag('kf_sabelMet')) t += ' Sabel the drover walked into the Bazaar a month later, collar and all, and demanded eleven years of back wages from Longhaul. To everyone\'s surprise, he got most of them.';
      return t;
    },
  },
]);
