// Boot, world creation and the main loop.
import * as THREE from 'three';
import { G } from './state';
import { generateWorld, RegionField } from './world/gen';
import { Renderer } from './render/renderer';
import { RTSCamera } from './render/camera';
import { TerrainRenderer } from './render/terrainMesh';
import { makeWaterMaterial } from './render/water';
import { Sky } from './render/sky';
import { Daylight } from './render/daylight';
import { Clock } from './sim/clock';
import { input } from './core/input';
import { SETTLEMENT } from './content/layout';
import { WORLD } from './world/consts';
import { PropRenderer, windUniform } from './render/props';
import { buildRoads } from './render/roads';
import { Nav } from './world/nav';
import { World } from './sim/world';
import { S } from './sim/ctx';
import { simStep } from './sim/sim';
import { CharViews } from './render/charView';
import { Overlay } from './render/overlay';
import { attachControl, sel, hoverId } from './game/control';
import { RNG } from './core/rng';
import { setupFx } from './game/fx';
import { setupUI } from './ui/index';
import { StructViews } from './render/structView';
import { tickPopulation } from './game/world';
import { tickSquads } from './sim/squads';
import { tickEncounters } from './sim/encounters';
import { tickWorld, hireMercs } from './sim/worldsim';
import { tickBase } from './sim/base';
import { on } from './core/events';
import { tickRunaways, tickStealth } from './sim/crime';
import { tickRaids } from './sim/raids';
import { tickWorldEvents } from './sim/worldevents';
import { tickAutosave, startNewGame } from './game/session';
import { showTitle, tickTitle } from './ui/title';
import { tickHints } from './ui/hints';
import { tickGameOver } from './ui/gameover';
import { loadSettings, applySettings } from './game/settings';
import { setupAudio, tickAudio } from './game/audiohook';
import { Weather, WEATHER_NAME } from './sim/weather';
import { WeatherFx } from './render/weatherFx';

function loadingScreen() {
  const el = document.createElement('div');
  el.id = 'loading';
  el.innerHTML = '<div class="lt">SALTBLADE</div><div class="ls">Generating the world</div><div class="lb"><i></i></div>';
  el.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#14110d;color:#e9e1cf;font:16px var(--font);z-index:50;gap:14px';
  (el.querySelector('.lt') as HTMLElement).style.cssText = 'font:700 44px var(--title);letter-spacing:.2em;color:#d9a441';
  (el.querySelector('.lb') as HTMLElement).style.cssText = 'width:320px;height:6px;background:#2e2820;border-radius:3px;overflow:hidden';
  (el.querySelector('.lb i') as HTMLElement).style.cssText = 'display:block;height:100%;width:0;background:#d9a441';
  document.getElementById('ui')!.appendChild(el);
  return {
    set(stage: string, f: number) {
      (el.querySelector('.ls') as HTMLElement).textContent = stage;
      (el.querySelector('.lb i') as HTMLElement).style.width = Math.round(f * 100) + '%';
    },
    done() { el.remove(); },
  };
}

export async function boot() {
  const canvas = document.getElementById('view') as HTMLCanvasElement;
  input.attach(canvas);
  G.mode = 'loading';
  G.seed = 1337;
  const ls = loadingScreen();
  const stages = ['Raising the land', 'Carving the Wending', 'Founding the towns', 'Laying the roads', 'Scattering ruins', 'Burying ore', 'Done'];
  G.T = await generateWorld(G.seed, (s, f) => {
    const k = Math.max(0, stages.indexOf(s));
    ls.set(s, (k + f) / stages.length);
  });
  G.field = new RegionField(G.seed);
  G.R = new Renderer(canvas);
  G.cam = new RTSCamera();
  G.waterMat = makeWaterMaterial();
  G.terrainR = new TerrainRenderer(G.T, G.field, G.waterMat);
  G.R.scene.add(G.terrainR.group);
  G.props = new PropRenderer(G.T);
  G.R.scene.add(G.props.group);
  G.R.scene.add(buildRoads(G.T));
  G.sky = new Sky();
  G.R.scene.add(G.sky.mesh);
  G.daylight = new Daylight();
  G.clock = new Clock();
  G.weather = { cloud: 0.3, fogMul: 1, tint: new THREE.Color(0xc8a070), tintAmt: 0, dim: 1 };
  G.speed = 1;
  G.lastSpeed = 1;
  G.realTime = 0;
  G.simTime = 0;
  G.nav = new Nav(G.T);
  G.W = new World();
  S.W = G.W; S.T = G.T; S.nav = G.nav; S.clock = G.clock; S.rng = new RNG((Date.now() & 0xffff) + 1);
  S.weather = new Weather();
  G.weatherFx = new WeatherFx();
  G.R.scene.add(G.weatherFx.group);
  G.charViews = new CharViews();
  G.R.scene.add(G.charViews.group, G.charViews.rings);
  G.overlay = new Overlay(document.getElementById('app')!);
  G.structViews = new StructViews(G.W);
  G.R.scene.add(G.structViews.group);
  setupFx();
  attachControl();
  setupUI();
  setupAudio();
  on('hire:mercs', (pid: number, n: number, days: number) => hireMercs(pid, n, days));
  loadSettings();
  applySettings();
  const cr = SETTLEMENT.crossroad;
  G.cam.lookAt(cr.u * WORLD, cr.v * WORLD, 120);
  // #fight, #play or #start=<scenario> skip the title (for testing)
  const hash = location.hash;
  const quick = hash.includes('fight') ? 'fight' : hash.match(/start=(\w+)/)?.[1] ?? (hash.includes('play') ? 'wanderer' : '');
  if (quick) startNewGame({ scenario: quick, faction: '', people: [] });
  else showTitle();
  ls.done();
  if (import.meta.env.DEV || location.hash.includes('debug')) (await import('./debug')).attachDebug();
  let last = performance.now();
  const frame = (now: number) => {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    step(dt);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

const perf = { sim: 0, views: 0, render: 0, frame: 0, fps: 60, pop: 0, chars: 0, structs: 0, terrain: 0, props: 0, misc: 0 };
const ema = (a: number, b: number) => a + (b - a) * 0.05;

function step(dt: number) {
  const t0 = performance.now();
  G.perf = perf;
  G.realTime += dt;
  const simDt = dt * G.speed;
  G.simTime += simDt;
  // the sim runs in small steps so fast-forward stays stable
  let left = simDt;
  const focus = { x: G.cam.target.x, z: G.cam.target.z };
  while (left > 1e-6) {
    const h = Math.min(left, 0.05);
    simStep(h, focus);
    tickSquads(h);
    tickEncounters(h);
    tickWorld(h);
    tickBase(h);
    tickRunaways(h);
    tickStealth(h);
    if (G.mode === 'play') tickRaids(h);
    tickWorldEvents(h);
    S.weather.tick(h);
    left -= h;
  }
  const t1 = performance.now();
  perf.sim = ema(perf.sim, t1 - t0);
  let tp = performance.now();
  const lap = (k: 'pop' | 'chars' | 'structs' | 'terrain' | 'props' | 'misc') => { const n = performance.now(); perf[k] = ema(perf[k], n - tp); tp = n; };
  tickPopulation(dt);
  lap('pop');
  tickAutosave(dt);
  if (G.mode === 'title') tickTitle(dt);
  tickAudio(dt);
  tickHints(dt);
  tickGameOver(dt);
  G.cam.update(dt, G.T);
  G.cam.apply(G.R.camera, G.T);
  const t = G.cam.target;
  const reg = G.T.regionAt(t.x, t.z);
  G.daylight.setRegion(reg.haze, reg.fog);
  const sky = S.weather.at(t.x, t.z);
  G.weatherFx.update(dt, sky, G.R.camera.position, G.cam.target, G.cam.dist, G.weather, 0.6 + Math.sin(G.simTime * 0.002) * 1.2);
  G.weatherState = { kind: G.weatherFx.kind, intensity: G.weatherFx.i };
  G.weatherName = G.weatherFx.kind !== 'clear' && G.weatherFx.i > 0.25 ? WEATHER_NAME[G.weatherFx.kind as keyof typeof WEATHER_NAME] : '';
  G.daylight.update(dt, G.clock.hour, G.clock.day, G.R, G.sky, G.weather, G.waterMat.uniforms);
  if (G.weatherFx.flash > 0) { G.R.hemi.intensity += G.weatherFx.flash * 2.2; G.R.gl.toneMappingExposure += G.weatherFx.flash * 0.5; }
  G.sky.mesh.position.copy(G.R.camera.position);
  G.sky.u.uTime.value = G.realTime;
  G.waterMat.uniforms.uTime.value = G.realTime;
  G.R.shadowFocus.copy(t);
  G.R.shadowSize = Math.min(160, Math.max(40, G.cam.dist * 1.2));
  G.R.shadowsOn = (G.settings?.shadows ?? true) && G.cam.dist < 400;
  lap('misc');
  G.charViews.update(dt * (G.speed ? 1 : 0.0001), G.W, G.R.camera.position, G.cam.target, sel, hoverId);
  lap('chars');
  G.structViews.update(dt, G.R.camera.position, G.cam.target, [...sel].map((id) => G.W.char(id)).filter(Boolean) as any, G.daylight.night);
  lap('structs');
  G.terrainR.update(G.R.camera.position);
  lap('terrain');
  G.props.update(G.R.camera.position);
  lap('props');
  windUniform.value = G.realTime;
  const t2 = performance.now();
  perf.views = ema(perf.views, t2 - t1);
  G.R.render();
  const t3 = performance.now();
  perf.render = ema(perf.render, t3 - t2);
  G.overlay.draw(G.W, G.R.camera, sel, hoverId, dt);
  perf.frame = ema(perf.frame, performance.now() - t0);
  if (dt > 0) perf.fps = ema(perf.fps, 1 / dt);
}
