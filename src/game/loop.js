import { clamp } from '../core/util.js';
import { ONLINE_MODES, FFA_TIME } from '../net/lobby.js';

export function createGameLoop(ctx, deps) {
  const {
    R, canvas, input, hud, minimap, effects, audio, player, enemies, net, remote,
    lobby, scores, missions, bEvents, survival, game, online,
    knownMap, setLevel, setArena, getLoadedKey, getArenaLoaded, getMapKey, getMyName,
    getMusicWanted, setMusicWanted,
    updateTrafficHits, spawnBrasiliaCivilians, maintainBrasiliaPedestrians,
    lobbyMgr, screensMgr, settingsMgr,
  } = deps;

  const {
    clearPickups, updatePickups, updateArenaPickups,
    startWave, updateWaves, endFocus, updateFocus,
    FOCUS_SCALE, KATANA_CHARGE_KILLS,
  } = survival;

  let last = performance.now();
  let boardToggle = false;
  let lockTipT = 0.5;
  let musicHealT = 2;
  let errCount = 0;
  let errLastMsg = '';
  let lastWall = 0;
  let lastMatchActiveSent = null;

  const perf = {
    last: 0, times: [], logT: 0,
    show: localStorage.getItem('fatal_fps') === '1',
    el: null, uiT: 0, js: 0, jsN: 0, rnd: 0,
  };

  function resetGame() {
    if (ctx.level.breakables.some((b) => !b.alive)) setLevel(getLoadedKey(), getArenaLoaded(), true);
    enemies.clear(); effects.clear(); clearPickups(); missions.clear();
    ctx.protestersRiot = false; ctx.playerWanted = false;
    player.maxHp = online() ? 110 : 120;
    player.regenDelay = online() ? 4 : 4.5;
    player.regenRate = online() ? 14 : 11;
    player.reset(ctx.level.playerStart);
    player.name = getMyName(); player.lastHitBy = null; player.lastHit = null;
    enemies.mods.speed = 1; enemies.mods.damage = 1;
    hud.setModifier(''); hud.setBoss(null, null); game.boss = null;
    endFocus(); game.katanaStreak = 0;
    game.score = 0; game.kills = 0; game.combo = 0; game.wave = 0;
    game.intermission = 0; game.queue = []; game.time = 0; game.over = null; game.matchT = 0;
    hud.setScore(0, 0); hud.setTimer(''); hud.setPvpScore(null); hud.setWave(1, 0); hud.setBoard(null);
  }

  function beginCommon() {
    audio.init(); audio.resume();
    if (!input.usingGamepad) input.requestLock();
    if (getMusicWanted() && !audio.musicPlaying) audio.musicOn(true);
    hud.hideScreen(); hud.setGameplayVisible(true); game.menu = false;
  }

  function begin() {
    game.mode = 'solo'; game.onlineMode = 'solo'; setArena(false); beginCommon();
    if (game.state === 'start' || game.state === 'dead') {
      resetGame();
      if (ctx.level.key === 'brasilia') spawnBrasiliaCivilians();
      startWave(1);
    }
    game.state = 'play';
  }

  function beginAtWave(n) {
    game.mode = 'solo'; game.onlineMode = 'solo'; setArena(false); beginCommon(); resetGame();
    if (ctx.level.key === 'brasilia') spawnBrasiliaCivilians();
    startWave(n); game.state = 'play';
  }

  function jumpToWave(n) {
    enemies.clear(); effects.clear(); enemies.mods.speed = 1; enemies.mods.damage = 1;
    endFocus(); game.intermission = 0; game.queue = [];
    startWave(n); hud.hideScreen(); hud.setGameplayVisible(true);
    game.state = 'play'; game.menu = false; audio.reelLoop(false);
  }

  function hostStart() {
    scores.clear();
    for (const [id, p] of lobby.players) scores.set(id, { name: p.name, kills: 0, deaths: 0 });
    lobby.map = knownMap(lobby.map || getMapKey());
    setLevel(lobby.map, true);
    const spots = lobbyMgr.spawnSpots();
    const order = spots.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const spawns = {};
    [...lobby.players.keys()].forEach((id, i) => { spawns[id] = order[i % order.length]; });
    net.send('start', { spawns, map: lobby.map, gameMode: lobby.gameMode || 'ffa' });
    startMatch(false, spawns[net.id], lobby.map);
    lobbyMgr.sendScores();
  }

  function startMatch(late, spawnIdx, forcedMap) {
    if (forcedMap) lobby.map = knownMap(forcedMap);
    const chosenMap = knownMap(lobby.map || getMapKey());
    lobby.map = chosenMap;
    net.inMatch = true; game.mode = 'ffa'; game.onlineMode = lobby.gameMode || 'ffa';
    enemies.mirror = !net.isHost;
    setLevel(chosenMap, true); resetGame();
    lobbyMgr.setMatchLeft(FFA_TIME); lobbyMgr.setClockT(0);
    game.clockStarted = true; lobbyMgr.setClockRunning(true);
    for (const r of remote.values()) r.lastSeen = performance.now();
    if (!scores.size) for (const [id, p] of lobby.players) scores.set(id, { name: p.name, kills: 0, deaths: 0 });
    const spots = lobbyMgr.spawnSpots();
    player.reset(spawnIdx != null && spots[spawnIdx] ? spots[spawnIdx].clone() : lobbyMgr.arenaSpawn());
    player.team = [...lobby.players.keys()].indexOf(net.id);
    if (player.team < 0) player.team = 0;
    beginCommon(); game.state = 'play'; screensMgr.setScreen('lobby'); player.shieldT = 2;
    if (game.onlineMode === 'ctf' || game.onlineMode === 'koth') missions.startOnlineMode(game.onlineMode);
    if (net.isHost) {
      if (ctx.level.key === 'brasilia') spawnBrasiliaCivilians();
      startWave(1);
    }
    const modeTitle = ONLINE_MODES[game.onlineMode] || 'Mata-Mata Livre';
    lobbyMgr.refreshScoreHud();
    hud.message(modeTitle, late ? 'Você entrou em uma partida em andamento' : modeTitle + ' (' + Math.round(FFA_TIME / 60) + ' min) · Junto com os Bots!', 3);
    hud.tip(`Segure <b>${hud.key('score')}</b> para ver o placar`, 5);
    setTimeout(() => {
      if (game.state === 'play' && !input.pointerLocked && !input.usingGamepad) {
        game.menu = true; screensMgr.showClickToPlay();
      }
    }, 250);
  }

  function pause() {
    if ((game.state !== 'play' && !(game.state === 'dying' && online())) || game.menu) return;
    if (!online()) game.state = 'pause';
    game.menu = true; screensMgr.showPause(); audio.reelLoop(false);
  }

  function resume() {
    if (online()) {
      game.menu = false;
      if (game.state === 'dying' && game.respawnT <= 0) game.respawnArm = input.lastActive;
      hud.hideScreen(); hud.setGameplayVisible(true);
      if (!input.usingGamepad) input.requestLock();
      return;
    }
    begin();
  }

  function toMainMenu() {
    game.state = 'start'; game.mode = 'solo'; game.menu = false;
    setArena(false); resetGame(); audio.reelLoop(false);
    input.exitLock(); hud.setGameplayVisible(false);
    screensMgr.setScreen('main'); screensMgr.showStart();
  }

  function toLobbyScreen() {
    net.inMatch = false;
    for (const r of remote.values()) r.lastSeen = performance.now();
    setArena(true); resetGame();
    game.state = 'lobby'; game.over = null; game.menu = false;
    hud.setGameplayVisible(false); hud.setBoard(null);
    screensMgr.setScreen('lobby'); screensMgr.showStart();
  }

  function perfFrame(now) {
    const ms = perf.last ? now - perf.last : 16.7; perf.last = now;
    if (ms > 1000) return;
    perf.times.push(ms); if (perf.times.length > 1200) perf.times.splice(0, perf.times.length - 1200);
    const playing = game.state === 'play';
    if (perf.show) {
      if (!perf.el) { perf.el = document.createElement('div'); perf.el.className = 'fpsmeter'; hud.root.appendChild(perf.el); }
      perf.uiT -= ms;
      if (perf.uiT <= 0) {
        perf.uiT = 500;
        const n = Math.min(60, perf.times.length), recent = perf.times.slice(-n);
        const avg = recent.reduce((a, b) => a + b, 0) / n;
        perf.el.textContent = Math.round(1000 / avg) + ' FPS · ' + Math.max(...recent).toFixed(0) + ' ms pior';
        perf.el.hidden = false;
      }
    } else if (perf.el) perf.el.hidden = true;
    perf.logT += ms;
    if (playing && perf.logT > 15000 && window.FE_LOG && window.FE_LOG.info) {
      perf.logT = 0;
      const t = perf.times.slice(-900).sort((a, b) => a - b);
      const avg = t.reduce((a, b) => a + b, 0) / t.length;
      const info = R.renderer.info.render;
      const jsMs = perf.jsN ? perf.js / perf.jsN : 0, rMs = perf.jsN ? perf.rnd / perf.jsN : 0;
      perf.js = 0; perf.rnd = 0; perf.jsN = 0;
      window.FE_LOG.info(`perf map=${ctx.level.key} cpu=${jsMs.toFixed(1)}ms render=${rMs.toFixed(1)}ms fps=${(1000 / avg).toFixed(1)} p50=${t[Math.floor(t.length * 0.5)].toFixed(1)}ms p95=${t[Math.floor(t.length * 0.95)].toFixed(1)}ms pior=${t[t.length - 1].toFixed(0)}ms bots=${enemies.alive} calls=${info.calls} tri=${info.triangles} ratio=${R.pixelRatio} tela=${innerWidth}x${innerHeight}`);
    }
  }

  function reportError(where, err) {
    errCount++;
    const msg = where + ': ' + (err && err.stack || err);
    if (msg !== errLastMsg || errCount % 100 === 0) {
      console.error(msg);
      if (window.FE_LOG) window.FE_LOG.error(msg.slice(0, 2000));
    }
    errLastMsg = msg;
  }

  function safeEnemies(sdt) {
    try { enemies.update(sdt); }
    catch (err) {
      reportError('enemies', err);
      const bad = enemies._cur; enemies._cur = null;
      if (bad) {
        const i = enemies.enemies.indexOf(bad);
        if (i >= 0) {
          if (bad.alive) enemies.alive--;
          bad.alive = false;
          if (!bad.rootDetached && bad.root) ctx.scene.remove(bad.root);
          enemies.byId.delete(bad.id);
          enemies.enemies.splice(i, 1);
        }
      }
    }
  }

  function step(now) {
    try { stepInner(now); } catch (err) { reportError('step', err); }
  }

  function stepInner(now) {
    { const wall = performance.now(); if (lastWall && wall - lastWall > 1500) for (const r of remote.values()) if (r.lastSeen) r.lastSeen = wall; lastWall = wall; }
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    input.update(dt);
    const st = game.state; const playing = st === 'play' || st === 'dying';
    const matchBusy = playing || st === 'pause' || st === 'over';
    if (matchBusy !== lastMatchActiveSent) {
      lastMatchActiveSent = matchBusy;
      if (window.FE_UPDATE && window.FE_UPDATE.setMatchActive) window.FE_UPDATE.setMatchActive(matchBusy);
    }
    if (st === 'start' || st === 'pause' || st === 'dead' || st === 'over') {
      if (input.pressed('jump') || input.pressed('confirm') || (st === 'pause' && input.pressed('pause'))) hud.onScreenClick();
    }
    if (playing && input.pressed('buy')) {
      if (hud.el.buymenu.hidden) { hud.toggleBuyMenu(true, player); input.exitLock(); }
      else { hud.toggleBuyMenu(false); if (!input.usingGamepad) input.requestLock(); }
    } else if (playing && input.pressed('map')) {
      const open = minimap.toggleFullMap();
      if (open) input.exitLock();
      else if (!input.usingGamepad) input.requestLock();
    } else if ((st === 'play' || (st === 'dying' && online())) && input.pressed('pause')) {
      if (minimap.fullmapOpen) { minimap.toggleFullMap(false); if (!input.usingGamepad) input.requestLock(); }
      else if (!hud.el.buymenu.hidden) { hud.toggleBuyMenu(false); if (!input.usingGamepad) input.requestLock(); }
      else if (game.menu) resume();
      else { pause(); input.exitLock(); }
    } else if ((st === 'play' || st === 'dying') && game.menu && (input.pressed('jump') || input.pressed('confirm'))) resume();

    if (input.pressed('music')) {
      const want = !getMusicWanted();
      setMusicWanted(want);
      localStorage.setItem('fatal_music', want ? '1' : '0');
      audio.musicOn(want);
      hud.tip(want ? 'Música Ligada' : 'Música Desligada', 1.5);
    }
    if (online() && playing) {
      if (input.usingGamepad && input.pressed('score')) boardToggle = !boardToggle;
      const want = ((input.down('score') && !input.usingGamepad) || boardToggle) && !game.menu;
      if (want !== !hud.el.board.hidden) hud.setBoard(want ? lobbyMgr.boardHTML() : null);
    } else boardToggle = false;
    if (st === 'play' && !game.menu && !input.pointerLocked && !input.usingGamepad) {
      lockTipT -= dt;
      if (lockTipT <= 0) { lockTipT = 2.5; hud.tip('Clique na tela para travar o cursor', 2); }
    }
    let scale = 1;
    if (game.hitstopT > 0) { game.hitstopT -= dt; scale = game.hitstopScale; }
    else if (game.focus.active) scale = FOCUS_SCALE;
    const sdt = dt * scale;
    if (st === 'play' && !online()) updateFocus(dt); else endFocus();
    if (playing) {
      game.time += sdt; if (player.shieldT > 0) player.shieldT -= dt;
      musicHealT -= dt;
      if (musicHealT <= 0) {
        musicHealT = 2;
        if (getMusicWanted() && st === 'play' && !audio.musicPlaying && audio.ctx) audio.musicOn(true);
        if (input.anyInput) audio.resume();
      }
      { const B = ctx.level.bounds, bp = player.body.pos; if (bp.x < B.minX - 8 || bp.x > B.maxX + 8 || bp.z < B.minZ - 8 || bp.z > B.maxZ + 8 || bp.y > 150) bp.y = -100; }
      if (ctx.level.cars && playing) updateTrafficHits();
      player.update(sdt); safeEnemies(sdt); effects.update(sdt); bEvents.update(sdt); missions.update(sdt); updatePickups(sdt); lobbyMgr.netUpdate(dt);
      if (st === 'play' && (!online() || net.isHost)) {
        updateWaves(sdt);
        if (ctx.level.key === 'brasilia') { bEvents.hostTick(sdt); maintainBrasiliaPedestrians(sdt); }
      }
      if (online()) updateArenaPickups(dt);
      if (game.comboT > 0) { game.comboT -= sdt; if (game.comboT <= 0) { game.combo = 0; hud.setScore(game.score, 0); } }
      if (st === 'dying') {
        game.deathT += dt;
        if (online()) {
          const before = Math.ceil(game.respawnT); game.respawnT -= dt; const left = Math.ceil(game.respawnT);
          if (left > 0) { if (left !== before || game.deathT <= dt) hud.message(String(left), 'Ressurgindo em breve…', 1.1); }
          else if (before > 0) { game.respawnArm = input.lastActive; game.promptT = 0; }
          else if (!game.menu) {
            game.promptT -= dt; if (game.promptT <= 0) { game.promptT = 1.4; hud.message('Pronto', `Pressione ${hud.key('confirm')} ou clique para renascer`, 1.5); }
            if (input.lastActive !== game.respawnArm && !input.pressed('pause') && !input.down('pause')) lobbyMgr.respawnLocal();
          }
        } else if (game.deathT > 1.7) { game.state = 'dead'; screensMgr.showDead(); input.exitLock(); }
      }
    } else {
      game.time += dt;
      if (st === 'start' || st === 'dead' || st === 'lobby' || st === 'over') player.idleCam(game.time);
      effects.update(dt);
      if (net.active) lobbyMgr.netUpdate(dt);
      if (st === 'over') {
        game.overT += dt;
        if (net.isHost && game.overT > 8) { net.send('backtolobby', {}); toLobbyScreen(); }
        else if (!net.isHost && game.overT > 15) { toLobbyScreen(); }
      }
    }
    for (const a of ctx.level.animated) a.update(game.time);
    audio.setListener(player.eye, player.right);
    const w = player.weapon; if (w.isGun) hud.setAmmo(w.mag, w.reserve, w.magSize, w.reloading); else hud.setKatana();
    {
      let slotSig = player.weaponIndex + '|';
      for (let i = 0; i < player.weapons.length; i++) {
        const wp = player.weapons[i];
        slotSig += (wp.owned ? (wp.isGun ? wp.mag + '/' + wp.reserve : 'i') : 'x') + ',';
      }
      if (slotSig !== hud._lastSlotSig) {
        hud._lastSlotSig = slotSig;
        hud.setSlots(player.weapons.map((wp, i) => ({
          num: i + 1, name: wp.name, active: i === player.weaponIndex,
          ammo: wp.owned ? (wp.isGun ? wp.mag + '/' + wp.reserve : '∞') : 'Bloqueada',
          empty: wp.isGun && wp.mag === 0 && wp.reserve === 0, locked: !wp.owned,
        })));
      }
    }
    hud.setGrenades(player.grenades); hud.setGrappleStamina(player.grapStam);
    hud.setHealth(player.hp, player.maxHp); hud.setSpread(w.spreadPx); hud.update(dt);
    if (online()) hud.setFocusMeter(playing, player.grapStam, false, 'Gancho');
    else hud.setFocusMeter(playing && (w.kind === 'katana' || game.katanaStreak > 0 || game.focus.active), game.focus.active ? 1 : clamp(game.katanaStreak / KATANA_CHARGE_KILLS, 0, 1), game.focus.active, 'Katana');
    if (game.boss) { if (game.boss.alive) hud.setBoss(game.boss.T.name, game.boss.hp / game.boss.maxHp); else { hud.setBoss(null, null); game.boss = null; } }
    audio.setIntensity(clamp((enemies.alive + game.queue.length + remote.size * 2) / 12, 0, 1) * (game.intermission > 0 ? 0.25 : 1));
    if (minimap) minimap.update(dt, player, enemies.enemies, remote.values(), missions.markers);
    if (ctx.env) { ctx.env.update(dt); if (hud.setClock) hud.setClock(ctx.env.timeLabel(), ctx.env.rain); }
    R.render(game.time, { hurt: player.hurtFx, flash: player.flashFx, slow: scale < 1 ? 1 : 0, lowHp: player.alive && player.hp < 30 ? 1 - player.hp / 30 : 0 });
  }

  function tick(now) {
    requestAnimationFrame(tick);
    perfFrame(now);
    const t0 = performance.now();
    step(now);
    perf.js += performance.now() - t0;
    perf.jsN++;
  }

  function start() {
    { const r0 = R.render.bind(R); R.render = (...a) => { const t = performance.now(); r0(...a); perf.rnd += performance.now() - t; }; }
    try {
      const gl = R.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
      if (window.FE_LOG && window.FE_LOG.info) window.FE_LOG.info('webgl ' + gpu + ' | dpr=' + devicePixelRatio + ' ratio=' + R.pixelRatio);
    } catch (e) { /* ignore */ }
    setInterval(() => { if (net.active && performance.now() - last > 300) step(performance.now()); }, 250);
    window.addEventListener('error', (ev) => reportError('window', ev.error || ev.message));
    window.addEventListener('unhandledrejection', (ev) => reportError('promise', ev.reason));

    hud.onScreenClick = (src) => {
      const st = game.state;
      if (st === 'over') { if (net.isHost) { net.send('backtolobby', {}); toLobbyScreen(); } return; }
      if (st === 'lobby') return;
      if (st === 'start') { if (screensMgr.getScreen() === 'main' && src !== 'backdrop') begin(); return; }
      if ((st === 'play' || st === 'dying') && game.menu) { resume(); return; }
      if (st === 'pause' || st === 'dead') resume();
    };
    canvas.addEventListener('click', () => {
      if (game.state === 'play' && !game.menu && !input.pointerLocked && !input.usingGamepad) input.requestLock();
    });
    input.onLockChange = (locked) => {
      if (!locked && (game.state === 'play' || (game.state === 'dying' && online())) && !game.menu && !input.usingGamepad) pause();
    };
    input.onDeviceChange = (pad) => { hud.setDevice(pad); hud.setWeapon(player.weapon.name, player.weapon.hint); };
    window.addEventListener('pagehide', () => { if (net.active) net.leave(); });
    for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => { audio.init(); audio.resume(); }, { passive: true });

    hud.setDevice(input.usingGamepad);
    settingsMgr.applySettings();
    hud.onCloseBuy = () => { if (game.state === 'play' && !input.usingGamepad) input.requestLock(); };
    hud.setWeapon(player.weapon.name, player.weapon.hint);
    screensMgr.showStart();
    requestAnimationFrame(tick);
  }

  return {
    perf,
    resetGame, begin, beginAtWave, jumpToWave, hostStart, startMatch,
    pause, resume, toMainMenu, toLobbyScreen, start,
  };
}
