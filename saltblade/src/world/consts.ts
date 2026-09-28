// World scale. The heightmap has (N+1)^2 samples spaced CELL metres apart.
export const CELL = 6;
export const N = 2048;
export const WORLD = CELL * N; // 12,288 m on a side
export const SEA = 0;
/** Water shallower than this is waded, deeper is swum. */
export const WADE_DEPTH = 0.9;
/** Terrain render chunks: CHUNK cells per side. */
export const CHUNK = 64;
export const CHUNK_M = CHUNK * CELL; // 384 m
export const CHUNKS = N / CHUNK; // 32
