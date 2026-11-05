// The swing-grapple: target selection (crosshair wins, with slim assist to enemies and rings),
// firing, the swung rope constraint, and the reel/release feel. Mixed into Player.
import * as THREE from 'three';
import { clamp, alignYAxis } from '../util.js';
import { audio } from '../audio.js';
import { NO_GRAPPLE, STAM_FIRE, STAM_MIN, STAM_PAUSE } from './constants.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _d = new THREE.Vector3();

export const GrappleMixin = {
  _handPos(out) { out.copy(this.eye).addScaledVector(this.right, -0.55).addScaledVector(this.forward, 0.9); out.y -= 0.42; return out; },
  // What the crosshair is on wins. Enemies and rings only get a small amount of assist, and
  // only when they are genuinely near the aim line and not behind whatever you are pointing at,
  // so the hook stops jumping to rings above your head that you never aimed at.
  _findGrappleTarget() {
    const ctx = this.ctx, o = this.eye, d = this.forward, maxD = 75;
    const hitW = ctx.world.raycast(o, d, maxD, NO_GRAPPLE);
    const wallDist = hitW ? hitW.dist : maxD;
    // exact hit on an enemy
    const hitE = ctx.enemies.raycast(o, d, Math.min(50, wallDist + 0.5));
    if (hitE) return { point: hitE.point.clone(), enemy: hitE.enemy, dist: hitE.dist };
    // things that move and can be swung from (paper planes): a forgiving sphere test
    let mBest = null, mLat = Infinity;
    for (const mv of ctx.level.grappleMovers || []) {
      _v.subVectors(mv.mesh.position, o); const t = _v.dot(d); if (t < 2 || t > Math.min(maxD, wallDist + 1)) continue;
      const lat = Math.sqrt(Math.max(0, _v.lengthSq() - t * t)); if (lat < mv.radius + 0.3 + t * 0.012 && lat < mLat) { mLat = lat; mBest = { point: mv.mesh.position.clone(), mover: mv, dist: t }; }
    }
    if (mBest) return mBest;
    // near miss on an enemy: forgiving, but it has to be roughly where you are pointing
    let best = null, bestLat = Infinity;
    for (const e of ctx.enemies.enemies) {
      if (!e.alive || e.state === 'spawn' || e.T.isPet) continue;
      _v.subVectors(e.center, o); const t = _v.dot(d);
      if (t < 1.5 || t > Math.min(45, wallDist + 1.5)) continue;
      const lat = Math.sqrt(Math.max(0, _v.lengthSq() - t * t));
      const tol = 1.1 + t * 0.06;                      // a few degrees of help, no more
      if (lat > tol || lat >= bestLat) continue;
      if (!ctx.world.hasLineOfSight(o, e.center)) continue;
      best = { point: e.center.clone(), enemy: e, dist: t }; bestLat = lat;
    }
    if (best) return best;
    // grapple rings: only a slim amount of magnetism, and never through a wall
    let ring = null, ringT = Infinity, ringLat = Infinity;
    for (const r of ctx.level.rings) {
      _v.subVectors(r, o); const t = _v.dot(d); if (t < 2 || t > Math.min(maxD, wallDist + 1.5)) continue;
      const lat = Math.sqrt(Math.max(0, _v.lengthSq() - t * t));
      if (lat > 0.8 + t * 0.02) continue;
      if (lat < ringLat) { ring = r; ringT = t; ringLat = lat; }
    }
    if (ring) return { point: ring.clone(), enemy: null, dist: ringT };
    if (hitW) return { point: hitW.point.clone().addScaledVector(hitW.normal, 0.12), enemy: null, dist: hitW.dist };
    return null;
  },
  _fireGrapple() {
    if (this.grapStam < STAM_MIN) { audio.winded(); this.ctx.hud.tip('O gancho precisa respirar', 0.9); return; }
    const t = this._findGrappleTarget(); if (!t) { audio.empty(); return; }
    this.grapStam -= STAM_FIRE; this.stamPause = STAM_PAUSE;
    const g = this.grapple; g.state = 'fly'; g.anchor.copy(t.point); this._handPos(g.from); g.hook.copy(g.from); g.flyT = 0; g.flyDur = clamp(t.dist / 110, 0.04, 0.6); g.enemy = t.enemy || null; g.mover = t.mover || null; g.t = 0;
    audio.grappleFire(); this.ctx.input.rumble(0.15, 0.4, 40); this.weapon.recoil.kick(-0.3, 0.2, 0.5);
  },
  detachGrapple(boost) {
    const g = this.grapple; if (g.state === 'idle') return; const was = g.state; g.state = 'idle'; g.cd = 0.12; g.enemy = null; g.mover = null; this.stamPause = STAM_PAUSE;
    this.rope.visible = false; this.hookMesh.visible = false; audio.reelLoop(false); this.ctx.hud.grappleTarget(0);
    if (was === 'on') { const b = this.body; if (boost) { b.vel.y = Math.max(b.vel.y, 0) + 8; b.vel.x *= 1.12; b.vel.z *= 1.12; audio.jump(); this.kickFov(3); } else { b.vel.y += 2.5; audio.grappleRelease(); } }
  },
  _updateGrapple(dt) {
    const g = this.grapple, inp = this.ctx.input, b = this.body, ctx = this.ctx; g.cd -= dt;
    if (g.state === 'idle') {
      if (inp.pressed('grapple') && g.cd <= 0) this._fireGrapple();
      g.t += dt; if (g.t > 0.08) { g.t = 0; ctx.hud.grappleTarget(this._findGrappleTarget() ? 1 : 0); }
    } else if (g.state === 'fly') {
      if (g.mover) g.anchor.copy(g.mover.mesh.position);
      g.flyT += dt; const f = Math.min(1, g.flyT / g.flyDur); g.hook.lerpVectors(g.from, g.anchor, f);
      if (f >= 1) {
        if (g.enemy) { if (g.enemy.alive) { ctx.enemies.yank(g.enemy, this.center); ctx.game.addScore(30, 'Puxão'); audio.grappleHit(); ctx.input.rumble(0.5, 0.5, 90); } this.detachGrapple(false); }
        else { g.state = 'on'; g.len = Math.max(1.5, this.center.distanceTo(g.anchor) * 0.94); g.blockedT = 0; g.t = 0; g.swingT = 0; audio.grappleHit(); audio.reelLoop(true); ctx.hud.grappleTarget(2); ctx.input.rumble(0.3, 0.6, 60); if (b.onGround) { b.vel.y = Math.max(b.vel.y, 5); b.onGround = false; } }
      }
    } else if (g.state === 'on') {
      if (g.mover) g.anchor.copy(g.mover.mesh.position);
      g.hook.copy(g.anchor); g.swingT += dt; const c = this.center; _d.subVectors(g.anchor, c); const dist = _d.length(); if (dist > 0.01) _d.divideScalar(dist);
      const reeling = inp.down('grapple'); const vAlong = b.vel.dot(_d);
      if (reeling) { g.len = Math.max(1.5, g.len - 14 * dt); if (vAlong < 22) b.vel.addScaledVector(_d, 42 * dt); }
      else {
        if (vAlong < 6) b.vel.addScaledVector(_d, 3 * dt);
        // swing pump: holding forward adds energy along the view direction (Spider-Man style)
        if (this._mv.y > 0.3 && c.y < g.anchor.y - 1) { _v2.copy(this.forward); _v2.y = 0; if (_v2.lengthSq() > 0.01) { _v2.normalize(); b.vel.addScaledVector(_v2, 10 * dt); } }
      }
      // preso num ônibus: o veículo arrasta o jogador (corda esticada ou "surfando" no chão)
      const drag = g.mover && g.mover.drag && g.mover.vel;
      if (drag) {
        const mv = g.mover.vel, k = 1 - Math.exp(-(dist > g.len * 0.97 || b.onGround ? 5 : 1.2) * dt);
        b.vel.x += (mv.x - b.vel.x) * k; b.vel.z += (mv.z - b.vel.z) * k;
        if (b.onGround && mv.lengthSq() > 4) { g.dragFx = (g.dragFx || 0) - dt; if (g.dragFx <= 0) { g.dragFx = 0.12; ctx.effects.sparks(_v2.copy(b.pos).setY(b.pos.y + 0.05), _v3.set(-mv.x, 2, -mv.z).normalize(), 3, 4, 3); } }
        if (g.mover.car && g.mover.car.hidden) { this.detachGrapple(false); return; }
      }
      if (dist > g.len) {
        const vn = b.vel.dot(_d); if (vn < 0) b.vel.addScaledVector(_d, -vn);
        const excess = Math.min(dist - g.len, 0.35) * 0.85; b.pos.addScaledVector(_d, excess);
        if (ctx.world.overlapsBody(b)) b.pos.addScaledVector(_d, -excess);
      }
      if (b.onGround && reeling && _d.y > 0.2) { b.vel.y = Math.max(b.vel.y, 4.5); b.onGround = false; }
      g.t += dt; if (g.t > 0.15) { g.t = 0; if (!ctx.world.hasLineOfSight(this.eye, g.anchor)) g.blockedT += 0.15; else g.blockedT = 0; }
      if (inp.pressed('grapple') || dist < 1.3 || g.blockedT > 0.3 || dist > 90 || (!drag && b.onGround && g.swingT > 0.6 && !reeling)) this.detachGrapple(dist < 1.3);
    }
    if (g.state !== 'idle') {
      this._handPos(_v3); alignYAxis(this.rope, _v3, g.hook, 0.008); this.rope.visible = true;
      this.hookMesh.visible = true; this.hookMesh.position.copy(g.hook); this.hookMesh.quaternion.copy(this.rope.quaternion);
    }
  },
};
