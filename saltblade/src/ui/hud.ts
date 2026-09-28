// The heads-up display: purse and clock, time controls, the squad bar with
// portraits, the selected character's stance toggles, and notices.
import { h, ui, shield, esc, askText } from './dom';
import { G } from '../state';
import { S } from '../sim/ctx';
import { on, emit } from '../core/events';
import { sel, selected, setSpeed } from '../game/control';
import { portrait } from '../render/portrait';
import { Char } from '../sim/char';
import { Squad } from '../sim/squad';
import { fmt } from '../core/math';
import { totalBounty } from '../sim/crime';
import { FACTION } from '../content/factions';

let root: HTMLDivElement;
let topL: HTMLDivElement, speedBox: HTMLDivElement, squadBar: HTMLDivElement, selBox: HTMLDivElement, notices: HTMLDivElement;
let squadKey = '';
let squadTabs: HTMLDivElement;
let tabsKey = '';
const cards = new Map<number, { el: HTMLDivElement; hp: HTMLElement; bl: HTMLElement; st: HTMLElement; img: HTMLImageElement; key: string }>();

export function buildHUD() {
  on('world:reset', () => { squadKey = ''; tabsKey = ''; G.activeSquad = 0; });
  root = h('div', { id: 'hud' });
  topL = h('div', { class: 'hud-topl' });
  speedBox = h('div', { class: 'hud-speed' });
  const speeds: [number, string, string][] = [[0, '❚❚', 'Pause (Space)'], [1, '▶', 'Normal speed (1)'], [2, '▶▶', 'Fast (2)'], [3, '▶▶▶', 'Faster (3)'], [5, '⏩', 'Fastest (4)']];
  for (const [s, label, title] of speeds) {
    const b = h('button', { class: 'spd', title, 'data-s': String(s) }, label);
    b.onclick = () => setSpeed(s);
    speedBox.appendChild(b);
  }
  const menuBar = h('div', { class: 'hud-menu' });
  const btn = (label: string, key: string, ev: string) => {
    const b = h('button', { class: 'mbtn', title: `${label} (${key})` }, h('span', {}, label), h('kbd', {}, key));
    b.onclick = () => emit(ev);
    menuBar.appendChild(b);
  };
  btn('Squad', 'I', 'ui:char');
  btn('Build', 'B', 'ui:build');
  btn('Research', 'U', 'ui:research');
  btn('Map', 'M', 'ui:map');
  btn('Factions', 'O', 'ui:factions');
  btn('Log', 'L', 'ui:log');
  btn('Codex', 'K', 'ui:codex');
  btn('Menu', 'Esc', 'ui:menu');
  const topR = h('div', { class: 'hud-topr' }, speedBox, menuBar);
  squadBar = h('div', { class: 'hud-squad' });
  squadTabs = h('div', { class: 'hud-sqtabs' });
  selBox = h('div', { class: 'hud-sel' });
  notices = h('div', { class: 'hud-notices' });
  root.append(topL, topR, squadTabs, squadBar, selBox, notices);
  ui().appendChild(root);
  for (const el of [topL, topR, squadBar, selBox, squadTabs]) shield(el);
  on('squad', () => { tabsKey = ''; squadKey = ''; });
  on('notice', (text: string, kind: string) => notify(text, kind));
  on('sel', () => { refreshSelBox(); refreshCards(true); });
  on('speed', refreshSpeed);
  refreshSpeed();
  setInterval(tickHUD, 250);
  tickHUD();
}

function refreshSpeed() {
  for (const b of speedBox.querySelectorAll('button')) b.classList.toggle('on', +(b as HTMLElement).dataset.s! === G.speed);
  document.body.classList.toggle('paused', G.speed === 0);
}

export function notify(text: string, kind = 'info') {
  const n = h('div', { class: 'notice ' + kind }, text);
  notices.appendChild(n);
  while (notices.children.length > 6) notices.firstChild!.remove();
  setTimeout(() => n.classList.add('fade'), 5200);
  setTimeout(() => n.remove(), 6200);
}

let perfEl: HTMLDivElement | null = null;
/** F3: frame timings. */
export function togglePerf() {
  if (perfEl) { perfEl.remove(); perfEl = null; return; }
  perfEl = h('div', { class: 'perf' });
  root.appendChild(perfEl);
}

function tickHUD() {
  if (!G.W) return;
  if (perfEl && G.perf) {
    const p = G.perf, r = G.R.gl.info.render;
    perfEl.textContent = `${Math.round(p.fps)} fps · frame ${p.frame.toFixed(1)} ms (sim ${p.sim.toFixed(1)} · world ${p.views.toFixed(1)} · draw ${p.render.toFixed(1)}) · ${r.calls} calls · ${Math.round(r.triangles / 1000)}k tris · ${S.W.active.length}/${S.W.chars.size} people`;
  }
  const reg = G.T.regionAt(G.cam.target.x, G.cam.target.z);
  const site = G.T.siteAt(G.cam.target.x, G.cam.target.z, 30);
  const place = site && (site.kind === 'town' || site.landmark || S.W.discovered.has(site.id)) ? site.name : reg.name;
  const weather = G.weatherName ?? '';
  topL.innerHTML = `<div class="fac">${esc(S.W.factionName)}</div><div class="money" title="Chits">${fmt(S.W.money)}<span>c</span></div>
    <div class="clock">${S.clock.str()}${S.clock.isNight ? ' · night' : ''}</div><div class="place">${esc(place)}${weather ? ' · ' + esc(weather) : ''}</div>`;
  refreshCards(false);
  refreshSelBox();
}

function statusOf(c: Char): string {
  const icons: string[] = [];
  if (c.status === 'dead') return '<b class="bad">DEAD</b>';
  if (c.status === 'ko') icons.push('<b class="bad">KO</b>');
  if (c.body.bleeding() > 0.03 && !c.robot) icons.push('<i class="ic bleed" title="Bleeding"></i>');
  if (c.hunger < 100 && !c.robot) icons.push(`<i class="ic hungry ${c.hunger < 40 ? 'bad' : ''}" title="${c.hunger < 40 ? 'Starving' : 'Hungry'}"></i>`);
  if (c.sleeping) icons.push('<i class="ic sleep" title="Sleeping"></i>');
  if (c.carrying) icons.push('<i class="ic carry" title="Carrying someone"></i>');
  if (c.carriedBy) icons.push('<i class="ic carried" title="Being carried"></i>');
  if (c.cage) icons.push('<b class="bad">CAGED</b>');
  if (c.shackled) icons.push('<i class="ic chain" title="Shackled"></i>');
  if (totalBounty(c) > 0) icons.push(`<i class="ic wanted" title="Wanted: ${totalBounty(c)}c"></i>`);
  if (c.move === 'sneak') icons.push(c.mem.seenBy ? '<b class="warn" title="Someone can see them">SEEN</b>' : '<i class="ic sneak" title="Sneaking, unseen"></i>');
  if (c.load() > 1) icons.push('<i class="ic heavy" title="Overloaded"></i>');
  return icons.join('');
}

/** The squad whose people fill the bar (when there is more than one). */
export function activeSquad(): Squad | null {
  const W = S.W;
  const ids = W.playerSquads.filter((id) => (W.squads.get(id)?.members.length ?? 0) > 0);
  if (ids.length < 2) return null;
  if (!ids.includes(G.activeSquad)) G.activeSquad = ids[0];
  return W.squads.get(G.activeSquad) ?? null;
}

export function switchSquad(id: number, select = true) {
  G.activeSquad = id;
  const sq = S.W.squads.get(id);
  if (select && sq) {
    sel.clear();
    for (const m of sq.members) { const c = S.W.char(m); if (c?.alive) sel.add(m); }
    emit('sel');
  }
  tabsKey = ''; squadKey = '';
}

/** Moves the selected people into a squad of their own. */
function splitSquad() {
  const who = selected().filter((c) => c.faction === 'player');
  if (!who.length) { notify('Select the people for the new squad first.'); return; }
  const W = S.W;
  const n = W.playerSquads.length + 1;
  const sq = new Squad();
  sq.faction = 'player'; sq.kind = 'player'; sq.name = `Squad ${n}`;
  W.addSquad(sq);
  W.playerSquads.push(sq.id);
  for (const c of who) W.moveToSquad(c, sq);
  // squads left empty are folded away
  W.playerSquads = W.playerSquads.filter((id) => { const q = W.squads.get(id); if (q && !q.members.length) { W.squads.delete(id); return false; } return !!q; });
  switchSquad(sq.id);
  emit('squad');
}

function refreshTabs() {
  const W = S.W;
  const list = W.playerSquads.map((id) => W.squads.get(id)).filter((q): q is Squad => !!q && q.members.length > 0);
  const act = activeSquad();
  const key = list.map((q) => `${q.id}:${q.name}:${q.members.length}`).join('|') + '/' + (act?.id ?? 0) + '/' + sel.size;
  if (key === tabsKey) return;
  tabsKey = key;
  squadTabs.innerHTML = '';
  if (list.length > 1) for (const q of list) {
    const alive = q.members.filter((m) => W.char(m)?.alive).length;
    const t = h('button', { class: 'sqtab' + (act?.id === q.id ? ' on' : ''), title: 'Click to switch · double-click to rename' }, q.name, h('small', {}, ` ${alive}`));
    t.onclick = () => switchSquad(q.id);
    t.ondblclick = () => askText('Name this squad', q.name, (nm) => { q.name = nm.slice(0, 24); tabsKey = ''; }, 24);
    squadTabs.appendChild(t);
  }
  const mine = selected().filter((c) => c.faction === 'player');
  const whole = act ? mine.length === act.members.length : mine.length === W.playerChars().length;
  if (mine.length && !whole) {
    const b = h('button', { class: 'sqtab add', title: 'Make a new squad of the selected people' }, '+ New squad');
    b.onclick = () => splitSquad();
    squadTabs.appendChild(b);
  }
}

function refreshCards(force: boolean) {
  refreshTabs();
  const act = activeSquad();
  const chars = act ? act.members.map((id) => S.W.char(id)).filter((c): c is Char => !!c) : S.W.playerChars();
  const key = (act?.id ?? 0) + ':' + chars.map((c) => c.id).join(',');
  if (key !== squadKey || force) {
    if (key !== squadKey) {
      squadKey = key;
      squadBar.innerHTML = '';
      cards.clear();
      for (const c of chars) {
        const img = h('img', { class: 'pimg', alt: '' }) as HTMLImageElement;
        const hp = h('i'), bl = h('i');
        const st = h('div', { class: 'pst' });
        const el = h('div', { class: 'pcard' }, img, h('div', { class: 'pname' }, c.name), h('div', { class: 'bar hp' }, hp), h('div', { class: 'bar bl' }, bl), st);
        el.onclick = (e) => {
          if (e.shiftKey || e.ctrlKey) { if (sel.has(c.id)) sel.delete(c.id); else sel.add(c.id); }
          else { sel.clear(); sel.add(c.id); }
          emit('sel');
        };
        el.ondblclick = () => { G.cam.follow = () => (c.alive ? c : null); G.cam.lookAt(c.x, c.z); };
        el.oncontextmenu = (e) => { e.preventDefault(); sel.clear(); sel.add(c.id); emit('sel'); emit('ui:char'); };
        squadBar.appendChild(el);
        cards.set(c.id, { el, hp, bl, st, img, key: '' });
      }
    }
  }
  for (const c of chars) {
    const k = cards.get(c.id);
    if (!k) continue;
    k.el.classList.toggle('on', sel.has(c.id));
    k.el.classList.toggle('down', c.status !== 'up');
    k.hp.style.width = Math.max(0, c.body.total() * 100) + '%';
    k.hp.parentElement!.classList.toggle('low', c.body.vital() < 0.2);
    k.bl.style.width = Math.max(0, (c.body.blood / c.body.bloodMax) * 100) + '%';
    const s = statusOf(c);
    if (k.st.innerHTML !== s) k.st.innerHTML = s;
    const pk = JSON.stringify([c.look, c.vis(), c.body.lost, c.body.prost]);
    if (pk !== k.key) { k.key = pk; k.img.src = portrait(c); }
  }
}

function activity(c: Char): string {
  if (c.status === 'dead') return 'Dead';
  if (c.status === 'ko') return c.playDead ? 'Playing dead' : 'Unconscious';
  if (c.carriedBy) return 'Being carried';
  if (c.cage) return 'Locked in a cage';
  if (c.sleeping) return 'Sleeping';
  if (c.bed) return 'Resting in bed';
  if (c.atk || (c.target && c.drawn)) { const t = S.W.char(c.target); return t ? `Fighting ${t.name}` : 'Fighting'; }
  const o = c.order;
  if (o) {
    switch (o.k) {
      case 'move': return 'Moving';
      case 'follow': return `Following ${S.W.char(o.id)?.name ?? ''}`;
      case 'attack': return `Attacking ${S.W.char(o.id)?.name ?? ''}`;
      case 'talk': return 'Going to talk';
      case 'aid': return `Treating ${S.W.char(o.id)?.name ?? ''}`;
      case 'hold': return 'Holding position';
      case 'pickup': return 'Picking someone up';
      case 'lockpick': return 'Picking a lock';
      case 'assassinate': return 'Sneaking up on someone';
      default: return 'Busy';
    }
  }
  if (c.jobs.length) return c.jobs[0].label || 'Working';
  if (c.carrying) return `Carrying ${S.W.char(c.carrying)?.name ?? 'someone'}`;
  return c.hasGoal ? 'Walking' : 'Idle';
}

function refreshSelBox() {
  const who = selected();
  if (!who.length) { selBox.style.display = 'none'; return; }
  selBox.style.display = '';
  const c = who[0];
  const multi = who.length > 1 ? ` <span class="dim">+${who.length - 1}</span>` : '';
  const key = JSON.stringify([who.map((w) => w.id), c.move, c.mem.walk, c.order?.k, c.combatMode, activity(c)]);
  if (selBox.dataset.k === key) return;
  selBox.dataset.k = key;
  selBox.innerHTML = '';
  selBox.appendChild(h('div', { class: 'selname', html: `${esc(c.name)}${multi}` }));
  selBox.appendChild(h('div', { class: 'selact' }, activity(c)));
  const row = h('div', { class: 'selrow' });
  const tog = (label: string, on: boolean, title: string, fn: () => void) => {
    const b = h('button', { class: 'tog' + (on ? ' on' : ''), title }, label);
    b.onclick = () => { fn(); selBox.dataset.k = ''; refreshSelBox(); };
    row.appendChild(b);
  };
  tog(c.mem.walk ? 'Walk' : 'Run', !c.mem.walk, 'Run or walk (R)', () => { const w = !c.mem.walk; who.forEach((x) => { x.mem.walk = w; if (x.move !== 'sneak') x.move = w ? 'walk' : 'run'; }); });
  tog('Sneak', c.move === 'sneak', 'Sneak (T)', () => { const s = c.move !== 'sneak'; who.forEach((x) => (x.move = s ? 'sneak' : x.mem.walk ? 'walk' : 'run')); });
  tog('Hold', c.order?.k === 'hold', 'Hold position (H)', () => { const hold = c.order?.k !== 'hold'; who.forEach((x) => { x.order = hold ? { k: 'hold' } : null; }); });
  const modes: [string, 'aggressive' | 'defensive' | 'passive', string][] = [['Aggressive', 'aggressive', 'Attack enemies in sight'], ['Defensive', 'defensive', 'Fight back when attacked, block more'], ['Passive', 'passive', 'Never fight back']];
  const row2 = h('div', { class: 'selrow' });
  for (const [label, m, title] of modes) {
    const b = h('button', { class: 'tog small' + (c.combatMode === m ? ' on' : ''), title }, label);
    b.onclick = () => { who.forEach((x) => (x.combatMode = m)); selBox.dataset.k = ''; refreshSelBox(); };
    row2.appendChild(b);
  }
  selBox.append(row, row2);
  if (c.jobs.length) {
    const jl = h('div', { class: 'jobs' }, h('span', { class: 'dim' }, 'Jobs: '));
    c.jobs.forEach((j, i) => {
      const b = h('button', { class: 'job', title: 'Click to remove' }, `${i + 1}. ${j.label || j.k}`);
      b.onclick = () => { c.jobs.splice(i, 1); selBox.dataset.k = ''; refreshSelBox(); };
      jl.appendChild(b);
    });
    selBox.appendChild(jl);
  }
  if (c.carrying) {
    const b = h('button', { class: 'tog small' }, 'Put down (X)');
    b.onclick = () => emit('order', c, { k: 'drop' });
    selBox.appendChild(b);
  }
  void FACTION;
}
