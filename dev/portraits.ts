import { getPortrait, EXPRS } from '../src/gfx/portraits';
import { Look, randomLook } from '../src/gfx/characters';
import { CLOTH, HAIR, P } from '../src/gfx/palette';

const c = document.getElementById('c') as HTMLCanvasElement;
const S = 3;
const cols = 12, rows = 8;
c.width = cols * 50 * S; c.height = rows * 50 * S;
const ctx = c.getContext('2d')!;
ctx.imageSmoothingEnabled = false;
const hero: Look = { skin: 'fair', hair: HAIR.brown, hairStyle: 'messy', shirt: CLOTH.linen, legs: CLOTH.brown, boots: P.wood1, outer: 'vest', outerColor: CLOTH.russet, eyes: '#4a6a3a', face: { jaw: 'round', nose: 'small', brows: 'thick' }, portraitBg: '#6b5a44' };
const father: Look = { skin: 'ruddy', hair: HAIR.darkbrown, hairStyle: 'short', beard: 'full', beardColor: HAIR.saltpepper, shirt: CLOTH.linenDark, outer: 'apron', apronColor: P.wood2, legs: CLOTH.charcoal, boots: P.wood0, build: 'broad', face: { jaw: 'heavy', nose: 'broad', brows: 'bushy', wrinkles: 2 }, portraitBg: '#7a4a2a' };
const mother: Look = { skin: 'fair', hair: HAIR.chestnut, hairStyle: 'bun', female: true, hat: 'kerchief', hatColor: CLOTH.white, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.madder, apronColor: CLOTH.white, legs: CLOTH.brown, boots: P.wood1, face: { jaw: 'round', nose: 'small', mouth: 'full', wrinkles: 1, cheeks: true }, eyes: '#5a4a2a', portraitBg: '#8a6a44' };
const lida: Look = { skin: 'pale', hair: HAIR.red, hairStyle: 'braids', female: true, freckles: true, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.woad, legs: CLOTH.brown, boots: P.wood1, build: 'child', eyes: '#3b6a8a', portraitBg: '#5a7a9a' };
const monk: Look = { skin: 'ruddy', hair: HAIR.grey, hairStyle: 'tonsure', shirt: CLOTH.brown, outer: 'robe', outerColor: CLOTH.brown, legs: CLOTH.brown, boots: P.wood1, build: 'fat', face: { jaw: 'round', nose: 'broad', wrinkles: 2, cheeks: true }, portraitBg: '#6a6440' };
const knight: Look = { skin: 'fair', hair: HAIR.grey, hairStyle: 'short', beard: 'moustache', beardColor: HAIR.white, shirt: CLOTH.blue, outer: 'noble', outerColor: CLOTH.green, trim: CLOTH.ochre, legs: CLOTH.charcoal, boots: P.metal2, face: { jaw: 'square', nose: 'long', wrinkles: 3, brows: 'thick' }, portraitBg: '#3e5a4a' };
const dieter: Look = { skin: 'tan', hair: HAIR.black, hairStyle: 'short', shirt: CLOTH.black, outer: 'brigandine', outerColor: CLOTH.black, legs: CLOTH.black, boots: P.wood0, hat: 'sallet', hatColor: '#2a2a30', cape: CLOTH.red, build: 'broad', portraitBg: '#4a2020' };
const hanka: Look = { skin: 'fair', hair: HAIR.flaxen, hairStyle: 'long', female: true, freckles: true, shirt: CLOTH.linen, outer: 'dress', outerColor: CLOTH.green, legs: CLOTH.brown, boots: P.wood1, eyes: '#4a7a5a', face: { jaw: 'narrow', nose: 'button', mouth: 'full', cheeks: true }, portraitBg: '#5a7a4a' };
const wenda: Look = { skin: 'tan', hair: HAIR.white, hairStyle: 'long', female: true, hat: 'hood', hatColor: CLOTH.forest, shirt: CLOTH.brown, outer: 'dress', outerColor: CLOTH.darkbrown, legs: CLOTH.brown, boots: P.wood1, face: { jaw: 'narrow', nose: 'hooked', wrinkles: 3 }, portraitBg: '#3a4a3a' };
const ondrej: Look = { skin: 'tan', hair: HAIR.saltpepper, hairStyle: 'bald', beard: 'short', eyepatch: true, scar: true, shirt: CLOTH.olive, outer: 'gambeson', outerColor: CLOTH.olive, legs: CLOTH.charcoal, boots: P.wood0, build: 'broad', face: { jaw: 'heavy', nose: 'broad', brows: 'bushy', wrinkles: 2 }, portraitBg: '#5a5a40' };
const pavel: Look = { skin: 'ruddy', hair: HAIR.blond, hairStyle: 'curly', shirt: CLOTH.woad, legs: CLOTH.brown, boots: P.wood1, face: { jaw: 'square', nose: 'button', mouth: 'wide' }, eyes: '#3b5a7a', portraitBg: '#4a5a7a' };
const guard = randomLook(3, { role: 'guard' });
const looks = [hero, father, mother, lida, monk, knight, dieter, hanka, wenda, ondrej, pavel, guard];
looks.forEach((lk, r) => {
  if (r >= rows) return;
  EXPRS.forEach((e, i) => {
    const img = getPortrait('p' + r, lk, e, false, false);
    ctx.drawImage(img, i * 50 * S, r * 50 * S, 48 * S, 48 * S);
  });
});
// second block: remaining looks neutral + random villagers
const rest = looks.slice(rows);
rest.forEach((lk, i) => { const img = getPortrait('q' + i, lk, 'neutral'); ctx.drawImage(img, i * 50 * S, (rows - 1) * 50 * S, 48 * S, 48 * S); });
