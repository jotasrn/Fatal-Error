import * as THREE from 'three';
import { Gun } from './gun.js';
import { bx, cyl, sph, frame, hand, makeFlash } from './primitives.js';

export class Rifle extends Gun {
  constructor(ctx) { super(ctx, 'rifle'); }
  build() {
    const g = this.root, mat = this.mat, dark = this.dark;
    bx(0.09, 0.12, 0.5, 0, 0, 0, mat, g); bx(0.075, 0.085, 0.36, 0, 0, -0.42, mat, g);
    cyl(0.018, 0.42, 0, 0.02, -0.75, dark, g);
    this.magMesh = bx(0.06, 0.2, 0.1, 0, -0.16, -0.06, mat, g); this.magMesh.rotation.x = 0.15; this.magY = -0.16;
    bx(0.07, 0.11, 0.3, 0, -0.01, 0.4, mat, g); const grip = bx(0.05, 0.14, 0.06, 0, -0.13, 0.12, mat, g); grip.rotation.x = 0.3;
    // the sight: a single small floating dot, nothing else in the picture
    frame(0.075, 0.07, 0.012, 0.03, 0, 0.12, -0.05, mat, g); bx(0.03, 0.018, 0.05, 0, 0.062, -0.05, dark, g);
    sph(0.0012, 0, 0.12, -0.05, this.red, g, 5);
    hand(mat, 0.02, -0.15, 0.13, g, [0.5, -0.6, 1]); this.handL = hand(mat, -0.05, -0.08, -0.4, g, [-0.35, -0.9, 0.9]); this.handLPos = this.handL.position.clone();
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.02, -0.98); g.add(this.muzzle);
    this.ejectPt = new THREE.Object3D(); this.ejectPt.position.set(0.06, 0.02, 0.02); g.add(this.ejectPt);
    this.flash = makeFlash(g, 0, 0.02, -0.98, 1);
  }
}
