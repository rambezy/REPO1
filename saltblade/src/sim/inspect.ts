// Covenant inspections. A patrol on the road, or now and then the watch in
// one of their towns, stops you and searches every pack for leaf, dust and
// rage. What they find they take: to the watch house's confiscated goods
// chest in a town, onto the fire on the road. Then you pay for their trouble
// or carry a bounty. A smuggler's pack hides most of what is in it, and a
// light-fingered carrier hides more; a gift for the Ember sometimes works.
import type { Char } from './char';
import type { Squad } from './squad';
import type { Grid, Item } from './inventory';
import type { WObj } from './objects';
import { S } from './ctx';
import { HOUR, DAY } from './clock';
import { ITEM, itemValue } from '../content/items';
import { FACTION } from '../content/factions';

/** Does this faction stop and search? (Those whose law bans drugs.) */
export const searches = (faction: string) => !!FACTION[faction]?.laws.drugs;

/** Would this squad's leader stop your people for a search now? Road patrols always do, once a day; a town's watch sometimes. */
export function wantsToInspect(L: Char, sq: Squad): boolean {
  if (!searches(L.faction) || (L.role !== 'guard' && L.role !== 'patrol')) return false;
  if (S.clock.t - (sq.flags.inspected ?? -1e9) < DAY) return false;
  // the wanted and the hated get the sword, not a search
  if (S.W.rel.get('player', L.faction) <= -50 || S.W.playerChars().some((p) => (p.bounty[L.faction] ?? 0) > 0)) return false;
  if (sq.kind !== 'town') return true;
  // the watch at home checks one party in a few: rolled once an hour
  if (S.clock.t - (sq.flags.inspectRoll ?? -1e9) >= HOUR) { sq.flags.inspectRoll = S.clock.t; sq.flags.inspectDue = S.rng.chance(0.3); }
  return !!sq.flags.inspectDue;
}

export interface Contraband { c: Char; grid: Grid; it: Item; hidden: boolean }

/** Everything your people near a point carry that this faction bans, and which of it sits in a smuggler's pack. */
export function contraband(faction: string, at: { x: number; z: number }, r = 40): Contraband[] {
  const out: Contraband[] = [];
  for (const c of S.W.playerChars()) {
    if (Math.hypot(c.x - at.x, c.z - at.z) > r) continue;
    const packs: [Grid, boolean][] = [[c.inv, false]];
    if (c.eq.back?.inv) packs.push([c.eq.back.inv, c.eq.back.id === 'smuggler_pack']);
    for (const [g, secret] of packs) for (const it of g.items) if (ITEM[it.id].illegal?.includes(faction)) out.push({ c, grid: g, it, hidden: secret });
  }
  return out;
}

/** The chest in one of their own watch houses near by, if any (on the road it all goes on the fire). */
function evidenceChest(at: Char): WObj | null {
  let best: WObj | null = null, bd = 400;
  for (const o of S.W.objs.values()) {
    if (o.data?.name !== 'Confiscated goods' || !o.inv || o.owner !== at.faction) continue;
    const d = Math.hypot(o.x - at.x, o.z - at.z);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export interface Search { found: [string, number][]; value: number; missed: number; chest: boolean }

/**
 * Searches your people near the inspector and takes what they find. A
 * smuggler's pack keeps each stack hidden most of the time (more with
 * thievery); `thorough` searches (after a bribe gone wrong) miss nothing.
 */
export function search(inspector: Char, thorough = false): Search {
  const found = new Map<string, number>();
  let value = 0, missed = 0;
  const chest = evidenceChest(inspector);
  for (const x of contraband(inspector.faction, inspector)) {
    if (x.hidden && !thorough && S.rng.chance(Math.min(0.95, 0.7 + x.c.skill('thievery') * 0.005))) { missed++; continue; }
    x.grid.remove(x.it);
    value += itemValue(ITEM[x.it.id], x.it.q) * x.it.n;
    found.set(x.it.id, (found.get(x.it.id) ?? 0) + x.it.n);
    if (chest?.inv && !chest.inv.put(x.it)) chest.inv.add(x.it.id, x.it.n, x.it.q);
  }
  if (found.size) S.fx.sound(chest ? 'door' : 'fire', inspector.x, inspector.z, 0.7);
  return { found: [...found], value, missed, chest: !!chest };
}

/** What they fine you for what they found: more than half its worth. */
export const fineFor = (value: number) => Math.max(100, Math.round(value * 0.6 / 10) * 10);
/** What an officer of the Ember takes to look the other way. */
export const bribeFor = () => 300;
/** Whether they take it: better liked, better odds; the hated never. */
export function bribeTaken(faction: string): boolean {
  const rel = S.W.rel.get('player', faction);
  if (rel < -40) return false;
  return S.rng.chance(Math.max(0.15, Math.min(0.85, 0.5 + rel / 120)));
}
