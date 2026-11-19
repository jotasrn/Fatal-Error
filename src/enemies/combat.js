// Enemy hit detection, damage resolution, shield breaking, gibbing/death, and explosions.
import * as THREE from 'three';
import { setFill, INK } from '../core/render.js';
import { SEE_THROUGH } from '../core/physics.js';
import { rand, randInt, clamp } from '../core/util.js';
import { audio } from '../core/audio.js';

const COLLATERAL = new Set(['bot', 'fall', 'car', 'event']);
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _d = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export const EnemyCombatMixin = {
  nearestVisible(from, forward, cosHalf, maxDist) {
    let best = null, bestD = maxDist;
    for (const e of this.enemies) {
      if (!e.alive || e.T.isPet) continue;
      _v.subVectors(e.center, from);
      const d = _v.length();
      if (d > bestD || d < 0.01) continue;
      if (_v.divideScalar(d).dot(forward) < cosHalf) continue;
      if (!this.ctx.world.hasLineOfSight(from, e.center, SEE_THROUGH)) continue;
      best = e; bestD = d;
    }
    return best;
  },

  raycast(o, d, maxDist, ignore = null) {
    let best = null;
    const isIgnored = (e) => !ignore ? false : (ignore instanceof Set ? ignore.has(e) : e === ignore);
    for (const e of this.enemies) {
      if (!e.alive || isIgnored(e) || e.T.isPet) continue;
      for (let i = 0; i < e.hit.length; i++) {
        const c = e.hitSpheres[i], r = e.hit[i][1] * e.T.scale;
        _v.subVectors(c, o); const tca = _v.dot(d); if (tca < 0 || tca > maxDist) continue;
        const d2 = _v.lengthSq() - tca * tca; if (d2 > r * r) continue;
        const t = tca - Math.sqrt(r * r - d2); if (t < 0) continue;
        if (!best || t < best.dist) best = { enemy: e, part: e.hit[i][0], dist: t, point: new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t) };
      }
    }
    return best;
  },

  inArc(pos, dir, range, cosHalf) {
    const out = [];
    for (const e of this.enemies) {
      if (!e.alive || e.T.isPet) continue;
      _v.subVectors(e.center, pos);
      const d = _v.length() - (e.T.boss || e.T.isTank ? 1.4 : 0);
      if (d > range + 0.3) continue;
      if (d > 0.3 && _v.normalize().dot(dir) < cosHalf) continue;
      out.push({ enemy: e, dist: d });
    }
    return out.sort((a, b) => a.dist - b.dist);
  },

  blastEnemies(point, radius, dmg, except) {
    for (const e of this.enemies) {
      if (!e.alive || e === except || e.T.isPet) continue;
      const d = e.center.distanceTo(point);
      if (d > radius) continue;
      _d.subVectors(e.center, point).normalize();
      this.damage(e, dmg * (1 - d / radius * 0.6), { point: e.center.clone(), dir: _d.clone(), part: 'torso', source: 'blast', crit: false, armorBreak: true });
    }
  },

  yank(e, target) {
    if (!e.alive) return;
    if (e.T.boss || e.T.isTank) { e.flinch = 1; return; }
    e.state = 'stunned'; e.t = 0; e.stunDur = 1.3; e.path = null; e.flyState = 'stunned';
    _d.subVectors(target, e.body.pos); const dist = _d.length(); _d.divideScalar(Math.max(dist, 0.01));
    e.body.vel.copy(_d).multiplyScalar(clamp(dist * 1.6, 10, 26)); e.body.vel.y = clamp(dist * 0.5, 4, 9); e.body.onGround = false;
    this.ctx.effects.blood(e.center, _d, 0.4);
  },

  damage(e, amount, info) {
    if (!e.alive || e.T.invulnerable) return;
    if (this.mirror) {
      if (info.part !== 'shield') {
        e.flinch = 1; e.flashT = 0.07; if (!e.flashOn) { setFill(e.mat, true); e.flashOn = true; }
        this.ctx.effects.blood(info.point || e.center, info.dir || _up, clamp(0.5 + amount / 70, 0.5, 2.2), { ink: e.T.ink === INK.BLACK ? INK.BLACK : INK.RED });
        this.ctx.hud.hitmarker(false, info.crit);
      }
      if (this.onClientHit) this.onClientHit(e, amount, info);
      return;
    }
    if (info.part === 'shield') {
      this.ctx.effects.sparks(info.point, info.dir ? info.dir.clone().negate() : _up, INK.ORANGE, 8, 8); audio.shieldHit(info.point);
      if (info.source === 'katana' || info.source === 'blast' || info.armorBreak) {
        e.shieldHp -= info.armorBreak ? 2 : 1;
        if (e.shieldHp <= 0) this._breakShield(e);
      }
      this.ctx.hud.hitmarker(false, false);
      if (!info.armorBreak) return;
      amount *= 0.65;
    }
    if (e.eliteShield > 0) {
      e.shieldRegenT = 4.0;
      const sMult = info.armorBreak || info.crit || info.source === 'laser' || info.source === 'blast' ? 2.2 : 1.0;
      const absorb = Math.min(e.eliteShield, amount * sMult);
      e.eliteShield -= absorb;
      this.ctx.effects.sparks(info.point || e.center, info.dir ? info.dir.clone().negate() : _up, INK.BLUE, 8, 7);
      audio.shieldHit(info.point || e.center);
      if (e.eliteShield > 0) { this.ctx.hud.hitmarker(false, false); return; }
      this.ctx.effects.strokeBurst(e.center, INK.BLUE, 18, 7, { life: 0.35, size: 0.04 });
    }
    if (e.T.armoredBody && !info.crit && !info.armorBreak && info.source !== 'blast' && info.source !== 'focus' && !e.armorBroken) {
      amount *= 0.42;
      this.ctx.effects.sparks(info.point || e.center, info.dir ? info.dir.clone().negate() : _up, INK.ORANGE, 6, 6);
      audio.shieldHit(info.point || e.center);
    }

    amount *= this.mods.damage;
    e.hp -= amount; e.flinch = 1; e.flashT = 0.07; if (!e.flashOn) { setFill(e.mat, true); e.flashOn = true; }

    if (e.T.isLazaro && e.alive && e.hp > 0 && (e.stealthCd || 0) <= 0 && amount >= 45) {
      e.stealthCd = 4.2;
      this._triggerLazaroSmokeEscape(e);
    }

    if (info && !COLLATERAL.has(info.source)) {
      const culprit = (info.by && this.ctx.remote && this.ctx.remote.get(info.by)) || this.ctx.player;
      if ((e.T.isProtester || e.T.isCivilian) && !this.ctx.protestersRiot) {
        this.ctx.protestersRiot = true;
        if (this.ctx.hud) this.ctx.hud.message('⚠️ MULTIDÃO EM FÚRIA!', 'Você atacou os manifestantes! A multidão partiu para cima de você!', 4.0);
        audio.siren(e.center);
        for (const en of this.enemies) {
          if (en.alive && (en.T.isProtester || en.T.isCivilian)) {
            en.enraged = true; en.target = culprit; en.scared = false;
            if (en.T.isCivilian && en.T.weapon !== 'blade') en.T = { ...en.T, weapon: 'blade', dmg: 10, reach: 2.6, lunge: 2.6, standoff: 1.6, cool: [1.1, 1.7] };
          }
        }
        if (this.ctx.onProtestersRiot) this.ctx.onProtestersRiot();
      } else if (e.T.isPolice && !this.ctx.playerWanted) {
        this.ctx.playerWanted = true;
        if (this.ctx.hud) this.ctx.hud.message('🚨 FORÇA POLICIAL ACIONADA!', 'A Polícia revidou o ataque ao oficial!', 3.5);
        for (const en of this.enemies) { if (en.alive && en.T.isPolice) en.target = culprit; }
        if (this.ctx.onPlayerWanted) this.ctx.onPlayerWanted();
      }
    }
    const dir = info.dir || _d.set(0, 1, 0); const amt = clamp(0.5 + amount / 70, 0.5, 2.2) * (e.T.boss ? 1.6 : 1);
    this.ctx.effects.blood(info.point || e.center, dir, amt, { ink: e.T.ink === INK.BLACK ? INK.BLACK : INK.RED });
    if (info.crit) audio.headshot(e.center); else audio.hitEnemy(e.center);
    this.ctx.hud.hitmarker(e.hp <= 0, info.crit);
    if (info.source !== 'deflect') this.ctx.input.rumble(0.1, 0.3, 30);
    if (e.state === 'spawn') { e.state = 'hunt'; e.root.scale.setScalar(e.T.scale); }
    if (e.T.boss && this.onBoss) this.onBoss(e);
    if (e.hp <= 0) {
      if (info.source === 'katana' || info.source === 'focus') this.ctx.game.hitstop(0.035, 0.3);
      this.kill(e, info);
    }
  },

  _breakShield(e) {
    const g = e.J.shieldG; if (!g || !g.parent) return; g.updateWorldMatrix(true, false); this.ctx.scene.attach(g);
    this.ctx.effects.debris(g, g.position, new THREE.Vector3(rand(-3, 3), 4, rand(-3, 3)), new THREE.Vector3(rand(-6, 6), rand(-6, 6), rand(-6, 6)), { radius: 0.4, blood: false, life: 8 });
    e.hit = e.hit.filter((h) => h[0] !== 'shield'); e.hitSpheres = e.hit.map(() => new THREE.Vector3()); e.J.shieldG = null; audio.shieldHit(e.center); this.ctx.game.addScore(40, 'Escudo Destruído');
  },

  kill(e, info) {
    if (!e || !e.alive) return;
    e.alive = false; e.state = 'dead'; e.deadT = 0; this.alive = Math.max(0, this.alive - 1); this._removeLaser(e);
    const eff = this.ctx.effects, scene = this.ctx.scene; const inkC = e.T.ink === INK.BLACK ? INK.BLACK : INK.RED;
    if (e.face) { e.face.eyes.visible = false; e.face.xeyes.visible = true; }
    const dir = (info.dir || _d.set(0, 0.5, 0)).clone().normalize();
    if (e.T.weapon === 'bomb' || e.T.bossKind === 'bomber_boss') {
      this._explodeBomber(e, e.T.bossKind === 'bomber_boss' ? 2.2 : 0.9);
      if (e.T.boss && this.onBoss) this.onBoss(e);
      if (this.onKill) this.onKill(e, info, true);
      return;
    }
    if (e.T.isTank) {
      eff.explosion(e.center, 5.5, INK.ORANGE); audio.explosion(e.center);
      if (this.ctx.destroyEnvironmentAt) this.ctx.destroyEnvironmentAt(e.body.pos, 5.0);
    }
    audio.enemyDie(e.center);
    if (e.T.isCivilian && this.ctx.onCivilianKilled && info && !COLLATERAL.has(info.source)) this.ctx.onCivilianKilled(e, info);
    if (e.T.flying) {
      e.root.updateWorldMatrix(true, false); scene.attach(e.root); e.rootDetached = true;
      eff.debris(e.root, e.root.position, dir.clone().multiplyScalar(4).add(_v.set(rand(-2, 2), 1, rand(-2, 2))), new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), { radius: 0.5, blood: true, life: 8 });
      eff.blood(e.center, dir, 1); if (this.onKill) this.onKill(e, info, true); return;
    }
    const over = -e.hp > e.maxHp * 0.35 || info.source === 'katana' || info.crit || info.source === 'deflect' || info.source === 'blast' || info.source === 'requiem';
    const detach = (obj, extraVel, radius) => { if (!obj || !obj.parent) return; obj.updateWorldMatrix(true, false); scene.attach(obj); _v.copy(dir).multiplyScalar(rand(3, 7)).add(extraVel); _v.y += rand(2, 5); eff.debris(obj, obj.position, _v, new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8)), { radius, blood: true, life: rand(7, 10) }); };
    if (over) {
      audio.gib(e.center); const J = e.J;
      const tPart = e.parts.torso || e.parts.head || e.root;
      const hPart = e.parts.hips || e.parts.torso || e.root;
      if (info.crit || ((info.source === 'katana' || info.source === 'focus' || info.source === 'requiem') && Math.random() < 0.45)) { detach(J.headG, _v2.set(rand(-2, 2), 3, rand(-2, 2)), 0.25); eff.fountain(tPart.getWorldPosition(new THREE.Vector3()).add(_v2.set(0, 0.35, 0)), _up, 0.9, inkC); }
      if (info.source === 'katana' || info.source === 'focus') {
        const r = Math.random();
        if (r < 0.4) detach(J.armR, _v2.set(rand(-3, 3), 2, rand(-3, 3)), 0.12); else if (r < 0.7) detach(J.armL, _v2.set(rand(-3, 3), 2, rand(-3, 3)), 0.12);
        else { detach(J.torso, _v2.set(rand(-2, 2), 2, rand(-2, 2)), 0.3); eff.fountain(hPart.getWorldPosition(new THREE.Vector3()), _up, 0.7, inkC); }
      } else if (info.source === 'deflect' || info.source === 'blast' || info.source === 'requiem' || -e.hp > e.maxHp * 0.6) {
        const limbs = [J.armL, J.armR, J.legL, J.legR, J.torso].filter(Boolean); const k = e.T.boss ? 5 : randInt(1, 2);
        for (let i = 0; i < k && limbs.length; i++) { const o = limbs.splice(randInt(0, limbs.length - 1), 1)[0]; detach(o, _v2.set(rand(-3, 3), 2, rand(-3, 3)), 0.15); }
      }
    }
    e.topple = { axis: Math.random() < 0.5 ? 'x' : 'z', sign: dir.z > 0 || Math.random() < 0.5 ? 1 : -1, t: 0 };
    eff.bloodPool(e.body.pos, rand(1.1, 1.8) * (e.T.boss ? 2.5 : 1), inkC); eff.blood(e.center, dir, 1.2, { ink: inkC });
    if (Math.random() < 0.6 && e.J.gun && e.J.gun.parent) detach(e.J.gun, _v2.set(rand(-2, 2), 2, rand(-2, 2)), 0.08);
    if (e.J.shieldG) this._breakShield(e);
    if (e.T.boss) { eff.explosion(e.center, 6, INK.BLACK); audio.explosion(e.center); if (this.onBoss) this.onBoss(e); }
    if (this.onKill) this.onKill(e, info, over);
  },

  _explodeBomber(e, scale = 1) {
    const T = e.T; const c = e.center.clone();
    const rad = (T.blast || 4.8) * scale;
    this.ctx.effects.explosion(c, rad, INK.ORANGE); audio.explosion(c);
    if (this.ctx.destroyEnvironmentAt) this.ctx.destroyEnvironmentAt(c, rad * 0.9);
    for (const P of this.targets()) { const d = P.center.distanceTo(c); if (P.alive && d < rad) { P.takeDamage(T.dmg * this.mods.damage * Math.sqrt(1 - d / rad), c); P.knockback(_v.subVectors(P.center, c).normalize(), 8 * scale); } }
    this.blastEnemies(c, rad, 85 * scale, e);
    if (e.alive) { e.alive = false; e.state = 'dead'; this.alive--; if (this.onKill) this.onKill(e, { source: 'blast', dir: _up.clone() }, true); }
    this.ctx.scene.remove(e.root); e.rootDetached = true; e.deadT = 99;
  },
};
