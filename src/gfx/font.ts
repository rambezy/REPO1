// In-world text (damage numbers, distances, little symbols), set in the
// game's book face and drawn as crisp vector text at any zoom.

const FACE = '"Alegreya SC", "Alegreya", Georgia, serif';

export function textWidth(text: string, scale = 1) {
  return text.length * 5.2 * scale;
}

/** Draws text; (x,y) is the top of the text box; alignment is horizontal. */
export function drawText(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number,
  color = '#fff', outline: string | null = '#1b1410', scale = 1, align: 'left' | 'center' | 'right' = 'left',
) {
  ctx.save();
  ctx.font = `700 ${(8.5 * scale).toFixed(2)}px ${FACE}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  if (outline) {
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6 * scale;
    ctx.strokeText(text, x, y - 0.5);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y - 0.5);
  ctx.restore();
}
