// Dynamic in-wave missions (Defender, Escoltar, Capturar, Coletar 5 Páginas, Caçar Alvo em Fuga)
// and online objective modes (Pega-Bandeira entre as Asas, Rei do Mirante na Torre de TV, Cooperativo).
import * as THREE from 'three';
import { makeInkMaterial, INK } from '../render.js';
import { audio } from '../audio.js';
import { progression } from './progression.js';

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

  _makeZoneMesh(radius, mat, height = 18) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.22, 6, 32).rotateX(Math.PI / 2), mat);
    ring.position.y = 0.25;
    g.add(ring);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, height, 8, 1, true), mat);
    beam.position.y = height / 2;
    g.add(beam);
    this.group.add(g);
    return g;
  }

  _makePageMesh(pos) {
    const g = new THREE.Group();
    const sheet = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.25, 0.08), this._pageMat);
    sheet.position.y = 1.4;
    g.add(sheet);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.08, 5, 18).rotateX(Math.PI / 2), this._warnMat);
    halo.position.y = 0.2;
    g.add(halo);
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 14, 6, 1, true), this._warnMat);
    pillar.position.y = 7;
    g.add(pillar);
    g.position.copy(pos);
    this.group.add(g);
    return g;
  }

  // Starts a new objective for the given wave (Solo or Co-op)
  // ponto de referência do mapa (cada mapa publica level.landmarks); devolve uma cópia ou o valor padrão
  _lm(k, fb) { const L = this.ctx.level && this.ctx.level.landmarks; const v = L && L[k] && L[k].pos; return v ? v.clone() : fb; }

  startWaveMission(wave) {
    this.clear();
    const L = this.ctx.level;
    const lm = (k, fb) => this._lm(k, fb);
    const isBrasilia = L && (L.key === 'brasilia' || L.id === 'brasilia');
    const types = ['defend', 'collect', 'capture', 'hunt', 'escort'];
    const kind = types[(wave - 1) % types.length];

    if (kind === 'defend') {
      const spots = isBrasilia
        ? [
            { name: 'Plataforma da Rodoviária', pos: lm('rodoviaria', new THREE.Vector3(0, 0, -213)), r: 22 },
            { name: 'Base da Torre de TV', pos: lm('torre', new THREE.Vector3(0, 3, -396)), r: 22 },
            { name: 'Praça dos Três Poderes', pos: lm('praca3p', new THREE.Vector3(0, 0, 218)), r: 24 },
          ]
        : [{ name: 'Centro da Arena', pos: new THREE.Vector3(0, 0, 0), r: 16 }];
      const pick = spots[(wave - 1) % spots.length];
      const mesh = this._makeZoneMesh(pick.r, this._ringMat, 22);
      mesh.position.copy(pick.pos);
      this.active = {
        kind: 'defend',
        title: `DEFENDER: ${pick.name}`,
        pos: pick.pos,
        radius: pick.r,
        holdTime: 45,
        progress: 0,
        mesh,
        rewardMoney: 550 + wave * 60,
        rewardCredits: 45 + wave * 5,
      };
    } else if (kind === 'capture') {
      const spots = isBrasilia
        ? [
            { name: 'Teto do Ministério (Use o Gancho!)', pos: (L.landmarks && L.landmarks.ministerios && L.landmarks.ministerios[wave % Math.max(1, L.landmarks.ministerios.length)]) ? L.landmarks.ministerios[wave % L.landmarks.ministerios.length].pos.clone() : new THREE.Vector3(-61, 20, -16), r: 9 },
            { name: 'Mirante da Torre de TV (Use o Gancho!)', pos: lm('torreMirante', new THREE.Vector3(0, 15, -396)), r: 10 },
            { name: 'Laje do Congresso Nacional', pos: lm('congresso', new THREE.Vector3(0, 5, 173)), r: 13 },
            { name: 'Terraço do Palácio da Justiça', pos: lm('justica', new THREE.Vector3(64, 13, 104)), r: 12 },
          ]
        : [{ name: 'Plataforma Superior', pos: new THREE.Vector3(0, 4, -18), r: 9 }];
      const pick = spots[Math.floor(wave / 2) % spots.length];
      const mesh = this._makeZoneMesh(pick.r, this._greenMat, 18);
      mesh.position.copy(pick.pos);
      this.active = {
        kind: 'capture',
        title: `CAPTURAR ZONA: ${pick.name}`,
        pos: pick.pos,
        radius: pick.r,
        needTime: 18,
        progress: 0,
        mesh,
        rewardMoney: 650 + wave * 70,
        rewardCredits: 55 + wave * 5,
      };
    } else if (kind === 'collect') {
      const pts = isBrasilia
        ? [
            lm('torreMirante', new THREE.Vector3(0, 15.2, -396)),
            lm('teatro', new THREE.Vector3(-56, 17.2, -236)),
            lm('rodoviaria', new THREE.Vector3(0, 0.3, -213)),
            lm('catedral', new THREE.Vector3(64, 0.5, -114)),
            (L.landmarks && L.landmarks.ministerios && L.landmarks.ministerios[0]) ? L.landmarks.ministerios[0].pos.clone() : new THREE.Vector3(-61, 20.2, -44),
            (L.landmarks && L.landmarks.ministerios && L.landmarks.ministerios[5]) ? L.landmarks.ministerios[5].pos.clone() : new THREE.Vector3(61, 20.2, 12),
            lm('congresso', new THREE.Vector3(0, 5.2, 173)),
            lm('itamaraty', new THREE.Vector3(66, 7.2, -154)),
          ]
        : [
            new THREE.Vector3(-18, 0.5, -18),
            new THREE.Vector3(18, 0.5, -18),
            new THREE.Vector3(0, 4.5, 0),
            new THREE.Vector3(-18, 0.5, 18),
            new THREE.Vector3(18, 0.5, 18),
          ];
      // Pick 5 pages spread across the city
      const chosen = [];
      const startIdx = (wave * 2) % pts.length;
      for (let i = 0; i < 5; i++) {
        const p = pts[(startIdx + i) % pts.length];
        chosen.push({ pos: p.clone(), collected: false, mesh: this._makePageMesh(p) });
      }
      this.active = {
        kind: 'collect',
        title: 'COLETAR: 5 Páginas Secretas nos Prédios (Use o Gancho)',
        pages: chosen,
        collected: 0,
        total: 5,
        rewardMoney: 700 + wave * 75,
        rewardCredits: 60 + wave * 6,
      };
    } else if (kind === 'hunt') {
      const startPos = isBrasilia
        ? lm('museu', new THREE.Vector3(25, 0.3, -120)).setY(0.3)
        : new THREE.Vector3(0, 0.5, -22);
      const hunted = this.ctx.enemies.spawn('rusher', startPos);
      hunted.hp = 180 + wave * 45;
      hunted.maxHp = hunted.hp;
      hunted.T = { ...hunted.T, name: 'Alvo em Fuga', speed: 9.8, ink: INK.ORANGE, isMissionTarget: true };
      hunted.state = 'hunt';
      hunted.root.scale.setScalar(hunted.T.scale * 1.18);
      const halo = this._makeZoneMesh(2.4, this._redMat, 14);
      this.active = {
        kind: 'hunt',
        title: 'CAÇAR: Alvo Especial em Fuga pela Avenida!',
        hunted,
        waypoints: isBrasilia
          ? ['rodoviariaChao', 'torre', 'teatro', 'museu', 'esplanada', 'catedral'].map((k) => lm(k, new THREE.Vector3(0, 0.3, 0)).setY(0.3).add(new THREE.Vector3(k === 'torre' ? 26 : 0, 0, k === 'rodoviariaChao' ? 40 : 0)))
          : [new THREE.Vector3(20, 0.3, 20), new THREE.Vector3(-20, 0.3, 20), new THREE.Vector3(-20, 0.3, -20), new THREE.Vector3(20, 0.3, -20)],
        wpIndex: 0,
        mesh: halo,
        rewardMoney: 750 + wave * 80,
        rewardCredits: 65 + wave * 6,
      };
    } else if (kind === 'escort') {
      const startPos = isBrasilia ? lm('catedral', new THREE.Vector3(0, 0.3, -95)).setY(0.3).add(new THREE.Vector3(-20, 0, 0)) : new THREE.Vector3(0, 0.3, 22);
      const destPos = isBrasilia ? lm('rodoviaria', new THREE.Vector3(0, 0.3, -205)).add(new THREE.Vector3(0, 0, 40)).setY(0.3) : new THREE.Vector3(0, 0.3, -22);
      const vip = this.ctx.enemies.spawn('civilian_m', startPos);
      vip.hp = 260; vip.maxHp = 260;
      vip.T = { ...vip.T, name: 'VIP Escoltado', speed: 6.2, ink: INK.GREEN, isCivilian: true, invulnerable: false };
      vip.isCommuter = false;
      vip.state = 'hunt';
      vip.root.scale.setScalar(1.08);
      const destMesh = this._makeZoneMesh(8, this._greenMat, 18);
      destMesh.position.copy(destPos);
      const vipRing = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.12, 5, 18).rotateX(Math.PI / 2), this._greenMat);
      vipRing.position.y = 0.25;
      this.group.add(vipRing);
      this.active = {
        kind: 'escort',
        title: isBrasilia ? 'ESCOLTAR VIP: Da Catedral até a Rodoviária' : 'ESCOLTAR VIP até o Ponto Seguro',
        vip,
        vipRing,
        dest: destPos,
        mesh: destMesh,
        rewardMoney: 800 + wave * 80,
        rewardCredits: 70 + wave * 6,
      };
    }

    if (this.active && this.ctx.hud) {
      this.ctx.hud.message('🎯 NOVA MISSÃO DA ONDA', this.active.title, 3.2);
    }
  }

  // Initializes online objective modes: CTF (Pega-Bandeira entre as Asas) or KOTH (Rei do Mirante)
  startOnlineMode(mode) {
    this.clear();
    const isBrasilia = this.ctx.level && (this.ctx.level.key === 'brasilia' || this.ctx.level.id === 'brasilia');
    if (mode === 'ctf') {
      const northBase = isBrasilia ? this._lm('asaNorte', new THREE.Vector3(-175, 0.2, -213)) : new THREE.Vector3(-25, 0.2, -25);
      const southBase = isBrasilia ? this._lm('asaSul', new THREE.Vector3(175, 0.2, -213)) : new THREE.Vector3(25, 0.2, 25);
      const northMesh = this._makeZoneMesh(5.5, this._ringMat, 22);
      northMesh.position.copy(northBase);
      const southMesh = this._makeZoneMesh(5.5, this._redMat, 22);
      southMesh.position.copy(southBase);
      this.onlineObj = {
        mode: 'ctf',
        northBase,
        southBase,
        northMesh,
        southMesh,
        carryingFlag: false,
        captures: 0,
      };
    } else if (mode === 'koth') {
      const hillPos = isBrasilia ? this._lm('torreMirante', new THREE.Vector3(0, 15, -396)) : new THREE.Vector3(0, 4, 0);
      const hillMesh = this._makeZoneMesh(10, this._warnMat, 24);
      hillMesh.position.copy(hillPos);
      this.onlineObj = {
        mode: 'koth',
        hillPos,
        radius: 10.5,
        hillMesh,
        holdSeconds: 0,
        nextTick: 1,
      };
    }
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
