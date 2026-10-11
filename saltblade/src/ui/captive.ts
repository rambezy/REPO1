// When every one of yours is held (caged, carried off, or out cold), a card
// says what holds each of them and what can be done about it, and lets time
// pass quickly until something changes. Nobody is ever left staring at a
// cage with nothing to click.
import './captive.css';
import { h, ui } from './dom';
import { G } from '../state';
import { S } from '../sim/ctx';
import { on, emit } from '../core/events';
import { captivity, Captivity } from '../sim/crime';
import { Char } from '../sim/char';

let card: HTMLDivElement | null = null;
let lines: HTMLElement[] = [];
let key = ''; // what holds whom; the card is rebuilt, and a wait ends, when this changes
let hidden = false; // folded to one line until asked for, or until the situation changes
let waiting = false; // skipping time until it does
let resume = 1; // the speed to go back to
let resumeLast = 1; // and what Space resumes at, which the wait must not change

const HELD = new Set(['down', 'carried', 'caged']);
/** Game speed while waiting: a two-day sentence passes in a few minutes. */
const WAIT_SPEED = 10;

export function setupCaptive() {
  on('world:reset', () => { remove(); hidden = false; key = ''; waiting = false; });
  setInterval(tick, 1000);
}

function held(): [Char, Captivity][] | null {
  const people = S.W.playerChars().filter((c) => c.alive && !c.animal);
  if (!people.length) return null;
  const states = people.map((c) => [c, captivity(c)] as [Char, Captivity]);
  return states.every(([, s]) => HELD.has(s.kind)) ? states : null;
}

function tick() {
  if (G.mode !== 'play' || !G.W) { remove(); return; }
  const states = held();
  if (!states) {
    if (waiting) stopWait();
    if (key) { key = ''; hidden = false; remove(); }
    return;
  }
  const k = states.map(([c, s]) => `${c.id}:${s.kind}:${c.cage}:${c.carriedBy}`).join('|');
  if (k !== key) {
    key = k;
    hidden = false;
    if (waiting) { stopWait(); S.fx.notice('Something has changed.', 'info'); }
    render(states);
  } else if (card) {
    // only the sentence countdowns move
    states.forEach(([c, s], i) => { const el = lines[i]; if (el) el.textContent = `${c.name}: ${s.text}.`; });
  }
}

function remove() { card?.remove(); card = null; lines = []; }

// the wait sets the speed directly, past setSpeed's bookkeeping: the waiting speed is nothing Space should ever resume at
function stopWait() {
  waiting = false;
  G.speed = resume;
  G.lastSpeed = resumeLast;
  emit('speed');
  const b = card?.querySelector('.capwait');
  if (b) { b.textContent = 'Wait (skip time)'; b.classList.remove('on'); }
}

function startWait() {
  resume = G.speed || G.lastSpeed || 1;
  resumeLast = G.lastSpeed || 1;
  waiting = true;
  G.speed = WAIT_SPEED;
  emit('speed');
  const b = card?.querySelector('.capwait');
  if (b) { b.textContent = 'Waiting… (stop)'; b.classList.add('on'); }
}

function titleOf(states: [Char, Captivity][]) {
  const kinds = new Set(states.map(([, s]) => s.kind));
  const allDown = kinds.size === 1 && kinds.has('down');
  return allDown ? (states.length === 1 ? `${states[0][0].name} is down` : 'Everyone is down') : states.length === 1 ? `${states[0][0].name} is held` : 'All your people are held';
}

function render(states: [Char, Captivity][]) {
  remove();
  const title = titleOf(states);
  if (hidden) {
    // folded away: one line, and a way back
    const show = h('button', { class: 'tbtn small' }, 'Show');
    show.onclick = () => { hidden = false; render(states); };
    card = h('div', { id: 'captive', class: 'capcard capmini' }, h('div', { class: 'captitle' }, title), show);
    for (const ev of ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu']) card.addEventListener(ev, (e) => e.stopPropagation());
    ui().appendChild(card);
    return;
  }
  const kinds = new Set(states.map(([, s]) => s.kind));
  const allDown = kinds.size === 1 && kinds.has('down');
  const list = h('ul', { class: 'caplist' });
  lines = states.map(([c, s]) => { const li = h('li', {}, `${c.name}: ${s.text}.`); list.appendChild(li); return li; });
  const why = allDown
    ? 'Nobody can act while they are out cold. Wounds that are not bleeding heal on their own; bleeding slows while unconscious, and most people wake within the hour.'
    : kinds.has('caged')
      ? 'A caged prisoner can work the lock from inside: slow, better unwatched, and a crime if a guard sees it. A sentence ends on its own; a cage with no sentence does not.'
      : 'A captive being carried is set down where their captors are going: a cage with a sentence, or the fields in shackles. Once there, they can act again.';
  const btns = h('div', { class: 'capbtns' });
  const caged = states.filter(([c, s]) => s.kind === 'caged' && s.order && c.up);
  if (caged.length) {
    const pick = h('button', { class: 'tbtn small primary' }, caged.length === 1 ? 'Pick the lock from inside' : 'Everyone, pick the locks');
    pick.onclick = () => { for (const [c, s] of caged) emit('order', c, s.order); if (waiting) stopWait(); pick.textContent = 'Working at the lock…'; pick.disabled = true; };
    btns.appendChild(pick);
  }
  const wait = h('button', { class: 'tbtn small capwait' + (waiting ? ' on' : '') }, waiting ? 'Waiting… (stop)' : 'Wait (skip time)');
  wait.onclick = () => { if (waiting) stopWait(); else startWait(); };
  const hide = h('button', { class: 'tbtn small' }, 'Hide');
  hide.onclick = () => { hidden = true; render(states); };
  btns.append(wait, hide);
  card = h('div', { id: 'captive', class: 'capcard' },
    h('div', { class: 'captitle' }, title),
    list,
    h('p', { class: 'caphelp' }, why),
    h('p', { class: 'caphelp dim' }, `Waiting runs the game at ${WAIT_SPEED}× until something changes: someone wakes, a captive is set down, a sentence ends.`),
    btns,
  );
  for (const ev of ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu']) card.addEventListener(ev, (e) => e.stopPropagation());
  ui().appendChild(card);
}
