// The alchemy bench: follow a recipe step by step. Pour a base, grind herbs
// in the mortar, add them, boil, and bottle. Mistakes make a Suspicious Brew.

import { openScreen, el, button } from '../ui';
import { S } from '../../state';
import { RECIPES, Step, stepText, Recipe } from '../../content/recipes';
import { item } from '../../content/items';
import { iconURL } from '../../gfx/icons';
import { count, removeItem, addItem } from '../../systems/inventory';
import { addXp, hasPerk, skill } from '../../systems/stats';
import { notify, esc } from '../notify';
import { sfx } from '../../audio/sfx';
import { makeCanvas } from '../../gfx/pixel';
import { P } from '../../gfx/palette';
import { emit } from '../../engine/events';
import { G } from '../../G';

function sameSteps(a: Step[], b: Step[]): number {
  // returns number of mismatches (Infinity if lengths differ by more than one)
  if (Math.abs(a.length - b.length) > 1) return Infinity;
  let bad = Math.abs(a.length - b.length);
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    if (x.op !== y.op) { bad++; continue; }
    if (x.op === 'base' && y.op === 'base' && x.liquid !== y.liquid) bad++;
    if (x.op === 'add' && y.op === 'add' && (x.herb !== y.herb || x.n !== y.n || x.ground !== y.ground)) bad++;
  }
  return bad;
}

export function openAlchemy() {
  const log: Step[] = [];
  let mortar: { herb: string; grind: number }[] = [];
  let selected: Recipe | null = RECIPES[S.recipes[0]] || null;
  let bubble = 0;
  let raf = 0;
  openScreen('alchemy', (close) => {
    const m = el('div', { cls: 'vellum mg' });
    m.style.width = 'min(1040px, 100%)';
    m.append(el('h2', { html: 'Alchemy' }));
    m.append(el('p', { cls: 'help', html: 'Follow the recipe exactly. Herbs go into the mortar to be ground, or straight into the pot whole. Every step matters, and so does the order.' }));
    const grid = el('div', { cls: 'cols' });
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'minmax(0,1fr) minmax(0,1.1fr) minmax(0,1fr)';
    grid.style.gap = '14px';
    const left = el('div'), mid = el('div'), right = el('div');
    grid.append(left, mid, right);
    m.append(grid);
    const cv = makeCanvas(160, 110);
    cv.style.width = '100%';
    cv.style.maxWidth = '320px';
    const render = () => {
      // recipes
      left.innerHTML = '<h3>Recipes you know</h3>';
      if (!S.recipes.length) left.append(el('p', { html: '<i>You know no recipes. Someone must teach you, or you must read one.</i>' }));
      for (const id of S.recipes) {
        const r = RECIPES[id];
        if (!r) continue;
        const b = button(esc(r.name), () => { selected = r; render(); }, 'quest-item' + (selected === r ? ' sel' : ''));
        left.append(b);
      }
      if (selected) {
        const ol = el('ol');
        ol.style.paddingLeft = '18px';
        selected.steps.forEach((s, i) => {
          const li = el('li', { html: esc(stepText(s)) });
          if (i < log.length) li.style.color = sameSteps(log.slice(0, i + 1), selected!.steps.slice(0, i + 1)) === 0 ? 'var(--linden)' : 'var(--madder)';
          ol.append(li);
        });
        left.append(el('h3', { html: esc(selected.name) }), ol);
      }
      // bench
      mid.innerHTML = '<h3>The cauldron</h3>';
      mid.append(cv);
      const base = log.find((s) => s.op === 'base') as { op: 'base'; liquid: string } | undefined;
      const boils = log.filter((s) => s.op === 'boil').length;
      mid.append(el('p', { cls: 'meta', html: `Base: ${base ? base.liquid : 'empty'} · Boiled ${boils}× · Steps taken: ${log.length}` }));
      const acts = el('div', { cls: 'actions' });
      acts.append(
        button('Pour water', () => { if (log.length) { notify('Empty the cauldron first.', 'bad', 1500); return; } log.push({ op: 'base', liquid: 'water' }); sfx('splash'); render(); }),
        button(`Pour wine (${count('wine')})`, () => { if (log.length) { notify('Empty the cauldron first.', 'bad', 1500); return; } if (!count('wine')) { notify('You have no wine.', 'bad', 1500); return; } removeItem('wine', 1); log.push({ op: 'base', liquid: 'wine' }); sfx('splash'); render(); }),
        button('Boil', () => { if (!base) { notify('Pour a base first.', 'bad', 1500); return; } log.push({ op: 'boil' }); bubble = 2.5; sfx('fire'); render(); }),
        button('Bottle it', () => bottle(close), 'btn primary'),
        button('Empty the pot', () => { log.length = 0; mortar = []; render(); }),
      );
      mid.append(acts);
      // mortar
      const mt = el('div', { cls: 'perk' });
      mt.append(el('b', { html: 'Mortar & pestle' }));
      if (!mortar.length) mt.append(el('p', { html: '<i>Empty.</i>' }));
      else {
        mt.append(el('p', { html: mortar.map((x) => `${esc(item(x.herb).name)} ${x.grind >= 3 ? '(ground)' : '(' + '·'.repeat(x.grind) + ')'}`).join(', ') }));
        const ma = el('div', { cls: 'actions' });
        ma.append(button('Grind', () => { for (const x of mortar) x.grind = Math.min(3, x.grind + (hasPerk('steady_mortar') ? 2 : 1)); sfx('dice'); render(); }));
        ma.append(button('Add to cauldron', () => {
          if (!base) { notify('Pour a base first.', 'bad', 1500); return; }
          if (mortar.some((x) => x.grind < 3)) { notify('Grind it properly first.', 'bad', 1500); return; }
          for (const x of mortar) pushAdd(x.herb, true);
          mortar = [];
          sfx('splash');
          render();
        }));
        mt.append(ma);
      }
      mid.append(mt);
      // herbs
      right.innerHTML = '<h3>Your herbs</h3>';
      const herbs = S.inv.filter((s) => item(s.id).cat === 'herb');
      if (!herbs.length) right.append(el('p', { html: '<i>You carry no herbs.</i>' }));
      for (const s of herbs) {
        const d = item(s.id);
        const r = el('div', { cls: 'inv-row' });
        r.innerHTML = `<img src="${iconURL(d.icon)}" alt=""><span class="nm">${esc(d.name)}</span><span class="n">×${s.n}</span>`;
        const btns = el('span', { cls: 'actions' });
        btns.append(
          button('Mortar', () => { if (!count(s.id)) return; removeItem(s.id, 1); mortar.push({ herb: s.id, grind: 0 }); render(); }, 'btn'),
          button('Pot', () => { if (!base) { notify('Pour a base first.', 'bad', 1500); return; } if (!count(s.id)) return; removeItem(s.id, 1); pushAdd(s.id, false); sfx('splash'); render(); }, 'btn'),
        );
        r.append(btns);
        right.append(r);
      }
    };
    const pushAdd = (herb: string, ground: boolean) => {
      const last = log[log.length - 1];
      if (last && last.op === 'add' && last.herb === herb && last.ground === ground) last.n++;
      else log.push({ op: 'add', herb, n: 1, ground });
    };
    const bottle = (close: () => void) => {
      if (!log.length) { notify('The cauldron is empty.', 'bad', 1500); return; }
      const done = [...log, { op: 'bottle' } as Step];
      let best: Recipe | null = null, bestBad = Infinity;
      for (const r of Object.values(RECIPES)) {
        const bad = sameSteps(done, r.steps);
        if (bad < bestBad) { bestBad = bad; best = r; }
      }
      const allowed = hasPerk('steady_mortar') ? 1 : 0;
      S.minutes += 20;
      if (best && bestBad <= allowed && skill('alchemy') + 1 >= best.level) {
        let n = best.yields || 1;
        if (hasPerk('double_brew') && Math.random() < 0.3) n++;
        addItem(best.result, n);
        if (!S.recipes.includes(best.id)) { S.recipes.push(best.id); notify(`You discovered <b>${best.name}</b>.`, 'skill'); }
        addXp('alchemy', 6 + best.level * 3);
        sfx('quest_done');
        emit('brewed', best.result);
      } else {
        addItem('suspicious_brew', 1);
        addXp('alchemy', 1);
        sfx('fail');
        notify('That did not go as planned.', 'bad');
      }
      log.length = 0;
      mortar = [];
      render();
    };
    const draw = () => {
      const ctx = cv.getContext('2d')!;
      ctx.fillStyle = '#2a211a';
      ctx.fillRect(0, 0, 160, 110);
      // fire
      const t = performance.now() / 1000;
      for (let i = 0; i < 6; i++) { ctx.fillStyle = [P.fire0, P.fire1, P.fire2][i % 3]; const h = 10 + Math.sin(t * 9 + i) * 4; ctx.fillRect(56 + i * 8, 100 - h, 6, h); }
      // pot
      ctx.fillStyle = '#1a1614';
      ctx.beginPath(); ctx.ellipse(80, 66, 42, 30, 0, 0, Math.PI * 2); ctx.fill();
      const base = log.find((s) => s.op === 'base') as { op: 'base'; liquid: string } | undefined;
      ctx.fillStyle = base ? (base.liquid === 'wine' ? '#6a1a2a' : '#4a7aa8') : '#2a2420';
      ctx.beginPath(); ctx.ellipse(80, 46, 36, 9, 0, 0, Math.PI * 2); ctx.fill();
      if (log.some((s) => s.op === 'add')) { ctx.fillStyle = 'rgba(110,160,60,0.6)'; ctx.beginPath(); ctx.ellipse(80, 46, 30, 6, 0, 0, Math.PI * 2); ctx.fill(); }
      if (bubble > 0) {
        bubble -= 1 / 60;
        for (let i = 0; i < 5; i++) { ctx.fillStyle = 'rgba(230,240,255,0.7)'; ctx.beginPath(); ctx.arc(55 + ((i * 17 + t * 40) % 50), 44 - ((t * 30 + i * 7) % 18), 2, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.strokeStyle = P.metal2; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(80, 46, 38, 10, 0, 0, Math.PI * 2); ctx.stroke();
      if (G.mode === 'menu') raf = requestAnimationFrame(draw);
    };
    render();
    raf = requestAnimationFrame(draw);
    void raf;
    return m;
  });
}
