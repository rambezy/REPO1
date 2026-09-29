// The bottom interface bar and top status line.

import { G, player } from '../game/G';
import { el, esc } from '../core/util';
import { LOG, on } from '../game/log';
import { armorClass, maxAp, maxHp } from '../game/character';
import { attackModes, currentMode, endPlayerTurn, reload, reloadAp, tryEndCombat } from '../game/combat';
import { ITEMS } from '../data/items';
import { iconURL } from '../render/icons';
import { button, uiRoot } from './common';
import { fmtDate, fmtTime, waterDaysLeft } from '../game/time';
import { sfx } from '../audio/sfx';
import { resize } from '../render/renderer';
import { autoEndTurn } from '../game/interact';

let hud: HTMLElement;
let logEl: HTMLElement;
let weaponEl: HTMLElement;
let apEl: HTMLElement;
let hpEl: HTMLElement;
let acEl: HTMLElement;
let combatBtns: HTMLElement;
let chaBtn: HTMLButtonElement;
let sneakEl: HTMLElement;
let topbar: HTMLElement;
let banner: HTMLElement;

export function initHud() {
  hud = el('div', 'panel');
  hud.id = 'hud';
  logEl = el('div', 'log screen');
  logEl.addEventListener('click', () => {
    logEl.classList.toggle('scroll');
    renderLog();
  });

  const menuCol = el('div', 'col menu');
  menuCol.append(
    button('INV', () => import('./inventory').then((m) => m.openInventory())),
    button('OPT', () => import('./menus').then((m) => m.openOptions())),
  );

  weaponEl = el('div', 'weapon screen');
  weaponEl.addEventListener('click', () => onWeaponClick());

  const mid = el('div', 'col mid');
  apEl = el('div', 'aps');
  const stats = el('div', 'stats');
  hpEl = el('span', 'digits', '000');
  acEl = el('span', 'digits', '00');
  stats.append(el('span', 'label', 'HP'), hpEl, el('span', 'label', 'AC'), acEl);
  combatBtns = el('div', 'combat');
  combatBtns.append(button('End turn', () => endPlayerTurn(), 'red'), button('End combat', () => tryEndCombat(), 'red'));
  sneakEl = el('div', 'sneak');
  mid.append(apEl, stats, combatBtns, sneakEl);

  const right = el('div', 'right');
  chaBtn = button('CHA', () => import('./charscreen').then((m) => m.openCharacter()));
  right.append(
    button('SKILL', () => import('./skilldex').then((m) => m.openSkilldex())),
    chaBtn,
    button('MAP', () => import('./automap').then((m) => m.openAutomap())),
    button('LINK', () => import('./pda').then((m) => m.openPda())),
    button('INV', () => import('./inventory').then((m) => m.openInventory()), 'mobile-only'),
    button('OPT', () => import('./menus').then((m) => m.openOptions()), 'mobile-only'),
  );
  hud.append(logEl, menuCol, weaponEl, mid, right);
  uiRoot().appendChild(hud);

  topbar = el('div', '');
  topbar.id = 'topbar';
  uiRoot().appendChild(topbar);
  banner = el('div', '', 'COMBAT');
  banner.id = 'combatbanner';
  uiRoot().appendChild(banner);

  on('log', renderLog);
  on('hud', refreshHud);
  on('time', refreshTop);
  on('combat', refreshHud);
  on('turn', refreshHud);
  on('levelup', refreshHud);
  on('mapchange', () => {
    refreshHud();
    refreshTop();
  });
  setInterval(() => {
    if (G.screen === 'play') refreshTop();
  }, 1000);
  const style = document.createElement('style');
  style.textContent = '@media (min-width: 761px){#hud .mobile-only{display:none}} @media (max-width: 760px){#hud .right{grid-template-columns:1fr 1fr}}';
  document.head.appendChild(style);
  resize();
  refreshHud();
}

export function showHud(v: boolean) {
  if (!hud) return;
  hud.style.display = v ? '' : 'none';
  topbar.style.display = v ? '' : 'none';
  resize();
}

function renderLog() {
  if (!logEl) return;
  const scroll = logEl.classList.contains('scroll');
  const lines = scroll ? LOG.slice(-120) : LOG.slice(-7);
  logEl.innerHTML = lines.map((l, i) => `<div class="${i < lines.length - 2 && !scroll ? 'old' : ''}">&bull; ${esc(l)}</div>`).join('');
  if (scroll) logEl.scrollTop = logEl.scrollHeight;
}

function onWeaponClick() {
  const p = player();
  const mode = currentMode(p);
  if (mode.weapon.ammo && mode.stack && (mode.stack.ammo ?? 0) < (mode.weapon.mag ?? 0)) {
    // If the gun is empty, clicking reloads.
    if ((mode.stack.ammo ?? 0) === 0) return doReload();
  }
  import('./input').then((m) => m.setCursorMode('target'));
}

function doReload() {
  const p = player();
  if (G.combat) {
    if (!G.combat.playerTurn) return;
    if ((p._ap ?? 0) < reloadAp(p)) return;
    if (reload(p)) p._ap! -= reloadAp(p);
    autoEndTurn();
  } else reload(p);
  refreshHud();
}

export function refreshHud() {
  if (!hud || !G.state) return;
  const p = player();
  hpEl.textContent = String(Math.max(0, p.hp)).padStart(3, '0');
  hpEl.style.color = p.hp < maxHp(p) * 0.3 ? '#ff2a1a' : '';
  acEl.textContent = String(armorClass(p)).padStart(2, '0');
  // Action points
  const max = maxAp(p);
  const cur = G.combat ? p._ap ?? 0 : max;
  apEl.innerHTML = '';
  for (let i = 0; i < Math.max(10, max); i++) {
    const d = el('i');
    if (i < cur) d.className = G.combat ? 'on' : 'warn';
    apEl.appendChild(d);
  }
  combatBtns.style.visibility = G.combat ? 'visible' : 'hidden';
  hud.classList.toggle('combat-on', !!G.combat);
  banner.style.display = G.combat ? (G.combat.playerTurn ? 'block' : 'block') : 'none';
  banner.textContent = G.combat ? (G.combat.playerTurn ? 'YOUR TURN' : 'ENEMY TURN') : '';
  banner.style.color = G.combat?.playerTurn ? '#7cff6a' : '#ff4a36';
  sneakEl.textContent = G.state.flags._sneak ? 'SNEAKING' : '';
  chaBtn.classList.toggle('blink', (G.state.flags._skillPts ?? 0) > 0 || (G.state.flags._perks ?? 0) > 0);
  // Weapon
  const mode = currentMode(p);
  const st = p.hands[p.active];
  const d = st ? ITEMS[st.id] : null;
  const icon = d?.icon ?? 'fist';
  weaponEl.innerHTML = '';
  const img = el('div', 'img');
  if (d) img.style.backgroundImage = `url(${iconURL(icon, 144, 96)})`;
  else img.innerHTML = '<div style="text-align:center;color:var(--amber);font-size:22px;padding-top:10px">&#9994;</div>';
  const name = el('div', 'name', esc(d?.name ?? 'Bare hands') + (p.active === 0 ? ' (L)' : ' (R)'));
  const info = el('div', 'info', `<span>${mode.label}</span><span>AP ${mode.ap}</span>`);
  weaponEl.append(name, img, info);
  if (mode.weapon.ammo && st) {
    const bar = el('div', 'ammo');
    const fill = el('i');
    fill.style.height = `${Math.round(((st.ammo ?? 0) / (mode.weapon.mag ?? 1)) * 100)}%`;
    bar.appendChild(fill);
    bar.title = `${st.ammo ?? 0}/${mode.weapon.mag}`;
    weaponEl.appendChild(bar);
  }
  const modes = attackModes(p);
  if (modes.length > 1) {
    const mb = button('▸', () => {
      p.mode[p.active] = (p.mode[p.active] + 1) % modes.length;
      refreshHud();
    }, 'small round modebtn');
    mb.title = 'Change attack mode';
    weaponEl.appendChild(mb);
  }
  const sw = button('⇄', () => {
    p.active = p.active === 1 ? 0 : 1;
    sfx('click');
    refreshHud();
  }, 'small round swap');
  sw.title = 'Switch hands (B)';
  weaponEl.appendChild(sw);
  if (mode.weapon.ammo && st && (st.ammo ?? 0) < (mode.weapon.mag ?? 0)) {
    const rb = button('R', () => doReload(), 'small round');
    rb.style.cssText = 'position:absolute;right:4px;bottom:22px';
    rb.title = 'Reload (R)';
    weaponEl.appendChild(rb);
  }
  refreshTop();
}

export function refreshTop() {
  if (!topbar || !G.state) return;
  const w = waterDaysLeft();
  const water = G.state.flags.coreReturned
    ? (G.state.armyDeadline ? `<span class="water">Threat: ${Math.max(0, Math.ceil((G.state.armyDeadline - G.state.time) / 1440))} days</span>` : '')
    : `<span class="water ${w <= 10 ? 'low' : ''}">Water: ${w} days</span>`;
  topbar.innerHTML = `<span class="screen">${fmtDate(G.state.time)} &nbsp; ${fmtTime(G.state.time)}</span><span class="screen">${water || (G.map?.def.name ?? '')}</span>`;
}

export function hudHeight(): number {
  return hud?.offsetHeight ?? 0;
}
