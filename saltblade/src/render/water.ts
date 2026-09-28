// Water surface: region-tinted vertex colours, ripples, fresnel and sun glint.
import * as THREE from 'three';

export function makeWaterMaterial() {
  const uniforms = THREE.UniformsUtils.merge([
    THREE.UniformsLib.fog,
    {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunCol: { value: new THREE.Color(1, 0.95, 0.85) },
      uSky: { value: new THREE.Color(0.7, 0.75, 0.8) },
      uDim: { value: 1 },
    },
  ]);
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: true,
    vertexShader: /* glsl */ `
      attribute vec4 color;
      varying vec4 vCol;
      varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        vCol = color;
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
      varying vec4 vCol;
      varying vec3 vW;
      #include <fog_pars_fragment>
      float wh(vec2 p){ p = fract(p * vec2(0.1031, 0.1030)); p += dot(p, p.yx + 33.33); return fract((p.x + p.y) * p.x); }
      float wn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(wh(i), wh(i+vec2(1,0)), f.x), mix(wh(i+vec2(0,1)), wh(i+vec2(1,1)), f.x), f.y); }
      float waves(vec2 p) {
        return wn(p * 0.18 + vec2(uTime * 0.05, uTime * 0.03)) * 0.5
             + wn(p * 0.47 - vec2(uTime * 0.09, -uTime * 0.04)) * 0.3
             + wn(p * 1.3 + vec2(uTime * 0.2, uTime * 0.13)) * 0.2;
      }
      void main() {
        float e = 0.35;
        float h0 = waves(vW.xz);
        float hx = waves(vW.xz + vec2(e, 0.0));
        float hz = waves(vW.xz + vec2(0.0, e));
        vec3 n = normalize(vec3((h0 - hx) * 1.6, 1.0, (h0 - hz) * 1.6));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
        vec3 r = reflect(-v, n);
        float spec = pow(max(dot(r, uSunDir), 0.0), 180.0) * step(0.0, uSunDir.y);
        vec3 col = mix(vCol.rgb, uSky * 0.75, clamp(fres * 0.6, 0.0, 0.6)) * uDim + uSunCol * spec * 1.6;
        float a = clamp(vCol.a + fres * 0.35, 0.0, 0.94);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
}
