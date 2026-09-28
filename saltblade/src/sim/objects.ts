// Interactive things in the world: furniture, containers, ore, machines,
// construction sites, gates, loot piles.
import type { Grid } from './inventory';

export type ObjKind =
  | 'building' | 'bed' | 'cage' | 'chest' | 'storage' | 'counter' | 'ore' | 'bench' | 'farm' | 'turret' | 'gate' | 'pile' | 'site'
  | 'campfire' | 'stove' | 'well' | 'generator' | 'battery' | 'lamp' | 'sign' | 'machine' | 'research' | 'throne' | 'stool' | 'table' | 'crate' | 'banner' | 'post' | 'shackle_post' | 'wall' | 'tower' | 'decor';

export interface WObj {
  id: number;
  kind: ObjKind;
  def: string; // structure/furniture definition key
  x: number;
  z: number;
  y: number;
  rot: number;
  owner: string; // faction
  site: number; // settlement site id, 0 if none
  parent: number; // building it sits in
  inv?: Grid;
  locked?: number; // lock difficulty 0..100
  user?: number; // character using it
  occupant?: number; // bed/cage occupant
  hp?: number;
  maxHp?: number;
  progress?: number;
  built?: boolean; // construction complete
  open?: boolean; // gates
  data?: any;
  shop?: string; // shop id for counters
  view?: any;
  hidden?: boolean;
}
