// Road ribbons laid over the terrain with soft edges.
import * as THREE from 'three';
import { Terrain } from '../world/terrain';
import { REGIONS } from '../world/regions';

export function buildRoads(T: Terrain): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const tmp = new THREE.Color();
  const dirt = new THREE.Color(0x7a6448);
  for (const road of T.roads) {
    const pts = road.pts;
    const n = pts.length / 2;
    // split long roads into pieces for culling
    const PIECE = 120;
    for (let s0 = 0; s0 < n - 1; s0 += PIECE) {
      const s1 = Math.min(n - 1, s0 + PIECE);
      const pos: number[] = [], col: number[] = [], idx: number[] = [];
      const offs = [-2.6, -1.4, 1.4, 2.6];
      const alph = [0, 0.85, 0.85, 0];
      for (let p = s0; p <= s1; p++) {
        const x = pts[p * 2], z = pts[p * 2 + 1];
        const pp = Math.max(0, p - 1), np = Math.min(n - 1, p + 1);
        let tx = pts[np * 2] - pts[pp * 2], tz = pts[np * 2 + 1] - pts[pp * 2 + 1];
        const tl = Math.hypot(tx, tz) || 1;
        tx /= tl; tz /= tl;
        const nx = -tz, nz = tx;
        const reg = REGIONS[T.regionIdAt(x, z)];
        tmp.setHex(reg.ground[1]).multiplyScalar(0.78).lerp(dirt, 0.35);
        for (let k = 0; k < 4; k++) {
          const vx = x + nx * offs[k], vz = z + nz * offs[k];
          pos.push(vx, T.heightAt(vx, vz) + 0.1, vz);
          const wear = 0.92 + 0.08 * Math.sin(p * 0.7 + k);
          col.push(tmp.r * wear, tmp.g * wear, tmp.b * wear, alph[k] * (T.heightAt(vx, vz) < -0.3 ? 0 : 1));
        }
        if (p > s0) {
          const b = (p - s0) * 4, a = b - 4;
          for (let k = 0; k < 3; k++) idx.push(a + k, a + k + 1, b + k, a + k + 1, b + k + 1, b + k);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
      geo.setIndex(idx);
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true;
      m.renderOrder = 1;
      group.add(m);
    }
  }
  return group;
}
