// Enemy manager core: lifecycle, target selection, wave/elite spawning, and per-frame update loop.
// Combat, tactical AI, vehicles, civilians, bosses, animations and network sync live in their own mixins.
import * as THREE from 'three';
import { makeInkMaterial, setFill, INK } from '../core/render.js';
import { makeBody } from '../core/physics.js';
import { rand, choose, clamp, damp, angleLerp, TAU } from '../core/util.js';
import { audio } from '../core/audio.js';
import { TYPES } from './types.js';
import { progression } from '../game/progression.js';
import { buildHumanoid, buildBomber, buildFlyer, buildQuadruped, buildTitan, buildCavalry, buildTank, buildCached, cloneModel } from './models.js';
import { Projectiles } from './projectiles.js';
import { EnemyCombatMixin } from './combat.js';
import { EnemyNetSyncMixin } from './netSync.js';
import { EnemyAnimMixin } from './anim.js';
import { TacticalAIMixin } from './ai/tactical.js';
import { VehicleAIMixin } from './ai/vehicles.js';
import { CivilianAIMixin } from './ai/civilian.js';
import { BossAIMixin } from './ai/bosses.js';

const modelBuilder = (T) => (m, s) => {
  if (T.model === 'bomber') return buildBomber(m, s, T);
  if (T.model === 'blob') return buildBomber(m, s, T, true);
  if (T.model === 'flyer') return buildFlyer(m, s, T);
  if (T.model === 'quadruped' || T.model === 'spider') return buildQuadruped(m, s, T);
  if (T.model === 'titan' || T.model === 'titan_armored') return buildTitan(m, s, T);
  if (T.model === 'cavalry') return buildCavalry(m, s, T);
  if (T.model === 'tank' || T.model === 'convoy') return buildTank(m, s, T);
  return buildHumanoid(m, s, T);
};

const _v = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

const ELITE_KINDS = [
  { key: 'berserker', prefix: '🔴 Frenético', hpMul: 1.45, spdMul: 1.4, dmgMul: 1.3, ink: INK.RED },
  { key: 'shielded', prefix: '🔵 Blindado', hpMul: 1.5, spdMul: 1.1, dmgMul: 1.2, ink: INK.BLUE },
  { key: 'vampiric', prefix: '🟣 Sanguinário', hpMul: 1.5, spdMul: 1.25, dmgMul: 1.35, ink: INK.PINK },
  { key: 'commander', prefix: '🟡 Comandante', hpMul: 1.85, spdMul: 1.18, dmgMul: 1.3, ink: INK.ORANGE },
];

export class EnemyManager {
  constructor(ctx) {
    this.ctx = ctx; this.enemies = []; this.alive = 0; this.projectiles = new Projectiles(this);
    this.onKill = null; this.onBoss = null; this._sepT = 0; this._slot = 0; this.mods = { speed: 1, damage: 1 };
    this.mirror = false; this.nextId = 1; this.onClientHit = null; this.onSpawn = null; this.byId = new Map();
  }
  targets() { return this.ctx.targets ? this.ctx.targets() : [this.ctx.player]; }
  get waveAlive() {
    let c = 0;
    for (const e of this.enemies) if (e.alive && !e.T.isCivilian && !e.T.isProtester && !e.T.isPolice && !e.T.isPet && !e.T.isRioter) c++;
    return c;
  }
  _disposeMesh(obj) {
    if (!obj) return;
    obj.traverse((child) => {
      if (child.isMesh) {
        if (child.geometry && !child.geometry.userData.shared) try { child.geometry.dispose(); } catch (e) {}
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach((m) => { try { m.dispose(); } catch (e) {} });
          else try { child.material.dispose(); } catch (e) {}
        }
      }
    });
  }
  _pickTarget(e, dt) {
    e.retargetT = (e.retargetT ?? 0) - dt;
    if (e.target && e.target.alive && e.retargetT > 0) return e.target;
    e.retargetT = 0.35;

    if (e.T.isPolice) {
      let lazaroBoss = null, bestLD = Infinity;
      for (const other of this.enemies) {
        if (other.alive && other.T.isLazaro) {
          const d = other.body.pos.distanceToSquared(e.body.pos);
          if (d < bestLD) { bestLD = d; lazaroBoss = other; }
        }
      }
      if (lazaroBoss) { e.target = lazaroBoss; return lazaroBoss; }
    }
    if (e.T.isRioter) {
      let best = null, bd = 32 * 32; const p0 = e.body.pos;
      for (const t of this.targets()) { if (!t.alive) continue; const d = t.body.pos.distanceToSquared(p0); if (d < bd) { bd = d; best = t; } }
      for (const o of this.enemies) {
        if (!o.alive || o === e || o.T.isRioter || o.T.isPet || o.T.flying || o.T.boss || o.state === 'spawn') continue;
        const d = o.body.pos.distanceToSquared(p0); if (d < bd) { bd = d; best = o; }
      }
      if (!best && this.ctx.rioterProps) { bd = Infinity; for (const pr of this.ctx.rioterProps()) { if (!pr.alive) continue; const d = pr.body.pos.distanceToSquared(p0); if (d < bd) { bd = d; best = pr; } } }
      if (!best) best = this.nearestTarget(p0);
      e.target = best; return best;
    }
    if (e.T.isProtester && this.ctx.protestersRiot) {
      let best = null, bd = Infinity;
      for (const t of this.targets()) { if (!t.alive) continue; const d = t.body.pos.distanceToSquared(e.body.pos); if (d < bd) { bd = d; best = t; } }
      e.target = best; return best;
    }
    if (e.T.isProtester) {
      let bestPol = null, bd = Infinity;
      for (const other of this.enemies) { if (!other.alive || !other.T.isPolice) continue; const d = other.body.pos.distanceToSquared(e.body.pos); if (d < bd) { bd = d; bestPol = other; } }
      e.target = bestPol; return bestPol;
    }
    if (e.T.isPolice && !this.ctx.playerWanted) {
      let bestProt = null, bd = Infinity;
      for (const other of this.enemies) {
        if (!other.alive || !(other.T.isProtester || other.T.isRioter || other.T.isLazaro)) continue;
        const w = other.T.isLazaro ? 0.1 : other.T.isRioter ? 0.5 : 1;
        const d = other.body.pos.distanceToSquared(e.body.pos) * w;
        if (d < bd) { bd = d; bestProt = other; }
      }
      e.target = bestProt; return bestProt;
    }
    let best = null, bd = Infinity;
    for (const t of this.targets()) { if (!t.alive) continue; const d = t.body.pos.distanceToSquared(e.body.pos); if (d < bd) { bd = d; best = t; } }
    e.target = best; return best;
  }
  nearestTarget(pos) { let best = null, bd = Infinity; for (const t of this.targets()) { if (!t.alive) continue; const d = t.body.pos.distanceToSquared(pos); if (d < bd) { bd = d; best = t; } } return best; }
  clear() {
    for (const e of this.enemies) { this._removeLaser(e); if (!e.rootDetached) this.ctx.scene.remove(e.root); }
    this.enemies.length = 0; this.alive = 0; this.byId.clear(); this.projectiles.clear();
    if (this.ctx.batcher) this.ctx.batcher.clear();
  }
  prewarm() { for (const type in TYPES) for (let i = 0; i < 2; i++) buildCached(type, TYPES[type], modelBuilder(TYPES[type])); }
  spawn(type, pos, id = null, opts = null) {
    const baseT = TYPES[type] || TYPES.grunt;
    const wave = (this.ctx.game && this.ctx.game.wave) || 1;
    const isCombatBot = !baseT.isCivilian && !baseT.isProtester && !baseT.isPolice && !baseT.isPet && !baseT.isRioter && !baseT.boss;

    let T = baseT, eliteObj = null;
    if (!this.mirror && isCombatBot) {
      const waveHpMul = 1 + Math.max(0, wave - 1) * 0.11;
      const waveSpdMul = 1 + Math.min(0.45, Math.max(0, wave - 1) * 0.032);
      const waveDmgMul = 1 + Math.min(0.85, Math.max(0, wave - 1) * 0.06);
      const eliteChance = opts && opts.forceElite ? 1 : (wave >= 2 && !baseT.isTank ? clamp(0.10 + (wave - 2) * 0.042, 0.10, 0.48) : 0);
      if (Math.random() < eliteChance) eliteObj = choose(ELITE_KINDS);
      T = {
        ...baseT,
        hp: Math.round(baseT.hp * waveHpMul * (eliteObj ? eliteObj.hpMul : 1)),
        speed: +(baseT.speed * waveSpdMul * (eliteObj ? eliteObj.spdMul : 1)).toFixed(2),
        dmg: +(baseT.dmg * waveDmgMul * (eliteObj ? eliteObj.dmgMul : 1)).toFixed(1),
        scale: +(baseT.scale * (eliteObj ? 1.12 : 1)).toFixed(2),
        score: Math.round(baseT.score * (eliteObj ? 1.75 : 1)),
        name: eliteObj ? `${eliteObj.prefix} · ${baseT.name}` : baseT.name,
        ink: eliteObj ? eliteObj.ink : baseT.ink,
      };
    }

    const ink = T.ink ?? INK.RED;
    const mat = makeInkMaterial({ ink, shadeScale: 0, shadeBias: 1 });
    const solid = makeInkMaterial({ ink: T.ink === INK.BLACK ? INK.RED : INK.BLACK, fill: true, side: THREE.DoubleSide });
    const tpl = buildCached(type, baseT, modelBuilder(baseT));
    const model = cloneModel(tpl, mat, solid);
    const hw = T.flying ? 0.45 : T.isTank ? 1.35 : Math.min(0.35 * T.scale, 1.25);
    const role = (T.weapon === 'blade' || T.isStalker || type === 'commando') ? 'flanker' : (T.weapon === 'shotgun' || T.shield || T.isTank) ? 'suppressor' : (this._slot % 3 === 0 ? 'flanker' : 'tactical');

    const e = {
      type, T, mat, root: model.root, parts: model.parts, J: model.J, tip: model.tip, face: model.face, hit: model.hit,
      hp: T.hp, maxHp: T.hp, alive: true, state: 'spawn', t: 0,
      elite: eliteObj ? eliteObj.key : null,
      eliteShield: eliteObj && eliteObj.key === 'shielded' ? Math.round(T.hp * 0.55) : 0,
      maxEliteShield: eliteObj && eliteObj.key === 'shielded' ? Math.round(T.hp * 0.55) : 0,
      shieldRegenT: 0, role, auraSpeed: 1, auraDmg: 1,
      grappleCd: rand(1.5, 3.5), nadeCd: rand(2.5, 5.5), droneCd: rand(3.5, 6.0), stealthT: 0, bossPhase: 1,
      body: makeBody(pos, hw, (T.flying ? 0.8 : T.isTank ? 1.45 : 1.85) * T.scale, T.boss || T.isTank || T.model === 'cavalry' ? 1.25 : 0.65),
      center: new THREE.Vector3(), yaw: rand(0, TAU), yawT: 0, phase: rand(0, TAU), walk: 0, aimAmt: 0, flinch: 0, flashT: 0, flashOn: false,
      path: null, pathI: 0, pathT: 0, pathGoal: null, losT: 0, los: false, cool: rand(0.5, 1.2), burstLeft: 0, burstT: 0, aimT: 0, attackT: 0, attackHit: false, stunDur: 0, stuckT: 0, strafeDir: Math.random() < 0.5 ? 1 : -1, strafeT: rand(1, 2), deadT: 0,
      appAng: (this._slot++) * 2.39996, appR: 0, appT: rand(0, 2), keepMul: rand(0.75, 1.35), backoffT: 0,
      hitSpheres: model.hit.map(() => new THREE.Vector3()), fuseT: -1, shieldHp: T.shield ? 3 : 0, flyState: 'orbit', flyT: rand(0, 3), orbitDir: Math.random() < 0.5 ? 1 : -1, bossAtk: null, rootDetached: false,
    };
    e.id = id ?? this.nextId++; this.byId.set(e.id, e);
    e.takeDamage = (dmg, from) => this.damage(e, dmg, { source: 'bot', dir: _v.subVectors(e.center, from).normalize(), point: e.center.clone() });
    e.body.alwaysStep = true; if (T.flying) e.body.noSnap = true; e.root.position.copy(pos); e.root.scale.setScalar(0.001);
    if (T.isPet) progression.applyToOrelha(e);
    this.ctx.scene.add(e.root); this.enemies.push(e); this.alive++;
    if (this.ctx.batcher) this.ctx.batcher.register(e);
    if (this.onSpawn && !this.mirror) this.onSpawn(e);
    this.ctx.effects.strokeBurst(pos.clone().add(_v.set(0, 1, 0)), T.ink ?? INK.RED, T.boss ? 60 : 26, T.boss ? 10 : 6, { life: 0.5, size: 0.03 }); audio.spawn(pos);
    if (T.boss) {
      audio.bossRoar(pos);
      if (this.onBoss) this.onBoss(e);
      if (T.isLazaro && !this.mirror) this._spawnPoliceTaskForceForLazaro(e);
    }
    return e;
  }
  _spawnPoliceTaskForceForLazaro(lazaro) {
    const ctx = this.ctx, nav = ctx.nav;
    if (this.enemies.filter((x) => x.alive && x.T.isPolice).length >= 7) return;
    const base = lazaro.body.pos, kinds = ['police_tactical', 'police_chief', 'police', 'police_tactical'];
    for (let i = 0; i < kinds.length; i++) {
      const a = (i / kinds.length) * TAU + rand(-0.3, 0.3), r = 18 + rand(0, 10);
      const p = new THREE.Vector3(base.x + Math.cos(a) * r, base.y + 0.3, base.z + Math.sin(a) * r);
      if (nav) { const nid = nav.nearestNode(p, 5, 4); if (nid >= 0) { const nd = nav.nodes[nid]; p.set(nd.x, nd.y + 0.05, nd.z); } }
      const pol = this.spawn(kinds[i], p); pol.state = 'hunt'; pol.target = lazaro;
    }
    audio.siren(base);
    if (ctx.hud) ctx.hud.message('🚨 FORÇA-TAREFA CONTRA LÁZARO!', 'A Polícia Militar, GSI e BOPE cercaram a área e estão ajudando você a caçar Lázaro!', 4.5);
  }
  eye(e, out) { return out.setFromMatrixPosition((e.parts.head || e.parts.torso || e.root).matrixWorld); }
  update(dt) {
    this._lodTick = ((this._lodTick || 0) + 1) % 3;
    if (this.mirror) { this._updateMirror(dt); return; }
    this._pathsLeft = 5;
    const ctx = this.ctx, world = ctx.world, lp = ctx.player.body.pos;
    const commanders = [];
    for (const e of this.enemies) if (e.alive && e.elite === 'commander') commanders.push(e);

    for (const e of this.enemies) {
      this._cur = e; e.t += dt;
      if (!e.alive) { this._updateDead(e, dt); continue; }
      if (e.maxEliteShield > 0 && e.eliteShield < e.maxEliteShield) { e.shieldRegenT -= dt; if (e.shieldRegenT <= 0) e.eliteShield = Math.min(e.maxEliteShield, e.eliteShield + e.maxEliteShield * 0.25 * dt); }
      e.auraSpeed = 1; e.auraDmg = 1;
      if (commanders.length && !e.T.isCivilian && !e.T.isPet && !e.T.isPolice) {
        for (let i = 0; i < commanders.length; i++) if (commanders[i] !== e && commanders[i].body.pos.distanceToSquared(e.body.pos) < 18 * 18) { e.auraSpeed = 1.28; e.auraDmg = 1.3; break; }
      }
      if (e.elite === 'berserker') e.auraSpeed *= (1 + (1 - clamp(e.hp / e.maxHp, 0, 1)) * 0.45);

      const target = this._pickTarget(e, dt), peaceful = !target && (e.T.isPolice || e.T.isProtester);
      const P = target || ctx.player, pp = P.body.pos, pc = P.center;
      if (e.flashT > 0) { e.flashT -= dt; if (e.flashT <= 0 && e.flashOn) { setFill(e.mat, false); e.flashOn = false; } }
      e.flinch = damp(e.flinch, 0, 9, dt);
      if (e.state === 'spawn') {
        const f = clamp(e.t / 0.6, 0, 1); e.root.scale.setScalar(Math.max(0.001, f * e.T.scale * (1 + Math.sin(e.t * 60) * 0.12 * (1 - f))));
        e.root.position.copy(e.body.pos); e.root.rotation.y = e.yaw; this._syncHit(e);
        if (e.t >= 0.6) { e.state = 'hunt'; e.root.scale.setScalar(e.T.scale); }
        continue;
      }
      if (e.root.scale.x !== e.T.scale && e.stealthT <= 0) e.root.scale.setScalar(e.T.scale);
      if (e.state === 'stunned' && e.laser) this._hideLaser(e);
      if (e.T.flying) { this._thinkFlyer(e, dt, pc, P); world.moveBody(e.body, dt); }
      else {
        if (e.state === 'stunned') { if (e.t > e.stunDur) e.state = 'hunt'; }
        else if (peaceful) this._patrolPeaceful(e, dt);
        else if (P.alive) {
          const fx = pp.x - e.body.pos.x, fz = pp.z - e.body.pos.z; e.thinkAcc = (e.thinkAcc || 0) + dt;
          if (fx * fx + fz * fz > 65 * 65 && !e.los && !e.T.boss && !e.T.isTank) { if (e.thinkAcc >= 0.16) { this._think(e, e.thinkAcc, pp, pc, P); e.thinkAcc = 0; } }
          else { this._think(e, e.thinkAcc, pp, pc, P); e.thinkAcc = 0; }
        } else this._wander(e, dt);
        e.body.vel.y -= 24 * dt; world.moveBody(e.body, dt);
      }
      if (e.body.pos.y < (ctx.level && ctx.level.killY != null ? ctx.level.killY : -6)) {
        if (e.T.isPet) { const tp = this.nearestTarget(e.body.pos) || ctx.player; e.body.pos.copy(tp.body.pos); e.body.pos.y += 0.5; e.body.vel.set(0, 0, 0); }
        else { this.kill(e, { source: 'fall', dir: _up.clone() }); continue; }
      }
      e.yaw = angleLerp(e.yaw, e.yawT, 1 - Math.exp(-10 * dt));
      e.root.position.copy(e.body.pos); e.root.rotation.y = e.yaw;
      if (!e.T.flying) {
        const pr = 0.36 + e.body.halfW + 0.12, ox = e.body.pos.x - pp.x, oz = e.body.pos.z - pp.z, o2 = ox * ox + oz * oz;
        if (o2 < pr * pr && Math.abs(e.body.pos.y - pp.y) < 1.8) {
          const od = Math.sqrt(o2) || 0.0001, push = pr - od;
          e.body.pos.x += ox / od * push; e.body.pos.z += oz / od * push;
          if (world.overlapsBody(e.body)) { e.body.pos.x -= ox / od * push; e.body.pos.z -= oz / od * push; }
        }
      }
      const ldx = e.body.pos.x - lp.x, ldz = e.body.pos.z - lp.z, farBot = ldx * ldx + ldz * ldz > 58 * 58;
      if (!farBot || ((e.id + this._lodTick) % 3) === 0) {
        const animDt = farBot ? dt * 3 : dt;
        if (e.T.flying) this._animateFlyer(e, animDt); else this._animate(e, animDt, pc);
        this._syncHit(e);
      } else e.center.set(e.body.pos.x, e.body.pos.y + 1.0 * e.T.scale, e.body.pos.z);
    }
    this._cur = null; this._separate(dt); this.projectiles.update(dt);
    for (let i = this.enemies.length - 1; i >= 0; i--) { const e = this.enemies[i]; if (!e.alive && e.deadT > 3.5) { this._removeLaser(e); if (!e.rootDetached) { this.ctx.scene.remove(e.root); this._disposeMesh(e.root); } this.byId.delete(e.id); this.enemies.splice(i, 1); } }
  }
  _syncHit(e) { e.root.updateMatrixWorld(true); for (let i = 0; i < e.hit.length; i++) e.hitSpheres[i].setFromMatrixPosition(e.parts[e.hit[i][0]].matrixWorld); e.center.setFromMatrixPosition((e.parts.torso || e.parts.head || e.root).matrixWorld); }
  _updateDead(e, dt) {
    e.deadT += dt; const tp = e.topple; if (!tp || e.rootDetached) return;
    if (tp.t < 1) { tp.t = Math.min(1, tp.t + dt * 2.2); const a = tp.sign * (Math.PI / 2) * (1 - Math.pow(1 - tp.t, 2)); const hp = (e.J && e.J.hips && e.J.hips.parent) ? e.J.hips.parent : e.root; if (tp.axis === 'x') hp.rotation.x = a; else hp.rotation.z = a; }
    if (e.deadT > 8.3) e.root.scale.setScalar(Math.max(0.001, (9 - e.deadT) / 0.7 * e.T.scale));
    e.root.rotation.y = e.yaw;
  }
  _separate(dt) {
    this._sepT -= dt; if (this._sepT > 0) return; this._sepT = 0.05; const es = this.enemies;
    for (let i = 0; i < es.length; i++) { const a = es[i]; if (!a.alive || a.T.flying) continue;
      for (let j = i + 1; j < es.length; j++) { const b = es[j]; if (!b.alive || b.T.flying) continue;
        const dx = b.body.pos.x - a.body.pos.x, dz = b.body.pos.z - a.body.pos.z, maxSep = a.body.halfW + b.body.halfW + 0.85;
        if (dx > maxSep || dx < -maxSep || dz > maxSep || dz < -maxSep) continue;
        const d2 = dx * dx + dz * dz; if (d2 > maxSep * maxSep || d2 < 1e-6 || Math.abs(b.body.pos.y - a.body.pos.y) > 2.2) continue;
        const d = Math.sqrt(d2), push = (maxSep - d) * 9; a.body.vel.x -= dx / d * push; a.body.vel.z -= dz / d * push; b.body.vel.x += dx / d * push; b.body.vel.z += dz / d * push; } }
  }
}

Object.assign(EnemyManager.prototype, EnemyCombatMixin, EnemyNetSyncMixin, EnemyAnimMixin, TacticalAIMixin, VehicleAIMixin, CivilianAIMixin, BossAIMixin);
