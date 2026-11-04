import * as THREE from 'three';
import { TAU } from '../util.js';
import { Gun } from './gun.js';
import { bx, cyl, hand, makeFlash } from './primitives.js';

export class Revolver extends Gun {
  constructor(ctx) { super(ctx, 'revolver'); this.basePos.set(0.19, -0.2, -0.3); }
  build() {
    const g = this.root, mat = this.mat, dark = this.dark;
    bx(0.045, 0.09, 0.2, 0, 0, 0, mat, g); cyl(0.02, 0.3, 0, 0.035, -0.24, dark, g); bx(0.03, 0.03, 0.26, 0, 0.005, -0.22, mat, g);
    this.cylGroup = new THREE.Group(); this.cylGroup.position.set(0, 0.0, -0.02); g.add(this.cylGroup);
    const c = cyl(0.05, 0.11, 0, 0, 0, mat, this.cylGroup, 'z', 6); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; cyl(0.012, 0.115, Math.cos(a) * 0.032, Math.sin(a) * 0.032, 0, dark, this.cylGroup, 'z', 5); }
    const grip = bx(0.045, 0.14, 0.055, 0, -0.1, 0.07, dark, g); grip.rotation.x = 0.4; bx(0.02, 0.045, 0.035, 0, 0.05, 0.1, mat, g).rotation.x = -0.4;
    bx(0.01, 0.03, 0.02, 0, 0.075, -0.34, this.red, g); bx(0.012, 0.025, 0.015, -0.014, 0.06, 0.08, mat, g); bx(0.012, 0.025, 0.015, 0.014, 0.06, 0.08, mat, g);
    hand(mat, 0.0, -0.13, 0.08, g, [0.45, -0.55, 1]); this.handL = hand(mat, -0.05, -0.17, 0.02, g, [-0.4, -0.7, 1]); this.handLPos = this.handL.position.clone();
    this.muzzle = new THREE.Object3D(); this.muzzle.position.set(0, 0.035, -0.4); g.add(this.muzzle);
    this.ejectPt = new THREE.Object3D(); this.ejectPt.position.set(-0.05, 0.02, 0); g.add(this.ejectPt);
    this.flash = makeFlash(g, 0, 0.035, -0.4, 1);
  }
}
