// Shared mesh builders and easing helpers for the first-person weapon view models.
import * as THREE from 'three';
import { makeInkMaterial, INK } from '../render.js';
import { TAU } from '../util.js';

export const easeOut = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function bx(w, h, d, x, y, z, mat, parent) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; }
export function cyl(r, h, x, y, z, mat, parent, axis = 'z', seg = 8) { const g = new THREE.CylinderGeometry(r, r, h, seg); if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(Math.PI / 2); const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); parent.add(m); return m; }
export function sph(r, x, y, z, mat, parent, seg = 8) { const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), mat); m.position.set(x, y, z); parent.add(m); return m; }
export function star(n = 7, r1 = 0.16, r2 = 0.06) { const s = new THREE.Shape(); for (let i = 0; i < n * 2; i++) { const a = (i / (n * 2)) * TAU, r = i % 2 === 0 ? r1 : r2; if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r); } s.closePath(); return new THREE.ShapeGeometry(s); }
export function frame(w, h, t, d, x, y, z, mat, parent) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); bx(w, t, d, 0, h / 2, 0, mat, g); bx(w, t, d, 0, -h / 2, 0, mat, g); bx(t, h, d, -w / 2, 0, 0, mat, g); bx(t, h, d, w / 2, 0, 0, mat, g); return g; }
// doodle fist + forearm heading back toward the shoulder
export function hand(mat, x, y, z, parent, dir = [0.4, -0.5, 1], len = 0.42) {
  sph(0.062, x, y, z, mat, parent); const d = new THREE.Vector3(...dir).normalize();
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, len, 7), mat); arm.position.set(x + d.x * len / 2, y + d.y * len / 2, z + d.z * len / 2);
  arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d); parent.add(arm); return arm;
}
export function makeFlash(parent, x, y, z, scale) {
  const fm = makeInkMaterial({ ink: INK.ORANGE, fill: true, side: THREE.DoubleSide }); const g = new THREE.Group();
  g.add(new THREE.Mesh(star(7, 0.16, 0.06), fm)); const s2 = new THREE.Mesh(star(5, 0.11, 0.04), fm); s2.rotation.y = Math.PI / 2; g.add(s2);
  const s3 = new THREE.Mesh(star(5, 0.1, 0.04), fm); s3.rotation.x = Math.PI / 2; g.add(s3);
  g.position.set(x, y, z); g.scale.setScalar(scale); g.visible = false; parent.add(g); return g;
}
