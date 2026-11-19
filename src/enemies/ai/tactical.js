// Tactical infantry & flyer AI: steering, A* flanking, verticality/grappling, flush grenades, predictive shooting, snipers, and mortars.
import * as THREE from 'three';
import { makeInkMaterial, setFill, INK } from '../../core/render.js';
import { SEE_THROUGH } from '../../core/physics.js';
import { rand, clamp, damp, alignYAxis } from '../../core/util.js';
import { audio } from '../../core/audio.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _d = new THREE.Vector3();
const _eye = new THREE.Vector3(), _goal = new THREE.Vector3();
const nxOf = (dx, d) => dx / (d || 1), nzOf = (dz, d) => dz / (d || 1);

export const TacticalAIMixin = {
  _steer(e, dt, gx, gz, speed, accel) {
    const b = e.body; let dx = gx - b.pos.x, dz = gz - b.pos.z; const l = Math.hypot(dx, dz);
    if (l < 1e-4) { b.vel.x = damp(b.vel.x, 0, 8, dt); b.vel.z = damp(b.vel.z, 0, 8, dt); return; }
    dx /= l; dz /= l; const a = (b.onGround ? accel : accel * 0.35) * dt;
    speed *= this.mods.speed * (e.auraSpeed || 1);
    b.vel.x += clamp(dx * speed - b.vel.x, -a, a); b.vel.z += clamp(dz * speed - b.vel.z, -a, a); e.yawT = Math.atan2(dx, dz);
  },
  _groundAhead(e, dx, dz) { _v.set(e.body.pos.x + dx * 0.9, e.body.pos.y + 0.5, e.body.pos.z + dz * 0.9); return this.ctx.world.raycast(_v, _d.set(0, -1, 0), 3.5) !== null; },
  _approachPoint(e, dt, target, out, P = null) {
    e.appT -= dt;
    if (e.appT <= 0) {
      e.appT = rand(2.0, 4.2);
      const melee = e.T.weapon === 'blade' || e.T.weapon === 'bomb';
      if (e.role === 'flanker' && P && P.forward) {
        const backAng = Math.atan2(-P.forward.x, -P.forward.z);
        e.appAng = backAng + (e.id % 2 ? 1 : -1) * rand(0.45, 1.35);
      } else {
        e.appAng += rand(-0.7, 0.7);
      }
      e.appR = melee ? rand(2.2, 5.0) : rand(5.0, 11.0);
    }
    const d = Math.hypot(target.x - e.body.pos.x, target.z - e.body.pos.z);
    let r = clamp(d * 0.58, Math.min(2.2, d * 0.9), e.appR);
    if (Math.abs(target.y - e.body.pos.y) > 1.5) r = Math.min(r, 1.1);
    return out.set(target.x + Math.cos(e.appAng) * r, target.y, target.z + Math.sin(e.appAng) * r);
  },
  _follow(e, dt, target, speed, P = null) {
    const nav = this.ctx.nav, b = e.body; e.pathT -= dt;
    target = this._approachPoint(e, dt, target, _goal, P);
    const stale = !e.path || e.pathI >= e.path.length || (e.pathT <= 0 && (!e.pathGoal || e.pathGoal.distanceTo(target) > 3.5 || !e.path.complete));
    if (stale && (e.pathT <= 0 || !e.path) && this._pathsLeft > 0) {
      this._pathsLeft--;
      e.pathT = 0.7 + rand(0, 0.5); const p = nav.findPath(b.pos, target);
      if (p && p.length) { e.path = p; e.pathI = 0; e.pathGoal = target.clone(); while (e.pathI < p.length - 1 && Math.hypot(p[e.pathI].x - b.pos.x, p[e.pathI].z - b.pos.z) < 0.7 && Math.abs(p[e.pathI].y - b.pos.y) < 1) e.pathI++; }
    }
    let goal = null;
    if (e.path && e.pathI < e.path.length) { const nd = e.path[e.pathI]; const hd = Math.hypot(nd.x - b.pos.x, nd.z - b.pos.z); if (hd < 0.5 && Math.abs(nd.y - b.pos.y) < 1.2) { e.pathI++; if (e.pathI < e.path.length) goal = e.path[e.pathI]; } else goal = nd; }
    if (!goal) goal = target;
    this._steer(e, dt, goal.x, goal.z, speed, 42);
    const hd = Math.hypot(goal.x - b.pos.x, goal.z - b.pos.z);
    if (b.onGround) {
      if (goal.y > b.pos.y + 0.6 && hd < 1.9) { b.vel.y = 9.5; b.onGround = false; }
      else if (b.hitWall) { e.stuckT += dt; if (e.stuckT > 0.3 && e.stuckT < 0.36) e.pathT = 0; if (e.stuckT > 0.75) { b.vel.y = 9.5; b.onGround = false; e.stuckT = 0; e.pathT = 0; } }
      else e.stuckT = 0;
    }
  },
  _wander(e, dt) { e.body.vel.x = damp(e.body.vel.x, 0, 6, dt); e.body.vel.z = damp(e.body.vel.z, 0, 6, dt); e.aimAmt = damp(e.aimAmt, 0, 5, dt); },

  _tryVerticalLeap(e, dt, pp, dist, dy) {
    e.grappleCd = Math.max(0, (e.grappleCd || 0) - dt);
    if (!e.T.canGrapple || e.grappleCd > 0 || !e.body.onGround) return false;
    const shouldGrappleUp = dy > 2.4 && dy < 24 && dist < 32;
    const shouldGrappleGap = (e.T.isStalker || e.T.isLazaro) && dist > 11 && dist < 26 && e.los;
    if (!shouldGrappleUp && !shouldGrappleGap) return false;

    e.grappleCd = e.T.isLazaro ? rand(2.6, 4.2) : rand(4.0, 6.8);
    const b = e.body, ctx = this.ctx;
    const anchor = new THREE.Vector3(pp.x, pp.y + 1.8, pp.z);
    ctx.effects.tracer(e.center, anchor, INK.BLACK, 0.032, 0.32);
    ctx.effects.strokeBurst(e.center, INK.ORANGE, 12, 6, { life: 0.25, size: 0.035 });
    audio.grappleFire();
    const flightT = clamp(dist / 22, 0.45, 1.15);
    b.vel.x = (pp.x - b.pos.x) / flightT;
    b.vel.z = (pp.z - b.pos.z) / flightT;
    b.vel.y = Math.max(10.5, (dy + 2.2) / flightT + 0.5 * 24 * flightT);
    b.onGround = false;
    return true;
  },

  _tryThrowFlushGrenade(e, dt, pp, pc, dist, dy, smart) {
    e.nadeCd = Math.max(0, (e.nadeCd || 0) - dt);
    if (!e.T.canGrenade || e.nadeCd > 0 || dist < 7 || dist > 38 || smart < 0.2) return false;
    const pSpd = (e.target && e.target.body && e.target.body.vel) ? Math.hypot(e.target.body.vel.x, e.target.body.vel.z) : 0;
    if (e.los && dy < 1.8 && pSpd > 4.5 && Math.random() < 0.65) return false;
    e.nadeCd = rand(5.5, 9.0) * (1.25 - Math.min(0.45, smart * 0.35));
    const muzzle = _v.setFromMatrixPosition((e.tip || e.parts.torso || e.root).matrixWorld);
    const grav = 14.0;
    const flightT = clamp(dist / 18, 0.65, 1.65);
    const vx = (pp.x - muzzle.x) / flightT + rand(-0.8, 0.8);
    const vz = (pp.z - muzzle.z) / flightT + rand(-0.8, 0.8);
    const vy = (pp.y + 0.6 - muzzle.y + 0.5 * grav * flightT * flightT) / flightT;
    _d.set(vx, vy, vz);
    const spd = _d.length();
    _d.divideScalar(Math.max(1, spd));
    this.projectiles.fire(muzzle, _d, spd, (e.T.dmg || 14) * 1.45 * this.mods.damage * (e.auraDmg || 1), e, INK.ORANGE, 0.14, 1.25, null, grav);
    audio.lunge(e.center);
    return true;
  },

  _think(e, dt, pp, pc, P) {
    const T = e.T, b = e.body, ctx = this.ctx;
    const dx = pp.x - b.pos.x, dz = pp.z - b.pos.z; const dist = Math.hypot(dx, dz); const dy = pp.y - b.pos.y;
    e.losT -= dt; if (e.losT <= 0) { e.losT = 0.11 + rand(0, 0.08); e.los = P.isProp ? dist < 8 : ctx.world.hasLineOfSight(this.eye(e, _eye), pc, SEE_THROUGH); }
    e.cool -= dt; const yawTo = Math.atan2(dx, dz);
    if (T.isPet) { this._thinkPet(e, dt, pp, dist, dx, dz); return; }
    if (T.isCivilian && !e.enraged) { this._thinkCivilian(e, dt, dist, dx, dz, P); return; }
    if (T.weapon === 'bomb') {
      if (e.fuseT >= 0) { e.fuseT -= dt; b.vel.x = damp(b.vel.x, 0, 4, dt); b.vel.z = damp(b.vel.z, 0, 4, dt); e.yawT = yawTo; e.flashT = 0.02; if (!e.flashOn) { setFill(e.mat, true); e.flashOn = true; } if (Math.floor(e.fuseT * 8) !== Math.floor((e.fuseT + dt) * 8)) audio.fuse(e.center); if (e.fuseT <= 0) this._explodeBomber(e); return; }
      if (dist < T.fuseRange && Math.abs(dy) < 2.2 && e.los) { e.fuseT = T.fuse; audio.fuse(e.center); return; }
      if (e.los && dist < 12 && Math.abs(dy) < 1.5) this._steer(e, dt, pp.x, pp.z, T.speed, 45); else this._follow(e, dt, pp, T.speed, P);
      return;
    }

    const wave = (ctx.game && ctx.game.wave) || 1;
    const smart = clamp((wave - 1) / 8, 0.15, 1.35) + (e.elite ? 0.35 : 0);

    if (e.elite === 'vampiric') {
      e.poolT = (e.poolT || 0) - dt;
      if (e.poolT <= 0 && b.onGround) { e.poolT = 1.8; ctx.effects.bloodPool(b.pos, 1.3, INK.PINK); }
    }
    if (T.isEngineer) {
      e.droneCd = Math.max(0, (e.droneCd || 0) - dt);
      if (e.droneCd <= 0 && dist < 52) {
        e.droneCd = rand(7.0, 10.5);
        const liveFlyers = this.enemies.filter((x) => x.alive && x.T.flying).length;
        if (liveFlyers < 8) { const sp = this.spawn('flyer', e.center.clone().add(_v.set(rand(-1.2, 1.2), 1.6, rand(-1.2, 1.2)))); sp.state = 'hunt'; sp.root.scale.setScalar(sp.T.scale); }
      }
    }

    e.dodgeCool = Math.max(0, (e.dodgeCool || 0) - dt);
    if (!T.isTank && !T.isTitan && e.los && dist < 42 && b.onGround && e.dodgeCool <= 0 && P.forward && P.eye) {
      _v.subVectors(e.center, P.eye).normalize();
      if (_v.dot(P.forward) > 0.945) {
        e.dodgeCool = rand(1.2, 2.3) / Math.max(0.7, smart);
        e.strafeDir = Math.random() < 0.5 ? 1 : -1;
        const juke = (7.5 + smart * 4.5) * this.mods.speed;
        const lnx = -dz / (dist || 1) * e.strafeDir, lnz = dx / (dist || 1) * e.strafeDir;
        if (this._groundAhead(e, lnx, lnz)) {
          b.vel.x += lnx * juke; b.vel.z += lnz * juke;
          if (smart > 0.4 && Math.random() < 0.5) { b.vel.y = 6.2; b.onGround = false; }
        }
      }
    }

    if (this._tryVerticalLeap(e, dt, pp, dist, dy)) return;
    if (T.weapon === 'cavalry') { this._thinkCavalry(e, dt, pp, pc, dist, dy, yawTo, P, smart); return; }
    if (T.weapon === 'tank' || T.weapon === 'convoy') { this._thinkTank(e, dt, pp, pc, dist, dy, yawTo, P, smart); return; }
    if (T.weapon === 'boss') { this._thinkBoss(e, dt, pp, pc, dist, dy, yawTo, P); return; }

    if (T.weapon === 'blade' || T.weapon === 'flag') {
      e.aimAmt = damp(e.aimAmt, 0, 8, dt);
      if (T.isStalker && e.los && dist > 6 && dist < 24 && (e.shurikenCd || 0) <= 0) {
        e.shurikenCd = rand(2.0, 3.2);
        const muzzle = _v.setFromMatrixPosition((e.tip || e.parts.torso).matrixWorld);
        this._fireOne(e, muzzle, pc, 0.025, 52, T.dmg * 0.55, 0.045, P);
        audio.katanaSwing();
      }
      e.shurikenCd = Math.max(0, (e.shurikenCd || 0) - dt);
      if (e.backoffT > 0) {
        e.backoffT -= dt; e.yawT = yawTo; const a = 28 * dt;
        b.vel.x += clamp(-nxOf(dx, dist) * T.speed * 0.55 - b.vel.x, -a, a);
        b.vel.z += clamp(-nzOf(dz, dist) * T.speed * 0.55 - b.vel.z, -a, a);
        return;
      }
      if (e.attackT > 0) {
        e.attackT -= dt; b.vel.x = damp(b.vel.x, 0, 8, dt); b.vel.z = damp(b.vel.z, 0, 8, dt); e.yawT = yawTo;
        if (e.attackT < 0.18 && !e.attackHit) {
          e.attackHit = true;
          _v3.setFromMatrixPosition(e.tip.matrixWorld);
          for (let i = 0; i < 5; i++) {
            const a0 = -0.9 + i * 0.45, a1 = a0 + 0.45;
            _v.set(e.center.x + Math.sin(e.yaw + a0) * 1.5, e.center.y + 0.5 - i * 0.18, e.center.z + Math.cos(e.yaw + a0) * 1.5);
            _v2.set(e.center.x + Math.sin(e.yaw + a1) * 1.5, e.center.y + 0.5 - (i + 1) * 0.18, e.center.z + Math.cos(e.yaw + a1) * 1.5);
            ctx.effects.tracer(_v, _v2, INK.RED, 0.025, 0.16);
          }
          if (dist < T.reach && Math.abs(dy) < 2.1) {
            if (P.tryBlockMelee && P.tryBlockMelee(e)) { e.state = 'stunned'; e.t = 0; e.stunDur = 1.1; b.vel.set(-dx / dist * 7, 3.5, -dz / dist * 7); }
            else if (P.takeDamage) {
              const hitDmg = T.dmg * this.mods.damage * (e.auraDmg || 1);
              P.takeDamage(hitDmg, e.center);
              if (e.elite === 'vampiric') e.hp = Math.min(e.maxHp, e.hp + hitDmg * 1.5);
            }
          } else audio.katanaSwing();
          e.cool = rand(T.cool[0], T.cool[1]); e.backoffT = rand(0.35, 0.65);
        }
        return;
      }
      if (dist < T.lunge && Math.abs(dy) < 2.1 && e.cool <= 0 && e.los) {
        e.attackT = 0.5; e.attackHit = false; audio.lunge(e.center);
        b.vel.x += (dx / dist) * (3.2 + smart * 2.0); b.vel.z += (dz / dist) * (3.2 + smart * 2.0);
        return;
      }
      if (e.los && dist < 11 && Math.abs(dy) < 1.8) {
        if (dist < T.standoff && Math.abs(dy) < 1.2) {
          const a = 24 * dt;
          b.vel.x += clamp(-(dx / dist) * T.speed * 0.4 - b.vel.x, -a, a);
          b.vel.z += clamp(-(dz / dist) * T.speed * 0.4 - b.vel.z, -a, a);
          e.yawT = yawTo;
        } else {
          const g = dist > 4.5 ? this._approachPoint(e, dt, pp, _goal, P) : pp;
          this._steer(e, dt, g.x, g.z, T.speed * (1 + smart * 0.18), 48);
          if (b.onGround && b.hitWall) { e.stuckT += dt; if (e.stuckT > 0.22) { b.vel.y = 9.5; e.stuckT = 0; } }
        }
      } else this._follow(e, dt, pp, T.speed * (1 + smart * 0.15), P);
      return;
    }

    this._tryThrowFlushGrenade(e, dt, pp, pc, dist, dy, smart);

    const inRange = e.los && dist < T.range;
    if (inRange) {
      e.aimAmt = damp(e.aimAmt, 1, 8, dt); e.yawT = yawTo;
      let mx = 0, mz = 0; const nx = dx / dist, nz = dz / dist;
      const lowHp = e.hp < e.maxHp * 0.45 && smart > 0.2;
      if (T.stationary) { mx = 0; mz = 0; }
      else if (dist > T.stop * e.keepMul) { this._follow(e, dt, pp, T.speed * 0.9, P); this._shoot(e, dt, pc, P); e.yawT = yawTo; return; }
      else if (Math.abs(dy) > 1.4) { this._follow(e, dt, pp, T.speed * 0.9, P); this._shoot(e, dt, pc, P); e.yawT = yawTo; return; }
      else if (dist < T.keep * e.keepMul || (lowHp && dist < T.range * 0.72)) { mx = -nx + (-nz * e.strafeDir * 0.85); mz = -nz + (nx * e.strafeDir * 0.85); }
      else if (dist > T.range * 0.7 && T.weapon === 'shotgun') { mx = nx + (-nz * e.strafeDir * 0.45); mz = nz + (nx * e.strafeDir * 0.45); }
      else {
        e.strafeT -= dt;
        if (e.strafeT <= 0) { e.strafeT = rand(0.5, 1.4) / Math.max(0.8, smart); e.strafeDir *= -1; }
        mx = -nz * e.strafeDir; mz = nx * e.strafeDir;
      }
      const spd = (T.weapon === 'shotgun' ? T.speed : T.speed * (0.6 + smart * 0.3)) * (lowHp ? 1.3 : 1);
      if ((mx || mz) && this._groundAhead(e, mx, mz)) { const a = (32 + smart * 16) * dt; b.vel.x += clamp(mx * spd - b.vel.x, -a, a); b.vel.z += clamp(mz * spd - b.vel.z, -a, a); }
      else { b.vel.x = damp(b.vel.x, 0, 8, dt); b.vel.z = damp(b.vel.z, 0, 8, dt); }
      this._shoot(e, dt, pc, P);
    } else {
      e.aimAmt = damp(e.aimAmt, 0, 5, dt); e.burstLeft = 0; e.aimT = 0; e.aimPoint = null; this._hideLaser(e);
      if (T.stationary && e.t < 5) { b.vel.x = damp(b.vel.x, 0, 8, dt); b.vel.z = damp(b.vel.z, 0, 8, dt); e.yawT = yawTo; }
      else this._follow(e, dt, pp, T.speed * (1 + smart * 0.14), P);
      if (e.los) e.yawT = yawTo;
    }
  },

  _thinkFlyer(e, dt, pc, P) {
    const T = e.T, b = e.body, ctx = this.ctx; e.flyT -= dt; e.cool -= dt;
    const want = _v2;
    if (e.flyState === 'stunned') { b.vel.y -= 20 * dt; if (b.onGround || e.t > 2.2) { e.flyState = 'climb'; e.flyT = 1.2; e.state = 'hunt'; } }
    else if (e.flyState === 'orbit') {
      const ang = Math.atan2(b.pos.x - pc.x, b.pos.z - pc.z) + e.orbitDir * 0.45; const rad = 11;
      want.set(pc.x + Math.sin(ang) * rad, pc.y + 6 + Math.sin(e.t * 1.3) * 1.5, pc.z + Math.cos(ang) * rad);
      this._flyTo(e, want, T.speed, 22, dt);
      if (e.cool <= 0 && P.alive && ctx.world.hasLineOfSight(e.center, pc, SEE_THROUGH)) { e.flyState = 'dive'; e.flyT = 1.6; e.diveHit = false; audio.flyerDive(e.center); }
      if (Math.random() < dt * 1.5) audio.flyerBuzz(e.center);
    } else if (e.flyState === 'dive') {
      want.copy(pc); this._flyTo(e, want, 18, 30, dt);
      const d = e.center.distanceTo(pc);
      if (d < 1.45 && !e.diveHit) { e.diveHit = true; if (P.tryBlockMelee && P.tryBlockMelee(e)) { e.flyState = 'stunned'; e.state = 'stunned'; e.t = 0; b.vel.set(-b.vel.x * 0.3, -3, -b.vel.z * 0.3); } else if (P.alive) { P.takeDamage(T.dmg * this.mods.damage, e.center); P.knockback(_d.copy(b.vel).normalize(), 3.5); } }
      if (e.flyT <= 0 || e.diveHit || b.hitWall) { e.flyState = 'climb'; e.flyT = 1.1; e.cool = rand(T.cool[0], T.cool[1]); }
    } else {
      want.set(pc.x + (b.pos.x - pc.x) * 1.5, pc.y + 8, pc.z + (b.pos.z - pc.z) * 1.5); this._flyTo(e, want, T.speed, 18, dt);
      if (e.flyT <= 0) e.flyState = 'orbit';
    }
    const sp = b.vel.length();
    if (sp > 0.5) { _d.copy(b.vel).divideScalar(sp); const h = ctx.world.raycast(e.center, _d, 3.5); if (h) { b.vel.addScaledVector(h.normal, 14 * dt); b.vel.y += 12 * dt; } }
    const g = ctx.world.raycast(e.center, _v3.set(0, -1, 0), 2.5); if (g) b.vel.y += 12 * dt;
    _d.copy(b.vel); if (_d.lengthSq() > 0.1) e.yawT = Math.atan2(_d.x, _d.z);
  },
  _flyTo(e, target, speed, accel, dt) { const b = e.body; _d.subVectors(target, b.pos); const l = _d.length(); if (l < 0.3) { b.vel.multiplyScalar(Math.max(0, 1 - 4 * dt)); return; } _d.divideScalar(l).multiplyScalar(speed * this.mods.speed); _v3.subVectors(_d, b.vel); const m = _v3.length(); if (m > accel * dt) _v3.multiplyScalar(accel * dt / m); b.vel.add(_v3); },

  _shoot(e, dt, pc, P) {
    const T = e.T, ctx = this.ctx; const muzzle = _v.setFromMatrixPosition(e.tip.matrixWorld);
    const rateMul = (e.elite === 'berserker' ? 1.5 : 1) * (e.auraDmg || 1);
    if (T.weapon === 'sniper') {
      if (e.cool > 0) { this._hideLaser(e); return; }
      e.aimT += dt * rateMul;
      const pVel = (P.body && P.body.vel) ? P.body.vel : _v2.set(0, 0, 0);
      const leadTime = muzzle.distanceTo(pc) / Math.max(1, T.pspeed || 150);
      const isElite = (T.name && T.name.includes('Precisão')) || T.spread < 0.002 || !!e.elite;
      const leadFactor = isElite ? 0.96 : 0.72;
      const targetPredict = _v3.copy(pc).addScaledVector(pVel, leadTime * leadFactor);
      const trackRate = isElite ? 9.5 : 6.5;
      if (!e.aimPoint) e.aimPoint = targetPredict.clone();
      else e.aimPoint.lerp(targetPredict, 1 - Math.exp(-trackRate * dt));
      this._showLaser(e, muzzle, e.aimPoint, clamp(e.aimT / T.aimTime, 0, 1));
      if (e.aimT > T.aimTime * 0.45 && !e.aimWarned) { e.aimWarned = true; audio.sniperAim(e.center); }
      if (e.aimT >= T.aimTime) {
        e.aimT = 0; e.aimWarned = false; e.cool = rand(T.cool[0], T.cool[1]) / rateMul;
        this._fireOne(e, muzzle, e.aimPoint, T.spread, T.pspeed, T.dmg * (e.auraDmg || 1), isElite ? 0.09 : 0.07, P);
        audio.sniperShot(e.center); this._hideLaser(e); e.aimPoint = null;
      }
      return;
    }
    if (e.burstLeft > 0) {
      e.burstT -= dt * rateMul;
      if (e.burstT <= 0) {
        e.burstT = T.burstInt; e.burstLeft--;
        if (T.weapon === 'mortar') this._fireMortar(e, muzzle, pc, P);
        else { this._fireOne(e, muzzle, pc, T.spread, T.pspeed, T.dmg * (e.auraDmg || 1), 0.045, P); audio.enemyShot(e.center); }
        if (e.burstLeft === 0) e.cool = rand(T.cool[0], T.cool[1]) / rateMul;
      }
      return;
    }
    if (e.cool <= 0) {
      if (T.weapon === 'shotgun') {
        for (let i = 0; i < T.pellets; i++) this._fireOne(e, muzzle, pc, T.spread, T.pspeed * rand(0.85, 1.1), T.dmg * (e.auraDmg || 1), 0.05, P);
        audio.shotgun(e.center); e.cool = rand(T.cool[0], T.cool[1]) / rateMul;
        ctx.effects.strokeBurst(muzzle, INK.ORANGE, 8, 5, { life: 0.1, size: 0.04 });
      } else if (T.weapon === 'bazooka') {
        const pVel = (P.body && P.body.vel) ? P.body.vel : _v2.set(0, 0, 0);
        const leadT = muzzle.distanceTo(pc) / Math.max(12, T.pspeed) * 0.65;
        _v3.copy(pc).addScaledVector(pVel, leadT);
        _d.subVectors(_v3, muzzle); const l = _d.length(); _d.divideScalar(Math.max(1, l)); _d.y += l * 0.008; _d.normalize();
        this.projectiles.fire(muzzle, _d, T.pspeed, T.dmg * this.mods.damage * (e.auraDmg || 1), e, INK.ORANGE, 0.12, 1.2);
        audio.explosion(muzzle); ctx.effects.strokeBurst(muzzle, INK.ORANGE, 10, 6, { life: 0.16, size: 0.045 });
        e.cool = rand(T.cool[0], T.cool[1]) / rateMul;
      } else { e.burstLeft = T.burst || 3; e.burstT = 0; }
    }
  },
  _fireMortar(e, muzzle, pc, P) {
    const T = e.T;
    const pVel = (P.body && P.body.vel) ? P.body.vel : _v2.set(0, 0, 0);
    const dist = muzzle.distanceTo(pc);
    const grav = 13.5, flightT = clamp(dist / 22, 0.65, 1.75);
    const tx = pc.x + pVel.x * flightT * 0.65 + rand(-1.2, 1.2);
    const tz = pc.z + pVel.z * flightT * 0.65 + rand(-1.2, 1.2);
    _d.set((tx - muzzle.x) / flightT, (pc.y - muzzle.y + 0.5 * grav * flightT * flightT) / flightT, (tz - muzzle.z) / flightT);
    const spd = _d.length(); _d.divideScalar(Math.max(1, spd));
    this.projectiles.fire(muzzle, _d, spd, T.dmg * this.mods.damage * (e.auraDmg || 1), e, INK.ORANGE, 0.15, 1.25, null, grav);
    audio.explosion(muzzle);
  },
  _showLaser(e, from, to, charge) {
    if (!e.laser) {
      e.laser = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 5), makeInkMaterial({ ink: INK.RED, fill: true }));
      e.laser.frustumCulled = false; this.ctx.scene.add(e.laser);
    }
    e.laser.visible = true;
    const d = _v2.subVectors(to, from); const len = d.length();
    if (len < 2) { e.laser.visible = false; return; }
    _v3.copy(from).addScaledVector(d, 1 - 1.6 / len);
    alignYAxis(e.laser, from, _v3, 0.006 + 0.012 * charge * charge);
  },
  _hideLaser(e) { if (e.laser) e.laser.visible = false; },
  _removeLaser(e) { if (e.laser) { this.ctx.scene.remove(e.laser); e.laser.geometry.dispose(); e.laser = null; } },
  _fireOne(e, muzzle, pc, spread, speed, dmg, thick, P = this.ctx.player) {
    const wave = (this.ctx.game && this.ctx.game.wave) || 1;
    const smart = clamp((wave - 1) / 8, 0.2, 1.25) + (e.elite ? 0.25 : 0);
    const pVel = (P && P.body && P.body.vel) ? P.body.vel : null;
    if (pVel && e.T.weapon !== 'sniper') {
      const leadT = muzzle.distanceTo(pc) / Math.max(12, speed || 36) * Math.min(0.92, smart * 0.68);
      _v3.copy(pc).addScaledVector(pVel, leadT);
      _d.subVectors(_v3, muzzle);
    } else _d.subVectors(pc, muzzle);
    _d.y += rand(-0.15, 0.22); _d.normalize();
    const pSpd = pVel ? Math.hypot(pVel.x, pVel.z) : (P.speed || 0);
    const sp = spread * (1 + pSpd * 0.035) * Math.max(0.45, 1 - smart * 0.32);
    _d.x += rand(-sp, sp); _d.y += rand(-sp, sp); _d.z += rand(-sp, sp); _d.normalize();
    const pInk = e.T.weapon === 'laser' ? INK.ORANGE : INK.RED;
    this.projectiles.fire(muzzle, _d, speed, dmg * this.mods.damage, e, pInk, e.T.weapon === 'laser' ? 0.06 : thick);
    this.ctx.effects.strokeBurst(muzzle, INK.ORANGE, 4, 4, { life: 0.07, size: 0.03 });
  },
};
