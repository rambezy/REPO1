// Three.js scene, lights, fog and the per-frame render call: the scene goes
// through a post chain (glow on the bright things, a film grade, then tone
// mapping) unless quality is low.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uHigh, uHurt, uVignette, uAspect;
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
      vec2 ca = (uv - 0.5) * (0.0015 + uHigh * 0.012) * r;
      vec3 col = vec3(texture2D(tDiffuse, uv + ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - ca).b);
      if (uHigh > 0.0) col = mix(col, hue(col, sin(uTime * 0.7) * 0.9) * 1.08, uHigh * 0.55);
      // grade: warm lights, cool shadows, a little more bite
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col *= mix(vec3(0.94, 0.99, 1.04), vec3(1.04, 1.0, 0.95), smoothstep(0.05, 0.9, l));
      col = mix(vec3(l), col, 1.06);
      // vignette, and a red pulse at the edges when badly hurt
      float v = smoothstep(0.35, 1.05, r);
      col *= 1.0 - uVignette * v;
      col = mix(col, col * vec3(1.35, 0.35, 0.3) + vec3(0.05, 0.0, 0.0), uHurt * v * (0.65 + 0.35 * sin(uTime * 5.0)));
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

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
  pixelRatio = 1;
  quality: 'low' | 'medium' | 'high' = 'high';
  /** the post chain (null on low quality: straight to the screen) */
  composer: EffectComposer | null = null;
  bloom: UnrealBloomPass | null = null;
  grade: ShaderPass | null = null;
  /** effects the game sets each frame (0..1) */
  high = 0;
  hurt = 0;
  private t0 = performance.now();

  constructor(public canvas: HTMLCanvasElement) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.05;
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFShadowMap;
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
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  /** Builds (or drops, on low quality) the post chain. */
  private buildPost() {
    const want = this.quality !== 'low';
    if (!want) { this.composer?.dispose(); this.composer = null; this.bloom = null; this.grade = null; return; }
    const samples = this.quality === 'high' ? 4 : 2;
    if (this.composer && this.composer.renderTarget1.samples === samples) return;
    this.composer?.dispose();
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples });
    const c = new EffectComposer(this.gl, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    // only what is brighter than sunlit sand glows: lamps, fires, eyes, lasers, the sun
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.55, 2.6);
    c.addPass(this.bloom);
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    c.addPass(new OutputPass());
    this.composer = c;
  }

  setQuality(q: 'low' | 'medium' | 'high') {
    this.quality = q;
    this.buildPost();
    this.resize();
    const size = q === 'high' ? 2048 : q === 'medium' ? 1536 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.width = w; this.height = h;
    const cap = this.quality === 'high' ? 2 : this.quality === 'medium' ? 1.5 : 1;
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, cap);
    this.gl.setPixelRatio(this.pixelRatio);
    this.gl.setSize(w, h, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!this.composer && this.quality !== 'low') this.buildPost();
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(w, h);
      // the glow works at half size: softer and cheaper
      this.bloom?.setSize(Math.ceil((w * this.pixelRatio) / 2), Math.ceil((h * this.pixelRatio) / 2));
      if (this.grade) this.grade.uniforms.uAspect.value = w / h;
    }
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
    this.sun.castShadow = this.shadowsOn;
    if (!this.composer) { this.gl.render(this.scene, this.camera); return; }
    const u = this.grade!.uniforms;
    u.uTime.value = (performance.now() - this.t0) / 1000;
    u.uHigh.value = this.high;
    u.uHurt.value = this.hurt;
    this.composer.render();
  }
}
