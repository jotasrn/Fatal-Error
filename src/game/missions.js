// Dynamic in-wave missions (Defender, Escoltar, Capturar, Coletar 5 Páginas, Caçar Alvo em Fuga)
// and online objective modes (Pega-Bandeira entre as Asas, Rei do Mirante na Torre de TV, Cooperativo).
import * as THREE from 'three';
import { makeInkMaterial, INK } from '../core/render.js';
import { audio } from '../core/audio.js';
import { progression } from './progression.js';

import { MissionSetupMixin } from './missionSetup.js';

const _v = new THREE.Vector3();

export class MissionManager {
  constructor(ctx) {
    this.ctx = ctx;
    this.active = null;      // current wave mission object
    this.onlineObj = null;   // CTF / KOTH state when in online objective modes
    this.markers = [];       // minimap markers: { x, z, color, label, pulse }
    this.group = new THREE.Group();
    ctx.scene.add(this.group);

    this._ringMat = makeInkMaterial({ ink: INK.BLUE, fill: false });
    this._warnMat = makeInkMaterial({ ink: INK.ORANGE, fill: false });
    this._redMat = makeInkMaterial({ ink: INK.RED, fill: false });
    this._greenMat = makeInkMaterial({ ink: INK.GREEN, fill: false });
    this._pageMat = makeInkMaterial({ ink: INK.ORANGE, fill: true });
  }

  clear() {
    if (this.active && this.active.vip && this.active.vip.alive) {
      this.active.vip.alive = false;
      this.active.vip.deadT = 99;
    }
    if (this.active && this.active.hunted && this.active.hunted.alive) {
      this.active.hunted.T.isMissionTarget = false;
    }
    this.active = null;
    this.onlineObj = null;
    this.markers.length = 0;
    while (this.group.children.length > 0) {
      const c = this.group.children.pop();
      this.group.remove(c);
    }
    if (this.ctx.hud && this.ctx.hud.setMission) this.ctx.hud.setMission(null);
  }


  completeMission() {
    const m = this.active;
    if (!m || m.done) return;
    m.done = true;
    const P = this.ctx.player;
    P.money += m.rewardMoney;
    P.hp = Math.min(P.maxHp, P.hp + 45);
    P.addAmmoAll(0.4);
    progression.addCredits(m.rewardCredits);
    this.ctx.game.addScore(500, 'Missão Concluída');
    audio.waveClear();
    if (this.ctx.hud) {
      this.ctx.hud.setMoney(P.money);
      this.ctx.hud.message(' MISSÃO CONCLUÍDA!', `+$${m.rewardMoney} · +${m.rewardCredits} CR permanentes!`, 3.4);
      this.ctx.hud.setMission({ title: m.title, status: 'CONCLUÍDA! (+' + m.rewardCredits + ' CR)', pct: 1, done: true });
    }
    while (this.group.children.length > 0) {
      this.group.remove(this.group.children.pop());
    }
    this.markers.length = 0;
  }

  update(dt) {
    this.markers.length = 0;
    const P = this.ctx.player;
    if (!P || !P.alive) return;
    const pp = P.body.pos;

    // 1. Update Online Objective Modes (CTF / KOTH)
    if (this.onlineObj) {
      const o = this.onlineObj;
      if (o.mode === 'ctf') {
        const myBase = (P.team % 2 === 0) ? o.northBase : o.southBase;
        const enemyBase = (P.team % 2 === 0) ? o.southBase : o.northBase;
        const enemyName = (P.team % 2 === 0) ? 'Asa Sul' : 'Asa Norte';
        const myName = (P.team % 2 === 0) ? 'Asa Norte' : 'Asa Sul';
        this.markers.push(
          { x: o.northBase.x, z: o.northBase.z, color: '#2b5ce6', label: 'A.NORTE' },
          { x: o.southBase.x, z: o.southBase.z, color: '#d92b2b', label: 'A.SUL' }
        );
        if (!o.carryingFlag) {
          const dEnemy = Math.hypot(pp.x - enemyBase.x, pp.z - enemyBase.z);
          if (dEnemy < 6.0) {
            o.carryingFlag = true;
            audio.pickup();
            this.ctx.hud.message('🚩 BANDEIRA CAPTURADA!', `Volte rápido para a sua base na ${myName}!`, 3.0);
          }
          if (this.ctx.hud.setMission) {
            this.ctx.hud.setMission({
              title: `🚩 PEGA-BANDEIRA: Roube a bandeira na ${enemyName}`,
              status: `${Math.round(dEnemy)}m até a base inimiga · Capturas: ${o.captures}`,
              pct: o.captures / 3,
            });
          }
        } else {
          const dHome = Math.hypot(pp.x - myBase.x, pp.z - myBase.z);
          if (dHome < 6.0) {
            o.carryingFlag = false;
            o.captures++;
            P.money += 500;
            progression.addCredits(35);
            this.ctx.game.addScore(300, 'Bandeira Capturada');
            audio.waveClear();
            this.ctx.hud.setMoney(P.money);
            this.ctx.hud.message('🏆 PONTO DE BANDEIRA!', '+300 pts · +$500 · +35 CR permanentes!', 3.2);
          }
          if (this.ctx.hud.setMission) {
            this.ctx.hud.setMission({
              title: `🚩 ENTREGUE A BANDEIRA NA SUA BASE (${myName})!`,
              status: `${Math.round(dHome)}m até a base · Capturas: ${o.captures}`,
              pct: Math.min(1, o.captures / 3),
            });
          }
        }
      } else if (o.mode === 'koth') {
        this.markers.push({ x: o.hillPos.x, z: o.hillPos.z, color: '#e66414', label: 'MIRANTE' });
        const dHill = Math.hypot(pp.x - o.hillPos.x, pp.z - o.hillPos.z);
        const inside = dHill <= o.radius && Math.abs(pp.y - o.hillPos.y) < 5.5;
        if (inside) {
          o.holdSeconds += dt;
          if (o.holdSeconds >= o.nextTick) {
            o.nextTick += 1;
            this.ctx.game.addScore(25, 'Rei do Mirante');
            P.money += 20;
            this.ctx.hud.setMoney(P.money);
            if (Math.round(o.holdSeconds) % 10 === 0) progression.addCredits(12);
          }
        }
        if (this.ctx.hud.setMission) {
          this.ctx.hud.setMission({
            title: '👑 REI DO MIRANTE: Domine a Torre de TV',
            status: inside ? `DOMINANDO! (${Math.floor(o.holdSeconds)}s)` : `Fora da zona (${Math.round(dHill)}m)`,
            pct: (o.holdSeconds % 60) / 60,
          });
        }
      }
      return;
    }

    // 2. Update Wave Mission
    const m = this.active;
    if (!m || m.done) return;

    if (m.kind === 'defend') {
      this.markers.push({ x: m.pos.x, z: m.pos.z, color: '#2b5ce6', label: 'DEFENDER' });
      const dist = Math.hypot(pp.x - m.pos.x, pp.z - m.pos.z);
      const inside = dist <= m.radius;
      if (inside) m.progress = Math.min(m.holdTime, m.progress + dt);
      if (m.mesh) m.mesh.rotation.y += dt * 0.8;
      if (this.ctx.hud.setMission) {
        this.ctx.hud.setMission({
          title: `🛡️ ${m.title}`,
          status: inside ? `Segurando posição... ${Math.ceil(m.holdTime - m.progress)}s` : `Volte à zona! (${Math.round(dist)}m)`,
          pct: m.progress / m.holdTime,
        });
      }
      if (m.progress >= m.holdTime) this.completeMission();
    } else if (m.kind === 'capture') {
      this.markers.push({ x: m.pos.x, z: m.pos.z, color: '#1d9940', label: 'CAPTURAR' });
      const dist = Math.hypot(pp.x - m.pos.x, pp.z - m.pos.z);
      const inside = dist <= m.radius && Math.abs(pp.y - m.pos.y) < 5.5;
      if (inside) m.progress = Math.min(m.needTime, m.progress + dt);
      else m.progress = Math.max(0, m.progress - dt * 0.25);
      if (m.mesh) m.mesh.rotation.y += dt * 1.2;
      if (this.ctx.hud.setMission) {
        this.ctx.hud.setMission({
          title: `📡 ${m.title}`,
          status: inside ? `Capturando: ${Math.round((m.progress / m.needTime) * 100)}%` : `Suba até a zona (${Math.round(dist)}m)`,
          pct: m.progress / m.needTime,
        });
      }
      if (m.progress >= m.needTime) this.completeMission();
    } else if (m.kind === 'collect') {
      let nearestD = Infinity;
      for (const pg of m.pages) {
        if (pg.collected) continue;
        pg.mesh.children[0].rotation.y += dt * 2.4;
        this.markers.push({ x: pg.pos.x, z: pg.pos.z, color: '#e66414', label: 'PÁGINA' });
        const d = P.center.distanceTo(pg.pos);
        if (d < nearestD) nearestD = d;
        if (d < 3.0) {
          pg.collected = true;
          pg.mesh.visible = false;
          m.collected++;
          audio.pickup();
          this.ctx.effects.strokeBurst(pg.pos, INK.ORANGE, 18, 6, { life: 0.35, size: 0.04 });
          this.ctx.hud.message(`📄 PÁGINA ${m.collected}/${m.total}`, 'Página secreta coletada!', 1.8);
        }
      }
      if (this.ctx.hud.setMission) {
        this.ctx.hud.setMission({
          title: `📄 ${m.title}`,
          status: `Páginas: ${m.collected}/${m.total} · Mais próxima: ${Math.round(nearestD)}m`,
          pct: m.collected / m.total,
        });
      }
      if (m.collected >= m.total) this.completeMission();
    } else if (m.kind === 'hunt') {
      const h = m.hunted;
      if (!h || !h.alive) {
        this.completeMission();
        return;
      }
      // Make the hunted target sprint along city avenues
      const wp = m.waypoints[m.wpIndex % m.waypoints.length];
      const dx = wp.x - h.body.pos.x, dz = wp.z - h.body.pos.z;
      const dWp = Math.hypot(dx, dz);
      if (dWp < 6) m.wpIndex = (m.wpIndex + 1) % m.waypoints.length;
      h.body.vel.x = (dx / (dWp || 1)) * h.T.speed;
      h.body.vel.z = (dz / (dWp || 1)) * h.T.speed;
      h.yawT = Math.atan2(dx, dz);
      if (m.mesh) {
        m.mesh.position.copy(h.body.pos);
        m.mesh.rotation.y += dt * 2.0;
      }
      this.markers.push({ x: h.body.pos.x, z: h.body.pos.z, color: '#d92b2b', label: 'ALVO' });
      const dPlayer = Math.hypot(pp.x - h.body.pos.x, pp.z - h.body.pos.z);
      if (this.ctx.hud.setMission) {
        this.ctx.hud.setMission({
          title: `🎯 ${m.title}`,
          status: `Alvo a ${Math.round(dPlayer)}m · HP do Alvo: ${Math.max(1, Math.round((h.hp / h.maxHp) * 100))}%`,
          pct: 1 - Math.max(0, h.hp / h.maxHp),
        });
      }
    } else if (m.kind === 'escort') {
      const vip = m.vip;
      if (!vip || !vip.alive) {
        m.done = true;
        if (this.ctx.hud.setMission) {
          this.ctx.hud.setMission({ title: m.title, status: 'FALHOU (VIP eliminado)', pct: 0 });
        }
        return;
      }
      if (m.vipRing) m.vipRing.position.set(vip.body.pos.x, vip.body.pos.y + 0.2, vip.body.pos.z);
      this.markers.push(
        { x: vip.body.pos.x, z: vip.body.pos.z, color: '#1d9940', label: 'VIP' },
        { x: m.dest.x, z: m.dest.z, color: '#2b5ce6', label: 'DESTINO' }
      );
      const dPlayer = Math.hypot(pp.x - vip.body.pos.x, pp.z - vip.body.pos.z);
      const dx = m.dest.x - vip.body.pos.x, dz = m.dest.z - vip.body.pos.z;
      const dDest = Math.hypot(dx, dz);
      if (dPlayer <= 20) {
        vip.scared = false;
        vip.body.vel.x = (dx / (dDest || 1)) * 6.0;
        vip.body.vel.z = (dz / (dDest || 1)) * 6.0;
        vip.yawT = Math.atan2(dx, dz);
      } else {
        vip.body.vel.x *= 0.8;
        vip.body.vel.z *= 0.8;
      }
      const totalD = 110;
      if (this.ctx.hud.setMission) {
        this.ctx.hud.setMission({
          title: `🤝 ${m.title}`,
          status: dPlayer <= 20 ? `Escoltando VIP (${Math.round(dDest)}m restantes)` : `Aproxime-se do VIP! (${Math.round(dPlayer)}m)`,
          pct: Math.max(0, Math.min(1, 1 - dDest / totalD)),
        });
      }
      if (dDest < 8.5) this.completeMission();
    }
  }
}

Object.assign(MissionManager.prototype, MissionSetupMixin);
