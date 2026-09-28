// Smithing at the forge: keep the iron at "dawn colour" with the bellows,
// strike when the hammer mark sits on the target, then quench.

import { openScreen, el, button } from '../ui';
import { makeCanvas } from '../../gfx/pixel';
import { input } from '../../engine/input';
import { sfx } from '../../audio/sfx';
import { P } from '../../gfx/palette';
import { hasPerk, skill, addXp } from '../../systems/stats';
import { rand, clamp } from '../../engine/util';
import { G } from '../../G';

export interface ForgeOpts { title: string; strikes: number; help?: string; shape?: 'horseshoe' | 'blade' | 'knife' | 'sword'; easy?: boolean }

export function forge(opts: ForgeOpts): Promise<number> {
  return new Promise((resolve) => {
    const W = 360, H = 200;
    let temp = 0.35;
    let progress = 0;
    let quality = 100;
    let marker = 0; // 0..1 across the piece
    let dirm = 1;
    let target = rand.range(0.2, 0.8);
    let phase: 'work' | 'quench' | 'done' = 'work';
    let flash = 0;
    let hammerT = 0;
    let msg = 'Pump the bellows until the iron glows like dawn.';
    let done = false;
    const sparks: { x: number; y: number; vx: number; vy: number; l: number }[] = [];
    const zoneW = (opts.easy ? 0.2 : 0.13) + skill('smithing') * 0.008 + (hasPerk('fathers_hands') ? 0.03 : 0);
    const speed = 0.9 + opts.strikes * 0.02;
    openScreen('forge', (close) => {
      const m = el('div', { cls: 'vellum mg' });
      m.append(el('h2', { html: opts.title }));
      m.append(el('p', { cls: 'help', html: opts.help || 'Bellows heat the iron; it cools as you work. Strike only when it glows orange-gold, and only when the hammer mark is over the bright target. When the work is shaped, quench it while it is hot.' }));
      const c = makeCanvas(W, H);
      c.style.maxWidth = '720px';
      c.style.alignSelf = 'center';
      m.append(c);
      const info = el('p', { cls: 'meta' });
      m.append(info);
      const row = el('div', { cls: 'row' });
      row.style.display = 'flex'; row.style.gap = '8px'; row.style.justifyContent = 'flex-end'; row.style.flexWrap = 'wrap';
      const bellowsBtn = button('Bellows (B / hold)', () => pump());
      const strikeBtn = button('Strike (Space / E)', () => strike(), 'btn primary');
      const quenchBtn = button('Quench (Q)', () => quench());
      row.append(bellowsBtn, strikeBtn, quenchBtn, button('Leave it', () => finish(0)));
      m.append(row);
      c.addEventListener('mousedown', () => strike());
      const ctx = c.getContext('2d')!;
      const pump = () => { if (phase === 'done') return; temp = Math.min(1.05, temp + 0.12); sfx('bellows'); };
      const strike = () => {
        if (phase !== 'work' || hammerT > 0) return;
        hammerT = 0.18;
        sfx('hammer');
        for (let i = 0; i < 10; i++) sparks.push({ x: 90 + marker * 180, y: 118, vx: rand.range(-80, 80), vy: rand.range(-120, -30), l: rand.range(0.3, 0.7) });
        const inZone = Math.abs(marker - target) < zoneW / 2;
        if (temp < 0.55) { quality -= 7; msg = 'The iron is too cold: the hammer rings off it. Heat it up.'; flash = 0.3; return; }
        if (temp > 0.92) { quality -= 6; msg = 'Too hot, it\'s burning! The steel sparks white.'; }
        if (!inZone) { quality -= 5; msg = 'A glancing blow. Watch the mark.'; progress += 0.4; }
        else { progress += 1; msg = rand.pick(['Good!', 'Clean strike.', 'That\'s it. Again.', 'The iron sings.']); }
        temp -= 0.05;
        target = rand.range(0.15, 0.85);
        addXp('smithing', 1);
        addXp('strength', 0.5);
        if (progress >= opts.strikes) { phase = 'quench'; msg = 'Shaped. Now quench it, while it is still hot.'; }
      };
      const quench = () => {
        if (phase !== 'quench') return;
        sfx('quench');
        if (temp < 0.5) { quality -= 15; msg = 'Too cold: the temper will be soft.'; }
        else if (temp > 0.95) { quality -= 10; msg = 'Too hot: a hairline crack.'; }
        else msg = 'A good quench.';
        phase = 'done';
        addXp('smithing', 6);
        setTimeout(() => finish(Math.max(10, quality)), 900);
      };
      const finish = (q: number) => {
        if (done) return;
        done = true;
        close();
        resolve(q);
      };
      let last = performance.now();
      const frame = (now: number) => {
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (input.pressed('confirm') || input.pressed('interact') || input.pressed('attack')) strike();
        if (input.pressed('journal') || input.down('journal')) pump();
        if (input.pressed('dog')) quench();
        temp = Math.max(0, temp - dt * 0.07);
        if (phase === 'work') {
          marker += dirm * dt * speed;
          if (marker > 1) { marker = 1; dirm = -1; }
          if (marker < 0) { marker = 0; dirm = 1; }
        }
        if (hammerT > 0) hammerT -= dt;
        if (flash > 0) flash -= dt;
        // draw
        ctx.fillStyle = '#1b1410';
        ctx.fillRect(0, 0, W, H);
        // forge glow backdrop
        const g = ctx.createRadialGradient(W / 2, 150, 10, W / 2, 150, 200);
        g.addColorStop(0, `rgba(255,140,50,${0.15 + temp * 0.25})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
        // anvil
        ctx.fillStyle = P.metal1; ctx.fillRect(70, 124, 220, 16);
        ctx.fillStyle = P.metal2; ctx.fillRect(70, 120, 220, 6);
        ctx.fillStyle = P.metal0; ctx.fillRect(140, 140, 80, 30);
        ctx.fillStyle = P.wood1; ctx.fillRect(130, 170, 100, 30);
        // workpiece colour by temperature
        const col = temp < 0.35 ? '#5a3a30' : temp < 0.55 ? '#a03a20' : temp < 0.75 ? '#f07a24' : temp < 0.92 ? '#ffc24a' : '#fff3d0';
        ctx.fillStyle = col;
        if (opts.shape === 'horseshoe') {
          ctx.lineWidth = 9; ctx.strokeStyle = col;
          ctx.beginPath(); ctx.arc(180, 118, 38, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke();
          ctx.lineWidth = 1;
        } else {
          const len = opts.shape === 'knife' ? 130 : 190;
          ctx.fillRect(180 - len / 2, 111, len, 8);
          ctx.beginPath(); ctx.moveTo(180 + len / 2, 111); ctx.lineTo(180 + len / 2 + 14, 115); ctx.lineTo(180 + len / 2, 119); ctx.fill();
        }
        // target zone and marker
        if (phase === 'work') {
          ctx.fillStyle = 'rgba(255,240,180,0.35)';
          ctx.fillRect(90 + (target - zoneW / 2) * 180, 100, zoneW * 180, 24);
          ctx.fillStyle = '#fff';
          ctx.fillRect(90 + marker * 180 - 1, 96, 3, 30);
        }
        // hammer
        const hy = hammerT > 0 ? 70 + (0.18 - hammerT) * 200 : 50;
        ctx.save();
        ctx.translate(90 + marker * 180, Math.min(100, hy));
        ctx.fillStyle = P.wood2; ctx.fillRect(-2, -40, 4, 40);
        ctx.fillStyle = P.metal2; ctx.fillRect(-12, -4, 24, 12);
        ctx.restore();
        // sparks
        for (let i = sparks.length - 1; i >= 0; i--) {
          const s = sparks[i];
          s.l -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 300 * dt;
          if (s.l <= 0) { sparks.splice(i, 1); continue; }
          ctx.fillStyle = s.l > 0.3 ? '#fff3b0' : '#ffb347';
          ctx.fillRect(s.x, s.y, 2, 2);
        }
        // temperature bar
        ctx.fillStyle = '#3a2c1e'; ctx.fillRect(12, 20, 14, 150);
        const tg = ctx.createLinearGradient(0, 170, 0, 20);
        tg.addColorStop(0, '#5a3a30'); tg.addColorStop(0.45, '#a03a20'); tg.addColorStop(0.62, '#f07a24'); tg.addColorStop(0.82, '#ffc24a'); tg.addColorStop(1, '#fff3d0');
        ctx.fillStyle = tg; ctx.fillRect(14, 170 - clamp(temp, 0, 1) * 148, 10, clamp(temp, 0, 1) * 148);
        ctx.strokeStyle = '#f0e0a0'; ctx.strokeRect(11, 170 - 0.9 * 148, 16, (0.9 - 0.57) * 148);
        // progress
        ctx.fillStyle = '#3a2c1e'; ctx.fillRect(40, 20, 280, 8);
        ctx.fillStyle = '#d9b26a'; ctx.fillRect(40, 20, 280 * Math.min(1, progress / opts.strikes), 8);
        if (flash > 0) { ctx.fillStyle = `rgba(160,160,200,${flash})`; ctx.fillRect(0, 0, W, H); }
        info.innerHTML = `${msg} &nbsp; <b>Quality ${Math.max(0, Math.round(quality))}</b>`;
        if (!done && G.mode === 'menu') requestAnimationFrame(frame);
        else if (!done) finish(0);
      };
      requestAnimationFrame(frame);
      return m;
    });
  });
}
