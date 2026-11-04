// Bot batching (GPU instancing). Every bot is a clone of a cached template, so bots of the same
// kind share the exact same geometry pieces. Instead of one draw call per piece per bot, each
// shared piece is drawn once per frame as an InstancedMesh carrying every visible bot's copy.
//
// The per-bot meshes stay in the scene graph (so animation, hit markers, ragdolls and the network
// code keep working unchanged); they are only moved to a camera-invisible layer. Each frame,
// after the world matrices are fresh, their world matrix + ink/fill go into the instance buffers.
// A piece that gets knocked off a body (ragdoll debris) goes back to normal rendering.
import * as THREE from 'three';
import { makeInkMaterial } from '../render.js';

const HIDDEN_LAYER = 1;
const _frustum = new THREE.Frustum(), _pm = new THREE.Matrix4(), _sphere = new THREE.Sphere(), _v = new THREE.Vector3();

export class BotBatcher {
  constructor(scene) {
    this.scene = scene; this.pools = new Map();
    // bot materials are all "flat" (shadeScale 0) or filled; per-instance colour carries ink + fill
    this.mats = {
      front: makeInkMaterial({ ink: 0, shadeScale: 0, shadeBias: 1, side: THREE.FrontSide }),
      double: makeInkMaterial({ ink: 0, shadeScale: 0, shadeBias: 1, side: THREE.DoubleSide }),
    };
    this.enabled = true;
  }
  // call once per bot, right after it is built
  register(e) {
    if (!this.enabled) return;
    const list = [];
    e.root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.geometry && o.geometry.userData.shared && o.material && o.material.uniforms && o.material.uniforms.uInk) { o.layers.set(HIDDEN_LAYER); list.push(o); } });
    e.batched = list;
  }
  _pool(geo, double) {
    const key = geo.id * 2 + (double ? 1 : 0); let p = this.pools.get(key);
    if (!p) { p = { geo, double, mesh: null, cap: 0, n: 0 }; this._alloc(p, 16); this.pools.set(key, p); }
    return p;
  }
  _alloc(p, cap) {
    const old = p.mesh;
    const m = new THREE.InstancedMesh(p.geo, p.double ? this.mats.double : this.mats.front, cap);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage);
    if (old) { // growing mid-frame: keep the instances already written this frame
      m.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, Math.min(old.instanceMatrix.array.length, cap * 16)));
      m.instanceColor.array.set(old.instanceColor.array.subarray(0, Math.min(old.instanceColor.array.length, cap * 3)));
      this.scene.remove(old); old.dispose();
    }
    m.frustumCulled = false; m.count = 0; m.matrixAutoUpdate = false;
    this.scene.add(m); p.mesh = m; p.cap = cap;
  }
  // camera: the render camera (bots outside its view are skipped, the map itself is never culled here)
  update(enemies, camera) {
    for (const p of this.pools.values()) p.n = 0;
    _pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); _frustum.setFromProjectionMatrix(_pm);
    for (const e of enemies) {
      const list = e.batched; if (!list || !list.length) continue;
      const root = e.root;
      if (e.rootDetached || !root.parent || !root.visible) continue;
      _sphere.center.copy(root.position); _sphere.center.y += 1.0 * (e.T.scale || 1); _sphere.radius = 2.2 * (e.T.scale || 1) + 1;
      const onScreen = _frustum.intersectsSphere(_sphere);
      for (let i = list.length - 1; i >= 0; i--) {
        const m = list[i];
        let o = m, vis = m.visible;
        while (o && o !== root) { o = o.parent; if (o && o !== root && !o.visible) vis = false; }
        if (o !== root) { m.layers.set(0); list.splice(i, 1); continue; } // knocked off: render it normally
        if (!vis || !onScreen) continue;
        const mat = m.material, p = this._pool(m.geometry, mat.side === THREE.DoubleSide);
        if (p.n >= p.cap) this._alloc(p, p.cap * 2);
        p.mesh.setMatrixAt(p.n, m.matrixWorld);
        p.mesh.instanceColor.setXYZ(p.n, mat.uniforms.uInk.value, mat.uniforms.uFill.value, 0);
        p.n++;
      }
    }
    for (const p of this.pools.values()) {
      p.mesh.count = p.n;
      if (p.n) { p.mesh.instanceMatrix.needsUpdate = true; p.mesh.instanceColor.needsUpdate = true; }
    }
  }
  // drop the instanced copies of pieces nobody uses any more (e.g. after a map change)
  clear() { for (const p of this.pools.values()) { p.n = 0; p.mesh.count = 0; } }
  get drawCalls() { let n = 0; for (const p of this.pools.values()) if (p.n) n++; return n; }
}
