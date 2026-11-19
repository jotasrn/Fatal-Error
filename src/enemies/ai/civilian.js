// AI for Brasília civilians, bus commuters, peaceful patrols, and Orelha companion.
import * as THREE from 'three';
import { INK } from '../../core/render.js';
import { rand, damp, wrapAngle, TAU } from '../../core/util.js';
import { audio } from '../../core/audio.js';
import { progression } from '../../game/progression.js';

const _v = new THREE.Vector3();

export const CivilianAIMixin = {
  _patrolPeaceful(e, dt) {
    const b = e.body;
    e.aimAmt = damp(e.aimAmt, 0, 6, dt);
    e.burstLeft = 0; e.aimT = 0; this._hideLaser(e);
    e.walkTimer = (e.walkTimer || 0) - dt;
    if (e.walkTimer <= 0 || b.hitWall) {
      e.walkTimer = rand(3, 6);
      e.walkDir = b.hitWall && e.walkDir !== undefined ? wrapAngle(e.walkDir + Math.PI + rand(-0.6, 0.6)) : rand(0, TAU);
    }
    const spd = e.T.speed * 0.35;
    b.vel.x = damp(b.vel.x, Math.sin(e.walkDir) * spd, 6, dt);
    b.vel.z = damp(b.vel.z, Math.cos(e.walkDir) * spd, 6, dt);
    e.yawT = e.walkDir;
  },

  _thinkPet(e, dt, pp, dist, dx, dz) {
    const b = e.body; e.aimAmt = 0;
    progression.applyToOrelha(e);
    if (dist > 70) { b.pos.set(pp.x + 2, pp.y + 0.4, pp.z + 2); b.vel.set(0, 0, 0); e.path = null; return; }
    e.biteCool = Math.max(0, (e.biteCool || 0) - dt);
    let prey = null, bestD2 = 22 * 22;
    for (const o of this.enemies) {
      if (!o.alive || o === e || o.T.isPet || o.T.isCivilian || o.T.flying || o.state === 'spawn') continue;
      if (o.T.isPolice && !this.ctx.playerWanted) continue;
      if (o.T.isProtester && !this.ctx.protestersRiot) continue;
      if (Math.abs(o.body.pos.y - b.pos.y) > 3.2) continue;
      const dPlayer2 = o.body.pos.distanceToSquared(pp);
      const dPet2 = o.body.pos.distanceToSquared(b.pos);
      const score = Math.min(dPlayer2, dPet2 * 1.15);
      if (score < bestD2) { bestD2 = score; prey = o; }
    }
    if (prey && dist < 32) {
      const pdx = prey.body.pos.x - b.pos.x, pdz = prey.body.pos.z - b.pos.z;
      const pDist = Math.hypot(pdx, pdz);
      if (pDist < 2.35 + (prey.T.scale > 2 ? 1.4 : 0)) {
        e.yawT = Math.atan2(pdx, pdz);
        if (e.biteCool <= 0) {
          e.biteCool = 1.05;
          const biteDmg = Math.round(42 * (e.biteMul || progression.orelhaBiteMul || 1));
          if (b.onGround) { b.vel.x += (pdx / (pDist || 1)) * 5.5; b.vel.z += (pdz / (pDist || 1)) * 5.5; b.vel.y = 4.6; b.onGround = false; }
          this.damage(prey, biteDmg, { source: 'bot', point: prey.center.clone(), dir: _v.subVectors(prey.center, e.center).normalize(), part: 'torso', crit: false });
          if (prey.alive && !prey.T.boss && !prey.T.isTank) { prey.state = 'stunned'; prey.t = 0; prey.stunDur = 0.65; }
          this.ctx.effects.strokeBurst(prey.center, INK.ORANGE, 12, 5, { life: 0.25, size: 0.035 });
          audio.lunge(e.center);
        }
        return;
      }
      this._steer(e, dt, prey.body.pos.x, prey.body.pos.z, e.T.speed * 1.38, 46);
      if (b.onGround && pDist < 4.4 && e.biteCool <= 0.2) { b.vel.y = 5.2; b.onGround = false; }
      return;
    }
    if (dist > 7) { this._follow(e, dt, pp, dist > 20 ? e.T.speed * 1.25 : e.T.speed); return; }
    if (dist < 2.2) { this._steer(e, dt, b.pos.x - dx, b.pos.z - dz, 2.5, 20); e.yawT = Math.atan2(dx, dz); return; }
    e.walkTimer = (e.walkTimer || 0) - dt;
    if (e.walkTimer <= 0 || b.hitWall) { e.walkTimer = rand(1.2, 2.8); e.walkDir = Math.atan2(dx, dz) + rand(-1.4, 1.4); e.sniff = Math.random() < 0.4; }
    const spd = e.sniff ? 0 : 2.2;
    b.vel.x = damp(b.vel.x, Math.sin(e.walkDir) * spd, 6, dt); b.vel.z = damp(b.vel.z, Math.cos(e.walkDir) * spd, 6, dt);
    e.yawT = e.sniff ? Math.atan2(dx, dz) : e.walkDir;
  },

  _thinkCivilian(e, dt, dist, dx, dz, P) {
    const T = e.T, b = e.body, ctx = this.ctx;
    e.aimAmt = 0;
    let threat = null, td = 16 * 16;
    for (const o of this.enemies) { if (!o.alive || !(o.T.isRioter || o.T.isTitan || o.T.isLazaro)) continue; const d = o.body.pos.distanceToSquared(b.pos); if (d < td) { td = d; threat = o; } }
    if (!threat && ctx.panicAt) { const pz = ctx.panicAt; const d = (pz.x - b.pos.x) ** 2 + (pz.z - b.pos.z) ** 2; if (d < 60 * 60) threat = { body: { pos: pz } }; }
    if (threat) {
      const tx = threat.body.pos.x - b.pos.x, tz = threat.body.pos.z - b.pos.z;
      this._steer(e, dt, b.pos.x - tx * 3, b.pos.z - tz * 3, T.speed * 1.6, 45); e.yawT = Math.atan2(-tx, -tz); return;
    }
    if (e.scared || (dist < 16 && P.shooting) || e.hp < T.hp) {
      e.scared = true;
      this._steer(e, dt, b.pos.x - dx, b.pos.z - dz, T.speed * 1.5, 45);
      e.yawT = Math.atan2(-dx, -dz);
      return;
    }
    const stops = ctx.level && ctx.level.busStops;
    if (stops && stops.length > 1 && e.isCommuter !== false) {
      if (e.isCommuter === undefined) e.isCommuter = (e.id % 4) !== 0;
      if (e.isCommuter) {
        if (!e.busStop) {
          let bestS = null, bestSD = 130 * 130;
          for (let i = 0; i < stops.length; i++) {
            const s = stops[i];
            const d2 = (s.waitX - b.pos.x) ** 2 + (s.waitZ - b.pos.z) ** 2;
            if (d2 < bestSD && Math.abs((s.y || 0) - b.pos.y) < 3.5) { bestSD = d2; bestS = s; }
          }
          e.busStop = bestS || stops[e.id % stops.length];
          e.stopSlotOff = ((e.id % 5) - 2) * 0.85;
        }
        const st = e.busStop;
        const wx = st.waitX + (st.dx !== undefined ? st.dx * e.stopSlotOff : st.axis === 'x' ? e.stopSlotOff : 0);
        const wz = st.waitZ + (st.dz !== undefined ? st.dz * e.stopSlotOff : st.axis === 'z' ? e.stopSlotOff : 0);
        const dStop = Math.hypot(wx - b.pos.x, wz - b.pos.z);
        if (dStop > 2.4) {
          this._steer(e, dt, wx, wz, T.speed * 0.65, 25);
          return;
        }
        b.vel.x = damp(b.vel.x, 0, 8, dt); b.vel.z = damp(b.vel.z, 0, 8, dt);
        e.yawT = st.faceYaw !== undefined ? st.faceYaw : st.axis === 'z' ? (st.dir > 0 ? -Math.PI / 2 : Math.PI / 2) : (st.dir > 0 ? 0 : Math.PI);
        const cars = ctx.level && ctx.level.cars;
        if (cars) {
          let boardingBus = null, bd2 = 12 * 12;
          for (let i = 0; i < cars.length; i++) {
            const c = cars[i];
            if (!c.isBus || !c.alive || c.speed > 2.4) continue;
            const cd2 = (c.x - b.pos.x) ** 2 + (c.z - b.pos.z) ** 2;
            if (cd2 < bd2 && Math.abs((c.y || 0) - b.pos.y) < 2.8) { bd2 = cd2; boardingBus = c; }
          }
          if (boardingBus) {
            this._steer(e, dt, boardingBus.x, boardingBus.z, T.speed * 0.85, 32);
            if (bd2 < 3.2 * 3.2) {
              const nextStop = stops[(stops.indexOf(st) + 3 + (e.id % 5)) % stops.length];
              b.pos.set(nextStop.waitX + rand(-2, 2), (nextStop.y || 0) + 0.25, nextStop.waitZ + rand(-2, 2));
              b.vel.set(0, 0, 0);
              e.busStop = stops[(stops.indexOf(nextStop) + 2) % stops.length];
              this.ctx.effects.strokeBurst(b.pos.clone().add(_v.set(0, 1, 0)), INK.BLUE, 8, 3, { life: 0.3, size: 0.025 });
            }
          }
        }
        return;
      }
    }
    e.walkTimer = (e.walkTimer || 0) - dt;
    if (e.walkTimer <= 0 || b.hitWall) {
      e.walkTimer = rand(3, 6);
      e.walkDir = b.hitWall && e.walkDir !== undefined ? wrapAngle(e.walkDir + Math.PI + rand(-0.5, 0.5)) : rand(0, TAU);
    }
    b.vel.x = Math.sin(e.walkDir) * (T.speed * 0.55);
    b.vel.z = Math.cos(e.walkDir) * (T.speed * 0.55);
    e.yawT = e.walkDir;
  },
};
