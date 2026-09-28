// Presentation hooks for the sim: speech, floating text, notices, sounds.
import { S } from '../sim/ctx';
import { G } from '../state';
import { emit } from '../core/events';
import { Char } from '../sim/char';

export function setupFx() {
  S.fx = {
    hit(c: Char, by: Char, dmg: number, blocked: boolean) {
      if (!c.view) return;
      if (blocked) G.overlay.floater(c, 'blocked', '#c8c0a8');
      else if (dmg > 0.5 && (c.faction === 'player' || by.faction === 'player')) G.overlay.floater(c, String(Math.round(dmg)), c.faction === 'player' ? '#f08868' : '#f8e0a0');
      emit('fx:hit', c, by, dmg, blocked);
    },
    say(c: Char, text: string) {
      c.bark = text;
      c.barkT = 3 + text.length * 0.05;
    },
    sound(name: string, x: number, z: number, vol = 1) { emit('sound', name, x, z, vol); },
    shot(from: Char, x: number, z: number, hit: boolean) { emit('fx:shot', from, x, z, hit); },
    notice(text: string, kind = 'info') { emit('notice', text, kind); },
    died(c: Char) { if (c.view) G.overlay.floater(c, 'dead', '#d05040'); emit('fx:died', c); },
    ko(c: Char) {
      if (c.view) G.overlay.floater(c, 'down', '#e0a050');
      emit('fx:ko', c);
      if (c.faction === 'player' && G.mode === 'play') {
        emit('notice', `${c.name} is down!`, 'bad');
        if (G.settings?.pauseOnKO && G.speed) { G.lastSpeed = G.speed; G.speed = 0; emit('speed'); }
      }
    },
  };
}
