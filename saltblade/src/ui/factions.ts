// The factions panel: who you know and how they feel about you, the prices
// on your people's heads, and the bounties on offer.
import { h, openWindow, isOpen, closeWindow, bar } from './dom';
import { S } from '../sim/ctx';
import { FACTIONS, FACTION, HOSTILE_AT } from '../content/factions';
import { SETTLEMENT } from '../content/layout';

let tab: 'factions' | 'bounties' = 'factions';
const open = new Set<string>();

export function toggleFactions() {
  if (isOpen('factions')) { closeWindow('factions'); return; }
  openFactions();
}

function relWord(v: number) {
  return v <= HOSTILE_AT ? 'Hostile' : v < -20 ? 'Unfriendly' : v < 20 ? 'Neutral' : v < 60 ? 'Friendly' : 'Allied';
}

export function openFactions() {
  const w = openWindow('factions', 'Factions', { w: 560, x: 60, y: 70 });
  const render = () => {
    const W = S.W;
    w.body.innerHTML = '';
    const people = W.playerChars();
    const alive = people.filter((c) => c.alive).length;
    const towns = S.T.sites.filter((s) => s.kind === 'town');
    const found = towns.filter((s) => W.discovered.has(s.id)).length;
    const name = h('input', { class: 'tin fname', value: W.factionName, maxlength: '28', spellcheck: 'false' }) as HTMLInputElement;
    name.onchange = () => {
      W.factionName = name.value.trim() || W.factionName;
      for (const id of W.playerSquads) { const sq = W.squads.get(id); if (sq && sq.members.length) sq.name = sq.name === 'Wanderers' ? W.factionName : sq.name; }
    };
    const tabs = h('div', { class: 'ftabs' });
    for (const [k, label] of [['factions', 'Factions'], ['bounties', 'Bounties']] as const) {
      const b = h('button', { class: 'ftab' + (tab === k ? ' on' : '') }, label);
      b.onclick = () => { tab = k; render(); };
      tabs.appendChild(b);
    }
    w.body.append(
      h('div', { class: 'fhead' },
        name,
        h('div', { class: 'fstats dim' }, `${alive} ${alive === 1 ? 'person' : 'people'} · ${W.money.toLocaleString()} chits · day ${S.clock.day} · ${found} of ${towns.length} towns found`),
      ),
      tabs,
    );
    if (tab === 'factions') renderFactions(w.body, render); else renderBounties(w.body);
  };
  render();
}

function renderFactions(body: HTMLElement, rerender: () => void) {
  const W = S.W;
  const list = h('div', { class: 'flist' });
  const rows = FACTIONS.filter((f) => f.key !== 'player' && f.key !== 'fauna' && (!f.hidden || W.rel.met.has(f.key)))
    .map((f) => ({ f, v: W.rel.get('player', f.key), met: W.rel.met.has(f.key) }))
    .sort((a, b) => Number(b.met) - Number(a.met) || b.v - a.v);
  for (const { f, v, met } of rows) {
    const col = '#' + f.color.toString(16).padStart(6, '0');
    const word = relWord(v);
    const pct = (v + 100) / 200;
    const bounty = W.playerChars().reduce((a, c) => a + (c.bounty[f.key] ?? 0), 0);
    const row = h('div', { class: 'frow' + (open.has(f.key) ? ' open' : '') },
      h('div', { class: 'fline' },
        h('i', { class: 'fchip', style: { background: col } }),
        h('div', { class: 'fname2' }, f.name, met ? null : h('small', { class: 'dim' }, ' · not met')),
        h('div', { class: 'frel ' + word.toLowerCase() }, word, h('small', {}, ` ${v > 0 ? '+' : ''}${Math.round(v)}`)),
        h('div', { class: 'fbar' }, bar(pct, v <= HOSTILE_AT ? 'bad' : v >= 20 ? 'good' : ''), h('span', { class: 'fmid' })),
      ),
    );
    if (open.has(f.key)) {
      const laws = Object.entries(f.laws).filter(([, on]) => on).map(([k]) => ({ theft: 'theft', assault: 'assault', trespass: 'trespassing', nonHuman: 'being non-human', hollow: 'being a machine', runaway: 'escaping slavery', drugs: 'dreamleaf' } as Record<string, string>)[k] ?? k);
      const theirTowns = S.T.sites.filter((s) => s.kind === 'town' && s.faction === f.key && (W.discovered.has(s.id) || SETTLEMENT[s.settlement!]?.capital)).map((s) => s.name);
      row.append(h('div', { class: 'fdetail' },
        h('p', {}, f.desc),
        laws.length ? h('div', {}, h('b', {}, 'Punishes: '), laws.join(', ')) : h('div', { class: 'dim' }, 'Keeps no laws.'),
        theirTowns.length ? h('div', {}, h('b', {}, 'Towns: '), theirTowns.join(', ')) : null,
        bounty ? h('div', { class: 'bad' }, `Your people are wanted here: ${bounty.toLocaleString()} chits in bounties.`) : null,
      ));
    }
    row.onclick = () => { if (open.has(f.key)) open.delete(f.key); else open.add(f.key); rerender(); };
    list.appendChild(row);
  }
  body.appendChild(list);
}

function renderBounties(body: HTMLElement) {
  const W = S.W;
  const wanted = W.playerChars().filter((c) => c.alive && Object.values(c.bounty).some((v) => v > 0));
  if (wanted.length) {
    body.appendChild(h('h4', { class: 'fsub bad' }, 'Your people are wanted'));
    for (const c of wanted) {
      const parts = Object.entries(c.bounty).filter(([, v]) => v > 0).map(([f, v]) => `${FACTION[f]?.short ?? f} ${v.toLocaleString()}c`);
      body.appendChild(h('div', { class: 'brow' }, h('b', {}, c.name), h('span', { class: 'dim' }, parts.join(' · '))));
    }
  }
  body.appendChild(h('h4', { class: 'fsub' }, 'Posted bounties'));
  const known = W.bountyBoard.filter((b) => b.status === 'open' && (W.rel.met.has(b.poster) || W.seenSites.has(b.site)));
  if (!known.length) body.appendChild(h('p', { class: 'dim' }, 'You have not heard of any. Ask the guards in lawful towns.'));
  for (const b of known.sort((x, y) => y.reward - x.reward)) {
    const site = S.T.sites.find((s) => s.id === b.site);
    const heard = W.seenSites.has(b.site) || W.discovered.has(b.site);
    body.appendChild(h('div', { class: 'brow' },
      h('div', {}, h('b', {}, b.name), h('span', { class: 'dim' }, `, ${b.title}`)),
      h('div', { class: 'breward' }, `${b.reward.toLocaleString()}c`),
      h('div', { class: 'dim' }, `Posted by the ${FACTION[b.poster]?.short ?? b.poster} · ${heard ? 'at ' + (site?.name ?? '?') : 'whereabouts unknown'}`),
    ));
  }
  const done = W.bountyBoard.filter((b) => b.status !== 'open').length;
  if (done) body.appendChild(h('p', { class: 'dim' }, `${done} ${done === 1 ? 'bounty' : 'bounties'} already collected.`));
}
