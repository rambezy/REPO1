// The shared game container. Systems reach each other through G.
import type * as THREE from 'three';
import type { Terrain } from './world/terrain';
import type { RegionField } from './world/gen';
import type { Renderer } from './render/renderer';
import type { RTSCamera } from './render/camera';
import type { TerrainRenderer } from './render/terrainMesh';
import type { Sky } from './render/sky';
import type { Daylight, SkyWeather } from './render/daylight';
import type { Clock } from './sim/clock';

export interface GameState {
  seed: number;
  T: Terrain;
  field: RegionField;
  R: Renderer;
  cam: RTSCamera;
  terrainR: TerrainRenderer;
  sky: Sky;
  daylight: Daylight;
  clock: Clock;
  waterMat: THREE.ShaderMaterial;
  weather: SkyWeather;
  speed: number; // 0 paused, 1, 2, 3, 5...
  lastSpeed: number;
  realTime: number;
  simTime: number;
  mode: 'title' | 'loading' | 'play';
  [k: string]: any;
}

export const G = {} as GameState;
