// Trading: drag goods between your pack and the shop's stock. Prices depend
// on the shop and your standing with its faction.
import { h, openWindow, getWindow } from './dom';
import { GridView, hideTip } from './grid';
import { S } from '../sim/ctx';
import { Shop, buyPrice, sellPrice, shopGrid } from '../sim/shops';
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
  const render = () => {
    cleanup();
    w.body.innerHTML = '';
    const mine = h('div', { class: 'lootside' }, h('div', { class: 'lhead' }, `${p.name}`));
    const grids = [p.inv, p.eq.back?.inv].filter(Boolean) as import('../sim/inventory').Grid[];
    // selling: drop from shop stock into our grid = buy; from our grid to the shop = sell
    for (const g of grids) {
      const v = new GridView(g, {
        label: g === p.inv ? 'Inventory' : ITEM[p.eq.back!.id].name,
        price: (it) => sellPrice(sh, it) * it.n,
        accept: (it, src) => {
          if (src.kind === 'grid' && src.grid === stock) {
            const cost = buyPrice(sh, it) * it.n;
            if (S.W.money < cost) { msg = `You need ${fmt(cost)} chits.`; setTimeout(render, 0); return false; }
            return true;
          }
          return true;
        },
        moved: (it, src, dst) => {
          if (src.kind === 'grid' && src.grid === stock && dst.kind === 'grid' && dst.grid === g) {
            const cost = buyPrice(sh, it) * it.n;
            S.W.money -= cost; sh.money += cost; uiSound('coin');
            it.stolen = undefined;
            msg = `Bought ${ITEM[it.id].name}${it.n > 1 ? ' ×' + it.n : ''} for ${fmt(cost)}c.`;
            emit('sound', 'coin', p.x, p.z, 1);
            S.W.rel.add('player', sh.faction, 0.2);
          }
          setTimeout(render, 0);
        },
        rclick: (it) => { sell(it, g); },
      });
      views.push(v);
      mine.appendChild(v.el);
    }
    const shopSide = h('div', { class: 'lootside' }, h('div', { class: 'lhead' }, `${sh.name}`));
    const sv = new GridView(stock, {
      label: 'For sale',
      price: (it) => buyPrice(sh, it) * it.n,
      accept: (it, src) => {
        if (src.kind !== 'grid' || src.grid === stock) return true;
        const val = sellPrice(sh, it) * it.n;
        if (val <= 0) { msg = `${n.name} won't touch that.`; setTimeout(render, 0); return false; }
        if (sh.money < val) { msg = `${n.name} can't afford it (${fmt(sh.money)}c left).`; setTimeout(render, 0); return false; }
        return true;
      },
      moved: (it, src, dst) => {
        if (dst.kind === 'grid' && dst.grid === stock && src.kind === 'grid' && src.grid !== stock) {
          const val = sellPrice(sh, it) * it.n;
          S.W.money += val; sh.money -= val; uiSound('coin');
          msg = `Sold ${ITEM[it.id].name}${it.n > 1 ? ' ×' + it.n : ''} for ${fmt(val)}c.`;
          emit('sound', 'coin', p.x, p.z, 1);
          it.stolen = undefined;
        }
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
      ),
      h('div', { class: 'purses' },
        h('div', {}, 'Your chits: ', h('b', { class: 'gold' }, fmt(S.W.money))),
        h('div', {}, 'Shop chits: ', h('b', {}, fmt(sh.money))),
      ),
    );
    const extra = sh.kind === 'slaves' ? slaveMarket(p, sh, render) : sh.kind === 'mercs' ? mercHall(p, sh, render) : sh.kind === 'animals' ? beastMarket(p, sh, render) : null;
    w.body.append(head, h('div', { class: 'loot' }, mine, shopSide), extra ?? '', h('div', { class: 'lootfoot' }, h('span', { class: 'dim' }, msg || 'Drag items across to buy or sell. Right-click to buy or sell a whole stack.'), h('span')));
  };
  const buy = (it: Item) => {
    const cost = buyPrice(sh, it) * it.n;
    if (S.W.money < cost) { msg = `You need ${fmt(cost)} chits.`; render(); return; }
    stock.remove(it);
    if (!p.inv.put(it) && !(p.eq.back?.inv?.put(it))) { stock.put(it); msg = 'No room in your pack.'; render(); return; }
    S.W.money -= cost; sh.money += cost; uiSound('coin');
    msg = `Bought ${ITEM[it.id].name} for ${fmt(cost)}c.`;
    emit('sound', 'coin', p.x, p.z, 1);
    render();
  };
  const sell = (it: Item, g: import('../sim/inventory').Grid) => {
    const val = sellPrice(sh, it) * it.n;
    if (val <= 0) { msg = `${n.name} won't touch that.`; render(); return; }
    if (sh.money < val) { msg = `${n.name} can't afford it.`; render(); return; }
    g.remove(it);
    if (!stock.put(it)) stock.add(it.id, it.n, it.q);
    S.W.money += val; sh.money -= val; uiSound('coin');
    it.stolen = undefined;
    msg = `Sold ${ITEM[it.id].name} for ${fmt(val)}c.`;
    emit('sound', 'coin', p.x, p.z, 1);
    render();
  };
  render();
  const iv = setInterval(() => { const ww = getWindow('trade'); if (!ww) clearInterval(iv); else if (Math.hypot(p.x - n.x, p.z - n.z) > 6) ww.close(); }, 500);
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
