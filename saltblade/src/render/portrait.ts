// Head-and-shoulders portraits rendered from the same procedural models.
import * as THREE from 'three';
import { Char } from '../sim/char';
import { makeRig, makeBones, prostMask, B } from './charModel';
import { buildHuman } from './human';
import { charMaterial } from './charMat';
import { buildAnimal } from './animalModel';
import { ANIMAL } from '../content/animals';

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene, cam: THREE.PerspectiveCamera;
const cache = new Map<string, string>();
const bodyMat = charMaterial();
let faceMat: THREE.MeshStandardMaterial | null = null;
const SIZE = 112;

function setup() {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE; canvas.height = SIZE;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff0e0, 0x6a5a48, 1.6));
  const key = new THREE.DirectionalLight(0xfff0d8, 2.2);
  key.position.set(1.2, 2, 2.5);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa0b8d8, 1.0);
  rim.position.set(-2, 1, -1.5);
  scene.add(rim);
  cam = new THREE.PerspectiveCamera(28, 1, 0.05, 20);
}

export function portrait(c: Char): string {
  const key = c.id + ':' + JSON.stringify([c.look, c.vis(), c.body.lost, c.body.prost, c.animal]);
  const got = cache.get(key);
  if (got) return got;
  try {
    if (!renderer) setup();
    const r = renderer!;
    let mesh: THREE.SkinnedMesh;
    if (c.animal) {
      const rig = buildAnimal(ANIMAL[c.animal], c.look);
      mesh = new THREE.SkinnedMesh(rig.geo, bodyMat);
      mesh.add(rig.bones[0]);
      mesh.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton(rig.bones));
      const head = rig.rest[4];
      mesh.rotation.y = -0.9;
      mesh.updateMatrixWorld(true);
      const hp = head.clone().applyMatrix4(mesh.matrixWorld);
      const s = ANIMAL[c.animal].size;
      cam.position.set(hp.x + 1.6 * s, hp.y + 0.3 * s, hp.z + 1.8 * s);
      cam.lookAt(hp.x, hp.y - 0.1 * s, hp.z);
    } else {
      const rig = makeRig(c.look);
      const bones = makeBones(rig);
      const geo = buildHuman(c.look, c.vis(), c.body.lost, rig, prostMask(c.body.prost), 1);
      faceMat?.dispose();
      faceMat = geo.userData.face ? charMaterial(geo.userData.face) : null;
      mesh = new THREE.SkinnedMesh(geo, faceMat ?? bodyMat);
      mesh.add(bones[0]);
      mesh.updateMatrixWorld(true);
      mesh.bind(new THREE.Skeleton(bones));
      bones[B.head].rotation.y = 0.25;
      bones[B.uaL].rotation.z = 0.08; bones[B.uaR].rotation.z = -0.08;
      mesh.updateMatrixWorld(true);
      const hy = rig.joints[B.head].y + 0.08 * rig.s;
      cam.position.set(0.28, hy + 0.05, 0.95);
      cam.lookAt(0, hy - 0.06, 0);
    }
    scene.add(mesh);
    r.setClearColor(0x000000, 0);
    r.render(scene, cam);
    const url = r.domElement.toDataURL('image/png');
    scene.remove(mesh);
    mesh.geometry.dispose();
    cache.set(key, url);
    if (cache.size > 400) cache.delete(cache.keys().next().value!);
    return url;
  } catch {
    return '';
  }
}
