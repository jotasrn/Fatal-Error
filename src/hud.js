// DOM heads-up display drawn in "pen" style (multiplied over the paper canvas).
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
      <div class="hud-tl"><div class="score">Pontos <b id="score">0</b></div><div class="money">Dinheiro <b id="money">$300</b></div><div class="money-flash" id="mflash"></div><div class="combo" id="combo"></div></div>
      <div class="hud-tr"><div class="wave">Onda <b id="wave">1</b></div><div class="modifier" id="modifier"></div><div class="left"><b id="left">0</b> inimigos restantes</div><div class="timer" id="timer"></div><div class="pvpscore" id="pvpscore" hidden></div></div><div class="board" id="board" hidden></div>
      <div class="bossbar" id="bossbar"><div class="bossname" id="bossname"></div><div class="bar big"><div class="fill red" id="bossfill"></div></div></div>
      <div class="hud-bl">
        <div class="health"><span>Vida</span><div class="bar"><div class="fill" id="hpfill"></div></div><span id="hpnum">100</span></div>
        <div class="armor"><span>Colete</span><div class="bar"><div class="fill armor" id="armorfill"></div></div><span id="armornum">0</span></div>
        <div class="ammo"><b id="mag">30</b><span id="reserve">/120</span><span class="reloading" id="reloading"></span><span class="nades" id="nades" title="Granadas"></span></div>
        <div class="tally" id="tally"></div>
      </div>
      <div class="hud-br"><div class="slots" id="slots"></div><div class="weapon" id="weapon">Rifle</div><div class="hint" id="hint"></div></div>
      <div class="tip" id="tip"></div>
      <div class="message"><div class="msg-main" id="msg"></div><div class="msg-sub" id="msgsub"></div></div>
      <div class="killfeed" id="killfeed"></div>
      <div class="screen" id="screen"><div class="panel" id="panel"></div></div>
      <div class="buymenu" id="buymenu" hidden>
        <div class="bm-box">
          <div class="bm-header">
            <div class="bm-title">LOJA DO CADERNO</div>
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
              <div class="bm-card" data-buy="rifle">
                <div class="bm-c-top"><span class="bm-c-name">Rifle de Assalto (Slot 3)</span><span class="bm-c-price">$900</span></div>
                <div class="bm-c-desc">Disparo totalmente automático · 35 balas · Mira ágil</div>
                <button type="button" class="bm-action">Comprar</button>
              </div>
              <div class="bm-card" data-buy="sniper">
                <div class="bm-c-top"><span class="bm-c-name">Sniper (Slot 4)</span><span class="bm-c-price">$1200</span></div>
                <div class="bm-c-desc">Mira telescópica · Um tiro, uma eliminação garantida</div>
                <button type="button" class="bm-action">Comprar</button>
              </div>
              <div class="bm-card" data-buy="bazooka">
                <div class="bm-c-top"><span class="bm-c-name">Bazuca (Slot 5)</span><span class="bm-c-price">$1800</span></div>
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
            <span>Pressione <b>B</b> ou clique no botão para fechar a Loja</span>
            <button type="button" class="bm-close-btn" id="bmCloseBtn">Voltar ao Jogo [B]</button>
          </div>
        </div>
      </div>`;
    const q = (id) => root.querySelector('#' + id);
    this.el = { crosshair: q('crosshair'), gret: q('gret'), hitmarker: q('hitmarker'), dmg: q('dmg'), score: q('score'), money: q('money'), mflash: q('mflash'), armorfill: q('armorfill'), armornum: q('armornum'), buymenu: q('buymenu'), bmWallet: q('bm-wallet-amt'), bmClose: q('bmCloseBtn'), combo: q('combo'), wave: q('wave'), modifier: q('modifier'), left: q('left'), timer: q('timer'), hpfill: q('hpfill'), hpnum: q('hpnum'), mag: q('mag'), reserve: q('reserve'), reloading: q('reloading'), tally: q('tally'), weapon: q('weapon'), hint: q('hint'), slots: q('slots'), tip: q('tip'), msg: q('msg'), msgsub: q('msgsub'), killfeed: q('killfeed'), screen: q('screen'), panel: q('panel'), nades: q('nades'), scope: q('scope'), focusmark: q('focusmark'), focusmeter: q('focusmeter'), fmfill: q('fmfill'), bossbar: q('bossbar'), bossname: q('bossname'), bossfill: q('bossfill'), pvpscore: q('pvpscore'), board: q('board'), gstam: q('gstam'), gstamfill: q('gstamfill') };
    this._msgT = 0; this._scope = false; this._nades = -1; this._pad = false; this.onDevice = null; this._fmShow = false; this._fmFrac = -1; this._fmReady = false; this._lastTally = -1; this._lastSlots = ''; this._ads = false; this._mode = ''; this.onScreenClick = null; this._tipT = 0;
    this.el.screen.addEventListener('click', () => { if (this.onScreenClick) this.onScreenClick(); });
    this.onBuy = null;
    this.el.buymenu.querySelectorAll('.bm-card').forEach((card) => {
      const btn = card.querySelector('.bm-action');
      const itemKey = card.dataset.buy;
      if (btn) btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (this.onBuy) this.onBuy(itemKey);
      });
    });
    this.el.bmClose.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.toggleBuyMenu(false);
    });
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
  setSpread(px) { this.el.crosshair.style.setProperty('--s', px.toFixed(1) + 'px'); }
  setCrosshairMode(mode) { this._mode = mode; this._applyCross(); }
  setAds(on) { if (on === this._ads) return; this._ads = on; this._applyCross(); }
  _applyCross() { this.el.crosshair.className = 'crosshair ' + this._mode + (this._ads ? ' ads' : ''); }
  setGrappleStamina(f) { const show = f < 0.995; if (this.el.gstam.hidden === show) this.el.gstam.hidden = !show; if (show) { this.el.gstamfill.style.width = (f * 100).toFixed(0) + '%'; this.el.gstam.classList.toggle('low', f < 0.2); } }
  grappleTarget(state) { this.el.gret.className = 'grapple-ret' + (state === 1 ? ' on' : state === 2 ? ' on attached' : ''); }
  hitmarker(kill = false, crit = false) { const h = this.el.hitmarker; h.className = 'hitmarker' + (kill ? ' kill' : '') + (crit ? ' crit' : ''); void h.offsetWidth; h.classList.add('show'); }
  setAmmo(mag, reserve, magSize, reloading = false) {
    this.el.mag.textContent = mag; this.el.reserve.textContent = '/' + reserve; this.el.reloading.textContent = reloading ? ' Recarregando…' : '';
    if (mag !== this._lastTally) { this._lastTally = mag; let s = ''; for (let i = 0; i < Math.min(mag, 40); i++) s += '<i></i>'; this.el.tally.innerHTML = s; }
  }
  setKatana() { this.el.mag.textContent = '∞'; this.el.reserve.textContent = ''; this.el.reloading.textContent = ''; if (this._lastTally !== -1) { this.el.tally.innerHTML = ''; this._lastTally = -1; } }
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
    this.el.slots.innerHTML = slots.map((s, i) => `<div class="slot${s.active ? ' active' : ''}${s.empty ? ' empty' : ''}${s.locked ? ' locked' : ''}"><span class="num">${i + 1}</span>${s.locked ? '🔒 ' : ''}${s.name}<span class="sammo">${s.ammo}</span></div>`).join('');
  }
  setHealth(hp, max) { const f = Math.max(0, hp / max); this.el.hpfill.style.width = (f * 100).toFixed(1) + '%'; this.el.hpnum.textContent = Math.ceil(hp); this.root.classList.toggle('low', f < 0.3); }
  setBoard(html) { const on = !!html; this.el.board.hidden = !on; if (on) this.el.board.innerHTML = html; }
  setPvpScore(html) { const on = !!html; this.el.pvpscore.hidden = !on; if (on) this.el.pvpscore.innerHTML = html; this.el.wave.parentElement.hidden = on; this.el.left.parentElement.hidden = on; }
  setWave(n, left) { this.el.wave.textContent = n; this.el.left.textContent = left; }
  setModifier(text) { this.el.modifier.textContent = text || ''; }
  setTimer(text) { this.el.timer.textContent = text || ''; }
  setScore(score, combo) { this.el.score.textContent = score; this.el.combo.textContent = combo > 1 ? 'Combo x' + combo : ''; }
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
<div class="cols">
  <div><div class="colhead">Teclado + Mouse</div>
    <div><b>WASD</b> Mover &nbsp; <b>Mouse</b> Olhar &nbsp; <b>Shift</b> Correr</div>
    <div><b>LMB</b> Atirar / Cortar &nbsp; <b>RMB</b> Mirar / Bloquear</div>
    <div><b>Espaço</b> Pular (na parede = Pulo na Parede)</div>
    <div>No ar pressione <b>Espaço</b> = Pulo Duplo</div>
    <div><b>C / Ctrl</b> Deslizar no chão · Investida no ar</div>
    <div><b>Q / E</b> Gancho: clique para balançar, segure para puxar, pule para se lançar</div>
    <div><b>F</b> Golpe rápido de Katana &nbsp; <b>R</b> Recarregar &nbsp; <b>M</b> Música</div>
    <div><b>G</b> Granada · Segure para arremessar mais longe</div>
    <div><b>Tab</b> Placar (Online) &nbsp; <b>Esc</b> Pausa</div>
    <div><b>Ambos os botões</b> Corte Foco com barra cheia (ou tecla X)</div>
    <div><b>1-6 / Scroll</b> Revólver · Escopeta · Rifle · Sniper · Bazuca · Katana</div>
    <div><b>B</b> Loja / Comprar Armas, Coletes e Munição</div>
  </div>
  <div><div class="colhead">Controle PS5 / Padrão</div>
    <div><b>Analógico L</b> Mover &nbsp; <b>Analógico R</b> Olhar &nbsp; <b>L3</b> Correr</div>
    <div><b>R2</b> Atirar / Cortar &nbsp; <b>L2</b> Mirar / Bloquear</div>
    <div><b>✕</b> Pular &nbsp; <b>○</b> Deslizar · Investida no ar</div>
    <div><b>L1</b> Gancho (segure para puxar, ✕ para se lançar)</div>
    <div><b>L2 + R2</b> Corte Foco com barra cheia</div>
    <div><b>R1</b> Golpe rápido de Katana e volta para a arma</div>
    <div><b>□</b> Recarregar &nbsp; <b>△</b> Próxima arma</div>
    <div><b>R3 / D-Pad Cima</b> Granada · Segure para arremessar longe</div>
    <div><b>D-Pad Baixo</b> Loja / Comprar Armas & Coletes</div>
    <div><b>Create</b> Placar (Online) &nbsp; <b>Options</b> Pausa</div>
  </div>
</div>`;
