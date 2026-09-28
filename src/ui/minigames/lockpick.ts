// Lockpicking: rotate the pick to find the sweet spot, then turn the lock.
// Straining in the wrong place bends the pick until it snaps.

import { openScreen, el, button } from '../ui';
import { makeCanvas } from '../../gfx/pixel';
import { input } from '../../engine/input';
import { skill, hasPerk, addXp } from '../../systems/stats';
import { removeItem, count } from '../../systems/inventory';
import { sfx } from '../../audio/sfx';
import { notify } from '../notify';
import { rand } from '../../engine/util';
import { G } from '../../G';
import { P } from '../../gfx/palette';

export function lockpick(difficulty: number): Promise<boolean> {
  return new Promise((resolve) => {
    let result = false;
    const W = 320, H = 220;
    const sweet = rand.range(-Math.PI * 0.85, -Math.PI * 0.15);
    const width = Math.max(0.07, 0.36 - difficulty * 0.055 + skill('thievery') * 0.022);
    let pick = -Math.PI / 2;
    let turn = 0; // 0..1
    let strain = 0;
    let hp = hasPerk('nimble') ? 1.6 : 1;
    let dragging = false;
    let turning = false;
    let done = false;
    let raf = 0;
    const close = openScreen('lockpick', (closeFn) => {
      const m = el('div', { cls: 'vellum mg' });
      m.append(el('h2', { html: 'Picking the Lock' }));
      m.append(el('p', { cls: 'help', html: 'Move the pick around the lock with the mouse, drag, or ←/→. Hold <span class="kbd">Space</span> (or the Turn button) to turn. If the pick strains, you are in the wrong place. Difficulty: ' + '●'.repeat(difficulty) + '○'.repeat(Math.max(0, 5 - difficulty)) }));
      const c = makeCanvas(W, H);
      c.style.maxWidth = '520px';
      c.style.alignSelf = 'center';
      m.append(c);
      const info = el('p', { cls: 'meta', html: '' });
      m.append(info);
      const row = el('div', { cls: 'row', style: 'display:flex;gap:8px;justify-content:flex-end' } as never);
      const turnBtn = button('Turn (hold)', () => {});
      turnBtn.addEventListener('mousedown', () => (turning = true));
      turnBtn.addEventListener('touchstart', (e) => { e.preventDefault(); turning = true; }, { passive: false });
      const stop = () => (turning = false);
      turnBtn.addEventListener('mouseup', stop); turnBtn.addEventListener('mouseleave', stop); turnBtn.addEventListener('touchend', stop);
      row.append(button('Give up', () => { finish(false); }), turnBtn);
      m.append(row);
      const ctx = c.getContext('2d')!;
      const setFromPointer = (clientX: number, clientY: number) => {
        const r = c.getBoundingClientRect();
        const x = ((clientX - r.left) / r.width) * W - W / 2, y = ((clientY - r.top) / r.height) * H - 120;
        const a = Math.atan2(y, x);
        pick = Math.max(-Math.PI, Math.min(0, a));
      };
      c.addEventListener('mousemove', (e) => setFromPointer(e.clientX, e.clientY));
      c.addEventListener('touchstart', (e) => { dragging = true; setFromPointer(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
      c.addEventListener('touchmove', (e) => { if (dragging) setFromPointer(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
      c.addEventListener('touchend', () => (dragging = false));
      let last = performance.now();
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        result = ok;
        cancelAnimationFrame(raf);
        closeFn();
        resolve(ok);
      };
      const frame = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (input.down('left')) pick = Math.max(-Math.PI, pick - dt * 1.4);
        if (input.down('right')) pick = Math.min(0, pick + dt * 1.4);
        const holding = turning || input.down('dodge') || input.down('attack') || input.down('confirm');
        const off = Math.abs(pick - sweet);
        const maxTurn = off < width ? 1 : Math.max(0, 1 - (off - width) * 1.6);
        if (holding) {
          turn = Math.min(maxTurn, turn + dt * 1.1);
          if (turn >= maxTurn - 0.01 && maxTurn < 1) {
            strain += dt;
            hp -= dt * (0.55 + difficulty * 0.08);
            if (Math.random() < dt * 6) sfx('lockclick');
            if (hp <= 0) {
              sfx('lockbreak');
              removeItem('lockpick', 1);
              notify(count('lockpick') > 0 ? `The pick snaps. ${count('lockpick')} left.` : 'Your last pick snaps.', 'bad', 2200);
              if (count('lockpick') <= 0) { finish(false); return; }
              hp = hasPerk('nimble') ? 1.6 : 1;
              turn = 0;
            }
          } else strain = Math.max(0, strain - dt);
        } else {
          turn = Math.max(0, turn - dt * 2);
          strain = 0;
        }
        if (turn >= 0.999) {
          sfx('unlock');
          addXp('thievery', 4 + difficulty * 2);
          finish(true);
          return;
        }
        // draw
        ctx.fillStyle = '#1b1410';
        ctx.fillRect(0, 0, W, H);
        const cx = W / 2, cy = 120;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.fillStyle = P.metal1;
        ctx.beginPath(); ctx.arc(0, 0, 82, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = P.metal2;
        ctx.beginPath(); ctx.arc(0, 0, 74, 0, Math.PI * 2); ctx.fill();
        ctx.rotate(turn * Math.PI / 2);
        ctx.fillStyle = P.metal3;
        ctx.beginPath(); ctx.arc(0, 0, 50, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#0b0807';
        ctx.fillRect(-4, -22, 8, 30);
        ctx.beginPath(); ctx.arc(0, -22, 8, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // pick
        const shake = strain > 0 ? rand.range(-2, 2) : 0;
        ctx.strokeStyle = P.metal4;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(pick) * 110 + shake, cy + Math.sin(pick) * 110 + shake);
        ctx.lineTo(cx + Math.cos(pick) * 8, cy + Math.sin(pick) * 8);
        ctx.stroke();
        ctx.fillStyle = P.wood3;
        ctx.fillRect(cx + Math.cos(pick) * 110 - 5, cy + Math.sin(pick) * 110 - 5, 10, 10);
        // pick health
        ctx.fillStyle = '#3a2c1e';
        ctx.fillRect(10, 10, 100, 8);
        ctx.fillStyle = hp > 0.4 ? '#d9b26a' : '#c4553d';
        ctx.fillRect(10, 10, Math.max(0, (hp / (hasPerk('nimble') ? 1.6 : 1)) * 100), 8);
        info.textContent = `Lockpicks: ${count('lockpick')}`;
        if (!done && G.mode === 'menu') raf = requestAnimationFrame(frame);
        else if (!done) finish(false);
      };
      raf = requestAnimationFrame(frame);
      return m;
    });
    void close;
    void result;
  });
}
