import { drawChar, randomLook, Look, FRAME_COUNT } from '../src/gfx/characters';
import { CLOTH, HAIR, P } from '../src/gfx/palette';

const c = document.getElementById('c') as HTMLCanvasElement;
const S = 4;
const W = 300, H = 200;
c.width = W * S; c.height = H * S;
c.style.width = W * S + 'px';
const ctx = c.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
ctx.scale(S, S);
ctx.fillStyle = '#5a8f3b';
ctx.fillRect(0, 0, W, H);

const hero: Look = { skin: 'fair', hair: HAIR.brown, hairStyle: 'messy', shirt: CLOTH.linen, legs: CLOTH.brown, boots: P.wood1, outer: 'vest', outerColor: CLOTH.russet };
const father: Look = { skin: 'ruddy', hair: HAIR.darkbrown, hairStyle: 'short', beard: 'full', beardColor: HAIR.saltpepper, shirt: CLOTH.linenDark, outer: 'apron', apronColor: P.wood2, legs: CLOTH.charcoal, boots: P.wood0, build: 'broad' };
const mother: Look = { skin: 'fair', hair: HAIR.chestnut, hairStyle: 'bun', female: true, hat: 'kerchief', hatColor: CLOTH.white, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.madder, apronColor: CLOTH.white, legs: CLOTH.brown, boots: P.wood1 };
const lida: Look = { skin: 'pale', hair: HAIR.red, hairStyle: 'braids', female: true, freckles: true, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.woad, legs: CLOTH.brown, boots: P.wood1, build: 'child' };
const monk: Look = { skin: 'ruddy', hair: HAIR.grey, hairStyle: 'tonsure', shirt: CLOTH.brown, outer: 'robe', outerColor: CLOTH.brown, legs: CLOTH.brown, boots: P.wood1, build: 'fat' };
const knight: Look = { skin: 'fair', hair: HAIR.grey, hairStyle: 'short', beard: 'moustache', shirt: CLOTH.blue, outer: 'plate', legs: CLOTH.charcoal, boots: P.metal2, hat: 'none', cape: CLOTH.green };
const dieter: Look = { skin: 'tan', hair: HAIR.black, hairStyle: 'short', shirt: CLOTH.black, outer: 'brigandine', outerColor: CLOTH.black, legs: CLOTH.black, boots: P.wood0, hat: 'sallet', hatColor: '#2a2a30', cape: CLOTH.red, build: 'broad' };
const guard: Look = randomLook(3, { role: 'guard' });
const looks = [hero, father, mother, lida, monk, knight, dieter, guard];
looks.forEach((lk, i) => {
  for (let d = 0; d < 4; d++) {
    drawChar(ctx, lk, d, 0, 14 + d * 22, 28 + i * 22 - 0);
  }
  for (let f = 1; f < FRAME_COUNT; f++) drawChar(ctx, lk, 0, f, 100 + f * 18, 28 + i * 22);
});
for (let i = 0; i < 12; i++) {
  drawChar(ctx, randomLook(100 + i), 0, 0, 14 + i * 20, 196);
  drawChar(ctx, randomLook(200 + i), 1, 0, 14 + i * 20, 196 - 0 + 0);
}
