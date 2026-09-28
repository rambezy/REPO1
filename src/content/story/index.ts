// Story entry point: registers quests, dialogue and scripts, spawns the cast,
// and runs per-frame story logic.

import { G } from '../../G';
import { enterMap } from '../../world/world';
import { S } from '../../state';
import { snapCamera } from '../../engine/renderer';

export const story = {
  register() {},
  newGame() {
    enterMap('overworld', 'hollowbrook');
    snapCamera();
    S.minutes = 9 * 60;
  },
  onLoad() {},
  update(_dt: number) { void G; },
};
