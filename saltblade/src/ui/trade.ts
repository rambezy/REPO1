// Trading: drag goods between your pack and the shop's stock. Prices depend
// on the shop, what the town has too much or too little of, and your standing
// with its faction. Every purchase and every sale, dragged or right-clicked,
// is settled by one function each (payForGoods and payForSale).
import './economy.css';
import { h, openWindow, getWindow, esc } from './dom';
import { GridView, hideTip, type Source } from './grid';
import { S } from '../sim/ctx';
import { Shop, buyPrice, sellPrice, shopGrid, marketOf, marketFor, payForGoods, payForSale, buyInto, sellInto, stow, dearMarkets, type MarketTip } from '../sim/shops';
import { Item } from '../sim/inventory';
import { ITEM } from '../content/items';
import { fmt } from '../core/math';
import { emit } from '../core/events';
import { FACTION } from '../content/factions';
import { portrait } from '../render/portrait';
import { recruit } from '../sim/dialogue';
import { Char } from '../sim/char';
import { uiSound } from '../audio';
import { makeAnimal } from '../sim/spawn';
import { ANIMAL } from '../content/animals';
import { RNG } from '../core/rng';
import { Grid } from '../sim/inventory';

let views: GridView[] = [];
let session = 0; // which trade the open window shows: reopening it for another shop retires the old one's checks

export function openTrade(pid: number, nid: number) {
  const p = S.W.char(pid), n = S.W.char(nid);
  if (!p || !n) return;
  const sh = S.W.shops.get(+n.shop);
  if (!sh) { emit('notice', `${n.name} has nothing to sell.`); return; }
  const stock = shopGrid(sh);
  if (!stock) return;
  const w = openWindow('trade', `${sh.name} — ${n.name}`, { w: 820, cls: 'tradewin' });
  const cleanup = () => { for (const v of views) v.destroy(); views = []; hideTip(); };
  w.onClose = cleanup;
  let msg = '';
  const packs = () => [p.inv, p.eq.back?.inv].filter(Boolean) as Grid[];
  // where a bought thing may go: never a pack inside the pack on your back
  const holds = (it: Item) => packs().filter((g) => g === p.inv || !ITEM[it.id].pack);
  const site = S.T.sites.find((s) => s.id === sh.site);
  const here = site ? { x: site.x, z: site.z, site: site.id } : undefined;

  const tell = (what: string, it: Item, k: number, chits: number) => {
    msg = `${what} ${ITEM[it.id].name}${k > 1 ? ' ×' + k : ''} for ${fmt(chits)}c.`;
    uiSound('coin');
    emit('sound', 'coin', p.x, p.z, 1);
  };
  // a drag has already moved the goods: these settle for what moved
  const bought = (it: Item, k: number) => { if (k > 0) tell('Bought', it, k, payForGoods(sh, it, k)); };
  const sold = (it: Item, k: number) => { if (k > 0) tell('Sold', it, k, payForSale(sh, it, k)); };
  let told = false; // the towns the trader names are heard of once a visit
  /** Why the shop won't take this stack from you, if it won't. */
  const refuse = (it: Item): string => {
    const val = sellPrice(sh, it) * it.n;
    if (val <= 0) return `${n.name} won't touch that.`;
    if (it.inv?.items.length) return `Empty the ${ITEM[it.id].name.toLowerCase()} first.`;
    if (sh.money < val) return `${n.name} can't afford it (${fmt(sh.money)}c left).`;
    return '';
  };
  const afford = (it: Item): boolean => {
    const cost = buyPrice(sh, it) * it.n;
    if (S.W.money >= cost) return true;
    msg = `You need ${fmt(cost)} chits.`;
    setTimeout(render, 0);
    return false;
  };

  // A drag can end in a merge with a matching stack, which leaves less of the dragged
  // stack behind, so how many changed hands is worked out from where it started.
  let taking: { it: Item; n: number; before: Set<Item> } | null = null;
  let giving: { it: Item; n: number } | null = null;
  const landed = (it: Item, n0: number, dst: Source) => (dst.kind === 'slot' || dst.grid.items.includes(it) || it.n <= 0 ? n0 : n0 - it.n);

  const render = () => {
    cleanup();
    w.body.innerHTML = '';
    const mine = h('div', { class: 'lootside' }, h('div', { class: 'lhead' }, `${p.name}`));
    for (const g of packs()) {
      const v = new GridView(g, {
        label: g === p.inv ? 'Inventory' : ITEM[p.eq.back!.id].name,
        price: (it) => sellPrice(sh, it) * it.n,
        note: (it) => sellNote(sh, it, here),
        // what comes in from the shop is paid for by the shop's side (see below)
        accept: (it, src) => (g === p.inv || !ITEM[it.id].pack) && (!(src.kind === 'grid' && src.grid === stock) || afford(it)),
        moved: () => setTimeout(render, 0),
        rclick: (it) => sell(it, g),
      });
      views.push(v);
      mine.appendChild(v.el);
    }
    const shopSide = h('div', { class: 'lootside' }, h('div', { class: 'lhead' }, `${sh.name}`));
    const sv = new GridView(stock, {
      label: 'For sale',
      price: (it) => buyPrice(sh, it) * it.n,
      note: (it) => buyNote(sh, it, here),
      canTake: (it) => {
        if (!afford(it)) return false;
        taking = { it, n: it.n, before: new Set(stock.items) };
        return true;
      },
      accept: (it, src) => {
        if (src.kind === 'grid' && src.grid === stock) return true;
        // only from the trader's own packs: not straight off someone's back, a chest or a corpse
        const why = src.kind === 'grid' && packs().includes(src.grid) ? refuse(it) : `Sell from ${p.name}'s pack.`;
        if (why) { msg = why; setTimeout(render, 0); return false; }
        giving = { it, n: it.n };
        return true;
      },
      moved: (it, src, dst) => {
        const fromStock = src.kind === 'grid' && src.grid === stock, toStock = dst.kind === 'grid' && dst.grid === stock;
        if (toStock && !fromStock && giving?.it === it) sold(it, landed(it, giving.n, dst));
        else if (fromStock && !toStock && taking?.it === it) {
          // bought, wherever it was dropped: this pack, the character window, straight onto a belt
          bought(it, landed(it, taking.n, dst));
          // a drop onto an equipment slot swaps what was there into the stock: that stays yours
          if (dst.kind === 'slot') for (const old of stock.items.filter((x) => !taking!.before.has(x))) {
            stock.remove(old);
            const k = old.n;
            if (stow(old, holds(old)) < k) emit('world:drop', p.x, p.z, [old]);
          }
        }
        taking = null; giving = null;
        setTimeout(render, 0);
      },
      rclick: (it) => buy(it),
    });
    views.push(sv);
    shopSide.appendChild(sv.el);
    const f = FACTION[sh.faction];
    const rel = S.W.rel.get('player', sh.faction);
    const head = h('div', { class: 'tradehead' },
      h('img', { class: 'iport', src: portrait(n) }),
      h('div', {},
        h('div', { class: 'ititle' }, n.name),
        h('div', { class: 'dim' }, `${f?.name ?? ''} · standing ${rel > 30 ? 'friendly' : rel < -20 ? 'poor' : 'neutral'} · prices ${rel > 30 ? 'good' : rel < -20 ? 'high' : 'fair'}`),
        marketLine(sh),
        haulLine(sh, stock, here, !told),
      ),
      h('div', { class: 'purses' },
        h('div', {}, 'Your chits: ', h('b', { class: 'gold' }, fmt(S.W.money))),
        h('div', {}, 'Shop chits: ', h('b', {}, fmt(sh.money))),
      ),
    );
    const extra = sh.kind === 'slaves' ? slaveMarket(p, sh, render) : sh.kind === 'mercs' ? mercHall(p, sh, render) : sh.kind === 'animals' ? beastMarket(p, sh, render) : null;
    w.body.append(head, h('div', { class: 'loot' }, mine, shopSide), extra ?? '', h('div', { class: 'lootfoot' }, h('span', { class: 'dim' }, msg || 'Drag items across to buy or sell. Right-click to buy or sell a whole stack.'), h('span')));
    told = true;
  };
  const buy = (it: Item) => {
    if (!afford(it)) return;
    const n0 = it.n;
    const [k, chits] = buyInto(sh, it, holds(it));
    if (k <= 0) { msg = 'No room in your pack.'; render(); return; }
    tell('Bought', it, k, chits);
    if (k < n0) msg += ` No room for the other ${n0 - k}.`;
    render();
  };
  const sell = (it: Item, g: Grid) => {
    const why = refuse(it);
    if (why) { msg = why; render(); return; }
    const [k, chits] = sellInto(sh, it, g);
    if (k <= 0) { msg = `${n.name} has no room for it.`; render(); return; }
    tell('Sold', it, k, chits);
    render();
  };
  render();
  const mine = ++session;
  const iv = setInterval(() => { const ww = getWindow('trade'); if (!ww || session !== mine) clearInterval(iv); else if (Math.hypot(p.x - n.x, p.z - n.z) > 6) ww.close(); }, 500);
}

const pctOf = (gain: number) => `${gain >= 0 ? '+' : '−'}${Math.round(Math.abs(gain) * 100)}%`;
const townList = (tips: MarketTip[], max = 2) => tips.slice(0, max).map((t) => esc(t.site.name)).join(', ') + (tips.length > max ? ` and ${tips.length - max} more` : '');

/** Tooltip lines for something on the shop's side: what it fetches where it is wanted, against what it costs here. */
function buyNote(sh: Shop, it: Item, here?: { x: number; z: number; site: number }): string | undefined {
  const tips = dearMarkets(it, here);
  if (!tips.length) return undefined;
  const cost = buyPrice(sh, it), best = tips[0], gain = (best.price - cost) / cost;
  const where = tips.filter((t) => t.price === best.price);
  if (gain > 0) return `<div class="tt-row good">Sells for ${best.price}c each in ${townList(where)} (${pctOf(gain)})</div>`;
  return `<div class="tt-row dim">Wanted in ${townList(where)} (${best.price}c each), but it costs too much here to carry there</div>`;
}

/** Tooltip lines for something in your pack: is this the place to sell it, or is there a better one? */
function sellNote(sh: Shop, it: Item, here?: { x: number; z: number; site: number }): string | undefined {
  const mk = marketFor(sh, ITEM[it.id]);
  if (mk === 'dear') return '<div class="tt-row good">Wanted here: it fetches a good price</div>';
  const tips = dearMarkets(it, here), price = sellPrice(sh, it);
  const better = tips.filter((t) => t.price > price);
  if (better.length) {
    const best = better.filter((t) => t.price === better[0].price);
    return `<div class="tt-row gold">Sells for more in ${townList(best)} (${better[0].price}c each)</div>`;
  }
  if (mk === 'cheap') return '<div class="tt-row dim">Plentiful here: it fetches little</div>';
  return undefined;
}

/** The goods on the shelf worth carrying to a town that wants them, with the margin at your standing. */
function haulLine(sh: Shop, stock: Grid, here: { x: number; z: number; site: number } | undefined, reveal: boolean) {
  const seen = new Set<string>();
  const hauls: { it: Item; tip: MarketTip; gain: number }[] = [];
  for (const it of stock.items) {
    const key = it.id + ':' + it.q;
    if (seen.has(key)) continue;
    seen.add(key);
    const tip = dearMarkets(it, here)[0];
    if (!tip) continue;
    const cost = buyPrice(sh, it), gain = (tip.price - cost) / cost;
    if (gain > 0) hauls.push({ it, tip, gain });
  }
  if (!hauls.length) return null;
  hauls.sort((a, b) => b.gain * buyPrice(sh, b.it) - a.gain * buyPrice(sh, a.it));
  // now you have heard of the places the trader names
  if (reveal) for (const x of hauls.slice(0, 3)) S.W.seenSites.add(x.tip.site.id);
  return h('div', { class: 'haul-line' }, h('b', {}, 'Worth hauling: '),
    hauls.slice(0, 3).map((x) => `${ITEM[x.it.id].name.toLowerCase()} to ${x.tip.site.name} (${pctOf(x.gain)})`).join(', '));
}

/** Slaves for sale at a slave market: buying one sets them to work for you. */
function slaveMarket(p: Char, sh: Shop, rerender: () => void) {
  const box = h('div', { class: 'market' }, h('div', { class: 'lhead' }, 'Slaves for sale'));
  const slaves = [...S.W.chars.values()].filter((c) => c.role === 'slave' && c.site === sh.site && c.alive && c.faction !== 'player').slice(0, 8);
  if (!slaves.length) box.appendChild(h('div', { class: 'dim' }, 'None today.'));
  for (const s of slaves) {
    const lvl = Array.from(s.sk).reduce((a, b) => a + b, 0) / s.sk.length;
    const price = Math.round((1500 + lvl * 120) / 50) * 50;
    const b = h('button', { class: 'tog' }, `Buy (${fmt(price)}c)`);
    b.onclick = () => {
      if (S.W.money < price) { emit('notice', 'Not enough chits.'); return; }
      S.W.money -= price;
      uiSound('coin');
      recruit({ p, n: s, vars: {} });
      s.shackled = true;
      s.dirty = true;
      emit('notice', `${s.name} is yours. Their shackles are still on — pick them if you like.`, 'info');
      rerender();
    };
    box.appendChild(h('div', { class: 'mrow' }, h('img', { class: 'mate', src: portrait(s) }), h('span', {}, `${s.name}, ${s.raceDef?.name ?? ''}`), b));
  }
  return box;
}

const nameOf = (k: string) => ITEM[k]?.name.toLowerCase() ?? ({ food: 'food', drink: 'drink', medical: 'medicine', weapon: 'weapons', artifact: 'relics', book: 'books' } as Record<string, string>)[k] ?? k;
/** What this town has plenty of and what it pays well for. */
function marketLine(sh: Shop) {
  const m = marketOf(sh);
  if (!m) return null;
  return h('div', { class: 'market-line' },
    m.cheap.length ? h('span', {}, h('b', { class: 'good' }, 'Cheap here: '), m.cheap.map(nameOf).join(', ')) : null,
    m.dear.length ? h('span', {}, h('b', { class: 'gold' }, 'Pays well for: '), m.dear.map(nameOf).join(', ')) : null,
  );
}

/** Beasts for sale: pack animals to carry loads, hounds to fight at your side. */
const BEASTS_FOR_SALE: [string, number, string][] = [
  ['shellback', 3600, 'A slow, patient pack beast. Carries a great deal and bites anyone who tries to steal it.'],
  ['dunehound', 1800, 'A hound pup, raised to the leash. Fights for you, eats a lot.'],
  ['goatling', 700, 'A hardy goatling. Mostly good for meat and company.'],
];
function beastMarket(p: Char, sh: Shop, rerender: () => void) {
  const box = h('div', { class: 'market' }, h('div', { class: 'lhead' }, 'Beasts for sale'));
  for (const [sp, price, desc] of BEASTS_FOR_SALE) {
    const a = ANIMAL[sp];
    if (!a) continue;
    const b = h('button', { class: 'tog' }, `Buy (${fmt(price)}c)`);
    b.onclick = () => {
      if (S.W.money < price) { emit('notice', 'Not enough chits.'); return; }
      S.W.money -= price;
      sh.money += price;
      uiSound('coin');
      const beast = makeAnimal(S.W, sp, new RNG(Date.now() & 0xffffff));
      if (sp === 'shellback') beast.inv = new Grid(10, 10);
      recruit({ p, n: beast, vars: {} });
      beast.name = `${p.name.split(' ')[0]}'s ${a.name}`;
      const spot = S.nav.nearestOpen(p.x + 2, p.z + 2, 8) ?? [p.x, p.z];
      beast.x = spot[0]; beast.z = spot[1]; beast.y = S.T.heightAt(beast.x, beast.z);
      beast.order = { k: 'follow', id: p.id };
      emit('notice', `The ${a.name.toLowerCase()} is yours. It will follow ${p.name}.`, 'good');
      rerender();
    };
    box.appendChild(h('div', { class: 'mrow' }, h('span', {}, h('b', {}, a.name), h('div', { class: 'dim' }, desc)), b));
  }
  return box;
}

/** Iron Coin mercenaries for hire by the day. */
function mercHall(p: Char, sh: Shop, rerender: () => void) {
  const box = h('div', { class: 'market' }, h('div', { class: 'lhead' }, 'Mercenaries for hire (3 days)'));
  const price = 1500;
  const b = h('button', { class: 'tog' }, `Hire a squad of three (${fmt(price * 3)}c)`);
  b.onclick = () => {
    if (S.W.money < price * 3) { emit('notice', 'Not enough chits.'); return; }
    S.W.money -= price * 3;
    uiSound('coin');
    emit('hire:mercs', p.id, 3, 3);
    rerender();
  };
  box.appendChild(b);
  return box;
}
