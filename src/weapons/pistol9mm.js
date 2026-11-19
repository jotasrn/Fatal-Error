import * as THREE from 'three';
import { Gun } from './gun.js';
import { bx, cyl, sph, hand, makeFlash } from './primitives.js';

export class Pistol9mm extends Gun {
  constructor(ctx) {
    super(ctx, 'pistol9mm');
    this.basePos.set(0.18, -0.19, -0.28);
  }
  build() {
    const g = this.root, mat = this.mat, dark = this.dark;
    // Tactical polymer frame & serrated slide
    bx(0.042, 0.068, 0.21, 0, 0.015, -0.04, mat, g);
    bx(0.038, 0.032, 0.19, 0, -0.025, -0.03, dark, g);
    cyl(0.014, 0.23, 0, 0.02, -0.07, dark, g);
    // Tactical underbarrel laser/light module
    bx(0.032, 0.028, 0.075, 0, -0.045, -0.09, dark, g);
    sph(0.008, 0, -0.045, -0.13, this.red, g, 5);
    // Reflex micro red-dot sight
    bx(0.034, 0.032, 0.036, 0, 0.062, 0.03, dark, g);
    sph(0.0035, 0, 0.065, 0.03, this.red, g, 5);
    bx(0.009, 0.022, 0.016, 0, 0.056, -0.135, this.red, g);
    // Grip & detachable magazine
    const grip = bx(0.04, 0.13, 0.052, 0, -0.095, 0.045, dark, g);
    grip.rotation.x = 0.28;
    this.magMesh = bx(0.034, 0.14, 0.044, 0, -0.11, 0.048, mat, g);
    this.magMesh.rotation.x = 0.28;
    this.magY = -0.11;
    // Hands
    hand(mat, 0.0, -0.12, 0.06, g, [0.45, -0.55, 1]);
    this.handL = hand(mat, -0.045, -0.13, 0.03, g, [-0.4, -0.7, 1]);
    this.handLPos = this.handL.position.clone();
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.02, -0.19);
    g.add(this.muzzle);
    this.ejectPt = new THREE.Object3D();
    this.ejectPt.position.set(0.035, 0.035, -0.01);
    g.add(this.ejectPt);
    this.flash = makeFlash(g, 0, 0.02, -0.19, 0.85);
  }
}

