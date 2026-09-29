// Procedurally drawn characters and creatures.

import type { Look } from '../data/protos';
import { shade } from './materials';

export interface Pose {
  facing: number; // 0..5
  walk: number; // walk phase in radians, or -1 when standing
  attack: number; // 0..1 attack animation progress, or -1
  attackKind?: string; // 'shoot' | 'melee' | 'throw'
  hit: number; // 0..1 recoil, or -1
  dead: number; // 0..1 falling progress, or -1
  weapon?: string; // icon id of held weapon
  armor?: string; // armor look
  armorTint?: string;
  flash?: boolean;
  t: number; // time in seconds (idle breathing)
  sneaking?: boolean;
  violent?: boolean;
}

const ctxShadow = (c: CanvasRenderingContext2D, w: number, h: number) => {
  c.fillStyle = 'rgba(0,0,0,0.28)';
  c.beginPath();
  c.ellipse(0, 0, w, h, 0, 0, Math.PI * 2);
  c.fill();
};

export function drawActor(c: CanvasRenderingContext2D, x: number, y: number, look: Look, pose: Pose) {
  c.save();
  c.translate(Math.round(x), Math.round(y));
  const s = look.scale ?? 1;
  const flip = pose.facing >= 3;
  if (pose.dead >= 0) {
    drawDead(c, look, pose, flip);
    c.restore();
    return;
  }
  switch (look.body) {
    case 'rat': ctxShadow(c, 12 * s, 4 * s); if (flip) c.scale(-1, 1); c.scale(s, s); drawRat(c, look, pose); break;
    case 'beetle': ctxShadow(c, 16 * s, 6 * s); if (flip) c.scale(-1, 1); c.scale(s, s); drawBeetle(c, look, pose); break;
    case 'dog': ctxShadow(c, 13 * s, 4 * s); if (flip) c.scale(-1, 1); c.scale(s, s); drawDog(c, look, pose); break;
    case 'crawler': ctxShadow(c, 16 * s, 6 * s); if (flip) c.scale(-1, 1); c.scale(s, s); drawCrawler(c, look, pose); break;
    case 'lizard': ctxShadow(c, 18 * s, 5 * s); if (flip) c.scale(-1, 1); c.scale(s, s); drawLizard(c, look, pose); break;
    case 'ox': ctxShadow(c, 18 * s, 6 * s); if (flip) c.scale(-1, 1); c.scale(s, s); drawOx(c, look, pose); break;
    case 'robot': ctxShadow(c, 13 * s, 5 * s); if (flip) c.scale(-1, 1); c.scale(s, s); drawRobot(c, look, pose); break;
    default:
      ctxShadow(c, 10 * s, 4 * s);
      if (flip) c.scale(-1, 1);
      c.scale(s, s);
      drawHuman(c, look, pose);
  }
  c.restore();
}

// ------------------------------------------------------------------ humans

function drawHuman(c: CanvasRenderingContext2D, look: Look, pose: Pose) {
  const back = pose.facing === 0 || pose.facing === 5;
  const skin = look.skin ?? '#c8966e';
  const grafted = look.body === 'grafted';
  const withered = look.body === 'withered';
  let outfit = look.outfit ?? '#5a5040';
  let outfit2 = look.outfit2 ?? '#3a3028';
  const armor = pose.armor;
  if (armor && armor !== 'jacket' && pose.armorTint) outfit = pose.armorTint;
  if (armor === 'jacket' && pose.armorTint) outfit = pose.armorTint;
  const walking = pose.walk >= 0;
  const sw = walking ? Math.sin(pose.walk) : 0;
  const bob = walking ? Math.abs(Math.cos(pose.walk)) * 1.2 : Math.sin(pose.t * 2) * 0.4;
  const crouch = pose.sneaking ? 4 : 0;
  const recoil = pose.hit >= 0 ? Math.sin(pose.hit * Math.PI) * 3 : 0;
  c.translate(-recoil, 0);
  const wide = grafted ? 1.25 : armor === 'power' ? 1.2 : 1;
  const legC = armor === 'power' ? outfit : grafted ? shade(skin, 0.8) : shade(outfit, 0.8);
  const bootC = armor === 'power' ? shade(outfit, 0.6) : '#2a2018';

  // Legs
  const hipY = -18 + crouch;
  const drawLeg = (dx: number, ph: number, front: boolean) => {
    const fx = dx + ph * 5;
    c.strokeStyle = front ? legC : shade(legC, 0.8);
    c.lineWidth = 4.5 * wide;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(dx, hipY);
    c.lineTo(fx * 0.7 + dx * 0.3, hipY + 9 - crouch / 2);
    c.lineTo(fx, -2);
    c.stroke();
    c.fillStyle = bootC;
    c.fillRect(fx - 2.5, -3.5, 6 * wide, 3.5);
  };
  drawLeg(-2, -sw, false);
  drawLeg(2, sw, true);

  // Torso
  const topY = -34 + crouch + bob * 0.5;
  const tw = 11 * wide;
  c.fillStyle = outfit;
  roundRect(c, -tw / 2, topY, tw, hipY - topY + 3, 3);
  c.fill();
  // Shading
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.fillRect(tw / 2 - 3, topY + 2, 3, hipY - topY);
  if (armor === 'robe') {
    c.fillStyle = outfit;
    c.beginPath();
    c.moveTo(-tw / 2 - 1, hipY - 4);
    c.lineTo(tw / 2 + 1, hipY - 4);
    c.lineTo(tw / 2 + 3, -4);
    c.lineTo(-tw / 2 - 3, -4);
    c.closePath();
    c.fill();
  }
  // Outfit details
  if (!back && (!armor || armor === 'jacket') && !grafted) {
    c.fillStyle = outfit2;
    c.fillRect(-1, topY + 2, 2, hipY - topY - 1); // front stripe / zipper
    c.fillRect(-tw / 2, hipY - 4, tw, 2); // belt
  } else if (back && !armor && !grafted) {
    c.fillStyle = outfit2;
    c.fillRect(-tw / 2 + 2, topY + 4, tw - 4, 2);
  }
  if (armor === 'leather') {
    c.strokeStyle = shade(outfit, 0.6);
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-tw / 2, topY + 3);
    c.lineTo(tw / 2, hipY - 3);
    c.stroke();
    c.fillStyle = shade(outfit, 1.2);
    c.fillRect(-tw / 2 - 1, topY, 4, 4);
    c.fillRect(tw / 2 - 3, topY, 4, 4);
  } else if (armor === 'metal') {
    c.fillStyle = shade(outfit, 1.25);
    c.fillRect(-tw / 2 + 1, topY + 3, tw - 2, 5);
    c.fillRect(-tw / 2 + 1, topY + 10, tw - 2, 4);
    c.fillStyle = '#555';
    c.fillRect(-tw / 2 - 2, topY - 1, 5, 5);
    c.fillRect(tw / 2 - 3, topY - 1, 5, 5);
  } else if (armor === 'combat') {
    c.fillStyle = shade(outfit, 1.3);
    roundRect(c, -tw / 2 + 1, topY + 2, tw - 2, 10, 2);
    c.fill();
    c.fillStyle = shade(outfit, 0.7);
    c.fillRect(-tw / 2 - 2, topY, 5, 6);
    c.fillRect(tw / 2 - 3, topY, 5, 6);
  } else if (armor === 'power') {
    c.fillStyle = shade(outfit, 1.2);
    roundRect(c, -tw / 2 - 1, topY + 1, tw + 2, 12, 3);
    c.fill();
    c.fillStyle = shade(outfit, 0.8);
    roundRect(c, -tw / 2 - 4, topY - 2, 7, 8, 2);
    c.fill();
    roundRect(c, tw / 2 - 3, topY - 2, 7, 8, 2);
    c.fill();
    c.fillStyle = '#c8a040';
    c.fillRect(-2, topY + 5, 4, 2);
  }
  if (grafted) {
    // Metal collar and harness straps
    c.fillStyle = outfit2;
    c.fillRect(-tw / 2, topY - 1, tw, 3);
    c.fillStyle = shade(outfit, 0.9);
    c.fillRect(-tw / 2, hipY - 7, tw, 7);
  }
  if (withered) {
    c.fillStyle = 'rgba(40,30,20,0.35)';
    c.fillRect(-tw / 2 + 2, topY + 6, 3, 3);
    c.fillRect(1, topY + 11, 3, 2);
  }

  // Arms
  const shoulderY = topY + 3;
  const armC = armor === 'power' || armor === 'metal' || armor === 'combat' ? shade(outfit, 0.9) : grafted ? skin : outfit;
  const handC = armor === 'power' ? shade(outfit, 0.7) : skin;
  const atk = pose.attack >= 0 ? pose.attack : -1;
  const hasGun = !!pose.weapon && GUNS.has(pose.weapon);
  const twoHand = !!pose.weapon && TWO_HAND.has(pose.weapon);
  // back arm
  c.strokeStyle = shade(armC, 0.75);
  c.lineWidth = 3.5 * wide;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-tw / 2 + 2, shoulderY);
  if (twoHand || (hasGun && atk >= 0)) c.lineTo(6, shoulderY + 7);
  else c.lineTo(-tw / 2 + 1 + sw * 3, shoulderY + 12);
  c.stroke();

  // Head
  const headY = topY - 6 + (armor === 'power' ? 1 : 0);
  const hr = grafted ? 5.2 : 5;
  c.fillStyle = skin;
  c.beginPath();
  c.arc(back ? 0 : 1, headY, hr, 0, Math.PI * 2);
  c.fill();
  // Hair / headgear
  drawHair(c, look, headY, hr, back, armor);
  if (!back && armor !== 'power' && look.hairStyle !== 'helmet') {
    c.fillStyle = '#1a1210';
    c.fillRect(3, headY - 1.5, 1.6, 1.6); // eye
    if (grafted) {
      c.fillStyle = '#d8d0a0';
      c.fillRect(2, headY + 2.5, 4, 1.2);
    }
    if (look.beard) {
      c.fillStyle = look.hair ?? '#2a1a10';
      c.fillRect(0, headY + 2, 6, 3);
    }
  }
  if (withered) {
    c.fillStyle = 'rgba(80,60,30,0.5)';
    c.fillRect(-3, headY - 2, 2, 2);
    c.fillRect(-1, headY + 2, 3, 1);
  }

  // Front arm + weapon
  let hx: number, hy: number;
  if (atk >= 0 && pose.attackKind === 'melee') {
    const a = -1.4 + Math.sin(atk * Math.PI) * 2.4;
    hx = tw / 2 - 2 + Math.cos(a) * 12;
    hy = shoulderY + Math.sin(a) * 12;
  } else if (atk >= 0 && pose.attackKind === 'throw') {
    const a = -2.2 + atk * 2.8;
    hx = Math.cos(a) * 12;
    hy = shoulderY + Math.sin(a) * 12;
  } else if (hasGun && (atk >= 0 || twoHand)) {
    hx = tw / 2 + 5;
    hy = shoulderY + 5;
  } else {
    hx = tw / 2 - 1 - sw * 3;
    hy = shoulderY + 12;
  }
  if (pose.weapon) drawHeldWeapon(c, pose.weapon, hx, hy, atk, pose.attackKind, back);
  c.strokeStyle = armC;
  c.lineWidth = 3.5 * wide;
  c.beginPath();
  c.moveTo(tw / 2 - 2, shoulderY);
  c.lineTo(hx, hy);
  c.stroke();
  c.fillStyle = handC;
  c.beginPath();
  c.arc(hx, hy, 1.8 * wide, 0, Math.PI * 2);
  c.fill();
  if (pose.flash) {
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = 'rgba(255,60,40,0.35)';
    c.fillRect(-tw, topY - 12, tw * 2, 50);
    c.globalCompositeOperation = 'source-over';
  }
}

const GUNS = new Set(['pistol', 'revolver', 'smg', 'rifle', 'shotgun', 'arifle', 'laserpistol', 'laserrifle', 'plasmarifle', 'flamer', 'minigun', 'rocket']);
const TWO_HAND = new Set(['smg', 'rifle', 'shotgun', 'arifle', 'laserrifle', 'plasmarifle', 'flamer', 'minigun', 'rocket', 'spear', 'sledge']);

function drawHeldWeapon(c: CanvasRenderingContext2D, w: string, x: number, y: number, atk: number, kind: string | undefined, back: boolean) {
  c.save();
  c.translate(x, y);
  const metal = '#3a3a3c';
  const wood = '#6a4428';
  switch (w) {
    case 'pistol': case 'revolver': case 'laserpistol':
      c.fillStyle = w === 'laserpistol' ? '#8a8e90' : metal;
      c.fillRect(-1, -2, 8, 3);
      c.fillRect(-1, -1, 3, 5);
      if (w === 'laserpistol') { c.fillStyle = '#e04030'; c.fillRect(6, -2, 2, 2); }
      break;
    case 'smg':
      c.fillStyle = metal; c.fillRect(-4, -3, 12, 4); c.fillRect(0, 0, 2, 5);
      break;
    case 'rifle': case 'arifle': case 'shotgun':
      c.fillStyle = w === 'arifle' ? '#2e3028' : wood;
      c.fillRect(-8, -2, 8, 4);
      c.fillStyle = metal;
      c.fillRect(0, -3, w === 'shotgun' ? 12 : 16, 3);
      break;
    case 'laserrifle': case 'plasmarifle':
      c.fillStyle = '#7a8084'; c.fillRect(-8, -3, 22, 5);
      c.fillStyle = w === 'plasmarifle' ? '#60e060' : '#e04030'; c.fillRect(12, -3, 3, 3);
      break;
    case 'flamer':
      c.fillStyle = '#6a4a2a'; c.fillRect(-6, -3, 16, 4); c.fillStyle = '#a0a0a0'; c.fillRect(10, -2, 4, 2);
      break;
    case 'minigun':
      c.fillStyle = '#4a4a4c'; c.fillRect(-8, -4, 20, 7); c.fillStyle = '#2a2a2c'; c.fillRect(12, -3, 6, 5);
      break;
    case 'rocket':
      c.fillStyle = '#4a5a3a'; c.fillRect(-12, -4, 26, 6);
      break;
    case 'knife': case 'tknife':
      c.rotate(atk >= 0 ? -0.5 : 0.9);
      c.fillStyle = '#ccc'; c.fillRect(0, -1, 7, 2); c.fillStyle = '#3a2a1a'; c.fillRect(-3, -1, 3, 2);
      break;
    case 'crowbar': case 'baton':
      c.rotate(atk >= 0 && kind === 'melee' ? -1 + atk * 2 : 1.2);
      c.fillStyle = w === 'baton' ? '#222' : '#8a2a1a'; c.fillRect(0, -1, 14, 2.5);
      if (w === 'baton') { c.fillStyle = '#60c0ff'; c.fillRect(13, -1.5, 3, 3.5); }
      break;
    case 'spear':
      c.rotate(-0.15);
      c.fillStyle = wood; c.fillRect(-10, -1, 26, 2); c.fillStyle = '#bbb'; c.fillRect(16, -2, 6, 4);
      break;
    case 'sledge':
      c.rotate(atk >= 0 && kind === 'melee' ? -1.2 + atk * 2.2 : 1.1);
      c.fillStyle = wood; c.fillRect(0, -1, 16, 2.5); c.fillStyle = '#555'; c.fillRect(13, -4, 6, 9);
      break;
    case 'grenade': case 'molotov':
      c.fillStyle = w === 'molotov' ? '#5a8a4a' : '#4a5a3a'; c.beginPath(); c.arc(1, 0, 2.5, 0, 7); c.fill();
      break;
    case 'knuckles': case 'gauntlet':
      c.fillStyle = w === 'gauntlet' ? '#6a6a6a' : '#999'; c.fillRect(-2, -3, 5, 5);
      break;
  }
  // Muzzle flash
  if (atk >= 0 && atk < 0.4 && GUNS.has(w) && kind === 'shoot') {
    const len = w === 'rifle' || w === 'arifle' ? 18 : w === 'flamer' ? 0 : 10;
    if (len) {
      c.fillStyle = w.startsWith('laser') ? 'rgba(255,80,60,0.9)' : w === 'plasmarifle' ? 'rgba(120,255,120,0.9)' : 'rgba(255,220,120,0.95)';
      c.beginPath();
      c.moveTo(len, -3);
      c.lineTo(len + 7, -1.5);
      c.lineTo(len, 0);
      c.fill();
    }
  }
  c.restore();
}

function drawHair(c: CanvasRenderingContext2D, look: Look, hy: number, hr: number, back: boolean, armor?: string) {
  const hair = look.hair ?? '#3a2a1a';
  if (armor === 'power' || look.hairStyle === 'helmet' || armor === 'combat') {
    c.fillStyle = armor === 'power' ? '#5a5e62' : armor === 'combat' ? '#3d4535' : '#4a4a40';
    c.beginPath();
    c.arc(0.5, hy - 0.5, hr + 1.6, Math.PI, 0);
    c.fill();
    c.fillRect(-hr - 1, hy - 1, hr * 2 + 3, 3);
    if (armor === 'power' && !back) {
      c.fillStyle = '#1a1a1a';
      c.fillRect(-hr + 1, hy - 1, hr * 2 + 1, 5);
      c.fillStyle = '#c8a040';
      c.fillRect(1, hy, 5, 2);
    }
    return;
  }
  c.fillStyle = hair;
  switch (look.hairStyle) {
    case 'bald':
      return;
    case 'mohawk':
      c.fillRect(-1.5, hy - hr - 3, 3, hr + 1);
      return;
    case 'long':
      c.beginPath();
      c.arc(0.5, hy - 1, hr + 0.6, Math.PI * 0.9, Math.PI * 2.1);
      c.fill();
      c.fillRect(back ? -hr : -hr, hy - 1, back ? hr * 2 : 4, 9);
      return;
    case 'bun':
      c.beginPath();
      c.arc(0.5, hy - 1, hr + 0.5, Math.PI, Math.PI * 2);
      c.fill();
      c.beginPath();
      c.arc(-4, hy - 4, 2.6, 0, 7);
      c.fill();
      return;
    case 'hood':
      c.fillStyle = look.outfit ?? '#6e5f4a';
      c.beginPath();
      c.arc(0.5, hy, hr + 2, Math.PI * 0.8, Math.PI * 2.2);
      c.fill();
      if (!back) {
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(1, hy - 2, hr, 5);
      }
      return;
    case 'cap':
      c.fillStyle = look.outfit2 ?? '#3a3a2a';
      c.beginPath();
      c.arc(0.5, hy - 1, hr + 0.8, Math.PI, Math.PI * 2);
      c.fill();
      if (!back) c.fillRect(0, hy - 2, hr + 4, 2);
      return;
    default:
      c.beginPath();
      c.arc(0.5, hy - 1, hr + 0.5, Math.PI * 0.95, Math.PI * 2.05);
      c.fill();
  }
}

function drawDead(c: CanvasRenderingContext2D, look: Look, pose: Pose, flip: boolean) {
  const t = Math.min(1, pose.dead);
  const s = look.scale ?? 1;
  if (flip) c.scale(-1, 1);
  c.scale(s, s);
  // Blood pool grows after the fall.
  if (look.body !== 'robot') {
    const pool = Math.min(1, t * 1.5) * (pose.violent ? 1.6 : 1);
    c.fillStyle = look.body === 'beetle' || look.body === 'crawler' ? 'rgba(90,110,30,0.75)' : 'rgba(110,10,6,0.75)';
    c.beginPath();
    c.ellipse(-2, -1, 13 * pool, 4.5 * pool, 0, 0, Math.PI * 2);
    c.fill();
  }
  if (look.body === 'human' || look.body === 'grafted' || look.body === 'withered') {
    c.save();
    c.rotate(-(Math.PI / 2) * t * 0.95);
    c.globalAlpha = 1;
    const pose2: Pose = { ...pose, dead: -1, walk: -1, attack: -1, hit: -1, facing: 2, weapon: undefined };
    if (t >= 1) c.translate(0, 2);
    drawHuman(c, look, pose2);
    c.restore();
    if (pose.violent) {
      c.fillStyle = 'rgba(120,10,6,0.9)';
      for (let i = 0; i < 5; i++) c.fillRect(-18 + i * 8, -3 + (i % 2) * 2, 3, 2);
    }
    return;
  }
  c.save();
  c.scale(1, 1);
  const pose2: Pose = { ...pose, dead: -1, walk: -1, attack: -1, hit: -1 };
  c.translate(0, 0);
  c.scale(1, -1 * (1 - t) + 0.6 * t);
  switch (look.body) {
    case 'rat': drawRat(c, look, pose2); break;
    case 'beetle': drawBeetle(c, look, pose2); break;
    case 'dog': drawDog(c, look, pose2); break;
    case 'crawler': drawCrawler(c, look, pose2); break;
    case 'lizard': drawLizard(c, look, pose2); break;
    case 'ox': drawOx(c, look, pose2); break;
    case 'robot': drawRobot(c, look, pose2); break;
  }
  c.restore();
}

// ------------------------------------------------------------------ creatures

function legs(c: CanvasRenderingContext2D, n: number, x0: number, x1: number, y: number, len: number, phase: number, color: string, w = 2) {
  c.strokeStyle = color;
  c.lineWidth = w;
  c.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / Math.max(1, n - 1);
    const sw = phase >= 0 ? Math.sin(phase + i * 1.7) * 3 : 0;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + sw + 1, y + len * 0.5);
    c.lineTo(x + sw, y + len);
    c.stroke();
  }
}

function drawRat(c: CanvasRenderingContext2D, look: Look, pose: Pose) {
  const col = look.skin ?? '#6b5a4d';
  const ph = pose.walk;
  const lunge = pose.attack >= 0 ? Math.sin(pose.attack * Math.PI) * 4 : 0;
  c.translate(lunge, 0);
  legs(c, 4, -6, 6, -5, 5, ph, shade(col, 0.6), 1.8);
  // tail
  c.strokeStyle = '#b08a80';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(-8, -6);
  c.quadraticCurveTo(-16, -4 + (ph >= 0 ? Math.sin(ph) * 2 : 0), -20, -9);
  c.stroke();
  c.fillStyle = col;
  c.beginPath();
  c.ellipse(0, -8, 10, 5, 0, 0, Math.PI * 2);
  c.fill();
  c.beginPath();
  c.ellipse(9, -9, 5, 3.5, 0.2, 0, Math.PI * 2);
  c.fill();
  c.fillStyle = shade(col, 1.3);
  c.beginPath();
  c.arc(6, -13, 2, 0, 7);
  c.fill();
  c.fillStyle = '#e03020';
  c.fillRect(10, -10.5, 1.5, 1.5);
  c.fillStyle = '#ddd';
  c.fillRect(13, -8, 1.5, 2);
}

function drawBeetle(c: CanvasRenderingContext2D, look: Look, pose: Pose) {
  const col = look.skin ?? '#5b4a2a';
  const ph = pose.walk >= 0 ? pose.walk * 1.5 : -1;
  const lunge = pose.attack >= 0 ? Math.sin(pose.attack * Math.PI) * 5 : 0;
  legs(c, 3, -8, 6, -6, 6, ph, shade(col, 0.55), 2);
  c.translate(lunge, 0);
  // shell
  const g = c.createLinearGradient(0, -18, 0, -2);
  g.addColorStop(0, shade(col, 1.4));
  g.addColorStop(1, shade(col, 0.7));
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(-2, -9, 12, 7, 0, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = shade(col, 0.5);
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-13, -9);
  c.lineTo(9, -9);
  c.stroke();
  // head & mandibles
  c.fillStyle = shade(col, 0.8);
  c.beginPath();
  c.ellipse(11, -8, 4.5, 3.5, 0, 0, 7);
  c.fill();
  const open = pose.attack >= 0 ? Math.sin(pose.attack * Math.PI) * 0.6 : 0.15;
  c.strokeStyle = '#2a1a0a';
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(14, -9);
  c.quadraticCurveTo(19, -12 - open * 4, 20, -8 - open * 3);
  c.moveTo(14, -7);
  c.quadraticCurveTo(19, -4 + open * 4, 20, -7 + open * 3);
  c.stroke();
  // stinger tail curling over
  c.strokeStyle = shade(col, 1.1);
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-12, -10);
  c.quadraticCurveTo(-20, -24, -8, -24);
  c.stroke();
  c.fillStyle = '#2a1a0a';
  c.beginPath();
  c.arc(-7, -24, 2, 0, 7);
  c.fill();
}

function drawDog(c: CanvasRenderingContext2D, look: Look, pose: Pose) {
  const col = look.skin ?? '#7a6248';
  const ph = pose.walk >= 0 ? pose.walk * 1.4 : -1;
  const lunge = pose.attack >= 0 ? Math.sin(pose.attack * Math.PI) * 5 : 0;
  c.translate(lunge, 0);
  legs(c, 2, -7, -4, -9, 9, ph, shade(col, 0.7), 2.4);
  legs(c, 2, 5, 8, -9, 9, ph >= 0 ? ph + 2 : -1, shade(col, 0.7), 2.4);
  c.fillStyle = col;
  c.beginPath();
  c.ellipse(0, -12, 10, 4.5, 0, 0, Math.PI * 2);
  c.fill();
  // neck/head
  c.beginPath();
  c.moveTo(7, -14);
  c.lineTo(12, -20);
  c.lineTo(16, -18);
  c.lineTo(11, -11);
  c.fill();
  c.beginPath();
  c.ellipse(15, -19, 4, 3, 0.3, 0, 7);
  c.fill();
  c.fillStyle = shade(col, 0.7);
  c.beginPath();
  c.moveTo(12, -21);
  c.lineTo(13, -26);
  c.lineTo(15, -21);
  c.fill();
  c.fillRect(18, -18, 2.5, 2);
  // tail
  c.strokeStyle = col;
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(-9, -13);
  c.lineTo(-14, -17 + (ph >= 0 ? Math.sin(ph * 2) * 2 : 0));
  c.stroke();
  c.fillStyle = '#111';
  c.fillRect(15, -20, 1.4, 1.4);
}

function drawCrawler(c: CanvasRenderingContext2D, look: Look, pose: Pose) {
  const col = look.skin ?? '#4f5a3a';
  const ph = pose.walk >= 0 ? pose.walk * 2 : -1;
  legs(c, 5, -10, 8, -6, 6, ph, shade(col, 0.6), 1.6);
  const lunge = pose.attack >= 0 ? Math.sin(pose.attack * Math.PI) * 6 : 0;
  c.translate(lunge, 0);
  for (let i = 0; i < 4; i++) {
    c.fillStyle = shade(col, 0.8 + i * 0.12);
    c.beginPath();
    c.ellipse(-9 + i * 6, -8 - Math.sin(i) * 1.5, 5, 4.5, 0, 0, 7);
    c.fill();
  }
  c.strokeStyle = shade(col, 1.4);
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(10, -10);
  c.lineTo(16, -16);
  c.lineTo(19, -9);
  c.moveTo(10, -8);
  c.lineTo(17, -5);
  c.stroke();
  c.fillStyle = '#d0e040';
  c.fillRect(11, -11, 1.5, 1.5);
  c.fillRect(13, -10, 1.5, 1.5);
}

function drawLizard(c: CanvasRenderingContext2D, look: Look, pose: Pose) {
  const col = look.skin ?? '#6d6a3d';
  const ph = pose.walk >= 0 ? pose.walk * 1.3 : -1;
  legs(c, 2, -8, -5, -5, 5, ph, shade(col, 0.7), 3);
  legs(c, 2, 5, 8, -5, 5, ph >= 0 ? ph + 2 : -1, shade(col, 0.7), 3);
  const lunge = pose.attack >= 0 ? Math.sin(pose.attack * Math.PI) * 5 : 0;
  c.translate(lunge, 0);
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(-26, -5);
  c.quadraticCurveTo(-12, -12, 0, -11);
  c.quadraticCurveTo(12, -12, 16, -9);
  c.lineTo(20, -8);
  c.lineTo(16, -5);
  c.quadraticCurveTo(0, -3, -26, -5);
  c.fill();
  c.fillStyle = shade(col, 0.7);
  for (let i = 0; i < 6; i++) {
    c.beginPath();
    c.moveTo(-12 + i * 4, -11);
    c.lineTo(-10 + i * 4, -15);
    c.lineTo(-8 + i * 4, -11);
    c.fill();
  }
  c.fillStyle = '#e0a020';
  c.fillRect(14, -10, 1.5, 1.5);
}

function drawOx(c: CanvasRenderingContext2D, look: Look, pose: Pose) {
  const col = look.skin ?? '#8a7358';
  const ph = pose.walk >= 0 ? pose.walk : -1;
  legs(c, 2, -9, -6, -11, 11, ph, shade(col, 0.6), 3);
  legs(c, 2, 7, 10, -11, 11, ph >= 0 ? ph + 2 : -1, shade(col, 0.6), 3);
  c.fillStyle = col;
  c.beginPath();
  c.ellipse(0, -16, 14, 7, 0, 0, 7);
  c.fill();
  c.fillStyle = shade(col, 1.15);
  c.beginPath();
  c.ellipse(-2, -22, 6, 4, 0, 0, 7);
  c.fill(); // hump
  c.fillStyle = shade(col, 0.9);
  c.beginPath();
  c.ellipse(16, -17, 5, 4, 0.4, 0, 7);
  c.fill();
  c.strokeStyle = '#d8c8a0';
  c.lineWidth = 1.8;
  c.beginPath();
  c.moveTo(15, -20);
  c.quadraticCurveTo(12, -26, 16, -27);
  c.moveTo(18, -20);
  c.quadraticCurveTo(22, -25, 20, -27);
  c.stroke();
  c.fillStyle = '#111';
  c.fillRect(18, -18, 1.5, 1.5);
}

function drawRobot(c: CanvasRenderingContext2D, look: Look, pose: Pose) {
  const col = look.skin ?? '#6a7078';
  const t = pose.t;
  // treads
  c.fillStyle = '#2a2a2a';
  roundRect(c, -11, -7, 22, 7, 3);
  c.fill();
  c.fillStyle = '#444';
  for (let i = 0; i < 5; i++) c.fillRect(-10 + ((i * 5 + (pose.walk >= 0 ? t * 20 : 0)) % 22), -6, 2, 5);
  // body
  c.fillStyle = col;
  roundRect(c, -8, -24, 16, 17, 3);
  c.fill();
  c.fillStyle = shade(col, 0.7);
  c.fillRect(-8, -12, 16, 3);
  // dome with eye
  c.fillStyle = shade(col, 1.2);
  c.beginPath();
  c.arc(0, -24, 7, Math.PI, 0);
  c.fill();
  c.fillStyle = pose.attack >= 0 ? '#ff4030' : `rgba(255,${80 + Math.sin(t * 4) * 40},40,1)`;
  c.beginPath();
  c.arc(3, -26, 2, 0, 7);
  c.fill();
  // gun arm
  c.fillStyle = '#333';
  c.fillRect(6, -20, 9, 3);
  c.fillStyle = '#c03020';
  c.fillRect(14, -20, 2, 3);
  // antenna
  c.strokeStyle = '#999';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(-3, -30);
  c.lineTo(-5, -38);
  c.stroke();
}

export function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y);
  c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r);
  c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r);
  c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
}
