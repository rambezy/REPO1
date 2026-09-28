// Web worker that renders terrain chunks off the main thread.
import { renderChunkPixels, CHUNK, TS, GroundSource } from './terrainArt';

interface Req { id: number; src: GroundSource; cx: number; cy: number }

self.onmessage = (e: MessageEvent<Req>) => {
  const { id, src, cx, cy } = e.data;
  const px = CHUNK * TS;
  const out = new Uint32Array(px * px);
  renderChunkPixels(src, cx, cy, out);
  (self as unknown as Worker).postMessage({ id, cx, cy, buf: out.buffer }, [out.buffer]);
};
