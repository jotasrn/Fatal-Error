import * as THREE from 'three';
import { Gun } from './gun.js';
import { bx, cyl, hand, makeFlash } from './primitives.js';

export class DesertEagle extends Gun {
  constructor(ctx) {
    super(ctx, 'deagle');
    this.basePos.set(0.19, -0.2, -0.3);
  }
  build() {
    const g = this.root, mat = this.mat, dark = this.dark;
    // Heavy .50 AE triangular barrel & massive slide
    bx(0.054, 0.095, 0.28, 0, 0.022, -0.07, mat, g);
    bx(0.042, 0.035, 0.28, 0, 0.072, -0.07, dark, g); // top Picatinny rail
    cyl(0.022, 0.3, 0, 0.028, -0.1, dark, g);
    bx(0.048, 0.04, 0.24, 0, -0.032, -0.05, dark, g);
    // Sights
    bx(0.011, 0.028, 0.02, 0, 0.096, -0.2, this.red, g);
    bx(0.014, 0.026, 0.018, -0.016, 0.092, 0.05, mat, g);
    bx(0.014, 0.026, 0.018, 0.016, 0.092, 0.05, mat, g);
    // Heavy grip & .50 magazine
    const grip = bx(0.048, 0.145, 0.062, 0, -0.105, 0.055, dark, g);
    grip.rotation.x = 0.32;
    this.magMesh = bx(0.042, 0.155, 0.054, 0, -0.12, 0.06, mat, g);
    this.magMesh.rotation.x = 0.32;
    this.magY = -0.12;
    // Hands
    hand(mat, 0.0, -0.13, 0.07, g, [0.45, -0.55, 1]);
    this.handL = hand(mat, -0.05, -0.15, 0.03, g, [-0.4, -0.7, 1]);
    this.handLPos = this.handL.position.clone();
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.028, -0.26);
    g.add(this.muzzle);
    this.ejectPt = new THREE.Object3D();
    this.ejectPt.position.set(0.045, 0.045, -0.02);
    g.add(this.ejectPt);
    this.flash = makeFlash(g, 0, 0.028, -0.26, 1.5);
  }
}

