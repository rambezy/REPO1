// Death, failure and victory sequences with ending slides.

import { G } from '../game/G';
import { el, esc } from '../core/util';
import { uiRoot, closeAllModals, button } from './common';
import { ENDINGS } from '../content/registry';
import { ctx } from '../game/script';
import { paintScene } from './menus';
import { setAmbient } from '../audio/sfx';
import { endCombat } from '../game/combat';

const FAIL_TEXT: Record<string, { title: string; text: string; scene: string }> = {
  death: {
    title: 'Your journey ends here',
    scene: 'dust',
    text: 'The wasteland keeps what it takes. Your body is never found, and in Shelter 29 the water gauges keep falling. One day, much later, someone else will open the great hatch and walk out into the light to finish what you started. Or no one will.',
  },
  water: {
    title: 'The taps run dry',
    scene: 'shelter',
    text: 'One hundred and fifty days came and went. When the last reserve tank sputtered empty, the Warden ordered the great hatch opened, and four hundred people who had never seen the sky walked out into the Basin with nothing but their jumpsuits. Few of them lived through the first summer.',
  },
  army: {
    title: 'The Grafted come',
    scene: 'shelter',
    text: 'The Shepherd\'s patrols found the mountain at last. The great hatch held for most of a day. By nightfall the halls of Shelter 29 were silent, and the Shepherd had four hundred new subjects for the vats.',
  },
};

export function showEnding(kind: string) {
  if (G.state.ended && kind !== 'victory') return;
  G.state.ended = kind;
  if (G.combat) endCombat();
  closeAllModals();
  G.screen = 'end';
  setAmbient('none');
  if (kind === 'victory') return playSlides(victorySlides(), 'THE END');
  const f = FAIL_TEXT[kind] ?? FAIL_TEXT.death;
  playSlides([{ title: f.title, text: f.text, scene: f.scene }], 'GAME OVER');
}

function victorySlides(): { title: string; text: string; scene: string }[] {
  const c = ctx();
  const slides: { title: string; text: string; scene: string }[] = [];
  for (const s of [...ENDINGS].sort((a, b) => a.order - b.order)) {
    const t = s.text(c);
    if (t) slides.push({ title: s.title, text: t, scene: s.scene ?? 'dust' });
  }
  if (!slides.length) slides.push({ title: 'Victory', text: 'The Basin breathes a little easier.', scene: 'dust' });
  return slides;
}

function playSlides(slides: { title: string; text: string; scene: string }[], finalTitle: string) {
  const wrap = el('div', 'slides');
  wrap.style.zIndex = '150';
  const h = el('h2');
  const cv = el('canvas') as HTMLCanvasElement;
  cv.width = 640;
  cv.height = 360;
  const text = el('div', 'text');
  const hint = el('div', 'hint', 'Click to continue');
  wrap.append(h, cv, text, hint);
  uiRoot().appendChild(wrap);
  let i = 0;
  let t0 = performance.now();
  let raf = 0;
  const loop = (t: number) => {
    const s = slides[Math.min(i, slides.length - 1)];
    paintScene(cv, s.scene === 'dust' ? 'shelter' : s.scene, (t - t0) / 1000);
    raf = requestAnimationFrame(loop);
  };
  const show = () => {
    const s = slides[i];
    h.textContent = s.title;
    text.innerHTML = esc(s.text).replace(/\n/g, '<br>');
    t0 = performance.now();
  };
  const next = () => {
    i++;
    if (i < slides.length) return show();
    cancelAnimationFrame(raf);
    wrap.innerHTML = '';
    wrap.appendChild(el('h2', '', finalTitle));
    wrap.appendChild(el('div', 'text', G.state.ended === 'victory' ? 'Thank you for playing Dustfall.' : 'Load a saved game to try again.'));
    const row = el('div', 'row');
    row.style.cssText = 'display:flex;gap:10px';
    row.append(
      button('Load game', () => import('./menus').then((m) => m.openSaves('load'))),
      button('Main menu', () => location.reload()),
    );
    if (G.state.ended === 'victory') row.prepend(button('Keep exploring', () => {
      G.state.ended = undefined;
      wrap.remove();
      G.screen = G.map ? 'play' : 'world';
      if (!G.map) import('./worldmap').then((w) => w.openWorldMap());
    }));
    wrap.appendChild(row);
    wrap.removeEventListener('click', next);
  };
  wrap.addEventListener('click', next);
  show();
  raf = requestAnimationFrame(loop);
}
