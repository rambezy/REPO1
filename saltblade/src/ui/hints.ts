// First-time hints: a short card the first time something matters. The two
// start cards ("Your people", then the start's first steps) come first in
// every new game; situational cards queue behind them by priority, and the
// queue waits while a window, menu or conversation is open. Each situational
// card is shown once per browser; the start cards once per game.
import { h, ui, esc, anyOpen } from './dom';
import { keymap, ActionId, withKeys } from '../core/keys';
import { G } from '../state';
import { S } from '../sim/ctx';
import { on } from '../core/events';
import { uiSound } from '../audio';
import { input } from '../core/input';
import { SCENARIO } from '../content/scenarios';
import { NOTE } from '../content/notes';
import { shopGrid } from '../sim/shops';
import { menuOpen } from './menu';
import { dialogueOpen } from './dialogue';
import { menuOpen as contextMenuOpen } from '../game/control';
import type { Char } from '../sim/char';

/** `still` is checked when the card's turn comes: a card about something no longer so is dropped, not shown late. */
interface Card { key: string; title: string; text: string; pri: number; perGame?: boolean; still?: () => boolean; }
/** Lower comes first: the start card, the start's first steps, field notes, then tips. */
const PRI = { start: 0, steps: 1, note: 2, tip: 3 };

/** The first key bound to an action, for a hint's text. */
const kb = (a: ActionId) => esc(keymap.labels(a)[0] ?? '?');

const seen = new Set<string>();
let box: HTMLDivElement | null = null;
let queue: Card[] = [];
let hidden = false; // the card is up but something is in front of it
let hold = 0; // real seconds before the next card may show
let t = 0; // real seconds to the next look round

function load() {
  try { for (const k of JSON.parse(localStorage.getItem('sb-hints') ?? '[]')) seen.add(k); } catch { /* none */ }
}
function save() {
  try { localStorage.setItem('sb-hints', JSON.stringify([...seen])); } catch { /* private mode */ }
}

function enqueue(card: Card) {
  let i = queue.length;
  while (i > 0 && queue[i - 1].pri > card.pri) i--;
  queue.splice(i, 0, card);
}

/** A hint shown once per browser. Names in `text` must already be escaped. A card with a `still` test that fails by its turn is dropped and can come again. */
export function hint(key: string, title: string, text: string, pri = PRI.tip, still?: () => boolean) {
  if (seen.has(key) || G.settings?.hints === false) return;
  seen.add(key);
  save();
  enqueue({ key, title, text, pri, still });
}
/** A situational tip that only stands while it is true. */
const tip = (key: string, title: string, text: string, still: () => boolean) => hint(key, title, text, PRI.tip, still);

/** The next card worth showing: one gone stale while it waited is forgotten, to come again if it is ever true again. */
function next(): Card | undefined {
  while (queue.length) {
    const card = queue.shift()!;
    let ok = true;
    try { ok = !card.still || card.still(); } catch { ok = false; }
    if (ok) return card;
    if (!card.perGame) { seen.delete(card.key); save(); }
  }
  return undefined;
}

/** A card shown once per game (remembered in the save when it is shown), so every new start opens with it. */
function startCard(key: string, title: string, text: string, pri: number) {
  const shown: string[] | undefined = S.W.flags.hints;
  if (!shown || shown.includes(key) || G.settings?.hints === false) return;
  enqueue({ key, title, text, pri, perGame: true });
}

function show(card: Card) {
  if (card.perGame) { const shown: string[] | undefined = S.W.flags.hints; if (shown && !shown.includes(card.key)) shown.push(card.key); }
  hidden = false;
  const ok = h('button', { class: 'tbtn small' }, 'Got it');
  const off = h('button', { class: 'hintoff' }, 'No more hints');
  box = h('div', { class: 'hintbox', role: 'status' }, h('div', { class: 'hinttitle' }, card.title), h('div', { class: 'hinttext', html: card.text }), h('div', { class: 'hintbtns' }, off, ok));
  for (const ev of ['mousedown', 'mouseup', 'wheel', 'contextmenu']) box.addEventListener(ev, (e) => e.stopPropagation());
  box.onclick = (e) => { e.stopPropagation(); close(); };
  off.onclick = (e) => {
    e.stopPropagation();
    if (G.settings) G.settings.hints = false;
    queue = [];
    close();
    try { const s = JSON.parse(localStorage.getItem('sb-settings') ?? '{}'); s.hints = false; localStorage.setItem('sb-settings', JSON.stringify(s)); } catch { /* ignore */ }
  };
  ui().appendChild(box);
  uiSound('notify');
}

function close() {
  box?.remove();
  box = null;
  hold = 0.6;
}

/** Something is open that a card would get in the way of (the captive card too, which shares its corner on narrow screens). */
const blocked = () => anyOpen() || menuOpen() || dialogueOpen() || contextMenuOpen() || !!document.querySelector('.capcard');

export function setupHints() {
  load();
  // back to the title, or a fresh world: nothing from the old game lingers
  on('world:reset', () => { queue = []; box?.remove(); box = null; });
  // a window, a conversation or the menu opening puts the card away at once, before the next frame looks round
  for (const ev of ['ui:char', 'ui:build', 'ui:research', 'ui:map', 'ui:factions', 'ui:log', 'ui:codex', 'ui:inspect', 'ui:trade', 'ui:loot', 'ui:talk', 'ui:object', 'ui:read', 'ui:menu']) {
    on(ev, () => { if (box && !hidden) { hidden = true; box.style.display = 'none'; } });
  }
  on('game:start', () => {
    queue = [];
    box?.remove(); box = null;
    hold = 1.5;
    t = 6;
    if (input.touch || matchMedia('(pointer: coarse)').matches) startCard('start', 'Your people', 'Your people are the portraits at the bottom. <b>Tap</b> to select; <b>press and hold</b> the ground to walk there, or someone for things to do. Drag to look, pinch to zoom.', PRI.start);
    else startCard('start', 'Your people', `Your people are the portraits at the bottom. <b>Left-click</b> selects (drag for several); <b>right-click</b> the ground to walk there, or someone for things to do. <b>${kb('pause')}</b> pauses, <b>${kb('speed1')}–${kb('speed4')}</b> set the speed, and <b>${kb('travel')}</b> speeds up a long walk.`, PRI.start);
    // what to do first, for the way this game began
    const sc = SCENARIO[S.W.flags.scenario];
    if (sc?.firstSteps) startCard('first_' + sc.key, 'First steps', sc.firstSteps.replace(/\{(\w+)\}/g, (m) => esc(withKeys(m))), PRI.steps);
  });
  on('ui:talk', () => hint('talk', 'Talking', 'People remember how you treat them. Recruits drink in bars: some join for free, some want paying.'));
  on('ui:trade', (pid: number, nid: number) => {
    hint('trade', 'Trading', 'Drag items between your pack and the shop (right-click for a whole stack). Prices follow the trader and your standing with their people.');
    // the harder trades, the first time they are seen for sale
    const n = S.W.char(nid);
    const sh = n && S.W.shops.get(+n.shop);
    const stock = sh ? shopGrid(sh) : null;
    if (stock?.first((d) => !!d.drug)) note('drugs');
    if (stock?.first((d) => !!d.limb)) note('limbs');
  });
  on('ui:loot', (looter: number, target: { char?: number }) => {
    const c = target?.char ? S.W.char(target.char) : null;
    if (c?.inv.first((d) => !!d.drug)) note('drugs');
  });
  on('fx:ko', (c: Char) => { if (c.robot && c.faction !== 'player') note('machines'); });
  on('fx:ko', (c: Char) => { if (c.faction === 'player') tip('ko', 'Knocked out', `${esc(c.name)} is down. They wake when their wounds allow; another of yours can <b>pick them up</b> (right-click) or give <b>First aid</b>.`, () => c.status === 'ko'); });
  on('ui:build', () => hint('build', 'Building', 'Place a site, then right-click it with someone selected to <b>Build</b>. Materials come from nearby storage or packs. No building in towns, except furniture in a house of your own.'));
}

const NOTE_TEXT: Record<string, string> = {
  limbs: 'A lost limb can be replaced with a <b>prosthetic</b>: fit it from the pack (<b>I</b>) near a Robotics Bench or a robotics shop. Metal never bleeds; when it is wrecked, a <b>repair kit</b> mends it.',
  drugs: 'Drugs are taken from the pack (<b>I</b>, right-click). Each lifts some skills for hours, then crashes, and every dose feeds a <b>habit</b>. The <b>Covenant</b> arrests those who carry them.',
  machines: 'The Old Machines guard the Makers\' <b>foundries</b>. They fire beams and never heal. A downed machine can be <b>salvaged</b> for parts or, with Robotics, <b>reprogrammed</b> to fight for you (right-click it).',
  law: 'The Covenant searched your packs. Their patrols stop travellers <b>once a day</b>; a <b>smuggler pack</b> hides most of its load, and a bribe sometimes works.',
};

/** Writes a field note into the Codex (once) and points at it. */
function note(key: string) {
  const got: string[] = (S.W.flags.notes ??= []);
  if (got.includes(key)) return;
  got.push(key);
  // the notes name the character window's key as I; the live binding goes in its place
  hint('note_' + key, NOTE[key]?.title ?? key, `${(NOTE_TEXT[key] ?? '').replaceAll('<b>I</b>', `<b>${kb('char')}</b>`)} <span class="dim">(Codex, <b>${kb('codex')}</b>: Field notes.)</span>`, PRI.note);
}

/** Shows the next card when nothing is in the way, and looks for situations worth one every couple of seconds. */
export function tickHints(dt: number) {
  if (G.mode !== 'play') { if (box) { box.remove(); box = null; } return; }
  const busy = blocked();
  if (box && busy !== hidden) { hidden = busy; box.style.display = busy ? 'none' : ''; }
  hold -= dt;
  if (!box && !busy && hold <= 0 && queue.length) { const card = next(); if (card) show(card); }
  t -= dt;
  if (t > 0) return;
  t = 2;
  const W = S.W;
  const mine = W.playerChars();
  // each card names one of yours, and only stands while it is still so of them (or, unnamed, of any of yours)
  const ours = (f: (c: Char) => boolean) => () => W.playerChars().some((c) => c.alive && f(c));
  for (const c of mine) {
    if (!c.alive) continue;
    const name = esc(c.name);
    const still = (f: (c: Char) => boolean) => () => c.alive && W.char(c.id) === c && f(c);
    if (c.hunger < 100 && !c.robot && !c.animal) tip('hunger', 'Hunger', `${name} is hungry. Eat from the pack (<b>${kb('char')}</b>, right-click food) or buy food in town. The starving fight badly and faint.`, still((x) => x.hunger < 100));
    if (c.body.bleeding() > 0.05 && c.up) tip('bleed', 'Bleeding', `${name} is bleeding. Right-click them, <b>First aid</b>: it takes bandages or a kit from someone's pack.`, still((x) => x.body.bleeding() > 0.02));
    if (c.carrying) tip('carry', 'Carrying', `Right-click a bed to lay them down, a cage to lock them in, or press <b>${kb('drop')}</b> to put them down.`, ours((x) => !!x.carrying));
    if (c.load() > 1) tip('load', 'Overloaded', `${name} is carrying too much and slows down. Heavy loads do build strength.`, still((x) => x.load() > 1));
    if (Object.values(c.bounty).some((v) => v > 0)) tip('wanted', 'Wanted', 'Someone saw a crime. That faction\'s guards will try an arrest. Pay a guard, lie low, or fight.', ours((x) => Object.values(x.bounty).some((v) => v > 0)));
    if (c.shackled) tip('shackles', 'Shackles', 'Shackled people move slowly. Select them and right-click themselves (or a friend) to <b>pick the shackles</b>, best unseen.', ours((x) => x.shackled));
    // the harder trades, the first time they are lived with
    const b = c.body;
    if ([3, 4, 5, 6].some((l) => !b.has(l) || b.isProst(l))) note('limbs');
    const wrecked = (x: Char) => [3, 4, 5, 6].some((l) => x.body.isProst(l) && x.body.hp[l] <= 0);
    if (wrecked(c)) tip('wrecked', 'Wrecked limb', `${name}'s prosthetic is wrecked. Right-click them, <b>First aid</b>, with a repair kit or solder in a pack.`, still(wrecked));
    if (c.mem.high || c.mem.habit || c.mem.craving) note('drugs');
    if (c.mem.craving) tip('craving', 'Withdrawal', `${name} is craving. Withdrawal dulls hands, eyes and arms until it is fed or fades. The badly hooked take what is in the pack.`, still((x) => !!x.mem.craving));
    const inTown = (x: Char) => S.T.siteAt(x.x, x.z, 40)?.kind === 'town';
    const site = S.T.siteAt(c.x, c.z, 20);
    if (site?.kind === 'town' && W.discovered.has(site.id)) tip('town', 'Towns', 'Right-click shopkeepers and barkeeps to <b>trade</b>. Crimes seen in town are crimes. Beds heal faster; some houses are <b>for sale</b> (the sign by the door).', ours(inTown));
  }
  if (W.flags.searched) note('law');
  if (S.T.sites.some((s) => s.kind === 'foundry' && W.discovered.has(s.id)) || W.flags.salvaged) note('machines');
  else if (W.active.some((o) => o.faction === 'machines' && o.alive && mine.some((c) => c.alive && Math.abs(c.x - o.x) < 45 && Math.abs(c.z - o.z) < 45))) note('machines');
  if (S.clock.isNight) tip('night', 'Night', `Sight is short at night: good for <b>sneaking</b> (${kb('sneak')}). Thieves and cannibals think so too.`, () => S.clock.isNight);
  if (W.money < 150) tip('broke', 'Short of chits', 'Sell what you find, <b>mine</b> ore (right-click a rock) and sell it, or take a bounty from a town guard.', () => S.W.money < 150);
  const raiding = () => !!S.W.flags.lastRaid && S.clock.t - S.W.flags.lastRaid < 3600;
  if (raiding()) tip('raid', 'Raiders', 'Raiders are coming for your base. Fight, pay them off, or let them take what they want.', raiding);
  const foul = () => !!G.weatherState && (G.weatherState.kind === 'acid' || G.weatherState.kind === 'gas') && G.weatherState.intensity > 0.2;
  if (foul() && G.weatherState!.intensity > 0.3) tip('hazard', 'Bad weather', 'Acid rain burns and gas chokes. Get under a roof, or wear a gas mask and heavy gear.', foul);
}
