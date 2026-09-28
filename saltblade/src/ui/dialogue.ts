// The conversation panel: portrait, words, numbered choices.
import { h, ui, shield, esc } from './dom';
import { S } from '../sim/ctx';
import { treeFor, choose, say, DCtx, Tree } from '../sim/dialogue';
import { portrait } from '../render/portrait';
import { FACTION } from '../content/factions';
import { input } from '../core/input';
import { G } from '../state';
import { setSpeed } from '../game/control';
import { emit } from '../core/events';

let panel: HTMLDivElement | null = null;
let unKey: (() => void) | null = null;
let resume = 0;

export function closeDialogue() {
  panel?.remove();
  panel = null;
  unKey?.();
  unKey = null;
  if (resume) { setSpeed(resume); resume = 0; }
}

export function openDialogue(pid: number, nid: number, forced?: [Tree, string]) {
  const p = S.W.char(pid), n = S.W.char(nid);
  if (!p || !n) return;
  closeDialogue();
  if (G.speed) { resume = G.speed; setSpeed(0); }
  const [tree, start] = forced ?? treeFor(n, p);
  const ctx: DCtx = { p, n, vars: {} };
  n.act = 'talk'; n.actDur = 3;
  n.dir = Math.atan2(p.x - n.x, p.z - n.z);
  panel = h('div', { class: 'dlg' });
  ui().appendChild(panel);
  shield(panel);
  const show = (key: string) => {
    const node = tree[key];
    if (!node || !panel) { closeDialogue(); return; }
    node.fx?.(ctx);
    const f = FACTION[n.faction];
    panel.innerHTML = '';
    const choices = (node.ch ?? []).filter((c) => !c.if || c.if(ctx));
    const list = h('div', { class: 'dlgch' });
    choices.forEach((c, i) => {
      const b = h('button', { class: 'dlgopt' }, h('span', { class: 'num' }, `${i + 1}.`), ' ', say(c.t, ctx));
      b.onclick = () => pick(i);
      list.appendChild(b);
    });
    if (!choices.length) {
      const b = h('button', { class: 'dlgopt' }, h('span', { class: 'num' }, '1.'), ' (Leave)');
      b.onclick = () => closeDialogue();
      list.appendChild(b);
    }
    panel.append(
      h('img', { class: 'dlgport', src: portrait(n) }),
      h('div', { class: 'dlgmain' },
        h('div', { class: 'dlgwho', html: `${esc(n.name)}${n.title ? ` <span class="dim">— ${esc(n.title)}</span>` : ''} <span class="dim">· ${esc(f?.short ?? '')}</span>` }),
        h('div', { class: 'dlgtext' }, say(node.t, ctx)),
        list,
      ),
    );
    const pick = (i: number) => {
      const c = choices[i];
      if (!c) { if (!choices.length) closeDialogue(); return; }
      const next = choose(tree, c, ctx);
      emit('sound', 'click', n.x, n.z, 0.3);
      if (next === null) closeDialogue();
      else show(next);
    };
    unKey?.();
    unKey = input.onKey((code) => {
      if (code.startsWith('Digit')) { pick(+code.slice(5) - 1); return true; }
      if (code === 'Escape') { closeDialogue(); return true; }
      return false;
    });
  };
  show(start);
}

export function dialogueOpen() { return !!panel; }
