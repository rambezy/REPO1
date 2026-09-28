// The book: Inventory, Character, Journal, Map, Codex and System tabs.

import { openScreen, el, button, UI, screenOpen, closeScreen } from './ui';
import { G } from '../G';
import { S, dateString, clockString, dayIndex } from '../state';
import { item, ItemDef } from '../content/items';
import { iconURL } from '../gfx/icons';
import { sortedInventory, useItem, isEquipped, weight, unequip, removeItem, count, disguise } from '../systems/inventory';
import { ATTRS, ATTR_INFO, SKILLS, SKILL_IDS, PERKS, level, xpFrac, availablePerks, takePerk, carryCap, maxHp, maxStamina, BUFF_INFO, hasPerk } from '../systems/stats';
import { QUESTS, objectiveFor } from '../systems/quests';
import { mapPanel } from './worldmap';
import { CHARS } from '../content/characters';
import { getPortrait } from '../gfx/portraits';
import { playerLook } from '../systems/inventory';
import { charisma } from '../systems/script';
import { saveGame, listSaves, readSave } from '../systems/save';
import { audio, setVolume } from '../audio/audio';
import { dlgSettings } from './dialogue';
import { esc, notify } from './notify';
import { emit } from '../engine/events';
import { PLACES } from '../content/places';
import { discovered } from './worldmap';
import { input } from '../engine/input';

type Tab = 'inventory' | 'character' | 'journal' | 'map' | 'codex' | 'system';
const TABS: [Tab, string][] = [['inventory', 'Inventory'], ['character', 'Character'], ['journal', 'Journal'], ['map', 'Map'], ['codex', 'Codex'], ['system', 'System']];

let current: Tab = 'inventory';
let invFilter = 'all';
let invSel: number | null = null;
let questSel: string | null = null;
let codexSel: string | null = null;

export function openMenu(tab: Tab = 'inventory') {
  current = tab;
  openScreen('book', (close) => {
    const book = el('div', { cls: 'vellum book' });
    const tabs = el('div', { cls: 'tabs' });
    const page = el('div', { cls: 'page' });
    const renderTabs = () => {
      tabs.innerHTML = '';
      for (const [id, label] of TABS) {
        const t = el('button', { cls: 'tab' + (id === current ? ' on' : ''), html: label });
        t.addEventListener('click', () => { current = id; renderTabs(); render(); });
        tabs.append(t);
      }
      const x = el('button', { cls: 'close', html: '✕', title: 'Close (Esc)' });
      x.addEventListener('click', close);
      tabs.append(x);
    };
    const render = () => {
      page.innerHTML = '';
      page.style.padding = current === 'map' ? '8px' : '';
      switch (current) {
        case 'inventory': page.append(inventoryTab(render)); break;
        case 'character': page.append(characterTab(render)); break;
        case 'journal': page.append(journalTab(render)); break;
        case 'map': { const mp = mapPanel(); mp.style.height = '100%'; page.append(mp); break; }
        case 'codex': page.append(codexTab(render)); break;
        case 'system': page.append(systemTab(close, render)); break;
      }
    };
    renderTabs();
    render();
    book.append(tabs, page);
    return book;
  });
}

// ---------- inventory ----------

const FILTERS: [string, string, (d: ItemDef) => boolean][] = [
  ['all', 'All', () => true], ['weapon', 'Weapons', (d) => d.cat === 'weapon' || d.cat === 'ammo'], ['armor', 'Armour', (d) => d.cat === 'armor'],
  ['food', 'Food', (d) => d.cat === 'food'], ['potion', 'Potions', (d) => d.cat === 'potion' || d.id === 'bandage'], ['herb', 'Herbs', (d) => d.cat === 'herb'],
  ['book', 'Books', (d) => d.cat === 'book'], ['quest', 'Keepsakes', (d) => d.cat === 'quest' || d.cat === 'key'], ['misc', 'Other', (d) => ['material', 'misc', 'tool'].includes(d.cat)],
];

function inventoryTab(rerender: () => void): HTMLElement {
  const cols = el('div', { cls: 'cols' });
  const left = el('div');
  left.style.display = 'flex'; left.style.flexDirection = 'column'; left.style.minHeight = '0';
  const right = el('div');
  cols.append(left, right);
  const filters = el('div', { cls: 'inv-filters' });
  for (const [id, label] of FILTERS) {
    const b = el('button', { cls: id === invFilter ? 'on' : '', html: label });
    b.addEventListener('click', () => { invFilter = id; invSel = null; rerender(); });
    filters.append(b);
  }
  const w = weight(), cap = carryCap();
  left.append(el('div', { cls: 'weight' + (w > cap ? ' over' : ''), html: `Carrying ${w} / ${cap} lb · Purse: <b>${S.money}</b> groschen` }), filters);
  const list = el('div', { cls: 'inv-list' });
  list.style.flex = '1';
  const fn = FILTERS.find((f) => f[0] === invFilter)![2];
  const items = sortedInventory().filter((e) => fn(e.def));
  if (!items.length) list.append(el('p', { html: '<i>Nothing here.</i>' }));
  for (const e of items) {
    const b = el('button', { cls: 'inv-row' + (invSel === e.index ? ' sel' : '') + (e.stack.stolen ? ' stolen' : '') });
    const eq = isEquipped(e.stack.id) ? 'worn' : '';
    b.innerHTML = `<img src="${iconURL(e.def.icon)}" alt=""><span class="nm">${esc(e.def.name)}${e.stack.q ? ` <span class="n">q${e.stack.q}</span>` : ''}</span><span class="n">${e.stack.n > 1 ? '×' + e.stack.n : ''}</span><span class="eq">${eq}</span>`;
    b.addEventListener('click', () => { invSel = e.index; rerender(); });
    b.addEventListener('dblclick', () => { useItem(e.stack.id); rerender(); });
    list.append(b);
  }
  left.append(list);
  // detail
  const det = el('div', { cls: 'inv-detail' });
  const s = invSel !== null ? S.inv[invSel] : null;
  if (s) {
    const d = item(s.id);
    const big = el('div', { cls: 'big' });
    big.innerHTML = `<img src="${iconURL(d.icon)}" alt=""><div><h3 style="margin:0">${esc(d.name)}</h3><div class="meta">${d.cat.toUpperCase()} · ${d.weight} lb · ${d.value} g${s.stolen ? ' · <span style="color:var(--madder)">STOLEN</span>' : ''}</div></div>`;
    det.append(big, el('p', { cls: 'desc', html: esc(d.desc) }));
    const stats: string[] = [];
    if (d.weapon) stats.push(`Slash ${d.weapon.slash} · Stab ${d.weapon.stab} · Blunt ${d.weapon.blunt}`, `Reach ${d.weapon.reach} · Speed ${d.weapon.speed.toFixed(2)}${d.str ? ` · Needs Strength ${d.str}` : ''}`);
    if (d.ranged) stats.push(`Arrow damage ${d.ranged.dmg} · Draw ${d.ranged.draw}s`);
    if (d.armor) stats.push(`Armour: slash ${d.armor.slash} · stab ${d.armor.stab} · blunt ${d.armor.blunt}`, `Noise ${d.armor.noise} · Charisma ${d.armor.charisma >= 0 ? '+' : ''}${d.armor.charisma}`);
    if (d.food) stats.push(`Nourishment +${d.food}`);
    if (d.heal) stats.push(`Health ${d.heal > 0 ? '+' : ''}${d.heal}`);
    if (d.alcohol) stats.push(`Alcohol +${d.alcohol}`);
    if (d.buff && BUFF_INFO[d.buff.id]) stats.push(`${BUFF_INFO[d.buff.id].name}: ${BUFF_INFO[d.buff.id].desc}`);
    if (d.disguise) stats.push(`Disguise: passes for ${d.disguise === 'harrow' ? 'one of Harrow\'s men' : d.disguise === 'clergy' ? 'a man of God' : d.disguise === 'servant' ? 'a camp servant' : 'a Linden guard'}`);
    if (s.cond !== undefined) stats.push(`Condition ${Math.round(s.cond)}%`);
    if (stats.length) det.append(el('div', { cls: 'meta', html: stats.map(esc).join('<br>') }));
    const acts = el('div', { cls: 'actions' });
    const usable = d.slot || d.cat === 'food' || d.cat === 'potion' || d.book || s.id === 'bandage' || s.id === 'torch' || s.id === 'lantern';
    if (usable) {
      const label = d.slot ? (isEquipped(s.id) ? 'Take off' : 'Equip') : d.book ? 'Read' : d.cat === 'food' ? (d.alcohol ? 'Drink' : 'Eat') : 'Use';
      acts.append(button(label, () => { useItem(s.id); invSel = S.inv.indexOf(s) >= 0 ? S.inv.indexOf(s) : null; rerender(); }, 'btn primary'));
    }
    if (d.cat === 'food' || d.cat === 'potion' || s.id === 'bandage') {
      for (let i = 0; i < 4; i++) acts.append(button(`Slot ${i + 1}`, () => { S.quick[i] = s.id; notify(`${d.name} in quick slot ${i + 1}.`, 'info', 1500); rerender(); }, S.quick[i] === s.id ? 'btn sel' : 'btn'));
    }
    if (!d.quest && d.cat !== 'key') acts.append(button('Drop', () => {
      if (isEquipped(s.id) && count(s.id) <= 1) { for (const k of Object.keys(S.equip)) if (S.equip[k] === s.id) unequip(k as never); }
      removeItem(s.id, s.n);
      invSel = null;
      rerender();
    }));
    det.append(acts);
  } else {
    det.append(el('p', { cls: 'desc', html: 'Select an item. Double-click to use or equip it.' }));
  }
  // paperdoll
  const doll = el('div', { cls: 'paperdoll' });
  for (const [slot, label] of [['head', 'Head'], ['body', 'Body'], ['legs', 'Legs'], ['hands', 'Hands'], ['weapon', 'Weapon'], ['bow', 'Bow'], ['torch', 'Light']] as const) {
    const id = S.equip[slot];
    const sl = el('button', { cls: 'slot' });
    sl.innerHTML = id ? `<img src="${iconURL(item(id).icon)}" alt=""><span>${esc(item(id).name)}</span>` : `<span>${label}</span><span style="opacity:.6">empty</span>`;
    if (id) sl.addEventListener('click', () => { unequip(slot); rerender(); });
    doll.append(sl);
  }
  const p = G.player;
  const arm = p.combat.armor;
  const summary = el('div', { cls: 'stats-grid' });
  summary.innerHTML = `<div><span>Health</span><b>${Math.round(p.hp)}/${Math.round(p.maxHp)}</b></div><div><span>Stamina</span><b>${Math.round(p.stamina)}/${Math.round(p.maxStamina)}</b></div>
    <div><span>Slash armour</span><b>${arm.slash}</b></div><div><span>Stab armour</span><b>${arm.stab}</b></div><div><span>Blunt armour</span><b>${arm.blunt}</b></div>
    <div><span>Noise</span><b>${arm.noise}</b></div><div><span>Charisma</span><b>${charisma() >= 0 ? '+' : ''}${charisma()}</b></div><div><span>Disguise</span><b>${disguise() || '—'}</b></div>`;
  right.append(det, el('h3', { html: 'Worn' }), doll, el('h3', { html: 'Condition' }), summary);
  return cols;
}

// ---------- character ----------

function characterTab(rerender: () => void): HTMLElement {
  const cols = el('div', { cls: 'cols' });
  const left = el('div'), right = el('div');
  cols.append(left, right);
  const pc = getPortrait('player', playerLook(), 'neutral');
  const head = el('div');
  head.style.display = 'flex'; head.style.gap = '14px'; head.style.alignItems = 'center';
  const img = document.createElement('canvas');
  img.width = 48; img.height = 48;
  img.getContext('2d')!.drawImage(pc, 0, 0);
  img.style.width = '96px'; img.style.height = '96px'; img.style.imageRendering = 'pixelated'; img.style.border = '2px solid #3a2c1e';
  head.append(img, el('div', { html: `<h2>${esc(S.playerName)}</h2><div class="meta">Son of Radek the smith · ${dateString()}, ${clockString()} · Day ${dayIndex() + 1}</div>` }));
  left.append(head);
  left.append(el('h3', { html: 'Attributes' }));
  for (const a of ATTRS) left.append(skillRow(ATTR_INFO[a].name, a, ATTR_INFO[a].desc));
  left.append(el('h3', { html: 'Skills' }));
  for (const k of SKILL_IDS) left.append(skillRow(SKILLS[k].name, k, SKILLS[k].desc));
  // perks
  right.append(el('h3', { html: 'Perks' }));
  const havePts = Object.entries(S.perkPoints).filter(([, n]) => n > 0);
  const skillName = (k: string) => SKILLS[k]?.name || (ATTR_INFO as Record<string, { name: string }>)[k]?.name || k;
  if (havePts.length) right.append(el('p', { cls: 'meta', html: 'Perk points to spend: ' + havePts.map(([k, n]) => `${esc(skillName(k))} ×${n}`).join(', ') }));
  for (const [k, n] of havePts) {
    for (const p of availablePerks(k)) {
      const d = el('div', { cls: 'perk' });
      d.innerHTML = `<b>${esc(p.name)}</b> <span class="meta">(${esc(SKILLS[k]?.name || k)} ${p.level})</span><div>${esc(p.desc)}</div>`;
      if (n > 0) d.append(button('Learn', () => { takePerk(p.id); rerender(); }, 'btn primary'));
      right.append(d);
    }
  }
  const owned = PERKS.filter((p) => hasPerk(p.id));
  if (owned.length) {
    right.append(el('h3', { html: 'Known perks' }));
    for (const p of owned) right.append(el('div', { cls: 'perk have', html: `<b>${esc(p.name)}</b><div>${esc(p.desc)}</div>` }));
  } else if (!havePts.length) right.append(el('p', { cls: 'desc', html: 'You learn perks as your skills grow. Every skill improves by doing: fight to fight better, read to read better.' }));
  right.append(el('h3', { html: 'State' }));
  const st = el('div', { cls: 'stats-grid' });
  st.innerHTML = `<div><span>Max health</span><b>${maxHp()}</b></div><div><span>Max stamina</span><b>${maxStamina()}</b></div><div><span>Carry</span><b>${carryCap()} lb</b></div>
    <div><span>Nourishment</span><b>${Math.round(S.hunger)}</b></div><div><span>Energy</span><b>${Math.round(S.energy)}</b></div><div><span>Cleanliness</span><b>${Math.round(100 - S.dirt)}</b></div>
    <div><span>Kills</span><b>${S.stats.kills_human || 0}</b></div><div><span>Mercy shown</span><b>${S.stats.mercy || 0}</b></div><div><span>Perfect blocks</span><b>${S.stats.perfect_blocks || 0}</b></div>`;
  right.append(st);
  const buffs = S.buffs.filter((b) => b.until > S.minutes && BUFF_INFO[b.id]);
  if (buffs.length) {
    right.append(el('h3', { html: 'Effects' }));
    for (const b of buffs) right.append(el('div', { cls: 'perk' + (BUFF_INFO[b.id].good ? ' have' : ''), html: `<b>${BUFF_INFO[b.id].name}</b> <span class="meta">${Math.ceil((b.until - S.minutes) / 60)} h</span><div>${BUFF_INFO[b.id].desc}</div>` }));
  }
  const rep = el('div', { cls: 'stats-grid' });
  const names: Record<string, string> = { hollowbrook: 'Hollowbrook', linden: 'Linden Hill', priory: 'St. Aldhelm\'s', silverdale: 'Silverdale', refugees: 'Refugees', harrow: 'Harrow\'s Company' };
  rep.innerHTML = Object.entries(S.rep).map(([k, v]) => `<div><span>${names[k] || k}</span><b>${v}</b></div>`).join('');
  right.append(el('h3', { html: 'Reputation' }), rep);
  return cols;
}

function skillRow(name: string, key: string, desc: string): HTMLElement {
  const r = el('div', { cls: 'skill-row', title: desc });
  r.innerHTML = `<span>${esc(name)}</span><span class="lv">${level(key)}</span><div class="xpbar"><i style="width:${(xpFrac(key) * 100).toFixed(0)}%"></i></div>`;
  return r;
}

// ---------- journal ----------

function journalTab(rerender: () => void): HTMLElement {
  const cols = el('div', { cls: 'cols' });
  const left = el('div'), right = el('div');
  cols.append(left, right);
  const ids = Object.keys(S.quests).filter((k) => QUESTS[k]);
  const active = ids.filter((k) => S.quests[k].status === 'active').sort((a, b) => (QUESTS[a].kind === 'main' ? -1 : 1) - (QUESTS[b].kind === 'main' ? -1 : 1));
  const done = ids.filter((k) => S.quests[k].status !== 'active');
  if (!questSel || !S.quests[questSel]) questSel = active[0] || done[0] || null;
  const listSection = (title: string, arr: string[]) => {
    if (!arr.length) return;
    left.append(el('h3', { html: title }));
    const l = el('div', { cls: 'quest-list' });
    for (const k of arr) {
      const q = QUESTS[k];
      const b = el('button', { cls: 'quest-item' + (k === questSel ? ' sel' : '') + (S.quests[k].status !== 'active' ? ' done' : '') + (q.kind === 'main' ? ' main' : '') });
      b.innerHTML = `${esc(q.title)} ${S.trackedQuest === k ? '<span class="trk">◆ tracked</span>' : ''}`;
      b.addEventListener('click', () => { questSel = k; rerender(); });
      l.append(b);
    }
    left.append(l);
  };
  listSection('Current', active);
  listSection('Finished', done);
  if (!ids.length) left.append(el('p', { cls: 'desc', html: 'Nothing written yet.' }));
  if (questSel) {
    const q = QUESTS[questSel];
    const st = S.quests[questSel];
    right.append(el('h2', { html: esc(q.title) }), el('div', { cls: 'meta', html: `${q.kind === 'main' ? 'Main story' : 'Side quest'}${q.act ? ' · ' + q.act : ''}${st.status !== 'active' ? ' · ' + st.status : ''}` }));
    const ob = objectiveFor(questSel);
    if (ob && ob.obj) {
      right.append(el('div', { cls: 'objective', html: '◆ ' + esc(ob.obj) }));
      for (const x of ob.extra) right.append(el('div', { cls: 'objective', html: '◇ ' + esc(x) }));
    }
    if (st.status === 'active' && S.trackedQuest !== questSel) right.append(button('Track this quest', () => { S.trackedQuest = questSel; rerender(); }));
    right.append(el('hr', { cls: 'rule' }));
    for (const e of st.entries) right.append(el('p', { cls: 'entry', html: esc(e) }));
    if (!st.entries.length) right.append(el('p', { cls: 'desc', html: esc(q.summary) }));
  }
  return cols;
}

// ---------- codex ----------

function codexTab(rerender: () => void): HTMLElement {
  const cols = el('div', { cls: 'cols' });
  const left = el('div'), right = el('div');
  cols.append(left, right);
  const met = Object.values(CHARS).filter((c) => c.codex && (S.flags['met_' + c.id] || ['radek', 'marta', 'lida', 'pavel', 'hanka'].includes(c.id)));
  left.append(el('h3', { html: 'People' }));
  const l = el('div', { cls: 'quest-list' });
  for (const c of met) {
    const b = el('button', { cls: 'quest-item' + (codexSel === c.id ? ' sel' : ''), html: `${esc(c.name)} <span class="meta">${esc(c.title || '')}</span>${S.deadNpcs[c.id] ? ' ✝' : ''}` });
    b.addEventListener('click', () => { codexSel = c.id; rerender(); });
    l.append(b);
  }
  left.append(l);
  left.append(el('h3', { html: 'Places' }));
  for (const p of PLACES.filter(discovered)) left.append(el('div', { cls: 'objective', html: `<b>${esc(p.name)}</b> — <span style="font-family:var(--body)">${esc(p.desc)}</span>` }));
  const c = codexSel ? CHARS[codexSel] : met[0];
  if (c) {
    const pc = getPortrait('c:' + c.id, c.look, S.deadNpcs[c.id] ? 'sleep' : 'neutral');
    const cv = document.createElement('canvas');
    cv.width = 48; cv.height = 48;
    cv.getContext('2d')!.drawImage(pc, 0, 0);
    cv.style.width = '144px'; cv.style.height = '144px'; cv.style.imageRendering = 'pixelated'; cv.style.border = '2px solid #3a2c1e';
    right.append(cv, el('h2', { html: esc(c.name) }), el('div', { cls: 'meta', html: esc(c.title || '') }), el('p', { html: esc(c.codex || '') }));
    const extra = S.flags['codex_' + c.id] as string[] | undefined;
    if (extra) for (const e of extra) right.append(el('p', { cls: 'entry', html: esc(e) }));
    if (S.deadNpcs[c.id]) right.append(el('p', { cls: 'desc', html: 'Requiescat in pace.' }));
  }
  return cols;
}

// ---------- system ----------

function systemTab(close: () => void, rerender: () => void): HTMLElement {
  const cols = el('div', { cls: 'cols' });
  const left = el('div'), right = el('div');
  cols.append(left, right);
  left.append(el('h2', { html: 'Saves' }));
  const saves = listSaves();
  for (const slot of ['1', '2', '3']) {
    const meta = saves.find((s) => s.slot === slot);
    const d = el('div', { cls: 'perk' });
    d.innerHTML = `<b>Slot ${slot}</b> ${meta ? `<span class="meta">${esc(meta.name)} · day ${meta.day} · ${esc(meta.place)} · ${new Date(meta.savedAt).toLocaleString()}</span>` : '<span class="meta">empty</span>'}`;
    const row = el('div', { cls: 'actions' });
    row.append(button('Save here', () => { if (G.mode === 'menu' && !G.controlLocked) { saveGame(slot); rerender(); } }));
    if (meta) row.append(button('Load', () => { const st = readSave(slot); if (st) { close(); emit('load', st); } }));
    d.append(row);
    left.append(d);
  }
  const auto = saves.find((s) => s.slot === 'auto');
  if (auto) {
    const d = el('div', { cls: 'perk', html: `<b>Autosave</b> <span class="meta">day ${auto.day} · ${esc(auto.place)} · ${new Date(auto.savedAt).toLocaleString()}</span>` });
    d.append(button('Load', () => { const st = readSave('auto'); if (st) { close(); emit('load', st); } }));
    left.append(d);
  }
  left.append(el('p', { cls: 'meta', html: 'The game also saves itself whenever you sleep.' }));
  right.append(el('h2', { html: 'Settings' }));
  const slider = (label: string, val: number, on: (v: number) => void, id: string) => {
    const lab = el('label', { html: `<span>${label}</span>` });
    const inp = el('input', { type: 'range', min: '0', max: '1', step: '0.05', value: String(val), id });
    inp.addEventListener('input', () => on(parseFloat(inp.value)));
    const wrap = el('div');
    wrap.style.margin = '8px 0';
    wrap.append(lab, inp);
    return wrap;
  };
  right.append(slider('Master volume', audio.vol.master, (v) => setVolume('master', v), 'vol-master'));
  right.append(slider('Music', audio.vol.music, (v) => setVolume('music', v), 'vol-music'));
  right.append(slider('Sound effects', audio.vol.sfx, (v) => setVolume('sfx', v), 'vol-sfx'));
  right.append(slider('Text speed', (dlgSettings.speed - 20) / 100, (v) => { dlgSettings.speed = 20 + v * 100; }, 'text-speed'));
  const diff = el('div', { cls: 'actions' });
  for (const [d, label] of [['story', 'Story'], ['normal', 'Normal'], ['hard', 'Hard']] as const) diff.append(button(label, () => { S.difficulty = d; rerender(); }, S.difficulty === d ? 'btn sel' : 'btn'));
  right.append(el('h3', { html: 'Difficulty' }), diff);
  right.append(el('h3', { html: 'Controls' }), el('div', { cls: 'meta', html: controlsHTML() }));
  right.append(el('hr', { cls: 'rule' }));
  right.append(button('Return to title', () => { close(); emit('title'); }));
  return cols;
}

export function controlsHTML() {
  return [
    'Move: <b>WASD</b> / arrows · Sprint: <b>Shift</b> · Sneak: <b>Ctrl</b> or <b>X</b>',
    'Interact / talk: <b>E</b> · Attack: <b>Left click</b> or <b>J</b> (hold for a heavy blow)',
    'Block: <b>Right click</b> or <b>K</b>. Press it just before a blow lands for a <b>perfect block</b>',
    'Dodge: <b>Space</b> or <b>L</b> · Bow/melee: <b>R</b> · Torch: <b>F</b> · Dog: <b>Q</b> · Wait: <b>T</b>',
    'Inventory <b>I</b> · Character <b>C</b> · Journal <b>B</b> · Map <b>M</b> · Menu <b>Esc</b> · Quick items <b>1-4</b>',
  ].join('<br>');
}

/** Global menu hotkeys (called every frame). */
export function menuHotkeys() {
  if (UI.screen) {
    if (input.pressed('cancel') || input.pressed('menu')) { input.consume('cancel'); input.consume('menu'); closeScreen(); return; }
    const map: Partial<Record<string, Tab>> = { inventory: 'inventory', character: 'character', journal: 'journal', map: 'map' };
    if (screenOpen('book')) {
      for (const [act, tab] of Object.entries(map)) if (input.pressed(act as never)) { if (current === tab) closeScreen(); else { closeScreen(); openMenu(tab!); } return; }
    }
    return;
  }
  if (G.mode !== 'play' || G.controlLocked) return;
  if (input.pressed('inventory')) openMenu('inventory');
  else if (input.pressed('character')) openMenu('character');
  else if (input.pressed('journal')) openMenu('journal');
  else if (input.pressed('map')) openMenu('map');
  else if (input.pressed('menu')) openMenu('system');
}
