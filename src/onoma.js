// Comic onomatopoeia ("POW!", "KABOOM!") that pop over kills and explosions in the HQ style.
// Plain DOM text projected from world space each frame; at most a handful live at once.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const KILL = ['POW!', 'BAM!', 'WHAM!', 'KAPOW!', 'THWACK!', 'SOC!'];
const COLORS = ['#ffd23f', '#ff5a3c', '#5ad1ff', '#ff7ad9', '#9dff5a'];

export class Onoma {
  constructor(parent, camera) { this.parent = parent; this.camera = camera; this.list = []; this.enabled = true; }
  pop(text, pos, size = 1) {
    if (!this.enabled || !pos) return;
    if (this.list.length >= 6) { const o = this.list.shift(); o.el.remove(); }
    const el = document.createElement('div'); el.className = 'onoma'; el.textContent = text;
    el.style.setProperty('--c', COLORS[Math.floor(Math.random() * COLORS.length)]);
    el.style.setProperty('--r', (Math.random() * 24 - 12).toFixed(1) + 'deg');
    el.style.setProperty('--s', String(size)); this.parent.appendChild(el);
    this.list.push({ el, pos: pos.clone().add(_v.set(0, 0.6, 0)), t: 0 });
  }
  kill(pos, crit) { this.pop(crit ? 'CRACK!' : KILL[Math.floor(Math.random() * KILL.length)], pos, crit ? 1.15 : 1); }
  update(dt) {
    if (!this.list.length) return;
    const w = window.innerWidth, h = window.innerHeight;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i]; o.t += dt;
      if (o.t > 0.9) { o.el.remove(); this.list.splice(i, 1); continue; }
      _v.copy(o.pos); _v.y += o.t * 0.8; _v.project(this.camera);
      if (_v.z > 1) { o.el.style.display = 'none'; continue; }
      o.el.style.display = ''; o.el.style.left = ((_v.x * 0.5 + 0.5) * w).toFixed(0) + 'px'; o.el.style.top = ((-_v.y * 0.5 + 0.5) * h).toFixed(0) + 'px';
      o.el.style.opacity = o.t > 0.65 ? String(1 - (o.t - 0.65) / 0.25) : '1';
    }
  }
  clear() { for (const o of this.list) o.el.remove(); this.list.length = 0; }
}
