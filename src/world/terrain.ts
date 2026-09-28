// Ground terrain types and their gameplay properties.

export const T = {
  VOID: 0,
  GRASS: 1,
  FOREST: 2,
  MEADOW: 3,
  DIRT: 4,
  ROAD: 5,
  COBBLE: 6,
  SAND: 7,
  MUD: 8,
  FIELD: 9,
  WATER: 10,
  DEEP: 11,
  ROCK: 12,
  ASH: 13,
  FLAGSTONE: 14,
  WOOD: 15,
  STRAW: 16,
  CARPET: 17,
  WALL_STONE: 18,
  WALL_PLASTER: 19,
  WALL_WOOD: 20,
  WALL_DARK: 21,
  BRIDGE: 22,
  BRIDGE_V: 23,
  FORD: 24,
  WHEAT: 25,
  VEG: 26,
  GRAVEL: 27,
  WALL_CAVE: 28,
  BURNT_WHEAT: 29,
} as const;
export type TerrainId = (typeof T)[keyof typeof T];

export type StepSound = 'grass' | 'dirt' | 'stone' | 'wood' | 'water' | 'none';

export interface TerrainDef {
  name: string;
  solid: boolean;
  speed: number;
  sound: StepSound;
  /** Border wobble: terrains that blend organically with neighbours. */
  warp: boolean;
  wall?: boolean;
  water?: boolean;
  swim?: boolean;
}

const D: Record<number, TerrainDef> = {};
function def(id: number, name: string, o: Partial<TerrainDef>) {
  D[id] = { name, solid: false, speed: 1, sound: 'grass', warp: true, ...o };
}
def(T.VOID, 'void', { solid: true, warp: false, sound: 'none' });
def(T.GRASS, 'grass', {});
def(T.FOREST, 'forest floor', { speed: 0.96 });
def(T.MEADOW, 'meadow', {});
def(T.DIRT, 'dirt', { sound: 'dirt' });
def(T.ROAD, 'road', { speed: 1.12, sound: 'dirt' });
def(T.COBBLE, 'cobbles', { speed: 1.12, sound: 'stone', warp: false });
def(T.SAND, 'sand', { sound: 'dirt' });
def(T.MUD, 'mud', { speed: 0.75, sound: 'water' });
def(T.FIELD, 'field', { speed: 0.92, sound: 'dirt' });
def(T.WATER, 'water', { solid: true, sound: 'water', water: true });
def(T.DEEP, 'deep water', { solid: true, sound: 'water', water: true });
def(T.ROCK, 'rock', { solid: true, sound: 'stone', warp: false, wall: true });
def(T.ASH, 'ash', { sound: 'dirt' });
def(T.FLAGSTONE, 'flagstones', { speed: 1.05, sound: 'stone', warp: false });
def(T.WOOD, 'wooden floor', { sound: 'wood', warp: false });
def(T.STRAW, 'straw floor', { sound: 'dirt', warp: false });
def(T.CARPET, 'carpet', { sound: 'wood', warp: false });
def(T.WALL_STONE, 'stone wall', { solid: true, sound: 'stone', warp: false, wall: true });
def(T.WALL_PLASTER, 'wall', { solid: true, sound: 'stone', warp: false, wall: true });
def(T.WALL_WOOD, 'log wall', { solid: true, sound: 'wood', warp: false, wall: true });
def(T.WALL_DARK, 'darkness', { solid: true, sound: 'none', warp: false, wall: true });
def(T.BRIDGE, 'bridge', { sound: 'wood', warp: false, speed: 1.05 });
def(T.BRIDGE_V, 'bridge', { sound: 'wood', warp: false, speed: 1.05 });
def(T.FORD, 'ford', { speed: 0.62, sound: 'water', water: true });
def(T.WHEAT, 'wheat', { speed: 0.86, sound: 'grass' });
def(T.VEG, 'garden', { speed: 0.9, sound: 'dirt' });
def(T.GRAVEL, 'gravel', { sound: 'stone' });
def(T.WALL_CAVE, 'rock wall', { solid: true, sound: 'stone', warp: false, wall: true });
def(T.BURNT_WHEAT, 'burnt field', { speed: 0.9, sound: 'dirt' });

export function tdef(id: number): TerrainDef {
  return D[id] || D[T.VOID];
}
