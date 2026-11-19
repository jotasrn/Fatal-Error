import { LEVELS } from '../levels/index.js';
import { CONTROLS_HTML } from './hud.js';
import { PROG_ITEMS } from '../game/progression.js';
import { escHtml, sanitizeName } from '../core/security.js';
import { ONLINE_MODES, FFA_TIME } from '../net/lobby.js';

const esc = escHtml;

export function createScreensManager(ctx, deps) {
  const {
    hud, game, player, enemies, net, lobby, progression, audio,
    online, knownMap, setLevel, getMapKey, setMapKey,
    getMyName, setMyName, getBest, setBest,
    settingsMgr, lobbyMgr, getLoopMgr,
  } = deps;

  let screen = 'main';
  let lobbyList = null;
  let listBusy = false;
  const uiTab = { main: 'maps', pause: 'progression', mpause: 'board' };

  const mapName = (k) => (LEVELS.find((m) => m.key === k) || LEVELS[0]).name;
  function mapHTML(sel, canPick) {
    if (LEVELS.length < 2) return '';
    return `<div class="mapsel" id="mapsel">${LEVELS.map((m) => `<button type="button" class="mapbtn${m.key === sel ? ' on' : ''}" data-map="${m.key}" ${canPick ? '' : 'disabled'}><span class="mn">${m.name}</span><span class="mb">${m.blurb}</span></button>`).join('')}</div>`;
  }
  function wireMap(onPick) {
    const box = hud.el.panel.querySelector('#mapsel'); if (!box) return;
    box.addEventListener('click', (e) => { e.stopPropagation(); const b = e.target.closest('.mapbtn'); if (b && !b.disabled) onPick(b.dataset.map); });
  }
  function wireName(box) {
    const nb = box.querySelector('#setName'); if (!nb) return;
    nb.addEventListener('input', (e) => {
      const clean = sanitizeName(e.target.value, getMyName());
      setMyName(clean);
      localStorage.setItem('fatal_name', clean);
      player.name = clean;
      net.hostName = clean;
    });
  }

  function progressionHTML() {
    const cats = [
      ['weapons', '🔫 Armas Iniciais Permanentes', (c) => c === 'weapons'],
      ['grapple', '🪝 Melhorias do Gancho', (c) => c === 'grapple'],
      ['orelha', '🐕 Companheiro Orelha (Combate & Pelagem)', (c) => c === 'orelha' || c === 'orelha_skin'],
      ['skin', '🎨 Cores de Tinta das Armas', (c) => c === 'skin'],
    ];
    const entries = Object.entries(PROG_ITEMS);
    const cols = cats.map(([, title, matchCat]) => {
      const items = entries.filter(([, it]) => matchCat(it.cat));
      const cards = items.map(([id, it]) => {
        if (it.maxLv) {
          const lv = progression.levelOf(id);
          const maxed = lv >= it.maxLv;
          const cost = maxed ? 0 : it.costs[lv];
          const priceText = maxed ? 'MÁX' : `${cost} CR`;
          const btnLabel = maxed ? `Nível Máx (${lv}/${it.maxLv})` : `Melhorar Nv.${lv + 1} (${cost} CR)`;
          const dis = maxed || progression.credits < cost;
          return `<div class="bm-card" style="padding:8px 10px; margin-bottom:6px;">
            <div class="bm-c-top"><span class="bm-c-name">${esc(it.name)} (Nv.${lv}/${it.maxLv})</span><span class="bm-c-price">${esc(priceText)}</span></div>
            <div class="bm-c-desc">${esc(it.desc)}</div>
            <button type="button" class="bm-action prog-btn" data-prog="${esc(id)}" ${dis ? 'disabled' : ''}>${esc(btnLabel)}</button>
          </div>`;
        }
        const unlocked = progression.isUnlocked(id);
        const isSkin = it.cat === 'skin' || it.cat === 'orelha_skin';
        const equipped = (it.cat === 'skin' && progression.data.equipped.weaponSkin === id) || (it.cat === 'orelha_skin' && progression.data.equipped.orelhaSkin === id);
        const btnLabel = unlocked ? (isSkin ? (equipped ? 'Equipado' : 'Equipar') : 'Desbloqueado') : `Desbloquear (${it.cost} CR)`;
        const dis = (unlocked && (!isSkin || equipped)) || (!unlocked && progression.credits < it.cost);
        return `<div class="bm-card" style="padding:8px 10px; margin-bottom:6px;">
          <div class="bm-c-top"><span class="bm-c-name">${esc(it.name)}</span><span class="bm-c-price">${unlocked ? '✓' : it.cost + ' CR'}</span></div>
          <div class="bm-c-desc">${esc(it.desc)}</div>
          <button type="button" class="bm-action prog-btn" data-prog="${esc(id)}" ${dis ? 'disabled' : ''}>${esc(btnLabel)}</button>
        </div>`;
      }).join('');
      return `<div class="bm-col"><div class="bm-col-title">${title}</div>${cards}</div>`;
    }).join('');
    return `<div class="settings" id="progBox">
      <div class="settings-row" style="justify-content:space-between; margin-bottom:8px;">
        <span>Ganhe <b>Créditos (CR)</b> permanentes a cada onda, missão e partida (mesmo na derrota)!</span>
        <span class="chip chip-gold">Saldo Permanente: <b id="progCrVal">${progression.credits} CR</b></span>
      </div>
      <div class="bm-columns" style="max-height:310px; overflow-y:auto;">${cols}</div>
    </div>`;
  }

  function wireProgression() {
    const box = hud.el.panel.querySelector('#progBox'); if (!box) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('.prog-btn'); if (!b || b.disabled) return;
      e.stopPropagation();
      const res = progression.buyOrEquip(b.dataset.prog);
      if (res.ok) {
        audio.pickup();
        progression.applyToPlayer(player);
        for (const en of enemies.enemies) if (en.alive && en.T.isPet) progression.applyToOrelha(en);
        if (game.state === 'start') showStart(); else showPause();
      } else audio.empty();
    });
  }

  function tabsHTML(group, tabs) {
    const cur = tabs.some((t) => t[0] === uiTab[group]) ? uiTab[group] : tabs[0][0];
    return `<div class="tabs" data-group="${group}">${tabs.map(([k, label]) => `<button type="button" class="tab${k === cur ? ' on' : ''}" data-tab="${k}">${label}</button>`).join('')}</div>
      <div class="tabpanes">${tabs.map(([k, , html]) => `<div class="pane${k === cur ? ' on' : ''}" data-pane="${k}">${html}</div>`).join('')}</div>`;
  }

  function wireTabs() {
    for (const t of hud.el.panel.querySelectorAll('.tabs')) {
      t.addEventListener('click', (e) => {
        const b = e.target.closest('.tab'); if (!b) return;
        e.stopPropagation();
        uiTab[t.dataset.group] = b.dataset.tab;
        for (const x of t.querySelectorAll('.tab')) x.classList.toggle('on', x === b);
        for (const x of t.nextElementSibling.children) x.classList.toggle('on', x.dataset.pane === b.dataset.tab);
      });
    }
  }

  function mainHTML() {
    const mk = getMapKey();
    const best = getBest();
    return `<div class="m-head"><div class="logo"><span class="l1">FATAL</span><span class="l2">ERROR</span></div><div class="tagline">Combate tático, caos urbano e sobrevivência extrema</div></div>
      ${settingsMgr.updateBannerHTML()}
      <div class="m-play">
        <button type="button" class="btn btn-yellow btn-xl" id="soloBtn"><span class="bt">▶ Jogar Solo</span><span class="bs">Ondas + Missões pela cidade</span></button>
        <button type="button" class="btn btn-blue btn-xl" id="onlineBtn"><span class="bt">Jogar Online</span><span class="bs">Mata-Mata · Bandeira · Mirante · Coop</span></button>
      </div>
      <div class="m-info"><span class="chip">Mapa: <b>${esc(mapName(mk))}</b></span><span class="chip chip-gold">Créditos: <b>${progression.credits} CR</b></span><span class="chip">Versão <b>v${esc(settingsMgr.getAppVersion())}</b></span>${best ? `<span class="chip chip-gold">Recorde: <b>${best}</b></span>` : ''}</div>
      ${tabsHTML('main', [['maps', 'Mapas', mapHTML(mk, true)], ['progression', 'Progressão (' + progression.credits + ' CR)', progressionHTML()], ['controls', 'Controles', CONTROLS_HTML], ['settings', 'Ajustes', settingsMgr.settingsHTML()]])}`;
  }

  function lobbyListHTML() {
    if (listBusy) return '<div class="hint">Buscando salas…</div>';
    if (!lobbyList) return '<div class="hint">Clique em Atualizar para buscar salas abertas</div>';
    if (!lobbyList.length) return '<div class="hint">Nenhuma sala pública encontrada · Crie uma ou use Partida Rápida</div>';
    return lobbyList.map((l) => `<div class="lobbyrow"><span class="code">${esc(l.code)}</span><span>${esc(l.hostName || 'Alguém')}${l.isLan ? ' <b style="color:#0077aa;">[Interna]</b>' : ' - Sala'}</span><span>${l.players}/${l.max}${l.inMatch ? ' · Em partida' : ''}</span>${l.full ? '<span class="status">Lotada</span>' : `<button type="button" data-join="${esc(l.code)}" data-lan="${l.isLan ? '1' : '0'}">Entrar</button>`}</div>`).join('');
  }

  async function refreshLobbies() {
    if (listBusy || net.active) return;
    listBusy = true;
    const box = hud.el.panel.querySelector('#lobbyRows'); if (box) box.innerHTML = lobbyListHTML();
    let err = null;
    try { lobbyList = await net.listLobbies({ name: getMyName() }); } catch (e) { lobbyList = []; err = e; }
    listBusy = false;
    const rows = hud.el.panel.querySelector('#lobbyRows');
    if (rows) rows.innerHTML = err ? `<div class="hint">Falha ao buscar: ${esc(lobbyMgr.friendlyError(err))}</div>` : lobbyListHTML();
  }

  function onlineHTML() {
    return `<h1>Jogar Online</h1><h2>Mata-Mata, Pega-Bandeira entre as Asas, Rei do Mirante e Cooperativo · Até 10 jogadores</h2>
      ${settingsMgr.updateBannerHTML()}
      <div class="online" id="online">
        <div class="row"><span>Seu Apelido</span><input type="text" class="namebox" id="setName" maxlength="14" placeholder="Seu apelido" value="${esc(getMyName())}"></div>
        <div class="row"><button type="button" class="big" id="quickBtn">Partida Rápida</button><span class="hint">Entra em qualquer sala aberta ou cria uma nova</span></div>
        <div class="row split"><span>ou</span></div>
        <div class="row"><button type="button" id="createBtn">Criar Sala</button><div class="radio" style="display:flex; flex-wrap:wrap; gap:10px;"><label><input type="radio" name="vis" value="public" ${lobby.mode === 'public' || (!lobby.mode && lobby.isPublic) ? 'checked' : ''}> 🌐 Pública (Global)</label><label><input type="radio" name="vis" value="private" ${lobby.mode === 'private' || (!lobby.mode && !lobby.isPublic && !lobby.isLan) ? 'checked' : ''}> 🔒 Privada (Global)</label><label style="color:#0077aa; font-weight:bold;"><input type="radio" name="vis" value="lan" ${lobby.mode === 'lan' || lobby.isLan ? 'checked' : ''}> 🏢 Sala Interna ( Mesma Rede)</label></div></div>
        <div class="row"><span>Tem o código da sala?</span><input type="text" id="codeBox" placeholder="CÓDIGO OU IP" maxlength="22" autocomplete="off"><label style="font-size:16px; margin:0 4px;"><input type="checkbox" id="joinLanCheck"> Forçar </label><button type="button" id="joinBtn">Entrar</button></div>
        <div class="lobbylist" id="lobbylist"><div class="row"><span>Salas Abertas</span><button type="button" class="alt" id="refreshBtn">Atualizar</button></div><div class="rows" id="lobbyRows">${lobbyListHTML()}</div></div>
        <div class="status" id="status">${esc(lobby.status || '')}</div>
        ${lobby.rejoinCode ? `<div class="row"><button type="button" class="big" id="rejoinBtn">Reconectar a ${esc(lobby.rejoinCode)}</button></div>` : ''}
        <div class="row"><button type="button" class="alt" id="backBtn">Voltar</button></div>
      </div>`;
  }

  function lobbyHTML() {
    const rows = lobbyMgr.lobbyRows(); const host = net.isHost; const n = rows.length;
    const shownCode = esc(String(net.isHost ? (net.aliasCode || net.code) : (lobby.shown || net.code) || '').replace(/-\d+$/, ''));
    const isGdf = !!(net.isInternal || lobby.isLan);
    const directIp = isGdf && net.lanAddress ? `<span style="margin-left:10px; font-size:16px; color:#1f2937;">IP Direto: <b style="user-select:text;">${esc(net.lanAddress)}</b></span>` : '';
    const curMode = lobby.gameMode || 'ffa';
    const modeSel = `<div class="row"><span>Modo de Jogo</span><select id="lobbyModeSel" ${host ? '' : 'disabled'} style="font-size:16px; padding:4px 10px;">
      ${Object.entries(ONLINE_MODES).map(([k, lbl]) => `<option value="${k}" ${curMode === k ? 'selected' : ''}>${esc(lbl)}</option>`).join('')}
    </select></div>`;
    const hintText = isGdf
      ? 'Sala : seus colegas podem clicar em "Salas Abertas" ou digitar o Código / IP Direto acima'
      : (lobby.isPublic ? 'Sala pública: qualquer um na rede ou com o código pode entrar' : 'Sala privada: passe este código para seus colegas entrarem');
    return `<h1>Sala de Espera</h1><h2>${esc(ONLINE_MODES[curMode] || 'Mata-Mata Livre')} · ${Math.round(FFA_TIME / 60)} min + Bots · ${n}/${net.maxPlayers} jogadores</h2>
      ${settingsMgr.updateBannerHTML()}
      <div class="online" id="online">
        <div class="row"><span>Código</span><span class="code" style="user-select:text;">${shownCode}</span> ${isGdf ? '<b style="color:#0077aa; font-size:20px; margin-left:8px;">[Rede Interna]</b>' : ''}${directIp}</div>
        ${modeSel}
        ${mapHTML(lobby.map || getMapKey(), host)}
        <div class="hint">${hintText}</div>
        <div class="plist">${rows.map((p) => `<div class="${p.id === lobby.hostId ? 'host' : ''}${p.id === net.id ? ' me' : ''}"><span>${esc(p.name)}</span><span>${p.id === net.id ? ' (Você)' : ''}</span></div>`).join('')}</div>
        <div class="row"><button type="button" class="big" id="startBtn">Iniciar Partida</button><button type="button" class="alt" id="leaveBtn">Sair da Sala</button></div>
        <div class="status" id="status">${esc(lobby.status || '')}</div><div class="hint">Qualquer jogador pode iniciar · ${n < 2 ? 'Outros podem entrar durante a partida' : n + ' jogadores prontos'}</div>
      </div>`;
  }

  function lockButtons(box) { for (const b of box.querySelectorAll('button')) if (b.id !== 'backBtn') b.disabled = true; }
  function unlockButtons() { const box = hud.el.panel.querySelector('#online'); if (box) for (const b of box.querySelectorAll('button')) b.disabled = false; }

  function wireOnline() {
    const box = hud.el.panel.querySelector('#online'); if (!box) return;
    box.addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('keydown', (e) => e.stopPropagation());
    const q = (id) => box.querySelector('#' + id);
    wireName(box);
    if (q('quickBtn')) q('quickBtn').addEventListener('click', () => { lockButtons(box); lobbyMgr.quickPlay(); });
    if (q('createBtn')) q('createBtn').addEventListener('click', () => {
      lockButtons(box);
      const sel = box.querySelector('input[name=vis]:checked');
      lobbyMgr.createLobby(sel ? sel.value : 'public');
    });
    if (q('joinBtn')) {
      q('joinBtn').addEventListener('click', () => {
        const c = q('codeBox').value.trim().toUpperCase();
        if (!c) { lobbyMgr.setStatus('Digite o código da sala'); return; }
        lockButtons(box);
        const forceLan = q('joinLanCheck') && q('joinLanCheck').checked;
        lobbyMgr.joinLobby(c, forceLan);
      });
      q('codeBox').addEventListener('keydown', (e) => { if (e.key === 'Enter') q('joinBtn').click(); });
    }
    if (q('rejoinBtn')) q('rejoinBtn').addEventListener('click', () => { const c = lobby.rejoinCode; lobby.rejoinCode = null; lockButtons(box); lobbyMgr.joinLobby(c); });
    if (q('backBtn')) q('backBtn').addEventListener('click', () => { lobby.status = ''; lobby.rejoinCode = null; screen = 'main'; showStart(); });
    if (q('refreshBtn')) { q('refreshBtn').addEventListener('click', () => refreshLobbies()); if (!lobbyList && !listBusy) refreshLobbies(); }
    if (q('lobbyRows')) q('lobbyRows').addEventListener('click', (e) => { const b = e.target.closest('button[data-join]'); if (b) { lockButtons(box); lobbyMgr.joinLobby(b.dataset.join, b.dataset.lan === '1'); } });
    if (q('lobbyModeSel')) {
      q('lobbyModeSel').addEventListener('change', (e) => {
        if (net.isHost && ONLINE_MODES[e.target.value]) { lobby.gameMode = e.target.value; lobbyMgr.broadcastLobby(); }
      });
    }
    wireMap((k) => {
      if (net.isHost) {
        lobby.map = knownMap(k); setMapKey(lobby.map);
        localStorage.setItem('fatal_map', lobby.map);
        setLevel(lobby.map, true); player.reset(ctx.level.playerStart);
        lobbyMgr.broadcastLobby();
      }
    });
    if (q('startBtn')) q('startBtn').addEventListener('click', () => { if (net.isHost) getLoopMgr().hostStart(); else { net.send('startreq', {}); lobbyMgr.setStatus('Solicitando início ao anfitrião…'); } });
    if (q('leaveBtn')) q('leaveBtn').addEventListener('click', () => { lobby.rejoinCode = null; lobbyMgr.leaveOnline(''); });
  }

  function wireMenuBtn() {
    const b = hud.el.panel.querySelector('#menuBtn');
    if (b) b.addEventListener('click', (e) => { e.stopPropagation(); getLoopMgr().toMainMenu(); });
  }

  function showStart() {
    hud.setGameplayVisible(false);
    if (game.state === 'lobby') screen = 'lobby';
    const html = screen === 'lobby' ? lobbyHTML() : screen === 'online' ? onlineHTML() : mainHTML();
    hud.showScreen(html);
    settingsMgr.wireUpdateBanner();
    const p = hud.el.panel;
    if (screen === 'main') {
      settingsMgr.wireSettings();
      wireProgression();
      wireMap((k) => { const mk = knownMap(k); setMapKey(mk); lobby.map = mk; localStorage.setItem('fatal_map', mk); setLevel(mk, false); player.reset(ctx.level.playerStart); showStart(); });
      p.querySelector('#soloBtn').addEventListener('click', (e) => { e.stopPropagation(); getLoopMgr().begin(); });
      p.querySelector('#onlineBtn').addEventListener('click', (e) => { e.stopPropagation(); screen = 'online'; showStart(); });
      wireTabs();
    } else wireOnline();
  }

  function showPause() {
    const resumeHint = `<div class="foot-hint"><kbd>${hud.key('pause')}</kbd> ou <kbd>${hud.key('confirm')}</kbd> para continuar</div>`;
    if (online()) {
      const pauseCode = esc(String(net.aliasCode || net.code || '').replace(/-\d+$/, ''));
      hud.showScreen(`<div class="p-head"><h1>Menu</h1><div class="m-info"><span class="chip">${esc(ONLINE_MODES[game.onlineMode] || 'Mata-mata livre')}</span><span class="chip">Sala <b>${pauseCode}</b></span></div></div>
        <div class="m-play" id="online"><button type="button" class="btn btn-yellow btn-lg" data-act="go">▶ Continuar</button><button type="button" class="btn btn-red btn-lg" id="leaveBtn">Sair da partida</button></div>
        ${tabsHTML('mpause', [['board', 'Placar', lobbyMgr.scoreRowsHTML()], ['progression', 'Progressão (' + progression.credits + ' CR)', progressionHTML()], ['controls', 'Controles', CONTROLS_HTML], ['settings', 'Ajustes', settingsMgr.settingsHTML()]])}${resumeHint}`);
      settingsMgr.wireSettings(); wireProgression(); wireOnline(); wireTabs(); return;
    }
    hud.showScreen(`<div class="p-head"><h1>Pausado</h1><div class="m-info"><span class="chip">Onda <b>${game.wave}</b></span><span class="chip">Pontos <b>${game.score}</b></span><span class="chip chip-gold">Créditos <b>${progression.credits} CR</b></span></div></div>
      <div class="m-play"><button type="button" class="btn btn-yellow btn-lg" data-act="go">▶ Continuar</button><button type="button" class="btn btn-white btn-lg" id="menuBtn">Menu principal</button></div>
      ${tabsHTML('pause', [['progression', 'Progressão (' + progression.credits + ' CR)', progressionHTML()], ['controls', 'Controles', CONTROLS_HTML], ['settings', 'Ajustes', settingsMgr.settingsHTML()]])}${resumeHint}`);
    settingsMgr.wireSettings(); wireProgression(); wireMenuBtn(); wireTabs();
  }

  function showClickToPlay() {
    hud.showScreen(`<div class="p-head"><h1>Partida iniciada</h1><h2>${esc(ONLINE_MODES[game.onlineMode] || 'Mata-mata livre')} · ${Math.round(FFA_TIME / 60)} min · com bots</h2></div><div class="m-play"><button type="button" class="btn btn-yellow btn-xl" data-act="go"><span class="bt">Lutar!</span></button></div><div class="foot-hint"><kbd>${hud.key('confirm')}</kbd> para começar</div>`);
  }

  function showDead() {
    hud.setGameplayVisible(false);
    const best = getBest();
    const nb = game.score > best;
    const nextBest = nb ? game.score : best;
    if (nb) { setBest(nextBest); localStorage.setItem('fatal_best', String(nextBest)); }
    const earnedCr = 15 + Math.max(0, game.wave - 1) * 10 + Math.min(80, Math.floor((game.kills || 0) * 1.5));
    progression.addCredits(earnedCr);
    hud.showScreen(`<div class="p-head"><h1 class="t-red">Você foi eliminado!</h1></div>
      <div class="statgrid"><div><b>${game.wave}</b><span>ondas</span></div><div><b>${game.kills}</b><span>eliminações</span></div><div><b>${game.score}</b><span>pontos</span></div><div><b>+${earnedCr} CR</b><span>créditos ganhos</span></div></div>
      <div class="m-info">${nb ? '<span class="chip chip-gold">Novo recorde!</span>' : `<span class="chip">Recorde: <b>${nextBest}</b></span>`}<span class="chip chip-gold">Saldo Permanente: <b>${progression.credits} CR</b></span></div>
      <div class="m-play"><button type="button" class="btn btn-yellow btn-lg" data-act="go">↻ Jogar de novo</button><button type="button" class="btn btn-white btn-lg" id="menuBtn">Menu principal</button></div>
      <div class="foot-hint"><kbd>${hud.key('confirm')}</kbd> para recomeçar da onda 1</div>`);
    wireMenuBtn();
  }

  return {
    getScreen: () => screen,
    setScreen: (s) => { screen = s; },
    renderLobby: () => { if (game.state === 'lobby') showStart(); },
    unlockButtons,
    showStart,
    showPause,
    showClickToPlay,
    showDead,
  };
}
