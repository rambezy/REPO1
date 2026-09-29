// The Codex (K): what your people know of the waste. Places found, regions
// walked, factions and named people met, creatures seen and books read, in
// the world's own words. And a banner the first time you cross into a region.
import { h, ui, openWindow, isOpen, closeWindow } from './dom';
import { S } from '../sim/ctx';
import { REGIONS } from '../world/regions';
import { SETTLEMENT, LANDMARKS } from '../content/layout';
import { FACTIONS, FACTION } from '../content/factions';
import { ANIMAL } from '../content/animals';
import { BOOK } from '../content/lore';
import { UNIQUES } from '../content/uniques';
import { NOTES, NOTE } from '../content/notes';
import { on, emit } from '../core/events';

let tab: 'places' | 'regions' | 'factions' | 'people' | 'creatures' | 'books' | 'notes' = 'places';

export function setupCodex() {
  on('region:enter', (r: number) => banner(r));
}

function banner(r: number) {
  const reg = REGIONS[r];
  if (!reg) return;
  const first = reg.desc.split(/(?<=\.)\s/)[0];
  const el = h('div', { class: 'regionbanner' }, h('div', { class: 'rbname' }, reg.name), h('div', { class: 'rbdesc' }, first));
  ui().appendChild(el);
  setTimeout(() => el.classList.add('out'), 6000);
  setTimeout(() => el.remove(), 7200);
}

export function toggleCodex() {
  if (isOpen('codex')) { closeWindow('codex'); return; }
  openCodex();
}

export function openCodex() {
  const w = openWindow('codex', 'Codex', { w: 600, y: 90 });
  const render = () => {
    const W = S.W;
    w.body.innerHTML = '';
    const tabs = h('div', { class: 'ftabs' });
    for (const [k, label] of [['places', 'Places'], ['regions', 'Regions'], ['factions', 'Factions'], ['people', 'People'], ['creatures', 'Creatures'], ['books', 'Books'], ['notes', 'Field notes']] as const) {
      const b = h('button', { class: 'ftab' + (tab === k ? ' on' : '') }, label);
      b.onclick = () => { tab = k; render(); };
      tabs.appendChild(b);
    }
    const body = h('div', { class: 'codexlist' });
    const entry = (title: string, sub: string, text: string, onClick?: () => void) => {
      const e = h('div', { class: 'cxentry' + (onClick ? ' link' : '') }, h('div', { class: 'cxtitle' }, title, sub ? h('span', { class: 'dim' }, ` · ${sub}`) : null), h('div', { class: 'cxtext' }, text));
      if (onClick) e.onclick = onClick;
      body.appendChild(e);
    };
    if (tab === 'places') {
      const towns = S.T.sites.filter((s) => s.kind === 'town' && W.discovered.has(s.id));
      const marks = S.T.sites.filter((s) => s.landmark && W.discovered.has(s.id));
      for (const s of towns) { const d = SETTLEMENT[s.settlement!]; entry(s.name, `${FACTION[s.faction!]?.short ?? ''}, ${REGIONS[s.region]?.name ?? ''}`, d?.desc ?? ''); }
      for (const s of marks) { const l = LANDMARKS.find((x) => x.key === s.key); entry(s.name, REGIONS[s.region]?.name ?? '', l?.desc ?? ''); }
      if (!towns.length && !marks.length) body.appendChild(h('p', { class: 'dim' }, 'You have found nowhere worth writing down yet.'));
    } else if (tab === 'regions') {
      const seen: number[] = W.flags.regionsSeen ?? [];
      for (const r of seen) { const reg = REGIONS[r]; if (reg) entry(reg.name, `danger ${'•'.repeat(Math.max(1, Math.min(5, reg.danger)))}`, reg.desc); }
      const left = REGIONS.length - seen.length;
      if (left) body.appendChild(h('p', { class: 'dim' }, `${left} ${left === 1 ? 'region' : 'regions'} still unwalked.`));
    } else if (tab === 'factions') {
      for (const f of FACTIONS) if (f.key !== 'player' && f.key !== 'fauna' && W.rel.met.has(f.key)) entry(f.name, f.short, f.desc);
      if (!W.rel.met.size) body.appendChild(h('p', { class: 'dim' }, 'You have met nobody yet.'));
    } else if (tab === 'people') {
      const met: string[] = W.flags.peopleMet ?? [];
      for (const k of met) {
        const u = UNIQUES.find((x) => x.key === k);
        if (!u) continue;
        const c = [...W.chars.values()].find((x) => x.unique === k);
        const title = c?.title || u.title;
        const home = S.T.sites.find((s) => s.settlement === u.settlement);
        const where = !c || c.status === 'dead' ? 'dead' : c.faction === 'player' ? 'with you' : c.cage ? `caged at ${home?.name ?? 'somewhere'}` : `at ${S.T.siteAt(c.x, c.z, 60)?.name ?? home?.name ?? 'large'}`;
        entry(`${u.name} ${title}`, where, u.story);
      }
      const left = UNIQUES.length - met.length;
      if (!met.length) body.appendChild(h('p', { class: 'dim' }, 'You have met nobody worth remembering yet. Some people in the bars and cages of the waste have stories of their own.'));
      else if (left > 0) body.appendChild(h('p', { class: 'dim' }, `${left} more ${left === 1 ? 'person' : 'people'} with a story ${left === 1 ? 'is' : 'are'} out there somewhere.`));
    } else if (tab === 'creatures') {
      const seen: string[] = W.flags.beastsSeen ?? [];
      for (const k of seen) { const a = ANIMAL[k]; if (a) entry(a.name, a.diet, a.desc); }
      if (!seen.length) body.appendChild(h('p', { class: 'dim' }, 'Nothing has crossed your path yet.'));
    } else if (tab === 'notes') {
      const got: string[] = W.flags.notes ?? [];
      for (const k of got) { const n = NOTE[k]; if (n) entry(n.title, '', n.text); }
      if (got.length < NOTES.length) body.appendChild(h('p', { class: 'dim' }, got.length ? 'More of the waste\'s harder trades are waiting to be learned.' : 'Notes on the waste\'s harder trades (machines, iron limbs, drugs and the law) are written here as your people run into them.'));
    } else {
      const read = new Set<string>();
      for (const c of W.playerChars()) for (const k of c.mem.read ?? []) read.add(k);
      for (const k of read) { const b = BOOK[k]; if (b) entry(b.title, b.kind, b.text[0].slice(0, 180) + (b.text[0].length > 180 ? '…' : ''), () => emit('ui:read', k)); }
      if (!read.size) body.appendChild(h('p', { class: 'dim' }, 'Nobody of yours has read anything yet. Books turn up in shops and ruins.'));
    }
    w.body.append(tabs, body);
  };
  render();
}
