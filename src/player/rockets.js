// Rockets: the Bazuca projectile with a smoke trail, high direct damage and an AoE splash.
// Mixed into Player.
import * as THREE from 'three';
import { makeInkMaterial, INK } from '../render.js';
import { audio } from '../audio.js';

const _v = new THREE.Vector3(), _d = new THREE.Vector3();

export const RocketMixin = {
  clearRockets() { for (const r of this.rockets) this.ctx.scene.remove(r.mesh); this.rockets.length = 0; },
  fireRocket(remote = null) {
    const ctx = this.ctx;
    let pos, dir, speed;
    if (remote) {
      pos = new THREE.Vector3().fromArray(remote.pos);
      dir = new THREE.Vector3().fromArray(remote.dir);
      speed = remote.speed || 52;
    } else {
      pos = new THREE.Vector3();
      pos.copy(this.eye).addScaledVector(this.forward, 0.7).addScaledVector(this.right, 0.16);
      pos.y -= 0.12;
      dir = this.aimDir(0.005);
      speed = 52;
      if (this.onRocket) {
        this.onRocket({
          pos: pos.toArray().map((v) => +v.toFixed(2)),
          dir: dir.toArray().map((v) => +v.toFixed(3)),
          speed
        });
      }
    }
    const g = new THREE.Group();
    const bodyGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.44, 7);
    bodyGeo.rotateX(Math.PI / 2);
    g.add(new THREE.Mesh(bodyGeo, makeInkMaterial({ ink: INK.BLUE })));
    const coneGeo = new THREE.ConeGeometry(0.06, 0.2, 7);
    coneGeo.rotateX(Math.PI / 2);
    const coneMesh = new THREE.Mesh(coneGeo, makeInkMaterial({ ink: INK.ORANGE, fill: true }));
    coneMesh.position.z = 0.3;
    g.add(coneMesh);
    const finMat = makeInkMaterial({ ink: INK.BLACK, fill: true });
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.09, 0.14), finMat);
      fin.rotation.z = (i * Math.PI) / 2;
      fin.position.set(0, 0, -0.16);
      g.add(fin);
    }
    g.position.copy(pos);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    ctx.scene.add(g);
    this.rockets.push({ mesh: g, pos, prev: pos.clone(), dir, speed, mine: !remote, life: 5.0, trailT: 0 });
  },
  updateRockets(dt) {
    const ctx = this.ctx, world = ctx.world;
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      r.trailT += dt;
      if (r.life <= 0) {
        this.explodeRocket(r.pos, r.mine);
        ctx.scene.remove(r.mesh);
        this.rockets.splice(i, 1);
        continue;
      }
      r.prev.copy(r.pos);
      r.pos.addScaledVector(r.dir, r.speed * dt);
      r.mesh.position.copy(r.pos);
      r.mesh.rotateZ(14 * dt);
      if (r.trailT >= 0.02) {
        r.trailT = 0;
        _v.copy(r.pos).addScaledVector(r.dir, -0.28);
        ctx.effects.strokeBurst(_v, INK.ORANGE, 2, 2.5, { life: 0.1, size: 0.028, gravity: 0 });
        ctx.effects.smoke(_v, r.dir.clone().negate(), 1);
      }
      _d.subVectors(r.pos, r.prev);
      const segLen = _d.length();
      if (segLen > 1e-5) {
        _d.divideScalar(segLen);
        const hitW = world.raycast(r.prev, _d, segLen, (b) => !!b.data.seeThrough);
        const hitE = ctx.enemies.raycast(r.prev, _d, segLen);
        const hitP = ctx.raycastPlayers ? ctx.raycastPlayers(r.prev, _d, segLen) : null;
        let hit = false, hitPoint = null;
        if (hitE && (!hitW || hitE.dist < hitW.dist)) {
          hit = true; hitPoint = hitE.point;
        } else if (hitP && (!hitW || hitP.dist < hitW.dist)) {
          hit = true; hitPoint = hitP.point;
        } else if (hitW) {
          hit = true; hitPoint = hitW.point;
        }
        if (hit) {
          this.explodeRocket(hitPoint, r.mine);
          ctx.scene.remove(r.mesh);
          this.rockets.splice(i, 1);
          continue;
        }
      }
    }
  },
  explodeRocket(point, mine) {
    const ctx = this.ctx, R = 6.2;
    ctx.effects.boom(point, R);
    audio.explosion(point);
    ctx.effects.shakeAmt += 0.35;
    ctx.input.rumble(0.9, 0.9, 200);
    if (mine) {
      ctx.enemies.blastEnemies(point, R, 220, null);
      if (ctx.blastBreakables) ctx.blastBreakables(point, R);
    }
    const dist = this.center.distanceTo(point);
    if (this.alive && dist < R) {
      const fall = 1 - dist / R;
      const selfDmg = Math.min(26, 65 * fall);
      this.takeDamage(selfDmg, point);
      _v.subVectors(this.center, point).normalize();
      this.knockback(_v, 18 * fall);
    }
    if (mine && ctx.targets) {
      for (const t of ctx.targets()) {
        if (t.isLocal || !t.alive || (ctx.canHurt && !ctx.canHurt(t))) continue;
        const dd = t.center.distanceTo(point);
        if (dd < R) {
          const fall = 1 - dd / R;
          t.takeDamage(40 + 130 * fall, point);
        }
      }
    }
  },
};
