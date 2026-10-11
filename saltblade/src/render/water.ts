// Water surface: region-tinted, clear in the shallows and dark in the deep,
// with moving ripples, fresnel reflection of the sky, a glint of the sun or
// moon (none under heavy cloud, softer further off), foam lapping at the
// shore, and scum on the still water of the Mire. uMotion slows it all for
// those who want less motion (set each frame with uGlint, see terrainMesh).
import * as THREE from 'three';
import { NOISE_GLSL } from './surface';

export function makeWaterMaterial() {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
      uSky: { value: new THREE.Color(0.7, 0.75, 0.8) },
      uDim: { value: 1 },
      uGlint: { value: 1 },
      uMotion: { value: 1 },
    },
  ]);
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: true,
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute vec2 aDepth;
      varying vec3 vCol;
      varying vec3 vW;
      varying vec2 vDepth;
      #include <fog_pars_vertex>
      void main() {
        vCol = color;
        vDepth = aDepth;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vW = wp.xyz;
        vec4 mvPosition = viewMatrix * wp;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uSunDir;
      uniform vec3 uSunCol;
      uniform vec3 uSky;
      uniform float uDim;
      uniform float uGlint;
      uniform float uMotion;
      varying vec3 vCol;
      varying vec3 vW;
      varying vec2 vDepth;
      #include <fog_pars_fragment>
      ${NOISE_GLSL}
      // value noise and its gradient
      vec3 wnd(vec2 p) {
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f), du = 6.0 * f * (1.0 - f);
        float a = sbH1(i), b = sbH1(i + vec2(1.0, 0.0)), c = sbH1(i + vec2(0.0, 1.0)), d = sbH1(i + vec2(1.0, 1.0));
        float k = a - b - c + d;
        return vec3(a + (b - a) * u.x + (c - a) * u.y + k * u.x * u.y, du * vec2(b - a + k * u.y, c - a + k * u.x));
      }
      void main() {
        float depth = vDepth.x, murk = vDepth.y;
        vec2 p = vW.xz;
        float uT = uTime * uMotion;
        vec3 w1 = wnd(p * 0.16 + vec2(uT * 0.04, uT * 0.025));
        vec3 w2 = wnd(p * 0.43 - vec2(uT * 0.07, -uT * 0.035));
        vec3 w3 = wnd(p * 1.25 + vec2(uT * 0.16, uT * 0.11));
        vec2 grad = w1.yz * 0.08 + w2.yz * 0.13 + w3.yz * 0.25;
        float hgt = w1.x * 0.5 + w2.x * 0.3 + w3.x * 0.2;
        // calmer in the shallows and on the murk
        float rough = mix(1.0, 0.35, murk) * (0.45 + 0.55 * smoothstep(0.0, 1.5, depth));
        vec3 n = normalize(vec3(-grad.x * 1.5 * rough, 1.0, -grad.y * 1.5 * rough));
        vec3 v = normalize(cameraPosition - vW);
        float fres = 0.04 + 0.96 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
        // the shallows show their bed, the deep goes dark
        float dt = smoothstep(0.0, 3.5, depth);
        vec3 body = mix(vCol * 1.22 + vec3(0.03, 0.035, 0.02), vCol * 0.42, dt);
        // (murky water gives back a dull, browned sky)
        vec3 col = mix(body, uSky * mix(vec3(0.92), vec3(0.55, 0.6, 0.48), murk), clamp(fres * (1.0 - 0.7 * murk), 0.0, 0.85)) * uDim;
        vec3 r = reflect(-v, n);
        float spec = pow(max(dot(r, uSunDir), 0.0), 160.0) * step(0.0, uSunDir.y);
        float far = smoothstep(25.0, 110.0, length(cameraPosition - vW));
        col += uSunCol * spec * 1.6 * uGlint * (1.0 - 0.75 * far) * (1.0 - 0.7 * murk);
        // scum and duckweed on still murky water
        if (murk > 0.0) {
          float sc = smoothstep(0.55, 0.75, sbN(p * 0.22 + uT * 0.01) * 0.7 + sbN(p * 1.3) * 0.3);
          col = mix(col, vec3(0.13, 0.15, 0.06) * uDim, sc * murk * 0.75);
        }
        // foam where the water meets the shore: broken bands that lap in, thinning out along the shore
        float dn = depth + (sbN(p * 0.45) - 0.5) * 0.18;
        float shore = 1.0 - smoothstep(0.0, 0.45, dn);
        float lap = 0.5 + 0.5 * sin(dn * 11.0 - uT * 1.6 + hgt * 5.0);
        float patchy = smoothstep(0.25, 0.75, sbN(p * 0.12 + uT * 0.02));
        float foam = shore * smoothstep(0.5, 0.9, lap * 0.55 + sbN(p * 2.4 + uT * 0.2) * 0.6) * (0.35 + 0.65 * patchy);
        foam += (1.0 - smoothstep(0.0, 0.07, dn)) * 0.45 * (0.5 + 0.5 * patchy);
        foam = clamp(foam * (1.0 - 0.6 * murk), 0.0, 1.0);
        col = mix(col, vec3(0.8, 0.82, 0.78) * uDim * uDim, foam * 0.65);
        float a = clamp(0.25 + dt * 0.62 + fres * 0.3 + foam * 0.5 + murk * 0.25, 0.0, 0.96) * smoothstep(-0.05, 0.05, depth);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}
