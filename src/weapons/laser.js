import * as THREE from 'three';
import { Gun } from './gun.js';
import { bx, cyl, sph, hand, makeFlash } from './primitives.js';

export class LaserRifle extends Gun {
  constructor(ctx) {
    super(ctx, 'laser');
    this.basePos.set(0.19, -0.18, -0.32);
  }
  build() {
    const g = this.root, mat = this.mat, dark = this.dark;
    // Sci-fi angular chassis
    bx(0.08, 0.13, 0.54, 0, 0, 0, dark, g);
    bx(0.09, 0.14, 0.22, 0, 0.01, -0.05, mat, g);
    // Double energy emitter coils
    cyl(0.024, 0.44, -0.02, 0.025, -0.42, mat, g);
    cyl(0.024, 0.44, 0.02, 0.025, -0.42, mat, g);
    // Energy core cylinder (pulsing glow cell)
    this.magMesh = cyl(0.042, 0.18, 0, -0.14, -0.06, this.red, g, 'z', 7);
    this.magY = -0.14;
    // Grip & ergonomic stock
    const grip = bx(0.045, 0.15, 0.06, 0, -0.12, 0.12, mat, g);
    grip.rotation.x = 0.32;
    bx(0.065, 0.12, 0.28, 0, -0.02, 0.36, dark, g);
    // Holographic sight ring
    bx(0.02, 0.06, 0.08, 0, 0.1, -0.1, dark, g);
    sph(0.008, 0, 0.11, -0.1, this.red, g, 6);
    // Hands
    hand(mat, 0.01, -0.14, 0.12, g, [0.5, -0.6, 1]);
    this.handL = hand(mat, -0.05, -0.07, -0.3, g, [-0.35, -0.85, 0.9]);
    this.handLPos = this.handL.position.clone();
    // Muzzle & flash
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.025, -0.68);
    g.add(this.muzzle);
    this.ejectPt = new THREE.Object3D();
    this.ejectPt.position.set(0.05, 0.02, 0.02);
    g.add(this.ejectPt);
    this.flash = makeFlash(g, 0, 0.025, -0.68, 1.4);
  }
}
