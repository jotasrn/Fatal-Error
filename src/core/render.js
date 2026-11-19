// Stylized HD Cel-Shaded + Ink Outline renderer.
// Scene renders into a compact G-buffer (shade, inkId, viewNormal.xy) + depth, then a fast,
// ultra-crisp full-screen pass applies 3-band cel-shading, anti-aliased ink silhouettes, and sky gradient
// (with an optional classic notebook mode and configurable quality presets).
import * as THREE from 'three';
import { postFrag } from './postFrag.glsl.js';

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
// Etiquetas de material (vão na fração do id de tinta; ver postFrag.glsl.js)
export const TAG = { NONE: 0, LEAF: 1, BARK: 2, PAINT: 3, LIGHT: 4, METAL: 5, FLOWER: 6 };
// Estado do ambiente (preenchido pelo ciclo dia/noite e clima; valores padrão = dia claro)
export const ENV = {
  sunDir: new THREE.Vector3(0.38, 0.82, 0.42).normalize(), lightDir: LIGHT_WORLD.clone(),
  sunCol: new THREE.Vector3(0.42, 0.40, 0.36), ambCol: new THREE.Vector3(0.66, 0.68, 0.72),
  skyZen: new THREE.Vector3(0.46, 0.72, 0.97), skyHor: new THREE.Vector3(0.87, 0.93, 0.99), skyGlow: new THREE.Vector3(0.5, 0.42, 0.3),
  night: 0, cloud: 0.25, sunVis: 1, rain: 0, wet: 0, flash: 0,
  lamps: Array.from({ length: 16 }, () => new THREE.Vector3()), lampN: 0,
};
const UP_WORLD = new THREE.Vector3(0, 1, 0);
export const shared = { uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 } };

const inkVert = /* glsl */`
#ifdef USE_AMAT
attribute vec4 aMat;
#endif
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
  #ifdef USE_AMAT
    // material por vértice (tinta, chapado, etiqueta, usa a tinta da instância?)
    float inkV = aMat.x;
    #ifdef USE_INSTANCING_COLOR
      if (aMat.w > 0.5) inkV = instanceColor.r;
    #endif
    vColorData = vec4(inkV, aMat.y, aMat.z, 1.0);
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
  if (vColorData.a > 0.0) { ink = vColorData.r + vColorData.b * 0.0625; fill = vColorData.g; }
  float shade = clamp(ndl * uShadeScale + uShadeBias, 0.0, 1.0);
  if (fill > 0.5) shade = -1.0;
  gl_FragColor = vec4(shade, ink, n.x, n.y);
}`;

export function makeInkMaterial(opts = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uInk: { value: (opts.ink ?? INK.BLUE) + (opts.tag || 0) * 0.0625 }, uFill: { value: opts.fill ? 1 : 0 },
      uShadeScale: { value: opts.shadeScale ?? 1.0 }, uShadeBias: { value: opts.shadeBias ?? 0.0 },
      uLightDir: shared.uLightDir, uTime: shared.uTime,
    },
    vertexShader: inkVert, fragmentShader: inkFrag, side: opts.side ?? THREE.FrontSide,
  });
  if (opts.amat) m.defines = { ...(m.defines || {}), USE_AMAT: '' };
  m.inkId = opts.ink ?? INK.BLUE;
  return m;
}
export function setInk(mat, ink) { mat.uniforms.uInk.value = ink; mat.inkId = ink; }
export function setFill(mat, fill) { mat.uniforms.uFill.value = fill ? 1 : 0; }

const postVert = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

// o passe final (céu, texturas procedurais, clima e iluminação) fica em postFrag.glsl.js

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
        uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
        uSunDir: { value: ENV.sunDir }, uSunCol: { value: ENV.sunCol }, uAmbCol: { value: ENV.ambCol },
        uSkyZen: { value: ENV.skyZen }, uSkyHor: { value: ENV.skyHor }, uSkyGlow: { value: ENV.skyGlow },
        uNight: { value: 0 }, uCloud: { value: 0.25 }, uSunVis: { value: 1 }, uRain: { value: 0 }, uWet: { value: 0 },
        uDetail: { value: 1 }, uLamps: { value: ENV.lamps }, uLampN: { value: 0 },
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
      this.post.uniforms.uDetail.value = 1;
    } else if (this.quality === 'low') {
      this.maxRatio = 0.85;
      this.minRatio = 0.85;
      this.post.uniforms.uFastEdge.value = 1;
      this.post.uniforms.uDetail.value = 0;
    } else {
      this.maxRatio = Math.min(Math.max(dpr, 1.0), 1.25);
      this.minRatio = this.maxRatio;
      this.post.uniforms.uFastEdge.value = 0;
      this.post.uniforms.uDetail.value = 1;
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
    shared.uLightDir.value.copy(ENV.lightDir).transformDirection(this.camera.matrixWorldInverse);
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
    u.uFlash.value = Math.min(1, (fx.flash || 0) + ENV.flash);
    u.uInvProj.value.copy(this.camera.projectionMatrixInverse);
    u.uCamWorld.value.copy(this.camera.matrixWorld);
    u.uNight.value = ENV.night; u.uCloud.value = ENV.cloud; u.uSunVis.value = ENV.sunVis;
    u.uRain.value = ENV.rain; u.uWet.value = ENV.wet; u.uLampN.value = ENV.lampN;
    u.uSlow.value = fx.slow || 0;
    u.uLowHp.value = fx.lowHp || 0;
    r.render(this.postScene, this.postCam);
  }
}
