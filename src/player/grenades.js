// Grenades: a lobbed ink bomb with a short fuse and a big orange blast, plus the aim-arc preview.
// Mixed into Player.
import * as THREE from 'three';
import { makeInkMaterial, INK } from '../render.js';
import { rand } from '../util.js';
import { audio } from '../audio.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _d = new THREE.Vector3();
const _ap = new THREE.Vector3(), _av = new THREE.Vector3(), _ad = new THREE.Vector3(), _aprev = new THREE.Vector3();

export const GrenadeMixin = {
  clearNades() { for (const n of this.nades) this.ctx.scene.remove(n.mesh); this.nades.length = 0; },
  // where a throw starts and how fast it leaves, for a given charge (0 = flick, 1 = full wind-up)
  _nadeLaunch(charge, pos, vel) {
    pos.copy(this.eye).addScaledVector(this.right, 0.25).addScaledVector(this.forward, 0.6); pos.y -= 0.15;
    vel.copy(this.forward).multiplyScalar(9 + 20 * charge).addScaledVector(this.body.vel, 0.5); vel.y += 3.5 + 2.5 * charge;
  },
  throwGrenade(remote = null, charge = 0) {
    const ctx = this.ctx; let pos, vel;
    if (remote) { pos = new THREE.Vector3().fromArray(remote.pos); vel = new THREE.Vector3().fromArray(remote.vel); }
    else {
      this.grenades--; this.nadeCd = 0.55; pos = new THREE.Vector3(); vel = new THREE.Vector3(); this._nadeLaunch(charge, pos, vel);
      this.weapon.recoil.kick(-0.4, 0.5, 1.2); this.weapon.recoilRot.kick(-3, 0, -1.5); audio.grappleFire(); ctx.input.rumble(0.2, 0.4, 50);
      if (this.onThrow) this.onThrow({ pos: pos.toArray().map((v) => +v.toFixed(2)), vel: vel.toArray().map((v) => +v.toFixed(2)) });
    }
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), makeInkMaterial({ ink: INK.BLACK })));
    const pin = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 4, 8), makeInkMaterial({ ink: INK.ORANGE })); pin.position.y = 0.2; g.add(pin);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.1, 6), makeInkMaterial({ ink: INK.ORANGE })); cap.position.y = 0.17; g.add(cap);
    g.position.copy(pos); ctx.scene.add(g);
    this.nades.push({ mesh: g, pos, vel, ang: new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), fuse: 1.7, mine: !remote, rest: false, tick: 0 });
  },
  updateNadeArc(charge) {
    if (!this._arc) {
      const dots = []; const mat = makeInkMaterial({ ink: INK.BLACK, fill: true });
      for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), mat); m.visible = false; this.ctx.scene.add(m); dots.push(m); }
      const mark = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.05, 5, 18), makeInkMaterial({ ink: INK.ORANGE })); mark.rotation.x = Math.PI / 2; mark.visible = false; this.ctx.scene.add(mark);
      this._arc = { dots, mark };
    }
    const A = this._arc;
    if (charge < 0) { if (A.shown) { for (const d of A.dots) d.visible = false; A.mark.visible = false; A.shown = false; } return; }
    A.shown = true; const world = this.ctx.world; this._nadeLaunch(charge, _ap, _av); let n = 0; const step = 1 / 30;
    for (let i = 0; i < 52 && n < A.dots.length; i++) {
      _av.y -= 22 * step; _aprev.copy(_ap); _ap.addScaledVector(_av, step); _ad.subVectors(_ap, _aprev); const len = _ad.length();
      if (len > 1e-6) { _ad.divideScalar(len); const hit = world.raycast(_aprev, _ad, len + 0.16); if (hit) { _ap.copy(hit.point).addScaledVector(hit.normal, 0.16); const vn = _av.dot(hit.normal); if (vn < 0) { _av.addScaledVector(hit.normal, -1.45 * vn); _av.multiplyScalar(0.55); } if (_av.length() < 1.2 && hit.normal.y > 0.5) break; } }
      if (i % 2 === 0 && i >= 6) { const d = A.dots[n++]; d.position.copy(_ap); d.visible = true; const k = 0.8 + charge * 0.6; d.scale.setScalar(k); }
    }
    for (let i = n; i < A.dots.length; i++) A.dots[i].visible = false;
    A.mark.position.copy(_ap); A.mark.position.y += 0.02; A.mark.visible = true; A.mark.scale.setScalar(0.8 + charge * 0.5);
  },
  updateNades(dt) {
    const ctx = this.ctx, world = ctx.world;
    for (let i = this.nades.length - 1; i >= 0; i--) {
      const n = this.nades[i]; n.fuse -= dt; n.tick += dt;
      if (!n.rest) {
        n.vel.y -= 22 * dt; _v2.copy(n.pos); n.pos.addScaledVector(n.vel, dt);
        _d.subVectors(n.pos, _v2); const len = _d.length();
        if (len > 1e-6) {
          _d.divideScalar(len); const hit = world.raycast(_v2, _d, len + 0.16);
          if (hit) {
            n.pos.copy(hit.point).addScaledVector(hit.normal, 0.16);
            const vn = n.vel.dot(hit.normal); if (vn < 0) { n.vel.addScaledVector(hit.normal, -1.45 * vn); n.vel.multiplyScalar(0.55); n.ang.multiplyScalar(0.6); audio.shell(); }
            if (n.vel.length() < 1.2 && hit.normal.y > 0.5) { n.rest = true; n.vel.set(0, 0, 0); }
          }
        }
        n.mesh.rotation.x += n.ang.x * dt; n.mesh.rotation.y += n.ang.y * dt; n.mesh.rotation.z += n.ang.z * dt;
        n.mesh.position.copy(n.pos);
      }
      // the fuse sparks faster as it runs out
      if (Math.floor(n.tick * (n.fuse < 0.8 ? 14 : 5)) !== Math.floor((n.tick - dt) * (n.fuse < 0.8 ? 14 : 5))) ctx.effects.strokeBurst(n.pos.clone().add(_v.set(0, 0.22, 0)), INK.ORANGE, 2, 2.5, { life: 0.12, size: 0.02 });
      if (n.fuse <= 0) { this.explodeNade(n); ctx.scene.remove(n.mesh); this.nades.splice(i, 1); }
    }
  },
  explodeNade(n) {
    const ctx = this.ctx, R = 6.4, c = n.pos.clone(); c.y += 0.25;
    ctx.effects.boom(c, R); audio.explosion(c); ctx.input.rumble(0.9, 0.9, 220);
    // bots: the thrower's client reports the damage (host applies it; a client's report is forwarded)
    if (n.mine) ctx.enemies.blastEnemies(c, R, 120, null);
    if (n.mine && ctx.blastBreakables) ctx.blastBreakables(c, R);
    // me: my own grenade, or anyone else's that went off on my screen
    const d = this.center.distanceTo(c);
    if (this.alive && d < R * 0.95) { this.takeDamage(10 + 34 * (1 - d / (R * 0.95)), c); this.knockback(_v.subVectors(this.center, c).normalize(), 9); }
    // other players in a versus match, decided by the thrower only
    if (n.mine && ctx.targets) for (const t of ctx.targets()) { if (t.isLocal || !t.alive || (ctx.canHurt && !ctx.canHurt(t))) continue; const dd = t.center.distanceTo(c); if (dd < R * 0.95) t.takeDamage(12 + 50 * (1 - dd / (R * 0.95)), c); }
  },
};
