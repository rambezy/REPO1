// First-time hints: a short note the first time something matters. Each is
// shown once; the list of seen hints is remembered in the browser.
import { h, ui } from './dom';
import { G } from '../state';
import { S } from '../sim/ctx';
import { on } from '../core/events';
import { uiSound } from '../audio';
import { input } from '../core/input';
import { SCENARIO } from '../content/scenarios';

const seen = new Set<string>();
let box: HTMLDivElement | null = null;
let queue: [string, string, string][] = [];
let t = 0;

function load() {
  try { for (const k of JSON.parse(localStorage.getItem('sb-hints') ?? '[]')) seen.add(k); } catch { /* none */ }
}
function save() {
  try { localStorage.setItem('sb-hints', JSON.stringify([...seen])); } catch { /* private mode */ }
}

export function hint(key: string, title: string, text: string) {
  if (seen.has(key) || G.settings?.hints === false) return;
  seen.add(key);
  save();
  queue.push([key, title, text]);
  if (!box) showNext();
}

function showNext() {
  const next = queue.shift();
  if (!next) return;
  const [, title, text] = next;
  const ok = h('button', { class: 'tbtn small' }, 'Got it');
  const off = h('button', { class: 'hintoff' }, 'No more hints');
  box = h('div', { class: 'hintbox' }, h('div', { class: 'hinttitle' }, title), h('div', { class: 'hinttext', html: text }), h('div', { class: 'hintbtns' }, off, ok));
  for (const ev of ['mousedown', 'click', 'wheel', 'contextmenu']) box.addEventListener(ev, (e) => e.stopPropagation());
  const close = () => { box?.remove(); box = null; setTimeout(showNext, 400); };
  ok.onclick = close;
  off.onclick = () => { if (G.settings) G.settings.hints = false; queue = []; close(); try { const s = JSON.parse(localStorage.getItem('sb-settings') ?? '{}'); s.hints = false; localStorage.setItem('sb-settings', JSON.stringify(s)); } catch { /* ignore */ } };
  ui().appendChild(box);
  uiSound('notify');
  setTimeout(() => { if (box && box.querySelector('.hinttitle')?.textContent === title) close(); }, 30000);
}

export function setupHints() {
  load();
  on('game:start', () => {
    setTimeout(() => {
      if (input.touch || matchMedia('(pointer: coarse)').matches) hint('start_touch', 'Your people', 'Your people are the portraits at the bottom. <b>Tap</b> to select, <b>press and hold</b> the ground to move there or on someone for things to do. Drag to look around, pinch to zoom, twist with two fingers to turn. Saltblade plays best with a mouse and keyboard.');
      else hint('start', 'Your people', 'Your people are the portraits at the bottom. <b>Left-click</b> to select (drag a box for several), <b>right-click the ground</b> to move, <b>right-click someone</b> for things to do. <b>Space</b> pauses; <b>1–4</b> set the speed.');
      // what to do first, for the way this game began
      const sc = SCENARIO[S.W.flags.scenario];
      if (sc?.firstSteps) hint('first_' + sc.key, 'First steps', sc.firstSteps);
    }, 1500);
  });
  on('ui:talk', () => hint('talk', 'Talking', 'People you talk to remember how you treat them. Recruits drink in bars; some join for free, some want paying.'));
  on('ui:trade', () => hint('trade', 'Trading', 'Drag items between your pack and the shop. Prices depend on the trader and your standing with their faction.'));
  on('fx:ko', (c: any) => { if (c.faction === 'player') hint('ko', 'Knocked out', `${c.name} is down. People wake when their wounds allow. Another of yours can <b>pick them up</b> (right-click) and carry them to safety, or treat them with <b>First aid</b>.`); });
  on('ui:build', () => hint('build', 'Building', 'Place a construction site, then right-click it with someone selected to <b>Build</b>. Materials come from nearby storage or your packs. You cannot build inside towns.'));
}

/** Checks for situations worth a hint, every couple of seconds. */
export function tickHints(dt: number) {
  if (G.mode !== 'play') return;
  t -= dt;
  if (t > 0) return;
  t = 2;
  const W = S.W;
  for (const c of W.playerChars()) {
    if (!c.alive) continue;
    if (c.hunger < 100 && !c.robot && !c.animal) hint('hunger', 'Hunger', `${c.name} is getting hungry. Eat from the pack (<b>I</b>, right-click food), buy food in town, or grow it. Starving people fight badly and faint.`);
    if (c.body.bleeding() > 0.05 && c.up) hint('bleed', 'Bleeding', `${c.name} is bleeding. Right-click them and choose <b>First aid</b>: it needs bandages or a first aid kit in someone's pack.`);
    if (c.carrying) hint('carry', 'Carrying', 'Right-click a bed to lay them down, a cage to lock them up, or press <b>X</b> to drop them.');
    if (c.load() > 1) hint('load', 'Overloaded', `${c.name} is carrying too much and slows down. Heavy loads train strength, though.`);
    if (Object.values(c.bounty).some((v) => v > 0)) hint('wanted', 'Wanted', 'Someone saw a crime. Guards of that faction will try to arrest your people. Pay the bounty to a guard, lie low, or fight.');
    if (c.shackled) hint('shackles', 'Shackles', 'Shackled people move slowly. Select them and right-click themselves (or a friend) to <b>pick the shackles</b>. Better when nobody is looking.');
  }
  const site = G.T.siteAt(G.cam.target.x, G.cam.target.z, 20);
  if (site?.kind === 'town' && W.discovered.has(site.id)) hint('town', 'Towns', 'Right-click shopkeepers and barkeeps to <b>trade</b>. Stealing or fighting in town is a crime if seen. Rest in a bed to heal faster.');
  if (S.clock.isNight) hint('night', 'Night', 'Sight is shorter at night: a good time to <b>sneak</b> (T). Thieves and cannibals think so too.');
  if (W.money < 150) hint('broke', 'Short of chits', 'Sell what you find, <b>mine</b> ore (right-click a rock) and sell it, or collect a bounty from a town guard.');
  if (W.flags.lastRaid && S.clock.t - W.flags.lastRaid < 3600) hint('raid', 'Raiders', 'Raiders are coming for your base. Stand and fight, pay them off, or let them take what they want.');
  if (G.weatherState && (G.weatherState.kind === 'acid' || G.weatherState.kind === 'gas') && G.weatherState.intensity > 0.3) hint('hazard', 'Bad weather', 'Acid rain burns and gas chokes. Get under a roof, or wear the right gear: a gas mask, heavy hats and coats.');
}
