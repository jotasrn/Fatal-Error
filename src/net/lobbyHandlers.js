import * as THREE from 'three';
import { INK } from '../core/render.js';
import { sanitizeName, sanitizeText, clampNum, sanitizeVec3, sanitizeShots, sanitizePlayerState } from '../core/security.js';
import { TRACER_THICK } from '../game/pvpCombat.js';

export function registerLobbyHandlers(ctx, deps) {
  const {
    net, remote, lobby, scores, game, player, enemies, hud, effects, audio, input,
    bEvents, knownMap, setLevel, breakProp, spawnPickup, removePickup, pickups,
    getMapKey, getLoadedKey, getMyName, online, inMatch,
    ONLINE_MODES, FFA_TIME, HOW,
    addRemote, removeRemote, broadcastLobby, sendScores, applyScores,
    refreshScoreHud, tallyDeath, endMatch, leaveOnline, migrateHost,
    farthestSpawnIndex, startMatch, hostStart, toLobbyScreen, renderLobby, showStart,
    setMatchLeft, getMatchLeft, setClockRunning,
  } = deps;

  const _sm = new THREE.Vector3();
  const _se = new THREE.Vector3();

  net.hostName = getMyName();
  net.onPeerLeave = (id) => {
    const nm = (lobby.players.get(id) || {}).name;
    removeRemote(id); broadcastLobby();
    if (inMatch()) { hud.kill((nm || 'Alguém') + ' saiu da sala', 0); sendScores(); }
  };
  net.onDisconnect = () => {
    if (lobby.order && lobby.order.some((id) => id !== lobby.hostId)) migrateHost();
    else leaveOnline('O anfitrião saiu da sala');
  };
  net.on('refused', (d) => leaveOnline(sanitizeText(d && d.reason, 80)));
  net.onPeerJoin = (from, meta) => {
    const name = sanitizeName(meta && meta.name, 'Jogador');
    if (meta && typeof meta.prev === 'string' && meta.prev !== from && !remote.has(meta.prev)) {
      const sc = scores.get(meta.prev); if (sc) { scores.delete(meta.prev); scores.set(from, sc); }
      lobby.players.delete(meta.prev);
      if (lobby.order) lobby.order = lobby.order.filter((id) => id !== meta.prev);
    }
    lobby.players.set(from, { name }); addRemote(from, name); broadcastLobby();
    if (game.state === 'play' || game.state === 'dying') {
      if (!scores.has(from)) scores.set(from, { name, kills: 0, deaths: 0 });
      net.sendTo(from, 'start', { late: true, spawn: farthestSpawnIndex(), map: lobby.map || getMapKey(), gameMode: lobby.gameMode || 'ffa', broken: ctx.level.breakables.filter((b) => !b.alive).map((b) => b.id) });
      if (net.isHost) {
        for (const e of enemies.enemies) if (e.alive) net.sendTo(from, 'espawn', { id: e.id, type: e.type, pos: e.body.pos.toArray() });
      }
      sendScores(); hud.kill(name + ' entrou na sala', 0);
    }
  };
  net.on('lobby', (d) => {
    if (!d || !Array.isArray(d.players)) return;
    lobby.hostId = typeof d.hostId === 'string' ? d.hostId : net.hostId;
    lobby.isPublic = !!d.isPublic; lobby.code = net.code; lobby.shown = sanitizeText(d.shown || net.code, 16);
    if (d.gameMode && ONLINE_MODES[d.gameMode]) lobby.gameMode = d.gameMode;
    if (d.map) {
      lobby.map = knownMap(d.map);
      if (game.state === 'lobby' && getLoadedKey() !== lobby.map) { setLevel(lobby.map, true); player.reset(ctx.level.playerStart); }
    }
    const safePlayers = d.players.slice(0, 16).filter((p) => p && typeof p.id === 'string').map((p) => ({ id: p.id, name: sanitizeName(p.name, 'Jogador') }));
    lobby.order = safePlayers.map((p) => p.id); lobby.players.clear();
    for (const p of safePlayers) lobby.players.set(p.id, { name: p.name });
    for (const p of safePlayers) if (p.id !== net.id) addRemote(p.id, p.name);
    for (const id of [...remote.keys()]) if (!lobby.players.has(id)) removeRemote(id);
    if (inMatch()) { for (const p of safePlayers) if (!scores.has(p.id)) scores.set(p.id, { name: p.name, kills: 0, deaths: 0 }); refreshScoreHud(); }
    renderLobby();
  });
  net.on('leave', (d) => { if (!d || typeof d.id !== 'string') return; const nm = (lobby.players.get(d.id) || {}).name; removeRemote(d.id); if (inMatch()) hud.kill((nm || 'Alguém') + ' saiu da sala', 0); renderLobby(); });
  net.on('start', (d) => { if (net.isHost || !d || typeof d !== 'object') return; if (d.map) lobby.map = knownMap(d.map); if (d.gameMode && ONLINE_MODES[d.gameMode]) lobby.gameMode = d.gameMode; startMatch(!!d.late, d.spawns ? d.spawns[net.id] : d.spawn, d.map); if (Array.isArray(d.broken)) for (const id of d.broken.slice(0, 500)) { const br = ctx.level.breakables[id]; if (br) breakProp(br, null, false, true); } });
  net.on('startreq', () => { if (net.isHost && game.state === 'lobby') hostStart(); });
  net.on('end', (d) => endMatch(d));
  net.on('backtolobby', () => { if (!net.isHost) toLobbyScreen(); });
  net.on('pickup', (d) => { if (!net.isHost && d && sanitizeVec3(d.pos)) spawnPickup(d.kind, new THREE.Vector3().fromArray(sanitizeVec3(d.pos)), d.id); });
  net.on('taken', (d) => { if (!d) return; const p = pickups.find((x) => x.id === d.id); if (p) removePickup(p); });
  net.on('take', (d) => { if (!net.isHost || !d) return; const p = pickups.find((x) => x.id === d.id); if (p) { removePickup(p); net.send('taken', { id: d.id }); } });
  net.on('ps', (d, from) => { const ps = sanitizePlayerState(d); if (!ps) return; const r = remote.get(from); if (r) { r.push(ps, performance.now() / 1000); r.lastSeen = performance.now(); } });
  net.on('pdmg', (d, from) => {
    if (!d || typeof d !== 'object' || !player.alive || game.state !== 'play' || player.shieldT > 0) return;
    const amount = clampNum(d.amount, 0, 220, 0); if (amount <= 0) return;
    const fromPos = sanitizeVec3(d.from);
    const src = typeof d.src === 'string' && HOW[d.src] ? d.src : null;
    player.lastHitBy = from || null;
    player.lastHit = { from: fromPos, crit: !!d.crit, amount, src };
    player.takeDamage(amount, fromPos ? new THREE.Vector3().fromArray(fromPos) : null);
  });
  net.on('espawn', (d) => { if (!net.isHost && d && typeof d.type === 'string' && sanitizeVec3(d.pos)) enemies.spawn(d.type, new THREE.Vector3().fromArray(sanitizeVec3(d.pos)), d.id); });
  net.on('esnap', (arr) => { if (!net.isHost && Array.isArray(arr)) enemies.applySnapshot(arr, performance.now() / 1000); });
  net.on('ekill', (d) => { if (!net.isHost && d) enemies.killMirror(d.id, d.info); });
  net.on('ekillcredit', (d) => {
    if (!d || typeof d !== 'object') return;
    const pts = Math.round(clampNum(d.pts, 0, 2000, 0));
    const cash = Math.round(clampNum(d.cash, 0, 2000, 0));
    const label = sanitizeText(d.label, 48);
    game.kills++; game.addScore(pts, label); player.addCash(cash, label); audio.kill(true);
  });
  net.on('ewave', (d) => { if (!net.isHost && d) { const w = Math.max(1, Math.round(clampNum(d.wave, 1, 999, 1))); game.wave = w; hud.setWave(w, 0); hud.message('Onda ' + w, sanitizeText(d.name, 48) || 'Bots e Jogadores!', 2.5); audio.wave(); } });
  net.on('ewaveclear', (d) => { if (!net.isHost && d) { const w = Math.max(1, Math.round(clampNum(d.wave, 1, 999, 1))); hud.message('Onda ' + w + ' Concluída', 'Prepare-se para a próxima onda!', 2.5); audio.waveClear(); player.hp = Math.min(player.maxHp, player.hp + 40); player.addCash(300 + 50 * Math.min(w, 30), 'Onda Concluída'); } });
  net.on('bevent', (d) => { if (!net.isHost && ctx.level.key === 'brasilia') bEvents.onNet(d); });
  net.on('bmanif', (d) => { if (!net.isHost) { const z = sanitizeText(d && d.zone, 32) || 'NA ESPLANADA'; ctx.protestersRiot = false; ctx.playerWanted = false; audio.siren(player.center); hud.message(`🚩 MANIFESTAÇÃO ${z}!`, 'Confronto entre Manifestantes e PMDF! Não ataque nenhum lado!', 4.5); } });
  net.on('bcalm', () => { if (!net.isHost) { ctx.protestersRiot = false; ctx.playerWanted = false; } });
  net.on('briot', () => { if (!net.isHost) { ctx.protestersRiot = true; audio.siren(player.center); hud.message('⚠️ MULTIDÃO EM FÚRIA!', 'Alguém atacou os manifestantes! A multidão partiu para cima!', 4.0); } });
  net.on('bwanted', () => { if (!net.isHost) { ctx.playerWanted = true; audio.siren(player.center); hud.message('🚨 FORÇA POLICIAL ACIONADA!', 'A Polícia está revidando ataques na partida!', 3.5); } });
  net.on('ehit', (d, from) => {
    if (!net.isHost || !d || typeof d !== 'object') return;
    const amount = clampNum(d.amount, 0, 500, 0); if (amount <= 0) return;
    const e = enemies.byId.get(d.id); if (!e || !e.alive) return;
    const pt = d.info && sanitizeVec3(d.info.point);
    const dr = d.info && sanitizeVec3(d.info.dir, 10);
    const info = {
      crit: !!(d.info && d.info.crit),
      part: (d.info && typeof d.info.part === 'string' && d.info.part.slice(0, 16)) || 'torso',
      source: 'remote_bullet',
      point: pt ? new THREE.Vector3().fromArray(pt) : e.center.clone(),
      dir: dr ? new THREE.Vector3().fromArray(dr) : new THREE.Vector3(0, 1, 0),
      by: from,
    };
    enemies.damage(e, amount, info);
    if (!e.alive) {
      const sc = scores.get(from); const kname = sc ? sc.name : 'Jogador';
      net.sendTo(from, 'ekillcredit', { pts: e.T.score, cash: 125 + (info.crit ? 75 : 0), label: e.T.name });
      net.send('feed', { text: kname + ' eliminou ' + e.T.name + (info.crit ? ' (Tiro na Cabeça)' : '') });
    }
  });
  net.on('pdead', (d, from) => {
    if (!d || typeof d !== 'object') return;
    const r = remote.get(from); const vn = r ? r.name : 'Alguém';
    const kn = d.killer && scores.get(d.killer) ? scores.get(d.killer).name : null;
    const dir = sanitizeVec3(d.dir, 10);
    if (r) { r.ragdoll(dir ? new THREE.Vector3().fromArray(dir) : null, !!d.over); audio.enemyDie(r.center); }
    const safeHow = sanitizeText(d.how, 28);
    const how = safeHow ? ' · ' + safeHow + (d.crit ? ' Tiro na Cabeça' : '') : '';
    if (d.killer === net.id) { game.kills++; game.addScore(150, 'Eliminou ' + vn + how); player.addCash(300, 'Eliminação PvP'); audio.kill(true); }
    else hud.kill(kn ? kn + ' eliminou ' + vn + how : vn + ' caiu da página', 0);
    if (net.isHost) tallyDeath(from, typeof d.killer === 'string' ? d.killer : null);
  });
  net.on('nade', (d) => { if (d && sanitizeVec3(d.pos) && sanitizeVec3(d.vel, 200)) player.throwGrenade(d); });
  net.on('rocket', (d) => { if (d && sanitizeVec3(d.pos) && sanitizeVec3(d.vel, 400)) player.fireRocket(d); });
  net.on('brk', (d) => { if (!d) return; const br = ctx.level.breakables[d.id]; if (br) breakProp(br, null, false); });
  net.on('parry', (d) => { if (!d) return; audio.shieldHit(player.center); input.rumble(0.35, 0.3, 60); effects.strokeBurst(player.eye.clone().addScaledVector(player.forward, 0.5), INK.ORANGE, 8, 5, { life: 0.2, size: 0.03 }); hud.kill(d.ret ? 'Rebatido' : 'Desviado', d.ret ? 25 : 0); });
  net.on('shots', (d, from) => {
    if (!d || typeof d !== 'object') return;
    const r = remote.get(from); if (!r || !r.root || !r.alive) return;
    _sm.set(r.body.pos.x + r.right.x * 0.3 + r.forward.x * 0.8, r.body.pos.y + 1.35 + r.forward.y * 0.8, r.body.pos.z + r.right.z * 0.3 + r.forward.z * 0.8);
    const th = TRACER_THICK[d.k] || 0.02; const e = sanitizeShots(d.e, 36);
    for (let i = 0; i + 2 < e.length; i += 3) { _se.set(e[i], e[i + 1], e[i + 2]); effects.tracer(_sm, _se, INK.BLUE, th, 0.06); }
    r.flash(); audio.remoteShot(d.k, _sm);
  });
  net.on('cut', () => { if (player.grapple.state !== 'idle') { player.detachGrapple(false); effects.strokeBurst(player.center, INK.ORANGE, 8, 4, { life: 0.25, size: 0.03 }); hud.tip('Sua corda foi cortada!', 1.3); input.rumble(0.5, 0.3, 80); } });
  net.on('score', (rows) => { if (!net.isHost) applyScores(rows); });
  net.on('fell', (_d, from) => { if (!net.isHost) return; const sc = scores.get(from); if (sc) { sc.kills = Math.max(0, sc.kills - 1); sendScores(); net.send('feed', { text: sc.name + ' caiu da página · -1' }); hud.kill(sc.name + ' caiu da página · -1', 0); } });
  net.on('feed', (d) => hud.kill(sanitizeText(d && d.text, 96), 0));
  net.on('clock', (d) => { if (!net.isHost && d) { setMatchLeft(clampNum(d.left, 0, FFA_TIME * 2, getMatchLeft())); setClockRunning(!!d.on); refreshScoreHud(); } });
  net.on('kick', (d) => {
    const back = sanitizeText(String(net.aliasCode || net.code || '').replace(/-\d+$/, ''), 16);
    leaveOnline(sanitizeText(d && d.reason, 80) || 'Desconectado da sala');
    lobby.rejoinCode = back;
    if (back) showStart();
  });

  player.onFall = () => {
    if (!online() || !inMatch()) return;
    hud.kill('Caiu da página · -1 eliminação', 0);
    if (net.isHost) { const sc = scores.get(net.id); if (sc) { sc.kills = Math.max(0, sc.kills - 1); sendScores(); net.send('feed', { text: sc.name + ' caiu da página · -1' }); } }
    else net.send('fell', {});
  };
}
