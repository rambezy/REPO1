// Small modal dialogs: sleep, wait, confirm and messages.

import { openScreen, el, button } from './ui';
import { S, hourF } from '../state';
import { sleepHours, waitHours, hoursUntil } from '../systems/survival';
import { notify } from './notify';
import { G } from '../G';
import { here } from '../world/world';

export function messageBox(title: string, html: string, buttons: { label: string; primary?: boolean }[] = [{ label: 'Close', primary: true }]): Promise<number> {
  return new Promise((resolve) => {
    let res = -1;
    openScreen('message', (close) => {
      const m = el('div', { cls: 'vellum modal' });
      m.append(el('h2', { html: title }), el('div', { html }));
      const row = el('div', { cls: 'row' });
      buttons.forEach((b, i) => row.append(button(b.label, () => { res = i; close(); resolve(i); }, b.primary ? 'btn primary' : 'btn')));
      m.append(row);
      return m;
    }, { onKey: () => false });
    // resolve with -1 if closed some other way
    const iv = setInterval(() => { if (!document.querySelector('.screen')) { clearInterval(iv); if (res === -1) resolve(-1); } }, 200);
  });
}

export function confirmBox(title: string, html: string, yes = 'Yes', no = 'No'): Promise<boolean> {
  return messageBox(title, html, [{ label: no }, { label: yes, primary: true }]).then((i) => i === 1);
}

function enemiesNear() {
  return here().some((a) => a.hostile && !a.dead && Math.hypot(a.x - G.player.x, a.y - G.player.y) < 250);
}

export function sleepMenu(quality: number) {
  if (enemiesNear()) { notify('You cannot rest with enemies nearby.', 'bad'); return; }
  openScreen('sleep', (close) => {
    const m = el('div', { cls: 'vellum modal' });
    m.append(el('h2', { html: 'Sleep' }));
    const untilDawn = Math.round(hoursUntil(6.5) * 2) / 2;
    let hours = Math.max(1, Math.min(12, untilDawn));
    const label = el('label', { html: '' });
    const slider = el('input', { type: 'range', min: '1', max: '14', step: '0.5', value: String(hours), id: 'sleep-hours' });
    const upd = () => {
      hours = parseFloat(slider.value);
      const wake = (hourF() + hours) % 24;
      label.innerHTML = `<span>Sleep for <b>${hours}</b> hours</span><span>wake at ${Math.floor(wake).toString().padStart(2, '0')}:${Math.round((wake % 1) * 60).toString().padStart(2, '0')}</span>`;
    };
    slider.addEventListener('input', upd);
    upd();
    m.append(el('p', { html: `Energy <b>${Math.round(S.energy)}</b> / 100. Sleeping restores energy and health${S.hunger < 25 ? ', though you\'ll wake hungry' : ''}. The game saves when you wake.` }), label, slider);
    const row = el('div', { cls: 'row' });
    row.append(button('Until dawn', () => { close(); sleepHours(untilDawn, { quality }); }), button('Cancel', () => close()), button('Sleep', () => { close(); sleepHours(hours, { quality }); }, 'btn primary'));
    m.append(row);
    return m;
  });
}

export function waitMenu() {
  if (enemiesNear()) { notify('You cannot wait with enemies nearby.', 'bad'); return; }
  openScreen('wait', (close) => {
    const m = el('div', { cls: 'vellum modal' });
    m.append(el('h2', { html: 'Wait' }));
    let hours = 1;
    const label = el('label');
    const slider = el('input', { type: 'range', min: '0.5', max: '12', step: '0.5', value: '1', id: 'wait-hours' });
    const upd = () => { hours = parseFloat(slider.value); label.innerHTML = `<span>Wait <b>${hours}</b> hour${hours === 1 ? '' : 's'}</span>`; };
    slider.addEventListener('input', upd);
    upd();
    m.append(el('p', { html: 'Time passes. Hunger and fatigue do not wait with you.' }), label, slider);
    const row = el('div', { cls: 'row' });
    row.append(button('Cancel', () => close()), button('Wait', () => { close(); waitHours(hours); }, 'btn primary'));
    m.append(row);
    return m;
  });
}
