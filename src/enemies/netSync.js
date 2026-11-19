// Network snapshot & client-side interpolation mirror for EnemyManager.
import * as THREE from 'three';
import { setFill } from '../core/render.js';
import { clamp, damp, angleLerp } from '../core/util.js';
import { TYPES, STATE_CODES, STATE_NAMES } from './types.js';

const TYPE_KEYS = Object.keys(TYPES);
const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export const EnemyNetSyncMixin = {
  snapshot() {
    this._snapTick = ((this._snapTick || 0) + 1) % 3;
    const tgs = this.targets();
    const out = [];
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const b = e.body;
      let nearAny = e.T.boss || e.T.isTank;
      if (!nearAny) {
        for (let i = 0; i < tgs.length; i++) {
          const tp = tgs[i].body && tgs[i].body.pos;
          if (tp) {
            const dx = b.pos.x - tp.x, dz = b.pos.z - tp.z;
            if (dx * dx + dz * dz < 125 * 125) { nearAny = true; break; }
          }
        }
      }
      if (!nearAny && ((e.id + this._snapTick) % 3) !== 0) continue;
      out.push([
        e.id,
        Math.round(b.pos.x * 20) / 20,
        Math.round(b.pos.y * 20) / 20,
        Math.round(b.pos.z * 20) / 20,
        Math.round(e.yaw * 100) / 100,
        STATE_CODES[e.state] ?? 1,
        Math.round(e.hp),
        Math.round(e.aimAmt * 10) / 10,
        Math.round(e.attackT * 20) / 20,
        e.fuseT >= 0 ? 1 : 0,
        e.bossAtk ? 1 : 0,
        TYPE_KEYS.indexOf(e.type)
      ]);
    }
    return out;
  },

  applySnapshot(arr, now) {
    const seen = new Set();
    for (const r of arr) {
      const id = r[0];
      seen.add(id);
      let e = this.byId.get(id);
      const type = typeof r[11] === 'number' ? TYPE_KEYS[r[11]] : r[11];
      if ((!e || !e.alive) && type) {
        const pos = new THREE.Vector3(r[1], r[2], r[3]);
        if (!e) e = this.spawn(type, pos, id);
        else { e.alive = true; e.state = 'hunt'; }
      }
      if (!e || !e.alive) continue;
      e.snapA = e.snapB || { p: e.body.pos.clone(), yaw: e.yaw, t: now - 0.08 };
      e.snapB = { p: new THREE.Vector3(r[1], r[2], r[3]), yaw: r[4], t: now };
      const st = STATE_NAMES[r[5]] || 'hunt';
      if (e.state === 'spawn' && st !== 'spawn') { e.state = st; e.root.scale.setScalar(e.T.scale); }
      else if (e.state !== 'spawn') e.state = st;
      e.hp = r[6]; e.aimAmt = r[7]; e.attackT = r[8];
      e.fuseT = r[9] ? 0.5 : -1;
      e.bossAtk = r[10] ? (e.bossAtk || { kind: 'stomp', t: 0.3 }) : null;
      if (e.T.boss && this.onBoss) this.onBoss(e);
    }
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.alive && !seen.has(e.id)) {
        e.ghostTicks = (e.ghostTicks || 0) + 1;
        if (e.ghostTicks > 12) {
          e.alive = false;
          this.ctx.scene.remove(e.root);
          this._disposeMesh(e.root);
          this.byId.delete(e.id);
          this.enemies.splice(i, 1);
        }
      } else {
        e.ghostTicks = 0;
      }
    }
  },

  _updateMirror(dt) {
    const now = performance.now() / 1000, P = this.ctx.player;
    for (const e of this.enemies) {
      try {
        e.t += dt;
        if (!e.alive) { this._updateDead(e, dt); continue; }
        if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0 && e.flashOn) { setFill(e.mat, false); e.flashOn = false; } }
        e.flinch = damp(e.flinch, 0, 9, dt);
        if (e.state === 'spawn') { const f = clamp(e.t / 0.6, 0, 1); e.root.scale.setScalar(Math.max(0.001, f * e.T.scale * (1 + Math.sin(e.t * 60) * 0.12 * (1 - f)))); if (e.t >= 0.6) { e.state = 'hunt'; e.root.scale.setScalar(e.T.scale); } }
        if (e.snapA && e.snapB) {
          const span = Math.max(0.02, e.snapB.t - e.snapA.t); const k = clamp((now - 0.1 - e.snapA.t) / span, 0, 1.2);
          _v.lerpVectors(e.snapA.p, e.snapB.p, k);
          e.body.vel.subVectors(_v, e.body.pos).divideScalar(Math.max(dt, 1e-3)).clampLength(0, 30);
          e.body.pos.copy(_v); e.body.onGround = Math.abs(e.body.vel.y) < 0.5;
          e.yaw = angleLerp(e.snapA.yaw, e.snapB.yaw, k);
        }
        e.root.position.copy(e.body.pos); e.root.rotation.y = e.yaw;
        const mdx = e.body.pos.x - P.body.pos.x, mdz = e.body.pos.z - P.body.pos.z;
        const farMirror = mdx * mdx + mdz * mdz > 58 * 58;
        if (!farMirror || ((e.id + this._lodTick) % 3) === 0) {
          const animDt = farMirror ? dt * 3 : dt;
          if (e.T.flying) this._animateFlyer(e, animDt); else this._animate(e, animDt, P.center);
          this._syncHit(e);
        } else {
          e.center.set(e.body.pos.x, e.body.pos.y + 1.0 * e.T.scale, e.body.pos.z);
        }
        if (e.T.weapon === 'sniper' && e.laser) e.laser.visible = e.aimAmt > 0.9;
      } catch (err) { /* ignore single mirror tick error */ }
    }
    this.projectiles.update(dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) { const e = this.enemies[i]; if (!e.alive && e.deadT > 2.5) { this._removeLaser(e); if (!e.rootDetached) { this.ctx.scene.remove(e.root); this._disposeMesh(e.root); } this.byId.delete(e.id); this.enemies.splice(i, 1); } }
  },

  killMirror(id, info) {
    const e = this.byId.get(id);
    if (!e || !e.alive) return;
    const cb = this.onKill;
    this.onKill = null;
    this.kill(e, { ...info, dir: info.dir ? new THREE.Vector3().fromArray(info.dir) : _up.clone(), point: info.point ? new THREE.Vector3().fromArray(info.point) : e.center.clone() });
    this.onKill = cb;
  },
};
