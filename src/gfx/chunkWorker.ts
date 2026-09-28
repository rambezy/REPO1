// Web worker that paints ground chunks off the main thread. It paints its own
// material textures on an OffscreenCanvas when it can, or uses ones sent in.
import { renderGround, groundSize, GroundSource, TexSource } from './ground/render';
import { TexCache, MatTex, MatName } from './ground/textures';

let tr = 3;
let tex: TexSource | null = null;

interface Req { type?: 'init'; id: number; src: GroundSource; cx: number; cy: number; tr?: number; tex?: Record<string, MatTex> }

self.onmessage = (e: MessageEvent<Req>) => {
  const d = e.data;
  if (d.type === 'init') {
    tr = d.tr!;
    if (d.tex) { const t = d.tex; tex = { get: (n: MatName) => t[n] }; }
    else tex = new TexCache(tr);
    return;
  }
  if (!tex) return;
  const n = groundSize(tr);
  const out = new Uint32Array(n * n);
  renderGround(d.src, d.cx, d.cy, tr, tex, out);
  (self as unknown as Worker).postMessage({ id: d.id, cx: d.cx, cy: d.cy, buf: out.buffer }, [out.buffer]);
};
