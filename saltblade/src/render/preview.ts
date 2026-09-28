// A turntable view of one character, for the character creator.
import * as THREE from 'three';
import { Char } from '../sim/char';
import { CharView } from './charView';
import { World } from '../sim/world';

export class Preview {
  gl: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  cam: THREE.PerspectiveCamera;
  view: CharView | null = null;
  yaw = 0.5;
  spin = 0.35;
  private raf = 0;
  private last = 0;
  private W = new World();
  private drag = false;
  private dragX = 0;

  constructor(public canvas: HTMLCanvasElement, w: number, h: number) {
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.gl.setSize(w, h, false);
    this.gl.outputColorSpace = THREE.SRGBColorSpace;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.shadowMap.enabled = true;
    this.cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 50);
    this.scene.add(new THREE.HemisphereLight(0xfff0e0, 0x5a4a38, 1.5));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
    key.position.set(2, 4, 3);
    key.castShadow = true;
    key.shadow.mapSize.set(512, 512);
    const sc = key.shadow.camera; sc.left = -2; sc.right = 2; sc.top = 3; sc.bottom = -1; sc.near = 0.5; sc.far = 12;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xa0b8e0, 1.2);
    rim.position.set(-3, 2, -2);
    this.scene.add(rim);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3a3228 }));
    floor.receiveShadow = true;
    this.scene.add(floor);
    canvas.addEventListener('mousedown', (e) => { this.drag = true; this.dragX = e.clientX; this.spin = 0; });
    window.addEventListener('mouseup', this.up);
    window.addEventListener('mousemove', this.move);
    this.last = performance.now();
    const loop = (t: number) => {
      const dt = Math.max(0, Math.min(0.1, (t - this.last) / 1000));
      this.last = t;
      this.frame(dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private up = () => { this.drag = false; };
  private move = (e: MouseEvent) => {
    if (!this.drag) return;
    this.yaw += (e.clientX - this.dragX) * 0.012;
    this.dragX = e.clientX;
  };

  show(c: Char) {
    if (this.view) { this.view.dispose(); this.view = null; }
    c.x = 0; c.z = 0; c.y = 0; c.dir = 0; c.speed = 0; c.mem.moved = 0;
    this.view = new CharView(c);
    this.view.mesh.castShadow = true;
    this.scene.add(this.view.root);
    const hgt = c.animal ? 1.2 : c.look.height;
    this.cam.position.set(0, hgt * 0.62, hgt * 2.35 + 0.8);
    this.cam.lookAt(0, hgt * 0.5, 0);
  }

  frame(dt: number) {
    if (!this.view) return;
    this.yaw += this.spin * dt;
    this.view.c.dir = this.yaw;
    this.view.update(dt, this.W);
    this.gl.render(this.scene, this.cam);
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('mouseup', this.up);
    window.removeEventListener('mousemove', this.move);
    if (this.view) this.view.dispose();
    this.gl.dispose();
    this.gl.forceContextLoss();
  }
}
