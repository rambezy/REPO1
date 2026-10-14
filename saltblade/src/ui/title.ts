// The title screen over a slowly drifting view of the world, and the
// screens behind it: new game (start and people), load, options, help and
// about (credits and licences).
import { h, ui, ask, askPaste } from './dom';
import { G } from '../state';
import { S } from '../sim/ctx';
import { SCENARIOS, SCENARIO, Scenario } from '../content/scenarios';
import { RACE, RACES, RaceDef } from '../content/races';
import { randomLook } from '../sim/spawn';
import { personName } from '../content/names';
import { RNG } from '../core/rng';
import { Preview } from '../render/preview';
import { World } from '../sim/world';
import { Char } from '../sim/char';
import { Look } from '../sim/look';
import { makePlayerPerson, NewGameSetup } from '../game/newgame';
import { startNewGame, loadSlot, loadData, backdropWorld } from '../game/session';
import { listSaves, deleteSave, importSaveFile, importText, SaveMeta, fitsWorld, misfit, slotLabel, safeToResume } from '../sim/save';
import { input } from '../core/input';
import { keymap, ACTIONS, ACTION, ActionDef, ActionId, keyLabel, bindingOf, helpRows } from '../core/keys';
import { DAY, HOUR } from '../sim/clock';
import { SK, SKILL_INFO, SKILLS } from '../sim/skills';
import { saveSettings, applySettings, Settings, UI_SCALE, toggleFullscreen, fullscreenOn, reducedMotion } from '../game/settings';
import { zoomSupported } from './dom';
import { VISIONS } from './palette';
import { uiSound } from '../audio';
import threeLicense from '../assets/licenses/three.txt?raw';
import barlowLicense from '../assets/fonts/OFL-Barlow.txt?raw';
import cinzelLicense from '../assets/fonts/OFL-Cinzel.txt?raw';

let root: HTMLDivElement | null = null;
let panel: HTMLDivElement;
let unKey: (() => void) | null = null;
let preview: Preview | null = null;
let screen = 'main';

// ---------------------------------------------------------------- cinematic backdrop
interface Shot { key: string; dist: number; pitch: number; yaw: number; }
const SHOTS: Shot[] = [
  { key: 'crossroad', dist: 150, pitch: 0.36, yaw: 0.6 },
  { key: 'aurum', dist: 260, pitch: 0.42, yaw: 2.2 },
  { key: 'colossus', dist: 170, pitch: 0.3, yaw: 4.0 },
  { key: 'cinderhold', dist: 250, pitch: 0.4, yaw: 1.2 },
  { key: 'humminghollow', dist: 170, pitch: 0.34, yaw: 5.2 },
  { key: 'hornspire', dist: 230, pitch: 0.38, yaw: 3.1 },
  { key: 'glassdome', dist: 170, pitch: 0.3, yaw: 0.2 },
  { key: 'mudwater', dist: 170, pitch: 0.33, yaw: 2.7 },
];
const SHOT_T = 22;
let shotI = 0, shotT = 0, fade: HTMLDivElement | null = null;

function frameShot(i: number) {
  const sh = SHOTS[i % SHOTS.length];
  const s = G.T.sites.find((x) => x.settlement === sh.key || x.key === sh.key);
  if (!s) return;
  G.cam.follow = null;
  G.cam.lookAt(s.x, s.z, sh.dist);
  G.cam.yaw = G.cam.wantYaw = sh.yaw;
  G.cam.pitch = G.cam.wantPitch = sh.pitch;
  G.cam.dist = G.cam.wantDist = sh.dist;
}

/** Drives the camera while the title is up (called from the main loop). */
export function tickTitle(dt: number) {
  if (!root) return;
  shotT += dt;
  if (!reducedMotion()) { G.cam.wantYaw += dt * 0.035; G.cam.wantDist *= 1 - dt * 0.006; } // the slow drift is motion too
  if (shotT > SHOT_T - 1.2 && fade) fade.style.opacity = '1';
  if (shotT > SHOT_T) {
    shotT = 0;
    shotI++;
    frameShot(shotI);
    setTimeout(() => { if (fade) fade.style.opacity = '0'; }, 500);
  }
}

// ---------------------------------------------------------------- title
export function showTitle() {
  hideTitle();
  G.mode = 'title';
  document.body.classList.add('mode-title');
  backdropWorld();
  S.clock.t = DAY + 16.8 * HOUR;
  G.speed = 1;
  shotI = Math.floor(Math.random() * SHOTS.length);
  shotT = 0;
  frameShot(shotI);
  root = h('div', { id: 'title' });
  fade = h('div', { class: 'tfade' });
  panel = h('div', { class: 'tpanel' });
  root.append(fade, panel);
  ui().appendChild(root);
  for (const ev of ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel', 'contextmenu']) root.addEventListener(ev, (e) => e.stopPropagation());
  root.addEventListener('contextmenu', (e) => e.preventDefault());
  unKey = input.onKey((code, e) => {
    if (code === 'Escape') { if (screen !== 'main') mainMenu(); return true; }
    if (keymap.actionFor(e) === 'fullscreen') toggleFullscreen();
    return true; // the title swallows every game key
  });
  mainMenu();
  if (G.settings && !G.settings.flashWarned) flashNotice();
  setTimeout(() => { if (fade) fade.style.opacity = '0'; }, 50);
}

export function hideTitle() {
  if (preview) { preview.dispose(); preview = null; }
  unKey?.(); unKey = null;
  root?.remove(); root = null; fade = null;
  document.body.classList.remove('mode-title');
}

export const titleUp = () => !!root;

function set(cls: string, ...kids: (Node | string | null | false)[]) {
  if (preview) { preview.dispose(); preview = null; }
  panel.className = 'tpanel ' + cls;
  panel.innerHTML = '';
  panel.append(...kids.filter(Boolean) as (Node | string)[]);
}

function btn(label: string, run: () => void, cls = '') {
  const b = h('button', { class: 'tbtn ' + cls }, label);
  b.onclick = () => { uiSound('click'); run(); };
  return b;
}

async function mainMenu() {
  screen = 'main';
  const saves = await listSaves().catch(() => [] as SaveMeta[]);
  const latest = saves.find(safeToResume) ?? saves.find(fitsWorld);
  const menu = h('div', { class: 'tmenu' });
  if (latest) {
    const cont = btn('Continue', () => void doLoad(latest.slot), 'primary');
    cont.appendChild(h('small', {}, `${latest.name} · day ${latest.day} · ${latest.place}`));
    menu.append(cont);
  }
  menu.append(
    btn('New Game', () => newGameScreen(), latest ? '' : 'primary'),
    btn('Load Game', () => loadScreen()),
    btn('Options', () => optionsScreen()),
    btn('How to Play', () => helpScreen()),
    btn('About', () => aboutScreen()),
  );
  set('main',
    h('div', { class: 'tlogo' }, h('div', { class: 'tname' }, 'SALTBLADE'), h('div', { class: 'ttag' }, 'A squad sandbox of the salt wastes')),
    menu,
    h('div', { class: 'tfoot' }, `12 × 12 km · ${G.T.sites.filter((s) => s.kind === 'town').length} settlements · ${G.T.sites.length} places`),
  );
}

/** Shown once, on the first launch: some of the game flashes, and where to turn that off. */
function flashNotice() {
  const done = (reduce: boolean) => {
    G.settings.flashWarned = true;
    if (reduce) G.settings.reducedMotion = true;
    applySettings();
    saveSettings();
    box.remove();
  };
  const box = h('div', { class: 'tnotice', role: 'note' },
    h('div', {}, h('b', {}, 'A word about flashing. '), 'Lightning flashes in storms, and the picture pulses when someone you are watching is badly hurt or high. ', h('b', {}, 'Reduced motion'), ', under Options, turns these off; the game also follows the reduce-motion setting of your system.'),
    h('div', { class: 'btns' }, btn('Reduce motion', () => done(true), 'small'), btn('OK', () => done(false), 'small primary')),
  );
  root?.appendChild(box);
}

async function doLoad(slot: string) {
  const busy = loading('Loading…');
  await new Promise((r) => setTimeout(r, 30));
  const err = await loadSlot(slot);
  busy.remove();
  if (err) { toast(err); if (!root) return; mainMenu(); return; }
  hideTitle();
}

function loading(text: string) {
  const el = h('div', { class: 'tloading' }, h('div', {}, text));
  ui().appendChild(el);
  return el;
}

function toast(text: string) {
  const el = h('div', { class: 'ttoast' }, text);
  ui().appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------------------------------------------------------------- new game: choose a start
let chosen: Scenario = SCENARIO.wanderer;

function diffClass(d: string) { return 'd-' + d.toLowerCase().replace(/\s+/g, ''); }

function newGameScreen() {
  screen = 'new';
  const list = h('div', { class: 'scgrid' });
  const detail = h('div', { class: 'scdetail' });
  const show = (sc: Scenario) => {
    chosen = sc;
    for (const el of list.children) el.classList.toggle('on', (el as HTMLElement).dataset.k === sc.key);
    detail.innerHTML = '';
    detail.append(
      h('div', { class: 'scname' }, sc.name, h('span', { class: 'chip ' + diffClass(sc.diff) }, sc.diff)),
      h('p', {}, sc.desc),
      h('div', { class: 'scfacts' },
        h('div', {}, h('b', {}, String(sc.people.length)), sc.people.length === 1 ? ' person' : ' people'),
        h('div', {}, h('b', {}, sc.money.toLocaleString()), ' chits'),
        sc.homestead ? h('div', {}, 'A homestead to start from') : null,
        sc.bounty ? h('div', { class: 'bad' }, 'Wanted by the ' + Object.keys(sc.bounty).map((f) => f[0].toUpperCase() + f.slice(1)).join(', ')) : null,
        sc.people.some((p) => p.shackled) ? h('div', { class: 'bad' }, 'Starts in shackles') : null,
        sc.people.some((p) => p.lost?.length) ? h('div', { class: 'bad' }, 'Starts maimed') : null,
      ),
    );
  };
  for (const sc of SCENARIOS) {
    if (sc.hidden && !(import.meta.env.DEV && location.hash.includes('debug'))) continue;
    const card = h('div', { class: 'sccard', 'data-k': sc.key },
      h('div', { class: 'scname' }, sc.name),
      h('span', { class: 'chip ' + diffClass(sc.diff) }, sc.diff),
      h('div', { class: 'scblurb' }, sc.blurb),
    );
    card.onclick = () => { uiSound('click'); show(sc); };
    card.ondblclick = () => creatorScreen(sc);
    list.appendChild(card);
  }
  show(chosen);
  set('wide',
    h('div', { class: 'thead' }, h('div', { class: 'tstep' }, 'New game · 1 of 2'), h('h2', {}, 'Choose how it begins')),
    h('div', { class: 'scwrap' }, list, detail),
    h('div', { class: 'tnav' }, btn('Back', () => mainMenu()), h('div', { class: 'grow' }), btn('Next: your people ›', () => creatorScreen(chosen), 'primary')),
  );
}

// ---------------------------------------------------------------- new game: people
interface Draft { name: string; look: Look; char: Char; }
const scratch = new World();

function makeDraft(sc: Scenario, i: number, race: string, rng: RNG, look?: Look): Draft {
  const p = sc.people[i];
  const lk = look ?? randomLook(race, rng, p.female);
  const name = personName(race, lk.female, rng);
  const c = makePlayerPerson(p, { name, look: lk }, rng, scratch);
  scratch.chars.delete(c.id);
  return { name, look: lk, char: c };
}

function playableFor(sc: Scenario, i: number): RaceDef[] {
  const allowed = sc.people[i].races;
  return RACES.filter((r) => (allowed ? allowed.includes(r.key) : r.playable));
}

function creatorScreen(sc: Scenario) {
  screen = 'create';
  const rng = new RNG((Date.now() & 0xffffff) + 7);
  const drafts: Draft[] = sc.people.map((p, i) => makeDraft(sc, i, p.races ? rng.pick(p.races) : rng.pick(['valefolk', 'valefolk', 'duneborn']), rng));
  let cur = 0;
  let faction = sc.squad;
  const tabs = h('div', { class: 'cctabs' });
  const view = h('canvas', { class: 'ccview', width: '300', height: '420' }) as HTMLCanvasElement;
  const edit = h('div', { class: 'ccedit' });
  const factionIn = h('input', { class: 'tin', value: faction, maxlength: '28', spellcheck: 'false' }) as HTMLInputElement;
  factionIn.oninput = () => { faction = factionIn.value; };

  const refreshTabs = () => {
    tabs.innerHTML = '';
    drafts.forEach((d, i) => {
      const t = h('button', { class: 'cctab' + (i === cur ? ' on' : '') }, h('b', {}, d.name || '—'), h('small', {}, RACE[d.look.race].name));
      t.onclick = () => { cur = i; refreshTabs(); refreshEdit(); };
      tabs.appendChild(t);
    });
  };

  const setLook = (patch: Partial<Look>) => {
    const d = drafts[cur];
    d.look = { ...d.look, ...patch };
    d.char.look = { ...d.look };
    d.char.dirty = true;
    refreshEdit();
  };

  const swatches = (cols: number[], val: number, pick: (v: number) => void, none = false) => {
    const row = h('div', { class: 'swrow' });
    if (none) {
      const s = h('button', { class: 'sw none' + (val === 0 ? ' on' : ''), title: 'None' }, '×');
      s.onclick = () => pick(0);
      row.appendChild(s);
    }
    for (const c of cols) {
      const s = h('button', { class: 'sw' + (c === val ? ' on' : ''), style: { background: '#' + c.toString(16).padStart(6, '0') } });
      s.onclick = () => pick(c);
      row.appendChild(s);
    }
    return row;
  };
  const steps = (n: number, val: number, pick: (v: number) => void, labels?: string[]) => {
    const row = h('div', { class: 'steprow' });
    for (let i = 0; i < n; i++) {
      const s = h('button', { class: 'stp' + (i === val ? ' on' : '') }, labels?.[i] ?? String(i + 1));
      s.onclick = () => pick(i);
      row.appendChild(s);
    }
    return row;
  };
  const slider = (min: number, max: number, val: number, pick: (v: number) => void, fmt: (v: number) => string) => {
    const out = h('span', { class: 'slval' }, fmt(val));
    const s = h('input', { type: 'range', min: String(min), max: String(max), step: String((max - min) / 100), value: String(val) }) as HTMLInputElement;
    s.oninput = () => { out.textContent = fmt(+s.value); };
    s.onchange = () => pick(+s.value);
    return h('div', { class: 'slrow' }, s, out);
  };
  const row = (label: string, ...kids: (Node | null)[]) => h('div', { class: 'ccrow' }, h('label', {}, label), h('div', { class: 'ccctl' }, ...kids.filter(Boolean) as Node[]));

  const refreshEdit = () => {
    const d = drafts[cur];
    const r = RACE[d.look.race];
    const hairy = r.race === 'human' || r.race === 'karuk';
    const nameIn = h('input', { class: 'tin', value: d.name, maxlength: '24', spellcheck: 'false' }) as HTMLInputElement;
    nameIn.oninput = () => { d.name = nameIn.value; d.char.name = d.name; refreshTabs(); };
    const dice = h('button', { class: 'tbtn small', title: 'Another name' }, 'Roll');
    dice.onclick = () => { d.name = personName(d.look.race, d.look.female, rng); d.char.name = d.name; refreshTabs(); refreshEdit(); };
    const races = h('div', { class: 'steprow wrap' });
    for (const rd of playableFor(sc, cur)) {
      const b = h('button', { class: 'stp' + (rd.key === d.look.race ? ' on' : '') }, rd.name);
      b.onclick = () => {
        if (rd.key === d.look.race) return;
        drafts[cur] = makeDraft(sc, cur, rd.key, rng);
        drafts[cur].name = d.name && RACE[d.look.race].race === rd.race ? d.name : drafts[cur].name;
        drafts[cur].char.name = drafts[cur].name;
        preview?.show(drafts[cur].char);
        refreshTabs(); refreshEdit();
      };
      races.appendChild(b);
    }
    const hRange: [number, number] = [r.height[0] * (d.look.female && r.race === 'human' ? 0.95 : 1), r.height[1] * (d.look.female && r.race === 'human' ? 0.95 : 1)];
    const skills = topSkills(d.char);
    edit.innerHTML = '';
    const parts: (Node | null)[] = [
      row('Name', nameIn, dice),
      row('Race', races),
      h('div', { class: 'ccdesc' }, r.desc),
      r.race === 'human' || r.race === 'karuk' ? row('Sex', steps(2, d.look.female ? 1 : 0, (v) => setLook({ female: v === 1, beard: v === 1 ? 0 : d.look.beard }), ['Male', 'Female'])) : null,
      row(r.robotic ? 'Plating' : 'Skin', swatches(r.skin, d.look.skin, (v) => setLook({ skin: v }))),
      hairy ? row('Hair', steps(9, d.look.hairStyle, (v) => setLook({ hairStyle: v }), ['Bald', '1', '2', '3', '4', '5', '6', '7', '8'])) : null,
      hairy ? row('Hair colour', swatches(r.race === 'human' ? [...r.hair, 0xa83a2a, 0xc8c0b0] : r.hair, d.look.hair, (v) => setLook({ hair: v }))) : null,
      hairy && !d.look.female ? row('Beard', steps(5, d.look.beard, (v) => setLook({ beard: v }), ['None', '1', '2', '3', '4'])) : null,
      row('Face', steps(4, d.look.face, (v) => setLook({ face: v }))),
      row('Height', slider(hRange[0], hRange[1], d.look.height, (v) => setLook({ height: v }), (v) => v.toFixed(2) + ' m')),
      row('Build', slider(r.bulk[0], r.bulk[1], d.look.bulk, (v) => setLook({ bulk: v }), (v) => (v < (r.bulk[0] * 2 + r.bulk[1]) / 3 ? 'Lean' : v > (r.bulk[0] + r.bulk[1] * 2) / 3 ? 'Heavy' : 'Medium'))),
      !r.robotic ? row('War paint', swatches([0xa83a2a, 0xe8e0d0, 0x2a2a2a, 0x3a6a9a], d.look.paint, (v) => setLook({ paint: v }), true)) : null,
      row('Scars', steps(4, d.look.scars, (v) => setLook({ scars: v }), ['None', '1', '2', '3'])),
      h('div', { class: 'ccskills' }, ...skills.map(([n, v]) => h('span', {}, n, ' ', h('b', {}, String(v))))),
    ];
    edit.append(...parts.filter((x): x is Node => !!x));
    if (preview && preview.view?.c !== d.char) preview.show(d.char);
  };

  // the randomise buttons sit under the portrait, where there is room on a laptop screen
  const random = h('div', { class: 'ccbtns' },
    btn('Randomise', () => { const d = drafts[cur]; const nd = makeDraft(sc, cur, d.look.race, rng); drafts[cur] = nd; preview?.show(nd.char); refreshTabs(); refreshEdit(); }),
    drafts.length > 1 ? btn('Randomise all', () => { for (let i = 0; i < drafts.length; i++) drafts[i] = makeDraft(sc, i, drafts[i].look.race, rng); preview?.show(drafts[cur].char); refreshTabs(); refreshEdit(); }) : null,
  );
  set('wide create',
    h('div', { class: 'thead' }, h('div', { class: 'tstep' }, `New game · 2 of 2 · ${sc.name}`), h('h2', {}, sc.people.length > 1 ? 'Your people' : 'Who you are')),
    h('div', { class: 'ccfaction' }, h('label', {}, 'Faction name'), factionIn),
    h('div', { class: 'ccwrap' }, tabs, h('div', { class: 'cccol' }, h('div', { class: 'ccviewbox' }, view, h('div', { class: 'cchint' }, 'Drag to turn')), random), edit),
    h('div', { class: 'tnav' },
      btn('Back', () => newGameScreen()),
      h('div', { class: 'grow' }),
      btn('Begin ›', () => begin(), 'primary'),
    ),
  );
  preview = new Preview(view, 300, 420);
  preview.show(drafts[0].char);
  if (import.meta.env.DEV && location.hash.includes('debug')) (window as any).__preview = preview;
  refreshTabs();
  refreshEdit();
  if (drafts.length === 1) { tabs.style.display = 'none'; tabs.parentElement!.classList.add('single'); }

  const begin = () => {
    const setup: NewGameSetup = { scenario: sc.key, faction, people: drafts.map((d) => ({ name: d.name, look: d.look, char: d.char })) };
    const busy = loading('Walking into the world…');
    setTimeout(() => {
      hideTitle();
      startNewGame(setup);
      busy.remove();
    }, 40);
  };
}

function topSkills(c: Char): [string, number][] {
  const out: [string, number][] = [];
  for (const k of SKILLS) out.push([SKILL_INFO[k].name, Math.round(c.sk[SK[k]])]);
  return out.sort((a, b) => b[1] - a[1]).slice(0, 6);
}

// ---------------------------------------------------------------- load, options, help
export async function renderLoadList(el: HTMLElement, onLoad: (slot: string) => void, onData: (data: any) => void) {
  el.innerHTML = '';
  const saves = await listSaves().catch(() => [] as SaveMeta[]);
  const list = h('div', { class: 'savelist' });
  if (!saves.length) list.appendChild(h('div', { class: 'dim empty' }, 'No saved games yet.'));
  for (const m of saves) {
    const when = new Date(m.savedAt);
    const rowEl = h('div', { class: 'saverow' },
      h('div', { class: 'svslot', 'data-slot': m.slot }, slotLabel(m.slot)),
      h('div', { class: 'svinfo' }, h('b', {}, m.name), h('div', { class: 'dim' }, fitsWorld(m) ? `Day ${m.day} · ${m.chars} ${m.chars === 1 ? 'person' : 'people'} · ${m.money.toLocaleString()} chits · ${m.place}` : `Day ${m.day} · ${misfit(m)}; it can no longer be loaded`)),
      h('div', { class: 'svwhen dim' }, when.toLocaleDateString() + ' ' + when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
    );
    const load = h('button', { class: 'tbtn small primary' }, 'Load');
    load.onclick = () => onLoad(m.slot);
    if (!fitsWorld(m)) { (load as HTMLButtonElement).disabled = true; rowEl.classList.add('stale'); }
    const del = h('button', { class: 'tbtn small' }, 'Delete');
    del.onclick = () => ask(`Delete the save "${m.name}, day ${m.day}"? This cannot be undone.`, 'Delete', async () => { await deleteSave(m.slot); renderLoadList(el, onLoad, onData); }, 'Keep it', true);
    rowEl.append(load, del);
    list.appendChild(rowEl);
  }
  const file = h('input', { type: 'file', accept: '.txt,.saltblade,.json,.gz', style: { display: 'none' }, id: 'save-file' }) as HTMLInputElement;
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    try { onData(await importSaveFile(f)); } catch { toast('That file is not a Saltblade save.'); }
  };
  const imp = h('button', { class: 'tbtn small' }, 'Open a save file');
  imp.onclick = () => file.click();
  const paste = h('button', { class: 'tbtn small' }, 'Paste a save');
  paste.onclick = () => askPaste('Paste a save you copied as text.', async (text) => {
    try { onData(await importText(text)); } catch { toast('That text is not a Saltblade save.'); }
  });
  el.append(list, h('div', { class: 'svfoot' }, paste, imp, file));
}

function loadScreen() {
  screen = 'load';
  const box = h('div', { class: 'tbody' });
  set('mid', h('div', { class: 'thead' }, h('h2', {}, 'Load a game')), box, h('div', { class: 'tnav' }, btn('Back', () => mainMenu())));
  renderLoadList(box, (slot) => void doLoad(slot), (data) => {
    const err = loadData(data);
    if (err) toast(err); else hideTitle();
  });
}

let fsWatch: (() => void) | null = null; // keeps the fullscreen button's label right for the options last rendered

export function renderOptions(el: HTMLElement) {
  const s: Settings = G.settings;
  el.innerHTML = '';
  const change = (patch: Partial<Settings>) => { Object.assign(s, patch); applySettings(); saveSettings(); };
  const opt = (label: string, ctl: Node, hint = '') => h('div', { class: 'optrow' }, h('label', {}, label, hint ? h('small', {}, hint) : null), ctl);
  const choice = <T extends string | number | boolean>(vals: [T, string][], cur: T, pick: (v: T) => void) => {
    const row = h('div', { class: 'steprow' });
    for (const [v, lab] of vals) {
      const b = h('button', { class: 'stp' + (v === cur ? ' on' : '') }, lab);
      b.onclick = () => { pick(v); for (const x of row.children) x.classList.remove('on'); b.classList.add('on'); };
      row.appendChild(b);
    }
    return row;
  };
  const vol = (k: 'master' | 'music' | 'sfx' | 'ambience') => {
    const out = h('span', { class: 'slval' }, Math.round(s[k] * 100) + '%');
    const r = h('input', { type: 'range', min: '0', max: '1', step: '0.01', value: String(s[k]) }) as HTMLInputElement;
    r.oninput = () => { out.textContent = Math.round(+r.value * 100) + '%'; change({ [k]: +r.value } as Partial<Settings>); };
    return h('div', { class: 'slrow' }, r, out);
  };
  const range = (k: 'viewDist' | 'uiScale', min: number, max: number, fmt: (v: number) => string) => {
    const out = h('span', { class: 'slval' }, fmt(s[k]));
    const r = h('input', { type: 'range', min: String(min), max: String(max), step: '0.05', value: String(s[k]) }) as HTMLInputElement;
    r.oninput = () => { out.textContent = fmt(+r.value); };
    r.onchange = () => change({ [k]: +r.value } as Partial<Settings>);
    return h('div', { class: 'slrow' }, r, out);
  };
  // fullscreen is not a setting: the browser grants it per click or key press, and the button says which way it goes
  const fs = h('button', { class: 'tbtn small fsbtn' });
  fs.onclick = () => { uiSound('click'); toggleFullscreen(); };
  if (fsWatch) document.removeEventListener('fullscreenchange', fsWatch);
  fsWatch = () => { fs.textContent = fullscreenOn() ? 'Leave fullscreen' : 'Enter fullscreen'; };
  document.addEventListener('fullscreenchange', fsWatch);
  fsWatch();
  const size = range('uiScale', UI_SCALE[0], UI_SCALE[1], (v) => Math.round(v * 100) + '%');
  if (!zoomSupported) size.querySelector('input')!.disabled = true;
  const controls = h('div', { class: 'controls' });
  el.append(
    h('h3', {}, 'Sound'),
    opt('Master', vol('master')), opt('Music', vol('music')), opt('Effects', vol('sfx')), opt('Ambience', vol('ambience')),
    h('h3', {}, 'Graphics'),
    opt('Quality', choice<Settings['quality']>([['auto', 'Auto'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], s.quality, (v) => change({ quality: v })), 'resolution and shadow detail; Auto follows the frame rate'),
    opt('Shadows', choice<boolean>([[true, 'On'], [false, 'Off']], s.shadows, (v) => change({ shadows: v })), 'none on Low, which spends the time on the ground instead'),
    opt('Draw distance', range('viewDist', 0.6, 1.5, (v) => Math.round(v * 100) + '%'), 'plants, rocks and people'),
    h('h3', {}, 'Display'),
    opt('Interface size', size, zoomSupported ? 'everything but the world itself' : 'needs a newer browser: Chrome 128, Firefox 126 or Safari 26.4'),
    opt('Fullscreen', fs, keymap.labels('fullscreen')[0] ?? ''),
    opt('Colour-blind mode', choice<Settings['colorblind']>(VISIONS, s.colorblind, (v) => change({ colorblind: v })), 'friend and foe, health and status in colours you can tell apart'),
    opt('Reduced motion', choice<boolean>([[false, 'Off'], [true, 'On']], s.reducedMotion, (v) => change({ reducedMotion: v })), 'no impact hold, camera kick, lightning flash or pulsing; your system\'s own setting counts too'),
    h('h3', {}, 'Game'),
    opt('Autosave', choice<number>([[0, 'Off'], [4, '4 min'], [8, '8 min'], [15, '15 min']], s.autosave, (v) => change({ autosave: v }))),
    opt('Pause when someone falls', choice<boolean>([[true, 'Yes'], [false, 'No']], s.pauseOnKO, (v) => change({ pauseOnKO: v })), 'one of yours knocked out'),
    opt('Pause when an idle person is attacked', choice<boolean>([[true, 'Yes'], [false, 'No']], s.pauseOnAttacked, (v) => change({ pauseOnAttacked: v })), 'one of yours hit while not fighting'),
    opt('Pause when a limb is lost', choice<boolean>([[true, 'Yes'], [false, 'No']], s.pauseOnLimbLost, (v) => change({ pauseOnLimbLost: v }))),
    opt('Hints', choice<boolean>([[true, 'Show'], [false, 'Hide']], s.hints, (v) => { change({ hints: v }); if (v) { try { localStorage.removeItem('sb-hints'); } catch { /* ignore */ } } }), 'first-time tips'),
    opt('Chatter', choice<boolean>([[true, 'On'], [false, 'Off']], s.chatter, (v) => change({ chatter: v })), 'your people talking on the road'),
    opt('Names over heads', choice<Settings['names']>([['always', 'Always'], ['hover', 'On hover']], s.names, (v) => change({ names: v }))),
    opt('Edge scrolling', choice<boolean>([[false, 'Off'], [true, 'On']], s.edgeScroll, (v) => change({ edgeScroll: v }))),
    h('h3', {}, 'Controls'),
    controls,
  );
  renderControls(controls, change);
}

/** The key bindings: click a key to press a new one. Conflicts are shown, and there is a way back to the defaults. */
function renderControls(el: HTMLElement, change: (patch: Partial<Settings>) => void) {
  el.innerHTML = '';
  // which keys fire two things at once, by action
  const dup = new Map<ActionId, string[]>();
  const conflicts = keymap.conflicts();
  for (const c of conflicts) for (const a of c.actions) dup.set(a, [...(dup.get(a) ?? []), c.label]);
  const list = h('div', { class: 'keylist' });
  let group = '';
  for (const d of ACTIONS) {
    if (d.group !== group) { group = d.group; list.appendChild(h('div', { class: 'kgroup' }, group)); }
    const keys = keymap.bindings[d.id];
    const binds = h('div', { class: 'kbinds' });
    // one spare slot, to add a second (or third) key
    const slots = d.fixed ? keys.length : Math.min(3, keys.length + 1);
    for (let i = 0; i < slots; i++) {
      const k = keys[i];
      const label = k ? keyLabel(k) : '+';
      const b = h('button', { class: 'kbtn' + (k ? '' : ' empty') + (k && dup.get(d.id)?.includes(label) ? ' dup' : ''), title: d.fixed ? 'This key cannot be changed' : k ? 'Click, then press a new key (Backspace removes it)' : 'Click, then press a key to add' }, label);
      if (d.fixed) b.disabled = true;
      else b.onclick = () => listen(b, d, i);
      binds.appendChild(b);
    }
    list.appendChild(h('div', { class: 'keyact' + (dup.has(d.id) ? ' dup' : '') }, h('span', {}, d.name, d.when ? h('small', {}, ` · while ${d.when}`) : null), binds));
  }
  const warn = h('div', { class: 'kconflicts' }, ...conflicts.map((c) => h('div', {}, `${c.label} is bound to ${c.actions.length} things: ${c.actions.map((a) => ACTION[a].name).join('; ')}.`)));
  const reset = btn('Reset to defaults', () => { keymap.reset(); change({ keys: {} }); renderControls(el, change); }, 'small');
  const help = h('p', { class: 'khelp' }, 'Keys go by what they type, so they follow your keyboard layout; the camera keys go by where they sit, so they stay under the left hand. Typing in a box never triggers them.');
  el.append(list, warn, h('div', { class: 'tnav', style: { marginTop: '10px' } }, reset), help);

  const listen = (b: HTMLButtonElement, d: ActionDef, i: number) => {
    if (!b.isConnected) return; // a button the list was rebuilt under
    b.textContent = 'Press a key…';
    b.classList.add('listen');
    const stop = () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('mousedown', cancel, true); };
    const cancel = () => { stop(); renderControls(el, change); };
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === 'Escape') { cancel(); return; }
      let keys = keymap.bindings[d.id].slice();
      if (e.key === 'Backspace') keys.splice(i, 1);
      else {
        // the camera keys go by position; everything else by what the key types
        const nb = d.hold && e.code ? '@' + e.code : bindingOf(e);
        if (!nb) return; // a modifier on its own: keep listening
        keys = keys.filter((k, j) => k !== nb || j === i);
        keys[i] = nb;
      }
      keymap.set(d.id, keys.filter(Boolean));
      change({ keys: keymap.overrides() });
      stop();
      renderControls(el, change);
    };
    window.addEventListener('keydown', onKey, true);
    setTimeout(() => window.addEventListener('mousedown', cancel, true), 0);
  };
}

function optionsScreen() {
  screen = 'options';
  const box = h('div', { class: 'tbody opts' });
  set('mid', h('div', { class: 'thead' }, h('h2', {}, 'Options')), box, h('div', { class: 'tnav' }, btn('Back', () => mainMenu())));
  renderOptions(box);
}

export function renderHelp(el: HTMLElement) {
  const mouse: [string, string][] = [
    ['Left click', 'Select a person (Shift adds, drag a box for many)'],
    ['Right click ground', 'Move there'],
    ['Right click someone', 'Attack if hostile, otherwise a menu: talk, trade, loot, aid, carry…'],
    ['Right click an object', 'Use, open, build, mine, operate'],
    ['Double click', 'Select and follow with the camera'],
    ['Middle drag / Alt+drag', 'Turn and tilt the camera'],
    ['Wheel', 'Zoom · Shift+wheel turns a building being placed'],
  ];
  // the key table comes from the bindings themselves, so it is always right
  const keys: [string, string][] = helpRows().map((r) => [r.keys, r.what]);
  const tips = [
    'Skills grow by doing. Getting beaten up trains Toughness; blocking trains Defence; carrying heavy loads trains Strength.',
    'People are knocked out long before they die. A knocked-out friend can be carried home and patched up with a first aid kit.',
    'Bleeding kills. Bandage wounds after a fight, and rest in a bed to heal faster.',
    'Hunger matters. Buy food in towns, loot it, or grow it. A starving person fights poorly and eventually collapses.',
    'Towns have laws. Stealing, assault and freeing slaves are crimes if someone sees you. Guards come for anyone with a bounty.',
    'Bars are where people looking for work drink. Talk to them: some will join you, some want paying first.',
    `To build a base, place construction sites (${keymap.labels('build')[0] ?? 'Build'}) away from towns and haul materials to them. Research (${keymap.labels('research')[0] ?? 'Research'}) opens better machines, walls and gear.`,
    'Some fights cannot be won. Run, and live to try again.',
  ];
  const table = (rows: [string, string][]) => h('div', { class: 'keys' }, ...rows.map(([k, v]) => h('div', { class: 'keyrow' }, h('kbd', {}, k), h('span', {}, v))));
  el.innerHTML = '';
  el.append(
    h('h3', {}, 'Mouse'),
    table(mouse),
    h('h3', {}, 'Keys'),
    h('p', { class: 'dim small' }, 'Hold Shift to move the camera faster. Every key can be changed under Options.'),
    table(keys),
    h('h3', {}, 'Survival'),
    h('ul', { class: 'tips' }, ...tips.map((t) => h('li', {}, t))),
  );
}

function helpScreen() {
  screen = 'help';
  const box = h('div', { class: 'tbody help' });
  set('mid', h('div', { class: 'thead' }, h('h2', {}, 'How to play')), box, h('div', { class: 'tnav' }, btn('Back', () => mainMenu())));
  renderHelp(box);
}

// ---------------------------------------------------------------- about: version, credits, licences
export function renderAbout(el: HTMLElement) {
  const version = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev';
  const lic = (name: string, terms: string, text: string) => h('details', { class: 'lic' }, h('summary', {}, name, h('small', {}, terms)), h('pre', {}, text));
  el.innerHTML = '';
  el.append(
    h('div', { class: 'ver' }, `Saltblade · version ${version}`),
    h('p', {}, 'A squad sandbox of the salt wastes: one person and a road, or four and a field, and whatever the waste makes of them.'),
    h('h3', {}, 'Credits'),
    h('p', {}, 'Everything in Saltblade is made in code: the land and its towns, the people, beasts and machines, their faces and clothes, the icons, the music and every sound. Nothing was drawn, recorded or bought in.'),
    h('p', {}, 'Built with three.js, TypeScript and Vite. Set in Barlow, Barlow Condensed and Cinzel.'),
    h('p', { class: 'dim' }, 'Inspired by Kenshi, with a world of its own.'),
    h('h3', {}, 'Licences'),
    h('p', { class: 'dim small' }, 'The third-party work bundled into the game, with its licences in full.'),
    lic('three.js', 'MIT License · the three.js authors', threeLicense),
    lic('Barlow and Barlow Condensed', 'SIL Open Font License 1.1 · the Barlow Project authors', barlowLicense),
    lic('Cinzel', 'SIL Open Font License 1.1 · the Cinzel Project authors', cinzelLicense),
  );
}

function aboutScreen() {
  screen = 'about';
  const box = h('div', { class: 'tbody about' });
  set('mid', h('div', { class: 'thead' }, h('h2', {}, 'About')), box, h('div', { class: 'tnav' }, btn('Back', () => mainMenu())));
  renderAbout(box);
}
