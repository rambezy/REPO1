// Weather: drifting rain fronts, wind and ambient creatures.

import { G } from '../G';
import { S, dayIndex, hourF, darkness } from '../state';
import { hash2, rand, valueNoise } from '../engine/util';
import { emit } from '../engine/fx';

export const weather = {
  rain: 0, // 0..1 current intensity
  target: 0,
  wind: 0.3,
  forced: null as number | null,
  drops: [] as { x: number; y: number; l: number; s: number }[],
  lightning: 0,
};

export function updateWeather(dt: number) {
  // rain fronts: smooth noise over game time, more likely some days
  const t = S.minutes / 240;
  const n = valueNoise(t, dayIndex() * 0.37, 777);
  const wet = hash2(dayIndex(), 3, 99) < 0.35;
  weather.target = weather.forced ?? (wet ? Math.max(0, (n - 0.45) * 2.4) : Math.max(0, (n - 0.72) * 2.5));
  weather.target = Math.min(1, weather.target);
  weather.rain += (weather.target - weather.rain) * Math.min(1, dt * 0.3);
  weather.wind = 0.25 + valueNoise(t * 2, 1, 5) * 0.6;
  if (weather.lightning > 0) weather.lightning -= dt;
  if (weather.rain > 0.8 && Math.random() < dt * 0.02) weather.lightning = 0.25;

  // screen-space rain drops
  const want = G.map && G.map.outdoor ? Math.floor(weather.rain * 220) : 0;
  while (weather.drops.length < want) weather.drops.push({ x: rand.range(0, G.viewW), y: rand.range(-G.viewH, G.viewH), l: rand.range(4, 8), s: rand.range(260, 340) });
  if (weather.drops.length > want) weather.drops.length = want;
  for (const d of weather.drops) {
    d.y += d.s * dt;
    d.x += d.s * dt * weather.wind * 0.35;
    if (d.y > G.viewH) { d.y = rand.range(-30, 0); d.x = rand.range(-40, G.viewW); }
  }

  // ambient life: fireflies on summer nights, leaves by day
  if (G.map && G.map.outdoor && G.mode === 'play') {
    const cam = G.cam;
    if (darkness() > 0.6 && weather.rain < 0.2 && Math.random() < dt * 1.5) emit('firefly', cam.x + rand.range(0, G.viewW), cam.y + rand.range(0, G.viewH));
    const h = hourF();
    if (h > 7 && h < 19 && Math.random() < dt * 0.4 * weather.wind) emit('leaf', cam.x + rand.range(0, G.viewW), cam.y + rand.range(0, G.viewH * 0.6));
  }
}

export function drawRain(ctx: CanvasRenderingContext2D) {
  if (!G.map.outdoor) return;
  if (weather.drops.length) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(190,208,230,0.42)';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    for (const d of weather.drops) {
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - d.l * weather.wind * 0.35, d.y - d.l * 1.4);
    }
    ctx.stroke();
    // little splash rings where drops land
    ctx.strokeStyle = 'rgba(200,215,235,0.35)';
    ctx.lineWidth = 0.3;
    const t = performance.now() / 1000;
    for (let i = 0; i < weather.drops.length; i += 3) {
      const d = weather.drops[i];
      const u = t * 2.2 + i * 0.137;
      const ph = u % 1, cyc = Math.floor(u);
      const x = hash2(i, cyc, 5) * G.viewW, y = hash2(i, cyc, 9) * G.viewH;
      void d;
      ctx.globalAlpha = (1 - ph) * 0.8;
      ctx.beginPath();
      ctx.ellipse(x, y, 0.6 + ph * 2.2, 0.3 + ph * 0.9, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  if (weather.lightning > 0) {
    ctx.fillStyle = `rgba(230,235,255,${weather.lightning * 1.6})`;
    ctx.fillRect(0, 0, G.viewW, G.viewH);
  }
}
