// Inventory item icons, drawn into a w x h box.

type IconFn = (c: CanvasRenderingContext2D) => void; // drawn in a 48x32 space

const metal = '#5a5c5e';
const dark = '#2e3032';
const wood = '#7a4e2c';

function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r = 2) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
  c.fill();
}

const ICONS: Record<string, IconFn> = {
  knife: (c) => { c.fillStyle = '#c8ccd0'; c.beginPath(); c.moveTo(8, 18); c.lineTo(34, 14); c.lineTo(38, 16); c.lineTo(34, 19); c.closePath(); c.fill(); c.fillStyle = '#3a2a1a'; rr(c, 34, 14, 10, 5); },
  tknife: (c) => { c.fillStyle = '#c8ccd0'; c.beginPath(); c.moveTo(6, 16); c.lineTo(30, 13); c.lineTo(30, 19); c.closePath(); c.fill(); c.fillStyle = '#555'; rr(c, 30, 14, 12, 4); },
  crowbar: (c) => { c.strokeStyle = '#9a2a1a'; c.lineWidth = 3; c.beginPath(); c.moveTo(6, 26); c.lineTo(38, 8); c.quadraticCurveTo(44, 6, 42, 12); c.stroke(); },
  spear: (c) => { c.strokeStyle = wood; c.lineWidth = 2.5; c.beginPath(); c.moveTo(2, 28); c.lineTo(38, 6); c.stroke(); c.fillStyle = '#ccc'; c.beginPath(); c.moveTo(36, 8); c.lineTo(46, 2); c.lineTo(40, 10); c.fill(); },
  sledge: (c) => { c.strokeStyle = wood; c.lineWidth = 3; c.beginPath(); c.moveTo(6, 28); c.lineTo(32, 10); c.stroke(); c.fillStyle = '#555'; c.save(); c.translate(34, 8); c.rotate(-0.6); rr(c, -6, -5, 14, 10); c.restore(); },
  baton: (c) => { c.fillStyle = '#222'; c.save(); c.translate(24, 16); c.rotate(-0.4); rr(c, -18, -2, 32, 5); c.fillStyle = '#60c0ff'; rr(c, 14, -3, 6, 7); c.restore(); },
  knuckles: (c) => { c.fillStyle = '#aaa'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(14 + i * 7, 14, 4, 0, 7); c.fill(); } c.fillStyle = '#888'; rr(c, 10, 17, 28, 6); },
  gauntlet: (c) => { c.fillStyle = '#6a6a6a'; rr(c, 8, 8, 24, 16, 4); c.fillStyle = '#888'; rr(c, 30, 10, 12, 12, 3); c.fillStyle = '#333'; rr(c, 12, 12, 14, 3); },
  grenade: (c) => { c.fillStyle = '#4a5a3a'; c.beginPath(); c.ellipse(24, 18, 8, 10, 0, 0, 7); c.fill(); c.fillStyle = '#777'; rr(c, 20, 4, 8, 5); c.strokeStyle = '#999'; c.beginPath(); c.arc(30, 6, 3, 0, 7); c.stroke(); },
  molotov: (c) => { c.fillStyle = 'rgba(90,140,80,0.9)'; rr(c, 18, 12, 12, 16, 3); rr(c, 21, 5, 6, 8, 1); c.fillStyle = '#c8b890'; rr(c, 21, 1, 6, 5); c.fillStyle = '#ff9030'; c.beginPath(); c.arc(24, 1, 3, 0, 7); c.fill(); },
  pistol: (c) => { c.fillStyle = dark; rr(c, 8, 10, 30, 7); c.fillStyle = '#4a3a2a'; c.save(); c.translate(12, 16); c.rotate(0.3); rr(c, 0, 0, 7, 12); c.restore(); },
  revolver: (c) => { c.fillStyle = metal; rr(c, 10, 10, 30, 5); c.beginPath(); c.arc(16, 15, 5, 0, 7); c.fill(); c.fillStyle = wood; c.save(); c.translate(10, 16); c.rotate(0.35); rr(c, 0, 0, 7, 12); c.restore(); },
  smg: (c) => { c.fillStyle = dark; rr(c, 6, 10, 36, 8); rr(c, 20, 16, 5, 12); c.fillStyle = metal; rr(c, 10, 17, 5, 8); rr(c, 40, 12, 6, 3); },
  rifle: (c) => { c.fillStyle = wood; rr(c, 2, 14, 22, 6, 2); c.fillStyle = dark; rr(c, 20, 12, 26, 4); c.fillStyle = '#333'; rr(c, 22, 7, 12, 4); },
  arifle: (c) => { c.fillStyle = '#2e3028'; rr(c, 2, 13, 44, 6); rr(c, 22, 18, 6, 10); rr(c, 4, 18, 8, 6); c.fillStyle = metal; rr(c, 38, 11, 8, 3); },
  shotgun: (c) => { c.fillStyle = wood; rr(c, 2, 15, 20, 7); c.fillStyle = dark; rr(c, 18, 12, 28, 3); rr(c, 18, 15, 28, 3); },
  laserpistol: (c) => { c.fillStyle = '#8a8e90'; rr(c, 8, 9, 30, 8, 3); c.fillStyle = '#e04030'; rr(c, 36, 11, 4, 4); c.fillStyle = '#555'; c.save(); c.translate(12, 16); c.rotate(0.3); rr(c, 0, 0, 7, 12); c.restore(); },
  laserrifle: (c) => { c.fillStyle = '#7a8084'; rr(c, 2, 11, 42, 9, 3); c.fillStyle = '#e04030'; rr(c, 42, 13, 4, 4); c.fillStyle = '#444'; rr(c, 16, 19, 6, 8); },
  plasmarifle: (c) => { c.fillStyle = '#5a6a5e'; rr(c, 2, 10, 42, 10, 3); c.fillStyle = '#60e060'; rr(c, 20, 6, 10, 5); rr(c, 42, 12, 4, 5); },
  flamer: (c) => { c.fillStyle = '#8a5a2a'; rr(c, 4, 8, 12, 20, 5); c.fillStyle = dark; rr(c, 16, 14, 26, 5); c.fillStyle = '#aaa'; rr(c, 40, 13, 6, 7); },
  minigun: (c) => { c.fillStyle = '#4a4a4c'; rr(c, 4, 10, 26, 12, 3); c.fillStyle = dark; for (let i = 0; i < 3; i++) rr(c, 28, 11 + i * 3.5, 18, 2.5); },
  rocket: (c) => { c.fillStyle = '#4a5a3a'; rr(c, 2, 11, 44, 9, 4); c.fillStyle = '#333'; rr(c, 16, 19, 5, 8); },
  ammo: (c) => { c.fillStyle = '#6a5a3a'; rr(c, 10, 10, 28, 16); c.fillStyle = '#c8a040'; for (let i = 0; i < 4; i++) rr(c, 13 + i * 6, 5, 4, 8, 2); },
  shells: (c) => { c.fillStyle = '#a02a1a'; for (let i = 0; i < 4; i++) rr(c, 10 + i * 7, 8, 5, 14, 1); c.fillStyle = '#c8a040'; for (let i = 0; i < 4; i++) rr(c, 10 + i * 7, 20, 5, 4, 1); },
  cell: (c) => { c.fillStyle = '#5a6a7a'; rr(c, 14, 8, 20, 18, 3); c.fillStyle = '#60c0ff'; rr(c, 18, 12, 12, 4); c.fillStyle = '#ccc'; rr(c, 20, 4, 8, 4); },
  fuel: (c) => { c.fillStyle = '#8a3a1a'; rr(c, 14, 6, 20, 22, 4); c.fillStyle = '#ddd'; rr(c, 20, 2, 8, 5); },
  rocketammo: (c) => { c.fillStyle = '#5a6a4a'; rr(c, 6, 13, 30, 7, 3); c.fillStyle = '#b03020'; c.beginPath(); c.moveTo(36, 12); c.lineTo(44, 16); c.lineTo(36, 21); c.fill(); },
  jumpsuit: (c) => { c.fillStyle = '#2f7f86'; rr(c, 14, 4, 20, 16, 3); rr(c, 14, 18, 8, 12); rr(c, 26, 18, 8, 12); rr(c, 8, 4, 8, 14); rr(c, 32, 4, 8, 14); c.fillStyle = '#e08a2a'; rr(c, 23, 4, 2, 16); },
  jacket: (c) => { c.fillStyle = '#3a2a20'; rr(c, 12, 4, 24, 22, 4); rr(c, 6, 5, 8, 16); rr(c, 34, 5, 8, 16); c.fillStyle = '#6a5a4a'; rr(c, 23, 4, 2, 22); },
  leather: (c) => { c.fillStyle = '#6b4a2e'; rr(c, 12, 4, 24, 24, 4); c.fillStyle = '#4b321e'; rr(c, 12, 12, 24, 3); rr(c, 12, 20, 24, 3); rr(c, 6, 4, 8, 10); rr(c, 34, 4, 8, 10); },
  metal: (c) => { c.fillStyle = '#7d7f82'; rr(c, 12, 4, 24, 24, 3); c.fillStyle = '#a0a2a5'; rr(c, 14, 6, 20, 7); rr(c, 14, 15, 20, 6); c.fillStyle = '#5d5f62'; rr(c, 5, 3, 9, 9); rr(c, 34, 3, 9, 9); },
  combat: (c) => { c.fillStyle = '#3d4535'; rr(c, 12, 4, 24, 24, 4); c.fillStyle = '#556048'; rr(c, 14, 6, 20, 10, 3); c.fillStyle = '#2d3525'; rr(c, 5, 3, 9, 10, 3); rr(c, 34, 3, 9, 10, 3); },
  power: (c) => { c.fillStyle = '#5a5e62'; rr(c, 11, 3, 26, 26, 6); c.fillStyle = '#7a7e82'; rr(c, 14, 6, 20, 12, 4); c.fillStyle = '#c8a040'; rr(c, 20, 10, 8, 3); c.fillStyle = '#44484c'; rr(c, 3, 3, 10, 12, 4); rr(c, 35, 3, 10, 12, 4); },
  robe: (c) => { c.fillStyle = '#6e5f4a'; c.beginPath(); c.moveTo(18, 3); c.lineTo(30, 3); c.lineTo(38, 30); c.lineTo(10, 30); c.closePath(); c.fill(); c.fillStyle = '#4e4232'; rr(c, 20, 3, 8, 8, 4); },
  hypo: (c) => { c.fillStyle = '#ddd'; rr(c, 10, 13, 24, 7, 2); c.fillStyle = '#c03030'; rr(c, 14, 14, 12, 5, 1); c.fillStyle = '#aaa'; rr(c, 34, 15, 8, 2); rr(c, 6, 12, 5, 9); },
  superhypo: (c) => { c.fillStyle = '#ddd'; rr(c, 10, 12, 24, 9, 2); c.fillStyle = '#e0a020'; rr(c, 14, 13, 12, 7, 1); c.fillStyle = '#aaa'; rr(c, 34, 15, 8, 2); rr(c, 6, 11, 5, 11); },
  paste: (c) => { c.fillStyle = '#8a7a5a'; c.beginPath(); c.ellipse(24, 18, 12, 8, 0, 0, 7); c.fill(); c.fillStyle = '#6a8a4a'; c.beginPath(); c.ellipse(24, 16, 8, 4, 0, 0, 7); c.fill(); },
  bag: (c) => { c.fillStyle = 'rgba(200,210,190,0.9)'; rr(c, 14, 4, 20, 22, 5); c.fillStyle = '#d0a020'; rr(c, 18, 10, 12, 8); c.fillStyle = '#888'; rr(c, 22, 26, 3, 5); },
  pills: (c) => { c.fillStyle = '#e8e0d0'; rr(c, 16, 6, 16, 22, 3); c.fillStyle = '#c04040'; rr(c, 16, 6, 16, 6, 2); c.fillStyle = '#4060a0'; rr(c, 18, 14, 12, 8); },
  vial: (c) => { c.fillStyle = 'rgba(160,200,120,0.9)'; rr(c, 20, 8, 8, 20, 3); c.fillStyle = '#aaa'; rr(c, 19, 4, 10, 5); },
  canteen: (c) => { c.fillStyle = '#5a6a4a'; c.beginPath(); c.ellipse(24, 18, 12, 11, 0, 0, 7); c.fill(); c.fillStyle = '#999'; rr(c, 21, 2, 6, 6); },
  food: (c) => { c.fillStyle = '#8a4a2a'; for (let i = 0; i < 3; i++) { c.save(); c.translate(14 + i * 9, 16); c.rotate(0.3 * (i - 1)); rr(c, -3, -10, 6, 20, 2); c.restore(); } },
  bottle: (c) => { c.fillStyle = 'rgba(120,80,30,0.9)'; rr(c, 18, 12, 12, 18, 3); rr(c, 21, 3, 6, 10, 1); },
  scrip: (c) => { c.fillStyle = '#b8bcc0'; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(16 + i * 5, 22 - i * 3, 8, 4, 0, 0, 7); c.fill(); } c.fillStyle = '#8a8e92'; c.fillRect(30, 12, 4, 2); },
  flare: (c) => { c.fillStyle = '#c03020'; rr(c, 10, 14, 26, 6, 2); c.fillStyle = '#ddd'; rr(c, 36, 14, 4, 6); },
  rope: (c) => { c.strokeStyle = '#b09a70'; c.lineWidth = 3; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(24, 16, 14 - i * 4, 9 - i * 2.5, 0, 0, 7); c.stroke(); } },
  picks: (c) => { c.fillStyle = '#4a3a2a'; rr(c, 8, 10, 32, 12, 3); c.strokeStyle = '#ccc'; c.lineWidth = 1.5; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(12 + i * 7, 12); c.lineTo(14 + i * 7, 4); c.stroke(); } },
  medkit: (c) => { c.fillStyle = '#d8d8d0'; rr(c, 10, 6, 28, 22, 3); c.fillStyle = '#c03030'; rr(c, 21, 9, 6, 16); rr(c, 16, 14, 16, 6); },
  tools: (c) => { c.fillStyle = '#b03020'; rr(c, 8, 10, 32, 16, 2); c.fillStyle = '#ccc'; rr(c, 14, 4, 20, 3); rr(c, 14, 4, 3, 7); rr(c, 31, 4, 3, 7); },
  geiger: (c) => { c.fillStyle = '#c8a040'; rr(c, 10, 8, 22, 18, 3); c.fillStyle = '#222'; rr(c, 13, 11, 12, 8); c.strokeStyle = '#555'; c.lineWidth = 2; c.beginPath(); c.moveTo(32, 14); c.quadraticCurveTo(42, 8, 42, 24); c.stroke(); },
  dynamite: (c) => { c.fillStyle = '#b03020'; for (let i = 0; i < 3; i++) rr(c, 12 + i * 8, 8, 7, 18, 2); c.fillStyle = '#333'; rr(c, 12, 14, 23, 5); c.fillStyle = '#e04030'; rr(c, 22, 15, 3, 3); },
  chip: (c) => { c.fillStyle = '#2a6a3a'; rr(c, 10, 8, 28, 18, 2); c.fillStyle = '#222'; rr(c, 18, 12, 12, 10); c.fillStyle = '#c8a040'; for (let i = 0; i < 5; i++) { c.fillRect(19 + i * 2.5, 9, 1, 3); c.fillRect(19 + i * 2.5, 22, 1, 3); } },
  scrap: (c) => { c.fillStyle = '#6a625a'; c.beginPath(); c.moveTo(8, 24); c.lineTo(20, 8); c.lineTo(34, 12); c.lineTo(40, 26); c.closePath(); c.fill(); c.fillStyle = '#8a4a2a'; rr(c, 22, 16, 10, 6); },
  tail: (c) => { c.strokeStyle = '#c09a90'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(8, 20); c.quadraticCurveTo(24, 4, 40, 20); c.stroke(); },
  gland: (c) => { c.fillStyle = '#9aa040'; c.beginPath(); c.ellipse(24, 16, 11, 8, 0.3, 0, 7); c.fill(); c.fillStyle = '#6a7020'; c.beginPath(); c.arc(28, 14, 3, 0, 7); c.fill(); },
  key: (c) => { c.strokeStyle = '#c8a040'; c.lineWidth = 3; c.beginPath(); c.arc(14, 16, 6, 0, 7); c.moveTo(20, 16); c.lineTo(40, 16); c.moveTo(34, 16); c.lineTo(34, 22); c.moveTo(39, 16); c.lineTo(39, 21); c.stroke(); },
  keycard: (c) => { c.fillStyle = '#d8d0b0'; rr(c, 10, 8, 28, 18, 2); c.fillStyle = '#b03020'; rr(c, 10, 11, 28, 4); c.fillStyle = '#333'; rr(c, 14, 18, 10, 4); },
  holotape: (c) => { c.fillStyle = '#3a3a3a'; rr(c, 10, 8, 28, 18, 3); c.fillStyle = '#c8a040'; rr(c, 14, 11, 20, 5); c.fillStyle = '#777'; c.beginPath(); c.arc(18, 21, 3, 0, 7); c.arc(30, 21, 3, 0, 7); c.fill(); },
  book: (c) => { c.fillStyle = '#6a2a1a'; rr(c, 12, 4, 24, 26, 2); c.fillStyle = '#d8c8a0'; rr(c, 34, 6, 3, 22); c.fillStyle = '#c8a040'; rr(c, 16, 10, 14, 3); },
  core: (c) => { c.fillStyle = '#6a7074'; rr(c, 10, 6, 28, 22, 4); c.fillStyle = '#50c8ff'; rr(c, 16, 10, 16, 8, 2); c.fillStyle = '#e08a2a'; rr(c, 10, 22, 28, 3); },
  part: (c) => { c.fillStyle = '#7a7a70'; c.beginPath(); c.arc(24, 16, 11, 0, 7); c.fill(); c.fillStyle = '#4a4a44'; c.beginPath(); c.arc(24, 16, 5, 0, 7); c.fill(); for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.28; c.fillStyle = '#7a7a70'; c.fillRect(24 + Math.cos(a) * 12 - 2, 16 + Math.sin(a) * 12 - 2, 4, 4); } },
  box: (c) => { c.fillStyle = '#8a7a5a'; rr(c, 12, 8, 24, 18, 2); },
  letter: (c) => { c.fillStyle = '#e0d8c0'; rr(c, 10, 6, 28, 20, 1); c.fillStyle = '#555'; for (let i = 0; i < 4; i++) c.fillRect(14, 10 + i * 4, 20 - (i % 2) * 6, 1); },
  jewel: (c) => { c.fillStyle = '#c8a040'; c.beginPath(); c.arc(24, 18, 9, 0, 7); c.fill(); c.fillStyle = '#50a0e0'; c.beginPath(); c.moveTo(24, 10); c.lineTo(30, 18); c.lineTo(24, 26); c.lineTo(18, 18); c.fill(); },
};

export function drawIcon(c: CanvasRenderingContext2D, id: string, x: number, y: number, w: number, h: number) {
  const f = ICONS[id] ?? ICONS.box;
  c.save();
  const s = Math.min(w / 48, h / 32);
  c.translate(x + (w - 48 * s) / 2, y + (h - 32 * s) / 2);
  c.scale(s, s);
  f(c);
  c.restore();
}

const cache = new Map<string, string>();
/** Data URL for an icon, for use in DOM UI. */
export function iconURL(id: string, w = 96, h = 64): string {
  const k = id + ':' + w + 'x' + h;
  let u = cache.get(k);
  if (!u) {
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    drawIcon(cv.getContext('2d')!, id, 0, 0, w, h);
    u = cv.toDataURL();
    cache.set(k, u);
  }
  return u;
}
