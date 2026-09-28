import { Look } from '../src/gfx/characters';
import { drawPerson } from '../src/gfx/person';
import { CLOTH, HAIR, P } from '../src/gfx/palette';
const c = document.getElementById('c') as HTMLCanvasElement;
const S = 5, W = 250, H = 130;
c.width = W * S; c.height = H * S;
const ctx = c.getContext('2d')!;
ctx.imageSmoothingQuality = 'high';
ctx.scale(S, S);
ctx.fillStyle = '#6a7a4a'; ctx.fillRect(0, 0, W, H);
const hero: Look = { skin: 'fair', hair: HAIR.brown, hairStyle: 'messy', shirt: CLOTH.linen, legs: CLOTH.brown, boots: P.wood1, outer: 'vest', outerColor: CLOTH.russet };
const mother: Look = { skin: 'fair', hair: HAIR.chestnut, hairStyle: 'bun', female: true, hat: 'kerchief', hatColor: CLOTH.white, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.madder, apronColor: CLOTH.white, legs: CLOTH.brown, boots: P.wood1 };
const N = 10;
for (let d = 0; d < 4; d++) for (let k = 0; k < N; k++) {
  const t = k / N / 1.9;
  drawPerson(ctx, hero, { dir: d, pose: 'walk', t }, 12 + k * 12, 30 + d * 0 + (d) * 26 - 0);
  drawPerson(ctx, mother, { dir: d, pose: 'walk', t }, 132 + k * 12, 30 + d * 26);
}
