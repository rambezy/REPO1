// The living world: every character, squad and object, plus the player's
// purse and standing. Only characters near the player are simulated in detail.
import { Char } from './char';
import { Squad } from './squad';
import { WObj } from './objects';
import { Relations } from './factions';
import { SpatialHash } from '../core/spatial';

export interface LogEntry { t: number; text: string; kind: 'info' | 'combat' | 'crime' | 'trade' | 'good' | 'bad' | 'story'; }

export class World {
  chars = new Map<number, Char>();
  squads = new Map<number, Squad>();
  objs = new Map<number, WObj>();
  nextId = 1;
  rel = new Relations();
  money = 0;
  factionName = 'Nameless';
  active: Char[] = [];
  hash = new SpatialHash<Char>(16);
  objHash = new SpatialHash<WObj>(24);
  log: LogEntry[] = [];
  flags: Record<string, any> = {};
  discovered = new Set<number>(); // site ids
  research = { done: new Set<string>(), current: '', progress: 0 };
  playerSquads: number[] = [];
  killsBy: Record<string, number> = {};
  bountyBoard: { id: number; faction: string; reward: number; posted: number }[] = [];
  seenSites = new Set<number>();

  id() { return this.nextId++; }

  addChar(c: Char) {
    if (!c.id) c.id = this.id();
    this.chars.set(c.id, c);
    return c;
  }
  addSquad(s: Squad) {
    if (!s.id) s.id = this.id();
    this.squads.set(s.id, s);
    return s;
  }
  addObj(o: WObj) {
    if (!o.id) o.id = this.id();
    this.objs.set(o.id, o);
    this.objHash.insert(o);
    return o;
  }
  removeObj(o: WObj) {
    this.objs.delete(o.id);
    this.rebuildObjHash();
  }
  rebuildObjHash() {
    this.objHash.clear();
    for (const o of this.objs.values()) this.objHash.insert(o);
  }
  char(id: number) { return id ? this.chars.get(id) : undefined; }
  squadOf(c: Char) { return this.squads.get(c.squad); }

  playerChars(): Char[] {
    const out: Char[] = [];
    for (const id of this.playerSquads) {
      const s = this.squads.get(id);
      if (!s) continue;
      for (const m of s.members) {
        const c = this.chars.get(m);
        if (c) out.push(c);
      }
    }
    return out;
  }

  removeChar(c: Char) {
    const s = this.squads.get(c.squad);
    if (s) {
      s.members = s.members.filter((m) => m !== c.id);
      if (s.leader === c.id) s.leader = s.members[0] ?? 0;
    }
    this.chars.delete(c.id);
  }

  moveToSquad(c: Char, s: Squad) {
    const old = this.squads.get(c.squad);
    if (old) {
      old.members = old.members.filter((m) => m !== c.id);
      if (old.leader === c.id) old.leader = old.members[0] ?? 0;
    }
    s.members.push(c.id);
    if (!s.leader) s.leader = c.id;
    c.squad = s.id;
  }

  say(text: string, kind: LogEntry['kind'] = 'info', t = 0) {
    this.log.push({ t, text, kind });
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
  }
}
