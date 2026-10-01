// Web worker that paints ground chunks off the main thread. It paints its own
// material textures on an OffscreenCanvas when it can, or uses ones sent in.
import { renderGround, groundSize, GroundSource, TexSource } from './ground/render';
import { TexCache, MatTex, MatName, ALL_MATS } from './ground/textures';

let tr = 3;
let tex: TexSource | null = null;

// Paint the remaining materials between requests, the common ground first,
// so the first walk into a new kind of land doesn't wait on its textures.
const FIRST: MatName[] = ['grass', 'dirt', 'road', 'meadow', 'forest', 'grass2', 'riverbed', 'cobble', 'wood', 'straw', 'flagwarm'];
let warm: MatName[] = [];
function warmUp() {
  const m = warm.shift();
  if (!m || !(tex instanceof TexCache)) return;
  tex.get(m);
  setTimeout(warmUp, 15);
}

interface Req { type?: 'init'; id: number; src: GroundSource; cx: number; cy: number; tr?: number; tex?: Record<string, MatTex> }

self.onmessage = (e: MessageEvent<Req>) => {
  const d = e.data;
  if (d.type === 'init') {
    tr = d.tr!;
    if (d.tex) { const t = d.tex; tex = { get: (n: MatName) => t[n] }; }
    else {
      tex = new TexCache(tr);
      warm = [...FIRST, ...ALL_MATS.filter((m) => !FIRST.includes(m))];
      setTimeout(warmUp, 200);
    }
    return;
  }
  if (!tex) return;
  const n = groundSize(tr);
  const out = new Uint32Array(n * n);
  renderGround(d.src, d.cx, d.cy, tr, tex, out);
  (self as unknown as Worker).postMessage({ id: d.id, cx: d.cx, cy: d.cy, buf: out.buffer }, [out.buffer]);
};
