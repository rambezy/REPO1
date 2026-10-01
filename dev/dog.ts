import { getPortrait, EXPRS } from '../src/gfx/portraits';
import { CHARS } from '../src/content/characters';
const c = document.getElementById('c') as HTMLCanvasElement;
c.width = 6 * 200; c.height = 2 * 200;
const ctx = c.getContext('2d')!;
const look = CHARS.crumb.look;
EXPRS.forEach((e, i) => ctx.drawImage(getPortrait('c:crumb', look, e, false, false), (i % 6) * 200, Math.floor(i / 6) * 200, 196, 196));
