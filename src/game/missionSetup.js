import * as THREE from 'three';
import { audio } from '../core/audio.js';

export const MissionSetupMixin = {
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
  },

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
  },

  // Starts a new objective for the given wave (Solo or Co-op)
  // ponto de referência do mapa (cada mapa publica level.landmarks); devolve uma cópia ou o valor padrão
  _lm(k, fb) { const L = this.ctx.level && this.ctx.level.landmarks; const v = L && L[k] && L[k].pos; return v ? v.clone() : fb; },

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
  },

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

};
