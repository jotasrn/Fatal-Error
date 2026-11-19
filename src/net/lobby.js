import * as THREE from 'three';
import { INK } from '../core/render.js';
import { RemotePlayer, encodeLocal } from '../player/remotePlayer.js';
import { choose } from '../core/util.js';
import {
  escHtml, sanitizeName, clampNum,
} from '../core/security.js';
import { registerLobbyHandlers } from './lobbyHandlers.js';

const esc = escHtml;

export const FFA_TARGET = 20;
export const FFA_TIME = 600;
export const RESPAWN = 2.5;

export const ONLINE_MODES = {
  ffa: 'Mata-Mata Livre',
  ctf: 'Pega-Bandeira entre as Asas',
  koth: 'Rei do Mirante (Torre de TV)',
  coop: 'Cooperativo (Ondas & Missões)',
};

export const HOW = {
  revolver: 'Revólver .357',
  pistol9mm: 'Pistola 9mm',
  punisher: 'Punisher 5.7mm',
  deagle: 'Desert Eagle .50',
  requiem: 'Requiem .500 Magnum',
  rifle: 'Rifle',
  smg: 'Submetralhadora',
  laser: 'Fuzil de Plasma',
  shotgun: 'Escopeta',
  sniper: 'Sniper',
  bazooka: 'Bazuca',
  katana: 'Katana',
  grenade: 'Granada',
  deflect: 'próprio tiro',
  blast: 'explosão',
};
const howWord = (src) => HOW[src] || null;

export const mmss = (t) => {
  t = Math.max(0, Math.ceil(t));
  return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0');
};

export function createLobbyManager(ctx, deps) {
  const {
    net, remote, lobby, scores, game, player, enemies, hud, effects, audio, input,
    progression, bEvents, shotQueue, online, knownMap, setLevel, setArena,
    breakProp, spawnPickup, removePickup, pickups,
    getMapKey, getLoadedKey, getMyName,
  } = deps;

  let matchLeft = FFA_TIME;
  let clockT = 0;
  let clockRunning = false;
  let migrating = false;
  let idleWarned = false;
  let idleCheckT = 0;
  let esnapT = 0;
  let psT = 0;

  const _sm = new THREE.Vector3();
  const _se = new THREE.Vector3();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const IDLE_FLAG = 30, IDLE_MATCH = 150, IDLE_LOBBY = 300, IDLE_WARN = 20;

  const inMatch = () => ['play', 'dying', 'over'].includes(game.state);
  const spawnSpots = () => (ctx.level.arenaSpawns && ctx.level.arenaSpawns.length ? ctx.level.arenaSpawns : ctx.level.spawns);

  function arenaSpawn() {
    const spots = spawnSpots();
    const others = [...remote.values()].filter((r) => r.alive && r.root && r.root.visible);
    const scored = spots.map((s) => ({ s, d: others.reduce((a, r) => Math.min(a, r.body.pos.distanceTo(s)), 999) }));
    scored.sort((a, b) => b.d - a.d);
    return choose(scored.slice(0, Math.min(3, scored.length))).s.clone();
  }

  function farthestSpawnIndex() {
    const spots = spawnSpots();
    const bodies = [player, ...remote.values()].filter((r) => r.alive);
    let best = 0, bd = -1;
    spots.forEach((s, i) => {
      const d = bodies.reduce((a, r) => Math.min(a, r.body.pos.distanceTo(s)), 999);
      if (d > bd) { bd = d; best = i; }
    });
    return best;
  }

  function sortedScores() {
    return [...scores.entries()].sort((a, b) => b[1].kills - a[1].kills || a[1].deaths - b[1].deaths);
  }
  const scoreRowsHTML = () => `<div class="scoreboard">${sortedScores().map(([id, s], i) => `<div class="${id === net.id ? 'me' : ''}"><span class="rk">${i + 1}</span><span class="nm">${esc(s.name)}${id === net.id ? ' (você)' : ''}</span><span class="kd"><b>${s.kills}</b> abates · ${s.deaths} mortes</span></div>`).join('')}</div>`;

  function boardHTML(title = 'Mata-Mata Livre') {
    const rows = sortedScores();
    const roomCode = esc(String(net.aliasCode || net.code || '').replace(/-\d+$/, ''));
    return `<h3>${esc(title)}</h3>${rows.map(([id, s]) => `<div class="${id === net.id ? 'me' : ''}"><span>${esc(s.name)}${id === net.id ? ' (Você)' : ''}</span><span>${s.kills} Kills · ${s.deaths} Mortes</span></div>`).join('')}<div class="foot">${esc(ONLINE_MODES[game.onlineMode] || title)} · Restam ${mmss(matchLeft)} · Sala ${roomCode}</div>`;
  }

  function refreshScoreHud() {
    if (!online()) return;
    const mLabel = ONLINE_MODES[game.onlineMode] || 'Mata-Mata';
    const rows = sortedScores();
    const top = rows.slice(0, 3);
    const myIdx = rows.findIndex(([id]) => id === net.id);
    if (myIdx >= 3) top.push(rows[myIdx]);
    hud.setPvpScore(top.map(([id, sc]) => `<div class="row${id === net.id ? ' me' : ''}"><span class="rank">${rows.findIndex(([x]) => x === id) + 1}.</span><span>${esc(sc.name)}${id === net.id ? ' (Você)' : ''}</span><b>${sc.kills}</b></div>`).join('') + `<div class="target">${esc(mLabel)} · Restam ${mmss(matchLeft)}</div>`);
    hud.setModifier('');
    if (!hud.el.board.hidden) hud.setBoard(boardHTML(mLabel));
  }

  function applyScores(rows) {
    if (!Array.isArray(rows)) return;
    scores.clear();
    for (const r of rows.slice(0, 24)) {
      if (!r || typeof r.id !== 'string') continue;
      scores.set(r.id, {
        name: sanitizeName(r.name, 'Jogador'),
        kills: Math.round(clampNum(r.kills, 0, 99999, 0)),
        deaths: Math.round(clampNum(r.deaths, 0, 99999, 0)),
      });
    }
    refreshScoreHud();
  }

  function sendScores() {
    const rows = [...scores.entries()].map(([id, s]) => ({ id, ...s }));
    net.send('score', rows);
    applyScores(rows);
  }

  function tallyDeath(victim, killer) {
    const v = scores.get(victim); if (v) v.deaths++;
    if (killer && killer !== victim) { const k = scores.get(killer); if (k) k.kills++; }
    sendScores();
  }

  function onLocalDeath() {
    if (!online()) { game.state = 'dying'; game.deathT = 0; return; }
    const killer = player.lastHitBy || null;
    const h = player.lastHit || {};
    const dir = h.from ? player.center.clone().sub(new THREE.Vector3().fromArray(h.from)).normalize().toArray().map((v) => +v.toFixed(2)) : null;
    const how = killer ? howWord(h.src) : null;
    net.broadcast('pdead', { killer, dir, over: !!(h.crit || h.amount >= 90 || h.src === 'katana'), how, crit: !!h.crit });
    if (net.isHost) tallyDeath(net.id, killer);
    game.respawnT = RESPAWN; game.state = 'dying'; game.deathT = 0;
    const kn = killer && scores.get(killer) ? scores.get(killer).name : null;
    hud.kill(kn ? 'Eliminado por ' + kn + (how ? ' · ' + how + (h.crit ? ' Tiro na Cabeça' : '') : '') : 'Eliminado', 0);
  }

  function respawnLocal() {
    player.reset(arenaSpawn());
    player.name = getMyName();
    player.lastHitBy = null;
    player.lastHit = null;
    game.state = 'play';
    player.shieldT = 2;
    hud.tip('Escudo de Renascimento · 2s', 1.6);
    effects.strokeBurst(player.center, INK.BLUE, 24, 6, { life: 0.5, size: 0.03 });
    audio.spawn(player.center);
  }

  function endMatch(winner) {
    const w = winner && typeof winner === 'object' ? winner : { id: '', name: 'Alguém' };
    game.over = w; game.overT = 0; game.state = 'over';
    deps.endFocus();
    input.exitLock();
    hud.setBoard(null);
    const earnedCr = 30 + Math.min(120, (game.kills || 0) * 4);
    progression.addCredits(earnedCr);
    const wName = sanitizeName(w.name, 'Alguém');
    const title = w.id === net.id ? 'Você Venceu!' : wName + ' Venceu!';
    hud.setGameplayVisible(false);
    hud.showScreen(`<div class="p-head"><h1 class="${w.id === net.id ? 't-gold' : ''}">${esc(title)}</h1><h2>Resultado final · +${earnedCr} CR permanentes (Saldo: ${progression.credits} CR)</h2></div>${scoreRowsHTML()}${net.isHost ? '<div class="m-play"><button type="button" class="btn btn-yellow btn-lg" data-act="go">Voltar à sala</button></div>' : '<div class="foot-hint">Aguardando o anfitrião voltar à sala…</div>'}`);
  }

  function addRemote(id, name) {
    const cleanName = sanitizeName(name, 'Jogador');
    if (remote.has(id)) { const r = remote.get(id); r.name = cleanName; return r; }
    const rp = new RemotePlayer(ctx, id, cleanName, 0, INK.PURPLE);
    rp.onDamage = (t, amount, fromPos) => {
      if (!ctx.canHurt(t) || !t.alive) return;
      hud.hitmarker(false, false);
      net.sendTo(t.id, 'pdmg', { amount: Math.round(amount), from: fromPos ? fromPos.toArray().map((v) => +v.toFixed(1)) : null, by: net.id, src: 'grenade' });
    };
    remote.set(id, rp);
    return rp;
  }

  function removeRemote(id) {
    const r = remote.get(id);
    if (r) { r.dispose(); remote.delete(id); }
    lobby.players.delete(id);
    scores.delete(id);
  }

  function lobbyRows() { return [...lobby.players.entries()].map(([id, p]) => ({ id, name: p.name })); }

  function broadcastLobby() {
    net.send('lobby', {
      players: lobbyRows(),
      hostId: net.id,
      isPublic: lobby.isPublic,
      map: lobby.map || getMapKey(),
      gameMode: lobby.gameMode || 'ffa',
      shown: net.aliasCode || net.code,
    });
    deps.renderLobby();
  }

  function friendlyError(err) {
    const m = String(err && err.message || err || ''); if (!m) return 'Ocorreu um erro';
    if (/networking library/.test(m)) return 'Biblioteca de rede não carregou · Verifique sua conexão';
    if (/timed out|signalling/.test(m)) return 'Tempo esgotado no servidor de sinalização';
    if (/no lobby with that code/.test(m)) return 'Nenhuma sala com esse código · Verifique o código com seus colegas';
    if (/no answer/.test(m)) return 'Sala encontrada, mas sem resposta de conexão';
    if (/full/.test(m)) return 'A sala está cheia · Tente outro código';
    if (/leave the lobby/.test(m)) return 'Saia da sala atual primeiro';
    return m;
  }

  function setStatus(t) {
    lobby.status = t;
    const el = hud.el.panel.querySelector('#status');
    if (el) el.textContent = t;
  }

  function leaveOnline(reason) {
    net.leave();
    for (const id of [...remote.keys()]) removeRemote(id);
    lobby.players.clear(); scores.clear(); hud.setBoard(null);
    if (game.state !== 'start') {
      game.state = 'start'; game.mode = 'solo'; setArena(false);
      deps.resetGame();
      hud.setGameplayVisible(false);
    }
    game.menu = false; lobby.status = reason || '';
    deps.setScreen('online');
    deps.showStart();
  }

  async function migrateHost() {
    if (migrating) return;
    migrating = true;
    try { await _migrateHost(); } finally { migrating = false; }
  }

  async function _migrateHost() {
    const oldHost = lobby.hostId, myId = net.id;
    const gen = (lobby.gen || 0) + 1;
    lobby.gen = gen;
    const base = (lobby.code || net.code || '').replace(/-\d+$/, '');
    const code = base + '-' + gen;
    const roster = (lobby.order || []).filter((id) => id !== oldHost && lobby.players.has(id));
    if (!roster.length || !base) { leaveOnline('O anfitrião saiu da sala'); return; }
    const successor = roster[0];
    const wasInMatch = inMatch();
    if (oldHost) {
      const r = remote.get(oldHost); if (r) r.dispose();
      remote.delete(oldHost); lobby.players.delete(oldHost); scores.delete(oldHost);
    }
    hud.message('O anfitrião saiu', successor === myId ? 'Você é o novo anfitrião' : 'Migrando para novo anfitrião…', 2.6);
    if (successor === myId) {
      let ok = false;
      for (let tries = 0; tries < 2 && !ok; tries++) {
        try { await net.host({ isPublic: lobby.isPublic, isInternal: lobby.isLan, mode: lobby.mode, code }); ok = true; }
        catch (e) { await sleep(800); }
      }
      if (!ok) { leaveOnline('Não foi possível assumir a sala'); return; }
      const mine = lobby.players.get(myId) || { name: getMyName() };
      lobby.players.delete(myId); lobby.players.set(net.id, mine);
      const ms = scores.get(myId); scores.delete(myId); if (ms) scores.set(net.id, ms);
      lobby.hostId = net.id; lobby.code = code;
      lobby.order = [net.id, ...roster.filter((id) => id !== myId)];
      net.accepting = true;
      game.clockStarted = clockRunning || matchLeft < FFA_TIME;
      net.onAlias = () => { broadcastLobby(); hud.kill('Código da sala ' + base + ' restaurado', 0); };
      net.claimAlias(base);
      if (game.state === 'over') { /* results stay up */ }
      else if (wasInMatch) { if (game.state !== 'play' && game.state !== 'dying') game.state = 'play'; refreshScoreHud(); }
      else { game.state = 'lobby'; deps.setScreen('lobby'); deps.showStart(); }
      broadcastLobby();
    } else {
      await sleep(1200);
      const deadline = performance.now() + 20000;
      let joined = false;
      while (!joined && performance.now() < deadline) {
        try { await net.join(code, { name: getMyName(), prev: myId }); joined = true; }
        catch (e) { await sleep(1200); }
      }
      if (!joined) { leaveOnline('O anfitrião saiu, partida encerrada'); return; }
      lobby.code = code;
      if (!wasInMatch) { game.state = 'lobby'; deps.setScreen('lobby'); deps.showStart(); }
    }
  }

  async function createLobby(mode) {
    setStatus('Criando sala…');
    const isLan = mode === 'lan';
    const isPublic = mode === 'public';
    try { await net.host({ isPublic, isInternal: isLan, mode }); }
    catch (err) { setStatus(friendlyError(err)); deps.unlockButtons(); return; }
    lobby.isPublic = isPublic; lobby.isLan = isLan; lobby.mode = mode;
    lobby.map = knownMap(getMapKey());
    setLevel(lobby.map, true); player.reset(ctx.level.playerStart);
    lobby.players.clear(); lobby.players.set(net.id, { name: getMyName() });
    lobby.hostId = net.id; lobby.status = '';
    game.state = 'lobby'; deps.setScreen('lobby'); deps.showStart();
  }

  async function joinLobby(code, forceLan = false) {
    setStatus('Conectando…');
    try { await net.join(code, { name: getMyName(), isInternal: forceLan, mode: forceLan ? 'lan' : undefined }); }
    catch (err) { setStatus(friendlyError(err)); deps.unlockButtons(); return; }
    lobby.isPublic = net.isPublic; lobby.isLan = net.isInternal; lobby.status = '';
    game.state = 'lobby'; deps.setScreen('lobby'); deps.showStart();
  }

  async function quickPlay() {
    try {
      await net.quickJoin({ name: getMyName() }, setStatus);
      lobby.isPublic = true; lobby.isLan = net.isInternal; lobby.mode = 'public'; lobby.status = '';
      if (net.isHost) {
        lobby.map = knownMap(getMapKey());
        setLevel(lobby.map, true); player.reset(ctx.level.playerStart);
        lobby.players.clear(); lobby.players.set(net.id, { name: getMyName() });
        lobby.hostId = net.id;
      }
      game.state = 'lobby'; deps.setScreen('lobby'); deps.showStart(); return;
    } catch (err) {
      if (!/no open public/.test(String(err.message))) { setStatus(friendlyError(err)); deps.unlockButtons(); return; }
    }
    setStatus('Nenhuma sala aberta · Criando nova sala pública…');
    await createLobby('public');
  }

  function idleUpdate(dt) {
    if (!net.active) { idleWarned = false; return; }
    idleCheckT -= dt; if (idleCheckT > 0) return; idleCheckT = 1;
    const limit = inMatch() ? IDLE_MATCH : IDLE_LOBBY;
    const idle = input.idleSeconds;
    const othersActive = [...remote.values()].some((r) => !r.idle);
    const canDrop = !net.isHost || !othersActive;
    if (idle > limit - IDLE_WARN && !idleWarned && canDrop) {
      idleWarned = true;
      hud.message('Ainda aí?', 'Mova-se para não ser desconectado por inatividade', 3);
      audio.empty();
    }
    if (idle <= limit - IDLE_WARN) idleWarned = false;
    if (idle > limit && canDrop) {
      const back = net.isHost ? null : String(net.aliasCode || net.code || '').replace(/-\d+$/, '');
      leaveOnline(net.isHost ? 'Sala fechada por inatividade' : 'Desconectado por inatividade');
      lobby.rejoinCode = back;
      if (back) deps.showStart();
      return;
    }
    if (net.isHost) {
      for (const [id, r] of remote) {
        if (r.idle && r.idleSince && performance.now() / 1000 - r.idleSince > limit - IDLE_FLAG + 15) {
          net.sendTo(id, 'kick', { reason: 'Desconectado por inatividade' });
          const c = net.conns.get(id);
          setTimeout(() => { try { c && c.close(); } catch (e) { /* ignore */ } }, 500);
        }
      }
    }
  }

  function netUpdate(dt) {
    idleUpdate(dt);
    if (!net.active) return;
    const now = performance.now() / 1000;
    esnapT -= dt; psT -= dt;
    if (net.isHost && inMatch() && esnapT <= 0) { esnapT = 1 / 15; net.send('esnap', enemies.snapshot()); }
    for (const r of remote.values()) r.update(dt, now);
    if (inMatch() && !migrating) {
      for (const [id, r] of remote) {
        if (r.lastSeen && performance.now() - r.lastSeen > 9000) {
          if (!net.isHost && id === net.hostId) { net.leave(); migrateHost(); break; }
          const nm = r.name; removeRemote(id); hud.kill(nm + ' desconectou', 0);
          if (net.isHost) {
            const c = net.conns.get(id); if (c) { try { c.close(); } catch (e) { /* ignore */ } net.conns.delete(id); }
            net.send('leave', { id }); broadcastLobby(); sendScores();
          }
        }
      }
    }
    const sendPs = psT <= 0 && inMatch();
    if (sendPs) psT = 1 / 20;
    if (sendPs) net.send('ps', encodeLocal(player, player.weaponIndex, { firing: player.firing, idle: input.idleSeconds > IDLE_FLAG }), true);
    if (shotQueue.length) net.broadcast('shots', { k: player.weapon.kind, e: shotQueue.splice(0) });
    if (net.isHost && inMatch()) game.clockStarted = true;
    const clockOn = inMatch() && !game.over && (net.isHost ? !!game.clockStarted : clockRunning);
    if (inMatch() && !game.over) {
      if (clockOn) matchLeft = Math.max(0, matchLeft - dt);
      if (net.isHost) { clockT -= dt; if (clockT <= 0) { clockT = 1; net.send('clock', { left: Math.round(matchLeft), on: clockOn }); refreshScoreHud(); } }
      hud.setTimer(mmss(matchLeft));
    }
    if (net.isHost && clockOn) {
      game.matchT += dt;
      if (matchLeft <= 0) {
        const rows = sortedScores();
        const w = rows.length ? { id: rows[0][0], name: rows[0][1].name } : { id: net.id, name: getMyName() };
        net.send('end', w);
        endMatch(w);
      }
    }
  }

  registerLobbyHandlers(ctx, {
    net, remote, lobby, scores, game, player, enemies, hud, effects, audio, input,
    bEvents, knownMap, setLevel, breakProp, spawnPickup, removePickup, pickups,
    getMapKey, getLoadedKey, getMyName, online, inMatch,
    ONLINE_MODES, FFA_TIME, HOW,
    addRemote, removeRemote, broadcastLobby, sendScores, applyScores,
    refreshScoreHud, tallyDeath, endMatch, leaveOnline, migrateHost,
    farthestSpawnIndex, startMatch: deps.startMatch, hostStart: deps.hostStart,
    toLobbyScreen: deps.toLobbyScreen, renderLobby: deps.renderLobby, showStart: deps.showStart,
    setMatchLeft: (v) => { matchLeft = v; }, getMatchLeft: () => matchLeft,
    setClockRunning: (v) => { clockRunning = v; },
  });
  return {
    inMatch, spawnSpots, arenaSpawn, sortedScores, scoreRowsHTML, boardHTML,
    refreshScoreHud, sendScores, onLocalDeath, respawnLocal, endMatch,
    lobbyRows, broadcastLobby, leaveOnline, createLobby, joinLobby, quickPlay,
    friendlyError, setStatus, netUpdate,
    setMatchLeft: (v) => { matchLeft = v; },
    setClockT: (v) => { clockT = v; },
    setClockRunning: (v) => { clockRunning = v; },
  };
}
