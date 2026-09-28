// When the last of your people dies: what they did, and where to go next.
import { h, ui } from './dom';
import { G } from '../state';
import { S } from '../sim/ctx';
import { loadSlot } from '../game/session';
import { listSaves } from '../sim/save';
import { showTitle } from './title';
import { setSpeed } from '../game/control';

let shown = false;
let t = 0;

export function resetGameOver() { shown = false; }

export function tickGameOver(dt: number) {
  if (G.mode !== 'play' || shown) return;
  t -= dt;
  if (t > 0) return;
  t = 1;
  const people = S.W.playerChars();
  if (!people.length || people.some((c) => c.alive)) return;
  shown = true;
  setTimeout(show, 2500); // let the last blow land
}

async function show() {
  if (G.mode !== 'play') return;
  setSpeed(0);
  const W = S.W;
  const people = W.playerChars();
  const kills = people.reduce((a, c) => a + c.stats.kills, 0);
  const kos = people.reduce((a, c) => a + c.stats.kos, 0);
  const km = people.reduce((a, c) => a + c.stats.dist, 0) / 1000;
  const towns = S.T.sites.filter((s) => s.kind === 'town' && W.discovered.has(s.id)).length;
  const saves = await listSaves().catch(() => []);
  const back = h('div', { id: 'gameover' });
  const load = saves[0] ? h('button', { class: 'tbtn primary' }, `Load ${saves[0].name}, day ${saves[0].day}`) : null;
  if (load) load.onclick = async () => { const err = await loadSlot(saves[0].slot); if (!err) { back.remove(); shown = false; } };
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
