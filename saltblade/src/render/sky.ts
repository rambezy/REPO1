// Sky dome: gradient, sun, the Shattered Moon and its debris ring, stars and
// drifting clouds. Colours are driven each frame by the daylight model.
import * as THREE from 'three';

export class Sky {
  mesh: THREE.Mesh;
  u: Record<string, THREE.IUniform>;
  constructor() {
    this.u = {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uMoonDir: { value: new THREE.Vector3(0, 1, 0) },
      uZenith: { value: new THREE.Color(0.35, 0.5, 0.7) },
      uHorizon: { value: new THREE.Color(0.8, 0.78, 0.7) },
      uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
      uTime: { value: 0 },
      uStars: { value: 0 },
      uCloud: { value: 0.35 },
      uCloudCol: { value: new THREE.Color(1, 1, 1) },
      uNight: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.u,
      side: THREE.BackSide,
      depthWrite: false,
      depthTest: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSunDir, uMoonDir, uZenith, uHorizon, uSunCol, uCloudCol;
        uniform float uTime, uStars, uCloud, uNight;
        varying vec3 vDir;
        float h2(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
        float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n2(p); p *= 2.03; a *= 0.5; } return s; }
        void main() {
          vec3 d = normalize(vDir);
          float up = clamp(d.y, 0.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(up, 0.55));
          // below the horizon: haze
          if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.7, clamp(-d.y * 4.0, 0.0, 1.0));
          float sd = dot(d, uSunDir);
          // sun glow and disc
          col += uSunCol * (pow(max(sd, 0.0), 6.0) * 0.28 + pow(max(sd, 0.0), 60.0) * 0.5) * (1.0 - uNight * 0.8);
          col += uSunCol * smoothstep(0.99955, 0.9998, sd) * 6.0 * step(-0.05, uSunDir.y);
          // stars
          if (uStars > 0.01 && d.y > 0.0) {
            vec2 sp = d.xz / (d.y + 0.35) * 220.0;
            vec2 cell = floor(sp);
            float r = h2(cell);
            vec2 off = vec2(h2(cell + 7.1), h2(cell + 3.3)) - 0.5;
            float star = smoothstep(0.08, 0.0, length(fract(sp) - 0.5 - off * 0.6)) * step(0.93, r);
            float tw = 0.7 + 0.3 * sin(uTime * 3.0 + r * 60.0);
            col += vec3(0.9, 0.92, 1.0) * star * tw * uStars * smoothstep(0.0, 0.25, d.y);
          }
          // the debris ring: a faint glittering band across the sky
          vec3 ringN = normalize(vec3(0.25, 0.35, 0.9));
          float rb = abs(dot(d, ringN));
          float band = smoothstep(0.06, 0.0, rb) * smoothstep(-0.05, 0.25, d.y);
          float glit = n2(d.xy * 90.0 + d.z * 40.0) * n2(d.yz * 200.0);
          col += vec3(0.85, 0.82, 0.78) * band * (0.08 + 0.35 * glit) * (0.35 + 0.65 * uNight);
          // the Shattered Moon
          float md = dot(d, uMoonDir);
          float mr = 0.9975;
          if (md > mr - 0.002) {
            vec3 mu = normalize(cross(uMoonDir, vec3(0.0, 1.0, 0.0)));
            vec3 mv = cross(mu, uMoonDir);
            vec2 q = vec2(dot(d, mu), dot(d, mv)) / sqrt(1.0 - mr * mr);
            float rr = length(q);
            float disc = smoothstep(1.0, 0.96, rr);
            // a bite taken out of it
            float bite = smoothstep(0.55, 0.5, length(q - vec2(0.62, 0.35)));
            disc *= 1.0 - bite;
            float crack = smoothstep(0.03, 0.0, abs(n2(q * 3.0) - 0.5)) * 0.6;
            float mare = n2(q * 2.2) * 0.5 + n2(q * 6.0) * 0.3;
            vec3 lit = normalize(vec3(q, sqrt(max(0.0, 1.0 - rr * rr))));
            vec3 sunL = normalize(vec3(dot(uSunDir, mu), dot(uSunDir, mv), dot(uSunDir, uMoonDir)));
            float lambert = clamp(dot(lit, sunL) * 0.8 + 0.25, 0.08, 1.0);
            vec3 mc = vec3(0.86, 0.84, 0.8) * (0.7 + 0.3 * mare) * (1.0 - crack) * lambert;
            col = mix(col, mc * (0.6 + 0.8 * uNight), disc * clamp(0.35 + uNight, 0.0, 1.0));
          }
          // fragments near the moon
          for (int k = 0; k < 5; k++) {
            float fk = float(k);
            vec3 fd = normalize(uMoonDir + vec3(sin(fk * 2.4) * 0.09, cos(fk * 1.7) * 0.05, sin(fk * 3.1) * 0.08));
            float f = smoothstep(0.99995 - fk * 0.00001, 1.0, dot(d, fd));
            col += vec3(0.8) * f * (0.5 + uNight);
          }
          // clouds
          if (d.y > 0.0 && uCloud > 0.01) {
            vec2 cp = d.xz / (d.y + 0.08) * 1.6 + vec2(uTime * 0.004, uTime * 0.0015);
            float c = fbm(cp);
            float cov = smoothstep(1.0 - uCloud, 1.0 - uCloud + 0.35, c);
            float sh = fbm(cp + uSunDir.xz * 0.05);
            vec3 cc = uCloudCol * (0.75 + 0.35 * (c - sh)) + uSunCol * pow(max(sd, 0.0), 8.0) * 0.4;
            col = mix(col, cc, cov * smoothstep(0.0, 0.12, d.y) * 0.9);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
  }
}
