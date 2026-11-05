// DOM heads-up display, "cartoon arcade" style: chunky white cards with a dark outline and a hard
// drop shadow, so every readout stays legible over the bright cel-shaded world.
export class HUD {
  constructor(root) {
    this.root = root;
    root.innerHTML = `
      <div class="scope" id="scope"><div class="mask"></div><div class="ring"></div><div class="cx"></div><div class="cy"></div><div class="dot"></div></div>
      <div class="focus-meter" id="focusmeter"><div class="fm-label">Katana</div><div class="fm-tube"><div class="fm-fill" id="fmfill"></div><i class="fm-f1"></i><i class="fm-f2"></i><i class="fm-f3"></i></div><div class="fm-ready" id="fmready">Foco Pronto</div></div>
      <div class="focus-mark" id="focusmark"><i></i><i></i><i></i><i></i></div>
      <div class="crosshair" id="crosshair"><i class="ch-t"></i><i class="ch-b"></i><i class="ch-l"></i><i class="ch-r"></i><i class="ch-dot"></i></div>
      <div class="grapple-ret" id="gret"></div><div class="gstam" id="gstam" hidden><i id="gstamfill"></i></div>
      <div class="hitmarker" id="hitmarker"><i></i><i></i></div>
      <div class="dmg-ind" id="dmg"></div>
      <div class="hud-tl">
        <div class="card stat-card"><div class="stat score"><span class="lbl">Pontos</span><b id="score">0</b></div><div class="stat money"><span class="lbl">Dinheiro</span><b id="money">$300</b></div></div>
        <div class="money-flash" id="mflash"></div><div class="combo" id="combo"></div>
        <div class="shop-hint" id="shopHintBtn"><kbd>B</kbd> Loja</div>
      </div>
      <div class="hud-tr">
        <div class="card wave-card"><div class="wave"><span class="lbl">Onda</span><b id="wave">1</b></div><div class="left"><b id="left">0</b> inimigos</div></div>
        <div class="modifier" id="modifier"></div><div class="timer" id="timer"></div><div class="pvpscore" id="pvpscore" hidden></div>
      </div><div class="board" id="board" hidden></div>
      <div class="bossbar" id="bossbar"><div class="bossname" id="bossname"></div><div class="bar big"><div class="fill red" id="bossfill"></div></div></div>
      <div class="hud-bl">
        <div class="card vitals">
          <div class="health"><span class="ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 2.9 4.5 6.6 4.5c2.2 0 3.6 1.2 5.4 3.1 1.8-1.9 3.2-3.1 5.4-3.1 3.7 0 5.7 3.9 4.2 7.3C19.5 16.4 12 21 12 21z"/></svg></span><div class="bar"><div class="fill" id="hpfill"></div></div><span class="num" id="hpnum">100</span></div>
          <div class="armor"><span class="ico"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l8 3v6.2c0 5-3.4 9.3-8 10.8-4.6-1.5-8-5.8-8-10.8V5l8-3z"/></svg></span><div class="bar"><div class="fill armor" id="armorfill"></div></div><span class="num" id="armornum">0</span></div>
          <div class="nades-row"><span class="lbl">Granadas</span><span class="nades" id="nades" title="Granadas"></span></div>
        </div>
      </div>
      <div class="hud-br">
        <div class="slots" id="slots"></div>
        <div class="card weapon-card">
          <div class="weapon" id="weapon">Rifle</div>
          <div class="ammo"><b id="mag">30</b><span id="reserve">/120</span></div>
          <div class="reloading" id="reloading"></div><div class="tally" id="tally"></div>
        </div>
        <div class="hint" id="hint"></div>
      </div>
      <div class="tip" id="tip"></div>
      <div class="message"><div class="msg-main" id="msg"></div><div class="msg-sub" id="msgsub"></div></div>
      <div class="killfeed" id="killfeed"></div>
      <div class="screen" id="screen"><div class="panel" id="panel"></div></div>
      <div class="buymenu" id="buymenu" hidden>
        <div class="bm-box">
          <div class="bm-header">
            <div class="bm-title">Loja de Armas</div>
            <div class="bm-wallet">Saldo: <b id="bm-wallet-amt">$300</b></div>
          </div>
          <div class="bm-sub">Compre armas e blindagens com o dinheiro acumulado de seus abates</div>
          <div class="bm-columns">
            <div class="bm-col">
              <div class="bm-col-title">Armas de Fogo</div>
              <div class="bm-card" data-buy="shotgun">
                <div class="bm-c-top"><span class="bm-c-name">Escopeta (Slot 2)</span><span class="bm-c-price">$600</span></div>
                <div class="bm-c-desc">10 projéteis de chumbo · Devastadora a curta distância</div>
                <button type="button" class="bm-action">Comprar</button>
              </div>
              <div class="bm-card" data-buy="smg">
                <div class="bm-c-top"><span class="bm-c-name">Submetralhadora SMG (Slot 3)</span><span class="bm-c-price">$750</span></div>
                <div class="bm-c-desc">Cadência insana de 18 tiros/s · 45 balas · Rápida em corrida</div>
                <button type="button" class="bm-action">Comprar</button>
              </div>
              <div class="bm-card" data-buy="rifle">
                <div class="bm-c-top"><span class="bm-c-name">Rifle de Assalto (Slot 4)</span><span class="bm-c-price">$900</span></div>
                <div class="bm-c-desc">Disparo totalmente automático · 35 balas · Mira ágil</div>
                <button type="button" class="bm-action">Comprar</button>
              </div>
              <div class="bm-card" data-buy="sniper">
                <div class="bm-c-top"><span class="bm-c-name">Sniper (Slot 5)</span><span class="bm-c-price">$1200</span></div>
                <div class="bm-c-desc">Mira telescópica · Um tiro, uma eliminação garantida</div>
                <button type="button" class="bm-action">Comprar</button>
              </div>
              <div class="bm-card" data-buy="laser">
                <div class="bm-c-top"><span class="bm-c-name">Fuzil de Plasma Laser (Slot 6)</span><span class="bm-c-price">$1500</span></div>
                <div class="bm-c-desc">Feixe contínuo de energia de 50 cargas · Precisão laser cirúrgica</div>
                <button type="button" class="bm-action">Comprar</button>
              </div>
              <div class="bm-card" data-buy="bazooka">
                <div class="bm-c-top"><span class="bm-c-name">Bazuca (Slot 7)</span><span class="bm-c-price">$1800</span></div>
                <div class="bm-c-desc">Foguetes de alto impacto · Explosão em área e Rocket Jump</div>
                <button type="button" class="bm-action">Comprar</button>
              </div>
            </div>
            <div class="bm-col">
              <div class="bm-col-title">Blindagem & Suprimentos</div>
              <div class="bm-card" data-buy="armor_light">
                <div class="bm-c-top"><span class="bm-c-name">Colete Leve (+50)</span><span class="bm-c-price">$300</span></div>
                <div class="bm-c-desc">Absorve 70% do dano sofrido de tiros e golpes</div>
                <button type="button" class="bm-action">Comprar</button>
              </div>
              <div class="bm-card" data-buy="armor_heavy">
                <div class="bm-c-top"><span class="bm-c-name">Colete Reforçado (100)</span><span class="bm-c-price">$600</span></div>
                <div class="bm-c-desc">Blindagem máxima 100 para suportar explosões e cercos</div>
                <button type="button" class="bm-action">Comprar</button>
              </div>
              <div class="bm-card" data-buy="ammo">
                <div class="bm-c-top"><span class="bm-c-name">Recarga Total de Munição</span><span class="bm-c-price">$150</span></div>
                <div class="bm-c-desc">Enche 100% da munição reserva de todas as suas armas</div>
                <button type="button" class="bm-action">Comprar</button>
              </div>
              <div class="bm-card" data-buy="grenades">
                <div class="bm-c-top"><span class="bm-c-name">+2 Granadas de Tinta</span><span class="bm-c-price">$200</span></div>
                <div class="bm-c-desc">Explosivo tático com grande onda de choque (máx. 5)</div>
                <button type="button" class="bm-action">Comprar</button>
              </div>
            </div>
          </div>
          <div class="bm-foot">
            <span>Pressione <b>ESC</b> ou <b>B</b> para fechar a Loja</span>
            <button type="button" class="bm-close-btn" id="bmCloseBtn">Voltar ao Jogo [ESC / B]</button>
          </div>
        </div>
      </div>`;
    const q = (id) => root.querySelector('#' + id);
    this.el = { crosshair: q('crosshair'), gret: q('gret'), hitmarker: q('hitmarker'), dmg: q('dmg'), score: q('score'), money: q('money'), mflash: q('mflash'), armorfill: q('armorfill'), armornum: q('armornum'), buymenu: q('buymenu'), bmWallet: q('bm-wallet-amt'), bmClose: q('bmCloseBtn'), combo: q('combo'), wave: q('wave'), modifier: q('modifier'), left: q('left'), timer: q('timer'), hpfill: q('hpfill'), hpnum: q('hpnum'), mag: q('mag'), reserve: q('reserve'), reloading: q('reloading'), tally: q('tally'), weapon: q('weapon'), hint: q('hint'), slots: q('slots'), tip: q('tip'), msg: q('msg'), msgsub: q('msgsub'), killfeed: q('killfeed'), screen: q('screen'), panel: q('panel'), nades: q('nades'), scope: q('scope'), focusmark: q('focusmark'), focusmeter: q('focusmeter'), fmfill: q('fmfill'), bossbar: q('bossbar'), bossname: q('bossname'), bossfill: q('bossfill'), pvpscore: q('pvpscore'), board: q('board'), gstam: q('gstam'), gstamfill: q('gstamfill') };
    this._msgT = 0; this._scope = false; this._nades = -1; this._pad = false; this.onDevice = null; this._fmShow = false; this._fmFrac = -1; this._fmReady = false; this._lastTally = -1; this._lastSlots = ''; this._ads = false; this._mode = ''; this.onScreenClick = null; this._tipT = 0;
    // Only the dimmed backdrop (outside the panel) and explicit buttons act: clicking on text or on
    // empty space inside a menu used to start or resume the game by accident.
    this.el.screen.addEventListener('click', (e) => { if (e.target === this.el.screen && this.onScreenClick) this.onScreenClick('backdrop'); });
    // capture phase: a "go" button works even inside boxes that stop propagation themselves
    this.el.panel.addEventListener('click', (e) => { if (e.target.closest('[data-act="go"]') && this.onScreenClick) this.onScreenClick('button'); }, true);
    this.el.panel.addEventListener('click', (e) => e.stopPropagation());
    this.onBuy = null;
    this.el.buymenu.querySelectorAll('.bm-card').forEach((card) => {
      const btn = card.querySelector('.bm-action');
      const itemKey = card.dataset.buy;
      if (btn) btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (this.onBuy) this.onBuy(itemKey);
      });
    });
    this.onCloseBuy = null;
    this.el.bmClose.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.toggleBuyMenu(false);
      if (this.onCloseBuy) this.onCloseBuy();
    });
    this.el.buymenu.addEventListener('click', (ev) => {
      if (ev.target === this.el.buymenu) {
        this.toggleBuyMenu(false);
        if (this.onCloseBuy) this.onCloseBuy();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.code === 'Escape') {
        if (this.el.buymenu && !this.el.buymenu.hidden) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          this.toggleBuyMenu(false);
          if (this.onCloseBuy) this.onCloseBuy();
        }
      }
    }, true);
  }
  // katana charge gauge: fills with katana kills, catches fire when a focus slash is ready
  setFocusMeter(show, frac, ready, label = 'Katana') {
    const m = this.el.focusmeter;
    if (show !== this._fmShow) { this._fmShow = show; m.classList.toggle('on', show); }
    if (!show) return;
    if (label !== this._fmLabel) { this._fmLabel = label; m.querySelector('.fm-label').textContent = label; }
    const f = Math.max(0, Math.min(1, frac));
    if (Math.abs(f - (this._fmFrac ?? -1)) > 0.005) { this._fmFrac = f; this.el.fmfill.style.height = (f * 100).toFixed(1) + '%'; }
    if (ready !== this._fmReady) { this._fmReady = ready; m.classList.toggle('ready', ready); }
  }
  setGrenades(n) { if (n === this._nades) return; this._nades = n; let h = ''; for (let i = 0; i < n; i++) h += '<i></i>'; this.el.nades.innerHTML = h; }
  // control labels follow whatever you touched last
  setDevice(pad) { if (pad === this._pad) return; this._pad = pad; this.root.classList.toggle('pad', pad); if (this.onDevice) this.onDevice(pad); }
  key(action) { return (this._pad ? PAD_KEYS : KB_KEYS)[action] || action; }
  setScope(on) { if (on === this._scope) return; this._scope = on; this.el.scope.classList.toggle('on', on); }
  setFocusMark(x, y) {
    const m = this.el.focusmark;
    if (x == null) { m.classList.remove('on'); return; }
    m.classList.add('on'); m.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  }
  setSpread(px) {
    const v = Math.round(px * 4) / 4;
    if (v === this._lastSpread) return;
    this._lastSpread = v;
    this.el.crosshair.style.setProperty('--s', v.toFixed(1) + 'px');
  }
  setCrosshairMode(mode) { if (mode === this._mode) return; this._mode = mode; this._applyCross(); }
  setAds(on) { if (on === this._ads) return; this._ads = on; this._applyCross(); }
  _applyCross() { this.el.crosshair.className = 'crosshair ' + this._mode + (this._ads ? ' ads' : ''); }
  setGrappleStamina(f) { const show = f < 0.995; if (this.el.gstam.hidden === show) this.el.gstam.hidden = !show; if (show) { const w = Math.round(f * 100); if (w !== this._lastGStam) { this._lastGStam = w; this.el.gstamfill.style.width = w + '%'; this.el.gstam.classList.toggle('low', f < 0.2); } } }
  grappleTarget(state) { if (state === this._lastGState) return; this._lastGState = state; this.el.gret.className = 'grapple-ret' + (state === 1 ? ' on' : state === 2 ? ' on attached' : ''); }
  hitmarker(kill = false, crit = false) { const h = this.el.hitmarker; h.className = 'hitmarker' + (kill ? ' kill' : '') + (crit ? ' crit' : ''); void h.offsetWidth; h.classList.add('show'); }
  setAmmo(mag, reserve, magSize, reloading = false) {
    if (mag !== this._lastMag) { this._lastMag = mag; this.el.mag.textContent = mag; }
    if (reserve !== this._lastRes) { this._lastRes = reserve; this.el.reserve.textContent = '/' + reserve; }
    if (reloading !== this._lastRel) { this._lastRel = reloading; this.el.reloading.textContent = reloading ? ' Recarregando…' : ''; }
    if (mag !== this._lastTally) { this._lastTally = mag; let s = ''; for (let i = 0; i < Math.min(mag, 40); i++) s += '<i></i>'; this.el.tally.innerHTML = s; }
  }
  setKatana() {
    if (this._lastMag !== '∞') { this._lastMag = '∞'; this.el.mag.textContent = '∞'; }
    if (this._lastRes !== '') { this._lastRes = ''; this.el.reserve.textContent = ''; }
    if (this._lastRel !== false) { this._lastRel = false; this.el.reloading.textContent = ''; }
    if (this._lastTally !== -1) { this.el.tally.innerHTML = ''; this._lastTally = -1; }
  }
  setMoney(val) {
    if (this.el.money) this.el.money.textContent = '$' + val;
    if (this.el.bmWallet) this.el.bmWallet.textContent = '$' + val;
  }
  flashMoney(diff, reason = '') {
    if (!this.el.mflash) return;
    const d = document.createElement('div');
    d.className = 'm-item ' + (diff >= 0 ? 'pos' : 'neg');
    d.innerHTML = (diff >= 0 ? '+$' : '-$') + Math.abs(diff) + (reason ? ` <small>${reason}</small>` : '');
    this.el.mflash.appendChild(d);
    setTimeout(() => d.remove(), 1600);
  }
  setArmor(armor, maxArmor = 100) {
    if (!this.el.armorfill || !this.el.armornum) return;
    const f = Math.max(0, Math.min(1, armor / maxArmor));
    this.el.armorfill.style.width = (f * 100).toFixed(1) + '%';
    this.el.armornum.textContent = Math.ceil(armor);
  }
  toggleBuyMenu(forceState, player = null) {
    const open = forceState !== undefined ? forceState : this.el.buymenu.hidden;
    this.el.buymenu.hidden = !open;
    if (open && player) {
      this.setMoney(player.money);
      this.setArmor(player.armor, player.maxArmor);
      // Atualiza botões da loja
      const cards = this.el.buymenu.querySelectorAll('.bm-card');
      cards.forEach((card) => {
        const k = card.dataset.buy;
        const btn = card.querySelector('.bm-action');
        if (!btn) return;
        if (k === 'shotgun' && player.weapons[1] && player.weapons[1].owned) btn.textContent = 'Munição ($600)';
        else if (k === 'rifle' && player.weapons[2] && player.weapons[2].owned) btn.textContent = 'Munição ($900)';
        else if (k === 'sniper' && player.weapons[3] && player.weapons[3].owned) btn.textContent = 'Munição ($1200)';
        else if (k === 'bazooka' && player.weapons[4] && player.weapons[4].owned) btn.textContent = 'Foguetes ($1800)';
        else if (k === 'armor_heavy' && player.armor >= 100) btn.textContent = 'Colete Máximo';
        else btn.textContent = 'Comprar';
      });
    }
    return open;
  }
  setSlots(slots) {
    const key = slots.map((s) => `${s.name}|${s.active ? 1 : 0}|${s.ammo}|${s.locked ? 1 : 0}`).join(';'); if (key === this._lastSlots) return; this._lastSlots = key;
    this.el.slots.innerHTML = slots.map((s, i) => `<div class="slot${s.active ? ' active' : ''}${s.empty ? ' empty' : ''}${s.locked ? ' locked' : ''}" title="${s.name}${s.locked ? ' (bloqueada)' : ''}"><span class="num">${i + 1}</span><span class="sname">${s.name}</span><span class="sammo">${s.ammo}</span></div>`).join('');
  }
  setHealth(hp, max) {
    const hInt = Math.ceil(hp);
    if (hInt === this._lastHp && max === this._lastMaxHp) return;
    this._lastHp = hInt; this._lastMaxHp = max;
    const f = Math.max(0, hp / max);
    this.el.hpfill.style.width = (f * 100).toFixed(1) + '%';
    this.el.hpnum.textContent = hInt;
    this.root.classList.toggle('low', f < 0.3);
  }
  setBoard(html) { const on = !!html; this.el.board.hidden = !on; if (on && html !== this._lastBoard) { this._lastBoard = html; this.el.board.innerHTML = html; } else if (!on) this._lastBoard = ''; }
  setPvpScore(html) { const on = !!html; this.el.pvpscore.hidden = !on; if (on) this.el.pvpscore.innerHTML = html; this.el.wave.parentElement.hidden = on; this.el.left.parentElement.hidden = on; }
  setWave(n, left) { if (n !== this._lastWave) { this._lastWave = n; this.el.wave.textContent = n; } if (left !== this._lastLeft) { this._lastLeft = left; this.el.left.textContent = left; } }
  setModifier(text) { const v = text || ''; if (v === this._lastMod) return; this._lastMod = v; this.el.modifier.textContent = v; }
  setTimer(text) { const v = text || ''; if (v === this._lastTimer) return; this._lastTimer = v; this.el.timer.textContent = v; }
  setScore(score, combo) { if (score !== this._lastScore) { this._lastScore = score; this.el.score.textContent = score; } const c = combo > 1 ? 'Combo x' + combo : ''; if (c !== this._lastCombo) { this._lastCombo = c; this.el.combo.textContent = c; } }
  setWeapon(name, hint) { this.el.weapon.textContent = name; this.el.hint.textContent = hint || ''; }
  setBoss(name, frac) { if (frac == null) { this.el.bossbar.classList.remove('show'); return; } this.el.bossbar.classList.add('show'); this.el.bossname.textContent = name; this.el.bossfill.style.width = (Math.max(0, frac) * 100).toFixed(1) + '%'; }
  tip(text, dur = 5) { this.el.tip.innerHTML = text; this.el.tip.classList.add('show'); this._tipT = dur; }
  message(main, sub = '', dur = 2.2) { const m = this.el.msg; m.textContent = main; m.classList.remove('show'); void m.offsetWidth; m.classList.add('show'); this.el.msgsub.textContent = sub; this._msgT = dur; }
  kill(text, pts) {
    const d = document.createElement('div'); d.innerHTML = pts > 0 ? `${text} <span class="pts">+${pts}</span>` : text; this.el.killfeed.appendChild(d);
    setTimeout(() => d.remove(), 1700); while (this.el.killfeed.children.length > 6) this.el.killfeed.firstChild.remove();
  }
  damageFrom(angle) { const i = document.createElement('i'); i.style.transform = `rotate(${(angle * 180 / Math.PI).toFixed(1)}deg)`; this.el.dmg.appendChild(i); setTimeout(() => i.remove(), 1000); }
  showScreen(html) { this.el.panel.innerHTML = html; this.el.screen.classList.add('show'); }
  hideScreen() { this.el.screen.classList.remove('show'); }
  setGameplayVisible(v) { this.root.classList.toggle('nogame', !v); }
  update(dt) {
    if (this._msgT > 0) { this._msgT -= dt; if (this._msgT <= 0) { this.el.msg.classList.remove('show'); this.el.msgsub.textContent = ''; } }
    if (this._tipT > 0) { this._tipT -= dt; if (this._tipT <= 0) this.el.tip.classList.remove('show'); }
  }
}

export const KB_KEYS = { fire: 'LMB', aim: 'RMB', block: 'RMB', jump: 'Espaço', sprint: 'Shift', slide: 'C', dash: 'C', grapple: 'Q', melee: 'F', reload: 'R', grenade: 'G', focus: 'Ambos os botões (ou X)', next: 'Scroll', pause: 'Esc', confirm: 'Espaço', score: 'Tab' };
export const PAD_KEYS = { fire: 'R2', aim: 'L2', block: 'L2', jump: '✕', sprint: 'L3', slide: '○', dash: '○', grapple: 'L1', melee: 'R1', reload: '□', grenade: 'R3', focus: 'L2 + R2', next: '△', pause: 'Options', confirm: '✕', score: 'Create' };
export const CONTROLS_HTML = `
<div class="controls"><div class="ctl-col"><div class="ctl-title">Teclado e mouse</div><div class="ctl-group"><div class="ctl-gname">Movimento</div><div class="ctl"><span class="keys"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><span class="act">Mover</span></div><div class="ctl"><span class="keys"><kbd>Mouse</kbd></span><span class="act">Olhar</span></div><div class="ctl"><span class="keys"><kbd>Shift</kbd></span><span class="act">Correr</span></div><div class="ctl"><span class="keys"><kbd>Espaço</kbd></span><span class="act">Pular · na parede: pulo na parede · no ar: pulo duplo</span></div><div class="ctl"><span class="keys"><kbd>C</kbd> / <kbd>Ctrl</kbd></span><span class="act">Deslizar · no ar: investida</span></div><div class="ctl"><span class="keys"><kbd>Q</kbd> / <kbd>E</kbd></span><span class="act">Gancho · segure para puxar, pule para se lançar</span></div></div><div class="ctl-group"><div class="ctl-gname">Combate</div><div class="ctl"><span class="keys"><kbd>Clique esq.</kbd></span><span class="act">Atirar / cortar</span></div><div class="ctl"><span class="keys"><kbd>Clique dir.</kbd></span><span class="act">Mirar / bloquear</span></div><div class="ctl"><span class="keys"><kbd>R</kbd></span><span class="act">Recarregar</span></div><div class="ctl"><span class="keys"><kbd>F</kbd></span><span class="act">Golpe rápido de katana</span></div><div class="ctl"><span class="keys"><kbd>G</kbd></span><span class="act">Granada · segure para ir mais longe</span></div><div class="ctl"><span class="keys"><kbd>X</kbd></span><span class="act">Corte Foco (barra cheia)</span></div><div class="ctl"><span class="keys"><kbd>1</kbd>–<kbd>8</kbd> / <kbd>Scroll</kbd></span><span class="act">Trocar de arma</span></div></div><div class="ctl-group"><div class="ctl-gname">Geral</div><div class="ctl"><span class="keys"><kbd>B</kbd></span><span class="act">Loja de armas</span></div><div class="ctl"><span class="keys"><kbd>Tab</kbd></span><span class="act">Placar (online)</span></div><div class="ctl"><span class="keys"><kbd>M</kbd></span><span class="act">Música</span></div><div class="ctl"><span class="keys"><kbd>Esc</kbd></span><span class="act">Pausa</span></div></div></div><div class="ctl-col"><div class="ctl-title">Controle (PS5 / padrão)</div><div class="ctl-group"><div class="ctl-gname">Movimento</div><div class="ctl"><span class="keys"><kbd>L</kbd></span><span class="act">Mover</span></div><div class="ctl"><span class="keys"><kbd>R</kbd></span><span class="act">Olhar</span></div><div class="ctl"><span class="keys"><kbd>L3</kbd></span><span class="act">Correr</span></div><div class="ctl"><span class="keys"><kbd>✕</kbd></span><span class="act">Pular</span></div><div class="ctl"><span class="keys"><kbd>○</kbd></span><span class="act">Deslizar · investida</span></div><div class="ctl"><span class="keys"><kbd>L1</kbd></span><span class="act">Gancho</span></div></div><div class="ctl-group"><div class="ctl-gname">Combate</div><div class="ctl"><span class="keys"><kbd>R2</kbd></span><span class="act">Atirar / cortar</span></div><div class="ctl"><span class="keys"><kbd>L2</kbd></span><span class="act">Mirar / bloquear</span></div><div class="ctl"><span class="keys"><kbd>□</kbd></span><span class="act">Recarregar</span></div><div class="ctl"><span class="keys"><kbd>R1</kbd></span><span class="act">Golpe de katana</span></div><div class="ctl"><span class="keys"><kbd>R3</kbd></span><span class="act">Granada</span></div><div class="ctl"><span class="keys"><kbd>L2</kbd>+<kbd>R2</kbd></span><span class="act">Corte Foco</span></div><div class="ctl"><span class="keys"><kbd>△</kbd></span><span class="act">Próxima arma</span></div></div><div class="ctl-group"><div class="ctl-gname">Geral</div><div class="ctl"><span class="keys"><kbd>D-Pad ↓</kbd></span><span class="act">Loja</span></div><div class="ctl"><span class="keys"><kbd>Create</kbd></span><span class="act">Placar (online)</span></div><div class="ctl"><span class="keys"><kbd>Options</kbd></span><span class="act">Pausa</span></div></div></div></div>`;
