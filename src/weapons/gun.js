// Hitscan firearm base: ammo, reload animations, firing, raycast hit resolution and the gun stat table.
import * as THREE from 'three';
import { makeInkMaterial, INK } from '../render.js';
import { SEE_THROUGH } from '../physics.js';
import { rand, clamp, damp, TAU } from '../util.js';
import { audio } from '../audio.js';
import { ViewModel } from './viewmodel.js';
import { easeOut } from './primitives.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

export const GUNS = {
  rifle: { name: 'Rifle', hint: 'Automático · Alinhe a mira neles', kind: 'rifle', magSize: 35, reserve: 175, maxReserve: 350, interval: 1 / 11, damage: 24, headMul: 2.6, pellets: 1, spread: 0.016, adsSpread: 0.0034, spreadKick: 0.009, spreadMax: 0.075, adsFov: 58, sight: [0, 0.12, -0.05, 0.3], camKick: [0.009, 0.0034], modelKick: [0.25, 0.3, 2.4, -3.2, 0.9, 1.2], fovKick: 1.2, reloadDur: 1.45, reloadType: 'mag', auto: true, falloff: null, tracer: 0.02, flashScale: 1, sound: 'shot', shell: [0.02, INK.ORANGE], moveSpread: 0.0012, pvp: [19, 1.8, null] },
  shotgun: { name: 'Escopeta', hint: 'Ação por bombeamento · Devastadora a curta distância', kind: 'shotgun', magSize: 6, reserve: 36, maxReserve: 72, interval: 0.78, damage: 19, headMul: 1.8, pellets: 10, spread: 0.062, adsSpread: 0.034, spreadKick: 0, spreadMax: 0.1, adsFov: 68, sight: [0, 0.095, -1.0, 0.52], camKick: [0.05, 0.012], modelKick: [0.4, 0.6, 5, -9, 2, 3], fovKick: 4, reloadDur: 0.45, reloadType: 'shells', auto: false, falloff: [11, 32, 0.22], tracer: 0.014, flashScale: 1.9, sound: 'shotgunFire', shell: [0.035, INK.RED], moveSpread: 0.0006, cycleDur: 0.45, pvp: [16, 1.6, [9, 26, 0.15]] },
  sniper: { name: 'Sniper', hint: 'Ação por ferrolho · Um tiro, uma eliminação', kind: 'sniper', scope: true, magSize: 5, reserve: 25, maxReserve: 50, interval: 0.2, damage: 150, headMul: 3, pellets: 1, spread: 0.075, adsSpread: 0.0004, spreadKick: 0.05, spreadMax: 0.14, adsFov: 20, sight: [0, 0.135, 0, 0.42], camKick: [0.055, 0.008], modelKick: [0.25, 0.8, 4.5, -11, 1.2, 2], fovKick: 4.5, reloadDur: 2.1, reloadType: 'mag', auto: false, falloff: null, tracer: 0.03, flashScale: 1.7, sound: 'sniperFire', shell: [0.03, INK.ORANGE], moveSpread: 0.004, cycleDur: 0.85, pvp: [150, 1.5, null] },
  revolver: { name: 'Revólver', hint: 'Canhão de mão · Tiro na cabeça elimina na hora', kind: 'revolver', magSize: 6, reserve: 36, maxReserve: 72, interval: 0.3, damage: 62, headMul: 3, pellets: 1, spread: 0.006, adsSpread: 0.002, spreadKick: 0.02, spreadMax: 0.06, adsFov: 52, sight: [0, 0.08, -0.34, 0.42], camKick: [0.038, 0.007], modelKick: [0.3, 0.9, 3.2, -10, 1.5, 2.5], fovKick: 2.5, reloadDur: 1.9, reloadType: 'cylinder', auto: false, falloff: null, tracer: 0.026, flashScale: 1.35, sound: 'revolver', shell: null, moveSpread: 0.0015, pvp: [52, 2.9, [9, 34, 0.42]] },
  smg: { name: 'Submetralhadora', hint: 'Cadência insana · Varre inimigos em disparada', kind: 'smg', magSize: 45, reserve: 225, maxReserve: 450, interval: 1 / 18, damage: 17, headMul: 2.3, pellets: 1, spread: 0.024, adsSpread: 0.007, spreadKick: 0.008, spreadMax: 0.09, adsFov: 62, sight: [0, 0.095, -0.1, 0.28], camKick: [0.007, 0.0028], modelKick: [0.18, 0.22, 1.8, -2.4, 0.7, 0.9], fovKick: 0.9, reloadDur: 1.25, reloadType: 'mag', auto: true, falloff: [8, 26, 0.35], tracer: 0.016, flashScale: 0.85, sound: 'smgFire', shell: [0.018, INK.ORANGE], moveSpread: 0.0008, pvp: [14, 1.7, [7, 24, 0.25]] },
  laser: { name: 'Fuzil de Plasma', hint: 'Disparo de energia · Feixe contínuo de alta precisão', kind: 'laser', magSize: 50, reserve: 200, maxReserve: 400, interval: 1 / 13, damage: 28, headMul: 2.5, pellets: 1, spread: 0.008, adsSpread: 0.001, spreadKick: 0.004, spreadMax: 0.04, adsFov: 55, sight: [0, 0.11, -0.05, 0.32], camKick: [0.006, 0.002], modelKick: [0.15, 0.2, 1.5, -2.0, 0.6, 0.8], fovKick: 1.0, reloadDur: 1.6, reloadType: 'mag', auto: true, falloff: null, tracer: 0.035, flashScale: 1.3, sound: 'laserFire', shell: null, moveSpread: 0.0005, pvp: [23, 2.0, null] },
  bazooka: { name: 'Bazuca', hint: 'Lança-foguetes · Dano massivo e explosão em área', kind: 'bazooka', magSize: 1, reserve: 20, maxReserve: 40, interval: 0.85, damage: 200, headMul: 1.0, pellets: 1, spread: 0.006, adsSpread: 0.001, spreadKick: 0.03, spreadMax: 0.07, adsFov: 56, sight: [0, 0.12, -0.15, 0.35], camKick: [0.08, 0.015], modelKick: [0.45, 1.2, 6.5, -13, 2.0, 3.2], fovKick: 5.5, reloadDur: 1.5, reloadType: 'rocket', auto: false, falloff: null, tracer: 0.0, flashScale: 2.2, sound: 'bazookaFire', shell: null, moveSpread: 0.002, pvp: [170, 1.0, null] },
};

export class Gun extends ViewModel {
  constructor(ctx, type) {
    super(ctx); Object.assign(this, GUNS[type]); this.isGun = true; this.mag = this.magSize;
    this.fireT = 0; this.reloading = false; this.reloadT = 0; this.spreadCur = this.spread; this.flashT = 0; this.pumpT = 0; this.racked = false; this.needPump = false;
    this.mat = makeInkMaterial({ ink: INK.BLUE }); this.dark = makeInkMaterial({ ink: INK.BLACK }); this.red = makeInkMaterial({ ink: INK.RED, fill: true });
    this.build(); this.setSight(...this.sight);
  }
  get spreadPx() { return 5 + this.spreadCur * 900; }
  addAmmo(n) { this.reserve = Math.min(this.reserve + n, this.maxReserve); }
  startReload() {
    if (this.reloading || this.mag >= this.magSize || this.reserve <= 0) return;
    this.reloading = true; this.reloadT = 0; this.racked = false;
    if (this.reloadType === 'shells') audio.shell(); else if (this.reloadType === 'cylinder') audio.cylinder(); else if (this.reloadType === 'rocket') audio.pump(); else audio.reload();
  }
  update(dt, st) {
    this.fireT -= dt; if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }
    // moving and flying bloom the shot; aiming down the sights steadies most of that, the scope nearly all of it
    const base = st.aim ? this.adsSpread : this.spread; let moveAdd = Math.min(st.speed, 24) * this.moveSpread + (st.grounded ? 0 : 0.01) + (st.sliding ? 0.008 : 0);
    if (st.aim) moveAdd *= this.scope ? 0.03 : 0.3;
    this.spreadCur = damp(this.spreadCur, base + moveAdd, 7, dt);
    const p = this.root.position, r = this.root.rotation;
    if (this.pumpT > 0) {
      this.pumpT -= dt; const t = 1 - this.pumpT / this.cycleDur; const s = Math.sin(Math.min(1, t * 1.15) * Math.PI);
      if (this.foreEnd) this.foreEnd.position.z = this.foreEndZ + s * 0.16;
      if (this.boltH) { this.boltH.position.z = this.boltZ + s * 0.2; this.boltH.rotation.z = -s * 1.1; }
      r.x += s * 0.12; r.z += s * 0.15; p.y -= s * 0.02;
      if (t > 0.45 && !this.pumped) { this.pumped = true; audio.pump(); this._ejectShell(); this.recoilRot.kick(-1.5, 0, 1); }
      if (this.pumpT <= 0) { this.pumped = false; this.needPump = false; if (this.foreEnd) this.foreEnd.position.z = this.foreEndZ; if (this.boltH) { this.boltH.position.z = this.boltZ; this.boltH.rotation.z = 0; } }
    }
    if (this.reloading) {
      this.reloadT += dt;
      if (this.reloadType === 'mag') {
        const t = this.reloadT / this.reloadDur;
        const tilt = Math.sin(clamp(t / 0.22, 0, 1) * Math.PI / 2) * (t < 0.82 ? 1 : clamp(1 - (t - 0.82) / 0.18, 0, 1));
        r.x += -0.3 * tilt; r.z += 0.5 * tilt; r.y += 0.25 * tilt; p.y -= 0.07 * tilt; p.x += 0.03 * tilt;
        const mt = clamp((t - 0.18) / 0.5, 0, 1); this.magMesh.position.y = this.magY - Math.sin(mt * Math.PI) * 0.3; this.magMesh.rotation.z = Math.sin(mt * Math.PI) * 0.6;
        if (t > 0.86 && !this.racked) { this.racked = true; this.recoilRot.kick(-2.5, 0, 0); this.recoil.kick(0, 0, 0.6); }
        if (this.reloadT >= this.reloadDur) { const take = Math.min(this.magSize - this.mag, this.reserve); this.mag += take; this.reserve -= take; this.reloading = false; }
        return;
      }
      if (this.reloadType === 'cylinder') {
        const t = this.reloadT / this.reloadDur; const open = t < 0.25 ? easeOut(t / 0.25) : t > 0.8 ? 1 - easeOut((t - 0.8) / 0.2) : 1;
        r.z += 0.9 * open; r.x += 0.3 * open; p.x -= 0.05 * open; p.y += 0.02 * open; this.cylGroup.rotation.z = -1.5 * open;
        if (t > 0.3 && !this.racked) { this.racked = true; for (let i = 0; i < 6; i++) this._ejectShell(0.7); audio.shell(); }
        if (this.reloadT >= this.reloadDur) { const take = Math.min(this.magSize - this.mag, this.reserve); this.mag += take; this.reserve -= take; this.reloading = false; this.cylGroup.rotation.z = 0; }
        return;
      }
      if (this.reloadType === 'rocket') {
        const t = this.reloadT / this.reloadDur;
        const s = Math.sin(Math.min(1, t) * Math.PI);
        r.x += -0.22 * s; r.z += 0.18 * s; p.y -= 0.07 * s;
        if (this.loadedRocket) {
          if (t < 0.2) { this.loadedRocket.visible = false; }
          else if (t < 0.85) {
            this.loadedRocket.visible = true;
            const progress = (t - 0.2) / 0.65;
            this.loadedRocket.position.z = -0.45 + (1 - progress) * 0.45;
          } else {
            this.loadedRocket.visible = true;
            this.loadedRocket.position.z = 0;
          }
        }
        if (t > 0.82 && !this.racked) {
          this.racked = true; audio.pump();
          this.recoilRot.kick(-2.2, 0, 0); this.recoil.kick(0, 0, 0.4);
        }
        if (this.reloadT >= this.reloadDur) {
          const take = Math.min(this.magSize - this.mag, this.reserve);
          this.mag += take; this.reserve -= take; this.reloading = false;
          if (this.loadedRocket) { this.loadedRocket.visible = true; this.loadedRocket.position.z = 0; }
        }
        return;
      }
      // shells: one at a time, can be interrupted by firing
      const s = Math.sin(Math.min(1, this.reloadT / this.reloadDur) * Math.PI);
      r.z += 0.35 * s; r.x += 0.15 * s; p.y -= 0.04 * s; if (this.handL) this.handL.position.set(this.handLPos.x + 0.1 * s, this.handLPos.y - 0.12 * s, this.handLPos.z + 0.55 * s);
      if (this.reloadT >= this.reloadDur) { this.mag++; this.reserve--; this.reloadT = 0; if (this.mag >= this.magSize || this.reserve <= 0) { this.reloading = false; if (this.handL) this.handL.position.copy(this.handLPos); if (this.needPump) this.pumpT = this.cycleDur; } else audio.shell(); }
    }
    if (st.reloadPressed && this.mag < this.magSize && this.reserve > 0 && !this.reloading && this.pumpT <= 0) { this.startReload(); return; }
    const wantFire = this.auto ? st.fire : st.firePressed;
    if (wantFire && this.fireT <= 0 && this.pumpT <= 0 && !st.blockFire) {
      if (this.mag <= 0) { if (st.firePressed) { audio.empty(); this.startReload(); } }
      else { if (this.reloading) { this.reloading = false; if (this.handL) this.handL.position.copy(this.handLPos); } this.fire(st); }
    }
  }
  fire(st) {
    const ctx = this.ctx, P = ctx.player; this.fireT = this.interval; this.mag--;
    if (this.kind === 'bazooka') {
      if (this.loadedRocket) this.loadedRocket.visible = false;
      this.flash.visible = true; this.flashT = 0.06; this.flash.rotation.z = rand(0, TAU); this.flash.scale.setScalar(this.flashScale * rand(0.9, 1.4));
      this.muzzle.getWorldPosition(_v); _v2.copy(P.forward);
      ctx.effects.strokeBurst(_v, INK.ORANGE, 14, 12, { life: 0.16, size: 0.045, gravity: 0, drag: 6 });
      ctx.effects.smoke(_v, _v2, 6);
      _v3.copy(P.eye).addScaledVector(P.forward, -0.6);
      ctx.effects.smoke(_v3, _v2.clone().negate(), 5);
      const k = this.modelKick; this.recoil.kick(rand(-k[0], k[0]), rand(k[1] * 0.4, k[1]), k[2]); this.recoilRot.kick(k[3], rand(-k[4], k[4]), rand(-k[5], k[5]));
      P.recoil(this.camKick[0] * (st.aim ? 0.7 : 1) + rand(0, this.camKick[0] * 0.3), rand(-this.camKick[1], this.camKick[1])); P.kickFov(this.fovKick);
      audio[this.sound](); ctx.input.rumble(0.65, 0.8, 140); ctx.effects.shakeAmt += 0.25;
      P.fireRocket();
      if (this.mag === 0) setTimeout(() => { if (this.mag === 0 && !this.reloading) this.startReload(); }, 250);
      return;
    }
    const spreadNow = this.spreadCur; this.spreadCur = Math.min(this.spreadCur + this.spreadKick, this.spreadMax);
    let hits = 0;
    for (let i = 0; i < this.pellets; i++) if (this.fireRay(P.eye, P.aimDir(spreadNow))) hits++;
    // fx
    this.flash.visible = true; this.flashT = 0.045; this.flash.rotation.z = rand(0, TAU); this.flash.scale.setScalar(this.flashScale * rand(0.8, 1.4));
    this.muzzle.getWorldPosition(_v); _v2.copy(P.forward);
    ctx.effects.strokeBurst(_v, INK.ORANGE, 4 + this.pellets, 6 * this.flashScale, { life: 0.08, size: 0.03, gravity: 0, drag: 8 });
    ctx.effects.smoke(_v, _v2, this.kind === 'shotgun' ? 5 : 2);
    if (this.shell && this.reloadType !== 'shells') this._ejectShell();
    if (this.cycleDur) { this.pumpT = this.cycleDur + 0.12; this.pumped = false; if (this.reloadType === 'shells') this.needPump = true; }
    const k = this.modelKick; this.recoil.kick(rand(-k[0], k[0]), rand(k[1] * 0.4, k[1]), k[2]); this.recoilRot.kick(k[3], rand(-k[4], k[4]), rand(-k[5], k[5]));
    P.recoil(this.camKick[0] * (st.aim ? 0.7 : 1) + rand(0, this.camKick[0] * 0.3), rand(-this.camKick[1], this.camKick[1])); P.kickFov(this.fovKick);
    audio[this.sound](); ctx.input.rumble(0.15 + this.fovKick * 0.08, 0.5, 40 + this.fovKick * 15); ctx.effects.shakeAmt += 0.02 + this.fovKick * 0.02;
    if (this.mag === 0 && this.reloadType === 'mag') setTimeout(() => { if (this.mag === 0 && !this.reloading) this.startReload(); }, 250);
  }
  fireRay(origin, dir) {
    const ctx = this.ctx; const hitE = ctx.enemies.raycast(origin, dir, 300), hitW = ctx.world.raycast(origin, dir, 300, SEE_THROUGH); let end, hit = false;
    // other players in a versus match are targets too; the closest thing along the ray wins
    const hitP = ctx.raycastPlayers ? ctx.raycastPlayers(origin, dir, 300) : null;
    if (hitP && (!hitE || hitP.dist < hitE.dist) && (!hitW || hitP.dist < hitW.dist)) {
      end = hitP.point; const crit = hitP.part === 'head'; const pv = this.pvp || [this.damage, this.headMul, this.falloff]; let d = pv[0] * (crit ? pv[1] : 1);
      if (pv[2]) d *= clamp(1 - (hitP.dist - pv[2][0]) / (pv[2][1] - pv[2][0]), pv[2][2], 1);
      ctx.hitPlayer(hitP.player, d, { point: hitP.point, dir, part: hitP.part, source: this.kind, crit, dist: hitP.dist }); hit = true;
    } else if (hitW && hitW.box && hitW.box.data.breakable && (!hitE || hitW.dist < hitE.dist) && ctx.breakHit) {
      end = hitW.point; ctx.breakHit(hitW.box.data.breakable, this.damage, hitW.point, dir); hit = true;
    } else if (hitE && (!hitW || hitE.dist < hitW.dist)) {
      end = hitE.point; const crit = hitE.part === 'head'; let d = this.damage * (crit ? this.headMul : 1);
      if (this.falloff) d *= clamp(1 - (hitE.dist - this.falloff[0]) / (this.falloff[1] - this.falloff[0]), this.falloff[2], 1);
      ctx.enemies.damage(hitE.enemy, d, { point: hitE.point, dir, part: hitE.part, source: this.kind, crit }); hit = true;
    } else if (hitW) { end = hitW.point; ctx.effects.bulletImpact(hitW.point, hitW.normal, INK.BLUE); if (Math.random() < 0.25) audio.ricochet(hitW.point); }
    else end = origin.clone().addScaledVector(dir, 300);
    this.muzzle.getWorldPosition(_v); ctx.effects.tracer(_v, end, INK.BLUE, this.tracer, 0.05);
    if (ctx.onShot) ctx.onShot(end);
    return hit;
  }
  _ejectShell(spread = 1) {
    if (!this.shell) return; const P = this.ctx.player; this.ejectPt.getWorldPosition(_v);
    _v2.copy(P.right).multiplyScalar(rand(1.5, 2.5) * spread).addScaledVector(P.forward, rand(-0.5, 0.5)); _v2.y += rand(1.5, 2.8);
    this.ctx.effects.shell(_v, _v2, this.shell[1], this.shell[0]);
  }
}
