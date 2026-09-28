// Preview of every item icon at 64 px in a labelled grid: the first half of
// the items on the dark HUD colour, the second half on inventory parchment.
//   ?swap=1        swap which half sits on which background
//   ?both=1        show every icon on both backgrounds side by side
//   ?size=32       preview at another display size
//   ?only=sword,bow  filter by shape
//   ?pixel=1       scale without smoothing (to inspect single pixels)
//   ?ui=1          a mock of the inventory screen and HUD, using the game's stylesheet
//   ?ground=1      items as world drops (groundIcon in story/lib.ts): as drawn today,
//                  then smoothed at 4x resolution, both shown at 4x world zoom

import { ITEMS } from '../src/content/items';
import { iconCanvas, iconURL, IconSpec } from '../src/gfx/icons';
import { P, CLOTH } from '../src/gfx/palette';

const q = new URLSearchParams(location.search);
const size = +(q.get('size') || 64);
const only = q.get('only')?.split(',');
const both = q.get('both') === '1';
const swap = q.get('swap') === '1';
const pixel = q.get('pixel') === '1';

type Entry = { name: string; icon: IconSpec; extra?: boolean };
let entries: Entry[] = Object.values(ITEMS).map((d) => ({ name: d.name, icon: d.icon }));
// icons used outside the item table, legacy shapes, and shapes offered for items.ts
const extras: Entry[] = [
  { name: 'Groschen (loot)', icon: { shape: 'purse' } },
  { name: 'unknown item', icon: { shape: 'box', c1: '#ff00ff' } },
  { name: 'coin', icon: { shape: 'coin' } },
  { name: 'shield', icon: { shape: 'shield', c1: CLOTH.woad, c2: P.gold2 } },
  { name: 'helmet', icon: { shape: 'helmet' } },
  { name: 'dress', icon: { shape: 'dress', c1: CLOTH.madder, c2: P.gold2 } },
  { name: 'horseshoe', icon: { shape: 'horseshoe', c1: P.metal2 } },
  { name: 'antlers', icon: { shape: 'antlers' } },
  { name: 'candle', icon: { shape: 'candle', c1: '#f0e0a0' } },
  { name: 'wax', icon: { shape: 'wax' } },
  { name: 'swarm', icon: { shape: 'swarm' } },
  { name: 'shovel', icon: { shape: 'shovel' } },
  { name: 'whetstone', icon: { shape: 'whetstone', c1: P.stone3 } },
  { name: 'ribbon', icon: { shape: 'ribbon', c1: CLOTH.green } },
  { name: 'apron', icon: { shape: 'apron', c1: CLOTH.white } },
  { name: 'basket', icon: { shape: 'basket' } },
  { name: 'blade', icon: { shape: 'blade', c1: '#5a5a62' } },
  { name: 'clapper', icon: { shape: 'clapper', c1: P.metal1 } },
];
entries.push(...extras.map((e) => ({ ...e, extra: true })));
if (only) entries = entries.filter((e) => only.includes(e.icon.shape));

function iconEl(spec: IconSpec): HTMLCanvasElement {
  const src = iconCanvas(spec);
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = !pixel;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, size, size);
  return c;
}

function cell(e: Entry, bgs: string[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cell' + (e.extra ? ' extra' : '');
  if (size !== 64) el.style.width = (size + 10) * bgs.length + 'px';
  const pair = document.createElement('div');
  pair.className = 'pair';
  for (const bg of bgs) {
    const box = document.createElement('div');
    if (bgs.length > 1) box.className = bg;
    if (size !== 64) { box.style.width = size + 10 + 'px'; box.style.height = size + 6 + 'px'; }
    box.appendChild(iconEl(e.icon));
    pair.appendChild(box);
  }
  el.appendChild(pair);
  const label = document.createElement('span');
  const col = [e.icon.c1, e.icon.c2, e.icon.c3].filter(Boolean).join(' ');
  label.textContent = e.name;
  if (size !== 64) label.style.width = (size + 8) * bgs.length + 'px';
  label.title = `${e.icon.shape} ${col}`;
  el.appendChild(label);
  return el;
}

const root = document.getElementById('root')!;
const t0 = performance.now();
if (q.get('ground') === '1') {
  const wrap = document.createElement('div');
  wrap.className = 'panel';
  wrap.style.background = '#4b7d33';
  for (const e of entries.slice(0, 40)) {
    for (const hi of [false, true]) {
      const src = iconCanvas(e.icon);
      const k = hi ? 4 : 1;
      const c = document.createElement('canvas');
      c.width = 14 * k; c.height = 13 * k;
      const g = c.getContext('2d')!;
      g.imageSmoothingEnabled = hi;
      g.imageSmoothingQuality = 'high';
      g.fillStyle = 'rgba(10,6,4,0.35)';
      g.beginPath(); g.ellipse(7 * k, 11 * k, 6 * k, 2 * k, 0, 0, Math.PI * 2); g.fill();
      g.drawImage(src, 0, 0, src.width, src.height, k, 0, 12 * k, 12 * k);
      const out = document.createElement('canvas');
      out.width = 56; out.height = 52;
      const og = out.getContext('2d')!;
      og.imageSmoothingEnabled = hi;
      og.imageSmoothingQuality = 'high';
      og.drawImage(c, 0, 0, 56, 52);
      out.style.margin = '4px';
      wrap.appendChild(out);
    }
  }
  root.appendChild(wrap);
} else if (q.get('ui') === '1') {
  await import('../src/styles.css');
  const ids = (q.get('items') || 'fathers_sword,hunting_bow,arrow,bascinet,linden_tabard,gauntlets,marta_bread,apple,beer,owls_eye,poppy,wolf_pelt,lantern,garnet_ring,wooden_fox,fathers_letter').split(',');
  const sel = q.get('sel') || ids[0];
  const row = (id: string) => `<button class="inv-row${id === sel ? ' sel' : ''}"><img src="${iconURL(ITEMS[id].icon)}" alt=""><span class="nm">${ITEMS[id].name}</span><span class="n">${ITEMS[id].stack ? '×3' : ''}</span><span class="eq"></span></button>`;
  const d = ITEMS[sel];
  root.innerHTML = `<div class="screen"><div class="vellum book"><div class="tabs"><button class="tab on">Inventory</button><button class="tab">Character</button></div>
    <div class="page"><div class="cols"><div style="display:flex;flex-direction:column;min-height:0"><div class="inv-list" style="flex:1">${ids.map(row).join('')}</div></div>
    <div><div class="inv-detail"><div class="big"><img src="${iconURL(d.icon)}" alt=""><div><h3 style="margin:0">${d.name}</h3><div class="meta">${d.cat.toUpperCase()} · ${d.weight} lb · ${d.value} g</div></div></div><p class="desc">${d.desc}</p></div>
    <h3>Worn</h3><div class="paperdoll">${['bascinet', 'linden_tabard', 'plate_greaves', 'gauntlets', 'fathers_sword', 'hunting_bow', 'lantern'].map((id) => `<button class="slot"><img src="${iconURL(ITEMS[id].icon)}" alt=""><span>${ITEMS[id].name}</span></button>`).join('')}</div></div></div></div></div></div>
    <div class="hud-quick" style="position:fixed;left:50%;bottom:12px;transform:translateX(-50%);display:flex;gap:6px">${['bread', 'beer', 'yarrow_salve', 'bandage'].map((id, i) => `<div class="slot"><b>${i + 1}</b><img src="${iconURL(ITEMS[id].icon)}" alt=""><em>2</em></div>`).join('')}</div>`;
} else if (both) {
  const panel = document.createElement('div');
  panel.className = 'panel both';
  for (const e of entries) panel.appendChild(cell(e, ['bg-dark', 'bg-parch']));
  root.appendChild(panel);
} else {
  const half = Math.ceil(entries.length / 2);
  const parts = [entries.slice(0, half), entries.slice(half)];
  const bgs = swap ? ['parch', 'dark'] : ['dark', 'parch'];
  parts.forEach((list, i) => {
    const panel = document.createElement('div');
    panel.className = 'panel ' + bgs[i];
    for (const e of list) panel.appendChild(cell(e, [bgs[i]]));
    root.appendChild(panel);
  });
}
console.log(`${entries.length} icons painted in ${(performance.now() - t0).toFixed(1)} ms`);
