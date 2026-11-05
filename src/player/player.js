// First-person player core: movement (sprint/slide/wall-jump/mantle/air dash), camera feel, health,
// weapon switching and the per-frame update loop. The shop, grenades, rockets and grapple each live
// in their own module and are mixed onto the prototype at the bottom of this file.
import * as THREE from 'three';
import { makeBody } from '../physics.js';
import { makeInkMaterial, INK } from '../render.js';
import { Revolver, Shotgun, SMG, Rifle, Sniper, LaserRifle, Bazooka, Katana } from '../weapons/index.js';
import { clamp, damp, rand, Spring } from '../util.js';
import { audio } from '../audio.js';
import {
  G, WALK, SPRINT, CROUCH, ACCEL, FRICTION, AIR_ACCEL, AIR_CAP, JUMP,
  STAND_H, CROUCH_H, EYE_STAND, EYE_CROUCH,
  STAM_DRAIN, STAM_GROUND, STAM_AIR, STAM_MIN, STAM_PAUSE, PARRY_WINDOW,
} from './constants.js';
import { ShopMixin } from './shop.js';
import { GrenadeMixin } from './grenades.js';
import { RocketMixin } from './rockets.js';
import { GrappleMixin } from './grapple.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _d = new THREE.Vector3(), _fwd = new THREE.Vector3(), _right = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);

export class Player {
  constructor(ctx) {
    this.ctx = ctx; this.camera = ctx.camera; this.camera.rotation.order = 'YXZ';
    this.body = makeBody(ctx.level.playerStart, 0.35, STAND_H, 0.55);
    this.yaw = 0; this.pitch = 0; this.maxHp = 120; this.hp = 120; this.alive = true; this.regenDelay = 4.5; this.regenRate = 11; this.nadeCharge = 0; this._nadeHeld = false; this.grapStam = 1; this.blockHeld = 0; this.stamPause = 0;
    this.eye = new THREE.Vector3(); this.center = new THREE.Vector3(); this.forward = new THREE.Vector3(0, 0, -1); this.right = new THREE.Vector3(1, 0, 0);
    this.speed = 0; this.hurtFx = 0; this.flashFx = 0; this.lastDamageT = 10;
    this.rig = new THREE.Group(); this.camera.add(this.rig); ctx.scene.add(this.camera);
    this.weapons = [new Revolver(ctx), new Shotgun(ctx), new SMG(ctx), new Rifle(ctx), new Sniper(ctx), new LaserRifle(ctx), new Bazooka(ctx), new Katana(ctx)]; this.katanaIndex = 7;
    for (const w of this.weapons) { this.rig.add(w.root); if (w.isGun) w.startReserve = w.reserve; }
    this.weapons[0].owned = true;  // Revolver (pistola inicial)
    this.weapons[1].owned = false; // Escopeta ($600)
    this.weapons[2].owned = false; // Submetralhadora SMG ($750)
    this.weapons[3].owned = false; // Rifle de Assalto ($900)
    this.weapons[4].owned = false; // Sniper ($1200)
    this.weapons[5].owned = false; // Fuzil de Plasma Laser ($1500)
    this.weapons[6].owned = false; // Bazuca ($1800)
    this.weapons[7].owned = true;  // Katana (faca corpo a corpo)
    this.money = 300; this.armor = 0; this.maxArmor = 100;
    this.weaponIndex = 0; this.weapon = this.weapons[0]; this.weapon.equip(); this.returnT = 0; this.prevWeaponIndex = 0;
    this.recoilPitch = new Spring(190, 17); this.recoilYaw = new Spring(190, 17); this.fovKick = new Spring(220, 14); this.landDip = new Spring(170, 15);
    this.roll = 0; this.fov = 82; this.bobPhase = 0; this.bobAmt = 0; this.stepDist = 0; this.eyeH = EYE_STAND;
    this.crouching = false; this.sliding = false; this.slideT = 0; this.coyote = 0; this.jumpBuffer = 0; this.wallTouch = 9; this.wallN = new THREE.Vector3(); this.wallJumpCd = 0; this.mantleCd = 0;
    this.dashCd = 0; this.airJumps = 1; this.blockCd = 0; this.landGraceT = 0; this.sprintToggle = false; this.lastGround = true; this.airT = 0; this._sprinting = false; this._aiming = false; this._mv = { x: 0, y: 0 };
    this.grapple = { state: 'idle', anchor: new THREE.Vector3(), hook: new THREE.Vector3(), from: new THREE.Vector3(), flyT: 0, flyDur: 0, len: 0, cd: 0, enemy: null, mover: null, blockedT: 0, t: 0, swingT: 0, hopT: 0 };
    this.deathT = 0; this.gravityScale = 1; this.dashLock = false;
    this.isLocal = true; this.team = 0; this.name = 'you'; this.grenades = 3; this.maxGrenades = 5; this.nades = []; this.nadeCd = 0; this.firing = false; this.onThrow = null;
    this.rockets = []; this.onRocket = null;
    const rm = makeInkMaterial({ ink: INK.BLUE, fill: false, shadeBias: -0.3 });
    this.rope = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 6), rm); this.rope.visible = false; ctx.scene.add(this.rope);
    const hm = makeInkMaterial({ ink: INK.BLUE }); this.hookMesh = new THREE.Group();
    this.hookMesh.add(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 10), hm)); const hb = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.08), hm); hb.position.y = -0.2; this.hookMesh.add(hb);
    this.hookMesh.visible = false; ctx.scene.add(this.hookMesh);
  }
  reset(pos) {
    this.nadeCharge = 0; this._nadeHeld = false; if (this._arc) this.updateNadeArc(-1); this.grapStam = 1; this.blockHeld = 0;
    const b = this.body; b.pos.copy(pos); b.vel.set(0, 0, 0); b.onGround = false; b.height = STAND_H;
    this.hp = this.maxHp; this.alive = true; this.yaw = 0; this.pitch = 0; this.roll = 0; this.hurtFx = 0; this.flashFx = 0; this.crouching = false; this.sliding = false; this.deathT = 0; this.lastDamageT = 10; this.dashCd = 0; this.airJumps = 1; this.gravityScale = 1; this.dashLock = false;
    this.detachGrapple(false);
    for (const w of this.weapons) if (w.isGun) { w.mag = w.magSize; w.reserve = w.startReserve; w.reloading = false; w.pumpT = 0; }
    this.money = 300; this.armor = 0;
    this.weapons[0].owned = true;
    for (let i = 1; i <= 6; i++) this.weapons[i].owned = false;
    this.weapons[7].owned = true;
    this.switchTo(0, true); this.rig.visible = true; this.eyeH = EYE_STAND; this.grenades = 3; this.clearNades(); this.clearRockets();
    if (this.ctx.hud) { this.ctx.hud.setMoney(this.money); this.ctx.hud.setArmor(0, this.maxArmor); }
  }
  get isBlocking() { return this.weapon.kind === 'katana' && this.weapon.blocking; }
  aimDir(spread = 0) { const d = this.forward.clone(); if (spread > 0) { d.addScaledVector(this.right, rand(-spread, spread)); d.y += rand(-spread, spread); d.normalize(); } return d; }
  recoil(p, y) { this.pitch = clamp(this.pitch + p * 0.55, -1.5, 1.5); this.recoilPitch.kick(p * 22); this.recoilYaw.kick(y * 30); }
  kickFov(v) { this.fovKick.kick(v * 30); }
  lunge(speed) {
    const d = this.forward.clone(); d.y = clamp(d.y, -0.2, 0.5); d.normalize(); const b = this.body;
    b.vel.addScaledVector(d, speed); if (b.onGround) { b.vel.y = Math.max(b.vel.y, 2.5); b.onGround = false; }
    audio.dash(); this.kickFov(3);
  }
  cycleWeapon(dir) {
    let next = this.weaponIndex;
    for (let k = 0; k < this.weapons.length; k++) {
      next = (next + dir + this.weapons.length) % this.weapons.length;
      if (this.weapons[next] && this.weapons[next].owned) {
        this.switchTo(next);
        break;
      }
    }
  }
  switchTo(i, silent = false) {
    if (i < 0 || i >= this.weapons.length) return;
    const target = this.weapons[i];
    if (target && !target.owned) {
      if (this.ctx.hud) this.ctx.hud.message('Arma Bloqueada!', 'Pressione B para comprar na Loja', 1.2);
      audio.empty();
      return;
    }
    if (i === this.weaponIndex && !silent) return;
    if (this.weapon.kind !== 'katana') this.prevWeaponIndex = this.weaponIndex;
    this.weapon.unequip(); this.weaponIndex = i; this.weapon = this.weapons[i]; this.weapon.equip(); if (!silent) audio.switchWeapon();
    this.ctx.hud.setWeapon(this.weapon.name, this.weapon.hint); this.ctx.hud.setCrosshairMode(this.weapon.kind === 'katana' ? 'katana' : '');
  }
  addAmmoAll(frac = 0.5) { for (const w of this.weapons) if (w.isGun && w.owned) w.addAmmo(Math.round(w.maxReserve * frac)); }
  takeDamage(amount, fromPos) {
    if (!this.alive) return;
    let finalAmount = amount;
    if (this.armor > 0) {
      const absorb = Math.min(this.armor, amount * 0.7);
      this.armor -= absorb;
      finalAmount = amount - absorb;
      audio.parry();
      if (this.ctx.hud) this.ctx.hud.setArmor(this.armor, this.maxArmor);
    }
    this.hp -= finalAmount; this.lastDamageT = 0; this.hurtFx = Math.min(1, this.hurtFx + finalAmount / 40);
    this.ctx.effects.shakeAmt += 0.2 + finalAmount / 80; audio.hurt(); this.ctx.input.rumble(0.8, 0.5, 160);
    if (fromPos) { _v.subVectors(fromPos, this.eye); const x = _v.dot(this.right), f = _v.dot(this.forward); this.ctx.hud.damageFrom(Math.atan2(x, f)); }
    if (this.hp <= 0) { this.hp = 0; this.die(); }
  }
  knockback(dir, amount) { const b = this.body; b.vel.addScaledVector(dir, amount); b.vel.y += amount * 0.5; b.onGround = false; }
  // The guard only covers what is right in front of the blade: a modest reach and a narrow
  // cone, so shots from your flank still land and holding block is not a free win.
  get blockRadius() { return this.isBlocking && this.blockCd <= 0 ? 0.95 : 0; }
  tryDeflect(proj) {
    if (!this.alive || !this.isBlocking || this.blockCd > 0) return false;
    // block only what is flying in at you from the front; flank and back shots get through
    _v.copy(proj.vel).normalize().negate();
    if (_v.dot(this.forward) < 0.55) return false;
    const perfect = this.weapon.blockT < 0.26;
    const ctx = this.ctx;
    // only a well timed guard sends it back; otherwise the round is simply knocked out of the air
    const ret = perfect || Math.random() < 0.35;
    this.blockCd = 0.19;                                        // the blade has to come back before the next parry
    this.weapon.onDeflect(perfect);
    if (perfect) audio.perfectParry(); else audio.parry();
    ctx.effects.sparks(proj.pos, _v2.copy(proj.vel).normalize().negate(), INK.ORANGE, perfect ? 14 : 8, 10);
    ctx.effects.strokeBurst(proj.pos, INK.BLUE, perfect ? 8 : 5, 4.5, { life: 0.2, size: 0.028 });
    ctx.input.rumble(0.4, 0.6, 70); ctx.game.hitstop(perfect ? 0.07 : 0.025, 0.18);
    ctx.effects.shakeAmt += 0.06; this.flashFx = perfect ? 0.35 : 0.1;
    ctx.game.addScore(perfect ? 60 : 15, perfect ? 'Aparada Perfeita' : 'Bloqueio Efetuado');
    return { perfect, ret };
  }
  get parryWindow() { return this.isBlocking && this.blockHeld < PARRY_WINDOW; }
  tryBlockMelee(e) {
    if (!this.alive || !this.parryWindow || this.blockCd > 0) return false;
    _v.subVectors(e.center, this.eye).normalize(); if (_v.dot(this.forward) < 0.35) return false;
    this.weapon.onDeflect(true); audio.parry(); this.ctx.game.hitstop(0.06, 0.15);
    this.ctx.effects.sparks(_v2.copy(this.eye).addScaledVector(this.forward, 0.8), this.forward.clone().negate(), INK.ORANGE, 12, 8);
    this.ctx.game.addScore(40, 'Bloqueio Efetuado'); this.ctx.input.rumble(0.6, 0.6, 100); return true;
  }
  die() {
    this.alive = false; this.deathT = 0; audio.death(); this.detachGrapple(false);
    // Ao morrer, dropa as armas equipadas no chão para qualquer jogador coletar
    if (this.ctx.survival && this.ctx.survival.spawnPickup) {
      for (let i = 1; i <= 6; i++) {
        const w = this.weapons[i];
        if (w && w.owned) {
          const dropPos = this.body.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 2.5, 0, (Math.random() - 0.5) * 2.5));
          this.ctx.survival.spawnPickup('drop_' + w.kind, dropPos);
        }
      }
    }
    const online = this.ctx.game.mode === 'ffa';
    if (!online) this.money = 0;
    this.armor = 0;
    for (let i = 1; i <= 6; i++) this.weapons[i].owned = false;
    this.switchTo(0, true);
    if (this.ctx.hud) { this.ctx.hud.setMoney(this.money); this.ctx.hud.setArmor(0, this.maxArmor); }
    this.ctx.game.onPlayerDeath();
  }

  idleCam(t) {
    const c = this.camera; c.position.set(Math.sin(t * 0.08) * 70, 30 + Math.sin(t * 0.23) * 4, Math.cos(t * 0.08) * 70); c.lookAt(0, 10, 0); this.rig.visible = false;
    this.eye.copy(c.position); this.center.copy(c.position); c.getWorldDirection(this.forward); this.right.set(this.forward.z, 0, -this.forward.x).normalize();
    if (Math.abs(c.fov - 70) > 0.01) { c.fov = 70; c.updateProjectionMatrix(); }
  }

  update(dt) {
    const ctx = this.ctx, inp = ctx.input, b = this.body;
    this.lastDamageT += dt;
    if (!this.alive) {
      this.deathT += dt; this.eyeH = damp(this.eyeH, 0.35, 3, dt); this.roll = damp(this.roll, 0.9, 3, dt); this.pitch = damp(this.pitch, -0.35, 3, dt);
      b.vel.x = damp(b.vel.x, 0, 4, dt); b.vel.z = damp(b.vel.z, 0, 4, dt); b.vel.y -= G * dt; ctx.world.moveBody(b, dt);
      this.forward.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)); this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.updateNades(dt); this.updateRockets(dt); this._updateCamera(dt); this.weapon.animate(dt, this._weaponState(false, false, 0)); return;
    }
    this.rig.visible = true;
    // ---- look ----
    const lookMul = this._aiming ? (this.weapon.scope ? 0.38 : 0.62) : 1;
    this.yaw += inp.look.x * lookMul; this.pitch = clamp(this.pitch + inp.look.y * lookMul, -1.5, 1.5);
    this.forward.set(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch));
    _fwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); _right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw)); this.right.copy(_right);
    if (this.dashLock) {
      // the focus dash is sprinting the body across the level itself; don't fight it with gravity
      b.vel.set(0, 0, 0); b.onGround = false; this.coyote = 0.13;
      this._updateCamera(dt); this.weapon.animate(dt, this._weaponState(false, false, 0));
      return;
    }
    // ---- movement input ----
    const mv = inp.move; this._mv = mv;
    const wish = _v.set(0, 0, 0).addScaledVector(_fwd, mv.y).addScaledVector(_right, mv.x); let wishLen = wish.length(); if (wishLen > 1e-4) wish.divideScalar(wishLen); wishLen = Math.min(1, wishLen);
    if (inp.usingGamepad) { if (inp.pressed('sprint')) this.sprintToggle = !this.sprintToggle; if (mv.y < 0.1) this.sprintToggle = false; } else this.sprintToggle = inp.down('sprint');
    const aiming = this._aiming = inp.down('aim') && this.weapon.isGun;
    const hspeed = Math.hypot(b.vel.x, b.vel.z);
    const crouchDown = inp.down('crouch');
    if (inp.pressed('crouch') && b.onGround && hspeed > 6.3 && !this.sliding) this._startSlide(hspeed);
    if (this.sliding) { this.slideT += dt; if (!crouchDown || hspeed < 3.5 || this.airT > 0.35) this.sliding = false; }
    let wantCrouch = (crouchDown && b.onGround) || this.sliding;
    if (!wantCrouch && this.crouching) { b.height = STAND_H; if (ctx.world.overlapsBody(b)) wantCrouch = true; }
    this.crouching = wantCrouch; b.height = this.crouching ? CROUCH_H : STAND_H;
    const sprinting = this._sprinting = this.sprintToggle && mv.y > 0.1 && !this.crouching && !aiming;
    const maxSpeed = this.crouching && !this.sliding ? CROUCH : sprinting ? SPRINT : WALK;
    this.landGraceT -= dt; this.dashCd -= dt; this.blockCd -= dt;
    // ---- ground / air accel ----
    if (b.onGround) {
      this.coyote = 0.13; this.airT = 0; this.airJumps = 1;
      if (this.sliding) {
        const sp = hspeed; if (sp > 0) { const ns = Math.max(0, sp - 6.5 * dt) / sp; b.vel.x *= ns; b.vel.z *= ns; }
        if (wishLen > 0) { b.vel.x += wish.x * 6 * dt; b.vel.z += wish.z * 6 * dt; const n2 = Math.hypot(b.vel.x, b.vel.z); if (n2 > sp && n2 > 0) { b.vel.x *= sp / n2; b.vel.z *= sp / n2; } }
      } else {
        const fr = FRICTION * (this.landGraceT > 0 ? 0.25 : 1);
        const sp = hspeed; if (sp > 0) { const ns = Math.max(0, sp - sp * fr * dt) / sp; b.vel.x *= ns; b.vel.z *= ns; }
        if (wishLen > 0) { const cur = b.vel.x * wish.x + b.vel.z * wish.z; const add = Math.min(maxSpeed * wishLen - cur, ACCEL * dt); if (add > 0) { b.vel.x += wish.x * add; b.vel.z += wish.z * add; } }
      }
    } else {
      this.coyote -= dt; this.airT += dt;
      if (wishLen > 0) { const cur = b.vel.x * wish.x + b.vel.z * wish.z; const add = Math.min(AIR_CAP * wishLen - cur, AIR_ACCEL * dt); if (add > 0) { b.vel.x += wish.x * add; b.vel.z += wish.z * add; } }
    }
    // ---- jumping / wall jump / air dash ----
    if (inp.pressed('jump')) this.jumpBuffer = 0.15; else this.jumpBuffer -= dt;
    this.wallJumpCd -= dt; this.mantleCd -= dt;
    if (b.hitWall && !b.onGround) { this.wallTouch = 0; this.wallN.copy(b.wallNormal); } else this.wallTouch += dt;
    if (this.jumpBuffer > 0) {
      if (this.grapple.state === 'on') { this.jumpBuffer = 0; this.detachGrapple(true); }
      else if (b.onGround || this.coyote > 0) {
        this.jumpBuffer = 0; this.coyote = 0; b.vel.y = JUMP; b.onGround = false; this.airJumps = 1;
        if (this.sliding) { b.vel.x *= 1.06; b.vel.z *= 1.06; this.sliding = false; }
        audio.jump(); this.landDip.kick(-1.2);
      } else if (this.wallTouch < 0.12 && this.wallJumpCd <= 0 && b.vel.y < 7) {
        this.jumpBuffer = 0; this.wallJumpCd = 0.35; const n = this.wallN;
        b.vel.x = n.x * 7.5 + b.vel.x * 0.35 + _fwd.x * 2.5; b.vel.z = n.z * 7.5 + b.vel.z * 0.35 + _fwd.z * 2.5; b.vel.y = 9.2;
        audio.wallJump(); this.roll += n.dot(_right) > 0 ? -0.1 : 0.1; this.kickFov(2); this.landDip.kick(-1.5);
        this.airJumps = 1;
      } else if (this.airJumps > 0) {
        // double jump: a second beat of height, and it redirects toward where you are steering
        this.jumpBuffer = 0; this.airJumps--;
        b.vel.y = JUMP * 0.92;
        if (wishLen > 0) { const cur = b.vel.x * wish.x + b.vel.z * wish.z; const add = Math.max(0, 7.5 * wishLen - cur); b.vel.x += wish.x * add; b.vel.z += wish.z * add; }
        audio.jump(); this.kickFov(1.6); this.landDip.kick(-1.4);
        _v2.copy(this.center); _v2.y -= 0.7;
        this.ctx.effects.strokeBurst(_v2, INK.BLUE, 9, 4.5, { life: 0.28, size: 0.028, gravity: -2 });
      }
    }
    if ((inp.pressed('dash') || (inp.pressed('crouch') && !b.onGround)) && !b.onGround && this.dashCd <= 0 && this.grapple.state !== 'on') this._dash(wishLen > 0 ? wish : _fwd);
    // ---- gravity, grapple, mantle, integrate ----
    b.vel.y -= G * this.gravityScale * (this.grapple.state === 'on' ? 0.88 : 1) * dt;
    this._updateGrapple(dt);
    if (!b.onGround && this.mantleCd <= 0 && mv.y > 0.3 && b.vel.y < 8 && this.grapple.state !== 'on') this._tryMantle(_fwd);
    b.noSnap = this.grapple.state === 'on' || b.vel.y > 0.5;
    const spd = b.vel.length(); if (spd > 48) b.vel.multiplyScalar(48 / spd);
    ctx.world.moveBody(b, dt);
    const LB = ctx.level.bounds; // out of the map: uses each map's own bounds (Brasília is far bigger than 95)
    if (b.pos.y < -12 || b.pos.x < LB.minX - 8 || b.pos.x > LB.maxX + 8 || b.pos.z < LB.minZ - 8 || b.pos.z > LB.maxZ + 8) {
      this.detachGrapple(false); b.pos.copy(ctx.level.playerStart); b.vel.set(0, 0, 0); this.takeDamage(20, null); if (this.onFall) this.onFall();
      ctx.hud.message('Caiu do Caderno', 'Redesenhado no ponto inicial', 1.8);
    }
    if (b.onGround && !this.lastGround) {
      const impact = clamp(-b.landVel / 14, 0, 1.5); this.landDip.kick(-impact * 6 - 0.5); audio.land(impact);
      if (impact > 0.8) { ctx.effects.shakeAmt += impact * 0.15; ctx.input.rumble(impact * 0.4, 0.2, 80); }
      if (Math.hypot(b.vel.x, b.vel.z) > 9) this.landGraceT = 0.4;
    }
    this.lastGround = b.onGround;
    // ---- regen, bob, footsteps ----
    if (this.lastDamageT > this.regenDelay && this.hp < this.maxHp && !this._sprinting && this.grapple.state === 'idle') this.hp = Math.min(this.maxHp, this.hp + this.regenRate * dt);
    this.blockHeld = this.isBlocking ? this.blockHeld + dt : 0;
    // the grapple runs on breath: hanging drains it, feet on the ground bring it back fast
    this.stamPause -= dt;
    if (this.grapple.state !== 'idle') this.grapStam -= STAM_DRAIN * dt; else if (this.stamPause <= 0) this.grapStam += (b.onGround ? STAM_GROUND : STAM_AIR) * dt;
    this.grapStam = clamp(this.grapStam, 0, 1);
    if (this.grapple.state === 'on' && this.grapStam <= 0) { this.detachGrapple(false); ctx.hud.tip('Sem fôlego · Pouse para recuperar o fôlego', 1.4); }
    const hs2 = Math.hypot(b.vel.x, b.vel.z); const moving = b.onGround && hs2 > 0.6 && !this.sliding;
    this.bobAmt = damp(this.bobAmt, moving ? clamp(hs2 / 7, 0.3, 1.4) : 0, 8, dt);
    if (moving) { this.bobPhase += dt * (7 + hs2 * 0.5); this.stepDist += hs2 * dt; if (this.stepDist > (sprinting ? 2.5 : 2.0)) { this.stepDist = 0; audio.footstep(clamp(hs2 / 8, 0.3, 1)); } }
    this._updateCamera(dt);
    // ---- grenades ----
    this.nadeCd -= dt;
    if (inp.down('grenade') && this.grenades > 0 && this.nadeCd <= 0 && this.alive && !this.dashLock) { this.nadeCharge = Math.min(1, this.nadeCharge + dt / 1.1); this._nadeHeld = true; }
    else if (this._nadeHeld) { this._nadeHeld = false; if (this.grenades > 0 && this.nadeCd <= 0 && this.alive) this.throwGrenade(null, this.nadeCharge); this.nadeCharge = 0; }
    this.updateNadeArc(this._nadeHeld ? this.nadeCharge : -1);
    this.updateNades(dt);
    this.updateRockets(dt);
    // ---- weapons ----
    for (let i = 0; i < 8; i++) if (inp.pressed('slot' + (i + 1))) this.switchTo(i);
    if (inp.pressed('nextWeapon')) this.cycleWeapon(1);
    if (inp.pressed('prevWeapon')) this.cycleWeapon(-1);
    if (inp.wheel !== 0) { this.cycleWeapon(inp.wheel > 0 ? 1 : -1); inp.wheel = 0; }
    const st = this._weaponState(sprinting, aiming, hs2);
    if (inp.pressed('melee') && this.weapon.kind !== 'katana') { this.switchTo(this.katanaIndex); this.returnT = 0.85; this.weapons[this.katanaIndex].startSlash(st); st.meleePressed = false; }
    if (this.returnT > 0) { if (this.weapon.kind === 'katana' && (st.firePressed || st.aim || st.meleePressed)) this.returnT = 0; else { this.returnT -= dt; if (this.returnT <= 0) this.switchTo(this.prevWeaponIndex); } }
    this.firing = st.fire && this.weapon.isGun;
    this.weapon.animate(dt, st);
    ctx.hud.setAds(this.weapon.isGun && this.weapon.aimAmt > 0.55);
    ctx.hud.setScope(!!this.weapon.scope && this.weapon.aimAmt > 0.62);
  }
  _weaponState(sprinting, aiming, hs) {
    const inp = this.ctx.input, b = this.body;
    return { fire: inp.down('fire'), firePressed: inp.pressed('fire'), aim: aiming || (inp.down('aim') && this.weapon.kind === 'katana'), reloadPressed: inp.pressed('reload'), meleePressed: inp.pressed('melee') && this.weapon.kind === 'katana',
      sprinting, grounded: b.onGround, speed: hs, sliding: this.sliding, lookDelta: inp.look, strafe: this._mv.x, bobPhase: this.bobPhase, bobAmt: this.bobAmt, landDip: clamp(-this.landDip.value * 0.08, -0.5, 0.5), slideTilt: this.sliding ? 1 : 0, blockFire: !this.alive };
  }
  _startSlide(hs) {
    this.sliding = true; this.slideT = 0; const b = this.body; const boost = clamp(12.8 - hs, 0, 4.5);
    b.vel.x += b.vel.x / hs * boost; b.vel.z += b.vel.z / hs * boost; audio.slide(); this.kickFov(2.5); this.landDip.kick(-2.5);
  }
  _dash(dir) {
    const b = this.body; this.dashCd = 1.3; const cur = b.vel.x * dir.x + b.vel.z * dir.z; const target = Math.max(cur + 6, 14);
    b.vel.x += dir.x * (target - cur); b.vel.z += dir.z * (target - cur); b.vel.y = Math.max(b.vel.y, 2);
    audio.dash(); this.kickFov(4); this.ctx.input.rumble(0.3, 0.6, 70); this.roll += (dir.x * this.right.x + dir.z * this.right.z) * 0.08;
    _v2.copy(this.center).addScaledVector(dir, -0.6); this.ctx.effects.strokeBurst(_v2, INK.BLUE, 10, 5, { life: 0.25, size: 0.03 });
  }
  _tryMantle(fwd) {
    const b = this.body, world = this.ctx.world;
    _v2.set(b.pos.x, b.pos.y + 1.0, b.pos.z); if (!world.raycast(_v2, fwd, 0.95)) return;
    _v2.set(b.pos.x + fwd.x * 0.95, b.pos.y + 2.75, b.pos.z + fwd.z * 0.95);
    const top = world.raycast(_v2, _down, 2.25); if (!top || top.normal.y < 0.5) return;
    const dy = top.point.y - b.pos.y; if (dy < 0.5 || dy > 2.4) return;
    const hw = b.halfW; if (world.overlapsAABB({ x: _v2.x - hw, y: top.point.y + 0.08, z: _v2.z - hw }, { x: _v2.x + hw, y: top.point.y + CROUCH_H, z: _v2.z + hw })) return;
    b.vel.y = Math.min(11, Math.sqrt(2 * G * (dy + 0.45))); b.vel.x = fwd.x * 3.2; b.vel.z = fwd.z * 3.2; this.mantleCd = 0.7; audio.mantle(); this.landDip.kick(-2.5); this.kickFov(1.5);
  }
  _updateCamera(dt) {
    const b = this.body, cam = this.camera, mv = this._mv;
    const targetEye = this.crouching ? EYE_CROUCH : EYE_STAND; this.eyeH = this.alive ? damp(this.eyeH, targetEye, 14, dt) : this.eyeH;
    this.recoilPitch.update(dt); this.recoilYaw.update(dt); this.fovKick.update(dt); this.landDip.update(dt);
    if (this.alive) this.roll = damp(this.roll, -mv.x * 0.022 + (this.sliding ? -0.08 : 0), 9, dt);
    const sh = this.ctx.effects.shakeAmt; this.ctx.effects.shakeAmt = damp(sh, 0, 7, dt); const shk = Math.min(sh, 1.2);
    const bobY = Math.abs(Math.sin(this.bobPhase)) * 0.03 * this.bobAmt, bobX = Math.cos(this.bobPhase * 0.5) * 0.018 * this.bobAmt;
    this.eye.set(b.pos.x, b.pos.y + this.eyeH + this.landDip.value * 0.07 + bobY, b.pos.z);
    this.center.set(b.pos.x, b.pos.y + b.height * 0.55, b.pos.z);
    cam.position.copy(this.eye).addScaledVector(this.right, bobX + (Math.random() - 0.5) * shk * 0.07); cam.position.y += (Math.random() - 0.5) * shk * 0.07;
    cam.rotation.set(this.pitch + this.recoilPitch.value + (Math.random() - 0.5) * shk * 0.035, this.yaw + this.recoilYaw.value + (Math.random() - 0.5) * shk * 0.035, this.roll + Math.sin(this.bobPhase * 0.5) * 0.004 * this.bobAmt);
    const sp3 = b.vel.length();
    let fov = 82 + clamp((sp3 - 7) / 16, 0, 1) * 8 + (this._sprinting ? 3 : 0) + (this.sliding ? 4 : 0) + (this.grapple.state === 'on' ? 3 : 0) + this.fovKick.value;
    if (this._aiming) fov = this.weapon.adsFov;
    this.fov = damp(this.fov, fov, this._aiming ? 16 : 8, dt); if (Math.abs(cam.fov - this.fov) > 0.01) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
    this.hurtFx = damp(this.hurtFx, 0, 3, dt); this.flashFx = damp(this.flashFx, 0, 10, dt); this.speed = sp3;
  }
}

// The player's feature subsystems live in their own modules and are mixed onto the prototype here,
// so every `this.buyItem(...)`, `this.throwGrenade(...)`, `this.fireRocket(...)`, `this._fireGrapple(...)` call resolves.
Object.assign(Player.prototype, ShopMixin, GrenadeMixin, RocketMixin, GrappleMixin);
