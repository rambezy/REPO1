// Three.js scene, lights, fog and the per-frame render call.
import * as THREE from 'three';

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

  setQuality(q: 'low' | 'medium' | 'high') {
    this.quality = q;
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
    this.gl.render(this.scene, this.camera);
  }
}
