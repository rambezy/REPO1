// Named places on the overworld: map labels, discovery and fast travel.

export interface Place {
  id: string;
  name: string;
  x: number; // tile coords on the overworld
  y: number;
  spawn: string; // overworld spawn point for fast travel
  desc: string;
  kind: 'village' | 'town' | 'castle' | 'camp' | 'priory' | 'wild' | 'mine' | 'ruin';
  hidden?: boolean; // not shown until discovered
}

export const PLACES: Place[] = [];
export function place(p: Place) { PLACES.push(p); return p; }
export function placeById(id: string) { return PLACES.find((p) => p.id === id); }
