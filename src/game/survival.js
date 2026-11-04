// Solo survival mode: the wave director (roster, modifiers, spawning), item pickups, and the
// katana "focus" execution dash. These three systems only matter in solo play and lean on each
// other (waves drop pickups, kills charge focus), so they live together behind one factory.
// main.js wires the returned functions into its loop, kill callback and net handlers.
import * as THREE from 'three';
import { makeInkMaterial, INK } from '../render.js';
import { rand, choose, clamp } from '../util.js';
import { audio } from '../audio.js';
import { BOSSES } from '../enemies/index.js';

export function createSurvival(ctx, deps) {
  const { world, hud, effects, input, game, player, enemies, scene, camera } = ctx;
  const { net, online, getCheckpoint, setCheckpoint } = deps;

  // ---------------- pickups ----------------
  const pickups = []; let pickupId = 1;
  const pmat = { ammo: makeInkMaterial({ ink: INK.BLUE }), health: makeInkMaterial({ ink: INK.GREEN }), cap: makeInkMaterial({ ink: INK.BLACK }), shell: makeInkMaterial({ ink: INK.ORANGE }) };
  function makePickup(kind) {
    const g = new THREE.Group();
    if (kind.startsWith('drop_')) {
      const wk = kind.replace('drop_', '');
      const gunMesh = new THREE.Group();
      if (wk === 'shotgun') {
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.7), pmat.cap);
        const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6), pmat.ammo);
        b2.rotation.x = Math.PI / 2; b2.position.set(0, 0.08, 0.3);
        gunMesh.add(b1, b2);
      } else if (wk === 'smg') {
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.42), pmat.cap);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.08), pmat.ammo);
        mag.position.set(0, -0.14, 0);
        gunMesh.add(b1, mag);
      } else if (wk === 'laser') {
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.14, 0.58), pmat.shell);
        const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.2, 6), pmat.ammo);
        cell.position.set(0, -0.12, -0.05);
        gunMesh.add(b1, cell);
      } else if (wk === 'rifle') {
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.6), pmat.cap);
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.12), pmat.ammo);
        mag.position.set(0, -0.12, 0.1);
        gunMesh.add(b1, mag);
      } else if (wk === 'sniper') {
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.8), pmat.cap);
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 6), pmat.shell);
        scope.rotation.x = Math.PI / 2; scope.position.set(0, 0.12, 0);
        gunMesh.add(b1, scope);
      } else if (wk === 'bazooka') {
        const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 8), pmat.ammo);
        tube.rotation.x = Math.PI / 2;
        gunMesh.add(tube);
      }
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 4, 12), pmat.ammo);
      ring.rotation.x = Math.PI / 2; ring.position.y = -0.18;
      gunMesh.add(ring);
      g.add(gunMesh);
      return g;
    }
    if (kind === 'ammo') { g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.24, 0.5, 10), pmat.ammo)); const c = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8), pmat.cap); c.position.y = 0.33; g.add(c); const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.02), pmat.cap); l.position.set(0, 0, 0.24); g.add(l); }
    else if (ctx.level.key === 'mexico') { const sh = new THREE.CylinderGeometry(0.42, 0.42, 0.22, 12, 1, false, 0, Math.PI); sh.rotateZ(Math.PI / 2); sh.rotateX(-Math.PI / 2); g.add(new THREE.Mesh(sh, pmat.shell)); const f = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.1, 0.2), pmat.health); f.position.y = 0.02; g.add(f); const m = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.08, 0.14), pmat.cap); m.position.y = 0.1; g.add(m); }
    else { g.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.2), pmat.health), new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), pmat.health)); }
    return g;
  }
  function spawnPickup(kind, pos, id = null) {
    const m = makePickup(kind); m.position.copy(pos); m.position.y += 0.6; scene.add(m);
    const p = { id: id ?? pickupId++, kind, mesh: m, base: m.position.y, t: rand(0, 6), life: 45 }; pickups.push(p);
    if (net.isHost) net.send('pickup', { id: p.id, kind, pos: pos.toArray() });
    return p;
  }
  function removePickup(p) { scene.remove(p.mesh); const i = pickups.indexOf(p); if (i >= 0) pickups.splice(i, 1); }
  function collectPickup(p) {
    if (p.kind.startsWith('drop_')) {
      const wk = p.kind.replace('drop_', '');
      const wNames = { shotgun: 'Escopeta', smg: 'Submetralhadora SMG', rifle: 'Rifle de Assalto', sniper: 'Rifle de Precisão', laser: 'Fuzil de Plasma Laser', bazooka: 'Lança-Foguetes' };
      const w = player.weapons.find((x) => x.kind === wk);
      if (w) {
        w.owned = true;
        if (w.isGun) {
          w.reserve = Math.max(w.reserve, w.maxReserve);
          w.mag = w.magSize;
        }
        hud.kill('Arma Coletada: ' + (wNames[wk] || wk), 0);
        hud.message('Arma Adquirida!', wNames[wk] || wk, 1.8);
      }
      audio.switchWeapon();
      effects.strokeBurst(p.mesh.position, INK.BLUE, 16, 5, { life: 0.35 });
      return;
    }
    if (p.kind === 'ammo') { player.addAmmoAll(0.4); player.grenades = Math.min(player.maxGrenades, player.grenades + 1); hud.kill('+MUNIÇÃO · +GRANADA', 0); } else { player.hp = Math.min(player.maxHp, player.hp + 35); hud.kill(ctx.level.key === 'mexico' ? 'Taco · +35 Vida' : '+35 Vida', 0); }
    audio.pickup(); effects.strokeBurst(p.mesh.position, p.kind === 'ammo' ? INK.BLUE : INK.GREEN, 12, 4, { life: 0.3 });
  }
  function updatePickups(dt) {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i]; p.t += dt; p.mesh.position.y = p.base + Math.sin(p.t * 2.5) * 0.12; p.mesh.rotation.y += dt * 1.8;
      if (player.alive && p.mesh.position.distanceTo(player.center) < 1.5) {
        collectPickup(p); removePickup(p);
        if (net.active) net.send(net.isHost ? 'taken' : 'take', { id: p.id });
        continue;
      }
      if (!net.active || net.isHost) { p.life -= dt; if (p.life <= 0) { removePickup(p); if (net.isHost) net.send('taken', { id: p.id }); } }
    }
  }
  let pickupClock = 0;
  function updateArenaPickups(dt) {
    if (!net.isHost) return; pickupClock -= dt;
    if (pickupClock <= 0 && pickups.length < 10) { pickupClock = 7; spawnPickup('ammo', choose(ctx.level.pickups)); }
  }
  function clearPickups() { for (const p of pickups) scene.remove(p.mesh); pickups.length = 0; pickupClock = 0; }

  // ---------------- solo waves ----------------
  const ROSTER = [
    { t: 'grunt', from: 1, w: 10 },
    { t: 'rusher', from: 2, w: 6 },
    { t: 'hound', from: 2, w: 5 },
    { t: 'bomber', from: 3, w: 3 },
    { t: 'bat', from: 3, w: 4 },
    { t: 'sniper', from: 3, w: 4 },
    { t: 'flyer', from: 4, w: 4 },
    { t: 'spider', from: 4, w: 4 },
    { t: 'heavy', from: 5, w: 4 },
    { t: 'shield', from: 6, w: 4 },
    { t: 'elitesniper', from: 6, w: 3 },
  ];
  const MODIFIERS = [
    { name: '', apply: () => { enemies.mods.speed = 1; enemies.mods.damage = 1; } },
    { name: 'Cafeína · Movimento mais rápido', apply: () => { enemies.mods.speed = 1.35; enemies.mods.damage = 0.85; } },
    { name: 'Tinta Pesada · Inimigos causam mais dano', apply: () => { enemies.mods.speed = 0.9; enemies.mods.damage = 1.4; } },
    { name: 'Enxame · Mais inimigos, mais frágeis', apply: () => { enemies.mods.speed = 1.15; enemies.mods.damage = 0.9; } },
  ];
  const tips = () => [
    `Segure <b>${hud.key('grapple')}</b> para puxar a corda · Pressione para soltar`,
    `Use <b>${hud.key('block')}</b> para bloquear e rebater tiros`,
    'Eliminações aéreas valem mais pontos · Tente ficar no ar',
    `<b>${hud.key('grenade')}</b> lança granada · Colete itens para repor`,
    `No ar pressione <b>${hud.key('jump')}</b> para pulo duplo`,
  ];
  const bossFor = (n) => BOSSES[(Math.floor(n / 5) - 1) % BOSSES.length];
  const enemyName = (t) => ({ boss: 'O Desenhista', eraser: 'A Borracha', inkblot: 'A Mancha de Tinta' })[t] || t.toUpperCase();
  function startWave(n) {
    game.wave = n; game.queue = []; game.spawnT = 2; game.intermission = 0; game.boss = null; hud.setBoss(null, null);
    const boss = n > 0 && n % 5 === 0;
    const allowed = boss || n < 4 ? 1 : n < 6 ? 3 : MODIFIERS.length; const mod = MODIFIERS[Math.floor(Math.random() * allowed)];
    mod.apply(); enemies.mods.damage *= 1.2; hud.setModifier(mod.name);
    const swarm = mod.name.startsWith('Enxame');
    // the crowd on screen and the wave size both keep growing with the wave number
    game.maxAlive = Math.min(4 + Math.floor(n * 0.9) + (swarm ? 3 : 0), (swarm ? 22 : 18) + Math.floor(n / 3));
    let count = Math.round(Math.min(5 + n * 2.0, 32 + n) * (swarm ? 1.35 : 1));
    if (boss) { count = 7 + n; game.maxAlive += 2 + Math.floor(n / 5); game.queue.push(bossFor(n)); }
    const pool = ROSTER.filter((r) => n >= r.from).map((r) => ({ t: r.t, w: r.w * Math.min(1, 0.3 + 0.25 * (n - r.from)) }));
    const total = pool.reduce((a, r) => a + r.w, 0);
    for (let i = 0; i < count; i++) { let r = Math.random() * total, t = pool[0].t; for (const c of pool) { r -= c.w; if (r <= 0) { t = c.t; break; } } game.queue.push(t); }
    if (boss) { hud.message('Onda ' + n, enemyName(bossFor(n)) + ' está se aproximando', 3); audio.bossRoar(player.center); }
    else hud.message('Onda ' + n, n === 1 ? 'Eles estão surgindo do papel' : mod.name || choose(['Desenhe com mais força', 'Continue rabiscando', 'Não fique no chão', 'Use a lâmina', 'Rebata os tiros']), 2.6);
    audio.wave();
    if (n <= tips().length) hud.tip(tips()[n - 1], 7);
    player.grenades = Math.min(player.maxGrenades, player.grenades + 1);
    for (let i = 0; i < 7; i++) spawnPickup(i < 5 ? 'ammo' : 'health', choose(ctx.level.pickups));
    const checkpoint = getCheckpoint();
    if (n >= 5 && n % 5 === 0 && n > checkpoint) { setCheckpoint(n); hud.kill('Ponto de Controle · Onda ' + n, 0); }
    if (net.active && net.isHost) net.send('ewave', { wave: n, name: boss ? enemyName(bossFor(n)) : (mod.name || '') });
  }
  function pickSpawn(type) {
    const level = ctx.level;
    const spots = (type === 'sniper' || type === 'elitesniper') ? (level.snipers && level.snipers.length ? level.snipers : level.spawns) : level.spawns; const pp = player.body.pos;
    if (type === 'flyer' || type === 'bat') { const a = Math.random() * Math.PI * 2, r = 22 + Math.random() * 10; return new THREE.Vector3(clamp(pp.x + Math.cos(a) * r, level.bounds.minX + 4, level.bounds.maxX - 4), pp.y + 12 + Math.random() * 6, clamp(pp.z + Math.sin(a) * r, level.bounds.minZ + 4, level.bounds.maxZ - 4)); }
    if (BOSSES.includes(type)) {
      const fits = (sp) => !world.overlapsAABB({ x: sp.x - 1.1, y: sp.y + 0.1, z: sp.z - 1.1 }, { x: sp.x + 1.1, y: sp.y + 5.2, z: sp.z + 1.1 });
      const open = spots.filter((sp) => fits(sp)); const far = open.filter((sp) => sp.distanceTo(pp) > 20);
      if (far.length) return choose(far).clone(); if (open.length) return choose(open).clone();
      for (let i = 0; i < 200; i++) { const a = Math.random() * Math.PI * 2, r = 22 + Math.random() * 18; const c = new THREE.Vector3(clamp(pp.x + Math.cos(a) * r, -44, 44), 0, clamp(pp.z + Math.sin(a) * r, -44, 44)); c.y = world.groundBelow(c.x, 30, c.z, 40); if (c.y > -3 && fits(c)) return c; }
      return level.playerStart.clone();
    }
    let cands = spots.filter((s) => { const d = s.distanceTo(pp); return d > 14 && d < 48; });
    if (cands.length < 2) cands = spots.filter((s) => s.distanceTo(pp) > 14);
    const hidden = cands.filter((s) => !world.hasLineOfSight(player.eye, new THREE.Vector3(s.x, s.y + 1.2, s.z)));
    return (choose(hidden.length ? hidden : cands.length ? cands : spots)).clone();
  }
  function updateWaves(dt) {
    if (game.intermission > 0) {
      game.intermission -= dt; hud.setTimer('Próxima onda em ' + Math.ceil(game.intermission) + 's');
      if (game.intermission <= 0) { hud.setTimer(''); startWave(game.wave + 1); }
      return;
    }
    const aliveWaveCount = enemies.waveAlive !== undefined ? enemies.waveAlive : enemies.alive;
    if (game.queue.length && aliveWaveCount < game.maxAlive) {
      game.spawnT -= dt;
      if (game.spawnT <= 0) {
        game.spawnT = Math.max(0.7, 2.9 - game.wave * 0.13); const t = game.queue.shift(); const e = enemies.spawn(t, pickSpawn(t));
        if (e.T.boss) { const mul = 1 + 0.35 * Math.floor((game.wave - 5) / 15); e.hp = e.maxHp = Math.round(e.T.hp * mul); }
      }
    }
    if (!game.queue.length && aliveWaveCount === 0) {
      game.intermission = 8; hud.message('Onda ' + game.wave + ' Concluída', 'Respire um pouco · +' + 200 * game.wave + ' pts', 2.5);
      game.addScore(200 * game.wave, null); audio.waveClear(); player.hp = Math.min(player.maxHp, player.hp + 40); player.addCash(300 + 50 * game.wave, 'Onda Concluída');
      if (net.active && net.isHost) net.send('ewaveclear', { wave: game.wave });
    }
    hud.setWave(game.wave, aliveWaveCount + game.queue.length);
  }

  // ---------------- focus slash (solo only) ----------------
  const FOCUS_TIME = 2.6, FOCUS_SCALE = 0.26, FOCUS_RANGE = 24, FOCUS_MAX_CHAIN = 2, FOCUS_ARM = 0.18, DASH_SPEED = 46, KATANA_CHARGE_KILLS = 3;
  const _fv = new THREE.Vector3();
  function focusCandidate() {
    let best = null, bestScore = -1;
    for (const e of enemies.enemies) {
      if (!e.alive || e.state === 'spawn') continue;
      _fv.subVectors(e.center, player.eye); const d = _fv.length(); if (d > FOCUS_RANGE || d < 0.5) continue;
      const aim = _fv.divideScalar(d).dot(player.forward); if (aim < 0.4) continue;
      if (!world.hasLineOfSight(player.eye, e.center)) continue;
      const score = aim * 3 - d / FOCUS_RANGE; if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }
  function enterFocus() {
    if (online() || game.focus.chain >= FOCUS_MAX_CHAIN || !focusCandidate()) return;
    const fresh = !game.focus.active;
    game.focus.active = true; game.focus.t = FOCUS_TIME; game.focus.chain++; game.focus.arm = FOCUS_ARM; game.focus.ready = false;
    if (fresh) { audio.focusIn(); hud.tip(`<b>Corte Foco Pronto</b> · Segure ${hud.key('focus')} para avançar`, 2.2); }
  }
  function endFocus() { if (!game.focus.active && !game.focus.dash) return; game.focus.active = false; game.focus.target = null; game.focus.chain = 0; game.focus.dash = null; game.katanaStreak = 0; player.dashLock = false; hud.setFocusMark(null); }
  function startFocusDash(target) { game.focus.dash = { target, t: 0, trail: player.center.clone(), lastTrail: 0 }; player.dashLock = true; player.body.vel.set(0, 0, 0); audio.dash(); player.kickFov(5); input.rumble(0.5, 0.4, 120); hud.setFocusMark(null); }
  function marchBody(b, nx, nz, dist) {
    let moved = 0;
    for (let step = Math.min(0.22, dist); moved + 1e-4 < dist;) { const s2 = Math.min(step, dist - moved); b.pos.x += nx * s2; b.pos.z += nz * s2; if (world.overlapsBody(b)) { b.pos.y += 0.65; if (world.overlapsBody(b)) { b.pos.y -= 0.65; b.pos.x -= nx * s2; b.pos.z -= nz * s2; return moved; } } moved += s2; }
    return moved;
  }
  function updateFocusDash(dt) {
    const d = game.focus.dash; if (!d) return true;
    const target = d.target; d.t += dt;
    if (!target.alive || d.t > 1.2) { endDash(false); return true; }
    const b = player.body; const dx = target.body.pos.x - b.pos.x, dz = target.body.pos.z - b.pos.z; const flat = Math.hypot(dx, dz); const nx = dx / (flat || 1), nz = dz / (flat || 1);
    player.yaw = Math.atan2(-dx, -dz); _fv.subVectors(target.center, player.eye); player.pitch = clamp(Math.atan2(_fv.y, Math.hypot(_fv.x, _fv.z)), -1.2, 1.2);
    const want = Math.max(0, flat - 1.1); const moved = marchBody(b, nx, nz, Math.min(DASH_SPEED * dt, want));
    const aimY = target.body.pos.y + (target.T.flying ? 0.2 : 0); const dy = aimY - b.pos.y;
    if (Math.abs(dy) > 0.05) { const y = b.pos.y; b.pos.y += clamp(dy, -DASH_SPEED * dt, DASH_SPEED * dt); if (world.overlapsBody(b)) { b.pos.y = y; d.stuckY = (d.stuckY || 0) + dt; } else d.stuckY = 0; }
    d.lastTrail += dt; if (d.lastTrail > 0.02) { d.lastTrail = 0; effects.tracer(d.trail, player.center, INK.BLUE, 0.045, 0.28); d.trail.copy(player.center); effects.strokeBurst(player.center, INK.BLUE, 2, 5, { life: 0.22, size: 0.03 }); }
    const reach = Math.hypot(flat, Math.max(0, Math.abs(dy) - 0.6));
    if (reach <= 1.5) { focusExecute(target); return true; }
    if (moved < 1e-4 && want > 0.05 && (d.stuckY || 0) > 0.08) { endDash(true); return true; }
    return false;
  }
  function endDash(blocked) { player.dashLock = false; game.focus.dash = null; player.body.vel.set(0, 0, 0); if (blocked) { player.weapons[player.katanaIndex].startSlash(player._weaponState(false, false, 0)); audio.katanaSwing(); hud.tip('Bloqueado · Investida interrompida', 1.2); } }
  function focusExecute(target) {
    player.dashLock = false; game.focus.dash = null; player.body.vel.set(0, 0, 0);
    player.weapons[player.katanaIndex].startSlash(player._weaponState(false, false, 0));
    _fv.subVectors(target.center, player.eye); const dir = _fv.clone().normalize(); const chainBefore = game.focus.chain;
    enemies.damage(target, 100000, { point: target.center.clone(), dir, part: 'head', source: 'focus', crit: true });
    audio.focusSlash(); game.hitstop(0.1, 0.08); effects.shakeAmt += 0.35; input.rumble(0.9, 0.7, 140); player.kickFov(6); player.hp = Math.min(player.maxHp, player.hp + 6);
    if (game.focus.chain === chainBefore) game.focus.t = Math.min(game.focus.t, 0.35);
    game.focus.target = null; hud.setFocusMark(null);
  }
  function updateFocus(dt) {
    const f = game.focus; if (!f.active) return;
    if (f.dash) { updateFocusDash(dt); return; }
    f.t -= dt; f.arm -= dt; if (f.t <= 0 || !player.alive) { endFocus(); return; }
    const combo = (input.down('aim') && input.down('fire')) || input.down('dash'); if (!combo) f.ready = true;
    const target = focusCandidate(); f.target = target;
    if (!target) { hud.setFocusMark(null); return; }
    _fv.copy(target.center).project(camera);
    if (_fv.z < 1) hud.setFocusMark((_fv.x * 0.5 + 0.5) * window.innerWidth, (-_fv.y * 0.5 + 0.5) * window.innerHeight); else hud.setFocusMark(null);
    if (combo && f.ready && f.arm <= 0) { input.consume('fire'); startFocusDash(target); }
  }

  return {
    pickups, spawnPickup, removePickup, collectPickup, updatePickups, updateArenaPickups, clearPickups,
    startWave, updateWaves, pickSpawn,
    focusCandidate, enterFocus, endFocus, updateFocus,
    FOCUS_SCALE, KATANA_CHARGE_KILLS,
  };
}
