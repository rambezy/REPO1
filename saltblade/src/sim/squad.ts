// Squads: groups that move and act together, abstractly when far from the
// player and member by member when close.
export type SquadKind = 'player' | 'town' | 'patrol' | 'caravan' | 'raid' | 'camp' | 'herd' | 'bounty' | 'slavers' | 'wanderers' | 'nest' | 'guard' | 'boss';

export type SquadTask =
  | { k: 'hold' }
  | { k: 'travel'; to: number; x: number; z: number; then?: 'return' | 'hold' | 'despawn' | 'raid' | 'patrol' }
  | { k: 'patrol'; sites: number[]; i: number }
  | { k: 'wander'; cx: number; cz: number; r: number }
  | { k: 'raid'; site: number; x: number; z: number; until: number }
  | { k: 'hunt'; target: number };

export class Squad {
  id = 0;
  name = '';
  faction = '';
  kind: SquadKind = 'town';
  members: number[] = [];
  leader = 0;
  x = 0;
  z = 0;
  site = 0;
  task: SquadTask = { k: 'hold' };
  route: number[] | null = null;
  ri = 0;
  active = false;
  born = 0; // game time created
  ttl = 0; // game time to despawn (0 = never)
  spoke = false;
  flags: Record<string, any> = {};
  serialize() {
    return { ...this };
  }
  static from(o: any) {
    const s = new Squad();
    Object.assign(s, o);
    return s;
  }
}
