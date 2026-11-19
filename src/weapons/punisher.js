import * as THREE from 'three';
import { Gun } from './gun.js';
import { bx, cyl, hand, makeFlash } from './primitives.js';

export class PunisherPistol extends Gun {
  constructor(ctx) {
    super(ctx, 'punisher');
    this.basePos.set(0.18, -0.19, -0.29);
  }
  build() {
    const g = this.root, mat = this.mat, dark = this.dark;
    // Five-SeveN / Punisher elongated armor-piercing slide & compensator
    bx(0.044, 0.074, 0.24, 0, 0.018, -0.05, dark, g);
    bx(0.046, 0.078, 0.055, 0, 0.018, -0.19, mat, g); // front compensator
    cyl(0.015, 0.27, 0, 0.022, -0.1, mat, g);
    // Side vents
    for (let i = 0; i < 3; i++) {
      bx(0.048, 0.014, 0.022, 0, 0.026, -0.02 - i * 0.04, mat, g);
    }
    // Iron sights
    bx(0.009, 0.024, 0.018, 0, 0.068, -0.2, this.red, g);
    bx(0.011, 0.022, 0.015, -0.013, 0.064, 0.055, mat, g);
    bx(0.011, 0.022, 0.015, 0.013, 0.064, 0.055, mat, g);
    // Grip & extended AP magazine
    const grip = bx(0.042, 0.135, 0.056, 0, -0.095, 0.045, mat, g);
    grip.rotation.x = 0.26;
    this.magMesh = bx(0.036, 0.17, 0.048, 0, -0.125, 0.05, dark, g);
    this.magMesh.rotation.x = 0.26;
    this.magY = -0.125;
    // Hands
    hand(mat, 0.0, -0.12, 0.06, g, [0.45, -0.55, 1]);
    this.handL = hand(mat, -0.045, -0.13, 0.03, g, [-0.4, -0.7, 1]);
    this.handLPos = this.handL.position.clone();
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.022, -0.24);
    g.add(this.muzzle);
    this.ejectPt = new THREE.Object3D();
    this.ejectPt.position.set(0.038, 0.038, -0.01);
    g.add(this.ejectPt);
    this.flash = makeFlash(g, 0, 0.022, -0.24, 1.05);
  }
}

