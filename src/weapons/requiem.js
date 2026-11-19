import * as THREE from 'three';
import { TAU } from '../core/util.js';
import { Gun } from './gun.js';
import { bx, cyl, hand, makeFlash } from './primitives.js';

// Requiem .500 Magnum (inspired by Resident Evil's iconic Handcannon / Requiem Magnum)
export class Requiem extends Gun {
  constructor(ctx) {
    super(ctx, 'requiem');
    this.basePos.set(0.2, -0.2, -0.32);
  }
  build() {
    const g = this.root, mat = this.mat, dark = this.dark, red = this.red;
    // Heavy magnum frame & long vented bull barrel
    bx(0.056, 0.11, 0.24, 0, 0.005, 0, dark, g);
    cyl(0.025, 0.44, 0, 0.042, -0.32, mat, g);
    // Full-length underlug & top ventilated rib
    bx(0.044, 0.045, 0.4, 0, 0.004, -0.3, dark, g);
    bx(0.038, 0.026, 0.42, 0, 0.072, -0.31, mat, g);
    for (let i = 0; i < 5; i++) {
      bx(0.048, 0.016, 0.032, 0, 0.055, -0.16 - i * 0.07, dark, g);
    }
    // Muzzle brake compensator ports
    bx(0.06, 0.085, 0.065, 0, 0.035, -0.52, dark, g);
    // Fluted 5-round .500 Magnum cylinder
    this.cylGroup = new THREE.Group();
    this.cylGroup.position.set(0, 0.008, -0.02);
    g.add(this.cylGroup);
    cyl(0.062, 0.13, 0, 0, 0, mat, this.cylGroup, 'z', 8);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      cyl(0.015, 0.135, Math.cos(a) * 0.038, Math.sin(a) * 0.038, 0, dark, this.cylGroup, 'z', 6);
    }
    // Ergonomic magnum grip with crimson inlay & heavy hammer
    const grip = bx(0.052, 0.16, 0.065, 0, -0.11, 0.08, dark, g);
    grip.rotation.x = 0.42;
    bx(0.056, 0.12, 0.04, 0, -0.11, 0.082, red, g).rotation.x = 0.42;
    bx(0.024, 0.055, 0.042, 0, 0.06, 0.11, mat, g).rotation.x = -0.45;
    // Glowing fiber-optic front sight & adjustable rear target sight
    bx(0.012, 0.036, 0.024, 0, 0.095, -0.51, red, g);
    bx(0.015, 0.03, 0.018, -0.016, 0.075, 0.09, mat, g);
    bx(0.015, 0.03, 0.018, 0.016, 0.075, 0.09, mat, g);
    // Hands
    hand(mat, 0.0, -0.14, 0.09, g, [0.45, -0.55, 1]);
    this.handL = hand(mat, -0.055, -0.18, 0.03, g, [-0.4, -0.7, 1]);
    this.handLPos = this.handL.position.clone();
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.042, -0.56);
    g.add(this.muzzle);
    this.ejectPt = new THREE.Object3D();
    this.ejectPt.position.set(-0.06, 0.02, 0);
    g.add(this.ejectPt);
    this.flash = makeFlash(g, 0, 0.042, -0.56, 1.85);
  }
}

