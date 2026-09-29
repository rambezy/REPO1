// Procedural bust portraits for the dialogue window.

import type { Look } from '../data/protos';
import { shade } from './materials';
import { mulberry32, strSeed } from '../core/rng';

export function drawPortrait(c: CanvasRenderingContext2D, W: number, H: number, look: Look & { bg?: string }, seedStr: string, t = 0, talking = false) {
  const rnd = mulberry32(strSeed(seedStr));
  c.save();
  c.clearRect(0, 0, W, H);
  // Backdrop: dusty gradient with a soft vignette.
  const bg = look.bg ?? '#3a3226';
  const g = c.createRadialGradient(W * 0.5, H * 0.35, W * 0.1, W * 0.5, H * 0.5, W * 0.8);
  g.addColorStop(0, shade(bg, 1.5));
  g.addColorStop(1, shade(bg, 0.5));
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.scale(W / 200, H / 200);

  const body = look.body;
  if (body === 'robot') {
    drawRobotHead(c, look, t);
    c.restore();
    return;
  }
  if (body === 'dog' || body === 'rat' || body === 'beetle' || body === 'ox' || body === 'lizard' || body === 'crawler') {
    c.fillStyle = look.skin ?? '#7a6248';
    c.beginPath();
    c.ellipse(100, 120, 60, 50, 0, 0, 7);
    c.fill();
    c.fillStyle = '#111';
    c.beginPath();
    c.arc(80, 110, 6, 0, 7);
    c.arc(120, 110, 6, 0, 7);
    c.fill();
    c.restore();
    return;
  }
  const skin = look.skin ?? '#c8966e';
  const grafted = body === 'grafted';
  const withered = body === 'withered';
  const female = !!look.female;
  const outfit = look.outfit ?? '#5a5040';
  const outfit2 = look.outfit2 ?? '#3a3028';
  const breathe = Math.sin(t * 1.6) * 1.2;

  // Shoulders
  c.fillStyle = outfit;
  c.beginPath();
  c.moveTo(10, 200);
  c.quadraticCurveTo(20, 150 + breathe, 70, 145 + breathe);
  c.lineTo(130, 145 + breathe);
  c.quadraticCurveTo(180, 150 + breathe, 190, 200);
  c.closePath();
  c.fill();
  c.fillStyle = 'rgba(0,0,0,0.25)';
  c.beginPath();
  c.moveTo(130, 145 + breathe);
  c.quadraticCurveTo(180, 150, 190, 200);
  c.lineTo(150, 200);
  c.closePath();
  c.fill();
  c.fillStyle = outfit2;
  c.fillRect(96, 150 + breathe, 8, 50);
  if (grafted) {
    c.fillStyle = '#6a6a6a';
    c.fillRect(62, 132, 76, 16);
    c.fillStyle = '#9a9a90';
    for (let i = 0; i < 6; i++) c.fillRect(66 + i * 12, 136, 6, 6);
  }

  // Neck
  c.fillStyle = shade(skin, 0.85);
  c.fillRect(82 - (grafted ? 8 : 0), 118, 36 + (grafted ? 16 : 0), 32);

  // Head shape
  const hw = grafted ? 50 : female ? 38 : 41;
  const hh = grafted ? 52 : female ? 50 : 52;
  const jaw = grafted ? 1.25 : female ? 0.85 : 1 + rnd() * 0.12;
  c.fillStyle = skin;
  c.beginPath();
  c.moveTo(100 - hw, 80);
  c.quadraticCurveTo(100 - hw, 25, 100, 25);
  c.quadraticCurveTo(100 + hw, 25, 100 + hw, 80);
  c.quadraticCurveTo(100 + hw * jaw * 0.9, 118, 100, 132);
  c.quadraticCurveTo(100 - hw * jaw * 0.9, 118, 100 - hw, 80);
  c.fill();
  // shading
  const sg = c.createLinearGradient(60, 0, 150, 0);
  sg.addColorStop(0, 'rgba(0,0,0,0)');
  sg.addColorStop(1, 'rgba(0,0,0,0.28)');
  c.fillStyle = sg;
  c.fill();
  // Ears
  c.fillStyle = shade(skin, 0.9);
  c.beginPath();
  c.ellipse(100 - hw - 2, 82, 6, 11, 0, 0, 7);
  c.ellipse(100 + hw + 2, 82, 6, 11, 0, 0, 7);
  c.fill();

  // Skin blemishes for the Withered and Grafted
  if (withered) {
    for (let i = 0; i < 14; i++) {
      c.fillStyle = `rgba(${60 + rnd() * 40},${40 + rnd() * 30},20,${0.25 + rnd() * 0.3})`;
      c.beginPath();
      c.ellipse(70 + rnd() * 60, 40 + rnd() * 80, 3 + rnd() * 8, 2 + rnd() * 6, rnd() * 3, 0, 7);
      c.fill();
    }
  }
  if (grafted) {
    c.strokeStyle = 'rgba(40,50,30,0.6)';
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(62, 60);
    c.lineTo(80, 70);
    c.moveTo(130, 50);
    c.lineTo(125, 75);
    c.stroke();
  }

  // Eyes
  const eyeY = 76;
  const blink = (Math.floor(t * 10) % 37) === 0;
  for (const ex of [82, 118]) {
    c.fillStyle = '#e8e0d0';
    c.beginPath();
    c.ellipse(ex, eyeY, 8, blink ? 1 : 5, 0, 0, 7);
    c.fill();
    if (!blink) {
      c.fillStyle = grafted ? '#b0a020' : ['#3a5a7a', '#4a3a20', '#3a6a3a', '#2a2a2a'][Math.floor(rnd() * 4)];
      c.beginPath();
      c.arc(ex + 1, eyeY, 3.6, 0, 7);
      c.fill();
      c.fillStyle = '#000';
      c.beginPath();
      c.arc(ex + 1, eyeY, 1.6, 0, 7);
      c.fill();
    }
    // Brow
    c.strokeStyle = look.hair && look.hairStyle !== 'bald' ? shade(look.hair, 0.8) : shade(skin, 0.6);
    c.lineWidth = grafted ? 5 : 3;
    c.beginPath();
    c.moveTo(ex - 10, eyeY - 10 - (grafted ? -2 : 0));
    c.lineTo(ex + 9, eyeY - 11 + (ex < 100 ? 1 : -1) * (grafted ? 3 : 0));
    c.stroke();
  }
  // Nose
  c.strokeStyle = shade(skin, 0.7);
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(101, 80);
  c.lineTo(97 + (grafted ? -4 : 0), 99);
  c.lineTo(104, 101);
  c.stroke();
  // Mouth (animated while talking)
  const open = talking ? Math.abs(Math.sin(t * 14)) * 5 : 0;
  c.fillStyle = shade(skin, 0.45);
  c.beginPath();
  c.ellipse(100, 113, grafted ? 16 : 11, 1.5 + open, 0, 0, 7);
  c.fill();
  if (grafted) {
    c.fillStyle = '#d8d0a0';
    c.fillRect(88, 110, 4, 5);
    c.fillRect(108, 110, 4, 5);
  }
  if (look.beard) {
    c.fillStyle = look.hair ?? '#3a2a1a';
    c.beginPath();
    c.moveTo(100 - hw + 6, 95);
    c.quadraticCurveTo(100, 150, 100 + hw - 6, 95);
    c.quadraticCurveTo(100, 125, 100 - hw + 6, 95);
    c.fill();
  }
  // Hair
  drawPortraitHair(c, look, hw, rnd);
  if (female && look.hairStyle !== 'hood' && look.hairStyle !== 'helmet') {
    c.fillStyle = shade(skin, 0.75);
    c.fillRect(0, 0, 0, 0);
  }
  c.restore();
}

function drawPortraitHair(c: CanvasRenderingContext2D, look: Look, hw: number, rnd: () => number) {
  const hair = look.hair ?? '#3a2a1a';
  c.fillStyle = hair;
  switch (look.hairStyle) {
    case 'bald':
      return;
    case 'mohawk':
      c.beginPath();
      c.moveTo(92, 30);
      c.quadraticCurveTo(100, -5, 108, 30);
      c.lineTo(106, 60);
      c.lineTo(94, 60);
      c.fill();
      return;
    case 'long':
      c.beginPath();
      c.moveTo(100 - hw - 6, 150);
      c.quadraticCurveTo(100 - hw - 10, 15, 100, 18);
      c.quadraticCurveTo(100 + hw + 10, 15, 100 + hw + 6, 150);
      c.lineTo(100 + hw - 4, 150);
      c.quadraticCurveTo(100 + hw, 60, 100 + hw - 12, 45);
      c.quadraticCurveTo(100, 40, 100 - hw + 12, 45);
      c.quadraticCurveTo(100 - hw, 60, 100 - hw + 4, 150);
      c.fill();
      return;
    case 'bun':
      c.beginPath();
      c.moveTo(100 - hw - 2, 70);
      c.quadraticCurveTo(100 - hw, 18, 100, 20);
      c.quadraticCurveTo(100 + hw, 18, 100 + hw + 2, 70);
      c.quadraticCurveTo(100, 38, 100 - hw - 2, 70);
      c.fill();
      c.beginPath();
      c.arc(100, 16, 14, 0, 7);
      c.fill();
      return;
    case 'hood':
      c.fillStyle = look.outfit ?? '#6e5f4a';
      c.beginPath();
      c.moveTo(100 - hw - 16, 160);
      c.quadraticCurveTo(100 - hw - 20, 5, 100, 8);
      c.quadraticCurveTo(100 + hw + 20, 5, 100 + hw + 16, 160);
      c.lineTo(100 + hw, 160);
      c.quadraticCurveTo(100 + hw + 4, 40, 100, 38);
      c.quadraticCurveTo(100 - hw - 4, 40, 100 - hw, 160);
      c.fill();
      return;
    case 'cap':
      c.fillStyle = look.outfit2 ?? '#3a3a2a';
      c.beginPath();
      c.moveTo(100 - hw - 3, 58);
      c.quadraticCurveTo(100, 5, 100 + hw + 3, 58);
      c.closePath();
      c.fill();
      c.fillRect(100 - hw - 3, 52, hw * 2 + 30, 8);
      return;
    case 'helmet':
      c.fillStyle = '#4a4a40';
      c.beginPath();
      c.moveTo(100 - hw - 5, 70);
      c.quadraticCurveTo(100, -5, 100 + hw + 5, 70);
      c.closePath();
      c.fill();
      c.fillStyle = '#3a3a30';
      c.fillRect(100 - hw - 6, 58, hw * 2 + 12, 8);
      return;
    default: {
      c.beginPath();
      c.moveTo(100 - hw - 2, 68);
      c.quadraticCurveTo(100 - hw + 2, 16, 100, 18);
      c.quadraticCurveTo(100 + hw - 2, 16, 100 + hw + 2, 68);
      c.quadraticCurveTo(100 + hw - 6, 40, 100 + 10, 42 + rnd() * 4);
      c.quadraticCurveTo(100 - hw + 6, 38, 100 - hw - 2, 68);
      c.fill();
    }
  }
}

function drawRobotHead(c: CanvasRenderingContext2D, look: Look, t: number) {
  const col = look.skin ?? '#6a7078';
  c.fillStyle = shade(col, 0.8);
  c.fillRect(40, 60, 120, 110);
  c.fillStyle = col;
  c.beginPath();
  c.arc(100, 70, 60, Math.PI, 0);
  c.fill();
  c.fillStyle = '#111';
  c.fillRect(60, 80, 80, 30);
  c.fillStyle = `rgba(255,${80 + Math.sin(t * 4) * 50},40,1)`;
  c.beginPath();
  c.arc(100, 95, 10, 0, 7);
  c.fill();
  c.strokeStyle = '#999';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(80, 12);
  c.lineTo(70, -10);
  c.stroke();
}
