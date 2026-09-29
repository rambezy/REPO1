// Floor and wall materials: colours and per-cell procedural detail.

import { hash2 } from '../core/rng';

export interface FloorMat {
  base: [number, number, number];
  vary: number; // colour noise amplitude
  speck?: [number, number, number];
  speckDensity?: number;
  tiles?: boolean; // draw grout lines on cell edges
  grout?: string;
  cracks?: number;
  plates?: boolean;
}

export const FLOORS: Record<string, FloorMat> = {
  sand: { base: [150, 120, 82], vary: 14, speck: [110, 88, 60], speckDensity: 6 },
  dirt: { base: [112, 88, 62], vary: 12, speck: [80, 62, 44], speckDensity: 8 },
  cracked: { base: [138, 112, 80], vary: 10, speck: [96, 78, 56], speckDensity: 3, cracks: 0.6 },
  scrub: { base: [128, 112, 74], vary: 14, speck: [90, 96, 56], speckDensity: 10 },
  asphalt: { base: [70, 68, 64], vary: 6, speck: [96, 92, 84], speckDensity: 4, cracks: 0.5 },
  concrete: { base: [118, 114, 106], vary: 6, speck: [96, 92, 86], speckDensity: 3, tiles: true, grout: 'rgba(40,36,30,0.35)', cracks: 0.2 },
  tile: { base: [132, 136, 128], vary: 4, tiles: true, grout: 'rgba(40,46,44,0.55)' },
  metal: { base: [92, 98, 100], vary: 4, plates: true, tiles: true, grout: 'rgba(20,24,26,0.6)' },
  shelter: { base: [104, 116, 118], vary: 3, plates: true, tiles: true, grout: 'rgba(22,30,34,0.6)' },
  wood: { base: [110, 78, 50], vary: 8, speck: [80, 56, 36], speckDensity: 2, tiles: true, grout: 'rgba(40,24,14,0.5)' },
  cave: { base: [84, 70, 58], vary: 12, speck: [60, 50, 42], speckDensity: 8 },
  rubble: { base: [104, 98, 90], vary: 14, speck: [70, 66, 60], speckDensity: 12, cracks: 0.3 },
  grass: { base: [96, 102, 58], vary: 14, speck: [72, 82, 40], speckDensity: 12 },
  mud: { base: [86, 72, 52], vary: 8, speck: [70, 58, 40], speckDensity: 6 },
  glow: { base: [96, 110, 70], vary: 14, speck: [140, 180, 80], speckDensity: 4, cracks: 0.4 },
  carpet: { base: [96, 50, 46], vary: 4, speck: [80, 40, 36], speckDensity: 3 },
  water: { base: [52, 72, 70], vary: 6 },
  toxic: { base: [70, 100, 50], vary: 10 },
  void: { base: [0, 0, 0], vary: 0 },
};

export interface WallMat {
  top: string;
  face: string; // front (south) face
  side: string; // left face
  height: number;
  pattern?: 'brick' | 'block' | 'panel' | 'plank' | 'rock' | 'adobe' | 'fence' | 'shelter' | 'scrap';
  line?: string;
  jag?: boolean; // irregular heights (rock)
}

export const WALLS: Record<string, WallMat> = {
  adobe: { top: '#a88a64', face: '#8e7050', side: '#7a5f43', height: 40, pattern: 'adobe', line: 'rgba(60,40,24,0.35)' },
  brick: { top: '#8a5a44', face: '#7a4a36', side: '#643a2a', height: 48, pattern: 'brick', line: 'rgba(40,20,14,0.5)' },
  concrete: { top: '#9a968c', face: '#7e7a72', side: '#6a665f', height: 52, pattern: 'block', line: 'rgba(40,38,34,0.4)' },
  ruin: { top: '#8a867c', face: '#6e6a62', side: '#5c5850', height: 44, pattern: 'block', line: 'rgba(30,28,24,0.45)', jag: true },
  metal: { top: '#6a7074', face: '#565c60', side: '#474c50', height: 50, pattern: 'panel', line: 'rgba(20,22,24,0.55)' },
  shelter: { top: '#5a6a6e', face: '#6d8084', side: '#56666a', height: 46, pattern: 'shelter', line: 'rgba(20,28,30,0.6)' },
  wood: { top: '#7a5638', face: '#6a482c', side: '#573a23', height: 40, pattern: 'plank', line: 'rgba(30,18,10,0.55)' },
  scrap: { top: '#6e5a48', face: '#5e4a3a', side: '#4e3d30', height: 42, pattern: 'scrap', line: 'rgba(24,16,10,0.5)' },
  rock: { top: '#2e2620', face: '#6a5646', side: '#54443a', height: 30, pattern: 'rock', jag: true },
  cliff: { top: '#4a3c2e', face: '#8a7458', side: '#6e5a44', height: 44, pattern: 'rock', jag: true },
  fence: { top: '#6a6660', face: '#5a5650', side: '#4a4640', height: 30, pattern: 'fence', line: 'rgba(20,20,20,0.6)' },
  sandbag: { top: '#9a8a64', face: '#857552', side: '#6e6044', height: 22, pattern: 'adobe', line: 'rgba(50,40,24,0.5)' },
  glass: { top: '#7a8a8a', face: '#5a7070', side: '#4a6060', height: 60, pattern: 'panel', line: 'rgba(150,200,200,0.35)' },
};

export function floorColor(mat: string, q: number, r: number): string {
  const m = FLOORS[mat] ?? FLOORS.sand;
  const n = (hash2(q, r, 7) - 0.5) * 2 * m.vary;
  const n2 = (hash2(Math.floor(q / 4), Math.floor(r / 4), 3) - 0.5) * m.vary;
  const [cr, cg, cb] = m.base;
  return `rgb(${Math.round(cr + n + n2)},${Math.round(cg + n * 0.9 + n2)},${Math.round(cb + n * 0.8 + n2)})`;
}

export function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.max(0, Math.min(255, Math.round(((n >> 16) & 255) * f)));
  const g = Math.max(0, Math.min(255, Math.round(((n >> 8) & 255) * f)));
  const b = Math.max(0, Math.min(255, Math.round((n & 255) * f)));
  return `rgb(${r},${g},${b})`;
}

export function mix(a: string, b: string, t: number): string {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((na >> s) & 255) * (1 - t) + ((nb >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
