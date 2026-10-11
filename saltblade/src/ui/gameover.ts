// When the last of your people dies: what they did, and where to go next.
import { h, ui } from './dom';
import { G } from '../state';
import { S } from '../sim/ctx';
import { loadSlot } from '../game/session';
import { listSaves, safeToResume, saveWhen, slotLabel } from '../sim/save';
import { showTitle } from './title';
import { setSpeed } from '../game/control';
import { on } from '../core/events';

let shown = false;
let t = 0;
/** Bumped on every new game and load, so a game over still on its way from the last one never lands. */
let gen = 0;

export function resetGameOver() {
  shown = false;
  t = 0;
  gen++;
  document.getElementById('gameover')?.remove();
}
on('game:start', resetGameOver);

export function tickGameOver(dt: number) {
  if (G.mode !== 'play' || shown) return;
  t -= dt;
  if (t > 0) return;
  t = 1;
  if (!wiped()) return;
  shown = true;
  const g = gen;
  setTimeout(() => { if (g === gen) void show(); }, 2500); // let the last blow land
}

function wiped() {
  const people = S.W.playerChars();
  return people.length > 0 && !people.some((c) => c.alive);
}

async function show() {
  if (G.mode !== 'play' || !wiped()) { shown = false; return; }
  const g = gen;
  setSpeed(0);
  const W = S.W;
  const people = W.playerChars();
  const kills = people.reduce((a, c) => a + c.stats.kills, 0);
  const kos = people.reduce((a, c) => a + c.stats.kos, 0);
  const km = people.reduce((a, c) => a + c.stats.dist, 0) / 1000;
  const towns = S.T.sites.filter((s) => s.kind === 'town' && W.discovered.has(s.id)).length;
  // the newest save from a quiet moment: never one made as the end came
  const saves = await listSaves().catch(() => []);
  if (g !== gen) return;
  const best = saves.find(safeToResume);
  const back = h('div', { id: 'gameover' });
  const load = best ? h('button', { class: 'tbtn primary' }, `Load ${best.name}, ${saveWhen(best)}`, h('small', {}, slotLabel(best.slot))) : null;
  if (load) load.onclick = async () => { const err = await loadSlot(best!.slot); if (err) S.fx.notice(err, 'bad'); };
  const title = h('button', { class: 'tbtn' }, 'Back to the title');
  title.onclick = () => { back.remove(); shown = false; showTitle(); };
  const stay = h('button', { class: 'tbtn' }, 'Look around');
  stay.onclick = () => back.remove();
  back.append(h('div', { class: 'gocard' },
    h('div', { class: 'gotitle' }, 'The waste keeps what it takes'),
    h('p', {}, `${W.factionName} is no more. ${people.length === 1 ? people[0].name + ' lasted' : 'They lasted'} ${S.clock.day} ${S.clock.day === 1 ? 'day' : 'days'}.`),
    h('div', { class: 'gostats' },
      h('div', {}, h('b', {}, String(kills)), ' killed'),
      h('div', {}, h('b', {}, String(kos)), ' knocked out'),
      h('div', {}, h('b', {}, km.toFixed(1)), ' km walked'),
      h('div', {}, h('b', {}, String(towns)), towns === 1 ? ' town found' : ' towns found'),
    ),
    h('div', { class: 'gonames dim' }, people.map((c) => c.name).join(' · ')),
    h('div', { class: 'gobtns' }, stay, title, load),
  ));
  for (const ev of ['mousedown', 'click', 'wheel', 'contextmenu']) back.addEventListener(ev, (e) => e.stopPropagation());
  ui().appendChild(back);
}
