// Stylized HD Cel-Shaded + Ink Outline renderer.
// Scene renders into a compact G-buffer (shade, inkId, viewNormal.xy) + depth, then a fast,
// ultra-crisp full-screen pass applies 3-band cel-shading, anti-aliased ink silhouettes, and sky gradient
// (with an optional classic notebook mode and configurable quality presets).
import * as THREE from 'three';

// PURPLE and TEAL are reserved for human players, so no bot ever shares their colour
export const INK = { BLUE: 0, RED: 1, BLACK: 2, ORANGE: 3, GREEN: 4, PINK: 5, PURPLE: 6, TEAL: 7 };
export const INK_COLORS = [
  new THREE.Vector3(0.14, 0.32, 0.84), // 0: cobalt blue
  new THREE.Vector3(0.88, 0.14, 0.21), // 1: crimson red
  new THREE.Vector3(0.18, 0.20, 0.26), // 2: slate / architectural concrete
  new THREE.Vector3(0.96, 0.62, 0.10), // 3: golden amber
  new THREE.Vector3(0.16, 0.66, 0.32), // 4: vibrant emerald / grass
  new THREE.Vector3(0.92, 0.38, 0.66), // 5: rose / ipê-roxo
  new THREE.Vector3(0.56, 0.18, 0.90), // 6: violet (players)
  new THREE.Vector3(0.04, 0.68, 0.76), // 7: cyan-teal (player accents)
];
export const LIGHT_WORLD = new THREE.Vector3(0.38, 0.82, 0.42).normalize();
const UP_WORLD = new THREE.Vector3(0, 1, 0);
export const shared = { uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 } };

const inkVert = /* glsl */`
varying vec3 vNormalV;
varying vec4 vColorData;
uniform float uTime;
void main() {
  vec3 transformed = position;
  vec3 objectNormal = normal;
  #ifdef USE_INSTANCING
    transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    objectNormal = mat3(instanceMatrix) * objectNormal;
  #endif
  #ifdef USE_INSTANCING_COLOR
    vColorData = vec4(instanceColor, 1.0);
  #else
    vColorData = vec4(0.0, 0.0, 0.0, -1.0);
  #endif
  vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
  vNormalV = normalize(normalMatrix * objectNormal);
  gl_Position = projectionMatrix * mvPosition;
}`;

const inkFrag = /* glsl */`
precision highp float;
uniform float uInk;
uniform float uFill;
uniform float uShadeScale;
uniform float uShadeBias;
uniform vec3 uLightDir;
varying vec3 vNormalV;
varying vec4 vColorData;
void main() {
  vec3 n = normalize(vNormalV);
  if (!gl_FrontFacing) n = -n;
  float ndl = dot(n, uLightDir) * 0.5 + 0.5;
  float ink = uInk; float fill = uFill;
  if (vColorData.a > 0.0) { ink = vColorData.r; fill = vColorData.g; }
  float shade = clamp(ndl * uShadeScale + uShadeBias, 0.0, 1.0);
  if (fill > 0.5) shade = -1.0;
  gl_FragColor = vec4(shade, ink, n.x, n.y);
}`;

export function makeInkMaterial(opts = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uInk: { value: opts.ink ?? INK.BLUE }, uFill: { value: opts.fill ? 1 : 0 },
      uShadeScale: { value: opts.shadeScale ?? 1.0 }, uShadeBias: { value: opts.shadeBias ?? 0.0 },
      uLightDir: shared.uLightDir, uTime: shared.uTime,
    },
    vertexShader: inkVert, fragmentShader: inkFrag, side: opts.side ?? THREE.FrontSide,
  });
  m.inkId = opts.ink ?? INK.BLUE;
  return m;
}
export function setInk(mat, ink) { mat.uniforms.uInk.value = ink; mat.inkId = ink; }
export function setFill(mat, fill) { mat.uniforms.uFill.value = fill ? 1 : 0; }

const postVert = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const postFrag = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform vec2 uRes;
uniform float uAspect;
uniform float uTime;
uniform float uNear;
uniform float uFar;
uniform float uHurt;
uniform float uFlash;
uniform float uSlow;
uniform float uLowHp;
uniform float uNotebook;
uniform float uFastEdge;
uniform float uLineSpacing;
uniform vec3 uPaper;
uniform vec3 uLightView;
uniform vec3 uUpView;
uniform vec3 uCamFwd;
uniform vec3 uInks[8];

float linDepth(float z) {
  float zn = z * 2.0 - 1.0;
  return 2.0 * uNear * uFar / (uFar + uNear - zn * (uFar - uNear));
}

vec3 baseInk(int i) {
  if (i <= 0) return uInks[0];
  if (i == 1) return uInks[1];
  if (i == 2) return uInks[2];
  if (i == 3) return uInks[3];
  if (i == 4) return uInks[4];
  if (i == 5) return uInks[5];
  if (i == 6) return uInks[6];
  return uInks[7];
}

vec3 surfaceCelColor(int id, float shade, float ndl, float upAmt) {
  float lit = (shade >= 0.0 && shade <= 0.995) ? shade : ndl;
  float b1 = smoothstep(0.28, 0.36, lit);
  float b2 = smoothstep(0.64, 0.74, lit);
  float cel = clamp(0.24 + 0.46 * b1 + 0.30 * b2 + max(0.0, upAmt) * 0.07, 0.0, 1.0);
  vec3 p = baseInk(id);

  // Solid filled accents (vehicles, vests, flags, decals, blood, hit-flash)
  if (shade < 0.0) {
    float fCel = 0.72 + 0.24 * b1 + 0.14 * b2;
    return clamp(p * fCel, 0.0, 1.0);
  }

  // Characters (bots & remote players use shadeScale=0, shadeBias=1 -> shade == 1.0)
  if (shade > 0.995) {
    vec3 darkC = p * 0.58 + vec3(0.03);
    vec3 litC = min(vec3(1.0), p * 1.15 + vec3(0.16));
    return mix(darkC, litC, cel);
  }

  // World architecture, grass, roads, monuments & first-person weapons
  if (id == 2) {
    // Architectural white concrete / stone (Niemeyer monuments, slabs, curbs)
    return mix(vec3(0.58, 0.62, 0.70), vec3(0.95, 0.95, 0.96), cel);
  }
  if (id == 0) {
    // Cobalt / architectural glass & sky-blue structures
    return mix(vec3(0.30, 0.46, 0.78), vec3(0.76, 0.86, 0.98), cel);
  }
  if (id == 4) {
    // Vibrant grass & southern ministries emerald glass
    return mix(vec3(0.18, 0.48, 0.26), vec3(0.42, 0.78, 0.45), cel);
  }
  if (id == 3) {
    // Golden amber / ipê-amarelo / crosswalks / lights
    return mix(vec3(0.74, 0.43, 0.09), vec3(0.99, 0.80, 0.26), cel);
  }
  if (id == 1) {
    // Crimson / terracotta
    return mix(vec3(0.60, 0.14, 0.19), vec3(0.95, 0.34, 0.36), cel);
  }
  if (id == 5) {
    // Rose / ipê-roxo / kiosks
    return mix(vec3(0.66, 0.27, 0.49), vec3(0.96, 0.58, 0.78), cel);
  }
  return mix(p * 0.55, min(vec3(1.0), p * 1.12 + vec3(0.14)), cel);
}

void main() {
  vec2 px = 1.0 / uRes;
  float sc = clamp(uRes.y / 900.0, 0.75, 2.0);

  // Sample directly at exact pixel center (no UV wobble = zero shimmer & razor-sharp edges!)
  vec4 s = texture2D(tScene, vUv);
  float z = texture2D(tDepth, vUv).x;
  bool sky = z >= 0.99999;

  // Sky / background
  float skyY = clamp(uCamFwd.y * 0.65 + (vUv.y - 0.45) * 0.95, 0.0, 1.0);
  vec3 skyCol;
  if (uNotebook > 0.5) {
    vec2 pp = gl_FragCoord.xy;
    float ls = uLineSpacing;
    float ly = mod(pp.y + ls * 0.5, ls);
    float rule = 1.0 - smoothstep(0.5 * sc, 1.6 * sc, abs(ly - ls * 0.5));
    skyCol = mix(uPaper, vec3(0.64, 0.75, 0.93), rule * 0.38);
  } else {
    skyCol = mix(vec3(0.87, 0.93, 0.99), vec3(0.46, 0.72, 0.97), smoothstep(0.0, 0.85, skyY));
  }

  // Edge detection (depth silhouette + normal crease)
  float o = 1.05 * sc;
  vec2 ox = vec2(o * px.x, 0.0), oy = vec2(0.0, o * px.y);
  float zl = texture2D(tDepth, vUv - ox).x;
  float zr = texture2D(tDepth, vUv + ox).x;
  float zu = texture2D(tDepth, vUv + oy).x;
  float zd = texture2D(tDepth, vUv - oy).x;

  float d = sky ? uFar : linDepth(z);
  float iw = 1.0 / d;
  float lap = abs(1.0 / linDepth(zl) + 1.0 / linDepth(zr) - 2.0 * iw)
            + abs(1.0 / linDepth(zu) + 1.0 / linDepth(zd) - 2.0 * iw);
  float edge = smoothstep(0.065, 0.24, lap / (iw + 1e-7));

  float zmin = z;
  float inkId = s.g;
  if (uFastEdge < 0.5) {
    vec4 sl = texture2D(tScene, vUv - ox);
    vec4 sr = texture2D(tScene, vUv + ox);
    vec4 su = texture2D(tScene, vUv + oy);
    vec4 sd = texture2D(tScene, vUv - oy);
    float nEdge = length(sl.ba - sr.ba) + length(su.ba - sd.ba);
    edge = max(edge, smoothstep(0.48, 0.88, nEdge) * 0.85);
    // Ink ID discontinuities (e.g. crosswalks, window frames, flags) get crisp borders too
    float idEdge = abs(sl.g - sr.g) + abs(su.g - sd.g);
    edge = max(edge, smoothstep(0.2, 0.8, idEdge) * 0.55);
    if (zl < zmin) { zmin = zl; inkId = sl.g; }
    if (zr < zmin) { zmin = zr; inkId = sr.g; }
    if (zu < zmin) { zmin = zu; inkId = su.g; }
    if (zd < zmin) { zmin = zd; inkId = sd.g; }
  }
  float dFront = linDepth(zmin);

  vec3 col = skyCol;
  if (!sky) {
    vec2 nxy = s.ba;
    vec3 nView = vec3(nxy, sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
    float ndl = dot(nView, uLightView) * 0.5 + 0.5;
    float upAmt = dot(nView, uUpView);
    int surfId = int(s.g + 0.5);
    vec3 surf = surfaceCelColor(surfId, s.r, ndl, upAmt);
    if (uNotebook > 0.5 && s.r >= 0.0 && s.r <= 0.995) {
      surf = mix(uPaper, surf, 0.68);
    }
    // Gentle atmospheric aerial perspective on very distant buildings (> 160 m) so giant Brasília stays crisp
    float haze = smoothstep(160.0, 680.0, d) * 0.28;
    col = mix(surf, skyCol, haze);
  }

  // Crisp dark ink outline (tinted subtly by the front object's ink colour)
  int eId = int(inkId + 0.5);
  vec3 outlineCol = baseInk(eId) * 0.22 + vec3(0.05, 0.06, 0.09);
  float fadeE = mix(1.0, 0.38, smoothstep(55.0, 420.0, dFront));
  col = mix(col, outlineCol, clamp(edge, 0.0, 1.0) * fadeE);

  // Hurt / low-HP vignette, flash & slow-motion tint
  vec2 vc = (vUv - 0.5) * vec2(uAspect, 1.0);
  float vig = smoothstep(0.36, 0.92, length(vc));
  float hurt = clamp(uHurt + uLowHp * (0.35 + 0.25 * sin(uTime * 6.0)), 0.0, 1.0);
  col = mix(col, uInks[1] * 0.88, hurt * vig * 0.78);
  col = mix(col, vec3(1.0, 0.99, 0.96), uFlash);
  float lum = dot(col, vec3(0.3, 0.5, 0.2));
  col = mix(col, vec3(lum) * vec3(0.80, 0.88, 1.0), uSlow * 0.55);

  gl_FragColor = vec4(col, 1.0);
}`;

export class InkRenderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: false,
    });
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.autoClear = false;

    this.quality = 'medium';
    this.notebookMode = false;
    this.autoRes = true;
    const dpr = window.devicePixelRatio || 1;
    this.maxRatio = Math.min(dpr, 1.35);
    this.minRatio = Math.min(this.maxRatio, 0.85);
    this.pixelRatio = this.maxRatio;
    this._ft = 16.7; this._slowT = 0; this._fastT = 0; this._lastT = 0; this.lost = false;

    canvas.addEventListener('webglcontextlost', (ev) => { ev.preventDefault(); this.lost = true; if (window.FE_LOG) window.FE_LOG.error('webglcontextlost'); });
    canvas.addEventListener('webglcontextrestored', () => { this.lost = false; this.resize(); });

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(80, 1, 0.08, 820);
    const depthTexture = new THREE.DepthTexture(2, 2);
    depthTexture.format = THREE.DepthFormat;
    depthTexture.type = THREE.FloatType;
    this.rt = new THREE.WebGLRenderTarget(2, 2, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthTexture,
      depthBuffer: true,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.post = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.rt.texture },
        tDepth: { value: depthTexture },
        uRes: { value: new THREE.Vector2(2, 2) },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uNear: { value: this.camera.near },
        uFar: { value: this.camera.far },
        uHurt: { value: 0 },
        uFlash: { value: 0 },
        uSlow: { value: 0 },
        uLowHp: { value: 0 },
        uNotebook: { value: 0 },
        uFastEdge: { value: 0 },
        uLineSpacing: { value: 60 },
        uPaper: { value: new THREE.Vector3(0.965, 0.955, 0.905) },
        uLightView: { value: new THREE.Vector3(0, 1, 0) },
        uUpView: { value: new THREE.Vector3(0, 1, 0) },
        uCamFwd: { value: new THREE.Vector3(0, 0, -1) },
        uInks: { value: INK_COLORS },
      },
      vertexShader: postVert,
      fragmentShader: postFrag,
      depthTest: false,
      depthWrite: false,
    });
    this.postScene = new THREE.Scene();
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.post);
    this.postScene.add(this.postQuad);
    this.beforeRender = null;

    this._clear = new THREE.Color(1, 0, 0);
    this._camDir = new THREE.Vector3();
    this.resize();
    window.addEventListener('resize', () => {
      this.resize();
      clearTimeout(this._reT);
      this._reT = setTimeout(() => this.resize(), 100);
      this._reT2 = setTimeout(() => this.resize(), 260);
    });
  }

  setQuality(q) {
    this.quality = q || 'medium';
    const dpr = window.devicePixelRatio || 1;
    // Keep pixelRatio fixed per preset so Chromium never reallocates the D3D11 swapchain mid-combat
    this.autoRes = false;
    if (this.quality === 'high') {
      this.maxRatio = Math.min(Math.max(dpr, 1.25), 1.75);
      this.minRatio = this.maxRatio;
      this.post.uniforms.uFastEdge.value = 0;
    } else if (this.quality === 'low') {
      this.maxRatio = 0.85;
      this.minRatio = 0.85;
      this.post.uniforms.uFastEdge.value = 1;
    } else {
      this.maxRatio = Math.min(Math.max(dpr, 1.0), 1.25);
      this.minRatio = this.maxRatio;
      this.post.uniforms.uFastEdge.value = 0;
    }
    this.pixelRatio = this.maxRatio;
    this.resize();
  }

  setNotebookMode(on) {
    this.notebookMode = !!on;
    this.post.uniforms.uNotebook.value = this.notebookMode ? 1 : 0;
  }

  resize() {
    const w = Math.max(2, window.innerWidth), h = Math.max(2, window.innerHeight);
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    const rw = Math.max(2, Math.floor(w * this.pixelRatio)), rh = Math.max(2, Math.floor(h * this.pixelRatio));
    this.rt.setSize(rw, rh);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    const u = this.post.uniforms;
    u.uRes.value.set(rw, rh);
    u.uAspect.value = w / h;
    u.uLineSpacing.value = rh / 13.5;
  }

  _adapt() {
    const now = performance.now(), ms = now - this._lastT; this._lastT = now;
    if (ms <= 0 || ms > 250) return;
    this._ft += (ms - this._ft) * 0.06;
    if (!this.autoRes) return;
    if (this._ft > 21.5) { this._slowT += ms; this._fastT = 0; }
    else if (this._ft < 17.2) { this._fastT += ms; this._slowT = 0; }
    else { this._slowT = 0; this._fastT = 0; }
    if (now - (this._lastChange || 0) < 3500) return;
    if (this._slowT > 1400 && this.pixelRatio > this.minRatio + 1e-3) {
      this.pixelRatio = Math.max(this.minRatio, +(this.pixelRatio * 0.88).toFixed(2));
      this._slowT = 0; this._lastChange = now; this.resize();
    } else if (this._fastT > 8000 && this.pixelRatio < this.maxRatio - 1e-3) {
      this.pixelRatio = Math.min(this.maxRatio, +(this.pixelRatio * 1.1).toFixed(2));
      this._fastT = 0; this._lastChange = now; this.resize();
    }
  }

  render(time, fx = {}) {
    if (this.lost) return;
    this._adapt();
    shared.uTime.value = time;
    this.camera.updateMatrixWorld();
    this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
    shared.uLightDir.value.copy(LIGHT_WORLD).transformDirection(this.camera.matrixWorldInverse);
    const u = this.post.uniforms;
    u.uLightView.value.copy(shared.uLightDir.value);
    u.uUpView.value.copy(UP_WORLD).transformDirection(this.camera.matrixWorldInverse);
    this.camera.getWorldDirection(this._camDir);
    u.uCamFwd.value.copy(this._camDir);

    const r = this.renderer;
    r.setRenderTarget(this.rt);
    r.setClearColor(this._clear, 0);
    r.clear(true, true, false);
    if (this.beforeRender) {
      this.scene.updateMatrixWorld();
      this.beforeRender(this.camera);
      this.scene.matrixWorldAutoUpdate = false;
    }
    r.render(this.scene, this.camera);
    this.scene.matrixWorldAutoUpdate = true;
    r.setRenderTarget(null);

    u.uTime.value = time;
    u.uNear.value = this.camera.near;
    u.uFar.value = this.camera.far;
    u.uHurt.value = fx.hurt || 0;
    u.uFlash.value = fx.flash || 0;
    u.uSlow.value = fx.slow || 0;
    u.uLowHp.value = fx.lowHp || 0;
    r.render(this.postScene, this.postCam);
  }
}
