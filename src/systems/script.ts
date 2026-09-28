// Scripting API used by all story content. Conversations and cutscenes are
// plain async functions:
//
//   await talk(`
//     marta happy: Up, you lazy loaf!
//     player: Five more minutes...
//   `);
//   const c = await choose([{ id: 'go', text: 'Get up.' }, ...]);

import { G } from '../G';
import { Actor } from '../world/actor';
import { findActor, here } from '../world/world';
import { CHARS } from '../content/characters';
import { Expr, EXPRS } from '../gfx/portraits';
import { showLine, showChoices, hideDialogue, ChoiceOpt, Speaker } from '../ui/dialogue';
import { S } from '../state';
import { attr, hasPerk, addXp } from './stats';
import { playerLook } from './inventory';
import { walkTo } from './ai';
import { fadeTo } from './transition';
import { emit } from '../engine/events';
import { input } from '../engine/input';

let depth = 0; // nested conversation/cutscene count
let sceneDepth = 0;

export const wait = (secs: number) => new Promise<void>((r) => {
  let t = 0;
  const id = setInterval(() => { if (!G.paused) t += 0.05; if (t >= secs) { clearInterval(id); r(); } }, 50);
});

export function fillText(t: string): string {
  return t.replace(/\{name\}/g, S.playerName).replace(/\{NAME\}/g, S.playerName.toUpperCase());
}

export function speakerFor(who: string | Actor, expr: Expr = 'neutral'): Speaker | null {
  if (typeof who !== 'string') {
    if (who === G.player) return { key: 'player', name: S.playerName, look: playerLook(), expr };
    const def = who.charId ? CHARS[who.charId] : null;
    return { key: 'actor:' + who.id, name: def?.name || who.name, title: def?.title, look: who.look || def?.look, expr };
  }
  if (who === 'player') return { key: 'player', name: S.playerName, look: playerLook(), expr };
  if (who === 'narrator' || who === '') return null;
  const def = CHARS[who];
  if (!def) {
    const a = findActor(who);
    if (a) return speakerFor(a, expr);
    return { key: 'x:' + who, name: who, expr };
  }
  const titled = S.flags['met_' + who] || who === 'radek' || who === 'marta' || who === 'lida' ? def.title : def.title;
  return { key: 'c:' + def.id, name: def.name, title: titled, look: def.look, expr };
}

/** One line of dialogue. */
export async function say(who: string | Actor, expr: Expr | string, text: string) {
  const e = (EXPRS as string[]).includes(expr) ? (expr as Expr) : 'neutral';
  const sp = speakerFor(who, e);
  const a = typeof who === 'string' ? (who === 'player' ? G.player : here().find((x) => x.charId === who || x.id === who)) : who;
  if (a && a !== G.player && G.player) {
    // speakers turn to face whoever they talk to
    if (!a.mem.hold || a.mem.faceWhileTalking !== false) a.face(G.player.x, G.player.y);
  }
  await showLine(sp, fillText(text), !sp);
}

export async function narrate(text: string) {
  await showLine(null, fillText(text), true);
}

const LINE = /^\s*([a-z_0-9]+)(?:\s+([a-z]+))?\s*:\s*(.+)$/i;

/** Several lines, one per row: "speaker [expression]: text". Rows starting with ">" are narration. */
export async function talk(src: string) {
  const rows = src.split('\n').map((r) => r.trim()).filter(Boolean);
  for (const row of rows) {
    if (row.startsWith('>')) { await narrate(row.slice(1).trim()); continue; }
    const m = LINE.exec(row);
    if (!m) { await narrate(row); continue; }
    const [, who, maybeExpr, text] = m;
    if (maybeExpr && (EXPRS as string[]).includes(maybeExpr)) await say(who, maybeExpr, text);
    else if (maybeExpr) await say(who, 'neutral', `${maybeExpr} ${text}`);
    else await say(who, 'neutral', text);
  }
}

export interface Choice extends ChoiceOpt {
  if?: () => boolean;
  check?: { stat: 'speech' | 'strength' | 'agility' | 'vitality' | string; need: number };
}

export function checkValue(stat: string): number {
  if (stat === 'speech') {
    let v = attr('speech') + Math.round(charisma() / 3);
    if (hasPerk('silver_tongue')) v += 1;
    return v;
  }
  if (stat === 'strength' || stat === 'agility' || stat === 'vitality') return attr(stat);
  return S.skills[stat] ?? 0;
}

export function passes(stat: string, need: number) { return checkValue(stat) >= need; }

const STAT_LABEL: Record<string, string> = { speech: 'Speech', strength: 'Strength', agility: 'Agility', vitality: 'Vitality', reading: 'Reading', herbalism: 'Herbalism', alchemy: 'Alchemy', smithing: 'Smithing', sword: 'Sword', stealth: 'Stealth', thievery: 'Thievery', houndmaster: 'Hound' };

/** Presents choices; returns the chosen id. Hidden when `if` is false. */
export async function choose(opts: Choice[], who?: string | Actor, prompt?: string): Promise<string> {
  const vis = opts.filter((o) => !o.if || o.if());
  const shown: ChoiceOpt[] = vis.map((o) => {
    if (o.check) {
      const ok = passes(o.check.stat, o.check.need);
      return { ...o, tag: o.tag || `${STAT_LABEL[o.check.stat] || o.check.stat} ${o.check.need}`, tagState: ok ? 'ok' : 'fail', text: fillText(o.text) };
    }
    return { ...o, text: fillText(o.text) };
  });
  const sp = who ? speakerFor(who) : undefined;
  const id = await showChoices(shown, sp, prompt !== undefined ? fillText(prompt) : undefined);
  const picked = vis.find((o) => o.id === id);
  if (picked?.check) {
    const ok = passes(picked.check.stat, picked.check.need);
    lastCheck = ok;
    if (picked.check.stat === 'speech') addXp('speech', ok ? 4 : 1.5);
    emit('check', picked.check.stat, ok);
  }
  return id;
}

/** Result of the last skill check made through choose(). */
export let lastCheck = false;

/** Charisma from clothing, cleanliness and buffs. */
export function charisma(): number {
  let c = G.player ? G.player.combat.armor.charisma : 0;
  if (S.dirt > 60) c -= 3;
  else if (S.dirt > 35) c -= 1;
  if (S.buffs.some((b) => b.id === 'bathed' && b.until > S.minutes)) c += 2;
  if (G.player && G.player.combat.bleeding > 0) c -= 1;
  return c;
}

/** Wraps a conversation: switches to dialogue mode and restores play afterwards. */
export async function conversation(fn: () => Promise<void>) {
  depth++;
  const prev = G.mode;
  if (G.mode === 'play') G.mode = 'dialogue';
  try {
    await fn();
  } catch (e) {
    console.error('conversation failed', e);
  } finally {
    depth--;
    if (depth === 0 && sceneDepth === 0) {
      hideDialogue();
      if (G.mode === 'dialogue') G.mode = prev === 'dialogue' ? 'play' : prev;
      if (G.mode === 'cutscene') G.mode = 'play';
      input.consumeAll();
    }
  }
}

/** Wraps a cutscene: locks player control and hides parts of the HUD. */
export async function cutscene(fn: () => Promise<void>) {
  sceneDepth++;
  G.controlLocked = true;
  G.mode = 'cutscene';
  document.body.classList.add('cutscene');
  try {
    await fn();
  } catch (e) {
    console.error('cutscene failed', e);
  } finally {
    sceneDepth--;
    if (sceneDepth === 0) {
      hideDialogue();
      G.controlLocked = false;
      if (G.mode === 'cutscene' || G.mode === 'dialogue') G.mode = 'play';
      document.body.classList.remove('cutscene');
      G.cam.follow = null; G.cam.lockX = null; G.cam.lockY = null; G.cam.speed = 8;
      input.consumeAll();
    }
  }
}

export const inScene = () => sceneDepth > 0 || depth > 0;

/** Finds a named actor on the current map (by character id or actor id). */
export function actor(id: string): Actor {
  const a = here().find((x) => x.charId === id || x.id === id) || findActor(id);
  if (!a) throw new Error('actor not found: ' + id);
  return a;
}
export function maybeActor(id: string): Actor | undefined {
  return here().find((x) => x.charId === id || x.id === id) || findActor(id);
}

/** Moves an actor (tile coordinates) and waits for arrival. */
export function go(a: Actor | string, tx: number, ty: number, run = false) {
  const ac = typeof a === 'string' ? actor(a) : a;
  return walkTo(ac, tx * 16 + 8, ty * 16 + 12, { run });
}
export function goPx(a: Actor | string, x: number, y: number, run = false) {
  const ac = typeof a === 'string' ? actor(a) : a;
  return walkTo(ac, x, y, { run });
}

export function hold(a: Actor | string, on = true) {
  const ac = typeof a === 'string' ? actor(a) : a;
  ac.mem.hold = on;
  if (on) { ac.pose = 'idle'; ac.mem.path = null; }
}

export async function camTo(x: number, y: number, speed = 3) {
  G.cam.lockX = x; G.cam.lockY = y; G.cam.speed = speed;
  await wait(Math.min(2.5, 2 / speed + 0.3));
}
export function camFollow(a: Actor | null) {
  G.cam.lockX = null; G.cam.lockY = null; G.cam.follow = a; G.cam.speed = 8;
}

export async function blackout(secs: number) {
  await fadeTo(1, 0.6);
  await wait(secs);
}
export async function unblack() { await fadeTo(0, 0.8); }
