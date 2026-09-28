// The character window: gear and inventory, skills, health and background.
import { h, openWindow, esc, bar, getWindow, isOpen } from './dom';
import { GridView, SlotView, acceptsSlot, hideTip } from './grid';
import { Char, EQUIP_SLOTS } from '../sim/char';
import { S } from '../sim/ctx';
import { ITEM, EquipSlot, slotFor } from '../content/items';
import { RACE } from '../content/races';
import { FACTION } from '../content/factions';
import { SKILLS, SKILL_INFO, SK, rateAt } from '../sim/skills';
import { LIMB_NAMES } from '../sim/body';
import { portrait } from '../render/portrait';
import { Item } from '../sim/inventory';
import { emit } from '../core/events';
import { koThreshold } from '../sim/health';
import { totalBounty } from '../sim/crime';
import { selected } from '../game/control';
import { eatSomething } from '../sim/ai';

let tab: 'gear' | 'skills' | 'health' | 'info' = 'gear';
let views: (GridView | SlotView)[] = [];
let current = 0;

export function openCharWindow(c?: Char) {
  c = c ?? selected()[0] ?? S.W.playerChars()[0];
  if (!c) return;
  current = c.id;
  const w = openWindow('char', c.name, { w: 640, x: 20, y: 70, cls: 'charwin' });
  w.onClose = () => { for (const v of views) v.destroy(); views = []; hideTip(); };
  render();
}

export function refreshCharWindow() { if (isOpen('char')) render(); }

function render() {
  const w = getWindow('char');
  const c = S.W.char(current);
  if (!w || !c) return;
  for (const v of views) v.destroy();
  views = [];
  w.title.firstChild!.textContent = c.name + (c.title ? ` — ${c.title}` : '');
  const b = w.body;
  b.innerHTML = '';
  // tabs and squad switcher
  const tabs = h('div', { class: 'tabs' });
  for (const [k, label] of [['gear', 'Gear'], ['skills', 'Skills'], ['health', 'Health'], ['info', 'Info']] as const) {
    const t = h('button', { class: 'tab' + (tab === k ? ' on' : '') }, label);
    t.onclick = () => { tab = k; render(); };
    tabs.appendChild(t);
  }
  const mates = S.W.playerChars();
  const sw = h('div', { class: 'mates' });
  for (const m of mates) {
    const im = h('img', { class: 'mate' + (m.id === c.id ? ' on' : ''), src: portrait(m), title: m.name }) as HTMLImageElement;
    im.onclick = () => { current = m.id; render(); };
    sw.appendChild(im);
  }
  if (c.faction === 'player') b.append(h('div', { class: 'charhead' }, tabs, sw));
  else b.append(h('div', { class: 'charhead' }, tabs));
  const content = h('div', { class: 'charbody' });
  b.appendChild(content);
  if (tab === 'gear') gearTab(c, content);
  else if (tab === 'skills') skillsTab(c, content);
  else if (tab === 'health') healthTab(c, content);
  else infoTab(c, content);
}

const SLOT_LABEL: Record<EquipSlot, string> = { weapon: 'Weapon', weapon2: 'Spare', ranged: 'Crossbow', head: 'Head', shirt: 'Shirt', body: 'Armour', legs: 'Legs', feet: 'Feet', back: 'Pack' };

function gearTab(c: Char, el: HTMLElement) {
  const mine = c.faction === 'player';
  const slots = h('div', { class: 'slots' });
  const afterChange = () => { c.dirty = true; emit('gear', c); setTimeout(render, 0); };
  const layout: [EquipSlot, number, number][] = [['head', 2, 2], ['weapon', 1, 4], ['weapon2', 1, 4], ['shirt', 2, 2], ['body', 3, 3], ['ranged', 3, 3], ['legs', 2, 3], ['feet', 2, 2], ['back', 3, 3]];
  for (const [slot, sw, sh] of layout) {
    const sv = new SlotView(slot, {
      label: SLOT_LABEL[slot],
      get: () => c.eq[slot],
      set: (it) => {
        if (it && slot === 'head' && !RACE[c.look.race]?.helmets) { emit('notice', `${RACE[c.look.race].name}s can't wear hats.`); return false; }
        if (it && slot === 'feet' && !RACE[c.look.race]?.boots) { emit('notice', `${RACE[c.look.race].name}s can't wear boots.`); return false; }
        c.eq[slot] = it;
        c.dirty = true;
        return true;
      },
      accept: (it) => mine && acceptsSlot(slot)(it),
      moved: afterChange,
    }, sw, sh);
    views.push(sv);
    slots.appendChild(h('div', { class: 'slotbox s-' + slot }, h('div', { class: 'slotname' }, SLOT_LABEL[slot]), sv.el));
  }
  const grids = h('div', { class: 'grids' });
  const inv = new GridView(c.inv, { label: 'Inventory', canTake: () => mine, accept: () => mine, rclick: (it) => itemMenu(c, it, c.inv), moved: afterChange });
  views.push(inv);
  grids.appendChild(inv.el);
  if (c.eq.back?.inv) {
    const pv = new GridView(c.eq.back.inv, { label: ITEM[c.eq.back.id].name, canTake: () => mine, accept: (it) => mine && it !== c.eq.back && !ITEM[it.id].pack, rclick: (it) => itemMenu(c, it, c.eq.back!.inv!), moved: afterChange });
    views.push(pv);
    grids.appendChild(pv.el);
  }
  const wt = c.carryWeight(), cap = c.capacity();
  const foot = h('div', { class: 'gearfoot' },
    h('span', { class: wt > cap ? 'bad' : 'dim' }, `Carrying ${wt.toFixed(1)} / ${cap.toFixed(0)} kg`),
    mine ? h('button', { class: 'tog small', onclick: () => { c.inv.sort(); c.eq.back?.inv?.sort(); render(); } }, 'Sort') : null,
    mine ? h('button', { class: 'tog small', onclick: () => { if (!eatSomething(c)) emit('notice', `${c.name} has nothing to eat.`); render(); } }, 'Eat') : null,
  );
  el.append(h('div', { class: 'gear' }, slots, grids), foot);
}

function itemMenu(c: Char, it: Item, grid: import('../sim/inventory').Grid) {
  const d = ITEM[it.id];
  const acts: [string, () => void][] = [];
  const slot = slotFor(d);
  if (slot) acts.push(['Equip', () => {
    grid.remove(it);
    const prev = c.eq[slot];
    c.eq[slot] = it;
    if (prev) { if (!grid.put(prev)) c.inv.put(prev) || dropItem(c, prev); }
    c.dirty = true;
  }]);
  if (d.food && d.cat !== 'drug') acts.push(['Eat', () => {
    c.hunger = Math.min(300, c.hunger + d.food!);
    it.n--; if (it.n <= 0) grid.remove(it);
    if (d.drink) c.mood += d.drink.mood;
  }]);
  if (d.med) acts.push(['Treat self', () => { emit('order', c, { k: 'aid', id: c.id }); }]);
  if (d.limb) acts.push(['Fit prosthetic', () => emit('ui:prosthetic', c.id, it.uid)]);
  if (d.book) acts.push(['Read', () => emit('ui:read', d.book, c.id)]);
  if (it.n > 1) acts.push(['Split stack', () => {
    const half = Math.floor(it.n / 2);
    const spot = grid.findSpot(d);
    if (!spot) return;
    it.n -= half;
    grid.items.push({ ...it, uid: Date.now() % 1e9 + Math.floor(Math.random() * 1000), n: half, x: spot[0], y: spot[1] });
  }]);
  acts.push(['Drop', () => { grid.remove(it); dropItem(c, it); }]);
  const m = h('div', { class: 'ctxmenu' }, h('div', { class: 'ctxtitle' }, d.name));
  for (const [label, fn] of acts) {
    const b = h('button', { class: 'ctxitem' }, label);
    b.onclick = () => { m.remove(); fn(); render(); };
    m.appendChild(b);
  }
  document.getElementById('ui')!.appendChild(m);
  const r = m.getBoundingClientRect();
  const mx = (window as any).__mx ?? 200, my = (window as any).__my ?? 200;
  m.style.left = Math.min(window.innerWidth - r.width - 8, mx + 6) + 'px';
  m.style.top = Math.min(window.innerHeight - r.height - 8, my + 6) + 'px';
  setTimeout(() => window.addEventListener('mousedown', function off(e) { if (!m.contains(e.target as Node)) { m.remove(); window.removeEventListener('mousedown', off); } }), 0);
}
window.addEventListener('mousemove', (e) => { (window as any).__mx = e.clientX; (window as any).__my = e.clientY; });

export function dropItem(c: Char, it: Item) {
  emit('world:drop', c.x, c.z, [it]);
}

function skillsTab(c: Char, el: HTMLElement) {
  const groups = new Map<string, HTMLElement>();
  for (const s of SKILLS) {
    const info = SKILL_INFO[s];
    let g = groups.get(info.group);
    if (!g) { g = h('div', { class: 'skgroup' }, h('div', { class: 'skhead' }, info.group)); groups.set(info.group, g); }
    const base = c.sk[SK[s]], eff = c.skill(s);
    const frac = base - Math.floor(base);
    const mod = Math.floor(eff + 1e-6) - Math.floor(base);
    const row = h('div', { class: 'skrow', title: info.desc + `\n\nLearning speed at this level: ${Math.round(rateAt(base) * 1000) / 10}` },
      h('span', { class: 'skname' }, info.name),
      h('span', { class: 'sklv' }, String(Math.floor(base)), mod ? h('span', { class: mod > 0 ? 'good' : 'bad' }, ` ${mod > 0 ? '+' : ''}${mod}`) : ''),
      bar(frac, 'xp'),
    );
    g.appendChild(row);
  }
  el.appendChild(h('div', { class: 'skills' }, ...groups.values()));
}

function healthTab(c: Char, el: HTMLElement) {
  const b = c.body;
  const fig = h('div', { class: 'bodyfig' });
  const pos: [number, number, number, number][] = [[42, 2, 36, 36], [36, 42, 48, 40], [38, 84, 44, 30], [84, 44, 22, 66], [14, 44, 22, 66], [60, 116, 22, 72], [38, 116, 22, 72]];
  for (let l = 0; l < 7; l++) {
    const [x, y, w, hh] = pos[l];
    const frac = b.has(l) ? b.hp[l] / b.max[l] : 0;
    const col = !b.has(l) ? (b.prost[l] ? '#6a7a8a' : '#2a2420') : frac > 0.66 ? '#7fae5a' : frac > 0.33 ? '#d8b24a' : frac > 0 ? '#d07a3a' : '#a03a2a';
    const part = h('div', { class: 'bpart', title: LIMB_NAMES[l] });
    Object.assign(part.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px', background: col });
    if (b.bleed[l] > 0.02) part.classList.add('bleeding');
    fig.appendChild(part);
  }
  const rows = h('div', { class: 'hrows' });
  for (let l = 0; l < 7; l++) {
    const lost = !b.has(l);
    const txt = lost ? (b.prost[l] ? `Prosthetic: ${ITEM[b.prost[l]!]?.name ?? '?'}` : 'Lost') : `${Math.round(b.hp[l])} / ${b.max[l]}`;
    const notes: string[] = [];
    if (b.bleed[l] > 0.02) notes.push(`<span class="bad">bleeding ${(b.bleed[l] * 60).toFixed(1)}/min</span>`);
    if (b.treated[l] > 0) notes.push('<span class="good">treated</span>');
    if (b.splint & (1 << l)) notes.push('<span class="good">splinted</span>');
    if (!lost && l < 3) notes.push(`<span class="dim">KO at ${Math.round(koThreshold(c, l))}</span>`);
    if (!lost && l >= 3 && b.hp[l] <= 0) notes.push(`<span class="bad">${l >= 5 ? 'broken — cannot walk' : 'useless'}</span>`);
    rows.appendChild(h('div', { class: 'hrow' },
      h('span', { class: 'hname' }, LIMB_NAMES[l]),
      lost ? h('span', { class: 'bad' }, txt) : bar(Math.max(0, b.hp[l] / b.max[l]), 'hp'),
      h('span', { class: 'hval', html: lost ? '' : txt }),
      h('span', { class: 'hnote', html: notes.join(' ') }),
    ));
  }
  const extra = h('div', { class: 'hextra' },
    h('div', {}, h('span', { class: 'hname' }, 'Blood'), bar(b.blood / b.bloodMax, 'bl'), h('span', { class: 'hval' }, `${Math.round(b.blood)} / ${b.bloodMax}`)),
    !c.robot ? h('div', {}, h('span', { class: 'hname' }, 'Hunger'), bar(c.hunger / 300, 'food'), h('span', { class: 'hval' }, c.hunger > 200 ? 'Full' : c.hunger > 100 ? 'Fed' : c.hunger > 40 ? 'Hungry' : 'Starving')) : h('div', { class: 'dim' }, 'Machines do not eat. Repair kits mend them.'),
    h('div', { class: 'dim' }, `Toughness ${Math.floor(c.skill('toughness'))}: stays conscious to ${Math.round(Math.min(0.85, c.skill('toughness') / 115) * 100)}% below zero.`),
  );
  el.append(h('div', { class: 'health' }, fig, h('div', {}, rows, extra)));
}

function infoTab(c: Char, el: HTMLElement) {
  const r = RACE[c.look.race];
  const f = FACTION[c.faction];
  const bounties = Object.entries(c.bounty).filter(([, v]) => v > 0).map(([k, v]) => `${FACTION[k]?.short ?? k}: ${v}c`);
  el.appendChild(h('div', { class: 'info' },
    h('img', { class: 'bigport', src: portrait(c) }),
    h('div', {},
      h('div', { class: 'ititle' }, c.name),
      h('div', { class: 'dim' }, `${r?.name ?? ''}${c.look.female ? ', female' : c.animal ? '' : ', male'} · ${f?.name ?? c.faction}${c.title ? ' · ' + c.title : ''}`),
      h('p', {}, r?.desc ?? ''),
      c.mem.backstory ? h('p', { class: 'story' }, c.mem.backstory) : null,
      h('div', {}, `Kills ${c.stats.kills} · Knock-outs ${c.stats.kos} · Times downed ${c.stats.downed}`),
      h('div', {}, `Walked ${(c.stats.dist / 1000).toFixed(1)} km`),
      bounties.length ? h('div', { class: 'bad' }, `Wanted — ${bounties.join(', ')} (total ${totalBounty(c)}c)`) : h('div', { class: 'dim' }, 'Not wanted by anyone.'),
    ),
  ));
  void esc; void EQUIP_SLOTS;
}
