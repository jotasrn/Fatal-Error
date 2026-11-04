import * as THREE from 'three';
import { Gun } from './gun.js';
import { bx, cyl, sph, hand, makeFlash } from './primitives.js';

export class Sniper extends Gun {
  constructor(ctx) { super(ctx, 'sniper'); this.basePos.set(0.21, -0.19, -0.36); }
  build() {
    const g = this.root, mat = this.mat, dark = this.dark;
    bx(0.085, 0.115, 0.6, 0, 0, 0.05, mat, g);
    cyl(0.024, 1.25, 0, 0.02, -0.92, dark, g); cyl(0.032, 0.16, 0, 0.02, -1.5, dark, g);
    this.magMesh = bx(0.055, 0.16, 0.14, 0, -0.14, -0.06, mat, g); this.magY = -0.14;
    const stock = bx(0.075, 0.13, 0.44, 0, -0.02, 0.5, mat, g); stock.rotation.x = 0.04;
    bx(0.05, 0.14, 0.07, 0, -0.13, 0.2, mat, g).rotation.x = 0.3;
    bx(0.06, 0.05, 0.16, 0, 0.07, 0.42, mat, g);
    // scope: tube, rings, and a red cross the ADS view lines up with
    cyl(0.052, 0.56, 0, 0.135, -0.1, mat, g); cyl(0.066, 0.07, 0, 0.135, -0.36, mat, g); cyl(0.062, 0.07, 0, 0.135, 0.14, mat, g);
    for (const z of [-0.24, 0.02]) { const r = bx(0.03, 0.09, 0.035, 0, 0.085, z, dark, g); }
    const cross = new THREE.Group(); cross.position.set(0, 0.135, -0.38); g.add(cross);
    bx(0.09, 0.006, 0.004, 0, 0, 0, this.red, cross); bx(0.006, 0.09, 0.004, 0, 0, 0, this.red, cross);
    // bolt handle on the right, worked after every shot
    this.boltH = bx(0.026, 0.026, 0.16, 0.07, 0.05, 0.16, dark, g); this.boltZ = 0.16;
    sph(0.032, 0.07, 0.05, 0.24, dark, g, 6);
    // bipod
    const bl = bx(0.02, 0.26, 0.02, -0.07, -0.13, -0.78, dark, g); bl.rotation.z = 0.35;
    const br = bx(0.02, 0.26, 0.02, 0.07, -0.13, -0.78, dark, g); br.rotation.z = -0.35;
    hand(mat, 0.02, -0.16, 0.24, g, [0.5, -0.6, 1]); this.handL = hand(mat, -0.05, -0.09, -0.5, g, [-0.35, -0.9, 0.9]); this.handLPos = this.handL.position.clone();
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.02, -1.6); g.add(this.muzzle);
    this.ejectPt = new THREE.Object3D(); this.ejectPt.position.set(0.06, 0.04, 0.06); g.add(this.ejectPt);
    this.flash = makeFlash(g, 0, 0.02, -1.6, 1);
  }
}
