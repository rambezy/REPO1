// The build menu, placement with a ghost preview, the research window, and
// windows for machines, benches, storage and fields.
import { h, openWindow, isOpen, closeWindow, getWindow, esc, ask } from './dom';
import { G } from '../state';
import { S } from '../sim/ctx';
import { BUILDABLES, BUILDABLE, Buildable, RECIPES, TECHS, TECH, BuildCat } from '../content/buildables';
import { ITEM } from '../content/items';
import { canPlace, placeSite, unlocked, deconstruct, FUEL_REACH, cropFitness } from '../sim/base';
import { on, emit } from '../core/events';
import { input } from '../core/input';
import { groundAt, selected } from '../game/control';
import { Ghost } from '../render/baseView';
import { GridView, hideTip } from './grid';
import { iconFor } from './icons';
import { WObj } from '../sim/objects';
import { SKILL_INFO } from '../sim/skills';
import { buyHouse, houseOf } from '../sim/property';

let cat: BuildCat = 'Storage';
let ghost: Ghost;
let placing: Buildable | null = null;
let rot = 0;
let chain = false;

function costStr(cost: Record<string, number>) {
  return Object.entries(cost).map(([id, n]) => `${n} ${ITEM[id]?.name ?? id}`).join(', ');
}

export function setupBuild() {
  ghost = new Ghost(G.R.scene);
  on('ui:build', () => { if (isOpen('build')) closeWindow('build'); else openBuild(); });
  on('ui:research', () => { if (isOpen('research')) closeWindow('research'); else openResearch(); });
  on('ui:object', (_c: number, id: number) => openObject(id));
  on('build:cancel', () => stopPlacing());
  on('build:deconstruct', (id: number) => { const o = S.W.objs.get(id); if (o) ask(`Tear down the ${o.data?.name ?? o.def}? Half the materials are returned.`, 'Tear it down', () => deconstruct(o), 'Cancel', true); });
  on('build:click', (x: number, y: number) => {
    if (!placing) return;
    const g = groundAt(x, y);
    if (!g) return;
    const snapped = snap(placing, g.x, g.z);
    const r = canPlace(placing, snapped[0], snapped[1], rot);
    if (!r.ok) { emit('notice', r.why); return; }
    const site = placeSite(placing, snapped[0], snapped[1], rot);
    // everyone selected starts building it
    for (const c of selected()) c.jobs.unshift({ k: 'build', obj: site.id, label: `Build ${placing.name}` });
    if (!input.shift && !chain) stopPlacing();
    emit('sound', 'build', site.x, site.z, 0.5);
  });
  on('hover', (x: number, y: number) => moveGhost(x, y));
  input.onKey((code) => {
    if (!placing) return false;
    if (code === 'KeyR') { rot += Math.PI / 8; moveGhost(input.mx, input.my); return true; }
    if (code === 'Escape') { stopPlacing(); return true; }
    return false;
  });
  window.addEventListener('wheel', (e) => { if (placing && input.shift) { rot += Math.sign(e.deltaY) * Math.PI / 16; moveGhost(input.mx, input.my); } }, { passive: true });
}

/** Walls snap end to end with walls nearby. */
function snap(b: Buildable, x: number, z: number): [number, number] {
  if (b.kind !== 'wall' && b.kind !== 'gate') return [x, z];
  let best: [number, number] | null = null, bd = 3.5;
  S.W.objHash.near(x, z, 12, (o) => {
    if (o.owner !== 'player' || (o.kind !== 'wall' && o.kind !== 'gate')) return;
    const half = (o.data.len ?? 6) / 2;
    for (const sgn of [-1, 1]) {
      const ex = o.x + Math.sin(o.rot) * half * sgn, ez = o.z + Math.cos(o.rot) * half * sgn;
      const cx = ex + Math.sin(rot) * (b.d / 2) * sgn, cz = ez + Math.cos(rot) * (b.d / 2) * sgn;
      const d = Math.hypot(cx - x, cz - z);
      if (d < bd) { bd = d; best = [cx, cz]; }
    }
  });
  return best ?? [x, z];
}

function moveGhost(x: number, y: number) {
  if (!placing) return;
  const g = groundAt(x, y);
  if (!g) return;
  const [sx, sz] = snap(placing, g.x, g.z);
  const ok = canPlace(placing, sx, sz, rot).ok;
  ghost.place(sx, S.T.heightAt(sx, sz) + 0.02, sz, rot, ok);
}

function startPlacing(b: Buildable) {
  placing = b;
  G.placing = true;
  ghost.set(b);
  emit('notice', `Placing ${b.name}: left-click to place, R to rotate, Shift to place several, right-click to cancel.`);
}
function stopPlacing() {
  placing = null;
  G.placing = false;
  ghost.set(null);
}

function openBuild() {
  const w = openWindow('build', 'Build', { w: 520, x: window.innerWidth - 540, y: 100, cls: 'buildwin' });
  const render = () => {
    w.body.innerHTML = '';
    const cats: BuildCat[] = ['Storage', 'Furniture', 'Housing', 'Production', 'Crafting', 'Farming', 'Power', 'Defence', 'Science', 'Misc'];
    const tabs = h('div', { class: 'tabs wrap' });
    for (const c of cats) {
      const t = h('button', { class: 'tab' + (c === cat ? ' on' : '') }, c);
      t.onclick = () => { cat = c; render(); };
      tabs.appendChild(t);
    }
    const list = h('div', { class: 'blist' });
    for (const b of BUILDABLES.filter((x) => x.cat === cat)) {
      const ok = unlocked(b);
      const row = h('button', { class: 'brow' + (ok ? '' : ' locked') },
        h('div', { class: 'bname' }, b.name, b.power ? h('span', { class: b.power > 0 ? 'good' : 'dim' }, ` ${b.power > 0 ? '+' : ''}${b.power} power`) : ''),
        h('div', { class: 'bcost' }, ok ? costStr(b.cost) : `Needs research: ${TECH[b.research!]?.name ?? b.research}`),
        h('div', { class: 'bdesc' }, b.desc),
      );
      row.onclick = () => { if (!ok) { emit('notice', 'Research it first (U).'); return; } closeWindow('build'); startPlacing(b); };
      list.appendChild(row);
    }
    w.body.append(tabs, list, h('div', { class: 'dim small' }, 'Selected characters start building what you place. Materials are fetched from your storage.'));
  };
  render();
}

function openResearch() {
  const w = openWindow('research', 'Research', { w: 760, x: 60, y: 70, cls: 'reswin' });
  const R = S.W.research;
  const render = () => {
    w.body.innerHTML = '';
    const benches = [...S.W.objs.values()].filter((o) => o.owner === 'player' && o.kind === 'research').length;
    const cur = TECH[R.current];
    w.body.appendChild(h('div', { class: 'reshead' },
      cur ? h('div', {}, `Researching `, h('b', {}, cur.name), ` — ${Math.floor((R.progress / cur.time) * 100)}%`) : h('div', { class: 'dim' }, 'Nothing being researched.'),
      benches ? h('span', { class: 'dim' }, `${benches} research bench${benches > 1 ? 'es' : ''}. Assign someone to work at one.`) : h('span', { class: 'bad' }, 'Build a Research Bench (Science) to start.'),
    ));
    const cols = h('div', { class: 'rescols' });
    for (let tier = 1; tier <= 4; tier++) {
      const col = h('div', { class: 'rescol' }, h('div', { class: 'skhead' }, `Tier ${tier}${tier === 2 ? ' · Maker Tablets' : tier === 3 ? ' · Old Codices' : tier === 4 ? ' · Relic Cores' : ''}`));
      for (const t of TECHS.filter((x) => x.tier === tier)) {
        const done = R.done.has(t.key);
        const ready = !done && (t.needs ?? []).every((n) => R.done.has(n));
        const b = h('button', { class: 'tech' + (done ? ' done' : ready ? '' : ' locked') + (R.current === t.key ? ' cur' : '') },
          h('div', { class: 'bname' }, t.name),
          h('div', { class: 'bdesc' }, t.desc),
          !done && t.cost ? h('div', { class: 'bcost' }, costStr(t.cost)) : '',
          !done && t.needs?.length ? h('div', { class: 'bcost dim' }, 'After: ' + t.needs.map((n) => TECH[n].name).join(', ')) : '',
        );
        const start = () => {
          if (t.cost && R.current !== t.key) {
            // relics are consumed from storage or inventories when research starts
            for (const [id, n] of Object.entries(t.cost)) if (countOwned(id) < n) { emit('notice', `You need ${n} ${ITEM[id].name} in storage to research this.`); return; }
            for (const [id, n] of Object.entries(t.cost)) takeOwned(id, n);
          }
          if (R.current !== t.key) R.progress = 0;
          R.current = t.key;
          render();
        };
        b.onclick = () => {
          if (done || !ready) return;
          if (R.current && R.current !== t.key) ask('Switch research? Progress on the current topic is lost.', 'Switch', start);
          else start();
        };
        col.appendChild(b);
      }
      cols.appendChild(col);
    }
    w.body.appendChild(cols);
  };
  render();
  const off = on('research', () => { if (getWindow('research')) render(); else off(); });
}

function countOwned(id: string) {
  let n = 0;
  for (const o of S.W.objs.values()) if (o.owner === 'player' && o.inv) n += o.inv.count(id);
  for (const c of S.W.playerChars()) n += c.inv.count(id) + (c.eq.back?.inv?.count(id) ?? 0);
  return n;
}
function takeOwned(id: string, n: number) {
  for (const c of S.W.playerChars()) { n -= c.inv.take(id, n); if (n <= 0) return; if (c.eq.back?.inv) n -= c.eq.back.inv.take(id, n); if (n <= 0) return; }
  for (const o of S.W.objs.values()) if (o.owner === 'player' && o.inv) { n -= o.inv.take(id, n); if (n <= 0) return; }
}

let objViews: GridView[] = [];
export function openObject(id: number) {
  const o = S.W.objs.get(id);
  if (!o) return;
  const b = BUILDABLE[o.data?.bkey];
  const mine = o.owner === 'player';
  const title = o.def === 'forsale' ? 'For sale' : o.data?.name ?? b?.name ?? o.def;
  const w = openWindow('obj', title, { w: 460, x: window.innerWidth - 480, y: 120 });
  const cleanup = () => { for (const v of objViews) v.destroy(); objViews = []; hideTip(); };
  w.onClose = cleanup;
  const render = () => {
    cleanup();
    w.body.innerHTML = '';
    if (!S.W.objs.has(id)) { w.close(); return; }
    if (o.kind === 'site') {
      const need = o.data.need as Record<string, number>, have = o.data.have as Record<string, number>;
      w.body.append(h('div', {}, `Construction: ${Math.floor((o.progress ?? 0) * 100)}%`),
        h('div', { class: 'dim' }, 'Materials: ' + Object.entries(need).map(([k, n]) => `${ITEM[k].name} ${have[k] ?? 0}/${n}`).join(', ')));
      const bb = h('button', { class: 'tog' }, 'Assign selected to build');
      bb.onclick = () => { for (const c of selected()) c.jobs.unshift({ k: 'build', obj: o.id, label: `Build ${o.data.name}` }); emit('sel'); };
      const cancel = h('button', { class: 'tog' }, 'Cancel construction');
      cancel.onclick = () => { deconstruct(o); w.close(); };
      w.body.append(h('div', { class: 'selrow' }, bb, cancel));
      return;
    }
    if (o.def === 'forsale' && o.data?.price) {
      const house = houseOf(o);
      const price = (o.data.price as number).toLocaleString();
      w.body.append(h('div', {}, `${house?.data?.name ?? 'House'}, ${house?.data?.w ?? '?'} × ${house?.data?.d ?? '?'} m, with its furniture: ${price} chits.`),
        h('p', { class: 'dim' }, 'A house of your own in town: rest in its beds, keep things in its chests, and build furniture and benches inside it (nowhere else in town). Raiders leave town houses alone.'));
      const buy = h('button', { class: 'tog' }, `Buy it (${price} chits)`);
      buy.onclick = () => { const err = buyHouse(o); if (err) S.fx.notice(err, 'bad'); else w.close(); };
      w.body.append(h('div', { class: 'selrow' }, buy));
      return;
    }
    if (b?.desc) w.body.appendChild(h('p', { class: 'dim' }, b.desc));
    if (o.data?.power) w.body.appendChild(h('div', { class: o.data.power > 0 ? 'good' : (o.data.powerOK ?? 1) < 1 ? 'bad' : 'dim' }, o.data.power > 0 ? `Generates up to ${o.data.power} power.` : `Uses ${-o.data.power} power · supply ${Math.round((o.data.powerOK ?? 0) * 100)}%`));
    if (o.kind === 'farm') {
      const d = o.data;
      w.body.appendChild(h('div', {}, `${ITEM[d.crop]?.name ?? d.crop}: ${d.growth >= 1 ? 'ready to harvest' : `growing, ${Math.floor(d.growth * 100)}%`}`));
      const reg = S.T.regionAt(o.x, o.z);
      const fit = Math.max(0.1, cropFitness(d.crop, reg.fertility, reg.water_table));
      const note = d.crop === 'glowcap' ? ' Grows fastest by night.' : d.crop === 'bloodthorn' ? ' Heat helps it; rain slows it.' : '';
      w.body.appendChild(h('div', { class: fit < 0.4 ? 'bad' : 'dim' }, `How well it takes to this ground: ${Math.round(fit * 100)}%.${note} Wells nearby help. Tended fields grow faster.`));
    }
    // recipes: machines pick one, benches queue several
    if (o.data?.recipes && mine) {
      const recs = (o.data.recipes as string[]).filter((k) => !RECIPES[k].research || S.W.research.done.has(RECIPES[k].research!));
      const box = h('div', { class: 'recipes' });
      if (o.data.job === 'craft') {
        const q = o.data.queue as { r: string; n: number }[];
        box.appendChild(h('div', { class: 'skhead' }, 'Make'));
        for (const k of recs) {
          const r = RECIPES[k];
          const out = Object.keys(r.out)[0];
          const row = h('div', { class: 'rrow' },
            h('img', { class: 'ricon', src: iconFor(out) }),
            h('div', {}, h('div', { class: 'bname' }, r.name), h('div', { class: 'bcost' }, costStr(r.in) + ` · ${SKILL_INFO[r.skill as keyof typeof SKILL_INFO]?.name ?? r.skill}`)),
          );
          const add = h('button', { class: 'tog small' }, '+1');
          add.onclick = () => { const e = q.find((x) => x.r === k); if (e) e.n++; else q.push({ r: k, n: 1 }); render(); };
          const add5 = h('button', { class: 'tog small' }, '+5');
          add5.onclick = () => { const e = q.find((x) => x.r === k); if (e) e.n += 5; else q.push({ r: k, n: 5 }); render(); };
          row.append(add, add5);
          box.appendChild(row);
        }
        if (q.length) box.appendChild(h('div', { class: 'dim' }, 'Queue: ' + q.map((e) => `${RECIPES[e.r].name} ×${e.n}`).join(', ')));
        const clr = h('button', { class: 'tog small' }, 'Clear queue');
        clr.onclick = () => { q.length = 0; render(); };
        box.appendChild(clr);
      } else if (o.data.job === 'operate') {
        // a machine that can make more than one thing (the still: grog or rum) makes what you pick
        if (recs.length > 1) {
          const row = h('div', { class: 'selrow' }, h('span', { class: 'dim' }, 'Make: '));
          for (const k of recs) {
            const t = h('button', { class: 'tog small' + (o.data.recipe === k ? ' on' : '') }, RECIPES[k].name);
            t.onclick = () => { if (o.data.recipe !== k) { o.data.recipe = k; o.data.prog = 0; } render(); };
            row.appendChild(t);
          }
          box.appendChild(row);
        }
        const r = RECIPES[o.data.recipe];
        if (r) box.appendChild(h('div', {}, `${r.name}: ${costStr(r.in)} → ${costStr(r.out)} · ${Math.floor(((o.data.prog ?? 0) / r.time) * 100)}%`));
      }
      w.body.appendChild(box);
    }
    if (o.data?.job && mine) {
      const bb = h('button', { class: 'tog' }, o.data.jobLabel ?? 'Work here');
      bb.onclick = () => { for (const c of selected()) if (!c.jobs.some((j) => j.obj === o.id)) c.jobs.push({ k: o.data.job, obj: o.id, label: o.data.jobLabel }); emit('sel'); };
      const workers = [...S.W.playerChars()].filter((c) => c.jobs.some((j) => j.obj === o.id)).map((c) => c.name);
      w.body.append(h('div', { class: 'selrow' }, bb), h('div', { class: 'dim small' }, workers.length ? 'Assigned: ' + workers.join(', ') : 'Nobody works here. Select people and click the button.'));
    }
    if (o.inv && mine) {
      if (o.data?.bkey === 'generator') w.body.appendChild(h('div', { class: 'dim' }, `Fuel in the tank: ${o.inv.count('fuel')}. A can of fuel runs it for about six hours while machines draw power, and it tops itself up from your storage within ${FUEL_REACH} m.`));
      const v = new GridView(o.inv, { label: o.data?.bkey === 'generator' ? 'Fuel tank' : o.kind === 'storage' ? (o.data?.accepts ? 'Stores: ' + o.data.accepts.slice(0, 4).join(', ') + (o.data.accepts.length > 4 ? '…' : '') : 'Contents') : 'Contents', moved: () => setTimeout(render, 0) });
      objViews.push(v);
      const c = selected()[0];
      if (c && Math.hypot(c.x - o.x, c.z - o.z) < 5) {
        const cv = new GridView(c.inv, { label: `${c.name}'s inventory`, moved: () => setTimeout(render, 0) });
        objViews.push(cv);
        w.body.append(h('div', { class: 'loot' }, v.el, cv.el));
      } else w.body.append(v.el, h('div', { class: 'dim small' }, 'Bring a character next to it to move items.'));
    }
    if (mine && !o.site) {
      const d = h('button', { class: 'tog small' }, 'Deconstruct');
      d.onclick = () => { emit('build:deconstruct', o.id); setTimeout(() => { if (!S.W.objs.has(o.id)) w.close(); }, 50); };
      w.body.appendChild(h('div', { class: 'selrow', style: { marginTop: '8px' } }, d));
    }
    void esc;
  };
  render();
  const iv = setInterval(() => { if (!getWindow('obj')) clearInterval(iv); else if (o.kind === 'site' || o.data?.recipes || o.kind === 'farm') render(); }, 1500);
}
