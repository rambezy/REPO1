// Times the body builder: node --import tsx tools/benchbodies.ts
// (add --cpu-prof to see where the time goes).
import { World } from '../src/sim/world';
import { S } from '../src/sim/ctx';
import { Clock } from '../src/sim/clock';
import { RNG } from '../src/core/rng';
import { makePerson } from '../src/sim/spawn';
import { makeRig } from '../src/render/charModel';
import { buildHuman } from '../src/render/human';
const W = new World();
Object.assign(S, { W, clock: new Clock(), rng: new RNG(1), time: 0 });
const rng = new RNG(5);
const facs = ['drifters', 'concord', 'ember', 'karuk', 'thrum', 'hollows', 'reavers', 'chainhouse'];
const people = Array.from({ length: 80 }, (_, i) => makePerson(W, { faction: facs[i % facs.length], role: i % 3 ? 'guard' : 'resident' } as any, rng));
for (let k = 0; k < 4; k++) for (const c of people) buildHuman(c.look, c.vis(), 0, makeRig(c.look), 0, 1);
const t0 = performance.now();
for (const c of people) buildHuman(c.look, c.vis(), 0, makeRig(c.look), 0, 1);
console.log(((performance.now() - t0) / people.length).toFixed(2), 'ms warm');
