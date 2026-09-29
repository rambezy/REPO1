// Character screen: creation, viewing, skill point allocation and perks.

import { G, player } from '../game/G';
import { el, esc } from '../core/util';
import type { Actor } from '../game/types';
import { PERKS, SKILL_INFO, SKILL_KEYS, STAT_INFO, STAT_KEYS, TRAITS, statLabel, xpForLevel, karmaTitle, type SkillKey, type StatKey } from '../data/stats';
import {
  armorClass, carryWeight, critChance, damageResist, healingRate, maxAp, maxHp, meleeDamage, perkRank,
  poisonResist, radResist, sequence, skill, skillCost, stat,
} from '../game/character';
import { button, closeModal, openModal, toast } from './common';
import { emit, msg } from '../game/log';
import { sfx } from '../audio/sfx';

type Mode = 'create' | 'view';
let win: HTMLElement;
let mode: Mode = 'view';
let a: Actor;
let info = { title: '', text: '' };
let onDone: ((ok: boolean) => void) | null = null;
// Pending skill allocations this session (so they can be undone before closing).
let spent: Partial<Record<SkillKey, number[]>> = {};

const STAT_POOL = 5;

function statPointsLeft(): number {
  let used = 0;
  for (const k of STAT_KEYS) used += a.stats[k] - 5;
  return STAT_POOL - used;
}

export function openCharacter() {
  if (G.modal) return;
  a = player();
  mode = 'view';
  spent = {};
  info = { title: a.name, text: 'Level ' + a.level + '. ' + karmaTitle(G.state.karma) + '.' };
  win = el('div', 'panel win cha');
  openModal('character', win, { onClose: () => emit('hud') });
  render();
}

/** Opens the creation screen for an actor; resolves when the player confirms or cancels. */
export function openCreation(actor: Actor): Promise<boolean> {
  a = actor;
  mode = 'create';
  spent = {};
  info = { title: 'Create a character', text: 'Distribute your points among the seven attributes, choose up to two traits, and tag three skills. Tagged skills start higher and improve twice as fast.' };
  win = el('div', 'panel win cha');
  return new Promise((res) => {
    onDone = res;
    openModal('character', win, { noBackClose: true });
    render();
  });
}

function setInfo(title: string, text: string) {
  info = { title, text };
  const card = win.querySelector('.card');
  if (card) card.innerHTML = `<b>${esc(title)}</b>${esc(text)}`;
}

function render() {
  win.innerHTML = '';
  const head = el('div', 'row');
  head.style.justifyContent = 'space-between';
  head.style.alignItems = 'center';
  if (mode === 'create') {
    const name = el('input', 'name') as HTMLInputElement;
    name.value = a.name;
    name.maxLength = 18;
    name.oninput = () => (a.name = name.value || 'Wanderer');
    name.style.maxWidth = '240px';
    const sex = button((a as any).female ? 'Female' : 'Male', () => {
      (a as any).female = !(a as any).female;
      (a as any).look = { ...((a as any).look ?? {}), female: (a as any).female, hairStyle: (a as any).female ? 'long' : 'short' };
      render();
    }, 'small');
    head.append(name, sex);
  } else {
    head.appendChild(el('h2', '', esc(a.name)));
  }
  win.appendChild(head);

  const body = el('div', 'body');
  // ---------------------------------------------------------- stats
  const left = el('div', 'col');
  left.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-height:0';
  const statsBox = el('div', 'screen');
  statsBox.style.padding = '6px';
  for (const k of STAT_KEYS) {
    const row = el('div', 'stat');
    const eff = stat(a, k);
    row.innerHTML = `<span class="nm">${STAT_INFO[k].name}</span><span class="v">${String(eff).padStart(2, '0')}</span><span class="lbl">${statLabel(eff)}</span>`;
    const pm = el('span', 'pm');
    const intense = (G.state?.flags?._intense ?? 0) > 0 && mode === 'view';
    if (mode === 'create' || intense) {
      if (mode === 'create') pm.appendChild(button('-', () => changeStat(k, -1), 'small'));
      pm.appendChild(button('+', () => changeStat(k, 1), 'small'));
    }
    row.appendChild(pm);
    row.onmouseenter = row.onclick = () => setInfo(STAT_INFO[k].name, STAT_INFO[k].desc);
    statsBox.appendChild(row);
  }
  left.appendChild(statsBox);
  if (mode === 'create') {
    left.appendChild(el('div', 'screen pts', `<span>Char points</span><span style="font-family:var(--big);font-size:26px;color:var(--amber)">${statPointsLeft()}</span>`)).setAttribute('style', 'padding:4px 10px');
  } else if ((G.state.flags._intense ?? 0) > 0) {
    left.appendChild(el('div', 'screen pts', `<span>Training: raise a statistic</span><span>${G.state.flags._intense}</span>`)).setAttribute('style', 'padding:4px 10px');
  }
  const derived = el('div', 'derived screen scrolly');
  derived.style.flex = '1';
  const dl: [string, string | number][] = [
    ['Hit Points', `${mode === 'create' ? maxHp(a) : a.hp}/${maxHp(a)}`],
    ['Armor Class', armorClass(a)],
    ['Action Points', maxAp(a)],
    ['Carry Weight', carryWeight(a)],
    ['Melee Damage', meleeDamage(a)],
    ['Damage Res.', damageResist(a, 'normal') + '%'],
    ['Poison Res.', poisonResist(a) + '%'],
    ['Radiation Res.', radResist(a) + '%'],
    ['Sequence', sequence(a)],
    ['Healing Rate', healingRate(a)],
    ['Critical Chance', critChance(a) + '%'],
  ];
  derived.innerHTML = dl.map(([k, v]) => `<div><span>${k}</span><span>${v}</span></div>`).join('');
  if (mode === 'view') {
    derived.innerHTML += `<br><div><span>Level</span><span>${a.level}</span></div><div><span>Experience</span><span>${a.xp}</span></div><div><span>Next level</span><span>${xpForLevel(a.level + 1)}</span></div>`;
    derived.innerHTML += `<div><span>Karma</span><span>${G.state.karma}</span></div><div style="color:var(--amber)">${esc(karmaTitle(G.state.karma))}</div>`;
    if (a.rads) derived.innerHTML += `<div><span>Radiation</span><span>${Math.round(a.rads)}</span></div>`;
    if (a.poison) derived.innerHTML += `<div><span>Poisoned</span><span>${a.poison}</span></div>`;
    const cr = Object.keys(a.crippled).filter((k) => (a.crippled as any)[k]);
    if (cr.length) derived.innerHTML += `<div style="color:#ff6a50">Crippled: ${cr.join(', ')}</div>`;
    for (const e of a.effects) if (!e.id.startsWith('addict_') && e.id !== 'radsick') derived.innerHTML += `<div style="color:#c8d070">${e.id}</div>`;
    for (const e of a.effects) if (e.id.startsWith('addict_')) derived.innerHTML += `<div style="color:#ff6a50">Addicted: ${e.id.slice(7)}</div>`;
  }
  left.appendChild(derived);

  // ---------------------------------------------------------- skills
  const mid = el('div', '');
  mid.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-height:0';
  const skills = el('div', 'screen scrolly');
  skills.style.cssText = 'padding:6px;flex:1';
  const tags = a.tags ?? [];
  const pts = G.state?.flags?._skillPts ?? 0;
  for (const k of SKILL_KEYS) {
    const row = el('div', 'sk' + (tags.includes(k) ? ' tag' : ''));
    row.innerHTML = `<span class="tagd"></span><span>${SKILL_INFO[k].name}</span><span class="val">${skill(a, k)}%</span>`;
    const pm = el('span', 'pm');
    if (mode === 'view' && pts > 0) pm.appendChild(button('+', () => raiseSkill(k), 'small'));
    if (mode === 'view' && (spent[k]?.length ?? 0) > 0) pm.appendChild(button('-', () => lowerSkill(k), 'small'));
    row.appendChild(pm);
    row.onmouseenter = () => setInfo(SKILL_INFO[k].name, SKILL_INFO[k].desc + (mode === 'create' ? ' Click to tag.' : ''));
    if (mode === 'create') row.onclick = () => toggleTag(k);
    skills.appendChild(row);
  }
  mid.appendChild(skills);
  if (mode === 'create') mid.appendChild(el('div', 'screen pts', `<span>Tag skills</span><span>${3 - tags.length}</span>`)).setAttribute('style', 'padding:4px 10px');
  else mid.appendChild(el('div', 'screen pts', `<span>Skill points</span><span style="font-family:var(--big);font-size:26px;color:var(--amber)">${pts}</span>`)).setAttribute('style', 'padding:4px 10px');

  // ---------------------------------------------------------- traits/perks + info
  const right = el('div', '');
  right.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-height:0';
  const list = el('div', 'screen scrolly');
  list.style.cssText = 'padding:6px;flex:1';
  if (mode === 'create') {
    list.appendChild(el('div', '', '<span style="color:var(--amber)">TRAITS</span> <small>(choose up to two)</small>'));
    for (const t of TRAITS) {
      const on = a.traits?.includes(t.id);
      const row = el('div', 'trait' + (on ? ' on' : ''), esc(t.name));
      row.onmouseenter = () => setInfo(t.name, t.desc);
      row.onclick = () => {
        a.traits ??= [];
        if (on) a.traits = a.traits.filter((x) => x !== t.id);
        else if (a.traits.length < 2) a.traits.push(t.id);
        else toast('You may only choose two traits.');
        a.hp = maxHp(a);
        render();
        setInfo(t.name, t.desc);
      };
      list.appendChild(row);
    }
  } else {
    list.appendChild(el('div', '', '<span style="color:var(--amber)">PERKS</span>'));
    const owned = Object.entries(a.perks ?? {});
    if (!owned.length) list.appendChild(el('div', 'perk', '<i style="color:var(--green-dim)">None yet.</i>'));
    for (const [id, rank] of owned) {
      const d = PERKS.find((p) => p.id === id);
      if (!d) continue;
      const row = el('div', 'perk', esc(d.name) + (d.ranks > 1 ? ` (${rank})` : ''));
      row.onmouseenter = () => setInfo(d.name, d.desc);
      list.appendChild(row);
    }
    list.appendChild(el('div', '', '<br><span style="color:var(--amber)">TRAITS</span>'));
    for (const id of a.traits ?? []) {
      const t = TRAITS.find((x) => x.id === id);
      if (!t) continue;
      const row = el('div', 'trait on', esc(t.name));
      row.onmouseenter = () => setInfo(t.name, t.desc);
      list.appendChild(row);
    }
    list.appendChild(el('div', '', '<br><span style="color:var(--amber)">KILLS</span>'));
    const kills = Object.entries(G.state.kills);
    if (!kills.length) list.appendChild(el('div', 'perk', '<i style="color:var(--green-dim)">None.</i>'));
    for (const [proto, n] of kills) list.appendChild(el('div', 'perk', `${esc(proto)}: ${n}`));
  }
  right.appendChild(list);
  const card = el('div', 'card screen', `<b>${esc(info.title)}</b>${esc(info.text)}`);
  card.style.minHeight = '130px';
  right.appendChild(card);
  body.append(left, mid, right);
  win.appendChild(body);

  // ---------------------------------------------------------- buttons
  const foot = el('div', 'row');
  foot.style.justifyContent = 'flex-end';
  if (mode === 'create') {
    foot.append(
      button('Back', () => {
        closeModal('character');
        onDone?.(false);
      }),
      button('Done', () => finishCreate()),
    );
  } else {
    if ((G.state.flags._perks ?? 0) > 0) foot.appendChild(button('Choose perk', () => openPerkPicker(), 'red'));
    foot.appendChild(button('Done', () => closeModal('character')));
  }
  win.appendChild(foot);
}

function changeStat(k: StatKey, d: number) {
  if (mode === 'view') {
    // Intense Training
    if ((G.state.flags._intense ?? 0) <= 0 || a.stats[k] >= 10) return;
    a.stats[k] += 1;
    G.state.flags._intense -= 1;
    sfx('click');
    render();
    return;
  }
  const v = a.stats[k] + d;
  if (v < 1 || v > 10) return;
  if (d > 0 && statPointsLeft() <= 0) return;
  a.stats[k] = v;
  a.hp = maxHp(a);
  sfx('click');
  render();
  setInfo(STAT_INFO[k].name, STAT_INFO[k].desc);
}

function toggleTag(k: SkillKey) {
  a.tags ??= [];
  if (a.tags.includes(k)) a.tags = a.tags.filter((x) => x !== k);
  else if (a.tags.length < 3) a.tags.push(k);
  else toast('You may only tag three skills.');
  sfx('click');
  render();
  setInfo(SKILL_INFO[k].name, SKILL_INFO[k].desc);
}

function raiseSkill(k: SkillKey) {
  const cur = skill(a, k);
  const cost = skillCost(cur);
  const pts = G.state.flags._skillPts ?? 0;
  if (pts < cost || cur >= 200) return;
  G.state.flags._skillPts = pts - cost;
  const gain = a.tags?.includes(k) && !a.traits?.includes('jack') ? 2 : 1;
  a.skillPts ??= {};
  a.skillPts[k] = (a.skillPts[k] ?? 0) + gain;
  (spent[k] ??= []).push(cost);
  sfx('click');
  render();
}

function lowerSkill(k: SkillKey) {
  const list = spent[k];
  if (!list?.length) return;
  const cost = list.pop()!;
  const gain = a.tags?.includes(k) && !a.traits?.includes('jack') ? 2 : 1;
  a.skillPts![k] = (a.skillPts![k] ?? 0) - gain;
  G.state.flags._skillPts = (G.state.flags._skillPts ?? 0) + cost;
  render();
}

function finishCreate() {
  if (statPointsLeft() > 0) {
    toast('Spend all of your character points first.');
    return;
  }
  if ((a.tags?.length ?? 0) < 3) {
    toast('Tag three skills first.');
    return;
  }
  if (!a.name.trim()) a.name = 'Wanderer';
  a.hp = maxHp(a);
  closeModal('character');
  onDone?.(true);
}

function perkAvailable(id: string): boolean {
  const d = PERKS.find((p) => p.id === id)!;
  if (a.level < d.level) return false;
  if (perkRank(a, id) >= d.ranks) return false;
  for (const [k, v] of Object.entries(d.req ?? {})) if (stat(a, k as StatKey) < (v as number)) return false;
  for (const [k, v] of Object.entries(d.skillReq ?? {})) if (skill(a, k as SkillKey) < (v as number)) return false;
  return true;
}

function openPerkPicker() {
  const w = el('div', 'panel win');
  w.style.width = 'min(560px, 100vw)';
  w.appendChild(el('h2', '', 'Choose a perk'));
  const list = el('div', 'screen scrolly');
  list.style.cssText = 'padding:8px;max-height:60vh';
  const desc = el('div', 'screen', '');
  desc.style.cssText = 'padding:8px;min-height:60px;font-size:13px';
  for (const d of PERKS) {
    if (!perkAvailable(d.id)) continue;
    const row = el('div', 'perk', esc(d.name) + (d.ranks > 1 ? ` (rank ${perkRank(a, d.id) + 1}/${d.ranks})` : ''));
    row.style.cssText = 'padding:4px;cursor:pointer';
    row.onmouseenter = () => (desc.innerHTML = `<b style="color:var(--amber)">${esc(d.name)}</b><br>${esc(d.desc)}`);
    row.onclick = () => {
      a.perks ??= {};
      a.perks[d.id] = (a.perks[d.id] ?? 0) + 1;
      G.state.flags._perks -= 1;
      if (d.id === 'lifeForce') a.hp += 4 * (a.level - 1);
      if (d.id === 'intense') G.state.flags._intense = (G.state.flags._intense ?? 0) + 1;
      msg(`You gain the ${d.name} perk.`);
      sfx('levelup');
      closeModal('perks');
      render();
    };
    list.appendChild(row);
  }
  w.append(list, desc, button('Cancel', () => closeModal('perks')));
  openModal('perks', w);
}
