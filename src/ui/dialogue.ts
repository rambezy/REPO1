// The dialogue box: portrait with talking/blinking animation, typewriter
// text, and choices navigable by keyboard, mouse, touch or gamepad.

import { UI, el } from './ui';
import { input } from '../engine/input';
import { getPortrait, Expr, PORTRAIT_SIZE } from '../gfx/portraits';
import { Look } from '../gfx/characters';
import { sfx } from '../audio/sfx';
import { G } from '../G';

export interface Speaker { key: string; name: string; title?: string; look?: Look; expr: Expr }

export interface ChoiceOpt {
  id: string;
  text: string;
  tag?: string;
  tagState?: 'ok' | 'fail' | 'neutral';
  used?: boolean;
  locked?: boolean;
}

let box: HTMLElement | null = null;
let portraitCanvas: HTMLCanvasElement | null = null;
let whoEl: HTMLElement, textEl: HTMLElement, choicesEl: HTMLElement, moreEl: HTMLElement;
let current: Speaker | null = null;
let typing = false;
let fullHTML = '';
let shown = 0;
let plain = '';
let blinkT = 2;
let talkFrame = false;
let talkT = 0;
export const dlgSettings = { speed: 55 }; // characters per second

function ensureBox() {
  if (box) return;
  box = el('div', { id: 'dialogue', cls: 'iron-panel' });
  const pWrap = el('div', { cls: 'portrait' });
  portraitCanvas = el('canvas');
  portraitCanvas.width = PORTRAIT_SIZE;
  portraitCanvas.height = PORTRAIT_SIZE;
  pWrap.appendChild(portraitCanvas);
  const body = el('div', { cls: 'body' });
  whoEl = el('div', { cls: 'who' });
  textEl = el('div', { cls: 'text' });
  choicesEl = el('div', { cls: 'choices' });
  moreEl = el('div', { cls: 'more', html: '▼' });
  body.append(whoEl, textEl, choicesEl);
  box.append(pWrap, body, moreEl);
  box.addEventListener('click', () => { if (!choicesEl.childElementCount) advancePressed = true; });
  UI.root.appendChild(box);
  document.body.classList.add('dialogue-open');
}

export function hideDialogue() {
  if (box) { box.remove(); box = null; }
  current = null;
  document.body.classList.remove('dialogue-open');
}
export const dialogueVisible = () => !!box;

let advancePressed = false;

function drawPortrait() {
  if (!portraitCanvas || !current || !current.look) return;
  const ctx = portraitCanvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const blink = blinkT < 0.12 && current.expr !== 'laugh' && current.expr !== 'sleep';
  const img = getPortrait(current.key, current.look, current.expr, typing && talkFrame, blink);
  ctx.clearRect(0, 0, PORTRAIT_SIZE, PORTRAIT_SIZE);
  ctx.drawImage(img, 0, 0);
}

/** Per-frame animation (typewriter, mouth, blink). */
export function updateDialogue(dt: number) {
  if (!box) return;
  blinkT -= dt;
  if (blinkT < 0) blinkT = 2 + Math.random() * 3;
  if (typing) {
    talkT += dt;
    if (talkT > 0.11) { talkT = 0; talkFrame = !talkFrame; }
    const before = shown;
    shown = Math.min(plain.length, shown + dt * dlgSettings.speed * (input.down('confirm') ? 3 : 1));
    if (Math.floor(shown) !== Math.floor(before)) renderPartial();
    if (shown >= plain.length) { typing = false; talkFrame = false; renderPartial(); }
  }
  drawPortrait();
  moreEl.style.visibility = !typing && !choicesEl.childElementCount ? 'visible' : 'hidden';
}

function renderPartial() {
  // Reveal HTML progressively by counting visible characters.
  let count = Math.floor(shown);
  let out = '';
  let i = 0;
  while (i < fullHTML.length && count > 0) {
    if (fullHTML[i] === '<') {
      const j = fullHTML.indexOf('>', i);
      out += fullHTML.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (fullHTML[i] === '&') {
      const j = fullHTML.indexOf(';', i);
      out += fullHTML.slice(i, j + 1);
      i = j + 1;
      count--;
      continue;
    }
    out += fullHTML[i++];
    count--;
  }
  // close any open tags crudely
  const opens = (out.match(/<(em|span)[^>]*>/g) || []).length;
  const closes = (out.match(/<\/(em|span)>/g) || []).length;
  for (let k = 0; k < opens - closes; k++) out += out.lastIndexOf('<em') > out.lastIndexOf('<span') ? '</em>' : '</span>';
  textEl.innerHTML = out;
}

function setSpeaker(sp: Speaker | null, narration: boolean) {
  ensureBox();
  current = sp;
  box!.classList.toggle('narration', narration || !sp || !sp.look);
  whoEl.innerHTML = sp && !narration ? `<span>${sp.name}</span>${sp.title ? `<small>${sp.title}</small>` : ''}` : '';
  whoEl.style.display = sp && !narration ? '' : 'none';
}

export function formatText(t: string): string {
  return t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="hl">$1</span>');
}

interface PendingLine { resolve: () => void }
interface PendingChoice { opts: ChoiceOpt[]; sel: number; buttons: HTMLButtonElement[]; resolve: (id: string) => void; done: boolean }
let pendingLine: PendingLine | null = null;
let pendingChoice: PendingChoice | null = null;

/** Shows a line and resolves when the player advances. */
export function showLine(sp: Speaker | null, text: string, narration = false): Promise<void> {
  setSpeaker(sp, narration);
  choicesEl.innerHTML = '';
  fullHTML = formatText(text);
  plain = fullHTML.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '_');
  shown = 0;
  typing = true;
  textEl.innerHTML = '';
  advancePressed = false;
  input.consumeAll();
  return new Promise((resolve) => { pendingLine = { resolve }; });
}

/** Shows choices under the current text and resolves with the chosen id. */
export function showChoices(opts: ChoiceOpt[], sp?: Speaker | null, prompt?: string): Promise<string> {
  if (sp !== undefined || prompt !== undefined) {
    setSpeaker(sp ?? current, !sp && !current);
    if (prompt !== undefined) { fullHTML = formatText(prompt); plain = fullHTML.replace(/<[^>]+>/g, ''); }
  } else ensureBox();
  typing = false;
  shown = plain.length;
  renderPartial();
  choicesEl.innerHTML = '';
  let sel = opts.findIndex((o) => !o.locked && !o.used);
  if (sel < 0) sel = Math.max(0, opts.findIndex((o) => !o.locked));
  const pc: PendingChoice = { opts, sel, buttons: [], resolve: () => {}, done: false };
  opts.forEach((o, i) => {
    const b = el('button', { cls: 'choice' + (o.used ? ' used' : '') + (o.locked ? ' locked' : '') });
    b.innerHTML = `<span class="num">${i + 1}</span>${o.tag ? `<span class="tag ${o.tagState || ''}">${o.tag}</span>` : ''}${formatText(o.text)}`;
    b.addEventListener('click', (e) => { e.stopPropagation(); pickChoice(i); });
    b.addEventListener('mouseenter', () => { pc.sel = i; highlightChoices(); });
    choicesEl.appendChild(b);
    pc.buttons.push(b);
  });
  input.consumeAll();
  return new Promise((resolve) => {
    pc.resolve = resolve;
    pendingChoice = pc;
    highlightChoices();
  });
}

function highlightChoices() {
  if (!pendingChoice) return;
  pendingChoice.buttons.forEach((b, i) => b.classList.toggle('sel', i === pendingChoice!.sel));
}

function pickChoice(i: number) {
  const pc = pendingChoice;
  if (!pc || pc.done) return;
  if (pc.opts[i]?.locked) { sfx('fail'); return; }
  pc.done = true;
  pendingChoice = null;
  sfx('ui');
  choicesEl.innerHTML = '';
  input.consumeAll();
  pc.resolve(pc.opts[i].id);
}

/** Input handling for the dialogue box; runs every frame from the main loop. */
export function dialogueInput() {
  if (!box) {
    if (pendingLine) { const r = pendingLine.resolve; pendingLine = null; r(); }
    if (pendingChoice) { const pc = pendingChoice; pendingChoice = null; pc.resolve(pc.opts[0]?.id ?? ''); }
    return;
  }
  if (pendingChoice) {
    const pc = pendingChoice;
    if (input.pressed('up')) { pc.sel = (pc.sel - 1 + pc.opts.length) % pc.opts.length; highlightChoices(); sfx('ui', undefined, undefined, 0.4); }
    if (input.pressed('down')) { pc.sel = (pc.sel + 1) % pc.opts.length; highlightChoices(); sfx('ui', undefined, undefined, 0.4); }
    for (const ch of input.typedChars) {
      const n = parseInt(ch, 10);
      if (n >= 1 && n <= pc.opts.length) { pickChoice(n - 1); return; }
    }
    if (input.pressed('confirm') || input.pressed('interact')) pickChoice(pc.sel);
    return;
  }
  if (pendingLine) {
    const pressed = advancePressed || input.pressed('confirm') || input.pressed('interact') || input.pressed('attack');
    if (pressed || autoAdvance) {
      advancePressed = false;
      input.consume('confirm'); input.consume('interact'); input.consume('attack');
      if (typing && !autoAdvance) { shown = plain.length; typing = false; renderPartial(); }
      else { const r = pendingLine.resolve; pendingLine = null; sfx('page', undefined, undefined, 0.4); r(); }
    }
  }
}

/** Test hook: automatically advance all lines. */
export let autoAdvance = false;
export function setAutoAdvance(v: boolean) { autoAdvance = v; }
export { G };
