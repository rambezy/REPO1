// Headless checks of the overlay's label layout (src/render/labels.ts): the
// priority order, collisions culled by priority, a person's own labels left
// alone, numbers nudged apart, one bubble per cluster, a label that was
// showing kept over a newcomer of equal rank, names fading with distance,
// and nothing allocated per frame beyond the scratch the caller keeps.
// Usage: npx tsx tools/labeltest.ts
import { layoutLabels, labelPriority, nameAlpha, LAYOUT, type LabelItem, type LabelOut } from '../src/render/labels';

const results: [string, boolean][] = [];
const check = (label: string, ok: boolean, info = '') => { results.push([label, ok]); console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${info ? ` (${info})` : ''}`); };

let seq = 1;
const item = (o: Partial<LabelItem>): LabelItem => ({ id: seq++, owner: 0, kind: 'tag', x: 0, y: 0, w: 40, h: 16, priority: 0, slots: 0, ...o });
const run = (items: LabelItem[], out: LabelOut[] = []) => { const n = layoutLabels(items, items.length, out, LAYOUT, []); return { n, out }; };
const rect = (it: LabelItem, o: LabelOut) => [it.x - it.w / 2, it.y + o.dy - it.h, it.x + it.w / 2, it.y + o.dy];
const overlap = (a: number[], b: number[]) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
const noOverlaps = (items: LabelItem[], out: LabelOut[]) => {
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    if (!out[i].shown || !out[j].shown) continue;
    if (items[i].owner === items[j].owner && (items[i].kind !== 'floater' || items[j].kind !== 'floater')) continue;
    if (overlap(rect(items[i], out[i]), rect(items[j], out[j]))) return false;
  }
  return true;
};

// 1. priorities: who it is about, then what it is
const pSelTag = labelPriority('selected', 'tag', false), pMineFloat = labelPriority('mine', 'floater', false), pFoeBubble = labelPriority('foe', 'bubble', false), pOtherTag = labelPriority('other', 'tag', false);
check('your selected people outrank the rest of yours, who outrank hostiles, who outrank bystanders', pSelTag > pMineFloat && pMineFloat > pFoeBubble && pFoeBubble > pOtherTag);
check('about the same person, damage numbers outrank speech, which outranks the name', labelPriority('mine', 'floater', false) > labelPriority('mine', 'bubble', false) && labelPriority('mine', 'bubble', false) > labelPriority('mine', 'tag', false));
check('a label already showing edges out a newcomer of the same rank, and nothing more', labelPriority('foe', 'tag', true) > labelPriority('foe', 'tag', false) && labelPriority('foe', 'tag', true) < labelPriority('foe', 'bubble', false));

// 2. two names on the same spot: the more important one shows, the other is culled
{
  const items = [item({ owner: 1, x: 100, y: 100, priority: pOtherTag }), item({ owner: 2, x: 110, y: 104, priority: pSelTag })];
  const { n, out } = run(items);
  check('of two names on the same spot only the more important shows', n === 1 && out[1].shown && !out[0].shown);
  check('a culled name is not moved somewhere else', out[0].dy === 0);
}

// 3. a damage number may be nudged up out of a name's way
{
  const items = [item({ owner: 1, x: 100, y: 100, priority: pSelTag }), item({ owner: 2, kind: 'floater', x: 102, y: 98, w: 20, h: 14, slots: 2, priority: labelPriority('foe', 'floater', false) })];
  const { n, out } = run(items);
  check('a damage number steps up out of the way of a name', n === 2 && out[1].shown && out[1].dy < 0 && noOverlaps(items, out), `dy ${out[1].dy}`);
}

// 4. a person's own name, bubble and number stack without fighting each other
{
  const items = [item({ owner: 7, x: 50, y: 50, priority: labelPriority('mine', 'tag', false) }), item({ owner: 7, kind: 'bubble', x: 50, y: 40, w: 120, h: 36, priority: labelPriority('mine', 'bubble', false) }), item({ owner: 7, kind: 'floater', x: 50, y: 44, w: 20, h: 14, priority: labelPriority('mine', 'floater', false) })];
  const { n } = run(items);
  check('one person\'s name, bubble and number all show together', n === 3);
}

// 5. two numbers landing on the same person are nudged apart, not stacked on top of each other
{
  const items = [item({ owner: 7, kind: 'floater', x: 50, y: 44, w: 20, h: 14, slots: 2, priority: 23 }), item({ owner: 7, kind: 'floater', x: 52, y: 46, w: 20, h: 14, slots: 2, priority: 23 })];
  const { n, out } = run(items);
  check('two numbers on one person are nudged apart', n === 2 && noOverlaps(items, out) && (out[0].dy !== 0 || out[1].dy !== 0));
}

// 6. one bubble per cluster, the more important one
{
  const items = [item({ owner: 1, kind: 'bubble', x: 100, y: 100, w: 90, h: 30, priority: labelPriority('other', 'bubble', false) }), item({ owner: 2, kind: 'bubble', x: 160, y: 60, w: 90, h: 30, priority: labelPriority('mine', 'bubble', false) }), item({ owner: 3, kind: 'bubble', x: 400, y: 100, w: 90, h: 30, priority: labelPriority('other', 'bubble', false) })];
  const { n, out } = run(items);
  check('only one bubble shows in a small cluster, and it is the more important one', n === 2 && out[1].shown && !out[0].shown && out[2].shown);
}

// 7. a brawl's worth of labels: twelve people in a scrum, each with a name, a number and some of them talking
{
  const items: LabelItem[] = [];
  let id = 1;
  for (let i = 0; i < 12; i++) {
    const who = i < 3 ? 'selected' : i < 6 ? 'mine' : 'foe';
    const x = 300 + (i % 4) * 50, y = 200 + Math.floor(i / 4) * 30;
    items.push(item({ owner: id, x, y, w: 46, h: 24, priority: labelPriority(who, 'tag', false) }));
    items.push(item({ owner: id, kind: 'floater', x: x + 2, y: y - 30, w: 18, h: 14, slots: 2, priority: labelPriority(who, 'floater', false) }));
    if (i % 3 === 0) items.push(item({ owner: id, kind: 'bubble', x, y: y - 28, w: 110, h: 34, priority: labelPriority(who, 'bubble', false) }));
    id++;
  }
  const { n, out } = run(items);
  const selShown = items.filter((it, i) => it.priority >= labelPriority('selected', 'tag', false) && it.kind === 'tag' && out[i].shown).length;
  const bubbles = items.filter((it, i) => it.kind === 'bubble' && out[i].shown);
  let apart = true;
  for (const a of bubbles) for (const b of bubbles) if (a !== b && Math.hypot(a.x - b.x, a.y - b.y) < LAYOUT.bubbleR) apart = false;
  check('a brawl\'s labels never overlap once laid out', noOverlaps(items, out), `${n} of ${items.length} shown`);
  check('the selected people\'s names all survive the brawl', selShown === 3, `${selShown} of 3`);
  check('a scrum shows at most one bubble per cluster', apart && bubbles.length <= 2, `${bubbles.length} of 4`);
  check('the layout is deterministic', JSON.stringify(run(items).out) === JSON.stringify(out));
}

// 8. hysteresis: a name showing last frame keeps its place against an equal newcomer
{
  const a = item({ owner: 1, x: 100, y: 100, priority: labelPriority('foe', 'tag', true) });
  const b = item({ owner: 2, x: 108, y: 102, priority: labelPriority('foe', 'tag', false) });
  const { out } = run([b, a]);
  check('a name already on screen keeps its place over an equal newcomer', out[1].shown && !out[0].shown);
}

// 9. names fade with distance
check('names are full up close, fade with distance and are gone far off', nameAlpha(10, false) === 1 && nameAlpha(60, false) > 0 && nameAlpha(60, false) < 1 && nameAlpha(120, false) === 0, `${nameAlpha(60, false).toFixed(2)} at 60 m`);
check('the selected and their targets keep their names further out', nameAlpha(90, true) > nameAlpha(90, false) && nameAlpha(90, true) > 0.5);

// 10. the caller's scratch is reused: a second frame allocates nothing new in the output
{
  const items = [item({ owner: 1, x: 100, y: 100, priority: 5 }), item({ owner: 2, x: 300, y: 100, priority: 5 })];
  const out: LabelOut[] = [];
  const order: number[] = [];
  layoutLabels(items, 2, out, LAYOUT, order);
  const o0 = out[0], o1 = out[1];
  layoutLabels(items, 2, out, LAYOUT, order);
  check('the output records are reused frame to frame', out[0] === o0 && out[1] === o1 && out.length === 2);
  const t0 = performance.now();
  const many: LabelItem[] = [];
  for (let i = 0; i < 150; i++) many.push(item({ owner: i, kind: i % 3 === 0 ? 'floater' : 'tag', x: 100 + (i * 37) % 900, y: 100 + (i * 53) % 500, slots: i % 3 === 0 ? 2 : 0, priority: (i * 7) % 40 }));
  for (let f = 0; f < 200; f++) layoutLabels(many, many.length, out, LAYOUT, order);
  const per = (performance.now() - t0) / 200;
  check('a crowded screen of 150 labels lays out in well under a millisecond', per < 1, `${per.toFixed(3)} ms a frame`);
}

const passed = results.filter((r) => r[1]).length;
console.log(`${passed}/${results.length} checks passed`);
if (passed !== results.length) process.exit(1);
