// Multi-phase Boss AI: Lázaro, Titã de Ataque (Eren), Titã Blindado, and O Homem-Bomba.
import * as THREE from 'three';
import { INK } from '../../core/render.js';
import { rand, clamp, damp, TAU } from '../../core/util.js';
import { audio } from '../../core/audio.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _d = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export const BossAIMixin = {
  _thinkBoss(e, dt, pp, pc, dist, dy, yawTo, P) {
    const T = e.T;
    const hpFrac = e.hp / e.maxHp;
    const newPhase = hpFrac <= 0.30 ? 3 : hpFrac <= 0.65 ? 2 : 1;
    if (newPhase > (e.bossPhase || 1)) {
      e.bossPhase = newPhase;
      audio.bossRoar(e.center);
      this.ctx.effects.strokeBurst(e.center, INK.RED, 45, 11, { life: 0.55, size: 0.055 });
      this.ctx.effects.shakeAmt += 0.7;
      if (this.ctx.hud) {
        const phaseMsg = newPhase === 2 ? '🔥 FASE 2 · MODO FÚRIA ATIVADO!' : '⚡ FASE 3 · SOBRECARGA MORTAL!';
        this.ctx.hud.message(T.name, phaseMsg, 3.0);
      }
    }

    if (T.bossKind === 'lazaro') return this._thinkLazaro(e, dt, pp, pc, dist, dy, yawTo, P);
    if (T.bossKind === 'titan_eren') return this._thinkTitanEren(e, dt, pp, pc, dist, dy, yawTo, P);
    if (T.bossKind === 'titan_armored') return this._thinkTitanArmored(e, dt, pp, pc, dist, dy, yawTo, P);
    if (T.bossKind === 'bomber_boss') return this._thinkBomberBoss(e, dt, pp, pc, dist, dy, yawTo, P);
  },

  _triggerLazaroSmokeEscape(e) {
    const ctx = this.ctx, b = e.body;
    ctx.effects.smoke(b.pos.clone().add(_v.set(0, 1, 0)), _up, 12);
    ctx.effects.strokeBurst(e.center, INK.BLACK, 24, 8, { life: 0.4, size: 0.045 });
    audio.dash();
    e.stealthT = 2.6 + (e.bossPhase || 1) * 0.5;
    e.bossAtk = null;
    const escAng = e.yaw + Math.PI + (Math.random() < 0.5 ? 0.85 : -0.85);
    b.vel.x = Math.sin(escAng) * 16;
    b.vel.z = Math.cos(escAng) * 16;
    b.vel.y = 7.5;
    b.onGround = false;
  },

  _thinkLazaro(e, dt, pp, pc, dist, dy, yawTo, P) {
    const T = e.T, b = e.body, ctx = this.ctx;
    const phase = e.bossPhase || 1;
    e.stealthCd = Math.max(0, (e.stealthCd || 0) - dt);
    e.ambushCd = Math.max(0, (e.ambushCd || 0) - dt);
    e.policeRespawnT = (e.policeRespawnT || 12) - dt;
    if (e.policeRespawnT <= 0) {
      e.policeRespawnT = 16;
      this._spawnPoliceTaskForceForLazaro(e);
    }

    if (this._tryVerticalLeap(e, dt, pp, dist, dy)) return;

    if (e.stealthT > 0) {
      e.stealthT -= dt;
      e.root.scale.set(T.scale * 0.88, T.scale * 0.62, T.scale * 0.88);
      const pFwd = (ctx.player && ctx.player.forward) ? ctx.player.forward : _d.set(0, 0, -1);
      const blindX = ctx.player.body.pos.x - pFwd.x * 11 + pFwd.z * e.strafeDir * 9;
      const blindZ = ctx.player.body.pos.z - pFwd.z * 11 - pFwd.x * e.strafeDir * 9;
      this._steer(e, dt, blindX, blindZ, T.speed * 1.55, 58);
      if (e.stealthT <= 0.15) {
        e.root.scale.setScalar(T.scale);
        e.bossAtk = { kind: 'ambush', t: 0, shots: 0, slashed: false };
      }
      return;
    }

    if (e.bossAtk) {
      const a = e.bossAtk; a.t += dt; e.yawT = yawTo;
      if (a.kind === 'ambush') {
        const spd = (17 + phase * 2.5) * this.mods.speed;
        if (a.t < 0.65) {
          this._steer(e, dt, pp.x, pp.z, spd, 65);
          if (a.t > 0.1 + a.shots * 0.08 && a.shots < 4 + phase) {
            const muzzle = _v.setFromMatrixPosition(e.tip.matrixWorld);
            this._fireOne(e, muzzle, pc, 0.025, 54, T.dmg * 0.55, 0.045, P);
            audio.enemyShot(e.center);
            a.shots++;
          }
          if (dist < 3.4 && Math.abs(dy) < 2.2 && !a.slashed) {
            a.slashed = true;
            audio.katanaHit();
            ctx.effects.strokeBurst(e.center, INK.RED, 22, 8, { life: 0.3, size: 0.04 });
            if (P.takeDamage) P.takeDamage(T.dmg * 1.25 * this.mods.damage, e.center);
            if (P.knockback) P.knockback(_d.subVectors(P.center, e.center).setY(0.3).normalize(), 9);
          }
        } else if (a.t < 1.1) {
          this._steer(e, dt, b.pos.x - (pp.x - b.pos.x) * 2, b.pos.z - (pp.z - b.pos.z) * 2, T.speed * 1.4, 55);
        } else {
          e.bossAtk = null;
          e.cool = rand(T.cool[0], T.cool[1]) / (1 + (phase - 1) * 0.2);
        }
        return;
      }
    }

    if (e.stealthCd <= 0 && e.los && ctx.player && ctx.player.forward && ctx.player.eye) {
      _v.subVectors(e.center, ctx.player.eye).normalize();
      if (_v.dot(ctx.player.forward) > 0.94) {
        e.stealthCd = rand(4.5, 7.0) / (1 + (phase - 1) * 0.25);
        this._triggerLazaroSmokeEscape(e);
        return;
      }
    }

    if (e.ambushCd <= 0 && dist < 34) {
      e.ambushCd = rand(4.2, 6.8) / (1 + (phase - 1) * 0.22);
      if (dist > 10 && Math.random() < 0.65) {
        this._triggerLazaroSmokeEscape(e);
      } else {
        e.bossAtk = { kind: 'ambush', t: 0, shots: 0, slashed: false };
      }
      return;
    }

    e.aimAmt = damp(e.aimAmt, e.los ? 1 : 0, 8, dt);
    if (e.los && dist < T.range) {
      e.yawT = yawTo;
      if (e.cool <= 0) {
        e.cool = rand(T.cool[0], T.cool[1]) / (1 + (phase - 1) * 0.2);
        for (let i = 0; i < 3 + phase; i++) {
          setTimeout(() => {
            if (!e.alive || this.mirror) return;
            const mz = _v.setFromMatrixPosition(e.tip.matrixWorld);
            this._fireOne(e, mz, P.center, 0.022, 54, T.dmg * 0.48, 0.045, P);
            audio.enemyShot(e.center);
          }, i * 75);
        }
      }
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafeT = rand(0.4, 1.0); e.strafeDir *= -1; }
      const nx = (pp.x - b.pos.x) / (dist || 1), nz = (pp.z - b.pos.z) / (dist || 1);
      const wantKeep = dist < 12 ? -0.6 : dist > 24 ? 0.5 : 0;
      const mx = nx * wantKeep - nz * e.strafeDir;
      const mz = nz * wantKeep + nx * e.strafeDir;
      this._steer(e, dt, b.pos.x + mx * 10, b.pos.z + mz * 10, T.speed * (1 + (phase - 1) * 0.15), 52);
    } else {
      this._follow(e, dt, pp, T.speed * 1.15, P);
    }
  },

  _thinkTitanEren(e, dt, pp, pc, dist, dy, yawTo, P) {
    const T = e.T, b = e.body, ctx = this.ctx;
    const phase = e.bossPhase || 1;
    const spdMul = 1 + (phase - 1) * 0.22;

    e.stepCrushT = (e.stepCrushT || 0) - dt;
    if (e.stepCrushT <= 0 && Math.hypot(b.vel.x, b.vel.z) > 1.5) {
      e.stepCrushT = 0.45;
      if (ctx.destroyEnvironmentAt) ctx.destroyEnvironmentAt(b.pos, 4.2, b.vel);
      if (dist < 38) ctx.effects.shakeAmt += 0.12;
      audio.stomp(b.pos);
    }
    if (phase >= 2 && Math.random() < dt * 4) {
      ctx.effects.smoke(e.center.clone().add(_v.set(rand(-1, 1), 1.8, rand(-1, 1))), _up, 2);
      if (phase === 3) e.hp = Math.min(e.maxHp, e.hp + 18 * dt);
    }

    if (e.bossAtk) {
      const a = e.bossAtk; a.t += dt; e.yawT = yawTo;
      if (a.kind === 'stomp') {
        b.vel.x = damp(b.vel.x, 0, 5, dt); b.vel.z = damp(b.vel.z, 0, 5, dt);
        if (a.t > 0.65 && !a.done) {
          a.done = true;
          audio.stomp(e.center); audio.bossRoar(e.center);
          ctx.effects.shakeAmt += 1.1;
          const stompR = 9.5 + phase * 1.5;
          ctx.effects.explosion(b.pos.clone().add(_v.set(0, 0.3, 0)), stompR * 0.85, INK.RED);
          if (ctx.destroyEnvironmentAt) ctx.destroyEnvironmentAt(b.pos, stompR);
          for (const t of this.targets()) {
            const dd = Math.hypot(t.body.pos.x - b.pos.x, t.body.pos.z - b.pos.z);
            if (t.alive && dd < stompR && Math.abs(t.body.pos.y - b.pos.y) < 4.5) {
              t.takeDamage(T.dmg * 1.15 * this.mods.damage, e.center);
              t.knockback(_d.subVectors(t.center, e.center).setY(0.45).normalize(), 13);
            }
          }
          this.blastEnemies(b.pos, stompR * 0.8, 90, e);
        }
        if (a.t > 1.2) { e.bossAtk = null; e.cool = rand(T.cool[0], T.cool[1]) / spdMul; }
        return;
      }
      if (a.kind === 'boulder') {
        b.vel.x = damp(b.vel.x, 0, 6, dt); b.vel.z = damp(b.vel.z, 0, 6, dt);
        if (a.t > 0.55 && !a.done) {
          a.done = true;
          if (ctx.destroyEnvironmentAt) ctx.destroyEnvironmentAt(b.pos, 5.0);
          _v.setFromMatrixPosition(e.parts.head.matrixWorld); _v.y += 1.2;
          const pVel = (P.body && P.body.vel) ? P.body.vel : _v2.set(0, 0, 0);
          const leadT = dist / 30 * 0.7;
          _v3.copy(pc).addScaledVector(pVel, leadT);
          _d.subVectors(_v3, _v); const l = _d.length(); _d.divideScalar(Math.max(1, l)); _d.y += l * 0.009; _d.normalize();
          this.projectiles.fire(_v, _d, 30, T.dmg * 1.1, e, INK.BLACK, 0.55, 1.6, null, 7.5);
          if (phase >= 2) {
            for (const s of [-0.16, 0.16]) {
              const dSide = _d.clone().applyAxisAngle(_up, s).normalize();
              this.projectiles.fire(_v, dSide, 28, T.dmg * 0.85, e, INK.ORANGE, 0.42, 1.3, null, 7.5);
            }
          }
          audio.explosion(_v);
        }
        if (a.t > 1.0) { e.bossAtk = null; e.cool = rand(T.cool[0] * 0.65, T.cool[1] * 0.65) / spdMul; }
        return;
      }
      if (a.kind === 'leap_smash') {
        if (a.t < 0.35 && !a.jumped) {
          a.jumped = true;
          audio.bossRoar(e.center);
          const flightT = 0.85;
          b.vel.x = (pp.x - b.pos.x) / flightT;
          b.vel.z = (pp.z - b.pos.z) / flightT;
          b.vel.y = 14.5;
          b.onGround = false;
        } else if (a.jumped && (b.onGround || a.t > 1.25) && !a.done) {
          a.done = true;
          audio.stomp(e.center);
          ctx.effects.shakeAmt += 1.25;
          ctx.effects.explosion(b.pos, 9.5, INK.RED);
          if (ctx.destroyEnvironmentAt) ctx.destroyEnvironmentAt(b.pos, 10.5);
          for (const t of this.targets()) {
            const dd = Math.hypot(t.body.pos.x - b.pos.x, t.body.pos.z - b.pos.z);
            if (t.alive && dd < 10.0) {
              t.takeDamage(T.dmg * 1.3 * this.mods.damage, e.center);
              t.knockback(_d.subVectors(t.center, e.center).setY(0.5).normalize(), 15);
            }
          }
        }
        if (a.t > 1.5) { e.bossAtk = null; e.cool = rand(T.cool[0], T.cool[1]) / spdMul; }
        return;
      }
      return;
    }

    e.aimAmt = damp(e.aimAmt, e.los ? 1 : 0, 6, dt);
    if (e.cool <= 0 && e.los) {
      if (dist < 9.5 && Math.abs(dy) < 4.5) {
        e.bossAtk = { kind: 'stomp', t: 0, done: false };
        audio.bossRoar(e.center);
        return;
      }
      if (phase >= 2 && dist > 11 && dist < 34 && Math.random() < 0.45) {
        e.bossAtk = { kind: 'leap_smash', t: 0, jumped: false, done: false };
        return;
      }
      if (dist < T.range) {
        e.bossAtk = { kind: 'boulder', t: 0, done: false };
        return;
      }
    }
    if (e.los && dist < 18 && Math.abs(dy) < 3) this._steer(e, dt, pp.x, pp.z, T.speed * spdMul, 36);
    else this._follow(e, dt, pp, T.speed * spdMul, P);
    if (e.los) e.yawT = yawTo;
  },

  _thinkTitanArmored(e, dt, pp, pc, dist, dy, yawTo, P) {
    const T = e.T, b = e.body, ctx = this.ctx;
    const phase = e.bossPhase || 1;
    const spdMul = 1 + (phase - 1) * 0.22;
    e.aimAmt = damp(e.aimAmt, 0, 6, dt);

    e.stepCrushT = (e.stepCrushT || 0) - dt;
    if (e.stepCrushT <= 0 && Math.hypot(b.vel.x, b.vel.z) > 1.5) {
      e.stepCrushT = 0.4;
      if (ctx.destroyEnvironmentAt) ctx.destroyEnvironmentAt(b.pos, 4.5, b.vel);
    }

    if (e.bossAtk) {
      const a = e.bossAtk; a.t += dt;
      if (a.kind === 'charge') {
        if (a.t < 0.55) {
          e.yawT = yawTo; b.vel.x = damp(b.vel.x, 0, 8, dt); b.vel.z = damp(b.vel.z, 0, 8, dt);
          if (a.t > 0.4 && !a.dir) {
            const pVel = (P.body && P.body.vel) ? P.body.vel : _v2.set(0, 0, 0);
            const tx = pp.x + pVel.x * 0.45 - b.pos.x;
            const tz = pp.z + pVel.z * 0.45 - b.pos.z;
            a.dir = new THREE.Vector3(tx, 0, tz).normalize();
            audio.bossRoar(e.center);
          }
        } else if (a.t < 2.1) {
          const chargeSpd = (21 + phase * 2.5) * this.mods.speed;
          b.vel.x = a.dir.x * chargeSpd; b.vel.z = a.dir.z * chargeSpd;
          if (ctx.destroyEnvironmentAt) ctx.destroyEnvironmentAt(b.pos, 5.8, a.dir);
          for (const t of this.targets()) {
            if (!t.alive) continue;
            const d = Math.hypot(t.body.pos.x - b.pos.x, t.body.pos.z - b.pos.z);
            if (d < 3.8 && Math.abs(t.body.pos.y - b.pos.y) < 4.2 && !a.hit) {
              a.hit = true;
              t.takeDamage(T.dmg * 1.25 * this.mods.damage, e.center);
              t.knockback(_d.subVectors(t.center, e.center).setY(0.35).normalize(), 16);
              ctx.effects.shakeAmt += 0.8;
            }
          }
          if (Math.floor(a.t * 10) !== Math.floor((a.t - dt) * 10)) {
            ctx.effects.strokeBurst(b.pos.clone().add(_v.set(0, 0.4, 0)), INK.ORANGE, 8, 5, { life: 0.35, size: 0.06 });
            audio.stomp(b.pos);
          }
        } else {
          b.vel.x = damp(b.vel.x, 0, 5, dt); b.vel.z = damp(b.vel.z, 0, 5, dt);
          e.armorBroken = true;
          if (a.t > 2.75) {
            e.armorBroken = false;
            e.bossAtk = null;
            e.cool = rand(T.cool[0], T.cool[1]) / spdMul;
            e.charges = (e.charges || 0) + 1;
          }
        }
        return;
      }
      if (a.kind === 'fissure') {
        e.yawT = yawTo; b.vel.x = damp(b.vel.x, 0, 6, dt); b.vel.z = damp(b.vel.z, 0, 6, dt);
        if (a.t > 0.7 && !a.done) {
          a.done = true;
          audio.stomp(e.center); ctx.effects.shakeAmt += 1.0;
          const dir = new THREE.Vector3(pp.x - b.pos.x, 0, pp.z - b.pos.z).normalize();
          for (let k = 1; k <= 5; k++) {
            const blastPos = b.pos.clone().addScaledVector(dir, k * 4.8);
            setTimeout(() => {
              if (!e.alive || this.mirror) return;
              ctx.effects.explosion(blastPos, 4.5, INK.ORANGE);
              audio.explosion(blastPos);
              if (ctx.destroyEnvironmentAt) ctx.destroyEnvironmentAt(blastPos, 5.2, dir);
              for (const t of this.targets()) {
                if (t.alive && t.body.pos.distanceTo(blastPos) < 4.8) {
                  t.takeDamage(T.dmg * 0.85 * this.mods.damage, blastPos);
                  t.knockback(_up, 9);
                }
              }
            }, (k - 1) * 110);
          }
        }
        if (a.t > 1.45) { e.bossAtk = null; e.cool = rand(T.cool[0], T.cool[1]) / spdMul; }
        return;
      }
      return;
    }

    if (e.cool <= 0 && e.los) {
      if ((e.charges || 0) % 2 === 1 && dist < 28) {
        e.bossAtk = { kind: 'fissure', t: 0, done: false };
        e.charges++;
        return;
      }
      if (dist < T.range && dist > 3.5) {
        e.bossAtk = { kind: 'charge', t: 0, hit: false, dir: null };
        return;
      }
    }
    if (e.los && dist < 18 && Math.abs(dy) < 3) this._steer(e, dt, pp.x, pp.z, T.speed * spdMul, 34);
    else this._follow(e, dt, pp, T.speed * spdMul, P);
    if (e.los) e.yawT = yawTo;
  },

  _thinkBomberBoss(e, dt, pp, pc, dist, dy, yawTo, P) {
    const T = e.T, b = e.body, ctx = this.ctx;
    const phase = e.bossPhase || 1;
    const spdMul = 1 + (phase - 1) * 0.2;
    e.aimAmt = damp(e.aimAmt, e.los ? 1 : 0, 7, dt);

    if (e.bossAtk) {
      const a = e.bossAtk; a.t += dt; e.yawT = yawTo;
      if (a.kind === 'c4_barrage') {
        b.vel.x = damp(b.vel.x, 0, 6, dt); b.vel.z = damp(b.vel.z, 0, 6, dt);
        const totalShots = 4 + phase * 2;
        if (a.t > 0.35 && a.shots < totalShots && a.t > 0.35 + a.shots * 0.11) {
          _v.setFromMatrixPosition(e.parts.torso.matrixWorld); _v.y += 0.6;
          const base = Math.atan2(pp.x - b.pos.x, pp.z - b.pos.z);
          const spreadAng = base + (a.shots - (totalShots - 1) / 2) * 0.18;
          const grav = 11.5;
          const flightT = clamp(dist / 22, 0.55, 1.45);
          const spd = dist / flightT;
          _d.set(Math.sin(spreadAng) * spd, (pp.y + 1.0 - _v.y + 0.5 * grav * flightT * flightT) / flightT, Math.cos(spreadAng) * spd);
          const totalSpd = _d.length();
          _d.divideScalar(Math.max(1, totalSpd));
          this.projectiles.fire(_v, _d, totalSpd, T.dmg * 0.75 * this.mods.damage, e, INK.ORANGE, 0.19, 1.35, null, grav);
          audio.fuse(_v);
          a.shots++;
        }
        if (a.t > 1.5) { e.bossAtk = null; e.cool = rand(T.cool[0], T.cool[1]) / spdMul; e.barrages = (e.barrages || 0) + 1; }
        return;
      }
      if (a.kind === 'vest_blast') {
        if (a.t < 0.95) {
          this._steer(e, dt, pp.x, pp.z, T.speed * 1.65 * spdMul, 58);
          if (Math.floor(a.t * 10) !== Math.floor((a.t - dt) * 10)) {
            audio.fuse(e.center);
            ctx.effects.strokeBurst(e.center, INK.RED, 6, 4, { life: 0.2, size: 0.04 });
          }
        } else if (!a.done) {
          a.done = true;
          const blastR = 8.0 + phase * 1.2;
          ctx.effects.explosion(e.center, blastR * 0.85, INK.ORANGE);
          audio.explosion(e.center);
          ctx.effects.shakeAmt += 1.0;
          if (ctx.destroyEnvironmentAt) ctx.destroyEnvironmentAt(b.pos, blastR);
          for (const t of this.targets()) {
            const dd = t.center.distanceTo(e.center);
            if (t.alive && dd < blastR) {
              t.takeDamage(T.dmg * 1.35 * this.mods.damage * (1 - dd / blastR * 0.5), e.center);
              t.knockback(_d.subVectors(t.center, e.center).setY(0.4).normalize(), 14);
            }
          }
          const liveB = this.enemies.filter((x) => x.alive && x.type === 'bomber').length;
          for (let i = 0; i < 2 && liveB + i < 5; i++) {
            const an = rand(0, TAU);
            const sp = this.spawn('bomber', b.pos.clone().add(_v.set(Math.cos(an) * 3.5, 0.3, Math.sin(an) * 3.5)));
            sp.state = 'hunt'; sp.root.scale.setScalar(sp.T.scale);
          }
        }
        if (a.t > 1.45) { e.bossAtk = null; e.cool = rand(T.cool[0], T.cool[1]) / spdMul; }
        return;
      }
      return;
    }

    if (e.cool <= 0 && e.los) {
      if (dist < 13 || ((e.barrages || 0) % 2 === 1 && dist < 24)) {
        e.bossAtk = { kind: 'vest_blast', t: 0, done: false };
        e.barrages = (e.barrages || 0) + 1;
        return;
      }
      if (dist < T.range) {
        e.bossAtk = { kind: 'c4_barrage', t: 0, shots: 0 };
        return;
      }
    }
    if (e.los && dist < 16 && Math.abs(dy) < 2) this._steer(e, dt, pp.x, pp.z, T.speed * spdMul, 40);
    else this._follow(e, dt, pp, T.speed * spdMul, P);
    if (e.los) e.yawT = yawTo;
  },
};
