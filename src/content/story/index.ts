// The story: registers every chapter and runs the per-frame story logic.

import { G } from '../../G';
import { S, flag } from '../../state';
import { initLib, updateTriggers, refreshDecor } from './lib';
import { spawnCast } from './cast';
import { registerPrologue, startPrologue, prologueUpdate } from './prologue';
import { registerRaid } from './raid';
import { registerAct1 } from './act1';
import { registerAct2 } from './act2';
import { registerSides } from './sides';
import { registerAct3 } from './act3';
import { weather } from '../../systems/weather';
import { forceMusic } from '../../systems/director';

let registered = false;

export const story = {
  register() {
    if (registered) return;
    registered = true;
    initLib();
    registerPrologue();
    registerRaid();
    registerAct1();
    registerAct2();
    registerAct3();
    registerSides();
  },
  newGame() {
    startPrologue();
  },
  onLoad() {
    const act = (flag('act') || 0) as number;
    weather.forced = act === 0 ? 0 : null;
    forceMusic(null);
    spawnCast();
    refreshDecor();
  },
  update(dt: number) {
    if (!G.player) return;
    prologueUpdate();
    updateTriggers(dt);
    void S;
  },
};
