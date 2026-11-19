import * as THREE from 'three';
import { INK } from '../core/render.js';
import { clamp } from '../core/util.js';

export const TRACER_THICK = {
  rifle: 0.02,
  smg: 0.016,
  pistol9mm: 0.018,
  punisher: 0.024,
  deagle: 0.03,
  requiem: 0.042,
  shotgun: 0.014,
  sniper: 0.03,
  laser: 0.038,
};

export function createPvpCombat(ctx, deps) {
  const {
    player, remote, enemies, level, world, effects, audio, hud, input, net, game,
    online, inMatch, breakProp, spawnPickup, enterFocus, KATANA_CHARGE_KILLS,
  } = deps;

  const _bc = new THREE.Vector3();
  const _rp = new THREE.Vector3();
  const _rq = new THREE.Vector3();
  const _v = new THREE.Vector3();

  // anything a bullet or a blade can hit besides enemies
  ctx.targets = () => [player, ...remote.values()];
  ctx.canHurt = (t) => online() && game.onlineMode !== 'coop' && t !== player;

  ctx.raycastPlayers = (o, d, maxDist) => {
    let best = null;
    for (const t of remote.values()) {
      if (!t.alive || !ctx.canHurt(t)) continue;
      for (let i = 0; i < t.hit.length; i++) {
        const c = t.hitSpheres[i], r = t.hit[i][1];
        _v.subVectors(c, o); const tca = _v.dot(d); if (tca < 0 || tca > maxDist) continue;
        const d2 = _v.lengthSq() - tca * tca; if (d2 > r * r) continue;
        const tt = tca - Math.sqrt(r * r - d2); if (tt < 0) continue;
        if (!best || tt < best.dist) best = { player: t, part: t.hit[i][0], dist: tt, point: new THREE.Vector3(o.x + d.x * tt, o.y + d.y * tt, o.z + d.z * tt) };
      }
      // a raised katana sits in front of the chest: a ray that reaches it before the body is turned aside
      if (t.blocking) {
        _bc.set(t.center.x + t.forward.x * 0.5, t.center.y + 0.3, t.center.z + t.forward.z * 0.5); const r = 0.42;
        _v.subVectors(_bc, o); const tca = _v.dot(d);
        if (tca > 0 && tca <= maxDist) {
          const d2 = _v.lengthSq() - tca * tca;
          if (d2 <= r * r) {
            const tt = tca - Math.sqrt(r * r - d2);
            if (tt >= 0 && (!best || best.player !== t || tt < best.dist)) {
              best = { player: t, part: 'blade', dist: tt, point: new THREE.Vector3(o.x + d.x * tt, o.y + d.y * tt, o.z + d.z * tt) };
            }
          }
        }
      }
    }
    return best;
  };

  ctx.playersInArc = (pos, dir, range, cosHalf) => {
    const out = [];
    for (const t of remote.values()) {
      if (!t.alive || !ctx.canHurt(t)) continue;
      _v.subVectors(t.center, pos);
      const d = _v.length();
      if (d > range + 0.3) continue;
      if (d > 0.3 && _v.normalize().dot(dir) < cosHalf) continue;
      if (!world.hasLineOfSight(pos, t.center)) continue;
      out.push(t);
    }
    return out;
  };

  ctx.hitPlayer = (t, dmg, info) => {
    if (!ctx.canHurt(t) || !t.alive) return;
    if (info.part === 'blade') {
      effects.strokeBurst(info.point, INK.ORANGE, 8, 6, { life: 0.22, size: 0.035 });
      audio.shieldHit(t.center);
      const ret = Math.random() < 0.4;
      if (ret) {
        effects.tracer(info.point, player.eye, INK.RED, 0.03, 0.08);
        hud.tip('Rebatido', 0.9);
        input.rumble(0.5, 0.4, 90);
        player.lastHitBy = t.id;
        player.lastHit = { from: t.center.toArray(), crit: false, amount: dmg * 0.6, src: 'deflect' };
        player.takeDamage(dmg * 0.6, t.center);
      } else hud.tip('Desviado', 0.7);
      net.sendTo(t.id, 'parry', { ret, by: net.id });
      return;
    }
    const facing = t.blocking ? _v.subVectors(player.center, t.center).normalize().dot(t.forward) : -1;
    const frontHit = /^(head|torso|arm|fore)/.test(info.part || '');
    if (facing > 0.6 && frontHit && info.source === 'katana' && t.parryWindow) {
      effects.strokeBurst(info.point, INK.ORANGE, 10, 6, { life: 0.25, size: 0.04 });
      audio.shieldHit(t.center);
      game.hitstop(0.08, 0.15);
      player.weapons[player.katanaIndex].cooldown = Math.max(player.weapons[player.katanaIndex].cooldown, 0.6);
      input.rumble(0.6, 0.3, 90);
      hud.tip('Bloqueado', 0.9);
      return;
    }
    effects.blood(info.point, info.dir, clamp(0.4 + dmg / 80, 0.4, 1.6), { ink: INK.RED });
    hud.hitmarker(false, info.crit);
    audio.hitEnemy(t.center);
    t.flash();
    net.sendTo(t.id, 'pdmg', {
      amount: Math.round(dmg),
      from: player.center.toArray().map((v) => +v.toFixed(1)),
      by: net.id,
      crit: !!info.crit,
      src: info.source,
    });
  };

  ctx.cutRopes = (eye, dir, range) => {
    let cut = false;
    for (const r of remote.values()) {
      if (!r.alive || !r.grappling) continue;
      _rp.set(r.body.pos.x + r.right.x * 0.35, r.body.pos.y + 1.25, r.body.pos.z + r.right.z * 0.35);
      for (let i = 0; i <= 14; i++) {
        _rq.lerpVectors(_rp, r.gPoint, i / 14).sub(eye);
        const t = _rq.dot(dir);
        if (t < 0.3 || t > range) continue;
        const lat = Math.sqrt(Math.max(0, _rq.lengthSq() - t * t));
        if (lat > 0.9) continue;
        _rq.add(eye);
        effects.strokeBurst(_rq, INK.ORANGE, 10, 5, { life: 0.25, size: 0.035 });
        net.sendTo(r.id, 'cut', {});
        hud.tip('Corda cortada', 0.9);
        cut = true;
        break;
      }
    }
    return cut;
  };

  ctx.breakHit = (br, dmg, point, dir) => {
    if (!br.alive) return;
    br.hp -= dmg;
    if (br.hp <= 0) breakProp(br, dir, true);
    else {
      effects.strokeBurst(point, br.ink, 5, 4, { life: 0.2, size: 0.03 });
      audio.shieldHit(point);
    }
  };
  ctx.breakablesInArc = (pos, dir, range, cosHalf) => level.breakables.filter((br) => {
    if (!br.alive) return false;
    _v.subVectors(br.pos, pos);
    const d = _v.length();
    return d < range + 0.5 && (d < 0.4 || _v.divideScalar(d).dot(dir) > cosHalf);
  });
  ctx.blastBreakables = (c, R) => {
    for (const br of level.breakables) {
      if (br.alive && br.pos.distanceTo(c) < R * 0.9) breakProp(br, br.pos.clone().sub(c).normalize(), true);
    }
  };

  const shotQueue = [];
  ctx.onShot = (end) => {
    if (net.active && inMatch()) shotQueue.push(+end.x.toFixed(1), +end.y.toFixed(1), +end.z.toFixed(1));
  };

  enemies.onSpawn = (e) => {
    if (net.active && net.isHost) {
      net.send('espawn', { id: e.id, type: e.type, pos: e.body.pos.toArray() });
    }
  };
  enemies.onClientHit = (e, amount, info) => {
    if (net.active && !net.isHost) {
      net.send('ehit', {
        id: e.id,
        amount,
        info: {
          crit: !!info.crit,
          part: info.part,
          point: info.point ? info.point.toArray().map((v) => +v.toFixed(2)) : null,
          dir: info.dir ? info.dir.toArray().map((v) => +v.toFixed(2)) : null,
        },
      });
    }
  };
  enemies.onKill = (e, info, over) => {
    if (net.active && net.isHost) {
      net.send('ekill', {
        id: e.id,
        info: {
          crit: !!info.crit,
          dir: info.dir ? info.dir.toArray().map((v) => +v.toFixed(2)) : null,
          point: info.point ? info.point.toArray().map((v) => +v.toFixed(2)) : null,
        },
      });
    }
    if (info.source === 'bot' || info.source === 'event') return;
    game.kills++; game.combo++; game.comboT = 3.5;
    let label = e.T.name, pts = e.T.score;
    if (info.crit) { label = 'Tiro na Cabeça'; pts += 60; }
    if (info.source === 'katana') { label = over ? 'Cortado ao Meio' : 'Fatiado'; pts += 50; }
    if (info.source === 'focus') { label = 'Execução'; pts += 150; }
    if (info.source === 'katana' || info.source === 'focus') {
      game.katanaStreak++;
      player.weapons[player.katanaIndex].addBlood(0.42);
      if (game.katanaStreak >= KATANA_CHARGE_KILLS) enterFocus();
    } else if (info.source !== 'blast') game.katanaStreak = 0;
    if (info.source === 'deflect') { label = 'Rebatido'; pts += 120; }
    if (info.source === 'car') { label = 'Atropelado'; if (pts < 0) pts = 0; }
    if (info.source === 'fall') label = 'Caiu da Página';
    else if (!player.body.onGround && info.source !== 'deflect') { label += ' · Abate Aéreo'; pts += 40; }
    game.addScore(pts, label);
    audio.kill(!!info.crit || e.T.boss);
    let cash = 75;
    if (info.crit) cash += 75;
    if (info.source === 'katana' || info.source === 'focus') cash += 100;
    if (e.T.boss) cash += 325;
    player.addCash(cash, label);
    const r = Math.random();
    if (r < 0.5) spawnPickup('ammo', e.body.pos);
    else if (r < 0.62) spawnPickup('health', e.body.pos);
  };
  ctx.onProtestersRiot = () => { if (net.active && net.isHost) net.send('briot', {}); };
  ctx.onPlayerWanted = () => { if (net.active && net.isHost) net.send('bwanted', {}); };

  ctx.onCivilianKilled = (civ, info) => {
    if (info && (info.source === 'bot' || info.source === 'fall' || info.source === 'car' || info.source === 'event')) return;
    ctx.playerWanted = true;
    if (ctx.onPlayerWanted) ctx.onPlayerWanted();
    audio.siren(civ.center);
    hud.message('🚨 CRIME COMETIDO!', 'A Polícia foi acionada para conter o infrator!', 3.5);
    hud.kill('🚨 Inocente Morto · Polícia Acionada!', -100);
    player.addCash(-150, 'Crime / Multa Policial');
    game.addScore(-100, 'Crime Cometido');

    const policeAlive = enemies.enemies.filter((e) => e.alive && e.T.isPolice).length;
    if ((!online() || net.isHost) && policeAlive < 10) {
      const culprit = (info && info.by && remote.get(info.by)) || player;
      const cx = civ.body.pos.x, cz = civ.body.pos.z;
      for (let i = 0; i < 2; i++) {
        const pPos = new THREE.Vector3(cx + (i === 0 ? -6 : 6), 0, cz + (Math.random() - 0.5) * 8);
        const pBot = enemies.spawn(i === 0 ? 'police' : 'police_tactical', pPos);
        pBot.state = 'hunt';
        pBot.target = culprit;
      }
      const chiefPos = new THREE.Vector3(cx, 0, cz + (cz > 0 ? -10 : 10));
      const chief = enemies.spawn('police_chief', chiefPos);
      chief.state = 'hunt';
      chief.target = culprit;
    }
  };

  enemies.onBoss = (e) => {
    if (!e.alive) { hud.setBoss(null, null); game.boss = null; }
    else { game.boss = e; hud.setBoss(e.T.name, e.hp / e.maxHp); }
  };
  player.onThrow = (d) => { if (net.active) net.broadcast('nade', d); };
  player.onRocket = (d) => { if (net.active) net.broadcast('rocket', d); };

  return { shotQueue };
}
