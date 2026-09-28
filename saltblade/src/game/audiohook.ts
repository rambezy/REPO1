// Feeds the audio system: where the ears are, what the place sounds like and
// what the music should be doing.
import { G } from '../state';
import { S } from '../sim/ctx';
import { initAudio, setListener, setAmbience, setMusicMood, MusicMood, uiSound } from '../audio';
import { on } from '../core/events';
import { hostile } from '../sim/combat';

let ambT = 0, moodT = 0;
let mood: MusicMood = 'silence';
let combatHold = 0;

export function setupAudio() {
  initAudio();
  on('fx:died', (c: any) => S.fx.sound('death', c.x, c.z));
  on('fx:ko', (c: any) => S.fx.sound('ko', c.x, c.z));
  on('speed', () => { if (G.speed === 0 && G.mode === 'play') uiSound('pause'); });
  on('notice', (_t: string, kind: string) => { if (G.mode === 'play' && (kind === 'bad' || kind === 'good')) uiSound(kind === 'bad' ? 'error' : 'notify'); });
}

export function tickAudio(dt: number) {
  const t = G.cam.target;
  setListener(t.x, t.z, G.cam.dist, G.cam.yaw);
  ambT -= dt;
  if (ambT <= 0) {
    ambT = 0.5;
    const site = G.T.siteAt(t.x, t.z, 20);
    const inTown = !!site && site.kind === 'town' && Math.hypot(site.x - t.x, site.z - t.z) < site.r + 20;
    const w = G.weatherState;
    setAmbience({
      region: G.T.regionAt(t.x, t.z).key,
      hour: S.clock.hour,
      weather: w?.kind ?? 'clear',
      intensity: w?.intensity ?? 0,
      inTown,
      underwater: G.R.camera.position.y < 0.2,
    });
  }
  moodT -= dt;
  if (moodT <= 0) {
    moodT = 1;
    const want = pickMood(inTownNow(), 1);
    if (want !== mood) { mood = want; setMusicMood(mood); }
  }
}

function inTownNow() {
  const t = G.cam.target;
  const site = G.T.siteAt(t.x, t.z, 20);
  return !!site && site.kind === 'town' && Math.hypot(site.x - t.x, site.z - t.z) < site.r + 20;
}

function pickMood(inTown: boolean, dt: number): MusicMood {
  if (G.mode === 'title') return 'explore';
  const mine = G.W.playerChars();
  let fighting = false, danger = false;
  for (const c of mine) {
    if (!c.alive) continue;
    if (c.drawn && c.brain?.enemy) fighting = true;
    if (!danger) S.W.hash.near(c.x, c.z, 60, (o) => { if (!danger && o.status === 'up' && hostile(o, c) && !o.animal) danger = true; });
  }
  if (fighting) combatHold = 6; else combatHold = Math.max(0, combatHold - dt);
  if (combatHold > 0) return 'combat';
  if (danger) return 'danger';
  if (inTown) return 'town';
  if (S.clock.isNight) return 'night';
  return 'explore';
}
