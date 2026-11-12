// Minimap: a round radar in the corner, centred on the player and turning with the view (forward is
// always up). The map layer is drawn once per level from the collision boxes (taller = darker);
// bots, players and the player's arrow are drawn on top ~20 times a second.
const R_PX = 92, VIEW_M = 75; // radar radius in pixels and how many metres it shows to the edge

export class Minimap {
  constructor(parent) {
    this.canvas = document.createElement('canvas'); this.canvas.className = 'minimap';
    this.canvas.width = R_PX * 2; this.canvas.height = R_PX * 2; parent.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d'); this.layer = null; this.k = 1; this.b = null; this.t = 0;
    this.enabled = localStorage.getItem('fatal_minimap') !== '0'; this.canvas.hidden = !this.enabled;
  }
  setEnabled(on) { this.enabled = on; this.canvas.hidden = !on; try { localStorage.getItem('fatal_minimap'); localStorage.setItem('fatal_minimap', on ? '1' : '0'); } catch (e) { /* ignore */ } }
  setLevel(level, world) {
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
  }
}
