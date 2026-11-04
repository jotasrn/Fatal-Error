import * as THREE from 'three';
import { makeInkMaterial, INK } from '../render.js';
import { Gun } from './gun.js';
import { bx, cyl, sph, hand, makeFlash } from './primitives.js';

export class Bazooka extends Gun {
  constructor(ctx) {
    super(ctx, 'bazooka');
    this.basePos.set(0.22, -0.21, -0.32);
  }
  build() {
    const g = this.root, mat = this.mat, dark = this.dark, red = this.red;
    // Launcher main tube
    cyl(0.08, 1.35, 0, 0.04, -0.22, mat, g);
    // Rear exhaust cone / bell
    cyl(0.12, 0.24, 0, 0.04, 0.52, dark, g);
    // Front muzzle ring
    cyl(0.092, 0.08, 0, 0.04, -0.85, dark, g);
    // Reinforcement rings along tube
    cyl(0.088, 0.04, 0, 0.04, -0.45, dark, g);
    cyl(0.088, 0.04, 0, 0.04, 0.12, dark, g);
    // Shoulder recoil rest
    bx(0.09, 0.11, 0.32, 0, -0.06, 0.32, dark, g);
    // Trigger grip and angled foregrip
    const gripR = bx(0.048, 0.16, 0.06, 0, -0.14, 0.08, mat, g); gripR.rotation.x = 0.32;
    const gripL = bx(0.045, 0.14, 0.055, -0.08, -0.09, -0.32, mat, g); gripL.rotation.z = -0.2;
    // Raised sights on top left of launcher tube
    bx(0.02, 0.08, 0.12, -0.07, 0.12, -0.15, dark, g);
    sph(0.003, -0.07, 0.15, -0.15, red, g, 5);
    // Doodle hands holding the launcher
    hand(mat, 0.01, -0.16, 0.1, g, [0.45, -0.6, 1]);
    this.handL = hand(mat, -0.09, -0.12, -0.32, g, [-0.4, -0.7, 0.9]);
    this.handLPos = this.handL.position.clone();
    // Rocket loaded in muzzle
    this.loadedRocket = new THREE.Group();
    const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.22, 7), makeInkMaterial({ ink: INK.ORANGE, fill: true }));
    warhead.rotation.x = -Math.PI / 2; warhead.position.set(0, 0.04, -0.92);
    this.loadedRocket.add(warhead);
    g.add(this.loadedRocket);
    // Muzzle & Flash
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.04, -0.95); g.add(this.muzzle);
    this.flash = makeFlash(g, 0, 0.04, -0.95, 2.0);
  }
}
