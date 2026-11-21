// Brasília urban life: traffic collision & run-overs, pedestrian spawning, and protest/police manifestations.
import * as THREE from 'three';
import { choose } from '../core/util.js';

const _carDir = new THREE.Vector3();

function carLocal(car, p) {
  const dx = p.x - car.x, dz = p.z - car.z, sy = Math.sin(car.yaw), cy = Math.cos(car.yaw);
  return { along: dx * sy + dz * cy, side: dx * cy - dz * sy, sy, cy };
}
function carPush(car, p, out, sideK, fwdK, up) {
  if (car.axis === 'free') { const l = carLocal(car, p); const sg = l.side >= 0 ? 1 : -1; return out.set(l.cy * sg * sideK + l.sy * fwdK, up, -l.sy * sg * sideK + l.cy * fwdK); }
  if (car.axis === 'z') return out.set(p.x > car.x ? sideK : -sideK, up, car.dir * fwdK);
  return out.set(car.dir * fwdK, up, p.z > car.z ? sideK : -sideK);
}
function carOverlap(car, p, r, maxY) {
  if (car.hidden || p.y - car.y > maxY || p.y - car.y < -1) return false;
  if (car.axis === 'free') { const l = carLocal(car, p); return Math.abs(l.side) < car.w / 2 + r && Math.abs(l.along) < car.d / 2 + r; }
  const hw = car.axis === 'x' ? car.d / 2 : car.w / 2, hd = car.axis === 'x' ? car.w / 2 : car.d / 2;
  return Math.abs(p.x - car.x) < hw + r && Math.abs(p.z - car.z) < hd + r;
}

export function createBrasiliaTraffic(ctx, deps) {
  const { net, online, audio, hud, bEvents } = deps;
  let pedTimer = 0;

  function triggerBrasiliaManifestation() {
    const level = ctx.level, nav = ctx.nav, enemies = ctx.enemies, player = ctx.player;
    if (level.key !== 'brasilia') return;
    ctx.protestersRiot = false;
    ctx.playerWanted = false;
    if (net.active && net.isHost) net.send('bcalm', {});

    const existingAmbient = enemies.enemies.filter((e) => e.alive && (e.T.isProtester || e.T.isPolice)).length;
    if (existingAmbient > 8) return;

    const anchors = ctx.targets().filter((t) => t && t.alive && t.body);
    const refZ = anchors.length ? choose(anchors).body.pos.z : player.body.pos.z;
    const lmk = level.landmarks || {};
    const zT = lmk.torre ? lmk.torre.pos.z : -316, zR = lmk.rodoviaria ? lmk.rodoviaria.pos.z : -213, zE = lmk.esplanada ? lmk.esplanada.pos.z : 18;
    let baseZ = zE, zoneLabel = 'NA ESPLANADA';
    if (refZ < (zT + zR) / 2) { baseZ = zT + 44; zoneLabel = 'NA TORRE DE TV'; }
    else if (refZ < (zR + zE) / 2) { baseZ = zR + 34; zoneLabel = 'NA RODOVIÁRIA'; }
    const snapN = (v) => { const id = nav.nearestNode(v, 6, 4); if (id >= 0) { const nd = nav.nodes[id]; v.set(nd.x, nd.y + 0.05, nd.z); } return v; };

    const protOffsets = [
      [-5, -14, 'protester'], [5, -12, 'protester'], [0, -10, 'protester_leader'],
      [-7, -4, 'protester'], [0, -3, 'protester'], [6, -2, 'protester'],
      [-3, 4, 'protester'], [4, 5, 'protester_leader'],
    ];
    for (const [dx, dz, kind] of protOffsets) {
      const p = enemies.spawn(kind, snapN(new THREE.Vector3(dx, 0.25, baseZ + dz)));
      p.state = 'hunt';
    }
    const polOffsets = [
      [-7, 34, 'police'], [0, 34, 'police_tactical'], [7, 34, 'police'],
      [-4, 39, 'police_tactical'], [4, 39, 'police'], [0, 42, 'police_chief'],
    ];
    for (const [dx, dz, kind] of polOffsets) {
      const pol = enemies.spawn(kind, snapN(new THREE.Vector3(dx, 0.25, baseZ + dz)));
      pol.state = 'hunt';
    }
    audio.siren(new THREE.Vector3(0, 0, baseZ + 24));
    if (hud) {
      hud.message(`🚩 MANIFESTAÇÃO ${zoneLabel}!`, 'Confronto entre Manifestantes e PMDF! Não ataque nenhum lado ou sofrerá as consequências!', 5.0);
    }
    if (net.active && net.isHost) net.send('bmanif', { zone: zoneLabel });
  }

  function updateTrafficHits() {
    const level = ctx.level, player = ctx.player, enemies = ctx.enemies;
    const now = performance.now();
    for (const car of level.cars) {
      if (car.hidden) {
        if (car._wreckRespawnAt && now > car._wreckRespawnAt) {
          car.hidden = false; car._wreckRespawnAt = 0;
          if (car.group) car.group.visible = true;
        }
        continue;
      }
      const moving = car.speed > 1.5;
      const riding = player.grapple && player.grapple.state !== 'idle' && player.grapple.mover && player.grapple.mover.car === car;
      if (player.alive && !riding && carOverlap(car, player.body.pos, 0.55, 2.4)) {
        if (!car._hornT || now - car._hornT > 1000) { car._hornT = now; audio.horn(car.group.position); }
        if (moving && (!car._hitT || now - car._hitT > 450)) {
          car._hitT = now;
          carPush(car, player.body.pos, _carDir, 0.9, 0.55, 0.35);
          player.knockback(_carDir.normalize(), car.isBus ? 13 : 9);
          const dmg = car.isBus ? 22 : 14; player.takeDamage(dmg, car.group.position);
          hud.kill((car.isBus ? 'Atropelado pelo ônibus' : 'Atropelado') + ' · -' + dmg + ' Vida', 0);
        } else if (!moving) {
          if (car.axis === 'free') { const l = carLocal(car, player.body.pos); const sg = l.side >= 0 ? 1 : -1, push = car.w / 2 + 0.56 - Math.abs(l.side); player.body.pos.x += l.cy * sg * push; player.body.pos.z -= l.sy * sg * push; }
          else if (car.axis === 'z') player.body.pos.x = car.x + Math.sign(player.body.pos.x - car.x || 1) * (car.w / 2 + 0.56);
          else player.body.pos.z = car.z + Math.sign(player.body.pos.z - car.z || 1) * (car.w / 2 + 0.56);
        }
      }
      if (!moving || (online() && !net.isHost)) continue;
      for (const e of enemies.enemies) {
        if (!e.alive || e.T.flying || e.state === 'spawn') continue;
        if (!carOverlap(car, e.body.pos, e.body.halfW + 0.1, 2.6)) continue;
        carPush(car, e.body.pos, _carDir, 0.6, 1, 0.45);
        _carDir.normalize();
        if (e.T.isPet) { e.body.pos.x += _carDir.x * 1.2; e.body.pos.z += _carDir.z * 1.2; continue; }
        if (e.T.boss) { if (!e._carT || now - e._carT > 800) { e._carT = now; enemies.damage(e, 120, { source: 'car', dir: _carDir.clone(), point: e.center.clone(), part: 'torso' }); } continue; }
        enemies.damage(e, 9999, { source: 'car', dir: _carDir.clone(), point: e.center.clone(), part: 'torso' });
        if (!car._hornT || now - car._hornT > 700) { car._hornT = now; audio.horn(car.group.position); }
      }
    }
  }

  function spawnBrasiliaCivilians() {
    const level = ctx.level, nav = ctx.nav, enemies = ctx.enemies;
    if (bEvents && bEvents.reset) bEvents.reset();
    const civSpots = level.civSpots || [];
    const snap = (v) => { const id = nav.nearestNode(v, 4, 3); if (id >= 0) { const nd = nav.nodes[id]; v.set(nd.x, nd.y + 0.05, nd.z); } return v; };
    for (const [kind, x, y, z] of civSpots) {
      const c = enemies.spawn(kind, snap(new THREE.Vector3(x, y, z)));
      c.state = 'hunt';
    }
    if (!enemies.enemies.some((e) => e.alive && e.T.isPet)) {
      const sp = level.playerStart;
      const o = enemies.spawn('orelha', snap(new THREE.Vector3(sp.x + 3, sp.y, sp.z + 3)));
      o.state = 'hunt';
    }
    triggerBrasiliaManifestation();
  }

  function maintainBrasiliaPedestrians(dt) {
    const level = ctx.level, nav = ctx.nav, enemies = ctx.enemies, player = ctx.player;
    pedTimer -= dt;
    if (pedTimer > 0) return;
    // horário de pico: mais gente e nascendo mais rápido; de madrugada a cidade esvazia
    const env = ctx.env, rush = env ? env.rush : 0.5, hour = env ? env.hour : 12;
    pedTimer = 4.2 - 3.0 * rush;
    // recicla pedestres ambientes muito distantes (> 165m de todos os jogadores) para manter a cidade viva sem desperdício
    const anchors = ctx.targets().filter((t) => t && t.alive && t.body);
    if (anchors.length) {
      for (let i = enemies.enemies.length - 1; i >= 0; i--) {
        const e = enemies.enemies[i];
        if (!e.alive || !(e.T.isCivilian || e.T.isVendor || e.T.isPolitician)) continue;
        let nearAny = false;
        for (const a of anchors) {
          const dx = e.body.pos.x - a.body.pos.x, dz = e.body.pos.z - a.body.pos.z;
          if (dx * dx + dz * dz < 165 * 165) { nearAny = true; break; }
        }
        if (!nearAny) {
          e.alive = false; e.deadT = 99;
          enemies._removeLaser(e);
          if (!e.rootDetached && e.root) ctx.scene.remove(e.root);
          enemies._disposeMesh(e.root);
          enemies.byId.delete(e.id);
          enemies.enemies.splice(i, 1);
        }
      }
    }
    const aliveCivs = enemies.enemies.filter((e) => e.alive && (e.T.isCivilian || e.T.isVendor || e.T.isPolitician)).length;
    if (enemies.enemies.length >= 130 || aliveCivs >= Math.round(16 + 44 * rush)) return;
    const civSpots = level.civSpots;
    if (!civSpots || !civSpots.length || !player || !player.body) return;
    const px = player.body.pos.x, pz = player.body.pos.z;
    const candidates = civSpots.filter((s) => {
      const d = Math.hypot(s[1] - px, s[3] - pz);
      return d > 35 && d < 120;
    });
    if (!candidates.length) return;
    // onde a gente se junta em cada hora: ida/volta do trabalho = Rodoviária, paradas e Esplanada;
    // almoço = Setor Comercial e Rodoviária; noite = Torre de TV (feirinha) e Rodoviária
    const LM = level.landmarks || {};
    const near = (s, k, r) => { const p = LM[k] && LM[k].pos; return p ? Math.hypot(s[1] - p.x, s[3] - p.z) < r : false; };
    const atStop = (s) => (level.busStops || []).some((b) => Math.hypot(b.x - s[1], b.z - s[3]) < 6);
    const commute = (hour > 6.5 && hour < 9.5) || (hour > 16.8 && hour < 20);
    const lunch = hour > 11.5 && hour < 14.2, night = hour > 19.5 || hour < 6;
    const weight = (s) => {
      let w = 1;
      if (commute) { if (near(s, 'rodoviaria', 70) || atStop(s)) w += 5; if (near(s, 'esplanada', 160)) w += 2.5; }
      if (lunch) { if (near(s, 'rodoviaria', 90)) w += 3; if (s[0] === 'vendor') w += 2; }
      if (night) { if (near(s, 'torre', 60) || near(s, 'rodoviaria', 60)) w += 3; if (s[0] === 'politician') w *= 0.2; }
      return w;
    };
    let tot = 0; for (const s of candidates) tot += weight(s);
    let pick = Math.random() * tot, chosen = candidates[0];
    for (const s of candidates) { pick -= weight(s); if (pick <= 0) { chosen = s; break; } }
    const snap = (v) => { const id = nav.nearestNode(v, 4, 3); if (id >= 0) { const nd = nav.nodes[id]; v.set(nd.x, nd.y + 0.05, nd.z); } return v; };
    const c = enemies.spawn(chosen[0], snap(new THREE.Vector3(chosen[1], chosen[2], chosen[3])));
    if (c) c.state = 'hunt';
  }

  return {
    triggerBrasiliaManifestation,
    updateTrafficHits,
    spawnBrasiliaCivilians,
    maintainBrasiliaPedestrians,
  };
}
