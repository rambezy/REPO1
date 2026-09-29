// Faction relations at runtime. Relations drift with deeds: trading and
// helping raise them, attacking and stealing lower them.
import { FACTIONS, FACTION, RELATIONS, HOSTILE_ALL, BANDITS, HOSTILE_AT, MACHINE_KIN } from '../content/factions';
import { clamp } from '../core/math';

export class Relations {
  rel = new Map<string, number>();
  met = new Set<string>();
  constructor() {
    for (const [a, b, v] of RELATIONS) this.set(a, b, v);
    for (const f of FACTIONS) {
      this.set('player', f.key, f.playerRel);
      if (f.key !== 'player') this.set(f.key, f.key, 100);
    }
    for (const h of HOSTILE_ALL) for (const f of FACTIONS) if (f.key !== h && f.key !== 'fauna') this.set(h, f.key, h === 'starvelings' ? -70 : -100);
    for (const a of MACHINE_KIN) for (const b of MACHINE_KIN) if (a !== b) this.set(a, b, 60);
    for (const b of BANDITS) for (const f of FACTIONS) {
      if (f.key === b || f.key === 'fauna' || f.key === 'player') continue;
      if (BANDITS.includes(f.key)) { if (this.get(b, f.key) === 0) this.set(b, f.key, -20); continue; }
      if (FACTION[f.key].lawful && this.get(b, f.key) > -40) this.set(b, f.key, b === 'scorched' ? Math.min(this.get(b, f.key), -30) : -60);
    }
  }
  private key(a: string, b: string) { return a < b ? a + '|' + b : b + '|' + a; }
  get(a: string, b: string) {
    if (a === b) return 100;
    return this.rel.get(this.key(a, b)) ?? 0;
  }
  set(a: string, b: string, v: number) { this.rel.set(this.key(a, b), clamp(v, -100, 100)); }
  add(a: string, b: string, d: number) { this.set(a, b, this.get(a, b) + d); }
  hostile(a: string, b: string) {
    if (a === b) return false;
    return this.get(a, b) <= HOSTILE_AT;
  }
  serialize() { return { rel: [...this.rel.entries()], met: [...this.met] }; }
  load(o: any) { this.rel = new Map(o.rel); this.met = new Set(o.met); }
}
