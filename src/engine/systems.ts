// Registers the per-frame systems in a deliberate order.

import { G } from '../G';
import { addSystem, setRenderer } from './loop';
import { here } from '../world/world';
import { updatePlayer, playerLights } from '../systems/player';
import { updateActorCombat, updateArrows, drawArrows, drawWeapon, consumeHitStop } from '../systems/combat';
import { advanceTime } from '../systems/survival';
import { updateParticles, updateFloats, updateDecals } from './fx';
import { updateWeather, drawRain } from '../systems/weather';
import { updateFade } from '../systems/transition';
import { renderWorld, updateCamera, updateObjectFx, renderHooks } from './renderer';
import { updateMusic } from '../audio/music';
import { S } from '../state';
import { settleActor } from '../systems/ai';

let hitFrozen = false;
const FAR_X = 560, FAR_Y = 420;

export function registerCoreSystems() {
  addSystem('play', 'time', (dt) => advanceTime(dt), 5);
  addSystem('world', 'hitstop', (dt) => { hitFrozen = consumeHitStop(dt); }, 1);
  addSystem('world', 'player', (dt) => { if (!hitFrozen) updatePlayer(dt); }, 10);
  addSystem('world', 'actors', (dt) => {
    if (hitFrozen) return;
    const p = G.player;
    for (const a of here()) {
      if (a !== p && a.brain && !a.dead) {
        // far from the player, calm people skip their thinking and just keep to their schedules
        const far = Math.abs(a.x - p.x) > FAR_X || Math.abs(a.y - p.y) > FAR_Y;
        if (far && !a.mem.script && !a.mem.follow && !a.hostile && !a.mem.target && !a.mem.fleeT) {
          a.mem.farT = (a.mem.farT || 0) + dt;
          if (a.mem.farT > 2) { a.mem.farT = 0; settleActor(a); }
          continue;
        }
        a.brain.update(a, dt);
      }
      updateActorCombat(a, dt);
      a.updateAnim(dt);
    }
  }, 20);
  addSystem('world', 'arrows', (dt) => { if (!hitFrozen) updateArrows(dt); }, 25);
  addSystem('world', 'fx', (dt) => { updateParticles(dt); updateFloats(dt); updateDecals(dt); updateObjectFx(dt); }, 60);
  addSystem('world', 'weather', (dt) => updateWeather(dt), 62);
  addSystem('world', 'camera', (dt) => updateCamera(dt), 90);
  addSystem('always', 'fade', (dt) => updateFade(dt), 1);
  addSystem('always', 'music', () => updateMusic(), 5);
  addSystem('always', 'hurtflash', (dt) => { if (G.hurtFlash > 0) G.hurtFlash = Math.max(0, G.hurtFlash - dt * 2.5); }, 6);
  addSystem('play', 'syncstats', () => { if (G.player) { S.hp = G.player.hp; S.stamina = G.player.stamina; S.px = G.player.x; S.py = G.player.y; S.pdir = G.player.dir; } }, 99);

  renderHooks.afterActor.push(drawWeapon);
  renderHooks.lights.push(playerLights);
  renderHooks.overlay.push(drawArrows);
  renderHooks.screen.push(drawRain);
  setRenderer(() => {
    if (G.map && G.player && G.mode !== 'title' && G.mode !== 'loading') renderWorld();
    else if (G.mode === 'title' && G.map && G.player) renderWorld();
    else { G.ctx.fillStyle = '#0b0807'; G.ctx.fillRect(0, 0, G.viewW, G.viewH); }
  });
}
