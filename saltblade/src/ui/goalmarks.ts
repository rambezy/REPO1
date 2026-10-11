// Where your work sends you, marked on the map window: jobs (gold, green
// once there is pay to collect), the steps of stories (violet) and the
// Foundry Mind (red). Kept apart from the journal window: the map comes in
// with the game's own modules (and the headless tests), which have no use
// for the journal's styles.
import { goalMarks } from '../sim/contracts';
import { palette } from './palette';

let marks: ReturnType<typeof goalMarks> = [];
let marksT = 0;
/** Draws where your work sends you onto the map window's canvas. */
export function drawGoalMarks(ctx: CanvasRenderingContext2D, toScreen: (x: number, z: number) => [number, number], label: (t: string, x: number, y: number, col: string, px: number) => void, zoom: number, size: number) {
  const now = performance.now();
  if (now - marksT > 500) { marksT = now; marks = goalMarks(); }
  for (const m of marks) {
    const [sx, sy] = toScreen(m.x, m.z);
    if (sx < -30 || sy < -30 || sx > size + 30 || sy > size + 30) continue;
    const col = m.kind === 'crisis' ? palette.bad : m.kind === 'story' ? '#8a4ec0' : m.done ? palette.good : '#d9a441';
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = '#2a1c10';
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(sx, sy - 9); ctx.lineTo(sx + 7, sy); ctx.lineTo(sx, sy + 9); ctx.lineTo(sx - 7, sy); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff4d8';
    ctx.beginPath(); ctx.arc(sx, sy, 2.2, 0, Math.PI * 2); ctx.fill();
    if (zoom >= 1.6 || m.kind !== 'job') label(m.label.length > 34 ? m.label.slice(0, 33) + '…' : m.label, sx, sy - 16, m.kind === 'crisis' ? '#7a1a0e' : m.kind === 'story' ? '#4a2070' : '#5a3a0a', 11);
  }
}
