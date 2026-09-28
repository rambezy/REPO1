// Chooses music from context: scripted overrides, combat, the region, the
// map and the time of day. Also plays ambient one-shots (birds, bells, crows).

import { G } from '../G';
import { here } from '../world/world';
import { playMusic, currentMusic } from '../audio/music';
import { darkness, hourF, flag, isSunday } from '../state';
import { sfx } from '../audio/sfx';
import { playerState } from './player';
import { weather } from './weather';

let combatHold = 0;
let override: string | null = null;
let ambT = 0;

/** Scripts can force a track; pass null to release. */
export function forceMusic(name: string | null) { override = name; if (name) playMusic(name, 2); }

export function updateMusicDirector(dt: number) {
  if (!G.map || !G.player) return;
  if (override) { if (currentMusic() !== override) playMusic(override, 2); return; }
  const engaged = here().some((a) => a.hostile && !a.dead && !a.mem.down && a.mem.alerted && Math.hypot(a.x - G.player.x, a.y - G.player.y) < 200);
  if (engaged) combatHold = 6;
  else combatHold = Math.max(0, combatHold - dt);
  let track = '';
  if (combatHold > 0) track = 'battle';
  else {
    const reg = G.map.regionAt(G.player.x, G.player.y);
    track = reg?.music || G.map.music || '';
    if (!G.map.outdoor && !G.map.music) {
      // interiors inherit a calm track
      track = darkness() > 0.6 ? 'night' : (flag('act') || 0) === 0 ? 'village' : 'town';
    }
    if (G.map.outdoor && darkness() > 0.7 && track !== 'tension' && track !== 'sorrow' && track !== 'priory') track = 'night';
    if (!track) track = 'forest';
  }
  if (currentMusic() !== track) playMusic(track, track === 'battle' ? 0.8 : 3);

  // ambience
  ambT -= dt;
  if (ambT <= 0) {
    ambT = 3 + Math.random() * 6;
    if (G.map.outdoor && G.mode === 'play') {
      const h = hourF();
      if (h > 5 && h < 19 && weather.rain < 0.3 && Math.random() < 0.6) sfx('bird');
      else if (darkness() > 0.7 && Math.random() < 0.2) sfx('crow');
      if (isSunday() && Math.abs(h - 9) < 0.05) sfx('bell');
    }
  }
  void playerState;
}
