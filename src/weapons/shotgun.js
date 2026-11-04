import * as THREE from 'three';
import { Gun } from './gun.js';
import { bx, cyl, sph, hand, makeFlash } from './primitives.js';

export class Shotgun extends Gun {
  constructor(ctx) { super(ctx, 'shotgun'); this.basePos.set(0.2, -0.19, -0.34); }
  build() {
    const g = this.root, mat = this.mat, dark = this.dark;
    bx(0.09, 0.13, 0.42, 0, 0, 0.05, mat, g); cyl(0.021, 0.92, 0, 0.05, -0.62, dark, g); cyl(0.019, 0.72, 0, -0.02, -0.5, mat, g);
    this.foreEnd = bx(0.078, 0.085, 0.27, 0, 0.01, -0.46, mat, g); this.foreEndZ = -0.46;
    const stock = bx(0.07, 0.12, 0.34, 0, -0.04, 0.42, mat, g); stock.rotation.x = 0.08; const grip = bx(0.05, 0.13, 0.06, 0, -0.13, 0.16, mat, g); grip.rotation.x = 0.35;
    sph(0.013, 0, 0.095, -1.0, this.red, g, 6); bx(0.03, 0.025, 0.02, 0, 0.085, -0.02, dark, g);
    hand(mat, 0.02, -0.16, 0.17, g, [0.5, -0.6, 1]); this.handL = hand(mat, -0.04, -0.06, -0.45, g, [-0.35, -0.9, 0.9]); this.handLPos = this.handL.position.clone();
    this.handL.userData.foreEnd = true;
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.05, -1.09); g.add(this.muzzle);
    this.ejectPt = new THREE.Object3D(); this.ejectPt.position.set(0.06, 0.03, 0.05); g.add(this.ejectPt);
    this.flash = makeFlash(g, 0, 0.05, -1.09, 1);
  }
}
