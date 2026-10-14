// Three.js scene, lights, fog and the per-frame render call: the scene goes
// through a post chain (glow on the bright things, a film grade, then tone
// mapping). Low quality keeps the grade, which carries the hurt and drug
// feedback, but drops the glow and the multisampling.
//
// Quality is 'auto' by default: the renderer times its own frames and feeds
// them to the ladder in quality.ts, which walks down its rungs (fewer samples,
// a smaller shadow map, fewer pixels, and at the bottom no shadows at all)
// while frames run long, and back up, slowly, once they have been short for
// a while. Low keeps the ground dressed (see groundCover and terrainMesh): a
// cheap machine should see a bare frame rate, not a bare world.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { QualityLadder, RUNGS, Quality, QualityLevel } from './quality';
import { reducedMotion } from './impact';

export type { Quality, QualityLevel };

/**
 * The film grade, in linear light before tone mapping: a vignette, a touch of
 * warmth in the lights and teal in the shadows, and two effects the game
 * drives: `uHigh` (whoever you're watching is high: colours swim and split)
 * and `uHurt` (they're badly hurt: the edges pulse red).
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uHigh: { value: 0 },
    uHurt: { value: 0 },
    uVignette: { value: 0.32 },
    uAspect: { value: 1 },
    uPulse: { value: 1 }, // 1: the hurt edge pulses; 0: it holds steady (reduced motion)
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uHigh, uHurt, uVignette, uAspect, uPulse;
    varying vec2 vUv;
    vec3 hue(vec3 c, float a) {
      const vec3 k = vec3(0.57735);
      float ca = cos(a);
      return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
    }
    void main() {
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      d.x *= uAspect;
      float r = length(d);
      // high: the picture breathes and the colours split at the edges
      if (uHigh > 0.0) {
        uv += uHigh * 0.006 * vec2(sin(uv.y * 11.0 + uTime * 1.3), cos(uv.x * 9.0 + uTime * 1.1));
      }
      // (only then: a split even a fraction of a pixel wide turns every dark speck on the horizon pink)
      vec3 col = texture2D(tDiffuse, uv).rgb;
      if (uHigh > 0.0) {
        vec2 ca = (uv - 0.5) * uHigh * 0.012 * r;
        col = vec3(texture2D(tDiffuse, uv + ca).r, col.g, texture2D(tDiffuse, uv - ca).b);
        col = mix(col, hue(col, sin(uTime * 0.7) * 0.9) * 1.08, uHigh * 0.55);
      }
      // grade: warm lights, cool shadows, a little more bite
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= mix(vec3(0.94, 0.99, 1.04), vec3(1.04, 1.0, 0.95), smoothstep(0.05, 0.9, l));
      col = mix(vec3(l), col, 1.06);
      // vignette, and a red pulse at the edges when badly hurt
      float v = smoothstep(0.35, 1.05, r);
      col *= 1.0 - uVignette * v;
      col = mix(col, col * vec3(1.35, 0.35, 0.3) + vec3(0.05, 0.0, 0.0), uHurt * v * mix(0.8, 0.65 + 0.35 * sin(uTime * 5.0), uPulse));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

const SAMPLES: Record<QualityLevel, number> = { high: 4, medium: 2, low: 0 };
const SHADOW_PX: Record<QualityLevel, number> = { high: 2048, medium: 1536, low: 1024 };
const DPR_CAP: Record<QualityLevel, number> = { high: 2, medium: 1.5, low: 1 };
const RUNG_KEY = 'sb-autoquality';

export class Renderer {
  gl: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fog: THREE.FogExp2;
  /** world-space point the shadow box is centred on */
  shadowFocus = new THREE.Vector3();
  shadowSize = 90;
  shadowsOn = true;
  width = 1;
  height = 1;
  /** device pixels per CSS pixel actually rendered (the DPR cap times the render scale) */
  pixelRatio = 1;
  /** what was asked for */
  quality: Quality = 'auto';
  /** what is in use */
  level: QualityLevel = 'high';
  /** render scale, a fraction of the capped pixel ratio (auto only) */
  scale = 1;
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  grade: ShaderPass | null = null;
  private renderPass: RenderPass | null = null;
  private outputPass: OutputPass | null = null;
  /** effects the game sets each frame (0..1) */
  high = 0;
  hurt = 0;
  /** wall time of the last render() call, in ms */
  drawMs = 0;
  /** live frames feed the auto ladder; tests switch this off and feed frames of their own */
  autoLive = true;
  private t0 = performance.now();
  private floatOK: boolean;
  private ladder: QualityLadder | null = null;
  private lastT = 0;
  /** True while frame times say nothing about the machine (travel speed's 15× sim): the auto ladder is not fed. */
  ladderHold: (() => boolean) | null = null;

  constructor(public canvas: HTMLCanvasElement) {
    // no antialiasing on the canvas itself: every pass goes through the composer, whose own target multisamples
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
    // the draw-call and triangle counts add up across the frame's passes; render() clears them
    this.gl.info.autoReset = false;
    this.floatOK = this.gl.extensions.has('EXT_color_buffer_float') || this.gl.extensions.has('EXT_color_buffer_half_float');
    this.camera = new THREE.PerspectiveCamera(50, 1, 0.4, 16000);
    this.fog = new THREE.FogExp2(0xd8c9a8, 0.00032);
    this.scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(0xdfe6f0, 0x8a7a60, 1.1);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    const sc = this.sun.shadow.camera;
    sc.near = 1; sc.far = 900;
    this.scene.add(this.sun, this.sun.target);
    this.setQuality('auto');
    window.addEventListener('resize', () => this.resize());
    // frames do not run while the tab is away; the gap must not count as a slow one
    document.addEventListener('visibilitychange', () => { this.lastT = 0; });
  }

  /** Builds the post chain for the level in use, or keeps it when it already fits. */
  private buildPost() {
    const samples = SAMPLES[this.level];
    const wantBloom = this.level !== 'low';
    if (this.composer && this.composer.renderTarget1.samples === samples && !!this.bloom === wantBloom) return;
    this.composer?.dispose();
    this.renderPass?.dispose();
    this.bloom?.dispose();
    this.grade?.dispose();
    this.outputPass?.dispose();
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: this.floatOK ? THREE.HalfFloatType : THREE.UnsignedByteType, samples });
    const c = new EffectComposer(this.gl, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    c.addPass(this.renderPass);
    this.bloom = null;
    if (wantBloom) {
      // only what is brighter than sunlit sand glows: lamps, fires, eyes, lasers, the sun
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 2.6);
      c.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    this.outputPass = new OutputPass();
    c.addPass(this.outputPass);
    this.composer = c;
  }

  setQuality(q: Quality) {
    // a value from nowhere (an edited settings file) is Auto, not a black canvas
    if (q !== 'auto' && !(q in SAMPLES)) q = 'auto';
    this.quality = q;
    if (q === 'auto') {
      // start where the last session settled, but never below the middle rung, then probe again
      let start = 0;
      try { start = Math.min(3, +(localStorage.getItem(RUNG_KEY) ?? 0) || 0); } catch { /* no storage */ }
      this.ladder = new QualityLadder(start);
      const r = RUNGS[this.ladder.rung];
      this.applyLevel(r.level, r.scale);
    } else {
      this.ladder = null;
      this.applyLevel(q, 1);
    }
  }

  /** One frame's time, in ms, for the auto ladder (a no-op unless quality is Auto). */
  feed(dt: number) {
    const ch = this.ladder?.feed(dt);
    if (!ch) return;
    // only a rung that proved itself is worth starting from next time
    if (ch.remember) try { localStorage.setItem(RUNG_KEY, String(ch.rung)); } catch { /* no storage */ }
    if (!ch.moved) return;
    const r = RUNGS[ch.rung];
    this.applyLevel(r.level, r.scale);
    console.info(`[render] auto quality: ${this.describe()} (frames averaged ${ch.avg.toFixed(0)} ms)`);
  }

  /** A short account for the F3 line and bug reports: 'high', or 'auto → medium ×0.85'. */
  describe() {
    return this.quality === 'auto' ? `auto → ${this.level}${this.scale < 1 ? ' ×' + this.scale : ''}` : this.quality;
  }

  private applyLevel(level: QualityLevel, scale: number) {
    if (level === this.level && scale === this.scale && this.composer) return;
    this.level = level;
    this.scale = scale;
    this.resize();
    const size = SHADOW_PX[level];
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w; this.height = h;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, DPR_CAP[this.level] ?? 1) * this.scale;
    this.gl.setPixelRatio(this.pixelRatio);
    this.gl.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.buildPost();
    this.composer!.setPixelRatio(this.pixelRatio);
    this.composer!.setSize(w, h);
    // the glow works at half size: softer and cheaper
    this.bloom?.setSize(Math.ceil((w * this.pixelRatio) / 2), Math.ceil((h * this.pixelRatio) / 2));
    this.grade!.uniforms.uAspect.value = w / h;
  }

  /** Points the sun and fits its shadow box around the focus. */
  placeSun(dir: THREE.Vector3) {
    const f = this.shadowFocus;
    const s = this.shadowSize;
    const sc = this.sun.shadow.camera;
    sc.left = -s; sc.right = s; sc.top = s; sc.bottom = -s;
    sc.updateProjectionMatrix();
    // snap to shadow texels to stop shimmering
    const texel = (2 * s) / this.sun.shadow.mapSize.x;
    const fx = Math.round(f.x / texel) * texel, fz = Math.round(f.z / texel) * texel;
    this.sun.position.set(fx + dir.x * 400, f.y + dir.y * 400, fz + dir.z * 400);
    this.sun.target.position.set(fx, f.y, fz);
    this.sun.target.updateMatrixWorld();
  }

  render() {
    const now = performance.now();
    // a gap of more than five seconds is a pause (a breakpoint, the tab put away), not a slow frame
    if (this.autoLive && this.lastT && now - this.lastT < 5000 && !this.ladderHold?.()) this.feed(now - this.lastT);
    this.lastT = now;
    // low quality spends its budget on the ground cover instead of a shadow pass
    this.sun.castShadow = this.shadowsOn && this.level !== 'low';
    this.gl.info.reset();
    const u = this.grade!.uniforms;
    u.uTime.value = (now - this.t0) / 1000;
    u.uHigh.value = this.high;
    u.uHurt.value = this.hurt;
    // the only hurt feedback at every quality: a steady edge, not a pulsing one, for anyone who asked for less motion
    u.uPulse.value = reducedMotion() ? 0 : 1;
    this.composer!.render();
    this.drawMs = performance.now() - now;
  }
}
