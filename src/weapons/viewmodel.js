// Base first-person view model: equip/sway/recoil animation shared by every weapon.
import * as THREE from 'three';
import { clamp, damp, Spring3 } from '../util.js';
import { easeOut } from './primitives.js';

export class ViewModel {
  constructor(ctx) {
    this.ctx = ctx; this.root = new THREE.Group(); this.scale = 0.46; this.root.scale.setScalar(this.scale); this.root.visible = false;
    this.basePos = new THREE.Vector3(0.2, -0.17, -0.36); this.baseRot = new THREE.Vector3(0, 0, 0);
    this.aimPos = new THREE.Vector3(0, -0.13, -0.3); this.adsFov = 60; this.isGun = false;
    this.recoil = new Spring3(260, 18); this.recoilRot = new Spring3(220, 16);
    this.swayPos = new THREE.Vector3(); this.swayRot = new THREE.Vector3();
    this.aimAmt = 0; this.sprintAmt = 0; this.equipT = 0;
  }
  setSight(x, y, z, dist) { this.aimPos.set(-x * this.scale, -y * this.scale, -z * this.scale - dist); }
  equip() { this.equipT = 0; this.root.visible = true; if (this.loadedRocket) this.loadedRocket.visible = this.mag > 0; }
  unequip() { this.root.visible = false; }
  animate(dt, st) {
    const lx = clamp(st.lookDelta.x, -0.12, 0.12), ly = clamp(st.lookDelta.y, -0.12, 0.12);
    this.aimAmt = damp(this.aimAmt, st.aim ? 1 : 0, 14, dt); const ia = 1 - this.aimAmt;
    this.swayPos.x = damp(this.swayPos.x, lx * 0.5 * (0.3 + 0.7 * ia), 10, dt); this.swayPos.y = damp(this.swayPos.y, ly * 0.35 * (0.3 + 0.7 * ia), 10, dt);
    this.swayRot.y = damp(this.swayRot.y, lx * 1.4 * ia, 10, dt); this.swayRot.x = damp(this.swayRot.x, ly * 0.9 * ia, 10, dt);
    this.swayRot.z = damp(this.swayRot.z, (-lx * 1.8 - st.strafe * 0.06) * ia, 8, dt);
    const bobX = Math.sin(st.bobPhase) * 0.013 * st.bobAmt * (0.15 + 0.85 * ia), bobY = Math.abs(Math.cos(st.bobPhase)) * 0.013 * st.bobAmt * (0.15 + 0.85 * ia);
    this.sprintAmt = damp(this.sprintAmt, st.sprinting && !st.aim ? 1 : 0, 8, dt);
    this.recoil.update(dt); this.recoilRot.update(dt);
    this.equipT = Math.min(1, this.equipT + dt * 3.2); const eq = 1 - easeOut(this.equipT);
    const p = this.root.position, r = this.root.rotation; const rk = this.recoil.value, rr = this.recoilRot.value; const ads = this.aimAmt;
    p.copy(this.basePos).lerp(this.aimPos, ads);
    p.x += this.swayPos.x + bobX + rk.x * (0.3 + 0.7 * ia) + this.sprintAmt * 0.06;
    p.y += this.swayPos.y + bobY + rk.y * (0.3 + 0.7 * ia) - eq * 0.32 - st.landDip * 0.35 * ia - this.sprintAmt * 0.09;
    p.z += rk.z + this.sprintAmt * 0.05;
    r.set(this.baseRot.x * ia + this.swayRot.x + rr.x - eq * 0.9 + this.sprintAmt * 0.4 + st.landDip * 0.5 * ia,
      this.baseRot.y * ia + this.swayRot.y + rr.y * (0.4 + 0.6 * ia) - this.sprintAmt * 0.55,
      this.baseRot.z * ia + this.swayRot.z + rr.z * (0.3 + 0.7 * ia) + this.sprintAmt * 0.18 + st.slideTilt * 0.4 * ia);
    // once you are properly behind a scope, the gun itself would just block the sight picture
    if (this.scope) this.root.visible = this.aimAmt < 0.8;
    this.update(dt, st);
  }
}
