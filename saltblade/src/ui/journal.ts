// The journal (J): the jobs your people have taken, the stories they are
// part of, the Foundry when it wakes, and what has been done and failed.
// Every place it sends you is marked on the map (see goalmarks.ts).
import './journal.css';
import { h, openWindow, isOpen, closeWindow, getWindow, ask } from './dom';
import { S } from '../sim/ctx';
import { on, emit } from '../core/events';
import {
  activeContracts, contractsState, dangerOf, rewardText, costText, dueText, contractStep, contractWhere, abandonContract, keeperWord,
  currentGoal, type Contract,
} from '../sim/contracts';
import { storyViews, type StoryView } from '../sim/stories';
import { crisisView } from '../sim/crisis';
import { bearing, siteById, errandProgress } from '../sim/errands';
import { KIND_NAME, TIERS, MAX_ACTIVE, CRISIS } from '../content/contracts';
import { FACTION } from '../content/factions';
import { DAY, HOUR } from '../sim/clock';

let tab: 'work' | 'stories' | 'crisis' | 'done' = 'work';
let shownKey = '';

export function setupJournal() {
  // (with an entry, from the objective tracker's Next line: open there; else J, opening and closing)
  on('ui:journal', (entry?: unknown) => (typeof entry === 'string' ? openJournalAt(entry) : toggleJournal()));
  on('world:reset', () => { shownKey = ''; });
  // what it says moves with the clock and the world: redrawn when it would read differently,
  // but never under the pointer, where a redraw could swallow a click
  setInterval(() => { const w = getWindow('journal'); if (w && !w.el.matches(':hover')) render(); }, 1000);
}

const openIt = () => openWindow('journal', 'Journal', { w: 580, x: Math.max(10, window.innerWidth - 620), y: 100, cls: 'journalwin' });

export function toggleJournal() {
  if (isOpen('journal')) { closeWindow('journal'); return; }
  shownKey = '';
  openIt();
  render();
}

/** Opens the journal at an entry ('job:<id>', 'story:<key>', 'crisis', 'work'): its tab, the entry scrolled to and lit a moment. */
export function openJournalAt(entry: string) {
  tab = entry === 'crisis' ? 'crisis' : entry.startsWith('story:') ? 'stories' : 'work';
  if (!isOpen('journal')) openIt();
  shownKey = '';
  render();
  const el = [...(getWindow('journal')?.body.querySelectorAll<HTMLElement>('[data-entry]') ?? [])].find((e) => e.dataset.entry === entry);
  if (!el) return;
  el.scrollIntoView({ block: 'nearest' });
  el.classList.add('jflash');
  setTimeout(() => el.classList.remove('jflash'), 1600);
}

/** "1 day 4 hours", "3 hours", "40 minutes". */
function span(secs: number): string {
  if (secs <= 0) return 'now';
  const d = Math.floor(secs / DAY), hr = Math.floor((secs % DAY) / HOUR), mn = Math.floor((secs % HOUR) / 60);
  if (d) return `${d} day${d > 1 ? 's' : ''}${hr ? ` ${hr} hour${hr > 1 ? 's' : ''}` : ''}`;
  if (hr) return `${hr} hour${hr > 1 ? 's' : ''}`;
  return `${mn} minute${mn === 1 ? '' : 's'}`;
}
const mapButton = (w: { x: number; z: number } | null | undefined, label = 'Show on map') => {
  if (!w) return null;
  const b = h('button', { class: 'tbtn small' }, label);
  b.onclick = () => emit('ui:map-at', w.x, w.z);
  return b;
};
const row = (head: string, ...body: (Node | string | null)[]) => h('div', { class: 'jrow' }, h('b', {}, head), ' ', ...body);
const dangerSpan = (r: { level: number; word: string }) => h('span', { class: `jdanger d${r.level}` }, r.word);

function render() {
  const w = getWindow('journal');
  if (!w || !S.W) return;
  const st = contractsState();
  const views = storyViews();
  const cv = crisisView();
  const crisis = cv.state !== 'none';
  if (tab === 'crisis' && !crisis) tab = 'work';
  // redraw only when something on the page would read differently
  const key = JSON.stringify([tab, Math.floor(S.clock.t / 600), st.active.map((c) => [c.id, c.state, c.e.state, c.e.paused, c.e.lostT]), views.map((v) => [v.s.state, v.s.step, v.s.retry, v.progress]), cv.state, cv.wave, st.past.length, S.W.money]);
  if (key === shownKey) return;
  shownKey = key;
  const scroll = w.body.querySelector('.jlist')?.scrollTop ?? 0;
  w.body.innerHTML = '';
  const tabs = h('div', { class: 'ftabs' });
  const active = activeContracts().filter((c) => c.state === 'active' || c.state === 'ready');
  const storyN = views.filter((v) => v.s.state === 'active' || v.s.state === 'open').length;
  const labels: [typeof tab, string][] = [['work', `Work${active.length ? ` (${active.length})` : ''}`], ['stories', `Stories${storyN ? ` (${storyN})` : ''}`]];
  if (crisis) labels.push(['crisis', CRISIS.name]);
  labels.push(['done', 'Done']);
  for (const [k, label] of labels) {
    const b = h('button', { class: 'ftab' + (tab === k ? ' on' : '') + (k === 'crisis' && cv.state !== 'resolved' ? ' alarm' : '') }, label);
    b.onclick = () => { tab = k; shownKey = ''; render(); };
    tabs.appendChild(b);
  }
  // what to do next, the same line the objective tracker shows
  const goal = currentGoal();
  const next = goal ? h('div', { class: 'jnext' }, h('span', { class: 'jnexthead' }, 'Next'), h('span', {}, goal.text), mapButton(goal.where, 'Map')) : null;
  const list = h('div', { class: 'jlist' });
  if (tab === 'work') renderWork(list, active);
  else if (tab === 'stories') renderStories(list, views);
  else if (tab === 'crisis') renderCrisis(list, cv);
  else renderDone(list);
  w.body.append(tabs, next ?? '', list);
  list.scrollTop = scroll;
}

// ---------------------------------------------------------------- work
function renderWork(list: HTMLElement, active: Contract[]) {
  const st = contractsState();
  list.appendChild(h('div', { class: 'jsum dim' }, `${active.length} of ${MAX_ACTIVE} jobs taken · ${st.done} done · ${st.failed} failed · ${st.abandoned} walked away from`));
  if (!active.length) {
    list.appendChild(h('p', { class: 'jempty' }, 'No work taken. Every lawful town keeps a board: ask its barkeep (or its trader, where there is no bar) "Any work going?" Each job says what it pays, how dangerous it is for a band like yours, and what failing costs. Better work goes to those a town\'s people know.'));
    return;
  }
  for (const c of active.sort((a, b) => Number(b.state === 'ready') - Number(a.state === 'ready') || (a.due ?? 0) - (b.due ?? 0))) list.appendChild(card(c));
}

function card(c: Contract): HTMLElement {
  const from = siteById(c.from);
  const ready = c.state === 'ready';
  const left = (c.due ?? 0) - S.clock.t;
  const urgent = !ready && left < DAY / 2;
  const where = contractWhere(c);
  const d = dangerOf(c);
  const road = c.kind === 'haul' || c.kind === 'deliver' || c.kind === 'escort';
  const prog = ready ? '' : errandProgress(c.e);
  const quit = h('button', { class: 'tbtn small danger' }, 'Walk away');
  quit.onclick = () => ask(`Walk away from "${c.title}"? It costs ${costText(c)}.`, 'Walk away', () => { abandonContract(c.id); shownKey = ''; render(); }, 'Keep it', true);
  return h('div', { class: 'jcard' + (ready ? ' ready' : '') + (urgent ? ' urgent' : ''), 'data-entry': 'job:' + c.id },
    h('div', { class: 'jhead' },
      h('span', { class: 'jkind' }, KIND_NAME[c.kind]),
      h('span', { class: 'jtitle' }, c.title),
      h('span', { class: 'jdue' + (urgent ? ' bad' : '') }, ready ? 'Done' : `${span(left)} left`),
    ),
    h('div', { class: 'jfrom dim' }, `Posted by ${from ? keeperWord(from) : 'a board'} · ${TIERS[c.tier].name} for the ${FACTION[c.issuer]?.name ?? c.issuer} · due ${dueText(c).replace(/ \(.*\)$/, '')}`),
    h('div', { class: 'jstep' }, contractStep(c), where && !ready && (c.kind === 'deliver' || c.kind === 'escort') ? h('span', { class: 'dim' }, ` (${bearing(where.x, where.z)})`) : null),
    prog ? h('div', { class: 'jprog' + (c.e.lostT !== undefined ? ' bad' : '') }, prog) : null,
    h('div', { class: 'jbrief' }, `"${c.brief.replace(/ +$/, '')}"`),
    row('Pay', rewardText(c) + (c.bond ? `, and the ${c.bond}-chit bond back` : '') + '.'),
    ready ? null : row('Danger', dangerSpan(d), road ? ' on the road' : '', d.what ? ` (${d.what})` : '', `. ${d.line}`),
    ready ? null : row('Fail or walk away', `${costText(c)}.`),
    h('div', { class: 'jbtns' }, mapButton(where), ready ? null : quit),
  );
}

// ---------------------------------------------------------------- stories
function renderStories(list: HTMLElement, views: StoryView[]) {
  for (const v of views) {
    const { def, s } = v;
    const state = s.state === 'done' ? 'Done' : s.state === 'active' ? `Step ${s.step + 1} of ${def.steps.length}` : s.state === 'open' ? 'Waiting for you' : 'Not yet';
    const el = h('div', { class: `jstory ${s.state}`, 'data-entry': 'story:' + def.key },
      h('div', { class: 'jhead' }, h('span', { class: 'jtitle' }, def.name), h('span', { class: 'jdue' }, state)),
      h('div', { class: 'jfrom dim' }, `${FACTION[def.faction]?.name ?? def.faction} · ${def.giver.known}, ${siteById(S.T.sites.find((x) => x.key === def.town || x.settlement === def.town)?.id)?.name ?? ''}`),
      h('div', { class: 'jbrief' }, def.blurb),
    );
    if (s.state === 'locked') el.appendChild(row('Not yet', def.needs));
    if (s.state === 'open') el.append(h('div', { class: 'jstep' }, `${def.giver.known} wants a word.`), h('div', { class: 'jbtns' }, mapButton(v.where)));
    // the steps so far, and the one you are on
    if (s.state === 'active' || s.state === 'done') {
      const steps = h('ol', { class: 'jsteps' });
      def.steps.forEach((step, i) => {
        if (i > s.step) return;
        const done = s.state === 'done' || i < s.step;
        steps.appendChild(h('li', { class: done ? 'done' : 'now' }, h('b', {}, step.title), ' ', h('span', { class: done ? 'dim' : '' }, done ? step.done : s.retry ? `That went wrong. Go back to ${def.giver.known}.` : step.text)));
      });
      el.appendChild(steps);
      if (s.state === 'active' && v.progress) el.appendChild(h('div', { class: 'jprog' }, v.progress));
      if (s.state === 'active') el.appendChild(h('div', { class: 'jbtns' }, mapButton(v.where)));
      if (s.state === 'done') el.appendChild(h('div', { class: 'jcap' }, def.capstone));
    }
    list.appendChild(el);
  }
}

// ---------------------------------------------------------------- the crisis
function renderCrisis(list: HTMLElement, cv: ReturnType<typeof crisisView>) {
  const site = cv.site;
  const when = cv.next !== undefined ? ` in ${span(cv.next - S.clock.t)}` : ' soon';
  const state = cv.state === 'warning' ? `It is counting. The first wave sets out${when}.`
    : cv.state === 'waves' ? `Wave ${cv.wave} of ${cv.waves} has been sent.${cv.wave < cv.waves ? ` The next sets out${when}, once the last is beaten or gone.` : ''}`
      : cv.state === 'quiet' ? `It has spent itself, for now. It wakes again${when}.`
        : 'The Foundry Mind is broken. The machines it made have stopped.';
  list.appendChild(h('div', { class: 'jcard crisis' + (cv.state === 'resolved' ? ' ready' : ' urgent'), 'data-entry': 'crisis' },
    h('div', { class: 'jhead' }, h('span', { class: 'jkind' }, 'Crisis'), h('span', { class: 'jtitle' }, `${CRISIS.name}${site ? `: ${site.name}` : ''}`)),
    h('div', { class: 'jstep' }, state),
    cv.state === 'resolved' ? h('div', { class: 'jcap' }, CRISIS.reward) : h('div', { class: 'jbrief' }, cv.guide),
    cv.state === 'resolved' ? null : row('Breaking the Mind', dangerSpan(cv.danger), `. ${cv.danger.line}`),
    cv.state === 'resolved' ? null : row('If you do', 'the waves stop for good, and the waste pays its thanks.'),
    h('div', { class: 'jbtns' }, site ? mapButton({ x: site.x, z: site.z }, `Show ${site.name}`) : null),
  ));
}

// ---------------------------------------------------------------- done
function renderDone(list: HTMLElement) {
  const past = contractsState().past;
  if (!past.length) { list.appendChild(h('p', { class: 'jempty' }, 'Nothing finished yet, and nothing failed.')); return; }
  for (const p of past) {
    const d = Math.floor(p.t / DAY);
    list.appendChild(h('div', { class: `jpast ${p.state}` },
      h('span', { class: 'jpday dim' }, `Day ${d}`),
      h('span', { class: 'jpstate' }, p.state === 'done' ? 'Done' : p.state === 'failed' ? 'Failed' : 'Walked away'),
      h('span', { class: 'jptitle' }, p.title),
      h('div', { class: 'jpnote dim' }, `${KIND_NAME[p.kind]} for the ${FACTION[p.issuer]?.short ?? p.issuer}: ${p.note}`),
    ));
  }
}
