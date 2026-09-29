// Conversation window with a talking-head portrait and numbered replies.

import { G, player } from '../game/G';
import { el, esc } from '../core/util';
import { DIALOGUES } from '../content/registry';
import type { Actor, DialogueDef, DialogueOption, Ctx } from '../game/types';
import { ctx, setSpeaker } from '../game/script';
import { button, closeModal, openModal, topModal } from './common';
import { drawPortrait } from '../render/portrait';
import { lookOf } from '../game/actors';
import { stat, skill } from '../game/character';
import { chance } from '../core/rng';
import { msg, emit } from '../game/log';
import { SKILL_INFO, STAT_INFO } from '../data/stats';
import { sfx } from '../audio/sfx';
import { startCombat, aggro } from '../game/combat';

let win: HTMLElement | null = null;
let def: DialogueDef | null = null;
let speaker: Actor | undefined;
let portraitCanvas: HTMLCanvasElement;
let anim = 0;
let talkUntil = 0;
let keyHandler: ((e: KeyboardEvent) => void) | null = null;

export function openDialogue(id: string, a?: Actor) {
  const d = DIALOGUES[id];
  if (!d) {
    msg(`[missing dialogue ${id}]`);
    return;
  }
  if (topModal() === 'dialogue') closeDialogue();
  def = d;
  speaker = a;
  setSpeaker(a);
  win = el('div', 'panel win dlg');
  openModal('dialogue', win, { noBackClose: true, onClose: onClosed });
  const c = ctx();
  const start = typeof d.start === 'function' ? d.start(c) : d.start;
  show(start);
  const loop = () => {
    if (!win) return;
    paintPortrait();
    anim = requestAnimationFrame(loop);
  };
  anim = requestAnimationFrame(loop);
  keyHandler = (e: KeyboardEvent) => {
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= 9) {
      const opt = win?.querySelectorAll<HTMLElement>('.opt')[n - 1];
      opt?.click();
    }
  };
  window.addEventListener('keydown', keyHandler);
}

function onClosed() {
  cancelAnimationFrame(anim);
  if (keyHandler) window.removeEventListener('keydown', keyHandler);
  keyHandler = null;
  win = null;
  def = null;
  setSpeaker(undefined);
  emit('hud');
}

export function closeDialogue() {
  if (topModal() === 'dialogue') closeModal('dialogue');
}

function paintPortrait() {
  if (!portraitCanvas || !def) return;
  const c = portraitCanvas.getContext('2d')!;
  const base = speaker ? lookOf(speaker) : { body: 'human' as const };
  const look = { ...base, ...(def.portrait ?? {}) } as any;
  drawPortrait(c, portraitCanvas.width, portraitCanvas.height, look, def.id + (speaker?.uid ?? ''), performance.now() / 1000, performance.now() < talkUntil);
}

function visible(o: DialogueOption, c: Ctx): boolean {
  const int = stat(player(), 'INT');
  if (o.lowInt && int > 3) return false;
  if (!o.lowInt && int <= 3 && o.normalInt !== false && !o.end && !o.any) {
    // Low intelligence characters only see options marked lowInt, plus exits.
    return false;
  }
  if (o.stat && stat(player(), o.stat.key) < o.stat.min) return false;
  if (o.if && !o.if(c)) return false;
  return true;
}

function show(nodeId: string) {
  if (!win || !def) return;
  if (nodeId === 'end' || nodeId === '__end') {
    closeDialogue();
    return;
  }
  const node = def.nodes[nodeId];
  if (!node) {
    msg(`[missing node ${nodeId}]`);
    closeDialogue();
    return;
  }
  const c = ctx();
  node.onEnter?.(c);
  if (!win) return; // onEnter may have closed the dialogue
  const text = typeof node.text === 'function' ? node.text(c) : node.text;
  talkUntil = performance.now() + Math.min(4000, 400 + text.length * 25);
  win.innerHTML = '';
  const top = el('div', 'top');
  const pw = el('div', 'portrait screen');
  portraitCanvas = el('canvas') as HTMLCanvasElement;
  portraitCanvas.width = 200;
  portraitCanvas.height = 200;
  pw.appendChild(portraitCanvas);
  const who = def.name ?? speaker?.name ?? '';
  const reply = el('div', 'reply screen', `<span class="who">${esc(who)}</span>${fmt(text)}`);
  top.append(pw, reply);
  win.appendChild(top);
  const opts = el('div', 'opts screen');
  let n = 0;
  let list = node.options.filter((o) => visible(o, c));
  if (!list.length) {
    // Always provide a way out.
    list = [{ text: stat(player(), 'INT') <= 3 ? 'Uh... bye.' : '[Leave]', end: true }];
  }
  for (const o of list) {
    n++;
    let t = typeof o.text === 'function' ? o.text(c) : o.text;
    if (o.skill && !t.startsWith('[')) t = `[${SKILL_INFO[o.skill.key].name}] ${t}`;
    if (o.stat && !t.startsWith('[')) t = `[${STAT_INFO[o.stat.key].name}] ${t}`;
    const row = el('div', 'opt', `<span class="n">${n}.</span><span>${esc(t)}</span>`);
    row.onclick = () => choose(o);
    opts.appendChild(row);
  }
  win.appendChild(opts);
  const bottom = el('div', 'bottom');
  if (speaker?.barter) bottom.appendChild(button('Barter', () => {
    const s = speaker!;
    closeDialogue();
    import('./barter').then((b) => b.openBarter(s));
  }, 'small'));
  else bottom.appendChild(el('span'));
  bottom.appendChild(el('span', '', `<small style="color:#a89868">Press 1-${n} to choose</small>`));
  win.appendChild(bottom);
}

function fmt(s: string): string {
  return esc(s).replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>');
}

function choose(o: DialogueOption) {
  sfx('click');
  const c = ctx();
  let next = o.to;
  if (o.skill) {
    const pct = Math.max(5, Math.min(95, skill(player(), o.skill.key) - o.skill.diff));
    const ok = chance(pct);
    if (!ok) next = o.fail ?? next;
    else if (!(G.state.flags['skillxp:' + (def?.id ?? '') + ':' + o.skill.key + ':' + o.to])) {
      G.state.flags['skillxp:' + (def?.id ?? '') + ':' + o.skill.key + ':' + o.to] = true;
      import('../game/progress').then((p) => p.giveXp(Math.max(25, o.skill!.diff * 2)));
    }
    if (!ok && !o.fail) {
      msg('Your attempt fails.');
    }
  }
  o.do?.(c);
  if (!win) return; // an action closed the dialogue (e.g. travel or combat)
  if (o.combat) {
    const s = speaker;
    closeDialogue();
    if (s) {
      aggro(s);
      s.hostile = true;
      startCombat(s);
    }
    return;
  }
  if (o.barter) {
    const s = speaker;
    closeDialogue();
    if (s) import('./barter').then((b) => b.openBarter(s));
    return;
  }
  if (o.end || !next) {
    closeDialogue();
    return;
  }
  show(next);
}

/** Minimal orders menu for companions without their own dialogue. */
export function openCompanionMenu(a: Actor) {
  const id = '__companion';
  DIALOGUES[id] = {
    id,
    start: 'main',
    nodes: {
      main: {
        text: (c) => `${a.name} looks at you. "What do you need?"`,
        options: [
          { text: 'Let me see what you\'re carrying.', any: true, do: () => tradeWith(a), end: true },
          { text: 'Wait here.', any: true, do: () => ((a as any)._wait = true), end: true },
          { text: 'Follow me.', any: true, do: () => ((a as any)._wait = false), end: true },
          { text: 'Part ways (leave the party).', any: true, do: () => { import('../game/party').then((p) => p.dismiss(a)); }, end: true },
          { text: 'Never mind.', end: true },
        ],
      },
    },
  };
  openDialogue(id, a);
}

function tradeWith(a: Actor) {
  // Companions share freely: open a loot screen of their pack (no steal checks).
  setTimeout(() => import('./loot').then((l) => l.openLoot({ kind: 'body', actor: a })), 60);
}
