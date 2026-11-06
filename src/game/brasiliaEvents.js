// Eventos de Brasília: rodízio entre a manifestação (já existente), o 8 de Janeiro (invasores com a
// camisa da seleção quebrando a Praça dos Três Poderes e atacando todo mundo) e o 7 de Setembro
// (desfile na Esplanada; dois aviões da esquadrilha perdem o controle e caem na Torre de TV e no "H"
// do Congresso). O host decide quando cada evento acontece e cria os bots; o voo dos aviões, as
// explosões e o fogo rodam iguais em todos os PCs a partir da mensagem 'bevent'.
import * as THREE from 'three';
import { makeInkMaterial, INK } from '../render.js';
import { rand, choose, TAU } from '../util.js';
import { audio } from '../audio.js';

const ORDER = ['manif', '8jan', '7set'];
const _v = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

export function createBrasiliaEvents(ctx, deps) {
  const { scene, enemies, hud, effects, player } = ctx;
  const { net, online, manifest, snap } = deps;
  let timer = 55, idx = 0, active = null, activeT = 0;
  let show = null; // 7 de setembro em andamento (visual, em todos os PCs)
  const fires = [];
  let propCache = null, propLevel = null;

  // ---------------- materiais / malhas compartilhadas ----------------
  const M = {
    body: makeInkMaterial({ ink: INK.BLUE, fill: true, side: THREE.DoubleSide }),
    wing: makeInkMaterial({ ink: INK.BLACK, side: THREE.DoubleSide }),
    accent: makeInkMaterial({ ink: INK.ORANGE, fill: true }),
    fireA: makeInkMaterial({ ink: INK.ORANGE, fill: true }),
    fireB: makeInkMaterial({ ink: INK.RED, fill: true }),
    junk: makeInkMaterial({ ink: INK.BLACK, fill: true }),
  };
  // A-29 da esquadrilha: fuselagem, hélice, asa baixa e empenagem
  function makePlane() {
    const g = new THREE.Group();
    const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.32, 7.5, 8).rotateX(Math.PI / 2), M.body); g.add(fus);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.2, 8).rotateX(Math.PI / 2).translate(0, 0, 4.3), M.accent); g.add(nose);
    const can = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6).scale(0.8, 0.7, 2.2).translate(0, 0.45, 0.8), M.wing); g.add(can);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.18, 1.8).translate(0, -0.25, 0.4), M.wing));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 1.0).translate(0, 0.1, -3.3), M.wing));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.6, 1.2).translate(0, 0.8, -3.3), M.body));
    for (const sx of [-1, 1]) g.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 1.7).translate(sx * 5, -0.18, 0.4), M.accent));
    g.scale.setScalar(1.35); scene.add(g); return g;
  }
  // fumaça colorida (verde, amarela e azul) num único InstancedMesh
  const PUFFS = 360, puffMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 7, 5), makeInkMaterial({ ink: INK.BLACK, fill: true }), PUFFS);
  puffMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PUFFS * 3), 3); puffMesh.frustumCulled = false; puffMesh.count = 0;
  puffMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(puffMesh);
  const puffs = []; let puffHead = 0;
  for (let i = 0; i < PUFFS; i++) puffs.push({ p: new THREE.Vector3(), t: 99, life: 1, r: 1, ink: 0, fill: 1 });
  const puff = (p, ink, fill, life = 4, r = 1.1) => { const q = puffs[puffHead]; puffHead = (puffHead + 1) % PUFFS; q.p.copy(p); q.t = 0; q.life = life; q.r = r; q.ink = ink; q.fill = fill; };

  // ---------------- fogo ----------------
  function addFire(pos, radius, dur, dps) {
    const g = new THREE.Group(); g.position.copy(pos);
    for (let i = 0; i < 5; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(radius * rand(0.25, 0.45), radius * rand(0.9, 1.6), 6), i % 2 ? M.fireA : M.fireB); c.position.set(rand(-radius, radius) * 0.6, 0, rand(-radius, radius) * 0.6); c.userData.ph = rand(0, TAU); g.add(c); }
    scene.add(g); fires.push({ g, pos: pos.clone(), radius, t: 0, dur, dps, hurtT: 0 });
  }
  function clearVisuals() {
    for (const f of fires) { scene.remove(f.g); f.g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
    fires.length = 0;
    if (show) { for (const pl of show.planes) scene.remove(pl.g); show = null; }
    for (const q of puffs) q.t = 99; puffMesh.count = 0; ctx.panicAt = null;
  }

  // ---------------- explosão de queda (dano local + bots no host) ----------------
  function crash(pos) {
    effects.explosion(pos, 9, INK.BLACK); effects.explosion(_v.copy(pos).add(_d.set(rand(-3, 3), -2, rand(-3, 3))), 6, INK.ORANGE);
    audio.explosion(pos); audio.explosion(_v.copy(pos).add(_d.set(0, -6, 0)));
    for (let i = 0; i < 26; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(rand(0.3, 1.2), rand(0.2, 0.6), rand(0.3, 1.4)), i % 3 ? M.junk : M.body); m.position.copy(pos); scene.add(m); effects.debris(m, m.position, new THREE.Vector3(rand(-14, 14), rand(-2, 10), rand(-14, 14)), new THREE.Vector3(rand(-9, 9), rand(-9, 9), rand(-9, 9)), { radius: 0.4, blood: false, life: rand(8, 12) }); }
    for (let i = 0; i < 18; i++) puff(_v.copy(pos).add(_d.set(rand(-4, 4), rand(-2, 4), rand(-4, 4))), INK.BLACK, 1, rand(6, 10), rand(1.8, 3.2));
    // fogo no ponto de impacto e onde caem os destroços
    addFire(pos.clone().add(_d.set(0, -1, 0)), 3.5, 30, 0);
    const w = ctx.world;
    for (let i = 0; i < 4; i++) {
      const x = pos.x + rand(-14, 14), z = pos.z + rand(-14, 14), y = w.groundBelow ? w.groundBelow(x, pos.y, z, 120) : 0;
      if (y > -20) addFire(new THREE.Vector3(x, y, z), 2.6, 28, 12);
    }
    ctx.panicAt = new THREE.Vector3(pos.x, 0, pos.z);
    // dano: jogador local de cada PC; bots só no host
    const pd = player.body.pos.distanceTo(pos);
    if (player.alive && pd < 20) { player.takeDamage(Math.round(90 * (1 - pd / 20)), pos); _d.subVectors(player.body.pos, pos).setY(0.6).normalize(); player.knockback(_d, 14 * (1 - pd / 20)); }
    if (!online() || net.isHost) for (const e of enemies.enemies) {
      if (!e.alive || e.T.isPet) continue; const d = e.center.distanceTo(pos); if (d > 20) continue;
      enemies.damage(e, 160 * (1 - d / 20), { source: 'event', point: e.center.clone(), dir: _d.subVectors(e.center, pos).normalize().clone(), part: 'torso' });
    }
  }

  // ---------------- 7 de Setembro: o voo ----------------
  const TORRE = new THREE.Vector3(0, 60, -316), H = new THREE.Vector3(5.5, 34, 195);
  function startShow() {
    if (show) for (const pl of show.planes) scene.remove(pl.g);
    const planes = [];
    const offs = [[0, 0], [-7, -6], [7, -6], [-14, -12], [14, -12], [-21, -18], [21, -18]];
    for (let i = 0; i < offs.length; i++) planes.push({ g: makePlane(), ox: offs[i][0], oz: offs[i][1], role: i === 1 ? 'torre' : i === 2 ? 'h' : 'pass', done: false, spin: 0, ink: [INK.GREEN, INK.ORANGE, INK.BLUE][i % 3] });
    show = { t: 0, planes, puffT: 0, msgA: false, msgB: false };
  }
  const SPEED = 46, Z0 = -600, ALT = 48;
  function planeAt(pl, t, out) {
    const zf = Z0 + SPEED * t; // posição do líder
    out.set(pl.ox, ALT + Math.sin(t * 0.7 + pl.ox) * 0.6, zf + pl.oz);
    if (pl.role === 'torre') { // perde o controle perto da torre e mergulha no mirante alto
      const t0 = (TORRE.z - 95 - Z0 - pl.oz) / SPEED, t1 = t0 + 2.6;
      if (t > t0) { const f = Math.min(1, (t - t0) / (t1 - t0)); const ease = f * f; _v.set(pl.ox, ALT, Z0 + SPEED * t0 + pl.oz); out.lerpVectors(_v, TORRE, ease); out.x += Math.sin(f * 9) * 4 * (1 - f); out.z = THREE.MathUtils.lerp(_v.z, TORRE.z, f); }
      return t > t1;
    }
    if (pl.role === 'h') { // segue o Eixo e despenca no "H" do Congresso
      const t0 = (H.z - 150 - Z0 - pl.oz) / SPEED, t1 = t0 + 4.2;
      if (t > t0) { const f = Math.min(1, (t - t0) / (t1 - t0)); _v.set(pl.ox, ALT, Z0 + SPEED * t0 + pl.oz); out.set(THREE.MathUtils.lerp(_v.x, H.x, f) + Math.sin(f * 12) * 3 * (1 - f), THREE.MathUtils.lerp(_v.y, H.y, f * f), THREE.MathUtils.lerp(_v.z, H.z, f)); }
      return t > t1;
    }
    // o resto da esquadrilha arremete depois da Torre e some no céu
    const tUp = (-260 - Z0) / SPEED; if (t > tUp) out.y += (t - tUp) * (t - tUp) * 2.2;
    return out.y > 260;
  }
  function updateShow(dt) {
    const S = show; S.t += dt; S.puffT -= dt; const emit = S.puffT <= 0; if (emit) S.puffT = 0.06;
    let alive = 0;
    for (const pl of S.planes) {
      if (pl.done) continue; alive++;
      const prev = _s.copy(pl.g.position); const hit = planeAt(pl, S.t, pl.g.position);
      _d.subVectors(pl.g.position, prev); if (_d.lengthSq() > 1e-6) { _m.lookAt(prev, pl.g.position, THREE.Object3D.DEFAULT_UP); _q.setFromRotationMatrix(_m); pl.g.quaternion.copy(_q); pl.g.rotateY(Math.PI); }
      const falling = pl.role !== 'pass' && pl.g.position.y < ALT - 2;
      if (falling) { pl.spin += dt * 9; pl.g.rotateZ(pl.spin); }
      if (emit) puff(_v.copy(pl.g.position).addScaledVector(_d.normalize(), -4), falling ? INK.BLACK : pl.ink, falling ? 1 : 0, falling ? 7 : 4.5, falling ? 1.6 : 1.1);
      if (hit) {
        pl.done = true; scene.remove(pl.g);
        if (pl.role !== 'pass') {
          crash(pl.g.position.clone());
          if (pl.role === 'torre') hud.message('✈️ ACIDENTE NO DESFILE!', 'Um avião da esquadrilha caiu na Torre de TV!', 4);
          else hud.message('✈️ OUTRO AVIÃO CAIU!', 'Explosão no "H" do Congresso Nacional · Caos na Esplanada!', 4.5);
          if (!online() || net.isHost) deps.onCrash && deps.onCrash(pl.g.position.clone());
        }
      }
    }
    if (!alive) { show = null; setTimeout(() => { if (!show) ctx.panicAt = null; }, 15000); }
  }

  // ---------------- 8 de Janeiro (host) ----------------
  function start8jan() {
    const k = deps.crowd ? deps.crowd() : 1;
    const n = Math.round(12 * Math.min(2.4, k));
    for (let i = 0; i < n; i++) {
      const kind = i % 9 === 0 ? 'invasor_lider' : i % 3 === 1 ? 'invasor_vandalo' : 'invasor';
      const e = enemies.spawn(kind, snap(new THREE.Vector3(rand(-40, 40), 0, rand(196, 238)))); e.state = 'hunt';
    }
    for (const [x, z, kind] of [[-8, 128, 'police'], [8, 128, 'police'], [0, 124, 'police_chief'], [-30, 150, 'police_tactical'], [30, 150, 'police_tactical']]) { const p = enemies.spawn(kind, snap(new THREE.Vector3(x, 0, z))); p.state = 'hunt'; }
    audio.siren(new THREE.Vector3(0, 0, 200));
    say8jan();
    if (net.active && net.isHost) net.send('bevent', { k: '8jan' });
  }
  const say8jan = () => hud.message('🇧🇷 8 DE JANEIRO!', 'Invasores tomaram a Praça dos Três Poderes: estão quebrando tudo e atacando qualquer um!', 5);

  // ---------------- 7 de Setembro (host) ----------------
  function start7set() {
    const k = deps.crowd ? deps.crowd() : 1;
    const n = Math.round(12 * Math.min(2, k));
    for (let i = 0; i < n; i++) { const s = i % 2 ? 1 : -1; const e = enemies.spawn(i % 4 === 3 ? 'civilian' : 'espectador', snap(new THREE.Vector3(s * rand(42, 46), 0, rand(-70, 80)))); e.state = 'hunt'; }
    for (const [x, z] of [[-44, -40], [44, 0], [-44, 40]]) { const p = enemies.spawn('police', snap(new THREE.Vector3(x, 0, z))); p.state = 'hunt'; }
    say7set(); startShow();
    if (net.active && net.isHost) net.send('bevent', { k: '7set' });
  }
  const say7set = () => hud.message('🇧🇷 7 DE SETEMBRO', 'Desfile da Independência na Esplanada · Olhe a esquadrilha no céu!', 4.5);

  return {
    reset() { clearVisuals(); timer = 55; idx = 0; active = null; activeT = 0; },
    // só o host (ou solo) decide os eventos
    hostTick(dt) {
      if (active) {
        activeT += dt;
        const left = active === '8jan' ? enemies.enemies.some((e) => e.alive && e.T.isRioter) : active === '7set' ? !!show : false;
        if ((!left && activeT > 8) || activeT > 140) { active = null; timer = 70; }
        return;
      }
      timer -= dt; if (timer > 0) return;
      const kind = ORDER[idx++ % ORDER.length]; active = kind; activeT = 0;
      if (kind === 'manif') { const aliveProt = enemies.enemies.filter((e) => e.alive && e.T.isProtester).length; if (aliveProt < 3) manifest(); active = null; timer = 75; }
      else if (kind === '8jan') start8jan();
      else start7set();
    },
    // visual e dano do fogo: roda em todos os PCs
    update(dt) {
      if (show) updateShow(dt);
      // fumaça
      let n = 0;
      for (const q of puffs) {
        if (q.t >= q.life) continue; q.t += dt; if (q.t >= q.life) continue;
        const f = q.t / q.life, r = q.r * (0.6 + f * 1.6); q.p.y += dt * 0.6;
        _m.compose(q.p, _q.identity(), _s.set(r, r, r)); puffMesh.setMatrixAt(n, _m); puffMesh.instanceColor.setXYZ(n, q.ink, q.fill, 0); n++;
      }
      puffMesh.count = n; if (n) { puffMesh.instanceMatrix.needsUpdate = true; puffMesh.instanceColor.needsUpdate = true; }
      // fogo
      for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i]; f.t += dt;
        const fade = Math.min(1, (f.dur - f.t) / 3);
        f.g.children.forEach((c, j) => { const s = (0.75 + Math.sin(f.t * 9 + c.userData.ph) * 0.25) * Math.max(0, fade); c.scale.set(s, s * (1 + 0.3 * Math.sin(f.t * 13 + j)), s); });
        if (Math.random() < dt * 4) puff(_v.copy(f.pos).add(_d.set(rand(-1, 1), f.radius, rand(-1, 1))), INK.BLACK, 1, 5, f.radius * 0.5);
        if (f.dps > 0) {
          f.hurtT -= dt;
          if (f.hurtT <= 0) {
            f.hurtT = 0.5;
            const pp = player.body.pos;
            if (player.alive && Math.hypot(pp.x - f.pos.x, pp.z - f.pos.z) < f.radius && Math.abs(pp.y - f.pos.y) < 2.5) player.takeDamage(f.dps * 0.5, f.pos);
            if (!online() || net.isHost) for (const e of enemies.enemies) if (e.alive && !e.T.isPet && Math.hypot(e.body.pos.x - f.pos.x, e.body.pos.z - f.pos.z) < f.radius && Math.abs(e.body.pos.y - f.pos.y) < 2.5) enemies.damage(e, f.dps * 0.5, { source: 'event', point: e.center.clone(), part: 'torso' });
          }
        }
        if (f.t >= f.dur) { scene.remove(f.g); f.g.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); fires.splice(i, 1); }
      }
    },
    onNet(d) {
      if (!d || typeof d.k !== 'string') return;
      if (d.k === '8jan') say8jan();
      else if (d.k === '7set') { say7set(); startShow(); }
    },
    // as vidraças e gradis viram "alvos" que os invasores vão quebrar
    rioterProps() {
      const level = ctx.level;
      if (propLevel !== level) {
        propLevel = level;
        propCache = level.breakables.filter((br) => br.civic).map((br) => ({
          isProp: true, br, get alive() { return br.alive; },
          body: { pos: new THREE.Vector3(br.pos.x, br.box ? br.box.min.y : 0, br.pos.z) }, center: br.pos,
          takeDamage(dmg, from) { if (ctx.breakHit) ctx.breakHit(br, dmg * 2, br.pos.clone(), from ? _d.subVectors(br.pos, from).normalize().clone() : null); },
        }));
      }
      return propCache;
    },
    // dispara um evento na hora (usado em testes / atalhos de debug)
    force(kind) { active = kind; activeT = 0; if (kind === '8jan') start8jan(); else if (kind === '7set') start7set(); else { manifest(); active = null; } },
    clear: clearVisuals,
    get busy() { return !!active; },
  };
}
