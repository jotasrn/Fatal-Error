import * as THREE from 'three';
import { Gun } from './gun.js';
import { bx, cyl, sph, hand, makeFlash } from './primitives.js';

export class SMG extends Gun {
  constructor(ctx) {
    super(ctx, 'smg');
    this.basePos.set(0.18, -0.19, -0.28);
  }
  build() {
    const g = this.root, mat = this.mat, dark = this.dark;
    // Receiver & barrel shroud
    bx(0.07, 0.11, 0.38, 0, 0, 0, mat, g);
    cyl(0.02, 0.28, 0, 0.015, -0.32, dark, g);
    // Vented barrel shroud
    for (let i = 0; i < 3; i++) {
      bx(0.075, 0.03, 0.04, 0, 0.04, -0.22 - i * 0.06, dark, g);
    }
    // Vertical stick magazine
    this.magMesh = bx(0.048, 0.26, 0.065, 0, -0.18, -0.04, dark, g);
    this.magMesh.rotation.x = 0.12;
    this.magY = -0.18;
    // Pistol grip & rear stock bar
    const grip = bx(0.045, 0.13, 0.055, 0, -0.11, 0.1, mat, g);
    grip.rotation.x = 0.35;
    bx(0.04, 0.06, 0.24, 0, -0.03, 0.28, dark, g);
    // Front vertical foregrip
    bx(0.04, 0.12, 0.05, 0, -0.1, -0.18, dark, g);
    // Sights
    bx(0.01, 0.035, 0.02, 0, 0.075, -0.34, this.red, g);
    bx(0.02, 0.03, 0.02, 0, 0.07, 0.14, dark, g);
    // Doodle hands
    hand(mat, 0.01, -0.13, 0.11, g, [0.45, -0.55, 1]);
    this.handL = hand(mat, -0.04, -0.11, -0.18, g, [-0.35, -0.7, 0.9]);
    this.handLPos = this.handL.position.clone();
    // Muzzle & flash
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.set(0, 0.015, -0.48);
    g.add(this.muzzle);
    this.ejectPt = new THREE.Object3D();
    this.ejectPt.position.set(0.05, 0.02, 0.02);
    g.add(this.ejectPt);
    this.flash = makeFlash(g, 0, 0.015, -0.48, 0.85);
  }
}

