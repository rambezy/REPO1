import { registerWorld } from '../src/content/world/overworld';
import { registerVillageInteriors } from '../src/content/world/interiors_village';
import { registerTownInteriors } from '../src/content/world/interiors_town';
import { getMap } from '../src/world/world';
import { T, tdef } from '../src/world/terrain';
import { setFlag } from '../src/state';

const params = new URLSearchParams(location.search);
if (params.get('hb')) setFlag('hb_state', params.get('hb'));
registerWorld(); registerVillageInteriors(); registerTownInteriors();
const id = params.get('map') || 'overworld';
const m = getMap(id);
const S = +(params.get('s') || 4);
const x0 = +(params.get('x0') || 0), y0 = +(params.get('y0') || 0);
const w = +(params.get('w') || m.w), h = +(params.get('h') || m.h);
const c = document.getElementById('c') as HTMLCanvasElement;
c.width = w * S; c.height = h * S;
const ctx = c.getContext('2d')!;
const col = (t: number) => {
  switch (t) {
    case T.WATER: return '#3a6a98'; case T.DEEP: return '#244a70'; case T.FORD: return '#5a8ab8';
    case T.ROAD: return '#b08a5a'; case T.DIRT: return '#8a6a44'; case T.COBBLE: return '#9a9a9a'; case T.FLAGSTONE: return '#aaa8a0';
    case T.FOREST: return '#2e5226'; case T.MEADOW: return '#6a9a44'; case T.FIELD: return '#6a4a30'; case T.WHEAT: return '#c8a452'; case T.VEG: return '#4a6a30';
    case T.SAND: return '#c8b07a'; case T.ASH: return '#3a3634'; case T.BRIDGE: case T.BRIDGE_V: return '#e08040';
    case T.ROCK: return '#6b6b73'; case T.WOOD: return '#8a5c33'; case T.STRAW: return '#9a7a50'; case T.CARPET: return '#8a2a26';
    case T.GRAVEL: return '#7a7a80'; case T.MUD: return '#4d3a28';
    default: return tdef(t).wall ? '#2a2420' : '#4b7d33';
  }
};
for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { ctx.fillStyle = col(m.get(x0 + x, y0 + y)); ctx.fillRect(x * S, y * S, S, S); }
for (const o of m.objects) {
  const ox = o.x / 16 - x0, oy = o.y / 16 - y0;
  if (o.kind === 'tree') { ctx.fillStyle = '#143010'; ctx.fillRect(ox * S - 1, oy * S - 2, 3, 3); }
  if (o.solid && (o.kind === 'building' || o.type === 'wallblock')) { ctx.fillStyle = 'rgba(200,60,40,0.75)'; ctx.fillRect((o.solid.x / 16 - x0) * S, (o.solid.y / 16 - y0) * S, (o.solid.w / 16) * S, (o.solid.h / 16) * S); }
  else if (o.kind === 'prop' && o.solid) { ctx.fillStyle = '#e0c060'; ctx.fillRect(ox * S - 1, oy * S - 1, 2, 2); }
  if (o.interact?.type === 'door') { ctx.fillStyle = '#00ffff'; ctx.fillRect(ox * S - 2, oy * S - 2, 4, 4); }
  if (o.kind === 'herb') { ctx.fillStyle = '#ff60ff'; ctx.fillRect(ox * S, oy * S, 1, 1); }
}
ctx.font = '10px monospace';
for (const [k, s] of Object.entries(m.spawns)) {
  const sx = s.x / 16 - x0, sy = s.y / 16 - y0;
  if (sx < 0 || sy < 0 || sx > w || sy > h) continue;
  ctx.fillStyle = '#ffffff'; ctx.fillRect(sx * S - 1, sy * S - 1, 3, 3);
  if (S >= 6) { ctx.fillStyle = '#fff'; ctx.fillText(k, sx * S + 3, sy * S); }
}
