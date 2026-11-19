// Procedural animations for all enemy archetypes (humanoids, titans, cavalry, tanks, flyers, quadrupeds, spiders).
import * as THREE from 'three';
import { clamp, damp, wrapAngle } from '../core/util.js';

const _v = new THREE.Vector3();

export const EnemyAnimMixin = {
  _animateFlyer(e, dt) {
    const J = e.J, b = e.body; e.phase += dt * 14; const flap = Math.sin(e.phase) * 0.35;
    J.wl.rotation.z = flap; J.wr.rotation.z = -flap; const roll = clamp(-(b.vel.x * Math.cos(e.yaw) - b.vel.z * Math.sin(e.yaw)) * 0.05, -0.8, 0.8);
    J.body.rotation.z = damp(J.body.rotation.z, roll, 6, dt); J.body.rotation.x = damp(J.body.rotation.x, clamp(-b.vel.y * 0.06, -0.6, 0.6), 6, dt); J.body.position.y = 0.6 + Math.sin(e.t * 3) * 0.1;
    if (e.flyState === 'stunned') J.body.rotation.z += dt * 12;
  },

  _animate(e, dt, pc) {
    const b = e.body, J = e.J, T = e.T; const sp = Math.hypot(b.vel.x, b.vel.z);
    e.walk = damp(e.walk, clamp(sp / 4, 0, 1), 10, dt); const w = e.walk;
    e.phase += dt * (sp * 2.2 + (sp > 0.4 ? 3 : 0)); const s = Math.sin(e.phase), c = Math.cos(e.phase);

    if (T.model === 'tank' || T.model === 'convoy') {
      if (J.headG && pc) {
        _v.subVectors(pc, e.center); const yawTo = Math.atan2(_v.x, _v.z);
        J.headG.rotation.y = wrapAngle(yawTo - e.yaw);
      }
      if (J.torso) J.torso.rotation.x = Math.sin(e.phase * 2) * 0.025 * w;
      return;
    }
    if (T.model === 'cavalry') {
      if (J.legFL && J.legBL) {
        J.legFL.rotation.x = s * 1.05 * w; J.legFR.rotation.x = -s * 1.05 * w;
        J.legBL.rotation.x = -s * 1.05 * w; J.legBR.rotation.x = s * 1.05 * w;
      }
      if (J.hips) J.hips.position.y = 0.92 + Math.abs(c) * 0.09 * w;
      if (J.tail) J.tail.rotation.y = Math.sin(e.t * 9) * 0.4;
      if (J.headG && pc) {
        _v.subVectors(pc, e.center); const yawTo = Math.atan2(_v.x, _v.z);
        J.headG.rotation.y = clamp(wrapAngle(yawTo - e.yaw), -0.95, 0.95);
      }
      return;
    }
    if (T.model === 'quadruped') {
      if (J.legFL && J.legBL) {
        J.legFL.rotation.x = s * 0.9 * w; J.legFR.rotation.x = -s * 0.9 * w;
        J.legBL.rotation.x = -s * 0.9 * w; J.legBR.rotation.x = s * 0.9 * w;
      }
      if (J.tail) J.tail.rotation.y = Math.sin(e.t * 8) * 0.45;
      if (J.headG && pc) {
        _v.subVectors(pc, e.center); const yawTo = Math.atan2(_v.x, _v.z);
        J.headG.rotation.y = clamp(wrapAngle(yawTo - e.yaw), -0.8, 0.8);
      }
      return;
    }
    if (T.model === 'spider') {
      if (J.spiderLegs) {
        for (const leg of J.spiderLegs) {
          const offset = leg.i * 0.78 + (leg.side > 0 ? 0 : Math.PI);
          const wave = Math.sin(e.phase + offset) * w;
          leg.base.rotation.x = wave * 0.4;
          leg.base.rotation.y = leg.side * 0.2 + wave * 0.2;
        }
      }
      if (J.headG && pc) {
        _v.subVectors(pc, e.center); const yawTo = Math.atan2(_v.x, _v.z);
        J.headG.rotation.y = clamp(wrapAngle(yawTo - e.yaw), -0.6, 0.6);
      }
      return;
    }
    if (T.weapon === 'bomb' || T.model === 'blob') {
      if (J.legL && J.legR) { J.legL.rotation.x = s * 0.9 * w; J.legR.rotation.x = -s * 0.9 * w; }
      if (J.shinL && J.shinR) { J.shinL.rotation.x = Math.max(0, c) * 1.1 * w; J.shinR.rotation.x = Math.max(0, -c) * 1.1 * w; }
      if (J.armL && J.armR) { J.armL.rotation.x = -2.4 + Math.sin(e.t * 20) * 0.4 * w; J.armR.rotation.x = -2.4 - Math.sin(e.t * 20) * 0.4 * w; }
      if (J.torso) { J.torso.rotation.z = Math.sin(e.phase) * 0.12 * w; J.torso.rotation.x = -0.15 * w; }
      if (J.spark) J.spark.scale.setScalar(0.7 + Math.random() * 0.8 + (e.fuseT >= 0 ? 1.5 : 0));
      if (J.hips) J.hips.position.y = 0.5 + Math.abs(c) * 0.08 * w;
      if (e.fuseT >= 0) {
        if (J.torso) J.torso.rotation.x = Math.sin(e.t * 40) * 0.15;
        if (J.headG) J.headG.rotation.y = Math.sin(e.t * 30) * 0.3;
      }
      return;
    }

    if (J.legL && J.legR) {
      J.legL.rotation.x = s * 0.9 * w; J.legR.rotation.x = -s * 0.9 * w;
      if (!b.onGround) { J.legL.rotation.x = -0.5; J.legR.rotation.x = 0.6; }
    }
    if (J.shinL && J.shinR) {
      J.shinL.rotation.x = Math.max(0, c) * 1.1 * w; J.shinR.rotation.x = Math.max(0, -c) * 1.1 * w;
      if (!b.onGround) { J.shinL.rotation.x = 1.0; J.shinR.rotation.x = 0.5; }
    }
    const aim = e.aimAmt;
    if (T.weapon === 'blade' || T.weapon === 'flag') {
      const at = e.attackT;
      const wind = at > 0.18 ? clamp((0.55 - at) / 0.37, 0, 1) : 0;
      const strike = at > 0 && at <= 0.18 ? 1 - at / 0.18 : 0;
      if (J.armR) {
        J.armR.rotation.x = -0.8 * (1 - w) - s * 0.9 * w - wind * 2.2 + strike * 1.5;
        J.armR.rotation.z = -0.3 + wind * 0.7 - strike * 0.5;
      }
      if (J.foreR) J.foreR.rotation.x = -0.9 - wind * 0.7 + strike * 0.5;
      if (J.armL) { J.armL.rotation.x = s * 1.1 * w - wind * 0.5; J.armL.rotation.z = 0.35 * w; }
      if (J.foreL) J.foreL.rotation.x = -0.6 * w;
      if (J.torso) {
        J.torso.rotation.x = -0.3 * w + e.flinch * 0.35 - wind * 0.25 + strike * 0.55;
        J.torso.rotation.y = wind * 0.5 - strike * 0.6;
      }
    } else if (T.weapon === 'boss' && T.isTitan) {
      const a = e.bossAtk;
      let raise = 0, slam = 0, chargeLean = 0;
      if (a && (a.kind === 'stomp' || a.kind === 'fissure')) { raise = a.t < 0.65 ? clamp(a.t / 0.55, 0, 1) : 0; slam = a.t >= 0.65 ? 1 : 0; }
      if (a && a.kind === 'boulder') { raise = a.t < 0.55 ? clamp(a.t / 0.45, 0, 1) : 0; }
      if (a && a.kind === 'charge' && a.t >= 0.55 && a.t < 2.1) chargeLean = 1;
      if (J.armR) { J.armR.rotation.x = -0.4 - s * 0.65 * w - raise * 2.4 + slam * 1.1 - chargeLean * 0.8; J.armR.rotation.z = -0.35 - chargeLean * 0.3; }
      if (J.foreR) J.foreR.rotation.x = -0.65 - raise * 0.4 - chargeLean * 0.6;
      if (J.armL) { J.armL.rotation.x = s * 0.65 * w - raise * 2.2 + slam * 1.0 - chargeLean * 1.1; J.armL.rotation.z = 0.35 + chargeLean * 0.3; }
      if (J.foreL) J.foreL.rotation.x = -0.55 - chargeLean * 0.7;
      if (J.torso) J.torso.rotation.x = -0.15 * w + e.flinch * 0.15 - raise * 0.3 + slam * 0.55 - chargeLean * 0.45;
    } else {
      if (J.armR) { J.armR.rotation.x = (-s * 1.0 * w) * (1 - aim) + (-1.35 + e.flinch * 0.35) * aim; J.armR.rotation.z = -0.25 * (1 - aim); }
      if (J.foreR) J.foreR.rotation.x = -0.35 * (1 - aim) + -0.2 * aim;
      if (T.shield) {
        if (J.armL) { J.armL.rotation.x = -1.2; J.armL.rotation.y = 0.3; }
        if (J.foreL) J.foreL.rotation.x = -0.9;
      } else {
        if (J.armL) { J.armL.rotation.x = (s * 1.0 * w) * (1 - aim) + -1.2 * aim; J.armL.rotation.y = 0.6 * aim; J.armL.rotation.z = 0.25 * (1 - aim); }
        if (J.foreL) J.foreL.rotation.x = -0.4 * (1 - aim) + -0.5 * aim;
      }
      if (J.torso) { J.torso.rotation.x = -0.22 * w + e.flinch * 0.4; J.torso.rotation.y = -0.35 * aim; J.torso.rotation.z = Math.sin(e.phase) * 0.05 * w; }
    }
    if (J.hips) J.hips.position.y = 0.86 + Math.abs(c) * 0.07 * w + (b.onGround ? 0 : -0.05);
    if (J.headG && pc) {
      _v.subVectors(pc, e.center); const yawTo = Math.atan2(_v.x, _v.z);
      J.headG.rotation.y = clamp(wrapAngle(yawTo - e.yaw) - ((J.torso && J.torso.rotation.y) || 0), -1.1, 1.1);
      J.headG.rotation.x = clamp(-Math.atan2(_v.y, Math.hypot(_v.x, _v.z)), -0.6, 0.6) * 0.8;
      J.headG.rotation.z = Math.sin(e.phase * 0.5) * 0.06 * w;
    }
    if (e.state === 'stunned') {
      if (J.torso) J.torso.rotation.x = 0.6;
      if (J.armL) J.armL.rotation.x = -2.5;
      if (J.armR) J.armR.rotation.x = -2.5;
      if (J.legL) J.legL.rotation.x = -0.8;
      if (J.legR) J.legR.rotation.x = 0.9;
    }
  },
};
