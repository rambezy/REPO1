// RTS camera: pan with WASD/arrows or screen edges, rotate with the middle
// mouse (or Alt+drag, Q/E), zoom with the wheel, and follow a character.
import * as THREE from 'three';
import { input } from '../core/input';
import { clamp, lerp } from '../core/math';
import type { Terrain } from '../world/terrain';
import { WORLD } from '../world/consts';

export class RTSCamera {
  target = new THREE.Vector3(WORLD / 2, 20, WORLD / 2);
  yaw = 0.7;
  pitch = 0.82;
  dist = 55;
  wantDist = 55;
  wantYaw = 0.7;
  wantPitch = 0.82;
  follow: (() => { x: number; y: number; z: number } | null) | null = null;
  edgeScroll = false;
  keyPan = true;
  shake = 0;
  private ty = 20;

  update(dt: number, T: Terrain) {
    const w = input.takeWheel();
    if (w) this.wantDist = clamp(this.wantDist * Math.pow(1.13, w), 3.5, 1400);
    const [rx, ry] = input.takeRot();
    this.wantYaw -= rx * 0.006;
    this.wantPitch = clamp(this.wantPitch + ry * 0.005, 0.12, 1.45);
    if (!input.typing()) {
      if (input.down('KeyQ')) this.wantYaw += dt * 1.6;
      if (input.down('KeyE')) this.wantYaw -= dt * 1.6;
      if (input.down('PageUp')) this.wantPitch = clamp(this.wantPitch + dt, 0.12, 1.45);
      if (input.down('PageDown')) this.wantPitch = clamp(this.wantPitch - dt, 0.12, 1.45);
    }
    this.yaw = lerp(this.yaw, this.wantYaw, 1 - Math.exp(-dt * 14));
    this.pitch = lerp(this.pitch, this.wantPitch, 1 - Math.exp(-dt * 14));
    this.dist = lerp(this.dist, this.wantDist, 1 - Math.exp(-dt * 9));

    // pan
    let px = 0, pz = 0;
    if (this.keyPan && !input.typing()) {
      if (input.down('KeyW') || input.down('ArrowUp')) pz -= 1;
      if (input.down('KeyS') || input.down('ArrowDown')) pz += 1;
      if (input.down('KeyA') || input.down('ArrowLeft')) px -= 1;
      if (input.down('KeyD') || input.down('ArrowRight')) px += 1;
    }
    if (this.edgeScroll && input.mouseInWindow) {
      const m = 6;
      if (input.mx < m) px -= 1; else if (input.mx > window.innerWidth - m) px += 1;
      if (input.my < m) pz -= 1; else if (input.my > window.innerHeight - m) pz += 1;
    }
    // a finger dragging the ground along
    const [tdx, tdy] = input.takePan();
    if (tdx || tdy) {
      this.follow = null;
      const k = (this.dist * 1.6) / window.innerHeight;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      this.target.x -= (tdx * c + tdy * s) * k;
      this.target.z -= (-tdx * s + tdy * c) * k;
    }
    if (px || pz) {
      this.follow = null;
      const sp = (12 + this.dist * 1.25) * (input.shift ? 2.5 : 1) * dt;
      const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
      // forward is away from the camera
      this.target.x += (px * c + pz * s) * sp;
      this.target.z += (-px * s + pz * c) * sp;
    }
    if (this.follow) {
      const p = this.follow();
      if (p) {
        this.target.x = lerp(this.target.x, p.x, 1 - Math.exp(-dt * 8));
        this.target.z = lerp(this.target.z, p.z, 1 - Math.exp(-dt * 8));
      } else this.follow = null;
    }
    this.target.x = clamp(this.target.x, 50, WORLD - 50);
    this.target.z = clamp(this.target.z, 50, WORLD - 50);
    const gy = Math.max(T.heightAt(this.target.x, this.target.z), 0);
    this.ty = lerp(this.ty, gy, 1 - Math.exp(-dt * 6));
    this.target.y = this.ty;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2);
  }

  apply(cam: THREE.PerspectiveCamera, T: Terrain) {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const lookY = this.target.y + 1.2 * Math.min(1, 30 / this.dist);
    let x = this.target.x + Math.sin(this.yaw) * cp * this.dist;
    let z = this.target.z + Math.cos(this.yaw) * cp * this.dist;
    let y = lookY + sp * this.dist;
    const ground = Math.max(T.heightAt(x, z), 0) + 1.6;
    if (y < ground) y = ground;
    if (this.shake > 0) {
      x += (Math.random() - 0.5) * this.shake * 0.4;
      y += (Math.random() - 0.5) * this.shake * 0.4;
    }
    cam.position.set(x, y, z);
    cam.lookAt(this.target.x, lookY, this.target.z);
    const near = clamp(this.dist * 0.01, 0.25, 6);
    if (Math.abs(cam.near - near) > 0.05) { cam.near = near; cam.updateProjectionMatrix(); }
  }

  /** Ground-plane basis for the current view: forward (away from camera) and right. */
  basis() {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    return { fx: -s, fz: -c, rx: c, rz: -s };
  }

  lookAt(x: number, z: number, dist?: number) {
    this.target.x = x; this.target.z = z;
    if (dist) this.wantDist = dist;
  }
}
