import { randomLook, Look } from '../src/gfx/characters';
import { drawPerson, PersonPose } from '../src/gfx/person';
import { CLOTH, HAIR, P } from '../src/gfx/palette';

const c = document.getElementById('c') as HTMLCanvasElement;
const S = 4;
const W = 330, H = 232;
c.width = W * S; c.height = H * S;
c.style.width = W * S + 'px';
const ctx = c.getContext('2d')!;
ctx.imageSmoothingEnabled = true;
ctx.imageSmoothingQuality = 'high';
ctx.scale(S, S);
ctx.fillStyle = '#56773a';
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
const poses: [PersonPose, number][] = [['idle', 0], ['walk', 0.05], ['walk', 0.18], ['walk', 0.31], ['walk', 0.44], ['windup', 0], ['strike', 0], ['block', 0], ['hurt', 0], ['sit', 0], ['crouch', 0]];
looks.forEach((lk, i) => {
  const y = 28 + i * 25;
  for (let d = 0; d < 4; d++) drawPerson(ctx, lk, { dir: d, pose: 'idle', t: 1 }, 10 + d * 15, y);
  poses.forEach(([p, t], k) => {
    const aim = p === 'windup' ? -2.2 : p === 'strike' ? 0.6 : p === 'block' ? -1.2 : null;
    drawPerson(ctx, lk, { dir: k % 2 ? 1 : 0, pose: p, t, aim, reach: 0.9 }, 75 + k * 15, y);
  });
  drawPerson(ctx, lk, { dir: 0, pose: 'dead', t: 0 }, 262, y);
  drawPerson(ctx, lk, { dir: 0, pose: 'sleep', t: 0 }, 300, y);
});
for (let i = 0; i < 20; i++) {
  drawPerson(ctx, randomLook(100 + i), { dir: 0, pose: 'idle', t: 1 }, 10 + i * 16, 226);
}
