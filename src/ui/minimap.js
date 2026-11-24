// Minimap: a round radar in the corner, centred on the player and turning with the view (forward is
// always up). The map layer is drawn once per level from the collision boxes (taller = darker);
// bots, players and the player's arrow are drawn on top ~20 times a second.
const R_PX = 92, VIEW_M = 75; // radar radius in pixels and how many metres it shows to the edge

export class Minimap {
  constructor(parent) {
    this.canvas = document.createElement('canvas'); this.canvas.className = 'minimap';
    this.canvas.width = R_PX * 2; this.canvas.height = R_PX * 2; parent.appendChild(this.canvas);
    this.canvas.title = 'Clique para ver o mapa completo [M]';
    this.canvas.addEventListener('click', (e) => { e.stopPropagation(); this.toggleFullMap(); });
    this.g = this.canvas.getContext('2d'); this.layer = null; this.k = 1; this.b = null; this.t = 0;
    this.enabled = localStorage.getItem('fatal_minimap') !== '0'; this.canvas.hidden = !this.enabled;
    this.level = null;
    this.parent = parent;
    this.modal = parent.querySelector('#fullmapModal');
    this.fmCanvas = parent.querySelector('#fullmapCanvas');
    this.fmCoords = parent.querySelector('#fmCoords');
    this.fmCtx = this.fmCanvas ? this.fmCanvas.getContext('2d') : null;
    this.fullmapOpen = false;
    this.onToggleFullMap = null;
    const closeBtn = parent.querySelector('#fmCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.toggleFullMap(false); });
    const mapHint = parent.querySelector('#mapHintBtn');
    if (mapHint) mapHint.addEventListener('click', (e) => { e.stopPropagation(); this.toggleFullMap(); });
    if (this.modal) this.modal.addEventListener('click', (e) => { if (e.target === this.modal) this.toggleFullMap(false); });
  }
  toggleFullMap(forceState) {
    this.fullmapOpen = forceState !== undefined ? forceState : !this.fullmapOpen;
    if (this.modal) this.modal.hidden = !this.fullmapOpen;
    if (this.onToggleFullMap) this.onToggleFullMap(this.fullmapOpen);
    return this.fullmapOpen;
  }
  setEnabled(on) { this.enabled = on; this.canvas.hidden = !on; try { localStorage.setItem('fatal_minimap', on ? '1' : '0'); } catch (e) { /* ignore */ } }
  setLevel(level, world) {
    this.level = level;
    this._fmStatic = null;
    const b = level.bounds; this.b = b;
    const w = b.maxX - b.minX, h = b.maxZ - b.minZ; this.k = Math.min(1.6, 1024 / Math.max(w, h));
    const c = document.createElement('canvas'); c.width = Math.ceil(w * this.k); c.height = Math.ceil(h * this.k);
    const g = c.getContext('2d'); g.fillStyle = '#e9efe0'; g.fillRect(0, 0, c.width, c.height);
    if (level.drawMinimap) level.drawMinimap(g, b, this.k); // mapas com vias reais desenham o traçado antes dos prédios
    const boxes = [...world.boxes].filter((x) => x.max.y - x.min.y > 0.9 && x.min.y < 40 && (x.max.x - x.min.x) < w + 1 && (x.max.z - x.min.z) < h + 1).sort((p, q) => p.max.y - q.max.y);
    for (const x of boxes) {
      const ht = Math.min(1, x.max.y / 26);
      const v = Math.round(200 - ht * 150); g.fillStyle = `rgb(${v},${v + 4},${v + 14})`;
      g.fillRect((x.min.x - b.minX) * this.k, (x.min.z - b.minZ) * this.k, Math.max(1, (x.max.x - x.min.x) * this.k), Math.max(1, (x.max.z - x.min.z) * this.k));
    }
    this.layer = c;
  }
  // throttled: call every frame, it repaints at ~20 Hz
  update(dt, player, enemies, remotes, markers = null) {
    if (!this.enabled || !this.layer || !player) return;
    this.t -= dt; if (this.t > 0) return; this.t = 0.05;
    const g = this.g, s = R_PX / VIEW_M, b = this.b, px = player.body.pos.x, pz = player.body.pos.z;
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, R_PX * 2, R_PX * 2);
    g.save(); g.beginPath(); g.arc(R_PX, R_PX, R_PX - 3, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#cfd8c4'; g.fillRect(0, 0, R_PX * 2, R_PX * 2);
    g.translate(R_PX, R_PX); g.rotate(player.yaw); g.scale(s, s);
    const k = this.k, cx = (px - b.minX) * k, cz = (pz - b.minZ) * k, radPx = Math.ceil(VIEW_M * 1.15 * k);
    const sx = Math.max(0, Math.floor(cx - radPx)), sy = Math.max(0, Math.floor(cz - radPx));
    const sw = Math.min(this.layer.width, Math.ceil(cx + radPx)) - sx;
    const sh = Math.min(this.layer.height, Math.ceil(cz + radPx)) - sy;
    if (sw > 0 && sh > 0) g.drawImage(this.layer, sx, sy, sw, sh, (sx - cx) / k, (sy - cz) / k, sw / k, sh / k);
    const dot = (x, z, r, fill) => { g.beginPath(); g.arc(x - px, z - pz, r / s, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.lineWidth = 1.2 / s; g.strokeStyle = '#111'; g.stroke(); };
    const lim = VIEW_M * 1.5;
    for (const e of enemies) {
      if (!e.alive || !e.body) continue; const ex = e.body.pos.x, ez = e.body.pos.z;
      if (Math.abs(ex - px) > lim || Math.abs(ez - pz) > lim) continue;
      const T = e.T; const col = T.isPet ? '#f0a020' : T.isPolice ? '#2f6fe0' : T.isCivilian ? '#9a9a9a' : T.isProtester ? '#ff5a3c' : '#e3242b';
      dot(ex, ez, T.boss ? 6 : 3.4, col);
    }
    if (remotes) for (const r of remotes) { if (!r.alive || !r.root || r.away) continue; dot(r.body.pos.x, r.body.pos.z, 4.2, '#8a3ce0'); }
    // marcadores de missão / objetivos (com seta na borda quando estão longe)
    if (markers && markers.length) {
      for (const m of markers) {
        let dx = m.x - px, dz = m.z - pz;
        const dist = Math.hypot(dx, dz);
        const maxM = VIEW_M - 10 / s;
        if (dist > maxM) { dx = (dx / dist) * maxM; dz = (dz / dist) * maxM; }
        const sz = 6.2 / s;
        g.save();
        g.translate(dx, dz);
        g.rotate(Math.PI / 4);
        g.fillStyle = m.color || '#ffd23f';
        g.strokeStyle = '#111';
        g.lineWidth = 1.8 / s;
        g.fillRect(-sz / 2, -sz / 2, sz, sz);
        g.strokeRect(-sz / 2, -sz / 2, sz, sz);
        g.restore();
      }
    }
    g.restore();
    // the player: an arrow at the centre, always pointing up (the map turns instead)
    g.beginPath(); g.moveTo(R_PX, R_PX - 9); g.lineTo(R_PX + 6.5, R_PX + 7); g.lineTo(R_PX, R_PX + 3.5); g.lineTo(R_PX - 6.5, R_PX + 7); g.closePath();
    g.fillStyle = '#ffd23f'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#111'; g.stroke();
    // north marker riding the rim
    const a = player.yaw - Math.PI / 2; const nx = R_PX + Math.cos(a) * (R_PX - 12), ny = R_PX + Math.sin(a) * (R_PX - 12);
    g.font = 'bold 13px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = '#fff'; g.strokeText('N', nx, ny); g.fillStyle = '#111'; g.fillText('N', nx, ny);
    g.beginPath(); g.arc(R_PX, R_PX, R_PX - 3, 0, Math.PI * 2); g.lineWidth = 4; g.strokeStyle = '#111'; g.stroke();

    if (this.fullmapOpen) this.renderFullMap(player, enemies, remotes, markers);
  }

  _buildFullMapStatic(cw, ch) {
    const c = document.createElement('canvas'); c.width = cw; c.height = ch;
    const ctx = c.getContext('2d'), b = this.b;
    ctx.fillStyle = '#181f28';
    ctx.fillRect(0, 0, cw, ch);
    ctx.strokeStyle = '#263242';
    ctx.lineWidth = 1;
    for (let x = 0; x < cw; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, ch); ctx.stroke(); }
    for (let y = 0; y < ch; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(cw, y); ctx.stroke(); }

    const pad = 20;
    const scale = Math.min((cw - pad * 2) / this.layer.width, (ch - pad * 2) / this.layer.height);
    const ox = (cw - this.layer.width * scale) / 2;
    const oy = (ch - this.layer.height * scale) / 2;

    ctx.drawImage(this.layer, ox, oy, this.layer.width * scale, this.layer.height * scale);
    ctx.strokeStyle = '#3e4f66';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, this.layer.width * scale, this.layer.height * scale);

    const ICONS = {
      rodoviaria: '🚌 Rodoviária', torre: '🗼 Torre de TV', congresso: '🏛️ Congresso Nacional',
      catedral: '⛪ Catedral', museu: '🎨 Museu Nacional', esplanada: '🏢 Esplanada',
      praca3p: '⚖️ Praça 3 Poderes', asaNorte: '✈️ Asa Norte', asaSul: '✈️ Asa Sul',
      itamaraty: '🏛️ Itamaraty', justica: '⚖️ Min. Justiça', teatro: '🎭 Teatro Nacional'
    };
    if (this.level && this.level.landmarks) {
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      for (const key in this.level.landmarks) {
        const lm = this.level.landmarks[key];
        if (!lm || !lm.pos) continue;
        const mx = ox + (lm.pos.x - b.minX) * this.k * scale;
        const my = oy + (lm.pos.z - b.minZ) * this.k * scale;
        if (mx < ox || mx > ox + this.layer.width * scale || my < oy || my > oy + this.layer.height * scale) continue;
        const label = ICONS[key] || lm.name;
        if (!label) continue;
        ctx.beginPath(); ctx.arc(mx, my, 4, 0, Math.PI * 2); ctx.fillStyle = '#38bdf8'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#082f49'; ctx.stroke();
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        const tw = ctx.measureText(label).width + 8;
        ctx.fillRect(mx - tw / 2, my - 19, tw, 15);
        ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1; ctx.strokeRect(mx - tw / 2, my - 19, tw, 15);
        ctx.fillStyle = '#f8fafc'; ctx.fillText(label, mx, my - 7);
      }
    }
    this._fmStatic = { canvas: c, cw, ch, ox, oy, scale };
  }

  renderFullMap(player, enemies, remotes, markers) {
    if (!this.fmCtx || !this.layer || !this.b) return;
    const ctx = this.fmCtx, cv = this.fmCanvas, b = this.b;
    const cw = cv.width, ch = cv.height;
    if (!this._fmStatic || this._fmStatic.cw !== cw || this._fmStatic.ch !== ch) this._buildFullMapStatic(cw, ch);
    const { canvas: bg, ox, oy, scale } = this._fmStatic;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);

    const worldToMap = (wx, wz) => [ox + (wx - b.minX) * this.k * scale, oy + (wz - b.minZ) * this.k * scale];

    // Civis, inimigos, chefes e jogadores remotos
    if (enemies) {
      for (const e of enemies) {
        if (!e.alive || !e.body) continue;
        const [mx, my] = worldToMap(e.body.pos.x, e.body.pos.z);
        const T = e.T;
        const col = T.isPet ? '#f0a020' : T.isPolice ? '#2f6fe0' : T.isCivilian ? '#94a3b8' : T.isProtester ? '#ff5a3c' : '#ef4444';
        const r = T.boss ? 6 : T.isCivilian ? 2.5 : 3.4;
        ctx.beginPath(); ctx.arc(mx, my, r, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill();
        ctx.lineWidth = 1.2; ctx.strokeStyle = '#0f172a'; ctx.stroke();
      }
    }
    if (remotes) {
      for (const r of remotes) {
        if (!r.alive || !r.root || r.away || !r.body) continue;
        const [mx, my] = worldToMap(r.body.pos.x, r.body.pos.z);
        ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = '#a855f7'; ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = '#0f172a'; ctx.stroke();
      }
    }

    // Marcadores de missão / objetivos ativos
    if (markers && markers.length) {
      for (const m of markers) {
        const [mx, my] = worldToMap(m.x, m.z);
        const sz = 10;
        ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = m.color || '#eab308'; ctx.strokeStyle = '#111'; ctx.lineWidth = 2;
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz); ctx.strokeRect(-sz / 2, -sz / 2, sz, sz);
        ctx.restore();
        if (m.label) {
          ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#eab308';
          ctx.fillText(m.label, mx, my - 12);
        }
      }
    }

    // Jogador local com pulso e indicador direcional
    if (player && player.body) {
      const px = player.body.pos.x, pz = player.body.pos.z;
      const [mx, my] = worldToMap(px, pz);
      if (this.fmCoords) this.fmCoords.textContent = `Coordenadas: X: ${Math.round(px)} | Z: ${Math.round(pz)}`;
      const pulse = (performance.now() % 1200) / 1200;
      ctx.beginPath(); ctx.arc(mx, my, 8 + pulse * 14, 0, Math.PI * 2); ctx.strokeStyle = `rgba(250, 204, 21, ${1 - pulse})`; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath(); ctx.arc(mx, my, 6.5, 0, Math.PI * 2); ctx.fillStyle = '#facc15'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#000'; ctx.stroke();

      const yaw = player.yaw || 0;
      const dirX = Math.sin(-yaw), dirY = Math.cos(-yaw);
      ctx.beginPath();
      ctx.moveTo(mx + dirX * 15, my - dirY * 15);
      ctx.lineTo(mx + dirX * 5 + dirY * 5, my - dirY * 5 + dirX * 5);
      ctx.lineTo(mx + dirX * 5 - dirY * 5, my - dirY * 5 - dirX * 5);
      ctx.closePath();
      ctx.fillStyle = '#ef4444'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5; ctx.stroke();

      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)'; ctx.fillRect(mx - 18, my + 10, 36, 14);
      ctx.strokeStyle = '#facc15'; ctx.lineWidth = 1; ctx.strokeRect(mx - 18, my + 10, 36, 14);
      ctx.fillStyle = '#facc15'; ctx.fillText('VOCÊ', mx, my + 21);
    }
  }
}
