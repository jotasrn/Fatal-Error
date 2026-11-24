import { escHtml, sanitizeText, clampNum } from '../core/security.js';

const esc = escHtml;

export function createSettingsManager(ctx, deps) {
  const { R, effects, input, hud, minimap, audio, game, getMusicWanted, setMusicWanted, getPerf, showStart } = deps;

  const settings = {
    sens: Number(localStorage.getItem('fatal_sens') || 100),
    invert: localStorage.getItem('fatal_invert') === '1',
    vol: Number(localStorage.getItem('fatal_vol') ?? 55),
    sfxVol: Number(localStorage.getItem('fatal_sfx_vol') ?? 100),
    musVol: Number(localStorage.getItem('fatal_mus_vol') ?? 100),
  };

  const hudPrefs = {
    gfxQuality: localStorage.getItem('fatal_gfx_quality') || 'medium',
    notebookMode: false,
    chColor: localStorage.getItem('fatal_ch_color') || '#d02030',
    chSize: Number(localStorage.getItem('fatal_ch_size') || '1'),
    chDot: localStorage.getItem('fatal_ch_dot') !== '0',
    scale: Number(localStorage.getItem('fatal_hud_scale') || '100'),
    opacity: Number(localStorage.getItem('fatal_hud_opacity') || '100'),
    killfeed: localStorage.getItem('fatal_hud_kf') !== '0',
    damageNums: localStorage.getItem('fatal_hud_dmg') !== '0',
  };

  R.setQuality(hudPrefs.gfxQuality);
  R.setNotebookMode(false);

  let appVersion = '1.7.1';
  let updStatus = { state: 'idle', version: null, percent: 0, message: null, waitingForMatch: false };

  function updateSettingsText() {
    const v = 'v' + appVersion;
    if (updStatus.state === 'checking') return `${v} · Verificando atualizações no GitHub…`;
    if (updStatus.state === 'downloading') return `${v} · Baixando v${updStatus.version || '?'} (${updStatus.percent || 0}%)…`;
    if (updStatus.state === 'ready') return `${v} · Nova versão v${updStatus.version || '?'} pronta para instalar!`;
    if (updStatus.state === 'unsupported') return `${v} · Modo desenvolvimento`;
    if (updStatus.state === 'error') return `${v} · ${updStatus.message || 'Sem conexão com GitHub Releases'}`;
    return `${v} · Atualização automática ativa`;
  }

  function updateBannerHTML() {
    if (typeof window === 'undefined' || !window.FE_UPDATE) return '';
    if (updStatus.state === 'downloading') {
      return `<div class="m-info" id="updBanner"><span class="chip">⬇️ Baixando atualização <b>v${esc(updStatus.version || '')}</b> (${clampNum(updStatus.percent, 0, 100, 0)}%)…</span></div>`;
    }
    if (updStatus.state === 'ready') {
      return `<div class="m-info" id="updBanner"><span class="chip chip-gold">✨ Nova versão <b>v${esc(updStatus.version || '')}</b> pronta!</span><button type="button" class="btn btn-yellow" id="installUpdBtn" style="padding:5px 14px; font-size:15px;">Atualizar e reiniciar agora</button></div>`;
    }
    return '';
  }

  function wireUpdateBanner() {
    const b = hud.el.panel && hud.el.panel.querySelector('#installUpdBtn');
    if (!b || !window.FE_UPDATE) return;
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      b.disabled = true;
      b.textContent = 'Reiniciando…';
      const res = await window.FE_UPDATE.install();
      if (!res || !res.ok) {
        b.disabled = false;
        b.textContent = 'Atualizar e reiniciar agora';
        if (res && res.motivo) hud.tip(sanitizeText(res.motivo, 80), 2.5);
      }
    });
  }

  if (typeof window !== 'undefined' && window.FE_UPDATE) {
    window.FE_UPDATE.getInfo().then((info) => {
      if (info && info.version) appVersion = sanitizeText(info.version, 24);
      const lbl = document.getElementById('updSettingsLabel');
      if (lbl) lbl.textContent = updateSettingsText();
    }).catch(() => {});
    window.FE_UPDATE.getStatus().then((st) => {
      if (st && typeof st === 'object') updStatus = st;
    }).catch(() => {});
    window.FE_UPDATE.onStatus((st) => {
      if (!st || typeof st !== 'object') return;
      const prevState = updStatus.state;
      updStatus = st;
      const lbl = document.getElementById('updSettingsLabel');
      if (lbl) lbl.textContent = updateSettingsText();
      const btn = document.getElementById('checkUpdBtn');
      if (btn) btn.textContent = updStatus.state === 'ready' ? 'Atualizar e reiniciar' : 'Verificar agora';
      if ((game.state === 'start' || game.state === 'lobby') && (prevState !== st.state || st.state === 'downloading')) {
        showStart();
      } else if (st.state === 'ready' && prevState !== 'ready' && (game.state === 'play' || game.state === 'dying')) {
        hud.tip(`Nova versão v${sanitizeText(st.version, 20)} baixada · Instala ao sair da partida`, 3.5);
      }
    });
  }

  function applyHudSettings() {
    if (R.quality !== hudPrefs.gfxQuality) R.setQuality(hudPrefs.gfxQuality);
    R.setNotebookMode(false);
    effects.maxParticles = hudPrefs.gfxQuality === 'high' ? 300 : hudPrefs.gfxQuality === 'low' ? 100 : 220;

    document.documentElement.style.setProperty('--ch-color', hudPrefs.chColor);
    document.documentElement.style.setProperty('--ch-scale', String(hudPrefs.chSize));

    const ch = document.getElementById('crosshair');
    if (ch) ch.style.transform = `scale(${hudPrefs.chSize})`;
    const dot = document.querySelector('.ch-dot');
    if (dot) dot.style.display = hudPrefs.chDot ? 'block' : 'none';

    const hudEl = document.getElementById('hud');
    if (hudEl) {
      hudEl.style.opacity = '';
      hudEl.style.setProperty('--hud-scale', (hudPrefs.scale / 100).toFixed(2));
      hudEl.style.setProperty('--hud-opacity', (hudPrefs.opacity / 100).toFixed(2));
    }
    const kf = document.querySelector('.killfeed');
    if (kf) kf.style.display = hudPrefs.killfeed ? 'block' : 'none';
    const dmg = document.querySelector('.dmg-ind');
    if (dmg) dmg.style.display = hudPrefs.damageNums ? 'block' : 'none';

    localStorage.setItem('fatal_gfx_quality', hudPrefs.gfxQuality);
    localStorage.setItem('fatal_notebook', '0');
    localStorage.setItem('fatal_ch_color', hudPrefs.chColor);
    localStorage.setItem('fatal_ch_size', String(hudPrefs.chSize));
    localStorage.setItem('fatal_ch_dot', hudPrefs.chDot ? '1' : '0');
    localStorage.setItem('fatal_hud_scale', String(hudPrefs.scale));
    localStorage.setItem('fatal_hud_opacity', String(hudPrefs.opacity));
    localStorage.setItem('fatal_hud_kf', hudPrefs.killfeed ? '1' : '0');
    localStorage.setItem('fatal_hud_dmg', hudPrefs.damageNums ? '1' : '0');
  }

  function applySettings() {
    input.mouseSens = 0.0022 * settings.sens / 100;
    input.padSensX = 3.4 * settings.sens / 100;
    input.padSensY = 2.6 * settings.sens / 100;
    input.invertY = settings.invert;
    audio.setVolume(settings.vol / 100);
    audio.setSfxVolume(settings.sfxVol / 100);
    audio.setMusicVolume(settings.musVol / 100);
    localStorage.setItem('fatal_sens', String(settings.sens));
    localStorage.setItem('fatal_invert', settings.invert ? '1' : '0');
    localStorage.setItem('fatal_vol', String(settings.vol));
    localStorage.setItem('fatal_sfx_vol', String(settings.sfxVol));
    localStorage.setItem('fatal_mus_vol', String(settings.musVol));
    applyHudSettings();
  }

  function settingsHTML() {
    const PRESET_COLORS = [
      { name: 'Vermelho Original', hex: '#d02030' },
      { name: 'Verde Neon', hex: '#00ff66' },
      { name: 'Ciano Elétrico', hex: '#00e5ff' },
      { name: 'Amarelo Ouro', hex: '#ffea00' },
      { name: 'Rosa Choque', hex: '#ff1493' },
      { name: 'Branco Puro', hex: '#ffffff' },
      { name: 'Preto Nanquim', hex: '#111111' },
    ];
    const colorSwatches = PRESET_COLORS.map((c) =>
      `<button type="button" class="ch-swatch${hudPrefs.chColor.toLowerCase() === c.hex.toLowerCase() ? ' active' : ''}" data-color="${c.hex}" title="${c.name}" aria-label="${c.name}" style="background:${c.hex}"></button>`
    ).join('');

    return `<div class="settings" id="settings">
      <div class="settings-section-title">Janela e Exibição</div>
      <div class="settings-grid">
        <div class="settings-row" style="gap:8px;">
          <button type="button" class="btn btn-white" id="btnToggleFullscreen" style="flex:1; font-size:14px; padding:6px 12px; cursor:pointer;">Alternar Tela Cheia (F11)</button>
          <button type="button" class="btn btn-white" id="btnMinimizeGame" style="flex:1; font-size:14px; padding:6px 12px; cursor:pointer;">Minimizar Jogo (F9 / Ctrl+M)</button>
        </div>
      </div>

      <div class="settings-section-title">Gráficos</div>
      <div class="settings-grid">
        <label class="settings-row">Qualidade Gráfica
          <select id="setGfxQ">
            <option value="high" ${hudPrefs.gfxQuality === 'high' ? 'selected' : ''}>Alta · Ultra Nítido HD</option>
            <option value="medium" ${hudPrefs.gfxQuality === 'medium' ? 'selected' : ''}>Equilibrada · Nativo HD</option>
            <option value="auto" ${hudPrefs.gfxQuality === 'auto' ? 'selected' : ''}>Automática · FPS Dinâmico</option>
            <option value="low" ${hudPrefs.gfxQuality === 'low' ? 'selected' : ''}>Desempenho · FPS Máximo</option>
          </select>
        </label>
      </div>

      <div class="settings-section-title">Controles e som</div>
      <div class="settings-grid">
        <label class="settings-row">Sensibilidade do Mouse <input type="range" id="setSens" min="25" max="250" step="5" value="${settings.sens}"><b id="setSensV">${settings.sens}%</b></label>
        <label class="settings-row">Volume Geral <input type="range" id="setVol" min="0" max="100" step="5" value="${settings.vol}"><b id="setVolV">${settings.vol}%</b></label>
        <label class="settings-row">Efeitos Sonoros (SFX) <input type="range" id="setSfxVol" min="0" max="100" step="5" value="${settings.sfxVol}"><b id="setSfxVolV">${settings.sfxVol}%</b></label>
        <label class="settings-row">Volume da Música <input type="range" id="setMusVol" min="0" max="100" step="5" value="${settings.musVol}"><b id="setMusVolV">${settings.musVol}%</b></label>
        <label class="settings-row"><input type="checkbox" id="setInv" ${settings.invert ? 'checked' : ''}> Inverter Eixo Y</label>
        <label class="settings-row"><input type="checkbox" id="setFps" ${localStorage.getItem('fatal_fps') === '1' ? 'checked' : ''}> Mostrar FPS</label>
        <label class="settings-row"><input type="checkbox" id="setMap" ${minimap && minimap.enabled ? 'checked' : ''}> Minimapa</label>
        <label class="settings-row"><input type="checkbox" id="setMus" ${getMusicWanted() ? 'checked' : ''}> Música de Fundo</label>
      </div>

      <div class="settings-section-title">Mira</div>
      <div class="settings-row ch-row">
        <span>Cor da Mira:</span>
        <div class="ch-palette">${colorSwatches}</div>
        <input type="color" id="chColorPicker" value="${hudPrefs.chColor}" title="Cor Personalizada">
      </div>
      <div class="settings-grid">
        <label class="settings-row">Tamanho da Mira
          <select id="setChSize">
            <option value="0.75" ${hudPrefs.chSize === 0.75 ? 'selected' : ''}>Pequena</option>
            <option value="1" ${hudPrefs.chSize === 1 ? 'selected' : ''}>Média (Padrão)</option>
            <option value="1.35" ${hudPrefs.chSize === 1.35 ? 'selected' : ''}>Grande</option>
          </select>
        </label>
        <label class="settings-row"><input type="checkbox" id="setChDot" ${hudPrefs.chDot ? 'checked' : ''}> Ponto Central da Mira</label>
      </div>

      <div class="settings-section-title">Interface</div>
      <div class="settings-grid">
        <label class="settings-row">Escala da Interface
          <input type="range" id="setHudScale" min="75" max="125" step="5" value="${hudPrefs.scale}">
          <b id="setHudScaleV">${hudPrefs.scale}%</b>
        </label>
        <label class="settings-row">Opacidade da Interface
          <input type="range" id="setHudOpacity" min="50" max="100" step="5" value="${hudPrefs.opacity}">
          <b id="setHudOpacityV">${hudPrefs.opacity}%</b>
        </label>
        <label class="settings-row"><input type="checkbox" id="setHudKf" ${hudPrefs.killfeed ? 'checked' : ''}> Exibir Feed de Eliminações</label>
        <label class="settings-row"><input type="checkbox" id="setHudDmg" ${hudPrefs.damageNums ? 'checked' : ''}> Exibir Marcadores de Dano</label>
      </div>
      ${typeof window !== 'undefined' && window.FE_UPDATE ? `<div class="settings-section-title">Atualizações</div>
      <div class="settings-row">
        <span id="updSettingsLabel">${esc(updateSettingsText())}</span>
        <button type="button" class="btn btn-white" id="checkUpdBtn" style="padding:5px 14px; font-size:14px;">${updStatus.state === 'ready' ? 'Atualizar e reiniciar' : 'Verificar agora'}</button>
      </div>` : ''}
    </div>`;
  }

  function wireSettings() {
    const box = hud.el.panel.querySelector('#settings'); if (!box) return;
    box.addEventListener('click', (e) => e.stopPropagation());
    box.addEventListener('keydown', (e) => e.stopPropagation());

    const btnFs = box.querySelector('#btnToggleFullscreen');
    if (btnFs) {
      btnFs.addEventListener('click', () => {
        if (window.FE_WIN?.toggleFullScreen) window.FE_WIN.toggleFullScreen();
        else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      });
    }
    const btnMin = box.querySelector('#btnMinimizeGame');
    if (btnMin) btnMin.addEventListener('click', () => { if (window.FE_WIN?.minimize) window.FE_WIN.minimize(); });

    const sens = box.querySelector('#setSens'), out = box.querySelector('#setSensV');
    sens.addEventListener('input', () => { settings.sens = Number(sens.value); out.textContent = settings.sens + '%'; applySettings(); });
    const vol = box.querySelector('#setVol'), volV = box.querySelector('#setVolV');
    if (vol) vol.addEventListener('input', () => { settings.vol = Number(vol.value); if (volV) volV.textContent = settings.vol + '%'; applySettings(); });
    const sfxVol = box.querySelector('#setSfxVol'), sfxVolV = box.querySelector('#setSfxVolV');
    if (sfxVol) sfxVol.addEventListener('input', () => { settings.sfxVol = Number(sfxVol.value); if (sfxVolV) sfxVolV.textContent = settings.sfxVol + '%'; applySettings(); });
    const musVol = box.querySelector('#setMusVol'), musVolV = box.querySelector('#setMusVolV');
    if (musVol) musVol.addEventListener('input', () => { settings.musVol = Number(musVol.value); if (musVolV) musVolV.textContent = settings.musVol + '%'; applySettings(); });
    box.querySelector('#setInv').addEventListener('change', (e) => { settings.invert = e.target.checked; applySettings(); });
    box.querySelector('#setFps').addEventListener('change', (e) => {
      const perf = getPerf();
      perf.show = e.target.checked;
      try { localStorage.setItem('fatal_fps', perf.show ? '1' : '0'); } catch (err) { /* ignore */ }
    });
    box.querySelector('#setMap').addEventListener('change', (e) => { if (minimap) minimap.setEnabled(e.target.checked); });
    box.querySelector('#setMus').addEventListener('change', (e) => {
      const want = e.target.checked;
      setMusicWanted(want);
      localStorage.setItem('fatal_music', want ? '1' : '0');
      audio.musicOn(want);
    });

    const gfxQ = box.querySelector('#setGfxQ');
    if (gfxQ) gfxQ.addEventListener('change', (e) => { hudPrefs.gfxQuality = e.target.value; applyHudSettings(); });

    box.querySelectorAll('.ch-swatch').forEach((sw) => {
      sw.addEventListener('click', (e) => {
        e.stopPropagation();
        box.querySelectorAll('.ch-swatch').forEach((s) => s.classList.remove('active'));
        sw.classList.add('active');
        hudPrefs.chColor = sw.dataset.color;
        const cp = box.querySelector('#chColorPicker');
        if (cp) cp.value = hudPrefs.chColor;
        applyHudSettings();
      });
    });

    const cp = box.querySelector('#chColorPicker');
    if (cp) cp.addEventListener('input', (e) => {
      hudPrefs.chColor = e.target.value;
      box.querySelectorAll('.ch-swatch').forEach((s) => s.classList.toggle('active', s.dataset.color.toLowerCase() === hudPrefs.chColor.toLowerCase()));
      applyHudSettings();
    });

    const chs = box.querySelector('#setChSize');
    if (chs) chs.addEventListener('change', (e) => { hudPrefs.chSize = Number(e.target.value); applyHudSettings(); });
    const chd = box.querySelector('#setChDot');
    if (chd) chd.addEventListener('change', (e) => { hudPrefs.chDot = e.target.checked; applyHudSettings(); });

    const hs = box.querySelector('#setHudScale'), hsV = box.querySelector('#setHudScaleV');
    if (hs) hs.addEventListener('input', () => { hudPrefs.scale = Number(hs.value); if (hsV) hsV.textContent = hudPrefs.scale + '%'; applyHudSettings(); });

    const ho = box.querySelector('#setHudOpacity'), hoV = box.querySelector('#setHudOpacityV');
    if (ho) ho.addEventListener('input', () => { hudPrefs.opacity = Number(ho.value); if (hoV) hoV.textContent = hudPrefs.opacity + '%'; applyHudSettings(); });

    const hkf = box.querySelector('#setHudKf');
    if (hkf) hkf.addEventListener('change', (e) => { hudPrefs.killfeed = e.target.checked; applyHudSettings(); });
    const hdmg = box.querySelector('#setHudDmg');
    if (hdmg) hdmg.addEventListener('change', (e) => { hudPrefs.damageNums = e.target.checked; applyHudSettings(); });

    const chkUpd = box.querySelector('#checkUpdBtn');
    if (chkUpd && window.FE_UPDATE) {
      chkUpd.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (updStatus.state === 'ready') { await window.FE_UPDATE.install(); return; }
        chkUpd.disabled = true;
        await window.FE_UPDATE.check();
        chkUpd.disabled = false;
        const lbl = box.querySelector('#updSettingsLabel');
        if (lbl) lbl.textContent = updateSettingsText();
      });
    }
  }

  return {
    applySettings,
    applyHudSettings,
    settingsHTML,
    wireSettings,
    updateBannerHTML,
    wireUpdateBanner,
    getAppVersion: () => appVersion,
  };
}
