// The wrist-link: status, tasks, archives, and resting.

import { G, player } from '../game/G';
import { el, esc } from '../core/util';
import { button, closeModal, openModal } from './common';
import { fmtDate, fmtTime, waterDaysLeft, advanceTime, hourOf, dayNumber } from '../game/time';
import { QUESTS, LOCATIONS } from '../content/registry';
import { maxHp } from '../game/character';
import { msg, emit } from '../game/log';
import { enemiesRemain } from '../game/combat';

let win: HTMLElement;
let tab: 'status' | 'tasks' | 'archives' = 'status';
let screen: HTMLElement;

export function openPda() {
  if (G.modal) return;
  win = el('div', 'panel win pda');
  openModal('pda', win, { onClose: () => emit('hud') });
  render();
}

function render() {
  win.innerHTML = '';
  screen = el('div', 'screen');
  const side = el('div', 'side');
  const clock = el('div', 'clock screen', `${fmtDate(G.state.time)}<br>${fmtTime(G.state.time)}`);
  side.append(
    clock,
    button('Status', () => ((tab = 'status'), render()), tab === 'status' ? 'on' : ''),
    button('Tasks', () => ((tab = 'tasks'), render()), tab === 'tasks' ? 'on' : ''),
    button('Archives', () => ((tab = 'archives'), render()), tab === 'archives' ? 'on' : ''),
    el('div', '', '<small style="color:#c8b890">REST</small>'),
    button('1 hour', () => rest(60), 'small'),
    button('Until morning', () => rest(untilHour(7)), 'small'),
    button('Until healed', () => restHeal(), 'small'),
    button('Close', () => closeModal('pda')),
  );
  win.append(screen, side);
  if (tab === 'status') renderStatus();
  else if (tab === 'tasks') renderTasks();
  else renderArchives();
}

function renderStatus() {
  const p = player();
  const s = G.state;
  let h = `<h3>WRIST-LINK MODEL 7 &mdash; SHELTER 29</h3>`;
  h += `Resident: ${esc(p.name)}<br>Day ${dayNumber()} of your journey.<br><br>`;
  if (!s.flags.coreReturned) {
    const d = waterDaysLeft();
    h += `<span style="color:${d <= 10 ? '#ff4a36' : 'var(--amber)'}">WATER RESERVE: ${d} DAYS</span><br>`;
    h += `The shelter's hydro-core has failed. Find a replacement and bring it home.<br><br>`;
  } else if (s.armyDeadline && !s.flags.gameWon) {
    const d = Math.max(0, Math.ceil((s.armyDeadline - s.time) / 1440));
    h += `<span style="color:var(--amber)">ESTIMATED TIME UNTIL THE GRAFTED FIND US: ${d} DAYS</span><br><br>`;
  }
  h += `Hit points: ${p.hp}/${maxHp(p)}<br>`;
  if (p.rads > 0) h += `Radiation: ${Math.round(p.rads)} rads<br>`;
  if (p.poison > 0) h += `Poisoned (${p.poison})<br>`;
  h += `<br><h3>LOCATIONS VISITED</h3>`;
  h += s.visitedLoc.map((id) => esc(LOCATIONS[id]?.name ?? id)).join('<br>') || 'None.';
  screen.innerHTML = h;
}

function renderTasks() {
  const s = G.state;
  const byArea: Record<string, string[]> = {};
  for (const [id, q] of Object.entries(s.quests)) {
    const def = QUESTS[id];
    const area = def?.area ?? 'misc';
    const cls = q.state === 'done' ? 'done' : q.state === 'failed' ? 'failed' : '';
    let line = `<div class="q ${cls}">&bull; ${esc(def?.title ?? id)}</div>`;
    if (q.state === 'active' && q.notes.length) line += `<div style="margin-left:14px;color:var(--green-dim);font-size:12px">${q.notes.map(esc).join('<br>')}</div>`;
    (byArea[area] ??= []).push(line);
  }
  let h = '';
  for (const [area, lines] of Object.entries(byArea)) {
    h += `<h3>${esc(LOCATIONS[area]?.name ?? area.toUpperCase())}</h3>${lines.join('')}<br>`;
  }
  screen.innerHTML = h || 'No tasks recorded.';
}

function renderArchives() {
  const notes = G.state.notes;
  screen.innerHTML = notes.length ? notes.map((n) => `<div style="margin-bottom:10px">${esc(n).replace(/\n/g, '<br>')}</div>`).join('') : 'No archived recordings.';
}

function untilHour(h: number): number {
  const now = G.state.time % 1440;
  let target = h * 60;
  if (target <= now) target += 1440;
  return target - now;
}

function canRest(): boolean {
  if (G.combat) {
    msg('You cannot rest during combat.');
    return false;
  }
  if (G.map && enemiesRemain()) {
    msg('There are enemies nearby.');
    return false;
  }
  if (G.map && G.map.livingActors().some((a) => a.hostile)) {
    msg('You cannot rest with hostiles around.');
    return false;
  }
  return true;
}

function rest(minutes: number) {
  if (!canRest()) return;
  advanceTime(minutes, { resting: true });
  msg(`You rest for ${Math.round(minutes / 60)} hour${minutes >= 120 ? 's' : ''}.`);
  render();
  emit('hud');
}

function restHeal() {
  if (!canRest()) return;
  const p = player();
  let total = 0;
  while (p.hp < maxHp(p) && total < 60 * 24 * 7) {
    advanceTime(60, { resting: true });
    total += 60;
    if (G.state.ended) break;
  }
  msg(`You rest for ${Math.round(total / 60)} hours.`);
  render();
  emit('hud');
}

export function addNote(text: string) {
  if (!G.state.notes.includes(text)) {
    G.state.notes.push(text);
    msg('New recording added to your wrist-link archives.');
  }
}

export { hourOf };
