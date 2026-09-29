// Item icons drawn on canvas from each item's category and colours.
import { ITEM, ItemDef } from '../content/items';

const cache = new Map<string, string>();
export const CELL_PX = 30;

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
function shade(c: number, k: number) {
  const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k);
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export function iconFor(id: string): string {
  const c = cache.get(id);
  if (c) return c;
  const d = ITEM[id];
  const W = d.w * CELL_PX * 2, H = d.h * CELL_PX * 2; // 2x for crispness
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.lineJoin = 'round';
  g.lineCap = 'round';
  draw(g, d, W, H);
  const url = cv.toDataURL();
  cache.set(id, url);
  return url;
}

function draw(g: CanvasRenderingContext2D, d: ItemDef, W: number, H: number) {
  const cx = W / 2, cy = H / 2;
  const m = Math.min(W, H);
  g.save();
  switch (d.icon) {
    case 'weapon': {
      const v = d.wvis!;
      const blade = hex(v.blade), handle = hex(v.handle);
      // diagonal weapon from bottom-left to top-right
      g.translate(cx, cy);
      const L = Math.hypot(W, H) * 0.44;
      g.rotate(Math.atan2(-H, W) * 0.0 - Math.PI / 2 + (W > H ? Math.PI / 4 : 0.28));
      const grip = v.kind === 'polearm' ? L * 0.55 : v.kind === 'heavy' ? L * 0.3 : L * 0.22;
      g.strokeStyle = handle; g.lineWidth = m * 0.11;
      g.beginPath(); g.moveTo(0, L); g.lineTo(0, L - grip); g.stroke();
      g.fillStyle = '#3a3228';
      if (v.kind !== 'polearm' && v.kind !== 'blunt' && v.kind !== 'pick') g.fillRect(-m * 0.2, L - grip - m * 0.04, m * 0.4, m * 0.08);
      g.fillStyle = blade; g.strokeStyle = shade(v.blade, 0.55); g.lineWidth = 2;
      const top = -L;
      const bw = (v.wide ?? 1) * m * (v.kind === 'hacker' || v.kind === 'heavy' ? 0.3 : v.kind === 'sabre' ? 0.2 : 0.13);
      g.beginPath();
      if (v.kind === 'blunt' || v.kind === 'pick') {
        g.strokeStyle = handle; g.lineWidth = m * 0.1;
        g.moveTo(0, L - grip); g.lineTo(0, top + m * 0.3); g.stroke();
        g.fillStyle = blade;
        if (v.kind === 'pick') { g.beginPath(); g.moveTo(-m * 0.4, top + m * 0.35); g.quadraticCurveTo(0, top, m * 0.4, top + m * 0.3); g.lineTo(0, top + m * 0.42); g.closePath(); g.fill(); }
        else { g.beginPath(); g.roundRect(-m * 0.2, top, m * 0.4, m * 0.5, m * 0.08); g.fill(); g.stroke(); }
      } else if (v.kind === 'polearm') {
        g.moveTo(0, L - grip); g.lineTo(-bw * 0.6, top + m * 0.5); g.quadraticCurveTo(0, top - m * 0.1, bw * 0.8, top + m * 0.3); g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = handle; g.lineWidth = m * 0.08; g.beginPath(); g.moveTo(0, L - grip); g.lineTo(0, top + m * 0.55); g.stroke();
      } else if (v.kind === 'katana' || v.kind === 'dagger') {
        g.moveTo(-bw / 2, L - grip - m * 0.05); g.quadraticCurveTo(bw * 0.8, 0, bw * 0.4, top); g.lineTo(bw * 0.9, top + m * 0.15); g.quadraticCurveTo(bw * 1.6, 0, bw / 2, L - grip - m * 0.05); g.closePath(); g.fill(); g.stroke();
      } else {
        g.moveTo(-bw / 2, L - grip - m * 0.05); g.lineTo(-bw / 2, top + bw); g.quadraticCurveTo(-bw / 2, top, bw * 0.6, top); g.lineTo(bw / 2 + (v.kind === 'hacker' ? bw * 0.4 : 0), L - grip - m * 0.05); g.closePath(); g.fill(); g.stroke();
      }
      break;
    }
    case 'crossbow': {
      g.translate(cx, cy);
      g.strokeStyle = '#5a4a38'; g.lineWidth = m * 0.12;
      g.beginPath(); g.moveTo(0, H * 0.4); g.lineTo(0, -H * 0.3); g.stroke();
      g.strokeStyle = '#8a7a6a'; g.lineWidth = m * 0.07;
      g.beginPath(); g.moveTo(-W * 0.4, -H * 0.1); g.quadraticCurveTo(0, -H * 0.42, W * 0.4, -H * 0.1); g.stroke();
      g.strokeStyle = '#e8e0d0'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(-W * 0.4, -H * 0.1); g.lineTo(0, H * 0.05); g.lineTo(W * 0.4, -H * 0.1); g.stroke();
      break;
    }
    case 'laser': {
      // a sleek gun, barrel to the right, a blue gleam at the muzzle
      const long = d.w > 2;
      g.fillStyle = '#8a9098'; g.strokeStyle = 'rgba(10,10,14,0.8)'; g.lineWidth = 3;
      g.beginPath(); g.roundRect(W * 0.1, H * 0.34, W * (long ? 0.46 : 0.5), H * 0.24, 6); g.fill(); g.stroke();
      g.fillStyle = '#3a3e44';
      g.fillRect(W * (long ? 0.54 : 0.58), H * 0.4, W * (long ? 0.36 : 0.3), H * 0.12);
      for (let i = 0; i < (long ? 6 : 3); i++) g.fillRect(W * (long ? 0.56 : 0.6) + i * W * 0.055, H * 0.37, W * 0.025, H * 0.18);
      g.fillStyle = '#5a5048'; g.beginPath(); g.moveTo(W * 0.2, H * 0.56); g.lineTo(W * 0.32, H * 0.56); g.lineTo(W * 0.27, H * 0.86); g.lineTo(W * 0.16, H * 0.86); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#7ad8ff'; g.shadowColor = '#7ad8ff'; g.shadowBlur = 10;
      g.beginPath(); g.arc(W * 0.92, H * 0.46, m * 0.06, 0, Math.PI * 2); g.fill();
      g.fillRect(W * 0.2, H * 0.4, W * 0.12, H * 0.07);
      break;
    }
    case 'cell': {
      // a stubby canister with a glowing window
      g.fillStyle = '#6a7078'; g.strokeStyle = 'rgba(10,10,14,0.8)'; g.lineWidth = 3;
      g.beginPath(); g.roundRect(W * 0.26, H * 0.18, W * 0.48, H * 0.7, 8); g.fill(); g.stroke();
      g.fillStyle = '#3a3e44'; g.fillRect(W * 0.38, H * 0.08, W * 0.24, H * 0.12);
      g.fillStyle = '#7ae0ff'; g.shadowColor = '#7ae0ff'; g.shadowBlur = 12;
      g.fillRect(W * 0.36, H * 0.34, W * 0.28, H * 0.38);
      break;
    }
    case 'bolts':
      g.strokeStyle = '#8a7a60'; g.lineWidth = m * 0.08;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(W * (0.3 + i * 0.2), H * 0.85); g.lineTo(W * (0.3 + i * 0.2), H * 0.2); g.stroke(); }
      g.fillStyle = '#9a9a9a';
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(W * (0.3 + i * 0.2) - m * 0.08, H * 0.25); g.lineTo(W * (0.3 + i * 0.2), H * 0.08); g.lineTo(W * (0.3 + i * 0.2) + m * 0.08, H * 0.25); g.fill(); }
      break;
    case 'body':
    case 'shirt': {
      const v = d.vis!;
      const col = v.armour?.color ?? v.torso?.color ?? 0x8a7a60;
      const col2 = v.armour?.color2 ?? v.torso?.color2 ?? col;
      g.fillStyle = hex(col); g.strokeStyle = shade(col, 0.5); g.lineWidth = 3;
      g.beginPath();
      g.moveTo(W * 0.3, H * 0.12); g.lineTo(W * 0.12, H * 0.25); g.lineTo(W * 0.08, H * 0.55); g.lineTo(W * 0.24, H * 0.58); g.lineTo(W * 0.28, H * 0.9);
      g.lineTo(W * 0.72, H * 0.9); g.lineTo(W * 0.76, H * 0.58); g.lineTo(W * 0.92, H * 0.55); g.lineTo(W * 0.88, H * 0.25); g.lineTo(W * 0.7, H * 0.12);
      g.quadraticCurveTo(cx, H * 0.26, W * 0.3, H * 0.12); g.closePath(); g.fill(); g.stroke();
      g.strokeStyle = hex(col2); g.lineWidth = m * 0.05;
      if (v.armour) for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(W * 0.3, H * (0.45 + i * 0.13)); g.lineTo(W * 0.7, H * (0.45 + i * 0.13)); g.stroke(); }
      else { g.beginPath(); g.moveTo(cx, H * 0.22); g.lineTo(cx, H * 0.88); g.stroke(); }
      break;
    }
    case 'legs': {
      const col = d.vis!.legs!.color;
      g.fillStyle = hex(col); g.strokeStyle = shade(col, 0.5); g.lineWidth = 3;
      g.beginPath(); g.moveTo(W * 0.2, H * 0.08); g.lineTo(W * 0.8, H * 0.08); g.lineTo(W * 0.85, H * 0.92); g.lineTo(W * 0.58, H * 0.92); g.lineTo(cx, H * 0.35); g.lineTo(W * 0.42, H * 0.92); g.lineTo(W * 0.15, H * 0.92); g.closePath(); g.fill(); g.stroke();
      break;
    }
    case 'feet': {
      const col = d.vis!.feet!.color;
      g.fillStyle = hex(col); g.strokeStyle = shade(col, 0.5); g.lineWidth = 3;
      for (const ox of [0.08, 0.5]) { g.beginPath(); g.moveTo(W * (ox + 0.08), H * 0.15); g.lineTo(W * (ox + 0.28), H * 0.15); g.lineTo(W * (ox + 0.3), H * 0.62); g.lineTo(W * (ox + 0.42), H * 0.78); g.lineTo(W * (ox + 0.42), H * 0.88); g.lineTo(W * (ox + 0.06), H * 0.88); g.closePath(); g.fill(); g.stroke(); }
      break;
    }
    case 'head': {
      const v = d.vis!.head!;
      g.fillStyle = hex(v.color); g.strokeStyle = shade(v.color, 0.5); g.lineWidth = 3;
      if (v.style === 'straw' || v.style === 'kasa') { g.beginPath(); g.moveTo(W * 0.05, H * 0.7); g.lineTo(cx, H * 0.2); g.lineTo(W * 0.95, H * 0.7); g.closePath(); g.fill(); g.stroke(); }
      else if (v.style === 'bucket') { g.beginPath(); g.roundRect(W * 0.22, H * 0.15, W * 0.56, H * 0.72, 6); g.fill(); g.stroke(); g.fillStyle = '#111'; g.fillRect(W * 0.3, H * 0.42, W * 0.4, H * 0.06); }
      else if (v.style === 'goggles' || v.style === 'gasmask') { g.beginPath(); g.arc(W * 0.33, cy, m * 0.2, 0, 7); g.arc(W * 0.67, cy, m * 0.2, 0, 7); g.fill(); g.stroke(); g.fillStyle = v.style === 'gasmask' ? '#6aa0a0' : '#9ac0c8'; g.beginPath(); g.arc(W * 0.33, cy, m * 0.12, 0, 7); g.arc(W * 0.67, cy, m * 0.12, 0, 7); g.fill(); }
      else { g.beginPath(); g.arc(cx, H * 0.58, m * 0.38, Math.PI, 0); g.lineTo(W * 0.88, H * 0.72); g.lineTo(W * 0.12, H * 0.72); g.closePath(); g.fill(); g.stroke(); if (v.style === 'helm_ember') { g.fillStyle = '#e08a2a'; g.fillRect(cx - 3, H * 0.08, 6, H * 0.2); } }
      break;
    }
    case 'back': {
      const col = d.vis!.back!.color;
      g.fillStyle = hex(col); g.strokeStyle = shade(col, 0.5); g.lineWidth = 3;
      g.beginPath(); g.roundRect(W * 0.18, H * 0.18, W * 0.64, H * 0.72, 10); g.fill(); g.stroke();
      g.fillStyle = shade(col, 0.8); g.beginPath(); g.roundRect(W * 0.26, H * 0.12, W * 0.48, H * 0.25, 8); g.fill(); g.stroke();
      g.strokeStyle = shade(col, 0.6); g.beginPath(); g.moveTo(W * 0.3, H * 0.55); g.lineTo(W * 0.7, H * 0.55); g.stroke();
      break;
    }
    case 'food': {
      const meat = d.id.includes('meat') || d.id.includes('fish') || d.id === 'stew';
      g.fillStyle = meat ? '#a0503a' : d.id === 'honey_resin' ? '#d8a03a' : d.id === 'foodcube' ? '#9ab0b8' : d.id.includes('fruit') || d.id === 'cactus_pulp' ? '#7a9a4a' : '#c8a060';
      g.strokeStyle = 'rgba(40,20,10,0.7)'; g.lineWidth = 3;
      g.beginPath();
      if (d.id === 'foodcube') g.roundRect(W * 0.2, H * 0.2, W * 0.6, H * 0.6, 6); else g.ellipse(cx, cy, W * 0.36, H * 0.28, -0.4, 0, 7);
      g.fill(); g.stroke();
      if (meat) { g.fillStyle = '#e8d0c0'; g.beginPath(); g.arc(W * 0.66, H * 0.38, m * 0.08, 0, 7); g.fill(); }
      break;
    }
    case 'bottle': {
      g.fillStyle = d.id === 'cactus_rum' ? '#4a7ac0' : d.id === 'dustwine' ? '#a03a4a' : '#8a7040';
      g.strokeStyle = 'rgba(20,10,5,0.7)'; g.lineWidth = 3;
      g.beginPath(); g.roundRect(W * 0.22, H * 0.4, W * 0.56, H * 0.52, 8); g.fill(); g.stroke();
      g.fillRect(W * 0.4, H * 0.1, W * 0.2, H * 0.32); g.strokeRect(W * 0.4, H * 0.1, W * 0.2, H * 0.32);
      break;
    }
    case 'leaf':
      g.fillStyle = '#5a8a3a'; g.strokeStyle = '#2a4a1a'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(W * 0.15, H * 0.85); g.quadraticCurveTo(W * 0.1, H * 0.1, W * 0.85, H * 0.15); g.quadraticCurveTo(W * 0.9, H * 0.9, W * 0.15, H * 0.85); g.fill(); g.stroke();
      break;
    case 'mushroom': {
      // a pale cap on a stalk, glowing
      g.shadowColor = '#7ad0ff'; g.shadowBlur = 14;
      g.fillStyle = '#d8e8e0'; g.fillRect(W * 0.43, H * 0.45, W * 0.14, H * 0.42);
      g.fillStyle = '#9ad8f0'; g.strokeStyle = '#3a6878'; g.lineWidth = 3;
      g.beginPath(); g.ellipse(cx, H * 0.45, W * 0.36, H * 0.24, 0, Math.PI, 0); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#e8fbff'; for (const [px, py] of [[0.36, 0.34], [0.55, 0.3], [0.64, 0.4]]) { g.beginPath(); g.arc(W * px, H * py, m * 0.045, 0, 7); g.fill(); }
      break;
    }
    case 'thorn': {
      // a thorny stem with red pods
      g.strokeStyle = '#5a3a24'; g.lineWidth = m * 0.08;
      g.beginPath(); g.moveTo(W * 0.2, H * 0.85); g.quadraticCurveTo(W * 0.5, H * 0.5, W * 0.8, H * 0.15); g.stroke();
      g.lineWidth = m * 0.04; for (const k of [0.3, 0.5, 0.7]) { g.beginPath(); g.moveTo(W * (0.2 + k * 0.55), H * (0.85 - k * 0.7)); g.lineTo(W * (0.12 + k * 0.55), H * (0.72 - k * 0.7)); g.stroke(); }
      g.fillStyle = '#c02a20'; g.strokeStyle = '#5a0a08'; g.lineWidth = 2;
      for (const [px, py] of [[0.42, 0.62], [0.62, 0.38], [0.3, 0.42]]) { g.beginPath(); g.ellipse(W * px, H * py, m * 0.11, m * 0.08, 0.6, 0, 7); g.fill(); g.stroke(); }
      break;
    }
    case 'roll': {
      // three rolled smokes, tied
      for (let i = 0; i < 3; i++) {
        const y = H * (0.34 + i * 0.16);
        g.fillStyle = '#e0d4b0'; g.strokeStyle = '#6a5a3a'; g.lineWidth = 2;
        g.beginPath(); g.roundRect(W * 0.14, y - H * 0.06, W * 0.66, H * 0.12, 5); g.fill(); g.stroke();
        g.fillStyle = '#6a4a2a'; g.fillRect(W * 0.74, y - H * 0.06, W * 0.1, H * 0.12);
      }
      g.fillStyle = '#8a2a20'; g.fillRect(W * 0.42, H * 0.24, W * 0.07, H * 0.52);
      break;
    }
    case 'powder': {
      // a twist of paper spilling glowing blue dust
      g.fillStyle = '#c8bca0'; g.strokeStyle = '#5a4a30'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(W * 0.2, H * 0.25); g.lineTo(W * 0.8, H * 0.3); g.lineTo(W * 0.62, H * 0.62); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#6ad0ff'; g.shadowColor = '#6ad0ff'; g.shadowBlur = 16;
      g.beginPath(); g.ellipse(W * 0.5, H * 0.78, W * 0.3, H * 0.1, 0, 0, 7); g.fill();
      break;
    }
    case 'vial': {
      // a stoppered glass vial of red syrup
      g.strokeStyle = 'rgba(220,230,240,0.9)'; g.lineWidth = 3;
      g.fillStyle = 'rgba(200,220,230,0.25)';
      g.beginPath(); g.roundRect(W * 0.34, H * 0.2, W * 0.32, H * 0.68, 10); g.fill(); g.stroke();
      g.fillStyle = '#e0302a'; g.shadowColor = '#ff4030'; g.shadowBlur = 14;
      g.beginPath(); g.roundRect(W * 0.37, H * 0.42, W * 0.26, H * 0.43, 8); g.fill();
      g.shadowBlur = 0; g.fillStyle = '#6a4a2a'; g.fillRect(W * 0.38, H * 0.1, W * 0.24, H * 0.12);
      break;
    }
    case 'med':
    case 'splint':
    case 'gear': {
      g.fillStyle = d.icon === 'gear' ? '#6a7078' : '#d8d0c0'; g.strokeStyle = 'rgba(30,20,10,0.7)'; g.lineWidth = 3;
      g.beginPath(); g.roundRect(W * 0.1, H * 0.15, W * 0.8, H * 0.7, 8); g.fill(); g.stroke();
      g.fillStyle = d.icon === 'gear' ? '#d8b040' : '#c03a2a';
      if (d.icon === 'splint') { g.fillRect(W * 0.2, cy - 4, W * 0.6, 8); }
      else { g.fillRect(cx - m * 0.08, cy - m * 0.25, m * 0.16, m * 0.5); g.fillRect(cx - m * 0.25, cy - m * 0.08, m * 0.5, m * 0.16); }
      break;
    }
    case 'ore':
    case 'trade': {
      const col = d.color ?? 0x8a8070;
      g.fillStyle = hex(col); g.strokeStyle = shade(col, 0.45); g.lineWidth = 3;
      g.beginPath();
      if (d.id.includes('plates') || d.id.includes('bars') || d.id === 'building_mats') {
        g.moveTo(W * 0.1, H * 0.6); g.lineTo(W * 0.3, H * 0.3); g.lineTo(W * 0.9, H * 0.3); g.lineTo(W * 0.7, H * 0.6); g.closePath(); g.fill(); g.stroke();
        g.beginPath(); g.moveTo(W * 0.1, H * 0.75); g.lineTo(W * 0.3, H * 0.45); g.lineTo(W * 0.9, H * 0.45); g.lineTo(W * 0.7, H * 0.75); g.closePath(); g.fill(); g.stroke();
      } else if (d.id === 'fabric' || d.id === 'silk' || d.id === 'leather' || d.id === 'hide') {
        g.moveTo(W * 0.15, H * 0.2); g.lineTo(W * 0.85, H * 0.25); g.lineTo(W * 0.8, H * 0.8); g.lineTo(W * 0.2, H * 0.75); g.closePath(); g.fill(); g.stroke();
      } else if (d.id === 'ancient_coin' || d.id === 'glass_beads') {
        for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(W * (0.3 + i * 0.2), H * (0.6 - (i % 2) * 0.2), m * 0.18, 0, 7); g.fill(); g.stroke(); }
      } else {
        g.moveTo(W * 0.2, H * 0.7); g.lineTo(W * 0.12, H * 0.4); g.lineTo(W * 0.4, H * 0.15); g.lineTo(W * 0.75, H * 0.2); g.lineTo(W * 0.9, H * 0.55); g.lineTo(W * 0.7, H * 0.85); g.lineTo(W * 0.35, H * 0.88); g.closePath(); g.fill(); g.stroke();
        if (d.cat === 'resource') { g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.arc(W * 0.4, H * 0.4, m * 0.08, 0, 7); g.fill(); }
      }
      break;
    }
    case 'tablet':
    case 'book':
    case 'core':
    case 'shard': {
      const col = d.icon === 'core' ? '#6ad0e0' : d.icon === 'shard' ? '#a0e0d8' : d.icon === 'book' ? '#6a3a2a' : '#4a5058';
      g.fillStyle = col; g.strokeStyle = 'rgba(10,10,10,0.7)'; g.lineWidth = 3;
      g.beginPath();
      if (d.icon === 'core') { g.moveTo(cx, H * 0.1); g.lineTo(W * 0.85, cy); g.lineTo(cx, H * 0.9); g.lineTo(W * 0.15, cy); g.closePath(); }
      else if (d.icon === 'shard') { g.moveTo(W * 0.4, H * 0.1); g.lineTo(W * 0.7, H * 0.4); g.lineTo(W * 0.5, H * 0.9); g.lineTo(W * 0.3, H * 0.5); g.closePath(); }
      else g.roundRect(W * 0.15, H * 0.12, W * 0.7, H * 0.76, 5);
      g.fill(); g.stroke();
      if (d.icon === 'tablet') { g.strokeStyle = '#7ad0e0'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(W * 0.25, H * (0.28 + i * 0.13)); g.lineTo(W * (0.5 + (i % 2) * 0.2), H * (0.28 + i * 0.13)); g.stroke(); } }
      break;
    }
    case 'arm':
    case 'leg': {
      g.strokeStyle = '#6a7078'; g.lineWidth = m * 0.16;
      g.beginPath();
      if (d.icon === 'arm') { g.moveTo(W * 0.3, H * 0.1); g.lineTo(W * 0.45, H * 0.5); g.lineTo(W * 0.4, H * 0.85); }
      else { g.moveTo(cx, H * 0.08); g.lineTo(W * 0.55, H * 0.5); g.lineTo(W * 0.45, H * 0.85); g.lineTo(W * 0.75, H * 0.9); }
      g.stroke();
      g.fillStyle = '#d8b040';
      g.beginPath(); g.arc(W * 0.45, H * 0.5, m * 0.1, 0, 7); g.fill();
      break;
    }
    case 'chain':
      g.strokeStyle = '#5a5a5e'; g.lineWidth = m * 0.08;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(W * (0.25 + i * 0.25), cy, W * 0.14, H * 0.3, 0, 0, 7); g.stroke(); }
      break;
    case 'key':
      g.strokeStyle = '#b8a060'; g.lineWidth = m * 0.12;
      g.beginPath(); g.arc(W * 0.35, H * 0.35, m * 0.2, 0, 7); g.moveTo(W * 0.5, H * 0.5); g.lineTo(W * 0.85, H * 0.85); g.moveTo(W * 0.7, H * 0.7); g.lineTo(W * 0.8, H * 0.6); g.stroke();
      break;
    default:
      g.fillStyle = '#8a7a60'; g.beginPath(); g.arc(cx, cy, m * 0.3, 0, 7); g.fill();
  }
  g.restore();
}
