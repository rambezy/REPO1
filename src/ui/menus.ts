// Main menu, intro, character selection, options and save/load screens.

import { G } from '../game/G';
import { el, esc } from '../core/util';
import { button, closeModal, openModal, uiRoot } from './common';
import { listSaves, loadGame, saveGame, SLOTS, hasAnySave } from '../game/save';
import { fmtDate, fmtTime } from '../game/time';
import { sfx, unlockAudio, setAmbient } from '../audio/sfx';
import { PREMADES, newGameState } from '../content/start';
import { makeActor } from '../game/actors';
import { maxHp } from '../game/character';
import { STAT_KEYS, SKILL_INFO, TRAITS } from '../data/stats';
import { drawPortrait } from '../render/portrait';

let menuEl: HTMLElement | null = null;
let bgRaf = 0;

export function showMainMenu() {
  G.screen = 'menu';
  menuEl?.remove();
  menuEl = el('div');
  menuEl.id = 'menu';
  const bg = el('canvas', 'bg') as HTMLCanvasElement;
  menuEl.appendChild(bg);
  const title = el('div', 'title', '<h1>DUSTFALL</h1><p>A POST-ATOMIC ROLE-PLAYING GAME</p>');
  menuEl.appendChild(title);
  const box = el('div', 'buttons panel');
  box.append(
    button('Intro', () => playIntro()),
    button('New Game', () => {
      unlockAudio();
      openCharacterSelect();
    }),
    button('Load Game', () => openSaves('load')),
    button('Options', () => openOptions(true)),
    button('Credits', () => showCredits()),
  );
  if (hasAnySave()) box.insertBefore(button('Continue', () => {
    unlockAudio();
    const saves = listSaves().filter(Boolean).sort((a, b) => b!.saved - a!.saved);
    if (saves[0]) loadGame(saves[0].slot);
  }), box.firstChild);
  menuEl.appendChild(box);
  menuEl.appendChild(el('div', 'foot', 'An original homage to the classic isometric wasteland RPGs of the late 1990s. All art, sound and writing are generated for this game.'));
  uiRoot().appendChild(menuEl);
  const sizeBg = () => {
    bg.width = window.innerWidth;
    bg.height = window.innerHeight;
  };
  sizeBg();
  window.addEventListener('resize', sizeBg);
  const loop = (t: number) => {
    if (!menuEl) return;
    paintMenuBg(bg, t / 1000);
    bgRaf = requestAnimationFrame(loop);
  };
  bgRaf = requestAnimationFrame(loop);
}

export function hideMainMenu() {
  cancelAnimationFrame(bgRaf);
  menuEl?.remove();
  menuEl = null;
}

function paintMenuBg(cv: HTMLCanvasElement, t: number) {
  const c = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  const sky = c.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#1a0e08');
  sky.addColorStop(0.45, '#5a2a12');
  sky.addColorStop(0.62, '#b0602a');
  sky.addColorStop(0.63, '#2a1a10');
  sky.addColorStop(1, '#0a0604');
  c.fillStyle = sky;
  c.fillRect(0, 0, W, H);
  // Sun
  const sg = c.createRadialGradient(W * 0.68, H * 0.58, 0, W * 0.68, H * 0.58, H * 0.5);
  sg.addColorStop(0, 'rgba(255,200,120,0.55)');
  sg.addColorStop(0.2, 'rgba(255,140,60,0.25)');
  sg.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = sg;
  c.fillRect(0, 0, W, H);
  c.fillStyle = '#f0b060';
  c.beginPath();
  c.arc(W * 0.68, H * 0.6, H * 0.07, Math.PI, 0);
  c.fill();
  // Ruined skyline
  c.fillStyle = '#140a06';
  let x = 0;
  let i = 0;
  while (x < W) {
    const w = 20 + ((i * 37) % 60);
    const h = 30 + ((i * 53) % 140) * (0.6 + Math.sin(i) * 0.3);
    c.fillRect(x, H * 0.63 - h, w, h + 2);
    if (i % 3 === 0) {
      c.beginPath();
      c.moveTo(x + w, H * 0.63 - h);
      c.lineTo(x + w + 10, H * 0.63 - h + 20);
      c.lineTo(x + w, H * 0.63 - h + 30);
      c.fill();
    }
    x += w + 4 + ((i * 17) % 20);
    i++;
  }
  // Drifting dust
  for (let k = 0; k < 90; k++) {
    const px = ((k * 97 + t * (10 + (k % 7) * 4)) % (W + 40)) - 20;
    const py = H * 0.2 + ((k * 61) % (H * 0.8)) + Math.sin(t + k) * 6;
    c.fillStyle = `rgba(230,180,120,${0.08 + (k % 5) * 0.03})`;
    c.fillRect(px, py, 2, 2);
  }
  // Lone figure on the ridge
  c.fillStyle = '#0a0503';
  const fx = W * 0.3;
  const fy = H * 0.63;
  c.fillRect(fx - 3, fy - 38, 6, 22);
  c.beginPath();
  c.arc(fx, fy - 44, 5, 0, 7);
  c.fill();
  c.fillRect(fx - 4, fy - 16, 3, 16);
  c.fillRect(fx + 1, fy - 16, 3, 16);
  c.fillRect(fx + 3, fy - 36, 16, 2);
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.fillRect(0, 0, W, H);
}

// ---------------------------------------------------------------- intro

const INTRO: { text: string; scene: string }[] = [
  { scene: 'city', text: 'Nobody alive remembers which side fired first. The histories burned along with everything else.' },
  { scene: 'flash', text: 'What we know is that the sky turned white for three days, and when the dust finally settled, the old world was gone.' },
  { scene: 'shelter', text: 'A lucky few were sealed below ground in the great public shelters. Shelter 29 was built into the side of a mountain in the Ember Basin, with room for four hundred souls.' },
  { scene: 'years', text: 'Eighty-six years have passed. Generations have been born, lived and died beneath the rock, and none of them has ever seen the sun.' },
  { scene: 'core', text: 'Now the hydro-core, the machine that purifies the shelter\'s water, has cracked. The reserve tanks hold one hundred and fifty days.' },
  { scene: 'door', text: 'The Warden has chosen one resident to go through the great hatch and find a replacement.\n\nThat resident is you.' },
];

export function playIntro(then?: () => void) {
  const wrap = el('div', 'slides');
  const cv = el('canvas') as HTMLCanvasElement;
  cv.width = 640;
  cv.height = 360;
  const text = el('div', 'text');
  const hint = el('div', 'hint', 'Click to continue &nbsp;&middot;&nbsp; Esc to skip');
  wrap.append(cv, text, hint);
  uiRoot().appendChild(wrap);
  let i = 0;
  let raf = 0;
  let t0 = performance.now();
  const loop = (t: number) => {
    paintScene(cv, INTRO[i].scene, (t - t0) / 1000);
    raf = requestAnimationFrame(loop);
  };
  const show = () => {
    text.innerHTML = esc(INTRO[i].text).replace(/\n/g, '<br>');
    t0 = performance.now();
  };
  const finish = () => {
    cancelAnimationFrame(raf);
    wrap.remove();
    window.removeEventListener('keydown', onKey);
    then?.();
  };
  const next = () => {
    i++;
    if (i >= INTRO.length) finish();
    else show();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') finish();
    else if (e.key === ' ' || e.key === 'Enter') next();
  };
  wrap.addEventListener('click', next);
  window.addEventListener('keydown', onKey);
  show();
  raf = requestAnimationFrame(loop);
}

export function paintScene(cv: HTMLCanvasElement, scene: string, t: number) {
  const c = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  c.fillStyle = '#000';
  c.fillRect(0, 0, W, H);
  const zoom = 1 + t * 0.015;
  c.save();
  c.translate(W / 2, H / 2);
  c.scale(zoom, zoom);
  c.translate(-W / 2, -H / 2);
  switch (scene) {
    case 'city': {
      const g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#20304a');
      g.addColorStop(1, '#8a6a4a');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#1a1a22';
      for (let i = 0; i < 24; i++) {
        const w = 18 + (i * 13) % 30;
        const h = 60 + (i * 47) % 180;
        c.fillRect(i * 28, H - h, w, h);
        c.fillStyle = 'rgba(255,220,140,0.6)';
        for (let k = 0; k < 8; k++) if ((i * k) % 3 === 0) c.fillRect(i * 28 + 4 + (k % 2) * 8, H - h + 10 + k * 14, 4, 5);
        c.fillStyle = '#1a1a22';
      }
      break;
    }
    case 'flash': {
      const a = Math.min(1, t / 2);
      c.fillStyle = `rgb(${255},${255 - a * 60},${255 - a * 140})`;
      c.fillRect(0, 0, W, H);
      c.fillStyle = `rgba(80,40,20,${a})`;
      c.beginPath();
      c.moveTo(W / 2 - 30, H);
      c.quadraticCurveTo(W / 2 - 20, H * 0.5, W / 2 - 80, H * 0.3);
      c.quadraticCurveTo(W / 2, H * 0.05 - t * 5, W / 2 + 80, H * 0.3);
      c.quadraticCurveTo(W / 2 + 20, H * 0.5, W / 2 + 30, H);
      c.fill();
      break;
    }
    case 'shelter': {
      c.fillStyle = '#3a2a1a';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#5a4a36';
      c.beginPath();
      c.moveTo(0, H * 0.3);
      c.lineTo(W * 0.4, H * 0.1);
      c.lineTo(W, H * 0.35);
      c.lineTo(W, H);
      c.lineTo(0, H);
      c.fill();
      c.fillStyle = '#2a3a3e';
      c.beginPath();
      c.arc(W / 2, H * 0.62, 70, 0, 7);
      c.fill();
      c.fillStyle = '#5a6a6e';
      c.beginPath();
      c.arc(W / 2, H * 0.62, 58, 0, 7);
      c.fill();
      c.fillStyle = '#e08a2a';
      c.font = 'bold 44px monospace';
      c.textAlign = 'center';
      c.fillText('29', W / 2, H * 0.62 + 15);
      break;
    }
    case 'years': {
      c.fillStyle = '#1a2224';
      c.fillRect(0, 0, W, H);
      for (let i = 0; i < 12; i++) {
        c.fillStyle = i % 2 ? '#2f7f86' : '#276a70';
        const x = 40 + i * 48;
        c.fillRect(x, H * 0.45, 22, 60);
        c.fillStyle = '#d8b090';
        c.beginPath();
        c.arc(x + 11, H * 0.45 - 10, 10, 0, 7);
        c.fill();
      }
      c.fillStyle = 'rgba(255,255,200,0.08)';
      for (let i = 0; i < 6; i++) c.fillRect(i * 110 + 30, 0, 50, H);
      break;
    }
    case 'core': {
      c.fillStyle = '#10181a';
      c.fillRect(0, 0, W, H);
      c.fillStyle = '#4a5a5e';
      c.fillRect(W / 2 - 90, H * 0.2, 180, 220);
      c.fillStyle = Math.sin(t * 6) > 0 ? '#ff3020' : '#601010';
      c.fillRect(W / 2 - 50, H * 0.3, 100, 50);
      c.strokeStyle = '#000';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(W / 2 - 40, H * 0.5);
      c.lineTo(W / 2 - 10, H * 0.6);
      c.lineTo(W / 2 + 5, H * 0.55);
      c.lineTo(W / 2 + 40, H * 0.7);
      c.stroke();
      c.fillStyle = 'rgba(80,160,200,0.6)';
      for (let i = 0; i < 5; i++) c.fillRect(W / 2 + 30 + i * 3, H * 0.7 + ((t * 60 + i * 20) % 80), 2, 6);
      break;
    }
    case 'door': {
      c.fillStyle = '#2a2622';
      c.fillRect(0, 0, W, H);
      const open = Math.min(1, t / 4);
      c.fillStyle = `rgba(255,230,180,${0.2 + open * 0.8})`;
      c.beginPath();
      c.arc(W / 2 + open * 60, H / 2, 110, 0, 7);
      c.fill();
      c.fillStyle = '#4a5054';
      c.beginPath();
      c.arc(W / 2 + open * 140, H / 2, 110, 0, 7);
      c.fill();
      c.fillStyle = '#6a7478';
      c.beginPath();
      c.arc(W / 2 + open * 140, H / 2, 94, 0, 7);
      c.fill();
      c.fillStyle = '#e08a2a';
      c.font = 'bold 48px monospace';
      c.textAlign = 'center';
      c.fillText('29', W / 2 + open * 140, H / 2 + 16);
      c.fillStyle = '#0a0806';
      c.fillRect(W / 2 - 8, H / 2 + 30, 12, 50);
      c.beginPath();
      c.arc(W / 2 - 2, H / 2 + 22, 8, 0, 7);
      c.fill();
      break;
    }
    default: {
      c.fillStyle = '#2a1a10';
      c.fillRect(0, 0, W, H);
    }
  }
  c.restore();
  // scanlines
  c.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < H; y += 3) c.fillRect(0, y, W, 1);
}

// ---------------------------------------------------------------- character select

function openCharacterSelect() {
  let idx = 0;
  const w = el('div', 'panel win');
  w.style.width = 'min(720px, 100vw)';
  const render = () => {
    const pre = PREMADES[idx];
    w.innerHTML = '';
    w.appendChild(el('h2', '', 'Choose your resident'));
    const row = el('div', 'row');
    row.style.cssText = 'gap:12px;align-items:stretch;flex-wrap:wrap';
    const pc = el('div', 'screen');
    pc.style.cssText = 'width:200px;height:200px;flex:none';
    const cv = el('canvas') as HTMLCanvasElement;
    cv.width = 200;
    cv.height = 200;
    cv.style.cssText = 'width:100%;height:100%';
    drawPortrait(cv.getContext('2d')!, 200, 200, { body: 'human', ...pre.look, bg: '#1e3436' } as any, pre.name, 0);
    pc.appendChild(cv);
    const a = makeActor('player', { uid: 'tmp', q: 0, r: 0 });
    Object.assign(a.stats, pre.stats);
    a.traits = pre.traits;
    a.tags = pre.tags;
    const info = el('div', 'screen');
    info.style.cssText = 'flex:1;min-width:240px;padding:10px 14px;font-size:13px;line-height:18px';
    info.innerHTML = `<b style="color:var(--amber);font-size:16px">${esc(pre.name)}</b><br><i>${esc(pre.blurb)}</i><br><br>` +
      STAT_KEYS.map((k) => `${k} ${pre.stats[k]}`).join(' &nbsp; ') +
      `<br>HP ${maxHp(a)}<br>Tagged: ${pre.tags.map((t) => SKILL_INFO[t].name).join(', ')}<br>Traits: ${pre.traits.map((t) => TRAITS.find((x) => x.id === t)?.name).join(', ') || 'none'}`;
    row.append(pc, info);
    w.appendChild(row);
    const nav = el('div', 'row');
    nav.style.cssText = 'justify-content:space-between;flex-wrap:wrap;gap:6px';
    nav.append(
      button('< Prev', () => {
        idx = (idx + PREMADES.length - 1) % PREMADES.length;
        render();
      }, 'small'),
      button('Take this resident', () => {
        closeModal('select');
        beginNewGame(idx);
      }),
      button('Create your own', () => {
        closeModal('select');
        beginNewGame(-1);
      }),
      button('Next >', () => {
        idx = (idx + 1) % PREMADES.length;
        render();
      }, 'small'),
      button('Back', () => closeModal('select'), 'small'),
    );
    w.appendChild(nav);
  };
  render();
  openModal('select', w);
}

async function beginNewGame(premade: number) {
  const state = newGameState(premade);
  G.state = state;
  if (premade < 0) {
    const { openCreation } = await import('./charscreen');
    const ok = await openCreation(state.player);
    if (!ok) {
      openCharacterSelect();
      return;
    }
  }
  const { startNewGame } = await import('../main');
  hideMainMenu();
  startNewGame();
}

function showCredits() {
  const w = el('div', 'panel win');
  w.style.width = 'min(520px, 100vw)';
  w.appendChild(el('h2', '', 'Credits'));
  w.appendChild(el('div', 'screen', `<div style="padding:12px;font-size:13px;line-height:19px">
    <b style="color:var(--amber)">DUSTFALL</b><br>
    An original post-atomic role-playing game in the tradition of the turn-based, isometric wasteland adventures of 1997.<br><br>
    Every map, character, line of dialogue, sprite, portrait, sound and melody is generated in code for this project.<br><br>
    <span style="color:var(--green-dim)">Controls: click to move or act, right-click to cycle cursor modes, A to target, R to reload, B to switch hands, I inventory, C character, L wrist-link, S skills, M map, Space ends your turn, Ctrl+S / Ctrl+L quick save / load. Touch: tap to act, long-press for options, drag to pan, pinch to zoom.</span>
  </div>`));
  w.appendChild(button('Close', () => closeModal('credits')));
  openModal('credits', w);
}

// ---------------------------------------------------------------- options & saves

export function openOptions(fromMenu = false) {
  if (G.modal && G.modal !== 'dialogue') return;
  const w = el('div', 'panel win opts');
  w.style.width = 'min(420px, 100vw)';
  w.appendChild(el('h2', '', 'Options'));
  if (!fromMenu) {
    const row = el('div', 'row');
    row.style.justifyContent = 'center';
    row.append(button('Save game', () => openSaves('save')), button('Load game', () => openSaves('load')));
    w.appendChild(row);
  }
  const scr = el('div', 'screen');
  scr.style.padding = '8px 12px';
  const opt = (label: string, get: () => string, cycle: () => void) => {
    const r = el('div', 'optrow');
    const v = el('span', '', get());
    r.append(el('span', '', label), v);
    r.style.cursor = 'pointer';
    r.onclick = () => {
      cycle();
      v.textContent = get();
      sfx('click');
      saveSettings();
    };
    scr.appendChild(r);
  };
  opt('Combat speed', () => ['Slow', 'Normal', 'Fast', 'Fastest'][[0.6, 1, 1.6, 2.5].indexOf(G.settings.combatSpeed)] ?? 'Normal', () => {
    const l = [0.6, 1, 1.6, 2.5];
    G.settings.combatSpeed = l[(l.indexOf(G.settings.combatSpeed) + 1) % l.length];
  });
  opt('Difficulty', () => G.settings.difficulty, () => {
    const l = ['easy', 'normal', 'hard'] as const;
    G.settings.difficulty = l[(l.indexOf(G.settings.difficulty) + 1) % 3];
  });
  opt('Sound effects', () => (G.settings.sound ? 'On' : 'Off'), () => (G.settings.sound = !G.settings.sound));
  opt('Ambient drone', () => (G.settings.music ? 'On' : 'Off'), () => {
    G.settings.music = !G.settings.music;
    setAmbient(G.settings.music ? (G.map?.def.music ?? 'wind') : 'none');
  });
  opt('Always run', () => (G.state?.flags?._run ? 'On' : 'Off'), () => {
    if (G.state) G.state.flags._run = !G.state.flags._run;
  });
  w.appendChild(scr);
  const foot = el('div', 'row');
  foot.style.justifyContent = 'center';
  if (!fromMenu) foot.appendChild(button('Quit to menu', () => {
    location.reload();
  }, 'red'));
  foot.appendChild(button('Done', () => closeModal('options')));
  w.appendChild(foot);
  openModal('options', w);
}

function saveSettings() {
  try {
    localStorage.setItem('dustfall.settings', JSON.stringify(G.settings));
  } catch {
    /* storage unavailable */
  }
}

export function loadSettings() {
  try {
    const s = localStorage.getItem('dustfall.settings');
    if (s) Object.assign(G.settings, JSON.parse(s));
  } catch {
    /* storage unavailable */
  }
}

export function openSaves(kind: 'save' | 'load') {
  const w = el('div', 'panel win saves');
  w.appendChild(el('h2', '', kind === 'save' ? 'Save game' : 'Load game'));
  const scr = el('div', 'screen');
  const saves = listSaves();
  SLOTS.forEach((slot, i) => {
    const info = saves[i];
    const row = el('div', 'slotrow');
    const label = slot === 'quick' ? 'Quick save' : 'Slot ' + slot;
    row.appendChild(el('div', '', info ? `${label}: ${esc(info.name)} (level ${info.level})<small>${esc(info.where)} &middot; ${fmtDate(info.time)} ${fmtTime(info.time)}</small>` : `${label}: <i style="color:var(--green-dim)">empty</i>`));
    if (kind === 'save') {
      if (slot !== 'quick') row.appendChild(button('Save', () => {
        if (saveGame(slot)) closeModal('saves');
      }, 'small'));
      else row.appendChild(el('span'));
    } else {
      const b = button('Load', () => {
        closeModal('saves');
        hideMainMenu();
        loadGame(slot);
      }, 'small');
      b.disabled = !info;
      row.appendChild(b);
    }
    if (info) row.appendChild(button('Del', () => {
      try {
        localStorage.removeItem('dustfall.save.' + slot);
      } catch { /* ignore */ }
      closeModal('saves');
      openSaves(kind);
    }, 'small'));
    else row.appendChild(el('span'));
    scr.appendChild(row);
  });
  w.appendChild(scr);
  w.appendChild(button('Close', () => closeModal('saves')));
  openModal('saves', w);
}
