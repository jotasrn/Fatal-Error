// AI for mounted cavalry, main battle tanks, and armored convoy vehicles.
import * as THREE from 'three';
import { INK } from '../../core/render.js';
import { rand, damp } from '../../core/util.js';
import { audio } from '../../core/audio.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _d = new THREE.Vector3();
const nxOf = (dx, d) => dx / (d || 1), nzOf = (dz, d) => dz / (d || 1);

export const VehicleAIMixin = {
  _thinkCavalry(e, dt, pp, pc, dist, dy, yawTo, P, smart) {
    const T = e.T, b = e.body, ctx = this.ctx;
    e.aimAmt = damp(e.aimAmt, e.los ? 1 : 0, 8, dt);
    e.trampleCd = Math.max(0, (e.trampleCd || 0) - dt);

    if (dist < 2.5 && Math.abs(dy) < 2.2 && e.trampleCd <= 0 && P.takeDamage) {
      e.trampleCd = 1.1;
      P.takeDamage((T.trampleDmg || 26) * this.mods.damage, e.center);
      if (P.knockback) P.knockback(_d.subVectors(P.center, e.center).setY(0.35).normalize(), 11);
      ctx.effects.shakeAmt += 0.35;
      audio.stomp(e.center);
    }

    if (b.onGround && b.hitWall) {
      b.vel.y = 10.5; b.onGround = false;
    }
    if (e.los && dist < T.range) {
      this._shoot(e, dt, pc, P);
      if (dist < 7) {
        const tangX = -nzOf(pp.z - b.pos.z, dist) * e.strafeDir + nxOf(pp.x - b.pos.x, dist) * 0.35;
        const tangZ = nxOf(pp.x - b.pos.x, dist) * e.strafeDir + nzOf(pp.z - b.pos.z, dist) * 0.35;
        this._steer(e, dt, b.pos.x + tangX * 10, b.pos.z + tangZ * 10, T.speed, 48);
      } else {
        this._steer(e, dt, pp.x, pp.z, T.speed * (1 + smart * 0.12), 48);
      }
    } else {
      this._follow(e, dt, pp, T.speed, P);
    }
  },

  _thinkTank(e, dt, pp, pc, dist, dy, yawTo, P, _smart) {
    const T = e.T, b = e.body, ctx = this.ctx;
    e.aimAmt = 1;
    e.crushT = (e.crushT || 0) - dt;
    if (e.crushT <= 0 && Math.hypot(b.vel.x, b.vel.z) > 1.5) {
      e.crushT = 0.25;
      if (ctx.destroyEnvironmentAt) ctx.destroyEnvironmentAt(b.pos, 3.6, b.vel);
    }
    e.trampleCd = Math.max(0, (e.trampleCd || 0) - dt);
    if (dist < 3.2 && Math.abs(dy) < 2.4 && e.trampleCd <= 0 && P.takeDamage) {
      e.trampleCd = 0.9;
      P.takeDamage(35 * this.mods.damage, e.center);
      if (P.knockback) P.knockback(_d.subVectors(P.center, e.center).setY(0.3).normalize(), 13);
      ctx.effects.shakeAmt += 0.5;
      audio.stomp(e.center);
    }

    if (e.los && dist < T.range) {
      if (dist > T.stop) {
        this._follow(e, dt, pp, T.speed, P);
      } else if (dist < T.keep) {
        this._steer(e, dt, b.pos.x - (pp.x - b.pos.x), b.pos.z - (pp.z - b.pos.z), T.speed * 0.6, 24);
      } else {
        b.vel.x = damp(b.vel.x, 0, 5, dt); b.vel.z = damp(b.vel.z, 0, 5, dt);
        e.yawT = yawTo;
      }
      if (T.weapon === 'tank') {
        if (e.cool <= 0) {
          e.cool = rand(T.cool[0], T.cool[1]);
          const muzzle = _v.setFromMatrixPosition(e.tip.matrixWorld);
          const pVel = (P.body && P.body.vel) ? P.body.vel : _v2.set(0, 0, 0);
          const leadT = dist / T.pspeed * 0.75;
          _v3.copy(pc).addScaledVector(pVel, leadT);
          _d.subVectors(_v3, muzzle); const l = _d.length(); _d.divideScalar(Math.max(1, l)); _d.y += l * 0.004; _d.normalize();
          this.projectiles.fire(muzzle, _d, T.pspeed, T.dmg * this.mods.damage, e, INK.ORANGE, 0.18, 1.5, null, 4.5);
          audio.explosion(muzzle);
          ctx.effects.explosion(muzzle, 1.8, INK.ORANGE);
          ctx.effects.shakeAmt += 0.35;
        }
        e.mgCool = (e.mgCool || 0.4) - dt;
        if (e.mgCool <= 0 && dist < 42) {
          e.mgCool = 0.22;
          const muzzle = _v.setFromMatrixPosition(e.tip.matrixWorld);
          this._fireOne(e, muzzle, pc, 0.04, 52, T.mgDmg || 8, 0.045, P);
          audio.enemyShot(e.center);
        }
      } else {
        this._shoot(e, dt, pc, P);
      }
    } else {
      this._follow(e, dt, pp, T.speed, P);
    }
  },
};
